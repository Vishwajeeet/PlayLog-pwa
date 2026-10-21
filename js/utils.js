// Utility functions for DOM manipulation, formatting, and helpers
if ('serviceWorker' in navigator) {
  var _hadCtl = !!navigator.serviceWorker.controller, _rl = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (_hadCtl && !_rl) { _rl = true; location.reload(); }
  });
}

window.AppUtils = {

  roundRectPath: function(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },

  showToast: function(message, duration) {
    duration = duration || 2500;
    var toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function() {
      toast.classList.remove('show');
    }, duration);
  },

  formatHours: function(totalMinutes) {
    if (!totalMinutes || totalMinutes <= 0) return '0m';
    var h = Math.floor(totalMinutes / 60);
    var m = totalMinutes % 60;
    if (h === 0) return m + 'm';
    if (m === 0) return h + 'h';
    return h + 'h ' + m + 'm';
  },

  ratingToEmoji: function(rating) {
    var map = { 1:'😭', 2:'🙁', 3:'😐', 4:'😊', 5:'🤩' };
    return map[rating] || '😐';
  },

  monthName: function(num) {
    var months = ['January','February','March','April',
      'May','June','July','August','September',
      'October','November','December'];
    return months[num - 1] || '';
  },

  monthShort: function(num) {
    var months = ['Jan','Feb','Mar','Apr','May','Jun',
      'Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[num - 1] || '';
  },

    getPosterUrl: function(path) {
    if (!path) return null;
    var w = arguments[1];
    if (path.startsWith('http')) {
      if (path.indexOf('media.rawg.io') > -1) return path.replace(/\/media\/(games|screenshots)\//, '/media/resize/' + (w && w <= 200 ? 200 : 640) + '/-/$1/');
      return path;
    }
    if (w) return APP_CONFIG.tmdb.posterBase.replace('/w500', '/w' + w) + path;
    return APP_CONFIG.tmdb.posterBase + path;
  },

  // Proxies external images through a CORS-friendly service so they can
  // be drawn onto a <canvas> and exported (RAWG's CDN has no CORS headers).
  getCanvasSafeUrl: function(url) {
    if (!url) return null;
    var bare = url.replace(/^https?:\/\//, '');
    return 'https://images.weserv.nl/?url=' + encodeURIComponent(bare);
  },

  ambientUrl: function(p) {
    var u = this.getPosterUrl(p, 154);
    return u ? 'https://images.weserv.nl/?url=' + encodeURIComponent(u.replace(/^https?:\/\//, '')) + '&w=40&h=60&fit=cover&blur=3' : null;
  },

  setAmbient: function(p) {
    var u = p ? this.ambientUrl(p) : null;
    document.body.style.setProperty('--amb', u ? 'url("' + u + '")' : 'none');
  },

  debounce: function(fn, delay) {
    var timer;
    return function() {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function() {
        fn.apply(ctx, args);
      }, delay);
    };
  },

  getCurrentMonth: function() {
    return new Date().getMonth() + 1;
  },

  getCurrentYear: function() {
    return new Date().getFullYear();
  },

  computeFunFact: function(entries, playlistCount) {
    if (!entries || entries.length === 0) {
      return '🎬 Start logging to see your stats here';
    }
    var isGameSet = entries.length > 0 && entries.every(function(e) { return e.type === 'game'; });
    var totalMinutes = entries.reduce(function(sum, e) {
      return sum + (isGameSet ? (e.playtime || 0) * 60 : (e.runtime || 0));
    }, 0);
    var totalHours = Math.round(totalMinutes / 60);
    var currentMonth = new Date().getMonth() + 1;
    var currentYear = new Date().getFullYear();
    var thisMonth = entries.filter(function(e) {
      return e.monthWatched === currentMonth
        && e.yearWatched === currentYear;
    }).length;
    var highRated = entries.filter(function(e) {
      return isGameSet ? (e.gameRating >= 8) : (e.rating >= 4);
    }).length;
    var pct = entries.length > 0
      ? Math.round((highRated / entries.length) * 100)
      : 0;
    var facts = [
        '🕐 You\'ve ' + (isGameSet ? 'played' : 'watched') + ' ' + totalHours
        + ' hours — that\'s '
        + (totalHours / 24).toFixed(1)
        + ' days non-stop',
      '📂 ' + entries.length + (isGameSet ? ' games across ' : ' titles across ')
        + (playlistCount || 1) + ' playlists',
      '⭐ ' + pct + '% of what you ' + (isGameSet ? 'played' : 'watched')
        + (isGameSet ? ' scored 8/10 or above' : ' got 4 stars or above'),
      '📅 This month you\'ve logged '
        + thisMonth + ' title'
        + (thisMonth !== 1 ? 's' : '')
    ];
    return facts[Math.floor(Math.random() * facts.length)];
  }

};