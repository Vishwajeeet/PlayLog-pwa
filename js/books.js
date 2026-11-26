(function () {
  var $ = function (id) { return document.getElementById(id); }, esc = AppUtils.esc;
  var uid, BOOKS = [], DESC_PENDING = {}, shelf = null, viewMode = localStorage.getItem('pl-books-view') === 'list' ? 'list' : 'grid';
  var suppressBookTileClick = false, suppressBookTileTimer = null;
  var suppressSeriesTileClick = false, suppressSeriesTileTimer = null;
  var seriesBackfillPending = null, booksListener = null;
  var SERIES_EXPANDED = Object.create(null), SERIES_ONLY_LIBRARY = Object.create(null);
  var SERIES_BOUNCE = Object.create(null), SERIES_COLLAPSE = Object.create(null);
  var SERIES_CATALOG = Object.create(null), SERIES_PENDING = Object.create(null), SERIES_ERRORS = Object.create(null);
  var SERIES_UPDATED_AT = Object.create(null), SERIES_CACHE_TTL = 12 * 60 * 60 * 1000;
  var SERIES_CACHE_PREFIX = 'pl-books-series-catalog-v1:';
  var ST = { want: 'Want to Read', reading: 'Reading', read: 'Read' };
  var col = function () { return db.collection('users').doc(uid).collection('entries'); };

  function src(u) { return typeof u === 'string' && /^(https:\/\/covers\.openlibrary\.org\/|data:image\/(jpeg|png|webp);base64,)/.test(u) ? u : ''; }
  function ymd(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function has(k) { return !!k && BOOKS.some(function (b) { return b.olKey === k; }); }
  function cov(b, x) {
    var s = src(b.poster);
    return '<div class="bk-cov">' + (s ? '<img loading="lazy" alt="" src="' + esc(s) + '" onerror="this.style.display=\'none\'">' : '<em>' + esc((b.title || '').slice(0, 40)) + '</em>') + (x || '') + '</div>';
  }
  function tile(b) {
    return '<button type="button" class="bk-tile" data-id="' + esc(b.id) + '">' +
      cov(b, b.bookStatus === 'read' && b.bookRating
        ? '<span class="badge badge-tr badge-rating-big">' + Number(b.bookRating) + '</span>'
        : '') +
      '<p class="bk-t">' + esc(b.title) + '</p><p class="bk-a">' + esc(b.author) + '</p></button>';
  }
  function seriesEntries(seriesKey, seriesName) {
    var name = (seriesName || '').trim().toLowerCase();
    return BOOKS.filter(function (book) {
      return (seriesKey && book.seriesKey === seriesKey) ||
        (name && (book.seriesName || '').trim().toLowerCase() === name);
    });
  }
  function seriesKeyPriority(key) { return /^OL\d+L$/.test(key || '') ? 2 : key ? 1 : 0; }
  function seriesPosterFor(seriesKey, seriesName) {
    var entry = seriesEntries(seriesKey, seriesName).filter(function (book) { return !!book.seriesPoster; })[0];
    return entry ? entry.seriesPoster : null;
  }
  function seriesBookTile(book, tracked) {
    var statusBadge = '';
    if (!tracked) {
      statusBadge = '<span class="bk-series-status">Not in library</span>';
    } else if (tracked.bookStatus === 'read') {
      if (tracked.bookRating) statusBadge = '<span class="badge badge-tr badge-rating-big">' + Number(tracked.bookRating) + '</span>';
    } else {
      statusBadge = '<span class="bk-series-status">' + esc(ST[tracked.bookStatus] || 'In library') + '</span>';
    }
    var displayBook = tracked && tracked.poster ? Object.assign({}, book, { poster: tracked.poster }) : book;
    return '<button type="button" class="bk-tile ' + (tracked ? 'bk-series-owned' : 'bk-series-unowned') + '"' +
      (tracked ? ' data-id="' + esc(tracked.id) + '"' : ' disabled aria-disabled="true"') + '>' +
      cov(displayBook, statusBadge) +
      '<p class="bk-t">' + esc(book.title) + '</p><p class="bk-a">' + esc(book.author) + '</p></button>';
  }
  function findLibraryBook(book) {
    if (book.olKey) {
      var exact = BOOKS.filter(function (candidate) { return candidate.olKey === book.olKey; })[0];
      if (exact) return exact;
    }
    var normalize = function (value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
    var title = normalize(book.title), author = normalize(book.author);
    if (!title) return null;
    var candidates = BOOKS.filter(function (candidate) { return normalize(candidate.title) === title; });
    if (!author) return candidates.length === 1 ? candidates[0] : null;
    var sameAuthor = candidates.filter(function (candidate) { return normalize(candidate.author) === author; });
    if (sameAuthor.length) return sameAuthor[0];
    return candidates.length === 1 && !normalize(candidates[0].author) ? candidates[0] : null;
  }
  function releaseOrder(books, catalog) {
    var years = Object.create(null), order = Object.create(null);
    (catalog || []).forEach(function (book, index) {
      if (book.olKey) order[book.olKey] = Number(book.seriesNumber) || index + 1;
      if (book.olKey && Number(book.year)) years[book.olKey] = Number(book.year);
    });
    return books.slice().sort(function (a, b) {
      var ay = Number(a.releaseYear) || Number(a.year) || years[a.olKey] || Number.MAX_SAFE_INTEGER;
      var by = Number(b.releaseYear) || Number(b.year) || years[b.olKey] || Number.MAX_SAFE_INTEGER;
      var an = order[a.olKey] || Number(a.seriesNumber) || Number.MAX_SAFE_INTEGER;
      var bn = order[b.olKey] || Number(b.seriesNumber) || Number.MAX_SAFE_INTEGER;
      return an - bn || ay - by || (a.title || '').localeCompare(b.title || '');
    });
  }
  function ensureSeriesCatalog(key) {
    if (!key || SERIES_PENDING[key]) return;
    var now = Date.now(), hasMemoryCatalog = Object.prototype.hasOwnProperty.call(SERIES_CATALOG, key);
    if (hasMemoryCatalog && now - (SERIES_UPDATED_AT[key] || 0) < SERIES_CACHE_TTL) return;
    if (!hasMemoryCatalog) {
      var cacheKey = SERIES_CACHE_PREFIX + encodeURIComponent(key), raw = null, cached = null;
      try {
        raw = localStorage.getItem(cacheKey);
      } catch (error) {
        console.warn('Could not read the cached Open Library series.', error);
      }
      if (raw) {
        try {
          cached = JSON.parse(raw);
        } catch (error) {
          console.warn('Could not parse the cached Open Library series.', error);
        }
        if (!cached || cached.version !== 1 || !Number.isFinite(cached.updatedAt) ||
            !Array.isArray(cached.books) || !cached.books.every(function (book) { return book && typeof book.title === 'string'; })) {
          try {
            localStorage.removeItem(cacheKey);
          } catch (error) {
            console.warn('Could not remove an invalid Open Library series cache.', error);
          }
          cached = null;
        }
      }
      if (cached) {
        SERIES_CATALOG[key] = cached.books;
        SERIES_UPDATED_AT[key] = cached.updatedAt;
        if (now - cached.updatedAt < SERIES_CACHE_TTL) return;
      }
    }
    if (SERIES_ERRORS[key]) return;
    SERIES_PENDING[key] = AppOL.seriesBooks(key).then(function (books) {
      SERIES_CATALOG[key] = books;
      SERIES_UPDATED_AT[key] = Date.now();
      delete SERIES_PENDING[key];
      try {
        localStorage.setItem(SERIES_CACHE_PREFIX + encodeURIComponent(key), JSON.stringify({
          version: 1,
          updatedAt: SERIES_UPDATED_AT[key],
          books: books.map(function (book) {
            return {
              olKey: book.olKey || null,
              title: book.title || '',
              author: book.author || '',
              year: Number(book.year) || null,
              poster: book.poster || null,
              seriesKey: book.seriesKey || null,
              seriesName: book.seriesName || null,
              seriesPosition: book.seriesPosition || null,
              seriesNumber: Number(book.seriesNumber) || null
            };
          })
        }));
      } catch (error) {
        console.warn('Could not cache the Open Library series.', error);
      }
      delete SERIES_ERRORS[key];
      render();
    }).catch(function (error) {
      delete SERIES_PENDING[key];
      SERIES_ERRORS[key] = true;
      var hasCachedCatalog = Object.prototype.hasOwnProperty.call(SERIES_CATALOG, key);
      console.error(hasCachedCatalog ? 'Could not refresh the cached Open Library series.' : 'Could not load Open Library series books.', error);
      AppUtils.showToast(hasCachedCatalog ? 'Could not refresh this series; showing cached titles.' : 'Could not load this series from Open Library.');
      render();
    });
  }
  function modal(html) {
    var ov = document.createElement('div');
    ov.className = 'modal-overlay open'; ov.innerHTML = html;
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov); return ov;
  }
  function shrink(file, cb, onerror) {
    var r = new FileReader();
    function fail() {
      if (onerror) onerror();
      else AppUtils.showToast('Could not load the image.');
    }
    r.onerror = fail;
    r.onload = function (e) {
      var im = new Image();
      im.onload = function () {
        var k = Math.min(1, 300 / im.width), c = document.createElement('canvas');
        c.width = im.width * k; c.height = im.height * k;
        var context = c.getContext('2d');
        if (!context) return fail();
        context.drawImage(im, 0, 0, c.width, c.height);
        cb(c.toDataURL('image/jpeg', 0.72));
      };
      im.onerror = fail;
      im.src = e.target.result;
    };
    r.readAsDataURL(file);
  }
  function bookDoc(m, st, openLibraryRating) {
    var n = new Date();
    var d = { type: 'book', title: m.title, author: m.author || '', poster: m.poster || null, pages: m.pages || null,
      genres: m.genres || [], fiction: m.fiction !== false, olKey: m.olKey || null, bookStatus: st, bookRating: null,
      seriesKey: m.seriesKey || null, seriesName: m.seriesName || null,
      seriesPosition: m.seriesPosition || null, seriesNumber: Number(m.seriesNumber) || null,
      seriesMetadataChecked: !!m.olKey, seriesMetadataVersion: 3, releaseYear: Number(m.year) || null,
      seriesPoster: m.seriesPoster || seriesPosterFor(m.seriesKey, m.seriesName),
      review: null, startDate: null, finishDate: st === 'read' ? ymd(n) : null,
      finishMonth: st === 'read' ? n.getMonth() + 1 : null, finishYear: st === 'read' ? n.getFullYear() : null,
      playlistId: null, addedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (st === 'want') { d.openLibraryRating = openLibraryRating; d.openLibraryRatingFetched = true; }
    return d;
  }

  var lastBooksSig = '';

  function booksSignature(list) {
    return (list || []).map(function (b) {
      return [b.id, b.title, b.author, b.bookStatus, b.bookRating, b.finishDate, b.seriesName, b.seriesKey, b.seriesPoster, b.pages, b.reReadCount].join('|');
    }).join(';;');
  }

  function checkBookTrophies() {
    if (!window.AppTrophies || !uid) return;
    var loader = (window.AppDB && AppDB.getAllEntries)
      ? AppDB.getAllEntries(uid).catch(function () { return []; })
      : Promise.resolve([]);
    loader.then(function (entries) {
      var isInit = localStorage.getItem('pl_trophies_init');
      if (!isInit) {
        var initialEval = AppTrophies.evaluateBadges(entries, BOOKS);
        AppTrophies.setAcknowledged(initialEval.badges.filter(function (b) { return b.unlocked; }).map(function (b) { return b.id; }));
        localStorage.setItem('pl_trophies_init', '1');
      } else {
        var celebration = AppTrophies.checkNewAchievements(entries, BOOKS);
        if (celebration.hasNew) {
          AppTrophies.showHomeCelebrationModal(celebration.newBadges, function () {
            celebration.acknowledgeAll();
          });
        }
      }
    });
  }

  /* ---------- render ---------- */
  function load() {
    return AppDB.getBooks(uid).then(function (l) {
      BOOKS = l;
      lastBooksSig = booksSignature(l);
      if (['want', 'reading', 'read', 'series'].indexOf(shelf) === -1) {
        shelf = BOOKS.some(function (b) { return b.bookStatus === 'read'; }) ? 'read' :
          BOOKS.some(function (b) { return b.bookStatus === 'want'; }) ? 'want' :
            BOOKS.some(function (b) { return b.bookStatus === 'reading'; }) ? 'reading' : 'want';
      }
      render();
      listenForBookChanges();
      checkBookTrophies();
      backfillSeriesMetadata(l).then(function (found) {
        if (found) render();
      }).catch(function (error) {
        console.error('Could not fetch Open Library series information.', error);
        AppUtils.showToast('Could not update series details from Open Library.');
      });
    }).catch(function () { AppUtils.showToast('Failed to load books.'); });
  }

  function listenForBookChanges() {
    if (booksListener) return;
    var skipFirstSnapshot = true;
    booksListener = col().where('type', '==', 'book').onSnapshot(function (snapshot) {
      var list = snapshot.docs.map(function (doc) { return Object.assign({ id: doc.id }, doc.data()); });
      var addedAt = function (book) { return book.addedAt && book.addedAt.toMillis ? book.addedAt.toMillis() : 9e15; };
      list.sort(function (a, b) { return addedAt(b) - addedAt(a); });
      var sig = booksSignature(list);
      if (skipFirstSnapshot && sig === lastBooksSig) {
        skipFirstSnapshot = false;
        return;
      }
      skipFirstSnapshot = false;
      BOOKS = list;
      lastBooksSig = sig;
      try {
        var slim = list.map(function (row) {
          var copy = Object.assign({}, row);
          if (copy.addedAt && copy.addedAt.toMillis) copy._addedMs = copy.addedAt.toMillis();
          delete copy.addedAt;
          return copy;
        });
        localStorage.setItem('pl-books-data', JSON.stringify({ uid: uid, t: Date.now(), data: slim }));
      } catch (e) {}
      render();
      checkBookTrophies();
      backfillSeriesMetadata(BOOKS).then(function (found) {
        if (found) render();
      }).catch(function (error) {
        console.error('Could not fetch Open Library series information.', error);
        AppUtils.showToast('Could not update series details from Open Library.');
      });
    }, function (error) {
      console.error('Could not keep the book library up to date.', error);
      AppUtils.showToast('Could not keep the book library up to date.');
    });
  }

  function backfillSeriesMetadata(books) {
    if (seriesBackfillPending) return seriesBackfillPending;
    var pending = books.filter(function (book) {
      return (Number(book.seriesMetadataVersion) || 0) < 3 && /^\/works\/OL\d+W$/.test(book.olKey || '');
    });
    if (!pending.length) return Promise.resolve(false);

    var chunks = [];
    for (var i = 0; i < pending.length; i += 30) chunks.push(pending.slice(i, i + 30));
    var found = false;
    var operation = chunks.reduce(function (chain, chunk) {
      return chain.then(function () {
        var keys = chunk.map(function (book) { return book.olKey; });
        return AppOL.seriesMetadata(keys).then(function (metadata) {
          var batch = db.batch(), updates = [];
          chunk.forEach(function (book) {
            var fresh = metadata[book.olKey] || {};
            var update = { seriesMetadataChecked: true, seriesMetadataVersion: 3 };
            ['seriesKey', 'seriesName', 'seriesPosition', 'seriesNumber', 'releaseYear'].forEach(function (field) {
              if (!book[field] && fresh[field] != null) update[field] = fresh[field];
            });
            if ((!book.seriesName && fresh.seriesName) || (!book.seriesKey && fresh.seriesKey)) found = true;
            batch.update(col().doc(book.id), update);
            updates.push([book, update]);
          });
          return batch.commit().then(function () {
            updates.forEach(function (pair) {
              Object.assign(pair[0], pair[1]);
              var current = BOOKS.filter(function (item) { return item.id === pair[0].id; })[0];
              if (current) Object.assign(current, pair[1]);
            });
          });
        });
      });
    }, Promise.resolve()).then(function () { return found; });
    seriesBackfillPending = operation.then(function (value) {
      seriesBackfillPending = null;
      return value;
    }, function (error) {
      seriesBackfillPending = null;
      throw error;
    });
    return seriesBackfillPending;
  }
  function render() { hero(); folders(); lib(); }

  function hero() {
    var rdg = BOOKS.filter(function (b) { return b.bookStatus === 'reading'; }), yr = new Date().getFullYear();
    var rd = BOOKS.filter(function (b) { return b.bookStatus === 'read'; });
    var readCount = rd.reduce(function (total, b) {
      return total + 1;
    }, 0);
    var ty = readInstances().filter(function (b) { return !b._reRead && b.finishYear === yr; }).length;
    var wn = BOOKS.filter(function (b) { return b.bookStatus === 'want'; }).length;
    $('bk-hero').innerHTML = '<div><p class="bk-eyebrow">MY BOOKS</p><h2 class="bk-serif">' +
      (rdg.length ? 'Currently reading' : BOOKS.length ? 'Pick your next read' : 'Start your shelf') + '</h2><div class="bk-chips">' +
      '<span class="bk-chip">' + readCount + ' read</span><span class="bk-chip">' + ty + ' in ' + yr + '</span><span class="bk-chip">' + wn + ' to read</span></div></div>' +
      (rdg.length ? '<div class="bk-now">' + rdg.slice(0, 6).map(function (b) {
        return '<button type="button" class="bk-now-item" data-id="' + esc(b.id) + '">' + cov(b) +
          '<span class="bk-now-info"><strong>' + esc(b.title) + '</strong><small>' + esc(b.author) + '</small></span></button>';
      }).join('') + '</div>' : '');
  }
  function folders() {
    var statusFolders = ['want', 'reading', 'read'].map(function (k) {
      var books = BOOKS.filter(function (b) { return b.bookStatus === k; });
      var count = books.length, displayBooks = books.slice(0, 3);
      var label = k === 'want' ? 'To Read' : k === 'reading' ? 'Reading' : 'Read';
      var posters = displayBooks.map(function (b) {
        var image = src(b.poster);
        return image
          ? '<img class="mini-poster" loading="lazy" alt="" src="' + esc(image) + '" onerror="this.style.visibility=\'hidden\'">'
          : '<div class="mini-poster"></div>';
      }).join('');
      while (displayBooks.length < 3) {
        posters += '<div class="mini-poster"></div>';
        displayBooks.push(null);
      }
      var firstArt = books[0] && src(books[0].poster) ? src(books[0].poster) : '';
      return '<button type="button" class="playlist-card bk-folder-card' + (k === shelf ? ' is-selected' : '') +
        '" data-v="' + k + '" aria-pressed="' + (k === shelf) + '"' +
        (firstArt ? ' style="--art:url(\'' + esc(firstArt) + '\')"' : '') + '><span class="playlist-card-name">' + label +
        '</span><span class="playlist-card-count">' + count + ' book' +
        (count === 1 ? '' : 's') + '</span><span class="mini-posters">' + posters + '</span></button>';
    }).join('');
    var seriesByName = Object.create(null);
    BOOKS.forEach(function (book) {
      var name = (book.seriesName || '').trim(), key = name.toLowerCase();
      if (!key) return;
      if (!seriesByName[key]) {
        seriesByName[key] = { name: name, seriesKey: book.seriesKey || '', poster: book.poster || null };
      }
      if (seriesKeyPriority(book.seriesKey) > seriesKeyPriority(seriesByName[key].seriesKey)) {
        seriesByName[key].seriesKey = book.seriesKey;
      }
    });
    var seriesList = Object.keys(seriesByName).map(function (key) { return seriesByName[key]; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    var seriesPosters = seriesList.slice(0, 3).map(function (series) {
      var image = src(seriesPosterFor(series.seriesKey, series.name) || series.poster);
      return image
        ? '<img class="mini-poster" loading="lazy" alt="" src="' + esc(image) + '" onerror="this.style.visibility=\'hidden\'">'
        : '<div class="mini-poster"></div>';
    }).join('');
    for (var i = seriesList.length; i < 3; i++) seriesPosters += '<div class="mini-poster"></div>';
    var seriesFirstArt = seriesList[0] ? src(seriesPosterFor(seriesList[0].seriesKey, seriesList[0].name) || seriesList[0].poster) : '';
    var seriesFolder = '<button type="button" class="playlist-card bk-folder-card' + (shelf === 'series' ? ' is-selected' : '') +
      '" data-v="series" aria-pressed="' + (shelf === 'series') + '"' +
      (seriesFirstArt ? ' style="--art:url(\'' + esc(seriesFirstArt) + '\')"' : '') + '><span class="playlist-card-name">Series</span>' +
      '<span class="playlist-card-count">' + seriesList.length + ' series</span><span class="mini-posters">' + seriesPosters + '</span></button>';
    $('bk-folders').innerHTML = statusFolders + seriesFolder;
  }
  function lib() {
    var focusedSeriesKey = document.activeElement && document.activeElement.matches('[data-series-toggle]')
      ? document.activeElement.dataset.seriesKey : null;
    var focusedSeriesFilterKey = document.activeElement && document.activeElement.matches('.bk-series-library-only')
      ? document.activeElement.dataset.seriesKey : null;
    var q = $('bk-q').value.trim().toLowerCase(), s = $('bk-sort').value;
    var seriesShelf = shelf === 'series';
    var l = BOOKS.filter(function (b) {
      return (seriesShelf ? !!(b.seriesName || '').trim() : b.bookStatus === shelf) &&
        (!q || ((b.title || '') + ' ' + (b.author || '') + ' ' + (b.seriesName || '')).toLowerCase().indexOf(q) > -1);
    });
    var T = function (b) { return (b.title || '').toLowerCase(); };
    if (s === 'title') l.sort(function (a, b) { return T(a) < T(b) ? -1 : 1; });
    else if (s === 'rating') l.sort(function (a, b) { return (b.bookRating || 0) - (a.bookRating || 0); });
    else if (s === 'pages') l.sort(function (a, b) { return (b.pages || 0) - (a.pages || 0); });
    else if (s === 'finished') l.sort(function (a, b) { return (b.finishDate || '').localeCompare(a.finishDate || ''); });
    var shelfHeading = $('bk-shelf-heading');
    var shelfTitle = shelf === 'series' ? 'Series' : shelf === 'read' ? 'Read' : shelf === 'reading' ? 'Reading' : 'To Read';
    if (shelfHeading) shelfHeading.textContent = shelfTitle + ' (' + l.length + ')';
    var randBtn = $('bk-random');
    if (randBtn) {
      randBtn.style.display = (!seriesShelf && shelf === 'want' && l.length >= 2) ? '' : 'none';
      randBtn._pool = l;
    }
    var shelfHeading = $('bk-shelf-heading');
    var shelfTitle = seriesShelf ? 'Series' : shelf === 'read' ? 'Read' : shelf === 'reading' ? 'Reading' : 'To Read';
    if (shelfHeading) shelfHeading.textContent = shelfTitle + ' (' + l.length + ')';
    var randBtn = $('bk-random');
    if (randBtn) {
      randBtn.style.display = (!seriesShelf && shelf === 'want' && l.length >= 2) ? '' : 'none';
      randBtn._pool = l;
    }
    var grid = $('bk-grid');
    grid.classList.toggle('is-list', viewMode === 'list');
    var groups = Object.create(null), items = [];
    l.forEach(function (book) {
      var name = (book.seriesName || '').trim(), key = name.toLowerCase();
      if (!seriesShelf || !key) { items.push({ book: book }); return; }
      var seriesId = book.seriesKey || '';
      var groupKey = 'name:' + key;
      if (!groups[groupKey]) {
        groups[groupKey] = { name: name, seriesKey: seriesId, seriesPoster: book.seriesPoster || null, books: [] };
        items.push({ group: groups[groupKey], key: groupKey });
      }
      if (seriesKeyPriority(seriesId) > seriesKeyPriority(groups[groupKey].seriesKey)) groups[groupKey].seriesKey = seriesId;
      if (!groups[groupKey].seriesPoster && book.seriesPoster) groups[groupKey].seriesPoster = book.seriesPoster;
      groups[groupKey].books.push(book);
    });
    grid.innerHTML = items.map(function (item) {
      if (!item.group) return tile(item.book);
      var catalog = item.group.seriesKey && SERIES_CATALOG[item.group.seriesKey];
      var groupBooks = releaseOrder(item.group.books, catalog);
      var canExpand = groupBooks.length > 1 || !!item.group.seriesKey;
      if (!canExpand) return tile(groupBooks[0]);
      var expandedKey = encodeURIComponent(item.key);
      var expanded = !!SERIES_EXPANDED[expandedKey];
      var bounceOnExpand = !!SERIES_BOUNCE[expandedKey];
      var bounceOnCollapse = !!SERIES_COLLAPSE[expandedKey];
      delete SERIES_BOUNCE[expandedKey];
      delete SERIES_COLLAPSE[expandedKey];
      var onlyInLibrary = Object.prototype.hasOwnProperty.call(SERIES_ONLY_LIBRARY, expandedKey)
        ? SERIES_ONLY_LIBRARY[expandedKey] : true;
      if (expanded && item.group.seriesKey) ensureSeriesCatalog(item.group.seriesKey);
      catalog = item.group.seriesKey && SERIES_CATALOG[item.group.seriesKey];
      var seriesLibrary = seriesEntries(item.group.seriesKey, item.group.name), matchedIds = Object.create(null);
      var catalogRows = catalog ? catalog.map(function (book) {
        var tracked = findLibraryBook(book);
        if (tracked) matchedIds[tracked.id] = true;
        return { book: book, tracked: tracked };
      }) : [];
      var unlisted = seriesLibrary.filter(function (book) { return !matchedIds[book.id]; });
      var totalBooks = catalog ? catalog.length + unlisted.length : seriesLibrary.length;
      var inLibraryCount = catalogRows.filter(function (row) { return !!row.tracked; }).length + unlisted.length;
      var booksHtml = '';
      if (expanded) {
        if (catalog) {
          var visibleCatalogRows = onlyInLibrary ? catalogRows.filter(function (row) { return !!row.tracked; }) : catalogRows;
          booksHtml = visibleCatalogRows.map(function (row) { return seriesBookTile(row.book, row.tracked); }).join('') +
            releaseOrder(unlisted, catalog).map(function (book) { return seriesBookTile(book, book); }).join('');
        } else {
          booksHtml = releaseOrder(seriesLibrary, catalog).map(function (book) { return seriesBookTile(book, book); }).join('');
        }
      }
      var shelfLabel = shelf === 'series' ? 'library' : shelf === 'read' ? 'Read' : shelf === 'reading' ? 'Reading' : 'To Read';
      var statusText = !expanded
        ? groupBooks[0].author || ''
        : onlyInLibrary
          ? (seriesShelf ? inLibraryCount : groupBooks.length) + ' in ' + shelfLabel
          : catalog ? totalBooks + ' total' : 'Loading series…';
      var notice = '';
      if (expanded && !item.group.seriesKey) {
        notice = '<p class="bk-series-notice">Full series list is unavailable for this entry.</p>';
      } else if (expanded && item.group.seriesKey && SERIES_ERRORS[item.group.seriesKey]) {
        notice = '<button type="button" class="bk-series-notice bk-series-retry" data-series-retry="' + esc(item.group.seriesKey) + '">Couldn’t refresh the full series. Tap to retry.</button>';
      } else if (expanded && item.group.seriesKey && !catalog) {
        notice = '<p class="bk-series-notice">Loading all books in this series…</p>';
      } else if (expanded && catalog && !catalog.length) {
        notice = '<p class="bk-series-notice">Open Library has no books listed for this series.</p>';
      }
      var libraryFilterTitle = onlyInLibrary
        ? 'Showing library books only (tap for full series)'
        : 'Showing full series (tap for library books only)';
      var libraryOnlyControl = expanded && item.group.seriesKey
        ? '<button type="button" class="bk-series-library-only" data-series-library-only data-series-key="' +
          esc(expandedKey) + '" aria-label="' + libraryFilterTitle + '" title="' + libraryFilterTitle + '" aria-pressed="' + onlyInLibrary + '">' +
          (onlyInLibrary
            ? '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2.5h8v11l-4-2.8-4 2.8z"/></svg>'
            : '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/></svg>') +
          '</button>'
        : '';
      var coverCount = !expanded ? null : onlyInLibrary ? inLibraryCount : catalog ? totalBooks : null;
      var posterBook = Object.assign({}, groupBooks[0], { poster: item.group.seriesPoster || groupBooks[0].poster });
      var seriesToggleAttrs = 'data-series-toggle data-series-key="' + esc(expandedKey) + '" data-series-id="' +
        esc(item.group.seriesKey) + '" data-series-name="' + esc(item.group.name) + '" aria-expanded="' + expanded + '"';
      var seriesToggleLabel = esc((expanded ? 'Collapse ' : 'Expand ') + item.group.name);
      return '<section class="bk-series-group' + (expanded ? ' is-expanded' : '') +
        (bounceOnExpand ? ' is-expanding' : '') + (bounceOnCollapse ? ' is-collapsing' : '') + '">' +
        '<div class="bk-series-card-wrap"><div class="bk-series-cover-controls">' +
        '<button type="button" class="bk-tile bk-series-card" ' + seriesToggleAttrs + ' aria-label="' + seriesToggleLabel + '">' +
        cov(posterBook, (coverCount == null ? '' : '<span class="bk-series-cover-count">' + coverCount + '</span>') +
          '<span class="bk-series-expand-indicator" aria-hidden="true"><svg viewBox="0 0 16 16"><polyline points="6 3 11 8 6 13"/></svg></span>') +
        '</button>' + libraryOnlyControl + '</div><button type="button" class="bk-tile bk-series-title-toggle" ' +
        seriesToggleAttrs + ' aria-label="' + seriesToggleLabel + '"><p class="bk-t">' + esc(item.group.name) +
        '</p><p class="bk-a">' + esc(statusText) + '</p></button></div><div class="bk-series-books">' +
        booksHtml + notice + '</div></section>';
    }).join('') || '<p class="bk-empty">' + (q ? 'No matches.' : shelf === 'series'
      ? 'No series yet. Assign a series from a book’s details.' : 'Nothing on this shelf yet. Tap “Add Book”.') + '</p>';
    $('bk-view').querySelectorAll('[data-view]').forEach(function (button) {
      var active = button.dataset.view === viewMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (focusedSeriesKey) {
      var cards = grid.querySelectorAll('[data-series-toggle]');
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].dataset.seriesKey === focusedSeriesKey) {
          cards[i].focus();
          break;
        }
      }
    }
    if (focusedSeriesFilterKey) {
      var filters = grid.querySelectorAll('[data-series-library-only]');
      for (var j = 0; j < filters.length; j++) {
        if (filters[j].dataset.seriesKey === focusedSeriesFilterKey) {
          filters[j].focus();
          break;
        }
      }
    }
  }

  /* ---------- re-read helpers ---------- */

  function rereadData(b) {
    var validDates = Array.isArray(b.reReadDates)
      ? b.reReadDates.filter(function (date) { return /^\d{4}-\d{2}-\d{2}$/.test(date); })
      : [];
    var dates = validDates.filter(function (date) { return date !== b.finishDate; });
    var legacyCount = Math.max(0, Math.floor(Number(b.reReadCount) || 0));
    return {
      dates: dates,
      count: dates.length || legacyCount
    };
  }

  function readInstances() {
    var reads = [];
    BOOKS.forEach(function (b) {
      if (b.bookStatus !== 'read' || !b.finishYear) return;
      reads.push(Object.assign({}, b));
      var rereads = rereadData(b), dates = rereads.dates, count = rereads.count;
      for (var i = 0; i < count; i++) {
        var date = dates[i] || b.finishDate;
        var year = date ? +date.slice(0, 4) : b.finishYear, month = date ? +date.slice(5, 7) : b.finishMonth;
        reads.push(Object.assign({}, b, { finishDate: date, finishYear: year, finishMonth: month, _reRead: true }));
      }
    });
    return reads;
  }

  /* ---------- detail ---------- */
  function detail(b) {
    var hasReview = typeof b.review === 'string' && b.review.trim().length > 0;
    var rt = '';
    if (b.bookStatus === 'read' && b.startDate && b.finishDate) {
      var d = Math.round((new Date(b.finishDate) - new Date(b.startDate)) / 864e5) + 1;
      if (d > 0) rt = 'You took ' + d + ' day' + (d > 1 ? 's' : '') + ' to finish this book';
    } else if (b.bookStatus === 'reading' && b.startDate) {
      var elapsed = Math.floor((new Date(ymd()) - new Date(b.startDate)) / 864e5) + 1;
      if (elapsed > 0) rt = 'You are reading this book since ' + elapsed + ' day' + (elapsed > 1 ? 's' : '');
    }
    var rows = [];
    if (b.bookStatus === 'read' && b.bookRating) rows.push(['Rating', '★ ' + Number(b.bookRating) + ' / 10']);
    if (b.bookStatus === 'want' && b.openLibraryRatingFetched && b.openLibraryRating && Number(b.openLibraryRating.average)) {
      var olRating = Number(b.openLibraryRating.average), olCount = Number(b.openLibraryRating.count) || 0;
      rows.push(['Open Library rating', '★ ' + olRating.toFixed(1) + ' / 5' + (olCount ? ' · ' + olCount.toLocaleString() + ' ratings' : '')]);
    }
    if (b.finishDate && b.bookStatus === 'read') rows.push(['Finished', b.finishDate]);
    if (b.startDate && b.bookStatus !== 'want') rows.push(['Started', b.startDate]);
    if (rt) rows.push(['Reading time', rt]);
    var rereads = rereadData(b).count;
    if (b.bookStatus === 'read') rows.push(['Re-read', rereads + ' time' + (rereads === 1 ? '' : 's')]);
    var hasSeries = !!(b.seriesName || b.seriesKey);
    var seriesLabel = b.seriesName || (hasSeries ? 'Series metadata found' : 'Not assigned');
    if (Number(b.seriesNumber)) seriesLabel += ' · Book ' + Number(b.seriesNumber);
    var nextBook = nextInSeries(b);
    var chips = ['<span class="bk-chip">' + ST[b.bookStatus] + '</span>'];
    if (b.pages) chips.push('<span class="bk-chip">' + Number(b.pages) + ' pages</span>');
    chips.push('<span class="bk-chip">' + (b.fiction === false ? 'Non-fiction' : 'Fiction') + '</span>');
    (b.genres || []).slice(0, 3).forEach(function (g) { chips.push('<span class="bk-chip">' + esc(g) + '</span>'); });
    var ov = modal('<div class="modal-box bk-sheet bk-detail-modal"><button class="bk-detail-close" id="bd-x" type="button" aria-label="Close details">&times;</button><div class="bk-det"><div class="bk-det-c">' + cov(b) + '</div><div class="bk-det-i"><h2 class="bk-serif">' + esc(b.title) + '</h2><p class="text-sm text-muted" style="margin-bottom:10px">' + esc(b.author) + '</p><div class="bk-chips">' + chips.join('') + '</div></div></div>' +
      (rows.length ? '<div class="detail-card">' + rows.map(function (r) { return '<div class="detail-row"><span class="detail-label">' + r[0] + '</span><span class="detail-value">' + esc(r[1]) + '</span></div>'; }).join('') + '</div>' : '') +
      '<div class="detail-card bk-detail-series"><div class="detail-row"><span class="detail-label">Series</span><span class="detail-value">' + esc(seriesLabel) + '</span></div>' +
      '<button class="btn btn-ghost" id="bd-series-find" type="button">' + (hasSeries ? 'Search / change series' : 'Find series') + '</button></div>' +
      '<div class="bk-series-picker" id="bd-series-picker" style="display:none">' +
      '<p class="text-sm text-muted">Search Open Library records and choose a result with the right series. If it is not listed, enter the series name manually.</p>' +
      '<label class="label" for="bd-series-q">Search series</label><input id="bd-series-q" class="input-field" maxlength="100" placeholder="e.g. Sherlock Holmes" value="' + esc(b.seriesName || '') + '">' +
      '<p class="text-sm text-muted bk-series-search-status" id="bd-series-status" aria-live="polite"></p><div class="bk-series-search-results" id="bd-series-results"></div>' +
      '<label class="label" for="bd-series-name">Series name</label><input id="bd-series-name" class="input-field" maxlength="100" value="' + esc(b.seriesName || '') + '">' +
      '<label class="label" for="bd-series-number">Book number (optional)</label><input id="bd-series-number" type="number" min="0.1" step="0.1" class="input-field" value="' + (Number(b.seriesNumber) || '') + '">' +
      '<div class="modal-actions"><button class="btn btn-danger" id="bd-series-remove" type="button"' + (hasSeries ? '' : ' style="display:none"') + '>Remove series</button><button class="btn btn-ghost" id="bd-series-cancel" type="button">Cancel</button><button class="btn btn-primary" id="bd-series-save" type="button">Save series</button></div></div>' +
      (b.bookStatus === 'read' && nextBook ? '<div class="detail-card bk-next-series"><span><b>Next in series</b><small>' + esc(nextBook.title) + '</small></span><button type="button" class="btn btn-ghost" id="bd-next">Open</button></div>' : '') +
      (hasReview ? '<div class="bk-quote">' + esc(b.review.trim()) + '</div>' : '<p class="bk-desc" id="bd-d"></p>') +
      (b.bookStatus === 'read' ? '<button class="btn btn-ghost bk-reread" id="bd-reread" type="button">↻ Mark as re-read</button>' : '') +
      '<div class="modal-actions bk-detail-actions"><button class="btn btn-danger" id="bd-del">Delete</button><button class="btn btn-primary" id="bd-e">Edit</button></div></div>');
    ov.querySelector('#bd-x').onclick = function () { ov.remove(); };
    ov.querySelector('#bd-e').onclick = function () { ov.remove(); editor(b); };
    var nextButton = ov.querySelector('#bd-next');
    if (nextButton) nextButton.onclick = function () { ov.remove(); detail(nextBook); };
    var seriesPicker = ov.querySelector('#bd-series-picker');
    var seriesQuery = ov.querySelector('#bd-series-q');
    var seriesNameInput = ov.querySelector('#bd-series-name');
    var seriesNumberInput = ov.querySelector('#bd-series-number');
    var seriesStatus = ov.querySelector('#bd-series-status');
    var seriesResults = ov.querySelector('#bd-series-results');
    var seriesSaveButton = ov.querySelector('#bd-series-save');
    var selectedSeries = null, seriesCandidates = [], seriesSearchToken = 0, seriesSearchTimer = null;
    function renderSeriesCandidates() {
      seriesResults.innerHTML = seriesCandidates.map(function (candidate, index) {
        var selected = selectedSeries && selectedSeries.seriesName.toLowerCase() === candidate.seriesName.toLowerCase() &&
          selectedSeries.seriesKey === candidate.seriesKey;
        return '<button class="bk-series-result' + (selected ? ' is-selected' : '') + '" type="button" data-series-index="' + index +
          '" aria-pressed="' + !!selected + '"><span><strong>' + esc(candidate.seriesName) + '</strong><small>' +
          esc(candidate.source) + '</small></span><span>Use</span></button>';
      }).join('');
    }
    function addSeriesCandidate(item, source) {
      var name = String(item.seriesName || '').trim();
      if (!name) return;
      var key = item.seriesKey || 'series-name:' + name;
      var candidate = { seriesName: name, seriesKey: key, source: source };
      var existingIndex = seriesCandidates.map(function (entry) {
        return entry.seriesName.toLowerCase();
      }).indexOf(name.toLowerCase());
      if (existingIndex < 0) {
        seriesCandidates.push(candidate);
      } else {
        var existingKey = seriesCandidates[existingIndex].seriesKey;
        var priority = function (value) {
          return /^character:/i.test(value || '') ? 3 : /^OL\d+L$/.test(value || '') ? 2 :
            /^subject:/i.test(value || '') ? 1 : 0;
        };
        if (priority(key) > priority(existingKey)) {
          seriesCandidates[existingIndex] = candidate;
          if (selectedSeries && selectedSeries.seriesName.toLowerCase() === name.toLowerCase() &&
              selectedSeries.seriesKey === existingKey) selectedSeries = candidate;
        }
      }
    }
    function searchSeries(value) {
      clearTimeout(seriesSearchTimer);
      var term = value.trim(), request = ++seriesSearchToken;
      seriesCandidates = [];
      if (term.length < 2) {
        seriesStatus.textContent = 'Enter at least 2 characters to search.';
        renderSeriesCandidates();
        return;
      }
      BOOKS.filter(function (book) {
        return (book.seriesName || '').toLowerCase().indexOf(term.toLowerCase()) > -1;
      }).forEach(function (book) {
        addSeriesCandidate(book, 'In your library');
      });
      seriesStatus.textContent = 'Searching Open Library…';
      renderSeriesCandidates();
      seriesSearchTimer = setTimeout(function () {
        AppOL.search(term, { limit: 30 }).then(function (matches) {
          if (request !== seriesSearchToken || !ov.isConnected) return;
          matches.forEach(function (match) {
            addSeriesCandidate(match, [match.title, match.author].filter(Boolean).join(' · '));
          });
          seriesStatus.textContent = seriesCandidates.length
            ? 'Choose a series, or enter its name below.'
            : 'No series metadata found. Enter the series name manually below.';
          renderSeriesCandidates();
        }).catch(function () {
          if (request !== seriesSearchToken || !ov.isConnected) return;
          seriesStatus.textContent = seriesCandidates.length
            ? 'Open Library search failed; showing matching library series.'
            : 'Open Library search failed. You can still enter the series name manually.';
          renderSeriesCandidates();
        });
      }, 250);
    }
    ov.querySelector('#bd-series-find').onclick = function () {
      seriesPicker.style.display = 'block';
      searchSeries(seriesQuery.value);
      seriesQuery.focus();
    };
    seriesQuery.oninput = function () { searchSeries(this.value); };
    seriesNameInput.oninput = function () {
      if (selectedSeries && selectedSeries.seriesName.toLowerCase() !== this.value.trim().toLowerCase()) {
        selectedSeries = null;
        renderSeriesCandidates();
      }
    };
    seriesResults.onclick = function (event) {
      var button = event.target.closest('[data-series-index]');
      if (!button) return;
      selectedSeries = seriesCandidates[Number(button.dataset.seriesIndex)] || null;
      if (!selectedSeries) return;
      var sameSeries = String(b.seriesName || '').trim().toLowerCase() === selectedSeries.seriesName.toLowerCase();
      seriesNameInput.value = selectedSeries.seriesName;
      if (!sameSeries) seriesNumberInput.value = '';
      seriesStatus.textContent = 'Selected ' + selectedSeries.seriesName + '.';
      renderSeriesCandidates();
    };
    ov.querySelector('#bd-series-cancel').onclick = function () { seriesPicker.style.display = 'none'; };
    function updateSeries(patch, message) {
      seriesSaveButton.disabled = true;
      var removeButton = ov.querySelector('#bd-series-remove');
      if (removeButton) removeButton.disabled = true;
      AppDB.updateEntry(uid, b.id, patch).then(function () {
        Object.assign(b, patch);
        var updated = BOOKS.filter(function (book) { return book.id === b.id; })[0] || b;
        Object.assign(updated, patch);
        ov.remove();
        render();
        AppUtils.showToast(message);
        detail(updated);
      }).catch(function () {
        seriesSaveButton.disabled = false;
        if (removeButton) removeButton.disabled = false;
        AppUtils.showToast('Failed to update this book’s series.');
      });
    }
    seriesSaveButton.onclick = function () {
      var name = seriesNameInput.value.trim(), numberText = seriesNumberInput.value.trim();
      if (!name) return AppUtils.showToast('Enter or choose a series name.');
      if (numberText && (!Number.isFinite(Number(numberText)) || Number(numberText) <= 0)) {
        return AppUtils.showToast('Enter a valid book number.');
      }
      var candidate = selectedSeries && selectedSeries.seriesName.toLowerCase() === name.toLowerCase()
        ? selectedSeries : null;
      if (!candidate) {
        var existing = BOOKS.filter(function (book) {
          return (book.seriesName || '').trim().toLowerCase() === name.toLowerCase();
        })[0];
        if (existing) candidate = { seriesKey: existing.seriesKey, seriesName: name };
      }
      var seriesKey = candidate && candidate.seriesKey || 'series-name:' + name;
      var sameSeries = String(b.seriesName || '').trim().toLowerCase() === name.toLowerCase();
      var number = numberText ? Number(numberText) : sameSeries ? Number(b.seriesNumber) || null : null;
      updateSeries({
        seriesKey: seriesKey,
        seriesName: name,
        seriesNumber: number,
        seriesPosition: numberText || (sameSeries ? b.seriesPosition || null : null),
        seriesPoster: seriesPosterFor(seriesKey, name) || null,
        seriesMetadataChecked: true,
        seriesMetadataVersion: 3
      }, 'Series updated ✓');
    };
    var removeSeriesButton = ov.querySelector('#bd-series-remove');
    if (removeSeriesButton) removeSeriesButton.onclick = function () {
      updateSeries({
        seriesKey: null, seriesName: null, seriesNumber: null, seriesPosition: null, seriesPoster: null,
        seriesMetadataChecked: true, seriesMetadataVersion: 3
      }, 'Series removed');
    };
    ov.querySelector('#bd-del').onclick = function () {
      if (!confirm('Delete this book?')) return;
      this.disabled = true;
      AppDB.deleteEntry(uid, b.id).then(function () {
        ov.remove();
        AppUtils.showToast('Deleted');
        load();
      }).catch(function () {
        ov.querySelector('#bd-del').disabled = false;
        AppUtils.showToast('Failed to delete.');
      });
    };
    var rereadButton = ov.querySelector('#bd-reread');
    if (rereadButton) rereadButton.onclick = function () {
      var existing = rereadData(b), dates = existing.dates.slice();
      var button = this;
      dates.push(ymd());
      button.disabled = true;
      AppDB.updateEntry(uid, b.id, { reReadCount: existing.count + 1, reReadDates: dates }).then(function () {
        ov.remove();
        AppUtils.showToast('Re-read added ✓');
        return load();
      }).then(function () {
        var updated = BOOKS.filter(function (book) { return book.id === b.id; })[0];
        if (updated) detail(updated);
      }).catch(function () {
        button.disabled = false;
        AppUtils.showToast('Failed to update re-read count.');
      });
    };
    var desc = ov.querySelector('#bd-d');
    if (!desc) return;
    if (b.bookDescriptionFetched) {
      desc.textContent = b.bookDescription || '';
    } else if (/^\/works\/OL\d+W$/.test(b.olKey || '')) {
      desc.textContent = 'Loading description…';
      var request = DESC_PENDING[b.id];
      if (!request) {
        request = AppOL.description(b.olKey).then(function (text) {
          var current = BOOKS.filter(function (book) { return book.id === b.id; })[0];
          if (current && typeof current.review === 'string' && current.review.trim()) return '';
          return AppDB.updateEntry(uid, b.id, { bookDescription: text, bookDescriptionFetched: true }).then(function () {
            b.bookDescription = text;
            b.bookDescriptionFetched = true;
            var stored = BOOKS.filter(function (book) { return book.id === b.id; })[0];
            if (stored) { stored.bookDescription = text; stored.bookDescriptionFetched = true; }
            return text;
          });
        });
        DESC_PENDING[b.id] = request;
      }

      request.then(function (text) {
        delete DESC_PENDING[b.id];
        if (document.body.contains(desc)) desc.textContent = text || 'No description available.';
      }).catch(function () {
        delete DESC_PENDING[b.id];
        if (document.body.contains(desc)) desc.textContent = 'Description couldn’t load. Close and reopen to retry.';
        AppUtils.showToast('Failed to load or save book description.');
      });
    }
  }

  function nextInSeries(book) {
    var name = (book.seriesName || '').trim().toLowerCase();
    if (!name) return null;
    return BOOKS.filter(function (candidate) {
      if (candidate.id === book.id || (candidate.seriesName || '').trim().toLowerCase() !== name || candidate.bookStatus === 'read') return false;
      return !Number(book.seriesNumber) || Number(candidate.seriesNumber) > Number(book.seriesNumber);
    }).sort(function (a, b) {
      var an = Number(a.seriesNumber) || Number.MAX_SAFE_INTEGER;
      var bn = Number(b.seriesNumber) || Number.MAX_SAFE_INTEGER;
      return an - bn || (a.title || '').localeCompare(b.title || '');
    })[0] || null;
  }

  function openBookQuickActions(book) {
    var ov = modal('<div class="modal-box"><p class="modal-title">Quick actions</p><p class="modal-entry-title">' +
      esc(book.title) + '</p><p class="label">Change status</p>' +
      '<div class="bk-quick-status">' +
      '<button class="btn btn-ghost" type="button" data-status="want">Want to Read</button>' +
      '<button class="btn btn-ghost" type="button" data-status="reading">Reading</button>' +
      '<button class="btn btn-ghost" type="button" data-status="read">Read</button></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" id="bq-edit">Edit details</button><button class="btn btn-ghost" id="bq-close">Close</button></div></div>');
    ov.querySelectorAll('[data-status]').forEach(function (button) {
      button.disabled = button.dataset.status === book.bookStatus;
      button.onclick = function () {
        var status = button.dataset.status, date = ymd(), update = { bookStatus: status };
        if (status === 'want') update.startDate = null;
        if (status === 'reading' && !book.startDate) update.startDate = date;
        if (status === 'read') {
          update.finishDate = book.finishDate || date;
          update.finishMonth = +update.finishDate.slice(5, 7);
          update.finishYear = +update.finishDate.slice(0, 4);
        }
        button.disabled = true;
        AppDB.updateEntry(uid, book.id, update).then(function () {
          ov.remove();
          if (shelf !== 'series') shelf = status;
          AppUtils.showToast('Status changed to ' + ST[status] + ' ✓');
          return load().then(function () {
            var updated = BOOKS.filter(function (candidate) { return candidate.id === book.id; })[0];
            if (status === 'read' && updated && nextInSeries(updated)) detail(updated);
          });
        }).catch(function (error) {
          console.error('Could not update book status.', error);
          button.disabled = false;
          AppUtils.showToast('Failed to change status.');
        });
      };
    });
    ov.querySelector('#bq-edit').onclick = function () { ov.remove(); editor(book); };
    ov.querySelector('#bq-close').onclick = function () { ov.remove(); };
  }

  function saveSeriesPoster(seriesKey, seriesName, poster) {
    var entries = seriesEntries(seriesKey, seriesName);
    if (!entries.length) return Promise.reject(new Error('No books found for this series.'));
    var chunks = [];
    for (var i = 0; i < entries.length; i += 400) chunks.push(entries.slice(i, i + 400));
    return chunks.reduce(function (chain, chunk) {
      return chain.then(function () {
        var batch = db.batch();
        chunk.forEach(function (book) {
          batch.update(col().doc(book.id), { seriesPoster: poster });
        });
        return batch.commit();
      });
    }, Promise.resolve()).then(function () {
      entries.forEach(function (book) { book.seriesPoster = poster; });
      try { localStorage.removeItem('pl-books-data'); } catch (e) {}
    });
  }

  function openSeriesQuickActions(seriesKey, seriesName) {
    var hasPoster = !!seriesPosterFor(seriesKey, seriesName);
    var ov = modal('<div class="modal-box"><p class="modal-title">Series poster</p><p class="modal-entry-title">' +
      esc(seriesName) + '</p><button class="btn btn-primary" type="button" id="bqs-upload">Upload custom image</button>' +
      '<input type="file" id="bqs-file" accept="image/*" hidden>' +
      (hasPoster ? '<button class="btn btn-ghost" type="button" id="bqs-remove">Remove custom image</button>' : '') +
      '<div class="modal-actions"><button class="btn btn-ghost" type="button" id="bqs-close">Close</button></div></div>');
    var upload = ov.querySelector('#bqs-upload'), fileInput = ov.querySelector('#bqs-file');
    var remove = ov.querySelector('#bqs-remove');
    function save(poster) {
      upload.disabled = true;
      if (remove) remove.disabled = true;
      saveSeriesPoster(seriesKey, seriesName, poster).then(function () {
        ov.remove();
        AppUtils.showToast(poster ? 'Series poster updated ✓' : 'Custom series poster removed.');
        render();
      }).catch(function (error) {
        console.error('Could not update series poster.', error);
        upload.disabled = false;
        if (remove) remove.disabled = false;
        AppUtils.showToast('Failed to save the series poster.');
      });
    }
    upload.onclick = function () { fileInput.click(); };
    fileInput.onchange = function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type)) return AppUtils.showToast('Choose an image file.');
      if (file.size > 12 * 1024 * 1024) return AppUtils.showToast('Choose an image smaller than 12 MB.');
      upload.disabled = true;
      shrink(file, save, function () {
        upload.disabled = false;
        AppUtils.showToast('Could not load the selected image.');
      });
    };
    if (remove) remove.onclick = function () { save(null); };
    ov.querySelector('#bqs-close').onclick = function () { ov.remove(); };
  }

  function openRandomBookModal(pool) {
    var list = (Array.isArray(pool) && pool.length) ? pool : BOOKS.filter(function (b) { return b.bookStatus === 'want'; });
    if (!list.length) return AppUtils.showToast('Add at least one book to To Read first.');
    var lastId = null;
    function pickNext() {
      if (list.length === 1) return list[0];
      var candidates = list.filter(function (b) { return b.id !== lastId; });
      if (!candidates.length) candidates = list;
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    var chosen = pickNext();
    lastId = chosen.id;
    var ov = modal('<div class="modal-box bk-sheet" id="bk-rand-box"></div>');
    function paint(b) {
      var meta = [b.author || 'Unknown author'];
      if (b.pages) meta.push(Number(b.pages).toLocaleString() + ' pages');
      if (b.openLibraryRatingFetched && b.openLibraryRating && Number(b.openLibraryRating.average)) {
        meta.push('★ ' + Number(b.openLibraryRating.average).toFixed(1) + ' OL');
      }
      var box = ov.querySelector('#bk-rand-box');
      box.innerHTML =
        '<p class="modal-title">🎲 Pick for me</p>' +
        '<div class="bk-det" style="margin-bottom:14px"><div class="bk-det-c">' + cov(b) + '</div>' +
        '<div class="bk-det-i"><h2 class="bk-serif">' + esc(b.title) + '</h2>' +
        '<p class="text-sm text-muted" style="margin-top:4px">' + esc(meta.join(' · ')) + '</p></div></div>' +
        '<div class="modal-actions" style="flex-wrap:wrap;gap:8px">' +
        '<button type="button" class="btn btn-primary" id="bkr-open">Open Details</button>' +
        '<button type="button" class="btn btn-ghost" id="bkr-start">Start Reading</button>' +
        (list.length > 1 ? '<button type="button" class="btn btn-ghost" id="bkr-spin">🎲 Spin Again</button>' : '') +
        '<button type="button" class="btn btn-ghost" id="bkr-close">Close</button></div>';
      box.querySelector('#bkr-open').onclick = function () { ov.remove(); detail(b); };
      box.querySelector('#bkr-start').onclick = function () {
        this.disabled = true;
        var patch = { bookStatus: 'reading' };
        if (!b.startDate) patch.startDate = ymd();
        AppDB.updateEntry(uid, b.id, patch).then(function () {
          ov.remove();
          shelf = 'reading';
          AppUtils.showToast('Started reading ✓');
          load();
        }).catch(function () {
          AppUtils.showToast('Failed to update status.');
        });
      };
      var spin = box.querySelector('#bkr-spin');
      if (spin) spin.onclick = function () {
        chosen = pickNext();
        lastId = chosen.id;
        paint(chosen);
      };
      box.querySelector('#bkr-close').onclick = function () { ov.remove(); };
    }
    paint(chosen);
  }

  /* ---------- add / edit ---------- */
  function editor(b) {
    var originalStatus = b.bookStatus, s = Object.assign({ bookStatus: shelf || 'want', fiction: true, genres: [] }, b), rating = s.bookRating || null;
    var ov = modal('<div class="modal-box bk-sheet"><p class="modal-title">' + (s.id ? 'Edit book' : 'Add book') + '</p>' +
      '<div class="bk-ed"><div class="bk-ed-c" id="be-cov"></div><div class="bk-ed-f"><label class="label">Title</label><input id="be-t" class="input-field" maxlength="150" value="' + esc(s.title) + '">' +
      '<label class="label" style="margin-top:10px">Author</label><input id="be-a" class="input-field" maxlength="100" value="' + esc(s.author) + '"></div></div>' +
      '<div class="bk-ed-r"><div><label class="label">Pages</label><input id="be-p" type="number" min="1" max="20000" class="input-field" value="' + (Number(s.pages) || '') + '"></div>' +
      '<div><label class="label">Type</label><select id="be-f" class="input-field"><option value="1"' + (s.fiction !== false ? ' selected' : '') + '>Fiction</option><option value="0"' + (s.fiction === false ? ' selected' : '') + '>Non-fiction</option></select></div></div>' +
      '<div class="bk-ed-r"><div><label class="label">Series (optional)</label><input id="be-series" class="input-field" maxlength="100" placeholder="e.g. Harry Potter" value="' + esc(s.seriesName || '') + '"></div>' +
      '<div><label class="label">Book number</label><input id="be-series-number" type="number" min="0" step="0.1" class="input-field" value="' + (Number(s.seriesNumber) || '') + '"></div></div>' +
      '<label class="btn btn-ghost bk-sm" for="be-file" style="margin:12px 0">🖼 Upload cover</label><input type="file" id="be-file" accept="image/*" hidden>' +
      '<label class="label">Shelf</label><div class="toggle-pair" id="be-st" style="grid-template-columns:1fr 1fr 1fr"><button class="toggle-btn" data-v="want">Want to Read</button><button class="toggle-btn" data-v="reading">Reading</button><button class="toggle-btn" data-v="read">Read</button></div>' +
      '<div id="be-sw"><label class="label">Started (optional)</label><input type="date" id="be-s" class="input-field" max="' + ymd() + '" value="' + esc(s.startDate || '') + '" style="margin-bottom:12px"></div>' +
      '<div id="be-read"><label class="label">Rating</label><div class="number-rating-row" id="be-r" style="margin-bottom:12px"></div>' +
      '<label class="label">Finished</label><input type="date" id="be-d" class="input-field" max="' + ymd() + '" value="' + esc(s.finishDate || ymd()) + '" style="margin-bottom:12px">' +
      '<label class="label">Your review</label><textarea id="be-v" class="input-field" rows="3" maxlength="2000" style="resize:none">' + esc(s.review) + '</textarea></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" id="be-x">Cancel</button><button class="btn btn-primary" id="be-ok">Save</button></div></div>');
    var q = function (x) { return ov.querySelector(x); };
    function sync() {
      q('#be-read').style.display = s.bookStatus === 'read' ? 'block' : 'none';
      q('#be-sw').style.display = s.bookStatus === 'want' ? 'none' : 'block';
      ov.querySelectorAll('#be-st .toggle-btn').forEach(function (x) { x.classList.toggle('active', x.dataset.v === s.bookStatus); });
      q('#be-cov').innerHTML = cov(s);
    }
    var row = q('#be-r');
    for (var i = 1; i <= 10; i++) (function (n) {
      var bt = document.createElement('button');
      bt.className = 'num-rating-btn' + (n === rating ? ' selected' : ''); bt.textContent = n;
      bt.onclick = function () { AppUtils.hapticRating(); row.querySelectorAll('.selected').forEach(function (x) { x.classList.remove('selected'); }); bt.classList.add('selected'); rating = n; };
      row.appendChild(bt);
    })(i);
    q('#be-st').onclick = function (e) { var t = e.target.closest('.toggle-btn'); if (t) { s.bookStatus = t.dataset.v; sync(); } };
    q('#be-file').onchange = function () { var fl = this.files[0]; if (fl) shrink(fl, function (u) { s.poster = u; sync(); }); };
    q('#be-t').oninput = function () { s.title = this.value; if (!src(s.poster)) q('#be-cov').innerHTML = cov(s); };
    q('#be-x').onclick = function () { ov.remove(); };
    q('#be-ok').onclick = function () {
      var title = q('#be-t').value.trim(); if (!title) return AppUtils.showToast('Enter a title.');
      var st = s.bookStatus, sd = q('#be-s').value, fd = q('#be-d').value;
      if (st === 'read') {
        if (!fd || fd > ymd()) return AppUtils.showToast('Pick a valid finish date.');
        if (sd && sd > fd) return AppUtils.showToast('Start date is after finish date.');
      }
      var seriesNameValue = q('#be-series').value.trim(), sameSeries = seriesNameValue.toLowerCase() === String(s.seriesName || '').trim().toLowerCase();
      var seriesKeyValue = sameSeries ? s.seriesKey || null : null;
      var d = { type: 'book', title: title, author: q('#be-a').value.trim(), poster: s.poster || null,
        pages: Math.min(20000, parseInt(q('#be-p').value) || 0) || null, fiction: q('#be-f').value === '1',
        genres: s.genres || [], olKey: s.olKey || null, bookStatus: st, playlistId: null, startDate: st === 'want' ? null : (sd || null),
        releaseYear: Number(s.releaseYear) || null,
        seriesName: seriesNameValue || null, seriesKey: seriesKeyValue,
        seriesPoster: seriesPosterFor(seriesKeyValue, seriesNameValue) || (sameSeries ? s.seriesPoster || null : null),
        seriesPosition: q('#be-series-number').value.trim() ||
          (q('#be-series').value.trim().toLowerCase() === String(s.seriesName || '').trim().toLowerCase() && !Number(s.seriesNumber)
            ? s.seriesPosition || null : null),
        seriesNumber: q('#be-series').value.trim()
          ? (q('#be-series-number').value.trim()
            ? Math.max(0, parseFloat(q('#be-series-number').value) || 0) || null
            : Number(s.seriesNumber) || null)
          : null,
        seriesMetadataChecked: !!s.olKey,
        seriesMetadataVersion: Number(s.seriesMetadataVersion) || (s.id ? 0 : 3) };
      if (st === 'read') {
        d.bookRating = rating; d.review = q('#be-v').value.trim() || null; d.finishDate = fd;
        d.finishMonth = +fd.slice(5, 7); d.finishYear = +fd.slice(0, 4);
      } else if (!s.id) { d.bookRating = null; d.review = null; d.finishDate = null; d.finishMonth = null; d.finishYear = null; }
      this.disabled = true;
      var shouldFetchRating = st === 'want' && (!s.id || originalStatus !== 'want') && s.openLibraryRatingFetched !== true;
      var ratingFetchFailed = false;
      var fetchRating = shouldFetchRating && d.olKey
        ? AppOL.rating(d.olKey).then(function (value) { return { value: value, failed: false }; }, function () { return { value: null, failed: true }; })
        : Promise.resolve({ value: null, failed: false });
      fetchRating.then(function (result) {
        ratingFetchFailed = result.failed;
        if (shouldFetchRating) { d.openLibraryRating = result.value; d.openLibraryRatingFetched = true; }
        return s.id ? AppDB.updateEntry(uid, s.id, d) : AppDB.addEntry(uid, d);
      }).then(function () {
        ov.remove();
        AppUtils.showToast(ratingFetchFailed ? 'Saved; Open Library rating could not be fetched.' :
          shouldFetchRating && !d.openLibraryRating ? 'Saved; Open Library has no rating for this book.' : 'Saved ✓');
        if (shelf !== 'series') shelf = d.bookStatus;
        return load().then(function () {
          var updated = BOOKS.filter(function (book) { return book.id === s.id; })[0];
          if (st === 'read' && originalStatus !== 'read' && updated && nextInSeries(updated)) detail(updated);
        });
      }).catch(function () { q('#be-ok').disabled = false; AppUtils.showToast('Failed to save.'); });
    };
    sync();
  }

  function addModal() {
    var ov = modal('<div class="modal-box bk-sheet"><p class="modal-title">Add a book</p><input id="bs-q" class="input-field" placeholder="Search title or author…">' +
      '<div id="bs-st" class="text-sm text-muted" style="margin:8px 0"></div><div id="bs-res" class="results-list" style="max-height:48vh;overflow-y:auto"></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" id="bs-man">✍️ Add manually</button><button class="btn btn-ghost" id="bs-x">Close</button></div>' +
      '<button class="btn btn-ghost" id="bs-import" style="width:100%;margin-top:10px">📥 Upload list</button></div>');
    var tok = 0, t, found = [], input = ov.querySelector('#bs-q'), res = ov.querySelector('#bs-res'), st = ov.querySelector('#bs-st');
    input.addEventListener('input', function () {
      clearTimeout(t);
      var q = input.value.trim();
      if (q.length < 2) { res.innerHTML = ''; st.textContent = ''; return; }
      st.textContent = 'Searching…';
      t = setTimeout(function () {
        var k = ++tok;
        AppOL.search(q, { limit: 8 }).then(function (l) {
          if (k !== tok) return;
          found = l; st.textContent = l.length ? '' : 'No results. Try “Add manually”.';
          res.innerHTML = l.map(function (b, i) {
            return '<div class="result-item" data-i="' + i + '">' + (src(b.poster) ? '<img class="result-thumb" loading="lazy" alt="" src="' + esc(src(b.poster)) + '">' : '<div class="result-thumb"></div>') +
              '<div class="result-info"><p class="result-title">' + esc(b.title) + '</p><p class="result-meta">' + esc(b.author) + (b.year ? ' · ' + b.year : '') + (has(b.olKey) ? ' · <span style="color:var(--accent)">✓ In library</span>' : '') + '</p></div></div>';
          }).join('');
        }).catch(function () { if (k === tok) st.textContent = 'Search failed. Check connection.'; });
      }, 350);
    });
    res.addEventListener('click', function (e) {
      var r = e.target.closest('.result-item'); if (!r) return;
      var b = found[+r.dataset.i];
      if (has(b.olKey)) return AppUtils.showToast('Already in your library.');
      ov.remove(); editor(b);
    });
    ov.querySelector('#bs-man').onclick = function () { ov.remove(); editor({}); };
    ov.querySelector('#bs-import').onclick = function () { ov.remove(); $('bk-file').click(); };
    ov.querySelector('#bs-x').onclick = function () { ov.remove(); };
    input.focus();
  }

  /* ---------- TXT import ---------- */
  function importList(file) {
    var rd = new FileReader();
    rd.onload = async function () {
      var seen = {}, lines = String(rd.result).split(/\r?\n/).map(function (l) { return l.replace(/^\s*(\d+[.)]|[-*•])\s+/, '').trim(); })
        .filter(function (l) { if (!l || seen[l.toLowerCase()]) return false; seen[l.toLowerCase()] = 1; return true; });
      if (!lines.length) return AppUtils.showToast('No book names found.');
      if (lines.length > 60) { lines = lines.slice(0, 60); AppUtils.showToast('Using the first 60 lines.'); }
      var ov = modal('<div class="modal-box bk-sheet"><p class="modal-title">Upload list</p><div id="im-b"><p id="im-p" class="text-sm text-muted">Starting…</p><div class="bk-prog"><i id="im-f"></i></div></div></div>');
      var b = ov.querySelector('#im-b'), rows = [];
      for (var i = 0; i < lines.length; i++) {
        if (!document.body.contains(ov)) return;
        ov.querySelector('#im-p').textContent = 'Finding ' + (i + 1) + ' / ' + lines.length + '…';
        ov.querySelector('#im-f').style.width = Math.round(i / lines.length * 100) + '%';
        var p = lines[i].split(/\s+[-–—]\s+/), t = p[0], a = p[1] || '', m = [];
        try { m = await AppOL.search(t, { author: a, limit: 5 }); if (!m.length && a) m = await AppOL.search(t + ' ' + a, { limit: 5 }); } catch (e) {}
        rows.push({ line: lines[i], m: m, sel: m.length ? 0 : -1 });
        await new Promise(function (r) { setTimeout(r, 150); });
      }
      if (!document.body.contains(ov)) return;
      b.innerHTML = '<p class="text-sm text-muted" style="margin-bottom:10px">Matched ' + rows.filter(function (r) { return r.m.length; }).length + ' of ' + rows.length + '. Check each one, change it, or skip it.</p><div class="bk-imp">' +
        rows.map(function (r, i) {
          return '<div class="bk-imp-row"><div class="bk-imp-th">' + cov(r.m[0] || { title: '?' }) + '</div><div class="bk-imp-b">' +
            (r.m.length ? '<select class="input-field" data-i="' + i + '">' + r.m.map(function (x, j) {
              return '<option value="' + j + '"' + (j === 0 ? ' selected' : '') + '>' + esc(x.title + (x.author ? ' — ' + x.author : '') + (x.year ? ' (' + x.year + ')' : '')) + '</option>';
            }).join('') + '<option value="-1">✕ Skip</option></select>' : '<p class="text-sm" style="color:#ef5a6f;margin-bottom:4px">Not found</p>') +
            '<small>' + esc(r.line) + '</small></div></div>';
        }).join('') + '</div><label class="label">Add to shelf</label><select id="im-s" class="input-field" style="margin-bottom:4px"><option value="want">Want to Read</option><option value="reading">Reading</option><option value="read">Read (finished today, no rating)</option></select>' +
        '<div class="modal-actions"><button class="btn btn-ghost" id="im-x">Cancel</button><button class="btn btn-primary" id="im-ok"></button></div>';
      var ok = b.querySelector('#im-ok');
      function upd() { var n = rows.filter(function (r) { return r.sel >= 0; }).length; ok.textContent = 'Add ' + n + ' book' + (n === 1 ? '' : 's'); ok.disabled = !n; }
      upd();
      b.addEventListener('change', function (e) {
        var s = e.target; if (s.dataset.i === undefined) return;
        var r = rows[+s.dataset.i]; r.sel = +s.value;
        s.closest('.bk-imp-row').querySelector('.bk-imp-th').innerHTML = cov(r.sel >= 0 ? r.m[r.sel] : { title: 'Skipped' });
        upd();
      });
      b.querySelector('#im-x').onclick = function () { ov.remove(); };
      ok.onclick = async function () {
        var st = b.querySelector('#im-s').value, k = {}, batch = db.batch(), selected = [], failedRatings = 0;
        rows.forEach(function (r) {
          var m = r.sel >= 0 ? r.m[r.sel] : null;
          if (!m || has(m.olKey) || k[m.olKey]) return;
          k[m.olKey] = 1; selected.push(m);
        });
        if (!selected.length) return AppUtils.showToast('Nothing new to add.');
        ok.disabled = true;
        try {
          for (var i = 0; i < selected.length; i++) {
            if (!document.body.contains(ov)) return;
            var snapshot = null;
            ok.textContent = 'Preparing ' + (i + 1) + ' / ' + selected.length + '…';
            if (st === 'want') {
              try { snapshot = await AppOL.rating(selected[i].olKey); }
              catch (e) { failedRatings++; }
            }
            batch.set(col().doc(), bookDoc(selected[i], st, snapshot));
            if (st === 'want' && i < selected.length - 1) await new Promise(function (resolve) { setTimeout(resolve, 120); });
          }
          if (!document.body.contains(ov)) return;
          await batch.commit();
          try { localStorage.removeItem('pl-books-data'); } catch (e) {}
          ov.remove();
          AppUtils.showToast(failedRatings
            ? 'Added ' + selected.length + ' books; ratings could not be fetched for ' + failedRatings + '.'
            : 'Added ' + selected.length + ' book' + (selected.length === 1 ? '' : 's') + ' ✓');
          if (shelf !== 'series' && (st === 'want' || st === 'read')) shelf = st;
          load();
        } catch (e) {
          ok.disabled = false;
          upd();
          AppUtils.showToast('Import failed.');
        }
      };
    };
    rd.readAsText(file);
  }

  /* ---------- wiring ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('.bk-tile[data-id], .bk-now-item[data-id]');
    if (t) {
      if (suppressBookTileClick) { e.preventDefault(); e.stopPropagation(); suppressBookTileClick = false; clearTimeout(suppressBookTileTimer); return; }
      var b = BOOKS.filter(function (x) { return x.id === t.dataset.id; })[0]; if (b) detail(b);
    }
  });
  $('bk-grid').addEventListener('click', function (e) {
    if (suppressSeriesTileClick && e.target.closest('[data-series-toggle]')) {
      e.preventDefault();
      e.stopPropagation();
      suppressSeriesTileClick = false;
      clearTimeout(suppressSeriesTileTimer);
      return;
    }
    var libraryOnly = e.target.closest('[data-series-library-only]');
    if (libraryOnly) {
      var seriesKey = libraryOnly.dataset.seriesKey;
      SERIES_ONLY_LIBRARY[seriesKey] = libraryOnly.getAttribute('aria-pressed') !== 'true';
      lib();
      return;
    }
    var retry = e.target.closest('[data-series-retry]');
    if (retry) {
      delete SERIES_ERRORS[retry.dataset.seriesRetry];
      ensureSeriesCatalog(retry.dataset.seriesRetry);
      return;
    }
    var toggle = e.target.closest('[data-series-toggle]');
    if (!toggle) return;
    var key = toggle.dataset.seriesKey, expanded = toggle.getAttribute('aria-expanded') !== 'true';
    SERIES_EXPANDED[key] = expanded;
    if (expanded) {
      SERIES_BOUNCE[key] = true;
      delete SERIES_COLLAPSE[key];
    } else {
      SERIES_COLLAPSE[key] = true;
      delete SERIES_BOUNCE[key];
    }
    if (expanded) ensureSeriesCatalog(toggle.dataset.seriesId);
    lib();
  });
  $('bk-grid').addEventListener('pointerdown', function (e) {
    if (suppressSeriesTileClick) {
      suppressSeriesTileClick = false;
      clearTimeout(suppressSeriesTileTimer);
    }
    if (suppressBookTileClick) {
      suppressBookTileClick = false;
      clearTimeout(suppressBookTileTimer);
    }
    var seriesCard = e.target.closest('.bk-series-card[data-series-toggle], .bk-series-title-toggle[data-series-toggle]');
    var tileButton = e.target.closest('.bk-tile[data-id]');
    if ((!tileButton && !seriesCard) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    var target = tileButton || seriesCard, x = e.clientX, y = e.clientY;
    var book = tileButton && BOOKS.filter(function (item) { return item.id === tileButton.dataset.id; })[0];
    var timer = setTimeout(function () {
      if (seriesCard) {
        suppressSeriesTileClick = true;
        clearTimeout(suppressSeriesTileTimer);
        suppressSeriesTileTimer = setTimeout(function () { suppressSeriesTileClick = false; }, 800);
        openSeriesQuickActions(seriesCard.dataset.seriesId, seriesCard.dataset.seriesName);
      } else {
        if (!book) return;
        suppressBookTileClick = true;
        clearTimeout(suppressBookTileTimer);
        suppressBookTileTimer = setTimeout(function () { suppressBookTileClick = false; }, 800);
        openBookQuickActions(book);
      }
    }, 450);
    function cancel(event) {
      if (event.type === 'pointermove' && Math.hypot(event.clientX - x, event.clientY - y) <= 10) return;
      clearTimeout(timer);
      target.removeEventListener('pointermove', cancel);
      target.removeEventListener('pointerup', cancel);
      target.removeEventListener('pointercancel', cancel);
    }
    target.addEventListener('pointermove', cancel);
    target.addEventListener('pointerup', cancel);
    target.addEventListener('pointercancel', cancel);
    target.addEventListener('pointerleave', cancel);
  });
  $('bk-grid').addEventListener('contextmenu', function (e) { if (e.target.closest('.bk-tile')) e.preventDefault(); });
  $('bk-folders').addEventListener('click', function (e) {
    var t = e.target.closest('.bk-folder-card[data-v]');
    if (t) { shelf = t.dataset.v; folders(); lib(); }
  });
  $('bk-q').addEventListener('input', AppUtils.debounce(lib, 140));
  $('bk-sort').addEventListener('change', lib);
  $('bk-view').addEventListener('click', function (e) {
    var button = e.target.closest('[data-view]');
    if (!button) return;
    viewMode = button.dataset.view;
    localStorage.setItem('pl-books-view', viewMode);
    lib();
  });
  if ($('bk-random')) {
    $('bk-random').addEventListener('click', function () {
      openRandomBookModal(this._pool);
    });
  }
  if ($('books-brand')) {
    $('books-brand').addEventListener('click', function () {
      window.location.href = '/home.html';
    });
  }
  if ($('btn-stats')) {
    $('btn-stats').addEventListener('click', function () {
      window.location.href = '/stats.html?tab=books';
    });
  }
  $('fab-add').addEventListener('click', addModal);
  $('bk-file').addEventListener('change', function () { var fl = this.files[0]; this.value = ''; if (fl) importList(fl); });
  $('type-pills').addEventListener('click', function (e) {
    var b = e.target.closest('.type-pill');
    if (b && b.dataset.tab !== 'books') window.location.href = '/home.html?tab=' + b.dataset.tab;
  });

  AppAuth.requireAuth(function (u) { uid = u.uid; load(); });
})();