window.AppOL = {
  base: 'https://openlibrary.org',
  cover: function (id) { return id ? 'https://covers.openlibrary.org/b/id/' + id + '-M.jpg' : null; },
  map: function (d) {
    var g = AppOL.genres(d.subject || []);
    var first = function (value) { return Array.isArray(value) ? value[0] : value; };
    var subjects = Array.isArray(d.subject) ? d.subject : [];
    var seriesSubject = subjects.map(String).filter(function (subject) { return /^Series?\s*:/i.test(subject); })[0] || '';
    var subjectSeriesName = seriesSubject.replace(/^Series?\s*:/i, '').trim();
    var possibleCharacterSubject = !seriesSubject && subjects.map(String).filter(function (subject) {
      return /\(Fictitious character\)$/i.test(subject);
    })[0] || '';
    var characterName = possibleCharacterSubject.replace(/\s*\(Fictitious character\)$/i, '').trim();
    var characterParts = /^([^,]+),\s*(.+)$/.exec(characterName);
    if (characterParts) characterName = characterParts[2] + ' ' + characterParts[1];
    var supportedCharacters = { 'philip marlowe': 'Philip Marlowe', 'sherlock holmes': 'Sherlock Holmes', 'harry potter': 'Harry Potter' };
    characterName = supportedCharacters[characterName.toLowerCase()] || '';
    var characterSubject = characterName ? possibleCharacterSubject : '';
    var authorNames = Array.isArray(d.author_name) ? d.author_name : [];
    var seriesAuthor = authorNames.filter(function (author) { return /j\.?\s*k\.?\s*rowling/i.test(author); })[0] || authorNames[0] || '';
    var characterKey = characterName === 'Harry Potter' ? 'series-name:' + characterName :
      characterSubject && seriesAuthor
        ? 'character:' + encodeURIComponent(characterSubject) + '|' + encodeURIComponent(seriesAuthor)
        : null;
    var seriesPosition = first(d.series_position), positionText = seriesPosition == null ? '' : String(seriesPosition).trim();
    return { olKey: d.key || null, title: d.title || '', author: (d.author_name || [])[0] || '',
      year: d.first_publish_year || null, poster: AppOL.cover(d.cover_i),
      pages: d.number_of_pages_median || null, genres: g.genres, fiction: g.fiction,
      seriesKey: first(d.series_key) || (seriesSubject ? 'subject:' + seriesSubject : characterKey),
      seriesName: first(d.series_name) || (subjectSeriesName
        ? subjectSeriesName.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ')
        : characterName || null),
      seriesPosition: positionText || null,
      seriesNumber: /^\d+(?:\.\d+)?$/.test(positionText) ? Number(positionText) : null,
      seriesMetadataVersion: 3 };
  },
  _get: function (u) {
    return fetch(u).then(function (r) { if (!r.ok) throw new Error('OL ' + r.status); return r.json(); });
  },
  search: function (q, o) {
    o = o || {};
    var p = 'fields=key,title,author_name,first_publish_year,cover_i,number_of_pages_median,subject,series_key,series_name,series_position&limit=' + (o.limit || 8);
    p += o.author ? '&title=' + encodeURIComponent(q) + '&author=' + encodeURIComponent(o.author) : '&q=' + encodeURIComponent(q);
    return AppOL._get(AppOL.base + '/search.json?' + p).then(function (r) {
      return (r.docs || []).filter(function (d) { return d.title; }).map(AppOL.map);
    });
  },
  seriesMetadata: function (keys) {
    var validKeys = keys.filter(function (key) { return /^\/works\/OL\d+W$/.test(key || ''); });
    if (!validKeys.length) return Promise.resolve({});
    var query = validKeys.map(function (key) { return 'key:' + key; }).join(' OR ');
    var url = AppOL.base + '/search.json?q=' + encodeURIComponent(query) +
      '&fields=key,author_name,first_publish_year,subject,series_key,series_name,series_position&limit=' + validKeys.length;
    return AppOL._get(url).then(function (response) {
      var metadata = {};
      (response.docs || []).forEach(function (doc) {
        var book = AppOL.map(doc);
        metadata[doc.key] = {
          seriesKey: book.seriesKey,
          seriesName: book.seriesName,
          seriesPosition: book.seriesPosition,
          seriesNumber: book.seriesNumber,
          releaseYear: book.year
        };
      });
      return metadata;
    });
  },
  seriesBooks: function (key) {
    var subjectSeries = /^subject:(.+)$/i.exec(key || ''), subjectOrder = false, characterSeriesName = '', url;
    if (/^OL\d+L$/.test(key || '')) {
      var query = 'series_key:' + key;
      url = AppOL.base + '/search.json?q=' + encodeURIComponent(query) +
        '&fields=key,title,author_name,first_publish_year,cover_i,subject,series_key,series_name,series_position&limit=100';
    } else if (/^series-name:.+$/i.test(key || '')) {
      var nameQuery = 'series_name:"' + key.slice('series-name:'.length).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
      url = AppOL.base + '/search.json?q=' + encodeURIComponent(nameQuery) +
        '&fields=key,title,author_name,first_publish_year,cover_i,subject,series_key,series_name,series_position&limit=100';
    } else if (subjectSeries && !/[\r\n"]/.test(subjectSeries[1])) {
      subjectOrder = true;
      var taggedSubject = /^(Series?)\s*:\s*(.*)$/i.exec(subjectSeries[1]);
      var subjectType = taggedSubject ? taggedSubject[1].toLowerCase() : 'series';
      var subjectName = taggedSubject ? taggedSubject[2] : subjectSeries[1];
      var slug = (subjectType + ':' + subjectName).toLowerCase().replace(/[\s_]+/g, '-');
      url = AppOL.base + '/subjects/' + encodeURIComponent(slug) + '.json?details=true&limit=100';
    } else if (/^character:/i.test(key || '')) {
      var parts = key.slice('character:'.length).split('|');
      var characterSubject, author;
      try {
        characterSubject = decodeURIComponent(parts[0] || '');
        author = decodeURIComponent(parts[1] || '');
      } catch (error) {
        return Promise.reject(new Error('Invalid Open Library character series key.'));
      }
      if (!characterSubject || !author || /[\r\n"]/.test(characterSubject + author)) {
        return Promise.reject(new Error('Invalid Open Library character series key.'));
      }
      var characterName = characterSubject.replace(/\s*\(Fictitious character\)$/i, '').trim();
      var characterParts = /^([^,]+),\s*(.+)$/.exec(characterName);
      if (characterParts) characterName = characterParts[2] + ' ' + characterParts[1];
      characterSeriesName = { 'philip marlowe': 'Philip Marlowe', 'sherlock holmes': 'Sherlock Holmes' }[characterName.toLowerCase()] || '';
      if (!characterSeriesName) return Promise.reject(new Error('Unsupported Open Library character series.'));
      var quote = function (value) { return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; };
      var characterQuery = 'subject:' + quote(characterSubject) + ' AND author:' + quote(author) + ' AND language:eng';
      if (characterSeriesName === 'Sherlock Holmes') {
        characterQuery = '(' + characterQuery + ') OR (title:"A Study in Scarlet" AND author:"Arthur Conan Doyle")' +
          ' OR (title:"The Case-Book of Sherlock Holmes" AND author:"Arthur Conan Doyle")';
      }
      url = AppOL.base + '/search.json?q=' + encodeURIComponent(characterQuery) +
        '&fields=key,title,author_name,first_publish_year,cover_i,subject,series_key,series_name,series_position&limit=100';
    } else return Promise.reject(new Error('Invalid Open Library series key.'));
    var characterSeries = /^character:/i.test(key || '');
    var canonicalCharacterTitles = {
      'Philip Marlowe': ['big sleep', 'farewell my lovely', 'high window', 'lady in the lake', 'little sister',
        'long goodbye', 'playback', 'trouble is my business', 'poodle springs'],
      'Sherlock Holmes': ['study in scarlet', 'sign of four', 'adventures of sherlock holmes',
        'memoirs of sherlock holmes', 'hound of the baskervilles', 'return of sherlock holmes',
        'valley of fear', 'his last bow', 'casebook of sherlock holmes']
    };
    var knownSubjectOrder = {
      'series:thursday-murder-club': ['The Thursday Murder Club', 'The Man Who Died Twice', 'The Bullet That Missed',
        'The Last Devil to Die', 'The Impossible Fortune'],
      'serie:hawthorne-&-horowitz': ['The Word is Murder', 'The Sentence is Death', 'A Line to Kill',
        'The Twist of a Knife', 'Close to Death']
    };
    var subjectOrderTitles = subjectSeries && knownSubjectOrder[subjectSeries[1].toLowerCase()];
    var seriesTitleKey = function (title) {
      return String(title || '').toLowerCase().replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\([^)]*\)/g, '')
        .replace(/-/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/^(?:the|a|an)\s+/, '')
        .replace(/\s+(?:the|a|an)$/, '').replace(/\s+/g, ' ').trim();
    };
    var characterTitleKey = function (title) {
      return String(title || '').toLowerCase().replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\([^)]*\)/g, '')
        .replace(/-/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/^(?:the|a|an)\s+/, '')
        .replace(/\s+(?:the|a|an)$/, '').replace(/\s+/g, ' ').trim().replace(/\bcase book\b/g, 'casebook');
    };
    return AppOL._get(url).then(function (response) {
      var seen = Object.create(null), seenTitles = Object.create(null);
      var docs = subjectOrder ? (response.works || []).map(function (work) {
        return { key: work.key, title: String(work.title || '').replace(/\s+CD$/i, ''), author_name: (work.authors || []).map(function (author) { return author.name; }),
          first_publish_year: work.first_publish_year, cover_i: work.cover_id, subject: work.subject };
      }) : response.docs || [];
      var books = docs.map(AppOL.map).filter(function (book) {
        var position = book.seriesPosition || '';
        if (!book.olKey || !book.title || /^\d+(?:\.\d+)?\s*[-–—]\s*\d+/.test(position)) return false;
        if (characterSeries && /\b(?:adaptation|annotated|complete|collected|collection|omnibus|guide|history|later novels|novels and other writings|anthology|bundle|boxed set|selected stories|short stories)\b|[;\/]/i.test(book.title)) return false;
        if (characterSeries) {
          var normalizedTitle = characterTitleKey(book.title);
          if (canonicalCharacterTitles[characterSeriesName].indexOf(normalizedTitle) === -1) return false;
        }
        if (seen[book.olKey]) return false;
        if (characterSeries) {
          var titleKey = characterTitleKey(book.title);
          if (seenTitles[titleKey]) return false;
          seenTitles[titleKey] = true;
        }
        seen[book.olKey] = true;
        return true;
      });
      if (characterSeries) {
        var titleOrder = canonicalCharacterTitles[characterSeriesName].map(characterTitleKey);
        books.sort(function (a, b) { return titleOrder.indexOf(characterTitleKey(a.title)) - titleOrder.indexOf(characterTitleKey(b.title)); });
        books.forEach(function (book, index) { book.seriesNumber = index + 1; });
        return books;
      }
      if (subjectOrder) {
        if (subjectOrderTitles) {
          books.sort(function (a, b) {
            var ai = subjectOrderTitles.map(seriesTitleKey).indexOf(seriesTitleKey(a.title));
            var bi = subjectOrderTitles.map(seriesTitleKey).indexOf(seriesTitleKey(b.title));
            return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
          });
        } else {
          books.sort(function (a, b) {
            var ay = Number(a.year) || Number.MAX_SAFE_INTEGER;
            var by = Number(b.year) || Number.MAX_SAFE_INTEGER;
            return ay - by || a.title.localeCompare(b.title);
          });
        }
        books.forEach(function (book, index) { if (!Number(book.seriesNumber)) book.seriesNumber = index + 1; });
        return books;
      }
      return books.sort(function (a, b) {
        var ay = Number(a.year) || Number.MAX_SAFE_INTEGER;
        var by = Number(b.year) || Number.MAX_SAFE_INTEGER;
        return ay - by || (Number(a.seriesNumber) || Number.MAX_SAFE_INTEGER) -
          (Number(b.seriesNumber) || Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title);
      });
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