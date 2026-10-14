(function connectBusinessWorkspaces() {
  let workspaces = [];
  let selectedId = '';
  let navigating = false;
  window.motfPortalActive = false;
  window.motfHasBusinessPermission = (cap) => Boolean(window.motfPortalActive && selectedId &&
    workspaces.some((item) => item.id === selectedId && item.can_open &&
      (item.workspace_role === 'representative' || (item.permissions || []).includes(cap))));
  window.motfIsBusinessRepresentative = () => Boolean(window.motfPortalActive &&
    workspaces.some((item) => item.id === selectedId && item.can_open && item.workspace_role === 'representative'));
  const panelPermissions = { calendar: 'availability', orders: 'reservations', availability: 'availability', chat: 'chat', reviews: 'listing', revenue: 'settlements', settlements: 'settlements' };
  window.motfCanOpenOwnerPanel = (panel) => panel === 'mypage' || (Boolean(selectedId) &&
    (panel === 'operations' || window.motfHasBusinessPermission(panelPermissions[panel])));
  window.motfApplyWorkspacePermissions = function applyPermissions() {
    if (!window.motfPortalActive) return;
    document.querySelectorAll('[onclick*="switchPanel("]').forEach((button) => {
      const panel = button.getAttribute('onclick').match(/switchPanel\(['"]([^'"]+)/)?.[1];
      if (panel) button.hidden = !window.motfCanOpenOwnerPanel(panel);
    });
    document.querySelectorAll('[onclick*="motfOpenPartnerTransactionChat("]').forEach((button) => { button.hidden = !window.motfHasBusinessPermission('chat'); });
    const listing = window.motfHasBusinessPermission('listing');
    document.querySelectorAll('#panel-mypage [data-listing-only]').forEach((node) => { node.hidden = !listing; });
    const policy = document.getElementById('motfMarketOrderPolicyFields');
    if (policy) policy.hidden = !listing || window.motfCurrentBusiness?.business_type !== 'market';
    document.querySelectorAll('#panel-mypage .edit-section').forEach((node) => { node.hidden = !listing; });
    if (!listing) document.getElementById('motfPartnerOnboardingNotice').hidden = true;
    const account = document.getElementById('motfOwnerAccountFields');
    if (account) { account.hidden = !window.motfIsBusinessRepresentative(); if (account.previousElementSibling) account.previousElementSibling.hidden = account.hidden; }
    document.querySelectorAll('[onclick="saveMypageData()"], #motfListingReviewNotice').forEach((node) => { node.hidden = !listing; });
    document.querySelectorAll('#motfSettlementBank, #motfSettlementAccount, #motfSettlementHolder').forEach((node) => { (node.closest('label') || node).hidden = !window.motfIsBusinessRepresentative(); });
  };
  const storageKey = (userId) => `motf-owner-workspace:${userId}`;
  const readSaved = (userId) => {
    try { return sessionStorage.getItem(storageKey(userId)) || ''; } catch { return ''; }
  };
  const remember = (userId, businessId) => {
    try { sessionStorage.setItem(storageKey(userId), businessId); } catch { /* Storage may be disabled. */ }
  };

  window.motfClearBusinessWorkspaces = function clearBusinessWorkspaces() {
    workspaces = [];
    selectedId = '';
    navigating = false;
    window.motfPortalActive = false;
    window.motfCurrentBusiness = null;
    window.motfCurrentSettlementAccount = null;
    document.getElementById('motfWorkspaceManagement')?.remove();
    window.dispatchEvent(new CustomEvent('motf:owner-workspace-clear'));
    document.querySelectorAll('[data-business-workspace]').forEach((host) => {
      host.replaceChildren();
      host.hidden = true;
    });
  };

  window.motfResolvePartnerWorkspace = async function resolvePartnerWorkspace(profile, fields) {
    const client = window.motfSupabase;
    const { data, error } = await client.rpc('list_own_business_workspaces');
    if (error) throw new Error(`업장 목록을 불러오지 못했습니다: ${error.message}`);
    workspaces = (Array.isArray(data) ? data : []).map((item) => ({ ...item, business_name: item.business_name || item.name, business_type: item.business_type || item.type }));
    window.motfPortalActive = true;
    const params = new URLSearchParams(window.location.search);
    let requested = params.get('businessId') || '';
    const conversationId = params.get('conversationId');
    if (conversationId && workspaces.some((item) => item.can_open && (item.workspace_role === 'representative' || item.permissions?.includes('chat')))) {
      const { data: conversation, error: chatError } = await client.from('conversations')
        .select('business_id').eq('id', conversationId).maybeSingle();
      if (chatError || !conversation || (requested && requested !== conversation.business_id)) {
        throw new Error('이 채팅 링크를 열 수 없습니다. 접근 권한 또는 업장 정보를 확인해 주세요.');
      }
      requested = conversation.business_id;
    }
    const chosen = requested
      ? workspaces.find((item) => item.id === requested)
      : workspaces.find((item) => item.id === readSaved(profile.id) && item.can_open)
        || workspaces.find((item) => item.can_open);
    if (!chosen && !requested) return null;
    if (!chosen) throw new Error('이 업장의 관리 권한이 없습니다.');
    if (!chosen.can_open) throw new Error('현재 이용할 수 없는 업장입니다. 입점 심사 상태를 확인해 주세요.');

    // Recheck ownership under RLS; a saved URL or workspace ID never grants access.
    const { data: business, error: businessError } = await client.from('businesses')
      .select(fields).eq('id', chosen.id).maybeSingle();
    if (businessError) throw new Error(`업장 정보를 불러오지 못했습니다: ${businessError.message}`);
    if (!business) throw new Error('이 업장의 관리 권한이 없습니다.');
    selectedId = business.id;
    remember(profile.id, selectedId);
    return business;
  };

  window.motfRenderBusinessWorkspaces = function renderBusinessWorkspaces() {
    const current = window.motfCurrentBusiness;
    if (current?.id === selectedId) {
      workspaces = workspaces.map((item) => item.id === selectedId ? { ...item, business_name: current.business_name } : item);
    }
    const labels = { approved: '운영 중', pending: '심사 대기', rejected: '반려', suspended: '이용 제한' };
    document.querySelectorAll('[data-business-workspace]').forEach((host, index) => {
      host.replaceChildren();
      host.hidden = !workspaces.length || !window.motfPortalActive;
      if (host.hidden) return;
      const label = document.createElement('label');
      label.textContent = '관리 업장';
      label.htmlFor = `motfBusinessWorkspace-${index}`;
      const select = document.createElement('select');
      select.id = label.htmlFor;
      if (!selectedId) { const option = document.createElement('option'); option.value = ''; option.textContent = '업장 선택'; option.disabled = true; select.append(option); }
      workspaces.forEach((item) => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = `${item.business_name} · ${item.workspace_role === 'representative' ? '대표' : '직원'} · ${labels[item.approval_status] || '확인 필요'}`;
        option.disabled = !item.can_open;
        select.append(option);
      });
      select.value = selectedId;
      select.addEventListener('change', () => {
        const nextId = select.value;
        select.value = selectedId;
        if (navigating || nextId === selectedId || !workspaces.some((item) => item.id === nextId && item.can_open)) return;
        if (window.motfLoading?.isBusy()) return alert('현재 작업을 처리하고 있습니다. 완료 후 업장을 전환해 주세요.');
        if (!confirm('다른 업장으로 전환할까요? 저장하지 않은 수정사항과 작성 중인 채팅은 사라집니다.')) return;
        navigating = true;
        document.querySelectorAll('[data-business-workspace] select').forEach((element) => { element.disabled = true; });
        const url = new URL(window.location.href);
        ['conversationId', 'organizationId', 'reservationId', 'orderId', 'open', 'panel', 'section'].forEach((key) => url.searchParams.delete(key));
        url.searchParams.set('businessId', nextId);
        url.hash = '';
        // A fresh document prevents previous-business forms, caches and listeners leaking across scopes.
        window.location.assign(url.href);
      });
      host.append(label, select);
    });
  };
  const capabilities = { reservations: '예약·주문', availability: '방막기·재고', chat: '채팅', listing: '업장 정보', settlements: '매출·정산' };
  let dashboard = null;
  let busy = false;
  const element = (tag, text) => { const node = document.createElement(tag); if (text) node.textContent = text; return node; };
  function actionButton(label, action, payload, reload = false) {
    const button = element('button', label);
    button.type = 'button';
    button.className = 'secondary-btn';
    button.addEventListener('click', () => runAction(action, typeof payload === 'function' ? payload() : payload, reload));
    return button;
  }
  function permissionInputs(values = []) {
    const group = element('fieldset');
    group.append(element('legend', '직원 권한'));
    Object.entries(capabilities).forEach(([cap, label]) => {
      const input = element('input'); input.type = 'checkbox'; input.value = cap; input.checked = values.includes(cap);
      const host = element('label'); host.append(input, document.createTextNode(label)); group.append(host);
    });
    return group;
  }
  const permissionsOf = (group) => [...group.querySelectorAll('input:checked')].map((input) => input.value);
  function statusText(item) {
    const labels = { pending: '수락 대기', requested: '이전 수락 대기', accepted: '대표 확정 대기', confirmed: '이전 완료', completed: '완료', revoked: '회수', cancelled: '취소', expired: '만료', active: '활성' };
    return `${labels[item.status] || item.status || '수락 대기'}${item.expires_at ? ` · 만료 ${new Date(item.expires_at).toLocaleString('ko-KR')}` : ''}`;
  }
  function pending(item) { return item.status === 'pending' && (!item.expires_at || new Date(item.expires_at).getTime() > Date.now()); }
  function transferRequested(item) { return item.status === 'requested' && (!item.expires_at || new Date(item.expires_at).getTime() > Date.now()); }
  const canCreate = () => window.motfCurrentProfile?.role === 'partner' && window.motfCurrentProfile?.status === 'approved';
  const canDiscardDraft = () => window.motfIsBusinessRepresentative() &&
    workspaces.some((item) => item.id === selectedId && ['pending', 'rejected'].includes(item.approval_status));
  async function discardDraft() {
    if (busy || !canDiscardDraft()) return;
    if (!confirm('예약·주문·결제 등 거래 이력이 전혀 없는 업장 초안만 정리할 수 있습니다. 정리한 초안은 복구할 수 없습니다. 이 업장 초안을 정리할까요?')) return;
    busy = true;
    const host = document.getElementById('motfWorkspaceManagement');
    host.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    host.querySelector('[role="status"]').textContent = '업장 초안을 정리하는 중...';
    try {
      const { error } = await window.motfSupabase.rpc('discard_business_workspace_draft', { target_business_id: selectedId });
      if (error) throw error;
      remember(window.motfCurrentProfile.id, '');
      const url = new URL(location.href);
      ['businessId', 'conversationId', 'organizationId', 'reservationId', 'orderId', 'open', 'panel', 'section', 'invitation_token', 'invite_token'].forEach((key) => url.searchParams.delete(key));
      url.hash = '';
      location.assign(url.href);
    } catch (error) { host.querySelector('[role="status"]').textContent = error.message || '업장 초안을 정리하지 못했습니다.'; }
    finally { busy = false; host.querySelectorAll('button').forEach((button) => { button.disabled = false; }); }
  }
  async function runAction(action, payload, reload) {
    if (busy || !payload) return;
    const status = document.querySelector('#motfWorkspaceManagement [role="status"]');
    if (action === 'create' && !canCreate()) return;
    if (action === 'create' && (!payload.business_name || !['stay', 'market'].includes(payload.business_type))) {
      status.textContent = '새 업장명과 업장 유형을 입력해 주세요.';
      return;
    }
    if (['invite', 'transfer_start'].includes(action)) {
      payload.username = String(payload.username || '').trim().toLowerCase();
      if (!/^[a-z0-9_]{4,24}$/.test(payload.username)) { status.textContent = '가입 아이디는 영문·숫자·밑줄 4~24자리로 입력해 주세요.'; return; }
    }
    if (['revoke', 'transfer_start', 'transfer_accept', 'transfer_confirm', 'transfer_cancel'].includes(action)
      && !confirm(action === 'transfer_confirm' ? '대표 권한을 이전하면 현재 계정의 업장 관리 권한이 변경됩니다. 확정할까요?' : '이 작업을 진행할까요?')) return;
    busy = true;
    const host = document.getElementById('motfWorkspaceManagement');
    host.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    const message = host.querySelector('[role="status"]');
    message.textContent = '처리 중...';
    try {
      if (action === 'transfer_accept') await window.motfVerifyBusinessTransfer(payload.transfer_id);
      const { data, error } = await window.motfSupabase.rpc('manage_business_workspace', { action, payload });
      if (error) throw error;
      if (reload || data?.business_id && action === 'create') {
        const url = new URL(location.href);
        ['businessId', 'conversationId', 'panel', 'open', 'invitation_token', 'invite_token'].forEach((key) => url.searchParams.delete(key));
        if (action === 'create') url.searchParams.set('businessId', data.business_id);
        location.assign(url.href);
        return;
      }
      await window.motfLoadWorkspaceDashboard();
      const result = document.querySelector('#motfWorkspaceManagement [role="status"]');
      result.textContent = data?.invite_token ? `초대 완료 · 수락 토큰: ${data.invite_token}` : '처리가 완료되었습니다.';
    } catch (error) { message.textContent = error.message || '요청을 처리하지 못했습니다.'; }
    finally { busy = false; host.querySelectorAll('button').forEach((button) => { button.disabled = false; }); }
  }
  function renderManagement() {
    let host = document.getElementById('motfWorkspaceManagement');
    if (!host) {
      host = element('div'); host.id = 'motfWorkspaceManagement';
      document.getElementById('panel-mypage').prepend(host);
    }
    host.replaceChildren();
    host.append(element('h3', '업장 계정 관리'));
    const message = element('p'); message.setAttribute('role', 'status'); host.append(message);
    if (!selectedId) host.append(element('p', canCreate() ? '관리할 업장이 없습니다. 받은 초대를 수락하거나 업장을 추가해 주세요.' : '관리할 업장이 없습니다. 받은 직원 초대나 대표 이전 요청을 수락해 주세요.'));
    const tokenForm = element('form');
    const tokenLabel = element('label', '초대 토큰');
    const token = element('input'); token.name = 'token'; token.required = true; token.autocomplete = 'off';
    token.value = new URLSearchParams(location.search).get('invitation_token') || new URLSearchParams(location.search).get('invite_token') || '';
    tokenLabel.append(token); tokenForm.append(tokenLabel);
    const accept = element('button', '초대 수락'); accept.type = 'submit'; accept.className = 'secondary-btn'; tokenForm.append(accept);
    tokenForm.addEventListener('submit', (event) => { event.preventDefault(); runAction('accept', { token: token.value.trim() }, true); });
    host.append(tokenForm, element('h4', '받은 초대 및 대표 이전'));
    const userId = window.motfCurrentProfile.id;
    const incoming = (dashboard.invitations || []).filter((item) => item.invited_user_id === userId);
    incoming.forEach((item) => {
      const row = element('div'); row.className = 'workspace-member';
      row.append(element('strong', item.business_name || '업장 초대'), element('small', statusText(item)));
      if (pending(item)) row.append(actionButton('직원 초대 수락', 'accept', { invitation_id: item.id }, true));
      host.append(row);
    });
    const transfers = (dashboard.transfers || []).filter((item) => item.to_user_id === userId || item.from_user_id === userId);
    transfers.forEach((item) => {
      const row = element('div'); row.className = 'workspace-member';
      row.append(element('strong', `${item.business_name || '업장'} → ${item.to_username || '새 대표'}`), element('small', statusText(item)));
      if (item.to_user_id === userId && transferRequested(item)) row.append(actionButton('본인인증 후 이전 수락', 'transfer_accept', { transfer_id: item.id }, true));
      if (item.from_user_id === userId && item.status === 'accepted' && (!item.expires_at || new Date(item.expires_at).getTime() > Date.now())) row.append(actionButton('대표 이전 확정', 'transfer_confirm', { transfer_id: item.id }, true));
      if (item.from_user_id === userId && ['requested', 'accepted'].includes(item.status)) row.append(actionButton('이전 취소', 'transfer_cancel', { transfer_id: item.id }));
      host.append(row);
    });
    if (!incoming.length && !transfers.length) host.append(element('p', '받은 요청이 없습니다.'));
    if (window.motfIsBusinessRepresentative()) {
      host.append(element('h4', '직원 관리'));
      const form = element('form');
      const label = element('label', '직원 아이디'); const username = element('input'); username.required = true; username.autocomplete = 'off'; label.append(username);
      const group = permissionInputs(['chat']); form.append(label, group);
      const invite = element('button', '직원 초대'); invite.type = 'submit'; invite.className = 'primary-btn'; form.append(invite);
      form.addEventListener('submit', (event) => { event.preventDefault(); runAction('invite', { business_id: selectedId, username: username.value.trim(), permissions: permissionsOf(group) }); });
      host.append(form);
      (dashboard.members || []).filter((item) => item.business_id === selectedId && item.user_id !== userId).forEach((item) => {
        const row = element('div'); row.className = 'workspace-member';
        row.append(element('strong', `${item.full_name || item.username || '직원'} · ${item.username || ''}`), element('small', item.status || ''));
        const group = permissionInputs(item.permissions || []); row.append(group);
        row.append(actionButton('권한 저장', 'permissions', () => ({ business_id: selectedId, user_id: item.user_id, permissions: permissionsOf(group) })), actionButton('직원 권한 회수', 'revoke', { business_id: selectedId, user_id: item.user_id }));
        host.append(row);
      });
      (dashboard.invitations || []).filter((item) => item.business_id === selectedId && item.invited_user_id !== userId).forEach((item) => {
        const row = element('div'); row.className = 'workspace-member';
        row.append(element('strong', `초대: ${item.invited_username || '직원'}`), element('small', statusText(item)));
        if (pending(item)) row.append(actionButton('초대 회수', 'revoke', { business_id: selectedId, user_id: item.invited_user_id }));
        host.append(row);
      });
      const transfer = element('form'); const labelTransfer = element('label', '새 대표 아이디'); const successor = element('input'); successor.required = true; labelTransfer.append(successor);
      const start = element('button', '대표 이전 요청'); start.type = 'submit'; start.className = 'secondary-btn'; transfer.append(labelTransfer, start);
      transfer.addEventListener('submit', (event) => { event.preventDefault(); runAction('transfer_start', { business_id: selectedId, username: successor.value.trim() }); });
      host.append(element('h4', '대표 이전'), transfer);
      if (canDiscardDraft()) {
        const discard = element('button', '업장 초안 정리'); discard.type = 'button'; discard.className = 'secondary-btn';
        discard.addEventListener('click', discardDraft);
        host.append(element('h4', '초안 관리'), discard);
      }
    }
    if (canCreate()) {
      const create = element('form'); const label = element('label', '새 업장명'); const name = element('input'); name.required = true; name.maxLength = 100; label.append(name);
      const typeLabel = element('label', '업장 유형'); const type = element('select');
      [['stay', '숙소'], ['market', '장보기']].forEach(([value, text]) => { const option = element('option', text); option.value = value; type.append(option); }); typeLabel.append(type);
      const submit = element('button', '업장 초안 추가'); submit.type = 'submit'; submit.className = 'primary-btn'; create.append(label, typeLabel, submit);
      create.addEventListener('submit', (event) => { event.preventDefault(); runAction('create', { business_name: name.value.trim(), business_type: type.value }, true); });
      host.append(element('h4', '업장 추가'), create);
    }
    const logout = element('button', '모든 기기에서 로그아웃');
    logout.type = 'button'; logout.className = 'secondary-btn';
    logout.addEventListener('click', async () => {
      if (!confirm('모든 기기의 로그인 갱신을 중단하고 이 기기에서 로그아웃합니다. 기존 접근 토큰은 만료 전까지 유효할 수 있습니다. 진행할까요?')) return;
      logout.disabled = true;
      try {
        const { error } = await window.motfSupabase.auth.signOut({ scope: 'global' });
        if (error) throw error;
        window.motfClearBusinessWorkspaces();
        window.motfCurrentProfile = null;
        location.reload();
      } catch (error) { message.textContent = error.message || '로그아웃하지 못했습니다.'; logout.disabled = false; }
    });
    host.append(element('h4', '로그인 보안'), logout);
  }
  window.motfLoadWorkspaceDashboard = async function loadDashboard() {
    if (!window.motfPortalActive || !window.motfSupabase || !window.motfCurrentProfile) return;
    const { data, error } = await window.motfSupabase.rpc('business_workspace_dashboard');
    if (error) throw error;
    dashboard = data || {};
    if (Array.isArray(dashboard.workspaces)) {
      workspaces = dashboard.workspaces.map((item) => ({ ...item, business_name: item.business_name || item.name, business_type: item.business_type || item.type }));
      if (selectedId && !workspaces.some((item) => item.id === selectedId && item.can_open)) {
        selectedId = '';
        window.motfCurrentBusiness = null;
      }
      if (!window.motfIsBusinessRepresentative()) window.motfCurrentSettlementAccount = null;
      window.motfRenderBusinessWorkspaces();
    }
    renderManagement();
    window.motfApplyWorkspacePermissions();
  };
  window.addEventListener('motf:owner-panel-change', (event) => {
    window.motfApplyWorkspacePermissions();
    if (event.detail?.panelId === 'mypage' && window.motfPortalActive) {
      window.motfLoadWorkspaceDashboard().catch((error) => {
        let host = document.getElementById('motfWorkspaceManagement');
        if (!host) { host = element('div'); host.id = 'motfWorkspaceManagement'; document.getElementById('panel-mypage').prepend(host); }
        host.textContent = `계정 관리 정보를 불러오지 못했습니다: ${error.message}`;
      });
    }
  });
})();
