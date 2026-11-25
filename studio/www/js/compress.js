/* 영상뚝딱 — 용량 줄이기 (화질은 최대한 유지)
 *  - 아무 동영상(MP4/MOV 등)을 넣고 목표 용량(MB)을 정하면 그 안에 들어가게 다시 인코딩합니다.
 *  - 원리: 같은 화질에서 더 효율적인 압축(H.264 고효율 설정, 가변 비트레이트)으로 바꾸고,
 *          목표 용량이 너무 작아 화면이 뭉개질 정도면 해상도를 한 단계 낮춰 '선명함'을 지킵니다.
 *  - 결과가 목표보다 크면 자동으로 한 번 더 줄입니다.
 */
'use strict';

const SIZE_PRESETS = [
  { mb: 0, label: '화질 그대로, 최대한 가볍게' },
  { mb: 10, label: '10MB' },
  { mb: 25, label: '25MB (이메일 첨부)' },
  { mb: 50, label: '50MB' },
  { mb: 100, label: '100MB' },
  { mb: 300, label: '300MB' },
];

async function probeVideo(file) {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true; v.preload = 'metadata'; v.src = url;
  try {
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timeout')), 15000);
      v.onloadedmetadata = () => { clearTimeout(t); res(); };
      v.onerror = () => { clearTimeout(t); rej(new Error('이 동영상을 열 수 없습니다 (지원하지 않는 형식)')); };
    });
    const duration = isFinite(v.duration) ? v.duration : 0;
    return { duration, width: v.videoWidth, height: v.videoHeight, size: file.size, bitrate: duration ? file.size * 8 / duration : 0 };
  } finally { URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); }
}

/** mp4/mov 풀기 → { info, track, description, samples, rotation } 또는 null */
async function demuxMp4(file, onProgress) {
  if (!window.MP4Box) return null;
  const { createFile, DataStream, Endianness, MP4BoxBuffer } = window.MP4Box;
  const mp4 = createFile();
  let info = null, failed = null;
  const samples = [];
  mp4.onError = e => { failed = e; };
  mp4.onReady = i => {
    info = i;
    const vt = i.videoTracks && i.videoTracks[0];
    if (!vt) return;
    mp4.setExtractionOptions(vt.id, null, { nbSamples: 1e9 });
    mp4.start();
  };
  mp4.onSamples = (_id, _u, s) => { for (const x of s) samples.push(x); };
  const CH = 4 * 1024 * 1024;
  for (let off = 0; off < file.size; off += CH) {
    const ab = await file.slice(off, off + CH).arrayBuffer();
    mp4.appendBuffer(MP4BoxBuffer.fromArrayBuffer(ab, off));
    onProgress?.(off / file.size);
    if (failed) return null;
  }
  mp4.flush();
  if (!info || !info.videoTracks.length || !samples.length) return null;
  const vt = info.videoTracks[0];
  const trak = mp4.getTrackById(vt.id);
  let description;
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
    if (box) {
      const st = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
      box.write(st);
      description = new Uint8Array(st.buffer, 8);
      break;
    }
  }
  const m = vt.matrix || [65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824];
  let rotation = Math.round(Math.atan2(m[1], m[0]) * 180 / Math.PI);
  rotation = ((rotation % 360) + 360) % 360;
  return { info, track: vt, description, samples, rotation };
}

function planCompression(src, maxMB, fps) {
  const dur = Math.max(0.5, src.duration);
  let w = src.width, h = src.height;
  const audioBps = 128000;
  // 화질 우선 목표: 효율적인 H.264 설정에서 깨끗하게 보이는 수준
  const efficient = (W, H) => Math.round(W * H * fps * 0.075);
  let bitrate;
  if (maxMB) {
    bitrate = Math.max(200000, Math.floor((maxMB * 8e6 * 0.93) / dur - audioBps));
    bitrate = Math.min(bitrate, efficient(w, h), src.bitrate ? src.bitrate * 0.9 : Infinity);
  } else {
    bitrate = Math.min(efficient(w, h), src.bitrate ? Math.max(src.bitrate * 0.55, 600000) : Infinity);
  }
  // 픽셀당 정보가 너무 적으면(뭉개짐) 해상도를 낮춰 선명함 유지
  const short = Math.min(w, h);
  const steps = [1080, 720, 540, 480, 360];
  for (const target of steps) {
    if (short <= target) continue;
    const bpp = bitrate / (w * h * fps);
    if (bpp >= 0.045) break;
    const k = target / Math.min(w, h);
    w = Math.round(w * k / 2) * 2; h = Math.round(h * k / 2) * 2;
  }
  return { width: w & ~1, height: h & ~1, bitrate: Math.round(bitrate) };
}

/**
 * 용량 줄이기. opts: { maxMB, onProgress({pct,text}), signal:{cancelled} }
 * 결과: { blob, width, height, before, after }
 */
async function compressVideo(file, opts) {
  const { onProgress, signal } = opts;
  onProgress({ pct: 0, text: '동영상 살펴보는 중…' });
  const src = await probeVideo(file);
  if (!src.duration || !src.width) throw new Error('동영상 정보를 읽을 수 없습니다.');
  const isMp4 = /\.(mp4|m4v|mov)$/i.test(file.name) || /mp4|quicktime/.test(file.type);
  const dm = isMp4 ? await demuxMp4(file, p => onProgress({ pct: p * 0.05, text: '동영상 여는 중…' })).catch(() => null) : null;
  const fps = dm ? clamp(Math.round(dm.track.nb_samples / Math.max(0.5, src.duration)), 12, 60) : 30;

  // 소리
  onProgress({ pct: 0.05, text: '소리 읽는 중…' });
  let audioBuf = null;
  try { audioBuf = await decodeAudioFile(file); } catch (e) { audioBuf = null; }
  const acodec = audioBuf ? await pickAudioCodec(audioBuf.sampleRate) : null;
  if (acodec) acodec.config.bitrate = 128000;

  let plan = planCompression(src, opts.maxMB, fps);
  let lastBlob = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal.cancelled) throw new ExportCancelled();
    const blob = dm
      ? await transcodeDemuxed(dm, plan, fps, audioBuf, acodec, onProgress, signal, attempt)
      : await transcodeByElement(file, src, plan, fps, audioBuf, acodec, onProgress, signal, attempt);
    lastBlob = blob;
    if (!opts.maxMB || blob.size <= opts.maxMB * 1e6) break;
    // 목표보다 크면 비트레이트를 비율만큼 낮춰 다시
    const k = (opts.maxMB * 1e6 * 0.92) / blob.size;
    plan = planCompression({ ...src, bitrate: 0 }, opts.maxMB, fps);
    plan.bitrate = Math.max(150000, Math.round(plan.bitrate * Math.min(0.9, k)));
    onProgress({ pct: 0, text: `목표보다 커서 한 번 더 줄이는 중… (${(blob.size / 1e6).toFixed(1)}MB)` });
  }
  // 이미 충분히 가벼운 파일이면 더 커지지 않게 원본 유지
  if (!opts.maxMB && lastBlob.size >= file.size * 0.97) {
    return { blob: file, width: src.width, height: src.height, before: file.size, after: file.size, unchanged: true };
  }
  return { blob: lastBlob, width: plan.width, height: plan.height, before: file.size, after: lastBlob.size };
}

async function makeEncoder(plan, fps, onChunk) {
  const cands = [
    { codec: 'avc1.640033', mux: 'avc' }, { codec: 'avc1.4d0033', mux: 'avc' }, { codec: 'avc1.42e033', mux: 'avc' },
    { codec: 'vp09.00.41.08', mux: 'vp9' },
  ];
  for (const c of cands) {
    const cfg = { codec: c.codec, width: plan.width, height: plan.height, bitrate: plan.bitrate, framerate: fps, latencyMode: 'quality', bitrateMode: 'variable' };
    if (c.mux === 'avc') cfg.avc = { format: 'avc' };
    try { const r = await VideoEncoder.isConfigSupported(cfg); if (r.supported) return { ...c, config: r.config || cfg }; } catch (e) { /* 다음 */ }
  }
  throw new Error('이 기기에서 동영상 압축을 지원하지 않습니다.');
}
function newMuxer(enc, plan, fps, acodec, audioBuf) {
  const { Muxer, ArrayBufferTarget } = window.Mp4Muxer;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target, video: { codec: enc.mux, width: plan.width, height: plan.height, frameRate: fps },
    audio: acodec && audioBuf ? { codec: acodec.mux, numberOfChannels: 2, sampleRate: audioBuf.sampleRate } : undefined,
    fastStart: 'in-memory', firstTimestampBehavior: 'offset',
  });
  return { muxer, target };
}

async function transcodeDemuxed(dm, plan, fps, audioBuf, acodec, onProgress, signal, attempt) {
  const enc = await makeEncoder(plan, fps);
  const { muxer, target } = newMuxer(enc, plan, fps, acodec, audioBuf);
  if (acodec && audioBuf) await encodeAudioInto(muxer, audioBuf, acodec, audioBuf.sampleRate);
  let err = null;
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: e => { err = e; } });
  venc.configure(enc.config);
  const rot = dm.rotation;
  const codedW = dm.track.video?.width || dm.track.track_width, codedH = dm.track.video?.height || dm.track.track_height;
  const needDraw = rot !== 0 || plan.width !== codedW || plan.height !== codedH;
  const oc = needDraw ? new OffscreenCanvas(plan.width, plan.height) : null;
  const og = oc ? oc.getContext('2d') : null;
  let lastKey = -1e12, done = 0;
  const total = dm.samples.length;
  const dec = new VideoDecoder({
    output: frame => {
      try {
        let out = frame;
        if (needDraw) {
          og.save();
          og.translate(plan.width / 2, plan.height / 2);
          og.rotate(rot * Math.PI / 180);
          const sw = rot % 180 ? plan.height : plan.width, sh = rot % 180 ? plan.width : plan.height;
          og.drawImage(frame, -sw / 2, -sh / 2, sw, sh);
          og.restore();
          out = new VideoFrame(oc, { timestamp: frame.timestamp, duration: frame.duration ?? undefined });
          frame.close();
        }
        const key = out.timestamp - lastKey >= 2e6;
        if (key) lastKey = out.timestamp;
        venc.encode(out, { keyFrame: key });
        out.close();
        done++;
      } catch (e) { err = e; try { frame.close(); } catch (x) { /* 무시 */ } }
    },
    error: e => { err = e; },
  });
  const dcfg = { codec: dm.track.codec, codedWidth: codedW, codedHeight: codedH, description: dm.description, optimizeForLatency: false };
  const sup = await VideoDecoder.isConfigSupported(dcfg).catch(() => ({ supported: false }));
  if (!sup.supported) throw new Error('이 동영상의 압축 방식(' + dm.track.codec + ')을 이 기기에서 풀 수 없습니다.');
  dec.configure(dcfg);
  for (let i = 0; i < total; i++) {
    if (signal.cancelled) { try { dec.close(); venc.close(); } catch (e) { /* 무시 */ } throw new ExportCancelled(); }
    if (err) throw err;
    const s = dm.samples[i];
    dec.decode(new EncodedVideoChunk({ type: s.is_sync ? 'key' : 'delta', timestamp: Math.round(s.cts * 1e6 / s.timescale), duration: Math.round(s.duration * 1e6 / s.timescale), data: s.data }));
    while (dec.decodeQueueSize > 8 || venc.encodeQueueSize > 8) { if (err) throw err; await wait(2); }
    if (i % 10 === 0) {
      onProgress({ pct: 0.08 + 0.9 * (i / total), text: `줄이는 중… ${i + 1} / ${total} 프레임${attempt ? ' (재시도)' : ''}` });
      await wait(0);
    }
  }
  await dec.flush(); dec.close();
  await venc.flush(); venc.close();
  if (err) throw err;
  muxer.finalize();
  return new Blob([target.buffer], { type: 'video/mp4' });
}

async function transcodeByElement(file, src, plan, fps, audioBuf, acodec, onProgress, signal, attempt) {
  const enc = await makeEncoder(plan, fps);
  const { muxer, target } = newMuxer(enc, plan, fps, acodec, audioBuf);
  if (acodec && audioBuf) await encodeAudioInto(muxer, audioBuf, acodec, audioBuf.sampleRate);
  let err = null;
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: e => { err = e; } });
  venc.configure(enc.config);
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.src = url;
  await new Promise(r => { v.onloadeddata = r; v.onerror = r; });
  const oc = new OffscreenCanvas(plan.width, plan.height), og = oc.getContext('2d');
  const frames = Math.max(1, Math.floor(src.duration * fps));
  try {
    for (let i = 0; i < frames; i++) {
      if (signal.cancelled) throw new ExportCancelled();
      if (err) throw err;
      await seekExact(v, Math.min(i / fps, src.duration - 0.001));
      og.drawImage(v, 0, 0, plan.width, plan.height);
      const vf = new VideoFrame(oc, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
      venc.encode(vf, { keyFrame: i % (fps * 2) === 0 });
      vf.close();
      while (venc.encodeQueueSize > 8) await wait(2);
      if (i % 5 === 0) { onProgress({ pct: 0.08 + 0.9 * (i / frames), text: `줄이는 중… ${i + 1} / ${frames} 프레임${attempt ? ' (재시도)' : ''}` }); await wait(0); }
    }
    await venc.flush(); venc.close();
  } finally { URL.revokeObjectURL(url); }
  if (err) throw err;
  muxer.finalize();
  return new Blob([target.buffer], { type: 'video/mp4' });
}
