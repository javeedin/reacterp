/**
 * RAG Engine — pure JavaScript, no native compilation required.
 *
 * Storage  : JSON file (rag_store.json in Electron userData)
 * Search   : In-memory BM25 ranking (pure JS)
 * Parsing  : pdf-parse (PDF), mammoth (Word), plain text fallback
 * Generation: Claude API
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// ── Store shape ───────────────────────────────────────────────────────────────
// { documents: [...], chunks: [...], nextDocId: N, nextChunkId: N }

let _store    = null;
let _storePath = null;

function loadStore(userDataPath) {
  if (_store) return _store;
  _storePath = path.join(userDataPath, 'rag_store.json');
  if (fs.existsSync(_storePath)) {
    try { _store = JSON.parse(fs.readFileSync(_storePath, 'utf8')); } catch { _store = null; }
  }
  if (!_store) {
    _store = { documents: [], chunks: [], nextDocId: 1, nextChunkId: 1 };
  }
  return _store;
}

function saveStore() {
  if (!_storePath || !_store) return;
  fs.writeFileSync(_storePath, JSON.stringify(_store), 'utf8');
}

// ── Tokeniser ─────────────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','is','it','its','as','be','are','was','were','been','have',
  'has','had','do','does','did','will','would','could','should','may','might',
  'this','that','these','those','i','you','he','she','we','they',
]);

function tokenise(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

function termFreq(tokens) {
  const tf = {};
  for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
  return tf;
}

// ── BM25 ──────────────────────────────────────────────────────────────────────
function bm25Score(chunk, queryTerms, avgDocLen, N, df, k1 = 1.5, b = 0.75) {
  const docLen = chunk.tokenCount;
  let score = 0;
  for (const term of queryTerms) {
    const tf  = chunk.tf[term] || 0;
    if (tf === 0) continue;
    const idf = Math.log((N - (df[term] || 0) + 0.5) / ((df[term] || 0) + 0.5) + 1);
    score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * docLen / avgDocLen));
  }
  return score;
}

function searchChunks(userDataPath, query, limit = 6) {
  const store = loadStore(userDataPath);
  if (store.chunks.length === 0) return [];

  const queryTerms = tokenise(query);
  if (queryTerms.length === 0) return [];

  // Build document frequency index
  const df  = {};
  const N   = store.chunks.length;
  let totalLen = 0;
  for (const c of store.chunks) {
    totalLen += c.tokenCount;
    for (const t of Object.keys(c.tf)) df[t] = (df[t] || 0) + 1;
  }
  const avgDocLen = totalLen / N;

  const scored = store.chunks
    .map(c => ({ chunk: c, score: bm25Score(c, queryTerms, avgDocLen, N, df) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ chunk }) => {
    const doc = store.documents.find(d => d.id === chunk.docId);
    return { content: chunk.content, doc_id: chunk.docId, chunk_index: chunk.chunkIndex, doc_name: doc?.name ?? 'Unknown' };
  });
}

// ── Text chunking ─────────────────────────────────────────────────────────────
function chunkText(text, chunkSize = 800, overlap = 120) {
  const clean = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = start + chunkSize;
    if (end < clean.length) {
      const breakAt = clean.lastIndexOf('\n', end);
      if (breakAt > start + chunkSize / 2) end = breakAt;
    }
    const chunk = clean.slice(start, end).trim();
    if (chunk.length > 40) chunks.push(chunk);
    start = end - overlap;
    if (start >= clean.length) break;
  }
  return chunks;
}

// ── File parsing ──────────────────────────────────────────────────────────────
async function extractText(buffer, filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    return data.text;
  }
  if (ext === '.docx' || ext === '.doc') {
    const mammoth = require('mammoth');
    const result  = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  return buffer.toString('utf8');
}

// ── Ingest ────────────────────────────────────────────────────────────────────
async function ingestFile(userDataPath, buffer, filename, mimeType) {
  const store = loadStore(userDataPath);

  // Remove existing doc with same name
  const existingIdx = store.documents.findIndex(d => d.name === filename);
  if (existingIdx !== -1) {
    const existingId = store.documents[existingIdx].id;
    store.chunks    = store.chunks.filter(c => c.docId !== existingId);
    store.documents.splice(existingIdx, 1);
  }

  const text   = await extractText(buffer, filename);
  const chunks = chunkText(text);

  const docId = store.nextDocId++;
  store.documents.push({
    id: docId, name: filename,
    type: mimeType || path.extname(filename).slice(1),
    size_bytes: buffer.length, chunk_count: chunks.length,
    created_at: new Date().toISOString(),
  });

  for (let i = 0; i < chunks.length; i++) {
    const tokens = tokenise(chunks[i]);
    store.chunks.push({
      id: store.nextChunkId++,
      docId, chunkIndex: i,
      content: chunks[i],
      tokenCount: tokens.length,
      tf: termFreq(tokens),
    });
  }

  saveStore();
  return { docId, chunkCount: chunks.length, textLength: text.length };
}

// ── List / Delete ─────────────────────────────────────────────────────────────
function listDocuments(userDataPath) {
  return loadStore(userDataPath).documents.slice().reverse();
}

function deleteDocument(userDataPath, docId) {
  const store = loadStore(userDataPath);
  store.documents = store.documents.filter(d => d.id !== docId);
  store.chunks    = store.chunks.filter(c => c.docId !== docId);
  saveStore();
}

// ── ERP endpoint catalogue ────────────────────────────────────────────────────
const ERP_ENDPOINTS = [
  { method: 'GET', path: '/cash/banktransfers',        desc: 'Bank account transfers. Params: date_from, date_to, from_account, to_account, status, business_unit, row_limit' },
  { method: 'GET', path: '/cash/externaltransactions', desc: 'External cash transactions. Params: date_from, date_to, bank_account, direction (DR/CR), txn_type, business_unit, row_limit' },
  { method: 'GET', path: '/cash/bankstatements',       desc: 'Bank statements / statement lines. Params: bank_account, date_from, date_to, business_unit, row_limit' },
  { method: 'GET', path: '/cash/transactioncodes',     desc: 'Transaction codes/types list' },
  { method: 'GET', path: '/gl/journals',               desc: 'GL journals. Params: date_from, date_to, status, business_unit, row_limit' },
  { method: 'GET', path: '/ap/invoices',               desc: 'AP invoices. Params: date_from, date_to, vendor, status, business_unit, row_limit' },
  { method: 'GET', path: '/ap/payments',               desc: 'AP payments. Params: date_from, date_to, vendor, status, business_unit, row_limit' },
];

// ── Main RAG query ─────────────────────────────────────────────────────────────
async function ragQuery(userDataPath, apexBase, apiKey, { question, mode, history }) {
  const systemBase = `You are an intelligent ERP assistant for an Oracle-based ERP system.
Today's date: ${new Date().toISOString().split('T')[0]}.
Be concise, accurate, and always cite sources when answering from documents.`;

  if (mode === 'erp')  return erpQuery(apexBase, apiKey, question, history, systemBase);
  if (mode === 'docs') return docsQuery(userDataPath, apiKey, question, history, systemBase);

  // Auto: try ERP for data-like questions, else docs
  const erpKeywords = /\b(how many|list|show|find|total|sum|count|invoice|payment|transfer|journal|statement|balance|amount|vendor|unreconciled|overdue|unpaid|pending)\b/i;
  if (erpKeywords.test(question)) {
    const result = await erpQuery(apexBase, apiKey, question, history, systemBase);
    if (result.type === 'erp_data') return result;
  }
  return docsQuery(userDataPath, apiKey, question, history, systemBase);
}

// ── ERP NL query ──────────────────────────────────────────────────────────────
async function erpQuery(apexBase, apiKey, question, history, systemBase) {
  const endpointList = ERP_ENDPOINTS.map(e => `  ${e.method} ${e.path} — ${e.desc}`).join('\n');
  const systemPrompt = `${systemBase}

You can query the ERP system using these REST endpoints:
${endpointList}

When the user asks for ERP data, respond with ONLY this JSON:
{ "type": "api_call", "endpoint": "/path", "params": { "key": "value" }, "description": "one sentence" }

If not a data query:
{ "type": "text", "answer": "..." }

Rules: dates = YYYY-MM-DD, row_limit defaults to 50.`;

  const messages = [...(history || []).slice(-6), { role: 'user', content: question }];
  const claude = await callClaude(apiKey, systemPrompt, messages, 512);
  const raw = claude.content?.[0]?.text ?? '';

  let parsed;
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m?.[0] ?? '{}');
  } catch {
    return { type: 'text', answer: raw, sources: [] };
  }

  if (parsed.type === 'api_call') {
    const params = new URLSearchParams(parsed.params ?? {});
    const url = `${apexBase}${parsed.endpoint}${params.toString() ? '?' + params.toString() : ''}`;
    try {
      const res   = await fetch(url);
      const text  = await res.text();
      const data  = JSON.parse(text);
      const items = data.items ?? data.data ?? [];

      const summaryPrompt = `${systemBase}\nSummarise these ERP query results clearly. Use a table or bullet list. If empty, say so.`;
      const summaryMsg = [{ role: 'user', content: `Question: ${question}\nAPI: ${parsed.description}\nURL: ${url}\n\nData (${items.length} records):\n${JSON.stringify(items.slice(0, 30), null, 2)}` }];
      const summary = await callClaude(apiKey, summaryPrompt, summaryMsg, 1024);
      return { type: 'erp_data', answer: summary.content?.[0]?.text ?? 'No summary.', apiUrl: url, apiDesc: parsed.description, recordCount: items.length, rawData: items.slice(0, 30), sources: [] };
    } catch (e) {
      return { type: 'text', answer: `I would query ${url} but got an error: ${e.message}`, sources: [] };
    }
  }
  return { type: 'text', answer: parsed.answer ?? raw, sources: [] };
}

// ── Docs RAG query ────────────────────────────────────────────────────────────
async function docsQuery(userDataPath, apiKey, question, history, systemBase) {
  const chunks = searchChunks(userDataPath, question, 6);
  if (chunks.length === 0) {
    return { type: 'text', answer: "I couldn't find relevant information in the uploaded documents. Try uploading relevant manuals or SOPs, or switch to ERP Data mode to query live data.", sources: [] };
  }
  const context = chunks.map((c, i) => `[Source ${i + 1}: ${c.doc_name}]\n${c.content}`).join('\n\n---\n\n');
  const systemPrompt = `${systemBase}\n\nAnswer using ONLY the context below. Cite sources as [Source N]. If not in context, say so.\n\nCONTEXT:\n${context}`;
  const messages = [...(history || []).slice(-6), { role: 'user', content: question }];
  const claude = await callClaude(apiKey, systemPrompt, messages, 1024);
  return { type: 'docs', answer: claude.content?.[0]?.text ?? 'No response.', sources: [...new Set(chunks.map(c => c.doc_name))], chunks: chunks.map(c => ({ docName: c.doc_name, snippet: c.content.substring(0, 120) + '…' })) };
}

// ── Claude helper ─────────────────────────────────────────────────────────────
async function callClaude(apiKey, system, messages, maxTokens = 1024) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens, system, messages }),
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Claude API ${res.status}: ${err.substring(0, 200)}`); }
  return res.json();
}

module.exports = { ingestFile, searchChunks, listDocuments, deleteDocument, ragQuery };
