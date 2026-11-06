/* 영상뚝딱 — 동영상 파일 만들기
 * 1순위: WebCodecs 로 한 프레임씩 그려서 MP4(H.264+AAC) 로 인코딩 — 실시간보다 빠르고 끊김이 없습니다.
 * 2순위: WebCodecs 를 못 쓰는 환경이면 MediaRecorder 로 실시간 녹화합니다.
 */
'use strict';

class ExportCancelled extends Error { constructor() { super('취소했습니다.'); } }

/** 영상 비트레이트: 기본은 화질 우선, 용량 제한이 있으면 그 안에 들어가게 */
const VQ_FACTOR = { low: 0.06, rec: 0.12, high: 0.2 };
function targetVideoBitrate(W, H, fps, duration, maxMB, audioBps = 160000) {
  const quality = Math.round(W * H * fps * (VQ_FACTOR[S.vq] || 0.12) * (fps > 30 ? 0.75 : 1));
  if (!maxMB) return quality;
  const budget = (maxMB * 8e6 * 0.94) / Math.max(1, duration) - audioBps;
  return Math.max(250000, Math.min(quality, Math.round(budget)));
}
async function videoCodecCandidates(W, H, fps, bitrate, constant = false) {
  const out = [];
  if (!window.VideoEncoder) return out;
  const list = [
    { codec: 'avc1.640033', mux: 'avc', label: 'H.264' },
    { codec: 'avc1.4d0033', mux: 'avc', label: 'H.264' },
    { codec: 'avc1.42e033', mux: 'avc', label: 'H.264' },
    { codec: 'vp09.00.41.08', mux: 'vp9', label: 'VP9' },
    { codec: 'av01.0.08M.08', mux: 'av1', label: 'AV1' },
  ];
  for (const c of list) {
    const config = { codec: c.codec, width: W, height: H, bitrate, framerate: fps, latencyMode: 'quality', bitrateMode: constant ? 'constant' : 'variable' };
    if (c.mux === 'avc') config.avc = { format: 'avc' };
    try {
      let r = await VideoEncoder.isConfigSupported(config);
      if (!r.supported && constant) { config.bitrateMode = 'variable'; r = await VideoEncoder.isConfigSupported(config); }
      if (r.supported) out.push({ ...c, config: r.config || config });
    } catch (e) { /* 다음 후보 */ }
  }
  // 같은 코덱 계열은 하나만 (H.264 실패 시 VP9 → AV1 순으로 재시도)
  return out.filter((c, i) => out.findIndex(x => x.mux === c.mux) === i);
}
async function pickAudioCodec(sampleRate) {
  if (!window.AudioEncoder) return null;
  const list = [
    { codec: 'mp4a.40.2', mux: 'aac', label: 'AAC' },
    { codec: 'opus', mux: 'opus', label: 'Opus' },
  ];
  for (const c of list) {
    const config = { codec: c.codec, sampleRate, numberOfChannels: 2, bitrate: 160000 };
    try {
      const r = await AudioEncoder.isConfigSupported(config);
      if (r.supported) return { ...c, config: r.config || config };
    } catch (e) { /* 다음 후보 */ }
  }
  return null;
}

/** 배경음악 + 동영상 원본 소리를 하나로 섞기 */
async function renderAudioMix(total, sampleRate, onStep) {
  const length = Math.ceil(total * sampleRate);
  const oac = new OfflineAudioContext(2, length, sampleRate);
  let any = false;
  const bgm = mediaById(S.bgmId);
  if (bgm && bgm.buffer && S.bgmVolume > 0) {
    const src = oac.createBufferSource();
    src.buffer = bgm.buffer; src.loop = true;
    const g = oac.createGain();
    scheduleBgmGain(g.gain, 0, 0, total);
    src.connect(g); g.connect(oac.destination);
    src.start(0, S.bgmOffset % bgm.buffer.duration);
    any = true;
  }
  const lay = layout();
  for (let i = 0; i < lay.length; i++) {
    const L = lay[i], c = L.clip;
    if (!isVideoClip(c) || c.volume <= 0) continue;
    const m = clipMedia(c);
    onStep?.(`"${m.name}" 소리 읽는 중…`);
    const ab = await getVideoAudio(m);
    if (!ab) continue;
    // 다음 장면으로 넘어가는 동안 소리를 겹쳐서 부드럽게 (크로스페이드)
    const special = clipSpeed(c) !== 1 || c.reverse;
    const fadeIn = Math.max(0.06, transLen(c, i), c.fadeIn || 0);
    const nextT = i + 1 < lay.length ? transLen(lay[i + 1].clip, i + 1) : 0;
    const tail = special ? 0 : Math.max(0, Math.min(nextT, m.duration - c.trimStart - c.duration));
    const fadeOut = Math.max(0.06, tail || 0.08, c.fadeOut || 0);
    const end = L.end + tail;
    const src = oac.createBufferSource();
    src.buffer = special ? speedAudio(c, ab) : ab;
    const g = oac.createGain();
    g.gain.setValueAtTime(0, L.start);
    g.gain.linearRampToValueAtTime(c.volume, L.start + Math.min(fadeIn, c.duration / 2));
    g.gain.setValueAtTime(c.volume, Math.max(L.start + Math.min(fadeIn, c.duration / 2), end - fadeOut));
    g.gain.linearRampToValueAtTime(0, end);
    src.connect(g); g.connect(oac.destination);
    if (special) src.start(L.start, 0, c.duration);
    else src.start(L.start, c.trimStart, Math.min(c.duration + tail, ab.duration - c.trimStart));
    any = true;
  }
  for (const sg of voiceSegments().concat(sfxSegments())) {
    if (sg.start >= total) continue;
    const src = oac.createBufferSource();
    src.buffer = sg.buffer;
    const g = oac.createGain(); g.gain.value = sg.vol;
    src.connect(g); g.connect(oac.destination);
    src.start(sg.start);
    any = true;
  }
  if (!any) return null;
  onStep?.('소리 합치는 중…');
  return await oac.startRendering();
}

/** 속도·역재생 장면의 소리: 해당 구간을 잘라 거꾸로 / 높이는 그대로 빠르기만 바꿈 */
function speedAudio(c, ab) {
  const key = `${c.trimStart}|${c.duration}|${c.speed}|${c.reverse}`;
  if (c._aseg && c._aseg.key === key) return c._aseg.buf;
  const sr = ab.sampleRate, sp = clipSpeed(c);
  const s0 = Math.round(c.trimStart * sr), n = Math.max(1, Math.min(ab.length - s0, Math.round(srcSpan(c) * sr)));
  const outLen = Math.max(1, Math.round(c.duration * sr));
  const out = new AudioBuffer({ length: outLen, numberOfChannels: ab.numberOfChannels, sampleRate: sr });
  for (let ch = 0; ch < ab.numberOfChannels; ch++) {
    let seg = ab.getChannelData(ch).slice(s0, s0 + n);
    if (c.reverse) seg.reverse();
    if (Math.abs(sp - 1) > 0.001) seg = timeStretch(seg, 1 / sp, sr);
    out.getChannelData(ch).set(seg.subarray(0, outLen));
  }
  c._aseg = { key, buf: out };
  return out;
}
function seekExact(v, time) {
  return new Promise(resolve => {
    if (v.readyState >= 2 && !v.seeking && Math.abs(v.currentTime - time) < 0.0005) { resolve(); return; }
    let timer = 0;
    const done = () => { clearTimeout(timer); v.removeEventListener('seeked', done); resolve(); };
    v.addEventListener('seeked', done);
    timer = setTimeout(done, 4000);
    v.currentTime = time;
  });
}
/** t 시점 프레임에 필요한 동영상들을 정확한 위치로 이동 */
async function prepareFrame(t, lay) {
  const i = indexAt(t, lay), L = lay[i];
  const local = t - L.start;
  const jobs = [];
  if (isVideoClip(L.clip)) {
    const v = getClipVideo(L.clip);
    const md = clipMedia(L.clip).duration;
    jobs.push(seekExact(v, Math.min(srcTime(L.clip, clamp(local, 0, L.clip.duration)), md - 0.001)));
  }
  const total = lay[lay.length - 1].end, ll = loopEndLen();
  if (ll && t > total - ll && lay[0] !== L && isVideoClip(lay[0].clip)) jobs.push(seekExact(getClipVideo(lay[0].clip), srcTime(lay[0].clip, 0)));
  if (local < transLen(L.clip, i)) {
    const P = lay[i - 1];
    if (isVideoClip(P.clip)) {
      const v = getClipVideo(P.clip);
      jobs.push(seekExact(v, Math.min(srcTime(P.clip, P.clip.duration + local), clipMedia(P.clip).duration - 0.001)));
    }
  }
  if (window.overlayFrameJobs) jobs.push(...overlayFrameJobs(t));
  if (jobs.length) await Promise.all(jobs);
}

/**
 * opts: { quality, onProgress({stage, pct, text}), signal: {cancelled} }
 * 결과: { blob, ext, width, height, codecs }
 */
async function exportVideo(opts) {
  const { quality, onProgress, signal } = opts;
  const total = totalDuration();
  if (!state.clips.length || total <= 0) throw new Error('먼저 장면을 만들어 주세요.');
  pause();
  const prevQuality = S.quality;
  state.busy = true;
  try {
    setCanvasSize(quality);
    const W = canvas.width, H = canvas.height, fps = S.fps;
    onProgress({ pct: 0, text: '글꼴과 영상을 준비하는 중…' });
    await preloadText();
    state.clips.forEach(c => { if (isVideoClip(c)) { const v = getClipVideo(c); v.pause(); } });

    const sampleRate = 48000;
    const acodec = await pickAudioCodec(sampleRate);
    let vbit = targetVideoBitrate(W, H, fps, total, opts.maxSizeMB ?? S.maxSizeMB);
    const limitMB = opts.maxSizeMB ?? S.maxSizeMB;
    // 용량 제한 때문에 화소당 정보가 너무 적으면(뭉개짐) 해상도를 한 단계씩 낮춰 선명함 유지
    if (limitMB) {
      for (const q of [1080, 720, 540, 480]) {
        if (q >= Math.min(canvas.width, canvas.height)) continue;
        if (vbit / (canvas.width * canvas.height * fps) >= 0.045) break;
        setCanvasSize(q);
        vbit = targetVideoBitrate(canvas.width, canvas.height, fps, total, limitMB);
      }
    }
    const cands = await videoCodecCandidates(canvas.width, canvas.height, fps, vbit, !!limitMB);
    if (!cands.length || !window.Mp4Muxer) return await exportRealtime({ onProgress, signal, W, H });
    let mix = null;
    if (acodec) mix = await renderAudioMix(total, sampleRate, text => onProgress({ pct: 0, text }));
    if (signal.cancelled) throw new ExportCancelled();
    let lastErr = null;
    const maxMB = opts.maxSizeMB ?? S.maxSizeMB;
    for (const vcodec of cands) {
      try {
        let blob = await encodeTimeline({ W: canvas.width, H: canvas.height, fps, total, vcodec, acodec, mix, sampleRate, onProgress, signal });
        // 용량 제한을 넘으면 비율만큼 낮춰 한 번 더 (최대 2회)
        for (let k = 0; maxMB && blob.size > maxMB * 1e6 && k < 2; k++) {
          const cfg = Object.assign({}, vcodec.config, { bitrate: Math.max(200000, Math.round(vcodec.config.bitrate * (maxMB * 1e6 * 0.92) / blob.size)) });
          onProgress({ pct: 0, text: `용량 ${maxMB}MB 에 맞추는 중… (현재 ${(blob.size / 1e6).toFixed(1)}MB)` });
          blob = await encodeTimeline({ W: canvas.width, H: canvas.height, fps, total, vcodec: { ...vcodec, config: cfg }, acodec, mix, sampleRate, onProgress, signal });
          vcodec.config = cfg;
        }
        // 그래도 넘치면 압축기로 한 번 더 (해상도·비트레이트 자동 조절, 목표 보장)
        if (maxMB && blob.size > maxMB * 1e6) {
          onProgress({ pct: 0, text: `용량 ${maxMB}MB 에 맞게 압축하는 중…` });
          const c = await compressVideo(new File([blob], 'out.mp4', { type: 'video/mp4' }), { maxMB, signal, onProgress });
          return { blob: c.blob, ext: 'mp4', width: c.width, height: c.height, codecs: `${vcodec.label} (용량 맞춤)`, bitrate: 0 };
        }
        return { blob, ext: 'mp4', width: canvas.width, height: canvas.height, codecs: `${vcodec.label}${mix ? ' + ' + acodec.label : ''}`, bitrate: vcodec.config.bitrate };
      } catch (e) {
        if (e instanceof ExportCancelled) throw e;
        console.warn('인코더 오류, 다른 방식으로 다시 시도', vcodec.codec, e);
        lastErr = e;
        onProgress({ pct: 0, text: '다른 방식으로 다시 만드는 중…' });
      }
    }
    // 모든 인코더가 실패하면 실시간 녹화로
    console.warn('WebCodecs 실패, 실시간 녹화로 전환', lastErr);
    return await exportRealtime({ onProgress, signal, W, H });
  } finally {
    state.busy = false;
    setCanvasSize(prevQuality);
    S.quality = prevQuality;
    state.time = 0;
    requestRender();
  }
}

/** 소리(AudioBuffer)를 인코딩해 muxer 에 넣기 */
async function encodeAudioInto(muxer, mix, acodec, sampleRate) {
  let err = null;
  const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: e => { err = e; } });
  aenc.configure(acodec.config);
  const ch = mix.numberOfChannels;
  const L0 = mix.getChannelData(0), R0 = mix.getChannelData(Math.min(1, ch - 1));
  const N = 4096;
  for (let off = 0; off < mix.length; off += N) {
    const n = Math.min(N, mix.length - off);
    const data = new Float32Array(n * 2);
    data.set(L0.subarray(off, off + n), 0);
    data.set(R0.subarray(off, off + n), n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(off * 1e6 / sampleRate), data });
    aenc.encode(ad);
    ad.close();
    if (aenc.encodeQueueSize > 50) await wait(1);
  }
  await aenc.flush();
  aenc.close();
  if (err) throw err;
}
async function encodeTimeline({ W, H, fps, total, vcodec, acodec, mix, sampleRate, onProgress, signal }) {
  const { Muxer, ArrayBufferTarget } = window.Mp4Muxer;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: vcodec.mux, width: W, height: H, frameRate: fps },
    audio: mix ? { codec: acodec.mux, numberOfChannels: 2, sampleRate } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  let encError = null;
  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { encError = e; } });
  venc.configure(vcodec.config);
  try {
    if (mix) await encodeAudioInto(muxer, mix, acodec, sampleRate);
    const lay = layout();
    const frames = Math.max(1, Math.round(total * fps));
    const started = performance.now();
    for (let i = 0; i < frames; i++) {
      if (signal.cancelled) throw new ExportCancelled();
      if (encError) throw encError;
      const t = Math.min(i / fps, total - 0.0005);
      await prepareFrame(t, lay);
      render(t);
      const vf = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
      venc.encode(vf, { keyFrame: i % (fps * 2) === 0 });
      vf.close();
      while (venc.encodeQueueSize > 6) { if (encError) throw encError; await wait(4); }
      if (i % 3 === 0 || i === frames - 1) {
        const pct = (i + 1) / frames;
        const el = (performance.now() - started) / 1000;
        const eta = pct > 0.03 ? Math.max(0, el / pct - el) : null;
        onProgress({ pct, text: `장면 그리는 중… ${i + 1} / ${frames} 프레임` + (eta != null ? ` · 약 ${Math.ceil(eta)}초 남음` : '') });
        await wait(0);
      }
    }
    onProgress({ pct: 1, text: '파일 마무리하는 중…' });
    await venc.flush();
    if (encError) throw encError;
  } finally {
    try { venc.close(); } catch (e) { /* 이미 닫힘 */ }
  }
  muxer.finalize();
  return new Blob([target.buffer], { type: 'video/mp4' });
}

/* ------------------------------------------------------------------ 실시간 녹화 (예비) */
async function exportRealtime({ onProgress, signal, W, H }) {
  if (!window.MediaRecorder || !canvas.captureStream) throw new Error('이 기기에서는 동영상 만들기를 지원하지 않습니다.');
  const ac = ensureAudio();
  await ac.resume();
  const dest = ac.createMediaStreamDestination();
  audio.master.connect(dest);
  const types = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mime = types.find(t => MediaRecorder.isTypeSupported?.(t)) || '';
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  const vStream = canvas.captureStream(S.fps);
  const stream = new MediaStream([...vStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, Object.assign({ videoBitsPerSecond: Math.round(W * H * S.fps * 0.15), audioBitsPerSecond: 192000 }, mime ? { mimeType: mime } : {}));
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise(r => { rec.onstop = r; });
  const total = totalDuration();
  state.busy = false;
  state.time = 0;
  frame();
  await wait(400);
  rec.start(500);
  play();
  while (state.playing) {
    if (signal.cancelled) { pause(); break; }
    onProgress({ pct: state.time / total, text: `실시간 녹화 중… (이 기기는 빠른 저장을 지원하지 않아 영상 길이만큼 걸립니다)` });
    await wait(200);
  }
  await wait(250);
  rec.stop();
  await stopped;
  vStream.getTracks().forEach(t => t.stop());
  audio.master.disconnect(dest);
  if (signal.cancelled) throw new ExportCancelled();
  return { blob: new Blob(chunks, { type: (mime || 'video/webm').split(';')[0] }), ext, width: W, height: H, codecs: '실시간 녹화' };
}
