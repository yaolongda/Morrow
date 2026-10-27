'use strict';

/* 重复日程规则引擎：主窗口与桌面小组件共用。
 *
 * recurrence 数据结构：
 *   {
 *     freq: 'daily' | 'weekly' | 'monthly' | 'yearly',
 *     interval: 1..99,          // 每 N 天 / 周 / 月 / 年
 *     weekdays: [0..6],         // 仅 weekly 使用，0 = 周日
 *     until: 'YYYY-MM-DD' | null, // 含当天
 *     exceptions: ['YYYY-MM-DD']  // 被单独删除的实例
 *   }
 */

(function () {
  const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly', 'lunar-yearly'];
  const MAX_EXCEPTIONS = 2000;
  const MAX_ITERATIONS = 20000;
  const MAX_RESULTS = 4000;
  const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
  const MS_PER_DAY = 86400000;

  const pad = (value) => String(value).padStart(2, '0');

  function ymd(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseYmd(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }
    return date;
  }

  function parseLocal(value) {
    if (typeof value !== 'string') return new Date(NaN);
    const [datePart, timePart = '00:00'] = value.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);
    const date = new Date(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0, 0);
    return date;
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

  function daysBetween(from, to) {
    return Math.round((startOfDay(to) - startOfDay(from)) / MS_PER_DAY);
  }

  function formatLocal(date) {
    return `${ymd(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function normalize(input) {
    if (!input || typeof input !== 'object') return null;
    const freq = FREQUENCIES.includes(input.freq) ? input.freq : null;
    if (!freq) return null;

    const interval = Math.min(99, Math.max(1, Math.round(Number(input.interval) || 1)));

    let weekdays = [];
    if (freq === 'weekly') {
      const seen = new Set();
      for (const value of Array.isArray(input.weekdays) ? input.weekdays : []) {
        const day = Number(value);
        if (Number.isInteger(day) && day >= 0 && day <= 6) seen.add(day);
      }
      weekdays = [...seen].sort((a, b) => a - b);
    }

    const until = parseYmd(input.until) ? input.until : null;

    const lunarMonth =
      freq === 'lunar-yearly'
        ? Math.min(12, Math.max(1, Math.round(Number(input.lunarMonth) || 1)))
        : null;
    const lunarDay =
      freq === 'lunar-yearly'
        ? Math.min(30, Math.max(1, Math.round(Number(input.lunarDay) || 1)))
        : null;

    const exceptions = [];
    const seenExceptions = new Set();
    for (const value of Array.isArray(input.exceptions) ? input.exceptions : []) {
      if (!parseYmd(value) || seenExceptions.has(value)) continue;
      seenExceptions.add(value);
      exceptions.push(value);
      if (exceptions.length >= MAX_EXCEPTIONS) break;
    }

    return { freq, interval, weekdays, until, exceptions, lunarMonth, lunarDay };
  }

  function isRecurring(event) {
    return Boolean(
      event &&
        event.recurrence &&
        typeof event.recurrence === 'object' &&
        FREQUENCIES.includes(event.recurrence.freq)
    );
  }

  /* 返回落在 [rangeStart, rangeEnd) 内的实例。
   * 每个实例：{ start: 'YYYY-MM-DDTHH:mm', end: 'YYYY-MM-DDTHH:mm', occurrenceDate: 'YYYY-MM-DD' }
   */
  function expand(event, rangeStart, rangeEnd) {
    if (!event || !(rangeStart instanceof Date) || !(rangeEnd instanceof Date)) return [];
    if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) return [];
    if (rangeEnd <= rangeStart) return [];

    const start = parseLocal(event.start);
    const end = parseLocal(event.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
    const duration = end - start;
    if (duration <= 0) return [];

    const rec = normalize(event.recurrence);
    if (!rec) {
      if (end > rangeStart && start < rangeEnd) {
        return [{ start: event.start, end: event.end, occurrenceDate: ymd(start) }];
      }
      return [];
    }

    const baseDay = startOfDay(start);
    const startHour = start.getHours();
    const startMinute = start.getMinutes();
    const untilDay = rec.until ? parseYmd(rec.until) : null;
    if (untilDay && startOfDay(untilDay) < baseDay) return [];

    // 往前多看几天，避免漏掉跨入 range 的多日实例
    const lookback = Math.ceil(duration / MS_PER_DAY) + 1;
    const scanFrom = addDays(startOfDay(rangeStart), -lookback);

    const exceptions = new Set(rec.exceptions);
    const results = [];
    const rangeStartTime = rangeStart.getTime();
    const rangeEndTime = rangeEnd.getTime();

    const consider = (day) => {
      const key = ymd(day);
      if (exceptions.has(key)) return true;
      const occurrenceDate = new Date(day);
      occurrenceDate.setHours(startHour, startMinute, 0, 0);
      const occurrenceStart = occurrenceDate.getTime();
      if (occurrenceStart + duration <= rangeStartTime) return true;
      if (occurrenceStart >= rangeEndTime) return false;
      results.push({
        start: formatLocal(new Date(occurrenceStart)),
        end: formatLocal(new Date(occurrenceStart + duration)),
        occurrenceDate: key,
      });
      return results.length < MAX_RESULTS;
    };

    if (rec.freq === 'daily') {
      let index = 0;
      if (scanFrom > baseDay) {
        index = Math.max(0, Math.floor(daysBetween(baseDay, scanFrom) / rec.interval));
      }
      for (let i = 0; i < MAX_ITERATIONS; i += 1) {
        const day = addDays(baseDay, (index + i) * rec.interval);
        if (untilDay && day > untilDay) break;
        if (day >= rangeEnd) break;
        if (consider(day) === false) break;
      }
    } else if (rec.freq === 'weekly') {
      const weekdays = rec.weekdays.length ? rec.weekdays : [baseDay.getDay()];
      let day = addDays(baseDay, Math.max(0, Math.floor(daysBetween(baseDay, scanFrom) / 7) * 7));
      if (day > scanFrom) day = addDays(day, -7);
      if (day < baseDay) day = baseDay;
      for (let i = 0; i < MAX_ITERATIONS; i += 1) {
        if (untilDay && day > untilDay) break;
        if (day >= rangeEnd) break;
        const weekIndex = Math.floor(daysBetween(baseDay, day) / 7);
        if (weekIndex % rec.interval === 0 && weekdays.includes(day.getDay())) {
          if (consider(day) === false) break;
        }
        day = addDays(day, 1);
      }
    } else if (rec.freq === 'monthly') {
      const dayOfMonth = baseDay.getDate();
      const baseMonth = baseDay.getFullYear() * 12 + baseDay.getMonth();
      const fromMonth = scanFrom.getFullYear() * 12 + scanFrom.getMonth();
      let index = fromMonth > baseMonth ? Math.max(0, Math.floor((fromMonth - baseMonth) / rec.interval)) : 0;
      for (let i = 0; i < MAX_ITERATIONS; i += 1) {
        const monthNumber = baseMonth + (index + i) * rec.interval;
        const year = Math.floor(monthNumber / 12);
        const month = monthNumber - year * 12;
        const monthStart = new Date(year, month, 1);
        if (monthStart >= rangeEnd) break;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        if (dayOfMonth <= daysInMonth) {
          const day = new Date(year, month, dayOfMonth);
          if (day >= baseDay) {
            if (untilDay && day > untilDay) break;
            if (consider(day) === false) break;
          }
        }
      }
    } else if (rec.freq === 'yearly') {
      const month = baseDay.getMonth();
      const dayOfMonth = baseDay.getDate();
      const lookbackYears = Math.floor(lookback / 366);
      let index = Math.max(
        0,
        (scanFrom.getFullYear() - baseDay.getFullYear() - lookbackYears) / rec.interval
      );
      index = Math.floor(index);
      for (let i = 0; i < 400; i += 1) {
        const year = baseDay.getFullYear() + (index + i) * rec.interval;
        if (year > rangeEnd.getFullYear()) break;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        if (dayOfMonth <= daysInMonth) {
          const day = new Date(year, month, dayOfMonth);
          if (untilDay && day > untilDay) break;
          if (day >= baseDay && consider(day) === false) break;
        }
      }
    } else if (rec.freq === 'lunar-yearly') {
      if (!window.Almanac?.solarForLunar) return [];
      const baseLunar = window.Almanac.lunarOf(baseDay);
      const baseYear = baseLunar?.year || baseDay.getFullYear();
      const month = rec.lunarMonth || (baseLunar?.monthNumber || 1);
      const dayOfMonth = rec.lunarDay || (baseLunar?.day || 1);
      const isLeap = Boolean(baseLunar?.isLeap);
      const lastYear = rangeEnd.getFullYear() + 1;
      for (let offset = 0; offset < 400; offset += 1) {
        const lunarYear = baseYear + offset * rec.interval;
        if (lunarYear > lastYear) break;
        const solar = window.Almanac.solarForLunar(
          lunarYear,
          month,
          dayOfMonth,
          isLeap
        );
        if (!solar) continue;
        const day = startOfDay(solar);
        if (day < baseDay) continue;
        if (untilDay && day > untilDay) break;
        if (consider(day) === false) break;
      }
    }

    return results;
  }

  function nextOccurrence(event, from = new Date(), horizonDays = 366) {
    const rangeStart = from instanceof Date ? from : new Date(from);
    const rangeEnd = addDays(startOfDay(rangeStart), Math.max(1, horizonDays));
    return expand(event, rangeStart, rangeEnd)[0] || null;
  }

  function weekdayLabel(weekdays) {
    if (!Array.isArray(weekdays) || weekdays.length === 0) return '';
    if (weekdays.length === 7) return '每天';
    return weekdays.map((day) => `周${WEEKDAY_NAMES[day]}`).join('、');
  }

  function summary(recurrence) {
    const rec = normalize(recurrence);
    if (!rec) return '不重复';
    let text;
    if (rec.freq === 'daily') {
      text = rec.interval === 1 ? '每天' : `每 ${rec.interval} 天`;
    } else if (rec.freq === 'weekly') {
      const days = rec.weekdays.length ? rec.weekdays : [];
      if (
        rec.interval === 1 &&
        days.length === 5 &&
        days.every((day, index) => day === index + 1)
      ) {
        text = '每个工作日';
      } else {
        const prefix = rec.interval === 1 ? '每周' : `每 ${rec.interval} 周`;
        text = `${prefix}${days.length ? weekdayLabel(days) : ''}`;
      }
    } else if (rec.freq === 'monthly') {
      text = rec.interval === 1 ? '每月' : `每 ${rec.interval} 个月`;
    } else if (rec.freq === 'lunar-yearly') {
      text = `每年农历${rec.lunarMonth}月${rec.lunarDay}日`;
    } else {
      text = rec.interval === 1 ? '每年' : `每 ${rec.interval} 年`;
    }
    if (rec.until) {
      const until = parseYmd(rec.until);
      if (until) text += ` · 至 ${until.getFullYear()}年${until.getMonth() + 1}月${until.getDate()}日`;
    }
    return text;
  }

  window.Recurrence = {
    FREQUENCIES,
    normalize,
    isRecurring,
    expand,
    nextOccurrence,
    summary,
    weekdayLabel,
    parseYmd,
    ymd,
  };
})();
