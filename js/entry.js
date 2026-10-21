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
      rows.push(['Rating', AppUtils.ratingToEmoji(e.rating) + ' (' + e.rating + '/5)']);
      rows.push(['Watched', AppUtils.monthName(e.monthWatched) + ' ' + e.yearWatched]);
      if (e.runtime) rows.push(['Runtime', AppUtils.formatHours(e.runtime)]);
      if (e.season) rows.push(['Season', e.seasonName || ('S' + e.season)]);
    }
    if (e.rewatchCount) rows.push(['Rewatched', e.rewatchCount + ' time' + (e.rewatchCount > 1 ? 's' : '')]);
    if (e.releaseYear) rows.push(['Release Year', e.releaseYear]);
    if (e.genres && e.genres.length) rows.push(['Genres', e.genres.join(', ')]);
    if (e.review) rows.push(['Review', e.review]);

    var rowsHTML = rows.map(function (r) {
      return '<div class="detail-row"><span class="detail-label">' + r[0] + '</span><span class="detail-value">' + r[1] + '</span></div>';
    }).join('');

    document.getElementById('entry-content').innerHTML = (
      '<div class="detail-hero">' +
        (posterUrl ? '<img class="detail-poster" src="' + posterUrl + '" alt="' + e.title + '">' : '<div class="poster-placeholder" style="height:340px;border-radius:16px">' + (isGame ? '' : '🎬') + '</div>') +
      '</div>' +
      '<h2 style="margin:16px 0 4px">' + e.title + '</h2>' +
      '<p class="text-sm text-muted" style="margin-bottom:20px">' + (isGame ? ' Game' : e.type === 'series' ? '📺 Series' : '🎬 Movie') + '</p>' +
      '<div class="detail-card">' + rowsHTML + '</div>' +
      '<button class="btn btn-ghost" id="btn-share" style="margin-top:20px">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px">' +
          '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"></path>' +
          '<polyline points="16 6 12 2 8 6"></polyline>' +
          '<line x1="12" y1="2" x2="12" y2="15"></line>' +
        '</svg> Share Entry' +
      '</button>' +
      '<button class="btn btn-ghost" id="btn-move" style="margin-top:10px">↔ Move to Playlist</button>' +
      '<button class="btn btn-danger" id="btn-delete" style="margin-top:10px">Delete Entry</button>'
    );

    document.getElementById('btn-share').addEventListener('click', function () {
      generateShareCard(e);
    });

    document.getElementById('btn-move').addEventListener('click', function () {
      openMoveModal(e);
    });

    document.getElementById('btn-delete').addEventListener('click', function () {
      document.getElementById('delete-modal').classList.add('open');
    });
    document.getElementById('btn-confirm-delete').addEventListener('click', function () {
      AppDB.deleteEntry(uid, entryId).then(function () {
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
    var canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    var ctx = canvas.getContext('2d');
    var isGame = entry.type === 'game';
    var accent = isGame ? '#7c3aed' : '#c9a84c';

    function drawEverything(img) {
      ctx.fillStyle = '#0d0d0d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (img) {
        var scale = Math.max(canvas.width / img.width, canvas.height / img.height);
        var dw = img.width * scale, dh = img.height * scale;
        ctx.drawImage(img, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
      }
      var grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, 'rgba(10,10,10,0.25)');
      grad.addColorStop(0.55, 'rgba(10,10,10,0.55)');
      grad.addColorStop(1, 'rgba(8,8,8,0.96)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, canvas.width, 8);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 62px Inter, sans-serif';
      wrapText(entry.title, 70, 760, 940, 68, 2);
      ctx.font = '600 30px Inter, sans-serif';
      ctx.fillStyle = accent;
      var typeLabel = isGame ? ' Game' : entry.type === 'series' ? '📺 ' + (entry.seasonName || 'Series') : '🎬 Movie';
      ctx.fillText(typeLabel, 70, 830);
      ctx.font = 'bold 84px Inter, sans-serif';
      ctx.fillStyle = accent;
      var ratingText = '';
      if (isGame && entry.gameRating) ratingText = entry.gameRating + '/10';
      else if (!isGame && entry.rating) ratingText = AppUtils.ratingToEmoji(entry.rating);
      if (ratingText) ctx.fillText(ratingText, 70, 935);
      ctx.font = '500 32px Inter, sans-serif';
      ctx.fillStyle = '#dddddd';
      var meta = '';
      if (isGame && entry.completionStatus) {
        var stLabels = { completed: 'Completed', playing: 'Playing', dropped: 'Dropped', wishlist: 'Wishlist' };
        meta = stLabels[entry.completionStatus] || '';
        if (entry.playtime) meta += ' · ' + entry.playtime + 'h played';
      } else if (entry.monthWatched) {
        meta = AppUtils.monthName(entry.monthWatched) + ' ' + (entry.yearWatched || '');
      }
      if (meta) ctx.fillText(meta, 70, 985);
      ctx.font = '500 26px Inter, sans-serif';
      ctx.fillStyle = '#999999';
      ctx.fillText('Logged on Playlog', 70, 1040);
      canvas.style.width = '100%';
      canvas.style.borderRadius = '8px';
      shareCanvas = canvas;
      var wrap = document.getElementById('share-canvas-wrap');
      wrap.innerHTML = '';
      wrap.appendChild(canvas);
      document.getElementById('share-modal').classList.add('open');
    }

    function wrapText(text, x, yBottom, maxWidth, lineHeight, maxLines) {
      var words = text.split(' ');
      var lines = [];
      var current = '';
      for (var i = 0; i < words.length; i++) {
        var test = current ? current + ' ' + words[i] : words[i];
        if (ctx.measureText(test).width > maxWidth && current) {
          lines.push(current);
          current = words[i];
        } else {
          current = test;
        }
      }
      if (current) lines.push(current);
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…';
      }
      var startY = yBottom - (lines.length - 1) * lineHeight;
      lines.forEach(function (line, i) {
        ctx.fillText(line, x, startY + i * lineHeight);
      });
    }

    var posterUrl = AppUtils.getPosterUrl(entry.poster);
    if (posterUrl) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { drawEverything(img); };
      img.onerror = function () { drawEverything(null); };
      img.src = AppUtils.getCanvasSafeUrl(posterUrl);
    } else {
      drawEverything(null);
    }
  }

  function openMoveModal(entry) {
    AppDB.getPlaylists(uid).then(function (playlists) {
      var relevant = playlists.filter(function (p) {
        var t = p.type || 'media';
        return entry.type === 'game' ? t === 'game' : t !== 'game';
      });
      var list = document.getElementById('move-playlist-list');
      list.innerHTML = relevant.map(function (p) {
        return '<button class="btn btn-ghost" data-pid="' + p.id + '" style="width:100%;margin-bottom:8px;text-align:left">' + p.name + '</button>';
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

  document.getElementById('btn-back').addEventListener('click', function () {
    window.history.back();
  });
});