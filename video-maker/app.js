/* 동영상 제작기 — 브라우저만으로 사진·영상·자막·음악을 합쳐 동영상 파일을 만듭니다.
 * 파일은 서버로 업로드되지 않고 모두 이 컴퓨터(브라우저) 안에서 처리됩니다.
 * 렌더링: <canvas> 에 프레임을 그림 → canvas.captureStream + WebAudio → MediaRecorder 로 녹화
 */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wait = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const FONTS = [
  { v: "'Noto Sans KR'", label: '본고딕' },
  { v: "'Black Han Sans'", label: '검은고딕 (제목용)' },
  { v: "'Gowun Batang'", label: '고운바탕 (명조)' },
  { v: "'Jua'", label: '주아 (둥근체)' },
];
const TRANSITIONS = [
  { v: 'none', label: '없음 (바로 전환)' },
  { v: 'fade', label: '페이드' },
  { v: 'slide', label: '밀어내기 ←' },
  { v: 'slideup', label: '밀어올리기 ↑' },
  { v: 'zoom', label: '줌 인' },
  { v: 'wipe', label: '닦아내기' },
  { v: 'circle', label: '원형 열기' },
];
const TRANS_ICON = { none: '', fade: '◐', slide: '⇠', slideup: '⇡', zoom: '⤢', wipe: '▌', circle: '◯' };

const state = {
  media: [],      // {id,type:'image'|'video'|'audio',name,url,el,w,h,duration,thumb,buffer}
  clips: [],      // see newClip()
  selectedId: null,
  time: 0,
  playing: false,
  exporting: false,
  settings: {
    aspect: '16:9', quality: 720, fps: 30, bg: '#000000',
    bgmId: '', bgmVolume: 0.6, bgmFade: true,
    logoId: '', logoPos: 'tr', logoSize: 0.16,
    muteExport: true,
  },
};
const S = state.settings;

const canvas = $('#stage');
const ctx = canvas.getContext('2d');
const mediaById = id => state.media.find(m => m.id === id);
const clipById = id => state.clips.find(c => c.id === id);
const clipMedia = c => (c.kind === 'media' ? mediaById(c.mediaId) : null);
const isVideoClip = c => c.kind === 'media' && clipMedia(c)?.type === 'video';

/* ------------------------------------------------------------------ 오디오 */
let actx = null, master = null, monitor = null, streamDest = null;
function ensureAudio() {
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain();
    monitor = actx.createGain();
    master.connect(monitor);
    monitor.connect(actx.destination);
    if (actx.createMediaStreamDestination) {
      streamDest = actx.createMediaStreamDestination();
      master.connect(streamDest);
    }
    state.clips.forEach(c => c._video && connectClipAudio(c));
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function connectClipAudio(clip) {
  if (!actx || clip._gain || !clip._video) return;
  try {
    const src = actx.createMediaElementSource(clip._video);
    const g = actx.createGain();
    g.gain.value = clip.volume;
    src.connect(g); g.connect(master);
    clip._gain = g;
  } catch (e) { console.warn(e); }
}

let bgmNode = null;
function startBgm(t) {
  stopBgm();
  const m = mediaById(S.bgmId);
  if (!m || !m.buffer || !actx) return;
  const total = totalDuration();
  const remain = total - t;
  if (remain <= 0) return;
  const gain = actx.createGain();
  gain.connect(master);
  const src = actx.createBufferSource();
  src.buffer = m.buffer; src.loop = true; src.connect(gain);
  const now = actx.currentTime, vol = S.bgmVolume, g = gain.gain;
  const fadeLen = Math.min(2.5, total / 3);
  if (S.bgmFade && remain < fadeLen) g.setValueAtTime(vol * remain / fadeLen, now);
  else g.setValueAtTime(vol, now);
  if (S.bgmFade) {
    if (remain > fadeLen) g.setValueAtTime(vol, now + remain - fadeLen);
    g.linearRampToValueAtTime(0, now + remain);
  }
  src.start(now, t % m.buffer.duration);
  src.stop(now + remain + 0.05);
  bgmNode = { src, gain };
}
function stopBgm() {
  if (!bgmNode) return;
  try { bgmNode.src.stop(); } catch (e) { /* 이미 멈춤 */ }
  bgmNode.gain.disconnect();
  bgmNode = null;
}

/* ------------------------------------------------------------------ 미디어 불러오기 */
async function addFiles(fileList) {
  const files = [...fileList];
  for (const f of files) {
    const type = f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video'
      : f.type.startsWith('audio/') ? 'audio' : guessType(f.name);
    if (!type) { alert(`지원하지 않는 파일입니다: ${f.name}`); continue; }
    const m = { id: uid(), type, name: f.name, url: URL.createObjectURL(f) };
    try {
      if (type === 'image') await loadImage(m);
      else if (type === 'video') await loadVideo(m);
      else await loadAudio(m, f);
    } catch (e) {
      console.error(e);
      alert(`파일을 열 수 없습니다: ${f.name}\n(브라우저가 지원하지 않는 형식일 수 있습니다)`);
      URL.revokeObjectURL(m.url);
      continue;
    }
    state.media.push(m);
    if (type === 'audio' && !S.bgmId) S.bgmId = m.id;
    if (type === 'image' && /logo|로고/i.test(f.name) && !S.logoId) { S.logoId = m.id; renderLibrary(); syncProjectForm(); continue; }
    if (type !== 'audio' && $('#autoAdd').checked) addClipFromMedia(m, false);
  }
  renderLibrary(); syncProjectForm(); renderTimeline(); requestRender();
}
function guessType(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov', 'm4v', 'ogv'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'].includes(ext)) return 'audio';
  return null;
}
async function loadImage(m) {
  const img = new Image();
  img.src = m.url;
  await img.decode();
  m.el = img; m.w = img.naturalWidth; m.h = img.naturalHeight; m.thumb = m.url;
}
function loadVideo(m) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = m.url;
    v.onerror = () => reject(new Error('video load error'));
    v.onloadedmetadata = () => {
      m.w = v.videoWidth; m.h = v.videoHeight;
      m.duration = isFinite(v.duration) ? v.duration : 10;
      v.currentTime = Math.min(1, m.duration / 3);
    };
    v.onseeked = () => {
      const c = document.createElement('canvas');
      const sc = 240 / Math.max(1, m.w);
      c.width = 240; c.height = Math.max(1, Math.round(m.h * sc));
      try { c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); m.thumb = c.toDataURL('image/jpeg', 0.7); } catch (e) { m.thumb = ''; }
      v.removeAttribute('src'); v.load();
      resolve();
    };
  });
}
async function loadAudio(m, file) {
  ensureAudio();
  const buf = await file.arrayBuffer();
  m.buffer = await new Promise((res, rej) => {
    const p = actx.decodeAudioData(buf, res, rej);
    if (p && p.then) p.then(res, rej);
  });
  m.duration = m.buffer.duration;
}

/* ------------------------------------------------------------------ 클립 */
function newClip(kind, extra = {}) {
  return Object.assign({
    id: uid(), kind, mediaId: null,
    duration: 3, trimStart: 0, volume: 1,
    fit: 'cover', kenBurns: true,
    transition: state.clips.length ? 'fade' : 'none', transDur: 0.6,
    text: '', font: FONTS[0].v, fontSize: 64, textColor: '#ffffff', textPos: 'bottom', textBg: true, textAnim: true,
    bgColor: '#3E5641',
  }, extra);
}
function addClipFromMedia(m, select = true, index = state.clips.length) {
  if (m.type === 'audio') { S.bgmId = m.id; syncProjectForm(); renderLibrary(); return; }
  const c = newClip('media', { mediaId: m.id });
  if (index === 0) c.transition = 'none';
  if (m.type === 'video') { c.duration = round1(Math.min(m.duration, 600)); c.kenBurns = false; }
  state.clips.splice(index, 0, c);
  if (select) selectClip(c.id);
  renderTimeline(); requestRender();
}
function addTextClip() {
  const c = newClip('text', { text: '제목을 입력하세요', textPos: 'center', fontSize: 110, font: FONTS[1].v, textBg: false, duration: 3 });
  const sel = clipById(state.selectedId);
  const idx = sel ? state.clips.indexOf(sel) + 1 : state.clips.length;
  if (idx === 0) c.transition = 'none';
  state.clips.splice(idx, 0, c);
  selectClip(c.id);
  seekTo(layout()[idx].start + 0.01);
  renderTimeline();
  setTimeout(() => { const ta = $('#clipTab textarea'); if (ta) { ta.focus(); ta.select(); } }, 0);
}
function removeClip(id) {
  const i = state.clips.findIndex(c => c.id === id);
  if (i < 0) return;
  const [c] = state.clips.splice(i, 1);
  if (c._video) { c._video.pause(); c._video.remove(); }
  if (state.selectedId === id) state.selectedId = state.clips[Math.min(i, state.clips.length - 1)]?.id || null;
  state.time = Math.min(state.time, totalDuration());
  renderTimeline(); renderClipPanel(); requestRender();
}
function duplicateClip(id) {
  const c = clipById(id); if (!c) return;
  const copy = {};
  for (const k in c) if (!k.startsWith('_')) copy[k] = c[k];
  copy.id = uid();
  state.clips.splice(state.clips.indexOf(c) + 1, 0, copy);
  selectClip(copy.id); renderTimeline(); requestRender();
}
function moveClip(id, dir) {
  const i = state.clips.findIndex(c => c.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= state.clips.length) return;
  [state.clips[i], state.clips[j]] = [state.clips[j], state.clips[i]];
  fixFirstTransition();
  renderTimeline(); requestRender();
}
const round1 = v => Math.round(v * 10) / 10;

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

/* ------------------------------------------------------------------ 타임라인 계산 */
function layout() {
  let t = 0;
  return state.clips.map(clip => { const o = { clip, start: t, end: t + clip.duration }; t += clip.duration; return o; });
}
const totalDuration = () => state.clips.reduce((s, c) => s + c.duration, 0);
function indexAt(t, lay) {
  for (let i = 0; i < lay.length; i++) if (t < lay[i].end) return i;
  return lay.length - 1;
}
const transLen = c => (c.transition === 'none' ? 0 : Math.min(c.transDur, c.duration * 0.9));

/* ------------------------------------------------------------------ 그리기 */
function setCanvasSize() {
  const [a, b] = S.aspect.split(':').map(Number);
  const short = S.quality;
  let w, h;
  if (a >= b) { h = short; w = Math.round(short * a / b); } else { w = short; h = Math.round(short * b / a); }
  canvas.width = w & ~1; canvas.height = h & ~1; // 짝수 크기 (인코더 호환)
  $('#stage').style.aspectRatio = `${a} / ${b}`;
  requestRender();
}

function render(t) {
  const W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.filter = 'none';
  ctx.fillStyle = S.bg; ctx.fillRect(0, 0, W, H);
  const lay = layout();
  if (!lay.length) {
    ctx.fillStyle = '#777';
    ctx.font = `700 ${Math.round(Math.min(W, H) * 0.045)}px 'Noto Sans KR', sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('사진 · 동영상을 추가하면 여기에 미리보기가 나옵니다', W / 2, H / 2);
    return;
  }
  const i = indexAt(t, lay), L = lay[i];
  const local = clamp(t - L.start, 0, L.clip.duration);
  const td = transLen(L.clip);
  if (i > 0 && td > 0 && local < td) {
    const P = lay[i - 1];
    drawClip(P.clip, P.clip.duration);
    const p = easeInOut(local / td);
    ctx.save(); applyTransition(L.clip.transition, p, W, H); drawClip(L.clip, local); ctx.restore();
  } else {
    drawClip(L.clip, local);
  }
  drawLogo();
}
const easeInOut = p => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

function applyTransition(kind, p, W, H) {
  switch (kind) {
    case 'fade': ctx.globalAlpha = p; break;
    case 'slide': ctx.translate(W * (1 - p), 0); break;
    case 'slideup': ctx.translate(0, H * (1 - p)); break;
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
    ctx.fillStyle = clip.bgColor; ctx.fillRect(0, 0, W, H);
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
        const z = clip.kenBurns ? 1 + 0.12 * (local / Math.max(0.1, clip.duration)) : 1;
        if (clip.fit === 'blur') {
          ctx.save();
          ctx.filter = `blur(${Math.round(Math.min(W, H) * 0.03)}px) brightness(0.7)`;
          drawFit(src, sw, sh, 'cover', 1.1);
          ctx.restore();
          drawFit(src, sw, sh, 'contain', z);
        } else drawFit(src, sw, sh, clip.fit, z);
      }
    }
  }
  if (clip.text.trim()) drawText(clip, local);
  ctx.restore();
}
function drawFit(src, sw, sh, fit, z) {
  const W = canvas.width, H = canvas.height;
  const s = (fit === 'contain' ? Math.min(W / sw, H / sh) : Math.max(W / sw, H / sh)) * z;
  const dw = sw * s, dh = sh * s;
  ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

function drawText(clip, local) {
  const W = canvas.width, H = canvas.height;
  const scale = Math.min(W, H) / 1080;
  const fs = Math.max(8, clip.fontSize * scale);
  ctx.save();
  if (clip.textAnim) {
    const a = clamp(local / 0.5, 0, 1);
    ctx.globalAlpha *= a;
    ctx.translate(0, (1 - easeInOut(a)) * fs * 0.4);
  }
  ctx.font = `${clip.font.includes('Noto') ? 900 : 400} ${fs}px ${clip.font}, 'Noto Sans KR', sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = wrapText(clip.text, W * 0.86);
  const lh = fs * 1.32;
  const blockH = lines.length * lh;
  const margin = H * 0.07;
  let y0 = clip.textPos === 'top' ? margin : clip.textPos === 'center' ? (H - blockH) / 2 : H - margin - blockH;
  if (clip.textBg) {
    const pad = fs * 0.35;
    const mw = Math.max(...lines.map(l => ctx.measureText(l).width));
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect((W - mw) / 2 - pad * 1.4, y0 - pad, mw + pad * 2.8, blockH + pad * 2, fs * 0.25);
    ctx.fill();
  } else {
    ctx.lineJoin = 'round'; ctx.lineWidth = fs * 0.14; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    lines.forEach((l, k) => ctx.strokeText(l, W / 2, y0 + lh * k + lh / 2));
  }
  ctx.fillStyle = clip.textColor;
  lines.forEach((l, k) => ctx.fillText(l, W / 2, y0 + lh * k + lh / 2));
  ctx.restore();
}
function wrapText(text, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    if (!para) { out.push(''); continue; }
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const test = line + word;
      if (ctx.measureText(test).width <= maxW) { line = test; continue; }
      if (line.trim()) { out.push(line.trim()); line = ''; }
      const w = word.trimStart();
      if (ctx.measureText(w).width <= maxW) { line = w; continue; }
      for (const ch of w) { // 너무 긴 단어는 글자 단위로 자르기
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

/* ------------------------------------------------------------------ 재생 */
function syncVideos(t) {
  const lay = layout();
  if (!lay.length) return;
  const i = indexAt(t, lay), L = lay[i];
  const local = t - L.start;
  const prev = i > 0 && local < transLen(L.clip) ? lay[i - 1].clip : null;
  for (const { clip } of lay) {
    if (!isVideoClip(clip)) continue;
    const v = getClipVideo(clip);
    if (clip._gain) clip._gain.gain.value = clip.volume;
    else v.volume = clip.volume;
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
      if (!v.paused) v.pause();
      const want = clip.trimStart + clip.duration - 0.04;
      if (!v.seeking && Math.abs(v.currentTime - want) > 0.1) v.currentTime = want;
    } else {
      if (!v.paused) v.pause();
      if (!v.seeking && Math.abs(v.currentTime - clip.trimStart) > 0.1) v.currentTime = clip.trimStart; // 다음 재생 대비
    }
  }
}

let playStartWall = 0, playStartT = 0, rafId = 0, renderQueued = false;
function frame() {
  syncVideos(state.time);
  render(state.time);
  updateTimeUI();
}
function requestRender() {
  if (state.playing || renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; frame(); });
}
function play() {
  if (!state.clips.length || state.playing) return;
  ensureAudio();
  state.clips.forEach(c => isVideoClip(c) && getClipVideo(c));
  if (state.time >= totalDuration() - 0.02) state.time = 0;
  state.playing = true;
  playStartWall = performance.now(); playStartT = state.time;
  startBgm(state.time);
  updatePlayBtn();
  loop();
}
function pause() {
  if (!state.playing) return;
  state.playing = false;
  cancelAnimationFrame(rafId);
  stopBgm();
  state.clips.forEach(c => c._video && c._video.pause());
  updatePlayBtn();
  requestRender();
}
function loop() {
  const total = totalDuration();
  let t = playStartT + (performance.now() - playStartWall) / 1000;
  if (t >= total) {
    state.time = total;
    frame();
    pause();
    onPlaybackEnd();
    return;
  }
  state.time = t;
  frame();
  if (state.exporting) setExportProgress(t / total);
  rafId = requestAnimationFrame(loop);
}
function seekTo(t) {
  const wasPlaying = state.playing;
  if (wasPlaying) pause();
  state.time = clamp(t, 0, totalDuration());
  requestRender();
  if (wasPlaying) play();
}
let onPlaybackEnd = () => {};

/* ------------------------------------------------------------------ 내보내기 */
let recorder = null, exportCancelled = false, lastExportUrl = null;
function pickMime() {
  const list = [
    ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'mp4'],
    ['video/mp4;codecs=avc1,mp4a', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9,opus', 'webm'],
    ['video/webm;codecs=vp8,opus', 'webm'],
    ['video/webm', 'webm'],
  ];
  for (const [m, ext] of list) if (MediaRecorder.isTypeSupported?.(m)) return { mime: m, ext };
  return { mime: '', ext: 'webm' };
}
async function exportVideo() {
  if (!state.clips.length) { alert('먼저 사진이나 동영상을 추가하세요.'); return; }
  if (!window.MediaRecorder || !canvas.captureStream) {
    alert('이 브라우저는 동영상 만들기를 지원하지 않습니다.\n최신 Chrome 또는 Edge 브라우저를 사용해 주세요.');
    return;
  }
  pause();
  ensureAudio();
  await actx.resume();
  state.clips.forEach(c => isVideoClip(c) && getClipVideo(c));

  const { mime, ext } = pickMime();
  const vStream = canvas.captureStream(S.fps);
  const tracks = [...vStream.getVideoTracks()];
  if (streamDest) tracks.push(...streamDest.stream.getAudioTracks());
  const stream = new MediaStream(tracks);
  const pixels = canvas.width * canvas.height;
  const opts = { videoBitsPerSecond: Math.round(pixels * S.fps * 0.15), audioBitsPerSecond: 192000 };
  if (mime) opts.mimeType = mime;
  try { recorder = new MediaRecorder(stream, opts); } catch (e) {
    alert('녹화를 시작할 수 없습니다: ' + e.message); return;
  }
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };

  exportCancelled = false;
  state.exporting = true;
  document.body.classList.add('exporting');
  monitor.gain.value = S.muteExport ? 0 : 1;
  openExportModal();

  // 첫 장면 준비 (영상 탐색 완료 대기)
  state.time = 0;
  frame();
  await waitForVideosReady();
  frame();

  const done = new Promise(resolve => { recorder.onstop = resolve; });
  onPlaybackEnd = async () => {
    onPlaybackEnd = () => {};
    await wait(250); // 마지막 프레임까지 녹화
    if (recorder.state !== 'inactive') recorder.stop();
  };
  recorder.start(500);
  play();
  await done;

  state.exporting = false;
  document.body.classList.remove('exporting');
  monitor.gain.value = 1;
  vStream.getTracks().forEach(t => t.stop());
  if (exportCancelled) { closeExportModal(); return; }

  const blob = new Blob(chunks, { type: (mime || 'video/webm').split(';')[0] });
  if (lastExportUrl) URL.revokeObjectURL(lastExportUrl);
  lastExportUrl = URL.createObjectURL(blob);
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const name = `video-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
  showExportResult(lastExportUrl, name, blob.size, ext);
}
async function waitForVideosReady() {
  const vids = state.clips.filter(isVideoClip).map(c => c._video).filter(Boolean);
  const start = performance.now();
  while (performance.now() - start < 4000) {
    if (vids.every(v => v.readyState >= 2 && !v.seeking)) break;
    await wait(50);
  }
  await wait(150);
}
function cancelExport() {
  if (!state.exporting) { closeExportModal(); return; }
  exportCancelled = true;
  onPlaybackEnd = () => {};
  pause();
  if (recorder && recorder.state !== 'inactive') recorder.stop();
}
function openExportModal() {
  $('#exportTitle').textContent = '동영상을 만드는 중…';
  $('#exportNote').textContent = `영상 길이(${fmt(totalDuration())})만큼 실시간으로 녹화합니다. 이 탭을 닫거나 다른 탭으로 전환하지 마세요.`;
  $('#downloadLink').hidden = true;
  $('#resultVideo').hidden = true;
  $('#exportCancel').textContent = '취소';
  setExportProgress(0);
  $('#exportModal').hidden = false;
}
function closeExportModal() {
  $('#exportModal').hidden = true;
  const rv = $('#resultVideo'); rv.pause(); rv.removeAttribute('src'); rv.load();
}
function setExportProgress(p) {
  const pct = Math.round(clamp(p, 0, 1) * 100);
  $('#exportBar').style.width = pct + '%';
  $('#exportPct').textContent = pct + '%';
}
function showExportResult(url, name, size, ext) {
  setExportProgress(1);
  $('#exportTitle').textContent = '✅ 동영상이 완성되었습니다';
  $('#exportNote').textContent = `${name} · ${(size / 1048576).toFixed(1)}MB · ${canvas.width}×${canvas.height}` +
    (ext === 'webm' ? ' — WebM 형식입니다. 유튜브·인스타그램에 그대로 올릴 수 있습니다.' : '');
  const a = $('#downloadLink'); a.href = url; a.download = name; a.hidden = false;
  const rv = $('#resultVideo'); rv.src = url; rv.hidden = false;
  $('#exportCancel').textContent = '닫기';
}

/* ------------------------------------------------------------------ UI: 보관함 */
function renderLibrary() {
  const list = $('#libList');
  $('#libCount').textContent = state.media.length ? `(${state.media.length})` : '';
  $('#dropHint').hidden = state.media.length > 0;
  list.innerHTML = state.media.map(m => {
    const icon = m.type === 'audio' ? '🎵' : '';
    const badge = m.type === 'image' ? '사진' : m.type === 'video' ? '영상' : '음악';
    const extra = m.type === 'image' ? `${m.w}×${m.h}` : fmt(m.duration);
    const tags = (S.bgmId === m.id ? ' · 배경음악' : '') + (S.logoId === m.id ? ' · 로고' : '');
    const addTitle = m.type === 'audio' ? '배경음악으로 사용' : '타임라인에 추가';
    return `<div class="lib-item${S.bgmId === m.id ? ' is-bgm' : ''}" draggable="${m.type !== 'audio'}" data-id="${m.id}">
      <div class="thumb" style="${m.thumb ? `background-image:url('${m.thumb}')` : ''}">${icon}</div>
      <span class="badge">${badge}</span>
      <div class="lib-actions">
        <button data-act="add" title="${addTitle}">＋</button>
        <button data-act="del" title="보관함에서 삭제">✕</button>
      </div>
      <div class="meta">${esc(m.name)}<small>${extra}${tags}</small></div>
    </div>`;
  }).join('');
}
function removeMedia(id) {
  const used = state.clips.filter(c => c.mediaId === id);
  if (used.length && !confirm(`타임라인에서 이 파일을 쓰는 클립 ${used.length}개도 함께 삭제됩니다. 계속할까요?`)) return;
  used.forEach(c => removeClip(c.id));
  const m = mediaById(id);
  state.media = state.media.filter(x => x.id !== id);
  if (S.bgmId === id) { S.bgmId = ''; if (state.playing) stopBgm(); }
  if (S.logoId === id) S.logoId = '';
  if (m) URL.revokeObjectURL(m.url);
  renderLibrary(); syncProjectForm(); requestRender();
}

/* ------------------------------------------------------------------ UI: 타임라인 */
let pps = 70; // 1초당 픽셀
function renderTimeline() {
  const track = $('#track'), ruler = $('#ruler');
  const total = totalDuration();
  if (!state.clips.length) {
    track.innerHTML = '<div class="track-empty">아직 클립이 없습니다. 보관함에서 ＋를 누르거나 파일을 끌어다 놓으세요.</div>';
  } else {
    track.innerHTML = state.clips.map((c, i) => {
      const m = clipMedia(c);
      const bg = c.kind === 'text' ? `background-color:${c.bgColor}` : m?.thumb ? `background-image:url('${m.thumb}')` : '';
      const title = c.kind === 'text' ? '텍스트' : m ? esc(m.name) : '?';
      const trans = i > 0 && c.transition !== 'none' ? `<span class="c-trans" title="전환: ${c.transition}">${TRANS_ICON[c.transition]}</span>` : '';
      const cap = c.text.trim() && c.kind !== 'text' ? '<span class="c-cap">자막</span>' : '';
      const inner = c.kind === 'text' ? `<span style="font-weight:700;color:${c.textColor};padding:0 6px;text-align:center;font-size:12px">${esc(c.text.split('\n')[0] || ' ')}</span>` : '';
      return `<div class="clip${c.kind === 'text' ? ' textclip' : ''}${c.id === state.selectedId ? ' selected' : ''}" draggable="true" data-id="${c.id}"
        style="width:${Math.max(18, c.duration * pps)}px;${bg}" title="${title} · ${c.duration.toFixed(1)}초">
        ${trans}${cap}${inner}<div class="c-label">${title}<b>${c.duration.toFixed(1)}초</b></div></div>`;
    }).join('');
  }
  // 눈금
  const step = pps >= 100 ? 1 : pps >= 45 ? 2 : pps >= 25 ? 5 : 10;
  const end = Math.max(total, 10) + step;
  let html = '';
  for (let s = 0; s <= end; s += step) html += `<div class="tick" style="left:${s * pps}px">${fmtShort(s)}</div>`;
  ruler.innerHTML = html;
  $('#tlInner').style.width = (end * pps + 60) + 'px';
  $('#totTime').textContent = fmt(total);
  updateTimeUI();
}
function updateTimeUI() {
  const total = totalDuration();
  $('#curTime').textContent = fmt(state.time);
  $('#totTime').textContent = fmt(total);
  if (!seekDragging) $('#seek').value = total ? Math.round(state.time / total * 1000) : 0;
  const ph = $('#playhead');
  ph.style.left = (14 + state.time * pps) + 'px';
  if (state.playing) { // 재생 위치를 따라 스크롤
    const tl = $('#timeline'), x = 14 + state.time * pps;
    if (x > tl.scrollLeft + tl.clientWidth - 40 || x < tl.scrollLeft) tl.scrollLeft = x - 60;
  }
}
const fmt = s => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
const fmtShort = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function updatePlayBtn() { $('#playBtn').textContent = state.playing ? '❚❚' : '▶'; }

function selectClip(id, seek = false) {
  state.selectedId = id;
  $$('#track .clip').forEach(el => el.classList.toggle('selected', el.dataset.id === id));
  renderClipPanel();
  showTab('clip');
  if (seek) {
    const L = layout().find(l => l.clip.id === id);
    if (L && (state.time < L.start || state.time >= L.end)) seekTo(L.start + Math.min(transLen(L.clip) + 0.3, L.clip.duration / 2));
  }
}

/* ------------------------------------------------------------------ UI: 클립 속성 */
function renderClipPanel() {
  const box = $('#clipTab');
  const c = clipById(state.selectedId);
  if (!c) { box.innerHTML = '<p class="empty">타임라인에서 클립을 선택하세요.</p>'; return; }
  const m = clipMedia(c);
  const isVid = m?.type === 'video';
  const idx = state.clips.indexOf(c);
  const opt = (list, cur) => list.map(o => `<option value="${esc(o.v)}"${o.v === cur ? ' selected' : ''}>${o.label}</option>`).join('');
  const maxDur = isVid ? round1(m.duration - c.trimStart) : 120;
  box.innerHTML = `
    <div class="clip-head">
      <div class="thumb" style="${c.kind === 'text' ? `background:${c.bgColor}` : m?.thumb ? `background-image:url('${m.thumb}')` : ''}"></div>
      <div><b>${c.kind === 'text' ? '텍스트 슬라이드' : esc(m?.name || '')}</b><br><small class="muted">${idx + 1}번째 클립</small></div>
    </div>
    <div class="row2">
      <div class="field"><label>길이(초)</label><input type="number" data-k="duration" min="0.5" max="${maxDur}" step="0.1" value="${c.duration}"></div>
      ${isVid ? `<div class="field"><label>시작 지점(초)</label><input type="number" data-k="trimStart" min="0" max="${round1(m.duration - 0.5)}" step="0.1" value="${c.trimStart}"></div>` : ''}
    </div>
    ${isVid ? `<div class="field"><label>원본 소리 <output>${Math.round(c.volume * 100)}%</output></label><input type="range" data-k="volume" min="0" max="1" step="0.01" value="${c.volume}"></div>` : ''}
    ${c.kind === 'media' ? `
      <div class="field"><label>화면 맞춤</label>
        <select data-k="fit">${opt([{ v: 'cover', label: '꽉 채우기 (가장자리 잘림)' }, { v: 'contain', label: '전체 보이기 (여백)' }, { v: 'blur', label: '전체 보이기 + 흐린 배경' }], c.fit)}</select></div>
      <label class="check"><input type="checkbox" data-k="kenBurns"${c.kenBurns ? ' checked' : ''}> 천천히 확대 (켄번스 효과)</label>` :
      `<div class="field"><label>배경색</label><input type="color" data-k="bgColor" value="${c.bgColor}"></div>`}
    <hr>
    <div class="sec-title">전환 효과 <small class="muted">(이전 클립 → 이 클립)</small></div>
    ${idx === 0 ? '<p class="muted" style="margin-bottom:10px">첫 번째 클립에는 전환 효과가 없습니다.</p>' : `
    <div class="row2">
      <div class="field"><label>효과</label><select data-k="transition">${opt(TRANSITIONS, c.transition)}</select></div>
      <div class="field"><label>전환 시간(초)</label><input type="number" data-k="transDur" min="0.1" max="3" step="0.1" value="${c.transDur}"></div>
    </div>`}
    <hr>
    <div class="sec-title">${c.kind === 'text' ? '텍스트' : '자막'}</div>
    <div class="field"><textarea data-k="text" placeholder="자막을 입력하세요 (Enter로 줄바꿈)">${esc(c.text)}</textarea></div>
    <div class="row2">
      <div class="field"><label>글꼴</label><select data-k="font">${opt(FONTS, c.font)}</select></div>
      <div class="field"><label>글자 색</label><input type="color" data-k="textColor" value="${c.textColor}"></div>
    </div>
    <div class="field"><label>글자 크기 <output>${c.fontSize}</output></label><input type="range" data-k="fontSize" min="24" max="200" step="2" value="${c.fontSize}"></div>
    <div class="field"><label>위치</label>
      <div class="seg" style="grid-template-columns:1fr 1fr 1fr">${['top', 'center', 'bottom'].map((p, k) =>
        `<button data-pos="${p}" class="${c.textPos === p ? 'on' : ''}">${['위', '가운데', '아래'][k]}</button>`).join('')}</div></div>
    <label class="check"><input type="checkbox" data-k="textBg"${c.textBg ? ' checked' : ''}> 반투명 배경 상자</label>
    <label class="check"><input type="checkbox" data-k="textAnim"${c.textAnim ? ' checked' : ''}> 나타나기 애니메이션</label>
    <hr>
    <div class="btn-row">
      <button class="btn btn-sm" data-cmd="left" ${idx === 0 ? 'disabled' : ''}>◀ 앞으로</button>
      <button class="btn btn-sm" data-cmd="right" ${idx === state.clips.length - 1 ? 'disabled' : ''}>뒤로 ▶</button>
      <button class="btn btn-sm" data-cmd="dup">⧉ 복제</button>
      <button class="btn btn-sm btn-danger" data-cmd="del">🗑 삭제</button>
    </div>
    <div class="btn-row">
      <button class="btn btn-sm" data-cmd="allTrans">전환 효과를 모든 클립에 적용</button>
      ${!isVid ? '<button class="btn btn-sm" data-cmd="allDur">길이를 모든 사진에 적용</button>' : ''}
      ${c.kind === 'media' ? '<button class="btn btn-sm" data-cmd="allFit">화면 맞춤을 모든 클립에 적용</button>' : ''}
      ${c.text.trim() ? '<button class="btn btn-sm" data-cmd="allStyle">자막 스타일을 모든 클립에 적용</button>' : ''}
    </div>`;
}

function onClipInput(e) {
  const el = e.target, k = el.dataset.k;
  const c = clipById(state.selectedId);
  if (!k || !c) return;
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.type === 'number' || el.type === 'range') {
    v = parseFloat(el.value);
    if (!isFinite(v)) return;
  } else v = el.value;
  const m = clipMedia(c);
  if (k === 'duration') {
    const max = m?.type === 'video' ? m.duration - c.trimStart : 120;
    v = clamp(v, 0.5, Math.max(0.5, max));
  }
  if (k === 'trimStart' && m) {
    v = clamp(v, 0, m.duration - 0.5);
    c.duration = Math.min(c.duration, round1(m.duration - v));
  }
  if (k === 'transDur') v = clamp(v, 0.1, 3);
  c[k] = v;
  const out = el.closest('.field')?.querySelector('output');
  if (out) out.textContent = k === 'volume' ? Math.round(v * 100) + '%' : v;
  if (['duration', 'trimStart', 'transition', 'bgColor', 'text', 'textColor'].includes(k)) renderTimelineSoon();
  if (k === 'text' && e.type === 'change') renderClipPanel();
  if (k === 'transition' || k === 'trimStart') {
    const L = layout().find(l => l.clip === c);
    if (L) seekTo(k === 'transition' ? Math.max(0, L.start - 0.3) : L.start);
    if (k === 'transition' && v !== 'none') play();
  }
  if (k === 'trimStart' && e.type === 'change') renderClipPanel();
  requestRender();
}
let tlTimer = 0;
function renderTimelineSoon() { clearTimeout(tlTimer); tlTimer = setTimeout(renderTimeline, 120); }

function onClipCommand(cmd) {
  const c = clipById(state.selectedId);
  if (!c) return;
  const idx = state.clips.indexOf(c);
  switch (cmd) {
    case 'left': moveClip(c.id, -1); break;
    case 'right': moveClip(c.id, 1); break;
    case 'dup': duplicateClip(c.id); break;
    case 'del': removeClip(c.id); return;
    case 'allTrans': state.clips.forEach((x, i) => { if (i > 0) { x.transition = idx === 0 ? 'fade' : c.transition; x.transDur = c.transDur; } }); flash('모든 클립에 전환 효과를 적용했습니다'); break;
    case 'allDur': state.clips.forEach(x => { if (!isVideoClip(x)) x.duration = c.duration; }); flash('모든 사진·텍스트 클립 길이를 바꿨습니다'); break;
    case 'allFit': state.clips.forEach(x => { if (x.kind === 'media') { x.fit = c.fit; if (!isVideoClip(x)) x.kenBurns = c.kenBurns; } }); flash('화면 맞춤을 모두 적용했습니다'); break;
    case 'allStyle': state.clips.forEach(x => { if (x.kind === 'media') Object.assign(x, { font: c.font, fontSize: c.fontSize, textColor: c.textColor, textPos: c.textPos, textBg: c.textBg, textAnim: c.textAnim }); }); flash('자막 스타일을 모두 적용했습니다'); break;
  }
  renderTimeline(); renderClipPanel(); requestRender();
}
function flash(msg) {
  let el = $('#flash');
  if (!el) {
    el = document.createElement('div'); el.id = 'flash';
    el.style.cssText = 'position:fixed;left:50%;bottom:210px;transform:translateX(-50%);background:#3E5641;color:#fff;padding:9px 16px;border-radius:8px;z-index:60;font-weight:700;transition:opacity .3s;pointer-events:none';
    document.body.appendChild(el);
  }
  el.textContent = msg; el.style.opacity = 1;
  clearTimeout(flash.t); flash.t = setTimeout(() => { el.style.opacity = 0; }, 1600);
}

/* ------------------------------------------------------------------ UI: 프로젝트 설정 */
function syncProjectForm() {
  const audio = state.media.filter(m => m.type === 'audio');
  $('#bgmSelect').innerHTML = `<option value="">없음</option>` + audio.map(m => `<option value="${m.id}"${m.id === S.bgmId ? ' selected' : ''}>${esc(m.name)}</option>`).join('')
    + (audio.length ? '' : '<option disabled>— 음악 파일을 추가하세요 —</option>');
  const imgs = state.media.filter(m => m.type === 'image');
  $('#logoSelect').innerHTML = `<option value="">없음</option>` + imgs.map(m => `<option value="${m.id}"${m.id === S.logoId ? ' selected' : ''}>${esc(m.name)}</option>`).join('');
  $$('#aspectSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === S.aspect));
}
function showTab(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $('#clipTab').hidden = name !== 'clip';
  $('#projectTab').hidden = name !== 'project';
}

/* ------------------------------------------------------------------ 이벤트 연결 */
let seekDragging = false;
function bind() {
  $('#fileInput').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  $('#addTextBtn').addEventListener('click', addTextClip);
  $('#exportBtn').addEventListener('click', exportVideo);
  $('#exportCancel').addEventListener('click', cancelExport);
  $('#playBtn').addEventListener('click', () => (state.playing ? pause() : play()));
  $('#toStartBtn').addEventListener('click', () => seekTo(0));
  const seek = $('#seek');
  seek.addEventListener('input', () => { seekDragging = true; seekTo(seek.value / 1000 * totalDuration()); });
  seek.addEventListener('change', () => { seekDragging = false; });

  // 파일 드래그 앤 드롭 (페이지 전체)
  let dragDepth = 0;
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', e => { if (hasFiles(e)) { dragDepth++; document.body.classList.add('dragging'); } });
  window.addEventListener('dragleave', e => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
  window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
    addFiles(e.dataTransfer.files);
  });

  // 보관함
  $('#libList').addEventListener('click', e => {
    const item = e.target.closest('.lib-item'); if (!item) return;
    const m = mediaById(item.dataset.id);
    const act = e.target.closest('button')?.dataset.act;
    if (act === 'del') removeMedia(m.id);
    else if (act === 'add') addClipFromMedia(m);
  });
  $('#libList').addEventListener('dblclick', e => {
    const item = e.target.closest('.lib-item'); if (item) addClipFromMedia(mediaById(item.dataset.id));
  });
  $('#libList').addEventListener('dragstart', e => {
    const item = e.target.closest('.lib-item'); if (!item) return;
    e.dataTransfer.setData('text/x-media', item.dataset.id);
    e.dataTransfer.effectAllowed = 'copy';
  });

  // 타임라인
  const track = $('#track');
  let dragClipId = null;
  track.addEventListener('click', e => {
    const el = e.target.closest('.clip');
    if (el) selectClip(el.dataset.id, true);
  });
  track.addEventListener('dragstart', e => {
    const el = e.target.closest('.clip'); if (!el) return;
    dragClipId = el.dataset.id;
    e.dataTransfer.setData('text/x-clip', dragClipId);
    e.dataTransfer.effectAllowed = 'move';
  });
  track.addEventListener('dragend', () => { dragClipId = null; clearDropMarks(); });
  const dropTarget = e => {
    const el = e.target.closest('.clip');
    if (!el) return { index: state.clips.length };
    const r = el.getBoundingClientRect();
    const after = e.clientX > r.left + r.width / 2;
    const i = state.clips.findIndex(c => c.id === el.dataset.id);
    return { el, after, index: i + (after ? 1 : 0) };
  };
  const clearDropMarks = () => $$('#track .clip').forEach(c => c.classList.remove('drop-before', 'drop-after'));
  track.addEventListener('dragover', e => {
    const types = [...e.dataTransfer.types];
    if (!types.includes('text/x-clip') && !types.includes('text/x-media')) return;
    e.preventDefault();
    clearDropMarks();
    const d = dropTarget(e);
    if (d.el) d.el.classList.add(d.after ? 'drop-after' : 'drop-before');
  });
  track.addEventListener('drop', e => {
    const clipId = e.dataTransfer.getData('text/x-clip');
    const mediaId = e.dataTransfer.getData('text/x-media');
    if (!clipId && !mediaId) return;
    e.preventDefault(); e.stopPropagation();
    const d = dropTarget(e);
    clearDropMarks();
    if (clipId) {
      const from = state.clips.findIndex(c => c.id === clipId);
      if (from < 0) return;
      const [c] = state.clips.splice(from, 1);
      const to = d.index > from ? d.index - 1 : d.index;
      state.clips.splice(to, 0, c);
      fixFirstTransition();
      renderTimeline(); renderClipPanel(); requestRender();
    } else {
      const m = mediaById(mediaId);
      if (m) addClipFromMedia(m, true, d.index);
    }
  });

  // 눈금자 클릭/드래그로 위치 이동
  const ruler = $('#ruler');
  const rulerSeek = e => { const r = ruler.getBoundingClientRect(); seekTo((e.clientX - r.left) / pps); };
  ruler.addEventListener('pointerdown', e => {
    ruler.setPointerCapture(e.pointerId); rulerSeek(e);
    const move = ev => rulerSeek(ev);
    ruler.addEventListener('pointermove', move);
    ruler.addEventListener('pointerup', () => ruler.removeEventListener('pointermove', move), { once: true });
  });
  $('#tlZoom').addEventListener('input', e => { pps = +e.target.value; renderTimeline(); });

  // 클립 속성
  const clipTab = $('#clipTab');
  clipTab.addEventListener('input', onClipInput);
  clipTab.addEventListener('change', onClipInput);
  clipTab.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.cmd) onClipCommand(b.dataset.cmd);
    if (b.dataset.pos) {
      const c = clipById(state.selectedId); if (!c) return;
      c.textPos = b.dataset.pos;
      $$('[data-pos]', clipTab).forEach(x => x.classList.toggle('on', x === b));
      requestRender();
    }
  });

  // 탭
  $$('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));

  // 프로젝트 설정
  $('#aspectSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    S.aspect = b.dataset.v; syncProjectForm(); setCanvasSize();
  });
  $('#quality').addEventListener('change', e => { S.quality = +e.target.value; setCanvasSize(); });
  $('#fps').addEventListener('change', e => { S.fps = +e.target.value; });
  $('#bgColor').addEventListener('input', e => { S.bg = e.target.value; requestRender(); });
  $('#bgmSelect').addEventListener('change', e => {
    S.bgmId = e.target.value; renderLibrary();
    if (state.playing) startBgm(state.time);
  });
  $('#bgmVol').addEventListener('input', e => {
    S.bgmVolume = +e.target.value; $('#bgmVolOut').textContent = Math.round(S.bgmVolume * 100) + '%';
    if (state.playing) startBgm(state.time);
  });
  $('#bgmFade').addEventListener('change', e => { S.bgmFade = e.target.checked; });
  $('#logoSelect').addEventListener('change', e => { S.logoId = e.target.value; renderLibrary(); requestRender(); });
  $('#logoPos').addEventListener('change', e => { S.logoPos = e.target.value; requestRender(); });
  $('#logoSize').addEventListener('input', e => { S.logoSize = +e.target.value; $('#logoSizeOut').textContent = Math.round(S.logoSize * 100) + '%'; requestRender(); });
  $('#muteExport').addEventListener('change', e => { S.muteExport = e.target.checked; });

  // 키보드
  window.addEventListener('keydown', e => {
    if (state.exporting) return;
    const tag = e.target.tagName;
    const typing = tag === 'TEXTAREA' || (tag === 'INPUT' && !['range', 'checkbox', 'color'].includes(e.target.type)) || tag === 'SELECT';
    if (typing) return;
    if (e.code === 'Space') { e.preventDefault(); state.playing ? pause() : play(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) { e.preventDefault(); removeClip(state.selectedId); }
    else if (e.key === 'ArrowLeft') seekTo(state.time - (e.shiftKey ? 1 : 0.1));
    else if (e.key === 'ArrowRight') seekTo(state.time + (e.shiftKey ? 1 : 0.1));
    else if (e.key === 'Home') seekTo(0);
  });

  window.addEventListener('beforeunload', e => {
    if (state.clips.length) { e.preventDefault(); e.returnValue = ''; }
  });
}
function fixFirstTransition() {
  if (state.clips[0]) state.clips[0].transition = 'none';
}

/* ------------------------------------------------------------------ 시작 */
bind();
setCanvasSize();
syncProjectForm();
renderLibrary();
renderTimeline();
renderClipPanel();
// 캔버스에서 웹폰트를 쓰려면 미리 불러와야 합니다
if (document.fonts) {
  Promise.all(FONTS.flatMap(f => [document.fonts.load(`400 40px ${f.v}`, '가A'), document.fonts.load(`900 40px ${f.v}`, '가A')]))
    .catch(() => {}).finally(requestRender);
}
