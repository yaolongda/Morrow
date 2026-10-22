'use strict';

/**
 * 工作日程 / 休息日规则引擎。主窗口与桌面小组件共用。
 * schedule 结构：
 * {
 *   preset: 'double' | 'single' | 'bigSmall' | 'threeOne' | 'satHalf' |
 *           'satHalfBigSmall' | 'monthlyFive' | 'custom',
 *   restWeekdays: [0..6],
 *   halfWeekdays: [0..6],
 *   alternate: null | { anchor, bigRest, smallRest, bigHalf, smallHalf },
 *   cycle: null | { work, rest, anchor },
 *   overrides: { 'YYYY-MM-DD': 'rest' | 'half' | 'work' }
 * }
 */
(function () {
  const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const PRESETS = [
    { id: 'double', name: '双休', description: '周六、周日休息' },
    { id: 'single', name: '单休', description: '仅周日休息' },
    { id: 'bigSmall', name: '大小周', description: '大周双休、小周单休交替' },
    { id: 'threeOne', name: '上三休一', description: '连续工作 3 天，休息 1 天' },
    { id: 'satHalf', name: '周六上半天', description: '周日休息，周六半天' },
    { id: 'satHalfBigSmall', name: '周六半天大小周', description: '单休周周六半天，双休周周末全休' },
    { id: 'monthlyFive', name: '月休五天（自设）', description: '周日休息，可在特殊日期中自选其余休息日' },
    { id: 'custom', name: '自定义', description: '逐天设置工作 / 半休 / 休息' },
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

  function startOfWeek(date, weekStart) {
    const result = startOfDay(date);
    const start = [0, 1, 6].includes(Number(weekStart)) ? Number(weekStart) : 1;
    const diff = (result.getDay() - start + 7) % 7;
    result.setDate(result.getDate() - diff);
    return result;
  }

  function daysBetween(from, to) {
    return Math.round((startOfDay(to) - startOfDay(from)) / 86400000);
  }

  function weeksBetween(from, to, weekStart) {
    return Math.round(
      (startOfWeek(to, weekStart) - startOfWeek(from, weekStart)) / (7 * 86400000)
    );
  }

  function uniqueWeekdays(values) {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.map(Number).filter((value) => value >= 0 && value <= 6))].sort();
  }

  function cleanOverrides(input) {
    const result = {};
    if (!input || typeof input !== 'object') return result;
    for (const [key, value] of Object.entries(input)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      if (!['rest', 'half', 'work'].includes(value)) continue;
      result[key] = value;
    }
    return result;
  }

  function normalize(input) {
    const source = input && typeof input === 'object' ? input : {};
    const preset = PRESETS.some((item) => item.id === source.preset)
      ? source.preset
      : 'double';
    return {
      preset,
      restWeekdays: Array.isArray(source.restWeekdays)
        ? uniqueWeekdays(source.restWeekdays)
        : preset === 'double'
          ? [0, 6]
          : [0],
      halfWeekdays: uniqueWeekdays(source.halfWeekdays),
      alternate:
        source.alternate && typeof source.alternate === 'object'
          ? {
              anchor:
                typeof source.alternate.anchor === 'string'
                  ? source.alternate.anchor
                  : ymd(new Date()),
              bigRest: uniqueWeekdays(source.alternate.bigRest),
              smallRest: uniqueWeekdays(source.alternate.smallRest),
              bigHalf: uniqueWeekdays(source.alternate.bigHalf),
              smallHalf: uniqueWeekdays(source.alternate.smallHalf),
            }
          : null,
      cycle:
        source.cycle &&
        typeof source.cycle === 'object' &&
        Number(source.cycle.work) > 0 &&
        Number(source.cycle.rest) >= 0
          ? {
              work: Math.max(1, Math.min(31, Math.round(Number(source.cycle.work)))),
              rest: Math.max(0, Math.min(31, Math.round(Number(source.cycle.rest)))),
              anchor:
                typeof source.cycle.anchor === 'string'
                  ? source.cycle.anchor
                  : ymd(new Date()),
            }
          : null,
      overrides: cleanOverrides(source.overrides),
    };
  }

  function defaultSchedule() {
    return normalize({ preset: 'double', restWeekdays: [0, 6], halfWeekdays: [] });
  }

  function applyPreset(presetId, current, options = {}) {
    const next = normalize(current);
    const preset = PRESETS.some((item) => item.id === presetId) ? presetId : 'double';
    const anchor = options.anchor || ymd(new Date());
    next.preset = preset;
    next.alternate = null;
    next.cycle = null;

    switch (preset) {
      case 'double':
        next.restWeekdays = [0, 6];
        next.halfWeekdays = [];
        break;
      case 'single':
        next.restWeekdays = [0];
        next.halfWeekdays = [];
        break;
      case 'bigSmall':
        next.restWeekdays = [0];
        next.halfWeekdays = [];
        next.alternate = {
          anchor,
          bigRest: [0, 6],
          smallRest: [0],
          bigHalf: [],
          smallHalf: [],
        };
        break;
      case 'threeOne':
        next.restWeekdays = [];
        next.halfWeekdays = [];
        next.cycle = { work: 3, rest: 1, anchor };
        break;
      case 'satHalf':
        next.restWeekdays = [0];
        next.halfWeekdays = [6];
        break;
      case 'satHalfBigSmall':
        next.restWeekdays = [0];
        next.halfWeekdays = [6];
        next.alternate = {
          anchor,
          bigRest: [0, 6],
          smallRest: [0],
          bigHalf: [],
          smallHalf: [6],
        };
        break;
      case 'monthlyFive':
        next.restWeekdays = [0];
        next.halfWeekdays = [];
        break;
      case 'custom':
      default:
        // 保留当前自定义设置
        break;
    }
    return next;
  }

  function dayType(scheduleInput, date, weekStart = 1) {
    const schedule = normalize(scheduleInput);
    const key = ymd(date);
    if (schedule.overrides[key]) return schedule.overrides[key];

    if (schedule.cycle && schedule.cycle.work + schedule.cycle.rest > 0) {
      const total = schedule.cycle.work + schedule.cycle.rest;
      const diff = daysBetween(parseYmd(schedule.cycle.anchor), date);
      const phase = ((diff % total) + total) % total;
      return phase < schedule.cycle.work ? 'work' : 'rest';
    }

    if (schedule.alternate) {
      const alternate = schedule.alternate;
      const weeks = weeksBetween(parseYmd(alternate.anchor), date, weekStart);
      const big = ((weeks % 2) + 2) % 2 === 0;
      const rest = big ? alternate.bigRest : alternate.smallRest;
      const half = big ? alternate.bigHalf : alternate.smallHalf;
      const weekday = date.getDay();
      if (rest.includes(weekday)) return 'rest';
      if (half.includes(weekday)) return 'half';
      return 'work';
    }

    const weekday = date.getDay();
    if (schedule.restWeekdays.includes(weekday)) return 'rest';
    if (schedule.halfWeekdays.includes(weekday)) return 'half';
    return 'work';
  }

  function isRest(schedule, date, weekStart) {
    return dayType(schedule, date, weekStart) === 'rest';
  }

  function isHalf(schedule, date, weekStart) {
    return dayType(schedule, date, weekStart) === 'half';
  }

  function describe(scheduleInput, weekStart = 1) {
    const schedule = normalize(scheduleInput);
    const preset = PRESETS.find((item) => item.id === schedule.preset);
    const overrideCount = Object.keys(schedule.overrides).length;
    let text = '';

    if (schedule.preset === 'custom') {
      const rest = schedule.restWeekdays.map((day) => WEEKDAY_LABELS[day]);
      const half = schedule.halfWeekdays.map((day) => WEEKDAY_LABELS[day]);
      const parts = [];
      if (rest.length) parts.push(`${rest.join('、')}休息`);
      if (half.length) parts.push(`${half.join('、')}半天`);
      if (schedule.restWeekdays.length === 0 && schedule.halfWeekdays.length === 0) {
        parts.push('每天工作');
      }
      text = parts.join('；');
    } else {
      text = preset?.description || '双休';
      if (schedule.alternate) {
        text += `（以 ${schedule.alternate.anchor} 所在周为大周）`;
      }
      if (schedule.cycle) {
        text += `（自 ${schedule.cycle.anchor} 起）`;
      }
    }
    if (overrideCount > 0) text += ` · ${overrideCount} 个特殊日期`;
    return text;
  }

  function monthStats(scheduleInput, year, month, weekStart = 1) {
    const schedule = normalize(scheduleInput);
    const days = new Date(year, month + 1, 0).getDate();
    let work = 0;
    let rest = 0;
    let half = 0;
    for (let day = 1; day <= days; day += 1) {
      const type = dayType(schedule, new Date(year, month, day), weekStart);
      if (type === 'rest') rest += 1;
      else if (type === 'half') half += 1;
      else work += 1;
    }
    return { work, rest, half };
  }

  window.Schedule = {
    WEEKDAY_LABELS,
    PRESETS,
    normalize,
    defaultSchedule,
    applyPreset,
    dayType,
    isRest,
    isHalf,
    describe,
    monthStats,
    startOfWeek,
    ymd,
    parseYmd,
  };
})();
