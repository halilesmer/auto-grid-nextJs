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
