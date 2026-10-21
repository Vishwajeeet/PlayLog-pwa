(function () {
  // To announce a feature later: push a new object with a NEW id. Only the latest one is ever shown.
  var RELEASES = [
    {
      id: 'backup-restore-v1',
      icon: '🛡️',
      title: 'Backup & Restore',
      sub: 'Your entire Playlog, safe in one file.',
      why: 'Everything you log lives under your Google account. If you ever lose access to it, your playlists, ratings, reviews and stats go with it. A backup lets you bring all of it into any account in seconds.',
      steps: [
        ['📍', 'Where to find it', 'Profile photo (top right) → Settings → Backup & Restore'],
        ['⬇️', 'Backup now', 'One file with every entry, playlist and setting'],
        ['♻️', 'Restore anywhere', 'Sign in to any account, pick the file, and it all comes back']
      ],
      tip: 'We recommend turning on weekly auto-backup. Playlog downloads a fresh file whenever you open the app and a week has passed. Keep the files somewhere safe, like Drive or email.',
      cta: { label: 'Turn on weekly auto-backup', prefs: { autoBackup: 'weekly' }, done: '✓ Auto-backup is on' },
      go: { label: 'Open Settings', href: '/account.html' }
    }
  ];

  var latest = RELEASES[RELEASES.length - 1];
  var done = false;

  function key(uid) { return 'pl-whatsnew-' + uid; }
  function ref(uid) { return db.collection('users').doc(uid).collection('settings').doc('prefs'); }
  function mark(uid, extra) {
    try { localStorage.setItem(key(uid), latest.id); } catch (e) {}
    return ref(uid).set(Object.assign({ lastSeenRelease: latest.id }, extra || {}), { merge: true }).catch(function () {});
  }

  function show(u) {
    var r = latest, ov = document.createElement('div');
    ov.className = 'wn-overlay';
    ov.innerHTML =
      '<div class="wn-card" role="dialog" aria-modal="true">' +
        '<button class="wn-x" id="wn-x" aria-label="Close">✕</button>' +
        '<div class="wn-hero"><div class="wn-glow"></div><div class="wn-icon">' + r.icon + '</div></div>' +
        '<span class="wn-tag wn-r" style="--i:0">NEW</span>' +
        '<h2 class="wn-title wn-r" style="--i:1">' + r.title + '</h2>' +
        '<p class="wn-sub wn-r" style="--i:2">' + r.sub + '</p>' +
        '<p class="wn-why wn-r" style="--i:3">' + r.why + '</p>' +
        '<ul class="wn-steps">' + r.steps.map(function (s, i) {
          return '<li class="wn-r" style="--i:' + (4 + i) + '"><em>' + s[0] + '</em><div><b>' + s[1] + '</b><span>' + s[2] + '</span></div></li>';
        }).join('') + '</ul>' +
        '<div class="wn-tip wn-r" style="--i:7">💡 ' + r.tip + '</div>' +
        '<div class="wn-actions wn-r" style="--i:8">' +
          (r.cta ? '<button class="btn btn-primary wn-cta" id="wn-cta">' + r.cta.label + '</button>' : '') +
          (r.go ? '<button class="btn btn-ghost" id="wn-go">' + r.go.label + '</button>' : '') +
          '<button class="wn-later" id="wn-ok">Got it</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    requestAnimationFrame(function () { requestAnimationFrame(function () { ov.classList.add('wn-in'); }); });

    var q = function (s) { return ov.querySelector(s); };
    function close(extra, then) {
      document.removeEventListener('keydown', onKey);
      ov.classList.remove('wn-in');
      var p = mark(u.uid, extra);
      setTimeout(function () { ov.remove(); }, 320);
      if (then) p.then(then);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);

    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    q('#wn-x').onclick = function () { close(); };
    q('#wn-ok').onclick = function () { close(); };
    if (r.go) q('#wn-go').onclick = function () { close(null, function () { window.location.href = r.go.href; }); };
    if (r.cta) q('#wn-cta').onclick = function () {
      this.disabled = true;
      this.textContent = r.cta.done;
      setTimeout(function () { close(r.cta.prefs); }, 800);
    };
  }

  auth.onAuthStateChanged(function (u) {
    if (!u || done) return;
    done = true;
    try { if (localStorage.getItem(key(u.uid)) === latest.id) return; } catch (e) {}
    ref(u.uid).get().then(function (d) {
      var p = d.exists ? d.data() : {};
      if (p.lastSeenRelease === latest.id) {
        try { localStorage.setItem(key(u.uid), latest.id); } catch (e) {}
        return;
      }
      var created = u.metadata && u.metadata.creationTime ? Date.parse(u.metadata.creationTime) : 0;
      if (!p.lastSeenRelease && created && Date.now() - created < 2 * 864e5) return mark(u.uid);
      setTimeout(function () { show(u); }, 900);
    }).catch(function () {});
  });
})();