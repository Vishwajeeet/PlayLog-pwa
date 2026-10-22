// Home page logic
var ALL_ENTRIES = [];
var ALL_PLAYLISTS = [];
var ACTIVE_YEAR = 'all';
var COVERS = {};
setTimeout(function () { AppUtils.booksPill(); }, 0);
sessionStorage.removeItem('pl-back');
var _tp = new URLSearchParams(window.location.search).get('tab');
var _dp = localStorage.getItem('pl-tab-pref') || 'media';
if (_dp === 'last') _dp = localStorage.getItem('pl-last-tab') || 'media';
var ACTIVE_TAB = (_tp || _dp) === 'games' ? 'games' : 'media';
AppAuth.requireAuth(function(user) {

  var uid = user.uid;

  var grid =
    document.getElementById('playlists-grid');

  grid.innerHTML = (
    '<div class="skeleton" style="height:140px;border-radius:12px"></div>' +
    '<div class="skeleton" style="height:140px;border-radius:12px"></div>' +
    '<div class="skeleton" style="height:140px;border-radius:12px"></div>' +
    '<div class="skeleton" style="height:140px;border-radius:12px"></div>'
  );

  Promise.all([
    AppDB.getPlaylists(uid),
    AppDB.getAllEntries(uid)
  ])
    .then(function(results) {

        var playlists = results[0];
        var entries = results[1];

        ALL_PLAYLISTS = playlists;

        ALL_ENTRIES = entries;
        playlists.forEach(function (p) { if (p.coverImage) COVERS[p.id] = p.coverImage; });
        AppDB.getCovers(uid).then(function (m) {
          var n = 0; Object.keys(m).forEach(function (k) { COVERS[k] = m[k]; n++; });
          if (n) applyYearFilter();
        }).catch(function () {});

        document.querySelector('.type-pill[data-tab="' + ACTIVE_TAB + '"]').classList.add('active');

        updateFabVisibility();

        renderYearFilters(entries);

        applyYearFilter();

      })
    .catch(function(err) {

      console.error(err);

      AppUtils.showToast(
        'Failed to load. Refresh page.'
      );

    });

  function renderStats(playlists, entries) {

    entries = entries.filter(function(e) {
      var isGame = e.type === 'game';
      return (ACTIVE_TAB === 'games' ? isGame : !isGame) && e.completionStatus !== 'wishlist';
    });

    var totalEntries =
      entries.length;

    var isGamesTab = ACTIVE_TAB === 'games';

    var totalRuntime =
      entries.reduce(function(s, e) {
        return s + (isGamesTab ? (e.playtime || 0) * 60 : (e.runtime || 0));
      }, 0);

    var currentMonth =
      AppUtils.getCurrentMonth();

    var currentYear =
      AppUtils.getCurrentYear();

    var thisMonthCount =
      entries.filter(function(e) {

        return (
          e.monthWatched === currentMonth &&
          e.yearWatched === currentYear
        );

      }).length;

    var movieCount =
      entries.filter(function(e) {
        return e.type === 'movie';
      }).length;

    var seriesCount =
      entries.filter(function(e) {
        return e.type === 'series';
      }).length;

    document.getElementById(
      'stat-total'
    ).textContent = totalEntries;

    var totalDays = (totalRuntime / 60 / 24);

    var daysDisplay = '';

    if (totalDays < 1) {

      daysDisplay =
        AppUtils.formatHours(totalRuntime);

    } else {

      daysDisplay =
        totalDays.toFixed(1) + ' days';

    }

    document.getElementById(
      'stat-hours'
    ).textContent = daysDisplay;

    document.getElementById('stat-hours-label').textContent =
      isGamesTab
        ? (totalDays < 1 ? 'Hours Played' : 'Days Played')
        : (totalDays < 1 ? 'Hours' : 'Days');

    document.getElementById(
      'stat-month'
    ).textContent =
      thisMonthCount;

    var gameCount = entries.filter(function(e) { return e.type === 'game'; }).length;
    var completedGameCount = entries.filter(function(e) { return e.type === 'game' && e.completionStatus === 'completed'; }).length;

    if (ACTIVE_TAB === 'games') {
      document.getElementById('stat-type').textContent = completedGameCount;
      document.getElementById('stat-type-label').textContent = 'Completed';
    } else {
      document.getElementById('stat-type').textContent = movieCount + ' · ' + seriesCount;
      document.getElementById('stat-type-label').textContent = 'Movies · Series';
    }

    document.getElementById(
      'fun-fact'
    ).textContent =
      AppUtils.computeFunFact(
        entries,
        playlists.length
      );

  }
  function renderYearFilters(entries) {

  var wrap =
    document.getElementById(
      'year-filters'
    );

  wrap.innerHTML = '';

  var years = [];

  entries.forEach(function(e) {

    if (
      e.yearWatched &&
      years.indexOf(e.yearWatched) === -1
    ) {

      years.push(e.yearWatched);

    }

  });

  years.sort(function(a, b) {

    return b - a;

  });

  years.unshift('all');

  years.forEach(function(year) {

    var btn =
      document.createElement('button');

    btn.className =
      'year-chip';

    if (year === ACTIVE_YEAR) {

      btn.classList.add('active');

    }

    btn.textContent =
      year === 'all'
      ? 'All'
      : year;

    btn.addEventListener(
      'click',
      function() {

        ACTIVE_YEAR = year;

        renderYearFilters(
          ALL_ENTRIES
        );

        applyYearFilter();

      }
    );

    wrap.appendChild(btn);

  });

}
function renderHome() {
  var list = ALL_ENTRIES.filter(function (e) { return (e.type === 'game') === (ACTIVE_TAB === 'games'); });
  var wrap = document.getElementById('recent-wrap');
  if (!wrap) {
    wrap = document.createElement('section');
    wrap.id = 'recent-wrap';
    wrap.innerHTML = '<p class="section-title">Recently Added</p><div id="recent-row" class="recent-row"></div>';
    var sec = document.getElementById('playlists-grid').parentNode;
    sec.parentNode.insertBefore(wrap, sec);
  }
  var row = document.getElementById('recent-row');
  var top = list[0];
  AppUtils.setAmbient(top && top.poster);
  wrap.style.display = list.length ? 'block' : 'none';
  row.innerHTML = '';
  list.slice(0, 7).forEach(function (e) {
    var a = document.createElement('a');
    a.className = 'recent-item';
    a.href = '/entry.html?id=' + e.id;
    var u = AppUtils.getPosterUrl(e.poster, 342);
    if (u) {
      var im = document.createElement('img');
      im.loading = 'lazy'; im.alt = ''; im.src = u;
      a.appendChild(im);
    }
    if (e.completionStatus === 'wishlist') {
      var wb = document.createElement('em');
      wb.className = 'recent-badge';
      wb.textContent = 'Wishlist';
      a.appendChild(wb);
    }
    var s = document.createElement('span');
    s.textContent = e.title;
    a.appendChild(s);
    row.appendChild(a);
  });
}

function applyYearFilter() {
  renderHome();

  var filteredEntries =
    ACTIVE_YEAR === 'all'

    ? ALL_ENTRIES

    : ALL_ENTRIES.filter(
        function(e) {

          return (
            !e.yearWatched ||
            e.yearWatched ==
            ACTIVE_YEAR
          );

        }
      );

  renderStats(
    ALL_PLAYLISTS,
    filteredEntries
  );

  renderPlaylists(
    ALL_PLAYLISTS,
    filteredEntries
  );

}

  function renderPlaylists(playlists, entries) {
    renderPlaylists0(playlists, entries);
    addNewTile();
  }

  function renderPlaylists0(playlists, entries) {

    var grid =
      document.getElementById(
        'playlists-grid'
      );

    grid.innerHTML = '';

    playlists = playlists.filter(function(p) {
      var t = p.type || 'media';
      return ACTIVE_TAB === 'games' ? t === 'game' : t !== 'game';
    });

    if (playlists.length === 0 && ACTIVE_TAB === 'games') {

      document.getElementById(
        'empty-playlists'
      ).style.display = 'block';

      grid.style.display = 'none';

      return;
    }

    document.getElementById(
      'empty-playlists'
    ).style.display = 'none';

    grid.style.display = 'grid';

    playlists.forEach(function(playlist) {

      var card =
        document.createElement('a');

      card.className =
        'playlist-card';

      card.href =
        '/playlist.html?id=' + playlist.id;

      var playlistEntries =
        entries.filter(function(e) {

          return (
            e.playlistId === playlist.id
          );

        });

      var count =
        playlistEntries.length;

      var last3 =
        playlistEntries.slice(0, 3);

      var miniPostersHTML =
        last3.map(function(e) {

          return (
            '<img ' +
            'class="mini-poster" ' +
            'src="' +
            AppUtils.getPosterUrl(e.poster, 154) +
            '" ' +
            'onerror="this.style.visibility=\'hidden\'">'
          );

        }).join('');

      while (last3.length < 3) {

        miniPostersHTML += (
          '<div class="mini-poster"></div>'
        );

        last3.push({});
      }

      var artSrc = last3[0] && last3[0].poster ? AppUtils.ambientUrl(last3[0].poster) : '';
      if (artSrc) card.style.setProperty('--art', 'url("' + artSrc + '")');
      if (!playlist.coverImage && COVERS[playlist.id]) playlist.coverImage = COVERS[playlist.id];
      if (playlist.coverImage) {
        card.dataset.hasCover = '1';
        card.style.backgroundImage = 'url(' + playlist.coverImage + ')';
      }

      card.innerHTML = (

        '<p class="playlist-card-name">' +
        AppUtils.esc(playlist.name) +
        '</p>' +

        '<p class="playlist-card-count">' +
        count +
        ' title' +
        (count !== 1 ? 's' : '') +
        '</p>' +

        '<div class="mini-posters">' +
        miniPostersHTML +
        '</div>' +

        '<button class="btn-playlist-menu" data-playlist-id="' + playlist.id + '">⋮</button>'

      );

      card.dataset.pid = playlist.id;
      card.setAttribute('draggable', 'false');
      card.querySelector('.btn-playlist-menu').addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openPlaylistOptions(playlist);
      });

      grid.appendChild(card);

    });

  }

  function updateFabVisibility() {
    document.getElementById('fab-create').style.display = 'none';
    document.getElementById('fab-add-game').style.display = 'flex';
  }

  document.getElementById('fab-add-game').addEventListener('click', function() {
    if (ACTIVE_TAB === 'games') { window.location.href = '/add.html?type=game'; return; }
    var mp = ALL_PLAYLISTS.filter(function (p) { return (p.type || 'media') !== 'game'; });
    if (!mp.length) { openCreate(true); return; }
    window.location.href = '/add.html?type=media';
  });

  // Swipe left/right to switch Movies <-> Games
  (function () {
    var sx = 0, sy = 0, skip = false;
    document.addEventListener('touchstart', function (e) {
      var t = e.touches[0]; sx = t.clientX; sy = t.clientY;
      skip = e.touches.length > 1 || !!(e.target.closest && e.target.closest('.recent-row,#year-filters,.modal-overlay,input,textarea,select'));
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (skip || document.querySelector('.modal-overlay.open') || Date.now() - (window.__plMoved || 0) < 700) return;
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;
      var want = dx < 0 ? 'games' : 'media';
      if (want === ACTIVE_TAB) return;
      document.querySelector('.type-pill[data-tab="' + want + '"]').click();
      ['.stat-strip', '#playlists-grid', '#recent-wrap'].forEach(function (s) {
        var n = document.querySelector(s); if (!n) return;
        n.classList.remove('sw-l', 'sw-r'); void n.offsetWidth; n.classList.add(dx < 0 ? 'sw-l' : 'sw-r');
      });
    }, { passive: true });
  })();

  document.getElementById('type-pills').addEventListener('click', function(e) {
    var btn = e.target.closest('.type-pill');
    if (!btn) return;
    document.querySelectorAll('.type-pill').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    if (btn.dataset.tab === 'books') { window.location.href = '/books.html'; return; }
    ACTIVE_TAB = btn.dataset.tab === 'games' ? 'games' : 'media';
    localStorage.setItem('pl-last-tab', ACTIVE_TAB);
    var url = new URL(window.location.href);
    url.searchParams.set('tab', ACTIVE_TAB);
    window.history.replaceState({}, '', url);
    updateFabVisibility();
    applyYearFilter();
  });

  (function () {
    var bar = document.getElementById('type-pills');
    var lastY = window.scrollY;
    var threshold = 8;
    window.addEventListener('scroll', function () {
      if (window.innerWidth > 700) {
        bar.classList.remove('is-hidden');
        lastY = window.scrollY;
        return;
      }
      if (document.querySelector('.modal-overlay.open')) {
        lastY = window.scrollY;
        return;
      }
      var y = window.scrollY;
      if (y < 80) {
        bar.classList.remove('is-hidden');
        lastY = y;
      } else if (y < lastY - threshold) {
        bar.classList.remove('is-hidden');
        lastY = y;
      } else if (y > lastY + threshold && y > 120) {
        bar.classList.add('is-hidden');
        lastY = y;
      }
    }, { passive: true });
  })();

  var goAddAfter = false;

  function openCreate(go) {
    goAddAfter = !!go;
    var m = document.getElementById('create-modal');
    m.dataset.type = 'media';
    m.classList.add('open');
  }

  function addNewTile() {
    if (ACTIVE_TAB === 'games') return;
    var t = document.createElement('button');
    t.type = 'button';
    t.className = 'playlist-card new-tile';
    t.innerHTML = '<span>+</span>New Playlist';
    t.addEventListener('click', function () { openCreate(false); });
    grid.appendChild(t);
  }

  // Hold a playlist, then drag it to a new position
  (function () {
    var T, d = null, sx = 0, sy = 0, moved = false;
    function cardOf(t) { return t && t.closest ? t.closest('.playlist-card[data-pid]') : null; }

    function place() {
      var el = document.elementFromPoint(d.px, d.py), t = cardOf(el);
      if (t && t !== d.c) {
        var kids = Array.prototype.slice.call(grid.children);
        if (kids.indexOf(d.c) < kids.indexOf(t)) grid.insertBefore(d.c, t.nextSibling);
        else grid.insertBefore(d.c, t);
      }
      var r = d.c.getBoundingClientRect();
      d.tx = d.px - d.gx - (r.left - d.tx);
      d.ty = d.py - d.gy - (r.top - d.ty);
      d.c.style.transform = 'translate(' + d.tx + 'px,' + d.ty + 'px) scale(1.04)';
    }

    function end() {
      clearTimeout(T);
      if (!d) return;
      var c = d.c; d = null;
      moved = true;
      window.__plMoved = Date.now();
      setTimeout(function () { moved = false; }, 400);
      c.classList.remove('pl-drag');
      c.style.transform = '';
      c.style.pointerEvents = '';
      var ids = Array.prototype.map.call(grid.querySelectorAll('.playlist-card[data-pid]'), function (n) { return n.dataset.pid; });
      ids.forEach(function (id, i) {
        var p = ALL_PLAYLISTS.filter(function (x) { return x.id === id; })[0];
        if (p) p.order = i;
      });
      ALL_PLAYLISTS.sort(function (a, b) {
        return (a.order != null ? a.order : 1e6) - (b.order != null ? b.order : 1e6);
      });
      AppDB.reorderPlaylists(uid, ids).catch(function () { AppUtils.showToast('Failed to save order.'); });
    }

    grid.addEventListener('contextmenu', function (e) { if (cardOf(e.target)) e.preventDefault(); });
    grid.addEventListener('click', function (e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
    }, true);
    grid.addEventListener('touchmove', function (e) { if (d) e.preventDefault(); }, { passive: false });

    grid.addEventListener('pointerdown', function (e) {
      var c = cardOf(e.target);
      if (!c || e.target.closest('.btn-playlist-menu') || (e.pointerType === 'mouse' && e.button !== 0)) return;
      sx = e.clientX; sy = e.clientY;
      var pid = e.pointerId;
      clearTimeout(T);
      T = setTimeout(function () {
        var r = c.getBoundingClientRect();
        d = { c: c, gx: sx - r.left, gy: sy - r.top, tx: 0, ty: 0, px: sx, py: sy };
        try { grid.setPointerCapture(pid); } catch (x) {}
        c.classList.add('pl-drag');
        c.style.pointerEvents = 'none';
        c.style.transform = 'scale(1.04)';
        if (navigator.vibrate) navigator.vibrate(15);
        place();
      }, 380);
    });

    grid.addEventListener('pointermove', function (e) {
      if (!d) {
        if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) clearTimeout(T);
        return;
      }
      e.preventDefault();
      d.px = e.clientX; d.py = e.clientY;
      if (e.clientY < 90) window.scrollBy(0, -14);
      else if (e.clientY > window.innerHeight - 90) window.scrollBy(0, 14);
      place();
    });

    grid.addEventListener('pointerup', end);
    grid.addEventListener('pointercancel', end);
  })();

  var createModal =
    document.getElementById(
      'create-modal'
    );

  var input =
    document.getElementById(
      'playlist-name-input'
    );

  var createBtn =
    document.getElementById(
      'btn-create-playlist'
    );

  document.getElementById(
    'fab-create'
  ).addEventListener('click', function() {

    createModal.classList.add('open');
    createModal.dataset.type = ACTIVE_TAB === 'games' ? 'game' : 'media';

  });

  document.getElementById(
    'btn-cancel-modal'
  ).addEventListener('click', function() {

    createModal.classList.remove('open');

    input.value = '';

    createBtn.disabled = true;

  });

  input.addEventListener('input', function() {

    createBtn.disabled =
      input.value.trim() === '';

  });

  createBtn.addEventListener(
    'click',
    function() {

      var name =
        input.value.trim();

      if (!name) return;

      createBtn.disabled = true;

      createBtn.textContent =
        'Creating...';

      AppDB.createPlaylist(uid, name, createModal.dataset.type || 'media').then(function (r) {
        if (goAddAfter) {
          window.location.href = '/add.html?type=media&playlistId=' + r.id;
          return new Promise(function () {});
        }
      })

        .then(function() {

          createModal.classList.remove(
            'open'
          );

          input.value = '';

          createBtn.disabled = true;

          createBtn.textContent =
            'Create';

          AppUtils.showToast(
            'Playlist created ✓'
          );

          return Promise.all([
            AppDB.getPlaylists(uid),
            AppDB.getAllEntries(uid)
          ]);

        })

        .then(function(results) {

          ALL_PLAYLISTS =
            results[0];

          ALL_ENTRIES =
            results[1];

          renderYearFilters(
            ALL_ENTRIES
          );

          applyYearFilter();

        })

        .catch(function(err) {

          console.error(err);

          AppUtils.showToast(
            'Failed. Try again.'
          );

          createBtn.disabled = false;

          createBtn.textContent =
            'Create';

        });

    }
  );

  document.getElementById(
    'btn-stats'
  ).addEventListener('click', function() {

    window.location.href =
      '/stats.html';

  });
    var activePlaylist = null;
  var optionsModal = document.getElementById('playlist-options-modal');
  var renameInput = document.getElementById('rename-input');

  function openPlaylistOptions(playlist) {
    activePlaylist = playlist;
    renameInput.value = playlist.name;
    optionsModal.classList.add('open');
  }

  document.getElementById('btn-close-playlist-options').addEventListener('click', function () {
    optionsModal.classList.remove('open');
  });

  document.getElementById('btn-save-rename').addEventListener('click', function () {
    var name = renameInput.value.trim();
    if (!name || !activePlaylist) return;
    AppDB.updatePlaylistName(uid, activePlaylist.id, name).then(function () {
      optionsModal.classList.remove('open');
      AppUtils.showToast('Renamed ✓');
      return AppDB.getPlaylists(uid);
    }).then(function (playlists) {
      ALL_PLAYLISTS = playlists;
      applyYearFilter();
    });
  });

  document.getElementById('btn-change-cover').addEventListener('click', function () {
    document.getElementById('cover-file-input').click();
  });

  document.getElementById('cover-file-input').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file || !activePlaylist) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        var maxW = 400;
        var scale = Math.min(1, maxW / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        AppDB.updatePlaylistCover(uid, activePlaylist.id, dataUrl).then(function () {
          COVERS[activePlaylist.id] = dataUrl;
          optionsModal.classList.remove('open');
          AppUtils.showToast('Cover updated ✓');
          return AppDB.getPlaylists(uid);
        }).then(function (playlists) {
          ALL_PLAYLISTS = playlists;
          applyYearFilter();
        });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('btn-delete-playlist').addEventListener('click', function () {
    optionsModal.classList.remove('open');
    document.getElementById('delete-playlist-confirm').classList.add('open');
  });

  document.getElementById('btn-cancel-delete-playlist').addEventListener('click', function () {
    document.getElementById('delete-playlist-confirm').classList.remove('open');
  });

  document.getElementById('btn-confirm-delete-playlist').addEventListener('click', function () {
    if (!activePlaylist) return;
    AppDB.deletePlaylist(uid, activePlaylist.id).then(function () {
      document.getElementById('delete-playlist-confirm').classList.remove('open');
      AppUtils.showToast('Playlist deleted');
      return Promise.all([AppDB.getPlaylists(uid), AppDB.getAllEntries(uid)]);
    }).then(function (results) {
      ALL_PLAYLISTS = results[0];
      ALL_ENTRIES = results[1];
      renderYearFilters(ALL_ENTRIES);
      applyYearFilter();
    });
  });

  var _so = document.getElementById('btn-signout');
  if (_so) _so.addEventListener('click', function() {
    document.getElementById('logout-modal').classList.add('open');
  });

  document.getElementById('btn-cancel-logout').addEventListener('click', function() {
    document.getElementById('logout-modal').classList.remove('open');
  });

  document.getElementById('btn-confirm-logout').addEventListener('click', function() {
    AppAuth.signOut().then(function() {
      window.location.href = '/index.html';
    });
  });

});