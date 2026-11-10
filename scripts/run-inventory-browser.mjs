import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// Local Astro server required. Identity and APIs use isolated synthetic fixtures;
// all external browser traffic is blocked by the test.
const result=spawnSync(process.execPath,['--test',fileURLToPath(new URL('../tests/seller-inventory.browser.test.mjs',import.meta.url))],{env:{...process.env,VETIT_INVENTORY_BROWSER_TESTS:'1'},stdio:'inherit'});
if(result.error)console.error(result.error.message);
process.exit(result.status??1);
