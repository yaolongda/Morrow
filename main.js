'use strict';

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  screen,
  dialog,
  shell,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { createSeedData } = require('./seed');

const SMOKE = process.env.CALENDAR_SMOKE === '1';
const SMOKE_DIR = process.env.CALENDAR_SMOKE_DIR || path.join(__dirname, 'screenshots');
const TEST_EXPORT_PATH = process.env.CALENDAR_TEST_EXPORT || null;
const TEST_IMPORT_PATH = process.env.CALENDAR_TEST_IMPORT || null;

const WIDGET_SIZES = {
  month: { width: 360, height: 388 },
  today: { width: 360, height: 388 },
  upcoming: { width: 676, height: 344 },
  monthAgenda: { width: 676, height: 696 },
};

const WIDGET_TITLES = {
  month: '月历',
  today: '今天',
  upcoming: '即将到来',
  monthAgenda: '月历与议程',
};

app.setName('朝暮');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let pendingNavigation = null;

let storePath = null;
let widgetsPath = null;
let windowStatePath = null;

let widgetConfigs = [];
let widgetWindows = new Map();
let saveWidgetsTimer = null;

if (SMOKE) {
  app.setPath('userData', path.join(__dirname, '.smoke-data'));
}

/* ------------------------------------------------------------------ */
/* 文件读写                                                            */
/* ------------------------------------------------------------------ */

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function dateStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

function ensureStore() {
  const data = readJSON(storePath, null);
  const valid =
    data &&
    Array.isArray(data.calendars) &&
    data.calendars.length > 0 &&
    Array.isArray(data.events);
  if (!valid) writeJSON(storePath, createSeedData());
}

function migrateLegacyData() {
  // 从旧版“日历”升级时，保留用户已有的日程与小组件布局。
  // 使用 --user-data-dir 的测试/隔离环境不做迁移。
  const defaultUserData = path.join(app.getPath('appData'), app.getName());
  if (path.resolve(app.getPath('userData')) !== path.resolve(defaultUserData)) return;
  const legacyDir = path.join(app.getPath('appData'), '日历');
  if (!fs.existsSync(legacyDir)) return;
  const targetDir = path.dirname(storePath);
  fs.mkdirSync(targetDir, { recursive: true });
  for (const file of ['calendar-data.json', 'widgets.json', 'window-state.json']) {
    const from = path.join(legacyDir, file);
    const to = path.join(targetDir, file);
    if (!fs.existsSync(from) || fs.existsSync(to)) continue;
    try {
      fs.copyFileSync(from, to);
    } catch {
      // 迁移失败时继续使用全新数据，不影响启动。
    }
  }
}

function loadWidgetConfigs() {
  const saved = readJSON(widgetsPath, []);
  if (!Array.isArray(saved)) return [];
  return saved.filter(
    (item) =>
      item &&
      typeof item.id === 'string' &&
      typeof item.type === 'string' &&
      WIDGET_SIZES[item.type]
  );
}

function persistWidgets() {
  writeJSON(widgetsPath, widgetConfigs);
}

function schedulePersistWidgets() {
  clearTimeout(saveWidgetsTimer);
  saveWidgetsTimer = setTimeout(persistWidgets, 350);
}

function broadcastWidgetsChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('widgets:changed');
  }
}

/* ------------------------------------------------------------------ */
/* 小组件窗口                                                          */
/* ------------------------------------------------------------------ */

function widgetPosition(type) {
  const { workArea } = screen.getPrimaryDisplay();
  const size = WIDGET_SIZES[type];
  const gap = 20;
  const right = workArea.x + workArea.width - size.width - 28;
  const bottom = workArea.y + workArea.height - size.height - 20;
  const existing = widgetConfigs
    .filter(
      (item) =>
        item &&
        typeof item.x === 'number' &&
        typeof item.y === 'number' &&
        WIDGET_SIZES[item.type]
    )
    .map((item) => ({
      x: item.x,
      y: item.y,
      width: Math.max(300, Math.round(item.width || WIDGET_SIZES[item.type].width)),
      height: Math.max(300, Math.round(item.height || WIDGET_SIZES[item.type].height)),
    }));

  const overlaps = (x, y) =>
    existing.some(
      (other) =>
        x < other.x + other.width + gap &&
        x + size.width + gap > other.x &&
        y < other.y + other.height + gap &&
        y + size.height + gap > other.y
    );

  const startX = Math.max(workArea.x + 16, right);
  const startY = Math.max(workArea.y + 16, Math.min(workArea.y + 64, bottom));
  const maxY = Math.max(startY, bottom);

  // 从右上角开始，先向下、再向左寻找空位，避免小组件互相覆盖。
  for (let x = startX; x + size.width > workArea.x + 20; x -= 24) {
    for (let y = startY; y <= maxY; y += 24) {
      if (!overlaps(x, y)) return { x, y };
    }
  }

  return { x: startX, y: startY };
}

function isPositionVisible(x, y, width, height) {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return (
      x + width > area.x &&
      x < area.x + area.width &&
      y + height > area.y &&
      y < area.y + area.height
    );
  });
}

function createWidgetWindow(config, options = {}) {
  const size = WIDGET_SIZES[config.type];
  if (!size) return null;

  const width = Math.max(300, Math.min(1600, Math.round(config.width || size.width)));
  const height = Math.max(300, Math.min(1400, Math.round(config.height || size.height)));
  config.width = width;
  config.height = height;

  const fallback = widgetPosition(config.type);
  const x = typeof config.x === 'number' ? config.x : fallback.x;
  const y = typeof config.y === 'number' ? config.y : fallback.y;
  const positioned =
    isPositionVisible(x, y, width, height) ? { x, y } : fallback;

  const win = new BrowserWindow({
    width,
    height,
    x: positioned.x,
    y: positioned.y,
    minWidth: 300,
    minHeight: 300,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: !config.locked,
    movable: !config.locked,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    title: `朝暮 · ${WIDGET_TITLES[config.type] || '小组件'}`,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  if (config.pin) win.setAlwaysOnTop(true, 'floating');
  win.__widgetId = config.id;

  widgetWindows.set(config.id, win);
  win.loadFile(path.join(__dirname, 'renderer', 'widget.html'), {
    query: {
      type: config.type,
      id: config.id,
      pin: config.pin ? '1' : '0',
      locked: config.locked ? '1' : '0',
      width: String(config.width),
      height: String(config.height),
    },
  });

  win.once('ready-to-show', () => {
    win.showInactive();
    if (config.pin) {
      win.setAlwaysOnTop(true, 'floating');
    } else if (options.reveal) {
      // 从小组件中心添加时短暂置顶，避免被主窗口遮住，让用户看到落点。
      win.setAlwaysOnTop(true, 'floating');
      win.moveTop();
      setTimeout(() => {
        if (!config.pin && !win.isDestroyed()) win.setAlwaysOnTop(false);
      }, 2600);
    }
  });

  win.on('moved', () => {
    const bounds = win.getBounds();
    config.x = bounds.x;
    config.y = bounds.y;
    schedulePersistWidgets();
  });

  win.on('resized', () => {
    const bounds = win.getBounds();
    config.x = bounds.x;
    config.y = bounds.y;
    config.width = bounds.width;
    config.height = bounds.height;
    schedulePersistWidgets();
  });

  win.on('closed', () => {
    widgetWindows.delete(config.id);
    if (!isQuitting) {
      widgetConfigs = widgetConfigs.filter((item) => item.id !== config.id);
      persistWidgets();
      broadcastWidgetsChanged();
    }
  });

  return win;
}

function addWidget(type, options = {}) {
  if (!WIDGET_SIZES[type] || widgetConfigs.length >= 10) return null;
  const position = widgetPosition(type);
  const config = {
    id: randomUUID(),
    type,
    x: options.x ?? position.x,
    y: options.y ?? position.y,
    width: options.width ?? WIDGET_SIZES[type].width,
    height: options.height ?? WIDGET_SIZES[type].height,
    pin: Boolean(options.pin),
    locked: Boolean(options.locked),
  };
  widgetConfigs.push(config);
  persistWidgets();
  createWidgetWindow(config, { reveal: true });
  broadcastWidgetsChanged();
  return config;
}

function removeWidget(id) {
  const win = widgetWindows.get(id);
  if (win && !win.isDestroyed()) {
    win.close();
  } else {
    widgetConfigs = widgetConfigs.filter((item) => item.id !== id);
    persistWidgets();
    broadcastWidgetsChanged();
  }
}

function importWidgets(configs) {
  const incoming = Array.isArray(configs) ? configs.slice(0, 10) : [];

  for (const win of [...widgetWindows.values()]) {
    if (!win.isDestroyed()) win.destroy();
  }
  widgetWindows.clear();
  widgetConfigs = [];

  for (const item of incoming) {
    if (!item || typeof item.type !== 'string' || !WIDGET_SIZES[item.type]) continue;
    const config = {
      id: randomUUID(),
      type: item.type,
      x: Number.isFinite(item.x) ? Math.round(item.x) : undefined,
      y: Number.isFinite(item.y) ? Math.round(item.y) : undefined,
      width: Number.isFinite(item.width)
        ? Math.max(300, Math.min(1600, Math.round(item.width)))
        : WIDGET_SIZES[item.type].width,
      height: Number.isFinite(item.height)
        ? Math.max(300, Math.min(1400, Math.round(item.height)))
        : WIDGET_SIZES[item.type].height,
      pin: Boolean(item.pin),
      locked: Boolean(item.locked),
    };
    if (config.x == null || config.y == null) {
      const position = widgetPosition(config.type);
      config.x = position.x;
      config.y = position.y;
    }
    widgetConfigs.push(config);
    createWidgetWindow(config);
  }

  persistWidgets();
  broadcastWidgetsChanged();
  return widgetConfigs.length;
}

function broadcastStore(data) {
  for (const win of widgetWindows.values()) {
    if (!win.isDestroyed()) win.webContents.send('store:changed', data);
  }
}

/* ------------------------------------------------------------------ */
/* 主窗口                                                              */
/* ------------------------------------------------------------------ */

function loadWindowState() {
  if (SMOKE) return { width: 1360, height: 860 };
  const saved = readJSON(windowStatePath, null);
  if (!saved || typeof saved.width !== 'number' || typeof saved.height !== 'number') {
    return { width: 1360, height: 860 };
  }
  if (typeof saved.x === 'number' && typeof saved.y === 'number') {
    const visible = screen.getAllDisplays().some((display) => {
      const area = display.workArea;
      return (
        saved.x + saved.width > area.x + 40 &&
        saved.x < area.x + area.width - 40 &&
        saved.y + saved.height > area.y + 40 &&
        saved.y < area.y + area.height - 40
      );
    });
    if (!visible) return { width: 1360, height: 860 };
  }
  return saved;
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  writeJSON(windowStatePath, mainWindow.getBounds());
}

function createWindow() {
  const bounds = loadWindowState();
  const overlayColor = '#f5f3f7';

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 1000,
    minHeight: 660,
    show: false,
    backgroundColor: '#ffffff',
    title: '朝暮',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: overlayColor,
      symbolColor: '#4b4b52',
      height: 52,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (SMOKE) runSmokeTest();
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const devTools =
      input.key === 'F12' ||
      (input.control && input.shift && input.key.toLowerCase() === 'i');
    if (devTools) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  if (SMOKE) {
    mainWindow.webContents.on('console-message', (_event, ...args) => {
      const detail = args.length > 1 ? args.slice(0, 4) : [args[0]];
      console.log('[renderer]', ...detail);
    });
  }

  mainWindow.on('close', (event) => {
    saveWindowState();
    if (!isQuitting && widgetConfigs.length > 0) {
      event.preventDefault();
      mainWindow.hide();
      mainWindow.webContents.send('app:hidden');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function showMainWindow(navigation = null) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingNavigation = navigation;
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (navigation) {
    mainWindow.webContents.send('app:navigate', navigation);
  }
}

/* ------------------------------------------------------------------ */
/* 托盘                                                                */
/* ------------------------------------------------------------------ */

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  let image = nativeImage.createFromPath(iconPath);
  if (!image.isEmpty()) image = image.resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip('朝暮');
  const menu = Menu.buildFromTemplate([
    { label: '打开朝暮', click: () => showMainWindow() },
    { label: '新建日程', click: () => showMainWindow({ action: 'new-event' }) },
    { type: 'separator' },
    {
      label: '显示桌面小组件',
      click: () => {
        for (const win of widgetWindows.values()) {
          if (!win.isDestroyed()) {
            win.showInactive();
            win.moveTop();
          }
        }
      },
    },
    { label: '添加小组件…', click: () => showMainWindow({ action: 'open-widgets' }) },
    { type: 'separator' },
    {
      label: '退出朝暮',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => showMainWindow());
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

function registerIpc() {
  ipcMain.handle('store:load', () => readJSON(storePath, null));

  ipcMain.handle('store:save', (_event, data) => {
    if (!data || typeof data !== 'object') return false;
    writeJSON(storePath, data);
    broadcastStore(data);
    return true;
  });

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    dataPath: storePath,
  }));

  ipcMain.handle('config:export', async (_event, data) => {
    if (
      !data ||
      typeof data !== 'object' ||
      !Array.isArray(data.calendars) ||
      !Array.isArray(data.events)
    ) {
      return { ok: false, error: '导出数据无效' };
    }

    let filePath = TEST_EXPORT_PATH;
    if (!filePath) {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: '导出朝暮配置',
        defaultPath: path.join(
          app.getPath('documents'),
          `朝暮配置-${dateStamp()}.json`
        ),
        filters: [{ name: '朝暮配置', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      filePath = result.filePath;
    }

    const payload = {
      app: 'morrow-calendar',
      version: 1,
      exportedAt: new Date().toISOString(),
      data,
      widgets: widgetConfigs,
    };
    try {
      writeJSON(filePath, payload);
      return { ok: true, filePath };
    } catch (error) {
      return { ok: false, error: `无法写入文件：${error.message}` };
    }
  });

  ipcMain.handle('config:import', async () => {
    let filePath = TEST_IMPORT_PATH;
    if (!filePath) {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: '导入朝暮配置',
        properties: ['openFile'],
        filters: [{ name: '朝暮配置', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePaths[0]) return { canceled: true };
      filePath = result.filePaths[0];
    }

    try {
      const stat = fs.statSync(filePath);
      if (stat.size > 20 * 1024 * 1024) {
        return { ok: false, error: '配置文件超过 20 MB，无法导入' };
      }
      const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      let data = null;
      let widgets = null;

      if (payload && typeof payload === 'object') {
        if (payload.data && typeof payload.data === 'object') {
          data = payload.data;
          widgets = Array.isArray(payload.widgets) ? payload.widgets : undefined;
        } else if (Array.isArray(payload.calendars) && Array.isArray(payload.events)) {
          data = payload;
        }
      }

      if (
        !data ||
        !Array.isArray(data.calendars) ||
        data.calendars.length === 0 ||
        !Array.isArray(data.events)
      ) {
        return { ok: false, error: '这不是有效的朝暮配置' };
      }

      return {
        ok: true,
        payload: { data, widgets },
        filePath,
      };
    } catch (error) {
      return { ok: false, error: `无法读取配置文件：${error.message}` };
    }
  });

  ipcMain.handle('app:open-data-folder', () => shell.openPath(path.dirname(storePath)));

  ipcMain.handle('app:open-external', async (_event, url) => {
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return false;
    try {
      await shell.openExternal(url);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('window:set-material', (_event, material) => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    if (!['none', 'mica', 'acrylic', 'tabbed', 'auto'].includes(material)) return false;
    try {
      mainWindow.setBackgroundMaterial(material);
      mainWindow.setBackgroundColor(material === 'none' ? '#ffffff' : '#00000000');
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.on('app:quit', () => {
    isQuitting = true;
    app.quit();
  });

  ipcMain.on('app:renderer-ready', (event) => {
    if (event.sender !== mainWindow?.webContents) return;
    if (pendingNavigation) {
      event.sender.send('app:navigate', pendingNavigation);
      pendingNavigation = null;
    }
  });

  ipcMain.handle('widgets:list', () =>
    widgetConfigs.map(({ id, type, x, y, width, height, pin, locked }) => ({
      id,
      type,
      x,
      y,
      width,
      height,
      pin,
      locked,
    }))
  );

  ipcMain.handle('widgets:add', (_event, type) => addWidget(type));

  ipcMain.handle('widgets:import', (_event, configs) => importWidgets(configs));

  ipcMain.handle('widgets:remove', (_event, id) => {
    removeWidget(id);
    return true;
  });

  ipcMain.on('widget:set-pin', (event, pin) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const config = widgetConfigs.find((item) => item.id === win.__widgetId);
    if (!config) return;
    config.pin = Boolean(pin);
    win.setAlwaysOnTop(config.pin, 'floating');
    if (config.pin) win.moveTop();
    persistWidgets();
    event.sender.send('widget:pin-changed', config.pin);
    broadcastWidgetsChanged();
  });

  ipcMain.handle('widget:set-size', (event, size) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    const config = widgetConfigs.find((item) => item.id === win.__widgetId);
    if (!config) return null;
    const width = Math.max(300, Math.min(1600, Math.round(Number(size?.width) || 0)));
    const height = Math.max(300, Math.min(1400, Math.round(Number(size?.height) || 0)));
    const bounds = win.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    const x = Math.min(
      Math.max(bounds.x, area.x + 8),
      Math.max(area.x + 8, area.x + area.width - width - 8)
    );
    const y = Math.min(
      Math.max(bounds.y, area.y + 8),
      Math.max(area.y + 8, area.y + area.height - height - 8)
    );
    win.setBounds({ x, y, width, height }, true);
    config.x = x;
    config.y = y;
    config.width = width;
    config.height = height;
    persistWidgets();
    broadcastWidgetsChanged();
    return { width, height };
  });

  ipcMain.handle('widget:set-lock', (event, locked) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    const config = widgetConfigs.find((item) => item.id === win.__widgetId);
    if (!config) return false;
    config.locked = Boolean(locked);
    win.setMovable(!config.locked);
    win.setResizable(!config.locked);
    persistWidgets();
    broadcastWidgetsChanged();
    event.sender.send('widget:lock-changed', config.locked);
    return true;
  });

  ipcMain.on('widget:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) win.close();
  });

  ipcMain.on('widget:open-main', (_event, payload = {}) => {
    showMainWindow({ action: 'widget', ...payload });
  });
}

/* ------------------------------------------------------------------ */
/* 冒烟测试                                                            */
/* ------------------------------------------------------------------ */

async function runSmokeTest() {
  fs.mkdirSync(SMOKE_DIR, { recursive: true });
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const captureMain = async (name) => {
    const image = await mainWindow.webContents.capturePage();
    fs.writeFileSync(path.join(SMOKE_DIR, `${name}.png`), image.toPNG());
    console.log(`[smoke] captured ${name}`);
  };

  try {
    await wait(1400);
    const views = [
      { view: 'month', name: '01-month' },
      { view: 'week', name: '02-week' },
      { view: 'day', name: '03-day' },
      { view: 'year', name: '04-year' },
    ];
    for (const shot of views) {
      await mainWindow.webContents.executeJavaScript(
        `window.__calendarTest && window.__calendarTest.setView(${JSON.stringify(shot.view)})`
      );
      await wait(150);
      await mainWindow.webContents.executeJavaScript(
        `(() => { const scroller = document.querySelector('.time-scroll'); if (scroller) scroller.scrollTop = 8 * 56; })()`
      );
      await wait(500);
      await captureMain(shot.name);
    }

    await mainWindow.webContents.executeJavaScript(
      `window.__calendarTest && window.__calendarTest.openEventDialog()`
    );
    await wait(500);
    await captureMain('05-dialog');

    await mainWindow.webContents.executeJavaScript(
      `document.querySelector('#event-cancel').click(); document.querySelector('#more-btn').click()`
    );
    await wait(400);
    await captureMain('10-app-menu');
    await mainWindow.webContents.executeJavaScript(
      `document.querySelector('#more-btn').click()`
    );
    await wait(200);

    await mainWindow.webContents.executeJavaScript(
      `window.__calendarTest && window.__calendarTest.openWidgetGallery()`
    );
    await wait(600);
    await captureMain('06-widget-gallery');

    for (const [index, type] of Object.keys(WIDGET_SIZES).entries()) {
      const config = addWidget(type);
      if (!config) continue;
      const win = widgetWindows.get(config.id);
      if (!win || win.isDestroyed()) continue;

      let ready = false;
      for (let attempt = 0; attempt < 24 && !ready; attempt += 1) {
        await wait(200);
        ready = await win.webContents.executeJavaScript(
          `Boolean(window.__widgetTest && document.querySelector('#widget-content') && document.querySelector('#widget-content').children.length > 0)`
        ).catch(() => false);
      }
      await wait(500);

      const image = await win.webContents.capturePage();
      fs.writeFileSync(path.join(SMOKE_DIR, `07-widget-${type}.png`), image.toPNG());
      console.log(`[smoke] captured widget ${type}`);

      if (index === 0) {
        const stats = await win.webContents.executeJavaScript(
          `window.__widgetTest ? window.__widgetTest.stats() : null`
        );
        console.log('[smoke] widget stats', JSON.stringify(stats));
      }
    }

    const stats = await mainWindow.webContents.executeJavaScript(
      `window.__calendarTest && window.__calendarTest.stats()`
    );
    console.log('[smoke] stats', JSON.stringify(stats));
  } catch (error) {
    console.error('[smoke] failed', error);
  } finally {
    await wait(300);
    isQuitting = true;
    app.quit();
  }
}

/* ------------------------------------------------------------------ */
/* 生命周期                                                            */
/* ------------------------------------------------------------------ */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());

  app.whenReady().then(() => {
    storePath = path.join(app.getPath('userData'), 'calendar-data.json');
    widgetsPath = path.join(app.getPath('userData'), 'widgets.json');
    windowStatePath = path.join(app.getPath('userData'), 'window-state.json');

    Menu.setApplicationMenu(null);
    app.setAppUserModelId('com.yaolongda.morrow');
    migrateLegacyData();
    ensureStore();

    widgetConfigs = loadWidgetConfigs();
    registerIpc();
    createWindow();
    createTray();

    for (const config of widgetConfigs) {
      createWidgetWindow(config);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else showMainWindow();
    });
  });

  app.on('before-quit', () => {
    isQuitting = true;
    clearTimeout(saveWidgetsTimer);
    persistWidgets();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
