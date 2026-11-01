/* 영상뚝딱 — 전체 자동 검증
 * 사용: cd studio && npm run vendor && node tests/run-all.js   (ffmpeg, playwright 필요)
 * 결과: tests/report/report.json, tests/report/report.html
 *
 * 범위
 *  - 정적 검사: JS 문법, 화면 요소(id) 연결, 기능 끄기
 *  - PC 화면(1440×900)과 휴대폰 화면(Pixel 7 흉내: 412×915, 터치) 각각에서 기능 전체
 *  - 만든 동영상 파일을 ffprobe/ffmpeg 로 다시 검사 (코덱·길이·해상도·소리·검은 화면)
 *  - AI 기능: Claude / Google API 와 똑같은 형식의 '모의 응답'으로 요청·응답 처리·오류 메시지 검사
 *  - 데스크톱 앱(Electron): 한국어 메뉴, 키 저장, 폴더 예약, 저장
 *  - 윈도우 설치 파일 내용
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync, spawnSync } = require('child_process');
const PW = (() => { try { return require('playwright'); } catch (e) { return require(path.join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')); } })();
const { chromium, devices, _electron } = PW;

const ROOT = path.resolve(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const FX = path.join(__dirname, '.fixtures');
const OUT = path.join(__dirname, 'report');
const IMGS = path.resolve(ROOT, '..', 'imgs');
fs.mkdirSync(FX, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------------ 결과 기록 */
const results = [];
let group = '';
async function test(name, fn) {
  const t0 = Date.now();
  let ok = false, detail = '';
  try { detail = (await fn()) || ''; ok = true; } catch (e) { detail = (e && e.message) || String(e); }
  const r = { group, name, ok, detail: String(detail).slice(0, 600), ms: Date.now() - t0 };
  results.push(r);
  console.log(`${ok ? '✅' : '❌'} [${group}] ${name} (${(r.ms / 1000).toFixed(1)}s)${detail ? ' — ' + r.detail.slice(0, 200) : ''}`);
  return ok;
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

/* ------------------------------------------------------------------ 시험 재료 */
function ff(args) { const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]); if (r.status) throw new Error('ffmpeg: ' + r.stderr); }
function fixtures() {
  const f = n => path.join(FX, n);
  if (!fs.existsSync(f('clip.mp4'))) ff(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=330', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', f('clip.mp4')]);
  if (!fs.existsSync(f('big.mp4'))) ff(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=500', '-t', '6', '-c:v', 'libx264', '-b:v', '12M', '-pix_fmt', 'yuv420p', '-c:a', 'aac', f('big.mp4')]);
  if (!fs.existsSync(f('rot_src.mp4'))) ff(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', f('rot_src.mp4')]);
  if (!fs.existsSync(f('rotated.mp4'))) ff(['-display_rotation', '90', '-i', f('rot_src.mp4'), '-c', 'copy', f('rotated.mp4')]);
  if (!fs.existsSync(f('clip.webm'))) ff(['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '3', '-c:v', 'libvpx', '-c:a', 'libopus', f('clip.webm')]);
  if (!fs.existsSync(f('beat.mp3'))) ff(['-f', 'lavfi', '-i', "aevalsrc='0.8*exp(-30*mod(t,0.5))*sin(2*PI*80*t)+0.2*sin(2*PI*440*t)':s=44100", '-t', '12', f('beat.mp3')]);
  if (!fs.existsSync(f('voice.wav'))) ff(['-f', 'lavfi', '-i', "aevalsrc='0.6*sin(2*PI*140*t)*(0.5+0.5*sin(2*PI*3*t))':s=24000", '-t', '3', f('voice.wav')]);
  if (!fs.existsSync(f('small.jpg'))) ff(['-i', path.join(IMGS, 'product-1color.jpg'), '-vf', 'scale=200:-1', f('small.jpg')]);
  if (!fs.existsSync(f('huge.jpg'))) ff(['-f', 'lavfi', '-i', 'testsrc2=size=6000x4000', '-frames:v', '1', f('huge.jpg')]);
  fs.writeFileSync(f('broken.mp4'), Buffer.from('this is not a video'));
  fs.writeFileSync(f('photo.heic'), Buffer.from('fake heic'));
  fs.writeFileSync(f('test.srt'), '1\n00:00:00,500 --> 00:00:02,200\n안녕하세요 *영상뚝딱* 입니다\n\n2\n00:00:02,400 --> 00:00:04,000\n두 번째 자막\n');
  return f;
}

/* ------------------------------------------------------------------ 동영상 파일 검사 (ffprobe) */
function probe(file) {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]).toString());
  const v = j.streams.find(s => s.codec_type === 'video'), a = j.streams.find(s => s.codec_type === 'audio');
  return { vcodec: v && v.codec_name, w: v && v.width, h: v && v.height, acodec: a && a.codec_name, duration: +j.format.duration, size: +j.format.size };
}
function blackSegments(file) {
  const r = spawnSync('ffmpeg', ['-i', file, '-vf', 'blackdetect=d=0.25:pix_th=0.08', '-an', '-f', 'null', '-']);
  return (r.stderr.toString().match(/black_start:[\d.]+ black_end:[\d.]+/g) || []);
}
function decodeErrors(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-']);
  return r.stderr.toString().trim();
}

/* ------------------------------------------------------------------ 정적 파일 서버 */
function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };
  const srv = http.createServer((req, res) => {
    const p = path.normalize(path.join(WWW, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!p.startsWith(WWW) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise(r => srv.listen(0, () => r({ srv, url: `http://localhost:${srv.address().port}/index.html` })));
}

/* ------------------------------------------------------------------ AI 모의 응답 (실제 API 와 같은 형식) */
function installMocks(page, F, rec) {
  const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  const json = (route, obj, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(obj) });
  const preflight = route => route.request().method() === 'OPTIONS' && (route.fulfill({ status: 204, headers: CORS }), true);
  const msg = text => ({ id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } });
  page.route('https://api.anthropic.com/v1/models/**', route => {
    if (preflight(route)) return;
    rec.anthropic.push({ url: route.request().url(), headers: route.request().headers() });
    if (rec.failAnthropic) return json(route, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401);
    return json(route, { type: 'model', id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-01-01T00:00:00Z' });
  });
  page.route('https://api.anthropic.com/v1/messages**', route => {
    if (preflight(route)) return;
    const body = JSON.parse(route.request().postData() || '{}');
    rec.anthropic.push({ url: route.request().url(), headers: route.request().headers(), body });
    if (rec.failAnthropic) return json(route, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401);
    const props = body.output_config?.format?.schema?.properties || {};
    const content = body.messages?.[0]?.content;
    if (props.clips) { // 사진 보고 편집 계획
      const idx = (Array.isArray(content) ? content : []).filter(b => b.type === 'text').map(b => (b.text.match(/^\[(\d+)\]/) || [])[1]).filter(x => x != null).map(Number);
      return json(route, msg(JSON.stringify({
        aspect: '9:16', mood: 'energetic', filter: 'vivid', font: "'Black Han Sans'",
        title: { text: 'AI 제목', sub: '', duration: 1.2 }, outro: { text: '문의', sub: '010-0000-0000', duration: 2 },
        caption_style: { position: 'bottom', color: '#ffffff', box: true, animation: 'pop' },
        clips: idx.map((i, k) => ({ media: i, duration: 2, trim_start: 0, caption: `AI 자막 ${k + 1}`, narration: k === 0 ? '첫 장면 내레이션입니다' : '', transition: k ? 'slide' : 'none', motion: 'zoomIn' })),
        music: true, music_volume: 0.6, summary: '모의 AI 편집',
      })));
    }
    if (props.scenes) return json(route, msg(JSON.stringify({
      aspect: '9:16', mood: 'clean', font: "'Noto Sans KR'", title: { text: 'AI 기획 제목', sub: '', duration: 1.2 }, outro: { text: '감사합니다', sub: '', duration: 2 },
      scenes: [{ caption: '첫 장면', narration: '', image_prompt: 'a jute eco bag on a wooden table', emoji: '🌿', duration: 2, transition: 'none' },
        { caption: '둘째 장면', narration: '', image_prompt: 'a smiling woman in her 20s holding an eco bag', emoji: '', duration: 2, transition: 'fade' }],
      summary: '모의 기획',
    })));
    if (props.hashtags) return json(route, msg(JSON.stringify({ title: 'AI 업로드 제목', description: '설명 첫 줄', hashtags: '#에코백 #친환경 #Shorts', thumbnail_text: '신상 출시', tips: '저녁 8시에 올리세요' })));
    if (props.concept) return json(route, msg(JSON.stringify({ concept: '밝고 빠른 제품 소개', mood: 'energetic', font: "'Jua'", filter: 'vivid', caption_position: 'bottom', caption_color: '#ffffff', caption_box: true, caption_animation: 'pop', card_bg1: '#ff4f7b', card_bg2: '#6b4dff', card_bg_style: 'rays', title_pattern: '신상 소개 {n}편', cta: '팔로우!', command: '쇼츠 15초 신나게' })));
    return json(route, msg('a translated prompt ||| place ||| outfit'));
  });
  const G = 'https://generativelanguage.googleapis.com/v1beta/';
  const jpg = fs.readFileSync(path.join(IMGS, 'product-2color.jpg')).toString('base64');
  const pcm = (() => { const sr = 24000, n = sr * 1.5, b = Buffer.alloc(n * 2); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 160 * i / sr) * 12000 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * i / sr))), i * 2); return b.toString('base64'); })();
  page.route(G + '**', route => {
    if (preflight(route)) return;
    const url = route.request().url();
    const body = route.request().postData() ? JSON.parse(route.request().postData()) : null;
    rec.google.push({ url, headers: route.request().headers(), body });
    if (rec.failGoogle) return json(route, { error: { code: 400, message: 'API key not valid.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } }, 400);
    if (/\/models\?/.test(url)) return json(route, { models: [
      { name: 'models/imagen-4.0-generate-001', supportedGenerationMethods: ['predict'] },
      { name: 'models/veo-3.0-generate-001', supportedGenerationMethods: ['predictLongRunning'] },
      { name: 'models/gemini-2.5-flash-preview-tts', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
    ] });
    if (/:predict$/.test(url)) return json(route, { predictions: Array.from({ length: body.parameters.sampleCount || 1 }, () => ({ bytesBase64Encoded: jpg, mimeType: 'image/jpeg' })) });
    if (/:predictLongRunning$/.test(url)) return json(route, { name: 'operations/test-op', done: false });
    if (/operations\/test-op/.test(url)) return json(route, { name: 'operations/test-op', done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: G + 'files/test:download?alt=media' } }] } } });
    if (/files\/test:download/.test(url)) return route.fulfill({ status: 200, contentType: 'video/mp4', headers: CORS, body: fs.readFileSync(F('clip.mp4')) });
    if (/:generateContent$/.test(url)) {
      if (body.generationConfig?.responseModalities) return json(route, { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm } }] } }] });
      return json(route, { candidates: [{ content: { parts: [{ text: JSON.stringify([{ start: 0.2, end: 1.6, text: '받아쓴 첫 자막' }, { start: 1.8, end: 3.2, text: '받아쓴 둘째 자막' }]) }] } }] });
    }
    return json(route, { error: { code: 404, message: 'not mocked' } }, 404);
  });
}

/* ------------------------------------------------------------------ 브라우저 쪽 도우미 */
async function openApp(browser, url, opts) {
  const ctx = await browser.newContext(Object.assign({ acceptDownloads: true }, opts));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept(d.defaultValue()));
  await page.goto(url);
  await page.waitForFunction(() => window.__ttuk && document.fonts.status === 'loaded', null, { timeout: 30000 });
  return { ctx, page, errs };
}
const stop = page => page.evaluate(() => { if (window.__ttuk.state.playing) pause(); });
async function importFiles(page, files) {
  const before = await page.evaluate(() => window.__ttuk.state.media.length);
  await page.setInputFiles('#fileInput', files);
  await page.waitForFunction(n => window.__ttuk.state.media.length > n || document.querySelector('#toast').classList.contains('err'), before, { timeout: 60000 });
  await page.waitForTimeout(300);
}
/** 화면 버튼으로 저장까지 → 파일로 받아 ffprobe 검사 */
async function exportViaUI(page, file) {
  await stop(page);
  await page.click('#exportBtn');
  await page.waitForSelector('#resultSaveBtn:not([hidden])', { timeout: 300000 });
  const title = await page.textContent('#busyTitle'), note = await page.textContent('#busyNote');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#resultSaveBtn')]);
  await dl.saveAs(file);
  await page.click('#busyCancel');
  return { title, note };
}
function checkVideo(file, expect) {
  const p = probe(file);
  assert(p.vcodec === 'h264', `영상 코덱이 H.264 가 아님: ${p.vcodec}`);
  if (expect.w) assert(p.w === expect.w && p.h === expect.h, `해상도 ${p.w}×${p.h} ≠ ${expect.w}×${expect.h}`);
  if (expect.duration) assert(Math.abs(p.duration - expect.duration) < 0.25, `길이 ${p.duration.toFixed(2)}초 ≠ 예상 ${expect.duration.toFixed(2)}초`);
  if (expect.audio) assert(!!p.acodec, '소리 트랙 없음');
  const black = blackSegments(file);
  assert(!black.length, `검은 화면 구간 발견: ${black.join(', ')}`);
  const dec = decodeErrors(file);
  assert(!dec, `디코딩 오류: ${dec.slice(0, 200)}`);
  return `${p.vcodec}${p.acodec ? '+' + p.acodec : ''} ${p.w}×${p.h} ${p.duration.toFixed(2)}초 ${(p.size / 1e6).toFixed(1)}MB, 검은 화면 0, 디코딩 오류 0`;
}

/* ------------------------------------------------------------------ 기능 시험 (PC·휴대폰 공통) */
async function functionalSuite(browser, url, F, label, opts) {
  group = label;
  const mobile = !!opts.isMobile;
  const { ctx, page, errs } = await openApp(browser, url, opts);
  const rec = { anthropic: [], google: [] };
  installMocks(page, F, rec);
  const tag = mobile ? 'm' : 'd';
  const out = n => path.join(OUT, `${tag}-${n}`);

  await test('앱 열기 · 글꼴 · 첫 화면', async () => {
    const t = await page.title();
    assert(/영상뚝딱/.test(t), '제목 없음');
    assert(await page.isVisible('#stageEmpty'), '사용법 안내가 안 보임');
    assert(await page.isVisible('#autoBtn'), '자동 만들기 버튼이 안 보임');
    return t;
  });

  if (mobile) {
    await test('휴대폰: 가로 넘침 없음', async () => {
      const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
      assert(r.sw <= r.iw + 1, `화면이 옆으로 넘침 ${r.sw} > ${r.iw}`);
      return `${r.sw}px ≤ ${r.iw}px`;
    });
    await test('휴대폰: 아래 탭 전환 (미디어·장면·자막·설정)', async () => {
      for (const [m, sel] of [['clip', '#clipTab'], ['subs', '#subsTab'], ['project', '#projectTab'], ['library', '#libraryPanel']]) {
        await page.tap(`#mobileTabs [data-m="${m}"]`);
        await page.waitForTimeout(150);
        assert(await page.isVisible(sel), `${m} 탭을 눌러도 ${sel} 가 안 보임`);
      }
      return '4개 탭 정상';
    });
    await test('휴대폰: 버튼 크기 (터치하기 충분)', async () => {
      const small = await page.evaluate(() => [...document.querySelectorAll('.topbar button, .steps button, #autoBtn, .transport button')].filter(b => b.offsetParent).map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim().slice(0, 10), h: r.height, w: r.width }; }).filter(x => x.h < 28 || x.w < 28));
      assert(!small.length, '너무 작은 버튼: ' + JSON.stringify(small));
      return '모든 주요 버튼 28px 이상';
    });
  }

  await test('잘못된 파일 거부 (HEIC·깨진 영상) + 안내 문구', async () => {
    await page.setInputFiles('#fileInput', [F('photo.heic'), F('broken.mp4')]);
    await page.waitForFunction(() => document.querySelector('#toast').classList.contains('err'), null, { timeout: 30000 });
    const t = await page.textContent('#toast');
    assert(/HEIC/.test(t) && /broken\.mp4/.test(t), '안내 문구 부족: ' + t);
    assert((await page.evaluate(() => window.__ttuk.state.media.length)) === 0, '잘못된 파일이 들어감');
    return t.slice(0, 120);
  });

  await test('사진·영상·음악·로고·초대형 사진 가져오기', async () => {
    await importFiles(page, [path.join(IMGS, 'product-1color.jpg'), path.join(IMGS, 'product-2color.jpg'), F('small.jpg'), F('clip.mp4'), F('beat.mp3'), path.join(IMGS, 'logo.png'), F('huge.jpg')]);
    await page.waitForFunction(() => window.__ttuk.state.media.length === 7, null, { timeout: 60000 });
    const r = await page.evaluate(() => { const s = window.__ttuk.state; const huge = s.media.find(m => m.name === 'huge.jpg'); return { types: s.media.map(m => m.type).join(','), bpm: s.media.find(m => m.beat)?.beat.bpm, logo: !!s.settings.logoId, bgm: !!s.settings.bgmId, hugeW: huge.w }; });
    assert(r.bpm >= 115 && r.bpm <= 125, `박자 분석 오류 ${r.bpm}BPM (정답 120)`);
    assert(r.logo && r.bgm, '로고·배경음악 자동 지정 안 됨');
    assert(r.hugeW === 4096, `큰 사진 줄이기 실패 ${r.hugeW}`);
    return `${r.types} · ${r.bpm}BPM · 6000px→${r.hugeW}px`;
  });

  await test('명령어 자동 편집 (쇼츠·알고리즘 최적화)', async () => {
    await page.fill('#cmdInput', "쇼츠 15초 신나게, 제목은 '에코백 신상', 자막: 튼튼한 황마 / 두 가지 색상, 마지막에 010-1234-5678");
    await page.click('#autoBtn');
    await page.waitForTimeout(1500);
    await stop(page);
    const r = await page.evaluate(() => { const s = window.__ttuk.state; return { aspect: s.settings.aspect, n: s.clips.length, total: s.clips.reduce((a, c) => a + c.duration, 0), bar: s.settings.progressBar, caps: s.clips.map(c => c.text).filter(Boolean), last: s.clips[s.clips.length - 1] }; });
    assert(r.aspect === '9:16', '비율 ' + r.aspect);
    assert(r.total > 12 && r.total < 19, '길이 ' + r.total);
    assert(r.caps.includes('튼튼한 황마') && r.caps.includes('두 가지 색상'), '자막 누락: ' + r.caps);
    assert(r.last.kind === 'text' && /010-1234-5678/.test(r.last.sub), '마지막 연락처 화면 없음');
    assert(r.bar, '진행 막대 꺼짐');
    return `장면 ${r.n}개 · ${r.total.toFixed(1)}초`;
  });

  await test('장면 편집 · 실행 취소 · 다시 실행', async () => {
    if (mobile) await page.tap('#mobileTabs [data-m="clip"]');
    await page.click('#track .clip >> nth=1');
    await page.fill('#clipTab textarea[data-k="text"]', '고친 자막');
    await page.waitForTimeout(700);
    const a = await page.evaluate(() => window.__ttuk.state.clips[1].text);
    const n0 = await page.evaluate(() => window.__ttuk.state.clips.length);
    await page.click('#track .clip >> nth=1');
    await page.evaluate(() => removeClip(window.__ttuk.state.selectedId));
    const n1 = await page.evaluate(() => window.__ttuk.state.clips.length);
    await page.evaluate(() => { ACTIONS.undo(); });
    const n2 = await page.evaluate(() => window.__ttuk.state.clips.length);
    await page.evaluate(() => { ACTIONS.redo(); ACTIONS.undo(); });
    const n3 = await page.evaluate(() => window.__ttuk.state.clips.length);
    assert(a === '고친 자막', '자막 수정 안 됨');
    assert(n1 === n0 - 1 && n2 === n0 && n3 === n0, `실행 취소 오류 ${n0}→${n1}→${n2}→${n3}`);
    return `수정 OK, 삭제 ${n0}→${n1}, 취소 ${n2}, 다시·취소 ${n3}`;
  });

  await test('목소리 톤 (음역·계이름) 정확도', async () => {
    await importFiles(page, [F('voice.wav')]);
    const r = await page.evaluate(() => {
      const m = window.__ttuk.state.media.find(x => x.name === 'voice.wav');
      const f0 = detectPitch(m.buffer);
      const up = pitchShift(m.buffer, 7), dn = pitchShift(m.buffer, -5);
      const bass = pitchShift(m.buffer, semitonesFor(m.buffer, { mode: 'range', range: 'bass' }));
      const sol = pitchShift(m.buffer, semitonesFor(m.buffer, { mode: 'note', note: 'sol', octave: 3 }));
      return { f0, up: detectPitch(up), dn: detectPitch(dn), bass: detectPitch(bass), sol: detectPitch(sol), len: [m.buffer.length, up.length, dn.length] };
    });
    const near = (a, b) => Math.abs(a / b - 1) < 0.04;
    assert(near(r.up, r.f0 * Math.pow(2, 7 / 12)), `+7반음 오차 ${r.up}`);
    assert(near(r.dn, r.f0 * Math.pow(2, -5 / 12)), `-5반음 오차 ${r.dn}`);
    assert(near(r.bass, 92), `베이스 목표 92Hz, 결과 ${r.bass}`);
    assert(near(r.sol, 196), `솔(G3) 목표 196Hz, 결과 ${r.sol}`);
    assert(r.len[0] === r.len[1] && r.len[0] === r.len[2], '길이가 변함');
    return `원래 ${r.f0.toFixed(0)}Hz → +7: ${r.up.toFixed(0)} · -5: ${r.dn.toFixed(0)} · 베이스: ${r.bass.toFixed(0)} · 솔: ${r.sol.toFixed(0)}Hz, 길이 유지`;
  });

  await test('화질 향상 (GPU) 적용 · 화면 변화', async () => {
    const r = await page.evaluate(async () => {
      const s = window.__ttuk.state, c = s.clips.find(x => x.kind === 'media' && !isVideoClip(x));
      const L = layout().find(l => l.clip === c);
      const grab = () => { render(L.start + c.duration / 2); const g = document.createElement('canvas'); g.width = 64; g.height = 114; const x = g.getContext('2d'); x.drawImage(canvas, 0, 0, 64, 114); return x.getImageData(0, 0, 64, 114).data; };
      const prev = c.enhance; c.enhance = 0; const a = grab(); c.enhance = 1; const b = grab(); c.enhance = prev;
      let d = 0; for (let i = 0; i < a.length; i += 4) d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      return { diff: d / (a.length / 4) / 3, gl: Enhancer.available() };
    });
    assert(r.gl, 'WebGL 사용 불가');
    assert(r.diff > 2, '화질 향상 전후 차이 없음 ' + r.diff);
    return `평균 화소 변화 ${r.diff.toFixed(1)}`;
  });

  await test('자막: SRT 불러오기 · 지금 위치 추가 · SRT 저장 일치', async () => {
    await page.evaluate(() => showTab('subs'));
    await page.setInputFiles('#subFileInput', [F('test.srt')]);
    await page.waitForTimeout(400);
    await page.evaluate(() => { seekTo(6); addSubHere(); const s = window.__ttuk.state.subs; s[s.length - 1].text = '추가 *자막*'; });
    const srt = await page.evaluate(() => toSRT());
    const back = await page.evaluate(t => parseSubtitleFile(t), srt);
    assert(back.length === 3, '자막 수 ' + back.length);
    assert(back[0].text === '안녕하세요 영상뚝딱 입니다' && Math.abs(back[0].start - 0.5) < 0.01 && Math.abs(back[0].end - 2.2) < 0.01, 'SRT 내용 불일치');
    return `3줄, 시간·문장 왕복 일치`;
  });

  await test('알고리즘 점검표 · 한 번에 고치기', async () => {
    await page.evaluate(() => openPublish('shorts'));
    await page.waitForTimeout(500);
    const s0 = +(await page.textContent('#pubScore'));
    if (await page.isEnabled('#pubFixAll')) await page.click('#pubFixAll');
    await page.waitForTimeout(400);
    const s1 = +(await page.textContent('#pubScore'));
    await page.evaluate(() => closeModal('#pubModal'));
    assert(s1 >= s0 && s1 >= 80, `점수 ${s0}→${s1}`);
    return `${s0}점 → ${s1}점`;
  });

  await test('동영상 저장 (H.264) + 자동 검수 + ffprobe 재검사', async () => {
    const exp = await page.evaluate(() => ({ d: totalDuration(), size: canvasSizeFor(S.aspect, S.quality) }));
    const r = await exportViaUI(page, out('main.mp4'));
    assert(/✅/.test(r.title), '완성 표시 아님: ' + r.title + ' / ' + r.note);
    assert(/검수 통과/.test(r.note), '자동 검수 실패: ' + r.note);
    return checkVideo(out('main.mp4'), { w: exp.size.w, h: exp.size.h, duration: exp.d, audio: true }) + ' · ' + r.note.split('\n').pop();
  });

  await test('프로젝트 저장 → 다시 열기 (장면·자막·미디어 그대로)', async () => {
    const r = await page.evaluate(async () => {
      const s = window.__ttuk.state;
      const before = JSON.stringify({ c: s.clips.map(c => [c.kind, c.duration, c.text]), subs: s.subs.map(x => [x.start, x.end, x.text]), m: s.media.length });
      const blob = await buildProjectBlob();
      await openProject(new File([blob], 't.ttuk'));
      const after = JSON.stringify({ c: s.clips.map(c => [c.kind, c.duration, c.text]), subs: s.subs.map(x => [x.start, x.end, x.text]), m: s.media.length });
      return { same: before === after, size: blob.size };
    });
    assert(r.same, '다시 열었더니 내용이 다름');
    return `${(r.size / 1e6).toFixed(1)}MB, 완전히 같음`;
  });

  await test('사진 없이 만들기 (글자·움직이는 배경)', async () => {
    await page.evaluate(() => { dirty = false; newProject(); AI.key = ''; GEN.key = ''; });
    await page.fill('#cmdInput', "쇼츠 10초, '사진 없이 테스트', 자막: 첫 문장 / 둘째 문장 / 셋째 문장");
    await page.click('#autoBtn');
    await page.waitForTimeout(1500);
    await stop(page);
    const r = await page.evaluate(() => window.__ttuk.state.clips.map(c => [c.kind, c.text]));
    assert(r.length >= 4 && r.every(c => c[0] === 'text'), '글자 장면이 아님: ' + JSON.stringify(r));
    const exp = await page.evaluate(() => ({ d: totalDuration(), size: canvasSizeFor(S.aspect, S.quality) }));
    const e = await exportViaUI(page, out('scratch.mp4'));
    assert(/검수 통과/.test(e.note), '검수: ' + e.note);
    return `장면 ${r.length}개 · ` + checkVideo(out('scratch.mp4'), { w: exp.size.w, h: exp.size.h, duration: exp.d });
  });

  await test('시리즈 저장 → 새 편 (제목 번호·음악·로고 유지)', async () => {
    await page.evaluate(() => { dirty = false; newProject(); });
    await importFiles(page, [path.join(IMGS, 'product-1color.jpg'), path.join(IMGS, 'product-2color.jpg'), F('beat.mp3'), path.join(IMGS, 'logo.png')]);
    await page.fill('#cmdInput', "쇼츠 8초 신나게 '시리즈 원본'");
    await page.click('#autoBtn'); await page.waitForTimeout(1200); await stop(page);
    const r = await page.evaluate(async () => {
      const tpl = templateFromProject('검증 시리즈'); tpl.titlePattern = '검증 {n}편'; await SeriesDB.put(tpl);
      dirty = false; newProject();
      const resp = await fetch('/icon.png'); const f = new File([await resp.blob()], 'ep.png', { type: 'image/png' });
      const { added } = await loadFiles([f]);
      await applyTemplateAssets(tpl);
      applyPlan(await episodePlan(tpl, added, tpl.episode));
      const s = window.__ttuk.state;
      const out = { title: s.clips.map(c => c.text).join('|'), bgm: !!s.settings.bgmId, logo: !!s.settings.logoId, aspect: s.settings.aspect };
      await SeriesDB.del(tpl.id);
      return out;
    });
    await stop(page);
    assert(/검증 2편/.test(r.title), '편 번호 제목 없음: ' + r.title);
    assert(r.bgm && r.logo && r.aspect === '9:16', '음악·로고·비율 유지 안 됨');
    return r.title;
  });

  await test('예약 실행 (사진 없이) · 지금 작업 보존', async () => {
    const before = await page.evaluate(() => window.__ttuk.state.clips.length);
    const dl = page.waitForEvent('download', { timeout: 300000 });
    const last = await page.evaluate(async () => {
      Scheduler.add({ name: '검증예약', source: 'text', command: "쇼츠 6초 '예약 검증', 자막: 하나 / 둘", every: 1, unit: 'day', at: '09:00' });
      const j = Scheduler.list().find(x => x.name === '검증예약');
      await Scheduler.runJob(j, true);
      const res = { last: j.last, next: j.nextRun };
      Scheduler.remove(j.id);
      return res;
    });
    const d = await dl; await d.saveAs(out('scheduled.mp4'));
    const after = await page.evaluate(() => window.__ttuk.state.clips.length);
    assert(last.last.ok, '예약 실패: ' + last.last.msg);
    assert(before === after, `지금 작업이 바뀜 ${before}→${after}`);
    const nx = new Date(last.next);
    assert(nx.getHours() === 9 && nx.getMinutes() === 0, '다음 실행 시각 오류 ' + nx);
    return last.last.msg + ' · 다음 ' + nx.toLocaleString('ko-KR') + ' · ' + checkVideo(out('scheduled.mp4'), {});
  });

  await test('용량 줄이기: 목표 용량 · 회전 영상 · 이미 가벼운 파일', async () => {
    const run = async (file, mb) => {
      await page.setInputFiles('#anyVideoInput', [file]);
      return page.evaluate(async mb => {
        const f = document.querySelector('#anyVideoInput').files[0];
        const r = await compressVideo(f, { maxMB: mb, signal: { cancelled: false }, onProgress: () => {} });
        const buf = new Uint8Array(await r.blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
        return { b64: btoa(s), w: r.width, h: r.height, before: r.before, after: r.after, unchanged: !!r.unchanged };
      }, mb);
    };
    const a = await run(F('big.mp4'), 2);
    fs.writeFileSync(out('cmp-2mb.mp4'), Buffer.from(a.b64, 'base64'));
    assert(a.after <= 2e6, `목표 2MB 초과 ${a.after}`);
    const pa = probe(out('cmp-2mb.mp4'));
    assert(Math.abs(pa.duration - 6) < 0.2 && pa.acodec, '압축 결과 길이·소리 오류');
    const b = await run(F('rotated.mp4'), 0);
    fs.writeFileSync(out('cmp-rot.mp4'), Buffer.from(b.b64, 'base64'));
    const pb = probe(out('cmp-rot.mp4'));
    assert(pb.w === 720 && pb.h === 1280, `회전 영상 방향 오류 ${pb.w}×${pb.h}`);
    const c = await run(F('clip.webm'), 0);
    assert(c.unchanged, '가벼운 파일이 오히려 커짐');
    return `6초 1080p ${(a.before / 1e6).toFixed(1)}MB → ${(a.after / 1e6).toFixed(2)}MB (${a.w}×${a.h}) · 세로 회전 ${pb.w}×${pb.h} · 가벼운 파일 그대로`;
  });

  await test('저장 용량 제한 (1MB)', async () => {
    await page.evaluate(() => { dirty = false; newProject(); });
    await importFiles(page, [path.join(IMGS, 'product-1color.jpg'), path.join(IMGS, 'product-2color.jpg'), F('clip.mp4')]);
    await page.fill('#cmdInput', '유튜브 8초 깔끔하게');
    await page.click('#autoBtn'); await page.waitForTimeout(1200); await stop(page);
    await page.evaluate(() => { S.maxSizeMB = 1; S.quality = 1080; });
    const e = await exportViaUI(page, out('limit1mb.mp4'));
    await page.evaluate(() => { S.maxSizeMB = 0; S.quality = 720; });
    const p = probe(out('limit1mb.mp4'));
    assert(p.size <= 1e6, `1MB 초과 ${p.size}`);
    return `${(p.size / 1e6).toFixed(2)}MB · ${p.w}×${p.h} · ${e.note.split('\n').pop()}`;
  });

  /* ---------- AI (모의 응답) ---------- */
  await test('AI 편집 (Claude 모의): 요청 형식 · 계획 적용 · 내레이션 목소리', async () => {
    await page.evaluate(() => { dirty = false; newProject(); AI.key = 'sk-ant-test'; AI.model = 'claude-opus-5-5'; GEN.key = 'AIza-test'; updateAiMode(); });
    await importFiles(page, [path.join(IMGS, 'product-1color.jpg'), path.join(IMGS, 'product-2color.jpg')]);
    rec.anthropic.length = 0; rec.google.length = 0;
    await page.fill('#cmdInput', '쇼츠 신나게 내레이션 넣어서');
    await page.click('#autoBtn');
    await page.waitForFunction(() => window.__ttuk.state.clips.some(c => c.voiceId), null, { timeout: 60000 });
    await stop(page);
    const req = rec.anthropic.find(x => x.body);
    assert(req.headers['x-api-key'] === 'sk-ant-test' || req.headers['authorization'] === 'Bearer sk-ant-test', 'API 키 헤더 없음');
    assert(req.headers['anthropic-dangerous-direct-browser-access'] === 'true', '브라우저 직접 호출 헤더 없음');
    assert(req.body.model === 'claude-opus-5-5', '모델 ' + req.body.model);
    assert(req.body.output_config?.format?.type === 'json_schema', '구조화 출력 아님');
    assert(req.body.fallbacks === 'default' && /server-side-fallback-2026-07-01/.test(req.headers['anthropic-beta'] || ''), '거절 대비(fallback) 설정 없음');
    assert(req.body.messages[0].content.filter(b => b.type === 'image').length === 2, '사진 2장이 안 감');
    const s = await page.evaluate(() => { const st = window.__ttuk.state; return { caps: st.clips.map(c => c.text), voice: st.clips.filter(c => c.voiceId).length }; });
    assert(s.caps.includes('AI 자막 1') && s.caps.includes('AI 자막 2'), 'AI 자막 적용 안 됨');
    assert(s.voice === 1, 'AI 성우 목소리 연결 안 됨');
    assert(rec.google.some(g => /tts/.test(g.url) && g.headers['x-goog-api-key'] === 'AIza-test'), 'TTS 요청 형식 오류');
    return `Claude 요청(모델·스키마·fallback·사진2장) OK → 자막 ${s.caps.filter(Boolean).length}개, 목소리 ${s.voice}개`;
  });

  await test('AI 생성 (Google 모의): 키 확인 · 사람 사진 · 영상 · 받아쓰기', async () => {
    const t = await page.evaluate(() => testGoogleKey('AIza-test'));
    assert(t.ok && t.found.image && t.found.video && t.found.tts && t.found.text, '모델 찾기 실패: ' + t.message);
    const img = await page.evaluate(async () => {
      const files = await generateImages({ prompt: buildPersonPrompt({ gender: 'woman', age: 'in their 30s', look: 'Korean', mood: 'smiling naturally', shot: 'medium shot', action: 'holding a bag' }), aspect: '9:16', count: 2 });
      return files.map(f => f.size);
    });
    const ireq = rec.google.find(g => /:predict$/.test(g.url));
    assert(img.length === 2 && ireq.body.parameters.aspectRatio === '9:16' && /Korean woman in their 30s/.test(ireq.body.instances[0].prompt), '사진 요청·응답 오류');
    const vid = await page.evaluate(async () => { const f = await generateVideo({ prompt: 'test', aspect: '9:16' }); return f.size; });
    assert(vid > 1000, '영상 받기 실패');
    await page.evaluate(() => { seekTo(0); });
    const n = await page.evaluate(() => transcribeToSubs());
    assert(n === 2, '받아쓰기 자막 수 ' + n);
    return `${t.message} · 사진 ${img.length}장 · 영상 ${(vid / 1e3).toFixed(0)}KB · 받아쓰기 자막 ${n}줄`;
  });

  await test('AI 사진 없이 기획 + 장면 사진 생성 (모의)', async () => {
    await page.evaluate(() => { dirty = false; newProject(); });
    await page.fill('#cmdInput', '친환경 에코백 홍보 쇼츠');
    await page.click('#autoBtn');
    await page.waitForFunction(() => window.__ttuk.state.clips.length >= 3, null, { timeout: 60000 });
    await stop(page);
    const r = await page.evaluate(() => window.__ttuk.state.clips.map(c => c.kind));
    assert(r.filter(k => k === 'media').length === 2, '장면 사진 생성 안 됨: ' + r);
    return r.join(',');
  });

  await test('AI 오류 처리: 잘못된 키 → 한국어 안내 + 기본 편집으로 계속', async () => {
    rec.failAnthropic = true;
    let n, g, toastText;
    try {
      await importFiles(page, [path.join(IMGS, 'product-1color.jpg')]);
      await page.fill('#cmdInput', '쇼츠 8초');
      await page.click('#autoBtn');
      await page.waitForFunction(() => /API 키가 올바르지 않습니다/.test(document.querySelector('#toast').textContent), null, { timeout: 30000 });
      toastText = await page.textContent('#toast');
      await page.waitForTimeout(800); await stop(page);
      n = await page.evaluate(() => window.__ttuk.state.clips.length);
      rec.failAnthropic = false;
      rec.failGoogle = true;
      g = await page.evaluate(() => testGoogleKey('bad'));
    } finally { rec.failAnthropic = false; rec.failGoogle = false; }
    assert(n > 0, '기본 편집으로 이어지지 않음');
    assert(!g.ok && /Google API 키가 올바르지 않습니다/.test(g.message), 'Google 오류 문구: ' + g.message);
    await page.evaluate(() => { AI.key = ''; GEN.key = ''; updateAiMode(); });
    return `Claude 401 → "${toastText.slice(0, 80)}" · 장면 ${n}개 생성 · Google 400 → "${g.message}"`;
  });

  await test('업로드 문구 (Claude 모의) · 썸네일', async () => {
    await page.evaluate(() => { AI.key = 'sk-ant-test'; });
    await page.evaluate(() => openPublish('reels'));
    await page.waitForFunction(() => document.querySelector('#pubTitle').value === 'AI 업로드 제목', null, { timeout: 20000 });
    const r = await page.evaluate(() => ({ tags: document.querySelector('#pubTags').value, w: document.querySelector('#pubThumb').width }));
    await page.evaluate(() => { closeModal('#pubModal'); AI.key = ''; });
    assert(r.tags.includes('#에코백') && r.w > 0, '문구·썸네일 오류');
    return `제목·해시태그(${r.tags}) · 썸네일 ${r.w}px`;
  });

  await test('기능 끄기 (config.js FEATURES)', async () => {
    const r = await page.evaluate(() => {
      FEATURES.schedule = false; FEATURES.compress = false;
      $$('[data-feature]').forEach(el => { if (FEATURES[el.dataset.feature] === false) el.hidden = true; });
      const res = [$('#scheduleBtn').hidden, $('#compressBtn').hidden, $('#seriesBtn').hidden];
      FEATURES.schedule = true; FEATURES.compress = true;
      $('#scheduleBtn').hidden = false; $('#compressBtn').hidden = false;
      return res;
    });
    assert(r[0] && r[1] && !r[2], '숨김 동작 오류 ' + r);
    return '예약·용량 버튼 숨김 / 시리즈 유지';
  });

  if (mobile) {
    await test('휴대폰: 모든 창이 화면 안에 들어옴', async () => {
      const bad = [];
      for (const id of ['#aiModal', '#genModal', '#seriesModal', '#compressModal', '#scheduleModal', '#helpModal', '#aboutModal']) {
        await page.evaluate(i => { document.querySelector(i).hidden = false; }, id);
        const r = await page.evaluate(i => { const c = document.querySelector(i + ' .modal-card').getBoundingClientRect(); return { l: c.left, r: c.right, w: innerWidth }; }, id);
        if (r.l < 0 || r.r > r.w + 1) bad.push(id);
        await page.evaluate(i => { document.querySelector(i).hidden = true; }, id);
      }
      assert(!bad.length, '넘치는 창: ' + bad);
      return '7개 창 모두 정상';
    });
  }

  await test('콘솔·페이지 오류 0건', async () => {
    const real = errs.filter(e => !/GL Driver|GPU stall/.test(e));
    assert(!real.length, real.slice(0, 5).join(' | '));
    return '오류 없음';
  });
  await page.screenshot({ path: out('screen.png') });
  await ctx.close();
}

/* ------------------------------------------------------------------ 정적 검사 */
async function staticSuite() {
  group = '정적 검사';
  await test('JS 문법 (모든 파일)', async () => {
    const files = fs.readdirSync(path.join(WWW, 'js')).filter(f => f.endsWith('.js')).map(f => path.join(WWW, 'js', f)).concat([path.join(ROOT, 'electron/main.js'), path.join(ROOT, 'electron/preload.js')]);
    for (const f of files) { const r = spawnSync(process.execPath, ['--check', f]); assert(!r.status, path.basename(f) + ': ' + r.stderr); }
    return `${files.length}개 파일 통과`;
  });
  await test('화면 요소 연결 (코드가 찾는 id 가 모두 있음)', async () => {
    const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
    const jsAll = fs.readdirSync(path.join(WWW, 'js')).map(f => fs.readFileSync(path.join(WWW, 'js', f), 'utf8')).join('\n');
    const ids = new Set([...html.matchAll(/id="([^"]+)"/g), ...jsAll.matchAll(/id="([A-Za-z][\w-]*)"/g)].map(m => m[1]));
    const missing = new Set();
    for (const f of fs.readdirSync(path.join(WWW, 'js'))) {
      const src = fs.readFileSync(path.join(WWW, 'js', f), 'utf8');
      for (const m of src.matchAll(/\$\('#([A-Za-z][\w-]*)/g)) if (!ids.has(m[1]) && !['flash'].includes(m[1])) missing.add(`${f}:#${m[1]}`);
    }
    assert(!missing.size, '없는 요소: ' + [...missing].join(', '));
    return `id ${ids.size}개, 누락 0`;
  });
  await test('저작권 표기', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert(/알앤케이그린월드/.test(pkg.build.copyright), 'package.json 저작권');
    assert(/알앤케이그린월드/.test(fs.readFileSync(path.join(ROOT, 'LICENSE.txt'), 'utf8')), 'LICENSE');
    assert(/알앤케이그린월드/.test(fs.readFileSync(path.join(WWW, 'js/config.js'), 'utf8')), 'config.js');
    assert(/알앤케이그린월드/.test(fs.readFileSync(path.join(ROOT, 'electron/main.js'), 'utf8')), '프로그램 정보');
    return '설치 파일·사용권·화면·정보창 모두 표기';
  });
}

/* ------------------------------------------------------------------ 데스크톱 앱 */
async function electronSuite(F) {
  group = 'PC 앱 (Electron)';
  const exe = path.join(ROOT, 'node_modules/electron/dist/electron');
  if (!fs.existsSync(exe)) { await test('Electron 실행 파일', async () => { throw new Error('node_modules/electron 없음'); }); return; }
  const app = await _electron.launch({ executablePath: exe, args: [ROOT, '--no-sandbox'], cwd: ROOT });
  const page = await app.firstWindow();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.waitForFunction(() => window.__ttuk && window.native, null, { timeout: 30000 });
  await test('한국어 메뉴', async () => {
    const m = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map(i => i.label));
    for (const l of ['파일', '편집', '재생', 'AI', '보기', '창', '도움말']) assert(m.includes(l), '메뉴 없음: ' + l);
    return m.join(' · ');
  });
  await test('API 키 암호화 저장 · 읽기 · 삭제', async () => {
    const r = await page.evaluate(async () => { await Platform.setSecret('t', 'abc'); const a = await Platform.getSecret('t'); await Platform.setSecret('t', ''); const b = await Platform.getSecret('t'); return [a, b]; });
    assert(r[0] === 'abc' && r[1] === '', '키 저장 오류 ' + r);
    return '정상';
  });
  await test('폴더 예약: 새 파일 → 영상 → 저장 폴더', async () => {
    const inDir = path.join(FX, 'jobs_in'), outDir = path.join(OUT, 'jobs_out');
    fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(inDir, { recursive: true }); fs.mkdirSync(outDir, { recursive: true });
    fs.copyFileSync(F('small.jpg'), path.join(inDir, 'a.jpg')); fs.copyFileSync(path.join(IMGS, 'product-2color.jpg'), path.join(inDir, 'b.jpg')); fs.copyFileSync(F('clip.mp4'), path.join(inDir, 'c.mp4'));
    const r = await page.evaluate(async ([i, o]) => {
      Scheduler.add({ name: 'PC예약', source: 'folder', folder: i, perEpisode: 3, outDir: o, command: "쇼츠 8초 신나게 'PC 예약'", every: 2, unit: 'hour' });
      const j = Scheduler.list().find(x => x.name === 'PC예약');
      await Scheduler.runJob(j, true);
      const res = { last: j.last, used: j.used.length, next: Math.round((j.nextRun - Date.now()) / 60000) };
      Scheduler.remove(j.id);
      return res;
    }, [inDir, outDir]);
    assert(r.last.ok, r.last.msg);
    const files = fs.readdirSync(outDir);
    assert(files.length === 1 && r.used === 3 && r.next >= 119 && r.next <= 120, `저장 ${files.length}개, 사용 ${r.used}, 다음 ${r.next}분`);
    return `${files[0]} · ${checkVideo(path.join(outDir, files[0]), { audio: true })} · 다음 실행 ${r.next}분 뒤`;
  });
  await test('PC 앱 오류 0건', async () => { assert(!errs.length, errs.join(' | ')); return '오류 없음'; });
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
}

/* ------------------------------------------------------------------ 설치 파일 */
async function installerSuite() {
  group = '윈도우 설치 파일';
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const exe = path.join(ROOT, 'dist', `YeongsangTtukttak-${pkg.version}-win-x64.exe`);
  await test(`설치 파일 v${pkg.version}`, async () => {
    assert(fs.existsSync(exe), '설치 파일 없음 (npm run dist:win 필요)');
    const head = fs.readFileSync(exe).subarray(0, 2).toString();
    assert(head === 'MZ', 'Windows 실행 파일 형식 아님');
    const upd = fs.readFileSync(path.join(ROOT, 'dist/win-unpacked/resources/app-update.yml'), 'utf8');
    assert(/ecolever\.co\.kr\/app\/ttukttak/.test(upd), '자동 업데이트 주소 없음');
    const list = execFileSync('npx', ['--prefix', ROOT, 'asar', 'list', path.join(ROOT, 'dist/win-unpacked/resources/app.asar')]).toString();
    for (const f of ['/www/index.html', '/www/js/subtitles.js', '/www/js/scheduler.js', '/www/vendor/vendor.js', '/electron/main.js', '/LICENSE.txt', '/node_modules/electron-updater/package.json']) assert(list.includes(f), '빠진 파일 ' + f);
    return `${(fs.statSync(exe).size / 1e6).toFixed(0)}MB · 필수 파일·자동 업데이트 설정 포함 · 제거 프로그램 포함(NSIS)`;
  });
}

/* ------------------------------------------------------------------ 보고서 */
function writeReport(started) {
  const ok = results.filter(r => r.ok).length;
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const summary = { app: '영상뚝딱', version: pkg.version, date: new Date().toISOString(), total: results.length, passed: ok, failed: results.length - ok, minutes: +((Date.now() - started) / 60000).toFixed(1) };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ summary, results }, null, 2));
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const groups = [...new Set(results.map(r => r.group))];
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>영상뚝딱 검증 결과</title>
<style>:root{--bg:#f6f4ef;--card:#fff;--ink:#222;--mut:#6b665c;--ok:#2f7a3a;--bad:#b3261e;--line:#e3ded3}
@media(prefers-color-scheme:dark){:root{--bg:#16181a;--card:#1f2224;--ink:#ece9e3;--mut:#9b978e;--ok:#7fd08a;--bad:#ff8a80;--line:#33383c}}
body{margin:0;background:var(--bg);color:var(--ink);font-family:'Noto Sans KR',system-ui,sans-serif;line-height:1.55}
main{max-width:980px;margin:0 auto;padding:24px 16px}h1{font-size:22px;margin:0 0 4px}.mut{color:var(--mut)}
.sum{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}.box{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px;min-width:120px}
.box b{display:block;font-size:26px}.ok{color:var(--ok)}.bad{color:var(--bad)}
h2{font-size:16px;margin:26px 0 8px}table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
td{padding:8px 10px;border-top:1px solid var(--line);vertical-align:top;font-size:13.5px}td:first-child{width:28px;text-align:center}td.d{color:var(--mut);font-size:12.5px;word-break:break-all}td.t{white-space:nowrap;color:var(--mut);font-size:12px;text-align:right}</style></head>
<body><main><h1>영상뚝딱 v${esc(pkg.version)} 자동 검증 결과</h1><div class="mut">${esc(new Date().toLocaleString('ko-KR'))} · © (주)알앤케이그린월드</div>
<div class="sum"><div class="box">전체<b>${results.length}</b></div><div class="box">통과<b class="ok">${ok}</b></div><div class="box">실패<b class="${results.length - ok ? 'bad' : 'ok'}">${results.length - ok}</b></div><div class="box">걸린 시간<b>${summary.minutes}분</b></div></div>
<p class="mut">AI 기능은 키 없이 검증하기 위해 Claude·Google API 와 같은 형식의 모의 응답을 사용했습니다(요청 형식·응답 처리·오류 안내 확인). 만든 동영상은 ffprobe/ffmpeg 로 다시 열어 코덱·길이·해상도·소리·검은 화면·디코딩 오류를 검사했습니다.</p>
${groups.map(g => `<h2>${esc(g)}</h2><table>${results.filter(r => r.group === g).map(r => `<tr><td>${r.ok ? '✅' : '❌'}</td><td>${esc(r.name)}</td><td class="d">${esc(r.detail)}</td><td class="t">${(r.ms / 1000).toFixed(1)}s</td></tr>`).join('')}</table>`).join('')}
</main></body></html>`;
  fs.writeFileSync(path.join(OUT, 'report.html'), html);
  console.log(`\n결과: ${ok}/${results.length} 통과 (${summary.minutes}분) → ${path.join(OUT, 'report.html')}`);
  return summary;
}

(async () => {
  const started = Date.now();
  const F = fixtures();
  const { srv, url } = await serve();
  await staticSuite();
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await functionalSuite(browser, url, F, 'PC 화면 (1440×900)', { viewport: { width: 1440, height: 900 } });
    await functionalSuite(browser, url, F, '휴대폰 화면 (Pixel 7 흉내, 터치)', Object.assign({}, devices['Pixel 7']));
  } finally { await browser.close(); }
  if (!process.env.SKIP_ELECTRON) await electronSuite(F);
  await installerSuite();
  srv.close();
  const s = writeReport(started);
  process.exit(s.failed ? 1 : 0);
})().catch(e => { console.error('검증 실행 오류', e); writeReport(Date.now()); process.exit(2); });
