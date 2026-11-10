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

const entries = Array.from(document.querySelectorAll('.external-entry'), element => ({
  element,
  type: element.dataset.type,
  name: element.querySelector('h3').textContent,
  date: element.querySelector('time')?.dateTime || '',
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
controls.hidden = false;
updateResults();
