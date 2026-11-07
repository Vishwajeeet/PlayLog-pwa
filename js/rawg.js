// RAWG API wrapper for game search and details
window.AppRAWG = {

  _fetch: function(endpoint) {
    var url = APP_CONFIG.rawg.baseUrl + endpoint;
    url += (endpoint.indexOf('?') > -1 ? '&' : '?') + 'key=' + APP_CONFIG.rawg.key;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer;
    var request = fetch(url, controller ? { signal: controller.signal } : undefined).then(function(r) {
      if (!r.ok) throw new Error('RAWG error ' + r.status);
      return r.json();
    });
    var timeout = new Promise(function(resolve, reject) {
      timer = setTimeout(function() {
        if (controller) controller.abort();
        reject(new Error('RAWG request timed out after 20 seconds.'));
      }, 20000);
    });
    return Promise.race([request, timeout]).then(function(data) {
      clearTimeout(timer);
      return data;
    }, function(err) {
      clearTimeout(timer);
      throw err;
    });
  },

  searchGames: function(query) {
    return this._fetch(
      '/games?search=' + encodeURIComponent(query) + '&page_size=8&search_exact=false'
    ).then(function(data) {
      return (data.results || [])
        .filter(function(r) { return r.name; })
        .map(function(r) {
          return {
            rawgId: r.id,
            title: r.name,
            releaseYear: r.released ? r.released.slice(0, 4) : '',
            poster: r.background_image || null,
            genres: (r.genres || []).map(function(g) { return g.name; }),
            type: 'game'
          };
        });
    });
  },

  getGameDetails: function(rawgId) {
    return this._fetch('/games/' + rawgId)
      .then(function(data) {
        return {
          genres: (data.genres || []).map(function(g) { return g.name; }),
          playtime: data.playtime || 0,
          description: data.description_raw
            ? data.description_raw.slice(0, 200) : ''
        };
      });
  },

  refreshPendingEntries: function(uid, entries) {
    var pending = entries.filter(function(entry) {
      return entry.type === 'game' && entry.rawgPending && entry.title;
    });
    var next = 0;
    var workers = [];

    function normalize(title) {
      return String(title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function refreshNext() {
      var index = next++;
      if (index >= pending.length) return Promise.resolve([]);
      var entry = pending[index];
      return this.searchGames(entry.title).then(function(results) {
        var target = normalize(entry.title);
        var match = results.filter(function(result) {
            return normalize(result.title) === target;
        })[0];
        if (!match) return null;

        var genres = match.genres || [];
        var metadata = {
            title: match.title,
            rawgId: match.rawgId,
            poster: match.poster || entry.poster || null,
            releaseYear: parseInt(match.releaseYear, 10) || null,
            genres: genres,
            category: genres[0] || null,
            rawgPending: false
        };
        return AppDB.updateEntry(uid, entry.id, metadata).then(function() {
            return Object.assign({ id: entry.id }, metadata);
        });
      }.bind(this)).catch(function(err) {
        console.error('Could not refresh RAWG metadata for "' + entry.title + '".', err);
        return null;
      }).then(function(updated) {
        return refreshNext.call(this).then(function(rest) {
            return updated ? [updated].concat(rest) : rest;
        });
      }.bind(this));
    }

    for (var i = 0; i < Math.min(2, pending.length); i++) {
      workers.push(refreshNext.call(this));
    }
    return Promise.all(workers).then(function(results) {
      return results.reduce(function(all, batch) { return all.concat(batch); }, []);
    });
  }

};