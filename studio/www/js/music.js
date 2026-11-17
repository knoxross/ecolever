/* 영상뚝딱 — 배경음악 만들기 (작곡기 3.0)
 *  파일 없이 프로그램 안에서 직접 작곡·연주·녹음합니다 → 저작권 걱정 없이 유튜브·SNS 에 쓸 수 있습니다.
 *  - 실제 악기처럼: 피아노(현 공명·해머·댐퍼), 기타·우쿨렐레·베이스·콘트라베이스(줄 뜯기 물리 모델),
 *    일렉피아노(FM), 글로켄슈필, 플루트(숨소리·비브라토), 현악 합주(비브라토), 금관, 신스(EDM)
 *  - 드럼: 어쿠스틱 킥·스네어·브러시·림·박수·핑거 스냅·하이햇(금속음)·라이드·크래시·탐·타이코·셰이커
 *  - 사람 연주처럼: 박자·세기의 미세한 흔들림, 부드러운 화음 이동(보이스 리딩), 걷는 베이스, 스트럼
 *  - 곡 구성: 인트로 → 벌스 → 코러스 → 엔딩, 구간 사이 필인·라이저·크래시
 *  - 영상 맞춤 작곡: cues(장면 시작 시각·에너지 0~3·강조·정적)를 주면 음악이 장면 흐름을 따라감
 *  - 믹싱: 공간 잔향(초기 반사+잔향 꼬리), 버스 컴프레서, 소프트 클립, 리미터
 *  박자: 1/4 · 2/4 · 3/4 · 4/4 · 5/4 · 6/8 · 12/8 / 같은 '곡 번호(씨앗)'면 언제나 같은 곡
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

/* 분위기: 화음 진행(prog: 벌스, prog2: 코러스) · 드럼 세트 · 반주 · 베이스 · 멜로디 악기 · 잔향 */
const MUSIC_STYLES = [
  { v: 'bright', label: '☀️ 경쾌한 팝', bpm: 118, minor: false, prog: [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']], prog2: [[5, 'M'], [7, 'M'], [4, 'm'], [9, 'm']], kit: 'pop', comp: ['strum', 'pianoBlock'], bass: 'bass', lead: 'piano', lead2: 'glock', pad: null, swing: 0, verb: 0.2, room: 1.8 },
  { v: 'calm', label: '🌿 잔잔한 감성', bpm: 78, minor: false, prog: [[0, 'M7'], [9, 'm7'], [5, 'M7'], [7, 'sus']], prog2: [[5, 'M7'], [4, 'm7'], [2, 'm7'], [7, 'sus']], kit: 'soft', comp: ['pianoArp'], bass: 'upright', lead: 'piano', lead2: 'strings', pad: 'strings', swing: 0, verb: 0.34, room: 2.8 },
  { v: 'epic', label: '🎬 웅장한 영화', bpm: 96, minor: true, prog: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']], prog2: [[5, 'm'], [8, 'M'], [10, 'M'], [7, 'M']], kit: 'epic', comp: ['pianoOst'], bass: 'upright', lead: 'strings', lead2: 'brass', pad: 'strings', swing: 0, verb: 0.36, room: 3.0 },
  { v: 'cute', label: '🧸 귀여운 동요', bpm: 128, minor: false, prog: [[0, 'M'], [5, 'M'], [7, 'M'], [0, 'M']], prog2: [[9, 'm'], [5, 'M'], [7, 'M'], [0, 'M']], kit: 'light', comp: ['uke', 'pianoBlock'], bass: 'bass', lead: 'glock', lead2: 'flute', pad: null, swing: 0, verb: 0.16, room: 1.5 },
  { v: 'lofi', label: '☕ 로파이 카페', bpm: 80, minor: false, prog: [[2, 'm7'], [7, '7'], [0, 'M7'], [9, 'm7']], prog2: [[5, 'M7'], [4, 'm7'], [2, 'm7'], [7, '7']], kit: 'lofi', comp: ['rhodes'], bass: 'upright', lead: 'rhodes', lead2: 'flute', pad: null, swing: 0.18, verb: 0.22, room: 1.6, lofi: true },
  { v: 'corp', label: '💼 기업 홍보', bpm: 110, minor: false, prog: [[0, 'M'], [5, 'M'], [9, 'm'], [7, 'M']], prog2: [[5, 'M'], [0, 'M'], [7, 'M'], [9, 'm']], kit: 'pop', comp: ['pluckOst', 'pianoBlock'], bass: 'bass', lead: 'piano', lead2: 'glock', pad: 'strings', swing: 0, verb: 0.22, room: 2.0 },
  { v: 'hiphop', label: '🎧 힙합 그루브', bpm: 90, minor: true, prog: [[0, 'm7'], [5, 'm7'], [10, 'M'], [8, 'M7']], prog2: [[8, 'M7'], [10, 'M'], [0, 'm7'], [7, 'm7']], kit: 'hiphop', comp: ['rhodes'], bass: 'sub', lead: 'rhodes', lead2: 'flute', pad: null, swing: 0.12, verb: 0.18, room: 1.5 },
  { v: 'edm', label: '⚡ 신나는 EDM', bpm: 126, minor: true, prog: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']], prog2: [[8, 'M'], [10, 'M'], [0, 'm'], [7, 'm']], kit: 'edm', comp: ['saw'], bass: 'sub', lead: 'saw', lead2: 'glock', pad: 'saw', swing: 0, verb: 0.2, room: 1.8, sidechain: true },
  { v: 'luxury', label: '💎 고급 피아노', bpm: 72, minor: false, prog: [[0, 'M9'], [4, 'm7'], [9, 'm7'], [5, 'M7']], prog2: [[2, 'm7'], [7, '7'], [4, 'm7'], [9, 'm7']], kit: 'none', comp: ['pianoArp'], bass: 'upright', lead: 'piano', lead2: 'strings', pad: 'strings', swing: 0, verb: 0.36, room: 3.0 },
];
const MUSIC_KEYS = [['C', 0], ['C#', 1], ['D', 2], ['Eb', 3], ['E', 4], ['F', 5], ['F#', 6], ['G', 7], ['Ab', 8], ['A', 9], ['Bb', 10], ['B', 11]];
const CHORD_IV = { M: [0, 4, 7], m: [0, 3, 7], M7: [0, 4, 7, 11], m7: [0, 3, 7, 10], 7: [0, 4, 7, 10], sus: [0, 5, 7], M9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], add9: [0, 4, 7, 14] };

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

/* =============================================================== 악기 소리 만들기 (한 음씩 계산해 저장해 두고 재사용) */
const MSR = 48000;
const _noteCache = new Map();
function _hash(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
function _gen(key, fn) {
  let v = _noteCache.get(key);
  if (!v) { if (_noteCache.size > 1200) _noteCache.clear(); v = fn(mulberry32(_hash(key))); _noteCache.set(key, v); }
  return v;
}
function _lp1(x, fc) { const a = 1 - Math.exp(-2 * Math.PI * fc / MSR); let y = 0; for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] = y; } return x; }
function _hp1(x, fc) { const a = 1 - Math.exp(-2 * Math.PI * fc / MSR); let y = 0; for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] -= y; } return x; }
function _bp(x, f, q) {
  const w = 2 * Math.PI * f / MSR, al = Math.sin(w) / (2 * q), a0 = 1 + al;
  const b0 = al / a0, b2 = -al / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = x[i], y = b0 * v + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; }
  return x;
}
function _norm(x, to = 1) { let p = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > p) p = a; } if (p > 0) { const k = to / p; for (let i = 0; i < x.length; i++) x[i] *= k; } return x; }
function _noise(rnd, n) { const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = rnd() * 2 - 1; return x; }
const _vb = v => Math.round(clamp(v, 0.05, 1) * 8) / 8;          // 세기 단계
const _db = d => Math.min(6, Math.max(0.125, Math.round(d * 8) / 8)); // 길이 단계

/** 피아노: 3줄 현(조금씩 다른 음높이 → 자연스러운 울림), 배음의 비조화성, 해머 소리, 두 단계 감쇠, 댐퍼 */
function synPiano(midi, vel, dur) {
  return _gen(`pn|${midi}|${vel}|${dur}`, rnd => {
    const f0 = midiHz(midi), damp = midi <= 88, sus = Math.min(dur, 6), rel = damp ? 0.4 : 1.4;
    const len = Math.ceil((sus + rel) * MSR), out = new Float32Array(len);
    const B = 0.00011 * Math.pow(2, (midi - 60) / 13), tau0 = clamp(5 * Math.pow(2, -(midi - 45) / 20), 0.45, 8);
    const bright = 0.3 + 0.7 * vel, nP = Math.max(3, Math.min(18, Math.floor(10000 / f0)));
    const det = midi < 36 ? [0] : midi < 48 ? [-0.7, 0.7] : [-1.1, 0.15, 0.95];
    for (const c of det) {
      const k = Math.pow(2, c / 1200);
      for (let n = 1; n <= nP; n++) {
        const fn = n * f0 * Math.sqrt(1 + B * n * n) * k; if (fn > 15000) break;
        const amp = Math.pow(n, -(2.1 - 1.2 * bright)) * (0.25 + Math.abs(Math.sin(Math.PI * n * 0.12)));
        const tau = tau0 / (1 + 0.45 * (n - 1) * (0.6 + 0.4 * bright));
        const w = 2 * Math.PI * fn / MSR, cw = Math.cos(w), sw = Math.sin(w), ph = rnd() * 6.2832;
        let x = Math.cos(ph), y = Math.sin(ph), e1 = 0.62 * amp, e2 = 0.38 * amp;
        const d1 = Math.exp(-1 / (tau * 0.22 * MSR)), d2 = Math.exp(-1 / (tau * MSR));
        const end = Math.min(len, Math.ceil(tau * 7 * MSR));
        for (let i = 0; i < end; i++) { const nx = x * cw - y * sw; y = x * sw + y * cw; x = nx; out[i] += y * (e1 + e2); e1 *= d1; e2 *= d2; }
      }
    }
    const peak0 = (() => { let p = 0; for (let i = 0; i < Math.min(len, 4800); i++) p = Math.max(p, Math.abs(out[i])); return p || 1; })();
    const hl = Math.floor(0.015 * MSR), h = _noise(rnd, hl);
    for (let i = 0; i < hl; i++) h[i] *= Math.exp(-i / (0.0025 * MSR));
    _lp1(h, 1200 + 3500 * vel);
    for (let i = 0; i < hl; i++) out[i] += h[i] * peak0 * 0.35 * vel + Math.sin(2 * Math.PI * 95 * i / MSR) * Math.exp(-i / (0.006 * MSR)) * peak0 * 0.15;
    for (let i = 0; i < 70; i++) out[i] *= i / 70;
    if (damp) { const ds = Math.floor(sus * MSR), k = Math.exp(-1 / (0.07 * MSR)); let g = 1; for (let i = ds; i < len; i++) { g *= k; out[i] *= g; } }
    return _norm(out, 1);
  });
}

/** 줄 뜯기 물리 모델 (카플러스-스트롱 + 전대역 통과 필터로 정확한 음높이): 기타·우쿨렐레·베이스·콘트라베이스·피치카토·하프 */
const PLUCK = {
  guitar: { t60: 3.0, br: 0.55, pick: 0.17, rel: 0.12 }, uke: { t60: 1.3, br: 0.62, pick: 0.22, rel: 0.08 },
  bass: { t60: 2.4, br: 0.28, pick: 0.22, rel: 0.07 }, upright: { t60: 1.8, br: 0.16, pick: 0.3, rel: 0.14 },
  pizz: { t60: 0.5, br: 0.42, pick: 0.35, rel: 0.05 }, harp: { t60: 3.6, br: 0.45, pick: 0.5, rel: 2.0 },
};
function synPluck(kind, midi, vel, dur) {
  return _gen(`pl|${kind}|${midi}|${vel}|${dur}`, rnd => {
    const P = PLUCK[kind] || PLUCK.guitar, f0 = midiHz(midi);
    const t60 = clamp(P.t60 * Math.pow(2, -(midi - 52) / 30), 0.25, 6);
    const N = MSR / f0, Ni = Math.max(2, Math.floor(N - 0.6)), Dap = N - Ni - 0.5, C = (1 - Dap) / (1 + Dap);
    const sus = Math.min(dur, 5), len = Math.ceil((sus + P.rel * 3 + 0.05) * MSR), out = new Float32Array(len);
    const line = _noise(rnd, Ni);
    _lp1(line, 250 + 7000 * P.br * (0.45 + 0.55 * vel));
    const pk = Math.max(1, Math.floor(Ni * P.pick)), tmp = Float32Array.from(line);
    for (let i = 0; i < Ni; i++) line[i] = tmp[i] - 0.9 * tmp[(i + pk) % Ni];
    let mean = 0; for (let i = 0; i < Ni; i++) mean += line[i]; mean /= Ni; for (let i = 0; i < Ni; i++) line[i] -= mean;
    const g = Math.pow(10, -3 / (f0 * t60)), gRel = Math.pow(10, -3 / (f0 * P.rel)), relS = Math.floor(sus * MSR);
    let idx = 0, prev = 0, apx = 0, apy = 0;
    for (let i = 0; i < len; i++) {
      const cur = line[idx], avg = 0.5 * (cur + prev); prev = cur;
      const ap = C * avg + apx - C * apy; apx = avg; apy = ap;
      line[idx] = ap * (i < relS ? g : gRel); out[i] = cur;
      if (++idx >= Ni) idx = 0;
    }
    if (kind === 'bass' || kind === 'upright') { // 몸통 울림(기음 보강)
      const w = 2 * Math.PI * f0 / MSR, tau = t60 / 6.9;
      let e = 0.55; const d = Math.exp(-1 / (tau * MSR)), dr = Math.exp(-1 / (P.rel * MSR));
      for (let i = 0; i < len; i++) { out[i] += Math.sin(w * i) * e * Math.min(1, i / 120); e *= i < relS ? d : dr; }
    }
    return _norm(out, 1);
  });
}

/** 일렉피아노 (FM 합성 + 금속 톤 바 소리) */
function synEP(midi, vel, dur) {
  return _gen(`ep|${midi}|${vel}|${dur}`, () => {
    const f0 = midiHz(midi), sus = Math.min(dur, 5), rel = 0.22, len = Math.ceil((sus + rel * 3) * MSR), out = new Float32Array(len);
    const tauA = clamp(2.6 * Math.pow(2, -(midi - 60) / 24), 0.6, 4.5), I0 = 0.5 + 2.2 * vel, w = 2 * Math.PI * f0 / MSR, wt = w * Math.min(14, 11000 / f0);
    const relS = Math.floor(sus * MSR);
    for (let i = 0; i < len; i++) {
      const t = i / MSR;
      let env = (1 - Math.exp(-t / 0.002)) * Math.exp(-t / tauA);
      if (i > relS) env *= Math.exp(-(i - relS) / (rel * MSR));
      const I = I0 * Math.exp(-t / 0.28) + 0.3;
      out[i] = Math.sin(w * i + I * Math.sin(w * i)) * env + 0.12 * vel * Math.sin(wt * i) * Math.exp(-t / 0.018);
    }
    return _norm(out, 1);
  });
}
/** 글로켄슈필 (철금): 비조화 배음 + 타격음 */
function synGlock(midi, vel) {
  return _gen(`gl|${midi}|${vel}`, rnd => {
    const f0 = midiHz(midi), len = Math.ceil(2.2 * MSR), out = new Float32Array(len);
    const R = [1, 2.76, 5.4, 8.93], A = [1, 0.45 * vel + 0.1, 0.25 * vel, 0.1 * vel], Tau = [1.6, 0.5, 0.2, 0.08];
    R.forEach((r, k) => { if (f0 * r > 16000) return; const w = 2 * Math.PI * f0 * r / MSR, d = Math.exp(-1 / (Tau[k] * MSR)); let e = A[k]; for (let i = 0; i < len; i++) { out[i] += Math.sin(w * i) * e; e *= d; } });
    const s = _hp1(_noise(rnd, 300), 3000); for (let i = 0; i < 300; i++) out[i] += s[i] * 0.3 * Math.exp(-i / 40);
    return _norm(out, 1);
  });
}
/** 플루트: 배음 + 숨소리 + 늦게 들어오는 비브라토 */
function synFlute(midi, vel, dur) {
  return _gen(`fl|${midi}|${vel}|${dur}`, rnd => {
    const f0 = midiHz(midi), sus = Math.min(dur, 5), len = Math.ceil((sus + 0.25) * MSR), out = new Float32Array(len);
    const br = _noise(rnd, len); _hp1(br, 900); _lp1(br, 4500);
    let ph = 0; const relS = Math.floor(sus * MSR);
    for (let i = 0; i < len; i++) {
      const t = i / MSR, vib = 1 + 0.006 * Math.min(1, Math.max(0, (t - 0.25) / 0.3)) * Math.sin(2 * Math.PI * 5.1 * t);
      ph += 2 * Math.PI * f0 * vib / MSR;
      let env = Math.min(1, t / 0.07); if (i > relS) env *= Math.exp(-(i - relS) / (0.09 * MSR));
      const chiff = Math.exp(-t / 0.04) * 0.5;
      out[i] = (Math.sin(ph) + 0.22 * Math.sin(2 * ph) + 0.07 * Math.sin(3 * ph)) * env * (0.55 + 0.45 * vel) + br[i] * (0.05 + chiff * 0.25) * env;
    }
    return _norm(out, 1);
  });
}
/** 서브 베이스 (힙합·EDM): 사인 + 약한 배음 + 부드러운 찌그러짐 */
function synSub(midi, vel, dur) {
  return _gen(`sb|${midi}|${vel}|${dur}`, () => {
    const f0 = midiHz(midi), sus = Math.min(dur, 4), len = Math.ceil((sus + 0.1) * MSR), out = new Float32Array(len), relS = Math.floor(sus * MSR);
    for (let i = 0; i < len; i++) {
      const t = i / MSR; let env = Math.min(1, t / 0.006) * (0.75 + 0.25 * Math.exp(-t / 0.3)); if (i > relS) env *= Math.exp(-(i - relS) / (0.03 * MSR));
      const w = 2 * Math.PI * f0 * t; out[i] = Math.tanh(1.6 * (Math.sin(w) + 0.18 * Math.sin(2 * w))) * env;
    }
    return _norm(out, 1);
  });
}

/* ---------- 드럼 (금속성 심벌은 6개 사각파의 비조화 합 — 실제 심벌처럼 반짝임) ---------- */
function _metal(base, len, rnd) {
  const R = [1, 1.4471, 1.617, 1.9265, 2.5028, 2.6637], out = new Float32Array(len);
  R.forEach(r => { const f = base * r * (1 + (rnd() - 0.5) * 0.01), w = f / MSR; let ph = rnd(); for (let i = 0; i < len; i++) { ph += w; out[i] += (ph % 1) < 0.5 ? 1 : -1; } });
  return out;
}
function synDrum(type, variant = 0) {
  return _gen(`dr|${type}|${variant}`, rnd => {
    const env = (x, tau, att = 0) => { for (let i = 0; i < x.length; i++) { const t = i / MSR; x[i] *= (att ? Math.min(1, t / att) : 1) * Math.exp(-t / tau); } return x; };
    const N = s => Math.ceil(s * MSR);
    let out;
    switch (type) {
      case 'kick': case 'kickDeep': case 'kickSoft': {
        const deep = type === 'kickDeep', soft = type === 'kickSoft';
        const len = N(deep ? 0.8 : 0.5); out = new Float32Array(len); let ph = 0;
        for (let i = 0; i < len; i++) { const t = i / MSR, f = (deep ? 42 : soft ? 55 : 50) + (deep ? 95 : soft ? 60 : 105) * Math.exp(-t / (deep ? 0.04 : 0.028)); ph += 2 * Math.PI * f / MSR; out[i] = Math.sin(ph) * Math.exp(-t / (deep ? 0.42 : soft ? 0.16 : 0.22)); }
        if (deep) for (let i = 0; i < len; i++) out[i] = Math.tanh(1.5 * out[i]);
        const cl = _hp1(_noise(rnd, N(0.004)), soft ? 1500 : 2500); for (let i = 0; i < cl.length; i++) out[i] += cl[i] * (soft ? 0.12 : 0.3) * (1 - i / cl.length);
        if (soft) _lp1(out, 2500);
        break;
      }
      case 'snare': {
        const len = N(0.45); out = new Float32Array(len);
        let p1 = 0, p2 = 0;
        for (let i = 0; i < len; i++) { const t = i / MSR; p1 += 2 * Math.PI * (178 - 15 * Math.min(1, t / 0.05)) / MSR; p2 += 2 * Math.PI * 330 / MSR; out[i] = 0.55 * Math.sin(p1) * Math.exp(-t / 0.07) + 0.25 * Math.sin(p2) * Math.exp(-t / 0.045); }
        const n = env(_bp(_noise(rnd, len), 4200, 0.6), 0.16); for (let i = 0; i < len; i++) out[i] += 0.9 * n[i];
        break;
      }
      case 'brush': out = env(_hp1(_lp1(_noise(rnd, N(0.4)), 5000), 500), 0.2, 0.02); break;
      case 'rim': { const len = N(0.08); out = new Float32Array(len); for (let i = 0; i < len; i++) out[i] = Math.sin(2 * Math.PI * 1700 * i / MSR) * Math.exp(-i / (0.008 * MSR)); const n = env(_bp(_noise(rnd, len), 2600, 1.5), 0.012); for (let i = 0; i < len; i++) out[i] += n[i] * 0.7; break; }
      case 'snap': { const len = N(0.12); out = env(_bp(_noise(rnd, len), 2800, 2.2), 0.018); for (let i = 0; i < len; i++) out[i] += Math.sin(2 * Math.PI * 1300 * i / MSR) * Math.exp(-i / (0.006 * MSR)) * 0.4; break; }
      case 'clap': {
        const len = N(0.35); const n = _bp(_noise(rnd, len), 1250, 1.1); out = new Float32Array(len);
        for (let i = 0; i < len; i++) { const t = i / MSR; let e = Math.exp(-t / 0.13) * 0.6; for (const o of [0, 0.009, 0.018, 0.026]) if (t >= o) e += Math.exp(-(t - o) / 0.006); out[i] = n[i] * e; }
        break;
      }
      case 'hatC': out = env(_hp1(_hp1(_metal(330, N(0.15), rnd), 7000), 7000), 0.035); break;
      case 'hatO': out = env(_hp1(_hp1(_metal(330, N(0.7), rnd), 6500), 6500), 0.26); break;
      case 'ride': { const len = N(1.8); out = env(_hp1(_metal(250, len, rnd), 4000), 0.9); const b = env(_hp1(_noise(rnd, len), 6000), 0.5); for (let i = 0; i < len; i++) out[i] += b[i] * 0.4; break; }
      case 'crash': { const len = N(2.6); out = env(_hp1(_noise(rnd, len), 2500), 1.1); const m = env(_hp1(_metal(420, len, rnd), 3000), 0.7); for (let i = 0; i < len; i++) out[i] = out[i] * 0.8 + m[i] * 0.35; break; }
      case 'shaker': out = env(_bp(_noise(rnd, N(0.12)), 6500, 1), 0.035, 0.008); break;
      case 'tamb': { const len = N(0.25); out = env(_hp1(_metal(1600, len, rnd), 6000), 0.08); const n = env(_hp1(_noise(rnd, len), 7000), 0.1); for (let i = 0; i < len; i++) out[i] += n[i]; break; }
      case 'tomL': case 'tomM': case 'tomH': case 'taiko': {
        const f0 = { tomL: 88, tomM: 122, tomH: 165, taiko: 62 }[type], dec = type === 'taiko' ? 0.65 : 0.33, len = N(dec * 3); out = new Float32Array(len); let ph = 0;
        for (let i = 0; i < len; i++) { const t = i / MSR; ph += 2 * Math.PI * f0 * (1 + 0.35 * Math.exp(-t / 0.05)) / MSR; out[i] = Math.sin(ph) * Math.exp(-t / dec); }
        const n = env(_lp1(_noise(rnd, len), type === 'taiko' ? 400 : 1500), 0.05); for (let i = 0; i < len; i++) out[i] += n[i] * 0.4;
        break;
      }
      case 'revCrash': { const c = synDrum('crash', 1); out = Float32Array.from(c.subarray(0, N(1.6))).reverse(); break; }
      case 'vinyl': {
        const len = N(4); out = _lp1(_noise(rnd, len), 3000); for (let i = 0; i < len; i++) out[i] *= 0.06;
        for (let k = 0; k < 40; k++) { const p = Math.floor(rnd() * (len - 50)), a = (rnd() * 0.6 + 0.2) * (rnd() < 0.5 ? -1 : 1); for (let j = 0; j < 30; j++) out[p + j] += a * Math.exp(-j / 6); }
        break;
      }
      default: out = new Float32Array(10);
    }
    return _norm(out, 1);
  });
}

/* =============================================================== 화음 · 선율 도우미 */
/** 앞 화음과 가장 가깝게 이어지는 자리바꿈 (사람이 치듯 손이 적게 움직이게) */
function voiceLead(pcs, prev, lo, hi, n = 4) {
  const tones = pcs.length >= n ? pcs.slice(0, n) : pcs.concat(pcs).slice(0, n);
  const cands = tones.map(pc => { const a = []; for (let m = lo; m <= hi; m++) if (((m - pc) % 12 + 12) % 12 === 0) a.push(m); return a; });
  let best = null, bestS = Infinity;
  const pick = (i, cur) => {
    if (i === cands.length) {
      const s = cur.slice().sort((a, b) => a - b);
      if (new Set(s).size < s.length) return;
      const spread = s[s.length - 1] - s[0]; if (spread > 19 || spread < 5) return;
      let sc = 0; if (prev) for (let k = 0; k < s.length; k++) sc += Math.abs(s[k] - (prev[k] ?? prev[prev.length - 1])); else sc = Math.abs((s[0] + s[s.length - 1]) / 2 - (lo + hi) / 2);
      if (sc < bestS) { bestS = sc; best = s; }
      return;
    }
    for (const m of cands[i]) { cur.push(m); pick(i + 1, cur); cur.pop(); }
  };
  pick(0, []);
  return best || tones.map(pc => { let m = lo; while (((m - pc) % 12 + 12) % 12) m++; return m; }).sort((a, b) => a - b);
}

/* =============================================================== 작곡 · 편곡 · 녹음 */
/**
 * 음악 만들기
 * o: { style, meter, bpm, key, seconds, seed, drums, bass, chords, melody, preview,
 *      cues: [{ t: 초, energy: 0~3, hit: 강조(크래시·한 방), stop: 직전 0.3초 정적 }] }   ← 영상 맞춤 작곡
 * 결과: AudioBuffer (48kHz 스테레오)
 */
async function composeMusic(o) {
  const st = MUSIC_STYLES.find(s => s.v === o.style) || MUSIC_STYLES[0];
  o = Object.assign({ meter: '4/4', bpm: st.bpm, key: 0, seconds: 30, seed: 1, drums: true, bass: true, chords: true, melody: true }, o);
  o.bpm = clamp(+o.bpm || st.bpm, 40, 200);
  const T = musicTiming(o), A = T.accent, beats = T.M.beats, sub = T.sub;
  const rnd = mulberry32((o.seed >>> 0) || 1);
  const unitBars = T.barsPerChord * 4;
  let bars = Math.max(unitBars, Math.ceil(o.seconds / T.bar / unitBars) * unitBars);
  if (o.preview) bars = unitBars * (T.bar * unitBars < 6 ? 2 : 1);
  const tail = 2.2, len = bars * T.bar + tail;
  const oac = new OfflineAudioContext(2, Math.ceil(MSR * len), MSR);
  const subLen = T.beat / sub;
  const swingAt = s => (st.swing && !T.M.compound && s % 2 === 1 ? subLen * st.swing : 0);
  const human = (amt = 0.007) => (rnd() + rnd() - 1) * amt;
  const hv = v => clamp(v * (1 + (rnd() - 0.5) * 0.16), 0.05, 1);

  // ---------- 믹싱 회로: 악기 버스 → (잔향) → 컴프레서 → 소프트 클립 → 리미터
  const pre = oac.createGain(); pre.gain.value = 1;
  const hp = oac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 30;
  const comp = oac.createDynamicsCompressor(); Object.assign(comp, {}); comp.threshold.value = -20; comp.knee.value = 10; comp.ratio.value = 2; comp.attack.value = 0.012; comp.release.value = 0.22;
  const shaper = oac.createWaveShaper(); { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; c[i] = Math.tanh(1.3 * x) / Math.tanh(1.3); } shaper.curve = c; shaper.oversample = '2x'; }
  const lim = oac.createDynamicsCompressor(); lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.08;
  let master = pre;
  if (st.lofi) { const lp = oac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7500; pre.connect(lp); master = lp; }
  master.connect(hp); hp.connect(comp); comp.connect(shaper); shaper.connect(lim); lim.connect(oac.destination);
  const verb = oac.createConvolver(); verb.buffer = makeRoomIR(oac, st.room, o.seed);
  const verbIn = oac.createGain(); verbIn.gain.value = 1; verbIn.connect(verb); verb.connect(pre);
  const bus = (vol, send, eq) => {
    const g = oac.createGain(); g.gain.value = vol; let tail0 = g;
    for (const [type, f, gain, q] of eq || []) { const b = oac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (gain != null) b.gain.value = gain; if (q != null) b.Q.value = q; tail0.connect(b); tail0 = b; }
    tail0.connect(pre); const s = oac.createGain(); s.gain.value = send; tail0.connect(s); s.connect(verbIn);
    return g;
  };
  const B = {
    drums: bus(0.74, st.verb * 0.35, [['highshelf', 9000, -3]]), perc: bus(0.36, st.verb * 0.6, [['highshelf', 8000, -4]]),
    bass: bus(0.46, 0.03, [['lowpass', st.bass === 'sub' ? 400 : 1800, null, 0.6]]),
    keys: bus(0.5, st.verb), gtr: bus(0.46, st.verb * 0.8, [['peaking', 110, 3, 1.2], ['peaking', 230, 2, 1.4], ['peaking', 2800, -2, 1], ['highshelf', 7000, -4]]),
    str: bus(0.34, st.verb * 1.3), lead: bus(0.42, st.verb * 1.1), syn: bus(0.3, st.verb),
  };
  if (st.v === 'lofi' || st.v === 'hiphop') { // 일렉피아노 좌우 흔들림(트레몰로)
    const p = oac.createStereoPanner(), l = oac.createOscillator(), lg = oac.createGain(); l.frequency.value = 3.6; lg.gain.value = 0.35; l.connect(lg); lg.connect(p.pan); l.start(0);
    const k2 = oac.createGain(); k2.gain.value = 1; B.keys.disconnect(); B.keys.connect(p); p.connect(pre); const s = oac.createGain(); s.gain.value = st.verb; p.connect(s); s.connect(verbIn);
  }
  // 버퍼 재생
  const bufMap = new Map();
  const toBuf = arr => { let b = bufMap.get(arr); if (!b) { b = oac.createBuffer(1, arr.length, MSR); b.copyToChannel(arr, 0); bufMap.set(arr, b); } return b; };
  const play = (arr, t, gain, dest, pan = 0, rate = 1) => {
    if (t >= len - 0.05 || gain <= 0) return;
    const s = oac.createBufferSource(); s.buffer = toBuf(arr); if (rate !== 1) s.playbackRate.value = rate;
    const g = oac.createGain(); g.gain.value = gain;
    s.connect(g);
    if (pan) { const p = oac.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(dest); } else g.connect(dest);
    s.start(Math.max(0, t));
  };
  const pianoPan = m => clamp((m - 60) / 48, -0.45, 0.45);
  const note = (inst, midi, t, dur, vel, dest, pan) => {
    vel = hv(vel); const v = _vb(vel), d = _db(dur), gain = Math.pow(vel, 1.4);
    switch (inst) {
      case 'piano': return play(synPiano(midi, v, d), t, gain * 0.55, dest || B.keys, pan ?? pianoPan(midi));
      case 'rhodes': return play(synEP(midi, v, d), t, gain * 0.45, dest || B.keys, pan || 0);
      case 'guitar': case 'uke': case 'pizz': case 'harp': return play(synPluck(inst, midi, v, d), t, gain * 0.5, dest || B.gtr, pan ?? pianoPan(midi) * 0.8);
      case 'bass': case 'upright': return play(synPluck(inst, midi, v, d), t, gain * 0.9, dest || B.bass, 0);
      case 'sub': return play(synSub(midi, v, d), t, gain * 0.8, dest || B.bass, 0);
      case 'glock': return play(synGlock(midi, v), t, gain * 0.32, dest || B.lead, pan ?? 0.2);
      case 'flute': return play(synFlute(midi, v, d), t, gain * 0.38, dest || B.lead, pan ?? -0.1);
      case 'strings': return gStrings(midi, t, dur, vel, dest || B.str);
      case 'brass': return gBrass(midi, t, dur, vel, dest || B.lead);
      case 'saw': return gSaw(midi, t, dur, vel, dest || B.syn);
    }
  };
  // 그래프 악기 (오래 끄는 소리): 현악 합주 · 금관 · 신스
  function gStrings(midi, t, dur, vel, dest) {
    const f = midiHz(midi), g = oac.createGain(), lp = oac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100 + 2000 * vel; lp.Q.value = 0.5;
    lp.connect(g); g.connect(dest);
    const att = 0.15 + 0.35 * (1 - vel), rel = 0.7, end = t + dur;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16 * vel, t + att); g.gain.setValueAtTime(0.16 * vel, Math.max(t + att, end)); g.gain.exponentialRampToValueAtTime(0.0001, Math.max(t + att, end) + rel);
    for (const [dc, pan, vr] of [[-9, -0.4, 5.1], [0, 0, 5.6], [8, 0.4, 6.0]]) {
      const os = oac.createOscillator(); os.type = 'sawtooth'; os.frequency.value = f; os.detune.value = dc;
      const lfo = oac.createOscillator(), lg = oac.createGain(); lfo.frequency.value = vr + rnd() * 0.3; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(8, t + 0.6); lfo.connect(lg); lg.connect(os.detune);
      const p = oac.createStereoPanner(); p.pan.value = pan; os.connect(p); p.connect(lp);
      os.start(t); lfo.start(t); os.stop(end + rel + 0.1); lfo.stop(end + rel + 0.1);
    }
  }
  function gBrass(midi, t, dur, vel, dest) {
    const f = midiHz(midi), g = oac.createGain(), lp = oac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(1500 + 2000 * vel, t + 0.09); lp.frequency.linearRampToValueAtTime(1100 + 1200 * vel, t + 0.4);
    lp.connect(g); g.connect(dest); const end = t + dur;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.18 * vel, t + 0.06); g.gain.setValueAtTime(0.16 * vel, end); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.35);
    for (const dc of [-6, 6]) { const os = oac.createOscillator(); os.type = 'sawtooth'; os.frequency.value = f; os.detune.value = dc; os.connect(lp); os.start(t); os.stop(end + 0.4); }
  }
  function gSaw(midi, t, dur, vel, dest) {
    const f = midiHz(midi), g = oac.createGain(), lp = oac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2500 + 3500 * vel; lp.Q.value = 0.7;
    lp.connect(g); g.connect(dest); const end = t + dur;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09 * vel, t + 0.012); g.gain.setValueAtTime(0.08 * vel, end); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.25);
    for (const [dc, pan] of [[-18, -0.6], [-7, -0.25], [0, 0], [7, 0.25], [18, 0.6]]) { const os = oac.createOscillator(); os.type = 'sawtooth'; os.frequency.value = f; os.detune.value = dc; const p = oac.createStereoPanner(); p.pan.value = pan; os.connect(p); p.connect(lp); os.start(t); os.stop(end + 0.3); }
  }
  const drum = (type, t, vel, pan = 0, dest) => play(synDrum(type, Math.floor(rnd() * 4)), t, Math.pow(hv(vel), 1.3), dest || B.drums, pan);

  // ---------- 곡 구성: 마디별 에너지 (영상 맞춤이면 장면 흐름 그대로)
  const cues = Array.isArray(o.cues) ? o.cues.filter(c => c && isFinite(+c.t)).map(c => ({ t: Math.max(0, +c.t), energy: clamp(Math.round(+c.energy || 0), 0, 3), hit: !!c.hit, stop: !!c.stop })).sort((a, b) => a.t - b.t) : [];
  const E = new Array(bars).fill(2);
  if (cues.length) {
    for (let b = 0; b < bars; b++) { const t = b * T.bar + 0.05; let e = cues[0].energy; for (const c of cues) if (c.t <= t) e = c.energy; E[b] = e; }
  } else {
    const intro = bars > unitBars ? Math.max(1, Math.min(4, Math.round(unitBars / 2))) : Math.max(1, Math.round(bars / 4));
    const rest = bars - intro;
    for (let b = 0; b < bars; b++) E[b] = b < intro ? 1 : (b - intro) < Math.ceil(rest / 2) ? 2 : 3;
    if (st.kit === 'none' || st.v === 'calm') for (let b = 0; b < bars; b++) E[b] = Math.min(E[b], b < intro ? 1 : 2) + (b >= bars - unitBars && bars > unitBars ? 1 : 0);
  }
  const last = bars - 1;
  const secStart = b => b === 0 || E[b] !== E[b - 1];

  // ---------- 화음 진행 · 자리바꿈
  const root = 48 + (+o.key || 0);
  const scale = (st.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]).map(x => (x + root) % 12);
  const inScale = m => scale.includes(((m % 12) + 12) % 12);
  let chorus = 0;
  const chordOf = b => {
    if (b === last) return [0, st.minor ? 'm' : (st.prog[0][1] === 'M9' ? 'M9' : 'M')];
    const useB = E[b] >= 3 && st.prog2 && b < bars - unitBars;
    const p = useB ? st.prog2 : st.prog;
    return p[Math.floor(b / T.barsPerChord) % p.length];
  };
  const chords = []; let prevV = null, prevG = null;
  for (let b = 0; b < bars; b++) {
    const [deg, q] = chordOf(b), r = root + deg, pcs = CHORD_IV[q].map(iv => (r + iv) % 12);
    const v = voiceLead(pcs, prevV, 55, 76, 4); prevV = v;
    const gv = voiceLead(pcs, prevG, 52, 71, 4); prevG = gv;
    let bassRoot = 36 + ((r % 12) + 12) % 12; if (bassRoot > 47) bassRoot -= 12;
    chords.push({ deg, q, root: r, pcs, v, gv, bass: bassRoot });
  }
  const lv = e => [0.3, 0.5, 0.74, 1][e];   // 에너지별 세기

  // ---------- 정적(stop) · 강조(hit)
  for (const c of cues) if (c.stop && c.t > 0.4) { pre.gain.setValueAtTime(1, c.t - 0.36); pre.gain.linearRampToValueAtTime(0.0001, c.t - 0.3); pre.gain.setValueAtTime(0.0001, c.t - 0.02); pre.gain.linearRampToValueAtTime(1, c.t); }

  // ---------- 마디마다 연주
  for (let b = 0; b < bars; b++) {
    const t0 = b * T.bar, e = E[b], L = lv(e), ch = chords[b], nx = chords[Math.min(last, b + 1)];
    const isLast = b === last, chordStart = b % T.barsPerChord === 0 || secStart(b);
    const rising = b < last && E[b + 1] > e;
    const cyc = T.bar * (isLast ? 1 : T.barsPerChord);

    // 1) 반주
    if (o.chords) for (const kind of st.comp) {
      if (isLast) { // 마지막 화음: 길게 울리기
        if (kind === 'strum' || kind === 'uke') ch.gv.forEach((m, k) => note(kind === 'uke' ? 'uke' : 'guitar', m + (kind === 'uke' ? 12 : 0), t0 + k * 0.018, T.bar + 1.5, 0.7));
        else if (kind === 'rhodes') ch.v.forEach(m => note('rhodes', m, t0, T.bar + 1.2, 0.6));
        else if (kind === 'saw') ch.v.forEach(m => note('saw', m, t0, T.bar, 0.6));
        else { note('piano', ch.bass + 12, t0, T.bar + 1.6, 0.6); ch.v.forEach((m, k) => note('piano', m, t0 + k * 0.012, T.bar + 1.6, 0.55)); }
        continue;
      }
      if (e === 0 && kind !== 'pianoArp') { // 숨 고르는 구간: 악기를 줄이고 화음만 길게 (완전히 끊기지 않게)
        if (kind === st.comp[0] && chordStart) {
          const inst = kind === 'rhodes' ? 'rhodes' : kind === 'saw' ? 'saw' : 'piano';
          ch.v.forEach((m, k) => note(inst, m, t0 + k * 0.02 + human(0.006), cyc * 0.98, 0.32));
          note(inst === 'saw' ? 'saw' : 'piano', ch.bass + 12, t0, cyc * 0.98, 0.3);
        }
        continue;
      }
      for (let bt = 0; bt < beats; bt++) {
        const acc = A[bt], tb = t0 + bt * T.beat, av = acc === 3 ? 1 : acc === 2 ? 0.82 : 0.68;
        if (kind === 'strum' || kind === 'uke') {
          const inst = kind === 'uke' ? 'uke' : 'guitar', tr = kind === 'uke' ? 12 : 0, strings = ch.gv.map(m => m + tr);
          for (let s = 0; s < sub; s++) {
            const down = s === 0 || (sub === 3 && s === 2 && e >= 3);
            if (!down && e < 2) continue;
            if (e === 1 && bt % 2 === 1) continue;
            const ts = tb + s * subLen + swingAt(s) + human(0.006), notes = down ? strings : strings.slice(1).reverse();
            notes.forEach((m, k) => note(inst, m, ts + k * (down ? 0.014 : 0.01), subLen * (down ? 1.6 : 1.1), L * av * (down ? 0.75 : 0.5)));
          }
        } else if (kind === 'pianoBlock') {
          if (e < 2 && acc < 3) continue;
          const syn = e >= 3 && beats >= 4 && bt === 1 ? subLen : 0;
          ch.v.forEach((m, k) => note('piano', m, tb + syn + k * 0.006 + human(0.005), T.beat * (e >= 3 ? 0.8 : 1.4), L * av * 0.55));
          if (acc === 3) note('piano', ch.bass + 12, tb + human(0.004), T.beat * 1.8, L * 0.5);
        } else if (kind === 'pianoArp') {
          if (bt === 0) { note('piano', ch.bass + 12, tb + human(0.004), cyc * 0.98, L * 0.62); if (e >= 2) note('piano', ch.bass + 19, tb + 0.02, cyc * 0.9, L * 0.4); }
          const order = [0, 1, 2, 3, 2, 1];
          for (let s = 0; s < sub; s++) {
            if (e <= 1 && s > 0) continue;
            const idx = order[(bt * sub + s) % order.length], m = ch.v[idx] + (e >= 3 && s === sub - 1 ? 12 : 0);
            note('piano', m, tb + s * subLen + human(0.008), subLen * 2.6, L * (s === 0 ? 0.5 : 0.36) * av);
          }
        } else if (kind === 'pianoOst') { // 영화식 8분음 반복
          for (let s = 0; s < sub; s++) { const m = s % 2 ? ch.v[2] : ch.v[0]; note('piano', m, tb + s * subLen + human(0.004), subLen * 0.9, L * (s === 0 ? 0.5 : 0.36)); }
          if (bt === 0) note('piano', ch.bass, tb, cyc * 0.95, L * 0.55);
        } else if (kind === 'pluckOst') { // 어쿠스틱 기타 아르페지오
          if (e < 1) continue;
          const pat = [0, 2, 1, 3, 2, 1];
          for (let s = 0; s < sub; s++) { if (e === 1 && s > 0) continue; const m = ch.gv[pat[(bt * sub + s) % pat.length]]; note('guitar', m, tb + s * subLen + human(0.007), subLen * 2.2, L * (s ? 0.42 : 0.55) * av); }
        } else if (kind === 'rhodes') {
          const hits = beats >= 4 ? [[0, 0, 1.6], [1, 1, 0.45], [3, 1, 0.4]] : [[0, 0, 1.6]];
          for (const [hb, hs, dl] of hits) if (hb === bt) { if (e <= 1 && hb > 0) continue; ch.v.forEach((m, k) => note('rhodes', m, tb + hs * subLen + swingAt(hs) + k * 0.008 + human(0.01), T.beat * dl, L * 0.5)); }
        } else if (kind === 'saw') {
          if (e < 2) { if (bt === 0) ch.v.forEach(m => note('saw', m, tb, cyc * 0.95, 0.35 * L)); continue; }
          for (let s = 0; s < sub; s++) { if (s === 0 && bt % 2 === 0 && e < 3) continue; ch.v.forEach(m => note('saw', m, tb + s * subLen, subLen * 0.7, L * 0.55)); }
        }
      }
    }
    // 현악·패드 (지속음) — 에너지가 오르면 들어옴
    if (o.chords && st.pad && chordStart && (e >= 2 || st.v === 'epic' || isLast)) {
      const dur = isLast ? T.bar + 1.2 : cyc;
      const v = e >= 3 ? ch.v.concat([ch.v[0] + 12]) : ch.v;
      if (st.pad === 'strings') { v.forEach(m => note('strings', m, t0, dur, L * 0.8)); if (st.v === 'epic' || e >= 3) note('strings', ch.bass + 12, t0, dur, L * 0.8); }
      else if (st.pad === 'saw' && e >= 3) v.forEach(m => note('saw', m + 12, t0, dur, L * 0.35));
    }

    // 2) 베이스 (걷는 베이스 · 다음 화음으로 이끄는 음)
    if (o.bass && e >= 1) {
      const inst = st.bass, br = ch.bass;
      if (isLast) note(inst, br, t0, T.bar + 1, 0.85);
      else if (st.kit === 'edm' && e >= 2) { for (let bt = 0; bt < beats; bt++) note(inst, br, t0 + bt * T.beat + T.beat / 2, T.beat * 0.42, 0.8 * L); }
      else for (let bt = 0; bt < beats; bt++) {
        const acc = A[bt], tb = t0 + bt * T.beat + human(0.006);
        const changing = bt === beats - 1 && nx.root % 12 !== ch.root % 12 && b < last;
        if (bt === 0) note(inst, br, tb, T.beat * (e <= 1 ? beats * 0.95 : 0.9), 0.95 * L);
        else if (e <= 1) continue;
        else if (changing && (st.v === 'bright' || st.v === 'corp' || st.v === 'lofi' || st.v === 'luxury' || st.v === 'calm')) {
          const target = nx.bass, step = target > br ? -1 : 1; let ap = target + step; if (!inScale(ap)) ap = target + step * 2;
          note(inst, ap, tb + (sub === 2 && e >= 3 ? subLen : 0), T.beat * 0.5, 0.7 * L);
        } else if (acc >= 2) note(inst, br + (bt % 2 && st.v !== 'epic' ? 7 : 0), tb, T.beat * 0.8, 0.8 * L);
        else if (st.kit === 'hiphop' && bt === 1) note(inst, br, tb + subLen, T.beat * 0.5, 0.7 * L);
      }
    }

    // 3) 드럼
    if (o.drums && st.kit !== 'none') {
      const k = st.kit;
      if (secStart(b) && e >= 3 || isLast) drum('crash', t0, 0.55, 0.25, B.perc);
      if (isLast) { drum(k === 'edm' || k === 'hiphop' ? 'kickDeep' : k === 'lofi' || k === 'soft' ? 'kickSoft' : 'kick', t0, 0.9); }
      else if (e >= 1) for (let bt = 0; bt < beats; bt++) {
        const acc = A[bt], tb = t0 + bt * T.beat;
        const fillHere = rising && bt === beats - 1 && e >= 1 && k !== 'soft';
        if (fillHere) {
          const n = sub * 2, toms = ['tomH', 'tomM', 'tomL'];
          for (let s = 0; s < n; s++) { const tt = tb + s * subLen / 2; if (k === 'edm') drum('snare', tt, 0.3 + 0.6 * s / n); else drum(s % 2 ? toms[Math.min(2, Math.floor(s * 3 / n))] : 'snare', tt, 0.45 + 0.4 * s / n, (s / n - 0.5) * 0.6); }
          continue;
        }
        if (k === 'pop') {
          if (acc === 3) drum('kick', tb + human(0.003), 0.95 * L);
          if (acc === 2 || (beats === 1 && b % 2)) drum(e >= 2 ? 'snare' : 'rim', tb + human(0.004), (e >= 2 ? 0.8 : 0.5) * L);
          if (e >= 3 && beats >= 4 && bt === 2) drum('kick', tb - subLen + human(0.003), 0.55);
          for (let s = 0; s < sub; s++) if (e >= 2 || s === 0) drum(e >= 3 && bt === beats - 1 && s === sub - 1 ? 'hatO' : 'hatC', tb + s * subLen + swingAt(s) + human(0.005), (s === 0 ? 0.4 : 0.26) * L, 0.3);
        } else if (k === 'soft') {
          if (acc === 3 && e >= 2) drum('kickSoft', tb, 0.55 * L);
          drum('brush', tb + human(0.01), 0.45 * L, -0.2);
          if (acc === 2) drum('rim', tb + human(0.008), 0.35 * L, 0.15);
          for (let s = 0; s < sub; s++) if (e >= 2) drum('shaker', tb + s * subLen + human(0.008), (s ? 0.3 : 0.4) * L, 0.35);
        } else if (k === 'epic') {
          if (acc === 3) { drum('taiko', tb, 0.9 * L, -0.1); drum('kick', tb, 0.6 * L); }
          if (acc === 2) { drum('tomL', tb, 0.6 * L, 0.2); if (e >= 3) drum('snare', tb, 0.6 * L); }
          if (e >= 3) for (let s = 1; s < sub; s++) drum('tomM', tb + s * subLen, 0.3, 0.3);
        } else if (k === 'light') {
          if (acc === 3) drum('kickSoft', tb, 0.6 * L);
          if (acc === 2 || (beats === 1 && b % 2)) drum(e >= 2 ? 'clap' : 'snap', tb + human(0.005), 0.55 * L, 0.1);
          for (let s = 0; s < sub; s++) drum(e >= 3 && s === sub - 1 ? 'tamb' : 'shaker', tb + s * subLen + human(0.006), (s ? 0.3 : 0.42) * L, 0.35);
        } else if (k === 'lofi' || k === 'hiphop') {
          const kk = k === 'lofi' ? 'kickSoft' : 'kickDeep';
          if (acc === 3) drum(kk, tb + human(0.004), 0.9 * L);
          if (beats >= 4 && bt === 1 && sub === 2) drum(kk, tb + subLen + swingAt(1), 0.6 * L);
          if (acc === 2 || (beats === 1 && b % 2)) drum('snare', tb + 0.012 + human(0.006), (k === 'lofi' ? 0.55 : 0.8) * L);
          for (let s = 0; s < sub; s++) drum('hatC', tb + s * subLen + swingAt(s) + human(0.008), (s ? 0.18 : 0.28) * L, 0.25);
        } else if (k === 'edm') {
          if (e >= 2) drum('kickDeep', tb, 0.95);
          if (acc === 2 || (beats === 1 && b % 2)) drum('clap', tb, 0.75 * L);
          if (e >= 2) drum('hatO', tb + T.beat / 2, 0.3 * L, 0.2); else drum('hatC', tb + T.beat / 2, 0.26, 0.2);
          if (st.sidechain && e >= 2) for (const bb of [B.syn, B.bass, B.str]) { bb.gain.setValueAtTime(bb.gain.value * 0.35, tb); bb.gain.linearRampToValueAtTime(bb.gain.value, tb + T.beat * 0.6); }
        }
      }
      if (st.lofi && b === 0) { const s = oac.createBufferSource(); s.buffer = toBuf(synDrum('vinyl', 0)); s.loop = true; const g = oac.createGain(); g.gain.value = 0.35; s.connect(g); g.connect(B.perc); s.start(0); s.stop(len); }
    }
    // 에너지가 오르기 직전: 거꾸로 심벌(라이저)
    if (rising && E[b + 1] >= 2 && st.kit !== 'none') { const r = synDrum('revCrash', 0), d = r.length / MSR; play(r, t0 + T.bar - d, 0.3, B.perc, -0.2); }
  }
  // 장면 강조(hit): 크래시 + 한 방 + 화음 강세
  for (const c of cues) if (c.hit && c.t < len - 1) {
    const b = Math.min(last, Math.floor(c.t / T.bar)), ch = chords[b];
    if (st.kit !== 'none') { drum('crash', c.t, 0.5, 0.25, B.perc); drum(st.kit === 'edm' || st.kit === 'hiphop' ? 'kickDeep' : st.kit === 'epic' ? 'taiko' : 'kick', c.t, 0.85); }
    else note('piano', ch.bass, c.t, T.bar, 0.75);
    if (st.pad === 'strings' || st.v === 'epic') ch.v.forEach(m => note('strings', m, c.t, T.bar * 0.9, 0.85));
  }

  // 4) 멜로디: 2~4마디 프레이즈, A-B-A'-C 형식, 강박은 화음 음, 약박은 음계 따라 이어지기
  if (o.melody) {
    const phraseBars = T.bar < 1.4 ? 4 : 2, slots = beats * sub;
    const lead = st.lead, lo = root + 19 + (lead === 'glock' ? 12 : 0), hi = lo + 14;
    const makeRhythm = dense => {
      const r = [];
      for (let pb = 0; pb < phraseBars; pb++) for (let s = 0; s < slots; s++) {
        const strong = s % sub === 0, endBar = pb === phraseBars - 1;
        if (endBar) { r.push(s === 0 ? 2 : 0); continue; }        // 프레이즈 끝: 긴 음 하나
        const p = strong ? (s === 0 ? 0.92 : 0.7) : dense * (sub === 3 ? 0.35 : 0.42);
        r.push(rnd() < p ? (strong && rnd() < 0.3 ? 2 : 1) : 0);
      }
      return r;
    };
    const motifs = { A: makeRhythm(0.6), B: makeRhythm(0.8) };
    const contour = { A: Array.from({ length: 32 }, () => [-2, -1, -1, 1, 1, 2, 0][Math.floor(rnd() * 7)]), B: Array.from({ length: 32 }, () => [-2, -1, 1, 1, 2, 3, -1][Math.floor(rnd() * 7)]) };
    let prevM = lo + 5;
    const nearChord = (target, ch) => { let best = target, bd = 99; for (let m = lo - 2; m <= hi + 2; m++) if (ch.pcs.includes(((m % 12) + 12) % 12)) { const d = Math.abs(m - target); if (d < bd) { bd = d; best = m; } } return best; };
    const stepScale = (m, steps) => { let x = m; const dir = Math.sign(steps); for (let k = 0; k < Math.abs(steps); k++) { x += dir; while (!inScale(x)) x += dir; } if (x > hi) x -= 12; if (x < lo) x += 12; return x; };
    for (let pStart = 0; pStart < bars; pStart += phraseBars) {
      const pIdx = Math.floor(pStart / phraseBars), form = ['A', 'B', 'A', 'B'][pIdx % 4];
      const r = motifs[form], ct = contour[form];
      let ci = 0;
      const events = [];
      for (let k = 0; k < r.length; k++) {
        if (!r[k]) continue;
        const pb = Math.floor(k / slots), b = pStart + pb; if (b >= bars) break;
        const e = E[b];
        if (e <= 1 && b !== last) continue;                       // 조용한·정보 구간은 멜로디가 비켜 줌
        const s = k % slots, bt = Math.floor(s / sub), ss = s % sub, ch = chords[b];
        const t = b * T.bar + bt * T.beat + ss * subLen + swingAt(ss) + human(0.008);
        const strong = ss === 0 && A[bt] >= 2;
        let m = strong ? nearChord(prevM + ct[ci % ct.length], ch) : stepScale(prevM, ct[ci % ct.length] || 1);
        if (pb === phraseBars - 1) m = nearChord(prevM - 1, ch);  // 프레이즈 끝은 화음 음으로 착지
        if (b === last) m = nearChord(root + 24 + (lead === 'glock' ? 12 : 0), { pcs: [((root % 12) + 12) % 12] });
        ci++; prevM = m;
        events.push({ t, m, e, b, strong });
      }
      events.forEach((ev, i) => {
        const nxT = events[i + 1] ? events[i + 1].t : ev.t + T.beat * 2;
        const legato = lead === 'strings' || lead === 'flute' || lead === 'saw' || lead === 'brass';
        const d = Math.min(legato ? T.beat * 3 : T.beat * 1.6, Math.max(subLen * 0.8, (nxT - ev.t) * (legato ? 1.02 : 1.3)));
        const v = lv(ev.e) * (ev.strong ? 0.78 : 0.6);
        note(lead, ev.m, ev.t, ev.b === last ? T.bar + 1 : d, v);
        if (ev.e >= 3 && st.lead2) note(st.lead2, ev.m + (st.lead2 === 'glock' ? 12 : st.lead2 === 'strings' ? -12 : 0), ev.t + 0.004, d, v * 0.55);
      });
    }
  }

  const buf = await oac.startRendering();
  // 소리 크기 맞추기 (가장 큰 소리 -1dB)
  let peak = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i += 3) peak = Math.max(peak, Math.abs(d[i])); }
  if (peak > 0) { const k = 0.89 / peak; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; } }
  // 끝: 마지막 2초 자연스럽게 사라지기
  const fadeS = Math.floor((len - 1.6) * MSR);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = fadeS; i < d.length; i++) d[i] *= Math.max(0, 1 - (i - fadeS) / (d.length - fadeS)); }
  return buf;
}

/** 공간 잔향: 초기 반사음 + 고음이 먼저 줄어드는 잔향 꼬리 (좌우 서로 다르게) */
const _irCache = new Map();
function makeRoomIR(oac, size, seed) {
  const key = `${size}`;
  let chans = _irCache.get(key);
  if (!chans) {
    const rnd = mulberry32(_hash('ir' + key)), n = Math.ceil(size * MSR), pd = Math.floor(0.016 * MSR);
    chans = [0, 1].map(c => {
      const x = new Float32Array(n);
      let y = 0;
      for (let i = pd; i < n; i++) {
        const t = (i - pd) / MSR, fc = 9000 * Math.pow(1800 / 9000, Math.min(1, t / size)), a = 1 - Math.exp(-2 * Math.PI * fc / MSR);
        y += a * ((rnd() * 2 - 1) - y);
        x[i] = y * Math.exp(-6.9 * t / size);
      }
      [0.011, 0.017, 0.023, 0.031, 0.041, 0.053].forEach((d, k) => { const i = Math.floor((d + c * 0.0027) * MSR); x[i] += (0.5 - k * 0.06) * (k % 2 ? -1 : 1); });
      return x;
    });
    _irCache.set(key, chans);
  }
  const b = oac.createBuffer(2, chans[0].length, MSR);
  b.copyToChannel(chans[0], 0); b.copyToChannel(chans[1], 1);
  return b;
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
