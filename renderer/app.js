'use strict';

/* ------------------------------------------------------------------ */
/* 常量与工具                                                          */
/* ------------------------------------------------------------------ */

const HOUR_HEIGHT = 56;
const DAY_HEIGHT = HOUR_HEIGHT * 24;
const MONTH_CHIP_HEIGHT = 19;
const CALENDAR_COLORS = [
  '#FF3B30',
  '#FF9500',
  '#FFCC00',
  '#34C759',
  '#007AFF',
  '#AF52DE',
  '#FF2D55',
];

const WEEKDAY_FULL = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const WEEKDAY_SHORT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WEEKDAY_SINGLE = ['日', '一', '二', '三', '四', '五', '六'];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

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

function startOfWeek(date, weekStart = 1) {
  const result = startOfDay(date);
  const diff = (result.getDay() - weekStart + 7) % 7;
  return addDays(result, -diff);
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function daysBetween(from, to) {
  return Math.round((startOfDay(to) - startOfDay(from)) / 86400000);
}

function ymd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateValue(date) {
  return ymd(date);
}

function timeValue(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localValue(date) {
  return `${ymd(date)}T${timeValue(date)}`;
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

function formatMonthDay(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function hexToRgb(hex) {
  const clean = String(hex).replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((char) => char + char)
          .join('')
      : clean;
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  };
}

function textColorOn(hex) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.67 ? '#1d1d1f' : '#ffffff';
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ */
/* 状态                                                                */
/* ------------------------------------------------------------------ */

const DEFAULT_CALENDARS = [
  { id: 'work', name: '工作', color: '#007AFF', visible: true },
  { id: 'personal', name: '个人', color: '#FF9500', visible: true },
  { id: 'family', name: '家庭', color: '#34C759', visible: true },
];

let state = {
  version: 1,
  calendars: DEFAULT_CALENDARS,
  events: [],
  settings: {
    weekStart: 1,
    defaultCalendarId: 'work',
    lastView: 'month',
    sidebarVisible: true,
  },
};

let view = 'month';
let cursor = startOfDay(new Date());
let sidebarVisible = true;
let editingEventId = null;
let calendarDialogMode = 'add';
let editingCalendarId = null;
let contextCalendarId = null;
let pendingConfirm = null;
let searchQuery = '';
let timeScrollTop = null;
let saveTimer = null;
let toastTimer = null;
let clockTimer = null;
let currentDayKey = ymd(new Date());
let galleryWidgets = [];
let dragState = null;

const mainView = $('#main-view');
const eventOverlay = $('#event-overlay');
const calendarOverlay = $('#calendar-overlay');
const confirmOverlay = $('#confirm-overlay');
const widgetOverlay = $('#widget-overlay');
const calendarMenu = $('#calendar-menu');
const appMenu = $('#app-menu');
const searchInput = $('#search-input');
const searchResults = $('#search-results');
const toast = $('#toast');

/* ------------------------------------------------------------------ */
/* 状态标准化与持久化                                                  */
/* ------------------------------------------------------------------ */

function normalizeState(data) {
  const source = data && typeof data === 'object' ? data : {};
  const seenCalendars = new Set();
  let calendars = [];

  for (const calendar of Array.isArray(source.calendars) ? source.calendars : []) {
    if (!calendar || typeof calendar !== 'object') continue;
    const name = typeof calendar.name === 'string' ? calendar.name.trim() : '';
    if (!name) continue;
    let id = calendar.id != null ? String(calendar.id).trim() : '';
    if (!id || seenCalendars.has(id)) id = makeId('cal');
    seenCalendars.add(id);
    const color =
      typeof calendar.color === 'string' && /^#[0-9a-f]{6}$/i.test(calendar.color)
        ? calendar.color
        : CALENDAR_COLORS[calendars.length % CALENDAR_COLORS.length];
    calendars.push({
      id,
      name: name.slice(0, 60),
      color,
      visible: calendar.visible !== false,
    });
    if (calendars.length >= 200) break;
  }

  if (calendars.length === 0) {
    calendars = DEFAULT_CALENDARS.map((calendar) => ({ ...calendar }));
  }

  const calendarIds = new Set(calendars.map((calendar) => calendar.id));
  const seenEvents = new Set();
  const events = [];

  for (const event of Array.isArray(source.events) ? source.events : []) {
    if (!event || typeof event !== 'object') continue;
    const title = typeof event.title === 'string' ? event.title.trim() : '';
    if (!title) continue;
    if (typeof event.start !== 'string' || typeof event.end !== 'string') continue;
    const start = parseLocal(event.start);
    const end = parseLocal(event.end);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end.getTime() <= start.getTime()
    ) {
      continue;
    }
    let id = event.id != null ? String(event.id) : '';
    if (!id || seenEvents.has(id)) id = makeId('ev');
    seenEvents.add(id);
    let calendarId = typeof event.calendarId === 'string' ? event.calendarId : '';
    if (!calendarIds.has(calendarId)) calendarId = calendars[0].id;
    events.push({
      id,
      calendarId,
      title: title.slice(0, 200),
      start: event.start,
      end: event.end,
      allDay: event.allDay === true,
      location:
        typeof event.location === 'string' ? event.location.slice(0, 200) : '',
      notes: typeof event.notes === 'string' ? event.notes.slice(0, 2000) : '',
    });
    if (events.length >= 20000) break;
  }

  events.sort(compareEvents);

  const sourceSettings =
    source.settings && typeof source.settings === 'object' ? source.settings : {};
  const defaultCalendarId = calendarIds.has(String(sourceSettings.defaultCalendarId))
    ? String(sourceSettings.defaultCalendarId)
    : calendars[0].id;
  const lastView = ['month', 'week', 'day', 'year'].includes(sourceSettings.lastView)
    ? sourceSettings.lastView
    : 'month';

  return {
    version: 1,
    calendars,
    events,
    settings: {
      weekStart: sourceSettings.weekStart === 0 ? 0 : 1,
      defaultCalendarId,
      lastView,
      sidebarVisible: sourceSettings.sidebarVisible !== false,
    },
  };
}

function saveState() {
  state.settings.lastView = view;
  state.settings.sidebarVisible = sidebarVisible;
  state.settings.defaultCalendarId =
    state.settings.defaultCalendarId || state.calendars[0]?.id || null;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    window.desktop.saveData(state).catch(() => {});
  }, 180);
}

function calendarById(id) {
  return state.calendars.find((calendar) => calendar.id === id) || null;
}

function calendarFor(event) {
  return (
    calendarById(event?.calendarId) || {
      id: 'unknown',
      name: '未分类',
      color: '#8E8E93',
      visible: true,
    }
  );
}

function isEventVisible(event) {
  return calendarFor(event).visible !== false;
}

function getWeekStart() {
  return state.settings.weekStart === 0 ? 0 : 1;
}

function weekdayOrder() {
  const start = getWeekStart();
  return Array.from({ length: 7 }, (_, index) => (start + index) % 7);
}

function compareEvents(a, b) {
  if (Boolean(a.allDay) !== Boolean(b.allDay)) return a.allDay ? -1 : 1;
  const startDiff = parseLocal(a.start) - parseLocal(b.start);
  if (startDiff !== 0) return startDiff;
  return String(a.title).localeCompare(String(b.title), 'zh-CN');
}

function eventsOnDay(day) {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  return state.events
    .filter(isEventVisible)
    .filter((event) => {
      const start = parseLocal(event.start);
      const end = parseLocal(event.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
      if (event.allDay) {
        const eventStart = startOfDay(start);
        const eventEnd = startOfDay(end);
        return dayStart >= eventStart && dayStart <= eventEnd;
      }
      return start < dayEnd && end > dayStart;
    })
    .sort(compareEvents);
}

function upcomingEvents(limit = 4) {
  const now = new Date();
  return state.events
    .filter(isEventVisible)
    .filter((event) => parseLocal(event.end) >= now)
    .sort((a, b) => parseLocal(a.start) - parseLocal(b.start))
    .slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* 标题                                                                */
/* ------------------------------------------------------------------ */

function viewTitle() {
  if (view === 'year') return `${cursor.getFullYear()}年`;
  if (view === 'day') {
    return `${cursor.getFullYear()}年${cursor.getMonth() + 1}月${cursor.getDate()}日 ${WEEKDAY_FULL[cursor.getDay()]}`;
  }
  if (view === 'month') {
    return `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`;
  }
  const week = Array.from({ length: 7 }, (_, index) =>
    addDays(startOfWeek(cursor, getWeekStart()), index)
  );
  const first = week[0];
  const last = week[6];
  if (first.getFullYear() !== last.getFullYear()) {
    return `${first.getFullYear()}年${first.getMonth() + 1}月${first.getDate()}日 – ${last.getFullYear()}年${last.getMonth() + 1}月${last.getDate()}日`;
  }
  if (first.getMonth() !== last.getMonth()) {
    return `${first.getFullYear()}年${first.getMonth() + 1}月${first.getDate()}日 – ${last.getMonth() + 1}月${last.getDate()}日`;
  }
  return `${first.getFullYear()}年${first.getMonth() + 1}月${first.getDate()}日 – ${last.getDate()}日`;
}

/* ------------------------------------------------------------------ */
/* 渲染：框架                                                          */
/* ------------------------------------------------------------------ */

function render() {
  $('#view-title').textContent = viewTitle();
  $$('#view-switch button').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  renderMiniCalendar();
  renderCalendarList();
  renderMainView();
  if (searchInput.value.trim()) renderSearchResults();
  updateNowLine();
}

function renderMiniCalendar() {
  const title = $('#mini-title');
  const weekdays = $('#mini-weekdays');
  const grid = $('#mini-grid');
  if (!title || !weekdays || !grid) return;

  title.textContent = `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`;
  weekdays.innerHTML = weekdayOrder()
    .map((day) => `<span>${WEEKDAY_SINGLE[day]}</span>`)
    .join('');

  const start = startOfWeek(startOfMonth(cursor), getWeekStart());
  const today = startOfDay(new Date());
  const selected = startOfDay(cursor);
  const cells = Array.from({ length: 42 }, (_, index) => addDays(start, index));

  grid.innerHTML = cells
    .map((day) => {
      const classes = ['mini-day'];
      if (day.getMonth() !== cursor.getMonth()) classes.push('outside');
      if (sameDay(day, today)) classes.push('today');
      if (sameDay(day, selected)) classes.push('selected');
      return `<button class="${classes.join(' ')}" data-date="${ymd(day)}">${day.getDate()}</button>`;
    })
    .join('');
}

function renderCalendarList() {
  const list = $('#calendar-list');
  if (!list) return;
  list.innerHTML = state.calendars
    .map((calendar) => {
      const visible = calendar.visible !== false;
      return `
        <div class="cal-row ${visible ? '' : 'off'}" data-calendar-id="${esc(calendar.id)}" title="点击显示或隐藏 · 右键管理">
          <span class="cal-check" style="--color:${calendar.color}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          </span>
          <span class="cal-name">${esc(calendar.name)}</span>
        </div>`;
    })
    .join('');
}

function renderMainView() {
  if (view === 'month') renderMonthView();
  else if (view === 'week') renderTimeView('week');
  else if (view === 'day') renderTimeView('day');
  else renderYearView();
}

/* ------------------------------------------------------------------ */
/* 渲染：月视图                                                        */
/* ------------------------------------------------------------------ */

function renderMonthView() {
  const today = startOfDay(new Date());
  const weekStart = getWeekStart();
  const gridStart = startOfWeek(startOfMonth(cursor), weekStart);

  const weekdayHTML = weekdayOrder()
    .map((day) => `<div class="month-weekday">${WEEKDAY_SHORT[day]}</div>`)
    .join('');

  const cellsHTML = Array.from({ length: 42 }, (_, index) => {
    const day = addDays(gridStart, index);
    const outside = day.getMonth() !== cursor.getMonth();
    const isToday = sameDay(day, today);
    const events = eventsOnDay(day);
    const chips = events
      .map((event) => {
        const calendar = calendarFor(event);
        const start = parseLocal(event.start);
        const end = parseLocal(event.end);
        const timeLabel = event.allDay
          ? '全天'
          : `${formatTime(start)}–${formatTime(end)}`;
        const tooltip = `${event.title} · ${timeLabel}${event.location ? ` · ${event.location}` : ''}`;
        return `<button class="event-chip" data-event-id="${esc(event.id)}" style="--ev-color:${calendar.color};--ev-text:${textColorOn(calendar.color)}" title="${esc(tooltip)}"><span class="chip-title">${esc(event.title)}</span></button>`;
      })
      .join('');

    return `
      <div class="month-day ${outside ? 'outside' : ''} ${isToday ? 'today' : ''}" data-date="${ymd(day)}">
        <div class="day-head">
          <button class="day-number" data-action="open-day" data-date="${ymd(day)}">${day.getDate()}</button>
        </div>
        <div class="month-events">
          ${chips}
          <button class="more-events hidden" data-action="more" data-date="${ymd(day)}"></button>
        </div>
      </div>`;
  }).join('');

  mainView.innerHTML = `
    <div class="month-view">
      <div class="month-weekdays">${weekdayHTML}</div>
      <div class="month-grid">${cellsHTML}</div>
    </div>`;

  requestAnimationFrame(fitMonthCells);
}

function fitMonthCells() {
  if (view !== 'month') return;
  $$('.month-day', mainView).forEach((cell) => {
    const holder = $('.month-events', cell);
    if (!holder) return;
    const chips = $$('.event-chip', holder);
    const more = $('.more-events', holder);
    if (!more) return;

    const contentHeight = cell.clientHeight - 5; // 上下内边距
    const available = contentHeight - 23; // 日期数字行
    const capacity = Math.max(0, Math.floor((available + (MONTH_CHIP_HEIGHT - 17)) / MONTH_CHIP_HEIGHT));

    if (chips.length > capacity) {
      const visible = Math.max(0, capacity - 1);
      chips.forEach((chip, index) => {
        chip.classList.toggle('hidden', index >= visible);
      });
      more.textContent = `还有 ${chips.length - visible} 个`;
      more.classList.remove('hidden');
    } else {
      chips.forEach((chip) => chip.classList.remove('hidden'));
      more.classList.add('hidden');
    }
  });
}

/* ------------------------------------------------------------------ */
/* 渲染：周 / 日视图                                                   */
/* ------------------------------------------------------------------ */

function renderTimeView(mode) {
  const today = startOfDay(new Date());
  const days =
    mode === 'week'
      ? Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(cursor, getWeekStart()), index))
      : [startOfDay(cursor)];

  const heads = days
    .map(
      (day) => `
      <button class="day-head-cell ${sameDay(day, today) ? 'today' : ''}" data-action="day-head" data-date="${ymd(day)}">
        <span class="dh-weekday">${WEEKDAY_SHORT[day.getDay()]}</span>
        <span class="dh-date">${day.getDate()}</span>
      </button>`
    )
    .join('');

  const allDay = buildAllDayLayout(days);
  const bandHeight = Math.max(28, 6 + allDay.lanes * 21);

  const hours = Array.from({ length: 23 }, (_, index) => index + 1)
    .map(
      (hour) =>
        `<span class="hour-label" style="top:${hour * HOUR_HEIGHT}px">${pad(hour)}:00</span>`
    )
    .join('');

  const columns = days
    .map((day) => {
      const blocks = buildTimedBlocks(day);
      const now = new Date();
      const nowLine = sameDay(day, now)
        ? `<div class="now-line" style="top:${((now.getHours() * 60 + now.getMinutes()) / 1440) * DAY_HEIGHT}px"></div>`
        : '';
      const weekend = day.getDay() === 0 || day.getDay() === 6;
      return `<div class="day-column ${weekend ? 'weekend' : ''} ${sameDay(day, today) ? 'today' : ''}" data-date="${ymd(day)}">${nowLine}${blocks}</div>`;
    })
    .join('');

  mainView.innerHTML = `
    <div class="time-view ${mode === 'day' ? 'day-mode' : ''}">
      <div class="time-head">
        <div class="head-gutter"></div>
        <div class="day-heads">${heads}</div>
      </div>
      <div class="allday-band" style="height:${bandHeight}px">
        <div class="allday-gutter">全天</div>
        <div class="allday-area">${allDay.html}</div>
      </div>
      <div class="time-scroll">
        <div class="time-canvas">
          <div class="time-gutter">${hours}</div>
          <div class="day-columns">${columns}</div>
        </div>
      </div>
    </div>`;

  restoreTimeScroll();
}

function buildAllDayLayout(days) {
  const rangeStart = startOfDay(days[0]);
  const rangeEnd = addDays(startOfDay(days[days.length - 1]), 1);
  const items = [];

  for (const event of state.events) {
    if (!event.allDay || !isEventVisible(event)) continue;
    const start = startOfDay(parseLocal(event.start));
    const end = startOfDay(parseLocal(event.end));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    if (end < rangeStart || start >= rangeEnd) continue;
    const startIndex = clamp(daysBetween(rangeStart, start), 0, days.length - 1);
    const endIndex = clamp(daysBetween(rangeStart, end), 0, days.length - 1);
    if (endIndex < startIndex) continue;
    items.push({ event, startIndex, endIndex });
  }

  items.sort(
    (a, b) =>
      a.startIndex - b.startIndex ||
      b.endIndex - b.startIndex - (a.endIndex - a.startIndex)
  );

  const laneEnds = [];
  for (const item of items) {
    let lane = laneEnds.findIndex((end) => end < item.startIndex);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.endIndex);
    } else {
      laneEnds[lane] = item.endIndex;
    }
    item.lane = lane;
  }

  const html = items
    .map((item) => {
      const calendar = calendarFor(item.event);
      const span = item.endIndex - item.startIndex + 1;
      const left = (item.startIndex / days.length) * 100;
      const width = (span / days.length) * 100;
      const start = parseLocal(item.event.start);
      const end = parseLocal(item.event.end);
      const tooltip = `${item.event.title} · ${formatMonthDay(start)}${sameDay(start, end) ? '' : ` – ${formatMonthDay(end)}`} · 全天`;
      return `<button class="allday-chip" data-event-id="${esc(item.event.id)}"
        style="left:calc(${left}% + 3px);width:calc(${width}% - 6px);top:${4 + item.lane * 21}px;--ev-color:${calendar.color};--ev-text:${textColorOn(calendar.color)}"
        title="${esc(tooltip)}">${esc(item.event.title)}</button>`;
    })
    .join('');

  return { html, lanes: laneEnds.length };
}

function buildTimedBlocks(day) {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  const items = [];

  for (const event of state.events) {
    if (event.allDay || !isEventVisible(event)) continue;
    const start = parseLocal(event.start);
    const end = parseLocal(event.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    if (start >= dayEnd || end <= dayStart) continue;
    const displayStart = Math.max(start.getTime(), dayStart.getTime());
    const displayEnd = Math.min(end.getTime(), dayEnd.getTime());
    if (displayEnd <= displayStart) continue;
    items.push({
      event,
      start: displayStart,
      end: displayEnd,
      startMinutes: (displayStart - dayStart.getTime()) / 60000,
      endMinutes: (displayEnd - dayStart.getTime()) / 60000,
    });
  }

  items.sort((a, b) => a.start - b.start || b.end - a.end);

  const groups = [];
  let group = [];
  let groupEnd = 0;
  for (const item of items) {
    if (group.length > 0 && item.start >= groupEnd) {
      groups.push(group);
      group = [];
      groupEnd = 0;
    }
    group.push(item);
    groupEnd = Math.max(groupEnd, item.end);
  }
  if (group.length > 0) groups.push(group);

  for (const groupItems of groups) {
    const columnEnds = [];
    for (const item of groupItems) {
      let column = columnEnds.findIndex((end) => end <= item.start);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(item.end);
      } else {
        columnEnds[column] = item.end;
      }
      item.column = column;
    }
    for (const item of groupItems) item.columnCount = columnEnds.length;
  }

  return items
    .map((item) => {
      const calendar = calendarFor(item.event);
      const left = (item.column / item.columnCount) * 100;
      const width = 100 / item.columnCount;
      const top = (item.startMinutes / 1440) * DAY_HEIGHT;
      const rawHeight = ((item.endMinutes - item.startMinutes) / 1440) * DAY_HEIGHT;
      const height = Math.max(16, rawHeight - 1);
      const compact = height < 33;
      const start = parseLocal(item.event.start);
      const end = parseLocal(item.event.end);
      const timeLabel = `${formatTime(start)} – ${formatTime(end)}`;
      const tooltip = `${item.event.title} · ${timeLabel}${item.event.location ? ` · ${item.event.location}` : ''}`;
      const showTime = height >= 36;
      const showLocation = height >= 54 && item.event.location;
      return `<button type="button" class="timed-event ${compact ? 'compact' : ''}" data-event-id="${esc(item.event.id)}"
        style="left:calc(${left}% + 1px);width:calc(${width}% - 3px);top:${top}px;height:${height}px;--ev-color:${calendar.color};--ev-text:${textColorOn(calendar.color)}"
        title="${esc(tooltip)}">
        <span class="te-title">${esc(item.event.title)}</span>
        ${showTime ? `<span class="te-time">${timeLabel}</span>` : ''}
        ${showLocation ? `<span class="te-location">${esc(item.event.location)}</span>` : ''}
      </button>`;
    })
    .join('');
}

function restoreTimeScroll() {
  const scroller = $('.time-scroll', mainView);
  if (!scroller) return;
  let target = timeScrollTop;
  if (target === null) {
    const todayColumn = $('.day-column.today', mainView);
    if (todayColumn) {
      const now = new Date();
      const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 1440) * DAY_HEIGHT;
      target = Math.max(0, nowTop - 160);
    } else {
      target = 7 * HOUR_HEIGHT - 24;
    }
  }
  scroller.scrollTop = clamp(target, 0, scroller.scrollHeight - scroller.clientHeight);
  timeScrollTop = null;
}

function captureTimeScroll() {
  const scroller = $('.time-scroll', mainView);
  if (scroller) timeScrollTop = scroller.scrollTop;
}

function updateNowLine() {
  if (view !== 'week' && view !== 'day') return;
  const line = $('.now-line', mainView);
  if (!line) return;
  const now = new Date();
  line.style.top = `${((now.getHours() * 60 + now.getMinutes()) / 1440) * DAY_HEIGHT}px`;
}

/* ------------------------------------------------------------------ */
/* 渲染：年视图                                                        */
/* ------------------------------------------------------------------ */

function renderYearView() {
  const year = cursor.getFullYear();
  const today = startOfDay(new Date());
  const weekStart = getWeekStart();

  const months = Array.from({ length: 12 }, (_, month) => {
    const first = new Date(year, month, 1);
    const gridStart = startOfWeek(first, weekStart);
    const cells = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
    const currentMonth = month === cursor.getMonth();

    const days = cells
      .map((day) => {
        if (day.getMonth() !== month) {
          return '<div class="year-day blank" aria-hidden="true"></div>';
        }
        const events = eventsOnDay(day);
        const dots = events
          .slice(0, 3)
          .map((event) => {
            const calendar = calendarFor(event);
            return `<span class="yd-dot" style="--color:${calendar.color}"></span>`;
          })
          .join('');
        return `<div class="year-day ${sameDay(day, today) ? 'today' : ''}" data-date="${ymd(day)}" data-action="year-day">
            <span class="yd-num">${day.getDate()}</span>
            <span class="yd-dots">${dots}</span>
          </div>`;
      })
      .join('');

    return `
      <section class="year-month">
        <h3 class="year-month-title ${currentMonth ? 'current' : ''}" data-action="open-month" data-month="${month}">${month + 1}月</h3>
        <div class="year-weekdays">${weekdayOrder().map((day) => `<span>${WEEKDAY_SINGLE[day]}</span>`).join('')}</div>
        <div class="year-days">${days}</div>
      </section>`;
  }).join('');

  mainView.innerHTML = `<div class="year-view"><div class="year-grid">${months}</div></div>`;
}

/* ------------------------------------------------------------------ */
/* 交互：导航                                                          */
/* ------------------------------------------------------------------ */

function navigate(step) {
  captureTimeScroll();
  if (view === 'month') cursor = startOfDay(addMonths(cursor, step));
  else if (view === 'week') cursor = addDays(cursor, step * 7);
  else if (view === 'day') cursor = addDays(cursor, step);
  else cursor = startOfDay(addMonths(cursor, step * 12));
  render();
}

function goToday() {
  captureTimeScroll();
  cursor = startOfDay(new Date());
  render();
}

function switchView(nextView) {
  if (!['month', 'week', 'day', 'year'].includes(nextView)) return;
  captureTimeScroll();
  view = nextView;
  timeScrollTop = null;
  saveState();
  render();
}

function openDayView(date) {
  captureTimeScroll();
  cursor = startOfDay(parseLocal(date));
  view = 'day';
  timeScrollTop = null;
  saveState();
  render();
}

/* ------------------------------------------------------------------ */
/* 交互：主视图委托                                                    */
/* ------------------------------------------------------------------ */

mainView.addEventListener('click', (event) => {
  const eventNode = event.target.closest('[data-event-id]');
  if (eventNode) {
    openEventDialog({ eventId: eventNode.dataset.eventId });
    return;
  }

  const actionNode = event.target.closest('[data-action]');
  if (!actionNode) return;
  const action = actionNode.dataset.action;

  if (action === 'open-day') {
    openDayView(actionNode.dataset.date);
  } else if (action === 'more') {
    openDayView(actionNode.dataset.date);
  } else if (action === 'day-head') {
    if (view !== 'day') openDayView(actionNode.dataset.date);
  } else if (action === 'open-month') {
    cursor = new Date(cursor.getFullYear(), Number(actionNode.dataset.month), 1);
    view = 'month';
    timeScrollTop = null;
    saveState();
    render();
  } else if (action === 'year-day') {
    const date = parseLocal(actionNode.dataset.date);
    cursor = date;
    view = 'month';
    timeScrollTop = null;
    saveState();
    render();
  }
});

mainView.addEventListener('dblclick', (event) => {
  if (event.target.closest('[data-event-id]')) return;
  if (event.target.closest('[data-action]')) return;

  if (view === 'month') {
    const cell = event.target.closest('.month-day');
    if (!cell) return;
    openEventDialog({
      date: cell.dataset.date,
      startMinutes: 9 * 60,
      endMinutes: 10 * 60,
    });
    return;
  }

  if (view !== 'week' && view !== 'day') return;

  const allDayArea = event.target.closest('.allday-area');
  if (allDayArea) {
    const days =
      view === 'week'
        ? Array.from({ length: 7 }, (_, index) =>
            addDays(startOfWeek(cursor, getWeekStart()), index)
          )
        : [startOfDay(cursor)];
    const rect = allDayArea.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const index = clamp(Math.floor(ratio * days.length), 0, days.length - 1);
    openEventDialog({ date: ymd(days[index]), allDay: true });
    return;
  }

  const column = event.target.closest('.day-column');
  if (!column) return;
  const minutes = minutesFromPointer(event.clientY, column, 30);
  const endMinutes = Math.min(1440, minutes + 60);
  openEventDialog({
    date: column.dataset.date,
    startMinutes: minutes,
    endMinutes,
  });
});

function minutesFromPointer(clientY, column, snap = 15) {
  const rect = column.getBoundingClientRect();
  const y = clamp(clientY - rect.top, 0, DAY_HEIGHT - 1);
  const raw = (y / DAY_HEIGHT) * 1440;
  return clamp(Math.floor(raw / snap) * snap, 0, 1440 - snap);
}

mainView.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return;
  if (view !== 'week' && view !== 'day') return;
  if (event.target.closest('.timed-event')) return;
  const column = event.target.closest('.day-column');
  if (!column) return;
  if (event.target.closest('.now-line')) return;

  event.preventDefault();
  const startMinutes = minutesFromPointer(event.clientY, column, 15);
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.style.top = `${(startMinutes / 1440) * DAY_HEIGHT}px`;
  ghost.style.height = `${(15 / 1440) * DAY_HEIGHT}px`;
  column.appendChild(ghost);

  dragState = {
    column,
    date: column.dataset.date,
    startMinutes,
    currentMinutes: startMinutes,
    startY: event.clientY,
    moved: false,
    ghost,
    pointerId: event.pointerId,
  };

  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);
});

function dragRange(startMinutes, currentMinutes) {
  let from = Math.min(startMinutes, currentMinutes);
  let to = Math.max(startMinutes, currentMinutes);
  if (to - from < 15) {
    if (currentMinutes >= startMinutes) to = Math.min(1440, from + 15);
    else from = Math.max(0, to - 15);
  }
  return { from, to };
}

function onDragMove(event) {
  if (!dragState) return;
  if (Math.abs(event.clientY - dragState.startY) > 3) dragState.moved = true;
  const current = minutesFromPointer(event.clientY, dragState.column, 15);
  dragState.currentMinutes = current;
  const { from, to } = dragRange(dragState.startMinutes, current);
  dragState.ghost.style.top = `${(from / 1440) * DAY_HEIGHT}px`;
  dragState.ghost.style.height = `${((to - from) / 1440) * DAY_HEIGHT}px`;
}

function onDragEnd() {
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
  if (!dragState) return;

  const { moved, ghost, date, startMinutes, currentMinutes } = dragState;
  ghost.remove();
  dragState = null;

  if (!moved) return;
  const { from, to } = dragRange(startMinutes, currentMinutes);
  if (to <= from) return;
  openEventDialog({ date, startMinutes: from, endMinutes: to });
}

/* ------------------------------------------------------------------ */
/* 交互：工具栏与侧边栏                                                */
/* ------------------------------------------------------------------ */

$('#today-btn').addEventListener('click', goToday);
$('#prev-btn').addEventListener('click', () => navigate(-1));
$('#next-btn').addEventListener('click', () => navigate(1));
$('#add-btn').addEventListener('click', () => openEventDialog({}));
$('#widgets-btn').addEventListener('click', openWidgetGallery);
$('#more-btn').addEventListener('click', (event) => {
  event.stopPropagation();
  if (appMenu.classList.contains('hidden')) showAppMenu();
  else hideAppMenu();
});

function showAppMenu() {
  hideContextMenu();
  hideSearchResults();
  appMenu.classList.remove('hidden');
  appMenu.style.left = '0px';
  appMenu.style.top = '0px';
  const rect = appMenu.getBoundingClientRect();
  const buttonRect = $('#more-btn').getBoundingClientRect();
  const left = clamp(buttonRect.right - rect.width, 8, window.innerWidth - rect.width - 8);
  const top = Math.min(buttonRect.bottom + 6, window.innerHeight - rect.height - 8);
  appMenu.style.left = `${left}px`;
  appMenu.style.top = `${top}px`;
}

function hideAppMenu() {
  appMenu.classList.add('hidden');
}

appMenu.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  hideAppMenu();

  if (action === 'export-config') exportConfiguration();
  else if (action === 'import-config') importConfiguration();
  else if (action === 'open-data') openDataFolder();
  else if (action === 'quit-app') window.desktop.quitApp();
});

async function exportConfiguration() {
  try {
    const result = await window.desktop.config.exportFile(state);
    if (!result || result.canceled) return;
    if (!result.ok) {
      showToast(result.error || '导出失败');
      return;
    }
    showToast('朝暮配置已导出（含日程与小组件）');
  } catch {
    showToast('导出失败，请重试');
  }
}

async function importConfiguration() {
  let result;
  try {
    result = await window.desktop.config.importFile();
  } catch {
    showToast('导入失败，请重试');
    return;
  }
  if (!result || result.canceled) return;
  if (!result.ok) {
    showToast(result.error || '无法读取配置文件');
    return;
  }

  const raw = result.payload?.data;
  if (
    !raw ||
    !Array.isArray(raw.calendars) ||
    raw.calendars.length === 0 ||
    !Array.isArray(raw.events)
  ) {
    showToast('配置文件格式不正确');
    return;
  }

  const importedState = normalizeState(raw);
  const widgets = Array.isArray(result.payload.widgets) ? result.payload.widgets : null;
  const widgetCount = widgets
    ? widgets.filter((widget) => widget && WIDGET_INFO[widget.type]).length
    : null;
  const fileName = result.filePath ? result.filePath.split(/[\\/]/).pop() : '配置文件';

  openConfirm({
    title: '导入配置？',
    text: `将用「${fileName}」覆盖当前 ${state.calendars.length} 个日历、${state.events.length} 个日程${
      widgetCount !== null ? `，并替换 ${widgetCount} 个桌面小组件` : ''
    }。此操作无法撤销。`,
    okLabel: '导入',
    onConfirm: async () => {
      closeAllPopups();
      state = importedState;
      view = ['month', 'week', 'day', 'year'].includes(state.settings.lastView)
        ? state.settings.lastView
        : 'month';
      cursor = startOfDay(new Date());
      sidebarVisible = state.settings.sidebarVisible !== false;
      applySidebarState();
      searchInput.value = '';
      hideSearchResults();
      saveState();
      render();

      if (widgets) {
        try {
          await window.desktop.widgets.importConfigs(widgets);
        } catch {
          // 日程已经导入成功，小组件失败时仍保留数据。
        }
      }
      showToast(`已导入 ${state.events.length} 个日程`);
    },
  });
}

async function openDataFolder() {
  try {
    const error = await window.desktop.openDataFolder();
    if (error) showToast('无法打开数据文件夹');
  } catch {
    showToast('无法打开数据文件夹');
  }
}

$('#view-switch').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-view]');
  if (button) switchView(button.dataset.view);
});

$('#sidebar-toggle').addEventListener('click', () => {
  sidebarVisible = !sidebarVisible;
  applySidebarState();
  saveState();
});

function applySidebarState() {
  document.querySelector('.app').classList.toggle('sidebar-hidden', !sidebarVisible);
}

$('#mini-prev').addEventListener('click', () => {
  cursor = startOfDay(addMonths(cursor, -1));
  render();
});

$('#mini-next').addEventListener('click', () => {
  cursor = startOfDay(addMonths(cursor, 1));
  render();
});

$('#mini-grid').addEventListener('click', (event) => {
  const button = event.target.closest('[data-date]');
  if (!button) return;
  cursor = startOfDay(parseLocal(button.dataset.date));
  if (view === 'year') view = 'month';
  timeScrollTop = null;
  saveState();
  render();
});

$('#calendar-list').addEventListener('click', (event) => {
  const row = event.target.closest('[data-calendar-id]');
  if (!row) return;
  const calendar = calendarById(row.dataset.calendarId);
  if (!calendar) return;
  calendar.visible = calendar.visible === false;
  saveState();
  render();
});

$('#calendar-list').addEventListener('contextmenu', (event) => {
  const row = event.target.closest('[data-calendar-id]');
  if (!row) return;
  event.preventDefault();
  contextCalendarId = row.dataset.calendarId;
  showContextMenu(event.clientX, event.clientY);
});

function showContextMenu(x, y) {
  calendarMenu.classList.remove('hidden');
  calendarMenu.style.left = '0px';
  calendarMenu.style.top = '0px';
  const rect = calendarMenu.getBoundingClientRect();
  calendarMenu.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
  calendarMenu.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;
}

function hideContextMenu() {
  calendarMenu.classList.add('hidden');
}

calendarMenu.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button || !contextCalendarId) return;
  const calendar = calendarById(contextCalendarId);
  hideContextMenu();
  if (!calendar) return;
  if (button.dataset.action === 'rename') {
    openCalendarDialog('rename', calendar.id);
  } else if (button.dataset.action === 'delete') {
    requestCalendarDelete(calendar);
  }
});

document.addEventListener('mousedown', (event) => {
  if (!calendarMenu.contains(event.target)) hideContextMenu();
  if (!searchResults.classList.contains('hidden') && !event.target.closest('#search-box')) {
    hideSearchResults();
  }
  if (!appMenu.contains(event.target) && !event.target.closest('#more-btn')) {
    hideAppMenu();
  }
});

window.addEventListener('resize', () => {
  hideContextMenu();
  hideAppMenu();
  requestAnimationFrame(fitMonthCells);
});

/* ------------------------------------------------------------------ */
/* 搜索                                                                */
/* ------------------------------------------------------------------ */

searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim();
  renderSearchResults();
});

searchInput.addEventListener('focus', () => {
  if (searchInput.value.trim()) renderSearchResults();
});

searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    searchInput.blur();
    hideSearchResults();
    return;
  }
  if (event.key === 'Enter') {
    const first = $('.search-item', searchResults);
    if (first) {
      event.preventDefault();
      openSearchResult(first.dataset.eventId);
    }
  }
});

function renderSearchResults() {
  const query = searchInput.value.trim();
  searchQuery = query;
  if (!query) {
    hideSearchResults();
    return;
  }

  const needle = query.toLowerCase();
  const now = Date.now();
  const matches = state.events
    .filter(isEventVisible)
    .filter((event) => {
      const haystack = `${event.title} ${event.location || ''} ${event.notes || ''}`.toLowerCase();
      return haystack.includes(needle);
    })
    .map((event) => {
      const start = parseLocal(event.start);
      const end = parseLocal(event.end);
      const past = end.getTime() < now;
      return { event, start, past };
    })
    .sort((a, b) => {
      if (a.past !== b.past) return a.past ? 1 : -1;
      return a.past ? b.start - a.start : a.start - b.start;
    })
    .slice(0, 12);

  searchResults.classList.remove('hidden');
  if (matches.length === 0) {
    searchResults.innerHTML = `<div class="search-empty">没有找到“${esc(query)}”</div>`;
    return;
  }

  searchResults.innerHTML = matches
    .map(({ event }) => {
      const calendar = calendarFor(event);
      return `<button class="search-item" data-event-id="${esc(event.id)}">
        <span class="si-dot" style="--color:${calendar.color}"></span>
        <span class="si-text">
          <span class="si-title">${esc(event.title)}</span>
          <span class="si-meta">${esc(formatEventWhen(event))} · ${esc(calendar.name)}</span>
        </span>
      </button>`;
    })
    .join('');
}

function hideSearchResults() {
  searchResults.classList.add('hidden');
}

searchResults.addEventListener('click', (event) => {
  const item = event.target.closest('.search-item');
  if (item) openSearchResult(item.dataset.eventId);
});

function openSearchResult(eventId) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event) return;
  captureTimeScroll();
  cursor = startOfDay(parseLocal(event.start));
  if (view === 'year') view = 'month';
  hideSearchResults();
  searchInput.value = '';
  searchQuery = '';
  render();
  openEventDialog({ eventId });
}

function formatEventWhen(event) {
  const start = parseLocal(event.start);
  const end = parseLocal(event.end);
  const today = startOfDay(new Date());
  let dayLabel;
  const dayDiff = daysBetween(today, start);
  if (dayDiff === 0) dayLabel = '今天';
  else if (dayDiff === 1) dayLabel = '明天';
  else if (dayDiff === -1) dayLabel = '昨天';
  else dayLabel = `${formatMonthDay(start)} ${WEEKDAY_SHORT[start.getDay()]}`;

  if (event.allDay) {
    return sameDay(start, end)
      ? `${dayLabel} · 全天`
      : `${dayLabel} – ${formatMonthDay(end)} · 全天`;
  }
  return `${dayLabel} · ${formatTime(start)} – ${formatTime(end)}`;
}

function focusSearch() {
  searchInput.focus();
  searchInput.select();
}

/* ------------------------------------------------------------------ */
/* 事件编辑器                                                          */
/* ------------------------------------------------------------------ */

function openEventDialog(options = {}) {
  closeWidgetGallery();
  closeCalendarDialog();
  closeConfirmDialog();
  hideContextMenu();
  hideAppMenu();
  hideSearchResults();

  const existing = options.eventId
    ? state.events.find((event) => event.id === options.eventId)
    : null;
  editingEventId = existing ? existing.id : null;

  $('#event-dialog-title').textContent = existing ? '编辑日程' : '新建日程';
  $('#event-delete').classList.toggle('hidden', !existing);
  $('#event-title').value = existing ? existing.title : '';
  $('#event-location').value = existing?.location || '';
  $('#event-notes').value = existing?.notes || '';

  const calendarSelect = $('#event-calendar');
  calendarSelect.innerHTML = state.calendars
    .map((calendar) => `<option value="${esc(calendar.id)}">${esc(calendar.name)}</option>`)
    .join('');

  const fallbackCalendar =
    state.calendars.find((calendar) => calendar.id === state.settings.defaultCalendarId) ||
    state.calendars[0];
  const selectedCalendarId = existing?.calendarId || fallbackCalendar?.id;
  if (selectedCalendarId) calendarSelect.value = selectedCalendarId;
  updateCalendarDot();

  let start;
  let end;
  let allDay = Boolean(existing?.allDay);

  if (existing) {
    start = parseLocal(existing.start);
    end = parseLocal(existing.end);
  } else if (options.date) {
    const base = parseLocal(options.date);
    if (options.startMinutes != null) {
      start = new Date(base);
      start.setHours(0, options.startMinutes, 0, 0);
      end = new Date(base);
      end.setHours(0, options.endMinutes ?? options.startMinutes + 60, 0, 0);
    } else if (options.allDay) {
      start = startOfDay(base);
      end = startOfDay(base);
      end.setHours(23, 59, 0, 0);
    } else {
      start = new Date(base);
      start.setHours(9, 0, 0, 0);
      end = new Date(base);
      end.setHours(10, 0, 0, 0);
    }
    allDay = Boolean(options.allDay);
  } else {
    start = nextRoundedTime();
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }

  $('#event-start-date').value = dateValue(start);
  $('#event-start-time').value = timeValue(start);
  $('#event-end-date').value = dateValue(end);
  $('#event-end-time').value = timeValue(end);
  $('#event-allday').checked = allDay;
  updateAllDayState();

  eventOverlay.classList.remove('hidden');
  requestAnimationFrame(() => {
    const titleInput = $('#event-title');
    titleInput.focus();
    if (!existing) titleInput.select();
  });
}

function nextRoundedTime() {
  const now = new Date();
  now.setSeconds(0, 0);
  if (now.getMinutes() < 30) {
    now.setMinutes(30);
  } else {
    now.setHours(now.getHours() + 1);
    now.setMinutes(0);
  }
  return now;
}

function updateCalendarDot() {
  const select = $('#event-calendar');
  const calendar = calendarById(select.value) || state.calendars[0];
  $('#event-calendar-dot').style.background = calendar?.color || '#8E8E93';
}

function updateAllDayState() {
  const allDay = $('#event-allday').checked;
  $('#event-start-time').disabled = allDay;
  $('#event-end-time').disabled = allDay;
}

$('#event-calendar').addEventListener('change', updateCalendarDot);
$('#event-allday').addEventListener('change', () => {
  const allDay = $('#event-allday').checked;
  if (allDay) {
    $('#event-start-time').value = '00:00';
    $('#event-end-time').value = '23:59';
  } else {
    if ($('#event-start-time').value === '00:00') $('#event-start-time').value = '09:00';
    if ($('#event-end-time').value === '23:59') $('#event-end-time').value = '10:00';
  }
  updateAllDayState();
});

$('#event-save').addEventListener('click', saveEvent);
$('#event-cancel').addEventListener('click', closeEventDialog);
$('#event-delete').addEventListener('click', deleteEditingEvent);

function closeEventDialog() {
  eventOverlay.classList.add('hidden');
  editingEventId = null;
}

function saveEvent() {
  const title = $('#event-title').value.trim() || '新日程';
  const calendarId = $('#event-calendar').value;
  const allDay = $('#event-allday').checked;
  const startDate = $('#event-start-date').value;
  const endDate = $('#event-end-date').value || startDate;

  if (!startDate) {
    showToast('请选择开始日期');
    return;
  }

  let start;
  let end;

  if (allDay) {
    if (endDate < startDate) {
      showToast('结束日期不能早于开始日期');
      return;
    }
    start = `${startDate}T00:00`;
    end = `${endDate}T23:59`;
  } else {
    const startTime = $('#event-start-time').value || '09:00';
    const endTime = $('#event-end-time').value || '10:00';
    start = `${startDate}T${startTime}`;
    end = `${endDate}T${endTime}`;
    if (parseLocal(end) <= parseLocal(start)) {
      showToast('结束时间需要晚于开始时间');
      return;
    }
  }

  const payload = {
    calendarId,
    title,
    start,
    end,
    allDay,
    location: $('#event-location').value.trim(),
    notes: $('#event-notes').value.trim(),
  };

  if (editingEventId) {
    const event = state.events.find((item) => item.id === editingEventId);
    if (event) Object.assign(event, payload);
  } else {
    state.events.push({ id: makeId('ev'), ...payload });
  }

  state.settings.defaultCalendarId = calendarId;
  state.events.sort(compareEvents);
  saveState();
  closeEventDialog();
  render();
}

function deleteEditingEvent() {
  if (!editingEventId) return;
  state.events = state.events.filter((event) => event.id !== editingEventId);
  saveState();
  closeEventDialog();
  render();
  showToast('已删除日程');
}

/* ------------------------------------------------------------------ */
/* 日历管理                                                            */
/* ------------------------------------------------------------------ */

$('#add-calendar-btn').addEventListener('click', () => openCalendarDialog('add'));

function openCalendarDialog(mode, calendarId = null) {
  calendarDialogMode = mode;
  editingCalendarId = calendarId;
  const calendar = calendarId ? calendarById(calendarId) : null;
  const usedColors = new Set(state.calendars.map((item) => item.color));
  const color =
    calendar?.color || CALENDAR_COLORS.find((item) => !usedColors.has(item)) || CALENDAR_COLORS[0];

  $('#calendar-dialog-title').textContent = mode === 'rename' ? '重命名日历' : '新建日历';
  $('#calendar-save').textContent = mode === 'rename' ? '保存' : '添加';
  $('#calendar-name').value = calendar?.name || '';
  renderSwatches(color);
  calendarOverlay.classList.remove('hidden');
  requestAnimationFrame(() => {
    $('#calendar-name').focus();
    $('#calendar-name').select();
  });
}

function renderSwatches(selectedColor) {
  const container = $('#calendar-swatches');
  container.innerHTML = CALENDAR_COLORS.map(
    (color) =>
      `<button class="swatch ${color === selectedColor ? 'selected' : ''}" data-color="${color}" style="--color:${color}" aria-label="${color}"></button>`
  ).join('');
}

$('#calendar-swatches').addEventListener('click', (event) => {
  const swatch = event.target.closest('.swatch');
  if (!swatch) return;
  $$('.swatch', $('#calendar-swatches')).forEach((item) =>
    item.classList.toggle('selected', item === swatch)
  );
});

function closeCalendarDialog() {
  calendarOverlay.classList.add('hidden');
  editingCalendarId = null;
}

$('#calendar-cancel').addEventListener('click', closeCalendarDialog);
$('#calendar-save').addEventListener('click', saveCalendar);

function saveCalendar() {
  const name = $('#calendar-name').value.trim();
  if (!name) {
    showToast('请输入日历名称');
    return;
  }
  const color =
    $('.swatch.selected', $('#calendar-swatches'))?.dataset.color || CALENDAR_COLORS[0];

  if (calendarDialogMode === 'rename' && editingCalendarId) {
    const calendar = calendarById(editingCalendarId);
    if (calendar) {
      calendar.name = name;
      calendar.color = color;
    }
    showToast('已更新日历');
  } else {
    const calendar = {
      id: makeId('cal'),
      name,
      color,
      visible: true,
    };
    state.calendars.push(calendar);
    if (!state.settings.defaultCalendarId) state.settings.defaultCalendarId = calendar.id;
    showToast('已添加日历');
  }

  saveState();
  closeCalendarDialog();
  render();
}

$('#calendar-name').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveCalendar();
  }
});

function openConfirm({ title, text, okLabel = '确定', onConfirm }) {
  pendingConfirm = { title, text, okLabel, onConfirm };
  $('#confirm-title').textContent = title;
  $('#confirm-text').textContent = text;
  $('#confirm-ok').textContent = okLabel;
  confirmOverlay.classList.remove('hidden');
}

function requestCalendarDelete(calendar) {
  if (state.calendars.length <= 1) {
    showToast('至少需要保留一个日历');
    return;
  }
  const eventCount = state.events.filter((event) => event.calendarId === calendar.id).length;
  openConfirm({
    title: `删除“${calendar.name}”？`,
    text:
      eventCount > 0
        ? `该日历中的 ${eventCount} 个日程也会被删除，此操作无法撤销。`
        : '删除后无法恢复。',
    okLabel: '删除',
    onConfirm: () => {
      state.calendars = state.calendars.filter((item) => item.id !== calendar.id);
      state.events = state.events.filter((event) => event.calendarId !== calendar.id);
      if (state.settings.defaultCalendarId === calendar.id) {
        state.settings.defaultCalendarId = state.calendars[0]?.id || null;
      }
      saveState();
      render();
      showToast('已删除日历');
    },
  });
}

$('#confirm-cancel').addEventListener('click', closeConfirmDialog);
$('#confirm-ok').addEventListener('click', () => {
  const action = pendingConfirm?.onConfirm;
  closeConfirmDialog();
  if (action) action();
});

function closeConfirmDialog() {
  confirmOverlay.classList.add('hidden');
  pendingConfirm = null;
}

/* ------------------------------------------------------------------ */
/* 小组件中心                                                          */
/* ------------------------------------------------------------------ */

const WIDGET_INFO = {
  month: {
    name: '月历',
    size: '小号 · 320 × 348',
    description: '一整个月的日程安排，今天和重要日期一目了然。',
    preview: previewMonth,
  },
  today: {
    name: '今天',
    size: '小号 · 320 × 348',
    description: '大号日期与今天的日程，把注意力放在当下。',
    preview: previewToday,
  },
  upcoming: {
    name: '即将到来',
    size: '中号 · 636 × 304',
    description: '接下来几天的会议与安排，最适合放在桌面一侧。',
    preview: previewUpcoming,
  },
  monthAgenda: {
    name: '月历与议程',
    size: '大号 · 636 × 656',
    description: '月历与今日议程合二为一，适合作为桌面的信息中心。',
    preview: previewMonthAgenda,
  },
};

async function openWidgetGallery() {
  closeEventDialog();
  closeCalendarDialog();
  closeConfirmDialog();
  hideContextMenu();
  hideAppMenu();
  hideSearchResults();
  widgetOverlay.classList.remove('hidden');
  await refreshWidgetGallery();
}

function closeWidgetGallery() {
  widgetOverlay.classList.add('hidden');
}

async function refreshWidgetGallery() {
  try {
    galleryWidgets = await window.desktop.widgets.list();
  } catch {
    galleryWidgets = [];
  }
  renderWidgetGallery();
}

function renderWidgetGallery() {
  const gallery = $('#widget-gallery');
  if (!gallery) return;
  gallery.innerHTML = Object.entries(WIDGET_INFO)
    .map(([type, info]) => {
      const count = galleryWidgets.filter((widget) => widget.type === type).length;
      return `<article class="wg-card">
        <div class="wg-preview ${type === 'today' ? 'wg-today-preview' : ''} ${type === 'monthAgenda' ? 'wg-large-preview' : ''}">${info.preview()}</div>
        <div class="wg-info">
          <h3 class="wg-name">${info.name}</h3>
          <p class="wg-meta">${info.size}${count > 0 ? ` · 已添加 ${count} 个` : ''}</p>
          <p class="wg-desc">${info.description}</p>
          <button class="wg-toggle ${count > 0 ? 'added' : ''}" data-action="toggle-widget" data-type="${type}">
            ${count > 0 ? '已添加 · 移除' : '添加到桌面'}
          </button>
        </div>
      </article>`;
    })
    .join('');
}

$('#widget-gallery').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action="toggle-widget"]');
  if (!button) return;
  const type = button.dataset.type;
  const existing = galleryWidgets.filter((widget) => widget.type === type);
  button.disabled = true;
  try {
    if (existing.length > 0) {
      for (const widget of existing) {
        await window.desktop.widgets.remove(widget.id);
      }
      showToast(`已移除「${WIDGET_INFO[type].name}」小组件`);
    } else {
      await window.desktop.widgets.add(type);
      showToast(`已添加「${WIDGET_INFO[type].name}」小组件`);
    }
  } catch {
    showToast('操作失败，请重试');
  }
  await refreshWidgetGallery();
});

$('#widget-close').addEventListener('click', closeWidgetGallery);

/* 小组件预览 */

function previewWeekdayRow() {
  return weekdayOrder()
    .map((day) => `<span>${WEEKDAY_SINGLE[day]}</span>`)
    .join('');
}

function previewMiniGrid(rows = 5, includeEvents = true) {
  const start = startOfWeek(startOfMonth(cursor), getWeekStart());
  const today = startOfDay(new Date());
  const cells = Array.from({ length: rows * 7 }, (_, index) => addDays(start, index));
  return `<div class="wgp-weekdays">${previewWeekdayRow()}</div>
    <div class="wgp-grid">${cells
      .map((day) => {
        const events = includeEvents ? eventsOnDay(day) : [];
        const color = events[0] ? calendarFor(events[0]).color : '';
        const classes = ['wgp-day'];
        if (day.getMonth() !== cursor.getMonth()) classes.push('dim');
        if (sameDay(day, today)) classes.push('today');
        if (events.length > 0) classes.push('has-event');
        return `<div class="${classes.join(' ')}" ${color ? `style="--dot-color:${color}"` : ''}>${day.getDate()}</div>`;
      })
      .join('')}</div>`;
}

function previewMonth() {
  return `<div class="wgp-head"><span>${cursor.getMonth() + 1}月</span><span>${cursor.getFullYear()}</span></div>
    ${previewMiniGrid(5)}`;
}

function previewToday() {
  const today = new Date();
  const events = eventsOnDay(today).slice(0, 3);
  return `<div class="wgp-head"><span>今天</span><span>${today.getFullYear()}年</span></div>
    <div class="wgp-date">${today.getDate()}</div>
    <div class="wgp-date-sub">${today.getMonth() + 1}月 · ${WEEKDAY_FULL[today.getDay()]}</div>
    <div class="wgp-lines">${
      events.length
        ? events
            .map((event) => {
              const calendar = calendarFor(event);
              const time = event.allDay ? '全天' : formatTime(parseLocal(event.start));
              return `<div class="wgp-line"><i style="--color:${calendar.color}"></i><span class="wgp-line-time">${time}</span><span class="wgp-line-title">${esc(event.title)}</span></div>`;
            })
            .join('')
        : '<div class="wgp-empty">今天没有日程</div>'
    }</div>`;
}

function previewUpcoming() {
  const events = upcomingEvents(4);
  const rows = events
    .map((event) => {
      const start = parseLocal(event.start);
      const calendar = calendarFor(event);
      const time = event.allDay ? '全天' : formatTime(start);
      return `<div class="wgp-up-row">
        <div class="wgp-up-date"><b>${start.getDate()}</b><span>${start.getMonth() + 1}月</span></div>
        <div class="wgp-up-line"><i style="--color:${calendar.color}"></i>${esc(event.title)}</div>
        <div class="wgp-up-time">${time}</div>
      </div>`;
    })
    .join('');
  return `<div class="wgp-head"><span>即将到来</span><span>${events.length} 个日程</span></div>
    <div class="wgp-upcoming">${rows || '<div class="wgp-empty">近期没有日程</div>'}</div>`;
}

function previewMonthAgenda() {
  const today = new Date();
  const events = eventsOnDay(today).slice(0, 2);
  return `<div class="wgp-split">
    <div class="wgp-head"><span>${cursor.getMonth() + 1}月</span><span>${cursor.getFullYear()}</span></div>
    ${previewMiniGrid(5, true)}
    <div class="wgp-agenda">
      ${
        events.length
          ? events
              .map((event) => {
                const calendar = calendarFor(event);
                return `<div class="wgp-event"><i style="--color:${calendar.color}"></i><span>${esc(event.title)}</span></div>`;
              })
              .join('')
          : '<div class="wgp-empty">今天没有日程</div>'
      }
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* 提示与浮层                                                          */
/* ------------------------------------------------------------------ */

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1900);
}

[[eventOverlay, closeEventDialog], [calendarOverlay, closeCalendarDialog], [confirmOverlay, closeConfirmDialog], [widgetOverlay, closeWidgetGallery]].forEach(
  ([overlay, close]) => {
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) close();
    });
  }
);

function closeAllPopups() {
  closeEventDialog();
  closeCalendarDialog();
  closeConfirmDialog();
  closeWidgetGallery();
  hideContextMenu();
  hideAppMenu();
  hideSearchResults();
}

/* ------------------------------------------------------------------ */
/* 键盘快捷键                                                          */
/* ------------------------------------------------------------------ */

document.addEventListener('keydown', (event) => {
  const inField = event.target.matches('input, textarea, select');

  if (event.key === 'Escape') {
    if (!confirmOverlay.classList.contains('hidden')) {
      closeConfirmDialog();
      return;
    }
    if (!calendarOverlay.classList.contains('hidden')) {
      closeCalendarDialog();
      return;
    }
    if (!widgetOverlay.classList.contains('hidden')) {
      closeWidgetGallery();
      return;
    }
    if (!eventOverlay.classList.contains('hidden')) {
      closeEventDialog();
      return;
    }
    if (!calendarMenu.classList.contains('hidden')) {
      hideContextMenu();
      return;
    }
    if (!appMenu.classList.contains('hidden')) {
      hideAppMenu();
      return;
    }
    if (!searchResults.classList.contains('hidden')) {
      hideSearchResults();
      searchInput.blur();
      return;
    }
    return;
  }

  if (!eventOverlay.classList.contains('hidden')) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      saveEvent();
    }
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
    event.preventDefault();
    openEventDialog({});
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    focusSearch();
    return;
  }

  if (inField) return;

  if (event.key === '/') {
    event.preventDefault();
    focusSearch();
    return;
  }

  if (event.ctrlKey || event.metaKey || event.altKey) return;

  const key = event.key.toLowerCase();
  if (key === 't') {
    event.preventDefault();
    goToday();
  } else if (key === 'd') {
    event.preventDefault();
    switchView('day');
  } else if (key === 'w') {
    event.preventDefault();
    switchView('week');
  } else if (key === 'm') {
    event.preventDefault();
    switchView('month');
  } else if (key === 'y') {
    event.preventDefault();
    switchView('year');
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    navigate(-1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    navigate(1);
  }
});

/* ------------------------------------------------------------------ */
/* 来从小部件 / 托盘的导航                                             */
/* ------------------------------------------------------------------ */

function handleNavigation(payload) {
  if (!payload || typeof payload !== 'object') return;
  if (payload.action === 'open-widgets') {
    openWidgetGallery();
    return;
  }
  if (payload.action === 'new-event') {
    closeAllPopups();
    openEventDialog({});
    return;
  }

  closeAllPopups();

  if (payload.eventId) {
    const event = state.events.find((item) => item.id === payload.eventId);
    if (event) {
      captureTimeScroll();
      cursor = startOfDay(parseLocal(event.start));
      if (view === 'year') view = 'month';
      saveState();
      render();
      openEventDialog({ eventId: event.id });
    }
    return;
  }

  if (payload.date) {
    captureTimeScroll();
    cursor = startOfDay(parseLocal(payload.date));
    if (payload.view && ['month', 'week', 'day', 'year'].includes(payload.view)) {
      view = payload.view;
      timeScrollTop = null;
      saveState();
      render();
    } else {
      openDayView(payload.date);
    }
  }
}

window.desktop.onNavigate(handleNavigation);
window.desktop.onHidden(() => closeAllPopups());
window.desktop.widgets.onChange(() => {
  if (!widgetOverlay.classList.contains('hidden')) refreshWidgetGallery();
});

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

async function init() {
  try {
    const data = await window.desktop.loadData();
    state = normalizeState(data);
  } catch {
    state = normalizeState(null);
  }

  view = state.settings.lastView;
  cursor = startOfDay(new Date());
  sidebarVisible = state.settings.sidebarVisible !== false;
  applySidebarState();

  render();
  window.desktop.rendererReady();

  clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    const nowKey = ymd(new Date());
    if (nowKey !== currentDayKey) {
      currentDayKey = nowKey;
      render();
    } else {
      updateNowLine();
    }
  }, 30000);
}

init();

/* 仅用于开发与自动截图验证 */
window.__calendarTest = {
  setView(nextView) {
    switchView(nextView);
    return view;
  },
  setDate(dateString) {
    cursor = startOfDay(parseLocal(dateString));
    render();
    return ymd(cursor);
  },
  openEventDialog() {
    openEventDialog({});
  },
  openWidgetGallery() {
    openWidgetGallery();
  },
  closeAll() {
    closeAllPopups();
  },
  stats() {
    return {
      view,
      events: state.events.length,
      calendars: state.calendars.length,
      monthCells: $$('.month-day', mainView).length,
      eventChips: $$('.event-chip', mainView).length,
      timedEvents: $$('.timed-event', mainView).length,
      allDayChips: $$('.allday-chip', mainView).length,
      yearMonths: $$('.year-month', mainView).length,
      dialogOpen: !eventOverlay.classList.contains('hidden'),
      widgetGalleryOpen: !widgetOverlay.classList.contains('hidden'),
      widgetsAdded: galleryWidgets.length,
    };
  },
};
