import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// Local Astro on port 4321; synthetic cart/auth/quote fixtures, external requests
// blocked by the test. No hosted database, payment or order writes are performed.
const result=spawnSync(process.execPath,['--test',fileURLToPath(new URL('../tests/checkout-cart.browser.test.mjs',import.meta.url))],{env:{...process.env,VETIT_CHECKOUT_CART_BROWSER_TESTS:'1'},stdio:'inherit'});
if(result.error)console.error(result.error.message);
process.exit(result.status??1);
