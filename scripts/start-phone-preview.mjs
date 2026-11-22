import {fork, spawn} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {existsSync} from 'node:fs';
import {resolveMobileApiBase} from '../src/lib/supabase/test-endpoints.js';

export function phonePreviewPlan(host) {
  if (typeof host !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) throw Error('Supply your computer private Wi-Fi IPv4 address with --host.');
  const origin = `http://${host}:4324`;
  resolveMobileApiBase(origin, origin);
  if (host.startsWith('127.') || new URL(origin).hostname !== host) throw Error('Phones need the computer private LAN address, not localhost.');
  return {origin, env: {EXPO_PUBLIC_VETIT_API_BASE_URL: origin, EXPO_PUBLIC_VETIT_TEST_API_ORIGIN: origin, EXPO_NO_TELEMETRY: '1', REACT_NATIVE_PACKAGER_HOSTNAME: host}, args: ['start', '--lan', '--offline', '--go']};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args[0] !== '--host' || !args[1] || args.slice(2).some(arg => arg !== '--check') || args.length > 3) throw Error('Usage: node scripts/start-phone-preview.mjs --host PRIVATE_WIFI_IP [--check]');
    const plan = phonePreviewPlan(args[1]);
    if (args.includes('--check')) console.log(JSON.stringify(plan, null, 2));
    else {
      const mobile = fileURLToPath(new URL('../mobile/', import.meta.url));
      const cli = fileURLToPath(new URL('../mobile/node_modules/expo/bin/cli', import.meta.url));
      if (!existsSync(cli)) throw Error('Install the pinned mobile dependencies first.');
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
