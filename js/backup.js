window.AppBackup = {
  _ser: function (v) {
    if (v && typeof v.toMillis === 'function') return { __ts: v.toMillis() };
    if (Array.isArray(v)) return v.map(AppBackup._ser);
    if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { o[k] = AppBackup._ser(v[k]); }); return o; }
    return v;
  },
  _de: function (v) {
    if (Array.isArray(v)) return v.map(AppBackup._de);
    if (v && typeof v === 'object') {
      if (typeof v.__ts === 'number' && Object.keys(v).length === 1) return firebase.firestore.Timestamp.fromMillis(v.__ts);
      var o = {}; Object.keys(v).forEach(function (k) { o[k] = AppBackup._de(v[k]); }); return o;
    }
    return v;
  },
  _col: function (uid, name) {
    return db.collection('users').doc(uid).collection(name).get().then(function (s) {
      return s.docs.map(function (d) { return { id: d.id, data: AppBackup._ser(d.data()) }; });
    });
  },
  _clean: function (e) {
    ['season', 'rawgId', 'tmdbId', 'runtime', 'monthWatched', 'yearWatched', 'rating', 'gameRating', 'playtime', 'rewatchCount', 'reReadCount', 'releaseYear', 'pages', 'bookRating', 'finishMonth', 'finishYear'].forEach(function (k) {
      if (e[k] != null && typeof e[k] !== 'number') e[k] = Number(e[k]) || null;
    });
    if (e.poster != null) e.poster = String(e.poster).replace(/["'<>\s\\]/g, '') || null;
    return e;
  },
  build: function (uid) {
    return Promise.all([AppBackup._col(uid, 'playlists'), AppBackup._col(uid, 'entries'), AppBackup._col(uid, 'settings'), AppBackup._col(uid, 'covers')]).then(function (r) {
      return { app: 'playlog', version: 1, createdAt: new Date().toISOString(), playlists: r[0], entries: r[1], settings: r[2], covers: r[3] };
    });
  },
  download: function (uid) {
    return AppBackup.build(uid).then(function (b) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(b)], { type: 'application/json' }));
      a.download = 'playlog-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      return b;
    });
  },
  auto: function (uid, prefs, save) {
    var days = { weekly: 7, monthly: 30 }[prefs.autoBackup];
    if (!days || Date.now() - (prefs.lastBackup || 0) < days * 864e5) return;
    AppBackup.download(uid).then(function () {
      save({ lastBackup: Date.now() });
      AppUtils.showToast('Auto-backup saved ✓');
    }).catch(function () {});
  },
  restore: function (uid, b) {
    if (!b || b.app !== 'playlog') return Promise.reject(new Error('bad file'));
    var ops = [];
    ['playlists', 'entries', 'settings', 'covers'].forEach(function (c) {
      (b[c] || []).forEach(function (d) {
        var dd = AppBackup._de(d.data);
        if (c === 'entries') AppBackup._clean(dd);
        ops.push([db.collection('users').doc(uid).collection(c).doc(d.id), dd]);
      });
    });
    var p = Promise.resolve();
    for (var i = 0; i < ops.length; i += 300) (function (part) {
      p = p.then(function () {
        var batch = db.batch();
        part.forEach(function (o) { batch.set(o[0], o[1]); });
        return batch.commit();
      });
    })(ops.slice(i, i + 300));
    return p;
  }
};