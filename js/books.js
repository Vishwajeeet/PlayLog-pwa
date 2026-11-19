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
        ? '<span class="badge badge-tr badge-rating-big" style="background:var(--accent-game);color:#fff">' + Number(b.bookRating) + '</span>'
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
      if (tracked.bookRating) statusBadge = '<span class="badge badge-tr badge-rating-big" style="background:var(--accent-game);color:#fff">' + Number(tracked.bookRating) + '</span>';
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

  /* ---------- render ---------- */
  function load() {
    return AppDB.getBooks(uid).then(function (l) {
      BOOKS = l;
      if (['want', 'reading', 'read', 'series'].indexOf(shelf) === -1) {
        shelf = BOOKS.some(function (b) { return b.bookStatus === 'read'; }) ? 'read' :
          BOOKS.some(function (b) { return b.bookStatus === 'want'; }) ? 'want' :
            BOOKS.some(function (b) { return b.bookStatus === 'reading'; }) ? 'reading' : 'want';
      }
      render();
      listenForBookChanges();
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
    booksListener = col().where('type', '==', 'book').onSnapshot(function (snapshot) {
      BOOKS = snapshot.docs.map(function (doc) { return Object.assign({ id: doc.id }, doc.data()); });
      var addedAt = function (book) { return book.addedAt && book.addedAt.toMillis ? book.addedAt.toMillis() : 9e15; };
      BOOKS.sort(function (a, b) { return addedAt(b) - addedAt(a); });
      render();
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
  function render() { hero(); folders(); lib(); stats(); updateBooksWrappedPeriodOptions(); wantStats(); }

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
      return '<button type="button" class="playlist-card bk-folder-card' + (k === shelf ? ' is-selected' : '') +
        '" data-v="' + k + '" aria-pressed="' + (k === shelf) + '"><span class="playlist-card-name">' + label +
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
    var seriesFolder = '<button type="button" class="playlist-card bk-folder-card' + (shelf === 'series' ? ' is-selected' : '') +
      '" data-v="series" aria-pressed="' + (shelf === 'series') + '"><span class="playlist-card-name">Series</span>' +
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
      var libraryOnlyControl = expanded && item.group.seriesKey
        ? '<button type="button" class="bk-series-library-only" data-series-library-only data-series-key="' +
          esc(expandedKey) + '" aria-label="Only in library" title="Only in library" aria-pressed="' + onlyInLibrary + '">' +
          (onlyInLibrary ? '[]' : '[\\]') + '</button>'
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
          '<span class="bk-series-expand-indicator" aria-hidden="true">' + (expanded ? '&lt;' : '&gt;') + '</span>') +
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

  /* ---------- stats ---------- */
  function spark(r) {
    if (!r.length) return '';
    var w = 110, h = 34, pts = r.map(function (v, i) { return ((r.length > 1 ? i * (w - 8) / (r.length - 1) : w / 2 - 4) + 4) + ',' + (h - 4 - (v - 1) / 9 * (h - 8)); });
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '"><polyline points="' + pts.join(' ') + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>' +
      pts.map(function (p) { var c = p.split(','); return '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="2.6" fill="var(--accent)"/>'; }).join('') + '</svg>';
  }
  function donut(parts, centerLabel) {
    var tot = parts.reduce(function (s, p) { return s + p[1]; }, 0), C = 2 * Math.PI * 70, off = 0, segs = '', leg = '';
    parts.forEach(function (p) {
      if (!p[1]) return;
      var len = p[1] / tot * C;
      segs += '<circle cx="100" cy="100" r="70" fill="none" stroke="' + p[2] + '" stroke-width="28" stroke-dasharray="' + Math.max(len - 3, 1) + ' ' + C + '" stroke-dashoffset="' + (-off) + '"/>';
      off += len;
      leg += '<span class="dn-leg"><i style="background:' + p[2] + '"></i>' + esc(p[0]) + ' ' + p[1] + ' (' + Math.round(p[1] / tot * 100) + '%)</span>';
    });
    return '<div class="viz-card dn-wrap"><div class="dn-box"><svg viewBox="0 0 200 200" class="dn-svg"><g transform="rotate(-90 100 100)">' + segs + '</g></svg><div class="dn-info"><b>' + tot + '</b><span>' + esc(centerLabel || 'books') + '</span></div></div><div class="dn-legend">' + leg + '</div></div>';
  }
  function cols(v, lb, cls) {
    var active = v.map(function (count, i) { return { count: count, label: lb[i] }; }).filter(function (bin) { return bin.count > 0; });
    var mx = Math.max.apply(null, active.map(function (bin) { return bin.count; }).concat(1));
    return '<div class="viz-card viz-cols ' + (cls || '') + '">' + active.map(function (bin) {
      return '<div><span>' + bin.count + '</span><i style="height:' + Math.round(bin.count / mx * 80) + 'px"></i><em>' + bin.label + '</em></div>';
    }).join('') + '</div>';
  }
  function f(v) { return (+v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)).toLocaleString(); }

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

  function stats() {
    var all = readInstances(), rd = all.filter(function (b) { return !b._reRead; }), yrs = {};
    var py = $('bk-py'), pm = $('bk-pm'), box = $('bk-stats');
    rd.forEach(function (b) { yrs[b.finishYear] = 1; });
    var cur = py.value || 'all';
    py.innerHTML = '<option value="all">All time</option>' + Object.keys(yrs).sort(function (a, b) { return b - a; }).map(function (y) { return '<option>' + y + '</option>'; }).join('');
    py.value = yrs[cur] ? cur : 'all';
    
    pm.style.display = py.value === 'all' ? 'none' : '';
    if (py.value === 'all') pm.value = '0';
    var Y = py.value, M = +pm.value;
    var l = rd.filter(function (b) { return (Y === 'all' || b.finishYear === +Y) && (!M || b.finishMonth === M); });
    if (!l.length) { box.innerHTML = '<p class="bk-empty">No finished books in this period yet.</p>'; return; }

    var n = l.length, reReadTotal = all.filter(function (b) { return b._reRead && (Y === 'all' || b.finishYear === +Y) && (!M || b.finishMonth === M); }).length;
    var pg = 0, rs = 0, rn = 0, ps = 0, pn = 0, gc = {}, byA = {};
    var rc = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], pb = [0, 0, 0, 0, 0, 0, 0, 0], TH = [100, 200, 300, 400, 500, 600, 1000];
    l.forEach(function (b) {
      pg += b.pages || 0;
      if (b.pages) { ps += b.pages; pn++; var k = 0; while (k < 7 && b.pages > TH[k]) k++; pb[k]++; }
      if (b.author) (byA[b.author] = byA[b.author] || []).push(b);
      if (b.bookRating >= 1 && b.bookRating <= 10) { rs += b.bookRating; rn++; rc[b.bookRating - 1]++; }
      (b.genres || []).forEach(function (g) { gc[g] = (gc[g] || 0) + 1; });
    });

    var now = new Date(), a, z;
    if (Y !== 'all') {
      a = M ? new Date(+Y, M - 1, 1) : new Date(+Y, 0, 1);
      z = M ? new Date(+Y, M, 0, 23, 59, 59) : new Date(+Y, 11, 31, 23, 59, 59);
      if (z > now) z = now;
    } else {
      a = new Date(Math.min.apply(null, l.map(function (b) { return new Date(b.finishYear, b.finishMonth - 1, 1).getTime(); }))); z = now;
    }
    var days = Math.max(1, Math.round((z - a) / 864e5)), ev = +(days / n).toFixed(1);
    function pr(label, tot) {
      return '<div class="bk-pr"><div><b>' + f(tot) + '</b><span>' + label + '</span></div><div><b>' + f(tot / days * 365.25) + '</b><span>per year</span></div><div><b>' + f(tot / days * 30.44) + '</b><span>per month</span></div><div><b>' + f(tot / days) + '</b><span>per day</span></div></div>';
    }
    var acc = (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '').trim() || '#c9a84c';

    var gk = Object.keys(gc).sort(function (x, y) { return gc[y] - gc[x]; }).slice(0, 8);
    var as = Object.keys(byA).map(function (k) {
      var bs = byA[k].slice().sort(function (x, y) { return (x.finishDate || '').localeCompare(y.finishDate || ''); });
      var r = bs.filter(function (b) { return b.bookRating; }).map(function (b) { return b.bookRating; });
      return { n: k, bs: bs, r: r, avg: r.length ? r.reduce(function (s, v) { return s + v; }, 0) / r.length : 0 };
    }).sort(function (x, y) { return y.bs.length - x.bs.length || y.avg - x.avg; }).slice(0, 5);

    var genreColors = [acc, '#7c8aa5', '#7c3aed', '#22c55e', '#f97316', '#06b6d4', '#ec4899', '#a3a3a3'];
    box.innerHTML =
      '<div class="bk-num"><div class="bk-n"><b>' + n + '</b><span>Books read</span></div><div class="bk-n"><b>' + reReadTotal + '</b><span>Re-reads</span></div><div class="bk-n"><b>' + pg.toLocaleString() + '</b><span>Pages read</span></div>' +
      '<div class="bk-n"><b>' + Object.keys(byA).length + '</b><span>Authors</span></div><div class="bk-n"><b>' + (rn ? (rs / rn).toFixed(1) : '—') + '</b><span>Avg rating</span></div></div>' +
      '<p class="section-title">Reading pace</p><div class="viz-card"><p class="bk-serif bk-big">You read a book every ' + ev + (ev === 1 ? ' day' : ' days') + '</p>' + pr('Books', n) + (pg ? pr('Pages', pg) : '') + '</div>' +
      (gk.length ? '<p class="section-title">Top genres</p>' + donut(gk.map(function (g, i) {
        return [g, gc[g], genreColors[i % genreColors.length]];
      }), 'genre tags') : '') +
      '<div class="viz-pair bk-distribution"><div><p class="section-title">Ratings' + (rn ? '<span class="bk-badge bk-dist-average">Average ★ ' + (rs / rn).toFixed(2) + '</span>' : '') + '</p>' + (rn ? cols(rc, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) : '<p class="viz-empty">No rated books in this period.</p>') + '</div>' +
      '<div><p class="section-title">Page counts' + (pn ? '<span class="bk-badge bk-dist-average">Average ' + Math.round(ps / pn) + ' pages</span>' : '') + '</p>' + (pn ? cols(pb, ['100', '200', '300', '400', '500', '600', '1000', '1000+'], 'bk-pages') : '<p class="viz-empty">No page counts in this period.</p>') + '</div></div>' +
      (as.length ? '<p class="section-title">Most read authors</p><div class="viz-card">' + as.map(function (x) {
        var top = x.bs.slice().sort(function (p, q) { return (q.bookRating || 0) - (p.bookRating || 0); }).slice(0, window.innerWidth >= 900 ? 7 : 4);
        return '<div class="bk-au"><div class="bk-au-i"><p class="bk-serif">' + esc(x.n) + '</p><p class="text-sm text-muted">' + x.bs.length + ' read' + (x.r.length ? ' · ★ ' + x.avg.toFixed(1) + ' avg' : '') + '</p></div>' +
          '<div class="bk-au-c">' + top.map(function (b) { return '<div class="bk-mini">' + cov(b) + '</div>'; }).join('') + '</div><div class="bk-au-s">' + spark(x.r) + '</div></div>';
      }).join('') + '</div>' : '');
  }

  function wantStats() {
    var want = BOOKS.filter(function (book) { return book.bookStatus === 'want'; });
    var box = $('bk-want-stats');
    if (!want.length) {
      box.innerHTML = '<p class="bk-empty">Your Want to Read shelf is empty. Add books to start building your reading insights.</p>';
      return;
    }
    var pages = 0, pageBooks = 0, authors = {}, ratingTotal = 0, ratingCount = 0, ratedUsers = 0;
    want.forEach(function (book) {
      if (Number(book.pages) > 0) { pages += Number(book.pages); pageBooks++; }
      if (book.author) authors[book.author] = (authors[book.author] || 0) + 1;
      var rating = book.openLibraryRating && Number(book.openLibraryRating.average);
      if (book.openLibraryRatingFetched && rating > 0) {
        ratingTotal += rating;
        ratingCount++;
        ratedUsers += Number(book.openLibraryRating.count) || 0;
      }
    });
    box.innerHTML =
      '<div class="bk-num bk-want-numbers"><div class="bk-n"><b>' + want.length + '</b><span>Books queued</span></div>' +
      '<div class="bk-n"><b>' + (pageBooks ? pages.toLocaleString() + (pageBooks < want.length ? '+' : '') : '—') + '</b><span>Pages listed · ' + pageBooks + ' books</span></div>' +
      '<div class="bk-n"><b>' + Object.keys(authors).length + '</b><span>Authors waiting</span></div>' +
      '<div class="bk-n"><b>' + (ratingCount ? (ratingTotal / ratingCount).toFixed(1) + ' / 5' : '—') + '</b><span>Open Library avg' +
      (ratedUsers ? ' · ' + ratedUsers.toLocaleString() + ' ratings' : '') + '</span></div></div>';
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

  var wrapStyle = 'share', wTok = 0;

  function wrapPeriod() {
    var Y = $('bk-wrap-py').value, M = +$('bk-wrap-pm').value;
    var inP = readInstances().filter(function (b) { return (Y === 'all' || b.finishYear === +Y) && (!M || b.finishMonth === M); });
    var reads = inP.filter(function (b) { return !b._reRead; });
    var label = Y === 'all' ? 'All Time' : String(Y), sh = Y === 'all' ? 'ALL TIME' : String(Y);
    if (M) { label = AppUtils.monthName(M) + (Y === 'all' ? '' : ' ' + Y); sh = AppUtils.monthShort(M).toUpperCase() + (Y === 'all' ? '' : ' ' + Y); }
    return { reads: reads, re: inP.length - reads.length, label: label, sh: sh };
  }

  function updateBooksWrappedPeriodOptions() {
    var select = $('bk-wrap-py'), month = $('bk-wrap-pm'), years = {};
    readInstances().forEach(function (b) { if (b.finishYear) years[b.finishYear] = true; });
    var initialized = select.dataset.initialized === 'true';
    var currentYear = select.value, statYear = $('bk-py').value || 'all';
    var keepYear = initialized && (currentYear === 'all' || years[currentYear]);
    var nextYear = keepYear ? currentYear : (years[statYear] ? statYear : 'all');
    var currentMonth = month.value;
    select.innerHTML = '<option value="all">All time</option>' + Object.keys(years).sort(function (a, b) { return b - a; })
      .map(function (year) { return '<option value="' + year + '">' + year + '</option>'; }).join('');
    select.value = nextYear;
    month.value = initialized ? currentMonth : (nextYear === statYear ? $('bk-pm').value || '0' : '0');
    select.dataset.initialized = 'true';
  }

  function wImg(url) {
    return new Promise(function (res) {
      if (!url) return res(null);
      var im = new Image();
      im.onload = function () { res(im); }; im.onerror = function () { res(null); };
      if (/^data:image\//.test(url)) im.src = url;
      else { im.crossOrigin = 'anonymous'; im.src = AppUtils.getCanvasSafeUrl(url); }
    });
  }

  function blurDraw(c, img, x, y, w, h, a) {
    if (!img) return;
    var sw = 24, sh = Math.max(1, Math.round(24 * h / w));
    var s = document.createElement('canvas'); s.width = sw; s.height = sh;
    var k = Math.max(sw / img.width, sh / img.height);
    s.getContext('2d').drawImage(img, (sw - img.width * k) / 2, (sh - img.height * k) / 2, img.width * k, img.height * k);
    var m = document.createElement('canvas'); m.width = sw * 6; m.height = sh * 6;
    var mc = m.getContext('2d'); mc.imageSmoothingQuality = 'high'; mc.drawImage(s, 0, 0, m.width, m.height);
    c.save(); c.globalAlpha = a; c.imageSmoothingQuality = 'high'; c.drawImage(m, x, y, w, h); c.restore();
  }
  function glass(c, x, y, w, h, r, a) {
    c.fillStyle = 'rgba(255,255,255,' + (a || 0.07) + ')'; AppUtils.roundRectPath(c, x, y, w, h, r); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = 1.5; AppUtils.roundRectPath(c, x, y, w, h, r); c.stroke();
  }

  function generateBooksShareCard(P) {
    var reads = P.reads;
    if (!reads.length) return AppUtils.showToast('No finished books to wrap for this period.');
    var tok = ++wTok, W = 1080, H = 1350, canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d'), pages = 0, ratingTotal = 0, ratingCount = 0;
    var authorCounts = {};
    reads.forEach(function (book) {
      pages += Number(book.pages) || 0;
      if (book.bookRating >= 1 && book.bookRating <= 10) {
        ratingTotal += Number(book.bookRating);
        ratingCount++;
      }
      if (book.author) authorCounts[book.author] = (authorCounts[book.author] || 0) + 1;
    });
    var avg = ratingCount ? (ratingTotal / ratingCount).toFixed(1) + '/10' : '—';
    var author = Object.keys(authorCounts).sort(function (a, b) { return authorCounts[b] - authorCounts[a]; })[0] || '';
    var top = reads.slice().sort(function (a, b) {
      return (b.bookRating || 0) - (a.bookRating || 0) || (b.pages || 0) - (a.pages || 0);
    }).slice(0, 3);
    $('bk-wrap-download').style.display = 'none';
    $('bk-wrap-share').style.display = 'none';

    function fit(text, maxWidth) {
      var value = String(text || '');
      while (ctx.measureText(value).width > maxWidth && value.length > 3) value = value.slice(0, -1);
      return value === text ? value : value.trim() + '…';
    }

    Promise.all([
      document.fonts.load('800 64px Inter').catch(function () {}),
      document.fonts.load('600 30px Inter').catch(function () {})
    ])
      .then(function () { return wImg(top[0].poster); })
      .then(function (coverImage) {
        if (tok !== wTok) return;
        var bg = ctx.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, '#282116'); bg.addColorStop(.55, '#111317'); bg.addColorStop(1, '#171426');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
        if (coverImage) {
          ctx.save();
          AppUtils.roundRectPath(ctx, 650, 54, 350, 520, 28); ctx.clip();
          var scale = Math.max(350 / coverImage.width, 520 / coverImage.height);
          ctx.globalAlpha = .8;
          ctx.drawImage(coverImage, 650 + (350 - coverImage.width * scale) / 2, 54 + (520 - coverImage.height * scale) / 2, coverImage.width * scale, coverImage.height * scale);
          ctx.restore();
          var shade = ctx.createLinearGradient(500, 0, 1010, 0);
          shade.addColorStop(0, '#151515'); shade.addColorStop(1, 'rgba(15,15,17,.05)');
          ctx.fillStyle = shade; ctx.fillRect(500, 0, 510, 640);
        }
        ctx.fillStyle = '#e5c66a'; ctx.font = '700 24px Inter, sans-serif';
        ctx.fillText('PLAYLOG  /  BOOKS WRAPPED', 72, 90);
        ctx.fillStyle = '#f6f2e8'; ctx.font = '800 62px Inter, sans-serif';
        ctx.fillText(P.label === 'All Time' ? 'Your reading story' : 'Your reading recap', 72, 190);
        ctx.fillStyle = '#aaa'; ctx.font = '600 30px Inter, sans-serif'; ctx.fillText(P.label.toUpperCase(), 74, 242);
        ctx.fillStyle = '#e5c66a'; ctx.font = '800 142px Inter, sans-serif';
        ctx.fillText(reads.length.toLocaleString(), 66, 420);
        ctx.fillStyle = '#f6f2e8'; ctx.font = '600 34px Inter, sans-serif'; ctx.fillText('books finished', 76, 474);
        ctx.fillStyle = '#bdb8ad'; ctx.font = '500 27px Inter, sans-serif';
        ctx.fillText(P.re ? P.re.toLocaleString() + ' re-reads' : 'A fresh chapter in your reading life', 76, 522);

        var metricY = 630, metricW = 290, metricGap = 25;
        [
          [pages ? pages.toLocaleString() : '—', 'PAGES READ'],
          [avg, 'AVERAGE RATING'],
          [author || '—', 'TOP AUTHOR']
        ].forEach(function (metric, index) {
          var x = 70 + index * (metricW + metricGap), value = String(metric[0]);
          ctx.fillStyle = 'rgba(255,255,255,.07)'; AppUtils.roundRectPath(ctx, x, metricY, metricW, 145, 22); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.12)'; AppUtils.roundRectPath(ctx, x, metricY, metricW, 145, 22); ctx.stroke();
          ctx.fillStyle = '#4ade80'; ctx.font = '800 ' + (value.length > 12 ? 24 : value.length > 8 ? 32 : 42) + 'px Inter, sans-serif';
          ctx.fillText(fit(value, metricW - 36), x + 20, metricY + 80);
          ctx.fillStyle = '#aaa'; ctx.font = '600 22px Inter, sans-serif'; ctx.fillText(metric[1], x + 20, metricY + 119);
        });

        ctx.fillStyle = '#f6f2e8'; ctx.font = '800 29px Inter, sans-serif'; ctx.fillText('A FEW FAVORITES', 72, 850);
        top.forEach(function (book, index) {
          var y = 895 + index * 105;
          ctx.fillStyle = 'rgba(255,255,255,.055)'; AppUtils.roundRectPath(ctx, 70, y, 940, 64, 16); ctx.fill();
          ctx.fillStyle = '#4ade80'; ctx.font = '800 28px Inter, sans-serif'; ctx.fillText(String(index + 1).padStart(2, '0'), 92, y + 42);
          ctx.fillStyle = '#fff'; ctx.font = '600 27px Inter, sans-serif'; ctx.fillText(fit(book.title, 570), 155, y + 40);
          ctx.textAlign = 'right'; ctx.fillStyle = '#c9c5bb'; ctx.font = '500 22px Inter, sans-serif';
          ctx.fillText((book.bookRating ? book.bookRating + '/10' : '') + (book.pages ? '  ·  ' + Number(book.pages).toLocaleString() + ' pages' : ''), 980, y + 40); ctx.textAlign = 'left';
        });
        ctx.fillStyle = '#777'; ctx.font = '500 22px Inter, sans-serif'; ctx.fillText('Made with Playlog', 72, 1320);
        showWrappedPreview($('bk-wrap-canvas'), canvas);
        $('bk-wrap-download').style.display = '';
        $('bk-wrap-share').style.display = '';
      });
  }

  function generateBooksWrapped() {
    var P = wrapPeriod(), reads = P.reads;
    if (!reads.length) return AppUtils.showToast('No finished books to wrap for this period.');
    if (wrapStyle === 'share') return generateBooksShareCard(P);
    var aes = wrapStyle === 'aesthetic', tok = ++wTok;
    var pages = 0, rs = 0, rn = 0, ac = {};
    reads.forEach(function (b) {
      pages += Number(b.pages) || 0;
      if (b.bookRating >= 1 && b.bookRating <= 10) { rs += b.bookRating; rn++; }
      if (b.author) ac[b.author] = (ac[b.author] || 0) + 1;
    });
    var avg = rn ? rs / rn : 0;
    var authors = Object.keys(ac).sort(function (a, b) { return ac[b] - ac[a]; });
    var rated = reads.filter(function (b) { return b.bookRating; });
    var top = (rated.length ? rated : reads).slice().sort(function (a, b) {
      return (b.bookRating || 0) - (a.bookRating || 0) || (b.pages || 0) - (a.pages || 0);
    }).slice(0, aes ? 5 : 4);

    var W = 1080, H = 1920, canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    $('bk-wrap-download').style.display = 'none';
    $('bk-wrap-share').style.display = 'none';

    function trunc(t, mw) {
      t = String(t || ''); var s = t;
      while (ctx.measureText(s).width > mw && s.length > 3) s = s.slice(0, -1);
      return s !== t ? s.trim() + '…' : s;
    }
    function cover(im, x, y, w, h) {
      var s = Math.max(w / im.width, h / im.height);
      ctx.drawImage(im, x + (w - im.width * s) / 2, y + (h - im.height * s) / 2, im.width * s, im.height * s);
    }

    Promise.all(['800 60px Inter', '700 34px Inter', '500 26px Inter', '600 20px Inter'].map(function (f) {
      return document.fonts.load(f).catch(function () {});
    })).then(function () {
      return Promise.all(top.slice(0, aes ? 1 : 4).map(function (b) { return wImg(b.poster); }));
    }).then(function (imgs) {
      if (tok !== wTok) return;
      ctx.textAlign = 'left';
      if (aes) {
        var C = { bg: '#2fae7c', ink: '#0b1f16', text: '#f2f2f2', mute: '#b8b8c0' }, img = imgs[0];
        ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, 1040);
        blurDraw(ctx, img, 0, 0, W, 1040, 0.35);
        ctx.fillStyle = '#0e0e10'; ctx.fillRect(0, 1040, W, H - 1040);
        blurDraw(ctx, img, 0, 1040, W, H - 1040, 0.55);
        ctx.fillStyle = 'rgba(10,10,12,0.45)'; ctx.fillRect(0, 1040, W, H - 1040);
        glass(ctx, 40, 1080, W - 80, 800, 32, 0.07);
        var fx = 350, fy = 90, cs = 31;
        for (var r = 0; r < 29; r++) for (var c = 0; c < 20; c++) {
          ctx.fillStyle = (r + c) % 2 ? '#f1efe6' : '#111111';
          ctx.fillRect(fx + c * cs, fy + r * cs, cs, cs);
        }
        var ix = 380, iy = 120, iw = 560, ih = 839;
        ctx.fillStyle = '#f1efe6'; ctx.fillRect(ix - 6, iy - 6, iw + 12, ih + 12);
        ctx.save(); ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip();
        if (img) cover(img, ix, iy, iw, ih); else { ctx.fillStyle = '#1e1e1e'; ctx.fillRect(ix, iy, iw, ih); }
        ctx.restore();
        var size = 250;
        ctx.font = '800 ' + size + 'px Inter, sans-serif';
        var mw = ctx.measureText(P.sh).width;
        if (mw > 860) size = Math.floor(size * 860 / mw);
        ctx.font = '800 ' + size + 'px Inter, sans-serif';
        ctx.save(); ctx.translate(270, 990); ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = C.ink; ctx.fillText(P.sh, 0, 0); ctx.restore();
        ctx.fillStyle = C.ink; ctx.font = '800 28px Inter, sans-serif'; ctx.fillText('PLAYLOG', 60, 80);
        var y0 = 1130;
        ctx.fillStyle = C.mute; ctx.font = '500 26px Inter, sans-serif';
        ctx.fillText('Top Books', 80, y0); ctx.save(); ctx.textAlign = 'right'; ctx.fillText('Rating  ·  Pages', 1000, y0); ctx.restore();
        ctx.fillStyle = C.text; ctx.font = '700 34px Inter, sans-serif';
        top.forEach(function (b, i) {
          var ry = y0 + 60 + i * 58, pgs = b.pages ? Number(b.pages).toLocaleString() + 'p' : '—';
          ctx.font = '700 34px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = C.text;
          ctx.fillText((i + 1) + '  ' + trunc(b.title, 640), 80, ry);
          ctx.textAlign = 'right';
          ctx.fillStyle = C.mute; ctx.fillText(pgs, 1000, ry);
          ctx.fillStyle = C.text; ctx.font = '800 34px Inter, sans-serif'; ctx.fillText(b.bookRating ? String(b.bookRating) : '—', 820, ry);
          ctx.textAlign = 'left'; ctx.font = '700 34px Inter, sans-serif';
        });
        
        var sy = 1530;
        ctx.fillStyle = C.mute; ctx.font = '500 26px Inter, sans-serif';
        ctx.fillText('Pages Read', 80, sy); ctx.fillText('Avg Rating', 580, sy);
        ctx.fillStyle = C.text; ctx.font = '800 76px Inter, sans-serif';
        ctx.fillText(trunc(pages ? pages.toLocaleString() : '—', 440), 80, sy + 90);
        ctx.fillText(avg ? avg.toFixed(1) + '/10' : '—', 580, sy + 90);
        ctx.font = '800 30px Inter, sans-serif'; ctx.fillText('PLAYLOG', 80, 1850);
        ctx.textAlign = 'right'; ctx.fillText('BOOKS WRAPPED · ' + P.sh, 1000, 1850); ctx.textAlign = 'left';
      } else {
        var accent = '#4ade80';
        ctx.fillStyle = '#0b0b0d'; ctx.fillRect(0, 0, W, H);
        var heroH = 620, tw = 420, th = 600, c0 = W / 2 - tw / 2;
        var layout = top.length === 1 ? [{ i: 0, x: c0, y: 10, r: 0 }]
          : top.length === 2 ? [{ i: 1, x: c0 + 130, y: 40, r: 0.07 }, { i: 0, x: c0 - 130, y: 20, r: -0.05 }]
          : [{ i: 1, x: c0 - 210, y: 40, r: -0.09 }, { i: 2, x: c0 + 210, y: 40, r: 0.09 }, { i: 0, x: c0, y: 10, r: 0 }];
        ctx.save(); AppUtils.roundRectPath(ctx, 0, 0, W, heroH + 60, 0); ctx.clip();
        layout.forEach(function (p) {
          var im = imgs[p.i];
          ctx.save(); ctx.translate(p.x + tw / 2, p.y + th / 2); ctx.rotate(p.r); ctx.translate(-tw / 2, -th / 2);
          ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 20;
          AppUtils.roundRectPath(ctx, 0, 0, tw, th, 24);
          if (im) { ctx.clip(); cover(im, 0, 0, tw, th); } else { ctx.fillStyle = '#1e1e1e'; ctx.fill(); }
          ctx.restore();
        });
        var fade = ctx.createLinearGradient(0, heroH - 260, 0, heroH + 60);
        fade.addColorStop(0, 'rgba(11,11,13,0)'); fade.addColorStop(1, 'rgba(11,11,13,1)');
        ctx.fillStyle = fade; ctx.fillRect(0, 0, W, heroH + 60);
        var scrim = ctx.createLinearGradient(0, 0, 0, 220);
        scrim.addColorStop(0, 'rgba(0,0,0,0.55)'); scrim.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = scrim; ctx.fillRect(0, 0, W, 220);
        ctx.restore();
        blurDraw(ctx, imgs[0], 0, 680, W, H - 680, 0.45);
        var vg = ctx.createLinearGradient(0, 680, 0, 900);
        vg.addColorStop(0, 'rgba(11,11,13,1)'); vg.addColorStop(1, 'rgba(11,11,13,0)');
        ctx.fillStyle = vg; ctx.fillRect(0, 680, W, 220);
        var vg2 = ctx.createLinearGradient(0, 1100, 0, H);
        vg2.addColorStop(0, 'rgba(11,11,13,0)'); vg2.addColorStop(1, 'rgba(11,11,13,0.6)');
        ctx.fillStyle = vg2; ctx.fillRect(0, 1100, W, H - 1100);
        ctx.fillStyle = accent; ctx.font = '800 30px Inter, sans-serif';
        ctx.fillText('BOOKS WRAPPED · ' + P.label.toUpperCase(), 60, heroH + 72);
        ctx.fillRect(60, heroH + 20, 90, 8);
        ctx.fillStyle = '#ffffff'; ctx.font = '800 130px Inter, sans-serif';
        ctx.fillText(String(reads.length), 58, heroH + 200);
        ctx.fillStyle = '#bbbbbb'; ctx.font = '500 34px Inter, sans-serif';
        ctx.fillText('books read' + (P.re ? ' · ' + P.re + ' re-read' + (P.re > 1 ? 's' : '') : ''), 62, heroH + 240);

        var cards = [[pages ? pages.toLocaleString() : '—', 'Pages Read'], [avg ? avg.toFixed(1) + '/10' : '—', 'Avg Rating'], [authors[0] || '—', 'Top Author'], [pages ? Math.round(pages / reads.length).toLocaleString() : '—', 'Avg Length'], [pages ? Math.max.apply(null, reads.map(function (b) { return Number(b.pages) || 0; })).toLocaleString() : '—', 'Longest Book'], [String(authors.length), 'Authors']];
        var gap = 20, cw = (W - 120 - gap * 2) / 3, sy2 = heroH + 275;
        cards.forEach(function (s, i) {
          var x = 60 + (i % 3) * (cw + gap), y = sy2 + Math.floor(i / 3) * 160, val = String(s[0]);
          ctx.fillStyle = 'rgba(255,255,255,0.05)'; AppUtils.roundRectPath(ctx, x, y, cw, 140, 20); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1.5; AppUtils.roundRectPath(ctx, x, y, cw, 140, 20); ctx.stroke();
          ctx.fillStyle = accent;
          ctx.font = 'bold ' + (val.length > 12 ? 26 : val.length > 9 ? 30 : val.length > 6 ? 36 : 44) + 'px Inter, sans-serif';
          ctx.fillText(trunc(val, cw - 44), x + 22, y + 94);
          ctx.fillStyle = '#999999'; ctx.font = '600 20px Inter, sans-serif';
          ctx.fillText(s[1].toUpperCase(), x + 22, y + 122);
        });

        var ly = 1250;
        ctx.fillStyle = accent; ctx.font = '800 28px Inter, sans-serif'; ctx.fillText('TOP ' + top.length, 60, ly);
        top.forEach(function (b, i) {
          var y = ly + 25 + i * 140;
          glass(ctx, 60, y, W - 120, 130, 20, 0.08);
          ctx.save(); AppUtils.roundRectPath(ctx, 72, y + 10, 73, 110, 10); ctx.clip();
          if (imgs[i]) cover(imgs[i], 72, y + 10, 73, 110); else { ctx.fillStyle = '#1e1e1e'; ctx.fillRect(72, y + 10, 73, 110); }
          ctx.restore();
          ctx.fillStyle = accent; ctx.font = '800 54px Inter, sans-serif'; ctx.fillText(String(i + 1), 170, y + 82);
          ctx.fillStyle = '#ffffff'; ctx.font = '700 34px Inter, sans-serif';
          ctx.fillText(trunc(b.title, 500), 240, y + 58);
          ctx.fillStyle = '#cccccc'; ctx.font = '500 26px Inter, sans-serif';
          ctx.fillText(trunc((b.author || '').toUpperCase(), 500), 240, y + 100);
          var pgs = b.pages ? Number(b.pages).toLocaleString() + 'p' : '';
          ctx.save(); ctx.textAlign = 'right';
          ctx.font = '700 34px Inter, sans-serif'; ctx.fillStyle = '#ffffff'; ctx.fillText(pgs, W - 90, y + 84);
          ctx.fillStyle = accent; ctx.font = '800 60px Inter, sans-serif'; ctx.fillText(b.bookRating ? String(b.bookRating) : '—', W - 90 - 160, y + 84);
          ctx.restore();
        });

        ctx.fillStyle = '#666666'; ctx.font = '500 24px Inter, sans-serif'; ctx.fillText('Generated with Playlog', 60, H - 40);
      }
      showWrappedPreview($('bk-wrap-canvas'), canvas);
      $('bk-wrap-download').style.display = '';
      $('bk-wrap-share').style.display = '';
    });
  }

  function showWrappedPreview(wrap, canvas) {
    wrap.style.setProperty('--card-ratio', canvas.width / canvas.height);
    wrap.replaceChildren(canvas);
    wrap.classList.add('has-card');
    $('bk-wrap-result').classList.add('has-card');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'button');
    wrap.setAttribute('aria-label', 'Open full-size Books Wrapped preview');
    if (wrap.dataset.previewBound) return;
    wrap.dataset.previewBound = 'true';
    wrap.addEventListener('click', function () {
      AppUtils.showCanvasPreview(wrap.querySelector('canvas'));
    });
    wrap.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        AppUtils.showCanvasPreview(wrap.querySelector('canvas'));
      }
    });
  }

  function updateWrapYears(reads) {
    var select = $('bk-wrap-year'), current = select.value || 'all', years = {};
    reads.forEach(function (b) { if (b.finishYear) years[b.finishYear] = true; });
    select.innerHTML = '<option value="all">All time</option>' + Object.keys(years).sort(function (a, b) { return b - a; })
      .map(function (year) { return '<option value="' + year + '">' + year + '</option>'; }).join('');
    select.value = years[current] ? current : 'all';
  }

  function generateWrapped() {
    var year = $('bk-wrap-year').value, inPeriod = readInstances().filter(function (b) { return year === 'all' || b.finishYear === +year; }), reads = inPeriod.filter(function (b) { return !b._reRead; });
    if (!reads.length) return AppUtils.showToast('No finished books to wrap for this period.');
    var canvas = document.createElement('canvas'), ctx, pages = 0, rated = [], authors = {}, titles = {};
    canvas.width = 900; canvas.height = 1200; ctx = canvas.getContext('2d');
    reads.forEach(function (b) {
      pages += Number(b.pages) || 0;
      if (b.bookRating >= 1 && b.bookRating <= 10) rated.push(Number(b.bookRating));
      if (b.author) authors[b.author] = (authors[b.author] || 0) + 1;
      titles[b.id] = b;
    });
    var topAuthor = Object.keys(authors).sort(function (a, b) { return authors[b] - authors[a]; })[0] || '—';
    var avg = rated.length ? (rated.reduce(function (sum, value) { return sum + value; }, 0) / rated.length).toFixed(1) + ' / 10' : '—';
    var top = Object.keys(titles).map(function (id) { return titles[id]; })
      .sort(function (a, b) { return (b.finishDate || '').localeCompare(a.finishDate || ''); }).slice(0, 5);
    var bg = ctx.createLinearGradient(0, 0, 900, 1200);
    bg.addColorStop(0, '#252014'); bg.addColorStop(.52, '#101114'); bg.addColorStop(1, '#18142a');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 900, 1200);
    ctx.fillStyle = 'rgba(255,255,255,.06)'; AppUtils.roundRectPath(ctx, 48, 48, 804, 1104, 32); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.13)'; ctx.lineWidth = 2; AppUtils.roundRectPath(ctx, 48, 48, 804, 1104, 32); ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillStyle = '#e5c66a'; ctx.font = '700 24px Inter, sans-serif';
    ctx.fillText('PLAYLOG  /  BOOKS WRAPPED', 96, 118);
    ctx.fillStyle = '#f5f2e9'; ctx.font = '800 64px Inter, sans-serif';
    ctx.fillText(year === 'all' ? 'All-time recap' : year + ' recap', 96, 210);
    ctx.fillStyle = '#aaa'; ctx.font = '500 24px Inter, sans-serif'; ctx.fillText('YOUR YEAR IN READING', 96, 258);
    var cards = [
      { value: reads.length.toLocaleString(), label: 'BOOK READS' },
      { value: inPeriod.filter(function (b) { return b._reRead; }).length.toLocaleString(), label: 'RE-READS' },
      { value: pages.toLocaleString(), label: 'PAGES READ' },
      { value: avg, label: 'YOUR AVG RATING' },
      { value: topAuthor, label: 'TOP AUTHOR' }
    ];
    cards.forEach(function (card, i) {
      var x = 96 + (i % 2) * 360, y = 312 + Math.floor(i / 2) * 130, w = 330, h = 106;
      ctx.fillStyle = 'rgba(255,255,255,.055)'; AppUtils.roundRectPath(ctx, x, y, w, h, 18); ctx.fill();
      ctx.fillStyle = '#e5c66a'; ctx.font = '700 ' + (card.value.length > 16 ? 23 : 36) + 'px Inter, sans-serif';
      ctx.fillText(card.value, x + 22, y + 46, w - 44);
      ctx.fillStyle = '#aaa'; ctx.font = '600 17px Inter, sans-serif'; ctx.fillText(card.label, x + 22, y + 80);
    });
    ctx.fillStyle = '#f5f2e9'; ctx.font = '700 28px Inter, sans-serif'; ctx.fillText('Books you finished', 96, 710);
    ctx.font = '500 23px Inter, sans-serif';
    top.forEach(function (b, i) {
      var y = 760 + i * 62;
      ctx.fillStyle = '#e5c66a'; ctx.fillText(String(i + 1).padStart(2, '0'), 96, y);
      ctx.fillStyle = '#f5f2e9'; ctx.fillText(b.title || 'Untitled', 150, y, 380);
      ctx.fillStyle = '#aaa'; ctx.textAlign = 'right'; ctx.fillText(b.author || '', 804, y, 240); ctx.textAlign = 'left';
      ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.beginPath(); ctx.moveTo(96, y + 24); ctx.lineTo(804, y + 24); ctx.stroke();
    });
    ctx.fillStyle = '#888'; ctx.font = '500 18px Inter, sans-serif'; ctx.fillText('Logged on Playlog', 96, 1085);
    var wrap = $('bk-wrap-canvas');
    showWrappedPreview(wrap, canvas);
    $('bk-wrap-download').style.display = '';
    $('bk-wrap-share').style.display = '';
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
      bt.onclick = function () { row.querySelectorAll('.selected').forEach(function (x) { x.classList.remove('selected'); }); bt.classList.add('selected'); rating = n; };
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
      if (navigator.vibrate) navigator.vibrate(15);
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
  $('bk-q').addEventListener('input', lib);
  $('bk-sort').addEventListener('change', lib);
  $('bk-view').addEventListener('click', function (e) {
    var button = e.target.closest('[data-view]');
    if (!button) return;
    viewMode = button.dataset.view;
    localStorage.setItem('pl-books-view', viewMode);
    lib();
  });
  document.querySelectorAll('#bk-card-style .toggle-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('#bk-card-style .toggle-btn').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active'); wrapStyle = b.dataset.style;
      if ($('bk-wrap-canvas').firstChild) generateBooksWrapped();
    });
  });
  $('bk-wrap-generate').addEventListener('click', generateBooksWrapped);
  $('bk-wrap-py').addEventListener('change', function () {
    wTok++;
    if ($('bk-wrap-canvas').firstChild) generateBooksWrapped();
  });
  $('bk-wrap-pm').addEventListener('change', function () {
    wTok++;
    if ($('bk-wrap-canvas').firstChild) generateBooksWrapped();
  });
  $('bk-wrap-download').addEventListener('click', function () {
    var canvas = $('bk-wrap-canvas').querySelector('canvas');
    if (!canvas) return;
    var link = document.createElement('a');
    link.download = 'playlog-books-wrapped.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
  $('bk-wrap-share').addEventListener('click', function () {
    var canvas = $('bk-wrap-canvas').querySelector('canvas');
    if (!canvas) return;
    AppUtils.shareCanvas(canvas, 'playlog-books-wrapped.png', 'Books Wrapped')
      .catch(function (error) {
        if (error.name !== 'AbortError') AppUtils.showToast(error.message || 'Could not share the card.');
      });
  });
  $('bk-py').addEventListener('change', stats);
  $('bk-pm').addEventListener('change', stats);
  $('fab-add').addEventListener('click', addModal);
  $('bk-file').addEventListener('change', function () { var fl = this.files[0]; this.value = ''; if (fl) importList(fl); });
  $('btn-back').addEventListener('click', function () { window.location.href = '/home.html'; });
  $('type-pills').addEventListener('click', function (e) {
    var b = e.target.closest('.type-pill');
    if (b && b.dataset.tab !== 'books') window.location.href = '/home.html?tab=' + b.dataset.tab;
  });

  AppAuth.requireAuth(function (u) { uid = u.uid; load(); });
})();