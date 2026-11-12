// Utility functions for DOM manipulation, formatting, and helpers
if ('serviceWorker' in navigator) {
  var _hadCtl = !!navigator.serviceWorker.controller, _rl = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (_hadCtl && !_rl) { _rl = true; location.reload(); }
  });
}

window.AppTheme = {
  apply: function () {
    var r = document.documentElement, t = localStorage.getItem('pl-theme') || 'dark', a = localStorage.getItem('pl-accent');
    if (t === 'system') t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    r.dataset.theme = t;
    if (a && /^#[0-9a-f]{6}$/i.test(a)) {
      r.style.setProperty('--accent', a);
      r.style.setProperty('--accent-dim', 'color-mix(in srgb,' + a + ' 15%,transparent)');
    } else { r.style.removeProperty('--accent'); r.style.removeProperty('--accent-dim'); }
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = t === 'light' ? '#f4f2ec' : '#0d0d0d';
  }
};
AppTheme.apply();
(function () { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/css/theme.css'; document.head.appendChild(l); })();

window.AppUtils = {

  booksPill: function () {
    var box = document.getElementById('type-pills'); if (!box) return;
    var on = localStorage.getItem('pl-books') === '1', p = box.querySelector('[data-tab="books"]');
    if (on && !p) { p = document.createElement('button'); p.className = 'type-pill'; p.type = 'button'; p.dataset.tab = 'books'; p.textContent = 'Books'; box.appendChild(p); }
    if (p) p.style.display = on ? '' : 'none';
    box.classList.toggle('has-3', on);
    var m = box.querySelector('[data-tab="media"]'); if (m) m.textContent = on ? 'Movies' : 'Movies & Series';
  },

  esc: function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

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

  shareCanvas: function(canvas, fileName, title) {
    if (!navigator.share) {
      return Promise.reject(new Error('Native sharing is unavailable in this browser. Use Download Card instead.'));
    }
    if (typeof File === 'undefined' || !canvas.toBlob) {
      return Promise.reject(new Error('This browser cannot prepare the image for sharing. Use Download Card instead.'));
    }
    return new Promise(function(resolve, reject) {
      try {
        canvas.toBlob(function(blob) {
          try {
            if (!blob) {
              reject(new Error('Could not prepare the image for sharing.'));
              return;
            }
            var file = new File([blob], fileName, { type: 'image/png' });
            navigator.share({ files: [file], title: title }).then(resolve).catch(reject);
          } catch (error) {
            reject(error);
          }
        }, 'image/png');
      } catch (error) {
        reject(error);
      }
    });
  },

  showCanvasPreview: function(canvas) {
    if (!canvas || typeof HTMLDialogElement === 'undefined') return;
    var previousFocus = document.activeElement;
    var dialog = document.createElement('dialog');
    dialog.className = 'wrapped-image-dialog';
    dialog.setAttribute('aria-label', 'Expanded Wrapped card preview');
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'wrapped-image-dialog-close';
    close.setAttribute('aria-label', 'Close preview');
    close.textContent = '×';
    var image = document.createElement('canvas');
    image.width = canvas.width;
    image.height = canvas.height;
    image.setAttribute('aria-label', 'Full-size Wrapped card');
    image.getContext('2d').drawImage(canvas, 0, 0);
    dialog.append(close, image);
    document.body.appendChild(dialog);
    close.addEventListener('click', function() { dialog.close(); });
    dialog.addEventListener('click', function(event) {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', function() {
      dialog.remove();
      if (previousFocus && previousFocus.isConnected) previousFocus.focus();
    }, { once: true });
    dialog.showModal();
    close.focus();
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
      if (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(path)) return path;
      if (path.startsWith('http')) {
      if (path.indexOf('media.rawg.io') > -1) return path.replace(/\/media\/(games|screenshots)\//, '/media/resize/' + (w && w <= 200 ? 200 : 640) + '/-/$1/');
      return path;
    }
    if (w) return APP_CONFIG.tmdb.posterBase.replace('/w500', '/w' + w) + path;
    return APP_CONFIG.tmdb.posterBase + path;
  },

  // Proxies external images through a CORS-friendly service so they can
  // be drawn onto a <canvas> and exported.
  getCanvasSafeUrl: function(url) {
    if (!url) return null;
    if (url.indexOf('data:image/') === 0) return url;
    var bare = url.replace(/^https?:\/\//, '');
    return 'https://images.weserv.nl/?url=' + encodeURIComponent(bare);
  },

  ambientUrl: function(p) {
    var u = this.getPosterUrl(p, 154);
    if (u && u.indexOf('data:image/') === 0) return null;
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