(function connectBusinessWorkspaces() {
  let workspaces = [];
  let selectedId = '';
  let navigating = false;
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
    document.querySelectorAll('[data-business-workspace]').forEach((host) => {
      host.replaceChildren();
      host.hidden = true;
    });
  };

  window.motfResolvePartnerWorkspace = async function resolvePartnerWorkspace(profile, fields) {
    const client = window.motfSupabase;
    const { data, error } = await client.rpc('list_own_business_workspaces');
    if (error) throw new Error(`업장 목록을 불러오지 못했습니다. DB79 적용을 확인해 주세요: ${error.message}`);
    workspaces = Array.isArray(data) ? data : [];
    if (!workspaces.length) throw new Error('연결된 업장 정보를 찾을 수 없습니다. 운영팀에 문의해 주세요.');
    const params = new URLSearchParams(window.location.search);
    let requested = params.get('businessId') || '';
    const conversationId = params.get('conversationId');
    if (conversationId) {
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
    if (!chosen) throw new Error(requested ? '이 업장의 관리 권한이 없습니다.' : '현재 관리할 수 있는 업장이 없습니다. 입점 심사 상태를 확인해 주세요.');
    if (!chosen.can_open) throw new Error('현재 이용할 수 없는 업장입니다. 입점 심사 상태를 확인해 주세요.');

    // Recheck ownership under RLS; a saved URL or workspace ID never grants access.
    const { data: business, error: businessError } = await client.from('businesses')
      .select(fields).eq('owner_id', profile.id).eq('id', chosen.id).maybeSingle();
    if (businessError) throw new Error(`업장 정보를 불러오지 못했습니다: ${businessError.message}`);
    if (!business || business.owner_id !== profile.id) throw new Error('이 업장의 관리 권한이 없습니다.');
    if (business.approval_status !== 'approved'
      && !(business.import_job_id && ['pending', 'rejected'].includes(business.approval_status))) {
      throw new Error('현재 이용할 수 없는 업장입니다. 운영팀에 문의해 주세요.');
    }
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
      host.hidden = workspaces.length < 2 || window.motfCurrentProfile?.role !== 'partner';
      if (host.hidden) return;
      const label = document.createElement('label');
      label.textContent = '관리 업장';
      label.htmlFor = `motfBusinessWorkspace-${index}`;
      const select = document.createElement('select');
      select.id = label.htmlFor;
      workspaces.forEach((item) => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = `${item.business_name} · ${item.business_type === 'market' ? '장보기' : '숙소'} · ${labels[item.approval_status] || '확인 필요'}`;
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
})();
