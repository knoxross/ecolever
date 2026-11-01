/* 영상뚝딱 — 자막
 * 장면과 따로 움직이는 '자막 줄'(시작~끝 시간 + 문장).
 *  - 직접 넣기 / 지금 위치에 추가 / 시작·끝을 재생 위치로 맞추기
 *  - 자동 자막: ① 내레이션(목소리) 문장으로 타이밍 맞춰 자동 생성 ② AI 받아쓰기(영상·녹음 속 말소리 → 자막, Google 키)
 *  - SRT·VTT 자막 파일 불러오기 / SRT 저장
 *  - 모양: 글꼴·크기·색·강조색(*별표*로 감싼 단어)·외곽선·상자·위치·나타나기
 *  - 저장하는 동영상에 그대로 입혀지고(번인), 필요하면 .srt 파일도 따로 저장
 */
'use strict';

const SUB_POS = [{ v: 'bottom', label: '아래' }, { v: 'middle', label: '가운데' }, { v: 'top', label: '위' }];
const SUB_ANIMS = [{ v: 'none', label: '바로 나타나기' }, { v: 'fade', label: '부드럽게' }, { v: 'pop', label: '톡 튀어나오기' }, { v: 'type', label: '타자 치듯' }];
const subStyle = () => Object.assign({ font: "'Noto Sans KR'", size: 58, color: '#ffffff', hl: '#ffe14d', box: false, outline: true, pos: 'bottom', anim: 'fade' }, S.sub || {});
const sortSubs = () => state.subs.sort((a, b) => a.start - b.start);
const subAt = t => state.subs.find(x => t >= x.start && t < x.end);

/* ---------- 그리기 ---------- */
/** "*강조*" 표시를 나눠 [{text, hl}] 로 */
function richRuns(line) {
  const runs = [];
  let hl = false, buf = '';
  for (const ch of line) {
    if (ch === '*') { if (buf) runs.push({ text: buf, hl }); buf = ''; hl = !hl; continue; }
    buf += ch;
  }
  if (buf) runs.push({ text: buf, hl });
  return runs;
}
const plain = s => s.replace(/\*/g, '');
function drawSubtitles(t) {
  const sb = subAt(t);
  if (!sb || !(sb.text || '').trim()) return;
  const st = subStyle();
  const W = canvas.width, H = canvas.height;
  const local = t - sb.start, dur = Math.max(0.1, sb.end - sb.start);
  let fs = Math.max(10, st.size * Math.min(W, H) / 1080);
  const font = sz => `${fontWeight(st.font)} ${sz}px ${st.font}, 'Noto Sans KR', sans-serif`;
  // 두 줄 안에 들어가게 자동 크기 (잘림 방지)
  let lines;
  for (let k = 0; k < 10; k++) {
    ctx.font = font(fs);
    lines = wrapRich(sb.text, W * 0.88);
    if (lines.length <= 2 || fs < 14) break;
    fs *= 0.88;
  }
  let shown = lines;
  if (st.anim === 'type') { // 타자 치듯: 글자 수만큼 차례로
    const total = plain(lines.join('')).length;
    let n = Math.ceil(clamp(local / Math.min(dur * 0.6, total * 0.06 + 0.2), 0, 1) * total);
    shown = lines.map(l => { let out = '', c = 0; for (const ch of l) { if (ch !== '*') { if (c >= n) break; c++; } out += ch; } n -= c; return out; });
  }
  const lh = fs * 1.32, blockH = lines.length * lh;
  const portrait = H > W * 1.4;
  let y0 = st.pos === 'top' ? H * (portrait ? 0.14 : 0.08) : st.pos === 'middle' ? (H - blockH) / 2 : H - H * (portrait ? 0.22 : 0.09) - blockH;
  // 장면 자막이 아래에 있으면 그 위로 올려서 겹치지 않게
  if (st.pos === 'bottom' && captionTop != null && y0 + blockH > captionTop - fs * 0.3) y0 = Math.max(H * 0.05, captionTop - fs * 0.45 - blockH);
  ctx.save();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const fadeIn = clamp(local / 0.18, 0, 1), fadeOut = clamp((sb.end - t) / 0.15, 0, 1);
  if (st.anim === 'fade') ctx.globalAlpha *= Math.min(fadeIn, fadeOut);
  if (st.anim === 'pop') {
    const p = clamp(local / 0.28, 0, 1), s = p >= 1 ? 1 : Math.max(0.01, easeOutBack(p));
    const cy = y0 + blockH / 2;
    ctx.globalAlpha *= Math.min(clamp(p * 3, 0, 1), fadeOut);
    ctx.translate(W / 2, cy); ctx.scale(s, s); ctx.translate(-W / 2, -cy);
  }
  ctx.font = font(fs);
  if (st.box) {
    const mw = Math.max(...lines.map(l => ctx.measureText(plain(l)).width));
    const pad = fs * 0.32;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect((W - mw) / 2 - pad * 1.3, y0 - pad * 0.7, mw + pad * 2.6, blockH + pad * 1.4, fs * 0.22);
    ctx.fill();
  }
  shown.forEach((line, k) => {
    const runs = richRuns(line);
    const full = plain(lines[k]);
    let x = (W - ctx.measureText(full).width) / 2;
    const y = y0 + lh * k + lh / 2;
    for (const r of runs) {
      if (st.outline && !st.box) {
        ctx.save();
        ctx.lineJoin = 'round'; ctx.lineWidth = fs * 0.16; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = fs * 0.2;
        ctx.strokeText(r.text, x, y);
        ctx.restore();
      }
      ctx.fillStyle = r.hl ? st.hl : st.color;
      ctx.fillText(r.text, x, y);
      x += ctx.measureText(r.text).width;
    }
  });
  ctx.restore();
}
/** 강조 표시(*)는 너비에서 빼고 줄바꿈 */
function wrapRich(text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const test = line + word;
      if (ctx.measureText(plain(test)).width <= maxW || !line.trim()) { line = test; continue; }
      out.push(line.trim()); line = word.trimStart();
    }
    if (line.trim()) out.push(line.trim());
  }
  // 한 단어가 너무 길면 글자 단위로
  return out.flatMap(l => {
    if (ctx.measureText(plain(l)).width <= maxW) return [l];
    const parts = []; let cur = '';
    for (const ch of l) { if (ctx.measureText(plain(cur + ch)).width > maxW && cur) { parts.push(cur); cur = ''; } cur += ch; }
    if (cur) parts.push(cur);
    return parts;
  });
}
window.drawSubtitles = drawSubtitles;

/* ---------- 만들기 · 편집 ---------- */
function addSub(start, end, text, extra = {}) {
  const total = Math.max(totalDuration(), end);
  const sb = Object.assign({ id: uid(), start: round2(clamp(start, 0, total)), end: round2(clamp(end, start + 0.2, total + 60)), text: text || '' }, extra);
  state.subs.push(sb);
  sortSubs();
  return sb;
}
/** 문장을 자막 한 줄(최대 maxChars 글자) 단위로 자르기 */
function chunkSentence(text, maxChars = 16) {
  const out = [];
  for (const sent of String(text).replace(/\s+/g, ' ').trim().split(/(?<=[.!?。…~])\s+|(?<=[,，])\s+/)) {
    if (!sent) continue;
    if (sent.length <= maxChars) { out.push(sent); continue; }
    let cur = '';
    for (const w of sent.split(' ')) {
      if ((cur + ' ' + w).trim().length > maxChars && cur) { out.push(cur.trim()); cur = w; } else cur = (cur + ' ' + w).trim();
    }
    if (cur) out.push(cur);
  }
  return out;
}
/** 내레이션(목소리) → 타이밍 맞춘 자막. 반환: 만든 개수 */
function subsFromNarration() {
  let n = 0;
  state.subs = state.subs.filter(x => !x.auto);
  for (const sg of voiceSegments()) {
    const text = (sg.clip.narration || '').trim();
    if (!text) continue;
    const parts = chunkSentence(text);
    const total = parts.reduce((a, p) => a + p.length, 0) || 1;
    // 말소리가 실제로 있는 구간(앞뒤 무음 제외)에 맞춤
    const { head, tail } = speechBounds(sg.buffer);
    let t = sg.start + head;
    const span = Math.max(0.3, (sg.end - sg.start) - head - tail);
    for (const p of parts) {
      const d = span * p.length / total;
      addSub(t, t + d, p, { auto: true });
      t += d; n++;
    }
  }
  return n;
}
function speechBounds(buf) {
  const d = buf.getChannelData(0), sr = buf.sampleRate, win = Math.round(sr * 0.02);
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const th = peak * 0.08;
  const loud = i => { let m = 0; for (let j = i; j < Math.min(d.length, i + win); j++) m = Math.max(m, Math.abs(d[j])); return m > th; };
  let a = 0; while (a < d.length && !loud(a)) a += win;
  let b = d.length - win; while (b > a && !loud(b)) b -= win;
  return { head: Math.min(a / sr, 1.5), tail: Math.min(Math.max(0, (d.length - b - win) / sr), 1.5) };
}

/* ---------- AI 받아쓰기 (Google Gemini) ---------- */
async function transcribeToSubs({ signal, onStatus } = {}) {
  if (!genReady()) throw new Error('AI 받아쓰기를 하려면 ⚙ AI 설정에서 Google AI 키를 넣어 주세요.');
  const total = totalDuration();
  if (!total) throw new Error('먼저 장면을 만들어 주세요.');
  onStatus?.('영상 속 말소리를 모으는 중…');
  // 배경음악은 빼고 동영상 원본 소리 + 목소리만 섞어서 16kHz 로
  const saveVol = S.bgmVolume; S.bgmVolume = 0;
  let mix;
  try { mix = await renderAudioMix(total, 16000); } finally { S.bgmVolume = saveVol; }
  if (!mix) throw new Error('받아쓸 말소리가 없습니다. (동영상 원본 소리나 목소리가 있어야 합니다)');
  const mono = new AudioBuffer({ length: mix.length, numberOfChannels: 1, sampleRate: 16000 });
  const L = mix.getChannelData(0), R = mix.getChannelData(1), M = mono.getChannelData(0);
  for (let i = 0; i < L.length; i++) M[i] = (L[i] + R[i]) / 2;
  const wav = audioBufferToWav(mono);
  if (wav.size > 19e6) throw new Error('영상이 너무 길어 한 번에 받아쓸 수 없습니다. (약 10분 이하로 나눠 주세요)');
  onStatus?.('🤖 AI가 받아쓰는 중… (30초~1분)');
  const model = Platform.getPref('gen_text_model') || 'gemini-2.5-flash';
  const r = await gRequest(`models/${model}:generateContent`, {
    body: {
      contents: [{ parts: [
        { inlineData: { mimeType: 'audio/wav', data: await fileToBase64(wav) } },
        { text: '이 오디오의 말소리를 그대로 받아써서 영상 자막으로 만들어 주세요. 한 자막은 한국어 기준 16자 안팎(최대 2줄)으로 짧게 나누고, 각 자막의 시작·끝 시간(초, 소수점 둘째 자리)을 실제 말하는 시점에 정확히 맞추세요. 말이 없는 구간은 비워 두고, 음악·효과음은 받아쓰지 마세요.' },
      ] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: { type: 'ARRAY', items: { type: 'OBJECT', properties: { start: { type: 'NUMBER' }, end: { type: 'NUMBER' }, text: { type: 'STRING' } }, required: ['start', 'end', 'text'] } },
      },
    },
    signal,
  });
  const txt = r.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '[]';
  let items;
  try { items = JSON.parse(txt); } catch (e) { throw new Error('받아쓰기 결과를 읽지 못했습니다. 다시 시도해 주세요.'); }
  items = (items || []).filter(x => x && (x.text || '').trim() && isFinite(x.start) && isFinite(x.end) && x.end > x.start);
  if (!items.length) throw new Error('알아들을 수 있는 말소리가 없었습니다.');
  state.subs = state.subs.filter(x => !x.ai);
  for (const x of items) addSub(x.start, Math.min(x.end, total), x.text.trim(), { ai: true });
  fixOverlaps();
  return items.length;
}
function fixOverlaps() {
  sortSubs();
  for (let i = 0; i < state.subs.length - 1; i++) {
    const a = state.subs[i], b = state.subs[i + 1];
    if (a.end > b.start) a.end = round2(Math.max(a.start + 0.2, b.start - 0.02));
  }
}

/* ---------- SRT / VTT ---------- */
const srtTime = s => {
  const ms = Math.round(Math.max(0, s) * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60, r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(r).padStart(3, '0')}`;
};
function toSRT() {
  return sortSubs().filter(x => (x.text || '').trim()).map((x, i) => `${i + 1}\n${srtTime(x.start)} --> ${srtTime(x.end)}\n${plain(x.text)}\n`).join('\n');
}
function parseSubtitleFile(text) {
  const out = [];
  const tm = v => { const m = v.trim().replace(',', '.').match(/(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/); return m ? (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) : NaN; };
  const blocks = text.replace(/\r/g, '').replace(/^WEBVTT[^\n]*\n/, '').split(/\n\s*\n/);
  for (const b of blocks) {
    const lines = b.split('\n').filter(l => l.trim());
    const ti = lines.findIndex(l => l.includes('-->'));
    if (ti < 0) continue;
    const [a, z] = lines[ti].split('-->');
    const start = tm(a), end = tm(z.split(' ').filter(Boolean)[0] || z);
    const body = lines.slice(ti + 1).join('\n').replace(/<[^>]+>/g, '').trim();
    if (isFinite(start) && isFinite(end) && end > start && body) out.push({ start, end, text: body });
  }
  return out;
}
