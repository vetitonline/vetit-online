import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { executePostgresSql } from './appointment-postgres-runner.mjs';

test('large SQL uses stdin with bounded arguments and no shell or password prompt', async () => {
  const source = '-- Unicode £ and quotes\n' + 'select 1;\n'.repeat(10000);
  const result = await executePostgresSql(source, { connection:'postgresql://localhost/vetit_disposable_runner', execFileImpl(executable,args,options,callback) {
    assert.equal(executable,'psql'); assert.ok(args.includes('-w'));
    assert.deepEqual(args.slice(-2),['-f','-']); assert.ok(!args.includes(source));
    assert.ok(args.join(' ').length < 1000); assert.equal(options.shell,undefined);
    assert.equal(options.timeout,120000); assert.equal(options.maxBuffer,4*1024*1024);
    const stdin=new EventEmitter(); stdin.end=(received,encoding)=>{assert.equal(received,source);assert.equal(encoding,'utf8');queueMicrotask(()=>callback(null,' 1\n'));};
    return {stdin};
  }});
  assert.equal(result,'1');
});
test('SQL process and stdin failures reject rather than reporting success', async () => {
  for(const pipeFailure of [false,true]) {
    const failure=new Error(pipeFailure?'pipe closed':'SQL failed');
    await assert.rejects(executePostgresSql('select 1;', {connection:'unused',execFileImpl(executable,args,options,callback) {
      const stdin=new EventEmitter();stdin.end=()=>queueMicrotask(()=>pipeFailure?stdin.emit('error',failure):callback(failure,''));return {stdin};
    }}),error=>error===failure);
  }
});
