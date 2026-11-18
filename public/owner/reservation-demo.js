(function connectReservationDemo() {
  const $=selector=>document.querySelector(selector),client=()=>window.motfSupabase;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const statuses={pending:'예약 요청 대기',confirmed:'예약 승인',rejected:'예약 거절'};
  const deliveryLabels={queued:'발송 대기',processing:'발송 처리 중',sent:'알리고 접수 · 휴대폰 수신 확인 전',mock_sent:'모의 발송 · 실제 수신 안 됨',failed:'실패 또는 수신 결과 확인 필요',skipped:'발송 보류',cancelled:'발송 취소'};
  let businesses=[],contacts=[],rooms=[],rows=[],deliveries=[],key=crypto.randomUUID(),fingerprint='',busy=false,refreshing=false,displayedBusiness=null,linked=false;
  const date=offset=>{const d=new Date();d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  async function call(name,args){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{const {data,error}=await client().rpc(name,args).abortSignal(controller.signal);if(error)throw Error(controller.signal.aborted?'응답 시간이 초과됐습니다. 예약 목록을 확인한 뒤 같은 요청으로 다시 시도해주세요.':error.message);return data;}
    finally{clearTimeout(timer);}
  }
  function report(message){const node=$('#reservationDemoStatus');if(node)node.textContent=message;}
  function publish(businessId,data=[]){window.motfReservationDemoRows=data;window.dispatchEvent(new CustomEvent('motf:reservation-demos',{detail:{businessId,rows:data}}));if(businessId&&window.motfCurrentProfile?.role!=='admin')window.renderCalendar?.();}
  function card(row,admin=false){
    const business=businesses.find(item=>item.id===row.business_id)?.business_name;
    const notices=deliveries.filter(item=>item.demo_id===row.id).map(item=>`<li>${esc(({owner:'사장님',user:'시연 이용자',admin:'운영자'})[item.recipient_role])}${item.actual_last4?' · 수신번호 끝 '+esc(item.actual_last4):''} · ${esc(deliveryLabels[item.status]||item.status)}${item.last_error?' · '+esc(item.last_error):''}${item.test_mode==='Y'?' · 알리고 테스트 모드(실제 미발송)':''}</li>`).join('');
    return `<article class="reservation-demo-card" data-reservation-demo-id="${row.id}">
      <header><span class="reservation-demo-badge">시연 · ${esc(statuses[row.status]||row.status)}</span><time>${esc(new Date(row.created_at).toLocaleString('ko-KR',{hour12:false}))}</time></header>
      <h3>${esc(row.customer_name)}${admin&&business?' · '+esc(business):''}</h3>
      <p>${esc(row.offering_name)} · ${esc(row.check_in)} ~ ${esc(row.check_out)} · ${row.guest_count}명</p>
      <p>시연 금액 <strong>${Number(row.total_amount).toLocaleString()}원</strong> · <a href="tel:${esc(row.contact_phone)}">${esc(row.contact_phone)}</a></p>
      ${row.request_memo?`<p>${esc(row.request_memo)}</p>`:''}${row.reject_reason?`<p>거절 사유: ${esc(row.reject_reason)}</p>`:''}
      <div class="reservation-demo-actions">
      ${row.status==='pending'?`<button class="primary-btn" type="button" data-demo-decision="confirmed" data-demo-id="${row.id}"><i data-lucide="check"></i> 테스트 승인</button><button class="secondary-btn" type="button" data-demo-decision="rejected" data-demo-id="${row.id}"><i data-lucide="x"></i> 테스트 거절</button>`:''}
      ${row.conversation_id?`<button class="secondary-btn" type="button" data-demo-chat="${row.conversation_id}" data-business-id="${row.business_id}"><i data-lucide="messages-square"></i> 채팅 열기</button>${admin?`<button class="secondary-btn" type="button" data-demo-inquiry="${row.id}"><i data-lucide="send"></i> 시연 문의 보내기</button>`:''}`:''}
      <small>실제 결제·환불·매출·정산 없음</small></div>
      ${row.live_notifications?`<details class="reservation-demo-deliveries"><summary>알림톡 발송 상태</summary><ul>${notices||'<li>발송 상태 확인 중</li>'}</ul><small>발송 접수는 알리고 접수 결과입니다. 실제 휴대폰 수신도 확인해주세요.</small></details>`:'<p>이전 시연 · 실제 알림톡 미발송. 새 시연 예약으로 테스트해주세요.</p>'}
    </article>`;
  }
  function roomOptions(){const select=$('#reservationDemoRoom'),business=$('#reservationDemoBusiness')?.value;if(select)select.innerHTML='<option value="">객실 자동 선택</option>'+rooms.filter(room=>room.business_id===business).map(room=>`<option value="${room.id}">${esc(room.name)} · ${Number(room.price||0).toLocaleString()}원</option>`).join('');
    const contact=contacts.find(item=>item.business_id===business),preview=$('#reservationDemoRecipientPreview');
    if(preview)preview.textContent=`사장님: ${contact?.notification_phone||'수신번호 확인 필요'} / 운영자: ${window.motfCurrentProfile?.phone||'계정 연락처 미등록'}`;
  }
  async function loadAdmin(){
    if(window.motfCurrentProfile?.role!=='admin')return;
    const [stays,offerings,contactRows]=await Promise.all([
      client().from('businesses').select('id,business_name').eq('business_type','stay').eq('approval_status','approved').order('business_name'),
      client().from('offerings').select('id,business_id,name,price,sort_order').eq('is_active',true).is('retired_at',null).order('sort_order'),
      client().rpc('list_business_notification_contacts'),
    ]);
    if(stays.error||offerings.error||contactRows.error)throw Error((stays.error||offerings.error||contactRows.error).message);
    if(window.motfCurrentProfile?.role!=='admin')return;
    businesses=stays.data||[];rooms=offerings.data||[];contacts=contactRows.data||[];
    const select=$('#reservationDemoBusiness'),previous=select.value;
    select.innerHTML=businesses.map(item=>`<option value="${item.id}" ${rooms.some(room=>room.business_id===item.id)?'':'disabled'}>${esc(item.business_name)}${rooms.some(room=>room.business_id===item.id)?'':' · 판매 객실 없음'}</option>`).join('');
    if(businesses.some(item=>item.id===previous&&rooms.some(room=>room.business_id===item.id)))select.value=previous;
    roomOptions();await refresh();
  }
  function mount(){
    if($('#panel-master-demo'))return;
    const anchor=$('#panel-master-orders');if(!anchor)return;
    const panel=document.createElement('section');panel.id='panel-master-demo';panel.className='panel';
    panel.innerHTML=`<div class="reservation-demo-head"><div><h2>예약 시연</h2><p>실제 알림톡과 채팅이 연결됩니다. 결제·환불·매출·정산은 발생하지 않습니다.</p></div><button class="secondary-btn" type="button" data-demo-reload><i data-lucide="refresh-cw"></i> 새로고침</button></div>
      <form id="reservationDemoForm" class="reservation-demo-form">
      <label>숙소<select id="reservationDemoBusiness" required></select></label><label>객실<select id="reservationDemoRoom"></select></label>
      <label>인원<input name="guests" type="number" min="1" max="500" value="10" required></label>
      <label>체크인<input name="checkIn" type="date" value="${date(1)}" required></label><label>체크아웃<input name="checkOut" type="date" value="${date(2)}" required></label>
      <label>테스트 예약자<input name="customer" value="모티프 시연 예약" maxlength="80" required></label>
      <label>시연 이용자 알림 수신 번호<input name="phone" value="" type="tel" autocomplete="off" placeholder="이용자 역할을 맡을 번호 직접 입력" required></label>
      <p id="reservationDemoRecipientPreview" class="reservation-demo-wide"></p>
      <label class="reservation-demo-wide">요청사항<textarea name="memo" maxlength="1000">모티프 예약 시연입니다. 실제 이용·결제 요청이 아닙니다.</textarea></label>
      <p class="reservation-demo-wide">사장님 알림은 위 사장님 번호, 이용자 알림·채팅 답변은 직접 입력한 시연 이용자 번호, 운영자 알림은 운영자 계정 번호로 전달됩니다. 실제 회원 계정이 합쳐지는 것이 아니라, 운영자가 이용자 역할을 대신하는 시연입니다. 발송 비용이 발생할 수 있습니다.</p>
      <div class="reservation-demo-actions reservation-demo-wide"><button class="primary-btn" type="submit"><i data-lucide="send"></i> 선택 숙소에 테스트 예약</button><button class="secondary-btn" type="button" data-demo-all><i data-lucide="copy-plus"></i> 모든 숙소에 1건씩</button><button class="secondary-btn" type="button" data-demo-clear><i data-lucide="trash-2"></i> 테스트 예약 전체 정리</button></div></form>
      <p id="reservationDemoStatus" class="reservation-demo-status" role="status" aria-live="polite"></p><div id="reservationDemoList" class="reservation-demo-list"></div>`;
    anchor.after(panel);$('#reservationDemoBusiness').addEventListener('change',roomOptions);
    $('#reservationDemoForm').addEventListener('submit',event=>{event.preventDefault();void create(false);});
  }
  async function create(all){
    if(busy||window.motfCurrentProfile?.role!=='admin')return;
    const form=$('#reservationDemoForm');if(!form.reportValidity())return;
    const targets=all?businesses.filter(item=>rooms.some(room=>room.business_id===item.id)&&contacts.some(contact=>contact.business_id===item.id&&contact.notification_phone)).map(item=>item.id):[$('#reservationDemoBusiness').value];
    if(!targets.length||!targets[0])return report('테스트할 공개 숙소와 객실을 선택해주세요.');
    const selected=targets.map(id=>contacts.find(item=>item.business_id===id));
    if(selected.some(item=>!item?.notification_phone))return report('사장님 수신번호가 확인되지 않은 숙소가 있습니다. 가입 회원 & 업장 관리 → 알림 수신번호 점검·확정에서 먼저 확인해주세요.');
    const recipients=selected.map(item=>`${item.business_name} 사장님 → ${item.notification_phone}`).join('\n');
    if(!confirm(`${recipients}\n시연 이용자 → ${form.elements.phone.value}\n운영자 → ${window.motfCurrentProfile?.phone||'미등록(운영자 알림 미발송)'}\n\n각 역할의 수신자가 맞나요? 실제 알림톡이 발송되며 실제 결제는 발생하지 않습니다.`))return;
    const input={target_offering_id:all?null:$('#reservationDemoRoom').value||null,demo_check_in:form.elements.checkIn.value,demo_check_out:form.elements.checkOut.value,demo_guests:Number(form.elements.guests.value),demo_customer:form.elements.customer.value.trim(),demo_phone:form.elements.phone.value,demo_memo:form.elements.memo.value.trim()};
    const nextFingerprint=JSON.stringify({targets,input});if(fingerprint&&fingerprint!==nextFingerprint)key=crypto.randomUUID();fingerprint=nextFingerprint;
    const controls=[...form.querySelectorAll('button,input,select,textarea')],disabled=controls.map(node=>node.disabled);
    busy=true;controls.forEach(node=>node.disabled=true);report('테스트 예약을 보내는 중입니다.');
    try{
      const failures=[];let completed=0;
      for(const id of targets){
        report(`${completed+1}/${targets.length} · ${businesses.find(item=>item.id===id)?.business_name||'숙소'}에 예약 요청 중`);
        try{await call('create_admin_reservation_demo',{target_business_ids:[id],...input,submission_key:key});completed++;}
        catch(error){failures.push(`${businesses.find(item=>item.id===id)?.business_name}: ${error.message}`);}
      }
      if(!failures.length)key=crypto.randomUUID();
      report(`예약 생성 ${completed}/${targets.length}개. 알림톡 접수·실패는 아래 발송 상태에서 별도로 확인해주세요.${failures.length?' '+failures.join(' / '):''}`);await refresh();
    }catch(error){report(error.message);}finally{busy=false;controls.forEach((node,index)=>node.disabled=disabled[index]);}
  }
  async function refresh(){
    if(refreshing||!client()||document.hidden)return;
    const admin=window.motfCurrentProfile?.role==='admin',business=window.motfCurrentBusiness;
    if(!window.motfCurrentProfile||admin||displayedBusiness!==business?.id){$('#ownerReservationDemos')?.remove();$('#ownerReservationDemoBanner')?.remove();displayedBusiness=null;publish(null);}
    if(!window.motfCurrentProfile||(!admin&&(!business||business.business_type!=='stay'||!window.motfHasBusinessPermission?.('reservations'))))return;
    refreshing=true;
    try{
      let query=client().from('reservation_demos').select('*').is('archived_at',null).gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(100);
      if(!admin)query=query.eq('business_id',business.id);
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
      let result;try{result=await query.abortSignal(controller.signal);}finally{clearTimeout(timer);}
      const {data,error}=result;if(error){if(admin)report('예약 목록을 불러오지 못했습니다. 새로고침으로 다시 확인해주세요.');return;}
      rows=data||[];deliveries=[];
      if(rows.length){try{deliveries=await call('reservation_demo_delivery_audit',{target_demo_ids:rows.map(row=>row.id)})||[];}catch(error){if(admin)report('예약 목록은 불러왔으나 알림 발송 상태를 읽지 못했습니다. DB 113번 적용 후 새로고침해주세요.');}}
      if(admin){if(window.motfCurrentProfile?.role==='admin'&&$('#reservationDemoList'))$('#reservationDemoList').innerHTML=rows.map(row=>card(row,true)).join('')||'<p>진행 중인 테스트 예약이 없습니다.</p>';}
      else if(window.motfCurrentProfile&&window.motfCurrentProfile.role!=='admin'&&window.motfCurrentBusiness?.id===business.id&&window.motfHasBusinessPermission?.('reservations')){
        displayedBusiness=business.id;
        let section=$('#ownerReservationDemos');if(!section){section=document.createElement('section');section.id='ownerReservationDemos';section.className='reservation-demo-owner';$('#panel-orders').prepend(section);}
        section.hidden=!rows.length;section.innerHTML='<h3>테스트 예약</h3><div class="reservation-demo-list">'+rows.map(row=>card(row)).join('')+'</div>';
        let banner=$('#ownerReservationDemoBanner');if(!banner){banner=document.createElement('div');banner.id='ownerReservationDemoBanner';banner.className='reservation-demo-banner';$('#panel-operations')?.prepend(banner);}
        const pending=rows.filter(row=>row.status==='pending').length;banner.hidden=!pending;banner.innerHTML=`<span>모티프 테스트 예약 ${pending}건이 도착했습니다.</span><button class="secondary-btn" type="button" data-demo-owner-open>주문 관리</button>`;
        publish(business.id,rows);
      }
      const target=new URLSearchParams(location.search).get('demoId');
      if(target&&!linked&&rows.some(row=>row.id===target)){linked=true;const node=$(`[data-reservation-demo-id="${CSS.escape(target)}"]`);node?.scrollIntoView({block:'center'});node?.querySelector('[data-demo-decision]')?.focus({preventScroll:true});}
      window.lucide?.createIcons();
    }finally{refreshing=false;}
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-demo-all'))void create(true);
    if(button.hasAttribute('data-demo-reload'))void loadAdmin().catch(error=>report(error.message));
    if(button.hasAttribute('data-demo-owner-open'))window.switchPanel('orders');
    if(button.dataset.demoChat){const url=new URL(location.href);url.search='';url.searchParams.set('open','chat');url.searchParams.set('conversationId',button.dataset.demoChat);url.searchParams.set('businessId',button.dataset.businessId);location.assign(url.href);}
    if(button.dataset.demoInquiry){const message=prompt('사장님께 보낼 시연 문의를 입력해주세요. 실제 채팅과 알림톡으로 전달됩니다.','예약 시연입니다. 바비큐 이용 시간을 알려주세요.');if(!message?.trim())return;button.disabled=true;try{await call('send_reservation_demo_inquiry',{target_demo_id:button.dataset.demoInquiry,message_body:message.trim()});report('시연 문의를 보냈습니다. 사장님 채팅에서 답변해보세요.');}catch(error){report(error.message);}finally{button.disabled=false;}}
    if(button.hasAttribute('data-demo-clear')){if(!confirm('시연 예약·채팅을 보관 처리하고 대기 중인 시연 알림을 취소할까요? 실제 예약은 그대로 유지됩니다.'))return;button.disabled=true;try{await call('archive_reservation_demos',{target_business_id:null});report('테스트 예약을 정리했습니다.');await refresh();}catch(error){report(error.message);}finally{button.disabled=false;}}
    if(button.dataset.demoDecision){const decision=button.dataset.demoDecision,reason=decision==='rejected'?prompt('테스트 거절 사유를 입력해주세요.')?.trim():null;if(decision==='rejected'&&!reason)return;button.disabled=true;try{await call('handle_reservation_demo',{target_demo_id:button.dataset.demoId,decision,reason});await refresh();}catch(error){alert(error.message);}finally{button.disabled=false;}}
  });
  const init=window.initAdminMasterDashboard;
  window.initAdminMasterDashboard=function(...args){const result=init?.apply(this,args);mount();const menu=$('#dynamic-sidebar-menu-target-box .sidebar-menu');if(menu&&!$('#m-btn-demo')){const li=document.createElement('li');li.innerHTML='<button class="menu-item" id="m-btn-demo" type="button"><i data-lucide="flask-conical"></i> 예약 시연</button>';menu.append(li);$('#m-btn-demo').onclick=()=>{window.switchMasterPanel('master-demo');$('#m-btn-demo').classList.add('active');};}window.lucide?.createIcons();return result;};
  const switchMaster=window.switchMasterPanel;
  window.switchMasterPanel=function(panel,...args){const result=switchMaster?.call(this,panel,...args);if(panel==='master-demo'){mount();$('#m-btn-demo')?.classList.add('active');void loadAdmin().catch(error=>report(error.message));}return result;};
  const load=window.loadMotfPartnerTransactions;
  window.loadMotfPartnerTransactions=async function(...args){const result=await load?.apply(this,args);void refresh().catch(()=>{});return result;};
  const calendar=window.renderCalendar;
  window.renderCalendar=function(...args){const result=calendar?.apply(this,args);if(window.motfCurrentProfile?.role==='admin')return result;
    document.querySelectorAll('[data-calendar-day]').forEach(cell=>{const day=cell.dataset.calendarDay;(window.motfReservationDemoRows||[]).filter(row=>['pending','confirmed'].includes(row.status)&&day>=row.check_in&&day<row.check_out).slice(0,3).forEach(row=>{const badge=document.createElement('button');badge.type='button';badge.className='cal-badge '+(row.status==='confirmed'?'confirm':'pending');badge.dataset.demoOwnerOpen='';badge.textContent=`[시연] ${row.offering_name} · ${row.status==='confirmed'?'확정':'대기'}`;badge.onclick=event=>{event.stopPropagation();window.switchPanel('orders');};cell.append(badge);});});return result;};
  window.addEventListener('motf:owner-panel-change',event=>{if(['operations','orders','calendar'].includes(event.detail?.panelId))void refresh().catch(()=>{});});
  window.addEventListener('focus',()=>{void refresh().catch(()=>{});});
  setInterval(()=>{void refresh().catch(()=>{});},8000);
})();
