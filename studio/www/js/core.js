/* 영상뚝딱 — 핵심 엔진: 상태 · 미디어 · 장면 · 그리기 · 미리보기 재생 · 실행 취소 */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wait = ms => new Promise(r => setTimeout(r, ms));
const round1 = v => Math.round(v * 10) / 10;
const round2 = v => Math.round(v * 100) / 100;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = s => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
const fmtShort = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const easeInOut = p => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const easeOut = p => 1 - Math.pow(1 - p, 3);
const easeOutBack = p => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };

const FONTS = [
  { v: "'Noto Sans KR'", label: '본고딕 (기본)', weight: 900 },
  { v: "'Black Han Sans'", label: '검은고딕 (강렬)', weight: 400 },
  { v: "'Gowun Batang'", label: '고운바탕 (감성·고급)', weight: 700 },
  { v: "'Jua'", label: '주아 (귀여움)', weight: 400 },
];
const fontWeight = f => FONTS.find(x => x.v === f)?.weight ?? 700;
const TRANSITIONS = [
  { v: 'none', label: '없음 (바로 전환)', icon: '' },
  { v: 'fade', label: '페이드', icon: '◐' },
  { v: 'dip', label: '검은 화면 거쳐서', icon: '●' },
  { v: 'slide', label: '밀어내기 ←', icon: '⇠' },
  { v: 'slideup', label: '밀어올리기 ↑', icon: '⇡' },
  { v: 'zoom', label: '줌 인', icon: '⤢' },
  { v: 'wipe', label: '닦아내기', icon: '▌' },
  { v: 'circle', label: '원형 열기', icon: '◯' },
  { v: 'blur', label: '흐림 전환', icon: '≈' },
];
const MOTIONS = [
  { v: 'none', label: '움직임 없음' },
  { v: 'zoomIn', label: '천천히 확대' },
  { v: 'zoomOut', label: '천천히 축소' },
  { v: 'panLeft', label: '왼쪽으로 이동' },
  { v: 'panRight', label: '오른쪽으로 이동' },
  { v: 'panUp', label: '위로 이동' },
];
const TEXT_ANIMS = [
  { v: 'none', label: '없음' },
  { v: 'fade', label: '서서히 나타나기' },
  { v: 'up', label: '아래에서 올라오기' },
  { v: 'pop', label: '톡 튀어나오기' },
  { v: 'type', label: '타자 치듯' },
];
const FILTERS = [
  { v: 'none', label: '원본', css: 'none' },
  { v: 'vivid', label: '선명하게', css: 'contrast(1.1) saturate(1.3)' },
  { v: 'warm', label: '따뜻하게', css: 'sepia(0.22) saturate(1.15) brightness(1.03)' },
  { v: 'cool', label: '시원하게', css: 'saturate(1.05) hue-rotate(-10deg) brightness(1.03) contrast(1.03)' },
  { v: 'film', label: '빈티지 필름', css: 'sepia(0.4) contrast(0.95) brightness(1.05) saturate(0.85)' },
  { v: 'bw', label: '흑백', css: 'grayscale(1) contrast(1.12)' },
  { v: 'soft', label: '부드럽게', css: 'brightness(1.06) contrast(0.92) saturate(0.95)' },
];
const filterCss = v => FILTERS.find(f => f.v === v)?.css || 'none';

const state = {
  media: [],
  clips: [],
  selectedId: null,
  time: 0,
  playing: false,
  busy: false,
  settings: {
    aspect: '16:9', quality: 720, fps: 30, bg: '#000000', filter: 'none',
    bgmId: '', bgmVolume: 0.7, bgmFade: true, bgmOffset: 0, beatSync: true,
    logoId: '', logoPos: 'tr', logoSize: 0.16,
  },
};
const S = state.settings;

let canvas = null, ctx = null;
const mediaById = id => state.media.find(m => m.id === id);
const clipById = id => state.clips.find(c => c.id === id);
const clipMedia = c => (c && c.kind === 'media' ? mediaById(c.mediaId) : null);
const isVideoClip = c => clipMedia(c)?.type === 'video';

/* 화면 갱신 훅 (ui.js 에서 연결) */
const hooks = { onTimeline() {}, onClipPanel() {}, onLibrary() {}, onProject() {}, onTime() {}, onPlayState() {}, onHistory() {} };

/* ------------------------------------------------------------------ 오디오 (미리보기) */
const audio = { ctx: null, master: null };
function ensureAudio() {
  if (!audio.ctx) {
    audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    audio.master = audio.ctx.createGain();
    audio.master.connect(audio.ctx.destination);
    state.clips.forEach(c => c._video && connectClipAudio(c));
  }
  if (audio.ctx.state === 'suspended') audio.ctx.resume();
  return audio.ctx;
}
function connectClipAudio(clip) {
  if (!audio.ctx || clip._gain || !clip._video) return;
  try {
    const src = audio.ctx.createMediaElementSource(clip._video);
    const g = audio.ctx.createGain();
    g.gain.value = clip.volume;
    src.connect(g); g.connect(audio.master);
    clip._gain = g;
  } catch (e) { console.warn(e); }
}
let bgmNode = null;
function startBgm(t) {
  stopBgm();
  const m = mediaById(S.bgmId);
  if (!m || !m.buffer || !audio.ctx) return;
  const total = totalDuration(), remain = total - t;
  if (remain <= 0) return;
  const gain = audio.ctx.createGain();
  gain.connect(audio.master);
  const src = audio.ctx.createBufferSource();
  src.buffer = m.buffer; src.loop = true; src.connect(gain);
  const now = audio.ctx.currentTime;
  scheduleBgmGain(gain.gain, now, t, total);
  src.start(now, (t + S.bgmOffset) % m.buffer.duration);
  src.stop(now + remain + 0.05);
  bgmNode = { src, gain };
}
/** 배경음악 음량: 시작 페이드 인, 목소리 나올 때 줄이기(더킹), 끝 페이드 아웃 — 미리보기·저장 공통 */
function bgmLevel(tt, total, segs) {
  const vol = S.bgmVolume, fadeLen = Math.min(2.5, total / 3);
  let v = vol;
  if (tt < 0.3) v *= Math.max(0, tt / 0.3);
  if (S.bgmFade && tt > total - fadeLen) v *= Math.max(0, (total - tt) / fadeLen);
  let duck = 1;
  for (const sg of segs) {
    let f = 1;
    if (tt >= sg.start && tt <= sg.end) f = 0.3;
    else if (tt > sg.start - 0.25 && tt < sg.start) f = 1 - 0.7 * (tt - (sg.start - 0.25)) / 0.25;
    else if (tt > sg.end && tt < sg.end + 0.4) f = 0.3 + 0.7 * (tt - sg.end) / 0.4;
    duck = Math.min(duck, f);
  }
  return v * duck;
}
function scheduleBgmGain(g, at, t, total) {
  const segs = voiceSegments();
  g.setValueAtTime(bgmLevel(t, total, segs), at);
  const step = 0.05;
  for (let x = Math.ceil(t / step) * step; x <= total + 1e-6; x += step) {
    if (x <= t) continue;
    g.linearRampToValueAtTime(bgmLevel(x, total, segs), at + (x - t));
  }
}
/** 장면에 붙인 목소리(내레이션) 구간 */
function voiceSegments() {
  const out = [];
  for (const L of layout()) {
    const c = L.clip;
    const m = c.voiceId ? mediaById(c.voiceId) : null;
    if (!m || !m.buffer) continue;
    const start = L.start + (c.voiceDelay || 0);
    out.push({ clip: c, start, end: start + m.buffer.duration, buffer: m.buffer, vol: c.voiceVol ?? 1 });
  }
  return out;
}
let voiceNodes = [];
function startVoices(t) {
  stopVoices();
  if (!audio.ctx) return;
  const now = audio.ctx.currentTime;
  for (const sg of voiceSegments()) {
    if (sg.end <= t) continue;
    const src = audio.ctx.createBufferSource();
    src.buffer = sg.buffer;
    const g = audio.ctx.createGain(); g.gain.value = sg.vol;
    src.connect(g); g.connect(audio.master);
    if (sg.start >= t) src.start(now + (sg.start - t));
    else src.start(now, t - sg.start);
    voiceNodes.push({ src, g });
  }
}
function stopVoices() {
  for (const n of voiceNodes) { try { n.src.stop(); } catch (e) { /* 무시 */ } n.g.disconnect(); }
  voiceNodes = [];
}
function stopBgm() {
  if (!bgmNode) return;
  try { bgmNode.src.stop(); } catch (e) { /* 이미 멈춤 */ }
  bgmNode.gain.disconnect();
  bgmNode = null;
}

/* ------------------------------------------------------------------ 미디어 불러오기 */
function guessType(name, mime = '') {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  const ext = name.split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'heic', 'heif'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv', '3gp'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus', 'wma'].includes(ext)) return 'audio';
  return null;
}
/** files: File[] → 추가된 미디어 배열. onProgress(i, n, name) */
async function loadFiles(files, onProgress) {
  const added = [], failed = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    onProgress?.(i, files.length, f.name);
    const type = guessType(f.name, f.type);
    if (!type) { failed.push(f.name); continue; }
    const m = { id: uid(), type, name: f.name, url: URL.createObjectURL(f), file: f };
    try {
      if (type === 'image') await loadImage(m);
      else if (type === 'video') await loadVideo(m);
      else await loadAudio(m);
    } catch (e) {
      console.error(e);
      URL.revokeObjectURL(m.url);
      failed.push(f.name);
      continue;
    }
    state.media.push(m);
    added.push(m);
  }
  return { added, failed };
}
async function loadImage(m) {
  const img = new Image();
  img.src = m.url;
  await img.decode();
  m.el = img; m.w = img.naturalWidth; m.h = img.naturalHeight;
  m.thumb = makeThumb(img, m.w, m.h, 320);
}
function makeThumb(src, w, h, size) {
  const c = document.createElement('canvas');
  const sc = size / Math.max(w, h);
  c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.75);
}
function loadVideo(m) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = m.url;
    const timer = setTimeout(() => reject(new Error('timeout')), 20000);
    v.onerror = () => { clearTimeout(timer); reject(new Error('video load error')); };
    v.onloadedmetadata = () => {
      m.w = v.videoWidth; m.h = v.videoHeight;
      m.duration = isFinite(v.duration) ? v.duration : 10;
      if (!m.w) { clearTimeout(timer); reject(new Error('no video track')); return; }
      v.currentTime = Math.min(1, m.duration / 3);
    };
    v.onseeked = () => {
      clearTimeout(timer);
      try { m.thumb = makeThumb(v, m.w, m.h, 640); } catch (e) { m.thumb = ''; }
      v.removeAttribute('src'); v.load();
      resolve();
    };
  });
}
async function decodeAudioFile(file) {
  const ac = ensureAudio();
  const buf = await file.arrayBuffer();
  return await new Promise((res, rej) => {
    const p = ac.decodeAudioData(buf, res, rej);
    if (p && p.then) p.then(res, rej);
  });
}
async function loadAudio(m) {
  m.buffer = await decodeAudioFile(m.file);
  m.duration = m.buffer.duration;
  try { m.beat = detectBeats(m.buffer); } catch (e) { m.beat = null; }
}
/** 동영상 속 소리 (내보내기용, 필요할 때 한 번만 해석) */
async function getVideoAudio(m) {
  if (m.audioBuffer !== undefined) return m.audioBuffer;
  try { m.audioBuffer = await decodeAudioFile(m.file); } catch (e) { m.audioBuffer = null; }
  return m.audioBuffer;
}
function removeMediaData(m) {
  URL.revokeObjectURL(m.url);
  state.media = state.media.filter(x => x !== m);
  if (S.bgmId === m.id) { S.bgmId = ''; stopBgm(); }
  if (S.logoId === m.id) S.logoId = '';
}

/* ------------------------------------------------------------------ 박자 분석 */
function detectBeats(buffer) {
  const sr = buffer.sampleRate, hop = 512;
  const len = Math.min(buffer.length, sr * 90);
  const chs = [];
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) chs.push(buffer.getChannelData(c));
  const n = Math.floor(len / hop);
  const energy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (const ch of chs) for (let j = i * hop, end = j + hop; j < end; j++) e += ch[j] * ch[j];
    energy[i] = Math.log1p(e * 100);
  }
  const onset = new Float32Array(n);
  for (let i = 1; i < n; i++) onset[i] = Math.max(0, energy[i] - energy[i - 1]);
  const fps = sr / hop;
  const minLag = Math.floor(fps * 60 / 180), maxLag = Math.ceil(fps * 60 / 70);
  let best = 0, bestLag = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += onset[i] * onset[i - lag];
    const bpm = 60 * fps / lag;
    s *= 1 + 0.15 * Math.exp(-Math.pow((bpm - 120) / 40, 2)); // 보통 템포 쪽을 조금 선호
    if (s > best) { best = s; bestLag = lag; }
  }
  if (!bestLag) return null;
  let bestPhase = 0, bestSum = -1;
  for (let ph = 0; ph < bestLag; ph++) {
    let s = 0;
    for (let i = ph; i < n; i += bestLag) s += onset[i];
    if (s > bestSum) { bestSum = s; bestPhase = ph; }
  }
  return { bpm: Math.round(60 * fps / bestLag), period: bestLag / fps, offset: bestPhase / fps };
}

/* ------------------------------------------------------------------ 장면(클립) */
function newClip(kind, extra = {}) {
  return Object.assign({
    id: uid(), kind, mediaId: null,
    duration: 3, trimStart: 0, volume: 1,
    fit: 'cover', motion: 'zoomIn',
    transition: 'fade', transDur: 0.6,
    text: '', sub: '', font: FONTS[0].v, fontSize: 64, textColor: '#ffffff', textPos: 'bottom', textBg: true, textAnim: 'up',
    bgColor: '#2f4332', bgColor2: '',
    enhance: 0, voiceId: '', voiceVol: 1, voiceDelay: 0.3, narration: '',
  }, extra);
}
function clipFromMedia(m, extra = {}) {
  const c = newClip('media', Object.assign({ mediaId: m.id }, extra));
  if (m.type === 'video') {
    if (extra.duration === undefined) c.duration = round1(Math.min(m.duration, 600));
    if (extra.motion === undefined) c.motion = 'none';
  }
  return c;
}
function stripClip(c) {
  const o = {};
  for (const k in c) if (!k.startsWith('_')) o[k] = c[k];
  return o;
}
function disposeClip(c) {
  if (c._video) { c._video.pause(); c._video.removeAttribute('src'); c._video.load(); c._video.remove(); }
}
function getClipVideo(clip) {
  if (clip._video) return clip._video;
  const m = clipMedia(clip);
  const v = document.createElement('video');
  v.preload = 'auto'; v.playsInline = true; v.src = m.url;
  v.addEventListener('seeked', () => { if (!state.playing) requestRender(); });
  v.addEventListener('loadeddata', () => { if (!state.playing) requestRender(); });
  $('#videoPool').appendChild(v);
  clip._video = v;
  connectClipAudio(clip);
  return v;
}

/* ------------------------------------------------------------------ 시간 계산 */
function layout() {
  let t = 0;
  return state.clips.map(clip => { const o = { clip, start: t, end: t + clip.duration }; t += clip.duration; return o; });
}
const totalDuration = () => state.clips.reduce((s, c) => s + c.duration, 0);
function indexAt(t, lay) {
  for (let i = 0; i < lay.length; i++) if (t < lay[i].end) return i;
  return lay.length - 1;
}
const transLen = (c, i) => (i === 0 || c.transition === 'none' ? 0 : Math.min(c.transDur, c.duration * 0.9));

/* ------------------------------------------------------------------ 그리기 */
function canvasSizeFor(aspect, quality) {
  const [a, b] = aspect.split(':').map(Number);
  let w, h;
  if (a >= b) { h = quality; w = Math.round(quality * a / b); } else { w = quality; h = Math.round(quality * b / a); }
  return { w: w & ~1, h: h & ~1 };
}
function setCanvasSize(quality = S.quality) {
  const { w, h } = canvasSizeFor(S.aspect, quality);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const [a, b] = S.aspect.split(':').map(Number);
  canvas.style.aspectRatio = `${a} / ${b}`;
}

function render(t) {
  const W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.filter = 'none';
  ctx.fillStyle = S.bg; ctx.fillRect(0, 0, W, H);
  const lay = layout();
  if (!lay.length) return;
  const i = indexAt(t, lay), L = lay[i];
  const local = clamp(t - L.start, 0, L.clip.duration);
  const td = transLen(L.clip, i);
  if (td > 0 && local < td) {
    const P = lay[i - 1];
    const p = easeInOut(local / td);
    const tr = L.clip.transition;
    if (tr === 'dip') {
      if (p < 0.5) { drawClip(P.clip, P.clip.duration + local); ctx.fillStyle = `rgba(0,0,0,${p * 2})`; ctx.fillRect(0, 0, W, H); }
      else { drawClip(L.clip, local); ctx.fillStyle = `rgba(0,0,0,${(1 - p) * 2})`; ctx.fillRect(0, 0, W, H); }
    } else if (tr === 'blur') {
      const r = Math.round(Math.min(W, H) * 0.03 * Math.sin(p * Math.PI));
      ctx.save(); ctx.filter = r ? `blur(${r}px)` : 'none'; drawClip(P.clip, P.clip.duration + local); ctx.restore();
      ctx.save(); ctx.globalAlpha = p; ctx.filter = r ? `blur(${r}px)` : 'none'; drawClip(L.clip, local); ctx.restore();
    } else {
      drawClip(P.clip, P.clip.duration + local);
      ctx.save(); applyTransition(tr, p, W, H); drawClip(L.clip, local); ctx.restore();
    }
  } else {
    drawClip(L.clip, local);
  }
  drawLogo();
}
function applyTransition(kind, p, W, H) {
  switch (kind) {
    case 'fade': ctx.globalAlpha = p; break;
    case 'slide': ctx.translate(Math.round(W * (1 - p)), 0); break;
    case 'slideup': ctx.translate(0, Math.round(H * (1 - p))); break;
    case 'zoom': {
      const s = 0.6 + 0.4 * p;
      ctx.globalAlpha = p;
      ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2);
      break;
    }
    case 'wipe': ctx.beginPath(); ctx.rect(0, 0, W * p, H); ctx.clip(); break;
    case 'circle': ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.hypot(W, H) / 2 * p, 0, Math.PI * 2); ctx.clip(); break;
  }
}

function drawClip(clip, local) {
  const W = canvas.width, H = canvas.height;
  ctx.save();
  if (clip.kind === 'text') {
    if (clip.bgColor2) {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, clip.bgColor); g.addColorStop(1, clip.bgColor2);
      ctx.fillStyle = g;
    } else ctx.fillStyle = clip.bgColor;
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = S.bg; ctx.fillRect(0, 0, W, H);
    const m = clipMedia(clip);
    if (m) {
      let src = m.el, sw = m.w, sh = m.h;
      if (m.type === 'video') {
        src = getClipVideo(clip);
        if (src.readyState < 2) src = null;
        else { sw = src.videoWidth; sh = src.videoHeight; }
      }
      if (src && sw && sh) {
        const p = clamp(local / Math.max(0.1, clip.duration), 0, 1);
        const mv = motionAt(clip.motion, p);
        const fcss = filterCss(S.filter);
        if (clip.fit === 'blur') {
          ctx.save();
          ctx.filter = `blur(${Math.round(Math.min(W, H) * 0.035)}px) brightness(0.65)` + (fcss !== 'none' ? ' ' + fcss : '');
          drawFit(src, sw, sh, 'cover', 1.12, 0, 0);
          ctx.restore();
          ctx.filter = fcss;
          drawFit(src, sw, sh, 'contain', mv.z, mv.x, mv.y, clip.enhance ? { m, amount: clip.enhance } : null);
        } else {
          ctx.filter = fcss;
          drawFit(src, sw, sh, clip.fit, mv.z, mv.x, mv.y, clip.enhance ? { m, amount: clip.enhance } : null);
        }
        ctx.filter = 'none';
      }
    }
  }
  if ((clip.text || '').trim() || (clip.sub || '').trim()) drawText(clip, local);
  ctx.restore();
}
function motionAt(kind, p) {
  const e = easeInOut(p) * 0.6 + p * 0.4;
  switch (kind) {
    case 'zoomIn': return { z: 1 + 0.14 * e, x: 0, y: 0 };
    case 'zoomOut': return { z: 1.14 - 0.14 * e, x: 0, y: 0 };
    case 'panLeft': return { z: 1.14, x: 1 - 2 * e, y: 0 };
    case 'panRight': return { z: 1.14, x: -1 + 2 * e, y: 0 };
    case 'panUp': return { z: 1.14, x: 0, y: 1 - 2 * e };
    default: return { z: 1, x: 0, y: 0 };
  }
}
/** x, y: -1~1 (확대로 생긴 여유 공간 안에서 이동) */
function drawFit(src, sw, sh, fit, z, x, y, enh) {
  const W = canvas.width, H = canvas.height;
  const base = fit === 'contain' ? Math.min(W / sw, H / sh) : Math.max(W / sw, H / sh);
  const dw = sw * base * z, dh = sh * base * z;
  // 이동 가능한 여유: 꽉 채우기면 화면 밖으로 넘친 부분 전체, 전체 보이기면 확대로 커진 만큼
  const exW = fit === 'contain' ? (dw - sw * base) / 2 : Math.min(Math.max(0, (dw - W) / 2), W * 0.22);
  const exH = fit === 'contain' ? (dh - sh * base) / 2 : Math.min(Math.max(0, (dh - H) / 2), H * 0.22);
  const dx = (W - dw) / 2 + x * exW, dy = (H - dh) / 2 + y * exH;
  if (enh && window.Enhancer) {
    const out = Enhancer.process(src, sw, sh, dw, dh, enh.m, enh.amount);
    if (out) { ctx.drawImage(out, dx, dy, dw, dh); return; }
  }
  ctx.drawImage(src, dx, dy, dw, dh);
}

function textFont(clip, size) {
  return `${fontWeight(clip.font)} ${size}px ${clip.font}, 'Noto Sans KR', sans-serif`;
}
function drawText(clip, local) {
  const W = canvas.width, H = canvas.height;
  const scale = Math.min(W, H) / 1080;
  const fs = Math.max(8, clip.fontSize * scale);
  const subFs = fs * 0.48;
  const anim = clip.textAnim;
  const a = clamp(local / 0.55, 0, 1);
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let text = clip.text || '';
  if (anim === 'type') {
    const chars = [...text];
    const n = Math.floor(clamp(local / Math.max(0.6, Math.min(clip.duration * 0.5, chars.length * 0.07)), 0, 1) * chars.length);
    text = chars.slice(0, n).join('');
  }
  ctx.font = textFont(clip, fs);
  const lines = text ? wrapText(text, W * 0.86) : [];
  const fullLines = anim === 'type' ? wrapText(clip.text || '', W * 0.86) : lines;
  ctx.font = textFont(Object.assign({}, clip, { font: clip.kind === 'text' ? "'Noto Sans KR'" : clip.font }), subFs);
  const subLines = (clip.sub || '').trim() ? wrapText(clip.sub, W * 0.8) : [];
  const lh = fs * 1.3, slh = subFs * 1.45, gap = subLines.length && fullLines.length ? fs * 0.35 : 0;
  const blockH = fullLines.length * lh + gap + subLines.length * slh;
  // 세로 영상은 아래쪽이 앱 버튼·설명에 가려지므로 자막을 조금 올림 (안전 영역)
  const margin = clip.textPos === 'bottom' && H > W * 1.4 ? H * 0.2 : H * 0.08;
  let y0 = clip.textPos === 'top' ? margin : clip.textPos === 'center' ? (H - blockH) / 2 : H - margin - blockH;

  if (anim === 'fade') ctx.globalAlpha *= easeOut(a);
  else if (anim === 'up') { ctx.globalAlpha *= easeOut(a); ctx.translate(0, (1 - easeOut(a)) * fs * 0.6); }
  else if (anim === 'pop') {
    const s = a >= 1 ? 1 : Math.max(0.01, easeOutBack(a));
    ctx.globalAlpha *= clamp(a * 3, 0, 1);
    const cy = y0 + blockH / 2;
    ctx.translate(W / 2, cy); ctx.scale(s, s); ctx.translate(-W / 2, -cy);
  }

  if (clip.textBg && blockH > 0) {
    ctx.font = textFont(clip, fs);
    let mw = Math.max(0, ...fullLines.map(l => ctx.measureText(l).width));
    ctx.font = textFont(clip, subFs);
    mw = Math.max(mw, ...subLines.map(l => ctx.measureText(l).width));
    const pad = fs * 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect((W - mw) / 2 - pad * 1.4, y0 - pad, mw + pad * 2.8, blockH + pad * 2, fs * 0.25);
    ctx.fill();
  }
  const drawLines = (ls, size, lineH, startY, color, f) => {
    ctx.font = textFont(Object.assign({}, clip, f ? { font: f } : {}), size);
    ls.forEach((l, k) => {
      const y = startY + lineH * k + lineH / 2;
      if (!clip.textBg) {
        ctx.save();
        ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.14; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = size * 0.25;
        if (clip.kind !== 'text') ctx.strokeText(l, W / 2, y);
        ctx.restore();
      }
      ctx.fillStyle = color;
      ctx.fillText(l, W / 2, y);
    });
  };
  drawLines(lines, fs, lh, y0, clip.textColor);
  if (subLines.length) {
    ctx.globalAlpha *= anim === 'none' ? 1 : clamp((local - 0.25) / 0.5, 0, 1);
    drawLines(subLines, subFs, slh, y0 + fullLines.length * lh + gap, clip.textColor, clip.kind === 'text' ? "'Noto Sans KR'" : null);
  }
  ctx.restore();
}
function wrapText(text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    if (!para.trim()) { if (para === '') out.push(''); continue; }
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const test = line + word;
      if (ctx.measureText(test).width <= maxW) { line = test; continue; }
      if (line.trim()) { out.push(line.trim()); line = ''; }
      const w = word.trimStart();
      if (ctx.measureText(w).width <= maxW) { line = w; continue; }
      for (const ch of w) {
        if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ''; }
        line += ch;
      }
    }
    if (line.trim()) out.push(line.trim());
  }
  return out;
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawLogo() {
  const m = mediaById(S.logoId);
  if (!m || !m.el) return;
  const W = canvas.width, H = canvas.height;
  const w = W * S.logoSize, h = w * m.h / m.w, pad = Math.min(W, H) * 0.035;
  const x = S.logoPos.includes('l') ? pad : W - pad - w;
  const y = S.logoPos.includes('t') ? pad : H - pad - h;
  ctx.save(); ctx.globalAlpha = 0.92; ctx.drawImage(m.el, x, y, w, h); ctx.restore();
}
/** 캔버스에 쓸 글자를 미리 불러오기 (한글 글꼴은 글자 묶음별로 나뉘어 있음) */
function preloadText() {
  if (!document.fonts) return Promise.resolve();
  const jobs = [];
  for (const c of state.clips) {
    const s = (c.text || '') + (c.sub || '');
    if (!s.trim()) continue;
    jobs.push(document.fonts.load(textFont(c, 40), s));
    if (c.sub) jobs.push(document.fonts.load(textFont(Object.assign({}, c, { font: "'Noto Sans KR'" }), 40), c.sub));
  }
  return Promise.all(jobs).catch(() => {});
}

/* ------------------------------------------------------------------ 미리보기 재생 */
function syncVideos(t) {
  const lay = layout();
  if (!lay.length) return;
  const i = indexAt(t, lay), L = lay[i];
  const local = t - L.start;
  const prev = local < transLen(L.clip, i) ? lay[i - 1].clip : null;
  for (const { clip } of lay) {
    if (!isVideoClip(clip)) continue;
    const v = getClipVideo(clip);
    if (clip._gain) clip._gain.gain.value = clip.volume; else v.volume = clamp(clip.volume, 0, 1);
    if (clip === L.clip) {
      const want = clip.trimStart + clamp(local, 0, clip.duration);
      const nearEnd = local >= clip.duration - 0.06 || (v.duration && want >= v.duration - 0.06);
      if (state.playing && !nearEnd) {
        if (v.paused) {
          if (Math.abs(v.currentTime - want) > 0.12) v.currentTime = want;
          v.play().catch(() => {});
        } else if (!v.seeking && Math.abs(v.currentTime - want) > 0.45) v.currentTime = want;
      } else {
        if (!v.paused) v.pause();
        if (!v.seeking && Math.abs(v.currentTime - want) > 0.04) v.currentTime = want;
      }
    } else if (clip === prev) {
      const md = clipMedia(clip).duration;
      const want = Math.min(clip.trimStart + clip.duration + local, md - 0.05);
      if (state.playing && want < md - 0.08) {
        if (v.paused) { if (Math.abs(v.currentTime - want) > 0.12) v.currentTime = want; v.play().catch(() => {}); }
        else if (!v.seeking && Math.abs(v.currentTime - want) > 0.45) v.currentTime = want;
      } else {
        if (!v.paused) v.pause();
        if (!v.seeking && Math.abs(v.currentTime - want) > 0.04) v.currentTime = want;
      }
    } else {
      if (!v.paused) v.pause();
      if (!v.seeking && Math.abs(v.currentTime - clip.trimStart) > 0.1) v.currentTime = clip.trimStart;
    }
  }
}
let playStartWall = 0, playStartT = 0, rafId = 0, renderQueued = false;
function frame() {
  syncVideos(state.time);
  render(state.time);
  hooks.onTime();
}
function requestRender() {
  if (state.playing || renderQueued || state.busy) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; if (!state.busy) frame(); });
}
function play() {
  if (!state.clips.length || state.playing || state.busy) return;
  ensureAudio();
  state.clips.forEach(c => isVideoClip(c) && getClipVideo(c));
  if (state.time >= totalDuration() - 0.02) state.time = 0;
  state.playing = true;
  playStartWall = performance.now(); playStartT = state.time;
  startBgm(state.time);
  startVoices(state.time);
  hooks.onPlayState();
  loop();
}
function pause() {
  if (!state.playing) return;
  state.playing = false;
  cancelAnimationFrame(rafId);
  stopBgm();
  stopVoices();
  state.clips.forEach(c => c._video && c._video.pause());
  hooks.onPlayState();
  requestRender();
}
function loop() {
  const total = totalDuration();
  const t = playStartT + (performance.now() - playStartWall) / 1000;
  if (t >= total) { state.time = total; frame(); pause(); return; }
  state.time = t;
  frame();
  rafId = requestAnimationFrame(loop);
}
function seekTo(t) {
  const was = state.playing;
  if (was) pause();
  state.time = clamp(t, 0, totalDuration());
  requestRender();
  hooks.onTime();
  if (was) play();
}

/* ------------------------------------------------------------------ 실행 취소 / 다시 실행 */
const hist = { undo: [], redo: [], last: null, timer: 0 };
function snapshot() {
  return JSON.stringify({ clips: state.clips.map(stripClip), settings: S, selectedId: state.selectedId });
}
function commit(debounceMs = 0) {
  clearTimeout(hist.timer);
  const run = () => {
    const now = snapshot();
    if (hist.last !== null && now !== hist.last) {
      hist.undo.push(hist.last);
      if (hist.undo.length > 80) hist.undo.shift();
      hist.redo = [];
    }
    hist.last = now;
    hooks.onHistory();
  };
  if (debounceMs) hist.timer = setTimeout(run, debounceMs); else run();
}
function restore(json) {
  const data = JSON.parse(json);
  const old = new Map(state.clips.map(c => [c.id, c]));
  state.clips = data.clips.filter(c => c.kind === 'text' || mediaById(c.mediaId)).map(c => {
    const prev = old.get(c.id);
    if (prev && prev.mediaId === c.mediaId) { c._video = prev._video; c._gain = prev._gain; old.delete(c.id); }
    return c;
  });
  state.clips.forEach(c => { if (c.voiceId && !mediaById(c.voiceId)) c.voiceId = ''; });
  old.forEach(disposeClip);
  const keepBgm = mediaById(data.settings.bgmId) ? data.settings.bgmId : '';
  const keepLogo = mediaById(data.settings.logoId) ? data.settings.logoId : '';
  Object.assign(S, data.settings, { bgmId: keepBgm, logoId: keepLogo });
  state.selectedId = clipById(data.selectedId) ? data.selectedId : null;
  state.time = Math.min(state.time, totalDuration());
}
function undo() {
  commit();
  if (!hist.undo.length) return false;
  pause();
  hist.redo.push(hist.last);
  hist.last = hist.undo.pop();
  restore(hist.last);
  hooks.onHistory();
  return true;
}
function redo() {
  if (!hist.redo.length) return false;
  pause();
  hist.undo.push(hist.last);
  hist.last = hist.redo.pop();
  restore(hist.last);
  hooks.onHistory();
  return true;
}
