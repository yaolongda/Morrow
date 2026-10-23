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
    await main.evaluate("document.querySelector('[data-workmode]')?.scrollIntoView({ block: 'center' })");
    await sleep(300);
    await main.shot('feature-work-hours.png');

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
      const auto = document.querySelector('#plan-auto');
      const defaultAuto = auto.checked;
      if (auto.checked) {
        auto.checked = false;
        auto.dispatchEvent(new Event('change', { bubbles: true }));
      }
      document.querySelector('#plan-progress').value = '30';
      document.querySelector('#plan-progress').dispatchEvent(new Event('input', { bubbles: true }));
      return { type: document.querySelector('#plan-type').textContent, defaultAuto };
    })()`);
    check('计划类型自动识别', planType.type.includes('中期计划'), planType.type);
    check('新建计划默认按时间推进', planType.defaultAuto === true, JSON.stringify(planType));
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

    // 7. 重复日程：展开、编辑范围、删除单个实例
    await main.evaluate("window.__calendarTest.setView('month')");
    await sleep(400);
    const recurringSeed = await main.evaluate(`(() => {
      const pad = (n) => String(n).padStart(2, '0');
      const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      const from = new Date();
      from.setDate(from.getDate() - 40);
      const event = {
        id: 'test-recurring',
        calendarId: 'work',
        title: '重复验证 · 每日',
        start: ymd(from) + 'T07:00',
        end: ymd(from) + 'T08:00',
        allDay: false,
        location: '',
        notes: '',
        recurrence: { freq: 'daily', interval: 1, weekdays: [], until: null, exceptions: [] },
      };
      window.__app.getState().events.push(event);
      window.__app.render();
      return { chips: document.querySelectorAll('.event-chip.is-recurring').length };
    })()`);
    check('重复日程在月视图逐日展开', recurringSeed.chips >= 28, JSON.stringify(recurringSeed));
    await main.shot('feature-repeat-month.png');

    await main.evaluate("document.querySelector('.event-chip.is-recurring').click()");
    await sleep(350);
    await main.shot('feature-repeat-dialog.png');
    const recurringDialog = await main.evaluate(`({
      open: !document.querySelector('#event-overlay').classList.contains('hidden'),
      scopeVisible: !document.querySelector('#event-scope').classList.contains('hidden'),
      repeat: document.querySelector('#event-repeat').value,
      scope: document.querySelector('.scope-btn.active')?.dataset.scope,
      repeatLocked: document.querySelector('#event-repeat').disabled,
      deleteLabel: document.querySelector('#event-delete').textContent
    })`);
    check(
      '打开重复实例显示编辑范围',
      recurringDialog.open &&
        recurringDialog.scopeVisible &&
        recurringDialog.repeat === 'daily' &&
        recurringDialog.scope === 'single' &&
        recurringDialog.repeatLocked,
      JSON.stringify(recurringDialog)
    );

    await main.evaluate(`(() => {
      document.querySelector('#event-title').value = '重复验证 · 已更新';
      document.querySelector('.scope-btn[data-scope="series"]').click();
      document.querySelector('#event-save').click();
    })()`);
    await sleep(500);
    const seriesUpdated = await main.evaluate(`(() => {
      const event = window.__app.getState().events.find((item) => item.id === 'test-recurring');
      const chips = Array.from(document.querySelectorAll('.event-chip.is-recurring'));
      return {
        title: event?.title,
        freq: event?.recurrence?.freq,
        chips: chips.length,
        renamed:
          chips.some((node) => node.textContent.includes('已更新')) &&
          chips
            .filter((node) => node.textContent.includes('重复验证'))
            .every((node) => node.textContent.includes('已更新')),
      };
    })()`);
    check(
      '所有日程范围更新整个系列',
      seriesUpdated.title === '重复验证 · 已更新' &&
        seriesUpdated.freq === 'daily' &&
        seriesUpdated.chips > 0 &&
        seriesUpdated.renamed,
      JSON.stringify(seriesUpdated)
    );

    const deletedOccurrence = await main.evaluate(`(() => {
      const chip = document.querySelector('.event-chip.is-recurring');
      const date = chip.dataset.occurrenceDate;
      chip.click();
      return date;
    })()`);
    await sleep(300);
    await main.evaluate("document.querySelector('#event-delete').click()");
    await sleep(500);
    const afterSingleDelete = await main.evaluate(`(() => {
      const event = window.__app.getState().events.find((item) => item.id === 'test-recurring');
      const stillShown = Array.from(document.querySelectorAll('.event-chip')).some(
        (node) => node.dataset.occurrenceDate === ${JSON.stringify(deletedOccurrence)} &&
          node.textContent.includes('已更新')
      );
      return {
        exceptions: event?.recurrence?.exceptions || [],
        stillShown,
      };
    })()`);
    check(
      '删除单个重复实例只影响当天',
      afterSingleDelete.exceptions.includes(deletedOccurrence) && !afterSingleDelete.stillShown,
      JSON.stringify(afterSingleDelete)
    );

    await main.evaluate("document.querySelector('.event-chip.is-recurring').click()");
    await sleep(300);
    const weeklyUI = await main.evaluate(`(() => {
      document.querySelector('.scope-btn[data-scope="series"]').click();
      const select = document.querySelector('#event-repeat');
      select.value = 'weekly';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        visible: !document.querySelector('#event-weekdays').classList.contains('hidden'),
        active: Array.from(document.querySelectorAll('.repeat-weekday.active')).map(
          (node) => node.dataset.weekday
        ),
        summary: document.querySelector('#event-repeat-summary').textContent,
      };
    })()`);
    check(
      '每周重复可选择星期几',
      weeklyUI.visible && weeklyUI.active.length > 0 && weeklyUI.summary.includes('周'),
      JSON.stringify(weeklyUI)
    );
    await main.shot('feature-repeat-weekly.png');
    await main.evaluate("document.querySelector('#event-cancel').click()");
    await sleep(300);

    // 8. 法定节假日、上下班时间与下班庆祝判定
    const workdayChecks = await main.evaluate(`(() => {
      const schedule = {
        preset: 'double', restWeekdays: [0, 6], halfWeekdays: [], alternate: null,
        cycle: null, overrides: {}, followHolidays: true
      };
      const workHours = {
        enabled: true, mode: 'split',
        morning: { start: '09:00', end: '12:00' },
        afternoon: { start: '13:00', end: '18:00' },
        full: { start: '09:00', end: '18:00' },
        night: { start: '21:00', end: '06:00' },
        celebrate: true, lunch: true, off: true
      };
      const options = { schedule, weekStart: 1, workHours };
      const wednesday = new Date(2026, 9, 21);
      const friday = new Date(2026, 9, 23);
      const wedEvents = Workday.celebrationsForDate(wednesday, options);
      const friEvents = Workday.celebrationsForDate(friday, options);
      const status = Workday.statusFor(new Date(2026, 9, 21, 10, 0), options);
      const nightOptions = { ...options, workHours: { ...workHours, mode: 'night' } };
      const nightStatus = Workday.statusFor(new Date(2026, 9, 21, 22, 0), nightOptions);
      const nightEvents = Workday.celebrationsForDate(new Date(2026, 9, 22), nightOptions);
      return {
        wedKinds: wedEvents.map((item) => item.kind),
        wedIntensity: wedEvents.map((item) => item.intensity),
        friKinds: friEvents.map((item) => item.kind),
        status,
        nightState: nightStatus.state,
        nightKinds: nightEvents.map((item) => item.kind),
        oct1: Holidays.info('2026-10-01'),
        oct10: Holidays.info('2026-10-10'),
        holidayType: Schedule.dayType(schedule, new Date(2026, 9, 1), 1),
        makeupType: Schedule.dayType(schedule, new Date(2026, 9, 10), 1),
        overtimeType: Schedule.dayType(
          { ...schedule, overrides: { '2026-10-01': 'work' } },
          new Date(2026, 9, 1),
          1
        ),
        noHolidayType: Schedule.dayType({ ...schedule, followHolidays: false }, new Date(2026, 9, 1), 1),
        upcomingLunch: Workday.upcomingCelebration(new Date(2026, 9, 21, 12, 1), options)?.kind,
        upcomingOff: Workday.upcomingCelebration(new Date(2026, 9, 21, 18, 2), options)?.kind
      };
    })()`);
    check(
      '法定节假日与调休补班自动生效',
      workdayChecks.oct1?.type === 'holiday' &&
        workdayChecks.oct10?.type === 'workday' &&
        workdayChecks.holidayType === 'rest' &&
        workdayChecks.makeupType === 'work' &&
        workdayChecks.overtimeType === 'work' &&
        workdayChecks.noHolidayType === 'work',
      JSON.stringify({
        oct1: workdayChecks.oct1,
        oct10: workdayChecks.oct10,
        types: [
          workdayChecks.holidayType,
          workdayChecks.makeupType,
          workdayChecks.overtimeType,
          workdayChecks.noHolidayType,
        ]
      })
    );
    check(
      '午休/下班庆祝强度与夜班判定正确',
      workdayChecks.wedKinds.join(',') === 'lunch,off' &&
        workdayChecks.wedIntensity.join(',') === '1,2' &&
        workdayChecks.friKinds.includes('preHoliday') &&
        workdayChecks.status.state === 'work' &&
        workdayChecks.status.detail.includes('午休') &&
        workdayChecks.nightState === 'work' &&
        workdayChecks.nightKinds.join(',') === 'off' &&
        workdayChecks.upcomingLunch === 'lunch' &&
        workdayChecks.upcomingOff === 'off',
      JSON.stringify(workdayChecks)
    );

    const holidayCells = await main.evaluate(
      "document.querySelectorAll('.month-day.is-holiday').length"
    );
    check('月视图标出法定节假日', holidayCells > 0, `holiday cells=${holidayCells}`);

    await main.evaluate("window.__calendarTest.openSettings('schedule')");
    await sleep(300);
    await main.evaluate("document.querySelector('[data-workmode=\"night\"]').click()");
    await sleep(300);
    const workModeState = await main.evaluate(`({
      mode: window.__app.getState().settings.workHours.mode,
      nightInputs: document.querySelectorAll('[data-worktime^="night"]').length,
      holidayToggle: Boolean(document.querySelector('input[data-path="schedule.followHolidays"]')?.checked)
    })`);
    check(
      '设置中心可切换上下班班次',
      workModeState.mode === 'night' &&
        workModeState.nightInputs === 2 &&
        workModeState.holidayToggle,
      JSON.stringify(workModeState)
    );
    await main.evaluate("document.querySelector('[data-workmode=\"split\"]').click()");
    await sleep(250);
    await main.evaluate("document.querySelector('#settings-close').click()");
    await sleep(250);

    // 9. 计划自动进度与提醒节点
    const autoPlan = await main.evaluate(`(() => {
      const state = window.__app.getState();
      const pad = (n) => String(n).padStart(2, '0');
      const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      const now = new Date();
      const start = new Date(now); start.setDate(start.getDate() - 10);
      const end = new Date(now); end.setDate(end.getDate() + 10);
      const plan = {
        id: 'test-auto-plan', calendarId: 'work', title: '自动推进验证',
        start: ymd(start), end: ymd(end), progress: 0, autoProgress: true,
        milestonesSeen: [], reminders: [{ id: 'test-rem', date: ymd(now), text: '今天要做完的一件事' }],
        notes: ''
      };
      state.plans.push(plan);
      window.__app.render();
      return {
        progress: window.Plans.effectiveProgress(plan),
        node: Boolean(window.Plans.planNodeToday(plan)),
        reminders: window.Plans.remindersOn(ymd(now)).length
      };
    })()`);
    check(
      '计划进度按时间自动推进',
      autoPlan.progress >= 40 &&
        autoPlan.progress <= 60 &&
        autoPlan.node &&
        autoPlan.reminders === 1,
      JSON.stringify(autoPlan)
    );

    await main.evaluate("window.__calendarTest.openPlanEditor('test-auto-plan')");
    await sleep(350);
    const autoEditor = await main.evaluate(`({
      auto: document.querySelector('#plan-auto').checked,
      disabled: document.querySelector('#plan-progress').disabled,
      value: document.querySelector('#plan-progress-value').textContent,
      reminders: document.querySelectorAll('.plan-reminder-row').length
    })`);
    check(
      '计划编辑器支持自动进度与节点',
      autoEditor.auto &&
        autoEditor.disabled &&
        parseInt(autoEditor.value, 10) >= 40 &&
        autoEditor.reminders === 1,
      JSON.stringify(autoEditor)
    );
    await main.shot('feature-plan-auto.png');
    await main.evaluate("document.querySelector('#plan-cancel').click()");
    await sleep(250);

    const reminderVisible = await main.evaluate("window.__calendarTest.showReminders()");
    await sleep(350);
    const reminderState = await main.evaluate(`({
      heading: document.querySelector('#reminder-heading').textContent,
      list: document.querySelector('#reminder-list').innerText,
      poem: document.querySelector('#reminder-poem').textContent
    })`);
    check(
      '计划节点当天显示温和提醒卡',
      reminderVisible &&
        reminderState.heading.includes('今天要做完的一件事') &&
        reminderState.list.includes('自动推进验证') &&
        reminderState.poem.includes('「'),
      JSON.stringify(reminderState)
    );
    await main.shot('feature-reminder.png');
    await main.evaluate("window.__calendarTest.dismissReminders()");
    await sleep(250);

    // 10. 小组件：尺寸、锁定、休息日同步
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

    await widget.evaluate("window.desktop.widget.setSize(560, 460)");
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

    await main.evaluate("document.querySelector('.wg-toggle[data-type=\"today\"]').click()");
    await sleep(1000);
    const todayTarget = await waitFor(async () => {
      const list = await targets();
      return list.find((item) => item.type === 'page' && item.url.includes('type=today'));
    });
    const todayWidget = await new CDP(todayTarget.webSocketDebuggerUrl).connect();
    await waitFor(() => todayWidget.evaluate('Boolean(window.__widgetTest)'));
    await sleep(500);
    const todayWidgetState = await todayWidget.evaluate(`(() => {
      const rows = Array.from(document.querySelectorAll('[data-event-id]'));
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const todayKey = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
      return {
        rows: rows.length,
        todayOccurrence: rows.some((row) => row.dataset.occurrenceDate === todayKey),
        recurringVisible: rows.some((row) => row.title.includes('重复验证')),
      };
    })()`);
    check(
      '今天小组件展开重复日程',
      todayWidgetState.rows > 0 &&
        todayWidgetState.todayOccurrence &&
        todayWidgetState.recurringVisible,
      JSON.stringify(todayWidgetState)
    );

    const todayBase = await todayWidget.evaluate('window.__widgetTest.stats()');
    await todayWidget.shot('feature-widget-today.png');
    check(
      '小组件可自由缩放并跟随主题',
      todayBase.sizePresets === 0 &&
        todayBase.resizeGrip &&
        todayBase.theme === 'paper' &&
        todayBase.workline.includes('休息'),
      JSON.stringify({
        sizePresets: todayBase.sizePresets,
        resizeGrip: todayBase.resizeGrip,
        theme: todayBase.theme,
        workline: todayBase.workline
      })
    );

    await todayWidget.evaluate("window.desktop.widget.setSize(760, 420)");
    await sleep(800);
    const todayWide = await todayWidget.evaluate('window.__widgetTest.stats()');
    check(
      '小组件布局随尺寸自适应',
      todayWide.width >= 720 && todayWide.size === 'lg' && todayWide.layout === 'wide',
      JSON.stringify({ width: todayWide.width, size: todayWide.size, layout: todayWide.layout })
    );

    const celebrationState = await todayWidget.evaluate("window.__widgetTest.celebrate('preHoliday')");
    await sleep(500);
    check(
      '今天小组件播放下班庆祝',
      celebrationState.visible &&
        celebrationState.kind === 'preHoliday' &&
        celebrationState.line.length > 0,
      JSON.stringify(celebrationState)
    );
    await todayWidget.shot('feature-widget-celebration.png');
    await todayWidget.evaluate("window.__widgetTest.dismissCelebration()");
    await sleep(600);

    await todayWidget.evaluate("window.desktop.widget.close()");
    todayWidget.close();
    await sleep(400);

    // 11. 显示农历、宜忌、星座
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
