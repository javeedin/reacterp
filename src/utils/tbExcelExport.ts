/**
 * tbExcelExport.ts
 * Styled Excel exports for Trial Balance reports using ExcelJS.
 *
 * Produces professional-grade workbooks with:
 *  - Branded title & subtitle rows
 *  - Report metadata block (Ledger, Company, Period, Currency, Generated)
 *  - Bold column headers on navy background
 *  - Account-type-coloured data rows
 *  - Comma-separated number format; negatives in red brackets
 *  - Bold totals row with double bottom border
 *  - Frozen header rows + auto-filter
 */

import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// ─────────────────────────────────────────────────────────────────────────────
// Palette  (ARGB — first two chars = alpha, always FF = fully opaque)
// ─────────────────────────────────────────────────────────────────────────────
const P = {
  TITLE_BG:   'FFC74634',   // Oracle Redwood red
  TITLE_SUB:  'FFA33B2C',   // darker red (subtitle row)
  COL_HDR:    'FF1A3C5E',   // dark navy  (column header row)
  INFO_BG:    'FFF8F9FA',   // very light grey (info rows)
  INFO_RULE:  'FFE5E7EB',   // grey rule between info rows
  TOTAL_BG:   'FFE8F0FE',   // pale blue (totals row)
  WHITE:      'FFFFFFFF',
  DARK:       'FF1A1A1A',
  GREY:       'FF6B6B6B',
  BORDER_MED: 'FF2E6DA4',   // medium border accent
  HAIR:       'FFE5E5E5',   // hairline row separator
  // Account type row tints
  A: 'FFEBF5FB',  // Asset     — light blue
  L: 'FFFFF9E6',  // Liability — light amber
  O: 'FFEAFAF1',  // Equity    — light green
  R: 'FFFDF2F8',  // Revenue   — light pink
  E: 'FFF4ECF7',  // Expense   — light purple
  EVEN: 'FFFAFBFC', // fallback stripe for even rows
};

const TYPE_LABEL: Record<string, string> = {
  A: 'Asset', L: 'Liability', O: 'Equity', R: 'Revenue', E: 'Expense',
};

/** Number format: commas, 2dp; negatives in red with brackets */
const NUM_FMT = '#,##0.00;[Red](#,##0.00)';

// ─────────────────────────────────────────────────────────────────────────────
// Low-level helpers
// ─────────────────────────────────────────────────────────────────────────────
const solid = (argb: string): ExcelJS.Fill => ({
  type: 'pattern', pattern: 'solid', fgColor: { argb },
});

const hairBottom: Partial<ExcelJS.Borders> = {
  bottom: { style: 'hair', color: { argb: P.HAIR } },
};

const todayStr = () =>
  new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

async function saveWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  const eAPI = (window as any).electronAPI;
  if (eAPI?.openExcel) {
    await eAPI.openExcel(new Uint8Array(buf as ArrayBuffer), filename);
  } else {
    saveAs(
      new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      filename,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: write the branded header block (rows 1-9)
//   Row 1  : Title bar (merged, red)
//   Row 2  : Subtitle / compact info line (merged, darker red)
//   Row 3  : Spacer
//   Row 4-8: Info details (label / value pairs on light grey)
//   Row 9  : Spacer
// Returns the first available data row number (10).
// ─────────────────────────────────────────────────────────────────────────────
function writeHeader(
  ws:         ExcelJS.Worksheet,
  numCols:    number,
  titleText:  string,
  info: { ledger: string; company: string; period: string; currency: string },
) {
  const infoItems: [string, string][] = [
    ['Ledger',    info.ledger],
    ['Company',   info.company],
    ['Period',    info.period],
    ['Currency',  info.currency],
    ['Generated', todayStr()],
  ];

  // ── Row 1: Title ─────────────────────────────────────────
  ws.mergeCells(1, 1, 1, numCols);
  const title = ws.getCell(1, 1);
  title.value     = titleText;
  title.font      = { bold: true, size: 15, color: { argb: P.WHITE }, name: 'Calibri' };
  title.fill      = solid(P.TITLE_BG);
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 32;

  // ── Row 2: Subtitle ──────────────────────────────────────
  ws.mergeCells(2, 1, 2, numCols);
  const sub = ws.getCell(2, 1);
  sub.value     = `${info.ledger}   ·   ${info.period}   ·   Company: ${info.company}   ·   CCY: ${info.currency}`;
  sub.font      = { size: 10, italic: true, color: { argb: P.WHITE }, name: 'Calibri' };
  sub.fill      = solid(P.TITLE_SUB);
  sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(2).height = 18;

  // ── Row 3: Spacer ─────────────────────────────────────────
  ws.getRow(3).height = 5;

  // ── Rows 4-8: Info detail ─────────────────────────────────
  infoItems.forEach(([label, value], i) => {
    const rn = 4 + i;
    const row = ws.getRow(rn);
    row.height = 17;

    // Fill entire row
    for (let c = 1; c <= numCols; c++) {
      ws.getCell(rn, c).fill = solid(P.INFO_BG);
    }

    // Col B: label, Col C: value (merged C-end)
    ws.mergeCells(rn, 3, rn, numCols);
    const lCell = ws.getCell(rn, 2);
    const vCell = ws.getCell(rn, 3);

    lCell.value     = `${label}:`;
    lCell.font      = { bold: true, size: 10, color: { argb: P.GREY }, name: 'Calibri' };
    lCell.alignment = { horizontal: 'right', vertical: 'middle' };

    vCell.value     = value;
    vCell.font      = { bold: true, size: 10, color: { argb: P.DARK }, name: 'Calibri' };
    vCell.alignment = { horizontal: 'left',  vertical: 'middle', indent: 1 };

    // Subtle bottom rule
    for (let c = 1; c <= numCols; c++) {
      ws.getCell(rn, c).border = hairBottom;
    }
  });

  // ── Row 9: Spacer ─────────────────────────────────────────
  ws.getRow(9).height = 5;

  return 10; // column-header row
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: write column-header row + configure freeze / auto-filter
// ─────────────────────────────────────────────────────────────────────────────
function writeColHeaders(
  ws:           ExcelJS.Worksheet,
  rowNum:       number,
  headers:      string[],
  numericFrom:  number,   // 1-based column index where right-align starts
) {
  const row = ws.getRow(rowNum);
  row.height = 23;

  headers.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value     = h;
    cell.font      = { bold: true, size: 10, color: { argb: P.WHITE }, name: 'Calibri' };
    cell.fill      = solid(P.COL_HDR);
    cell.alignment = {
      horizontal: i + 1 < numericFrom ? 'left' : 'right',
      vertical:   'middle',
      indent:     i + 1 < numericFrom ? 1 : 0,
    };
    cell.border = {
      top:    { style: 'thin',   color: { argb: P.COL_HDR } },
      bottom: { style: 'medium', color: { argb: P.BORDER_MED } },
    };
  });

  // Freeze above and including this row
  ws.views = [{
    state:      'frozen',
    xSplit:     0,
    ySplit:     rowNum,
    activeCell: `A${rowNum + 1}`,
  }];

  // Auto filter
  ws.autoFilter = {
    from: { row: rowNum, column: 1 },
    to:   { row: rowNum, column: headers.length },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: write totals row
// ─────────────────────────────────────────────────────────────────────────────
function writeTotalsRow(
  ws:          ExcelJS.Worksheet,
  values:      (string | number)[],
  numericFrom: number,
) {
  // Blank separator
  ws.addRow([]);

  const row = ws.addRow(values);
  row.height = 22;
  row.eachCell({ includeEmpty: true }, (cell, c) => {
    cell.font  = { bold: true, size: 11, name: 'Calibri' };
    cell.fill  = solid(P.TOTAL_BG);
    cell.border = {
      top:    { style: 'medium' },
      bottom: { style: 'double' },
    };
    if (c >= numericFrom && typeof cell.value === 'number') {
      cell.numFmt    = NUM_FMT;
      cell.alignment = { horizontal: 'right' };
    }
    if (c === numericFrom - 1) {
      cell.alignment = { horizontal: 'right', indent: 0 };
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT 1 — ReERP Standard Trial Balance
// ─────────────────────────────────────────────────────────────────────────────
export interface RrTBRow {
  account_type: string;
  account:      string;
  account_desc: string;
  opening:      number;
  debit:        number;
  credit:       number;
  closing:      number;
  ytd_net:      number;
}

export interface RrTBTotals {
  opening: number; debit: number; credit: number; closing: number; ytd_net: number;
}

export async function exportRrTBToExcel(opts: {
  ledger:   string;
  company:  string;
  period:   string;
  currency: string;
  rows:     RrTBRow[];
  totals:   RrTBTotals;
}) {
  const { ledger, company, period, currency, rows, totals } = opts;

  const wb = new ExcelJS.Workbook();
  wb.creator  = 'ReERP';
  wb.created  = new Date();
  const ws = wb.addWorksheet(`RR TB ${period}`.slice(0, 31));

  const HEADERS    = ['Type', 'Account', 'Description', 'Opening', 'Debit', 'Credit', 'Closing', 'YTD Net'];
  const NUM_COL    = 4;   // columns 4-8 are numeric
  const NUM_COLS   = HEADERS.length;

  // Set column widths upfront
  const COL_WIDTHS = [12, 14, 42, 18, 18, 18, 18, 18];
  COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // ── Header block (rows 1-9) ────────────────────────────────
  writeHeader(ws, NUM_COLS, 'REERP TRIAL BALANCE', { ledger, company, period, currency });

  // ── Column headers (row 10) ────────────────────────────────
  writeColHeaders(ws, 10, HEADERS, NUM_COL);

  // ── Data rows (row 11+) ────────────────────────────────────
  rows.forEach((r, idx) => {
    const bgArgb = P[r.account_type as keyof typeof P] as string
                || (idx % 2 === 0 ? P.WHITE : P.EVEN);

    const row = ws.addRow([
      TYPE_LABEL[r.account_type] || r.account_type,
      r.account,
      r.account_desc || '',
      r.opening, r.debit, r.credit, r.closing, r.ytd_net,
    ]);
    row.height = 16;

    row.eachCell({ includeEmpty: true }, (cell, c) => {
      cell.fill = solid(bgArgb);
      cell.border = hairBottom;

      if      (c === 1) { cell.font = { size: 9,  italic: true, color: { argb: P.GREY }, name: 'Calibri' }; }
      else if (c === 2) { cell.font = { size: 10, bold:   true,                           name: 'Calibri' }; cell.alignment = { indent: 0 }; }
      else if (c === 3) { cell.font = { size: 10,                                          name: 'Calibri' }; cell.alignment = { indent: 1, wrapText: false }; }
      else {
        cell.numFmt    = NUM_FMT;
        cell.alignment = { horizontal: 'right' };
        cell.font      = { size: 10, name: 'Calibri' };
      }
    });
  });

  // ── Totals ─────────────────────────────────────────────────
  writeTotalsRow(ws,
    ['', '', 'TOTAL', totals.opening, totals.debit, totals.credit, totals.closing, totals.ytd_net],
    NUM_COL,
  );

  await saveWorkbook(wb, `RR_TrialBalance_${period.replace(/[^a-zA-Z0-9-]/g, '_')}.xlsx`);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT 2 — Oracle Fusion GL Trial Balance
// ─────────────────────────────────────────────────────────────────────────────
export interface FusionTBRow {
  account:         string;
  account_desc:    string;
  opening_balance: number;
  debit:           number;
  credit:          number;
  closing_balance: number;
  [key: string]: string | number; // segment values
}

export interface FusionTBTotals {
  opening: number; debit: number; credit: number; closing: number;
}

export async function exportFusionTBToExcel(opts: {
  ledger:    string;
  company:   string;
  period:    string;
  currency:  string;
  segments:  string[];   // extra segment column labels (already in display order)
  rows:      FusionTBRow[];
  totals:    FusionTBTotals;
  segKeys:   string[];   // matching row property keys for the segment labels
}) {
  const { ledger, company, period, currency, segments, rows, totals, segKeys } = opts;

  const wb = new ExcelJS.Workbook();
  wb.creator  = 'ReERP';
  wb.created  = new Date();
  const ws = wb.addWorksheet(`Fusion TB ${period}`.slice(0, 31));

  const FIXED_HDR  = ['Account', 'Description', ...segments];
  const AMT_HDR    = ['Opening Balance', 'Debit', 'Credit', 'Closing Balance'];
  const HEADERS    = [...FIXED_HDR, ...AMT_HDR];
  const NUM_COL    = FIXED_HDR.length + 1;   // first amount column (1-based)
  const NUM_COLS   = HEADERS.length;

  // Column widths: Account=14, Desc=42, segments=12 each, amounts=18 each
  const COL_WIDTHS = [
    14, 42,
    ...segments.map(() => 12),
    18, 18, 18, 18,
  ];
  COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // ── Header block ───────────────────────────────────────────
  writeHeader(ws, NUM_COLS, 'ORACLE GL TRIAL BALANCE', { ledger, company, period, currency });

  // ── Column headers ─────────────────────────────────────────
  writeColHeaders(ws, 10, HEADERS, NUM_COL);

  // ── Data rows ──────────────────────────────────────────────
  rows.forEach((r, idx) => {
    const bgArgb = idx % 2 === 0 ? P.WHITE : P.EVEN;
    const row = ws.addRow([
      r.account,
      r.account_desc || '',
      ...segKeys.map(k => r[k] || ''),
      r.opening_balance || 0,
      r.debit           || 0,
      r.credit          || 0,
      r.closing_balance || 0,
    ]);
    row.height = 16;

    row.eachCell({ includeEmpty: true }, (cell, c) => {
      cell.fill   = solid(bgArgb);
      cell.border = hairBottom;

      if (c === 1) {
        cell.font      = { bold: true, size: 10, name: 'Calibri' };
        cell.alignment = { indent: 0 };
      } else if (c === 2) {
        cell.font      = { size: 10, name: 'Calibri' };
        cell.alignment = { indent: 1, wrapText: false };
      } else if (c < NUM_COL) {
        cell.font      = { size: 10, name: 'Calibri' };
        cell.alignment = { horizontal: 'center' };
      } else {
        cell.numFmt    = NUM_FMT;
        cell.alignment = { horizontal: 'right' };
        cell.font      = { size: 10, name: 'Calibri' };
      }
    });
  });

  // ── Totals ─────────────────────────────────────────────────
  writeTotalsRow(ws,
    ['', 'TOTAL', ...segKeys.map(() => ''), totals.opening, totals.debit, totals.credit, totals.closing],
    NUM_COL,
  );

  await saveWorkbook(wb, `Fusion_TrialBalance_${period.replace(/[^a-zA-Z0-9-]/g, '_')}.xlsx`);
}
