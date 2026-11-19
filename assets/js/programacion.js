import { summarizeSessions } from './sesiones.mjs?v=1';

const form = document.querySelector('#schedule-search');
const input = document.querySelector('#payroll');
const submit = form.querySelector('button');
const status = document.querySelector('#lookup-status');
const results = document.querySelector('#schedule-results');
let dataset;
let requestId = 0;

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const number = value => value === null || value === undefined ? 'No indicado' : new Intl.NumberFormat('es-MX').format(value);
const percentage = value => value === null || value === undefined ? 'No indicada' : `${number(value)} %`;
const unique = values => [...new Set(values)];
const dateFormat = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const date = value => value ? dateFormat.format(new Date(`${value}T00:00:00Z`)) : 'No indicada';
const dateRange = session => `${date(session.start)} al ${date(session.end)}`;

function days(value) {
  if (!value || /^-+$/.test(value)) return 'Sin días asignados';
  const labels = { Lu: 'Lunes', Ma: 'Martes', Mi: 'Miércoles', Ju: 'Jueves', Vi: 'Viernes', Sa: 'Sábado', Do: 'Domingo' };
  const tokens = value.match(/Lu|Ma|Mi|Ju|Vi|Sa|Do/g);
  // Preserve any unfamiliar notation rather than guessing its meaning.
  return tokens && value.replace(/Lu|Ma|Mi|Ju|Vi|Sa|Do|-/g, '') === ''
    ? tokens.map(token => labels[token]).join(', ') : value;
}

function participation(person) {
  return unique(person.sessions.map(s => s.participation)).map(percentage).join(' / ');
}

function courseCard(group, payroll) {
  const teacher = group.assignments.find(p => p.payroll === payroll);
  const starts = teacher.sessions.map(s => s.start).filter(Boolean).sort();
  const ends = teacher.sessions.map(s => s.end).filter(Boolean).sort();
  const details = [
    ['Clave de UF', group.key], ['Grupo', group.group],
    ['Periodos', group.periods || 'No indicados'], ['Créditos de la UF', number(group.credits)],
    ['CRN', group.crn], ['Tu participación', participation(teacher)],
    ['Fecha de inicio', date(starts[0])], ['Fecha final', date(ends.at(-1))],
  ];
  const sessionRows = rows => rows.map(s => `<tr>
    <td>${escapeHTML(days(s.days))}</td>
    <td>${escapeHTML(s.startTime || s.endTime ? `${s.startTime || '—'}–${s.endTime || '—'}` : 'Sin horario asignado')}</td>
    <td>${escapeHTML(s.room || 'No indicado')}</td>
    <td>${escapeHTML(dateRange(s))}</td><td>${escapeHTML(percentage(s.participation))}</td>
  </tr>`).join('');
  const compact = summarizeSessions(teacher.sessions);
  const reduced = compact.length < teacher.sessions.length;
  const table = (rows, caption) => `<div class="schedule-table-wrap"><table class="schedule-table"><caption>${caption}</caption>
    <thead><tr><th scope="col">Días</th><th scope="col">Horario</th><th scope="col">Salón</th><th scope="col">Fechas</th><th scope="col">Participación</th></tr></thead>
    <tbody>${sessionRows(rows)}</tbody></table></div>`;
  const team = [...group.assignments].sort((a, b) => (b.payroll === payroll) - (a.payroll === payroll));
  return `<article class="schedule-card" aria-labelledby="course-${escapeHTML(group.crn)}">
    <div class="schedule-card-header"><div><div class="schedule-badges">
      <span class="schedule-badge ${group.type === 'Bloque' ? 'kind-block' : ''}">${escapeHTML(group.type)}</span>
      <span class="schedule-badge">${escapeHTML(group.language)}</span></div>
      <h3 id="course-${escapeHTML(group.crn)}">${escapeHTML(group.name)}</h3></div></div>
    <dl class="schedule-details">${details.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHTML(value)}</dd></div>`).join('')}</dl>
    ${table(compact, 'Tus sesiones en este grupo')}
    ${reduced ? `<details class="schedule-original"><summary>Ver detalle original (${teacher.sessions.length} filas)</summary>${table(teacher.sessions, 'Sesiones registradas en la programación')}</details>` : ''}
    <div class="schedule-team"><h4>Equipo docente</h4>
      <ul>${team.map(p => `<li${p.payroll === payroll ? ' class="is-current"' : ''}><span>${escapeHTML(p.name)}${p.payroll === payroll ? ' (tú)' : ''}</span><span>${escapeHTML(participation(p))}${unique(p.sessions.map(s => s.participation)).length > 1 ? '<small>Según sesión</small>' : ''}</span></li>`).join('')}</ul></div>
  </article>`;
}

function announce(message, error = false) {
  status.textContent = message;
  status.classList.toggle('is-error', error);
}

input.addEventListener('input', () => {
  requestId += 1;
  input.removeAttribute('aria-invalid');
  results.replaceChildren();
  results.hidden = true;
  announce('');
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const payroll = input.value.trim().toUpperCase();
  input.value = payroll;
  results.replaceChildren();
  results.hidden = true;
  if (!/^L\d{8}$/.test(payroll)) {
    input.setAttribute('aria-invalid', 'true');
    announce('Escribe tu nómina con una L y ocho dígitos, en formato LXXXXXXXX.', true);
    input.focus();
    return;
  }
  const thisRequest = ++requestId;
  submit.disabled = true;
  form.setAttribute('aria-busy', 'true');
  announce('Consultando programación…');
  try {
    if (!dataset) {
      const response = await fetch('assets/data/programacion.json?v=20261111');
      if (!response.ok) throw new Error('No fue posible cargar la programación.');
      const loaded = await response.json();
      if (!Array.isArray(loaded.groups) || !loaded.cutoff || !Array.isArray(loaded.terms)) throw new Error('Datos de programación no disponibles.');
      dataset = loaded;
    }
    if (thisRequest !== requestId) return;
    const groups = dataset.groups.filter(g => g.assignments.some(p => p.payroll === payroll));
    if (!groups.length) {
      announce(`No encontramos programación para ${payroll} en el periodo ${dataset.terms.join(', ')}. Revisa tu nómina o consulta con la coordinación académica.`);
      return;
    }
    const teacher = groups[0].assignments.find(p => p.payroll === payroll);
    results.innerHTML = `<div class="schedule-summary"><div><h2>${escapeHTML(teacher.name)}</h2><p>${escapeHTML(payroll)} · Periodo ${escapeHTML(dataset.terms.join(', '))} · Corte: ${escapeHTML(date(dataset.cutoff))}</p></div>
      <span class="schedule-count">${groups.length} ${groups.length === 1 ? 'grupo programado' : 'grupos programados'}</span></div>
      <div class="schedule-grid">${groups.map(g => courseCard(g, payroll)).join('')}</div>
      <p class="source-note">Los créditos y porcentajes se muestran tal como están registrados, incluidos los valores en cero. Los porcentajes repetidos entre sesiones no se suman.</p>`;
    results.hidden = false;
    announce(`Se encontraron ${groups.length} ${groups.length === 1 ? 'grupo' : 'grupos'} para ${teacher.name}.`);
  } catch {
    if (thisRequest !== requestId) return;
    announce('No pudimos cargar la programación. Revisa tu conexión e intenta de nuevo.', true);
  } finally {
    submit.disabled = false;
    form.removeAttribute('aria-busy');
  }
});
