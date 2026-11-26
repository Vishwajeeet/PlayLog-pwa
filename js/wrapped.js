// Shared Canvas & Wrapped Card Rendering Helpers across Stats, Books, Playlists & Entries
window.AppWrapped = {
  getTheme: function () {
    var t = document.documentElement.getAttribute('data-visual-theme') ||
      localStorage.getItem('pl-visual-theme') || 'library';
    return t === 'classic' ? 'glass' : t;
  },

  fontForTheme: function (theme) {
    if (theme === 'winter') return '"DM Serif Display", Georgia, serif';
    if (theme === 'wizarding') return '"Cinzel Decorative", Cinzel, serif';
    if (theme === 'kyoto') return '"Cormorant Garamond", Georgia, serif';
    if (theme === 'sakura') return '"Playfair Display", Georgia, serif';
    if (theme === 'herbarium') return '"Libre Baskerville", Georgia, serif';
    if (theme === 'library') return '"Fraunces", Georgia, serif';
    return 'Inter, sans-serif';
  },

  palette: function (theme, tab) {
    if (theme === 'winter') {
      if (tab === 'games') return { accent: '#34d399', accentDim: 'rgba(52,211,153,0.35)', glow: 'rgba(52,211,153,0.22)', bg0: '#0a191b', bg1: '#050b12', bg2: '#020408', aes: { bg: '#10b981', panel: '#0f172a', ink: '#ffffff', text: '#f2f2f2', mute: '#94a3b8' } };
      if (tab === 'books') return { accent: '#2dd4bf', accentDim: 'rgba(45,212,191,0.35)', glow: 'rgba(45,212,191,0.22)', bg0: '#091a1d', bg1: '#060d14', bg2: '#03060a', aes: { bg: '#0f766e', panel: '#081a20', ink: '#ffffff', text: '#f2f2f2', mute: '#99f6e4' } };
      return { accent: '#64b4ff', accentDim: 'rgba(56,189,248,0.35)', glow: 'rgba(100,180,255,0.22)', bg0: '#0a1626', bg1: '#050a12', bg2: '#020408', aes: { bg: '#0284c7', panel: '#081426', ink: '#ffffff', text: '#f2f2f2', mute: '#93c5fd' } };
    }
    if (theme === 'wizarding') {
      if (tab === 'games') return { accent: '#c084fc', accentDim: 'rgba(192,132,252,0.35)', glow: 'rgba(192,132,252,0.22)', bg0: '#190a22', bg1: '#0d0511', bg2: '#050207', aes: { bg: '#9333ea', panel: '#1a0914', ink: '#ffffff', text: '#fdf5ea', mute: '#b59f96' } };
      if (tab === 'books') return { accent: '#f0b865', accentDim: 'rgba(240,184,101,0.35)', glow: 'rgba(229,169,88,0.22)', bg0: '#1e100b', bg1: '#0f0708', bg2: '#050204', aes: { bg: '#b45309', panel: '#1c0a15', ink: '#ffffff', text: '#fdf5ea', mute: '#e5b958' } };
      return { accent: '#e5b958', accentDim: 'rgba(229,185,88,0.35)', glow: 'rgba(229,185,88,0.22)', bg0: '#1c0a15', bg1: '#0e050b', bg2: '#050204', aes: { bg: '#d97706', panel: '#1c0a15', ink: '#ffffff', text: '#fdf5ea', mute: '#e5b958' } };
    }
    if (theme === 'kyoto') {
      if (tab === 'games') return { accent: '#8cb7cb', accentDim: 'rgba(126,166,184,0.35)', glow: 'rgba(126,166,184,0.2)', bg0: '#0f1b20', bg1: '#0b1110', bg2: '#121918', aes: { bg: '#3f6375', panel: '#121b19', ink: '#ecece2', text: '#ecece2', mute: '#8b9d93' } };
      if (tab === 'books') return { accent: '#d6b687', accentDim: 'rgba(201,169,122,0.35)', glow: 'rgba(201,169,122,0.2)', bg0: '#1b1711', bg1: '#0b1110', bg2: '#121917', aes: { bg: '#7d613b', panel: '#121b19', ink: '#ecece2', text: '#ecece2', mute: '#b5aa98' } };
      return { accent: '#8fc5a6', accentDim: 'rgba(132,184,154,0.35)', glow: 'rgba(132,184,154,0.2)', bg0: '#10211a', bg1: '#0b1110', bg2: '#121817', aes: { bg: '#476e5a', panel: '#121b19', ink: '#ecece2', text: '#ecece2', mute: '#9cb3a6' } };
    }
    if (theme === 'sakura') {
      if (tab === 'games') return { accent: '#c7a9e6', accentDim: 'rgba(185,154,217,0.35)', glow: 'rgba(185,154,217,0.22)', bg0: '#1b1124', bg1: '#0e0911', bg2: '#150e1c', aes: { bg: '#6b4f8c', panel: '#17101c', ink: '#f8edf1', text: '#f8edf1', mute: '#b9a6c7' } };
      if (tab === 'books') return { accent: '#edc2a1', accentDim: 'rgba(229,185,150,0.35)', glow: 'rgba(229,185,150,0.2)', bg0: '#211415', bg1: '#0e0911', bg2: '#181016', aes: { bg: '#946342', panel: '#17101c', ink: '#f8edf1', text: '#f8edf1', mute: '#c7b0a4' } };
      return { accent: '#efa8bd', accentDim: 'rgba(232,158,179,0.35)', glow: 'rgba(232,158,179,0.22)', bg0: '#24111d', bg1: '#0e0911', bg2: '#180f1b', aes: { bg: '#9c4b68', panel: '#17101c', ink: '#f8edf1', text: '#f8edf1', mute: '#caa5b3' } };
    }
    if (theme === 'herbarium') {
      if (tab === 'games') return { accent: '#b49bc4', accentDim: 'rgba(166,140,181,0.35)', glow: 'rgba(166,140,181,0.2)', bg0: '#1a1620', bg1: '#131410', bg2: '#1b1c17', aes: { bg: '#685275', panel: '#1b1d17', ink: '#efeadd', text: '#efeadd', mute: '#a89fb0' } };
      if (tab === 'books') return { accent: '#d69272', accentDim: 'rgba(204,134,102,0.35)', glow: 'rgba(204,134,102,0.2)', bg0: '#231712', bg1: '#131410', bg2: '#1b1b15', aes: { bg: '#874f36', panel: '#1b1d17', ink: '#efeadd', text: '#efeadd', mute: '#baa498' } };
      return { accent: '#9bb888', accentDim: 'rgba(140,168,122,0.35)', glow: 'rgba(140,168,122,0.2)', bg0: '#192115', bg1: '#131410', bg2: '#1a1c16', aes: { bg: '#536946', panel: '#1b1d17', ink: '#efeadd', text: '#efeadd', mute: '#a7b09d' } };
    }
    if (theme === 'glass') {
      if (tab === 'games') return { accent: '#a78bfa', accentDim: 'rgba(124,58,237,0.35)', glow: 'rgba(167,139,250,0.2)', bg0: '#211735', bg1: '#111317', bg2: '#171426', aes: { bg: '#7c5cff', panel: '#1f1f22', ink: '#ffffff', text: '#f2f2f2', mute: '#9a9aa2' } };
      if (tab === 'books') return { accent: '#34c58a', accentDim: 'rgba(52,197,138,0.35)', glow: 'rgba(52,197,138,0.2)', bg0: '#142620', bg1: '#111317', bg2: '#14171d', aes: { bg: '#10b981', panel: '#161b19', ink: '#ffffff', text: '#f2f2f2', mute: '#a7f3d0' } };
      return { accent: '#f4d15c', accentDim: 'rgba(201,168,76,0.35)', glow: 'rgba(212,175,55,0.2)', bg0: '#282116', bg1: '#111317', bg2: '#171426', aes: { bg: '#e0b93a', panel: '#f1efe6', ink: '#151515', text: '#ffffff', mute: '#b8b8c0' } };
    }
    // Soft Library (default)
    if (tab === 'games') return { accent: '#a78bfa', accentDim: 'rgba(139,92,246,0.35)', glow: 'rgba(167,139,250,0.2)', bg0: '#211735', bg1: '#111317', bg2: '#171426', aes: { bg: '#7c3aed', panel: '#1a181d', ink: '#ffffff', text: '#f5f0e6', mute: '#9e968b' } };
    if (tab === 'books') return { accent: '#34b887', accentDim: 'rgba(52,184,135,0.35)', glow: 'rgba(52,184,135,0.2)', bg0: '#16241d', bg1: '#111312', bg2: '#171614', aes: { bg: '#1f7a58', panel: '#171a18', ink: '#ffffff', text: '#f5f0e6', mute: '#9e968b' } };
    return { accent: '#f5d875', accentDim: 'rgba(212,175,55,0.35)', glow: 'rgba(212,175,55,0.2)', bg0: '#282116', bg1: '#111317', bg2: '#171426', aes: { bg: '#ca8a04', panel: '#1e1b17', ink: '#ffffff', text: '#f5f0e6', mute: '#d4af37' } };
  },

  loadImg: function (url) {
    return new Promise(function (resolve) {
      if (!url) return resolve(null);
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () { resolve(null); };
      if (/^data:image\//.test(url)) im.src = url;
      else {
        im.crossOrigin = 'anonymous';
        im.src = AppUtils.getCanvasSafeUrl(url);
      }
    });
  },

  loadFonts: function (fonts) {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all(fonts.map(function (f) {
      return document.fonts.load(f).catch(function () {});
    }));
  },

  blurDraw: function (ctx, img, x, y, w, h, alpha) {
    if (!img) return;
    var sw = 24, sh = Math.max(1, Math.round(24 * h / w));
    var s = document.createElement('canvas'); s.width = sw; s.height = sh;
    var k = Math.max(sw / img.width, sh / img.height);
    s.getContext('2d').drawImage(img, (sw - img.width * k) / 2, (sh - img.height * k) / 2, img.width * k, img.height * k);
    var m = document.createElement('canvas'); m.width = sw * 6; m.height = sh * 6;
    var mc = m.getContext('2d'); mc.imageSmoothingQuality = 'high'; mc.drawImage(s, 0, 0, m.width, m.height);
    ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(m, x, y, w, h); ctx.restore();
  },

  glass: function (ctx, x, y, w, h, r, alpha) {
    ctx.fillStyle = 'rgba(255,255,255,' + (alpha || 0.07) + ')';
    AppUtils.roundRectPath(ctx, x, y, w, h, r); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1.5;
    AppUtils.roundRectPath(ctx, x, y, w, h, r); ctx.stroke();
  },

  drawCover: function (ctx, img, x, y, w, h) {
    var s = Math.max(w / img.width, h / img.height);
    ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s);
  },

  trunc: function (ctx, text, maxWidth) {
    var value = String(text || '');
    while (ctx.measureText(value).width > maxWidth && value.length > 3) value = value.slice(0, -1);
    return value === String(text || '') ? value : value.trim() + '…';
  },

  showPreview: function (wrap, resultWrap, canvas, label) {
    wrap.style.display = '';
    wrap.style.setProperty('--card-ratio', canvas.width / canvas.height);
    wrap.replaceChildren(canvas);
    wrap.classList.add('has-card');
    if (resultWrap) resultWrap.classList.add('has-card');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'button');
    wrap.setAttribute('aria-label', label || 'Open full-size Wrapped card preview');
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
  },

  generateEntryCard: function (entry, onReady) {
    var canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    var ctx = canvas.getContext('2d');
    var theme = AppWrapped.getTheme();
    var kind = entry.type === 'game' ? 'games' : entry.type === 'book' ? 'books' : 'media';
    var accent = AppWrapped.palette(theme, kind).accent;

    function wrapText(text, x, yBottom, maxWidth, lineHeight, maxLines) {
      var words = String(text || '').split(' '), lines = [], current = '';
      for (var i = 0; i < words.length; i++) {
        var test = current ? current + ' ' + words[i] : words[i];
        if (ctx.measureText(test).width > maxWidth && current) {
          lines.push(current);
          current = words[i];
        } else {
          current = test;
        }
      }
      if (current) lines.push(current);
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…';
      }
      var startY = yBottom - (lines.length - 1) * lineHeight;
      lines.forEach(function (line, i) {
        ctx.fillText(line, x, startY + i * lineHeight);
      });
    }

    var posterUrl = AppUtils.getPosterUrl(entry.poster);
    AppWrapped.loadImg(posterUrl).then(function (img) {
      ctx.fillStyle = '#0d0d0d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (img) AppWrapped.drawCover(ctx, img, 0, 0, canvas.width, canvas.height);

      var grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, 'rgba(10,10,10,0.25)');
      grad.addColorStop(0.55, 'rgba(10,10,10,0.55)');
      grad.addColorStop(1, 'rgba(8,8,8,0.96)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, canvas.width, 8);
      ctx.textAlign = 'left';

      if (entry.review) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 10;
        ctx.font = 'italic 500 30px Inter, sans-serif';
        ctx.fillStyle = '#e8e8e8';
        wrapText('\u201C' + entry.review + '\u201D', 70, 590, 940, 42, 3);
        ctx.restore();
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 62px Inter, sans-serif';
      wrapText(entry.title, 70, 760, 940, 68, 2);

      ctx.font = '600 30px Inter, sans-serif';
      ctx.fillStyle = accent;
      var typeLabel = kind === 'games'
        ? '🎮 Game'
        : kind === 'books'
          ? ('📖 ' + (entry.author || 'Book'))
          : entry.type === 'series'
            ? '📺 ' + (entry.seasonName || 'Series')
            : '🎬 Movie';
      ctx.fillText(typeLabel, 70, 830);

      ctx.font = 'bold 84px Inter, sans-serif';
      ctx.fillStyle = accent;
      var ratingText = '';
      if (kind === 'games' && entry.gameRating) ratingText = entry.gameRating + '/10';
      else if (kind === 'books' && entry.bookRating) ratingText = entry.bookRating + '/10';
      else if (kind === 'media' && entry.rating) ratingText = AppUtils.ratingToEmoji(entry.rating);
      if (ratingText) ctx.fillText(ratingText, 70, 935);

      ctx.font = '500 32px Inter, sans-serif';
      ctx.fillStyle = '#dddddd';
      var meta = '';
      if (kind === 'games' && entry.completionStatus) {
        var stLabels = { completed: 'Completed', playing: 'Playing', dropped: 'Dropped', wishlist: 'Wishlist' };
        meta = stLabels[entry.completionStatus] || '';
        if (entry.playtime) meta += ' · ' + entry.playtime + 'h played';
      } else if (kind === 'books') {
        meta = (entry.finishDate || '') + (entry.pages ? ' · ' + entry.pages + ' pages' : '');
      } else if (entry.monthWatched) {
        meta = AppUtils.monthName(entry.monthWatched) + ' ' + (entry.yearWatched || '');
      }
      if (meta) ctx.fillText(meta.replace(/^\s*·\s*/, ''), 70, 985);

      ctx.font = '500 26px Inter, sans-serif';
      ctx.fillStyle = '#999999';
      ctx.fillText('Logged on Playlog', 70, 1040);

      canvas.style.width = '100%';
      canvas.style.borderRadius = '8px';
      if (onReady) onReady(canvas);
    });
  }
};
