// Desinstalador: versiones anteriores de la página guardaron una copia offline en el teléfono.
// Este archivo hace que cualquier dispositivo que la tenga la borre y vuelva a cargar todo normal.
// Déjalo en el repo: no estorba y limpia a quien abra la página después.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.map(k => caches.delete(k))))
    .then(() => self.registration.unregister()));
});
