/* 영상뚝딱 — 시리즈
 * 마음에 드는 영상 하나의 '컨셉'(비율·분위기·글꼴·자막 모양·색감·전환·속도·제목 형식·마무리·음악·로고)을
 * 템플릿으로 저장해 두고, 새 사진·영상만 넣으면 같은 느낌의 다음 편을 계속 만듭니다.
 *  - 지금 만든 영상 → 템플릿
 *  - 다른 사람의 참고 영상 → 장면 길이·색감·비율을 분석해 템플릿 (Claude 키가 있으면 컨셉까지 분석)
 *  - 한 편씩 / 여러 편 한 번에 / 예약으로 자동
 */
'use strict';

/* ---------- 저장소 (IndexedDB: 음악·로고 파일까지 보관) ---------- */
const SeriesDB = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('ttukttak', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('templates', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction('templates', mode);
      const req = fn(t.objectStore('templates'));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    all: () => tx('readonly', s => s.getAll()).then(a => (a || []).sort((x, y) => y.createdAt - x.createdAt)),
    get: id => tx('readonly', s => s.get(id)),
    put: tpl => tx('readwrite', s => s.put(tpl)),
    del: id => tx('readwrite', s => s.delete(id)),
  };
})();

/** 지금 프로젝트 → 템플릿 */
function templateFromProject(name) {
  const media = state.clips.filter(c => c.kind === 'media');
  const cards = state.clips.filter(c => c.kind === 'text');
  const first = state.clips[0], last = state.clips[state.clips.length - 1];
  const capSrc = media.find(c => (c.text || '').trim()) || media[0] || {};
  const card = cards[0] || {};
  const titleText = first?.kind === 'text' ? first.text : (media[0]?.textPos === 'top' ? media[0].text : '');
  const avg = media.length ? media.reduce((a, c) => a + c.duration, 0) / media.length : 2.5;
  const bgm = mediaById(S.bgmId), logo = mediaById(S.logoId);
  const moodGuess = S.mood || (avg < 1.9 ? 'energetic' : avg > 3.4 ? 'calm' : 'clean');
  return {
    id: uid(), name: name || '새 시리즈', createdAt: Date.now(), source: 'project', episode: 2,
    titlePattern: titleText ? (/\d+\s*편/.test(titleText) ? titleText.replace(/\d+\s*편/, '{n}편') : `${titleText.split('\n')[0]} {n}편`) : '',
    outro: last?.kind === 'text' && last !== first ? { text: last.text, sub: last.sub } : { text: '', sub: '' },
    command: $('#cmdInput')?.value || '',
    style: {
      aspect: S.aspect, quality: S.quality, fps: S.fps, filter: S.filter, mood: moodGuess,
      font: capSrc.font || card.font || FONTS[0].v,
      caption_style: { position: capSrc.textPos || 'bottom', color: capSrc.textColor || '#ffffff', box: capSrc.textBg ?? true, animation: capSrc.textAnim || 'up' },
      card_style: { bgColor: card.bgColor || '#2f4332', bgColor2: card.bgColor2 || '', bgStyle: card.bgStyle || 'aurora', textColor: card.textColor || '#ffffff' },
      media_style: { fontSize: capSrc.fontSize || null, enhance: media.some(c => c.enhance) ? Math.max(...media.map(c => c.enhance)) : null },
      transitions: media.map(c => c.transition).filter(t => t && t !== 'none'),
      motions: media.filter(c => !isVideoClip(c)).map(c => c.motion),
      clipDur: round2(avg), perEpisode: Math.max(1, media.length),
      algo: S.algo, beatSync: S.beatSync, bgmVolume: S.bgmVolume, logoPos: S.logoPos, logoSize: S.logoSize,
      cta: last?.kind === 'media' ? last.text : '',
    },
    bgm: bgm ? bgm.file : null, bgmName: bgm?.name || '',
    logo: logo ? logo.file : null, logoName: logo?.name || '',
  };
}

/* ---------- 참고 영상 분석 ---------- */
async function analyzeReference(file, onProgress, signal) {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.src = url;
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('참고 영상을 열 수 없습니다.')); setTimeout(() => rej(new Error('참고 영상을 여는 데 시간이 너무 걸립니다.')), 20000); });
  const dur = isFinite(v.duration) ? v.duration : 30;
  const W = v.videoWidth, H = v.videoHeight;
  const len = Math.min(dur, 90), step = 0.2;
  const c = document.createElement('canvas'); c.width = 48; c.height = Math.max(8, Math.round(48 * H / W));
  const g = c.getContext('2d', { willReadFrequently: true });
  const frames = [];
  const snap = document.createElement('canvas'); snap.width = 384; snap.height = Math.round(384 * H / W);
  let prevHist = null, cuts = [0], sumL = 0, sumS = 0, warm = 0, n = 0;
  for (let t = 0; t < len; t += step) {
    if (signal?.cancelled) throw new ExportCancelled();
    await seekExact(v, t);
    g.drawImage(v, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const hist = new Float32Array(48);
    for (let k = 0; k < d.length; k += 4) {
      const r = d[k], gg = d[k + 1], b = d[k + 2];
      const l = 0.299 * r + 0.587 * gg + 0.114 * b;
      hist[Math.min(15, l >> 4)]++; hist[16 + Math.min(15, r >> 4)]++; hist[32 + Math.min(15, b >> 4)]++;
      sumL += l; sumS += Math.max(r, gg, b) - Math.min(r, gg, b); warm += r - b; n++;
    }
    if (prevHist) {
      let diff = 0, tot = 0;
      for (let k = 0; k < 48; k++) { diff += Math.abs(hist[k] - prevHist[k]); tot += hist[k]; }
      if (diff / tot > 0.55 && t - cuts[cuts.length - 1] > 0.35) cuts.push(t);
    }
    prevHist = hist;
    if (frames.length < 8 && (frames.length === 0 || t - frames[frames.length - 1].t >= len / 8)) {
      snap.getContext('2d').drawImage(v, 0, 0, snap.width, snap.height);
      frames.push({ t, data: snap.toDataURL('image/jpeg', 0.7).split(',')[1] });
    }
    onProgress?.(t / len);
  }
  URL.revokeObjectURL(url); v.removeAttribute('src'); v.load();
  const shots = cuts.length;
  const avgShot = len / Math.max(1, shots);
  const lum = sumL / n, sat = sumS / n, warmth = warm / n;
  const ratio = W / H;
  const aspect = ratio < 0.7 ? '9:16' : ratio < 0.9 ? '4:5' : ratio < 1.2 ? '1:1' : '16:9';
  const filter = sat < 12 ? 'bw' : warmth > 25 && sat < 60 ? 'film' : warmth > 18 ? 'warm' : warmth < -12 ? 'cool' : sat > 85 ? 'vivid' : lum > 165 ? 'soft' : 'none';
  const mood = avgShot < 1.6 ? 'energetic' : avgShot > 3.6 ? 'calm' : sat < 40 && lum < 110 ? 'luxury' : 'clean';
  return { duration: dur, width: W, height: H, aspect, shots, avgShot: round2(avgShot), lum, sat, warmth, filter, mood, frames };
}

const TEMPLATE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['concept', 'mood', 'font', 'filter', 'caption_position', 'caption_color', 'caption_box', 'caption_animation', 'card_bg1', 'card_bg2', 'card_bg_style', 'title_pattern', 'cta', 'command'],
  properties: {
    concept: { type: 'string' },
    mood: enumOf(Object.keys(MOODS)),
    font: enumOf(FONTS.map(f => f.v)),
    filter: enumOf(FILTERS.map(f => f.v)),
    caption_position: enumOf(['top', 'center', 'bottom']),
    caption_color: { type: 'string' },
    caption_box: { type: 'boolean' },
    caption_animation: enumOf(TEXT_ANIMS.map(a => a.v)),
    card_bg1: { type: 'string' }, card_bg2: { type: 'string' },
    card_bg_style: enumOf(BG_STYLES.map(b => b.v)),
    title_pattern: { type: 'string' },
    cta: { type: 'string' },
    command: { type: 'string' },
  },
};
async function templateFromReference(file, name, onProgress, signal) {
  const a = await analyzeReference(file, p => onProgress({ pct: p * 0.8, text: '참고 영상 장면을 분석하는 중…' }), signal);
  const mood = MOODS[a.mood];
  const tpl = {
    id: uid(), name: name || file.name.replace(/\.[^.]+$/, ''), createdAt: Date.now(), source: 'reference', episode: 1,
    titlePattern: '', outro: { text: '', sub: '' }, command: '',
    concept: `참고 영상 분석: ${a.aspect}, 약 ${a.duration.toFixed(0)}초, 장면 ${a.shots}개(평균 ${a.avgShot}초), ${MOODS[a.mood].label}, 색감 ${FILTERS.find(f => f.v === a.filter).label}`,
    style: {
      aspect: a.aspect, quality: 1080, fps: 30, filter: a.filter, mood: a.mood, font: mood.font,
      caption_style: { position: 'bottom', color: mood.textColor, box: mood.textBg, animation: mood.anim },
      card_style: { bgColor: mood.titleBg[0], bgColor2: mood.titleBg[1], bgStyle: 'aurora', textColor: mood.textColor },
      media_style: { fontSize: null, enhance: null },
      transitions: mood.trans, motions: mood.motion, clipDur: clamp(a.avgShot, 0.8, 6), perEpisode: clamp(Math.round(Math.min(a.duration, 60) / Math.max(0.8, a.avgShot)), 3, 20),
      algo: true, beatSync: true, bgmVolume: 0.7, logoPos: 'tr', logoSize: 0.16, cta: '',
    },
    bgm: null, bgmName: '', logo: null, logoName: '',
  };
  if (aiReady()) {
    onProgress({ pct: 0.85, text: '✨ AI가 참고 영상의 컨셉을 읽는 중…' });
    try {
      const res = await aiClient().messages.create({
        model: AI.model, max_tokens: 4000,
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: TEMPLATE_SCHEMA } },
        system: '당신은 숏폼 영상 컨셉 분석가입니다. 참고 영상의 장면들(시간 순서)과 측정값을 보고, 같은 느낌의 시리즈를 계속 만들 수 있도록 스타일을 정리합니다. 색은 #rrggbb. title_pattern 은 편 번호 자리에 {n} 을 넣은 한국어 제목 형식(예: "오늘의 신상 {n}편"), 필요 없으면 빈 문자열. command 는 새 편을 만들 때 쓸 한국어 명령어(분위기·길이·비율 포함). concept 은 컨셉 설명 2문장.',
        messages: [{ role: 'user', content: [
          ...a.frames.flatMap(f => [{ type: 'text', text: `${f.t.toFixed(1)}초 장면` }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.data } }]),
          { type: 'text', text: `측정값: 비율 ${a.aspect}, 길이 ${a.duration.toFixed(1)}초, 장면 수 ${a.shots}, 평균 장면 길이 ${a.avgShot}초, 평균 밝기 ${a.lum.toFixed(0)}/255, 채도 ${a.sat.toFixed(0)}` },
        ] }],
      }, { signal: signal?.abortSignal });
      if (res.stop_reason !== 'refusal') {
        const r = JSON.parse(res.content.filter(b => b.type === 'text').map(b => b.text).join(''));
        const hex = x => (/^#[0-9a-f]{6}$/i.test(x) ? x : null);
        Object.assign(tpl.style, { mood: r.mood, font: r.font, filter: r.filter });
        tpl.style.caption_style = { position: r.caption_position, color: hex(r.caption_color) || '#ffffff', box: r.caption_box, animation: r.caption_animation };
        tpl.style.card_style = { bgColor: hex(r.card_bg1) || tpl.style.card_style.bgColor, bgColor2: hex(r.card_bg2) || '', bgStyle: r.card_bg_style, textColor: '#ffffff' };
        tpl.titlePattern = r.title_pattern || '';
        tpl.style.cta = r.cta || '';
        tpl.command = r.command || '';
        tpl.concept = r.concept + ' / ' + tpl.concept;
      }
    } catch (e) { console.warn('AI 컨셉 분석 실패, 측정값만 사용', e); }
  }
  return tpl;
}

/* ---------- 템플릿으로 한 편 만들기 ---------- */
async function applyTemplateAssets(tpl) {
  const st = tpl.style;
  Object.assign(S, { aspect: st.aspect, quality: st.quality || S.quality, fps: st.fps || S.fps, algo: st.algo ?? true, beatSync: st.beatSync ?? true, bgmVolume: st.bgmVolume ?? S.bgmVolume, logoPos: st.logoPos || S.logoPos, logoSize: st.logoSize || S.logoSize });
  if (tpl.bgm && !state.media.some(m => m.type === 'audio' && m.name === tpl.bgmName)) {
    const { added } = await loadFiles([new File([tpl.bgm], tpl.bgmName || '시리즈음악.mp3', { type: tpl.bgm.type })]);
    if (added[0]) S.bgmId = added[0].id;
  } else if (tpl.bgmName) S.bgmId = state.media.find(m => m.type === 'audio' && m.name === tpl.bgmName)?.id || S.bgmId;
  if (tpl.logo && !state.media.some(m => m.type === 'image' && m.name === tpl.logoName)) {
    const { added } = await loadFiles([new File([tpl.logo], tpl.logoName || '로고.png', { type: tpl.logo.type })]);
    if (added[0]) S.logoId = added[0].id;
  } else if (tpl.logoName) S.logoId = state.media.find(m => m.type === 'image' && m.name === tpl.logoName)?.id || S.logoId;
}
/** mediaList: 이번 편에 쓸 미디어 (없으면 글자 장면) → plan */
async function episodePlan(tpl, mediaList, n, signal) {
  const st = tpl.style;
  const title = tpl.titlePattern ? tpl.titlePattern.replace(/\{n\}/g, n) : '';
  let plan = null;
  const visual = mediaList.filter(m => m.type === 'image' || m.type === 'video');
  if (visual.length && aiReady()) {
    // 새 사진에 맞는 자막은 AI 가 쓰고, 모양은 템플릿 그대로
    try {
      const cmd = `${tpl.command || ''}\n시리즈 "${tpl.name}" ${n}편입니다. 이전 편과 같은 말투·형식으로, 새 사진 내용에 맞게 자막을 써 주세요.${title ? ` 제목은 "${title}".` : ''}`;
      plan = await planWithAI(cmd, signal);
      plan.clips = plan.clips.filter(c => visual.includes(state.media[c.media]));
    } catch (e) { console.warn('AI 편집 실패 — 템플릿 기본 구성 사용', e); plan = null; }
  }
  if (!plan || !plan.clips.length) {
    const trans = st.transitions && st.transitions.length ? st.transitions : ['fade'];
    const motions = st.motions && st.motions.length ? st.motions : ['zoomIn'];
    plan = {
      clips: visual.map((m, i) => ({
        media: state.media.indexOf(m), duration: m.type === 'video' ? Math.min(m.duration, Math.max(st.clipDur * 1.6, 2)) : st.clipDur,
        trim_start: m.type === 'video' ? Math.max(0, (m.duration - st.clipDur * 1.6) * 0.3) : 0,
        caption: '', narration: '', transition: trans[i % trans.length], motion: m.type === 'video' ? 'none' : motions[i % motions.length],
      })),
      summary: '',
    };
    if (!visual.length) {
      const sc = planFromScratch(tpl.command || title || tpl.name);
      plan.clips = sc.clips;
    }
  }
  return Object.assign(plan, {
    aspect: st.aspect, mood: st.mood, filter: st.filter, font: st.font,
    caption_style: st.caption_style, card_style: st.card_style, media_style: st.media_style,
    title: title ? { text: title, sub: '', duration: 1.2 } : { text: '', sub: '' },
    outro: tpl.outro && tpl.outro.text ? { ...tpl.outro } : { text: '', sub: '' },
    cta: st.cta || undefined,
    summary: `📺 ${tpl.name} ${n}편`,
  });
}
