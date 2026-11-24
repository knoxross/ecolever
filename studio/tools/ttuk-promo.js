#!/usr/bin/env node
/* 영상뚝딱 — 홍보물 한 묶음 만들기
 *   node tools/ttuk-promo.js promo/jobs/2026-11-16-ecolever [-o 완성폴더]
 * 기획 파일(spec.json) 하나로:
 *   shorts.json(9:16 쇼츠·릴스·틱톡) + feed.json(1:1 인스타 피드) 작업 파일 → 영상 2편
 *   + 표지 이미지(cover-*.jpg) + 장면 확인용 한 장(sheet-*.jpg) + 올릴 문구(caption.md)
 * Copyright (주)알앤케이그린월드
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const STUDIO = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const dir = path.resolve(args.find(a => !a.startsWith('-')) || '');
const oi = args.indexOf('-o');
if (!fs.existsSync(path.join(dir, 'spec.json'))) { console.error('사용법: node tools/ttuk-promo.js <기획 폴더(spec.json 있는 곳)> [-o 완성폴더]'); process.exit(2); }
const outDir = path.resolve(oi >= 0 ? args[oi + 1] : path.join(STUDIO, '..', 'deliver', 'promo', path.basename(dir)));
fs.mkdirSync(outDir, { recursive: true });

const spec0 = JSON.parse(fs.readFileSync(path.join(dir, 'spec.json'), 'utf8'));
// 0) 브랜드 키트만 불러오고, 다른 브랜드 요소가 섞이면 만들기 전에 멈춤 (영상 하나 = 브랜드 하나)
const { checkSpec } = require('./brand-kit.js');
const chk = checkSpec(spec0);
if (chk.errors.length) { console.error(`❌ 브랜드 섞임 검사 실패 — ${chk.kit ? chk.kit.name : spec0.brand}`); chk.errors.forEach(e => console.error('   - ' + e)); process.exit(3); }
const spec = chk.fixed;
const brands = JSON.parse(fs.readFileSync(path.join(STUDIO, 'promo', 'brands.json'), 'utf8'));
const brand = brands[spec.brand] || {};
const slug = path.basename(dir);

// 1) 작업 파일 두 개 (세로 쇼츠 · 정사각 피드)
const base = { ...spec };
delete base.brand; delete base.topic; delete base.trend; delete base.event; delete base.__realRatio;
const shorts = { ...base, aspect: '9:16', platform: 'shorts', export: { quality: 1080, fps: 30, vq: 'high', maxSizeMB: 9.5, name: `${slug}-shorts` } };
const feed = { ...base, aspect: '1:1', platform: 'reels', export: { quality: 1080, fps: 30, vq: 'high', maxSizeMB: 9.5, name: `${slug}-feed` } };
fs.writeFileSync(path.join(dir, 'shorts.json'), JSON.stringify(shorts, null, 2));
fs.writeFileSync(path.join(dir, 'feed.json'), JSON.stringify(feed, null, 2));

// 2) 만들기
console.error(`🎬 ${brand.name || spec.brand} · ${spec.topic || ''}`);
const r = spawnSync(process.execPath, [path.join(STUDIO, 'tools', 'ttuk-make.js'), path.join(dir, 'shorts.json'), path.join(dir, 'feed.json'), '-o', outDir, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
let res = [];
try { res = JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { console.error('결과를 읽지 못했습니다', r.stdout.slice(-500)); process.exit(1); }
if (!Array.isArray(res)) res = [res];
const bad = res.filter(x => !x.ok);
if (bad.length) { console.error('❌ 실패:', bad.map(b => b.error).join(' / ')); process.exit(1); }

// 3) 표지 · 장면 확인용 한 장
const ff = a => spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...a]);
for (const x of res) {
  const v = path.join(outDir, x.file), tag = x.width > x.height ? 'wide' : x.width === x.height ? 'feed' : 'shorts';
  ff(['-ss', '1.0', '-i', v, '-frames:v', '1', '-q:v', '2', path.join(outDir, `cover-${tag}.jpg`)]);
  const n = 8, step = Math.max(0.5, x.duration / n);
  ff(['-i', v, '-vf', `fps=1/${step.toFixed(3)},scale=${x.width > x.height ? 320 : 220}:-1,tile=${n}x1`, '-frames:v', '1', '-q:v', '3', path.join(outDir, `sheet-${tag}.jpg`)]);
}

// 4) 올릴 문구
const up = res[0].upload || {};
// 성과 측정 링크: 에코레버 utm, 지마당 ?src=video-MMDD
const mmdd = (slug.match(/\d{4}-(\d{2})-(\d{2})/) || []).slice(1).join('');
const baseLink = (spec.upload && spec.upload.link) || brand.site || '';
const trackLink = !baseLink || /[?&](utm_|src=)/.test(baseLink) ? baseLink
  : spec.brand === 'gmadang' ? `${baseLink}${baseLink.includes('?') ? '&' : '?'}src=video-${mmdd}`
  : `${baseLink}${baseLink.includes('?') ? '&' : '?'}utm_source=instagram&utm_medium=social&utm_campaign=${mmdd}-${spec.brand}`;
if (spec.upload) spec.upload.link = trackLink;
const tags = (spec.upload && spec.upload.hashtags ? spec.upload.hashtags : brand.hashtags || []).map(t => '#' + String(t).replace(/^#/, ''));
const adLine = spec.ad ? `[${typeof spec.ad === 'string' ? spec.ad : '광고'}] ` : '';
const srcLine = spec.upload && spec.upload.source ? `출처: ${spec.upload.source}` : '';
const lines = spec.scenes.map(s => (typeof s === 'string' ? s : s.text || '').replace(/\n/g, ' ')).filter(Boolean);
const md = `# ${brand.name || spec.brand} 홍보물 — ${slug}

- 주제: ${spec.topic || ''}
- 활용한 트렌드: ${spec.trend || ''}
- 파일: ${res.map(x => `${x.file} (${x.width}×${x.height}, ${x.duration}초, ${(x.size_bytes / 1e6).toFixed(1)}MB, 검수 ${x.qa && x.qa.ok ? '통과' : '확인 필요'})`).join(' / ')}

## 유튜브 쇼츠
제목: ${adLine}${up.title || ''}
설명:
${adLine}${lines.join('\n')}
${spec.outro || ''}${spec.outro_sub ? ' · ' + spec.outro_sub : ''}
${(spec.upload && spec.upload.link) || brand.site || ''}${srcLine ? '\n' + srcLine : ''}
${tags.slice(0, 5).join(' ')} #Shorts

## 인스타그램 릴스 · 피드
${adLine}${lines[0] || ''} 👇
${lines.slice(1).map(l => '✔ ' + l).join('\n')}

${spec.outro || ''}${spec.outro_sub ? '\n' + spec.outro_sub : ''}
🔗 프로필 링크 · ${(spec.upload && spec.upload.link) || brand.site || ''}${srcLine ? '\n' + srcLine : ''}

${tags.join(' ')}

## 틱톡
${adLine}${lines[0] || ''} ${tags.slice(0, 4).join(' ')} #fyp

## 올리기 팁
- 쇼츠·릴스·틱톡은 같은 날 오전 11~12시나 저녁 7~9시에 올리면 반응이 좋습니다.
- 첫 댓글에 링크·연락처를 고정해 두세요.
- 표지는 cover-shorts.jpg / cover-feed.jpg 를 쓰세요.
`;
fs.writeFileSync(path.join(dir, 'caption.md'), md);
fs.writeFileSync(path.join(outDir, 'caption.md'), md);
console.log(JSON.stringify({ ok: true, outDir, files: res.map(x => x.file), qa: res.map(x => x.qa && x.qa.ok), durations: res.map(x => x.duration) }));
