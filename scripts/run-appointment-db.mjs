import {startCheckoutDatabase} from '../tests/checkout-postgres-runner.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
// Reuse the pinned, network-isolated local PostgreSQL runner. No hosted URL.
let db,directory;
try {
 db=await startCheckoutDatabase();
 await db.sql('create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;');
 directory=await mkdtemp(join(tmpdir(),'vetit-appointment-db-'));
 const shim=join(directory,'psql.mjs');
 await writeFile(shim,`#!/usr/bin/env node\nimport {spawnSync} from 'node:child_process';\nconst result=spawnSync('docker',['--host=unix:///var/run/docker.sock','exec','-i',${JSON.stringify(db.name)},'psql','-X','-q','-t','-A','-U','postgres','-d','vetit_disposable_checkout','-v','ON_ERROR_STOP=1','-f','-'],{stdio:'inherit'});\nprocess.exit(result.status??1);\n`,{mode:0o700});
 const status=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--test','tests/appointment-lifecycle.postgres.test.mjs'],{stdio:'inherit',env:{...process.env,VETIT_APPOINTMENT_DB_TESTS:'1',VETIT_APPOINTMENT_FULL_MARKETPLACE_TESTS:'1',VETIT_APPOINTMENT_TEST_DATABASE_URL:'postgresql://localhost/vetit_disposable_checkout',VETIT_TEST_PSQL:shim}});
  child.on('error',reject);child.on('exit',code=>resolve(code??1));
 });
 process.exitCode=status;
} finally {if(db)await db.stop();if(directory)await rm(directory,{recursive:true,force:true});}
