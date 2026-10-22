var CACHE = 'playlog-v15';

var SHELL = [
  '/index.html', '/home.html', '/books.html', '/playlist.html', '/add.html', '/stats.html', '/entry.html', '/account.html',
  '/css/main.css', '/css/home.css', '/css/whatsnew.css', '/css/theme.css', '/css/books.css',
  '/js/config.js', '/js/firebase-init.js', '/js/auth.js', '/js/utils.js', '/js/firestore.js',
  '/js/tmdb.js', '/js/rawg.js', '/js/flow.js', '/js/backup.js', '/js/whatsnew.js', '/js/openlibrary.js', '/js/books.js', '/js/home.js', '/js/account.js', '/js/playlist.js', '/js/add.js', '/js/stats.js', '/js/entry.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  var url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  url.search = '';
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (cached) {
      var net = fetch(req, { cache: 'no-cache' }).then(function (res) {
        if (res && res.ok && !res.redirected) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(url.href, copy); });
        }
        return res;
      }).catch(function () {
        return cached || caches.match('/home.html');
      });
      return net;
    })
  );
});