// Add entry flow — movies, series, games
var state = {
  type: 'movie',
  selectedResult: null,
  selectedSeason: null,
  playlistId: null,
  uid: null,
  selectedMonth: null,
  selectedYear: null,
  selectedRating: null,
  selectedGameRating: null,
  selectedStatus: null,
  selectedCategory: null,
  searchToken: 0,
  lastQuery: ''
};

state.playlistId = new URLSearchParams(window.location.search).get('playlistId');
var forcedTypeParam = new URLSearchParams(window.location.search).get('type');
if (!state.playlistId && !forcedTypeParam) window.location.href = '/home.html';

AppAuth.requireAuth(function(user) {
  state.uid = user.uid;
  state.existingEntries = [];
  AppDB.getAllEntries(user.uid).then(function(entries) {
    state.existingEntries = entries;
  });
  initPage();
});

function rewatchGate(r, seasonNum) {
  var ex = state.existingEntries.filter(function (e) {
    return r.type === 'series'
      ? e.type === 'series' && e.tmdbId === r.tmdbId && e.season === seasonNum
      : e.type === 'movie' && e.tmdbId === r.tmdbId;
  })[0];
  if (!ex) return false;
  AppFlow.rewatch(r.title).then(function (v) {
    if (v === 'new') return showStep3();
    if (v !== 'yes') return;
    AppDB.updateEntry(state.uid, ex.id, { rewatchCount: (ex.rewatchCount || 0) + 1 }).then(function () {
      sessionStorage.setItem('pl-back', '/home.html');
      window.location.replace('/playlist.html?id=' + ex.playlistId);
    }).catch(function () { AppUtils.showToast('Failed. Try again.'); });
  });
  return true;
}

function findDuplicate(r, seasonNum) {
  return state.existingEntries.some(function(e) {
    if (r.type === 'game') return e.type === 'game' && e.rawgId === r.rawgId;
    if (r.type === 'series') return e.type === 'series' && e.tmdbId === r.tmdbId && e.season === seasonNum;
    return e.type === 'movie' && e.tmdbId === r.tmdbId;
  });
}

function initPage() {
  var forcedType = new URLSearchParams(window.location.search).get('type');

  // Apply the tab visibility synchronously (no promise/microtask delay) when
  // we already know the type from the URL, so there's no flash of the wrong
  // (Movie) tab before switching to Game.
  if (forcedType) {
    document.querySelectorAll('.media-tab').forEach(function(btn) {
      var isGameTab = btn.dataset.type === 'game';
      btn.style.display = (forcedType === 'game') === isGameTab ? '' : 'none';
    });
    var tabsWrapSync = document.querySelector('.media-type-tabs');
    if (tabsWrapSync) tabsWrapSync.style.display = forcedType === 'game' ? 'none' : 'flex';
  }

  var typePromise = forcedType
    ? Promise.resolve(forcedType)
    : db.collection('users').doc(state.uid)
        .collection('playlists').doc(state.playlistId)
        .get().then(function(doc) { return (doc.exists && doc.data().type) || 'media'; });

  typePromise.then(function(playlistType) {
      state.type = playlistType === 'game' ? 'game' : 'movie';
      document.getElementById('step1-heading').textContent = state.type === 'game' ? 'What did you play?' : 'What did you watch?';

      document.querySelectorAll('.media-tab').forEach(function(btn) {
        var isGameTab = btn.dataset.type === 'game';
        btn.style.display = (playlistType === 'game') === isGameTab ? '' : 'none';
        btn.classList.toggle('active', btn.dataset.type === state.type);
      });

      // Games only ever offer one tab (Game) — no point showing a tab bar
      // to switch between options that don't exist. Hide it entirely.
      var tabsWrap = document.querySelector('.media-type-tabs');
      if (tabsWrap) tabsWrap.style.display = playlistType === 'game' ? 'none' : 'flex';
    });

  buildYearSelect('year-select', 'selectedYear');
  buildYearSelect('game-year-select', 'gameYear');
  buildMonthChips('month-chips', 'selectedMonth', 'selectedYear');
  buildMonthChips('game-month-chips', 'gameMonth', 'gameYear');
  buildEmojiRow();
  buildNumberRatingRow();
  setupSearch();
  setupMediaTabs();
  setupBackButtons();
  setupCompletionButtons();
}

function setupMediaTabs() {
  document.querySelectorAll('.media-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.media-tab').forEach(function(b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      state.type = btn.dataset.type;
      var heading = document.getElementById('step1-heading');
      heading.textContent = state.type === 'game' ? 'What did you play?' : 'What did you watch?';
      clearSearch();
    });
  });
}

function showStep(n) {
  document.querySelectorAll('.step').forEach(function(s) {
    s.classList.remove('active');
  });
  document.getElementById('step-' + n).classList.add('active');
}

function buildYearSelect(elId, stateKey) {
  var select = document.getElementById(elId);
  if (!select) return;
  select.innerHTML = '';
  var currentYear = new Date().getFullYear();
  for (var y = currentYear; y >= 2015; y--) {
    var opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    select.appendChild(opt);
  }
  state[stateKey] = currentYear;
  select.value = currentYear;
  select.addEventListener('change', function() {
    state[stateKey] = parseInt(this.value);
    if (elId === 'year-select') buildMonthChips('month-chips', 'selectedMonth', 'selectedYear');
    if (elId === 'game-year-select') buildMonthChips('game-month-chips', 'gameMonth', 'gameYear');
  });
}

function buildMonthChips(containerId, monthKey, yearKey) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var now = new Date();
  var currentMonth = now.getMonth() + 1;
  var currentYear = now.getFullYear();

  months.forEach(function(m, i) {
    var btn = document.createElement('button');
    var monthNum = i + 1;
    btn.className = 'month-chip';
    btn.textContent = m;
    btn.dataset.month = monthNum;
    var isFuture = state[yearKey] === currentYear && monthNum > currentMonth;
    if (isFuture) {
      btn.classList.add('chip-disabled');
    } else {
      btn.addEventListener('click', function() {
        container.querySelectorAll('.month-chip').forEach(function(c) {
          c.classList.remove('selected');
        });
        btn.classList.add('selected');
        state[monthKey] = monthNum;
        checkCanAdd();
      });
    }
    container.appendChild(btn);
  });
}

function buildEmojiRow() {
  var row = document.getElementById('emoji-row');
  row.innerHTML = '';
  var emojis = ['😭','🙁','😐','😊','🤩'];
  emojis.forEach(function(emoji, i) {
    var btn = document.createElement('button');
    btn.className = 'emoji-btn';
    btn.textContent = emoji;
    btn.addEventListener('click', function() {
      row.querySelectorAll('.emoji-btn').forEach(function(b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
      state.selectedRating = i + 1;
      checkCanAdd();
    });
    row.appendChild(btn);
  });
}

function buildNumberRatingRow() {
  var row = document.getElementById('number-rating-row');
  row.innerHTML = '';
  for (var i = 1; i <= 10; i++) {
    (function(num) {
      var btn = document.createElement('button');
      btn.className = 'num-rating-btn';
      btn.textContent = num;
      btn.addEventListener('click', function() {
        row.querySelectorAll('.num-rating-btn').forEach(function(b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
        state.selectedGameRating = num;
        checkCanAdd();
      });
      row.appendChild(btn);
    })(i);
  }
}


function setupCompletionButtons() {
  document.querySelectorAll('.completion-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.completion-btn').forEach(function(b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
      state.selectedStatus = btn.dataset.status;
      applyStatusFields();
      checkCanAdd();
    });
  });
}

function applyStatusFields() {
  var status = state.selectedStatus;
  var extra = document.getElementById('game-extra-fields');
  var ratingRow = document.getElementById('number-rating-row');
  var ratingLabel = ratingRow.previousElementSibling;
  var reasonLabel = document.getElementById('reason-label');
  var reasonInput = document.getElementById('reason-input');

  extra.style.display = status === 'wishlist' ? 'none' : 'block';
  reasonLabel.style.display = status === 'dropped' ? 'block' : 'none';
  reasonInput.style.display = status === 'dropped' ? 'block' : 'none';
  if (status === 'wishlist') return;

  var hideRating = status === 'playing';
  ratingRow.style.display = hideRating ? 'none' : 'flex';
  ratingLabel.style.display = hideRating ? 'none' : 'block';

  if (status === 'playing') {
    var now = new Date();
    state.gameYear = now.getFullYear();
    document.getElementById('game-year-select').value = state.gameYear;
    buildMonthChips('game-month-chips', 'gameMonth', 'gameYear');
    state.gameMonth = now.getMonth() + 1;
    var chip = document.querySelector('#game-month-chips .month-chip[data-month="' + state.gameMonth + '"]');
    if (chip) chip.classList.add('selected');
  }
}

function checkCanAdd() {
  var canAdd = false;
  if (state.type === 'game') {
    canAdd = !!state.selectedStatus && (state.selectedStatus === 'wishlist' || state.selectedStatus === 'playing' || !!state.gameMonth);
  } else {
    canAdd = !!(state.selectedMonth && state.selectedRating);
  }
  document.getElementById('btn-add').disabled = !canAdd;
}

function setupSearch() {
  var input = document.getElementById('search-input');
  var debouncedSearch = AppUtils.debounce(function(query) { doSearch(query); }, 300);
  input.addEventListener('input', function() {
    var query = this.value.trim();
    if (query.length < 2) {
      state.lastQuery = '';
      document.getElementById('search-results').innerHTML = '';
      document.getElementById('search-status').textContent = '';
      return;
    }
    if (query === state.lastQuery) return;
    state.lastQuery = query;
    document.getElementById('search-status').textContent = 'Searching...';
    debouncedSearch(query);
  });
}

function doSearch(query) {
  var token = ++state.searchToken;
  var fn;
  if (state.type === 'movie') fn = AppTMDB.searchMovies.bind(AppTMDB);
  else if (state.type === 'series') fn = AppTMDB.searchSeries.bind(AppTMDB);
  else fn = AppRAWG.searchGames.bind(AppRAWG);

  fn(query).then(function(results) {
    if (token !== state.searchToken) return;
    document.getElementById('search-status').textContent = '';
    renderResults(results);
  }).catch(function(err) {
    if (token !== state.searchToken) return;
    console.error(err);
    document.getElementById('search-status').textContent = 'Search failed. Check connection.';
    document.getElementById('search-results').innerHTML = '';
  });
}

function renderResults(results) {
  var container = document.getElementById('search-results');
  container.innerHTML = '';
  if (!results || results.length === 0) {
    container.innerHTML = '<p class="text-sm text-muted" style="padding:12px 0">No results found.</p>';
    return;
  }
  results.forEach(function(r) {
    var item = document.createElement('div');
    item.className = 'result-item';
    var posterUrl = AppUtils.getPosterUrl(r.poster);
    var typeLabel = r.type === 'movie' ? 'Movie' : r.type === 'series' ? 'Series' : 'Game';
    var isDup = r.type !== 'series' && findDuplicate(r);
    item.innerHTML = (
      '<img class="result-thumb" src="' + (posterUrl || '') + '" alt="' + r.title + '" onerror="this.style.background=\'#2a2a2a\'">' +
      '<div class="result-info">' +
        '<p class="result-title">' + r.title + '</p>' +
        '<p class="result-meta">' + (r.releaseYear || '—') + ' · ' + typeLabel +
          (isDup ? ' · <span style="color:var(--accent)">✓ Already added</span>' : '') + '</p>' +
      '</div>'
    );
    item.addEventListener('click', function() {
      state.selectedResult = r;
      state.selectedSeason = null;
      state.selectedMonth = null;
      state.selectedRating = null;
      state.selectedGameRating = null;
      state.selectedStatus = null;
      state.selectedCategory = null;
      if (r.type === 'movie' && rewatchGate(r)) return;
      if (r.type === 'series') {
        loadSeasons(r.tmdbId);
      } else {
        showStep3();
      }
    });
    container.appendChild(item);
  });
}

function loadSeasons(tmdbId) {
  showStep(2);
  var list = document.getElementById('seasons-list');
  list.innerHTML = '<p class="text-muted text-sm" style="padding:16px 0">Loading seasons...</p>';
  AppTMDB.getSeriesSeasons(tmdbId).then(function(seasons) {
    list.innerHTML = '';
    if (!seasons || seasons.length === 0) {
      list.innerHTML = '<p class="text-muted">No seasons found.</p>';
      return;
    }
    seasons.forEach(function(s) {
      var item = document.createElement('div');
      item.className = 'result-item';
      var posterUrl = AppUtils.getPosterUrl(s.poster, 154);
      var isDup = findDuplicate(state.selectedResult, s.seasonNumber);
      item.innerHTML = (
        '<img class="result-thumb" src="' + (posterUrl || '') + '" alt="' + s.seasonName + '" onerror="this.style.background=\'#2a2a2a\'">' +
        '<div class="result-info">' +
          '<p class="result-title">' + s.seasonName + '</p>' +
          '<p class="result-meta">' + s.episodeCount + ' episodes' + (s.airYear ? ' · ' + s.airYear : '') +
            (isDup ? ' · <span style="color:var(--accent)">✓ Already added</span>' : '') + '</p>' +
        '</div>'
      );
      item.addEventListener('click', function() {
        state.selectedSeason = s;
        if (rewatchGate(state.selectedResult, s.seasonNumber)) return;
        showStep3();
      });
      list.appendChild(item);
    });
  }).catch(function(err) {
    console.error(err);
    list.innerHTML = '<p class="text-muted">Failed to load seasons.</p>';
  });
}

function prefetchDetails() {
  var r = state.selectedResult, s = state.selectedSeason;
  state.pre = null;
  if (!r) return;
  if (r.type === 'game') state.pre = AppRAWG.getGameDetails(r.rawgId).then(function (d) { return [0, d.genres]; });
  else if (r.type === 'movie') state.pre = AppTMDB.getMovieDetails(r.tmdbId).then(function (d) { return [d.runtime, d.genres]; });
  else if (s) state.pre = Promise.all([AppTMDB.getSeasonRuntime(r.tmdbId, s.seasonNumber), AppTMDB.getSeriesGenres(r.tmdbId)]).then(function (x) { return [x[0] * (s.episodeCount || 1), x[1]]; });
  if (state.pre) state.pre.catch(function () {});
}

function showStep3() {
  prefetchDetails();
  var r = state.selectedResult;
  var s = state.selectedSeason;
  var posterUrl = AppUtils.getPosterUrl(s ? s.poster : r.poster);
  var previewPoster = document.getElementById('preview-poster');
  if (posterUrl) {
    previewPoster.src = posterUrl;
    previewPoster.style.display = 'block';
  } else {
    previewPoster.style.display = 'none';
  }
  AppUtils.setAmbient(s ? (s.poster || r.poster) : r.poster);
  document.getElementById('preview-title').textContent = r.title;
  document.getElementById('preview-sub').textContent =
    r.type === 'series' ? (s ? s.seasonName : '') : r.type === 'game' ? ' Game · ' + (r.releaseYear || '') : '🎬 Movie · ' + (r.releaseYear || '');

  // Reset
  state.selectedMonth = null;
  state.selectedRating = null;
  state.selectedGameRating = null;
  state.selectedStatus = null;
  state.gameMonth = null;
  document.querySelectorAll('.month-chip').forEach(function(c) { c.classList.remove('selected'); });
  document.querySelectorAll('.emoji-btn').forEach(function(b) { b.classList.remove('selected'); });
  document.querySelectorAll('.num-rating-btn').forEach(function(b) { b.classList.remove('selected'); });
  document.querySelectorAll('.completion-btn').forEach(function(b) { b.classList.remove('selected'); });
  document.getElementById('game-extra-fields').style.display = 'block';
  document.getElementById('playtime-input').value = '';
  document.getElementById('review-input').value = '';
  document.getElementById('btn-add').disabled = true;

  // Show right fields
  var isGame = r.type === 'game';
  document.getElementById('movie-series-fields').style.display = isGame ? 'none' : 'block';
  document.getElementById('game-fields').style.display = isGame ? 'block' : 'none';

  showStep(3);
}

function setupBackButtons() {
  document.getElementById('btn-back-s1').addEventListener('click', function() {
    window.location.href = state.playlistId ? '/playlist.html?id=' + state.playlistId : '/home.html?tab=games';
  });
  document.getElementById('btn-back-s2').addEventListener('click', function() { showStep(1); });
  document.getElementById('btn-back-s3').addEventListener('click', function() {
    if (state.type === 'series') showStep(2);
    else showStep(1);
  });
}

function clearSearch() {
  state.lastQuery = '';
  document.getElementById('search-input').value = '';
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-status').textContent = '';
}

document.getElementById('btn-add').addEventListener('click', function() {
  var btn = document.getElementById('btn-add');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  var r = state.selectedResult;
  var s = state.selectedSeason;

  function saveEntry(runtime, genres) {
    var isGame = r.type === 'game';
    var entry = {
      playlistId: state.playlistId,
      title: r.title,
      type: r.type,
      poster: s ? (s.poster || r.poster) : r.poster,
      releaseYear: s ? parseInt(s.airYear || 0) : parseInt(r.releaseYear || 0),
      genres: genres,
      addedAt: null
    };

    if (isGame) {
      entry.rawgId = r.rawgId || null;
      entry.tmdbId = null;
      entry.season = null;
      entry.seasonName = null;
      entry.completionStatus = state.selectedStatus;
      entry.gameRating = state.selectedGameRating || null;
      entry.playtime = parseInt(document.getElementById('playtime-input').value) || null;
      entry.category = (genres && genres[0]) || (r.genres && r.genres[0]) || null;
      entry.review = document.getElementById('review-input').value.trim() || null;
      entry.dropReason = state.selectedStatus === 'dropped'
        ? (document.getElementById('reason-input').value.trim() || null) : null;
      entry.monthWatched = state.selectedStatus === 'wishlist' ? null : (state.gameMonth || null);
      entry.yearWatched = state.selectedStatus === 'wishlist' ? null : state.gameYear;
      entry.rating = null;
      entry.runtime = 0;
    } else {
      entry.tmdbId = r.tmdbId || null;
      entry.rawgId = null;
      entry.season = s ? s.seasonNumber : null;
      entry.seasonName = s ? s.seasonName : null;
      entry.runtime = runtime;
      entry.monthWatched = state.selectedMonth;
      entry.yearWatched = state.selectedYear;
      entry.rating = state.selectedRating;
      entry.completionStatus = null;
      entry.gameRating = null;
      entry.playtime = null;
      entry.category = null;
      entry.review = null;
    }

    var targetName = isGame ? ({
      completed: 'Completed Games',
      playing: 'Currently Playing',
      dropped: 'Dropped Games',
      wishlist: 'Wishlist'
    })[state.selectedStatus] : null;

    var playlistPromise = targetName
      ? AppDB.getOrCreatePlaylist(state.uid, targetName, 'game')
      : Promise.resolve(state.playlistId);

    playlistPromise.then(function(pid) {
      entry.playlistId = pid;
      return AppDB.addEntry(state.uid, entry).then(function() { return pid; });
    })
      .then(function(pid) {
        sessionStorage.setItem('pl-back', state.type === 'game' ? '/home.html?tab=games' : '/home.html');
        window.location.replace('/playlist.html?id=' + pid);
      })
      .catch(function(err) {
        console.error(err);
        btn.disabled = false;
        btn.textContent = 'Add to Collection';
        AppUtils.showToast('Failed to save. Try again.');
      });
  }

  if (state.pre) {
    state.pre.then(function (x) { saveEntry(x[0], x[1]); })
      .catch(function () { saveEntry(r.type === 'game' ? 0 : r.type === 'movie' ? 90 : 30 * ((s && s.episodeCount) || 1), r.genres || []); });
  } else if (r.type === 'game') {
    AppRAWG.getGameDetails(r.rawgId)
      .then(function(details) { saveEntry(0, details.genres); })
      .catch(function() { saveEntry(0, r.genres || []); });
  } else if (r.type === 'movie') {
    AppTMDB.getMovieDetails(r.tmdbId)
      .then(function(details) { saveEntry(details.runtime, details.genres); })
      .catch(function() { saveEntry(90, []); });
  } else {
    var epCount = s.episodeCount || 1;
    Promise.all([
      AppTMDB.getSeasonRuntime(r.tmdbId, s.seasonNumber),
      AppTMDB.getSeriesGenres(r.tmdbId)
    ]).then(function(results) {
      saveEntry(results[0] * epCount, results[1]);
    }).catch(function() {
      saveEntry(30 * epCount, []);
    });
  }
});