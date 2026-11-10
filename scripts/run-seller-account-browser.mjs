import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// Local Astro on port 4321; rendered form fixture, actual browser guard module,
// synthetic identity and blocked external requests. No hosted API or database.
const result=spawnSync(process.execPath,['--test',fileURLToPath(new URL('../tests/seller-account-isolation.browser.test.mjs',import.meta.url))],{env:{...process.env,VETIT_SELLER_ACCOUNT_BROWSER_TESTS:'1'},stdio:'inherit'});
if(result.error)console.error(result.error.message);
process.exit(result.status??1);
