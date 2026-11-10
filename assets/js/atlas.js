const sections = document.querySelectorAll('.atlas-section');
const preview = document.querySelector('.atlas-preview');
const previewNumber = document.querySelector('#atlas-preview-number');
const previewTitle = document.querySelector('#atlas-preview-title');
const previewSummary = document.querySelector('#atlas-preview-summary');
const openSection = document.querySelector('.atlas-open');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let activeSection;
let previewTransition;

function showPreview(section) {
  if (activeSection === section) return;

  activeSection?.classList.remove('is-active');
  section.classList.add('is-active');
  activeSection = section;

  const title = section.querySelector('.atlas-label').textContent;
  previewNumber.textContent = section.querySelector('.atlas-section-number').textContent;
  previewTitle.textContent = title;
  previewSummary.textContent = section.dataset.summary;
  openSection.setAttribute('href', section.getAttribute('href'));
  openSection.setAttribute('aria-label', 'Abrir ' + title);
  openSection.hidden = false;

  previewTransition?.cancel();
  if (!reduceMotion.matches) {
    previewTransition = previewTitle.parentElement.animate(
      [{ opacity: 0.35, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 260, easing: 'ease-out' }
    );
  }
}

for (const section of sections) {
  section.addEventListener('focus', () => {
    if (section.matches(':focus-visible')) showPreview(section);
  });
  section.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse') showPreview(section);
  });
  section.addEventListener('click', event => {
    if (!['touch', 'pen'].includes(event.pointerType) || activeSection === section) return;

    event.preventDefault();
    showPreview(section);
    preview.scrollIntoView({ block: 'nearest', behavior: reduceMotion.matches ? 'instant' : 'smooth' });
  });
}
