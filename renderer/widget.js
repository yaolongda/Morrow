'use strict';

/* ------------------------------------------------------------------ */
/* 基础                                                                */
/* ------------------------------------------------------------------ */

const params = new URLSearchParams(window.location.search);
const widgetType = params.get('type') || 'month';
const widgetId = params.get('id') || '';
const content = document.getElementById('widget-content');
const pinButton = document.getElementById('pin-btn');
const closeButton = document.getElementById('close-btn');

const WEEKDAY_FULL = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const WEEKDAY_SHORT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WEEKDAY_SINGLE = ['日', '一', '二', '三', '四', '五', '六'];

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

/* ------------------------------------------------------------------ */
/* 数据                                                                */
/* ------------------------------------------------------------------ */

let state = {
  calendars: [],
  events: [],
  settings: { weekStart: 1 },
};
let monthCursor = startOfDay(new Date());
let selectedDate = startOfDay(new Date());
let pinned = params.get('pin') === '1';
let lastDayKey = ymd(new Date());
let renderQueued = false;

function normalize(data) {
  const source = data && typeof data === 'object' ? data : {};
  const calendars = Array.isArray(source.calendars) ? source.calendars : [];
  const events = Array.isArray(source.events) ? source.events : [];
  return {
    calendars,
    events,
    settings: {
      weekStart: source.settings?.weekStart === 0 ? 0 : 1,
    },
  };
}

function weekStart() {
  return state.settings.weekStart === 0 ? 0 : 1;
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

function eventsOnDay(day) {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  return state.events
    .filter(isVisible)
    .filter((event) => {
      const start = parseLocal(event.start);
      const end = parseLocal(event.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
      if (event.allDay) {
        return dayStart >= startOfDay(start) && dayStart <= startOfDay(end);
      }
      return start < dayEnd && end > dayStart;
    })
    .sort((a, b) => {
      if (Boolean(a.allDay) !== Boolean(b.allDay)) return a.allDay ? -1 : 1;
      return parseLocal(a.start) - parseLocal(b.start);
    });
}

function upcomingEvents(limit) {
  const now = new Date();
  return state.events
    .filter(isVisible)
    .filter((event) => parseLocal(event.end) >= now)
    .sort((a, b) => parseLocal(a.start) - parseLocal(b.start))
    .slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* 渲染                                                                */
/* ------------------------------------------------------------------ */

function render() {
  document.body.dataset.type = widgetType;
  if (widgetType === 'today') renderToday();
  else if (widgetType === 'upcoming') renderUpcoming();
  else if (widgetType === 'monthAgenda') renderMonthAgenda();
  else renderMonth();
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
      if (sameDay(day, selectedDate)) classes.push('selected');
      const title = `${day.getMonth() + 1}月${day.getDate()}日 ${WEEKDAY_SHORT[day.getDay()]}`;
      return `<button class="${classes.join(' ')}" data-date="${ymd(day)}" title="${title}${selectable ? ' · 单击选择' : ''}">
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

function renderToday() {
  const today = new Date();
  const events = eventsOnDay(today);
  const shown = events.slice(0, 4);
  const hiddenCount = events.length - shown.length;
  const rows = shown
    .map((event) => {
      const calendar = calendarFor(event);
      const start = parseLocal(event.start);
      const end = parseLocal(event.end);
      const time = event.allDay ? '全天' : `${formatTime(start)} – ${formatTime(end)}`;
      return `<button class="w-event" data-event-id="${esc(event.id)}" title="${esc(event.title)}">
        <span class="w-event-bar" style="--color:${calendar.color}"></span>
        <span class="w-event-main">
          <span class="w-event-title">${esc(event.title)}</span>
          <span class="w-event-meta">${time}${event.location ? ` · ${esc(event.location)}` : ''}</span>
        </span>
      </button>`;
    })
    .join('');

  content.className = 'widget-content w-today-content';
  content.innerHTML = `
    <div class="w-today-top">
      <button class="w-today-caption" data-action="open-day" title="在日历中打开今天">
        <span class="w-today-label">今天</span>
        <span class="w-today-date">${today.getDate()}</span>
      </button>
      <div class="w-today-meta"><strong>${today.getFullYear()}年</strong>${today.getMonth() + 1}月 · ${WEEKDAY_FULL[today.getDay()]}</div>
    </div>
    <div class="w-divider"></div>
    <div class="w-agenda">
      ${rows || '<div class="w-empty">今天没有日程</div>'}
      ${hiddenCount > 0 ? `<button class="w-more" data-action="open-day">还有 ${hiddenCount} 个日程</button>` : ''}
    </div>
    <div class="w-today-footer"><button class="w-open-btn" data-action="open-day">在日历中打开</button></div>`;
}

function renderUpcoming() {
  const events = upcomingEvents(4);
  const rows = events
    .map((event) => {
      const start = parseLocal(event.start);
      const calendar = calendarFor(event);
      const time = event.allDay
        ? '全天'
        : `${formatTime(start)} – ${formatTime(parseLocal(event.end))}`;
      return `<button class="w-up-row" data-event-id="${esc(event.id)}" title="${esc(event.title)}">
        <span class="w-up-date">
          <span class="w-up-day">${start.getDate()}</span>
          <span class="w-up-month">${start.getMonth() + 1}月 · ${WEEKDAY_SHORT[start.getDay()]}</span>
        </span>
        <span class="w-up-main">
          <span class="w-up-title">${esc(event.title)}</span>
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
      return `<button class="w-event" data-event-id="${esc(event.id)}" title="${esc(event.title)}">
        <span class="w-event-bar" style="--color:${calendar.color}"></span>
        <span class="w-event-main">
          <span class="w-event-title">${esc(event.title)}</span>
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

  content.className = 'widget-content w-large-content';
  content.innerHTML = `
    ${headerHTML({ title: `${monthCursor.getMonth() + 1}月`, sub: String(monthCursor.getFullYear()) })}
    <div class="w-large-month">${monthGridHTML(true)}</div>
    <div class="w-large-agenda">
      <div class="w-large-head">
        <span class="w-large-day-title">${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日 ${WEEKDAY_FULL[selectedDate.getDay()]}</span>
        <span class="w-large-day-sub">${relation}</span>
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
    openMain({ eventId: eventNode.dataset.eventId });
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
}

document.getElementById('widget-card').addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

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
  try {
    const data = await window.desktop.loadData();
    state = normalize(data);
  } catch {
    state = normalize(null);
  }
  keepSelectedInMonth();
  render();
}

init();

/* 开发辅助 */
window.__widgetTest = {
  stats() {
    return {
      type: widgetType,
      id: widgetId,
      pinned,
      events: state.events.length,
      days: document.querySelectorAll('.w-day').length,
      eventRows: document.querySelectorAll('[data-event-id]').length,
      monthTitle: document.querySelector('.w-title')?.textContent?.trim() || '',
    };
  },
};
