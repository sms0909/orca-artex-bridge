const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const {spawn}=require('child_process');
const {prepare,completion}=require('./core.cjs');
const {resolveAccount}=require('./account.cjs');
const {parseModelFromTail,chooseCodexTerminal}=require('./model.cjs');
const {execFileSync}=require('child_process');
const root=__dirname,config=JSON.parse(fs.readFileSync(path.join(__dirname,'config.json'),'utf8'));
if(!/^[a-f0-9]{64}$/i.test(config.gatewayKey??''))throw new Error('config.gatewayKey must be a unique 64-character hex key. Generate one locally before starting the bridge.');
const queue=require('./queue.cjs').createQueue(config.maxConcurrentCalls??2);
const origins=new Set(['http://localhost:8790','http://127.0.0.1:8790','http://localhost:8792','http://127.0.0.1:8792']);
let completed=0,failed=0,lastError=null,lastModelCheck=null;
function send(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
function equal(a,b){const x=Buffer.from(a??''),y=Buffer.from(b??'');return x.length===y.length&&crypto.timingSafeEqual(x,y);}
async function read(req){let size=0,parts=[];for await(const c of req){size+=c.length;if(size>5*1024*1024)throw new Error('요청이 5 MiB를 초과했습니다.');parts.push(c);}return JSON.parse(Buffer.concat(parts).toString()||'{}');}
async function backend(req,route,method='GET',body){const r=await fetch('http://127.0.0.1:8787/api'+route,{method,headers:{Authorization:req.headers.authorization??'','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const data=await r.json();if(!r.ok){const e=new Error(data.error??'ARTEX 요청이 거부됐습니다.');e.status=r.status;throw e;}return data;}
async function authorize(req){if(!req.headers.authorization?.startsWith('Bearer ')){const e=new Error('기존 ARTEX 계정으로 로그인하세요.');e.status=401;throw e;}await backend(req,'/tasks');}
function detectOrcaModel(){
 const worktree=config.orcaWorktreePath??path.dirname(root);
 const list=JSON.parse(execFileSync(config.orca,['terminal','list','--json'],{encoding:'utf8',timeout:10000,windowsHide:true}));
 const terminal=chooseCodexTerminal(list,worktree);
 const output=JSON.parse(execFileSync(config.orca,['terminal','read','--terminal',terminal.handle,'--json'],{encoding:'utf8',timeout:10000,windowsHide:true}));
 const model=parseModelFromTail(output?.result?.terminal?.tail);
 if(!model)throw new Error('Orca ?? ???? ?? ??? ?? ??? ???? ?????.');
 return {...model,terminal:terminal.handle,accountId:resolveAccount(config).id};
}
async function runCodex(prompt,schema,model,selectedAccount,signal){
 const dir=fs.mkdtempSync(path.join(root,'sandbox','request-'));
 try{
  fs.writeFileSync(path.join(dir,'schema.json'),JSON.stringify(schema));
  const args=['exec','--ignore-user-config','--ignore-rules','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--disable','shell_tool','--disable','unified_exec','--disable','apps','--disable','multi_agent','-m',model.id,'-c',`model_reasoning_effort="${model.reasoningEffort}"`, '-c','web_search="disabled"','-C',dir,'--output-schema',path.join(dir,'schema.json'),'--json','-'];
  const childEnv={...process.env,CODEX_HOME:selectedAccount.home};
  delete childEnv.OPENAI_API_KEY;delete childEnv.CODEX_API_KEY;delete childEnv.CODEX_ACCESS_TOKEN;
  const child=spawn(config.codex,args,{cwd:dir,env:childEnv,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let stdout='',last='',usage={},unexpected=false;
  const terminate=()=>{if(!child.killed)child.kill();};signal.addEventListener('abort',terminate,{once:true});
  const timeout=setTimeout(terminate,config.timeoutMs??120000);
  child.stdout.on('data',c=>{stdout+=c.toString();if(stdout.length>8*1024*1024)terminate();});child.stderr.on('data',()=>{});child.stdin.end(prompt);
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);}).finally(()=>{clearTimeout(timeout);signal.removeEventListener('abort',terminate);});
  for(const line of stdout.split('\n')){let e;try{e=JSON.parse(line);}catch{continue;}if(e.type==='item.completed'&&e.item?.type==='agent_message')last=e.item.text;if(e.type==='turn.completed')usage=e.usage??{};if(e.type==='item.completed'&&['command_execution','mcp_tool_call'].includes(e.item?.type))unexpected=true;}
  if(signal.aborted)throw new Error('Codex ??? ??????.');
  if(code!==0||!last||unexpected)throw new Error('??? Orca ??? Codex ??? ??????. ?? ?? ??? ??? ??? ?????.');
  return {value:JSON.parse(last),usage};
 }finally{const safeRoot=path.resolve(root,'sandbox')+path.sep;if(!path.resolve(dir).startsWith(safeRoot))throw new Error('?? ??? ?? ?? ????.');fs.rmSync(dir,{recursive:true,force:true});}
}
async function infer(body,signal){
 const input=prepare(body);
 try{
  const model=detectOrcaModel(),account=resolveAccount(config);
  const response=await runCodex(input.prompt,input.schema,model,account,signal);
  lastModelCheck={id:model.id,reasoningEffort:model.reasoningEffort,verified:true,checkedAt:new Date().toISOString(),accountId:account.id};
  const result=completion(response.value,body,response.usage);completed++;lastError=null;return result;
 }catch(e){failed++;lastError='AI request or model verification failed.';throw e;}
}

const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/health')return send(res,200,{ok:true,service:'orca-artex-bridge'});
  if(req.method==='GET'&&(url.pathname==='/orca/'||url.pathname==='/orca')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'"});return res.end(fs.readFileSync(path.join(root,'index.html')));}
  if(url.pathname.startsWith('/orca/')&&req.method!=='GET'&&req.headers.origin&&!origins.has(req.headers.origin))return send(res,403,{error:'허용되지 않은 출처입니다.'});
  if(req.method==='POST'&&url.pathname==='/orca/login'){const b=await read(req);return send(res,200,await backend(req,'/auth/login','POST',{username:'ARTEX',password:b.password}));}
  if(url.pathname.startsWith('/orca/')){
   await authorize(req);
   if(req.method==='GET'&&url.pathname==='/orca/status')return send(res,200,{ok:true,provider:'Orca Codex',accountId:resolveAccount(config).id,accountMode:'follow-orca-active',active:queue.active>0,activeCalls:queue.active,queuedCalls:queue.waiting,maxConcurrentCalls:queue.limit,completed,failed,lastError,model:'codex-default',modelCheck:lastModelCheck});
   if(req.method==='GET'&&url.pathname==='/orca/tasks')return send(res,200,await backend(req,'/tasks'));
   if(req.method==='GET'&&url.pathname==='/orca/findings')return send(res,200,await backend(req,'/exploration/findings'));
   if(req.method==='POST'&&url.pathname==='/orca/pause'){const b=await read(req);if(!/^\d+$/.test(String(b.id)))return send(res,400,{error:'올바른 작업 ID가 필요합니다.'});return send(res,200,await backend(req,`/tasks/${b.id}/control`,'POST',{action:'pause'}));}
   if(req.method==='POST'&&url.pathname==='/orca/configure'){
    const model=detectOrcaModel(),account=resolveAccount(config),controller=new AbortController();
    const probeSchema={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};
    const probe=await queue.run(()=>runCodex('Return exactly {"ok":true}. Do not call tools.',probeSchema,model,account,controller.signal),controller.signal);
    if(probe.value?.ok!==true)throw new Error('??? Orca ??? ?? ??? ??????.');
    lastModelCheck={id:model.id,reasoningEffort:model.reasoningEffort,verified:true,checkedAt:new Date().toISOString(),accountId:account.id};
    const profiles=await backend(req,'/llm/profiles');const current=(profiles.profiles??[]).find(p=>p.name==='Orca Codex bridge');
    const saved=await backend(req,'/llm/profiles','POST',{id:current?.id??0,name:'Orca Codex bridge',format:'openai',model:'codex-default',base_url:'http://host.docker.internal:8792/v1',api_key:config.gatewayKey,streaming:true,context_window_k:64,rate_per_second:1,rate_per_minute:6,priority:0,pool_exclude:true});
    await backend(req,'/llm/profiles/active','POST',{id:saved.id});return send(res,200,{ok:true,id:saved.id,modelCheck:lastModelCheck,message:'Orca Codex 연결이 활성화됐습니다.'});
   }
   return send(res,404,{error:'지원하지 않는 제어 작업입니다.'});
  }
  if(!equal(req.headers.authorization,'Bearer '+config.gatewayKey))return send(res,401,{error:{message:'연결 키가 올바르지 않습니다.',type:'authentication_error'}});
  if(req.method==='GET'&&url.pathname==='/v1/models')return send(res,200,{object:'list',data:[{id:'codex-default',object:'model',owned_by:'local-codex'}]});
  if(req.method==='POST'&&url.pathname==='/v1/chat/completions'){
   const b=await read(req),controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
   try{prepare(b);}catch(e){return send(res,400,{error:{message:e.message,type:'invalid_request_error'}});}
   if(b.model&&b.model!=='codex-default')return send(res,400,{error:{message:'이 연결의 모델 이름은 codex-default입니다.',type:'invalid_request_error'}});
   let heartbeat;
   if(b.stream){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});heartbeat=setInterval(()=>res.write(': waiting\n\n'),10000);}
   try{const result=await queue.run(()=>infer(b,controller.signal),controller.signal);if(!b.stream)return send(res,200,result);
    const base={id:result.id,object:'chat.completion.chunk',created:result.created,model:result.model};
    const msg=result.choices[0].message;
    res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta:{role:'assistant',...(msg.content?{content:msg.content}:{}),...(msg.tool_calls?{tool_calls:msg.tool_calls.map((t,index)=>({...t,index}))}:{})},finish_reason:null}]})+'\n\n');
    res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:result.choices[0].finish_reason}],usage:result.usage})+'\n\n');res.end('data: [DONE]\n\n');
   }catch(e){if(b.stream){res.write('data: '+JSON.stringify({error:{message:e.message,type:'bridge_error'}})+'\n\n');res.end('data: [DONE]\n\n');}else throw e;}finally{clearInterval(heartbeat);}return;
  }
  return send(res,404,{error:'경로를 찾을 수 없습니다.'});
 }catch(e){if(!res.headersSent)send(res,e.status??502,{error:{message:e.message,type:'bridge_error'}});else res.end();}
});
server.listen(config.port??8792,'127.0.0.1',()=>console.log('Orca ARTEX bridge: http://127.0.0.1:8792 (loopback only)'));
