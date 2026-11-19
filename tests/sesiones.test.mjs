import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { summarizeSessions } from '../assets/js/sesiones.mjs';

const base = { start: '2026-08-10', end: '2026-08-16', days: 'Lu--Mi-Ju--', startTime: '10:00', endTime: '11:30', room: 'Aulas I, 401', participation: 0 };
const session = changes => ({ ...base, ...changes });

test('unites weekdays, touching time slots and consecutive weeks', () => {
  const source = [];
  for (const [start, end] of [['2026-08-10', '2026-08-16'], ['2026-08-17', '2026-08-23']]) {
    for (const days of ['Lu--Mi---', '---Ju--']) {
      for (const [startTime, endTime] of [['10:00', '11:30'], ['11:30', '13:00']]) {
        source.push(session({start, end, days, startTime, endTime}));
      }
    }
  }
  const original = structuredClone(source);
  const result = summarizeSessions(source);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], session({days: 'Lu-Mi-Ju', endTime: '13:00', end: '2026-08-23'}));
  assert.deepEqual(source, original, 'source records must remain unchanged');
});

test('keeps gaps in dates and teaching hours', () => {
  assert.equal(summarizeSessions([session(), session({start: '2026-08-24', end: '2026-08-30'})]).length, 2);
  assert.equal(summarizeSessions([session(), session({startTime: '12:00', endTime: '13:00'})]).length, 2);
});

test('keeps changes to room, participation and weekdays', () => {
  for (const changes of [{room: 'Aulas I, 402'}, {participation: 50}, {days: 'Lu-----'}]) {
    assert.equal(summarizeSessions([session(), session({start: '2026-08-17', end: '2026-08-23', ...changes})]).length, 2);
  }
});

test('preserves missing and unfamiliar schedule information', () => {
  for (const changes of [{startTime: null}, {days: '-----'}, {days: 'Por definir'}, {start: null}, {participation: null}]) {
    const source = session(changes);
    const [result] = summarizeSessions([source]);
    assert.equal(result.participation, source.participation);
    if (changes.days) assert.equal(result.days, source.days);
    assert.equal(result.startTime, source.startTime);
  }
});

// Independent control: expand each weekly pattern to calendar dates, then compare
// the union of actual time intervals for each date, room and percentage.
function calendarCoverage(sessions) {
  const weekdayTokens = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
  const coverage = new Map();
  const unknown = [];
  for (const s of sessions) {
    if (!s.start || !s.end || !s.startTime || !s.endTime || !s.days || /^-+$/.test(s.days)) {
      unknown.push(JSON.stringify(s));
      continue;
    }
    for (let stamp = Date.parse(s.start); stamp <= Date.parse(s.end); stamp += 86400000) {
      const d = new Date(stamp);
      if (!s.days.includes(weekdayTokens[d.getUTCDay()])) continue;
      const key = JSON.stringify([d.toISOString().slice(0, 10), s.room, s.participation]);
      if (!coverage.has(key)) coverage.set(key, []);
      coverage.get(key).push([s.startTime, s.endTime]);
    }
  }
  const normalized = [...coverage].map(([key, intervals]) => {
    const union = [];
    for (const [start, end] of intervals.sort((a, b) => a[0].localeCompare(b[0]))) {
      const last = union.at(-1);
      if (last && start <= last[1]) last[1] = last[1] > end ? last[1] : end;
      else union.push([start, end]);
    }
    return [key, union];
  }).sort((a, b) => a[0].localeCompare(b[0]));
  return {normalized, unknown:unknown.sort()};
}

test('all imported groups retain the exact same calendar coverage', () => {
  const dataset = JSON.parse(readFileSync(new URL('../assets/data/programacion.json', import.meta.url), 'utf8'));
  let before = 0, after = 0;
  for (const group of dataset.groups) {
    for (const teacher of group.assignments) {
      const compact = summarizeSessions(teacher.sessions);
      before += teacher.sessions.length;
      after += compact.length;
      assert.deepEqual(calendarCoverage(compact), calendarCoverage(teacher.sessions), `CRN ${group.crn}, ${teacher.payroll}`);
    }
  }
  assert.ok(after < before);
  console.log(`Resumen: ${before} filas originales → ${after} filas, conservando todas las fechas, horas, salones y porcentajes.`);
});
