// Bulk import movies and series from a plain-text title list.
(function () {
  var state = null, uid = null, input = null, button = null;
  var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var esc = AppUtils.esc;

  function modal(html) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.innerHTML = html;
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function updateButton() {
    if (!button || !state) return;
    button.style.display = state.type === 'game' ? 'none' : 'inline-flex';
    var actions = document.getElementById('media-actions');
    if (actions) actions.style.display = state.type === 'game' ? 'none' : 'flex';
  }

  function showInstructions() {
    var overlay = modal('<div class="modal-box"><p class="modal-title">Import a movie &amp; series list</p>' +
      '<p class="text-sm text-muted" style="line-height:1.6;margin-bottom:16px">Upload a plain-text <strong>.txt</strong> file with one movie or series title per line. You can mix movies and series in the same file; number or bullet prefixes are okay. Review each TMDB match and choose a season for every series before adding.</p>' +
      '<p class="text-sm text-muted" style="margin-bottom:18px">You can import up to 100 titles at a time.</p>' +
      '<div class="modal-actions"><button class="btn btn-ghost" id="mi-instructions-cancel" type="button">Cancel</button>' +
      '<button class="btn btn-primary" id="mi-choose-file" type="button">Choose .txt file</button></div></div>');
    overlay.querySelector('#mi-instructions-cancel').onclick = function () { overlay.remove(); };
    overlay.querySelector('#mi-choose-file').onclick = function () {
      overlay.remove();
      input.click();
    };
  }

  function readLines(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var seen = {};
        var lines = String(reader.result || '').split(/\r?\n/).map(function (line) {
          return line.replace(/^\s*(\d+[.)]|[-*•])\s+/, '').trim();
        }).filter(function (line) {
          var key = line.toLocaleLowerCase();
          if (!line || seen[key]) return false;
          seen[key] = true;
          return true;
        });
        resolve(lines);
      };
      reader.onerror = function () { reject(reader.error || new Error('Could not read file')); };
      reader.readAsText(file);
    });
  }

  function posterImage(result) {
    var url = result && AppUtils.getPosterUrl(result.poster);
    return url
      ? '<img class="result-thumb" alt="" src="' + esc(url) + '" onerror="this.style.display=\'none\'">'
      : '<div class="result-thumb" style="background:#2a2a2a"></div>';
  }

  function yearsOptions() {
    var currentYear = new Date().getFullYear(), options = '<option value="">No year</option>';
    for (var year = currentYear; year >= 1950; year--) options += '<option value="' + year + '">' + year + '</option>';
    return options;
  }

  function renderRow(row, index) {
    var options = row.matches.map(function (match, matchIndex) {
      return '<option value="' + matchIndex + '"' + (row.selected === matchIndex ? ' selected' : '') + '>' +
        esc((match.type === 'series' ? 'Series · ' : 'Movie · ') + match.title + (match.releaseYear ? ' (' + match.releaseYear + ')' : '')) + '</option>';
    }).join('');
    options += '<option value="-1"' + (row.selected < 0 ? ' selected' : '') + '>Skip this title</option>';
    var match = row.matches[row.selected] || null;
    var seasons = '';
    if (match && match.type === 'series') {
      seasons = row.seasons.length
        ? '<label class="label" style="margin-top:8px">Season</label><select class="input-field mi-season" data-i="' + index + '">' +
          row.seasons.map(function (season, seasonIndex) {
            return '<option value="' + seasonIndex + '"' + (seasonIndex === row.seasonSelected ? ' selected' : '') + '>' +
              esc(season.seasonName + (season.airYear ? ' (' + season.airYear + ')' : '')) + '</option>';
          }).join('') + '</select>'
        : '<p class="text-sm" style="color:#ef5a6f;margin-top:8px">' + esc(row.seasonError || 'No seasons found; this title will be skipped.') + '</p>';
    }
    var error = row.error ? '<p class="text-sm" style="color:#ef5a6f;margin-top:6px">' + esc(row.error) + '</p>' : '';
    return '<div class="mi-row" data-i="' + index + '" style="display:flex;gap:10px;padding:12px 0;border-bottom:1px solid var(--border,#333)">' +
      '<div class="mi-poster">' + posterImage(match) + '</div><div style="min-width:0;flex:1">' +
      '<select class="input-field mi-match" data-i="' + index + '" aria-label="Match for ' + esc(row.line) + '">' + options + '</select>' +
      '<small class="text-muted" style="display:block;margin-top:5px">' + esc(row.line) + '</small>' + error + seasons +
      '<div class="mi-watched-fields" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">' +
      '<select class="input-field mi-month" data-i="' + index + '" aria-label="Watched month for ' + esc(row.line) + '">' +
      '<option value="">No date</option>' + monthNames.map(function (month, monthIndex) {
        return '<option value="' + (monthIndex + 1) + '">' + month + '</option>';
      }).join('') + '</select>' +
      '<select class="input-field mi-year" data-i="' + index + '" aria-label="Watched year for ' + esc(row.line) + '">' + yearsOptions() + '</select>' +
      '<select class="input-field mi-rating" data-i="' + index + '" aria-label="Rating for ' + esc(row.line) + '" style="grid-column:1/-1">' +
      '<option value="">No rating</option>' + [1, 2, 3, 4, 5].map(function (rating) {
        return '<option value="' + rating + '">' + esc(AppUtils.ratingToEmoji(rating)) + ' ' + rating + '/5</option>';
      }).join('') + '</select></div></div></div>';
  }

  function searchMatches(query) {
    var failures = [];
    return Promise.all([
      AppTMDB.searchMovies(query).catch(function (error) {
        failures.push(error);
        console.error(error);
        return [];
      }),
      AppTMDB.searchSeries(query).catch(function (error) {
        failures.push(error);
        console.error(error);
        return [];
      })
    ]).then(function (results) {
      if (failures.length === 2) throw failures[0];
      var matches = results[0].concat(results[1]);
      var normalizedQuery = query.toLocaleLowerCase().replace(/\s*\(\d{4}\)\s*$/, '').replace(/[^a-z0-9]/g, '');
      matches.sort(function (a, b) {
        function score(result) {
          var normalizedTitle = result.title.toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
          var exact = normalizedTitle === normalizedQuery ? 2 : normalizedTitle.indexOf(normalizedQuery) === 0 ? 1 : 0;
          var requestedYear = (query.match(/\b(19|20)\d{2}\b/) || [])[0];
          return exact + (requestedYear && result.releaseYear === requestedYear ? 3 : 0);
        }
        return score(b) - score(a);
      });
      return { matches: matches, partial: failures.length > 0 };
    });
  }

  function loadSeasons(row, match) {
    row.seasons = [];
    row.seasonSelected = 0;
    row.seasonError = '';
    if (!match || match.type !== 'series') return Promise.resolve();
    return AppTMDB.getSeriesSeasons(match.tmdbId).then(function (seasons) {
      row.seasons = seasons;
      if (!seasons.length) row.seasonError = 'No seasons found; this title will be skipped.';
    }).catch(function (error) {
      row.seasonError = 'Could not load seasons.';
      console.error(error);
    });
  }

  function importFile(file) {
    readLines(file).then(async function (lines) {
      if (!lines.length) return AppUtils.showToast('No titles found in that file.');
      if (lines.length > 100) {
        lines = lines.slice(0, 100);
        AppUtils.showToast('Using the first 100 lines.');
      }
      var overlay = modal('<div class="modal-box" style="max-height:90vh;overflow-y:auto"><p class="modal-title">Import movies &amp; series</p><p id="mi-progress" class="text-sm text-muted">Starting…</p>' +
        '<div style="height:4px;background:#333;border-radius:4px;overflow:hidden;margin:12px 0"><div id="mi-progress-bar" style="height:100%;width:0;background:var(--accent)"></div></div></div>');
      var rows = [];
      try {
        for (var i = 0; i < lines.length; i++) {
          if (!document.body.contains(overlay)) return;
          overlay.querySelector('#mi-progress').textContent = 'Finding ' + (i + 1) + ' / ' + lines.length + '…';
          overlay.querySelector('#mi-progress-bar').style.width = Math.round(i / lines.length * 100) + '%';
          var row = { line: lines[i], matches: [], selected: -1, seasons: [], seasonSelected: 0, error: '', seasonError: '' };
          try {
            var search = await searchMatches(lines[i]);
            row.matches = search.matches;
            if (search.partial) row.error = 'Some Movie or Series results could not be loaded.';
            if (row.matches.length) row.selected = 0;
            if (row.selected >= 0) await loadSeasons(row, row.matches[row.selected]);
          } catch (error) {
            row.error = 'Search failed. Check your connection and try again.';
            console.error(error);
          }
          rows.push(row);
          if (i < lines.length - 1) await new Promise(function (resolve) { setTimeout(resolve, 120); });
        }
      } catch (error) {
        overlay.remove();
        console.error(error);
        AppUtils.showToast('Could not prepare the import.');
        return;
      }
      if (!document.body.contains(overlay)) return;
      renderPreview(overlay, rows);
    }).catch(function (error) {
      console.error(error);
      AppUtils.showToast('Could not read that text file.');
    });
  }

  function renderPreview(overlay, rows) {
    var playlists = [];
    var rememberedPlaylist = state.playlistId;
    AppDB.getPlaylists(uid).then(function (all) {
      playlists = all.filter(function (playlist) { return (playlist.type || 'media') !== 'game'; });
      if (!document.body.contains(overlay)) return;
      var matched = rows.filter(function (row) { return row.matches.length; }).length;
      var body = '<div class="modal-box" style="max-height:90vh;overflow-y:auto">' +
        '<p class="modal-title">Review import</p><p class="text-sm text-muted" style="margin-bottom:12px">Matched ' + matched + ' of ' + rows.length +
        '. Choose a match or skip each line. Series are added one season at a time.</p>' +
        '<div style="display:flex;gap:8px;margin-bottom:12px"><button class="btn btn-primary mi-mode" data-mode="watched" type="button">✓ All watched</button>' +
        '<button class="btn btn-ghost mi-mode" data-mode="watchlist" type="button">＋ All unwatched</button></div>' +
        '<p id="mi-target-label" class="text-sm text-muted" style="margin:0 0 8px"></p>' +
        '<div id="mi-playlist-picker"><label class="label">Add watched entries to</label><div style="display:flex;gap:8px;margin-bottom:12px">' +
        '<select id="mi-playlist" class="input-field" style="flex:1"></select><input id="mi-new-name" class="input-field" maxlength="40" placeholder="New playlist" style="flex:1">' +
        '<button class="btn btn-ghost" id="mi-create-playlist" type="button" style="width:auto;white-space:nowrap">Create</button></div></div>' +
        '<div class="mi-list">' + rows.map(function (row, index) { return renderRow(row, index); }).join('') + '</div>' +
        '<div class="modal-actions"><button class="btn btn-ghost" id="mi-cancel" type="button">Cancel</button>' +
        '<button class="btn btn-primary" id="mi-save" type="button"></button></div></div>';
      overlay.innerHTML = body;
      var currentMode = 'watched';
      var playlistSelect = overlay.querySelector('#mi-playlist');
      var playlistInput = overlay.querySelector('#mi-new-name');
      var modeButtons = overlay.querySelectorAll('.mi-mode');
      var saveButton = overlay.querySelector('#mi-save');

      function fillPlaylists(selectedId) {
        playlistSelect.innerHTML = playlists.map(function (playlist) {
          return '<option value="' + esc(playlist.id) + '"' + (playlist.id === selectedId ? ' selected' : '') + '>' + esc(playlist.name) + '</option>';
        }).join('');
      }
      fillPlaylists(playlists.some(function (playlist) { return playlist.id === rememberedPlaylist; })
        ? rememberedPlaylist : (playlists[0] && playlists[0].id));

      function updateMode() {
        modeButtons.forEach(function (modeButton) {
          var selected = modeButton.dataset.mode === currentMode;
          modeButton.classList.toggle('btn-primary', selected);
          modeButton.classList.toggle('btn-ghost', !selected);
        });
        var watchlist = currentMode === 'watchlist';
        overlay.querySelector('#mi-playlist-picker').style.display = watchlist ? 'none' : 'block';
        overlay.querySelector('#mi-target-label').textContent = watchlist
          ? 'Unwatched entries will be added to the Watchlist playlist.'
          : 'Watched entries can have an optional date and rating for each title.';
        overlay.querySelectorAll('.mi-watched-fields').forEach(function (fields) {
          fields.style.display = watchlist ? 'none' : 'grid';
        });
        updateSaveButton();
      }
      function updateSaveButton() {
        var count = rows.filter(function (row) {
          return row.selected >= 0 && row.matches[row.selected] &&
            (row.matches[row.selected].type !== 'series' || row.seasons.length > 0);
        }).length;
        saveButton.textContent = 'Add ' + count + ' title' + (count === 1 ? '' : 's');
        saveButton.disabled = count === 0 || (currentMode === 'watched' && !playlistSelect.value);
      }
      function renderMatchRow(index) {
        var old = overlay.querySelector('.mi-row[data-i="' + index + '"]');
        if (!old) return;
        old.outerHTML = renderRow(rows[index], index);
        var fields = overlay.querySelector('.mi-row[data-i="' + index + '"] .mi-watched-fields');
        fields.style.display = currentMode === 'watchlist' ? 'none' : 'grid';
        updateSaveButton();
      }

      modeButtons.forEach(function (modeButton) {
        modeButton.onclick = function () {
          currentMode = modeButton.dataset.mode;
          updateMode();
        };
      });
      overlay.querySelector('.mi-list').addEventListener('change', function (event) {
        var target = event.target, index = Number(target.dataset.i);
        if (!Number.isInteger(index) || !rows[index]) return;
        if (target.classList.contains('mi-match')) {
          rows[index].selected = Number(target.value);
          var selected = rows[index].matches[rows[index].selected];
          if (selected && selected.type === 'series') {
            target.disabled = true;
            loadSeasons(rows[index], selected).then(function () {
              if (!document.body.contains(overlay)) return;
              target.disabled = false;
              renderMatchRow(index);
            });
          } else {
            rows[index].seasons = [];
            rows[index].seasonSelected = 0;
            rows[index].seasonError = '';
            renderMatchRow(index);
          }
        } else if (target.classList.contains('mi-season')) {
          rows[index].seasonSelected = Number(target.value);
          updateSaveButton();
        }
      });
      playlistSelect.addEventListener('change', updateSaveButton);
      overlay.querySelector('#mi-create-playlist').onclick = function () {
        var name = playlistInput.value.trim();
        if (!name) return AppUtils.showToast('Enter a playlist name.');
        var createButton = this;
        createButton.disabled = true;
        AppDB.createPlaylist(uid, name, 'media').then(function (result) {
          playlists.push({ id: result.id, name: name, type: 'media' });
          fillPlaylists(result.id);
          playlistInput.value = '';
          updateSaveButton();
        }).catch(function (error) {
          console.error(error);
          AppUtils.showToast('Could not create that playlist.');
        }).then(function () { createButton.disabled = false; });
      };
      overlay.querySelector('#mi-cancel').onclick = function () { overlay.remove(); };
      saveButton.onclick = function () { saveImport(overlay, rows, currentMode, playlistSelect.value, saveButton); };
      updateMode();
    }).catch(function (error) {
      console.error(error);
      overlay.remove();
      AppUtils.showToast('Could not load your playlists.');
    });
  }

  function isDuplicate(entry, result, season) {
    return entry.type === result.type && entry.tmdbId === result.tmdbId &&
      (result.type !== 'series' || entry.season === season.seasonNumber);
  }

  async function saveImport(overlay, rows, mode, selectedPlaylist, saveButton) {
    var entries;
    try {
      entries = await AppDB.getAllEntries(uid);
    } catch (error) {
      console.error(error);
      AppUtils.showToast('Could not check for existing entries.');
      return;
    }
    var items = [], seen = {};
    rows.forEach(function (row) {
      if (row.selected < 0) return;
      var result = row.matches[row.selected];
      if (!result) return;
      var season = result.type === 'series' ? row.seasons[row.seasonSelected] : null;
      if (result.type === 'series' && !season) return;
      var key = result.type + ':' + result.tmdbId + (season ? ':' + season.seasonNumber : '');
      if (seen[key]) return;
      seen[key] = true;
      if (entries.some(function (entry) { return isDuplicate(entry, result, season); })) return;
      var rowElement = overlay.querySelector('.mi-row[data-i="' + rows.indexOf(row) + '"]');
      var month = mode === 'watched' && rowElement ? (Number(rowElement.querySelector('.mi-month').value) || null) : null;
      var year = mode === 'watched' && rowElement ? (Number(rowElement.querySelector('.mi-year').value) || null) : null;
      items.push({
        result: result,
        season: season,
        month: month && year ? month : null,
        year: month && year ? year : null,
        rating: mode === 'watched' && rowElement ? (Number(rowElement.querySelector('.mi-rating').value) || null) : null
      });
    });
    if (!items.length) return AppUtils.showToast('No new titles to add. Existing titles and skipped lines were left unchanged.');

    saveButton.disabled = true;
    var playlistId;
    try {
      if (mode === 'watchlist') playlistId = await AppDB.getOrCreatePlaylist(uid, 'Watchlist', 'media');
      else playlistId = selectedPlaylist;
      var writes = [];
      for (var i = 0; i < items.length; i++) {
        if (!document.body.contains(overlay)) return;
        overlay.querySelector('#mi-target-label').textContent = 'Preparing ' + (i + 1) + ' / ' + items.length + '…';
        var item = items[i], result = item.result, season = item.season;
        var runtime = 90, genres = [];
        if (result.type === 'movie') {
          try {
            var movie = await AppTMDB.getMovieDetails(result.tmdbId);
            runtime = movie.runtime || 90;
            genres = movie.genres || [];
          } catch (error) {
            console.error(error);
          }
        } else {
          try {
            var details = await Promise.all([
              AppTMDB.getSeasonRuntime(result.tmdbId, season.seasonNumber),
              AppTMDB.getSeriesGenres(result.tmdbId)
            ]);
            runtime = details[0] * (season.episodeCount || 1);
            genres = details[1] || [];
          } catch (error) {
            console.error(error);
            runtime = 30 * (season.episodeCount || 1);
          }
        }
        writes.push({
          playlistId: playlistId,
          title: result.title,
          type: result.type,
          tmdbId: result.tmdbId || null,
          rawgId: null,
          season: season ? season.seasonNumber : null,
          seasonName: season ? season.seasonName : null,
          poster: season ? (season.poster || result.poster) : result.poster,
          releaseYear: parseInt((season ? season.airYear : result.releaseYear) || 0, 10),
          genres: genres,
          runtime: runtime,
          monthWatched: item.month,
          yearWatched: item.year,
          rating: item.rating,
          completionStatus: mode === 'watchlist' ? 'wishlist' : null,
          gameRating: null,
          playtime: null,
          category: null,
          review: null,
          addedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
      if (!document.body.contains(overlay)) return;
      var batch = db.batch();
      writes.forEach(function (entry) {
        batch.set(db.collection('users').doc(uid).collection('entries').doc(), entry);
      });
      await batch.commit();
      localStorage.removeItem('pl-entries');
      overlay.remove();
      var skipped = rows.length - items.length;
      AppUtils.showToast('Added ' + items.length + ' title' + (items.length === 1 ? '' : 's') +
        (skipped ? '; skipped ' + skipped + ' existing, duplicate, or unmatched entr' + (skipped === 1 ? 'y' : 'ies') : '') + ' ✓');
    } catch (error) {
      console.error(error);
      saveButton.disabled = false;
      AppUtils.showToast('Import failed. No entries were saved.');
    }
  }

  window.setupMediaImport = function (addState) {
    state = addState;
    uid = state.uid;
    button = document.getElementById('btn-import-media');
    input = document.getElementById('media-import-file');
    if (!button || !input) return;
    updateButton();
    document.querySelectorAll('.media-tab').forEach(function (tab) {
      tab.addEventListener('click', updateButton);
    });
    button.onclick = showInstructions;
    input.onchange = function () {
      var file = input.files && input.files[0];
      input.value = '';
      if (file) importFile(file);
    };
  };
})();
