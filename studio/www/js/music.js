/* 영상뚝딱 — 배경음악 만들기 (작곡기)
 *  파일 없이 프로그램 안에서 직접 작곡·합성합니다 → 저작권 걱정 없이 유튜브·SNS 에 쓸 수 있습니다.
 *  박자: 1/4 · 2/4 · 3/4 · 4/4 · 5/4 · 6/8 · 12/8, 빠르기(BPM), 분위기 9가지, 조(키), 길이, 악기 켜고 끄기
 *  같은 '번호(씨앗)'로 만들면 언제나 같은 곡이 나오고, '다시 만들기'를 누르면 새 곡이 나옵니다.
 */
'use strict';

const METERS = [
  { v: '1/4', label: '1/4 박자 (한 박씩 · 행진)', beats: 1, unit: 4 },
  { v: '2/4', label: '2/4 박자 (둘 · 폴카·동요)', beats: 2, unit: 4 },
  { v: '3/4', label: '3/4 박자 (셋 · 왈츠)', beats: 3, unit: 4 },
  { v: '4/4', label: '4/4 박자 (넷 · 가장 흔한 팝)', beats: 4, unit: 4 },
  { v: '5/4', label: '5/4 박자 (다섯 · 독특한 느낌)', beats: 5, unit: 4 },
  { v: '6/8', label: '6/8 박자 (출렁이는 느낌)', beats: 2, unit: 8, compound: true },
  { v: '12/8', label: '12/8 박자 (블루스·발라드)', beats: 4, unit: 8, compound: true },
];
// 각 박의 강세: 3 = 가장 셈(쿵), 2 = 중간(짝), 1 = 약함
const METER_ACCENT = { '1/4': [3], '2/4': [3, 2], '3/4': [3, 1, 1], '4/4': [3, 2, 3, 2], '5/4': [3, 1, 2, 3, 2], '6/8': [3, 2], '12/8': [3, 2, 3, 2] };

const MUSIC_STYLES = [
  { v: 'bright', label: '☀️ 경쾌한 팝', bpm: 118, minor: false, prog: [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']], lead: 'pluck', pad: 'piano', drums: 'pop', swing: 0 },
  { v: 'calm', label: '🌿 잔잔한 감성', bpm: 78, minor: false, prog: [[0, 'M7'], [9, 'm7'], [5, 'M7'], [7, 'sus']], lead: 'bell', pad: 'pad', drums: 'soft', swing: 0 },
  { v: 'epic', label: '🎬 웅장한 영화', bpm: 96, minor: true, prog: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']], lead: 'brass', pad: 'strings', drums: 'epic', swing: 0 },
  { v: 'cute', label: '🧸 귀여운 동요', bpm: 128, minor: false, prog: [[0, 'M'], [5, 'M'], [7, 'M'], [0, 'M']], lead: 'square', pad: 'piano', drums: 'light', swing: 0 },
  { v: 'lofi', label: '☕ 로파이 카페', bpm: 80, minor: false, prog: [[2, 'm7'], [7, '7'], [0, 'M7'], [9, 'm7']], lead: 'ep', pad: 'ep', drums: 'lofi', swing: 0.18 },
  { v: 'corp', label: '💼 기업 홍보', bpm: 110, minor: false, prog: [[0, 'M'], [5, 'M'], [9, 'm'], [7, 'M']], lead: 'pluck', pad: 'pad', drums: 'pop', swing: 0 },
  { v: 'hiphop', label: '🎧 힙합 그루브', bpm: 90, minor: true, prog: [[0, 'm7'], [5, 'm7'], [10, 'M'], [8, 'M7']], lead: 'ep', pad: 'ep', drums: 'hiphop', swing: 0.12 },
  { v: 'edm', label: '⚡ 신나는 EDM', bpm: 126, minor: true, prog: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']], lead: 'saw', pad: 'saw', drums: 'edm', swing: 0 },
  { v: 'luxury', label: '💎 고급 피아노', bpm: 72, minor: false, prog: [[0, 'M9'], [4, 'm7'], [9, 'm7'], [5, 'M7']], lead: 'bell', pad: 'piano', drums: 'none', swing: 0 },
];
const MUSIC_KEYS = [['C', 0], ['C#', 1], ['D', 2], ['Eb', 3], ['E', 4], ['F', 5], ['F#', 6], ['G', 7], ['Ab', 8], ['A', 9], ['Bb', 10], ['B', 11]];
const CHORD_IV = { M: [0, 4, 7], m: [0, 3, 7], M7: [0, 4, 7, 11], m7: [0, 3, 7, 10], 7: [0, 4, 7, 10], sus: [0, 5, 7], M9: [0, 4, 7, 11, 14] };

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const midiHz = n => 440 * Math.pow(2, (n - 69) / 12);

/** 곡의 박·마디 정보 */
function musicTiming(o) {
  const M = METERS.find(x => x.v === o.meter) || METERS[3];
  const beat = 60 / o.bpm;                 // 한 박 (x/8 겹박자는 점4분음표 한 박)
  const sub = M.compound ? 3 : 2;           // 한 박을 몇 개로 쪼개나 (겹박자는 셋잇단)
  const bar = beat * M.beats;
  // 1박·2박 마디는 너무 짧아서 화음을 2~4마디마다 바꿈
  const barsPerChord = M.beats === 1 ? 4 : M.beats === 2 ? 2 : 1;
  return { M, beat, sub, bar, barsPerChord, accent: METER_ACCENT[M.v] };
}

/**
 * 음악 만들기
 * o: { style, meter, bpm, key, seconds, seed, drums, bass, chords, melody, preview }
 * 결과: AudioBuffer (48kHz 스테레오)
 */
async function composeMusic(o) {
  const st = MUSIC_STYLES.find(s => s.v === o.style) || MUSIC_STYLES[0];
  o = Object.assign({ meter: '4/4', bpm: st.bpm, key: 0, seconds: 30, seed: 1, drums: true, bass: true, chords: true, melody: true }, o);
  o.bpm = clamp(+o.bpm || st.bpm, 40, 200);
  const T = musicTiming(o);
  const rnd = mulberry32((o.seed >>> 0) || 1);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  // 마디 수: 화음 묶음(4개) 단위로 맞춤 → 끝이 자연스럽게 으뜸화음으로
  const unitBars = T.barsPerChord * 4;
  let bars = Math.max(unitBars, Math.ceil(o.seconds / T.bar / unitBars) * unitBars);
  if (o.preview) bars = unitBars * (T.bar * unitBars < 6 ? 2 : 1);
  const tail = 2.2;
  const len = bars * T.bar + tail;
  const sr = 48000;
  const oac = new OfflineAudioContext(2, Math.ceil(sr * len), sr);

  // ----- 믹스: 악기 버스 → 잔향 → 압축 → 출력
  const master = oac.createGain(); master.gain.value = 0.8;
  const comp = oac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
  master.connect(comp); comp.connect(oac.destination);
  const verb = oac.createConvolver();
  { const n = Math.floor(sr * 2.2), ir = oac.createBuffer(2, n, sr); for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / n, 3.2); } verb.buffer = ir; }
  const verbIn = oac.createGain(); verbIn.gain.value = st.v === 'calm' || st.v === 'luxury' || st.v === 'epic' ? 0.32 : 0.16;
  verbIn.connect(verb); verb.connect(master);
  const bus = (vol, pan = 0, wet = true) => { const g = oac.createGain(); g.gain.value = vol; const p = oac.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(master); if (wet) p.connect(verbIn); return g; };
  const drumBus = bus(0.9, 0, false), bassBus = bus(0.55, 0, false), padBus = bus(0.32, -0.15), leadBus = bus(0.3, 0.18);
  const noiseBuf = (() => { const b = oac.createBuffer(1, sr, sr), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; return b; })();

  // ----- 악기
  const env = (g, t, a, peak, dec, sus, rel, end) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sus), t + a + dec);
    g.gain.setValueAtTime(Math.max(0.0001, peak * sus), Math.max(t + a + dec, end));
    g.gain.exponentialRampToValueAtTime(0.0001, Math.max(t + a + dec, end) + rel);
  };
  const osc = (type, f, t, end, dest, detune = 0) => { const x = oac.createOscillator(); x.type = type; x.frequency.value = f; x.detune.value = detune; x.connect(dest); x.start(t); x.stop(end + 0.05); return x; };
  const voice = (kind, note, t, dur, vel, dest) => {
    const f = midiHz(note), g = oac.createGain(), end = t + dur;
    const lp = oac.createBiquadFilter(); lp.type = 'lowpass'; lp.connect(g); g.connect(dest);
    switch (kind) {
      case 'piano': lp.frequency.value = 3200; osc('triangle', f, t, end + 0.8, lp); osc('sine', f * 2, t, end + 0.8, lp); env(g, t, 0.005, 0.5 * vel, 0.5, 0.25, 0.6, end); break;
      case 'pad': lp.frequency.value = 1800; osc('sawtooth', f, t, end + 1, lp, -7); osc('sawtooth', f, t, end + 1, lp, 7); env(g, t, 0.35, 0.16 * vel, 0.4, 0.8, 0.9, end); break;
      case 'strings': lp.frequency.setValueAtTime(900, t); lp.frequency.linearRampToValueAtTime(2400, end); osc('sawtooth', f, t, end + 1, lp, -9); osc('sawtooth', f, t, end + 1, lp, 9); osc('sawtooth', f / 2, t, end + 1, lp); env(g, t, 0.4, 0.14 * vel, 0.3, 0.85, 1.0, end); break;
      case 'ep': lp.frequency.value = 2200; osc('sine', f, t, end + 0.8, lp); osc('triangle', f * 2.001, t, end + 0.3, lp); env(g, t, 0.008, 0.42 * vel, 0.7, 0.3, 0.5, end); break;
      case 'saw': lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(900, end + 0.1); osc('sawtooth', f, t, end + 0.3, lp, -12); osc('sawtooth', f, t, end + 0.3, lp, 12); env(g, t, 0.01, 0.2 * vel, 0.15, 0.6, 0.15, end); break;
      case 'pluck': lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.3); osc('sawtooth', f, t, end + 0.4, lp); osc('square', f * 2, t, end + 0.4, lp); env(g, t, 0.003, 0.26 * vel, 0.25, 0.15, 0.25, end); break;
      case 'bell': lp.frequency.value = 6000; osc('sine', f, t, end + 1.5, lp); osc('sine', f * 3.01, t, t + 0.4, lp); env(g, t, 0.004, 0.36 * vel, 0.9, 0.18, 1.2, end); break;
      case 'square': lp.frequency.value = 3000; osc('square', f, t, end + 0.2, lp); env(g, t, 0.005, 0.14 * vel, 0.12, 0.5, 0.12, end); break;
      case 'brass': lp.frequency.setValueAtTime(600, t); lp.frequency.exponentialRampToValueAtTime(2600, t + 0.12); osc('sawtooth', f, t, end + 0.3, lp, -5); osc('sawtooth', f, t, end + 0.3, lp, 5); env(g, t, 0.06, 0.2 * vel, 0.2, 0.75, 0.3, end); break;
      case 'bass': lp.frequency.value = st.drums === 'edm' || st.drums === 'hiphop' ? 520 : 820; osc(st.drums === 'hiphop' ? 'sine' : 'triangle', f, t, end + 0.2, lp); osc('sine', f / 2, t, end + 0.2, lp); env(g, t, 0.006, 0.7 * vel, 0.2, 0.6, 0.12, end); break;
    }
  };
  const kick = (t, v = 1) => { const g = oac.createGain(); g.connect(drumBus); const x = osc('sine', 150, t, t + 0.45, g); x.frequency.setValueAtTime(st.drums === 'hiphop' || st.drums === 'edm' ? 130 : 150, t); x.frequency.exponentialRampToValueAtTime(42, t + 0.18); env(g, t, 0.002, 0.95 * v, 0.25, 0.01, 0.15, t + 0.2); };
  const noiseHit = (t, type, f, q, peak, dec, dest = drumBus) => { const s = oac.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.8 + rnd() * 0.4; const bf = oac.createBiquadFilter(); bf.type = type; bf.frequency.value = f; bf.Q.value = q; const g = oac.createGain(); s.connect(bf); bf.connect(g); g.connect(dest); env(g, t, 0.001, peak, dec, 0.01, 0.05, t + dec); s.start(t, rnd() * 0.5); s.stop(t + dec + 0.1); };
  const snare = (t, v = 1) => { noiseHit(t, 'bandpass', 1900, 0.8, 0.5 * v, 0.17); const g = oac.createGain(); g.connect(drumBus); osc('triangle', 190, t, t + 0.12, g); env(g, t, 0.001, 0.25 * v, 0.08, 0.01, 0.04, t + 0.08); };
  const clap = (t, v = 1) => { for (let k = 0; k < 3; k++) noiseHit(t + k * 0.011, 'bandpass', 1300, 1.2, 0.35 * v, 0.1); };
  const hat = (t, v = 1, open = false) => noiseHit(t, 'highpass', 7500, 0.7, 0.16 * v, open ? 0.22 : 0.045);
  const tom = (t, v = 1) => { const g = oac.createGain(); g.connect(drumBus); const x = osc('sine', 110, t, t + 0.6, g); x.frequency.exponentialRampToValueAtTime(55, t + 0.5); env(g, t, 0.002, 0.8 * v, 0.45, 0.01, 0.1, t + 0.45); };
  const shaker = (t, v = 1) => noiseHit(t, 'bandpass', 5200, 1.5, 0.08 * v, 0.05);

  // ----- 화음·음계
  const root = 48 + (+o.key || 0);  // 낮은 도(C3) 부근
  const scale = st.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const penta = st.minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
  const chordAt = bar => st.prog[Math.floor(bar / T.barsPerChord) % st.prog.length];
  const subLen = T.beat / T.sub;
  const swingT = (b, s) => { let t = b * T.beat + s * subLen; if (st.swing && !T.M.compound && s % 2 === 1) t += subLen * st.swing; return t; };

  // 멜로디 동기(motif): 2마디짜리 리듬·음 모양을 만들고 반복 + 변형 → 귀에 남는 선율
  const slotsPerBar = T.M.beats * T.sub;
  const motifBars = Math.max(1, Math.min(2, T.barsPerChord * 2));
  const motif = [];
  for (let i = 0; i < slotsPerBar * motifBars; i++) {
    const strong = i % T.sub === 0;
    const play = strong ? rnd() < 0.78 : rnd() < (st.bpm > 110 ? 0.32 : 0.22);
    motif.push(play ? { step: Math.floor(rnd() * 5) - 1, hold: strong && rnd() < 0.35 ? 2 : 1 } : null);
  }

  let lastLead = root + 24;
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * T.bar;
    const [deg, q] = chordAt(bar);
    const chord = CHORD_IV[q].map(iv => root + deg + iv);
    const isFirstOfChord = bar % T.barsPerChord === 0;
    const last = bar === bars - 1;
    const intro = bar < unitBars / 2 && bars > unitBars;           // 처음 반 묶음은 가볍게
    const fill = (bar + 1) % unitBars === 0 && !last;              // 묶음 끝마다 드럼 채우기
    const vel = last ? 0.9 : intro ? 0.75 : 1;

    // 화음
    if (o.chords && isFirstOfChord) {
      const dur = (last ? T.bar * T.barsPerChord + 1.2 : T.bar * T.barsPerChord) - 0.03;
      const top = chord.map(n => n + 12);
      if (st.pad === 'piano' || st.pad === 'ep') {
        // 피아노/일렉피아노: 박마다 펼친화음(아르페지오) 또는 강박에 화음
        const cycleBeats = T.M.beats * T.barsPerChord;
        for (let b = 0; b < cycleBeats; b++) {
          const tb = t0 + b * T.beat;
          if (T.M.v === '3/4' && b % 3 !== 0) { top.slice(1).forEach(n => voice(st.pad, n, tb, T.beat * 0.8, 0.55 * vel, padBus)); continue; }
          if (b === 0) top.forEach(n => voice(st.pad, n, tb, Math.min(dur, T.beat * 2), 0.7 * vel, padBus));
          else for (let s = 0; s < T.sub; s++) voice(st.pad, top[(b * T.sub + s) % top.length] + (s === T.sub - 1 ? 12 : 0), tb + s * subLen, subLen * 1.6, 0.42 * vel, padBus);
          if (last) break;
        }
      } else {
        top.forEach(n => voice(st.pad, n, t0, dur, vel, padBus));
      }
    }
    // 베이스
    if (o.bass) {
      const b0 = root - 12 + deg;
      if (last) voice('bass', b0, t0, T.bar, 0.9, bassBus);
      else for (let b = 0; b < T.M.beats; b++) {
        const acc = T.accent[b];
        const tb = t0 + b * T.beat;
        if (st.drums === 'edm') { voice('bass', b0, tb + T.beat / 2, T.beat * 0.4, 0.9, bassBus); continue; } // 엇박 베이스
        if (acc >= 3 || T.M.beats <= 2) voice('bass', b0, tb, T.beat * (T.M.compound ? 0.95 : 0.85), 0.95 * vel, bassBus);
        else if (st.drums === 'pop' || st.drums === 'light' || st.drums === 'hiphop') voice('bass', b0 + (b % 2 ? 7 : 0), tb + (st.drums === 'hiphop' ? subLen : 0), T.beat * 0.6, 0.7 * vel, bassBus);
        else if (T.M.v === '3/4' && st.drums !== 'none') { /* 왈츠: 1박만 */ }
      }
    }
    // 드럼
    if (o.drums && st.drums !== 'none' && !last) {
      for (let b = 0; b < T.M.beats; b++) {
        const acc = T.accent[b], tb = t0 + b * T.beat;
        const dk = st.drums;
        if (dk === 'soft') { if (acc >= 3) kick(tb, 0.45); for (let s = 0; s < T.sub; s++) shaker(swingT(b, s) + t0, s ? 0.6 : 1); if (acc === 2) noiseHit(tb, 'bandpass', 2500, 0.6, 0.12, 0.12); continue; }
        if (dk === 'epic') { if (acc >= 3) { kick(tb, 1); tom(tb + T.beat * (T.M.compound ? 2 / 3 : 0.5), 0.6); } if (acc === 2) { snare(tb, 0.7); tom(tb, 0.5); } if (fill && b === T.M.beats - 1) for (let s = 0; s < T.sub * 2; s++) tom(tb + s * subLen / 2, 0.4 + s * 0.1); continue; }
        // 팝·동요·로파이·힙합·EDM
        if (dk === 'edm') kick(tb, 1);
        else if (acc >= 3) kick(tb, intro ? 0.6 : 1);
        if (dk === 'hiphop' && acc >= 3 && rnd() < 0.6) kick(tb + subLen * (T.sub === 2 ? 1.5 : 2), 0.7);
        if (acc === 2 || (T.M.beats === 1 && bar % 2 === 1)) { if (intro) clap(tb, 0.5); else if (dk === 'light' || dk === 'corp') clap(tb, 0.8); else snare(tb, dk === 'lofi' ? 0.55 : 0.9); }
        if (T.M.v === '3/4' && acc === 1 && !intro) noiseHit(tb, 'bandpass', 2200, 0.8, 0.16, 0.09); // 왈츠 '짝짝'
        for (let s = 0; s < T.sub; s++) {
          const th = t0 + swingT(b, s);
          if (dk === 'edm') { if (s === T.sub - 1 || T.M.compound) hat(th, 1, s === T.sub - 1 && !T.M.compound); }
          else hat(th, (s ? 0.55 : 0.9) * (dk === 'lofi' ? 0.6 : 1) * (intro ? 0.6 : 1));
        }
        if (fill && b === T.M.beats - 1 && dk !== 'lofi') for (let s = 1; s < T.sub * 2; s++) snare(tb + s * subLen / 2, 0.25 + s * 0.08);
      }
      if (st.drums === 'lofi') noiseHit(t0, 'highpass', 3000, 0.3, 0.02, T.bar * 0.9); // 레코드판 잡음
    }
    if (last && o.drums && st.drums !== 'none') { kick(t0, 0.9); noiseHit(t0, 'highpass', 5000, 0.5, 0.18, 1.2); } // 마지막 심벌
    // 멜로디
    if (o.melody && !intro) {
      const variation = Math.floor(bar / motifBars) % 4 === 3;        // 4번째 반복마다 변형
      const mBar = bar % motifBars;
      if (last) { voice(st.lead, root + 24 + (st.minor ? 0 : 0), t0, T.bar, 0.8, leadBus); continue; }
      for (let i = 0; i < slotsPerBar; i++) {
        const mm = motif[mBar * slotsPerBar + i];
        if (!mm) continue;
        if (variation && rnd() < 0.4) continue;
        const b = Math.floor(i / T.sub), s = i % T.sub;
        const t = t0 + swingT(b, s);
        const strong = s === 0;
        let n;
        if (strong) {
          // 강박: 지금 화음의 음 중 지난 음과 가까운 것
          const cands = chord.flatMap(c => [c + 12, c + 24]).filter(x => x >= root + 14 && x <= root + 33);
          n = cands.reduce((a, c) => Math.abs(c - lastLead - mm.step) < Math.abs(a - lastLead - mm.step) ? c : a, cands[0]);
        } else {
          // 약박: 5음 음계 안에서 한두 칸 움직임
          const pool = []; for (let oc = 1; oc <= 2; oc++) penta.forEach(p => pool.push(root + 12 * oc + p + 0));
          const idx = pool.reduce((bi, p, k) => Math.abs(p - lastLead) < Math.abs(pool[bi] - lastLead) ? k : bi, 0);
          n = pool[clamp(idx + (mm.step || (rnd() < 0.5 ? -1 : 1)), 0, pool.length - 1)];
          if (variation) n = pool[clamp(idx + pick([-2, 2]), 0, pool.length - 1)];
        }
        lastLead = n;
        voice(st.lead, n, t, subLen * mm.hold * (st.lead === 'bell' || st.lead === 'ep' ? 1.6 : 0.9), (strong ? 0.85 : 0.6) * vel, leadBus);
      }
    }
  }
  // 끝: 서서히 줄이기
  master.gain.setValueAtTime(0.8, Math.max(0, len - tail - 0.2));
  master.gain.linearRampToValueAtTime(0.0001, len - 0.05);
  const buf = await oac.startRendering();
  // 소리 크기 맞추기 (가장 큰 소리 -1dB)
  let peak = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i += 3) peak = Math.max(peak, Math.abs(d[i])); }
  if (peak > 0) { const k = 0.89 / peak; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; } }
  return buf;
}

function musicName(o) {
  const st = MUSIC_STYLES.find(s => s.v === o.style) || MUSIC_STYLES[0];
  const key = MUSIC_KEYS.find(k => k[1] === +o.key)?.[0] || 'C';
  return `만든음악-${st.label.replace(/^\S+\s/, '').replace(/\s/g, '')}-${o.meter.split('/')[1]}분의${o.meter.split('/')[0]}박자-${o.bpm}BPM-${key}${st.minor ? '단조' : '장조'}-${o.seed}.wav`;
}

/** 만든 음악을 미디어로 넣고 배경음악으로 정하기 */
async function addComposedMusic(o, { asBgm = true } = {}) {
  const buf = await composeMusic(o);
  const file = new File([audioBufferToWav(buf)], musicName(o), { type: 'audio/wav' });
  const m = { id: uid(), type: 'audio', role: '', name: file.name, url: URL.createObjectURL(file), file, buffer: buf, duration: buf.duration };
  const T = musicTiming(o);
  m.beat = { bpm: Math.round(o.bpm), period: T.beat, offset: 0 };
  m.composed = { ...o };
  state.media.push(m);
  if (asBgm) { S.bgmId = m.id; S.bgmOffset = 0; }
  return m;
}

/** 명령어에서 음악 만들기 요청 읽기: "4/4박자", "3분의4박자", "120bpm", "왈츠", "음악 만들어" */
function parseMusicCommand(t) {
  t = t || '';
  const want = /(음악|노래|bgm|배경음)\s*(을|를)?\s*(만들|작곡|생성|넣어\s*줘)|작곡|박자|bpm/i.test(t);
  if (!want) return null;
  const o = {};
  let m = t.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*박/) || t.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (m) o.meter = `${m[1]}/${m[2]}`;
  m = t.match(/(\d)\s*분의\s*(\d{1,2})\s*박/); if (m) o.meter = `${m[2]}/${m[1]}`;
  if (/왈츠/.test(t)) o.meter = o.meter || '3/4';
  if (/행진/.test(t)) o.meter = o.meter || '2/4';
  if (o.meter && !METERS.some(x => x.v === o.meter)) o.meter = '4/4';
  m = t.match(/(\d{2,3})\s*bpm/i); if (m) o.bpm = clamp(+m[1], 40, 200);
  const styleRules = [['edm', /edm|클럽|일렉/i], ['hiphop', /힙합|랩|그루브/], ['lofi', /로파이|lo-?fi|카페/i], ['epic', /웅장|영화|장엄|트레일러|비장/], ['luxury', /고급|럭셔리|피아노|우아/], ['cute', /귀엽|동요|발랄|키즈/], ['calm', /잔잔|감성|차분|힐링/], ['corp', /기업|회사|홍보/], ['bright', /신나|경쾌|밝게|팝/]];
  for (const [k, re] of styleRules) if (re.test(t)) { o.style = k; break; }
  return o;
}
const MOOD_TO_MUSIC = { energetic: 'bright', calm: 'calm', luxury: 'luxury', cute: 'cute', clean: 'corp' };
