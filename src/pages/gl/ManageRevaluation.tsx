import React, { useState, useEffect, useCallback } from 'react';
import {
  Layout, Card, Table, Button, Space, Typography, Breadcrumb,
  Input, Row, Col, Spin, Tag, Modal, message, Select, Popconfirm,
  Descriptions, Divider, Alert, Steps,
} from 'antd';
import {
  HomeOutlined,
  ReloadOutlined,
  DeleteOutlined,
  FilePdfOutlined,
  PrinterOutlined,
  RetweetOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  LoadingOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { APEX_DB_CONFIG } from '../../config/api.config';
import { createAccounting, checkAccountingExists, type SlaCreatePayload } from '../../services/sla.service';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const { Content } = Layout;
const { Title, Text } = Typography;

const ORDS_BASE = APEX_DB_CONFIG.baseUrl;

const REDWOOD = {
  primary:       '#C74634',
  success:       '#1D7B4D',
  warning:       '#D4A800',
  info:          '#0572CE',
  surface:       '#FFFFFF',
  surfaceAlt:    '#F7F7F7',
  border:        '#E5E5E5',
  textPrimary:   '#1A1A1A',
  textSecondary: '#6B6B6B',
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface RevalHeader {
  revalueId:     number;
  ledgerId:      number | null;
  ledgerName:    string;
  periodName:    string;
  account:       string;
  accountDesc:   string;
  functionalCcy: string;
  gainAccount:   string;
  lossAccount:   string;
  totalGain:     number;
  totalLoss:     number;
  status:        string;
  glBatchId:     number | null;
  glBatchName:   string | null;
  notes:         string | null;
  createdDate:   string;
  createdBy:     string;
  lineCount:     number;
}

interface RevalCcyRow {
  ccyId:        number;
  currencyCode: string;
  entClosing:   number;
  acctClosing:  number;
  bookRate:     number;
  newRate:      number;
  newAcctValue: number;
  revalAmt:     number;
  isGain:       number;
}

interface RevalLine {
  lineId:      number;
  lineNum:     number;
  combo:       string;
  description: string;
  commentText: string;
  drAmount:    number;
  crAmount:    number;
}

interface RevalDetail extends RevalHeader {
  ccyRows: RevalCcyRow[];
  lines:   RevalLine[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt2 = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function generateRevalPdf(detail: RevalDetail): string {
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pageW = doc.internal.pageSize.getWidth();

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('FX Revaluation', pageW / 2, 18, { align: 'center' });

  // Header info
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const headerLines = [
    [`Period: ${detail.periodName}`, `Account: ${detail.account}`],
    [`Account Desc: ${detail.accountDesc}`, `Functional CCY: ${detail.functionalCcy}`],
    [`Status: ${detail.status}`, `Date: ${detail.createdDate ? detail.createdDate.substring(0, 10) : ''}`],
    [`Created By: ${detail.createdBy}`, `Revalue ID: ${detail.revalueId}`],
  ];
  let y = 26;
  headerLines.forEach(([left, right]) => {
    doc.text(left, 14, y);
    doc.text(right, pageW / 2 + 4, y);
    y += 6;
  });

  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Section 1: Currency Rates', 14, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [['Currency', 'Ent. Balance', 'Acctd Balance', 'Book Rate', 'New Rate', 'New Acctd Value', 'Adjustment']],
    body: detail.ccyRows.map(r => [
      r.currencyCode,
      fmt2(r.entClosing),
      fmt2(r.acctClosing),
      r.bookRate.toFixed(6),
      r.newRate.toFixed(6),
      fmt2(r.newAcctValue),
      fmt2(r.revalAmt),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [7, 114, 206] },
    alternateRowStyles: { fillColor: [247, 247, 247] },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Gain/Loss summary
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Section 2: Gain / Loss Summary', 14, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [['', 'Amount']],
    body: [
      ['Total Gain', fmt2(detail.totalGain)],
      ['Total Loss', fmt2(detail.totalLoss)],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [29, 123, 77] },
    margin: { left: 14, right: 14 },
    tableWidth: 80,
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Journal lines
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Section 3: Journal Preview Lines', 14, y);
  y += 4;

  const totalDr = detail.lines.reduce((s, r) => s + (r.drAmount ?? 0), 0);
  const totalCr = detail.lines.reduce((s, r) => s + (r.crAmount ?? 0), 0);

  autoTable(doc, {
    startY: y,
    head: [['Line#', 'Account Combination', 'Description', 'Comment', 'Debit', 'Credit']],
    body: [
      ...detail.lines.map(r => [
        r.lineNum,
        r.combo,
        r.description,
        r.commentText || '',
        r.drAmount > 0 ? fmt2(r.drAmount) : '',
        r.crAmount > 0 ? fmt2(r.crAmount) : '',
      ]),
      ['', '', '', 'Totals', fmt2(totalDr), fmt2(totalCr)],
    ],
    styles: { fontSize: 7.5 },
    headStyles: { fillColor: [58, 58, 58] },
    alternateRowStyles: { fillColor: [247, 247, 247] },
    margin: { left: 14, right: 14 },
  });

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150);
    doc.text('Generated by ReactERP', pageW / 2, 290, { align: 'center' });
    doc.setTextColor(0);
  }

  return doc.output('bloburl') as unknown as string;
}

// ── Component ─────────────────────────────────────────────────────────────────

const ManageRevaluation: React.FC = () => {
  const [loading,        setLoading]        = useState(false);
  const [data,           setData]           = useState<RevalHeader[]>([]);
  const [statusFilter,   setStatusFilter]   = useState<string>('ALL');
  const [searchText,     setSearchText]     = useState('');
  const [detailLoading,  setDetailLoading]  = useState(false);
  const [detail,         setDetail]         = useState<RevalDetail | null>(null);
  const [detailVisible,  setDetailVisible]  = useState(false);
  const [pdfUrl,         setPdfUrl]         = useState<string | null>(null);
  const [pdfVisible,     setPdfVisible]     = useState(false);
  const [accountingId,   setAccountingId]   = useState<number | null>(null);
  const [accountingLoading, setAccountingLoading] = useState<number | null>(null);
  // SLA accounting flow status modal
  const [acctFlowVisible, setAcctFlowVisible] = useState(false);
  const [acctFlowSteps,   setAcctFlowSteps]   = useState<{ title: string; status: 'wait'|'process'|'finish'|'error'; desc?: string }[]>([]);
  const [acctFlowDone,    setAcctFlowDone]    = useState(false);
  const [acctFlowApiLog,  setAcctFlowApiLog]  = useState<{
    url: string; method: string; payload: any;
    httpStatus: number | null; rawResponse: string;
  } | null>(null);
  const [acctFlowRetrying, setAcctFlowRetrying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${ORDS_BASE}/${APEX_DB_CONFIG.endpoints.revaluation}`);
      const text = await res.text();
      if (!text.trim()) throw new Error('Empty response');
      const json = JSON.parse(text);
      const items: any[] = Array.isArray(json) ? json : (json.items || []);
      setData(items.map((r: any) => ({
        revalueId:     r.revalueId     ?? r.revalue_id,
        ledgerId:      r.ledgerId      ?? r.ledger_id      ?? null,
        ledgerName:    r.ledgerName    ?? r.ledger_name    ?? '',
        periodName:    r.periodName    ?? r.period_name    ?? '',
        account:       r.account       ?? '',
        accountDesc:   r.accountDesc   ?? r.account_desc   ?? '',
        functionalCcy: r.functionalCcy ?? r.functional_ccy ?? '',
        gainAccount:   r.gainAccount   ?? r.gain_account   ?? '',
        lossAccount:   r.lossAccount   ?? r.loss_account   ?? '',
        totalGain:     Number(r.totalGain  ?? r.total_gain  ?? 0),
        totalLoss:     Number(r.totalLoss  ?? r.total_loss  ?? 0),
        status:        r.status        ?? 'DRAFT',
        glBatchId:     r.glBatchId     ?? r.gl_batch_id    ?? null,
        glBatchName:   r.glBatchName   ?? r.gl_batch_name  ?? null,
        notes:         r.notes         ?? null,
        createdDate:   r.createdDate   ?? r.created_date   ?? '',
        createdBy:     r.createdBy     ?? r.created_by     ?? '',
        lineCount:     Number(r.lineCount ?? r.line_count ?? 0),
      })));
    } catch (e) {
      message.error('Failed to load revaluations: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadDetail = async (id: number) => {
    setDetailLoading(true);
    setDetailVisible(true);
    setDetail(null);
    try {
      const res  = await fetch(`${ORDS_BASE}/${APEX_DB_CONFIG.endpoints.revaluation}/${id}`);
      const text = await res.text();
      if (!text.trim()) throw new Error('Empty response');
      const r = JSON.parse(text);
      const mapped: RevalDetail = {
        revalueId:     r.revalueId     ?? r.revalue_id,
        ledgerId:      r.ledgerId      ?? r.ledger_id ?? null,
        ledgerName:    r.ledgerName    ?? r.ledger_name ?? '',
        periodName:    r.periodName    ?? r.period_name ?? '',
        account:       r.account       ?? '',
        accountDesc:   r.accountDesc   ?? r.account_desc ?? '',
        functionalCcy: r.functionalCcy ?? r.functional_ccy ?? '',
        gainAccount:   r.gainAccount   ?? r.gain_account ?? '',
        lossAccount:   r.lossAccount   ?? r.loss_account ?? '',
        totalGain:     Number(r.totalGain  ?? r.total_gain  ?? 0),
        totalLoss:     Number(r.totalLoss  ?? r.total_loss  ?? 0),
        status:        r.status        ?? 'DRAFT',
        glBatchId:     r.glBatchId     ?? r.gl_batch_id ?? null,
        glBatchName:   r.glBatchName   ?? r.gl_batch_name ?? null,
        notes:         r.notes         ?? null,
        createdDate:   r.createdDate   ?? r.created_date ?? '',
        createdBy:     r.createdBy     ?? r.created_by ?? '',
        lineCount:     Number(r.lineCount ?? r.line_count ?? 0),
        ccyRows: (r.ccyRows || r.ccy_rows || []).map((c: any) => ({
          ccyId:        c.ccyId        ?? c.ccy_id,
          currencyCode: c.currencyCode ?? c.currency_code ?? '',
          entClosing:   Number(c.entClosing  ?? c.ent_closing  ?? 0),
          acctClosing:  Number(c.acctClosing ?? c.acct_closing ?? 0),
          bookRate:     Number(c.bookRate    ?? c.book_rate    ?? 0),
          newRate:      Number(c.newRate     ?? c.new_rate     ?? 0),
          newAcctValue: Number(c.newAcctValue ?? c.new_acct_value ?? 0),
          revalAmt:     Number(c.revalAmt    ?? c.reval_amt    ?? 0),
          isGain:       Number(c.isGain      ?? c.is_gain      ?? 0),
        })),
        lines: (r.lines || []).map((l: any) => ({
          lineId:      l.lineId      ?? l.line_id,
          lineNum:     l.lineNum     ?? l.line_num,
          combo:       l.combo       ?? '',
          description: l.description ?? '',
          commentText: l.commentText ?? l.comment_text ?? '',
          drAmount:    Number(l.drAmount ?? l.dr_amount ?? 0),
          crAmount:    Number(l.crAmount ?? l.cr_amount ?? 0),
        })),
      };
      setDetail(mapped);
    } catch (e) {
      message.error('Failed to load detail: ' + (e instanceof Error ? e.message : String(e)));
      setDetailVisible(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleViewPdf = async (id: number) => {
    // Load detail if not already loaded or different record
    let d = detail;
    if (!d || d.revalueId !== id) {
      setDetailLoading(true);
      try {
        const res  = await fetch(`${ORDS_BASE}/${APEX_DB_CONFIG.endpoints.revaluation}/${id}`);
        const text = await res.text();
        const r = JSON.parse(text);
        d = {
          revalueId:     r.revalueId     ?? r.revalue_id,
          ledgerId:      r.ledgerId      ?? r.ledger_id ?? null,
          ledgerName:    r.ledgerName    ?? r.ledger_name ?? '',
          periodName:    r.periodName    ?? r.period_name ?? '',
          account:       r.account       ?? '',
          accountDesc:   r.accountDesc   ?? r.account_desc ?? '',
          functionalCcy: r.functionalCcy ?? r.functional_ccy ?? '',
          gainAccount:   r.gainAccount   ?? r.gain_account ?? '',
          lossAccount:   r.lossAccount   ?? r.loss_account ?? '',
          totalGain:     Number(r.totalGain  ?? r.total_gain  ?? 0),
          totalLoss:     Number(r.totalLoss  ?? r.total_loss  ?? 0),
          status:        r.status ?? 'DRAFT',
          glBatchId:     r.glBatchId ?? r.gl_batch_id ?? null,
          glBatchName:   r.glBatchName ?? r.gl_batch_name ?? null,
          notes:         r.notes ?? null,
          createdDate:   r.createdDate ?? r.created_date ?? '',
          createdBy:     r.createdBy ?? r.created_by ?? '',
          lineCount:     0,
          ccyRows: (r.ccyRows || r.ccy_rows || []).map((c: any) => ({
            ccyId: c.ccyId ?? c.ccy_id,
            currencyCode: c.currencyCode ?? c.currency_code ?? '',
            entClosing:   Number(c.entClosing  ?? c.ent_closing  ?? 0),
            acctClosing:  Number(c.acctClosing ?? c.acct_closing ?? 0),
            bookRate:     Number(c.bookRate    ?? c.book_rate    ?? 0),
            newRate:      Number(c.newRate     ?? c.new_rate     ?? 0),
            newAcctValue: Number(c.newAcctValue ?? c.new_acct_value ?? 0),
            revalAmt:     Number(c.revalAmt    ?? c.reval_amt    ?? 0),
            isGain:       Number(c.isGain      ?? c.is_gain      ?? 0),
          })),
          lines: (r.lines || []).map((l: any) => ({
            lineId:      l.lineId ?? l.line_id,
            lineNum:     l.lineNum ?? l.line_num,
            combo:       l.combo ?? '',
            description: l.description ?? '',
            commentText: l.commentText ?? l.comment_text ?? '',
            drAmount:    Number(l.drAmount ?? l.dr_amount ?? 0),
            crAmount:    Number(l.crAmount ?? l.cr_amount ?? 0),
          })),
        };
      } catch (e) {
        message.error('Failed to load PDF data');
        return;
      } finally {
        setDetailLoading(false);
      }
    }

    try {
      const url = generateRevalPdf(d);
      setPdfUrl(url);
      setPdfVisible(true);
    } catch (e) {
      message.error('Failed to generate PDF: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleCreateAccounting = async (id: number) => {
    // Open the status modal and reset steps
    const initSteps: { title: string; status: 'wait'|'process'|'finish'|'error'; desc?: string }[] = [
      { title: 'Load Detail',        status: 'wait' },
      { title: 'Check SLA Exists',   status: 'wait' },
      { title: 'Write to SLA',       status: 'wait' },
      { title: 'Mark Accounted',     status: 'wait' },
    ];
    setAcctFlowSteps(initSteps);
    setAcctFlowDone(false);
    setAcctFlowApiLog(null);
    setAcctFlowVisible(true);
    setAccountingLoading(id);

    const updateStep = (
      idx: number,
      status: 'wait'|'process'|'finish'|'error',
      desc?: string,
    ) => {
      setAcctFlowSteps(prev => prev.map((s, i) =>
        i === idx ? { ...s, status, desc: desc ?? s.desc } : s
      ));
    };

    try {
      // Step 0 — Load detail
      updateStep(0, 'process');
      let d: RevalDetail | null = detail?.revalueId === id ? detail : null;
      if (!d) {
        const res  = await fetch(`${ORDS_BASE}/${APEX_DB_CONFIG.endpoints.revaluation}/${id}`);
        const text = await res.text();
        if (!text.trim()) throw new Error('Empty response from API');
        const r = JSON.parse(text);
        d = {
          revalueId:     r.revalueId     ?? r.revalue_id,
          ledgerId:      r.ledgerId      ?? r.ledger_id ?? null,
          ledgerName:    r.ledgerName    ?? r.ledger_name ?? '',
          periodName:    r.periodName    ?? r.period_name ?? '',
          account:       r.account       ?? '',
          accountDesc:   r.accountDesc   ?? r.account_desc ?? '',
          functionalCcy: r.functionalCcy ?? r.functional_ccy ?? '',
          gainAccount:   r.gainAccount   ?? r.gain_account ?? '',
          lossAccount:   r.lossAccount   ?? r.loss_account ?? '',
          totalGain:     Number(r.totalGain  ?? r.total_gain  ?? 0),
          totalLoss:     Number(r.totalLoss  ?? r.total_loss  ?? 0),
          status:        r.status        ?? 'DRAFT',
          glBatchId:     r.glBatchId     ?? r.gl_batch_id ?? null,
          glBatchName:   r.glBatchName   ?? r.gl_batch_name ?? null,
          notes:         r.notes         ?? null,
          createdDate:   r.createdDate   ?? r.created_date ?? '',
          createdBy:     r.createdBy     ?? r.created_by ?? '',
          lineCount:     Number(r.lineCount ?? r.line_count ?? 0),
          ccyRows: (r.ccyRows || r.ccy_rows || []).map((c: any) => ({
            ccyId:        c.ccyId        ?? c.ccy_id,
            currencyCode: c.currencyCode ?? c.currency_code ?? '',
            entClosing:   Number(c.entClosing  ?? c.ent_closing  ?? 0),
            acctClosing:  Number(c.acctClosing ?? c.acct_closing ?? 0),
            bookRate:     Number(c.bookRate    ?? c.book_rate    ?? 0),
            newRate:      Number(c.newRate     ?? c.new_rate     ?? 0),
            newAcctValue: Number(c.newAcctValue ?? c.new_acct_value ?? 0),
            revalAmt:     Number(c.revalAmt    ?? c.reval_amt    ?? 0),
            isGain:       Number(c.isGain      ?? c.is_gain      ?? 0),
          })),
          lines: (r.lines || []).map((l: any) => ({
            lineId:      l.lineId      ?? l.line_id,
            lineNum:     l.lineNum     ?? l.line_num,
            combo:       l.combo       ?? '',
            description: l.description ?? '',
            commentText: l.commentText ?? l.comment_text ?? '',
            drAmount:    Number(l.drAmount ?? l.dr_amount ?? 0),
            crAmount:    Number(l.crAmount ?? l.cr_amount ?? 0),
          })),
        };
      }

      if (!d.lines || d.lines.length === 0)
        throw new Error('No journal lines found on this revaluation');

      updateStep(0, 'finish', `${d.lines.length} lines loaded`);

      // Step 1 — Check if SLA accounting already exists
      updateStep(1, 'process');
      const existsRes = await checkAccountingExists('RR_REVALUE_HEADER', id, 'GL_REVALUATION');
      if (existsRes.exists && existsRes.accountingStatus === 'POSTED') {
        updateStep(1, 'error', `Already posted (SLA header ${existsRes.headerId})`);
        throw new Error('SLA accounting already posted for this revaluation');
      }
      updateStep(1, 'finish', existsRes.exists
        ? `Existing DRAFT found (header ${existsRes.headerId}) — will replace`
        : 'No existing SLA entry — creating new');

      // Step 2 — Write to SLA
      updateStep(2, 'process');
      const periodName = d.periodName.replace(/^(?:ReERP|Dynamic|YTD):\s*/, '');
      const currency   = d.functionalCcy || 'AED';
      const createdBy  = d.createdBy || 'SYSTEM';

      // Derive last day of the period (e.g. "Apr-26" → 2026-04-30)
      const periodLastDay = (() => {
        const MONTHS: Record<string, number> = {
          Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5,
          Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11,
        };
        const [mon, yr] = periodName.split('-');
        if (mon && yr && MONTHS[mon] !== undefined) {
          const year = 2000 + parseInt(yr, 10);
          const last = new Date(year, MONTHS[mon] + 1, 0); // day 0 of next month = last day of this month
          return last.toISOString().split('T')[0];
        }
        return new Date().toISOString().split('T')[0]; // fallback to today
      })();

      const slaPayload: SlaCreatePayload = {
        header: {
          moduleName:       'GL',
          sourceTable:      'RR_REVALUE_HEADER',
          sourceId:         id,
          sourceNumber:     `REVAL-${id}`,
          sourceType:       'Revaluation',
          eventTypeCode:    'GL_REVALUATION',
          eventDate:        periodLastDay,
          accountingDate:   periodLastDay,
          periodName,
          ledgerId:         d.ledgerId   || 0,
          ledgerName:       d.ledgerName || '',
          currencyCode:     currency,
          ledgerCurrency:   currency,
          exchangeRate:     1,
          exchangeRateType: 'User',
          description:      `FX Revaluation – ${d.accountDesc || d.account} – ${periodName}`,
          createdBy,
        },
        lines: d.lines.map((l, idx) => ({
          lineNumber:         l.lineNum || idx + 1,
          lineType:           l.drAmount > 0 ? 'DR' : 'CR',
          accountingClass:    'Revaluation',
          accountCombination: l.combo,
          enteredDr:          l.drAmount || 0,
          enteredCr:          l.crAmount || 0,
          accountedDr:        l.drAmount || 0,
          accountedCr:        l.crAmount || 0,
          currencyCode:       currency,
          exchangeRate:       1,
          description:        l.description || `Revaluation – ${d!.account}`,
          sourceLineId:       l.lineId || idx + 1,
          sourceLineNumber:   l.lineNum || idx + 1,
        })),
      };

      const slaResult = await createAccounting(slaPayload);
      updateStep(2, 'finish',
        `SLA header ${slaResult.headerId} created — ${slaResult.lineCount} lines (${slaResult.status})`);

      // Step 3 — Mark revaluation ACCOUNTED
      updateStep(3, 'process');
      const putUrl     = `${ORDS_BASE}/${APEX_DB_CONFIG.endpoints.revaluation}/${id}`;
      const putPayload = {
        status:        'ACCOUNTED',
        gl_batch_id:   0,
        gl_batch_name: `SLA-${slaResult.headerId}`,
        gl_header_id:  slaResult.headerId,
      };
      const putRes  = await fetch(putUrl, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(putPayload),
      });
      const putText = await putRes.text();
      let putData: any = {};
      try { putData = JSON.parse(putText); } catch { /* non-JSON */ }

      setAcctFlowApiLog({
        url: putUrl, method: 'PUT', payload: putPayload,
        httpStatus: putRes.status, rawResponse: putText,
      });

      if (!putRes.ok || putData.status === 'ERROR') {
        updateStep(3, 'error', `HTTP ${putRes.status}${putData.error ? ` — ${putData.error}` : ''}`);
        throw new Error(putData.error || `Status update failed (HTTP ${putRes.status})`);
      }
      updateStep(3, 'finish', 'Status set to ACCOUNTED');
      setAcctFlowDone(true);

      message.success(`Revaluation #${id} written to SLA — push to GL from SLA Journals page`);
      setAccountingId(id);
      load();
      if (detail?.revalueId === id) {
        setDetail({ ...d, status: 'ACCOUNTED', glBatchId: null, glBatchName: `SLA-${slaResult.headerId}` });
      }
    } catch (e) {
      message.error('Accounting failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setAccountingLoading(null);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(
        `${ORDS_BASE}/${APEX_DB_CONFIG.endpoints.revaluation}/${id}`,
        { method: 'DELETE' }
      );
      const text = await res.text();
      const json = JSON.parse(text);
      if (json.status === 'SUCCESS') {
        message.success(`Revaluation #${id} deleted`);
        load();
        if (detail?.revalueId === id) setDetailVisible(false);
      } else {
        throw new Error(json.error || 'Delete failed');
      }
    } catch (e) {
      message.error('Failed to delete: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const filtered = data.filter(r => {
    const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
    const q = searchText.toLowerCase();
    const matchSearch = !q ||
      r.periodName.toLowerCase().includes(q) ||
      r.account.toLowerCase().includes(q) ||
      r.accountDesc.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'ID',
      dataIndex: 'revalueId',
      width: 70,
      sorter: (a: RevalHeader, b: RevalHeader) => a.revalueId - b.revalueId,
    },
    {
      title: 'Period',
      dataIndex: 'periodName',
      width: 110,
      sorter: (a: RevalHeader, b: RevalHeader) => a.periodName.localeCompare(b.periodName),
    },
    {
      title: 'Account',
      dataIndex: 'account',
      width: 120,
    },
    {
      title: 'Account Desc',
      dataIndex: 'accountDesc',
      ellipsis: true,
    },
    {
      title: 'CCY',
      dataIndex: 'functionalCcy',
      width: 70,
    },
    {
      title: 'Total Gain',
      dataIndex: 'totalGain',
      width: 120,
      align: 'right' as const,
      render: (v: number) => (
        <Text style={{ color: REDWOOD.success, fontFamily: 'monospace' }}>{fmt2(v)}</Text>
      ),
      sorter: (a: RevalHeader, b: RevalHeader) => a.totalGain - b.totalGain,
    },
    {
      title: 'Total Loss',
      dataIndex: 'totalLoss',
      width: 120,
      align: 'right' as const,
      render: (v: number) => (
        <Text style={{ color: REDWOOD.primary, fontFamily: 'monospace' }}>{fmt2(v)}</Text>
      ),
      sorter: (a: RevalHeader, b: RevalHeader) => a.totalLoss - b.totalLoss,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (s: string) => (
        <Tag color={s === 'ACCOUNTED' ? 'green' : 'blue'}>{s}</Tag>
      ),
    },
    {
      title: 'Created Date',
      dataIndex: 'createdDate',
      width: 140,
      render: (v: string) => v ? v.substring(0, 10) : '',
      sorter: (a: RevalHeader, b: RevalHeader) => a.createdDate.localeCompare(b.createdDate),
    },
    {
      title: 'Created By',
      dataIndex: 'createdBy',
      width: 110,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_: any, rec: RevalHeader) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => loadDetail(rec.revalueId)}
          >
            View
          </Button>
          <Button
            size="small"
            icon={<PrinterOutlined />}
            onClick={() => handleViewPdf(rec.revalueId)}
          >
            PDF
          </Button>
          {rec.status === 'DRAFT' && (
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              loading={accountingLoading === rec.revalueId}
              onClick={() => handleCreateAccounting(rec.revalueId)}
              style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
            >
              Account
            </Button>
          )}
          <Popconfirm
            title="Delete this revaluation?"
            description="This will also delete all CCY rows and journal lines."
            onConfirm={() => handleDelete(rec.revalueId)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const ccyColumns = [
    { title: 'Currency',       dataIndex: 'currencyCode', width: 80 },
    { title: 'Ent. Balance',   dataIndex: 'entClosing',   width: 120, align: 'right' as const, render: (v: number) => fmt2(v) },
    { title: 'Acctd Balance',  dataIndex: 'acctClosing',  width: 130, align: 'right' as const, render: (v: number) => fmt2(v) },
    { title: 'Book Rate',      dataIndex: 'bookRate',     width: 110, align: 'right' as const, render: (v: number) => v.toFixed(6) },
    { title: 'New Rate',       dataIndex: 'newRate',      width: 110, align: 'right' as const, render: (v: number) => v.toFixed(6) },
    { title: 'New Acctd Value',dataIndex: 'newAcctValue', width: 140, align: 'right' as const, render: (v: number) => fmt2(v) },
    {
      title: 'Adjustment',
      dataIndex: 'revalAmt',
      width: 130,
      align: 'right' as const,
      render: (v: number, r: RevalCcyRow) => (
        <Text style={{ color: r.isGain ? REDWOOD.success : REDWOOD.primary, fontFamily: 'monospace' }}>
          {fmt2(v)}
        </Text>
      ),
    },
    {
      title: 'G/L',
      dataIndex: 'isGain',
      width: 60,
      render: (v: number) => <Tag color={v ? 'green' : 'red'}>{v ? 'Gain' : 'Loss'}</Tag>,
    },
  ];

  const lineColumns = [
    { title: '#',           dataIndex: 'lineNum',     width: 50 },
    { title: 'Combination', dataIndex: 'combo',       ellipsis: true },
    { title: 'Description', dataIndex: 'description', ellipsis: true },
    { title: 'Comment',     dataIndex: 'commentText', ellipsis: true },
    {
      title: 'Debit',
      dataIndex: 'drAmount',
      width: 130,
      align: 'right' as const,
      render: (v: number) => v > 0 ? <Text style={{ fontFamily: 'monospace', color: REDWOOD.success }}>{fmt2(v)}</Text> : '',
    },
    {
      title: 'Credit',
      dataIndex: 'crAmount',
      width: 130,
      align: 'right' as const,
      render: (v: number) => v > 0 ? <Text style={{ fontFamily: 'monospace', color: REDWOOD.primary }}>{fmt2(v)}</Text> : '',
    },
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.surfaceAlt ?? '#F7F7F7' }}>
      <Content>
        {/* Breadcrumb */}
        <div style={{ padding: '12px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.border}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: 'GL' },
            { title: 'Manage FX Revaluation' },
          ]} />
        </div>

        <div style={{ padding: 24 }}>
          {/* Page Title */}
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: `linear-gradient(135deg, #722ed1 0%, #9254de 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(114,46,209,0.3)',
            }}>
              <RetweetOutlined style={{ fontSize: 24, color: '#fff' }} />
            </div>
            <div>
              <Title level={3} style={{ margin: 0 }}>Manage FX Revaluation</Title>
              <Text type="secondary">View, manage, and generate PDFs for saved FX revaluation entries</Text>
            </div>
          </div>

          {/* Filters + actions */}
          <Card style={{ marginBottom: 16, borderRadius: 8 }} bodyStyle={{ padding: '12px 16px' }}>
            <Row gutter={12} align="middle">
              <Col>
                <Input
                  placeholder="Search period or account…"
                  prefix={<SearchOutlined />}
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  allowClear
                  style={{ width: 240 }}
                />
              </Col>
              <Col>
                <Select
                  value={statusFilter}
                  onChange={setStatusFilter}
                  style={{ width: 160 }}
                >
                  <Select.Option value="ALL">All Statuses</Select.Option>
                  <Select.Option value="DRAFT">DRAFT</Select.Option>
                  <Select.Option value="ACCOUNTED">ACCOUNTED</Select.Option>
                </Select>
              </Col>
              <Col flex="auto" />
              <Col>
                <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
                  Refresh
                </Button>
              </Col>
            </Row>
          </Card>

          {/* Main Table */}
          <Card style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
            <Table<RevalHeader>
              loading={loading}
              dataSource={filtered}
              rowKey="revalueId"
              columns={columns}
              size="small"
              scroll={{ x: 1400 }}
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} revaluations` }}
            />
          </Card>
        </div>
      </Content>

      {/* Detail Modal */}
      <Modal
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        title={
          <Space>
            <RetweetOutlined style={{ color: '#722ed1' }} />
            <span>FX Revaluation Detail{detail ? ` — #${detail.revalueId}` : ''}</span>
            {detail && <Tag color={detail.status === 'ACCOUNTED' ? 'green' : 'blue'}>{detail.status}</Tag>}
          </Space>
        }
        width={1000}
        footer={
          <Space>
            {detail && (
              <>
                <Button
                  icon={<PrinterOutlined />}
                  onClick={() => handleViewPdf(detail.revalueId)}
                >
                  View PDF
                </Button>
                {detail.status === 'DRAFT' && (
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    loading={accountingLoading === detail.revalueId}
                    onClick={() => handleCreateAccounting(detail.revalueId)}
                    style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
                  >
                    Create Accounting
                  </Button>
                )}
              </>
            )}
            <Button onClick={() => setDetailVisible(false)}>Close</Button>
          </Space>
        }
        destroyOnClose
      >
        <Spin spinning={detailLoading}>
          {detail && (
            <>
              <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
                <Descriptions.Item label="Period">{detail.periodName}</Descriptions.Item>
                <Descriptions.Item label="Account">{detail.account}</Descriptions.Item>
                <Descriptions.Item label="Account Desc" span={2}>{detail.accountDesc}</Descriptions.Item>
                <Descriptions.Item label="Functional CCY">{detail.functionalCcy}</Descriptions.Item>
                <Descriptions.Item label="Status">
                  <Tag color={detail.status === 'ACCOUNTED' ? 'green' : 'blue'}>{detail.status}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Gain Account">{detail.gainAccount}</Descriptions.Item>
                <Descriptions.Item label="Loss Account">{detail.lossAccount}</Descriptions.Item>
                <Descriptions.Item label="Total Gain">
                  <Text style={{ color: REDWOOD.success, fontWeight: 600 }}>{fmt2(detail.totalGain)}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Total Loss">
                  <Text style={{ color: REDWOOD.primary, fontWeight: 600 }}>{fmt2(detail.totalLoss)}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Ledger">{detail.ledgerName || '—'}</Descriptions.Item>
                <Descriptions.Item label="GL Batch">
                  {detail.glBatchName
                    ? <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{detail.glBatchName}</Text>
                    : <Text type="secondary">—</Text>}
                </Descriptions.Item>
                <Descriptions.Item label="Created Date">{detail.createdDate?.substring(0, 10)}</Descriptions.Item>
                <Descriptions.Item label="Created By">{detail.createdBy}</Descriptions.Item>
                {detail.notes && <Descriptions.Item label="Notes" span={2}>{detail.notes}</Descriptions.Item>}
              </Descriptions>

              <Divider orientation="left" style={{ fontSize: 13 }}>Currency Rates</Divider>
              <Table<RevalCcyRow>
                dataSource={detail.ccyRows}
                columns={ccyColumns}
                rowKey="ccyId"
                size="small"
                pagination={false}
                scroll={{ x: 800 }}
                style={{ marginBottom: 16 }}
              />

              <Divider orientation="left" style={{ fontSize: 13 }}>Journal Lines</Divider>
              <Table<RevalLine>
                dataSource={detail.lines}
                columns={lineColumns}
                rowKey="lineId"
                size="small"
                pagination={false}
                scroll={{ x: 700 }}
                summary={() => {
                  const totalDr = detail.lines.reduce((s, r) => s + r.drAmount, 0);
                  const totalCr = detail.lines.reduce((s, r) => s + r.crAmount, 0);
                  return (
                    <Table.Summary.Row style={{ fontWeight: 700, background: '#fafafa' }}>
                      <Table.Summary.Cell index={0} colSpan={4} align="right">
                        <Text strong>Total</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={4} align="right">
                        <Text strong style={{ fontFamily: 'monospace', color: REDWOOD.success }}>{fmt2(totalDr)}</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={5} align="right">
                        <Text strong style={{ fontFamily: 'monospace', color: REDWOOD.primary }}>{fmt2(totalCr)}</Text>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  );
                }}
              />
            </>
          )}
        </Spin>
      </Modal>

      {/* Accounting Flow Status Modal */}
      <Modal
        open={acctFlowVisible}
        onCancel={() => setAcctFlowVisible(false)}
        title={
          <Space>
            <CheckCircleOutlined style={{ color: REDWOOD.success }} />
            <span>Create Accounting — Progress</span>
          </Space>
        }
        width={700}
        footer={
          <Button
            type={acctFlowDone ? 'primary' : 'default'}
            onClick={() => setAcctFlowVisible(false)}
          >
            {acctFlowDone ? 'Done' : 'Close'}
          </Button>
        }
        destroyOnClose
      >
        <div style={{ padding: '12px 0 4px' }}>
          <Steps
            direction="vertical"
            size="small"
            current={acctFlowSteps.findIndex(s => s.status === 'process' || s.status === 'error')}
            items={acctFlowSteps.map(s => ({
              title: s.title,
              description: s.desc,
              status: s.status,
              icon: s.status === 'process'
                ? <LoadingOutlined />
                : s.status === 'error'
                ? <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                : undefined,
            }))}
          />
          {acctFlowDone && (
            <Alert
              type="success"
              showIcon
              message="SLA accounting created successfully"
              description="Go to SLA Journals to review and push entries to the GL ledger."
              style={{ marginTop: 16 }}
            />
          )}

          {/* API Debug Panel — shown whenever a log exists */}
          {acctFlowApiLog && (
            <div style={{ marginTop: 16, border: '1px solid #d9d9d9', borderRadius: 6, overflow: 'hidden' }}>
              {/* Header row */}
              <div style={{
                background: acctFlowApiLog.httpStatus && acctFlowApiLog.httpStatus < 300 ? '#f6ffed' : '#fff1f0',
                borderBottom: '1px solid #d9d9d9',
                padding: '6px 12px',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Tag color="blue" style={{ fontFamily: 'monospace', margin: 0 }}>PUT</Tag>
                <Text style={{ fontFamily: 'monospace', fontSize: 11, flex: 1, wordBreak: 'break-all' }}>
                  {acctFlowApiLog.url}
                </Text>
                <Tag color={acctFlowApiLog.httpStatus && acctFlowApiLog.httpStatus < 300 ? 'green' : 'red'}>
                  HTTP {acctFlowApiLog.httpStatus ?? '—'}
                </Tag>
              </div>

              {/* Payload */}
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Request Body</Text>
                <pre style={{
                  margin: 0, fontSize: 11, fontFamily: 'monospace',
                  background: '#fafafa', padding: 8, borderRadius: 4,
                  maxHeight: 120, overflowY: 'auto', border: '1px solid #f0f0f0',
                }}>
                  {JSON.stringify(acctFlowApiLog.payload, null, 2)}
                </pre>
              </div>

              {/* Response */}
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Response</Text>
                <pre style={{
                  margin: 0, fontSize: 11, fontFamily: 'monospace',
                  background: '#fafafa', padding: 8, borderRadius: 4,
                  maxHeight: 140, overflowY: 'auto', border: '1px solid #f0f0f0',
                  color: acctFlowApiLog.httpStatus && acctFlowApiLog.httpStatus < 300 ? 'inherit' : '#cf1322',
                }}>
                  {(() => {
                    try { return JSON.stringify(JSON.parse(acctFlowApiLog.rawResponse), null, 2); }
                    catch { return acctFlowApiLog.rawResponse || '(empty)'; }
                  })()}
                </pre>
              </div>

              {/* Test / Retry button */}
              <div style={{ padding: '8px 12px', background: '#fafafa', display: 'flex', gap: 8 }}>
                <Button
                  size="small"
                  loading={acctFlowRetrying}
                  onClick={async () => {
                    if (!acctFlowApiLog) return;
                    setAcctFlowRetrying(true);
                    try {
                      const res = await fetch(acctFlowApiLog.url, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(acctFlowApiLog.payload),
                      });
                      const text = await res.text();
                      setAcctFlowApiLog(prev => prev ? { ...prev, httpStatus: res.status, rawResponse: text } : prev);
                      let parsed: any = {};
                      try { parsed = JSON.parse(text); } catch { /* non-JSON */ }
                      if (res.ok && parsed.status !== 'ERROR') {
                        updateStep(3, 'finish', 'Status set to ACCOUNTED (via retry)');
                        setAcctFlowDone(true);
                        load();
                        message.success('Retry succeeded — revaluation marked ACCOUNTED');
                      } else {
                        message.error(`Retry failed: HTTP ${res.status}${parsed.error ? ` — ${parsed.error}` : ''}`);
                      }
                    } catch (e) {
                      message.error('Retry error: ' + (e instanceof Error ? e.message : String(e)));
                    } finally {
                      setAcctFlowRetrying(false);
                    }
                  }}
                >
                  {acctFlowRetrying ? 'Retrying…' : 'Test / Retry PUT'}
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `URL: ${acctFlowApiLog.url}\n\nPayload:\n${JSON.stringify(acctFlowApiLog.payload, null, 2)}\n\nResponse:\n${acctFlowApiLog.rawResponse}`
                    );
                    message.success('Copied to clipboard');
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
          )}

          {acctFlowSteps.some(s => s.status === 'error') && !acctFlowApiLog && (
            <Alert
              type="error"
              showIcon
              message="Accounting failed — see step above for details"
              style={{ marginTop: 16 }}
            />
          )}
        </div>
      </Modal>

      {/* PDF Modal */}
      <Modal
        open={pdfVisible}
        onCancel={() => { setPdfVisible(false); setPdfUrl(null); }}
        title={<Space><FilePdfOutlined style={{ color: REDWOOD.primary }} /><span>FX Revaluation PDF</span></Space>}
        width="85vw"
        style={{ top: 20 }}
        footer={<Button onClick={() => { setPdfVisible(false); setPdfUrl(null); }}>Close</Button>}
        destroyOnClose
      >
        {pdfUrl && (
          <iframe
            src={pdfUrl}
            style={{ width: '100%', height: '75vh', border: 'none' }}
            title="FX Revaluation PDF"
          />
        )}
      </Modal>
    </Layout>
  );
};

export default ManageRevaluation;
