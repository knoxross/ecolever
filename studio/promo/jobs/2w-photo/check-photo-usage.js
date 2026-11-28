// 에코레버 쇼츠 편별 사용 사진 표 + 중복 검사 (RNK 11/28 규칙: 같은 장면은 5편 안에 다시 쓰지 않음)
// 사용: node check-photo-usage.js <studio 폴더>
const fs=require('fs'),path=require('path');const ST=process.argv[2];const GAP=5;
const eps=[
 ['11/28','2w-08','2w/2w-08-ecolever'],['11/29','2w-24','2w/2w-24-ecolever'],['11/30','2w-22','2w/2w-22-ecolever'],
 ['12/1','2w-11','2w-photo/2w-11-ecolever'],['12/2','2w-25','2w-photo/2w-25-ecolever'],['12/3','2w-26','2w-photo/2w-26-ecolever'],
 ['12/4','2w-10','2w-photo/2w-10-ecolever'],['12/5','2w-09','2w-photo/2w-09-ecolever'],['12/6','2w-27','2w-photo/2w-27-ecolever'],
 ['12/7','2w-23','2w-photo/2w-23-ecolever'],['12/8','2w-13','2w-photo/2w-13-ecolever'],['12/9','2w-12','2w-photo/2w-12-ecolever'],['12/10','2w-29','2w-photo/2w-29-ecolever'],
 ['12/11','3w-01','3w/3w-01-hospital'],['12/12','3w-02','3w/3w-02-university'],['12/13','3w-03','3w/3w-03-postnatal'],
 ['12/14','3w-04','3w/3w-04-esg'],['12/15','3w-05','3w/3w-05-wedding'],['12/16','3w-06','3w/3w-06-printshop'],
 ...['12/17','12/18','12/19','12/20','12/21','12/22','12/23','12/24','12/25','12/26','12/27','12/28','12/29','12/30','12/31'].map((d,i)=>[d,i<6?'3w-'+String(i+7).padStart(2,'0'):'미정',null]),
];
// 파일명만 다르고 같은 장면인 사진 묶음 (11/28 사진 비교)
const grp={'2color-stripe.jpg':'화분2칼라','blog-224397594394-08.jpg':'화분2칼라','blog-224427148917-02.jpg':'초록통비침','blog-224427148917-08.jpg':'초록통비침','blog-224466104854-08.png':'초록통비침','blog-224427148917-04.jpg':'야외ECO-a','blog-224466104854-09.png':'야외ECO-a','blog-224363122105-06.jpg':'꽃병2칼라','blog-224397594394-07.jpg':'꽃병2칼라','blog-224466104854-10.png':'꽃병2칼라'};
const g=f=>grp[f]||f;const isDoc=f=>/^doc-|^for-|^guide|^site-/.test(f);const last={};const rows=[];let bad=0;const all=new Set();
fs.readdirSync(path.join(ST,'promo/assets/ecolever/photo')).forEach(f=>all.add(g(f)));['product-1color.jpg','product-2color.jpg'].forEach(f=>all.add(f));
const made={};eps.forEach(([d,id,rel],i)=>{const p=rel&&path.join(ST,'promo/jobs',rel,'shorts.json');if(p&&fs.existsSync(p))JSON.parse(fs.readFileSync(p,'utf8')).scenes.forEach(s=>{if(s.image){const f=g(path.basename(s.image));(made[f]=made[f]||[]).push(i);}});});
const ahead=(x,i)=>(made[x]||[]).some(k=>k>i&&k-i<GAP);
eps.forEach(([d,id,rel],i)=>{const p=rel&&path.join(ST,'promo/jobs',rel,'shorts.json');
 if(!p||!fs.existsSync(p)){const free=[...all].filter(x=>(last[x]===undefined||i-last[x]>=GAP)&&!ahead(x,i)).sort((a,b)=>(last[a]??-99)-(last[b]??-99));const pick=free.slice(0,4);pick.forEach(x=>last[x]=i);rows.push(`| ${d} | ${id} | (배정안) ${pick.join(' · ')} | 쓸 수 있는 장면 ${free.length}개${free.length<4?' → **새 사진 필요**':''} |`);return;}
 const j=JSON.parse(fs.readFileSync(p,'utf8'));const fl=j.scenes.map(s=>s.image?path.basename(s.image):'(글자 화면)');const note=[];
 for(const f of new Set(fl.filter(x=>x!=='(글자 화면)'&&!isDoc(x)).map(g))){if(last[f]!==undefined&&i-last[f]<GAP){bad++;note.push(`겹침: ${f} (${eps[last[f]][0]})`);}last[f]=i;}
 rows.push(`| ${d} | ${id} | ${fl.join(' · ')} | ${note.join(', ')||'통과'} |`);});
const unused=[...all].filter(x=>last[x]===undefined);console.log('- 서류(doc-*)와 사이트 화면(for-* 등)은 같은 서류를 보여 줘야 해서 검사에서 뺍니다.');
console.log('| 게시 | 편 | 장면 순서대로 사진 파일 | 검사 |\n|---|---|---|---|\n'+rows.join('\n'));
console.log(`\n- 검사 규칙: 같은 장면(파일명이 달라도 같은 사진 포함)은 ${GAP}편 안에 다시 쓰지 않음. 위반 **${bad}건**. '(배정안)'은 아직 안 만든 날에 규칙대로 미리 배정해 본 것입니다.`);
console.log(`- 한 번도 안 쓴 실제 사진 장면: ${unused.length}개${unused.length?' ('+unused.join(', ')+')':''}.`);
