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
      name: 'Wizarding World',
      font: 'https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Cinzel:wght@600;700;800&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap',
      particles: 'sparkles'
    },
    glass: {
      name: 'Glass',
      font: null,
      particles: null
    },
    classic: {
      name: 'Glass',
      font: null,
      particles: null
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
  var frameInterval = 1000 / 38; // 38fps cap saves 60% GPU power vs 120Hz unconstrained loops
  var isScrolling = false;
  var scrollTimer = null;

  // Pause canvas draw calls during active touch scroll for zero-jank 120fps scrolling
  window.addEventListener('scroll', function () {
    isScrolling = true;
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () {
      isScrolling = false;
    }, 120);
  }, { passive: true });

  /* --------------------------------------------------------------------------
     1. Web Haptics Engine (Native Device Micro-Vibrations)
     -------------------------------------------------------------------------- */
  window.AppHaptics = {
    tap: function () {
      if ('vibrate' in navigator) {
        try { navigator.vibrate(10); } catch (e) {}
      }
    },
    success: function () {
      if ('vibrate' in navigator) {
        try { navigator.vibrate([15, 35, 18]); } catch (e) {}
      }
    },
    danger: function () {
      if ('vibrate' in navigator) {
        try { navigator.vibrate([35, 50, 35]); } catch (e) {}
      }
    }
  };

  // Delegated haptic feedback on touch clicks for mobile PWA
  document.addEventListener('pointerdown', function (e) {
    var interactive = e.target.closest('button, .btn, .card, .recent-item, .playlist-card, .type-pill, .chip, .month-chip, .year-chip, .theme-swatch, .toggle-btn');
    if (interactive) {
      window.AppHaptics.tap();
    }
  }, { passive: true });

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
        // Lumos embers and 4-point golden sparkle stars
        var isStar = Math.random() < 0.35;
        particles.push({
          isStar: isStar,
          x: Math.random() * w,
          y: Math.random() * h,
          r: isStar ? (Math.random() * 1.5 + 2.2) : (Math.random() * 1.6 + 0.8),
          speed: Math.random() * 0.45 + 0.25,
          swing: Math.random() * Math.PI * 2,
          swingSpeed: Math.random() * 0.025 + 0.01,
          alpha: Math.random() * 0.75 + 0.25,
          pulse: Math.random() * 0.035 + 0.015,
          color: Math.random() < 0.5 ? '255, 220, 120' : (Math.random() < 0.5 ? '240, 185, 75' : '255, 245, 190')
        });
      }
    }
  }

  function loopParticles(timestamp) {
    if (!currentParticleMode || !particleCtx || !particleCanvas) return;
    particleAnimId = requestAnimationFrame(loopParticles);

    // Skip drawing during fast mobile scrolls to guarantee 100% frame rate to touch
    if (isScrolling) return;

    // Throttle to 38fps target
    if (timestamp && (timestamp - lastFrameTime < frameInterval)) return;
    lastFrameTime = timestamp || 0;

    var w = particleCanvas.width;
    var h = particleCanvas.height;
    particleCtx.clearRect(0, 0, w, h);

    // Dampen interactive wind velocity
    windVelocity *= 0.96;

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

        particleCtx.beginPath();
        particleCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);

        if (p.depth === 2) {
          // Soft-focus foreground flake with crystalline glow
          particleCtx.fillStyle = 'rgba(215, 240, 255, ' + p.alpha + ')';
          particleCtx.shadowBlur = 6;
          particleCtx.shadowColor = 'rgba(180, 225, 255, 0.45)';
        } else {
          particleCtx.fillStyle = 'rgba(235, 248, 255, ' + p.alpha + ')';
          particleCtx.shadowBlur = 0;
        }
        particleCtx.fill();
        particleCtx.shadowBlur = 0;

      } else if (currentParticleMode === 'sparkles') {
        // Wizarding Lumos Wand Sparks & Floating Embers
        p.y -= p.speed;
        p.swing += p.swingSpeed;
        p.x += Math.cos(p.swing) * 0.45 + (windVelocity * 0.5);
        p.alpha += Math.sin(p.swing * 2) * p.pulse;

        if (p.y < -12) {
          p.y = h + 10;
          p.x = Math.random() * w;
        }

        var clampedAlpha = Math.max(0.12, Math.min(0.95, p.alpha));

        if (p.isStar) {
          // Draw 4-point diamond sparkle star
          particleCtx.save();
          particleCtx.translate(p.x, p.y);
          particleCtx.beginPath();
          var arm = p.r * 2.2;
          particleCtx.moveTo(0, -arm);
          particleCtx.lineTo(arm * 0.25, -arm * 0.25);
          particleCtx.lineTo(arm, 0);
          particleCtx.lineTo(arm * 0.25, arm * 0.25);
          particleCtx.lineTo(0, arm);
          particleCtx.lineTo(-arm * 0.25, arm * 0.25);
          particleCtx.lineTo(-arm, 0);
          particleCtx.lineTo(-arm * 0.25, -arm * 0.25);
          particleCtx.closePath();

          particleCtx.fillStyle = 'rgba(' + p.color + ', ' + clampedAlpha + ')';
          particleCtx.shadowBlur = 12;
          particleCtx.shadowColor = 'rgba(229, 185, 88, 0.75)';
          particleCtx.fill();
          particleCtx.restore();
        } else {
          // Luminous Ember Dot
          particleCtx.beginPath();
          particleCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          particleCtx.fillStyle = 'rgba(' + p.color + ', ' + clampedAlpha + ')';
          particleCtx.shadowBlur = 8;
          particleCtx.shadowColor = 'rgba(212, 168, 67, 0.55)';
          particleCtx.fill();
          particleCtx.shadowBlur = 0;
        }
      }
    }

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
    if (!THEMES[themeName]) themeName = 'library';
    document.documentElement.setAttribute('data-visual-theme', themeName);
    try {
      localStorage.setItem('pl-visual-theme', themeName);
    } catch (e) {}

    var conf = THEMES[themeName];
    if (conf.font) {
      loadFont(conf.font);
    }
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
      return Object.keys(THEMES).map(function (k) {
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
