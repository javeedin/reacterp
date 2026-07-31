// Parse an Oracle Fusion FSM "Setup Data Export" zip entirely in the browser.
//
// Shape of the export:
//   OuterExport.zip
//     ├─ <Setup Task A>.zip
//     │    ├─ SOMETHING.xls        ← an HTML table (BI Publisher output)
//     │    └─ …                    (empty <body> = task not configured)
//     ├─ <Setup Task B>.zip
//     │    └─ Something/1_BATCH.zip ← batch-import format (treated as "has data")
//     └─ …
//
// Each inner zip is one setup task; the .xls files are HTML tables whose rows are
// the configured records. We categorise every task into a functional module.
import JSZip from 'jszip';

export type SetupModule = 'Financials' | 'Supply Chain' | 'Common';

export interface SetupFile { name: string; sdoTitle?: string; headers: string[]; rows: string[][]; }
export interface SetupTask {
  name: string;
  module: SetupModule;
  files: SetupFile[];
  recordCount: number;
  hasData: boolean;
  batch: boolean;
}

// Keyword-based module classification of a setup-task name. Supply-Chain terms are
// checked first (they're specific), then the broad Financials set, else Common.
export const moduleOf = (name: string): SetupModule => {
  const n = name.toLowerCase();
  if (/^item\b|item class|item status|item attribute|item lifecycle|inventory organization|unit of measure|supplier number|supplier user|enable new supplier|procurement agent|revenue management item|\bwarehouse\b|shipping|receiving/.test(n)) return 'Supply Chain';
  if (/receivable|payable|payment|\btax\b|subledger|\bledger\b|journal|legal|business unit|fixed asset|expense|collection|revenue management|\bbank\b|intercompany|chart of account|general ledger|conversion rate|aging|autoinvoice|funds capture|credit card|credit case|\bcash\b|distribution|jurisdiction|approval|accounting|financials|internal payer|disbursement|reporting entity|interest rate|\bperiod\b|1099|segment value|data access|balancing|suspense|statistical|reconciliation|remit-to|\bmemo\b|dunning|collector|lockbox|card issuer|corporate card|configuration owner|country tax|customer tax|application tax|revaluation|invoice|scoring|contingency|autocash|automatch|balance forward|late charge|statement|reversal|standard message/.test(n)) return 'Financials';
  return 'Common';
};

// Parse one HTML-table .xls into headers + data rows (via the DOM — these files
// are real HTML). Skips the SDO title row and sub-section markers.
const parseHtmlTable = (html: string, fileName: string): SetupFile => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const trs = Array.from(doc.querySelectorAll('tr'));
  const cellsOf = (tr: Element) => Array.from(tr.querySelectorAll('td,th'));
  const txt = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  let sdoTitle: string | undefined;
  let headerIdx = -1;
  for (let i = 0; i < trs.length; i++) {
    const cells = cellsOf(trs[i]);
    if (cells.length === 1 && !sdoTitle) sdoTitle = txt(cells[0]) || undefined;
    if (cells.length > 1) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return { name: fileName, sdoTitle, headers: [], rows: [] };
  const headers = cellsOf(trs[headerIdx]).map(txt);
  const rows: string[][] = [];
  for (let i = headerIdx + 1; i < trs.length; i++) {
    const cells = cellsOf(trs[i]);
    if (cells.length < 2) continue;                 // sub-section marker
    const vals = cells.map(txt);
    if (vals.every(v => !v)) continue;              // blank spacer row
    if (vals.join('') === headers.join('')) continue; // repeated header
    rows.push(vals);
  }
  return { name: fileName, sdoTitle, headers, rows };
};

// Parse the whole export. onProgress fires as each task finishes.
export const parseSetupExport = async (
  file: File | ArrayBuffer,
  onProgress?: (done: number, total: number) => void,
): Promise<SetupTask[]> => {
  const outer = await JSZip.loadAsync(file);
  const taskEntries = Object.values(outer.files).filter(f => !f.dir && /\.zip$/i.test(f.name));
  const tasks: SetupTask[] = [];
  let done = 0;
  for (const entry of taskEntries) {
    const name = entry.name.replace(/\.zip$/i, '').replace(/^.*\//, '');
    const files: SetupFile[] = [];
    let batch = false;
    try {
      const inner = await JSZip.loadAsync(await entry.async('arraybuffer'));
      for (const [fn, fe] of Object.entries(inner.files)) {
        if ((fe as JSZip.JSZipObject).dir) continue;
        if (/\.zip$/i.test(fn)) { batch = true; continue; }   // nested *_BATCH.zip
        if (/\.xls$/i.test(fn)) {
          const parsed = parseHtmlTable(await (fe as JSZip.JSZipObject).async('string'), fn.replace(/^.*\//, ''));
          if (parsed.headers.length || parsed.rows.length || parsed.sdoTitle) files.push(parsed);
        }
      }
    } catch { /* skip unreadable task */ }
    const recordCount = files.reduce((s, f) => s + f.rows.length, 0);
    tasks.push({ name, module: moduleOf(name), files, recordCount, hasData: recordCount > 0 || batch, batch });
    done++; onProgress?.(done, taskEntries.length);
  }
  return tasks.sort((a, b) => a.name.localeCompare(b.name));
};

// Simple in-memory cache so switching between the Financials / Supply Chain menu
// items keeps the last-parsed export without re-uploading.
let _cache: { fileName: string; tasks: SetupTask[] } | null = null;
export const getSetupCache = () => _cache;
export const setSetupCache = (fileName: string, tasks: SetupTask[]) => { _cache = { fileName, tasks }; };
export const clearSetupCache = () => { _cache = null; };
