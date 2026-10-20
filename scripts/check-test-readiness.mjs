import {readFile} from 'node:fs/promises';
import {PUBLIC_TEST_KEYS, publicTestSettings, assessTestReadiness} from '../src/lib/supabase/local-test-readiness.js';
const root = new URL('../',import.meta.url);
async function load(directory) {
  const settings = {}, files = [];
  for (const name of ['.env','.env.local','.env.development','.env.development.local']) {
    try { Object.assign(settings,publicTestSettings(await readFile(new URL(directory+name,root),'utf8'))); files.push(directory+name); }
    catch(error) { if(error.code!=='ENOENT') throw new Error('Local configuration file cannot be read; no contents disclosed.'); }
  }
  for(const key of PUBLIC_TEST_KEYS) if(process.env[key]!==undefined) settings[key]=process.env[key];
  return {settings,files};
}
try {
  const web=await load(''),mobile=await load('mobile/');
  const result={...assessTestReadiness(web.settings,mobile.settings),inspectedFiles:[...web.files,...mobile.files],credentialValuesPrinted:false,networkRequests:0};
  console.log(JSON.stringify(result,null,2));
  process.exitCode=result.configurationReady?0:2;
} catch { console.error('Local Test readiness inspection failed. No configuration contents disclosed.'); process.exitCode=1; }
