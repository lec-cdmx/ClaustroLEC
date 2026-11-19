import { examples } from './forum-examples.js?v=3';
import { categoryLabel } from './feed-categories.js';
import { parseTags, tagError, tagKey } from './forum-tags.js';
import { searchableFilter } from './searchable-filter.js';

const forum = document.querySelector('[data-forum-api]');
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
const api = local ? 'http://127.0.0.1:8787' : forum.dataset.forumApi;
const threads = document.querySelector('#forum-threads');
const forumStatus = document.querySelector('#forum-status');
const tagInput = document.querySelector('#forum-tag-filter');
const filterCount = document.querySelector('#forum-filter-count');
const newPost = document.querySelector('#forum-new');
const dialog = document.querySelector('#forum-dialog');
const form = document.querySelector('#forum-submit');
const formStatus = document.querySelector('#forum-submit-status');
const send = form.querySelector('[type="submit"]');
const cancel = document.querySelector('#forum-cancel');
const login = document.querySelector('#forum-login');
const session = document.querySelector('#forum-session');
const refresh = document.querySelector('#forum-refresh');
const moderationStatus = document.querySelector('#forum-moderation-status');
const queue = document.querySelector('#forum-queue');
const categoryButtons = document.querySelectorAll('.feed-categories button');
const sort = document.querySelector('#forum-sort');
const demoThreads = document.querySelector('#forum-example-threads');
const featuredManagement = document.querySelector('#forum-featured-management');
const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'America/Mexico_City' });
let publicPosts = [];
let connected = false;
let parentId = null;
let moderatorPassword = '';
let selectedCategory = '';
let publishingOfficial = false;
let reactionsOpen = false;
let loading = true;
let loadFailed = false;
let visitor = '';
try {
  visitor = localStorage.getItem('lec-feed-visitor') || crypto.randomUUID();
  localStorage.setItem('lec-feed-visitor', visitor);
} catch { visitor = ''; /* Reading and posting remain available without browser storage. */ }
const expandedThreads = new Set();

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(text, onClick, className = 'forum-button') {
  const node = element('button', text, className);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

async function request(path, { body, password } = {}) {
  const headers = {};
  if (visitor) headers['X-Visitor-Id'] = visitor;
  if (body) headers['Content-Type'] = 'application/json';
  if (password) headers.Authorization = 'Bearer ' + encodeURIComponent(password);
  const response = await fetch(api + '/api/' + path, {
    method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, credentials: 'omit',
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'No se pudo completar la solicitud.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function updatePinChoice() {
  const visible = publishingOfficial && form.elements.category.value === 'discussion';
  document.querySelector('#forum-pinned-field').hidden = !visible;
  if (!visible) form.elements.pinned.checked = false;
}

function openContribution(parent, official = false) {
  form.reset();
  formStatus.textContent = '';
  parentId = parent?.id || null;
  publishingOfficial = official && Boolean(moderatorPassword);
  document.querySelector('#forum-dialog-title').textContent = parent ? 'Responder en la conversación' : publishingOfficial ? 'Publicar desde el departamento' : 'Compartir con el claustro';
  const context = document.querySelector('#forum-context');
  context.hidden = !parent;
  context.textContent = parent ? 'En respuesta a ' + parent.name + (parent.title ? ' · ' + parent.title : '') : '';
  document.querySelector('#forum-title-field').hidden = Boolean(parent);
  form.elements.title.required = !parent;
  document.querySelector('#forum-tags-field').hidden = Boolean(parent);
  form.elements.tags.disabled = Boolean(parent);
  form.elements.tags.removeAttribute('aria-invalid');
  document.querySelector('#forum-category-field').hidden = Boolean(parent);
  form.elements.category.disabled = Boolean(parent);
  for (const label of document.querySelectorAll('[data-person-field]')) {
    label.hidden = publishingOfficial;
    label.querySelector('input, select').disabled = publishingOfficial;
  }
  if (!parent && selectedCategory) form.elements.category.value = selectedCategory;
  updatePinChoice();
  send.textContent = publishingOfficial ? 'Publicar' : 'Enviar a moderación';
  document.querySelector('#forum-privacy').textContent = publishingOfficial
    ? 'Se publica a nombre del Departamento de Economía, Región CDMX. El correo queda para gestión interna y solo se muestra si marcas la casilla.'
    : 'Moderación puede usar tu correo para contactarte sobre tu envío. Al aprobarse, se publican tu nombre, puesto, campus y contribución. Tu correo también se muestra si marcas la casilla.';
  dialog.showModal();
  (publishingOfficial ? form.elements.email : form.elements.name).focus();
}

function postDetails(post) {
  const byline = element('p', '', 'forum-byline');
  byline.append(element('strong', post.name), ' · ' + post.role + ' · ' + post.campus);
  if (post.created_at) {
    const time = element('time', dateFormat.format(new Date(post.created_at)));
    time.dateTime = post.created_at;
    byline.append(' · ', time);
  }
  if (post.example) byline.append(element('span', 'Ejemplo ficticio', 'forum-example'));
  return byline;
}

function postTags(post) {
  if (!post.tags?.length) return [];
  const list = element('ul', '', 'forum-tags');
  list.setAttribute('aria-label', 'Etiquetas');
  list.append(...post.tags.map(tag => element('li', tag)));
  return [list];
}

function collapseReplies(post, list, article) {
  const extra = [...list.children].slice(1);
  const firstBranch = list.firstElementChild.querySelector('.forum-replies');
  if (firstBranch) extra.push(firstBranch);
  if (!extra.length) return;

  const count = list.querySelectorAll('.forum-reply').length - 1;
  const label = count === 1 ? 'Mostrar 1 respuesta más' : `Mostrar ${count} respuestas más`;
  const toggle = button('', () => {
    if (expandedThreads.has(post.id)) expandedThreads.delete(post.id);
    else expandedThreads.add(post.id);
    update();
  }, 'forum-button forum-more');
  list.id = `${post.id}-respuestas`;
  toggle.setAttribute('aria-controls', list.id);

  function update() {
    const expanded = expandedThreads.has(post.id);
    for (const item of extra) item.hidden = !expanded;
    toggle.textContent = expanded ? 'Mostrar menos' : label;
    toggle.setAttribute('aria-expanded', String(expanded));
  }

  update();
  article.append(toggle);
}

function rootPosts() {
  return publicPosts.filter(post => !post.parent_id);
}

function tagOptions() {
  const tags = new Map();
  for (const post of rootPosts()) {
    for (const tag of post.tags || []) {
      const key = tagKey(tag);
      if (!tags.has(key)) tags.set(key, tag);
    }
  }
  return [...tags].sort(([, a], [, b]) => a.localeCompare(b, 'es'));
}

const tagFilter = searchableFilter(tagInput, tagOptions, {
  allLabel: 'Todas las etiquetas',
  queryWords: value => tagKey(value).trim().split(/\s+/u).filter(Boolean),
  onChange: renderThreads,
});

function postBody(text) {
  const body = element('p', '', 'forum-text');
  const pieces = String(text).split(/(https?:\/\/[^\s<>]+)/g);
  for (const piece of pieces) {
    if (/^https?:\/\//.test(piece)) {
      const link = element('a', piece);
      link.href = piece;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      body.append(link);
    } else body.append(piece);
  }
  return body;
}

function renderThreads() {
  const children = new Map();
  for (const post of [...examples, ...publicPosts]) {
    if (!post.parent_id) continue;
    if (!children.has(post.parent_id)) children.set(post.parent_id, []);
    children.get(post.parent_id).push(post);
  }

  function render(post) {
    const article = element('article', '', post.parent_id ? 'forum-reply' : 'forum-thread');
    article.id = post.id;
    const card = element('div', '', 'forum-post');
    if (!post.parent_id) {
      const badges = element('div', '', 'feed-badges');
      const category = element('span', categoryLabel(post.category), 'feed-category');
      category.dataset.category = post.category || 'practice';
      badges.append(category);
      if (post.official) badges.append(element('span', 'Desde el departamento', 'feed-official'));
      if (post.pinned) {
        badges.append(element('span', 'Discusión de la semana', 'feed-pinned'));
        article.classList.add('is-featured');
      }
      card.append(badges);
    }
    if (post.title && !post.parent_id) card.append(element('h3', post.title));
    const byline = postDetails(post);
    if (post.contact_email) {
      const contact = element('a', post.contact_email);
      contact.href = 'mailto:' + encodeURIComponent(post.contact_email).replace('%40', '@');
      byline.append(' · ', contact);
    }
    card.append(byline, postBody(post.body), ...postTags(post));
    const actions = element('div', '', 'feed-actions');
    const like = button('', async () => {
      like.disabled = true;
      try {
        const stats = await request('likes/' + post.id, { body: { liked: !Boolean(post.liked) } });
        Object.assign(post, stats);
        updateLike();
      } catch (error) { forumStatus.textContent = error.message; }
      finally { like.disabled = false; }
    }, 'forum-button feed-like');
    function updateLike() {
      like.textContent = `Me gusta · ${post.likes || 0}`;
      like.setAttribute('aria-pressed', String(Boolean(post.liked)));
      like.setAttribute('aria-label', `${post.liked ? 'Quitar Me gusta' : 'Me gusta'}: ${post.parent_id ? 'respuesta de ' + post.name : post.title}`);
    }
    updateLike();
    like.disabled = !connected || !reactionsOpen || !visitor || post.example;
    const reply = button(post.parent_id ? 'Responder' : 'Comentar', () => openContribution(post), 'forum-button forum-reply-button');
    reply.setAttribute('aria-label', 'Responder a ' + post.name);
    reply.disabled = !connected || post.example;
    const permalink = element('a', 'Enlace', 'feed-permalink');
    permalink.href = '#' + post.id;
    actions.append(like, reply, permalink);
    card.append(actions);
    article.append(card);

    const replies = children.get(post.id);
    if (replies?.length) {
      const list = element('ol', '', 'forum-replies');
      list.setAttribute('aria-label', 'Respuestas a ' + post.name);
      for (const child of replies) {
        const item = element('li');
        item.append(render(child));
        list.append(item);
      }
      article.append(list);
      if (!post.parent_id) collapseReplies(post, list, article);
    }
    return article;
  }

  const roots = rootPosts();
  const selected = tagFilter.value;
  const replyCount = id => (children.get(id) || []).reduce((count, post) => count + 1 + replyCount(post.id), 0);
  const visible = roots.filter(post => (!selectedCategory || (post.category || 'practice') === selectedCategory)
    && (!selected || post.tags?.some(tag => tagKey(tag) === selected)));
  visible.sort((a, b) => Number(b.pinned || 0) - Number(a.pinned || 0)
    || (sort.value === 'conversation' ? replyCount(b.id) - replyCount(a.id) : 0)
    || (b.created_at || '').localeCompare(a.created_at || '') || b.id.localeCompare(a.id));
  filterCount.textContent = `${visible.length} ${visible.length === 1 ? 'publicación' : 'publicaciones'}`;
  threads.replaceChildren(...visible.map(post => {
    const article = render(post);
    const count = replyCount(post.id);
    article.querySelector('.feed-actions').append(element('span', `${count} ${count === 1 ? 'comentario' : 'comentarios'}`, 'feed-reply-count'));
    return article;
  }));
  if (!visible.length) {
    const message = loading ? 'Cargando publicaciones…'
      : loadFailed ? 'No pudimos recuperar las publicaciones. Recarga la página para intentar de nuevo; también puedes consultar los ejemplos.'
      : roots.length ? 'No hay publicaciones con estos filtros. Prueba otra categoría o etiqueta.'
      : 'Aún no hay publicaciones. Este será el espacio para las novedades y conversaciones del claustro.';
    threads.append(element('p', message, 'feed-empty'));
  }
  // Keep legacy discussions attached to their original example thread.
  demoThreads.replaceChildren(...examples.filter(post => !post.parent_id).map(render));
  threads.setAttribute('aria-busy', String(loading));
}

async function loadPosts() {
  loading = true;
  if (!api) {
    loading = false;
    loadFailed = true;
    forumStatus.textContent = 'Vista previa. Los envíos se habilitarán cuando el servicio de moderación esté conectado.';
    renderThreads();
    return;
  }
  try {
    const result = await request('posts');
    document.querySelector('#feed-preview-note').hidden = !result.preview;
    publicPosts = result.posts;
    loadFailed = false;
    connected = result.submissionsOpen && result.feedVersion >= 2;
    reactionsOpen = result.reactionsOpen;
    forumStatus.textContent = connected ? '' : 'Puedes consultar las publicaciones. La participación se habilitará pronto.';
  } catch {
    connected = false;
    loadFailed = true;
    forumStatus.textContent = 'No pudimos cargar las publicaciones. Intenta de nuevo en unos momentos.';
  }
  loading = false;
  newPost.disabled = !connected;
  login.hidden = !connected || Boolean(moderatorPassword);
  if (!moderatorPassword) moderationStatus.textContent = connected ? '' : forumStatus.textContent;
  renderThreads();
  revealLinkedPost();
}

function revealLinkedPost() {
  const id = location.hash.slice(1);
  if (!id) return;
  const all = [...examples, ...publicPosts];
  let post = all.find(post => post.id === id);
  if (!post) return;
  while (post.parent_id) {
    post = all.find(parent => parent.id === post.parent_id);
    if (!post) return;
    expandedThreads.add(post.id);
  }
  if (post.example) document.querySelector('#feed-examples').open = true;
  renderThreads();
  document.getElementById(id)?.scrollIntoView({ block: 'center' });
}

function closeModeration() {
  moderatorPassword = '';
  login.reset();
  login.hidden = !connected;
  session.hidden = true;
  queue.replaceChildren();
  featuredManagement.replaceChildren();
  if (publishingOfficial && dialog.open) dialog.close();
  moderationStatus.textContent = '';
}

async function decide(post, decision) {
  const password = moderatorPassword;
  refresh.disabled = true;
  for (const action of queue.querySelectorAll('button')) action.disabled = true;
  try {
    await request('moderation/' + post.id, { body: { decision }, password });
    if (password !== moderatorPassword) return;
    await loadQueue();
    if (decision === 'approved') await loadPosts();
    if (password === moderatorPassword) moderationStatus.textContent = decision === 'approved' ? 'Contribución aprobada.' : 'Contribución rechazada.';
  } catch (error) {
    if (password !== moderatorPassword) return;
    if (error.status === 401) closeModeration();
    moderationStatus.textContent = error.message;
  } finally {
    refresh.disabled = false;
    for (const action of queue.querySelectorAll('button')) action.disabled = false;
  }
}

async function loadQueue(password = moderatorPassword) {
  const { posts, featured } = await request('moderation', { password });
  if (password !== moderatorPassword) return;
  login.hidden = true;
  login.reset();
  session.hidden = false;
  moderationStatus.textContent = posts.length ? 'Pendientes en esta vista · ' + posts.length : 'No hay contribuciones pendientes.';
  featuredManagement.replaceChildren();
  if (featured) {
    const remove = button('Retirar destacada', async () => {
      remove.disabled = true;
      try {
        await request('featured/' + featured.id, { body: { pinned: false }, password });
        if (password === moderatorPassword) { await loadQueue(); await loadPosts(); }
      } catch (error) { moderationStatus.textContent = error.message; }
      finally { remove.disabled = false; }
    });
    featuredManagement.append(element('p', 'Discusión destacada: ' + featured.title), remove);
  }
  queue.replaceChildren(...posts.map(post => {
    const card = element('article', '', 'forum-review');
    const parent = [...examples, ...publicPosts].find(item => item.id === post.parent_id);
    const subject = post.title || (parent ? 'Respuesta a ' + (parent.title || parent.name) : 'Respuesta en un hilo');
    const actions = element('div', '', 'forum-session');
    actions.append(
      button('Aprobar', () => decide(post, 'approved'), 'forum-button forum-primary'),
      button('Rechazar', () => decide(post, 'rejected'), 'forum-button forum-reject'),
    );
    const emailLabel = post.email_public === 1 ? 'Correo visible al aprobar' : 'Correo para moderación';
    card.append(element('span', categoryLabel(post.category), 'feed-category'), element('h3', subject), postDetails(post), element('p', emailLabel + ' · ' + post.email), element('p', post.body, 'forum-text'), ...postTags(post), actions);
    return card;
  }));
}

newPost.addEventListener('click', () => openContribution(null));
document.querySelector('#forum-official').addEventListener('click', () => openContribution(null, true));
form.elements.category.addEventListener('change', updatePinChoice);
sort.addEventListener('change', renderThreads);
window.addEventListener('hashchange', revealLinkedPost);
for (const category of categoryButtons) {
  category.addEventListener('click', () => {
    selectedCategory = category.dataset.category;
    for (const other of categoryButtons) other.setAttribute('aria-pressed', String(other === category));
    renderThreads();
  });
}
tagInput.addEventListener('input', renderThreads);
form.elements.tags.addEventListener('input', () => {
  form.elements.tags.removeAttribute('aria-invalid');
  formStatus.textContent = '';
});
cancel.addEventListener('click', () => dialog.close());
dialog.addEventListener('cancel', event => { if (send.disabled) event.preventDefault(); });
form.addEventListener('submit', async event => {
  event.preventDefault();
  const body = { ...Object.fromEntries(new FormData(form)), parentId, publishEmail: form.elements.publishEmail.checked, pinned: publishingOfficial && form.elements.pinned.checked };
  if (!parentId && !parseTags(body.tags)) {
    formStatus.textContent = tagError;
    form.elements.tags.setAttribute('aria-invalid', 'true');
    form.elements.tags.focus();
    return;
  }
  send.disabled = cancel.disabled = true;
  formStatus.textContent = 'Enviando…';
  try {
    await request(publishingOfficial ? 'department/posts' : 'posts', { body, password: publishingOfficial ? moderatorPassword : undefined });
    dialog.close();
    if (publishingOfficial) { await loadPosts(); await loadQueue(); }
    forumStatus.textContent = publishingOfficial ? 'Publicación del departamento lista.' : 'Tu contribución quedó pendiente de moderación.';
  } catch (error) {
    formStatus.textContent = error.message;
  } finally {
    send.disabled = cancel.disabled = false;
  }
});

login.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = login.querySelector('button');
  submit.disabled = true;
  moderatorPassword = login.elements.password.value;
  moderationStatus.textContent = 'Consultando la cola…';
  try {
    await loadQueue();
  } catch (error) {
    closeModeration();
    moderationStatus.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

refresh.addEventListener('click', async () => {
  try { await loadQueue(); }
  catch (error) {
    if (error.status === 401) closeModeration();
    moderationStatus.textContent = error.message;
  }
});
document.querySelector('#forum-logout').addEventListener('click', closeModeration);

renderThreads();
loadPosts();
