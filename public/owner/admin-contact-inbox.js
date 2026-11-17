(function connectAdminContactInbox() {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const original = window.renderMasterCases;
  let dialog;
  function mount() {
    const panel = document.getElementById('panel-master-cases');
    if (!panel || panel.dataset.contactInbox) return;
    panel.dataset.contactInbox = 'true';
    const type = document.getElementById('masterCaseTypeFilter');
    type.insertAdjacentHTML('beforeend', '<option value="입점 문의">입점 문의</option><option value="건의사항">건의사항</option>');
    type.parentElement.insertAdjacentHTML('beforeend', '<input id="adminContactSearch" type="search" placeholder="제목·내용·담당자·연락처 검색" aria-label="문의 검색"><button type="button" class="secondary-btn" id="adminContactRefresh">새로고침</button><span id="adminContactStatus" role="status"></span>');
    document.getElementById('adminContactSearch').addEventListener('input', () => window.renderMasterCases());
    document.getElementById('adminContactRefresh').addEventListener('click', async event => {
      event.target.disabled = true;
      try { await window.loadMotfAdminSupportCases(); } finally { event.target.disabled = false; }
    });
    dialog = document.createElement('dialog');
    dialog.className = 'admin-contact-dialog';
    dialog.setAttribute('aria-label', '문의 상세 및 처리');
    document.body.append(dialog);
    panel.addEventListener('click', event => {
      const button = event.target.closest('[data-contact-detail]');
      if (button) openDetail(button.dataset.contactDetail);
    });
  }
  window.renderMasterCases = function renderContactInbox() {
    if (window.motfCurrentProfile?.role !== 'admin') return original?.();
    mount();
    const body = document.getElementById('masterCaseTableBody');
    if (!body) return;
    const type = document.getElementById('masterCaseTypeFilter').value;
    const status = document.getElementById('masterCaseStatusFilter').value;
    const search = document.getElementById('adminContactSearch').value.trim().toLowerCase();
    const rows = masterExtendedData.cases.filter(item => (type === 'all' || item.type === type) && (status === 'all' || item.status === status)
      && `${item.title} ${item.detail} ${item.reporter} ${Object.values(item.contact || {}).join(' ')}`.toLowerCase().includes(search));
    document.getElementById('adminContactStatus').textContent = `${rows.length}건`;
    body.innerHTML = rows.length ? rows.map(item => `<tr><td><code>${esc(item.id.slice(0,8))}</code></td><td>${esc(item.type)}</td><td>${item.reporter}</td><td>${item.partner}</td><td><button type="button" class="secondary-btn" data-contact-detail="${esc(item.id)}">${item.title}</button></td><td>${esc(new Date(item.createdAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}))}</td><td>${esc(item.status)}</td></tr>`).join('') : '<tr><td colspan="7">조건에 맞는 접수 건이 없습니다.</td></tr>';
  };
  function openDetail(id) {
    const item = masterExtendedData.cases.find(row => row.id === id);
    if (!item) return;
    const contact = item.contact || {};
    dialog.innerHTML = `<form><header><h2>${item.title}</h2><button type="button" class="secondary-btn" data-close>닫기</button></header><p>접수번호 ${esc(item.id)}</p><dl>${Object.entries({유형:item.type,업장종류:contact.businessType,업장명:contact.businessName,담당자:contact.contactName,연락처:contact.contact,건의유형:contact.topic}).filter(([,value])=>value).map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl><div class="admin-contact-body">${item.detail}</div><label>처리 상태<select name="status"><option value="received" ${item.status==='접수'?'selected':''}>접수</option><option value="processing" ${item.status==='처리 중'?'selected':''}>처리 중</option><option value="resolved" ${item.status==='완료'?'selected':''}>완료</option></select></label><label>처리 메모<textarea name="note" rows="4" maxlength="3000">${esc(item.note)}</textarea></label><p role="status"></p><footer><button type="submit" class="primary-btn">처리 내용 저장</button></footer></form>`;
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    dialog.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      if (window.motfCurrentProfile?.role !== 'admin') return;
      const form = event.target, button = form.querySelector('[type="submit"]'), status = form.querySelector('[role="status"]');
      const values = new FormData(form);
      button.disabled = true;
      try {
        const {error} = await window.motfSupabase.rpc('review_support_case',{ target_case_id:id, new_status:values.get('status'), note:values.get('note') });
        if (error) throw error;
        status.textContent = '저장되었습니다.';
        await window.loadMotfAdminSupportCases();
      } catch { status.textContent = '저장하지 못했습니다. 다시 시도해주세요.'; }
      finally { button.disabled = false; }
    };
    dialog.showModal();
  }
  window.motfSupabase?.auth.onAuthStateChange((_event,session) => { if (!session) dialog?.close(); });
})();
