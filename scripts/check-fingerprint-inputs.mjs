import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
/** Conservative policy for this project's ignore file. Never invokes minimatch. */
export function assessFingerprintInputs(text,{dynamicConfigPresent=false}={}){
 if(typeof text!=='string'||text.length>32768)throw Error('Fingerprint input exceeds inspection budget.');
 const patterns=text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'));
 const blockers=[];if(patterns.length>128)blockers.push('PATTERN_COUNT_BUDGET_EXCEEDED');
 for(const pattern of patterns){const segments=pattern.split('/');if(pattern.length>256||! /^[A-Za-z0-9_.*\/-]+$/.test(pattern)||pattern.startsWith('/')||segments.includes('..')||segments.length>16||segments.some(segment=>segment!=='**'&&(segment.match(/\*/g)?.length??0)>1)){blockers.push('COMPLEX_OR_UNTRUSTED_PROJECT_PATTERN_REVIEW_REQUIRED');break;}}
 if(dynamicConfigPresent)blockers.push('DYNAMIC_FINGERPRINT_CONFIG_REVIEW_REQUIRED');
 return{projectPatternCount:patterns.length,projectInputsWithinPolicy:blockers.length===0,blockers,dependencyPatched:false,allFingerprintInputsVerified:false,advisoryResolved:false,upgradeAuthorized:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const root=fileURLToPath(new URL('../mobile/',import.meta.url));let dynamicConfigPresent=false;for(const name of ['fingerprint.config.js','fingerprint.config.cjs','fingerprint.config.mjs','fingerprint.config.json']){try{await stat(join(root,name));dynamicConfigPresent=true;}catch(error){if(error.code!=='ENOENT')throw error;}}
 const report=assessFingerprintInputs(await readFile(join(root,'.fingerprintignore'),'utf8'),{dynamicConfigPresent});process.stdout.write(JSON.stringify(report,null,2)+'\n');process.exitCode=report.projectInputsWithinPolicy?0:2;
}
