// Test-only dependency injection around the actual route source. Never imports
// Supabase configuration, credentials, SSR auth, or a hosted client.
import fs from 'node:fs';
import ts from 'typescript';
import * as security from '../src/lib/api/request-security.js';
import * as body from '../src/lib/api/json-body.js';
import * as workflow from '../src/lib/moderation/workflow.js';
export function createModerationRoutes(authenticate){
 const source=fs.readFileSync(new URL('../src/pages/api/moderation.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const modules={
  '../../lib/supabase/api-auth':{authenticateApiRequest:authenticate},
  '../../lib/api/request-security.js':security,
  '../../lib/api/json-body.js':body,
  '../../lib/moderation/workflow.js':workflow,
 };
 const exports={};new Function('require','exports',compiled)(name=>{if(!(name in modules))throw Error('Unexpected route dependency');return modules[name];},exports);
 return exports;
}
export const fixtureId='10000000-0000-4000-8000-000000000001';
export const fixtureDecision={action:'approve',caseId:fixtureId,version:1,requestId:'10000000-0000-4000-8000-000000000002'};
