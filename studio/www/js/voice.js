/* 영상뚝딱 — 목소리
 *  - 목소리 높이 분석 (기본 주파수)
 *  - 목소리 톤 바꾸기: 음역(베이스·바리톤·테너·알토·메조소프라노·소프라노) 또는 계이름(도~시)
 *    → 길이는 그대로 두고 높이만 바꿉니다 (WSOLA 시간늘이기 + 리샘플링)
 *  - 마이크 녹음, WAV 파일 만들기
 */
'use strict';

const VOICE_RANGES = [
  { v: 'bass', label: '베이스 (가장 낮은 남성)', hz: 92 },
  { v: 'baritone', label: '바리톤 (중간 남성)', hz: 112 },
  { v: 'tenor', label: '테너 (높은 남성)', hz: 140 },
  { v: 'alto', label: '알토 (낮은 여성)', hz: 180 },
  { v: 'mezzo', label: '메조소프라노 (중간 여성)', hz: 210 },
  { v: 'soprano', label: '소프라노 (높은 여성)', hz: 250 },
];
const NOTES = [
  { v: 'do', label: '도', semi: 0 }, { v: 're', label: '레', semi: 2 }, { v: 'mi', label: '미', semi: 4 },
  { v: 'fa', label: '파', semi: 5 }, { v: 'sol', label: '솔', semi: 7 }, { v: 'la', label: '라', semi: 9 },
  { v: 'si', label: '시', semi: 11 }, { v: 'do2', label: '높은 도', semi: 12 },
];
const OCTAVES = [{ v: 2, label: '아주 낮게' }, { v: 3, label: '낮게 (남성 음역)' }, { v: 4, label: '보통 (여성 음역)' }, { v: 5, label: '높게' }];
const noteHz = (note, octave) => 261.63 * Math.pow(2, (NOTES.find(n => n.v === note)?.semi ?? 0) / 12) * Math.pow(2, octave - 4);

function monoOf(buffer) {
  const n = buffer.length, out = new Float32Array(n);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i] / buffer.numberOfChannels;
  }
  return out;
}

/** 말소리의 평균 높이(Hz). 못 찾으면 null */
function detectPitch(buffer) {
  let x = monoOf(buffer), sr = buffer.sampleRate;
  if (sr > 16000) { x = resample(x, sr / 16000); sr = 16000; } // 빠르게 분석
  if (x.length > sr * 30) x = x.subarray(0, sr * 30);
  const win = Math.round(sr * 0.04), hop = Math.round(sr * 0.02);
  const minLag = Math.floor(sr / 500), maxLag = Math.ceil(sr / 65);
  const f0s = [];
  let maxE = 0;
  for (let i = 0; i + win + maxLag < x.length; i += hop) {
    let e = 0; for (let j = 0; j < win; j++) e += x[i + j] * x[i + j];
    maxE = Math.max(maxE, e);
  }
  for (let i = 0; i + win + maxLag < x.length; i += hop) {
    let e = 0; for (let j = 0; j < win; j++) e += x[i + j] * x[i + j];
    if (e < maxE * 0.05) continue; // 조용한 구간 제외
    let best = 0, bestLag = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let s = 0, e2 = 0;
      for (let j = 0; j < win; j++) { s += x[i + j] * x[i + j + lag]; e2 += x[i + j + lag] * x[i + j + lag]; }
      const r = s / Math.sqrt(e * e2 + 1e-9);
      if (r > best) { best = r; bestLag = lag; }
    }
    if (best > 0.6 && bestLag) f0s.push(sr / bestLag);
  }
  if (f0s.length < 3) return null;
  f0s.sort((a, b) => a - b);
  return f0s[Math.floor(f0s.length / 2)];
}

/** WSOLA: 높이는 그대로, 길이만 factor 배 */
function timeStretch(x, factor, sr) {
  const N = Math.round(sr * 0.04) & ~1;        // 40ms 창
  const Hs = N / 2;                             // 출력 간격
  const Ha = Hs / factor;                       // 입력 간격
  const tol = Math.round(sr * 0.012);           // 비슷한 모양 찾는 범위
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const outLen = Math.ceil(x.length * factor) + N;
  const y = new Float32Array(outLen), norm = new Float32Array(outLen);
  let prevPos = 0;
  for (let k = 0, outPos = 0; ; k++, outPos += Hs) {
    const nominal = Math.round(k * Ha);
    if (nominal + N + tol >= x.length) break;
    let pos = nominal;
    if (k > 0) {
      // 이전 조각의 자연스러운 다음 부분과 가장 비슷한 위치 찾기
      const natural = prevPos + Hs;
      let best = -Infinity;
      for (let d = -tol; d <= tol; d += 2) {
        const p = nominal + d;
        if (p < 0 || p + N >= x.length || natural + Hs > x.length) continue;
        let s = 0;
        for (let j = 0; j < Hs; j += 2) s += x[natural + j] * x[p + j];
        if (s > best) { best = s; pos = p; }
      }
    }
    for (let j = 0; j < N; j++) { y[outPos + j] += x[pos + j] * win[j]; norm[outPos + j] += win[j]; }
    prevPos = pos;
  }
  for (let i = 0; i < outLen; i++) if (norm[i] > 1e-3) y[i] /= norm[i];
  return y;
}
function resample(x, ratio) { // ratio > 1 → 짧아짐(높아짐)
  const n = Math.floor(x.length / ratio), y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * ratio, i0 = Math.floor(p), f = p - i0;
    y[i] = (x[i0] || 0) * (1 - f) + (x[i0 + 1] || 0) * f;
  }
  return y;
}
/** semitones 만큼 높이 바꾸기 (길이 유지) */
function pitchShift(buffer, semitones) {
  if (Math.abs(semitones) < 0.05) return buffer;
  const sr = buffer.sampleRate, r = Math.pow(2, semitones / 12);
  const x = monoOf(buffer);
  const y = resample(timeStretch(x, r, sr), r).subarray(0, x.length);
  const out = new AudioBuffer({ length: x.length, numberOfChannels: 1, sampleRate: sr });
  // 클리핑 방지
  let peak = 0; for (let i = 0; i < y.length; i++) peak = Math.max(peak, Math.abs(y[i]));
  const g = peak > 0.98 ? 0.98 / peak : 1;
  const d = out.getChannelData(0);
  for (let i = 0; i < y.length; i++) d[i] = y[i] * g;
  return out;
}
/** 목표 톤: {mode:'range', range} | {mode:'note', note, octave} | {mode:'semi', semi} → 반음 수 */
function semitonesFor(buffer, tone) {
  if (!tone || tone.mode === 'none') return 0;
  if (tone.mode === 'semi') return clamp(+tone.semi || 0, -12, 12);
  const f0 = detectPitch(buffer);
  if (!f0) return 0;
  const target = tone.mode === 'range' ? (VOICE_RANGES.find(r => r.v === tone.range)?.hz || f0) : noteHz(tone.note, tone.octave);
  return clamp(12 * Math.log2(target / f0), -12, 12);
}

function audioBufferToWav(buffer) {
  const ch = buffer.numberOfChannels, sr = buffer.sampleRate, n = buffer.length;
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); data.setUint32(4, 36 + n * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true);
  ws(36, 'data'); data.setUint32(40, n * ch * 2, true);
  const chans = []; for (let c = 0; c < ch; c++) chans.push(buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = clamp(chans[c][i], -1, 1); data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Blob([data], { type: 'audio/wav' });
}
function pcm16ToAudioBuffer(bytes, sampleRate) {
  const n = Math.floor(bytes.length / 2);
  const out = new AudioBuffer({ length: Math.max(1, n), numberOfChannels: 1, sampleRate });
  const d = out.getChannelData(0), dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < n; i++) d[i] = dv.getInt16(i * 2, true) / 32768;
  return out;
}

/** 목소리 오디오를 미디어로 등록 */
function addVoiceMedia(buffer, name) {
  const blob = audioBufferToWav(buffer);
  const file = new File([blob], name.endsWith('.wav') ? name : name + '.wav', { type: 'audio/wav' });
  const m = { id: uid(), type: 'audio', role: 'voice', name: file.name, url: URL.createObjectURL(file), file, buffer, duration: buffer.duration };
  state.media.push(m);
  return m;
}

/* ---------- 마이크 녹음 ---------- */
const Recorder = (() => {
  let rec = null, chunks = [], stream = null;
  async function start() {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    chunks = [];
    rec = new MediaRecorder(stream);
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.start(250);
  }
  async function stop() {
    if (!rec) return null;
    const done = new Promise(r => { rec.onstop = r; });
    rec.stop();
    await done;
    stream.getTracks().forEach(t => t.stop());
    const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
    rec = null;
    return blob;
  }
  return { start, stop, active: () => !!rec };
})();
