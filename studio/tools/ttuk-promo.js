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

// 1) 작업 파일: 한 기획 → 플랫폼별 출력 (promo/platform-specs.md)
//    shorts 9:16  = 유튜브 쇼츠 · 인스타 릴스 · 스레드 · (틱톡)
//    feed   4:5   = 인스타 피드 · 스레드 피드
//    wide   16:9  = 네이버 블로그 · 유튜브 일반
const base = { ...spec };
delete base.brand; delete base.topic; delete base.trend; delete base.event; delete base.__realRatio; delete base.outputs;
const OUT = {
  shorts: { aspect: '9:16', platform: 'shorts' },
  feed: { aspect: '4:5', platform: 'reels' },
  square: { aspect: '1:1', platform: 'reels' },
  wide: { aspect: '16:9', platform: 'youtube' },
};
const onlyI = args.indexOf('--only');   // 예: --only wide → 그 비율만 다시 만듦(문구에는 이미 있는 파일도 적음)
const outputs = (onlyI >= 0 ? String(args[onlyI + 1] || '').split(',') : Array.isArray(spec.outputs) && spec.outputs.length ? spec.outputs : ['shorts', 'feed', 'wide']).filter(k => OUT[k]);
const jobFiles = outputs.map(k => {
  const j = { ...base, ...OUT[k], export: { quality: 1080, fps: 30, vq: 'high', maxSizeMB: k === 'wide' ? 20 : 9.5, name: `${slug}-${k}` } };
  const f = path.join(dir, `${k}.json`); fs.writeFileSync(f, JSON.stringify(j, null, 2)); return f;
});

// 2) 만들기
console.error(`🎬 ${brand.name || spec.brand} · ${spec.topic || ''}`);
const r = spawnSync(process.execPath, [path.join(STUDIO, 'tools', 'ttuk-make.js'), ...jobFiles, '-o', outDir, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
let res = [];
try { res = JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { console.error('결과를 읽지 못했습니다', r.stdout.slice(-500)); process.exit(1); }
if (!Array.isArray(res)) res = [res];
const bad = res.filter(x => !x.ok);
if (bad.length) { console.error('❌ 실패:', bad.map(b => b.error).join(' / ')); process.exit(1); }

// 3) 표지 · 장면 확인용 한 장
const ff = a => spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...a]);
for (const x of res) {
  const v = path.join(outDir, x.file), tag = (x.file.match(/-(shorts|feed|square|wide)\.mp4$/) || [])[1] || 'shorts';
  ff(['-ss', '1.0', '-i', v, '-frames:v', '1', '-q:v', '2', path.join(outDir, `cover-${tag}.jpg`)]);
  const n = 8, step = Math.max(0.5, x.duration / n);
  ff(['-i', v, '-vf', `fps=1/${step.toFixed(3)},scale=${x.width > x.height ? 320 : 220}:-1,tile=${n}x1`, '-frames:v', '1', '-q:v', '3', path.join(outDir, `sheet-${tag}.jpg`)]);
}

// 4) 올릴 문구
const up = res[0].upload || {};
// 성과 측정 링크: 플랫폼마다 따로 (에코레버 utm_source, 지마당 ?src=video-MMDD-플랫폼, 20자 이하)
const mmdd = (slug.match(/\d{4}-(\d{2})-(\d{2})/) || []).slice(1).join('') || String(spec.track || slug).replace(/[^a-z0-9]/gi, '').slice(0, 6).toLowerCase();   // 날짜 없는 미리 만든 편은 track 값(예: 2w01)
const baseLink = (spec.upload && spec.upload.link) || brand.site || '';
const PL = { youtube: 'yt', instagram: 'ig', threads: 'th', naver: 'nb', tiktok: 'tt' };
const linkFor = pf => {
  if (!baseLink) return baseLink;
  // spec 링크에 utm_source가 이미 있어도 플랫폼별로 바꿔 씀(유입 경로가 한 플랫폼으로 섞이지 않게). utm_campaign·src는 spec 값 유지.
  if (/[?&]utm_/.test(baseLink) && !/[?&]src=/.test(baseLink) && spec.brand !== 'gmadang') {
    try {
      const u = new URL(baseLink);
      u.searchParams.set('utm_source', pf);
      u.searchParams.set('utm_medium', pf === 'youtube' ? 'shorts' : 'social');
      if (!u.searchParams.get('utm_campaign')) u.searchParams.set('utm_campaign', `${mmdd}-${spec.brand}`);
      return u.toString();
    } catch (e) { return baseLink; }
  }
  if (/[?&](utm_|src=)/.test(baseLink)) return baseLink;
  const j = baseLink.includes('?') ? '&' : '?';
  return spec.brand === 'gmadang' ? `${baseLink}${j}src=video-${mmdd}-${PL[pf]}` : `${baseLink}${j}utm_source=${pf}&utm_medium=social&utm_campaign=${mmdd}-${spec.brand}`;
};
const tags = (spec.upload && spec.upload.hashtags ? spec.upload.hashtags : brand.hashtags || []).map(t => '#' + String(t).replace(/^#/, ''));
const adLine = spec.ad ? `[${typeof spec.ad === 'string' ? spec.ad : '광고'}] ` : '';
const srcLine = spec.upload && spec.upload.source ? `출처: ${spec.upload.source}` : '';
const lines = spec.scenes.map(s => (typeof s === 'string' ? s : s.text || '').replace(/\n/g, ' ')).filter(Boolean);
const outro = `${(spec.outro || '').replace(/\n/g, ' ')}${spec.outro_sub ? ' · ' + spec.outro_sub : ''}`;
const fileOf = k => (res.find(x => x.file.endsWith(`-${k}.mp4`)) || {}).file || (fs.existsSync(path.join(outDir, `${slug}-${k}.mp4`)) ? `${slug}-${k}.mp4` : '(없음)');
const md = `# ${brand.name || spec.brand} 홍보물 — ${slug}

- 주제: ${spec.topic || ''}
- 활용한 트렌드: ${spec.trend || ''}
- 파일: ${res.map(x => `${x.file} (${x.width}×${x.height}, ${x.duration}초, ${(x.size_bytes / 1e6).toFixed(1)}MB, 검수 ${x.qa && x.qa.ok ? '통과' : '확인 필요'})`).join(' / ')}
- 규격표: studio/promo/platform-specs.md · 게시 전 RNK 총괄 승인

## 유튜브 쇼츠 — ${fileOf('shorts')} (표지 cover-shorts.jpg)
제목: ${adLine}${up.title || ''}
설명:
${adLine}${lines.join('\n')}
${outro}
${linkFor('youtube')}${srcLine ? '\n' + srcLine : ''}
${tags.slice(0, 3).join(' ')} #Shorts

## 인스타그램 — 릴스 ${fileOf('shorts')} · 피드 ${fileOf('feed')} (표지 cover-feed.jpg)
${adLine}${lines[0] || ''}
${lines.slice(1).map(l => '· ' + l).join('\n')}

${outro}
🔗 프로필 링크 (${linkFor('instagram')})${srcLine ? '\n' + srcLine : ''}

${tags.slice(0, 5).join(' ')}

## 스레드 — ${fileOf('shorts')} 또는 ${fileOf('feed')}
${adLine}${lines[0] || ''} ${lines.slice(1, 3).join(' ')}
${linkFor('threads')}${srcLine ? '\n' + srcLine : ''}
주제 태그 1개: ${tags[0] || ''}

## 네이버 블로그 — ${fileOf('wide')} (16:9, 글 중간에 넣기)
제목: ${adLine}${up.title || ''}
[본문 첫 줄] ${lines[0] || ''}
[사진·영상] ${fileOf('wide')}
${lines.slice(1).map(l => '- ' + l).join('\n')}
[끝] ${outro}
링크: ${linkFor('naver')}${srcLine ? '\n' + srcLine : ''}
(QR 이미지는 글 맨 아래)
태그: ${tags.map(t => t.slice(1)).join(', ')}

## 틱톡 (계정이 생기면)
${adLine}${lines[0] || ''} ${tags.slice(0, 4).join(' ')}
`;
fs.writeFileSync(path.join(dir, 'caption.md'), md);
fs.writeFileSync(path.join(outDir, 'caption.md'), md);
console.log(JSON.stringify({ ok: true, outDir, files: res.map(x => x.file), qa: res.map(x => x.qa && x.qa.ok), durations: res.map(x => x.duration) }));
