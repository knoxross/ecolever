/* 영상뚝딱 — 캡컷식 왼쪽 자료실 (미디어 · 오디오 · 글자 · 스티커 · 효과 · 전환 · 필터 · 조정) */
'use strict';

const TEXT_PRESETS = [
  { name: '유튜브 노란 자막', tpl: 'youtube', font: "'Black Han Sans'", color: '#ffe14d', pv: 'color:#ffe14d;-webkit-text-stroke:1px #000' },
  { name: '예능 분홍', tpl: 'variety', font: "'Black Han Sans'", color: '#ffffff', pv: 'color:#fff;-webkit-text-stroke:1px #ff3d7f' },
  { name: '뉴스 하단 막대', tpl: 'news', font: "'Noto Sans KR'", color: '#ffffff', pv: 'color:#fff;background:#0c224e;padding:2px 6px;border-left:3px solid #ffcc00' },
  { name: '네온', tpl: 'neon', font: "'Black Han Sans'", color: '#eaffff', pv: 'color:#eaffff;text-shadow:0 0 6px #33f6ff,0 0 12px #33f6ff' },
  { name: '말풍선', tpl: 'bubble', font: "'Jua'", color: '#151515', pv: 'color:#111;background:#fff;border-radius:10px;padding:2px 8px' },
  { name: '영화 자막', tpl: 'cinema', font: "'Gowun Batang'", color: '#ffffff', pv: "color:#fff;font-family:'Gowun Batang';text-shadow:0 1px 3px #000" },
  { name: '굵은 흰 글씨', tpl: 'basic', font: "'Black Han Sans'", color: '#ffffff', pv: 'color:#fff;-webkit-text-stroke:1px #000' },
  { name: '귀여운 손글씨', tpl: 'basic', font: "'Jua'", color: '#ffd0e0', pv: "color:#ffd0e0;font-family:'Jua';-webkit-text-stroke:1px #000" },
  { name: '고급 금색', tpl: 'cinema', font: "'Gowun Batang'", color: '#f1d38a', pv: "color:#f1d38a;font-family:'Gowun Batang'" },
  { name: '빨간 강조', tpl: 'basic', font: "'Black Han Sans'", color: '#ff4b3e', pv: 'color:#ff4b3e;-webkit-text-stroke:1px #000' },
  { name: '할인 배지', tpl: 'bubble', font: "'Black Han Sans'", color: '#d62828', pv: 'color:#d62828;background:#fff;border-radius:10px;padding:2px 8px' },
  { name: '깔끔 고딕', tpl: 'basic', font: "'Noto Sans KR'", color: '#ffffff', pv: "color:#fff;font-family:'Noto Sans KR'" },
];
let assetTab = 'media';

/* 선택된 장면 (없으면 지금 위치의 장면) */
function targetClip() {
  return clipById(state.selectedId) || (state.clips.length ? clipAtTime(state.time)?.L.clip : null);
}
function targetLabel(c) {
  if (!c) return '장면을 먼저 만들어 주세요.';
  const i = state.clips.indexOf(c) + 1;
  const m = clipMedia(c);
  return `적용할 장면: <b>${i}번</b> ${esc(c.kind === 'text' ? '글자 화면' : m?.name || '')} <span class="muted">(타임라인에서 장면을 눌러 바꾸기)</span>`;
}

function showAssetTab(a) {
  assetTab = a;
  $$('#assetTabs button').forEach(b => b.classList.toggle('on', b.dataset.a === a));
  $$('#libraryPanel .asset-body').forEach(el => { el.hidden = el.dataset.a !== a; });
  renderAssets();
}
function renderAssets() {
  const c = targetClip();
  $$('#libraryPanel [data-target]').forEach(el => { el.innerHTML = targetLabel(c); });
  if (assetTab === 'audio') {
    const music = state.media.filter(m => m.type === 'audio' && m.role !== 'sfx');
    $('#aMusic').innerHTML = music.length ? music.map(m => `<div class="a-row${S.bgmId === m.id ? ' on' : ''}" data-mid="${m.id}"><span>${m.role === 'voice' ? '🎙' : '🎵'}</span><span class="nm">${esc(m.name)} <small class="muted">${fmt(m.duration)}${m.beat ? ' · ' + m.beat.bpm + 'BPM' : ''}</small></span><button data-am="listen" title="듣기">▶</button><button data-am="bgm" title="배경음악으로">${S.bgmId === m.id ? '✔' : '＋'}</button></div>`).join('')
      : '<p class="muted small">📁 가져오기로 음악 파일을 넣으면 여기 나옵니다.</p>';
    $('#aSfx').innerHTML = SFX_LIST.map(s => `<div class="a-row" data-sfx="${s.v}"><span>🔊</span><span class="nm">${s.label}</span><button data-as="play" title="듣기">▶</button><button data-as="add" title="지금 위치에 넣기">＋</button></div>`).join('');
  } else if (assetTab === 'text') {
    $('#aText').innerHTML = TEXT_PRESETS.map((p, i) => `<div class="card txt" data-tp="${i}"><span class="pv" style="${p.pv};font-family:${p.font}">가나다</span><span>${p.name}</span></div>`).join('');
  } else if (assetTab === 'sticker') {
    $('#aSticker').innerHTML = STICKERS.map(s => `<button data-st="${s}">${s}</button>`).join('');
  } else if (assetTab === 'fx') {
    $('#aFx').innerHTML = EFFECTS.map(f => `<div class="card${c && (c.fx || '') === f.v ? ' on' : ''}" data-fx="${f.v}"><span class="ic">${f.icon}</span>${f.label}</div>`).join('');
    $('#aFxAmt').value = c?.fxAmt ?? 0.6; $('#aFxAmtOut').textContent = Math.round((c?.fxAmt ?? 0.6) * 100) + '%';
  } else if (assetTab === 'trans') {
    $('#aTrans').innerHTML = TRANSITIONS.map(t => `<div class="card${c && c.transition === t.v ? ' on' : ''}" data-tr="${t.v}"><span class="ic">${t.icon || '⏭'}</span>${t.label.split(' (')[0]}</div>`).join('');
    $('#aTransDur').value = c?.transDur ?? 0.6; $('#aTransDurOut').textContent = (c?.transDur ?? 0.6).toFixed(1) + '초';
  } else if (assetTab === 'filter') {
    const thumbs = filterThumbs(c);
    $('#aFilter').innerHTML = FILTERS.map(f => `<div class="card${c && (c.filter || '') === (f.v === 'none' ? '' : f.v) ? ' on' : ''}" data-flt="${f.v}"><img src="${thumbs[f.v] || ''}" alt=""><span>${f.label}</span></div>`).join('');
    $('#aFilterAmt').value = c?.filterAmt ?? 1; $('#aFilterAmtOut').textContent = Math.round((c?.filterAmt ?? 1) * 100) + '%';
  } else if (assetTab === 'adjust') {
    const a = (c && c.adj) || {};
    $('#aAdjust').innerHTML = ADJUST_KEYS.map(k => `<div class="adj-row"><label>${k.label}<output>${Math.round((a[k.k] || 0) * 100)}</output></label><input type="range" data-adj="${k.k}" min="${k.min}" max="${k.max}" step="0.02" value="${a[k.k] || 0}"></div>`).join('');
  }
}
/** 필터 미리보기 그림 (선택 장면의 한 장면에 필터를 입혀서) */
function filterThumbs(c) {
  const out = {};
  const m = c ? clipMedia(c) : null;
  let src = null, sw = 0, sh = 0;
  if (m && m.type === 'image') { src = m.el; sw = m.w; sh = m.h; }
  else if (m && m.type === 'video' && c._video && c._video.readyState >= 2) { src = c._video; sw = src.videoWidth; sh = src.videoHeight; }
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 80;
  const g = cv.getContext('2d');
  for (const f of FILTERS) {
    g.filter = 'none'; g.fillStyle = '#333'; g.fillRect(0, 0, 128, 80);
    g.filter = f.css;
    if (src) { const s = Math.max(128 / sw, 80 / sh); g.drawImage(src, (128 - sw * s) / 2, (80 - sh * s) / 2, sw * s, sh * s); }
    else { const gr = g.createLinearGradient(0, 0, 128, 80); gr.addColorStop(0, '#f2a65a'); gr.addColorStop(1, '#3a7bd5'); g.fillStyle = gr; g.fillRect(0, 0, 128, 80); }
    out[f.v] = cv.toDataURL('image/jpeg', 0.7);
  }
  return out;
}
function applyToClip(fn, msg) {
  const c = targetClip();
  if (!c) { toast('먼저 장면을 만들어 주세요.', true); return; }
  fn(c);
  changed(400); renderAssets(); renderTimelineSoon(); renderClipPanel(); requestRender();
  if (msg) toast(msg);
}

/* 🎼 음악 만들기 */
function musicOpts() {
  const lenSel = $('#mmLen').value;
  const total = totalDuration();
  return {
    style: $('#mmStyle').value, meter: $('#mmMeter').value, bpm: +$('#mmBpm').value, key: +$('#mmKey').value,
    seconds: lenSel === 'auto' ? Math.max(10, total || 30) : +lenSel, seed: Math.max(1, +$('#mmSeed').value || 1),
    drums: $('#mmDrums').checked, bass: $('#mmBass').checked, chords: $('#mmChords').checked, melody: $('#mmMelody').checked,
  };
}
function updateMusicInfo() {
  const o = musicOpts(), T = musicTiming(o);
  $('#mmBpmOut').textContent = o.bpm + ' BPM';
  $('#mmInfo').textContent = `한 마디 ${T.bar.toFixed(2)}초 · ${T.M.beats}박 (${T.M.compound ? '한 박을 셋으로' : '한 박을 둘로'} 나눔) · 약 ${fmt(o.seconds)} — 직접 만든 음악이라 저작권 걱정 없이 쓸 수 있어요.`;
}
function bindMusicMaker() {
  $('#mmStyle').innerHTML = MUSIC_STYLES.map(s => `<option value="${s.v}">${s.label}</option>`).join('');
  $('#mmMeter').innerHTML = METERS.map(m => `<option value="${m.v}"${m.v === '4/4' ? ' selected' : ''}>${m.label}</option>`).join('');
  $('#mmKey').innerHTML = MUSIC_KEYS.map(([n, v]) => `<option value="${v}">${n}</option>`).join('');
  $('#mmStyle').addEventListener('change', () => { const st = MUSIC_STYLES.find(s => s.v === $('#mmStyle').value); $('#mmBpm').value = st.bpm; if (st.v === 'cute') $('#mmMeter').value = '2/4'; updateMusicInfo(); });
  for (const id of ['#mmMeter', '#mmBpm', '#mmKey', '#mmLen', '#mmSeed']) $(id).addEventListener('input', updateMusicInfo);
  $('#mmNew').addEventListener('click', () => { $('#mmSeed').value = 1 + Math.floor(Math.random() * 99998); updateMusicInfo(); toast('새 곡 번호를 골랐습니다. ▶ 미리 듣기로 들어 보세요'); });
  let busyMM = false;
  $('#mmPreview').addEventListener('click', async () => {
    if (busyMM) return; busyMM = true;
    const b = $('#mmPreview'); b.textContent = '⏳ 작곡 중…';
    try { if (listenSrc) listen(null); listen(await composeMusic({ ...musicOpts(), preview: true })); }
    catch (e) { toast('음악을 만들지 못했습니다: ' + e.message, true); }
    finally { busyMM = false; b.textContent = '▶ 미리 듣기'; }
  });
  $('#mmMake').addEventListener('click', async () => {
    if (busyMM) return; busyMM = true;
    const b = $('#mmMake'); b.textContent = '⏳ 작곡 중…';
    try {
      if (listenSrc) listen(null);
      const m = await addComposedMusic(musicOpts());
      changed(); refreshAll();
      toast(`🎼 음악을 만들어 배경음악으로 넣었습니다 (${m.beat.bpm}BPM · ${$('#mmMeter').value}박자 · ${fmt(m.duration)})`);
    } catch (e) { toast('음악을 만들지 못했습니다: ' + e.message, true); }
    finally { busyMM = false; b.textContent = '🎼 만들어서 배경음악으로'; }
  });
  updateMusicInfo();
}
function bindAssets() {
  bindMusicMaker();
  $('#assetTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showAssetTab(b.dataset.a); });
  // 오디오
  $('#aMusic').addEventListener('click', e => {
    const row = e.target.closest('[data-mid]'), b = e.target.closest('[data-am]'); if (!row || !b) return;
    const m = mediaById(row.dataset.mid);
    if (b.dataset.am === 'listen') listen(m.buffer);
    else { S.bgmId = S.bgmId === m.id ? '' : m.id; S.bgmOffset = 0; changed(); refreshAll(); toast(S.bgmId ? '배경음악으로 정했습니다' : '배경음악을 뺐습니다'); }
  });
  $('#aSfx').addEventListener('click', async e => {
    const row = e.target.closest('[data-sfx]'), b = e.target.closest('[data-as]'); if (!row || !b) return;
    if (b.dataset.as === 'play') { previewSfx(row.dataset.sfx); return; }
    if (!totalDuration()) { toast('먼저 장면을 만들어 주세요.', true); return; }
    await addSfxAt(row.dataset.sfx, state.time);
    changed(); renderTimeline(); renderLibrary();
    toast(`🔊 ${fmt(state.time)} 위치에 효과음을 넣었습니다 (타임라인 소리 줄에서 끌어 옮기기)`);
  });
  // 글자
  $('#aText').addEventListener('click', e => {
    const card = e.target.closest('[data-tp]'); if (!card) return;
    if (!totalDuration()) { toast('먼저 장면을 만들어 주세요.', true); return; }
    const p = TEXT_PRESETS[+card.dataset.tp];
    const t = prompt(`${p.name} — 넣을 글자 (*별표*로 강조)`, '오늘만 *특가*');
    if (!t) return;
    addOverlay({ type: 'text', text: t, w: 0.3, x: 0.5, y: 0.3, tpl: p.tpl, font: p.font, color: p.color, anim: 'pop' });
    document.fonts?.load(`${fontWeight(p.font)} 40px ${p.font}`, t).finally(requestRender);
    changed(); renderOverlayPanel(); renderTimeline(); requestRender();
    toast('화면에 글자를 올렸습니다. 끌어서 옮기고 휠로 크기를 바꾸세요.');
  });
  // 스티커
  $('#aSticker').addEventListener('click', e => {
    const b = e.target.closest('[data-st]'); if (!b) return;
    if (!totalDuration()) { toast('먼저 장면을 만들어 주세요.', true); return; }
    addOverlay({ type: 'sticker', text: b.dataset.st, w: 0.22, x: 0.75, y: 0.3, anim: 'pop' });
    document.fonts?.load(`40px 'Segoe UI Emoji'`, b.dataset.st).finally(requestRender);
    changed(); renderOverlayPanel(); renderTimeline(); requestRender();
  });
  // 효과
  $('#aFx').addEventListener('click', e => { const card = e.target.closest('[data-fx]'); if (!card) return; applyToClip(c => { c.fx = card.dataset.fx; }, card.dataset.fx ? `✨ 효과: ${EFFECTS.find(f => f.v === card.dataset.fx).label}` : '효과를 뺐습니다'); });
  $('#aFxAmt').addEventListener('input', e => { $('#aFxAmtOut').textContent = Math.round(e.target.value * 100) + '%'; const c = targetClip(); if (c) { c.fxAmt = +e.target.value; changed(400); requestRender(); } });
  // 전환
  $('#aTrans').addEventListener('click', e => {
    const card = e.target.closest('[data-tr]'); if (!card) return;
    applyToClip(c => {
      let t = c;
      if (state.clips.indexOf(c) === 0) t = state.clips[1]; // 첫 장면은 다음 장면에 적용
      if (!t) { toast('장면이 2개 이상 있어야 전환을 넣을 수 있습니다.', true); return; }
      t.transition = card.dataset.tr;
      const L = layout().find(l => l.clip === t);
      if (L && t.transition !== 'none') { seekTo(Math.max(0, L.start - 0.4)); play(); }
    }, `🔀 전환: ${TRANSITIONS.find(t => t.v === card.dataset.tr).label}`);
  });
  $('#aTransDur').addEventListener('input', e => { $('#aTransDurOut').textContent = (+e.target.value).toFixed(1) + '초'; const c = targetClip(); if (c) { c.transDur = +e.target.value; changed(400); } });
  $('#aTransAll').addEventListener('click', () => applyToClip(c => { const tr = state.clips.indexOf(c) === 0 && state.clips[1] ? state.clips[1].transition : c.transition; state.clips.forEach((x, i) => { if (i) { x.transition = tr; x.transDur = c.transDur; } }); }, '모든 장면에 같은 전환을 넣었습니다'));
  // 필터
  $('#aFilter').addEventListener('click', e => { const card = e.target.closest('[data-flt]'); if (!card) return; applyToClip(c => { c.filter = card.dataset.flt === 'none' ? 'none' : card.dataset.flt; if (c.filter === 'none') c.filter = ''; }, `🎨 필터: ${FILTERS.find(f => f.v === card.dataset.flt).label}`); });
  $('#aFilterAmt').addEventListener('input', e => { $('#aFilterAmtOut').textContent = Math.round(e.target.value * 100) + '%'; const c = targetClip(); if (c) { c.filterAmt = +e.target.value; changed(400); requestRender(); } });
  $('#aFilterAll').addEventListener('click', () => applyToClip(c => { state.clips.forEach(x => { if (x.kind === 'media') { x.filter = c.filter; x.filterAmt = c.filterAmt; } }); }, '모든 장면에 같은 필터를 넣었습니다'));
  // 조정
  $('#aAdjust').addEventListener('input', e => {
    const k = e.target.dataset.adj; if (!k) return;
    const c = targetClip(); if (!c) return;
    c.adj = Object.assign({}, c.adj, { [k]: +e.target.value });
    e.target.closest('.adj-row').querySelector('output').textContent = Math.round(e.target.value * 100);
    changed(400); requestRender();
  });
  $('#aAdjReset').addEventListener('click', () => applyToClip(c => { c.adj = null; }, '조정을 초기화했습니다'));
  $('#aAdjAll').addEventListener('click', () => applyToClip(c => { state.clips.forEach(x => { if (x.kind === 'media') x.adj = c.adj ? { ...c.adj } : null; }); }, '모든 장면에 같은 조정을 넣었습니다'));

  // 미리보기 화면에서 장면 끌어 옮기기 · 휠로 크기 (겹치기·자막이 아닌 곳)
  const cv = $('#stage');
  let drag = null;
  cv.addEventListener('pointerdown', e => {
    if (cv.classList.contains('dragging-sub') || e.button !== 0) return;
    const hit = clipAtTime(state.time); if (!hit || hit.L.clip.kind !== 'media') return;
    if (!e.altKey && !($('#clipTab') && !$('#clipTab').hidden && $('#tfSection'))) return; // 장면 편집(변형)이 열려 있을 때만, 또는 Alt
    const c = hit.L.clip, r = cv.getBoundingClientRect(), T = clipTransformAt(c, hit.local);
    pause();
    drag = { c, local: hit.local, sx: e.clientX, sy: e.clientY, x0: T.x, y0: T.y, w: r.width, h: r.height };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    const x = round2(drag.x0 + (e.clientX - drag.sx) / drag.w), y = round2(drag.y0 + (e.clientY - drag.sy) / drag.h);
    setTransformValues(drag.c, drag.local, { x, y });
    requestRender();
  });
  const end = () => { if (!drag) return; drag = null; changed(); renderClipPanel(); };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
}
/** 변형 값 바꾸기: 키프레임이 있으면 지금 위치에 키프레임, 없으면 장면 전체 값 */
function setTransformValues(c, local, v) {
  if (c.kf && c.kf.length) setKeyframe(c, local, v);
  else { if ('s' in v) c.tfS = v.s; if ('x' in v) c.tfX = v.x; if ('y' in v) c.tfY = v.y; if ('r' in v) c.tfR = v.r; if ('o' in v) c.tfO = v.o; }
}
