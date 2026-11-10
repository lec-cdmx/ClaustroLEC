const dialog = document.querySelector('#research-profile');
const name = dialog.querySelector('#research-name');
const years = dialog.querySelector('.research-years');
const content = dialog.querySelector('.research-content');
const status = dialog.querySelector('.research-status');
const works = dialog.querySelector('.research-works');
const sources = dialog.querySelector('.research-sources');
let catalogRequest;
let currentRequest;

function loadCatalog() {
  catalogRequest ??= fetch(new URL('../data/publicaciones.json', import.meta.url), { cache: 'no-cache' })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .catch(error => {
      catalogRequest = undefined;
      throw error;
    });
  return catalogRequest;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function externalLink(label, url) {
  const link = element('a', 'research-link', label);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function publicationCard(work) {
  const article = element('article', 'research-work', '');
  const meta = element('p', 'research-meta', work.kind);
  if (work.venue) meta.append(' · ', work.venue);

  const title = element('h3', 'research-title', work.title);
  const abstract = element('p', 'research-abstract', work.abstract);
  title.lang = work.titleLang ?? work.lang;
  abstract.lang = work.lang;

  const links = element('div', 'research-links', '');
  links.append(externalLink(work.linkLabel ?? 'Ver ficha', work.url));
  if (work.fullText) links.append(externalLink('Texto completo', work.fullText));
  if (work.workingPaper) links.append(externalLink('Versión de trabajo', work.workingPaper));

  article.append(meta, title, abstract, links);
  return article;
}

function showPublications(publications) {
  const byYear = new Map();
  const ordered = [...publications].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  for (const work of ordered) {
    if (!byYear.has(work.year)) byYear.set(work.year, []);
    byYear.get(work.year).push(work);
  }

  function selectYear(button, entries) {
    for (const option of years.children) option.setAttribute('aria-pressed', String(option === button));
    const count = entries.length === 1 ? '1 trabajo' : `${entries.length} trabajos`;
    status.textContent = `${button.textContent} · ${count}`;
    works.replaceChildren(...entries.map(publicationCard));
    content.scrollTop = 0;
  }

  for (const [year, entries] of byYear) {
    const button = element('button', 'research-year', year ?? 'Sin fecha');
    button.type = 'button';
    button.addEventListener('click', () => selectYear(button, entries));
    years.append(button);
  }

  years.hidden = false;
  years.scrollTo(0, 0);
  selectYear(years.firstElementChild, byYear.values().next().value);
}

async function openProfile(heading) {
  const request = Symbol();
  currentRequest = request;
  name.textContent = heading.textContent;
  years.replaceChildren();
  years.hidden = true;
  works.replaceChildren();
  sources.replaceChildren();
  sources.hidden = true;
  status.textContent = 'Cargando publicaciones…';
  dialog.showModal();

  try {
    const catalog = await loadCatalog();
    if (currentRequest !== request || !dialog.open) return;

    const profile = catalog[heading.id];
    if (profile?.works.length) {
      showPublications(profile.works);
    } else {
      status.textContent = 'Aún no hay publicaciones registradas en este perfil.';
    }

    if (profile?.sources.length) {
      sources.append('Fuentes del perfil', ...profile.sources.map(source => externalLink(source.label, source.url)));
      sources.hidden = false;
    }
  } catch {
    if (currentRequest === request && dialog.open) {
      status.textContent = 'No se pudieron cargar las publicaciones. Cierra el perfil y vuelve a abrirlo para reintentar.';
    }
  }
}

for (const heading of document.querySelectorAll('.faculty-identity h2[id]')) {
  const button = element('button', 'research-open', 'Perfil extendido');
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-controls', dialog.id);
  button.setAttribute('aria-label', `Perfil extendido de ${heading.textContent}`);
  button.addEventListener('click', () => openProfile(heading));
  heading.parentElement.append(button);
}

dialog.addEventListener('click', event => {
  if (event.target === dialog) dialog.close();
});
