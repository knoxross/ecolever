/* 영상뚝딱 — 실행 환경별 기능 (윈도우·맥 데스크톱 앱 / 안드로이드 앱 / 웹 브라우저) */
'use strict';

const Platform = (() => {
  const native = window.native || null; // Electron preload
  const cap = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() ? window.Capacitor : null;
  const kind = native ? 'desktop' : cap ? 'android' : 'web';

  const prefKey = k => 'ttuk.' + k;
  function getPref(k) { try { return localStorage.getItem(prefKey(k)); } catch (e) { return null; } }
  function setPref(k, v) { try { if (v == null) localStorage.removeItem(prefKey(k)); else localStorage.setItem(prefKey(k), v); } catch (e) { /* 저장 불가 */ } }

  async function getSecret(k) {
    if (native) return await native.getSecret(k);
    return getPref('secret.' + k);
  }
  async function setSecret(k, v) {
    if (native) return await native.setSecret(k, v || '');
    setPref('secret.' + k, v || null);
  }

  /** 동영상 저장. 결과: { saved: bool, path?, message } */
  async function saveVideo(blob, name, onStatus) {
    if (native) {
      onStatus?.('저장할 위치를 고르세요…');
      const buf = new Uint8Array(await blob.arrayBuffer());
      const r = await native.saveVideo(buf, name);
      if (!r || r.canceled) return { saved: false, message: '저장을 취소했습니다.' };
      return { saved: true, path: r.path, message: `저장했습니다: ${r.path}` };
    }
    if (cap && window.CapPlugins) {
      const { Filesystem, Directory, Share } = window.CapPlugins;
      const path = `영상뚝딱/${name}`;
      let dir = Directory.Documents;
      try {
        await writeChunked(Filesystem, dir, path, blob, onStatus);
      } catch (e) {
        console.warn('Documents 저장 실패, 앱 폴더에 저장', e);
        dir = Directory.Cache;
        await writeChunked(Filesystem, dir, path, blob, onStatus);
      }
      const { uri } = await Filesystem.getUri({ directory: dir, path });
      lastAndroidUri = uri;
      const where = dir === Directory.Documents ? '내 파일 › 문서 › 영상뚝딱' : '앱 임시 폴더';
      return { saved: true, path: uri, message: `저장했습니다 (${where}). '공유' 로 갤러리·카카오톡·유튜브에 보낼 수 있어요.` };
    }
    // 웹 브라우저: 다운로드
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { saved: true, message: '다운로드 폴더에 저장했습니다.' };
  }
  let lastAndroidUri = null;
  async function writeChunked(Filesystem, directory, path, blob, onStatus) {
    const CH = 3 * 1024 * 1024; // 3MB 씩 나눠 쓰기 (메모리 절약)
    for (let off = 0, first = true; off < blob.size || first; off += CH, first = false) {
      const part = blob.slice(off, off + CH);
      const data = await blobToBase64(part);
      if (first) await Filesystem.writeFile({ directory, path, data, recursive: true });
      else await Filesystem.appendFile({ directory, path, data });
      onStatus?.(`휴대폰에 저장하는 중… ${Math.min(100, Math.round((off + CH) / blob.size * 100))}%`);
      if (blob.size === 0) break;
    }
  }
  function blobToBase64(b) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1] || '');
      r.onerror = rej;
      r.readAsDataURL(b);
    });
  }
  async function shareLast(title) {
    if (!cap || !lastAndroidUri) return;
    await window.CapPlugins.Share.share({ title, files: [lastAndroidUri], dialogTitle: '영상 보내기 / 저장하기' });
  }
  function showInFolder(p) { if (native && p) native.showItemInFolder(p); }
  function openExternal(url) {
    if (native) native.openExternal(url);
    else window.open(url, '_blank', 'noopener');
  }
  /** 데스크톱: 메뉴로 파일 열기 (파일 선택 창을 앱이 직접 띄움) */
  async function pickFiles() {
    if (!native) return null;
    const list = await native.openFiles();
    return (list || []).map(f => new File([f.data], f.name, { type: f.type || '' }));
  }
  function onMenu(cb) { if (native) native.onMenu(cb); }
  function setDirty(d) { if (native) native.setDirty(!!d); }

  return { kind, getPref, setPref, getSecret, setSecret, saveVideo, shareLast, showInFolder, openExternal, pickFiles, onMenu, setDirty, canShare: () => !!cap };
})();
