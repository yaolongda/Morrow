'use strict';

/**
 * 小组件结论引擎。
 * 四个组件不直接读原始数据，而是读取这里生成好的“结论”，
 * 保证同一事实在今日 / 即将到来 / 月历 / 月历与议程中的口径一致。
 */

(function () {
  const MILESTONES = [20, 50, 75, 80, 90, 100];
  const WEEKDAY_SHORT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
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

  function sameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function formatClock(date) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function formatDuration(minutes) {
    const total = Math.max(0, Math.round(minutes));
    if (total < 1) return '不到 1 分钟';
    if (total < 60) return `${total} 分钟`;
    const hours = Math.floor(total / 60);
    const rest = total % 60;
    return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
  }

  function formatRelative(target, now = new Date()) {
    if (!(target instanceof Date) || Number.isNaN(target.getTime())) return '';
    const diff = Math.round((target - now) / 60000);
    if (diff <= 0) return '现在';
    if (diff < 60) return `${diff} 分钟后`;
    if (diff < 24 * 60) return `${Math.round(diff / 60)} 小时后`;
    return `${Math.round(diff / (24 * 60))} 天后`;
  }

  function formatDayTime(target, now = new Date()) {
    if (!(target instanceof Date) || Number.isNaN(target.getTime())) return '';
    const days = Math.round((startOfDay(target) - startOfDay(now)) / 86400000);
    if (days === 0) return `今天 ${formatClock(target)}`;
    if (days === 1) return `明天 ${formatClock(target)}`;
    if (days === -1) return `昨天 ${formatClock(target)}`;
    if (days > 1 && days < 7) return `${WEEKDAY_SHORT[target.getDay()]} ${formatClock(target)}`;
    return `${target.getMonth() + 1}月${target.getDate()}日 ${formatClock(target)}`;
  }

  function formatDayShort(target, now = new Date()) {
    const days = Math.round((startOfDay(target) - startOfDay(now)) / 86400000);
    if (days === 0) return '今天';
    if (days === 1) return '明天';
    if (days === 2) return '后天';
    if (days > 2 && days < 7) return WEEKDAY_SHORT[target.getDay()];
    return `${target.getMonth() + 1}月${target.getDate()}日`;
  }

  function calendarFor(state, event) {
    return (
      (state.calendars || []).find((calendar) => calendar.id === event.calendarId) || {
        id: 'unknown',
        name: '未分类',
        color: '#8E8E93',
        visible: true,
      }
    );
  }

  function isVisible(state, event) {
    return calendarFor(state, event).visible !== false;
  }

  function withOccurrence(event, occurrence) {
    return {
      ...event,
      start: occurrence.start,
      end: occurrence.end,
      occurrenceDate: occurrence.occurrenceDate,
    };
  }

  function occurrencesBetween(state, rangeStart, rangeEnd) {
    const result = [];
    for (const event of state.events || []) {
      if (!isVisible(state, event)) continue;
      for (const occurrence of Recurrence.expand(event, rangeStart, rangeEnd)) {
        result.push(withOccurrence(event, occurrence));
      }
    }
    return result.sort((a, b) => parseLocal(a.start) - parseLocal(b.start));
  }

  function eventsOnDay(state, day) {
    const start = startOfDay(day);
    return occurrencesBetween(state, start, addDays(start, 1));
  }

  function workOptions(state) {
    return {
      schedule: state.settings?.schedule,
      weekStart: state.settings?.weekStart,
      workHours: state.settings?.workHours,
    };
  }

  function mergeIntervals(intervals) {
    const sorted = intervals
      .filter((item) => item.end > item.start)
      .sort((a, b) => a.start - b.start);
    const merged = [];
    for (const interval of sorted) {
      const last = merged[merged.length - 1];
      if (last && interval.start <= last.end) {
        last.end = Math.max(last.end, interval.end);
      } else {
        merged.push({ start: interval.start, end: interval.end });
      }
    }
    return merged;
  }

  function freeTimeToday(state, now, periods, events) {
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 0, 0, 0);
    if (dayEnd <= now) return { minutes: 0, label: '今天的时间已经不多', intervals: [] };

    const busy = [];
    for (const period of periods) {
      const start = Math.max(period.start.getTime(), now.getTime());
      const end = Math.min(period.end.getTime(), dayEnd.getTime());
      if (end > start) busy.push({ start, end });
    }
    for (const event of events) {
      if (event.allDay) continue;
      const start = Math.max(parseLocal(event.start).getTime(), now.getTime());
      const end = Math.min(parseLocal(event.end).getTime(), dayEnd.getTime());
      if (end > start) busy.push({ start, end });
    }

    const merged = mergeIntervals(busy);
    let free = dayEnd.getTime() - now.getTime();
    for (const interval of merged) free -= interval.end - interval.start;
    const minutes = Math.max(0, Math.round(free / 60000));
    const label =
      minutes < 30
        ? '今天几乎没有自己的时间'
        : `今天还有 ${formatDuration(minutes)}自己的时间`;
    return { minutes, label, intervals: merged };
  }

  function gapStats(state, now, periods, events) {
    const timed = events
      .filter((event) => !event.allDay)
      .map((event) => ({ start: parseLocal(event.start), end: parseLocal(event.end) }))
      .sort((a, b) => a.start - b.start);

    if (timed.length === 0) {
      return { fragmented: false, gaps: 0, longestGap: Infinity, shortGaps: 0 };
    }

    const firstPeriod = periods[0];
    const lastPeriod = periods[periods.length - 1];
    const windowStart = firstPeriod ? firstPeriod.start : startOfDay(now);
    const windowEnd = lastPeriod ? lastPeriod.end : addDays(startOfDay(now), 1);

    const gaps = [];
    let cursor = Math.max(windowStart.getTime(), now.getTime());
    for (const item of timed) {
      const start = item.start.getTime();
      if (start > cursor) gaps.push((start - cursor) / 60000);
      cursor = Math.max(cursor, item.end.getTime());
    }
    if (cursor < windowEnd.getTime()) gaps.push((windowEnd.getTime() - cursor) / 60000);

    const positive = gaps.filter((gap) => gap > 0);
    const shortGaps = positive.filter((gap) => gap > 0 && gap < 45).length;
    const longestGap = positive.length ? Math.max(...positive) : 0;
    const fragmented = timed.length >= 3 && shortGaps >= 2;
    return { fragmented, gaps: positive.length, longestGap, shortGaps };
  }

  function shiftEndFor(periods, now) {
    if (!periods.length) return null;
    for (const period of periods) {
      if (period.end > now) return period.end;
    }
    return periods[periods.length - 1].end;
  }

  function nextWorkStart(state, now) {
    const options = workOptions(state);
    for (let offset = 1; offset <= 14; offset += 1) {
      const day = addDays(startOfDay(now), offset);
      if (Schedule.dayType(options.schedule, day, options.weekStart) === 'rest') continue;
      const periods = Workday.periodsForStartDate(day, options);
      if (periods.length) return { date: day, period: periods[0] };
    }
    return null;
  }

  function todayState(state, now = new Date()) {
    const today = startOfDay(now);
    const events = eventsOnDay(state, today);
    const tasks = state.tasks || [];
    const taskTotal = tasks.filter(
      (task) => !task.done && task.due && task.due <= ymd(now)
    ).length;
    const taskDone = tasks.filter(
      (task) => task.done && task.due === ymd(now)
    ).length;

    const options = workOptions(state);
    const enabled = state.settings?.workHours?.enabled !== false;
    const dayType = enabled
      ? Schedule.dayType(options.schedule, today, options.weekStart)
      : 'rest';
    const periods = enabled ? Workday.periodsForStartDate(today, options) : [];
    const yesterdayNight = enabled
      ? Workday.periodsForStartDate(addDays(today, -1), options).filter(
          (period) => sameDay(period.end, today)
        )
      : [];
    const allPeriods = [...yesterdayNight, ...periods];
    const status = enabled ? Workday.statusFor(now, options) : null;
    const endShift = shiftEndFor(periods, now);
    const free = freeTimeToday(state, now, allPeriods, events);
    const gaps = gapStats(state, now, periods, events);

    const timed = events.filter((event) => !event.allDay);
    let nextEvent = timed.find(
      (event) => parseLocal(event.start) > now
    ) || null;
    let ongoing = timed.find(
      (event) => parseLocal(event.start) <= now && parseLocal(event.end) > now
    ) || null;

    let next = null;
    if (ongoing) {
      next = {
        kind: 'event',
        title: ongoing.title,
        at: parseLocal(ongoing.end),
        minutesUntil: Math.round((parseLocal(ongoing.end) - now) / 60000),
        timeLabel: formatClock(parseLocal(ongoing.end)),
        label: '正在进行',
      };
    } else if (nextEvent) {
      next = {
        kind: 'event',
        title: nextEvent.title,
        at: parseLocal(nextEvent.start),
        minutesUntil: Math.round((parseLocal(nextEvent.start) - now) / 60000),
        timeLabel: formatClock(parseLocal(nextEvent.start)),
        label: '接下来',
      };
    } else if (status?.state === 'work' && endShift) {
      next = {
        kind: 'work',
        title: '下班',
        at: endShift,
        minutesUntil: Math.round((endShift - now) / 60000),
        timeLabel: formatClock(endShift),
        label: '接下来',
      };
    } else if (status?.state === 'break') {
      const afternoon = periods.find((period) => period.start > now);
      if (afternoon) {
        next = {
          kind: 'work',
          title: '下午上班',
          at: afternoon.start,
          minutesUntil: Math.round((afternoon.start - now) / 60000),
          timeLabel: formatClock(afternoon.start),
          label: '接下来',
        };
      }
    } else if (status?.state === 'before' && periods[0]) {
      next = {
        kind: 'work',
        title: '上班',
        at: periods[0].start,
        minutesUntil: Math.round((periods[0].start - now) / 60000),
        timeLabel: formatClock(periods[0].start),
        label: '接下来',
      };
    } else {
      const nextWork = nextWorkStart(state, now);
      if (nextWork) {
        next = {
          kind: 'work',
          title: '上班',
          at: nextWork.period.start,
          minutesUntil: Math.round((nextWork.period.start - now) / 60000),
          timeLabel: formatClock(nextWork.period.start),
          label: '下一次',
          dayLabel: formatDayShort(nextWork.period.start, now),
        };
      }
    }

    const shiftEndMinutes = endShift
      ? Math.max(0, Math.round((endShift - now) / 60000))
      : null;
    const nearOff =
      Boolean(status) &&
      status.state === 'work' &&
      shiftEndMinutes !== null &&
      shiftEndMinutes <= 60 &&
      shiftEndMinutes > 0;

    let rhythmState = 'none';
    if (!enabled) rhythmState = 'no-hours';
    else if (dayType === 'rest') rhythmState = 'rest';
    else if (nearOff) rhythmState = 'near-off';
    else if (status?.state === 'before') rhythmState = 'before';
    else if (status?.state === 'break') rhythmState = 'lunch';
    else if (status?.state === 'off') rhythmState = 'off';
    else if (status?.state === 'work') {
      if (status.period?.key === 'morning') rhythmState = 'morning';
      else if (status.period?.key === 'afternoon') rhythmState = 'afternoon';
      else if (status.period?.key === 'night') rhythmState = 'night';
      else rhythmState = 'work';
    }

    let headline = '';
    let detail = '';
    if (rhythmState === 'no-hours') {
      headline = '还没有设置工作时间';
      detail = '在设置里填写上下班时间，这里会显示今天的节奏';
    } else if (rhythmState === 'rest') {
      headline = '今天休息';
      detail = next
        ? `下一次上班 · ${next.dayLabel || formatDayShort(next.at, now)} ${next.timeLabel}`
        : '好好休息，今天不用赶';
    } else if (rhythmState === 'off') {
      headline = '今天已下班';
      detail = next
        ? `下一次上班 · ${next.dayLabel || formatDayShort(next.at, now)} ${next.timeLabel}`
        : '今天的事情到这里就好';
    } else if (status?.detail) {
      headline = status.detail;
      if (status.state === 'before') {
        headline = `距离上班 ${formatDuration((status.next - now) / 60000)}`;
      } else if (status.state === 'break') {
        headline = `午休中 · ${formatDuration((status.next - now) / 60000)}后上班`;
      } else if (status.state === 'work') {
        const isMorning = status.period?.key === 'morning';
        const label = isMorning ? '午休' : '下班';
        headline = nearOff
          ? `${formatDuration(shiftEndMinutes)}后下班`
          : `距离${label} ${formatDuration((status.next - now) / 60000)}`;
      }
    } else {
      headline = '今天没有工作安排';
      detail = '可以按自己的节奏来';
    }

    let suggestion = '';
    if (state.settings?.widgets?.suggestions !== false && enabled) {
      if (dayType === 'rest') suggestion = '今天要不要去做点喜欢的事？';
      else if (events.length === 0) suggestion = '今天没有会议，要不要留一段整块时间？';
      else if (gaps.fragmented) suggestion = '今天安排比较碎，要不要先处理轻量的事？';
      else if (free.minutes >= 120) suggestion = '空档还够，要不要先喘口气？';
      else if (free.minutes < 30) suggestion = '今天比较满，要不要先照顾好自己？';
      else suggestion = '节奏还行，要不要按自己的步子来？';
    }

    const nextLine = !enabled
      ? '在设置里填写上下班时间'
      : next && next.kind === 'event' && next.label === '正在进行'
        ? `正在进行 ${next.title} · ${formatRelative(next.at, now)}后结束`
        : next && next.kind === 'event'
          ? `${next.timeLabel} ${next.title} · ${formatRelative(next.at, now)}`
          : next
            ? `${next.dayLabel ? `${next.dayLabel} ` : ''}${next.timeLabel} ${next.title}`
            : '今天没有下一件事';

    const planNode = (state.plans || []).find((plan) => {
      if (!plan || plan.archived) return false;
      return (plan.reminders || []).some((reminder) => reminder.date === ymd(now));
    });

    return {
      today,
      events,
      timed,
      dayType,
      enabled,
      status,
      periods,
      free,
      gaps,
      next,
      nextLine,
      headline,
      detail,
      suggestion,
      rhythmState,
      nearOff,
      breathing:
        nearOff && state.settings?.widgets?.breathing !== false,
      taskTotal,
      taskDone,
      taskLine: taskTotal + taskDone > 0 ? `任务 ${taskDone}/${taskTotal + taskDone}` : '',
      planNode: planNode
        ? {
            plan: planNode,
            reminder: (planNode.reminders || []).find((reminder) => reminder.date === ymd(now)),
          }
        : null,
      rest: dayType === 'rest',
      half: dayType === 'half',
      holiday: Holidays.info(ymd(now)),
    };
  }

  function planInfo(state, plan, now = new Date()) {
    const start = parseLocal(plan.start);
    const end = parseLocal(plan.end);
    const total = Math.max(1, Math.round((addDays(end, 1) - start) / 86400000));
    const elapsed = clamp(
      (now - start) / (addDays(end, 1) - start),
      0,
      1
    );
    const timeProgress = Math.round(elapsed * 100);
    const completion = plan.autoProgress
      ? timeProgress
      : clamp(Math.round(Number(plan.progress) || 0), 0, 100);
    const crossYear = start.getFullYear() !== end.getFullYear();
    const crossMonth = crossYear || start.getMonth() !== end.getMonth();
    const type = crossYear ? '跨年' : crossMonth ? '跨月' : '跨周';
    const nextMilestone = MILESTONES.find((value) => value > completion) || null;
    const behind = timeProgress - completion >= 15;
    const nextNode = (plan.reminders || [])
      .filter((reminder) => reminder.date >= ymd(now))
      .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
    return {
      plan,
      start,
      end,
      total,
      timeProgress,
      completion,
      behind,
      type,
      nextMilestone,
      nextNode,
      daysLeft: Math.max(0, Math.round((startOfDay(end) - startOfDay(now)) / 86400000)),
    };
  }

  function activePlans(state, now = new Date()) {
    return (state.plans || [])
      .filter((plan) => !plan.archived && plan.end >= ymd(now))
      .map((plan) => planInfo(state, plan, now))
      .filter((info) => info.completion < 100)
      .sort((a, b) => a.plan.end.localeCompare(b.plan.end));
  }

  function conflictFor(state, item, index, all) {
    if (item.allDay) return false;
    const start = parseLocal(item.start);
    const end = parseLocal(item.end);
    return all.some((other, otherIndex) => {
      if (otherIndex === index || other.allDay) return false;
      const otherStart = parseLocal(other.start);
      const otherEnd = parseLocal(other.end);
      return start < otherEnd && end > otherStart;
    });
  }

  function needsPreparation(event) {
    return Boolean(event.location) || Boolean(event.notes);
  }

  function upcoming(state, now = new Date(), limit = 6) {
    const horizon = addDays(startOfDay(now), 30);
    const all = occurrencesBetween(state, now, horizon).filter(
      (event) => parseLocal(event.end) >= now
    );
    const plans = activePlans(state, now);

    const ranked = all.map((event, index) => {
      const start = parseLocal(event.start);
      const end = parseLocal(event.end);
      const conflict = conflictFor(state, event, index, all);
      const prep = needsPreparation(event);
      const minutesUntil = Math.max(0, Math.round((start - now) / 60000));

      let score = 0;
      if (conflict) score += 50;
      if (prep) score += 18;
      if (minutesUntil <= 120) score += 25;
      else if (minutesUntil <= 1440) score += 18;
      else if (minutesUntil <= 4320) score += 10;
      else score += 2;
      if (event.allDay) score += 1;

      let reason = '';
      let reasonKind = '';
      if (conflict) {
        reason = '与另一件事时间重叠';
        reasonKind = 'conflict';
      } else if (prep && minutesUntil <= 1440) {
        reason = '需要提前准备';
        reasonKind = 'prep';
      } else if (minutesUntil <= 120) {
        reason = formatRelative(start, now);
        reasonKind = 'soon';
      } else {
        reason = formatDayShort(start, now);
        reasonKind = 'later';
      }

      return {
        ...event,
        kind: 'event',
        startDate: start,
        endDate: end,
        minutesUntil,
        conflict,
        prep,
        plan: null,
        score,
        reason,
        reasonKind,
      };
    });

    const planItems = [];
    for (const info of plans) {
      const node = (info.plan.reminders || [])
        .filter(
          (reminder) =>
            reminder.date >= ymd(now) && reminder.date <= ymd(addDays(now, 7))
        )
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      let date = '';
      let text = '';
      if (node) {
        date = node.date;
        text = node.text;
      } else if (info.plan.end >= ymd(now) && info.plan.end <= ymd(addDays(now, 7))) {
        date = info.plan.end;
        text = '计划临近截止';
      }
      if (!date) continue;
      const startDate = parseLocal(`${date}T09:00`);
      const minutesUntil = Math.max(0, Math.round((startDate - now) / 60000));
      planItems.push({
        kind: 'plan',
        id: `plan-${info.plan.id}-${date}`,
        title: `计划 · ${info.plan.title}`,
        reason: node ? `节点 · ${text}` : text,
        reasonKind: 'plan',
        startDate,
        endDate: startDate,
        allDay: true,
        minutesUntil,
        conflict: false,
        prep: false,
        plan: info,
        score: 35 + (minutesUntil <= 1440 ? 18 : 10),
      });
    }

    ranked.push(...planItems);
    ranked.sort(
      (a, b) =>
        b.score - a.score ||
        a.startDate - b.startDate ||
        String(a.id).localeCompare(String(b.id))
    );

    return {
      items: ranked.slice(0, limit),
      all: ranked,
      plan: plans[0] || null,
      plans,
    };
  }

  function monthSummary(state, cursor = new Date(), now = new Date()) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const loads = {};
    let busyDays = 0;
    let totalEvents = 0;
    let busiest = null;
    const tasks = state.tasks || [];

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const key = ymd(date);
      const events = eventsOnDay(state, date);
      const taskCount = tasks.filter(
        (task) => !task.done && task.due === key
      ).length;
      const count = events.length + taskCount;
      loads[key] = count;
      if (count > 0) {
        busyDays += 1;
        totalEvents += events.length;
        if (!busiest || count > busiest.count) busiest = { key, date, count };
      }
    }

    const emptyDays = daysInMonth - busyDays;
    let headline = '';
    let tone = 'calm';
    if (busyDays === 0) {
      headline = '这个月还没有安排';
      tone = 'empty';
    } else if (busyDays <= 6) {
      headline = `这个月比较轻，${busyDays} 天有安排`;
      tone = 'light';
    } else if (busyDays <= 15) {
      headline = `这个月 ${busyDays} 天有安排，节奏适中`;
      tone = 'normal';
    } else {
      headline = `这个月比较满，${busyDays} 天有安排`;
      tone = 'busy';
    }
    const detail = busiest
      ? `最忙 ${busiest.date.getMonth() + 1}/${busiest.date.getDate()}（${busiest.count} 件）`
      : `${emptyDays} 天留白`;

    return {
      year,
      month,
      daysInMonth,
      loads,
      busyDays,
      emptyDays,
      totalEvents,
      busiest,
      headline,
      detail,
      tone,
    };
  }

  function agenda(state, date = new Date(), now = new Date()) {
    const events = eventsOnDay(state, date);
    const tasks = (state.tasks || []).filter(
      (task) => !task.done && task.due === ymd(date)
    );
    const timed = events.filter((event) => !event.allDay);
    const first = timed[0] ? parseLocal(timed[0].start) : null;
    const last = timed.length
      ? parseLocal(timed[timed.length - 1].end)
      : null;
    let headline = '';
    if (events.length === 0 && tasks.length === 0) {
      headline = '这一天没有安排';
    } else if (timed.length === 0) {
      headline = `${events.length} 件全天安排${tasks.length ? ` · ${tasks.length} 个任务` : ''}`;
    } else {
      headline = `${events.length} 件事 · ${formatClock(first)}–${formatClock(last)}${
        tasks.length ? ` · ${tasks.length} 个任务` : ''
      }`;
    }
    return {
      date,
      events,
      tasks,
      headline,
      empty: events.length === 0 && tasks.length === 0,
    };
  }

  window.Insight = {
    today: todayState,
    plans: activePlans,
    planInfo,
    upcoming,
    month: monthSummary,
    agenda,
    eventsOnDay,
    formatDuration,
    formatClock,
    formatRelative,
    formatDayTime,
    formatDayShort,
    ymd,
  };
})();
