'use strict';
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const USER_DATA = path.join(ROOT, '.feature-test-data');
const OUT = path.join(ROOT, 'screenshots');
const PORT = 9351;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let failures = 0;

function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

async function targets() {
  return (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
}

async function waitFor(fn, timeout = 20000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await sleep(250);
  }
  throw last || new Error('timeout');
}

class CDP {
  constructor(url) {
    this.url = url;
    this.id = 1;
    this.pending = new Map();
    this.errors = [];
  }
  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') {
        this.errors.push(message.params.exceptionDetails.text || 'exception');
      }
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    await this.call('Runtime.enable');
    await this.call('Page.enable');
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
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'eval');
    return result.result.value;
  }
  async shot(name) {
    const shot = await this.call('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(shot.data, 'base64'));
  }
  close() {
    try { this.ws.close(); } catch {}
  }
}

async function main() {
  fs.rmSync(USER_DATA, { recursive: true, force: true });
  const child = spawn(
    ELECTRON,
    [`--remote-debugging-port=${PORT}`, `--user-data-dir=${USER_DATA}`, '.'],
    { cwd: ROOT, stdio: 'ignore' }
  );
  let main;
  let widget;
  try {
    const target = await waitFor(async () => {
      const list = await targets();
      return list.find((item) => item.type === 'page' && item.url.includes('renderer/index.html'));
    });
    main = await new CDP(target.webSocketDebuggerUrl).connect();
    await waitFor(() => main.evaluate('Boolean(window.__calendarTest)'));
    await sleep(700);

    // 1. 周起始日
    await main.evaluate("window.__calendarTest.openSettings('general')");
    await sleep(300);
    await main.evaluate("document.querySelector('[data-weekstart=\"0\"]').click()");
    await sleep(400);
    const settingsState = await main.evaluate(`({
      weekStart: window.__calendarTest.stats().weekStart,
      firstWeekday: document.querySelector('.month-weekday')?.textContent,
      active: document.querySelector('[data-weekstart="0"]')?.classList.contains('active')
    })`);
    check('周起始日可改为周日', settingsState.weekStart === 0 && settingsState.firstWeekday === '周日' && settingsState.active, JSON.stringify(settingsState));

    // 2. 单休预设 + 休息日高亮
    await main.evaluate("document.querySelector('.settings-nav [data-section=schedule]').click()");
    await sleep(300);
    const beforeRest = await main.evaluate("window.__calendarTest.stats().restDays");
    await main.evaluate("document.querySelector('[data-preset=\"single\"]').click()");
    await sleep(500);
    const afterRest = await main.evaluate("window.__calendarTest.stats().restDays");
    check('单休预设会减少休息日', afterRest < beforeRest && afterRest > 0, `${beforeRest} -> ${afterRest}`);
    await main.evaluate("document.querySelector('[data-preset=\"satHalf\"]').click()");
    await sleep(500);
    const halfStats = await main.evaluate("window.__calendarTest.stats()");
    check('周六半天预设会标出半天', halfStats.halfDays > 0, JSON.stringify({ halfDays: halfStats.halfDays }));
    await main.shot('feature-schedule-single.png');

    // 3. 特殊日期：把今天改成补班
    const todayKey = await main.evaluate("(() => { const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })()");
    await main.evaluate(`document.querySelector('[data-override-date="${todayKey}"]').click()`);
    await sleep(400);
    const overrideState = await main.evaluate(`({
      dayType: document.querySelector('[data-override-date="${todayKey}"]')?.className,
      brief: document.querySelector('#settings-content')?.innerText.includes('特殊日期')
    })`);
    check('特殊日期可以覆盖休息/补班', overrideState.dayType.includes('work') || overrideState.dayType.includes('overridden'), JSON.stringify(overrideState));

    // 4. 外观：主题与强调色
    await main.evaluate("document.querySelector('.settings-nav [data-section=appearance]').click()");
    await sleep(250);
    await main.evaluate("document.querySelector('.theme-card[data-theme=\"paper\"]').click()");
    await sleep(300);
    await main.evaluate("document.querySelector('[data-accent=\"#34C759\"]').click()");
    await sleep(300);
    const appearance = await main.evaluate(`({
      theme: document.documentElement.dataset.theme,
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    })`);
    check('外观主题和强调色生效', appearance.theme === 'paper' && appearance.accent.toLowerCase() === '#34c759', JSON.stringify(appearance));
    await main.evaluate("document.querySelector('#settings-close').click()");
    await sleep(300);

    // 5. 批量创建计划
    const planStart = await main.evaluate(`(() => { const d=new Date(); d.setDate(d.getDate()-10); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })()`);
    const planEnd = await main.evaluate(`(() => { const d=new Date(); d.setDate(d.getDate()+20); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })()`);
    await main.evaluate("window.__calendarTest.openPlanEditor()");
    await sleep(300);
    const planType = await main.evaluate(`(() => {
      document.querySelector('#plan-title').value = '功能验证 · 研发计划';
      const start = document.querySelector('#plan-start');
      const end = document.querySelector('#plan-end');
      start.value = ${JSON.stringify(planStart)};
      end.value = ${JSON.stringify(planEnd)};
      start.dispatchEvent(new Event('change', { bubbles: true }));
      end.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#plan-progress').value = '30';
      document.querySelector('#plan-progress').dispatchEvent(new Event('input', { bubbles: true }));
      return document.querySelector('#plan-type').textContent;
    })()`);
    check('计划类型自动识别', planType.includes('中期计划'), planType);
    await main.shot('feature-plan-editor.png');
    await main.evaluate("document.querySelector('#plan-save').click()");
    await sleep(600);
    const planStats = await main.evaluate('window.__calendarTest.stats()');
    check(
      '计划创建并出现在月历',
      planStats.plans === 2 && planStats.planChips > 0,
      JSON.stringify(planStats)
    );
    await main.shot('feature-plan-month.png');

    // 6. 进度里程碑（编辑刚才创建的计划，而不是示例计划）
    const createdPlanId = await main.evaluate(
      "window.__app.getState().plans.find((plan) => plan.title === '功能验证 · 研发计划')?.id"
    );
    await main.evaluate(`window.__calendarTest.openPlanEditor(${JSON.stringify(createdPlanId)})`);
    await sleep(300);
    await main.evaluate(`(() => {
      document.querySelector('#plan-progress').value = '55';
      document.querySelector('#plan-progress').dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#plan-save').click();
    })()`);
    await sleep(500);
    const toastText = await main.evaluate("document.querySelector('#toast').textContent");
    check('进度里程碑触发励志古诗提示', toastText.includes('55%') || toastText.includes('50%'), toastText);
    const planWeek = await main.evaluate("window.__calendarTest.setView('week')");
    await sleep(500);
    const bandExists = await main.evaluate("Boolean(document.querySelector('.plan-band'))");
    check('周视图显示计划带', planWeek === 'week' && bandExists);
    await main.shot('feature-plan-week.png');

    // 7. 小组件：尺寸、锁定、休息日同步
    await main.evaluate("window.__calendarTest.setView('month'); window.__calendarTest.openWidgetGallery();");
    await sleep(700);
    await main.evaluate("document.querySelector('.wg-toggle[data-type=\"month\"]').click()");
    await sleep(1000);
    const widgetTarget = await waitFor(async () => {
      const list = await targets();
      return list.find((item) => item.type === 'page' && item.url.includes('type=month'));
    });
    widget = await new CDP(widgetTarget.webSocketDebuggerUrl).connect();
    await waitFor(() => widget.evaluate('Boolean(window.__widgetTest)'));
    await sleep(500);
    const widgetInitial = await widget.evaluate('window.__widgetTest.stats()');
    check(
      '小组件同步周起始日并标出休息日',
      widgetInitial.restDays > 0 && widgetInitial.weekdayFirst === '日',
      JSON.stringify(widgetInitial)
    );

    await widget.evaluate(`(() => {
      const card = document.querySelector('#widget-card');
      const event = new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100, button: 2 });
      card.dispatchEvent(event);
    })()`);
    await sleep(250);
    const menuVisible = await widget.evaluate("!document.querySelector('#widget-menu').classList.contains('hidden')");
    check('小组件右键菜单打开', menuVisible);
    await widget.shot('feature-widget-menu.png');

    await widget.evaluate("document.querySelector('[data-action=\"size-medium\"]').click()");
    await sleep(800);
    const resized = await widget.evaluate('window.__widgetTest.stats()');
    check('小组件可以调整尺寸', resized.width > widgetInitial.width, `${widgetInitial.width} -> ${resized.width}`);

    await widget.evaluate(`(() => {
      const card = document.querySelector('#widget-card');
      card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100, button: 2 }));
    })()`);
    await sleep(200);
    await widget.evaluate("document.querySelector('[data-action=\"lock\"]').click()");
    await sleep(500);
    const locked = await widget.evaluate(`({
      ...window.__widgetTest.stats(),
      lockedBody: document.body.dataset.locked
    })`);
    check(
      '小组件可以锁定位置和尺寸',
      locked.locked === true && locked.lockedBody === '1',
      JSON.stringify(locked)
    );
    await widget.shot('feature-widget-large.png');
    await widget.evaluate("window.desktop.widget.close()");
    await sleep(400);

    // 8. 显示农历、宜忌、星座
    await main.evaluate("document.querySelector('#widget-close').click(); window.__calendarTest.openSettings('display')");
    await sleep(300);
    await main.evaluate(`(() => {
      const toggle = (path, value) => {
        const input = document.querySelector('input[data-path="' + path + '"]');
        if (input && input.checked !== value) input.click();
      };
      toggle('display.almanac', true);
      toggle('display.zodiac', true);
    })()`);
    await sleep(500);
    const displayState = await main.evaluate(`({
      brief: document.querySelector('#day-brief').innerText,
      preview: document.querySelector('#settings-content').innerText
    })`);
    check(
      '黄历/星座显示设置生效',
      displayState.brief.includes('宜') &&
        /座/.test(displayState.brief) &&
        displayState.preview.includes('宜'),
      displayState.brief.slice(0, 80)
    );
    await main.shot('feature-display.png');

    await main.evaluate("document.querySelector('.settings-nav [data-section=about]').click()");
    await sleep(400);
    const aboutState = await main.evaluate(`({
      text: document.querySelector('#settings-content').innerText,
      logo: Boolean(document.querySelector('.about-logo'))
    })`);
    check(
      '关于页包含主页、版本和说明',
      aboutState.logo &&
        aboutState.text.includes('github.com/yaolongda/Morrow') &&
        aboutState.text.includes('版本') &&
        aboutState.text.includes('朝朝暮暮'),
      aboutState.text.slice(0, 120)
    );
    await main.shot('feature-about.png');
    await main.evaluate("document.querySelector('#settings-close').click()");
    await sleep(200);

    console.log('errors:', JSON.stringify([...(main.errors || []), ...(widget.errors || [])]));
  } catch (error) {
    failures += 1;
    console.error(error);
    console.log('errors:', JSON.stringify([...(main?.errors || []), ...(widget?.errors || [])]));
  } finally {
    widget?.close();
    main?.close();
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(300);
    console.log(failures === 0 ? 'ALL FEATURE CHECKS PASSED' : `${failures} CHECKS FAILED`);
    process.exitCode = failures === 0 ? 0 : 1;
  }
}

main();
