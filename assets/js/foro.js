import { examples } from './forum-examples.js?v=2';
import { parseTags, tagError, tagKey } from './forum-tags.js';

const forum = document.querySelector('[data-forum-api]');
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
const api = local ? 'http://127.0.0.1:8787' : forum.dataset.forumApi;
const threads = document.querySelector('#forum-threads');
const forumStatus = document.querySelector('#forum-status');
const tagFilter = document.querySelector('#forum-tag-filter');
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
const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'America/Mexico_City' });
let publicPosts = [];
let connected = false;
let parentId = null;
let moderatorPassword = '';
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

function openContribution(parent) {
  form.reset();
  formStatus.textContent = '';
  parentId = parent?.id || null;
  document.querySelector('#forum-dialog-title').textContent = parent ? 'Responder en el hilo' : 'Compartir una práctica';
  const context = document.querySelector('#forum-context');
  context.hidden = !parent;
  context.textContent = parent ? 'En respuesta a ' + parent.name + (parent.title ? ' · ' + parent.title : '') : '';
  document.querySelector('#forum-title-field').hidden = Boolean(parent);
  form.elements.title.required = !parent;
  document.querySelector('#forum-tags-field').hidden = Boolean(parent);
  form.elements.tags.disabled = Boolean(parent);
  form.elements.tags.removeAttribute('aria-invalid');
  dialog.showModal();
  form.elements.name.focus();
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
    if (post.title) card.append(element('h3', post.title));
    card.append(postDetails(post), element('p', post.body, 'forum-text'), ...postTags(post));
    const reply = button('Responder', () => openContribution(post), 'forum-button forum-reply-button');
    reply.setAttribute('aria-label', 'Responder a ' + post.name);
    reply.disabled = !connected;
    card.append(reply);
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

  const roots = [...publicPosts.filter(post => !post.parent_id).reverse(), ...examples.filter(post => !post.parent_id)];
  const selected = tagFilter.value;
  const tags = new Map();
  for (const post of roots) {
    for (const tag of post.tags || []) {
      const key = tagKey(tag);
      if (!tags.has(key)) tags.set(key, tag);
    }
  }
  const options = [...tags].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  tagFilter.replaceChildren(new Option('Todas las etiquetas', ''), ...options.map(([key, tag]) => new Option(tag, key)));
  tagFilter.value = tags.has(selected) ? selected : '';
  const visible = tagFilter.value
    ? roots.filter(post => post.tags?.some(tag => tagKey(tag) === selected))
    : roots;
  filterCount.textContent = `${visible.length} ${visible.length === 1 ? 'hilo' : 'hilos'}`;
  threads.replaceChildren(...visible.map(render));
}

async function loadPosts() {
  if (!api) {
    forumStatus.textContent = 'Vista previa. Los envíos se habilitarán cuando el servicio de moderación esté conectado.';
    renderThreads();
    return;
  }
  try {
    const result = await request('posts');
    publicPosts = result.posts;
    connected = result.submissionsOpen;
    forumStatus.textContent = connected ? '' : 'Los envíos se habilitarán al configurar la contraseña de moderación.';
  } catch {
    connected = false;
    forumStatus.textContent = 'El foro no está disponible en este momento. Puedes leer los ejemplos e intentar más tarde.';
  }
  newPost.disabled = !connected;
  login.hidden = !connected || Boolean(moderatorPassword);
  if (!moderatorPassword) moderationStatus.textContent = connected ? '' : forumStatus.textContent;
  renderThreads();
}

function closeModeration() {
  moderatorPassword = '';
  login.reset();
  login.hidden = !connected;
  session.hidden = true;
  queue.replaceChildren();
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
  const { posts } = await request('moderation', { password });
  if (password !== moderatorPassword) return;
  login.hidden = true;
  login.reset();
  session.hidden = false;
  moderationStatus.textContent = posts.length ? 'Pendientes en esta vista · ' + posts.length : 'No hay contribuciones pendientes.';
  queue.replaceChildren(...posts.map(post => {
    const card = element('article', '', 'forum-review');
    const parent = [...examples, ...publicPosts].find(item => item.id === post.parent_id);
    const subject = post.title || (parent ? 'Respuesta a ' + (parent.title || parent.name) : 'Respuesta en un hilo');
    const actions = element('div', '', 'forum-session');
    actions.append(
      button('Aprobar', () => decide(post, 'approved'), 'forum-button forum-primary'),
      button('Rechazar', () => decide(post, 'rejected'), 'forum-button forum-reject'),
    );
    card.append(element('h3', subject), postDetails(post), element('p', 'Correo · ' + post.email), element('p', post.body, 'forum-text'), ...postTags(post), actions);
    return card;
  }));
}

newPost.addEventListener('click', () => openContribution(null));
tagFilter.addEventListener('change', renderThreads);
form.elements.tags.addEventListener('input', () => {
  form.elements.tags.removeAttribute('aria-invalid');
  formStatus.textContent = '';
});
cancel.addEventListener('click', () => dialog.close());
dialog.addEventListener('cancel', event => { if (send.disabled) event.preventDefault(); });
form.addEventListener('submit', async event => {
  event.preventDefault();
  const body = { ...Object.fromEntries(new FormData(form)), parentId };
  if (!parentId && !parseTags(body.tags)) {
    formStatus.textContent = tagError;
    form.elements.tags.setAttribute('aria-invalid', 'true');
    form.elements.tags.focus();
    return;
  }
  send.disabled = cancel.disabled = true;
  formStatus.textContent = 'Enviando…';
  try {
    await request('posts', { body });
    dialog.close();
    forumStatus.textContent = 'Tu contribución quedó pendiente de moderación.';
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
