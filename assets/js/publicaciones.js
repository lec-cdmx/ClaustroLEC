import { fold, loadCatalog, readDirectory } from './datos-investigacion.js';
import { searchableFilter } from './searchable-filter.js?v=2';

const form = document.querySelector('#publication-filters');
const search = document.querySelector('#publication-search');
const profileInput = document.querySelector('#publication-profile');
const yearFilter = document.querySelector('#publication-year');
const clear = document.querySelector('#publication-clear');
const status = document.querySelector('#publication-status');
const list = document.querySelector('#publication-list');
const more = document.querySelector('#publication-more');
const retry = document.querySelector('#publication-retry');
const collator = new Intl.Collator('es', { sensitivity: 'base' });
const pageSize = 12;
let entries = [];
let profileOptions = [];
let matches = [];
let shown = 0;
let loaded = false;
let loading = false;

function queryWords(value) {
  return fold(value).trim().split(/\s+/u).filter(Boolean);
}

const profileFilter = searchableFilter(profileInput, () => profileOptions, {
  allLabel: 'Todos los perfiles',
  queryWords,
  onChange: applyFilters,
});

function indexCatalog(catalog, profiles) {
  const records = new Map();
  for (const profile of profiles) {
    for (const work of catalog[profile.id]?.works ?? []) {
      const title = fold(work.title).trim();
      const key = work.url ? work.url + '\n' + title : profile.id + '\n' + title + '\n' + work.year;
      const record = records.get(key) ?? { ...work, profiles: [] };
      if (!record.profiles.includes(profile)) record.profiles.push(profile);
      record.fullText ||= work.fullText;
      record.workingPaper ||= work.workingPaper;
      records.set(key, record);
    }
  }
  return [...records.values()].map(work => ({
    ...work,
    searchText: fold([work.title, work.kind, work.venue, work.abstract, work.year,
      ...work.profiles.map(profile => profile.name)].join(' ')),
  })).sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || collator.compare(a.title, b.title));
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function sourceLink(label, url) {
  const link = element('a', label);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function renderWork(work) {
  const row = element('li', '', 'publication-row');
  const meta = element('p', [work.year ?? 'Sin fecha', work.kind, work.venue].filter(Boolean).join(' · '), 'publication-meta');
  const title = element('h3');
  title.lang = work.titleLang ?? work.lang;
  if (work.url) {
    const link = sourceLink(work.title, work.url);
    const arrow = element('span', '↗', 'publication-source-icon');
    arrow.setAttribute('aria-hidden', 'true');
    link.append(' ', arrow);
    title.append(link);
  } else {
    title.textContent = work.title;
  }

  const names = element('p', '', 'publication-profiles');
  names.append(work.profiles.length === 1 ? 'Perfil LEC · ' : 'Perfiles LEC · ');
  for (const [index, profile] of work.profiles.entries()) {
    const link = element('a', profile.name);
    link.href = 'directorio.html#' + encodeURIComponent(profile.id);
    if (index > 0) names.append(' · ');
    names.append(link);
  }
  row.append(meta, title, names);

  const actions = element('div', '', 'publication-actions');
  if (work.fullText && work.fullText !== work.url) actions.append(sourceLink('Texto completo', work.fullText));
  if (work.workingPaper && work.workingPaper !== work.url) actions.append(sourceLink('Versión de trabajo', work.workingPaper));
  if (work.abstract) {
    const details = element('details');
    const abstract = element('p', work.abstract);
    abstract.lang = work.lang;
    details.append(element('summary', 'Resumen'), abstract);
    actions.append(details);
  }
  if (actions.childElementCount) row.append(actions);
  return row;
}

function appendPage(focusNewResults = false) {
  const rows = matches.slice(shown, shown + pageSize).map(renderWork);
  list.append(...rows);
  shown += rows.length;
  more.hidden = shown >= matches.length;
  const total = matches.length === 1 ? '1 trabajo' : `${matches.length} trabajos`;
  status.textContent = !matches.length ? 'No se encontraron trabajos con esos filtros.'
    : shown < matches.length ? `Mostrando ${shown} de ${total}.` : `${total}.`;
  if (focusNewResults) rows[0]?.querySelector('a')?.focus();
}

function applyFilters() {
  const words = queryWords(search.value);
  const profile = profileFilter.value;
  const year = yearFilter.value;
  matches = entries.filter(work =>
    words.every(word => work.searchText.includes(word)) &&
    (!profile || work.profiles.some(person => person.id === profile)) &&
    (!year || year === String(work.year ?? 'sin-fecha')));
  clear.disabled = !words.length && !profile && !year;
  list.replaceChildren();
  shown = 0;
  appendPage();
}

export async function loadPublications() {
  if (loaded || loading) return;
  loading = true;
  retry.hidden = true;
  status.textContent = 'Cargando publicaciones…';

  try {
    const [catalog, profiles] = await Promise.all([loadCatalog(), readDirectory()]);
    entries = indexCatalog(catalog, profiles);
    const authors = [...new Set(entries.flatMap(work => work.profiles))].sort((a, b) => collator.compare(a.name, b.name));
    const years = [...new Set(entries.map(work => work.year))];
    profileOptions = authors.map(({ id, name }) => [id, name, fold(name)]);
    for (const year of years) yearFilter.add(new Option(year ?? 'Sin fecha', year ?? 'sin-fecha'));
    form.hidden = false;
    applyFilters();
    loaded = true;
  } catch {
    status.textContent = 'No se pudieron cargar las publicaciones.';
    retry.hidden = false;
  } finally {
    loading = false;
  }
}

form.addEventListener('submit', event => event.preventDefault());
form.addEventListener('input', applyFilters);
clear.addEventListener('click', () => {
  form.reset();
  profileFilter.reset();
  applyFilters();
  search.focus();
});
more.addEventListener('click', () => appendPage(true));
retry.addEventListener('click', loadPublications);
