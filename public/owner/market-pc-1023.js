(function marketPc1023() {
  const desktop=()=>matchMedia('(min-width:1024px)').matches;
  const market=()=>window.motfCurrentBusiness?.business_type==='market' && desktop();
  const categories=window.motfMarketCategories;
  const category=v=>v || '기타';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let stockCategory='전체',products=[],groups=[],previewCategory='전체',dirty=false,requestId=0;
  const visibleCategories=items=>[...new Set(items.map(item=>category(item.category)))];
  const selectors=(items,value,attribute)=>`<div class="pc1023-category-choices">${items.map(c=>`<button type="button" class="secondary-btn" ${attribute}="${esc(c)}" aria-pressed="${value===c}">${esc(c)}</button>`).join('')}</div>`;
  window.motfPcMarketInventoryMounted=function(box,items) {
    if(!market()) return;
    const sections=[...box.querySelectorAll('.motf-market-stock-category')];
    const available=['전체',...visibleCategories(items)];
    if(!available.includes(stockCategory)) stockCategory='전체';
    box.insertAdjacentHTML('afterbegin',`<div class="pc1023-stock-picker"><strong>카테고리 선택</strong>${selectors(available,stockCategory,'data-stock-category')}<p>카테고리를 선택한 뒤 재고·품절 상태를 관리하세요.</p>${window.motfHasBusinessPermission?.('listing')?'<button type="button" class="primary-btn" data-open-product-preview>이용자 페이지 미리보기 · 상품 배치</button>':''}</div>`);
    function filter() { sections.forEach(s=>s.classList.toggle('pc1023-product-hidden',stockCategory!=='전체' && s.querySelector('strong').textContent!==stockCategory));box.dispatchEvent(new Event('motf:stock-filter-change')); }
    filter();
    box.querySelectorAll('[data-stock-category]').forEach(b=>b.onclick=()=>{stockCategory=b.dataset.stockCategory;box.querySelectorAll('[data-stock-category]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));filter();});
    box.querySelector('[data-open-product-preview]')?.addEventListener('click',openPreview);
  };
  const dialog=document.createElement('dialog');dialog.className='pc1023-product-preview';
  dialog.innerHTML='<header><div><h2>이용자 상품 목록 미리보기</h2><p>카테고리를 선택하고 상품을 끌어서 놓으세요. 저장 후 이용자 목록에 반영됩니다.</p></div><button type="button" class="secondary-btn" data-preview-close>닫기</button></header><div data-preview-content></div><p role="status" data-preview-status></p><div class="pc1023-actions"><button type="button" class="primary-btn" data-save-product-order>배치 저장</button></div>';
  document.body.append(dialog);
  let previewBusinessId='',saving=false;
  let dragged=null,dragY=null,scrollFrame=0,lastScrollTime=0;
  function stopDragScroll() { cancelAnimationFrame(scrollFrame);scrollFrame=0;lastScrollTime=0;dragged=null;dragY=null; }
  function scrollDuringDrag(time) {
    if(dragged===null || !dialog.open) { stopDragScroll();return; }
    const box=dialog.getBoundingClientRect(),edge=85;
    const upper=(box.top+edge-dragY)/edge,lower=(dragY-box.bottom+edge)/edge;
    const speed=upper>0?-Math.min(1,upper):lower>0?Math.min(1,lower):0;
    const delta=lastScrollTime?Math.min(32,time-lastScrollTime):16;
    dialog.scrollTop+=speed*32*delta/16;
    lastScrollTime=time;scrollFrame=requestAnimationFrame(scrollDuringDrag);
  }
  dialog.addEventListener('dragover',event=>{if(dragged===null)return;event.preventDefault();dragY=event.clientY;if(!scrollFrame)scrollFrame=requestAnimationFrame(scrollDuringDrag);});
  dialog.addEventListener('drop',stopDragScroll);
  document.addEventListener('dragend',stopDragScroll);
  document.addEventListener('drop',()=>{if(dragged!==null)stopDragScroll();});
  dialog.addEventListener('close',stopDragScroll);
  const normalize=v=>String(v||'').trim().toLocaleLowerCase('ko-KR').replace(/\s+/g,' ');
  const groupKey=p=>p.detail_sections?.productGroupKey?`configured:${normalize(p.detail_sections.productGroupKey)}`:`catalog:${normalize(p.name)}:${normalize(p.detail_sections?.manufacturer)}`;
  async function openPreview() {
    if(!market() || !window.motfHasBusinessPermission?.('listing')) return;
    const request=++requestId;previewBusinessId=window.motfCurrentBusiness.id;dirty=false;
    if(!dialog.open) dialog.showModal();
    dialog.querySelector('[data-preview-content]').textContent='상품을 불러오는 중입니다.';
    dialog.querySelector('[data-preview-status]').textContent='';
    dialog.querySelector('[data-save-product-order]').disabled=true;
    const r=await window.motfSupabase.from('offerings').select('id,name,category,price,image_url,is_active,sort_order,detail_sections').eq('business_id',previewBusinessId).is('retired_at',null).order('sort_order').order('id');
    if(request!==requestId || previewBusinessId!==window.motfCurrentBusiness?.id) return;
    if(r.error) { dialog.querySelector('[data-preview-content]').textContent=r.error.message;return; }
    products=r.data || [];const grouped=new Map();
    products.forEach(p=>{const key=`${category(p.category)}:${groupKey(p)}`;if(!grouped.has(key)) grouped.set(key,[]);grouped.get(key).push(p);});
    groups=[...grouped.values()];previewCategory='전체';renderPreview();
  }
  function renderPreview() {
    const content=dialog.querySelector('[data-preview-content]');
    content.innerHTML=selectors(['전체',...new Set(groups.filter(g=>g.some(p=>p.is_active)).map(g=>category(g[0].category)))],previewCategory,'data-preview-category')+`<div class="pc1023-preview-grid">${groups.map((items,index)=>{
      const active=items.filter(p=>p.is_active);if(!active.length) return '';
      const p=active.find(p=>p.detail_sections?.isDefaultVariant===true)||active[0];if(previewCategory!=='전체' && category(p.category)!==previewCategory) return '';
      return `<article class="pc1023-preview-product" draggable="true" data-product-position="${index}">${p.image_url?`<img src="${esc(p.image_url)}" alt="">`:'<div class="pc1023-preview-noimage">사진 없음</div>'}<strong>${esc(p.name)}</strong><span>${Number(Math.min(...active.map(i=>Number(i.price)||0))).toLocaleString()}원${active.length>1?'부터':''}</span><small>${active.length>1?`${active.length}개 옵션 · `:''}${items.some(i=>i.is_active)?'판매 중':'품절·숨김'}</small><div class="pc1023-actions"><button type="button" class="secondary-btn" data-product-move="-1" aria-label="${esc(p.name)} 앞으로">←</button><button type="button" class="secondary-btn" data-product-move="1" aria-label="${esc(p.name)} 뒤로">→</button></div></article>`;
    }).join('')}</div>${previewCategory?'':'<p>배치할 카테고리를 선택해주세요.</p>'}`;
    content.querySelectorAll('[data-preview-category]').forEach(b=>b.onclick=()=>{previewCategory=b.dataset.previewCategory;renderPreview();});
    content.querySelectorAll('[data-product-position]').forEach(card=>{
      card.ondragstart=e=>{dragged=Number(card.dataset.productPosition);dragY=e.clientY;e.dataTransfer.setData('text/plain',String(dragged));e.dataTransfer.effectAllowed='move';};
      card.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='move';};
      card.ondrop=e=>{e.preventDefault();if(dragged!=null) move(dragged,Number(card.dataset.productPosition));};
      card.querySelectorAll('[data-product-move]').forEach(b=>b.onclick=()=>{const indices=groups.map((g,i)=>g.some(p=>p.is_active) && (previewCategory==='전체' || category(g[0].category)===previewCategory)?i:-1).filter(i=>i>=0);const at=indices.indexOf(Number(card.dataset.productPosition));const to=indices[at+Number(b.dataset.productMove)];if(to!=null) move(Number(card.dataset.productPosition),to);});
    });
    dialog.querySelector('[data-save-product-order]').disabled=!dirty || saving;
  }
  function move(from,to) {
    if(saving || from===to || (previewCategory!=='전체' && category(groups[from]?.[0]?.category)!==category(groups[to]?.[0]?.category))) return;
    const moved=groups.splice(from,1)[0];groups.splice(to,0,moved);dirty=true;
    dialog.querySelector('[data-preview-status]').textContent='저장하지 않은 배치가 있습니다.';renderPreview();
  }
  dialog.querySelector('[data-save-product-order]').onclick=async function() {
    if(saving || !dirty || previewBusinessId!==window.motfCurrentBusiness?.id) return;
    saving=true;this.disabled=true;
    try {
      const ordered=groups.flat().map(p=>p.id);
      const r=await window.motfSupabase.rpc('reorder_business_products',{target_business_id:previewBusinessId,ordered_ids:ordered});
      if(r.error) throw new Error(r.error.message);
      if(previewBusinessId===window.motfCurrentBusiness?.id) {
        const positions=new Map(ordered.map((id,i)=>[id,i]));
        const photoId=mockData.market.rooms[currentSelectedPhotoIndex-1]?.id;
        mockData.market.rooms.sort((a,b)=>(positions.get(a.id)??1e9)-(positions.get(b.id)??1e9));
        rebuildPhotoTabsArray();currentSelectedPhotoIndex=photoId?Math.max(0,mockData.market.rooms.findIndex(p=>p.id===photoId)+1):0;
        window.renderRoomPriceTable();window.renderPhotoTabs();
      }
      window.motfRefreshPartnerOperations?.(true);
      dirty=false;dialog.querySelector('[data-preview-status]').textContent='상품 배치를 저장했습니다. 이용자 페이지를 새로 열면 반영됩니다.';
    } catch(e) { dialog.querySelector('[data-preview-status]').textContent=`저장 실패: ${e.message}`; }
    finally { saving=false;this.disabled=!dirty; }
  };
  function close(e) { if(saving || (dirty && !confirm('저장하지 않은 배치를 닫을까요?'))) { e?.preventDefault();return; } ++requestId;dialog.close(); }
  dialog.querySelector('[data-preview-close]').onclick=close;dialog.oncancel=close;
  window.addEventListener('motf:owner-workspace-clear',()=>{stockCategory='전체';++requestId;dialog.close();});
})();
