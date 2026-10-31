// Edison Home: the home screen. One highlight, moved by arrows or the pointer. Written from tv-home\SPEC.md sections 5 and 6.
(() => {
  'use strict';
  const SELF = 'com.heyedison.home', STORE = 'edisonHome.layout.v1', SEED_VERSION = 3;
  const HOLD_MS = 600, DOUBLE_MS = 300, TOAST_MS = 5000, LAUNCH_WAIT_MS = 5000, LAUNCH_LINE_MS = 1100, LIST_WAIT_MS = 4000, TILE_COLORS = 5;
  const look = getComputedStyle(document.documentElement);
  const cssNumber = (name, fallback) => parseFloat(look.getPropertyValue(name)) || fallback;
  const BASE_COLS = cssNumber('--cols', 5), SIDE_ROWS = 11;
  let COLS = BASE_COLS;
  const FOCUS_SCALE = cssNumber('--focus-scale', 1), RING_PAD = cssNumber('--ring-pad', 16);
  const LEFT = 37, UP = 38, RIGHT = 39, DOWN = 40, OK = 13, BACK = 461, ESC = 27;
  const $ = (id) => document.getElementById(id);
  const stage = $('stage'), grid = $('grid'), panel = $('panel'), ring = $('ring'), toastEl = $('toast');
  const RING_MS = 260;
  const settingsKey = $('settingsKey'), hideKey = $('hideKey'), closeKey = $('closeKey');

  let apps = new Map();            // key -> app, with its tile element
  let order = [], hidden = new Set();
  let lastKey = null;              // the tile to come back to
  let mode = 'main';               // main, settings or arrange
  let focusEl = null, scale = 1, snapshot = null, movingKey = null;
  let ringAt = null, voiceOn = true, palette = 'eye', largeIcons = false, layout = 'bottom', backId = 'random';
  let okDown = false, holdFired = false, holdTimer = 0, lastActivate = 0, toastTimer = 0;
  let mouseSeen = false, lastX = -1, lastY = -1, lastWheel = 0;
  const diag = { list: 'not tried yet', source: '', launch: 'none yet', save: 'ok', wall: 'starting', weather: 'not asked yet', voice: 'nothing said yet', picture: 'not asked yet', volume: 'not asked yet', live: 'starting' };

  /* ---------- app list ---------- */
  function keyOf(a) {
    if (a.launchPointId) return a.launchPointId;
    return a.params ? a.id + '|' + JSON.stringify(a.params) : a.id;
  }

  // Works for the saved list and the live list alike. Anything without an id and a title is dropped.
  function normalize(list) {
    const seen = new Set(), out = [];
    (Array.isArray(list) ? list : []).forEach((a) => {
      if (!a || !a.id || !a.title || a.hidden || a.id === SELF) return;
      const params = a.params && typeof a.params === 'object' && Object.keys(a.params).length ? a.params : null;
      const app = { id: a.id, launchPointId: a.launchPointId || null, title: String(a.title), params, iconColor: a.iconColor || null, icon: a.icon || null };
      app.key = keyOf(app);
      if (!seen.has(app.key)) { seen.add(app.key); out.push(app); }
    });
    return out;
  }

  // One color per group of apps, so the rows read at a glance. The apps' own colors are not used.
  const OTHER_GROUP = 2;
  const tileColor = (a) => 'var(--c' + ((window.EDISON_GROUPS || {})[a.title] || OTHER_GROUP) + ')';

  function makeTile(a, i) {
    const el = document.createElement('div');
    el.className = 'tile';
    el.dataset.key = a.key;
    el.setAttribute('data-nav', '');
    const glyph = () => {
      const g = document.createElement('div');
      g.className = 'glyph';
      g.textContent = a.title.trim().charAt(0).toUpperCase();
      return g;
    };
    let art = glyph();
    if (a.icon) {
      art = document.createElement('img');
      art.src = a.icon.replace('data/icons/', 'data/icons-ink/');
      art.alt = '';
      art.draggable = false;
      art.onerror = () => art.replaceWith(glyph());
    }
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = (window.EDISON_SHORT || {})[a.title] || a.title;
    const chip = document.createElement('div');
    chip.className = 'chip';
    const shine = document.createElement('i');
    shine.className = 'glint';
    chip.append(art, shine);
    el.append(chip, label);
    return el;
  }

  function setList(list) {
    apps = new Map(list.map((a, i) => [a.key, Object.assign(a, { el: makeTile(a, i) })]));
    const saved = readStore();
    const known = (k) => apps.has(k);
    hidden = new Set((Array.isArray(saved.hidden) ? saved.hidden : []).filter(known));
    const seedNow = saved.seeded !== SEED_VERSION;
    order = [];
    if (seedNow) {
      if (saved.seeded !== true && saved.seeded !== 2) { // those mean the hide list went in with an earlier copy
        const titles = new Set(window.EDISON_HIDE || []);
        list.forEach((a) => { if (titles.has(a.title)) hidden.add(a.key); });
      }
      (window.EDISON_FIRST || []).forEach((t) => {
        const a = list.find((x) => x.title === t);
        if (a && !hidden.has(a.key)) order.push(a.key);
      });
    }
    (Array.isArray(saved.order) ? saved.order : []).forEach((k) => { if (known(k) && !hidden.has(k) && !order.includes(k)) order.push(k); });
    apps.forEach((a, k) => { if (!hidden.has(k) && !order.includes(k)) order.push(k); });
    if (lastKey === null && typeof saved.last === 'string') lastKey = saved.last;
    renderTiles();
    if (seedNow) save(true);
  }

  function renderTiles() {
    // on the sides the apps stack in columns, adding one whenever a column would run off the screen
    const side = layout === 'left' || layout === 'right';
    COLS = side ? Math.max(2, Math.ceil(order.length / SIDE_ROWS)) : BASE_COLS;
    document.documentElement.style.setProperty('--cols', COLS);
    grid.replaceChildren(...order.map((k, i) => {
      const el = apps.get(k).el;
      el.style.setProperty('--c', tileColor(apps.get(k)));
      el.style.setProperty('--i', i);
      return el;
    }));
    $('empty').hidden = order.length > 0;
    stage.style.setProperty('--rows', Math.max(1, Math.ceil(order.length / COLS)));
    $('count').textContent = order.length + (order.length === 1 ? ' APP' : ' APPS');
    $('hiddenCount').textContent = hidden.size ? hidden.size + ' HIDDEN' : '';
  }

  /* ---------- saved layout ---------- */
  function readStore() {
    try {
      const v = JSON.parse(window.localStorage.getItem(STORE));
      return v && typeof v === 'object' ? v : {};
    } catch (e) { return {}; }
  }

  function save(quiet) {
    try {
      window.localStorage.setItem(STORE, JSON.stringify({ order, hidden: [...hidden], last: lastKey, seeded: SEED_VERSION, voice: voiceOn, palette, eyeSeen: true, largeIcons, layout, back: backId, weather: weatherAt }));
      diag.save = 'ok';
    } catch (e) {
      diag.save = 'failing, changes last until the app restarts';
      if (!quiet) toast('Could not save your layout. It will reset when the app restarts.');
    }
    renderDiag();
  }

  /* ---------- the one highlight ---------- */
  function nameFor(el) {
    if (mode === 'settings') return 'Settings';
    if (el === settingsKey) return 'Settings';
    const a = apps.get(movingKey || (el && el.dataset.key));
    if (!a) return 'Edison Home';
    if (el === hideKey) return 'Hide ' + a.title;
    return (mode === 'arrange' ? 'Moving ' : '') + a.title;
  }

  function placeRing() {
    if (!focusEl) return;
    const r = focusEl.getBoundingClientRect(), s = stage.getBoundingClientRect();
    const f = focusEl.classList.contains('row') ? 1 : FOCUS_SCALE;
    // Aim at where the item ends up, not where a slide or scale has it right now.
    const dx = panel.contains(focusEl) ? new DOMMatrix(getComputedStyle(panel).transform).m41 : 0;
    const w = focusEl.offsetWidth * f, h = focusEl.offsetHeight * f;
    const cx = (r.left + r.width / 2 - s.left) / scale - dx, cy = (r.top + r.height / 2 - s.top) / scale;
    ring.style.width = w + RING_PAD * 2 + 'px';
    ring.style.height = h + RING_PAD * 2 + 'px';
    const cs = getComputedStyle(focusEl); // the box keeps the item's own mix of square and round corners
    ring.style.borderRadius = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map((v) => (parseFloat(v) ? parseFloat(v) * f + RING_PAD : 0) + 'px').join(' ');
    ringAt = { x: cx - w / 2 - RING_PAD, y: cy - h / 2 - RING_PAD };
    ring.style.transform = 'translate(' + ringAt.x + 'px,' + ringAt.y + 'px)';
  }

  // The box stretches along its way, runs a little long, and snaps into place.
  function stretchRing(from) {
    const to = ringAt;
    if (!from || !to || (from.x === to.x && from.y === to.y)) return;
    const flat = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
    const at = (t, sx, sy) => 'translate(' + (from.x + (to.x - from.x) * t) + 'px,' + (from.y + (to.y - from.y) * t) + 'px) scale(' + sx + ',' + sy + ')';
    const long = flat ? [1.16, 0.9] : [0.94, 1.3], short = flat ? [0.96, 1.05] : [1.03, 0.92];
    ring.animate([
      { transform: at(0, 1, 1) },
      { transform: at(0.7, long[0], long[1]), offset: 0.45 },
      { transform: at(1.05, short[0], short[1]), offset: 0.75 },
      { transform: at(1, 1, 1) }
    ], { duration: RING_MS, easing: 'ease-out' });
  }

  function focus(el) {
    if (focusEl) focusEl.classList.remove('focus');
    focusEl = el;
    el.classList.add('focus');
    if (el.classList.contains('tile')) lastKey = el.dataset.key;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    ring.style.setProperty('--ring', el.style.getPropertyValue('--c') || 'var(--c3)');
    $('name').textContent = nameFor(el);
    const before = ringAt;
    placeRing();
    stretchRing(before);
    kick(el);
  }

  const tile = (i) => apps.get(order[i]).el;
  const backHome = () => {
    if (lastKey && order.includes(lastKey)) return focus(apps.get(lastKey).el);
    focus(order.length ? tile(0) : settingsKey);
  };

  function moveMain(dir) {
    const n = order.length;
    if (focusEl === $('brand')) { if (dir === RIGHT) focus(settingsKey); return; }
    if (focusEl === settingsKey && dir === LEFT && n) return focus($('brand'));
    if (focusEl === settingsKey) {
      if (dir !== UP || !n) return;
      const lastRow = Math.floor((n - 1) / COLS) * COLS, col = Math.max(order.indexOf(lastKey), 0) % COLS;
      return focus(tile(Math.min(lastRow + col, n - 1)));
    }
    const i = order.indexOf(focusEl.dataset.key), col = i % COLS;
    if (dir === LEFT && col > 0) focus(tile(i - 1));
    else if (dir === RIGHT && col < COLS - 1 && i + 1 < n) focus(tile(i + 1));
    else if (dir === UP && i >= COLS) focus(tile(i - COLS));
    else if (dir === DOWN) {
      if (i + COLS < n) focus(tile(i + COLS));
      else if (Math.floor(i / COLS) < Math.floor((n - 1) / COLS)) focus(tile(n - 1));
      else focus(settingsKey);
    }
  }

  function moveSettings(dir) {
    const rows = [...$('restoreList').children], keys = [closeKey, $('voiceKey'), $('paletteKey'), $('iconsKey'), $('layoutKey'), $('backKey'), $('weatherKey')];
    const r = rows.indexOf(focusEl), k = keys.indexOf(focusEl);
    if (k >= 0) {
      if (dir === LEFT && k > 0) focus(keys[k - 1]);
      if (dir === RIGHT && k < keys.length - 1) focus(keys[k + 1]);
      if (dir === UP && rows.length) focus(rows[rows.length - 1]);
      return;
    }
    if (dir === UP && r > 0) focus(rows[r - 1]);
    if (dir === DOWN) focus(rows[r + 1] || closeKey);
  }

  function moveArrange(dir) {
    const el = apps.get(movingKey).el;
    if (focusEl === hideKey) return focus(el); // any arrow goes back to moving the tile, which stays where it was
    const n = order.length, i = order.indexOf(movingKey);
    let j = i;
    if (dir === LEFT) j = Math.max(i - 1, 0);
    if (dir === RIGHT) j = Math.min(i + 1, n - 1);
    if (dir === UP) { if (i < COLS) return focus(hideKey); j = i - COLS; }
    if (dir === DOWN) {
      if (i + COLS < n) j = i + COLS;
      else if (Math.floor(i / COLS) < Math.floor((n - 1) / COLS)) j = n - 1;
      else return focus(hideKey);
    }
    if (j === i) return;
    order.splice(j, 0, order.splice(i, 1)[0]);
    renderTiles();
    focus(el);
  }

  function move(dir) {
    if (mode === 'main') moveMain(dir);
    else if (mode === 'settings') moveSettings(dir);
    else moveArrange(dir);
  }

  /* ---------- arrange ---------- */
  function enterArrange() {
    movingKey = focusEl.dataset.key;
    snapshot = order.slice();
    mode = 'arrange';
    focusEl.classList.add('moving');
    $('arrangeBar').hidden = false;
    focus(focusEl);
  }

  function leaveArrange() {
    const a = apps.get(movingKey);
    a.el.classList.remove('moving');
    $('arrangeBar').hidden = true;
    mode = 'main';
    movingKey = null;
    snapshot = null;
    return a;
  }

  function dropTile() { const a = leaveArrange(); save(); focus(a.el); }

  function cancelArrange() {
    order = snapshot;
    const a = leaveArrange();
    renderTiles();
    focus(a.el);
  }

  function hideTile() {
    order = snapshot; // hiding never leaves other tiles shuffled by the moves before it
    const a = leaveArrange(), i = order.indexOf(a.key);
    order.splice(i, 1);
    hidden.add(a.key);
    lastKey = order.length ? order[Math.min(i, order.length - 1)] : null;
    renderTiles();
    save();
    backHome();
    toast(a.title + ' is hidden. Bring it back from Settings.');
  }

  /* ---------- settings ---------- */
  function renderRestore() {
    const list = $('restoreList');
    list.replaceChildren(...[...hidden].map((k) => {
      const row = document.createElement('div'), ttl = document.createElement('span'), act = document.createElement('span');
      row.className = 'row';
      row.dataset.restore = k;
      row.setAttribute('data-nav', '');
      ttl.className = 'ttl';
      ttl.textContent = apps.get(k).title;
      act.className = 'act';
      act.textContent = 'BRING BACK';
      row.append(ttl, act);
      return row;
    }));
    $('noneHidden').hidden = hidden.size > 0;
  }

  function openSettings() {
    mode = 'settings';
    renderRestore();
    renderDiag();
    $('scrim').hidden = false;
    panel.hidden = false;
    focus($('restoreList').children[0] || closeKey);
  }

  function closeSettings() {
    panel.hidden = true;
    $('scrim').hidden = true;
    mode = 'main';
    backHome();
  }

  function restore(k) {
    const rows = [...$('restoreList').children], i = rows.indexOf(focusEl);
    hidden.delete(k);
    order.push(k); // the end of the list, so nothing else moves
    renderTiles();
    save();
    renderRestore();
    focus($('restoreList').children[Math.min(i, hidden.size - 1)] || closeKey);
  }

  function renderDiag() {
    const ua = /Chrome\/(\d+)/.exec(navigator.userAgent);
    const lines = [
      'Live app list: ' + diag.list,
      'List in use: ' + diag.source,
      'Launch route: ' + (hasWebosService() ? 'webOS.service' : typeof window.PalmServiceBridge === 'function' ? 'PalmServiceBridge' : 'none found'),
      'Last launch: ' + diag.launch,
      'Back route: ' + (window.webOS && typeof window.webOS.platformBack === 'function' ? 'webOS.platformBack' : window.PalmSystem && typeof window.PalmSystem.platformBack === 'function' ? 'PalmSystem.platformBack' : 'window.close'),
      'Saving layout: ' + diag.save,
      'Wallpaper video: ' + diag.wall + (diag.wallLog ? '. Last: ' + diag.wallLog : ''),
      'Weather: ' + diag.weather + ', voice: ' + diag.voice,
      'Live Edison: ' + diag.live,
      'Screen ' + window.innerWidth + 'x' + window.innerHeight + ', Chromium ' + (ua ? ua[1] : 'unknown') + ', app 1.0.0'
    ];
    $('diag').replaceChildren(...lines.map((t) => {
      const d = document.createElement('div');
      d.textContent = t;
      return d;
    }));
  }

  /* ---------- talking to the TV ---------- */
  const hasWebosService = () => !!(window.webOS && window.webOS.service && typeof window.webOS.service.request === 'function');
  const pending = new Set(); // keeps each bridge alive until it answers

  // done({ ok, reason, reply }) is called exactly once, whatever the TV does or doesn't do.
  function luna(uri, params, waitMs, done) {
    let open = true, bridge = null;
    const finish = (ok, reason, reply) => {
      if (!open) return;
      open = false;
      clearTimeout(timer);
      pending.delete(bridge);
      done({ ok, reason, reply });
    };
    const answer = (r) => {
      if (r && r.returnValue === false) finish(false, String(r.errorText || r.errorCode || 'refused'), r);
      else finish(true, '', r);
    };
    const timer = setTimeout(() => finish(false, 'no reply'), waitMs);
    if (hasWebosService()) {
      try {
        const m = /^(luna:\/\/[^/]+)\/(.+)$/.exec(uri);
        window.webOS.service.request(m[1], { method: m[2], parameters: params, onSuccess: answer, onFailure: answer });
        return;
      } catch (e) { /* fall through to the bridge */ }
    }
    if (typeof window.PalmServiceBridge !== 'function') return finish(false, 'no TV service on this screen');
    try {
      bridge = new window.PalmServiceBridge();
      pending.add(bridge);
      bridge.onservicecallback = (msg) => {
        let r;
        try { r = JSON.parse(msg); } catch (e) { return finish(false, 'unreadable reply'); }
        answer(r);
      };
      bridge.call(uri, JSON.stringify(params));
    } catch (e) { finish(false, 'bridge error: ' + e.message); }
  }

  // He says a short line first, and the app opens just after, so the line isn't cut off.
  let launching = false;
  function launch(a) {
    if (launching) return;
    lastKey = a.key;
    save(true);
    const wait = voiceOn ? (window.EDISON_LAUNCH_WAIT_MS === undefined ? LAUNCH_LINE_MS : window.EDISON_LAUNCH_WAIT_MS) : 0;
    if (voiceOn) {
      const own = (window.EDISON_APP_LINES || {})[a.title];
      if (own && Math.random() < APP_LINE_CHANCE) play(own[Math.floor(Math.random() * own.length)]); else say('launch');
    }
    launching = true;
    setTimeout(() => { launching = false; openApp(a); }, wait);
  }

  function openApp(a) {
    const params = a.params ? { id: a.id, params: a.params } : { id: a.id };
    luna('luna://com.webos.applicationManager/launch', params, LAUNCH_WAIT_MS, (res) => {
      diag.launch = a.title + ': ' + (res.ok ? 'ok' : res.reason);
      renderDiag();
      if (res.ok) return;
      if (res.reason === 'no reply') { if (!document.hidden) toast(a.title + ' did not answer. Try again.'); return; } // hidden means it opened
      toast('Could not open ' + a.title + ': ' + res.reason);
    });
  }

  // Spec 6.4: one try. The saved list stays in use unless this comes back usable.
  function tryLiveList() {
    luna('luna://com.webos.applicationManager/listLaunchPoints', {}, LIST_WAIT_MS, (res) => {
      if (!res.ok) { diag.list = res.reason; return renderDiag(); }
      const list = normalize(res.reply && res.reply.launchPoints);
      if (!list.length) { diag.list = 'answered with nothing usable'; return renderDiag(); }
      if (mode !== 'main') { diag.list = 'returned ' + list.length + ' apps, came too late to use'; return renderDiag(); }
      diag.list = 'returned ' + list.length + ' apps, using them';
      diag.source = 'live from the TV (' + list.length + ' apps)';
      const ours = new Map(normalize((window.EDISON_APPS || {}).apps).map((a) => [a.key, a.icon]));
      list.forEach((a) => { a.icon = ours.get(a.key) || null; }); // never the TV's own colored artwork
      setList(list);
      backHome();
      renderDiag();
    });
  }

  // Read-only: asks once what the TV will share with this app, so we know what could go in the side rail.
  function askTv() {
    luna('luna://com.webos.settingsservice/getSystemSettings', { category: 'picture', keys: ['pictureMode'] }, LIST_WAIT_MS, (r) => {
      diag.picture = r.ok ? 'allowed, ' + ((r.reply && r.reply.settings && r.reply.settings.pictureMode) || 'no value') : r.reason;
      renderDiag();
    });
    luna('luna://com.webos.service.audio/master/getVolume', {}, LIST_WAIT_MS, (r) => {
      diag.volume = r.ok ? 'allowed' : r.reason;
      renderDiag();
    });
  }

  function exitApp() {
    try {
      if (window.webOS && typeof window.webOS.platformBack === 'function') return window.webOS.platformBack();
      if (window.PalmSystem && typeof window.PalmSystem.platformBack === 'function') return window.PalmSystem.platformBack();
    } catch (e) { /* fall through */ }
    window.close();
  }

  /* ---------- input ---------- */
  function activate(el) {
    const now = Date.now();
    if (now - lastActivate < DOUBLE_MS) return; // the pointer and the OK key can both report one press
    lastActivate = now;
    if (mode === 'arrange') return el === hideKey ? hideTile() : dropTile();
    if (mode === 'settings') {
      if (el === closeKey) return closeSettings();
      if (el === $('voiceKey')) return toggleVoice();
      if (el === $('paletteKey')) return nextPalette();
      if (el === $('iconsKey')) return toggleIcons();
      if (el === $('layoutKey')) return nextLayout();
      if (el === $('backKey')) return nextBack();
      if (el === $('weatherKey')) return weatherKeyPressed();
      if (el.dataset.restore) restore(el.dataset.restore);
      return;
    }
    if (el === settingsKey) return openSettings();
    if (el === $('brand')) return openSite();
    if (el.dataset.key) launch(apps.get(el.dataset.key));
  }

  function okCancel() { okDown = false; holdFired = false; clearTimeout(holdTimer); }

  function okPress() {
    if (okDown) return;
    okDown = true;
    holdFired = false;
    if (mode === 'main' && focusEl.classList.contains('tile')) {
      holdTimer = setTimeout(() => { holdFired = true; enterArrange(); }, HOLD_MS);
    }
  }

  // A keyup with no keydown here is the press that opened this app, so it does nothing.
  function okRelease() {
    if (!okDown) return;
    const fired = holdFired;
    okCancel();
    if (!fired) activate(focusEl);
  }

  function back() {
    okCancel();
    if (mode === 'settings') closeSettings();
    else if (mode === 'arrange') cancelArrange();
    else exitApp();
  }

  document.addEventListener('keydown', (e) => {
    if (liveEd) liveEd.touch();
    const k = e.keyCode;
    if (document.activeElement === cityInput) {
      if (k === BACK || k === ESC) { e.preventDefault(); closeCity(); }
      else if (k === OK && cityInput.value.trim() && !e.repeat) { e.preventDefault(); findCity(); }
      return;
    }
    if (k === OK) { e.preventDefault(); if (!e.repeat) okPress(); return; }
    if (k === BACK || k === ESC) { e.preventDefault(); if (!e.repeat) back(); return; }
    if (k === LEFT || k === UP || k === RIGHT || k === DOWN) { e.preventDefault(); okCancel(); move(k); }
  });
  document.addEventListener('keyup', (e) => { if (e.keyCode === OK) { e.preventDefault(); okRelease(); } });

  function pointerTarget(e) {
    const el = e.target.closest && e.target.closest('[data-nav]');
    if (!el) return null;
    if (mode === 'arrange') return el === hideKey || el.dataset.key === movingKey ? el : null;
    if (mode === 'settings') return panel.contains(el) ? el : null;
    return panel.contains(el) || el === hideKey ? null : el;
  }

  // Coordinates are compared because the browser also sends fake moves when tiles shift under a parked pointer.
  document.addEventListener('mousemove', (e) => {
    if (e.clientX === lastX && e.clientY === lastY) return;
    lastX = e.clientX;
    lastY = e.clientY;
    if (liveEd) liveEd.touch();
    pointerMoved(e.clientX / scale, e.clientY / scale);
    const el = pointerTarget(e);
    if (el && el !== focusEl) { okCancel(); focus(el); }
  });
  document.addEventListener('mousedown', (e) => {
    if (e.target === cityInput) return;
    e.preventDefault(); // a click on the background must not move the TV's focus off the app
    const el = e.button === 0 && pointerTarget(e);
    if (!el) return;
    if (el !== focusEl) focus(el);
    okPress();
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button !== 0 || !okDown) return;
    mouseSeen = true;
    if (holdFired || pointerTarget(e) === focusEl) okRelease(); else okCancel();
  });
  document.addEventListener('click', (e) => {
    if (mode === 'main' && !(e.target.closest && e.target.closest('[data-nav]'))) skyClick(e);
    if (mouseSeen) { mouseSeen = false; return; }
    const el = pointerTarget(e);
    if (el) { focus(el); activate(el); }
  });
  document.addEventListener('wheel', (e) => {
    const now = Date.now();
    if (mode === 'arrange' || now - lastWheel < 150) return;
    lastWheel = now;
    move(e.deltaY > 0 ? DOWN : UP);
  }, { passive: true });

  // Leaving mid-press must not leave a hold running. Coming back keeps the same tile.
  window.addEventListener('blur', okCancel);
  document.addEventListener('visibilitychange', () => {
    okCancel();
    if (document.hidden) { if (wallIsVideo) wall.pause(); } else { playWall(); arrive(); greet(); tick(); placeRing(); }
  });

  /* ---------- the wallpaper: rests while another app is on screen ---------- */
  const wall = $('wall');
  let wallIsVideo = false, backTimer = 0, backNow = null;
  const BACKS = window.EDISON_BACKS || [{ id: 'still', name: 'STILL' }];
  // Moving backgrounds play over the still picture, which stays underneath in case one won't play.
  function showBack() {
    const b = BACKS.find((x) => x.id === backId) || BACKS[0];
    $('backKey').textContent = 'BACK: ' + b.name;
    clearTimeout(backTimer);
    $('fader').classList.remove('dark');
    if (b.id === 'random') { playBack(pickRandomBack()); backTimer = setTimeout(fadeToNextBack, BACK_MS()); return; }
    playBack(b);
  }
  function playBack(b) {
    backNow = b;
    wallIsVideo = !!b.file;
    wall.hidden = !wallIsVideo;
    if (!wallIsVideo) { wall.removeAttribute('src'); wall.load(); diag.wall = 'still picture'; renderDiag(); return; }
    diag.wall = 'starting ' + b.name;
    wall.src = 'backs/' + b.file + '.mp4';
    wall.poster = 'backs/' + b.file + '.jpg';
    playWall();
  }
  // Random: starts on any moving background, then fades through dark to a different one about every minute.
  const BACK_MS = () => window.EDISON_BACK_MS || 60000, FADE_MS = 1300, BACK_READY_MS = 2500;
  function pickRandomBack() {
    const choices = BACKS.filter((x) => x.file && x !== backNow);
    return choices[Math.floor(Math.random() * choices.length)] || BACKS[0];
  }
  function fadeToNextBack() {
    if (backId !== 'random') return;
    if (document.hidden) { backTimer = setTimeout(fadeToNextBack, BACK_MS()); return; }
    const fader = $('fader');
    fader.classList.add('dark');
    backTimer = setTimeout(() => {
      if (backId !== 'random') return;
      playBack(pickRandomBack());
      // comes back up when the new one is really playing, or soon after if it's slow
      let up = false;
      const reveal = () => { if (up) return; up = true; wall.removeEventListener('playing', reveal); fader.classList.remove('dark'); };
      wall.addEventListener('playing', reveal);
      setTimeout(reveal, BACK_READY_MS);
      backTimer = setTimeout(fadeToNextBack, BACK_MS());
    }, FADE_MS);
  }
  function nextBack() {
    backId = BACKS[(BACKS.findIndex((x) => x.id === backId) + 1) % BACKS.length].id;
    showBack();
    save();
  }
  function playWall() {
    if (!wallIsVideo) return;
    const p = wall.play();
    if (p && p.catch) p.catch((e) => { diag.wall = 'would not play: ' + e.name; renderDiag(); });
  }
  wall.addEventListener('playing', () => { diag.wall = 'playing'; renderDiag(); });
  wall.addEventListener('error', () => { if (!wallIsVideo) return; wall.hidden = true; diag.wall = 'failed, showing the still picture'; renderDiag(); });
  // If the TV drops the video while we're on screen, write down how and bring it back.
  const WALL_CHECK_MS = 2000;
  let wallTime = -1, wallEvents = [];
  function noteWall(what) {
    wallEvents = wallEvents.concat(what).slice(-4);
    diag.wallLog = wallEvents.join(', ');
    renderDiag();
  }
  ['pause', 'waiting', 'stalled', 'emptied', 'suspend', 'ended'].forEach((ev) => wall.addEventListener(ev, () => {
    noteWall(ev);
    if (ev === 'pause' && !document.hidden) playWall();
  }));
  document.addEventListener('visibilitychange', () => noteWall(document.hidden ? 'app hidden' : 'app shown'));
  setInterval(() => {
    if (!wallIsVideo || document.hidden || wall.error) return;
    if (wall.currentTime === wallTime) { noteWall('stuck, restarted'); wall.load(); playWall(); }
    wallTime = wall.currentTime;
  }, WALL_CHECK_MS);

  /* ---------- motion: the opening sequence, comets, and the universe's color through the day ---------- */
  const ARRIVE_MS = 1400, COMET_FIRST_MS = 10000, COMET_GAP_MS = 40000, COMET_MS = 3200;
  let arriveTimer = 0;
  function arrive() {
    clearTimeout(arriveTimer);
    stage.classList.add('arrive');
    arriveTimer = setTimeout(() => { stage.classList.remove('arrive'); placeRing(); }, ARRIVE_MS);
  }

  function comet() {
    if (!document.hidden) {
      const ltr = Math.random() < 0.5, y0 = 30 + Math.random() * 360;
      flyComet(ltr ? -400 : 2320, y0, ltr ? 2320 : -400, y0 + 40 + Math.random() * 220);
    }
    setTimeout(comet, COMET_GAP_MS + Math.random() * COMET_GAP_MS);
  }

  function flyComet(x0, y0, x1, y1) {
    const a = Math.atan2(y1 - y0, x1 - x0);
    const at = (x, y) => 'translate(' + (x - 360) + 'px,' + y + 'px) rotate(' + a + 'rad)';
    $('comet').animate([
      { transform: at(x0, y0), opacity: 0 },
      { opacity: 1, offset: 0.08 },
      { opacity: 1, offset: 0.88 },
      { transform: at(x1, y1), opacity: 0 }
    ], { duration: COMET_MS, easing: 'linear' });
  }

  // Every few seconds a streak of light runs across one logo key, like polished metal catching the sun.
  const GLINT_MS = 650, GLINT_GAP_MS = 3500, GLINT_FIRST_MS = 2500;
  function glint() {
    if (!document.hidden && order.length) {
      const g = apps.get(order[Math.floor(Math.random() * order.length)]).el.querySelector('.glint');
      g.animate([
        { transform: 'translateX(-40px) rotate(18deg)', opacity: 1 },
        { transform: 'translateX(100px) rotate(18deg)', opacity: 1 }
      ], { duration: GLINT_MS, easing: 'ease-in-out' });
    }
    setTimeout(glint, GLINT_GAP_MS + Math.random() * GLINT_GAP_MS);
  }

  // Now and then a rail box drops out and comes back on, and every minute or two the whole console has a brief interruption and resets.
  const BOX_GAP_MS = 7000, BLIP_FIRST_MS = 40000, BLIP_GAP_MS = 60000, BLINK_MS = 520, BLIP_SPREAD_MS = 320;
  const OUT_AND_BACK = [{ opacity: 1 }, { opacity: 0.1, offset: 0.12 }, { opacity: 0.9, offset: 0.3 }, { opacity: 0.2, offset: 0.48 }, { opacity: 1, offset: 0.7 }, { opacity: 1 }];
  const blink = (el, delay) => el.animate(OUT_AND_BACK, { id: 'flick', duration: BLINK_MS, delay: delay || 0 });
  function boxFlick() {
    if (!document.hidden && mode === 'main') {
      const boxes = [...document.querySelectorAll('#fill i'), $('weather')].filter((b) => b.offsetWidth);
      blink(boxes[Math.floor(Math.random() * boxes.length)]);
    }
    setTimeout(boxFlick, BOX_GAP_MS + Math.random() * BOX_GAP_MS);
  }
  function blip() {
    if (!document.hidden && mode === 'main') {
      [$('side'), $('elbowB'), $('brand'), settingsKey, ...document.querySelectorAll('#fill i'), $('weather'), $('clock'), ...document.querySelectorAll('.tile')]
        .forEach((el) => blink(el, Math.random() * BLIP_SPREAD_MS));
    }
    setTimeout(blip, BLIP_GAP_MS + Math.random() * BLIP_GAP_MS);
  }

  function setSky(hour) {
    $('sky').dataset.part = hour < 6 || hour >= 21 ? 'night' : hour < 11 ? 'morning' : hour < 17 ? 'day' : 'evening';
  }

  /* ---------- the live Edison test: how many frames a second can this TV draw him at? ---------- */
  const LIVE_AT = { x: 980, y: 330, r: 155 };
  let liveEd = null, liveFrames = [];
  function startLive() {
    if (!window.EdisonLive) { diag.live = 'not loaded'; return; }
    try {
      liveEd = window.EdisonLive.start($('liveEd'), (fps, gpu) => {
        liveFrames = liveFrames.concat(fps).slice(-30);
        const low = Math.min(...liveFrames), avg = Math.round(liveFrames.reduce((a, b) => a + b, 0) / liveFrames.length);
        diag.live = fps + ' fps now, ' + avg + ' average, ' + low + ' lowest, solid ball, ' + gpu;
        renderDiag();
      });
      if (liveEd) { const at = LAYOUTS[layout]; liveEd.roamBox(at.rx, at.ry); liveEd.center.x = 960 - at.x; liveEd.center.y = 480 - at.y; }
    } catch (e) { diag.live = 'failed: ' + e.message; }
  }

  /* ---------- the pointer: elastic keys, a stardust trail, and clicks on the sky ---------- */
  const PULL_R = 200, PULL = 7, SPRING = 0.16, DAMP = 0.7, KICK = 3, IDLE_MS = 2500, SPARK_GAP = 26, SPARK_COUNT = 48, BURST = 18;
  const sparks = Array.from({ length: SPARK_COUNT }, () => {
    const s = document.createElement('i');
    s.className = 'spark';
    return s;
  });
  $('sparks').append(...sparks);
  let sparkNext = 0, sparkX = -999, sparkY = -999, px = null, py = null, idleTimer = 0, springing = false, centers = null;

  function spark(x, y, dx, dy, ms) {
    const s = sparks[sparkNext];
    sparkNext = (sparkNext + 1) % SPARK_COUNT;
    s.style.background = 'var(--c' + (Math.floor(Math.random() * TILE_COLORS) + 1) + ')';
    s.animate([
      { transform: 'translate(' + x + 'px,' + y + 'px) scale(1)', opacity: 0.95 },
      { transform: 'translate(' + (x + dx) + 'px,' + (y + dy) + 'px) scale(.2)', opacity: 0 }
    ], { duration: ms, easing: 'ease-out' });
  }

  function pointerMoved(x, y) {
    px = x;
    py = y;
    if (liveEd) liveEd.lookAt((x - LIVE_AT.x - liveEd.offset.x) / 900, (LIVE_AT.y + liveEd.offset.y - y) / 500);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { px = null; startSpring(); if (liveEd) liveEd.rest(); }, IDLE_MS);
    if (Math.hypot(x - sparkX, y - sparkY) >= SPARK_GAP) {
      sparkX = x;
      sparkY = y;
      spark(x, y, (Math.random() - 0.5) * 50, 20 + Math.random() * 50, 800);
    }
    startSpring();
  }

  function kick(el) {
    const a = apps.get(el.dataset.key);
    if (!a) return;
    a.vx = (a.vx || 0) + KICK;
    startSpring();
  }

  function startSpring() {
    if (springing) return;
    springing = true;
    centers = null;
    requestAnimationFrame(springStep);
  }

  // Every key is a small spring. Near the pointer it leans in; everywhere else it settles at rest, and the loop stops.
  function springStep() {
    if (!centers) {
      const s = stage.getBoundingClientRect();
      centers = new Map(order.map((k) => {
        const r = apps.get(k).el.getBoundingClientRect();
        return [k, { x: (r.left - s.left) / scale + 44, y: (r.top - s.top + r.height / 2) / scale }];
      }));
    }
    let moving = false;
    order.forEach((k) => {
      const a = apps.get(k), c = centers.get(k);
      let tx = 0, ty = 0;
      if (px !== null && mode === 'main') {
        const dx = px - c.x, dy = py - c.y, d = Math.hypot(dx, dy);
        if (d > 1 && d < PULL_R) { const f = PULL * (1 - d / PULL_R) / d; tx = dx * f; ty = dy * f; }
      }
      a.ex = a.ex || 0; a.ey = a.ey || 0; a.vx = a.vx || 0; a.vy = a.vy || 0;
      a.vx = (a.vx + (tx - a.ex) * SPRING) * DAMP;
      a.vy = (a.vy + (ty - a.ey) * SPRING) * DAMP;
      a.ex += a.vx;
      a.ey += a.vy;
      if (Math.abs(a.vx) + Math.abs(a.vy) > 0.03 || Math.abs(tx - a.ex) + Math.abs(ty - a.ey) > 0.06) moving = true;
      if (Math.abs(a.ex - (a.shownX || 0)) + Math.abs(a.ey - (a.shownY || 0)) > 0.1) {
        a.shownX = a.ex;
        a.shownY = a.ey;
        a.el.style.setProperty('--ex', a.ex.toFixed(1) + 'px');
        a.el.style.setProperty('--ey', a.ey.toFixed(1) + 'px');
      }
    });
    if (moving) requestAnimationFrame(springStep); else springing = false;
  }

  function skyClick(e) {
    const x = e.clientX / scale, y = e.clientY / scale;
    if (liveEd && Math.hypot(x - LIVE_AT.x - liveEd.offset.x, y - LIVE_AT.y - liveEd.offset.y) < LIVE_AT.r * liveEd.zoom) { burst(x, y); liveEd.spinKick(); say('edison'); return; }
    if (backNow && backNow.planets && x > SUN_AT.left && x < SUN_AT.right && y > SUN_AT.top && y < SUN_AT.bottom) say('sun'); // only where there are planets to talk about
    burst(x, y);
    const ang = Math.random() * Math.PI * 2;
    flyComet(x, y, x + Math.cos(ang) * 2600, y + Math.sin(ang) * 2600);
  }

  function burst(x, y) {
    for (let i = 0; i < BURST; i++) {
      const a = Math.PI * 2 * i / BURST, r = 70 + Math.random() * 90;
      spark(x, y, Math.cos(a) * r, Math.sin(a) * r, 900);
    }
  }

  /* ---------- Edison's voice: a few recorded lines, a greeting at most every few hours, and a reply when clicked ---------- */
  const SUN_AT = { left: 240, right: 800, top: 330, bottom: 480 };
  const LINES = { edison: 18, sun: 6, launch: 13 }, GREETINGS = 3, APP_LINE_CHANCE = 0.6, GREET_KEY = 'edisonHome.greeted.v2', GREET_EVERY_MS = 30 * 60 * 1000, GREET_DELAY_MS = 1500;
  const heard = { edison: [], sun: [], launch: [] };
  let speaking = null;

  // Web Audio, not an audio element: on this TV an audio element takes the video's place and the wallpaper goes dark.
  let audio = null;
  function play(name) {
    if (!voiceOn || speaking) return;
    const fail = (why) => { speaking = null; diag.voice = name + ': ' + why; renderDiag(); };
    speaking = {};
    const clip = speaking;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const x = new XMLHttpRequest();
      x.open('GET', 'voice/' + name + '.mp3');
      x.responseType = 'arraybuffer';
      x.onerror = () => fail('could not read the clip');
      x.onload = () => audio.decodeAudioData(x.response, (buffer) => {
        if (speaking !== clip) return; // switched off while loading
        const src = audio.createBufferSource();
        src.buffer = buffer;
        src.connect(audio.destination);
        if (liveEd && audio.createAnalyser) {
          const ear = audio.createAnalyser(), wave = new Uint8Array(256);
          ear.fftSize = 256;
          src.connect(ear);
          liveEd.voice = () => { ear.getByteTimeDomainData(wave); let peak = 0; for (let i = 0; i < wave.length; i++) peak = Math.max(peak, Math.abs(wave[i] - 128)); return peak / 128; };
        }
        src.onended = () => { if (speaking === clip) speaking = null; if (liveEd) liveEd.voice = null; };
        clip.stop = () => src.stop();
        src.start();
        diag.voice = 'said ' + name;
        renderDiag();
      }, () => fail('could not decode the clip'));
      x.send();
    } catch (e) { fail(e.name); }
  }

  // Goes through every line once, in a shuffled order, before any of them repeats.
  function say(group) {
    if (!heard[group].length) heard[group] = Array.from({ length: LINES[group] }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
    if (!speaking && voiceOn) play(group + '-' + heard[group].pop());
  }

  function greet() {
    const now = Date.now();
    try {
      if (now - Number(window.localStorage.getItem(GREET_KEY) || 0) < GREET_EVERY_MS) return;
      window.localStorage.setItem(GREET_KEY, String(now));
    } catch (e) { /* no storage: greet anyway */ }
    const h = new Date().getHours();
    const pick = Math.floor(Math.random() * GREETINGS) + 1;
    setTimeout(() => play('greet-' + (h < 5 || h >= 23 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening') + (pick > 1 ? '-' + pick : '')), GREET_DELAY_MS);
  }

  function showVoice() { $('voiceKey').textContent = voiceOn ? 'VOICE: ON' : 'VOICE: OFF'; }
  /* ---------- color choices, in app.css ---------- */
  const PALETTES = [['eye', 'EDISON EYE'], ['mission', 'MISSION CONTROL'], ['gunmetal', 'GUNMETAL'], ['forge', 'FORGE AMBER'], ['navy', 'NAVY'], ['synthwave', 'SYNTHWAVE'], ['neon', 'NEON'], ['glass', 'GLASS (SLOWER)'], ['edison', 'EDISON SOFT']];
  function showPalette() {
    const i = Math.max(PALETTES.findIndex((p) => p[0] === palette), 0);
    document.documentElement.dataset.palette = PALETTES[i][0];
    $('paletteKey').textContent = 'COLORS: ' + PALETTES[i][1];
  }
  // Where the apps sit. Edison floats in whatever is left open.
  const LAYOUTS = { bottom: { x: 960, y: 320, rx: 700, ry: 130 }, top: { x: 960, y: 760, rx: 700, ry: 110 }, left: { x: 1360, y: 450, rx: 300, ry: 250 }, right: { x: 560, y: 450, rx: 300, ry: 250 } }, LAYOUT_ORDER = Object.keys(LAYOUTS);
  function showLayout() {
    const root = document.documentElement, at = LAYOUTS[layout] || LAYOUTS.bottom;
    root.dataset.layout = layout;
    $('layoutKey').textContent = 'APPS: ' + layout.toUpperCase();
    root.style.setProperty('--ed-x', at.x + 'px');
    root.style.setProperty('--ed-y', at.y + 'px');
    LIVE_AT.x = at.x;
    LIVE_AT.y = at.y;
    if (liveEd) { liveEd.roamBox(at.rx, at.ry); liveEd.center.x = 960 - at.x; liveEd.center.y = 480 - at.y; }
    renderTiles();
  }
  function nextLayout() {
    layout = LAYOUT_ORDER[(LAYOUT_ORDER.indexOf(layout) + 1) % LAYOUT_ORDER.length];
    showLayout();
    save();
    placeRing();
  }

  function showIcons() {
    document.documentElement.dataset.icons = largeIcons ? 'large' : 'small';
    $('iconsKey').textContent = largeIcons ? 'ICONS: LARGE' : 'ICONS: SMALL';
  }
  function toggleIcons() {
    largeIcons = !largeIcons;
    showIcons();
    save();
    placeRing();
  }
  function nextPalette() {
    palette = PALETTES[(PALETTES.findIndex((p) => p[0] === palette) + 1) % PALETTES.length][0];
    showPalette();
    save();
  }

  function toggleVoice() {
    voiceOn = !voiceOn;
    if (!voiceOn && speaking) { if (speaking.stop) speaking.stop(); speaking = null; }
    showVoice();
    save();
  }

  /* ---------- the Edison block: a long four-sided box that looks flat until, now and then, it rolls or flips by itself ---------- */
  const SITE = 'https://heyedison.ai', BROWSER = 'com.webos.app.browser';
  // A different move each time, picked at random, elastic.
  const TURN_FIRST_MS = 8000, TURN_GAP_MS = 8000, LOGO_MS = 66, ELASTIC = 'cubic-bezier(.45,-0.35,.25,1.4)';
  const prism = $('prism'), LETTERS = ['E', 'D', 'I', 'S', 'O', 'N'], SIDE_COLORS = ['--c2', '--c1', '--c3', '--c5'];
  const coin = () => (Math.random() < 0.5 ? 1 : -1);
  let prismN = 0;
  function rawTurn(el, deg, ms, ease) { el.style.transition = 'transform ' + ms + 'ms ' + ease; el.style.setProperty('--rx', deg + 'deg'); }
  function turnTo(n, ms, ease) { prismN = n; rawTurn(prism, -90 * n, ms, ease || ELASTIC); }

  // The word breaks into one small box per letter, and they turn on their own, then hand back to the big box on the logo side.
  function letterMove(kind) {
    const n0 = prismN, d = coin(), N = LETTERS.length, mid = (N - 1) / 2;
    const plan = LETTERS.map((_, i) => ({ q: 4 * d, ms: 800, at: i * 85, ease: ELASTIC }));
    if (kind === 'rl') plan.forEach((p, i) => { p.at = (N - 1 - i) * 85; });
    if (kind === 'mid') plan.forEach((p, i) => { p.at = Math.round(Math.abs(i - mid)) * 120; });
    if (kind === 'rand') [...plan].sort(() => Math.random() - 0.5).forEach((p, k) => { p.at = k * 85; });
    if (kind === 'zip') plan.forEach((p, i) => { p.q = i % 2 ? -4 * d : 4 * d; p.ms = i % 2 ? 1300 : 800; p.at = 0; });
    if (kind === 'slot') plan.forEach((p, i) => { p.q = 8 * d; p.ms = 900 + i * 230; p.at = 0; p.ease = 'cubic-bezier(.3,.6,.3,1.08)'; });
    if (kind === 'dom') plan.forEach((p, i) => { p.q = 4 * d; p.ms = 1000; p.at = i * 140; p.ease = 'cubic-bezier(.5,-0.5,.2,1.6)'; });
    const lay = document.createElement('div');
    lay.className = 'cells';
    const cells = LETTERS.map((ch) => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.setProperty('--rx', (-90 * n0) + 'deg');
      SIDE_COLORS.forEach((color, k) => {
        const f = document.createElement('i');
        f.style.setProperty('--n', k);
        f.style.setProperty('--f', 'var(' + color + ')');
        if (ch === 'O') { const o = document.createElement('img'); o.src = 'icons/edison-o.png'; o.alt = ''; f.append(o); } else f.textContent = ch;
        cell.append(f);
      });
      return cell;
    });
    lay.append(...cells);
    $('brand').append(lay);
    prism.style.visibility = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => cells.forEach((el, i) => {
      const p = plan[i];
      setTimeout(() => rawTurn(el, -90 * (n0 + p.q), p.ms, p.ease), p.at);
    })));
    setTimeout(() => { prism.style.visibility = ''; lay.remove(); }, Math.max(...plan.map((p) => p.at + p.ms)) + 120);
  }

  const MOVES = [
    ...[1, 2, 3, 4, -1, -2, -3, -4].map((k) => () => turnTo(prismN + k, 900 + (Math.abs(k) - 1) * 380)),
    () => { // tease: starts to go, snaps back, goes the other way
      const d = coin(), n0 = prismN;
      rawTurn(prism, -90 * n0 - 32 * d, 420, 'cubic-bezier(.3,0,.3,1)');
      setTimeout(() => rawTurn(prism, -90 * n0 + 10 * d, 300, 'ease-out'), 430);
      setTimeout(() => turnTo(n0 - d, 900), 780);
    },
    () => { // ratchet: tick, tick, tick
      const d = coin(), n0 = prismN;
      [1, 2, 3].forEach((k, i) => setTimeout(() => turnTo(n0 + d * k, 260, 'cubic-bezier(.5,0,.3,1.5)'), i * 420));
    },
    () => turnTo(prismN + 6 * coin(), 2000, 'cubic-bezier(.2,.9,.25,1.25)'), // whirl: a spin and a half with a big bounce
    () => { // knock: a little jiggle, then it turns
      const n0 = prismN, d = coin();
      [8, -6, 4, -2, 0].forEach((a, i) => setTimeout(() => rawTurn(prism, -90 * n0 + a, 90, 'ease-in-out'), i * 95));
      setTimeout(() => turnTo(n0 + d, 900), 560);
    },
    ...['lr', 'rl', 'mid', 'rand', 'zip', 'slot', 'dom'].map((kind) => () => letterMove(kind))
  ];
  const LETTER_MOVES = 7;

  function prismMove() {
    if (!document.hidden && !prism.style.visibility) {
      const onLogo = ((prismN % 4) + 4) % 4 === 0;
      if (!onLogo && Math.random() < 0.6) turnTo(prismN + (4 - (((prismN % 4) + 4) % 4)), 1100); // mostly comes home to his logo
      else MOVES[Math.floor(Math.random() * (onLogo ? MOVES.length : MOVES.length - LETTER_MOVES))]();
    }
    setTimeout(prismMove, TURN_GAP_MS + Math.random() * TURN_GAP_MS);
  }
  function drawLogo() {
    if (!document.hidden && window.EdisonIcon) window.EdisonIcon.draw($('edisonO').getContext('2d'), 96, performance.now(), { bare: true });
  }
  // The TV's web browser opens his site. It takes over the screen; Back or button 7 returns here.
  function openSite() {
    luna('luna://com.webos.applicationManager/launch', { id: BROWSER, params: { target: SITE } }, LAUNCH_WAIT_MS, (res) => {
      diag.launch = 'heyedison.ai: ' + (res.ok ? 'ok' : res.reason);
      renderDiag();
      if (!res.ok && res.reason !== 'no reply') toast('Could not open the website: ' + res.reason);
    });
  }

  /* ---------- weather for the city picked in Settings, straight from the TV, no account or key. Off until a city is picked. ---------- */
  let weatherAt = null;
  const cityInput = $('cityInput');
  const weatherUrl = (w) => 'https://api.open-meteo.com/v1/forecast?latitude=' + w.lat + '&longitude=' + w.lon + '&current=temperature_2m,weather_code&temperature_unit=' + (w.us ? 'fahrenheit' : 'celsius') + '&timezone=auto';
  function showWeather() { $('weatherKey').textContent = 'WEATHER: ' + (weatherAt ? weatherAt.name.toUpperCase() : 'OFF'); }
  function closeCity() { cityInput.blur(); $('cityBox').hidden = true; cityInput.value = ''; }
  function weatherKeyPressed() {
    if (weatherAt) { weatherAt = null; showWeather(); updateWeather(); save(); return; } // pressing it again turns it off, then the next press picks a new city
    $('cityBox').hidden = false;
    cityInput.focus();
  }
  async function findCity() {
    try {
      const r = await window.fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&name=' + encodeURIComponent(cityInput.value.trim()));
      const c = ((await r.json()).results || [])[0];
      if (!c) return toast('Could not find that city. Try the name again.');
      weatherAt = { name: c.name, lat: c.latitude, lon: c.longitude, us: c.country_code === 'US' };
      closeCity();
      showWeather();
      updateWeather();
      save();
    } catch (e) { toast('Could not look that up. Check the internet and try again.'); }
  }
  const WEATHER_MS = 30 * 60 * 1000;
  function skyWord(code) {
    if (code === 0) return 'CLEAR';
    if (code <= 2) return 'PARTLY CLOUDY';
    if (code === 3) return 'CLOUDY';
    if (code <= 48) return 'FOG';
    if (code <= 67 || (code >= 80 && code <= 82)) return 'RAIN';
    if (code <= 86) return 'SNOW';
    return 'STORMS';
  }
  async function updateWeather() {
    if (!weatherAt) { $('weather').textContent = ''; diag.weather = 'off'; return renderDiag(); }
    try {
      const r = await window.fetch(weatherUrl(weatherAt));
      const now = (await r.json()).current;
      $('weather').textContent = Math.round(now.temperature_2m) + '\u00B0 ' + skyWord(now.weather_code);
      diag.weather = 'ok';
    } catch (e) {
      $('weather').textContent = ''; // an old reading would be worse than none
      diag.weather = 'no answer';
    }
    renderDiag();
  }

  /* ---------- small things ---------- */
  function toast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, TOAST_MS);
  }

  function tick() {
    const d = new Date(), h = d.getHours() % 12 || 12;
    setSky(d.getHours());
    const m = String(d.getMinutes()).padStart(2, '0');
    $('time').textContent = h + ':' + m + (d.getHours() < 12 ? ' AM' : ' PM');
    $('date').textContent = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()] + ' ' + d.getDate() + ' '
      + ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getMonth()];
  }

  function fit() {
    scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = scale === 1 ? '' : 'scale(' + scale + ')';
    placeRing();
  }

  /* ---------- start ---------- */
  // saved choices first, so the first save can't overwrite them
  const prefs = readStore();
  voiceOn = prefs.voice !== false;
  largeIcons = prefs.largeIcons === true;
  if (prefs.eyeSeen) palette = prefs.palette || palette; // anyone who hasn't seen his eye colors starts on them once
  if (LAYOUTS[prefs.layout]) layout = prefs.layout;
  if (typeof prefs.back === 'string') backId = prefs.back;
  if (prefs.weather && typeof prefs.weather.lat === 'number') weatherAt = prefs.weather;
  const saved = window.EDISON_APPS || {};
  const list = normalize(saved.apps);
  diag.source = (saved.placeholder ? 'placeholder' : saved.syncedAt ? 'saved, synced ' + String(saved.syncedAt).slice(0, 10) : 'saved') + ' (' + list.length + ' apps)';
  setList(list);
  fit();
  backHome();
  tick();
  setInterval(tick, 15000);
  arrive();
  showVoice();
  showIcons();
  showLayout();
  showBack();
  showWeather();
  showPalette();
  greet();
  setTimeout(comet, COMET_FIRST_MS);
  setTimeout(glint, GLINT_FIRST_MS);
  setTimeout(prismMove, TURN_FIRST_MS);
  startLive();
  setTimeout(boxFlick, BOX_GAP_MS);
  setTimeout(blip, BLIP_FIRST_MS);
  drawLogo();
  setInterval(drawLogo, LOGO_MS);
  updateWeather();
  setInterval(updateWeather, WEATHER_MS);
  window.addEventListener('resize', fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeRing);
  renderDiag();
  tryLiveList();

})();
