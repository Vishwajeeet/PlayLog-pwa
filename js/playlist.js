// Playlist view: display and manage entries in a playlist
// Playlist page logic

var playlistId = new URLSearchParams(
  window.location.search
).get('id');

if (!playlistId) {
  window.location.href = '/home.html';
}

AppAuth.requireAuth(function (user) {

  var uid = user.uid;
  AppFlow.showUndo(uid, function () { loadPlaylist(); });
  var bk = sessionStorage.getItem('pl-back');
  if (bk) {
    history.pushState({}, '');
    window.addEventListener('popstate', function () { sessionStorage.removeItem('pl-back'); location.replace(bk); });
  }

  var currentName = '';

  var currentPlaylistType = 'media';

  var allEntries = [];

  var currentFilter = 'all';

  function syncTheatreOpt() {
    var sel = document.getElementById('pl-sort'), opt = sel.querySelector('option[value="theatre"]');
    var has = allEntries.some(function (e) { return e.type === 'movie' && e.theatre; });
    if (has && !opt) { opt = document.createElement('option'); opt.value = 'theatre'; opt.textContent = 'In theatres'; sel.appendChild(opt); }
    if (!has && opt) { opt.remove(); if (plSort === 'theatre') { plSort = 'new'; sel.value = 'new'; } }
  }

  loadPlaylist();

  function loadPlaylist() {

    showSkeletons();

    Promise.all([

      db.collection('users')
        .doc(uid)
        .collection('playlists')
        .doc(playlistId)
        .get(),

      AppDB.getEntriesByPlaylist(
        uid,
        playlistId
      )

    ])
      .then(function (results) {

        var playlistDoc = results[0];

        var entries = results[1];

        if (!playlistDoc.exists) {

          window.location.href =
            '/home.html';

          return;
        }

        var playlistData = playlistDoc.data() || {};

        currentName =
          playlistData.name;

        currentPlaylistType =
          playlistData.type || 'media';

        var filterRowWrap = document.getElementById('filter-row-wrap');
        var filterRow = document.getElementById('type-filter');
        var gameChip = filterRow.querySelector('[data-filter="game"]');
        var movieChip = filterRow.querySelector('[data-filter="movie"]');
        var seriesChip = filterRow.querySelector('[data-filter="series"]');

        if (currentPlaylistType === 'game') {
          filterRowWrap.style.display = 'none';
        } else {
          filterRowWrap.style.display = 'flex';
          gameChip.style.display = 'none';
          movieChip.style.display = '';
          seriesChip.style.display = '';
          filterRow.style.gridTemplateColumns = '1fr 1fr 1fr';
        }

        allEntries = entries;
        syncTheatreOpt();
        AppUtils.setAmbient(entries[0] && entries[0].poster);

        document.getElementById(
          'playlist-title'
        ).textContent = currentName;

        updateEntryCount();

        renderEntries(allEntries);

        setupFilterListeners();

      })
      .catch(function (err) {

        console.error(err);

        AppUtils.showToast(
          'Failed to load.'
        );

      });

  }

  function showSkeletons() {

    var grid =
      document.getElementById(
        'entries-container'
      );

    grid.innerHTML = '';

    for (var i = 0; i < 6; i++) {

      var s =
        document.createElement('div');

      s.className =
        'skeleton skeleton-card';

      grid.appendChild(s);

    }

  }

  function updateEntryCount() {

    var filtered = getFilteredEntries();

    if (currentFilter === 'all') {

      document.getElementById(
        'entry-count'
      ).textContent =
        allEntries.length +
        ' title' +
        (allEntries.length !== 1 ? 's' : '');

    } else {

      document.getElementById(
        'entry-count'
      ).textContent =
        filtered.length +
        ' of ' +
        allEntries.length +
        ' title' +
        (allEntries.length !== 1 ? 's' : '');

    }

  }

  var plQuery = '', plSort = 'new';

  function plRefresh() {
    var l = getFilteredEntries();
    var rBtn = document.getElementById('btn-random-entry');
    if (rBtn) {
      rBtn.style.display = l.length >= 2 ? '' : 'none';
      rBtn._pool = l;
    }
    renderEntries(l);
    if (plQuery || plSort === 'theatre') document.getElementById('entry-count').textContent = l.length + ' of ' + allEntries.length;
    else updateEntryCount();
  }

  document.getElementById('pl-search').addEventListener('input', AppUtils.debounce(function () {
    plQuery = (document.getElementById('pl-search').value || '').trim().toLowerCase();
    plRefresh();
  }, 140));
  document.getElementById('pl-sort').addEventListener('change', function () {
    plSort = this.value; plRefresh();
  });

  function getFilteredEntries() {
    var list = baseFiltered().slice();
    if (plQuery) list = list.filter(function (e) { return (e.title || '').toLowerCase().indexOf(plQuery) > -1; });
    var rate = function (e) { return (e.type === 'game' ? e.gameRating : e.rating) || 0; };
    var len = function (e) { return e.type === 'game' ? (e.playtime || 0) * 60 : (e.runtime || 0); };
    if (plSort === 'theatre') list = list.filter(function (e) { return e.type === 'movie' && e.theatre; });
    else if (plSort === 'old') list.reverse();
    else if (plSort === 'title') list.sort(function (a, b) { return (a.title || '').localeCompare(b.title || ''); });
    else if (plSort === 'rating') list.sort(function (a, b) { return rate(b) - rate(a); });
    else if (plSort === 'length') list.sort(function (a, b) { return len(b) - len(a); });
    return list;
  }

  function baseFiltered() {

    if (currentFilter === 'all') {
      return allEntries;
    }

    return allEntries.filter(function (entry) {
      return entry.type === currentFilter;
    });

  }
  document.getElementById('btn-layout-toggle').addEventListener('click', function () {
    layoutMode = layoutMode === 'flat' ? 'grouped' : 'flat';
    localStorage.setItem('mb-layout', layoutMode);
    this.textContent = layoutMode === 'flat' ? '▦' : '☰';
    var container = document.getElementById('entries-container');
    if (container) {
      container.style.opacity = '0';
      container.style.transform = 'translateY(6px)';
      setTimeout(function () {
        renderEntries(getFilteredEntries());
        container.style.transition = 'opacity 0.22s ease, transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)';
        container.style.opacity = '1';
        container.style.transform = 'translateY(0)';
      }, 100);
    } else {
      renderEntries(getFilteredEntries());
    }
  });
  document.getElementById('btn-layout-toggle').textContent = layoutMode === 'flat' ? '▦' : '☰';

  function setupFilterListeners() {

    var buttons = document.querySelectorAll(
      '#type-filter .toggle-btn'
    );

    buttons.forEach(function (btn) {

      btn.addEventListener('click', function () {

        buttons.forEach(function (b) {
          b.classList.remove('active');
        });

        btn.classList.add('active');

        currentFilter = btn.dataset.filter;
        
        

        updateEntryCount();

        renderEntries(getFilteredEntries());

      });

    });

  }

  var layoutMode = localStorage.getItem('mb-layout') || 'flat';

  function buildEntryCard(entry) {
    var card = document.createElement('div');
    card.className = 'card';
    card.dataset.entryId = entry.id;
    if (entry.theatre && entry.type === 'movie') card.classList.add('theatre');

    var posterUrl = AppUtils.getPosterUrl(entry.poster);
    var posterHTML = posterUrl
      ? '<img class="poster-img" loading="lazy" src="' + posterUrl + '" alt="' + AppUtils.esc(entry.title) + '" onerror="this.style.display=\'none\'">'
      : '<div class="poster-placeholder">' + (entry.type === 'game' ? '' : '🎬') + '</div>';

    var seasonBadge = '';
    if (entry.type === 'series') {
      seasonBadge = '<span class="badge badge-tl">S' + entry.season + '</span>';
    } else if (false) {
      var statusColors = { completed: '#22c55e', playing: '#f59e0b', dropped: '#ef4444', wishlist: '#6366f1' };
      var statusLabels = { completed: '', playing: '', dropped: '❌', wishlist: '' };
      var st = entry.completionStatus || 'wishlist';
      seasonBadge = '<span class="badge badge-tl" style="background:' + (statusColors[st] || '#6366f1') + ';color:#000">' + (statusLabels[st] || '') + '</span>';
    }
    if (currentName !== 'Watchlist' && entry.type !== 'game' && entry.completionStatus === 'wishlist') {
      seasonBadge += '<span class="badge" style="top:' + (entry.type === 'series' ? 34 : 8) + 'px;left:8px">Watchlist</span>';
    }

    
    if (entry.rewatchCount) seasonBadge += '<span class="badge" style="top:' + (entry.type === 'series' ? 34 : 8) + 'px;left:8px">🔁 Rewatched ' + entry.rewatchCount + '×</span>';
    var ratingBadge = '';
    if (entry.type === 'game') {
      ratingBadge = entry.gameRating
        ? '<span class="badge badge-tr badge-rating-big" style="background:var(--accent-game);color:#fff">' + entry.gameRating + '</span>'
        : '';
    } else {
      ratingBadge = entry.rating
        ? '<span class="badge badge-tr">' + AppUtils.ratingToEmoji(entry.rating) + '</span>'
        : '';
    }

    card.innerHTML = (
      '<div class="poster-wrap">' +
      posterHTML +
      seasonBadge +
      ratingBadge +
      '<div class="poster-gradient"></div>' +
      '<button class="btn-menu-entry" data-entry-id="' + entry.id + '">⋮</button>' +
      '<p class="poster-title">' + AppUtils.esc(entry.title) + '</p>' +
      '</div>'
    );

    card.querySelector('.btn-menu-entry').addEventListener('click', function (e) {
      e.stopPropagation();
      openEntryOptions(entry);
    });

    var holdTimer = null, longPressed = false, holdX = 0, holdY = 0;
    card.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.btn-menu-entry') || (e.pointerType === 'mouse' && e.button !== 0)) return;
      holdX = e.clientX; holdY = e.clientY; longPressed = false;
      clearTimeout(holdTimer);
      holdTimer = setTimeout(function () {
        longPressed = true;
        openEntryOptions(entry);
      }, 450);
    });
    card.addEventListener('pointermove', function (e) {
      if (Math.hypot(e.clientX - holdX, e.clientY - holdY) > 10) clearTimeout(holdTimer);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (name) {
      card.addEventListener(name, function () { clearTimeout(holdTimer); });
    });
    card.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    card.addEventListener('click', function (e) {
      if (longPressed) {
        e.preventDefault();
        e.stopPropagation();
        longPressed = false;
        return;
      }
      window.location.href = '/entry.html?id=' + entry.id;
    });

    return card;
  }

  function renderEntries(entries) {

    var container =
      document.getElementById(
        'entries-container'
      );

    container.innerHTML = '';

    var empty =
      document.getElementById(
        'empty-state'
      );

    if (entries.length === 0) {

      empty.style.display = 'block';

      var emptyText = empty.querySelector(
        '.empty-state-text'
      );

      var theme = document.documentElement.getAttribute('data-visual-theme') || 'library';
      var emptyIcon = empty.querySelector('.empty-state-icon');
      var themeEmpties = {
        winter: {
          icon: '❄️',
          text: 'No ' + (currentFilter === 'movie' ? 'movies' : currentFilter === 'series' ? 'series' : 'titles') + ' here yet. Brew some hot cocoa and start a story.'
        },
        wizarding: {
          icon: '📜',
          text: 'The archive is silent. No ' + (currentFilter === 'movie' ? 'enchanted reels' : 'chronicles') + ' recorded yet.'
        },
        kyoto: {
          icon: '🍵',
          text: 'Still water. No ' + (currentFilter === 'movie' ? 'films' : currentFilter === 'series' ? 'series' : 'entries') + ' added here yet.'
        },
        sakura: {
          icon: '🌸',
          text: 'Moonlit branches await. No ' + (currentFilter === 'movie' ? 'films' : currentFilter === 'series' ? 'series' : 'entries') + ' here yet.'
        },
        herbarium: {
          icon: '🌿',
          text: 'Blank herbarium page. Add a title to press into this specimen.'
        },
        library: {
          icon: '📚',
          text: 'This shelf awaits its first volume.'
        },
        glass: {
          icon: currentFilter === 'movie' ? '🎬' : currentFilter === 'series' ? '📺' : '📂',
          text: 'Nothing here yet.'
        },
        classic: {
          icon: currentFilter === 'movie' ? '🎬' : currentFilter === 'series' ? '📺' : '📂',
          text: 'Nothing here yet.'
        }
      };
      var tData = themeEmpties[theme] || themeEmpties.library;
      if (emptyIcon) emptyIcon.textContent = tData.icon;
      emptyText.textContent = tData.text;
      return;
    }

    empty.style.display = 'none';

    if (layoutMode === 'flat') {
      var grid = document.createElement('div');
      grid.className = 'grid-2';
      entries.forEach(function (entry) {
        grid.appendChild(buildEntryCard(entry));
      });
      container.appendChild(grid);
      return;
    }

    var grouped = {};

    entries.forEach(function (entry) {

      var month =
        AppUtils.monthName(
          entry.monthWatched || 1
        );

      var year =
        Number(entry.yearWatched) || '';

      var key =
        month + ' ' + year;

      if (!grouped[key]) {
        grouped[key] = [];
      }

      grouped[key].push(entry);

    });

    Object.keys(grouped).forEach(function (groupName) {

      var section =
        document.createElement('section');

      section.style.marginBottom = '36px';

      var header =
        document.createElement('div');

      header.style.display = 'flex';
      header.style.justifyContent =
        'space-between';
      header.style.alignItems =
        'center';
      header.style.marginBottom =
        '16px';

      header.innerHTML = (

        '<h2 style="' +
        'font-size:20px;' +
        'font-weight:700' +
        '">' +

        groupName +

        '</h2>' +

        '<span class="text-sm text-muted">' +

        grouped[groupName].length +

        ' title' +

        (
          grouped[groupName].length !== 1
            ? 's'
            : ''
        ) +

        '</span>'

      );

      section.appendChild(header);

      var grid =
        document.createElement('div');

      grid.className = 'grid-2';

      grouped[groupName].forEach(function (entry) {
        grid.appendChild(buildEntryCard(entry));
      });

      section.appendChild(grid);

      container.appendChild(section);

    });

  }

  function goToAdd() {

    window.location.href =
      '/add.html?playlistId=' +
      playlistId +
      '&type=' + (currentPlaylistType || 'media');

  }

  // Entry context for modals

  var currentEditEntry = null;
  var currentDeleteEntry = null;
  var currentMoveEntry = null;
  var allPlaylists = [];

  // OPTIONS MENU

  function openEntryOptions(entry) {

    currentEditEntry = entry;

    currentDeleteEntry = entry;
    var isMediaWishlist = currentName === 'Watchlist' &&
      entry.type !== 'game' && entry.completionStatus === 'wishlist';
    document.getElementById('btn-edit-entry').style.display = isMediaWishlist ? 'none' : '';
    document.getElementById('btn-move-entry').style.display = isMediaWishlist ? 'none' : '';
    document.getElementById('btn-share-entry').style.display = isMediaWishlist ? 'none' : '';
    document.getElementById('btn-mark-watched-entry').style.display = isMediaWishlist ? '' : 'none';
    document.getElementById('btn-rewatch-entry').style.display =
      entry.type !== 'game' && !isMediaWishlist ? '' : 'none';
    ['playing', 'completed', 'dropped'].forEach(function (status) {
      var button = document.getElementById('btn-game-' + status);
      button.style.display = entry.type === 'game' && entry.completionStatus !== status ? '' : 'none';
    });
    document.getElementById('btn-move-entry').style.display = isMediaWishlist ? 'none' : '';
    document.getElementById('btn-share-entry').style.display = isMediaWishlist ? 'none' : '';
    document.getElementById('btn-delete-entry').style.display = '';

    document.getElementById(
      'entry-options-modal'
    ).classList.add('open');

  }

  document.getElementById('btn-mark-watched-entry').addEventListener('click', function () {
    if (!currentEditEntry) return;
    document.getElementById('entry-options-modal').classList.remove('open');
    window.location.href = '/entry.html?id=' + encodeURIComponent(currentEditEntry.id);
  });

  document.getElementById('btn-rewatch-entry').addEventListener('click', function () {
    if (!currentEditEntry) return;
    var button = this, entry = currentEditEntry;
    button.disabled = true;
    AppDB.updateEntry(uid, entry.id, { rewatchCount: (Number(entry.rewatchCount) || 0) + 1 }).then(function () {
      document.getElementById('entry-options-modal').classList.remove('open');
      AppUtils.showToast('Rewatch logged ✓');
      return loadPlaylist();
    }).catch(function (err) {
      console.error('Could not update rewatch count.', err);
      AppUtils.showToast('Failed to log rewatch.');
    }).then(function () { button.disabled = false; });
  });

  ['playing', 'completed', 'dropped'].forEach(function (status) {
    document.getElementById('btn-game-' + status).addEventListener('click', function () {
      if (!currentEditEntry || currentEditEntry.type !== 'game') return;
      var entry = currentEditEntry, button = this;
      var names = { playing: 'Currently Playing', completed: 'Completed Games', dropped: 'Dropped Games' };
      button.disabled = true;
      AppDB.getOrCreatePlaylist(uid, names[status], 'game').then(function (pid) {
        var now = new Date();
        var update = {
          completionStatus: status,
          playlistId: pid,
          monthWatched: now.getMonth() + 1,
          yearWatched: now.getFullYear()
        };
        return AppDB.updateEntry(uid, entry.id, update);
      }).then(function () {
        document.getElementById('entry-options-modal').classList.remove('open');
        AppUtils.showToast('Status changed to ' + status + ' ✓');
        return loadPlaylist();
      }).catch(function (err) {
        console.error('Could not change game status.', err);
        AppUtils.showToast('Failed to change status.');
      }).then(function () { button.disabled = false; });
    });
  });

  // EDIT ENTRY

  function openEditModal(entry) {

    currentEditEntry = entry;

    document.getElementById(
      'entry-options-modal'
    ).classList.remove('open');

    document.getElementById(
      'edit-entry-title'
    ).textContent = entry.title;

    buildEditMonthChips(
      entry.monthWatched
    );

    var isEditingGame = entry.type === 'game';
    var isStillPlaying = isEditingGame && entry.completionStatus === 'playing';

    document.getElementById('edit-month-section').style.display = isEditingGame ? 'none' : 'block';
    document.getElementById('edit-emoji-row').style.display = isEditingGame ? 'none' : 'flex';
    document.getElementById('edit-number-rating-row').style.display = (isEditingGame && !isStillPlaying) ? 'flex' : 'none';
    document.getElementById('edit-rating-label').style.display = (!isEditingGame || !isStillPlaying) ? 'block' : 'none';

    if (isEditingGame) {
      buildEditNumberRatingRow(entry.gameRating);
    } else {
      buildEditEmojiRow(entry.rating);
    }

    var ptWrap = document.getElementById('edit-playtime-wrap');
    if (entry.type === 'game') {
      ptWrap.style.display = 'block';
      document.getElementById('edit-playtime-input').value = entry.playtime || '';
    } else {
      ptWrap.style.display = 'none';
    }

    var completeWrap = document.getElementById('edit-complete-toggle-wrap');
    var completeExtra = document.getElementById('edit-complete-extra');
    var completeCheckbox = document.getElementById('edit-mark-completed');
    completeCheckbox.checked = false;
    completeExtra.style.display = 'none';
    document.getElementById('edit-complete-review').value = '';

    if (entry.type === 'game' && entry.completionStatus === 'playing') {
      completeWrap.style.display = 'block';
    } else {
      completeWrap.style.display = 'none';
    }

    document.getElementById(
      'edit-entry-modal'
    ).classList.add('open');

  }

  function buildEditMonthChips(selectedMonth) {

    var container =
      document.getElementById(
        'edit-month-chips'
      );

    container.innerHTML = '';

    var months = [
      'Jan', 'Feb', 'Mar', 'Apr',
      'May', 'Jun', 'Jul', 'Aug',
      'Sep', 'Oct', 'Nov', 'Dec'
    ];

    months.forEach(function (month, index) {

      var btn = document.createElement('button');

      btn.className = 'month-chip';

      if (index + 1 === selectedMonth) {
        btn.classList.add('selected');
      }

      btn.textContent = month;

      btn.dataset.month = index + 1;

      btn.addEventListener('click', function () {

        container.querySelectorAll('.month-chip')
          .forEach(function (c) {
            c.classList.remove('selected');
          });

        btn.classList.add('selected');

        currentEditEntry.monthWatched =
          index + 1;

      });

      container.appendChild(btn);

    });

  }

  function buildEditEmojiRow(selectedRating) {

    var row =
      document.getElementById(
        'edit-emoji-row'
      );

    row.innerHTML = '';

    var emojis = ['😭', '🙁', '😐', '😊', '🤩'];

    emojis.forEach(function (emoji, index) {

      var btn = document.createElement('button');

      btn.className = 'emoji-btn';

      if (index + 1 === selectedRating) {
        btn.classList.add('selected');
      }

      btn.textContent = emoji;

      btn.addEventListener('click', function () {
        AppUtils.hapticRating();
        row.querySelectorAll('.emoji-btn')
          .forEach(function (b) {
            b.classList.remove('selected');
          });

        btn.classList.add('selected');

        currentEditEntry.rating = index + 1;

      });

      row.appendChild(btn);

    });

  }

  function buildEditNumberRatingRow(selectedRating) {

    var row =
      document.getElementById(
        'edit-number-rating-row'
      );

    row.innerHTML = '';

    for (var i = 1; i <= 10; i++) {

      (function (num) {

        var btn = document.createElement('button');

        btn.className = 'num-rating-btn';

        if (num === selectedRating) {
          btn.classList.add('selected');
        }

        btn.textContent = num;

        btn.addEventListener('click', function () {
          AppUtils.hapticRating();
          row.querySelectorAll('.num-rating-btn')
            .forEach(function (b) {
              b.classList.remove('selected');
            });

          btn.classList.add('selected');

          currentEditEntry.gameRating = num;

        });

        row.appendChild(btn);

      })(i);

    }

  }

  function saveEditEntry() {

    if (!currentEditEntry) return;

    var markingCompleted =
      currentEditEntry.type === 'game' &&
      document.getElementById('edit-mark-completed').checked;

    if (markingCompleted) {

      var row = document.getElementById('edit-complete-rating-row');
      var chosenRating = row.dataset.selected ? Number(row.dataset.selected) : null;
      var review = document.getElementById('edit-complete-review').value.trim() || null;

      AppDB.getOrCreatePlaylist(uid, 'Completed Games', 'game').then(function (newPlaylistId) {

        var updateData = {
          monthWatched: currentEditEntry.monthWatched,
          completionStatus: 'completed',
          gameRating: chosenRating,
          review: review,
          playlistId: newPlaylistId
        };

        var pt = parseInt(document.getElementById('edit-playtime-input').value);
        updateData.playtime = isNaN(pt) ? null : pt;

        return AppDB.updateEntry(uid, currentEditEntry.id, updateData);

      }).then(function () {

        document.getElementById('edit-entry-modal').classList.remove('open');
        AppUtils.showToast('Marked as completed ✓');
        loadPlaylist();

      }).catch(function (err) {

        console.error(err);
        AppUtils.showToast('Failed to update.');

      });

      return;
    }

    var updateData = {
      monthWatched: currentEditEntry.monthWatched
    };

    if (currentEditEntry.type === 'game') {
      updateData.gameRating = currentEditEntry.gameRating;
      var pt = parseInt(document.getElementById('edit-playtime-input').value);
      updateData.playtime = isNaN(pt) ? null : pt;
    } else {
      updateData.rating = currentEditEntry.rating;
    }

    AppDB.updateEntry(
      uid,
      currentEditEntry.id,
      updateData
    )
      .then(function () {

        document.getElementById(
          'edit-entry-modal'
        ).classList.remove('open');

        updateRatingBadge(
          currentEditEntry.id,
          currentEditEntry.rating
        );

        AppUtils.showToast(
          'Updated ✓'
        );

      })
      .catch(function (err) {

        console.error(err);

        AppUtils.showToast(
          'Failed to update.'
        );

      });

  }

  function updateRatingBadge(entryId, newRating) {

    var card = document.querySelector(
      '[data-entry-id="' + entryId + '"]'
    ).closest('.card');

    if (!card) return;

    var ratingBadge =
      card.querySelector('.badge-tr');

    if (ratingBadge) {

      ratingBadge.textContent =
        AppUtils.ratingToEmoji(newRating);

    }

  }

  // DELETE ENTRY

  function openDeleteConfirm(entry) {

    currentDeleteEntry = entry;

    document.getElementById(
      'entry-options-modal'
    ).classList.remove('open');

    document.getElementById(
      'delete-confirm-modal'
    ).classList.add('open');

  }

  function deleteCurrentEntry() {

    var delSnap = currentDeleteEntry ? Object.assign({}, currentDeleteEntry) : null;
    var delId = currentDeleteEntry ? currentDeleteEntry.id : null;
    if (delSnap) delete delSnap.id;

    if (!currentDeleteEntry) return;

    AppDB.deleteEntry(
      uid,
      currentDeleteEntry.id
    )
      .then(function () {

        document.getElementById(
          'delete-confirm-modal'
        ).classList.remove('open');

        var card = document.querySelector(
          '[data-entry-id="' +
          currentDeleteEntry.id +
          '"]'
        ).closest('.card');

        if (card) {
          card.style.opacity = '0';

          setTimeout(function () {
            card.remove();
          }, 200);
        }

        allEntries = allEntries.filter(function (e) {
          return e.id !== currentDeleteEntry.id;
        });

        updateEntryCount();

        AppUtils.showToast(
          'Entry deleted'
        );

        if (delSnap) { AppFlow.undo(uid, delId, delSnap); AppFlow.showUndo(uid, function () { loadPlaylist(); }); }

        void (0
        );

      })
      .catch(function (err) {

        console.error(err);

        AppUtils.showToast(
          'Failed to delete.'
        );

      });

  }

  // MOVE ENTRY

  function openMoveToModal(entry) {

    currentMoveEntry = entry;

    document.getElementById(
      'entry-options-modal'
    ).classList.remove('open');

    document.getElementById(
      'move-to-modal'
    ).classList.add('open');

    loadPlaylistsForMove();

  }

  function loadPlaylistsForMove() {

    AppDB.getPlaylists(uid)
      .then(function (playlists) {

        allPlaylists = playlists;

        buildPlaylistsList(playlists);

      })
      .catch(function (err) {

        console.error(err);

        AppUtils.showToast(
          'Failed to load playlists.'
        );

      });

  }

  function buildPlaylistsList(playlists) {

    var container =
      document.getElementById(
        'playlists-list'
      );

    container.innerHTML = '';

    var filtered = playlists.filter(function (p) {
      return p.id !== playlistId && ((p.type || 'media') === 'game') === (currentMoveEntry.type === 'game');
    });

    if (filtered.length === 0) {

      container.innerHTML =
        '<p class="text-muted" style="padding:12px 0">No other playlists.</p>';

      return;
    }

    filtered.forEach(function (pl0) {

      var playlist = Object.assign({}, pl0, { name: AppUtils.esc(pl0.name) });

      var entryCount = 0;

      for (var i = 0; i < allEntries.length; i++) {

        if (allEntries[i].playlistId === playlist.id) {
          entryCount++;
        }

      }

      var item = document.createElement('button');

      item.className = 'playlist-list-item';

      item.innerHTML = (

        '<div style="flex:1;text-align:left">' +

        '<p style="font-weight:600;font-size:15px;color:var(--text-primary);margin-bottom:4px">' +

        playlist.name +

        '</p>' +

        '<p style="font-size:13px;color:var(--text-muted)">' +

        entryCount +

        ' title' +

        (entryCount !== 1 ? 's' : '') +

        '</p>' +

        '</div>'

      );

      item.addEventListener('click', function () {

        moveEntryToPlaylist(
          currentMoveEntry.id,
          playlist.id,
          playlist.name
        );

      });

      container.appendChild(item);

    });

  }

  function moveEntryToPlaylist(entryId, newPlaylistId, playlistName) {
    var en = allEntries.filter(function (e) { return e.id === entryId; })[0];
    if (en && AppFlow.needs(en, playlistName)) {
      AppFlow.move(uid, en, newPlaylistId, playlistName).then(function (ok) {
        if (!ok) return;
        document.getElementById('move-to-modal').classList.remove('open');
        loadPlaylist();
        AppUtils.showToast('Moved to ' + playlistName + ' ✓');
      }).catch(function () { AppUtils.showToast('Failed to move entry.'); });
      return;
    }

    AppDB.moveEntry(
      uid,
      entryId,
      newPlaylistId
    )
      .then(function () {

        document.getElementById(
          'move-to-modal'
        ).classList.remove('open');

        var card = document.querySelector(
          '[data-entry-id="' + entryId + '"]'
        ).closest('.card');

        if (card) {
          card.style.opacity = '0';

          setTimeout(function () {
            card.remove();
          }, 200);
        }

        allEntries = allEntries.filter(function (e) {
          return e.id !== entryId;
        });

        updateEntryCount();

        AppUtils.showToast(
          'Moved to ' + playlistName + ' ✓'
        );

      })
      .catch(function (err) {

        console.error(err);

        AppUtils.showToast(
          'Failed to move entry.'
        );

      });

  }

  // MODAL LISTENERS

  document.getElementById(
    'btn-edit-entry'
  ).addEventListener('click', function () {

    if (currentEditEntry) {
      openEditModal(currentEditEntry);
    }

  });

  document.getElementById(
    'btn-delete-entry'
  ).addEventListener('click', function () {

    if (currentDeleteEntry) {
      openDeleteConfirm(currentDeleteEntry);
    }

  });
  document.getElementById('btn-share-playlist').addEventListener('click', function () {
    generatePlaylistShareCard(allEntries, currentName);
  });

  document.getElementById('btn-close-share-playlist').addEventListener('click', function () {
    document.getElementById('share-playlist-modal').classList.remove('open');
  });

  var playlistShareCanvas = null;

  document.getElementById('btn-download-playlist').addEventListener('click', function () {
    if (!playlistShareCanvas) return;
    playlistShareCanvas.toBlob(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'playlist-share.png';
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  function generatePlaylistShareCard(entries, playlistName) {
    if (!entries.length) {
      AppUtils.showToast('No entries to share.');
      return;
    }

    var n = entries.length;
    var cols = n <= 4 ? 2 : n <= 9 ? 3 : n <= 16 ? 4 : n <= 25 ? 5 : 6;
    var rows = Math.ceil(n / cols);

    var pad = 40, gap = 16, headerH = 140, footerH = 60;
    var tileW = 200;
    var tileH = tileW * 1.5;
    var canvasW = pad * 2 + cols * tileW + (cols - 1) * gap;
    var canvasH = headerH + pad + rows * tileH + (rows - 1) * gap + pad + footerH;

    var canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = '#c9a84c';
    ctx.fillRect(0, 0, canvasW, 6);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(playlistName, pad, 90);
    ctx.font = '500 24px Inter, sans-serif';
    ctx.fillStyle = '#999999';
    ctx.fillText(n + ' title' + (n !== 1 ? 's' : ''), pad, 125);

    var loaded = 0;
    entries.forEach(function (entry, i) {
      var col = i % cols, row = Math.floor(i / cols);
      var x = pad + col * (tileW + gap);
      var y = headerH + pad + row * (tileH + gap);

      function drawTitleLabel() {
        var grad = ctx.createLinearGradient(0, y + tileH - 60, 0, y + tileH);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.85)');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y + tileH - 60, tileW, 60);

        ctx.fillStyle = '#ffffff';
        ctx.font = '600 15px Inter, sans-serif';
        ctx.textAlign = 'left';
        var maxWidth = tileW - 16;
        var title = entry.title;
        while (ctx.measureText(title).width > maxWidth && title.length > 3) {
          title = title.slice(0, -1);
        }
        if (title !== entry.title) title = title.trim() + '…';
        ctx.fillText(title, x + 8, y + tileH - 12);
      }

      function drawPlaceholder() {
        ctx.fillStyle = '#1a1a1a';
        AppUtils.roundRectPath(ctx, x, y, tileW, tileH, 10);
        ctx.fill();
        ctx.font = '48px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#444';
        ctx.fillText(entry.type === 'game' ? '' : '🎬', x + tileW / 2, y + tileH / 2 + 16);
        ctx.textAlign = 'left';
        drawTitleLabel();
        finish();
      }

      function finish() {
        loaded++;
        if (loaded === entries.length) finalizeCard();
      }

      var posterUrl = AppUtils.getPosterUrl(entry.poster);
      if (!posterUrl) { drawPlaceholder(); return; }

      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        ctx.save();
        AppUtils.roundRectPath(ctx, x, y, tileW, tileH, 10);
        ctx.clip();
        var scale = Math.max(tileW / img.width, tileH / img.height);
        var dw = img.width * scale, dh = img.height * scale;
        ctx.drawImage(img, x + (tileW - dw) / 2, y + (tileH - dh) / 2, dw, dh);
        ctx.restore();
        drawTitleLabel();
        finish();
      };
      img.onerror = drawPlaceholder;
      img.src = AppUtils.getCanvasSafeUrl(posterUrl);
    });

    function finalizeCard() {
      ctx.fillStyle = '#666666';
      ctx.font = '500 22px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Logged on Playlog', canvasW / 2, canvasH - 24);

      canvas.style.width = '100%';
      canvas.style.borderRadius = '8px';
      playlistShareCanvas = canvas;
      var wrap = document.getElementById('share-playlist-canvas-wrap');
      wrap.innerHTML = '';
      wrap.appendChild(canvas);
      document.getElementById('share-playlist-modal').classList.add('open');
    }
  }
  document.getElementById('btn-share-entry').addEventListener('click', function () {
    if (currentEditEntry) {
      document.getElementById('entry-options-modal').classList.remove('open');
      generateShareCard(currentEditEntry);
    }
  });

  document.getElementById('btn-close-share').addEventListener('click', function () {
    document.getElementById('share-modal').classList.remove('open');
  });

  var shareCanvas = null;
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

  document.getElementById(
    'btn-move-entry'
  ).addEventListener('click', function () {

    if (currentEditEntry) {
      openMoveToModal(currentEditEntry);
    }

  });
  document.getElementById('share-modal').addEventListener('click', function (e) {
    if (e.target === this) this.classList.remove('open');
  });
  document.getElementById('edit-mark-completed').addEventListener('change', function () {
    var extra = document.getElementById('edit-complete-extra');
    extra.style.display = this.checked ? 'block' : 'none';
    if (this.checked) {
      buildEditCompleteRatingRow(currentEditEntry ? currentEditEntry.gameRating : null);
    }
  });

  function buildEditCompleteRatingRow(selectedRating) {
    var row = document.getElementById('edit-complete-rating-row');
    row.innerHTML = '';
    for (var i = 1; i <= 10; i++) {
      (function (num) {
        var btn = document.createElement('button');
        btn.className = 'num-rating-btn';
        if (num === selectedRating) btn.classList.add('selected');
        btn.textContent = num;
        btn.addEventListener('click', function () {
          AppUtils.hapticRating();
          row.querySelectorAll('.num-rating-btn').forEach(function (b) { b.classList.remove('selected'); });
          btn.classList.add('selected');
          row.dataset.selected = num;
        });
        row.appendChild(btn);
      })(i);
    }
    row.dataset.selected = '';
  }

  document.getElementById(
    'btn-cancel-edit'
  ).addEventListener('click', function () {

    document.getElementById(
      'edit-entry-modal'
    ).classList.remove('open');

  });

  document.getElementById(
    'btn-save-edit'
  ).addEventListener('click', function () {

    saveEditEntry();

  });

  document.getElementById(
    'btn-cancel-delete'
  ).addEventListener('click', function () {

    document.getElementById(
      'delete-confirm-modal'
    ).classList.remove('open');

  });

  document.getElementById(
    'btn-confirm-delete'
  ).addEventListener('click', function () {

    deleteCurrentEntry();

  });

  document.getElementById(
    'btn-cancel-move'
  ).addEventListener('click', function () {

    document.getElementById(
      'move-to-modal'
    ).classList.remove('open');

  });

  // Close modals when clicking overlay

  document.getElementById(
    'entry-options-modal'
  ).addEventListener('click', function (e) {

    if (e.target === this) {

      this.classList.remove('open');

    }

  });

  document.getElementById(
    'edit-entry-modal'
  ).addEventListener('click', function (e) {

    if (e.target === this) {

      this.classList.remove('open');

    }

  });

  document.getElementById(
    'delete-confirm-modal'
  ).addEventListener('click', function (e) {

    if (e.target === this) {

      this.classList.remove('open');

    }

  });

  document.getElementById(
    'move-to-modal'
  ).addEventListener('click', function (e) {

    if (e.target === this) {

      this.classList.remove('open');

    }

  });

  function goToAdd() {

    window.location.href =
      '/add.html?playlistId=' +
      playlistId +
      '&type=' + (currentPlaylistType || 'media');

  }

  document.getElementById(
    'btn-back'
  ).addEventListener('click', function () {

    if (document.referrer && document.referrer.indexOf(window.location.origin) === 0) {
      var b = sessionStorage.getItem('pl-back'); if (b) { sessionStorage.removeItem('pl-back'); window.location.replace(b); } else window.history.back();
    } else {
      window.location.href = '/home.html';
    }

  });

  document.getElementById(
    'fab-add'
  ).addEventListener(
    'click',
    goToAdd
  );

  document.getElementById(
    'btn-add-empty'
  ).addEventListener(
    'click',
    goToAdd
  );

  // Rename playlist

  document.getElementById(
    'playlist-title'
  ).addEventListener('click', function () {

    document.getElementById(
      'rename-input'
    ).value = currentName;

    document.getElementById(
      'rename-modal'
    ).classList.add('open');

    document.getElementById(
      'rename-input'
    ).focus();

  });

  document.getElementById(
    'btn-cancel-rename'
  ).addEventListener('click', function () {

    document.getElementById(
      'rename-modal'
    ).classList.remove('open');

  });

  document.getElementById(
    'btn-confirm-rename'
  ).addEventListener('click', function () {

    var newName =
      document.getElementById(
        'rename-input'
      ).value.trim();

    if (!newName) return;

    AppDB.updatePlaylistName(
      uid,
      playlistId,
      newName
    )
      .then(function () {

        currentName = newName;

        document.getElementById(
          'playlist-title'
        ).textContent = newName;

        document.getElementById(
          'rename-modal'
        ).classList.remove('open');

        AppUtils.showToast(
          'Renamed ✓'
        );

      })
      .catch(function (err) {

        console.error(err);

        AppUtils.showToast(
          'Failed to rename.'
        );

      });

  });

  var randomBtn = document.getElementById('btn-random-entry');
  if (randomBtn) {
    randomBtn.addEventListener('click', function () {
      var pool = (this._pool && this._pool.length) ? this._pool : getFilteredEntries();
      if (!pool.length) return AppUtils.showToast('No titles to pick from.');
      var lastId = null;
      function pickOne() {
        if (pool.length === 1) return pool[0];
        var next = pool.filter(function (x) { return x.id !== lastId; });
        return (next.length ? next : pool)[Math.floor(Math.random() * (next.length ? next.length : pool.length))];
      }
      var cur = pickOne();
      lastId = cur.id;
      var ov = document.createElement('div');
      ov.className = 'modal-overlay open';
      function paint(item) {
        var metaParts = [];
        if (item.type === 'game') {
          metaParts.push('🎮 Game');
          if (item.gameRating) metaParts.push('★ ' + item.gameRating + '/10');
          if (item.playtime) metaParts.push(item.playtime + 'h');
        } else {
          metaParts.push(item.type === 'series' ? '📺 Series' : '🎬 Movie');
          if (item.rating) metaParts.push(AppUtils.ratingToEmoji(item.rating));
          if (item.yearWatched) metaParts.push(String(item.yearWatched));
        }
        var poster = AppUtils.getPosterUrl(item.poster);
        ov.innerHTML =
          '<div class="modal-box" style="max-width:420px">' +
          '<p class="modal-title">🎲 Pick for me</p>' +
          '<div style="display:flex;gap:14px;align-items:center;margin:10px 0 18px">' +
          (poster ? '<img src="' + AppUtils.esc(poster) + '" alt="" style="width:72px;height:108px;object-fit:cover;border-radius:10px;flex-shrink:0">' : '<div style="width:72px;height:108px;border-radius:10px;background:rgba(255,255,255,0.06);flex-shrink:0"></div>') +
          '<div style="min-width:0"><p style="font-size:17px;font-weight:700;margin:0 0 6px">' + AppUtils.esc(item.title) + '</p>' +
          '<p class="text-sm text-muted" style="margin:0">' + AppUtils.esc(metaParts.join(' · ')) + '</p></div></div>' +
          '<div class="modal-actions" style="flex-wrap:wrap;gap:8px">' +
          '<button type="button" class="btn btn-primary" id="plr-open">Open Details</button>' +
          (pool.length > 1 ? '<button type="button" class="btn btn-ghost" id="plr-spin">🎲 Spin Again</button>' : '') +
          '<button type="button" class="btn btn-ghost" id="plr-close">Close</button></div></div>';
        ov.querySelector('#plr-open').onclick = function () {
          sessionStorage.setItem('pl-back', window.location.href);
          window.location.href = '/entry.html?id=' + encodeURIComponent(item.id);
        };
        var sp = ov.querySelector('#plr-spin');
        if (sp) sp.onclick = function () {
          cur = pickOne();
          lastId = cur.id;
          paint(cur);
        };
        ov.querySelector('#plr-close').onclick = function () { ov.remove(); };
      }
      ov.addEventListener('click', function (ev) { if (ev.target === ov) ov.remove(); });
      paint(cur);
      document.body.appendChild(ov);
    });
  }

});