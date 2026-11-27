import {fork, spawn} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {existsSync} from 'node:fs';
import {networkInterfaces} from 'node:os';
import {resolveMobileApiBase} from '../src/lib/supabase/test-endpoints.js';

export function phonePreviewPlan(host, {port = 8081} = {}) {
  if (typeof host !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) throw Error('Supply your computer private Wi-Fi IPv4 address with --host.');
  const origin = `http://${host}:4324`;
  resolveMobileApiBase(origin, origin);
  if (host.startsWith('127.') || new URL(origin).hostname !== host) throw Error('Phones need the computer private LAN address, not localhost.');
  // SDK 57 offline mode already selects LAN; --lan together with --offline is rejected.
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 4324) throw Error('Metro port must be 1024–65535 and different from fixture port 4324.');
  return {origin, env: {EXPO_PUBLIC_VETIT_API_BASE_URL: origin, EXPO_PUBLIC_VETIT_TEST_API_ORIGIN: origin, EXPO_NO_TELEMETRY: '1', REACT_NATIVE_PACKAGER_HOSTNAME: host}, args: ['start', '--offline', '--go', ...(port === 8081 ? [] : ['--port', String(port)])]};
}

export function resolvePhoneHost(host = 'auto', interfaces = networkInterfaces()) {
  if (host !== 'auto') {phonePreviewPlan(host); return host;}
  const candidates = new Map();
  for (const [name, rows] of Object.entries(interfaces)) {
    for (const row of rows ?? []) {
      if (row.internal || !['IPv4', 4].includes(row.family)) continue;
      try {phonePreviewPlan(row.address); candidates.set(row.address, name);} catch { /* Not an eligible private IPv4 address. */ }
    }
  }
  if (candidates.size === 1) return candidates.keys().next().value;
  if (!candidates.size) throw Error('No private IPv4 address found. Connect the laptop and phones to the same private Wi-Fi, then retry.');
  throw Error(`Multiple private adapters found: ${[...candidates].map(([address, name]) => `${name}: ${address}`).join(', ')}. Select the Wi-Fi address with --host ADDRESS; no address was guessed.`);
}

export function parsePhonePreviewArgs(args) {
  const options = {host: 'auto', port: 8081, check: false};
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag)) throw Error('Duplicate preview option.');
    seen.add(flag);
    if (flag === '--check') options.check = true;
    else if (['--host', '--port'].includes(flag) && args[i + 1] && !args[i + 1].startsWith('--')) {
      const value = args[++i];
      if (flag === '--host') options.host = value;
      else {if (!/^\d+$/.test(value)) throw Error('Invalid Metro port.'); options.port = Number(value);}
    } else throw Error('Usage: node scripts/start-phone-preview.mjs [--host auto|PRIVATE_WIFI_IP] [--port PORT] [--check]');
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parsePhonePreviewArgs(process.argv.slice(2));
    const host = resolvePhoneHost(options.host);
    const plan = phonePreviewPlan(host, {port: options.port});
    if (options.check) console.log(JSON.stringify(plan, null, 2));
    else {
      const mobile = fileURLToPath(new URL('../mobile/', import.meta.url));
      const cli = fileURLToPath(new URL('../mobile/node_modules/expo/bin/cli', import.meta.url));
      if (!existsSync(cli)) throw Error('Install the pinned mobile dependencies first.');
      if (!existsSync(new URL('../mobile/index.js', import.meta.url))) throw Error('The Vetit mobile entry is missing. Check your repository folder.');
      console.log(`Starting Vetit Online from ${mobile}\nEntry: mobile/index.js → mobile/App.tsx\nExpected tabs: Home, Shop, Services, Cart, Account. Close any Hello, world! project in Expo Go and scan this terminal’s new QR code.`);
      const fixture = fork(fileURLToPath(new URL('./run-device-preview.mjs', import.meta.url)), ['--lan'], {stdio: ['inherit', 'inherit', 'inherit', 'ipc']});
      let metro;
      let stopping = false;
      const stop = code => {if (stopping) return; stopping = true; clearTimeout(timer); metro?.kill(); fixture.kill(); process.exitCode = code;};
      const timer = setTimeout(() => {console.error('Fixture startup timed out.'); stop(1);}, 10000);
      fixture.once('message', message => {
        if (!message?.ready || stopping) return;
        clearTimeout(timer);
        console.log(`On both phones open ${plan.origin}/__device/health, then scan the Expo Go QR code. Ctrl+C stops this preview.`);
        metro = spawn(process.execPath, [cli, ...plan.args], {cwd: mobile, env: {...process.env, ...plan.env}, stdio: 'inherit'});
        metro.once('error', error => {console.error(error.message); stop(1);});
        metro.once('exit', code => stop(code ?? 1));
      });
      fixture.once('error', error => {console.error(error.message); stop(1);});
      fixture.once('exit', code => {if (!stopping) stop(code || 1);});
      process.once('SIGINT', () => stop(0));
      process.once('SIGTERM', () => stop(0));
    }
  } catch (error) {console.error(error.message); process.exitCode = 1;}
}
