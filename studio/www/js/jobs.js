/* 영상뚝딱 — 자동화 연결 (작업 파일 → 영상)
 *
 * 다른 프로그램(예: AI 자동화 수익 창출 플랫폼, 뉴스 사이트)이 "작업 파일(JSON)"을 주면
 * 사람이 화면을 만지지 않아도 영상을 만들어 저장합니다.
 *
 *  1) PC 앱: '🤖 자동화 연결' — 요청 폴더에 *.json 을 넣으면 → 완성 폴더에 .mp4 + 결과 .json
 *  2) 명령줄: node tools/ttuk-make.js 작업.json  (서버·클라우드에서도, 화면 없이)
 *
 * 작업 파일 형식 (모든 칸은 생략 가능, 최소한 title 이나 scenes 하나는 필요):
 * {
 *   "title": "강서구 키즈카페 전국 우수 인증",      // 첫 화면 제목 (훅)
 *   "subtitle": "시정일보 · 11월 14일",            // 제목 아래 작은 글씨
 *   "aspect": "9:16",                              // 9:16 · 16:9 · 1:1 · 4:5
 *   "mood": "clean",                               // clean · energetic · calm · luxury · cute
 *   "scenes": [                                    // 장면 (순서대로)
 *     { "text": "자막 문장", "image": "사진.jpg", "duration": 3.5, "narration": "읽어 줄 문장" }
 *   ],
 *   "outro": "자세한 내용은 시정일보에서",           // 마지막 화면 (없으면 행동 유도 문구)
 *   "music": { "style": "corp", "meter": "4/4", "bpm": 110, "seed": 7 },   // false = 음악 없음
 *   "export": { "quality": 1080, "fps": 30, "vq": "rec", "maxSizeMB": 0, "name": "파일이름" },
 *   "platform": "shorts",                          // shorts · reels · tiktok · youtube (업로드 문구용)
 *   "upload": { "title": "", "description": "", "hashtags": ["강서구", "키즈카페"], "link": "https://…", "source": "시정일보" }
 * }
 * image 는 작업 파일과 같은 폴더의 파일 이름, 절대 경로, 또는 (명령줄 도구에서) https 주소.
 */
'use strict';

const JOB_ASPECTS = ['9:16', '16:9', '1:1', '4:5', '4:3', '21:9'];
const JOB_MOODS = ['clean', 'energetic', 'calm', 'luxury', 'cute'];

/** 작업 파일 검사 · 기본값 채우기. 잘못된 곳은 고칠 수 있으면 고치고, 안 되면 오류 */
function normalizeJob(raw) {
  if (typeof raw === 'string') { try { raw = JSON.parse(raw.replace(/^﻿/, '')); } catch (e) { throw new Error('작업 파일이 올바른 JSON 형식이 아닙니다: ' + e.message); } }
  if (!raw || typeof raw !== 'object') throw new Error('작업 파일 내용이 비어 있습니다.');
  const str = (v, n = 300) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, n);
  const job = {
    title: str(raw.title, 80), subtitle: str(raw.subtitle, 80),
    aspect: JOB_ASPECTS.includes(raw.aspect) ? raw.aspect : '9:16',
    mood: JOB_MOODS.includes(raw.mood) ? raw.mood : 'clean',
    outro: str(raw.outro, 80), outroSub: str(raw.outro_sub || raw.outroSub, 80),
    platform: ['shorts', 'reels', 'tiktok', 'youtube'].includes(raw.platform) ? raw.platform : (raw.aspect === '16:9' ? 'youtube' : 'shorts'),
    scenes: [], music: null, export: {},
    upload: {},
  };
  const up = raw.upload && typeof raw.upload === 'object' ? raw.upload : {};
  job.upload = { title: str(up.title, 100), description: str(up.description, 4000), link: str(up.link, 500), source: str(up.source, 100),
    hashtags: Array.isArray(up.hashtags) ? up.hashtags.map(h => '#' + String(h).replace(/^#/, '').replace(/\s/g, '')).join(' ') : str(up.hashtags, 500) };
  const scenes = Array.isArray(raw.scenes) ? raw.scenes : [];
  for (const s of scenes.slice(0, 60)) {
    if (typeof s === 'string') { if (s.trim()) job.scenes.push({ text: str(s), image: '', duration: 0, narration: '' }); continue; }
    if (!s || typeof s !== 'object') continue;
    const sc = { text: str(s.text || s.caption, 200), image: str(s.image || s.photo || s.video, 2000), duration: clamp(+s.duration || 0, 0, 60), narration: str(s.narration, 400) };
    if (sc.text || sc.image) job.scenes.push(sc);
  }
  if (!job.title && !job.scenes.length) throw new Error('작업 파일에 제목(title)이나 장면(scenes)이 하나도 없습니다.');
  if (raw.music === false) job.music = false;
  else {
    const m = raw.music && typeof raw.music === 'object' ? raw.music : {};
    const style = MUSIC_STYLES.some(s => s.v === m.style) ? m.style : (MOOD_TO_MUSIC[job.mood] || 'corp');
    const st = MUSIC_STYLES.find(s => s.v === style);
    job.music = {
      style, meter: METERS.some(x => x.v === m.meter) ? m.meter : (style === 'cute' ? '2/4' : '4/4'),
      bpm: clamp(+m.bpm || st.bpm, 40, 200), key: clamp(Math.round(+m.key || 0), 0, 11),
      seed: Math.max(1, Math.round(+m.seed || 0)) || 1 + Math.floor(Math.random() * 99998),
      volume: m.volume != null ? clamp(+m.volume, 0, 1) : null, file: str(m.file, 2000),
    };
  }
  const ex = raw.export && typeof raw.export === 'object' ? raw.export : {};
  job.export = {
    quality: [480, 720, 1080, 1440, 2160].includes(+ex.quality) ? +ex.quality : 1080,
    fps: [24, 25, 30, 50, 60].includes(+ex.fps) ? +ex.fps : 30,
    vq: ['low', 'rec', 'high'].includes(ex.vq) ? ex.vq : 'rec',
    maxSizeMB: Math.max(0, +ex.maxSizeMB || 0),
    name: str(ex.name, 80).replace(/[\\/:*?"<>|]+/g, '_').replace(/\.mp4$/i, ''),
  };
  return job;
}

/**
 * 작업으로 프로젝트 짜기 (지금 화면의 프로젝트를 바꿈 — 보존하려면 withIsolatedProject 안에서 부르기)
 * getFile(ref) → File | null : 장면의 image·음악 file 을 실제 파일로 바꿔 주는 함수
 */
async function buildFromJob(job, getFile, onStatus) {
  job = normalizeJob(job);
  onStatus?.('재료 불러오는 중…');
  // 1) 사진·영상 불러오기
  const mediaIdx = [];
  const warn = [];
  for (let i = 0; i < job.scenes.length; i++) {
    const sc = job.scenes[i];
    mediaIdx[i] = -1;
    if (!sc.image) continue;
    let f = null;
    try { f = await getFile(sc.image); } catch (e) { f = null; }
    if (!f) { warn.push(`${i + 1}번 장면 사진을 찾지 못함(${sc.image}) → 글자 장면으로`); continue; }
    const { added } = await loadFiles([f]);
    if (added[0]) mediaIdx[i] = state.media.indexOf(added[0]);
    else warn.push(`${i + 1}번 장면 파일을 열 수 없음(${sc.image}) → 글자 장면으로`);
  }
  // 2) 음악: 파일을 줬으면 그 파일, 아니면 직접 작곡
  S.bgmId = '';
  if (job.music && job.music.file) {
    const f = await getFile(job.music.file).catch(() => null);
    if (f) { const { added } = await loadFiles([f]); if (added[0] && added[0].type === 'audio') S.bgmId = added[0].id; }
    if (!S.bgmId) warn.push(`음악 파일을 찾지 못함(${job.music.file}) → 직접 작곡`);
  }
  // 3) 장면 짜기 (자동 편집 규칙 그대로: 첫 1초 제목, 전환, 박자 맞춤, 자막 안전 영역…)
  S.algo = true;
  const plan = {
    aspect: job.aspect, mood: job.mood, platform: job.platform,
    title: job.title ? { text: job.title, sub: job.subtitle } : null,
    outro: job.outro ? { text: job.outro, sub: job.outroSub } : null,
    clips: job.scenes.map((sc, i) => ({ media: mediaIdx[i], caption: sc.text, narration: sc.narration, duration: sc.duration || undefined, motion: i % 2 ? 'zoomOut' : 'zoomIn' })),
    music: job.music !== false,
  };
  if (!plan.clips.length && plan.title) plan.clips.push({ media: -1, caption: plan.title.text, duration: 3 });
  // 4) 작곡은 장면 길이가 정해진 뒤 (길이 맞춤)
  let summary = applyPlan(plan);
  if (job.music && !S.bgmId) {
    onStatus?.('🎼 배경음악 작곡 중…');
    await addComposedMusic({ ...job.music, seconds: Math.max(8, totalDuration()), drums: true, bass: true, chords: true, melody: true });
    summary += ` · 🎼 ${job.music.meter}박자 ${job.music.bpm}BPM 작곡`;
  }
  if (job.music && job.music.volume != null) S.bgmVolume = job.music.volume;
  if (job.music === false) S.bgmId = '';
  // 5) 내레이션 (Google 키가 있을 때만)
  if (genReady() && FEATURES.voice !== false && state.clips.some(c => (c.narration || '').trim())) {
    onStatus?.('🎙 내레이션 목소리 만드는 중…');
    try { await generateVoices(state.clips, { onStatus }); } catch (e) { warn.push('내레이션 실패: ' + e.message); }
  }
  // 6) 내보내기 설정
  Object.assign(S, { quality: job.export.quality, fps: job.export.fps, vq: job.export.vq, maxSizeMB: job.export.maxSizeMB });
  return { job, summary, warnings: warn };
}

/** 작업 하나 → 완성 영상 + 업로드 문구. 반환 { blob, name, result, qa, copy, warnings, summary } */
async function makeVideoFromJob(job, getFile, { onStatus, onProgress, signal } = {}) {
  const built = await buildFromJob(job, getFile, onStatus);
  const j = built.job;
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const name = j.export.name || `영상뚝딱-자동-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const prod = await produceVideo({ signal: signal || { cancelled: false }, onProgress: onProgress || (() => {}), name });
  // 업로드 문구: 작업 파일이 준 값 우선, 없으면 장면 문장으로 만들기
  let copy = null;
  try {
    const basic = basicCopy(j.platform);
    const lines = [j.title, j.subtitle, ...j.scenes.map(s => s.text)].filter(Boolean);
    copy = {
      title: (j.upload.title || j.title || basic.title).slice(0, 90),
      description: j.upload.description || [lines.join(' · '), j.outro, j.upload.link, j.upload.source ? `출처: ${j.upload.source}` : ''].filter(Boolean).join('\n'),
      hashtags: j.upload.hashtags || basic.hashtags,
    };
  } catch (e) { copy = null; }
  return { ...prod, copy, warnings: built.warnings, summary: built.summary, job: j };
}
/** 결과 파일(JSON) 내용 */
function jobResultJson(out, extra = {}) {
  return JSON.stringify(Object.assign({
    ok: true, app: '영상뚝딱', version: BRAND.version, made_at: new Date().toISOString(),
    file: out.name, size_bytes: out.blob.size, width: out.result.width, height: out.result.height, duration: +totalDuration().toFixed(2),
    codecs: out.result.codecs, qa: out.qa ? { ok: out.qa.ok, checked: out.qa.checked, issues: out.qa.issues } : null,
    summary: out.summary, warnings: out.warnings, upload: out.copy,
  }, extra), null, 2);
}

/* ================================================================ PC 앱: 자동화 연결 폴더 */
const AutoLink = (() => {
  let cfg = { on: false, inbox: '', outbox: '', done: [] };
  let timer = 0, running = false, log = [];
  const load = () => { try { cfg = Object.assign(cfg, JSON.parse(Platform.getPref('autolink') || '{}')); } catch (e) { /* 기본값 */ } };
  const save = () => { Platform.setPref('autolink', JSON.stringify({ ...cfg, done: cfg.done.slice(-500) })); render(); };
  const sep = p => (p.includes('\\') ? '\\' : '/');
  const join = (dir, name) => (/^([a-zA-Z]:[\\/]|\/)/.test(name) ? name : dir.replace(/[\\/]+$/, '') + sep(dir) + name.replace(/^[\\/]+/, ''));

  async function fileFor(dir, ref) {
    if (/^data:/.test(ref)) { const r = await fetch(ref); const b = await r.blob(); return new File([b], 'data.' + (b.type.split('/')[1] || 'bin'), { type: b.type }); }
    if (/^https?:/i.test(ref)) throw new Error('PC 앱 자동화는 인터넷 주소 대신 같은 폴더의 파일을 써 주세요');
    const p = join(dir, ref);
    const r = await window.native.readFile(p);
    return new File([r.data], p.split(/[\\/]/).pop(), { type: r.type });
  }
  async function tick() {
    if (!cfg.on || running || !cfg.inbox || !window.native?.listFolder) return;
    if (state.busy || !$('#busyModal').hidden || state.playing) return;
    const list = (await window.native.listFolder(cfg.inbox)).filter(f => /\.json$/i.test(f.name) && !cfg.done.includes(f.path + '|' + f.mtime)).sort((a, z) => a.mtime - z.mtime);
    if (!list.length) return;
    running = true;
    try { await runFile(list[0]); } finally { running = false; }
  }
  async function runFile(f) {
    const b = busy(`🤖 자동화 요청 처리 중: ${f.name}`, '지금 작업은 그대로 보관됩니다. 끝나면 원래 화면으로 돌아옵니다.');
    const key = f.path + '|' + f.mtime;
    const base = f.name.replace(/\.json$/i, '');
    const outDir = cfg.outbox || cfg.inbox;
    let entry = { time: Date.now(), name: f.name, ok: false, msg: '' };
    try {
      const r = await window.native.readFile(f.path);
      const text = new TextDecoder().decode(r.data);
      const out = await withIsolatedProject(async () => {
        const job = normalizeJob(text);
        if (!job.export.name) job.export.name = base;
        const o = await makeVideoFromJob(job, ref => fileFor(cfg.inbox, ref), { onStatus: t => b.set(null, t), onProgress: ({ pct, text: t }) => b.set(pct, t), signal: b.flag });
        b.set(1, '저장하는 중…');
        const where = await window.native.writeFile(outDir, o.name, new Uint8Array(await o.blob.arrayBuffer()));
        const res = jobResultJson(o, { request: f.name, path: where });
        await window.native.writeFile(outDir, base + '.결과.json', new TextEncoder().encode(res));
        return { where, o };
      });
      entry = { ...entry, ok: true, msg: `${out.o.name} (${(out.o.blob.size / 1e6).toFixed(1)}MB)${out.o.warnings.length ? ' · 참고: ' + out.o.warnings.join(', ') : ''}`, file: out.where };
    } catch (e) {
      entry.msg = e.message || String(e);
      try { await window.native.writeFile(outDir, base + '.결과.json', new TextEncoder().encode(JSON.stringify({ ok: false, request: f.name, error: entry.msg, made_at: new Date().toISOString() }, null, 2))); } catch (e2) { /* 무시 */ }
    } finally { b.close(); }
    cfg.done.push(key);
    log.unshift(entry); log = log.slice(0, 20);
    save(); refreshAll();
    toast(entry.ok ? `🤖 자동화 영상 완성 — ${entry.msg}` : `⚠️ 자동화 요청 실패 (${f.name}): ${entry.msg}`, !entry.ok, 7000);
    try { window.native.notify?.(entry.ok ? '영상뚝딱: 자동화 영상 완성' : '영상뚝딱: 자동화 요청 실패', entry.msg); } catch (e) { /* 무시 */ }
  }
  function render() {
    const box = document.getElementById('autoLinkStatus'); if (!box) return;
    $('#alOn').checked = !!cfg.on;
    $('#alInbox').textContent = cfg.inbox || '(아직 고르지 않음)';
    $('#alOutbox').textContent = cfg.outbox || '(요청 폴더와 같은 곳)';
    box.innerHTML = log.length ? log.map(x => `<div class="${x.ok ? 'ok' : 'err'}">${x.ok ? '✅' : '⚠️'} ${new Date(x.time).toLocaleTimeString('ko-KR')} ${esc(x.name)} — ${esc(x.msg)}</div>`).join('') : '<p class="muted small">아직 처리한 요청이 없습니다.</p>';
  }
  function bind() {
    load();
    const desktop = !!window.native?.listFolder;
    $('#alDesktopOnly').hidden = desktop;
    $('#alInboxBtn').addEventListener('click', async () => { const d = await window.native?.chooseFolder?.('자동화 요청 폴더 (작업 파일 *.json 을 넣을 곳)'); if (d) { cfg.inbox = d; save(); } });
    $('#alOutboxBtn').addEventListener('click', async () => { const d = await window.native?.chooseFolder?.('완성 영상을 저장할 폴더'); if (d) { cfg.outbox = d; save(); } });
    $('#alOn').addEventListener('change', e => {
      if (e.target.checked && !cfg.inbox) { e.target.checked = false; toast('먼저 요청 폴더를 골라 주세요', true); return; }
      cfg.on = e.target.checked; save();
      window.native?.setKeepRunning?.(cfg.on || Scheduler.activeCount() > 0);
      toast(cfg.on ? '🤖 자동화 연결을 켰습니다. 요청 폴더에 작업 파일을 넣으면 영상을 만듭니다.' : '자동화 연결을 껐습니다');
    });
    $('#alSample').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(SAMPLE_JOB, null, 2)], { type: 'application/json' });
      if (window.native?.writeFile && cfg.inbox) window.native.writeFile(cfg.inbox, '예시-작업.json', new TextEncoder().encode(JSON.stringify(SAMPLE_JOB, null, 2))).then(p => toast('요청 폴더에 예시 작업 파일을 넣었습니다: ' + p));
      else Platform.saveVideo(blob, '예시-작업.json');
    });
    $('#alRunFile').addEventListener('click', runPicked);
    render();
    clearInterval(timer);
    timer = setInterval(() => tick().catch(e => console.warn('자동화 연결', e)), 10000);
    if (cfg.on) window.native?.setKeepRunning?.(true);
  }
  /** 작업 파일 하나를 골라서 바로 실행 (웹·휴대폰에서도: 작업 파일 + 사진 함께 고르기) */
  async function runPicked() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true; inp.accept = '.json,image/*,video/*,audio/*';
    inp.onchange = async () => {
      const files = [...inp.files];
      const jf = files.find(f => /\.json$/i.test(f.name));
      if (!jf) { toast('작업 파일(.json)을 함께 골라 주세요 (사진도 같이 고르면 이름으로 찾아 넣습니다)', true); return; }
      const byName = new Map(files.map(f => [f.name, f]));
      const b = busy('🤖 작업 파일로 영상 만드는 중…', jf.name);
      try {
        const job = normalizeJob(await jf.text());
        if (!job.export.name) job.export.name = jf.name.replace(/\.json$/i, '');
        const o = await withIsolatedProject(() => makeVideoFromJob(job, async ref => byName.get(ref.split(/[\\/]/).pop()) || null, { onStatus: t => b.set(null, t), onProgress: ({ pct, text }) => b.set(pct, text), signal: b.flag }));
        b.close();
        const r = await Platform.saveVideo(o.blob, o.name);
        toast(`✅ ${o.name} — ${r.message}${o.warnings.length ? ' · 참고: ' + o.warnings.join(', ') : ''}`, false, 8000);
      } catch (e) { b.close(); if (!b.flag.cancelled) toast('작업 파일 실패: ' + e.message, true, 8000); }
    };
    inp.click();
  }
  return { bind, tick, runFile, config: () => cfg };
})();

const SAMPLE_JOB = {
  title: '강서구 키즈카페 전국 우수 인증',
  subtitle: '11월 14일 · 서울 소식',
  aspect: '9:16', mood: 'clean', platform: 'shorts',
  scenes: [
    { text: '서울형키즈카페 시립화곡점', image: '', duration: 3 },
    { text: '전국 어린이놀이시설 우수 인증', duration: 3 },
    { text: '전국 8만 5천여 곳 중 9곳만 선정', duration: 3.5 },
    { text: '실내 놀이공간·테라스·생태환경 연계', duration: 3.5 },
  ],
  outro: '자세한 소식은 설명란 링크에서',
  music: { style: 'corp', meter: '4/4', bpm: 110, seed: 7 },
  export: { quality: 1080, fps: 30, vq: 'rec' },
};
