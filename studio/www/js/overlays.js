/* 영상뚝딱 — 겹치기(화면 위에 사진·영상·스티커·글자 올리기) · 글자 템플릿
 * 캡컷의 '오버레이·스티커·텍스트'처럼, 장면과 상관없이 원하는 시간에 화면 위에 겹쳐 올립니다.
 *  - 화면에서 끌어서 위치, 마우스 휠로 크기, Shift+휠로 회전 (패널에서도 조절)
 *  - 글자 템플릿: 기본 · 유튜브 노란 자막 · 예능 · 뉴스 하단바 · 네온 · 말풍선 · 영화 자막 (자막에도 적용)
 */
'use strict';

const TEXT_TPLS = [
  { v: 'basic', label: '기본' },
  { v: 'youtube', label: '유튜브 노란 자막' },
  { v: 'variety', label: '예능 자막 (분홍 테두리)' },
  { v: 'news', label: '뉴스 하단 막대' },
  { v: 'neon', label: '네온 (빛나는 글자)' },
  { v: 'bubble', label: '말풍선' },
  { v: 'cinema', label: '영화 자막 (명조)' },
];
const STICKERS = ['😀', '😂', '😍', '🥰', '😎', '🤩', '😮', '😢', '👍', '👏', '🙌', '🔥', '✨', '💯', '❤️', '💚', '💛', '⭐', '🎉', '🎁', '🛍️', '👜', '🌿', '🍀', '☀️', '🌈', '📢', '📌', '✅', '❗', '❓', '👉', '👈', '👆', '👇', '💰', '🏷️', '🆕', '🔝', '⏰', '📞', '📍', '🚚', '🛒', '💡', '🎵', '📸', '🎬'];
const OV_ANIMS = [{ v: 'none', label: '바로' }, { v: 'fade', label: '부드럽게' }, { v: 'pop', label: '톡 튀어나오기' }, { v: 'slide', label: '옆에서 들어오기' }, { v: 'float', label: '둥둥 떠 있기' }];
let selOverlayId = null;
const ovById = id => state.overlays.find(o => o.id === id);

/* ------------------------------------------------------------------ 만들기 */
function addOverlay(o) {
  const total = Math.max(0.5, totalDuration());
  const start = clamp(o.start ?? state.time, 0, Math.max(0, total - 0.3));
  const ov = Object.assign({ id: uid(), x: 0.5, y: 0.4, w: 0.4, rot: 0, opacity: 1, anim: 'pop', tpl: 'basic', color: '#ffffff' }, o, {
    start: round2(start), end: round2(Math.min(total, o.end ?? start + 3)),
  });
  if (ov.end - ov.start < 0.3) ov.end = round2(Math.min(total, ov.start + 0.3));
  state.overlays.push(ov);
  selOverlayId = ov.id;
  return ov;
}
function disposeOverlay(o) { if (o._video) { o._video.pause(); o._video.removeAttribute('src'); o._video.load(); o._video.remove(); } }
function overlayVideo(o) {
  if (o._video) return o._video;
  const m = mediaById(o.mediaId);
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = m.url;
  v.addEventListener('seeked', () => { if (!state.playing) requestRender(); });
  $('#videoPool').appendChild(v);
  o._video = v;
  return v;
}
const ovSrcTime = (o, t) => { const m = mediaById(o.mediaId); return clamp((o.trim || 0) + (t - o.start), 0, Math.max(0, (m?.duration || 0) - 0.02)); };
/** 미리보기: 겹친 영상 맞추기 */
function syncOverlayVideos(t) {
  for (const o of state.overlays) {
    if (o.type !== 'video' || !mediaById(o.mediaId)) continue;
    const v = overlayVideo(o);
    const on = t >= o.start && t < o.end;
    const want = on ? ovSrcTime(o, t) : (o.trim || 0);
    if (on && state.playing) {
      if (v.paused) { if (Math.abs(v.currentTime - want) > 0.15) v.currentTime = want; v.play().catch(() => {}); }
      else if (!v.seeking && Math.abs(v.currentTime - want) > 0.6) v.currentTime = want;
    } else {
      if (!v.paused) v.pause();
      if (!v.seeking && Math.abs(v.currentTime - want) > 0.04) v.currentTime = want;
    }
  }
}
/** 저장: 겹친 영상을 정확한 위치로 */
function overlayFrameJobs(t) {
  return state.overlays.filter(o => o.type === 'video' && t >= o.start && t < o.end && mediaById(o.mediaId)).map(o => seekExact(overlayVideo(o), ovSrcTime(o, t)));
}

/* ------------------------------------------------------------------ 그리기 */
function ovAnim(o, t) {
  const local = t - o.start, left = o.end - t;
  let a = 1, s = 1, dx = 0, dy = 0;
  const p = clamp(local / 0.35, 0, 1);
  if (o.anim === 'fade') a = Math.min(clamp(local / 0.3, 0, 1), clamp(left / 0.25, 0, 1));
  else if (o.anim === 'pop') { s = p >= 1 ? 1 : Math.max(0.01, easeOutBack(p)); a = Math.min(clamp(p * 3, 0, 1), clamp(left / 0.2, 0, 1)); }
  else if (o.anim === 'slide') { dx = (1 - easeOut(p)) * 0.6; a = clamp(left / 0.2, 0, 1); }
  else if (o.anim === 'float') { dy = Math.sin(local * 2.2) * 0.012; a = Math.min(clamp(local / 0.3, 0, 1), clamp(left / 0.25, 0, 1)); }
  return { a, s, dx, dy };
}
function overlayBox(o) { // 캔버스 좌표의 중심·너비·높이
  const W = canvas.width, H = canvas.height, M = Math.min(W, H);
  if (o.type === 'image' || o.type === 'video') {
    const m = mediaById(o.mediaId);
    const ar = m && m.w ? m.h / m.w : 1;
    const w = o.w * W;
    return { cx: o.x * W, cy: o.y * H, w, h: w * ar };
  }
  if (o.type === 'sticker') { const sz = o.w * M; return { cx: o.x * W, cy: o.y * H, w: sz, h: sz }; }
  const fs = o.w * M * 0.35;
  return { cx: o.x * W, cy: o.y * H, w: Math.min(W * 0.9, Math.max(fs * 2, fs * 0.9 * plain(o.text || '').length)), h: fs * 1.4 * Math.max(1, (o.text || '').split('\n').length) };
}
function drawOverlays(t) {
  const W = canvas.width, H = canvas.height, M = Math.min(W, H);
  for (const o of state.overlays) {
    if (t < o.start || t >= o.end) continue;
    const an = ovAnim(o, t);
    const b = overlayBox(o);
    ctx.save();
    ctx.globalAlpha *= clamp(o.opacity, 0, 1) * an.a;
    ctx.translate(b.cx + an.dx * W, b.cy + an.dy * H);
    ctx.rotate((o.rot || 0) * Math.PI / 180);
    ctx.scale(an.s, an.s);
    if (o.type === 'image' || o.type === 'video') {
      const m = mediaById(o.mediaId);
      const src = o.type === 'video' ? overlayVideo(o) : m?.el;
      if (src && (o.type !== 'video' || src.readyState >= 2)) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = M * 0.02;
        if (o.round) { roundRect(-b.w / 2, -b.h / 2, b.w, b.h, Math.min(b.w, b.h) * 0.08); ctx.clip(); }
        ctx.drawImage(src, -b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      }
    } else if (o.type === 'sticker') {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(b.w * 0.85)}px 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif`;
      ctx.fillText(o.text, 0, 0);
    } else {
      const fs = o.w * M * 0.35;
      ctx.font = `${fontWeight(o.font || "'Black Han Sans'")} ${fs}px ${o.font || "'Black Han Sans'"}, 'Noto Sans KR', sans-serif`;
      const lines = String(o.text || '').split('\n');
      drawTemplateText(lines, 0, -lines.length * fs * 1.32 / 2, fs, o.tpl, o.color || '#ffffff', o.hl || '#ffe14d', o.font || "'Black Han Sans'", true);
    }
    ctx.restore();
    if (!state.busy && o.id === selOverlayId) { // 선택 표시 (저장 영상에는 안 나옴)
      ctx.save();
      ctx.translate(b.cx, b.cy); ctx.rotate((o.rot || 0) * Math.PI / 180);
      ctx.setLineDash([M * 0.012, M * 0.008]); ctx.lineWidth = Math.max(2, M * 0.004); ctx.strokeStyle = '#ffd57a';
      ctx.strokeRect(-b.w / 2 - 4, -b.h / 2 - 4, b.w + 8, b.h + 8);
      ctx.restore();
    }
  }
}

/** 템플릿 글자 그리기. y0 = 첫 줄 윗선, cx = 가운데 x (뉴스는 왼쪽 정렬) */
function drawTemplateText(lines, cx, y0, fs, tpl, color, hl, font, centered = true) {
  const W = canvas.width;
  const lh = fs * 1.32, blockH = lines.length * lh;
  const widths = lines.map(l => ctx.measureText(plain(l)).width), mw = Math.max(0, ...widths);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const runsAt = (line, x, y, fill, strokeFn) => {
    for (const r of richRuns(line)) {
      if (strokeFn) strokeFn(r.text, x, y);
      ctx.fillStyle = r.hl ? hl : fill;
      ctx.fillText(r.text, x, y);
      x += ctx.measureText(r.text).width;
    }
  };
  if (tpl === 'news') {
    const pad = fs * 0.45;
    const left = centered ? cx - mw / 2 - pad * 1.6 : W * 0.04;
    ctx.fillStyle = 'rgba(12,34,78,0.92)';
    ctx.fillRect(left, y0 - pad, mw + pad * 3.2, blockH + pad * 2);
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(left, y0 - pad, fs * 0.22, blockH + pad * 2);
    lines.forEach((l, k) => runsAt(l, left + pad * 1.6, y0 + lh * k + lh / 2, '#ffffff'));
    return;
  }
  if (tpl === 'bubble') {
    const pad = fs * 0.45;
    const x0 = cx - mw / 2 - pad * 1.4, w = mw + pad * 2.8, h = blockH + pad * 1.6;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = fs * 0.3;
    ctx.fillStyle = '#ffffff';
    roundRect(x0, y0 - pad * 0.8, w, h, fs * 0.5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x0 + w * 0.22, y0 - pad * 0.8 + h - 1); ctx.lineTo(x0 + w * 0.16, y0 - pad * 0.8 + h + fs * 0.6); ctx.lineTo(x0 + w * 0.36, y0 - pad * 0.8 + h - 1); ctx.closePath(); ctx.fill();
    ctx.restore();
    lines.forEach((l, k) => runsAt(l, cx - widths[k] / 2, y0 + lh * k + lh / 2, '#151515'));
    return;
  }
  lines.forEach((l, k) => {
    const x = cx - widths[k] / 2, y = y0 + lh * k + lh / 2;
    if (tpl === 'youtube') {
      runsAt(l, x, y, color === '#ffffff' ? '#ffe14d' : color, (tx, xx, yy) => { ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = fs * 0.26; ctx.strokeStyle = '#000'; ctx.strokeText(tx, xx, yy); ctx.restore(); });
    } else if (tpl === 'variety') {
      ctx.save(); ctx.translate(cx, y); ctx.rotate(-0.045); ctx.translate(-cx, -y);
      runsAt(l, x, y, color, (tx, xx, yy) => { ctx.save(); ctx.lineJoin = 'round'; ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = fs * 0.2; ctx.shadowOffsetY = fs * 0.08; ctx.lineWidth = fs * 0.34; ctx.strokeStyle = '#ff3d7f'; ctx.strokeText(tx, xx, yy); ctx.shadowColor = 'transparent'; ctx.lineWidth = fs * 0.14; ctx.strokeStyle = '#ffffff'; ctx.strokeText(tx, xx, yy); ctx.restore(); });
      ctx.restore();
    } else if (tpl === 'neon') {
      runsAt(l, x, y, '#eaffff', (tx, xx, yy) => { ctx.save(); ctx.shadowColor = '#33f6ff'; ctx.shadowBlur = fs * 0.7; ctx.fillStyle = '#33f6ff'; ctx.fillText(tx, xx, yy); ctx.fillText(tx, xx, yy); ctx.restore(); });
    } else if (tpl === 'cinema') {
      runsAt(l, x, y, color, (tx, xx, yy) => { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = fs * 0.25; ctx.shadowOffsetY = fs * 0.05; ctx.fillStyle = color; ctx.fillText(tx, xx, yy); ctx.restore(); });
    } else {
      runsAt(l, x, y, color, (tx, xx, yy) => { ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = fs * 0.15; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(tx, xx, yy); ctx.restore(); });
    }
  });
}

/* ------------------------------------------------------------------ 화면에서 끌기 · 크기 · 회전 */
function bindOverlayStage() {
  const cv = $('#stage');
  const toCanvas = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * canvas.width, y: (e.clientY - r.top) / r.height * canvas.height, r }; };
  const hit = e => {
    const p = toCanvas(e);
    for (let k = state.overlays.length - 1; k >= 0; k--) {
      const o = state.overlays[k];
      if (state.time < o.start || state.time >= o.end) continue;
      const b = overlayBox(o), a = -(o.rot || 0) * Math.PI / 180;
      const dx = p.x - b.cx, dy = p.y - b.cy;
      const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(lx) <= b.w / 2 + 8 && Math.abs(ly) <= b.h / 2 + 8) return o;
    }
    return null;
  };
  let drag = null;
  cv.addEventListener('pointerdown', e => {
    const o = hit(e);
    if (!o) return;
    e.stopImmediatePropagation();
    pause();
    const p = toCanvas(e);
    drag = { o, ox: o.x * canvas.width - p.x, oy: o.y * canvas.height - p.y };
    selOverlayId = o.id;
    cv.setPointerCapture(e.pointerId);
    showTab('ovl'); renderOverlayPanel(); requestRender();
  }, true);
  cv.addEventListener('pointermove', e => {
    if (!drag) { if (hit(e)) cv.style.cursor = 'move'; else if (cv.style.cursor === 'move') cv.style.cursor = ''; return; }
    e.stopImmediatePropagation();
    const p = toCanvas(e);
    drag.o.x = round2(clamp((p.x + drag.ox) / canvas.width, 0, 1));
    drag.o.y = round2(clamp((p.y + drag.oy) / canvas.height, 0, 1));
    requestRender();
  }, true);
  const end = e => { if (!drag) return; e.stopImmediatePropagation(); drag = null; changed(); renderOverlayPanel(); };
  cv.addEventListener('pointerup', end, true);
  cv.addEventListener('pointercancel', end, true);
  cv.addEventListener('wheel', e => {
    const o = hit(e) || (ovById(selOverlayId) && state.time >= ovById(selOverlayId).start && state.time < ovById(selOverlayId).end ? ovById(selOverlayId) : null);
    if (!o) return;
    e.preventDefault();
    if (e.shiftKey) o.rot = Math.round(((o.rot || 0) + Math.sign(e.deltaY) * 5 + 540) % 360 - 180);
    else o.w = round2(clamp(o.w * (e.deltaY < 0 ? 1.06 : 1 / 1.06), 0.04, 1.5));
    changed(400); renderOverlayPanel(); requestRender();
  }, { passive: false });
}
