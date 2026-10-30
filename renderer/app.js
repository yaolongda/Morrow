'use strict';

/* ------------------------------------------------------------------ */
/* 常量与工具                                                          */
/* ------------------------------------------------------------------ */

const HOUR_HEIGHT = 56;
const DAY_HEIGHT = HOUR_HEIGHT * 24;
const MONTH_CHIP_HEIGHT = 19;
const CALENDAR_COLORS = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE', '#FF2D55',
];
const WEEKDAY_FULL = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const WEEKDAY_SHORT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WEEKDAY_SINGLE = ['日', '一', '二', '三', '四', '五', '六'];

const DEFAULT_CALENDARS = [
  { id: 'work', name: '工作', color: '#007AFF', visible: true },
  { id: 'personal', name: '个人', color: '#FF9500', visible: true },
  { id: 'family', name: '家庭', color: '#34C759', visible: true },
];

const DEFAULT_APPEARANCE = {
  theme: 'classic',
  accent: '#FF3B30',
  font: 'system',
  material: 'none',
  panelOpacity: 0.94,
  glass: 8,
  background: null,
};

const DEFAULT_DISPLAY = {
  lunar: true,
  solarTerms: true,
  almanac: false,
  zodiac: false,
  weekNumbers: false,
};

const DEFAULT_PLAN_SETTINGS = {
  showInMonth: true,
  showInWeek: true,
  reminders: true,
};

const DEFAULT_SHORTCUTS = {
  today: 't',
  day: 'd',
  week: 'w',
  month: 'm',
  year: 'y',
  newPlan: 'p',
  prev: 'ArrowLeft',
  next: 'ArrowRight',
};

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

function daysBetween(from, to) {
  return Math.round((startOfDay(to) - startOfDay(from)) / 86400000);
}

function isoWeek(date) {
  const target = startOfDay(date);
  const day = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - day + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDay = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDay + 3);
  return 1 + Math.round((target - firstThursday) / (7 * 86400000));
}

function ymd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function timeValue(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

function formatLocal(date) {
  return `${ymd(date)}T${formatTime(date)}`;
}

function formatMonthDay(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
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

function hexToRgb(hex) {
  const clean = String(hex).replace('#', '');
  const full =
    clean.length === 3
      ? clean.split('').map((char) => char + char).join('')
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

function colorMix(hex, mix, alpha = 1) {
  const { r, g, b } = hexToRgb(hex);
  const target = mix === 'white' ? 255 : 0;
  const ratio = 0.65;
  const nr = Math.round(r * ratio + target * (1 - ratio));
  const ng = Math.round(g * ratio + target * (1 - ratio));
  const nb = Math.round(b * ratio + target * (1 - ratio));
  return `rgba(${nr}, ${ng}, ${nb}, ${alpha})`;
}

/* ------------------------------------------------------------------ */
/* 状态                                                                */
/* ------------------------------------------------------------------ */

let state = {
  version: 3,
  calendars: DEFAULT_CALENDARS,
  events: [],
  plans: [],
  tasks: [],
  eventTemplates: [],
  trash: [],
  settings: {
    weekStart: 1,
    defaultCalendarId: 'work',
    lastView: 'month',
    sidebarVisible: true,
    schedule: Schedule.defaultSchedule(),
    workHours: Workday.defaults(),
    holidayData: {},
    shiftTemplates: [],
    shortcuts: { ...DEFAULT_SHORTCUTS },
    widgets: { smartSort: true, breathing: true, suggestions: true },
    appearance: { ...DEFAULT_APPEARANCE },
    display: { ...DEFAULT_DISPLAY },
    plans: { ...DEFAULT_PLAN_SETTINGS },
  },
};

let view = 'month';
let cursor = startOfDay(new Date());
const navPast = [];
const navFuture = [];
let navSuppress = false;
let sidebarVisible = true;
let editingEventId = null;
let editingOccurrenceDate = null;
let editingScope = 'single';
let editingSeriesRecurrence = null;
let editingAttachments = [];
let calendarDialogMode = 'add';
let editingCalendarId = null;
let contextCalendarId = null;
let pendingConfirm = null;
let searchQuery = '';
let searchFrom = '';
let searchTo = '';
let timeScrollTop = null;
let saveTimer = null;
let toastTimer = null;
let clockTimer = null;
let currentDayKey = ymd(new Date());
let galleryWidgets = [];
let dragState = null;
let reminderShown = false;
let allDayExpanded = false;

const mainView = $('#main-view');
const eventOverlay = $('#event-overlay');
const calendarOverlay = $('#calendar-overlay');
const confirmOverlay = $('#confirm-overlay');
const widgetOverlay = $('#widget-overlay');
const settingsOverlay = $('#settings-overlay');
const planOverlay = $('#plan-overlay');
const reminderOverlay = $('#reminder-overlay');
const eventReminderOverlay = $('#event-reminder-overlay');
const icsOverlay = $('#ics-overlay');
const calendarMenu = $('#calendar-menu');
const appMenu = $('#app-menu');
const searchInput = $('#search-input');
const searchResults = $('#search-results');
const toast = $('#toast');

/* ------------------------------------------------------------------ */
/* 状态标准化                                                          */
/* ------------------------------------------------------------------ */

function normalizeShortcuts(input) {
  const result = { ...DEFAULT_SHORTCUTS };
  if (!input || typeof input !== 'object') return result;
  for (const action of Object.keys(DEFAULT_SHORTCUTS)) {
    const value = typeof input[action] === 'string' ? input[action].trim() : '';
    if (!value) continue;
    if (value.length === 1) result[action] = value.toLowerCase();
    else if (/^Arrow(Left|Right|Up|Down)$/i.test(value)) {
      result[action] = value[0].toUpperCase() + value.slice(1).toLowerCase();
    }
  }
  return result;
}

function normalizeWidgetSettings(input) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    smartSort: source.smartSort !== false,
    breathing: source.breathing !== false,
    suggestions: source.suggestions !== false,
  };
}

function normalizeEventReminder(input) {
  if (!input || typeof input !== 'object') return null;
  const minutes = Math.round(Number(input.minutes));
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 10080) return null;
  return { minutes, system: input.system === true };
}

function normalizeHolidayData(input) {
  if (!input || typeof input !== 'object') return {};
  return window.Holidays ? Holidays.parse(input) : {};
}

function normalizeShiftTemplates(input) {
  const result = [];
  const seen = new Set();
  for (const template of Array.isArray(input) ? input : []) {
    if (!template || typeof template !== 'object') continue;
    const name = typeof template.name === 'string' ? template.name.trim() : '';
    if (!name) continue;
    let id = template.id != null ? String(template.id) : '';
    if (!id || seen.has(id)) id = makeId('shift');
    seen.add(id);
    result.push({
      id,
      name: name.slice(0, 20),
      workHours: Workday.normalize(template.workHours),
    });
    if (result.length >= 20) break;
  }
  return result;
}

function normalizeMilestoneMessages(input) {
  const result = {};
  if (!input || typeof input !== 'object') return result;
  for (const [key, value] of Object.entries(input)) {
    const milestone = Number(key);
    if (![20, 50, 75, 80, 90, 100].includes(milestone)) continue;
    if (typeof value !== 'string' || !value.trim()) continue;
    result[milestone] = value.trim().slice(0, 120);
  }
  return result;
}

function normalizeAttachments(input) {
  const result = [];
  for (const value of Array.isArray(input) ? input : []) {
    if (typeof value !== 'string') continue;
    if (!value.startsWith('data:image/')) continue;
    if (value.length > 400000) continue;
    result.push(value);
    if (result.length >= 3) break;
  }
  return result;
}

function normalizeEventTemplates(input) {
  const result = [];
  const seen = new Set();
  for (const template of Array.isArray(input) ? input : []) {
    if (!template || typeof template !== 'object') continue;
    const name = typeof template.name === 'string' ? template.name.trim() : '';
    if (!name) continue;
    let id = template.id != null ? String(template.id) : '';
    if (!id || seen.has(id)) id = makeId('template');
    seen.add(id);
    result.push({
      id,
      name: name.slice(0, 60),
      title: typeof template.title === 'string' ? template.title.slice(0, 200) : '',
      calendarId: typeof template.calendarId === 'string' ? template.calendarId : '',
      allDay: template.allDay === true,
      duration: Math.max(15, Math.min(10080, Math.round(Number(template.duration) || 60))),
      startTime: /^\d{2}:\d{2}$/.test(template.startTime || '') ? template.startTime : '09:00',
      location: typeof template.location === 'string' ? template.location.slice(0, 200) : '',
      notes: typeof template.notes === 'string' ? template.notes.slice(0, 2000) : '',
      reminder: normalizeEventReminder(template.reminder),
      color: /^#[0-9a-f]{6}$/i.test(template.color || '') ? template.color : null,
    });
    if (result.length >= 30) break;
  }
  return result;
}

function normalizeTasks(input) {
  const result = [];
  const seen = new Set();
  for (const task of Array.isArray(input) ? input : []) {
    if (!task || typeof task !== 'object') continue;
    const title = typeof task.title === 'string' ? task.title.trim() : '';
    if (!title) continue;
    let id = task.id != null ? String(task.id) : '';
    if (!id || seen.has(id)) id = makeId('task');
    seen.add(id);
    const due = typeof task.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(task.due)
      ? task.due
      : '';
    result.push({
      id,
      title: title.slice(0, 160),
      done: task.done === true,
      due,
      createdAt:
        typeof task.createdAt === 'string' ? task.createdAt : new Date().toISOString(),
    });
    if (result.length >= 500) break;
  }
  return result;
}

function normalizeTrash(input) {  const result = [];
  const now = Date.now();
  for (const entry of Array.isArray(input) ? input : []) {
    if (!entry || typeof entry !== 'object') continue;
    const kind = ['event', 'plan', 'occurrence', 'series-split'].includes(entry.kind)
      ? entry.kind
      : null;
    if (!kind) continue;
    const deletedAt = typeof entry.deletedAt === 'string' ? entry.deletedAt : '';
    const deletedTime = Date.parse(deletedAt);
    if (!Number.isFinite(deletedTime) || now - deletedTime > 30 * 86400000) continue;
    const item =
      entry.item && typeof entry.item === 'object' ? entry.item : null;
    const meta =
      entry.meta && typeof entry.meta === 'object' ? entry.meta : {};
    if (kind !== 'occurrence' && !item) continue;
    result.push({
      id: entry.id != null ? String(entry.id) : makeId('trash'),
      kind,
      deletedAt,
      title: typeof entry.title === 'string' ? entry.title.slice(0, 200) : '',
      item,
      meta,
    });
    if (result.length >= 300) break;
  }
  return result;
}

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
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) continue;
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
      color: /^#[0-9a-f]{6}$/i.test(event.color || '') ? event.color : null,
      location: typeof event.location === 'string' ? event.location.slice(0, 200) : '',
      notes: typeof event.notes === 'string' ? event.notes.slice(0, 2000) : '',
      attachments: normalizeAttachments(event.attachments),
      recurrence: Recurrence.normalize(event.recurrence),
      reminder: normalizeEventReminder(event.reminder),
      uid: typeof event.uid === 'string' ? event.uid.slice(0, 200) : '',
    });
    if (events.length >= 20000) break;
  }
  events.sort(compareEvents);

  const seenPlans = new Set();
  const plans = [];
  for (const plan of Array.isArray(source.plans) ? source.plans : []) {
    if (!plan || typeof plan !== 'object') continue;
    const title = typeof plan.title === 'string' ? plan.title.trim() : '';
    const start = typeof plan.start === 'string' ? plan.start.slice(0, 10) : '';
    const end = typeof plan.end === 'string' ? plan.end.slice(0, 10) : '';
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      continue;
    }
    if (end < start) continue;
    let id = plan.id != null ? String(plan.id) : '';
    if (!id || seenPlans.has(id)) id = makeId('plan');
    seenPlans.add(id);
    const calendarId = calendarIds.has(plan.calendarId) ? plan.calendarId : calendars[0].id;
    const reminders = [];
    const seenReminders = new Set();
    for (const reminder of Array.isArray(plan.reminders) ? plan.reminders : []) {
      if (!reminder || typeof reminder !== 'object') continue;
      const date = typeof reminder.date === 'string' ? reminder.date.slice(0, 10) : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const text = typeof reminder.text === 'string' ? reminder.text.trim() : '';
      if (!text) continue;
      let reminderId = reminder.id != null ? String(reminder.id) : '';
      if (!reminderId || seenReminders.has(reminderId)) reminderId = makeId('rem');
      seenReminders.add(reminderId);
      reminders.push({ id: reminderId, date, text: text.slice(0, 120) });
      if (reminders.length >= 30) break;
    }
    const milestonesSeen = [
      ...new Set(
        (Array.isArray(plan.milestonesSeen) ? plan.milestonesSeen : [])
          .map(Number)
          .filter((value) => Number.isInteger(value) && value >= 0 && value <= 100)
      ),
    ].sort((a, b) => a - b);
    plans.push({
      id,
      title: title.slice(0, 120),
      start,
      end,
      calendarId,
      progress: clamp(Math.round(Number(plan.progress) || 0), 0, 100),
      autoProgress: plan.autoProgress === true,
      archived: plan.archived === true,
      repeat: ['none', 'monthly', 'quarterly', 'yearly'].includes(plan.repeat)
        ? plan.repeat
        : 'none',
      milestonesSeen,
      milestoneMessages: normalizeMilestoneMessages(plan.milestoneMessages),
      reminders,
      notes: typeof plan.notes === 'string' ? plan.notes.slice(0, 2000) : '',
    });
    if (plans.length >= 500) break;
  }

  const sourceSettings =
    source.settings && typeof source.settings === 'object' ? source.settings : {};
  const weekStart = [0, 1, 6].includes(Number(sourceSettings.weekStart))
    ? Number(sourceSettings.weekStart)
    : 1;
  const defaultCalendarId = calendarIds.has(String(sourceSettings.defaultCalendarId))
    ? String(sourceSettings.defaultCalendarId)
    : calendars[0].id;
  const lastView = ['month', 'week', 'day', 'year'].includes(sourceSettings.lastView)
    ? sourceSettings.lastView
    : 'month';

  const sourceAppearance =
    sourceSettings.appearance && typeof sourceSettings.appearance === 'object'
      ? sourceSettings.appearance
      : {};
  const background =
    sourceAppearance.background &&
    typeof sourceAppearance.background === 'object' &&
    typeof sourceAppearance.background.dataUrl === 'string' &&
    sourceAppearance.background.dataUrl.startsWith('data:image/') &&
    sourceAppearance.background.dataUrl.length < 8 * 1024 * 1024
      ? {
          dataUrl: sourceAppearance.background.dataUrl,
          opacity: clamp(Number(sourceAppearance.background.opacity) || 0.4, 0.05, 1),
          blur: clamp(Number(sourceAppearance.background.blur) || 0, 0, 30),
          dim: clamp(Number(sourceAppearance.background.dim) || 0, 0, 0.7),
        }
      : null;
  const appearance = {
    theme: Appearance.THEMES[sourceAppearance.theme] ? sourceAppearance.theme : 'classic',
    accent: /^#[0-9a-f]{6}$/i.test(sourceAppearance.accent || '')
      ? sourceAppearance.accent
      : '#FF3B30',
    font: Appearance.FONTS[sourceAppearance.font] ? sourceAppearance.font : 'system',
    material: ['none', 'mica', 'acrylic'].includes(sourceAppearance.material)
      ? sourceAppearance.material
      : 'none',
    panelOpacity: clamp(Number(sourceAppearance.panelOpacity) || 0.94, 0.45, 1),
    glass:
      sourceAppearance.glass == null
        ? 8
        : clamp(Number(sourceAppearance.glass) || 0, 0, 36),
    background,
  };
  const sourceDisplay =
    sourceSettings.display && typeof sourceSettings.display === 'object'
      ? sourceSettings.display
      : {};
  const display = {
    lunar: sourceDisplay.lunar !== false,
    solarTerms: sourceDisplay.solarTerms !== false,
    almanac: sourceDisplay.almanac === true,
    zodiac: sourceDisplay.zodiac === true,
    weekNumbers: sourceDisplay.weekNumbers === true,
  };
  const sourcePlanSettings =
    sourceSettings.plans && typeof sourceSettings.plans === 'object'
      ? sourceSettings.plans
      : {};
  const planSettings = {
    showInMonth: sourcePlanSettings.showInMonth !== false,
    showInWeek: sourcePlanSettings.showInWeek !== false,
    reminders: sourcePlanSettings.reminders !== false,
  };

  return {
    version: 3,
    calendars,
    events,
    plans,
    tasks: normalizeTasks(source.tasks),
    eventTemplates: normalizeEventTemplates(source.eventTemplates),
    trash: normalizeTrash(source.trash),
    settings: {
      weekStart,
      defaultCalendarId,
      lastView,
      sidebarVisible: sourceSettings.sidebarVisible !== false,
      schedule: Schedule.normalize(sourceSettings.schedule),
      workHours: Workday.normalize(sourceSettings.workHours),
      holidayData: normalizeHolidayData(sourceSettings.holidayData),
      shiftTemplates: normalizeShiftTemplates(sourceSettings.shiftTemplates),
      shortcuts: normalizeShortcuts(sourceSettings.shortcuts),
      widgets: normalizeWidgetSettings(sourceSettings.widgets),
      appearance,
      display,
      plans: planSettings,
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
    syncReminders();
  }, 180);
}

/* ------------------------------------------------------------------ */
/* 撤销 / 重做 与 回收站                                                */
/* ------------------------------------------------------------------ */

const HISTORY_LIMIT = 30;
let historyPast = [];
let historyFuture = [];

function snapshotState() {
  return JSON.parse(
    JSON.stringify({
      events: state.events,
      plans: state.plans,
      tasks: state.tasks,
      calendars: state.calendars,
      trash: state.trash || [],
      settings: {
        schedule: state.settings.schedule,
        workHours: state.settings.workHours,
        holidayData: state.settings.holidayData,
        shiftTemplates: state.settings.shiftTemplates,
        shortcuts: state.settings.shortcuts,
        widgets: state.settings.widgets,
        display: state.settings.display,
        plans: state.settings.plans,
      },
    })
  );
}

function recordHistory(label) {
  historyPast.push({ label, snapshot: snapshotState() });
  if (historyPast.length > HISTORY_LIMIT) historyPast.shift();
  historyFuture.length = 0;
}

function restoreHistory(direction) {
  const from = direction === 'undo' ? historyPast : historyFuture;
  const to = direction === 'undo' ? historyFuture : historyPast;
  if (from.length === 0) {
    showToast(direction === 'undo' ? '没有可撤销的操作' : '没有可重做的操作');
    return;
  }
  const entry = from.pop();
  to.push({ label: entry.label, snapshot: snapshotState() });
  state.events = entry.snapshot.events;
  state.plans = entry.snapshot.plans;
  state.tasks = entry.snapshot.tasks || [];
  state.calendars = entry.snapshot.calendars;
  state.trash = entry.snapshot.trash || [];
  if (entry.snapshot.settings) {
    for (const key of [
      'schedule',
      'workHours',
      'holidayData',
      'shiftTemplates',
      'shortcuts',
      'widgets',
      'display',
      'plans',
    ]) {
      if (entry.snapshot.settings[key] !== undefined) {
        state.settings[key] = entry.snapshot.settings[key];
      }
    }
    Holidays.setCustom(state.settings.holidayData);
  }
  closeAllPopups();
  saveState();
  render();
  showToast(`${direction === 'undo' ? '已撤销' : '已重做'}：${entry.label}`);
}

function undo() {
  restoreHistory('undo');
}

function redo() {
  restoreHistory('redo');
}

function addTrashEntry(entry) {
  state.trash = state.trash || [];
  state.trash.unshift({
    id: makeId('trash'),
    deletedAt: new Date().toISOString(),
    ...entry,
  });
  if (state.trash.length > 300) state.trash.length = 300;
}

function removeTrashEntry(id) {
  state.trash = (state.trash || []).filter((entry) => entry.id !== id);
}

function moveEventToTrash(event) {
  addTrashEntry({
    kind: 'event',
    title: event.title,
    item: JSON.parse(JSON.stringify(event)),
    meta: {},
  });
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

function eventColor(event) {
  return event?.color || calendarFor(event).color;
}

function isEventVisible(event) {
  return calendarFor(event).visible !== false;
}

function getWeekStart() {
  return [0, 1, 6].includes(Number(state.settings.weekStart))
    ? Number(state.settings.weekStart)
    : 1;
}

function weekdayOrder() {
  const start = getWeekStart();
  return Array.from({ length: 7 }, (_, index) => (start + index) % 7);
}

function dayType(date) {
  return Schedule.dayType(state.settings.schedule, date, getWeekStart());
}

function isRestDate(date) {
  return dayType(date) === 'rest';
}

function isHalfDate(date) {
  return dayType(date) === 'half';
}

function compareEvents(a, b) {
  if (Boolean(a.allDay) !== Boolean(b.allDay)) return a.allDay ? -1 : 1;
  const startDiff = parseLocal(a.start) - parseLocal(b.start);
  if (startDiff !== 0) return startDiff;
  return String(a.title).localeCompare(String(b.title), 'zh-CN');
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
    if (!isEventVisible(event)) continue;
    for (const occurrence of Recurrence.expand(event, dayStart, dayEnd)) {
      result.push(withOccurrence(event, occurrence));
    }
  }
  return result.sort(compareEvents);
}

function plansOnDay(day) {
  if (!state.settings.plans?.showInMonth) return [];
  const key = ymd(day);
  return state.plans
    .filter((plan) => Plans.visible(plan, state))
    .filter((plan) => plan.start <= key && plan.end >= key)
    .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title, 'zh-CN'));
}

function upcomingEvents(limit = 4) {
  const now = new Date();
  const horizon = addDays(startOfDay(now), 366);
  const result = [];
  for (const event of state.events) {
    if (!isEventVisible(event)) continue;
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
/* 农历与今日信息                                                      */
/* ------------------------------------------------------------------ */

function displayPrefs() {
  return state.settings.display || DEFAULT_DISPLAY;
}

function dayHeadExtra(date) {
  const display = displayPrefs();
  const holiday = window.Holidays?.info(date);
  if (holiday?.type === 'holiday') {
    return { text: holiday.name, isTerm: false, isHoliday: true };
  }
  if (holiday?.type === 'workday') {
    return { text: '补班', isTerm: false, isMakeup: true };
  }
  const term = display.solarTerms ? Almanac.termOf(date) : null;
  if (term) return { text: term, isTerm: true };
  if (display.lunar) {
    const lunar = Almanac.lunarOf(date);
    if (lunar) return { text: lunar.dayName, isTerm: false };
  }
  return null;
}

function nextTermInfo(date) {
  const today = ymd(date);
  let terms = Almanac.termsForYear(date.getFullYear());
  let next = terms.find((term) => term.date >= today);
  if (!next) {
    next = Almanac.termsForYear(date.getFullYear() + 1)[0];
  }
  const nextDate = parseLocal(next.date);
  return {
    name: next.name,
    date: nextDate,
    days: daysBetween(date, nextDate),
    isToday: next.date === today,
  };
}

function renderDayBrief() {
  const el = $('#day-brief');
  if (!el) return;
  const display = displayPrefs();
  const workEnabled = state.settings.workHours?.enabled !== false;
  const visible =
    display.lunar || display.solarTerms || display.almanac || display.zodiac || workEnabled;
  if (!visible) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  const today = new Date();
  const brief = Almanac.briefOf(today);
  const term = nextTermInfo(today);
  const holidayToday = window.Holidays?.info(today);
  const parts = [];

  parts.push(`<div class="brief-head">
    <span class="brief-date">${today.getMonth() + 1}月${today.getDate()}日</span>
    ${
      holidayToday
        ? `<span class="brief-holiday">${esc(holidayToday.name)}</span>`
        : ''
    }
    <span class="brief-lunar">${display.lunar && brief.lunar ? esc(brief.lunar.text) : ''}</span>
  </div>`);
  if (display.lunar && brief.lunar) {
    parts.push(`<div class="brief-sub">${esc(brief.lunar.yearGanZhi)}年 · ${esc(brief.lunar.monthName)}</div>`);
  }
  if (display.solarTerms) {
    parts.push(`<div class="brief-term">${
      term.isToday ? `今日 ${term.name}` : `下一个节气 · ${term.name} · ${term.days} 天后`
    }</div>`);
  }
  if (display.almanac) {
    parts.push(`<div class="brief-yiji">
      <span class="brief-yi">宜</span><span>${brief.yi.slice(0, 3).join(' · ')}</span>
      <span class="brief-ji">忌</span><span>${brief.ji.slice(0, 3).join(' · ')}</span>
    </div>`);
    if (brief.chongSha) {
      parts.push(`<div class="brief-chongsha">${esc(brief.chongSha)}</div>`);
    }
  }
  if (display.zodiac) {
    parts.push(`<div class="brief-zodiac">${brief.zodiac.sign} <span class="brief-stars">${brief.zodiac.stars}</span><span class="brief-lucky">幸运色 ${brief.zodiac.luckyColor} · 数字 ${brief.zodiac.luckyNumber}</span></div>`);
  }

  const workSettings = {
    schedule: state.settings.schedule,
    weekStart: getWeekStart(),
    workHours: state.settings.workHours,
  };
  const workStatus = Workday.statusFor(today, workSettings);
  if (workStatus) {
    parts.push(`<div class="brief-work ${esc(workStatus.state)}">
      <span class="brief-work-label">${esc(workStatus.label)}</span>
      <span class="brief-work-detail">${esc(workStatus.detail)}</span>
    </div>`);
  }
  if (window.Insight) {
    const insight = Insight.today(state, today);
    if (insight.enabled) {
      parts.push(`<div class="brief-insight">
        <span class="brief-insight-free">${esc(insight.free.label)}</span>
        ${insight.suggestion ? `<span class="brief-insight-suggestion">${esc(insight.suggestion)}</span>` : ''}
      </div>`);
    }
  }

  el.classList.remove('hidden');
  el.innerHTML = parts.join('');
}

/* ------------------------------------------------------------------ */
/* 标题                                                                */
/* ------------------------------------------------------------------ */

function viewTitle() {
  if (view === 'year') return `${cursor.getFullYear()}年`;
  if (view === 'day') {
    return `${cursor.getFullYear()}年${cursor.getMonth() + 1}月${cursor.getDate()}日 ${WEEKDAY_FULL[cursor.getDay()]}`;
  }
  if (view === 'month') return `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`;
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
  renderPlanList();
  renderTaskList();
  renderDayBrief();
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
      if (isRestDate(day)) classes.push('rest-day');
      if (isHalfDate(day)) classes.push('half-day');
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
      return `<div class="cal-row ${visible ? '' : 'off'}" data-calendar-id="${esc(
        calendar.id
      )}" title="点击显示或隐藏 · 右键管理">
        <span class="cal-check" style="--color:${calendar.color}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        </span>
        <span class="cal-name">${esc(calendar.name)}</span>
      </div>`;
    })
    .join('');
}

function renderPlanList() {
  const list = $('#plan-list');
  if (!list) return;
  const active = Plans.active(state.plans)
    .filter((plan) => Plans.visible(plan, state))
    .slice(0, 3);
  if (active.length === 0) {
    list.innerHTML = '<div class="plan-empty">还没有计划</div>';
    return;
  }
  list.innerHTML = active
    .map((plan) => {
      const meta = Plans.classify(plan);
      const color = Plans.colorFor(plan, state);
      const info = window.Insight ? Insight.planInfo(state, plan) : null;
      const progress = info ? info.completion : Plans.effectiveProgress(plan);
      const node = Plans.planNodeToday(plan);
      return `<button class="side-plan" data-plan-id="${esc(plan.id)}" style="--plan-color:${color}" title="完成 ${progress}%${
        info ? ` · 时间 ${info.timeProgress}%` : ''
      }${info?.behind ? ' · 进度落后' : ''}">
        <span class="side-plan-top">
          <span class="side-plan-title">${esc(plan.title)}${
            node ? '<span class="side-plan-node">今日节点</span>' : ''
          }</span>
          <span class="side-plan-percent">${progress}%</span>
        </span>
        <span class="side-plan-track"><i style="width:${progress}%"></i></span>
        <span class="side-plan-meta">${meta.name} · ${plan.end.slice(5).replace('-', '/')} 截止${
          plan.autoProgress ? ' · 自动' : ''
        }${info?.behind ? ' · 进度落后' : ''}</span>
      </button>`;
    })
    .join('');
}

function tasksForDay(day) {
  const key = ymd(day);
  return (state.tasks || []).filter((task) => task.due === key);
}

function todayTasks() {
  const today = ymd(new Date());
  return (state.tasks || [])
    .filter((task) => !task.done && task.due && task.due <= today)
    .sort((a, b) => a.due.localeCompare(b.due) || a.createdAt.localeCompare(b.createdAt));
}

function taskDueLabel(task) {
  const today = ymd(new Date());
  if (!task.due) return '';
  if (task.due === today) return '今天';
  if (task.due < today) return '逾期';
  return task.due.slice(5).replace('-', '/');
}

function renderTaskList() {
  const list = $('#task-list');
  if (!list) return;
  const today = ymd(new Date());
  const todayAll = (state.tasks || []).filter((task) => task.due === today);
  const doneToday = todayAll.filter((task) => task.done).length;
  const count = $('#task-count');
  if (count) {
    count.textContent = todayAll.length ? `任务 ${doneToday}/${todayAll.length}` : '';
  }
  const tasks = todayTasks().slice(0, 5);
  list.innerHTML = tasks.length
    ? tasks
        .map(
          (task) => `<button class="task-row ${task.done ? 'done' : ''}" data-task-toggle="${esc(
            task.id
          )}" title="${esc(task.title)}">
            <span class="task-check">${task.done ? '✓' : ''}</span>
            <span class="task-title">${esc(task.title)}</span>
            <span class="task-due ${task.due < ymd(new Date()) ? 'overdue' : ''}">${esc(
              taskDueLabel(task)
            )}</span>
          </button>`
        )
        .join('')
    : '<div class="task-empty">今天还没有任务</div>';
}

function renderTaskOverlay() {
  const list = $('#task-overlay-list');
  if (!list) return;
  const tasks = [...(state.tasks || [])].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return String(a.due).localeCompare(String(b.due)) ||
      String(a.createdAt).localeCompare(String(b.createdAt));
  });
  list.innerHTML = tasks.length
    ? tasks
        .map(
          (task) => `<div class="task-overlay-row ${task.done ? 'done' : ''}" data-task-id="${esc(
            task.id
          )}">
            <button type="button" class="task-check-btn" data-task-toggle="${esc(task.id)}">${
              task.done ? '✓' : ''
            }</button>
            <input class="task-title-input" data-task-title="${esc(task.id)}" maxlength="160" value="${esc(
              task.title
            )}" aria-label="任务名称">
            <input type="date" class="task-due-input" data-task-due="${esc(task.id)}" value="${esc(
              task.due || ''
            )}" aria-label="截止日期">
            <button type="button" class="task-delete-btn" data-task-delete="${esc(
              task.id
            )}" aria-label="删除任务">×</button>
          </div>`
        )
        .join('')
    : '<p class="task-empty">还没有任务。加一件今天想完成的小事吧。</p>';
}

function toggleTask(taskId) {
  const task = (state.tasks || []).find((item) => item.id === taskId);
  if (!task) return;
  task.done = !task.done;
  saveState();
  render();
  if (!$('#task-overlay').classList.contains('hidden')) renderTaskOverlay();
}

function addTask(title, due) {
  const trimmed = String(title || '').trim();
  if (!trimmed) return null;
  const task = {
    id: makeId('task'),
    title: trimmed.slice(0, 160),
    done: false,
    due: /^\d{4}-\d{2}-\d{2}$/.test(due || '') ? due : ymd(new Date()),
    createdAt: new Date().toISOString(),
  };
  state.tasks = state.tasks || [];
  state.tasks.push(task);
  saveState();
  render();
  if (!$('#task-overlay').classList.contains('hidden')) renderTaskOverlay();
  return task;
}

function openTaskOverlay() {
  closeAllPopups();
  renderTaskOverlay();
  $('#task-new-due').value = ymd(new Date());
  $('#task-overlay').classList.remove('hidden');
}

function closeTaskOverlay() {
  $('#task-overlay').classList.add('hidden');
}

$('#task-add-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#task-input');
  if (!input.value.trim()) return;
  addTask(input.value, ymd(new Date()));
  input.value = '';
});

$('#all-tasks-btn').addEventListener('click', openTaskOverlay);
$('#task-close').addEventListener('click', closeTaskOverlay);
$('#task-overlay').addEventListener('mousedown', (event) => {
  if (event.target.id === 'task-overlay') closeTaskOverlay();
});

$('#task-overlay-add').addEventListener('submit', (event) => {
  event.preventDefault();
  const title = $('#task-new-title');
  const due = $('#task-new-due');
  if (!title.value.trim()) return;
  addTask(title.value, due.value || ymd(new Date()));
  title.value = '';
  title.focus();
});

$('#task-list').addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-task-toggle]');
  if (toggle) toggleTask(toggle.dataset.taskToggle);
});

$('#task-overlay-list').addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-task-toggle]');
  if (toggle) {
    toggleTask(toggle.dataset.taskToggle);
    return;
  }
  const remove = event.target.closest('[data-task-delete]');
  if (remove) {
    const id = remove.dataset.taskDelete;
    recordHistory?.('删除任务');
    state.tasks = (state.tasks || []).filter((task) => task.id !== id);
    saveState();
    render();
    renderTaskOverlay();
  }
});

$('#task-overlay-list').addEventListener('change', (event) => {
  const title = event.target.closest('[data-task-title]');
  if (title) {
    const task = (state.tasks || []).find((item) => item.id === title.dataset.taskTitle);
    if (task) {
      task.title = title.value.trim().slice(0, 160) || task.title;
      saveState();
      render();
    }
    return;
  }
  const due = event.target.closest('[data-task-due]');
  if (due) {
    const task = (state.tasks || []).find((item) => item.id === due.dataset.taskDue);
    if (task) {
      task.due = due.value || '';
      saveState();
      render();
      renderTaskOverlay();
    }
  }
});

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
  const showPlans = state.settings.plans?.showInMonth !== false;

  const weekdayHTML = weekdayOrder()
    .map((day) => `<div class="month-weekday">${WEEKDAY_SHORT[day]}</div>`)
    .join('');
  const showWeekNumbers = displayPrefs().weekNumbers === true;
  const weeknumHead = showWeekNumbers ? '<div class="month-weeknum-head">周</div>' : '';
  const weeknumColumn = showWeekNumbers
    ? `<div class="weeknum-column">${Array.from(
        { length: 6 },
        (_, index) => `<span>W${isoWeek(addDays(gridStart, index * 7))}</span>`
      ).join('')}</div>`
    : '';

  const cellsHTML = Array.from({ length: 42 }, (_, index) => {
    const day = addDays(gridStart, index);
    const outside = day.getMonth() !== cursor.getMonth();
    const isToday = sameDay(day, today);
    const rest = isRestDate(day);
    const half = isHalfDate(day);
    const extra = dayHeadExtra(day);
    const holiday = window.Holidays?.info(day);
    const holidayClass =
      holiday?.type === 'holiday' ? 'is-holiday' : holiday?.type === 'workday' ? 'is-makeup' : '';
    const taskCount = (state.tasks || []).filter(
      (task) => !task.done && task.due === ymd(day)
    ).length;
    const events = eventsOnDay(day);
    const plans = showPlans ? plansOnDay(day) : [];

    const planChips = plans.slice(0, 2).map((plan) => {
      const showTitle = plan.start === ymd(day) || index % 7 === 0;
      return Plans.segmentHTML(plan, state, {
        start: plan.start === ymd(day),
        end: plan.end === ymd(day),
        showTitle,
        wide: showTitle,
      });
    });
    const planMore =
      plans.length > 2 ? `<div class="plan-more">还有 ${plans.length - 2} 个计划</div>` : '';

    const chips = events
      .map((event) => {
        const calendar = calendarFor(event);
        const start = parseLocal(event.start);
        const end = parseLocal(event.end);
        const timeLabel = event.allDay ? '全天' : `${formatTime(start)}–${formatTime(end)}`;
        const recurring = Recurrence.isRecurring(event);
        const tooltip = `${event.title} · ${timeLabel}${recurring ? ' · 重复日程' : ''}${
          event.location ? ` · ${event.location}` : ''
        }`;
        return `<button class="event-chip ${recurring ? 'is-recurring' : ''}" data-event-id="${esc(
          event.id
        )}" data-occurrence-date="${esc(event.occurrenceDate)}" style="--ev-color:${
          eventColor(event)
        };--ev-text:${textColorOn(eventColor(event))}" title="${esc(tooltip)}">${
          recurring ? '<span class="chip-repeat" aria-hidden="true">↻</span>' : ''
        }<span class="chip-title">${esc(event.title)}</span></button>`;
      })
      .join('');

    return `<div class="month-day ${outside ? 'outside' : ''} ${isToday ? 'today' : ''} ${
      rest ? 'rest-day' : ''
    } ${half ? 'half-day' : ''} ${holidayClass}" data-date="${ymd(day)}">
      <div class="day-head">
        <button class="day-number" data-action="open-day" data-date="${ymd(day)}">${day.getDate()}</button>
        ${extra ? `<span class="day-lunar ${extra.isTerm ? 'is-term' : ''} ${
          extra.isHoliday ? 'is-holiday' : ''
        } ${extra.isMakeup ? 'is-makeup' : ''}">${esc(extra.text)}</span>` : ''}
        ${taskCount ? `<span class="day-task-count" title="${taskCount} 个任务">✓${taskCount}</span>` : ''}
      </div>
      ${plans.length ? `<div class="month-plans">${planChips.join('')}${planMore}</div>` : ''}
      <div class="month-events">
        ${chips}
        <button class="more-events hidden" data-action="more" data-date="${ymd(day)}"></button>
      </div>
    </div>`;
  }).join('');

  mainView.innerHTML = `<div class="month-view ${showWeekNumbers ? 'with-weeknums' : ''}">
    <div class="month-weekdays">${weeknumHead}${weekdayHTML}</div>
    <div class="month-grid-wrap">${weeknumColumn}<div class="month-grid">${cellsHTML}</div></div>
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

    const planBox = $('.month-plans', cell);
    const planHeight = planBox ? Math.min(planBox.offsetHeight + 2, 60) : 0;
    const contentHeight = cell.clientHeight - 5;
    const available = contentHeight - 23 - planHeight;
    const capacity = Math.max(
      0,
      Math.floor((available + (MONTH_CHIP_HEIGHT - 17)) / MONTH_CHIP_HEIGHT)
    );

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
    .map((day) => {
      const extra = dayHeadExtra(day);
      const rest = isRestDate(day);
      const half = isHalfDate(day);
      return `<button class="day-head-cell ${sameDay(day, today) ? 'today' : ''} ${
        rest ? 'rest-day' : ''
      } ${half ? 'half-day' : ''}" data-action="day-head" data-date="${ymd(day)}">
        <span class="dh-weekday">${WEEKDAY_SHORT[day.getDay()]}</span>
        <span class="dh-date">${day.getDate()}</span>
        ${extra ? `<span class="dh-lunar ${extra.isTerm ? 'is-term' : ''}">${esc(extra.text)}</span>` : ''}
      </button>`;
    })
    .join('');

  const planLayout = buildPlanLayout(days);
  const planBand = planLayout.lanes
    ? `<div class="plan-band" style="height:${6 + planLayout.lanes * 19}px">
        <div class="plan-gutter">计划</div>
        <div class="plan-area">${planLayout.html}</div>
      </div>`
    : '';

  const allDay = buildAllDayLayout(days, mode === 'day' ? 3 : 2);
  const bandHeight = Math.max(28, 6 + allDay.bandLanes * 21);
  const showWeekNumbers = displayPrefs().weekNumbers === true;
  const weekBadge = showWeekNumbers
    ? `<span class="weeknum-badge">W${isoWeek(days[0])}</span>`
    : '';

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
      const rest = isRestDate(day);
      const half = isHalfDate(day);
      return `<div class="day-column ${rest ? 'rest-day' : ''} ${half ? 'half-day' : ''} ${
        sameDay(day, today) ? 'today' : ''
      }" data-date="${ymd(day)}">${nowLine}${blocks}</div>`;
    })
    .join('');

  mainView.innerHTML = `<div class="time-view ${mode === 'day' ? 'day-mode' : ''}">
    <div class="time-head">
      <div class="head-gutter">${weekBadge}</div>
      <div class="day-heads">${heads}</div>
    </div>
    ${planBand}
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

function buildPlanLayout(days) {
  if (state.settings.plans?.showInWeek === false) return { html: '', lanes: 0 };
  const rangeStart = startOfDay(days[0]);
  const rangeEnd = addDays(startOfDay(days[days.length - 1]), 1);
  const items = [];

  for (const plan of state.plans) {
    if (!Plans.visible(plan, state)) continue;
    const start = parseLocal(plan.start);
    const end = addDays(parseLocal(plan.end), 1);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    if (end <= rangeStart || start >= rangeEnd) continue;
    const startIndex = clamp(daysBetween(rangeStart, start), 0, days.length - 1);
    const endIndex = clamp(daysBetween(rangeStart, addDays(end, -1)), 0, days.length - 1);
    if (endIndex < startIndex) continue;
    items.push({ plan, startIndex, endIndex });
  }

  items.sort(
    (a, b) => a.startIndex - b.startIndex || b.endIndex - b.startIndex - (a.endIndex - a.startIndex)
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
      const span = item.endIndex - item.startIndex + 1;
      const left = (item.startIndex / days.length) * 100;
      const width = (span / days.length) * 100;
      return Plans.segmentHTML(item.plan, state, {
        start: item.startIndex === 0 || item.plan.start === ymd(days[item.startIndex]),
        end:
          item.endIndex === days.length - 1 ||
          item.plan.end === ymd(days[item.endIndex]),
        showTitle: true,
        wide: span > 1,
        style: `left:calc(${left}% + 3px);width:calc(${width}% - 6px);top:${
          4 + item.lane * 19
        }px;height:18px;`,
      });
    })
    .join('');

  return { html, lanes: laneEnds.length };
}

function buildAllDayLayout(days, maxLanes = 3) {
  const rangeStart = startOfDay(days[0]);
  const rangeEnd = addDays(startOfDay(days[days.length - 1]), 1);
  const items = [];

  for (const event of state.events) {
    if (!event.allDay || !isEventVisible(event)) continue;
    for (const occurrence of Recurrence.expand(event, rangeStart, rangeEnd)) {
      const start = startOfDay(parseLocal(occurrence.start));
      const end = startOfDay(parseLocal(occurrence.end));
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      if (end < rangeStart || start >= rangeEnd) continue;
      const startIndex = clamp(daysBetween(rangeStart, start), 0, days.length - 1);
      const endIndex = clamp(daysBetween(rangeStart, end), 0, days.length - 1);
      if (endIndex < startIndex) continue;
      items.push({ event: withOccurrence(event, occurrence), startIndex, endIndex });
    }
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
    .filter((item) => allDayExpanded || item.lane < maxLanes)
    .map((item) => {
      const calendar = calendarFor(item.event);
      const span = item.endIndex - item.startIndex + 1;
      const left = (item.startIndex / days.length) * 100;
      const width = (span / days.length) * 100;
      const start = parseLocal(item.event.start);
      const end = parseLocal(item.event.end);
      const recurring = Recurrence.isRecurring(item.event);
      const tooltip = `${item.event.title} · ${formatMonthDay(start)}${
        sameDay(start, end) ? '' : ` – ${formatMonthDay(end)}`
      } · 全天${recurring ? ' · 重复日程' : ''}`;
      return `<button class="allday-chip ${recurring ? 'is-recurring' : ''}" data-event-id="${esc(
        item.event.id
      )}" data-occurrence-date="${esc(item.event.occurrenceDate)}"
        style="left:calc(${left}% + 3px);width:calc(${width}% - 6px);top:${
        4 + item.lane * 21
      }px;--ev-color:${eventColor(item.event)};--ev-text:${textColorOn(eventColor(item.event))}"
        title="${esc(tooltip)}">${esc(item.event.title)}</button>`;
    })
    .join('');

  const totalLanes = laneEnds.length;
  const visibleLanes = allDayExpanded ? totalLanes : Math.min(totalLanes, maxLanes);
  const hiddenCount = items.filter((item) => item.lane >= visibleLanes).length;
  const showToggle = totalLanes > maxLanes;
  const toggleHTML = showToggle
    ? `<button type="button" class="allday-more" data-action="toggle-allday" style="top:${
        4 + visibleLanes * 21
      }px">${
        allDayExpanded ? '收起全天日程' : `还有 ${hiddenCount} 个全天日程`
      }</button>`
    : '';

  return {
    html: html + toggleHTML,
    lanes: totalLanes,
    bandLanes: visibleLanes + (showToggle ? 1 : 0),
    hiddenCount,
    expanded: allDayExpanded,
  };
}

function buildTimedBlocks(day) {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  const items = [];

  for (const event of state.events) {
    if (event.allDay || !isEventVisible(event)) continue;
    for (const occurrence of Recurrence.expand(event, dayStart, dayEnd)) {
      const start = parseLocal(occurrence.start);
      const end = parseLocal(occurrence.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      if (start >= dayEnd || end <= dayStart) continue;
      const displayStart = Math.max(start.getTime(), dayStart.getTime());
      const displayEnd = Math.min(end.getTime(), dayEnd.getTime());
      if (displayEnd <= displayStart) continue;
      items.push({
        event: withOccurrence(event, occurrence),
        start: displayStart,
        end: displayEnd,
        startMinutes: (displayStart - dayStart.getTime()) / 60000,
        endMinutes: (displayEnd - dayStart.getTime()) / 60000,
      });
    }
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
      const recurring = Recurrence.isRecurring(item.event);
      const tooltip = `${item.event.title} · ${timeLabel}${recurring ? ' · 重复日程' : ''}${
        item.event.location ? ` · ${item.event.location}` : ''
      }`;
      const showTime = height >= 36;
      const showLocation = height >= 54 && item.event.location;
      return `<button type="button" class="timed-event ${compact ? 'compact' : ''} ${
        recurring ? 'is-recurring' : ''
      }" data-event-id="${esc(item.event.id)}" data-occurrence-date="${esc(
        item.event.occurrenceDate
      )}"
        style="left:calc(${left}% + 1px);width:calc(${width}% - 3px);top:${top}px;height:${height}px;--ev-color:${
        eventColor(item.event)
      };--ev-text:${textColorOn(eventColor(item.event))}"
        title="${esc(tooltip)}">
        <span class="te-title">${recurring ? '<span class="te-repeat" aria-hidden="true">↻</span>' : ''}${esc(
          item.event.title
        )}</span>
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
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const monthPlans = state.plans.filter((plan) => {
      if (!Plans.visible(plan, state)) return false;
      const start = parseLocal(plan.start);
      const end = parseLocal(plan.end);
      return start <= monthEnd && end >= monthStart;
    });

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
            return `<span class="yd-dot" style="--color:${eventColor(event)}"></span>`;
          })
          .join('');
        return `<div class="year-day ${sameDay(day, today) ? 'today' : ''} ${
          isRestDate(day) ? 'rest-day' : ''
        } ${isHalfDate(day) ? 'half-day' : ''}" data-date="${ymd(day)}" data-action="year-day">
            <span class="yd-num">${day.getDate()}</span>
            <span class="yd-dots">${dots}</span>
          </div>`;
      })
      .join('');

    const planMarks = monthPlans
      .slice(0, 3)
      .map((plan) => `<span class="year-plan-dot" style="--color:${Plans.colorFor(plan, state)}"></span>`)
      .join('');

    return `<section class="year-month">
      <h3 class="year-month-title ${currentMonth ? 'current' : ''}" data-action="open-month" data-month="${month}">
        ${month + 1}月${planMarks ? `<span class="year-plan-marks">${planMarks}</span>` : ''}
      </h3>
      <div class="year-weekdays">${weekdayOrder().map((day) => `<span>${WEEKDAY_SINGLE[day]}</span>`).join('')}</div>
      <div class="year-days">${days}</div>
    </section>`;
  }).join('');

  mainView.innerHTML = `<div class="year-view"><div class="year-grid">${months}</div></div>`;
}

/* ------------------------------------------------------------------ */
/* 交互：导航                                                          */
/* ------------------------------------------------------------------ */

function navSnapshot() {
  return { view, cursor: ymd(cursor) };
}

function updateNavButtons() {
  const back = $('#nav-back-btn');
  const forward = $('#nav-forward-btn');
  if (back) back.disabled = navPast.length === 0;
  if (forward) forward.disabled = navFuture.length === 0;
}

function pushNavHistory() {
  if (navSuppress) return;
  const snapshot = navSnapshot();
  const last = navPast[navPast.length - 1];
  if (last && last.view === snapshot.view && last.cursor === snapshot.cursor) return;
  navPast.push(snapshot);
  if (navPast.length > 80) navPast.shift();
  navFuture.length = 0;
  updateNavButtons();
}

function applyNavSnapshot(snapshot) {
  if (!snapshot) return;
  navSuppress = true;
  view = ['month', 'week', 'day', 'year'].includes(snapshot.view) ? snapshot.view : 'month';
  cursor = startOfDay(parseLocal(snapshot.cursor));
  timeScrollTop = null;
  saveState();
  render();
  navSuppress = false;
  updateNavButtons();
}

function navigateBack() {
  if (navPast.length === 0) return;
  navFuture.push(navSnapshot());
  applyNavSnapshot(navPast.pop());
}

function navigateForward() {
  if (navFuture.length === 0) return;
  navPast.push(navSnapshot());
  applyNavSnapshot(navFuture.pop());
}

function navigate(step) {
  captureTimeScroll();
  pushNavHistory();
  if (view === 'month') cursor = startOfDay(addMonths(cursor, step));
  else if (view === 'week') cursor = addDays(cursor, step * 7);
  else if (view === 'day') cursor = addDays(cursor, step);
  else cursor = startOfDay(addMonths(cursor, step * 12));
  render();
}

function goToday() {
  pushNavHistory();
  captureTimeScroll();
  cursor = startOfDay(new Date());
  view = 'month';
  saveState();
  render();
}

function switchView(nextView) {
  if (!['month', 'week', 'day', 'year'].includes(nextView)) return;
  captureTimeScroll();
  pushNavHistory();
  view = nextView;
  timeScrollTop = null;
  saveState();
  render();
}

function openDayView(date) {
  captureTimeScroll();
  pushNavHistory();
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
  const planNode = event.target.closest('[data-plan-id]');
  if (planNode) {
    openPlanEditor(planNode.dataset.planId);
    return;
  }

  const eventNode = event.target.closest('[data-event-id]');
  if (eventNode) {
    openEventDialog({
      eventId: eventNode.dataset.eventId,
      occurrenceDate: eventNode.dataset.occurrenceDate || undefined,
    });
    return;
  }

  const actionNode = event.target.closest('[data-action]');
  if (!actionNode) return;
  const action = actionNode.dataset.action;

  if (action === 'open-day') openDayView(actionNode.dataset.date);
  else if (action === 'more') openDayView(actionNode.dataset.date);
  else if (action === 'toggle-allday') {
    allDayExpanded = !allDayExpanded;
    render();
  } else if (action === 'day-head') {
    if (view !== 'day') openDayView(actionNode.dataset.date);
  } else if (action === 'open-month') {
    cursor = new Date(cursor.getFullYear(), Number(actionNode.dataset.month), 1);
    view = 'month';
    timeScrollTop = null;
    saveState();
    render();
  } else if (action === 'year-day') {
    cursor = parseLocal(actionNode.dataset.date);
    view = 'month';
    timeScrollTop = null;
    saveState();
    render();
  }
});

mainView.addEventListener('dblclick', (event) => {
  if (event.target.closest('[data-event-id]') || event.target.closest('[data-plan-id]')) return;
  if (event.target.closest('[data-action]')) return;

  if (view === 'month') {
    const cell = event.target.closest('.month-day');
    if (!cell) return;
    openEventDialog({ date: cell.dataset.date, startMinutes: 9 * 60, endMinutes: 10 * 60 });
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
  openEventDialog({
    date: column.dataset.date,
    startMinutes: minutes,
    endMinutes: Math.min(1440, minutes + 60),
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
  if (event.target.closest('.timed-event') || event.target.closest('[data-plan-id]')) return;
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
$('#nav-back-btn').addEventListener('click', navigateBack);
$('#nav-forward-btn').addEventListener('click', navigateForward);
$('#add-btn').addEventListener('click', () => openEventDialog({}));
$('#widgets-btn').addEventListener('click', openWidgetGallery);
$('#settings-btn').addEventListener('click', () => openSettings('general'));
$('#add-plan-btn').addEventListener('click', () => openPlanEditor(null));
$('#plans-all-btn').addEventListener('click', () => openSettings('plans'));

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

$('#plan-list').addEventListener('click', (event) => {
  const plan = event.target.closest('[data-plan-id]');
  if (plan) openPlanEditor(plan.dataset.planId);
});

$('#day-brief').addEventListener('click', () => openSettings('display'));

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
  if (button.dataset.action === 'rename') openCalendarDialog('rename', calendar.id);
  else if (button.dataset.action === 'delete') requestCalendarDelete(calendar);
});

function hideSearchResults() {
  searchResults.classList.add('hidden');
}

document.addEventListener('mousedown', (event) => {
  if (!calendarMenu.contains(event.target)) hideContextMenu();
  if (!searchResults.classList.contains('hidden') && !event.target.closest('#search-box')) {
    hideSearchResults();
  }
  if (!appMenu.contains(event.target) && !event.target.closest('#more-btn')) hideAppMenu();
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
      openSearchResult(first.dataset.eventId, first.dataset.occurrenceDate);
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
  const now = new Date();
  const hasRange =
    /^\d{4}-\d{2}-\d{2}$/.test(searchFrom) &&
    /^\d{4}-\d{2}-\d{2}$/.test(searchTo) &&
    searchTo >= searchFrom;
  const rangeStart = hasRange ? startOfDay(parseLocal(searchFrom)) : null;
  const rangeEnd = hasRange ? addDays(startOfDay(parseLocal(searchTo)), 1) : null;
  const horizon = addDays(startOfDay(now), 366);
  const matches = [];

  for (const event of state.events) {
    if (!isEventVisible(event)) continue;
    const haystack = `${event.title} ${event.location || ''} ${event.notes || ''}`.toLowerCase();
    if (!haystack.includes(needle)) continue;

    if (hasRange) {
      if (Recurrence.isRecurring(event)) {
        for (const occurrence of Recurrence.expand(event, rangeStart, rangeEnd)) {
          const display = withOccurrence(event, occurrence);
          matches.push({
            event,
            occurrenceDate: occurrence.occurrenceDate,
            display,
            start: parseLocal(display.start),
            past: parseLocal(display.end) < now,
          });
          if (matches.length >= 120) break;
        }
      } else {
        const start = parseLocal(event.start);
        const end = parseLocal(event.end);
        if (end > rangeStart && start < rangeEnd) {
          matches.push({
            event,
            occurrenceDate: null,
            display: event,
            start,
            past: end < now,
          });
        }
      }
      continue;
    }

    const occurrence = Recurrence.isRecurring(event)
      ? Recurrence.expand(event, now, horizon)[0] || null
      : null;
    const display = occurrence ? withOccurrence(event, occurrence) : event;
    const start = parseLocal(display.start);
    const end = parseLocal(display.end);
    matches.push({
      event,
      occurrenceDate: occurrence?.occurrenceDate || null,
      display,
      start,
      past: end.getTime() < now.getTime(),
    });
  }

  matches.sort((a, b) => {
    if (a.past !== b.past) return a.past ? 1 : -1;
    return hasRange ? a.start - b.start : a.past ? b.start - a.start : a.start - b.start;
  });
  const limited = matches.slice(0, hasRange ? 50 : 12);

  const header = `<div class="search-range">
    <input type="date" id="search-from" value="${esc(searchFrom)}" aria-label="搜索开始日期">
    <span>至</span>
    <input type="date" id="search-to" value="${esc(searchTo)}" aria-label="搜索结束日期">
    ${
      searchFrom || searchTo
        ? '<button type="button" class="search-range-clear" data-action="clear-search-range">清除</button>'
        : ''
    }
  </div>`;

  searchResults.classList.remove('hidden');
  if (limited.length === 0) {
    searchResults.innerHTML = `${header}<div class="search-empty">没有找到“${esc(query)}”${
      hasRange ? '，试试调整日期范围' : ''
    }</div>`;
    return;
  }

  searchResults.innerHTML =
    header +
    limited
      .map(({ event, display, occurrenceDate }) => {
        const calendar = calendarFor(event);
        const recurring = Recurrence.isRecurring(event);
        return `<button class="search-item" data-event-id="${esc(event.id)}"${
          occurrenceDate ? ` data-occurrence-date="${esc(occurrenceDate)}"` : ''
        }>
        <span class="si-dot" style="--color:${eventColor(event)}"></span>
        <span class="si-text">
          <span class="si-title">${recurring ? '<span class="si-repeat" aria-hidden="true">↻</span>' : ''}${esc(
            event.title
          )}</span>
          <span class="si-meta">${esc(formatEventWhen(display))} · ${esc(calendar.name)}${
            recurring ? ' · 重复' : ''
          }</span>
        </span>
      </button>`;
      })
      .join('');
}

searchResults.addEventListener('change', (event) => {
  if (event.target.id === 'search-from') {
    searchFrom = event.target.value;
    renderSearchResults();
  } else if (event.target.id === 'search-to') {
    searchTo = event.target.value;
    renderSearchResults();
  }
});

searchResults.addEventListener('click', (event) => {
  if (event.target.closest('[data-action="clear-search-range"]')) {
    searchFrom = '';
    searchTo = '';
    renderSearchResults();
    return;
  }
  const item = event.target.closest('.search-item');
  if (item) openSearchResult(item.dataset.eventId, item.dataset.occurrenceDate);
});

function openSearchResult(eventId, occurrenceDate) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event) return;
  captureTimeScroll();
  cursor = startOfDay(parseLocal(occurrenceDate || event.start));
  if (view === 'year') view = 'month';
  hideSearchResults();
  searchInput.value = '';
  searchQuery = '';
  render();
  openEventDialog({ eventId, occurrenceDate });
}

function formatEventWhen(event) {
  const start = parseLocal(event.start);
  const end = parseLocal(event.end);
  const today = startOfDay(new Date());
  let dayLabel;
  const diff = daysBetween(today, start);
  if (diff === 0) dayLabel = '今天';
  else if (diff === 1) dayLabel = '明天';
  else if (diff === -1) dayLabel = '昨天';
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
/* 重复日程                                                            */
/* ------------------------------------------------------------------ */

const REPEAT_WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const REPEAT_WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

function repeatSelectValue(recurrence) {
  if (!recurrence) return 'none';
  if (recurrence.freq === 'daily') return 'daily';
  if (recurrence.freq === 'weekly') {
    const days = recurrence.weekdays || [];
    if (recurrence.interval === 1 && days.join(',') === '1,2,3,4,5') return 'weekdays';
    if (recurrence.interval === 2) return 'biweekly';
    return 'weekly';
  }
  if (recurrence.freq === 'monthly') {
    return recurrence.interval === 3 ? 'quarterly' : 'monthly';
  }
  if (recurrence.freq === 'lunar-yearly') return 'lunar';
  return 'yearly';
}

function renderRepeatWeekdayButtons() {
  const container = $('#event-weekdays');
  if (container.childElementCount > 0) return;
  container.innerHTML = REPEAT_WEEKDAY_ORDER.map(
    (day) =>
      `<button type="button" class="repeat-weekday" data-weekday="${day}" aria-pressed="false" title="周${REPEAT_WEEKDAY_LABELS[day]}">${REPEAT_WEEKDAY_LABELS[day]}</button>`
  ).join('');
}

function setRepeatWeekdays(days) {
  const active = new Set(days);
  $$('.repeat-weekday', $('#event-weekdays')).forEach((button) => {
    const on = active.has(Number(button.dataset.weekday));
    button.classList.toggle('active', on);
    button.setAttribute('aria-pressed', String(on));
  });
}

function getRepeatWeekdays() {
  return $$('.repeat-weekday.active', $('#event-weekdays'))
    .map((button) => Number(button.dataset.weekday))
    .sort((a, b) => a - b);
}

function collectRecurrence(original = null) {
  const value = $('#event-repeat').value;
  if (value === 'none') return null;

  const startDate = parseLocal($('#event-start-date').value || ymd(new Date()));
  const base = {
    weekdays: [],
    until: $('#event-until').value || null,
    exceptions:
      original && Array.isArray(original.exceptions) ? original.exceptions.slice() : [],
  };

  let recurrence;
  if (value === 'daily') {
    recurrence = { ...base, freq: 'daily', interval: 1 };
  } else if (value === 'weekdays') {
    recurrence = { ...base, freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] };
  } else if (value === 'weekly' || value === 'biweekly') {
    const days = getRepeatWeekdays();
    recurrence = {
      ...base,
      freq: 'weekly',
      interval: value === 'biweekly' ? 2 : 1,
      weekdays: days.length ? days : [startDate.getDay()],
    };
  } else if (value === 'monthly') {
    recurrence = { ...base, freq: 'monthly', interval: 1 };
  } else if (value === 'quarterly') {
    recurrence = { ...base, freq: 'monthly', interval: 3 };
  } else if (value === 'lunar') {
    const lunar = window.Almanac?.lunarOf(startDate);
    recurrence = {
      ...base,
      freq: 'lunar-yearly',
      interval: 1,
      lunarMonth: lunar?.monthNumber || 1,
      lunarDay: lunar?.day || 1,
    };
  } else {
    recurrence = { ...base, freq: 'yearly', interval: 1 };
  }

  // 导入的数据可能有 1 以外的自定义间隔，未切换类型时保持原值
  if (original && repeatSelectValue(original) === value) {
    recurrence.interval = original.interval || recurrence.interval;
    if (recurrence.freq === 'weekly' && original.weekdays?.length && !getRepeatWeekdays().length) {
      recurrence.weekdays = original.weekdays.slice();
    }
  }

  return Recurrence.normalize(recurrence);
}

function updateRepeatUI() {
  const value = $('#event-repeat').value;
  const recurring = value !== 'none';
  $('#event-until-line').classList.toggle('hidden', !recurring);
  $('#event-weekdays').classList.toggle('hidden', value !== 'weekly' && value !== 'biweekly');
  const summary = $('#event-repeat-summary');
  if (!recurring) {
    summary.textContent = '';
    return;
  }
  const recurrence = collectRecurrence(editingSeriesRecurrence);
  summary.textContent = recurrence ? Recurrence.summary(recurrence) : '';
}

function setEditingScope(scope) {
  editingScope = ['single', 'following', 'series'].includes(scope) ? scope : 'single';
  $$('.scope-btn', $('#event-scope')).forEach((button) => {
    const active = button.dataset.scope === editingScope;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
  const deleteButton = $('#event-delete');
  if (deleteButton) {
    deleteButton.textContent =
      editingScope === 'series'
        ? '删除所有重复日程'
        : editingScope === 'following'
          ? '删除此后日程'
          : '删除日程';
  }
  // 重复规则属于整个系列，单独编辑某一次时不允许改动
  const lockRepeat = Boolean(editingSeriesRecurrence) && editingScope === 'single';
  for (const selector of ['#event-repeat', '#event-until']) {
    const input = $(selector);
    if (input) input.disabled = lockRepeat;
  }
  $$('.repeat-weekday', $('#event-weekdays')).forEach((button) => {
    button.disabled = lockRepeat;
  });
  $('#event-repeat-summary').classList.toggle('is-locked', lockRepeat);
}

function populateRepeatControls(recurrence, startDate) {
  renderRepeatWeekdayButtons();
  $('#event-repeat').value = repeatSelectValue(recurrence);
  $('#event-until').value = recurrence?.until || '';
  const weekdays =
    recurrence && recurrence.freq === 'weekly' && recurrence.weekdays.length
      ? recurrence.weekdays
      : [startDate.getDay()];
  setRepeatWeekdays(recurrence && recurrence.freq === 'weekly' ? weekdays : [startDate.getDay()]);
  updateRepeatUI();
}

const REMINDER_PRESETS = new Set(['5', '15', '30', '60', '1440']);

function reminderSelectValue(reminder) {
  if (!reminder) return 'none';
  const value = String(reminder.minutes);
  return REMINDER_PRESETS.has(value) ? value : 'custom';
}

function populateReminderControls(reminder) {
  const select = $('#event-reminder');
  select.value = reminderSelectValue(reminder);
  const custom = reminder && !REMINDER_PRESETS.has(String(reminder.minutes));
  $('#event-reminder-minutes').value = String(custom ? reminder.minutes : 10);
  $('#event-reminder-system').checked = reminder?.system === true;
  updateReminderUI();
}

function updateReminderUI() {
  const value = $('#event-reminder').value;
  const enabled = value !== 'none';
  $('#event-reminder-custom-line').classList.toggle('hidden', value !== 'custom');
  $('#event-reminder-system-line').classList.toggle('hidden', !enabled);
}

function collectReminder() {
  const value = $('#event-reminder').value;
  if (value === 'none') return null;
  let minutes;
  if (value === 'custom') {
    minutes = Math.round(Number($('#event-reminder-minutes').value));
    if (!Number.isFinite(minutes) || minutes < 1) minutes = 10;
    minutes = clamp(minutes, 1, 10080);
  } else {
    minutes = Number(value);
  }
  return { minutes, system: $('#event-reminder-system').checked };
}

function renderEventColorSwatches(selected, calendarColor) {
  const container = $('#event-color-swatches');
  if (!container) return;
  const inherited = selected || 'inherit';
  container.innerHTML = [
    `<button type="button" class="event-color-swatch inherit ${
      inherited === 'inherit' ? 'selected' : ''
    }" data-color="inherit" style="--color:${calendarColor}" title="跟随日历"></button>`,
    ...CALENDAR_COLORS.map(
      (color) =>
        `<button type="button" class="event-color-swatch ${
          inherited === color ? 'selected' : ''
        }" data-color="${color}" style="--color:${color}" title="${color}" aria-label="${color}"></button>`
    ),
  ].join('');
}

function selectedEventColor() {
  return (
    $('.event-color-swatch.selected', $('#event-color-swatches'))?.dataset.color ||
    'inherit'
  );
}

function updateInheritedColorSwatch() {
  const swatch = $('.event-color-swatch.inherit', $('#event-color-swatches'));
  if (!swatch) return;
  const calendar = calendarById($('#event-calendar').value) || state.calendars[0];
  swatch.style.setProperty('--color', calendar?.color || '#8E8E93');
}

function renderAttachments() {
  const container = $('#event-attachments');
  if (!container) return;
  container.innerHTML = editingAttachments
    .map(
      (dataUrl, index) =>
        `<span class="note-attachment"><img src="${dataUrl}" alt="备注图片 ${
          index + 1
        }"><button type="button" data-attachment-remove="${index}" aria-label="移除图片">×</button></span>`
    )
    .join('');
}

function addAttachmentFromBlob(blob) {
  if (!blob || !blob.type.startsWith('image/')) return;
  if (editingAttachments.length >= 3) {
    showToast('备注最多添加 3 张图片');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const maxSide = 1000;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let quality = 0.82;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length > 380000 && quality > 0.4) {
        quality -= 0.12;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      if (dataUrl.length > 400000) {
        showToast('图片太大，请换一张');
        return;
      }
      editingAttachments.push(dataUrl);
      renderAttachments();
    };
    image.onerror = () => showToast('无法读取这张图片');
    image.src = reader.result;
  };
  reader.readAsDataURL(blob);
}

$('#event-attachments').addEventListener('click', (event) => {
  const remove = event.target.closest('[data-attachment-remove]');
  if (!remove) return;
  editingAttachments.splice(Number(remove.dataset.attachmentRemove), 1);
  renderAttachments();
});

$('#event-notes').addEventListener('paste', (event) => {
  const items = Array.from(event.clipboardData?.items || []);
  const imageItem = items.find((item) => item.type.startsWith('image/'));
  if (!imageItem) return;
  event.preventDefault();
  const blob = imageItem.getAsFile();
  if (blob) addAttachmentFromBlob(blob);
});

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
  if (window.SettingsUI?.isOpen()) SettingsUI.close();
  if (window.Plans?.isOpen()) Plans.closeEditor();

  const existing = options.eventId
    ? state.events.find((event) => event.id === options.eventId)
    : null;
  const series = existing && Recurrence.isRecurring(existing) ? existing : null;
  editingEventId = existing ? existing.id : null;
  editingOccurrenceDate = null;
  editingScope = 'single';
  editingSeriesRecurrence = series ? Recurrence.normalize(series.recurrence) : null;

  let occurrence = null;
  if (series) {
    const wanted = startOfDay(parseLocal(options.occurrenceDate || existing.start));
    occurrence = Recurrence.expand(existing, wanted, addDays(wanted, 1))[0] || null;
    if (occurrence) {
      editingOccurrenceDate = occurrence.occurrenceDate;
    } else {
      const anchor = startOfDay(parseLocal(existing.start));
      occurrence = Recurrence.expand(existing, anchor, addDays(anchor, 1))[0] || null;
      editingOccurrenceDate = occurrence?.occurrenceDate || ymd(anchor);
    }
  }

  $('#event-dialog-title').textContent = existing ? '编辑日程' : '新建日程';
  $('#event-delete').classList.toggle('hidden', !existing);
  $('#event-delete').textContent = '删除日程';
  $('#event-title').value = existing ? existing.title : '';
  $('#event-location').value = existing?.location || '';
  $('#event-notes').value = existing?.notes || '';
  editingAttachments = Array.isArray(existing?.attachments)
    ? existing.attachments.slice(0, 3)
    : [];
  renderAttachments();

  const calendarSelect = $('#event-calendar');
  calendarSelect.innerHTML = state.calendars
    .map((calendar) => `<option value="${esc(calendar.id)}">${esc(calendar.name)}</option>`)
    .join('');

  const fallbackCalendar =
    state.calendars.find((calendar) => calendar.id === state.settings.defaultCalendarId) ||
    state.calendars[0];
  const selectedCalendarId = existing?.calendarId || fallbackCalendar?.id;
  if (selectedCalendarId) calendarSelect.value = selectedCalendarId;
  renderEventColorSwatches(
    existing?.color || null,
    (calendarById(selectedCalendarId) || fallbackCalendar)?.color || '#8E8E93'
  );
  updateCalendarDot();

  let start;
  let end;
  let allDay = Boolean(existing?.allDay);

  if (existing) {
    start = parseLocal(occurrence ? occurrence.start : existing.start);
    end = parseLocal(occurrence ? occurrence.end : existing.end);
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

  $('#event-start-date').value = ymd(start);
  $('#event-start-time').value = timeValue(start);
  $('#event-end-date').value = ymd(end);
  $('#event-end-time').value = timeValue(end);
  $('#event-allday').checked = allDay;
  updateAllDayState();

  populateRepeatControls(editingSeriesRecurrence, start);
  populateReminderControls(existing?.reminder || null);
  renderEventTemplatePicker(existing);
  $('#event-scope').classList.toggle('hidden', !series);
  setEditingScope('single');

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
  if (now.getMinutes() < 30) now.setMinutes(30);
  else {
    now.setHours(now.getHours() + 1);
    now.setMinutes(0);
  }
  return now;
}

function updateCalendarDot() {
  const select = $('#event-calendar');
  const calendar = calendarById(select.value) || state.calendars[0];
  $('#event-calendar-dot').style.background = calendar?.color || '#8E8E93';
  updateInheritedColorSwatch();
}

function updateAllDayState() {
  const allDay = $('#event-allday').checked;
  $('#event-start-time').disabled = allDay;
  $('#event-end-time').disabled = allDay;
}

$('#event-calendar').addEventListener('change', updateCalendarDot);
$('#event-color-swatches').addEventListener('click', (event) => {
  const swatch = event.target.closest('.event-color-swatch');
  if (!swatch) return;
  $$('.event-color-swatch', $('#event-color-swatches')).forEach((item) =>
    item.classList.toggle('selected', item === swatch)
  );
});
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

$('#event-repeat').addEventListener('change', () => {
  const value = $('#event-repeat').value;
  if (value === 'weekly' || value === 'biweekly') {
    if (getRepeatWeekdays().length === 0) {
      const startDate = parseLocal($('#event-start-date').value || ymd(new Date()));
      setRepeatWeekdays([startDate.getDay()]);
    }
  }
  updateRepeatUI();
});

$('#event-weekdays').addEventListener('click', (event) => {
  const button = event.target.closest('.repeat-weekday');
  if (!button) return;
  button.classList.toggle('active');
  button.setAttribute('aria-pressed', String(button.classList.contains('active')));
  if (getRepeatWeekdays().length === 0) {
    button.classList.add('active');
    button.setAttribute('aria-pressed', 'true');
  }
  updateRepeatUI();
});

$('#event-until').addEventListener('change', updateRepeatUI);
$('#event-start-date').addEventListener('change', updateRepeatUI);
$('#event-until-clear').addEventListener('click', () => {
  $('#event-until').value = '';
  updateRepeatUI();
});

$('#event-scope').addEventListener('click', (event) => {
  const button = event.target.closest('.scope-btn');
  if (!button) return;
  setEditingScope(button.dataset.scope);
});

$('#event-reminder').addEventListener('change', updateReminderUI);
$('#event-reminder-minutes').addEventListener('input', () => {
  const input = $('#event-reminder-minutes');
  const value = Math.round(Number(input.value));
  if (Number.isFinite(value) && value > 10080) input.value = '10080';
});

function renderEventTemplatePicker(existing) {
  const picker = $('#event-template-picker');
  const select = $('#event-template-select');
  if (!picker || !select) return;
  if (existing) {
    picker.classList.add('hidden');
    return;
  }
  const templates = state.eventTemplates || [];
  picker.classList.toggle('hidden', templates.length === 0);
  select.innerHTML =
    '<option value="">选择模板…</option>' +
    templates
      .map(
        (template) =>
          `<option value="${esc(template.id)}">${esc(template.name)}</option>`
      )
      .join('');
  select.value = '';
}

function applyEventTemplate(template) {
  if (!template) return;
  $('#event-title').value = template.title || template.name;
  if (calendarById(template.calendarId)) {
    $('#event-calendar').value = template.calendarId;
  }
  updateCalendarDot();
  $('#event-location').value = template.location || '';
  $('#event-notes').value = template.notes || '';
  $('#event-allday').checked = template.allDay;
  if (template.allDay) {
    const date = $('#event-start-date').value || ymd(new Date());
    $('#event-end-date').value = date;
    $('#event-start-time').value = '00:00';
    $('#event-end-time').value = '23:59';
  } else {
    const start = parseLocal(
      `${$('#event-start-date').value || ymd(new Date())}T${
        template.startTime || $('#event-start-time').value || '09:00'
      }`
    );
    $('#event-start-time').value = timeValue(start);
    const end = new Date(start.getTime() + template.duration * 60000);
    $('#event-end-date').value = ymd(end);
    $('#event-end-time').value = timeValue(end);
  }
  updateAllDayState();
  populateReminderControls(template.reminder);
  renderEventColorSwatches(
    template.color,
    calendarById($('#event-calendar').value)?.color || '#8E8E93'
  );
}

function saveCurrentAsTemplate() {
  const name = ($('#event-title').value.trim() || '未命名模板').slice(0, 60);
  const start = parseLocal(
    `${$('#event-start-date').value || ymd(new Date())}T${
      $('#event-start-time').value || '09:00'
    }`
  );
  const end = parseLocal(
    `${$('#event-end-date').value || ymd(new Date())}T${
      $('#event-end-time').value || '10:00'
    }`
  );
  const allDay = $('#event-allday').checked;
  const duration = allDay
    ? 1440
    : Math.max(15, Math.round((end - start) / 60000) || 60);
  const template = {
    id: '',
    name,
    title: $('#event-title').value.trim(),
    calendarId: $('#event-calendar').value,
    allDay,
    duration,
    startTime: $('#event-start-time').value || '09:00',
    location: $('#event-location').value.trim(),
    notes: $('#event-notes').value.trim(),
    reminder: collectReminder(),
    color: selectedEventColor() === 'inherit' ? null : selectedEventColor(),
  };
  state.eventTemplates = state.eventTemplates || [];
  const existing = state.eventTemplates.find((item) => item.name === name);
  if (existing) Object.assign(existing, template, { id: existing.id });
  else state.eventTemplates.push({ ...template, id: makeId('template') });
  if (state.eventTemplates.length > 30) state.eventTemplates.shift();
  saveState();
  showToast(`已保存模板「${name}」`);
  renderEventTemplatePicker(
    editingEventId ? state.events.find((event) => event.id === editingEventId) : null
  );
}

$('#event-template-select')?.addEventListener('change', (event) => {
  const template = (state.eventTemplates || []).find(
    (item) => item.id === event.target.value
  );
  if (template) applyEventTemplate(template);
});

$('#event-template-save')?.addEventListener('click', saveCurrentAsTemplate);

$('#event-template-delete')?.addEventListener('click', () => {
  const id = $('#event-template-select').value;
  if (!id) {
    showToast('先选择一个模板');
    return;
  }
  state.eventTemplates = (state.eventTemplates || []).filter((item) => item.id !== id);
  saveState();
  renderEventTemplatePicker(null);
  showToast('已删除模板');
});

function closeEventDialog() {
  eventOverlay.classList.add('hidden');
  editingEventId = null;
  editingOccurrenceDate = null;
  editingScope = 'single';
  editingSeriesRecurrence = null;
  editingAttachments = [];
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
    reminder: collectReminder(),
    color: selectedEventColor() === 'inherit' ? null : selectedEventColor(),
    attachments: editingAttachments.slice(0, 3),
  };

  const repeatValue = $('#event-repeat').value;
  const untilValue = $('#event-until').value;
  if (repeatValue !== 'none' && untilValue && untilValue < startDate) {
    showToast('重复结束日期不能早于开始日期');
    return;
  }

  const existing = editingEventId
    ? state.events.find((item) => item.id === editingEventId)
    : null;
  const series = existing && Recurrence.isRecurring(existing) ? existing : null;
  const recurrence = collectRecurrence(editingSeriesRecurrence);

  state.settings.defaultCalendarId = calendarId;

  if (series && editingScope === 'single') {
    const occurrenceDay = startOfDay(
      parseLocal(editingOccurrenceDate || series.start)
    );
    const current = Recurrence.expand(
      series,
      occurrenceDay,
      addDays(occurrenceDay, 1)
    )[0];
    const unchanged =
      current &&
      payload.title === series.title &&
      payload.calendarId === series.calendarId &&
      payload.start === current.start &&
      payload.end === current.end &&
      payload.allDay === Boolean(series.allDay) &&
      payload.location === (series.location || '') &&
      payload.notes === (series.notes || '');
    if (unchanged) {
      closeEventDialog();
      return;
    }

    // 只改这一次：拆出独立日程，并把原实例标记为例外
    recordHistory('单独修改重复日程');
    state.events.push({ id: makeId('ev'), ...payload, recurrence: null });
    const key = editingOccurrenceDate || ymd(parseLocal(payload.start));
    const seriesRecurrence = Recurrence.normalize(series.recurrence);
    if (!seriesRecurrence.exceptions.includes(key)) {
      seriesRecurrence.exceptions.push(key);
    }
    series.recurrence = seriesRecurrence;
    state.events.sort(compareEvents);
    saveState();
    closeEventDialog();
    render();
    showToast('已单独修改此日程');
    return;
  }

  if (series && editingScope === 'following') {
    // 改此后全部：截断旧系列，从这一次开始建立新系列
    const key = editingOccurrenceDate || ymd(parseLocal(payload.start));
    const occurrenceDay = startOfDay(parseLocal(key));
    const previousKey = ymd(addDays(occurrenceDay, -1));
    const seriesStartKey = series.start.slice(0, 10);
    const seriesRecurrence = Recurrence.normalize(series.recurrence);
    const pastExceptions = seriesRecurrence.exceptions.filter((date) => date < key);
    const futureExceptions = seriesRecurrence.exceptions.filter((date) => date >= key);
    const newEvent = {
      id: makeId('ev'),
      ...payload,
      recurrence: recurrence ? { ...recurrence, exceptions: futureExceptions } : null,
    };
    recordHistory('修改此后日程');
    if (previousKey < seriesStartKey) {
      state.events = state.events.filter((event) => event.id !== series.id);
    } else {
      seriesRecurrence.exceptions = pastExceptions;
      seriesRecurrence.until = previousKey;
      series.recurrence = seriesRecurrence;
    }
    state.events.push(newEvent);
    state.events.sort(compareEvents);
    saveState();
    closeEventDialog();
    render();
    showToast('已修改此后所有日程');
    return;
  }

  if (series && editingScope === 'series') {
    // 改整个系列：沿系列锚点整体平移，保留各实例时间
    const anchorDay = startOfDay(parseLocal(series.start));
    const occurrenceDay = startOfDay(
      parseLocal(editingOccurrenceDate || series.start)
    );
    const formStart = parseLocal(payload.start);
    const formEnd = parseLocal(payload.end);
    const shift = daysBetween(occurrenceDay, startOfDay(formStart));
    const newAnchor = addDays(anchorDay, shift);
    newAnchor.setHours(formStart.getHours(), formStart.getMinutes(), 0, 0);
    const newEnd = new Date(newAnchor.getTime() + (formEnd - formStart));

    recordHistory('修改所有重复日程');
    Object.assign(series, {
      calendarId,
      title,
      allDay,
      location: payload.location,
      notes: payload.notes,
      reminder: payload.reminder,
      color: payload.color,
      attachments: payload.attachments,
      start: formatLocal(newAnchor),
      end: formatLocal(newEnd),
      recurrence,
    });
    state.events.sort(compareEvents);
    saveState();
    closeEventDialog();
    render();
    showToast('已更新所有重复日程');
    return;
  }

  if (existing) {
    recordHistory('修改日程');
    Object.assign(existing, payload, { recurrence });
  } else {
    recordHistory('新建日程');
    state.events.push({ id: makeId('ev'), ...payload, recurrence });
  }

  state.events.sort(compareEvents);
  saveState();
  closeEventDialog();
  render();
}

function deleteEditingEvent() {
  if (!editingEventId) return;
  const existing = state.events.find((event) => event.id === editingEventId);
  const series = existing && Recurrence.isRecurring(existing) ? existing : null;

  if (series && editingScope === 'single') {
    const key = editingOccurrenceDate || ymd(parseLocal(series.start));
    recordHistory('删除单次重复日程');
    addTrashEntry({
      kind: 'occurrence',
      title: series.title,
      item: null,
      meta: { eventId: series.id, occurrenceDate: key },
    });
    const seriesRecurrence = Recurrence.normalize(series.recurrence);
    if (!seriesRecurrence.exceptions.includes(key)) {
      seriesRecurrence.exceptions.push(key);
    }
    series.recurrence = seriesRecurrence;
    saveState();
    closeEventDialog();
    render();
    showToast('已删除此日程，可在回收站恢复');
    return;
  }

  if (series && editingScope === 'following') {
    const key = editingOccurrenceDate || ymd(parseLocal(series.start));
    const previousKey = ymd(addDays(startOfDay(parseLocal(key)), -1));
    const seriesStartKey = series.start.slice(0, 10);
    const seriesId = series.id;
    const seriesTitle = series.title;
    closeEventDialog();
    openConfirm({
      title: '删除此后日程？',
      text: `将删除「${seriesTitle}」从 ${key} 起的全部实例，之前的历史会保留。可在回收站恢复。`,
      okLabel: '删除此后',
      onConfirm: () => {
        recordHistory('删除此后日程');
        if (previousKey < seriesStartKey) {
          moveEventToTrash(series);
          state.events = state.events.filter((event) => event.id !== seriesId);
        } else {
          const snapshot = JSON.parse(JSON.stringify(series));
          addTrashEntry({
            kind: 'series-split',
            title: seriesTitle,
            item: snapshot,
            meta: { seriesId },
          });
          const seriesRecurrence = Recurrence.normalize(series.recurrence);
          seriesRecurrence.until = previousKey;
          series.recurrence = seriesRecurrence;
        }
        saveState();
        render();
        showToast('已删除此后日程，可在回收站恢复');
      },
    });
    return;
  }

  if (series) {
    const seriesId = series.id;
    const seriesTitle = series.title;
    closeEventDialog();
    openConfirm({
      title: '删除所有重复日程？',
      text: `将删除「${seriesTitle}」及其全部重复实例。可以在回收站恢复。`,
      okLabel: '全部删除',
      onConfirm: () => {
        recordHistory('删除重复日程');
        moveEventToTrash(series);
        state.events = state.events.filter((event) => event.id !== seriesId);
        saveState();
        render();
        showToast('已删除重复日程，可在回收站恢复');
      },
    });
    return;
  }

  recordHistory('删除日程');
  moveEventToTrash(existing || { id: editingEventId, title: '日程' });
  state.events = state.events.filter((event) => event.id !== editingEventId);
  saveState();
  closeEventDialog();
  render();
  showToast('已删除日程，可在回收站恢复');
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
      `<button class="swatch ${
        color === selectedColor ? 'selected' : ''
      }" data-color="${color}" style="--color:${color}" aria-label="${color}"></button>`
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

  recordHistory(calendarDialogMode === 'rename' ? '重命名日历' : '新建日历');

  if (calendarDialogMode === 'rename' && editingCalendarId) {
    const calendar = calendarById(editingCalendarId);
    if (calendar) {
      calendar.name = name;
      calendar.color = color;
    }
    showToast('已更新日历');
  } else {
    const calendar = { id: makeId('cal'), name, color, visible: true };
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

function requestCalendarDelete(calendar) {
  if (state.calendars.length <= 1) {
    showToast('至少需要保留一个日历');
    return;
  }
  const eventCount = state.events.filter((event) => event.calendarId === calendar.id).length;
  const planCount = state.plans.filter((plan) => plan.calendarId === calendar.id).length;
  openConfirm({
    title: `删除“${calendar.name}”？`,
    text: `${eventCount > 0 ? `该日历中的 ${eventCount} 个日程会移入回收站。` : ''}${
      planCount > 0 ? ` ${planCount} 个计划会移至其它日历。` : ''
    }日程可以在回收站恢复。`,
    okLabel: '删除',
    onConfirm: () => {
      recordHistory('删除日历');
      for (const event of state.events.filter((item) => item.calendarId === calendar.id)) {
        moveEventToTrash(event);
      }
      state.calendars = state.calendars.filter((item) => item.id !== calendar.id);
      state.events = state.events.filter((event) => event.calendarId !== calendar.id);
      const fallback = state.calendars[0]?.id;
      if (fallback) {
        for (const plan of state.plans) {
          if (plan.calendarId === calendar.id) plan.calendarId = fallback;
        }
      }
      if (state.settings.defaultCalendarId === calendar.id) {
        state.settings.defaultCalendarId = fallback || null;
      }
      saveState();
      render();
      showToast('已删除日历');
    },
  });
}

/* ------------------------------------------------------------------ */
/* 计划                                                                */
/* ------------------------------------------------------------------ */

function openPlanEditor(planId = null) {
  closeEventDialog();
  closeWidgetGallery();
  closeCalendarDialog();
  closeConfirmDialog();
  hideContextMenu();
  hideAppMenu();
  hideSearchResults();
  if (window.SettingsUI?.isOpen()) SettingsUI.close();
  if (window.Plans?.isOpen()) Plans.closeEditor();
  Plans.openEditor(planId, {
    calendarId: state.settings.defaultCalendarId || state.calendars[0]?.id,
  });
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
  if (window.SettingsUI?.isOpen()) SettingsUI.close();
  if (window.Plans?.isOpen()) Plans.closeEditor();
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
        <div class="wg-preview ${type === 'today' ? 'wg-today-preview' : ''} ${
        type === 'monthAgenda' ? 'wg-large-preview' : ''
      }">${info.preview()}</div>
        <div class="wg-info">
          <h3 class="wg-name">${info.name}</h3>
          <p class="wg-meta">${info.size}${count > 0 ? ` · 已添加 ${count} 个` : ''}</p>
          <p class="wg-desc">${info.description}</p>
          <button class="wg-toggle" data-action="add-widget" data-type="${type}">
            ${count > 0 ? '再添加一个' : '添加到桌面'}
          </button>
          ${
            count > 0
              ? `<button class="wg-remove" data-action="remove-widgets" data-type="${type}">移除全部 (${count})</button>`
              : ''
          }
        </div>
      </article>`;
    })
    .join('');
}

$('#widget-gallery').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action !== 'add-widget' && action !== 'remove-widgets') return;
  const type = button.dataset.type;
  const existing = galleryWidgets.filter((widget) => widget.type === type);
  button.disabled = true;
  try {
    if (action === 'remove-widgets') {
      for (const widget of existing) await window.desktop.widgets.remove(widget.id);
      showToast(`已移除 ${existing.length} 个「${WIDGET_INFO[type].name}」小组件`);
    } else {
      const added = await window.desktop.widgets.add(type);
      showToast(
        added
          ? `已添加「${WIDGET_INFO[type].name}」小组件`
          : '最多同时显示 10 个小组件'
      );
    }
  } catch {
    showToast('操作失败，请重试');
  }
  await refreshWidgetGallery();
});

$('#widget-close').addEventListener('click', closeWidgetGallery);

/* 小组件预览 */

function previewWeekdayRow() {
  return weekdayOrder().map((day) => `<span>${WEEKDAY_SINGLE[day]}</span>`).join('');
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
        if (isRestDate(day)) classes.push('rest');
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
              return `<div class="wgp-line"><i style="--color:${eventColor(event)}"></i><span class="wgp-line-time">${time}</span><span class="wgp-line-title">${esc(event.title)}</span></div>`;
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
        <div class="wgp-up-line"><i style="--color:${eventColor(event)}"></i>${esc(event.title)}</div>
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
                return `<div class="wgp-event"><i style="--color:${eventColor(event)}"></i><span>${esc(event.title)}</span></div>`;
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

function showToast(message, duration = 1900) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

function openConfirm({ title, text, okLabel = '确定', onConfirm }) {
  pendingConfirm = { title, text, okLabel, onConfirm };
  $('#confirm-title').textContent = title;
  $('#confirm-text').textContent = text;
  $('#confirm-ok').textContent = okLabel;
  confirmOverlay.classList.remove('hidden');
}

[[eventOverlay, closeEventDialog], [calendarOverlay, closeCalendarDialog], [confirmOverlay, closeConfirmDialog], [widgetOverlay, closeWidgetGallery]].forEach(
  ([overlay, close]) => {
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) close();
    });
  }
);

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

function closeAllPopups() {
  closeEventDialog();
  closeCalendarDialog();
  closeConfirmDialog();
  closeWidgetGallery();
  reminderOverlay.classList.add('hidden');
  if (icsOverlay) icsOverlay.classList.add('hidden');
  $('#task-overlay')?.classList.add('hidden');
  if (window.SettingsUI?.isOpen()) SettingsUI.close();
  if (window.Plans?.isOpen()) Plans.closeEditor();
  hideContextMenu();
  hideAppMenu();
  hideSearchResults();
}

/* ------------------------------------------------------------------ */
/* 设置 / 外观 / 菜单                                                  */
/* ------------------------------------------------------------------ */

function openSettings(section = 'general') {
  closeAllPopups();
  SettingsUI.open(section);
}

function settingsChanged(options = {}) {
  if (options.sidebar) {
    sidebarVisible = state.settings.sidebarVisible !== false;
    applySidebarState();
  }
  saveState();
  Appearance.apply(state.settings);
  if (!options.soft) render();
}

function hideAppMenu() {
  appMenu.classList.add('hidden');
}

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

$('#more-btn').addEventListener('click', (event) => {
  event.stopPropagation();
  if (appMenu.classList.contains('hidden')) showAppMenu();
  else hideAppMenu();
});

appMenu.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  hideAppMenu();

  if (action === 'new-plan') openPlanEditor(null);
  else if (action === 'new-event') openEventDialog({});
  else if (action === 'ics') openIcsDialog();
  else if (action === 'print-view') window.print();
  else if (action === 'capture-view') captureCurrentView();
  else if (action === 'export-config') exportConfiguration();
  else if (action === 'import-config') importConfiguration();
  else if (action === 'open-settings') openSettings('general');
  else if (action === 'open-about') openSettings('about');
  else if (action === 'open-data') openDataFolder();
  else if (action === 'quit-app') window.desktop.quitApp();
});

function openIcsDialog() {
  closeAllPopups();
  const options = state.calendars
    .map((calendar) => `<option value="${esc(calendar.id)}">${esc(calendar.name)}</option>`)
    .join('');
  const importSelect = $('#ics-import-calendar');
  const exportSelect = $('#ics-export-calendar');
  importSelect.innerHTML = options;
  exportSelect.innerHTML = `<option value="all">全部日历</option>${options}`;
  importSelect.value =
    state.settings.defaultCalendarId || state.calendars[0]?.id || '';
  exportSelect.value = 'all';
  icsOverlay.classList.remove('hidden');
}

function closeIcsDialog() {
  icsOverlay.classList.add('hidden');
}

async function importIcsFile() {
  let result;
  try {
    result = await window.desktop.ics.importFile();
  } catch {
    showToast('导入失败，请重试');
    return;
  }
  if (!result || result.canceled) return;
  if (!result.ok) {
    showToast(result.error || '无法读取 iCalendar 文件');
    return;
  }
  const imported = importIcsText(result.text, $('#ics-import-calendar').value);
  if (imported === 0) {
    showToast('没有新增日程（可能已导入过，或文件为空）');
    return;
  }
  closeIcsDialog();
  showToast(`已导入 ${imported} 个日程`);
}

function importIcsText(text, calendarId) {
  let parsed;
  try {
    parsed = Ics.parse(text);
  } catch {
    return 0;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return 0;
  const targetCalendar =
    state.calendars.find((calendar) => calendar.id === calendarId)?.id ||
    state.calendars[0]?.id;
  if (!targetCalendar) return 0;
  const existingUids = new Set(
    state.events.map((event) => event.uid).filter(Boolean)
  );
  recordHistory('导入 iCalendar');
  let added = 0;
  for (const item of parsed) {
    if (item.uid && existingUids.has(item.uid)) continue;
    state.events.push({
      id: makeId('ev'),
      calendarId: targetCalendar,
      title: item.title,
      start: item.start,
      end: item.end,
      allDay: item.allDay,
      location: item.location,
      notes: item.notes,
      recurrence: Recurrence.normalize(item.recurrence),
      reminder: null,
      uid: item.uid || '',
    });
    if (item.uid) existingUids.add(item.uid);
    added += 1;
    if (added >= 5000) break;
  }
  if (added === 0) {
    historyPast.pop();
    return 0;
  }
  state.events.sort(compareEvents);
  saveState();
  render();
  return added;
}

function buildIcsExport(options = {}) {
  const calendarId = options.calendarId || 'all';
  const startKey = options.start || '';
  const endKey = options.end || '';
  if ((startKey && !endKey) || (!startKey && endKey)) {
    throw new Error('请同时选择开始和结束日期');
  }
  let events = state.events.filter(
    (event) => calendarId === 'all' || event.calendarId === calendarId
  );
  if (startKey && endKey) {
    if (endKey < startKey) throw new Error('结束日期不能早于开始日期');
    const rangeStart = startOfDay(parseLocal(startKey));
    const rangeEnd = addDays(startOfDay(parseLocal(endKey)), 1);
    const expanded = [];
    for (const event of events) {
      if (!Recurrence.isRecurring(event)) {
        const start = parseLocal(event.start);
        const end = parseLocal(event.end);
        if (end > rangeStart && start < rangeEnd) expanded.push(event);
        continue;
      }
      for (const occurrence of Recurrence.expand(event, rangeStart, rangeEnd)) {
        expanded.push(withOccurrence(event, occurrence));
      }
    }
    events = expanded;
  }
  return Ics.build(events);
}

async function exportIcsFile() {
  const text = buildIcsExport({
    calendarId: $('#ics-export-calendar').value,
    start: $('#ics-export-start').value,
    end: $('#ics-export-end').value,
  });
  if (!text || !text.includes('BEGIN:VEVENT')) {
    showToast('这个范围内没有可导出的日程');
    return;
  }
  const result = await window.desktop.ics.exportFile({
    text,
    defaultName: `朝暮日历-${ymd(new Date()).replace(/-/g, '')}.ics`,
  });
  if (!result || result.canceled) return;
  if (!result.ok) {
    showToast(result.error || '导出失败');
    return;
  }
  closeIcsDialog();
  showToast('已导出 iCalendar 文件');
}

$('#ics-cancel').addEventListener('click', closeIcsDialog);
$('#ics-import-btn').addEventListener('click', importIcsFile);
$('#ics-export-btn').addEventListener('click', () => {
  exportIcsFile().catch((error) => showToast(error.message || '导出失败'));
});
icsOverlay.addEventListener('mousedown', (event) => {
  if (event.target === icsOverlay) closeIcsDialog();
});

async function captureCurrentView() {
  const rect = mainView.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return;
  let result;
  try {
    result = await window.desktop.view.capture({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      defaultName: `朝暮-${ymd(cursor)}.png`,
    });
  } catch {
    showToast('导出图片失败');
    return;
  }
  if (!result || result.canceled) return;
  if (!result.ok) {
    showToast(result.error || '导出图片失败');
    return;
  }
  showToast('当前视图已导出为图片');
}

async function exportConfiguration() {
  try {
    const result = await window.desktop.config.exportFile(state);
    if (!result || result.canceled) return;
    if (!result.ok) {
      showToast(result.error || '导出失败');
      return;
    }
    showToast('朝暮配置已导出（含日程、计划与小组件）');
  } catch {
    showToast('导出失败，请重试');
  }
}

function applyHolidayData(raw) {
  const parsed = Holidays.parse(raw);
  const count = Object.keys(parsed).length;
  if (count === 0) return 0;
  recordHistory('导入节假日数据');
  state.settings.holidayData = parsed;
  Holidays.setCustom(parsed);
  saveState();
  render();
  return count;
}

async function importHolidays() {
  let result;
  try {
    result = await window.desktop.holidays.importFile();
  } catch {
    showToast('导入失败，请重试');
    return;
  }
  if (!result || result.canceled) return;
  if (!result.ok) {
    showToast(result.error || '无法读取节假日文件');
    return;
  }
  const parsed = Holidays.parse(result.data);
  const count = Object.keys(parsed).length;
  if (count === 0) {
    showToast('没有识别到有效节假日数据');
    return;
  }
  const fileName = result.filePath ? result.filePath.split(/[\\/]/).pop() : '节假日文件';
  openConfirm({
    title: '导入节假日数据？',
    text: `将从「${fileName}」导入 ${count} 天数据，覆盖当前自定义节假日（内置 2024–2026 仍保留）。`,
    okLabel: '导入',
    onConfirm: () => {
      applyHolidayData(result.data);
      showToast(`已导入 ${count} 天节假日数据`);
    },
  });
}

async function importConfiguration() {  let result;
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

  let importedState;
  try {
    importedState = normalizeState(raw);
  } catch {
    showToast('配置文件部分损坏，已尽量读取可用数据');
    importedState = normalizeState({
      calendars: raw.calendars,
      events: Array.isArray(raw.events) ? raw.events : [],
      plans: Array.isArray(raw.plans) ? raw.plans : [],
    });
  }
  const widgets = Array.isArray(result.payload.widgets) ? result.payload.widgets : null;
  const widgetCount = widgets
    ? widgets.filter((widget) => widget && WIDGET_INFO[widget.type]).length
    : null;
  const fileName = result.filePath ? result.filePath.split(/[\\/]/).pop() : '配置文件';

  openConfirm({
    title: '导入配置？',
    text: `将用「${fileName}」覆盖当前 ${state.calendars.length} 个日历、${state.events.length} 个日程、${
      state.plans.length
    } 个计划${widgetCount !== null ? `，并替换 ${widgetCount} 个桌面小组件` : ''}。此操作无法撤销。`,
    okLabel: '导入',
    onConfirm: async () => {
      closeAllPopups();
      historyPast = [];
      historyFuture = [];
      state = importedState;
      view = ['month', 'week', 'day', 'year'].includes(state.settings.lastView)
        ? state.settings.lastView
        : 'month';
      cursor = startOfDay(new Date());
      sidebarVisible = state.settings.sidebarVisible !== false;
      applySidebarState();
      searchInput.value = '';
      hideSearchResults();
      Appearance.apply(state.settings);
      saveState();
      render();

      if (widgets) {
        try {
          await window.desktop.widgets.importConfigs(widgets);
        } catch {
          // 日程已导入，小组件失败时保留数据
        }
      }
      showToast(`已导入 ${state.events.length} 个日程、${state.plans.length} 个计划`);
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

/* ------------------------------------------------------------------ */
/* 键盘快捷键                                                          */
/* ------------------------------------------------------------------ */

function shortcutFor(action) {
  const value = state.settings.shortcuts?.[action];
  return String(value || DEFAULT_SHORTCUTS[action] || '');
}

function matchesShortcut(event, action) {
  const value = shortcutFor(action);
  if (!value) return false;
  if (value.length === 1) {
    return (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      event.key.toLowerCase() === value.toLowerCase()
    );
  }
  return event.key === value;
}

document.addEventListener('keydown', (event) => {
  const inField = event.target.matches('input, textarea, select');

  if (event.key === 'Escape') {
    if (window.SettingsUI?.isOpen()) {
      SettingsUI.close();
      return;
    }
    if (window.Plans?.isOpen()) {
      Plans.closeEditor();
      return;
    }
    if (!confirmOverlay.classList.contains('hidden')) return closeConfirmDialog();
    if (!calendarOverlay.classList.contains('hidden')) return closeCalendarDialog();
    if (!widgetOverlay.classList.contains('hidden')) return closeWidgetGallery();
    if (!eventOverlay.classList.contains('hidden')) return closeEventDialog();
    if (!calendarMenu.classList.contains('hidden')) return hideContextMenu();
    if (!appMenu.classList.contains('hidden')) return hideAppMenu();
    if (!searchResults.classList.contains('hidden')) {
      hideSearchResults();
      searchInput.blur();
      return;
    }
    return;
  }

  if (window.SettingsUI?.isOpen() || window.Plans?.isOpen()) return;

  if (!eventOverlay.classList.contains('hidden')) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      saveEvent();
    }
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key === ',') {
    event.preventDefault();
    openSettings('general');
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

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    redo();
    return;
  }

  if (event.key === '/') {
    event.preventDefault();
    focusSearch();
    return;
  }

  if (event.altKey && event.key === 'ArrowLeft') {
    event.preventDefault();
    navigateBack();
    return;
  }
  if (event.altKey && event.key === 'ArrowRight') {
    event.preventDefault();
    navigateForward();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  if (matchesShortcut(event, 'today')) {
    event.preventDefault();
    goToday();
  } else if (matchesShortcut(event, 'day')) {
    event.preventDefault();
    switchView('day');
  } else if (matchesShortcut(event, 'week')) {
    event.preventDefault();
    switchView('week');
  } else if (matchesShortcut(event, 'month')) {
    event.preventDefault();
    switchView('month');
  } else if (matchesShortcut(event, 'year')) {
    event.preventDefault();
    switchView('year');
  } else if (matchesShortcut(event, 'newPlan')) {
    event.preventDefault();
    openPlanEditor(null);
  } else if (matchesShortcut(event, 'prev')) {
    event.preventDefault();
    navigate(-1);
  } else if (matchesShortcut(event, 'next')) {
    event.preventDefault();
    navigate(1);
  }
});

/* ------------------------------------------------------------------ */
/* 导航与启动                                                          */
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
  if (payload.action === 'open-tasks') {
    closeAllPopups();
    openTaskOverlay();
    return;
  }
  if (payload.action === 'open-plan' && payload.planId) {
    closeAllPopups();
    openPlanEditor(payload.planId);
    return;
  }
  if (payload.action === 'open-settings') {
    closeAllPopups();
    openSettings('general');
    return;
  }

  closeAllPopups();

  if (payload.eventId) {
    const event = state.events.find((item) => item.id === payload.eventId);
    if (event) {
      const occurrenceDate =
        payload.occurrenceDate || ymd(parseLocal(event.start));
      captureTimeScroll();
      cursor = startOfDay(parseLocal(occurrenceDate));
      if (view === 'year') view = 'month';
      saveState();
      render();
      openEventDialog({ eventId: event.id, occurrenceDate });
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
/* 计划节点提醒                                                        */
/* ------------------------------------------------------------------ */

const REMINDER_STORAGE_PREFIX = 'morrow-plan-reminders:';
let reminderRetry = null;

function reminderStorageKey(dateKey = ymd(new Date())) {
  return `${REMINDER_STORAGE_PREFIX}${dateKey}`;
}

function dismissedReminderIds(dateKey = ymd(new Date())) {
  try {
    const value = JSON.parse(localStorage.getItem(reminderStorageKey(dateKey)) || '[]');
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}

function dismissPlanReminders() {
  const key = ymd(new Date());
  const ids = Plans.remindersOn(key).map((item) => item.reminder.id);
  try {
    const merged = new Set([...dismissedReminderIds(key), ...ids]);
    localStorage.setItem(reminderStorageKey(key), JSON.stringify([...merged]));
  } catch {
    // localStorage 不可用时只关闭本次
  }
  reminderOverlay.classList.add('hidden');
}

function showPlanReminders(force = false) {
  if (!reminderOverlay || !reminderOverlay.classList.contains('hidden')) return;
  const key = ymd(new Date());
  const dismissed = dismissedReminderIds(key);
  const items = Plans.remindersOn(key).filter(
    (item) => !dismissed.has(item.reminder.id)
  );
  if (items.length === 0) return;
  const busy = $$('.overlay').some(
    (overlay) => overlay !== reminderOverlay && !overlay.classList.contains('hidden')
  );
  if (busy && !force) {
    clearTimeout(reminderRetry);
    reminderRetry = setTimeout(() => showPlanReminders(false), 2600);
    return;
  }

  const poem = Plans.randomPoem();
  const single = items.length === 1 ? items[0] : null;
  $('#reminder-kicker').textContent = single
    ? `计划 · ${single.plan.title}`
    : 'TODAY · 今天的一个节点';
  $('#reminder-heading').textContent = single
    ? single.reminder.text
    : `今天有 ${items.length} 个计划节点`;
  $('#reminder-list').innerHTML = items
    .map(({ plan, reminder }) => {
      const color = Plans.colorFor(plan, state);
      return `<div class="reminder-item" style="--plan-color:${color}">
        <span class="reminder-dot"></span>
        <span class="reminder-body">
          <strong>${esc(plan.title)}</strong>
          <span>${single ? '今天走到这个节点，按自己的节奏来。' : esc(reminder.text)}</span>
        </span>
        <span class="reminder-meta">${plan.end.slice(5).replace('-', '/')} 截止</span>
      </div>`;
    })
    .join('');
  $('#reminder-poem').textContent = `「${poem.line}」 · ${poem.from}`;
  reminderOverlay.classList.remove('hidden');
}

$('#reminder-dismiss').addEventListener('click', dismissPlanReminders);
reminderOverlay.addEventListener('mousedown', (event) => {
  if (event.target === reminderOverlay) dismissPlanReminders();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !reminderOverlay.classList.contains('hidden')) {
    event.preventDefault();
    dismissPlanReminders();
  }
});

/* ------------------------------------------------------------------ */
/* 日程提醒                                                            */
/* ------------------------------------------------------------------ */

const eventReminderQueue = [];
let activeEventReminder = null;
let eventReminderRetry = null;

function reminderAtFor(event, occurrence) {
  const start = parseLocal(occurrence.start);
  if (Number.isNaN(start.getTime())) return null;
  if (event.allDay) start.setHours(9, 0, 0, 0);
  return new Date(start.getTime() - event.reminder.minutes * 60000);
}

function collectUpcomingReminders(now = new Date(), horizonDays = 7) {
  const list = [];
  const horizon = new Date(now.getTime() + horizonDays * 86400000);
  const rangeStart = new Date(now.getTime() - 120000);
  for (const event of state.events) {
    if (!event.reminder || !isEventVisible(event)) continue;
    for (const occurrence of Recurrence.expand(event, rangeStart, horizon)) {
      const at = reminderAtFor(event, occurrence);
      if (!at || at < rangeStart || at > horizon) continue;
      const calendar = calendarFor(event);
      const start = parseLocal(occurrence.start);
      const end = parseLocal(occurrence.end);
      const timeLabel = event.allDay
        ? '全天'
        : `${formatTime(start)} – ${formatTime(end)}`;
      list.push({
        key: `${event.id}:${occurrence.occurrenceDate}:${at.getTime()}`,
        eventId: event.id,
        occurrenceDate: occurrence.occurrenceDate,
        title: event.title,
        body: `${formatMonthDay(start)} ${timeLabel}${
          event.location ? ` · ${event.location}` : ''
        }`,
        at: at.toISOString(),
        system: event.reminder.system === true,
        calendar: calendar.name,
        allDay: Boolean(event.allDay),
      });
      if (list.length >= 200) break;
    }
    if (list.length >= 200) break;
  }
  return list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

function syncReminders() {
  if (!window.desktop?.reminders) return;
  window.desktop.reminders.sync(collectUpcomingReminders()).catch(() => {});
}

function showNextEventReminder(force = false) {
  if (!eventReminderOverlay || !eventReminderOverlay.classList.contains('hidden')) return;
  if (activeEventReminder) return;
  if (eventReminderQueue.length === 0) return;
  const busy = $$('.overlay').some(
    (overlay) => overlay !== eventReminderOverlay && !overlay.classList.contains('hidden')
  );
  if (busy && !force) {
    clearTimeout(eventReminderRetry);
    eventReminderRetry = setTimeout(() => showNextEventReminder(false), 2200);
    return;
  }
  const reminder = eventReminderQueue.shift();
  activeEventReminder = reminder;
  const at = new Date(reminder.at);
  const valid = !Number.isNaN(at.getTime());
  $('#event-reminder-time').textContent = valid
    ? `${at.getMonth() + 1}月${at.getDate()}日 ${pad(at.getHours())}:${pad(at.getMinutes())}`
    : '';
  $('#event-reminder-title').textContent = reminder.title || '日程提醒';
  $('#event-reminder-meta').textContent = [reminder.calendar, reminder.body]
    .filter(Boolean)
    .join(' · ');
  eventReminderOverlay.classList.remove('hidden');
}

function closeEventReminder() {
  eventReminderOverlay.classList.add('hidden');
  activeEventReminder = null;
  setTimeout(() => showNextEventReminder(false), 240);
}

function enqueueEventReminder(payload) {
  if (!payload || typeof payload !== 'object') return;
  eventReminderQueue.push(payload);
  showNextEventReminder(false);
}

function snoozeEventReminder() {
  const reminder = activeEventReminder;
  if (!reminder) return;
  const next = {
    ...reminder,
    key: `${reminder.key || reminder.eventId}:snooze:${Date.now()}`,
    at: new Date(Date.now() + 5 * 60000).toISOString(),
  };
  closeEventReminder();
  setTimeout(() => enqueueEventReminder(next), 5 * 60000);
  showToast('5 分钟后再次提醒');
}

function openActiveEventReminder() {
  const reminder = activeEventReminder;
  if (!reminder) return;
  const event = state.events.find((item) => item.id === reminder.eventId);
  closeEventReminder();
  if (!event) {
    showToast('这个日程已经被删除');
    return;
  }
  captureTimeScroll();
  cursor = startOfDay(parseLocal(reminder.occurrenceDate || event.start));
  if (view === 'year') view = 'month';
  render();
  openEventDialog({ eventId: event.id, occurrenceDate: reminder.occurrenceDate });
}

$('#event-reminder-dismiss').addEventListener('click', closeEventReminder);
$('#event-reminder-snooze').addEventListener('click', snoozeEventReminder);
$('#event-reminder-open').addEventListener('click', openActiveEventReminder);
eventReminderOverlay.addEventListener('mousedown', (event) => {
  if (event.target === eventReminderOverlay) closeEventReminder();
});
document.addEventListener('keydown', (event) => {
  if (
    event.key === 'Escape' &&
    eventReminderOverlay &&
    !eventReminderOverlay.classList.contains('hidden')
  ) {
    event.preventDefault();
    closeEventReminder();
  }
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) showNextEventReminder(false);
});
window.desktop.reminders.onFire(enqueueEventReminder);

window.__app = {
  getState: () => state,
  saveState,
  render,
  showToast,
  openConfirm,
  openPlanEditor,
  openSettings,
  SettingsUI,
};

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
  Holidays.setCustom(state.settings.holidayData);
  applySidebarState();
  Appearance.apply(state.settings);

  Plans.init({
    getState: () => state,
    saveState,
    render,
    showToast,
    openConfirm,
    recordHistory,
    movePlanToTrash: (plan) =>
      addTrashEntry({
        kind: 'plan',
        title: plan.title,
        item: JSON.parse(JSON.stringify(plan)),
        meta: {},
      }),
  });

  SettingsUI.init({
    getState: () => state,
    onChange: settingsChanged,
    getAppInfo: () => window.desktop.appInfo(),
    exportConfig: exportConfiguration,
    importConfig: importConfiguration,
    openDataFolder,
    openPlanEditor,
    openExternal: (url) => window.desktop.openExternal(url),
    showToast,
    recordHistory,
    openConfirm,
    importHolidays,
  });

  const planCalendar = $('#plan-calendar');
  if (planCalendar) {
    planCalendar.addEventListener('change', () => {
      const calendar = calendarById(planCalendar.value);
      $('#plan-calendar-dot').style.background = calendar?.color || '#8E8E93';
    });
  }

  render();
  window.desktop.rendererReady();
  syncReminders();
  clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    const nowKey = ymd(new Date());
    if (nowKey !== currentDayKey) {
      currentDayKey = nowKey;
      Plans.checkAutoMilestones(true);
      showPlanReminders(true);
      render();
    } else {
      updateNowLine();
    }
  }, 30000);

  setInterval(syncReminders, 5 * 60000);

  setTimeout(() => {
    if (!reminderShown) {
      reminderShown = true;
      Plans.dailyReminder();
      Plans.checkAutoMilestones(true);
      showPlanReminders(true);
    }
  }, 1700);
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
  openSettings(section = 'general') {
    openSettings(section);
  },
  openPlanEditor(id = null) {
    openPlanEditor(id);
  },
  closeAll() {
    closeAllPopups();
  },
  showReminders() {
    showPlanReminders(true);
    return !reminderOverlay.classList.contains('hidden');
  },
  dismissReminders() {
    dismissPlanReminders();
  },
  collectReminders() {
    return collectUpcomingReminders();
  },
  fireEventReminder(payload) {
    enqueueEventReminder(payload);
    return !eventReminderOverlay.classList.contains('hidden');
  },
  syncReminders() {
    syncReminders();
  },
  importHolidayData(raw) {
    return applyHolidayData(raw);
  },
  parseIcs(text) {
    return Ics.parse(text);
  },
  buildIcs(options) {
    return buildIcsExport(options);
  },
  importIcs(text, calendarId) {
    return importIcsText(text, calendarId);
  },
  undo() {
    undo();
    return { past: historyPast.length, future: historyFuture.length };
  },
  redo() {
    redo();
    return { past: historyPast.length, future: historyFuture.length };
  },
  historyState() {
    return { past: historyPast.length, future: historyFuture.length };
  },
  goBack() {
    navigateBack();
    return { view, cursor: ymd(cursor), past: navPast.length, future: navFuture.length };
  },
  goForward() {
    navigateForward();
    return { view, cursor: ymd(cursor), past: navPast.length, future: navFuture.length };
  },
  navHistory() {
    return {
      past: navPast.slice(),
      future: navFuture.slice(),
      view,
      cursor: ymd(cursor),
    };
  },
  trashState() {
    return JSON.parse(JSON.stringify(state.trash || []));
  },
  tasksState() {
    return JSON.parse(JSON.stringify(state.tasks || []));
  },
  addTask(title, due) {
    return addTask(title, due);
  },
  openTasks() {
    openTaskOverlay();
  },
  stats() {
    return {
      view,
      events: state.events.length,
      plans: state.plans.length,
      calendars: state.calendars.length,
      weekStart: getWeekStart(),
      monthCells: $$('.month-day', mainView).length,
      restDays: $$('.month-day.rest-day', mainView).length,
      halfDays: $$('.month-day.half-day', mainView).length,
      planChips: $$('.plan-chip', mainView).length,
      eventChips: $$('.event-chip', mainView).length,
      timedEvents: $$('.timed-event', mainView).length,
      allDayChips: $$('.allday-chip', mainView).length,
      yearMonths: $$('.year-month', mainView).length,
      dialogOpen: !eventOverlay.classList.contains('hidden'),
      settingsOpen: Boolean(window.SettingsUI?.isOpen()),
      planEditorOpen: Boolean(window.Plans?.isOpen()),
      widgetGalleryOpen: !widgetOverlay.classList.contains('hidden'),
      widgetsAdded: galleryWidgets.length,
    };
  },
};
