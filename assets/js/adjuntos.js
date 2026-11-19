const MAX_IMAGES = 3;
const MAX_BYTES = 768 * 1024;

async function prepare(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Usa imágenes JPG, PNG o WebP.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Elige imágenes originales de hasta 8 MB.');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > 50000000) throw new Error('La imagen es demasiado grande. Reduce sus dimensiones e intenta de nuevo.');
    let scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    for (let attempt = 0; attempt < 3; attempt++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', attempt ? .72 : .86));
      if (blob && blob.size <= MAX_BYTES) return blob;
      scale *= .7;
    }
    throw new Error('No pudimos ajustar la imagen. Prueba con una versión más pequeña.');
  } catch (error) {
    if (error instanceof DOMException) throw new Error('No pudimos abrir la imagen. Elige un archivo JPG, PNG o WebP válido.');
    throw error;
  } finally { bitmap?.close(); }
}

export function attachmentEditor(input, previews, status, onChange) {
  let items = [], busy = false, locked = false, revision = 0;
  function render() {
    input.disabled = busy || locked;
    previews.replaceChildren(...items.map((item, index) => {
      const card = document.createElement('div');
      card.className = 'attachment-preview';
      const image = document.createElement('img');
      image.src = item.url;
      image.alt = `Vista previa de la imagen ${index + 1}`;
      const label = document.createElement('label');
      label.textContent = `Descripción de la imagen ${index + 1} (opcional)`;
      const description = document.createElement('input');
      description.type = 'text'; description.maxLength = 300; description.value = item.description;
      description.disabled = busy || locked;
      description.addEventListener('input', () => { item.description = description.value; });
      label.append(description);
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'forum-button'; remove.textContent = 'Quitar imagen';
      remove.setAttribute('aria-label', `Quitar imagen ${index + 1}`);
      remove.disabled = busy || locked;
      remove.addEventListener('click', () => { URL.revokeObjectURL(item.url); items = items.filter(other => other !== item); render(); });
      card.append(image, label, remove);
      return card;
    }));
    onChange({ count: items.length, busy });
  }
  input.addEventListener('change', async () => {
    const files = [...input.files]; input.value = '';
    if (files.length + items.length > MAX_IMAGES) { status.textContent = 'Puedes adjuntar hasta tres imágenes.'; return; }
    const current = revision;
    busy = true; status.textContent = 'Preparando imágenes…'; render();
    try {
      for (const file of files) {
        const blob = await prepare(file);
        if (current !== revision) return;
        items.push({ blob, url: URL.createObjectURL(blob), description: '' });
      }
      status.textContent = items.length ? `${items.length} ${items.length === 1 ? 'imagen lista' : 'imágenes listas'}.` : '';
    } catch (error) { if (current === revision) status.textContent = error.message; }
    finally { if (current === revision) { busy = false; render(); } }
  });
  return {
    get items() { return items; },
    get busy() { return busy; },
    reset() { revision++; for (const item of items) URL.revokeObjectURL(item.url); items = []; busy = false; locked = false; input.value = ''; status.textContent = ''; render(); },
    lock(value) { locked = value; render(); },
  };
}
