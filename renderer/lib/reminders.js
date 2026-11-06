'use strict';

/**
 * 提醒辅助：免打扰判断与稍后提醒合并。
 * 保持纯函数，主窗口和测试都能直接调用。
 */
(function () {
  function parseTime(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  }

  function inQuietHours(now, quiet) {
    if (!quiet || quiet.enabled !== true) return false;
    const start = parseTime(quiet.start);
    const end = parseTime(quiet.end);
    if (start === null || end === null || start === end) return false;
    const minutes = now.getHours() * 60 + now.getMinutes();
    return start < end
      ? minutes >= start && minutes < end
      : minutes >= start || minutes < end;
  }

  function applySnoozes(list, snoozes) {
    const entries = (Array.isArray(snoozes) ? snoozes : []).filter(
      (item) => item && item.key && item.sourceKey && item.at
    );
    if (entries.length === 0) return list;
    const snoozedSources = new Set(entries.map((item) => item.sourceKey));
    const result = list.filter((item) => !snoozedSources.has(item.key));
    for (const entry of entries) {
      if (!result.some((item) => item.key === entry.key)) {
        result.push({ ...entry, snoozed: true });
      }
    }
    return result.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }

  function applyQuiet(list, quiet, now = new Date()) {
    if (!inQuietHours(now, quiet)) return list;
    return list.map((item) => ({ ...item, quiet: true, system: false }));
  }

  window.Reminders = { parseTime, inQuietHours, applySnoozes, applyQuiet };
})();
