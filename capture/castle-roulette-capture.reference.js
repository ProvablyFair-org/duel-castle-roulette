// Capture methodology, published for provenance/review.
// Reference record, not a runnable tool.
// Dataset in `data/`, hash-verified by the suite.

if (window._crkill) window._crkill();

(function () {
  'use strict';

  var INSTANCE = Date.now();
  window._crkill = function () { INSTANCE = -1; };

  // ── Phase config ────────────────────────────────────────────────────────
  // Castle Roulette: 48 positions (0-47), 6 color tiers, zero edge.
  // Phases A-C: standard capture (baseline, varied colors, bet-size invariance).
  // Phases D-E: supplementary — extra payout coverage on rare multiplier tiers.
  var PHASES = [
    { key: 'A', name: '800 @ 2x $0.01',       total: 800, amount: '0.01', coin: 'two' },
    { key: 'B', name: '200 varied colors',     total: 200, amount: '0.01', coin: null },
    { key: 'C', name: '100 @ 2x $1',           total: 100, amount: '1',   coin: 'two' },
    { key: 'D', name: '100 @ 16x $0.01',       total: 100, amount: '0.01', coin: 'sixteen' },
    { key: 'E', name: '150 @ 48x $0.01',       total: 150, amount: '0.01', coin: 'forty_eight' },
  ];
  var PHASE_B_COLORS = ['two', 'four', 'eight', 'sixteen', 'twenty_four', 'forty_eight'];
  var CURRENCY = 105;
  var DB_NAME = 'castle_roulette_capture';
  var TOKEN_MAX_AGE = 300000;
  var USER_ID = null; // set on init

  // drand quicknet chain — publishTime(round) = GENESIS + (round - 1) * PERIOD
  // Verified: seedIndex 28006709 → 1776823491 matches live test exactly.
  var DRAND_GENESIS = 1692803367;
  var DRAND_PERIOD  = 3;
  function drandPublishTime(round) { return DRAND_GENESIS + (round - 1) * DRAND_PERIOD; }

  // ── IndexedDB ───────────────────────────────────────────────────────────
  var db = null;
  function openDB() {
    if (db) return Promise.resolve(db);
    return new Promise(function (ok, fail) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains('rounds')) d.createObjectStore('rounds', { autoIncrement: true });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      };
      req.onsuccess = function (e) { db = e.target.result; ok(db); };
      req.onerror = function (e) { fail(e.target.error); };
    });
  }
  function dbPut(s, v, k) { return new Promise(function (ok, fail) { var tx = db.transaction(s, 'readwrite'); var r = k !== undefined ? tx.objectStore(s).put(v, k) : tx.objectStore(s).add(v); r.onsuccess = function () { ok(r.result); }; r.onerror = function () { fail(r.error); }; }); }
  function dbGetAll(s) { return new Promise(function (ok, fail) { var r = db.transaction(s, 'readonly').objectStore(s).getAll(); r.onsuccess = function () { ok(r.result); }; r.onerror = function () { fail(r.error); }; }); }
  function dbGet(s, k) { return new Promise(function (ok, fail) { var r = db.transaction(s, 'readonly').objectStore(s).get(k); r.onsuccess = function () { ok(r.result); }; r.onerror = function () { fail(r.error); }; }); }
  function dbClear(s) { return new Promise(function (ok, fail) { var r = db.transaction(s, 'readwrite').objectStore(s).clear(); r.onsuccess = function () { ok(); }; r.onerror = function () { fail(r.error); }; }); }
  function dbCount(s) { return new Promise(function (ok, fail) { var r = db.transaction(s, 'readonly').objectStore(s).count(); r.onsuccess = function () { ok(r.result); }; r.onerror = function () { fail(r.error); }; }); }

  // ── State ───────────────────────────────────────────────────────────────
  var meta = {};
  var paused = true;
  var roundCount = 0;
  var cur = null;

  function freshMeta() {
    return { phaseIdx: 0, phaseBets: 0, running: false, token: null, tokenAt: 0, errors: 0,
             createdAt: new Date().toISOString(), phaseBetCounts: { A: 0, B: 0, C: 0, D: 0, E: 0 } };
  }
  function resetCur() {
    cur = {
      roundId: null, serverSeedHash: null, drandRoundId: null, drandRandomness: null,
      position: null, winningCoin: null, serverSeed: null,
      betPlaced: false, betCoin: null,
      _amount: null, _phase: null, _saved: false,
    };
  }
  function saveMeta() { return dbPut('meta', meta, 'state'); }
  resetCur();

  // ── Logging ─────────────────────────────────────────────────────────────
  function ts() { return new Date().toTimeString().slice(0, 8); }
  function log(msg) { console.log('%c[cr ' + ts() + '] ' + msg, 'color:#a78bfa'); updatePanel(); }
  function warn(msg) { console.warn('%c[cr ' + ts() + '] ' + msg, 'color:#ffb74d'); updatePanel(); }
  function good(msg) { console.log('%c[cr ' + ts() + '] ' + msg, 'color:#81c784;font-weight:bold'); updatePanel(); }

  // ── API ─────────────────────────────────────────────────────────────────
  function api(method, path, body) {
    var opts = { method: method, credentials: 'include', headers: { 'content-type': 'application/json', 'accept': 'application/json, text/plain, */*', 'x-duel-device-identifier': localStorage.getItem('security:uuid') || '', 'x-env-class': localStorage.getItem('env_class') || 'blue' } };
    if (body) opts.body = JSON.stringify(body);
    return fetch(path, opts).then(function (res) { return res.json().then(function (j) { if (!res.ok || j.success === false) throw new Error((j.error || j.message || JSON.stringify(j).slice(0, 200))); return j.data || j; }); });
  }
  function refreshToken() { return api('POST', '/api/v2/user/security/token', { uuid: localStorage.getItem('security:uuid'), code: '0000', type: 'standard' }).then(function (r) { meta.token = r.token || r; meta.tokenAt = Date.now(); return meta.token; }); }
  function ensureToken() { return (Date.now() - meta.tokenAt > TOKEN_MAX_AGE) ? refreshToken() : Promise.resolve(meta.token); }

  // ── Bet via WebSocket ────────────────────────────────────────────────────
  // Roulette bets are WS emits on /roulette namespace.
  // Format: 42/roulette,["place bet",{coin, amount, round, security_token, currency, ...}]
  var _liveWS = null;

  function getCoin() {
    var cfg = PHASES[meta.phaseIdx];
    if (!cfg) return 'two';
    if (cfg.coin !== null) return cfg.coin;
    return PHASE_B_COLORS[meta.phaseBets % PHASE_B_COLORS.length];
  }

  function placeBet() {
    if (!cur || cur.betPlaced || paused || meta.phaseIdx >= PHASES.length) return;
    if (!_liveWS || _liveWS.readyState !== 1) { warn('no live WS — cannot bet'); return; }

    var cfg = PHASES[meta.phaseIdx];
    var coin = getCoin();
    cur._amount = cfg.amount; cur._phase = cfg.key; cur.betCoin = coin;

    ensureToken().then(function (token) {
      cur.betPlaced = true;
      var payload = '42/roulette,' + JSON.stringify(["place bet", {
        coin: coin,
        amount: cfg.amount,
        round: cur.roundId,
        security_token: token,
        currency: CURRENCY,
        ts: Date.now(),
        id: null,
        user_id: USER_ID,
        balance_type: CURRENCY,
        state: 'unconfirmed',
      }]);
      _liveWS.send(payload);
      log('bet $' + cfg.amount + ' on ' + coin + ' (round ' + cur.roundId + ')');
    }).catch(function (e) {
      warn('token failed: ' + e.message);
    });
  }

  // ── Save round ──────────────────────────────────────────────────────────
  function trySaveRound() {
    if (!cur || !cur.roundId || cur.position == null || !cur.betPlaced || cur._saved) return;
    var cfg = PHASES[meta.phaseIdx];
    if (!cfg) return;
    cur._saved = true;

    var isWin = cur.winningCoin === cur.betCoin;

    var record = {
      at: new Date().toISOString(),
      phase: cur._phase || cfg.key,
      roundId: cur.roundId,
      request: {
        amount: cur._amount || cfg.amount,
        coin: cur.betCoin,
      },
      result: {
        position: cur.position,
        winningCoin: cur.winningCoin,
        serverSeed: cur.serverSeed,
        serverSeedHash: cur.serverSeedHash,
        drandRoundId: cur.drandRoundId,
        drandRandomness: cur.drandRandomness,
        effectiveEdge: 0,
        isWin: isWin,
      },
      // timing is populated at save() via transactions API + drand formula
      timing: null,
    };

    openDB().then(function () { return dbPut('rounds', record); }).then(function () {
      roundCount++; meta.phaseBets++; meta.phaseBetCounts[cfg.key]++; meta.errors = 0;
      var resultStr = 'pos=' + cur.position + ' (' + cur.winningCoin + ') ' + (isWin ? 'WIN' : 'loss');
      if (roundCount % 10 === 0) log(cfg.key + ': ' + meta.phaseBets + '/' + cfg.total + ' | total: ' + roundCount + ' | ' + resultStr);
      if (meta.phaseBets >= cfg.total) {
        good('Phase ' + cfg.key + ' done');
        meta.phaseIdx++; meta.phaseBets = 0;
        if (meta.phaseIdx >= PHASES.length) { good('ALL DONE — ' + roundCount + ' rounds. cr.save()'); paused = true; meta.running = false; }
      }
      return saveMeta();
    }).then(function () { updatePanel(); });
  }

  // ── Socket.IO parser ────────────────────────────────────────────────────
  function parseSocketIO(raw) {
    if (typeof raw !== 'string') return null;
    var m = raw.match(/^42\/roulette,\[(.+)\]$/s);
    if (!m) return null;
    try { var arr = JSON.parse('[' + m[1] + ']'); return { event: arr[0], data: arr[1] }; }
    catch (_) { return null; }
  }

  // ── Event handler ───────────────────────────────────────────────────────
  function handleEvent(ev, data) {
    if (INSTANCE === -1) return;

    // rolling = new round starting, commitment published, betting window open
    if (ev === 'rolling') {
      // Save previous round if pending
      if (cur && cur.betPlaced && cur.position != null && !cur._saved) trySaveRound();
      resetCur();
      cur.roundId = data.round;
      if (data.seed && data.seed.serverHash) cur.serverSeedHash = data.seed.serverHash;
      if (!paused && meta.phaseIdx < PHASES.length) placeBet();
    }

    // waiting-pf = waiting for drand beacon (Array with seed_index)
    if (ev === 'waiting-pf' && Array.isArray(data)) {
      var pf = data[0];
      if (pf && pf.seed_index && cur) {
        cur.drandRoundId = pf.seed_index;
      }
    }

    // roll = result revealed with winner + seed data (all at once — simpler than Crash)
    if (ev === 'roll' && data) {
      if (cur && data.round === cur.roundId) {
        cur.position = data.winner;
        cur.winningCoin = data.coin;
        if (data.seed) {
          cur.serverSeed = data.seed.serverSeed;
          cur.drandRandomness = data.seed.drandRandomness;
          cur.drandRoundId = cur.drandRoundId || data.seed.seedIndex;
          cur.serverSeedHash = cur.serverSeedHash || data.seed.serverHash;
        }
        trySaveRound();
      }
    }

    // end = round complete, has winners map — cross-check but not needed for capture
    if (ev === 'end' && data && data.round === cur.roundId) {
      // If roll wasn't caught (rare), use end data as fallback
      if (cur && cur.position == null) {
        cur.position = data.winner;
        cur.winningCoin = data.coin;
        if (data.seed) {
          cur.serverSeed = data.seed.serverSeed;
          cur.drandRandomness = data.seed.drandRandomness;
          cur.drandRoundId = cur.drandRoundId || data.seed.seedIndex;
          cur.serverSeedHash = cur.serverSeedHash || data.seed.serverHash;
        }
        trySaveRound();
      }
    }

    // init = authenticated, grab user ID
    if (ev === 'init' && data && data.id) {
      USER_ID = data.id;
      good('identified as user ' + USER_ID + ' (' + (data.steam_name || data.name || '') + ')');
    }
  }

  // ── Hook WS via .send() patch ────────────────────────────────────────────
  var _origSend = WebSocket.prototype.send;
  var _wsHooked = false;

  WebSocket.prototype.send = function (data) {
    if (!_wsHooked && typeof data === 'string' && data.includes('/roulette')) {
      _wsHooked = true;
      _liveWS = this;
      this.addEventListener('message', function (event) {
        var parsed = parseSocketIO(event.data);
        if (parsed) handleEvent(parsed.event, parsed.data);
      });
      good('hooked roulette WebSocket via .send() intercept');
    }
    // Also hook if this is the first WS and it goes to roulette.duel.com
    if (!_wsHooked && this.url && this.url.includes('roulette.duel.com')) {
      _wsHooked = true;
      _liveWS = this;
      this.addEventListener('message', function (event) {
        var parsed = parseSocketIO(event.data);
        if (parsed) handleEvent(parsed.event, parsed.data);
      });
      good('hooked roulette WebSocket via URL match');
    }
    return _origSend.call(this, data);
  };

  // ── Panel ───────────────────────────────────────────────────────────────
  function buildPanel() {
    var old = document.getElementById('cap-panel'); if (old) old.remove();
    var d = document.createElement('div'); d.id = 'cap-panel';
    Object.assign(d.style, { position:'fixed', bottom:'16px', right:'16px', zIndex:'99999', background:'#0d1117', border:'1px solid #1e2d3d', borderRadius:'8px', padding:'12px 16px', fontFamily:'monospace', fontSize:'11px', color:'#b8cfe0', minWidth:'280px', boxShadow:'0 4px 24px rgba(0,0,0,.7)', cursor:'move', userSelect:'none' });
    var dragging = false, ox = 0, oy = 0;
    d.addEventListener('mousedown', function (e) { if (e.target.tagName === 'BUTTON') return; dragging = true; ox = e.clientX - d.offsetLeft; oy = e.clientY - d.offsetTop; });
    document.addEventListener('mousemove', function (e) { if (!dragging) return; d.style.left = (e.clientX - ox) + 'px'; d.style.top = (e.clientY - oy) + 'px'; d.style.right = 'auto'; d.style.bottom = 'auto'; });
    document.addEventListener('mouseup', function () { dragging = false; });

    var title = document.createElement('div'); title.textContent = 'CASTLE ROULETTE CAPTURE';
    Object.assign(title.style, { color:'#a78bfa', fontWeight:'700', fontSize:'13px' }); d.appendChild(title);
    var st = document.createElement('div'); st.id = 'cap-status'; Object.assign(st.style, { margin:'6px 0', color:'#4d6880', fontSize:'10px' }); d.appendChild(st);

    for (var pi = 0; pi < PHASES.length; pi++) {
      var ph = PHASES[pi]; var row = document.createElement('div'); Object.assign(row.style, { display:'flex', alignItems:'center', gap:'6px', marginBottom:'3px' });
      var lbl = document.createElement('span'); lbl.textContent = ph.key; Object.assign(lbl.style, { width:'14px', color:'#4d6880', fontWeight:'700' });
      var barOuter = document.createElement('div'); Object.assign(barOuter.style, { flex:'1', height:'8px', background:'#161e28', borderRadius:'4px', overflow:'hidden' });
      var fill = document.createElement('div'); fill.id = 'cap-bar-' + ph.key; Object.assign(fill.style, { height:'100%', width:'0%', background:'#a78bfa', borderRadius:'4px', transition:'width .3s' }); barOuter.appendChild(fill);
      var ct = document.createElement('span'); ct.id = 'cap-ct-' + ph.key; ct.textContent = '0/' + ph.total; Object.assign(ct.style, { width:'70px', textAlign:'right', fontSize:'9px', color:'#4d6880' });
      row.appendChild(lbl); row.appendChild(barOuter); row.appendChild(ct); d.appendChild(row);
    }
    var lastLine = document.createElement('div'); lastLine.id = 'cap-last'; Object.assign(lastLine.style, { margin:'6px 0 4px', fontSize:'10px', color:'#4d6880' }); d.appendChild(lastLine);
    var btnRow = document.createElement('div'); Object.assign(btnRow.style, { display:'flex', gap:'4px', marginTop:'8px' });
    function mkBtn(text, color, fn) { var b = document.createElement('button'); b.textContent = text; Object.assign(b.style, { flex:'1', padding:'5px 0', background:'#161e28', border:'1px solid #1e2d3d', color: color, borderRadius:'3px', cursor:'pointer', fontFamily:'monospace', fontSize:'10px', fontWeight:'700' }); b.addEventListener('click', fn); return b; }
    btnRow.appendChild(mkBtn('GO', '#2dff82', function () { pub.go(); }));
    btnRow.appendChild(mkBtn('PAUSE', '#ffcc44', function () { pub.pause(); }));
    btnRow.appendChild(mkBtn('SAVE', '#33ccff', function () { pub.save(); }));
    d.appendChild(btnRow); document.body.appendChild(d);
  }

  function updatePanel() {
    for (var pi = 0; pi < PHASES.length; pi++) {
      var ph = PHASES[pi]; var n = meta.phaseBetCounts ? (meta.phaseBetCounts[ph.key] || 0) : 0;
      var bar = document.getElementById('cap-bar-' + ph.key); var ct = document.getElementById('cap-ct-' + ph.key);
      if (bar) { bar.style.width = Math.min(100, n / ph.total * 100) + '%'; bar.style.background = n >= ph.total ? '#33ccff' : '#a78bfa'; }
      if (ct) ct.textContent = n + '/' + ph.total;
    }
    var st = document.getElementById('cap-status');
    if (st) { var phase = PHASES[meta.phaseIdx]; st.textContent = (paused ? 'paused' : 'running') + ' | rounds: ' + roundCount + ' | phase: ' + (phase ? phase.key : 'done'); st.style.color = !paused ? '#2dff82' : '#4d6880'; }
    var last = document.getElementById('cap-last');
    if (last && cur && cur.position != null) last.textContent = 'last: #' + cur.roundId + ' → pos=' + cur.position + ' (' + cur.winningCoin + ')';
  }

  });

console.log('[cr] reference record loaded — see data/ for the captured dataset');
