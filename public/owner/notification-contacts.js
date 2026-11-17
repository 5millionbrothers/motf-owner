(function connectNotificationContacts() {
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let loading = false;
  async function load() {
    if (loading || window.motfCurrentProfile?.role !== 'admin') return;
    const panel = $('#panel-master-partners');
    if (!panel) return;
    let host = $('#notificationContactManager');
    if (!host) {
      host = document.createElement('details'); host.id = 'notificationContactManager';
      host.innerHTML = '<summary>알림 수신번호 점검·확정</summary><p>공개 업장 번호와 계정 연락처가 다르면 수신자를 확인해주세요. 확정은 알림 수신번호만 지정하며, 기존 연락처나 발송 기록을 바꾸지 않습니다.</p><button type="button" class="secondary-btn" data-contact-refresh>새로고침</button><p role="status"></p><div data-contact-rows></div>';
      panel.querySelector('h2').after(host);
      host.addEventListener('click', (event) => {
        if (event.target.closest('[data-contact-refresh]')) void load();
      });
      host.addEventListener('submit', async (event) => {
        event.preventDefault(); const form = event.target;
        const phone = form.elements.phone.value.replace(/[^0-9]/g, '');
        if (!confirm(`${form.dataset.name} 사장님 알림을 ${phone} 번호로 보내도록 확정할까요? 실제 수신자와 확인한 번호만 등록해주세요. 이 작업은 알림을 발송하지 않습니다.`)) return;
        const button = form.querySelector('button'); button.disabled = true;
        try {
          const result = await window.motfSupabase.rpc('confirm_business_notification_contact', {target_business_id: form.dataset.businessId, target_phone: phone});
          if (result.error) throw result.error;
          await load(); host.querySelector('[role="status"]').textContent = '수신번호를 확정했습니다. 기존 발송 건은 재발송하지 않습니다.';
        } catch (error) { host.querySelector('[role="status"]').textContent = error.message; }
        finally { button.disabled = false; }
      });
    }
    loading = true;
    try {
      const result = await window.motfSupabase.rpc('list_business_notification_contacts');
      if (result.error) throw result.error;
      if (window.motfCurrentProfile?.role !== 'admin') { host.remove(); return; }
      host.querySelector('[data-contact-rows]').innerHTML = (result.data || []).map((row) => `<form data-business-id="${esc(row.business_id)}" data-name="${esc(row.business_name)}"><strong>${esc(row.business_name)}</strong><span>${row.confirmation_required ? '수신번호 확인 필요' : '발송 가능'}</span><p>공개 업장 번호: ${esc(row.business_phone || '없음')} / 계정 연락처: ${esc(row.account_phone || '없음')} / 계정: ${esc(row.account_name || '미입력')}</p><label>알림 수신 휴대폰<input name="phone" type="tel" autocomplete="off" required value="${esc(row.notification_phone || '')}" placeholder="수신자와 확인한 휴대폰 번호"></label><button type="submit" class="secondary-btn">수신번호 확정</button></form>`).join('');
    } catch (error) { host.querySelector('[role="status"]').textContent = error.message; }
    finally { loading = false; }
  }
  window.motfSaveOwnerPhone = async function () {
    const profile = window.motfCurrentProfile, input = $('#motfOwnerPhone');
    if (!profile?.id || input?.dataset.profileId !== profile.id) return alert('계정 정보를 다시 불러온 뒤 시도해주세요.');
    const phone = input.value.replace(/[^0-9]/g, '');
    if (!confirm(`현재 로그인한 계정의 연락처만 ${phone}로 바꿀까요? 공개 업장 번호는 바뀌지 않으며, 업장 알림 수신번호는 다시 확인해야 할 수 있습니다.`)) return;
    const button = $('#motfOwnerPhoneSave'); button.disabled = true;
    try {
      const result = await window.motfSupabase.rpc('update_partner_contact_phone', {target_phone:phone,expected_profile_id:profile.id});
      if (result.error) throw result.error;
      if (window.motfCurrentProfile?.id === profile.id) { profile.phone = result.data; input.value = result.data; }
      const business = window.motfCurrentBusiness, status = $('#motfNotificationPhoneStatus');
      if (business?.id && status) {
        const contact = await window.motfSupabase.rpc('own_business_notification_phone', {target_business_id:business.id});
        if (window.motfCurrentBusiness?.id === business.id && window.motfCurrentProfile?.id === profile.id) status.textContent = contact.error ? '알림 수신번호를 다시 확인해주세요.' : contact.data ? `알림 수신번호: ${contact.data}` : '알림 수신번호 확인이 필요합니다. 운영팀에 수신번호 확정을 요청해주세요.';
      }
      alert('계정 연락처를 저장했습니다.');
    } catch (error) { alert(error.message); }
    finally { button.disabled = false; }
  };
  const loadBusiness = window.loadMotfPartnerBusiness;
  window.loadMotfPartnerBusiness = function (business,...args) {
    const result = loadBusiness?.call(this,business,...args);
    if (!business?.id || !window.motfHasBusinessPermission?.('listing')) return result;
    let status = $('#motfNotificationPhoneStatus');
    if (!status) { status = document.createElement('small'); status.id = 'motfNotificationPhoneStatus'; status.className = 'motf-field-status'; $('#motfBusinessPhone')?.parentElement.append(status); }
    status.textContent = '알림 수신번호 확인 중';
    const profileId = window.motfCurrentProfile?.id;
    void window.motfSupabase.rpc('own_business_notification_phone', {target_business_id:business.id}).then(({data,error}) => {
      if (window.motfCurrentBusiness?.id !== business.id || window.motfCurrentProfile?.id !== profileId) return;
      status.textContent = error ? '알림 수신번호를 불러오지 못했습니다.' : data ? `알림 수신번호: ${data}` : '알림 수신번호 확인이 필요합니다. 운영팀에 수신번호 확정을 요청해주세요.';
    }).catch(() => { if (window.motfCurrentBusiness?.id === business.id) status.textContent = '알림 수신번호를 불러오지 못했습니다.'; });
    return result;
  };
  const init = window.initAdminMasterDashboard;
  window.initAdminMasterDashboard = function (...args) { const result = init?.apply(this,args); void load(); return result; };
  const change = window.switchMasterPanel;
  window.switchMasterPanel = function (panel,...args) { const result = change?.call(this,panel,...args); if (panel === 'master-partners') void load(); return result; };
  window.addEventListener('motf:owner-workspace-clear', () => {
    $('#notificationContactManager')?.remove();
    ['motfOwnerPhone','motfOwnerEmail','motfOwnerUsername'].forEach((id) => { const input = document.getElementById(id); if (input) { input.value = ''; delete input.dataset.profileId; } });
  });
})();
