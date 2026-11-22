import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
/** Presence evidence from supplied source maps, never an advisory waiver. */
export function assessFingerprintBundle(maps){
 if(!Array.isArray(maps)||!maps.length)throw Error('Source maps are required.');
 let sources=0;const found=new Set();
 const walk=(map,depth=0)=>{if(!map||typeof map!=='object'||depth>20)throw Error('Invalid source map.');if(Array.isArray(map.sections)){for(const section of map.sections)walk(section.map,depth+1);return;}if(!Array.isArray(map.sources)||!map.sources.every(value=>typeof value==='string'))throw Error('Invalid source map sources.');for(const item of map.sources){if(++sources>100000)throw Error('Source map limit exceeded.');const path='/'+item.replaceAll('\\','/');for(const name of ['@expo/fingerprint','minimatch'])if(path.includes('/node_modules/'+name+'/'))found.add(name);}};
 maps.forEach(map=>walk(map));return{sourceMapsInspected:maps.length,sourcesInspected:sources,packagesFound:[...found].sort(),notFoundInProvidedMaps:['@expo/fingerprint','minimatch'].filter(name=>!found.has(name)),advisoryResolved:false,allRuntimeReachabilityVerified:false,upgradeAuthorized:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const files=process.argv.slice(2);const maps=await Promise.all(files.map(file=>readFile(file,'utf8').then(JSON.parse)));process.stdout.write(JSON.stringify(assessFingerprintBundle(maps),null,2)+'\n');}
