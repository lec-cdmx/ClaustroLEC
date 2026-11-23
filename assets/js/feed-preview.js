import { categoryLabel } from './feed-categories.js';

const section = document.querySelector('[data-community-api]');
const discussion = document.querySelector('#community-preview-discussion');
const latest = document.querySelector('#community-preview-posts');
const latestStatus = document.querySelector('#community-latest-status');
const status = document.querySelector('#community-preview-status');
const api = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://127.0.0.1:8787' : section.dataset.communityApi;

function previewCard(post, featured = false) {
  const link = document.createElement('a');
  link.className = featured ? 'community-preview-card is-featured' : 'community-preview-card';
  link.href = 'buenas-practicas.html#' + encodeURIComponent(post.id);
  const title = document.createElement('h3');
  title.textContent = post.title;
  const excerpt = document.createElement('p');
  excerpt.textContent = post.body.length > 155 ? post.body.slice(0, 152).trimEnd() + '…' : post.body;

  if (featured) {
    const author = document.createElement('small');
    author.textContent = post.official ? 'Desde el departamento' : post.name;
    link.append(title, excerpt, author);
  } else {
    const category = document.createElement('span');
    category.textContent = post.category === 'community' ? 'Novedades y reconocimientos' : categoryLabel(post.category);
    link.append(category, title, excerpt);
  }

  return link;
}

async function loadPreview() {
  latestStatus.textContent = 'Cargando publicaciones…';

  try {
    const response = await fetch(api + '/api/posts', { credentials: 'omit' });
    if (!response.ok) throw new Error();
    const data = await response.json();
    const posts = data.posts.filter(post => !post.parent_id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
    const pinned = posts.find(post => post.pinned);
    const recent = posts.filter(post => post !== pinned).slice(0, 3);

    if (pinned) discussion.replaceChildren(previewCard(pinned, true));
    else discussion.querySelector('p').textContent = 'Aún no hay una discusión destacada para esta semana.';

    latest.replaceChildren(...recent.map(post => previewCard(post)));
    latestStatus.textContent = recent.length ? '' : 'Aún no hay novedades para mostrar.';
    if (data.preview) status.textContent = 'Vista previa local con publicaciones ficticias.';
  } catch {
    latestStatus.textContent = 'Las publicaciones no están disponibles en este momento.';
  }
}
loadPreview();
