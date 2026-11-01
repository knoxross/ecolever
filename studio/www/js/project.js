/* 영상뚝딱 — 프로젝트 파일 (.ttuk)
 * 장면 구성 + 설정 + 넣은 사진·영상·음악·목소리를 파일 하나에 담아 저장합니다.
 * 구조: "TTUK1\n" + 헤더 길이(8바이트 문자열) + JSON 헤더 + 미디어 파일들을 이어붙인 내용
 */
'use strict';

const PROJECT_MAGIC = 'TTUK1\n';

async function buildProjectBlob() {
  const used = new Set();
  state.clips.forEach(c => { if (c.mediaId) used.add(c.mediaId); if (c.voiceId) used.add(c.voiceId); });
  if (S.bgmId) used.add(S.bgmId);
  if (S.logoId) used.add(S.logoId);
  // 타임라인에 안 쓴 미디어도 함께 보관
  state.media.forEach(m => used.add(m.id));
  const media = state.media.filter(m => used.has(m.id));
  const header = {
    app: '영상뚝딱', version: 1, savedAt: new Date().toISOString(),
    settings: S,
    clips: state.clips.map(stripClip),
    media: media.map(m => ({ id: m.id, type: m.type, role: m.role || '', name: m.name, mime: m.file.type || '', size: m.file.size })),
    command: $('#cmdInput')?.value || '',
  };
  const json = new TextEncoder().encode(JSON.stringify(header));
  const len = new TextEncoder().encode(String(json.length).padStart(8, '0'));
  return new Blob([PROJECT_MAGIC, len, json, ...media.map(m => m.file)], { type: 'application/octet-stream' });
}

/** 결과: header (미디어는 state 에 추가됨) */
async function readProjectFile(file, onProgress) {
  const head = new TextDecoder().decode(await file.slice(0, 14).arrayBuffer());
  if (!head.startsWith(PROJECT_MAGIC)) throw new Error('영상뚝딱 프로젝트 파일이 아닙니다.');
  const jsonLen = parseInt(head.slice(6, 14), 10);
  const header = JSON.parse(new TextDecoder().decode(await file.slice(14, 14 + jsonLen).arrayBuffer()));
  let off = 14 + jsonLen;
  // 기존 작업 정리
  pause();
  state.clips.forEach(disposeClip);
  state.clips = [];
  state.media.forEach(m => URL.revokeObjectURL(m.url));
  state.media = [];
  const idMap = new Map();
  for (let i = 0; i < header.media.length; i++) {
    const info = header.media[i];
    onProgress?.(i, header.media.length, info.name);
    const f = new File([file.slice(off, off + info.size)], info.name, { type: info.mime });
    off += info.size;
    const { added } = await loadFiles([f]);
    if (added[0]) { added[0].role = info.role || undefined; idMap.set(info.id, added[0].id); }
  }
  const mapId = id => (id ? idMap.get(id) || '' : '');
  Object.assign(S, header.settings, { bgmId: mapId(header.settings.bgmId), logoId: mapId(header.settings.logoId) });
  state.clips = header.clips
    .map(c => Object.assign(newClip(c.kind), c, { id: uid(), mediaId: c.kind === 'media' ? mapId(c.mediaId) : null, voiceId: mapId(c.voiceId) }))
    .filter(c => c.kind === 'text' || c.mediaId);
  state.selectedId = state.clips[0]?.id || null;
  state.time = 0;
  return header;
}
