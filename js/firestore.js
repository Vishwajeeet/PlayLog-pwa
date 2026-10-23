// Firestore database operations for playlists and entries
setTimeout(function () {
  var A = window.AppDB, all = A.getAllEntries;
  A.getBooks = function (uid) {
    return db.collection('users').doc(uid).collection('entries').where('type', '==', 'book').get().then(function (s) {
      var t = function (x) { return x.addedAt && x.addedAt.toMillis ? x.addedAt.toMillis() : 9e15; };
      return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).sort(function (a, b) { return t(b) - t(a); });
    });
  };
  A.getCovers = function (uid) {
    return db.collection('users').doc(uid).collection('covers').get().then(function (s) {
      var m = {}; s.docs.forEach(function (d) { m[d.id] = d.data().data; }); return m;
    });
  };
  A.updatePlaylistCover = function (uid, id, data) {
    var u = db.collection('users').doc(uid);
    return u.collection('covers').doc(id).set({ data: data }).then(function () {
      return u.collection('playlists').doc(id).update({ updatedAt: firebase.firestore.FieldValue.serverTimestamp(), coverImage: firebase.firestore.FieldValue.delete() });
    });
  };
  var dp0 = A.deletePlaylist;
  A.deletePlaylist = function (uid, id) {
    db.collection('users').doc(uid).collection('covers').doc(id).delete().catch(function () {});
    return dp0.call(A, uid, id);
  };
  var gp = A.getPlaylists;
  A.getPlaylists = function (uid) {
    return gp.call(A, uid).then(function (l) {
      l.forEach(function (p) {
        if (!p.coverImage) return;
        var u = db.collection('users').doc(uid);
        u.collection('covers').doc(p.id).set({ data: p.coverImage }).then(function () {
          return u.collection('playlists').doc(p.id).update({ coverImage: firebase.firestore.FieldValue.delete() });
        }).catch(function () {});
      });
      return l.map(function (p, i) { return [p, i]; }).sort(function (a, b) {
        var x = a[0].order != null ? a[0].order : 1e6 + a[1], y = b[0].order != null ? b[0].order : 1e6 + b[1];
        return x - y;
      }).map(function (z) { return z[0]; });
    });
  };
  A.reorderPlaylists = function (uid, ids) {
    var b = db.batch();
    ids.forEach(function (id, i) { b.update(db.collection('users').doc(uid).collection('playlists').doc(id), { order: i }); });
    return b.commit();
  };
  var rw = function (l) {
    return l.filter(function (e) { return e.type !== 'book'; }).map(function (e) {
      return e.rewatchCount && e.runtime ? Object.assign({}, e, { runtime: e.runtime * (1 + e.rewatchCount) }) : e;
    });
  };
  A.getAllEntries = function (uid) {
    try {
      var c = JSON.parse(localStorage.getItem('pl-entries') || 'null');
      if (c && c.uid === uid && Date.now() - c.t < 300000) return Promise.resolve(rw(c.data));
    } catch (e) {}
    return all.call(A, uid).then(function (d) {
      try { localStorage.setItem('pl-entries', JSON.stringify({ uid: uid, t: Date.now(), data: d.filter(function (x) { return x.type !== 'book'; }) })); } catch (e) {}
      return rw(d);
    });
  };
  ['addEntry', 'deleteEntry', 'updateEntry', 'moveEntry', 'deletePlaylist'].forEach(function (k) {
    var f = A[k];
    A[k] = function () {
      return f.apply(A, arguments).then(function (r) {
        try { localStorage.removeItem('pl-entries'); } catch (e) {}
        return r;
      });
    };
  });
}, 0);

window.AppDB = {

  createPlaylist: function(uid, name, type) {
    return db.collection('users').doc(uid)
      .collection('playlists').add({
        name: name,
        type: type || 'media',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
  },

  getOrCreatePlaylist: function(uid, name, type) {
    var col = db.collection('users').doc(uid).collection('playlists');
    return col.where('name', '==', name).where('type', '==', type).limit(1).get()
      .then(function(snap) {
        if (!snap.empty) return snap.docs[0].id;
        return col.add({
          name: name, type: type,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function(ref) { return ref.id; });
      });
  },

  getPlaylists: function(uid) {
    return db.collection('users').doc(uid)
      .collection('playlists')
      .orderBy('createdAt', 'asc')
      .get()
      .then(function(snap) {
        return snap.docs.map(function(doc) {
          return Object.assign({ id: doc.id }, doc.data());
        });
      });
  },

  updatePlaylistName: function(uid, playlistId, name) {
    return db.collection('users').doc(uid)
      .collection('playlists').doc(playlistId)
      .update({
        name: name,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
  },

  addEntry: function(uid, entryData) {
    var data = Object.assign({}, entryData, {
      addedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return db.collection('users').doc(uid)
      .collection('entries').add(data);
  },

  getEntriesByPlaylist: function(uid, playlistId) {
    return db.collection('users').doc(uid)
      .collection('entries')
      .where('playlistId', '==', playlistId)
      .orderBy('addedAt', 'desc')
      .get()
      .then(function(snap) {
        return snap.docs.map(function(doc) {
          return Object.assign({ id: doc.id }, doc.data());
        });
      });
  },

  getAllEntries: function(uid) {
    return db.collection('users').doc(uid)
      .collection('entries')
      .orderBy('addedAt', 'desc')
      .get()
      .then(function(snap) {
        return snap.docs.map(function(doc) {
          return Object.assign({ id: doc.id }, doc.data());
        });
      });
  },

  deleteEntry: function(uid, entryId) {
    return db.collection('users').doc(uid)
      .collection('entries').doc(entryId).delete();
  },

  updateEntry: function(uid, entryId, data) {
    return db.collection('users').doc(uid)
      .collection('entries').doc(entryId).update(data);
  },
    updatePlaylistCover: function(uid, playlistId, dataUrl) {
    return db.collection('users').doc(uid)
      .collection('playlists').doc(playlistId)
      .update({ coverImage: dataUrl || null, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  },

  deletePlaylist: function(uid, playlistId) {
    var self = this;
    return db.collection('users').doc(uid).collection('entries')
      .where('playlistId', '==', playlistId).get()
      .then(function(snap) {
        var batch = db.batch();
        snap.docs.forEach(function(d) { batch.delete(d.ref); });
        return batch.commit();
      })
      .then(function() {
        return db.collection('users').doc(uid).collection('playlists').doc(playlistId).delete();
      });
  },

  moveEntry: function(uid, entryId, newPlaylistId) {
    var map = { 'Completed Games': 'completed', 'Currently Playing': 'playing', 'Dropped Games': 'dropped', 'Wishlist': 'wishlist' };
    var user = db.collection('users').doc(uid);
    var entryRef = user.collection('entries').doc(entryId);
    return Promise.all([
      user.collection('playlists').doc(newPlaylistId).get(),
      entryRef.get()
    ]).then(function(docs) {
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
        return entryRef.update(data);
      });
  }

};