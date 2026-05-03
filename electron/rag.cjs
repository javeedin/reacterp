/**
 * RAG Engine — runs entirely in the Electron main process.
 *
 * Storage  : SQLite (better-sqlite3) with FTS5 for keyword search
 * Parsing  : pdf-parse (PDF), mammoth (Word), plain text for others
 * Retrieval: FTS5 BM25 ranking, top-K chunks
 * Generation: Claude API (key from APEX RR_CLAUDE_KEY)
 */

'use strict';

const path    = require('path');
const fs      = require('fs');
const Database = require('better-sqlite3');

let _db = null;

// ── DB init ──────────────────────────────────────────────────────────────────
function getDb(userDataPath) {
  if (_db) return _db;
  const dbPath = path.join(userDataPath, 'rag_store.db');
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS rag_documents (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      type        TEXT,
      size_bytes  INTEGER DEFAULT 0,
      chunk_count INTEGER DEFAULT 0,
      created_at  TEXT    DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS rag_chunks USING fts5(
      content,
      doc_id,
      chunk_index,
      tokenize = 'porter unicode61'
    );
  `);
  return _db;
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

  // Plain text fallback (txt, md, csv, json, etc.)
  return buffer.toString('utf8');
}

// ── Ingest ────────────────────────────────────────────────────────────────────
async function ingestFile(userDataPath, buffer, filename, mimeType) {
  const db = getDb(userDataPath);

  // Delete existing doc with same name (re-ingest)
  const existing = db.prepare('SELECT id FROM rag_documents WHERE name = ?').get(filename);
  if (existing) {
    db.prepare("DELETE FROM rag_chunks WHERE doc_id = ?").run(existing.id);
    db.prepare('DELETE FROM rag_documents WHERE id = ?').run(existing.id);
  }

  const text   = await extractText(buffer, filename);
  const chunks = chunkText(text);

  const insertDoc = db.prepare(
    'INSERT INTO rag_documents (name, type, size_bytes, chunk_count) VALUES (?, ?, ?, ?)'
  );
  const docId = insertDoc.run(filename, mimeType || ext(filename), buffer.length, chunks.length).lastInsertRowid;

  const insertChunk = db.prepare(
    'INSERT INTO rag_chunks (content, doc_id, chunk_index) VALUES (?, ?, ?)'
  );
  const insertMany = db.transaction((rows) => {
    for (const [i, content] of rows) insertChunk.run(content, String(docId), i);
  });
  insertMany(chunks.map((c, i) => [i, c]));

  return { docId, chunkCount: chunks.length, textLength: text.length };
}

function ext(filename) {
  return path.extname(filename).toLowerCase().replace('.', '');
}

// ── Search ────────────────────────────────────────────────────────────────────
function searchChunks(userDataPath, query, limit = 6) {
  const db = getDb(userDataPath);
  // FTS5 MATCH with BM25 ranking
  const rows = db.prepare(`
    SELECT c.content, c.doc_id, c.chunk_index,
           d.name AS doc_name,
           bm25(rag_chunks) AS score
      FROM rag_chunks c
      JOIN rag_documents d ON d.id = CAST(c.doc_id AS INTEGER)
     WHERE rag_chunks MATCH ?
     ORDER BY bm25(rag_chunks)
     LIMIT ?
  `).all(sanitizeFts(query), limit);
  return rows;
}

function sanitizeFts(q) {
  // Escape FTS5 special chars, wrap in quotes for phrase search fallback
  return q.replace(/["]/g, '""').replace(/[*^()]/g, ' ').trim();
}

// ── List / Delete ─────────────────────────────────────────────────────────────
function listDocuments(userDataPath) {
  const db = getDb(userDataPath);
  return db.prepare('SELECT * FROM rag_documents ORDER BY created_at DESC').all();
}

function deleteDocument(userDataPath, docId) {
  const db = getDb(userDataPath);
  db.prepare('DELETE FROM rag_chunks WHERE doc_id = ?').run(String(docId));
  db.prepare('DELETE FROM rag_documents WHERE id = ?').run(docId);
}

// ── ERP endpoint catalogue (for NL → API translation) ────────────────────────
const ERP_ENDPOINTS = [
  { method: 'GET', path: '/cash/banktransfers',        desc: 'Bank account transfers. Params: date_from, date_to, from_account, to_account, status, business_unit, row_limit' },
  { method: 'GET', path: '/cash/externaltransactions', desc: 'External cash transactions. Params: date_from, date_to, bank_account, direction (DR/CR), txn_type, business_unit, row_limit' },
  { method: 'GET', path: '/cash/bankstatements',       desc: 'Bank statements. Params: bank_account, date_from, date_to, business_unit, row_limit' },
  { method: 'GET', path: '/cash/transactioncodes',     desc: 'Transaction codes / types list' },
  { method: 'GET', path: '/gl/journals',               desc: 'GL journals. Params: date_from, date_to, status, business_unit, row_limit' },
  { method: 'GET', path: '/ap/invoices',               desc: 'AP invoices. Params: date_from, date_to, vendor, status, business_unit, row_limit' },
  { method: 'GET', path: '/ap/payments',               desc: 'AP payments. Params: date_from, date_to, vendor, status, business_unit, row_limit' },
  { method: 'GET', path: '/admin/claudekeys',          desc: 'Claude API key management (admin only)' },
];

// ── Main RAG query ────────────────────────────────────────────────────────────
async function ragQuery(userDataPath, apexBase, apiKey, { question, mode, history }) {
  // mode: 'docs' | 'erp' | 'auto'
  const systemBase = `You are an intelligent ERP assistant for an Oracle-based ERP system.
Today's date: ${new Date().toISOString().split('T')[0]}.
Be concise, accurate, and always cite sources when answering from documents.`;

  // ── ERP data query mode ──────────────────────────────────────────────────
  if (mode === 'erp') {
    return erpQuery(apexBase, apiKey, question, history, systemBase);
  }

  // ── Docs-only mode ───────────────────────────────────────────────────────
  if (mode === 'docs') {
    return docsQuery(userDataPath, apiKey, question, history, systemBase);
  }

  // ── Auto: detect intent ──────────────────────────────────────────────────
  // Simple heuristic: if question contains data-like keywords, try ERP first
  const erpKeywords = /\b(how many|list|show|find|total|sum|count|invoice|payment|transfer|journal|statement|balance|amount|vendor|supplier|unreconciled|overdue|unpaid)\b/i;
  if (erpKeywords.test(question)) {
    const erpResult = await erpQuery(apexBase, apiKey, question, history, systemBase);
    if (erpResult.type === 'erp_data') return erpResult;
  }
  return docsQuery(userDataPath, apiKey, question, history, systemBase);
}

// ── ERP natural-language query ────────────────────────────────────────────────
async function erpQuery(apexBase, apiKey, question, history, systemBase) {
  const endpointList = ERP_ENDPOINTS.map(e => `  ${e.method} ${e.path} — ${e.desc}`).join('\n');

  const systemPrompt = `${systemBase}

You can query the ERP system using these REST endpoints:
${endpointList}

When the user asks for ERP data, respond with ONLY this JSON (no explanation):
{
  "type": "api_call",
  "endpoint": "/path/to/endpoint",
  "params": { "param_name": "value" },
  "description": "one sentence describing what this fetches"
}

If the question is NOT about fetching ERP data, respond with:
{ "type": "text", "answer": "your answer here" }

Rules:
- dates must be YYYY-MM-DD format
- row_limit defaults to 50 unless user specifies
- Only use endpoints from the list above`;

  const messages = [
    ...(history || []).slice(-6),
    { role: 'user', content: question },
  ];

  const claude = await callClaude(apiKey, systemPrompt, messages, 512);
  const raw = claude.content?.[0]?.text ?? '';

  let parsed;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? '{}');
  } catch {
    return { type: 'text', answer: raw, sources: [] };
  }

  if (parsed.type === 'api_call') {
    // Execute the API call
    const params = new URLSearchParams(parsed.params ?? {});
    const url = `${apexBase}${parsed.endpoint}${params.toString() ? '?' + params.toString() : ''}`;
    try {
      const res  = await fetch(url);
      const text = await res.text();
      const data = JSON.parse(text);
      const items = data.items ?? data.data ?? [];

      // Ask Claude to summarise the results
      const summaryPrompt = `${systemBase}\nSummarise these ERP results for the user in a clear, concise way. Use a table or bullet list if helpful. If empty, say so.`;
      const summaryMsg = [{ role: 'user', content: `Question: ${question}\n\nAPI: ${parsed.description}\nURL: ${url}\n\nData (${items.length} records):\n${JSON.stringify(items.slice(0, 30), null, 2)}` }];
      const summary = await callClaude(apiKey, summaryPrompt, summaryMsg, 1024);
      return {
        type:        'erp_data',
        answer:      summary.content?.[0]?.text ?? 'No summary.',
        apiUrl:      url,
        apiDesc:     parsed.description,
        recordCount: items.length,
        rawData:     items.slice(0, 30),
        sources:     [],
      };
    } catch (e) {
      return { type: 'text', answer: `I would query ${url} but got an error: ${e.message}`, sources: [] };
    }
  }

  return { type: 'text', answer: parsed.answer ?? raw, sources: [] };
}

// ── Document RAG query ────────────────────────────────────────────────────────
async function docsQuery(userDataPath, apiKey, question, history, systemBase) {
  const chunks = searchChunks(userDataPath, question, 6);

  if (chunks.length === 0) {
    return {
      type: 'text',
      answer: "I couldn't find relevant information in the uploaded documents. Try uploading relevant manuals or SOPs, or switch to ERP Data mode to query live data.",
      sources: [],
    };
  }

  const context = chunks.map((c, i) =>
    `[Source ${i + 1}: ${c.doc_name}]\n${c.content}`
  ).join('\n\n---\n\n');

  const systemPrompt = `${systemBase}

Answer using ONLY the context below. Cite sources as [Source N].
If the answer is not in the context, say so clearly — do not make things up.

CONTEXT:
${context}`;

  const messages = [
    ...(history || []).slice(-6),
    { role: 'user', content: question },
  ];

  const claude = await callClaude(apiKey, systemPrompt, messages, 1024);
  return {
    type:    'docs',
    answer:  claude.content?.[0]?.text ?? 'No response.',
    sources: [...new Set(chunks.map(c => c.doc_name))],
    chunks:  chunks.map(c => ({ docName: c.doc_name, snippet: c.content.substring(0, 120) + '…' })),
  };
}

// ── Claude API helper ─────────────────────────────────────────────────────────
async function callClaude(apiKey, system, messages, maxTokens = 1024) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err.substring(0, 200)}`);
  }
  return res.json();
}

module.exports = { ingestFile, searchChunks, listDocuments, deleteDocument, ragQuery, getDb };
