/* 영상뚝딱 — 화면 · 버튼 · 메뉴 연결 */
'use strict';

/* ================================================================== 공통 도우미 */
function toast(msg, isErr = false, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('err', !!isErr);
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), isErr ? Math.max(ms, 5000) : ms);
}
function openModal(id) { $(id).hidden = false; }
function closeModal(id) { $(id).hidden = true; }

/** 진행 창. 반환: { set(pct|null, text), signal, abort, close() } */
function busy(title, note = '', { cancellable = true } = {}) {
  const ctl = new AbortController();
  const sig = { cancelled: false };
  ctl.signal.addEventListener('abort', () => { sig.cancelled = true; });
  $('#busyTitle').textContent = title;
  $('#busyNote').textContent = note;
  $('#busyPct').textContent = '';
  $('#resultBox').hidden = true;
  $('#resultSaveBtn').hidden = true;
  $('#resultShowBtn').hidden = true;
  $('#resultPubBtn').hidden = true;
  const btn = $('#busyCancel');
  btn.hidden = !cancellable;
  btn.textContent = '취소';
  btn.onclick = () => ctl.abort();
  const bar = $('#busyBar'), prog = bar.parentElement;
  prog.hidden = false;
  prog.classList.add('indeterminate'); bar.style.width = '';
  openModal('#busyModal');
  return {
    signal: ctl.signal, flag: sig, abort: () => ctl.abort(),
    set(pct, text) {
      if (pct == null) { prog.classList.add('indeterminate'); bar.style.width = ''; }
      else { prog.classList.remove('indeterminate'); bar.style.width = Math.round(clamp(pct, 0, 1) * 100) + '%'; }
      if (text != null) $('#busyPct').textContent = text;
    },
    close() { closeModal('#busyModal'); },
  };
}

/* ================================================================== 상태 변경 후 공통 처리 */
let dirty = false;
function changed(debounce = 0) {
  commit(debounce);
  if (!dirty && state.clips.length) { dirty = true; Platform.setDirty(true); }
}
function refreshAll() {
  setCanvasSize();
  renderLibrary(); renderTimeline(); renderClipPanel(); syncProjectForm(); updateEmpty();
  preloadText().then(requestRender);
  requestRender();
}
function updateEmpty() { $('#stageEmpty').hidden = state.clips.length > 0; }

/* ================================================================== 가져오기 */
async function importFiles(files, { toTimeline = true } = {}) {
  files = [...files];
  if (!files.length) return [];
  const projFile = files.find(f => /\.ttuk$/i.test(f.name));
  if (projFile) { await openProject(projFile); return []; }
  pause();
  const b = files.length > 1 || files.some(f => f.size > 30e6) ? busy('파일을 불러오는 중…', '', { cancellable: false }) : null;
  const { added, failed } = await loadFiles(files, (i, n, name) => b?.set(i / n, `${i + 1} / ${n} · ${name}`));
  b?.close();
  for (const m of added) {
    if (m.type === 'audio' && !S.bgmId && m.role !== 'voice') S.bgmId = m.id;
    if (m.type === 'image' && /logo|로고/i.test(m.name) && !S.logoId) { S.logoId = m.id; continue; }
    if (toTimeline && m.type !== 'audio') {
      const c = clipFromMedia(m);
      if (!state.clips.length) c.transition = 'none';
      state.clips.push(c);
    }
  }
  if (failed.length) toast(`열 수 없는 파일: ${failed.join(', ')}`, true);
  else if (added.length) toast(`${added.length}개 파일을 넣었습니다. 위 칸에 원하는 영상을 적고 ✨ 자동으로 만들기를 눌러 보세요.`, false, 4000);
  if (!state.selectedId && state.clips[0]) state.selectedId = state.clips[0].id;
  changed();
  refreshAll();
  return added;
}
async function doImport() {
  if (Platform.kind === 'desktop') {
    const files = await Platform.pickFiles();
    if (files && files.length) importFiles(files);
  } else $('#fileInput').click();
}

/* ================================================================== 미디어 목록 */
function renderLibrary() {
  const list = $('#libList');
  $('#libCount').textContent = state.media.length ? `(${state.media.length})` : '';
  const usedIds = new Set(state.clips.flatMap(c => [c.mediaId, c.voiceId]));
  list.innerHTML = state.media.map(m => {
    const voice = m.role === 'voice';
    const icon = m.type === 'audio' ? (voice ? '🎙' : '🎵') : '';
    const badge = m.type === 'image' ? '사진' : m.type === 'video' ? '영상' : voice ? '목소리' : '음악';
    const extra = m.type === 'image' ? `${m.w}×${m.h}` : fmt(m.duration) + (m.beat && !voice ? ` · ${m.beat.bpm}BPM` : '');
    const tags = (S.bgmId === m.id ? ' · 배경음악' : '') + (S.logoId === m.id ? ' · 로고' : '');
    const acts = [];
    if (m.type !== 'audio') acts.push(`<button data-act="add" title="타임라인 끝에 추가">＋</button>`);
    if (m.type === 'audio') acts.push(`<button data-act="bgm" title="배경음악으로 사용">🎵</button>`);
    if (m.type === 'audio') acts.push(`<button data-act="listen" title="듣기">▶</button>`);
    if (m.type === 'image') acts.push(`<button data-act="logo" title="로고(워터마크)로 사용">🏷</button>`);
    acts.push(`<button data-act="del" title="삭제">✕</button>`);
    return `<div class="lib-item${S.bgmId === m.id ? ' is-bgm' : ''}${usedIds.has(m.id) ? ' used' : ''}" draggable="${m.type !== 'audio'}" data-id="${m.id}" tabindex="0">
      <div class="thumb" style="${m.thumb ? `background-image:url('${m.thumb}')` : ''}">${icon}</div>
      <span class="badge">${badge}</span>
      <div class="lib-actions">${acts.join('')}</div>
      <div class="meta">${esc(m.name)}<small>${extra}${tags}</small></div>
    </div>`;
  }).join('');
}
let listenSrc = null;
function listen(buffer) {
  ensureAudio();
  if (listenSrc) { try { listenSrc.stop(); } catch (e) { /* 무시 */ } listenSrc = null; return; }
  const s = audio.ctx.createBufferSource();
  s.buffer = buffer; s.connect(audio.master); s.start();
  s.onended = () => { if (listenSrc === s) listenSrc = null; };
  listenSrc = s;
}
function removeMedia(id) {
  const m = mediaById(id); if (!m) return;
  const used = state.clips.filter(c => c.mediaId === id);
  if (used.length && !confirm(`이 파일을 쓰는 장면 ${used.length}개도 함께 지워집니다. 계속할까요?`)) return;
  used.forEach(c => { disposeClip(c); state.clips.splice(state.clips.indexOf(c), 1); });
  state.clips.forEach(c => { if (c.voiceId === id) c.voiceId = ''; if (c.voiceSrcId === id) c.voiceSrcId = ''; });
  removeMediaData(m);
  if (!clipById(state.selectedId)) state.selectedId = state.clips[0]?.id || null;
  if (state.clips[0]) state.clips[0].transition = 'none';
  state.time = Math.min(state.time, totalDuration());
  changed(); refreshAll();
}

/* ================================================================== 타임라인 */
let pps = 70;
function renderTimeline() {
  const track = $('#track'), ruler = $('#ruler');
  const total = totalDuration();
  if (!state.clips.length) {
    track.innerHTML = '<div class="track-empty">아직 장면이 없습니다. 사진·영상을 넣거나 🎨 AI 생성으로 만들어 보세요.</div>';
  } else {
    track.innerHTML = state.clips.map((c, i) => {
      const m = clipMedia(c);
      const bg = c.kind === 'text'
        ? `background:${c.bgColor2 ? `linear-gradient(135deg,${c.bgColor},${c.bgColor2})` : c.bgColor}`
        : m?.thumb ? `background-image:url('${m.thumb}')` : '';
      const title = c.kind === 'text' ? '글자 화면' : m ? esc(m.name) : '?';
      const ti = TRANSITIONS.find(t => t.v === c.transition);
      const trans = i > 0 && c.transition !== 'none' ? `<span class="c-trans" title="전환: ${ti?.label}">${ti?.icon || ''}</span>` : '';
      const badges = [(c.text || '').trim() && c.kind !== 'text' ? '자막' : '', c.voiceId ? '🎙' : '', c.enhance ? '✨' : ''].filter(Boolean).join(' ');
      const inner = c.kind === 'text' ? `<span class="c-text" style="color:${c.textColor}">${esc((c.text || '').split('\n')[0] || ' ')}</span>` : '';
      return `<div class="clip${c.kind === 'text' ? ' textclip' : ''}${c.id === state.selectedId ? ' selected' : ''}" draggable="true" data-id="${c.id}"
        style="width:${Math.max(18, c.duration * pps)}px;${bg}" title="${title} · ${c.duration.toFixed(1)}초">
        ${trans}${badges ? `<span class="c-cap">${badges}</span>` : ''}${inner}<div class="c-label">${title}<b>${c.duration.toFixed(1)}초</b></div></div>`;
    }).join('');
  }
  const step = pps >= 100 ? 1 : pps >= 45 ? 2 : pps >= 25 ? 5 : 10;
  const end = Math.max(total, 10) + step;
  let html = '';
  for (let s = 0; s <= end; s += step) html += `<div class="tick" style="left:${s * pps}px">${fmtShort(s)}</div>`;
  const bgm = mediaById(S.bgmId);
  if (bgm && bgm.beat && pps >= 40) for (let t = 0; t <= total; t += bgm.beat.period) html += `<div class="beat" style="left:${t * pps}px"></div>`;
  ruler.innerHTML = html;
  // 소리 줄
  let aud = '';
  if (bgm && total > 0) aud += `<div class="bgm" style="left:0;width:${total * pps}px" title="배경음악">🎵 ${esc(bgm.name)}</div>`;
  for (const sg of voiceSegments()) aud += `<div class="bgm voice" style="left:${sg.start * pps}px;width:${Math.max(6, (sg.end - sg.start) * pps)}px" title="목소리">🎙</div>`;
  $('#audioTrack').innerHTML = aud;
  $('#tlInner').style.width = (end * pps + 60) + 'px';
  updateTimeUI();
}
let seekDragging = false;
function updateTimeUI() {
  const total = totalDuration();
  $('#curTime').textContent = fmt(state.time);
  $('#totTime').textContent = fmt(total);
  if (!seekDragging) $('#seek').value = total ? Math.round(state.time / total * 1000) : 0;
  $('#playhead').style.left = (14 + state.time * pps) + 'px';
  if (state.playing) {
    const tl = $('#timeline'), x = 14 + state.time * pps;
    if (x > tl.scrollLeft + tl.clientWidth - 40 || x < tl.scrollLeft) tl.scrollLeft = x - 60;
  }
}
function selectClip(id, seek = false) {
  state.selectedId = id;
  $$('#track .clip').forEach(el => el.classList.toggle('selected', el.dataset.id === id));
  renderClipPanel();
  showTab('clip');
  if (seek) {
    const lay = layout(), L = lay.find(l => l.clip.id === id);
    if (L && (state.time < L.start || state.time >= L.end)) seekTo(L.start + Math.min(transLen(L.clip, lay.indexOf(L)) + 0.4, L.clip.duration / 2));
  }
}
function addClipAt(m, index = state.clips.length) {
  const c = clipFromMedia(m);
  if (index === 0) { c.transition = 'none'; if (state.clips[0]) state.clips[0].transition = 'fade'; }
  state.clips.splice(index, 0, c);
  state.selectedId = c.id;
  changed(); refreshAll();
}
function addTextClip() {
  const portrait = canvas.height > canvas.width;
  const c = newClip('text', { text: '제목을 입력하세요', sub: '', textPos: 'center', fontSize: portrait ? 118 : 128, font: FONTS[1].v, textBg: false, textAnim: 'pop', duration: 2.5, bgColor: '#2f4332', bgColor2: '#4f7353' });
  const sel = clipById(state.selectedId);
  const idx = sel ? state.clips.indexOf(sel) + 1 : state.clips.length;
  if (idx === 0) c.transition = 'none';
  state.clips.splice(idx, 0, c);
  state.selectedId = c.id;
  changed(); refreshAll();
  seekTo(layout()[idx].start + 0.8);
  setTimeout(() => { const ta = $('#clipTab textarea[data-k="text"]'); if (ta) { ta.focus(); ta.select(); } }, 30);
}
function removeClip(id) {
  const i = state.clips.findIndex(c => c.id === id);
  if (i < 0) return;
  const [c] = state.clips.splice(i, 1);
  disposeClip(c);
  if (state.clips[0]) state.clips[0].transition = 'none';
  state.selectedId = state.clips[Math.min(i, state.clips.length - 1)]?.id || null;
  state.time = Math.min(state.time, totalDuration());
  changed(); refreshAll();
}
function duplicateClip(id) {
  const c = clipById(id); if (!c) return;
  const copy = Object.assign(stripClip(c), { id: uid() });
  if (copy.transition === 'none') copy.transition = 'fade';
  state.clips.splice(state.clips.indexOf(c) + 1, 0, copy);
  state.selectedId = copy.id;
  changed(); refreshAll();
}
function moveClip(id, dir) {
  const i = state.clips.findIndex(c => c.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= state.clips.length) return;
  [state.clips[i], state.clips[j]] = [state.clips[j], state.clips[i]];
  fixFirst();
  changed(); refreshAll();
}
function fixFirst() {
  state.clips.forEach((c, i) => { if (i > 0 && c.transition === 'none' && c._wasFirst) c.transition = 'fade'; delete c._wasFirst; });
  if (state.clips[0]) { if (state.clips[0].transition !== 'none') state.clips[0]._wasFirst = true; state.clips[0].transition = 'none'; }
}

/* ================================================================== 장면 편집 */
const opt = (list, cur) => list.map(o => `<option value="${esc(o.v)}"${String(o.v) === String(cur) ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
function renderClipPanel() {
  const box = $('#clipTab');
  const c = clipById(state.selectedId);
  if (!c) { box.innerHTML = '<p class="empty">타임라인에서 장면을 누르면<br>여기서 자막·길이·효과·목소리를 바꿀 수 있어요.</p>'; return; }
  const m = clipMedia(c);
  const isVid = m?.type === 'video';
  const idx = state.clips.indexOf(c);
  const maxDur = isVid ? round1(m.duration - c.trimStart) : 120;
  const voice = c.voiceId ? mediaById(c.voiceId) : null;
  const tone = c.voiceTone || { mode: 'none' };
  box.innerHTML = `
    <div class="clip-head">
      <div class="thumb" style="${c.kind === 'text' ? `background:${c.bgColor}` : m?.thumb ? `background-image:url('${m.thumb}')` : ''}"></div>
      <div><b>${c.kind === 'text' ? '글자 화면' : esc(m?.name || '')}</b><small class="muted">${idx + 1}번째 장면 · ${fmt(layout()[idx]?.start)}부터</small></div>
    </div>
    <div class="row2">
      <div class="field"><label>길이(초)</label><input type="number" data-k="duration" min="0.3" max="${maxDur}" step="0.1" value="${c.duration}"></div>
      ${isVid ? `<div class="field"><label>시작 지점(초)</label><input type="number" data-k="trimStart" min="0" max="${round1(m.duration - 0.3)}" step="0.1" value="${c.trimStart}"></div>` : ''}
    </div>
    ${isVid ? `<div class="field"><label>원본 소리 <output>${Math.round(c.volume * 100)}%</output></label><input type="range" data-k="volume" min="0" max="1.5" step="0.01" value="${c.volume}"></div>` : ''}
    ${c.kind === 'media' ? `
      <div class="row2">
        <div class="field"><label>화면 맞춤</label>
          <select data-k="fit">${opt([{ v: 'cover', label: '꽉 채우기' }, { v: 'contain', label: '전체 보이기' }, { v: 'blur', label: '전체 + 흐린 배경' }], c.fit)}</select></div>
        <div class="field"><label>움직임</label><select data-k="motion">${opt(MOTIONS, c.motion)}</select></div>
      </div>
      <div class="field"><label>✨ 화질 향상 (밝기·선명도·노이즈) <output>${Math.round(c.enhance * 100)}%</output></label><input type="range" data-k="enhance" min="0" max="1" step="0.05" value="${c.enhance}"></div>` :
      `<div class="row2">
        <div class="field"><label>배경색</label><input type="color" data-k="bgColor" value="${c.bgColor}"></div>
        <div class="field"><label>그라데이션 색</label><input type="color" data-k="bgColor2" value="${c.bgColor2 || c.bgColor}"></div>
      </div>`}
    <hr>
    <div class="sec-title">전환 효과 <small class="muted">(앞 장면 → 이 장면, 겹쳐서 부드럽게)</small></div>
    ${idx === 0 ? '<p class="muted small" style="margin-bottom:10px">첫 장면에는 전환 효과가 없습니다.</p>' : `
    <div class="row2">
      <div class="field"><label>효과</label><select data-k="transition">${opt(TRANSITIONS, c.transition)}</select></div>
      <div class="field"><label>전환 시간(초)</label><input type="number" data-k="transDur" min="0.1" max="3" step="0.1" value="${c.transDur}"></div>
    </div>`}
    <hr>
    <div class="sec-title">${c.kind === 'text' ? '글자' : '자막'}</div>
    <div class="field"><textarea data-k="text" placeholder="${c.kind === 'text' ? '큰 제목' : '자막 (Enter 로 줄바꿈)'}">${esc(c.text)}</textarea></div>
    ${c.kind === 'text' ? `<div class="field"><label>작은 글씨 (부제목·연락처)</label><textarea data-k="sub" rows="2">${esc(c.sub)}</textarea></div>` : ''}
    <div class="row2">
      <div class="field"><label>글꼴</label><select data-k="font">${opt(FONTS, c.font)}</select></div>
      <div class="field"><label>글자 색</label><input type="color" data-k="textColor" value="${c.textColor}"></div>
    </div>
    <div class="field"><label>글자 크기 <output>${c.fontSize}</output></label><input type="range" data-k="fontSize" min="24" max="220" step="2" value="${c.fontSize}"></div>
    <div class="row2">
      <div class="field"><label>위치</label><select data-k="textPos">${opt([{ v: 'top', label: '위' }, { v: 'center', label: '가운데' }, { v: 'bottom', label: '아래' }], c.textPos)}</select></div>
      <div class="field"><label>나타나기</label><select data-k="textAnim">${opt(TEXT_ANIMS, c.textAnim)}</select></div>
    </div>
    <label class="check"><input type="checkbox" data-k="textBg"${c.textBg ? ' checked' : ''}> 반투명 배경 상자</label>
    <hr>
    <div class="sec-title">🎙 목소리 (내레이션)</div>
    <div class="voice-box">
      ${voice ? `<div class="now">🎙 <b>${esc(voice.name)}</b> · ${voice.duration.toFixed(1)}초
        <button class="btn btn-sm" data-cmd="voicePlay">▶ 듣기</button>
        <button class="btn btn-sm btn-danger" data-cmd="voiceDel">✕</button></div>
        <div class="row2">
          <div class="field"><label>음량 <output>${Math.round((c.voiceVol ?? 1) * 100)}%</output></label><input type="range" data-k="voiceVol" min="0" max="2" step="0.05" value="${c.voiceVol ?? 1}"></div>
          <div class="field"><label>시작(초)</label><input type="number" data-k="voiceDelay" min="0" max="30" step="0.1" value="${c.voiceDelay ?? 0.3}"></div>
        </div>
        <button class="btn btn-sm" data-cmd="voiceFit" style="margin-bottom:10px">⇔ 장면 길이를 목소리에 맞추기</button>` : '<p class="muted small" style="margin-bottom:8px">문장을 적고 AI 성우로 만들거나, 직접 녹음하세요.</p>'}
      <div class="field"><textarea data-k="narration" rows="2" placeholder="읽어 줄 문장 (예: 튼튼한 황마로 만든 친환경 에코백!)">${esc(c.narration || '')}</textarea></div>
      <div class="row2">
        <div class="field"><label>AI 성우</label><select id="vVoice">${opt(TTS_VOICES, Platform.getPref('voice_name') || 'Kore')}</select></div>
        <div class="field"><label>말투</label><select id="vStyle">${opt(TTS_STYLES, Platform.getPref('voice_style') || '')}</select></div>
      </div>
      <div class="field"><label>목소리 톤 (높이)</label>
        <select data-tone="mode">${opt([{ v: 'none', label: '원래 목소리' }, { v: 'range', label: '음역 고르기 (베이스~소프라노)' }, { v: 'note', label: '계이름 고르기 (도레미…)' }, { v: 'semi', label: '직접 조절 (반음)' }], tone.mode)}</select></div>
      ${tone.mode === 'range' ? `<div class="field"><select data-tone="range">${opt(VOICE_RANGES, tone.range || 'tenor')}</select></div>` : ''}
      ${tone.mode === 'note' ? `<div class="row2"><div class="field"><select data-tone="note">${opt(NOTES, tone.note || 'sol')}</select></div><div class="field"><select data-tone="octave">${opt(OCTAVES, tone.octave || 3)}</select></div></div>` : ''}
      ${tone.mode === 'semi' ? `<div class="field"><label>반음 <output>${tone.semi || 0}</output></label><input type="range" data-tone="semi" min="-12" max="12" step="1" value="${tone.semi || 0}"></div>` : ''}
      <div class="btn-row">
        <button class="btn btn-sm btn-accent" data-cmd="voiceTts">🔊 AI 성우로 만들기</button>
        <button class="btn btn-sm${Recorder.active() ? ' rec-on' : ''}" data-cmd="voiceRec">${Recorder.active() ? '⏹ 녹음 끝내기' : '🎙 직접 녹음'}</button>
        ${voice ? '<button class="btn btn-sm" data-cmd="voiceTone">🎚 톤 적용</button>' : ''}
      </div>
      <div class="btn-row"><button class="btn btn-sm" data-cmd="voiceAll">🔊 모든 장면 내레이션 한 번에 만들기</button></div>
    </div>
    <hr>
    <div class="btn-row">
      <button class="btn btn-sm" data-cmd="left" ${idx === 0 ? 'disabled' : ''}>◀ 앞으로</button>
      <button class="btn btn-sm" data-cmd="right" ${idx === state.clips.length - 1 ? 'disabled' : ''}>뒤로 ▶</button>
      <button class="btn btn-sm" data-cmd="dup">⧉ 복제</button>
      <button class="btn btn-sm btn-danger" data-cmd="del">🗑 삭제</button>
    </div>
    <div class="btn-row">
      <button class="btn btn-sm" data-cmd="allTrans">전환 효과 모든 장면에</button>
      ${c.kind === 'media' ? '<button class="btn btn-sm" data-cmd="allFit">맞춤·움직임 모든 장면에</button>' : ''}
      ${c.kind === 'media' ? '<button class="btn btn-sm" data-cmd="allEnh">화질 향상 모든 장면에</button>' : ''}
      ${!isVid ? '<button class="btn btn-sm" data-cmd="allDur">길이 모든 사진에</button>' : ''}
      ${(c.text || '').trim() && c.kind === 'media' ? '<button class="btn btn-sm" data-cmd="allStyle">자막 모양 모든 장면에</button>' : ''}
    </div>`;
}

function onClipInput(e) {
  const el = e.target;
  const c = clipById(state.selectedId);
  if (!c) return;
  if (el.dataset.tone) {
    const tone = c.voiceTone = Object.assign({ mode: 'none' }, c.voiceTone);
    tone[el.dataset.tone] = el.type === 'range' || el.dataset.tone === 'octave' ? +el.value : el.value;
    if (el.dataset.tone === 'mode' && e.type === 'change') renderClipPanel();
    const out = el.closest('.field')?.querySelector('output'); if (out) out.textContent = el.value;
    changed(400);
    return;
  }
  if (el.id === 'vVoice') { Platform.setPref('voice_name', el.value); return; }
  if (el.id === 'vStyle') { Platform.setPref('voice_style', el.value); return; }
  const k = el.dataset.k;
  if (!k) return;
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.type === 'number' || el.type === 'range') { v = parseFloat(el.value); if (!isFinite(v)) return; }
  else v = el.value;
  const m = clipMedia(c);
  if (k === 'duration') v = clamp(v, 0.3, m?.type === 'video' ? Math.max(0.3, m.duration - c.trimStart) : 120);
  if (k === 'trimStart' && m) { v = clamp(v, 0, m.duration - 0.3); c.duration = Math.min(c.duration, round1(m.duration - v)); }
  if (k === 'transDur') v = clamp(v, 0.1, 3);
  c[k] = v;
  const out = el.closest('.field')?.querySelector('output');
  if (out) out.textContent = ['volume', 'enhance', 'voiceVol'].includes(k) ? Math.round(v * 100) + '%' : v;
  if (['duration', 'trimStart', 'transition', 'bgColor', 'bgColor2', 'text', 'textColor', 'enhance', 'voiceDelay'].includes(k)) renderTimelineSoon();
  if (['text', 'sub', 'font'].includes(k)) preloadText().then(requestRender);
  if (k === 'transition' && e.type === 'change') {
    const L = layout().find(l => l.clip === c);
    if (L && v !== 'none') { seekTo(Math.max(0, L.start - 0.4)); play(); }
  }
  if (k === 'trimStart' || k === 'enhance') {
    const L = layout().find(l => l.clip === c);
    if (L && (state.time < L.start || state.time >= L.end)) seekTo(L.start + 0.3);
  }
  if ((k === 'trimStart' || k === 'text') && e.type === 'change') renderClipPanel();
  changed(500);
  requestRender();
}
let tlTimer = 0;
function renderTimelineSoon() { clearTimeout(tlTimer); tlTimer = setTimeout(renderTimeline, 120); }

async function onClipCommand(cmd) {
  const c = clipById(state.selectedId);
  if (!c) return;
  const idx = state.clips.indexOf(c);
  switch (cmd) {
    case 'left': moveClip(c.id, -1); return;
    case 'right': moveClip(c.id, 1); return;
    case 'dup': duplicateClip(c.id); return;
    case 'del': removeClip(c.id); return;
    case 'allTrans': state.clips.forEach((x, i) => { if (i > 0) { x.transition = idx === 0 ? 'fade' : c.transition; x.transDur = c.transDur; } }); toast('모든 장면에 전환 효과를 적용했습니다'); break;
    case 'allDur': state.clips.forEach(x => { if (!isVideoClip(x)) x.duration = c.duration; }); toast('모든 사진·글자 화면 길이를 바꿨습니다'); break;
    case 'allFit': state.clips.forEach(x => { if (x.kind === 'media') { x.fit = c.fit; if (!isVideoClip(x)) x.motion = c.motion; } }); toast('화면 맞춤·움직임을 모두 적용했습니다'); break;
    case 'allEnh': state.clips.forEach(x => { if (x.kind === 'media') x.enhance = c.enhance || 0.6; }); toast('모든 장면에 화질 향상을 적용했습니다'); break;
    case 'allStyle': state.clips.forEach(x => { if (x.kind === 'media') Object.assign(x, { font: c.font, fontSize: c.fontSize, textColor: c.textColor, textPos: c.textPos, textBg: c.textBg, textAnim: c.textAnim }); }); toast('자막 모양을 모두 적용했습니다'); break;
    case 'voicePlay': { const v = mediaById(c.voiceId); if (v) listen(v.buffer); return; }
    case 'voiceDel': c.voiceId = ''; c.voiceSrcId = ''; break;
    case 'voiceFit': {
      const v = mediaById(c.voiceId); if (!v) return;
      const need = round1((c.voiceDelay || 0) + v.duration + 0.4);
      const m = clipMedia(c);
      c.duration = m?.type === 'video' ? Math.min(need, m.duration - c.trimStart) : need;
      toast(`장면 길이를 ${c.duration}초로 맞췄습니다`);
      break;
    }
    case 'voiceTts': await makeVoiceForClips([c]); return;
    case 'voiceAll': await makeVoiceForClips(state.clips.filter(x => (x.narration || '').trim())); return;
    case 'voiceRec': await toggleRecording(c); return;
    case 'voiceTone': await applyToneToClip(c); return;
  }
  changed(); refreshAll();
}

/* ================================================================== 목소리 */
async function makeVoiceForClips(clips) {
  clips = clips.filter(c => (c.narration || '').trim());
  if (!clips.length) { toast('먼저 읽어 줄 문장을 적어 주세요.', true); return; }
  if (!genReady()) { toast('AI 성우를 쓰려면 ⚙ AI 설정에서 Google AI 키를 넣어 주세요.', true); openAiSettings(); return; }
  const voice = $('#vVoice')?.value || Platform.getPref('voice_name') || 'Kore';
  const style = $('#vStyle')?.value ?? (Platform.getPref('voice_style') || '');
  pause();
  const b = busy('🔊 AI 성우가 읽는 중…', `${clips.length}개 장면`);
  try {
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      if (b.flag.cancelled) throw new Error('취소했습니다.');
      b.set(i / clips.length, `${i + 1} / ${clips.length} — "${c.narration.slice(0, 30)}"`);
      const raw = await generateSpeech({ text: c.narration, voice, style, signal: b.signal });
      const src = addVoiceMedia(raw, `목소리-${voice}-${i + 1}`);
      c.voiceSrcId = src.id;
      c.voiceId = src.id;
      if (c.voiceTone && c.voiceTone.mode !== 'none') await applyToneToClip(c, true);
      const m = clipMedia(c), v = mediaById(c.voiceId);
      const need = round1((c.voiceDelay ?? 0.3) + v.duration + 0.4);
      if (c.duration < need) c.duration = m?.type === 'video' ? Math.min(need, m.duration - c.trimStart) : need;
    }
    b.close();
    toast(`목소리 ${clips.length}개를 넣었습니다 (배경음악은 목소리 나올 때 자동으로 작아져요)`, false, 3500);
  } catch (e) {
    b.close();
    toast(e.message, true);
  }
  changed(); refreshAll();
}
async function toggleRecording(c) {
  if (!Recorder.active()) {
    try { await Recorder.start(); toast('🎙 녹음 중… 다 읽으면 \'녹음 끝내기\'를 누르세요'); }
    catch (e) { toast('마이크를 쓸 수 없습니다. 마이크 권한을 확인해 주세요.', true); }
    renderClipPanel();
    return;
  }
  const blob = await Recorder.stop();
  renderClipPanel();
  if (!blob) return;
  try {
    const buf = await decodeAudioFile(blob);
    const src = addVoiceMedia(buf, `내 녹음-${new Date().toLocaleTimeString('ko-KR').replace(/[:\s]/g, '')}`);
    c.voiceSrcId = src.id; c.voiceId = src.id;
    if (c.voiceTone && c.voiceTone.mode !== 'none') await applyToneToClip(c, true);
    toast('녹음한 목소리를 넣었습니다');
  } catch (e) { toast('녹음을 읽을 수 없습니다: ' + e.message, true); }
  changed(); refreshAll();
}
async function applyToneToClip(c, silent = false) {
  const src = mediaById(c.voiceSrcId) || mediaById(c.voiceId);
  if (!src) return;
  const tone = c.voiceTone || { mode: 'none' };
  if (tone.mode === 'none') { c.voiceId = src.id; if (!silent) { toast('원래 목소리로 되돌렸습니다'); changed(); refreshAll(); } return; }
  const b = silent ? null : busy('🎚 목소리 톤 바꾸는 중…', '', { cancellable: false });
  await wait(30);
  const semi = semitonesFor(src.buffer, tone);
  const out = pitchShift(src.buffer, semi);
  const label = tone.mode === 'range' ? VOICE_RANGES.find(r => r.v === tone.range)?.label.split(' ')[0]
    : tone.mode === 'note' ? NOTES.find(n => n.v === tone.note)?.label : `${tone.semi > 0 ? '+' : ''}${tone.semi}반음`;
  const m = addVoiceMedia(out, `${src.name.replace(/\.wav$/, '')}-${label}`);
  c.voiceSrcId = src.id;
  c.voiceId = m.id;
  b?.close();
  if (!silent) {
    toast(`목소리 톤을 ${label}(으)로 바꿨습니다 (${semi > 0 ? '+' : ''}${semi.toFixed(1)}반음)`);
    changed(); refreshAll();
    listen(out);
  }
}

/* ================================================================== 자동으로 만들기 */
async function autoMake() {
  if (state.busy) return;
  const cmd = $('#cmdInput').value.trim();
  if (!visualMedia().length) {
    toast('먼저 📁 가져오기로 사진·영상을 넣거나 🎨 AI 생성으로 만들어 주세요.', true);
    return;
  }
  Platform.setPref('last_command', cmd);
  pause();
  let plan = null;
  if (aiReady()) {
    const b = busy('✨ AI가 사진을 보고 편집하는 중…', `사진 ${visualMedia().length}장을 살펴보고 순서·자막·효과를 정하고 있어요. (보통 20초~1분)`);
    try {
      plan = await planWithAI(cmd, b.signal);
    } catch (e) {
      b.close();
      if (b.flag.cancelled) return;
      toast(e.message + ' — 기본 자동편집으로 만들었습니다.', true);
    }
    b.close();
  }
  try {
    if (!plan) plan = planFromCommand(cmd);
    const summary = applyPlan(plan);
    changed();
    refreshAll();
    toast('✨ ' + summary, false, 5000);
    const narr = state.clips.filter(c => (c.narration || '').trim());
    if (narr.length && genReady()) await makeVoiceForClips(narr);
    else if (narr.length) toast('내레이션 문장을 각 장면에 넣어 두었어요. ⚙ AI 설정에 Google 키를 넣으면 AI 성우 목소리로 만들 수 있어요.', false, 5000);
    else if (plan.wants_voice && !narr.length) toast('목소리를 넣으려면 "내레이션: 첫 문장 / 둘째 문장" 처럼 적거나 장면 편집에서 문장을 적어 주세요.', false, 5000);
    seekTo(0);
    play();
  } catch (e) {
    toast(e.message, true);
  }
}

/* ================================================================== 저장 (동영상) */
async function doExport() {
  if (state.busy) return;
  if (!state.clips.length) { toast('먼저 장면을 만들어 주세요.', true); return; }
  pause();
  const b = busy('⬇ 동영상 만드는 중…', `${S.aspect} · ${S.quality}p · ${S.fps}fps · ${fmt(totalDuration())}`);
  let result;
  try {
    result = await exportVideo({ quality: S.quality, signal: b.flag, onProgress: ({ pct, text }) => b.set(pct, text) });
  } catch (e) {
    b.close();
    if (!(e instanceof ExportCancelled)) { console.error(e); toast('동영상을 만들지 못했습니다: ' + (e.message || e), true); }
    return;
  }
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const name = `영상뚝딱-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${result.ext}`;
  const url = URL.createObjectURL(result.blob);
  $('#busyTitle').textContent = '✅ 동영상이 완성되었습니다';
  $('#busyNote').textContent = '';
  $('#busyBar').parentElement.hidden = true;
  $('#busyPct').textContent = '';
  const rv = $('#resultVideo');
  rv.src = url;
  $('#resultBox').hidden = false;
  $('#resultInfo').textContent = `${result.width}×${result.height} · ${(result.blob.size / 1048576).toFixed(1)}MB · ${result.codecs}`;
  const cancel = $('#busyCancel');
  cancel.hidden = false; cancel.textContent = '닫기';
  cancel.onclick = () => { rv.pause(); rv.removeAttribute('src'); rv.load(); URL.revokeObjectURL(url); closeModal('#busyModal'); };
  const save = $('#resultSaveBtn'), show = $('#resultShowBtn');
  const doSave = async () => {
    try {
      const r = await Platform.saveVideo(result.blob, name, t => { $('#resultInfo').textContent = t; });
      $('#resultInfo').textContent = r.message;
      if (r.saved) {
        dirty = false; Platform.setDirty(false);
        if (r.path && Platform.kind === 'desktop') { show.hidden = false; show.onclick = () => Platform.showInFolder(r.path); }
        if (Platform.canShare()) { show.hidden = false; show.textContent = '📤 공유·갤러리에 저장'; show.onclick = () => Platform.shareLast(name); }
      }
    } catch (e) { $('#resultInfo').textContent = '저장 실패: ' + e.message; }
  };
  const pubBtn = $('#resultPubBtn');
  pubBtn.hidden = false;
  pubBtn.onclick = () => { cancel.onclick(); openPublish(); };
  save.hidden = false;
  save.textContent = Platform.kind === 'web' ? '⬇ 다운로드' : '💾 저장';
  save.onclick = doSave;
  if (Platform.kind !== 'web') doSave();
}

/* ================================================================== 프로젝트 저장/열기 */
async function saveProject() {
  if (!state.media.length) { toast('저장할 내용이 없습니다.', true); return; }
  const b = busy('💾 프로젝트 저장 중…', '', { cancellable: false });
  try {
    const blob = await buildProjectBlob();
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const name = `영상뚝딱-프로젝트-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.ttuk`;
    b.close();
    const r = Platform.kind === 'desktop' ? await window.native.saveFile(new Uint8Array(await blob.arrayBuffer()), name, '영상뚝딱 프로젝트', 'ttuk')
      : await Platform.saveVideo(blob, name);
    if (r && (r.saved || r.path)) { dirty = false; Platform.setDirty(false); toast('프로젝트를 저장했습니다. 📂 열기로 이어서 작업할 수 있어요.'); }
  } catch (e) { b.close(); toast('저장 실패: ' + e.message, true); }
}
async function openProject(file) {
  if (!file) {
    if (Platform.kind === 'desktop') {
      const f = await window.native.openProject();
      if (!f) return;
      file = new File([f.data], f.name);
    } else { $('#projInput').click(); return; }
  }
  if (state.clips.length && dirty && !confirm('지금 작업 중인 내용이 사라집니다. 프로젝트를 열까요?')) return;
  const b = busy('📂 프로젝트 여는 중…', file.name, { cancellable: false });
  try {
    const header = await readProjectFile(file, (i, n, name) => b.set(i / n, `${i + 1} / ${n} · ${name}`));
    $('#cmdInput').value = header.command || '';
    hist.undo = []; hist.redo = []; hist.last = null;
    commit();
    dirty = false; Platform.setDirty(false);
    b.close();
    refreshAll();
    toast('프로젝트를 열었습니다');
  } catch (e) { b.close(); toast('열 수 없습니다: ' + e.message, true); }
}
function newProject() {
  if (state.media.length && dirty && !confirm('지금 작업을 지우고 새로 시작할까요?')) return;
  pause();
  state.clips.forEach(disposeClip);
  state.media.forEach(m => URL.revokeObjectURL(m.url));
  state.clips = []; state.media = []; state.selectedId = null; state.time = 0;
  Object.assign(S, { bgmId: '', logoId: '', bgmOffset: 0, filter: 'none' });
  $('#cmdInput').value = '';
  hist.undo = []; hist.redo = []; hist.last = null; commit();
  dirty = false; Platform.setDirty(false);
  refreshAll();
}

/* ================================================================== AI 설정 */
function openAiSettings() {
  $('#apiKeyInput').value = AI.key;
  $('#googleKeyInput').value = GEN.key;
  $('#modelSel').value = AI.model;
  $('#aiTestResult').textContent = '';
  $('#googleTestResult').textContent = '';
  openModal('#aiModal');
}
async function saveAiSettings() {
  AI.key = $('#apiKeyInput').value.trim();
  AI.model = $('#modelSel').value;
  GEN.key = $('#googleKeyInput').value.trim();
  await Platform.setSecret('anthropic_api_key', AI.key);
  await Platform.setSecret('google_api_key', GEN.key);
  Platform.setPref('ai_model', AI.model);
  updateAiMode();
}
async function testAi() {
  await saveAiSettings();
  const r1 = $('#aiTestResult'), r2 = $('#googleTestResult');
  if (AI.key) { r1.textContent = 'Claude 확인 중…'; const r = await testAiKey(AI.key, AI.model); r1.textContent = (r.ok ? '✅ ' : '❌ ') + r.message; }
  else r1.textContent = 'Claude 키 없음 — 기본 자동편집을 씁니다.';
  if (GEN.key) {
    r2.textContent = 'Google 확인 중…';
    const r = await testGoogleKey(GEN.key);
    r2.textContent = (r.ok ? '✅ ' : '❌ ') + r.message;
    if (r.ok) {
      if (r.found.image) { GEN.imageModel = r.found.image; Platform.setPref('gen_image_model', GEN.imageModel); }
      if (r.found.video) { GEN.videoModel = r.found.video; Platform.setPref('gen_video_model', GEN.videoModel); }
      if (r.found.tts) { GEN.ttsModel = r.found.tts; Platform.setPref('gen_tts_model', GEN.ttsModel); }
    }
  } else r2.textContent = 'Google 키 없음 — AI 생성·AI 성우를 쓸 수 없습니다 (직접 녹음은 가능).';
}
function updateAiMode() {
  const parts = [aiReady() ? `<b>Claude AI</b> 편집` : '기본 자동편집', genReady() ? '<b>AI 생성</b> 켜짐' : 'AI 생성 꺼짐'];
  $('#aiMode').innerHTML = parts.join(' · ') + ' <span class="muted">(설정)</span>';
}

/* ================================================================== AI 생성 창 */
let genTab = 'person';
function openGenerate() {
  const fill = (id, list) => { $(id).innerHTML = opt(list, $(id).value || list[0].v); };
  fill('#gGender', PEOPLE.gender); fill('#gAge', PEOPLE.age); fill('#gLook', PEOPLE.look); fill('#gMood', PEOPLE.mood); fill('#gShot', PEOPLE.shot);
  if (!$('#gAge').dataset.init) { $('#gAge').value = 'in their 20s'; $('#gAge').dataset.init = 1; }
  const imgs = state.media.filter(m => m.type === 'image');
  $('#gVidSource').innerHTML = '<option value="text">글 설명만으로</option>' + imgs.map(m => `<option value="${m.id}">사진을 움직이게: ${esc(m.name)}</option>`).join('');
  const sel = clipMedia(clipById(state.selectedId));
  if (sel && sel.type === 'image') $('#gVidSource').value = sel.id;
  $('#genStatus').textContent = genReady() ? '' : '⚠ ⚙ AI 설정에서 Google AI 키를 먼저 넣어 주세요.';
  $('#genResults').innerHTML = '';
  showGenTab(genTab);
  openModal('#genModal');
}
function showGenTab(g) {
  genTab = g;
  $$('#genTabs button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
  $$('.gen-body').forEach(el => { el.hidden = el.dataset.g !== g; });
  $('#gCountField').hidden = g === 'video';
}
let genAbort = null;
async function runGenerate() {
  if (!genReady()) { closeModal('#genModal'); openAiSettings(); return; }
  if (genAbort) { genAbort.abort(); return; }
  const aspectSel = $('#gAspect').value;
  const aspect = aspectSel === 'project' ? S.aspect : aspectSel;
  const status = $('#genStatus'), go = $('#genGoBtn');
  genAbort = new AbortController();
  go.textContent = '⏹ 그만두기';
  try {
    let files = [];
    if (genTab === 'video') {
      const srcId = $('#gVidSource').value;
      const img = srcId !== 'text' ? mediaById(srcId) : null;
      let prompt = $('#gVidPrompt').value.trim();
      if (!prompt && !img) throw new Error('어떤 영상을 만들지 적어 주세요.');
      if (!prompt) prompt = 'Bring this photo to life with subtle natural motion and a slow cinematic camera move';
      prompt = await toEnglishPrompt(prompt, status, true);
      const f = await generateVideo({ prompt: prompt + (img ? '' : '. Photorealistic, cinematic, natural lighting, realistic people and objects.'), aspect, image: img?.file, onStatus: t => { status.textContent = t; }, signal: genAbort.signal });
      files = [f];
    } else {
      let prompt;
      if (genTab === 'person') {
        const tr = await toEnglishPrompt([$('#gAction').value, $('#gPlace').value, $('#gOutfit').value].join(' ||| '), status);
        const [action, place, outfit] = tr.split('|||').map(s => s.trim());
        prompt = buildPersonPrompt({ gender: $('#gGender').value, age: $('#gAge').value, look: $('#gLook').value, mood: $('#gMood').value, shot: $('#gShot').value, action, place, outfit });
      } else if (genTab === 'object') {
        const what = $('#gWhat').value.trim();
        if (!what) throw new Error('무엇을 만들지 적어 주세요.');
        const tr = await toEnglishPrompt([what, $('#gObjPlace').value, $('#gObjExtra').value].join(' ||| '), status);
        const [w, place, extra] = tr.split('|||').map(s => s.trim());
        prompt = buildObjectPrompt({ what: w || what, place, action: extra });
      } else {
        const free = $('#gFree').value.trim();
        if (!free) throw new Error('만들고 싶은 사진을 적어 주세요.');
        prompt = (await toEnglishPrompt(free, status)) + '. ' + REALISM;
      }
      status.textContent = '🎨 AI가 사진을 만드는 중… (10~30초)';
      files = await generateImages({ prompt, aspect, count: +$('#gCount').value, people: genTab !== 'object', signal: genAbort.signal });
    }
    status.textContent = '완성! 미디어에 넣는 중…';
    const added = await importFiles(files, { toTimeline: $('#gToTimeline').checked });
    $('#genResults').innerHTML = added.map(m => m.type === 'image' ? `<img src="${m.url}" alt="">` : `<video src="${m.url}" controls muted playsinline></video>`).join('');
    status.textContent = `✅ ${added.length}개를 만들어 미디어에 넣었습니다. 더 만들거나 닫으세요.`;
  } catch (e) {
    status.textContent = '❌ ' + (e.message || e);
  } finally {
    genAbort = null;
    go.textContent = '✨ 만들기';
  }
}
/** 한국어 설명 → 영어 (Claude 키가 있으면 번역, 없으면 그대로) */
async function toEnglishPrompt(text, statusEl, cinematic = false) {
  if (!text.replace(/\|/g, '').trim()) return text;
  if (!/[가-힣]/.test(text) || !aiReady()) return text;
  statusEl.textContent = '설명을 다듬는 중…';
  try {
    const res = await aiClient().messages.create({
      model: AI.model, max_tokens: 2000,
      output_config: { effort: 'low' },
      system: 'Translate the Korean image/video description into natural, vivid English for an image generation model. Keep every detail, keep "|||" separators exactly, add nothing else. Output only the translation.' + (cinematic ? ' Describe camera motion if implied.' : ''),
      messages: [{ role: 'user', content: text }],
    });
    if (res.stop_reason === 'refusal') return text;
    return res.content.filter(b => b.type === 'text').map(b => b.text).join('').trim() || text;
  } catch (e) { return text; }
}

/* ================================================================== 업로드 도우미 */
let pubPlatform = null;
function openPublish(platform) {
  if (!state.clips.length) { toast('먼저 영상을 만들어 주세요.', true); return; }
  pubPlatform = platform || pubPlatform || (S.aspect === '16:9' ? 'youtube' : 'shorts');
  $('#pubTabs').innerHTML = PLATFORMS.map(p => `<button data-p="${p.v}" class="${p.v === pubPlatform ? 'on' : ''}">${p.label}</button>`).join('');
  renderChecklist();
  const c = basicCopy(pubPlatform);
  $('#pubTitle').value = c.title; $('#pubDesc').value = c.description; $('#pubTags').value = c.hashtags;
  $('#pubThumbText').value = $('#pubThumbText').value || (state.clips.find(x => x.kind === 'text')?.text || '').split('\n')[0].slice(0, 14);
  $('#pubTips').textContent = '올리는 요령: 사람들이 많이 보는 평일 저녁 7~10시·주말 낮에 올리고, 첫 1시간 안에 달린 댓글에 답하면 반응이 빨리 쌓입니다. 같은 주제로 꾸준히 올리면(시리즈) 추천이 이어지기 쉽습니다.';
  $('#pubStatus').textContent = aiReady() ? '' : 'Claude 키를 넣으면 AI가 사진을 보고 제목·설명·해시태그를 더 잘 써 줍니다.';
  drawThumb();
  openModal('#pubModal');
  if (aiReady()) runAiCopy();
}
function renderChecklist() {
  const items = algorithmChecklist(pubPlatform);
  const okN = items.filter(i => i.ok).length;
  const score = Math.round(okN / items.length * 100);
  $('#pubScore').textContent = score;
  $('#pubScoreBar').style.width = score + '%';
  $('#pubChecklist').innerHTML = items.map((it, i) => `<li><span class="ic">${it.ok ? '✅' : '⚠️'}</span><span class="tx">${esc(it.text)}<small>${esc(it.why || '')}</small></span>${!it.ok && it.fix ? `<button class="btn btn-sm" data-fix="${i}">고치기</button>` : ''}</li>`).join('');
  $('#pubChecklist')._items = items;
  $('#pubFixAll').disabled = !items.some(i => !i.ok && i.fix);
}
function applyFixes(list) {
  list.forEach(it => it.fix && it.fix());
  if (state.clips[0]) state.clips[0].transition = 'none';
  changed(); refreshAll(); renderChecklist(); drawThumb();
  toast('고쳤습니다. 미리보기로 확인해 보세요');
}
function drawThumb() {
  const W = S.aspect === '16:9' ? 1280 : 720;
  const src = thumbnailCanvas(W, true, $('#pubThumbText').value.replace(/\s*\/\s*/g, '\n'));
  const out = $('#pubThumb');
  out.width = src.width; out.height = src.height;
  out.getContext('2d').drawImage(src, 0, 0);
}
let pubAbort = null;
async function runAiCopy() {
  if (!aiReady()) { openAiSettings(); return; }
  if (pubAbort) pubAbort.abort();
  pubAbort = new AbortController();
  $('#pubStatus').textContent = '✨ AI가 제목·설명·해시태그를 쓰는 중…';
  try {
    const r = await aiCopy(pubPlatform, pubAbort.signal);
    $('#pubTitle').value = r.title; $('#pubDesc').value = r.description; $('#pubTags').value = r.hashtags;
    if (r.thumbnail_text) { $('#pubThumbText').value = r.thumbnail_text; drawThumb(); }
    if (r.tips) $('#pubTips').textContent = '💡 ' + r.tips;
    $('#pubStatus').textContent = '✅ AI 문구 완성';
  } catch (e) {
    if (e.name !== 'AbortError') $('#pubStatus').textContent = '❌ ' + aiErrorMessage(e);
  } finally { pubAbort = null; }
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('복사했습니다'); }
  catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('복사했습니다'); }
}
function bindPublish() {
  $('#pubTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) openPublish(b.dataset.p); });
  $('#pubChecklist').addEventListener('click', e => { const b = e.target.closest('[data-fix]'); if (b) applyFixes([$('#pubChecklist')._items[+b.dataset.fix]]); });
  $('#pubFixAll').addEventListener('click', () => applyFixes($('#pubChecklist')._items.filter(i => !i.ok && i.fix)));
  $('#pubAiBtn').addEventListener('click', runAiCopy);
  $$('#pubModal [data-copy]').forEach(b => b.addEventListener('click', () => copyText($('#' + b.dataset.copy).value)));
  $('#pubCopyAll').addEventListener('click', () => copyText([$('#pubTitle').value, '', $('#pubDesc').value, '', $('#pubTags').value].join('\n')));
  $('#pubThumbText').addEventListener('input', drawThumb);
  $('#pubThumbSave').addEventListener('click', () => {
    $('#pubThumb').toBlob(async blob => {
      const r = await Platform.saveVideo(blob, `썸네일-${Date.now().toString(36)}.png`);
      toast(r.message || '썸네일을 저장했습니다');
    }, 'image/png');
  });
  $('#pubUploadBtn').addEventListener('click', () => {
    const P = PLATFORMS.find(p => p.v === pubPlatform);
    copyText([$('#pubTitle').value, '', $('#pubDesc').value, '', $('#pubTags').value].join('\n'));
    Platform.openExternal(P.upload);
    toast('문구를 복사했어요. 업로드 페이지에서 저장한 동영상을 올리고 붙여넣기 하세요.', false, 5000);
  });
}

/* ================================================================== 영상 설정 */
function syncProjectForm() {
  const audios = state.media.filter(m => m.type === 'audio');
  $('#bgmSelect').innerHTML = `<option value="">없음</option>` + audios.map(m => `<option value="${m.id}"${m.id === S.bgmId ? ' selected' : ''}>${m.role === 'voice' ? '🎙 ' : '🎵 '}${esc(m.name)}</option>`).join('');
  const imgs = state.media.filter(m => m.type === 'image');
  $('#logoSelect').innerHTML = `<option value="">없음</option>` + imgs.map(m => `<option value="${m.id}"${m.id === S.logoId ? ' selected' : ''}>${esc(m.name)}</option>`).join('');
  $$('#aspectSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === S.aspect));
  $('#quality').value = String(S.quality);
  $('#fps').value = String(S.fps);
  $('#filterSel').innerHTML = opt(FILTERS, S.filter);
  $('#bgColor').value = S.bg;
  $('#bgmVol').value = S.bgmVolume; $('#bgmVolOut').textContent = Math.round(S.bgmVolume * 100) + '%';
  $('#bgmFade').checked = S.bgmFade;
  $('#beatSync').checked = S.beatSync;
  $('#logoPos').value = S.logoPos;
  $('#logoSize').value = S.logoSize; $('#logoSizeOut').textContent = Math.round(S.logoSize * 100) + '%';
  const bgm = mediaById(S.bgmId);
  $('#bpmInfo').textContent = bgm?.beat ? `음악 빠르기: 약 ${bgm.beat.bpm}BPM (박 간격 ${bgm.beat.period.toFixed(2)}초)` : '';
}
function showTab(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $('#clipTab').hidden = name !== 'clip';
  $('#projectTab').hidden = name !== 'project';
  if (window.matchMedia('(max-width:1000px)').matches) setMobile(name === 'project' ? 'project' : name === 'clip' ? 'clip' : 'library', false);
}
function setMobile(m, alsoTab = true) {
  document.body.dataset.m = m;
  $$('#mobileTabs button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  if (alsoTab && m !== 'library') showTab(m);
}

/* ================================================================== 메뉴 / 단축키 */
const ACTIONS = {
  new: newProject, import: doImport, openProject: () => openProject(), saveProject, export: doExport,
  undo: () => { if (isTyping()) { document.execCommand('undo'); return; } if (undo()) { refreshAll(); toast('실행 취소'); } },
  redo: () => { if (isTyping()) { document.execCommand('redo'); return; } if (redo()) { refreshAll(); toast('다시 실행'); } },
  dup: () => state.selectedId && duplicateClip(state.selectedId),
  delete: () => state.selectedId && removeClip(state.selectedId),
  play: () => (state.playing ? pause() : play()),
  home: () => seekTo(0),
  auto: autoMake, generate: openGenerate, aiSettings: openAiSettings, addText: addTextClip,
  help: () => openModal('#helpModal'),
  publish: () => openPublish(),
  enhanceAll: () => { state.clips.forEach(x => { if (x.kind === 'media') x.enhance = 0.6; }); changed(); refreshAll(); toast('모든 장면에 화질 향상(60%)을 적용했습니다'); },
};
function isTyping() {
  const el = document.activeElement; if (!el) return false;
  return el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['range', 'checkbox', 'color', 'button'].includes(el.type));
}

/* ================================================================== 이벤트 연결 */
function bind() {
  $('#fileInput').addEventListener('change', e => { importFiles(e.target.files); e.target.value = ''; });
  $('#projInput').addEventListener('change', e => { if (e.target.files[0]) openProject(e.target.files[0]); e.target.value = ''; });
  $('#importBtn').addEventListener('click', doImport);
  $('#dropHint').addEventListener('click', doImport);
  $('#genBtn').addEventListener('click', openGenerate);
  $('#addTextBtn').addEventListener('click', addTextClip);
  $('#openProjBtn').addEventListener('click', () => openProject());
  $('#saveProjBtn').addEventListener('click', saveProject);
  $('#undoBtn').addEventListener('click', ACTIONS.undo);
  $('#redoBtn').addEventListener('click', ACTIONS.redo);
  $('#aiSettingsBtn').addEventListener('click', openAiSettings);
  $('#publishBtn').addEventListener('click', () => openPublish());
  bindPublish();
  $('#aiMode').addEventListener('click', openAiSettings);
  $('#exportBtn').addEventListener('click', doExport);
  $('#autoBtn').addEventListener('click', autoMake);
  $('#playBtn').addEventListener('click', ACTIONS.play);
  $('#toStartBtn').addEventListener('click', () => seekTo(0));
  const seek = $('#seek');
  seek.addEventListener('input', () => { seekDragging = true; seekTo(seek.value / 1000 * totalDuration()); });
  seek.addEventListener('change', () => { seekDragging = false; });

  // 명령어
  $('#chips').innerHTML = ['쇼츠 15초 신나게', '유튜브 30초 깔끔하게', '감성 잔잔하게', '고급스럽게', '귀엽게', '흑백 빈티지', '내레이션 넣어서']
    .map(t => `<button class="chip" data-chip="${esc(t)}">${esc(t)}</button>`).join('');
  $('#chips').addEventListener('click', e => {
    const b = e.target.closest('[data-chip]'); if (!b) return;
    const ta = $('#cmdInput');
    ta.value = ta.value.trim() ? `${ta.value.trim()}, ${b.dataset.chip}` : b.dataset.chip;
    ta.focus();
  });
  $('#cmdInput').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); autoMake(); } });
  $('#helpExamples').innerHTML = COMMAND_EXAMPLES.map(t => `<li data-ex="${esc(t)}">${esc(t)}</li>`).join('');
  $('#helpExamples').addEventListener('click', e => {
    const li = e.target.closest('[data-ex]'); if (!li) return;
    $('#cmdInput').value = li.dataset.ex; closeModal('#helpModal'); $('#cmdInput').focus();
  });

  // 끌어다 놓기
  let depth = 0;
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', e => { if (hasFiles(e)) { depth++; document.body.classList.add('dragging'); } });
  window.addEventListener('dragleave', e => { if (hasFiles(e) && --depth <= 0) { depth = 0; document.body.classList.remove('dragging'); } });
  window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); depth = 0; document.body.classList.remove('dragging');
    importFiles(e.dataTransfer.files);
  });

  // 미디어 목록
  $('#libList').addEventListener('click', e => {
    const item = e.target.closest('.lib-item'); if (!item) return;
    const m = mediaById(item.dataset.id);
    const act = e.target.closest('button')?.dataset.act;
    if (act === 'del') removeMedia(m.id);
    else if (act === 'add') addClipAt(m);
    else if (act === 'bgm') { S.bgmId = S.bgmId === m.id ? '' : m.id; changed(); refreshAll(); toast(S.bgmId ? '배경음악으로 정했습니다' : '배경음악을 뺐습니다'); }
    else if (act === 'logo') { S.logoId = S.logoId === m.id ? '' : m.id; changed(); refreshAll(); toast(S.logoId ? '로고로 정했습니다 (영상 설정에서 위치 조절)' : '로고를 뺐습니다'); }
    else if (act === 'listen') listen(m.buffer);
  });
  $('#libList').addEventListener('dblclick', e => {
    const item = e.target.closest('.lib-item'); if (!item) return;
    const m = mediaById(item.dataset.id); if (m.type !== 'audio') addClipAt(m);
  });
  $('#libList').addEventListener('dragstart', e => {
    const item = e.target.closest('.lib-item'); if (!item) return;
    e.dataTransfer.setData('text/x-media', item.dataset.id);
    e.dataTransfer.effectAllowed = 'copy';
  });

  // 타임라인
  const track = $('#track');
  track.addEventListener('click', e => { const el = e.target.closest('.clip'); if (el) selectClip(el.dataset.id, true); });
  track.addEventListener('dragstart', e => {
    const el = e.target.closest('.clip'); if (!el) return;
    e.dataTransfer.setData('text/x-clip', el.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
  });
  const clearMarks = () => $$('#track .clip').forEach(c => c.classList.remove('drop-before', 'drop-after'));
  track.addEventListener('dragend', clearMarks);
  const dropTarget = e => {
    const el = e.target.closest('.clip');
    if (!el) return { index: state.clips.length };
    const r = el.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2;
    return { el, after, index: state.clips.findIndex(c => c.id === el.dataset.id) + (after ? 1 : 0) };
  };
  track.addEventListener('dragover', e => {
    const types = [...e.dataTransfer.types];
    if (!types.includes('text/x-clip') && !types.includes('text/x-media')) return;
    e.preventDefault(); clearMarks();
    const d = dropTarget(e);
    if (d.el) d.el.classList.add(d.after ? 'drop-after' : 'drop-before');
  });
  track.addEventListener('drop', e => {
    const clipId = e.dataTransfer.getData('text/x-clip'), mediaId = e.dataTransfer.getData('text/x-media');
    if (!clipId && !mediaId) return;
    e.preventDefault(); e.stopPropagation();
    const d = dropTarget(e); clearMarks();
    if (clipId) {
      const from = state.clips.findIndex(c => c.id === clipId); if (from < 0) return;
      const [c] = state.clips.splice(from, 1);
      state.clips.splice(d.index > from ? d.index - 1 : d.index, 0, c);
      fixFirst(); changed(); refreshAll();
    } else { const m = mediaById(mediaId); if (m) addClipAt(m, d.index); }
  });
  const ruler = $('#ruler');
  const rulerSeek = e => { const r = ruler.getBoundingClientRect(); seekTo((e.clientX - r.left) / pps); };
  ruler.addEventListener('pointerdown', e => {
    ruler.setPointerCapture(e.pointerId); rulerSeek(e);
    const move = ev => rulerSeek(ev);
    ruler.addEventListener('pointermove', move);
    ruler.addEventListener('pointerup', () => ruler.removeEventListener('pointermove', move), { once: true });
  });
  $('#tlZoom').addEventListener('input', e => { pps = +e.target.value; renderTimeline(); });

  // 장면 편집
  const clipTab = $('#clipTab');
  clipTab.addEventListener('input', onClipInput);
  clipTab.addEventListener('change', onClipInput);
  clipTab.addEventListener('click', e => { const b = e.target.closest('button[data-cmd]'); if (b) onClipCommand(b.dataset.cmd); });

  $$('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
  $('#mobileTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMobile(b.dataset.m); });

  // 영상 설정
  $('#aspectSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.aspect = b.dataset.v; changed(); refreshAll(); });
  $('#quality').addEventListener('change', e => { S.quality = +e.target.value; changed(); refreshAll(); });
  $('#fps').addEventListener('change', e => { S.fps = +e.target.value; changed(); });
  $('#filterSel').addEventListener('change', e => { S.filter = e.target.value; changed(); requestRender(); });
  $('#bgColor').addEventListener('input', e => { S.bg = e.target.value; changed(400); requestRender(); });
  $('#bgmSelect').addEventListener('change', e => { S.bgmId = e.target.value; S.bgmOffset = 0; changed(); refreshAll(); if (state.playing) startBgm(state.time); });
  $('#bgmVol').addEventListener('input', e => { S.bgmVolume = +e.target.value; $('#bgmVolOut').textContent = Math.round(S.bgmVolume * 100) + '%'; changed(400); if (state.playing) startBgm(state.time); });
  $('#bgmFade').addEventListener('change', e => { S.bgmFade = e.target.checked; changed(); });
  $('#beatSync').addEventListener('change', e => { S.beatSync = e.target.checked; changed(); });
  $('#logoSelect').addEventListener('change', e => { S.logoId = e.target.value; changed(); refreshAll(); });
  $('#logoPos').addEventListener('change', e => { S.logoPos = e.target.value; changed(); requestRender(); });
  $('#logoSize').addEventListener('input', e => { S.logoSize = +e.target.value; $('#logoSizeOut').textContent = Math.round(S.logoSize * 100) + '%'; changed(400); requestRender(); });

  // AI 설정 창
  $('#aiSaveBtn').addEventListener('click', async () => { await saveAiSettings(); closeModal('#aiModal'); toast('AI 설정을 저장했습니다'); });
  $('#aiTestBtn').addEventListener('click', testAi);
  $('#aiClearBtn').addEventListener('click', async () => { $('#apiKeyInput').value = ''; $('#googleKeyInput').value = ''; await saveAiSettings(); toast('키를 삭제했습니다'); });
  $('#aiCloseBtn').addEventListener('click', () => closeModal('#aiModal'));
  $('#consoleLink').addEventListener('click', e => { e.preventDefault(); Platform.openExternal('https://console.anthropic.com/settings/keys'); });
  $('#googleLink').addEventListener('click', e => { e.preventDefault(); Platform.openExternal('https://aistudio.google.com/apikey'); });

  // AI 생성 창
  $('#genTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showGenTab(b.dataset.g); });
  $('#genGoBtn').addEventListener('click', runGenerate);
  $$('[data-close]').forEach(b => b.addEventListener('click', () => { const m = b.closest('.modal'); if (m.id === 'genModal' && genAbort) genAbort.abort(); m.hidden = true; }));

  // 단축키
  window.addEventListener('keydown', e => {
    if (!$('#busyModal').hidden) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') { if (!isTyping()) { e.preventDefault(); ACTIONS.undo(); } return; }
    if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { if (!isTyping()) { e.preventDefault(); ACTIONS.redo(); } return; }
    if (Platform.kind !== 'desktop' && mod) { // 데스크톱은 메뉴 단축키가 처리
      const k = e.key.toLowerCase();
      const map = { s: 'saveProject', o: 'openProject', e: 'export', i: 'import', g: 'generate', d: 'dup' };
      if (map[k]) { e.preventDefault(); ACTIONS[map[k]](); return; }
    }
    if (isTyping() || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); ACTIONS.play(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { if (state.selectedId) { e.preventDefault(); removeClip(state.selectedId); } }
    else if (e.key === 'ArrowLeft') seekTo(state.time - (e.shiftKey ? 1 : 0.1));
    else if (e.key === 'ArrowRight') seekTo(state.time + (e.shiftKey ? 1 : 0.1));
    else if (e.key === 'Home') seekTo(0);
    else if (e.key === 'Escape') $$('.modal').forEach(m => { if (m.id !== 'busyModal') m.hidden = true; });
  });
  Platform.onMenu(action => { if (ACTIONS[action] && $('#busyModal').hidden) ACTIONS[action](); });
  window.addEventListener('beforeunload', e => {
    if (Platform.kind === 'web' && dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // 명령어 칸 높이에 맞춰 화면 배치
  const cmd = $('.command');
  const fit = () => document.documentElement.style.setProperty('--cmd-h', cmd.offsetHeight + 'px');
  new ResizeObserver(fit).observe(cmd); fit();
}

/* ================================================================== 시작 */
hooks.onTime = updateTimeUI;
hooks.onPlayState = () => { $('#playBtn').textContent = state.playing ? '❚❚' : '▶'; };
hooks.onHistory = () => { $('#undoBtn').disabled = !hist.undo.length; $('#redoBtn').disabled = !hist.redo.length; };

(async function start() {
  canvas = $('#stage');
  ctx = canvas.getContext('2d');
  document.body.dataset.platform = Platform.kind;
  document.body.dataset.m = 'library';
  bind();
  await Promise.all([loadAiSettings(), loadGenSettings()]);
  updateAiMode();
  $('#cmdInput').value = Platform.getPref('last_command') || '';
  commit();
  refreshAll();
  if (document.fonts) {
    Promise.all(FONTS.map(f => document.fonts.load(`${f.weight} 40px ${f.v}`, '가나다ABC'))).catch(() => {}).finally(requestRender);
  }
  window.__ttuk = { state, importFiles, autoMake, doExport, exportVideo, applyPlan, planFromCommand, parseCommand, pitchShift, detectPitch, addVoiceMedia, Enhancer }; // 테스트용
})();
