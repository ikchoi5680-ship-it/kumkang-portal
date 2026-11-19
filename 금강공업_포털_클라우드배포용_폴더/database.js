// Kumkang Test Report Portal - SQLite Database Engine
// Powered by Node.js built-in `node:sqlite` (DatabaseSync)

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'data', 'kumkang.db');
const db = new DatabaseSync(DB_PATH);

// 비밀번호 해시 헬퍼
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// 고유 사용자 ID 생성 헬퍼
function generateUserId() {
  return 'USR-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// 스키마 초기화
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      login_id TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      department TEXT NOT NULL,
      position TEXT,
      email TEXT,
      contact TEXT,
      role TEXT NOT NULL DEFAULT 'client',
      client_code TEXT,
      stamp_text TEXT,
      status TEXT NOT NULL DEFAULT 'approved', -- 'approved', 'pending', 'rejected'
      approved_by TEXT,
      approved_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      created_by TEXT, -- 신청한 사용자 id (users.id)
      request_date TEXT NOT NULL,
      due_date TEXT,
      department TEXT,
      requester TEXT,
      client_code TEXT NOT NULL,
      client_name TEXT NOT NULL,
      demand_user TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      approver TEXT,
      approved_at TEXT,
      report_file_name TEXT,
      report_file_path TEXT,
      admin_notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS request_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      spec TEXT,
      qty TEXT,
      issue_date TEXT,
      note TEXT,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS request_lots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL,
      coil_no TEXT,
      prod_date TEXT,
      spec TEXT,
      qty TEXT,
      note TEXT,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS request_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT,
      actor_name TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 테이블 기존 컬럼 마이그레이션 (status, contact, created_by 컬럼이 없을 경우 추가)
  try {
    db.exec(`ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'`);
  } catch(e) {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN contact TEXT`);
  } catch(e) {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN approved_by TEXT`);
  } catch(e) {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN approved_at TEXT`);
  } catch(e) {}
  try {
    db.exec(`ALTER TABLE requests ADD COLUMN created_by TEXT`);
  } catch(e) {}

  // 기본 거래처 계정 역할 강제 보정 (서울철강, 한양스틸은 거래처 client 역할)
  try {
    db.exec(`UPDATE users SET role = 'client', client_code = 'KC-10294' WHERE login_id = 'KC-10294'`);
    db.exec(`UPDATE users SET role = 'client', client_code = 'KC-20831' WHERE login_id = 'KC-20831'`);
    db.exec(`UPDATE users SET role = 'admin' WHERE login_id = 'admin'`);
  } catch(e) {}

  seedInitialData();
}

// 초기 기본 계정 및 샘플 데이터 시딩
function seedInitialData() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const insertUser = db.prepare(`
      INSERT INTO users (id, login_id, password_hash, name, department, position, email, contact, role, client_code, stamp_text, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)
    `);

    const now = new Date().toISOString();
    // 1. 최고 관리자 (승인권자)
    insertUser.run('USR-001', 'admin', hashPassword('admin123'), '하지현', '품질관리팀', '팀장', 'jhha@kumkang.co.kr', '010-1111-2222', 'admin', null, '하지현', now);
    // 2. 시험 실무 담당자
    insertUser.run('USR-002', 'manager', hashPassword('manager123'), '박준형', '품질관리팀', '대리', 'jhpark@kumkang.co.kr', '010-2222-3333', 'manager', null, '박준형', now);
    // 3. 거래처 계정 (서울철강)
    insertUser.run('USR-003', 'KC-10294', hashPassword('1234'), '최인규', '서울철강(주)', '대리', 'ikchoi@seoulsteel.co.kr', '010-3333-4444', 'client', 'KC-10294', '최인규', now);
    // 4. 거래처 계정 (한양스틸)
    insertUser.run('USR-004', 'KC-20831', hashPassword('1234'), '김철수', '한양스틸(주)', '과장', 'cskim@hanyang.com', '010-4444-5555', 'client', 'KC-20831', '김철수', now);

    console.log('✅ SQLite Initial Users Seeded (admin, manager, KC-10294, KC-20831)');
  }

  const reqCount = db.prepare('SELECT COUNT(*) as count FROM requests').get().count;
  if (reqCount === 0) {
    createInitialSampleRequests();
    console.log('✅ SQLite Initial Sample Requests Seeded');
  } else {
    // 기존 요청들의 created_by가 비어있으면 서울철강 USR-003으로 연결
    try {
      db.exec(`UPDATE requests SET created_by = 'USR-003' WHERE client_code = 'KC-10294' AND created_by IS NULL`);
    } catch(e) {}
  }
}

function createInitialSampleRequests() {
  const insertReq = db.prepare(`
    INSERT INTO requests (id, created_by, request_date, due_date, department, requester, client_code, client_name, demand_user, status, approver, approved_at, report_file_name, report_file_path, admin_notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertItem = db.prepare(`
    INSERT INTO request_items (request_id, item_name, spec, qty, issue_date, note, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertLot = db.prepare(`
    INSERT INTO request_lots (request_id, coil_no, prod_date, spec, qty, note, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertHistory = db.prepare(`
    INSERT INTO request_history (request_id, status, note, actor_name, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Sample 1: Completed (서울철강 USR-003 소유)
  insertReq.run(
    'REQ-20261117-001', 'USR-003', '2026-11-16', '2026-11-17', '서울철강영업팀', '최인규', 'KC-10294', '서울철강(주)', '현대건설 강남현장',
    'completed', '하지현', '2026-11-16 15:00', '금강공업_시험성적서_TR-20261116-01.pdf', null,
    'KS D 3568, KS D 3507 규격 만족. 공인 성적서 발급 완료.', '2026-11-16 14:20', '2026-11-17 08:30'
  );
  insertItem.run('REQ-20261117-001', '구조용 각형 강관 (SPSR400)', '100 x 100 x 3.2T', '150본', '2026-11-17', '현장 감리 제출용', 1);
  insertItem.run('REQ-20261117-001', '배관용 탄소 강관 (SPP)', '50A (60.5 x 3.8T)', '80본', '2026-11-17', '수압시험 성적 포함', 2);
  insertLot.run('REQ-20261117-001', 'C26-1110-04', '2026-11-12', '100 x 100 x 3.2T', '150본', '포스코 원자재 LOT #4', 1);
  insertHistory.run('REQ-20261117-001', 'pending', '거래처 성적서 의뢰 등록', '최인규', '2026-11-16 14:20');
  insertHistory.run('REQ-20261117-001', 'accepted', '품질관리팀 접수 승인', '하지현', '2026-11-16 15:00');
  insertHistory.run('REQ-20261117-001', 'processing', '물성 인장/충격 시험 분석 진행', '박준형', '2026-11-16 16:30');
  insertHistory.run('REQ-20261117-001', 'completed', '성적서 최종 발행 및 발송 완료', '하지현', '2026-11-17 08:30');

  // Sample 2: Processing (서울철강 USR-003 소유)
  insertReq.run(
    'REQ-20261117-002', 'USR-003', '2026-11-17', '2026-11-18', '서울철강영업팀', '최인규', 'KC-10294', '서울철강(주)', '대우건설 판교PJT',
    'processing', '하지현', '2026-11-17 08:10', null, null,
    '현재 항복강도 측정 완료, 연신율 측정 대기중', '2026-11-17 07:45', '2026-11-17 08:30'
  );
  insertItem.run('REQ-20261117-002', '일반구조용 각형강관', '150 x 150 x 4.5T', '95본', '2026-11-18', '인장/항복/연신율 표기', 1);
  insertLot.run('REQ-20261117-002', 'C26-1115-08', '2026-11-16', '150 x 150 x 4.5T', '95본', '1호 조관기', 1);
  insertHistory.run('REQ-20261117-002', 'pending', '거래처 성적서 의뢰 등록', '최인규', '2026-11-17 07:45');
  insertHistory.run('REQ-20261117-002', 'accepted', '품질관리팀 접수 확인', '하지현', '2026-11-17 08:10');
  insertHistory.run('REQ-20261117-002', 'processing', '시험실 시료 채취 및 시험 진행중', '박준형', '2026-11-17 08:30');

  // Sample 3: Pending (한양스틸 USR-004 소유)
  insertReq.run(
    'REQ-20261117-003', 'USR-004', '2026-11-17', '2026-11-19', '자재구매팀', '김철수', 'KC-20831', '한양스틸(주)', 'GS건설 용인 물류센터',
    'pending', null, null, null, null,
    '', '2026-11-17 08:05', '2026-11-17 08:05'
  );
  insertItem.run('REQ-20261117-003', '아연도금 각관 (GI)', '75 x 45 x 2.3T', '200본', '2026-11-19', '도금부착량 시험 포함', 1);
  insertLot.run('REQ-20261117-003', 'C26-1116-22', '2026-11-16', '75 x 45 x 2.3T', '200본', '도금 라인 #2', 1);
  insertHistory.run('REQ-20261117-003', 'pending', '거래처 성적서 의뢰 등록', '김철수', '2026-11-17 08:05');
}

// Data Access Layer Exports
module.exports = {
  db,
  initDatabase,
  hashPassword,

  // User queries
  getUserByLoginId(loginId) {
    return db.prepare('SELECT * FROM users WHERE login_id = ?').get(loginId);
  },
  getUserById(id) {
    return db.prepare('SELECT id, login_id, name, department, position, email, contact, role, client_code, stamp_text, status, approved_by, approved_at, created_at FROM users WHERE id = ?').get(id);
  },
  getAllUsers() {
    return db.prepare(`
      SELECT id, login_id, name, department, position, email, contact, role, client_code, stamp_text, status, approved_by, approved_at, created_at 
      FROM users 
      ORDER BY status DESC, created_at DESC
    `).all();
  },
  getPendingUsers() {
    return db.prepare(`
      SELECT id, login_id, name, department, position, email, contact, role, client_code, created_at 
      FROM users 
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `).all();
  },

  // 거래처 회원가입 신청 (대기 상태로 등록)
  registerClientUser(data) {
    const newId = generateUserId();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO users (id, login_id, password_hash, name, department, position, email, contact, role, client_code, stamp_text, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'client', ?, ?, 'pending', ?)
    `);

    stmt.run(
      newId,
      data.loginId,
      hashPassword(data.password),
      data.managerName || data.name,
      data.companyName || data.department,
      data.position || '담당자',
      data.email || null,
      data.contact || null,
      data.loginId, // 기본 거래처코드를 아이디로 매칭
      data.managerName || data.name,
      now
    );

    return this.getUserById(newId);
  },

  // 관리자 직접 사용자 생성
  createUser(user) {
    const stmt = db.prepare(`
      INSERT INTO users (id, login_id, password_hash, name, department, position, email, contact, role, client_code, stamp_text, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)
    `);
    stmt.run(
      user.id, user.login_id, user.password_hash, user.name, user.department,
      user.position || null, user.email || null, user.contact || null, user.role, user.client_code || null,
      user.stamp_text || user.name, user.created_at
    );
    return this.getUserById(user.id);
  },

  // 회원가입 승인
  approveUser(id, approverName) {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
    db.prepare(`
      UPDATE users 
      SET status = 'approved', approved_by = ?, approved_at = ? 
      WHERE id = ?
    `).run(approverName || '최고관리자', now, id);
    return this.getUserById(id);
  },

  // 회원가입 거절 / 삭제
  rejectUser(id) {
    db.prepare(`UPDATE users SET status = 'rejected' WHERE id = ?`).run(id);
  },

  updateUserRole(id, role, position, department, stampText) {
    const stmt = db.prepare(`
      UPDATE users SET role = ?, position = COALESCE(?, position), department = COALESCE(?, department), stamp_text = COALESCE(?, stamp_text)
      WHERE id = ?
    `);
    stmt.run(role, position || null, department || null, stampText || null, id);
    return this.getUserById(id);
  },

  deleteUser(id) {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  },

  // Session
  createSession(token, userId, expiresAt) {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(token, userId, now, expiresAt);
  },
  getSession(token) {
    return db.prepare(`
      SELECT s.token, s.expires_at, u.id as user_id, u.login_id, u.name, u.department, u.position, u.role, u.client_code, u.stamp_text, u.status
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ?
    `).get(token);
  },
  deleteSession(token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  },

  // ==========================================
  // Requests Queries (철저한 데이터 격리 보장)
  // ==========================================
  getAllRequests(currentUser = null) {
    let sql = 'SELECT * FROM requests ORDER BY created_at DESC';
    let params = [];

    // 거래처 계정이면: 본인이 등록한 의뢰서(created_by) 또는 본인 거래처코드(client_code)만 조회!
    if (currentUser && currentUser.role === 'client') {
      sql = 'SELECT * FROM requests WHERE created_by = ? OR client_code = ? ORDER BY created_at DESC';
      params = [currentUser.user_id || currentUser.id, currentUser.client_code || currentUser.login_id];
    }

    const rows = db.prepare(sql).all(...params);
    return rows.map(r => this.hydrateRequest(r));
  },

  getRequestById(id, currentUser = null) {
    const req = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
    if (!req) return null;

    // 거래처 계정이면 타 거래처 의뢰서 접근 차단
    if (currentUser && currentUser.role === 'client') {
      const myId = currentUser.user_id || currentUser.id;
      const myCode = currentUser.client_code || currentUser.login_id;
      if (req.created_by !== myId && req.client_code !== myCode) {
        return null; // 권한 없음
      }
    }

    return this.hydrateRequest(req);
  },

  hydrateRequest(req) {
    const items = db.prepare('SELECT * FROM request_items WHERE request_id = ? ORDER BY sort_order ASC, id ASC').all(req.id);
    const lotTracking = db.prepare('SELECT * FROM request_lots WHERE request_id = ? ORDER BY sort_order ASC, id ASC').all(req.id);
    const statusHistory = db.prepare('SELECT * FROM request_history WHERE request_id = ? ORDER BY created_at ASC, id ASC').all(req.id);

    return {
      id: req.id,
      createdBy: req.created_by,
      createdAt: req.created_at,
      updatedAt: req.updated_at,
      requestDate: req.request_date,
      dueDate: req.due_date,
      department: req.department,
      requester: req.requester,
      clientCode: req.client_code,
      clientName: req.client_name,
      demandUser: req.demand_user,
      status: req.status,
      approver: req.approver,
      approvedAt: req.approved_at,
      reportFile: req.report_file_name,
      reportFilePath: req.report_file_path,
      adminNotes: req.admin_notes,
      items: items.map(i => ({ name: i.item_name, spec: i.spec, qty: i.qty, issueDate: i.issue_date, note: i.note })),
      lotTracking: lotTracking.map(l => ({ coilNo: l.coil_no, prodDate: l.prod_date, spec: l.spec, qty: l.qty, note: l.note })),
      statusHistory: statusHistory.map(h => ({ status: h.status, note: h.note, actor: h.actor_name, time: h.created_at }))
    };
  },

  createRequest(data, currentUser) {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const countRow = db.prepare('SELECT COUNT(*) as count FROM requests WHERE id LIKE ?').get(`REQ-${dateStr}-%`);
    const count = (countRow ? countRow.count : 0) + 1;
    const newId = `REQ-${dateStr}-${String(count).padStart(3, '0')}`;
    const now = today.toISOString().replace('T', ' ').slice(0, 16);

    const createdBy = currentUser ? (currentUser.user_id || currentUser.id) : null;
    const clientCode = (currentUser && currentUser.client_code) ? currentUser.client_code : data.clientCode;
    const clientName = (currentUser && currentUser.department) ? currentUser.department : data.clientName;
    const requester = currentUser ? currentUser.name : data.requester;

    const insertReq = db.prepare(`
      INSERT INTO requests (id, created_by, request_date, due_date, department, requester, client_code, client_name, demand_user, status, approver, approved_at, report_file_name, report_file_path, admin_notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', null, null, null, null, '', ?, ?)
    `);

    insertReq.run(
      newId, createdBy, data.requestDate || today.toISOString().slice(0, 10), data.dueDate || null,
      data.department || clientName, requester, clientCode, clientName,
      data.demandUser || '', now, now
    );

    if (data.items && Array.isArray(data.items)) {
      const insertItem = db.prepare(`
        INSERT INTO request_items (request_id, item_name, spec, qty, issue_date, note, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      data.items.forEach((item, idx) => {
        insertItem.run(newId, item.name, item.spec || null, item.qty || null, item.issueDate || null, item.note || null, idx + 1);
      });
    }

    if (data.lotTracking && Array.isArray(data.lotTracking)) {
      const insertLot = db.prepare(`
        INSERT INTO request_lots (request_id, coil_no, prod_date, spec, qty, note, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      data.lotTracking.forEach((lot, idx) => {
        insertLot.run(newId, lot.coilNo || null, lot.prodDate || null, lot.spec || null, lot.qty || null, lot.note || null, idx + 1);
      });
    }

    // History
    db.prepare(`
      INSERT INTO request_history (request_id, status, note, actor_name, created_at)
      VALUES (?, 'pending', '거래처 시험성적의뢰서 접수 등록', ?, ?)
    `).run(newId, requester, now);

    return this.getRequestById(newId);
  },

  updateRequestStatus(id, newStatus, note, approver, adminNotes, reportFileName, reportFilePath) {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const existing = this.getRequestById(id);
    if (!existing) return null;

    let approverName = existing.approver;
    let approvedAt = existing.approvedAt;
    if (approver) {
      approverName = approver;
      approvedAt = now;
    }

    const reportName = reportFileName !== undefined ? reportFileName : existing.reportFile;
    const reportPath = reportFilePath !== undefined ? reportFilePath : existing.reportFilePath;
    const notes = adminNotes !== undefined ? adminNotes : existing.adminNotes;

    db.prepare(`
      UPDATE requests
      SET status = ?, approver = ?, approved_at = ?, admin_notes = ?, report_file_name = ?, report_file_path = ?, updated_at = ?
      WHERE id = ?
    `).run(newStatus, approverName, approvedAt, notes, reportName, reportPath, now, id);

    let statusNote = note;
    if (!statusNote) {
      if (newStatus === 'accepted') statusNote = '품질관리팀 접수 승인 (결재 날인)';
      else if (newStatus === 'processing') statusNote = '시험 및 성적서 발행 진행중';
      else if (newStatus === 'completed') statusNote = '성적서 발급 완료 및 전자 발송';
      else if (newStatus === 'rejected') statusNote = '의뢰서 반려 / 보완 요청';
    }

    db.prepare(`
      INSERT INTO request_history (request_id, status, note, actor_name, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, newStatus, statusNote, approver || '시스템', now);

    return this.getRequestById(id);
  }
};
