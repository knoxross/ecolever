/* 에코레버 방문 집계: 페이지가 열릴 때 한 번 /api/pv.php 에 알립니다.
   IP·브라우저 정보는 서버에 저장하지 않고, 하루 단위 익명 값으로만 방문자 수를 셉니다.
   내부 점검: 주소에 ?qa=1 을 붙여 한 번 열면 그 브라우저는 이후 집계에서 빠집니다(?qa=0 으로 해제). */
(function(){
  try{
    var q = new URLSearchParams(location.search);
    try{
      if(q.get('qa') === '1') localStorage.setItem('eco-qa', '1');
      if(q.get('qa') === '0') localStorage.removeItem('eco-qa');
      if(localStorage.getItem('eco-qa') === '1') return;
    }catch(e){}
    var r = '';
    try{ r = document.referrer ? new URL(document.referrer).hostname : ''; }catch(e){}
    var nv = '0';
    try{ if(!localStorage.getItem('eco-v')){ localStorage.setItem('eco-v', '1'); nv = '1'; } }catch(e){}
    var u = [q.get('utm_source'), q.get('utm_medium'), q.get('utm_campaign')].filter(Boolean).join('/').slice(0, 80);
    var b = new URLSearchParams({ p: location.pathname, r: r, n: nv, u: u });
    if(navigator.sendBeacon) navigator.sendBeacon('/api/pv.php', b);
    else fetch('/api/pv.php', { method: 'POST', body: b, keepalive: true }).catch(function(){});
  }catch(e){}
})();
