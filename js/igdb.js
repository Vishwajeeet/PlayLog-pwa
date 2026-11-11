// IGDB API wrapper for game search and details
window.AppIGDB = {

  _fetch: function(params) {
    var url = '/api/igdb?' + new URLSearchParams(params).toString();
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer;
    var request = fetch(url, controller ? { signal: controller.signal } : undefined).then(function(r) {
      if (!r.ok) throw new Error('IGDB error ' + r.status);
      return r.json();
    });
    var timeout = new Promise(function(resolve, reject) {
      timer = setTimeout(function() {
        if (controller) controller.abort();
        reject(new Error('IGDB request timed out after 20 seconds.'));
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
    return this._fetch({ search: query }).then(function(data) {
      return data.results || [];
    });
  },

  getGameDetails: function(igdbId) {
    return this._fetch({ id: String(igdbId) })
      .then(function(data) {
        if (!data) throw new Error('IGDB game was not found.');
        return {
          genres: data.genres || [],
          playtime: 0,
          description: ''
        };
      });
  },

  refreshPendingEntries: function(uid, entries) {
    var pending = entries.filter(function(entry) {
      return entry.type === 'game' &&
        (entry.igdbPending || entry.rawgPending) && entry.title;
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
            igdbId: match.igdbId,
            poster: match.poster || entry.poster || null,
            releaseYear: parseInt(match.releaseYear, 10) || null,
            genres: genres,
            category: genres[0] || null,
            igdbPending: false,
            rawgPending: false
        };
        return AppDB.updateEntry(uid, entry.id, metadata).then(function() {
            return Object.assign({ id: entry.id }, metadata);
        });
      }.bind(this)).catch(function(err) {
        console.error('Could not refresh IGDB metadata for "' + entry.title + '".', err);
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