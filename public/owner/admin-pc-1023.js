(function adminPc1023() {
  const desktop = () => matchMedia('(min-width:1024px)').matches;
  const admin = () => window.motfCurrentProfile?.role === 'admin';
  const client = () => window.motfSupabase;
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = v => `${Number(v || 0).toLocaleString('ko-KR')}원`;
  const date = v => v ? new Date(v).toLocaleString('ko-KR') : '기록 없음';
  const localDate = v => new Date(new Date(v).getTime()+9*3600000).toISOString().slice(0,16);
  const status = v => ({pending:'승인 대기',confirmed:'확정',completed:'완료',rejected:'거절',cancelled:'취소',approved:'정상',failed:'실패',expired:'만료',created:'결제 준비',virtual_account_issued:'입금 대기',refunded:'환불',suspended:'정지'}[v] || v || '-');
  async function rpc(name,args) { const r=await client().rpc(name,args); if(r.error) throw new Error(r.error.message); return r.data; }
  async function busy(button,action) {
    if(button.disabled) return;
    button.disabled=true;
    try { await action(); } catch(e) { alert(e.message); } finally { button.disabled=false; }
  }
  const dialog = document.createElement('dialog');
  dialog.className='pc1023-member-dialog';
  dialog.innerHTML='<header><h2>이용자 세부 내역</h2><button type="button" data-member-close class="secondary-btn">닫기</button></header><div data-member-body></div>';
  document.body.append(dialog);
  let memberId='', memberPage=0, memberRequest=0;
  async function memberDetails(id,page=0) {
    const request=++memberRequest;
    memberId=id; memberPage=page;
    if(!dialog.open) dialog.showModal();
    const body=dialog.querySelector('[data-member-body]');
    body.innerHTML='<p role="status">세부 내역을 불러오는 중입니다.</p>';
    try {
      const data=await rpc('motf1023_member_detail',{target_user_id:id,page_number:page});
      if(request!==memberRequest) return;
      const p=data.profile;
      const rows=(data.reservations || []).map(r=>`<tr><td>${esc(r.kind==='stay'?'숙소':'공판장')}</td><td>${esc(r.business_name)}</td><td>${esc(r.target)}<small>${esc(r.id)}</small></td><td>${esc(r.date)}</td><td>${money(r.amount)}</td><td>${esc(status(r.status))}</td></tr>`).join('');
      const payments=(data.payments || []).map(r=>`<tr><td>${esc(date(r.created_at))}</td><td>${esc(r.order_id)}<small>${esc(r.provider)}</small></td><td>${money(r.original_amount ?? r.amount)}<small>실결제 ${money(r.amount)} · 사용 포인트 ${Number(r.points_used||0).toLocaleString()}P</small></td><td>${esc(status(r.status))}</td></tr>`).join('');
      body.innerHTML=`<dl class="pc1023-member-info"><div><dt>회원</dt><dd>${esc(p.full_name || p.username)} · ${esc(p.username)}</dd></div><div><dt>이메일 / 연락처</dt><dd>${esc(p.email)} / ${esc(p.phone)}</dd></div><div><dt>소속 / 상태</dt><dd>${esc(p.organization)} / ${esc(status(p.status))}</dd></div><div><dt>가입일</dt><dd>${esc(date(p.created_at))}</dd></div><div><dt>마지막 로그인</dt><dd>${esc(date(p.last_sign_in_at))}</dd></div></dl>
        <p>숙소 예약 ${data.reservation_count}건 · 공판장 주문 ${data.order_count}건 · 결제 시도 ${data.payment_count}건</p>
        <h3>예약·주문 내역</h3><table><thead><tr><th>종류</th><th>업장</th><th>상품 / 거래번호</th><th>이용일 / 픽업 시간</th><th>금액</th><th>상태</th></tr></thead><tbody>${rows || '<tr><td colspan="6">내역 없음</td></tr>'}</tbody></table>
        <h3>결제 내역</h3><p>실패·대기 중인 결제 시도도 상태와 함께 표시됩니다.</p><table><thead><tr><th>접수일</th><th>결제 주문번호</th><th>금액</th><th>상태</th></tr></thead><tbody>${payments || '<tr><td colspan="4">내역 없음</td></tr>'}</tbody></table>
        <div class="pc1023-actions"><button class="secondary-btn" data-member-page="${page-1}" ${page===0?'disabled':''}>이전</button><span>${page+1}페이지 · 항목별 50건</span><button class="secondary-btn" data-member-page="${page+1}" ${Math.max(Number(data.reservation_count)+Number(data.order_count),Number(data.payment_count))<=(page+1)*50?'disabled':''}>다음</button></div>`;
    } catch(e) { if(request===memberRequest) body.textContent=`조회 실패: ${e.message}`; }
  }
  document.addEventListener('click',e=>{
    const member=e.target.closest('[data-member-detail]');
    if(member && desktop() && admin()) memberDetails(member.dataset.memberDetail);
    const page=e.target.closest('[data-member-page]');
    if(page && !page.disabled && admin()) memberDetails(memberId,Number(page.dataset.memberPage));
    if(e.target.closest('[data-member-close]')) { ++memberRequest; dialog.close(); }
  });
  dialog.addEventListener('cancel',()=>++memberRequest);

  let businesses=[],campaigns=[];
  const originalOpen=window.motfOpenAdminControl;
  window.motfOpenAdminControl=async function(panelId) {
    if(!desktop() || !admin()) return originalOpen?.(panelId);
    if(panelId==='master-discovery') {
      document.querySelectorAll('.panel,.menu-item').forEach(x=>x.classList.remove('active'));
      document.getElementById('panel-master-discovery')?.classList.add('active');
      document.getElementById('m-btn-discovery')?.classList.add('active');
      try { await loadExposure(); } catch(e) { document.getElementById('adminDiscoveryList').textContent=e.message; }
    } else {
      await originalOpen?.(panelId);
      if(panelId==='master-commerce') { try { await commissions(); } catch(e) { alert(e.message); } }
    }
  };
  async function loadBusinesses() {
    const r=await client().from('businesses').select('id,business_name,business_type,approval_status,commission_rate_override').order('business_name');
    if(r.error) throw new Error(r.error.message); businesses=r.data || [];
  }
  async function loadExposure() {
    await loadBusinesses();
    const r=await client().from('stay_exposure_campaigns').select('*');
    if(r.error) throw new Error(`노출 설정 SQL 적용을 확인해주세요: ${r.error.message}`);
    campaigns=r.data || [];
    const guide=document.querySelector('#panel-master-discovery .admin-guide');
    if(guide) { guide.querySelector('strong').textContent='기간별 숙소 노출'; guide.querySelector('p').textContent='기본 랜덤 / 최상단 고정 / 가중 랜덤 중 선택하세요. 기간 종료 시 기본 랜덤으로 자동 복귀합니다. 가중치는 확률을 높이며 노출 횟수를 보장하지 않습니다.'; }
    const search=document.getElementById('adminDiscoverySearch');
    search.placeholder='숙소 이름 검색'; search.oninput=renderExposure;
    renderExposure();
  }
  function renderExposure() {
    const root=document.getElementById('adminDiscoveryList');
    const query=document.getElementById('adminDiscoverySearch').value.trim();
    root.innerHTML='<p>기본은 모든 숙소를 같은 확률로 섞습니다. 아래 설정은 선택한 기간·영역에만 적용되고 종료 후 자동으로 기본 랜덤 노출로 돌아갑니다.</p>' + businesses.filter(b=>b.business_type==='stay' && b.business_name.includes(query)).map(b=>{
      const c=campaigns.find(c=>c.business_id===b.id) || {mode:'random',scope:'both',weight:3,priority:1,starts_at:new Date(),ends_at:new Date(Date.now()+7*86400000),enabled:true};
      const select=(name,options,value)=>`<select name="${name}">${options.map(([key,label])=>`<option value="${key}" ${key===value?'selected':''}>${label}</option>`).join('')}</select>`;
      return `<form class="admin-control-card pc1023-exposure" data-exposure="${b.id}"><h3>${esc(b.business_name)}</h3><div class="pc1023-form-grid">
        <label>노출 방식${select('mode',[['random','기본 랜덤'],['fixed','최상단 고정'],['weighted','상단 노출 빈도 증가']],c.mode)}</label>
        <label>적용 영역${select('scope',[['home','메인 숙소 영역'],['list','숙소 찾기 목록'],['both','두 영역 모두']],c.scope)}</label>
        <label>랜덤 가중치 (1~100)<input name="weight" type="number" min="1" max="100" step="0.1" value="${c.weight}" required></label>
        <label>고정 순위 (작을수록 먼저)<input name="priority" type="number" min="1" max="1000" value="${c.priority}" required></label>
        <label>시작 (한국 시간)<input name="starts" type="datetime-local" value="${localDate(c.starts_at)}" required></label>
        <label>종료 (한국 시간)<input name="ends" type="datetime-local" value="${localDate(c.ends_at)}" required></label></div>
        <label class="pc1023-check"><input name="enabled" type="checkbox" ${c.enabled?'checked':''}>설정 사용</label>
        <button type="submit" class="primary-btn">노출 설정 저장</button></form>`;
    }).join('');
    root.querySelectorAll('form').forEach(f=>f.onsubmit=e=>{e.preventDefault();busy(f.querySelector('button'),async()=>{
      const x=f.elements, start=new Date(x.starts.value+'+09:00'),end=new Date(x.ends.value+'+09:00');
      if(end<=start) throw new Error('종료를 시작 이후로 설정해주세요.');
      await rpc('motf1023_save_exposure',{target_business_id:f.dataset.exposure,settings:{mode:x.mode.value,scope:x.scope.value,weight:Number(x.weight.value),priority:Number(x.priority.value),starts_at:start.toISOString(),ends_at:end.toISOString(),enabled:x.enabled.checked}});
      await loadExposure(); alert('노출 설정을 저장했습니다.');
    });});
  }
  async function commissions() {
    await loadBusinesses();
    const setting=await client().from('platform_settings').select('setting_value').eq('setting_key','commission').maybeSingle();
    if(setting.error) throw new Error(setting.error.message);
    const original=document.getElementById('adminCommissionForm');
    original.classList.add('pc1023-old-commission');
    let root=document.getElementById('pc1023Commissions');
    if(!root) { root=document.createElement('section');root.id='pc1023Commissions';root.className='admin-control-card';original.after(root); }
    const defaults={stay:Number(setting.data?.setting_value?.stay_rate ?? 0.035)*100,market:Number(setting.data?.setting_value?.market_rate ?? 0.035)*100};
    root.innerHTML='<h2>수수료 관리</h2><div class="pc1023-actions"><button class="secondary-btn" type="button" data-commission-type="stay">숙소</button><button class="secondary-btn" type="button" data-commission-type="market">공판장</button></div><div data-commission-content></div>';
    function render(type) {
      root.querySelectorAll('[data-commission-type]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.commissionType===type)));
      const label=type==='stay'?'숙소':'공판장';
      root.querySelector('[data-commission-content]').innerHTML=`<form data-default-rate><label>${label} 기본 수수료 (%)<input type="number" name="rate" min="0" max="100" step="0.01" required value="${defaults[type]}"></label><button class="primary-btn">기본값 저장</button></form><p>개별 수수료를 비우면 기본값을 따릅니다. 이미 체결된 거래의 정산 기록은 유지됩니다.</p>`+businesses.filter(b=>b.business_type===type).map(b=>`<form data-individual-rate="${b.id}" class="pc1023-rate-row"><strong>${esc(b.business_name)}</strong><label>개별 수수료 (%)<input name="rate" type="number" min="0" max="100" step="0.01" placeholder="기본값 ${defaults[type]}%" value="${b.commission_rate_override==null?'':Number(b.commission_rate_override)*100}"></label><button class="secondary-btn">저장</button></form>`).join('');
      root.querySelector('[data-default-rate]').onsubmit=e=>{e.preventDefault();const f=e.currentTarget;busy(f.querySelector('button'),async()=>{
        // Read before writing so an unrelated points/coupon setting is not overwritten.
        const current=await client().from('platform_settings').select('setting_value').eq('setting_key','commission').maybeSingle();
        if(current.error) throw new Error(current.error.message);
        const value={stay_rate:0.035,market_rate:0.035,...current.data?.setting_value,[type+'_rate']:Number(f.elements.rate.value)/100};
        const r=await client().from('platform_settings').upsert({setting_key:'commission',setting_value:value,is_public:false,updated_by:window.motfCurrentProfile.id});
        if(r.error) throw new Error(r.error.message);
        defaults[type]=f.elements.rate.value;original.elements[type==='stay'?'stayRate':'marketRate'].value=defaults[type];render(type);alert('기본 수수료를 저장했습니다.');
      });};
      root.querySelectorAll('[data-individual-rate]').forEach(f=>f.onsubmit=e=>{e.preventDefault();busy(f.querySelector('button'),async()=>{
        const rate=f.elements.rate.value.trim();await rpc('motf1023_set_commission',{target_business_id:f.dataset.individualRate,rate:rate===''?null:Number(rate)/100});
        businesses.find(b=>b.id===f.dataset.individualRate).commission_rate_override=rate===''?null:Number(rate)/100;alert('개별 수수료를 저장했습니다.');
      });});
    }
    root.querySelectorAll('[data-commission-type]').forEach(b=>b.onclick=()=>render(b.dataset.commissionType));render('stay');
  }
})();
