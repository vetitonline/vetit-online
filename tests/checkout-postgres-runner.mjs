import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const image='postgres@sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994';
/** Always uses the managed local daemon, never a connection URL or inherited context. */
export async function startCheckoutDatabase(){
  const name='vetit-checkout-test-'+randomUUID();
  const environment={...process.env};
  for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete environment[key];
  const docker=(args,input='')=>new Promise((resolve,reject)=>{
    const child=execFile('docker',['--host=unix:///var/run/docker.sock',...args],{env:environment,maxBuffer:4*1024*1024,timeout:120000},(error,stdout,stderr)=>error?reject(new Error(stderr||error.message)):resolve(stdout.trim()));
    child.stdin.on('error',reject);child.stdin.end(input,'utf8');
  });
  await docker(['info','--format','{{.ServerVersion}}']);
  await docker(['run','--detach','--rm','--name',name,'--network=none','--memory=512m','--cpus=2','--tmpfs','/var/lib/postgresql/data:rw,mode=0700',
    '-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=vetit_disposable_checkout',image]);
  const sql=source=>docker(['exec','-i',name,'psql','-X','-q','-t','-A','-U','postgres','-d','vetit_disposable_checkout','-v','ON_ERROR_STOP=1','-f','-'],source);
  let ready=false;
  for(let i=0;i<100;i++){
    try{await sql('select 1;');ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}
  }
  if(!ready){await docker(['stop',name]);throw Error('Isolated PostgreSQL startup failed.');}
  return {sql,name,async stop(){if(!/^vetit-checkout-test-[0-9a-f-]{36}$/.test(name))throw Error('Invalid owned test container.');await docker(['stop',name]);}};
}
