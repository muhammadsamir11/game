// Picking up a new version in the home-screen app. iPad and Android rarely really close it: tapping the
// icon just wakes the page that was already open, so the browser never looks for a new version by itself.
// We ask when the app comes back to the front (and now and then while it's open), and once the new
// version has taken over we reload, but only on a safe screen so a race or a room is never cut short.
const CHECK_EVERY = 30 * 60 * 1000;

export function watchForUpdates({ registration, container, doc, canReload, reload, setInterval = globalThis.setInterval }) {
  const hadOld = !!container.controller; // nothing was showing before the first install, so no reload then
  const updates = {
    waiting: false,
    reloadIfWaiting() {
      if (updates.waiting && canReload()) {
        updates.waiting = false;
        reload();
      }
    },
  };
  const check = () => Promise.resolve(registration.update()).catch(() => { /* offline: try again later */ });

  container.addEventListener('controllerchange', () => {
    if (!hadOld) return;
    updates.waiting = true;
    updates.reloadIfWaiting();
  });
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState !== 'visible') return;
    updates.reloadIfWaiting();
    check();
  });
  setInterval(() => {
    if (doc.visibilityState === 'visible') check();
  }, CHECK_EVERY);
  return updates;
}
