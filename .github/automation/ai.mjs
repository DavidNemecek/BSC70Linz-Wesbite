import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { POLICY, PREFLIGHT, RESEARCH, REVIEW, REPAIR, VISUAL } from './prompts.mjs';

// Protocol references checked against official OpenAI documentation:
// https://developers.openai.com/api/reference/resources/responses/streaming-events
// https://developers.openai.com/api/docs/guides/tools-web-search
// https://developers.openai.com/api/docs/guides/images-vision
// https://developers.openai.com/api/docs/guides/structured-outputs

// Node 24 standard library only. No tools are executed locally and no files are read
// or written. AI_BASE_URL is REQUIRED: an API root (e.g. .../v1) or .../responses.
// AI_API_KEY is supplied by the controller's Actions secret; AI_MODEL defaults below.
// Schemas travel in JSON input and are always validated locally. We deliberately
// omit text.format so endpoints without structured-output support work unchanged.
// Optional second argument on every export is trusted configuration for tests/callers:
// {baseURL,apiKey,model,timeoutMs,maxRetries,allowLoopbackForTests}.
// Never derive configuration from PR/repository data. HTTP is permitted only for a
// literal loopback address with allowLoopbackForTests:true (no environment bypass).
const MAX_BODY = 8 * 1024 * 1024;
const MAX_INPUT = 12 * 1024 * 1024;
const MAX_PACKAGES = 100;
const CHUNK_SIZE = 4; // At most 25 calls (75 attempts including retries), sequential.
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = code => Object.assign(new Error(`AI adapter: ${code}`), { code });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = { type: 'string', minLength: 1, maxLength: 12000 };
const finding = { type: 'object', additionalProperties: false,
  required: ['severity', 'message', 'evidence'], properties: {
    severity: { type: 'string', enum: ['info', 'low', 'medium', 'high', 'critical'] },
    message: string, evidence: { type: 'array', minItems: 1, maxItems: 30, items: string },
    path: string,
  } };
const verdict = { type: 'object', additionalProperties: false, required: ['pass', 'findings'],
  properties: { pass: { type: 'boolean' }, findings: { type: 'array', maxItems: 200, items: finding } } };

function config(options) {
  const raw = options.baseURL ?? process.env.AI_BASE_URL;
  const apiKey = options.apiKey ?? process.env.AI_API_KEY;
  const model = options.model ?? process.env.AI_MODEL ?? 'gpt-6.1-sol';
  let url;
  try { url = new URL(raw); } catch { throw fail('INVALID_CONFIG'); }
  const loopback = ['127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(options.allowLoopbackForTests === true && loopback && url.protocol === 'http:')) ||
      url.username || url.password || url.search || url.hash ||
      typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey) ||
      typeof model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(model)) throw fail('INVALID_CONFIG');
  const timeoutMs = Number(options.timeoutMs ?? process.env.AI_TIMEOUT_MS ?? 90000);
  const maxRetries = Number(options.maxRetries ?? process.env.AI_MAX_RETRIES ?? 1);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 120000 ||
      !Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 2) throw fail('INVALID_CONFIG');
  url.pathname = url.pathname.replace(/\/+$/, '');
  if (!url.pathname.endsWith('/responses')) url.pathname += '/responses';
  const secrets = [apiKey, raw, url.href, url.origin, url.host].filter(Boolean).sort((a,b) => b.length-a.length);
  const redact = value => {
    if (typeof value === 'string') {
      for (const secret of secrets) value = value.split(secret).join('[REDACTED]');
      return value.replace(/\b(?:authorization\s*[:=]\s*|bearer\s+)[^\s,;"}]+/gi, '[REDACTED]');
    }
    if (Array.isArray(value)) return value.map(redact);
    if (object(value)) return Object.fromEntries(Object.entries(value).map(([k,v]) => [redact(k), redact(v)]));
    return value;
  };
  return { url, apiKey, model, timeoutMs, maxRetries, redact };
}

// Small, fail-closed JSON Schema subset: unsupported keywords are rejected, never
// silently ignored. No $ref/remote schema fetches. Schemas are trusted caller policy.
const keywords = new Set(['type', 'properties', 'required', 'additionalProperties', 'items',
  'minItems', 'maxItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'enum', 'const', 'description', 'title']);
function checkSchema(schema, depth = 0) {
  if (!object(schema) || depth > 20 || Object.keys(schema).some(k => !keywords.has(k)) ||
      !['object','array','string','number','integer','boolean','null'].includes(schema.type)) throw fail('INVALID_SCHEMA');
  for (const key of ['minItems','maxItems','minLength','maxLength','minimum','maximum']) {
    if (key in schema && (!Number.isFinite(schema[key]) || (key !== 'minimum' && key !== 'maximum' && (!Number.isInteger(schema[key]) || schema[key] < 0)))) throw fail('INVALID_SCHEMA');
  }
  if ('enum' in schema && (!Array.isArray(schema.enum) || !schema.enum.length)) throw fail('INVALID_SCHEMA');
  if (schema.type === 'object') {
    if (!object(schema.properties) || schema.additionalProperties !== false || !Array.isArray(schema.required) ||
      schema.required.some(k => typeof k !== 'string' || !Object.hasOwn(schema.properties, k))) throw fail('INVALID_SCHEMA');
    Object.values(schema.properties).forEach(s => checkSchema(s, depth + 1));
  }
  if (schema.type === 'array') checkSchema(schema.items, depth + 1);
}
function valid(value, schema) {
  const type = schema.type;
  if (type === 'object') {
    if (!object(value) || schema.required.some(k => !Object.hasOwn(value,k)) ||
        Object.keys(value).some(k => !Object.hasOwn(schema.properties,k))) return false;
    if (!Object.entries(value).every(([k,v]) => valid(v,schema.properties[k]))) return false;
  } else if (type === 'array') {
    if (!Array.isArray(value) || !value.every(v => valid(v,schema.items)) ||
        value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)) return false;
  } else if (type === 'null' ? value !== null : type === 'integer' ? !Number.isInteger(value) : typeof value !== type) return false;
  if (typeof value === 'number' && (!Number.isFinite(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) return false;
  if (typeof value === 'string' && (value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity))) return false;
  if (schema.enum && !schema.enum.some(v => JSON.stringify(v) === JSON.stringify(value))) return false;
  if (Object.hasOwn(schema,'const') && JSON.stringify(schema.const) !== JSON.stringify(value)) return false;
  return true;
}

async function readResponse(response) {
  const sse = (response.headers.get('content-type') ?? '').includes('text/event-stream');
  const reader = response.body?.getReader();
  if (!reader) throw fail('EMPTY_RESPONSE');
  const decoder = new TextDecoder();
  let buffer = '', size = 0, terminal;
  const items = new Map();
  function event(frame) {
    const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data.trim() === '[DONE]') return;
    let e;
    try { e = JSON.parse(data); } catch { throw fail('MALFORMED_EVENT'); }
    if (e.type === 'error' || e.type === 'response.failed' || e.type === 'response.incomplete') throw fail('RESPONSE_FAILED');
    if (e.type === 'response.output_item.done') {
      if (!object(e.item) || !Number.isInteger(e.output_index) || e.output_index < 0) throw fail('MALFORMED_EVENT');
      items.set(e.output_index,e.item);
    }
    if (e.type === 'response.completed') {
      if (terminal || !object(e.response)) throw fail('MALFORMED_EVENT');
      terminal = e.response;
    }
  }
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) throw fail('RESPONSE_TOO_LARGE');
      buffer += decoder.decode(value,{stream:true});
      if (sse) {
        // Normalize CRLF only after decoding a full line, including split CR/LF chunks.
        buffer = buffer.replace(/\r\n/g,'\n');
        let end;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          event(buffer.slice(0,end)); buffer = buffer.slice(end+2);
        }
      }
    }
    buffer += decoder.decode();
    if (!sse) {
      try { return JSON.parse(buffer); } catch { throw fail('MALFORMED_RESPONSE'); }
    }
    if (buffer.trim()) event(buffer.replace(/\r\n/g,'\n'));
    if (!terminal) throw fail('INCOMPLETE_STREAM');
    // Some compatible servers send final items separately and omit terminal output.
    if (!terminal.output?.length && items.size) terminal.output = [...items.entries()].sort((a,b)=>a[0]-b[0]).map(([,v])=>v);
    return terminal;
  } finally { await reader.cancel().catch(() => {}); }
}

function sourceURL(value, redact) {
  if (typeof value !== 'string' || value.length > 4096 || redact(value) !== value) return null;
  try {
    const u = new URL(value);
    if (!['https:','http:'].includes(u.protocol) || u.username || u.password) return null;
    return u.href;
  } catch { return null; }
}
function extract(response, cfg, search) {
  if (!object(response) || response.status !== 'completed' || response.error || response.incomplete_details || !Array.isArray(response.output)) throw fail('RESPONSE_NOT_COMPLETED');
  if (response.model && response.model !== cfg.model) throw fail('MODEL_MISMATCH');
  const text = [], searches = [], citations = [], toolCalls = [];
  for (const item of response.output) {
    if (!object(item)) throw fail('MALFORMED_RESPONSE');
    if (item.type === 'message') {
      if (item.role !== 'assistant' || !Array.isArray(item.content)) throw fail('MALFORMED_RESPONSE');
      for (const part of item.content) {
        if (part.type === 'refusal') throw fail('REFUSAL');
        if (part.type !== 'output_text' || typeof part.text !== 'string') throw fail('MALFORMED_RESPONSE');
        text.push(part.text);
        for (const a of part.annotations ?? []) {
          const url = a.type === 'url_citation' && sourceURL(a.url,cfg.redact);
          if (url) citations.push(url);
        }
      }
    } else if (item.type === 'web_search_call') {
      toolCalls.push({type:item.type,status:['completed','failed','incomplete','searching','in_progress'].includes(item.status) ? item.status : 'unknown'});
      if (!search || item.status !== 'completed') throw fail('SEARCH_NOT_COMPLETED');
      if (item.action?.type === 'search') {
        const queries = [...(Array.isArray(item.action.queries) ? item.action.queries : []), ...(typeof item.action.query === 'string' ? [item.action.query] : [])]
          .filter(q => typeof q === 'string' && q.trim()).map(q=>cfg.redact(q));
        const sources = (Array.isArray(item.action.sources) ? item.action.sources : []).map(s=>sourceURL(s.url,cfg.redact)).filter(Boolean);
        if (queries.length && sources.length) searches.push({queries:[...new Set(queries)],sources:[...new Set(sources)]});
      }
    } else if (item.type !== 'reasoning') throw fail('UNEXPECTED_OUTPUT_TOOL');
  }
  if (search && !searches.length) throw fail('SEARCH_PROOF_MISSING');
  return { text: text.join(''), searches, citations:[...new Set(citations)], toolCalls };
}

/** Returns {data,provenance}; throws a static coded error on any transport, search,
 * parsing or schema failure. Provenance is adapter-derived, never model claims.
 * schema uses the fail-closed subset above. images are local base64 data URL strings.
 * No implicit provider/model fallback or response-format changes occur. */
export async function callAI({instructions,input,schema,search=false,images=[]}, options = {}) {
  const cfg = config(options);
  checkSchema(schema);
  if (typeof instructions !== 'string' || !instructions.trim() || typeof search !== 'boolean') throw fail('INVALID_INPUT');
  checkImages(images);
  let inputText;
  try { inputText = JSON.stringify({untrustedInput:input,outputSchema:schema}); }
  catch { throw fail('INVALID_INPUT'); }
  if (input === undefined || Buffer.byteLength(inputText) + images.reduce((n,s)=>n+s.length,0) > MAX_INPUT) throw fail('INPUT_TOO_LARGE');
  const body = { model:cfg.model, reasoning:{effort:'high'}, stream:true, store:false,
    instructions: `${POLICY}\n\n${instructions}`,
    input:[{role:'user',content:[{type:'input_text',text:inputText},...images.map(image_url=>({type:'input_image',image_url,detail:'high'}))]}],
    max_output_tokens:16000,
    ...(search ? {tools:[{type:'web_search',external_web_access:true}],tool_choice:'required',include:['web_search_call.action.sources'],max_tool_calls:12} : {}),
  };
  const started = Date.now();
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(),cfg.timeoutMs);
    let retry = false;
    try {
      let response;
      try {
        response = await fetch(cfg.url,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${cfg.apiKey}`,'Content-Type':'application/json',Accept:'text/event-stream, application/json'},body:JSON.stringify(body),signal:controller.signal});
      } catch (error) {
        const transient = ['ECONNRESET','ECONNREFUSED','EPIPE','ETIMEDOUT','EAI_AGAIN','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT'].includes(error?.cause?.code);
        if (controller.signal.aborted) throw fail('TIMEOUT');
        if (transient && attempt < cfg.maxRetries) { retry = true; } else throw fail('NETWORK_ERROR');
      }
      if (!retry) {
        if (!response.ok) {
          await response.body?.cancel().catch(()=>{});
          if ([408,429,500,502,503,504].includes(response.status) && attempt < cfg.maxRetries) retry = true;
          else throw fail(`HTTP_${response.status}`);
        } else {
          const envelope = await readResponse(response);
          const output = extract(envelope,cfg,search);
          let data;
          try { data = JSON.parse(output.text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i,'$1')); }
          catch { throw fail('MALFORMED_JSON'); }
          data = cfg.redact(data);
          if (!valid(data,schema)) throw fail('SCHEMA_INVALID');
          return {data,provenance:{model:cfg.redact(cfg.model),reasoningEffort:'high',timestamp:new Date().toISOString(),
            durationMs:Date.now()-started,attempts:attempt+1,responseIdHash:typeof envelope.id==='string'?hash(envelope.id):null,
            searches:output.searches,citations:output.citations,toolCalls:output.toolCalls}};
        }
      }
    } catch (error) {
      // Never expose raw fetch/JSON/provider errors, response bodies, URLs or headers.
      if (controller.signal.aborted) throw fail('TIMEOUT');
      if (error?.code && /^AI adapter: [A-Z_0-9]+$/.test(error.message)) throw fail(error.code);
      throw fail('INVALID_RESPONSE');
    } finally { clearTimeout(timer); }
    if (retry) await delay(Math.min(1000,100 * 2 ** attempt));
  }
  throw fail('RETRY_LIMIT');
}

function checkImages(images) {
  if (!Array.isArray(images) || images.length > 12) throw fail('INVALID_IMAGES');
  let size = 0;
  for (const image of images) {
    if (typeof image !== 'string' || image.length > MAX_INPUT || !/^data:image\/(?:png|jpeg|webp);base64,/.test(image)) throw fail('INVALID_IMAGES');
    const encoded = image.slice(image.indexOf(',')+1);
    if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw fail('INVALID_IMAGES');
    const bytes = Buffer.from(encoded,'base64');
    if (bytes.toString('base64')!==encoded) throw fail('INVALID_IMAGES');
    const png = image.startsWith('data:image/png;') && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg = image.startsWith('data:image/jpeg;') && bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
    const webp = image.startsWith('data:image/webp;') && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP';
    size += bytes.length;
    if (!(png || jpeg || webp) || size > 8*1024*1024) throw fail('INVALID_IMAGES');
  }
}
function shas(baseSHA,headSHA) {
  if (![baseSHA,headSHA].every(v=>typeof v==='string' && /^[a-f0-9]{40}$/.test(v))) throw fail('INVALID_SHA');
}
function decision(data) {
  if (!data.pass && !data.findings.length) throw fail('MISSING_FINDINGS');
  return {...data,pass:data.pass && !data.findings.some(f=>['high','critical'].includes(f.severity))};
}
const blocked = (message,evidence) => ({severity:'high',message,evidence});

/** Live GitHub preflight only: requires completed current-date search + real sources.
 * A passing result demonstrates protocol/search support, not package/vision safety. */
export async function preflight(options = {}) {
  const date = new Date().toISOString().slice(0,10);
  const {data,provenance} = await callAI({instructions:PREFLIGHT,input:{date,query:`current UTC date ${date}`},schema:verdict,search:true},options);
  if (!provenance.searches.some(s=>s.queries.some(q=>q.includes(date)))) throw fail('PREFLIGHT_QUERY_MISSING');
  return {...decision(data),timestamp:provenance.timestamp,provenance};
}

function queryMatches(query,{name,version}) {
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp(`(^|[^a-z0-9._/@-])${escape(name)}(?=$|[^a-z0-9._/-])`,'i').test(query) &&
    new RegExp(`(^|[^a-z0-9.+-])${escape(version)}(?=$|[^a-z0-9.+-])`,'i').test(query);
}

function exactVersion(version) {
  if (typeof version!=='string' || version.length>200) return false;
  const match=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(version);
  return Boolean(match && match.slice(1,4).every(v=>Number.isSafeInteger(Number(v))) &&
    (!match[4] || match[4].split('.').every(v=>!/^\d+$/.test(v) || /^(0|[1-9]\d*)$/.test(v))));
}

/** packages: [{name,version}] exact npm semver targets, <=100 unique pairs. Returns
 * {pass,findings,packages,baseSHA,headSHA,timestamp,provenance:[]} or throws; never
 * returns an approval for partial coverage. Independently fetched advisory evidence
 * and deterministic policy checks are the controller's responsibility. */
export async function researchPackages({packages,baseSHA,headSHA}, options = {}) {
  shas(baseSHA,headSHA);
  if (!Array.isArray(packages) || !packages.length || packages.length > MAX_PACKAGES || packages.some(p=>!object(p) || typeof p.name !== 'string' ||
      !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(p.name) || p.name.length > 214 || !exactVersion(p.version))) throw fail('INVALID_PACKAGES');
  const targets = packages.map(({name,version})=>({name,version}));
  if (new Set(targets.map(p=>`${p.name}@${p.version}`)).size !== targets.length) throw fail('INVALID_PACKAGES');
  const entry = {type:'object',additionalProperties:false,required:['name','version','pass','findings','evidence'],properties:{
    name:string,version:string,...verdict.properties,evidence:{type:'array',minItems:1,maxItems:30,items:string}}};
  const schema = {type:'object',additionalProperties:false,required:['packages'],properties:{packages:{type:'array',minItems:1,maxItems:CHUNK_SIZE,items:entry}}};
  const results = [], provenance = [];
  for (let start=0; start<targets.length; start+=CHUNK_SIZE) {
    const chunk = targets.slice(start,start+CHUNK_SIZE);
    const response = await callAI({instructions:RESEARCH,input:{baseSHA,headSHA,packages:chunk},schema,search:true},options);
    provenance.push(response.provenance);
    if (response.data.packages.length !== chunk.length || new Set(response.data.packages.map(p=>`${p.name}@${p.version}`)).size !== chunk.length ||
        response.data.packages.some(p=>!chunk.some(t=>t.name===p.name && t.version===p.version))) throw fail('PARTIAL_RESEARCH');
    for (const target of chunk) {
      const evidence = response.provenance.searches.filter(s=>s.queries.some(q=>queryMatches(q,target)));
      const sources = new Set(evidence.flatMap(s=>s.sources));
      const result = response.data.packages.find(p=>p.name===target.name && p.version===target.version);
      if (!sources.size || result.evidence.some(url=>!sources.has(sourceURL(url,v=>v)))) throw fail('PACKAGE_SEARCH_PROOF_MISSING');
      results.push({...decision(result),searches:evidence});
    }
  }
  const findings = results.flatMap(p=>p.findings);
  const pass = results.every(p=>p.pass);
  if (!pass && !findings.length) findings.push(blocked('Package research blocked approval',['One or more package assessments failed.']));
  return {pass,findings,packages:results,baseSHA,headSHA,timestamp:new Date().toISOString(),provenance};
}

/** Independent, stateless review; context is data, never additional system policy. */
export async function reviewPullRequest({baseSHA,headSHA,diff,context}, options = {}) {
  shas(baseSHA,headSHA);
  if (typeof diff !== 'string' || !diff.trim() || context === undefined) throw fail('INVALID_REVIEW_INPUT');
  const {data,provenance} = await callAI({instructions:REVIEW,input:{baseSHA,headSHA,diff,context},schema:verdict},options);
  return {...decision(data),baseSHA,headSHA,provenance};
}

/** files: [{path,content}]. Returns ONLY [{path,content}], never writes/executes.
 * Parent MUST still authorize each path, reject symlinks and validate repairs. */
export async function proposeRepairs({baseSHA,headSHA,files,findings,validationLog}, options = {}) {
  shas(baseSHA,headSHA);
  const safePath = path => typeof path === 'string' && path.length <= 500 && !path.startsWith('/') &&
    !/[\\\x00-\x1f:]/.test(path) && path.split('/').every(p=>p && p!=='.' && p!=='..' && p!=='.git');
  if (!Array.isArray(files) || !files.length || files.length > 30 || files.some(f=>!object(f) || !safePath(f.path) || typeof f.content!=='string') ||
      new Set(files.map(f=>f.path)).size!==files.length || !Array.isArray(findings) || typeof validationLog!=='string') throw fail('INVALID_REPAIR_INPUT');
  const schema = {type:'array',maxItems:30,items:{type:'object',additionalProperties:false,required:['path','content'],properties:{
    path:{type:'string',enum:files.map(f=>f.path)},content:{type:'string',maxLength:500000}}}};
  const {data} = await callAI({instructions:REPAIR,input:{baseSHA,headSHA,files,findings,validationLog},schema},options);
  if (new Set(data.map(f=>f.path)).size!==data.length) throw fail('DUPLICATE_REPAIR_PATH');
  return data;
}

/** Fresh call with mandatory image data URLs. summary is untrusted; parent supplies
 * screenshots plus deployment identity and independently verifies deployment SHA. */
export async function reviewVisualEvidence({baseSHA,headSHA,deploymentId,summary,images}, options = {}) {
  shas(baseSHA,headSHA);
  checkImages(images);
  if (!images?.length || typeof summary!=='string' || !summary.trim() || !['string','number'].includes(typeof deploymentId) || !String(deploymentId).trim()) throw fail('INVALID_VISUAL_INPUT');
  const schema = {...verdict,required:[...verdict.required,'imageIndexes'],properties:{...verdict.properties,
    imageIndexes:{type:'array',minItems:images.length,maxItems:images.length,items:{type:'integer',minimum:0,maximum:images.length-1}}}};
  const {data,provenance} = await callAI({instructions:VISUAL,input:{baseSHA,headSHA,deploymentId,summary,imageCount:images.length},images,schema},options);
  if (new Set(data.imageIndexes).size!==images.length) throw fail('IMAGES_NOT_REVIEWED');
  return {...decision(data),baseSHA,headSHA,deploymentId,imageHashes:images.map(image=>hash(image)),provenance};
}
