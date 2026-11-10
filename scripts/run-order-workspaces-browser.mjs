import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// Requires local Astro on port 4321; synthetic API/auth fixtures, no hosted writes.
const result=spawnSync(process.execPath,['--test',fileURLToPath(new URL('../tests/marketplace-order-workspaces.browser.test.mjs',import.meta.url))],{env:{...process.env,VETIT_ORDER_WORKSPACE_BROWSER_TESTS:'1'},stdio:'inherit'});
if(result.error)console.error(result.error.message);
process.exit(result.status??1);
