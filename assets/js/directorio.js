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

function searchableFilter(input, field, allLabel) {
  const list = document.getElementById(input.getAttribute('aria-controls'));
  const options = [['', allLabel], ...filterOptions(field)];
  let selectedValue = '';
  let visibleOptions = [];
  let activeIndex = -1;

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  }

  function show() {
    const words = selectedValue ? [] : queryWords(input.value);
    visibleOptions = options.filter(([value]) => words.every(word => value.includes(word)));
    const items = visibleOptions.map(([, label], index) => {
      const item = document.createElement('li');
      item.id = list.id + '-' + index;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      item.dataset.index = index;
      item.textContent = label;
      return item;
    });

    if (items.length === 0) {
      const message = document.createElement('li');
      message.setAttribute('role', 'option');
      message.setAttribute('aria-disabled', 'true');
      message.textContent = 'Sin coincidencias';
      items.push(message);
    }

    list.replaceChildren(...items);
    list.scrollTop = 0;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    input.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  }

  function choose(index) {
    const [value, label] = visibleOptions[index];
    selectedValue = value;
    input.value = value ? label : '';
    close();
    applyFilters();
  }

  input.addEventListener('focus', show);
  input.addEventListener('click', () => {
    if (list.hidden) show();
  });
  input.addEventListener('input', () => {
    selectedValue = '';
    show();
  });
  input.addEventListener('blur', () => {
    close();
    if (!selectedValue) input.value = '';
  });
  input.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'Escape' && !list.hidden) {
      event.preventDefault();
      close();
    }
    if (event.key === 'Enter' && !list.hidden && visibleOptions.length) {
      event.preventDefault();
      choose(activeIndex < 0 ? 0 : activeIndex);
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.hidden) show();
      if (visibleOptions.length === 0) return;

      list.children[activeIndex]?.setAttribute('aria-selected', 'false');
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const start = activeIndex < 0 && direction < 0 ? 0 : activeIndex;
      activeIndex = (start + direction + visibleOptions.length) % visibleOptions.length;
      const item = list.children[activeIndex];
      item.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', item.id);
      item.scrollIntoView({ block: 'nearest' });
    }
  });
  list.addEventListener('mousedown', event => event.preventDefault());
  list.addEventListener('click', event => {
    const item = event.target.closest('[data-index]');
    if (item) choose(Number(item.dataset.index));
  });

  return {
    get value() { return selectedValue; },
    reset() {
      selectedValue = '';
      close();
    },
  };
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

const course = searchableFilter(courseInput, 'course', 'Todas las UF');
const keyword = searchableFilter(keywordInput, 'keyword', 'Todas las palabras clave');
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
