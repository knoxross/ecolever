/* 영상뚝딱 — 자르기 · 이어붙이기 · 화면 위 자막 입력/끌어서 위치 · 화면 비율 · 전체 화면 · 원본 미리보기 */
'use strict';

/* ------------------------------------------------------------------ 자르기 */
function clipAtTime(t) {
  const lay = layout();
  if (!lay.length) return null;
  const i = indexAt(clamp(t, 0, totalDuration() - 1e-3), lay);
  return { L: lay[i], i, local: clamp(t - lay[i].start, 0, lay[i].clip.duration) };
}
/** 지금 위치에서 장면을 둘로 나눔. 반환: 뒤쪽 새 장면 또는 null */
function splitAt(t) {
  const hit = clipAtTime(t);
  if (!hit) throw new Error('자를 장면이 없습니다.');
  const { L, local } = hit, c = L.clip;
  if (local < 0.15 || local > c.duration - 0.15) throw new Error('장면의 맨 앞이나 맨 끝에서는 자를 수 없습니다. 재생 위치를 장면 가운데로 옮겨 주세요.');
  const b = Object.assign(stripClip(c), { id: uid(), transition: 'none', voiceId: '', voiceSrcId: '', narration: '' });
  b.duration = round2(c.duration - local);
  if (isVideoClip(c)) b.trimStart = round2(c.trimStart + local);
  c.duration = round2(local);
  state.clips.splice(state.clips.indexOf(c) + 1, 0, b);
  return b;
}
/** 지금 장면의 앞부분(장면 시작~지금 위치)을 잘라냄 */
function trimInAt(t) {
  const hit = clipAtTime(t);
  if (!hit) throw new Error('장면이 없습니다.');
  const { L, local } = hit, c = L.clip;
  if (local < 0.05) throw new Error('이미 장면의 시작입니다.');
  if (c.duration - local < 0.3) throw new Error('너무 짧아집니다. 재생 위치를 앞으로 옮겨 주세요.');
  if (isVideoClip(c)) c.trimStart = round2(c.trimStart + local);
  c.duration = round2(c.duration - local);
  return L.start;
}
/** 지금 장면의 뒷부분(지금 위치~장면 끝)을 잘라냄 */
function trimOutAt(t) {
  const hit = clipAtTime(t);
  if (!hit) throw new Error('장면이 없습니다.');
  const { L, local } = hit, c = L.clip;
  if (local < 0.3) throw new Error('너무 짧아집니다. 재생 위치를 뒤로 옮겨 주세요.');
  c.duration = round2(local);
  return L.start + local;
}

/* ------------------------------------------------------------------ 이어붙이기 */
/** 동영상들을 고른 순서대로 타임라인 끝에 이어붙임. smooth: 겹쳐서 부드럽게 */
async function joinVideos(files, smooth, onProgress) {
  const { added, failed } = await loadFiles(files, onProgress);
  const vids = added.filter(m => m.type === 'video' || m.type === 'image');
  if (!vids.length) return { count: 0, failed };
  const empty = !state.clips.length;
  if (empty) { setOrigAspect(vids[0]); setCanvasSize(); }
  vids.forEach((m, k) => {
    const c = clipFromMedia(m, { motion: m.type === 'video' ? 'none' : 'zoomIn' });
    c.transition = state.clips.length === 0 ? 'none' : smooth ? 'fade' : 'none';
    c.transDur = 0.5;
    // 비율이 다른 영상은 잘리지 않게 전체 보이기 + 흐린 배경
    const mismatch = (m.w / m.h) / (canvas.width / canvas.height);
    c.fit = mismatch > 1.15 || mismatch < 1 / 1.15 ? 'blur' : 'cover';
    state.clips.push(c);
  });
  return { count: vids.length, failed };
}

/* ------------------------------------------------------------------ 화면 비율 */
function gcd(a, b) { return b ? gcd(b, a % b) : a; }
/** 원본 영상(또는 사진) 비율로 */
function setOrigAspect(m) {
  m = m || state.clips.map(clipMedia).find(Boolean) || state.media.find(x => x.type === 'video' || x.type === 'image');
  if (!m || !m.w || !m.h) throw new Error('먼저 영상이나 사진을 넣어 주세요.');
  const g = gcd(m.w, m.h);
  let a = m.w / g, b = m.h / g;
  if (a > 100 || b > 100) { a = Math.round(m.w / m.h * 1000); b = 1000; } // 단순하지 않은 비율
  S.aspect = `${a}:${b}`;
  return S.aspect;
}

/* ------------------------------------------------------------------ 화면 위 자막 입력 · 끌어서 위치 */
let subEditId = null;
/** 지금 화면에 보이는 자막의 캔버스 위 위치(화면 좌표) */
function subScreenRect(sb) {
  const r = canvas.getBoundingClientRect(), box = $('#stageBox').getBoundingClientRect();
  const st = subStyle();
  const pos = subCenter(sb, st);
  return { x: r.left - box.left + pos.x * r.width, y: r.top - box.top + pos.y * r.height };
}
/** 자막 중심 위치(0~1) — 직접 옮긴 위치가 있으면 그것, 없으면 스타일 위치 */
function subCenter(sb, st) {
  if (sb && sb.x != null && sb.y != null) return { x: sb.x, y: sb.y };
  const portrait = canvas.height > canvas.width * 1.4;
  const y = st.pos === 'top' ? (portrait ? 0.17 : 0.12) : st.pos === 'middle' ? 0.5 : (portrait ? 0.74 : 0.86);
  return { x: 0.5, y };
}
function openStageSubEditor(sb) {
  pause();
  subEditId = sb.id;
  const ed = $('#stageSubEdit'), ta = $('#stageSubText');
  if (ed.parentElement !== $('#stageBox')) $('#stageBox').appendChild(ed);
  const p = subScreenRect(sb);
  ed.style.left = p.x + 'px'; ed.style.top = p.y + 'px';
  ed.hidden = false;
  ta.value = sb.text || '';
  ta.focus(); ta.select();
}
function closeStageSubEditor(commitIt) {
  const ed = $('#stageSubEdit');
  if (ed.hidden) return;
  ed.hidden = true;
  const sb = state.subs.find(x => x.id === subEditId);
  subEditId = null;
  if (!sb) return;
  if (!commitIt) { if (!(sb.text || '').trim() && sb._new) state.subs = state.subs.filter(x => x !== sb); }
  else if (!(sb.text || '').trim()) state.subs = state.subs.filter(x => x !== sb);
  delete sb._new;
  changed(); renderSubsPanel(); renderTimeline(); requestRender();
}
function bindStageSubs() {
  const ta = $('#stageSubText');
  ta.addEventListener('input', () => { const sb = state.subs.find(x => x.id === subEditId); if (sb) { sb.text = ta.value; preloadSubs(); requestRender(); } });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); closeStageSubEditor(true); toast('자막을 넣었습니다. 화면의 자막을 끌어서 위치를 옮길 수 있어요.'); }
    else if (e.key === 'Escape') { e.preventDefault(); closeStageSubEditor(false); }
  });
  ta.addEventListener('blur', () => setTimeout(() => closeStageSubEditor(true), 120));

  // 화면의 자막을 끌어서 위치 옮기기 · 두 번 눌러 고치기
  const cv = $('#stage');
  const toNorm = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
  const hitSub = e => {
    const sb = subAt(state.time);
    if (!sb || !(sb.text || '').trim()) return null;
    const p = toNorm(e), c = subCenter(sb, subStyle());
    const sz = subStyle().size * Math.min(canvas.width, canvas.height) / 1080 / canvas.height;
    return Math.abs(p.y - c.y) < Math.max(0.06, sz * 1.6) && Math.abs(p.x - c.x) < 0.45 ? sb : null;
  };
  let drag = null;
  cv.addEventListener('pointermove', e => {
    if (drag) {
      const p = toNorm(e);
      drag.sb.x = round2(clamp(p.x - drag.dx, 0.12, 0.88));
      drag.sb.y = round2(clamp(p.y - drag.dy, 0.06, 0.94));
      requestRender();
      return;
    }
    cv.classList.toggle('sub-hover', !!hitSub(e));
  });
  cv.addEventListener('pointerdown', e => {
    const sb = hitSub(e);
    if (!sb) return;
    pause();
    const p = toNorm(e), c = subCenter(sb, subStyle());
    drag = { sb, dx: p.x - c.x, dy: p.y - c.y, moved: false };
    if (sb.x == null) { sb.x = c.x; sb.y = c.y; }
    cv.setPointerCapture(e.pointerId);
    cv.classList.add('dragging-sub');
    selSubId = sb.id;
  });
  const end = () => {
    if (!drag) return;
    drag = null;
    cv.classList.remove('dragging-sub');
    changed(); renderSubsPanel(); renderTimeline();
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('dblclick', e => {
    const sb = hitSub(e) || subAt(state.time);
    if (sb) openStageSubEditor(sb); else addSubOnStage();
  });
}
/** 지금 위치에 자막을 만들고 화면 위에서 바로 입력 */
function addSubOnStage() {
  const total = totalDuration();
  if (!total) { toast('먼저 사진·영상을 넣어 장면을 만들어 주세요.', true); return; }
  let start = state.time;
  const cur = subAt(start);
  if (cur) { openStageSubEditor(cur); return; }
  if (start >= total - 0.3) start = Math.max(0, total - 2.5);
  const next = state.subs.find(x => x.start > start);
  const end = Math.min(total, start + 2.5, next ? next.start : Infinity);
  const sb = addSub(start, Math.max(end, start + 0.4), '');
  sb._new = true;
  selSubId = sb.id;
  seekTo(start + 0.01);
  renderSubsPanel(); renderTimeline();
  setTimeout(() => openStageSubEditor(sb), 30);
}

/* ------------------------------------------------------------------ 전체 화면 */
function toggleFullscreen() {
  const el = $('.stage-wrap');
  if (document.fullscreenElement) document.exitFullscreen();
  else el.requestFullscreen?.().catch(() => toast('전체 화면을 열 수 없습니다.', true));
}

/* ------------------------------------------------------------------ 원본 영상 미리보기 */
let srcMediaId = null;
function openSourcePreview(m) {
  srcMediaId = m.id;
  $('#srcTitle').textContent = `원본: ${m.name}`;
  const v = $('#srcVideo');
  v.src = m.url;
  $('#srcInfo').textContent = `${m.w}×${m.h} · ${fmt(m.duration)} · ${(m.file.size / 1e6).toFixed(1)}MB`;
  openModal('#srcModal');
  v.play().catch(() => {});
}
