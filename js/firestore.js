// Firestore database operations for playlists, entries, covers, books, and prefs
(function () {
  var CACHE_TTL = 300000; // 5 minutes
  var memPrefs = {};
  var inflightPrefs = {};
  var memCovers = {};

  function readCache(key, uid, ttl) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.uid !== uid || Date.now() - parsed.t >= (ttl || CACHE_TTL)) return null;
      return parsed.data;
    } catch (e) {
      return null;
    }
  }

  function writeCache(key, uid, data) {
    try {
      localStorage.setItem(key, JSON.stringify({ uid: uid, t: Date.now(), data: data }));
    } catch (e) {
      // Safe fallback when quota is exceeded (e.g., large custom base64 covers)
    }
  }

  function clearKey(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  function applyRewatchRuntime(list) {
    return list.filter(function (e) { return e.type !== 'book'; }).map(function (e) {
      return e.rewatchCount && e.runtime ? Object.assign({}, e, { runtime: e.runtime * (1 + e.rewatchCount) }) : e;
    });
  }

  window.AppDB = {

    clearCache: function () {
      ['pl-entries', 'pl-books-data', 'pl-playlists', 'pl-covers'].forEach(clearKey);
      memPrefs = {};
      inflightPrefs = {};
      memCovers = {};
    },

    getPrefs: function (uid, force) {
      if (!uid) return Promise.resolve({});
      if (!force && memPrefs[uid]) return Promise.resolve(Object.assign({}, memPrefs[uid]));
      if (!force && inflightPrefs[uid]) {
        return inflightPrefs[uid].then(function (d) { return Object.assign({}, d); });
      }
      var p = db.collection('users').doc(uid).collection('settings').doc('prefs').get()
        .then(function (snap) {
          var data = snap.exists ? snap.data() : {};
          memPrefs[uid] = data;
          delete inflightPrefs[uid];
          return Object.assign({}, data);
        })
        .catch(function (err) {
          delete inflightPrefs[uid];
          throw err;
        });
      inflightPrefs[uid] = p;
      return p;
    },

    savePrefs: function (uid, data) {
      if (!uid) return Promise.resolve();
      memPrefs[uid] = Object.assign({}, memPrefs[uid] || {}, data);
      return db.collection('users').doc(uid).collection('settings').doc('prefs').set(data, { merge: true });
    },

    createPlaylist: function (uid, name, type) {
      return db.collection('users').doc(uid)
        .collection('playlists').add({
          name: name,
          type: type || 'media',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function (res) {
          clearKey('pl-playlists');
          return res;
        });
    },

    getOrCreatePlaylist: function (uid, name, type) {
      var col = db.collection('users').doc(uid).collection('playlists');
      return col.where('name', '==', name).where('type', '==', type).limit(1).get()
        .then(function (snap) {
          if (!snap.empty) return snap.docs[0].id;
          clearKey('pl-playlists');
          return col.add({
            name: name, type: type,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }).then(function (ref) {
            clearKey('pl-playlists');
            return ref.id;
          });
        });
    },

    getPlaylists: function (uid, force) {
      var cached = !force && readCache('pl-playlists', uid);
      if (cached) return Promise.resolve(cached.slice());
      return db.collection('users').doc(uid)
        .collection('playlists')
        .orderBy('createdAt', 'asc')
        .get()
        .then(function (snap) {
          var l = snap.docs.map(function (doc) {
            return Object.assign({ id: doc.id }, doc.data());
          });
          l.forEach(function (p) {
            if (!p.coverImage) return;
            var u = db.collection('users').doc(uid);
            u.collection('covers').doc(p.id).set({ data: p.coverImage }).then(function () {
              return u.collection('playlists').doc(p.id).update({ coverImage: firebase.firestore.FieldValue.delete() });
            }).catch(function () {});
          });
          var sorted = l.map(function (p, i) { return [p, i]; }).sort(function (a, b) {
            var x = a[0].order != null ? a[0].order : 1e6 + a[1], y = b[0].order != null ? b[0].order : 1e6 + b[1];
            return x - y;
          }).map(function (z) { return z[0]; });
          writeCache('pl-playlists', uid, sorted);
          return sorted;
        });
    },

    reorderPlaylists: function (uid, ids) {
      var b = db.batch();
      ids.forEach(function (id, i) {
        b.update(db.collection('users').doc(uid).collection('playlists').doc(id), { order: i });
      });
      return b.commit().then(function (r) {
        clearKey('pl-playlists');
        return r;
      });
    },

    updatePlaylistName: function (uid, playlistId, name) {
      return db.collection('users').doc(uid)
        .collection('playlists').doc(playlistId)
        .update({
          name: name,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function (r) {
          clearKey('pl-playlists');
          return r;
        });
    },

    getCovers: function (uid, force) {
      if (!force && memCovers[uid]) return Promise.resolve(Object.assign({}, memCovers[uid]));
      var cached = !force && readCache('pl-covers', uid);
      if (cached) {
        memCovers[uid] = cached;
        return Promise.resolve(Object.assign({}, cached));
      }
      return db.collection('users').doc(uid).collection('covers').get().then(function (s) {
        var m = {};
        s.docs.forEach(function (d) { m[d.id] = d.data().data; });
        memCovers[uid] = m;
        writeCache('pl-covers', uid, m);
        return Object.assign({}, m);
      });
    },

    updatePlaylistCover: function (uid, id, data) {
      var u = db.collection('users').doc(uid);
      return u.collection('covers').doc(id).set({ data: data }).then(function () {
        if (memCovers[uid]) memCovers[uid][id] = data;
        clearKey('pl-covers');
        clearKey('pl-playlists');
        return u.collection('playlists').doc(id).update({
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          coverImage: firebase.firestore.FieldValue.delete()
        });
      });
    },

    addEntry: function (uid, entryData) {
      var data = Object.assign({}, entryData, {
        addedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return db.collection('users').doc(uid)
        .collection('entries').add(data).then(function (r) {
          clearKey('pl-entries');
          clearKey('pl-books-data');
          return r;
        });
    },

    getEntriesByPlaylist: function (uid, playlistId) {
      return db.collection('users').doc(uid)
        .collection('entries')
        .where('playlistId', '==', playlistId)
        .orderBy('addedAt', 'desc')
        .get()
        .then(function (snap) {
          return snap.docs.map(function (doc) {
            return Object.assign({ id: doc.id }, doc.data());
          });
        });
    },

    getAllEntries: function (uid, force) {
      var cached = !force && readCache('pl-entries', uid);
      if (cached) return Promise.resolve(applyRewatchRuntime(cached));
      return db.collection('users').doc(uid)
        .collection('entries')
        .orderBy('addedAt', 'desc')
        .get()
        .then(function (snap) {
          var d = snap.docs.map(function (doc) {
            return Object.assign({ id: doc.id }, doc.data());
          });
          writeCache('pl-entries', uid, d.filter(function (x) { return x.type !== 'book'; }));
          return applyRewatchRuntime(d);
        });
    },

    getBooks: function (uid, force) {
      var cached = !force && readCache('pl-books-data', uid);
      if (cached) return Promise.resolve(cached.slice());
      return db.collection('users').doc(uid).collection('entries').where('type', '==', 'book').get().then(function (s) {
        var t = function (x) { return x.addedAt && x.addedAt.toMillis ? x.addedAt.toMillis() : (typeof x._addedMs === 'number' ? x._addedMs : 9e15); };
        var list = s.docs.map(function (d) {
          var row = Object.assign({ id: d.id }, d.data());
          if (row.addedAt && row.addedAt.toMillis) row._addedMs = row.addedAt.toMillis();
          return row;
        }).sort(function (a, b) { return t(b) - t(a); });
        writeCache('pl-books-data', uid, list);
        return list;
      });
    },

    deleteEntry: function (uid, entryId) {
      return db.collection('users').doc(uid)
        .collection('entries').doc(entryId).delete().then(function (r) {
          clearKey('pl-entries');
          clearKey('pl-books-data');
          return r;
        });
    },

    updateEntry: function (uid, entryId, data) {
      return db.collection('users').doc(uid)
        .collection('entries').doc(entryId).update(data).then(function (r) {
          clearKey('pl-entries');
          clearKey('pl-books-data');
          return r;
        });
    },

    deletePlaylist: function (uid, playlistId) {
      db.collection('users').doc(uid).collection('covers').doc(playlistId).delete().catch(function () {});
      return db.collection('users').doc(uid).collection('entries')
        .where('playlistId', '==', playlistId).get()
        .then(function (snap) {
          var batch = db.batch();
          snap.docs.forEach(function (d) { batch.delete(d.ref); });
          return batch.commit();
        })
        .then(function () {
          return db.collection('users').doc(uid).collection('playlists').doc(playlistId).delete();
        })
        .then(function (r) {
          clearKey('pl-entries');
          clearKey('pl-playlists');
          clearKey('pl-covers');
          if (memCovers[uid]) delete memCovers[uid][playlistId];
          return r;
        });
    },

    moveEntry: function (uid, entryId, newPlaylistId) {
      var map = { 'Completed Games': 'completed', 'Currently Playing': 'playing', 'Dropped Games': 'dropped', 'Wishlist': 'wishlist' };
      var user = db.collection('users').doc(uid);
      var entryRef = user.collection('entries').doc(entryId);
      return Promise.all([
        user.collection('playlists').doc(newPlaylistId).get(),
        entryRef.get()
      ]).then(function (docs) {
        var pl = docs[0], entry = docs[1];
        var data = {
          playlistId: newPlaylistId,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        var st = pl.exists && map[pl.data().name];
        if (st) data.completionStatus = st;
        else if (entry.exists && entry.data().type !== 'game') {
          data.completionStatus = pl.exists && pl.data().name === 'Watchlist' ? 'wishlist' : null;
        }
        return entryRef.update(data).then(function (r) {
          clearKey('pl-entries');
          return r;
        });
      });
    }

  };
})();
