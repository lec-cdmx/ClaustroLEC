import { searchableFilter } from './searchable-filter.js';

const form = document.querySelector('#directory-filters');
const search = document.querySelector('#directory-search');
const campus = document.querySelector('#directory-campus');
const courseInput = document.querySelector('#directory-course');
const keywordInput = document.querySelector('#directory-keyword');
const count = document.querySelector('#directory-count');
const clear = document.querySelector('#directory-clear');
const empty = document.querySelector('#directory-empty');

function fold(value) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es');
}

function queryWords(value) {
  return fold(value).trim().split(/\s+/u).filter(Boolean);
}

function collectLabels(profile, selector) {
  return Array.from(profile.querySelectorAll(selector), element => element.textContent.trim());
}

const profiles = Array.from(document.querySelectorAll('.faculty-profile'), element => ({
  element,
  searchText: fold(element.textContent),
  campus: collectLabels(element, '.faculty-campus'),
  course: collectLabels(element, '.faculty-courses li'),
  keyword: collectLabels(element, '.faculty-keywords li'),
}));

function filterOptions(field) {
  const labels = new Map();
  for (const profile of profiles) {
    for (const label of profile[field]) labels.set(fold(label), label);
  }
  return [...labels.entries()].sort(([, a], [, b]) => a.localeCompare(b, 'es'));
}

function setHighlights(profile, pattern) {
  for (const mark of profile.querySelectorAll('mark.directory-match')) {
    const parent = mark.parentNode;
    mark.replaceWith(mark.textContent);
    parent.normalize();
  }
  if (!pattern) return;

  const walker = document.createTreeWalker(profile, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    const original = node.data;
    const normalized = fold(original);
    const matches = [...normalized.matchAll(pattern)];
    if (matches.length === 0) continue;

    // Keep accents and combining marks from the original in each highlighted span.
    const offsets = [0];
    for (const segment of original.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
      const end = segment.index + segment[0].length;
      for (let i = 0; i < fold(segment[0]).length; i++) offsets.push(end);
    }

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const match of matches) {
      const start = offsets[match.index];
      const end = offsets[match.index + match[0].length];
      fragment.append(original.slice(cursor, start));
      const mark = document.createElement('mark');
      mark.className = 'directory-match';
      mark.textContent = original.slice(start, end);
      fragment.append(mark);
      cursor = end;
    }
    fragment.append(original.slice(cursor));
    node.replaceWith(fragment);
  }
}

const course = searchableFilter(courseInput, () => filterOptions('course'), { allLabel: 'Todas las UF', queryWords, onChange: applyFilters });
const keyword = searchableFilter(keywordInput, () => filterOptions('keyword'), { allLabel: 'Todas las palabras clave', queryWords, onChange: applyFilters });
let lastQuery = '';

function applyFilters() {
  const words = queryWords(search.value);
  const query = words.join(' ');
  const queryChanged = query !== lastQuery;
  const filters = Object.entries({ campus: campus.value, course: course.value, keyword: keyword.value })
    .filter(([, value]) => value);
  let pattern;
  let matches = 0;

  if (queryChanged && words.length) {
    const terms = [...new Set(words)].sort((a, b) => b.length - a.length)
      .map(word => word.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&'));
    pattern = new RegExp(terms.join('|'), 'gu');
  }

  for (const profile of profiles) {
    const matchesSearch = words.every(word => profile.searchText.includes(word));
    const visible = matchesSearch &&
      filters.every(([field, value]) => profile[field].some(label => fold(label) === value));
    profile.element.hidden = !visible;
    if (queryChanged) setHighlights(profile.element, matchesSearch ? pattern : null);
    matches += Number(visible);
  }

  lastQuery = query;
  count.textContent = matches === 1 ? '1 docente' : matches + ' docentes';
  clear.disabled = !query && filters.length === 0;
  empty.hidden = matches > 0;
}

for (const [value, label] of filterOptions('campus')) campus.add(new Option(label, value));
form.addEventListener('input', applyFilters);
form.addEventListener('submit', event => event.preventDefault());
clear.addEventListener('click', () => {
  form.reset();
  course.reset();
  keyword.reset();
  applyFilters();
  search.focus();
});
form.hidden = false;
clear.hidden = false;
applyFilters();
