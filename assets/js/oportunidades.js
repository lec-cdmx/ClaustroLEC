const controls = document.querySelector('#opportunity-controls');
const search = document.querySelector('#opportunity-search');
const types = document.querySelector('#opportunity-types');
const resultCount = document.querySelector('#opportunity-count');
const empty = document.querySelector('#opportunity-empty');

function fold(text) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es');
}

const entries = Array.from(document.querySelectorAll('.external-entry'), element => ({
  element,
  type: element.dataset.type,
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
controls.hidden = false;
updateResults();
