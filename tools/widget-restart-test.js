'use strict';

/** 小组件重启持久化测试：添加/置顶/关闭应用后重新启动，检查小组件是否恢复。 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const USER_DATA = path.join(ROOT, '.widget-persist-data');
const PORT = 9335;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let failed = false;

function check(name, ok, detail = '') {
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

async function waitFor(fn, timeout = 20000, interval = 300) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await sleep(interval);
  }
  throw last || new Error('timeout');
}

async function targets() {
  const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return response.json();
}

class CDP {
  constructor(url) {
    this.url = url;
    this.id = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const pending = message.id && this.pending.get(message.id);
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
      const id = this.id++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

function launch() {
  return spawn(
    ELECTRON,
    [`--remote-debugging-port=${PORT}`, `--user-data-dir=${USER_DATA}`, '.'],
    { cwd: ROOT, stdio: 'ignore' }
  );
}

function kill(child) {
  spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
}

async function connectMain() {
  const target = await waitFor(async () => {
    const list = await targets();
    return list.find(
      (item) => item.type === 'page' && item.url.includes('/renderer/index.html')
    );
  });
  const client = await new CDP(target.webSocketDebuggerUrl).connect();
  await waitFor(() => client.evaluate('Boolean(window.__calendarTest)'));
  return client;
}

async function main() {
  fs.rmSync(USER_DATA, { recursive: true, force: true });

  let child = launch();
  let mainClient;
  let widgetClient;
  let widgetId = null;

  try {
    mainClient = await connectMain();
    await mainClient.evaluate(`document.querySelector('#widgets-btn').click()`);
    await sleep(400);
    await mainClient.evaluate(`document.querySelector('.wg-toggle').click()`);
    const widgetTarget = await waitFor(async () => {
      const list = await targets();
      return list.find((item) => item.type === 'page' && item.url.includes('widget.html'));
    });
    widgetClient = await new CDP(widgetTarget.webSocketDebuggerUrl).connect();
    await waitFor(() => widgetClient.evaluate('Boolean(window.__widgetTest)'));
    widgetId = (await widgetClient.evaluate('window.__widgetTest.stats()')).id;
    await widgetClient.evaluate(`document.querySelector('#pin-btn').click()`);
    await sleep(300);
    await widgetClient.evaluate(`window.desktop.widget.setSize(560, 460)`);
    await sleep(400);
    await widgetClient.evaluate(`window.desktop.widget.setLock(true)`);
    await sleep(500);

    const widgetPath = path.join(USER_DATA, 'widgets.json');
    const saved = JSON.parse(fs.readFileSync(widgetPath, 'utf8'));
    check(
      '小组件配置、尺寸与置顶状态已保存',
      saved.length === 1 &&
        saved[0].id === widgetId &&
        saved[0].pin === true &&
        saved[0].locked === true &&
        saved[0].width === 560 &&
        saved[0].height === 460,
      JSON.stringify(saved)
    );

    widgetClient.close();
    mainClient.close();
    kill(child);
    await sleep(1500);

    child = launch();
    mainClient = await connectMain();
    const restoredTarget = await waitFor(async () => {
      const list = await targets();
      return list.find(
        (item) => item.type === 'page' && item.url.includes('widget.html') && item.url.includes(widgetId)
      );
    }, 20000, 400);
    widgetClient = await new CDP(restoredTarget.webSocketDebuggerUrl).connect();
    await waitFor(() => widgetClient.evaluate('Boolean(window.__widgetTest)'));

    const stats = await widgetClient.evaluate('window.__widgetTest.stats()');
    const pinActive = await widgetClient.evaluate(
      "document.querySelector('#pin-btn').classList.contains('active')"
    );
    check(
      '重启后小组件恢复尺寸、锁定与置顶',
      stats.id === widgetId &&
        stats.type === 'month' &&
        stats.width === 560 &&
        stats.locked === true &&
        pinActive === true,
      JSON.stringify({ ...stats, pinActive })
    );

    const dataExists = fs.existsSync(path.join(USER_DATA, 'calendar-data.json'));
    check('重启后日程数据存在', dataExists);

    await widgetClient.evaluate(`document.querySelector('#close-btn').click()`);
    await sleep(700);
    const stillThere = (await targets()).some(
      (item) => item.type === 'page' && item.url.includes('widget.html')
    );
    check('关闭恢复后的小组件', stillThere === false);
  } catch (error) {
    check('持久化测试未抛出异常', false, error.stack || String(error));
  } finally {
    widgetClient?.close();
    mainClient?.close();
    kill(child);
    await sleep(300);
    console.log('');
    console.log(failed ? '结果：存在失败项' : '结果：全部通过');
    process.exitCode = failed ? 1 : 0;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
