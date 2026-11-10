import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// Local Astro on port 4321; actual seller API handler over isolated synthetic
// data and identity, external requests blocked. No hosted services are used.
const result=spawnSync(process.execPath,['--test',fileURLToPath(new URL('../tests/seller-order-pagination.browser.test.mjs',import.meta.url))],{env:{...process.env,VETIT_SELLER_PAGINATION_BROWSER_TESTS:'1'},stdio:'inherit'});
if(result.error)console.error(result.error.message);
process.exit(result.status??1);
