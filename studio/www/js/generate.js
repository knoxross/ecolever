/* 영상뚝딱 — AI 생성 (Google Gemini API 키 하나로)
 *  - 진짜 같은 사진 만들기 (Imagen): 인물(성별·나이·분위기), 물건, 장소
 *  - 사진/글로 짧은 영상 만들기 (Veo)
 *  - AI 성우 목소리 (Gemini TTS) — 한국어 가능, 남녀 목소리·말투
 * 모델 이름은 키 확인 때 자동으로 최신 모델을 찾아 정합니다.
 */
'use strict';

const GEN = { key: '', imageModel: '', videoModel: '', ttsModel: '' };
const G_BASE = 'https://generativelanguage.googleapis.com/v1beta';

async function loadGenSettings() {
  GEN.key = (await Platform.getSecret('google_api_key')) || '';
  GEN.imageModel = Platform.getPref('gen_image_model') || 'imagen-4.0-generate-001';
  GEN.videoModel = Platform.getPref('gen_video_model') || 'veo-3.0-generate-001';
  GEN.ttsModel = Platform.getPref('gen_tts_model') || 'gemini-2.5-flash-preview-tts';
}
const genReady = () => !!GEN.key;

async function gRequest(path, { method = 'POST', body, key = GEN.key, signal } = {}) {
  let res;
  try {
    res = await fetch(`${G_BASE}/${path}`, {
      method,
      headers: { 'x-goog-api-key': key, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('취소했습니다.');
    throw new Error('인터넷 연결을 확인해 주세요. (Google AI 서버에 연결할 수 없음)');
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : {}; } catch (e) { /* 아래에서 처리 */ }
  if (!res.ok) {
    const msg = json?.error?.message || text.slice(0, 200);
    const reason = json?.error?.details?.find?.(d => d.reason)?.reason || json?.error?.status || '';
    const err = new Error(googleErrorMessage(res.status, msg, reason));
    err.raw = msg; err.status = res.status;
    throw err;
  }
  return json;
}
function googleErrorMessage(status, msg, reason) {
  if (reason === 'API_KEY_INVALID' || status === 401) return 'Google API 키가 올바르지 않습니다. AI 설정에서 확인해 주세요.';
  if (status === 403) return '이 키로는 해당 기능을 쓸 수 없습니다. (결제 등록이 필요하거나 지역 제한일 수 있어요) — ' + msg;
  if (status === 429) return '요청이 너무 많거나 무료 사용량을 넘었습니다. 잠시 후 다시 시도하거나 결제를 등록해 주세요.';
  if (status === 404) return '모델을 찾을 수 없습니다. AI 설정에서 \'연결 테스트\'를 눌러 최신 모델로 갱신해 주세요.';
  if (/safety|blocked|policy/i.test(msg)) return '안전 정책 때문에 만들 수 없는 내용입니다. 설명을 바꿔 주세요.';
  return `Google AI 오류 (${status}): ${msg}`;
}

/** 키 확인 + 쓸 수 있는 최신 모델 자동 선택 */
async function testGoogleKey(key) {
  try {
    const all = [];
    let token = '';
    do {
      const r = await gRequest(`models?pageSize=1000${token ? '&pageToken=' + token : ''}`, { method: 'GET', key });
      all.push(...(r.models || []));
      token = r.nextPageToken || '';
    } while (token);
    const has = (m, method) => (m.supportedGenerationMethods || []).includes(method);
    const ver = n => { const m = n.match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
    const pick = (filter) => all.filter(filter).map(m => m.name.replace(/^models\//, ''))
      .sort((a, b) => ver(b) - ver(a) || (/preview|exp/.test(a) ? 1 : 0) - (/preview|exp/.test(b) ? 1 : 0) || (/fast|lite/.test(a) ? 1 : 0) - (/fast|lite/.test(b) ? 1 : 0))[0] || '';
    const image = pick(m => /imagen/i.test(m.name) && has(m, 'predict'));
    const video = pick(m => /veo/i.test(m.name) && has(m, 'predictLongRunning'));
    const tts = pick(m => /tts/i.test(m.name) && has(m, 'generateContent'));
    const found = { image, video, tts };
    const parts = [image ? `사진(${image})` : '사진 ✕', video ? `영상(${video})` : '영상 ✕', tts ? `목소리(${tts})` : '목소리 ✕'];
    return { ok: true, found, message: '연결 성공 — ' + parts.join(' · ') };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

/* ------------------------------------------------------------------ 사진 만들기 */
const PEOPLE = {
  gender: [{ v: 'woman', label: '여성' }, { v: 'man', label: '남성' }, { v: 'girl', label: '여자아이' }, { v: 'boy', label: '남자아이' }, { v: 'couple', label: '커플' }, { v: 'family', label: '가족' }, { v: 'group', label: '여러 사람' }],
  age: [{ v: '', label: '나이 무관' }, { v: 'child around 7 years old', label: '어린이 (7세 전후)' }, { v: 'teenager', label: '10대' }, { v: 'in their 20s', label: '20대' }, { v: 'in their 30s', label: '30대' }, { v: 'in their 40s', label: '40대' }, { v: 'in their 50s', label: '50대' }, { v: 'in their 60s', label: '60대' }, { v: 'in their 70s', label: '70대 이상' }],
  look: [{ v: 'Korean', label: '한국인' }, { v: 'East Asian', label: '동아시아인' }, { v: 'Caucasian', label: '서양인' }, { v: 'Black', label: '흑인' }, { v: 'Southeast Asian', label: '동남아시아인' }, { v: 'Latino', label: '라틴계' }, { v: '', label: '상관없음' }],
  mood: [{ v: 'smiling naturally', label: '자연스러운 미소' }, { v: 'laughing joyfully', label: '활짝 웃음' }, { v: 'calm and confident expression', label: '차분·자신감' }, { v: 'serious professional expression', label: '진지·전문가' }, { v: 'surprised and delighted', label: '놀람·감탄' }],
  shot: [{ v: 'medium shot', label: '상반신' }, { v: 'close-up portrait', label: '얼굴 클로즈업' }, { v: 'full body shot', label: '전신' }, { v: 'wide shot showing the surroundings', label: '배경 넓게' }],
};
const REALISM = 'photorealistic, real photograph, shot on a full-frame camera with a 50mm lens, natural lighting, realistic skin texture and pores, natural hair strands, accurate hands, true-to-life colors, high detail, sharp focus, no text, no watermark';

function buildPersonPrompt(o) {
  const subj = {
    woman: 'a woman', man: 'a man', girl: 'a young girl', boy: 'a young boy', couple: 'a couple', family: 'a family with parents and children', group: 'a small group of people',
  }[o.gender] || 'a person';
  const look = o.look ? `${o.look} ` : '';
  const age = o.age && !['girl', 'boy', 'family', 'group'].includes(o.gender) ? ` ${o.age}` : '';
  const parts = [`${o.shot || 'medium shot'} of ${look}${subj}${age}, ${o.mood || 'smiling naturally'}`];
  if (o.action) parts.push(o.action);
  if (o.place) parts.push(`at ${o.place}`);
  if (o.outfit) parts.push(`wearing ${o.outfit}`);
  return parts.join(', ') + '. ' + REALISM;
}
function buildObjectPrompt(o) {
  const scene = o.place ? `, placed in ${o.place}` : ', on a clean studio background';
  return `Professional product photograph of ${o.what}${scene}${o.action ? ', ' + o.action : ''}. Commercial photography, softbox lighting, realistic materials and textures, accurate shape and proportions, high detail, sharp focus, true-to-life colors, no text, no watermark`;
}
const imagenAspect = a => ({ '16:9': '16:9', '9:16': '9:16', '1:1': '1:1', '4:5': '3:4' }[a] || '1:1');

/** 결과: File[] */
async function generateImages({ prompt, aspect, count = 1, people = true, signal }) {
  const body = (pg) => ({
    instances: [{ prompt }],
    parameters: Object.assign({ sampleCount: clamp(count, 1, 4), aspectRatio: imagenAspect(aspect) }, pg ? { personGeneration: pg } : {}),
  });
  let r;
  try {
    r = await gRequest(`models/${GEN.imageModel}:predict`, { body: body(people ? 'allow_all' : undefined), signal });
  } catch (e) {
    if (people && /person|allow_all/i.test(e.raw || '')) r = await gRequest(`models/${GEN.imageModel}:predict`, { body: body('allow_adult'), signal });
    else throw e;
  }
  const preds = (r.predictions || []).filter(p => p.bytesBase64Encoded);
  if (!preds.length) throw new Error('사진이 만들어지지 않았습니다. (안전 정책에 걸렸을 수 있어요) 설명을 바꿔 다시 시도해 주세요.');
  const stamp = Date.now().toString(36);
  return preds.map((p, i) => base64ToFile(p.bytesBase64Encoded, `AI사진-${stamp}-${i + 1}.png`, p.mimeType || 'image/png'));
}

/* ------------------------------------------------------------------ 영상 만들기 */
/** image: File|null (사진을 움직이게) 결과: File */
async function generateVideo({ prompt, aspect, image, onStatus, signal }) {
  const inst = { prompt };
  if (image) {
    inst.image = { bytesBase64Encoded: await fileToBase64(image), mimeType: image.type || 'image/jpeg' };
  }
  const params = { aspectRatio: aspect === '9:16' ? '9:16' : '16:9' };
  onStatus?.('영상 만들기 요청 중…');
  let op;
  try {
    op = await gRequest(`models/${GEN.videoModel}:predictLongRunning`, { body: { instances: [inst], parameters: Object.assign({ personGeneration: image ? 'allow_adult' : 'allow_all' }, params) }, signal });
  } catch (e) {
    if (/person/i.test(e.raw || '')) op = await gRequest(`models/${GEN.videoModel}:predictLongRunning`, { body: { instances: [inst], parameters: params }, signal });
    else throw e;
  }
  const started = Date.now();
  while (!op.done) {
    if (signal?.aborted) throw new Error('취소했습니다.');
    const sec = Math.round((Date.now() - started) / 1000);
    onStatus?.(`AI가 영상을 만드는 중… ${sec}초 (보통 1~3분 걸려요)`);
    if (sec > 15 * 60) throw new Error('영상 만들기가 너무 오래 걸립니다. 잠시 후 다시 시도해 주세요.');
    await wait(8000);
    op = await gRequest(op.name, { method: 'GET', signal });
  }
  if (op.error) throw new Error(googleErrorMessage(op.error.code || 500, op.error.message || '', ''));
  const resp = op.response?.generateVideoResponse || op.response || {};
  const samples = resp.generatedSamples || resp.videos || [];
  const uri = samples[0]?.video?.uri || samples[0]?.uri;
  const inline = samples[0]?.video?.bytesBase64Encoded || samples[0]?.bytesBase64Encoded;
  if (inline) return base64ToFile(inline, `AI영상-${Date.now().toString(36)}.mp4`, 'video/mp4');
  if (!uri) {
    const why = resp.raiMediaFilteredReasons?.join(' ') || '';
    throw new Error('영상이 만들어지지 않았습니다. ' + (why ? `(${why}) ` : '') + '설명을 바꿔 다시 시도해 주세요.');
  }
  onStatus?.('완성된 영상 받는 중…');
  const bytes = await downloadWithKey(uri, signal);
  return new File([bytes], `AI영상-${Date.now().toString(36)}.mp4`, { type: 'video/mp4' });
}
async function downloadWithKey(uri, signal) {
  if (window.native?.httpGet) { // 데스크톱: 앱이 직접 받음 (브라우저 제한 없음)
    const r = await window.native.httpGet(uri, { 'x-goog-api-key': GEN.key });
    if (r.status >= 400) throw new Error(`영상 받기 실패 (${r.status})`);
    return r.body;
  }
  const capHttp = window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.CapacitorHttp;
  if (capHttp) { // 안드로이드: 앱이 직접 받음
    const r = await capHttp.request({ url: uri, method: 'GET', headers: { 'x-goog-api-key': GEN.key }, responseType: 'blob' });
    if (r.status >= 400) throw new Error(`영상 받기 실패 (${r.status})`);
    return base64ToBytes(r.data);
  }
  const res = await fetch(uri, { headers: { 'x-goog-api-key': GEN.key }, signal });
  if (!res.ok) throw new Error(`영상 받기 실패 (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

/* ------------------------------------------------------------------ AI 성우 */
const TTS_VOICES = [
  { v: 'Kore', label: '여성 · 차분하고 또렷한', g: 'f' },
  { v: 'Zephyr', label: '여성 · 밝고 경쾌한', g: 'f' },
  { v: 'Leda', label: '여성 · 젊고 상냥한', g: 'f' },
  { v: 'Aoede', label: '여성 · 산뜻한', g: 'f' },
  { v: 'Sulafat', label: '여성 · 따뜻한', g: 'f' },
  { v: 'Vindemiatrix', label: '여성 · 부드러운', g: 'f' },
  { v: 'Charon', label: '남성 · 신뢰감 있는 (정보 전달)', g: 'm' },
  { v: 'Puck', label: '남성 · 경쾌한', g: 'm' },
  { v: 'Fenrir', label: '남성 · 활기찬', g: 'm' },
  { v: 'Orus', label: '남성 · 묵직한', g: 'm' },
  { v: 'Achird', label: '남성 · 친근한', g: 'm' },
  { v: 'Enceladus', label: '남성 · 낮고 숨결 있는', g: 'm' },
];
const TTS_STYLES = [
  { v: '', label: '기본' },
  { v: 'Say cheerfully and energetically', label: '밝고 활기차게' },
  { v: 'Say calmly and warmly', label: '차분하고 따뜻하게' },
  { v: 'Say like a professional TV commercial voice actor', label: '광고 성우처럼' },
  { v: 'Say like a news anchor, clear and trustworthy', label: '뉴스 앵커처럼' },
  { v: 'Say softly, almost whispering', label: '속삭이듯' },
  { v: 'Say like a friendly elderly grandmother', label: '할머니처럼' },
  { v: 'Say like a cheerful young child', label: '어린아이처럼' },
];
/** 결과: AudioBuffer */
async function generateSpeech({ text, voice, style, signal }) {
  const prompt = style ? `${style}: ${text}` : text;
  const r = await gRequest(`models/${GEN.ttsModel}:generateContent`, {
    body: {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || 'Kore' } } } },
    },
    signal,
  });
  const part = r.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!part) throw new Error('목소리가 만들어지지 않았습니다. 문장을 바꿔 다시 시도해 주세요.');
  const mime = part.inlineData.mimeType || '';
  const bytes = base64ToBytes(part.inlineData.data);
  if (/wav|mpeg|mp3|ogg/.test(mime)) return await decodeAudioFile(new File([bytes], 'tts', { type: mime }));
  const rate = parseInt((mime.match(/rate=(\d+)/) || [])[1] || '24000', 10);
  return pcm16ToAudioBuffer(bytes, rate);
}

/* ------------------------------------------------------------------ 도우미 */
function base64ToBytes(b64) {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function base64ToFile(b64, name, type) { return new File([base64ToBytes(b64)], name, { type }); }
function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
