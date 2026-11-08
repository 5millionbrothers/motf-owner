(() => {
  let version = 0;
  function bind() {
    const tabs = document.querySelector('.admin-content-tabs');
    if (!tabs || tabs.querySelector('[data-admin-content-tab="product-reviews"]')) return;
    tabs.insertAdjacentHTML('beforeend','<button data-admin-content-tab="product-reviews">상품 리뷰</button>');
    tabs.parentElement.insertAdjacentHTML('beforeend','<section data-admin-content-pane="product-reviews" hidden><div class="admin-control-card"><h2>상품 리뷰 관리</h2><p>실제 이용 완료한 상품의 리뷰입니다. 공판장 전체 리뷰와 별도로 관리합니다.</p></div><div id="adminProductReviewList" class="admin-control-list"></div></section>');
  }
  async function load() {
    bind(); const host = document.getElementById('adminProductReviewList');
    if (!host || window.motfCurrentProfile?.role !== 'admin') return;
    const stamp = ++version;
    const {data,error} = await motfSupabase.from('product_reviews').select('id,rating,body,is_hidden,created_at,offerings(name,businesses(business_name))').order('created_at',{ascending:false}).limit(500);
    if (stamp !== version) return;
    host.replaceChildren();
    if (error) { host.textContent = '상품 리뷰를 불러오지 못했습니다. DB 90번 적용과 운영자 권한을 확인해주세요.'; return; }
    if (!data?.length) { host.textContent = '등록된 상품 리뷰가 없습니다.'; return; }
    for (const row of data) {
      const article = document.createElement('article'); article.className = 'admin-control-row';
      const text = document.createElement('div'),title = document.createElement('strong'),body = document.createElement('p'),meta = document.createElement('span');
      title.textContent = `${row.offerings?.businesses?.business_name || '공판장'} · ${row.offerings?.name || '상품'}`;
      body.textContent = row.body;
      meta.textContent = `${Number(row.rating).toFixed(1)}/5.0 · ${new Date(row.created_at).toLocaleString('ko-KR')} · ${row.is_hidden ? '숨김' : '공개'}`;
      text.append(title,body,meta);
      const button = document.createElement('button'); button.className = 'secondary-btn'; button.textContent = row.is_hidden ? '다시 공개' : '숨기기';
      button.addEventListener('click',async () => {
        if (window.motfCurrentProfile?.role !== 'admin') return;
        button.disabled = true;
        const result = await motfSupabase.from('product_reviews').update({is_hidden:!row.is_hidden}).eq('id',row.id);
        if (result.error) { alert(result.error.message); button.disabled = false; } else await load();
      });
      article.append(text,button); host.append(article);
    }
  }
  window.motfAdminProductReviews = {bind,load};
})();
