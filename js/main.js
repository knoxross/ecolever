(function(){
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const sel = '.feature-card, .lineup-card, .after-card, .doc-card, .compare-col, .channel-tile, .video-slot';
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

window.addEventListener('scroll', function(){
  const btn = document.getElementById('toTopBtn');
  if(!btn) return;
  if(window.scrollY > 700){ btn.classList.add('show'); } else { btn.classList.remove('show'); }
}, { passive: true });

function openDocLightbox(imgEl){
  const lb = document.getElementById('docLightbox');
  const lbImg = document.getElementById('docLightboxImg');
  const cap = document.getElementById('docLightboxCaption');
  lbImg.src = imgEl.src;
  lbImg.alt = imgEl.alt;
  cap.textContent = imgEl.alt;
  lb.classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeDocLightbox(){
  const lb = document.getElementById('docLightbox');
  lb.classList.remove('show');
  document.body.style.overflow = '';
}
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape') closeDocLightbox();
});

async function submitInquiry(){
  const company = document.getElementById('inqCompany').value.trim();
  const name = document.getElementById('inqName').value.trim();
  const phone = document.getElementById('inqPhone').value.trim();
  const email = document.getElementById('inqEmail').value.trim();
  const lineup = document.getElementById('inqLineup').value;
  const qty = document.getElementById('inqQty').value.trim();
  const msg = document.getElementById('inqMsg').value.trim();

  if(!company || !name || !phone){
    alert('회사명, 담당자명, 연락처는 필수입니다.');
    return;
  }

  if(qty && parseInt(qty, 10) < 10000){
    const proceed = confirm('최소주문수량은 10,000개입니다. 입력하신 수량(' + qty + '개)은 이보다 적습니다.\n그래도 문의를 보내시겠습니까?');
    if(!proceed) return;
  }

  const subjectText = '[에코레버 B2B 문의] ' + company;
  const bodyLines = [
    '회사명: ' + company,
    '담당자명: ' + name,
    '연락처: ' + phone,
    '이메일: ' + (email || '(미입력)'),
    '희망 라인업: ' + lineup,
    '희망 수량: ' + (qty || '(미입력)') + '개',
    '',
    '문의내용:',
    (msg || '(내용 없음)')
  ];
  const bodyText = bodyLines.join('\n');

  const btn = document.querySelector('#inquiry button.btn-moss');
  const doneEl = document.getElementById('inquiryDone');
  const originalBtnText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '보내는 중…';

  function openMailtoFallback(reason){
    const subject = encodeURIComponent(subjectText);
    const body = encodeURIComponent(bodyText);
    window.location.href = 'mailto:rnk2588@naver.com?subject=' + subject + '&body=' + body;
    doneEl.textContent = (reason || '자동 전송에 실패해') + ' 이메일 작성 화면을 열었습니다. 내용을 확인하고 그대로 전송해 주세요. 화면이 열리지 않으면 02-6368-9989로 전화 주시거나 rnk2588@naver.com으로 직접 보내주세요.';
    doneEl.classList.add('show');
    btn.disabled = false;
    btn.textContent = originalBtnText;
  }

  try{
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch('https://formsubmit.co/ajax/rnk2588@naver.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        '_subject': subjectText,
        '회사명': company,
        '담당자명': name,
        '연락처': phone,
        '이메일': email || '(미입력)',
        '희망 라인업': lineup,
        '희망 수량': (qty || '(미입력)') + '개',
        '문의내용': msg || '(내용 없음)'
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if(!res.ok) throw new Error('formsubmit non-ok response');

    doneEl.textContent = '문의가 정상적으로 접수되었습니다. 담당자 확인 후 빠르게 연락드리겠습니다. (급하신 경우 02-6368-9989로 전화 주세요)';
    doneEl.classList.add('show');
    btn.disabled = false;
    btn.textContent = originalBtnText;
  } catch(err){
    openMailtoFallback('자동 전송에 실패해');
  }
}
