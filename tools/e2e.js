'use strict';

/**
 * 端到端功能测试：通过 Chromium DevTools Protocol 驱动真实 Electron 应用。
 * 运行：node tools/e2e.js
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const USER_DATA = path.join(ROOT, '.e2e-data');
const EXPORT_FILE = path.join(USER_DATA, 'config-export.json');
const PORT = 9333;

const results = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

async function waitFor(fn, timeout = 15000, interval = 250) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeout) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(interval);
  }
  throw lastError || new Error('Timed out');
}

async function getTargets() {
  const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  if (!response.ok) throw new Error(`CDP HTTP ${response.status}`);
  return response.json();
}

async function capture(client, filename) {
  const shot = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const dir = path.join(ROOT, 'screenshots');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), Buffer.from(shot.data, 'base64'));
}

class CDP {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    await this.call('Runtime.enable');
    return this;
  }

  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      const detail =
        result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        'evaluation failed';
      throw new Error(detail);
    }
    return result.result?.value;
  }

  close() {
    try {
      this.socket.close();
    } catch {
      // ignore
    }
  }
}

function findStoreFile(root) {
  if (!fs.existsSync(root)) return null;
  const queue = [root];
  while (queue.length) {
    const current = queue.shift();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(full);
      else if (entry.name === 'calendar-data.json') return full;
    }
  }
  return null;
}

async function main() {
  if (!fs.existsSync(ELECTRON)) throw new Error(`Electron not found: ${ELECTRON}`);
  rmrf(USER_DATA);

  const child = spawn(
    ELECTRON,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${USER_DATA}`,
      '.',
    ],
    {
      cwd: ROOT,
      stdio: 'ignore',
      windowsHide: false,
      env: {
        ...process.env,
        CALENDAR_TEST_EXPORT: EXPORT_FILE,
        CALENDAR_TEST_IMPORT: EXPORT_FILE,
      },
    }
  );

  let mainClient = null;
  let widgetClient = null;

  try {
    await waitFor(getTargets, 20000, 300);
    const mainTarget = await waitFor(async () => {
      const targets = await getTargets();
      return targets.find(
        (target) => target.type === 'page' && target.url.includes('/renderer/index.html')
      );
    }, 20000, 300);

    mainClient = await new CDP(mainTarget.webSocketDebuggerUrl).connect();
    await waitFor(() => mainClient.evaluate('Boolean(window.__calendarTest)'), 10000, 200);

    const initial = await mainClient.evaluate('window.__calendarTest.stats()');
    check('应用启动并渲染月视图', initial.view === 'month' && initial.monthCells === 42, JSON.stringify(initial));

    await mainClient.evaluate("document.querySelector('#more-btn').click()");
    await sleep(250);
    await capture(mainClient, '10-app-menu.png');
    await mainClient.evaluate(
      "document.querySelector('#app-menu [data-action=\"export-config\"]').click()"
    );
    await sleep(700);
    const exported = fs.existsSync(EXPORT_FILE)
      ? JSON.parse(fs.readFileSync(EXPORT_FILE, 'utf8'))
      : null;
    check(
      '导出配置文件',
      Boolean(
        exported &&
          exported.app === 'morrow-calendar' &&
          exported.data &&
          exported.data.events.length === initial.events &&
          Array.isArray(exported.widgets)
      ),
      EXPORT_FILE
    );

    await mainClient.evaluate(`(() => {
      document.querySelector('#add-btn').click();
      document.querySelector('#event-title').value = '导入测试临时日程';
      document.querySelector('#event-save').click();
    })()`);
    await sleep(300);
    const beforeImport = await mainClient.evaluate('window.__calendarTest.stats()');
    check('导入前数据已被修改', beforeImport.events === initial.events + 1, JSON.stringify(beforeImport));

    await mainClient.evaluate(`(() => {
      document.querySelector('#more-btn').click();
      document.querySelector('#app-menu [data-action="import-config"]').click();
    })()`);
    await sleep(700);
    const confirmState = await mainClient.evaluate(`({
      open: !document.querySelector('#confirm-overlay').classList.contains('hidden'),
      title: document.querySelector('#confirm-title').textContent,
    })`);
    check('导入前弹出覆盖确认', confirmState.open && confirmState.title.includes('导入配置'), JSON.stringify(confirmState));

    await mainClient.evaluate(`document.querySelector('#confirm-ok').click()`);
    await sleep(1100);
    const afterImport = await mainClient.evaluate(`({
      stats: window.__calendarTest.stats(),
      hasTemp: document.body.innerText.includes('导入测试临时日程'),
    })`);
    check(
      '导入恢复配置并覆盖当前数据',
      afterImport.stats.events === initial.events &&
        afterImport.stats.calendars === initial.calendars &&
        afterImport.hasTemp === false,
      JSON.stringify(afterImport)
    );

    const future = new Date();
    future.setDate(future.getDate() + 3);
    const futureYmd = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(
      future.getDate()
    ).padStart(2, '0')}`;

    const addEventResult = await mainClient.evaluate(`(() => {
      document.querySelector('#add-btn').click();
      const set = (selector, value) => { document.querySelector(selector).value = value; };
      set('#event-title', 'E2E 测试日程');
      set('#event-start-date', ${JSON.stringify(futureYmd)});
      set('#event-end-date', ${JSON.stringify(futureYmd)});
      set('#event-start-time', '08:00');
      set('#event-end-time', '09:15');
      document.querySelector('#event-save').click();
      return {
        events: window.__calendarTest.stats().events,
        visible: document.body.innerText.includes('E2E 测试日程'),
        dialogOpen: window.__calendarTest.stats().dialogOpen,
      };
    })()`);
    check(
      '新建日程并写入月视图',
      addEventResult.events === initial.events + 1 && addEventResult.visible && !addEventResult.dialogOpen,
      JSON.stringify(addEventResult)
    );

    await sleep(500);
    const storePath = findStoreFile(USER_DATA);
    const stored = storePath ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : null;
    check(
      '日程持久化到本地 JSON',
      Boolean(stored && stored.events.some((event) => event.title === 'E2E 测试日程')),
      storePath || 'no file'
    );

    const searchCount = await mainClient.evaluate(`(() => {
      const input = document.querySelector('#search-input');
      input.value = 'E2E';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return document.querySelectorAll('.search-item').length;
    })()`);
    check('搜索可以找到日程', searchCount === 1, `结果 ${searchCount} 条`);
    await capture(mainClient, '08-search.png');

    const toggleResult = await mainClient.evaluate(`(() => {
      const before = document.querySelectorAll('.event-chip').length;
      document.querySelector('.cal-row').click();
      const hidden = document.querySelectorAll('.event-chip').length;
      document.querySelector('.cal-row').click();
      const restored = document.querySelectorAll('.event-chip').length;
      return { before, hidden, restored };
    })()`);
    check(
      '切换日历可见性会过滤日程',
      toggleResult.hidden < toggleResult.before && toggleResult.restored === toggleResult.before,
      JSON.stringify(toggleResult)
    );

    await mainClient.evaluate(`(() => {
      document.querySelector('#add-calendar-btn').click();
      document.querySelector('#calendar-name').value = 'E2E 日历';
    })()`);
    await sleep(300);
    await capture(mainClient, '09-calendar-dialog.png');
    const calendarResult = await mainClient.evaluate(`(() => {
      document.querySelector('#calendar-save').click();
      return {
        rows: document.querySelectorAll('.cal-row').length,
        visible: document.body.innerText.includes('E2E 日历'),
      };
    })()`);
    check(
      '新增日历',
      calendarResult.rows === initial.calendars + 1 && calendarResult.visible,
      JSON.stringify(calendarResult)
    );

    const deleteResult = await mainClient.evaluate(`(async () => {
      const input = document.querySelector('#search-input');
      input.value = 'E2E 测试日程';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.search-item').click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const opened = !document.querySelector('#event-overlay').classList.contains('hidden');
      document.querySelector('#event-delete').click();
      return {
        opened,
        events: window.__calendarTest.stats().events,
        stillVisible: document.body.innerText.includes('E2E 测试日程'),
      };
    })()`);
    check(
      '编辑器中删除日程',
      deleteResult.opened && deleteResult.events === initial.events && !deleteResult.stillVisible,
      JSON.stringify(deleteResult)
    );

    await mainClient.evaluate(`(() => {
      const input = document.querySelector('#search-input');
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);

    await mainClient.evaluate("window.__calendarTest.setView('week')");
    await sleep(400);
    const dragPoint = await mainClient.evaluate(`(() => {
      const scroller = document.querySelector('.time-scroll');
      scroller.scrollTop = 12 * 56;
      const column = document.querySelector('.day-column');
      const rect = column.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + (14 / 24) * rect.height,
        date: column.dataset.date,
      };
    })()`);
    await mainClient.call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: dragPoint.x,
      y: dragPoint.y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await mainClient.call('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: dragPoint.x,
      y: dragPoint.y + 56,
      button: 'none',
      buttons: 1,
    });
    await mainClient.call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: dragPoint.x,
      y: dragPoint.y + 56,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
    await sleep(400);
    const dragResult = await mainClient.evaluate(`({
      open: !document.querySelector('#event-overlay').classList.contains('hidden'),
      date: document.querySelector('#event-start-date').value,
      start: document.querySelector('#event-start-time').value,
      end: document.querySelector('#event-end-time').value,
    })`);
    check(
      '周视图拖拽创建时间区间',
      dragResult.open && dragResult.date === dragPoint.date && dragResult.start < dragResult.end,
      JSON.stringify(dragResult)
    );
    await mainClient.evaluate("document.querySelector('#event-cancel').click()");
    await mainClient.evaluate("window.__calendarTest.setView('month')");
    await sleep(300);

    await mainClient.evaluate(`(() => {
      document.querySelector('#widgets-btn').click();
    })()`);
    await sleep(400);
    const gallery = await mainClient.evaluate(`({
      cards: document.querySelectorAll('.wg-card').length,
      open: window.__calendarTest.stats().widgetGalleryOpen,
    })`);
    check('打开桌面小组件中心', gallery.cards === 4 && gallery.open, JSON.stringify(gallery));

    await mainClient.evaluate(`document.querySelector('.wg-toggle').click()`);
    await sleep(1200);

    const widgetTarget = await waitFor(async () => {
      const targets = await getTargets();
      return targets.find(
        (target) => target.type === 'page' && target.url.includes('widget.html') && target.url.includes('type=month')
      );
    }, 15000, 300);
    widgetClient = await new CDP(widgetTarget.webSocketDebuggerUrl).connect();
    await waitFor(() => widgetClient.evaluate('Boolean(window.__widgetTest)'), 8000, 200);

    const widgetStats = await widgetClient.evaluate('window.__widgetTest.stats()');
    check(
      '月历小组件渲染',
      widgetStats.type === 'month' && widgetStats.days === 42 && widgetStats.events === initial.events,
      JSON.stringify(widgetStats)
    );

    await widgetClient.evaluate("document.querySelector('#pin-btn').click()");
    await sleep(350);
    const pinned = await widgetClient.evaluate(
      "document.querySelector('#pin-btn').classList.contains('active')"
    );
    check('小组件置顶按钮生效', pinned === true);

    const syncDate = new Date();
    syncDate.setDate(syncDate.getDate() + 5);
    const syncYmd = `${syncDate.getFullYear()}-${String(syncDate.getMonth() + 1).padStart(2, '0')}-${String(
      syncDate.getDate()
    ).padStart(2, '0')}`;
    await mainClient.evaluate(`(() => {
      document.querySelector('#add-btn').click();
      const set = (selector, value) => { document.querySelector(selector).value = value; };
      set('#event-title', '同步验证日程');
      set('#event-start-date', ${JSON.stringify(syncYmd)});
      set('#event-end-date', ${JSON.stringify(syncYmd)});
      set('#event-start-time', '17:00');
      set('#event-end-time', '18:00');
      document.querySelector('#event-save').click();
    })()`);
    await sleep(800);
    const syncedStats = await widgetClient.evaluate('window.__widgetTest.stats()');
    check('主日历修改实时同步到小组件', syncedStats.events === initial.events + 1, JSON.stringify(syncedStats));
    await mainClient.evaluate(`(async () => {
      const input = document.querySelector('#search-input');
      input.value = '同步验证日程';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.search-item').click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      document.querySelector('#event-delete').click();
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(500);

    await widgetClient.evaluate(
      `window.desktop.widget.openMain({ date: ${JSON.stringify(futureYmd)}, view: 'day' })`
    );
    await sleep(500);
    const navigated = await mainClient.evaluate(
      `({ stats: window.__calendarTest.stats(), title: document.querySelector('#view-title').textContent })`
    );
    check(
      '从小组件跳转到主日历',
      navigated.stats.view === 'day' && navigated.title.includes(future.getDate()),
      JSON.stringify(navigated)
    );

    await widgetClient.evaluate("document.querySelector('#close-btn').click()");
    await sleep(800);
    const remainingTargets = await getTargets();
    const widgetStillThere = remainingTargets.some(
      (target) => target.type === 'page' && target.url.includes('widget.html')
    );
    check('关闭小组件', widgetStillThere === false);

    await mainClient.evaluate("document.querySelector('#widgets-btn').click()");
    await sleep(500);
    for (const type of ['month', 'today', 'upcoming', 'monthAgenda']) {
      await mainClient.evaluate(
        `document.querySelector('.wg-toggle[data-type="${type}"]').click()`
      );
      await sleep(900);
    }
    const widgetStorePath = path.join(USER_DATA, 'widgets.json');
    const widgetConfigs = JSON.parse(fs.readFileSync(widgetStorePath, 'utf8'));
    const sizes = {
      month: [360, 388],
      today: [360, 388],
      upcoming: [676, 344],
      monthAgenda: [676, 696],
    };
    const overlaps = [];
    for (let i = 0; i < widgetConfigs.length; i += 1) {
      for (let j = i + 1; j < widgetConfigs.length; j += 1) {
        const a = widgetConfigs[i];
        const b = widgetConfigs[j];
        const [aw, ah] = sizes[a.type];
        const [bw, bh] = sizes[b.type];
        if (a.x < b.x + bw && a.x + aw > b.x && a.y < b.y + bh && a.y + ah > b.y) {
          overlaps.push([a.type, b.type]);
        }
      }
    }
    check(
      '同时添加四种小组件且互不重叠',
      widgetConfigs.length === 4 && overlaps.length === 0,
      `overlaps=${JSON.stringify(overlaps)} positions=${JSON.stringify(
        widgetConfigs.map((item) => [item.type, item.x, item.y])
      )}`
    );

    await mainClient.evaluate("document.querySelector('#widget-close').click()");
    await sleep(300);
    await mainClient.evaluate(`(() => {
      document.querySelector('#more-btn').click();
      document.querySelector('#app-menu [data-action="export-config"]').click();
    })()`);
    await sleep(700);
    const fullBackup = JSON.parse(fs.readFileSync(EXPORT_FILE, 'utf8'));
    check(
      '导出配置包含小组件布局',
      Array.isArray(fullBackup.widgets) && fullBackup.widgets.length === 4,
      `widgets=${fullBackup.widgets?.length}`
    );

    await mainClient.evaluate("document.querySelector('#widgets-btn').click()");
    await sleep(400);
    await mainClient.evaluate(
      "document.querySelector('.wg-toggle[data-type=\"month\"]').click()"
    );
    await sleep(900);
    const afterRemoval = JSON.parse(fs.readFileSync(widgetStorePath, 'utf8'));
    check('小组件中心可以移除指定类型', afterRemoval.length === 3, `widgets=${afterRemoval.length}`);

    await mainClient.evaluate("document.querySelector('#widget-close').click()");
    await sleep(200);
    await mainClient.evaluate(`(() => {
      document.querySelector('#more-btn').click();
      document.querySelector('#app-menu [data-action="import-config"]').click();
    })()`);
    await sleep(700);
    await capture(mainClient, '11-import-confirm.png');
    const widgetConfirmText = await mainClient.evaluate(
      "document.querySelector('#confirm-text').textContent"
    );
    check(
      '导入确认提示小组件数量',
      widgetConfirmText.includes('4 个桌面小组件'),
      widgetConfirmText
    );

    await mainClient.evaluate("document.querySelector('#confirm-ok').click()");
    await sleep(1800);
    const restoredWidgets = JSON.parse(fs.readFileSync(widgetStorePath, 'utf8'));
    const restoredTargets = (await getTargets()).filter(
      (target) => target.type === 'page' && target.url.includes('widget.html')
    );
    check(
      '导入配置恢复小组件布局',
      restoredWidgets.length === 4 && restoredTargets.length === 4,
      `saved=${restoredWidgets.length} windows=${restoredTargets.length}`
    );
  } catch (error) {
    check('测试流程未抛出异常', false, error.stack || String(error));
  } finally {
    try {
      widgetClient?.close();
    } catch {
      // ignore
    }
    try {
      mainClient?.close();
    } catch {
      // ignore
    }
    try {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      child.kill();
    }
    await sleep(400);
    const failed = results.filter((item) => !item.ok);
    console.log('');
    console.log(`结果：${results.length - failed.length}/${results.length} 通过`);
    process.exitCode = failed.length === 0 ? 0 : 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
