// 영상뚝딱 — 데스크톱 앱 (윈도우 / 맥)
const { app, BrowserWindow, Menu, Tray, Notification, nativeImage, dialog, ipcMain, shell, protocol, net, safeStorage, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const APP_NAME = '영상뚝딱';
const COMPANY = '(주)알앤케이그린월드';
const COPYRIGHT = `Copyright © ${new Date().getFullYear()} ${COMPANY}. All rights reserved.`;
const startHidden = process.argv.includes('--hidden');
const WWW = path.join(__dirname, '..', 'www');
const isMac = process.platform === 'darwin';
app.setName(APP_NAME);

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;
let dirty = false;
let keepRunning = false;   // 예약 작업이 있으면 창을 닫아도 알림 영역에서 계속
let quitting = false;
let tray = null;

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.avif': 'image/avif', '.heic': 'image/heic',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.ogv': 'video/ogg', '.3gp': 'video/3gpp',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.opus': 'audio/opus',
};

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 980, minHeight: 640,
    title: APP_NAME,
    backgroundColor: '#141617',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    show: false,
    webPreferences: {
      backgroundThrottling: false, // 창이 가려져도 예약·저장 작업이 느려지지 않게
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => { if (!startHidden) win.show(); });
  win.loadURL('app://ttukttak/index.html');

  // 외부 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) e.preventDefault(); });

  // 저장 안 한 작업이 있으면 닫기 전에 확인
  win.on('close', e => {
    if (!quitting && keepRunning) {
      // 예약 작업이 켜져 있으면 끄지 않고 알림 영역으로
      e.preventDefault();
      win.hide();
      if (process.platform === 'win32' && tray && !tray._shown) {
        tray._shown = true;
        tray.displayBalloon?.({ title: APP_NAME, content: '예약 작업을 위해 알림 영역에서 계속 실행 중입니다. 완전히 끄려면 아이콘을 오른쪽 클릭 → 종료.' });
      }
      return;
    }
    if (!dirty) return;
    const r = dialog.showMessageBoxSync(win, {
      type: 'question', buttons: ['저장하지 않고 닫기', '취소'], defaultId: 1, cancelId: 1,
      title: APP_NAME, message: '저장하지 않은 작업이 있습니다.', detail: '닫으면 지금 만든 장면 구성이 사라집니다. (💾 프로젝트 저장으로 보관할 수 있어요)',
    });
    if (r === 1) { e.preventDefault(); quitting = false; }
  });
}

function send(action) { if (win) win.webContents.send('menu', action); }

function buildMenu() {
  const cmd = isMac ? 'Cmd' : 'Ctrl';
  const template = [
    ...(isMac ? [{
      label: APP_NAME,
      submenu: [
        { label: `${APP_NAME} 정보`, click: about },
        { type: 'separator' },
        { label: 'AI 설정…', accelerator: 'Cmd+,', click: () => send('aiSettings') },
        { type: 'separator' },
        { label: '서비스', role: 'services' },
        { type: 'separator' },
        { label: `${APP_NAME} 숨기기`, role: 'hide' },
        { label: '기타 숨기기', role: 'hideOthers' },
        { label: '모두 보기', role: 'unhide' },
        { type: 'separator' },
        { label: `${APP_NAME} 종료`, role: 'quit' },
      ],
    }] : []),
    {
      label: '파일',
      submenu: [
        { label: '새 프로젝트', accelerator: `${cmd}+N`, click: () => send('new') },
        { label: '프로젝트 열기…', accelerator: `${cmd}+O`, click: () => send('openProject') },
        { label: '프로젝트 저장…', accelerator: `${cmd}+S`, click: () => send('saveProject') },
        { type: 'separator' },
        { label: '사진·영상·음악 가져오기…', accelerator: `${cmd}+I`, click: () => send('import') },
        { label: '동영상으로 저장(내보내기)…', accelerator: `${cmd}+E`, click: () => send('export') },
        ...(isMac ? [] : [{ type: 'separator' }, { label: '끝내기', accelerator: 'Alt+F4', role: 'quit' }]),
      ],
    },
    {
      label: '편집',
      submenu: [
        { label: '실행 취소', accelerator: `${cmd}+Z`, click: () => send('undo') },
        { label: '다시 실행', accelerator: isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y', click: () => send('redo') },
        { type: 'separator' },
        { label: '잘라내기', role: 'cut' },
        { label: '복사', role: 'copy' },
        { label: '붙여넣기', role: 'paste' },
        { label: '모두 선택', role: 'selectAll' },
        { type: 'separator' },
        { label: '✂ 지금 위치에서 자르기  (C)', click: () => send('split') },
        { label: '⇤ 앞부분 잘라내기  ([)', click: () => send('trimIn') },
        { label: '뒷부분 잘라내기 ⇥  (])', click: () => send('trimOut') },
        { label: '💬 자막 넣기  (S)', click: () => send('addSub') },
        { label: '🔗 영상 이어붙이기…', click: () => send('join') },
        { type: 'separator' },
        { label: '글자 화면 추가', accelerator: `${cmd}+T`, click: () => send('addText') },
        { label: '선택한 장면 복제', accelerator: `${cmd}+D`, click: () => send('dup') },
        { label: '선택한 장면 삭제', click: () => send('delete') },
        { label: '모든 장면 화질 향상', click: () => send('enhanceAll') },
      ],
    },
    {
      label: '재생',
      submenu: [
        { label: '재생 / 일시정지  (Space)', click: () => send('play') },
        { label: '처음으로  (Home)', click: () => send('home') },
      ],
    },
    {
      label: 'AI',
      submenu: [
        { label: '✨ 명령어로 자동 만들기', accelerator: `${cmd}+Enter`, click: () => send('auto') },
        { label: '🎨 AI로 사람·물건·영상 만들기…', accelerator: `${cmd}+G`, click: () => send('generate') },
        { label: '📈 업로드 도우미 (알고리즘 점검·제목·해시태그·썸네일)…', accelerator: `${cmd}+U`, click: () => send('publish') },
        { type: 'separator' },
        { label: '📺 시리즈 (같은 컨셉으로 다음 편)…', click: () => send('series') },
        { label: '⏰ 예약 만들기 (분·시간·일)…', click: () => send('schedule') },
        { label: '📦 용량 줄이기…', click: () => send('compress') },
        { type: 'separator' },
        { label: 'AI 설정 (API 키)…', click: () => send('aiSettings') },
      ],
    },
    {
      label: '보기',
      submenu: [
        { label: '크게', role: 'zoomIn', accelerator: `${cmd}+=` },
        { label: '작게', role: 'zoomOut' },
        { label: '원래 크기', role: 'resetZoom' },
        { type: 'separator' },
        { label: '미리보기 크게 보기 (F)', click: () => send('fullscreen') },
        { label: '전체 화면', role: 'togglefullscreen' },
        { label: '개발자 도구', role: 'toggleDevTools', accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I' },
      ],
    },
    {
      label: '창',
      submenu: [
        { label: '최소화', role: 'minimize' },
        { label: '닫기', role: 'close' },
      ],
    },
    {
      label: '도움말',
      submenu: [
        { label: '사용 방법 · 명령어 예시', accelerator: 'F1', click: () => send('help') },
        { label: '업데이트 확인', click: () => checkUpdates(true) },
        { label: '윈도우 시작 시 자동 실행 (예약용)', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: item => app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] }) },
        { label: 'Claude API 키 발급 (console.anthropic.com)', click: () => shell.openExternal('https://console.anthropic.com/settings/keys') },
        { label: 'Google AI 키 발급 (aistudio.google.com)', click: () => shell.openExternal('https://aistudio.google.com/apikey') },
        ...(isMac ? [] : [{ type: 'separator' }, { label: `${APP_NAME} 정보`, click: about }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function about() {
  dialog.showMessageBox(win, {
    type: 'info', title: `${APP_NAME} 정보`, message: `${APP_NAME} ${app.getVersion()}`,
    detail: `사진 넣고 명령어 한 줄이면 완성되는 홍보 영상 제작기\n\n${COPYRIGHT}\n본 프로그램의 저작권은 ${COMPANY}에 있으며 무단 복제·배포·개작을 금합니다.\n\nAI 편집: Claude (Anthropic)\nAI 생성·성우: Google Gemini / Imagen / Veo`,
    buttons: ['확인'],
  });
}

/* ---------- 알림 영역(트레이) ---------- */
function showWindow() { if (!win) createWindow(); else { win.show(); if (win.isMinimized()) win.restore(); win.focus(); } }
function setupTray() {
  if (tray) return;
  const img = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip(`${APP_NAME} — 예약 작업 실행 중`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `${APP_NAME} 열기`, click: showWindow },
    { type: 'separator' },
    { label: '종료', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showWindow);
}

/* ---------- 자동 업데이트 (회사 홈페이지에 새 버전을 올리면 자동 설치) ---------- */
let updater = null;
function checkUpdates(manual = false) {
  try {
    if (!updater) {
      updater = require('electron-updater').autoUpdater;
      updater.autoDownload = true;
      updater.on('update-downloaded', info => {
        const r = dialog.showMessageBoxSync(win, { type: 'info', buttons: ['지금 다시 시작해서 설치', '나중에'], defaultId: 0, title: APP_NAME, message: `새 버전 ${info.version} 이(가) 준비되었습니다.`, detail: '다시 시작하면 새 기능이 적용됩니다. (작업은 먼저 저장하세요)' });
        if (r === 0) { quitting = true; updater.quitAndInstall(); }
      });
    }
    updater.checkForUpdates().then(r => {
      if (manual && (!r || !r.isUpdateAvailable)) dialog.showMessageBox(win, { type: 'info', title: APP_NAME, message: '최신 버전을 쓰고 있습니다.', buttons: ['확인'] });
      else if (manual) dialog.showMessageBox(win, { type: 'info', title: APP_NAME, message: '새 버전을 내려받는 중입니다. 다 받으면 알려 드릴게요.', buttons: ['확인'] });
    }).catch(e => { if (manual) dialog.showMessageBox(win, { type: 'warning', title: APP_NAME, message: '업데이트를 확인하지 못했습니다.', detail: String(e.message || e).slice(0, 300), buttons: ['확인'] }); });
  } catch (e) { if (manual) dialog.showMessageBox(win, { type: 'warning', title: APP_NAME, message: '업데이트 기능을 쓸 수 없습니다.', detail: String(e), buttons: ['확인'] }); }
}

/* ---------- 비밀 키 보관 (운영체제 암호화) ---------- */
const secretFile = () => path.join(app.getPath('userData'), 'secrets.json');
function readSecrets() {
  try {
    const raw = JSON.parse(fs.readFileSync(secretFile(), 'utf8'));
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      const buf = Buffer.from(v.data, 'base64');
      out[k] = v.enc && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
    }
    return out;
  } catch (e) { return {}; }
}
function writeSecrets(obj) {
  const enc = safeStorage.isEncryptionAvailable();
  const raw = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!v) continue;
    raw[k] = { enc, data: (enc ? safeStorage.encryptString(v) : Buffer.from(v, 'utf8')).toString('base64') };
  }
  fs.mkdirSync(path.dirname(secretFile()), { recursive: true });
  fs.writeFileSync(secretFile(), JSON.stringify(raw), { mode: 0o600 });
}

function registerIpc() {
  ipcMain.handle('save-file', async (_e, { data, name, label, ext, kind }) => {
    const r = await dialog.showSaveDialog(win, {
      title: '저장', defaultPath: path.join(app.getPath(kind === 'videos' ? 'videos' : 'documents'), name),
      filters: [{ name: label, extensions: [ext] }], buttonLabel: '저장',
    });
    if (r.canceled || !r.filePath) return { canceled: true };
    await fs.promises.writeFile(r.filePath, Buffer.from(data));
    return { path: r.filePath, saved: true };
  });
  ipcMain.handle('open-files', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: '사진·영상·음악 가져오기', buttonLabel: '가져오기', properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '사진·영상·음악', extensions: Object.keys(MIME).map(x => x.slice(1)).concat(['ttuk']) },
        { name: '모든 파일', extensions: ['*'] },
      ],
    });
    if (r.canceled) return [];
    return Promise.all(r.filePaths.map(async p => ({ name: path.basename(p), type: MIME[path.extname(p).toLowerCase()] || '', data: await fs.promises.readFile(p) })));
  });
  ipcMain.handle('open-project', async () => {
    const r = await dialog.showOpenDialog(win, { title: '프로젝트 열기', buttonLabel: '열기', properties: ['openFile'], filters: [{ name: '영상뚝딱 프로젝트', extensions: ['ttuk'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    return { name: path.basename(r.filePaths[0]), data: await fs.promises.readFile(r.filePaths[0]) };
  });
  ipcMain.handle('show-item', (_e, p) => { if (p) shell.showItemInFolder(p); });
  ipcMain.handle('open-external', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
  ipcMain.handle('secret-get', (_e, k) => readSecrets()[k] || '');
  ipcMain.handle('secret-set', (_e, k, v) => { const s = readSecrets(); s[k] = v; writeSecrets(s); return true; });
  ipcMain.handle('http-get', async (_e, url, headers) => {
    if (!/^https:\/\/[\w.-]*(googleapis|googleusercontent)\.com\//.test(url)) return { status: 400, body: new Uint8Array() };
    const res = await net.fetch(url, { headers: headers || {}, redirect: 'follow' });
    return { status: res.status, body: new Uint8Array(await res.arrayBuffer()) };
  });
  ipcMain.on('dirty', (_e, d) => { dirty = !!d; });
  ipcMain.on('keep-running', (_e, on) => { keepRunning = !!on; if (keepRunning) setupTray(); });
  ipcMain.handle('choose-folder', async (_e, title) => {
    const r = await dialog.showOpenDialog(win, { title: title || '폴더 고르기', buttonLabel: '이 폴더 선택', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? '' : r.filePaths[0];
  });
  ipcMain.handle('list-folder', async (_e, dir) => {
    const names = await fs.promises.readdir(dir).catch(() => []);
    const out = [];
    for (const n of names) {
      const p = path.join(dir, n);
      const st = await fs.promises.stat(p).catch(() => null);
      if (st && st.isFile()) out.push({ path: p, name: n, size: st.size, mtime: st.mtimeMs });
    }
    return out;
  });
  ipcMain.handle('read-file', async (_e, p) => ({ data: await fs.promises.readFile(p), type: MIME[path.extname(p).toLowerCase()] || '' }));
  ipcMain.handle('write-file', async (_e, dir, name, data) => {
    const target = dir || app.getPath('videos');
    await fs.promises.mkdir(target, { recursive: true });
    let p = path.join(target, name), k = 1;
    while (fs.existsSync(p)) p = path.join(target, name.replace(/(\.[^.]+)$/, `(${++k})$1`));
    await fs.promises.writeFile(p, Buffer.from(data));
    return p;
  });
  ipcMain.handle('open-path', (_e, p) => shell.openPath(p));
  ipcMain.handle('notify', (_e, title, body) => { if (Notification.isSupported()) new Notification({ title, body }).show(); });
}

app.whenReady().then(() => {
  // app:// 로 화면 파일 제공
  protocol.handle('app', req => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(WWW, decodeURIComponent(pathname)));
    if (!file.startsWith(WWW)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // 마이크(직접 녹음)만 허용
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb, details) => {
    cb(permission === 'media' && (details.mediaTypes || []).every(t => t === 'audio'));
  });
  registerIpc();
  buildMenu();
  createWindow();
  if (startHidden) setupTray();
  if (app.isPackaged) setTimeout(() => checkUpdates(false), 15000);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('second-instance', showWindow);
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (!isMac && !keepRunning) app.quit(); });
