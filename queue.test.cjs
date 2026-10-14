const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createQueue}=require('./queue.cjs');
test('queue runs at most two calls and starts the next queued call when a slot opens',async()=>{
 const q=createQueue(2);let active=0,max=0,started=0;const releases=[];const startedSignals=[];
 const work=()=>q.run(()=>new Promise(resolve=>{active++;started++;max=Math.max(max,active);startedSignals[started-1]?.();releases.push(()=>{active--;resolve();});}));
 const waitStarted=n=>new Promise(resolve=>{if(started>=n)resolve();else startedSignals[n-1]=resolve;});
 const jobs=[work(),work(),work()];await waitStarted(2);assert.equal(active,2);assert.equal(started,2);releases[0]();await waitStarted(3);assert.equal(active,2);releases[1]();releases[2]();await Promise.all(jobs);assert.equal(max,2);assert.equal(q.pending,0);
});
test('turning the limit back to one drains existing calls and serializes new calls',async()=>{
 const q=createQueue(2);let releaseA,releaseB;let started=0;const a=q.run(()=>new Promise(r=>{started++;releaseA=r;}));const b=q.run(()=>new Promise(r=>{started++;releaseB=r;}));await new Promise(r=>setImmediate(r));assert.equal(started,2);q.setLimit(1);let cStarted=false;const c=q.run(()=>{cStarted=true;});releaseA();await a;await new Promise(r=>setImmediate(r));assert.equal(cStarted,false);releaseB();await b;await c;assert.equal(cStarted,true);
});
