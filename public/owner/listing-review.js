(function connectListingReviewWorkflow() {
  const $ = (selector) => document.querySelector(selector);
  const client = () => window.motfSupabase;
  const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const money = (value) => `${Number(value || 0).toLocaleString("ko-KR")}원`;
  const processing = new Set();

  function missingItems(business, offerings) {
    const missing = [];
    const market = business?.business_type === 'market';
    const entity = market ? '업장' : '숙소', itemLabel = market ? '상품' : '객실';
    if (!business?.business_name || business.business_name === "숙소명 확인 필요") missing.push(`${entity}명`);
    if (!business?.representative_name || business.representative_name === "확인 필요") missing.push("대표자명");
    if (!business?.phone) missing.push(`${entity} 연락처`);
    if (!business?.address) missing.push("기본 주소");
    if (!business?.region) missing.push("운영 지역");
    if (!business?.description) missing.push(`${entity} 소개`);
    if (!business?.cover_image_url && !(business?.gallery_image_urls || []).length) missing.push(`${entity} 사진`);
    if (market) return missing;
    if (!offerings.length) missing.push(`${itemLabel} 정보`);
    const unnamed = offerings.filter((item) => !String(item.name || "").trim()).length;
    const zeroPrice = offerings.filter((item) => Number((market ? item.price : item.offseason_weekday_price ?? item.price) ?? 0) <= 0).length;
    const noCapacity = offerings.filter((item) => Number(item.base_people || 0) <= 0 || Number(item.max_people || 0) <= 0).length;
    const noPhotos = offerings.filter((item) => !item.image_url && !(item.image_urls || []).length).length;
    if (unnamed) missing.push(`${itemLabel}명 ${unnamed}개`);
    if (zeroPrice) missing.push(market ? `상품 가격 ${zeroPrice}개` : `비수기 평일 요금 ${zeroPrice}개 객실`);
    if (!market && noCapacity) missing.push(`기준·최대 인원 ${noCapacity}개 객실`);
    if (noPhotos) missing.push(`${itemLabel} 사진 ${noPhotos}개`);
    return missing;
  }

  async function latestOwnerRequest(businessId) {
    const { data } = await client().from("business_listing_review_requests")
      .select("id,request_type,status,review_note,created_at,reviewed_at")
      .eq("business_id", businessId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data || null;
  }

  window.motfUpdateListingReviewUi = async function updateListingReviewUi() {
    const business = window.motfCurrentBusiness;
    const notice = $("#motfListingReviewNotice");
    const submit = $("#motfSubmitListingButton");
    const save = $('#panel-mypage button[onclick="saveMypageData()"]');
    if (!business || !window.motfHasBusinessPermission?.("listing") || !notice) return;
    const offerings = window.motfReadOfferingsFromDashboard?.() || [];
    const missing = missingItems(business, offerings);
    const request = await latestOwnerRequest(business.id);
    const pending = request?.status === "pending";
    const isDraft = business.approval_status !== "approved";
    notice.hidden = false;
    notice.className = `listing-review-notice ${pending ? "is-pending" : isDraft ? "is-draft" : "is-approved"}`;
    notice.innerHTML = `<div class="listing-review-notice-head"><div><strong>${pending ? "운영팀 심사 대기 중" : isDraft ? (business.business_type === "market" ? "비공개 장보기 초안" : "비공개 숙소 초안") : (business.business_type === "market" ? "현재 공개 중인 장보기" : "현재 공개 중인 숙소")}</strong><span>${pending ? "신청 내용을 수정하면 기존 대기 요청이 새 내용으로 교체됩니다." : isDraft ? "아래 항목을 점검한 뒤 별도의 등록 신청을 보내주세요." : "변경사항은 운영팀 승인 후 이용자 화면에 반영됩니다."}</span></div><i data-lucide="${pending ? "clock-3" : isDraft ? "clipboard-list" : "badge-check"}"></i></div>${missing.length ? `<div class="listing-review-missing"><b>확인 권장 ${missing.length}개</b>${missing.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : '<div class="listing-review-ready"><i data-lucide="circle-check"></i> 주요 등록 항목이 모두 입력되었습니다.</div>'}${request?.status === "rejected" && request.review_note ? `<p class="listing-review-rejected"><b>최근 반려 사유</b>${escapeHtml(request.review_note)}</p>` : ""}`;
    if (submit) { submit.hidden = !isDraft; submit.disabled = pending; submit.innerHTML = `<i data-lucide="${pending ? "clock-3" : "send"}"></i> ${pending ? "등록 심사 중" : "등록 신청"}`; }
    if (save) save.innerHTML = `<i data-lucide="${business.approval_status === "approved" ? "send" : "save"}"></i> ${business.approval_status === "approved" ? "변경 승인 요청" : "비공개 초안 저장"}`;
    window.lucide?.createIcons();
  };

  window.motfSubmitInitialListing = async function submitInitialListing() {
    const business = window.motfCurrentBusiness;
    if (!business || !window.motfHasBusinessPermission?.("listing") || business.approval_status === "approved") return;
    const [{ data: freshBusiness, error: businessError }, { data: offerings, error: offeringError }] = await Promise.all([
      client().from("businesses").select("*").eq("id", business.id).single(),
      client().from("offerings").select("*").eq("business_id", business.id).is("retired_at",null).order("sort_order"),
    ]);
    if (businessError || offeringError) return alert((businessError || offeringError).message);
    const currentOfferings = window.MotfOwnerReliability.visibleOfferings(offerings || [], business.business_type);
    const missing = missingItems(freshBusiness, currentOfferings);
    if (!confirm(`${missing.length ? `확인 권장 항목이 ${missing.length}개 남아 있습니다. 그래도 ` : ""}운영팀에 신규 등록 심사를 신청할까요?`)) return;
    const button = $("#motfSubmitListingButton");
    if (button) button.disabled = true;
    const { error } = await client().rpc("submit_business_listing_review", {
      target_business_id: business.id, proposed_business: freshBusiness,
      proposed_offerings: currentOfferings, requested_type: "new_listing",
    });
    if (error) { if (button) button.disabled = false; return alert(error.message); }
    alert("등록 신청을 보냈습니다. 운영팀 승인 전까지 이용자 화면에는 노출되지 않습니다.");
    await window.motfUpdateListingReviewUi();
  };

  function requestStatus(status) {
    return ({ pending: "검토 대기", approved: "승인 완료", rejected: "반려", cancelled: "취소" })[status] || status;
  }

  function reviewField(label, value) {
    const shown = Array.isArray(value) ? value.join(", ") : value;
    return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(shown || "미입력")}</dd></div>`;
  }

  const photoUrls = (row, cover, gallery) => [...new Set([row?.[cover], ...(row?.[gallery] || [])].filter(Boolean))];
  const stableValue = value => Array.isArray(value) ? value.map(stableValue)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key,stableValue(value[key])]))
      : value == null ? '' : String(value);
  const displayValue = value => Array.isArray(value) ? value.map(displayValue).filter(Boolean).join('\n')
    : value && typeof value === 'object' ? Object.entries(value).map(([key,item])=>`${key}: ${displayValue(item)}`).join(' · ')
      : String(value ?? '');
  const diffKey = row => String(row.name || '').normalize('NFKC').trim().toLowerCase();
  const businessFields = {
    business_name:'숙소명', representative_name:'대표자', phone:'연락처', business_number:'사업자등록번호',
    business_start_date:'개업일', region:'지역', postal_code:'우편번호', address:'주소', address_detail:'상세 주소',
    description:'숙소 소개', short_description:'짧은 소개', highlight_keys:'특징', facilities:'시설', nearby_tags:'주변 정보',
    shoulder_season_ranges:'준성수기 기간',peak_season_ranges:'성수기 기간',amenity_details:'시설 상세',extra_fees:'추가 요금',
    latitude:'위도',longitude:'경도',
  };
  const roomFields = {
    name:'객실명',description:'객실 소개',price:'기본 금액',offseason_weekday_price:'비수기 평일',offseason_weekend_price:'비수기 주말',
    shoulder_weekday_price:'준성수기 평일',shoulder_weekend_price:'준성수기 주말',peak_weekday_price:'성수기 평일',
    peak_weekend_price:'성수기 주말',base_people:'기준 인원',max_people:'최대 인원',extra_person_fee:'추가 인원 요금',
    is_active:'공개 여부',sort_order:'배치 순서',feature_summary:'특징',amenity_details:'부대시설',detail_sections:'세부 안내',
  };
  function diffRow(label, before, after, photos = false) {
    if (JSON.stringify(stableValue(before)) === JSON.stringify(stableValue(after))) return '';
    const cell = value => photos ? photoDiffCell(value) : escapeHtml(displayValue(value) || '미입력');
    return `<div class="listing-diff-row"><strong>${escapeHtml(label)}</strong><div class="listing-diff-before"><small>기존</small>${cell(before)}</div><div class="listing-diff-after"><small>변경</small>${cell(after)}</div></div>`;
  }
  function photoDiffCell(urls) {
    if (!urls.length) return '사진 없음';
    return `<div class="listing-diff-photos">${urls.map(url => `<img src="${escapeHtml(url)}" alt="심사 사진" loading="lazy">`).join('')}</div>`;
  }
  function roomDiffValue(key, value) {
    if (value == null || value === '') return value;
    if (/price$|_fee$/.test(key)) return money(value);
    if (key === 'is_active') return value ? '공개' : '숨김';
    return value;
  }
  function listingDiff(request, current, currentRooms) {
    if (request.status !== 'pending' || request.request_type === 'new_listing') return '';
    if (!current || !currentRooms) return '<p class="listing-review-note">현재 공개 정보를 불러오지 못해 변경사항을 비교할 수 없습니다.</p>';
    const proposed = request.proposed_business, nextRooms = request.proposed_offerings;
    const fields = Object.entries(businessFields).filter(([key]) => Object.hasOwn(proposed,key))
      .map(([key,label]) => diffRow(label,current[key],proposed[key])).join('')
      + diffRow('숙소 사진',photoUrls(current,'cover_image_url','gallery_image_urls'),photoUrls(proposed,'cover_image_url','gallery_image_urls'),true);
    if (current.business_type === 'market') return `<section class="listing-diff"><h4>변경사항</h4>${fields || '<p>달라진 공개 정보가 없습니다.</p>'}</section>`;
    const matched = new Set();
    const exactIds = new Set(nextRooms.map(room => room.id).filter(Boolean));
    const nextChanges = nextRooms.map(next => {
      const sameName = currentRooms.filter(room => !exactIds.has(room.id) && diffKey(room) === diffKey(next));
      const before = currentRooms.find(room => room.id && room.id === next.id)
        || (sameName.length === 1 && nextRooms.filter(room => diffKey(room) === diffKey(next)).length === 1 ? sameName[0] : null);
      if (!before) return diffRow('객실 추가','없음',next.name);
      matched.add(before);
      const rows = Object.entries(roomFields).map(([key,label]) => diffRow(label,roomDiffValue(key,before[key]),roomDiffValue(key,next[key]))).join('')
        + diffRow('객실 사진',photoUrls(before,'image_url','image_urls'),photoUrls(next,'image_url','image_urls'),true);
      return rows ? `<h5>${escapeHtml(next.name)}</h5>${rows}` : '';
    }).join('');
    const removed = currentRooms.filter(room => !matched.has(room)).map(room => diffRow('객실 삭제',room.name,'없음')).join('');
    return `<section class="listing-diff"><h4>변경사항</h4>${fields || nextChanges || removed ? fields + nextChanges + removed : '<p>달라진 공개 정보가 없습니다.</p>'}</section>`;
  }

  function fullRequestDetail(request, current, currentRooms) {
    const proposed = request.proposed_business || {};
    const rooms = Array.isArray(request.proposed_offerings) ? request.proposed_offerings : [];
    const photos = [...new Set([proposed.cover_image_url, ...(proposed.gallery_image_urls || [])].filter(Boolean))];
    return `${listingDiff(request,current,currentRooms)}<details class="listing-review-full"><summary>신청 내용 전체 보기</summary>
      <section><h4>숙소 기본 정보</h4><dl class="listing-review-fields">${reviewField("숙소명", proposed.business_name)}${reviewField("대표자", proposed.representative_name)}${reviewField("사업자등록번호", proposed.business_registration_number)}${reviewField("연락처", proposed.phone)}${reviewField("주소", [proposed.address, proposed.address_detail].filter(Boolean).join(" "))}${reviewField("지역", proposed.region)}${reviewField("소개", proposed.description)}${reviewField("짧은 소개", proposed.short_description)}${reviewField("시설", proposed.facilities)}${reviewField("특징", proposed.highlight_summary)}${reviewField("추가 요금", (proposed.extra_fees || []).map((fee) => `${fee.label || "항목"} ${money(fee.amount)} ${fee.detail || ""}`))}</dl></section>
      <section><h4>숙소 사진 ${photos.length}장</h4><div class="listing-review-gallery">${photos.map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(url)}" alt="숙소 등록 사진"></a>`).join("") || "등록된 사진 없음"}</div></section>
      <section><h4>객실 ${rooms.length}개</h4><div class="listing-review-rooms">${rooms.map((room, index) => `<article><b>${index + 1}. ${escapeHtml(room.name || "객실명 미입력")}</b><dl>${reviewField("가격", money(room.offseason_weekday_price ?? room.price))}${reviewField("비수기 주말", money(room.offseason_weekend_price))}${reviewField("준성수기 평일/주말", `${money(room.shoulder_weekday_price)} / ${money(room.shoulder_weekend_price)}`)}${reviewField("성수기 평일/주말", `${money(room.peak_weekday_price)} / ${money(room.peak_weekend_price)}`)}${reviewField("기준/최대 인원", `${room.base_people || 0}명 / ${room.max_people || 0}명`)}${reviewField("추가 인원 요금", money(room.extra_person_fee))}${reviewField("특징", room.feature_summary)}${reviewField("설명", room.description)}</dl><div class="listing-review-gallery">${[room.image_url, ...(room.image_urls || [])].filter(Boolean).map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(url)}" alt="객실 사진"></a>`).join("")}</div></article>`).join("") || "객실 정보 없음"}</div></section>
    </details>`;
  }

  window.motfLoadListingReviews = async function loadListingReviews() {
    if (window.motfCurrentProfile?.role !== "admin") return;
    const area = $("#motfListingReviewList");
    if (!area) return;
    area.innerHTML = '<div class="admin-control-empty">심사 요청을 불러오는 중입니다.</div>';
    const filter = $("#motfListingReviewFilter")?.value || "pending";
    let query = client().from("business_listing_review_requests").select("*").order("created_at", { ascending: false });
    if (filter !== "all") query = query.eq("status", filter);
    const { data: requests, error } = await query;
    if (error) { area.innerHTML = `<div class="admin-control-empty">${escapeHtml(error.message)}</div>`; return; }
    const draftResult = ['pending','all'].includes(filter)
      ? await client().from('businesses').select('*').eq('approval_status','pending').order('created_at',{ascending:false})
      : {data:[],error:null};
    const pendingBusinesses = new Set((requests || []).filter(item=>item.status==='pending').map(item=>item.business_id));
    const drafts = (draftResult.data || []).filter(item=>!pendingBusinesses.has(item.id));
    const businessIds = [...new Set([...(requests || []).map((item) => item.business_id),...drafts.map(item=>item.id)])];
    const [{ data: businesses }, { data: currentOfferings, error: currentRoomsError }] = businessIds.length
      ? await Promise.all([
        client().from("businesses").select("*").in("id", businessIds),
        client().from("offerings").select("*").in("business_id", businessIds).is("retired_at",null).order("sort_order"),
      ])
      : [{ data: [] }, { data: [] }];
    const byId = new Map((businesses || []).map((item) => [item.id, item]));
    const offeringsByBusiness = new Map();
    (currentOfferings || []).forEach((item) => offeringsByBusiness.set(item.business_id, [...(offeringsByBusiness.get(item.business_id) || []), item]));
    const hydratedRequests = (requests || []).map((request) => {
      const current = byId.get(request.business_id) || {};
      const proposedBusiness = request.proposed_business && Object.keys(request.proposed_business).length ? request.proposed_business : current;
      const proposedOfferings = Array.isArray(request.proposed_offerings)
        ? request.proposed_offerings
        : (offeringsByBusiness.get(request.business_id) || []);
      return { ...request, proposed_business: proposedBusiness, proposed_offerings: proposedOfferings };
    });
    area.innerHTML = hydratedRequests.map((request) => {
      const business = byId.get(request.business_id);
      const proposed = request.proposed_business || {};
      const offerings = Array.isArray(request.proposed_offerings) ? request.proposed_offerings : [];
      const missing = missingItems(proposed, offerings);
      const pending = request.status === "pending";
      return `<article class="listing-review-card"><div class="listing-review-card-head"><div><span class="listing-review-type">${request.request_type === "new_listing" ? "신규 입점" : "정보 변경"}</span><h3>${escapeHtml(proposed.business_name || business?.business_name || "숙소명 미확인")}</h3><p>${new Date(request.created_at).toLocaleString("ko-KR")} 신청 · 객실 ${offerings.length}개</p></div><span class="listing-review-status is-${request.status}">${requestStatus(request.status)}</span></div><div class="listing-review-summary"><span>주소 <b>${escapeHtml(proposed.address || "미입력")}</b></span><span>대표 연락처 <b>${escapeHtml(proposed.phone || "미입력")}</b></span><span>사진 <b>${(proposed.gallery_image_urls || []).length}장</b></span><span>최저 객실가 <b>${offerings.length ? money(Math.min(...offerings.map((item) => Number(item.price || 0)))) : "객실 없음"}</b></span></div>${missing.length ? `<div class="listing-review-missing"><b>확인 권장 ${missing.length}개</b>${missing.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : '<div class="listing-review-ready">주요 항목 입력 완료</div>'}${request.review_note ? `<p class="listing-review-note">처리 메모: ${escapeHtml(request.review_note)}</p>` : ""}${pending ? `<div class="listing-review-card-actions"><button class="secondary-btn" onclick="motfReviewListing('${request.id}','rejected')"><i data-lucide="x"></i> 반려</button><button class="primary-btn" onclick="motfReviewListing('${request.id}','approved')"><i data-lucide="check"></i> 승인·반영</button></div>` : ""}</article>`;
    }).join("") || '<div class="admin-control-empty">해당 상태의 심사 요청이 없습니다.</div>';
    Array.from(area.querySelectorAll(".listing-review-card")).forEach((card, index) => {
      const request = hydratedRequests[index];
      if (!request) return;
      const actions = card.querySelector(".listing-review-card-actions");
      (actions || card).insertAdjacentHTML(actions ? "beforebegin" : "beforeend", fullRequestDetail(request, byId.get(request.business_id), currentRoomsError ? null : window.MotfOwnerReliability.visibleOfferings(offeringsByBusiness.get(request.business_id) || [], byId.get(request.business_id)?.business_type)));
    });
    if(drafts.length){
      if(!requests?.length)area.replaceChildren();
      area.insertAdjacentHTML('beforeend','<h3 class="listing-review-draft-heading">가입 완료 · 등록 신청 전</h3>');
      drafts.forEach(business=>{
        const rooms=offeringsByBusiness.get(business.id)||[];
        const detail={request_type:'new_listing',proposed_business:business,proposed_offerings:rooms};
        area.insertAdjacentHTML('beforeend',`<article class="listing-review-card" data-listing-draft="${escapeHtml(business.id)}"><div class="listing-review-card-head"><div><span class="listing-review-type">등록 준비</span><h3>${escapeHtml(business.business_name||'업장명 미입력')}</h3><p>${escapeHtml(business.business_type==='market'?'장보기':'숙소')} · ${rooms.length}개 ${business.business_type==='market'?'상품':'객실'}</p></div><span class="listing-review-status">신청 전</span></div><p>사장님 가입은 완료되었습니다. 업장 정보를 저장하고 ‘등록 신청’을 보내면 이 목록에서 승인·반려할 수 있습니다.</p>${fullRequestDetail(detail,business)}</article>`);
      });
    }
    if(draftResult.error)area.insertAdjacentHTML('beforeend',`<p role="status">가입 완료 업장을 불러오지 못했습니다: ${escapeHtml(draftResult.error.message)}</p>`);
    window.lucide?.createIcons();
  };

  window.motfReviewListing = async function reviewListing(requestId, decision) {
    if(processing.has(requestId))return;
    const note = decision === "rejected" ? prompt("사장님에게 보여줄 반려 사유를 입력해주세요.") : null;
    if (decision === "rejected" && !note?.trim()) return;
    if (!confirm(decision === "approved" ? "이 신청 내용을 승인하고 이용자 화면에 반영할까요?" : "이 신청을 반려할까요?")) return;
    processing.add(requestId);
    const buttons=[...document.querySelectorAll('.listing-review-card-actions button')].filter(button=>button.getAttribute('onclick')?.includes(requestId));
    buttons.forEach(button=>button.disabled=true);
    try {
      const { error } = await client().rpc("review_business_listing_request", {
        target_request_id: requestId, decision, note: note?.trim() || null,
      });
      if (error) throw error;
      alert(decision === "approved" ? "승인되어 공개 정보에 반영되었습니다." : "반려 처리했습니다.");
      await Promise.all([window.motfLoadListingReviews(), window.loadMotfAdminDirectory?.()]);
    } catch(error){alert(error.message||'심사 결과를 저장하지 못했습니다.');}
    finally{processing.delete(requestId);buttons.forEach(button=>button.disabled=false);}
  };
})();
