import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeToBrowserRecovery } from '../src/browserRecovery.ts';

test('Android and iOS can mount and clean up with a non-DOM window',()=>{
  // React Native's global window exists, but addEventListener is undefined.
  const nativeWindow={};
  for(const platform of ['android','ios']) {
    const unsubscribe=subscribeToBrowserRecovery(platform,nativeWindow,()=>{throw new Error('Browser callback on native');});
    assert.doesNotThrow(unsubscribe);
  }
});
test('native recovery never installs DOM listeners even when a shim provides them',()=>{
  const target={addEventListener:()=>{throw new Error('Native must use AppState');},removeEventListener:()=>{throw new Error('Unexpected DOM cleanup');}};
  assert.doesNotThrow(()=>subscribeToBrowserRecovery('android',target,()=>{})());
});
test('web focus/online recovery works and removes listeners on cleanup',()=>{
  const target=new EventTarget();let calls=0;
  const unsubscribe=subscribeToBrowserRecovery('web',target,()=>{calls++;});
  target.dispatchEvent(new Event('focus'));target.dispatchEvent(new Event('online'));
  assert.equal(calls,2);unsubscribe();
  target.dispatchEvent(new Event('focus'));target.dispatchEvent(new Event('online'));
  assert.equal(calls,2);
});
test('server rendering and incomplete browser globals are safe',()=>{
  assert.doesNotThrow(()=>subscribeToBrowserRecovery('web',undefined,()=>{})());
  assert.doesNotThrow(()=>subscribeToBrowserRecovery('web',{},()=>{})());
  assert.doesNotThrow(()=>subscribeToBrowserRecovery('web',{addEventListener:()=>{throw new Error('No cleanup available');}},()=>{})());
});
