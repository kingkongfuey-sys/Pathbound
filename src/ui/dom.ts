// Tiny helpers for building DOM by hand. Exists so screens read as structure, not as
// strings of createElement calls. Not a framework: no state, no diffing.

type Child = Node | string | null | undefined | false;

/** Create an element with a class name and children (strings become text nodes). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/** An inline text link: a real button for accessibility, styled as set type (see screens.css). */
export function link(label: string, onTap: () => void, extraClass = ''): HTMLButtonElement {
  const button = el('button', `link ${extraClass}`.trim(), el('span', 'link-text', label));
  button.type = 'button';
  button.addEventListener('click', onTap);
  return button;
}
