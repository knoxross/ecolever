/* 영상뚝딱 — 효과음 (파일 없이 프로그램 안에서 직접 합성 · 저작권 걱정 없음) */
'use strict';

const SFX_LIST = [
  { v: 'whoosh', label: '휙 (장면 전환)', dur: 0.7 },
  { v: 'pop', label: '뿅', dur: 0.25 },
  { v: 'ding', label: '띵', dur: 1.2 },
  { v: 'click', label: '딸깍', dur: 0.12 },
  { v: 'tada', label: '짠!', dur: 1.4 },
  { v: 'boom', label: '두둥 (임팩트)', dur: 1.6 },
  { v: 'clap', label: '박수', dur: 1.6 },
  { v: 'shutter', label: '카메라 찰칵', dur: 0.35 },
  { v: 'notify', label: '알림 띠링', dur: 0.8 },
  { v: 'riser', label: '긴장 상승', dur: 2.0 },
];

async function makeSfx(type) {
  const sr = 48000, info = SFX_LIST.find(x => x.v === type) || SFX_LIST[0];
  const oac = new OfflineAudioContext(2, Math.ceil(sr * info.dur), sr);
  const out = oac.createGain(); out.gain.value = 0.9; out.connect(oac.destination);
  const noise = (len) => { const b = oac.createBuffer(1, Math.ceil(sr * len), sr), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = oac.createBufferSource(); s.buffer = b; return s; };
  const tone = (type2, f0, f1, t0, len, vol) => {
    const o = oac.createOscillator(), g = oac.createGain();
    o.type = type2; o.frequency.setValueAtTime(f0, t0); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + len);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + len + 0.02);
  };
  switch (type) {
    case 'whoosh': { const n = noise(0.7), f = oac.createBiquadFilter(), g = oac.createGain(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(300, 0); f.frequency.exponentialRampToValueAtTime(4000, 0.35); f.frequency.exponentialRampToValueAtTime(600, 0.7); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.9, 0.3); g.gain.exponentialRampToValueAtTime(0.0001, 0.7); n.connect(f); f.connect(g); g.connect(out); n.start(); break; }
    case 'pop': tone('sine', 900, 250, 0, 0.2, 0.8); break;
    case 'ding': tone('sine', 1320, 0, 0, 1.1, 0.5); tone('sine', 2640, 0, 0, 0.6, 0.15); break;
    case 'click': { const n = noise(0.05), f = oac.createBiquadFilter(), g = oac.createGain(); f.type = 'highpass'; f.frequency.value = 2500; g.gain.setValueAtTime(0.8, 0); g.gain.exponentialRampToValueAtTime(0.0001, 0.05); n.connect(f); f.connect(g); g.connect(out); n.start(); tone('square', 1800, 0, 0, 0.03, 0.2); break; }
    case 'tada': [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, 0, i * 0.08, 1.2 - i * 0.08, 0.35)); break;
    case 'boom': { tone('sine', 120, 35, 0, 1.5, 1.0); const n = noise(0.4), f = oac.createBiquadFilter(), g = oac.createGain(); f.type = 'lowpass'; f.frequency.value = 400; g.gain.setValueAtTime(0.7, 0); g.gain.exponentialRampToValueAtTime(0.0001, 0.4); n.connect(f); f.connect(g); g.connect(out); n.start(); break; }
    case 'clap': for (let i = 0; i < 26; i++) { const t0 = Math.random() * 1.3, n = noise(0.08), f = oac.createBiquadFilter(), g = oac.createGain(); f.type = 'bandpass'; f.frequency.value = 1200 + Math.random() * 1500; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08); n.connect(f); f.connect(g); g.connect(out); n.start(t0); } break;
    case 'shutter': [0, 0.12].forEach(t0 => { const n = noise(0.06), f = oac.createBiquadFilter(), g = oac.createGain(); f.type = 'highpass'; f.frequency.value = 1500; g.gain.setValueAtTime(0.9, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06); n.connect(f); f.connect(g); g.connect(out); n.start(t0); }); break;
    case 'notify': tone('sine', 1568, 0, 0, 0.35, 0.4); tone('sine', 2093, 0, 0.15, 0.6, 0.4); break;
    case 'riser': { const o = oac.createOscillator(), g = oac.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, 0); o.frequency.exponentialRampToValueAtTime(880, 2); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.25, 1.8); g.gain.exponentialRampToValueAtTime(0.0001, 2); const f = oac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, 0); f.frequency.exponentialRampToValueAtTime(6000, 2); o.connect(f); f.connect(g); g.connect(out); o.start(); o.stop(2); break; }
  }
  return oac.startRendering();
}
/** 지금 위치에 효과음 넣기 */
async function addSfxAt(type, t) {
  const buf = await makeSfx(type);
  const info = SFX_LIST.find(x => x.v === type);
  const file = new File([audioBufferToWav(buf)], `효과음-${info.label.split(' ')[0]}.wav`, { type: 'audio/wav' });
  const m = { id: uid(), type: 'audio', role: 'sfx', name: file.name, url: URL.createObjectURL(file), file, buffer: buf, duration: buf.duration };
  state.media.push(m);
  const s = { id: uid(), mediaId: m.id, start: round2(Math.max(0, t)), vol: 1 };
  state.sfx.push(s);
  return s;
}
async function previewSfx(type) { listen(await makeSfx(type)); }
