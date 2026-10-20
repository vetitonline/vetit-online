// Resolve existing local typings; never install packages or read environment files.
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root=fileURLToPath(new URL('../',import.meta.url));
const roots=[path.join(root,'node_modules/@types'),path.join(process.env.USERPROFILE??'','.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@types')];
const typeRoot=roots.find(dir=>existsSync(path.join(dir,'node/package.json')));
const allowed=['src/pages/api/moderation-session.ts','src/pages/api/seller/business.ts','src/pages/api/seller/product.ts','src/pages/api/seller/catalogue.ts','src/pages/api/seller/image-reservation.ts'];
const requested=process.argv.slice(2),targets=requested.length?requested:[allowed[0]];
if(targets.some(file=>!allowed.includes(file))){console.error('Only explicit local moderation/seller API targets are supported.');process.exitCode=1;}
else if(!typeRoot){console.error('Existing Node typings not found; no installation attempted.');process.exitCode=1;}
else{
 // In-process compiler avoids the same restricted child-process boundary that
 // blocks browser launch. No shell, process workaround or config rewrite.
 const program=ts.createProgram([path.join(root,'node_modules/astro/client.d.ts'),...targets.map(file=>path.join(root,file))],{noEmit:true,strict:true,moduleResolution:ts.ModuleResolutionKind.Bundler,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,lib:['lib.es2022.d.ts','lib.dom.d.ts'],skipLibCheck:true,allowJs:true,checkJs:false,typeRoots:[typeRoot],types:['node']});
 const diagnostics=ts.getPreEmitDiagnostics(program);
 if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:file=>file,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));process.exitCode=1;}
 else console.log('Focused API TypeScript passed using existing Node typings: '+targets.join(', '));
}
