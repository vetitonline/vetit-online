import {readFile,stat,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {inflateSync} from 'node:zlib';
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
const crcTable=Array.from({length:256},(_,value)=>{for(let i=0;i<8;i++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
const crc32=bytes=>{let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return(value^0xffffffff)>>>0;};
/** Metadata/encoding validation, not artwork approval or store acceptance. */
export function inspectStoreIconPng(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length>10*1024*1024||!bytes.subarray(0,8).equals(signature))throw Error('Invalid store icon source.');
 let offset=8,width,height,ended=false;const data=[];
 while(offset+12<=bytes.length){const length=bytes.readUInt32BE(offset),end=offset+12+length;if(end>bytes.length)throw Error('Invalid icon chunk.');const type=bytes.toString('ascii',offset+4,offset+8),body=bytes.subarray(offset+8,offset+8+length);if(crc32(bytes.subarray(offset+4,end-4))!==bytes.readUInt32BE(end-4))throw Error('Invalid icon checksum.');
  if(offset===8&&type!=='IHDR')throw Error('Icon header is missing.');
  if(type==='IHDR'){if(width||length!==13)throw Error('Invalid icon header.');width=body.readUInt32BE(0);height=body.readUInt32BE(4);if(width!==height||width<1024||width>4096||body[8]!==8||body[9]!==2||body[10]!==0||body[11]!==0||body[12]!==0)throw Error('Icon must be square, opaque RGB PNG, at least 1024 pixels.');}
  if(type==='tRNS')throw Error('Store icon must not contain transparency.');
  if(type==='IDAT')data.push(body);
  offset=end;if(type==='IEND'){if(length!==0||offset!==bytes.length)throw Error('Invalid icon end.');ended=true;break;}
 }
 if(!width||!ended||!data.length)throw Error('Incomplete icon source.');
 const stride=width*3+1,raw=inflateSync(Buffer.concat(data),{maxOutputLength:stride*height});if(raw.length!==stride*height)throw Error('Invalid icon pixel data.');for(let i=0;i<height;i++)if(raw[i*stride]>4)throw Error('Invalid icon filter.');
 return{format:'png',width,height,opaque:true,storeSubmissionAuthorized:false};
}
export async function assessMobileIcon(manifest,projectRoot){
 try{const icon=manifest?.expo?.icon;if(typeof icon!=='string'||!icon||isAbsolute(icon))throw Error();const root=await realpath(projectRoot),file=await realpath(resolve(root,icon)),path=relative(root,file);if(path==='..'||path.startsWith('..'+sep)||isAbsolute(path))throw Error();const info=await stat(file);if(!info.isFile()||info.size>10*1024*1024)throw Error();return{iconSourceVerified:true,icon:inspectStoreIconPng(await readFile(file))};}catch{return{iconSourceVerified:false,blocker:'STORE_ICON_SOURCE_INVALID_OR_MISSING'};}
}
