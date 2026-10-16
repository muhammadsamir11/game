// Installing the game: Chrome offers an Install button; on iPad/iPhone Safari we explain Share → Add to Home Screen.
import { toast } from './ui.js';

const TIP_KEY = 'brickRacers.installTip.v1';

export function isInstalled() {
  return navigator.standalone === true || window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
}

export function isAppleTouch() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

export function setupInstall({ button, storage = window.localStorage }) {
  let offer = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    offer = e;
    button.classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => button.classList.add('hidden'));
  button.addEventListener('click', async () => {
    if (!offer) return;
    button.classList.add('hidden');
    offer.prompt();
    await offer.userChoice.catch(() => null);
    offer = null;
  });
  if (!isInstalled() && isAppleTouch()) {
    let shown = false;
    try { shown = storage.getItem(TIP_KEY) === '1'; } catch { /* storage blocked */ }
    if (!shown) {
      setTimeout(() => toast('To keep the game on your iPad: tap Share ⬆️, then “Add to Home Screen”.', 6000), 1500);
      try { storage.setItem(TIP_KEY, '1'); } catch { /* storage blocked */ }
    }
  }
}

// Offline copy of the game. Skipped on this computer's dev server (it would serve stale files while
// we work) unless brickRacers.sw = 'on' is set in localStorage.
export function registerOffline() {
  if (!('serviceWorker' in navigator)) return;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  let forced = false;
  try { forced = localStorage.getItem('brickRacers.sw') === 'on'; } catch { /* storage blocked */ }
  if (local && !forced) return;
  navigator.serviceWorker.register('./sw.js').catch(() => { /* no offline copy this time; the game still runs */ });
}
