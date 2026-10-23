'use strict';

/**
 * 工作时段与下班庆祝引擎。主窗口与桌面小组件共用。
 * workHours 结构：
 * {
 *   enabled: true,
 *   mode: 'split' | 'full' | 'night',
 *   morning: { start: '09:00', end: '12:00' },
 *   afternoon: { start: '13:00', end: '18:00' },
 *   full: { start: '09:00', end: '18:00' },
 *   night: { start: '21:00', end: '06:00' },
 *   celebrate: true,
 *   lunch: true,
 *   off: true
 * }
 */

(function () {
  const DEFAULT_WORK_HOURS = {
    enabled: true,
    mode: 'split',
    morning: { start: '09:00', end: '12:00' },
    afternoon: { start: '13:00', end: '18:00' },
    full: { start: '09:00', end: '18:00' },
    night: { start: '21:00', end: '06:00' },
    celebrate: true,
    lunch: true,
    off: true,
  };

  const LUNCH_POEMS = [
    { line: '把上午的忙碌放下，好好吃一顿饭。', from: '朝暮' },
    { line: '偷得浮生半日闲。', from: '李涉' },
    { line: '人间烟火气，最抚凡人心。', from: '朝暮' },
    { line: '半日清欢，刚刚好。', from: '朝暮' },
    { line: '且将新火试新茶，诗酒趁年华。', from: '苏轼' },
    { line: '慢一点，也是一种认真。', from: '朝暮' },
    { line: '吃饱了，才有力气继续生活。', from: '朝暮' },
  ];

  const OFF_POEMS = [
    { line: '今天的辛苦，到这里就好。', from: '朝暮' },
    { line: '晚风会替你收好今天的疲惫。', from: '朝暮' },
    { line: '行到水穷处，坐看云起时。', from: '王维' },
    { line: '采菊东篱下，悠然见南山。', from: '陶渊明' },
    { line: '回家的路，慢一点也没关系。', from: '朝暮' },
    { line: '你已经在好好生活了。', from: '朝暮' },
    { line: '月出惊山鸟，时鸣春涧中。', from: '王维' },
    { line: '晚来天欲雪，能饮一杯无？', from: '白居易' },
    { line: '把工作留在今天，把夜晚还给自己。', from: '朝暮' },
    { line: '白日放歌须纵酒，青春作伴好还乡。', from: '杜甫' },
  ];

  const EVE_POEMS = [
    { line: '明天不用早起，今晚可以晚一点。', from: '朝暮' },
    { line: '假期在门口等你。', from: '朝暮' },
    { line: '春风得意马蹄疾，一日看尽长安花。', from: '孟郊' },
    { line: '今宵剩把银釭照，犹恐相逢是梦中。', from: '晏几道' },
    { line: '把这一周轻轻放下，去拥抱你的生活。', from: '朝暮' },
    { line: '明朝放我东归去，后夜相思月满船。', from: '黄庭坚' },
    { line: '灯火可亲，人间值得。', from: '朝暮' },
  ];

  const pad = (value) => String(value).padStart(2, '0');

  function ymd(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseYmd(value) {
    const [year, month, day] = String(value).split('-').map(Number);
    return new Date(year || 1970, (month || 1) - 1, day || 1);
  }

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

  function isTime(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value));
  }

  function timeToMinutes(value) {
    const [hour, minute] = String(value).split(':').map(Number);
    return (hour || 0) * 60 + (minute || 0);
  }

  function atMinutes(date, minutes) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    result.setMinutes(minutes);
    return result;
  }

  function normalizeRange(input, fallback) {
    const source = input && typeof input === 'object' ? input : {};
    return {
      start: isTime(source.start) ? source.start : fallback.start,
      end: isTime(source.end) ? source.end : fallback.end,
    };
  }

  function normalize(input) {
    const source = input && typeof input === 'object' ? input : {};
    return {
      enabled: source.enabled !== false,
      mode: ['split', 'full', 'night'].includes(source.mode) ? source.mode : 'split',
      morning: normalizeRange(source.morning, DEFAULT_WORK_HOURS.morning),
      afternoon: normalizeRange(source.afternoon, DEFAULT_WORK_HOURS.afternoon),
      full: normalizeRange(source.full, DEFAULT_WORK_HOURS.full),
      night: normalizeRange(source.night, DEFAULT_WORK_HOURS.night),
      celebrate: source.celebrate !== false,
      lunch: source.lunch !== false,
      off: source.off !== false,
    };
  }

  function defaults() {
    return normalize(null);
  }

  function dayType(date, options = {}) {
    return options.schedule
      ? Schedule.dayType(options.schedule, date, options.weekStart ?? 1)
      : 'work';
  }

  function periodsForStartDate(date, options = {}) {
    const workHours = normalize(options.workHours);
    if (!workHours.enabled) return [];
    const type = dayType(date, options);
    if (type === 'rest') return [];

    const base = startOfDay(date);
    const make = (key, label, range, kind, startOffset = 0, endOffset = 0) => {
      const start = atMinutes(addDays(base, startOffset), timeToMinutes(range.start));
      let end = atMinutes(addDays(base, endOffset), timeToMinutes(range.end));
      if (end <= start) end = addDays(end, 1);
      return { key, label, start, end, kind };
    };

    if (type === 'half') {
      const range =
        workHours.mode === 'full'
          ? { start: workHours.full.start, end: workHours.morning.end }
          : workHours.morning;
      return [make('half', '半天', range, 'off')];
    }

    if (workHours.mode === 'full') {
      return [make('full', '全天', workHours.full, 'off')];
    }

    if (workHours.mode === 'night') {
      return [make('night', '夜班', workHours.night, 'off', 0, 1)];
    }

    return [
      make('morning', '上午', workHours.morning, 'lunch'),
      make('afternoon', '下午', workHours.afternoon, 'off'),
    ];
  }

  function shiftRangeFor(date, options = {}) {
    const workHours = normalize(options.workHours);
    const type = dayType(date, options);
    if (type === 'rest') return null;
    if (type === 'half') {
      return workHours.mode === 'full'
        ? { start: workHours.full.start, end: workHours.morning.end }
        : { ...workHours.morning };
    }
    if (workHours.mode === 'full') return { ...workHours.full };
    if (workHours.mode === 'night') return { ...workHours.night };
    return { start: workHours.morning.start, end: workHours.afternoon.end };
  }

  function isEveOfRest(date, options = {}) {
    return dayType(addDays(startOfDay(date), 1), options) === 'rest';
  }

  function nextRestDate(date, options = {}) {
    let cursor = addDays(startOfDay(date), 1);
    for (let i = 0; i < 60; i += 1) {
      if (dayType(cursor, options) === 'rest') return cursor;
      cursor = addDays(cursor, 1);
    }
    return null;
  }

  function celebrationsForDate(date, options = {}) {
    const workHours = normalize(options.workHours);
    if (!workHours.enabled || !workHours.celebrate) return [];
    const day = startOfDay(date);
    const events = [];
    for (const offset of [-1, 0]) {
      const startDate = addDays(day, offset);
      for (const period of periodsForStartDate(startDate, options)) {
        if (ymd(period.end) !== ymd(day)) continue;
        if (period.kind === 'lunch' && !workHours.lunch) continue;
        if (period.kind !== 'lunch' && !workHours.off) continue;
        const eve = isEveOfRest(day, options);
        const kind =
          period.kind === 'lunch' ? 'lunch' : eve ? 'preHoliday' : 'off';
        events.push({
          key: `${ymd(startDate)}:${period.key}`,
          kind,
          intensity: kind === 'lunch' ? 1 : eve ? 3 : 2,
          at: period.end,
          startDate,
          period,
        });
      }
    }
    return events.sort((a, b) => a.at - b.at);
  }

  function formatRemaining(milliseconds) {
    const minutes = Math.max(0, Math.ceil(milliseconds / 60000));
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
    }
    return `${minutes} 分钟`;
  }

  function formatClock(date) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function statusFor(now, options = {}) {
    const workHours = normalize(options.workHours);
    if (!workHours.enabled) return null;
    const today = startOfDay(now);
    const type = dayType(today, options);
    if (type === 'rest') {
      return { state: 'rest', label: '今天休息', detail: '好好生活，慢慢充电', next: null };
    }

    const periods = periodsForStartDate(today, options);
    if (periods.length === 0) return null;

    for (const period of periods) {
      if (now >= period.start && now < period.end) {
        const isLunch = period.kind === 'lunch';
        return {
          state: 'work',
          label:
            period.key === 'night'
              ? '夜班中'
              : period.key === 'afternoon'
                ? '下午工作中'
                : period.key === 'morning'
                  ? '上午工作中'
                  : '工作中',
          detail: `距离${isLunch ? '午休' : '下班'} ${formatRemaining(period.end - now)}`,
          next: period.end,
          period,
        };
      }
    }

    const first = periods[0];
    if (now < first.start) {
      return {
        state: 'before',
        label:
          first.key === 'night'
            ? `今晚 ${formatClock(first.start)} 上班`
            : `今天 ${formatClock(first.start)} 上班`,
        detail: `距离上班 ${formatRemaining(first.start - now)}`,
        next: first.start,
        period: first,
      };
    }

    for (let i = 0; i < periods.length - 1; i += 1) {
      const current = periods[i];
      const next = periods[i + 1];
      if (now >= current.end && now < next.start) {
        return {
          state: 'break',
          label: '午休中',
          detail: `距离下午上班 ${formatRemaining(next.start - now)}`,
          next: next.start,
          period: next,
        };
      }
    }

    const last = periods[periods.length - 1];
    return {
      state: 'off',
      label: '今天已下班',
      detail: isEveOfRest(today, options) ? '明天休息，今晚属于你' : '辛苦了，剩下的时间属于你',
      next: null,
      period: last,
    };
  }

  function greetingFor(now = new Date()) {
    const hour = now.getHours();
    if (hour >= 5 && hour < 9) return { title: '早上好', detail: '今天也慢慢来。' };
    if (hour >= 9 && hour < 12) return { title: '上午好', detail: '忙一阵，也记得喝口水。' };
    if (hour >= 11 && hour < 14) return { title: '中午好', detail: '先好好吃饭，再想别的。' };
    if (hour >= 14 && hour < 18) return { title: '下午好', detail: '累了就伸个懒腰。' };
    if (hour >= 18 && hour < 23) return { title: '晚上好', detail: '今天辛苦啦。' };
    return { title: '夜深了', detail: '早点休息，明天再说。' };
  }

  function poemFor(kind) {
    const pool =
      kind === 'lunch' ? LUNCH_POEMS : kind === 'preHoliday' ? EVE_POEMS : OFF_POEMS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function celebrationText(event) {
    const poem = poemFor(event.kind);
    const meta = {
      lunch: { kicker: '午间小憩', title: '先吃饭，再继续', action: '去吃饭' },
      off: { kicker: '下班了', title: '今天辛苦了', action: '收好今天' },
      preHoliday: { kicker: '假期前夜', title: '明天不用早起', action: '进入假期' },
    }[event.kind];
    return { ...meta, line: poem.line, from: poem.from };
  }

  function upcomingCelebration(now, options = {}, windowMs = 150000) {
    const events = celebrationsForDate(now, options);
    return (
      events.find(
        (event) => now >= event.at && now.getTime() - event.at.getTime() <= windowMs
      ) || null
    );
  }

  function nextCelebrationAfter(now, options = {}) {
    const events = celebrationsForDate(now, options);
    return events.find((event) => event.at > now) || null;
  }

  window.Workday = {
    DEFAULT_WORK_HOURS,
    defaults,
    normalize,
    periodsForStartDate,
    shiftRangeFor,
    celebrationsForDate,
    upcomingCelebration,
    nextCelebrationAfter,
    celebrationText,
    statusFor,
    greetingFor,
    poemFor,
    isEveOfRest,
    nextRestDate,
    formatRemaining,
    formatClock,
    ymd,
  };
})();
