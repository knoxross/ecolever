/* 영상뚝딱 — 업로드 도우미
 *  - 알고리즘 점검표: 플랫폼(쇼츠·릴스·틱톡·유튜브)이 추천을 잘 해 주는 조건을 점검하고 한 번에 고치기
 *  - 제목·설명·해시태그 만들기 (Claude 키가 있으면 AI, 없으면 기본 문구)
 *  - 썸네일 만들기
 *  - 업로드 페이지 열기 + 문구 복사
 * ※ 어떤 도구도 추천(알고리즘)을 보장할 수는 없습니다. 플랫폼이 공개한 권장 사항과 일반적인 경험칙을 바탕으로 합니다.
 */
'use strict';

const PLATFORMS = [
  { v: 'shorts', label: 'YouTube 쇼츠', aspect: '9:16', maxLen: 180, best: [15, 45], upload: 'https://www.youtube.com/upload', tags: 3 },
  { v: 'reels', label: '인스타 릴스', aspect: '9:16', maxLen: 180, best: [7, 30], upload: 'https://www.instagram.com/', tags: 5 },
  { v: 'tiktok', label: '틱톡', aspect: '9:16', maxLen: 600, best: [10, 35], upload: 'https://www.tiktok.com/upload', tags: 4 },
  { v: 'youtube', label: '유튜브 (가로 영상)', aspect: '16:9', maxLen: 7200, best: [60, 600], upload: 'https://www.youtube.com/upload', tags: 3 },
];

/** 점검표: [{ok, level, text, fix?}] */
function algorithmChecklist(platform) {
  const P = PLATFORMS.find(p => p.v === platform) || PLATFORMS[0];
  const total = totalDuration();
  const media = state.clips.filter(c => c.kind === 'media');
  const first = state.clips[0];
  const items = [];
  const add = (ok, text, fix, why) => items.push({ ok, text, fix, why });

  add(S.aspect === P.aspect, `화면 비율 ${P.aspect}`, S.aspect !== P.aspect ? () => { S.aspect = P.aspect; } : null,
    S.aspect === P.aspect ? '플랫폼에 꽉 차게 보입니다' : `지금은 ${S.aspect}. 꽉 찬 화면이 끝까지 보는 비율을 높입니다`);
  add(total <= P.maxLen && total >= Math.min(5, P.best[0]), `길이 ${total.toFixed(0)}초 (권장 ${P.best[0]}~${P.best[1]}초)`, null,
    total > P.best[1] ? '짧을수록 끝까지 보는 비율(완주율)이 올라갑니다. 장면을 줄이거나 짧게 해 보세요' : total < P.best[0] ? '너무 짧으면 내용 전달이 어렵습니다' : '좋습니다');
  const hookOk = first && (first.kind === 'media' || first.duration <= 1.6);
  add(hookOk, '첫 1~2초 안에 핵심 장면 (훅)', hookOk ? null : () => {
    first.duration = 1.2;
    const m1 = state.clips.find(c => c.kind === 'media');
    if (m1 && !(m1.text || '').trim()) { m1.text = first.text; m1.textPos = 'top'; m1.textAnim = 'pop'; m1.fontSize = Math.max(m1.fontSize, 80); state.clips.shift(); state.clips[0].transition = 'none'; }
  }, hookOk ? '좋습니다' : '처음 1~2초에 넘겨지면 추천이 끊깁니다. 제목 화면을 줄이거나 첫 장면 위에 제목을 얹으세요');
  const lay0 = layout();
  const captioned = media.filter(c => { const L = lay0.find(l => l.clip === c); return (c.text || '').trim() || c.voiceId || (L && state.subs.some(x => x.start < L.end && x.end > L.start)); }).length;
  const capOk = media.length && captioned / media.length >= 0.5;
  add(capOk, `자막·목소리 있는 장면 ${captioned}/${media.length}`, null, capOk ? '소리 끄고 보는 사람도 이해합니다' : '대부분 소리를 끄고 봅니다. 장면에 자막을 넣으세요 (✨ AI 편집이 자동으로 써 줍니다)');
  const avg = media.length ? media.reduce((a, c) => a + c.duration, 0) / media.length : 0;
  const paceOk = P.v === 'youtube' || avg <= 3.2;
  add(paceOk, `장면 평균 ${avg.toFixed(1)}초`, paceOk ? null : () => { state.clips.forEach(c => { if (c.kind === 'media' && !isVideoClip(c)) c.duration = Math.min(c.duration, 2.2); }); },
    paceOk ? '지루하지 않은 속도입니다' : '짧은 영상은 2~3초마다 장면이 바뀌는 게 좋습니다');
  const hasSound = !!S.bgmId || state.clips.some(c => c.voiceId || (isVideoClip(c) && c.volume > 0));
  add(hasSound, '배경음악 또는 소리', null, hasSound ? '좋습니다' : '소리가 없으면 추천에 불리합니다. 음악 파일을 넣어 주세요 (저작권 없는 음악 권장)');
  const last = state.clips[state.clips.length - 1];
  const ctaOk = last && ((last.kind === 'text') || /구독|팔로우|문의|댓글|좋아요|링크|저장/.test((last.text || '') + (last.sub || '')));
  add(ctaOk, '마지막 행동 유도 (구독·팔로우·문의)', ctaOk ? null : () => {
    const portrait = S.aspect === '9:16';
    const c = newClip('text', { text: P.v === 'reels' ? '저장하고 팔로우!' : '구독·좋아요 부탁해요', sub: '', textPos: 'center', fontSize: portrait ? 110 : 120, font: FONTS[1].v, textBg: false, textAnim: 'pop', duration: 1.8, bgColor: '#2f4332', bgColor2: '#4f7353' });
    state.clips.push(c);
  }, ctaOk ? '좋습니다' : '마지막에 할 일을 알려 주면 댓글·팔로우가 늘어납니다');
  const hiRes = S.quality >= 1080;
  add(hiRes, `화질 ${S.quality}p`, hiRes ? null : () => { S.quality = 1080; }, hiRes ? '선명합니다' : '1080p 로 올리면 화질 저하가 적습니다');
  const enh = media.filter(c => c.enhance > 0).length;
  const lowRes = media.filter(c => { const m = clipMedia(c); return m && Math.max(m.w, m.h) < 1000 && !c.enhance; });
  add(!lowRes.length, '저화질 원본 보정', lowRes.length ? () => { lowRes.forEach(c => { c.enhance = 0.7; }); } : null,
    lowRes.length ? `작은 사진·영상 ${lowRes.length}개 — 화질 향상을 켜면 선명해집니다` : enh ? '화질 향상 적용됨' : '좋습니다');
  return items;
}

/* ---------- 제목·설명·해시태그 ---------- */
const STOPWORDS = new Set(['그리고', '하지만', '영상', '만들어', '만들기', '해주세요', '넣어', '마지막', '제목', '자막', '내레이션', '신나게', '잔잔하게', '깔끔하게', '고급스럽게', '귀엽게', '쇼츠', '릴스', '틱톡', '유튜브', '인스타', '가로', '세로']);
function keywordsFromProject() {
  const text = [$('#cmdInput').value, ...state.clips.map(c => `${c.text || ''} ${c.sub || ''} ${c.narration || ''}`)].join(' ');
  const words = (text.match(/[가-힣A-Za-z]{2,12}/g) || [])
    .map(w => w.replace(/(은|는|이|가|을|를|에|의|로|으로|와|과|도|만|에서|하고|해요|입니다|합니다)$/, ''))
    .filter(w => w.length >= 2 && !STOPWORDS.has(w) && !/^\d/.test(w));
  const count = new Map();
  words.forEach(w => count.set(w, (count.get(w) || 0) + 1));
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 8);
}
function basicCopy(platform) {
  const P = PLATFORMS.find(p => p.v === platform);
  const title = state.clips.find(c => c.kind === 'text')?.text || state.clips.find(c => (c.text || '').trim())?.text || keywordsFromProject().slice(0, 3).join(' ');
  const kws = keywordsFromProject();
  const caps = state.clips.map(c => (c.text || '').trim()).filter(Boolean);
  const contact = state.clips.map(c => c.sub || '').find(s => /\d{2,}|@|www/.test(s)) || '';
  const tags = [...kws.slice(0, P.tags).map(k => '#' + k.replace(/\s/g, ''))];
  if (platform === 'shorts') tags.push('#Shorts');
  if (platform === 'reels') tags.push('#릴스');
  const desc = [caps.slice(0, 4).join(' · '), contact ? `문의 ${contact}` : '', platform === 'youtube' ? '구독과 좋아요는 큰 힘이 됩니다!' : ''].filter(Boolean).join('\n');
  return { title: String(title).replace(/\n/g, ' ').slice(0, 90), description: desc, hashtags: tags.join(' ') };
}
const COPY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'description', 'hashtags', 'thumbnail_text', 'tips'],
  properties: { title: { type: 'string' }, description: { type: 'string' }, hashtags: { type: 'string' }, thumbnail_text: { type: 'string' }, tips: { type: 'string' } },
};
async function aiCopy(platform, signal) {
  const P = PLATFORMS.find(p => p.v === platform);
  const scenes = state.clips.map((c, i) => `${i + 1}. ${c.kind === 'text' ? '[글자 화면] ' : ''}${(c.text || '').replace(/\n/g, ' ')} ${c.sub ? '(' + c.sub + ')' : ''} ${c.narration ? '내레이션: ' + c.narration : ''}`).join('\n');
  const frame = thumbnailCanvas(640, false).toDataURL('image/jpeg', 0.7).split(',')[1];
  const res = await aiClient().messages.create({
    model: AI.model, max_tokens: 4000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: COPY_SCHEMA } },
    system: `당신은 한국 SNS 숏폼 마케팅 전문가입니다. ${P.label}에 올릴 영상의 업로드 문구를 씁니다.
- title: 검색과 클릭을 부르는 한국어 제목 (과장·낚시 금지, ${platform === 'youtube' ? '60자' : '40자'} 이내, 핵심 키워드를 앞쪽에)
- description: 첫 줄에 핵심을 담은 2~4줄 설명. 영상에 있는 연락처·상호는 그대로 포함. 영상에 없는 사실(가격·효능·수상 등)은 지어내지 마세요.
- hashtags: 관련성 높은 해시태그 ${P.tags}~${P.tags + 2}개를 공백으로 구분 (${platform === 'shorts' ? '#Shorts 포함' : '너무 일반적인 태그만 쓰지 말 것'})
- thumbnail_text: 썸네일에 크게 넣을 6~12자 문구
- tips: 이 영상을 ${P.label}에서 더 많이 노출시키기 위한 구체적인 조언 2~3줄 (올리는 시간대, 첫 댓글, 시리즈화 등)`,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: frame } },
      { type: 'text', text: `만든 사람의 요청: ${$('#cmdInput').value || '(없음)'}\n영상 길이: ${totalDuration().toFixed(0)}초, 비율 ${S.aspect}\n장면 구성:\n${scenes}` },
    ] }],
  }, { signal });
  if (res.stop_reason === 'refusal') throw new Error('AI가 문구 작성을 거절했습니다.');
  return JSON.parse(res.content.filter(b => b.type === 'text').map(b => b.text).join(''));
}

/* ---------- 썸네일 ---------- */
function thumbnailCanvas(width, withText = true, text = '') {
  const lay = layout();
  const firstMedia = lay.find(l => l.clip.kind === 'media') || lay[0];
  const t = firstMedia ? firstMedia.start + Math.min(firstMedia.clip.duration * 0.6, firstMedia.clip.duration - 0.05) : 0;
  const prevT = state.time;
  render(Math.max(0, t));
  const out = document.createElement('canvas');
  out.width = width; out.height = Math.round(width * canvas.height / canvas.width);
  const g = out.getContext('2d');
  g.drawImage(canvas, 0, 0, out.width, out.height);
  if (withText && text) {
    const fs = Math.round(Math.min(out.width, out.height) * 0.13);
    g.font = `400 ${fs}px 'Black Han Sans', 'Noto Sans KR', sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = text.split('\n');
    const y0 = out.height * 0.5 - (lines.length - 1) * fs * 0.6;
    lines.forEach((l, i) => {
      g.lineJoin = 'round'; g.lineWidth = fs * 0.22; g.strokeStyle = '#111';
      g.strokeText(l, out.width / 2, y0 + i * fs * 1.2);
      g.fillStyle = i === 0 ? '#ffe14d' : '#ffffff';
      g.fillText(l, out.width / 2, y0 + i * fs * 1.2);
    });
  }
  render(prevT);
  return out;
}
