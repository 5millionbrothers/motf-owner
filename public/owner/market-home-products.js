(function connectHomeProducts(){
  'use strict';
  const $=(selector,root=document)=>root.querySelector(selector),$$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const icon=name=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
  const normalize=value=>String(value||'').trim().toLocaleLowerCase('ko-KR').replace(/\s+/g,' ');
  const name=item=>item.detail_sections?.productDisplayName||item.name;
  const key=item=>item.detail_sections?.productGroupKey?`configured:${normalize(item.detail_sections.productGroupKey)}`:`catalog:${normalize(name(item))}:${normalize(item.detail_sections?.manufacturer)}`;
  const canEdit=()=>window.motfCurrentBusiness?.business_type==='market'&&window.motfHasBusinessPermission?.('listing');
  const client=()=>window.motfSupabase;
  let version=0,session=null;
  const dialog=document.createElement('dialog');dialog.className='market-home-dialog';dialog.setAttribute('aria-labelledby','marketHomeTitle');document.body.append(dialog);
  const mounted=window.motfPcMarketInventoryMounted;
  window.motfPcMarketInventoryMounted=function(box,items){
    mounted?.(box,items);
    if(!canEdit())return;
    const button=document.createElement('button');button.type='button';button.className='secondary-btn market-home-open';button.dataset.openHomeProducts='';
    button.innerHTML=icon('layout-grid')+'홈 추천 상품 4개 선택';button.onclick=open;
    ($('.pc1023-stock-picker',box)||box).prepend(button);window.lucide?.createIcons();
  };
  function status(text){const node=$('[data-home-pick-status]',dialog);if(node)node.textContent=text;}
  function render(){
    if(!session)return;
    const selected=session.ids.map(id=>session.items.find(item=>item.id===id)).filter(Boolean);
    $('[data-home-pick-count]',dialog).textContent=`${selected.length} / 4개`;
    $('[data-home-pick-slots]',dialog).innerHTML=Array.from({length:4},(_,index)=>{
      const item=selected[index];return `<li>${item?`<img src="${esc(item.image_url)}" alt="${esc(name(item))}"><strong>${esc(name(item))}</strong><div><button type="button" data-home-pick-move="${index}" data-direction="-1" aria-label="${esc(name(item))} 앞으로" ${index===0?'disabled':''}>${icon('chevron-left')}</button><button type="button" data-home-pick-move="${index}" data-direction="1" aria-label="${esc(name(item))} 뒤로" ${index===selected.length-1?'disabled':''}>${icon('chevron-right')}</button><button type="button" data-home-pick-remove="${item.id}" aria-label="${esc(name(item))} 선택 해제">${icon('x')}</button></div>`:`<span>${index+1}</span><small>상품 선택</small>`}</li>`;
    }).join('');
    const query=normalize($('[data-home-pick-search]',dialog).value),category=$('[data-home-pick-category]',dialog).value;
    const items=session.items.filter(item=>(category===''||item.category===category)&&normalize([name(item),item.unit,item.category].join(' ')).includes(query));
    $('[data-home-pick-list]',dialog).innerHTML=items.map(item=>`<label class="market-home-option"><input type="checkbox" data-home-pick-id="${item.id}" ${session.ids.includes(item.id)?'checked':''} ${!session.ids.includes(item.id)&&session.ids.length===4?'disabled':''}><img src="${esc(item.image_url)}" alt="" loading="lazy"><span><strong>${esc(name(item))}</strong><small>${esc(item.unit)} · ${Number(item.price).toLocaleString('ko-KR')}원</small></span></label>`).join('')||'<p>해당하는 판매 상품이 없습니다.</p>';
    $('[data-home-pick-save]',dialog).disabled=session.busy||session.ids.length!==4;
    $$('input,select,button',dialog).forEach(node=>{if(session.busy)node.disabled=true;else if(node.matches('[data-home-pick-search],[data-home-pick-category],[data-home-pick-close]'))node.disabled=false;});
    window.lucide?.createIcons();
    $$('button[aria-label]',dialog).forEach(button=>{button.title=button.getAttribute('aria-label');});
  }
  async function open(){
    if(!canEdit())return;
    const request=++version,businessId=window.motfCurrentBusiness.id;session=null;
    dialog.innerHTML=`<header><h2 id="marketHomeTitle">홈 추천 상품</h2><button class="secondary-btn" type="button" data-home-pick-close aria-label="닫기">${icon('x')}</button></header><p role="status">판매 상품과 현재 추천을 불러오는 중입니다.</p>`;
    if(!dialog.open)dialog.showModal();window.lucide?.createIcons();
    try{
      const productResult=await client().from('offerings').select('id,name,unit,category,price,image_url,detail_sections,stock_quantity').eq('business_id',businessId).eq('is_active',true).eq('market_review_status','approved').is('retired_at',null).gt('price',0).order('sort_order').order('id');
      if(productResult.error)throw productResult.error;
      const selectionResult=await client().from('market_home_selections').select('offering_ids,updated_at').eq('business_id',businessId).maybeSingle();
      if(selectionResult.error)throw selectionResult.error;
      if(request!==version||window.motfCurrentBusiness?.id!==businessId)return;
      const grouped=new Map();
      (productResult.data||[]).filter(item=>item.stock_quantity!==0).forEach(item=>{const token=key(item);if(!grouped.has(token))grouped.set(token,[]);grouped.get(token).push(item);});
      const saved=selectionResult.data,items=[...grouped.values()].map(variants=>variants.find(item=>saved?.offering_ids.includes(item.id))||variants.find(item=>item.detail_sections?.isDefaultVariant===true)||[...variants].sort((a,b)=>Number(a.price)-Number(b.price))[0]);
      const ids=saved?saved.offering_ids.filter(id=>items.some(item=>item.id===id)):['삼겹','목살','참이슬','테라'].map(label=>items.find(item=>name(item).includes(label))?.id).filter(Boolean);
      session={businessId,items,ids:[...new Set(ids)],updatedAt:saved?.updated_at||null,busy:false};
      dialog.innerHTML=`<header><div><h2 id="marketHomeTitle">홈 추천 상품</h2><p>이용자 메인 화면</p></div><button class="secondary-btn" type="button" data-home-pick-close aria-label="닫기">${icon('x')}</button></header><div class="market-home-count"><strong>추천 상품</strong><span data-home-pick-count></span></div><ol data-home-pick-slots></ol><div class="market-home-filters"><label>상품 검색<input type="search" placeholder="상품명·용량 검색" data-home-pick-search></label><label>카테고리<select data-home-pick-category><option value="">전체</option>${[...new Set(items.map(item=>item.category))].map(category=>`<option value="${esc(category)}">${esc(category)}</option>`).join('')}</select></label></div><div data-home-pick-list></div><footer><p role="status" data-home-pick-status></p><button type="button" class="primary-btn" data-home-pick-save>${icon('save')}추천 상품 저장</button></footer>`;
      render();
      if(items.length<4)status('추천 가능한 판매 상품이 4종 이상 필요합니다.');
      else if(saved&&ids.length<4)status('숨김·품절 등으로 제외된 상품이 있습니다. 4개를 다시 선택해주세요.');
    }catch(error){
      if(request!==version)return;
      dialog.innerHTML=`<header><h2 id="marketHomeTitle">홈 추천 상품</h2><button class="secondary-btn" type="button" data-home-pick-close>닫기</button></header><p role="alert">${esc(error.message||'상품 정보를 불러오지 못했습니다.')}<br>SQL 101 적용 여부를 확인하고 다시 열어주세요.</p>`;
    }
  }
  dialog.addEventListener('input',event=>{if(event.target.matches('[data-home-pick-search]'))render();});
  dialog.addEventListener('change',event=>{
    if(!session||session.busy)return;
    if(event.target.matches('[data-home-pick-category]'))return render();
    const id=event.target.dataset.homePickId;if(!id)return;
    if(event.target.checked&&session.ids.length<4)session.ids.push(id);else session.ids=session.ids.filter(value=>value!==id);
    status('');render();
  });
  function close(){if(session?.busy)return;version++;session=null;dialog.close();}
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('click',async event=>{
    if(event.target.closest('[data-home-pick-close]'))return close();
    if(!session||session.busy)return;
    const remove=event.target.closest('[data-home-pick-remove]'),move=event.target.closest('[data-home-pick-move]');
    if(remove){session.ids=session.ids.filter(id=>id!==remove.dataset.homePickRemove);status('');return render();}
    if(move){const from=Number(move.dataset.homePickMove),to=from+Number(move.dataset.direction);if(to>=0&&to<session.ids.length)[session.ids[from],session.ids[to]]=[session.ids[to],session.ids[from]];return render();}
    if(!event.target.closest('[data-home-pick-save]')||!canEdit()||session.ids.length!==4)return;
    const current=session,stamp=version;if(window.motfCurrentBusiness.id!==current.businessId)return;
    current.busy=true;status('저장 중입니다.');render();
    try{
      const {data,error}=await client().rpc('save_market_home_products',{target_business_id:current.businessId,product_ids:current.ids,expected_updated_at:current.updatedAt});
      if(error)throw error;
      if(stamp!==version||window.motfCurrentBusiness?.id!==current.businessId)return;
      current.updatedAt=data.updated_at;status('저장했습니다. 이용자 메인 화면을 새로고침하면 반영됩니다.');
    }catch(error){if(stamp===version)status(error.message||'추천 상품을 저장하지 못했습니다.');}
    finally{if(stamp===version){current.busy=false;render();}}
  });
  window.addEventListener('motf:owner-workspace-clear',()=>{version++;session=null;dialog.close();});
})();
