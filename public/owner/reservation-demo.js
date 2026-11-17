(function connectReservationDemo() {
  const $=selector=>document.querySelector(selector),client=()=>window.motfSupabase;
  const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const statuses={pending:'예약 요청 대기',confirmed:'예약 승인',rejected:'예약 거절'};
  let businesses=[],rooms=[],key=crypto.randomUUID(),busy=false,refreshing=false,displayedBusiness=null;
  const date=offset=>{const day=new Date();day.setDate(day.getDate()+offset);return `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;};
  async function call(name,args){const {data,error}=await client().rpc(name,args);if(error)throw Error(error.message);return data;}
  function report(message){const node=$('#reservationDemoStatus');if(node)node.textContent=message;}
  function card(row,admin=false){
    const business=businesses.find(item=>item.id===row.business_id)?.business_name;
    return `<article class="reservation-demo-card"><header><span class="reservation-demo-badge">테스트 · ${esc(statuses[row.status]||row.status)}</span><time>${esc(new Date(row.created_at).toLocaleString('ko-KR',{hour12:false}))}</time></header><h3>${esc(row.customer_name)}${admin&&business?' · '+esc(business):''}</h3><p>${esc(row.offering_name)} · ${esc(row.check_in)} ~ ${esc(row.check_out)} · ${row.guest_count}명</p><p>시연 금액 <strong>${Number(row.total_amount).toLocaleString()}원</strong> · 연락처 ${esc(row.contact_phone)}</p>${row.request_memo?`<p>${esc(row.request_memo)}</p>`:''}${row.reject_reason?`<p>거절 사유: ${esc(row.reject_reason)}</p>`:''}<div class="reservation-demo-actions">${row.status==='pending'?`<button class="primary-btn" type="button" data-demo-decision="confirmed" data-demo-id="${row.id}"><i data-lucide="check"></i> 테스트 승인</button><button class="secondary-btn" type="button" data-demo-decision="rejected" data-demo-id="${row.id}"><i data-lucide="x"></i> 테스트 거절</button>`:''}<small>실제 결제·방막기·매출·알림톡 없음</small></div></article>`;
  }
  function roomOptions(){
    const select=$('#reservationDemoRoom'),business=$('#reservationDemoBusiness')?.value;
    if(select)select.innerHTML='<option value="">객실 자동 선택</option>'+rooms.filter(room=>room.business_id===business).map(room=>`<option value="${room.id}">${esc(room.name)} · ${Number(room.price||0).toLocaleString()}원</option>`).join('');
  }
  async function loadAdmin(){
    if(window.motfCurrentProfile?.role!=='admin')return;
    const [{data:stays,error},{data:offerings,error:roomError}]=await Promise.all([
      client().from('businesses').select('id,business_name').eq('business_type','stay').eq('approval_status','approved').order('business_name'),
      client().from('offerings').select('id,business_id,name,price,sort_order').eq('is_active',true).is('retired_at',null).order('sort_order'),
    ]);
    if(error||roomError)throw Error((error||roomError).message);
    if(window.motfCurrentProfile?.role!=='admin')return;
    businesses=stays||[];rooms=offerings||[];
    const select=$('#reservationDemoBusiness'),previous=select.value;select.innerHTML=businesses.map(item=>`<option value="${item.id}">${esc(item.business_name)}</option>`).join('');
    if(businesses.some(item=>item.id===previous))select.value=previous;roomOptions();await refresh();
  }
  function mount(){
    if($('#panel-master-demo'))return;
    const anchor=$('#panel-master-orders');if(!anchor)return;
    const panel=document.createElement('section');panel.id='panel-master-demo';panel.className='panel';
    panel.innerHTML=`<div class="reservation-demo-head"><div><h2>예약 시연</h2><p>테스트 전용 · 실제 결제·방막기·매출·정산·알림톡에 반영되지 않습니다.</p></div><button class="secondary-btn" type="button" data-demo-reload><i data-lucide="refresh-cw"></i> 새로고침</button></div><form id="reservationDemoForm" class="reservation-demo-form"><label>숙소<select id="reservationDemoBusiness" required></select></label><label>객실<select id="reservationDemoRoom"></select></label><label>인원<input name="guests" type="number" min="1" max="500" value="10" required></label><label>체크인<input name="checkIn" type="date" value="${date(1)}" required></label><label>체크아웃<input name="checkOut" type="date" value="${date(2)}" required></label><label>테스트 예약자<input name="customer" value="모티프 시연 예약" maxlength="80" required></label><label>연락처<input name="phone" value="010-3357-2537" type="tel" required></label><label class="reservation-demo-wide">요청사항<textarea name="memo" maxlength="1000">사장님 화면 확인을 위한 모티프 테스트 예약입니다. 실제 이용·결제 요청이 아닙니다.</textarea></label><div class="reservation-demo-actions reservation-demo-wide"><button class="primary-btn" type="submit"><i data-lucide="send"></i> 선택 숙소에 테스트 예약</button><button class="secondary-btn" type="button" data-demo-all><i data-lucide="copy-plus"></i> 모든 숙소에 1건씩</button><button class="secondary-btn" type="button" data-demo-clear><i data-lucide="trash-2"></i> 테스트 예약 전체 정리</button></div></form><p id="reservationDemoStatus" class="reservation-demo-status" role="status" aria-live="polite"></p><div id="reservationDemoList" class="reservation-demo-list"></div>`;
    anchor.after(panel);$('#reservationDemoBusiness').addEventListener('change',roomOptions);
    $('#reservationDemoForm').addEventListener('submit',event=>{event.preventDefault();void create(false);});
  }
  async function create(all){
    if(busy||window.motfCurrentProfile?.role!=='admin')return;
    const form=$('#reservationDemoForm');if(!form.reportValidity())return;
    const targets=all?businesses.map(item=>item.id):[$('#reservationDemoBusiness').value];
    if(!targets.length||!targets[0])return report('테스트할 공개 숙소를 선택해주세요.');
    if(all&&!confirm(`${targets.length}개 숙소에 테스트 예약을 한 건씩 보낼까요? 실제 알림톡은 발송하지 않습니다.`))return;
    busy=true;form.querySelectorAll('button').forEach(button=>button.disabled=true);report('테스트 예약을 보내는 중입니다.');
    try{
      await call('create_admin_reservation_demo',{target_business_ids:targets,target_offering_id:all?null:$('#reservationDemoRoom').value||null,demo_check_in:form.elements.checkIn.value,demo_check_out:form.elements.checkOut.value,demo_guests:Number(form.elements.guests.value),demo_customer:form.elements.customer.value.trim(),demo_phone:form.elements.phone.value,demo_memo:form.elements.memo.value.trim(),submission_key:key});
      key=crypto.randomUUID();report(`${targets.length}개 숙소에 테스트 예약을 보냈습니다. 사장님 주문 관리에서 확인할 수 있습니다.`);await refresh();
    }catch(error){report(error.message);}finally{busy=false;form.querySelectorAll('button').forEach(button=>button.disabled=false);}
  }
  async function refresh(){
    if(refreshing||!client()||document.hidden)return;
    const admin=window.motfCurrentProfile?.role==='admin',business=window.motfCurrentBusiness;
    if(!window.motfCurrentProfile||admin||displayedBusiness!==business?.id){
      $('#ownerReservationDemos')?.remove();$('#ownerReservationDemoBanner')?.remove();displayedBusiness=null;
    }
    if(!window.motfCurrentProfile||(!admin&&(!business||business.business_type!=='stay'||!window.motfHasBusinessPermission?.('reservations'))))return;
    refreshing=true;
    try{
      let query=client().from('reservation_demos').select('*').is('archived_at',null).gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(100);
      if(!admin)query=query.eq('business_id',business.id);
      const {data,error}=await query;if(error){if(admin)report(error.code==='42P01'?'DB 107번 SQL을 먼저 적용해주세요.':error.message);return;}
      if(admin){if(window.motfCurrentProfile?.role==='admin'&&$('#reservationDemoList'))$('#reservationDemoList').innerHTML=(data||[]).map(row=>card(row,true)).join('')||'<p>진행 중인 테스트 예약이 없습니다.</p>';}
      else if(window.motfCurrentProfile&&window.motfCurrentProfile.role!=='admin'&&window.motfCurrentBusiness?.id===business.id&&window.motfHasBusinessPermission?.('reservations')){
        displayedBusiness=business.id;
        let section=$('#ownerReservationDemos');if(!section){section=document.createElement('section');section.id='ownerReservationDemos';section.className='reservation-demo-owner';$('#panel-orders').prepend(section);}
        section.hidden=!data?.length;section.innerHTML='<h3>테스트 예약</h3><div class="reservation-demo-list">'+(data||[]).map(row=>card(row)).join('')+'</div>';
        let banner=$('#ownerReservationDemoBanner');if(!banner){banner=document.createElement('div');banner.id='ownerReservationDemoBanner';banner.className='reservation-demo-banner';$('#panel-operations')?.prepend(banner);}
        const pending=(data||[]).filter(row=>row.status==='pending').length;banner.hidden=!pending;banner.innerHTML=`<span>모티프 테스트 예약 ${pending}건이 도착했습니다.</span><button class="secondary-btn" type="button" data-demo-owner-open>주문 관리</button>`;
      }
      window.lucide?.createIcons();
    }finally{refreshing=false;}
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-demo-all'))void create(true);
    if(button.hasAttribute('data-demo-reload'))void loadAdmin().catch(error=>report(error.message));
    if(button.hasAttribute('data-demo-owner-open'))window.switchPanel('orders');
    if(button.hasAttribute('data-demo-clear')){if(!confirm('테스트 예약만 전체 정리할까요? 실제 예약은 그대로 유지됩니다.'))return;button.disabled=true;try{await call('archive_reservation_demos',{target_business_id:null});report('테스트 예약을 정리했습니다.');await refresh();}catch(error){report(error.message);}finally{button.disabled=false;}}
    if(button.dataset.demoDecision){
      const decision=button.dataset.demoDecision,reason=decision==='rejected'?prompt('테스트 거절 사유를 입력해주세요.')?.trim():null;if(decision==='rejected'&&!reason)return;
      button.disabled=true;try{await call('handle_reservation_demo',{target_demo_id:button.dataset.demoId,decision,reason});await refresh();}catch(error){alert(error.message);}finally{button.disabled=false;}
    }
  });
  const init=window.initAdminMasterDashboard;window.initAdminMasterDashboard=function(...args){const result=init?.apply(this,args);mount();const menu=$('#dynamic-sidebar-menu-target-box .sidebar-menu');if(menu&&!$('#m-btn-demo')){const li=document.createElement('li');li.innerHTML='<button class="menu-item" id="m-btn-demo" type="button"><i data-lucide="flask-conical"></i> 예약 시연</button>';menu.append(li);$('#m-btn-demo').onclick=()=>{window.switchMasterPanel('master-demo');$('#m-btn-demo').classList.add('active');void loadAdmin().catch(error=>report(error.message));};}window.lucide?.createIcons();return result;};
  const load=window.loadMotfPartnerTransactions;window.loadMotfPartnerTransactions=async function(...args){const result=await load?.apply(this,args);void refresh().catch(()=>{});return result;};
  setInterval(()=>{void refresh().catch(()=>{});},8000);
})();
