(function () {
  var $ = function (id) { return document.getElementById(id); };
  var settings = !!$('settings-root');
  var user, ref, prefs = {};

  function paint() {
    var src = prefs.avatar || user.photoURL;
    var ini = (user.displayName || user.email || '?').charAt(0).toUpperCase();
    function set(url) {
      ['acct-avatar', 'acct-avatar-lg'].forEach(function (id) {
        var el = $(id); if (!el) return;
        el.style.backgroundImage = url ? 'url("' + url + '")' : '';
        el.textContent = url ? '' : ini;
      });
    }
    set(null);
    if (src) { var im = new Image(); im.referrerPolicy = 'no-referrer'; im.onload = function () { set(src); }; im.src = src; }
    if (settings) {
      $('acct-name').textContent = user.displayName || 'Account';
      $('acct-email').textContent = user.email || '';
      $('btn-remove-avatar').style.display = prefs.avatar ? 'inline-block' : 'none';
    }
  }

  function marks() {
    if (!settings) return;
    var t = prefs.tab || localStorage.getItem('pl-tab-pref') || 'media';
    var l = localStorage.getItem('mb-layout') || prefs.layout || 'flat';
    document.querySelectorAll('#pref-tab .toggle-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.v === t); });
    document.querySelectorAll('#pref-layout .toggle-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.v === l); });
    var th = localStorage.getItem('pl-theme') || 'dark', ac = localStorage.getItem('pl-accent') || '#c9a84c';
    document.querySelectorAll('#pref-theme .toggle-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.v === th); });
    document.querySelectorAll('#pref-accent button').forEach(function (b) { b.classList.toggle('active', b.dataset.c === ac); });
    var bk = localStorage.getItem('pl-books') === '1';
    document.querySelectorAll('#pref-books .toggle-btn').forEach(function (b) { b.classList.toggle('active', (b.dataset.v === 'on') === bk); });
    var au = prefs.autoBackup || 'off';
    document.querySelectorAll('#pref-auto .toggle-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.v === au); });
    if (prefs.lastBackup) $('last-backup').textContent = 'Last backup: ' + new Date(prefs.lastBackup).toLocaleString();
  }

  function save(data) {
    Object.assign(prefs, data);
    return ref.set(data, { merge: true }).catch(function () { AppUtils.showToast('Failed to save.'); });
  }

  function cacheAvatar() {
    try {
      if (prefs.avatar) localStorage.setItem('pl-avatar', JSON.stringify({ uid: user.uid, url: prefs.avatar }));
      else localStorage.removeItem('pl-avatar');
    } catch (e) {}
  }

  AppAuth.requireAuth(function (u) {
    user = u;
    ref = db.collection('users').doc(u.uid).collection('settings').doc('prefs');
    try {
      var c = JSON.parse(localStorage.getItem('pl-avatar') || 'null');
      if (c && c.uid === u.uid) prefs.avatar = c.url;
    } catch (e) {}
    paint(); marks();
    ref.get().then(function (d) {
      prefs = d.exists ? d.data() : {};
      if (prefs.tab) localStorage.setItem('pl-tab-pref', prefs.tab);
      if (prefs.layout && !localStorage.getItem('mb-layout')) localStorage.setItem('mb-layout', prefs.layout);
      if (prefs.theme) localStorage.setItem('pl-theme', prefs.theme);
      if (prefs.accent) localStorage.setItem('pl-accent', prefs.accent);
      AppTheme.apply();
      if (prefs.books) localStorage.setItem('pl-books', '1'); else localStorage.removeItem('pl-books');
      AppUtils.booksPill();
      AppBackup.auto(user.uid, prefs, save);
      cacheAvatar(); paint(); marks();
    }).catch(function () {});
  });

  if (!settings) return;

  $('brand-bar').addEventListener('click', function () { window.location.href = '/home.html'; });
  $('btn-back').addEventListener('click', function () { window.location.href = '/home.html'; });

  $('pref-tab').addEventListener('click', function (e) {
    var b = e.target.closest('.toggle-btn'); if (!b) return;
    localStorage.setItem('pl-tab-pref', b.dataset.v);
    save({ tab: b.dataset.v }); marks();
  });
  $('pref-layout').addEventListener('click', function (e) {
    var b = e.target.closest('.toggle-btn'); if (!b) return;
    localStorage.setItem('mb-layout', b.dataset.v);
    save({ layout: b.dataset.v }); marks();
  });

  $('avatar-input').addEventListener('change', function (e) {
    var f = e.target.files[0]; this.value = '';
    if (!f) return;
    var r = new FileReader();
    r.onload = function (ev) {
      var im = new Image();
      im.onload = function () {
        var s = Math.min(im.width, im.height), c = document.createElement('canvas');
        c.width = c.height = 160;
        c.getContext('2d').drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 160, 160);
        prefs.avatar = c.toDataURL('image/jpeg', 0.82);
        cacheAvatar(); paint();
        save({ avatar: prefs.avatar }).then(function () { AppUtils.showToast('Photo updated ✓'); });
      };
      im.src = ev.target.result;
    };
    r.readAsDataURL(f);
  });

  $('btn-remove-avatar').addEventListener('click', function () {
    delete prefs.avatar; cacheAvatar(); paint();
    ref.set({ avatar: firebase.firestore.FieldValue.delete() }, { merge: true });
  });

  $('pref-auto').addEventListener('click', function (e) {
    var b = e.target.closest('.toggle-btn'); if (!b) return;
    save({ autoBackup: b.dataset.v }); marks();
  });
  $('btn-backup').addEventListener('click', function () {
    AppBackup.download(user.uid).then(function () {
      save({ lastBackup: Date.now() }); marks(); AppUtils.showToast('Backup downloaded ✓');
    }).catch(function () { AppUtils.showToast('Backup failed.'); });
  });
  $('pref-books').addEventListener('click', function (e) {
    var b = e.target.closest('.toggle-btn'); if (!b) return;
    var on = b.dataset.v === 'on';
    if (on) localStorage.setItem('pl-books', '1'); else localStorage.removeItem('pl-books');
    save({ books: on }); marks();
  });
  $('pref-theme').addEventListener('click', function (e) {
    var b = e.target.closest('.toggle-btn'); if (!b) return;
    localStorage.setItem('pl-theme', b.dataset.v); AppTheme.apply(); save({ theme: b.dataset.v }); marks();
  });
  $('pref-accent').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    localStorage.setItem('pl-accent', b.dataset.c); AppTheme.apply(); save({ accent: b.dataset.c }); marks();
  });
  $('btn-refresh').addEventListener('click', function () {
    localStorage.removeItem('pl-entries'); AppUtils.showToast('Data will reload from the cloud ✓');
  });
  $('btn-restore').addEventListener('click', function () { $('restore-input').click(); });
  $('restore-input').addEventListener('change', function (e) {
    var f = e.target.files[0]; this.value = '';
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      var b; try { b = JSON.parse(r.result); } catch (x) { return AppUtils.showToast('Invalid file.'); }
      AppBackup.restoreFlow(user.uid, b);
    };
    r.readAsText(f);
  });

  var lm = $('logout-modal');
  $('btn-logout').addEventListener('click', function () { lm.classList.add('open'); });
  $('btn-cancel-logout').addEventListener('click', function () { lm.classList.remove('open'); });
  lm.addEventListener('click', function (e) { if (e.target === lm) lm.classList.remove('open'); });
  $('btn-confirm-logout').addEventListener('click', function () {
    AppAuth.signOut().then(function () { window.location.href = '/index.html'; });
  });
})();