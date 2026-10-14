const fs=require('fs');
async function main(){
 const cfg=JSON.parse(fs.readFileSync(__dirname+'/config.json','utf8'));
 const headers={Authorization:'Bearer '+cfg.gatewayKey,'Content-Type':'application/json'};
 const unauthorized=await fetch('http://127.0.0.1:8792/v1/models');
 const control=await fetch('http://127.0.0.1:8792/orca/status');
 const text=await fetch('http://127.0.0.1:8792/v1/chat/completions',{method:'POST',headers,body:JSON.stringify({model:'codex-default',messages:[{role:'user',content:'한국어로 연결 확인이라고만 답하세요.'}],stream:false})});
 const response=await text.json();if(!text.ok)throw new Error(JSON.stringify(response));
 const tool=await fetch('http://127.0.0.1:8792/v1/chat/completions',{method:'POST',headers,body:JSON.stringify({model:'codex-default',messages:[{role:'user',content:'테스트용 함수 read_asset을 id 1로 호출하세요. 실제 자산에 접근하지 않습니다.'}],tools:[{type:'function',function:{name:'read_asset',description:'가상 읽기 전용 테스트 함수',parameters:{type:'object',properties:{id:{type:'integer'}},required:['id']}}}],tool_choice:'required',stream:true})});
 const sse=await tool.text();
 const chunks=sse.split('\n').filter(l=>l.startsWith('data: ')&&!l.includes('[DONE]')).map(l=>JSON.parse(l.slice(6)));
 const result={unauthorizedModelStatus:unauthorized.status,unauthorizedControlStatus:control.status,text:response.choices?.[0]?.message?.content,usage:response.usage,tool:chunks[0]?.choices?.[0]?.delta?.tool_calls?.[0]?.function,streamDone:sse.includes('data: [DONE]'),streamErrors:chunks.filter(c=>c.error)};
 fs.writeFileSync(__dirname+'/smoke-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 if(result.unauthorizedModelStatus!==401||result.unauthorizedControlStatus!==401||!result.text?.includes('연결 확인')||result.tool?.name!=='read_asset'||!result.streamDone||result.streamErrors.length)process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
