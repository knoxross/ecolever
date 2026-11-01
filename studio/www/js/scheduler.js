/* 영상뚝딱 — 예약 만들기
 * 정해 둔 간격(분·시간·일, 또는 매일 몇 시)마다 자동으로 새 영상을 만들어 저장합니다.
 *  - 재료: 지정한 폴더에 새로 넣은 사진·영상 (데스크톱) / 명령어만으로 (사진 없이, AI 사진 생성 가능)
 *  - 모양: 시리즈 템플릿(선택) → 매번 다음 편 번호로
 *  - 결과: 지정한 저장 폴더 (데스크톱) / 다운로드 (웹·휴대폰)
 * 앱이 켜져 있는 동안 동작합니다. (데스크톱은 창을 닫아도 알림 영역에서 계속 동작하도록 설정 가능)
 */
'use strict';

const UNIT_MS = { min: 60e3, hour: 3600e3, day: 86400e3 };
const UNIT_LABEL = { min: '분', hour: '시간', day: '일' };
const MEDIA_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|mp4|mov|m4v|webm)$/i;

const Scheduler = (() => {
  let jobs = [];
  let timer = 0, running = false;
  const load = () => { try { jobs = JSON.parse(Platform.getPref('jobs') || '[]'); } catch (e) { jobs = []; } };
  const save = () => { Platform.setPref('jobs', JSON.stringify(jobs)); onChange(); };
  let onChange = () => {};

  function nextRun(job, from = Date.now()) {
    const every = Math.max(1, +job.every || 1);
    if (job.unit === 'day' && job.at) {
      const [hh, mm] = job.at.split(':').map(Number);
      const d = new Date(from);
      d.setHours(hh || 0, mm || 0, 0, 0);
      if (d.getTime() <= from) d.setDate(d.getDate() + 1);
      if (job.lastRun) { // N일마다: 마지막 실행 + N일 이후의 그 시각
        const min = new Date(job.lastRun); min.setDate(min.getDate() + every); min.setHours(hh || 0, mm || 0, 0, 0);
        if (min > d) return min.getTime();
      }
      return d.getTime();
    }
    return from + every * (UNIT_MS[job.unit] || UNIT_MS.hour);
  }
  function describe(job) {
    if (job.unit === 'day' && job.at) return `${+job.every > 1 ? job.every + '일마다' : '매일'} ${job.at}`;
    return `${job.every}${UNIT_LABEL[job.unit]}마다`;
  }
  function add(job) {
    job.id = job.id || uid();
    job.enabled = job.enabled !== false;
    job.used = job.used || [];
    job.runs = job.runs || 0;
    job.nextRun = job.firstRun ? Date.parse(job.firstRun) || nextRun(job) : nextRun(job);
    jobs.push(job); save();
  }
  function update(id, patch) { const j = jobs.find(x => x.id === id); if (!j) return; Object.assign(j, patch); if ('every' in patch || 'unit' in patch || 'at' in patch || patch.enabled) j.nextRun = nextRun(j); save(); }
  function remove(id) { jobs = jobs.filter(j => j.id !== id); save(); }

  async function tick() {
    if (running || state.busy || !$('#busyModal').hidden) return;
    const due = jobs.find(j => j.enabled && j.nextRun <= Date.now());
    if (!due) return;
    running = true;
    try { await runJob(due); } finally { running = false; }
  }

  async function runJob(job, manual = false) {
    const b = busy(`⏰ 예약 작업 실행 중: ${job.name}`, '지금 작업은 그대로 보관됩니다. 끝나면 원래 화면으로 돌아옵니다.');
    const started = Date.now();
    let msg = '', ok = false, file = '';
    try {
      const out = await withIsolatedProject(async () => {
        const tpl = job.templateId ? await SeriesDB.get(job.templateId) : null;
        let files = [], paths = [];
        if (job.source === 'folder') {
          if (!window.native?.listFolder || !job.folder) throw new Error('재료 폴더 기능은 데스크톱 앱에서만 쓸 수 있습니다.');
          const list = (await window.native.listFolder(job.folder)).filter(f => MEDIA_EXT.test(f.name) && !job.used.includes(f.path))
            .sort((a, z) => (job.order === 'name' ? a.name.localeCompare(z.name, 'ko') : a.mtime - z.mtime));
          const take = list.slice(0, Math.max(1, +job.perEpisode || 5));
          if (!take.length) throw new Error('재료 폴더에 아직 쓰지 않은 새 사진·영상이 없습니다.');
          for (const f of take) { const r = await window.native.readFile(f.path); files.push(new File([r.data], f.name, { type: r.type })); paths.push(f.path); }
        }
        b.set(0.02, '재료 불러오는 중…');
        const { added } = await loadFiles(files);
        if (tpl) await applyTemplateAssets(tpl);
        const n = tpl ? tpl.episode : job.runs + 1;
        if (added.length) {
          const plan = tpl ? await episodePlan(tpl, added, n, b.signal) : (aiReady() ? await planWithAI(job.command, b.signal).catch(() => planFromCommand(job.command)) : planFromCommand(job.command));
          applyPlan(plan);
        } else {
          const cmd = (tpl ? `${tpl.command || ''} ${tpl.titlePattern ? `'${tpl.titlePattern.replace(/\{n\}/g, n)}'` : ''}` : '') + ' ' + (job.command || '');
          await buildFromScratch(cmd.trim() || tpl?.name || '홍보 영상', { signal: b.signal, onStatus: t => b.set(null, t), images: job.aiImages !== false });
          if (tpl) { const st = tpl.style; Object.assign(S, { filter: st.filter }); }
        }
        if (genReady() && state.clips.some(c => (c.narration || '').trim())) await generateVoices(state.clips, { signal: b.signal, onStatus: t => b.set(null, t) });
        const name = `${(tpl ? `${tpl.name}-${n}편` : job.name).replace(/[\\/:*?"<>|]/g, '_')}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;
        const prod = await produceVideo({ signal: b.flag, onProgress: ({ pct, text }) => b.set(pct, text), name });
        b.set(1, '저장하는 중…');
        let where = '';
        if (window.native?.writeFile && job.outDir) where = await window.native.writeFile(job.outDir, prod.name, new Uint8Array(await prod.blob.arrayBuffer()));
        else { const r = await Platform.saveVideo(prod.blob, prod.name); where = r.path || r.message; }
        if (tpl) { tpl.episode = n + 1; await SeriesDB.put(tpl); }
        job.used.push(...paths);
        const qaNote = prod.qa ? (prod.qa.ok ? ` · 검수 통과(${prod.qa.checked}장면)` : ` · 검수 확인 필요: ${prod.qa.issues.join(', ')}`) : '';
        return { where, note: `${prod.name} (${(prod.blob.size / 1e6).toFixed(1)}MB)${qaNote}` };
      });
      ok = true; file = out.where; msg = out.note;
    } catch (e) {
      msg = e.message || String(e);
    } finally {
      b.close();
    }
    job.runs += ok ? 1 : 0;
    job.lastRun = started;
    job.last = { time: started, ok, msg, file };
    job.nextRun = nextRun(job);
    save();
    refreshAll();
    notify(ok ? `✅ ${job.name} 완성` : `⚠️ ${job.name} 실패`, msg);
    if (!ok && manual) toast(msg, true);
    return ok;
  }
  function notify(title, body) {
    toast(`${title} — ${body}`, title.startsWith('⚠'), 6000);
    try { if (window.Notification && Notification.permission === 'granted') new Notification(title, { body }); else if (window.Notification && Notification.permission !== 'denied') Notification.requestPermission(); } catch (e) { /* 무시 */ }
  }
  function start(cb) {
    load();
    onChange = cb || onChange;
    clearInterval(timer);
    timer = setInterval(tick, 20000);
    setTimeout(tick, 5000);
    if (window.native?.setKeepRunning) window.native.setKeepRunning(jobs.some(j => j.enabled));
  }
  return {
    start, add, update, remove, runJob, describe, nextRun,
    list: () => jobs,
    get: id => jobs.find(j => j.id === id),
    activeCount: () => jobs.filter(j => j.enabled).length,
  };
})();
