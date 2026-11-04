'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');

const VERSION = 'research-v2';
const MAX_ROUNDS = 2;
const MAX_CALLS = 8;
const MAX_RETRIES = 1;

// The deadline covers fetch AND response decoding, even for a transport that ignores abort.
function withSignal(work, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, {once:true});
    Promise.resolve().then(work).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function createRun(kind, onTrace) {
  const started = Date.now();
  const trace = {version:VERSION, traceId:randomUUID(), kind, startedAt:new Date(started).toISOString(),
    attempts:0, toolCalls:0, retries:0, tokens:{prompt:0, completion:0, total:0}, steps:[]};
  return {
    trace,
    finish(outcome, reason) {
      const result = {...trace, outcome, reason, elapsedMs:Date.now()-started};
      // Observability must never interrupt a usable result; the record contains no request text.
      try { onTrace?.(JSON.parse(JSON.stringify(result))); } catch { console.warn('AI harness: trace recording failed'); }
      const {steps, kind:unusedKind, startedAt, tokens, ...metadata} = result;
      return {...metadata, repaired:outcome==='ready' && trace.attempts>1, validationPassed:outcome==='ready',
        serviceUnavailable:outcome==='empty' && /^(timeout|network_error|service_error|upstream_(429|5\d\d))$/.test(reason)};
    }
  };
}

// Explicit allowlist: no prompts, keys, URLs, store fields, coordinates or user input on disk.
function safeTrace(value) {
  const count = n => Number.isFinite(n) && n>=0 ? Math.min(Math.floor(n),1e12) : 0;
  const code = s => typeof s==='string' && /^[a-zA-Z0-9_-]{1,80}$/.test(s) ? s : 'unknown';
  return {
    version:code(value.version), traceId:code(value.traceId), kind:code(value.kind),
    startedAt:Number.isFinite(Date.parse(value.startedAt)) ? new Date(value.startedAt).toISOString() : '',
    outcome:['ready','empty','error'].includes(value.outcome) ? value.outcome : 'error', reason:code(value.reason),
    attempts:count(value.attempts), toolCalls:count(value.toolCalls), retries:count(value.retries), elapsedMs:count(value.elapsedMs),
    tokens:{prompt:count(value.tokens?.prompt), completion:count(value.tokens?.completion), total:count(value.tokens?.total)},
    steps:(Array.isArray(value.steps)?value.steps:[]).slice(0,32).filter(s=>s&&typeof s==='object').map(s=>({
      stage:code(s.stage), round:count(s.round), status:code(s.status), reason:code(s.reason), elapsedMs:count(s.elapsedMs)
    }))
  };
}

function createTraceStore(file, limit=200) {
  let records;
  function read() {
    if (!records) {
      try {
        const data=JSON.parse(fs.readFileSync(file,'utf8'));
        if(!Array.isArray(data))throw new Error('Invalid AI trace file');
        records=data.filter(v=>v&&typeof v==='object').slice(-limit).map(safeTrace);
      } catch(error) { if(error.code!=='ENOENT')throw error; records=[]; }
    }
    return records;
  }
  return {
    record(trace) {
      const next=[...read(),safeTrace(trace)].slice(-limit);
      fs.mkdirSync(path.dirname(file),{recursive:true});
      const temp=file+'.tmp';
      fs.writeFileSync(temp,JSON.stringify(next,null,2)+'\n','utf8');
      fs.renameSync(temp,file);
      records=next;
    },
    list:()=>read().map(record=>JSON.parse(JSON.stringify(record)))
  };
}

function summarizeTraces(records) {
  const traces=records.filter(v=>v&&typeof v==='object').map(safeTrace), total=traces.length;
  const counts={ready:0,empty:0,error:0}, reasons={};
  let repaired=0, repairAttempts=0, calls=0, elapsed=0, retries=0;
  const tokens={prompt:0,completion:0,total:0};
  for(const t of traces) {
    counts[t.outcome]++; calls+=t.toolCalls; elapsed+=t.elapsedMs; retries+=t.retries;
    if(t.attempts>1){repairAttempts++;if(t.outcome==='ready')repaired++;}
    if(t.outcome!=='ready')reasons[t.reason]=(reasons[t.reason]||0)+1;
    for(const key of Object.keys(tokens))tokens[key]+=t.tokens[key];
  }
  return {runs:total, outcomes:counts, readyRate:total?counts.ready/total:0, repairAttempts, repaired,
    repairSuccessRate:repairAttempts?repaired/repairAttempts:0, retries,
    averageToolCalls:total?calls/total:0, averageElapsedMs:total?Math.round(elapsed/total):0, tokens, failureReasons:reasons};
}

module.exports={VERSION,MAX_ROUNDS,MAX_CALLS,MAX_RETRIES,withSignal,createRun,createTraceStore,summarizeTraces};
