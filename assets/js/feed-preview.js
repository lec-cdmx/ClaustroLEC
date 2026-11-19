import { categoryLabel } from './feed-categories.js';

const section = document.querySelector('[data-community-api]');
const target = document.querySelector('#community-preview-posts');
const status = document.querySelector('#community-preview-status');
const api = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://127.0.0.1:8787' : section.dataset.communityApi;

async function loadPreview() {
  try {
    const response = await fetch(api + '/api/posts', { credentials: 'omit' });
    if (!response.ok) throw new Error();
    const data = await response.json();
    const posts = data.posts.filter(post => !post.parent_id).sort((a, b) => Number(b.pinned || 0) - Number(a.pinned || 0)
      || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).slice(0, 3);
    status.textContent = posts.length ? (data.preview ? 'Vista previa local con publicaciones ficticias.' : '') : 'Aún no hay publicaciones. Comparte una idea o experiencia con el claustro.';
    target.replaceChildren(...posts.map(post => {
      const link = document.createElement('a');
      link.className = 'community-preview-card' + (post.pinned ? ' is-featured' : '');
      link.href = 'buenas-practicas.html#' + encodeURIComponent(post.id);
      const category = document.createElement('span');
      category.className = 'community-preview-category';
      category.textContent = post.pinned ? 'Discusión de la semana' : categoryLabel(post.category);
      const title = document.createElement('h3');
      title.textContent = post.title;
      const excerpt = document.createElement('p');
      excerpt.textContent = post.body.length > 155 ? post.body.slice(0, 152).trimEnd() + '…' : post.body;
      const author = document.createElement('small');
      author.textContent = post.official ? 'Desde el departamento' : post.name;
      link.append(category, title, excerpt, author);
      return link;
    }));
  } catch { status.textContent = 'Visita Comunidad para consultar las publicaciones y participar.'; }
}
loadPreview();
