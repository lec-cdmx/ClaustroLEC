const form = document.querySelector('#directory-filters');
const search = document.querySelector('#directory-search');
const campus = document.querySelector('#directory-campus');
const course = document.querySelector('#directory-course');
const keyword = document.querySelector('#directory-keyword');
const count = document.querySelector('#directory-count');
const clear = document.querySelector('#directory-clear');
const empty = document.querySelector('#directory-empty');

function normalize(value) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').trim();
}

function collectLabels(profile, selector) {
  return Array.from(profile.querySelectorAll(selector), element => element.textContent.trim());
}

const profiles = Array.from(document.querySelectorAll('.faculty-profile'), element => ({
  element,
  searchText: normalize(element.textContent),
  campus: collectLabels(element, '.faculty-campus'),
  course: collectLabels(element, '.faculty-courses li'),
  keyword: collectLabels(element, '.faculty-keywords li'),
}));

function fillFilter(select, field) {
  const labels = new Map();
  for (const profile of profiles) {
    for (const label of profile[field]) labels.set(normalize(label), label);
  }

  const options = [...labels.entries()].sort(([, a], [, b]) => a.localeCompare(b, 'es'));
  for (const [value, label] of options) select.add(new Option(label, value));
}

function applyFilters() {
  const words = normalize(search.value).split(/\s+/u).filter(Boolean);
  const selected = { campus: campus.value, course: course.value, keyword: keyword.value };
  const filters = Object.entries(selected).filter(([, value]) => value);
  let matches = 0;

  for (const profile of profiles) {
    const visible = words.every(word => profile.searchText.includes(word)) &&
      filters.every(([field, value]) => profile[field].some(label => normalize(label) === value));
    profile.element.hidden = !visible;
    matches += Number(visible);
  }

  count.textContent = matches === 1 ? '1 docente' : matches + ' docentes';
  clear.disabled = words.length === 0 && filters.length === 0;
  empty.hidden = matches > 0;
}

fillFilter(campus, 'campus');
fillFilter(course, 'course');
fillFilter(keyword, 'keyword');
form.addEventListener('input', applyFilters);
form.addEventListener('submit', event => event.preventDefault());
clear.addEventListener('click', () => {
  form.reset();
  applyFilters();
  search.focus();
});
form.hidden = false;
clear.hidden = false;
applyFilters();
