(function marketPc1023() {
  const desktop=()=>matchMedia('(min-width:1024px)').matches;
  const market=()=>window.motfCurrentBusiness?.business_type==='market' && desktop();
  const categories=['식재료','주류/음료','일회용품','냉동식품','기타'];
  const category=v=>categories.includes(v)?v:'기타';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let editCategory='',stockCategory='',photoCategory='',products=[],groups=[],previewCategory='',dirty=false,requestId=0;
  const selectors=(items,value,attribute)=>`<div class="pc1023-category-choices">${items.map(c=>`<button type="button" class="secondary-btn" ${attribute}="${esc(c)}" aria-pressed="${value===c}">${esc(c)}</button>`).join('')}</div>`;
  const originalEditor=window.renderRoomPriceTable;
  window.renderRoomPriceTable=function(...args) {
    originalEditor.apply(this,args);
    if(!market()) return;
    const body=document.getElementById('roomPriceTableBody');
    const sections=[...body.querySelectorAll('.market-product-category-section')];
    body.insertAdjacentHTML('afterbegin',`<div class="pc1023-market-editor-picker"><strong>1. 카테고리 선택</strong>${selectors(categories,editCategory,'data-edit-category')}<p>${editCategory?'2. 편집할 상품을 선택하세요.':'카테고리를 선택하면 해당 상품만 표시됩니다.'}</p><button type="button" class="secondary-btn" data-edit-preview>이용자 페이지 미리보기 · 상품 배치</button></div>`);
    body.querySelector('[data-edit-preview]').onclick=openPreview;
    sections.forEach(section=>{
      const label=section.querySelector('.market-product-category-head strong').textContent;
      section.classList.toggle('pc1023-product-hidden',label!==editCategory);
      section.querySelectorAll('.owner-room-editor').forEach(card=>{
        const button=document.createElement('button');button.type='button';button.className='secondary-btn';button.textContent='상품 편집';button.dataset.toggleProduct='';button.setAttribute('aria-expanded','false');
        card.querySelector('.owner-room-editor-head').append(button);
        card.querySelector('.owner-room-editor-body').classList.add('pc1023-product-hidden');
      });
    });
    body.querySelectorAll('[data-edit-category]').forEach(b=>b.onclick=()=>{ editCategory=b.dataset.editCategory;window.renderRoomPriceTable(); });
    body.querySelectorAll('[data-toggle-product]').forEach(b=>b.onclick=()=>{
      const content=b.closest('.owner-room-editor').querySelector('.owner-room-editor-body');
      content.classList.toggle('pc1023-product-hidden');const open=!content.classList.contains('pc1023-product-hidden');b.textContent=open?'접기':'상품 편집';b.setAttribute('aria-expanded',String(open));
    });
  };
  const originalAdd=window.addTableRow;
  window.addTableRow=function(...args) {
    if(!market()) return originalAdd.apply(this,args);
    if(!editCategory) { alert('상품을 추가할 카테고리를 먼저 선택해주세요.');return; }
    const before=mockData.market.rooms.length;
    originalAdd.apply(this,args);
    if(mockData.market.rooms.length>before) mockData.market.rooms.at(-1).category=editCategory;
    window.renderRoomPriceTable();
    const last=[...document.querySelectorAll('#roomPriceTableBody .market-product-category-section')].find(s=>s.querySelector('strong')?.textContent===editCategory)?.querySelector('.owner-room-editor:last-child [data-toggle-product]');
    last?.click();
  };
  const originalPhotos=window.renderPhotoTabs;
  window.renderPhotoTabs=function(...args) {
    originalPhotos.apply(this,args);
    if(!market()) return;
    const host=document.getElementById('photoCategoryContainer');
    const tabs=[...host.children];
    if(currentSelectedPhotoIndex>0 && mockData.market.rooms[currentSelectedPhotoIndex-1]) photoCategory=category(mockData.market.rooms[currentSelectedPhotoIndex-1].category);
    host.insertAdjacentHTML('afterbegin',selectors(['업장 외관',...categories],photoCategory || '업장 외관','data-photo-category'));
    tabs.forEach((tab,i)=>tab.classList.toggle('pc1023-product-hidden',i===0 ? Boolean(photoCategory) : !photoCategory || category(mockData.market.rooms[i-1]?.category)!==photoCategory));
    host.querySelectorAll('[data-photo-category]').forEach(b=>b.onclick=()=>{
      photoCategory=b.dataset.photoCategory==='업장 외관'?'':b.dataset.photoCategory;
      currentSelectedPhotoIndex=photoCategory ? Math.max(0,mockData.market.rooms.findIndex(p=>category(p.category)===photoCategory)+1) : 0;
      window.renderPhotoTabs();document.getElementById('currentSelectedTabLabelInfo').textContent=`선택된 사진 영역: ${mockData.market.photoTabs[currentSelectedPhotoIndex] || '업장 외관'}`;
      window.motfRefreshPhotoPreview?.();
    });
  };
  window.motfPcMarketInventoryMounted=function(box,items) {
    if(!market()) return;
    const sections=[...box.querySelectorAll('.motf-market-stock-category')];
    const available=[...new Set(items.map(p=>category(p.category)))];
    box.insertAdjacentHTML('afterbegin',`<div class="pc1023-stock-picker"><strong>카테고리 선택</strong>${selectors(available,stockCategory,'data-stock-category')}<p>카테고리를 선택한 뒤 재고·품절 상태를 관리하세요.</p>${window.motfHasBusinessPermission?.('listing')?'<button type="button" class="primary-btn" data-open-product-preview>이용자 페이지 미리보기 · 상품 배치</button>':''}</div>`);
    function filter() { sections.forEach(s=>s.classList.toggle('pc1023-product-hidden',s.querySelector('strong').textContent!==stockCategory)); }
    filter();
    box.querySelectorAll('[data-stock-category]').forEach(b=>b.onclick=()=>{stockCategory=b.dataset.stockCategory;box.querySelectorAll('[data-stock-category]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));filter();});
    box.querySelector('[data-open-product-preview]')?.addEventListener('click',openPreview);
  };
  const dialog=document.createElement('dialog');dialog.className='pc1023-product-preview';
  dialog.innerHTML='<header><div><h2>이용자 상품 목록 미리보기</h2><p>카테고리를 선택하고 상품을 끌어서 놓으세요. 저장 후 이용자 목록에 반영됩니다.</p></div><button type="button" class="secondary-btn" data-preview-close>닫기</button></header><div data-preview-content></div><p role="status" data-preview-status></p><div class="pc1023-actions"><button type="button" class="primary-btn" data-save-product-order>배치 저장</button></div>';
  document.body.append(dialog);
  let previewBusinessId='',saving=false;
  const normalize=v=>String(v||'').trim().toLocaleLowerCase('ko-KR').replace(/\s+/g,' ');
  const groupKey=p=>p.detail_sections?.productGroupKey?`configured:${normalize(p.detail_sections.productGroupKey)}`:`catalog:${normalize(p.name)}:${normalize(p.detail_sections?.manufacturer)}`;
  async function openPreview() {
    if(!market() || !window.motfHasBusinessPermission?.('listing')) return;
    const request=++requestId;previewBusinessId=window.motfCurrentBusiness.id;dirty=false;
    if(!dialog.open) dialog.showModal();
    dialog.querySelector('[data-preview-content]').textContent='상품을 불러오는 중입니다.';
    dialog.querySelector('[data-preview-status]').textContent='';
    dialog.querySelector('[data-save-product-order]').disabled=true;
    const r=await window.motfSupabase.from('offerings').select('id,name,category,price,image_url,is_active,sort_order,detail_sections').eq('business_id',previewBusinessId).order('sort_order').order('id');
    if(request!==requestId || previewBusinessId!==window.motfCurrentBusiness?.id) return;
    if(r.error) { dialog.querySelector('[data-preview-content]').textContent=r.error.message;return; }
    products=r.data || [];const grouped=new Map();
    products.forEach(p=>{const key=`${category(p.category)}:${groupKey(p)}`;if(!grouped.has(key)) grouped.set(key,[]);grouped.get(key).push(p);});
    groups=[...grouped.values()];previewCategory='';renderPreview();
  }
  function renderPreview() {
    const content=dialog.querySelector('[data-preview-content]');
    content.innerHTML=selectors(categories,previewCategory,'data-preview-category')+`<div class="pc1023-preview-grid">${groups.map((items,index)=>{
      const p=items[0];if(category(p.category)!==previewCategory) return '';
      return `<article class="pc1023-preview-product" draggable="true" data-product-position="${index}">${p.image_url?`<img src="${esc(p.image_url)}" alt="">`:'<div class="pc1023-preview-noimage">사진 없음</div>'}<strong>${esc(p.name)}</strong><span>${Number(Math.min(...items.map(i=>Number(i.price)||0))).toLocaleString()}원${items.length>1?'부터':''}</span><small>${items.length>1?`${items.length}개 옵션 · `:''}${items.some(i=>i.is_active)?'판매 중':'품절·숨김'}</small><div class="pc1023-actions"><button type="button" class="secondary-btn" data-product-move="-1" aria-label="${esc(p.name)} 앞으로">←</button><button type="button" class="secondary-btn" data-product-move="1" aria-label="${esc(p.name)} 뒤로">→</button></div></article>`;
    }).join('')}</div>${previewCategory?'':'<p>배치할 카테고리를 선택해주세요.</p>'}`;
    content.querySelectorAll('[data-preview-category]').forEach(b=>b.onclick=()=>{previewCategory=b.dataset.previewCategory;renderPreview();});
    let dragged=null;
    content.querySelectorAll('[data-product-position]').forEach(card=>{
      card.ondragstart=e=>{dragged=Number(card.dataset.productPosition);e.dataTransfer.setData('text/plain',String(dragged));e.dataTransfer.effectAllowed='move';};
      card.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='move';};
      card.ondrop=e=>{e.preventDefault();if(dragged!=null) move(dragged,Number(card.dataset.productPosition));};
      card.querySelectorAll('[data-product-move]').forEach(b=>b.onclick=()=>{const indices=groups.map((g,i)=>category(g[0].category)===previewCategory?i:-1).filter(i=>i>=0);const at=indices.indexOf(Number(card.dataset.productPosition));const to=indices[at+Number(b.dataset.productMove)];if(to!=null) move(Number(card.dataset.productPosition),to);});
    });
    dialog.querySelector('[data-save-product-order]').disabled=!dirty || saving;
  }
  function move(from,to) {
    if(saving || from===to || category(groups[from]?.[0]?.category)!==category(groups[to]?.[0]?.category)) return;
    const moved=groups.splice(from,1)[0];groups.splice(to,0,moved);dirty=true;
    dialog.querySelector('[data-preview-status]').textContent='저장하지 않은 배치가 있습니다.';renderPreview();
  }
  dialog.querySelector('[data-save-product-order]').onclick=async function() {
    if(saving || !dirty || previewBusinessId!==window.motfCurrentBusiness?.id) return;
    saving=true;this.disabled=true;
    try {
      const ordered=groups.flat().map(p=>p.id);
      const r=await window.motfSupabase.rpc('motf1023_reorder_products',{target_business_id:previewBusinessId,ordered_ids:ordered});
      if(r.error) throw new Error(r.error.message);
      if(previewBusinessId===window.motfCurrentBusiness?.id) {
        const positions=new Map(ordered.map((id,i)=>[id,i]));
        const photoId=mockData.market.rooms[currentSelectedPhotoIndex-1]?.id;
        mockData.market.rooms.sort((a,b)=>(positions.get(a.id)??1e9)-(positions.get(b.id)??1e9));
        rebuildPhotoTabsArray();currentSelectedPhotoIndex=photoId?Math.max(0,mockData.market.rooms.findIndex(p=>p.id===photoId)+1):0;
        window.renderRoomPriceTable();window.renderPhotoTabs();
      }
      dirty=false;dialog.querySelector('[data-preview-status]').textContent='상품 배치를 저장했습니다. 이용자 페이지를 새로 열면 반영됩니다.';
    } catch(e) { dialog.querySelector('[data-preview-status]').textContent=`저장 실패: ${e.message}`; }
    finally { saving=false;this.disabled=!dirty; }
  };
  function close(e) { if(saving || (dirty && !confirm('저장하지 않은 배치를 닫을까요?'))) { e?.preventDefault();return; } ++requestId;dialog.close(); }
  dialog.querySelector('[data-preview-close]').onclick=close;dialog.oncancel=close;
  window.addEventListener('motf:owner-workspace-clear',()=>{editCategory='';stockCategory='';photoCategory='';++requestId;dialog.close();});
})();
