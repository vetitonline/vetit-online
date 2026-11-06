import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// Explicit target creates only a unique, network-isolated local Docker database.
// No hosted connection URL, migration push or arbitrary SQL destination is accepted.
const result=spawnSync(process.execPath,['--test',fileURLToPath(new URL('../tests/atomic-checkout.postgres.test.mjs',import.meta.url))],{
  env:{...process.env,VETIT_CHECKOUT_DB_TESTS:'1'},stdio:'inherit',
});
if(result.error)console.error(result.error.message);
process.exit(result.status??1);
