export const $ = (selector, root = document) => root.querySelector(selector);
export const hexCss = hex => '#' + hex.toString(16).padStart(6, '0');

// Small element builder. Text always goes in via textContent, so car names can never inject HTML.
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) if (child != null) node.append(child);
  return node;
}

export function showScreen(id) {
  for (const screen of document.querySelectorAll('.screen')) screen.classList.toggle('hidden', screen.id !== id);
}

let toastTimer = 0;
export function toast(text, ms = 2200) {
  const node = $('#toast');
  node.textContent = text;
  node.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.add('hidden'), ms);
}

// A button's onClick may return false to keep the modal open.
export function openModal({ title = '', body = [], buttons = [], className = '' } = {}) {
  const close = () => backdrop.remove();
  const backdrop = el('div', { class: 'modal-backdrop' }, [
    el('div', { class: `modal ${className}` }, [
      title ? el('h2', { text: title }) : null,
      ...[].concat(body),
      el('div', { class: 'modal-buttons' }, buttons.map(b => el('button', {
        class: b.kind ?? '',
        text: b.label,
        onclick: () => { if (b.onClick?.() !== false) close(); },
      }))),
    ]),
  ]);
  $('#modal-root').append(backdrop);
  return close;
}

export function closeModals() {
  $('#modal-root').replaceChildren();
}

export function confirmDialog(text, { yes = 'Yes', no = 'No' } = {}) {
  return new Promise(resolve => openModal({
    title: text,
    buttons: [{ label: no, onClick: () => resolve(false) }, { label: yes, kind: 'go', onClick: () => resolve(true) }],
  }));
}

export function askName(defaultName, title = 'Name your car') {
  return new Promise(resolve => {
    const input = el('input', { type: 'text', maxlength: '24', value: defaultName, 'aria-label': 'Car name', enterkeyhint: 'done' });
    const close = openModal({
      title,
      body: [input],
      buttons: [{ label: 'Cancel', onClick: () => resolve(null) }, { label: 'Save ✓', kind: 'go', onClick: () => resolve(input.value) }],
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { resolve(input.value); close(); }
    });
    setTimeout(() => input.select(), 50);
  });
}
