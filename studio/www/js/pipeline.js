/* 영상뚝딱 — 제작 공정 (화면 조작 없이 처음부터 끝까지)
 * 시리즈 여러 편 만들기 · 예약 만들기가 같은 공정을 씁니다.
 */
'use strict';

/** 지금 작업을 그대로 둔 채 별도 작업 공간에서 fn 실행 */
async function withIsolatedProject(fn) {
  pause();
  const saved = { media: state.media, clips: state.clips, settings: JSON.parse(JSON.stringify(S)), selectedId: state.selectedId, time: state.time, hist: { undo: hist.undo, redo: hist.redo, last: hist.last } };
  state.media = []; state.clips = []; state.selectedId = null; state.time = 0;
  try {
    return await fn();
  } finally {
    pause();
    state.clips.forEach(disposeClip);
    state.media.forEach(m => URL.revokeObjectURL(m.url));
    state.media = saved.media; state.clips = saved.clips;
    Object.keys(S).forEach(k => delete S[k]);
    Object.assign(S, saved.settings);
    state.selectedId = saved.selectedId; state.time = saved.time;
    hist.undo = saved.hist.undo; hist.redo = saved.hist.redo; hist.last = saved.hist.last;
    setCanvasSize();
  }
}

/** 장면별 AI 성우 목소리 만들기 (화면 없이) */
async function generateVoices(clips, { voice, style, signal, onStatus } = {}) {
  clips = clips.filter(c => (c.narration || '').trim());
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    onStatus?.(`🔊 목소리 ${i + 1}/${clips.length}`);
    const raw = await generateSpeech({ text: c.narration, voice: voice || Platform.getPref('voice_name') || 'Kore', style: style ?? (Platform.getPref('voice_style') || ''), signal });
    const src = addVoiceMedia(raw, `목소리-${i + 1}`);
    c.voiceSrcId = src.id; c.voiceId = src.id;
    if (c.voiceTone && c.voiceTone.mode !== 'none') {
      const out = pitchShift(src.buffer, semitonesFor(src.buffer, c.voiceTone));
      c.voiceId = addVoiceMedia(out, `목소리-${i + 1}-톤`).id;
    }
    const v = mediaById(c.voiceId), m = clipMedia(c);
    const need = round1((c.voiceDelay ?? 0.3) + v.duration + 0.4);
    if (c.duration < need) c.duration = m?.type === 'video' ? Math.min(need, m.duration - c.trimStart) : need;
  }
}

/** 사진 없이: 명령어 → (AI 기획) → (AI 사진 생성) → 장면 구성. 반환: 요약 문구 */
async function buildFromScratch(command, { signal, onStatus, images = true } = {}) {
  let plan = null;
  const wantImages = images && genReady() && FEATURES.aiGenerate;
  if (aiReady() && FEATURES.aiEdit) {
    onStatus?.('✨ AI가 장면을 기획하는 중…');
    try { plan = await planScratchWithAI(command, wantImages, signal); } catch (e) { if (signal?.aborted) throw e; console.warn(e); onStatus?.('AI 기획 실패 — 기본 구성으로 만듭니다'); }
  }
  if (plan) {
    const clips = [];
    for (let i = 0; i < plan.scenes.length; i++) {
      const sc = plan.scenes[i];
      let media = -1;
      if (wantImages && sc.image_prompt) {
        onStatus?.(`🎨 장면 사진 만드는 중… ${i + 1}/${plan.scenes.length}`);
        try {
          const files = await generateImages({ prompt: sc.image_prompt + '. ' + REALISM, aspect: plan.aspect, count: 1, people: true, signal });
          const { added } = await loadFiles(files);
          if (added[0]) media = state.media.indexOf(added[0]);
        } catch (e) { if (signal?.aborted) throw e; console.warn('장면 사진 생성 실패, 글자 장면으로', e); }
      }
      clips.push({ media, caption: sc.caption, narration: sc.narration, emoji: sc.emoji, duration: sc.duration, transition: sc.transition, motion: i % 2 ? 'zoomOut' : 'zoomIn' });
    }
    plan = { ...plan, clips, filter: 'none', music: true, music_volume: S.bgmVolume, caption_style: { position: 'bottom', color: '#ffffff', box: true, animation: MOODS[plan.mood]?.anim || 'up' } };
  } else {
    plan = planFromScratch(command);
  }
  return { plan, summary: applyPlan(plan) };
}

/** 미리 점검 → 저장 → 검수. 반환: { blob, name, ext, result, qa, pre } */
async function produceVideo({ signal, onProgress, name }) {
  const pre = FEATURES.qa ? await preflight() : { fixed: [], errors: [] };
  if (pre.errors.length) throw new Error(pre.errors.join('\n'));
  const result = await exportVideo({ quality: S.quality, signal, onProgress, maxSizeMB: S.maxSizeMB });
  let qa = null;
  if (FEATURES.qa) {
    onProgress?.({ pct: 1, text: '🔍 자동 검수 중… (장면마다 화면 확인)' });
    try { qa = await verifyExport(result.blob, { duration: totalDuration(), width: result.width, height: result.height }); } catch (e) { qa = { ok: true, checked: 0, issues: [] }; }
  }
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const fname = (name || `영상뚝딱-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`) + '.' + result.ext;
  return { blob: result.blob, name: fname, ext: result.ext, result, qa, pre };
}
