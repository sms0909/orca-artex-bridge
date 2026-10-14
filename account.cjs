const path=require('path'),fs=require('fs');
const {execFileSync}=require('child_process');
function selectAccount(payload,base){
 const info=payload?.result?.codex;
 const id=info?.activeAccountIdsByRuntime?.host??info?.activeAccountId;
 if(!id||!/^[a-f0-9-]{36}$/i.test(id))throw new Error('Orca의 활성 Codex 계정을 확인할 수 없습니다. 이전 계정으로 대체하지 않습니다.');
 const account=info.accounts?.find(a=>a.id===id);
 if(!account||account.managedHomeRuntime!=='host')throw new Error('활성 계정이 로컬 Codex 계정이 아닙니다.');
 const expandedBase=String(base).replace(/%([^%]+)%/g,(_,name)=>process.env[name]??`%${name}%`);
 return {id,home:path.join(expandedBase,id,'home')};
}
function resolveAccount(config){
 const output=execFileSync(config.orca,['account','list','--json'],{encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:4*1024*1024});
 const account=selectAccount(JSON.parse(output),config.accountRoot);
 if(!fs.existsSync(account.home))throw new Error('활성 Codex 계정 폴더를 찾을 수 없습니다.');
 return account;
}
module.exports={selectAccount,resolveAccount};
