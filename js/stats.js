// Stats page: yearly and monthly statistics with Spotify Wrapped style canvas card
AppAuth.requireAuth(function (user) {

  var uid = user.uid;

  var allEntries = [];

  var currentYear = 'all';

  var currentMonth = 0;

  var statsTab = 'media';

  document.getElementById('stats-type-pills').addEventListener('click', function (e) {
    var btn = e.target.closest('.type-pill');
    if (!btn) return;
    document.querySelectorAll('#stats-type-pills .type-pill').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    statsTab = btn.dataset.tab === 'games' ? 'games' : 'media';
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

  AppDB.getAllEntries(uid)
    .then(function (entries) {


      allEntries = entries || [];
      AppUtils.setAmbient(allEntries[0] && allEntries[0].poster);

      populateYearSelect(allEntries);

      render();

    })
    .catch(function (err) {

      console.error(err);

      AppUtils.showToast(
        'Failed to load stats.'
      );

    });

  // YEAR SELECT

  function populateYearSelect(entries) {

    var select =
      document.getElementById(
        'year-select'
      );

    var years = {};

    entries.forEach(function (entry) {

      if (entry.yearWatched) {
        years[entry.yearWatched] = true;
      }

    });

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

    select.value = currentYear;

    select.addEventListener(
      'change',
      function () {

        currentYear =
          select.value === 'all' ? 'all' : Number(select.value);

        render();

      }
    );

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

  function render() {

    var entries =
      getFilteredEntries();

    renderStats(entries);

    renderTopPicks(entries);

    

    renderDeepCuts(entries);

    var isGamesTab = statsTab === 'games';

    document.getElementById('media-stats-strip').style.display = isGamesTab ? 'none' : 'grid';
    document.getElementById('games-stats-strip').style.display = isGamesTab ? 'grid' : 'none';
    document.getElementById('top-picks-section').style.display = isGamesTab ? 'none' : 'block';
    document.getElementById('deep-cuts-section').style.display = isGamesTab ? 'none' : 'block';
    document.getElementById('leaderboard-section').style.display = isGamesTab ? 'block' : 'none';

    if (isGamesTab) {
      renderGameStats(entries);
    }

    renderPlaytimeLeaderboard(entries);

    updateUIState(entries);

    window.currentStatsEntries = entries;
    renderViz(entries);
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
    var H = 190, pl = 30, pr = 14, pt = 24, pb = 30, pw = w - pl - pr, ph = H - pt - pb;
    var X = function (i) { return pl + i * pw / 11; };
    var Y = function (c) { return pt + ph - c / mx * ph; };
    var pts = cnt.map(function (c, i) { return X(i).toFixed(1) + ',' + Y(c).toFixed(1); }).join(' ');
    var s = '<svg width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + ' ' + H + '">';
    [0, 1].forEach(function (f) {
      var y = pt + ph - f * ph;
      s += '<line x1="' + pl + '" x2="' + (w - pr) + '" y1="' + y + '" y2="' + y + '" style="stroke:var(--bg-card-2)"/>' +
        '<text x="' + (pl - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" style="fill:var(--text-muted)">' + (f ? mx : 0) + '</text>';
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

  function genreDonut(gk, gc, entries, isG, cls) {
    var pal = ['#c9a84c', '#e07a5f', '#81b29a', '#5aa9e6', '#b388eb'];
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
      leg += '<span class="dn-leg" data-i="' + i + '"><i style="background:' + pal[i] + '"></i>' + g + '</span>';
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
      info.innerHTML = '<b>' + d.g + '</b><span>' + d.n + ' ' + d.unit + ' · ' + d.pct + '%</span><span>Avg ' + d.avg + '</span><span>' + d.time + '</span>';
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
    html += '<div class="viz-chips">' + chips.map(function (c) { return '<span>' + c + '</span>'; }).join('') + '</div>';

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

    // Rating distribution
    var n = isG ? 10 : 5, rc = [], em = ['😭','🙁','😐','😊','🤩'];
    for (var i = 0; i < n; i++) rc.push(0);
    entries.forEach(function (e) { var r = isG ? e.gameRating : e.rating; if (r >= 1 && r <= n) rc[r - 1]++; });
    var rmax = Math.max.apply(null, rc.concat(1));
    html += '<p class="section-title">Ratings</p><div class="viz-card viz-cols ' + cls + '">' +
      rc.map(function (c, i) {
        return '<div><span>' + c + '</span><i style="height:' + Math.round(c / rmax * 80) + 'px"></i><em>' + (isG ? i + 1 : em[i]) + '</em></div>';
      }).join('') + '</div>';

    // Top genres
    var gk = Object.keys(gc).sort(function (a, b) { return gc[b] - gc[a]; }).slice(0, 5);
    html += '<div class="viz-pair">';
    if (gk.length) { html += genreDonut(gk, gc, entries, isG, cls); }
    if (false) {
      html += '<p class="section-title">Top Genres</p><div class="viz-card ' + cls + '">' +
        gk.map(function (g) {
          return '<div class="viz-row"><span>' + g + '</span><div><i style="width:' + Math.round(gc[g] / gc[gk[0]] * 100) + '%"></i></div><b>' + gc[g] + '</b></div>';
        }).join('') + '</div>';
    }

    // Split bar
    var cnt = function (f) { return entries.filter(f).length; };
    var parts = isG
      ? [['Completed', 'completed', '#22c55e'], ['Playing', 'playing', '#f59e0b'], ['Dropped', 'dropped', '#ef4444'], ['Wishlist', 'wishlist', '#6366f1']]
          .map(function (p) { return [p[0], cnt(function (e) { return e.completionStatus === p[1]; }), p[2]]; })
      : [['Movies', cnt(function (e) { return e.type === 'movie'; }), '#c9a84c'], ['Series', cnt(function (e) { return e.type === 'series'; }), '#8a7434']];
    if (entries.length) {
      html += '<p class="section-title">' + (isG ? 'Status' : 'Movies vs Series') + '</p><div class="viz-card"><div class="viz-split">' +
        parts.map(function (p) { return p[1] ? '<i style="flex:' + p[1] + ';background:' + p[2] + '"></i>' : ''; }).join('') +
        '</div><div class="viz-legend">' +
        parts.map(function (p) { return '<span><i style="background:' + p[2] + '"></i>' + p[0] + ' ' + p[1] + '</span>'; }).join('') +
        '</div></div>';
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
      entries.filter(function (e) { return e.completionStatus === 'wishlist'; }).length;

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

    // WRAPPED CARD BUTTON STATE

    var generateBtn =
      document.getElementById(
        'btn-generate'
      );

    var wrappedMessage =
      document.getElementById(
        'wrapped-card-message'
      );

    if (entries.length === 0) {

      generateBtn.disabled = true;

      generateBtn.style.opacity = '0.5';

      wrappedMessage.textContent =
        'Add some entries to generate your card.';

      wrappedMessage.style.display =
        'block';

    } else {

      generateBtn.disabled = false;

      generateBtn.style.opacity = '1';

      wrappedMessage.style.display =
        'none';

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

      }).slice(0, 4);

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
        entry.title +
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
        '<div class="leaderboard-title">' + g.title + '</div>' +
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

    // LONGEST WATCH STREAK

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

  function setupWrappedCard() {

    var generateBtn =
      document.getElementById(
        'btn-generate'
      );

    var downloadBtn =
      document.getElementById(
        'btn-download'
      );

    generateBtn.addEventListener(
      'click',
      function () {

        cardStyle === 'aesthetic' ? generateAestheticCard() : generateWrappedCard2();

      }
    );

    downloadBtn.addEventListener(
      'click',
      function () {

        var canvas =
          document.querySelector(
            '#canvas-wrap canvas'
          );

        if (!canvas) return;

        var link =
          document.createElement('a');

        link.download =
          'playlog-wrapped.png';

        link.href =
          canvas.toDataURL(
            'image/png'
          );

        link.click();

      }
    );

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

  var cardStyle = 'detailed';
  document.querySelectorAll('#card-style .toggle-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('#card-style .toggle-btn').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      cardStyle = b.dataset.style;
      if (document.getElementById('canvas-wrap').style.display === 'block') document.getElementById('btn-generate').click();
    });
  });

  function updateGenLabel() {
    var b = document.getElementById('btn-generate');
    if (!b) return;
    var p = currentYear === 'all' ? 'All Time' : String(currentYear);
    if (currentMonth !== 0) p = AppUtils.monthName(currentMonth) + (currentYear === 'all' ? '' : ' ' + currentYear);
    b.textContent = '✨ Generate Wrapped · ' + p;
  }

  function generateAestheticCard() {
    var entries = window.currentStatsEntries || [];
    if (!entries.length) { AppUtils.showToast('No entries to generate.'); return; }
    var G = statsTab === 'games';
    var C = G
      ? { bg: '#7c5cff', panel: '#1f1f22', ink: '#ffffff', text: '#f2f2f2', mute: '#9a9aa2' }
      : { bg: '#e0b93a', panel: '#f1efe6', ink: '#151515', text: '#ffffff', mute: '#b8b8c0' };
    var lab = currentYear === 'all' ? 'ALL TIME' : String(currentYear);
    if (currentMonth !== 0) lab = AppUtils.monthShort(currentMonth).toUpperCase() + (currentYear === 'all' ? '' : ' ' + currentYear);

    var wrap = document.getElementById('canvas-wrap');
    wrap.style.display = 'block'; wrap.innerHTML = '';
    var W = 1080, H = 1920;
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.style.width = '100%'; canvas.style.borderRadius = '20px';
    wrap.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    document.getElementById('btn-download').style.display = 'none';

    var rate = function (e) { return (G ? e.gameRating : e.rating) || 0; };
    var vol = function (e) { return G ? (e.playtime || 0) : (e.runtime || 0); };
    var pool = G ? entries.filter(function (e) { return e.completionStatus === 'completed' && e.gameRating; }) : [];
    if (!pool.length) pool = entries.filter(function (e) { return rate(e); });
    if (!pool.length) pool = entries;
    var top = pool.slice().sort(function (a, b) { return rate(b) - rate(a) || vol(b) - vol(a); }).slice(0, 5);

    var gc = {};
    entries.forEach(function (e) {
      var gs = (e.genres && e.genres.length) ? e.genres : (e.category ? [e.category] : []);
      gs.forEach(function (g) { gc[g] = (gc[g] || 0) + 1; });
    });
    var gk = Object.keys(gc).sort(function (a, b) { return gc[b] - gc[a]; }).slice(0, 5);

    var mins = entries.reduce(function (s, e) { return s + (G ? (e.playtime || 0) * 60 : (e.runtime || 0)); }, 0);
    var rated = entries.filter(function (e) { return rate(e); });
    var avg = rated.length ? rated.reduce(function (s, e) { return s + rate(e); }, 0) / rated.length : 0;

    function trunc(t, mw) {
      var s = t;
      while (ctx.measureText(s).width > mw && s.length > 3) s = s.slice(0, -1);
      return s !== t ? s.trim() + '…' : s;
    }
    function loadImg(url) {
      return new Promise(function (res) {
        if (!url) return res(null);
        var im = new Image(); im.crossOrigin = 'anonymous';
        im.onload = function () { res(im); }; im.onerror = function () { res(null); };
        im.src = AppUtils.getCanvasSafeUrl(url);
      });
    }

    Promise.all(['800 60px Inter', '700 34px Inter', '500 26px Inter'].map(function (f) {
      return document.fonts.load(f).catch(function () {});
    })).then(function () {
      return loadImg(AppUtils.getPosterUrl(top[0].poster));
    }).then(function (img) {
      ctx.textAlign = 'left';
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, 1040);
      blurDraw(ctx, img, 0, 0, W, 1040, 0.35);
      ctx.fillStyle = '#0e0e10'; ctx.fillRect(0, 1040, W, H - 1040);
      blurDraw(ctx, img, 0, 1040, W, H - 1040, 0.55);
      ctx.fillStyle = 'rgba(10,10,12,0.45)'; ctx.fillRect(0, 1040, W, H - 1040);
      glass(ctx, 40, 1080, W - 80, 800, 32, 0.07);

      // checker frame
      var fx = 350, fy = 90, cs = 31;
      for (var r = 0; r < 29; r++) for (var c = 0; c < 20; c++) {
        ctx.fillStyle = (r + c) % 2 ? '#f1efe6' : '#111111';
        ctx.fillRect(fx + c * cs, fy + r * cs, cs, cs);
      }
      // poster
      var ix = 380, iy = 120, iw = 560, ih = 839;
      ctx.fillStyle = '#f1efe6'; ctx.fillRect(ix - 6, iy - 6, iw + 12, ih + 12);
      ctx.save();
      ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip();
      if (img) {
        var s = Math.max(iw / img.width, ih / img.height);
        ctx.drawImage(img, ix + (iw - img.width * s) / 2, iy + (ih - img.height * s) / 2, img.width * s, img.height * s);
      } else { ctx.fillStyle = '#1e1e1e'; ctx.fillRect(ix, iy, iw, ih); }
      ctx.restore();

      // rotated period text
      var size = 250;
      ctx.font = '800 ' + size + 'px Inter, sans-serif';
      var mw = ctx.measureText(lab).width;
      if (mw > 860) size = Math.floor(size * 860 / mw);
      ctx.font = '800 ' + size + 'px Inter, sans-serif';
      ctx.save();
      ctx.translate(270, 990); ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = C.ink; ctx.fillText(lab, 0, 0);
      ctx.restore();
      ctx.fillStyle = C.ink; ctx.font = '800 28px Inter, sans-serif';
      ctx.fillText('PLAYLOG', 60, 80);

      // columns
      var y0 = 1130;
      ctx.fillStyle = C.mute; ctx.font = '500 26px Inter, sans-serif';
      ctx.fillText(G ? 'Top Games' : 'Top Titles', 80, y0);
      ctx.fillText('Top Genres', 580, y0);
      ctx.fillStyle = C.text; ctx.font = '700 34px Inter, sans-serif';
      top.forEach(function (e, i) { ctx.fillText((i + 1) + '  ' + trunc(e.title, 380), 80, y0 + 60 + i * 58); });
      gk.forEach(function (g, i) { ctx.fillText((i + 1) + '  ' + trunc(g, 380), 580, y0 + 60 + i * 58); });

      // big stats
      var sy = 1530;
      ctx.fillStyle = C.mute; ctx.font = '500 26px Inter, sans-serif';
      ctx.fillText(G ? 'Hours Played' : 'Hours Watched', 80, sy);
      ctx.fillText('Avg Rating', 580, sy);
      ctx.fillStyle = C.text; ctx.font = '800 76px Inter, sans-serif';
      ctx.fillText(trunc(AppUtils.formatHours(mins), 440), 80, sy + 90);
      ctx.fillText(avg ? avg.toFixed(1) + (G ? '/10' : '/5') : '—', 580, sy + 90);

      // footer
      ctx.font = '800 30px Inter, sans-serif';
      ctx.fillText('PLAYLOG', 80, 1850);
      ctx.textAlign = 'right';
      ctx.fillText('WRAPPED · ' + lab, 1000, 1850);
      ctx.textAlign = 'left';

      document.getElementById('btn-download').style.display = 'block';
    });
  }

  function generateWrappedCard2() {
    var entries = window.currentStatsEntries || [];
    if (!entries.length) { AppUtils.showToast('No entries to generate.'); return; }
    var G = statsTab === 'games';
    var accent = G ? '#a78bfa' : '#f4d15c';
    var dim = G ? 'rgba(124,58,237,0.35)' : 'rgba(201,168,76,0.35)';
    var period = currentYear === 'all' ? 'All Time' : String(currentYear);
    if (currentMonth !== 0) period = AppUtils.monthName(currentMonth) + (currentYear === 'all' ? '' : ' ' + currentYear);

    var wrap = document.getElementById('canvas-wrap');
    wrap.style.display = 'block'; wrap.innerHTML = '';
    var W = 1080, H = 1920;
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.style.width = '100%'; canvas.style.borderRadius = '20px';
    wrap.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    document.getElementById('btn-download').style.display = 'none';

    var rate = function (e) { return (G ? e.gameRating : e.rating) || 0; };
    var vol = function (e) { return G ? (e.playtime || 0) : (e.runtime || 0); };
    var pool = G ? entries.filter(function (e) { return e.completionStatus === 'completed' && e.gameRating; }) : [];
    if (!pool.length) pool = entries.filter(function (e) { return rate(e); });
    if (!pool.length) pool = entries;
    var top = pool.slice().sort(function (a, b) { return rate(b) - rate(a) || vol(b) - vol(a); }).slice(0, 3);

    function loadImg(url) {
      return new Promise(function (res) {
        if (!url) return res(null);
        var im = new Image(); im.crossOrigin = 'anonymous';
        im.onload = function () { res(im); }; im.onerror = function () { res(null); };
        im.src = AppUtils.getCanvasSafeUrl(url);
      });
    }
    function trunc(t, mw) {
      var s = t;
      while (ctx.measureText(s).width > mw && s.length > 3) s = s.slice(0, -1);
      return s !== t ? s.trim() + '…' : s;
    }
    function cover(im, x, y, w, h) {
      var s = Math.max(w / im.width, h / im.height);
      ctx.drawImage(im, x + (w - im.width * s) / 2, y + (h - im.height * s) / 2, im.width * s, im.height * s);
    }
    function statCard(x, y, w, h, val, label) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; AppUtils.roundRectPath(ctx, x, y, w, h, 20); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1.5; AppUtils.roundRectPath(ctx, x, y, w, h, 20); ctx.stroke();
      val = String(val);
      ctx.fillStyle = accent;
      ctx.font = 'bold ' + (val.length > 12 ? 26 : val.length > 9 ? 30 : val.length > 6 ? 36 : 44) + 'px Inter, sans-serif';
      ctx.fillText(trunc(val, w - 44), x + 22, y + h - 46);
      ctx.fillStyle = '#999999'; ctx.font = '600 20px Inter, sans-serif';
      ctx.fillText(label.toUpperCase(), x + 22, y + h - 18);
    }

    var fonts = ['800 30px Inter', 'bold 44px Inter', '500 30px Inter', '600 20px Inter'].map(function (f) {
      return document.fonts.load(f).catch(function () {});
    });

    Promise.all(fonts).then(function () {
      return Promise.all(top.map(function (e) { return loadImg(AppUtils.getPosterUrl(e.poster)); }));
    }).then(function (imgs) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#0b0b0d'; ctx.fillRect(0, 0, W, H);

      // HERO
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
      // HEADER + BIG NUMBER
      ctx.fillStyle = accent; ctx.font = '800 30px Inter, sans-serif';
      ctx.fillText((G ? 'GAMES WRAPPED' : 'WRAPPED') + ' · ' + period.toUpperCase(), 60, 80);
      ctx.fillRect(60, heroH + 20, 90, 8);
      ctx.fillStyle = '#ffffff'; ctx.font = '800 130px Inter, sans-serif';
      ctx.fillText(String(entries.length), 58, heroH + 175);
      ctx.fillStyle = '#bbbbbb'; ctx.font = '500 34px Inter, sans-serif';
      ctx.fillText(G ? 'games logged' : 'titles logged', 62, heroH + 215);

      // 3 STATS
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
      var gap = 20, cw = (W - 120 - gap * 2) / 3, sy = heroH + 260;
      stats.forEach(function (s, i) { statCard(60 + i * (cw + gap), sy, cw, 140, s[0], s[1]); });

      // TOP 3
      var ly = 1090;
      ctx.fillStyle = accent; ctx.font = '800 28px Inter, sans-serif';
      ctx.fillText('TOP ' + top.length, 60, ly);
      top.forEach(function (e, i) {
        var y = ly + 25 + i * 150;
        glass(ctx, 60, y, W - 120, 130, 20, 0.08);
        ctx.save();
        AppUtils.roundRectPath(ctx, 72, y + 10, 73, 110, 10); ctx.clip();
        if (imgs[i]) cover(imgs[i], 72, y + 10, 73, 110); else { ctx.fillStyle = '#1e1e1e'; ctx.fillRect(72, y + 10, 73, 110); }
        ctx.restore();
        ctx.fillStyle = accent; ctx.font = '800 54px Inter, sans-serif';
        ctx.fillText(String(i + 1), 170, y + 82);
        ctx.fillStyle = '#ffffff'; ctx.font = '700 34px Inter, sans-serif';
        ctx.fillText(trunc(e.title, W - 60 - 240 - 30), 240, y + 58);
        var r = rate(e);
        var line = (G ? (r ? r + '/10' : 'Unrated') : (r ? AppUtils.ratingToEmoji(r) + ' ' + r + '/5' : 'Unrated'))
          + ' · ' + (G ? (e.completionStatus || 'logged') : (e.type || '')).toUpperCase();
        ctx.fillStyle = '#cccccc'; ctx.font = '500 26px Inter, sans-serif';
        ctx.fillText(line, 240, y + 100);
      });

      // MONTH STRIP
      var mc = [], mx = 0, i;
      for (i = 0; i < 12; i++) mc.push(0);
      entries.forEach(function (e) { if (e.monthWatched) mc[e.monthWatched - 1]++; });
      mc.forEach(function (c) { if (c > mx) mx = c; });
      if (mx > 0) {
        ctx.fillStyle = accent; ctx.font = '800 28px Inter, sans-serif';
        glass(ctx, 40, 1585, W - 80, 275, 24, 0.06);
        ctx.fillStyle = accent;
        ctx.fillText('ACTIVITY BY MONTH', 60, 1620);
        var base = 1800, slot = (W - 120) / 12, bw = 44, letters = 'JFMAMJJASOND';
        ctx.textAlign = 'center';
        mc.forEach(function (c, m) {
          var bh = Math.max(c ? 6 : 3, Math.round(c / mx * 100));
          var bx = 60 + m * slot + (slot - bw) / 2;
          ctx.fillStyle = c === mx ? accent : dim;
          AppUtils.roundRectPath(ctx, bx, base - bh, bw, bh, 8); ctx.fill();
          if (c) { ctx.fillStyle = '#dddddd'; ctx.font = '600 20px Inter, sans-serif'; ctx.fillText(String(c), bx + bw / 2, base - bh - 10); }
          ctx.fillStyle = '#999999'; ctx.font = '500 20px Inter, sans-serif';
          ctx.fillText(letters[m], bx + bw / 2, base + 34);
        });
        ctx.textAlign = 'left';
      }

      // FOOTER
      ctx.fillStyle = '#666666'; ctx.font = '500 24px Inter, sans-serif';
      ctx.fillText('Generated with Playlog', 60, H - 40);

      document.getElementById('btn-download').style.display = 'block';
    });
  }

  function generateWrappedCard() {

    var entries = window.currentStatsEntries || [];
    if (entries.length === 0) {
      AppUtils.showToast('No entries to generate.');
      return;
    }

    var isGames = statsTab === 'games';
    var accent = isGames ? '#a78bfa' : '#f4d15c';
    var accentDim = isGames ? 'rgba(124,58,237,0.35)' : 'rgba(201,168,76,0.35)';

    var periodLabel = currentYear === 'all' ? 'All Time' : String(currentYear);
    if (currentMonth !== 0) periodLabel = AppUtils.monthName(currentMonth) + ' ' + currentYear;

    var wrap = document.getElementById('canvas-wrap');
    wrap.style.display = 'block';
    wrap.innerHTML = '';

    var W = 1080, H = 1920;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = '100%';
    canvas.style.borderRadius = '20px';
    wrap.appendChild(canvas);
    var ctx = canvas.getContext('2d');

    var sorted = entries.slice().sort(function (a, b) {
      var ra = isGames ? (a.gameRating || 0) : (a.rating || 0);
      var rb = isGames ? (b.gameRating || 0) : (b.rating || 0);
      return rb - ra;
    });
    var top = sorted[0];
    var heroEntries = sorted.slice(0, 3);

    document.getElementById('btn-download').style.display = 'none';

    function loadImg(url) {
      return new Promise(function (resolve) {
        if (!url) return resolve(null);
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () { resolve(img); };
        img.onerror = function () { resolve(null); };
        img.src = AppUtils.getCanvasSafeUrl(url);
      });
    }

    function truncate(text, maxWidth) {
      var t = text;
      while (ctx.measureText(t).width > maxWidth && t.length > 3) t = t.slice(0, -1);
      if (t !== text) t = t.trim() + '…';
      return t;
    }

    function drawStatCard(cx, cy, cw, ch, value, label) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      AppUtils.roundRectPath(ctx, cx, cy, cw, ch, 20);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1.5;
      AppUtils.roundRectPath(ctx, cx, cy, cw, ch, 20);
      ctx.stroke();

      ctx.fillStyle = accent;
      var valText = String(value);
      var fontSize = valText.length > 9 ? 30 : valText.length > 6 ? 36 : 44;
      ctx.font = 'bold ' + fontSize + 'px Inter, sans-serif';
      ctx.fillText(truncate(valText, cw - 44), cx + 22, cy + ch - 46);

      ctx.fillStyle = '#999999';
      ctx.font = '600 20px Inter, sans-serif';
      ctx.fillText(label.toUpperCase(), cx + 22, cy + ch - 18);
    }

    Promise.all(heroEntries.map(function (e) { return loadImg(AppUtils.getPosterUrl(e.poster)); }))
      .then(function (heroImgs) {
        return loadImg(AppUtils.getPosterUrl(top.poster)).then(function (topImg) {
          return { heroImgs: heroImgs, topImg: topImg };
        });
      })
      .then(function (imgs) {

        // ===== BASE =====
        ctx.fillStyle = '#0b0b0d';
        ctx.fillRect(0, 0, W, H);

        // ===== HERO STRIP (top ~600px): fanned-out posters =====
        var heroH = 620;
        ctx.save();
        AppUtils.roundRectPath(ctx, 0, 0, W, heroH + 60, 0);
        ctx.clip();

        var tileW = 420, tileH = 600;
        var positions = [
          { x: W / 2 - tileW / 2 - 210, y: 40, rot: -0.09, z: 1 },
          { x: W / 2 - tileW / 2, y: 10, rot: 0, z: 3 },
          { x: W / 2 - tileW / 2 + 210, y: 40, rot: 0.09, z: 2 }
        ];
        positions.forEach(function (pos, i) {
          var img = imgs.heroImgs[i];
          ctx.save();
          ctx.translate(pos.x + tileW / 2, pos.y + tileH / 2);
          ctx.rotate(pos.rot);
          ctx.translate(-tileW / 2, -tileH / 2);
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 40;
          ctx.shadowOffsetY = 20;
          if (img) {
            AppUtils.roundRectPath(ctx, 0, 0, tileW, tileH, 24);
            ctx.clip();
            var scale = Math.max(tileW / img.width, tileH / img.height);
            var dw = img.width * scale, dh = img.height * scale;
            ctx.drawImage(img, (tileW - dw) / 2, (tileH - dh) / 2, dw, dh);
          } else {
            ctx.fillStyle = '#1e1e1e';
            AppUtils.roundRectPath(ctx, 0, 0, tileW, tileH, 24);
            ctx.fill();
          }
          ctx.restore();
        });

        // fade hero into base panel
        var fade = ctx.createLinearGradient(0, heroH - 260, 0, heroH + 60);
        fade.addColorStop(0, 'rgba(11,11,13,0)');
        fade.addColorStop(1, 'rgba(11,11,13,1)');
        ctx.fillStyle = fade;
        ctx.fillRect(0, 0, W, heroH + 60);

        // subtle top scrim so header text is legible
        var topScrim = ctx.createLinearGradient(0, 0, 0, 220);
        topScrim.addColorStop(0, 'rgba(0,0,0,0.55)');
        topScrim.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = topScrim;
        ctx.fillRect(0, 0, W, 220);
        ctx.restore();

        // ===== HEADER (over hero) =====
        ctx.textAlign = 'left';
        ctx.fillStyle = accent;
        ctx.font = '800 30px Inter, sans-serif';
        ctx.fillText((isGames ? ' GAMES WRAPPED' : '🎬 WRAPPED') + ' · ' + periodLabel.toUpperCase(), 60, 80);

        // ===== ACCENT DIVIDER =====
        ctx.fillStyle = accent;
        ctx.fillRect(60, heroH + 20, 90, 8);

        // ===== BIG NUMBER =====
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 130px Inter, sans-serif';
        ctx.fillText(String(entries.length), 58, heroH + 175);
        ctx.font = '500 34px Inter, sans-serif';
        ctx.fillStyle = '#bbbbbb';
        ctx.fillText(isGames ? 'games logged' : 'titles logged', 62, heroH + 215);

        // ===== STAT CARD GRID =====
        var totalMinutes = entries.reduce(function (sum, e) {
          return sum + (isGames ? (e.playtime || 0) * 60 : (e.runtime || 0));
        }, 0);
        var totalHoursDisplay = AppUtils.formatHours(totalMinutes);

        var genreCounts = {};
        entries.forEach(function (e) {
          (e.genres || []).forEach(function (g) { genreCounts[g] = (genreCounts[g] || 0) + 1; });
          if (e.category) genreCounts[e.category] = (genreCounts[e.category] || 0) + 1;
        });
        var topGenre = Object.keys(genreCounts).sort(function (a, b) { return genreCounts[b] - genreCounts[a]; })[0] || '—';

        var monthCounts = {};
        entries.forEach(function (e) { if (e.monthWatched) monthCounts[e.monthWatched] = (monthCounts[e.monthWatched] || 0) + 1; });
        var bestMonthNum = Object.keys(monthCounts).sort(function (a, b) { return monthCounts[b] - monthCounts[a]; })[0];
        var bestMonth = bestMonthNum ? AppUtils.monthShort(Number(bestMonthNum)) : '—';

        var ratedEntries = isGames ? entries.filter(function (e) { return e.gameRating; }) : entries.filter(function (e) { return e.rating; });
        var avgRatingVal = ratedEntries.length
          ? ratedEntries.reduce(function (s, e) { return s + (isGames ? e.gameRating : e.rating); }, 0) / ratedEntries.length
          : 0;
        var avgRatingText = avgRatingVal ? (isGames ? avgRatingVal.toFixed(1) + '/10' : avgRatingVal.toFixed(1) + '/5') : '—';

        var statCards = isGames
          ? [
            [totalHoursDisplay, 'Hours Played'],
            [topGenre, 'Top Genre'],
            [bestMonth, 'Most Active'],
            [avgRatingText, 'Avg Rating'],
            [entries.filter(function (e) { return e.completionStatus === 'completed'; }).length + '', 'Completed'],
            [entries.filter(function (e) { return e.completionStatus === 'playing'; }).length + '', 'In Progress']
          ]
          : [
            [totalHoursDisplay, 'Watch Time'],
            [topGenre, 'Top Genre'],
            [bestMonth, 'Best Month'],
            [avgRatingText, 'Avg Rating'],
            [entries.filter(function (e) { return e.type === 'movie'; }).length + '', 'Movies'],
            [entries.filter(function (e) { return e.type === 'series'; }).length + '', 'Series Seasons']
          ];

        var gridTop = heroH + 260;
        var gap = 20;
        var cardW = (W - 60 * 2 - gap * 2) / 3;
        var cardH = 150;
        statCards.forEach(function (card, i) {
          var col = i % 3, row = Math.floor(i / 3);
          var cx = 60 + col * (cardW + gap);
          var cy = gridTop + row * (cardH + gap);
          drawStatCard(cx, cy, cardW, cardH, card[0], card[1]);
        });

        // ===== TOP PICK (with real poster thumbnail) =====
        var topY = gridTop + 2 * (cardH + gap) + 55;

        ctx.fillStyle = accent;
        ctx.font = '800 28px Inter, sans-serif';
        ctx.fillText('⭐ TOP PICK', 60, topY);

        var thumbW = 130, thumbH = 185;
        var thumbX = 60, thumbY = topY + 25;
        ctx.save();
        AppUtils.roundRectPath(ctx, thumbX, thumbY, thumbW, thumbH, 14);
        ctx.clip();
        if (imgs.topImg) {
          var s = Math.max(thumbW / imgs.topImg.width, thumbH / imgs.topImg.height);
          var dw2 = imgs.topImg.width * s, dh2 = imgs.topImg.height * s;
          ctx.drawImage(imgs.topImg, thumbX + (thumbW - dw2) / 2, thumbY + (thumbH - dh2) / 2, dw2, dh2);
        } else {
          ctx.fillStyle = '#1e1e1e';
          ctx.fillRect(thumbX, thumbY, thumbW, thumbH);
        }
        ctx.restore();

        var textX = thumbX + thumbW + 30;
        var textMaxW = W - textX - 60;

        ctx.fillStyle = '#ffffff';
        ctx.font = '800 46px Inter, sans-serif';
        ctx.fillText(truncate(top.title, textMaxW), textX, thumbY + 65);

        ctx.font = '500 28px Inter, sans-serif';
        ctx.fillStyle = '#cccccc';
        var ratingLine = isGames
          ? (top.gameRating ? top.gameRating + '/10' : 'Unrated')
          : (top.rating ? AppUtils.ratingToEmoji(top.rating) + ' ' + top.rating + '/5' : 'Unrated');
        ctx.fillText(ratingLine, textX, thumbY + 110);

        // small accent pill under rating
        ctx.fillStyle = accentDim;
        AppUtils.roundRectPath(ctx, textX, thumbY + 135, 140, 40, 20);
        ctx.fill();
        ctx.fillStyle = accent;
        ctx.font = '700 20px Inter, sans-serif';
        ctx.fillText(isGames ? (top.completionStatus || 'Logged').toUpperCase() : (top.type || '').toUpperCase(), textX + 18, thumbY + 161);

        // ===== FOOTER =====
        ctx.fillStyle = '#666666';
        ctx.font = '500 24px Inter, sans-serif';
        ctx.fillText('Generated with Playlog', 60, H - 45);

        document.getElementById('btn-download').style.display = 'block';
      });

  }

});