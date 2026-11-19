// Kumkang Test Report Portal - Production Application Logic

let currentUser = null;
let currentClientTab = 'list';
let adminFilter = 'all';
let allRequests = [];
let currentModalRequestId = null;
let allUsers = [];

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  // PWA Service Worker Registration
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW reg fail:', err));
  }

  if (window.lucide) lucide.createIcons();

  // Auth verification
  const isAuthed = await checkAuth();
  if (!isAuthed) return;

  // Set default dates in form
  const todayStr = new Date().toISOString().slice(0, 10);
  const reqDateInput = document.getElementById('form-requestDate');
  if (reqDateInput) reqDateInput.value = todayStr;

  const dueDateInput = document.getElementById('form-dueDate');
  if (dueDateInput) {
    const next3Days = new Date();
    next3Days.setDate(next3Days.getDate() + 3);
    dueDateInput.value = next3Days.toISOString().slice(0, 10);
  }

  // Initial Fetch & periodic poll
  fetchRequests();
  setInterval(fetchRequests, 6000);
});

// ==========================================
// Tab & Form Navigation (완벽 연동)
// ==========================================
let previousViewBeforeForm = 'client';

window.openNewRequestForm = function() {
  switchClientTab('form');
};

window.switchClientTab = function(tab) {
  const clientView = document.getElementById('client-view');
  const adminView = document.getElementById('admin-view');
  const listTabBtn = document.getElementById('client-tab-list');
  const formTabBtn = document.getElementById('client-tab-form');
  const listContent = document.getElementById('client-content-list');
  const formContent = document.getElementById('client-content-form');

  if (tab === 'form') {
    // 기억: 작성 화면에 들어오기 전 관리자였는지 여부
    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager')) {
      previousViewBeforeForm = 'admin';
    } else {
      previousViewBeforeForm = 'client';
    }

    // [핵심] 부모 뷰 clientView를 무조건 보이게 하고, adminView 숨김
    clientView.classList.remove('hidden');
    adminView.classList.add('hidden');

    // 폼 보이기, 목록 숨기기
    formContent.classList.remove('hidden');
    listContent.classList.add('hidden');

    // 탭 스타일: [시험성적서 작성 및 신청] 활성화 (파란색)
    if (formTabBtn) {
      formTabBtn.className = 'flex items-center space-x-2 px-4 py-2 rounded-lg font-semibold text-sm bg-blue-600 text-white shadow-sm transition';
    }
    if (listTabBtn) {
      listTabBtn.className = 'flex items-center space-x-2 px-4 py-2 rounded-lg font-medium text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition';
    }

    // 작성자 정보 자동 반영
    if (currentUser) {
      const codeInput = document.getElementById('form-clientCode');
      const nameInput = document.getElementById('form-clientName');
      const reqInput = document.getElementById('form-requester');
      const stampEl = document.getElementById('form-requester-stamp');

      if (codeInput) codeInput.value = currentUser.client_code || currentUser.login_id || 'KC-10294';
      if (nameInput) nameInput.value = currentUser.department || '거래처';
      if (reqInput) reqInput.value = currentUser.name || '담당자';
      if (stampEl) stampEl.innerText = currentUser.stamp_text || currentUser.name || '신청';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('✍️ 시험성적서 작성 양식으로 이동하였습니다.', 'info');
  } else {
    // tab === 'list'
    if (previousViewBeforeForm === 'admin' && currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager')) {
      // 관리자 화면으로 복귀
      clientView.classList.add('hidden');
      adminView.classList.remove('hidden');
      renderAdminView();
    } else {
      // 거래처 화면 목록으로 복귀
      clientView.classList.remove('hidden');
      adminView.classList.add('hidden');
      listContent.classList.remove('hidden');
      formContent.classList.add('hidden');

      if (listTabBtn) {
        listTabBtn.className = 'flex items-center space-x-2 px-4 py-2 rounded-lg font-semibold text-sm bg-blue-600 text-white shadow-sm transition';
      }
      if (formTabBtn) {
        formTabBtn.className = 'flex items-center space-x-2 px-4 py-2 rounded-lg font-medium text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition';
      }
      renderClientView();
    }
  }

  if (window.lucide) lucide.createIcons();
};
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const bgColors = {
    info: 'bg-slate-900 text-white',
    success: 'bg-emerald-600 text-white',
    warning: 'bg-amber-500 text-white',
    error: 'bg-rose-600 text-white'
  };

  toast.className = `${bgColors[type] || bgColors.info} px-4 py-3 rounded-xl shadow-lg text-xs font-semibold flex items-center space-x-2 transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => toast.classList.remove('translate-y-2', 'opacity-0'), 10);
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Authentication Check
async function checkAuth() {
  const token = localStorage.getItem('auth_token');
  try {
    const res = await fetch('/api/auth/me', {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });

    if (!res.ok) {
      window.location.href = '/login.html';
      return false;
    }

    const data = await res.json();
    currentUser = data.user;
    setupUserInterface();
    return true;
  } catch (err) {
    window.location.href = '/login.html';
    return false;
  }
}

// Setup UI according to user role
function setupUserInterface() {
  if (!currentUser) return;

  document.getElementById('current-user-name').innerText = currentUser.name;
  document.getElementById('user-avatar-initial').innerText = currentUser.name ? currentUser.name.charAt(0) : 'K';

  const roleLabels = {
    admin: '최고 관리자',
    manager: '시험 담당자',
    sales: '영업 담당자',
    client: '거래처'
  };
  document.getElementById('current-user-role-badge').innerText = `${roleLabels[currentUser.role] || currentUser.role} (${currentUser.department})`;

  const clientView = document.getElementById('client-view');
  const adminView = document.getElementById('admin-view');
  const navUsersBtn = document.getElementById('nav-users-btn');
  const navErpBtn = document.getElementById('nav-erp-btn');

  // Role permissions UI
  if (currentUser.role === 'client') {
    clientView.classList.remove('hidden');
    adminView.classList.add('hidden');
    if (navUsersBtn) navUsersBtn.classList.add('hidden');
    if (navErpBtn) navErpBtn.classList.add('hidden');

    // Auto-fill Client form details
    document.getElementById('client-badge-name').innerText = currentUser.department || currentUser.name;
    document.getElementById('form-clientCode').value = currentUser.client_code || 'KC-10294';
    document.getElementById('form-clientName').value = currentUser.department || '거래처';
    document.getElementById('form-requester').value = currentUser.name;
    document.getElementById('form-requester-stamp').innerText = currentUser.stamp_text || currentUser.name;
  } else {
    // Admin or Manager
    adminView.classList.remove('hidden');
    clientView.classList.add('hidden');
    document.getElementById('admin-header-name').innerText = `${currentUser.name} ${currentUser.position || '담당'}`;

    if (currentUser.role === 'admin') {
      if (navUsersBtn) navUsersBtn.classList.remove('hidden');
      if (navErpBtn) navErpBtn.classList.remove('hidden');
      fetchPendingUsers();
    } else {
      if (navUsersBtn) navUsersBtn.classList.add('hidden');
      if (navErpBtn) navErpBtn.classList.remove('hidden');
    }
  }

  if (window.lucide) lucide.createIcons();
}

async function handleLogout() {
  try {
    const token = localStorage.getItem('auth_token');
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
  } catch (e) {}

  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  window.location.href = '/login.html';
}

// Fetch Requests
async function fetchRequests() {
  const token = localStorage.getItem('auth_token');
  try {
    const res = await fetch('/api/requests', {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    if (!res.ok) return;
    allRequests = await res.json();
    render();
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

function render() {
  if (currentUser && currentUser.role === 'client') {
    renderClientView();
  } else {
    renderAdminView();
  }
  if (window.lucide) lucide.createIcons();
}

const STATUS_META = {
  pending: { label: '접수 대기', badgeClass: 'badge-pending', step: 1 },
  accepted: { label: '접수 완료', badgeClass: 'badge-accepted', step: 2 },
  processing: { label: '시험 진행중', badgeClass: 'badge-processing', step: 3 },
  completed: { label: '발송 완료', badgeClass: 'badge-completed', step: 4 },
  rejected: { label: '반려/보완요청', badgeClass: 'badge-rejected', step: 0 }
};

// Render Client View
function renderClientView() {
  const container = document.getElementById('client-cards-container');
  
  // Stats
  document.getElementById('client-req-count').innerText = allRequests.length;
  document.getElementById('client-stat-total').innerText = allRequests.length;
  document.getElementById('client-stat-pending').innerText = allRequests.filter(r => r.status === 'pending').length;
  document.getElementById('client-stat-processing').innerText = allRequests.filter(r => r.status === 'processing' || r.status === 'accepted').length;
  document.getElementById('client-stat-completed').innerText = allRequests.filter(r => r.status === 'completed').length;

  if (allRequests.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm space-y-4">
        <div class="w-16 h-16 mx-auto rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-3xl">
          📑
        </div>
        <div>
          <h3 class="text-base font-bold text-slate-800">아직 신청하신 시험성적의뢰서가 없습니다.</h3>
          <p class="text-xs text-slate-500 mt-1">상단의 <strong>[✍️ 시험성적서 작성 및 신청]</strong> 버튼을 눌러 첫 시험성적서를 의뢰해 보세요.</p>
        </div>
        <div>
          <button onclick="openNewRequestForm()" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition inline-flex items-center space-x-2">
            <i data-lucide="file-plus-2" class="w-4 h-4"></i>
            <span>✍️ 지금 첫 시험성적서 신청하기</span>
          </button>
        </div>
      </div>`;
    return;
  }

  container.innerHTML = allRequests.map(req => {
    const meta = STATUS_META[req.status] || STATUS_META.pending;
    const itemsPreview = req.items && req.items.length > 0 
      ? `${req.items[0].name} (${req.items[0].spec || '-'}) ${req.items.length > 1 ? `외 ${req.items.length - 1}건` : ''}`
      : '의뢰 품목 없음';

    const steps = [
      { key: 'pending', label: '1. 신청/대기' },
      { key: 'accepted', label: '2. 접수완료' },
      { key: 'processing', label: '3. 시험진행중' },
      { key: 'completed', label: '4. 발송완료' }
    ];

    const currentStepNum = meta.step;

    const stepsHtml = steps.map((s, idx) => {
      const stepIdx = idx + 1;
      const isPast = stepIdx < currentStepNum;
      const isCurrent = stepIdx === currentStepNum;

      let circleClass = 'bg-slate-100 text-slate-400 border border-slate-300';
      let textClass = 'text-slate-400 font-normal';
      let barClass = 'bg-slate-200';

      if (isPast) {
        circleClass = 'bg-emerald-500 text-white border border-emerald-600';
        textClass = 'text-emerald-700 font-bold';
        barClass = 'bg-emerald-500';
      } else if (isCurrent) {
        circleClass = req.status === 'completed'
          ? 'bg-emerald-600 text-white ring-4 ring-emerald-100 animate-pulse'
          : 'bg-blue-600 text-white ring-4 ring-blue-100 animate-pulse';
        textClass = req.status === 'completed' ? 'text-emerald-800 font-bold' : 'text-blue-700 font-bold';
      }

      return `
        <div class="flex-1 flex items-center">
          <div class="flex items-center space-x-1.5">
            <div class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${circleClass}">
              ${isPast ? '✓' : stepIdx}
            </div>
            <span class="text-xs ${textClass} hidden sm:inline">${s.label}</span>
          </div>
          ${idx < steps.length - 1 ? `<div class="flex-1 h-1 mx-2 rounded ${barClass}"></div>` : ''}
        </div>
      `;
    }).join('');

    return `
      <div class="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition p-5 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div class="flex items-center space-x-3">
            <span class="font-bold text-sm text-slate-900">${req.id}</span>
            <span class="text-xs px-2.5 py-0.5 rounded-full font-bold ${meta.badgeClass}">${meta.label}</span>
            <span class="text-xs text-slate-400">신청일시: ${req.createdAt}</span>
          </div>
          <div class="flex items-center space-x-2">
            <button onclick="openViewModal('${req.id}')" class="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 flex items-center space-x-1 transition">
              <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
              <span>의뢰서 원본</span>
            </button>
            ${req.status === 'completed' ? `
              <button onclick="downloadReport('${req.id}')" class="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg shadow-sm flex items-center space-x-1 transition">
                <i data-lucide="download" class="w-3.5 h-3.5"></i>
                <span>공인 성적서 PDF 다운로드</span>
              </button>
            ` : ''}
          </div>
        </div>

        <div class="bg-slate-50 p-3 rounded-lg border border-slate-100">
          <div class="flex items-center justify-between">${stepsHtml}</div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <span class="text-slate-400 block">수요가(납품처)</span>
            <span class="font-semibold text-slate-800">${req.demandUser || '-'}</span>
          </div>
          <div>
            <span class="text-slate-400 block">요구일자</span>
            <span class="font-semibold text-slate-800">${req.dueDate || '-'}</span>
          </div>
          <div class="col-span-2">
            <span class="text-slate-400 block">의뢰 품목</span>
            <span class="font-medium text-slate-800">${itemsPreview}</span>
          </div>
        </div>

        ${req.adminNotes ? `
          <div class="bg-blue-50/70 border border-blue-200/60 rounded-lg p-2.5 text-xs text-blue-900 flex items-start space-x-2">
            <i data-lucide="info" class="w-4 h-4 text-blue-600 shrink-0 mt-0.5"></i>
            <div>
              <span class="font-bold">품질관리팀 알림:</span> ${req.adminNotes}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// Render Admin View
function renderAdminView() {
  const stats = {
    total: allRequests.length,
    pending: allRequests.filter(r => r.status === 'pending').length,
    accepted: allRequests.filter(r => r.status === 'accepted').length,
    processing: allRequests.filter(r => r.status === 'processing').length,
    completed: allRequests.filter(r => r.status === 'completed').length
  };

  document.getElementById('admin-stat-total').innerText = stats.total;
  document.getElementById('admin-stat-pending').innerText = stats.pending;
  document.getElementById('admin-stat-accepted').innerText = stats.accepted;
  document.getElementById('admin-stat-processing').innerText = stats.processing;
  document.getElementById('admin-stat-completed').innerText = stats.completed;

  let list = allRequests;
  if (adminFilter !== 'all') {
    list = list.filter(r => r.status === adminFilter);
  }

  const searchInput = document.getElementById('admin-search-input');
  if (searchInput && searchInput.value.trim()) {
    const q = searchInput.value.trim().toLowerCase();
    list = list.filter(r => 
      (r.id && r.id.toLowerCase().includes(q)) ||
      (r.clientName && r.clientName.toLowerCase().includes(q)) ||
      (r.demandUser && r.demandUser.toLowerCase().includes(q)) ||
      (r.requester && r.requester.toLowerCase().includes(q))
    );
  }

  document.getElementById('admin-filtered-count').innerText = `${list.length}건`;

  const tbody = document.getElementById('admin-table-tbody');
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400">해당 조건의 의뢰 내역이 없습니다.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(req => {
    const meta = STATUS_META[req.status] || STATUS_META.pending;
    const itemsSummary = req.items && req.items.length > 0
      ? `${req.items[0].name} ${req.items.length > 1 ? `외 ${req.items.length - 1}건` : ''}`
      : '-';

    return `
      <tr class="hover:bg-slate-50 transition cursor-pointer" onclick="openAdminModal('${req.id}')">
        <td class="px-4 py-3 font-bold text-blue-700">${req.id}</td>
        <td class="px-4 py-3">
          <div class="font-bold text-slate-800">${req.clientName}</div>
          <div class="text-[11px] text-slate-400">${req.demandUser || '수요가 미지정'}</div>
        </td>
        <td class="px-4 py-3">${req.requester} (${req.department})</td>
        <td class="px-4 py-3">
          <div>${req.requestDate}</div>
          <div class="text-[11px] text-rose-600 font-medium">요구: ${req.dueDate || '-'}</div>
        </td>
        <td class="px-4 py-3 font-medium text-slate-700">${itemsSummary}</td>
        <td class="px-4 py-3 text-center">
          <span class="px-2.5 py-1 rounded-full text-xs font-bold ${meta.badgeClass}">${meta.label}</span>
        </td>
        <td class="px-4 py-3 text-center">
          ${req.approver ? `<span class="text-xs font-bold text-slate-800">${req.approver}</span>` : '<span class="text-slate-300">-</span>'}
        </td>
        <td class="px-4 py-3 text-center" onclick="event.stopPropagation()">
          <button onclick="openAdminModal('${req.id}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition border border-blue-200">
            상세 및 승인
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterAdminStatus(status) {
  adminFilter = status;
  renderAdminView();
  if (window.lucide) lucide.createIcons();
}

function handleAdminSearch() {
  renderAdminView();
}

function addFormItemRow() {
  const tbody = document.getElementById('items-table-tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="item-name highlight-field" placeholder="품명 입력"></td>
    <td><input type="text" class="item-spec highlight-field" placeholder="규격 입력"></td>
    <td><input type="text" class="item-qty highlight-field text-center" placeholder="수량"></td>
    <td><input type="date" class="item-date highlight-field text-center"></td>
    <td><input type="text" class="item-note highlight-field" placeholder="비고"></td>
  `;
  tbody.appendChild(tr);
}

function fillSampleData() {
  document.getElementById('form-demandUser').value = '포스코이앤씨 송도 현장';
  const next2Days = new Date();
  next2Days.setDate(next2Days.getDate() + 2);
  document.getElementById('form-dueDate').value = next2Days.toISOString().slice(0, 10);

  const tbody = document.getElementById('items-table-tbody');
  tbody.innerHTML = `
    <tr>
      <td><input type="text" class="item-name highlight-field" value="구조용 각형 강관 (SPSR400)"></td>
      <td><input type="text" class="item-spec highlight-field" value="125 x 125 x 4.5T"></td>
      <td><input type="text" class="item-qty highlight-field text-center" value="180본"></td>
      <td><input type="date" class="item-date highlight-field text-center" value="${next2Days.toISOString().slice(0, 10)}"></td>
      <td><input type="text" class="item-note highlight-field" value="인장시험 및 화학성분표 포함"></td>
    </tr>
    <tr>
      <td><input type="text" class="item-name highlight-field" value="일반구조용 탄소강관"></td>
      <td><input type="text" class="item-spec highlight-field" value="100A SCH20"></td>
      <td><input type="text" class="item-qty highlight-field text-center" value="95본"></td>
      <td><input type="date" class="item-date highlight-field text-center" value="${next2Days.toISOString().slice(0, 10)}"></td>
      <td><input type="text" class="item-note highlight-field" value="밀시트 제출 요망"></td>
    </tr>
  `;

  showToast('⚡ 예시 데이터가 폼에 자동 입력되었습니다.', 'success');
}

function resetForm() {
  document.getElementById('request-submit-form').reset();
  const todayStr = new Date().toISOString().slice(0, 10);
  document.getElementById('form-requestDate').value = todayStr;
  if (currentUser) {
    document.getElementById('form-clientCode').value = currentUser.client_code || 'KC-10294';
    document.getElementById('form-clientName').value = currentUser.department || '서울철강(주)';
    document.getElementById('form-requester').value = currentUser.name;
  }
  showToast('폼이 초기화되었습니다.', 'info');
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const items = [];
  const itemRows = document.querySelectorAll('#items-table-tbody tr');
  itemRows.forEach(row => {
    const name = row.querySelector('.item-name')?.value.trim();
    if (name) {
      items.push({
        name,
        spec: row.querySelector('.item-spec')?.value.trim() || '',
        qty: row.querySelector('.item-qty')?.value.trim() || '',
        issueDate: row.querySelector('.item-date')?.value || '',
        note: row.querySelector('.item-note')?.value.trim() || ''
      });
    }
  });

  if (items.length === 0) {
    alert('최소 1개 이상의 품목을 입력해주세요.');
    return;
  }

  const lotTracking = [];
  const lotRows = document.querySelectorAll('#lot-table-tbody tr');
  lotRows.forEach(row => {
    const coilNo = row.querySelector('.lot-coil')?.value.trim();
    if (coilNo) {
      lotTracking.push({
        coilNo,
        prodDate: row.querySelector('.lot-date')?.value || '',
        spec: row.querySelector('.lot-spec')?.value.trim() || '',
        qty: row.querySelector('.lot-qty')?.value.trim() || '',
        note: row.querySelector('.lot-note')?.value.trim() || ''
      });
    }
  });

  const payload = {
    requestDate: document.getElementById('form-requestDate').value,
    dueDate: document.getElementById('form-dueDate').value,
    department: document.getElementById('form-department').value,
    requester: document.getElementById('form-requester').value,
    clientCode: document.getElementById('form-clientCode').value,
    clientName: document.getElementById('form-clientName').value,
    demandUser: document.getElementById('form-demandUser').value,
    items,
    lotTracking
  };

  const token = localStorage.getItem('auth_token');
  try {
    const res = await fetch('/api/requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.success) {
      showToast(`🎉 의뢰서(${result.item.id})가 성공적으로 접수 대기 목록에 등록되었습니다!`, 'success');
      await fetchRequests();
      switchClientTab('list');
      resetForm();
    } else {
      alert('오류 발생: ' + result.error);
    }
  } catch (err) {
    alert('서버 통신 실패: ' + err.message);
  }
}

function buildPaperHtml(req) {
  const itemRowsHtml = (req.items || []).map(item => `
    <tr>
      <td class="text-left px-2 font-medium">${item.name}</td>
      <td>${item.spec || '-'}</td>
      <td>${item.qty || '-'}</td>
      <td>${item.issueDate || '-'}</td>
      <td class="text-left px-2 text-slate-500">${item.note || '-'}</td>
    </tr>
  `).join('');

  const lotRowsHtml = (req.lotTracking && req.lotTracking.length > 0)
    ? req.lotTracking.map(lot => `
      <tr>
        <td class="font-medium">${lot.coilNo}</td>
        <td>${lot.prodDate || '-'}</td>
        <td>${lot.spec || '-'}</td>
        <td>${lot.qty || '-'}</td>
        <td class="text-left px-2">${lot.note || '-'}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="5" class="py-2 text-slate-400">등록된 LOT 정보 없음</td></tr>`;

  const approverStampHtml = req.approver ? `
    <div class="stamp-box">
      <span>승 인</span>
      <span class="text-[10px]">${req.approver}</span>
    </div>
  ` : `
    <span class="text-[10px] text-slate-400 text-center leading-tight">접수 대기</span>
  `;

  return `
    <div class="a4-paper">
      <div class="flex items-stretch justify-between mb-4 border-b-2 border-black pb-3">
        <div class="flex-1 flex flex-col justify-center items-center">
          <h2 class="text-2xl font-black tracking-widest text-black">시 험 성 적 의 뢰 서</h2>
          <div class="text-xs text-slate-500 mt-1">의뢰번호: <strong>${req.id}</strong></div>
        </div>

        <div class="w-48 border border-black flex">
          <div class="w-1/2 border-r border-black flex flex-col">
            <div class="text-[11px] font-bold text-center border-b border-black py-0.5 bg-slate-50">신 청</div>
            <div class="text-[10px] text-center border-b border-black py-0.5">담 당</div>
            <div class="flex-1 flex items-center justify-center p-1 min-h-[64px]">
              <div class="stamp-box">
                <span>신 청</span>
                <span class="text-[10px]">${req.requester}</span>
              </div>
            </div>
          </div>
          <div class="w-1/2 flex flex-col">
            <div class="text-[11px] font-bold text-center border-b border-black py-0.5 bg-slate-50">승 인</div>
            <div class="text-[10px] text-center border-b border-black py-0.5">담 당</div>
            <div class="flex-1 flex items-center justify-center p-1 min-h-[64px]">
              ${approverStampHtml}
            </div>
          </div>
        </div>
      </div>

      <table class="report-table mb-4">
        <colgroup>
          <col style="width: 14%;">
          <col style="width: 36%;">
          <col style="width: 14%;">
          <col style="width: 36%;">
        </colgroup>
        <tbody>
          <tr>
            <th>의 뢰 일</th>
            <td>${req.requestDate}</td>
            <th>요 구 일</th>
            <td class="font-bold text-rose-700">${req.dueDate || '-'}</td>
          </tr>
          <tr>
            <th>의 뢰 부 서</th>
            <td>${req.department}</td>
            <th>의 뢰 자</th>
            <td class="font-bold">${req.requester}</td>
          </tr>
          <tr>
            <th>거래처코드</th>
            <td colspan="3" class="text-left px-2">${req.clientCode}</td>
          </tr>
          <tr>
            <th>거 래 처</th>
            <td class="text-left px-2 font-bold">${req.clientName}</td>
            <th>수 요 가</th>
            <td class="text-left px-2 font-medium">${req.demandUser || '-'}</td>
          </tr>
        </tbody>
      </table>

      <div class="mb-4">
        <div class="text-xs font-bold text-slate-800 mb-1">■ 의뢰 대상 품목 명세</div>
        <table class="report-table">
          <colgroup>
            <col style="width: 25%;">
            <col style="width: 25%;">
            <col style="width: 15%;">
            <col style="width: 15%;">
            <col style="width: 20%;">
          </colgroup>
          <thead>
            <tr>
              <th>품 명</th>
              <th>규 격</th>
              <th>수 량</th>
              <th>발 급 일</th>
              <th>비 고</th>
            </tr>
          </thead>
          <tbody>${itemRowsHtml}</tbody>
        </table>
      </div>

      <div class="mb-6">
        <div class="text-xs font-bold text-slate-800 mb-1">■ 생산 LOT 추적</div>
        <table class="report-table">
          <colgroup>
            <col style="width: 25%;">
            <col style="width: 20%;">
            <col style="width: 20%;">
            <col style="width: 15%;">
            <col style="width: 20%;">
          </colgroup>
          <thead>
            <tr>
              <th>COIL 제품번호</th>
              <th>조 관 생 산 일</th>
              <th>규 격</th>
              <th>수 량</th>
              <th>비 고</th>
            </tr>
          </thead>
          <tbody>${lotRowsHtml}</tbody>
        </table>
      </div>

      <div class="flex items-center justify-between text-xs text-slate-600 font-medium pt-4 border-t border-slate-300">
        <span>KHOPC - 06F04</span>
        <span class="font-bold text-slate-800 text-sm tracking-wider">금 강 공 업 주 식 회 사</span>
        <span>A4 (210 x 297)</span>
      </div>
    </div>
  `;
}

function openAdminModal(id) {
  const req = allRequests.find(r => r.id === id);
  if (!req) return;
  currentModalRequestId = id;

  const meta = STATUS_META[req.status] || STATUS_META.pending;
  document.getElementById('modal-req-id').innerText = req.id;
  const badgeEl = document.getElementById('modal-status-badge');
  badgeEl.innerText = meta.label;
  badgeEl.className = `text-xs px-2.5 py-0.5 rounded-full font-bold ${meta.badgeClass}`;

  document.getElementById('modal-req-summary').innerText = 
    `거래처: ${req.clientName} | 수요가: ${req.demandUser || '-'} | 의뢰일: ${req.requestDate}`;

  document.getElementById('modal-admin-notes').value = req.adminNotes || '';
  document.getElementById('modal-report-file-input').value = '';

  document.getElementById('modal-document-render').innerHTML = buildPaperHtml(req);

  const historyList = document.getElementById('modal-history-list');
  historyList.innerHTML = (req.statusHistory || []).map(h => `
    <div class="flex items-start space-x-2 text-xs">
      <span class="w-2 h-2 rounded-full bg-blue-500 mt-1 shrink-0"></span>
      <span class="text-slate-400 font-mono shrink-0">${h.time}</span>
      <span class="font-semibold text-slate-700">[${(STATUS_META[h.status] || {}).label || h.status}]</span>
      <span class="text-slate-600">${h.note}</span>
    </div>
  `).join('');

  document.getElementById('admin-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeAdminModal() {
  document.getElementById('admin-modal').classList.add('hidden');
  currentModalRequestId = null;
}

// Update Request Status by Admin
async function updateRequestStatus(newStatus) {
  if (!currentModalRequestId) return;

  const adminNotes = document.getElementById('modal-admin-notes').value.trim();
  const payload = {
    status: newStatus,
    adminNotes,
    approver: currentUser ? currentUser.name : '하지현'
  };

  const token = localStorage.getItem('auth_token');
  try {
    const res = await fetch(`/api/requests/${currentModalRequestId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      showToast(`상태가 [${STATUS_META[newStatus].label}] (으)로 변경되었습니다.`, 'success');
      await fetchRequests();
      openAdminModal(currentModalRequestId);
    }
  } catch (err) {
    alert('상태 업데이트 오류: ' + err.message);
  }
}

// Trigger Complete with Real File Upload
async function triggerCompleteWithUpload() {
  if (!currentModalRequestId) return;

  const fileInput = document.getElementById('modal-report-file-input');
  const file = fileInput.files[0];
  const adminNotes = document.getElementById('modal-admin-notes').value.trim();
  const token = localStorage.getItem('auth_token');

  if (file) {
    // Read file as Base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result.split(',')[1];
      try {
        const res = await fetch(`/api/upload-report/${currentModalRequestId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            fileName: file.name,
            fileData: base64Data,
            approver: currentUser ? currentUser.name : '하지현',
            adminNotes
          })
        });

        const data = await res.json();
        if (data.success) {
          showToast(`🎉 실제 성적서 파일(${file.name})이 첨부되어 발송완료되었습니다!`, 'success');
          await fetchRequests();
          openAdminModal(currentModalRequestId);
        }
      } catch (err) {
        alert('파일 업로드 실패: ' + err.message);
      }
    };
    reader.readAsDataURL(file);
  } else {
    // Default complete
    updateRequestStatus('completed');
  }
}

async function saveAdminNotesOnly() {
  if (!currentModalRequestId) return;
  const adminNotes = document.getElementById('modal-admin-notes').value.trim();
  const token = localStorage.getItem('auth_token');

  try {
    const res = await fetch(`/api/requests/${currentModalRequestId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ adminNotes })
    });
    const data = await res.json();
    if (data.success) {
      showToast('품질팀 메모가 저장되었습니다.', 'info');
      await fetchRequests();
    }
  } catch (err) {
    alert('메모 저장 실패');
  }
}

function openViewModal(id) {
  const req = allRequests.find(r => r.id === id);
  if (!req) return;

  const meta = STATUS_META[req.status] || STATUS_META.pending;
  document.getElementById('viewer-title').innerText = `시험성적의뢰서 (${req.id})`;
  const badgeEl = document.getElementById('viewer-status-badge');
  badgeEl.innerText = meta.label;
  badgeEl.className = `text-xs px-2.5 py-0.5 rounded-full font-bold ${meta.badgeClass}`;

  document.getElementById('viewer-content').innerHTML = buildPaperHtml(req);
  document.getElementById('view-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeViewModal() {
  document.getElementById('view-modal').classList.add('hidden');
}

// Download Report File via Streaming API
function downloadReport(id) {
  const req = allRequests.find(r => r.id === id);
  const fileName = req?.reportFile || `금강공업_시험성적서_${id}.pdf`;
  showToast(`📥 [${fileName}] 공인 시험성적서 다운로드를 시작합니다.`, 'success');

  // Trigger browser download via stream endpoint
  const a = document.createElement('a');
  a.href = `/api/download-report/${id}`;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// User Permission Modal
let currentUsersTab = 'pending';
let pendingUsers = [];

async function fetchUsers() {
  const token = localStorage.getItem('auth_token');
  try {
    const res = await fetch('/api/users', {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    allUsers = await res.json();
    renderUsersTable();
  } catch (err) {
    console.error('Fetch users error:', err);
  }
}

async function fetchPendingUsers() {
  const token = localStorage.getItem('auth_token');
  try {
    const res = await fetch('/api/users/pending', {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    if (!res.ok) return;
    pendingUsers = await res.json();
    
    const badge = document.getElementById('pending-users-badge');
    if (badge) {
      badge.innerText = pendingUsers.length;
      badge.style.display = pendingUsers.length > 0 ? 'inline-block' : 'none';
    }
    const navBadge = document.getElementById('nav-pending-badge');
    if (navBadge) {
      navBadge.innerText = pendingUsers.length;
      navBadge.style.display = pendingUsers.length > 0 ? 'inline-block' : 'none';
    }
    renderPendingUsersTable();
  } catch (err) {
    console.error('Fetch pending users error:', err);
  }
}

function switchUserModalTab(tab) {
  currentUsersTab = tab;
  const tabPending = document.getElementById('users-tab-pending');
  const tabAll = document.getElementById('users-tab-all');
  const tabErp = document.getElementById('users-tab-erp');
  const contentPending = document.getElementById('users-content-pending');
  const contentAll = document.getElementById('users-content-all');
  const contentErp = document.getElementById('users-content-erp');

  const inactiveClass = 'pb-2.5 text-xs font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center space-x-1.5 transition';
  if (tabPending) tabPending.className = inactiveClass;
  if (tabAll) tabAll.className = inactiveClass;
  if (tabErp) tabErp.className = inactiveClass;

  if (contentPending) contentPending.classList.add('hidden');
  if (contentAll) contentAll.classList.add('hidden');
  if (contentErp) contentErp.classList.add('hidden');

  if (tab === 'pending') {
    if (tabPending) tabPending.className = 'pb-2.5 text-xs font-bold border-b-2 border-blue-600 text-blue-700 flex items-center space-x-1.5 transition';
    if (contentPending) contentPending.classList.remove('hidden');
    fetchPendingUsers();
  } else if (tab === 'all') {
    if (tabAll) tabAll.className = 'pb-2.5 text-xs font-bold border-b-2 border-blue-600 text-blue-700 flex items-center space-x-1.5 transition';
    if (contentAll) contentAll.classList.remove('hidden');
    fetchUsers();
  } else if (tab === 'erp') {
    if (tabErp) tabErp.className = 'pb-2.5 text-xs font-bold border-b-2 border-indigo-600 text-indigo-700 flex items-center space-x-1.5 transition';
    if (contentErp) contentErp.classList.remove('hidden');
    populateErpSimulatorRequests();
  }
  if (window.lucide) lucide.createIcons();
}

function renderPendingUsersTable() {
  const tbody = document.getElementById('pending-users-tbody');
  if (!tbody) return;

  if (pendingUsers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400">현재 신규 가입 신청 대기 중인 거래처가 없습니다.</td></tr>`;
    return;
  }

  tbody.innerHTML = pendingUsers.map(u => `
    <tr class="hover:bg-amber-50/40 transition">
      <td class="px-3 py-2.5 font-bold text-blue-800">${u.login_id}</td>
      <td class="px-3 py-2.5 font-bold text-slate-900">${u.department}</td>
      <td class="px-3 py-2.5">${u.name}</td>
      <td class="px-3 py-2.5">
        <div class="font-medium text-slate-700">${u.contact || '-'}</div>
        <div class="text-[10px] text-slate-400">${u.email || '-'}</div>
      </td>
      <td class="px-3 py-2.5 text-slate-500 text-[11px]">${u.created_at ? u.created_at.slice(0, 16) : '-'}</td>
      <td class="px-3 py-2.5 text-center space-x-1.5">
        <button onclick="approveClientUser('${u.id}', '${u.name}')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-sm transition">
          ✓ 가입 허락 (승인)
        </button>
        <button onclick="rejectClientUser('${u.id}')" class="px-2 py-1 bg-white hover:bg-slate-100 text-slate-500 hover:text-rose-600 border border-slate-300 rounded-lg text-xs transition">
          거절
        </button>
      </td>
    </tr>
  `).join('');
}

async function approveClientUser(userId, userName) {
  const token = localStorage.getItem('auth_token');
  try {
    const res = await fetch(`/api/users/${userId}/approve`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    const data = await res.json();
    if (data.success) {
      showToast(`🎉 거래처(${userName || userId}) 가입이 승인 허락되었습니다!`, 'success');
      await fetchPendingUsers();
      await fetchUsers();
    }
  } catch (err) {
    alert('승인 처리 실패: ' + err.message);
  }
}

async function rejectClientUser(userId) {
  if (!confirm('해당 거래처의 가입 신청을 거절하시겠습니까?')) return;
  const token = localStorage.getItem('auth_token');
  try {
    const res = await fetch(`/api/users/${userId}/reject`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    const data = await res.json();
    if (data.success) {
      showToast('가입 신청이 거절 처리되었습니다.', 'info');
      await fetchPendingUsers();
    }
  } catch (err) {
    alert('거절 처리 실패: ' + err.message);
  }
}

function renderUsersTable() {
  const tbody = document.getElementById('users-table-tbody');
  if (!tbody) return;

  tbody.innerHTML = allUsers.map(user => `
    <tr class="hover:bg-slate-50 transition">
      <td class="px-3 py-2.5">
        <div class="font-bold text-slate-800">${user.name}</div>
        <div class="text-[10px] text-slate-400">${user.position || '-'}</div>
      </td>
      <td class="px-3 py-2.5 text-slate-600">${user.department}</td>
      <td class="px-3 py-2.5 text-slate-500 font-mono text-[11px]">${user.login_id}</td>
      <td class="px-3 py-2.5">
        <span class="inline-block border border-rose-400 text-rose-600 px-1.5 py-0.5 rounded text-[10px] font-bold">
          ${user.stamp_text || user.name}
        </span>
      </td>
      <td class="px-3 py-2.5">
        <select onchange="changeUserRole('${user.id}', this.value)" class="text-xs font-semibold px-2 py-1 rounded border border-slate-300 focus:outline-none focus:border-blue-500 ${user.role === 'admin' ? 'text-blue-700 bg-blue-50 border-blue-300' : 'text-slate-700 bg-white'}">
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>최고 관리자 (승인권자)</option>
          <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>시험 담당자 (실무)</option>
          <option value="sales" ${user.role === 'sales' ? 'selected' : ''}>영업 담당자</option>
          <option value="client" ${user.role === 'client' ? 'selected' : ''}>거래처 전용</option>
        </select>
      </td>
      <td class="px-3 py-2.5 text-center">
        ${user.id === 'USR-001' ? `
          <span class="text-[10px] text-slate-400">기본계정</span>
        ` : `
          <button onclick="deleteUser('${user.id}')" class="text-[11px] text-rose-500 hover:text-rose-700 font-medium">삭제</button>
        `}
      </td>
    </tr>
  `).join('');
}

async function changeUserRole(userId, newRole) {
  const token = localStorage.getItem('auth_token');
  try {
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ role: newRole })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`'${data.item.name}' 님의 권한이 변경되었습니다.`, 'success');
      await fetchUsers();
    }
  } catch (err) {
    alert('권한 변경 실패: ' + err.message);
  }
}

async function handleCreateUser(e) {
  e.preventDefault();

  const name = document.getElementById('new-user-name').value.trim();
  const department = document.getElementById('new-user-dept').value.trim();
  const position = document.getElementById('new-user-pos').value.trim();
  const loginId = document.getElementById('new-user-login-id').value.trim();
  const password = document.getElementById('new-user-pw').value.trim();
  const role = document.getElementById('new-user-role').value;

  const payload = {
    name, department, position, loginId, password, role,
    clientCode: role === 'client' ? loginId : null,
    stampText: name
  };

  const token = localStorage.getItem('auth_token');
  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      showToast(`'${name}' 님의 계정 및 권한이 등록되었습니다!`, 'success');
      document.getElementById('new-user-name').value = '';
      document.getElementById('new-user-login-id').value = '';
      await fetchUsers();
    }
  } catch (err) {
    alert('사용자 등록 실패: ' + err.message);
  }
}

async function deleteUser(userId) {
  if (!confirm('해당 사용자의 계정 및 권한을 삭제하시겠습니까?')) return;
  const token = localStorage.getItem('auth_token');
  try {
    const res = await fetch(`/api/users/${userId}`, {
      method: 'DELETE',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    const data = await res.json();
    if (data.success) {
      showToast('사용자가 삭제되었습니다.', 'info');
      await fetchUsers();
    }
  } catch (err) {
    alert('삭제 실패: ' + err.message);
  }
}

function openUsersModal() {
  fetchPendingUsers();
  fetchUsers();
  switchUserModalTab('pending');
  document.getElementById('users-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}
function closeUsersModal() {
  document.getElementById('users-modal').classList.add('hidden');
}

function openPwaModal() {
  document.getElementById('pwa-modal').classList.remove('hidden');
}
function closePwaModal() {
  document.getElementById('pwa-modal').classList.add('hidden');
}

function printCurrentModal() {
  window.print();
}

function openErpModal() {
  document.getElementById('users-modal').classList.remove('hidden');
  switchUserModalTab('erp');
  if (window.lucide) lucide.createIcons();
}

function populateErpSimulatorRequests() {
  const select = document.getElementById('erp-sim-req-select');
  if (!select) return;

  if (!allRequests || allRequests.length === 0) {
    select.innerHTML = '<option value="">선택 가능한 의뢰서가 없습니다</option>';
    return;
  }

  const statusLabels = {
    'pending': '접수대기',
    'accepted': '접수완료',
    'processing': '진행중',
    'completed': '발송완료',
    'rejected': '반려'
  };

  const sorted = [...allRequests].sort((a, b) => {
    const score = (s) => (s === 'processing' ? 1 : s === 'accepted' ? 2 : s === 'pending' ? 3 : 4);
    return score(a.status) - score(b.status);
  });

  select.innerHTML = sorted.map(r => {
    const itemSummary = (r.items && r.items[0]) ? `${r.items[0].name} ${r.items[0].spec || ''}` : '품목';
    const statusText = statusLabels[r.status] || r.status;
    return `<option value="${r.id}">[${r.id}] ${r.clientName} - ${itemSummary} (${statusText})</option>`;
  }).join('');
}

async function runErpSimulation() {
  const select = document.getElementById('erp-sim-req-select');
  const resultDiv = document.getElementById('erp-sim-result');
  if (!select || !select.value) {
    alert('테스트할 의뢰서를 선택해주세요.');
    return;
  }

  const reqId = select.value;
  const targetReq = allRequests.find(r => r.id === reqId);
  const clientName = targetReq ? targetReq.clientName : '거래처';
  const itemName = (targetReq && targetReq.items && targetReq.items[0]) ? targetReq.items[0].name : '배관용 탄소강관';

  resultDiv.classList.remove('hidden');
  resultDiv.className = 'p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-medium space-y-1';
  resultDiv.innerHTML = `
    <div class="flex items-center space-x-2">
      <div class="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      <span>사내 ERP에서 성적서 PDF 데이터를 암호화 전송 중... (Target: ${reqId})</span>
    </div>
  `;

  // Standard valid PDF header & structure (A4 Mill Test Certificate format)
  const pdfSampleContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 320 >> stream
BT
/F1 18 Tf
50 780 Td
(KUMKANG KIND CO., LTD. - MILL TEST CERTIFICATE) Tj
/F1 11 Tf
0 -40 Td
(Document No: ${reqId}) Tj
0 -25 Td
(Client Name: ${clientName}) Tj
0 -25 Td
(Product Spec: ${itemName}) Tj
0 -25 Td
(Quality Standard: KS D 3568 / JIS G 3466 Compliant) Tj
0 -25 Td
(Inspection Result: PASS - Approved by Kumkang Kind QA Dept) Tj
0 -25 Td
(ERP Electronic Signature & Hash Validated) Tj
ET
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000615 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
686
%%EOF`;

  const base64Data = btoa(unescape(encodeURIComponent(pdfSampleContent)));
  const fileName = `금강공업_ERP_시험성적서_${reqId}.pdf`;

  try {
    const res = await fetch('/api/erp/upload-report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ERP-API-KEY': 'KUMKANG-ERP-SECRET-2026'
      },
      body: JSON.stringify({
        requestId: reqId,
        fileName: fileName,
        fileData: base64Data,
        approver: 'ERP 품질자동승인 (하지현)',
        adminNotes: '사내 ERP 결재 승인 연동 ➔ 공인 성적서 PDF 자동 첨부 및 거래처 발송 완료 (규격 적합)'
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      resultDiv.className = 'p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium';
      resultDiv.innerHTML = `❌ ERP 전송 실패: ${data.error || '알 수 없는 오류'}`;
      return;
    }

    resultDiv.className = 'p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium space-y-2';
    resultDiv.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="font-bold text-emerald-700 flex items-center space-x-1.5">
          <i data-lucide="check-circle" class="w-4 h-4 text-emerald-600"></i>
          <span>🎉 ERP 다이렉트 전송 및 발송완료 연동 성공!</span>
        </span>
        <span class="text-[11px] text-slate-500">${new Date().toLocaleTimeString()}</span>
      </div>
      <div class="text-[11px] text-slate-700 bg-white p-2.5 rounded border border-emerald-100 space-y-1">
        <div>• <strong>의뢰번호:</strong> ${reqId} (${clientName})</div>
        <div>• <strong>수신 파일명:</strong> <code class="font-mono text-indigo-700 font-bold">${fileName}</code></div>
        <div>• <strong>상태 전환:</strong> <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">completed (발송완료)</span></div>
        <div>• <strong>결재자:</strong> ERP 품질자동승인 (하지현)</div>
      </div>
      <div class="flex items-center space-x-2 pt-1">
        <a href="/api/download-report/${reqId}" target="_blank" class="inline-flex items-center space-x-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm transition">
          <i data-lucide="file-down" class="w-3.5 h-3.5"></i>
          <span>📄 전송된 성적서 PDF 열기 / 다운로드</span>
        </a>
        <button onclick="closeUsersModal()" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition font-medium">
          목록 확인하러 가기
        </button>
      </div>
    `;

    showToast(`🚀 [ERP 연동] ${reqId} 성적서가 자동 등록되어 발송완료 처리되었습니다!`, 'success');
    await fetchRequests();
    await fetchStats();
    populateErpSimulatorRequests();
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    resultDiv.className = 'p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium';
    resultDiv.innerHTML = `❌ ERP 통신 에러: ${err.message}`;
  }
}
