/* 에코레버 방문 집계: 페이지가 열릴 때 한 번 /api/pv.php 에 알립니다.
   IP·브라우저 정보는 서버에 저장하지 않고, 하루 단위 익명 값으로만 방문자 수를 셉니다.
   내부 점검: 주소에 ?qa=1 을 붙여 한 번 열면 그 브라우저는 이후 집계에서 빠집니다(?qa=0 으로 해제).
   버튼 누름(11/29): 가격 계산 · 가격표 PDF · 전화 · 메일 버튼을 누르면 이름만 보냅니다(같은 날 같은 버튼은 1번만 셈). */
(function(){
  try{
    var q = new URLSearchParams(location.search);
    try{
      if(q.get('qa') === '1') localStorage.setItem('eco-qa', '1');
      if(q.get('qa') === '0') localStorage.removeItem('eco-qa');
      if(localStorage.getItem('eco-qa') === '1') return;
    }catch(e){}
    var send = function(b){
      if(navigator.sendBeacon) navigator.sendBeacon('/api/pv.php', b);
      else fetch('/api/pv.php', { method: 'POST', body: b, keepalive: true }).catch(function(){});
    };
    var r = '';
    try{ r = document.referrer ? new URL(document.referrer).hostname : ''; }catch(e){}
    var nv = '0';
    try{ if(!localStorage.getItem('eco-v')){ localStorage.setItem('eco-v', '1'); nv = '1'; } }catch(e){}
    var u = [q.get('utm_source'), q.get('utm_medium'), q.get('utm_campaign')].filter(Boolean).join('/').slice(0, 80);
    send(new URLSearchParams({ p: location.pathname, r: r, n: nv, u: u }));

    var done = {};
    var ev = function(name){ if(done[name]) return; done[name] = 1; send(new URLSearchParams({ p: location.pathname, e: name })); };
    document.addEventListener('click', function(e){
      var t = e.target; if(!t || !t.closest) return;
      var a = t.closest('a');
      if(a){
        var h = a.getAttribute('href') || '';
        if(h.indexOf('tel:') === 0) return ev('tel');
        if(h.indexOf('mailto:') === 0) return ev('mail');
        if(/\.pdf(\?|#|$)/i.test(h)) return ev('pdf');
      }
      if(t.closest('#calcGo, .calc-seg button, .calc-quick button')) ev('calc');
    }, true);
    document.addEventListener('input', function(e){ if(e.target && e.target.id === 'calcQty') ev('calc'); }, true);
  }catch(e){}
})();
