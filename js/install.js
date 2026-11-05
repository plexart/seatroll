// Tracks whether the browser offers an install prompt (Chromium's beforeinstallprompt),
// so the settings page can show an install button. Imported early by app.js because the
// event can fire before any view renders.

let deferredPrompt = null;
let listener = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  listener?.();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  listener?.();
});

/** Registers a single callback for prompt availability changes (replaces the previous one). */
export function onInstallChange(callback) {
  listener = callback;
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function isIOS() {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function canPromptInstall() {
  return deferredPrompt !== null;
}

/** Shows the browser's install dialog; resolves to true when the user accepts. */
export async function promptInstall() {
  const prompt = deferredPrompt;
  deferredPrompt = null;
  prompt.prompt();
  const { outcome } = await prompt.userChoice;
  return outcome === 'accepted';
}
