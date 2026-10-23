if (/\/home(\.html)?$/.test(location.pathname) && typeof auth !== 'undefined') {
  var _rem = false;
  auth.onAuthStateChanged(function (u) {
    if (u && !_rem) { _rem = true; setTimeout(function () { AppBackup.remind(u.uid); }, 6000); }
  });
}

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
      AppBackup.record();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      return b;
    });
  },
  record: function () { try { localStorage.setItem('pl-last-backup', String(Date.now())); } catch (e) {} },

  summary: function (b) {
    var s = { media: 0, games: 0, books: 0, playlists: (b.playlists || []).length };
    (b.entries || []).forEach(function (d) {
      var t = d.data && d.data.type;
      if (t === 'book') s.books++; else if (t === 'game') s.games++; else s.media++;
    });
    return s;
  },

  restoreFlow: function (uid, b) {
    if (!b || b.app !== 'playlog') return AppUtils.showToast('This is not a Playlog backup file.');
    var s = AppBackup.summary(b), mode = 'merge', esc = AppUtils.esc;
    var when = b.createdAt ? new Date(b.createdAt).toLocaleString() : 'unknown date';
    var ov = document.createElement('div');
    ov.className = 'modal-overlay open';
    ov.innerHTML = '<div class="modal-box"><p class="modal-title">Restore backup</p>' +
      '<p class="text-sm text-muted" style="margin-bottom:12px">Backup from ' + esc(when) + '</p>' +
      '<div class="detail-card" style="margin-bottom:14px">' + [['Movies & series', s.media], ['Games', s.games], ['Books', s.books], ['Playlists', s.playlists]].map(function (r) {
        return '<div class="detail-row"><span class="detail-label">' + r[0] + '</span><span class="detail-value">' + r[1] + '</span></div>';
      }).join('') + '</div>' +
      '<div class="toggle-pair" id="rs-mode" style="grid-template-columns:1fr 1fr;margin-bottom:8px"><button class="toggle-btn active" data-v="merge">Merge</button><button class="toggle-btn" data-v="replace">Replace</button></div>' +
      '<p class="text-sm text-muted" id="rs-note" style="margin-bottom:16px"></p>' +
      '<div class="modal-actions"><button class="btn btn-ghost" id="rs-x">Cancel</button><button class="btn btn-primary" id="rs-ok">Merge backup</button></div></div>';
    var q = function (x) { return ov.querySelector(x); }, ok = q('#rs-ok'), note = q('#rs-note');
    function sync() {
      q('#rs-mode').querySelectorAll('.toggle-btn').forEach(function (x) { x.classList.toggle('active', x.dataset.v === mode); });
      note.textContent = mode === 'merge'
        ? 'Adds everything from the file and overwrites items with the same ID. Your other current items stay.'
        : 'Deletes everything currently in this account first, then restores the file. This can’t be undone.';
      ok.textContent = mode === 'merge' ? 'Merge backup' : 'Replace everything';
      ok.className = mode === 'merge' ? 'btn btn-primary' : 'btn btn-danger';
    }
    q('#rs-mode').onclick = function (e) { var t = e.target.closest('.toggle-btn'); if (t) { mode = t.dataset.v; sync(); } };
    q('#rs-x').onclick = function () { ov.remove(); };
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    ok.onclick = function () {
      ov.remove();
      AppUtils.showToast('Restoring…', 60000);
      AppBackup.restore(uid, b, mode).then(function () {
        localStorage.removeItem('pl-entries');
        ['pl-avatar', 'pl-tab-pref', 'mb-layout'].forEach(function (k) { localStorage.removeItem(k); });
        var pf = (b.settings || []).filter(function (d) { return d.id === 'prefs'; })[0], pr = (pf && pf.data) || {};
        if (pr.books) localStorage.setItem('pl-books', '1'); else localStorage.removeItem('pl-books');
        if (/^(dark|light|system)$/.test(pr.theme || '')) localStorage.setItem('pl-theme', pr.theme);
        if (pr.accent) localStorage.setItem('pl-accent', pr.accent);
        AppUtils.showToast('Restored ✓');
        setTimeout(function () { window.location.href = '/home.html'; }, 800);
      }).catch(function () { AppUtils.showToast('Restore failed. Wrong file?'); });
    };
    document.body.appendChild(ov); sync();
  },

  remind: function (uid) {
    var D = 864e5, now = Date.now(), last = +localStorage.getItem('pl-last-backup') || 0;
    var seen = +localStorage.getItem('pl-backup-seen') || 0;
    if (!seen) { seen = now; localStorage.setItem('pl-backup-seen', String(now)); }
    if (now < (+localStorage.getItem('pl-backup-snooze') || 0) || now - Math.max(last, seen) < 30 * D) return;
    var pref = db.collection('users').doc(uid).collection('settings').doc('prefs');
    pref.get().then(function (d) {
      var lb = Math.max(last, d.exists ? +d.data().lastBackup || 0 : 0);
      if (lb) localStorage.setItem('pl-last-backup', String(lb));
      if (now - Math.max(lb, seen) < 30 * D || document.querySelector('.wn-overlay')) return;
      var bar = document.createElement('div');
      bar.className = 'undo-bar';
      bar.innerHTML = '<span>Time for a backup?</span><button type="button" id="bk-now">Back up</button><button type="button" id="bk-no" aria-label="Dismiss" style="background:none;color:inherit;padding:7px 8px">✕</button>';
      document.body.appendChild(bar);
      bar.querySelector('#bk-no').onclick = function () { localStorage.setItem('pl-backup-snooze', String(Date.now() + 7 * D)); bar.remove(); };
      bar.querySelector('#bk-now').onclick = function () {
        AppBackup.download(uid).then(function () {
          pref.set({ lastBackup: Date.now() }, { merge: true });
          bar.remove(); AppUtils.showToast('Backup downloaded ✓');
        }).catch(function () { AppUtils.showToast('Backup failed.'); });
      };
    }).catch(function () {});
  },

  auto: function (uid, prefs, save) {
    var days = { weekly: 7, monthly: 30 }[prefs.autoBackup];
    if (!days || Date.now() - (prefs.lastBackup || 0) < days * 864e5) return;
    AppBackup.download(uid).then(function () {
      save({ lastBackup: Date.now() });
      AppUtils.showToast('Auto-backup saved ✓');
    }).catch(function () {});
  },
  restore: function (uid, b, mode) {
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
    if (mode === 'replace') ['entries', 'playlists', 'covers'].forEach(function (c) {
      p = p.then(function () { return db.collection('users').doc(uid).collection(c).get(); }).then(function (snap) {
        var out = Promise.resolve();

        for (var i = 0; i < snap.docs.length; i += 400) (function (part) {
          out = out.then(function () { var bt = db.batch(); part.forEach(function (d) { bt.delete(d.ref); }); return bt.commit(); });
        })(snap.docs.slice(i, i + 400));
        return out;
      });
    });
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