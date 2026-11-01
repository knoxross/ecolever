/* 영상뚝딱 — 자동 검수 (옥의 티 잡기)
 *  저장 전: 빠진 파일, 영상 길이 넘침, 너무 짧은 장면, 전환이 장면보다 긴 경우, 비어 있는 글자 화면,
 *           목소리·음악 파일 누락, 글꼴 준비 — 고칠 수 있는 것은 자동으로 고칩니다.
 *  저장 후: 만들어진 파일을 다시 열어 길이·크기를 확인하고, 장면마다 화면을 뽑아
 *           미리보기와 같은지(검은 화면·멈춘 화면·깨짐) 비교합니다.
 */
'use strict';

/** 저장 전 점검. 반환: { fixed: string[], errors: string[] } */
async function preflight() {
  const fixed = [], errors = [];
  if (!state.clips.length) { errors.push('장면이 없습니다.'); return { fixed, errors }; }
  for (let i = 0; i < state.clips.length; i++) {
    const c = state.clips[i], n = i + 1;
    if (c.kind === 'media') {
      const m = clipMedia(c);
      if (!m) { errors.push(`${n}번 장면의 사진·영상 파일이 없습니다.`); continue; }
      if (m.type === 'video') {
        if (c.trimStart > m.duration - 0.2) { c.trimStart = Math.max(0, round2(m.duration - Math.min(c.duration, m.duration))); fixed.push(`${n}번 장면 시작 지점을 영상 길이 안으로 맞춤`); }
        if (c.trimStart + c.duration > m.duration + 0.01) { c.duration = round2(Math.max(0.3, m.duration - c.trimStart)); fixed.push(`${n}번 장면 길이를 원본 영상 길이에 맞춤`); }
        const v = getClipVideo(c);
        if (v.error) errors.push(`${n}번 장면 영상(${m.name})을 재생할 수 없습니다.`);
      }
    } else if (!(c.text || '').trim() && !(c.sub || '').trim() && !c.emoji) {
      fixed.push(`${n}번 글자 화면이 비어 있어 배경만 나옵니다`);
    }
    if (!(c.duration >= 0.3)) { c.duration = 0.3; fixed.push(`${n}번 장면이 너무 짧아 0.3초로 늘림`); }
    if (i > 0 && c.transition !== 'none' && c.transDur > c.duration * 0.9) { c.transDur = round1(c.duration * 0.6); fixed.push(`${n}번 장면 전환 시간을 장면 길이에 맞춤`); }
    if (c.voiceId && !mediaById(c.voiceId)) { c.voiceId = ''; fixed.push(`${n}번 장면의 사라진 목소리 연결을 정리`); }
  }
  if (S.bgmId && !mediaById(S.bgmId)) { S.bgmId = ''; fixed.push('사라진 배경음악 연결을 정리'); }
  if (state.clips[0].transition !== 'none') state.clips[0].transition = 'none';
  await preloadText();
  if (document.fonts && document.fonts.status !== 'loaded') await Promise.race([document.fonts.ready, wait(3000)]);
  return { fixed, errors };
}

/** 저장 후 검수. 반환: { ok, checked, issues: string[] } */
async function verifyExport(blob, expect) {
  const issues = [];
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = url;
  try {
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timeout')), 15000);
      v.onloadeddata = () => { clearTimeout(t); res(); };
      v.onerror = () => { clearTimeout(t); rej(new Error('열 수 없음')); };
    });
  } catch (e) {
    URL.revokeObjectURL(url);
    return { ok: false, checked: 0, issues: ['만들어진 파일을 다시 열 수 없습니다 (' + e.message + ')'], playable: false };
  }
  const dur = isFinite(v.duration) ? v.duration : expect.duration;
  if (Math.abs(dur - expect.duration) > 0.35) issues.push(`길이가 예상(${expect.duration.toFixed(1)}초)과 다릅니다: ${dur.toFixed(1)}초`);
  if (v.videoWidth !== expect.width || v.videoHeight !== expect.height) issues.push(`화면 크기가 예상과 다릅니다: ${v.videoWidth}×${v.videoHeight}`);

  // 장면마다 가운데 지점을 뽑아 미리보기와 비교
  const S2 = 64;
  const a = document.createElement('canvas'), b = document.createElement('canvas');
  a.width = b.width = S2; a.height = b.height = Math.max(8, Math.round(S2 * expect.height / expect.width));
  const ga = a.getContext('2d', { willReadFrequently: true }), gb = b.getContext('2d', { willReadFrequently: true });
  const lay = layout();
  let checked = 0;
  const prevQ = S.quality;
  for (let i = 0; i < lay.length; i++) {
    const L = lay[i];
    const t = L.start + Math.max(transLen(L.clip, i) + 0.05, L.clip.duration * 0.55);
    if (t >= dur - 0.05) continue;
    await new Promise(res => { const done = () => { v.removeEventListener('seeked', done); res(); }; v.addEventListener('seeked', done); v.currentTime = t; setTimeout(done, 3000); });
    ga.drawImage(v, 0, 0, a.width, a.height);
    // 같은 시점의 '정답' 화면
    if (typeof prepareFrame === 'function') await prepareFrame(t, lay);
    render(t);
    gb.drawImage(canvas, 0, 0, b.width, b.height);
    const da = ga.getImageData(0, 0, a.width, a.height).data, db = gb.getImageData(0, 0, b.width, b.height).data;
    let diff = 0, lumA = 0, lumB = 0;
    for (let k = 0; k < da.length; k += 4) {
      diff += Math.abs(da[k] - db[k]) + Math.abs(da[k + 1] - db[k + 1]) + Math.abs(da[k + 2] - db[k + 2]);
      lumA += da[k] + da[k + 1] + da[k + 2]; lumB += db[k] + db[k + 1] + db[k + 2];
    }
    const px = da.length / 4;
    diff /= px * 3; lumA /= px * 3; lumB /= px * 3;
    checked++;
    if (lumA < 8 && lumB > 30) issues.push(`${i + 1}번 장면이 검은 화면으로 저장되었습니다`);
    else if (diff > 38) issues.push(`${i + 1}번 장면 화면이 미리보기와 다릅니다 (차이 ${diff.toFixed(0)})`);
  }
  S.quality = prevQ;
  URL.revokeObjectURL(url);
  v.removeAttribute('src'); v.load();
  return { ok: issues.length === 0, checked, issues, playable: true };
}
