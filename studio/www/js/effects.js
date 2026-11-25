/* 영상뚝딱 — 캡컷식 효과 · 조정 · 필터 세기 · 변형 · 키프레임
 * 장면마다:
 *  - 효과 1개 + 세기 (흔들림·글리치·VHS·빛 번짐·번쩍·줌 펀치·흐림 인·반짝이·필름 노이즈·영화 화면)
 *  - 조정: 밝기·대비·채도·색온도·비네팅·선명도
 *  - 필터(장면별) + 세기
 *  - 변형: 크기·위치·회전·좌우/상하 반전·불투명도, 키프레임으로 움직임
 */
'use strict';

const EFFECTS = [
  { v: '', label: '없음', icon: '⭘' },
  { v: 'shake', label: '흔들림', icon: '〰' },
  { v: 'glitch', label: '글리치', icon: '▦' },
  { v: 'vhs', label: 'VHS 비디오', icon: '📼' },
  { v: 'leak', label: '빛 번짐', icon: '🌅' },
  { v: 'flash', label: '번쩍', icon: '⚡' },
  { v: 'punch', label: '줌 펀치', icon: '💥' },
  { v: 'blurin', label: '흐림에서 선명하게', icon: '🌫' },
  { v: 'sparkle', label: '반짝이', icon: '✨' },
  { v: 'grain', label: '필름 노이즈', icon: '🎞' },
  { v: 'cinema', label: '영화 화면 (위아래 띠)', icon: '🎬' },
];
const ADJUST_KEYS = [
  { k: 'bright', label: '밝기', min: -1, max: 1 },
  { k: 'contrast', label: '대비', min: -1, max: 1 },
  { k: 'sat', label: '채도', min: -1, max: 1 },
  { k: 'temp', label: '색온도 (− 시원 / + 따뜻)', min: -1, max: 1 },
  { k: 'vignette', label: '비네팅 (가장자리 어둡게)', min: 0, max: 1 },
  { k: 'sharpen', label: '선명도', min: 0, max: 1 },
];
const TF_KEYS = ['s', 'x', 'y', 'r', 'o']; // 크기·가로·세로·회전·불투명도

/* ------------------------------------------------------------------ 필터 세기 */
function scaleFilterCss(css, k) {
  if (!css || css === 'none' || k >= 0.999) return css || 'none';
  if (k <= 0.001) return 'none';
  return css.replace(/([a-z-]+)\(([-\d.]+)(deg)?\)/g, (all, fn, v, unit) => {
    const id = ['brightness', 'contrast', 'saturate'].includes(fn) ? 1 : 0;
    const nv = id + (parseFloat(v) - id) * k;
    return `${fn}(${+nv.toFixed(3)}${unit || ''})`;
  });
}
/** 장면에 쓸 색(필터+조정) CSS */
function clipColorCss(c) {
  const name = c.filter || S.filter;
  let css = scaleFilterCss(filterCss(name), c.filter ? (c.filterAmt ?? 1) : 1);
  const a = c.adj || {};
  const parts = [];
  if (a.bright) parts.push(`brightness(${(1 + a.bright * 0.5).toFixed(3)})`);
  if (a.contrast) parts.push(`contrast(${(1 + a.contrast * 0.6).toFixed(3)})`);
  if (a.sat) parts.push(`saturate(${Math.max(0, 1 + a.sat).toFixed(3)})`);
  if (parts.length) css = (css === 'none' ? '' : css + ' ') + parts.join(' ');
  return css || 'none';
}

/* ------------------------------------------------------------------ 변형 · 키프레임 */
const tfDefault = c => ({ s: c.tfS ?? 1, x: c.tfX ?? 0, y: c.tfY ?? 0, r: c.tfR ?? 0, o: c.tfO ?? 1 });
/** local 시점의 변형 값 (키프레임이 있으면 보간) */
function clipTransformAt(c, local) {
  const kf = c.kf || [];
  if (!kf.length) return tfDefault(c);
  if (local <= kf[0].t) return { ...kf[0] };
  if (local >= kf[kf.length - 1].t) return { ...kf[kf.length - 1] };
  let i = 0;
  while (i < kf.length - 1 && kf[i + 1].t < local) i++;
  const a = kf[i], b = kf[i + 1];
  const p = easeInOut((local - a.t) / Math.max(1e-6, b.t - a.t));
  const out = { t: local };
  TF_KEYS.forEach(k => { out[k] = a[k] + (b[k] - a[k]) * p; });
  return out;
}
/** 지금 위치에 키프레임 넣기 / 값 바꾸기 */
function setKeyframe(c, local, values) {
  c.kf = c.kf || [];
  const cur = clipTransformAt(c, local);
  const near = c.kf.find(k => Math.abs(k.t - local) < 0.05);
  const v = Object.assign({}, cur, values, { t: round2(local) });
  if (near) Object.assign(near, v); else c.kf.push(v);
  c.kf.sort((a, b) => a.t - b.t);
}
function removeKeyframeNear(c, local) {
  if (!c.kf) return false;
  const n = c.kf.length;
  c.kf = c.kf.filter(k => Math.abs(k.t - local) >= 0.05);
  return c.kf.length !== n;
}
const hasTransform = (c, t) => t.s !== 1 || t.x || t.y || t.r || t.o !== 1 || c.flipX || c.flipY;

/* ------------------------------------------------------------------ 효과 도우미 */
const fxScratch = { cv: null };
function scratchCopy() {
  if (!fxScratch.cv) fxScratch.cv = document.createElement('canvas');
  const s = fxScratch.cv;
  if (s.width !== canvas.width || s.height !== canvas.height) { s.width = canvas.width; s.height = canvas.height; }
  const g = s.getContext('2d');
  g.globalCompositeOperation = 'copy';
  g.drawImage(canvas, 0, 0);
  g.globalCompositeOperation = 'source-over';
  return s;
}
const rnd = (seed) => { const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

/** 장면 위치를 흔드는 효과 (그리기 전에 적용) */
function fxPreTransform(c, local) {
  const W = canvas.width, H = canvas.height, k = clamp(c.fxAmt ?? 0.6, 0, 1);
  if (c.fx === 'shake') {
    const f = Math.floor(local * 24);
    ctx.translate((rnd(f) - 0.5) * W * 0.03 * k, (rnd(f + 99) - 0.5) * H * 0.03 * k);
    ctx.rotate((rnd(f + 7) - 0.5) * 0.02 * k);
  } else if (c.fx === 'punch') {
    const ph = (local % 0.5) / 0.5;
    const s = 1 + 0.08 * k * Math.max(0, 1 - ph * 4);
    ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2);
  }
}
/** 그린 뒤 화면 전체에 얹는 효과 */
function fxPost(c, local) {
  const W = canvas.width, H = canvas.height, M = Math.min(W, H), k = clamp(c.fxAmt ?? 0.6, 0, 1);
  const a = c.adj || {};
  // 조정: 색온도 · 비네팅
  if (a.temp) {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = a.temp > 0 ? `rgba(255,150,40,${Math.abs(a.temp) * 0.55})` : `rgba(40,130,255,${Math.abs(a.temp) * 0.55})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (a.vignette) {
    const g = ctx.createRadialGradient(W / 2, H / 2, M * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.55);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a.vignette * 0.85})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (!c.fx) return;
  ctx.save();
  switch (c.fx) {
    case 'glitch': {
      const f = Math.floor(local * 12);
      if (rnd(f) < 0.25 + 0.5 * k) {
        const s = scratchCopy();
        const bands = 3 + Math.floor(rnd(f + 1) * 5);
        for (let b = 0; b < bands; b++) {
          const y = rnd(f * 7 + b) * H, h = (0.02 + rnd(f * 3 + b) * 0.08) * H;
          const dx = (rnd(f * 5 + b) - 0.5) * W * 0.12 * k;
          ctx.drawImage(s, 0, y, W, h, dx, y, W, h);
        }
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.35 * k;
        ctx.filter = 'sepia(1) saturate(8) hue-rotate(-40deg)';
        ctx.drawImage(s, -M * 0.012 * k, 0);
        ctx.filter = 'sepia(1) saturate(8) hue-rotate(170deg)';
        ctx.drawImage(s, M * 0.012 * k, 0);
      }
      break;
    }
    case 'vhs': {
      ctx.globalAlpha = 0.18 * k;
      ctx.fillStyle = '#000';
      for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1.5);
      ctx.globalAlpha = 0.12 * k;
      const yb = ((local * 0.25) % 1) * H;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, yb, W, H * 0.04);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = `rgba(255,0,140,${0.12 * k})`; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = `700 ${Math.round(M * 0.05)}px monospace`; ctx.fillStyle = `rgba(255,255,255,${0.85 * k})`;
      ctx.textBaseline = 'top';
      if (Math.floor(local * 2) % 2 === 0) ctx.fillText('▶ PLAY', M * 0.05, M * 0.05);
      break;
    }
    case 'leak': {
      ctx.globalCompositeOperation = 'screen';
      const x = W * (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(local * 0.9)));
      const g = ctx.createRadialGradient(x, H * 0.2, 0, x, H * 0.2, M * 0.9);
      g.addColorStop(0, `rgba(255,170,60,${0.7 * k})`); g.addColorStop(0.5, `rgba(255,60,90,${0.25 * k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'flash': {
      const p = local % 1;
      const v = Math.max(0, 1 - p * 5) * k;
      if (v > 0) { ctx.fillStyle = `rgba(255,255,255,${v})`; ctx.fillRect(0, 0, W, H); }
      break;
    }
    case 'blurin': {
      const p = clamp(local / Math.max(0.3, Math.min(1.2, c.duration * 0.5)), 0, 1);
      if (p < 1) {
        const s = scratchCopy();
        ctx.filter = `blur(${Math.round(M * 0.04 * k * (1 - p))}px)`;
        ctx.drawImage(s, 0, 0);
      }
      break;
    }
    case 'sparkle': {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) {
        const tw = 0.5 + 0.5 * Math.sin(local * (3 + rnd(i) * 4) + i);
        const x = rnd(i * 3.1) * W, y = rnd(i * 7.7) * H, r = M * (0.006 + 0.014 * rnd(i * 1.3)) * tw;
        ctx.fillStyle = `rgba(255,248,210,${0.9 * k * tw})`;
        ctx.beginPath(); ctx.moveTo(x, y - r * 3); ctx.lineTo(x + r * 0.6, y); ctx.lineTo(x, y + r * 3); ctx.lineTo(x - r * 0.6, y); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - r * 3, y); ctx.lineTo(x, y + r * 0.6); ctx.lineTo(x + r * 3, y); ctx.lineTo(x, y - r * 0.6); ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'grain': {
      const f = Math.floor(local * 24);
      ctx.globalAlpha = 0.5 * k;
      for (let i = 0; i < 900; i++) {
        const v = rnd(f * 1000 + i);
        ctx.fillStyle = v > 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
        ctx.fillRect(rnd(f * 31 + i * 3) * W, rnd(f * 17 + i * 5) * H, 2, 2);
      }
      ctx.globalAlpha = 0.15 * k; ctx.fillStyle = '#704214';
      ctx.globalCompositeOperation = 'soft-light'; ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'cinema': {
      const bh = H * (0.06 + 0.08 * k);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
      break;
    }
  }
  ctx.restore();
}

/** core.js drawClip 을 감싸서 변형·효과를 적용 */
function drawClipWithFx(clip, local, base) {
  const W = canvas.width, H = canvas.height;
  const T = clipTransformAt(clip, local);
  const needTf = hasTransform(clip, T);
  if (!needTf && !clip.fx && !clip.adj) { base(clip, local); return; }
  ctx.save();
  if (needTf || clip.fx === 'shake' || clip.fx === 'punch') {
    ctx.fillStyle = S.bg; ctx.fillRect(0, 0, W, H); // 옮기거나 줄이면 드러나는 바탕
    fxPreTransform(clip, local);
    ctx.translate(W / 2 + T.x * W, H / 2 + T.y * H);
    ctx.rotate((T.r || 0) * Math.PI / 180);
    ctx.scale(T.s * (clip.flipX ? -1 : 1), T.s * (clip.flipY ? -1 : 1));
    ctx.translate(-W / 2, -H / 2);
    ctx.globalAlpha *= clamp(T.o, 0, 1);
  }
  base(clip, local);
  ctx.restore();
  fxPost(clip, local);
}
