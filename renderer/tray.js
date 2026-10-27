'use strict';

/* 托盘迷你日历：只读取本地数据，不联网。 */

const pad = (value) => String(value).padStart(2, '0');
const WEEKDAY_SINGLE = ['日', '一', '二', '三', '四', '五', '六'];

const ymd = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const startOfDay = (date) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const addMonths = (date, months) => {
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1);
  return result;
};

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

const startOfWeek = (date, weekStart) => {
  const result = startOfDay(date);
  const start = [0, 1, 6].includes(Number(weekStart)) ? Number(weekStart) : 1;
  result.setDate(result.getDate() - ((result.getDay() - start + 7) % 7));
  return result;
};

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (character) => {
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

let state = {
  calendars: [],
  events: [],
  plans: [],
  settings: {
    weekStart: 1,
    schedule: Schedule.defaultSchedule(),
    holidayData: {},
  },
};
let monthCursor = startOfDay(new Date());
let selectedDate = startOfDay(new Date());

function normalize(data) {
  const source = data && typeof data === 'object' ? data : {};
  const settings = source.settings && typeof source.settings === 'object' ? source.settings : {};
  return {
    calendars: Array.isArray(source.calendars) ? source.calendars : [],
    events: Array.isArray(source.events) ? source.events : [],
    plans: Array.isArray(source.plans) ? source.plans : [],
    settings: {
      weekStart: [0, 1, 6].includes(Number(settings.weekStart)) ? Number(settings.weekStart) : 1,
      schedule: Schedule.normalize(settings.schedule),
      holidayData:
        settings.holidayData && typeof settings.holidayData === 'object'
          ? settings.holidayData
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
  return calendarById(event.calendarId) || { color: '#8E8E93', visible: true };
}

function isVisible(event) {
  return calendarFor(event).visible !== false;
}

function eventsOnDay(day) {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  const result = [];
  for (const event of state.events) {
    if (!isVisible(event)) continue;
    for (const occurrence of Recurrence.expand(event, dayStart, dayEnd)) {
      result.push({ ...event, ...occurrence });
    }
  }
  return result;
}

function render() {
  Holidays.setCustom(state.settings.holidayData);
  const today = startOfDay(new Date());
  const start = startOfWeek(startOfMonth(monthCursor), weekStart());
  const cells = Array.from({ length: 42 }, (_, index) => addDays(start, index));
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    WEEKDAY_SINGLE[(weekStart() + index) % 7]
  );

  document.getElementById('tray-month').textContent = `${monthCursor.getFullYear()}年${
    monthCursor.getMonth() + 1
  }月`;
  const holiday = Holidays.info(today);
  document.getElementById('tray-sub').textContent =
    holiday?.type === 'holiday' ? holiday.name : `${today.getMonth() + 1}月${today.getDate()}日`;
  document.getElementById('tray-weekdays').innerHTML = weekdays
    .map((day) => `<span>${day}</span>`)
    .join('');

  document.getElementById('tray-grid').innerHTML = cells
    .map((day) => {
      const key = ymd(day);
      const outside = day.getMonth() !== monthCursor.getMonth();
      const rest = Schedule.dayType(state.settings.schedule, day, weekStart()) === 'rest';
      const colors = [];
      for (const event of outside ? [] : eventsOnDay(day)) {
        const color = event.color || calendarFor(event).color;
        if (!colors.includes(color)) colors.push(color);
        if (colors.length >= 3) break;
      }
      const classes = ['tray-day'];
      if (outside) classes.push('outside');
      if (rest) classes.push('rest');
      if (sameDay(day, today)) classes.push('today');
      return `<button class="${classes.join(' ')}" data-date="${key}" title="${esc(
        `${day.getMonth() + 1}月${day.getDate()}日${rest ? ' · 休息' : ''}`
      )}">
        <span class="num">${day.getDate()}</span>
        <span class="tray-dots">${colors
          .map((color) => `<span class="tray-dot" style="--dot-color:${color}"></span>`)
          .join('')}</span>
      </button>`;
    })
    .join('');
}

document.addEventListener('click', (event) => {
  const nav = event.target.closest('[data-action]');
  if (nav) {
    const action = nav.dataset.action;
    if (action === 'prev') {
      monthCursor = addMonths(monthCursor, -1);
      render();
    } else if (action === 'next') {
      monthCursor = addMonths(monthCursor, 1);
      render();
    } else if (action === 'open') {
      window.desktop.widget.openMain({ date: ymd(new Date()) });
    } else if (action === 'new-event') {
      window.desktop.widget.openMain({ action: 'new-event' });
    }
    return;
  }
  const dayNode = event.target.closest('[data-date]');
  if (dayNode) {
    selectedDate = startOfDay(
      new Date(
        Number(dayNode.dataset.date.slice(0, 4)),
        Number(dayNode.dataset.date.slice(5, 7)) - 1,
        Number(dayNode.dataset.date.slice(8, 10))
      )
    );
    window.desktop.widget.openMain({ date: dayNode.dataset.date, view: 'day' });
  }
});

async function init() {
  try {
    state = normalize(await window.desktop.loadData());
  } catch {
    state = normalize(null);
  }
  render();
}

window.desktop.widget.onStoreChanged((data) => {
  state = normalize(data);
  render();
});

init();
