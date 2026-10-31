#!/usr/bin/env node
// Jailbreak My TV installer. Walks you through each step, reads your own TV's app list into the app, packages it with LG's tools and installs it.
//   node install.js             install, or update and refresh the app list
//   node install.js fix         check everything, say what is wrong, and repair what it can
//   node install.js uninstall   remove Edison Home from the TV
// Your TV's address and pairing key stay in tv.local.json in this folder. Nothing is sent anywhere but your TV.
process.noDeprecation = true; // LG's tools run through a shell on Windows, and Node's notice about that only worries people
const fs = require('fs');
const net = require('net');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

const ID = 'com.heyedison.home', NODE_MIN = 22, DEVICE = 'edison-home-tv';
const ROOT = __dirname, BUILD = path.join(ROOT, 'build'), SAVED = path.join(ROOT, 'tv.local.json');
const BIN = path.join(ROOT, 'node_modules', '.bin');

function ares(tool, args, opts = {}) {
  const r = spawnSync(path.join(BIN, tool), args, { shell: process.platform === 'win32', stdio: opts.quiet ? 'pipe' : 'inherit', encoding: 'utf8' });
  if (r.status !== 0 && !opts.mayFail) {
    if (opts.quiet) console.error((r.stdout || '') + (r.stderr || ''));
    throw new Error(tool + ' did not finish. Look at the message above, then run this again.');
  }
  return r;
}
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve, reject) => {
    let answered = false;
    rl.on('close', () => { if (!answered) reject(new Error('Stopped before finishing. Nothing was changed by this step.')); });
    rl.question(question, (a) => { answered = true; rl.close(); resolve(a.trim()); });
  });
}
const load = () => { try { return JSON.parse(fs.readFileSync(SAVED, 'utf8')); } catch (e) { return {}; } };
const store = (v) => fs.writeFileSync(SAVED, JSON.stringify(v, null, 2));
const IP = /^\d{1,3}(\.\d{1,3}){3}$/;

const PROMPT = path.join(ROOT, 'installer', 'ai-helper-prompt.txt');
function copyPrompt(report) {
  const tools = { win32: ['clip'], darwin: ['pbcopy'] }[process.platform] || ['wl-copy', 'xclip -selection clipboard', 'xsel --clipboard --input'];
  const text = fs.readFileSync(PROMPT, 'utf8') + (report ? '\nHere is the installer\'s checkup:\n' + report + '\n' : '');
  const copied = tools.some((t) => spawnSync(t, { input: text, shell: true, stdio: ['pipe', 'ignore', 'ignore'] }).status === 0);
  console.log(copied ? 'Copied. Paste it into any AI chat, such as Claude, and keep that chat beside this window.\n'
    : 'Could not copy it here. Open installer/ai-helper-prompt.txt and paste its text into any AI chat.\n');
}
async function offerHelper(question, report) {
  if (/^a$/i.test(await ask(question))) copyPrompt(report);
}

let stepNo = 0, stepTotal = 5;
function step(title, lines) {
  console.log('\n===== Step ' + (++stepNo) + ' of ' + stepTotal + ': ' + title + ' =====\n');
  for (const l of lines || []) console.log(l);
}

// Developer Mode opens this port, so an answer here means the address is right and Developer Mode is on.
function canReach(host) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port: 9922, timeout: 4000 });
    const done = (ok) => { s.destroy(); resolve(ok); };
    s.on('connect', () => done(true));
    s.on('timeout', () => done(false));
    s.on('error', () => done(false));
  });
}

// Asks the TV for its app list. The first time, the TV shows a prompt and you press Accept with the remote.
function readApps(host, key) {
  const WebSocket = require('ws');
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
      if (m.id === 'reg' && m.payload && m.payload.pairingType) return console.log('A box is on your TV now. Press Accept with the remote. You have 90 seconds.\n');
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

async function turnOnDevMode() {
  step('Turn on Developer Mode', [
    'Skip this if Developer Mode is already on.',
    '',
    '  1. On a computer or phone, create a free account at webostv.developer.lge.com',
    '  2. On the TV, open the app store, then find and install "Developer Mode"',
    '  3. Open it, sign in with that account, and turn Dev Mode Status on',
    '  4. The TV restarts. Wait for it to come back.',
    ''
  ]);
  await ask('Press Enter when Developer Mode is on.');
}

async function findTv(saved) {
  step('Find your TV', [
    'On the TV, go to Settings, General, Network, then your connection.',
    'Look for the IP address. It looks like 192.168.1.50.',
    ''
  ]);
  let host = saved.host || '';
  for (;;) {
    if (!IP.test(host)) host = await ask('Type the IP address, then press Enter: ');
    if (!IP.test(host)) { console.log('That does not look like an IP address. It should be four numbers with dots, like 192.168.1.50.\n'); continue; }
    console.log('Looking for your TV at ' + host + '...');
    if (await canReach(host)) break;
    console.log('\nNo answer from that address. Check these:');
    console.log('  - The TV is on, not just asleep');
    console.log('  - The TV and this computer are on the same network');
    console.log('  - Developer Mode says Dev Mode Status is on');
    console.log('  - The address is right\n');
    host = await ask('Press Enter to try again, or type a different address: ') || host;
  }
  console.log('Found it.');
  saved.host = host;
  store(saved);
}

async function connect(saved) {
  const host = saved.host;
  step('Connect this computer to your TV', [
    'On the TV, open the Developer Mode app and turn Key Server on.',
    'That screen also shows a passphrase of 6 letters and numbers. Capitals matter.',
    '',
    'You will type the passphrase in this window. It shows on screen as you type,',
    'so do not do this while sharing your screen or a log.',
    ''
  ]);
  ares('ares-setup-device', ['--remove', DEVICE], { quiet: true, mayFail: true }); // an old entry could point at another address
  ares('ares-setup-device', ['--add', DEVICE, '--info', 'host=' + host, '--info', 'port=9922', '--info', 'username=prisoner'], { quiet: true, mayFail: true });
  await ask('Press Enter when Key Server is on.');
  for (let tries = 1; ; tries++) {
    if (ares('ares-novacom', ['--device', DEVICE, '--getkey'], { mayFail: true }).status === 0) break;
    console.log('\nThat did not work. Key Server has to be on, and the passphrase has to match the TV screen exactly.\n');
    if (tries === 3) {
      ares('ares-setup-device', ['--remove', DEVICE], { quiet: true, mayFail: true });
      throw new Error('Could not connect after 3 tries. Run this again when you are ready.');
    }
    await ask('Press Enter to try again.');
  }
  console.log('\nConnected. You can turn Key Server off on the TV now.');
}

// LG's device list also holds passphrases, so it is only ever searched here. It never gets printed or copied.
function isSetUp(saved) {
  const list = ares('ares-setup-device', ['--list'], { quiet: true }).stdout || '';
  return Boolean(saved.host) && list.includes(DEVICE) && list.includes(saved.host);
}

function toolsReady() {
  return fs.existsSync(path.join(BIN, process.platform === 'win32' ? 'ares-install.cmd' : 'ares-install')) && fs.existsSync(path.join(ROOT, 'node_modules', 'ws'));
}

// What is wrong, in the order it has to be fixed. Each answer picks up the setup at the right step.
async function diagnose(saved) {
  if (!isSetUp(saved)) return { state: 'new' };
  if (!(await canReach(saved.host))) return { state: 'lost' };
  const r = ares('ares-install', ['--device', DEVICE, '--list'], { quiet: true, mayFail: true });
  if (r.status !== 0) return { state: 'key' };
  return { state: 'ok', installed: (r.stdout || '').includes(ID) };
}

// A checkup that is safe to paste anywhere: no address, key or passphrase.
async function checkup() {
  const yes = (b) => (b ? 'yes' : 'NO');
  const major = Number(process.versions.node.split('.')[0]);
  const lines = ['Computer: ' + process.platform, 'Node.js: ' + process.versions.node + (major < NODE_MIN ? ' (NEEDS ' + NODE_MIN + ' OR NEWER)' : ''), 'LG tools ready: ' + yes(toolsReady())];
  if (toolsReady()) {
    const d = await diagnose(load());
    lines.push('TV set up on this computer: ' + yes(d.state !== 'new'));
    if (d.state !== 'new') lines.push('TV answers: ' + yes(d.state !== 'lost'));
    if (d.state === 'key' || d.state === 'ok') lines.push('Connection key works: ' + yes(d.state === 'ok'));
    if (d.state === 'ok') lines.push('Edison Home on the TV: ' + yes(d.installed));
  }
  return lines.join('\n');
}

async function selfFix() {
  if (Number(process.versions.node.split('.')[0]) < NODE_MIN) throw new Error('This needs Node.js ' + NODE_MIN + ' or newer, and you have ' + process.versions.node + '. Install the LTS version from nodejs.org, then run this again.');
  if (toolsReady()) return;
  console.log('\nLG\'s tools are missing, so I am getting them. This takes a minute or two.\n');
  const r = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: ROOT, shell: process.platform === 'win32', stdio: 'inherit' });
  if (r.status !== 0 || !toolsReady()) throw new Error('Could not get LG\'s tools. Check your internet connection, then run this again.');
}

async function main() {
  await selfFix();
  const saved = load();
  const removing = process.argv[2] === 'uninstall';
  if (process.argv[2] === 'fix') console.log('\nChecking everything first.\n\n' + await checkup() + '\n\nNow repairing what it can. If nothing is wrong, this just reinstalls.');
  const { state } = await diagnose(saved);
  const known = state === 'ok';

  if (state === 'new') {
    if (!removing) {
      console.log('\nJailbreak My TV puts Edison Home on your LG TV, using LG\'s own Developer Mode. No root and no exploit.');
      console.log('It takes about 15 minutes, and it tells you what to do at each step.');
      console.log('Have your TV remote with you. You can stop any time and run this again.\n');
      await offerHelper('Want an AI helper beside you? Type A and press Enter to copy a prompt for it, or just press Enter to go on: ');
    }
    stepTotal = removing ? 3 : 5;
    await turnOnDevMode();
    await findTv(saved);
    await connect(saved);
  } else if (state === 'lost') {
    console.log('\nYour TV did not answer at ' + saved.host + '. Its address may have changed, or Developer Mode may be off, so let\'s find it again.');
    stepTotal = removing ? 2 : 4;
    await findTv(saved);
    await connect(saved);
  } else if (state === 'key') {
    console.log('\nThis computer\'s key no longer works on your TV. That is easy to fix: connect it again.');
    stepTotal = removing ? 1 : 3;
    await connect(saved);
  } else {
    stepTotal = removing ? 0 : 2;
  }

  if (removing) {
    ares('ares-install', ['--device', DEVICE, '--remove', ID]);
    return console.log('\nEdison Home is off your TV. Your layout and settings went with it.');
  }

  step('Let this computer read your app list', known ? ['Reading your TV\'s apps...'] : [
    'A web app on the TV is not allowed to read its own app list, so this computer reads it once and builds it in.',
    'This is the only thing the permission is used for.',
    ''
  ]);
  // an old pairing can go stale, so it asks the TV again once before giving up
  const { key, launchPoints } = await readApps(saved.host, saved.key).catch((e) => {
    if (!saved.key) throw e;
    console.log('The TV did not take the old pairing, so I am asking again.');
    return readApps(saved.host);
  });
  store(Object.assign(saved, { key }));
  const apps = toApps(launchPoints);
  if (!apps.length) throw new Error('The TV returned no apps.');
  console.log('Found ' + apps.length + ' apps.');

  step('Build and install', ['This takes about half a minute. Leave the TV on.', '']);
  fs.rmSync(BUILD, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'app'), path.join(BUILD, 'app'), { recursive: true });
  fs.writeFileSync(path.join(BUILD, 'app', 'data', 'apps.js'), 'window.EDISON_APPS = ' + JSON.stringify({ syncedAt: new Date().toISOString(), placeholder: false, apps }, null, 2) + ';\n');
  ares('ares-package', ['--no-minify', '-o', path.join(BUILD, 'dist'), path.join(BUILD, 'app')], { quiet: true });
  const ipk = fs.readdirSync(path.join(BUILD, 'dist')).find((f) => f.endsWith('.ipk'));
  ares('ares-install', ['--device', DEVICE, path.join(BUILD, 'dist', ipk)], { quiet: true });
  ares('ares-launch', ['--device', DEVICE, ID], { quiet: true });

  console.log('\n===== Done. Edison Home is open on your TV. =====\n');
  console.log('What to know now:');
  console.log('  - Find it again: it is in the app bar on your TV.');
  console.log('  - Add a shortcut: with it open, hold a number key on the remote until the TV offers to assign it.');
  console.log('  - Move or hide an app: hold OK on it.');
  console.log('  - Keep it: Developer Mode lasts about 1,000 hours. Open the Developer Mode app and press Extend before then, or the TV removes Edison Home.');
  console.log('  - Looks clean on purpose: some LG extras and games start hidden. Bring any of them back in Settings.');
  console.log('  - Got a new app on your TV? Run this again. Your layout stays.');
}

main().catch(async (e) => {
  console.error('\n' + e.message);
  process.exitCode = 1;
  const report = await checkup().catch(() => '');
  console.error('\nHere is a checkup. It is safe to share.\n\n' + report);
  console.error('\nRun this again and it repairs what it can. INSTALL.md has a fixes list.\n');
  await offerHelper('Type A and press Enter to copy this checkup and a prompt for an AI helper, or just press Enter to close: ', report).catch(() => {});
});
