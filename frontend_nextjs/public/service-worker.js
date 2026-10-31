// Minimal PWA service worker (layout.tsx registriert ihn).
// Bilerek önbellek (cache) YOK: canlı işlem verisi (fiyat, pozisyon, emir) asla
// eski bir kopyadan gösterilmemeli. Sadece uygulamayı yüklenebilir yapar ve
// yeni sürümün hemen devreye girmesini sağlar.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Klick auf eine Formations-Systemmeldung (alarmNotify.ts): offenes Fenster der App fokussieren und dorthin führen,
// sonst ein neues Fenster öffnen. Die App fängt die Nachricht ab (FormationScanRunner) und navigiert ohne Neuladen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  if (!url) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (!open) return self.clients.openWindow(url);
      return open.focus().then(() => open.postMessage({ type: 'formation-alarm-open', url }));
    }),
  );
});
