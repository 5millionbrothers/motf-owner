(function connectMarketInventory() {
  'use strict';
  const $=(s,root=document)=>root.querySelector(s), $$=(s,root=document)=>[...root.querySelectorAll(s)];
  const client=()=>window.motfSupabase;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=name=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
  const categories=()=>window.motfMarketCategories||[];
  const editor=document.createElement('dialog');editor.className='market-product-dialog';editor.setAttribute('aria-label','상품 편집');document.body.append(editor);
  const confirmDialog=document.createElement('dialog');confirmDialog.className='market-product-confirm';document.body.append(confirmDialog);
  let editing=null,editorVersion=0,adminVersion=0,adminData=null,adminTab='pending';
  const detailFields={manufacturer:'제조사',temperature:'보관 온도·제품 상태',storage:'보관 방법',expiry:'소비기한 안내',ingredients:'원재료',allergens:'알레르기 정보',productType:'식품 유형',alcohol:'알코올 함량',cautions:'주의사항',sellerNote:'판매자 안내'};
  const canEdit=()=>window.motfCurrentBusiness?.business_type==='market'&&window.motfHasBusinessPermission?.('listing');
  const isAdmin=()=>window.motfCurrentProfile?.role==='admin';
  function refreshIcons(){window.lucide?.createIcons();}
  function field(name,label,value='',options={}) {
    const {type='text',required=false,wide=false,min,max}=options;
    return `<label class="${wide?'market-field-wide':''}"><span>${esc(label)}${required?' <b aria-label="필수">*</b>':''}</span><input name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''} ${min!=null?`min="${min}"`:''} ${max!=null?`max="${max}"`:''} ${type==='number'?'step="1"':'maxlength="500"'}></label>`;
  }
  function setError(message){const node=$('[data-product-error]',editor);if(node)node.textContent=message||'';}
  function busy(value){if(!editing)return;editing.busy=value;$$('button,input,select,textarea',editor).forEach(node=>node.disabled=value);}
  function photos(){
    const host=$('[data-product-photos]',editor);if(!host||!editing)return;
    host.innerHTML=editing.images.map((url,index)=>`<figure draggable="true" data-product-photo="${index}"><img src="${esc(url)}" alt="상품 사진 ${index+1}"><figcaption>${index===0?'대표 사진':`${index+1}번 사진`}</figcaption><div><button class="secondary-btn" type="button" data-photo-move="${index}" data-direction="-1" aria-label="사진 앞으로" ${index===0?'disabled':''}>${icon('chevron-left')}</button><button class="secondary-btn" type="button" data-photo-move="${index}" data-direction="1" aria-label="사진 뒤로" ${index===editing.images.length-1?'disabled':''}>${icon('chevron-right')}</button><button class="secondary-btn" type="button" data-photo-remove="${index}" aria-label="사진 제외">${icon('trash-2')}</button></div></figure>`).join('')||'<p class="market-empty">등록할 상품 사진을 선택해주세요.</p>';
    let dragged=null;
    $$('[data-product-photo]',host).forEach(node=>{
      node.ondragstart=e=>{dragged=Number(node.dataset.productPhoto);e.dataTransfer.setData('text/plain',String(dragged));};
      node.ondragover=e=>e.preventDefault();
      node.ondragend=()=>dragged=null;
      node.ondrop=e=>{e.preventDefault();if(dragged===null||editing.busy)return;const image=editing.images.splice(dragged,1)[0];editing.images.splice(Number(node.dataset.productPhoto),0,image);dragged=null;photos();};
    });
    refreshIcons();
  }
  function renderEditor(){
    const item=editing.item||{},details=item.detail_sections||{};
    const displayName=details.productDisplayName||item.name||'';
    editor.innerHTML=`<header class="market-workflow-heading"><div><h2>${item.id?'상품 수정':'신규 상품 등록'}</h2><p>${item.market_review_status==='approved'?'저장하면 바로 반영되고 운영팀에 변경 알림이 전달됩니다.':'입력한 상품과 사진은 운영팀 승인 후 공개됩니다.'}</p></div><button type="button" class="secondary-btn" data-market-editor-close aria-label="닫기">${icon('x')}</button></header>
      <form data-market-product-form><fieldset class="market-product-fields"><legend>상품 정보</legend>
      ${field('display_name','상품명',displayName,{required:true})}${field('variant_label','옵션 이름',details.variantLabel||'')}
      <label><span>상품 분류 <b>*</b></span><select name="category" required>${categories().map(c=>`<option ${c===item.category?'selected':''}>${esc(c)}</option>`).join('')}</select></label>
      ${field('price','판매가 (원)',item.price??'',{type:'number',required:true,min:1,max:99999999})}${field('unit','판매 단위·용량',item.unit||'',{required:true})}${field('origin','원산지·제조국',item.origin||'',{required:true})}
      ${field('minimum','최소 주문 수량',details.minimumOrderQuantity||1,{type:'number',required:true,min:1,max:1000})}${field('step','수량 증가 단위',details.quantityStep||1,{type:'number',required:true,min:1,max:1000})}${field('quantity_unit','수량 표시 단위',details.quantityUnit||'개',{required:true})}${field('stock','재고 수량 (선택)',item.stock_quantity??'',{type:'number',min:0,max:999999999})}
      <label class="market-check"><input type="checkbox" name="is_alcohol" ${item.is_alcohol?'checked':''}><span>주류 상품</span></label>
      <label class="market-field-wide"><span>상품 설명 <b>*</b></span><textarea name="description" required maxlength="5000" rows="3">${esc(item.description||'')}</textarea></label></fieldset>
      <details class="market-product-optional"><summary>상품 상세 표시사항</summary><div class="market-product-fields">${Object.entries(detailFields).map(([name,label])=>field(name,label,details[name]||'')).join('')}${field('nutrition','영양 정보',item.nutrition_info?.description||'',{wide:true})}</div></details>
      <fieldset class="market-product-photo-section"><legend>상품 사진 <b>*</b></legend><label class="market-product-upload" data-product-drop>${icon('image-plus')}<span>사진을 선택하거나 이곳에 끌어다 놓기</span><input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" data-product-files></label><p class="market-field-note">첫 사진이 대표 사진입니다. 한 장당 5MB 이하, 최대 100장.</p><div data-product-photos class="market-product-photos"></div></fieldset>
      <p role="status" data-product-error class="market-product-error"></p><footer class="market-product-form-actions"><button type="button" class="secondary-btn" data-market-editor-close>취소</button><button type="submit" class="primary-btn">${icon(item.market_review_status==='approved'?'save':'send')}${item.market_review_status==='approved'?'변경사항 저장':'등록 심사 요청'}</button></footer></form>`;
    const category=$('[name=category]',editor),alcohol=$('[name=is_alcohol]',editor);
    const syncAlcohol=()=>{if(category.value==='주류')alcohol.checked=true;alcohol.disabled=category.value==='주류';};category.addEventListener('change',syncAlcohol);syncAlcohol();
    $('[data-product-files]',editor).addEventListener('change',event=>upload(event.target.files));
    const drop=$('[data-product-drop]',editor);drop.addEventListener('dragover',event=>event.preventDefault());drop.addEventListener('drop',event=>{event.preventDefault();void upload(event.dataTransfer.files);});
    photos();refreshIcons();
  }
  async function openEditor(id){
    if(!canEdit())return;
    const stamp=++editorVersion,businessId=window.motfCurrentBusiness.id;
    editing={businessId,item:null,images:[],requestKey:crypto.randomUUID(),busy:false};
    editor.innerHTML='<p>상품 정보를 불러오는 중입니다.</p><button type="button" class="secondary-btn" data-market-editor-close>닫기</button>';if(!editor.open)editor.showModal();
    if(id){
      const {data,error}=await client().from('offerings').select('*').eq('id',id).eq('business_id',businessId).is('retired_at',null).single();
      if(stamp!==editorVersion||window.motfCurrentBusiness?.id!==businessId)return;
      if(error||!data){editor.innerHTML=`<p role="alert">${esc(error?.message||'상품을 찾을 수 없습니다.')}</p><button type="button" class="secondary-btn" data-market-editor-close>닫기</button>`;return;}
      editing.item=data;editing.images=[...new Set([data.image_url,...(data.image_urls||[])].filter(Boolean))];
    }
    renderEditor();
  }
  async function upload(files){
    if(!editing||editing.busy)return;
    const list=[...(files||[])],session=editing,version=editorVersion,user=window.motfCurrentProfile?.id;
    if(!list.length)return;
    if(list.length+session.images.length>100)return setError('사진은 최대 100장까지 등록할 수 있습니다.');
    if(list.some(file=>!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>5*1024*1024))return setError('JPG·PNG·WebP·GIF 이미지, 한 장당 5MB 이하만 가능합니다.');
    busy(true);
    try{
      for(let index=0;index<list.length;index++){
        if(version!==editorVersion||window.motfCurrentBusiness?.id!==session.businessId)throw Error('관리 업장이 바뀌었습니다. 다시 열어주세요.');
        const file=list[index],extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'}[file.type];
        const key=`${user}/${session.businessId}/${crypto.randomUUID()}.${extension}`;
        setError(`사진 업로드 ${index+1}/${list.length}`);
        const {error}=await client().storage.from('catalog-images').upload(key,file,{cacheControl:'3600',upsert:false});if(error)throw error;
        if(version!==editorVersion)return;
        const url=client().storage.from('catalog-images').getPublicUrl(key).data?.publicUrl;if(!url)throw Error('사진 주소를 불러오지 못했습니다.');session.images.push(url);
      }
      setError('');
    }catch(error){if(version===editorVersion)setError(error.message||'사진 업로드 실패');}
    finally{if(version===editorVersion){busy(false);photos();const category=$('[name=category]',editor);$('[name=is_alcohol]',editor).disabled=category?.value==='주류';}}
  }
  async function reloadInventory(businessId){
    if(window.motfCurrentBusiness?.id!==businessId)return;
    await window.motfRenderAvailabilityManager?.('partner',businessId);
    window.motfRefreshPartnerOperations?.(true);
    if(window.motfCurrentBusiness?.id!==businessId)return;
    const {data}=await client().from('offerings').select('*').eq('business_id',businessId).is('retired_at',null).order('sort_order');
    if(data&&window.motfCurrentBusiness?.id===businessId){window.motfApplyOfferingsToDashboard?.(data);window.motfUpdateListingReviewUi?.();}
  }
  editor.addEventListener('submit',async event=>{
    event.preventDefault();if(!editing||editing.busy||!canEdit())return;
    const form=event.target;if(!form.reportValidity())return;
    if(!editing.images.length)return setError('상품 사진을 1장 이상 등록해주세요.');
    const session=editing,version=editorVersion,item=session.item||{},values=new FormData(form),get=name=>String(values.get(name)||'').trim();
    const display=get('display_name'),variant=get('variant_label'),details={...(item.detail_sections||{}),productDisplayName:display,variantLabel:variant,
      productGroupKey:item.detail_sections?.productDisplayName===display&&item.detail_sections?.productGroupKey?item.detail_sections.productGroupKey:display+':',
      minimumOrderQuantity:Number(get('minimum')),quantityStep:Number(get('step')),quantityUnit:get('quantity_unit')};
    Object.keys(detailFields).forEach(key=>details[key]=get(key));
    const payload={name:[display,variant].filter(Boolean).join(' · '),description:get('description'),price:Number(get('price')),category:get('category'),unit:get('unit'),origin:get('origin'),image_urls:[...session.images],
      detail_sections:details,nutrition_info:{...(item.nutrition_info||{}),description:get('nutrition')},is_alcohol:$('[name=is_alcohol]',form).checked,stock_quantity:get('stock')===''?null:Number(get('stock'))};
    if(window.motfCurrentBusiness.id!==session.businessId)return;
    busy(true);setError('저장 중입니다.');
    try{
      const {data,error}=await client().rpc('save_market_product',{target_business_id:session.businessId,product_data:payload,target_product_id:item.id||null,expected_updated_at:item.updated_at||null,request_key:session.requestKey});if(error)throw error;
      if(version!==editorVersion||window.motfCurrentBusiness?.id!==session.businessId)return;
      editor.close();editing=null;
      await reloadInventory(session.businessId);
      const status=$('#marketInventorySaveStatus')||document.createElement('p');status.id='marketInventorySaveStatus';status.setAttribute('role','status');status.className='market-save-status';status.textContent=data?.market_review_status==='approved'?'상품을 수정했습니다. 이용자 화면에 바로 반영되고 운영팀에 변경 알림이 전달됩니다.':'등록 심사를 요청했습니다. 운영팀 승인 후 공개됩니다.';
      $('#partnerAvailabilityManager')?.prepend(status);
    }catch(error){if(version===editorVersion)setError(error.message||'상품을 저장하지 못했습니다.');}
    finally{if(version===editorVersion&&editing){busy(false);$('[name=is_alcohol]',editor).disabled=$('[name=category]',editor)?.value==='주류';}}
  });
  editor.addEventListener('cancel',event=>{if(editing?.busy)event.preventDefault();});
  function closeEditor(){if(editing?.busy)return;editorVersion++;editing=null;editor.close();}
  function confirmAction(title,text,action,reason=false){
    confirmDialog.innerHTML=`<form><h2>${esc(title)}</h2><p>${esc(text)}</p>${reason?'<label>반려 사유<textarea name="reason" required maxlength="1000" rows="3"></textarea></label>':''}<p role="alert"></p><footer class="market-product-form-actions"><button type="button" class="secondary-btn" data-confirm-cancel>취소</button><button type="submit" class="primary-btn">확인</button></footer></form>`;
    let pending=false;
    confirmDialog.oncancel=event=>{if(pending)event.preventDefault();};
    confirmDialog.showModal();$('[data-confirm-cancel]',confirmDialog).onclick=()=>{if(!pending)confirmDialog.close();};
    $('form',confirmDialog).onsubmit=async event=>{event.preventDefault();if(pending)return;const form=event.target;pending=true;$$('button',form).forEach(b=>b.disabled=true);try{await action(form.elements.reason?.value.trim()||'');confirmDialog.close();}catch(error){$('[role=alert]',form).textContent=error.message;}finally{pending=false;$$('button',form).forEach(b=>b.disabled=false);}};
  }
  function removeProduct(button){
    if(!canEdit())return;const businessId=window.motfCurrentBusiness.id;
    confirmAction('상품 삭제','이 상품을 판매·편집 목록에서 삭제할까요? 기존 주문의 상품 기록은 보존됩니다.',async()=>{
      if(window.motfCurrentBusiness?.id!==businessId)throw Error('관리 업장이 바뀌었습니다.');
      const {error}=await client().rpc('delete_market_product',{target_product_id:button.dataset.deleteMarketProduct,expected_updated_at:button.dataset.productVersion});if(error)throw error;await reloadInventory(businessId);
    });
  }
  const fieldLabels={name:'상품명',description:'설명',price:'판매가',unit:'판매 단위',category:'분류',origin:'원산지·제조국',is_alcohol:'주류 여부',stock_quantity:'재고',is_active:'판매 중',retired_at:'삭제일',market_review_status:'심사 상태',market_review_note:'반려 사유'};
  const valueText=value=>value==null||value===''?'미입력':typeof value==='object'?JSON.stringify(value):typeof value==='boolean'?value?'예':'아니오':String(value);
  function detailMarkup(data){
    if(!data)return '<p>이전 정보 없음</p>';
    return `<dl class="market-product-review-fields">${Object.entries(fieldLabels).map(([key,label])=>`<div><dt>${label}</dt><dd>${esc(valueText(data[key]))}</dd></div>`).join('')}${Object.entries(data.detail_sections||{}).filter(([key])=>key!=='importSource'&&key!=='sourceUrl').map(([key,value])=>`<div><dt>${esc(detailFields[key]||({productDisplayName:'표시 상품명',productGroupKey:'상품 묶음',variantLabel:'옵션명',minimumOrderQuantity:'최소 주문량',quantityStep:'수량 증가 단위',quantityUnit:'수량 표시 단위'}[key])||key)}</dt><dd>${esc(valueText(value))}</dd></div>`).join('')}<div><dt>영양 정보</dt><dd>${esc(valueText(data.nutrition_info))}</dd></div></dl><div class="market-product-review-images">${[...new Set([data.image_url,...(data.image_urls||[])].filter(url=>/^https?:\/\//.test(url||'')))].map(url=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"><img src="${esc(url)}" alt="상품 검토 사진" loading="lazy"></a>`).join('')}</div>`;
  }
  const actionLabels={submitted:'등록 신청',updated:'상품 수정',deleted:'상품 삭제',review_approved:'등록 승인',review_rejected:'등록 반려',review_pending:'재심사 요청'};
  function renderAdmin(){
    const host=$('#marketProductAdminList');if(!host||!adminData||!isAdmin())return;
    const rows=adminTab==='pending'?adminData.pending:adminData.changes;
    host.innerHTML=adminTab==='pending'?(rows||[]).map(item=>`<article class="market-product-review-card"><header><div><small>${esc(item.business_name)}</small><h3>${esc(item.name)}</h3><time>${esc(new Date(item.market_submitted_at||item.updated_at).toLocaleString('ko-KR'))}</time></div><span class="market-workflow-badge">심사 대기</span></header>${detailMarkup(item)}<footer><button class="secondary-btn" data-market-review="rejected" data-id="${item.id}" data-version="${esc(item.updated_at)}">반려</button><button class="primary-btn" data-market-review="approved" data-id="${item.id}" data-version="${esc(item.updated_at)}">승인·공개</button></footer></article>`).join('')||'<p class="market-empty">심사 대기 중인 신규 상품이 없습니다.</p>':
      `<div class="market-workflow-heading"><p>미확인 알림 우선 · 최대 100건 · 변경 전후 전체 내용을 확인할 수 있습니다.</p><button class="secondary-btn" type="button" data-market-read-all>표시된 알림 읽음 처리</button></div>`+(rows||[]).map(item=>`<article class="market-product-review-card ${item.seen_at?'':'is-unread'}"><header><div><small>${esc(item.business_name)} · ${esc(actionLabels[item.action]||item.action)}</small><h3>${esc(item.after_data?.name||item.before_data?.name||'상품')}</h3><time>${esc(new Date(item.created_at).toLocaleString('ko-KR'))}</time></div>${item.seen_at?'':'<span class="market-workflow-badge">새 알림</span>'}</header><details><summary>변경 전후 상세 보기</summary><div class="market-product-before-after"><section><h4>변경 전</h4>${detailMarkup(item.before_data)}</section><section><h4>변경 후</h4>${detailMarkup(item.after_data)}</section></div></details></article>`).join('');
    refreshIcons();
  }
  function badge(data){
    const node=$('#marketProductAdminBadge');if(node){const count=Number(data.pending_count||0)+Number(data.unread_count||0);node.hidden=!count;node.textContent=String(count);node.setAttribute('aria-label',`상품 심사 ${data.pending_count||0}건, 읽지 않은 변경 ${data.unread_count||0}건`);}
    const status=$('#marketProductAdminStatus');if(status)status.textContent=`신규 상품 심사 ${data.pending_count||0}건 · 읽지 않은 변경 알림 ${data.unread_count||0}건`;
  }
  window.motfRefreshMarketProductBadge=async function(){
    if(!client()||!isAdmin())return;
    const user=window.motfCurrentProfile.id,{data,error}=await client().rpc('market_product_admin_counts');if(!error&&isAdmin()&&window.motfCurrentProfile.id===user)badge(data||{});
  };
  window.motfLoadMarketProductAdmin=async function(){
    if(!client()||!isAdmin())return;
    const version=++adminVersion,user=window.motfCurrentProfile.id,host=$('#marketProductAdminList');if(host)host.textContent='상품 심사·변경 내역을 불러오는 중입니다.';
    const {data,error}=await client().rpc('market_product_admin_dashboard');if(version!==adminVersion||!isAdmin()||window.motfCurrentProfile.id!==user)return;
    if(error){host.textContent=`내역을 불러오지 못했습니다. ${error.message}`;return;}adminData=data||{pending:[],changes:[]};badge(adminData);renderAdmin();
  };
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-add-market-product'))void openEditor();
    if(button.hasAttribute('data-edit-market-product'))void openEditor(button.dataset.editMarketProduct);
    if(button.hasAttribute('data-delete-market-product'))removeProduct(button);
    if(button.hasAttribute('data-market-editor-close'))closeEditor();
    if(button.hasAttribute('data-photo-remove')&&editing&&!editing.busy){editing.images.splice(Number(button.dataset.photoRemove),1);photos();}
    if(button.hasAttribute('data-photo-move')&&editing&&!editing.busy){const from=Number(button.dataset.photoMove),to=from+Number(button.dataset.direction);if(to>=0&&to<editing.images.length){const image=editing.images.splice(from,1)[0];editing.images.splice(to,0,image);photos();}}
    if(button.hasAttribute('data-market-admin-tab')){adminTab=button.dataset.marketAdminTab;$$('[data-market-admin-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderAdmin();}
    if(button.hasAttribute('data-market-review')&&isAdmin()){
      const decision=button.dataset.marketReview;
      confirmAction(decision==='approved'?'신규 상품 승인':'상품 등록 반려',decision==='approved'?'검토한 상품을 승인하고 공개할까요?':'사장님이 보완할 수 있도록 반려 사유를 남겨주세요.',async note=>{
        const {error}=await client().rpc('review_market_product',{target_product_id:button.dataset.id,decision,expected_updated_at:button.dataset.version,review_note:note||null});if(error)throw error;await window.motfLoadMarketProductAdmin();
      },decision==='rejected');
    }
    if(button.hasAttribute('data-market-read-all')&&isAdmin()){
      button.disabled=true;const ids=(adminData?.changes||[]).filter(item=>!item.seen_at).map(item=>item.id);
      client().rpc('mark_market_changes_seen',{target_ids:ids}).then(async({error})=>{if(error)$('#marketProductAdminStatus').textContent=error.message;else await window.motfLoadMarketProductAdmin();}).finally(()=>button.disabled=false);
    }
  });
  window.addEventListener('motf:owner-workspace-clear',()=>{editorVersion++;adminVersion++;editing=null;adminData=null;editor.close();confirmDialog.close();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void window.motfRefreshMarketProductBadge();});
  setInterval(()=>{if(document.visibilityState==='visible')void window.motfRefreshMarketProductBadge();},30000);
})();
