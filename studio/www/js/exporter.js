/* 영상뚝딱 — 동영상 파일 만들기
 * 1순위: WebCodecs 로 한 프레임씩 그려서 MP4(H.264+AAC) 로 인코딩 — 실시간보다 빠르고 끊김이 없습니다.
 * 2순위: WebCodecs 를 못 쓰는 환경이면 MediaRecorder 로 실시간 녹화합니다.
 */
'use strict';

class ExportCancelled extends Error { constructor() { super('취소했습니다.'); } }

async function pickVideoCodec(W, H, fps) {
  if (!window.VideoEncoder) return null;
  const bitrate = Math.round(W * H * fps * 0.12);
  const list = [
    { codec: 'avc1.640033', mux: 'avc', label: 'H.264' },
    { codec: 'avc1.4d0033', mux: 'avc', label: 'H.264' },
    { codec: 'avc1.42e033', mux: 'avc', label: 'H.264' },
    { codec: 'vp09.00.41.08', mux: 'vp9', label: 'VP9' },
    { codec: 'av01.0.08M.08', mux: 'av1', label: 'AV1' },
  ];
  for (const c of list) {
    const config = { codec: c.codec, width: W, height: H, bitrate, framerate: fps, latencyMode: 'quality' };
    if (c.mux === 'avc') config.avc = { format: 'avc' };
    try {
      const r = await VideoEncoder.isConfigSupported(config);
      if (r.supported) return { ...c, config: r.config || config };
    } catch (e) { /* 다음 후보 */ }
  }
  return null;
}
async function pickAudioCodec(sampleRate) {
  if (!window.AudioEncoder) return null;
  const list = [
    { codec: 'mp4a.40.2', mux: 'aac', label: 'AAC' },
    { codec: 'opus', mux: 'opus', label: 'Opus' },
  ];
  for (const c of list) {
    const config = { codec: c.codec, sampleRate, numberOfChannels: 2, bitrate: 192000 };
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
    const fadeIn = Math.max(0.06, transLen(c, i));
    const nextT = i + 1 < lay.length ? transLen(lay[i + 1].clip, i + 1) : 0;
    const tail = Math.max(0, Math.min(nextT, m.duration - c.trimStart - c.duration));
    const fadeOut = Math.max(0.06, tail || 0.08);
    const end = L.end + tail;
    const src = oac.createBufferSource();
    src.buffer = ab;
    const g = oac.createGain();
    g.gain.setValueAtTime(0, L.start);
    g.gain.linearRampToValueAtTime(c.volume, L.start + Math.min(fadeIn, c.duration / 2));
    g.gain.setValueAtTime(c.volume, Math.max(L.start + Math.min(fadeIn, c.duration / 2), end - fadeOut));
    g.gain.linearRampToValueAtTime(0, end);
    src.connect(g); g.connect(oac.destination);
    src.start(L.start, c.trimStart, Math.min(c.duration + tail, ab.duration - c.trimStart));
    any = true;
  }
  for (const sg of voiceSegments()) {
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
    jobs.push(seekExact(v, Math.min(L.clip.trimStart + clamp(local, 0, L.clip.duration), md - 0.001)));
  }
  if (local < transLen(L.clip, i)) {
    const P = lay[i - 1];
    if (isVideoClip(P.clip)) {
      const v = getClipVideo(P.clip);
      jobs.push(seekExact(v, Math.min(P.clip.trimStart + P.clip.duration + local, clipMedia(P.clip).duration - 0.001)));
    }
  }
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

    const vcodec = await pickVideoCodec(W, H, fps);
    if (!vcodec || !window.Mp4Muxer) {
      return await exportRealtime({ onProgress, signal, W, H });
    }
    const sampleRate = 48000;
    const acodec = await pickAudioCodec(sampleRate);
    let mix = null;
    if (acodec) mix = await renderAudioMix(total, sampleRate, text => onProgress({ pct: 0, text }));
    if (signal.cancelled) throw new ExportCancelled();

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
    const venc = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: e => { encError = e; },
    });
    venc.configure(vcodec.config);

    // 소리 먼저 인코딩
    if (mix) {
      const aenc = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: e => { encError = e; },
      });
      aenc.configure(acodec.config);
      const L0 = mix.getChannelData(0), R0 = mix.getChannelData(1);
      const N = 4096;
      for (let off = 0; off < mix.length; off += N) {
        const n = Math.min(N, mix.length - off);
        const data = new Float32Array(n * 2);
        data.set(L0.subarray(off, off + n), 0);
        data.set(R0.subarray(off, off + n), n);
        const ad = new AudioData({ format: 'f32-planar', sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(off * 1e6 / sampleRate), data });
        aenc.encode(ad);
        ad.close();
      }
      await aenc.flush();
      aenc.close();
    }

    // 화면 한 프레임씩
    const lay = layout();
    const frames = Math.max(1, Math.round(total * fps));
    const started = performance.now();
    for (let i = 0; i < frames; i++) {
      if (signal.cancelled) { try { venc.close(); } catch (e) { /* 무시 */ } throw new ExportCancelled(); }
      if (encError) throw encError;
      const t = Math.min(i / fps, total - 0.0005);
      await prepareFrame(t, lay);
      render(t);
      const vf = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
      venc.encode(vf, { keyFrame: i % (fps * 2) === 0 });
      vf.close();
      while (venc.encodeQueueSize > 6) await wait(4);
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
    venc.close();
    if (encError) throw encError;
    muxer.finalize();
    const blob = new Blob([target.buffer], { type: 'video/mp4' });
    return { blob, ext: 'mp4', width: W, height: H, codecs: `${vcodec.label}${mix ? ' + ' + acodec.label : ''}` };
  } finally {
    state.busy = false;
    setCanvasSize(prevQuality);
    S.quality = prevQuality;
    state.time = 0;
    requestRender();
  }
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
