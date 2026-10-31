#!/usr/bin/env node
// Edison Home installer. Reads your own TV's app list into the app, packages it with LG's tools and installs it.
//   node install.js             install, or update and refresh the app list
//   node install.js uninstall   remove Edison Home from the TV
// Your TV's address and pairing key stay in tv.local.json in this folder. Nothing is sent anywhere but your TV.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');
const WebSocket = require('ws');

const ID = 'com.heyedison.home', DEVICE = 'edison-home-tv';
const ROOT = __dirname, BUILD = path.join(ROOT, 'build'), SAVED = path.join(ROOT, 'tv.local.json');
const BIN = path.join(ROOT, 'node_modules', '.bin');

function ares(tool, args, opts = {}) {
  const r = spawnSync(path.join(BIN, tool), args, { shell: process.platform === 'win32', stdio: opts.quiet ? 'pipe' : 'inherit', encoding: 'utf8' });
  if (r.status !== 0 && !opts.mayFail) throw new Error(tool + ' did not finish. Look at the message above, then run this again.');
  return r;
}
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}
const load = () => { try { return JSON.parse(fs.readFileSync(SAVED, 'utf8')); } catch (e) { return {}; } };
const store = (v) => fs.writeFileSync(SAVED, JSON.stringify(v, null, 2));

// Asks the TV for its app list. The first time, the TV shows a prompt and you press Accept with the remote.
function readApps(host, key) {
  return new Promise((resolve, reject) => {
    // the TV's certificate is its own, so it can't be checked against a public authority; this applies to this one connection on your home network
    const ws = new WebSocket('wss://' + host + ':3001', { rejectUnauthorized: false, handshakeTimeout: 8000 });
    const fail = (why) => { clearTimeout(timer); ws.terminate(); reject(new Error(why)); };
    const timer = setTimeout(() => fail('The TV did not answer in time. If it asked you to accept, run this again and press Accept.'), 90000);
    let newKey = key;
    ws.on('error', () => fail('Could not reach the TV at ' + host + ' on port 3001. Is it on and on this network?'));
    ws.on('open', () => ws.send(JSON.stringify({ type: 'register', id: 'reg', payload: {
      forcePairing: false, pairingType: 'PROMPT', 'client-key': key || undefined,
      manifest: { manifestVersion: 1, appVersion: '1.0', permissions: ['READ_INSTALLED_APPS'] }
    } })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.type === 'error') return fail('The TV said no: ' + (m.error || 'unknown reason'));
      if (m.id === 'reg' && m.payload && m.payload.pairingType) return console.log('\nLook at your TV and press Accept with the remote.\n');
      if (m.id === 'reg' && m.type === 'registered') {
        newKey = m.payload['client-key'];
        return ws.send(JSON.stringify({ type: 'request', id: 'list', uri: 'ssap://com.webos.applicationManager/listLaunchPoints' }));
      }
      if (m.id === 'list') {
        clearTimeout(timer);
        ws.close();
        if (!m.payload || !Array.isArray(m.payload.launchPoints)) return reject(new Error('The TV did not share its app list.'));
        resolve({ key: newKey, launchPoints: m.payload.launchPoints });
      }
    });
  });
}

function toApps(launchPoints) {
  const seen = new Set(), out = [];
  for (const a of launchPoints) {
    if (!a || a.hidden || !a.id || !a.title || a.id === ID) continue;
    const key = a.launchPointId || a.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ launchPointId: a.launchPointId || null, id: a.id, title: String(a.title), params: a.params && Object.keys(a.params).length ? a.params : null, iconColor: null, icon: null });
  }
  return out;
}

async function setUpDevice(saved) {
  const list = ares('ares-setup-device', ['--list'], { quiet: true }).stdout || '';
  if (list.includes(DEVICE) && list.includes(saved.host)) return;
  ares('ares-setup-device', ['--add', DEVICE, '--info', 'host=' + saved.host, '--info', 'port=9922', '--info', 'username=prisoner'], { quiet: true, mayFail: true });
  console.log('\nOn the TV, open the Developer Mode app and turn Key Server on. Next you will type the passphrase shown on that screen. It shows in this window as you type, so clear the window afterward if you are sharing your screen or a log.\n');
  await ask('Press Enter when Key Server is on.');
  ares('ares-novacom', ['--device', DEVICE, '--getkey']);
  console.log('\nYou can turn Key Server off again now.\n');
}

async function main() {
  if (!fs.existsSync(path.join(BIN, process.platform === 'win32' ? 'ares-install.cmd' : 'ares-install'))) throw new Error('LG\'s tools are missing. Run: npm install');
  const saved = load();
  if (!saved.host) saved.host = await ask('Your TV\'s IP address (TV Settings, General, Network): ');
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(saved.host)) throw new Error('That does not look like an IP address, for example 192.168.0.33.');
  store(saved);
  await setUpDevice(saved);

  if (process.argv[2] === 'uninstall') {
    ares('ares-install', ['--device', DEVICE, '--remove', ID]);
    return console.log('\nEdison Home is off your TV.');
  }

  console.log('Reading your TV\'s apps...');
  const { key, launchPoints } = await readApps(saved.host, saved.key);
  store(Object.assign(saved, { key }));
  const apps = toApps(launchPoints);
  if (!apps.length) throw new Error('The TV returned no apps.');
  console.log('Found ' + apps.length + ' apps.');

  fs.rmSync(BUILD, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'app'), path.join(BUILD, 'app'), { recursive: true });
  fs.writeFileSync(path.join(BUILD, 'app', 'data', 'apps.js'), 'window.EDISON_APPS = ' + JSON.stringify({ syncedAt: new Date().toISOString(), placeholder: false, apps }, null, 2) + ';\n');
  ares('ares-package', ['--no-minify', '-o', path.join(BUILD, 'dist'), path.join(BUILD, 'app')]);
  const ipk = fs.readdirSync(path.join(BUILD, 'dist')).find((f) => f.endsWith('.ipk'));
  console.log('Installing. This takes about half a minute...');
  ares('ares-install', ['--device', DEVICE, path.join(BUILD, 'dist', ipk)]);
  ares('ares-launch', ['--device', DEVICE, ID]);
  console.log('\nDone. Edison Home is open on your TV, and in the app bar from now on.');
}

main().catch((e) => { console.error('\n' + e.message); process.exitCode = 1; });
