/* 영상뚝딱 — 3단계 빠른 만들기 (처음 쓰는 사람용)
 *  1단계: 사진·영상 고르기
 *  2단계: 템플릿 고르기(브랜드 하나 · 분위기 · 화면 비율 · 자막 문장)
 *  3단계: 자막·음악이 붙은 미리보기 → 내보내기 (고급 편집은 펼쳐서)
 * 결과는 '자연스러움' 기준(look: natural): 실사 위주, 전환은 페이드, 컷 2~4초, 어쿠스틱·잔잔한 음악, 끝 페이드아웃.
 */
'use strict';

const QUICK_TPL = [
  { v: 'intro', label: '🌿 브랜드·상품 소개', note: '어쿠스틱 기타 · 천천히 확대', music: { style: 'acoustic', bpm: 84 } },
  { v: 'info', label: '📋 정보·안내', note: '잔잔한 피아노 · 또렷한 자막', music: { style: 'calm', bpm: 80 } },
  { v: 'event', label: '🎉 행사·모집', note: '밝은 어쿠스틱 · 조금 빠르게', music: { style: 'acoustic', bpm: 100 } },
  { v: 'vlog', label: '☕ 일상·브이로그', note: '로파이 · 부드러운 이동', music: { style: 'lofi', bpm: 80 } },
];
const Quick = (() => {
  let files = [], logo = null, step = 1, tpl = 'intro';
  const el = id => document.getElementById(id);

  function show(n) {
    step = n;
    document.querySelectorAll('#quickModal .q-step').forEach(s => { s.hidden = +s.dataset.q !== n; });
    document.querySelectorAll('#quickModal .q-dots span').forEach((d, i) => d.classList.toggle('on', i < n));
    el('qBack').hidden = n === 1;
    el('qNext').textContent = n === 2 ? '✨ 미리보기 만들기' : '다음 →';
    el('qNext').disabled = n === 1 && !files.length;
  }
  function renderThumbs() {
    const box = el('qThumbs'); box.textContent = '';
    files.forEach((f, i) => {
      const d = document.createElement('div'); d.className = 'q-thumb';
      const isV = /^video\//.test(f.type);
      const m = document.createElement(isV ? 'video' : 'img'); m.src = URL.createObjectURL(f); if (isV) { m.muted = true; m.preload = 'metadata'; }
      const n = document.createElement('span'); n.textContent = i + 1;
      const x = document.createElement('button'); x.textContent = '✕'; x.title = '빼기'; x.onclick = () => { files.splice(i, 1); renderThumbs(); show(1); };
      d.append(m, n, x); box.appendChild(d);
    });
    el('qCount').textContent = files.length ? `${files.length}개 · 장면 순서대로 들어가요` : '아직 없어요';
    // 2단계 자막 칸: 장면 수만큼 줄
    const ta = el('qLines');
    const cur = ta.value.split('\n');
    if (cur.length < files.length) ta.rows = Math.min(8, Math.max(3, files.length));
    ta.placeholder = files.map((f, i) => `${i + 1}번 장면 자막 (비워 두면 자막 없음)`).join('\n');
    show(step);
  }
  function renderTpl() {
    const box = el('qTpl'); box.textContent = '';
    for (const t of QUICK_TPL) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'q-tpl' + (t.v === tpl ? ' on' : '');
      const h = document.createElement('b'); h.textContent = t.label; const s = document.createElement('small'); s.textContent = t.note;
      b.append(h, s); b.onclick = () => { tpl = t.v; renderTpl(); };
      box.appendChild(b);
    }
  }
  function open() {
    show(files.length ? 2 : 1); renderThumbs(); renderTpl();
    el('qAutoSub').disabled = el('qVoice').disabled = !genReady();
    el('qKeyNote').hidden = genReady();
    openModal('#quickModal');
  }
  function buildJob() {
    const t = QUICK_TPL.find(x => x.v === tpl) || QUICK_TPL[0];
    const lines = el('qLines').value.split('\n');
    const color = el('qColor').value || '#2F4332';
    const brand = el('qBrand').value.trim(), site = el('qSite').value.trim(), footer = el('qFooter').value.trim();
    const voice = el('qVoice').checked;
    const scenes = files.map((f, i) => {
      const text = (lines[i] || '').trim();
      return {
        image: 'q' + i, text, narration: voice ? text : '', fit: 'blur', motion: i % 2 ? 'zoomOut' : 'zoomIn', filter: 'cine', font: 'serif',
        textBg: !!text, textPos: 'bottom', fontSize: 64, textAnim: 'fade', transition: i ? 'fade' : 'none',
        duration: /^video\//.test(f.type) ? 0 : (text.length > 18 ? 3.6 : 3), energy: i === 0 ? 1 : i >= files.length - 1 ? 2 : (i % 3 === 2 ? 2 : 1),
      };
    });
    return {
      aspect: el('qAspect').value, platform: el('qAspect').value === '16:9' ? 'youtube' : 'shorts', mood: 'calm', look: 'natural', emoji: false,
      scenes,
      outro: brand ? (site ? `${brand}\n${site}` : brand) : (site || ''),
      card: { bg: [color, color], bgStyle: 'solid', color: '#FFFFFF' },
      logo: logo ? { image: 'qlogo', pos: 'tr', size: 0.08 } : undefined,
      footer: footer || undefined,
      music: { ...t.music, meter: '4/4', seed: Math.floor(Math.random() * 1e6) },
      export: { quality: 1080, fps: 30, vq: 'high' },
    };
  }
  async function make() {
    const job = buildJob();
    const map = new Map(files.map((f, i) => ['q' + i, f])); if (logo) map.set('qlogo', logo);
    closeModal('#quickModal');
    const b = busy('미리보기 만드는 중', '사진·영상에 자막과 음악을 붙이고 있어요', { cancellable: false });
    try {
      const r = await buildFromJob(job, async ref => map.get(ref) || null, t => b.set(null, t));
      if (el('qAutoSub').checked && genReady()) { try { b.set(null, '말소리 받아쓰는 중…'); await transcribeToSubs({ onStatus: t => b.set(null, t) }); } catch (e) { r.warnings.push('자동 자막: ' + e.message); } }
      refreshAll(); changed();
      b.close();
      setSimple(true);
      seekTo(0); play();
      toast(r.warnings.length ? `미리보기 완성 · 확인할 것: ${r.warnings.slice(0, 2).join(' / ')}` : '미리보기 완성! 마음에 들면 ⬇ 내보내기, 고치려면 🛠 고급 편집');
    } catch (e) { b.close(); toast('만들지 못했어요: ' + (e.message || e), true); }
  }
  function setSimple(on) {
    document.body.classList.toggle('simple', on);
    const btn = el('simpleToggle'); if (btn) btn.textContent = on ? '🛠 고급 편집 펼치기' : '🔽 간단히 보기';
    try { Platform.setPref('simple_mode', on ? '1' : '0'); } catch (e) { /* 저장 실패해도 화면은 바뀜 */ }
  }
  function init() {
    el('quickBtn').addEventListener('click', open);
    el('quickBtn2')?.addEventListener('click', open);
    el('simpleToggle').addEventListener('click', () => setSimple(!document.body.classList.contains('simple')));
    el('qPick').addEventListener('click', () => el('qFiles').click());
    el('qFiles').addEventListener('change', e => { files.push(...[...e.target.files].filter(f => /^(image|video)\//.test(f.type)).slice(0, 20 - files.length)); e.target.value = ''; renderThumbs(); });
    el('qLogo').addEventListener('change', e => { logo = e.target.files[0] || null; el('qLogoName').textContent = logo ? logo.name : '없음'; });
    el('qBack').addEventListener('click', () => show(Math.max(1, step - 1)));
    el('qNext').addEventListener('click', () => (step === 1 ? show(2) : make()));
    const drop = el('qDrop');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); files.push(...[...e.dataTransfer.files].filter(f => /^(image|video)\//.test(f.type)).slice(0, 20 - files.length)); renderThumbs(); });
    if (Platform.getPref('simple_mode') === '1') setSimple(true);
  }
  return { init, open, setSimple };
})();
document.addEventListener('DOMContentLoaded', () => { try { Quick.init(); } catch (e) { console.warn('빠른 만들기 초기화 실패', e); } });
