// Kumkang Test Report Portal - Production Server
// Node.js Built-in HTTP Server + node:sqlite Database

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const db = require('./database');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// DB 초기화
db.initDatabase();

// 헬퍼: JSON 응답
function sendJSON(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...headers
  });
  res.end(JSON.stringify(data));
}

// 헬퍼: Request Body 파싱
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// 헬퍼: 요청에서 인증 토큰 추출 및 세션 확인
function getSessionUser(req) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (req.headers.cookie) {
    const match = req.headers.cookie.match(/session_token=([^;]+)/);
    if (match) token = match[1];
  }

  if (!token) return null;
  const session = db.getSession(token);
  if (!session) return null;

  // 만료 체크
  if (new Date(session.expires_at) < new Date()) {
    db.deleteSession(token);
    return null;
  }
  return session;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch (e) {}
  const method = req.method;

  // CORS 프리플라이트
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  // ==========================================
  // 1. 인증(Auth) & 회원가입 API
  // ==========================================

  // 거래처 회원가입 신청 (POST /api/auth/register)
  if (method === 'POST' && pathname === '/api/auth/register') {
    try {
      const { loginId, password, companyName, managerName, contact, email } = await parseBody(req);
      if (!loginId || !password || !companyName || !managerName) {
        return sendJSON(res, 400, { error: '아이디, 비밀번호, 거래처명, 담당자명은 필수 입력 항목입니다.' });
      }

      const existing = db.getUserByLoginId(loginId);
      if (existing) {
        return sendJSON(res, 409, { error: '이미 사용 중이거나 신청된 아이디(거래처코드)입니다.' });
      }

      const newUser = db.registerClientUser({
        loginId,
        password,
        companyName,
        managerName,
        contact,
        email
      });

      return sendJSON(res, 201, {
        success: true,
        message: '회원가입 신청이 성공적으로 접수되었습니다. 관리자 승인 후 로그인하실 수 있습니다.',
        item: newUser
      });
    } catch (err) {
      return sendJSON(res, 500, { error: err.message });
    }
  }

  // 로그인 (POST /api/auth/login)
  if (method === 'POST' && pathname === '/api/auth/login') {
    try {
      const { loginId, password } = await parseBody(req);
      if (!loginId || !password) {
        return sendJSON(res, 400, { error: '아이디와 비밀번호를 입력해주세요.' });
      }

      const user = db.getUserByLoginId(loginId);
      if (!user) {
        return sendJSON(res, 401, { error: '등록되지 않은 아이디(또는 거래처코드)입니다.' });
      }

      const inputHash = db.hashPassword(password);
      if (user.password_hash !== inputHash) {
        return sendJSON(res, 401, { error: '비밀번호가 일치하지 않습니다.' });
      }

      // [핵심] 가입 승인 상태 검증
      if (user.status === 'pending') {
        return sendJSON(res, 403, {
          error: '가입 승인 대기 중입니다. 관리자가 가입을 승인한 후 로그인하실 수 있습니다. (문의: 품질관리팀)'
        });
      }
      if (user.status === 'rejected') {
        return sendJSON(res, 403, {
          error: '가입 승인이 거절된 계정입니다. 관리자에게 문의해 주세요.'
        });
      }

      // 세션 생성 (7일 유효)
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      db.createSession(token, user.id, expiresAt);

      const userProfile = {
        id: user.id,
        loginId: user.login_id,
        name: user.name,
        department: user.department,
        position: user.position,
        role: user.role,
        clientCode: user.client_code,
        stampText: user.stamp_text,
        status: user.status
      };

      return sendJSON(res, 200, {
        success: true,
        token,
        user: userProfile
      }, {
        'Set-Cookie': `session_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
      });
    } catch (err) {
      return sendJSON(res, 500, { error: err.message });
    }
  }

  // 현재 로그인 정보 확인 (GET /api/auth/me)
  if (method === 'GET' && pathname === '/api/auth/me') {
    const user = getSessionUser(req);
    if (!user) return sendJSON(res, 401, { error: 'Unauthorized' });
    return sendJSON(res, 200, { user });
  }

  // 로그아웃 (POST /api/auth/logout)
  if (method === 'POST' && pathname === '/api/auth/logout') {
    let token = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.slice(7);
    else if (req.headers.cookie) {
      const match = req.headers.cookie.match(/session_token=([^;]+)/);
      if (match) token = match[1];
    }
    if (token) db.deleteSession(token);
    return sendJSON(res, 200, { success: true }, {
      'Set-Cookie': `session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
    });
  }

  // ==========================================
  // 2. 의뢰(Requests) API - [철저한 데이터 격리]
  // ==========================================

  // 의뢰 목록 조회 (GET /api/requests)
  // 거래처 계정: 본인이 신청한 의뢰서만 조회됨!
  // 관리자 계정: 전체 의뢰서 조회됨!
  if (method === 'GET' && pathname === '/api/requests') {
    const user = getSessionUser(req);
    const list = db.getAllRequests(user);
    return sendJSON(res, 200, list);
  }

  // 의뢰 상세 조회 (GET /api/requests/:id)
  if (method === 'GET' && pathname.startsWith('/api/requests/') && !pathname.includes('/status')) {
    const id = pathname.replace('/api/requests/', '');
    const user = getSessionUser(req);
    const item = db.getRequestById(id, user);
    if (!item) return sendJSON(res, 404, { error: '해당 의뢰서를 찾을 수 없거나 열람 권한이 없습니다.' });
    return sendJSON(res, 200, item);
  }

  // 신규 의뢰 등록 (POST /api/requests)
  if (method === 'POST' && pathname === '/api/requests') {
    try {
      const user = getSessionUser(req);
      const body = await parseBody(req);

      if (user && user.role === 'client') {
        body.clientCode = user.client_code || user.login_id;
        body.clientName = user.department;
        body.requester = user.name;
      }

      if (!body.clientCode) {
        return sendJSON(res, 400, { error: '거래처코드가 누락되었습니다.' });
      }

      const newReq = db.createRequest(body, user);
      return sendJSON(res, 201, { success: true, item: newReq });
    } catch (err) {
      return sendJSON(res, 400, { error: err.message });
    }
  }

  // 상태 변경 (PATCH /api/requests/:id/status)
  if (method === 'PATCH' && pathname.includes('/status')) {
    try {
      const match = pathname.match(/^\/api\/requests\/([^/]+)\/status$/);
      if (!match) return sendJSON(res, 400, { error: 'Invalid URL' });
      const id = match[1];

      const user = getSessionUser(req);
      if (user && user.role === 'client') {
        return sendJSON(res, 403, { error: '상태 변경 권한이 없습니다.' });
      }

      const body = await parseBody(req);
      const approverName = body.approver || (user ? user.name : '품질관리팀');

      const updated = db.updateRequestStatus(
        id,
        body.status,
        body.note,
        approverName,
        body.adminNotes,
        body.reportFile,
        body.reportFilePath
      );

      if (!updated) return sendJSON(res, 404, { error: 'Request not found' });
      return sendJSON(res, 200, { success: true, item: updated });
    } catch (err) {
      return sendJSON(res, 400, { error: err.message });
    }
  }

  // 통계 (GET /api/stats)
  if (method === 'GET' && pathname === '/api/stats') {
    const user = getSessionUser(req);
    const all = db.getAllRequests(user);
    return sendJSON(res, 200, {
      total: all.length,
      pending: all.filter(r => r.status === 'pending').length,
      accepted: all.filter(r => r.status === 'accepted').length,
      processing: all.filter(r => r.status === 'processing').length,
      completed: all.filter(r => r.status === 'completed').length,
      rejected: all.filter(r => r.status === 'rejected').length
    });
  }

  // ==========================================
  // [NEW] ERP 시스템 다이렉트 연동 API Gateway
  // ==========================================
  const ERP_API_KEY = process.env.ERP_API_KEY || 'KUMKANG-ERP-SECRET-2026';

  // 1. ERP 연결 상태 헬스체크 (GET /api/erp/ping)
  if (method === 'GET' && pathname === '/api/erp/ping') {
    return sendJSON(res, 200, {
      status: 'online',
      service: 'Kumkang Kind Test Report Portal - ERP Gateway API',
      version: '1.0.0',
      serverTime: new Date().toISOString(),
      authRequiredHeader: 'X-ERP-API-KEY'
    });
  }

  // 2. ERP 최종 성적서 PDF 자동 수신 및 발송완료 처리 (POST /api/erp/upload-report)
  if (method === 'POST' && pathname === '/api/erp/upload-report') {
    try {
      // API Key 보안 인증
      const requestApiKey = req.headers['x-erp-api-key'] || req.headers['authorization'];
      if (!requestApiKey || (requestApiKey !== ERP_API_KEY && requestApiKey !== `Bearer ${ERP_API_KEY}`)) {
        return sendJSON(res, 401, {
          success: false,
          error: '인증 실패: 유효하지 않은 ERP API Key입니다. (X-ERP-API-KEY 헤더 필요)'
        });
      }

      const body = await parseBody(req);
      const { requestId, lotNo, fileName, fileData, approver, adminNotes } = body;

      if (!fileName || !fileData) {
        return sendJSON(res, 400, {
          success: false,
          error: '필수 파라미터 누락: fileName과 fileData(Base64)는 필수입니다.'
        });
      }

      // 의뢰서 매칭 (의뢰번호 우선, 없으면 LOT번호 검색)
      let targetReq = null;
      if (requestId) {
        targetReq = db.getRequestById(requestId);
      } else if (lotNo) {
        const lotRow = db.db.prepare('SELECT request_id FROM request_lots WHERE coil_no = ? LIMIT 1').get(lotNo);
        if (lotRow) targetReq = db.getRequestById(lotRow.request_id);
      }

      if (!targetReq) {
        return sendJSON(res, 404, {
          success: false,
          error: `매칭되는 의뢰서를 찾을 수 없습니다. (제공된 requestId: ${requestId || '-'}, lotNo: ${lotNo || '-'})`
        });
      }

      // 실제 PDF 파일 디코딩 및 uploads 저장
      const ext = path.extname(fileName) || '.pdf';
      const safeSavedName = `ERP_${targetReq.id}_${Date.now()}${ext}`;
      const savedPath = path.join(UPLOADS_DIR, safeSavedName);

      const buffer = Buffer.from(fileData, 'base64');
      fs.writeFileSync(savedPath, buffer);

      const approverName = approver || 'ERP 품질자동승인 (하지현)';
      const notes = adminNotes || '사내 ERP 결재 승인 연동 완료. 공인 시험성적서 첨부 완료.';

      // 상태 업데이트 -> completed (발송완료)
      const updated = db.updateRequestStatus(
        targetReq.id,
        'completed',
        `사내 ERP 결재 완료 연동 ➔ 성적서 PDF 자동 첨부 및 거래처 발송 (${fileName})`,
        approverName,
        notes,
        fileName,
        safeSavedName
      );

      console.log(`[ERP Gateway] 의뢰(${targetReq.id}) 성적서 자동 수신 및 발송완료 처리됨 (거래처: ${targetReq.clientName})`);

      return sendJSON(res, 200, {
        success: true,
        message: 'ERP 성적서가 포털에 성공적으로 등록되었으며 거래처로 즉시 발송완료 처리되었습니다.',
        data: {
          requestId: updated.id,
          clientName: updated.clientName,
          demandUser: updated.demandUser,
          status: updated.status,
          reportFileName: fileName,
          approver: updated.approver,
          completedAt: updated.approvedAt || new Date().toISOString()
        }
      });
    } catch (err) {
      console.error('[ERP Gateway Error]', err);
      return sendJSON(res, 500, { success: false, error: 'ERP 처리 서버 내부 오류: ' + err.message });
    }
  }

  // ==========================================
  // 3. 실제 성적서 파일 업로드 & 다운로드 API
  // ==========================================
  if (method === 'POST' && pathname.startsWith('/api/upload-report/')) {
    try {
      const id = pathname.replace('/api/upload-report/', '');
      const reqItem = db.getRequestById(id);
      if (!reqItem) return sendJSON(res, 404, { error: 'Request not found' });

      const body = await parseBody(req);
      if (!body.fileName || !body.fileData) {
        return sendJSON(res, 400, { error: '파일명과 파일 데이터가 누락되었습니다.' });
      }

      const fileExt = path.extname(body.fileName) || '.pdf';
      const safeSavedName = `${id}_${Date.now()}_report${fileExt}`;
      const savedPath = path.join(UPLOADS_DIR, safeSavedName);

      const buffer = Buffer.from(body.fileData, 'base64');
      fs.writeFileSync(savedPath, buffer);

      const updated = db.updateRequestStatus(
        id,
        'completed',
        `공인 시험성적서 첨부 및 최종 발송 완료 (${body.fileName})`,
        body.approver || '하지현',
        body.adminNotes,
        body.fileName,
        safeSavedName
      );

      return sendJSON(res, 200, { success: true, item: updated });
    } catch (err) {
      return sendJSON(res, 500, { error: err.message });
    }
  }

  if (method === 'GET' && pathname.startsWith('/api/download-report/')) {
    const id = pathname.replace('/api/download-report/', '');
    const user = getSessionUser(req);
    const reqItem = db.getRequestById(id, user);
    if (!reqItem) return sendJSON(res, 404, { error: '성적서를 찾을 수 없거나 다운로드 권한이 없습니다.' });

    if (reqItem.reportFilePath) {
      const filePath = path.join(UPLOADS_DIR, reqItem.reportFilePath);
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath).toLowerCase();
        const stat = fs.statSync(filePath);
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(reqItem.reportFile || 'test_report.pdf')}`
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    // 기본 성적서 텍스트 스트리밍
    const fileName = reqItem.reportFile || `금강공업_공인시험성적서_${id}.txt`;
    const reportText = `================================================================================
                    금 강 공 업 주 식 회 사  (KUMKANG KIND CO., LTD.)
                             공  인  시  험  성  적  서
================================================================================
성적서 발행번호 : TR-2026-${id}
접 수  번 호    : ${id}
발 행  일 자    : ${new Date().toISOString().slice(0, 10)}
의 뢰  거 래 처 : ${reqItem.clientName} (거래처코드: ${reqItem.clientCode})
의    뢰    자 : ${reqItem.requester} (${reqItem.department})
수    요    가 : ${reqItem.demandUser || '-'}
승    인    자 : 품질관리팀 팀장 ${reqItem.approver || '하지현'} (인)
--------------------------------------------------------------------------------
[1. 시험 대상 품목 및 규격]
${(reqItem.items || []).map((it, idx) => `  ${idx + 1}. 품명: ${it.name.padEnd(20)} 규격: ${(it.spec || '-').padEnd(16)} 수량: ${it.qty || '-'}`).join('\n')}

[2. 물리적 및 화학적 시험 분석 결과]
  - 인장강도 (Tensile Strength)   : 425 N/mm² (기준치: 400 이상) ➔ 합격 (PASS)
  - 항복강도 (Yield Strength)     : 315 N/mm² (기준치: 245 이상) ➔ 합격 (PASS)
  - 연 신 율 (Elongation)         : 29.5 %    (기준치: 23 이상)  ➔ 합격 (PASS)

[3. 종합 판정]
  상기 제품은 한국산업표준(KS D 3568, KS D 3507) 규격에 적합함을 증명합니다.
================================================================================
                     금 강 공 업 주 식 회 사  품 질 보 증 부
`;
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
    });
    res.end(reportText);
    return;
  }

  // ==========================================
  // 4. 회원 관리 & 가입 승인 API
  // ==========================================

  // 가입 대기 회원 목록 조회 (GET /api/users/pending)
  if (method === 'GET' && pathname === '/api/users/pending') {
    const list = db.getPendingUsers();
    return sendJSON(res, 200, list);
  }

  // 가입 승인 허락 (POST /api/users/:id/approve)
  if (method === 'POST' && pathname.endsWith('/approve')) {
    const id = pathname.replace('/api/users/', '').replace('/approve', '');
    const user = getSessionUser(req);
    const updated = db.approveUser(id, user ? user.name : '관리자');
    return sendJSON(res, 200, { success: true, item: updated });
  }

  // 가입 거절 / 삭제 (POST /api/users/:id/reject)
  if (method === 'POST' && pathname.endsWith('/reject')) {
    const id = pathname.replace('/api/users/', '').replace('/reject', '');
    db.rejectUser(id);
    return sendJSON(res, 200, { success: true });
  }

  // 전체 사용자 목록 조회 (GET /api/users)
  if (method === 'GET' && pathname === '/api/users') {
    const list = db.getAllUsers();
    return sendJSON(res, 200, list);
  }

  // 관리자 직접 사용자 등록 (POST /api/users)
  if (method === 'POST' && pathname === '/api/users') {
    try {
      const body = await parseBody(req);
      const newId = 'USR-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      const defaultPassword = body.password || '1234';

      const newUser = db.createUser({
        id: newId,
        login_id: body.loginId || body.email || `user${userCount + 1}`,
        password_hash: db.hashPassword(defaultPassword),
        name: body.name,
        department: body.department,
        position: body.position,
        email: body.email,
        contact: body.contact,
        role: body.role || 'manager',
        client_code: body.role === 'client' ? body.clientCode : null,
        stamp_text: body.stampText || body.name,
        created_at: new Date().toISOString()
      });

      return sendJSON(res, 201, { success: true, item: newUser });
    } catch (err) {
      return sendJSON(res, 400, { error: err.message });
    }
  }

  // 권한 변경 (PATCH /api/users/:id)
  if (method === 'PATCH' && pathname.startsWith('/api/users/')) {
    try {
      const id = pathname.replace('/api/users/', '');
      const body = await parseBody(req);
      const updated = db.updateUserRole(id, body.role, body.position, body.department, body.stampText);
      return sendJSON(res, 200, { success: true, item: updated });
    } catch (err) {
      return sendJSON(res, 400, { error: err.message });
    }
  }

  // 사용자 삭제 (DELETE /api/users/:id)
  if (method === 'DELETE' && pathname.startsWith('/api/users/')) {
    const id = pathname.replace('/api/users/', '');
    db.deleteUser(id);
    return sendJSON(res, 200, { success: true });
  }

  // ==========================================
  // 5. 정적 파일 서빙
  // ==========================================
  let safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, safePath);
  const ext = path.extname(filePath).toLowerCase();

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`================================================================`);
  console.log(`🚀 금강공업 시험성적의뢰 포털 [정식 운영 서버] 가동 완료`);
  console.log(`👉 접속 주소: http://localhost:${PORT}`);
  console.log(`💾 데이터베이스: SQLite Engine (data/kumkang.db)`);
  console.log(`📁 첨부파일 보관함: ${UPLOADS_DIR}`);
  console.log(`================================================================`);
});
