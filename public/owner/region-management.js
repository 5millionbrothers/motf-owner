(() => {
  const $ = (selector,root=document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const client = () => window.motfSupabase;
  let regions = [], ownerBusiness = '', ownerVersion = 0, adminVersion = 0, busy = false;
  const choices = (selected=[]) => regions.map(region => `<label class="region-choice"><input type="checkbox" name="regions" value="${region.id}" ${selected.includes(region.id)?'checked':''} ${region.is_active?'':'disabled'}><span>${esc(region.name)}${region.is_active?'':' (비공개)'}</span></label>`).join('');
  const ids = form => [...form.querySelectorAll('[name="regions"]:checked:not(:disabled)')].map(input=>input.value);
  async function call(name,args) { const result=await client().rpc(name,args); if(result.error)throw result.error; return result.data; }
  async function loadRegions() {
    const {data,error}=await client().from('service_regions').select('id,name,sort_order,is_active').order('sort_order').order('name');
    if(error)throw error; regions=data || [];
  }
  function mountAdmin() {
    if(window.motfCurrentProfile?.role!=='admin' || $('#panel-master-regions'))return;
    const anchor=$('#m-btn-discovery')?.closest('li'), content=$('.content-area');
    if(!anchor || !content)return;
    anchor.insertAdjacentHTML('afterend','<li><button class="menu-item" id="m-btn-regions" type="button" data-open-region-admin><i data-lucide="map-pinned"></i>지역·숙소 분류</button></li>');
    content.insertAdjacentHTML('beforeend',`<section class="panel admin-control-panel" id="panel-master-regions"><div class="view-title"><div><h1>지역·숙소 분류</h1><p>검색 지역을 추가하고 숙소를 여러 지역에 함께 노출할 수 있습니다. 주소 정보는 변경하지 않습니다.</p></div></div><p class="region-status" role="status"></p><section><h2>지역 옵션</h2><form id="regionNewForm" class="region-new-form"><label>지역명<input name="name" required maxlength="30" placeholder="예: 대성리"></label><label>노출 순서<input name="sort" type="number" value="2" required></label><button class="primary-btn" type="submit">지역 추가</button></form><div id="regionCatalog"></div></section><section><h2>사장님 지역 변경 신청</h2><div id="regionRequests"></div></section><section><h2>숙소별 검색 지역</h2><input id="regionBusinessSearch" type="search" placeholder="숙소명·주소 검색" aria-label="지역을 지정할 숙소 검색"><div id="regionBusinesses"></div></section></section>`);
    window.lucide?.createIcons();
  }
  async function loadAdmin() {
    const stamp=++adminVersion, panel=$('#panel-master-regions');
    try {
      await loadRegions();
      const query=$('#regionBusinessSearch').value.trim();
      let businesses=client().from('businesses').select('id,business_name,address').eq('business_type','stay').order('business_name');
      const [businessResult,assignmentResult,requestResult]=await Promise.all([
        businesses.limit(1000),client().from('business_service_regions').select('business_id,region_id'),
        client().from('business_region_requests').select('id,business_id,region_ids,reason,status,created_at,businesses(business_name)').eq('status','pending').order('created_at').limit(100),
      ]);
      if(stamp!==adminVersion)return;
      if(businessResult.error || assignmentResult.error || requestResult.error)throw businessResult.error || assignmentResult.error || requestResult.error;
      $('#regionCatalog').innerHTML=regions.map(region=>`<form class="region-edit-row" data-region-edit="${region.id}"><input name="name" value="${esc(region.name)}" required maxlength="30" aria-label="지역명"><input name="sort" type="number" value="${region.sort_order}" aria-label="노출 순서"><label class="region-choice"><input name="enabled" type="checkbox" ${region.is_active?'checked':''}>공개</label><button class="secondary-btn">저장</button></form>`).join('');
      const matching=(businessResult.data || []).filter(business=>!query || `${business.business_name} ${business.address || ''}`.toLowerCase().includes(query.toLowerCase()));
      $('#regionBusinesses').innerHTML=matching.map(business=>`<form class="region-business-row" data-region-business="${business.id}"><div><strong>${esc(business.business_name)}</strong><small>${esc(business.address)}</small></div><fieldset><legend>검색 지역 (복수 선택)</legend>${choices((assignmentResult.data || []).filter(item=>item.business_id===business.id).map(item=>item.region_id))}</fieldset><button class="secondary-btn" type="submit">지역 저장</button><span role="status"></span></form>`).join('') || '<p>검색 결과가 없습니다.</p>';
      $('#regionRequests').innerHTML=(requestResult.data || []).map(request=>`<article class="region-request-row"><strong>${esc(request.businesses?.business_name || '숙소')}</strong><p>${esc(request.region_ids.map(id=>regions.find(region=>region.id===id)?.name || '삭제된 지역').join(' · '))}</p><p>${esc(request.reason)}</p><small>${esc(new Date(request.created_at).toLocaleString('ko-KR'))}</small><div><button class="primary-btn" type="button" data-region-review="${request.id}" data-accept="true">승인</button><button class="secondary-btn" type="button" data-region-review="${request.id}" data-accept="false">반려</button></div></article>`).join('') || '<p>대기 중인 지역 변경 신청이 없습니다.</p>';
      $('.region-status',panel).textContent='';
    } catch(error) { $('.region-status',panel).textContent=error.message || '지역 관리 데이터를 불러오지 못했습니다. DB 91번 적용을 확인해주세요.'; }
  }
  async function mountOwner() {
    const business=window.motfCurrentBusiness, fields=$('#motfBusinessFields');
    if(!business || business.business_type!=='stay' || !fields || window.motfCurrentProfile?.role==='admin')return;
    if(ownerBusiness===business.id && $('#ownerRegionRequest'))return;
    ownerBusiness=business.id; const stamp=++ownerVersion;
    $('#ownerRegionRequest')?.remove();
    fields.insertAdjacentHTML('beforeend','<section id="ownerRegionRequest" class="owner-region-request"><h3>숙소 검색 지역 신청</h3><p>가평·대성리처럼 여러 지역을 선택할 수 있습니다. 운영팀이 승인한 뒤 이용자 검색에 반영됩니다.</p><div data-owner-region-body>지역 목록을 불러오고 있습니다.</div></section>');
    try {
      await loadRegions();
      const [assigned,requests]=await Promise.all([
        client().from('business_service_regions').select('region_id').eq('business_id',business.id),
        client().from('business_region_requests').select('region_ids,status,review_note').eq('business_id',business.id).order('created_at',{ascending:false}).limit(1),
      ]);
      if(stamp!==ownerVersion)return;
      if(assigned.error || requests.error)throw assigned.error || requests.error;
      const latest=requests.data?.[0], selected=latest?.status==='pending'?latest.region_ids:(assigned.data || []).map(item=>item.region_id);
      $('[data-owner-region-body]').innerHTML=`<fieldset><legend>희망 검색 지역</legend>${choices(selected)}</fieldset><label>신청 사유 (선택)<input id="ownerRegionReason" maxlength="500" placeholder="예: 대성리역 인근 숙소입니다."></label><button class="secondary-btn" type="button" data-owner-region-submit>지역 변경 신청</button><p class="region-status" role="status">${latest ? `최근 신청: ${{pending:'검토 중',approved:'승인',rejected:'반려',cancelled:'취소'}[latest.status]} ${esc(latest.review_note || '')}` : '현재 분류: '+esc((assigned.data || []).map(item=>regions.find(region=>region.id===item.region_id)?.name).filter(Boolean).join(' · ') || '아직 지정되지 않음')}</p>`;
      let signup; try { signup=JSON.parse(sessionStorage.getItem('motf.signupRegions') || 'null'); } catch { /* No signup draft. */ }
      if(signup && signup.username===String(window.motfCurrentProfile?.username || '').toLowerCase()) {
        $('[data-owner-region-body]').querySelectorAll('[name="regions"]').forEach(input=>{input.checked=signup.ids.includes(input.value);});
        await call('request_business_service_regions',{target_business_id:business.id,selected_region_ids:signup.ids,request_reason:'가입 시 선택한 희망 검색 지역'});
        sessionStorage.removeItem('motf.signupRegions');
        $('#ownerRegionRequest .region-status').textContent='가입 시 선택한 지역의 검토를 요청했습니다.';
      }
    } catch(error) { if(stamp===ownerVersion)$('[data-owner-region-body]').textContent=error.message || '지역 목록을 불러오지 못했습니다. 운영팀에 문의해주세요.'; }
  }
  async function mountSignup() {
    const form=$('#signupForm'), anchor=$('#signupBusinessName')?.closest('.form-group');
    if(!form || !anchor || $('#signupServiceRegions') || !client())return;
    const field=document.createElement('fieldset');field.id='signupServiceRegions';field.className='signup-region-options';field.innerHTML='<legend>숙소 희망 검색 지역 (복수 선택)</legend><p>가입 후 최초 로그인 시 운영팀에 지역 검토를 요청합니다.</p>';
    anchor.after(field);
    try { await loadRegions();field.insertAdjacentHTML('beforeend',choices()); } catch { field.insertAdjacentHTML('beforeend','<small>가입 후 숙소 정보에서 지역을 신청할 수 있습니다.</small>'); }
    const toggle=()=>{field.hidden=$('#signupRole')?.value==='market';}; $('#signupRole')?.addEventListener('change',toggle);toggle();
  }
  window.motfRememberSignupRegions = username => {
    const selected=ids($('#signupServiceRegions') || document.createElement('div'));
    if(selected.length && $('#signupRole')?.value!=='market')sessionStorage.setItem('motf.signupRegions',JSON.stringify({username,ids:selected}));
  };
  document.addEventListener('submit',async event=>{
    const form=event.target, isNew=form.id==='regionNewForm', regionId=form.dataset?.regionEdit, businessId=form.dataset?.regionBusiness;
    if(!isNew && !regionId && !businessId)return;
    event.preventDefault();const button=form.querySelector('button');button.disabled=true;
    try {
      if(businessId) { await call('admin_set_business_service_regions',{target_business_id:businessId,selected_region_ids:ids(form)}); form.querySelector('[role="status"]').textContent='저장했습니다.'; }
      else { await call('admin_save_service_region',{target_id:regionId || null,region_name:form.elements.name.value,region_order:Number(form.elements.sort.value),enabled:isNew || form.elements.enabled.checked});if(isNew)form.reset();await loadAdmin(); }
    } catch(error) { alert(error.message); } finally {button.disabled=false;}
  });
  document.addEventListener('click',async event=>{
    const open=event.target.closest('[data-open-region-admin]'), review=event.target.closest('[data-region-review]'), submit=event.target.closest('[data-owner-region-submit]');
    if(open) { window.motfOpenAdminControl('master-regions');await loadAdmin();return; }
    if(!review && !submit)return;
    const button=review || submit;button.disabled=true;
    try {
      if(review) { const note=review.dataset.accept==='false'?prompt('반려 사유를 입력해주세요.'):'';if(note===null)return;await call('review_business_service_regions',{target_request_id:review.dataset.regionReview,accept_request:review.dataset.accept==='true',decision_note:note});await loadAdmin(); }
      else { const selected=ids($('#ownerRegionRequest'));await call('request_business_service_regions',{target_business_id:window.motfCurrentBusiness.id,selected_region_ids:selected,request_reason:$('#ownerRegionReason').value});$('#ownerRegionRequest .region-status').textContent='지역 변경을 신청했습니다. 승인 전까지 기존 지역을 유지합니다.'; }
    } catch(error) {alert(error.message);} finally {button.disabled=false;}
  });
  let searchTimer;document.addEventListener('input',event=>{if(event.target.id==='regionBusinessSearch'){clearTimeout(searchTimer);searchTimer=setTimeout(loadAdmin,250);}});
  function mount() {mountAdmin();mountOwner();mountSignup();}
  new MutationObserver(()=>{if(!busy){busy=true;requestAnimationFrame(()=>{busy=false;mount();});}}).observe(document.body,{childList:true,subtree:true});
  mount();
})();
