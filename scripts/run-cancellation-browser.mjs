import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// Local Astro on port 4321; synthetic identity/APIs and blocked external requests.
const result=spawnSync(process.execPath,['--test',fileURLToPath(new URL('../tests/customer-order-cancellation.browser.test.mjs',import.meta.url))],{env:{...process.env,VETIT_CANCEL_BROWSER_TESTS:'1'},stdio:'inherit'});
if(result.error)console.error(result.error.message);
process.exit(result.status??1);
