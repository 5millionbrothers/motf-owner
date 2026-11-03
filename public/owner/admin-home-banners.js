(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const origin = "https://motf.co.kr";
  const paths = { myMt:"/my-mt",stays:"/stays",market:"/market",events:"/events",recreation:"/community/recreation" };
  let cards=[],events=[],services,bound=false;
  const fields = () => $("#adminHomeBannerForm")?.elements;
  const localDate = value => { if(!value)return "";const date=new Date(value);date.setMinutes(date.getMinutes()-date.getTimezoneOffset());return date.toISOString().slice(0,16); };
  const requireAdmin = () => { if(window.motfCurrentProfile?.role!=="admin")throw new Error("운영자 권한이 필요합니다."); };
  const httpUrl = value => { const url=new URL(value);if(!["http:","https:"].includes(url.protocol))throw new Error("http 또는 https 주소를 입력해주세요.");return url.href; };

  function html() {
    return `<section data-admin-content-pane="banners" hidden><div class="admin-banner-fixed"><strong>첫 배너 · 내 MT 만들기</strong><span>기본 배너 다음에 아래 배너와 공개 MOriginal이 표시됩니다.</span></div><form id="adminHomeBannerForm" class="admin-control-card"><input name="recordId" type="hidden"><h2>메인 배너 등록·수정</h2><div class="admin-form-grid"><label>제목<input name="title" required maxlength="80"></label><label>보조 문구<input name="subtitle" maxlength="160"></label><label>가로형 이미지<input name="imageFile" type="file" accept="image/*"></label><label>이미지 URL<input name="imageUrl" type="url" placeholder="https://..."></label><label>이동 대상<select name="target"><option value="myMt">내 MT</option><option value="events">MOriginal 목록</option><option value="event">MOriginal 상세</option><option value="stays">숙소</option><option value="market">장보기</option><option value="recreation">레크레이션</option><option value="external">외부 링크</option></select></label><label data-banner-event-field hidden>연결할 MOriginal<select name="eventId"></select></label><label data-banner-url-field hidden>연결 URL<input name="linkUrl" type="url" placeholder="https://..."></label><label>버튼 문구<input name="linkLabel" maxlength="30" value="자세히 보기"></label><label>노출 순서<input name="sortOrder" type="number" min="0" max="99" value="1" required></label><label>게시 시작<input name="startsAt" type="datetime-local"></label><label>게시 종료<input name="endsAt" type="datetime-local"></label><label class="admin-inline-check"><input name="isActive" type="checkbox" checked>노출</label></div><div class="admin-home-banner-preview" id="adminHomeBannerPreview" hidden></div><div class="motf-admin-action-group"><button class="primary-btn" type="submit">배너 저장</button><button class="secondary-btn" type="button" data-banner-reset>새로 작성</button></div></form><div id="adminHomeBannerList" class="admin-control-list"></div></section>`;
  }

  function targetFields() {
    const f=fields();if(!f)return;
    $("[data-banner-event-field]").hidden=f.target.value!=="event";
    $("[data-banner-url-field]").hidden=f.target.value!=="external";
    f.eventId.required=f.target.value==="event";f.linkUrl.required=f.target.value==="external";
  }

  function reset() { const form=$("#adminHomeBannerForm");form.reset();fields().recordId.value="";$("#adminHomeBannerPreview").hidden=true;targetFields(); }

  function apply(nextCards,nextEvents) {
    cards=nextCards.filter(item=>item.placement==="promotion");events=nextEvents;
    const f=fields();if(!f)return;
    const selected=f.eventId.value;
    f.eventId.innerHTML='<option value="">선택해주세요</option>'+events.map(item=>`<option value="${esc(item.id)}">${esc(item.title)}${["draft","cancelled"].includes(item.status)?" · 비공개":""}</option>`).join("");
    f.eventId.value=selected;
    $("#adminHomeBannerList").innerHTML=cards.map(item=>`<article class="admin-control-row admin-home-banner-row"><img src="${esc(item.image_url)}" alt=""><div><strong>${esc(item.title)}</strong><span>순서 ${Number(item.sort_order)} · ${item.is_active?"노출":"숨김"}</span><small>${item.starts_at?new Date(item.starts_at).toLocaleString("ko-KR"):"시작 제한 없음"} ~ ${item.ends_at?new Date(item.ends_at).toLocaleString("ko-KR"):"종료 제한 없음"}</small></div><div class="motf-admin-action-group"><button type="button" class="secondary-btn" data-home-banner-edit="${esc(item.id)}">수정</button><button type="button" class="secondary-btn" data-home-banner-toggle="${esc(item.id)}">${item.is_active?"숨기기":"노출"}</button><button type="button" class="motf-reject-action-btn" data-home-banner-delete="${esc(item.id)}">삭제</button></div></article>`).join("")||'<div class="admin-control-empty">등록된 배너가 없습니다.</div>';
  }

  function edit(id) {
    const item=cards.find(row=>row.id===id),f=fields();if(!item||!f)return;
    f.recordId.value=id;f.title.value=item.title;f.subtitle.value=item.subtitle||"";f.imageUrl.value=item.image_url;f.imageFile.value="";f.linkLabel.value=item.link_label||"자세히 보기";f.sortOrder.value=item.sort_order;f.startsAt.value=localDate(item.starts_at);f.endsAt.value=localDate(item.ends_at);f.isActive.checked=item.is_active;
    try {
      const url=new URL(item.link_url||"/events",origin),eventId=url.searchParams.get("event");
      const internal=url.origin===origin||url.origin===location.origin;
      f.target.value=internal&&url.pathname==="/events/detail"&&eventId?"event":internal?Object.keys(paths).find(key=>paths[key]===url.pathname)||"external":"external";
      f.eventId.value=eventId||"";f.linkUrl.value=url.href;
    }catch{f.target.value="external";f.linkUrl.value="";}
    targetFields();
    const preview=$("#adminHomeBannerPreview");preview.hidden=false;preview.innerHTML=`<img src="${esc(item.image_url)}" alt="현재 배너 이미지"><div><strong>${esc(item.title)}</strong><span>${esc(item.subtitle||"")}</span></div>`;
    $("#adminHomeBannerForm").scrollIntoView({behavior:"smooth",block:"start"});
  }

  async function save(event) {
    event.preventDefault();const form=event.currentTarget,f=form.elements,button=form.querySelector('[type="submit"]');button.disabled=true;
    try {
      requireAdmin();
      const current=cards.find(item=>item.id===f.recordId.value),uploaded=await services.upload(f.imageFile.files[0],"home-banners");
      const image=httpUrl(uploaded||f.imageUrl.value.trim()||current?.image_url||"");
      const target=f.target.value;
      let link;
      if(target==="external")link=httpUrl(f.linkUrl.value.trim());
      else if(target==="event"){if(!events.some(item=>item.id===f.eventId.value))throw new Error("연결할 MOriginal을 선택해주세요.");link=`${origin}/events/detail?event=${encodeURIComponent(f.eventId.value)}`;}
      else link=origin+paths[target];
      const starts=f.startsAt.value?new Date(f.startsAt.value).toISOString():null,ends=f.endsAt.value?new Date(f.endsAt.value).toISOString():null;
      if(starts&&ends&&ends<=starts)throw new Error("게시 종료는 시작보다 뒤여야 합니다.");
      const payload={title:f.title.value.trim(),subtitle:f.subtitle.value.trim()||null,image_url:image,link_url:link,link_label:f.linkLabel.value.trim()||"자세히 보기",placement:"promotion",home_slot:null,sort_order:Number(f.sortOrder.value),starts_at:starts,ends_at:ends,is_active:f.isActive.checked,created_by:current?.created_by||window.motfCurrentProfile.id};
      const client=window.motfSupabase,query=current?client.from("homepage_cards").update(payload).eq("id",current.id):client.from("homepage_cards").insert(payload);
      const {error}=await query;if(error)throw error;
      reset();await services.reload();alert("배너를 저장했습니다.");
    }catch(error){alert(error.message||"배너를 저장하지 못했습니다.");}finally{button.disabled=false;}
  }

  function bind(options) {
    services=options;if(bound)return;bound=true;
    $("#adminHomeBannerForm")?.addEventListener("submit",save);
    fields()?.target.addEventListener("change",targetFields);
    document.addEventListener("click",async event=>{
      if(event.target.closest("[data-banner-reset]"))return reset();
      const editButton=event.target.closest("[data-home-banner-edit]");if(editButton)return edit(editButton.dataset.homeBannerEdit);
      const toggle=event.target.closest("[data-home-banner-toggle]"),remove=event.target.closest("[data-home-banner-delete]");
      if(!toggle&&!remove)return;
      const button=toggle||remove,id=toggle?.dataset.homeBannerToggle||remove?.dataset.homeBannerDelete,item=cards.find(row=>row.id===id);if(!item)return;
      if(remove&&!confirm("이 배너를 삭제하시겠습니까?"))return;
      button.disabled=true;
      try{requireAdmin();const client=window.motfSupabase,query=remove?client.from("homepage_cards").delete().eq("id",id):client.from("homepage_cards").update({is_active:!item.is_active}).eq("id",id);const{error}=await query;if(error)throw error;await services.reload();}catch(error){alert(error.message);}finally{button.disabled=false;}
    });
  }
  window.motfAdminBanners={html,bind,apply};
})();
