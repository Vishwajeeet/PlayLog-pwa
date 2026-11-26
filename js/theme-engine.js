/**
 * Playlog Flagship Theme & Visual Engine
 * Supports: Soft Library (default), Cozy Winter (Aurora & 3D Snow), Wizarding World (Cinzel & Lumos Sparks), Classic.
 * Features: Multi-depth particle shaders, dynamic ambient color extraction, haptic feedback, and count-up physics.
 */

(function (window, document) {
  'use strict';

  var THEMES = {
    library: {
      name: 'Soft Library',
      font: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;600;700;800&display=swap',
      particles: null
    },
    winter: {
      name: 'Cozy Winter',
      font: 'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap',
      particles: 'snow'
    },
    wizarding: {
      name: 'Harry Potter',
      font: 'https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Cinzel:wght@600;700;800&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap',
      particles: 'sparkles'
    },
    kyoto: {
      name: 'Kyoto Rain',
      font: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;0,700;1,600&display=swap',
      particles: 'rain'
    },
    sakura: {
      name: 'Midnight Sakura',
      font: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,600&display=swap',
      particles: 'petals'
    },
    herbarium: {
      name: 'Herbarium',
      font: 'https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap',
      particles: 'herbarium'
    },
    glass: {
      name: 'Liquid Glass',
      font: null,
      particles: 'liquid'
    },
    classic: {
      name: 'Liquid Glass',
      font: null,
      particles: 'liquid'
    }
  };

  var particleAnimId = null;
  var particleCanvas = null;
  var particleCtx = null;
  var particles = [];
  var currentParticleMode = null;
  var windVelocity = 0;
  var lastPointerX = null;
  var lastFrameTime = 0;
  var frameInterval = 1000 / 38; // 38fps cap keeps GPU light while running smoothly on scroll

  // Inject bespoke Harry Potter SVGs (Hogwarts skyline horizon, Marauder corners & Deathly Hallows seal)
  function syncWizardingDecor(active) {
    if (!document.body) return;
    var stage = document.getElementById('hp-decor-stage');
    var divider = document.getElementById('hp-hallows-divider');
    if (!active) {
      if (stage) stage.style.display = 'none';
      if (divider) divider.remove();
      return;
    }
    if (!stage) {
      stage = document.createElement('div');
      stage.id = 'hp-decor-stage';
      stage.className = 'hp-decor-stage';
      stage.setAttribute('aria-hidden', 'true');
      var cornerSvg =
        '<svg viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">' +
        '<path d="M6 68 V18 Q6 6 18 6 H68"/>' +
        '<path d="M12 52 V22 Q12 12 22 12 H52" opacity="0.65"/>' +
        '<path d="M18 6 C22 18 14 26 26 26 C18 22 24 14 34 12" opacity="0.75"/>' +
        '<circle cx="15" cy="15" r="2.2" fill="currentColor"/>' +
        '<path d="M6 42 Q14 36 10 28" opacity="0.55"/></svg>';
      stage.innerHTML =
        '<div class="hp-corner hp-corner-tl">' + cornerSvg + '</div>' +
        '<div class="hp-corner hp-corner-tr">' + cornerSvg + '</div>' +
        '<div class="hp-corner hp-corner-bl">' + cornerSvg + '</div>' +
        '<div class="hp-corner hp-corner-br">' + cornerSvg + '</div>' +
        '<svg class="hp-castle-horizon" viewBox="0 0 1200 220" preserveAspectRatio="xMidYMax meet">' +
        '<g fill="currentColor" opacity="0.7">' +
        '<circle cx="965" cy="48" r="16" opacity="0.22"/>' +
        '<path d="M972 34 A15 15 0 1 0 980 60 A12 12 0 1 1 972 34 Z" opacity="0.7"/>' +
        '<path d="M210 56 Q219 49 228 55 Q237 49 246 56 Q237 53 228 58 Q219 53 210 56 Z" opacity="0.55"/>' +
        '</g>' +
        '<path class="hp-silhouette" d="' +
        'M0 220 L0 192 L45 184 L68 156 L82 184 L120 176 L142 146 L158 178 L210 182 L240 162 L265 185 ' +
        'L320 185 L345 162 L345 142 L358 112 L371 142 L371 168 L398 168 ' +
        'L404 122 L418 74 L432 122 L432 146 L455 146 L462 118 L474 52 L486 118 L486 144 ' +
        'L512 138 L528 96 L546 138 L546 154 L575 154 L584 92 L600 26 L616 92 L616 142 ' +
        'L638 142 L646 108 L658 64 L670 108 L670 148 L698 152 L714 88 L732 152 L732 168 ' +
        'L758 168 L770 132 L784 168 L830 174 L848 154 L872 178 L930 184 ' +
        'L968 186 L992 158 L1012 186 L1056 172 L1074 148 L1092 178 L1145 185 L1200 178 L1200 220 Z"/>' +
        '<g class="hp-win">' +
        '<rect x="415" y="132" width="4" height="8" rx="1"/>' +
        '<rect x="472" y="108" width="4" height="10" rx="1"/>' +
        '<rect x="526" y="118" width="4" height="8" rx="1"/>' +
        '<rect x="597" y="76" width="5" height="12" rx="1.5"/>' +
        '<rect x="598" y="102" width="4" height="9" rx="1"/>' +
        '<rect x="656" y="114" width="4" height="9" rx="1"/>' +
        '<rect x="712" y="128" width="4" height="8" rx="1"/>' +
        '<rect x="556" y="164" width="4" height="7" rx="1"/>' +
        '<rect x="626" y="162" width="4" height="8" rx="1"/>' +
        '</g>' +
        '</svg>';
      document.body.appendChild(stage);
    } else {
      stage.style.display = 'block';
    }
    if (!divider) {
      var header = document.querySelector('main .page-header');
      if (header && header.parentNode) {
        divider = document.createElement('div');
        divider.id = 'hp-hallows-divider';
        divider.className = 'hp-hallows-divider';
        divider.setAttribute('aria-hidden', 'true');
        divider.innerHTML =
          '<i></i>' +
          '<svg viewBox="0 0 28 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">' +
          '<polygon points="14,2 25,21 3,21"/>' +
          '<circle cx="14" cy="14.7" r="6"/>' +
          '<line x1="14" y1="2" x2="14" y2="21"/>' +
          '</svg>' +
          '<i></i>';
        header.parentNode.insertBefore(divider, header.nextSibling);
      }
    }
  }

  // Offscreen cached particle sprite stamps (dark + light theme variants, zero ctx.shadowBlur)
  var PARTICLE_STAMPS = null;
  function getParticleStamps() {
    if (PARTICLE_STAMPS) return PARTICLE_STAMPS;
    function mk(size, drawFn) {
      var c = document.createElement('canvas');
      c.width = size; c.height = size;
      drawFn(c.getContext('2d'), size / 2);
      return c;
    }
    var snowSoftDark = mk(36, function (g, cx) {
      var grad = g.createRadialGradient(cx, cx, 1, cx, cx, cx);
      grad.addColorStop(0, 'rgba(235, 248, 255, 0.95)');
      grad.addColorStop(0.45, 'rgba(200, 235, 255, 0.45)');
      grad.addColorStop(1, 'rgba(180, 225, 255, 0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(cx, cx, cx, 0, Math.PI * 2); g.fill();
    });
    var snowCrispDark = mk(16, function (g, cx) {
      g.fillStyle = 'rgba(235, 248, 255, 0.95)';
      g.beginPath(); g.arc(cx, cx, 4, 0, Math.PI * 2); g.fill();
    });
    var snowSoftLight = mk(36, function (g, cx) {
      var grad = g.createRadialGradient(cx, cx, 1, cx, cx, cx);
      grad.addColorStop(0, 'rgba(56, 136, 214, 0.65)');
      grad.addColorStop(0.5, 'rgba(120, 182, 240, 0.28)');
      grad.addColorStop(1, 'rgba(120, 182, 240, 0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(cx, cx, cx, 0, Math.PI * 2); g.fill();
    });
    var snowCrispLight = mk(16, function (g, cx) {
      g.fillStyle = 'rgba(28, 108, 190, 0.72)';
      g.beginPath(); g.arc(cx, cx, 3.8, 0, Math.PI * 2); g.fill();
    });

    var emberDark = mk(28, function (g, cx) {
      var grad = g.createRadialGradient(cx, cx, 0.5, cx, cx, cx);
      grad.addColorStop(0, 'rgba(255, 245, 200, 1)');
      grad.addColorStop(0.32, 'rgba(235, 190, 85, 0.65)');
      grad.addColorStop(1, 'rgba(212, 168, 67, 0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(cx, cx, cx, 0, Math.PI * 2); g.fill();
    });
    var emberLight = mk(28, function (g, cx) {
      var grad = g.createRadialGradient(cx, cx, 0.5, cx, cx, cx);
      grad.addColorStop(0, 'rgba(166, 98, 16, 0.85)');
      grad.addColorStop(0.4, 'rgba(180, 118, 28, 0.35)');
      grad.addColorStop(1, 'rgba(180, 118, 28, 0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(cx, cx, cx, 0, Math.PI * 2); g.fill();
    });
    var starDark = mk(40, function (g, cx) {
      var glow = g.createRadialGradient(cx, cx, 1, cx, cx, cx);
      glow.addColorStop(0, 'rgba(255, 240, 175, 0.7)');
      glow.addColorStop(0.5, 'rgba(229, 185, 88, 0.25)');
      glow.addColorStop(1, 'rgba(229, 185, 88, 0)');
      g.fillStyle = glow;
      g.beginPath(); g.arc(cx, cx, cx, 0, Math.PI * 2); g.fill();
      var arm = 12;
      g.fillStyle = 'rgba(255, 248, 215, 0.98)';
      g.translate(cx, cx);
      g.beginPath();
      g.moveTo(0, -arm); g.lineTo(arm * 0.24, -arm * 0.24);
      g.lineTo(arm, 0); g.lineTo(arm * 0.24, arm * 0.24);
      g.lineTo(0, arm); g.lineTo(-arm * 0.24, arm * 0.24);
      g.lineTo(-arm, 0); g.lineTo(-arm * 0.24, -arm * 0.24);
      g.closePath(); g.fill();
    });
    var starLight = mk(40, function (g, cx) {
      var glow = g.createRadialGradient(cx, cx, 1, cx, cx, cx);
      glow.addColorStop(0, 'rgba(180, 115, 24, 0.35)');
      glow.addColorStop(1, 'rgba(180, 115, 24, 0)');
      g.fillStyle = glow;
      g.beginPath(); g.arc(cx, cx, cx, 0, Math.PI * 2); g.fill();
      var arm = 11;
      g.fillStyle = 'rgba(148, 86, 12, 0.9)';
      g.translate(cx, cx);
      g.beginPath();
      g.moveTo(0, -arm); g.lineTo(arm * 0.24, -arm * 0.24);
      g.lineTo(arm, 0); g.lineTo(arm * 0.24, arm * 0.24);
      g.lineTo(0, arm); g.lineTo(-arm * 0.24, arm * 0.24);
      g.lineTo(-arm, 0); g.lineTo(-arm * 0.24, -arm * 0.24);
      g.closePath(); g.fill();
    });

    function mkRain(color) {
      return mk(32, function (g) {
        var grad = g.createLinearGradient(0, 0, 0, 30);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.65, color);
        grad.addColorStop(1, color);
        g.strokeStyle = grad;
        g.lineWidth = 1.6;
        g.lineCap = 'round';
        g.beginPath(); g.moveTo(16, 2); g.lineTo(13, 30); g.stroke();
      });
    }
    var rainDark = mkRain('rgba(178, 218, 206, 0.72)');
    var rainLight = mkRain('rgba(46, 98, 82, 0.52)');

    function mkPetal(c0, c1) {
      return mk(28, function (g, cx) {
        g.translate(cx, cx);
        var grad = g.createLinearGradient(-8, -10, 8, 10);
        grad.addColorStop(0, c0); grad.addColorStop(1, c1);
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(0, -10);
        g.bezierCurveTo(9, -6, 10, 6, 0, 10);
        g.bezierCurveTo(-10, 6, -9, -6, 0, -10);
        g.fill();
      });
    }
    var petalDark = mkPetal('rgba(250, 198, 214, 0.9)', 'rgba(232, 146, 174, 0.65)');
    var petalLight = mkPetal('rgba(204, 88, 126, 0.72)', 'rgba(226, 134, 162, 0.5)');

    function mkLeaf(c0, c1) {
      return mk(28, function (g, cx) {
        g.translate(cx, cx);
        g.fillStyle = c0;
        g.beginPath();
        g.moveTo(0, -11);
        g.quadraticCurveTo(8, -2, 0, 11);
        g.quadraticCurveTo(-8, -2, 0, -11);
        g.fill();
        g.strokeStyle = c1; g.lineWidth = 0.9;
        g.beginPath(); g.moveTo(0, -8); g.lineTo(0, 9); g.stroke();
      });
    }
    var leafDark = mkLeaf('rgba(154, 182, 134, 0.75)', 'rgba(220, 232, 205, 0.45)');
    var leafLight = mkLeaf('rgba(78, 112, 62, 0.62)', 'rgba(42, 68, 34, 0.4)');
    var fleckDark = mk(16, function (g, cx) {
      g.fillStyle = 'rgba(214, 194, 145, 0.78)';
      g.beginPath(); g.arc(cx, cx, 3.2, 0, Math.PI * 2); g.fill();
    });
    var fleckLight = mk(16, function (g, cx) {
      g.fillStyle = 'rgba(148, 92, 60, 0.58)';
      g.beginPath(); g.arc(cx, cx, 3.2, 0, Math.PI * 2); g.fill();
    });

    function mkCandle(wax, halo0, halo1) {
      return mk(36, function (g, cx) {
        var grad = g.createRadialGradient(cx, 11, 0.5, cx, 11, 13);
        grad.addColorStop(0, halo0); grad.addColorStop(0.5, halo1); grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.beginPath(); g.arc(cx, 11, 13, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff5cc';
        g.beginPath();
        g.moveTo(cx, 5); g.quadraticCurveTo(cx + 3.2, 10, cx, 13.5);
        g.quadraticCurveTo(cx - 3.2, 10, cx, 5); g.fill();
        g.fillStyle = wax;
        g.fillRect(cx - 2.3, 14, 4.6, 15);
      });
    }
    var candleDark = mkCandle('rgba(248, 240, 220, 0.92)', 'rgba(255, 224, 132, 0.92)', 'rgba(235, 165, 58, 0.32)');
    var candleLight = mkCandle('rgba(116, 86, 56, 0.72)', 'rgba(218, 128, 22, 0.68)', 'rgba(218, 128, 22, 0.16)');

    function mkSnitch(ball, wing) {
      return mk(44, function (g, cx) {
        g.strokeStyle = wing; g.fillStyle = wing; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(cx - 4, cx); g.quadraticCurveTo(cx - 14, cx - 10, cx - 20, cx - 4); g.quadraticCurveTo(cx - 12, cx + 1, cx - 4, cx + 1); g.fill();
        g.beginPath(); g.moveTo(cx + 4, cx); g.quadraticCurveTo(cx + 14, cx - 10, cx + 20, cx - 4); g.quadraticCurveTo(cx + 12, cx + 1, cx + 4, cx + 1); g.fill();
        var grad = g.createRadialGradient(cx - 1.5, cx - 1.5, 0.5, cx, cx, 5.5);
        grad.addColorStop(0, '#fff7cc'); grad.addColorStop(1, ball);
        g.fillStyle = grad;
        g.beginPath(); g.arc(cx, cx, 4.8, 0, Math.PI * 2); g.fill();
      });
    }
    var snitchDark = mkSnitch('#d99b26', 'rgba(255, 244, 214, 0.65)');
    var snitchLight = mkSnitch('#b57414', 'rgba(130, 82, 34, 0.45)');

    function mkLiquidDrop(edge, glint) {
      return mk(34, function (g, cx) {
        g.strokeStyle = edge; g.lineWidth = 1.2;
        g.beginPath(); g.arc(cx, cx, 11, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = glint; g.lineWidth = 1.5; g.lineCap = 'round';
        g.beginPath(); g.arc(cx, cx, 8, -2.5, -1.4); g.stroke();
      });
    }
    var liquidDark = mkLiquidDrop('rgba(255, 255, 255, 0.24)', 'rgba(255, 255, 255, 0.58)');
    var liquidLight = mkLiquidDrop('rgba(78, 122, 185, 0.26)', 'rgba(255, 255, 255, 0.85)');

    PARTICLE_STAMPS = {
      dark: {
        snowSoft: snowSoftDark, snowCrisp: snowCrispDark,
        ember: emberDark, star: starDark, candle: candleDark, snitch: snitchDark,
        rain: rainDark, petal: petalDark,
        leaf: leafDark, fleck: fleckDark,
        liquid: liquidDark
      },
      light: {
        snowSoft: snowSoftLight, snowCrisp: snowCrispLight,
        ember: emberLight, star: starLight, candle: candleLight, snitch: snitchLight,
        rain: rainLight, petal: petalLight,
        leaf: leafLight, fleck: fleckLight,
        liquid: liquidLight
      }
    };
    return PARTICLE_STAMPS;
  }

  /* --------------------------------------------------------------------------
     2. Dynamic Ambient Color Extraction
     -------------------------------------------------------------------------- */
  function samplePosterGlow() {
    var img = document.querySelector('.recent-item img, .preview-poster-img, .detail-poster, .poster-img');
    if (!img || !img.complete || img.naturalWidth === 0) return;

    try {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      canvas.width = 16;
      canvas.height = 24;
      ctx.drawImage(img, 0, 0, 16, 24);
      var data = ctx.getImageData(0, 0, 16, 24).data;
      var r = 0, g = 0, b = 0, count = 0;

      for (var i = 0; i < data.length; i += 16) {
        var max = Math.max(data[i], data[i + 1], data[i + 2]);
        var min = Math.min(data[i], data[i + 1], data[i + 2]);
        // Extract rich chromatic color (avoid pitch black and pure white)
        if (max > 35 && min < 235) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
      }

      if (count > 0) {
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);
        var glowRgba = 'rgba(' + r + ',' + g + ',' + b + ', 0.2)';
        document.documentElement.style.setProperty('--ambient-art-glow', glowRgba);
      }
    } catch (e) {
      // Safe cross-origin fallback
    }
  }

  function loadFont(url) {
    if (!url) return;
    var existing = document.getElementById('pl-theme-font');
    if (existing) {
      if (existing.href === url) return;
      existing.href = url;
    } else {
      var link = document.createElement('link');
      link.id = 'pl-theme-font';
      link.rel = 'stylesheet';
      link.href = url;
      document.head.appendChild(link);
    }
  }

  /* --------------------------------------------------------------------------
     3. Advanced Particle Shaders: 3D Aurora Snow & Lumos Wand Sparks
     -------------------------------------------------------------------------- */
  function initParticles(mode) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      stopParticles();
      return;
    }

    if (!mode) {
      stopParticles();
      return;
    }

    currentParticleMode = mode;
    if (!particleCanvas) {
      particleCanvas = document.createElement('canvas');
      particleCanvas.id = 'theme-particles-canvas';
      document.body.appendChild(particleCanvas);
      particleCtx = particleCanvas.getContext('2d');
      window.addEventListener('resize', resizeCanvas, { passive: true });

      // Interactive wind drift on pointer movement
      window.addEventListener('pointermove', function (e) {
        if (lastPointerX !== null) {
          var delta = e.clientX - lastPointerX;
          windVelocity += delta * 0.008;
          windVelocity = Math.max(-1.5, Math.min(1.5, windVelocity));
        }
        lastPointerX = e.clientX;
      }, { passive: true });
    }

    particleCanvas.style.display = 'block';
    resizeCanvas();
    createParticles(mode);

    if (!particleAnimId) {
      loopParticles();
    }
  }

  function resizeCanvas() {
    if (!particleCanvas) return;
    var isMobile = window.innerWidth < 600;
    // Render at half/sub-resolution on mobile, scaled up with CSS: saves 70% pixel fill rate
    var scale = isMobile ? 0.6 : 0.85;
    particleCanvas.width = Math.round(window.innerWidth * scale);
    particleCanvas.height = Math.round(window.innerHeight * scale);
  }

  function stopParticles() {
    if (particleAnimId) {
      cancelAnimationFrame(particleAnimId);
      particleAnimId = null;
    }
    if (particleCanvas) {
      particleCanvas.style.display = 'none';
      if (particleCtx) {
        particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
      }
    }
    particles = [];
    currentParticleMode = null;
  }

  function createParticles(mode) {
    var isMobile = window.innerWidth < 600;
    // Ultra-optimized particle count (18 on mobile, 30 on desktop)
    var count = isMobile ? 18 : 30;
    particles = [];
    var w = particleCanvas.width || window.innerWidth;
    var h = particleCanvas.height || window.innerHeight;

    for (var i = 0; i < count; i++) {
      if (mode === 'snow') {
        // 3 Depths: 0 (Far crystal), 1 (Mid crystal), 2 (Near soft flake)
        var depth = Math.random() < 0.2 ? 2 : (Math.random() < 0.6 ? 1 : 0);
        particles.push({
          depth: depth,
          x: Math.random() * w,
          y: Math.random() * h,
          r: depth === 2 ? (Math.random() * 2.5 + 3.2) : (depth === 1 ? (Math.random() * 1.5 + 1.4) : (Math.random() * 0.9 + 0.6)),
          speed: depth === 2 ? (Math.random() * 0.7 + 1.2) : (depth === 1 ? (Math.random() * 0.5 + 0.6) : (Math.random() * 0.3 + 0.3)),
          swing: Math.random() * Math.PI * 2,
          swingSpeed: Math.random() * 0.02 + 0.008,
          alpha: depth === 2 ? 0.35 : (depth === 1 ? 0.75 : 0.45)
        });
      } else if (mode === 'sparkles') {
        // Harry Potter: Enchanted Great Hall Candles, darting Golden Snitches & Lumos stars
        var roll = Math.random();
        var kind = roll < 0.14 ? 'snitch' : (roll < 0.36 ? 'candle' : (roll < 0.64 ? 'star' : 'ember'));
        particles.push({
          kind: kind,
          x: Math.random() * w,
          y: kind === 'candle' ? (Math.random() * h * 0.65) : (Math.random() * h),
          r: kind === 'snitch' ? (Math.random() * 4 + 18) : (kind === 'candle' ? (Math.random() * 5 + 22) : (kind === 'star' ? (Math.random() * 1.6 + 2.2) : (Math.random() * 1.5 + 0.9))),
          speed: kind === 'snitch' ? (Math.random() * 1.2 + 1.1) : (kind === 'candle' ? (Math.random() * 0.25 + 0.15) : (Math.random() * 0.45 + 0.25)),
          dir: Math.random() < 0.5 ? 1 : -1,
          swing: Math.random() * Math.PI * 2,
          swingSpeed: Math.random() * 0.03 + 0.014,
          alpha: kind === 'candle' || kind === 'snitch' ? (Math.random() * 0.25 + 0.7) : (Math.random() * 0.7 + 0.25),
          pulse: Math.random() * 0.03 + 0.012
        });
      } else if (mode === 'liquid') {
        // Subtle floating optical glass refraction droplets
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 10 + 14,
          speed: Math.random() * 0.32 + 0.18,
          swing: Math.random() * Math.PI * 2,
          swingSpeed: Math.random() * 0.015 + 0.008,
          alpha: Math.random() * 0.3 + 0.28
        });
      } else if (mode === 'rain') {
        // Kyoto Rain streaks + soft puddle ripples
        var isRipple = i < Math.max(3, Math.floor(count * 0.2));
        particles.push({
          isRipple: isRipple,
          x: Math.random() * w,
          y: isRipple ? (h * (0.76 + Math.random() * 0.22)) : (Math.random() * h),
          r: isRipple ? (Math.random() * 10 + 3) : (Math.random() * 0.4 + 0.85),
          maxR: Math.random() * 14 + 14,
          speed: Math.random() * 3.2 + 5.8,
          alpha: isRipple ? (Math.random() * 0.35 + 0.15) : (Math.random() * 0.35 + 0.35)
        });
      } else if (mode === 'petals') {
        // Midnight Sakura gently swaying petals
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 3.5 + 6,
          speedY: Math.random() * 0.6 + 0.55,
          speedX: Math.random() * 0.35 + 0.2,
          rot: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.035,
          swing: Math.random() * Math.PI * 2,
          swingSpeed: Math.random() * 0.022 + 0.01,
          alpha: Math.random() * 0.35 + 0.45
        });
      } else if (mode === 'herbarium') {
        // Pressed botanical leaves and faint warm dust flecks
        var isLeaf = Math.random() < 0.45;
        particles.push({
          isLeaf: isLeaf,
          x: Math.random() * w,
          y: Math.random() * h,
          r: isLeaf ? (Math.random() * 3.2 + 5.5) : (Math.random() * 2 + 2.5),
          speed: Math.random() * 0.32 + 0.2,
          rot: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.015,
          swing: Math.random() * Math.PI * 2,
          swingSpeed: Math.random() * 0.015 + 0.008,
          alpha: Math.random() * 0.35 + 0.35
        });
      }
    }
  }

  function loopParticles(timestamp) {
    if (!currentParticleMode || !particleCtx || !particleCanvas) return;
    particleAnimId = requestAnimationFrame(loopParticles);

    // Throttle to 38fps target (runs smoothly right through touch scroll)
    if (timestamp && (timestamp - lastFrameTime < frameInterval)) return;
    lastFrameTime = timestamp || 0;

    var w = particleCanvas.width;
    var h = particleCanvas.height;
    particleCtx.clearRect(0, 0, w, h);

    // Dampen interactive wind velocity
    windVelocity *= 0.96;

    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    var stamps = getParticleStamps()[isLight ? 'light' : 'dark'];
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];

      if (currentParticleMode === 'snow') {
        p.y += p.speed;
        p.swing += p.swingSpeed;
        p.x += Math.sin(p.swing) * (p.depth + 0.6) + windVelocity;

        if (p.y > h + 10) {
          p.y = -8;
          p.x = Math.random() * w;
        }
        if (p.x > w + 10) p.x = -8;
        if (p.x < -10) p.x = w + 8;

        particleCtx.globalAlpha = p.alpha;
        if (p.depth === 2) {
          var sSoft = p.r * 3.4;
          particleCtx.drawImage(stamps.snowSoft, p.x - sSoft * 0.5, p.y - sSoft * 0.5, sSoft, sSoft);
        } else {
          var sCrisp = p.r * 3.2;
          particleCtx.drawImage(stamps.snowCrisp, p.x - sCrisp * 0.5, p.y - sCrisp * 0.5, sCrisp, sCrisp);
        }

      } else if (currentParticleMode === 'sparkles') {
        p.swing += p.swingSpeed;
        if (p.kind === 'snitch') {
          p.x += p.speed * p.dir + windVelocity * 0.8;
          p.y += Math.sin(p.swing * 1.8) * 1.1;
          if (p.x > w + 28) { p.x = -24; p.y = Math.random() * h * 0.75; }
          if (p.x < -28) { p.x = w + 24; p.y = Math.random() * h * 0.75; }
          particleCtx.globalAlpha = p.alpha;
          particleCtx.drawImage(stamps.snitch, p.x - p.r * 0.5, p.y - p.r * 0.5, p.r, p.r);
        } else if (p.kind === 'candle') {
          p.y += Math.sin(p.swing) * 0.25;
          p.x += windVelocity * 0.2;
          if (p.x > w + 20) p.x = -16;
          if (p.x < -20) p.x = w + 16;
          particleCtx.globalAlpha = Math.max(0.45, Math.min(0.95, p.alpha + Math.sin(p.swing * 3) * 0.08));
          particleCtx.drawImage(stamps.candle, p.x - p.r * 0.5, p.y - p.r * 0.5, p.r, p.r);
        } else {
          p.y -= p.speed;
          p.x += Math.cos(p.swing) * 0.45 + (windVelocity * 0.5);
          p.alpha += Math.sin(p.swing * 2) * p.pulse;
          if (p.y < -12) { p.y = h + 10; p.x = Math.random() * w; }
          particleCtx.globalAlpha = Math.max(0.12, Math.min(0.95, p.alpha));
          if (p.kind === 'star') {
            var sStar = p.r * 5.2;
            particleCtx.drawImage(stamps.star, p.x - sStar * 0.5, p.y - sStar * 0.5, sStar, sStar);
          } else {
            var sDot = p.r * 5.4;
            particleCtx.drawImage(stamps.ember, p.x - sDot * 0.5, p.y - sDot * 0.5, sDot, sDot);
          }
        }
      } else if (currentParticleMode === 'liquid') {
        p.y -= p.speed;
        p.swing += p.swingSpeed;
        p.x += Math.sin(p.swing) * 0.35 + windVelocity * 0.45;
        if (p.y < -20) { p.y = h + 18; p.x = Math.random() * w; }
        particleCtx.globalAlpha = p.alpha;
        particleCtx.drawImage(stamps.liquid, p.x - p.r * 0.5, p.y - p.r * 0.5, p.r, p.r);
      } else if (currentParticleMode === 'rain') {
        if (p.isRipple) {
          p.r += 0.35;
          p.alpha = Math.max(0, 0.36 * (1 - p.r / p.maxR));
          if (p.r >= p.maxR) {
            p.r = 2;
            p.x = Math.random() * w;
            p.y = h * (0.76 + Math.random() * 0.22);
          }
          particleCtx.globalAlpha = p.alpha;
          particleCtx.strokeStyle = isLight ? 'rgba(46, 98, 82, 0.65)' : 'rgba(165, 208, 194, 0.6)';
          particleCtx.lineWidth = 1;
          particleCtx.beginPath();
          particleCtx.ellipse(p.x, p.y, p.r, p.r * 0.36, 0, 0, Math.PI * 2);
          particleCtx.stroke();
        } else {
          p.y += p.speed * 2.1;
          p.x += -0.65 + windVelocity * 0.65;
          if (p.y > h + 20) {
            p.y = -24;
            p.x = Math.random() * (w + 40);
          }
          if (p.x < -20) p.x = w + 10;
          particleCtx.globalAlpha = p.alpha;
          var rs = 26 * p.r;
          particleCtx.drawImage(stamps.rain, p.x - rs * 0.5, p.y - rs * 0.5, rs, rs);
        }
      } else if (currentParticleMode === 'petals') {
        p.y += p.speedY;
        p.swing += p.swingSpeed;
        p.x += p.speedX + Math.sin(p.swing) * 0.8 + windVelocity * 0.85;
        p.rot += p.rotSpeed;
        if (p.y > h + 16) {
          p.y = -14;
          p.x = Math.random() * w;
        }
        if (p.x > w + 16) p.x = -12;
        if (p.x < -16) p.x = w + 12;
        particleCtx.globalAlpha = p.alpha;
        particleCtx.save();
        particleCtx.translate(p.x, p.y);
        particleCtx.rotate(p.rot);
        var ps = p.r * 2.1;
        particleCtx.drawImage(stamps.petal, -ps * 0.5, -ps * 0.5, ps, ps);
        particleCtx.restore();
      } else if (currentParticleMode === 'herbarium') {
        p.y += p.speed;
        p.swing += p.swingSpeed;
        p.x += Math.cos(p.swing) * 0.35 + windVelocity * 0.4;
        p.rot += p.rotSpeed;
        if (p.y > h + 14) {
          p.y = -12;
          p.x = Math.random() * w;
        }
        if (p.x > w + 14) p.x = -10;
        if (p.x < -14) p.x = w + 10;
        particleCtx.globalAlpha = p.alpha;
        if (p.isLeaf) {
          particleCtx.save();
          particleCtx.translate(p.x, p.y);
          particleCtx.rotate(p.rot);
          var ls = p.r * 2.2;
          particleCtx.drawImage(stamps.leaf, -ls * 0.5, -ls * 0.5, ls, ls);
          particleCtx.restore();
        } else {
          var fs = p.r * 3;
          particleCtx.drawImage(stamps.fleck, p.x - fs * 0.5, p.y - fs * 0.5, fs, fs);
        }
      }
    }
    particleCtx.globalAlpha = 1;

    particleAnimId = requestAnimationFrame(loopParticles);
  }

  // Handle tab visibility to save 100% battery when in background
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (particleAnimId) {
        cancelAnimationFrame(particleAnimId);
        particleAnimId = null;
      }
    } else if (currentParticleMode && !particleAnimId) {
      loopParticles();
    }
  });

  /* --------------------------------------------------------------------------
     4. Number Count-Up Animation (Runs ONCE per data change)
     -------------------------------------------------------------------------- */
  function animateNumberEl(el, duration) {
    if (!el || el.dataset.animating === '1') return;
    var rawText = (el.textContent || '').trim();
    if (!rawText || rawText === '—') {
      el.dataset.lastAnimatedVal = rawText;
      return;
    }

    if (el.dataset.lastAnimatedVal === rawText) return;

    if (rawText.indexOf('·') !== -1) {
      var parts = rawText.split('·');
      var n1 = parseFloat(parts[0]);
      var n2 = parseFloat(parts[1]);
      if (!isNaN(n1) && !isNaN(n2)) {
        el.dataset.animating = '1';
        el.dataset.lastAnimatedVal = rawText;
        var startTimeCompound = null;
        var durCompound = duration || 600;

        function stepCompound(timestamp) {
          if (!startTimeCompound) startTimeCompound = timestamp;
          var progress = Math.min((timestamp - startTimeCompound) / durCompound, 1);
          var ease = 1 - Math.pow(1 - progress, 3);
          el.textContent = Math.round(n1 * ease) + ' · ' + Math.round(n2 * ease);

          if (progress < 1) {
            requestAnimationFrame(stepCompound);
          } else {
            el.textContent = rawText;
            el.dataset.animating = '0';
            el.classList.add('anim-pop');
            setTimeout(function () { el.classList.remove('anim-pop'); }, 300);
          }
        }
        requestAnimationFrame(stepCompound);
        return;
      }
    }

    var numMatch = rawText.match(/^([^\d]*)(\d+(?:\.\d+)?)(.*)$/);
    if (!numMatch) {
      el.dataset.lastAnimatedVal = rawText;
      return;
    }

    var prefix = numMatch[1] || '';
    var target = parseFloat(numMatch[2]);
    var suffix = numMatch[3] || '';
    if (isNaN(target)) {
      el.dataset.lastAnimatedVal = rawText;
      return;
    }

    var isFloat = numMatch[2].indexOf('.') !== -1;
    var startTime = null;
    var dur = duration || 650;

    el.dataset.animating = '1';
    el.dataset.lastAnimatedVal = rawText;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / dur, 1);
      var ease = 1 - Math.pow(1 - progress, 3);
      var currentVal = target * ease;

      el.textContent = prefix + (isFloat ? currentVal.toFixed(1) : Math.round(currentVal)) + suffix;

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = rawText;
        el.dataset.animating = '0';
        el.classList.add('anim-pop');
        setTimeout(function () {
          el.classList.remove('anim-pop');
        }, 300);
      }
    }

    requestAnimationFrame(step);
  }

  function setupNumberObserver() {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        var targetEl = m.target.nodeType === 3 ? m.target.parentElement : m.target;
        if (!targetEl || !targetEl.classList || !targetEl.classList.contains('stat-number')) return;
        if (targetEl.dataset.animating === '1') return;
        var currentText = (targetEl.textContent || '').trim();
        if (!currentText || currentText === '—' || targetEl.dataset.lastAnimatedVal === currentText) return;
        animateNumberEl(targetEl);
      });
    });

    document.querySelectorAll('.stat-number').forEach(function (el) {
      el.dataset.lastAnimatedVal = (el.textContent || '').trim();
      observer.observe(el, { childList: true, characterData: true, subtree: true });
    });
  }

  /* --------------------------------------------------------------------------
     5. Staggered Grid Item Animations
     -------------------------------------------------------------------------- */
  function observeStaggerGrids() {
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var children = entry.target.children;
          for (var i = 0; i < children.length; i++) {
            if (!children[i].classList.contains('anim-stagger-item')) {
              children[i].style.setProperty('--i', Math.min(i, 12));
              children[i].classList.add('anim-stagger-item');
            }
          }
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('#playlists-grid, #entries-container .grid-2, #top-picks, .recent-row').forEach(function (g) {
      io.observe(g);
    });
  }

  /* --------------------------------------------------------------------------
     6. Core Theme API
     -------------------------------------------------------------------------- */
  function apply(themeName) {
    if (themeName === 'classic') themeName = 'glass';
    if (!THEMES[themeName]) themeName = 'library';
    document.documentElement.setAttribute('data-visual-theme', themeName);
    try {
      localStorage.setItem('pl-visual-theme', themeName);
    } catch (e) { }

    var conf = THEMES[themeName];
    if (conf.font) {
      loadFont(conf.font);
    }
    syncWizardingDecor(themeName === 'wizarding');
    initParticles(conf.particles);

    if (typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('playlog:visual-theme', { detail: { theme: themeName } }));
    }
  }

  function get() {
    return document.documentElement.getAttribute('data-visual-theme') ||
      localStorage.getItem('pl-visual-theme') ||
      'library';
  }

  // Initialize on script execution
  var initial = get();
  apply(initial);

  document.addEventListener('DOMContentLoaded', function () {
    apply(get());
    setupNumberObserver();
    observeStaggerGrids();
    setTimeout(samplePosterGlow, 500);
  });

  window.PlaylogThemeEngine = {
    apply: apply,
    get: get,
    list: function () {
      return Object.keys(THEMES).filter(function (k) { return k !== 'classic'; }).map(function (k) {
        return { id: k, name: THEMES[k].name };
      });
    },
    animateNumbers: function () {
      document.querySelectorAll('.stat-number').forEach(function (el) {
        animateNumberEl(el);
      });
    },
    samplePosterGlow: samplePosterGlow
  };

})(window, document);
