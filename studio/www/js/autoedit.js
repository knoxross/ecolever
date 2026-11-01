/* 영상뚝딱 — 명령어 자동편집
 * 명령어(한국어 문장) → 계획(plan) → 장면 구성.
 * AI(Claude)를 쓰면 ai.js 가 같은 형식의 plan 을 만들어 applyPlan() 으로 넘깁니다.
 */
'use strict';

const MOODS = {
  energetic: {
    label: '신나게', clipDur: 1.6, trans: ['slide', 'zoom', 'wipe', 'slideup', 'none'], transDur: 0.3,
    font: "'Black Han Sans'", anim: 'pop', filter: 'vivid', motion: ['zoomIn', 'panLeft', 'zoomOut', 'panRight'],
    titleBg: ['#ff4f7b', '#6b4dff'], textColor: '#ffffff', textBg: false, titleDur: 1.8, beats: 2,
  },
  calm: {
    label: '감성·잔잔', clipDur: 3.6, trans: ['fade'], transDur: 1.0,
    font: "'Gowun Batang'", anim: 'fade', filter: 'warm', motion: ['zoomIn', 'panRight', 'zoomOut', 'panLeft'],
    titleBg: ['#3a2f26', '#705b45'], textColor: '#fff6e8', textBg: false, titleDur: 3.2, beats: 8,
  },
  luxury: {
    label: '고급·세련', clipDur: 3.0, trans: ['fade', 'dip', 'blur'], transDur: 0.9,
    font: "'Gowun Batang'", anim: 'fade', filter: 'soft', motion: ['zoomIn', 'zoomOut'],
    titleBg: ['#0e0e0e', '#2a2723'], textColor: '#f1e2bf', textBg: false, titleDur: 3.0, beats: 4,
  },
  cute: {
    label: '귀엽게', clipDur: 2.2, trans: ['slideup', 'zoom', 'circle'], transDur: 0.45,
    font: "'Jua'", anim: 'pop', filter: 'soft', motion: ['zoomIn', 'panUp', 'zoomOut'],
    titleBg: ['#ff9fbd', '#ffd28a'], textColor: '#ffffff', textBg: true, titleDur: 2.2, beats: 4,
  },
  clean: {
    label: '깔끔', clipDur: 2.6, trans: ['fade', 'slide'], transDur: 0.5,
    font: "'Noto Sans KR'", anim: 'up', filter: 'none', motion: ['zoomIn', 'zoomOut', 'panRight'],
    titleBg: ['#2f4332', '#4f7353'], textColor: '#ffffff', textBg: true, titleDur: 2.4, beats: 4,
  },
};

const COMMAND_EXAMPLES = [
  "인스타 릴스 15초, 신나게, 제목은 '에코백 신상 출시'",
  "유튜브용 30초 제품 소개, 고급스럽게, 마지막에 010-1234-5678",
  "감성 브이로그처럼 잔잔하게, 따뜻한 색감",
  "쇼츠 20초, 귀엽게, 자막: 오늘의 신상 / 튼튼한 황마 / 대량 주문 환영",
  "행사 하이라이트 1분, 깔끔하게, 사진마다 3초, 'ECO FESTIVAL 2026'",
  "흑백으로 빈티지하게, 섞어서",
];

/* ------------------------------------------------------------------ 명령어 해석 */
function parseCommand(text) {
  const raw = String(text || '').trim();
  let t = raw;
  const it = { raw, mood: null, aspect: null, total: null, perClip: null, title: '', sub: '', captions: [], narrations: [], voice: false, contacts: [], filter: null, order: 'keep', intro: true, outro: true, noCaption: false, noMusic: false, outroText: '' };

  // 따옴표 안의 글자 → 제목 / 부제목
  const quoted = [...t.matchAll(/["“”'‘’「『]([^"“”'‘’」』\n]{1,60})["“”'‘’」』]/g)].map(m => m[1].trim());
  // 자막: a / b / c
  const cap = t.match(/자막\s*[:：]\s*([^\n]+)/);
  if (cap) {
    const parts = cap[1].split(/\s*[\/|·]\s*/);
    parts.push(parts.pop().split(/\s*[,，]\s*/)[0]); // 마지막 자막은 쉼표 앞까지
    it.captions = parts.map(s => s.replace(/^["“'‘]|["”'’]$/g, '').trim()).filter(Boolean);
    t = t.replace(cap[0], ' ' + cap[1].slice(cap[1].indexOf(parts[parts.length - 1]) + parts[parts.length - 1].length) + ' ');
  }
  const nar = t.match(/(?:내레이션|나레이션|목소리|성우)\s*[:：]\s*([^\n]+)/);
  if (nar) {
    const np = nar[1].split(/\s*[\/|]\s*/);
    np.push(np.pop().split(/\s*[,，]\s*/)[0]);
    it.narrations = np.map(s => s.replace(/^["“'‘]|["”'’]$/g, '').trim()).filter(Boolean);
    t = t.replace(nar[0], ' ' + nar[1].slice(nar[1].indexOf(np[np.length - 1]) + np[np.length - 1].length) + ' ');
  }
  it.voice = !!nar || /내레이션|나레이션|목소리|성우|읽어|설명해/.test(t);
  const capQuoted = new Set([...it.captions, ...it.narrations]);
  const titles = quoted.filter(q => !capQuoted.has(q));
  if (titles[0]) it.title = titles[0];
  if (titles[1]) it.sub = titles[1];
  if (!it.title) {
    const m = t.match(/제목\s*(?:은|는|이|:|：)?\s*([^,\n.]{1,40})/);
    if (m && !/없|빼/.test(m[1])) it.title = m[1].replace(/(으로|로)\s*(해|하고|넣어).*$/, '').trim();
  }
  // 연락처
  const phone = t.match(/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g) || [];
  const email = t.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [];
  const url = t.match(/(?:https?:\/\/)?www\.[\w-]+(?:\.[\w-]+)+[^\s,]*/g) || [];
  it.contacts = [...phone, ...email, ...url];
  const ending = t.match(/(?:마지막|끝|엔딩)\s*(?:에|은|는)?\s*["“'‘]([^"”'’]+)["”'’]/);
  if (ending) { it.outroText = ending[1]; it.title = it.title === ending[1] ? (titles.find(x => x !== ending[1]) || '') : it.title; }

  // 장면당 길이
  const per = t.match(/(?:장면|사진|컷|한\s*장)\s*(?:마다|당|별로?|에)\s*(\d+(?:\.\d+)?)\s*초/) || t.match(/(\d+(?:\.\d+)?)\s*초\s*(?:씩|마다)/);
  if (per) { it.perClip = parseFloat(per[1]); t = t.replace(per[0], ' '); }
  // 전체 길이
  const mm = t.match(/(\d+)\s*분\s*(?:(\d+)\s*초)?/);
  const ss = t.match(/(\d+(?:\.\d+)?)\s*초/);
  if (mm) it.total = parseInt(mm[1], 10) * 60 + (mm[2] ? parseInt(mm[2], 10) : 0);
  else if (ss) it.total = parseFloat(ss[1]);
  if (it.total) it.total = clamp(it.total, 3, 600);

  // 비율
  if (/쇼츠|숏츠|shorts|릴스|reels|틱톡|tiktok|세로|스토리|9\s*:\s*16/i.test(t)) it.aspect = '9:16';
  else if (/정사각|1\s*:\s*1/.test(t)) it.aspect = '1:1';
  else if (/피드|4\s*:\s*5/.test(t)) it.aspect = '4:5';
  else if (/유튜브|youtube|가로|와이드|16\s*:\s*9|pc용|발표/i.test(t)) it.aspect = '16:9';
  else if (/인스타/.test(t)) it.aspect = '9:16';

  // 분위기
  const moodRules = [
    ['energetic', /신나|경쾌|빠르|빠른|활기|역동|힙|트렌디|비트|강렬|임팩트|하이라이트|다이나믹/],
    ['calm', /잔잔|감성|차분|힐링|브이로그|vlog|추억|따뜻한\s*분위기|서정|아련/i],
    ['luxury', /고급|럭셔리|세련|프리미엄|우아|미니멀|시크|명품/],
    ['cute', /귀엽|귀여|발랄|아기자기|깜찍|키즈|아이들|유쾌|재밌|재미있/],
    ['clean', /깔끔|심플|단정|정보|소개|설명|홍보|안내|기업|회사/],
  ];
  for (const [k, re] of moodRules) if (re.test(t)) { it.mood = k; break; }

  // 색감
  if (/흑백/.test(t)) it.filter = 'bw';
  else if (/빈티지|레트로|필름|옛날/.test(t)) it.filter = 'film';
  else if (/따뜻|웜톤|노을/.test(t)) it.filter = 'warm';
  else if (/시원|청량|쿨톤|여름/.test(t)) it.filter = 'cool';
  else if (/선명|쨍|화사/.test(t)) it.filter = 'vivid';
  else if (/부드럽|뽀얗|파스텔/.test(t)) it.filter = 'soft';
  else if (/원본\s*색|필터\s*(없이|빼)/.test(t)) it.filter = 'none';

  if (/섞어|랜덤|무작위|셔플/.test(t)) it.order = 'shuffle';
  else if (/역순|거꾸로|최신순/.test(t)) it.order = 'reverse';
  if (/(제목|인트로|오프닝|타이틀)\s*(화면)?\s*(없이|빼|없음|생략)/.test(t)) it.intro = false;
  if (/(엔딩|아웃트로|마지막\s*화면|끝\s*화면)\s*(없이|빼|없음|생략)/.test(t)) it.outro = false;
  if (/자막\s*(없이|빼|없음|생략)/.test(t)) it.noCaption = true;
  if (/(음악|노래|bgm|배경음)\s*(없이|빼|없음)|무음/i.test(t)) it.noMusic = true;
  return it;
}

/* ------------------------------------------------------------------ 계획 만들기 (AI 없이) */
function visualMedia() { return state.media.filter(m => m.type === 'image' || m.type === 'video'); }
function orientationOf(m) { return m.w >= m.h * 1.1 ? 'land' : m.h >= m.w * 1.1 ? 'port' : 'square'; }

function planFromCommand(text) {
  const it = parseCommand(text);
  let media = visualMedia().filter(m => m.id !== S.logoId);
  if (!media.length) throw new Error('먼저 사진이나 동영상을 넣어 주세요.');
  if (it.order === 'shuffle') media = shuffle(media.slice());
  else if (it.order === 'reverse') media = media.slice().reverse();

  const port = media.filter(m => orientationOf(m) === 'port').length;
  const aspect = it.aspect || (port > media.length / 2 ? '9:16' : '16:9');
  const moodKey = it.mood || (aspect === '9:16' && (it.total || 99) <= 30 ? 'energetic' : 'clean');
  const mood = MOODS[moodKey];

  const hasIntro = it.intro && !!it.title;
  const outroText = it.outroText || (it.contacts.length ? (/문의/.test(it.raw) ? '문의' : (it.title || '문의')) : '');
  const hasOutro = it.outro && !!(outroText || it.contacts.length);
  const titleDur = mood.titleDur, outroDur = Math.max(2.4, mood.titleDur);

  // 장면 길이 정하기
  const weights = media.map(m => (m.type === 'video' ? 1.6 : 1));
  let unit = it.perClip || mood.clipDur;
  if (it.total && !it.perClip) {
    const budget = Math.max(media.length * 0.6, it.total - (hasIntro ? titleDur : 0) - (hasOutro ? outroDur : 0));
    unit = budget / weights.reduce((a, b) => a + b, 0);
  }
  const clips = media.map((m, i) => {
    let dur = Math.max(0.6, unit * weights[i]);
    let trim = 0;
    if (m.type === 'video') {
      if (!it.total && !it.perClip) dur = Math.min(m.duration, Math.max(dur, Math.min(m.duration, mood.clipDur * 2.5)));
      dur = Math.min(dur, m.duration);
      trim = Math.max(0, (m.duration - dur) * 0.3);
    }
    return {
      media: state.media.indexOf(m), duration: round2(dur), trim_start: round2(trim),
      caption: it.noCaption ? '' : (it.captions[i] || ''),
      narration: it.narrations[i] || '',
      transition: i === 0 && !hasIntro ? 'none' : mood.trans[i % mood.trans.length],
      motion: m.type === 'video' ? 'none' : mood.motion[i % mood.motion.length],
    };
  });

  const parts = [`${aspect}`, mood.label];
  if (it.total) parts.push(`${it.total}초 목표`);
  return {
    source: 'rule',
    aspect, mood: moodKey, filter: it.filter || mood.filter, font: mood.font,
    title: hasIntro ? { text: it.title, sub: it.sub } : { text: '', sub: '' },
    outro: hasOutro ? { text: outroText || '감사합니다', sub: it.contacts.join('   ') } : { text: '', sub: '' },
    caption_style: { position: 'bottom', color: mood.textColor, box: mood.textBg, animation: mood.anim },
    clips, music: !it.noMusic, music_volume: S.bgmVolume, wants_voice: it.voice,
    summary: `기본 자동편집: ${parts.join(' · ')}`,
  };
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* ------------------------------------------------------------------ 계획 적용 */
/* 글자 화면 아이콘 자동 선택 */
const EMOJI_RULES = [
  [/에코백|가방|백팩|토트/, '👜'], [/친환경|자연|나무|숲|식물|그린|에코/, '🌿'], [/할인|세일|특가|이벤트|쿠폰|%/, '🏷️'],
  [/행사|축제|페스티벌|파티|기념/, '🎉'], [/신상|신제품|출시|런칭|새로/, '✨'], [/문의|전화|연락|상담/, '📞'],
  [/커피|카페|음료/, '☕'], [/음식|맛집|요리|메뉴|식당/, '🍽️'], [/선물|기프트|굿즈|답례/, '🎁'], [/배송|택배|빠른/, '🚚'],
  [/여행|휴가|바다|캠핑/, '🏖️'], [/사랑|감사|고마/, '💚'], [/공부|교육|학교|강의|책|서점/, '📚'], [/운동|헬스|건강/, '💪'],
  [/주문|구매|쇼핑|장바구니/, '🛒'], [/품질|인증|시험|보증|안전/, '✅'], [/기업|회사|비즈니스|단체|대량/, '🏢'], [/아이|어린이|키즈|아기/, '🧸'],
];
const pickEmoji = text => (EMOJI_RULES.find(([re]) => re.test(text || '')) || [null, ''])[1];
const CTA_TEXT = { shorts: '구독하고 다음 영상 보기 👆', reels: '저장하고 팔로우 💚', tiktok: '팔로우하고 다음 편 보기', youtube: '구독·좋아요 부탁드려요' };

function applyPlan(plan) {
  pause();
  const mood = MOODS[plan.mood] || MOODS.clean;
  const font = FONTS.some(f => f.v === plan.font) ? plan.font : mood.font;
  const cs = plan.caption_style || {};
  const capColor = /^#[0-9a-f]{6}$/i.test(cs.color || '') ? cs.color : mood.textColor;
  const capAnim = TEXT_ANIMS.some(a => a.v === cs.animation) ? cs.animation : mood.anim;
  const capPos = ['top', 'center', 'bottom'].includes(cs.position) ? cs.position : 'bottom';
  const capBox = typeof cs.box === 'boolean' ? cs.box : mood.textBg;
  const card = Object.assign({ bgColor: mood.titleBg[0], bgColor2: mood.titleBg[1], bgStyle: mood === MOODS.calm || mood === MOODS.luxury ? 'aurora' : mood === MOODS.energetic ? 'rays' : mood === MOODS.cute ? 'bokeh' : 'aurora', textColor: mood.textColor }, plan.card_style || {});
  const mstyle = Object.assign({ fontSize: null, enhance: null }, plan.media_style || {});

  if (['16:9', '9:16', '1:1', '4:5'].includes(plan.aspect)) S.aspect = plan.aspect;
  S.mood = MOODS[plan.mood] ? plan.mood : 'clean';
  S.filter = FILTERS.some(f => f.v === plan.filter) ? plan.filter : 'none';
  if (plan.music === false) S.bgmId = '';
  else if (!S.bgmId) S.bgmId = state.media.find(m => m.type === 'audio' && m.role !== 'voice')?.id || '';
  if (typeof plan.music_volume === 'number') S.bgmVolume = clamp(plan.music_volume, 0, 1);
  setCanvasSize();
  const portrait = canvas.height > canvas.width;
  const shortForm = S.aspect === '9:16' || S.aspect === '4:5' || S.aspect === '1:1';

  state.clips.forEach(disposeClip);
  const clips = [];
  const textClip = (txt, sub, dur, extra = {}) => newClip('text', Object.assign({
    text: txt, sub: sub || '', font, fontSize: portrait ? 118 : 128, textColor: card.textColor,
    textPos: 'center', textBg: false, textAnim: capAnim === 'type' ? 'type' : (capAnim === 'pop' ? 'pop' : 'up'),
    bgColor: card.bgColor, bgColor2: card.bgColor2, bgStyle: card.bgStyle, duration: dur, transition: 'fade',
    transDur: Math.min(0.8, mood.transDur + 0.2), emoji: pickEmoji(`${txt} ${sub || ''}`),
  }, extra));

  for (const pc of plan.clips || []) {
    const m = pc.media >= 0 ? state.media[pc.media] : null;
    if (!m) { // 사진 없이 글자 장면
      if (!(pc.caption || '').trim()) continue;
      const c = textClip(pc.caption.trim(), (pc.sub || '').trim(), clamp(+pc.duration || mood.clipDur, 0.8, 20), {
        fontSize: portrait ? 104 : 112, emoji: pc.emoji ?? pickEmoji(pc.caption),
        transition: TRANSITIONS.some(x => x.v === pc.transition) ? pc.transition : mood.trans[0], transDur: mood.transDur,
        bgStyle: pc.bg_style || BG_STYLES[2 + (clips.length % 5)].v,
      });
      c.narration = (pc.narration || '').trim();
      clips.push(c);
      continue;
    }
    if (m.type !== 'image' && m.type !== 'video') continue;
    let dur = clamp(+pc.duration || mood.clipDur, 0.4, 120);
    let trim = 0;
    if (m.type === 'video') {
      trim = clamp(+pc.trim_start || 0, 0, Math.max(0, m.duration - 0.5));
      dur = Math.min(dur, m.duration - trim);
    }
    const mismatch = (m.w / m.h) / (canvas.width / canvas.height);
    const fit = mismatch > 1.7 || mismatch < 1 / 1.7 ? 'blur' : 'cover';
    const c = clipFromMedia(m, {
      duration: round2(dur), trimStart: round2(trim), fit,
      motion: MOTIONS.some(x => x.v === pc.motion) ? pc.motion : (m.type === 'video' ? 'none' : 'zoomIn'),
      transition: TRANSITIONS.some(x => x.v === pc.transition) ? pc.transition : mood.trans[0],
      transDur: mood.transDur,
      text: (pc.caption || '').trim(), font, fontSize: mstyle.fontSize || (portrait ? 62 : 58), textColor: capColor, textPos: capPos,
      textBg: capBox, textAnim: capAnim,
      enhance: mstyle.enhance != null ? mstyle.enhance : (Math.max(m.w, m.h) < 1200 ? 0.6 : 0),
    });
    c.narration = (pc.narration || '').trim();
    clips.push(c);
  }
  if (!clips.length) throw new Error('만들 장면이 없습니다. 사진을 넣거나 명령어에 문구를 적어 주세요.');

  // ---- 제목 (훅) ----
  const firstMedia = clips.find(c => c.kind === 'media');
  if (plan.title && plan.title.text) {
    if (S.algo && shortForm && firstMedia && clips[0] === firstMedia && !firstMedia.text) {
      // 숏폼: 따로 제목 화면을 두지 않고 첫 장면 위에 바로 제목 → 0초부터 볼거리 (넘김 방지)
      Object.assign(firstMedia, { text: plan.title.text, textPos: 'top', textAnim: 'pop', fontSize: portrait ? 116 : 96, textBg: false });
    } else {
      const d = S.algo && shortForm ? clamp(+plan.title.duration || 1.2, 0.8, 1.4) : clamp(+plan.title.duration || mood.titleDur, 1, 8);
      clips.unshift(textClip(plan.title.text, plan.title.sub, d));
    }
  }
  // ---- 마무리 ----
  const platform = plan.platform || (S.aspect === '16:9' ? 'youtube' : 'shorts');
  if (plan.outro && plan.outro.text) {
    clips.push(textClip(plan.outro.text, plan.outro.sub, clamp(+plan.outro.duration || Math.max(2.4, mood.titleDur), 1, 8)));
    S.loopEnd = false;
  } else if (S.algo && shortForm) {
    // 행동 유도 + 처음으로 이어지는 반복 재생 (다시 보기 = 완주율·재시청 ↑)
    const last = clips[clips.length - 1];
    if (last.kind === 'media' && !last.text && plan.cta !== false) Object.assign(last, { text: plan.cta || CTA_TEXT[platform] || CTA_TEXT.shorts, textPos: 'center', textAnim: 'pop', textBg: true });
    S.loopEnd = true;
  } else S.loopEnd = false;
  S.progressBar = !!(S.algo && shortForm && plan.progress_bar !== false);
  S.beatPunch = !!(S.algo && (plan.mood === 'energetic' || plan.mood === 'cute'));
  clips[0].transition = 'none';
  state.clips = clips;

  // ---- 음악 박자에 맞추기 ----
  let beatNote = '';
  const bgm = mediaById(S.bgmId);
  S.bgmOffset = 0;
  if (S.beatSync && bgm && bgm.beat && bgm.beat.period > 0.25) {
    const p = bgm.beat.period;
    S.bgmOffset = bgm.beat.offset;
    for (const c of state.clips) {
      let beats = Math.max(1, Math.round(c.duration / p));
      if (beats * p < 0.7) beats = Math.ceil(0.7 / p);
      const m = clipMedia(c);
      const maxLen = m?.type === 'video' ? m.duration - c.trimStart : Infinity;
      while (beats > 1 && beats * p > maxLen) beats--;
      c.duration = round2(Math.min(beats * p, maxLen));
    }
    beatNote = ` · 음악 박자(${bgm.beat.bpm}BPM)에 맞춤`;
  }
  state.selectedId = (state.clips.find(c => c.kind === 'media') || state.clips[0]).id;
  state.time = 0;
  return `${plan.summary || ''} · 장면 ${state.clips.length}개 · ${totalDuration().toFixed(1)}초${beatNote}`;
}

/* ------------------------------------------------------------------ 사진 없이 만들기 (글자·움직이는 배경) */
function planFromScratch(text) {
  const it = parseCommand(text);
  const moodKey = it.mood || 'clean';
  const mood = MOODS[moodKey];
  const aspect = it.aspect || '9:16';
  // 문장 모으기: 자막 → 내레이션 → 명령어 문장
  let lines = it.captions.length ? it.captions.slice() : it.narrations.slice();
  if (!lines.length) {
    lines = it.raw.replace(/["“”'‘’「『」』][^"“”'‘’「『」』]*["“”'‘’「『」』]/g, ' ')
      .split(/[.!?\n]|,\s*(?=[가-힣])/).map(s => s.trim())
      .filter(s => s.length >= 4 && !/^(쇼츠|릴스|틱톡|유튜브|인스타|\d+\s*(초|분))|(신나게|잔잔하게|깔끔하게|고급스럽게|귀엽게|흑백|빈티지|따뜻하게|시원하게)$/.test(s) && !/0\d{1,2}[-.\s]?\d{3,4}/.test(s));
  }
  if (!lines.length && !it.title) throw new Error('사진이 없을 때는 명령어에 영상에 넣을 문구를 적어 주세요.\n예) 쇼츠 15초, \'에코백 신상 출시\', 자막: 튼튼한 황마 / 두 가지 색상 / 대량 주문 환영');
  if (!lines.length) lines = ['지금 바로 만나보세요'];
  const titleDur = 1.8, outroDur = 2.6;
  const hasOutro = it.outro && (it.contacts.length || it.outroText);
  let unit = it.perClip || Math.max(1.8, mood.clipDur * 0.9);
  if (it.total) unit = Math.max(1.2, (it.total - (it.title ? titleDur : 0) - (hasOutro ? outroDur : 0)) / lines.length);
  return {
    source: 'scratch', aspect, mood: moodKey, filter: 'none', font: mood.font,
    title: it.title ? { text: it.title, sub: it.sub, duration: titleDur } : { text: '', sub: '' },
    outro: hasOutro ? { text: it.outroText || (/문의/.test(it.raw) ? '문의' : it.title || '문의'), sub: it.contacts.join('   '), duration: outroDur } : { text: '', sub: '' },
    caption_style: { position: 'center', color: '#ffffff', box: false, animation: mood.anim },
    clips: lines.map((l, i) => ({ media: -1, caption: l, duration: unit, transition: mood.trans[i % mood.trans.length], narration: it.narrations[i] || '' })),
    music: !it.noMusic, music_volume: S.bgmVolume, wants_voice: it.voice, cta: false,
    summary: `사진 없이 만들기: ${aspect} · ${mood.label}`,
  };
}
