// Watching Ishai: shows the key-moment alerts and the vote pushes. A push carries no data; this asks the site what to say,
// telling it which device this is, and shows each item once (the tags already shown are kept in a small cache).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
async function showAlerts() {
  let ep = ''; try { const sub = await self.registration.pushManager.getSubscription(); ep = sub ? sub.endpoint : ''; } catch (e) {}
  const a = await fetch('/api/alert' + (ep ? '?ep=' + encodeURIComponent(ep) : ''), {cache: 'no-store'}).then(r => r.json()).catch(() => ({}));
  const items = Array.isArray(a.items) ? a.items : a.title ? [{title: a.title, body: a.body, tag: 'ishai-alert'}] : [];
  if (!items.length) return self.registration.showNotification('Watching Ishai', {body: 'Something is about to happen.', tag: 'ishai-alert'});
  const seen = await caches.open('ishai-seen').catch(() => null);
  for (const it of items) {
    const k = '/seen/' + encodeURIComponent(it.tag || '');
    if (seen && await seen.match(k)) continue;
    if (seen) await seen.put(k, new Response('1')).catch(() => {});
    await self.registration.showNotification(it.title || 'Watching Ishai', {body: it.body || '', tag: it.tag || 'ishai-alert'});
  }
  if (seen) { const ks = await seen.keys(); for (const k of ks.slice(0, Math.max(0, ks.length - 40))) await seen.delete(k); }
}
self.addEventListener('push', e => e.waitUntil(showAlerts()));
self.addEventListener('notificationclick', e => { e.notification.close();
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(l => { const c = l.find(x => 'focus' in x); return c ? c.focus() : self.clients.openWindow('/'); })); });
