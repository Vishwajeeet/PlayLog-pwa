var TIMER_CAP_MS = 4 * 60 * 60 * 1000;
var TIMER_MIN_SESSION_MS = 30 * 1000;
var TIMER_ACTIVE_KEY = 'pl-timers-active';
var timerState = { uid: null, entries: [], libraryEntries: [], timers: {}, selectedId: null, query: '', refresh: null, cappedPainted: {} };
var timerCompleting = {};
var timerParams = new URLSearchParams(window.location.search);

function timerEntry(id) {
  return timerState.entries.filter(function (entry) { return entry.id === id; })[0] || null;
}

function timerRef(id) {
  return db.collection('users').doc(timerState.uid).collection('timers').doc(id);
}

function timerData(data, entry) {
  data = data || {};
  return {
    title: data.title || (entry && entry.title) || 'Untitled game',
    poster: data.poster || (entry && entry.poster) || null,
    startedAt: typeof data.startedAt === 'number' ? data.startedAt : null,
    sessions: Array.isArray(data.sessions) ? data.sessions.slice() : []
  };
}

function timerElapsed(data, now) {
  var total = (data.sessions || []).reduce(function (sum, session) {
    return sum + Math.max(0, Number(session.e) - Number(session.s));
  }, 0);
  if (data.startedAt != null) total += Math.min(Math.max(0, now - data.startedAt), TIMER_CAP_MS);
  return total;
}

function timerFormat(ms) {
  var seconds = Math.floor(Math.max(0, ms) / 1000);
  var hours = Math.floor(seconds / 3600);
  var minutes = Math.floor(seconds % 3600 / 60);
  var remainder = seconds % 60;
  return (hours < 10 ? '0' : '') + hours + ':' +
    (minutes < 10 ? '0' : '') + minutes + ':' +
    (remainder < 10 ? '0' : '') + remainder;
}

function timerPrettyDuration(ms) {
  var minutes = Math.floor(Math.max(0, ms) / 60000);
  var hours = Math.floor(minutes / 60);
  var rest = minutes % 60;
  if (!hours) return rest + ' min';
  return hours + ' hr' + (hours === 1 ? '' : 's') + (rest ? ' ' + rest + ' min' : '');
}

function timerLocalInput(ms) {
  var d = new Date(ms), pad = function (n) { return n < 10 ? '0' + n : String(n); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function timerDateText(ms) {
  return new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function timerVibrate() {
  if (navigator.vibrate) navigator.vibrate(15);
}

function timerFinalizeIfExpired(uid, id) {
  var ref = db.collection('users').doc(uid).collection('timers').doc(id);
  return db.runTransaction(function (tx) {
    return tx.get(ref).then(function (snap) {
      if (!snap.exists) return null;
      var data = timerData(snap.data(), timerEntry(id));
      var now = Date.now();
      if (data.startedAt != null && now - data.startedAt >= TIMER_CAP_MS) {
        data.sessions.push({ s: data.startedAt, e: data.startedAt + TIMER_CAP_MS, auto: true, adj: false });
        data.startedAt = null;
        tx.set(ref, data, { merge: false });
      }
      return data;
    });
  });
}

function timerSaveActiveSummary(uid, timers) {
  var now = Date.now(), active = [];
  Object.keys(timers).forEach(function (id) {
    var data = timers[id];
    if (data.startedAt != null && now - data.startedAt < TIMER_CAP_MS) {
      active.push({ id: id, title: data.title, startedAt: data.startedAt });
    }
  });
  var mirror = { uid: uid, timers: active };
  try { localStorage.setItem(TIMER_ACTIVE_KEY, JSON.stringify(mirror)); } catch (e) {}
  var prefs = db.collection('users').doc(uid).collection('settings').doc('prefs');
  return prefs.set({ timersActive: active }, { merge: true });
}

function timerRefresh(force) {
  if (timerState.refresh) {
    if (!force) return timerState.refresh;
    return timerState.refresh.then(function () { return timerRefresh(); }, function () { return timerRefresh(); });
  }
  var uid = timerState.uid;
  timerState.refresh = db.collection('users').doc(uid).collection('timers').get().then(function (snap) {
    return Promise.all(snap.docs.map(function (doc) {
      var raw = doc.data();
      if (raw.startedAt == null || typeof raw.startedAt !== 'number' || Date.now() - raw.startedAt < TIMER_CAP_MS) {
        return Promise.resolve([doc.id, timerData(raw, timerEntry(doc.id))]);
      }
      return timerFinalizeIfExpired(uid, doc.id).then(function (data) {
        return data ? [doc.id, data] : null;
      });
    }));
  }).then(function (pairs) {
    var timers = {};
    pairs.forEach(function (pair) { if (pair) timers[pair[0]] = pair[1]; });
    timerState.timers = timers;
    timerState.cappedPainted = {};
    renderTimerList();
    renderTimerDetail();
    timerTick();
    return timerSaveActiveSummary(uid, timers).catch(function (err) {
      console.error('Could not update active timer summary.', err);
      AppUtils.showToast('Timer saved, but Home summary could not sync.');
    });
  }).catch(function (err) {
    console.error('Could not load timers.', err);
    AppUtils.showToast('Could not load your timers. Check your connection.');
    throw err;
  }).then(function (value) {
    timerState.refresh = null;
    return value;
  }, function (err) {
    timerState.refresh = null;
    throw err;
  });
  return timerState.refresh;
}

function timerAfterWrite(id, data) {
  if (data) timerState.timers[id] = data;
  else delete timerState.timers[id];
  renderTimerList();
  renderTimerDetail();
  timerTick();
  return timerRefresh(true).catch(function (err) {
    console.error('Timer change saved, but the list could not refresh.', err);
    AppUtils.showToast('Timer saved, but the list could not refresh.');
  });
}

function timerStart(entry) {
  var now = Date.now(), ref = timerRef(entry.id);
  return db.runTransaction(function (tx) {
    return tx.get(ref).then(function (snap) {
      var data = timerData(snap.exists ? snap.data() : null, entry);
      if (data.startedAt != null && now - data.startedAt < TIMER_CAP_MS) {
        return { changed: false, data: data };
      }
      if (data.startedAt != null) {
        data.sessions.push({ s: data.startedAt, e: data.startedAt + TIMER_CAP_MS, auto: true, adj: false });
      }
      data.title = entry.title;
      data.poster = entry.poster || null;
      data.startedAt = now;
      tx.set(ref, data, { merge: false });
      return { changed: true, data: data };
    });
  }).then(function (result) {
    if (!result.changed) {
      AppUtils.showToast('This timer is already running.');
      return timerAfterWrite(entry.id, result.data);
    }
    timerVibrate();
    return timerAfterWrite(entry.id, result.data);
  });
}

function timerStartFlow(entry) {
  if (entry.completionStatus !== 'wishlist' && entry.completionStatus !== 'dropped') return timerStart(entry);
  timerShowDialog('Start tracking?', '<p class="text-sm text-muted" style="margin-bottom:20px">' + AppUtils.esc(entry.title) + ' will move to Currently Playing and its timer will start.</p>', 'Move & start', function () {
    var now = new Date();
    return AppDB.getOrCreatePlaylist(timerState.uid, 'Currently Playing', 'game').then(function (playlistId) {
      var update = { playlistId: playlistId, completionStatus: 'playing', monthWatched: now.getMonth() + 1, yearWatched: now.getFullYear() };
      return AppDB.updateEntry(timerState.uid, entry.id, update).then(function () {
        Object.assign(entry, update);
        return timerStart(entry);
      });
    });
  });
  return Promise.resolve();
}

function timerStop(entry, quiet) {
  var now = Date.now(), ref = timerRef(entry.id);
  return db.runTransaction(function (tx) {
    return tx.get(ref).then(function (snap) {
      if (!snap.exists) return { changed: false };
      var data = timerData(snap.data(), entry);
      if (data.startedAt == null) return { changed: false, data: data };
      var elapsed = now - data.startedAt;
      if (elapsed >= TIMER_CAP_MS) {
        data.sessions.push({ s: data.startedAt, e: data.startedAt + TIMER_CAP_MS, auto: true, adj: false });
      } else if (elapsed >= TIMER_MIN_SESSION_MS) {
        data.sessions.push({ s: data.startedAt, e: now, auto: false, adj: false });
      }
      data.startedAt = null;
      tx.set(ref, data, { merge: false });
      return { changed: true, data: data };
    });
  }).then(function (result) {
    if (result.changed) timerVibrate();
    if (!result.changed && !quiet) AppUtils.showToast('This timer is not running.');
    return timerAfterWrite(entry.id, result.data);
  });
}

function timerMutateSessions(entry, mutate) {
  var ref = timerRef(entry.id);
  return db.runTransaction(function (tx) {
    return tx.get(ref).then(function (snap) {
      var data = timerData(snap.exists ? snap.data() : null, entry);
      if (data.startedAt != null && Date.now() - data.startedAt >= TIMER_CAP_MS) {
        data.sessions.push({ s: data.startedAt, e: data.startedAt + TIMER_CAP_MS, auto: true, adj: false });
        data.startedAt = null;
      }
      data.sessions = mutate(data.sessions.slice(), data);
      data.title = entry.title;
      data.poster = entry.poster || null;
      tx.set(ref, data, { merge: false });
      return data;
    });
  }).then(function (data) { return timerAfterWrite(entry.id, data); });
}

function renderTimerList() {
  var list = document.getElementById('timer-list');
  var empty = document.getElementById('timer-empty');
  var search = String(timerState.query || '').toLowerCase().trim();
  var games = timerState.entries.filter(function (entry) {
    return entry.type === 'game' && entry.completionStatus !== 'completed' &&
      (search ? String(entry.title || '').toLowerCase().indexOf(search) !== -1 : timerIsTracked(entry));
  }).sort(function (a, b) {
    var at = timerState.timers[a.id], bt = timerState.timers[b.id];
    var ar = at && at.startedAt != null && Date.now() - at.startedAt < TIMER_CAP_MS ? 0 : 1;
    var br = bt && bt.startedAt != null && Date.now() - bt.startedAt < TIMER_CAP_MS ? 0 : 1;
    return ar - br || String(a.title).localeCompare(String(b.title));
  });
  list.innerHTML = '';
  games.forEach(function (entry) {
    var data = timerState.timers[entry.id] || timerData(null, entry);
    var running = data.startedAt != null && Date.now() - data.startedAt < TIMER_CAP_MS;
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'timer-list-card' + (running ? ' running' : '') + (entry.id === timerState.selectedId ? ' selected' : '');
    card.dataset.id = entry.id;
    var poster = AppUtils.getPosterUrl(entry.poster);
    var chip = entry.completionStatus === 'wishlist' || entry.completionStatus === 'dropped' ? '<span class="timer-card-chip">' + entry.completionStatus + '</span>' : '';
    card.innerHTML = '<span class="timer-card-art">' + (poster ? '<img src="' + AppUtils.esc(poster) + '" alt="">' : '') + '</span><span class="timer-card-shade"></span>' + chip +
      (running ? '<span class="timer-live-dot" aria-label="Running"></span>' : '') +
      '<span class="timer-card-info"><span class="timer-list-title">' + AppUtils.esc(entry.title) + '</span>' +
      '<span class="timer-list-time" data-id="' + AppUtils.esc(entry.id) + '">' + timerFormat(timerElapsed(data, Date.now())) + '</span></span>';
    card.addEventListener('click', function () {
      timerState.selectedId = entry.id;
      renderTimerList();
      renderTimerDetail();
    });
    list.appendChild(card);
  });
  var hasAny = timerState.entries.some(function (entry) { return entry.type === 'game' && entry.completionStatus !== 'completed'; });
  empty.hidden = games.length > 0;
  empty.textContent = !hasAny ? 'No games to track yet. Add a game and mark it as Playing to get started.' :
    (search ? 'No matching games in your library. Search IGDB below to add one.' : 'Nothing tracked yet. Search for a game above to start a timer.');
  renderIGDBOffer(search, games.length);
}

function renderIGDBOffer(query, count) {
  var box = document.getElementById('timer-igdb');
  if (!query || count) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = '<button type="button" class="btn btn-ghost" id="timer-igdb-search">Search IGDB for “' + AppUtils.esc(query) + '”</button>';
  box.querySelector('#timer-igdb-search').onclick = function () { timerSearchIGDB(query); };
}

function renderTimerDetail() {
  var panel = document.getElementById('timer-detail');
  var content = document.getElementById('timer-detail-content');
  var entry = timerEntry(timerState.selectedId);
  if (!entry) {
    content.innerHTML = '<div class="timer-empty">Select a game to see its timer and sessions.</div>';
    panel.classList.remove('is-open');
    return;
  }
  var data = timerState.timers[entry.id] || timerData(null, entry);
  var running = data.startedAt != null && Date.now() - data.startedAt < TIMER_CAP_MS;
  var total = timerElapsed(data, Date.now());
  var sessionMs = running ? Math.min(Math.max(0, Date.now() - data.startedAt), TIMER_CAP_MS) : 0;
  var pct = sessionMs / TIMER_CAP_MS;
  var poster = AppUtils.getPosterUrl(entry.poster);
  var sessions = data.sessions.slice().map(function (session, index) {
    return { session: session, index: index };
  }).sort(function (a, b) { return Number(b.session.s) - Number(a.session.s); });
  var status = entry.completionStatus || 'Playing';
  var html = '<div class="timer-game-head">' +
    (poster ? '<img class="timer-detail-poster" src="' + AppUtils.esc(poster) + '" alt="">' : '<div class="timer-detail-poster"></div>') +
    '<div><h2 class="timer-game-name">' + AppUtils.esc(entry.title) + '</h2><p class="timer-game-status">' + AppUtils.esc(status.charAt(0).toUpperCase() + status.slice(1)) + '</p></div></div>' +
    '<div class="timer-clock-card"><svg class="timer-ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="ring-track" cx="50" cy="50" r="44"></circle><circle class="ring-value" cx="50" cy="50" r="44" style="stroke-dashoffset:' + (276.46 * (1 - pct)) + '"></circle></svg>' +
    '<div class="timer-clock-copy"><span class="timer-clock" data-clock="' + AppUtils.esc(entry.id) + '">' + timerFormat(total) + '</span><span class="timer-clock-label">Total tracked</span><span class="timer-clock-sub" data-sub>' + (running ? 'Session ' + timerFormat(sessionMs) : 'Timer stopped') + '</span></div></div>';
  if (entry.completionStatus === 'wishlist' || entry.completionStatus === 'dropped') {
    html += '<p class="timer-hint">Starting the timer moves this game to Currently Playing.</p>' +
      '<div class="timer-game-actions"><button type="button" class="btn btn-primary" id="timer-start">Start timer</button>' +
      '<button type="button" class="btn btn-ghost timer-complete" id="timer-complete">Mark completed</button></div>';
  } else {
    html += '<div class="timer-game-actions">' +
      (running ? '<button type="button" class="btn btn-danger" id="timer-stop">Stop timer</button>' : '<button type="button" class="btn btn-primary" id="timer-start">Start timer</button>') +
      '<button type="button" class="btn btn-ghost timer-complete" id="timer-complete">Mark completed</button></div>';
  }
  html += '<h3 class="timer-section-title">Sessions</h3><div class="timer-sessions">' +
    (sessions.map(function (record) {
      var session = record.session;
      var badges = (session.auto ? '<span class="timer-badge">Auto-stopped</span>' : '') +
        (session.adj ? '<span class="timer-badge">Adjusted</span>' : '');
      return '<div class="timer-session"><div class="timer-session-copy"><span class="timer-session-date">' + AppUtils.esc(timerDateText(Number(session.s))) + '</span>' +
        '<span class="timer-session-duration">' + AppUtils.esc(timerPrettyDuration(Number(session.e) - Number(session.s))) + '</span>' +
        (badges ? '<span class="timer-session-badges">' + badges + '</span>' : '') +
        '</div><div class="timer-session-actions"><button type="button" data-edit="' + record.index + '" aria-label="Edit session">Edit</button><button type="button" data-delete="' + record.index + '" aria-label="Delete session">×</button></div></div>';
    }).join('') || '<p class="text-sm text-muted">No saved sessions yet.</p>') + '</div>' +
    '<div class="timer-detail-tools"><button type="button" id="timer-add-time">Add time manually</button><button type="button" id="timer-set-total">Set total</button></div>';
  content.innerHTML = html;
  panel.classList.add('is-open');
  var startButton = content.querySelector('#timer-start');
  if (startButton) startButton.onclick = function () {
    var needsMove = entry.completionStatus === 'wishlist' || entry.completionStatus === 'dropped';
    if (!needsMove) startButton.disabled = true;
    timerStartFlow(entry).catch(timerOperationError);
  };
  var stopButton = content.querySelector('#timer-stop');
  if (stopButton) stopButton.onclick = function () { stopButton.disabled = true; timerStop(entry).catch(timerOperationError); };
  var completeButton = content.querySelector('#timer-complete');
  if (completeButton) completeButton.onclick = function () { completeButton.disabled = true; timerComplete(entry); };
  content.querySelectorAll('[data-edit]').forEach(function (button) {
    button.onclick = function () { timerEditSession(entry, Number(button.dataset.edit)); };
  });
  content.querySelectorAll('[data-delete]').forEach(function (button) {
    button.onclick = function () { timerDeleteSession(entry, Number(button.dataset.delete)); };
  });
  content.querySelector('#timer-add-time').onclick = function () { timerAddSession(entry); };
  content.querySelector('#timer-set-total').onclick = function () { timerSetTotal(entry); };
}

function timerTick() {
  var now = Date.now(), active = timerState.entries.filter(function (entry) {
    var data = timerState.timers[entry.id];
    return data && data.startedAt != null && now - data.startedAt < TIMER_CAP_MS;
  });
  var newlyCapped = false;
  timerState.entries.forEach(function (entry) {
    var data = timerState.timers[entry.id];
    if (data && data.startedAt != null && now - data.startedAt >= TIMER_CAP_MS && !timerState.cappedPainted[entry.id]) {
      timerState.cappedPainted[entry.id] = true;
      newlyCapped = true;
    }
    var node = Array.prototype.filter.call(document.querySelectorAll('.timer-list-time'), function (item) {
      return item.dataset.id === entry.id;
    })[0];
    if (node) node.textContent = timerFormat(timerElapsed(timerState.timers[entry.id] || timerData(null, entry), now));
  });
  if (newlyCapped) {
    renderTimerList();
    renderTimerDetail();
  }
  var current = timerEntry(timerState.selectedId);
  if (current) {
    var clock = Array.prototype.filter.call(document.querySelectorAll('[data-clock]'), function (item) {
      return item.dataset.clock === current.id;
    })[0];
    if (clock) {
      var data = timerState.timers[current.id] || timerData(null, current);
      clock.textContent = timerFormat(timerElapsed(data, now));
      var ring = document.querySelector('.timer-ring .ring-value');
      var live = data.startedAt != null && now - data.startedAt < TIMER_CAP_MS;
      var sMs = live ? now - data.startedAt : 0;
      if (ring) ring.style.strokeDashoffset = String(276.46 * (1 - sMs / TIMER_CAP_MS));
      var sub = document.querySelector('[data-sub]');
      if (sub) sub.textContent = live ? 'Session ' + timerFormat(sMs) : 'Timer stopped';
    }
  }
  if (active.length) {
    var titleEntry = current && active.filter(function (entry) { return entry.id === current.id; })[0] || active[0];
    document.title = timerFormat(timerElapsed(timerState.timers[titleEntry.id], now)) + ' — ' + titleEntry.title + ' · Playlog';
  } else {
    document.title = 'Playtime Tracker — Playlog';
  }
}

function timerOperationError(err) {
  console.error('Timer operation failed.', err);
  AppUtils.showToast('Could not save timer. Check your connection and try again.');
  renderTimerDetail();
}

function timerShowDialog(title, body, saveText, onSave) {
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay open timer-dialog';
  overlay.innerHTML = '<div class="modal-box"><p class="modal-title">' + AppUtils.esc(title) + '</p>' + body +
    '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="button" class="btn btn-primary" data-save>' + AppUtils.esc(saveText) + '</button></div></div>';
  document.body.appendChild(overlay);
  overlay.querySelector('[data-cancel]').onclick = function () { overlay.remove(); };
  var pv = overlay.querySelector('[data-preview]'), pin = overlay.querySelector('#timer-manual-minutes, #timer-total-minutes');
  if (pv && pin) {
    var showPv = function () {
      var m = timerParseMinutes(pin.value);
      pv.textContent = isFinite(m) ? '= ' + timerPrettyDuration(Math.round(m) * 60000) : 'Try 100m, 1h 40m, 1.5h or 1:40';
    };
    pin.addEventListener('input', showPv);
    showPv();
  }
  overlay.addEventListener('click', function (event) { if (event.target === overlay) overlay.remove(); });
  overlay.querySelector('[data-save]').onclick = function () {
    var button = this;
    var result = onSave(overlay);
    if (result === false) return;
    if (result && typeof result.then === 'function') {
      button.disabled = true;
      result.then(function () { overlay.remove(); }).catch(function (err) {
        button.disabled = false;
        if (err && err.message === 'Total cannot be less than the time on the running timer.') {
          AppUtils.showToast(err.message);
        } else timerOperationError(err);
      });
    } else overlay.remove();
  };
  return overlay;
}

function timerEditSession(entry, index) {
  var current = (timerState.timers[entry.id] || timerData(null, entry)).sessions[index];
  if (!current) return;
  var body = '<label class="label" for="timer-edit-start">Start</label><input class="input-field" id="timer-edit-start" type="datetime-local" value="' + timerLocalInput(Number(current.s)) + '">' +
    '<label class="label" for="timer-edit-end">End</label><input class="input-field" id="timer-edit-end" type="datetime-local" value="' + timerLocalInput(Number(current.e)) + '">' +
    '<p class="timer-dialog-note">Times must be at least 30 seconds apart and cannot be in the future.</p>';
  timerShowDialog('Edit session', body, 'Save session', function (overlay) {
    var start = new Date(overlay.querySelector('#timer-edit-start').value).getTime();
    var end = new Date(overlay.querySelector('#timer-edit-end').value).getTime();
    if (!isFinite(start) || !isFinite(end) || end - start < TIMER_MIN_SESSION_MS || end > Date.now()) {
      AppUtils.showToast('Choose a valid time range in the past (at least 30 seconds).');
      return false;
    }
    return timerMutateSessions(entry, function (sessions) {
      if (!sessions[index] || sessions[index].s !== current.s || sessions[index].e !== current.e) throw new Error('Session changed on another device.');
      sessions[index] = { s: start, e: end, auto: !!current.auto, adj: !!current.adj };
      return sessions;
    });
  });
}

function timerDeleteSession(entry, index) {
  var data = timerState.timers[entry.id] || timerData(null, entry);
  var current = data.sessions[index];
  if (!current) return;
  timerShowDialog('Delete session?', '<p class="text-sm text-muted" style="margin-bottom:20px">This saved session will be removed.</p>', 'Delete session', function () {
    return timerMutateSessions(entry, function (sessions) {
      if (!sessions[index] || sessions[index].s !== current.s || sessions[index].e !== current.e) throw new Error('Session changed on another device.');
      sessions.splice(index, 1);
      return sessions;
    });
  });
}

function timerParseMinutes(text) {
  var s = String(text || '').toLowerCase().trim().replace(/,/g, '.');
  if (!s) return NaN;
  var m = /^(\d+):(\d{1,2})$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  m = /^(?:(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours))?\s*(?:(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)?)?$/.exec(s);
  if (!m || (m[1] == null && m[2] == null)) return NaN;
  return (m[1] ? Number(m[1]) * 60 : 0) + (m[2] ? Number(m[2]) : 0);
}

function timerIsTracked(entry) {
  var data = timerState.timers[entry.id];
  return !!(data && (data.startedAt != null || data.sessions.length));
}

function timerAddSession(entry) {
  var now = new Date(), localDate = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2);
  var body = '<label class="label" for="timer-manual-date">Date</label><input class="input-field" id="timer-manual-date" type="date" value="' + localDate + '">' +
    '<label class="label" for="timer-manual-minutes">How long?</label><input class="input-field" id="timer-manual-minutes" type="text" autocomplete="off" placeholder="e.g. 100m, 1h 40m, 1:40" value="1h"><p class="timer-dialog-note" data-preview></p>' +
    '<p class="timer-dialog-note">Manually added sessions must be at least 30 seconds and end no later than now.</p>';
  timerShowDialog('Add time manually', body, 'Add session', function (overlay) {
    var date = overlay.querySelector('#timer-manual-date').value;
    var minutes = Math.round(timerParseMinutes(overlay.querySelector('#timer-manual-minutes').value));
    var end = date === localDate ? Date.now() : new Date(date + 'T12:00:00').getTime();
    var start = end - minutes * 60000;
    if (!date || !isFinite(end) || !isFinite(minutes) || minutes < 1 || start >= end || end > Date.now()) {
      AppUtils.showToast('Choose a past date and a positive duration.');
      return false;
    }
    return timerMutateSessions(entry, function (sessions) {
      sessions.push({ s: start, e: end, auto: false, adj: false });
      return sessions;
    });
  });
}

function timerSetTotal(entry) {
  var current = timerState.timers[entry.id] || timerData(null, entry);
  var total = timerElapsed(current, Date.now());
  var body = '<label class="label" for="timer-total-minutes">Total time</label><input class="input-field" id="timer-total-minutes" type="text" autocomplete="off" placeholder="e.g. 100m, 1h 40m, 1:40" value="' + Math.floor(total / 60000) + 'm"><p class="timer-dialog-note" data-preview></p>' +
    '<p class="timer-dialog-note">Saved sessions will be adjusted to match. A currently running timer keeps running.</p>';
  timerShowDialog('Set total tracked time', body, 'Set total', function (overlay) {
    var minutes = Math.round(timerParseMinutes(overlay.querySelector('#timer-total-minutes').value));
    if (!isFinite(minutes) || minutes < 0 || Math.floor(minutes) !== minutes) {
      AppUtils.showToast('Enter a time like 100m or 1h 40m.');
      return false;
    }
    return timerMutateSessions(entry, function (sessions, latest) {
      var now = Date.now();
      var runningMs = latest.startedAt == null ? 0 : Math.min(Math.max(0, now - latest.startedAt), TIMER_CAP_MS);
      var target = minutes * 60000 - runningMs;
      if (target < 0) throw new Error('Total cannot be less than the time on the running timer.');
      var totalSaved = sessions.reduce(function (sum, session) { return sum + Math.max(0, session.e - session.s); }, 0);
      var remaining = target, adjusted = [], cut = target < totalSaved;
      sessions.sort(function (a, b) { return a.s - b.s; }).some(function (session) {
        var duration = Math.max(0, session.e - session.s);
        if (remaining <= 0) return true;
        if (duration <= remaining) {
          adjusted.push(session);
          remaining -= duration;
          return false;
        }
        adjusted.push({ s: session.s, e: session.s + remaining, auto: !!session.auto, adj: true });
        remaining = 0;
        return true;
      });
      if (remaining > 0) {
        var end = Date.now();
        adjusted.push({ s: end - remaining, e: end, auto: false, adj: true });
      } else if (cut && adjusted.length) {
        adjusted[adjusted.length - 1].adj = true;
      }
      return adjusted;
    });
  });
}

function timerComplete(entry) {
  if (timerCompleting[entry.id]) return;
  timerCompleting[entry.id] = true;
  var entrySaved = false, timerDeleted = false;
  var stopped = timerStop(entry, true);
  stopped.then(function () {
    var current = timerState.timers[entry.id] || timerData(null, entry);
    var totalMinutes = timerElapsed(current, Date.now()) / 60000 + (Number(entry.playtime) || 0) * 60;
    var hours = Math.floor(totalMinutes / 60);
    if (totalMinutes % 60 >= 30) hours++;
    return AppFlow.ask(Object.assign({}, entry, { playtime: hours || null }), 'completed');
  }).then(function (details) {
    if (!details) { timerCompleting[entry.id] = false; return; }
    return AppDB.getOrCreatePlaylist(timerState.uid, 'Completed Games', 'game').then(function (playlistId) {
      var update = Object.assign({}, details, { playlistId: playlistId });
      return AppDB.updateEntry(timerState.uid, entry.id, update).then(function () {
        entrySaved = true;
        var index = -1;
        timerState.libraryEntries.some(function (item, i) {
          if (item.id === entry.id) { index = i; return true; }
          return false;
        });
        var updatedEntry = Object.assign({}, entry, update);
        if (index >= 0) timerState.libraryEntries[index] = updatedEntry;
        else timerState.libraryEntries.push(updatedEntry);
        timerState.entries = timerState.entries.filter(function (item) { return item.id !== entry.id; });
        timerState.selectedId = timerState.entries.length ? timerState.entries[0].id : null;
      });
    }).then(function () {
      return timerRef(entry.id).delete();
    }).then(function () {
      timerDeleted = true;
      return timerRefresh(true);
    }).then(function () {
      AppUtils.showToast('Game marked completed ✓');
      timerCompleting[entry.id] = false;
    });
  }).catch(function (err) {
    timerCompleting[entry.id] = false;
    console.error('Could not complete game.', err);
    if (entrySaved && !timerDeleted) {
      AppUtils.showToast('Game completed, but its timer record could not be deleted.');
      timerRefresh(true).catch(function () {});
    } else if (entrySaved) {
      AppUtils.showToast('Game completed, but the timer list could not refresh.');
    } else {
      AppUtils.showToast('Could not complete this game. Your timer is saved.');
    }
    renderTimerDetail();
  });
}

function timerNormalize(title) {
  return String(title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function timerDuplicate(result) {
  var normalized = timerNormalize(result.title);
  var matches = timerState.libraryEntries.filter(function (entry) {
    return entry.type === 'game' &&
      ((result.igdbId && entry.igdbId && String(result.igdbId) === String(entry.igdbId)) ||
        (normalized && timerNormalize(entry.title) === normalized));
  });
  return matches.filter(function (entry) { return entry.completionStatus === 'completed'; })[0] || matches[0] || null;
}

function timerHandleResult(result) {
  var duplicate = timerDuplicate(result);
  if (duplicate) {
    if (duplicate.completionStatus === 'completed') {
      AppUtils.showToast(duplicate.title + ' is already completed.');
      return;
    }
    timerState.selectedId = duplicate.id;
    renderTimerList();
    renderTimerDetail();
    if (duplicate.completionStatus === 'playing') timerStart(duplicate).catch(timerOperationError);
    else AppUtils.showToast('Already in your library. Tap Start to move it to Currently Playing.');
    return;
  }
  var now = new Date();
  AppDB.getOrCreatePlaylist(timerState.uid, 'Currently Playing', 'game').then(function (playlistId) {
    var genres = Array.isArray(result.genres) ? result.genres : [];
    var entry = {
      playlistId: playlistId,
      title: result.title,
      type: 'game',
      poster: result.poster || null,
      releaseYear: parseInt(result.releaseYear || 0, 10) || null,
      genres: genres,
      addedAt: null,
      igdbId: result.igdbId || null,
      igdbPending: !!result.igdbPending,
      tmdbId: null,
      season: null,
      seasonName: null,
      completionStatus: 'playing',
      gameRating: null,
      playtime: null,
      category: genres[0] || null,
      review: null,
      dropReason: null,
      monthWatched: now.getMonth() + 1,
      yearWatched: now.getFullYear(),
      rating: null,
      runtime: 0
    };
    return AppDB.addEntry(timerState.uid, entry).then(function (ref) {
      entry.id = ref.id;
      timerState.entries.push(entry);
      timerState.libraryEntries.push(entry);
      timerState.selectedId = entry.id;
      return timerStart(entry).then(function () {
        renderTimerList();
        renderTimerDetail();
      }).catch(function (err) {
        console.error('Game was added but its timer could not start.', err);
        AppUtils.showToast('Game added, but timer could not start. Try starting it again.');
        renderTimerList();
        renderTimerDetail();
      });
    });
  }).catch(function (err) {
    console.error('Could not add game from tracker search.', err);
    AppUtils.showToast('Could not add this game. Check your connection.');
  });
}

function timerSearchIGDB(query) {
  var box = document.getElementById('timer-igdb');
  box.innerHTML = '<p class="text-sm text-muted">Searching IGDB…</p>';
  box.hidden = false;
  AppIGDB.searchGames(query).then(function (results) {
    box.innerHTML = '';
    if (!results.length) {
      box.innerHTML = '<p class="text-sm text-muted">No IGDB results. Add it manually instead.</p>';
    }
    results.forEach(function (result) {
      var button = document.createElement('button');
      var poster = AppUtils.getPosterUrl(result.poster);
      button.innerHTML = (poster ? '<img src="' + AppUtils.esc(poster) + '" alt="">' : '<span class="timer-list-poster"></span>') +
        '<span><b>' + AppUtils.esc(result.title) + '</b>' + (result.releaseYear ? '<br><span class="text-sm text-muted">' + AppUtils.esc(result.releaseYear) + '</span>' : '') + '</span>';
      button.onclick = function () { timerHandleResult(result); };
      box.appendChild(button);
    });
    var manual = document.createElement('button');
    manual.className = 'btn btn-ghost';
    manual.textContent = 'Add manually instead';
    manual.onclick = timerManualAdd;
    box.appendChild(manual);
  }).catch(function (err) {
    console.error('IGDB search failed.', err);
    AppUtils.showToast(err.message || 'IGDB search failed. You can add the game manually.');
    box.innerHTML = '<button type="button" class="btn btn-ghost" id="timer-manual-fallback">Add manually</button>';
    box.querySelector('#timer-manual-fallback').onclick = timerManualAdd;
  });
}

function timerManualAdd() {
  var body = '<label class="label" for="timer-manual-title">Game title</label><input class="input-field" id="timer-manual-title" type="text" maxlength="120" autocomplete="off">' +
    '<p class="timer-dialog-note">The game will be added to Currently Playing and its timer will start.</p>';
  var overlay = timerShowDialog('Add game manually', body, 'Add and start', function (dialog) {
    var title = dialog.querySelector('#timer-manual-title').value.trim();
    if (!title) {
      AppUtils.showToast('Enter a game name.');
      dialog.querySelector('#timer-manual-title').focus();
      return false;
    }
    timerHandleResult({ type: 'game', title: title, poster: null, releaseYear: '', genres: [], igdbId: null, igdbPending: true });
    return true;
  });
  overlay.querySelector('#timer-manual-title').focus();
}

function timerInit(user) {
  timerState.uid = user.uid;
  document.getElementById('brand-bar').onclick = function () { window.location.href = '/home.html'; };
  document.getElementById('timer-back').onclick = function () {
    if (window.history.length > 1) window.history.back();
    else window.location.href = '/home.html?tab=games';
  };
  document.getElementById('timer-detail-close').onclick = function () {
    timerState.selectedId = null;
    renderTimerList();
    renderTimerDetail();
  };
  document.getElementById('timer-search').addEventListener('input', function () {
    timerState.query = this.value;
    renderTimerList();
  });
  Promise.all([AppDB.getAllEntries(user.uid), timerRefresh()]).then(function (results) {
    timerState.libraryEntries = results[0].filter(function (entry) { return entry.type === 'game'; });
    timerState.entries = timerState.libraryEntries.filter(function (entry) {
      return entry.type === 'game' && entry.completionStatus !== 'completed';
    });
    var requested = timerParams.get('game');
    timerState.selectedId = requested && timerEntry(requested) ? requested :
      (timerState.entries.filter(function (entry) {
        var data = timerState.timers[entry.id];
        return data && data.startedAt != null;
      })[0] || (window.matchMedia('(min-width:900px)').matches ? timerState.entries[0] : null) || {}).id || null;
    renderTimerList();
    renderTimerDetail();
    if (requested && history.replaceState) history.replaceState(null, '', '/timer.html');
    if (requested && timerParams.get('start') === '1') {
      var entry = timerEntry(requested);
      if (entry && entry.completionStatus === 'playing') timerStart(entry).catch(timerOperationError);
    }
  }).catch(function (err) {
    console.error('Could not initialize Playtime Tracker.', err);
    AppUtils.showToast('Could not load games. Check your connection.');
  });
  setInterval(timerTick, 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) timerRefresh().catch(function () {}); });
  window.addEventListener('pageshow', function () { timerRefresh().catch(function () {}); });
}

AppAuth.requireAuth(timerInit);