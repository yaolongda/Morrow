'use strict';

/**
 * iCalendar (.ics) 读写。完全本地，不联网。
 * 只处理常见的 VEVENT / DTSTART / DTEND / SUMMARY / LOCATION / DESCRIPTION / RRULE。
 */

(function () {
  const pad = (value) => String(value).padStart(2, '0');
  const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const CODE_TO_DAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  function ymd(date) {
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  }

  function localYmd(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function localStamp(date) {
    return `${ymd(date)}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(
      date.getSeconds()
    )}`;
  }

  function utcStamp(date = new Date()) {
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(
      date.getUTCDate()
    )}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(
      date.getUTCSeconds()
    )}Z`;
  }

  function parseDateTime(value) {
    const raw = String(value || '').trim();
    if (/^\d{8}$/.test(raw)) {
      return {
        date: new Date(Number(raw.slice(0, 4)), Number(raw.slice(4, 6)) - 1, Number(raw.slice(6, 8))),
        allDay: true,
      };
    }
    const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/i.exec(raw);
    if (!match) return null;
    const [, year, month, day, hour, minute, second, zulu] = match;
    const values = [
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ];
    const date = zulu
      ? new Date(Date.UTC(values[0], values[1], values[2], values[3], values[4], values[5]))
      : new Date(...values);
    return { date, allDay: false };
  }

  function formatForIcs(date, allDay) {
    return allDay ? ymd(date) : localStamp(date);
  }

  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function escapeText(value) {
    return String(value ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  function unescapeText(value) {
    return String(value ?? '')
      .replace(/\\n/gi, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  }

  function foldLine(line) {
    if (line.length <= 72) return line;
    const chunks = [];
    let index = 0;
    let size = 73;
    while (index < line.length) {
      chunks.push(line.slice(index, index + size));
      index += size;
      size = 72;
    }
    return chunks.join('\r\n ');
  }

  function buildRrule(recurrence) {
    if (!recurrence) return null;
    const freq = {
      daily: 'DAILY',
      weekly: 'WEEKLY',
      monthly: 'MONTHLY',
      yearly: 'YEARLY',
    }[recurrence.freq];
    if (!freq) return null;
    const parts = [`FREQ=${freq}`];
    if (Number(recurrence.interval) > 1) parts.push(`INTERVAL=${recurrence.interval}`);
    if (recurrence.freq === 'weekly' && Array.isArray(recurrence.weekdays) && recurrence.weekdays.length) {
      parts.push(`BYDAY=${recurrence.weekdays.map((day) => WEEKDAY_CODES[day]).join(',')}`);
    }
    if (recurrence.until) {
      parts.push(`UNTIL=${String(recurrence.until).replace(/-/g, '')}`);
    }
    return parts.join(';');
  }

  function buildEvent(event) {
    const start = parseLocal(event.start);
    const end = parseLocal(event.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
    const allDay = event.allDay === true;
    const uid = `${event.uid || event.id || 'event'}${
      event.occurrenceDate ? `-${event.occurrenceDate}` : ''
    }@morrow`;
    const lines = [
      'BEGIN:VEVENT',
      `UID:${escapeText(uid)}`,
      `DTSTAMP:${utcStamp()}`,
      `DTSTART${allDay ? ';VALUE=DATE' : ''}:${formatForIcs(start, allDay)}`,
    ];
    if (allDay) {
      lines.push(`DTEND;VALUE=DATE:${ymd(addDays(end, 1))}`);
    } else {
      lines.push(`DTEND:${formatForIcs(end, false)}`);
    }
    lines.push(`SUMMARY:${escapeText(event.title || '未命名日程')}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.notes) lines.push(`DESCRIPTION:${escapeText(event.notes)}`);
    if (event.recurrence && !event.occurrenceDate) {
      const rrule = buildRrule(event.recurrence);
      if (rrule) lines.push(`RRULE:${rrule}`);
      const exceptions = event.recurrence.exceptions || [];
      if (exceptions.length) {
        const values = exceptions.map((date) => {
          const [year, month, day] = String(date).split('-').map(Number);
          const dateValue = new Date(year, month - 1, day, start.getHours(), start.getMinutes());
          return formatForIcs(dateValue, allDay);
        });
        lines.push(`EXDATE${allDay ? ';VALUE=DATE' : ''}:${values.join(',')}`);
      }
    }
    lines.push('END:VEVENT');
    return lines;
  }

  function build(events, options = {}) {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Morrow//Calendar//ZH',
      'CALSCALE:GREGORIAN',
    ];
    for (const event of Array.isArray(events) ? events : []) {
      lines.push(...buildEvent(event));
    }
    lines.push('END:VCALENDAR');
    return lines.map(foldLine).join('\r\n') + '\r\n';
  }

  function parseRrule(value) {
    const result = {};
    for (const part of String(value || '').split(';')) {
      const [key, raw] = part.split('=');
      if (!key) continue;
      result[key.toUpperCase()] = raw;
    }
    const freq = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }[
      String(result.FREQ || '').toUpperCase()
    ];
    if (!freq) return null;
    const interval = Math.max(1, Math.min(99, Number(result.INTERVAL) || 1));
    let weekdays = [];
    if (freq === 'weekly' && result.BYDAY) {
      weekdays = result.BYDAY.split(',')
        .map((code) => CODE_TO_DAY[code.replace(/^[+-]?\d+/, '').toUpperCase()])
        .filter((day) => Number.isInteger(day));
    }
    let until = null;
    if (result.UNTIL) {
      const parsed = parseDateTime(result.UNTIL);
      if (parsed) until = localYmd(parsed.date);
    }
    return { freq, interval, weekdays, until, exceptions: [] };
  }

  function parse(text) {
    const events = [];
    const lines = String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n');
    const unfolded = [];
    for (const line of lines) {
      if (/^[ \t]/.test(line) && unfolded.length) {
        unfolded[unfolded.length - 1] += line.slice(1);
      } else {
        unfolded.push(line);
      }
    }

    let current = null;
    let inEvent = false;
    for (const line of unfolded) {
      const trimmed = line.trim();
      if (trimmed === 'BEGIN:VEVENT') {
        current = {};
        inEvent = true;
        continue;
      }
      if (trimmed === 'END:VEVENT') {
        if (current) {
          const event = finalizeEvent(current);
          if (event) events.push(event);
        }
        current = null;
        inEvent = false;
        continue;
      }
      if (!inEvent || !current) continue;
      const colon = trimmed.indexOf(':');
      if (colon === -1) continue;
      const left = trimmed.slice(0, colon);
      const value = trimmed.slice(colon + 1);
      const [name, ...params] = left.split(';');
      const key = name.toUpperCase();
      const paramText = params.join(';').toUpperCase();
      if (key === 'DTSTART') {
        current.start = parseDateTime(value);
      } else if (key === 'DTEND') {
        current.end = parseDateTime(value);
      } else if (key === 'SUMMARY') {
        current.title = unescapeText(value);
      } else if (key === 'LOCATION') {
        current.location = unescapeText(value);
      } else if (key === 'DESCRIPTION') {
        current.notes = unescapeText(value);
      } else if (key === 'UID') {
        current.uid = unescapeText(value);
      } else if (key === 'RRULE') {
        current.recurrence = parseRrule(value);
      } else if (key === 'EXDATE') {
        current.exceptions = String(value)
          .split(',')
          .map((item) => parseDateTime(item)?.date)
          .filter(Boolean)
          .map(localYmd);
      }
    }
    return events;
  }

  function finalizeEvent(raw) {
    if (!raw.start?.date) return null;
    const allDay = raw.start.allDay;
    const start = raw.start.date;
    let end;
    if (raw.end?.date) {
      end = raw.end.date;
      if (allDay) end = addDays(end, -1);
    } else {
      end = allDay ? start : new Date(start.getTime() + 60 * 60000);
    }
    if (end < start) end = start;
    const startText = allDay
      ? `${localYmd(start)}T00:00`
      : `${localYmd(start)}T${pad(start.getHours())}:${pad(start.getMinutes())}`;
    const endText = allDay
      ? `${localYmd(end)}T23:59`
      : `${localYmd(end)}T${pad(end.getHours())}:${pad(end.getMinutes())}`;
    return {
      uid: raw.uid ? String(raw.uid).slice(0, 200) : '',
      title: (raw.title || '导入的日程').slice(0, 200),
      start: startText,
      end: endText,
      allDay,
      location: (raw.location || '').slice(0, 200),
      notes: (raw.notes || '').slice(0, 2000),
      recurrence: raw.recurrence
        ? {
            ...raw.recurrence,
            exceptions: raw.exceptions || [],
          }
        : null,
    };
  }

  function parseLocal(value) {
    if (!value) return new Date(NaN);
    const [datePart, timePart = '00:00'] = String(value).split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);
    return new Date(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0, 0);
  }

  window.Ics = {
    build,
    parse,
    escapeText,
  };
})();
