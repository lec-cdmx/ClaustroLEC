const controls = document.querySelector('#opportunity-controls');
const search = document.querySelector('#opportunity-search');
const sort = document.querySelector('#opportunity-sort');
const types = document.querySelector('#opportunity-types');
const list = document.querySelector('.external-list');
const resultCount = document.querySelector('#opportunity-count');
const empty = document.querySelector('#opportunity-empty');

function fold(text) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es');
}

function labels(container, selector) {
  return [...container.querySelectorAll(selector)].map(node => node.textContent.trim());
}

const entries = Array.from(document.querySelectorAll('.external-entry'), element => ({
  element,
  id: element.querySelector('h3').id,
  type: element.dataset.type,
  name: element.querySelector('h3').textContent,
  date: element.querySelector('time')?.dateTime || '',
  topics: labels(element, '.opportunity-topics li'),
  text: fold([element.dataset.type, element.dataset.keywords, element.textContent].join(' ')),
}));

const categories = [...new Set(entries.map(entry => entry.type))].sort((a, b) => a.localeCompare(b, 'es'));
let activeType = '';

const filters = ['', ...categories].map(type => {
  const button = document.createElement('button');
  const badge = document.createElement('span');
  button.type = 'button';
  button.append(type || 'Todas', ' ', badge);
  badge.className = 'opportunity-badge';
  button.addEventListener('click', () => {
    activeType = type;
    updateResults();
  });
  types.append(button);
  return { type, button, badge };
});

function updateResults() {
  const words = fold(search.value).trim().split(/\s+/u).filter(Boolean);
  const counts = new Map();
  let queryMatches = 0;
  let visible = 0;

  for (const entry of entries) {
    const matches = words.every(word => entry.text.includes(word));
    const show = matches && (!activeType || entry.type === activeType);
    if (matches) {
      counts.set(entry.type, (counts.get(entry.type) || 0) + 1);
      queryMatches++;
    }
    entry.element.hidden = !show;
    visible += Number(show);
  }

  for (const { type, button, badge } of filters) {
    button.setAttribute('aria-pressed', String(type === activeType));
    badge.textContent = type ? (counts.get(type) || 0) : queryMatches;
  }
  resultCount.textContent = visible + ' de ' + entries.length + ' oportunidades';
  empty.hidden = visible > 0;
}

search.addEventListener('input', updateResults);
const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
const byName = (a, b) => collator.compare(a.name, b.name);
const sorters = {
  type: (a, b) => collator.compare(a.type, b.type) || byName(a, b),
  name: byName,
  date: (a, b) => b.date.localeCompare(a.date) || byName(a, b),
};

sort.addEventListener('change', () => {
  const compare = sorters[sort.value];
  const ordered = compare ? [...entries].sort(compare) : entries;
  list.append(...ordered.map(entry => entry.element));
});

const dialog = document.querySelector('#opportunity-match');
const openMatch = document.querySelector('#opportunity-match-open');
const matchForm = document.querySelector('#opportunity-match-form');
const opportunity = document.querySelector('#opportunity-match-select');
const submitMatch = matchForm.querySelector('button');
const matchSummary = document.querySelector('#opportunity-match-summary');
const matchName = document.querySelector('#opportunity-match-name');
const matchMode = document.querySelector('#opportunity-match-mode');
const matchTopics = document.querySelector('#opportunity-match-topics');
const matchNote = document.querySelector('#opportunity-match-note');
const matchSource = document.querySelector('#opportunity-match-source');
const matchStatus = document.querySelector('#opportunity-match-status');
const matchResults = document.querySelector('#opportunity-match-results');
const matchActions = document.querySelector('#opportunity-match-actions');
const matchEmail = document.querySelector('#opportunity-match-email');
const opportunitiesById = new Map(entries.map(entry => [entry.id, entry]));
let directoryRequest;

function readDirectory() {
  directoryRequest ??= fetch('directorio.html')
    .then(response => {
      if (!response.ok) throw new Error('Directorio no disponible');
      return response.text();
    })
    .then(html => {
      const directory = new DOMParser().parseFromString(html, 'text/html');
      return [...directory.querySelectorAll('.faculty-profile')].map(profile => {
        const heading = profile.querySelector('h2');
        const emailLink = profile.querySelector('.faculty-contact a[href^="mailto:"]');
        return {
          id: heading.id,
          name: heading.textContent.trim(),
          campus: profile.querySelector('.faculty-campus').textContent.trim(),
          email: emailLink?.getAttribute('href').slice(7).split('?')[0] || '',
          topics: new Set(labels(profile, '.faculty-keywords li').map(fold)),
        };
      });
    })
    .catch(error => {
      directoryRequest = undefined;
      throw error;
    });
  return directoryRequest;
}

function topicChip(topic) {
  const item = document.createElement('li');
  item.textContent = topic;
  return item;
}

function renderProfile(profile) {
  const item = document.createElement('li');
  const recipient = document.createElement('div');
  recipient.className = 'opportunity-match-recipient';
  if (profile.email) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = profile.email;
    checkbox.checked = true;
    checkbox.setAttribute('aria-label', 'Incluir a ' + profile.name + ' en el correo');
    recipient.append(checkbox);
  }
  const link = document.createElement('a');
  link.href = 'directorio.html#' + encodeURIComponent(profile.id);
  link.textContent = profile.name;
  recipient.append(link);
  const campus = document.createElement('p');
  campus.textContent = profile.campus;
  const topics = document.createElement('ul');
  topics.className = 'opportunity-topics';
  topics.setAttribute('role', 'list');
  topics.setAttribute('aria-label', 'Temas en común');
  topics.append(...profile.shared.map(topicChip));
  item.append(recipient, campus, topics);
  return item;
}

function updateMatchEmail() {
  const selected = [...matchResults.querySelectorAll('input:checked')];
  const recipients = [...new Set(selected.map(checkbox => checkbox.value))];
  matchEmail.hidden = !recipients.length;
  if (!recipients.length) {
    matchEmail.removeAttribute('href');
    return;
  }

  const entry = opportunitiesById.get(opportunity.value);
  const selectedTopics = new Set(selected.flatMap(checkbox => labels(checkbox.closest('li'), '.opportunity-topics li')));
  const shared = entry.topics.filter(topic => selectedTopics.has(topic));
  const subject = 'Claustro LEC · ' + entry.name;
  const body = ['Hola,', '', 'Vi esta oportunidad en el portal del Claustro LEC.',
    matchSource.href, '', 'Temas en común: ' + shared.join(', ') + '.',
    '', '¿Les gustaría conversar sobre esta oportunidad?', '', 'Saludos,'].join('\r\n');
  const addresses = recipients.map(email => encodeURIComponent(email).replace('%40', '@'));
  matchEmail.href = 'mailto:' + addresses.join(',') + '?subject=' + encodeURIComponent(subject) +
    '&body=' + encodeURIComponent(body);
  matchEmail.textContent = 'Redactar correo (' + recipients.length + ') ↗';
}

function selectAllRecipients(checked) {
  for (const checkbox of matchResults.querySelectorAll('input[type="checkbox"]')) checkbox.checked = checked;
  updateMatchEmail();
}

function clearMatches() {
  matchResults.replaceChildren();
  matchStatus.textContent = '';
  for (const chip of matchTopics.children) chip.classList.remove('is-shared');
  matchActions.hidden = true;
  updateMatchEmail();
}

function showSelection() {
  clearMatches();
  const entry = opportunitiesById.get(opportunity.value);
  matchSummary.hidden = !entry;
  if (!entry) return;

  const mode = entry.element.querySelector('.external-mode');
  const status = entry.element.querySelector('.external-status');
  matchName.textContent = entry.name;
  matchMode.textContent = mode.textContent + ' · ' + status.textContent;
  matchTopics.replaceChildren(...entry.topics.map(topicChip));
  matchNote.textContent = mode.dataset.note;
  matchSource.href = entry.element.querySelector('.external-link').href;
}

for (const entry of [...entries].sort(byName)) {
  opportunity.add(new Option(entry.name, entry.id));
}

openMatch.addEventListener('click', () => dialog.showModal());
document.querySelector('#opportunity-match-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => openMatch.focus({ preventScroll: true }));
opportunity.addEventListener('change', showSelection);
matchResults.addEventListener('change', updateMatchEmail);
document.querySelector('#opportunity-match-select-all').addEventListener('click', () => selectAllRecipients(true));
document.querySelector('#opportunity-match-clear-all').addEventListener('click', () => selectAllRecipients(false));
matchForm.addEventListener('submit', async event => {
  event.preventDefault();
  const entry = opportunitiesById.get(opportunity.value);
  if (!entry) return;

  clearMatches();
  matchStatus.textContent = 'Buscando en el directorio…';
  opportunity.disabled = submitMatch.disabled = true;
  try {
    const profiles = await readDirectory();
    const matches = profiles
      .map(profile => ({ ...profile, shared: entry.topics.filter(topic => profile.topics.has(fold(topic))) }))
      .filter(profile => profile.shared.length)
      .sort((a, b) => b.shared.length - a.shared.length || byName(a, b));

    matchResults.replaceChildren(...matches.map(renderProfile));
    matchStatus.textContent = matches.length === 0 ? 'No hay perfiles con estos temas en el directorio.'
      : matches.length === 1 ? '1 colega con temas en común' : matches.length + ' colegas con temas en común';

    const shared = entry.topics.filter(topic => matches.some(profile => profile.shared.includes(topic)));
    for (const chip of matchTopics.children) chip.classList.toggle('is-shared', shared.includes(chip.textContent));
    matchActions.hidden = !matches.some(profile => profile.email);
    updateMatchEmail();
  } catch {
    matchStatus.textContent = location.protocol === 'file:'
      ? 'Para cruzar los temas en local, abre el portal desde un servidor web.'
      : 'El directorio no está disponible. Intenta de nuevo.';
  } finally {
    opportunity.disabled = submitMatch.disabled = false;
  }
});

showSelection();
controls.hidden = false;
updateResults();
