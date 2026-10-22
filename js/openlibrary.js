window.AppOL = {
  base: 'https://openlibrary.org',
  cover: function (id) { return id ? 'https://covers.openlibrary.org/b/id/' + id + '-M.jpg' : null; },
  map: function (d) {
    var g = AppOL.genres(d.subject || []);
    return { olKey: d.key || null, title: d.title || '', author: (d.author_name || [])[0] || '',
      year: d.first_publish_year || null, poster: AppOL.cover(d.cover_i),
      pages: d.number_of_pages_median || null, genres: g.genres, fiction: g.fiction };
  },
  _get: function (u) {
    return fetch(u).then(function (r) { if (!r.ok) throw new Error('OL ' + r.status); return r.json(); });
  },
  search: function (q, o) {
    o = o || {};
    var p = 'fields=key,title,author_name,first_publish_year,cover_i,number_of_pages_median,subject&limit=' + (o.limit || 8);
    p += o.author ? '&title=' + encodeURIComponent(q) + '&author=' + encodeURIComponent(o.author) : '&q=' + encodeURIComponent(q);
    return AppOL._get(AppOL.base + '/search.json?' + p).then(function (r) {
      return (r.docs || []).filter(function (d) { return d.title; }).map(AppOL.map);
    });
  },
  rating: function (key) {
    if (!/^\/works\/OL\d+W$/.test(key || '')) return Promise.resolve(null);
    return AppOL._get(AppOL.base + key + '/ratings.json').then(function (r) {
      var s = r.summary || {}, average = Number(s.average), count = Number(s.count);
      return Number.isFinite(average) && average > 0 ? { average: average, count: Number.isFinite(count) ? count : 0 } : null;
    });
  },
  description: function (key) {
    if (!/^\/works\/OL\d+W$/.test(key || '')) return Promise.resolve('');
    return AppOL._get(AppOL.base + key + '.json').then(function (w) {
      var d = w.description; d = d && d.value ? d.value : d;
      return typeof d === 'string' ? d.split(/\r?\n-{3,}|\r?\n\r?\n\[/)[0].trim().slice(0, 900) : '';
    });
  },
  genres: function (subs) {
    var P = [
      ['Fantasy', /fantas|magic|wizard|dragon/], ['Mystery', /mystery|detective|whodunit|crime|murder|sleuth/],
      ['Thriller', /thriller|suspense|espionage|\bspy\b/], ['Science Fiction', /science fiction|sci-fi|dystopi/],
      ['Romance', /romance|love stor/], ['Horror', /horror|ghost|supernatural/], ['Historical', /historical/],
      ['Classics', /classic|english literature|literature, english/], ['Adventure', /adventure/],
      ['Young Adult', /young adult|juvenile|teen/], ['Children', /children|picture book/],
      ['Biography', /biograph|memoir/], ['History', /^history(?!.*criticism)/],
      ['Self-Help', /self-help|self help|psycholog|personal development/], ['Philosophy', /philosoph|religion|spiritual/],
      ['Science', /\bscience\b(?! fiction)|mathemat|physics|biology|medicine/], ['Business', /business|econom|financ|invest|management/],
      ['Poetry', /poetry|poems/], ['Humor', /humou?r|comedy|satire/], ['Graphic Novel', /graphic novel|comics|manga/]
    ], NF = { Biography: 1, History: 1, 'Self-Help': 1, Philosophy: 1, Science: 1, Business: 1 }, c = {}, fic = false;
    subs.slice(0, 80).forEach(function (s) {
      s = String(s).toLowerCase();
      if (/fiction|novel|stories/.test(s.replace(/non-?fiction/g, ''))) fic = true;
      P.forEach(function (p) { if (p[1].test(s)) c[p[0]] = (c[p[0]] || 0) + 1; });
    });
    var g = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).slice(0, 3);
    return { genres: g, fiction: fic || !(g.length && NF[g[0]]) };
  }
};