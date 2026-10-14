(function connectAdminOrganizationHandoff() {
  let organizations = [];
  let loading = false;
  let submitting = false;
  const host = () => document.getElementById('motfAdminOrganizationHandoff');
  const isAdmin = () => window.motfCurrentProfile?.role === 'admin' && window.motfCurrentProfile?.status === 'approved';
  const option = (value, label) => { const node = document.createElement('option'); node.value = value; node.textContent = label; return node; };
  const selectedOrganization = () => organizations.find((item) => item.id === host().querySelector('[name=organizationId]').value);
  const eligibleMembers = (organization) => (organization?.members || []).filter((member) => member.identity_verified === true
    && member.user_id !== organization.representative_id && (!member.status || member.status === 'active'));

  function renderRecipient() {
    const organization = selectedOrganization();
    const select = host().querySelector('[name=userId]');
    select.replaceChildren(option('', '새 대표 선택'));
    const members = eligibleMembers(organization);
    members.forEach((member) => select.append(option(member.user_id, `${member.username || member.full_name || member.user_id} · ${member.full_name || ''} · 본인인증 완료`)));
    select.disabled = submitting || !members.length;
    host().querySelector('[type=submit]').disabled = submitting || !select.value;
    const current = organization?.members?.find((member) => member.user_id === organization.representative_id);
    host().querySelector('[data-organization-detail]').textContent = organization
      ? `${organization.affiliation || ''} · 현재 대표 ${current?.username || current?.full_name || organization.representative_id || '미등록'}${members.length ? '' : ' · 이전 가능한 본인인증 회원이 없습니다.'}` : '';
  }

  function renderOrganizations() {
    const select = host().querySelector('[name=organizationId]');
    const previous = select.value;
    const query = host().querySelector('[type=search]').value.trim().toLowerCase();
    select.replaceChildren(option('', organizations.length ? '단체 선택' : '활성 단체가 없습니다.'));
    organizations.filter((item) => !query || [item.name, item.affiliation, item.id].join(' ').toLowerCase().includes(query))
      .forEach((item) => select.append(option(item.id, `${item.name || '단체'}${item.affiliation ? ` · ${item.affiliation}` : ''}`)));
    if ([...select.options].some((item) => item.value === previous)) select.value = previous;
    renderRecipient();
  }

  async function submit(event) {
    event.preventDefault();
    if (!isAdmin() || submitting || loading) return;
    const organization = selectedOrganization();
    const form = event.currentTarget;
    const member = eligibleMembers(organization).find((item) => item.user_id === form.elements.userId.value);
    const reason = form.elements.reason.value.trim();
    const message = host().querySelector('[role=status]');
    if (!organization || !member || reason.length < 6) { message.textContent = '단체와 본인인증을 마친 새 대표를 선택하고 사유를 6자 이상 입력해 주세요.'; return; }
    if (!confirm(`${organization.name}의 대표를 ${member.username || member.full_name}에게 예외 이전할까요?\n사유: ${reason}\n기존 대표 권한이 변경되며 이 작업은 감사 기록에 남습니다.`)) return;
    submitting = true;
    host().querySelectorAll('input, select, textarea, button').forEach((node) => { node.disabled = true; });
    message.textContent = '대표 예외 이전 처리 중...';
    try {
      const { error } = await window.motfSupabase.rpc('manage_organization', { action: 'admin_handoff', payload: { organization_id: organization.id, user_id: member.user_id, reason } });
      if (error) throw error;
      form.elements.reason.value = '';
      const refreshed = await window.motfLoadAdminOrganizationWorkspaces();
      message.textContent = refreshed ? '대표 예외 이전이 완료되었습니다.' : '대표 이전은 완료되었지만 목록을 새로 불러오지 못했습니다. 새로고침해 주세요.';
    } catch (error) { message.textContent = error.message || '대표 이전을 처리하지 못했습니다.'; }
    finally {
      submitting = false;
      host().querySelectorAll('input, select, textarea, button').forEach((node) => { node.disabled = false; });
      renderRecipient();
    }
  }

  window.motfLoadAdminOrganizationWorkspaces = async function load() {
    const node = host();
    if (!node || !isAdmin() || !window.motfSupabase) { if (node) node.hidden = true; return; }
    node.hidden = false;
    if (!node.dataset.bound) {
      node.querySelector('form').addEventListener('submit', submit);
      node.querySelector('[type=search]').addEventListener('input', renderOrganizations);
      node.querySelector('[name=organizationId]').addEventListener('change', renderRecipient);
      node.querySelector('[name=userId]').addEventListener('change', () => { node.querySelector('[type=submit]').disabled = submitting || !node.querySelector('[name=userId]').value; });
      node.querySelector('[data-refresh-organizations]').addEventListener('click', () => window.motfLoadAdminOrganizationWorkspaces());
      node.dataset.bound = 'true';
    }
    if (loading) return;
    loading = true;
    const message = node.querySelector('[role=status]');
    message.textContent = '단체 목록을 불러오는 중...';
    try {
      const { data, error } = await window.motfSupabase.rpc('admin_list_organization_workspaces');
      if (error) throw error;
      if (!isAdmin()) return;
      organizations = Array.isArray(data) ? data : [];
      renderOrganizations();
      message.textContent = '';
      return true;
    } catch (error) {
      organizations = [];
      renderOrganizations();
      message.textContent = error.message || '단체 목록을 불러오지 못했습니다.';
      return false;
    } finally { loading = false; }
  };
  window.addEventListener('motf:owner-workspace-clear', () => {
    organizations = [];
    if (host()) { host().hidden = true; host().querySelector('form').reset(); }
  });
})();
