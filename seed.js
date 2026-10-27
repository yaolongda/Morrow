'use strict';

/* 首次启动时的示例数据。日期相对“今天”生成，保证任何时候打开都有内容。 */

const pad = (n) => String(n).padStart(2, '0');

function ymd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toLocal(date) {
  return `${ymd(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function createSeedData() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const at = (dayOffset, hour, minute = 0) => {
    const date = addDays(today, dayOffset);
    date.setHours(hour, minute, 0, 0);
    return toLocal(date);
  };

  const day = (offset) => ymd(addDays(today, offset));

  let n = 0;
  const timed = (calendarId, title, dayOffset, startHour, endHour, extra = {}) => {
    const startH = Math.floor(startHour);
    const endH = Math.floor(endHour);
    return {
      id: `seed-${++n}`,
      calendarId,
      title,
      start: at(dayOffset, startH, Math.round((startHour - startH) * 60)),
      end: at(dayOffset, endH, Math.round((endHour - endH) * 60)),
      allDay: false,
      ...extra,
    };
  };

  const allDay = (calendarId, title, startOffset, endOffset = startOffset, extra = {}) => ({
    id: `seed-${++n}`,
    calendarId,
    title,
    start: `${day(startOffset)}T00:00`,
    end: `${day(endOffset)}T23:59`,
    allDay: true,
    ...extra,
  });

  return {
    version: 3,
    calendars: [
      { id: 'work', name: '工作', color: '#007AFF', visible: true },
      { id: 'personal', name: '个人', color: '#FF9500', visible: true },
      { id: 'family', name: '家庭', color: '#34C759', visible: true },
      { id: 'birthday', name: '生日', color: '#AF52DE', visible: true },
    ],
    events: [
      timed('work', '月度复盘', -8, 15, 16, {
        location: '线上 · 飞书',
        recurrence: {
          freq: 'monthly',
          interval: 1,
          weekdays: [],
          until: null,
          exceptions: [],
        },
      }),
      timed('work', '设计评审 · v2.3', -4, 14, 15.5, { location: '线上 · 飞书' }),
      allDay('work', '项目里程碑', -1),
      timed('work', '每日站会', 0, 9.5, 10, {
        recurrence: {
          freq: 'weekly',
          interval: 1,
          weekdays: [1, 2, 3, 4, 5],
          until: null,
          exceptions: [],
        },
      }),
      timed('work', '产品评审会', 0, 10.5, 12, {
        location: '3F 会议室「远山」',
        notes: '确认 Q4 路线图与设计稿终版，带上数据看板。',
      }),
      timed('personal', '午餐 · 设计团队', 0, 12.5, 13.5, { location: '楼下 · 山茶餐厅' }),
      timed('work', '一对一沟通', 0, 15, 15.75),
      timed('personal', '健身 · 力量训练', 0, 18.5, 19.5, { location: '公司健身房' }),
      allDay('work', '上海出差', 1, 2, { notes: '客户现场支持，周五返程。' }),
      timed('work', '客户方案沟通', 2, 14, 16, { location: '上海 · 静安' }),
      timed('work', '周会 · 复盘', 4, 16, 17),
      timed('family', '家庭早午餐', 5, 11, 13, { location: '外婆家' }),
      allDay('birthday', '林悦生日', 6),
      allDay('work', '季度规划工作坊', 9, 10),
      timed('personal', '电影《沙丘 3》', 12, 19.5, 22, { location: '万象影城' }),
      timed('personal', '体检预约', 15, 8.5, 10, { location: '市第一医院' }),
      timed('personal', '读书会 · 《芯片战争》', 20, 19, 21, { location: '西西弗书店' }),
    ],
    tasks: [],
    eventTemplates: [],
    plans: [
      {
        id: 'seed-plan-1',
        calendarId: 'work',
        title: 'Q4 产品路线图',
        start: day(-6),
        end: day(34),
        progress: 42,
        notes: '梳理 Q4 目标与节奏，按阶段推进。可在计划编辑器中更新进度。',
      },
    ],
    settings: {
      weekStart: 1,
      defaultCalendarId: 'work',
      lastView: 'month',
      sidebarVisible: true,
      schedule: {
        preset: 'double',
        restWeekdays: [0, 6],
        halfWeekdays: [],
        alternate: null,
        cycle: null,
        overrides: {},
        followHolidays: true,
      },
      workHours: {
        enabled: true,
        mode: 'split',
        morning: { start: '09:00', end: '12:00' },
        afternoon: { start: '13:00', end: '18:00' },
        full: { start: '09:00', end: '18:00' },
        night: { start: '21:00', end: '06:00' },
        celebrate: true,
        lunch: true,
        off: true,
        animation: true,
      },
      holidayData: {},
      shiftTemplates: [],
      shortcuts: {
        today: 't',
        day: 'd',
        week: 'w',
        month: 'm',
        year: 'y',
        newPlan: 'p',
        prev: 'ArrowLeft',
        next: 'ArrowRight',
      },
      appearance: {
        theme: 'classic',
        accent: '#FF3B30',
        font: 'system',
        material: 'none',
        panelOpacity: 0.94,
        glass: 8,
        background: null,
      },
      display: {
        lunar: true,
        solarTerms: true,
        almanac: false,
        zodiac: false,
        weekNumbers: false,
      },
      plans: {
        showInMonth: true,
        showInWeek: true,
        reminders: true,
      },
    },
  };
}

module.exports = { createSeedData };
