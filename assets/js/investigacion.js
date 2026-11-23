import { loadPublications } from './publicaciones.js';

const navigation = document.querySelector('#research-tabs');
const tabs = [...navigation.querySelectorAll('a')].map(link => ({
  link,
  section: document.getElementById(link.hash.slice(1)),
}));
let activeTab;

function showSection(tab) {
  activeTab = tab;
  for (const option of tabs) {
    const active = option === tab;
    option.section.hidden = !active;
    if (active) option.link.setAttribute('aria-current', 'location');
    else option.link.removeAttribute('aria-current');
  }
  if (tab.section.id === 'publicaciones') loadPublications();
}

function followHash() {
  const target = document.getElementById(location.hash.slice(1));
  const selected = tabs.find(tab => target && tab.section.contains(target));
  showSection(selected ?? (location.hash ? activeTab : undefined) ?? tabs[0]);
  if (selected && target) requestAnimationFrame(() => target.scrollIntoView());
}

for (const tab of tabs) {
  tab.link.addEventListener('click', event => {
    if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    if (location.hash !== tab.link.hash) history.pushState(null, '', tab.link.hash);
    showSection(tab);
  });
}

window.addEventListener('hashchange', followHash);
followHash();
