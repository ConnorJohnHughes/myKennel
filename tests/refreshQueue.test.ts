import test from 'node:test';
import assert from 'node:assert/strict';
import { createRefreshQueue } from '../src/refreshQueue.ts';
function deferred<T>() {
  let resolve!:(value:T)=>void;
  let reject!:(error:Error)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
test('overlapping realtime events serialize and reload after the current request',async()=>{
  const first=deferred<number>();const second=deferred<number>();
  let calls=0;const seen:number[]=[];
  const queue=createRefreshQueue(()=>++calls===1?first.promise:second.promise,value=>seen.push(value),()=>{});
  const initial=queue.refresh();queue.refresh();queue.refresh();
  assert.equal(calls,1);
  first.resolve(1);await Promise.resolve();await Promise.resolve();
  assert.equal(calls,2);second.resolve(2);await initial;
  assert.deepEqual(seen,[1,2]);queue.dispose();
});
test('closing a session ignores late responses and stops subsequent refreshes',async()=>{
  const response=deferred<number>();const seen:number[]=[];let calls=0;
  const queue=createRefreshQueue(()=>{calls++;return response.promise;},value=>seen.push(value),()=>{});
  const request=queue.refresh();queue.dispose();response.resolve(42);await request;await queue.refresh();
  assert.deepEqual(seen,[]);assert.equal(calls,1);
});
test('a failed refresh reports the error and can recover on reconnect',async()=>{
  const seen:number[]=[];const errors:unknown[]=[];let calls=0;
  const queue=createRefreshQueue(async()=>{if(++calls===1)throw new Error('offline');return 2;},value=>seen.push(value),e=>errors.push(e));
  await assert.rejects(queue.refresh(),/offline/);await queue.refresh();
  assert.equal(errors.length,1);assert.deepEqual(seen,[2]);queue.dispose();
});
