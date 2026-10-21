// Home page logic
var ALL_ENTRIES = [];
var ALL_PLAYLISTS = [];
var ACTIVE_YEAR = 'all';
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

    var grid =
      document.getElementById(
        'playlists-grid'
      );

    grid.innerHTML = '';

    playlists = playlists.filter(function(p) {
      var t = p.type || 'media';
      return ACTIVE_TAB === 'games' ? t === 'game' : t !== 'game';
    });

    if (playlists.length === 0) {

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
      if (playlist.coverImage) {
        card.dataset.hasCover = '1';
        card.style.backgroundImage = 'url(' + playlist.coverImage + ')';
      }

      card.innerHTML = (

        '<p class="playlist-card-name">' +
        playlist.name +
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

      card.querySelector('.btn-playlist-menu').addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openPlaylistOptions(playlist);
      });

      grid.appendChild(card);

    });

  }

  function updateFabVisibility() {
    document.getElementById('fab-create').style.display = ACTIVE_TAB === 'games' ? 'none' : 'flex';
    document.getElementById('fab-add-game').style.display = ACTIVE_TAB === 'games' ? 'flex' : 'none';
  }

  document.getElementById('fab-add-game').addEventListener('click', function() {
    window.location.href = '/add.html?type=game';
  });

  document.getElementById('type-pills').addEventListener('click', function(e) {
    var btn = e.target.closest('.type-pill');
    if (!btn) return;
    document.querySelectorAll('.type-pill').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    ACTIVE_TAB = btn.dataset.tab === 'games' ? 'games' : 'media';
    localStorage.setItem('pl-last-tab', ACTIVE_TAB);
    var url = new URL(window.location.href);
    url.searchParams.set('tab', ACTIVE_TAB);
    window.history.replaceState({}, '', url);
    updateFabVisibility();
    applyYearFilter();
  });

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

      AppDB.createPlaylist(uid, name, createModal.dataset.type || 'media')

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
        var maxW = 600;
        var scale = Math.min(1, maxW / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        AppDB.updatePlaylistCover(uid, activePlaylist.id, dataUrl).then(function () {
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