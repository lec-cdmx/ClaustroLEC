let directoryRequest;
let catalogRequest;

export function fold(text) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es');
}

export function readDirectory() {
  directoryRequest ??= fetch(new URL('../../directorio.html', import.meta.url))
    .then(response => {
      if (!response.ok) throw new Error('Directorio no disponible');
      return response.text();
    })
    .then(html => {
      const directory = new DOMParser().parseFromString(html, 'text/html');
      return [...directory.querySelectorAll('.faculty-profile')].map(profile => {
        const heading = profile.querySelector('.faculty-identity h2[id]');
        const emailLink = profile.querySelector('.faculty-contact a[href^="mailto:"]');
        return {
          id: heading.id,
          name: heading.textContent.trim(),
          campus: profile.querySelector('.faculty-campus').textContent.trim(),
          email: emailLink?.getAttribute('href').slice(7).split('?')[0] || '',
          topics: new Set([...profile.querySelectorAll('.faculty-keywords li')].map(node => fold(node.textContent.trim()))),
        };
      });
    })
    .catch(error => {
      directoryRequest = undefined;
      throw error;
    });
  return directoryRequest;
}

export function loadCatalog() {
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
