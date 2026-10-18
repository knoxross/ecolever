// 견적 문의가 도착할 메일 주소
const INQUIRY_EMAIL = 'knox@ecolever.co.kr';
const MOQ = 10000;

/* ---- scroll reveal ---- */
(function(){
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const sel = '.feature-card, .lineup-card, .after-card, .doc-card, .compare-col, .channel-tile, .pain-card, .process li, .faq-list details';
  const els = document.querySelectorAll(sel);
  if(!els.length || !('IntersectionObserver' in window)) return;
  els.forEach(el => el.classList.add('reveal-init'));
  const io = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        entry.target.classList.add('in-view');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  els.forEach(function(el){ io.observe(el); });
})();

/* ---- active nav link while scrolling ---- */
(function(){
  if(!('IntersectionObserver' in window)) return;
  const links = Array.from(document.querySelectorAll('.nav-jump a'));
  const map = new Map();
  links.forEach(function(a){
    const target = document.querySelector(a.getAttribute('href'));
    if(target) map.set(target, a);
  });
  const io = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(!entry.isIntersecting) return;
      links.forEach(l => l.classList.remove('active'));
      const link = map.get(entry.target);
      link.classList.add('active');
      // keep the active item visible in the horizontally scrolling mobile nav
      const nav = link.parentElement;
      if(nav.scrollWidth > nav.clientWidth){
        nav.scrollTo({ left: link.offsetLeft - nav.clientWidth / 2 + link.offsetWidth / 2, behavior: 'smooth' });
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  map.forEach(function(_, section){ io.observe(section); });
})();

/* ---- back to top ---- */
(function(){
  const btn = document.getElementById('toTopBtn');
  if(!btn) return;
  window.addEventListener('scroll', function(){
    btn.classList.toggle('show', window.scrollY > 700);
  }, { passive: true });
  btn.addEventListener('click', function(){ window.scrollTo({ top: 0, behavior: 'smooth' }); });
})();

/* ---- document lightbox ---- */
(function(){
  const lb = document.getElementById('docLightbox');
  const lbImg = document.getElementById('docLightboxImg');
  const cap = document.getElementById('docLightboxCaption');
  let lastFocus = null;

  function open(btn){
    const img = btn.querySelector('img');
    lbImg.src = img.src;
    lbImg.alt = img.alt;
    cap.textContent = btn.dataset.caption || img.alt;
    lastFocus = btn;
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    lb.querySelector('.doc-lightbox-close').focus();
  }
  function close(){
    if(lb.hidden) return;
    lb.hidden = true;
    document.body.style.overflow = '';
    if(lastFocus) lastFocus.focus();
  }
  document.querySelectorAll('.doc-thumb').forEach(function(btn){
    btn.addEventListener('click', function(){ open(btn); });
  });
  lb.addEventListener('click', function(e){ if(e.target !== lbImg) close(); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') close(); });
})();

/* ---- YouTube videos ----
   index.html 의 <div class="yt" data-youtube="유튜브 주소"> 에 주소만 넣으면 됩니다.
   썸네일만 먼저 보여주고, 누를 때 영상을 불러와 페이지 로딩을 가볍게 유지합니다. */
function parseYouTubeId(url){
  if(!url) return '';
  url = url.trim();
  if(/^[\w-]{11}$/.test(url)) return url;
  const m = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/);
  return m ? m[1] : '';
}
(function(){
  document.querySelectorAll('.yt').forEach(function(box){
    const id = parseYouTubeId(box.dataset.youtube);
    const title = box.dataset.title || '에코레버 영상';
    if(!id){
      box.innerHTML = '<div class="yt-empty"><div class="yt-play">&#9654;</div><span>영상 준비 중입니다 — 곧 공개됩니다</span></div>';
      return;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'yt-btn';
    btn.setAttribute('aria-label', title + ' 재생');
    btn.innerHTML = '<img src="https://i.ytimg.com/vi/' + id + '/hqdefault.jpg" alt="" loading="lazy">' +
      '<span class="yt-play" aria-hidden="true">&#9654;</span>' +
      '<span class="yt-title"></span>';
    btn.querySelector('.yt-title').textContent = title;
    btn.addEventListener('click', function(){
      const iframe = document.createElement('iframe');
      iframe.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
      iframe.title = title;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      box.replaceChildren(iframe);
    });
    box.replaceChildren(btn);
  });
})();

/* ---- "샘플 먼저 요청하기" → check the sample box ---- */
document.querySelectorAll('[data-sample]').forEach(function(a){
  a.addEventListener('click', function(){
    const cb = document.getElementById('inqSample');
    if(cb) cb.checked = true;
  });
});

/* ---- privacy notice toggle ---- */
(function(){
  const t = document.querySelector('.privacy-toggle');
  const box = document.getElementById('privacyBox');
  if(!t || !box) return;
  t.addEventListener('click', function(e){
    e.preventDefault();
    box.hidden = !box.hidden;
    t.setAttribute('aria-expanded', String(!box.hidden));
    t.textContent = box.hidden ? '내용 보기' : '접기';
  });
})();

/* ---- inquiry form ---- */
(function(){
  const form = document.getElementById('inquiryForm');
  if(!form) return;
  const $ = id => document.getElementById(id);
  const errorEl = $('formError');
  const doneEl = $('inquiryDone');
  const btn = $('inqSubmit');
  const qty = $('inqQty');
  const qtyHint = $('qtyHint');

  qty.addEventListener('input', function(){
    const n = parseInt(qty.value, 10);
    qtyHint.hidden = !(n > 0 && n < MOQ);
  });
  form.querySelectorAll('input, select, textarea').forEach(function(el){
    el.addEventListener('input', function(){ el.classList.remove('invalid'); });
  });

  function showError(msg, field){
    errorEl.textContent = msg;
    errorEl.hidden = false;
    if(field){ field.classList.add('invalid'); field.focus(); }
  }

  form.addEventListener('submit', async function(e){
    e.preventDefault();
    errorEl.hidden = true;
    doneEl.hidden = true;

    const d = {
      company: $('inqCompany').value.trim(),
      name: $('inqName').value.trim(),
      phone: $('inqPhone').value.trim(),
      email: $('inqEmail').value.trim(),
      lineup: $('inqLineup').value,
      qty: qty.value.trim(),
      due: $('inqDue').value,
      print: $('inqPrint').value,
      msg: $('inqMsg').value.trim(),
      sample: $('inqSample').checked
    };

    if(!d.company) return showError('회사·기관명을 입력해 주세요.', $('inqCompany'));
    if(!d.name) return showError('담당자명을 입력해 주세요.', $('inqName'));
    if(!d.phone || d.phone.replace(/\D/g, '').length < 9) return showError('연락 가능한 전화번호를 입력해 주세요.', $('inqPhone'));
    if(d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return showError('이메일 형식을 확인해 주세요.', $('inqEmail'));
    if(!$('inqAgree').checked) return showError('개인정보 수집·이용에 동의해 주셔야 문의를 보낼 수 있습니다.', $('inqAgree'));
    if(form._honey && form._honey.value) return; // bot

    const qtyText = d.qty ? Number(d.qty).toLocaleString('ko-KR') + '개' + (parseInt(d.qty, 10) < MOQ ? ' (MOQ 미만)' : '') : '(미입력)';
    const subjectText = '[에코레버 B2B 문의] ' + d.company + (d.sample ? ' · 샘플요청' : '');
    const fields = {
      '회사·기관명': d.company,
      '담당자명': d.name,
      '연락처': d.phone,
      '이메일': d.email || '(미입력)',
      '희망 라인업': d.lineup,
      '희망 수량': qtyText,
      '희망 납기': d.due || '(미입력)',
      '로고 인쇄': d.print,
      '샘플 요청': d.sample ? '예' : '아니오',
      '문의내용': d.msg || '(내용 없음)'
    };

    const originalBtnText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '보내는 중…';

    function finish(){
      btn.disabled = false;
      btn.textContent = originalBtnText;
    }

    try{
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch('https://formsubmit.co/ajax/' + INQUIRY_EMAIL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(Object.assign({ '_subject': subjectText, '_template': 'table', '_replyto': d.email || undefined }, fields)),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if(!res.ok) throw new Error('formsubmit non-ok response');

      form.reset();
      qtyHint.hidden = true;
      doneEl.textContent = '문의가 정상적으로 접수되었습니다. 담당자 확인 후 빠르게 연락드리겠습니다. (급하신 경우 02-6368-9989로 전화 주세요)';
      doneEl.hidden = false;
      finish();
    } catch(err){
      const body = Object.keys(fields).map(k => k + ': ' + fields[k]).join('\n');
      window.location.href = 'mailto:' + INQUIRY_EMAIL + '?subject=' + encodeURIComponent(subjectText) + '&body=' + encodeURIComponent(body);
      doneEl.textContent = '자동 전송에 실패해 이메일 작성 화면을 열었습니다. 내용을 확인하고 그대로 전송해 주세요. 화면이 열리지 않으면 02-6368-9989로 전화 주시거나 ' + INQUIRY_EMAIL + '으로 직접 보내주세요.';
      doneEl.hidden = false;
      finish();
    }
  });
})();
