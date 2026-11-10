export function searchableFilter(input, getOptions, { allLabel, queryWords, onChange }) {
  const list = document.getElementById(input.getAttribute('aria-controls'));
  let selectedValue = '';
  let visibleOptions = [];
  let activeIndex = -1;

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  }

  function show() {
    const words = selectedValue ? [] : queryWords(input.value);
    visibleOptions = [['', allLabel], ...getOptions()].filter(([value]) => words.every(word => value.includes(word)));
    const items = visibleOptions.map(([, label], index) => {
      const item = document.createElement('li');
      item.id = list.id + '-' + index;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      item.dataset.index = index;
      item.textContent = label;
      return item;
    });

    if (items.length === 0) {
      const message = document.createElement('li');
      message.setAttribute('role', 'option');
      message.setAttribute('aria-disabled', 'true');
      message.textContent = 'Sin coincidencias';
      items.push(message);
    }

    list.replaceChildren(...items);
    list.scrollTop = 0;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    input.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  }

  function choose(index) {
    const [value, label] = visibleOptions[index];
    selectedValue = value;
    input.value = value ? label : '';
    close();
    onChange();
  }

  input.addEventListener('focus', show);
  input.addEventListener('click', () => {
    if (list.hidden) show();
  });
  input.addEventListener('input', () => {
    selectedValue = '';
    show();
  });
  input.addEventListener('blur', () => {
    close();
    if (!selectedValue) input.value = '';
  });
  input.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'Escape' && !list.hidden) {
      event.preventDefault();
      close();
    }
    if (event.key === 'Enter' && !list.hidden && visibleOptions.length) {
      event.preventDefault();
      choose(activeIndex < 0 ? 0 : activeIndex);
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.hidden) show();
      if (visibleOptions.length === 0) return;

      list.children[activeIndex]?.setAttribute('aria-selected', 'false');
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const start = activeIndex < 0 && direction < 0 ? 0 : activeIndex;
      activeIndex = (start + direction + visibleOptions.length) % visibleOptions.length;
      const item = list.children[activeIndex];
      item.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', item.id);
      item.scrollIntoView({ block: 'nearest' });
    }
  });
  list.addEventListener('mousedown', event => event.preventDefault());
  list.addEventListener('click', event => {
    const item = event.target.closest('[data-index]');
    if (item) choose(Number(item.dataset.index));
  });

  return {
    get value() { return selectedValue; },
    reset() {
      selectedValue = '';
      input.value = '';
      close();
    },
  };
}
