// Watching Ishai: shows the key-moment alerts. The push carries no data; this asks the site what to say.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => e.waitUntil(
  fetch('/api/alert', {cache: 'no-store'}).then(r => r.json()).catch(() => ({})).then(a =>
    self.registration.showNotification(a.title || 'Watching Ishai', {body: a.body || 'Something is about to happen.', tag: 'ishai-alert'}))));
self.addEventListener('notificationclick', e => { e.notification.close();
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(l => { const c = l.find(x => 'focus' in x); return c ? c.focus() : self.clients.openWindow('/'); })); });
