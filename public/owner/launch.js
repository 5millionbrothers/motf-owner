(function prepareOwnerLaunch() {
  window.motfMarketCategories = ['정육','주류','음료','과자·안주','즉석밥','라면','채소·농산물','김치·반찬','통조림·가공식품','조미료·소스','숙취해소','일회용품','생활용품','기타'];
  window.motfWorkspaceDialogHost = function workspaceDialogHost() {
    let dialog = document.getElementById('motfWorkspaceDialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'motfWorkspaceDialog';
      dialog.className = 'owner-workspace-dialog';
      dialog.setAttribute('aria-label', '업장 계정 관리');
      const close = document.createElement('button');
      close.type = 'button'; close.className = 'secondary-btn workspace-dialog-close';
      close.textContent = '닫기'; close.onclick = () => dialog.close();
      dialog.append(close); document.body.append(dialog);
    }
    return dialog;
  };
  function mount() {
    const panel = document.getElementById('panel-mypage');
    if (!panel) return;
    const account = document.createElement('button');
    account.type = 'button'; account.className = 'secondary-btn owner-account-launch';
    account.textContent = '업장 계정 관리';
    account.onclick = async () => {
      const dialog = window.motfWorkspaceDialogHost();
      if (!dialog.open) dialog.showModal();
      try { await window.motfLoadWorkspaceDashboard?.(); }
      catch (error) {
        let status = dialog.querySelector('[role="status"]');
        if (!status) { status = document.createElement('p'); status.setAttribute('role','status'); dialog.append(status); }
        status.textContent = `불러오지 못했습니다: ${error.message}`;
      }
    };
    panel.prepend(account);
    const preview = panel.querySelector('.preview-box');
    if (preview) {
      const content = document.createElement('div'); content.className = 'owner-preview-content';
      while (preview.firstChild) content.append(preview.firstChild);
      const toggle = document.createElement('button');
      toggle.type = 'button'; toggle.className = 'secondary-btn owner-preview-toggle';
      toggle.textContent = '더보기'; toggle.setAttribute('aria-expanded','false');
      toggle.onclick = () => {
        const expanded = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(expanded));
        preview.classList.toggle('is-expanded', expanded);
        toggle.textContent = expanded ? '접기' : '더보기';
      };
      preview.append(content,toggle);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
