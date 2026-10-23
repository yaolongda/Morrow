'use strict';

/* ------------------------------------------------------------------ */
/* 基础                                                                */
/* ------------------------------------------------------------------ */

const params = new URLSearchParams(window.location.search);
const widgetType = params.get('type') || 'month';
const widgetId = params.get('id') || '';
const content = document.getElementById('widget-content');
const card = document.getElementById('widget-card');
const pinButton = document.getElementById('pin-btn');
const closeButton = document.getElementById('close-btn');
const widgetMenu = document.getElementById('widget-menu');
const lockMenuButton = document.getElementById('lock-menu-btn');
const pinMenuButton = document.getElementById('pin-menu-btn');

const WEEKDAY_FULL = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const WEEKDAY_SHORT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WEEKDAY_SINGLE = ['日', '一', '二', '三', '四', '五', '六'];

const DEFAULT_SIZES = {
  month: { width: 360, height: 388 },
  today: { width: 360, height: 388 },
  upcoming: { width: 676, height: 344 },
  monthAgenda: { width: 676, height: 696 },
};

const pad = (value) => String(value).padStart(2, '0');
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date, months) {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const daysInMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, daysInMonth));
  return result;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfWeek(date, weekStart) {
  const result = startOfDay(date);
  const start = [0, 1, 6].includes(Number(weekStart)) ? Number(weekStart) : 1;
  const diff = (result.getDay() - start + 7) % 7;
  return addDays(result, -diff);
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function ymd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseLocal(value) {
  if (!value) return new Date(NaN);
  const [datePart, timePart = '00:00'] = String(value).split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0, 0);
}

function formatTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

/* ------------------------------------------------------------------ */
/* 数据                                                                */
/* ------------------------------------------------------------------ */

let state = {
  calendars: [],
  events: [],
  settings: {
    weekStart: 1,
    schedule: Schedule.defaultSchedule(),
    display: { lunar: true, solarTerms: true },
    appearance: {},
  },
};
let monthCursor = startOfDay(new Date());
let selectedDate = startOfDay(new Date());
let pinned = params.get('pin') === '1';
let locked = params.get('locked') === '1';
let lastDayKey = ymd(new Date());
let renderQueued = false;

function normalize(data) {
  const source = data && typeof data === 'object' ? data : {};
  const calendars = Array.isArray(source.calendars) ? source.calendars : [];
  const events = Array.isArray(source.events) ? source.events : [];
  const plans = Array.isArray(source.plans) ? source.plans : [];
  const settings = source.settings && typeof source.settings === 'object' ? source.settings : {};
  const display = settings.display && typeof settings.display === 'object' ? settings.display : {};
  return {
    calendars,
    events,
    plans,
    settings: {
      weekStart: [0, 1, 6].includes(Number(settings.weekStart)) ? Number(settings.weekStart) : 1,
      schedule: Schedule.normalize(settings.schedule),
      workHours: Workday.normalize(settings.workHours),
      display: {
        lunar: display.lunar !== false,
        solarTerms: display.solarTerms !== false,
      },
      appearance:
        settings.appearance && typeof settings.appearance === 'object'
          ? settings.appearance
          : {},
    },
  };
}

function weekStart() {
  return state.settings.weekStart;
}

function calendarById(id) {
  return state.calendars.find((calendar) => calendar.id === id) || null;
}

function calendarFor(event) {
  return (
    calendarById(event.calendarId) || {
      id: 'unknown',
      name: '未分类',
      color: '#8E8E93',
      visible: true,
    }
  );
}

function isVisible(event) {
  return calendarFor(event).visible !== false;
}

function dayType(date) {
  return Schedule.dayType(state.settings.schedule, date, weekStart());
}

function isRestDay(date) {
  return dayType(date) === 'rest';
}

function isHalfDay(date) {
  return dayType(date) === 'half';
}

function withOccurrence(event, occurrence) {
  return {
    ...event,
    start: occurrence.start,
    end: occurrence.end,
    occurrenceDate: occurrence.occurrenceDate,
  };
}

function eventsOnDay(day) {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  const result = [];
  for (const event of state.events) {
    if (!isVisible(event)) continue;
    for (const occurrence of Recurrence.expand(event, dayStart, dayEnd)) {
      result.push(withOccurrence(event, occurrence));
    }
  }
  return result.sort((a, b) => {
    if (Boolean(a.allDay) !== Boolean(b.allDay)) return a.allDay ? -1 : 1;
    return parseLocal(a.start) - parseLocal(b.start);
  });
}

function upcomingEvents(limit) {
  const now = new Date();
  const horizon = addDays(startOfDay(now), 366);
  const result = [];
  for (const event of state.events) {
    if (!isVisible(event)) continue;
    for (const occurrence of Recurrence.expand(event, now, horizon)) {
      if (parseLocal(occurrence.end) < now) continue;
      result.push(withOccurrence(event, occurrence));
    }
  }
  return result
    .sort((a, b) => parseLocal(a.start) - parseLocal(b.start))
    .slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* 渲染                                                                */
/* ------------------------------------------------------------------ */

function render() {
  document.body.dataset.type = widgetType;
  Appearance.applyWidget(state.settings);
  updateSizeClass();
  if (widgetType === 'today') renderToday();
  else if (widgetType === 'upcoming') renderUpcoming();
  else if (widgetType === 'monthAgenda') renderMonthAgenda();
  else renderMonth();
  updateMenuLabels();
}

function updateSizeClass() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const size = width < 420 ? 'xs' : width < 560 ? 'sm' : width < 720 ? 'md' : 'lg';
  const ratio = width / Math.max(1, height);
  const layout = ratio > 1.45 ? 'wide' : ratio < 0.82 ? 'tall' : 'square';
  document.body.dataset.size = size;
  document.body.dataset.layout = layout;
  document.body.dataset.compact = height < 340 ? '1' : '0';
  document.body.dataset.locked = locked ? '1' : '0';
  document.documentElement.style.setProperty('--widget-w', `${width}px`);
  document.documentElement.style.setProperty('--widget-h', `${height}px`);
}

function updateMenuLabels() {
  if (lockMenuButton) lockMenuButton.textContent = locked ? '解锁位置与尺寸' : '锁定位置与尺寸';
  if (pinMenuButton) pinMenuButton.textContent = pinned ? '取消置顶' : '置顶';
}

function headerHTML(options = {}) {
  const { title, sub, nav = true } = options;
  return `<div class="w-head">
    <div class="w-title">${title}${sub ? `<span class="w-sub">${sub}</span>` : ''}</div>
    ${
      nav
        ? `<div class="w-nav">
            <button class="w-nav-btn" data-action="prev-month" aria-label="上个月">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" /></svg>
            </button>
            <button class="w-nav-btn" data-action="next-month" aria-label="下个月">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5" /></svg>
            </button>
          </div>`
        : ''
    }
  </div>`;
}

function weekdayRowHTML() {
  const start = weekStart();
  return `<div class="w-weekdays">${Array.from({ length: 7 }, (_, index) => WEEKDAY_SINGLE[(start + index) % 7])
    .map((label) => `<span>${label}</span>`)
    .join('')}</div>`;
}

function dotsForDay(day) {
  const events = eventsOnDay(day);
  const colors = [];
  for (const event of events) {
    const color = calendarFor(event).color;
    if (!colors.includes(color)) colors.push(color);
    if (colors.length >= 3) break;
  }
  return colors;
}

function monthGridHTML(selectable = false) {
  const today = startOfDay(new Date());
  const start = startOfWeek(startOfMonth(monthCursor), weekStart());
  const cells = Array.from({ length: 42 }, (_, index) => addDays(start, index));
  const days = cells
    .map((day) => {
      const outside = day.getMonth() !== monthCursor.getMonth();
      const colors = outside ? [] : dotsForDay(day);
      const classes = ['w-day'];
      if (outside) classes.push('outside');
      if (sameDay(day, today)) classes.push('today');
      if (!outside && isRestDay(day)) classes.push('rest');
      if (!outside && isHalfDay(day)) classes.push('half');
      if (sameDay(day, selectedDate)) classes.push('selected');
      const title = `${day.getMonth() + 1}月${day.getDate()}日 ${WEEKDAY_SHORT[day.getDay()]}${
        outside ? '' : isRestDay(day) ? ' · 休息' : isHalfDay(day) ? ' · 半天' : ' · 工作'
      }`;
      return `<button class="${classes.join(' ')}" data-date="${ymd(day)}" title="${title}${
        selectable ? ' · 单击选择' : ''
      }">
        <span class="num">${day.getDate()}</span>
        <span class="dots">${colors.map((color) => `<span class="w-dot" style="--dot-color:${color}"></span>`).join('')}</span>
      </button>`;
    })
    .join('');
  return `${weekdayRowHTML()}<div class="w-month-grid">${days}</div>`;
}

function renderMonth() {
  content.className = 'widget-content';
  content.innerHTML = `
    ${headerHTML({ title: `${monthCursor.getMonth() + 1}月`, sub: String(monthCursor.getFullYear()) })}
    ${monthGridHTML(false)}`;
}

function lunarLineForToday(today) {
  const display = state.settings.display;
  const term = display.solarTerms ? Almanac.termOf(today) : null;
  if (term) return term;
  if (display.lunar) {
    const lunar = Almanac.lunarOf(today);
    if (lunar) return lunar.text;
  }
  return '';
}

function workOptions() {
  return {
    schedule: state.settings.schedule,
    weekStart: state.settings.weekStart,
    workHours: state.settings.workHours,
  };
}

function worklineHTML(status) {
  if (!status) return '';
  return `<div class="w-workline ${status.state}">
    <span class="w-work-dot"></span>
    <span class="w-work-label">${esc(status.label)}</span>
    <span class="w-work-detail">${esc(status.detail)}</span>
  </div>`;
}

function todayPlanNode() {
  const key = ymd(new Date());
  for (const plan of state.plans) {
    if (!plan || calendarFor(plan).visible === false) continue;
    for (const reminder of Array.isArray(plan.reminders) ? plan.reminders : []) {
      if (reminder.date === key) return { plan, reminder };
    }
  }
  return null;
}

function renderToday() {
  const today = new Date();
  const events = eventsOnDay(today);
  const available = Math.max(
    1,
    Math.min(7, Math.floor((window.innerHeight - 250) / 44))
  );
  const shown = events.slice(0, available);
  const hiddenCount = events.length - shown.length;
  const rest = isRestDay(today);
  const half = isHalfDay(today);
  const rows = shown
    .map(
      (event, index) => {
        const calendar = calendarFor(event);
        const start = parseLocal(event.start);
        const end = parseLocal(event.end);
        const time = event.allDay ? '全天' : `${formatTime(start)} – ${formatTime(end)}`;
        return `<button class="w-event" style="--i:${index}" data-event-id="${esc(event.id)}" data-occurrence-date="${esc(event.occurrenceDate)}" title="${esc(event.title)}">
        <span class="w-event-bar" style="--color:${calendar.color}"></span>
        <span class="w-event-main">
          <span class="w-event-title">${Recurrence.isRecurring(event) ? '<span class="w-repeat" aria-hidden="true">↻</span>' : ''}${esc(event.title)}</span>
          <span class="w-event-meta">${time}${event.location ? ` · ${esc(event.location)}` : ''}</span>
        </span>
      </button>`;
      }
    )
    .join('');
  const moon = lunarLineForToday(today);
  const status = Workday.statusFor(today, workOptions());
  const node = todayPlanNode();
  const greeting = Workday.greetingFor(today);
  const holiday = Holidays.info(today);
  const todayLabel = rest
    ? `今天 · ${holiday?.type === 'holiday' ? holiday.name : '休息'}`
    : half
      ? '今天 · 半日'
      : holiday?.type === 'workday'
        ? '今天 · 补班'
        : '今天';

  content.className = 'widget-content w-today-content';
  content.innerHTML = `
    <div class="w-today-top">
      <button class="w-today-caption" data-action="open-day" title="在日历中打开今天">
        <span class="w-today-label ${rest ? 'is-rest' : half ? 'is-half' : ''}">${esc(
          todayLabel
        )}</span>
        <span class="w-today-date">${today.getDate()}</span>
      </button>
      <div class="w-today-meta">
        <strong>${today.getFullYear()}年</strong>${today.getMonth() + 1}月 · ${WEEKDAY_FULL[today.getDay()]}
        ${moon ? `<span class="w-today-moon">${esc(moon)}</span>` : ''}
        <span class="w-greeting">${esc(greeting.detail)}</span>
      </div>
    </div>
    ${worklineHTML(status)}
    ${
      node
        ? `<div class="w-node" title="在日历中打开计划">
            <span class="w-node-kicker">今日节点</span>
            <span class="w-node-text">${esc(node.plan.title)} · ${esc(node.reminder.text)}</span>
          </div>`
        : ''
    }
    <div class="w-divider"></div>
    <div class="w-agenda">
      ${rows || '<div class="w-empty">今天没有日程，给自己留一点空白。</div>'}
      ${hiddenCount > 0 ? `<button class="w-more" data-action="open-day">还有 ${hiddenCount} 个日程</button>` : ''}
    </div>
    <div class="w-today-footer"><button class="w-open-btn" data-action="open-day">在日历中打开</button></div>`;
}

function refreshWorkline() {
  if (widgetType !== 'today') return;
  const current = document.querySelector('.w-workline');
  const status = Workday.statusFor(new Date(), workOptions());
  if (!status) {
    if (current) current.remove();
    return;
  }
  if (current) current.outerHTML = worklineHTML(status);
  else {
    const top = document.querySelector('.w-today-top');
    if (top) top.insertAdjacentHTML('afterend', worklineHTML(status));
  }
}

function renderUpcoming() {
  const limit = Math.max(2, Math.min(8, Math.floor((window.innerHeight - 120) / 50)));
  const events = upcomingEvents(limit);
  const rows = events
    .map((event, index) => {
      const start = parseLocal(event.start);
      const calendar = calendarFor(event);
      const time = event.allDay
        ? '全天'
        : `${formatTime(start)} – ${formatTime(parseLocal(event.end))}`;
      return `<button class="w-up-row" style="--i:${index}" data-event-id="${esc(event.id)}" data-occurrence-date="${esc(event.occurrenceDate)}" title="${esc(event.title)}">
        <span class="w-up-date">
          <span class="w-up-day">${start.getDate()}</span>
          <span class="w-up-month">${start.getMonth() + 1}月 · ${WEEKDAY_SHORT[start.getDay()]}</span>
        </span>
        <span class="w-up-main">
          <span class="w-up-title">${Recurrence.isRecurring(event) ? '<span class="w-repeat" aria-hidden="true">↻</span>' : ''}${esc(event.title)}</span>
          <span class="w-up-meta">
            <span class="w-up-dot" style="--color:${calendar.color}"></span>
            ${esc(calendar.name)}${event.location ? ` · ${esc(event.location)}` : ''}
          </span>
        </span>
        <span class="w-up-time">${time}</span>
      </button>`;
    })
    .join('');

  content.className = 'widget-content';
  content.innerHTML = `
    ${headerHTML({ title: '即将到来', sub: `${events.length} 个日程`, nav: false })}
    <div class="w-upcoming">
      ${rows || `<div class="w-upcoming-empty"><span class="big">✓</span><span>近期没有日程</span></div>`}
    </div>`;
}

function renderMonthAgenda() {
  const today = startOfDay(new Date());
  const events = eventsOnDay(selectedDate);
  const rows = events
    .map((event) => {
      const calendar = calendarFor(event);
      const start = parseLocal(event.start);
      const end = parseLocal(event.end);
      const time = event.allDay ? '全天' : `${formatTime(start)} – ${formatTime(end)}`;
      return `<button class="w-event" data-event-id="${esc(event.id)}" data-occurrence-date="${esc(event.occurrenceDate)}" title="${esc(event.title)}">
        <span class="w-event-bar" style="--color:${calendar.color}"></span>
        <span class="w-event-main">
          <span class="w-event-title">${Recurrence.isRecurring(event) ? '<span class="w-repeat" aria-hidden="true">↻</span>' : ''}${esc(event.title)}</span>
          <span class="w-event-meta">${time}${event.location ? ` · ${esc(event.location)}` : ''}</span>
        </span>
      </button>`;
    })
    .join('');

  const relation = sameDay(selectedDate, today)
    ? '今天'
    : sameDay(selectedDate, addDays(today, 1))
      ? '明天'
      : sameDay(selectedDate, addDays(today, -1))
        ? '昨天'
        : WEEKDAY_FULL[selectedDate.getDay()];
  const selectedRest = isRestDay(selectedDate);
  const selectedHalf = isHalfDay(selectedDate);

  content.className = 'widget-content w-large-content';
  content.innerHTML = `
    ${headerHTML({ title: `${monthCursor.getMonth() + 1}月`, sub: String(monthCursor.getFullYear()) })}
    <div class="w-large-month">${monthGridHTML(true)}</div>
    <div class="w-large-agenda">
      <div class="w-large-head">
        <span class="w-large-day-title">${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日 ${WEEKDAY_FULL[selectedDate.getDay()]}</span>
        <span class="w-large-day-sub">${selectedRest ? '休息日' : selectedHalf ? '半日' : relation}</span>
      </div>
      <div class="w-large-list">
        ${rows || '<div class="w-large-empty">这一天没有日程</div>'}
      </div>
      <div class="w-large-foot">
        <button class="w-open-btn" data-action="open-selected">在日历中打开</button>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* 交互                                                                */
/* ------------------------------------------------------------------ */

function openMain(payload) {
  window.desktop.widget.openMain(payload);
}

function keepSelectedInMonth() {
  const start = startOfMonth(monthCursor);
  const end = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
  if (selectedDate < start || selectedDate > end) {
    const today = startOfDay(new Date());
    selectedDate =
      today >= start && today <= end
        ? today
        : new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  }
}

content.addEventListener('click', (event) => {
  const eventNode = event.target.closest('[data-event-id]');
  if (eventNode) {
    openMain({
      eventId: eventNode.dataset.eventId,
      occurrenceDate: eventNode.dataset.occurrenceDate || undefined,
    });
    return;
  }

  const dayNode = event.target.closest('.w-day');
  if (dayNode) {
    if (widgetType === 'monthAgenda') {
      selectedDate = startOfDay(parseLocal(dayNode.dataset.date));
      render();
    } else {
      openMain({ date: dayNode.dataset.date, view: 'day' });
    }
    return;
  }

  const actionNode = event.target.closest('[data-action]');
  if (!actionNode) return;
  const action = actionNode.dataset.action;

  if (action === 'prev-month') {
    monthCursor = startOfMonth(addMonths(monthCursor, -1));
    keepSelectedInMonth();
    render();
  } else if (action === 'next-month') {
    monthCursor = startOfMonth(addMonths(monthCursor, 1));
    keepSelectedInMonth();
    render();
  } else if (action === 'open-day') {
    openMain({ date: ymd(selectedDate), view: 'day' });
  } else if (action === 'open-selected') {
    openMain({ date: ymd(selectedDate), view: 'day' });
  }
});

content.addEventListener('dblclick', (event) => {
  const dayNode = event.target.closest('.w-day');
  if (!dayNode) return;
  openMain({ date: dayNode.dataset.date, view: 'day' });
});

pinButton.addEventListener('click', () => {
  pinned = !pinned;
  updatePinButton();
  window.desktop.widget.setPin(pinned);
});

closeButton.addEventListener('click', () => {
  window.desktop.widget.close();
});

function updatePinButton() {
  pinButton.classList.toggle('active', pinned);
  pinButton.title = pinned ? '取消置顶' : '固定在其它窗口上方';
  updateMenuLabels();
}

function applyLock() {
  document.body.dataset.locked = locked ? '1' : '0';
  card.dataset.locked = locked ? '1' : '0';
  updateMenuLabels();
}

function showMenu(x, y) {
  widgetMenu.classList.remove('hidden');
  widgetMenu.style.left = '0px';
  widgetMenu.style.top = '0px';
  const rect = widgetMenu.getBoundingClientRect();
  widgetMenu.style.left = `${clamp(x, 8, window.innerWidth - rect.width - 8)}px`;
  widgetMenu.style.top = `${clamp(y, 8, window.innerHeight - rect.height - 8)}px`;
}

function hideMenu() {
  widgetMenu.classList.add('hidden');
}

card.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  showMenu(event.clientX, event.clientY);
});

document.addEventListener('mousedown', (event) => {
  if (!widgetMenu.contains(event.target)) hideMenu();
});

widgetMenu.addEventListener('mousedown', (event) => {
  event.stopPropagation();
});

async function resizeWidget(width, height) {
  try {
    const result = await window.desktop.widget.setSize(width, height);
    if (result) {
      updateSizeClass();
      render();
    }
  } catch {
    // ignore
  }
  hideMenu();
}

widgetMenu.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'size-default') {
    const size = DEFAULT_SIZES[widgetType] || DEFAULT_SIZES.month;
    await resizeWidget(size.width, size.height);
  } else if (action === 'lock') {
    locked = !locked;
    applyLock();
    await window.desktop.widget.setLock(locked);
    hideMenu();
  } else if (action === 'pin') {
    pinned = !pinned;
    updatePinButton();
    window.desktop.widget.setPin(pinned);
    hideMenu();
  } else if (action === 'close') {
    window.desktop.widget.close();
  }
});

window.addEventListener('resize', updateSizeClass);

if (window.ResizeObserver) {
  const cardNode = document.getElementById('widget-card');
  let layoutTimer = null;
  if (cardNode) {
    new ResizeObserver(() => {
      updateSizeClass();
      clearTimeout(layoutTimer);
      layoutTimer = setTimeout(() => {
        if (!resizeState) render();
      }, 180);
    }).observe(cardNode);
  }
}

/* 自由缩放：右下角手柄 */

const resizeGrip = document.getElementById('resize-grip');
let resizeState = null;

function applyResizeFrame() {
  if (!resizeState) return;
  resizeState.frame = 0;
  const pending = resizeState.pending;
  if (pending) window.desktop.widget.setSize(pending.width, pending.height).catch(() => {});
}

resizeGrip?.addEventListener('pointerdown', (event) => {
  if (locked) return;
  event.preventDefault();
  event.stopPropagation();
  resizeGrip.setPointerCapture(event.pointerId);
  document.body.classList.add('is-resizing');
  resizeState = {
    startX: event.screenX,
    startY: event.screenY,
    width: window.innerWidth,
    height: window.innerHeight,
    pending: null,
    frame: 0,
  };
});

resizeGrip?.addEventListener('pointermove', (event) => {
  if (!resizeState) return;
  resizeState.pending = {
    width: clamp(Math.round(resizeState.width + event.screenX - resizeState.startX), 280, 1600),
    height: clamp(Math.round(resizeState.height + event.screenY - resizeState.startY), 280, 1400),
  };
  if (!resizeState.frame) resizeState.frame = requestAnimationFrame(applyResizeFrame);
});

function endGripResize() {
  if (!resizeState) return;
  const pending = resizeState.pending;
  if (pending) window.desktop.widget.setSize(pending.width, pending.height).catch(() => {});
  resizeState = null;
  document.body.classList.remove('is-resizing');
}

resizeGrip?.addEventListener('pointerup', endGripResize);
resizeGrip?.addEventListener('pointercancel', endGripResize);

/* ------------------------------------------------------------------ */
/* 下班庆祝                                                            */
/* ------------------------------------------------------------------ */

const celebration = document.getElementById('celebration');
const celebrationCanvas = document.getElementById('celebration-canvas');
const celebrationKicker = document.getElementById('celebration-kicker');
const celebrationLine = document.getElementById('celebration-line');
const celebrationFrom = document.getElementById('celebration-from');
const celebrationHint = document.getElementById('celebration-hint');
let celebrationHideTimer = null;
let celebrationLeaveTimer = null;
let particleFrame = null;

function maybeCelebrate() {
  if (widgetType !== 'today' || !state.settings.workHours?.enabled) return;
  if (!celebration || !celebration.classList.contains('hidden')) return;
  const event = Workday.upcomingCelebration(new Date(), workOptions());
  if (!event) return;
  const storageKey = `morrow-celebration:${widgetId}:${event.key}`;
  try {
    if (localStorage.getItem(storageKey)) return;
    localStorage.setItem(storageKey, '1');
  } catch {
    // localStorage 不可用时仍然庆祝一次
  }
  playCelebration(event);
}

function playCelebration(event) {
  if (!celebration) return;
  const text = Workday.celebrationText(event);
  celebration.dataset.kind = event.kind;
  celebration.dataset.intensity = String(event.intensity);
  celebrationKicker.textContent = text.kicker;
  celebrationLine.textContent = text.line;
  celebrationFrom.textContent = text.from ? `—— ${text.from}` : '';
  celebrationHint.textContent =
    event.kind === 'lunch'
      ? '好好吃饭，下午见。'
      : event.kind === 'preHoliday'
        ? '今晚属于你，明天慢慢来。'
        : '辛苦了，回家的路上慢一点。';
  clearTimeout(celebrationLeaveTimer);
  celebration.classList.remove('hidden', 'is-leaving');
  requestAnimationFrame(() => celebration.classList.add('is-on'));
  startParticles(event.intensity);
  clearTimeout(celebrationHideTimer);
  celebrationHideTimer = setTimeout(
    () => dismissCelebration(),
    event.kind === 'preHoliday' ? 10500 : event.kind === 'lunch' ? 6500 : 8500
  );
}

function dismissCelebration() {
  if (!celebration || celebration.classList.contains('hidden')) return;
  clearTimeout(celebrationHideTimer);
  celebration.classList.add('is-leaving');
  celebration.classList.remove('is-on');
  stopParticles();
  celebrationLeaveTimer = setTimeout(() => {
    celebration.classList.add('hidden');
    celebration.classList.remove('is-leaving');
  }, 520);
}

celebration?.addEventListener('click', dismissCelebration);

function startParticles(intensity) {
  if (!celebrationCanvas) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  stopParticles();
  const ctx = celebrationCanvas.getContext('2d');
  const width = celebration?.clientWidth || window.innerWidth;
  const height = celebration?.clientHeight || window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  celebrationCanvas.width = Math.round(width * dpr);
  celebrationCanvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const palettes = {
    1: ['#FFE0B0', '#FFEFD3', '#F6C98F'],
    2: ['#FFB199', '#FFD2A6', '#F7A072', '#FFE3C2'],
    3: ['#FFCF5C', '#FF9F68', '#FFE7A8', '#FF7A59'],
  };
  const palette = palettes[intensity] || palettes[2];
  const count = intensity === 1 ? 26 : intensity === 3 ? 92 : 54;
  const shapes = intensity === 1 ? ['dot'] : ['petal', 'petal', 'dot'];
  const particles = Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: -20 - Math.random() * height * 0.7,
    vx: (Math.random() - 0.5) * 0.45,
    vy: 0.35 + Math.random() * 0.8,
    size: 2.5 + Math.random() * (intensity === 3 ? 5 : 4),
    rotation: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.03,
    phase: Math.random() * Math.PI * 2,
    color: palette[Math.floor(Math.random() * palette.length)],
    shape: shapes[Math.floor(Math.random() * shapes.length)],
    alpha: 0.55 + Math.random() * 0.4,
  }));
  const started = performance.now();
  const duration = intensity === 3 ? 9000 : intensity === 1 ? 5200 : 7200;

  function frame(now) {
    const elapsed = now - started;
    const fade =
      elapsed > duration - 1400 ? Math.max(0, (duration - elapsed) / 1400) : 1;
    ctx.clearRect(0, 0, width, height);
    for (const particle of particles) {
      particle.x += particle.vx + Math.sin(particle.phase + now * 0.0011) * 0.35;
      particle.y += particle.vy;
      particle.rotation += particle.spin;
      if (particle.y > height + 30) {
        particle.y = -20;
        particle.x = Math.random() * width;
      }
      ctx.save();
      ctx.globalAlpha = particle.alpha * fade;
      ctx.fillStyle = particle.color;
      if (particle.shape === 'petal') {
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.rotation);
        ctx.beginPath();
        ctx.ellipse(0, 0, particle.size, particle.size * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (elapsed < duration) particleFrame = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, width, height);
  }

  particleFrame = requestAnimationFrame(frame);
}

function stopParticles() {
  if (particleFrame) cancelAnimationFrame(particleFrame);
  particleFrame = null;
  if (celebrationCanvas) {
    const ctx = celebrationCanvas.getContext('2d');
    ctx?.clearRect(0, 0, celebrationCanvas.width, celebrationCanvas.height);
  }
}

setInterval(() => {
  refreshWorkline();
  maybeCelebrate();
}, 20000);

/* ------------------------------------------------------------------ */
/* 同步与启动                                                          */
/* ------------------------------------------------------------------ */

window.desktop.widget.onStoreChanged((data) => {
  state = normalize(data);
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
});

window.desktop.widget.onPinChanged((value) => {
  pinned = Boolean(value);
  updatePinButton();
});

window.desktop.widget.onLockChanged((value) => {
  locked = Boolean(value);
  applyLock();
});

setInterval(() => {
  const key = ymd(new Date());
  if (key !== lastDayKey) {
    lastDayKey = key;
    selectedDate = startOfDay(new Date());
    render();
  }
}, 60000);

async function init() {
  updatePinButton();
  applyLock();
  try {
    const data = await window.desktop.loadData();
    state = normalize(data);
  } catch {
    state = normalize(null);
  }
  keepSelectedInMonth();
  render();
  setTimeout(maybeCelebrate, 1400);
}

init();

/* 开发辅助 */
window.__widgetTest = {
  celebrate(kind = 'off') {
    playCelebration({
      kind,
      intensity: kind === 'lunch' ? 1 : kind === 'preHoliday' ? 3 : 2,
      key: `test-${Date.now()}`,
    });
    return {
      visible: !celebration.classList.contains('hidden'),
      kind: celebration.dataset.kind,
      line: celebrationLine.textContent,
    };
  },
  dismissCelebration() {
    dismissCelebration();
  },
  stats() {
    return {
      type: widgetType,
      id: widgetId,
      pinned,
      locked,
      width: window.innerWidth,
      height: window.innerHeight,
      size: document.body.dataset.size,
      layout: document.body.dataset.layout,
      theme: document.documentElement.dataset.theme,
      events: state.events.length,
      days: document.querySelectorAll('.w-day').length,
      restDays: document.querySelectorAll('.w-day.rest').length,
      weekdayFirst: document.querySelector('.w-weekdays span')?.textContent || '',
      eventRows: document.querySelectorAll('[data-event-id]').length,
      monthTitle: document.querySelector('.w-title')?.textContent?.trim() || '',
      workline: document.querySelector('.w-workline')?.textContent?.trim() || '',
      resizeGrip: Boolean(document.getElementById('resize-grip')),
      sizePresets: document.querySelectorAll('[data-action^="size-"]:not([data-action="size-default"])').length,
    };
  },
};
