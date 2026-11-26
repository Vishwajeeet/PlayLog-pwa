var entryId = new URLSearchParams(window.location.search).get('id');
if (!entryId) window.location.href = '/home.html';

AppAuth.requireAuth(function (user) {
  var uid = user.uid;
  var docRef = db.collection('users').doc(uid).collection('entries').doc(entryId);

  docRef.get().then(function (doc) {
    if (!doc.exists) { window.location.href = '/home.html'; return; }
    render(Object.assign({ id: doc.id }, doc.data()));
  }).catch(function (err) {
    console.error(err);
    AppUtils.showToast('Failed to load entry.');
  });

  function render(e) {
    var isGame = e.type === 'game';
    var isMediaWishlist = !isGame && e.completionStatus === 'wishlist';
    var posterUrl = AppUtils.getPosterUrl(e.poster);
    document.title = e.title + ' — Playlog';
    AppUtils.setAmbient(e.poster);

    var rows = [];
    if (isGame) {
      var stLabels = { completed: 'Completed', playing: 'Playing', dropped: 'Dropped', wishlist: 'Wishlist' };
      rows.push(['Status', stLabels[e.completionStatus] || '—']);
      if (e.gameRating) rows.push(['Rating', e.gameRating + ' / 10']);
      if (e.playtime) rows.push(['Playtime', e.playtime + ' hours']);
      if (e.category) rows.push(['Genre', e.category]);
      if (e.monthWatched) rows.push(['Played', AppUtils.monthName(e.monthWatched) + ' ' + e.yearWatched]);
      if (e.dropReason) rows.push(['Drop Reason', e.dropReason]);
    } else {
      if (e.completionStatus === 'wishlist') {
        rows.push(['Status', 'Watchlist']);
      } else {
        if (e.rating) rows.push(['Rating', AppUtils.ratingToEmoji(e.rating) + ' (' + e.rating + '/5)']);
        if (e.monthWatched && e.yearWatched) rows.push(['Watched', AppUtils.monthName(e.monthWatched) + ' ' + e.yearWatched]);
      }
      if (e.runtime) rows.push(['Runtime', AppUtils.formatHours(e.runtime)]);
      if (e.season) rows.push(['Season', e.seasonName || ('S' + e.season)]);
    }
    if (e.theatre) rows.push(['Theatre', 'Yes']);
    if (e.rewatchCount) rows.push(['Rewatched', e.rewatchCount + ' time' + (e.rewatchCount > 1 ? 's' : '')]);
    if (e.releaseYear) rows.push(['Release Year', e.releaseYear]);
    if (e.genres && e.genres.length) rows.push(['Genres', e.genres.join(', ')]);
    if (e.review) rows.push(['Review', e.review]);

    var rowsHTML = rows.map(function (r) {
      return '<div class="detail-row"><span class="detail-label">' + r[0] + '</span><span class="detail-value">' + AppUtils.esc(r[1]) + '</span></div>';
    }).join('');

    // Re-watch / Re-play diary timeline
    var rewatchesHTML = '';
    var rewatches = Array.isArray(e.rewatches) ? e.rewatches : [];
    if (rewatches.length > 0) {
      rewatchesHTML = '<div class="detail-card rewatch-diary-card" style="margin-top:14px;padding:14px 16px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
          '<b style="font-size:14px;color:var(--text-primary)">' + (isGame ? '🎮 Playthrough Diary' : '🔁 Re-watch Diary') + ' (' + rewatches.length + ')</b>' +
          '<button type="button" class="btn btn-ghost" id="btn-add-rewatch-card" style="font-size:12px;padding:4px 10px;width:auto">+ Add</button>' +
        '</div>' +
        '<div class="rewatch-timeline" style="display:flex;flex-direction:column;gap:10px">';

      rewatches.forEach(function (rw, idx) {
        var ordinal = (idx + 2);
        var ordSuffix = ordinal === 2 ? 'nd' : ordinal === 3 ? 'rd' : 'th';
        var label = ordinal + ordSuffix + (isGame ? ' Playthrough' : ' Watch');
        var ratingBadge = rw.rating ? '<span class="badge" style="position:static;padding:2px 8px;font-size:11px;background:var(--accent);color:#000;font-weight:700">★ ' + rw.rating + '</span>' : '';

        rewatchesHTML += (
          '<div class="rewatch-item" data-rw-id="' + rw.id + '" style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px">' +
            '<div style="flex:1;min-width:0">' +
              '<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">' +
                '<strong style="font-size:13px;color:var(--text-primary)">' + label + '</strong>' +
                (rw.date ? '<span style="font-size:11.5px;color:var(--text-muted)">' + rw.date + '</span>' : '') +
                ratingBadge +
              '</div>' +
              (rw.notes ? '<p style="font-size:12px;color:var(--text-muted);margin:0;line-height:1.4">"' + AppUtils.esc(rw.notes) + '"</p>' : '') +
            '</div>' +
            '<button type="button" class="btn-delete-rewatch" data-rw-id="' + rw.id + '" style="background:none;border:none;color:var(--text-muted);font-size:16px;cursor:pointer;padding:2px 6px" title="Delete log">×</button>' +
          '</div>'
        );
      });
      rewatchesHTML += '</div></div>';
    }

    var actionHTML = isMediaWishlist
      ? '<button class="btn btn-primary" id="btn-mark-watched">✓ Mark as Watched</button>'
      : '<button class="btn btn-ghost" id="btn-open-rewatch">' + (isGame ? '🔁 Log Re-play' : '🔁 Log Re-watch') + '</button>' +
        '<button class="btn btn-ghost" id="btn-share">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px">' +
          '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"></path>' +
          '<polyline points="16 6 12 2 8 6"></polyline>' +
          '<line x1="12" y1="2" x2="12" y2="15"></line>' +
        '</svg> Share Entry' +
      '</button>' +
      '<button class="btn btn-ghost" id="btn-edit">✏️ Edit Details</button>' +
      '<button class="btn btn-ghost" id="btn-move">↔ Move to Playlist</button>';
    if (isGame && e.completionStatus === 'playing') {
      actionHTML = '<a class="btn btn-primary" id="btn-open-timer" href="/timer.html?game=' + encodeURIComponent(entryId) + '">Open timer</a>' + actionHTML;
    } else if (isGame && (e.completionStatus === 'wishlist' || e.completionStatus === 'dropped')) {
      actionHTML = '<button class="btn btn-primary" id="btn-start-tracking">Start tracking</button>' + actionHTML;
    }

    // Set cinematic hero backdrop
    var backdropEl = document.getElementById('entry-backdrop');
    if (backdropEl) {
      var bgImg = e.backdrop || posterUrl;
      if (bgImg) backdropEl.style.backgroundImage = 'url("' + bgImg + '")';
    }

    document.getElementById('entry-content').innerHTML = (
      '<div class="entry-detail-layout">' +
        '<div class="detail-hero">' +
          (posterUrl ? '<img class="detail-poster" src="' + posterUrl + '" alt="' + AppUtils.esc(e.title) + '" title="Tap to zoom">' : '<div class="entry-poster-placeholder">' + (isGame ? '' : '🎬') + '</div>') +
        '</div>' +
        '<div class="entry-detail-info">' +
          '<div class="entry-heading">' +
            '<h2 class="entry-title">' + AppUtils.esc(e.title) + '</h2>' +
            '<p class="entry-type">' + (isGame ? 'Game' : e.type === 'series' ? 'Series' : 'Movie') + (e.releaseYear ? ' <span>·</span> ' + e.releaseYear : '') + '</p>' +
          '</div>' +
          '<div class="detail-card">' + rowsHTML + '</div>' +
          rewatchesHTML +
          '<div class="entry-actions">' + actionHTML +
            '<button class="btn btn-danger" id="btn-delete">Delete Entry</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    if (isGame) {
      var entryInfo = document.querySelector('.entry-detail-info');
      entryInfo.insertBefore(document.getElementById('entry-timer-widget'), entryInfo.querySelector('.entry-actions'));
      window.dispatchEvent(new Event('playlog:entry-rendered'));
    }

    if (isMediaWishlist) {
      document.getElementById('btn-mark-watched').addEventListener('click', function () {
        window.location.href = '/add.html?type=media&markWatchedEntryId=' + encodeURIComponent(entryId);
      });
    } else {
      document.getElementById('btn-share').addEventListener('click', function () {
        generateShareCard(e);
      });

      document.getElementById('btn-edit').addEventListener('click', function () { openEdit(e); });

      document.getElementById('btn-move').addEventListener('click', function () {
        openMoveModal(e);
      });
    }

    // Lightbox Poster Zoom
    var posterImg = document.querySelector('.detail-poster');
    if (posterImg && posterUrl) {
      posterImg.addEventListener('click', function () {
        var lb = document.getElementById('lightbox-modal');
        var lbImg = document.getElementById('lightbox-img');
        if (lb && lbImg) {
          lbImg.src = posterUrl;
          lb.classList.add('open');
        }
      });
    }

    // Re-watch / Re-play Dialog Logic
    function openRewatchDialog() {
      var rwModal = document.getElementById('rewatch-modal');
      var rwTitle = document.getElementById('rewatch-modal-title');
      var rwRatingLabel = document.getElementById('rewatch-rating-label');
      var rwDate = document.getElementById('rewatch-date');
      var rwRating = document.getElementById('rewatch-rating');
      var rwNotes = document.getElementById('rewatch-notes');

      if (rwTitle) rwTitle.textContent = isGame ? 'Log Re-play' : 'Log Re-watch';
      if (rwRatingLabel) rwRatingLabel.textContent = isGame ? 'Rating (1–10, Optional)' : 'Rating (1–5, Optional)';
      if (rwDate) rwDate.value = new Date().toISOString().split('T')[0];
      if (rwRating) rwRating.value = '';
      if (rwNotes) rwNotes.value = '';

      if (rwModal) rwModal.classList.add('open');
    }

    var btnOpenRw = document.getElementById('btn-open-rewatch');
    if (btnOpenRw) btnOpenRw.addEventListener('click', openRewatchDialog);
    var btnAddRwCard = document.getElementById('btn-add-rewatch-card');
    if (btnAddRwCard) btnAddRwCard.addEventListener('click', openRewatchDialog);

    var btnCancelRw = document.getElementById('btn-cancel-rewatch');
    if (btnCancelRw) {
      btnCancelRw.onclick = function () {
        document.getElementById('rewatch-modal').classList.remove('open');
      };
    }

    var btnSaveRw = document.getElementById('btn-save-rewatch');
    if (btnSaveRw) {
      btnSaveRw.onclick = function () {
        var rwDateVal = document.getElementById('rewatch-date').value;
        var rwRatingVal = document.getElementById('rewatch-rating').value;
        var rwNotesVal = document.getElementById('rewatch-notes').value.trim();

        var newRwItem = {
          id: 'rw_' + Date.now(),
          date: rwDateVal || new Date().toISOString().split('T')[0],
          rating: rwRatingVal ? Number(rwRatingVal) : null,
          notes: rwNotesVal
        };

        var currentRewatches = Array.isArray(e.rewatches) ? e.rewatches.slice() : [];
        currentRewatches.push(newRwItem);

        docRef.update({
          rewatches: currentRewatches,
          rewatchCount: currentRewatches.length,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function () {
          e.rewatches = currentRewatches;
          e.rewatchCount = currentRewatches.length;
          document.getElementById('rewatch-modal').classList.remove('open');
          render(e);
          AppUtils.showToast((isGame ? 'Re-play' : 'Re-watch') + ' logged ✓');
        }).catch(function (err) {
          console.error(err);
          AppUtils.showToast('Failed to save log.');
        });
      };
    }

    // Delete individual rewatch
    document.querySelectorAll('.btn-delete-rewatch').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var rwId = btn.dataset.rwId;
        if (!rwId) return;
        if (!window.confirm('Delete this diary log?')) return;

        var updatedRewatches = (e.rewatches || []).filter(function (rw) { return rw.id !== rwId; });
        docRef.update({
          rewatches: updatedRewatches,
          rewatchCount: updatedRewatches.length,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function () {
          e.rewatches = updatedRewatches;
          e.rewatchCount = updatedRewatches.length;
          render(e);
          AppUtils.showToast('Log removed');
        });
      });
    });
    var trackingButton = document.getElementById('btn-start-tracking');
    if (trackingButton) trackingButton.addEventListener('click', function () {
      if (!window.confirm('Move to Currently Playing and start timer?')) return;
      var now = new Date();
      AppDB.getOrCreatePlaylist(uid, 'Currently Playing', 'game').then(function (playlistId) {
        return AppDB.updateEntry(uid, entryId, {
          playlistId: playlistId,
          completionStatus: 'playing',
          monthWatched: now.getMonth() + 1,
          yearWatched: now.getFullYear()
        });
      }).then(function () {
        window.location.href = '/timer.html?game=' + encodeURIComponent(entryId) + '&start=1';
      }).catch(function (err) {
        console.error('Could not move game to Currently Playing.', err);
        AppUtils.showToast('Could not start tracking. Try again.');
      });
    });

    document.getElementById('btn-delete').addEventListener('click', function () {
      document.getElementById('delete-modal').classList.add('open');
    });
    document.getElementById('btn-confirm-delete').addEventListener('click', function () {
      var snap = Object.assign({}, e); delete snap.id;
      AppDB.deleteEntry(uid, entryId).then(function () {
        AppFlow.undo(uid, entryId, snap);
        window.location.href = '/playlist.html?id=' + e.playlistId;
      }).catch(function () {
        AppUtils.showToast('Failed to delete.');
      });
    });
    document.getElementById('btn-cancel-delete').addEventListener('click', function () {
      document.getElementById('delete-modal').classList.remove('open');
    });
  }

  var shareCanvas = null;

  document.getElementById('btn-close-share').addEventListener('click', function () {
    document.getElementById('share-modal').classList.remove('open');
  });

  document.getElementById('btn-download-share').addEventListener('click', function () {
    if (!shareCanvas) return;
    shareCanvas.toBlob(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'entry-share.png';
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  function generateShareCard(entry) {
    AppWrapped.generateEntryCard(entry, function (canvas) {
      shareCanvas = canvas;
      var wrap = document.getElementById('share-canvas-wrap');
      wrap.innerHTML = '';
      wrap.appendChild(canvas);
      document.getElementById('share-modal').classList.add('open');
    });
  }

  function openEdit(en) {
    var G = en.type === 'game', st = en.completionStatus, wl = st === 'wishlist', pl = G && st === 'playing';
    var now = new Date(), rating = (G ? en.gameRating : en.rating) || null, esc = AppUtils.esc;
    var M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var mo = M.map(function (m, i) { return '<option value="' + (i + 1) + '"' + (en.monthWatched === i + 1 ? ' selected' : '') + '>' + m + '</option>'; }).join('');
    var yr = '';
    for (var y = now.getFullYear(); y >= Math.min(2015, en.yearWatched || 2015); y--) yr += '<option' + (en.yearWatched === y ? ' selected' : '') + '>' + y + '</option>';
    var ov = document.createElement('div');
    ov.className = 'modal-overlay open';
    ov.innerHTML = '<div class="modal-box" style="max-height:90vh;overflow-y:auto"><p class="modal-title">Edit Details</p><p class="modal-entry-title">' + esc(en.title) + '</p>' +
      (wl ? '' : '<label class="label">' + (G ? 'Played' : 'Watched') + '</label><div style="display:flex;gap:8px;margin-bottom:16px"><select id="ed-m" class="input-field">' + mo + '</select><select id="ed-y" class="input-field">' + yr + '</select></div>') +
      (wl || pl ? '' : '<label class="label">Rating</label><div class="' + (G ? 'number-rating-row' : 'emoji-row') + '" id="ed-r" style="margin-bottom:16px"></div>') +
      (G && !wl ? '<label class="label">Hours played</label><input type="number" id="ed-h" class="input-field" min="0" max="9999" value="' + (Number(en.playtime) || '') + '" style="margin-bottom:16px">' : '') +
      (en.type === 'movie' && !wl ? '<label class="theatre-row"><span>Watched in theatre</span><span class="gs"><input type="checkbox" id="ed-t"' + (en.theatre ? ' checked' : '') + '><i></i></span></label>' : '') +
      (st === 'dropped' ? '<label class="label">Reason for dropping</label><textarea id="ed-d" class="input-field" rows="2" style="resize:none;margin-bottom:16px">' + esc(en.dropReason) + '</textarea>' : '') +
      '<label class="label">Review</label><textarea id="ed-v" class="input-field" rows="3" style="resize:none">' + esc(en.review) + '</textarea>' +
      '<div class="modal-actions"><button class="btn btn-ghost" id="ed-x">Cancel</button><button class="btn btn-primary" id="ed-ok">Save</button></div></div>';
    var q = function (s) { return ov.querySelector(s); }, row = q('#ed-r');
    if (row) for (var i = 1; i <= (G ? 10 : 5); i++) (function (n) {
      var b = document.createElement('button');
      b.className = G ? 'num-rating-btn' : 'emoji-btn';
      b.textContent = G ? n : AppUtils.ratingToEmoji(n);
      if (n === rating) b.classList.add('selected');
      b.onclick = function () {
        AppUtils.hapticRating();
        row.querySelectorAll('.selected').forEach(function (x) { x.classList.remove('selected'); });
        b.classList.add('selected'); rating = n;
      };
      row.appendChild(b);
    })(i);
    q('#ed-x').onclick = function () { ov.remove(); };
    ov.addEventListener('click', function (e2) { if (e2.target === ov) ov.remove(); });
    q('#ed-ok').onclick = function () {
      var d = { review: q('#ed-v').value.trim() || null };
      if (!wl) {
        var m = +q('#ed-m').value, yv = +q('#ed-y').value;
        if (yv === now.getFullYear() && m > now.getMonth() + 1) return AppUtils.showToast('Pick a past or current month.');
        d.monthWatched = m; d.yearWatched = yv;
      }
      if (row) {
        if (!G && !rating) return AppUtils.showToast('Pick a rating.');
        if (rating) d[G ? 'gameRating' : 'rating'] = rating;
      }
      if (q('#ed-h')) d.playtime = parseInt(q('#ed-h').value) || null;
      if (q('#ed-t')) d.theatre = q('#ed-t').checked;
      if (q('#ed-d')) d.dropReason = q('#ed-d').value.trim() || null;
      this.disabled = true;
      AppDB.updateEntry(uid, entryId, d).then(function () { location.reload(); })
        .catch(function () { AppUtils.showToast('Failed to save.'); });
    };
    document.body.appendChild(ov);
  }

  function openMoveModal(entry) {
    AppDB.getPlaylists(uid).then(function (playlists) {
      var relevant = playlists.filter(function (p) {
        var t = p.type || 'media';
        return entry.type === 'game' ? t === 'game' : t !== 'game';
      });
      var list = document.getElementById('move-playlist-list');
      list.innerHTML = relevant.map(function (p) {
        return '<button class="btn btn-ghost" data-pid="' + p.id + '" style="width:100%;margin-bottom:8px;text-align:left">' + AppUtils.esc(p.name) + '</button>';
      }).join('') || '<p class="text-sm text-muted">No other playlists yet.</p>';

      list.querySelectorAll('button[data-pid]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var pid = btn.dataset.pid;
          AppFlow.move(uid, entry, pid, btn.textContent).then(function (ok) {
            if (!ok) return;
            document.getElementById('move-modal').classList.remove('open');
            AppUtils.showToast('Moved ✓');
            window.location.href = '/playlist.html?id=' + pid;
          }).catch(function () {
            AppUtils.showToast('Failed to move.');
          });
        });
      });

      document.getElementById('move-modal').classList.add('open');
    });
  }

  document.getElementById('btn-cancel-move').addEventListener('click', function () {
    document.getElementById('move-modal').classList.remove('open');
  });

  var lbClose = document.getElementById('btn-close-lightbox');
  var lbModal = document.getElementById('lightbox-modal');
  if (lbClose && lbModal) {
    lbClose.addEventListener('click', function () { lbModal.classList.remove('open'); });
    lbModal.addEventListener('click', function (ev) { if (ev.target === lbModal) lbModal.classList.remove('open'); });
  }

  document.getElementById('btn-back').addEventListener('click', function () {
    window.history.back();
  });
});