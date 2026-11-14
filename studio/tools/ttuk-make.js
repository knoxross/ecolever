#!/usr/bin/env node
/* 영상뚝딱 — 명령줄 영상 제작기 (화면 없이, 서버·클라우드에서도)
 *
 *   node tools/ttuk-make.js 작업.json [-o 완성폴더] [--json]
 *   node tools/ttuk-make.js 요청폴더/        ← 폴더 안의 *.json 을 모두 처리
 *
 * 작업 파일 형식은 www/js/jobs.js 맨 위 설명 참고. image 칸에는
 *   작업 파일 기준 상대 경로 · 절대 경로 · https 주소 를 쓸 수 있습니다.
 * 결과: <완성폴더>/<이름>.mp4 + <이름>.결과.json (크기·길이·검수·업로드 제목/설명/해시태그)
 * 끝나면 마지막 줄에 결과 JSON 을 한 줄로 출력합니다 (--json 이면 그것만 출력).
 *
 * 준비: cd studio && npm ci && npm run vendor  (Playwright 의 Chromium 이 필요)
 * Copyright (주)알앤케이그린월드
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { execFileSync } = require('child_process');

const STUDIO = path.resolve(__dirname, '..');
const WWW = path.join(STUDIO, 'www');
const args = process.argv.slice(2);
const quiet = args.includes('--json');
const outIdx = args.indexOf('-o');
const outDirArg = outIdx >= 0 ? args[outIdx + 1] : '';
const inputs = args.filter((a, i) => !a.startsWith('-') && (outIdx < 0 || i !== outIdx + 1));
const log = (...m) => { if (!quiet) console.error(...m); };

if (!inputs.length) {
  console.error('사용법: node tools/ttuk-make.js 작업.json [-o 완성폴더] [--json]\n       node tools/ttuk-make.js 요청폴더/');
  process.exit(2);
}

function ensureVendor() {
  if (fs.existsSync(path.join(WWW, 'vendor', 'vendor.js'))) return;
  log('준비: 화면 부품(vendor) 만드는 중…');
  execFileSync(process.execPath, [path.join(STUDIO, 'scripts', 'build-vendor.mjs')], { cwd: STUDIO, stdio: quiet ? 'ignore' : 'inherit' });
}
function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
  const srv = http.createServer((req, res) => {
    const p = path.normalize(path.join(WWW, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!p.startsWith(WWW)) { res.writeHead(403); return res.end(); }
    fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, url: `http://127.0.0.1:${srv.address().port}/index.html` })));
}
function download(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http;
    mod.get(url, { headers: { 'user-agent': 'TtukttakVideoMaker/2 (+https://www.ecolever.co.kr)' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) { res.resume(); return resolve(download(new URL(res.headers.location, url).href, redirects - 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`내려받기 실패 ${res.statusCode}: ${url}`)); }
      const chunks = []; let size = 0;
      res.on('data', c => { size += c.length; if (size > 200e6) { res.destroy(); reject(new Error('파일이 너무 큽니다(200MB 초과)')); } else chunks.push(c); });
      res.on('end', () => resolve({ data: Buffer.concat(chunks), type: (res.headers['content-type'] || '').split(';')[0] }));
    }).on('error', reject);
  });
}
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'video/webm': '.webm', 'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav' };

/** 작업 파일의 image·music.file 을 실제 파일로 (임시 폴더에 모아서 경로 목록 만들기) */
async function collectFiles(job, baseDir, tmp) {
  const refs = new Set();
  (job.scenes || []).forEach(s => { const r = s && typeof s === 'object' && (s.image || s.photo || s.video); if (r) refs.add(String(r)); });
  if (job.music && job.music.file) refs.add(String(job.music.file));
  const map = {}; let k = 0;
  for (const ref of refs) {
    try {
      let data, type = '', name;
      if (/^https?:\/\//i.test(ref)) {
        log(`  내려받는 중: ${ref}`);
        ({ data, type } = await download(ref));
        name = `f${++k}${EXT[type] || path.extname(new URL(ref).pathname) || '.jpg'}`;
      } else {
        const p = path.isAbsolute(ref) ? ref : path.join(baseDir, ref);
        data = fs.readFileSync(p);
        name = `f${++k}${path.extname(p) || '.jpg'}`;
      }
      const fp = path.join(tmp, name);
      fs.writeFileSync(fp, data);
      map[ref] = { path: fp, name };
    } catch (e) { log(`  ⚠️ 파일을 못 가져옴 (${ref}): ${e.message}`); }
  }
  return map;
}

async function runOne(page, jobPath, outDir) {
  const baseDir = path.dirname(path.resolve(jobPath));
  const raw = JSON.parse(fs.readFileSync(jobPath, 'utf8').replace(/^﻿/, ''));
  const base = path.basename(jobPath).replace(/\.json$/i, '');
  if (!raw.export || typeof raw.export !== 'object') raw.export = {};
  if (!raw.export.name) raw.export.name = base;
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ttuk-'));
  try {
    const files = await collectFiles(raw, baseDir, tmp);
    // 파일들을 화면의 파일 입력칸으로 넘겨 두기 (작업이 이름으로 찾아 씀)
    const list = Object.values(files);
    await page.evaluate(() => { window.__jobFiles = {}; });
    if (list.length) {
      await page.evaluate(() => {
        const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.id = '__jobInput'; inp.hidden = true;
        inp.onchange = () => { for (const f of inp.files) window.__jobFiles[f.name] = f; window.__jobFilesReady = true; };
        document.body.appendChild(inp); window.__jobFilesReady = false;
      });
      await page.setInputFiles('#__jobInput', list.map(f => f.path));
      await page.waitForFunction(() => window.__jobFilesReady === true);
      await page.evaluate(() => document.getElementById('__jobInput').remove());
    }
    const refMap = Object.fromEntries(Object.entries(files).map(([ref, f]) => [ref, f.name]));
    await page.exposeFunction('__jobProgress', t => log('  ' + t)).catch(() => {});
    const meta = await page.evaluate(async ({ raw, refMap }) => {
      let last = '', lastPct = -1;
      const say = t => { if (t && t !== last) { last = t; window.__jobProgress(t); } };
      const sayPct = (pct, text) => { const q = Math.floor((pct || 0) * 4); if (pct > 0 && pct < 1) { if (q !== lastPct) { lastPct = q; say(`영상 만드는 중… ${q * 25}%`); } } else say(text); };
      const out = await withIsolatedProject(async () => {
        const o = await makeVideoFromJob(raw, async ref => window.__jobFiles[refMap[ref]] || null, {
          onStatus: say, onProgress: ({ pct, text }) => sayPct(pct, text),
        });
        window.__jobBlob = o.blob;
        return { name: o.name, result: jobResultJson(o) };
      });
      return out;
    }, { raw, refMap });
    // 완성 영상을 조각으로 받아 저장 (큰 파일도 안전하게)
    const size = await page.evaluate(() => window.__jobBlob.size);
    const fd = fs.openSync(path.join(outDir, meta.name), 'w');
    const CH = 4 * 1024 * 1024;
    for (let off = 0; off < size; off += CH) {
      const b64 = await page.evaluate(async ([o, n]) => {
        const buf = new Uint8Array(await window.__jobBlob.slice(o, o + n).arrayBuffer());
        let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        return btoa(s);
      }, [off, CH]);
      fs.writeSync(fd, Buffer.from(b64, 'base64'));
    }
    fs.closeSync(fd);
    await page.evaluate(() => { window.__jobBlob = null; window.__jobFiles = {}; });
    const res = JSON.parse(meta.result);
    res.request = path.basename(jobPath);
    res.path = path.resolve(outDir, meta.name);
    fs.writeFileSync(path.join(outDir, base + '.결과.json'), JSON.stringify(res, null, 2));
    return res;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

(async () => {
  ensureVendor();
  const jobs = [];
  for (const a of inputs) {
    if (fs.statSync(a).isDirectory()) fs.readdirSync(a).filter(n => /\.json$/i.test(n) && !/\.결과\.json$/.test(n)).sort().forEach(n => jobs.push(path.join(a, n)));
    else jobs.push(a);
  }
  const { chromium } = require('playwright');
  const { srv, url } = await serve();
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => typeof makeVideoFromJob === 'function' && document.fonts.status === 'loaded', null, { timeout: 60000 });
  const results = [];
  let failed = 0;
  for (const jp of jobs) {
    const outDir = path.resolve(outDirArg || path.dirname(path.resolve(jp)));
    fs.mkdirSync(outDir, { recursive: true });
    log(`🎬 ${path.basename(jp)} → ${outDir}`);
    const t0 = Date.now();
    try {
      const r = await runOne(page, jp, outDir);
      log(`  ✅ ${r.file} · ${(r.size_bytes / 1e6).toFixed(1)}MB · ${r.width}×${r.height} · ${r.duration}초 · 검수 ${r.qa ? (r.qa.ok ? '통과' : '확인 필요') : '-'} · ${((Date.now() - t0) / 1000).toFixed(0)}초 걸림`);
      results.push(r);
    } catch (e) {
      failed++;
      const msg = (e.message || String(e)).replace(/^page\.evaluate: (Error: )?/, '').split('\n')[0];
      log(`  ❌ 실패: ${msg}`);
      const base = path.basename(jp).replace(/\.json$/i, '');
      const r = { ok: false, request: path.basename(jp), error: msg, made_at: new Date().toISOString() };
      fs.writeFileSync(path.join(outDir, base + '.결과.json'), JSON.stringify(r, null, 2));
      results.push(r);
    }
  }
  await browser.close(); srv.close();
  if (pageErrors.length) log('참고(화면 오류): ' + pageErrors.slice(0, 3).join(' | '));
  console.log(JSON.stringify(results.length === 1 ? results[0] : results));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('❌ ' + (e.message || e)); process.exit(1); });
