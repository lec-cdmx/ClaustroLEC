// Compact the display only. Source sessions remain untouched in programacion.json.
const tokens = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];
const daySet = value => {
  if (!value || value.replace(/Lu|Ma|Mi|Ju|Vi|Sa|Do|-/g, '')) return null;
  const found = tokens.filter(token => value.includes(token));
  return found.length ? found : null;
};
const keyOf = (session, fields) => JSON.stringify(fields.map(field => session[field]));
const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value ?? '');
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && Number.isFinite(Date.parse(value));

function groupBy(sessions, fields) {
  const groups = new Map();
  for (const session of sessions) {
    const key = keyOf(session, fields);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(session);
  }
  return [...groups.values()];
}

export function summarizeSessions(sessions) {
  const eligible = [], unchanged = [];
  for (const original of sessions) {
    const session = { ...original };
    const days = daySet(session.days);
    if (!days || !validDate(session.start) || !validDate(session.end)
        || !validTime(session.startTime) || !validTime(session.endTime)
        || session.startTime >= session.endTime || session.start > session.end) {
      unchanged.push(session);
    } else {
      session.days = days.join('-');
      eligible.push(session);
    }
  }
  // Same dates, room, hours and participation: unite the weekdays.
  const byDays = groupBy(eligible, ['start', 'end', 'startTime', 'endTime', 'room', 'participation']).map(group => ({
    ...group[0], days: tokens.filter(token => group.some(s => daySet(s.days).includes(token))).join('-'),
  }));
  // Same dates and weekdays: unite touching/overlapping teaching time intervals.
  const byTime = [];
  for (const group of groupBy(byDays, ['start', 'end', 'days', 'room', 'participation'])) {
    group.sort((a, b) => a.startTime.localeCompare(b.startTime));
    let last;
    for (const session of group) {
      if (last && session.startTime <= last.endTime) {
        if (session.endTime > last.endTime) last.endTime = session.endTime;
      } else {
        last = { ...session };
        byTime.push(last);
      }
    }
  }
  // Same weekly pattern: unite adjacent/overlapping date ranges, never bridge gaps.
  const result = [];
  for (const group of groupBy(byTime, ['days', 'startTime', 'endTime', 'room', 'participation'])) {
    group.sort((a, b) => a.start.localeCompare(b.start));
    let last;
    for (const session of group) {
      if (last && Date.parse(session.start) <= Date.parse(last.end) + 86400000) {
        if (session.end > last.end) last.end = session.end;
      } else {
        last = { ...session };
        result.push(last);
      }
    }
  }
  return [...result, ...unchanged].sort((a, b) =>
    (a.start ?? '').localeCompare(b.start ?? '') || (a.startTime ?? '').localeCompare(b.startTime ?? '')
    || (a.days ?? '').localeCompare(b.days ?? ''));
}
