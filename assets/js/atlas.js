const nodes = document.querySelectorAll('.atlas-node');
const plot = document.querySelector('.atlas-plot');
const preview = document.querySelector('.atlas-preview');
const previewNumber = document.querySelector('#atlas-preview-number');
const previewTitle = document.querySelector('#atlas-preview-title');
const previewSummary = document.querySelector('#atlas-preview-summary');
const openSection = document.querySelector('.atlas-open');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let activeNode = document.querySelector('.atlas-node.is-active');
let previewTransition;

function showPreview(node) {
  if (activeNode === node) return;

  activeNode.classList.remove('is-active');
  node.classList.add('is-active');
  activeNode = node;

  const title = node.querySelector('.atlas-label').textContent;
  const number = node.querySelector('.atlas-pin').textContent;
  plot.dataset.active = number;
  previewNumber.textContent = number;
  previewTitle.textContent = title;
  previewSummary.textContent = node.dataset.summary;
  openSection.setAttribute('href', node.getAttribute('href'));
  openSection.setAttribute('aria-label', 'Abrir ' + title);

  if (!reduceMotion.matches) {
    previewTransition?.cancel();
    previewTransition = previewTitle.parentElement.animate(
      [{ opacity: 0.35, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 260, easing: 'ease-out' }
    );
  }
}

for (const node of nodes) {
  node.addEventListener('focus', () => showPreview(node));
  node.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse') showPreview(node);
  });
  node.addEventListener('click', event => {
    if (event.pointerType !== 'touch') return;

    event.preventDefault();
    showPreview(node);
    preview.scrollIntoView({ block: 'nearest', behavior: reduceMotion.matches ? 'instant' : 'smooth' });
  });
}
