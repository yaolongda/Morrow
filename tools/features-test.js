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
        const details = message.params.exceptionDetails || {};
        this.errors.push(
          details.exception?.description || details.text || 'exception'
        );
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

    await main.evaluate("document.querySelector('.theme-card[data-theme=\"night\"]')?.click()");
    await sleep(400);
    const nightState = await main.evaluate(`(() => {
      const parse = (value) => (String(value).match(/\\d+/g) || []).slice(0, 3).map(Number);
      const luminance = (rgb) => rgb.length >= 3
        ? (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255
        : 1;
      return {
        theme: document.documentElement.dataset.theme,
        cards: document.querySelectorAll('.theme-card[data-theme]').length,
        bgLum: luminance(parse(getComputedStyle(document.querySelector('.main-view')).backgroundColor)),
        textLum: luminance(parse(getComputedStyle(document.body).color)),
        rhythmBg: getComputedStyle(document.querySelector('#today-rhythm')).backgroundColor
      };
    })()`);
    check(
      '夜色主题覆盖主界面',
      nightState.theme === 'night' &&
        nightState.cards >= 4 &&
        nightState.bgLum < 0.2 &&
        nightState.textLum > 0.6,
      JSON.stringify(nightState)
    );
    await main.shot('feature-night-theme.png');
    await main.evaluate("document.querySelector('#settings-close').click()");
    await sleep(400);
    await main.shot('feature-night-main.png');
    await main.evaluate("window.__calendarTest.openSettings('appearance')");
    await sleep(300);
    await main.evaluate("document.querySelector('.theme-card[data-theme=\"paper\"]').click()");
    await sleep(300);
    await main.evaluate("document.querySelector('#settings-close').click()");    await sleep(300);

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

    // 固定到 2026 年 10 月（国庆节所在月份），避免测试依赖运行当天所在月份是否有法定节假日
    await main.evaluate("window.__calendarTest.setDate('2026-10-15')");
    await sleep(300);
    const holidayCells = await main.evaluate(
      "document.querySelectorAll('.month-day.is-holiday').length"
    );
    check('月视图标出法定节假日', holidayCells > 0, `holiday cells=${holidayCells}`);
    await main.evaluate(`window.__calendarTest.setDate(${JSON.stringify(todayKey)})`);
    await sleep(200);

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

    // 10. 日程提醒、全天折叠、撤销/重做、回收站、此后全部
    const reminderSetup = await main.evaluate(`(() => {
      const state = window.__app.getState();
      const pad = (n) => String(n).padStart(2, '0');
      const now = new Date();
      const start = new Date(now.getTime() + 20 * 60000);
      const end = new Date(start.getTime() + 30 * 60000);
      const fmt = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
      state.events.push({
        id: 'test-reminder', calendarId: 'work', title: '提醒验证',
        start: fmt(start), end: fmt(end), allDay: false, location: '', notes: '',
        recurrence: null, reminder: { minutes: 15, system: true }
      });
      window.__app.render();
      const item = window.__calendarTest.collectReminders().find((r) => r.eventId === 'test-reminder');
      return { at: item?.at, system: item?.system, title: item?.title };
    })()`);
    const reminderMinutesAhead = (Date.parse(reminderSetup.at) - Date.now()) / 60000;
    check(
      '日程提醒按提前时间计算',
      reminderSetup.title === '提醒验证' &&
        reminderSetup.system === true &&
        reminderMinutesAhead > 3 &&
        reminderMinutesAhead < 7,
      JSON.stringify({ ...reminderSetup, minutesAhead: reminderMinutesAhead })
    );

    const reminderCard = await main.evaluate(`(() => {
      const item = window.__calendarTest.collectReminders().find((r) => r.eventId === 'test-reminder');
      const shown = window.__calendarTest.fireEventReminder(item);
      return {
        shown,
        title: document.querySelector('#event-reminder-title').textContent,
        time: document.querySelector('#event-reminder-time').textContent
      };
    })()`);
    check(
      '应用内日程提醒卡可以弹出',
      reminderCard.shown &&
        reminderCard.title === '提醒验证' &&
        reminderCard.time.length > 0,
      JSON.stringify(reminderCard)
    );
    await main.evaluate("document.querySelector('#event-reminder-dismiss').click()");
    await sleep(250);

    await main.evaluate(`window.desktop.reminders.sync([{
      key: 'test-scheduler-' + Date.now(),
      eventId: 'test-reminder',
      occurrenceDate: ${JSON.stringify(todayKey)},
      title: '调度提醒验证',
      body: '由主进程定时触发',
      at: new Date(Date.now() + 1500).toISOString(),
      system: false
    }])`);
    let schedulerReminder = { open: false, title: '' };
    for (let attempt = 0; attempt < 30 && !schedulerReminder.open; attempt += 1) {
      await sleep(500);
      schedulerReminder = await main.evaluate(`({
        open: !document.querySelector('#event-reminder-overlay').classList.contains('hidden'),
        title: document.querySelector('#event-reminder-title').textContent,
        visible: document.visibilityState,
        overlays: [...document.querySelectorAll('.overlay:not(.hidden)')].map((node) => node.id)
      })`);
    }
    check(
      '主进程定时提醒在后台也能触发',
      schedulerReminder.open && schedulerReminder.title === '调度提醒验证',
      JSON.stringify(schedulerReminder)
    );
    await main.evaluate("document.querySelector('#event-reminder-dismiss').click()");
    await sleep(250);

    await main.evaluate("window.__calendarTest.setView('week')");
    await sleep(400);
    const allDaySetup = await main.evaluate(`(() => {
      const state = window.__app.getState();
      const key = ${JSON.stringify(todayKey)};
      for (let index = 0; index < 4; index += 1) {
        state.events.push({
          id: 'test-allday-' + index, calendarId: 'work', title: '全天折叠' + index,
          start: key + 'T00:00', end: key + 'T23:59', allDay: true,
          location: '', notes: '', recurrence: null, reminder: null
        });
      }
      window.__app.render();
      return {
        toggle: document.querySelector('.allday-more')?.textContent || '',
        chips: document.querySelectorAll('.allday-chip').length
      };
    })()`);
    check(
      '全天日程过多时自动折叠',
      allDaySetup.toggle.includes('还有'),
      JSON.stringify(allDaySetup)
    );
    const allDayExpandedState = await main.evaluate(`(() => {
      document.querySelector('.allday-more')?.click();
      return {
        toggle: document.querySelector('.allday-more')?.textContent || '',
        chips: document.querySelectorAll('.allday-chip').length
      };
    })()`);
    check(
      '全天日程可以展开',
      allDayExpandedState.toggle.includes('收起') &&
        allDayExpandedState.chips > allDaySetup.chips,
      JSON.stringify(allDayExpandedState)
    );
    await main.evaluate("document.querySelector('.allday-more')?.click()");
    await sleep(200);

    await main.evaluate("window.__calendarTest.setView('month'); window.__calendarTest.openEventDialog()");
    await sleep(300);
    await main.evaluate(`(() => {
      document.querySelector('#event-title').value = '撤销验证';
      document.querySelector('#event-start-date').value = ${JSON.stringify(todayKey)};
      document.querySelector('#event-end-date').value = ${JSON.stringify(todayKey)};
      document.querySelector('#event-start-time').value = '19:00';
      document.querySelector('#event-end-time').value = '20:00';
      document.querySelector('#event-save').click();
    })()`);
    await sleep(450);
    const undoBefore = await main.evaluate(
      "window.__app.getState().events.filter((e) => e.title === '撤销验证').length"
    );
    await main.evaluate("window.__calendarTest.undo()");
    await sleep(350);
    const undoAfter = await main.evaluate(
      "window.__app.getState().events.filter((e) => e.title === '撤销验证').length"
    );
    await main.evaluate("window.__calendarTest.redo()");
    await sleep(350);
    const redoAfter = await main.evaluate(
      "window.__app.getState().events.filter((e) => e.title === '撤销验证').length"
    );
    check(
      '日程支持撤销与重做',
      undoBefore === 1 && undoAfter === 0 && redoAfter === 1,
      JSON.stringify({ undoBefore, undoAfter, redoAfter })
    );

    await main.evaluate("window.__calendarTest.openEventDialog()");
    await sleep(300);
    await main.evaluate(`(() => {
      document.querySelector('#event-title').value = '键盘撤销验证';
      document.querySelector('#event-start-date').value = ${JSON.stringify(todayKey)};
      document.querySelector('#event-end-date').value = ${JSON.stringify(todayKey)};
      document.querySelector('#event-start-time').value = '20:00';
      document.querySelector('#event-end-time').value = '21:00';
      document.querySelector('#event-save').click();
    })()`);
    await sleep(400);
    await main.evaluate(
      "document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))"
    );
    await sleep(350);
    const keyboardUndo = await main.evaluate(
      "window.__app.getState().events.filter((e) => e.title === '键盘撤销验证').length"
    );
    await main.evaluate(
      "document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }))"
    );
    await sleep(350);
    const keyboardRedo = await main.evaluate(
      "window.__app.getState().events.filter((e) => e.title === '键盘撤销验证').length"
    );
    check(
      'Ctrl+Z / Ctrl+Shift+Z 快捷键生效',
      keyboardUndo === 0 && keyboardRedo === 1,
      JSON.stringify({ keyboardUndo, keyboardRedo })
    );

    await main.evaluate("window.__calendarTest.openPlanEditor()");
    await sleep(300);
    await main.evaluate(`(() => {
      document.querySelector('#plan-title').value = '撤销计划验证';
      document.querySelector('#plan-save').click();
    })()`);
    await sleep(450);
    const planBeforeUndo = await main.evaluate(
      "window.__app.getState().plans.filter((plan) => plan.title === '撤销计划验证').length"
    );
    await main.evaluate("window.__calendarTest.undo()");
    await sleep(350);
    const planAfterUndo = await main.evaluate(
      "window.__app.getState().plans.filter((plan) => plan.title === '撤销计划验证').length"
    );
    await main.evaluate("window.__calendarTest.redo()");
    await sleep(350);
    const planAfterRedo = await main.evaluate(
      "window.__app.getState().plans.filter((plan) => plan.title === '撤销计划验证').length"
    );
    check(
      '计划编辑也支持撤销与重做',
      planBeforeUndo === 1 && planAfterUndo === 0 && planAfterRedo === 1,
      JSON.stringify({ planBeforeUndo, planAfterUndo, planAfterRedo })
    );
    await main.evaluate(`(() => {
      const state = window.__app.getState();
      state.events = state.events.filter((event) => event.title !== '键盘撤销验证');
      state.plans = state.plans.filter((plan) => plan.title !== '撤销计划验证');
      window.__app.render();
    })()`);
    await sleep(300);

    await main.evaluate(`(() => {
      const chip = [...document.querySelectorAll('.event-chip')].find((node) =>
        node.textContent.includes('撤销验证')
      );
      chip?.click();
    })()`);
    await sleep(300);
    await main.evaluate("document.querySelector('#event-delete').click()");
    await sleep(450);
    const trashAfterDelete = await main.evaluate("window.__calendarTest.trashState()");
    check(
      '删除日程进入回收站',
      trashAfterDelete.some((entry) => entry.title === '撤销验证'),
      JSON.stringify(trashAfterDelete.map((entry) => entry.title))
    );

    await main.evaluate("window.__calendarTest.openSettings('trash')");
    await sleep(350);
    const trashRows = await main.evaluate("document.querySelectorAll('.trash-row').length");
    await main.evaluate("document.querySelector('[data-trash-restore]').click()");
    await sleep(450);
    const restoredState = await main.evaluate(`({
      rows: document.querySelectorAll('.trash-row').length,
      restored: window.__app.getState().events.filter((e) => e.title === '撤销验证').length
    })`);
    check(
      '回收站可以恢复日程',
      trashRows > 0 && restoredState.restored === 1,
      JSON.stringify({ trashRows, ...restoredState })
    );
    await main.evaluate("document.querySelector('#settings-close').click()");
    await sleep(250);

    const followingSetup = await main.evaluate(`(() => {
      const state = window.__app.getState();
      const pad = (n) => String(n).padStart(2, '0');
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - 5);
      const fmt = (d, time) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' +
        pad(d.getDate()) + 'T' + time;
      state.events.push({
        id: 'test-following', calendarId: 'work', title: '此后验证',
        start: fmt(start, '08:00'), end: fmt(start, '09:00'), allDay: false,
        location: '', notes: '', reminder: null,
        recurrence: { freq: 'daily', interval: 1, weekdays: [], until: null, exceptions: [] }
      });
      window.__calendarTest.setView('month');
      window.__app.render();
      return { today: ${JSON.stringify(todayKey)} };
    })()`);
    await sleep(350);
    await main.evaluate(`(() => {
      const chip = [...document.querySelectorAll('.event-chip')].find((node) =>
        node.dataset.occurrenceDate === ${JSON.stringify(todayKey)} &&
        node.textContent.includes('此后验证')
      );
      chip?.click();
    })()`);
    await sleep(300);
    await main.evaluate(`(() => {
      document.querySelector('#event-title').value = '此后验证 · 新';
      document.querySelector('.scope-btn[data-scope="following"]').click();
      document.querySelector('#event-save').click();
    })()`);
    await sleep(450);
    const followingState = await main.evaluate(`(() => {
      const state = window.__app.getState();
      const oldSeries = state.events.find((event) => event.id === 'test-following');
      const newSeries = state.events.find((event) => event.title === '此后验证 · 新');
      const todayChips = [...document.querySelectorAll('.event-chip')].filter(
        (node) => node.dataset.occurrenceDate === ${JSON.stringify(todayKey)} &&
          node.textContent.includes('此后验证')
      );
      return {
        until: oldSeries?.recurrence?.until,
        newStart: newSeries?.start,
        newFreq: newSeries?.recurrence?.freq,
        todayTitles: todayChips.map((node) => node.textContent.trim())
      };
    })()`);
    check(
      '重复日程支持从此日期往后修改',
      followingState.until < followingSetup.today &&
        followingState.newStart?.startsWith(followingSetup.today) &&
        followingState.newFreq === 'daily' &&
        followingState.todayTitles.some((title) => title.includes('新')),
      JSON.stringify(followingState)
    );

    await main.evaluate(`(() => {
      const chip = [...document.querySelectorAll('.event-chip')].find((node) =>
        node.dataset.occurrenceDate === ${JSON.stringify(todayKey)} &&
        node.textContent.includes('此后验证 · 新')
      );
      chip?.click();
    })()`);
    await sleep(300);
    await main.evaluate(`(() => {
      document.querySelector('.scope-btn[data-scope="following"]').click();
      document.querySelector('#event-delete').click();
    })()`);
    await sleep(300);
    const followingConfirm = await main.evaluate(
      "!document.querySelector('#confirm-overlay').classList.contains('hidden')"
    );
    await main.evaluate("document.querySelector('#confirm-ok').click()");
    await sleep(450);
    const afterFollowingDelete = await main.evaluate(`({
      newSeries: window.__app.getState().events.filter((event) => event.title === '此后验证 · 新').length,
      trash: window.__calendarTest.trashState().some((entry) => entry.title === '此后验证 · 新')
    })`);
    check(
      '删除此后日程并进入回收站',
      followingConfirm &&
        afterFollowingDelete.newSeries === 0 &&
        afterFollowingDelete.trash,
      JSON.stringify(afterFollowingDelete)
    );

    await main.evaluate(`(() => {
      const state = window.__app.getState();
      state.events = state.events.filter(
        (event) =>
          !/^test-(allday|reminder|following)/.test(event.id) &&
          event.title !== '撤销验证' &&
          event.title !== '此后验证 · 新'
      );
      window.__app.render();
    })()`);
    await sleep(300);

    // 11. 节假日扩展、班次模板、批量特殊日期、计划归档与自定义里程碑
    const holidayImportCount = await main.evaluate(`window.__calendarTest.importHolidayData({
      2027: {
        holidays: { '2027-01-01': 'New Year,元旦,1' },
        workdays: { '2027-01-09': 'New Year,元旦,1' }
      }
    })`);
    const holidayImportState = await main.evaluate(`({
      count: Object.keys(window.__app.getState().settings.holidayData).length,
      holiday: window.Holidays.info('2027-01-01'),
      workday: window.Holidays.info('2027-01-09'),
      dayType: Schedule.dayType(window.__app.getState().settings.schedule, new Date(2027, 0, 1), 1)
    })`);
    check(
      '节假日 JSON 可扩展自定义年份',
      holidayImportCount === 2 &&
        holidayImportState.count === 2 &&
        holidayImportState.holiday?.name === '元旦' &&
        holidayImportState.workday?.type === 'workday' &&
        holidayImportState.dayType === 'rest',
      JSON.stringify({ holidayImportCount, ...holidayImportState })
    );

    await main.evaluate("window.__calendarTest.openSettings('schedule')");
    await sleep(350);
    await main.evaluate("document.querySelector('[data-action=\"reset-holidays\"]').click()");
    await sleep(350);
    const holidayResetState = await main.evaluate(`({
      count: Object.keys(window.__app.getState().settings.holidayData).length,
      info: window.Holidays.info('2027-01-01')
    })`);
    check(
      '恢复内置节假日会清空自定义数据',
      holidayResetState.count === 0 && holidayResetState.info === null,
      JSON.stringify(holidayResetState)
    );

    await main.evaluate("document.querySelector('[data-workmode=\"night\"]').click()");
    await sleep(300);
    await main.evaluate(`(() => {
      document.querySelector('#shift-template-name').value = '夜班 21-06';
      document.querySelector('[data-shift-save]').click();
    })()`);
    await sleep(350);
    const templateId = await main.evaluate(
      "window.__app.getState().settings.shiftTemplates[0]?.id"
    );
    await main.evaluate("document.querySelector('[data-workmode=\"split\"]').click()");
    await sleep(300);
    await main.evaluate(`(() => {
      const select = document.querySelector('#shift-template-select');
      select.value = ${JSON.stringify(templateId || '')};
      document.querySelector('[data-shift-apply]').click();
    })()`);
    await sleep(350);
    const shiftTemplateState = await main.evaluate(`({
      mode: window.__app.getState().settings.workHours.mode,
      templates: window.__app.getState().settings.shiftTemplates.length
    })`);
    check(
      '班次模板可以保存并一键切换',
      shiftTemplateState.mode === 'night' && shiftTemplateState.templates === 1,
      JSON.stringify(shiftTemplateState)
    );
    await main.evaluate(`(() => {
      const select = document.querySelector('#shift-template-select');
      select.value = ${JSON.stringify(templateId || '')};
      document.querySelector('[data-shift-delete]').click();
    })()`);
    await sleep(300);
    const templateDeleted = await main.evaluate(
      "window.__app.getState().settings.shiftTemplates.length"
    );
    check('班次模板可以删除', templateDeleted === 0, `templates=${templateDeleted}`);
    await main.evaluate("document.querySelector('[data-workmode=\"split\"]').click()");
    await sleep(250);

    await main.evaluate(`(() => {
      document.querySelector('#batch-start').value = '2026-12-20';
      document.querySelector('#batch-end').value = '2026-12-22';
      document.querySelector('[data-batch-override="work"]').click();
    })()`);
    await sleep(400);
    const batchWorkState = await main.evaluate(`(() => {
      const overrides = window.__app.getState().settings.schedule.overrides;
      return ['2026-12-20', '2026-12-21', '2026-12-22'].map((key) => overrides[key]);
    })()`);
    await main.evaluate("document.querySelector('[data-batch-override=\"clear\"]').click()");
    await sleep(350);
    const batchClearState = await main.evaluate(`(() => {
      const overrides = window.__app.getState().settings.schedule.overrides;
      return ['2026-12-20', '2026-12-21', '2026-12-22'].filter((key) => overrides[key]).length;
    })()`);
    check(
      '特殊日期支持批量标记与清除',
      batchWorkState.join(',') === 'work,work,work' && batchClearState === 0,
      JSON.stringify({ batchWorkState, batchClearState })
    );

    await main.evaluate(`(() => {
      const state = window.__app.getState();
      const today = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const fmt = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      const end = new Date(today);
      end.setDate(end.getDate() + 12);
      state.plans.push({
        id: 'test-archive-plan', title: '归档验证计划', calendarId: 'work',
        start: fmt(today), end: fmt(end), progress: 20, autoProgress: false,
        archived: false, milestonesSeen: [], reminders: [], milestoneMessages: [], notes: ''
      });
      window.__app.render();
    })()`);
    await main.evaluate("document.querySelector('.settings-nav [data-section=plans]').click()");
    await sleep(350);
    await main.evaluate(`(() => {
      const row = [...document.querySelectorAll('.settings-plan-row')].find((node) =>
        node.textContent.includes('归档验证计划')
      );
      row?.querySelector('[data-plan-archive]')?.click();
    })()`);
    await sleep(400);
    const archivedState = await main.evaluate(`({
      archived: window.__app.getState().plans.find((plan) => plan.id === 'test-archive-plan')?.archived,
      active: window.Plans.active(window.__app.getState().plans).some((plan) => plan.id === 'test-archive-plan')
    })`);
    await main.evaluate("document.querySelector('[data-plan-filter=\"archived\"]').click()");
    await sleep(350);
    await main.evaluate(`(() => {
      const row = [...document.querySelectorAll('.settings-plan-row')].find((node) =>
        node.textContent.includes('归档验证计划')
      );
      row?.querySelector('[data-plan-archive]')?.click();
    })()`);
    await sleep(350);
    const unarchivedState = await main.evaluate(
      "window.__app.getState().plans.find((plan) => plan.id === 'test-archive-plan')?.archived"
    );
    check(
      '计划可以归档、筛选与恢复',
      archivedState.archived === true &&
        archivedState.active === false &&
        unarchivedState === false,
      JSON.stringify({ archivedState, unarchivedState })
    );
    await main.evaluate(`(() => {
      const state = window.__app.getState();
      state.plans = state.plans.filter((plan) => plan.id !== 'test-archive-plan');
      window.__app.render();
      document.querySelector('#settings-close')?.click();
    })()`);
    await sleep(250);

    await main.evaluate(`window.__calendarTest.openPlanEditor(${JSON.stringify(createdPlanId)})`);
    await sleep(300);
    await main.evaluate(`(() => {
      document.querySelector('#plan-progress').value = '40';
      document.querySelector('#plan-progress').dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-milestone="50"]').value = '这一程，稳稳地走。';
      document.querySelector('#plan-save').click();
    })()`);
    await sleep(450);
    await main.evaluate(`window.__calendarTest.openPlanEditor(${JSON.stringify(createdPlanId)})`);
    await sleep(300);
    await main.evaluate(`(() => {
      document.querySelector('#plan-progress').value = '55';
      document.querySelector('#plan-progress').dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#plan-save').click();
    })()`);
    await sleep(450);
    const customMilestoneToast = await main.evaluate(
      "document.querySelector('#toast').textContent"
    );
    check(
      '计划里程碑文案可以自定义',
      customMilestoneToast.includes('这一程，稳稳地走。'),
      customMilestoneToast
    );

    // 12. 1.2 新增能力：周数、标签色、ICS、搜索范围、历史导航、任务、农历、模板、快捷键、周期计划
    await main.evaluate("window.__calendarTest.openSettings('display')");
    await sleep(300);
    await main.evaluate(`(() => {
      const input = document.querySelector('input[data-path="display.weekNumbers"]');
      if (input && !input.checked) input.click();
    })()`);
    await sleep(350);
    await main.evaluate("document.querySelector('#settings-close').click()");
    await main.evaluate("window.__calendarTest.setView('month')");
    await sleep(400);
    const weekNumberState = await main.evaluate(`({
      labels: document.querySelectorAll('.weeknum-column span').length,
      first: document.querySelector('.weeknum-column span')?.textContent || '',
      monthView: document.querySelector('.month-view')?.classList.contains('with-weeknums')
    })`);
    await main.evaluate("window.__calendarTest.setView('week')");
    await sleep(350);
    const weekBadge = await main.evaluate(
      "document.querySelector('.weeknum-badge')?.textContent || ''"
    );
    check(
      '月/周视图显示 ISO 周数',
      weekNumberState.labels === 6 &&
        /^W\d+$/.test(weekNumberState.first) &&
        weekNumberState.monthView &&
        /^W\d+$/.test(weekBadge),
      JSON.stringify({ ...weekNumberState, weekBadge })
    );
    await main.evaluate("window.__calendarTest.openSettings('display')");
    await sleep(250);
    await main.evaluate(`(() => {
      const input = document.querySelector('input[data-path="display.weekNumbers"]');
      if (input && input.checked) input.click();
    })()`);
    await sleep(300);
    await main.evaluate("document.querySelector('#settings-close').click()");
    await main.evaluate("window.__calendarTest.setView('month')");
    await sleep(300);

    await main.evaluate("window.__calendarTest.openEventDialog()");
    await sleep(300);
    await main.evaluate(`(() => {
      document.querySelector('#event-title').value = '标签颜色验证';
      document.querySelector('#event-start-date').value = ${JSON.stringify(todayKey)};
      document.querySelector('#event-end-date').value = ${JSON.stringify(todayKey)};
      document.querySelector('#event-start-time').value = '16:00';
      document.querySelector('#event-end-time').value = '17:00';
      document.querySelector('.event-color-swatch[data-color="#FF9500"]').click();
      document.querySelector('#event-save').click();
    })()`);
    await sleep(450);
    const colorState = await main.evaluate(`(() => {
      const event = window.__app.getState().events.find((item) => item.title === '标签颜色验证');
      const chip = [...document.querySelectorAll('.event-chip')].find((node) =>
        node.textContent.includes('标签颜色验证')
      );
      return { color: event?.color, chip: chip?.getAttribute('style') || '' };
    })()`);
    check(
      '日程支持独立标签颜色',
      colorState.color === '#FF9500' && colorState.chip.includes('#FF9500'),
      JSON.stringify(colorState)
    );

    const icsSample = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:ics-test-1',
      'DTSTART:20261101T090000',
      'DTEND:20261101T100000',
      'SUMMARY:ICS 验证',
      'LOCATION:线上',
      'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const icsParsed = await main.evaluate(
      `window.__calendarTest.parseIcs(${JSON.stringify(icsSample)})`
    );
    const icsBuilt = await main.evaluate("window.__calendarTest.buildIcs({})");
    const icsImported = await main.evaluate(
      `window.__calendarTest.importIcs(${JSON.stringify(icsSample)}, 'work')`
    );
    const icsImportedState = await main.evaluate(`(() => {
      const event = window.__app.getState().events.find((item) => item.uid === 'ics-test-1');
      return { count: window.__app.getState().events.filter((item) => item.uid === 'ics-test-1').length, title: event?.title };
    })()`);
    check(
      'iCalendar 可以导入与导出',
      icsParsed.length === 1 &&
        icsParsed[0].title === 'ICS 验证' &&
        icsParsed[0].recurrence?.freq === 'weekly' &&
        icsParsed[0].recurrence?.weekdays.join(',') === '1,3' &&
        icsBuilt.includes('BEGIN:VEVENT') &&
        icsImported === 1 &&
        icsImportedState.count === 1,
      JSON.stringify({ parsed: icsParsed[0], imported: icsImported, state: icsImportedState })
    );

    const searchCount = await main.evaluate(`(() => {
      const input = document.querySelector('#search-input');
      input.value = '重复验证';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(350);
    await main.evaluate(`(() => {
      const from = document.querySelector('#search-from');
      const to = document.querySelector('#search-to');
      from.value = ${JSON.stringify(todayKey)};
      to.value = ${JSON.stringify(todayKey)};
      from.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await sleep(400);
    const searchRangeCount = await main.evaluate(
      "document.querySelectorAll('#search-results .search-item').length"
    );
    check(
      '搜索支持日期范围并展开重复实例',
      searchCount && searchRangeCount >= 1,
      `results=${searchRangeCount}`
    );
    await main.evaluate(`(() => {
      const input = document.querySelector('#search-input');
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);

    await main.evaluate("window.__calendarTest.setView('month'); window.__calendarTest.setDate('2026-10-26')");
    await main.evaluate("window.__calendarTest.setView('week')");
    await main.evaluate("window.__calendarTest.setView('day')");
    const backState = await main.evaluate("window.__calendarTest.goBack()");
    const forwardState = await main.evaluate("window.__calendarTest.goForward()");
    check(
      '日历支持历史返回与前进',
      backState.view === 'week' && forwardState.view === 'day',
      JSON.stringify({ backState, forwardState })
    );
    await main.evaluate("window.__calendarTest.setView('month')");
    await sleep(250);

    const taskState = await main.evaluate(`(() => {
      window.__calendarTest.addTask('任务验证', ${JSON.stringify(todayKey)});
      const task = window.__calendarTest.tasksState().find((item) => item.title === '任务验证');
      const row = [...document.querySelectorAll('.task-row')].find((node) =>
        node.textContent.includes('任务验证')
      );
      const marker = Boolean(document.querySelector('.day-task-count'));
      row?.click();
      return {
        id: task?.id,
        done: window.__calendarTest.tasksState().find((item) => item.title === '任务验证')?.done,
        marker
      };
    })()`);
    check(
      '轻量任务清单可以添加与完成',
      Boolean(taskState.id) && taskState.done === true && taskState.marker,
      JSON.stringify(taskState)
    );
    await main.evaluate(`(() => {
      const state = window.__app.getState();
      state.tasks = state.tasks.filter((task) => task.title !== '任务验证');
      window.__app.render();
    })()`);

    const lunarState = await main.evaluate(`(() => {
      const brief = Almanac.briefOf(new Date());
      const solar = Almanac.solarForLunar(2026, 1, 1);
      const start = new Date(solar);
      start.setHours(9, 0, 0, 0);
      const end = new Date(start.getTime() + 3600000);
      const pad = (n) => String(n).padStart(2, '0');
      const fmt = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
      const event = {
        start: fmt(start), end: fmt(end), allDay: false,
        recurrence: { freq: 'lunar-yearly', interval: 1, lunarMonth: 1, lunarDay: 1, until: null, exceptions: [] }
      };
      const occurrences = Recurrence.expand(event, new Date(2026, 0, 1), new Date(2028, 0, 1));
      const lunarMatches = occurrences.every((item) => {
        const info = Almanac.lunarOf(parseLocal(item.start));
        return info && info.monthNumber === 1 && info.day === 1;
      });
      return { chongSha: brief.chongSha || '', solar: Boolean(solar), count: occurrences.length, lunarMatches };
    })()`);
    check(
      '黄历冲煞与农历生日重复可用',
      /冲.+煞/.test(lunarState.chongSha) &&
        lunarState.solar &&
        lunarState.count >= 2 &&
        lunarState.lunarMatches,
      JSON.stringify(lunarState)
    );

    const templateState = await main.evaluate(`(() => {
      window.__calendarTest.openEventDialog();
      document.querySelector('#event-title').value = '模板验证';
      document.querySelector('#event-start-time').value = '11:00';
      document.querySelector('#event-end-time').value = '12:00';
      document.querySelector('#event-template-save').click();
      document.querySelector('#event-cancel').click();
      window.__calendarTest.openEventDialog();
      const options = [...document.querySelectorAll('#event-template-select option')].map((option) => option.textContent);
      const template = [...document.querySelectorAll('#event-template-select option')].find((option) => option.textContent === '模板验证');
      const pickerVisible = !document.querySelector('#event-template-picker').classList.contains('hidden');
      if (template) {
        document.querySelector('#event-template-select').value = template.value;
        document.querySelector('#event-template-select').dispatchEvent(new Event('change', { bubbles: true }));
      }
      return {
        options,
        pickerVisible,
        title: document.querySelector('#event-title').value,
        start: document.querySelector('#event-start-time').value,
        end: document.querySelector('#event-end-time').value
      };
    })()`);
    check(
      '日程可以保存为模板并快速套用',
      templateState.pickerVisible &&
        templateState.options.includes('模板验证') &&
        templateState.title === '模板验证' &&
        templateState.start === '11:00' &&
        templateState.end === '12:00',
      JSON.stringify(templateState)
    );
    await main.evaluate(`(() => {
      const option = [...document.querySelectorAll('#event-template-select option')].find((item) => item.textContent === '模板验证');
      if (option) {
        document.querySelector('#event-template-select').value = option.value;
        document.querySelector('#event-template-delete').click();
      }
      document.querySelector('#event-cancel').click();
    })()`);

    const shortcutState = await main.evaluate(`(() => {
      const state = window.__app.getState();
      state.settings.shortcuts.today = 'g';
      window.__calendarTest.setView('week');
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
      const view = window.__calendarTest.stats().view;
      state.settings.shortcuts.today = 't';
      return { view };
    })()`);
    check('快捷键可以自定义', shortcutState.view === 'month', JSON.stringify(shortcutState));

    const cycleState = await main.evaluate(`(() => {
      const state = window.__app.getState();
      const today = new Date();
      const end = new Date(today);
      end.setDate(end.getDate() + 30);
      const pad = (n) => String(n).padStart(2, '0');
      const fmt = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      state.plans.push({
        id: 'test-cycle-plan', title: '周期计划验证', calendarId: 'work',
        start: fmt(today), end: fmt(end), progress: 10, autoProgress: false,
        archived: false, repeat: 'quarterly', milestonesSeen: [], reminders: [], milestoneMessages: {}, notes: ''
      });
      window.__app.render();
      return { start: fmt(today) };
    })()`);
    await main.evaluate("window.__calendarTest.openSettings('plans')");
    await sleep(350);
    await main.evaluate(`(() => {
      const row = [...document.querySelectorAll('.settings-plan-row')].find((node) =>
        node.textContent.includes('周期计划验证')
      );
      row?.querySelector('[data-plan-next]')?.click();
    })()`);
    await sleep(400);
    const cycleCreated = await main.evaluate(
      "window.__app.getState().plans.filter((plan) => plan.title === '周期计划验证').length"
    );
    check(
      '计划可以创建下一周期',
      cycleCreated === 2,
      `plans=${cycleCreated}`
    );
    await main.evaluate(`(() => {
      const state = window.__app.getState();
      state.plans = state.plans.filter((plan) => plan.title !== '周期计划验证');
      window.__app.render();
      document.querySelector('#settings-close')?.click();
    })()`);
    await sleep(250);

    // 13. 小组件：尺寸、锁定、休息日同步
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

    await main.evaluate("document.querySelector('.wg-toggle[data-type=\"month\"]').click()");
    await sleep(900);
    await main.evaluate("document.querySelector('.wg-toggle[data-type=\"month\"]').click()");
    await sleep(900);
    const multiWidgetState = await main.evaluate(`(() => {
      const card = [...document.querySelectorAll('.wg-card')].find((node) =>
        node.querySelector('.wg-name')?.textContent.includes('月历')
      );
      return { meta: card?.querySelector('.wg-meta')?.textContent || '' };
    })()`);
    const widgetStore = JSON.parse(fs.readFileSync(path.join(USER_DATA, 'widgets.json'), 'utf8'));
    const monthWidgets = widgetStore.filter((widgetItem) => widgetItem.type === 'month');
    check(
      '同一种小组件可以添加多个并记住显示器',
      multiWidgetState.meta.includes('已添加 2 个') &&
        monthWidgets.length === 2 &&
        monthWidgets.every((widgetItem) => widgetItem.displayId !== undefined && widgetItem.displayId !== null),
      JSON.stringify({ meta: multiWidgetState.meta, monthWidgets })
    );
    await main.evaluate("document.querySelector('.wg-remove[data-type=\"month\"]').click()");
    await sleep(900);

    await main.evaluate("document.querySelector('.wg-toggle[data-type=\"today\"]').click()");
    await sleep(1000);
    const todayTarget = await waitFor(async () => {
      const list = await targets();
      return list.find((item) => item.type === 'page' && item.url.includes('type=today'));
    });
    const todayWidget = await new CDP(todayTarget.webSocketDebuggerUrl).connect();
    await waitFor(() => todayWidget.evaluate('Boolean(window.__widgetTest)'));
    await sleep(500);
    const widgetRenderPerf = await todayWidget.evaluate(`(() => {
      const before = window.__widgetTest.renderCount();
      window.__widgetTest.render();
      const after = window.__widgetTest.renderCount();
      window.__widgetTest.render();
      const again = window.__widgetTest.renderCount();
      return { before, after, again };
    })()`);
    check(
      '小组件重复渲染会跳过',
      widgetRenderPerf.again === widgetRenderPerf.after,
      JSON.stringify(widgetRenderPerf)
    );

    const todayWidgetState = await todayWidget.evaluate(`(() => {
      const stats = window.__widgetTest.stats();
      const insight = window.__widgetTest.insight();
      return {
        headline: stats.headline,
        nextLine: stats.nextLine,
        freeLine: stats.freeLine,
        freeMinutes: insight.freeMinutes,
        rhythmState: insight.rhythmState,
        suggestion: insight.suggestion,
        conclusionCount: stats.conclusionCount,
      };
    })()`);
    check(
      '今天小组件给出今日节奏结论',
      todayWidgetState.headline.length > 0 &&
        todayWidgetState.nextLine.length > 0 &&
        (todayWidgetState.freeLine.length > 0 || todayWidgetState.rhythmState === 'no-hours') &&
        todayWidgetState.freeMinutes >= 0 &&
        todayWidgetState.conclusionCount >= 2,
      JSON.stringify(todayWidgetState)
    );

    const todayBase = await todayWidget.evaluate('window.__widgetTest.stats()');
    await todayWidget.shot('feature-widget-today.png');
    await todayWidget.evaluate(
      "window.desktop.widget.setAppearance({ theme: 'mist', opacity: 0.7, glass: 16 })"
    );
    await sleep(450);
    const independentAppearance = await todayWidget.evaluate('window.__widgetTest.stats()');
    check(
      '小组件可以独立设置主题与透明度',
      independentAppearance.theme === 'mist' &&
        independentAppearance.alphaClass &&
        Number(independentAppearance.alpha) < 0.75,
      JSON.stringify({
        theme: independentAppearance.theme,
        alpha: independentAppearance.alpha,
        alphaClass: independentAppearance.alphaClass
      })
    );
    await todayWidget.evaluate(
      "window.desktop.widget.setAppearance({ theme: 'inherit', opacity: null, glass: null })"
    );
    await sleep(350);
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

    await todayWidget.evaluate(
      "window.desktop.widget.setAppearance({ theme: 'night' })"
    );
    await sleep(450);
    const nightWidget = await todayWidget.evaluate(`({
      theme: document.documentElement.dataset.theme,
      headline: document.querySelector('.w-rhythm-headline')?.textContent?.trim() || '',
      hasNightOption: Boolean(document.querySelector('#menu-theme option[value="night"]'))
    })`);
    await todayWidget.evaluate(
      "window.desktop.widget.setAppearance({ theme: 'inherit' })"
    );
    await sleep(300);
    check(
      '小组件支持夜色主题',
      nightWidget.theme === 'night' &&
        nightWidget.headline.length > 0 &&
        nightWidget.hasNightOption,
      JSON.stringify(nightWidget)
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

    const rhythmStates = await todayWidget.evaluate(`(() => {
      const cases = [
        ['2026-11-02T08:00:00', 'before'],
        ['2026-11-02T10:00:00', 'morning'],
        ['2026-11-02T12:30:00', 'lunch'],
        ['2026-11-02T15:00:00', 'afternoon'],
        ['2026-11-02T17:30:00', 'near-off'],
        ['2026-11-02T19:00:00', 'off'],
        ['2026-11-01T10:00:00', 'rest']
      ];
      return cases.map(([iso, expected]) => {
        const snap = window.__widgetTest.insightAt(iso);
        return {
          expected,
          state: snap.rhythmState,
          headline: snap.headline,
          breathing: snap.breathing,
          freeMinutes: snap.freeMinutes
        };
      });
    })()`);
    const rhythmHeadlineOk = {
      before: /距离上班/.test(rhythmStates[0].headline),
      morning: /距离午休/.test(rhythmStates[1].headline),
      lunch: /午休中/.test(rhythmStates[2].headline),
      afternoon: /距离下班/.test(rhythmStates[3].headline),
      'near-off': /后下班/.test(rhythmStates[4].headline),
      off: /已下班/.test(rhythmStates[5].headline),
      rest: /休息/.test(rhythmStates[6].headline),
    };
    const noHoursState = await todayWidget.evaluate(
      "window.__widgetTest.insightAt('2026-11-02T10:00:00', { workHours: { enabled: false }, widgets: { suggestions: false } })"
    );
    const nearOffNoBreathing = await todayWidget.evaluate(
      "window.__widgetTest.insightAt('2026-11-02T17:30:00', { widgets: { breathing: false } })"
    );
    check(
      '今日节奏随时间切换重点并可关闭呼吸与建议',
      rhythmStates.every((item, index) => item.state === item.expected) &&
        Object.values(rhythmHeadlineOk).every(Boolean) &&
        rhythmStates[1].freeMinutes >= 300 &&
        rhythmStates[4].breathing === true &&
        nearOffNoBreathing.breathing === false &&
        noHoursState.headline.includes('还没有设置工作时间') &&
        noHoursState.suggestion === '',
      JSON.stringify({
        states: rhythmStates.map((item) => `${item.expected}:${item.state}`),
        rhythmHeadlineOk,
        nearOffBreathing: rhythmStates[4].breathing,
        nearOffNoBreathing: nearOffNoBreathing.breathing,
        noHours: noHoursState.headline,
      })
    );

    const emptyStates = await todayWidget.evaluate(`(() => {
      const empty = {
        calendars: [], events: [], plans: [], tasks: [],
        settings: { ...state.settings, workHours: { enabled: false } }
      };
      const now = new Date('2026-11-02T10:00:00');
      const today = Insight.today(empty, now);
      const month = Insight.month(empty, new Date(2026, 10, 1), now);
      const agenda = Insight.agenda(empty, now, now);
      const upcoming = Insight.upcoming(empty, now, 5);
      return {
        today: today.headline,
        todayDetail: today.detail,
        month: month.headline,
        agenda: agenda.headline,
        upcomingCount: upcoming.items.length
      };
    })()`);
    check(
      '空状态与未设置工作时间有专门文案',
      emptyStates.today.includes('还没有设置工作时间') &&
        emptyStates.todayDetail.length > 0 &&
        emptyStates.month.includes('还没有安排') &&
        emptyStates.agenda.includes('没有安排') &&
        emptyStates.upcomingCount === 0,
      JSON.stringify(emptyStates)
    );

    await todayWidget.evaluate("window.desktop.widget.close()");
    todayWidget.close();
    await sleep(400);

    const conflictDate = await main.evaluate(`(() => {
      const state = window.__app.getState();
      const day = new Date();
      day.setDate(day.getDate() + 1);
      const pad = (n) => String(n).padStart(2, '0');
      const key = day.getFullYear() + '-' + pad(day.getMonth() + 1) + '-' + pad(day.getDate());
      state.events.push(
        { id: 'test-conflict-a', calendarId: 'work', title: '冲突验证 A', start: key + 'T10:00', end: key + 'T11:00', allDay: false, location: '', notes: '', recurrence: null, reminder: null },
        { id: 'test-conflict-b', calendarId: 'work', title: '冲突验证 B', start: key + 'T10:30', end: key + 'T11:30', allDay: false, location: '会议室', notes: '', recurrence: null, reminder: null }
      );
      window.__app.saveState();
      return key;
    })()`);
    await main.evaluate("document.querySelector('.wg-toggle[data-type=\"upcoming\"]').click()");
    await sleep(1100);
    const upcomingTarget = await waitFor(async () => {
      const list = await targets();
      return list.find((item) => item.type === 'page' && item.url.includes('type=upcoming'));
    });
    const upcomingWidget = await new CDP(upcomingTarget.webSocketDebuggerUrl).connect();
    await waitFor(() => upcomingWidget.evaluate('Boolean(window.__widgetTest)'));
    await sleep(600);
    await upcomingWidget.evaluate(`(() => {
      const style = document.createElement('style');
      style.textContent = '.w-up-row:hover,.w-up-hero:hover{background:transparent!important}';
      document.head.appendChild(style);
    })()`);
    await upcomingWidget.shot('feature-widget-upcoming.png');
    const upcomingState = await upcomingWidget.evaluate(`(() => {
      const stats = window.__widgetTest.stats();
      const first = window.__widgetTest.upcomingInsight();
      const second = window.__widgetTest.upcomingInsight();
      return {
        reasons: stats.reasons,
        count: first.length,
        firstReason: first[0]?.reason || '',
        firstKind: first[0]?.reasonKind || '',
        hasConflict: first.some((item) => item.reasonKind === 'conflict'),
        stable: JSON.stringify(first) === JSON.stringify(second),
        planLine: stats.planLine,
      };
    })()`);
    check(
      '即将到来按需要提前知道的程度排序并说明原因',
      upcomingState.count > 0 &&
        upcomingState.reasons.length > 0 &&
        upcomingState.hasConflict &&
        upcomingState.stable &&
        upcomingState.planLine.includes('完成'),
      JSON.stringify({ ...upcomingState, reasons: upcomingState.reasons.slice(0, 4) })
    );
    const smartToggleState = await upcomingWidget.evaluate(`(() => {
      const smartFirst = window.__widgetTest.upcomingInsight()[0]?.title || '';
      state.settings.widgets.smartSort = false;
      render();
      const timeFirst = window.__widgetTest.upcomingInsight()[0]?.title || '';
      state.settings.widgets.smartSort = true;
      render();
      return { smartFirst, timeFirst };
    })()`);
    check(
      '智能排序可以关闭并回到时间顺序',
      smartToggleState.timeFirst.length > 0 &&
        smartToggleState.timeFirst !== smartToggleState.smartFirst,
      JSON.stringify(smartToggleState)
    );
    const planDualState = await upcomingWidget.evaluate(`(() => {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const fmt = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      const start = new Date(now); start.setDate(start.getDate() - 10);
      const end = new Date(now); end.setDate(end.getDate() + 5);
      state.plans.push({
        id: 'test-behind-plan', title: '落后验证', calendarId: 'work',
        start: fmt(start), end: fmt(end), progress: 10, autoProgress: false,
        archived: false, reminders: [], milestoneMessages: {}
      });
      render();
      const line = document.querySelector('.w-plan-line');
      return {
        text: line?.textContent || '',
        behind: Boolean(line?.classList.contains('is-behind')),
        next: line?.querySelector('.w-plan-next')?.textContent || ''
      };
    })()`);
    check(
      '计划同时显示完成进度与时间进度',
      planDualState.text.includes('落后验证') &&
        planDualState.text.includes('完成 10%') &&
        planDualState.text.includes('时间') &&
        planDualState.behind &&
        planDualState.next.includes('20%'),
      JSON.stringify(planDualState)
    );
    await upcomingWidget.evaluate(`(() => {
      state.plans = state.plans.filter((plan) => plan.id !== 'test-behind-plan');
      render();
    })()`);
    await upcomingWidget.evaluate("window.desktop.widget.close()");
    upcomingWidget.close();
    await sleep(400);
    await main.evaluate(`(() => {
      const state = window.__app.getState();
      state.events = state.events.filter((event) => !String(event.id).startsWith('test-conflict-'));
      window.__app.saveState();
      window.__app.render();
    })()`);

    await main.evaluate("document.querySelector('.wg-toggle[data-type=\"monthAgenda\"]').click()");
    await sleep(1100);
    const agendaTarget = await waitFor(async () => {
      const list = await targets();
      return list.find((item) => item.type === 'page' && item.url.includes('type=monthAgenda'));
    });
    const agendaWidget = await new CDP(agendaTarget.webSocketDebuggerUrl).connect();
    await waitFor(() => agendaWidget.evaluate('Boolean(window.__widgetTest)'));
    await sleep(700);
    await agendaWidget.shot('feature-widget-month-agenda.png');
    const agendaState = await agendaWidget.evaluate(`(() => {
      const summary = document.querySelector('.w-large-summary')?.textContent?.trim() || '';
      const selected = document.querySelector('.w-large-day-title')?.textContent?.trim() || '';
      return {
        summary,
        selected,
        eventRows: document.querySelectorAll('.w-large-list [data-event-id]').length,
        monthInsight: document.querySelector('.w-month-insight strong')?.textContent?.trim() || '',
        taskRows: document.querySelectorAll('.w-task-row').length
      };
    })()`);
    check(
      '月历与议程给出当天具体安排',
      agendaState.summary.length > 0 &&
        agendaState.selected.length > 0 &&
        agendaState.eventRows > 0,
      JSON.stringify(agendaState)
    );
    await agendaWidget.evaluate("window.desktop.widget.close()");
    agendaWidget.close();
    await sleep(400);

    // 13.5 主页面今日节奏条
    await main.evaluate("document.querySelector('#widget-close')?.click()");
    await sleep(350);
    const rhythmState = await main.evaluate(`(() => {
      const state = window.__app.getState();
      const snap = window.Insight.today(state, new Date());
      const el = document.querySelector('#today-rhythm');
      const stable = (value) => String(value || '').split(' · ')[0];
      return {
        exists: Boolean(el),
        visible: Boolean(el) && !el.classList.contains('hidden'),
        expanded: Boolean(el) && !el.classList.contains('is-collapsed'),
        headline: el?.querySelector('.tr-headline')?.textContent?.trim() || '',
        next: stable(el?.querySelector('.tr-next-text')?.textContent?.trim()),
        suggestion: el?.querySelector('.tr-suggestion')?.textContent?.trim() || '',
        expectedHeadline: snap.headline,
        expectedNext: stable(snap.nextLine),
        expectedSuggestion: snap.suggestion
      };
    })()`);
    check(
      '主页面今日节奏条复用 Insight 结论',
      rhythmState.exists &&
        rhythmState.visible &&
        rhythmState.expanded &&
        rhythmState.headline === rhythmState.expectedHeadline &&
        rhythmState.next === rhythmState.expectedNext &&
        (!rhythmState.expectedSuggestion || rhythmState.suggestion.includes(rhythmState.expectedSuggestion)),
      JSON.stringify(rhythmState)
    );
    await main.shot('feature-today-rhythm.png');

    const copyState = await main.evaluate(`(() => {
      if (!window.Copy) return { exists: false };
      const day = new Date(2026, 10, 7);
      const first = window.Copy.suggestion('rest', day);
      const second = window.Copy.suggestion('rest', day);
      const week = new Set();
      for (let index = 0; index < 7; index += 1) {
        week.add(window.Copy.suggestion('rest', new Date(2026, 10, 7 + index)));
      }
      const snap = window.Insight.today(window.__app.getState(), new Date());
      return {
        exists: true,
        stable: first === second && first.length > 0,
        variety: week.size,
        insightSuggestion: snap.suggestion,
        pool: window.Copy.pool('suggestion:rest').length
      };
    })()`);
    check(
      '文案池按日期稳定轮换',
      copyState.exists &&
        copyState.stable &&
        copyState.variety >= 2 &&
        copyState.pool >= 3 &&
        (!copyState.insightSuggestion ||
          copyState.insightSuggestion.length > 0),
      JSON.stringify(copyState)
    );

    const perfSurface = await main.evaluate(`(() => ({
      hasMetrics: Boolean(window.desktop.app && window.desktop.app.metrics),
      hasTick: typeof window.__calendarTest.tickUi === 'function'
    }))()`);
    check(
      '性能接口可用',
      perfSurface.hasMetrics && perfSurface.hasTick,
      JSON.stringify(perfSurface)
    );

    const metrics = await main.evaluate(`window.desktop.app.metrics()`);
    check(
      '可以读取进程资源指标',
      Array.isArray(metrics) &&
        metrics.length > 0 &&
        metrics.some((item) => item.type === 'Browser' && item.workingSetSize > 0),
      JSON.stringify(metrics.slice(0, 3))
    );

    const tickResult = await main.evaluate(`(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      const hiddenResult = window.__calendarTest.tickUi();
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      const visibleResult = window.__calendarTest.tickUi();
      return { hiddenResult, visibleResult };
    })()`);
    check(
      '主窗口隐藏时暂停 UI 定时器',
      tickResult.hiddenResult === false && tickResult.visibleResult === true,
      JSON.stringify(tickResult)
    );

    await main.evaluate("window.__calendarTest.openSettings('appearance')");
    await sleep(300);
    const liteToggle = await main.evaluate(`(() => {
      const input = document.querySelector('input[data-path="performance.liteMode"]');
      if (!input) return { exists: false };
      if (!input.checked) input.click();
      return { exists: true };
    })()`);
    await sleep(350);
    const liteState = await main.evaluate(`({
      classOn: document.body.classList.contains('lite-mode'),
      setting: window.__app.getState().settings.performance?.liteMode
    })`);
    await main.evaluate(`(() => {
      const input = document.querySelector('input[data-path="performance.liteMode"]');
      if (input && input.checked) input.click();
    })()`);
    await sleep(250);
    await main.evaluate("document.querySelector('#settings-close').click()");
    check(
      '轻量模式可以关闭视觉效果',
      liteToggle.exists && liteState.classOn && liteState.setting === true,
      JSON.stringify({ ...liteToggle, ...liteState })
    );

    await main.evaluate("window.__calendarTest.openSettings('general')");
    await sleep(300);
    const startupSurface = await main.evaluate(`({
      hasOpenAtLogin: Boolean(document.querySelector('input[data-path="startup.openAtLogin"]')),
      hasMinimized: Boolean(document.querySelector('input[data-path="startup.minimized"]')),
      hasIpc: Boolean(window.desktop.app && window.desktop.app.setStartup)
    })`);
    await main.evaluate(`(() => {
      const input = document.querySelector('input[data-path="startup.openAtLogin"]');
      if (input && !input.checked) input.click();
    })()`);
    await sleep(350);
    const startupState = await main.evaluate(`(async () => ({
      openAtLogin: window.__app.getState().settings.startup?.openAtLogin,
      minimized: window.__app.getState().settings.startup?.minimized,
      ipcResult: await window.desktop.app
        .setStartup({ openAtLogin: true, minimized: true })
        .catch((error) => 'error:' + error.message)
    }))()`);
    await main.evaluate(`(() => {
      const input = document.querySelector('input[data-path="startup.openAtLogin"]');
      if (input && input.checked) input.click();
    })()`);
    await sleep(250);
    await main.evaluate("document.querySelector('#settings-close').click()");
    check(
      '开机自启开关与主进程联动',
      startupSurface.hasOpenAtLogin &&
        startupSurface.hasMinimized &&
        startupSurface.hasIpc &&
        startupState.openAtLogin === true &&
        startupState.minimized === true &&
        typeof startupState.ipcResult === 'boolean',
      JSON.stringify({ ...startupSurface, ...startupState })
    );

    await main.evaluate("window.__calendarTest.openSettings('general')");
    await sleep(600);
    const backupSurface = await main.evaluate(`({
      hasList: Boolean(document.querySelector('#backup-list')),
      rows: document.querySelectorAll('.backup-row').length,
      hasIpc: Boolean(window.desktop.backups && window.desktop.backups.restore),
      file: document.querySelector('[data-backup-restore]')?.dataset.backupRestore || ''
    })`);
    await main.evaluate("document.querySelector('#settings-close').click()");
    check(
      '每日自动备份可列出',
      backupSurface.hasList &&
        backupSurface.hasIpc &&
        backupSurface.rows >= 1 &&
        /^\d{4}-\d{2}-\d{2}\.json$/.test(backupSurface.file),
      JSON.stringify(backupSurface)
    );

    const quietState = await main.evaluate(`(() => {
      const quiet = { enabled: true, start: '22:00', end: '08:00' };
      return {
        late: window.Reminders.inQuietHours(new Date(2026, 10, 6, 23, 30), quiet),
        early: window.Reminders.inQuietHours(new Date(2026, 10, 7, 7, 30), quiet),
        noon: window.Reminders.inQuietHours(new Date(2026, 10, 6, 12, 0), quiet),
        boundary: window.Reminders.inQuietHours(new Date(2026, 10, 7, 8, 0), quiet),
        disabled: window.Reminders.inQuietHours(new Date(2026, 10, 6, 23, 30), {
          enabled: false, start: '22:00', end: '08:00'
        })
      };
    })()`);
    check(
      '免打扰时段支持跨午夜',
      quietState.late === true &&
        quietState.early === true &&
        quietState.noon === false &&
        quietState.boundary === false &&
        quietState.disabled === false,
      JSON.stringify(quietState)
    );

    await main.evaluate(`window.__calendarTest.fireEventReminder({
      key: 'snooze-test',
      eventId: 'snooze-test',
      title: '稍后提醒验证',
      body: '10:00 – 11:00',
      at: new Date().toISOString(),
      system: false
    })`);
    await sleep(350);
    const snoozeVisible = await main.evaluate(
      "!document.querySelector('#event-reminder-overlay').classList.contains('hidden') && document.querySelectorAll('[data-snooze]').length >= 3"
    );
    await main.evaluate("document.querySelector('[data-snooze=\"10\"]').click()");
    await sleep(400);
    const snoozeState = await main.evaluate(`(() => {
      const snoozes = window.__app.getState().reminderSnoozes || [];
      const collected = window.__calendarTest.collectReminders();
      return {
        stored: snoozes.length,
        minutes: snoozes[0] ? Math.round((Date.parse(snoozes[0].at) - Date.now()) / 60000) : 0,
        scheduled: collected.some((item) => item.snoozed === true && item.title === '稍后提醒验证'),
        overlayHidden: document.querySelector('#event-reminder-overlay').classList.contains('hidden')
      };
    })()`);
    await main.evaluate("window.__app.getState().reminderSnoozes = []; window.__app.saveState()");
    check(
      '稍后提醒会持久化并重新调度',
      snoozeVisible &&
        snoozeState.stored === 1 &&
        snoozeState.minutes >= 9 &&
        snoozeState.minutes <= 10 &&
        snoozeState.scheduled &&
        snoozeState.overlayHidden,
      JSON.stringify({ snoozeVisible, ...snoozeState })
    );

    const taskReminderState = await main.evaluate(`(() => {
      const now = new Date();
      const time = [now.getHours(), now.getMinutes()]
        .map((value) => String(value).padStart(2, '0'))
        .join(':');
      const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
        .map((value, index) => (index ? String(value).padStart(2, '0') : value))
        .join('-');
      const state = window.__app.getState();
      state.settings.reminders.taskTime = time;
      state.settings.reminders.taskReminder = true;
      state.settings.reminders.taskSystem = true;
      const task = window.__calendarTest.addTask('任务提醒验证', today);
      const item = window.__calendarTest
        .collectReminders()
        .find((entry) => entry.kind === 'task' && entry.taskId === task.id);
      task.done = true;
      const afterDone = window.__calendarTest
        .collectReminders()
        .find((entry) => entry.kind === 'task' && entry.taskId === task.id);
      state.tasks = state.tasks.filter((entry) => entry.id !== task.id);
      state.settings.reminders.taskTime = '09:00';
      window.__app.saveState();
      return {
        found: Boolean(item),
        title: item?.title || '',
        system: item?.system,
        afterDone: Boolean(afterDone)
      };
    })()`);
    check(
      '任务到期提醒可生成并排除已完成',
      taskReminderState.found &&
        taskReminderState.title.includes('任务提醒验证') &&
        taskReminderState.system === true &&
        taskReminderState.afterDone === false,
      JSON.stringify(taskReminderState)
    );

    const mainReminderState = await main.evaluate(`(async () => {
      await window.desktop.reminders.sync([{
        key: 'task-main-sync',
        kind: 'task',
        taskId: 'task-main-1',
        title: '任务主进程验证',
        body: '今天截止',
        calendar: '工作',
        quiet: true,
        at: new Date(Date.now() + 60000).toISOString(),
        system: false
      }]);
      const peek = await window.desktop.reminders.peek();
      window.__calendarTest.syncReminders();
      return peek;
    })()`);
    check(
      '主进程接受任务提醒并保留免打扰标记',
      mainReminderState.length === 1 &&
        mainReminderState[0].taskId === 'task-main-1' &&
        mainReminderState[0].kind === 'task' &&
        mainReminderState[0].quiet === true &&
        mainReminderState[0].calendar === '工作',
      JSON.stringify(mainReminderState)
    );

    const restInsight = await main.evaluate(`(() => {
      const state = window.__app.getState();
      const saturday = new Date(2026, 10, 7, 9, 0);
      const schedule = {
        preset: 'double', restWeekdays: [0, 6], halfWeekdays: [],
        alternate: null, cycle: null, overrides: {}, followHolidays: false
      };
      const weekendEvent = {
        id: 'rest-day-event', calendarId: state.calendars[0]?.id, title: '周末聚会',
        start: '2026-11-07T10:30', end: '2026-11-07T11:30', allDay: false,
        location: '', notes: '', recurrence: null, reminder: null
      };
      const snap = window.Insight.today({
        ...state,
        events: [...state.events, weekendEvent],
        settings: { ...state.settings, schedule, weekStart: 1 }
      }, saturday);
      return {
        headline: snap.headline,
        detail: snap.detail,
        nextLine: snap.nextLine,
        status: snap.status?.state || null,
        freeMinutes: snap.free.minutes
      };
    })()`);
    check(
      '休息日不会把当天算成上班节奏',
      restInsight.headline === '今天休息' &&
        restInsight.status === 'rest' &&
        !restInsight.nextLine.includes('今天') &&
        restInsight.detail.includes('周末聚会') &&
        !restInsight.detail.includes('上班') &&
        restInsight.freeMinutes >= 600,
      JSON.stringify(restInsight)
    );

    await main.evaluate("document.querySelector('#today-rhythm .tr-toggle').click()");
    await sleep(300);
    const collapsedRhythm = await main.evaluate(`({
      collapsed: document.querySelector('#today-rhythm').classList.contains('is-collapsed'),
      setting: window.__app.getState().settings.display.todayRhythm
    })`);
    check(
      '今日节奏条可以折叠并记住状态',
      collapsedRhythm.collapsed && collapsedRhythm.setting === false,
      JSON.stringify(collapsedRhythm)
    );
    await main.evaluate("document.querySelector('#today-rhythm .tr-toggle').click()");
    await sleep(250);
    const expandedAgain = await main.evaluate(
      "!document.querySelector('#today-rhythm').classList.contains('is-collapsed')"
    );

    await main.evaluate("window.__calendarTest.openSettings('display')");
    await sleep(300);
    const hasRhythmSetting = await main.evaluate(
      "Boolean(document.querySelector('input[data-path=\"display.todayRhythm\"]'))"
    );
    await main.evaluate(`(() => {
      const input = document.querySelector('input[data-path="display.todayRhythm"]');
      if (input && input.checked) input.click();
    })()`);
    await sleep(300);
    const collapsedBySetting = await main.evaluate(
      "document.querySelector('#today-rhythm').classList.contains('is-collapsed')"
    );
    await main.evaluate(`(() => {
      const input = document.querySelector('input[data-path="display.todayRhythm"]');
      if (input && !input.checked) input.click();
    })()`);
    await sleep(300);
    await main.evaluate("document.querySelector('#settings-close').click()");
    check(
      '设置中心可以控制今日节奏条',
      hasRhythmSetting && expandedAgain && collapsedBySetting,
      JSON.stringify({ hasRhythmSetting, expandedAgain, collapsedBySetting })
    );

    // 14. 显示农历、宜忌、星座
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

    const shardCount = await main.evaluate(`(() => {
      const state = window.__app.getState();
      for (let index = 0; index < 2001; index += 1) {
        state.events.push({
          id: 'shard-test-' + index, calendarId: 'work', title: '分片验证 ' + index,
          start: '2026-01-15T09:00', end: '2026-01-15T10:00', allDay: false,
          location: '', notes: '', recurrence: null, reminder: null
        });
      }
      window.__app.saveState();
      return state.events.length;
    })()`);
    await sleep(1400);
    const shardStorePath = path.join(USER_DATA, 'calendar-data.json');
    const shardDir = path.join(USER_DATA, 'events');
    const shardedStore = JSON.parse(fs.readFileSync(shardStorePath, 'utf8'));
    const shardFiles = fs.existsSync(shardDir)
      ? fs.readdirSync(shardDir).filter((file) => /^\d{4}\.json$/.test(file))
      : [];
    check(
      '大量日程自动分片存储',
      shardCount > 2000 &&
        Array.isArray(shardedStore.events) &&
        shardedStore.events.length === 0 &&
        shardFiles.length > 0,
      JSON.stringify({ shardCount, mainEvents: shardedStore.events?.length, shardFiles })
    );
    await main.evaluate(`(() => {
      const state = window.__app.getState();
      state.events = state.events.filter((event) => !String(event.id).startsWith('shard-test-'));
      window.__app.saveState();
    })()`);
    await sleep(1400);
    const compactStore = JSON.parse(fs.readFileSync(shardStorePath, 'utf8'));
    check(
      '数据减少后分片会自动清理',
      compactStore.events.length > 0 && !fs.existsSync(shardDir),
      JSON.stringify({ mainEvents: compactStore.events.length, shards: fs.existsSync(shardDir) })
    );

    try {
      await main.evaluate(
        `window.desktop.backups.restore(${JSON.stringify(backupSurface.file)})`
      );
    } catch {
      // 恢复会触发页面重载，执行上下文可能先被销毁
    }
    await sleep(2500);
    await waitFor(() => main.evaluate('Boolean(window.__calendarTest && window.__app)'));
    const backupRestoredState = await main.evaluate(`({
      events: window.__app.getState().events.length,
      shards: document.querySelectorAll('.month-day').length
    })`);
    const backupAfterRestore = await main.evaluate("window.desktop.backups.list()");
    check(
      '备份可以恢复数据',
      backupRestoredState.events > 0 &&
        backupRestoredState.events < 100 &&
        backupRestoredState.shards === 42 &&
        backupAfterRestore.some((item) => item.file === 'pre-restore.json'),
      JSON.stringify({ ...backupRestoredState, files: backupAfterRestore.map((item) => item.file) })
    );

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
