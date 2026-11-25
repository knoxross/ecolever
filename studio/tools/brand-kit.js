/* 영상뚝딱 — 브랜드 키트 불러오기 · 섞임 검사
 * 영상 하나에는 브랜드 하나만: 로고·색·글꼴·상품·연락처·사이트·끝 화면이 모두 같은 브랜드여야 한다.
 * 회사((주)알앤케이그린월드)는 끝 화면 아래 작은 글씨 한 줄(footer)로만.
 * 사용: node tools/brand-kit.js <기획 폴더…>   → 섞인 곳을 찾아 알려 줌(만들기 전에 ttuk-promo 가 자동으로 부름)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const STUDIO = path.resolve(__dirname, '..');
const KITS = path.join(STUDIO, 'promo', 'kits');

function loadKits() {
  const out = {};
  for (const f of fs.readdirSync(KITS)) if (f.endsWith('.json')) { const k = JSON.parse(fs.readFileSync(path.join(KITS, f), 'utf8')); out[k.brand] = k; }
  return out;
}
const norm = p => String(p || '').replace(/\\/g, '/').replace(/^(\.\.\/)+/, '').replace(/^promo\//, '');
const has = (txt, w) => String(txt).toLowerCase().includes(String(w).toLowerCase());

/** 기획(spec)을 검사한다. 반환: { kit, errors[], fixed(키트 기본값을 채운 spec) } */
function checkSpec(spec) {
  const kits = loadKits();
  const errors = [];
  const kit = kits[spec.brand];
  if (!kit) return { kit: null, errors: [`브랜드 키트가 없습니다: '${spec.brand}' (promo/kits/ 에 ${Object.keys(kits).join('·')})`], fixed: spec };
  if (kit.status === 'blocked') return { kit, errors: [`${kit.name}: 영상 제작 중지 — ${kit.reason}`], fixed: spec };
  if (kit.status !== 'active') return { kit, errors: [`${kit.name}: 단독 영상 브랜드가 아닙니다 — ${kit.reason || ''}`], fixed: spec };

  const fixed = JSON.parse(JSON.stringify(spec));
  // 키트 기본값: 로고·회사 한 줄
  if (!fixed.logo) fixed.logo = { image: '../../' + kit.logo, pos: 'tr', size: 0.09 };
  if (fixed.footer === undefined && kit.company_footer) fixed.footer = kit.company_footer;

  const ex = fixed.event && kit.exceptions && kit.exceptions[fixed.event];
  if (fixed.event && !ex) errors.push(`이 브랜드에 없는 예외 행사: '${fixed.event}'`);
  const allowAssets = new Set((ex && ex.allowAssets) || []);
  const others = Object.values(kits).filter(k => k.brand !== kit.brand);

  // 1) 그림·영상 파일: 이 브랜드 폴더 것만
  const files = [];
  const walk = (v, key) => {
    if (typeof v === 'string') { if (/(^|\/)assets\//.test(v)) files.push({ key, f: norm(v) }); return; }
    if (Array.isArray(v)) v.forEach(x => walk(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(fixed, '');
  for (const { key, f } of files) {
    const ok = kit.assetDirs.some(d => f.startsWith(d)) || allowAssets.has(f);
    if (!ok) errors.push(`다른 브랜드 파일: ${f}${allowAssets.size ? '' : (f.startsWith('assets/ecolever/product') && kit.brand === 'gmadang' ? " (에코백 사진은 \"event\": \"giveaway\" 증정 영상에서만)" : '')}`);
    for (const o of others) if ((o.logoFiles || []).map(norm).includes(f)) errors.push(`다른 브랜드 로고: ${f} (${o.name})`);
  }
  const logo = fixed.logo && norm(fixed.logo.image || fixed.logo);
  if (logo && !(kit.logoFiles || []).map(norm).includes(logo)) errors.push(`로고가 이 브랜드 것이 아닙니다: ${logo} (키트 로고 ${kit.logo})`);
  const endImg = fixed.endcard && fixed.endcard.image && norm(fixed.endcard.image);
  if (endImg && !(kit.endcard || []).map(norm).includes(endImg)) errors.push(`끝 화면 그림이 키트에 없습니다: ${endImg}`);

  // 2) 글자: 다른 브랜드 이름·주소, 금지 표현 (회사 한 줄 footer 는 예외)
  const texts = [];
  (fixed.scenes || []).forEach((s, i) => { if (typeof s === 'string') texts.push([`장면${i + 1}`, s]); else { for (const k of ['text', 'sub']) if (s[k]) texts.push([`장면${i + 1}.${k}`, s[k]]); (s.list || []).forEach(t => texts.push([`장면${i + 1}.list`, t])); if (s.ai && s.ai.prompt) texts.push([`장면${i + 1}.ai`, s.ai.prompt]); } });
  for (const k of ['outro', 'outro_sub', 'title']) if (fixed[k]) texts.push([k, typeof fixed[k] === 'string' ? fixed[k] : JSON.stringify(fixed[k])]);
  if (fixed.endcard && fixed.endcard.text) texts.push(['endcard', fixed.endcard.text]);
  (fixed.overlays || []).forEach((o, i) => o.text && texts.push([`overlay${i + 1}`, o.text]));
  const up = fixed.upload || {};
  for (const k of ['title', 'description', 'link', 'source']) if (up[k]) texts.push([`upload.${k}`, up[k]]);
  (up.hashtags || []).forEach(t => texts.push(['upload.hashtags', t]));
  for (const [where, t] of texts) {
    for (const o of others) for (const w of o.terms || []) if (has(t, w)) errors.push(`다른 브랜드(${o.name}) 표현 '${w}' — ${where}: "${String(t).slice(0, 40)}"`);
    for (const w of kit.forbidden || []) if (has(t, w)) errors.push(`금지 표현 '${w}' — ${where}`);
  }
  if (up.link && kit.site && !has(up.link, kit.site)) errors.push(`링크가 이 브랜드 사이트가 아닙니다: ${up.link}`);
  if (ex && ex.sourceLabel && !(up.source && has(up.source, ex.sourceLabel))) errors.push(`증정 영상은 출처를 '${ex.sourceLabel}'로 표시해야 합니다(upload.source)`);
  // 3) '자연스러움' 기준: 화면 시간의 80% 이상이 실사(사진·영상 전체 화면). 휴대폰·카드 틀 안 사진은 절반만 인정, 글자 화면·끝 화면은 0
  if (fixed.look === 'natural') {
    let real = 0, total = 0;
    for (const sc of fixed.scenes || []) {
      if (typeof sc !== 'object') continue;
      const d = +sc.duration || 3; total += d;
      if (sc.image || sc.video || sc.ai) real += ['phone', 'card'].includes(sc.fit) ? d * 0.5 : d;
      if (sc.transition && !['none', 'fade'].includes(sc.transition)) errors.push(`자연스러움 기준: 화려한 전환 '${sc.transition}' 대신 바로/페이드`);
      if (d < 2 || d > 4) errors.push(`자연스러움 기준: 컷 길이는 2~4초(지금 ${d}초 — "${String(sc.text || '').slice(0, 12)}")`);
    }
    if (fixed.outro) total += 2.5;
    const ratio = total ? real / total : 0;
    if (ratio < 0.8) errors.push(`자연스러움 기준: 실사 화면 비율 ${Math.round(ratio * 100)}% (80% 이상 필요)`);
    fixed.__realRatio = Math.round(ratio * 100);
  }
  return { kit, errors, fixed };
}
module.exports = { checkSpec, loadKits };

if (require.main === module) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) { console.error('사용법: node tools/brand-kit.js <기획 폴더…>'); process.exit(2); }
  let bad = 0;
  for (const d of dirs) {
    const p = path.join(d, 'spec.json'); if (!fs.existsSync(p)) continue;
    const { kit, errors } = checkSpec(JSON.parse(fs.readFileSync(p, 'utf8')));
    console.log(`${errors.length ? '❌' : '✅'} ${path.basename(d)} (${kit ? kit.name : '?'})`);
    errors.forEach(e => console.log('   - ' + e));
    if (errors.length) bad++;
  }
  process.exit(bad ? 1 : 0);
}
