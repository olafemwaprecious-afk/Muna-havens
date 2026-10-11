/**
 * A deliberately tiny DOM for Node.
 *
 * The presentation helpers are pure functions of a record into a small tree of
 * nodes, so they can be tested without a browser as long as `document` exists.
 * This shim implements exactly what `assets/js/lib/dom.js` uses — nothing more.
 * It is a test fixture, not a mini renderer: if the app starts needing more DOM
 * than this, the test belongs in a browser instead.
 */

class Node {
  constructor(nodeType) {
    this.nodeType = nodeType;
    this.childNodes = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this._text = '';
  }

  get firstChild() {
    return this.childNodes[0] || null;
  }

  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] || null;
  }

  get parentElement() {
    return this._parent || null;
  }

  appendChild(child) {
    child._parent = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild(child) {
    const at = this.childNodes.indexOf(child);
    if (at > -1) this.childNodes.splice(at, 1);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  addEventListener(type, handler) {
    (this.listeners[type] ||= []).push(handler);
  }

  /** Fires a handler the way the browser would, for the `onerror` fallback test. */
  dispatchEventLike(type, event = {}) {
    for (const handler of this.listeners[type] || []) handler({ preventDefault() {}, ...event });
  }

  get textContent() {
    if (this.nodeType === 3) return this._text;
    // `el('span', { text })` assigns textContent, which replaces the children,
    // so an element with no children must still report the text it was given.
    if (this.childNodes.length === 0) return this._text;
    return this.childNodes.map((child) => child.textContent).join('');
  }

  set textContent(value) {
    this.childNodes = [];
    this._text = String(value);
  }

  /** Class-based lookup, enough for the assertions these tests make. */
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const out = [];
    const wanted = selector.split(',').map((s) => s.trim());
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 1 && matches(child, wanted)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
}

function matches(node, selectors) {
  return selectors.some((selector) => {
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      return String(node.className || node.attributes.class || '').split(/\s+/).includes(cls);
    }
    if (selector.startsWith('[') && selector.endsWith(']')) {
      const [name, value] = selector.slice(1, -1).split('=');
      const actual = node.attributes[name] ?? node.dataset[camel(name)];
      if (value === undefined) return actual !== undefined && actual !== null;
      return String(actual) === value.replace(/^["']|["']$/g, '');
    }
    return node.tagName === selector.toUpperCase();
  });
}

function camel(name) {
  return name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

class Element extends Node {
  constructor(tag, namespace = 'http://www.w3.org/1999/xhtml') {
    super(1);
    this.tagName = String(tag).toUpperCase();
    this.localName = String(tag).toLowerCase();
    this.namespaceURI = namespace;
    this.className = '';
    this.innerHTML = '';
  }
}

class Text extends Node {
  constructor(value) {
    super(3);
    this._text = String(value);
  }
}

export function installDom() {
  const document = {
    createElement: (tag) => new Element(tag),
    createElementNS: (ns, tag) => new Element(tag, ns),
    createTextNode: (value) => new Text(value),
    createDocumentFragment: () => new Node(11),
  };
  globalThis.document = document;
  globalThis.Node = Node;
  return document;
}

/** Readable dump of a shim tree, for assertion messages. */
export function inspect(node, depth = 0) {
  if (node.nodeType === 3) return `${'  '.repeat(depth)}"${node._text}"`;
  const attrs = Object.entries(node.attributes)
    .concat(node.className ? [['class', node.className]] : [])
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  const open = `<${node.localName}${attrs ? ` ${attrs}` : ''}>`;
  const kids = node.childNodes.map((child) => inspect(child, depth + 1)).join('\n');
  return `${'  '.repeat(depth)}${open}${kids ? `\n${kids}` : ''}`;
}
