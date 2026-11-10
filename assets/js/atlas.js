const nodes = document.querySelectorAll('.atlas-node');
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
  previewNumber.textContent = node.querySelector('.atlas-pin').textContent;
  previewTitle.textContent = title;
  previewSummary.textContent = node.dataset.summary;
  openSection.setAttribute('href', node.getAttribute('href'));
  openSection.setAttribute('aria-label', 'Abrir ' + title);

  if (!reduceMotion.matches) {
    previewTransition?.cancel();
    previewTransition = previewTitle.parentElement.animate(
      [{ opacity: 0.75, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 190, easing: 'ease-out' }
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
