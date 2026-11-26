// Stats page: yearly and monthly statistics with Spotify Wrapped style canvas card
AppAuth.requireAuth(function (user) {

  var uid = user.uid;

  var allEntries = [];

  var currentYear = 'all';

  var currentMonth = 0;

  if (AppUtils.booksPill) AppUtils.booksPill('stats-type-pills');
  var statsTab = (function () {
    var t = new URLSearchParams(window.location.search).get('tab') || localStorage.getItem('pl-tab-pref') || 'media';
    if (t === 'last') t = localStorage.getItem('pl-last-tab') || 'media';
    if (t === 'games') return 'games';
    if (t === 'books' && localStorage.getItem('pl-books') === '1') return 'books';
    return 'media';
  })();
  var allBooks = null;
  var booksLoadPromise = null;
  function booksEnabled() { return localStorage.getItem('pl-books') === '1'; }
  function ensureBooks(force) {
    if (!booksEnabled()) {
      allBooks = [];
      return Promise.resolve([]);
    }
    if (!force && Array.isArray(allBooks)) return Promise.resolve(allBooks);
    if (!force && booksLoadPromise) return booksLoadPromise;
    booksLoadPromise = (window.AppDB && AppDB.getBooks ? AppDB.getBooks(uid, force) : Promise.resolve([]))
      .then(function (list) {
        allBooks = list || [];
        booksLoadPromise = null;
        return allBooks;
      })
      .catch(function () {
        booksLoadPromise = null;
        allBooks = allBooks || [];
        return allBooks;
      });
    return booksLoadPromise;
  }
  document.querySelectorAll('#stats-type-pills .type-pill').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === statsTab); });
  var wrappedYear = null;
  var wrappedMonth = null;
  var wrappedRenderTab = null;
  var wrappedShareToken = 0;

  document.getElementById('stats-type-pills').addEventListener('click', function (e) {
    var btn = e.target.closest('.type-pill');
    if (!btn) return;
    var nextTab = btn.dataset.tab === 'games' ? 'games' : (btn.dataset.tab === 'books' && booksEnabled() ? 'books' : 'media');
    if (nextTab === statsTab) return;
    document.querySelectorAll('#stats-type-pills .type-pill').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    statsTab = nextTab;
    if (statsTab === 'books' && allBooks === null) {
      ensureBooks().then(function () {
        populateYearSelect();
        render();
      });
      return;
    }
    populateYearSelect();
    render();
  });

  // BACK BUTTON

  document.getElementById('btn-back')
    .addEventListener('click', function () {
      if (document.referrer && document.referrer.indexOf(window.location.origin) === 0) {
        window.history.back();
      } else {
        window.location.href = '/home.html';
      }
    });

  // LOAD ENTRIES

  (statsTab === 'books' ? Promise.all([AppDB.getAllEntries(uid), ensureBooks()]) : AppDB.getAllEntries(uid))
    .then(function (res) {
      var entries = Array.isArray(res && res[0]) && statsTab === 'books' ? res[0] : res;
      allEntries = entries || [];
      AppUtils.setAmbient((allEntries[0] && allEntries[0].poster) || (allBooks && allBooks[0] && allBooks[0].poster));

      populateYearSelect();

      render();

    })
    .catch(function (err) {

      console.error(err);

      AppUtils.showToast(
        'Failed to load stats.'
      );

    });

  // YEAR SELECT

  function rereadBookData(b) {
    var count = Number(b.reReadCount);
    var dates = Array.isArray(b.reReadDates) ? b.reReadDates.filter(Boolean) : [];
    return { count: Number.isFinite(count) && count >= 0 ? count : dates.length, dates: dates };
  }

  function readBookInstances() {
    var out = [];
    (allBooks || []).forEach(function (b) {
      if (b.bookStatus !== 'read' || !b.finishYear || !b.finishMonth) return;
      out.push(b);
      var r = rereadBookData(b);
      for (var i = 0; i < r.count; i++) {
        var d = r.dates[i], fy = d ? +d.slice(0, 4) : b.finishYear, fm = d ? +d.slice(5, 7) : b.finishMonth;
        out.push(Object.assign({}, b, { _reRead: true, finishDate: d || b.finishDate, finishYear: fy, finishMonth: fm }));
      }
    });
    return out;
  }

  function populateYearSelect(entries) {

    var select =
      document.getElementById(
        'year-select'
      );

    var years = {};

    if (statsTab === 'books') {
      readBookInstances().forEach(function (b) {
        if (b.finishYear) years[b.finishYear] = true;
      });
    } else {
      (entries || allEntries || []).forEach(function (entry) {
        var match = statsTab === 'games' ? entry.type === 'game' : entry.type !== 'game';
        if (match && entry.yearWatched) {
          years[entry.yearWatched] = true;
        }
      });
    }

    var sortedYears =
      Object.keys(years)
        .sort(function (a, b) {
          return b - a;
        });

    select.innerHTML = '';

    var allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All Years';
    select.appendChild(allOption);

    sortedYears.forEach(function (year) {

      var option =
        document.createElement('option');

      option.value = year;

      option.textContent = year;

      select.appendChild(option);

    });

    if (currentYear !== 'all' && !years[currentYear]) {
      currentYear = 'all';
    }
    select.value = String(currentYear);

    if (!select.dataset.bound) {
      select.dataset.bound = '1';
      select.addEventListener(
        'change',
        function () {

          currentYear =
            select.value === 'all' ? 'all' : Number(select.value);

          render();

        }
      );
    }

  }

  // MONTH FILTER

  setupMonthFilter();

  function setupMonthFilter() {

    var chips =
      document.querySelectorAll(
        '#month-filter .chip'
      );

    chips.forEach(function (chip) {

      chip.addEventListener(
        'click',
        function () {

          chips.forEach(function (c) {
            c.classList.remove(
              'selected'
            );
          });

          chip.classList.add(
            'selected'
          );

          currentMonth =
            Number(
              chip.dataset.month
            );

          render();

        }
      );

    });

  }

  // FILTERED DATA

  function getFilteredEntries() {

    return allEntries.filter(
      function (entry) {

        var typeMatch =
          statsTab === 'games'
            ? entry.type === 'game'
            : entry.type !== 'game';

        var yearMatch =
          currentYear === 'all' || entry.yearWatched === currentYear;

        var monthMatch =
          currentMonth === 0
          || entry.monthWatched === currentMonth;

        return typeMatch && yearMatch && monthMatch && entry.completionStatus !== 'wishlist';

      }
    );

  }

  // RENDER

  function bookSrc(u) {
    return typeof u === 'string' && /^(https:\/\/covers\.openlibrary\.org\/|data:image\/(jpeg|png|webp);base64,)/.test(u) ? u : '';
  }

  function bookCov(b) {
    var s = bookSrc(b.poster);
    return '<div class="bk-cov">' + (s ? '<img loading="lazy" alt="" src="' + AppUtils.esc(s) + '" onerror="this.style.display=\'none\'">' : '<em>' + AppUtils.esc((b.title || '').slice(0, 40)) + '</em>') + '</div>';
  }

  function fmtNum(v) {
    return (+v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)).toLocaleString();
  }

  function bookSpark(r, strokeColor) {
    if (!r.length) return '';
    var w = 110, h = 34, sc = strokeColor || 'var(--viz-books-accent, var(--accent))';
    var pts = r.map(function (v, i) {
      return ((r.length > 1 ? i * (w - 8) / (r.length - 1) : w / 2 - 4) + 4) + ',' + (h - 4 - (v - 1) / 9 * (h - 8));
    });
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '"><polyline points="' + pts.join(' ') + '" fill="none" stroke="' + sc + '" stroke-width="2" stroke-linejoin="round"/>' +
      pts.map(function (p) { var c = p.split(','); return '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="2.6" fill="' + sc + '"/>'; }).join('') + '</svg>';
  }

  function bookCols(v, lb, cls) {
    var active = v.map(function (count, i) { return { count: count, label: lb[i] }; }).filter(function (bin) { return bin.count > 0; });
    var mx = Math.max.apply(null, active.map(function (bin) { return bin.count; }).concat(1));
    return '<div class="viz-card viz-cols ' + (cls || '') + '" style="--vz:var(--viz-books-accent, var(--accent))">' + active.map(function (bin) {
      return '<div><span>' + bin.count + '</span><i style="height:' + Math.round(bin.count / mx * 80) + 'px"></i><em>' + bin.label + '</em></div>';
    }).join('') + '</div>';
  }

  function bookDonut(parts, centerLabel) {
    var tot = parts.reduce(function (s, p) { return s + p[1]; }, 0), C = 2 * Math.PI * 70, off = 0, segs = '', leg = '';
    parts.forEach(function (p, idx) {
      if (!p[1]) return;
      var len = p[1] / tot * C;
      var pct = Math.round(p[1] / tot * 100);
      segs += '<circle data-bi="' + idx + '" data-bl="' + AppUtils.esc(p[0]) + '" data-bc="' + p[1] + '" data-bp="' + pct + '" cx="100" cy="100" r="70" fill="none" stroke="' + p[2] + '" stroke-width="28" stroke-dasharray="' + Math.max(len - 3, 1) + ' ' + C + '" stroke-dashoffset="' + (-off) + '" style="cursor:pointer;transition:opacity .15s"/>';
      off += len;
      leg += '<span class="dn-leg" data-bi="' + idx + '" data-bl="' + AppUtils.esc(p[0]) + '" data-bc="' + p[1] + '" data-bp="' + pct + '" style="cursor:pointer"><i style="background:' + p[2] + '"></i>' + AppUtils.esc(p[0]) + ' ' + p[1] + ' (' + pct + '%)</span>';
    });
    return '<div class="viz-card dn-wrap bk-dn-wrap"><div class="dn-box"><svg viewBox="0 0 200 200" class="dn-svg"><g transform="rotate(-90 100 100)">' + segs + '</g></svg><div class="dn-info"><b>' + tot + '</b><span>' + AppUtils.esc(centerLabel || 'books') + '</span></div></div><div class="dn-legend">' + leg + '</div></div>';
  }

  function renderBooksStats() {
    var box = document.getElementById('bk-stats');
    if (!box) return;
    var all = readBookInstances(), rd = all.filter(function (b) { return !b._reRead; });
    var Y = currentYear, M = currentMonth;
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
      return '<div class="bk-pr"><div><b>' + fmtNum(tot) + '</b><span>' + label + '</span></div><div><b>' + fmtNum(tot / days * 365.25) + '</b><span>per year</span></div><div><b>' + fmtNum(tot / days * 30.44) + '</b><span>per month</span></div><div><b>' + fmtNum(tot / days) + '</b><span>per day</span></div></div>';
    }

    var cs = getComputedStyle(document.documentElement);
    var vizAcc = (cs.getPropertyValue('--viz-books-accent') || '').trim() || (cs.getPropertyValue('--accent') || '').trim() || '#2ea87e';
    var vizSec = (cs.getPropertyValue('--viz-books-secondary') || '').trim() || '#7c8aa5';
    var acc = (cs.getPropertyValue('--accent') || '').trim() || '#c9a84c';
    var genreColors = [vizAcc, vizSec, acc, '#64748b', '#e09f3e', '#38bdf8', '#d97706', '#94a3b8'];

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
      (gk.length ? '<p class="section-title">Top genres</p>' + bookDonut(gk.map(function (g, i) {
        return [g, gc[g], genreColors[i % genreColors.length]];
      }), 'genre tags') : '') +
      '<div class="viz-pair bk-distribution"><div><p class="section-title">Ratings' + (rn ? '<span class="bk-badge bk-dist-average">Average ★ ' + (rs / rn).toFixed(2) + '</span>' : '') + '</p>' + (rn ? bookCols(rc, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) : '<p class="viz-empty">No rated books in this period.</p>') + '</div>' +
      '<div><p class="section-title">Page counts' + (pn ? '<span class="bk-badge bk-dist-average">Average ' + Math.round(ps / pn) + ' pages</span>' : '') + '</p>' + (pn ? bookCols(pb, ['100', '200', '300', '400', '500', '600', '1000', '1000+'], 'bk-pages') : '<p class="viz-empty">No page counts in this period.</p>') + '</div></div>' +
      (as.length ? '<p class="section-title">Most read authors</p><div class="viz-card">' + as.map(function (x) {
        var top = x.bs.slice().sort(function (p, q) { return (q.bookRating || 0) - (p.bookRating || 0); }).slice(0, window.innerWidth >= 900 ? 7 : 4);
        return '<div class="bk-au"><div class="bk-au-i"><p class="bk-serif">' + AppUtils.esc(x.n) + '</p><p class="text-sm text-muted">' + x.bs.length + ' read' + (x.r.length ? ' · ★ ' + x.avg.toFixed(1) + ' avg' : '') + '</p></div>' +
          '<div class="bk-au-c">' + top.map(function (b) { return '<div class="bk-mini">' + bookCov(b) + '</div>'; }).join('') + '</div><div class="bk-au-s">' + bookSpark(x.r, vizAcc) + '</div></div>';
      }).join('') + '</div>' : '');

    var dnWrap = box.querySelector('.bk-dn-wrap');
    if (dnWrap) {
      var info = dnWrap.querySelector('.dn-info'), idle = info.innerHTML;
      var slices = dnWrap.querySelectorAll('[data-bi]');
      function showSlice(idx) {
        var el = dnWrap.querySelector('circle[data-bi="' + idx + '"]');
        if (!el) return;
        info.innerHTML = '<b>' + el.dataset.bp + '%</b><span>' + AppUtils.esc(el.dataset.bl) + ' · ' + el.dataset.bc + '</span>';
        slices.forEach(function (node) { node.style.opacity = node.dataset.bi === idx ? '1' : '0.35'; });
      }
      function clearSlice() {
        info.innerHTML = idle;
        slices.forEach(function (node) { node.style.opacity = '1'; });
      }
      slices.forEach(function (node) {
        node.addEventListener('mouseenter', function () { showSlice(node.dataset.bi); });
        node.addEventListener('click', function () { showSlice(node.dataset.bi); });
        node.addEventListener('mouseleave', clearSlice);
      });
    }
  }

  function renderBooksWantStats() {
    var box = document.getElementById('bk-want-stats');
    if (!box) return;
    var want = (allBooks || []).filter(function (book) { return book.bookStatus === 'want'; });
    if (!want.length) {
      box.innerHTML = '<p class="bk-empty">Your To Read shelf is empty. Add books to start building your reading insights.</p>';
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

  function render() {
    if (statsTab === 'books') {
      document.getElementById('media-stats-strip').style.display = 'none';
      document.getElementById('games-stats-strip').style.display = 'none';
      document.getElementById('viz').style.display = 'none';
      document.getElementById('leaderboard-section').style.display = 'none';
      document.getElementById('top-picks-section').style.display = 'none';
      document.getElementById('deep-cuts-section').style.display = 'none';
      var bSec = document.getElementById('books-stats-section');
      if (bSec) bSec.style.display = 'block';
      renderBooksStats();
      renderBooksWantStats();
      updateWrappedPeriodOptions();
      updateWrappedCardState();
      if (wrappedRenderTab !== null && wrappedRenderTab !== statsTab &&
          document.getElementById('wrapped-card-result').classList.contains('has-card') &&
          !document.getElementById('btn-generate').disabled) {
        generateCurrentWrappedCard();
      }
      wrappedRenderTab = statsTab;
      updateGenLabel();
      return;
    }

    var bSecHide = document.getElementById('books-stats-section');
    if (bSecHide) bSecHide.style.display = 'none';
    document.getElementById('viz').style.display = '';

    var entries =
      getFilteredEntries();

    renderStats(entries);

    renderTopPicks(entries);

    

    renderDeepCuts(entries);

    var isGamesTab = statsTab === 'games';

    document.getElementById('media-stats-strip').style.display = isGamesTab ? 'none' : 'grid';
    document.getElementById('games-stats-strip').style.display = isGamesTab ? 'grid' : 'none';
    document.getElementById('top-picks-section').style.display = isGamesTab ? 'none' : 'block';
    document.getElementById('deep-cuts-section').style.display = 'block';
    document.getElementById('leaderboard-section').style.display = isGamesTab ? 'block' : 'none';

    if (isGamesTab) {
      renderGameStats(entries);
    }

    renderPlaytimeLeaderboard(entries);

    updateUIState(entries);

    window.currentStatsEntries = entries;
    renderViz(entries);
    updateWrappedPeriodOptions();
    updateWrappedCardState();
    if (wrappedRenderTab !== null && wrappedRenderTab !== statsTab &&
        document.getElementById('wrapped-card-result').classList.contains('has-card') &&
        !document.getElementById('btn-generate').disabled) {
      generateCurrentWrappedCard();
    }
    wrappedRenderTab = statsTab;
    updateGenLabel();

  }
  var actYear = new Date().getFullYear();

  function actSvg(year, w) {
    var isG = statsTab === 'games';
    var mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var cnt = [0,0,0,0,0,0,0,0,0,0,0,0], mx = 1;
    allEntries.forEach(function (e) {
      if ((e.type === 'game') !== isG || e.yearWatched != year || !e.monthWatched) return;
      cnt[e.monthWatched - 1]++;
    });
    cnt.forEach(function (c) { if (c > mx) mx = c; });
    var H = 190, pl = 14, pr = 14, pt = 24, pb = 30, pw = w - pl - pr, ph = H - pt - pb;
    var X = function (i) { return pl + i * pw / 11; };
    var Y = function (c) { return pt + ph - c / mx * ph; };
    var pts = cnt.map(function (c, i) { return X(i).toFixed(1) + ',' + Y(c).toFixed(1); }).join(' ');
    var s = '<svg width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + ' ' + H + '">';
    [0, 1].forEach(function (f) {
      var y = pt + ph - f * ph;
      s += '<line x1="' + pl + '" x2="' + (w - pr) + '" y1="' + y + '" y2="' + y + '" style="stroke:var(--bg-card-2)"/>' +
        '';
    });
    s += '<polygon points="' + X(0) + ',' + (pt + ph) + ' ' + pts + ' ' + X(11) + ',' + (pt + ph) + '" style="fill:var(--vz);fill-opacity:.15"/>' +
      '<polyline points="' + pts + '" fill="none" stroke-width="2.5" stroke-linejoin="round" style="stroke:var(--vz)"/>';
    cnt.forEach(function (c, i) {
      s += '<circle cx="' + X(i) + '" cy="' + Y(c) + '" r="' + (c ? 4 : 2.5) + '" style="fill:var(--vz)"><title>' + mon[i] + ' ' + year + ': ' + c + '</title></circle>';
      if (c) s += '<text x="' + X(i) + '" y="' + (Y(c) - 9) + '" text-anchor="middle" font-size="11" style="fill:var(--text-primary)">' + c + '</text>';
      s += '<text x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" style="fill:var(--text-muted)">' + (w > 520 ? mon[i] : mon[i][0]) + '</text>';
    });
    return s + '</svg>';
  }

  function bindAct(root) {
    var box = root.querySelector('#act-chart');
    if (!box) return;
    root.querySelectorAll('.act-y').forEach(function (b) {
      b.addEventListener('click', function () {
        actYear = Number(b.dataset.y);
        root.querySelectorAll('.act-y').forEach(function (x) { x.classList.toggle('selected', x === b); });
        box.innerHTML = actSvg(actYear, box.clientWidth || 300);
      });
    });
  }

  var donutData = [];
  window.addEventListener('resize', AppUtils.debounce(function () {
    var b = document.getElementById('act-chart');
    if (b && b.clientWidth) b.innerHTML = actSvg(actYear, b.clientWidth);
  }, 150));

  function genreDonut(gk, gc, entries, isG, cls) {
    var activeTheme = document.documentElement.getAttribute('data-visual-theme') || localStorage.getItem('pl-visual-theme') || 'library';
    var pal;
    if (activeTheme === 'winter') {
      pal = isG
        ? ['#34d399', '#38bdf8', '#818cf8', '#a78bfa', '#f472b6']
        : ['#38bdf8', '#818cf8', '#34d399', '#60a5fa', '#a78bfa'];
    } else if (activeTheme === 'wizarding') {
      pal = isG
        ? ['#c084fc', '#e5b958', '#f43f5e', '#38bdf8', '#fb923c']
        : ['#e5b958', '#f87171', '#c084fc', '#fb923c', '#fbbf24'];
    } else if (activeTheme === 'kyoto') {
      pal = isG
        ? ['#7ea6b8', '#84b89a', '#c9a97a', '#64748b', '#5d8ea3']
        : ['#84b89a', '#7ea6b8', '#c9a97a', '#5a8f73', '#9db3a5'];
    } else if (activeTheme === 'sakura') {
      pal = isG
        ? ['#b99ad9', '#e89eb3', '#e5b996', '#8b69b5', '#c97b96']
        : ['#e89eb3', '#b99ad9', '#e5b996', '#cb6d8c', '#d1a7b8'];
    } else if (activeTheme === 'herbarium') {
      pal = isG
        ? ['#a68cb5', '#8ca87a', '#cc8666', '#846894', '#b8a98a']
        : ['#8ca87a', '#cc8666', '#a68cb5', '#698758', '#a89b7e'];
    } else if (activeTheme === 'classic' || activeTheme === 'glass') {
      pal = isG
        ? ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ec4899']
        : ['#c9a84c', '#e07a5f', '#81b29a', '#5aa9e6', '#b388eb'];
    } else {
      pal = isG
        ? ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ec4899']
        : ['#d4af37', '#e07a5f', '#81b29a', '#5aa9e6', '#b388eb'];
    }
    var total = 0;
    gk.forEach(function (g) { total += gc[g]; });
    var C = 2 * Math.PI * 70, off = 0, segs = '', leg = '';
    donutData = gk.map(function (g) {
      var rs = 0, rn = 0, t = 0;
      entries.forEach(function (e) {
        if ((e.genres || []).indexOf(g) < 0) return;
        var r = isG ? e.gameRating : e.rating;
        if (r) { rs += r; rn++; }
        t += isG ? (e.playtime || 0) * 60 : (e.runtime || 0);
      });
      return {
        g: g, n: gc[g], unit: isG ? 'games' : 'titles',
        pct: Math.round(gc[g] / entries.length * 100),
        avg: rn ? (rs / rn).toFixed(1) + (isG ? '/10' : '/5') : '—',
        time: AppUtils.formatHours(t)
      };
    });
    gk.forEach(function (g, i) {
      var len = gc[g] / total * C;
      segs += '<circle class="dn-seg" data-i="' + i + '" cx="100" cy="100" r="70" fill="none" stroke="' + pal[i] +
        '" stroke-width="28" stroke-dasharray="' + Math.max(len - 3, 1) + ' ' + C + '" stroke-dashoffset="' + (-off) + '"/>';
      off += len;
      leg += '<span class="dn-leg" data-i="' + i + '"><i style="background:' + pal[i] + '"></i>' + AppUtils.esc(g) + '</span>';
    });
    return '<p class="section-title">Top Genres</p><div class="viz-card dn-wrap ' + cls + '">' +
      '<div class="dn-box"><svg viewBox="0 0 200 200" class="dn-svg"><g transform="rotate(-90 100 100)">' + segs + '</g></svg>' +
      '<div class="dn-info"><b>' + gk.length + '</b><span>Top genres</span></div></div>' +
      '<div class="dn-legend">' + leg + '</div></div>';
  }

  function bindDonut(root) {
    var box = root.querySelector('.dn-wrap');
    if (!box) return;
    var info = box.querySelector('.dn-info');
    var idle = info.innerHTML;
    function show(i) {
      var d = donutData[i];
      box.classList.add('dn-active');
      box.querySelectorAll('[data-i]').forEach(function (n) { n.classList.toggle('on', n.dataset.i == i); });
      info.innerHTML = '<b>' + AppUtils.esc(d.g) + '</b><span>' + d.n + ' ' + d.unit + ' · ' + d.pct + '%</span><span>Avg ' + d.avg + '</span><span>' + d.time + '</span>';
    }
    function hide() {
      box.classList.remove('dn-active');
      box.querySelectorAll('.on').forEach(function (n) { n.classList.remove('on'); });
      info.innerHTML = idle;
    }
    box.querySelectorAll('[data-i]').forEach(function (n) {
      n.addEventListener('mouseenter', function () { show(n.dataset.i); });
      n.addEventListener('click', function () { show(n.dataset.i); });
      n.addEventListener('mouseleave', hide);
    });
  }

  function renderViz(entries) {
    var el = document.getElementById('viz');
    if (!el) return;
    var isG = statsTab === 'games';
    var cls = isG ? 'viz-g' : 'viz-m';
    var mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var v = function (e) { return isG ? (e.playtime || 0) : (e.runtime || 0); };
    var mins = 0, rs = 0, rn = 0, longest = null, mc = {}, gc = {};
    entries.forEach(function (e) {
      mins += isG ? (e.playtime || 0) * 60 : (e.runtime || 0);
      var r = isG ? e.gameRating : e.rating;
      if (r) { rs += r; rn++; }
      if (!longest || v(e) > v(longest)) longest = e;
      if (e.monthWatched) mc[e.monthWatched] = (mc[e.monthWatched] || 0) + 1;
      (e.genres || []).forEach(function (g) { gc[g] = (gc[g] || 0) + 1; });
    });
    var box = function (val, l) { return '<div><b>' + val + '</b><span>' + l + '</span></div>'; };
    var html = '<div class="viz-hero ' + cls + '">' +
      box(entries.length, isG ? 'Games' : 'Titles') +
      box(AppUtils.formatHours(mins), isG ? 'Played' : 'Watched') +
      box(rn ? (rs / rn).toFixed(1) : '—', 'Avg Rating') + '</div>';

    var chips = [];
    if (longest && v(longest)) chips.push((isG ? 'Longest session: ' : 'Longest watch: ') + longest.title);
    var topM = Object.keys(mc).sort(function (a, b) { return mc[b] - mc[a]; })[0];
    if (topM) chips.push('Most active month: ' + mon[topM - 1]);
    html += '<div class="viz-chips">' + chips.map(function (c) { return '<span>' + AppUtils.esc(c) + '</span>'; }).join('') + '</div>';

    // Heatmap (ignores year/month filter, tab only)
    var hm = {}, ys = {}, max = 1;
    allEntries.forEach(function (e) {
      if ((e.type === 'game') !== isG || !e.yearWatched || !e.monthWatched) return;
      var k = e.yearWatched + '-' + e.monthWatched;
      hm[k] = (hm[k] || 0) + 1;
      ys[e.yearWatched] = 1;
      if (hm[k] > max) max = hm[k];
    });
    var years = Object.keys(ys).sort(function (a, b) { return b - a; });
    if (false) {
      html += '<p class="section-title">Activity</p><div class="viz-card viz-scroll ' + cls + '"><div class="viz-heat"><i></i>' +
        mon.map(function (m) { return '<em>' + m[0] + '</em>'; }).join('');
      years.forEach(function (y) {
        html += '<em>' + y + '</em>';
        for (var m = 1; m <= 12; m++) {
          var c = hm[y + '-' + m] || 0;
          html += '<span title="' + mon[m - 1] + ' ' + y + ': ' + c + '" style="background:' +
            (c ? 'color-mix(in srgb,var(--vz) ' + Math.round(20 + 80 * c / max) + '%,transparent)' : 'var(--bg-card-2)') + '">' + (c || '') + '</span>';
        }
      });
      html += '</div></div>';
    }

    var acy = new Date().getFullYear(), ayl = years.slice();
    if (ayl.indexOf(String(acy)) < 0) ayl.push(String(acy));
    if (ayl.indexOf(String(actYear)) < 0) actYear = acy;
    ayl.sort(function (a, b) { return b - a; });
    html += '<p class="section-title">Activity</p><div class="viz-card ' + cls + '"><div class="act-years">' +
      ayl.map(function (y) { return '<button class="chip act-y' + (y == actYear ? ' selected' : '') + '" data-y="' + y + '">' + y + '</button>'; }).join('') +
      '</div><div id="act-chart">' + actSvg(actYear, Math.max(280, el.clientWidth - 32)) + '</div></div>';

    var th = entries.filter(function (e) { return e.type === 'movie' && e.theatre; });
    if (!isG && th.length) {
      var ty = {}, thMin = 0, mvAll = entries.filter(function (e) { return e.type === 'movie'; }).length;
      var yrs = {}; th.forEach(function (e) { yrs[e.yearWatched] = 1; });
      var byMon = Object.keys(yrs).length <= 1;
      th.forEach(function (e) { var y = byMon ? e.monthWatched : (e.yearWatched || '—'); ty[y] = (ty[y] || 0) + 1; thMin += e.runtime || 0; });
      var tk = Object.keys(ty).sort(function (a, b) { return a - b; });
      html += '<p class="section-title">In Theatres</p>' +
        '<div class="tk"><div class="tk-main"><b>' + th.length + '</b><span>on the big screen</span></div>' +
        '<div class="tk-side"><div><b>' + Math.round(th.length / (mvAll || 1) * 100) + '%</b><span>of your movies</span></div><div><b>' + AppUtils.formatHours(thMin) + '</b><span>in theatres</span></div></div></div>' +
        '<div class="fs"><div class="fs-row">' + tk.map(function (k) { return '<div class="fs-f"><b>' + ty[k] + '</b><span>' + (byMon ? mon[k - 1] : k) + '</span></div>'; }).join('') + '</div></div>';
    }

    // Rating distribution
    var n = isG ? 10 : 5, rc = [], em = ['😭','🙁','😐','😊','🤩'];
    for (var i = 0; i < n; i++) rc.push(0);
    entries.forEach(function (e) { var r = isG ? e.gameRating : e.rating; if (r >= 1 && r <= n) rc[r - 1]++; });
    var rmax = Math.max.apply(null, rc.concat(1));
    if (isG) html += '<p class="section-title">Ratings</p><div class="viz-card ' + cls + '">' + rc.map(function (c, i) { return c ? '<div class="viz-row"><span style="width:24px">' + (i + 1) + '</span><div><i style="width:' + Math.round(c / rmax * 100) + '%"></i></div><b>' + c + '</b></div>' : ''; }).reverse().join('') + '</div>';
    else html += '<p class="section-title">Ratings</p><div class="viz-card viz-cols ' + cls + '">' +
      rc.map(function (c, i) {
        return '<div><span>' + c + '</span><i style="height:' + Math.round(c / rmax * 80) + 'px"></i><em>' + (isG ? i + 1 : em[i]) + '</em></div>';
      }).join('') + '</div>';

    // Top genres
    var gk = Object.keys(gc).sort(function (a, b) { return gc[b] - gc[a]; }).slice(0, 5);
    html += '<div class="viz-pair">';
    if (gk.length) { html += '<div>' + genreDonut(gk, gc, entries, isG, cls) + '</div>'; }
    if (false) {
      html += '<p class="section-title">Top Genres</p><div class="viz-card ' + cls + '">' +
        gk.map(function (g) {
          return '<div class="viz-row"><span>' + g + '</span><div><i style="width:' + Math.round(gc[g] / gc[gk[0]] * 100) + '%"></i></div><b>' + gc[g] + '</b></div>';
        }).join('') + '</div>';
    }

    // Split bar
    var cnt = function (f) { return entries.filter(f).length; };
    var activeTheme = document.documentElement.getAttribute('data-visual-theme') || localStorage.getItem('pl-visual-theme') || 'library';
    var movieCol = '#c9a84c', seriesCol = '#8a7434';
    if (activeTheme === 'winter') {
      movieCol = '#38bdf8'; seriesCol = '#0284c7';
    } else if (activeTheme === 'wizarding') {
      movieCol = '#e5b958'; seriesCol = '#b45309';
    } else if (activeTheme === 'kyoto') {
      movieCol = '#84b89a'; seriesCol = '#476e5a';
    } else if (activeTheme === 'sakura') {
      movieCol = '#e89eb3'; seriesCol = '#9c4b68';
    } else if (activeTheme === 'herbarium') {
      movieCol = '#8ca87a'; seriesCol = '#536946';
    } else if (activeTheme === 'library') {
      movieCol = '#d4af37'; seriesCol = '#854d0e';
    }

    var parts = isG
      ? [['Completed', 'completed', '#22c55e'], ['Playing', 'playing', '#f59e0b'], ['Dropped', 'dropped', '#ef4444'], ['Wishlist', 'wishlist', '#6366f1']]
          .map(function (p) { return [p[0], p[1] === 'wishlist' ? allEntries.filter(function (e) { return e.type === 'game' && e.completionStatus === 'wishlist'; }).length : cnt(function (e) { return e.completionStatus === p[1]; }), p[2]]; })
      : [['Movies', cnt(function (e) { return e.type === 'movie'; }), movieCol], ['Series', cnt(function (e) { return e.type === 'series'; }), seriesCol]];
    if (entries.length) {
      html += '<div><p class="section-title">' + (isG ? 'Status' : 'Movies vs Series') + '</p><div class="viz-card"><div class="viz-split">' +
        parts.map(function (p) { return p[1] ? '<i style="flex:' + p[1] + ';background:' + p[2] + '"></i>' : ''; }).join('') +
        '</div><div class="viz-legend">' +
        parts.map(function (p) { return '<span><i style="background:' + p[2] + '"></i>' + p[0] + ' ' + p[1] + '</span>'; }).join('') +
        '</div></div></div>';
    }
    html += '</div>';
    el.innerHTML = html;
    bindAct(el);
    bindDonut(el);
  }

  function renderGameStats(entries) {

    document.querySelector('#g-total .stat-number').textContent = entries.length;

    var totalMinutes = entries.reduce(function (sum, e) { return sum + (e.playtime || 0) * 60; }, 0);
    document.querySelector('#g-hours .stat-number').textContent = AppUtils.formatHours(totalMinutes);

    document.querySelector('#g-completed .stat-number').textContent =
      entries.filter(function (e) { return e.completionStatus === 'completed'; }).length;

    document.querySelector('#g-playing .stat-number').textContent =
      entries.filter(function (e) { return e.completionStatus === 'playing'; }).length;

    document.querySelector('#g-dropped .stat-number').textContent =
      entries.filter(function (e) { return e.completionStatus === 'dropped'; }).length;

    document.querySelector('#g-wishlist .stat-number').textContent =
      allEntries.filter(function (e) { return e.type === 'game' && e.completionStatus === 'wishlist'; }).length;

    var genreMap = {};
    entries.forEach(function (e) {
      (e.genres || []).forEach(function (g) { genreMap[g] = (genreMap[g] || 0) + 1; });
      if (e.category) genreMap[e.category] = (genreMap[e.category] || 0) + 1;
    });
    var topGenre = Object.keys(genreMap).sort(function (a, b) { return genreMap[b] - genreMap[a]; })[0] || '—';
    document.querySelector('#g-genre .stat-number').textContent = topGenre;

    var rated = entries.filter(function (e) { return e.gameRating; });
    var avgRating = rated.length
      ? (rated.reduce(function (sum, e) { return sum + e.gameRating; }, 0) / rated.length)
      : 0;
    document.querySelector('#g-rating .stat-number').textContent = avgRating ? avgRating.toFixed(1) : '—';

    var monthMap = {};
    entries.forEach(function (e) {
      if (e.monthWatched) monthMap[e.monthWatched] = (monthMap[e.monthWatched] || 0) + 1;
    });
    var activeMonth = Object.keys(monthMap).sort(function (a, b) { return monthMap[b] - monthMap[a]; })[0];
    document.querySelector('#g-month .stat-number').textContent = activeMonth ? AppUtils.monthShort(Number(activeMonth)) : '—';

    var longest = null;
    entries.forEach(function (e) {
      if (!longest || (e.playtime || 0) > (longest.playtime || 0)) longest = e;
    });
    document.querySelector('#g-longest .stat-number').textContent =
      (longest && longest.playtime) ? longest.title + ' (' + longest.playtime + 'h)' : '—';

  }

  function renderStats(entries) {

    // TOTAL TITLES

    document.querySelector(
      '#s-titles .stat-number'
    ).textContent =
      entries.length;

    // HOURS WATCHED

    var totalMinutes =
      entries.reduce(function (sum, entry) {

        return sum + (entry.runtime || 0);

      }, 0);

    document.querySelector(
      '#s-hours .stat-number'
    ).textContent =
      AppUtils.formatHours(totalMinutes);

    // MOVIES

    var movieCount =
      entries.filter(function (entry) {

        return entry.type === 'movie';

      }).length;

    document.querySelector(
      '#s-movies .stat-number'
    ).textContent =
      movieCount;

    // SERIES

    var seriesCount =
      entries.filter(function (entry) {

        return entry.type === 'series';

      }).length;

    document.querySelector(
      '#s-series .stat-number'
    ).textContent =
      seriesCount;

    // TOP GENRE

    var genreMap = {};

    entries.forEach(function (entry) {

      (entry.genres || [])
        .forEach(function (genre) {

          genreMap[genre] =
            (genreMap[genre] || 0) + 1;

        });

    });

    var topGenre = '—';

    var topGenreCount = 0;

    Object.keys(genreMap)
      .forEach(function (genre) {

        if (genreMap[genre] > topGenreCount) {

          topGenre =
            genre;

          topGenreCount =
            genreMap[genre];

        }

      });

    document.querySelector(
      '#s-genre .stat-number'
    ).textContent =
      topGenre;

    // AVG RATING

    var avgRating = 0;

    if (entries.length > 0) {

      avgRating =
        entries.reduce(function (sum, entry) {

          return sum + (entry.rating || 0);

        }, 0) / entries.length;

    }

    document.querySelector(
      '#s-rating .stat-number'
    ).textContent =
      avgRating
        ? avgRating.toFixed(1) + ' ⭐'
        : '—';

    // MOST ACTIVE MONTH

    var monthMap = {};

    entries.forEach(function (entry) {

      var month =
        entry.monthWatched;

      if (!month) return;

      monthMap[month] =
        (monthMap[month] || 0) + 1;

    });

    var activeMonth = '—';

    var activeCount = 0;

    Object.keys(monthMap)
      .forEach(function (month) {

        if (
          monthMap[month] > activeCount
        ) {

          activeCount =
            monthMap[month];

          activeMonth =
            AppUtils.monthShort(
              Number(month)
            );

        }

      });

    document.querySelector(
      '#s-month .stat-number'
    ).textContent =
      activeMonth;

    // LONGEST WATCH

    var longest = null;

    entries.forEach(function (entry) {

      if (
        !longest
        || (entry.runtime || 0)
        > (longest.runtime || 0)
      ) {

        longest = entry;

      }

    });

    document.querySelector(
      '#s-longest .stat-number'
    ).textContent =
      longest
        ? longest.title
        : '—';

    // BEST MONTH (HIGHEST AVG RATING)

    var monthRatings = {};

    entries.forEach(function (entry) {

      var month = entry.monthWatched;

      if (!month) return;

      if (!monthRatings[month]) {
        monthRatings[month] = [];
      }

      monthRatings[month].push(
        entry.rating || 0
      );

    });

    var bestMonth = '—';

    var bestAvg = 0;

    Object.keys(monthRatings)
      .forEach(function (month) {

        var ratings =
          monthRatings[month];

        var avg =
          ratings.reduce(
            function (sum, r) {
              return sum + r;
            }, 0
          ) / ratings.length;

        if (avg > bestAvg) {

          bestAvg = avg;

          bestMonth =
            AppUtils.monthShort(
              Number(month)
            ) + ' ' +
            AppUtils.ratingToEmoji(
              Math.round(avg)
            );

        }

      });

    document.querySelector(
      '#s-best-month .stat-number'
    ).textContent =
      bestMonth;

    // TOTAL TITLES THIS YEAR

    var totalTitlesBox =
      document.getElementById(
        's-total-titles'
      );

    if (currentMonth === 0) {

      totalTitlesBox.style.display =
        'block';

      document.querySelector(
        '#s-total-titles .stat-number'
      ).textContent =
        entries.length;

    } else {

      totalTitlesBox.style.display =
        'none';

    }

    // COMPLETION RATE

    var monthsWithEntries = {};

    entries.forEach(function (entry) {

      var month = entry.monthWatched;

      if (month) {
        monthsWithEntries[(entry.yearWatched || 0) * 12 + month] = true;
      }

    });

    var completionMonths =
      Object.keys(monthsWithEntries)
        .length;

    var completionPercent =
      Math.round(
        (completionMonths / 12) * 100
      );

    document.querySelector(
      '#s-completion-rate .stat-number'
    ).textContent =
      completionMonths + (currentYear === 'all' ? '' : '/12');
      

  }

  function updateUIState(entries) {

    // MOST ACTIVE MONTH VISIBILITY

    var monthBox =
      document.getElementById('s-month');

    if (currentMonth === 0) {

      monthBox.style.display = 'block';

    } else {

      monthBox.style.display = 'none';

    }

  }
  function renderTopPicks(entries) {

    var container =
      document.getElementById(
        'top-picks'
      );

    container.innerHTML = '';

    var topRated =
      entries.filter(function (entry) {

        return entry.rating === 5;

      }).slice(0, window.innerWidth >= 900 ? 7 : 4);

    if (topRated.length === 0) {

      container.innerHTML =
        '<p class="text-muted">No 🤩 ratings in this period.</p>';

      return;

    }

    topRated.forEach(function (entry) {

      var card =
        document.createElement('div');

      card.className =
        'poster-card';

      card.innerHTML = (

        '<img ' +
        'class="poster-img" ' +
        'src="' +
        AppUtils.getPosterUrl(entry.poster) +
        '">' +

        '<span class="badge badge-tl">' +
        AppUtils.ratingToEmoji(entry.rating) +
        '</span>' +

        '<div class="poster-overlay">' +

        '<div class="poster-title">' +
        AppUtils.esc(entry.title) +
        '</div>' +

        '<div class="poster-sub">' +
        entry.yearWatched +
        '</div>' +

        '</div>'

      );

      container.appendChild(card);

    });

  }
  function renderFunFacts(entries) {

    var container =
      document.getElementById(
        'fun-facts'
      );

    container.innerHTML = '';

    if (entries.length === 0) {

      container.innerHTML =
        '<p class="text-muted">No data yet.</p>';

      return;

    }

    var isGamesFacts = statsTab === 'games';

    var totalMinutes =
      entries.reduce(function (sum, entry) {

        return sum + (isGamesFacts ? (entry.playtime || 0) * 60 : (entry.runtime || 0));

      }, 0);

    var ratedEntries = isGamesFacts
      ? entries.filter(function (e) { return e.gameRating; })
      : entries;

    var avgRating =
      ratedEntries.length
        ? ratedEntries.reduce(function (sum, entry) {
          return sum + (isGamesFacts ? entry.gameRating : (entry.rating || 0));
        }, 0) / ratedEntries.length
        : 0;

    var highestRated =
      entries.filter(function (entry) {

        return isGamesFacts ? entry.gameRating >= 9 : entry.rating === 5;

      }).length;

    var facts = isGamesFacts ? [

      ' You played for '
      + AppUtils.formatHours(totalMinutes),

      '⭐ Your average game rating is '
      + avgRating.toFixed(1) + '/10',

      '🏆 You gave '
      + highestRated
      + ' game'
      + (highestRated !== 1 ? 's' : '')
      + ' a 9+ score',

      ' You logged '
      + entries.length
      + ' total games'

    ] : [

      '🕐 You watched for '
      + AppUtils.formatHours(
        totalMinutes
      ),

      '⭐ Your average rating is '
      + avgRating.toFixed(1),

      '🤩 You gave '
      + highestRated
      + ' title'
      + (highestRated !== 1 ? 's' : '')
      + ' a perfect score',

      '🎬 You logged '
      + entries.length
      + ' total titles'

    ];

    facts.forEach(function (fact) {

      var box =
        document.createElement('div');

      box.className =
        'fun-fact-box';

      box.style.marginBottom =
        '12px';

      box.textContent =
        fact;

      container.appendChild(box);

    });

  }
  function renderPlaytimeLeaderboard(entries) {
    var wrap = document.getElementById('playtime-leaderboard');
    if (!wrap) return;

    var games = entries
      .filter(function (e) { return e.type === 'game' && e.playtime > 0; })
      .sort(function (a, b) { return b.playtime - a.playtime; })
      .slice(0, 5);

    if (games.length === 0) {
      wrap.innerHTML = '<p class="text-sm text-muted">No tracked playtime yet.</p>';
      return;
    }

    var medals = ['🥇', '🥈', '🥉'];
    var maxHours = games[0].playtime;
    wrap.innerHTML = games.map(function (g, i) {
      var pct = Math.max(8, Math.round((g.playtime / maxHours) * 100));
      var rankLabel = '#' + (i + 1);
      return (
        '<div class="leaderboard-row' + (i === 0 ? ' leaderboard-row-top' : '') + '">' +
        '<div class="leaderboard-rank">' + rankLabel + '</div>' +
        '<div class="leaderboard-info">' +
        '<div class="leaderboard-title">' + AppUtils.esc(g.title) + '</div>' +
        '<div class="leaderboard-bar-track"><div class="leaderboard-bar-fill" style="width:' + pct + '%"></div></div>' +
        '</div>' +
        '<div class="leaderboard-hours">' + g.playtime + 'h</div>' +
        '</div>'
      );
    }).join('');
  }
  function renderDeepCuts(entries) {

    var container =
      document.getElementById(
        'deep-cuts'
      );

    container.innerHTML = '';

    if (entries.length < 3) {

      container.innerHTML =
        '<p class="text-muted">Add more entries for insights.</p>';

      return;

    }

    var deepCuts = [];

    if (statsTab === 'games') {
      var completedGames = entries.filter(function (e) { return e.completionStatus === 'completed'; });
      var totalHours = entries.reduce(function (sum, e) { return sum + (Number(e.playtime) || 0); }, 0);
      var ratedGames = entries.filter(function (e) { return Number(e.gameRating); });
      var avgGameRating = ratedGames.length ? (ratedGames.reduce(function (s, e) { return s + Number(e.gameRating); }, 0) / ratedGames.length) : 0;
      var topGame = ratedGames.slice().sort(function (a, b) { return (Number(b.gameRating) || 0) - (Number(a.gameRating) || 0); })[0];

      if (totalHours > 0) {
        deepCuts.push('⏱️ You\'ve invested ' + Math.round(totalHours) + ' total hours in games (' + (totalHours / 24).toFixed(1) + ' full days of play)');
      }
      if (completedGames.length > 0) {
        var avgCompletedHours = totalHours / completedGames.length;
        deepCuts.push('🏆 Average completed title took ~' + Math.round(avgCompletedHours) + ' hours');
      }
      if (topGame) {
        deepCuts.push('💎 Your highest-rated masterpiece: ' + topGame.title + ' (' + topGame.gameRating + '/10)');
      }
      if (avgGameRating >= 8.5) {
        deepCuts.push('🌟 High standards — your average game score is ' + avgGameRating.toFixed(1) + ' / 10');
      } else if (avgGameRating > 0 && avgGameRating < 7) {
        deepCuts.push('🎯 Tough critic — average game score ' + avgGameRating.toFixed(1) + ' / 10');
      }
      if (completedGames.length && entries.length) {
        var compRate = Math.round((completedGames.length / entries.length) * 100);
        deepCuts.push('🎮 Library completion rate: ' + compRate + '% (' + completedGames.length + ' of ' + entries.length + ')');
      }
    } else {

    var sortedByMonth = entries.slice()
      .sort(function (a, b) {
        return a.monthWatched - b.monthWatched;
      });

    var months = {};

    sortedByMonth.forEach(function (e) {
      if (e.monthWatched) {
        months[(e.yearWatched || 0) * 12 + e.monthWatched] = true;
      }
    });

    var sortedMonths =
      Object.keys(months)
        .map(Number)
        .sort(function (a, b) {
          return a - b;
        });

    var maxStreak = 1;

    var currentStreak = 1;

    for (
      var i = 1;
      i < sortedMonths.length;
      i++
    ) {

      if (
        sortedMonths[i] ===
        sortedMonths[i - 1] + 1
      ) {

        currentStreak++;

        if (currentStreak > maxStreak) {
          maxStreak = currentStreak;
        }

      } else {

        currentStreak = 1;

      }

    }

    if (maxStreak >= 2) {

      deepCuts.push(
        '🔥 Your longest watch streak was ' +
        maxStreak +
        ' months in a row'
      );

    }

    // MOST PRODUCTIVE MONTH

    var monthCounts = {};

    entries.forEach(function (entry) {

      var month = entry.monthWatched;

      if (month) {
        monthCounts[month] =
          (monthCounts[month] || 0) + 1;
      }

    });

    var maxMonth = 0;

    var maxCount = 0;

    Object.keys(monthCounts)
      .forEach(function (m) {

        if (monthCounts[m] > maxCount) {

          maxCount = monthCounts[m];

          maxMonth = Number(m);

        }

      });

    if (maxMonth > 0) {

      deepCuts.push(
        '📊 Your most productive month was ' +
        AppUtils.monthName(maxMonth) +
        ' — you logged ' +
        maxCount +
        ' title' +
        (maxCount !== 1 ? 's' : '')
      );

    }

    // SERIES VS MOVIES

    var movieCnt =
      entries.filter(function (e) {
        return e.type === 'movie';
      }).length;

    var seriesCnt =
      entries.filter(function (e) {
        return e.type === 'series';
      }).length;

    if (seriesCnt > movieCnt) {

      deepCuts.push(
        '📺 You watched more series than movies'
      );

    } else if (movieCnt > seriesCnt) {

      deepCuts.push(
        '🎬 You\'re a movie person'
      );

    }

    // RATING ASSESSMENT

    var avgRating =
      entries.reduce(
        function (sum, entry) {
          return sum + (entry.rating || 0);
        }, 0
      ) / entries.length;

    if (avgRating >= 4) {

      deepCuts.push(
        '😊 You\'re generous — avg ' +
        avgRating.toFixed(1) +
        ' out of 5'
      );

    } else if (avgRating < 3) {

      deepCuts.push(
        '🤨 You\'re a tough critic — avg ' +
        avgRating.toFixed(1) +
        ' out of 5'
      );

    }

    // BACK-TO-BACK WATCH TIME

    var totalMinutes =
      entries.reduce(function (sum, e) {
        return sum + (e.runtime || 0);
      }, 0);

    var totalDays =
      totalMinutes / 60 / 24;

    if (totalDays >= 1) {

      deepCuts.push(
        '⏱️ If you watched back-to-back, you\'d finish in ' +
        totalDays.toFixed(1) +
        ' days'
      );

    }

    var thE = entries.filter(function (e) { return e.type === 'movie' && e.theatre; });
    if (thE.length) {
      var thMn = thE.reduce(function (s, e) { return s + (e.runtime || 0); }, 0);
      var mvN = entries.filter(function (e) { return e.type === 'movie'; }).length || 1;
      deepCuts.push('🎟️ ' + thE.length + ' movie' + (thE.length > 1 ? 's' : '') + ' in theatres, ' + Math.round(thE.length / mvN * 100) + '% of your movies and ' + AppUtils.formatHours(thMn) + ' on the big screen');
      var thBest = thE.filter(function (e) { return e.rating; }).sort(function (a, b) { return b.rating - a.rating; })[0];
      if (thBest) deepCuts.push('🍿 Your best theatre night: ' + thBest.title);
    }
    }

    deepCuts.forEach(function (cut) {

      var box =
        document.createElement('div');

      box.className =
        'fun-fact-box';

      box.style.marginBottom =
        '12px';

      box.textContent =
        cut;

      container.appendChild(box);

    });

  }

  setupWrappedCard();

  function getWrappedEntries() {
    if (statsTab === 'books') {
      return readBookInstances().filter(function (b) {
        if (b._reRead) return false;
        var yearMatch = wrappedYear === 'all' || Number(b.finishYear) === Number(wrappedYear);
        var monthMatch = wrappedMonth === 0 || Number(b.finishMonth) === wrappedMonth;
        return yearMatch && monthMatch;
      });
    }
    return allEntries.filter(function (entry) {
      var typeMatch = statsTab === 'games' ? entry.type === 'game' : (entry.type !== 'game' && entry.type !== 'book');
      var yearMatch = wrappedYear === 'all' || Number(entry.yearWatched) === Number(wrappedYear);
      var monthMatch = wrappedMonth === 0 || Number(entry.monthWatched) === wrappedMonth;
      return typeMatch && yearMatch && monthMatch && entry.completionStatus !== 'wishlist';
    });
  }

  function updateWrappedPeriodOptions() {
    var yearSelect = document.getElementById('wrapped-year');
    var monthSelect = document.getElementById('wrapped-month');
    var years = {};
    if (statsTab === 'books') {
      readBookInstances().forEach(function (b) {
        if (b.finishYear) years[b.finishYear] = true;
      });
    } else {
      allEntries.forEach(function (entry) {
        if (entry.type === 'book') return;
        var matchesTab = statsTab === 'games' ? entry.type === 'game' : entry.type !== 'game';
        if (matchesTab && entry.yearWatched) years[entry.yearWatched] = true;
      });
    }

    if (wrappedYear === null) {
      wrappedYear = years[currentYear] ? String(currentYear) : 'all';
      wrappedMonth = currentMonth;
    } else if (wrappedYear !== 'all' && !years[wrappedYear]) {
      wrappedYear = 'all';
    }

    yearSelect.innerHTML = '<option value="all">All years</option>' +
      Object.keys(years).sort(function (a, b) { return b - a; })
        .map(function (year) { return '<option value="' + year + '">' + year + '</option>'; }).join('');
    yearSelect.value = wrappedYear;
    monthSelect.value = String(wrappedMonth);
  }

  function updateWrappedCardState() {
    var button = document.getElementById('btn-generate');
    var message = document.getElementById('wrapped-card-message');
    var entries = getWrappedEntries();
    button.disabled = entries.length === 0;
    button.style.opacity = entries.length ? '1' : '0.5';
    if (entries.length) {
      message.style.display = 'none';
      return;
    }
    message.textContent = 'No entries in this period. Try a different year or month.';
    message.style.display = 'block';
    wrappedShareToken++;
    document.getElementById('canvas-wrap').style.display = 'none';
    document.getElementById('canvas-wrap').replaceChildren();
    document.getElementById('canvas-wrap').classList.remove('has-card');
    document.getElementById('wrapped-card-result').classList.remove('has-card');
    document.getElementById('btn-download').style.display = 'none';
    document.getElementById('btn-share').style.display = 'none';
  }

  function showWrappedPreview(wrap, canvas) {
    AppWrapped.showPreview(wrap, document.getElementById('wrapped-card-result'), canvas, 'Open full-size Wrapped card preview');
  }

  function wrappedPeriodLabel() {
    var label = wrappedYear === 'all' ? 'All Time' : String(wrappedYear);
    var sh = wrappedYear === 'all' ? 'ALL TIME' : String(wrappedYear);
    if (wrappedMonth !== 0) {
      label = AppUtils.monthName(wrappedMonth) + (wrappedYear === 'all' ? ' · All Time' : ' ' + wrappedYear);
      sh = AppUtils.monthShort(wrappedMonth).toUpperCase() + (wrappedYear === 'all' ? ' · ALL TIME' : ' ' + wrappedYear);
    }
    return { label: label, upper: label.toUpperCase(), sh: sh };
  }

  function wrappedPosterUrl(entry) {
    if (!entry || !entry.poster) return '';
    return entry.type === 'book' ? bookSrc(entry.poster) : AppUtils.getPosterUrl(entry.poster);
  }

  function clearWrappedPreview() {
    var wrap = document.getElementById('canvas-wrap');
    wrap.style.display = 'block';
    wrap.replaceChildren();
    wrap.classList.remove('has-card');
    document.getElementById('wrapped-card-result').classList.remove('has-card');
    document.getElementById('btn-download').style.display = 'none';
    document.getElementById('btn-share').style.display = 'none';
    return wrap;
  }

  function revealWrappedPreview(wrap, canvas) {
    showWrappedPreview(wrap, canvas);
    document.getElementById('btn-download').style.display = 'block';
    document.getElementById('btn-share').style.display = 'block';
  }

  function generateCurrentWrappedCard() {
    if (statsTab === 'books') {
      generateBooksWrappedCard();
      return;
    }
    if (cardStyle === 'share') {
      generateShareWrappedCard();
      return;
    }
    cardStyle === 'aesthetic' ? generateAestheticCard() : generateWrappedCard2();
  }

  function generateShareWrappedCard() {
    var entries = getWrappedEntries();
    var isGames = statsTab === 'games';
    if (isGames) entries = entries.filter(function (entry) { return entry.completionStatus === 'completed'; });
    if (!entries.length) {
      AppUtils.showToast(isGames ? 'No completed games in this period.' : 'No entries to generate.');
      return;
    }
    var renderToken = ++wrappedShareToken;
    var theme = AppWrapped.getTheme();
    var pal = AppWrapped.palette(theme, isGames ? 'games' : 'media');
    var displayFontFamily = AppWrapped.fontForTheme(theme);
    var accent = pal.accent;
    var P = wrappedPeriodLabel();
    var wrap = clearWrappedPreview();

    var canvas = document.createElement('canvas'), W = 1080, H = 1350;
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    var minutes = entries.reduce(function (sum, entry) {
      return sum + (isGames ? (Number(entry.playtime) || 0) * 60 : (Number(entry.runtime) || 0));
    }, 0);
    var rated = entries.filter(function (entry) {
      return isGames ? Number(entry.gameRating) > 0 : Number(entry.rating) > 0;
    });
    var rating = rated.length
      ? rated.reduce(function (sum, entry) { return sum + Number(isGames ? entry.gameRating : entry.rating); }, 0) / rated.length
      : 0;
    var genreCounts = {};
    entries.forEach(function (entry) {
      var genres = entry.genres && entry.genres.length ? entry.genres : (entry.category ? [entry.category] : []);
      genres.forEach(function (genre) { genreCounts[genre] = (genreCounts[genre] || 0) + 1; });
    });
    var topGenre = Object.keys(genreCounts).sort(function (a, b) { return genreCounts[b] - genreCounts[a]; })[0] || '—';
    var topEntries = entries.slice().sort(function (a, b) {
      var aRating = Number(isGames ? a.gameRating : a.rating) || 0;
      var bRating = Number(isGames ? b.gameRating : b.rating) || 0;
      return bRating - aRating || (Number(isGames ? b.playtime : b.runtime) || 0) - (Number(isGames ? a.playtime : a.runtime) || 0);
    }).slice(0, 2);
    var top = topEntries[0];

    AppWrapped.loadFonts([
      '800 64px ' + displayFontFamily,
      '800 64px Inter',
      '600 30px Inter'
    ])
      .then(function () { return AppWrapped.loadImg(wrappedPosterUrl(top)); })
      .then(function (poster) {
        if (renderToken !== wrappedShareToken) return;
        var background = ctx.createLinearGradient(0, 0, W, H);
        background.addColorStop(0, pal.bg0);
        background.addColorStop(0.52, pal.bg1);
        background.addColorStop(1, pal.bg2);
        ctx.fillStyle = background; ctx.fillRect(0, 0, W, H);

        var ambientGlow = ctx.createRadialGradient(240, 180, 20, 240, 180, 600);
        ambientGlow.addColorStop(0, pal.glow);
        ambientGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = ambientGlow; ctx.fillRect(0, 0, W, H);

        if (poster) {
          ctx.save();
          AppUtils.roundRectPath(ctx, 650, 54, 350, 520, 28); ctx.clip();
          ctx.globalAlpha = 0.8;
          AppWrapped.drawCover(ctx, poster, 650, 54, 350, 520);
          ctx.restore();
          var shade = ctx.createLinearGradient(500, 0, 1010, 0);
          shade.addColorStop(0, '#151515'); shade.addColorStop(1, 'rgba(15,15,17,.05)');
          ctx.fillStyle = shade; ctx.fillRect(500, 0, 510, 640);
        }

        ctx.fillStyle = accent; ctx.font = '700 24px Inter, sans-serif';
        ctx.fillText('PLAYLOG  /  ' + (isGames ? 'GAMES' : 'MOVIES') + ' WRAPPED', 72, 90);
        ctx.fillStyle = '#f6f2e8'; ctx.font = '800 62px ' + displayFontFamily;
        ctx.fillText(wrappedYear === 'all'
          ? (isGames ? 'Your gaming story' : 'Your screen story')
          : (isGames ? 'Your year in games' : 'Your year on screen'), 72, 190);
        ctx.fillStyle = '#aaa'; ctx.font = '600 30px Inter, sans-serif'; ctx.fillText(P.upper, 74, 242);
        ctx.fillStyle = accent; ctx.font = '800 142px ' + displayFontFamily; ctx.fillText(entries.length.toLocaleString(), 66, 420);
        ctx.fillStyle = '#f6f2e8'; ctx.font = '600 34px Inter, sans-serif';
        ctx.fillText(isGames ? 'games completed' : 'titles in your story', 76, 474);
        ctx.fillStyle = '#bdb8ad'; ctx.font = '500 27px Inter, sans-serif';
        var mediaCount = entries.filter(function (entry) { return entry.type === 'movie'; }).length;
        var thCount = entries.filter(function (entry) { return entry.theatre; }).length;
        if (!isGames) ctx.fillText(mediaCount + ' movies · ' + (entries.length - mediaCount) + ' series' + (thCount ? ' · ' + thCount + ' in theatres' : ''), 76, 522);

        var values = [
          [AppUtils.formatHours(minutes), isGames ? 'TIME PLAYED' : 'WATCH TIME'],
          [rating ? rating.toFixed(1) + (isGames ? '/10' : '/5') : '—', 'AVERAGE RATING'],
          [topGenre, 'TOP GENRE']
        ];
        values.forEach(function (metric, index) {
          var x = 70 + index * 315, y = 630, w = 290, value = String(metric[0]);
          ctx.fillStyle = 'rgba(255,255,255,.07)'; AppUtils.roundRectPath(ctx, x, y, w, 145, 22); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.12)'; AppUtils.roundRectPath(ctx, x, y, w, 145, 22); ctx.stroke();
          ctx.fillStyle = accent; ctx.font = '800 ' + (value.length > 11 ? 24 : value.length > 7 ? 32 : 42) + 'px Inter, sans-serif';
          ctx.fillText(AppWrapped.trunc(ctx, value, w - 36), x + 20, y + 80);
          ctx.fillStyle = '#aaa'; ctx.font = '600 22px Inter, sans-serif'; ctx.fillText(metric[1], x + 20, y + 119);
        });

        ctx.fillStyle = '#f6f2e8'; ctx.font = '800 29px Inter, sans-serif';
        ctx.fillText(isGames ? 'COMPLETED GAMES' : 'TWO PICKS FOR YOU', 72, 850);
        topEntries.forEach(function (entry, index) {
          var y = 880 + index * 155;
          ctx.fillStyle = 'rgba(255,255,255,.055)'; AppUtils.roundRectPath(ctx, 70, y, 940, 130, 22); ctx.fill();
          ctx.fillStyle = accent; ctx.font = '800 48px Inter, sans-serif'; ctx.fillText(String(index + 1).padStart(2, '0'), 98, y + 68);
          ctx.fillStyle = '#fff'; ctx.font = '700 34px Inter, sans-serif'; ctx.fillText(AppWrapped.trunc(ctx, entry.title, 760), 190, y + 54);
          var entryRating = Number(isGames ? entry.gameRating : entry.rating) || 0;
          var meta = isGames
            ? (entryRating ? entryRating + '/10' : 'Unrated') + '  ·  ' + AppUtils.formatHours((Number(entry.playtime) || 0) * 60) + ' played'
            : (entryRating ? entryRating + '/5' : 'Unrated') + '  ·  ' + (entry.type || 'title');
          ctx.fillStyle = '#c9c5bb'; ctx.font = '500 25px Inter, sans-serif'; ctx.fillText(AppWrapped.trunc(ctx, meta, 760), 190, y + 96);
        });
        ctx.fillStyle = '#777'; ctx.font = '500 22px Inter, sans-serif'; ctx.fillText('Made with Playlog', 72, 1320);
        revealWrappedPreview(wrap, canvas);
      });
  }

  function generateBooksWrappedCard() {
    var reads = getWrappedEntries();
    if (!reads.length) {
      AppUtils.showToast('No finished books to wrap for this period.');
      return;
    }
    var reReads = readBookInstances().filter(function (b) {
      return b._reRead &&
        (wrappedYear === 'all' || Number(b.finishYear) === Number(wrappedYear)) &&
        (wrappedMonth === 0 || Number(b.finishMonth) === wrappedMonth);
    }).length;
    var renderToken = ++wrappedShareToken;
    var theme = AppWrapped.getTheme();
    var pal = AppWrapped.palette(theme, 'books');
    var displayFontFamily = AppWrapped.fontForTheme(theme);
    var accent = pal.accent;
    var P = wrappedPeriodLabel();
    var wrap = clearWrappedPreview();

    var pages = 0, ratingTotal = 0, ratingCount = 0, authorCounts = {};
    reads.forEach(function (b) {
      pages += Number(b.pages) || 0;
      if (b.bookRating >= 1 && b.bookRating <= 10) {
        ratingTotal += Number(b.bookRating);
        ratingCount++;
      }
      if (b.author) authorCounts[b.author] = (authorCounts[b.author] || 0) + 1;
    });
    var avgVal = ratingCount ? ratingTotal / ratingCount : 0;
    var avg = avgVal ? avgVal.toFixed(1) + '/10' : '—';
    var authors = Object.keys(authorCounts).sort(function (a, b) { return authorCounts[b] - authorCounts[a]; });
    var rated = reads.filter(function (b) { return b.bookRating; });
    var topAll = (rated.length ? rated : reads).slice().sort(function (a, b) {
      return (b.bookRating || 0) - (a.bookRating || 0) || (b.pages || 0) - (a.pages || 0);
    });

    if (cardStyle === 'share') {
      var topShare = topAll.slice(0, 3);
      var canvasS = document.createElement('canvas'), W = 1080, H = 1350;
      canvasS.width = W; canvasS.height = H;
      var ctxS = canvasS.getContext('2d');
      AppWrapped.loadFonts(['800 64px ' + displayFontFamily, '800 64px Inter', '600 30px Inter'])
        .then(function () { return AppWrapped.loadImg(wrappedPosterUrl(topShare[0])); })
        .then(function (coverImg) {
          if (renderToken !== wrappedShareToken) return;
          var bg = ctxS.createLinearGradient(0, 0, W, H);
          bg.addColorStop(0, pal.bg0); bg.addColorStop(0.55, pal.bg1); bg.addColorStop(1, pal.bg2);
          ctxS.fillStyle = bg; ctxS.fillRect(0, 0, W, H);
          var glow = ctxS.createRadialGradient(240, 180, 20, 240, 180, 580);
          glow.addColorStop(0, pal.glow); glow.addColorStop(1, 'transparent');
          ctxS.fillStyle = glow; ctxS.fillRect(0, 0, W, H);

          if (coverImg) {
            ctxS.save();
            ctxS.shadowColor = 'rgba(0,0,0,0.65)'; ctxS.shadowBlur = 32; ctxS.shadowOffsetX = -6; ctxS.shadowOffsetY = 14;
            AppUtils.roundRectPath(ctxS, 650, 54, 350, 520, 20); ctxS.clip();
            ctxS.globalAlpha = 0.9;
            AppWrapped.drawCover(ctxS, coverImg, 650, 54, 350, 520);
            var spine = ctxS.createLinearGradient(650, 0, 680, 0);
            spine.addColorStop(0, 'rgba(0,0,0,0.65)'); spine.addColorStop(1, 'rgba(0,0,0,0)');
            ctxS.fillStyle = spine; ctxS.fillRect(650, 54, 30, 520);
            ctxS.restore();
            var shade = ctxS.createLinearGradient(500, 0, 1010, 0);
            shade.addColorStop(0, '#151515'); shade.addColorStop(1, 'rgba(15,15,17,.05)');
            ctxS.fillStyle = shade; ctxS.fillRect(500, 0, 510, 640);
          }

          ctxS.fillStyle = accent; ctxS.font = '700 24px Inter, sans-serif';
          ctxS.fillText('PLAYLOG  /  BOOKS WRAPPED', 72, 90);
          ctxS.fillStyle = '#f6f2e8'; ctxS.font = '800 62px ' + displayFontFamily;
          ctxS.fillText(P.label === 'All Time' ? 'Your reading story' : 'Your reading recap', 72, 190);
          ctxS.fillStyle = '#aaa'; ctxS.font = '600 30px Inter, sans-serif'; ctxS.fillText(P.upper, 74, 242);
          ctxS.fillStyle = accent; ctxS.font = '800 142px ' + displayFontFamily;
          ctxS.fillText(reads.length.toLocaleString(), 66, 420);
          ctxS.fillStyle = '#f6f2e8'; ctxS.font = '600 34px Inter, sans-serif'; ctxS.fillText('books finished', 76, 474);
          ctxS.fillStyle = '#bdb8ad'; ctxS.font = '500 27px Inter, sans-serif';
          ctxS.fillText(reReads ? reReads.toLocaleString() + ' re-read' + (reReads === 1 ? '' : 's') : 'A fresh chapter in your reading life', 76, 522);

          [
            [pages ? pages.toLocaleString() : '—', 'PAGES READ'],
            [avg, 'AVERAGE RATING'],
            [authors[0] || '—', 'TOP AUTHOR']
          ].forEach(function (metric, index) {
            var x = 70 + index * 315, y = 630, w = 290, value = String(metric[0]);
            ctxS.fillStyle = 'rgba(255,255,255,.07)'; AppUtils.roundRectPath(ctxS, x, y, w, 145, 22); ctxS.fill();
            ctxS.strokeStyle = 'rgba(255,255,255,.12)'; AppUtils.roundRectPath(ctxS, x, y, w, 145, 22); ctxS.stroke();
            ctxS.fillStyle = accent; ctxS.font = '800 ' + (value.length > 12 ? 24 : value.length > 8 ? 32 : 42) + 'px Inter, sans-serif';
            ctxS.fillText(AppWrapped.trunc(ctxS, value, w - 36), x + 20, y + 80);
            ctxS.fillStyle = '#aaa'; ctxS.font = '600 22px Inter, sans-serif'; ctxS.fillText(metric[1], x + 20, y + 119);
          });

          ctxS.fillStyle = '#f6f2e8'; ctxS.font = '800 29px Inter, sans-serif'; ctxS.fillText('A FEW FAVORITES', 72, 850);
          topShare.forEach(function (book, index) {
            var y = 895 + index * 105;
            ctxS.fillStyle = 'rgba(255,255,255,.055)'; AppUtils.roundRectPath(ctxS, 70, y, 940, 64, 16); ctxS.fill();
            ctxS.fillStyle = accent; ctxS.font = '800 28px Inter, sans-serif'; ctxS.fillText(String(index + 1).padStart(2, '0'), 92, y + 42);
            ctxS.fillStyle = '#fff'; ctxS.font = '600 27px Inter, sans-serif'; ctxS.fillText(AppWrapped.trunc(ctxS, book.title, 570), 155, y + 40);
            ctxS.textAlign = 'right'; ctxS.fillStyle = '#c9c5bb'; ctxS.font = '500 22px Inter, sans-serif';
            ctxS.fillText((book.bookRating ? book.bookRating + '/10' : '') + (book.pages ? '  ·  ' + Number(book.pages).toLocaleString() + ' pages' : ''), 980, y + 40);
            ctxS.textAlign = 'left';
          });
          ctxS.fillStyle = '#777'; ctxS.font = '500 22px Inter, sans-serif'; ctxS.fillText('Made with Playlog', 72, 1320);
          revealWrappedPreview(wrap, canvasS);
        });
      return;
    }

    var aes = cardStyle === 'aesthetic';
    var topB = topAll.slice(0, aes ? 5 : 4);
    var W = 1080, H = 1920, canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');

    AppWrapped.loadFonts(['800 64px ' + displayFontFamily, '800 60px Inter', '700 34px Inter', '500 26px Inter', '600 20px Inter'])
      .then(function () { return Promise.all(topB.slice(0, aes ? 1 : 4).map(function (b) { return AppWrapped.loadImg(wrappedPosterUrl(b)); })); })
      .then(function (imgs) {
        if (renderToken !== wrappedShareToken) return;
        ctx.textAlign = 'left';
        if (aes) {
          var C = pal.aes, img = imgs[0];
          ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, 1040);
          AppWrapped.blurDraw(ctx, img, 0, 0, W, 1040, 0.35);
          ctx.fillStyle = '#0e0e10'; ctx.fillRect(0, 1040, W, H - 1040);
          AppWrapped.blurDraw(ctx, img, 0, 1040, W, H - 1040, 0.55);
          ctx.fillStyle = 'rgba(10,10,12,0.45)'; ctx.fillRect(0, 1040, W, H - 1040);
          AppWrapped.glass(ctx, 40, 1080, W - 80, 800, 32, 0.07);
          var fx = 350, fy = 90, cs = 31;
          for (var r = 0; r < 29; r++) for (var c = 0; c < 20; c++) {
            ctx.fillStyle = (r + c) % 2 ? '#f1efe6' : '#111111';
            ctx.fillRect(fx + c * cs, fy + r * cs, cs, cs);
          }
          var ix = 380, iy = 120, iw = 560, ih = 839;
          ctx.fillStyle = '#f1efe6'; ctx.fillRect(ix - 6, iy - 6, iw + 12, ih + 12);
          ctx.save(); ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip();
          if (img) AppWrapped.drawCover(ctx, img, ix, iy, iw, ih); else { ctx.fillStyle = '#1e1e1e'; ctx.fillRect(ix, iy, iw, ih); }
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
          topB.forEach(function (b, i) {
            var ry = y0 + 60 + i * 58, pgs = b.pages ? Number(b.pages).toLocaleString() + 'p' : '—';
            ctx.font = '700 34px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = C.text;
            ctx.fillText((i + 1) + '  ' + AppWrapped.trunc(ctx, b.title, 620), 80, ry);
            ctx.textAlign = 'right';
            ctx.fillStyle = C.mute; ctx.fillText(pgs, 1000, ry);
            ctx.fillStyle = C.text; ctx.font = '800 34px Inter, sans-serif'; ctx.fillText(b.bookRating ? String(b.bookRating) : '—', 820, ry);
            ctx.textAlign = 'left'; ctx.font = '700 34px Inter, sans-serif';
          });
          var sy = 1530;
          ctx.fillStyle = C.mute; ctx.font = '500 26px Inter, sans-serif';
          ctx.fillText('Pages Read', 80, sy); ctx.fillText('Avg Rating', 580, sy);
          ctx.fillStyle = C.text; ctx.font = '800 76px Inter, sans-serif';
          ctx.fillText(AppWrapped.trunc(ctx, pages ? pages.toLocaleString() : '—', 440), 80, sy + 90);
          ctx.fillText(avg, 580, sy + 90);
          ctx.font = '800 30px Inter, sans-serif'; ctx.fillText('PLAYLOG', 80, 1850);
          ctx.textAlign = 'right'; ctx.fillText('BOOKS WRAPPED · ' + P.sh, 1000, 1850); ctx.textAlign = 'left';
        } else {
          ctx.fillStyle = '#0b0b0d'; ctx.fillRect(0, 0, W, H);
          var heroH = 620, tw = 420, th = 600, c0 = W / 2 - tw / 2;
          var layout = topB.length === 1 ? [{ i: 0, x: c0, y: 10, r: 0 }]
            : topB.length === 2 ? [{ i: 1, x: c0 + 130, y: 40, r: 0.07 }, { i: 0, x: c0 - 130, y: 20, r: -0.05 }]
            : [{ i: 1, x: c0 - 210, y: 40, r: -0.09 }, { i: 2, x: c0 + 210, y: 40, r: 0.09 }, { i: 0, x: c0, y: 10, r: 0 }];
          ctx.save(); AppUtils.roundRectPath(ctx, 0, 0, W, heroH + 60, 0); ctx.clip();
          layout.forEach(function (p) {
            var im = imgs[p.i];
            ctx.save(); ctx.translate(p.x + tw / 2, p.y + th / 2); ctx.rotate(p.r); ctx.translate(-tw / 2, -th / 2);
            ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 20;
            AppUtils.roundRectPath(ctx, 0, 0, tw, th, 24);
            if (im) { ctx.clip(); AppWrapped.drawCover(ctx, im, 0, 0, tw, th); } else { ctx.fillStyle = '#1e1e1e'; ctx.fill(); }
            ctx.restore();
          });
          var fade = ctx.createLinearGradient(0, heroH - 260, 0, heroH + 60);
          fade.addColorStop(0, 'rgba(11,11,13,0)'); fade.addColorStop(1, 'rgba(11,11,13,1)');
          ctx.fillStyle = fade; ctx.fillRect(0, 0, W, heroH + 60);
          var scrim = ctx.createLinearGradient(0, 0, 0, 220);
          scrim.addColorStop(0, 'rgba(0,0,0,0.55)'); scrim.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = scrim; ctx.fillRect(0, 0, W, 220);
          ctx.restore();
          AppWrapped.blurDraw(ctx, imgs[0], 0, 680, W, H - 680, 0.45);
          var vg = ctx.createLinearGradient(0, 680, 0, 900);
          vg.addColorStop(0, 'rgba(11,11,13,1)'); vg.addColorStop(1, 'rgba(11,11,13,0)');
          ctx.fillStyle = vg; ctx.fillRect(0, 680, W, 220);
          var vg2 = ctx.createLinearGradient(0, 1100, 0, H);
          vg2.addColorStop(0, 'rgba(11,11,13,0)'); vg2.addColorStop(1, 'rgba(11,11,13,0.6)');
          ctx.fillStyle = vg2; ctx.fillRect(0, 1100, W, H - 1100);
          ctx.fillStyle = accent; ctx.font = '800 30px Inter, sans-serif';
          ctx.fillText('BOOKS WRAPPED · ' + P.upper, 60, heroH + 72);
          ctx.fillRect(60, heroH + 20, 90, 8);
          ctx.fillStyle = '#ffffff'; ctx.font = '800 130px ' + displayFontFamily;
          ctx.fillText(String(reads.length), 58, heroH + 200);
          ctx.fillStyle = '#bbbbbb'; ctx.font = '500 34px Inter, sans-serif';
          ctx.fillText('books read' + (reReads ? ' · ' + reReads + ' re-read' + (reReads > 1 ? 's' : '') : ''), 62, heroH + 240);

          var cards = [
            [pages ? pages.toLocaleString() : '—', 'Pages Read'],
            [avg, 'Avg Rating'],
            [authors[0] || '—', 'Top Author'],
            [pages ? Math.round(pages / reads.length).toLocaleString() : '—', 'Avg Length'],
            [pages ? Math.max.apply(null, reads.map(function (b) { return Number(b.pages) || 0; })).toLocaleString() : '—', 'Longest Book'],
            [String(authors.length), 'Authors']
          ];
          var gap = 20, cw = (W - 120 - gap * 2) / 3, sy2 = heroH + 275;
          cards.forEach(function (s, i) {
            var x = 60 + (i % 3) * (cw + gap), y = sy2 + Math.floor(i / 3) * 160, val = String(s[0]);
            ctx.fillStyle = 'rgba(255,255,255,0.05)'; AppUtils.roundRectPath(ctx, x, y, cw, 140, 20); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1.5; AppUtils.roundRectPath(ctx, x, y, cw, 140, 20); ctx.stroke();
            ctx.fillStyle = accent;
            ctx.font = 'bold ' + (val.length > 12 ? 26 : val.length > 9 ? 30 : val.length > 6 ? 36 : 44) + 'px ' + displayFontFamily;
            ctx.fillText(AppWrapped.trunc(ctx, val, cw - 44), x + 22, y + 94);
            ctx.fillStyle = '#999999'; ctx.font = '600 20px Inter, sans-serif';
            ctx.fillText(s[1].toUpperCase(), x + 22, y + 122);
          });

          var ly = 1250;
          ctx.fillStyle = accent; ctx.font = '800 28px Inter, sans-serif'; ctx.fillText('TOP ' + topB.length, 60, ly);
          topB.forEach(function (b, i) {
            var y = ly + 25 + i * 140;
            AppWrapped.glass(ctx, 60, y, W - 120, 130, 20, 0.08);
            ctx.save(); AppUtils.roundRectPath(ctx, 72, y + 10, 73, 110, 10); ctx.clip();
            if (imgs[i]) AppWrapped.drawCover(ctx, imgs[i], 72, y + 10, 73, 110); else { ctx.fillStyle = '#1e1e1e'; ctx.fillRect(72, y + 10, 73, 110); }
            ctx.restore();
            ctx.fillStyle = accent; ctx.font = '800 54px Inter, sans-serif'; ctx.fillText(String(i + 1), 170, y + 82);
            ctx.fillStyle = '#ffffff'; ctx.font = '700 34px Inter, sans-serif';
            ctx.fillText(AppWrapped.trunc(ctx, b.title, 500), 240, y + 58);
            ctx.fillStyle = '#cccccc'; ctx.font = '500 26px Inter, sans-serif';
            ctx.fillText(AppWrapped.trunc(ctx, (b.author || '').toUpperCase(), 500), 240, y + 100);
            var pgs = b.pages ? Number(b.pages).toLocaleString() + 'p' : '';
            ctx.save(); ctx.textAlign = 'right';
            ctx.font = '700 34px Inter, sans-serif'; ctx.fillStyle = '#ffffff'; ctx.fillText(pgs, W - 90, y + 84);
            ctx.fillStyle = accent; ctx.font = '800 60px Inter, sans-serif'; ctx.fillText(b.bookRating ? String(b.bookRating) : '—', W - 90 - 160, y + 84);
            ctx.restore();
          });

          ctx.fillStyle = '#666666'; ctx.font = '500 24px Inter, sans-serif'; ctx.fillText('Generated with Playlog', 60, H - 40);
        }
        revealWrappedPreview(wrap, canvas);
      });
  }

  function setupWrappedCard() {
    var generateBtn = document.getElementById('btn-generate');
    var downloadBtn = document.getElementById('btn-download');
    var shareBtn = document.getElementById('btn-share');

    generateBtn.addEventListener('click', function () {
      generateCurrentWrappedCard();
    });

    ['wrapped-year', 'wrapped-month'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', function () {
        wrappedYear = document.getElementById('wrapped-year').value;
        wrappedMonth = Number(document.getElementById('wrapped-month').value);
        updateWrappedCardState();
        updateGenLabel();
        if (!generateBtn.disabled && document.getElementById('wrapped-card-result').classList.contains('has-card')) {
          generateCurrentWrappedCard();
        }
      });
    });

    downloadBtn.addEventListener('click', function () {
      var canvas = document.querySelector('#canvas-wrap canvas');
      if (!canvas) return;
      var link = document.createElement('a');
      link.download = statsTab === 'books' ? 'playlog-books-wrapped.png' : 'playlog-wrapped.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    });

    shareBtn.addEventListener('click', function () {
      var canvas = document.querySelector('#canvas-wrap canvas');
      if (!canvas) return;
      var name = statsTab === 'books' ? 'playlog-books-wrapped.png' : 'playlog-wrapped.png';
      var title = statsTab === 'books' ? 'Books Wrapped' : 'Playlog Wrapped';
      AppUtils.shareCanvas(canvas, name, title)
        .catch(function (error) {
          if (error.name !== 'AbortError') AppUtils.showToast(error.message || 'Could not share the card.');
        });
    });
  }

  var cardStyle = 'share';
  document.querySelectorAll('#card-style .toggle-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('#card-style .toggle-btn').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      cardStyle = b.dataset.style;
      if (document.getElementById('wrapped-card-result').classList.contains('has-card')) generateCurrentWrappedCard();
    });
  });

  function updateGenLabel() {
    var b = document.getElementById('btn-generate');
    if (!b) return;
    var p = wrappedYear === 'all' ? 'All Time' : String(wrappedYear);
    if (wrappedMonth !== 0) p = AppUtils.monthName(wrappedMonth) + (wrappedYear === 'all' ? ' · All Time' : ' ' + wrappedYear);
    var tag = statsTab === 'books' ? 'Books Wrapped' : 'Wrapped';
    b.textContent = '✨ Generate ' + tag + ' · ' + p;
  }

  function generateAestheticCard() {
    var entries = getWrappedEntries();
    if (!entries.length) { AppUtils.showToast('No entries to generate.'); return; }
    var renderToken = ++wrappedShareToken;
    var G = statsTab === 'games';
    var theme = AppWrapped.getTheme();
    var C = AppWrapped.palette(theme, G ? 'games' : 'media').aes;
    var P = wrappedPeriodLabel();
    var wrap = clearWrappedPreview();

    var W = 1080, H = 1920, canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.style.width = '100%'; canvas.style.borderRadius = '20px';
    var ctx = canvas.getContext('2d');

    var rate = function (e) { return (G ? e.gameRating : e.rating) || 0; };
    var vol = function (e) { return G ? (e.playtime || 0) : (e.runtime || 0); };
    var pool = G ? entries.filter(function (e) { return e.completionStatus === 'completed' && e.gameRating; }) : [];
    if (!pool.length) pool = entries.filter(function (e) { return rate(e); });
    if (!pool.length) pool = entries;
    var top = pool.slice().sort(function (a, b) { return rate(b) - rate(a) || vol(b) - vol(a); }).slice(0, 5);

    var mins = entries.reduce(function (s, e) { return s + (G ? (e.playtime || 0) * 60 : (e.runtime || 0)); }, 0);
    var rated = entries.filter(function (e) { return rate(e); });
    var avg = rated.length ? rated.reduce(function (s, e) { return s + rate(e); }, 0) / rated.length : 0;

    AppWrapped.loadFonts(['800 60px Inter', '700 34px Inter', '500 26px Inter'])
      .then(function () { return AppWrapped.loadImg(wrappedPosterUrl(top[0])); })
      .then(function (img) {
        if (renderToken !== wrappedShareToken) return;
        ctx.textAlign = 'left';
        ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, 1040);
        AppWrapped.blurDraw(ctx, img, 0, 0, W, 1040, 0.35);
        ctx.fillStyle = '#0e0e10'; ctx.fillRect(0, 1040, W, H - 1040);
        AppWrapped.blurDraw(ctx, img, 0, 1040, W, H - 1040, 0.55);
        ctx.fillStyle = 'rgba(10,10,12,0.45)'; ctx.fillRect(0, 1040, W, H - 1040);
        AppWrapped.glass(ctx, 40, 1080, W - 80, 800, 32, 0.07);

        var fx = 350, fy = 90, cs = 31;
        for (var r = 0; r < 29; r++) for (var c = 0; c < 20; c++) {
          ctx.fillStyle = (r + c) % 2 ? '#f1efe6' : '#111111';
          ctx.fillRect(fx + c * cs, fy + r * cs, cs, cs);
        }
        var ix = 380, iy = 120, iw = 560, ih = 839;
        ctx.fillStyle = '#f1efe6'; ctx.fillRect(ix - 6, iy - 6, iw + 12, ih + 12);
        ctx.save(); ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip();
        if (img) AppWrapped.drawCover(ctx, img, ix, iy, iw, ih);
        else { ctx.fillStyle = '#1e1e1e'; ctx.fillRect(ix, iy, iw, ih); }
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
        ctx.fillText(G ? 'Top Games' : 'Top Titles', 80, y0);
        ctx.save(); ctx.textAlign = 'right'; ctx.fillText('Rating  ·  ' + (G ? 'Hours' : 'Runtime'), 1000, y0); ctx.restore();
        ctx.fillStyle = C.text; ctx.font = '700 34px Inter, sans-serif';
        top.forEach(function (e, i) {
          var ry = y0 + 60 + i * 58, rr = G ? e.gameRating : e.rating;
          var hh = G ? (e.playtime ? e.playtime + 'h' : '—') : AppUtils.formatHours(e.runtime || 0);
          ctx.font = '700 34px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = C.text;
          ctx.fillText((i + 1) + '  ' + AppWrapped.trunc(ctx, e.title, 560), 80, ry);
          ctx.textAlign = 'right';
          ctx.fillStyle = C.mute; ctx.fillText(hh, 1000, ry);
          ctx.fillStyle = C.text; ctx.font = '800 34px Inter, sans-serif'; ctx.fillText(rr ? String(rr) : '—', 840, ry);
          ctx.textAlign = 'left';
        });

        var sy = 1530;
        ctx.fillStyle = C.mute; ctx.font = '500 26px Inter, sans-serif';
        ctx.fillText(G ? 'Hours Played' : 'Hours Watched', 80, sy);
        ctx.fillText('Avg Rating', 580, sy);
        ctx.fillStyle = C.text; ctx.font = '800 76px Inter, sans-serif';
        ctx.fillText(AppWrapped.trunc(ctx, AppUtils.formatHours(mins), 440), 80, sy + 90);
        ctx.fillText(avg ? avg.toFixed(1) + (G ? '/10' : '/5') : '—', 580, sy + 90);
        var thN = entries.filter(function (e) { return e.theatre; }).length;
        if (!G && thN) { ctx.fillStyle = C.mute; ctx.font = '500 26px Inter, sans-serif'; ctx.fillText(thN + ' watched in theatres', 80, sy + 140); }

        ctx.font = '800 30px Inter, sans-serif'; ctx.fillStyle = C.text;
        ctx.fillText('PLAYLOG', 80, 1850);
        ctx.textAlign = 'right'; ctx.fillText('WRAPPED · ' + P.sh, 1000, 1850);
        ctx.textAlign = 'left';
        revealWrappedPreview(wrap, canvas);
      });
  }

  function generateWrappedCard2() {
    var entries = getWrappedEntries();
    if (!entries.length) { AppUtils.showToast('No entries to generate.'); return; }
    var renderToken = ++wrappedShareToken;
    var G = statsTab === 'games';
    var theme = AppWrapped.getTheme();
    var accent = AppWrapped.palette(theme, G ? 'games' : 'media').accent;
    var displayFontFamily = AppWrapped.fontForTheme(theme);
    var P = wrappedPeriodLabel();
    var wrap = clearWrappedPreview();

    var W = 1080, H = 1920, canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.style.width = '100%'; canvas.style.borderRadius = '20px';
    var ctx = canvas.getContext('2d');

    var rate = function (e) { return (G ? e.gameRating : e.rating) || 0; };
    var vol = function (e) { return G ? (e.playtime || 0) : (e.runtime || 0); };
    var pool = G ? entries.filter(function (e) { return e.completionStatus === 'completed' && e.gameRating; }) : [];
    if (!pool.length) pool = entries.filter(function (e) { return rate(e); });
    if (!pool.length) pool = entries;
    var top = pool.slice().sort(function (a, b) { return rate(b) - rate(a) || vol(b) - vol(a); }).slice(0, G ? 5 : 3);

    function statCard(x, y, w, h, val, label) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; AppUtils.roundRectPath(ctx, x, y, w, h, 20); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1.5; AppUtils.roundRectPath(ctx, x, y, w, h, 20); ctx.stroke();
      val = String(val);
      ctx.fillStyle = accent;
      ctx.font = 'bold ' + (val.length > 12 ? 26 : val.length > 9 ? 30 : val.length > 6 ? 36 : 44) + 'px ' + displayFontFamily;
      ctx.fillText(AppWrapped.trunc(ctx, val, w - 44), x + 22, y + h - 46);
      ctx.fillStyle = '#999999'; ctx.font = '600 20px Inter, sans-serif';
      ctx.fillText(label.toUpperCase(), x + 22, y + h - 18);
    }

    AppWrapped.loadFonts([
      '800 64px ' + displayFontFamily,
      '800 30px Inter',
      'bold 44px Inter',
      '500 30px Inter',
      '600 20px Inter'
    ]).then(function () {
      return Promise.all(top.map(function (e) { return AppWrapped.loadImg(wrappedPosterUrl(e)); }));
    }).then(function (imgs) {
      if (renderToken !== wrappedShareToken) return;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#0b0b0d'; ctx.fillRect(0, 0, W, H);

      var heroH = 620, tw = 420, th = 600, c0 = W / 2 - tw / 2;
      var layout = top.length === 1 ? [{ i: 0, x: c0, y: 10, r: 0 }]
        : top.length === 2 ? [{ i: 1, x: c0 + 130, y: 40, r: 0.07 }, { i: 0, x: c0 - 130, y: 20, r: -0.05 }]
        : [{ i: 1, x: c0 - 210, y: 40, r: -0.09 }, { i: 2, x: c0 + 210, y: 40, r: 0.09 }, { i: 0, x: c0, y: 10, r: 0 }];
      ctx.save();
      AppUtils.roundRectPath(ctx, 0, 0, W, heroH + 60, 0); ctx.clip();
      layout.forEach(function (p) {
        var im = imgs[p.i];
        ctx.save();
        ctx.translate(p.x + tw / 2, p.y + th / 2); ctx.rotate(p.r); ctx.translate(-tw / 2, -th / 2);
        ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 20;
        AppUtils.roundRectPath(ctx, 0, 0, tw, th, 24);
        if (im) { ctx.clip(); AppWrapped.drawCover(ctx, im, 0, 0, tw, th); } else { ctx.fillStyle = '#1e1e1e'; ctx.fill(); }
        ctx.restore();
      });
      var fade = ctx.createLinearGradient(0, heroH - 260, 0, heroH + 60);
      fade.addColorStop(0, 'rgba(11,11,13,0)'); fade.addColorStop(1, 'rgba(11,11,13,1)');
      ctx.fillStyle = fade; ctx.fillRect(0, 0, W, heroH + 60);
      var scrim = ctx.createLinearGradient(0, 0, 0, 220);
      scrim.addColorStop(0, 'rgba(0,0,0,0.55)'); scrim.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = scrim; ctx.fillRect(0, 0, W, 220);
      ctx.restore();

      AppWrapped.blurDraw(ctx, imgs[0], 0, 680, W, H - 680, 0.45);
      var vg = ctx.createLinearGradient(0, 680, 0, 900);
      vg.addColorStop(0, 'rgba(11,11,13,1)'); vg.addColorStop(1, 'rgba(11,11,13,0)');
      ctx.fillStyle = vg; ctx.fillRect(0, 680, W, 220);
      var vg2 = ctx.createLinearGradient(0, 1100, 0, H);
      vg2.addColorStop(0, 'rgba(11,11,13,0)'); vg2.addColorStop(1, 'rgba(11,11,13,0.6)');
      ctx.fillStyle = vg2; ctx.fillRect(0, 1100, W, H - 1100);

      ctx.fillStyle = accent; ctx.font = '800 30px Inter, sans-serif';
      ctx.fillText((G ? 'GAMES WRAPPED' : 'WRAPPED') + ' · ' + P.upper, 60, heroH + 72);
      ctx.fillRect(60, heroH + 20, 90, 8);
      ctx.fillStyle = '#ffffff'; ctx.font = '800 130px ' + displayFontFamily;
      ctx.fillText(String(entries.length), 58, heroH + 200);
      ctx.fillStyle = '#bbbbbb'; ctx.font = '500 34px Inter, sans-serif';
      var thN = entries.filter(function (e) { return e.theatre; }).length;
      ctx.fillText(G ? 'games logged' : 'titles logged' + (thN ? ' · ' + thN + ' in theatres' : ''), 62, heroH + 240);

      var mins = entries.reduce(function (s, e) { return s + (G ? (e.playtime || 0) * 60 : (e.runtime || 0)); }, 0);
      var gc = {};
      entries.forEach(function (e) {
        var gs = (e.genres && e.genres.length) ? e.genres : (e.category ? [e.category] : []);
        gs.forEach(function (g) { gc[g] = (gc[g] || 0) + 1; });
      });
      var tg = Object.keys(gc).sort(function (a, b) { return gc[b] - gc[a]; })[0] || '—';
      var rated = entries.filter(function (e) { return rate(e); });
      var avg = rated.length ? rated.reduce(function (s, e) { return s + rate(e); }, 0) / rated.length : 0;
      var stats = [
        [AppUtils.formatHours(mins), G ? 'Hours Played' : 'Watch Time'],
        [avg ? avg.toFixed(1) + (G ? '/10' : '/5') : '—', 'Avg Rating'],
        [tg, 'Top Genre']
      ];
      var gap = 20, cw = (W - 120 - gap * 2) / 3, sy = heroH + 275;
      stats.forEach(function (s, i) { statCard(60 + i * (cw + gap), sy, cw, 140, s[0], s[1]); });

      var ly = 1090;
      ctx.fillStyle = accent; ctx.font = '800 28px Inter, sans-serif';
      ctx.fillText('TOP ' + top.length, 60, ly);
      top.forEach(function (e, i) {
        var y = ly + 25 + i * 150;
        AppWrapped.glass(ctx, 60, y, W - 120, 130, 20, 0.08);
        ctx.save();
        AppUtils.roundRectPath(ctx, 72, y + 10, 73, 110, 10); ctx.clip();
        if (imgs[i]) AppWrapped.drawCover(ctx, imgs[i], 72, y + 10, 73, 110); else { ctx.fillStyle = '#1e1e1e'; ctx.fillRect(72, y + 10, 73, 110); }
        ctx.restore();
        ctx.fillStyle = accent; ctx.font = '800 54px Inter, sans-serif';
        ctx.fillText(String(i + 1), 170, y + 82);
        ctx.fillStyle = '#ffffff'; ctx.font = '700 34px Inter, sans-serif';
        ctx.fillText(AppWrapped.trunc(ctx, e.title, W - 60 - 240 - (G ? 230 : 30)), 240, G ? y + 78 : y + 58);
        var r = rate(e);
        var line = (G ? (r ? r + '/10' : 'Unrated') : (r ? AppUtils.ratingToEmoji(r) + ' ' + r + '/5' : 'Unrated'))
          + ' · ' + (G ? (e.completionStatus || 'logged') : (e.type || '')).toUpperCase() + (G && e.playtime ? ' · ' + e.playtime + 'H' : '');
        ctx.fillStyle = '#cccccc'; ctx.font = '500 26px Inter, sans-serif';
        if (G) {
          var hrs = e.playtime ? e.playtime + 'H' : '';
          ctx.save(); ctx.textAlign = 'right';
          ctx.font = '700 34px Inter, sans-serif'; ctx.fillStyle = '#ffffff';
          ctx.fillText(hrs, W - 90, y + 84);
          var hw = hrs ? ctx.measureText(hrs).width + 50 : 0;
          ctx.fillStyle = accent;
          ctx.font = '800 60px Inter, sans-serif'; ctx.fillText(r ? String(r) : '—', W - 90 - hw, y + 84);
          ctx.restore();
        } else ctx.fillText(line, 240, y + 100);
      });

      ctx.fillStyle = '#666666'; ctx.font = '500 24px Inter, sans-serif';
      ctx.fillText('Generated with Playlog', 60, H - 40);
      revealWrappedPreview(wrap, canvas);
    });
  }

});