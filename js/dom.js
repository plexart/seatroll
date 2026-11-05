// Small DOM helpers. All user-provided text goes through textContent, never innerHTML.

/**
 * Creates an element. Props: `class`, `dataset`, `on<Event>` handlers, DOM properties
 * (value, checked, type, ...) or plain attributes. Children may be nodes, strings or arrays.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in el) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  appendChildren(el, children);
  return el;
}

/** Appends children, skipping null/false and flattening arrays. */
function appendChildren(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
}

/** Like el.replaceChildren(), but skips null/false (which the DOM would render as text). */
export function setChildren(el, ...children) {
  el.replaceChildren();
  appendChildren(el, children);
}

let toastTimer = 0;

export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 2200);
}

/** Saves a file: shares it (mobile, e.g. to WeChat) when possible, otherwise downloads it. */
export async function saveFile(blob, filename) {
  const files = [new File([blob], filename, { type: blob.type })];
  // Mobile Chrome refuses to share .json files, so offer the same content as plain text too.
  if (blob.type === 'application/json') {
    files.push(new File([blob], filename.replace(/\.json$/, '.txt'), { type: 'text/plain' }));
  }
  const file = files.find((f) => navigator.canShare?.({ files: [f] }));
  if (file) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Copies text, then also opens the share sheet where supported (mobile), so it can go straight to
 * WeChat. Both start in the same tick to keep the click's user activation. Resolves to whether the
 * copy succeeded.
 */
export async function copyAndShareText(text) {
  const copied = copyText(text);
  if (navigator.share) {
    try {
      await navigator.share({ text });
    } catch {
      // Cancelled or unsupported: the text is still on the clipboard.
    }
  }
  return copied;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers without async clipboard access (e.g. some in-app browsers).
    const area = h('textarea', { value: text, readOnly: true });
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}
