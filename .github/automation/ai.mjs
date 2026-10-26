import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { POLICY, PREFLIGHT, RESEARCH, RESEARCH_CITATIONS, REVIEW, REPAIR, VISUAL } from './prompts.mjs';

// Protocol references checked against official OpenAI documentation:
// https://developers.openai.com/api/reference/resources/responses/streaming-events
// https://developers.openai.com/api/docs/guides/tools-web-search
// https://developers.openai.com/api/docs/guides/images-vision
// https://developers.openai.com/api/docs/guides/structured-outputs

// Node 24 standard library only. No tools are executed locally and no files are read
// or written. AI_BASE_URL is REQUIRED: an API root (e.g. .../v1) or .../responses.
// AI_API_KEY is supplied by the controller's Actions secret; AI_MODEL defaults below.
// Schemas travel in JSON input and are always validated locally. We deliberately
// omit text.format except for the bounded, strict research citation correction.
// Optional second argument on every export is trusted configuration for tests/callers:
// {baseURL,apiKey,model,timeoutMs,maxRetries,allowLoopbackForTests}.
// Never derive configuration from PR/repository data. HTTP is permitted only for a
// literal loopback address with allowLoopbackForTests:true (no environment bypass).
const MAX_BODY = 8 * 1024 * 1024;
const MAX_INPUT = 12 * 1024 * 1024;
const MAX_PACKAGES = 100;
const CHUNK_SIZE = 4; // Research: at most 25 chunks, two HTTP calls each, sequential.
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
const scannerProperties = {
  scannerURL:string, scannerStatus:string, scannerFinding:string,
  severity:finding.properties.severity, matchedToken:string, artifactSHA256:string,
  upstreamURL:string, upstreamVersion:string, protectiveToken:string, protectiveCode:string,
  classification:{type:'string',enum:['protective-denylist','unresolved','credential-read-or-exfiltration']},
  credentialReadEvidence:{type:'string',enum:['absent','present','unknown']},
  exfiltrationEvidence:{type:'string',enum:['absent','present','unknown']}, rationale:string,
};
const scannerRecord = {type:'object',additionalProperties:false,
  required:Object.keys(scannerProperties),properties:scannerProperties};
const scannerFindings = {type:'array',maxItems:30,items:scannerRecord};

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
  const timeoutMs = Number(options.timeoutMs ?? process.env.AI_TIMEOUT_MS ?? 300000);
  const maxRetries = Number(options.maxRetries ?? process.env.AI_MAX_RETRIES ?? 1);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 300000 ||
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
    if (e.type === 'error' || e.type === 'response.failed' || e.type === 'response.incomplete') {
      // Report only a fixed classification, never provider text or echoed inputs.
      const error = e.response?.error ?? e.error ?? e;
      const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
      const parameters = ['max_output_tokens', 'max_tool_calls', 'tool_choice', 'web_search', 'external_web_access', 'include', 'model'];
      const parameter = parameters.find(name => error.param === name || (message.includes(name) && /unsupported|not supported|invalid|unknown/.test(message)));
      throw fail(parameter ? `RESPONSE_FAILED_${parameter.toUpperCase()}` : 'RESPONSE_FAILED');
    }
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
  const text = [], searches = [], openedURLs = [], citations = [], toolCalls = [];
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
      } else if (item.action?.type === 'open_page') {
        const url = sourceURL(item.action.url,cfg.redact);
        if (url && new URL(url).protocol === 'https:') openedURLs.push(url);
      }
    } else if (item.type !== 'reasoning') throw fail('UNEXPECTED_OUTPUT_TOOL');
  }
  if (search && !searches.length) throw fail('SEARCH_PROOF_MISSING');
  return { text: text.join(''), searches, openedURLs:[...new Set(openedURLs)], citations:[...new Set(citations)], toolCalls };
}

/** Returns {data,provenance}; throws a static coded error on any transport, search,
 * parsing or schema failure. Provenance is adapter-derived, never model claims.
 * schema uses the fail-closed subset above. images are local base64 data URL strings.
 * No implicit provider/model fallback or response-format changes occur. */
export async function callAI({instructions,input,schema,search=false,images=[],strictFormat=false}, options = {}) {
  const cfg = config(options);
  checkSchema(schema);
  if (typeof instructions !== 'string' || !instructions.trim() || typeof search !== 'boolean' || typeof strictFormat !== 'boolean') throw fail('INVALID_INPUT');
  checkImages(images);
  let inputText;
  try { inputText = JSON.stringify({untrustedInput:input,outputSchema:schema}); }
  catch { throw fail('INVALID_INPUT'); }
  if (input === undefined || Buffer.byteLength(inputText) + images.reduce((n,s)=>n+s.length,0) > MAX_INPUT) throw fail('INPUT_TOO_LARGE');
  const body = { model:cfg.model, reasoning:{effort:'high'}, stream:true, store:false,
    instructions: `${POLICY}\n\n${instructions}`,
    input:[{role:'user',content:[{type:'input_text',text:inputText},...images.map(image_url=>({type:'input_image',image_url,detail:'high'}))]}],
    max_output_tokens:16000,
    ...(strictFormat ? {text:{format:{type:'json_schema',name:'research_citations',strict:true,schema}}} : {}),
    ...(search ? {tools:[{type:'web_search',external_web_access:true}],tool_choice:'required',include:['web_search_call.action.sources']} : {}),
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
            searches:output.searches,openedURLs:output.openedURLs,citations:output.citations,toolCalls:output.toolCalls}};
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

// A completed web-tool open of exact registry metadata is supplementary evidence.
// It never replaces a completed exact-version Internet search with actual sources.
function exactRegistryURL(value,{name,version}) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'registry.npmjs.org' && !url.port &&
      !url.search && !url.hash && decodeURIComponent(url.pathname) === `/${name}/${version}`;
  } catch { return false; }
}

// Search providers can retain the previous owner of a renamed GitHub repo.
// Accept its canonical URL only after GitHub itself confirms the exact redirect.
function githubRedirectCandidate(source,cited) {
  try {
    const from = new URL(source), to = new URL(cited);
    if ([from,to].some(u=>u.protocol!=='https:' || u.hostname!=='github.com' || u.port || u.search || u.hash || u.username || u.password)) return false;
    const a=from.pathname.split('/'), b=to.pathname.split('/');
    return a.length>=5 && a.slice(3).join('/')===b.slice(3).join('/') && a.slice(1,3).join('/')!==b.slice(1,3).join('/');
  } catch { return false; }
}
async function githubRedirect(source, cited, fetcher) {
  try {
    const response=await fetcher(source,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(10000)});
    await response.body?.cancel();
    return [301,308].includes(response.status) && new URL(response.headers.get('location'),source).href===cited;
  } catch { return false; }
}

async function retrieveRegistryMetadata(url,target,fetcher) {
  try {
    const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(10000)});
    if (!response.ok || !response.body) { await response.body?.cancel(); return null; }
    const chunks=[]; let bytes=0;
    for await (const chunk of response.body) {
      bytes+=chunk.length;
      if (bytes>512*1024) throw Error('Registry metadata exceeds limit');
      chunks.push(Buffer.from(chunk));
    }
    const body=Buffer.concat(chunks), data=JSON.parse(body.toString('utf8'));
    return data.name===target.name && data.version===target.version ?
      {url,name:target.name,version:target.version,sha256:hash(body)} : null;
  } catch { return null; }
}

function exactVersion(version) {
  if (typeof version!=='string' || version.length>200) return false;
  const match=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(version);
  return Boolean(match && match.slice(1,4).every(v=>Number.isSafeInteger(Number(v))) &&
    (!match[4] || match[4].split('.').every(v=>!/^\d+$/.test(v) || /^(0|[1-9]\d*)$/.test(v))));
}

// Scanner records supplied by the controller are trusted configuration, never
// model evidence. Keep this contract narrow: the record must identify the exact
// package/version, use the scanner's canonical exact-release URL, and point at
// an immutable versioned upstream source. The model still has to reproduce the
// complete record and cite both URLs from its own exact-version search.
function verifiedScannerURL(value, target) {
  if (typeof value !== 'string' || sourceURL(value, v => v) !== value) return false;
  const encoded = encodeURIComponent(`${target.name}@${target.version}`);
  const expected = [
    `https://pkgradar.com/package?ecosystem=npm&full=1&spec=${encoded}`,
    `https://pkgradar.com/package/npm/${encodeURIComponent(target.name)}?version=${encodeURIComponent(target.version)}`,
  ];
  return expected.includes(value);
}
function verifiedUpstreamURL(value, target) {
  if (typeof value !== 'string' || sourceURL(value, v => v) !== value) return false;
  try {
    const url = new URL(value);
    if (!(url.protocol === 'https:' && url.hostname === 'github.com' &&
      url.pathname.includes(`/blob/v${target.version}/`) && !url.search && !url.hash)) return false;
    return target.name === 'vite' && target.version === '8.3.5'
      ? value === 'https://github.com/vitejs/vite/blob/v8.3.5/packages/vite/src/node/server/index.ts'
      : true;
  } catch { return false; }
}
function sameScannerReport(left, right) {
  return scannerProperties && Object.keys(scannerProperties).every(key => left?.[key] === right?.[key]);
}
function verifiedScannerEvidence(value, targets) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_PACKAGES) throw fail('INVALID_VERIFIED_EVIDENCE');
  const records = [];
  for (const record of value) {
    if (!object(record) || typeof record.name !== 'string' || !exactVersion(record.version)) throw fail('INVALID_VERIFIED_EVIDENCE');
    const target = targets.find(item => item.name === record.name && item.version === record.version);
    if (!target || records.some(item => item.name === record.name && item.version === record.version)) throw fail('INVALID_VERIFIED_EVIDENCE');
    const report = Object.fromEntries(Object.keys(scannerProperties).map(key => [key, record[key]]));
    if (Object.keys(record).length !== Object.keys(scannerProperties).length + 2 ||
        Object.keys(scannerProperties).some(key => !Object.hasOwn(record, key)) ||
        !valid(report, scannerRecord) ||
        !verifiedScannerURL(report.scannerURL, target) || !verifiedUpstreamURL(report.upstreamURL, target) ||
        report.upstreamVersion !== target.version || !/^[a-f0-9]{64}$/.test(report.artifactSHA256) ||
        typeof report.scannerFinding !== 'string' || typeof report.matchedToken !== 'string' ||
        report.scannerFinding !== `Credential file access: matched ${JSON.stringify(report.matchedToken)}` ||
        report.protectiveToken !== report.matchedToken ||
        ![JSON.stringify(report.matchedToken), `'${report.matchedToken}'`].some(quoted => typeof report.protectiveCode === 'string' && report.protectiveCode.includes(quoted)))
      throw fail('INVALID_VERIFIED_EVIDENCE');
    if (target.name === 'vite' && target.version === '8.3.5' &&
        (report.scannerStatus !== 'Review' || report.scannerFinding !== 'Credential file access: matched ".npmrc"' ||
         report.matchedToken !== '.npmrc' || report.artifactSHA256 !== '7f22c2a78d15bac5ad755c5f413806048db453604fa0c293f6a0613890dc7c17'))
      throw fail('INVALID_VERIFIED_EVIDENCE');
    records.push({ name: target.name, version: target.version, report });
  }
  return records;
}

function verifiedApplicationContext(value) {
  if (value === undefined) return null;
  if (!object(value) || Object.keys(value).some(key => !['applicationType', 'bundler', 'framework', 'usesNext', 'usesVitest'].includes(key)) ||
      value.applicationType !== 'vite-react-spa' || value.bundler !== 'vite' || value.framework !== 'react' ||
      typeof value.usesNext !== 'boolean' || typeof value.usesVitest !== 'boolean') throw fail('INVALID_APPLICATION_CONTEXT');
  return {...value};
}

// Keep the application-context exception deliberately narrow. It only changes a
// low/medium finding that explicitly describes a conditional Next.js/Vitest
// incompatibility while the verified context says that framework is absent.
// High/critical findings, uncertain applicability and defects affecting the
// Vite/React app retain their original severity and pass value.
function contextualizeCompatibilityFindings(findings, context) {
  if (!context) return findings;
  return findings.map(finding => {
    if (['high', 'critical', 'info'].includes(finding.severity)) return finding;
    // Applicability comes only from the finding's prose. URLs and arbitrary
    // evidence strings are citations, not a trustworthy statement that a
    // framework is a prerequisite. Require an explicit relation to exactly one
    // absent framework; loose words such as "only" or "requires" are not enough.
    const text = String(finding.message ?? '');
    const relations = [
      {absent: !context.usesNext, name:/next(?:\.js)?/i},
      {absent: !context.usesVitest, name:/vitest/i},
    ].filter(({absent, name}) => absent && name.test(text) && [
      new RegExp(`\\b(?:${name.source})\\s*(?:only|specific(?:ally)?|exclusive(?:ly)?)\\b`, 'i'),
      new RegExp(`\\b(?:only|exclusive(?:ly)?|specific(?:ally)?)\\s+(?:when\\s+)?(?:using\\s+|running\\s+|with\\s+)?(?:${name.source})\\b`, 'i'),
      new RegExp(`\\b(?:requires?|depends\\s+on|limited\\s+to|confined\\s+to)\\s+(?:using\\s+|running\\s+|with\\s+)?(?:${name.source})\\b`, 'i'),
      new RegExp(`\\b(?:when|if)\\s+(?:using\\s+|running\\s+|with\\s+)?(?:${name.source})\\b`, 'i'),
    ].some(pattern => pattern.test(text)));
    return relations.length === 1 ? {...finding, severity:'info'} : finding;
  });
}

// This can only make a model assessment more conservative. Source semantics and
// artifact identity remain the fresh researcher's responsibility, not a string
// match safety proof. Both citations retain the existing exact-query provenance.
function scannerDecision(data,target,allowedURLs,verifiedReports = []) {
  const findings=[...data.findings];
  const expected = verifiedReports.filter(item => item.name === target.name && item.version === target.version).map(item => item.report);
  if (expected.length > 1) throw fail('INVALID_VERIFIED_EVIDENCE');
  if (expected.length && data.scannerFindings.length !== 1) {
    findings.push(blocked('Controller-verified scanner evidence was not reproduced exactly',
      [target.name, target.version, expected[0].scannerURL, expected[0].upstreamURL]));
  }
  for (const report of data.scannerFindings) {
    if (!expected.length || !sameScannerReport(report, expected[0])) {
      findings.push(blocked('Credential scanner report is model-only or mismatched controller evidence',
        [report.scannerURL, report.scannerFinding, target.name, target.version]));
    }
    const cited = url => sourceURL(url,v=>v) === url && new URL(url).protocol === 'https:' &&
      allowedURLs.includes(url) && data.evidence.includes(url);
    const token=report.matchedToken;
    if (report.classification !== 'protective-denylist' || report.severity !== 'low' ||
        report.scannerStatus !== 'Review' || !/^[a-zA-Z0-9._/-]{1,200}$/.test(token) ||
        report.scannerFinding !== `Credential file access: matched ${JSON.stringify(token)}` ||
        report.protectiveToken !== token ||
        ![JSON.stringify(token),`'${token}'`].some(quoted=>report.protectiveCode.includes(quoted)) ||
        report.upstreamVersion !== target.version || !/^[a-f0-9]{64}$/.test(report.artifactSHA256) ||
        report.scannerURL === report.upstreamURL || !cited(report.scannerURL) || !cited(report.upstreamURL) ||
        report.credentialReadEvidence !== 'absent' || report.exfiltrationEvidence !== 'absent') {
      findings.push(blocked('Credential scanner report remains unresolved or unsafe',
        [report.scannerFinding,report.scannerURL,report.rationale]));
    }
  }
  if (findings.length>200) throw fail('SCHEMA_INVALID');
  return decision({...data,findings});
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
  const verifiedEvidence = verifiedScannerEvidence(options.verifiedScannerEvidence ?? options.verifiedEvidence, targets);
  if (options.verifiedScannerEvidence !== undefined && options.verifiedEvidence !== undefined &&
      JSON.stringify(options.verifiedScannerEvidence) !== JSON.stringify(options.verifiedEvidence)) throw fail('INVALID_VERIFIED_EVIDENCE');
  const applicationContext = verifiedApplicationContext(options.applicationContext ?? options.verifiedApplicationContext);
  if (options.applicationContext !== undefined && options.verifiedApplicationContext !== undefined &&
      JSON.stringify(options.applicationContext) !== JSON.stringify(options.verifiedApplicationContext)) throw fail('INVALID_APPLICATION_CONTEXT');
  const entry = {type:'object',additionalProperties:false,required:['name','version','pass','findings','evidence','scannerFindings'],properties:{
    name:string,version:string,...verdict.properties,evidence:{type:'array',minItems:1,maxItems:30,items:string},scannerFindings}};
  const schema = {type:'object',additionalProperties:false,required:['packages'],properties:{packages:{type:'array',minItems:1,maxItems:CHUNK_SIZE,items:entry}}};
  const results = [], provenance = [];
  for (let start=0; start<targets.length; start+=CHUNK_SIZE) {
    const chunk = targets.slice(start,start+CHUNK_SIZE);
    // No transport retry may multiply the two-call research/correction budget.
    const boundedOptions = {...options,maxRetries:0};
    const response = await callAI({instructions:RESEARCH,input:{baseSHA,headSHA,packages:chunk,
      controllerVerifiedScannerEvidence: verifiedEvidence.filter(item => chunk.some(target => target.name === item.name && target.version === item.version)),
      verifiedApplicationContext: applicationContext},schema,search:true},boundedOptions);
    provenance.push(response.provenance);
    response.provenance.confirmedRedirects = [];
    response.provenance.registryRetrievals = [];
    let redirectBudget = 8;
    if (response.data.packages.length !== chunk.length || new Set(response.data.packages.map(p=>`${p.name}@${p.version}`)).size !== chunk.length ||
        response.data.packages.some(p=>!chunk.some(t=>t.name===p.name && t.version===p.version))) throw fail('PARTIAL_RESEARCH');
    // Validate every initial verdict before attempting citation correction.
    response.data.packages.forEach(decision);
    const assessments = [];
    for (const target of chunk) {
      const evidence = response.provenance.searches.filter(s=>s.queries.some(q=>queryMatches(q,target)));
      const sources = new Set(evidence.flatMap(s=>s.sources));
      const opened = response.provenance.openedURLs.filter(url=>exactRegistryURL(url,target));
      const result = response.data.packages.find(p=>p.name===target.name && p.version===target.version);
      if (sources.size) for (const cited of result.evidence) if (!sources.has(cited) && !opened.includes(cited) && exactRegistryURL(cited,target)) {
        const retrieved=await retrieveRegistryMetadata(cited,target,options.registryFetch ?? fetch);
        if (retrieved) { opened.push(cited); response.provenance.registryRetrievals.push(retrieved); }
      }
      for (const cited of result.evidence) if (!sources.has(cited) && !opened.includes(cited)) {
        for (const source of sources) {
          if (!githubRedirectCandidate(source,cited)) continue;
          if (redirectBudget<=0) break;
          redirectBudget--;
          if (await githubRedirect(source,cited,options.evidenceFetch ?? fetch)) {
            sources.add(cited);
            response.provenance.confirmedRedirects.push({from:source,to:cited});
            break;
          }
        }
      }
      const allowedURLs = [...new Set([...sources,...opened])];
      const unsupported = result.evidence.filter(url=>!allowedURLs.includes(sourceURL(url,v=>v)));
      let proofError;
      if (!sources.size || unsupported.length) {
        const error = fail('PACKAGE_SEARCH_PROOF_MISSING');
        // Adapter-redacted public research metadata only; no request, provider
        // response object, configuration or authorization header is retained.
        error.researchDiagnostic = { target, searches: response.provenance.searches,
          openedURLs: response.provenance.openedURLs, citedURLs: result.evidence, matchingSearchCount: evidence.length };
        proofError = error;
      }
      // A correction cannot rescue missing exact search or fabricated-only evidence.
      if (!sources.size || unsupported.length === result.evidence.length) throw proofError;
      const contextualResult = {...result, findings: contextualizeCompatibilityFindings(result.findings, applicationContext)};
      assessments.push({target,result:scannerDecision(contextualResult,target,[...sources],verifiedEvidence),searches:evidence,allowedURLs,proofError});
    }
    if (assessments.some(a=>a.proofError)) {
      // Per-package enums contain only actual exact-query sources, completed exact
      // registry opens, identity-checked registry retrievals or confirmed redirects.
      // Bound the schema below the official enum/string limits; never truncate proof.
      const correctionFinding = {...finding,properties:{severity:finding.properties.severity,message:string,evidence:finding.properties.evidence}};
      const properties = Object.fromEntries(assessments.map((a,i)=>{
        if (a.allowedURLs.length > 200 || a.allowedURLs.reduce((n,url)=>n+url.length,0) > 24000) throw fail('CITATION_CORRECTION_LIMIT');
        return [`package${i}`,{...entry,properties:{
          name:{type:'string',enum:[a.target.name]},version:{type:'string',enum:[a.target.version]},
          pass:{type:'boolean'},findings:{...verdict.properties.findings,items:correctionFinding},
          evidence:{...entry.properties.evidence,items:{type:'string',enum:a.allowedURLs}},
          scannerFindings,
        }}];
      }));
      const correctionSchema = {type:'object',additionalProperties:false,required:['packages'],properties:{
        packages:{type:'object',additionalProperties:false,required:Object.keys(properties),properties},
      }};
      const correction = await callAI({instructions:RESEARCH_CITATIONS,strictFormat:true,schema:correctionSchema,
        input:{baseSHA,headSHA,packages:assessments.map((a,i)=>({key:`package${i}`,...a.target,
          originalAssessment:a.result,allowedEvidenceURLs:a.allowedURLs,
          controllerVerifiedScannerEvidence: verifiedEvidence.filter(item => item.name === a.target.name && item.version === a.target.version),
          verifiedApplicationContext: applicationContext}))}},boundedOptions);
      response.provenance.citationCorrection = {originalPackages:response.data.packages};
      provenance.push({...correction.provenance,purpose:'citation-correction'});
      for (const [i,a] of assessments.entries()) {
        const corrected = correction.data.packages[`package${i}`];
        // Enforce monotonic assessment locally, even if the model ignores policy.
        // Original findings (including their evidence/path/severity) survive verbatim.
        const originalFindings = new Set(a.result.findings.map(f=>JSON.stringify(f)));
        const findings = [...a.result.findings,...contextualizeCompatibilityFindings(corrected.findings, applicationContext)
          .filter(f=>!originalFindings.has(JSON.stringify(f)))];
        if (findings.length > 200) throw fail('CITATION_CORRECTION_LIMIT');
        // Citation correction cannot remove or rewrite an original scanner report.
        const originalReports=new Set(a.result.scannerFindings.map(r=>JSON.stringify(r)));
        const reports=[...a.result.scannerFindings,...corrected.scannerFindings.filter(r=>!originalReports.has(JSON.stringify(r)))];
        if (reports.length>30) throw fail('CITATION_CORRECTION_LIMIT');
        a.result = scannerDecision({...corrected,pass:a.result.pass && corrected.pass,findings,scannerFindings:reports},
          a.target,a.searches.flatMap(s=>s.sources),verifiedEvidence);
      }
    }
    results.push(...assessments.map(a=>({...decision(a.result),searches:a.searches})));
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
