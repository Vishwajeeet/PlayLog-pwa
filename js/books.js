(function () {
  var $ = function (id) { return document.getElementById(id); }, esc = AppUtils.esc;
  var uid, BOOKS = [], DESC_PENDING = {}, shelf = null, viewMode = localStorage.getItem('pl-books-view') === 'list' ? 'list' : 'grid';
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
  function modal(html) {
    var ov = document.createElement('div');
    ov.className = 'modal-overlay open'; ov.innerHTML = html;
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov); return ov;
  }
  function shrink(file, cb) {
    var r = new FileReader();
    r.onload = function (e) {
      var im = new Image();
      im.onload = function () {
        var k = Math.min(1, 300 / im.width), c = document.createElement('canvas');
        c.width = im.width * k; c.height = im.height * k;
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        cb(c.toDataURL('image/jpeg', 0.72));
      };
      im.src = e.target.result;
    };
    r.readAsDataURL(file);
  }
  function bookDoc(m, st, openLibraryRating) {
    var n = new Date();
    var d = { type: 'book', title: m.title, author: m.author || '', poster: m.poster || null, pages: m.pages || null,
      genres: m.genres || [], fiction: m.fiction !== false, olKey: m.olKey || null, bookStatus: st, bookRating: null,
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
      if (!shelf) shelf = BOOKS.some(function (b) { return b.bookStatus === 'reading'; }) ? 'reading' : BOOKS.some(function (b) { return b.bookStatus === 'read'; }) ? 'read' : 'want';
      render();
    }).catch(function () { AppUtils.showToast('Failed to load books.'); });
  }
  function render() { hero(); shelves(); lib(); stats(); wantStats(); }

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
  function shelves() {
    $('bk-shelf').innerHTML = ['want', 'reading', 'read'].map(function (k) {
      var n = BOOKS.filter(function (b) { return b.bookStatus === k; }).length;
      return '<button class="toggle-btn' + (k === shelf ? ' active' : '') + '" data-v="' + k + '">' + ST[k] + ' · ' + n + '</button>';
    }).join('');
  }
  function lib() {
    var q = $('bk-q').value.trim().toLowerCase(), s = $('bk-sort').value;
    var l = BOOKS.filter(function (b) { return b.bookStatus === shelf && (!q || ((b.title || '') + ' ' + (b.author || '')).toLowerCase().indexOf(q) > -1); });
    var T = function (b) { return (b.title || '').toLowerCase(); };
    if (s === 'title') l.sort(function (a, b) { return T(a) < T(b) ? -1 : 1; });
    else if (s === 'rating') l.sort(function (a, b) { return (b.bookRating || 0) - (a.bookRating || 0); });
    else if (s === 'pages') l.sort(function (a, b) { return (b.pages || 0) - (a.pages || 0); });
    else if (s === 'finished') l.sort(function (a, b) { return (b.finishDate || '').localeCompare(a.finishDate || ''); });
    var grid = $('bk-grid');
    grid.classList.toggle('is-list', viewMode === 'list');
    grid.innerHTML = l.map(tile).join('') || '<p class="bk-empty">' + (q ? 'No matches.' : 'Nothing on this shelf yet. Tap “Add Book”.') + '</p>';
    $('bk-view').querySelectorAll('[data-view]').forEach(function (button) {
      var active = button.dataset.view === viewMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  /* ---------- stats ---------- */
  function spark(r) {
    if (!r.length) return '';
    var w = 110, h = 34, pts = r.map(function (v, i) { return ((r.length > 1 ? i * (w - 8) / (r.length - 1) : w / 2 - 4) + 4) + ',' + (h - 4 - (v - 1) / 9 * (h - 8)); });
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '"><polyline points="' + pts.join(' ') + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>' +
      pts.map(function (p) { var c = p.split(','); return '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="2.6" fill="var(--accent)"/>'; }).join('') + '</svg>';
  }
  function donut(parts) {
    var tot = parts.reduce(function (s, p) { return s + p[1]; }, 0), C = 2 * Math.PI * 70, off = 0, segs = '', leg = '';
    parts.forEach(function (p) {
      if (!p[1]) return;
      var len = p[1] / tot * C;
      segs += '<circle cx="100" cy="100" r="70" fill="none" stroke="' + p[2] + '" stroke-width="28" stroke-dasharray="' + Math.max(len - 3, 1) + ' ' + C + '" stroke-dashoffset="' + (-off) + '"/>';
      off += len;
      leg += '<span class="dn-leg"><i style="background:' + p[2] + '"></i>' + esc(p[0]) + ' ' + p[1] + ' (' + Math.round(p[1] / tot * 100) + '%)</span>';
    });
    return '<div class="viz-card dn-wrap"><div class="dn-box"><svg viewBox="0 0 200 200" class="dn-svg"><g transform="rotate(-90 100 100)">' + segs + '</g></svg><div class="dn-info"><b>' + tot + '</b><span>books</span></div></div><div class="dn-legend">' + leg + '</div></div>';
  }
  function cols(v, lb, cls) {
    var active = v.map(function (count, i) { return { count: count, label: lb[i] }; }).filter(function (bin) { return bin.count > 0; });
    var mx = Math.max.apply(null, active.map(function (bin) { return bin.count; }).concat(1));
    return '<div class="viz-card viz-cols ' + (cls || '') + '">' + active.map(function (bin) {
      return '<div><span>' + bin.count + '</span><i style="height:' + Math.round(bin.count / mx * 80) + 'px"></i><em>' + bin.label + '</em></div>';
    }).join('') + '</div>';
  }
  function f(v) { return (+v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)).toLocaleString(); }

  function readInstances() {
    var reads = [];
    BOOKS.forEach(function (b) {
      if (b.bookStatus !== 'read' || !b.finishYear) return;
      reads.push(Object.assign({}, b));
      var dates = Array.isArray(b.reReadDates) ? b.reReadDates.filter(function (date) { return /^\d{4}-\d{2}-\d{2}$/.test(date); }) : [];
      var count = Math.max(0, Math.floor(Number(b.reReadCount) || 0), dates.length);
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
    var pg = 0, rs = 0, rn = 0, ps = 0, pn = 0, fc = 0, gc = {}, byA = {};
    var rc = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], pb = [0, 0, 0, 0, 0, 0, 0, 0], TH = [100, 200, 300, 400, 500, 600, 1000];
    l.forEach(function (b) {
      pg += b.pages || 0;
      if (b.pages) { ps += b.pages; pn++; var k = 0; while (k < 7 && b.pages > TH[k]) k++; pb[k]++; }
      if (b.author) (byA[b.author] = byA[b.author] || []).push(b);
      if (b.bookRating >= 1 && b.bookRating <= 10) { rs += b.bookRating; rn++; rc[b.bookRating - 1]++; }
      (b.genres || []).forEach(function (g) { gc[g] = (gc[g] || 0) + 1; });
      if (b.fiction !== false) fc++;
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

    box.innerHTML =
      '<div class="bk-num"><div class="bk-n"><b>' + n + '</b><span>Books read</span></div><div class="bk-n"><b>' + reReadTotal + '</b><span>Re-reads</span></div><div class="bk-n"><b>' + pg.toLocaleString() + '</b><span>Pages read</span></div>' +
      '<div class="bk-n"><b>' + Object.keys(byA).length + '</b><span>Authors</span></div><div class="bk-n"><b>' + (rn ? (rs / rn).toFixed(1) : '—') + '</b><span>Avg rating</span></div></div>' +
      '<p class="section-title">Reading pace</p><div class="viz-card"><p class="bk-serif bk-big">You read a book every ' + ev + (ev === 1 ? ' day' : ' days') + '</p>' + pr('Books', n) + (pg ? pr('Pages', pg) : '') + '</div>' +
      '<div class="viz-pair"><div><p class="section-title">Fiction vs non-fiction</p>' + donut([['Fiction', fc, acc], ['Non-fiction', n - fc, '#7c8aa5']]) + '</div>' +
      (gk.length ? '<div><p class="section-title">Top genres</p><div class="viz-card">' + gk.map(function (g) {
        return '<div class="viz-row"><span>' + esc(g) + '</span><div><i style="width:' + Math.round(gc[g] / gc[gk[0]] * 100) + '%"></i></div><b>' + gc[g] + '</b></div>';
      }).join('') + '</div></div>' : '') + '</div>' +
      '<div class="viz-pair bk-distribution"><div><p class="section-title">Ratings</p>' + (rn ? '<span class="bk-badge">Average ★ ' + (rs / rn).toFixed(2) + '</span>' + cols(rc, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) : '<p class="viz-empty">No rated books in this period.</p>') + '</div>' +
      '<div><p class="section-title">Page counts</p>' + (pn ? '<span class="bk-badge">Average ' + Math.round(ps / pn) + ' pages</span>' + cols(pb, ['100', '200', '300', '400', '500', '600', '1000', '1000+'], 'bk-pages') : '<p class="viz-empty">No page counts in this period.</p>') + '</div></div>' +
      (as.length ? '<p class="section-title">Most read authors</p><div class="viz-card">' + as.map(function (x) {
        var top = x.bs.slice().sort(function (p, q) { return (q.bookRating || 0) - (p.bookRating || 0); }).slice(0, 4);
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
    var pages = 0, pageBooks = 0, authors = {}, genres = {}, fiction = 0, knownType = 0, ratingTotal = 0, ratingCount = 0, ratedUsers = 0;
    want.forEach(function (book) {
      if (Number(book.pages) > 0) { pages += Number(book.pages); pageBooks++; }
      if (book.author) authors[book.author] = (authors[book.author] || 0) + 1;
      (book.genres || []).forEach(function (genre) { genres[genre] = (genres[genre] || 0) + 1; });
      if (book.fiction !== null && book.fiction !== undefined) { knownType++; if (book.fiction !== false) fiction++; }
      var rating = book.openLibraryRating && Number(book.openLibraryRating.average);
      if (book.openLibraryRatingFetched && rating > 0) {
        ratingTotal += rating;
        ratingCount++;
        ratedUsers += Number(book.openLibraryRating.count) || 0;
      }
    });
    var genreNames = Object.keys(genres).sort(function (a, b) { return genres[b] - genres[a]; }).slice(0, 6);
    var authorNames = Object.keys(authors).sort(function (a, b) { return authors[b] - authors[a]; }).slice(0, 4);
    var acc = (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '').trim() || '#c9a84c';
    box.innerHTML =
      '<div class="bk-num bk-want-numbers"><div class="bk-n"><b>' + want.length + '</b><span>Books queued</span></div>' +
      '<div class="bk-n"><b>' + (pageBooks ? pages.toLocaleString() + (pageBooks < want.length ? '+' : '') : '—') + '</b><span>Pages listed · ' + pageBooks + ' books</span></div>' +
      '<div class="bk-n"><b>' + Object.keys(authors).length + '</b><span>Authors waiting</span></div>' +
      '<div class="bk-n"><b>' + (ratingCount ? (ratingTotal / ratingCount).toFixed(1) + ' / 5' : '—') + '</b><span>Open Library avg' +
      (ratedUsers ? ' · ' + ratedUsers.toLocaleString() + ' ratings' : '') + '</span></div></div>' +
      '<div class="viz-pair bk-want-pair"><div><p class="section-title">Your queue by type</p>' +
      (knownType ? donut([['Fiction', fiction, acc], ['Non-fiction', knownType - fiction, '#7c8aa5']]) : '<p class="viz-empty">Book types are not available yet.</p>') + '</div>' +
      '<div><p class="section-title">Genres on your list</p>' +
      (genreNames.length ? '<div class="viz-card">' + genreNames.map(function (genre) {
        return '<div class="viz-row"><span>' + esc(genre) + '</span><div><i style="width:' + Math.round(genres[genre] / genres[genreNames[0]] * 100) + '%"></i></div><b>' + genres[genre] + '</b></div>';
      }).join('') + '</div>' : '<p class="viz-empty">Genre details are not available for these books yet.</p>') + '</div></div>' +
      (authorNames.length ? '<p class="section-title">Authors with the most books in your queue</p><div class="bk-viz-authors">' +
        authorNames.map(function (author) {
          return '<div class="bk-viz-author"><span>' + esc(author) + '</span><div><i style="width:' + Math.round(authors[author] / authors[authorNames[0]] * 100) + '%"></i></div><b>' + authors[author] + '</b></div>';
        }).join('') + '</div>' : '');
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
    var rereads = Math.max(0, Math.floor(Number(b.reReadCount) || 0), Array.isArray(b.reReadDates) ? b.reReadDates.length : 0);
    if (b.bookStatus === 'read') rows.push(['Re-read', rereads + ' time' + (rereads === 1 ? '' : 's')]);
    var chips = ['<span class="bk-chip">' + ST[b.bookStatus] + '</span>'];
    if (b.pages) chips.push('<span class="bk-chip">' + Number(b.pages) + ' pages</span>');
    chips.push('<span class="bk-chip">' + (b.fiction === false ? 'Non-fiction' : 'Fiction') + '</span>');
    (b.genres || []).slice(0, 3).forEach(function (g) { chips.push('<span class="bk-chip">' + esc(g) + '</span>'); });
    var ov = modal('<div class="modal-box bk-sheet"><div class="bk-det"><div class="bk-det-c">' + cov(b) + '</div><div class="bk-det-i"><h2 class="bk-serif">' + esc(b.title) + '</h2><p class="text-sm text-muted" style="margin-bottom:10px">' + esc(b.author) + '</p><div class="bk-chips">' + chips.join('') + '</div></div></div>' +
      (rows.length ? '<div class="detail-card">' + rows.map(function (r) { return '<div class="detail-row"><span class="detail-label">' + r[0] + '</span><span class="detail-value">' + esc(r[1]) + '</span></div>'; }).join('') + '</div>' : '') +
      (hasReview ? '<div class="bk-quote">' + esc(b.review.trim()) + '</div>' : '<p class="bk-desc" id="bd-d"></p>') +
      (b.bookStatus === 'read' ? '<button class="btn btn-ghost bk-reread" id="bd-reread" type="button">↻ Mark as re-read</button>' : '') +
      '<div class="modal-actions"><button class="btn btn-ghost" id="bd-x">Close</button><button class="btn btn-primary" id="bd-e">Edit</button></div></div>');
    ov.querySelector('#bd-x').onclick = function () { ov.remove(); };
    ov.querySelector('#bd-e').onclick = function () { ov.remove(); editor(b); };
    var rereadButton = ov.querySelector('#bd-reread');
    if (rereadButton) rereadButton.onclick = function () {
      var dates = Array.isArray(b.reReadDates) ? b.reReadDates.filter(function (date) { return /^\d{4}-\d{2}-\d{2}$/.test(date); }) : [];
      var button = this, count = Math.max(0, Math.floor(Number(b.reReadCount) || 0), dates.length);
      while (dates.length < count) dates.push(b.finishDate || ymd());
      dates.push(ymd());
      button.disabled = true;
      AppDB.updateEntry(uid, b.id, { reReadCount: dates.length, reReadDates: dates }).then(function () {
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

  var wrapStyle = 'detailed', wTok = 0;

  function wrapPeriod() {
    var Y = $('bk-py').value, M = +$('bk-pm').value;
    var inP = readInstances().filter(function (b) { return (Y === 'all' || b.finishYear === +Y) && (!M || b.finishMonth === M); });
    var reads = inP.filter(function (b) { return !b._reRead; });
    var label = Y === 'all' ? 'All Time' : String(Y), sh = Y === 'all' ? 'ALL TIME' : String(Y);
    if (M) { label = AppUtils.monthName(M) + (Y === 'all' ? '' : ' ' + Y); sh = AppUtils.monthShort(M).toUpperCase() + (Y === 'all' ? '' : ' ' + Y); }
    return { reads: reads, re: inP.length - reads.length, label: label, sh: sh };
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

  function generateBooksWrapped() {
    var P = wrapPeriod(), reads = P.reads;
    if (!reads.length) return AppUtils.showToast('No finished books to wrap for this period.');
    var aes = wrapStyle === 'aesthetic', tok = ++wTok;
    var pages = 0, rs = 0, rn = 0, ac = {}, mc = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    reads.forEach(function (b) {
      pages += Number(b.pages) || 0;
      if (b.bookRating >= 1 && b.bookRating <= 10) { rs += b.bookRating; rn++; }
      if (b.author) ac[b.author] = (ac[b.author] || 0) + 1;
      if (b.finishMonth >= 1 && b.finishMonth <= 12) mc[b.finishMonth - 1]++;
    });
    var avg = rn ? rs / rn : 0;
    var authors = Object.keys(ac).sort(function (a, b) { return ac[b] - ac[a]; });
    var rated = reads.filter(function (b) { return b.bookRating; });
    var top = (rated.length ? rated : reads).slice().sort(function (a, b) {
      return (b.bookRating || 0) - (a.bookRating || 0) || (b.pages || 0) - (a.pages || 0);
    }).slice(0, aes ? 5 : 3);

    var W = 1080, H = 1920, canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    $('bk-wrap-download').style.display = 'none';

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
      return Promise.all(top.slice(0, aes ? 1 : 3).map(function (b) { return wImg(b.poster); }));
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
        ctx.fillText('Top Books', 80, y0); ctx.fillText('Top Authors', 580, y0);
        ctx.fillStyle = C.text; ctx.font = '700 34px Inter, sans-serif';
        top.forEach(function (b, i) { ctx.fillText((i + 1) + '  ' + trunc(b.title, 380), 80, y0 + 60 + i * 58); });
        authors.slice(0, 5).forEach(function (a, i) { ctx.fillText((i + 1) + '  ' + trunc(a, 380), 580, y0 + 60 + i * 58); });
        var sy = 1530;
        ctx.fillStyle = C.mute; ctx.font = '500 26px Inter, sans-serif';
        ctx.fillText('Pages Read', 80, sy); ctx.fillText('Avg Rating', 580, sy);
        ctx.fillStyle = C.text; ctx.font = '800 76px Inter, sans-serif';
        ctx.fillText(trunc(pages ? pages.toLocaleString() : '—', 440), 80, sy + 90);
        ctx.fillText(avg ? avg.toFixed(1) + '/10' : '—', 580, sy + 90);
        ctx.font = '800 30px Inter, sans-serif'; ctx.fillText('PLAYLOG', 80, 1850);
        ctx.textAlign = 'right'; ctx.fillText('BOOKS WRAPPED · ' + P.sh, 1000, 1850); ctx.textAlign = 'left';
      } else {
        var accent = '#4ade80', dim = 'rgba(34,197,94,0.35)';
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
        ctx.fillText('BOOKS WRAPPED · ' + P.label.toUpperCase(), 60, 80);
        ctx.fillRect(60, heroH + 20, 90, 8);
        ctx.fillStyle = '#ffffff'; ctx.font = '800 130px Inter, sans-serif';
        ctx.fillText(String(reads.length), 58, heroH + 175);
        ctx.fillStyle = '#bbbbbb'; ctx.font = '500 34px Inter, sans-serif';
        ctx.fillText('books read' + (P.re ? ' · ' + P.re + ' re-read' + (P.re > 1 ? 's' : '') : ''), 62, heroH + 215);

        var cards = [[pages ? pages.toLocaleString() : '—', 'Pages Read'], [avg ? avg.toFixed(1) + '/10' : '—', 'Avg Rating'], [authors[0] || '—', 'Top Author']];
        var gap = 20, cw = (W - 120 - gap * 2) / 3, sy2 = heroH + 260;
        cards.forEach(function (s, i) {
          var x = 60 + i * (cw + gap), y = sy2, val = String(s[0]);
          ctx.fillStyle = 'rgba(255,255,255,0.05)'; AppUtils.roundRectPath(ctx, x, y, cw, 140, 20); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1.5; AppUtils.roundRectPath(ctx, x, y, cw, 140, 20); ctx.stroke();
          ctx.fillStyle = accent;
          ctx.font = 'bold ' + (val.length > 12 ? 26 : val.length > 9 ? 30 : val.length > 6 ? 36 : 44) + 'px Inter, sans-serif';
          ctx.fillText(trunc(val, cw - 44), x + 22, y + 94);
          ctx.fillStyle = '#999999'; ctx.font = '600 20px Inter, sans-serif';
          ctx.fillText(s[1].toUpperCase(), x + 22, y + 122);
        });

        var ly = 1090;
        ctx.fillStyle = accent; ctx.font = '800 28px Inter, sans-serif'; ctx.fillText('TOP ' + top.length, 60, ly);
        top.forEach(function (b, i) {
          var y = ly + 25 + i * 150;
          glass(ctx, 60, y, W - 120, 130, 20, 0.08);
          ctx.save(); AppUtils.roundRectPath(ctx, 72, y + 10, 73, 110, 10); ctx.clip();
          if (imgs[i]) cover(imgs[i], 72, y + 10, 73, 110); else { ctx.fillStyle = '#1e1e1e'; ctx.fillRect(72, y + 10, 73, 110); }
          ctx.restore();
          ctx.fillStyle = accent; ctx.font = '800 54px Inter, sans-serif'; ctx.fillText(String(i + 1), 170, y + 82);
          ctx.fillStyle = '#ffffff'; ctx.font = '700 34px Inter, sans-serif';
          ctx.fillText(trunc(b.title, W - 330), 240, y + 58);
          ctx.fillStyle = '#cccccc'; ctx.font = '500 26px Inter, sans-serif';
          ctx.fillText(trunc((b.bookRating ? '★ ' + b.bookRating + '/10' : 'Unrated') + ' · ' + (b.author || '').toUpperCase(), W - 330), 240, y + 100);
        });

        var mx = Math.max.apply(null, mc);
        if (mx > 0) {
          glass(ctx, 40, 1585, W - 80, 275, 24, 0.06);
          ctx.fillStyle = accent; ctx.font = '800 28px Inter, sans-serif'; ctx.fillText('FINISHED BY MONTH', 60, 1620);
          var base = 1800, slot = (W - 120) / 12, bw = 44, letters = 'JFMAMJJASOND';
          ctx.textAlign = 'center';
          mc.forEach(function (n, m) {
            var bh = Math.max(n ? 6 : 3, Math.round(n / mx * 100)), bx = 60 + m * slot + (slot - bw) / 2;
            ctx.fillStyle = n === mx ? accent : dim; AppUtils.roundRectPath(ctx, bx, base - bh, bw, bh, 8); ctx.fill();
            if (n) { ctx.fillStyle = '#dddddd'; ctx.font = '600 20px Inter, sans-serif'; ctx.fillText(String(n), bx + bw / 2, base - bh - 10); }
            ctx.fillStyle = '#999999'; ctx.font = '500 20px Inter, sans-serif'; ctx.fillText(letters[m], bx + bw / 2, base + 34);
          });
          ctx.textAlign = 'left';
        }
        ctx.fillStyle = '#666666'; ctx.font = '500 24px Inter, sans-serif'; ctx.fillText('Generated with Playlog', 60, H - 40);
      }
      $('bk-wrap-canvas').replaceChildren(canvas);
      $('bk-wrap-download').style.display = '';
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
    wrap.replaceChildren(canvas);
    $('bk-wrap-download').style.display = '';
  }

  /* ---------- add / edit ---------- */
  function editor(b) {
    var originalStatus = b.bookStatus, s = Object.assign({ bookStatus: shelf || 'want', fiction: true, genres: [] }, b), rating = s.bookRating || null;
    var ov = modal('<div class="modal-box bk-sheet"><p class="modal-title">' + (s.id ? 'Edit book' : 'Add book') + '</p>' +
      '<div class="bk-ed"><div class="bk-ed-c" id="be-cov"></div><div class="bk-ed-f"><label class="label">Title</label><input id="be-t" class="input-field" maxlength="150" value="' + esc(s.title) + '">' +
      '<label class="label" style="margin-top:10px">Author</label><input id="be-a" class="input-field" maxlength="100" value="' + esc(s.author) + '"></div></div>' +
      '<div class="bk-ed-r"><div><label class="label">Pages</label><input id="be-p" type="number" min="1" max="20000" class="input-field" value="' + (Number(s.pages) || '') + '"></div>' +
      '<div><label class="label">Type</label><select id="be-f" class="input-field"><option value="1"' + (s.fiction !== false ? ' selected' : '') + '>Fiction</option><option value="0"' + (s.fiction === false ? ' selected' : '') + '>Non-fiction</option></select></div></div>' +
      '<label class="btn btn-ghost bk-sm" for="be-file" style="margin:12px 0">🖼 Upload cover</label><input type="file" id="be-file" accept="image/*" hidden>' +
      '<label class="label">Shelf</label><div class="toggle-pair" id="be-st" style="grid-template-columns:1fr 1fr 1fr"><button class="toggle-btn" data-v="want">Want to Read</button><button class="toggle-btn" data-v="reading">Reading</button><button class="toggle-btn" data-v="read">Read</button></div>' +
      '<div id="be-sw"><label class="label">Started (optional)</label><input type="date" id="be-s" class="input-field" max="' + ymd() + '" value="' + esc(s.startDate || '') + '" style="margin-bottom:12px"></div>' +
      '<div id="be-read"><label class="label">Rating</label><div class="number-rating-row" id="be-r" style="margin-bottom:12px"></div>' +
      '<label class="label">Finished</label><input type="date" id="be-d" class="input-field" max="' + ymd() + '" value="' + esc(s.finishDate || ymd()) + '" style="margin-bottom:12px">' +
      '<label class="label">Your review</label><textarea id="be-v" class="input-field" rows="3" maxlength="2000" style="resize:none">' + esc(s.review) + '</textarea></div>' +
      '<div class="modal-actions">' + (s.id ? '<button class="btn btn-danger" id="be-del">Delete</button>' : '') + '<button class="btn btn-ghost" id="be-x">Cancel</button><button class="btn btn-primary" id="be-ok">Save</button></div></div>');
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
    if (s.id) q('#be-del').onclick = function () {
      if (!confirm('Delete this book?')) return;
      AppDB.deleteEntry(uid, s.id).then(function () { ov.remove(); AppUtils.showToast('Deleted'); load(); }).catch(function () { AppUtils.showToast('Failed to delete.'); });
    };
    q('#be-ok').onclick = function () {
      var title = q('#be-t').value.trim(); if (!title) return AppUtils.showToast('Enter a title.');
      var st = s.bookStatus, sd = q('#be-s').value, fd = q('#be-d').value;
      if (st === 'read') {
        if (!fd || fd > ymd()) return AppUtils.showToast('Pick a valid finish date.');
        if (sd && sd > fd) return AppUtils.showToast('Start date is after finish date.');
      }
      var d = { type: 'book', title: title, author: q('#be-a').value.trim(), poster: s.poster || null,
        pages: Math.min(20000, parseInt(q('#be-p').value) || 0) || null, fiction: q('#be-f').value === '1',
        genres: s.genres || [], olKey: s.olKey || null, bookStatus: st, playlistId: null, startDate: st === 'want' ? null : (sd || null) };
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
        if (d.bookStatus !== shelf) shelf = d.bookStatus;
        return load();
      }).catch(function () { q('#be-ok').disabled = false; AppUtils.showToast('Failed to save.'); });
    };
    sync();
  }

  function addModal() {
    var ov = modal('<div class="modal-box bk-sheet"><p class="modal-title">Add a book</p><input id="bs-q" class="input-field" placeholder="Search title or author…">' +
      '<div id="bs-st" class="text-sm text-muted" style="margin:8px 0"></div><div id="bs-res" class="results-list" style="max-height:48vh;overflow-y:auto"></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" id="bs-man">✍️ Add manually</button><button class="btn btn-ghost" id="bs-x">Close</button></div>' +
      '<button class="btn btn-ghost" id="bs-import" style="width:100%;margin-top:10px">📥 Import list</button></div>');
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
      var ov = modal('<div class="modal-box bk-sheet"><p class="modal-title">Import list</p><div id="im-b"><p id="im-p" class="text-sm text-muted">Starting…</p><div class="bk-prog"><i id="im-f"></i></div></div></div>');
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
          shelf = st;
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
    if (t) { var b = BOOKS.filter(function (x) { return x.id === t.dataset.id; })[0]; if (b) detail(b); }
  });
  $('bk-shelf').addEventListener('click', function (e) { var t = e.target.closest('.toggle-btn'); if (t) { shelf = t.dataset.v; shelves(); lib(); } });
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
  $('bk-wrap-download').addEventListener('click', function () {
    var canvas = $('bk-wrap-canvas').querySelector('canvas');
    if (!canvas) return;
    var link = document.createElement('a');
    link.download = 'playlog-books-wrapped.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
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