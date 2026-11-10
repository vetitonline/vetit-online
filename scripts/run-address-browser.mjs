import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// Requires the local development server; APIs and identity are intercepted using
// synthetic fixtures. External requests are blocked in the isolated test browser.
const result=spawnSync(process.execPath,['--test',fileURLToPath(new URL('../tests/address-book.browser.test.mjs',import.meta.url))],{env:{...process.env,VETIT_ADDRESS_BROWSER_TESTS:'1'},stdio:'inherit'});
if(result.error)console.error(result.error.message);
process.exit(result.status??1);
