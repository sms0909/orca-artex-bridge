function createQueue(maxConcurrent=1){
 let limit=Math.max(1,Math.floor(maxConcurrent)),running=0,pending=0;
 const waiting=[];
 function pump(){
  while(running<limit&&waiting.length){
   const job=waiting.shift();
   if(job.cancelled)continue;
   job.started=true;running++;
   if(job.signal)job.signal.removeEventListener('abort',job.onAbort);
   Promise.resolve().then(()=>{if(job.signal?.aborted)throw new Error('Request cancelled.');return job.fn();})
    .then(job.resolve,job.reject).finally(()=>{running--;pending--;pump();});
  }
 }
 return {
  get limit(){return limit;},get active(){return running;},get pending(){return pending;},get waiting(){return Math.max(0,pending-running);},
  setLimit(value){if(!Number.isFinite(value)||value<1)throw new Error('Concurrency limit must be a positive number.');limit=Math.floor(value);pump();},
  run(fn,signal){
   pending++;
   return new Promise((resolve,reject)=>{
    const job={fn,signal,resolve,reject,started:false,cancelled:false,onAbort:null};
    job.onAbort=()=>{if(job.started||job.cancelled)return;job.cancelled=true;pending--;reject(new Error('Queued request cancelled.'));};
    if(signal?.aborted){job.cancelled=true;pending--;reject(new Error('Queued request cancelled.'));return;}
    signal?.addEventListener('abort',job.onAbort,{once:true});waiting.push(job);pump();
   });
  }
 };
}
module.exports={createQueue};