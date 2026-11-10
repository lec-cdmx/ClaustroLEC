const sections = document.querySelectorAll('.atlas-section');
const sectionGrid = document.querySelector('.atlas-sections');
const preview = document.querySelector('.atlas-preview');
const previewNumber = document.querySelector('#atlas-preview-number');
const previewTitle = document.querySelector('#atlas-preview-title');
const previewSummary = document.querySelector('#atlas-preview-summary');
const openSection = document.querySelector('.atlas-open');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let activeSection;
let previewTransition;
let touchStart;
let swiped = false;

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

sectionGrid.addEventListener('touchstart', event => {
  touchStart = event.touches.length === 1 ? event.touches[0] : undefined;
  swiped = false;
}, { passive: true });

sectionGrid.addEventListener('touchmove', event => {
  if (!touchStart || event.touches.length !== 1) return;

  const { clientX, clientY } = event.touches[0];
  if (!swiped && Math.hypot(clientX - touchStart.clientX, clientY - touchStart.clientY) < 8) return;

  swiped = true;
  const section = document.elementFromPoint(clientX, clientY)?.closest('.atlas-section');
  if (section) showPreview(section);
}, { passive: true });

for (const section of sections) {
  section.addEventListener('focus', () => {
    if (section.matches(':focus-visible')) showPreview(section);
  });
  section.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse') showPreview(section);
  });
  section.addEventListener('click', event => {
    if (event.pointerType === 'touch' && swiped) {
      event.preventDefault();
      return;
    }

    if (!['touch', 'pen'].includes(event.pointerType) || activeSection === section) return;

    event.preventDefault();
    showPreview(section);
    preview.scrollIntoView({ block: 'nearest', behavior: reduceMotion.matches ? 'instant' : 'smooth' });
  });
}
