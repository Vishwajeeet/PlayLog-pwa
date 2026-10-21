window.AppFlow = {
  rewatch: function (title) {
    return new Promise(function (res) {
      var ov = document.createElement('div');
      ov.className = 'modal-overlay open';
      ov.innerHTML = '<div class="modal-box"><p class="modal-title">Already in your collection</p>' +
        '<p style="color:var(--text-muted);margin-bottom:20px">Is this a rewatch of ' + title + '?</p>' +
        '<button class="btn btn-primary" data-v="yes" style="margin-bottom:8px">Yes, count a rewatch</button>' +
        '<button class="btn btn-ghost" data-v="new" style="margin-bottom:8px">No, add as new entry</button>' +
        '<button class="btn btn-ghost" data-v="">Cancel</button></div>';
      ov.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        ov.remove(); res(b.dataset.v || null);
      });
      document.body.appendChild(ov);
    });
  },

  needs: function (e, name) {
    return e.type === 'game' && e.completionStatus === 'wishlist' &&
      ({ 'Completed Games': 'completed', 'Currently Playing': 'playing', 'Dropped Games': 'dropped' })[name];
  },

  move: function (uid, entry, pid, pname) {
    var st = AppFlow.needs(entry, pname);
    if (!st) return AppDB.moveEntry(uid, entry.id, pid).then(function () { return true; });
    return AppFlow.ask(entry, st).then(function (d) {
      if (!d) return false;
      d.playlistId = pid;
      return AppDB.updateEntry(uid, entry.id, d).then(function () { return true; });
    });
  },

  ask: function (entry, status) {
    return new Promise(function (resolve) {
      var now = new Date(), rating = null;
      var done = status === 'completed', drop = status === 'dropped', play = status === 'playing';
      var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map(function (m, i) {
        return '<option value="' + (i + 1) + '"' + (i === now.getMonth() ? ' selected' : '') + '>' + m + '</option>';
      }).join('');
      var yr = ''; for (var y = now.getFullYear(); y >= 2015; y--) yr += '<option>' + y + '</option>';
      var ov = document.createElement('div');
      ov.className = 'modal-overlay open';
      ov.innerHTML = '<div class="modal-box" style="max-height:90vh;overflow-y:auto">' +
        '<p class="modal-title">' + ({ completed: 'Mark as Completed', playing: 'Start Playing', dropped: 'Mark as Dropped' })[status] + '</p>' +
        '<p class="modal-entry-title">' + entry.title + '</p>' +
        (play ? '' : '<label class="label">Rating (1–10)' + (done ? ' *' : '') + '</label><div class="number-rating-row" id="aw-rate" style="margin-bottom:16px"></div>') +
        '<label class="label">' + (play ? 'Started' : 'When did you play it?') + '</label>' +
        '<div style="display:flex;gap:8px;margin-bottom:16px"><select id="aw-m" class="input-field">' + mo + '</select><select id="aw-y" class="input-field">' + yr + '</select></div>' +
        '<label class="label">Hours played (optional)</label>' +
        '<input type="number" id="aw-h" class="input-field" min="0" max="9999" value="' + (entry.playtime || '') + '" style="margin-bottom:16px">' +
        (drop ? '<label class="label">Reason for dropping (optional)</label><textarea id="aw-r" class="input-field" rows="2" style="resize:none;margin-bottom:16px"></textarea>' : '') +
        (play ? '' : '<label class="label">Review (optional)</label><textarea id="aw-v" class="input-field" rows="3" style="resize:none"></textarea>') +
        '<div class="modal-actions"><button class="btn btn-ghost" id="aw-x">Cancel</button>' +
        '<button class="btn btn-primary" id="aw-ok"' + (done ? ' disabled' : '') + '>Save</button></div></div>';
      document.body.appendChild(ov);
      var q = function (s) { return ov.querySelector(s); }, ok = q('#aw-ok');
      if (!play) {
        var row = q('#aw-rate');
        for (var i = 1; i <= 10; i++) (function (n) {
          var b = document.createElement('button');
          b.className = 'num-rating-btn'; b.textContent = n;
          b.onclick = function () {
            row.querySelectorAll('.selected').forEach(function (x) { x.classList.remove('selected'); });
            b.classList.add('selected'); rating = n; ok.disabled = false;
          };
          row.appendChild(b);
        })(i);
      }
      q('#aw-x').onclick = function () { ov.remove(); resolve(null); };
      ok.onclick = function () {
        var m = +q('#aw-m').value, yv = +q('#aw-y').value;
        if (yv === now.getFullYear() && m > now.getMonth() + 1) return AppUtils.showToast('Pick a past or current month.');
        var d = { completionStatus: status, monthWatched: m, yearWatched: yv, playtime: parseInt(q('#aw-h').value) || null };
        if (!play) { d.gameRating = rating; d.review = q('#aw-v').value.trim() || null; }
        if (drop) d.dropReason = q('#aw-r').value.trim() || null;
        ov.remove(); resolve(d);
      };
    });
  }
};