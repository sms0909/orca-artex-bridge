const path=require('path');
function parseModelFromTail(lines){
 const rows=Array.isArray(lines)?lines:[];
 for(let i=rows.length-1;i>=0;i--){
  const line=String(rows[i]??'').replace(/\u001b\[[0-9;]*m/g,'').trim();
  let m=line.match(/^([a-z][a-z0-9.-]*)\s+(low|medium|high|xhigh|max)\s+.{1}\s/i);
  if(m)return {id:m[1].toLowerCase(),reasoningEffort:m[2].toLowerCase()};
  m=line.match(/\bmodel\b[^a-z0-9.-]*([a-z][a-z0-9.-]*)(?:\s+(low|medium|high|xhigh|max))?/i);
  if(m)return {id:m[1].toLowerCase(),reasoningEffort:(m[2]??'medium').toLowerCase()};
 }
 return null;
}
function chooseCodexTerminal(list,worktreePath){
 const terminals=list?.result?.terminals;
 if(!Array.isArray(terminals))throw new Error('Orca Codex model discovery failed.');
 const expected=path.resolve(worktreePath).toLowerCase();
 const matches=terminals.filter(t=>t.agentIdentity==='codex'&&t.worktreePath&&path.resolve(t.worktreePath).toLowerCase()===expected&&t.connected!==false).sort((a,b)=>(b.lastOutputAt??0)-(a.lastOutputAt??0));
 if(!matches.length)throw new Error('Orca Codex model discovery failed.');
 return matches[0];
}
module.exports={parseModelFromTail,chooseCodexTerminal};