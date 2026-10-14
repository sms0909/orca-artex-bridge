const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseModelFromTail,chooseCodexTerminal}=require('./model.cjs');
test('parses model and reasoning effort from Orca Codex footer',()=>{assert.deepEqual(parseModelFromTail(['plain','GPT-6-Luna medium | C:\\codex | task']),{id:'gpt-6-luna',reasoningEffort:'medium'});});
test('parses Orca model command output',()=>{assert.deepEqual(parseModelFromTail(['model: gpt-6.1-sol']),{id:'gpt-6.1-sol',reasoningEffort:'medium'});});
test('selects only the latest Codex terminal in the matching worktree',()=>{const t=chooseCodexTerminal({result:{terminals:[{handle:'wrong',agentIdentity:'codex',worktreePath:'C:/elsewhere',lastOutputAt:99},{handle:'right',agentIdentity:'codex',worktreePath:'C:/codex',lastOutputAt:10}]}},'C:/codex');assert.equal(t.handle,'right');});
