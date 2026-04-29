import React, { useState, useCallback, useEffect, useRef, Component } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
  Layout, Breadcrumb, Typography, Card, Table, Button, Form, Input, Select,
  DatePicker, InputNumber, Row, Col, Space, Tag, Tooltip, Tabs, Collapse,
  message, Empty, Divider, Badge, Modal, Upload, Alert,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, BankOutlined, PlusOutlined, SearchOutlined, ReloadOutlined,
  EditOutlined, CloseOutlined, DeleteOutlined, UploadOutlined, DownloadOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

const REDWOOD = {
  primary: '#C74634', primaryLight: '#E85D4A',
  success: '#1D7B4D', warning: '#D4A800', info: '#0572CE', error: '#D93025',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral300: '#C7C7C7',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
};

const APEX_BASE = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp';

// ── Types ─────────────────────────────────────────────────────────────────────
interface StatementHeader {
  statementId:        number;
  statementNumber:    string;
  bankAccountNumber:  string;
  bankAccountName:    string;
  statementDate:      string;
  currencyCode:       string;
  openingBalance:     number;
  closingBalance:     number;
  totalCredits:       number;
  totalDebits:        number;
  status:             string;
  businessUnitName:   string;
  description:        string;
  creationDate:       string;
  lastUpdateDate:     string;
}

interface StatementLine {
  _key:               string;   // local-only row key
  lineId?:            number;
  lineNumber?:        number;
  transactionDate:    string;
  valueDate?:         string;
  amount:             number | null;
  transactionCode:    string;   // CR or DR
  categoryCode?:      string;   // from RR_TRANSACTION_CODES
  description?:       string;
  reference?:         string;
  bankTxnReference?:  string;
  counterpartyName?:  string;
  counterpartyAccount?: string;
  reconStatus?:       string;
  reconAmount?:       number;
  reconTxnType?:      string;
  reconTxnNumber?:    string;
  reconNotes?:        string;
  reconDate?:         string;
  reconBy?:           string;
}

interface BankAcctOption { label: string; value: string; bankAccountNumber?: string; currencyCode?: string; legalEntityName?: string; cashAccountCombination?: string; }
interface BUOption       { label: string; value: string; legalEntityName?: string; }
interface TxnCodeOption  { value: string; label: string; endTransaction?: string; defaultAccountCombination?: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────
const parseApexJson = async (res: Response) => {
  const text = await res.text();
  const fixed = text
    .replace(/:(-?)\.(\d)/g, ':$10.$2')
    .replace(/(\d)\.([,}\]])/g, '$1$2');
  return JSON.parse(fixed);
};

const fmtAmount = (v?: number | null, ccy?: string) => {
  if (v == null) return '—';
  const s = new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  return ccy ? `${s} ${ccy}` : s;
};

const fmtDate = (d?: string) => {
  if (!d) return '—';
  try { return dayjs(d).format('D-MMM-YYYY'); } catch { return d; }
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default', SUBMITTED: 'processing', RECONCILING: 'warning',
  RECONCILED: 'success', CLOSED: 'default',
};

const RECON_COLOR: Record<string, string> = {
  UNRECONCILED: 'default', RECONCILED: 'success',
  PARTIALLY_RECONCILED: 'warning', EXCLUDED: 'error',
};

let _keyCounter = 0;
const newKey = () => `row_${++_keyCounter}`;
let _tabCounter = 0;
const newTabKey = () => `tab_${++_tabCounter}`;

// ── CSV Parser ────────────────────────────────────────────────────────────────
function parseCsv(text: string): { rows: Record<string, string>[]; errors: string[] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return { rows: [], errors: ['CSV must have a header row and at least one data row.'] };

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
  const rows: Record<string, string>[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (parts[idx] ?? '').trim(); });
    if (!row.amount && !row.transaction_amount) { errors.push(`Row ${i}: amount is required`); continue; }
    if (!row.transaction_date && !row.date) { errors.push(`Row ${i}: transaction_date is required`); continue; }
    rows.push(row);
  }
  return { rows, errors };
}

function csvRowToLine(row: Record<string, string>): StatementLine {
  const dateStr = row.transaction_date || row.date || '';
  const amount  = parseFloat(row.amount || row.transaction_amount || '0');
  return {
    _key:              newKey(),
    transactionDate:   dateStr,
    valueDate:         row.value_date || row.valuedate || '',
    amount:            isNaN(amount) ? null : amount,
    transactionCode:   (row.transaction_code || row.type || 'CR').toUpperCase(),
    description:       row.description || row.narration || '',
    reference:         row.reference || row.ref || '',
    bankTxnReference:  row.bank_txn_reference || row.bank_ref || '',
    counterpartyName:  row.counterparty_name || row.counterparty || '',
    counterpartyAccount: row.counterparty_account || '',
    reconStatus:       'UNRECONCILED',
  };
}

// ── PDF Parser ────────────────────────────────────────────────────────────────
// Extracts text from all pages, then finds transaction rows by detecting
// the date pattern dd/mm/yyyy at the start of a line.
async function parseBankStatementPdf(file: File): Promise<{ lines: StatementLine[]; errors: string[] }> {
  const errors: string[] = [];
  const lines: StatementLine[] = [];

  // Dynamic import so the page loads even when pdfjs-dist is not yet installed.
  // Run `npm install pdfjs-dist` if you see a "module not found" error here.
  let pdfjsLib: any;
  try {
    pdfjsLib = await import('pdfjs-dist');
    // Use CDN worker matching the installed version — avoids Vite/worker path issues
    const ver: string = pdfjsLib.version;
    const ext = ver.startsWith('3.') || ver.startsWith('2.') ? 'min.js' : 'min.mjs';
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://unpkg.com/pdfjs-dist@${ver}/build/pdf.worker.${ext}`;
  } catch {
    errors.push('pdfjs-dist is not installed. Run: npm install pdfjs-dist');
    return { lines, errors };
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    useSystemFonts: true,
  }).promise;

  // Extract all text items with their x/y positions from all pages
  type TextItem = { str: string; x: number; y: number };
  const allItems: TextItem[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ('str' in item && item.str.trim()) {
        const tx = item.transform;
        allItems.push({ str: item.str.trim(), x: tx[4], y: tx[5] });
      }
    }
  }

  // Group items into rows by similar Y coordinate (within 3px)
  const rowMap = new Map<number, TextItem[]>();
  for (const item of allItems) {
    const key = Math.round(item.y / 3) * 3;
    if (!rowMap.has(key)) rowMap.set(key, []);
    rowMap.get(key)!.push(item);
  }

  // Sort rows top-to-bottom (highest Y first in PDF coords)
  const sortedRows = [...rowMap.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, items]) => items.sort((a, b) => a.x - b.x).map(i => i.str));

  // Date pattern: dd/mm/yyyy
  const dateRe = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const amountRe = /^[\d,]+(\.\d{1,2})?$/;

  for (const row of sortedRows) {
    const first = row[0] ?? '';
    const dm = first.match(dateRe);
    if (!dm) continue; // not a transaction row

    // Parse date
    const txDate = dayjs(`${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`);
    if (!txDate.isValid()) continue;

    // Collect remaining tokens
    const rest = row.slice(1);

    // Identify amount tokens (digits/commas/dots) — last is balance, before that CR or DR
    const amountIdxs = rest
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => amountRe.test(v.replace(/,/g, '')));

    if (amountIdxs.length < 2) {
      errors.push(`Row ${txDate.format('DD/MM/YYYY')}: could not identify amounts`);
      continue;
    }

    // Last amount = balance, second-last = transaction amount
    // Determine DR vs CR: if there's a "Dr"/"CR" token or column position
    // We look at which second-to-last amount column it falls into
    const txAmtIdx = amountIdxs[amountIdxs.length - 2].i;
    const txAmt    = parseFloat(amountIdxs[amountIdxs.length - 2].v.replace(/,/g, ''));

    // Determine if withdrawal (DR) or deposit (CR) based on column position among amounts
    // Typical layout: narration ... [CHQ] [DR_amt | —] [CR_amt | —] [balance]
    // If there are 3 amount groups: [DR, CR, BAL]; if 2: one of DR/CR is missing
    let txCode = 'CR';
    if (amountIdxs.length >= 3) {
      // Second-to-last of all amounts
      const drIdx = amountIdxs[amountIdxs.length - 3].i;
      // If txAmtIdx is same as drIdx → it's a withdrawal (DR)
      txCode = (txAmtIdx === drIdx) ? 'DR' : 'CR';
    } else {
      // Only 2 amounts (txAmt + balance) — look for "Dr" suffix or check narration
      const rowText = rest.join(' ').toUpperCase();
      if (rowText.includes('WITHDRAWAL') || rowText.includes('DEBIT') || rowText.endsWith('DR')) {
        txCode = 'DR';
      }
    }

    // Description = everything between date and first amount token
    const descTokens = rest.slice(0, amountIdxs.length >= 3
      ? amountIdxs[amountIdxs.length - 3].i
      : amountIdxs[0].i);
    const description = descTokens.join(' ');

    // Reference — look for CHQ.NO. style tokens (numeric, short)
    const ref = rest.find(t => /^\d{1,8}$/.test(t) && t !== dm[1]) ?? '';

    lines.push({
      _key:            newKey(),
      transactionDate: txDate.format('YYYY-MM-DD'),
      valueDate:       '',
      amount:          isNaN(txAmt) ? null : txAmt,
      transactionCode: txCode,
      description:     description || first,
      reference:       ref,
      bankTxnReference: '',
      counterpartyName: '',
      counterpartyAccount: '',
      reconStatus:     'UNRECONCILED',
    });
  }

  if (lines.length === 0 && errors.length === 0) {
    errors.push('No transaction rows found. The PDF layout may not match the expected format.');
  }

  return { lines, errors };
}

// ── StatementForm ─────────────────────────────────────────────────────────────
const StatementForm: React.FC<{
  initialHeader?:  Partial<StatementHeader>;
  initialLines?:   StatementLine[];
  bankAccounts:    BankAcctOption[];
  businessUnits:   BUOption[];
  onSave:          () => void;
  onCreated:       (statementId: number) => void;
  onCancel:        () => void;
}> = ({ initialHeader, initialLines, bankAccounts, businessUnits, onSave, onCreated, onCancel }) => {
  const [form]    = Form.useForm();
  const [lines, setLines]       = useState<StatementLine[]>(initialLines ?? []);
  const [saving, setSaving]     = useState(false);
  const [csvModal, setCsvModal] = useState(false);
  const [csvText, setCsvText]   = useState('');
  const [csvPreview, setCsvPreview] = useState<StatementLine[]>([]);
  const [csvErrors, setCsvErrors]   = useState<string[]>([]);
  // PDF import state
  const [pdfModal, setPdfModal]         = useState(false);
  const [pdfParsing, setPdfParsing]     = useState(false);
  const [pdfPreview, setPdfPreview]     = useState<StatementLine[]>([]);
  const [pdfErrors, setPdfErrors]       = useState<string[]>([]);
  const [pdfFileName, setPdfFileName]   = useState('');
  const [selectedBu, setSelectedBu] = useState<string | undefined>(initialHeader?.businessUnitName);
  const [txnCodes, setTxnCodes]         = useState<TxnCodeOption[]>([]);
  const [balanceTick, setBalanceTick]   = useState(0);
  const [apiModal, setApiModal]       = useState(false);
  const [apiPayload, setApiPayload]   = useState('');
  const [apiPosting, setApiPosting]   = useState(false);
  const [apiResponse, setApiResponse] = useState<{ status: number; body: string } | null>(null);
  const fileRef    = useRef<HTMLInputElement>(null);
  const pdfFileRef = useRef<HTMLInputElement>(null);
  const isEdit  = !!initialHeader?.statementId;

  const buildPayload = (hdrValues: any) => ({
    header: {
      statementId:      initialHeader?.statementId,
      statementNumber:  hdrValues.statementNumber,
      bankAccountName:  hdrValues.bankAccountName,
      bankAccountNumber: hdrValues.bankAccountNumber ?? '',
      statementDate:    (hdrValues.statementDate as Dayjs).format('YYYY-MM-DD'),
      currencyCode:     hdrValues.currencyCode ?? '',
      openingBalance:   hdrValues.openingBalance ?? 0,
      closingBalance:   hdrValues.closingBalance ?? 0,
      businessUnitName: hdrValues.businessUnitName ?? '',
      description:      hdrValues.description ?? '',
      status:           hdrValues.status ?? 'DRAFT',
      createdBy:        'ERP_USER',
      lastUpdatedBy:    'ERP_USER',
    },
    lines: lines.map(l => ({
      lineId:              l.lineId,
      transactionDate:     l.transactionDate,
      valueDate:           l.valueDate || null,
      amount:              l.amount,
      transactionCode:     l.transactionCode,
      categoryCode:        l.categoryCode ?? '',
      description:         l.description ?? '',
      reference:           l.reference ?? '',
      bankTxnReference:    l.bankTxnReference ?? '',
      counterpartyName:    l.counterpartyName ?? '',
      counterpartyAccount: l.counterpartyAccount ?? '',
      createdBy:           'ERP_USER',
      lastUpdatedBy:       'ERP_USER',
    })),
  });

  const handleApiOpen = async () => {
    let hdrValues: any;
    try { hdrValues = await form.validateFields(); } catch { return; }
    setApiPayload(JSON.stringify(buildPayload(hdrValues), null, 2));
    setApiResponse(null);
    setApiModal(true);
  };

  const handleApiPost = async () => {
    setApiPosting(true);
    setApiResponse(null);
    try {
      const res = await fetch(`${APEX_BASE}/cash/bankstatements`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: apiPayload,
      });
      const text = await res.text();
      setApiResponse({ status: res.status, body: (() => { try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; } })() });
    } catch (e: any) {
      setApiResponse({ status: 0, body: 'Network error: ' + e.message });
    } finally { setApiPosting(false); }
  };

  // Bank accounts filtered by the legal entity of the selected BU
  const selectedBuLegalEntity = selectedBu
    ? (businessUnits.find(b => b.value === selectedBu)?.legalEntityName ?? '')
    : '';
  const filteredBankAccounts = selectedBu
    ? (selectedBuLegalEntity
        ? bankAccounts.filter(a => a.legalEntityName === selectedBuLegalEntity)
        : bankAccounts)
    : [];

  useEffect(() => {
    if (initialHeader) {
      form.setFieldsValue({
        statementNumber:   initialHeader.statementNumber,
        bankAccountName:   initialHeader.bankAccountName,
        bankAccountNumber: initialHeader.bankAccountNumber,
        statementDate:     initialHeader.statementDate ? dayjs(initialHeader.statementDate) : dayjs(),
        currencyCode:      initialHeader.currencyCode,
        openingBalance:    initialHeader.openingBalance,
        closingBalance:    initialHeader.closingBalance,
        businessUnitName:  initialHeader.businessUnitName,
        description:       initialHeader.description,
        status:            initialHeader.status ?? 'DRAFT',
      });
      if (initialHeader.businessUnitName) setSelectedBu(initialHeader.businessUnitName);
    } else {
      form.setFieldsValue({ statementDate: dayjs(), status: 'DRAFT' });
    }
  }, [initialHeader, form]);

  useEffect(() => {
    if (initialLines) setLines(initialLines);
  }, [initialLines]);

  // Load transaction codes whenever BU changes
  useEffect(() => {
    if (!selectedBu) { setTxnCodes([]); return; }
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${APEX_BASE}/cash/transaction-codes?business_unit=${encodeURIComponent(selectedBu)}`, { signal: ctrl.signal });
        const data = await parseApexJson(res);
        // ORDS lowercases all JSON keys regardless of SQL aliases
        setTxnCodes((data.items || []).map((i: any) => ({
          value: i.transactioncode,
          label: `${i.transactioncode}${i.description ? ' — ' + i.description : ''}`,
          endTransaction: i.endtransaction,
          defaultAccountCombination: i.defaultaccountcombination,
        })));
      } catch { /* ignore abort */ }
    })();
    return () => ctrl.abort();
  }, [selectedBu]);

  const addLine = () => setLines(prev => [...prev, {
    _key: newKey(), transactionDate: dayjs().format('YYYY-MM-DD'),
    amount: null, transactionCode: '', reconStatus: 'UNRECONCILED',
  }]);

  const updateLine = (key: string, field: keyof StatementLine, value: any) =>
    setLines(prev => prev.map(l => l._key === key ? { ...l, [field]: value } : l));

  const deleteLine = async (line: StatementLine) => {
    const recon = line.reconStatus ?? 'UNRECONCILED';
    if (recon === 'RECONCILED' || recon === 'PARTIALLY_RECONCILED') {
      message.warning('Cannot delete a reconciled line.');
      return;
    }
    if (line.lineId) {
      try {
        const res  = await fetch(`${APEX_BASE}/cash/bankstatements/${initialHeader?.statementId}/deleteline`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lineId: line.lineId }),
        });
        const data = await res.json();
        if (data.status === 'error') { message.error(data.message || 'Delete failed.'); return; }
      } catch (e: any) { message.error('Network error: ' + e.message); return; }
    }
    setLines(prev => prev.filter(l => l._key !== line._key));
  };

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      setCsvText(text);
      const { rows, errors } = parseCsv(text);
      setCsvErrors(errors);
      setCsvPreview(rows.map(csvRowToLine));
    };
    reader.readAsText(file);
  };

  const confirmCsvImport = () => {
    setLines(prev => [...prev, ...csvPreview]);
    setCsvModal(false);
    setCsvPreview([]);
    setCsvText('');
    setCsvErrors([]);
    message.success(`${csvPreview.length} lines imported from CSV.`);
  };

  const handlePdfFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfFileName(file.name);
    setPdfPreview([]);
    setPdfErrors([]);
    setPdfParsing(true);
    setPdfModal(true);
    try {
      const { lines: parsed, errors } = await parseBankStatementPdf(file);
      setPdfPreview(parsed);
      setPdfErrors(errors);
    } catch (err: any) {
      setPdfErrors([`Failed to read PDF: ${err.message}`]);
    } finally {
      setPdfParsing(false);
      if (pdfFileRef.current) pdfFileRef.current.value = '';
    }
  };

  const confirmPdfImport = () => {
    setLines(prev => [...prev, ...pdfPreview]);
    setPdfModal(false);
    setPdfPreview([]);
    setPdfErrors([]);
    setPdfFileName('');
    message.success(`${pdfPreview.length} lines imported from PDF.`);
  };

  const handleSave = async () => {
    let hdrValues: any;
    try { hdrValues = await form.validateFields(); } catch { return; }

    setSaving(true);
    try {
      const payload = buildPayload(hdrValues);

      const res  = await fetch(`${APEX_BASE}/cash/bankstatements`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.status === 'success') {
        if (isEdit) {
          message.success('Statement updated.');
          onSave();
        } else {
          message.success('Statement created. You can now add lines.');
          onCreated(data.statementId);
        }
      } else {
        message.error(data.message || 'Save failed.');
      }
    } catch (e: any) {
      message.error('Network error: ' + e.message);
    } finally { setSaving(false); }
  };

  // Line columns — inline editing
  const lineColumns: ColumnsType<StatementLine> = [
    {
      title: '#', width: 50,
      render: (_, __, idx) => <Text style={{ fontSize: 12 }}>{idx + 1}</Text>,
    },
    {
      title: 'Txn Date', width: 130,
      render: (_, r) => (
        <DatePicker size="small" format="D-MMM-YYYY" style={{ width: '100%' }}
          value={r.transactionDate ? dayjs(r.transactionDate) : undefined}
          onChange={d => updateLine(r._key, 'transactionDate', d?.format('YYYY-MM-DD') ?? '')} />
      ),
    },
    {
      title: 'Value Date', width: 130,
      render: (_, r) => (
        <DatePicker size="small" format="D-MMM-YYYY" style={{ width: '100%' }}
          value={r.valueDate ? dayjs(r.valueDate) : undefined}
          onChange={d => updateLine(r._key, 'valueDate', d?.format('YYYY-MM-DD') ?? '')} />
      ),
    },
    {
      title: 'Amount', width: 130,
      render: (_, r) => (
        <InputNumber size="small" style={{ width: '100%' }} precision={2}
          value={r.amount ?? undefined}
          onChange={v => updateLine(r._key, 'amount', v)} />
      ),
    },
    {
      title: 'Type', width: 70,
      render: (_, r) => (
        <Select size="small" style={{ width: '100%' }} value={r.transactionCode}
          onChange={v => updateLine(r._key, 'transactionCode', v)}>
          <Option value="CR">CR</Option>
          <Option value="DR">DR</Option>
        </Select>
      ),
    },
    {
      title: 'Txn Code', width: 160,
      render: (_, r) => (
        <Select
          size="small" style={{ width: '100%' }}
          value={r.categoryCode || undefined}
          placeholder={txnCodes.length ? 'Select' : selectedBu ? 'No codes' : 'Select BU'}
          showSearch optionFilterProp="label"
          options={txnCodes}
          onChange={v => {
            const code = txnCodes.find(c => c.value === v);
            setLines(prev => prev.map(l => l._key === r._key ? {
              ...l,
              categoryCode: v,
              description: l.description || (code?.label?.split(' — ')[1] ?? ''),
            } : l));
          }}
          allowClear
        />
      ),
    },
    {
      title: 'Description',
      render: (_, r) => (
        <Input size="small" value={r.description}
          onChange={e => updateLine(r._key, 'description', e.target.value)} />
      ),
    },
    {
      title: 'Reference', width: 140,
      render: (_, r) => (
        <Input size="small" value={r.reference}
          onChange={e => updateLine(r._key, 'reference', e.target.value)} />
      ),
    },
    {
      title: 'Counterparty', width: 160,
      render: (_, r) => (
        <Input size="small" value={r.counterpartyName}
          onChange={e => updateLine(r._key, 'counterpartyName', e.target.value)} />
      ),
    },
    ...(isEdit ? [{
      title: 'Recon',
      width: 130,
      render: (_: any, r: StatementLine) => (
        <Tag color={RECON_COLOR[r.reconStatus ?? 'UNRECONCILED'] as any} style={{ fontSize: 11 }}>
          {r.reconStatus ?? 'UNRECONCILED'}
        </Tag>
      ),
    }] : []),
    {
      title: '', width: 40, align: 'center' as const,
      render: (_, r) => {
        const isReconciled = r.reconStatus === 'RECONCILED' || r.reconStatus === 'PARTIALLY_RECONCILED';
        return (
          <Tooltip title={isReconciled ? 'Cannot delete a reconciled line' : 'Delete line'}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />}
              disabled={isReconciled}
              onClick={() => deleteLine(r)} />
          </Tooltip>
        );
      },
    },
  ];

  const lc = { span: 8 };
  const wc = { span: 16 };
  const fs = { marginBottom: 12 };

  // Balance check — CR lines add to balance, DR lines reduce it (balanceTick forces re-render on field change)
  void balanceTick;
  const totalCr = lines.filter(l => l.transactionCode === 'CR').reduce((s, l) => s + (l.amount ?? 0), 0);
  const totalDr = lines.filter(l => l.transactionCode === 'DR').reduce((s, l) => s + (l.amount ?? 0), 0);
  const openingBal: number = form.getFieldValue('openingBalance') ?? 0;
  const closingBal: number = form.getFieldValue('closingBalance') ?? 0;
  const calcClosing = openingBal + totalCr - totalDr;
  const difference  = closingBal - calcClosing;

  return (
    <div style={{ padding: '12px 24px' }}>
      <Text style={{ fontSize: 12, color: REDWOOD.neutral600, display: 'block', marginBottom: 14 }}>
        {isEdit ? `Edit Statement — ${initialHeader?.statementNumber}` : 'Create Bank Statement'}
      </Text>

      {/* ── Header ── */}
      <Text strong style={{ fontSize: 13, color: REDWOOD.neutral900, display: 'block', marginBottom: 12 }}>
        Statement Details
      </Text>

      <Form form={form} layout="horizontal" labelCol={lc} wrapperCol={wc}
        onValuesChange={(changed) => {
          if ('openingBalance' in changed || 'closingBalance' in changed) setBalanceTick(t => t + 1);
        }}>
        <Row gutter={40}>
          <Col xs={24} lg={12}>
            <Form.Item label="Business Unit" name="businessUnitName"
              rules={[{ required: true, message: 'Required' }]} style={fs}>
              <Select showSearch placeholder="Select BU" optionFilterProp="label"
                options={businessUnits} allowClear style={{ width: '100%' }}
                disabled={isEdit}
                onChange={(v: string) => {
                  setSelectedBu(v ?? undefined);
                  form.setFieldsValue({ bankAccountName: undefined, bankAccountNumber: undefined, currencyCode: undefined });
                }} />
            </Form.Item>
            <Form.Item label="Bank Account" name="bankAccountName"
              rules={[{ required: true, message: 'Required' }]} style={fs}>
              <Select showSearch placeholder={selectedBu ? 'Select bank account' : 'Select BU first'}
                optionFilterProp="label" options={filteredBankAccounts}
                style={{ width: '100%' }} allowClear
                disabled={isEdit || !selectedBu}
                onChange={(v: string) => {
                  const acct = bankAccounts.find(a => a.value === v);
                  if (acct?.currencyCode)    form.setFieldValue('currencyCode',      acct.currencyCode);
                  if (acct?.bankAccountNumber) form.setFieldValue('bankAccountNumber', acct.bankAccountNumber);
                }} />
            </Form.Item>
            <Form.Item label="Statement Number" name="statementNumber"
              rules={[{ required: true, message: 'Required' }]} style={fs}>
              <Input placeholder="e.g. STMT-2026-001" />
            </Form.Item>
            <Form.Item label="Statement Date" name="statementDate"
              rules={[{ required: true, message: 'Required' }]} style={fs}>
              <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" />
            </Form.Item>
            <Form.Item label="Status" name="status" style={fs}>
              <Select>
                {['DRAFT','SUBMITTED','RECONCILING','RECONCILED','CLOSED'].map(s => (
                  <Option key={s} value={s}>{s}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} lg={12}>
            <Form.Item label="Currency" name="currencyCode" style={fs}>
              <Select placeholder="Select currency" allowClear>
                {['AED','USD','EUR','GBP','SAR','QAR','KWD','BHD','OMR','INR'].map(c => (
                  <Option key={c} value={c}>{c}</Option>
                ))}
              </Select>
            </Form.Item>
            <Row gutter={8}>
              <Col span={12}>
                <Form.Item label="Opening Bal" name="openingBalance" labelCol={{ span: 14 }} wrapperCol={{ span: 10 }} style={fs}>
                  <InputNumber style={{ width: '100%' }} precision={2} placeholder="0.00" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Closing Bal" name="closingBalance" labelCol={{ span: 14 }} wrapperCol={{ span: 10 }} style={fs}>
                  <InputNumber style={{ width: '100%' }} precision={2} placeholder="0.00" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="Description" name="description" style={fs}>
              <Input.TextArea rows={2} placeholder="Optional description" />
            </Form.Item>
          </Col>
        </Row>
      </Form>

      {/* ── Balance Check ── */}
      {lines.length > 0 && (
        <div style={{
          background: difference === 0 ? '#f6ffed' : '#fffbe6',
          border: `1px solid ${difference === 0 ? '#b7eb8f' : '#ffe58f'}`,
          borderRadius: 6, padding: '8px 16px', marginBottom: 8,
        }}>
          <Row gutter={16} align="middle">
            <Col>
              <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Opening</Text>
              <Text strong style={{ fontSize: 12, display: 'block' }}>{fmtAmount(openingBal)}</Text>
            </Col>
            <Col><Text style={{ color: REDWOOD.neutral300 }}>+</Text></Col>
            <Col>
              <Text style={{ fontSize: 12, color: REDWOOD.success }}>Credits (CR)</Text>
              <Text strong style={{ fontSize: 12, display: 'block', color: REDWOOD.success }}>{fmtAmount(totalCr)}</Text>
            </Col>
            <Col><Text style={{ color: REDWOOD.neutral300 }}>−</Text></Col>
            <Col>
              <Text style={{ fontSize: 12, color: REDWOOD.error }}>Debits (DR)</Text>
              <Text strong style={{ fontSize: 12, display: 'block', color: REDWOOD.error }}>{fmtAmount(totalDr)}</Text>
            </Col>
            <Col><Text style={{ color: REDWOOD.neutral300 }}>=</Text></Col>
            <Col>
              <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Calc Closing</Text>
              <Text strong style={{ fontSize: 12, display: 'block' }}>{fmtAmount(calcClosing)}</Text>
            </Col>
            <Col flex="auto" style={{ textAlign: 'right' }}>
              <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Actual Closing</Text>
              <Text strong style={{ fontSize: 12, display: 'block' }}>{fmtAmount(closingBal)}</Text>
            </Col>
            <Col>
              <Text style={{ fontSize: 12 }}>Difference</Text>
              <Text strong style={{
                fontSize: 13, display: 'block',
                color: difference === 0 ? REDWOOD.success : REDWOOD.error,
              }}>
                {fmtAmount(difference)}
              </Text>
            </Col>
          </Row>
        </div>
      )}

      {/* ── Lines ── */}
      <Divider style={{ margin: '8px 0 12px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text strong style={{ fontSize: 13 }}>
          Statement Lines
          {lines.length > 0 && <Tag color="blue" style={{ marginLeft: 8 }}>{lines.length}</Tag>}
        </Text>
        <Space>
          <Button size="small" icon={<UploadOutlined />} onClick={() => setCsvModal(true)}>
            Import CSV
          </Button>
          <Button size="small" icon={<UploadOutlined />}
            style={{ borderColor: '#d46b08', color: '#d46b08' }}
            onClick={() => pdfFileRef.current?.click()}>
            Import PDF
          </Button>
          <input ref={pdfFileRef} type="file" accept=".pdf" style={{ display: 'none' }}
            onChange={handlePdfFile} />
          <Button size="small" icon={<PlusOutlined />} type="primary"
            style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
            onClick={addLine}>
            Add Line
          </Button>
        </Space>
      </div>

      <Table
        dataSource={lines} columns={lineColumns} rowKey="_key"
        size="small" pagination={false}
        scroll={{ x: 1100 }}
        locale={{ emptyText: <Empty description="No lines — add manually or import CSV" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        summary={() => lines.length > 0 ? (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={3}>
              <Text strong style={{ fontSize: 12 }}>Totals</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={3}>
              <Text strong style={{ fontSize: 12, color: REDWOOD.success }}>
                CR: {fmtAmount(totalCr)}
              </Text>
              <br />
              <Text strong style={{ fontSize: 12, color: REDWOOD.error }}>
                DR: {fmtAmount(totalDr)}
              </Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={4} colSpan={isEdit ? 6 : 5} />
          </Table.Summary.Row>
        ) : null}
      />

      <Divider />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button icon={<ApiOutlined />} onClick={handleApiOpen} style={{ color: REDWOOD.info, borderColor: REDWOOD.info }}>
          API
        </Button>
        <Space>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="primary" loading={saving} onClick={handleSave}
            style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>
            {isEdit ? 'Save Changes' : 'Create Statement'}
          </Button>
        </Space>
      </div>

      {/* ── API Inspector Modal ── */}
      <Modal
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /><span>API Inspector — POST /cash/bankstatements</span></Space>}
        open={apiModal}
        onCancel={() => setApiModal(false)}
        width={820}
        footer={null}
        styles={{ body: { padding: '16px 24px' } }}
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          Endpoint: <Text code copyable style={{ fontSize: 12 }}>{APEX_BASE}/cash/bankstatements</Text>
        </Text>

        <Divider style={{ margin: '12px 0 8px' }} />

        <Text strong style={{ fontSize: 13 }}>Request Body (JSON)</Text>
        <pre style={{
          background: '#1e1e2e', color: '#cdd6f4', padding: 16, borderRadius: 6,
          fontSize: 12, overflowX: 'auto', maxHeight: 360, whiteSpace: 'pre-wrap',
          wordBreak: 'break-all', margin: '8px 0 0',
        }}>
          {apiPayload}
        </pre>

        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="primary" icon={<ApiOutlined />} loading={apiPosting} onClick={handleApiPost}
            style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}>
            POST Request
          </Button>
        </div>

        {apiResponse && (
          <>
            <Divider style={{ margin: '16px 0 10px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Text strong>Response</Text>
              <Tag color={apiResponse.status >= 200 && apiResponse.status < 300 ? 'success' : 'error'}>
                HTTP {apiResponse.status || 'Error'}
              </Tag>
            </div>
            <pre style={{
              background: apiResponse.status >= 200 && apiResponse.status < 300 ? '#f6ffed' : '#fff2f0',
              border: `1px solid ${apiResponse.status >= 200 && apiResponse.status < 300 ? '#b7eb8f' : '#ffccc7'}`,
              color: REDWOOD.neutral900, padding: 16, borderRadius: 6,
              fontSize: 12, overflowX: 'auto', maxHeight: 240, whiteSpace: 'pre-wrap',
              wordBreak: 'break-all', margin: 0,
            }}>
              {apiResponse.body}
            </pre>
          </>
        )}
      </Modal>

      {/* ── CSV Import Modal ── */}
      <Modal
        title={<Space><UploadOutlined /><span>Import Lines from CSV</span></Space>}
        open={csvModal} onCancel={() => { setCsvModal(false); setCsvPreview([]); setCsvErrors([]); }}
        width={900}
        footer={[
          <Button key="cancel" onClick={() => { setCsvModal(false); setCsvPreview([]); setCsvErrors([]); }}>
            Cancel
          </Button>,
          <Button key="import" type="primary" disabled={csvPreview.length === 0}
            style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
            onClick={confirmCsvImport}>
            Import {csvPreview.length} Lines
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="info" showIcon
            message="Expected CSV columns (header row required)"
            description="transaction_date, amount, transaction_code (CR/DR), description, reference, value_date, counterparty_name, counterparty_account, bank_txn_reference"
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button icon={<DownloadOutlined />} size="small"
              onClick={() => {
                const csv = 'transaction_date,amount,transaction_code,description,reference,value_date,counterparty_name\n2026-03-28,1500.00,CR,Customer Payment,REF-001,2026-03-28,ABC Company';
                const a = document.createElement('a');
                a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
                a.download = 'bank_statement_template.csv';
                a.click();
              }}>
              Download Template
            </Button>
            <Button icon={<UploadOutlined />} size="small"
              onClick={() => fileRef.current?.click()}>
              Choose CSV File
            </Button>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
              onChange={handleCsvFile} />
            {csvText && <Text type="secondary" style={{ fontSize: 12 }}>File loaded</Text>}
          </div>

          {csvErrors.length > 0 && (
            <Alert type="warning" showIcon message={`${csvErrors.length} parse errors`}
              description={csvErrors.slice(0, 5).join(' | ')} />
          )}

          {csvPreview.length > 0 && (
            <Table
              dataSource={csvPreview} rowKey="_key" size="small"
              pagination={false} scroll={{ y: 280 }}
              columns={[
                { title: 'Date', dataIndex: 'transactionDate', width: 110, render: fmtDate },
                { title: 'Amount', dataIndex: 'amount', width: 110, align: 'right', render: v => fmtAmount(v) },
                { title: 'Type', dataIndex: 'transactionCode', width: 60,
                  render: v => <Tag color={v === 'CR' ? 'green' : 'red'}>{v}</Tag> },
                { title: 'Description', dataIndex: 'description', ellipsis: true },
                { title: 'Reference', dataIndex: 'reference', width: 120, ellipsis: true },
                { title: 'Counterparty', dataIndex: 'counterpartyName', ellipsis: true },
              ]}
            />
          )}
        </Space>
      </Modal>

      {/* PDF Import Modal */}
      <Modal
        title={<Space><UploadOutlined style={{ color: '#d46b08' }} /><span>Import Lines from PDF</span></Space>}
        open={pdfModal}
        onCancel={() => { setPdfModal(false); setPdfPreview([]); setPdfErrors([]); setPdfFileName(''); }}
        width={900}
        footer={[
          <Button key="cancel" onClick={() => { setPdfModal(false); setPdfPreview([]); setPdfErrors([]); setPdfFileName(''); }}>
            Cancel
          </Button>,
          <Button key="import" type="primary"
            disabled={pdfPreview.length === 0}
            style={{ background: '#d46b08', borderColor: '#d46b08' }}
            onClick={confirmPdfImport}>
            Add {pdfPreview.length} Lines to Statement
          </Button>,
        ]}
      >
        {pdfFileName && (
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
            File: <strong>{pdfFileName}</strong>
          </Text>
        )}
        {pdfParsing && (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Text type="secondary">Reading PDF...</Text>
          </div>
        )}
        {!pdfParsing && pdfErrors.length > 0 && (
          <Alert type="warning" showIcon style={{ marginBottom: 8 }}
            message={`${pdfErrors.length} warning(s)`}
            description={pdfErrors.slice(0, 5).join(' | ')} />
        )}
        {!pdfParsing && pdfPreview.length === 0 && pdfErrors.length > 0 && (
          <Empty description="No transactions could be parsed from this PDF." />
        )}
        {!pdfParsing && pdfPreview.length > 0 && (
          <>
            <Alert type="success" showIcon style={{ marginBottom: 8 }}
              message={`${pdfPreview.length} transactions found — review below then click Add to import`} />
            <Table
              dataSource={pdfPreview} rowKey="_key" size="small" pagination={false}
              scroll={{ y: 400, x: 800 }}
              columns={[
                { title: 'Date', dataIndex: 'transactionDate', width: 110,
                  render: (v: string) => <Text style={{ fontSize: 11 }}>{v ? dayjs(v).format('D-MMM-YYYY') : '—'}</Text> },
                { title: 'Description', dataIndex: 'description', ellipsis: true,
                  render: (v: string) => <Tooltip title={v}><Text style={{ fontSize: 11 }}>{v || '—'}</Text></Tooltip> },
                { title: 'Ref', dataIndex: 'reference', width: 80,
                  render: (v: string) => <Text style={{ fontSize: 11 }}>{v || '—'}</Text> },
                { title: 'Type', dataIndex: 'transactionCode', width: 60,
                  render: (v: string) => <Tag color={v === 'CR' ? 'green' : 'red'} style={{ fontSize: 10 }}>{v}</Tag> },
                { title: 'Amount', dataIndex: 'amount', width: 120, align: 'right',
                  render: (v: number, r: StatementLine) => (
                    <Text style={{ fontSize: 11, color: r.transactionCode === 'CR' ? '#1D7B4D' : '#C74634' }}>
                      {v != null ? v.toLocaleString('en-AE', { minimumFractionDigits: 2 }) : '—'}
                    </Text>
                  )},
              ]}
              summary={() => {
                const cr = pdfPreview.filter(r => r.transactionCode === 'CR').reduce((s, r) => s + (r.amount ?? 0), 0);
                const dr = pdfPreview.filter(r => r.transactionCode === 'DR').reduce((s, r) => s + (r.amount ?? 0), 0);
                return (
                  <Table.Summary fixed>
                    <Table.Summary.Row style={{ background: '#fafafa' }}>
                      <Table.Summary.Cell index={0} colSpan={2}>
                        <Text strong style={{ fontSize: 11 }}>Total</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={2} colSpan={2} />
                      <Table.Summary.Cell index={4} align="right">
                        <Text strong style={{ fontSize: 11 }}>
                          CR: {cr.toLocaleString('en-AE', { minimumFractionDigits: 2 })} |{' '}
                          DR: {dr.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                        </Text>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  </Table.Summary>
                );
              }}
            />
          </>
        )}
      </Modal>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const ManageBankStatements: React.FC<{ module?: 'ap' | 'cash' }> = ({ module = 'cash' }) => {
  const [statements, setStatements] = useState<StatementHeader[]>([]);
  const [loading, setLoading]       = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAcctOption[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BUOption[]>([]);
  const [searchOpen, setSearchOpen] = useState(true);
  const [activeTabKey, setActiveTabKey] = useState('search');
  const [tabs, setTabs] = useState<{
    key: string; label: string;
    header?: StatementHeader; lines?: StatementLine[];
  }[]>([]);
  const [searchForm] = Form.useForm();
  const modulePrefix = module === 'ap' ? '/ap' : '/cash';
  const [searchSelectedBu, setSearchSelectedBu] = useState<string | undefined>();

  // Search screen bank accounts filtered by legal entity of selected BU
  const searchBuLegalEntity = searchSelectedBu
    ? (businessUnits.find(b => b.value === searchSelectedBu)?.legalEntityName ?? '')
    : '';
  const searchFilteredAccounts = searchSelectedBu
    ? (searchBuLegalEntity
        ? bankAccounts.filter(a => a.legalEntityName === searchBuLegalEntity)
        : bankAccounts)
    : bankAccounts;

  // Load LOVs
  const loadLovs = useCallback(async () => {
    try {
      // BUs — include legal_entity_name for bank account filtering
      const buRes  = await fetch(`${APEX_BASE}/gl/businessunits`);
      const buData = await buRes.json();
      const buOptions: BUOption[] = (buData?.items ?? [])
        .map((i: any) => ({
          label:           i.business_unit_name || '',
          value:           i.business_unit_name || '',
          legalEntityName: i.legal_entity_name  || '',
        }))
        .filter((o: BUOption) => o.value)
        .sort((a: BUOption, b: BUOption) => a.label.localeCompare(b.label));
      setBusinessUnits(buOptions);
    } catch { /* silent */ }

    try {
      // Bank accounts from dedicated endpoint — has legalEntityName for filtering
      const res  = await fetch(`${APEX_BASE}/banks/bankaccounts`);
      const data = await res.json();
      const items: any[] = data?.items ?? [];
      const accts: BankAcctOption[] = items
        .filter((i: any) => i.bankAccountName || i.bank_account_name)
        .map((i: any) => ({
          label:                  i.bankAccountName   || i.bank_account_name   || '',
          value:                  i.bankAccountName   || i.bank_account_name   || '',
          bankAccountNumber:      i.bankAccountNumber || i.bank_account_number || '',
          currencyCode:           i.currencyCode      || i.currency_code       || '',
          legalEntityName:        i.legalEntityName   || i.legal_entity_name   || '',
          cashAccountCombination: i.cashAccountCombination || i.cash_account_combination || '',
        }))
        .sort((a: BankAcctOption, b: BankAcctOption) => a.label.localeCompare(b.label));
      setBankAccounts(accts);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadLovs(); }, [loadLovs]);

  // Search
  const handleSearch = useCallback(async () => {
    const v = searchForm.getFieldsValue();
    const p = new URLSearchParams();
    if (v.businessUnit)    p.set('business_unit',    v.businessUnit);
    if (v.bankAccount)     p.set('bank_account',     v.bankAccount);
    if (v.statementNumber) p.set('statement_number', v.statementNumber);
    if (v.status)          p.set('status',           v.status);
    if (v.dateFrom)        p.set('date_from', (v.dateFrom as Dayjs).format('YYYY-MM-DD'));
    if (v.dateTo)          p.set('date_to',   (v.dateTo   as Dayjs).format('YYYY-MM-DD'));
    p.set('row_limit', '500');

    setLoading(true); setHasSearched(true);
    try {
      const res  = await fetch(`${APEX_BASE}/cash/bankstatements?${p.toString()}`);
      const data = await parseApexJson(res);
      if (data.status === 'success') {
        setStatements(data.items ?? []);
        if (!(data.items ?? []).length) message.info('No statements found.');
      } else { message.error(data.message || 'Search failed.'); }
    } catch (e: any) { message.error('Network error: ' + e.message); }
    finally { setLoading(false); }
  }, [searchForm]);

  const handleReset = () => { searchForm.resetFields(); setStatements([]); setHasSearched(false); setSearchSelectedBu(undefined); };

  // Open edit tab — load full statement with lines
  const openEditTab = async (record: StatementHeader) => {
    const existing = tabs.find(t => t.header?.statementId === record.statementId);
    if (existing) { setActiveTabKey(existing.key); return; }
    try {
      const res  = await fetch(`${APEX_BASE}/cash/bankstatements/${record.statementId}`);
      const data = await parseApexJson(res);
      const lines: StatementLine[] = (data.lines ?? []).map((l: any) => ({ ...l, _key: newKey() }));
      const key = newTabKey();
      setTabs(prev => [...prev, { key, label: record.statementNumber, header: record, lines }]);
      setActiveTabKey(key);
    } catch (e: any) { message.error('Failed to load statement: ' + e.message); }
  };

  const openCreateTab = () => {
    const key = newTabKey();
    setTabs(prev => [...prev, { key, label: 'New Statement' }]);
    setActiveTabKey(key);
  };

  const closeTab = (key: string) => {
    setTabs(prev => prev.filter(t => t.key !== key));
    if (activeTabKey === key) setActiveTabKey('search');
  };

  // After creating a new statement, reload the same tab as edit so lines can be added immediately
  const reloadTabAsEdit = async (tabKey: string, statementId: number) => {
    try {
      const res  = await fetch(`${APEX_BASE}/cash/bankstatements/${statementId}`);
      const data = await parseApexJson(res);
      const header: StatementHeader = data.header ?? data;
      const lines: StatementLine[]  = (data.lines ?? []).map((l: any) => ({ ...l, _key: newKey() }));
      setTabs(prev => prev.map(t =>
        t.key === tabKey
          ? { ...t, label: header.statementNumber ?? `Stmt #${statementId}`, header, lines }
          : t
      ));
      if (hasSearched) handleSearch();
    } catch { message.warning('Statement saved. Refresh the page to continue editing.'); }
  };

  // Table columns
  const columns: ColumnsType<StatementHeader> = [
    { title: 'Business Unit', dataIndex: 'businessUnitName', width: 180, ellipsis: true,
      render: v => <Tooltip title={v}><Text style={{ fontSize: 12 }}>{v || '—'}</Text></Tooltip> },
    { title: 'Bank Account', dataIndex: 'bankAccountName', ellipsis: true,
      render: v => <Tooltip title={v}><Text style={{ fontSize: 12 }}>{v || '—'}</Text></Tooltip> },
    {
      title: 'Statement #', dataIndex: 'statementNumber', width: 150,
      render: (v, r) => (
        <Button type="link" size="small" style={{ padding: 0, color: REDWOOD.info }}
          onClick={() => openEditTab(r)}>{v}</Button>
      ),
    },
    { title: 'Date', dataIndex: 'statementDate', width: 110, render: fmtDate },
    { title: 'CCY', dataIndex: 'currencyCode', width: 60,
      render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Opening Bal', dataIndex: 'openingBalance', width: 130, align: 'right',
      render: (v, r) => <Text style={{ fontSize: 12 }}>{fmtAmount(v, r.currencyCode)}</Text> },
    { title: 'Closing Bal', dataIndex: 'closingBalance', width: 130, align: 'right',
      render: (v, r) => <Text style={{ fontSize: 12 }}>{fmtAmount(v, r.currencyCode)}</Text> },
    { title: 'Credits', dataIndex: 'totalCredits', width: 120, align: 'right',
      render: (v, r) => <Text style={{ fontSize: 12, color: REDWOOD.success }}>{fmtAmount(v, r.currencyCode)}</Text> },
    { title: 'Debits', dataIndex: 'totalDebits', width: 120, align: 'right',
      render: (v, r) => <Text style={{ fontSize: 12, color: REDWOOD.error }}>{fmtAmount(v, r.currencyCode)}</Text> },
    {
      title: 'Status', dataIndex: 'status', width: 120,
      render: v => <Tag color={STATUS_COLOR[v] ?? 'default'} style={{ fontSize: 11 }}>{v}</Tag>,
    },
    {
      title: '', key: 'actions', width: 60, align: 'center',
      render: (_, r) => <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditTab(r)} />,
    },
  ];

  const searchPane = (
    <div style={{ padding: '16px 0' }}>
      <Collapse
        activeKey={searchOpen ? ['s'] : []}
        onChange={(k: string | string[]) => setSearchOpen((Array.isArray(k) ? k : [k]).includes('s'))}
        style={{ marginBottom: 16, borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, background: REDWOOD.surface }}
        items={[{
          key: 's',
          label: <Text strong style={{ fontSize: 13 }}>Search</Text>,
          extra: (
            <Space size={8} onClick={e => e.stopPropagation()}>
              <Button size="small" icon={<ReloadOutlined />}
                onClick={e => { e.stopPropagation(); handleReset(); }}>Reset</Button>
              <Button size="small" type="primary" icon={<SearchOutlined />} loading={loading}
                onClick={e => { e.stopPropagation(); handleSearch(); }}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>
                Search
              </Button>
            </Space>
          ),
          children: (
            <Form form={searchForm} layout="horizontal" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }}>
              <Row gutter={[24, 4]}>
                <Col xs={24} md={12}>
                  <Form.Item label="Business Unit" name="businessUnit" style={{ marginBottom: 10 }}>
                    <Select showSearch placeholder="Select BU" optionFilterProp="label"
                      options={businessUnits} allowClear style={{ width: '100%' }}
                      onChange={(v: string | undefined) => {
                        setSearchSelectedBu(v ?? undefined);
                        searchForm.setFieldValue('bankAccount', undefined);
                      }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label="Date From" name="dateFrom" style={{ marginBottom: 10 }}>
                    <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label="Bank Account" name="bankAccount" style={{ marginBottom: 10 }}>
                    <Select showSearch
                      placeholder={searchSelectedBu ? 'Select bank account' : 'Select account'}
                      optionFilterProp="label"
                      options={searchFilteredAccounts} allowClear style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label="Date To" name="dateTo" style={{ marginBottom: 10 }}>
                    <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label="Statement #" name="statementNumber" style={{ marginBottom: 10 }}>
                    <Input placeholder="Statement number" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label="Status" name="status" style={{ marginBottom: 10 }}>
                    <Select placeholder="Any status" allowClear>
                      {['DRAFT','SUBMITTED','RECONCILING','RECONCILED','CLOSED'].map(s => (
                        <Option key={s} value={s}>{s}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          ),
        }]}
      />

      {hasSearched && (
        <Card style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
          styles={{ body: { padding: 0 } }}
          title={
            <Text strong>
              Results {statements.length > 0 && <Tag color="blue">{statements.length}</Tag>}
            </Text>
          }
        >
          <Table
            dataSource={statements} columns={columns} rowKey="statementId"
            loading={loading} size="small"
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} statements` }}
            locale={{ emptyText: <Empty description="No statements found" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            scroll={{ x: 1200 }}
          />
        </Card>
      )}
    </div>
  );

  const tabItems = [
    { key: 'search', label: <span><SearchOutlined /> Search</span>, children: searchPane, closable: false },
    ...tabs.map(t => ({
      key: t.key,
      closable: false,
      label: (
        <span>
          {t.header ? <EditOutlined style={{ marginRight: 4 }} /> : <PlusOutlined style={{ marginRight: 4 }} />}
          {t.label}
          <CloseOutlined style={{ marginLeft: 8, fontSize: 10 }}
            onClick={e => { e.stopPropagation(); closeTab(t.key); }} />
        </span>
      ),
      children: (
        <StatementForm
          initialHeader={t.header}
          initialLines={t.lines}
          bankAccounts={bankAccounts}
          businessUnits={businessUnits}
          onSave={() => reloadTabAsEdit(t.key, t.header!.statementId!)}
          onCreated={(stmtId) => reloadTabAsEdit(t.key, stmtId)}
          onCancel={() => closeTab(t.key)}
        />
      ),
    })),
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        <div style={{ padding: '14px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to={modulePrefix}>{module === 'ap' ? 'Payables' : 'Cash Management'}</Link> },
            { title: 'Manage Bank Statements' },
          ]} />
        </div>

        <div style={{ padding: '0 24px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <BankOutlined style={{ fontSize: 22, color: REDWOOD.info }} />
              <Title level={4} style={{ margin: 0, color: REDWOOD.neutral900 }}>Manage Bank Statements</Title>
            </div>
            <Button icon={<PlusOutlined />} type="primary"
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
              onClick={openCreateTab}>
              Create Statement
            </Button>
          </div>

          <Tabs type="card" activeKey={activeTabKey} onChange={setActiveTabKey}
            items={tabItems} style={{ marginTop: 8 }} />
        </div>
      </Content>
    </Layout>
  );
};

// ── Error Boundary ────────────────────────────────────────────────────────────
class StatementsErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ManageBankStatements] render error:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24 }}>
          <div style={{ background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 8, padding: 16 }}>
            <strong style={{ color: '#cf1322' }}>Page Error</strong>
            <pre style={{ marginTop: 8, fontSize: 12, color: '#333', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {this.state.error.message}
              {'\n\n'}
              {this.state.error.stack}
            </pre>
            <button onClick={() => this.setState({ error: null })} style={{ marginTop: 8 }}>
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const ManageBankStatementsWithBoundary: React.FC<{ module?: 'ap' | 'cash' }> = (props) => (
  <StatementsErrorBoundary>
    <ManageBankStatements {...props} />
  </StatementsErrorBoundary>
);

export default ManageBankStatementsWithBoundary;
