/**
 * Tiny DOM helper.
 *
 * All dynamic content — product names, descriptions, references, order notes —
 * is rendered through `text()` / `el()`, which use `textContent`. There is no
 * `innerHTML` path for database values anywhere in the app, so stored text can
 * never execute as markup.
 */

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style') node.setAttribute('style', value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in node && key !== 'list' && typeof value !== 'object') {
      node[key] = value;
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(node, children);
  return node;
}

export function append(parent, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list.flat(3)) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'object' && child.nodeType ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function text(value) {
  return document.createTextNode(value === null || value === undefined ? '' : String(value));
}

export function clear(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function frag(children) {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}

/** SVG icons inlined as markup templates (static strings — never user data). */
const ICONS = {
  whatsapp:
    '<path d="M12.04 2A9.94 9.94 0 0 0 2.1 11.94a9.86 9.86 0 0 0 1.36 5L2 22l5.2-1.4a9.9 9.9 0 0 0 4.84 1.24 9.94 9.94 0 0 0 9.94-9.9A9.88 9.88 0 0 0 19.1 4.9 9.84 9.84 0 0 0 12.04 2Zm5.8 14.06c-.24.68-1.42 1.32-1.96 1.36-.5.06-1.16.1-1.88-.16a16.7 16.7 0 0 1-1.7-.64c-2.98-1.3-4.92-4.3-5.06-4.5-.16-.2-1.22-1.62-1.22-3.1 0-1.46.74-2.18 1-2.48a1.04 1.04 0 0 1 .74-.36h.52c.18 0 .42-.04.64.5.24.58.8 2 .88 2.14a.54.54 0 0 1 .02.5c.1.2.34.66.44.84.06.14-.02.38-.14.56-.2.24-.4.44-.6.66-.14.16-.3.34-.14.6.18.3.78 1.3 1.68 2.1a7.2 7.2 0 0 0 2.28 1.5c.32.12.5.1.68-.06.22-.2.94-.9 1.16-1.2.26-.34.5-.28.82-.18.34.12 2.12 1 2.48 1.18.34.2.58.28.66.44.08.16.08.94-.16 1.6Z"/>',
  search:
    '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
  arrow: '<path d="M5 12h13M13 6l5 6-5 6"/>',
  arrowLeft: '<path d="M19 12H6M11 6l-5 6 5 6"/>',
  share:
    '<path d="M12 3v11M8.5 6.5 12 3l3.5 3.5"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5H6a2 2 0 0 0-2 2v9"/>',
  image:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m5 17 4.5-4.5L13 16l2.5-2.5L19 17"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10v4M12 17h.01"/>',
  check: '<path d="m4 12.5 5 5L20 6.5"/>',
  box: '<path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16V8Z"/><path d="M3.5 8 12 12.5 20.5 8M12 12.5v8"/>',
  truck: '<path d="M2 7h11v9H2zM13 10h4.5l3 3v3H13z"/><circle cx="6.5" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>',
  sparkle: '<path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6-4.6-1.9 4.6-1.9L12 3.5Z"/><path d="M18.5 16.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9Z"/>',
  eye: '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.6"/>',
  eyeOff: '<path d="M4 4l16 16"/><path d="M9.9 5.2A9.9 9.9 0 0 1 12 5c6 0 9.5 6 9.5 6a17 17 0 0 1-2.6 3.4M6.3 7.7A16.7 16.7 0 0 0 2.5 11S6 17 12 17a9.6 9.6 0 0 0 3.1-.5"/><path d="M9.6 9.9a2.6 2.6 0 0 0 3.6 3.6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 12H3m0 0 3.5-3.5M3 12l3.5 3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L20 8l-4-4L4 16v4Z"/><path d="m14.5 5.5 4 4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3.5 2"/>',
  tag: '<path d="M20 12.5 12.5 20 4 11.5V4h7.5L20 12.5Z"/><circle cx="8.5" cy="8.5" r="1.4"/>',
};

export function icon(name, cls = 'mh-icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  // Static, developer-authored markup only — no interpolation of data.
  svg.innerHTML = ICONS[name] || ICONS.info;
  return svg;
}
