(function setupOwnerIdentity() {
  const API_BASE = "https://motf.co.kr";
  let signupIdentity = null;
  let resetIdentity = null;
  let verificationInProgress = false;
  let signupInProgress = false;

  function passwordIsValid(value) {
    return /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d\s]).{8,12}$/.test(String(value || ""));
  }

  function formatPhone(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  async function api(path, body, token = "") {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${API_BASE}${path}`, { method:"POST", headers:{ "Content-Type":"application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body:JSON.stringify(body), signal:controller.signal });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        const error = new Error(result?.message || "요청을 처리하지 못했습니다.");
        error.status = response.status;
        throw error;
      }
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.');
      throw error;
    } finally { clearTimeout(timeout); }
  }

  async function verify(purpose, accessToken = "") {
    const email = purpose === "profile_upgrade" ? window.motfCurrentProfile?.login_email || "" : purpose === "password_reset"
      ? document.getElementById("ownerResetEmail").value.trim()
      : document.getElementById("signupId").value.trim();
    if (purpose === "password_reset" && !email) throw new Error("가입 아이디 또는 기존 가입 이메일을 먼저 입력해주세요.");
    if (verificationInProgress) throw new Error('진행 중인 본인인증 창을 먼저 완료하거나 닫아주세요.');
    const popupName = `motf_owner_identity_${crypto.randomUUID().replaceAll('-', '')}`;
    const popup = window.open('/owner/identity-wait.html', popupName, "width=430,height=640,toolbar=no,menubar=no,scrollbars=yes,resizable=yes");
    if (!popup) throw new Error("팝업을 허용해주세요.");
    verificationInProgress = true;
    let form;
    try {
      const start = await api("/api/identity-start", { purpose, email, accountType:"partner", returnUrl:location.href, mobile:innerWidth<720 }, accessToken);
      if (!start.identityToken || !start.form?.reg_cert_key || new URL(start.callUrl).protocol !== 'https:') throw new Error('본인인증 연결 정보를 확인하지 못했습니다. 다시 시도해주세요.');
      if (popup.closed) throw new Error('본인인증 창이 닫혔습니다. 다시 시도해주세요.');
      form = document.createElement('form');form.method='POST';form.action=start.callUrl;form.target=popupName;
      Object.entries(start.form).forEach(([name,value])=>{const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);});
      document.body.appendChild(form);
      const status = await window.MotfIdentityFlow.waitForResult({
        popup, origin: API_BASE, submit: () => form.submit(),
        getStatus: () => api('/api/identity-status', { identityToken: start.identityToken, purpose }),
      });
      return { token: start.identityToken, person: status.person };
    } finally { form?.remove();popup.close();verificationInProgress=false; }
  }

  window.motfVerifyBusinessTransfer = async function(transferId) {
    const { data, error } = await window.motfSupabase.auth.getSession();
    if (error || !data.session?.access_token) throw new Error("로그인이 필요합니다.");
    const identity = await verify("profile_upgrade", data.session.access_token);
    const { data: fresh } = await window.motfSupabase.auth.getSession();
    if (!fresh.session?.access_token) throw new Error("로그인이 만료되었습니다.");
    await api("/api/business-transfer-verify", { identityToken: identity.token, transferId }, fresh.session.access_token);
  };

  window.startOwnerIdentity = async function(purpose) {
    try {
      const identity=await verify(purpose);
      const target=document.getElementById(purpose==="owner_signup"?"ownerSignupIdentityResult":"ownerPasswordIdentityResult");
      target.hidden=false; target.textContent=`본인인증 완료 · ${identity.person.name} · ${formatPhone(identity.person.phone)} · ${identity.person.birthDate}`;
      if(purpose==="owner_signup") {
        signupIdentity=identity;
        document.getElementById("signupOwnerName").value=identity.person.name;
        document.getElementById("signupPhone").value=formatPhone(identity.person.phone);
        document.getElementById("signupBirthDate").value=identity.person.birthDate;
      } else resetIdentity=identity;
    } catch(error) { alert(error.message||"본인인증에 실패했습니다."); }
  };

  window.handleSignup = async function(event) {
    event.preventDefault();
    if(signupInProgress)return;
    const form=document.getElementById('signupForm');
    if(!form.reportValidity())return;
    if(!signupIdentity) return alert("휴대폰 본인인증을 먼저 완료해주세요.");
    const password=document.getElementById("signupPassword").value;
    if(!passwordIsValid(password)) return alert("비밀번호는 영문·숫자·특수문자를 포함한 8~12자리여야 합니다.");
    if(password!==document.getElementById("signupPasswordConfirm").value) return alert("비밀번호 확인이 일치하지 않습니다.");
    const button=event.submitter || form.querySelector('[type=submit]');signupInProgress=true;button.disabled=true;button.textContent="가입 처리 중...";
    try {
      const username=document.getElementById("signupId").value.trim().toLowerCase();
      const email=document.getElementById("signupEmail").value.trim();
      await api("/api/identity-signup",{
        accountType:"partner", identityToken:signupIdentity.token, username, email, password,
        termsAccepted:document.getElementById("signupTerms").checked,
        businessType:document.getElementById("signupRole").value,
        businessName:document.getElementById("signupBusinessName").value.trim(),
        emailRedirectTo:`${location.origin}/`,
      });
      document.getElementById("ownerId").value=username;
      try { window.motfRememberSignupRegions?.(username); }
      catch (error) { console.warn('가입 지역 선택을 임시 저장하지 못했습니다.', error); }
      closeSignupModal(); document.getElementById("signupForm").reset(); signupIdentity=null;
      alert("가입이 완료되었습니다. 아이디로 로그인해주세요.");
    } catch(error) { alert(error.message||"회원가입에 실패했습니다."); }
    finally { signupInProgress=false;button.disabled=false;button.textContent="가입 완료"; }
  };

  window.saveOwnerUsername = async function() {
    const button = document.getElementById("ownerUsernameSave");
    button.disabled = true;
    try {
      const { data } = await window.motfSupabase.auth.getSession();
      const result = await api("/api/account-username", { username:document.getElementById("motfOwnerUsername").value }, data.session?.access_token);
      window.motfCurrentProfile.username = result.username;
      document.getElementById("motfOwnerUsername").value = result.username;
      document.getElementById("motfOwnerUsername").readOnly = true;
      button.hidden = true;
      alert("로그인 아이디가 등록되었습니다.");
    } catch(error) { alert(error.message); }
    finally { button.disabled = false; }
  };

  window.openOwnerPasswordReset = function(){ document.getElementById("ownerPasswordResetModal").classList.add("active"); document.getElementById("ownerResetEmail").value=document.getElementById("ownerId").value.trim(); };
  window.closeOwnerPasswordReset = function(){ document.getElementById("ownerPasswordResetModal").classList.remove("active"); };
  window.submitOwnerPasswordReset = async function(event){
    event.preventDefault();
    if(!resetIdentity) return alert("휴대폰 본인인증을 먼저 완료해주세요.");
    const password=document.getElementById("ownerResetPassword").value;
    if(!passwordIsValid(password)) return alert("비밀번호는 영문·숫자·특수문자를 포함한 8~12자리여야 합니다.");
    if(password!==document.getElementById("ownerResetPasswordConfirm").value) return alert("비밀번호 확인이 일치하지 않습니다.");
    try {
      await api("/api/identity-password-reset",{ identifier:document.getElementById("ownerResetEmail").value.trim(),password,identityToken:resetIdentity.token });
      closeOwnerPasswordReset(); event.target.reset(); resetIdentity=null; alert("비밀번호가 변경되었습니다.");
    } catch(error){ alert(error.message||"비밀번호를 변경하지 못했습니다."); }
  };
})();
