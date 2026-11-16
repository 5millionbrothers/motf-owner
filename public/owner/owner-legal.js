(function connectOwnerLegal() {
  const dialog=document.createElement('dialog');
  dialog.className='owner-legal-dialog';dialog.setAttribute('aria-labelledby','ownerLegalTitle');
  dialog.innerHTML='<header><h2 id="ownerLegalTitle">약관 확인</h2><button type="button" class="secondary-btn" data-legal-close aria-label="닫기"><i data-lucide="x"></i></button></header><nav aria-label="약관 종류"><button type="button" class="secondary-btn" data-legal-kind="terms">이용약관</button><button type="button" class="secondary-btn" data-legal-kind="privacy">개인정보 처리방침</button></nav><div class="owner-legal-body" tabindex="0"></div><footer><a target="_blank" rel="noopener noreferrer" data-legal-source>원문 새 창으로 보기</a><button class="primary-btn" type="button" data-legal-close>확인하고 돌아가기</button></footer>';
  document.body.append(dialog);
  let version=0,opener=null;
  const cache=new Map();
  window.motfOpenOwnerLegal=async function(kind='terms') {
    if(!['terms','privacy'].includes(kind))return;
    const current=++version,body=dialog.querySelector('.owner-legal-body');
    if(!dialog.open){opener=document.activeElement;dialog.showModal();}
    dialog.querySelector('#ownerLegalTitle').textContent=kind==='terms'?'이용약관':'개인정보 처리방침';
    dialog.querySelectorAll('[data-legal-kind]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.legalKind===kind)));
    dialog.querySelector('[data-legal-source]').href=`https://motf.co.kr/${kind}`;
    body.textContent='문서를 불러오는 중입니다.';body.scrollTop=0;body.setAttribute('aria-busy','true');
    window.lucide?.createIcons();
    try {
      let data=cache.get(kind);
      if(!data){const response=await fetch(`/api/legal-document?kind=${kind}`,{signal:AbortSignal.timeout(12000)});data=await response.json();if(!response.ok||!data.ok)throw Error(data.message||'문서를 불러오지 못했습니다.');cache.set(kind,data);}
      if(current!==version||!dialog.open)return;
      body.innerHTML=data.html;
    }catch(error){if(current===version&&dialog.open){body.replaceChildren();const text=document.createElement('p');text.textContent=error.name==='TimeoutError'?'연결이 지연되고 있습니다. 다시 시도해주세요.':error.message;const retry=document.createElement('button');retry.className='secondary-btn';retry.textContent='다시 불러오기';retry.onclick=()=>window.motfOpenOwnerLegal(kind);body.append(text,retry);}}
    finally{if(current===version)body.removeAttribute('aria-busy');}
  };
  dialog.addEventListener('click',event=>{const button=event.target.closest('button');if(button?.hasAttribute('data-legal-close'))dialog.close();if(button?.dataset.legalKind)void window.motfOpenOwnerLegal(button.dataset.legalKind);});
  dialog.addEventListener('close',()=>{version++;opener?.focus();});
})();
