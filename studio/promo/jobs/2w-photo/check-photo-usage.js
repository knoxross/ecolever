const fs=require('fs'),path=require('path');const ST=process.argv[2];
const eps=[['12/1','2w-11'],['12/2','2w-25'],['12/3','2w-26'],['12/4','2w-10'],['12/5','2w-09'],['12/6','2w-27']];
// 같은 장면(파일명만 다른 사진) 묶음 — 11/28 사진 비교로 찾음
const grp={'2color-stripe.jpg':'화분2칼라','blog-224397594394-08.jpg':'화분2칼라','blog-224427148917-02.jpg':'초록통비침','blog-224427148917-08.jpg':'초록통비침','blog-224466104854-08.png':'초록통비침','blog-224427148917-04.jpg':'야외ECO-a','blog-224466104854-09.png':'야외ECO-a','blog-224363122105-06.jpg':'꽃병2칼라','blog-224397594394-07.jpg':'꽃병2칼라','blog-224466104854-10.png':'꽃병2칼라'};
const seenF={},seenG={};let rows=[],dupF=0,dupG=0;
for(const [d,id] of eps){const j=JSON.parse(fs.readFileSync(path.join(ST,'promo/jobs/2w-photo',id+'-ecolever','shorts.json'),'utf8'));
 const fl=j.scenes.map(s=>s.image?path.basename(s.image):'(글자 화면)');rows.push(`| ${d} | ${id} | ${fl.join(' · ')} |`);
 for(const f of new Set(fl)){if(f==='(글자 화면)')continue;(seenF[f]=seenF[f]||[]).push(id);const g=grp[f]||f;(seenG[g]=seenG[g]||new Set()).add(id);}}
for(const [f,a] of Object.entries(seenF))if(a.length>1){dupF++;console.error('DUP FILE',f,a);}
for(const [g,a] of Object.entries(seenG))if(a.size>1){dupG++;console.error('DUP SCENE',g,[...a]);}
console.log(rows.join('\n'));console.log(`\n- 검사(11/28): 같은 파일명 두 편 이상 **${dupF}건** · 파일명이 달라도 같은 장면 두 편 이상 **${dupG}건**.`);
