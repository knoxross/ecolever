/* 영상뚝딱 — 캡컷식 타임라인
 *  - 장면 양 끝 손잡이를 끌어서 자르기(앞/뒤), 겹치기·자막·효과음 블록 끌어서 옮기기·늘이기
 *  - 자석: 재생 위치·다른 장면 끝에 자동으로 맞춰 붙음
 *  - 영상 필름 미리보기, 배경음악 파형, 키프레임·효과 표시, 줄 이름
 *  - Ctrl+휠: 확대/축소
 */
'use strict';

let tlDrag = null;
const SNAP_PX = 8;

/* ---------- 필름 · 파형 만들기 ---------- */
async function buildFilmstrip(m) {
  if (m.strip || m._stripBusy || m.type !== 'video') return;
  m._stripBusy = true;
  try {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.src = m.url;
    await new Promise((r, j) => { v.onloadeddata = r; v.onerror = j; setTimeout(r, 8000); });
    const n = 6, fw = 96, fh = Math.round(96 * m.h / m.w) || 54;
    const c = document.createElement('canvas'); c.width = fw * n; c.height = fh;
    const g = c.getContext('2d');
    for (let i = 0; i < n; i++) {
      await seekExact(v, Math.min(m.duration - 0.05, (i + 0.5) * m.duration / n));
      g.drawImage(v, i * fw, 0, fw, fh);
    }
    v.removeAttribute('src'); v.load();
    m.strip = c.toDataURL('image/jpeg', 0.6);
    m.stripAR = fw * n / fh;
    renderTimelineSoon();
  } catch (e) { /* 필름이 없어도 동작 */ } finally { m._stripBusy = false; }
}
function wavePeaks(m) {
  if (m._peaks) return m._peaks;
  const b = m.buffer, d = b.getChannelData(0), step = Math.max(1, Math.floor(b.sampleRate * 0.05));
  const out = new Float32Array(Math.ceil(d.length / step));
  for (let i = 0; i < out.length; i++) { let mx = 0; for (let j = i * step, e = Math.min(d.length, j + step); j < e; j += 4) mx = Math.max(mx, Math.abs(d[j])); out[i] = mx; }
  m._peaks = out;
  return out;
}
function drawWave(cv, m, offset, len) {
  const peaks = wavePeaks(m), W = cv.width = Math.max(1, Math.min(8000, cv.clientWidth || 1)), H = cv.height = cv.clientHeight || 20;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(240,220,174,0.75)';
  const per = len / W;
  for (let x = 0; x < W; x++) {
    const t = (offset + x * per) % m.duration;
    const p = peaks[Math.floor(t / 0.05)] || 0;
    const h = Math.max(1, p * (H - 2));
    g.fillRect(x, (H - h) / 2, 1, h);
  }
}

/* ---------- 타임라인 그린 뒤 꾸미기 ---------- */
function enhanceTimeline() {
  const lay = layout();
  // 장면: 손잡이 · 필름 · 키프레임 · 효과 표시
  for (const el of $$('#track .clip')) {
    const c = clipById(el.dataset.id); if (!c) continue;
    const m = clipMedia(c);
    if (m && m.type === 'video') {
      if (m.strip) { el.style.backgroundImage = `url('${m.strip}')`; el.style.backgroundSize = `auto 100%`; el.style.backgroundRepeat = 'repeat-x'; }
      else buildFilmstrip(m);
    }
    el.insertAdjacentHTML('beforeend', `<span class="h l" data-h="l" title="끌어서 앞부분 자르기"></span><span class="h r" data-h="r" title="끌어서 뒷부분 자르기"></span>`);
    for (const k of c.kf || []) el.insertAdjacentHTML('beforeend', `<span class="kfd" style="left:${k.t * pps}px" title="키프레임 ${k.t}초">◆</span>`);
    const tags = [];
    if (c.fx) tags.push(EFFECTS.find(f => f.v === c.fx)?.icon || '✨');
    if (c.filter) tags.push('🎨');
    if (c.adj) tags.push('🎚');
    if (clipSpeed(c) !== 1) tags.push(`${clipSpeed(c)}×`);
    if (c.reverse) tags.push('⏪');
    if (tags.length) el.insertAdjacentHTML('beforeend', `<span class="c-fx">${tags.join(' ')}</span>`);
  }
  // 겹치기 · 자막 블록 손잡이
  for (const el of $$('#ovlTrack .sb, #subTrack .sb')) el.insertAdjacentHTML('beforeend', '<span class="h l" data-h="l"></span><span class="h r" data-h="r"></span>');
  // 소리 줄: 배경음악 파형 + 효과음 블록
  const at = $('#audioTrack');
  const bgmEl = at.querySelector('.bgm:not(.voice)'), bgm = mediaById(S.bgmId);
  if (bgmEl && bgm && bgm.buffer) {
    bgmEl.insertAdjacentHTML('afterbegin', '<canvas class="wave"></canvas>');
    requestAnimationFrame(() => { const cv = bgmEl.querySelector('canvas.wave'); if (cv) drawWave(cv, bgm, S.bgmOffset || 0, totalDuration()); });
  }
  for (const sg of sfxSegments()) {
    at.insertAdjacentHTML('beforeend', `<div class="bgm sfx${tlSelSfx === sg.sfx.id ? ' sel' : ''}" data-sfx="${sg.sfx.id}" style="left:${sg.start * pps}px;width:${Math.max(10, (sg.end - sg.start) * pps)}px" title="효과음 — 끌어서 옮기기, Delete 로 삭제">🔊</div>`);
  }
  // 줄 이름
  const lab = $('#tlLabels');
  if (lab) lab.innerHTML = `<div style="height:22px"></div><div class="lb" style="height:100px">🎬<span>영상</span></div><div class="lb" style="height:25px">💬<span>자막</span></div><div class="lb" style="height:25px">🧩<span>겹치기</span></div><div class="lb" style="height:28px">🎵<span>소리</span></div>`;
}
let tlSelSfx = null;

/* ---------- 자석 ---------- */
function snapTime(t, exclude) {
  const pts = [0, tlDrag && tlDrag.playT != null ? tlDrag.playT : state.time, totalDuration()];
  layout().forEach(L => { pts.push(L.start, L.end); });
  state.subs.forEach(x => { if (x !== exclude) pts.push(x.start, x.end); });
  state.overlays.forEach(x => { if (x !== exclude) pts.push(x.start, x.end); });
  let best = t, bd = SNAP_PX / pps;
  for (const p of pts) { const d = Math.abs(p - t); if (d < bd) { bd = d; best = p; } }
  return best;
}

/* ---------- 끌기 ---------- */
function bindTimelinePro() {
  const tl = $('#timeline');
  // 손잡이를 잡았을 때는 순서 바꾸기(끌어 놓기)가 시작되지 않게
  $('#track').addEventListener('dragstart', e => { if (tlDrag || e.target.closest?.('[data-h]')) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  tl.addEventListener('pointerdown', e => {
    const h = e.target.closest('[data-h]');
    const blk = e.target.closest('#ovlTrack .sb, #subTrack .sb, #audioTrack .sfx');
    if (!h && !blk) return;
    const x0 = e.clientX;
    const clipEl = h && h.closest('#track .clip');
    if (clipEl) {
      const c = clipById(clipEl.dataset.id); if (!c) return;
      e.preventDefault(); pause();
      const L = layout().find(l => l.clip === c);
      tlDrag = { kind: 'clip', playT: state.time, side: h.dataset.h, c, x0, d0: c.duration, t0: c.trimStart, start: L.start, kf0: JSON.stringify(c.kf || []) };
    } else {
      const el = blk || h.closest('.sb');
      let obj = null, kind = '';
      if (el.dataset.ovl) { obj = ovById(el.dataset.ovl); kind = 'ovl'; }
      else if (el.dataset.sub) { obj = state.subs.find(x => x.id === el.dataset.sub); kind = 'sub'; }
      else if (el.dataset.sfx) { obj = state.sfx.find(x => x.id === el.dataset.sfx); kind = 'sfx'; tlSelSfx = obj?.id; }
      if (!obj) return;
      e.preventDefault(); pause();
      const len = kind === 'sfx' ? (mediaById(obj.mediaId)?.duration || 1) : obj.end - obj.start;
      tlDrag = { kind, obj, playT: state.time, side: h ? h.dataset.h : 'move', x0, s0: obj.start, e0: kind === 'sfx' ? obj.start + len : obj.end, len, moved: false };
    }
    tl.setPointerCapture(e.pointerId);
  });
  tl.addEventListener('pointermove', e => {
    if (!tlDrag) return;
    const dt = (e.clientX - tlDrag.x0) / pps;
    if (Math.abs(e.clientX - tlDrag.x0) > 2) tlDrag.moved = true;
    const D = tlDrag;
    if (D.kind === 'clip') {
      const c = D.c, m = clipMedia(c), sp = clipSpeed(c);
      if (D.side === 'r') {
        let end = snapTime(D.start + D.d0 + dt);
        const max = m && m.type === 'video' ? (c.reverse ? (D.t0 + D.d0 * sp - 0) : (m.duration - c.trimStart)) / sp : 600;
        c.duration = round2(clamp(end - D.start, 0.3, max));
        if (c.kf && c.kf.length) c.kf = JSON.parse(D.kf0).filter(k => k.t <= c.duration);
        state.time = D.start + c.duration - 0.02;
      } else {
        // 앞 손잡이: 안쪽으로 끌면 앞부분 잘라내기, 바깥으로 끌면 (영상이면) 잘라낸 앞부분 되살리기
        let d = dt;
        if (m && m.type === 'video' && !c.reverse) d = Math.max(d, -D.t0 / sp);
        else if (!m || m.type !== 'video') d = Math.max(d, -(600 - D.d0));
        d = Math.min(d, D.d0 - 0.3);
        c.duration = round2(D.d0 - d);
        if (m && m.type === 'video' && !c.reverse) c.trimStart = round2(D.t0 + d * sp);
        if (c.kf && c.kf.length) c.kf = JSON.parse(D.kf0).map(k => ({ ...k, t: round2(k.t - d) })).filter(k => k.t >= 0);
        state.time = D.start + 0.02;
      }
      c._aseg = null;
      renderTimeline(); requestRender();
      return;
    }
    const o = D.obj, total = Math.max(0.5, totalDuration());
    if (D.side === 'move') {
      let s = snapTime(D.s0 + dt, o);
      const endSnap = snapTime(D.s0 + dt + D.len, o);
      if (Math.abs(endSnap - (D.s0 + dt + D.len)) < Math.abs(s - (D.s0 + dt))) s = endSnap - D.len;
      s = clamp(s, 0, Math.max(0, total - (D.kind === 'sfx' ? 0.1 : D.len)));
      o.start = round2(s);
      if (D.kind !== 'sfx') o.end = round2(s + D.len);
    } else if (D.side === 'l' && D.kind !== 'sfx') {
      o.start = round2(clamp(snapTime(D.s0 + dt, o), 0, o.end - 0.2));
    } else if (D.side === 'r' && D.kind !== 'sfx') {
      o.end = round2(clamp(snapTime(D.e0 + dt, o), o.start + 0.2, total));
    }
    renderTimeline(); requestRender();
  });
  const end = () => {
    if (!tlDrag) return;
    const D = tlDrag; tlDrag = null;
    if (D.moved || D.kind === 'clip') { changed(); refreshAll(); }
    if (D.kind === 'clip' && D.moved) toast(`장면 길이 ${D.c.duration.toFixed(1)}초 (Ctrl+Z 로 되돌리기)`);
  };
  tl.addEventListener('pointerup', end);
  tl.addEventListener('pointercancel', end);
  // 효과음 선택 → Delete 로 삭제
  $('#audioTrack').addEventListener('click', e => {
    const el = e.target.closest('.sfx'); if (!el) return;
    tlSelSfx = el.dataset.sfx; renderTimeline();
    const s = state.sfx.find(x => x.id === tlSelSfx); if (s) seekTo(s.start + 0.01);
  });
  window.addEventListener('keydown', e => {
    if (!tlSelSfx || isTyping()) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const s = state.sfx.find(x => x.id === tlSelSfx);
      if (s) { e.preventDefault(); e.stopImmediatePropagation(); state.sfx = state.sfx.filter(x => x !== s); tlSelSfx = null; changed(); renderTimeline(); toast('효과음을 지웠습니다'); }
    }
  }, true);
  // Ctrl+휠 확대/축소 (마우스 위치 기준)
  tl.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const r = tl.getBoundingClientRect(), mx = e.clientX - r.left + tl.scrollLeft;
    const tAt = (mx - 14) / pps;
    pps = clamp(Math.round(pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15)), 10, 400);
    $('#tlZoom').value = clamp(pps, 20, 200);
    renderTimeline();
    tl.scrollLeft = 14 + tAt * pps - (e.clientX - r.left);
  }, { passive: false });
}
