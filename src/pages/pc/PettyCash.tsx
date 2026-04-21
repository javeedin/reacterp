import React, { useState, useEffect, useCallback } from 'react';
import {
  Layout, Card, Typography, Breadcrumb, Tabs, Form, Input, Select,
  DatePicker, Button, Table, Tag, Row, Col, Space, Divider,
  Modal, InputNumber, message, Tooltip, Statistic, Collapse, Progress, Descriptions, Upload,
  Spin, Alert, Switch,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import {
  HomeOutlined, WalletOutlined, PlusOutlined, SearchOutlined,
  ReloadOutlined, EditOutlined, DeleteOutlined, CloseOutlined,
  DollarOutlined, MinusCircleOutlined, ArrowUpOutlined, ArrowDownOutlined,
  DownloadOutlined, RollbackOutlined, BankOutlined,
  LockOutlined, UnlockOutlined, UserOutlined, FieldNumberOutlined, ApiOutlined,
  SwapOutlined, UploadOutlined, PaperClipOutlined, EyeOutlined,
  BookOutlined, CheckCircleOutlined, SyncOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import FloatingMenu from '../../components/FloatingMenu';
import ApiDocsModal, { type ApiEndpoint } from '../../components/ApiDocsModal';
import AccountSelector, { validateAccountCode } from '../../components/AccountSelector';
import { useAuth } from '../../context/AuthContext';
import { APEX_DB_CONFIG } from '../../config/api.config';
import {
  searchRegisters, getRegister, createRegister, updateRegister, deleteRegister,
  getTransactions, getTransaction, createTransaction, updateTransaction, updateTransactionStatus, deleteTransaction,
  getTransactionAttachment, getOpenAPPeriods,
  type PCRegister, type PCTransaction, type APPeriod,
} from '../../services/pc.service';
import {
  searchCombinations,
  type DistCombination,
} from '../../services/distCombinations.service';
import {
  getAccounting, createAccounting, fetchLedgerByBusinessUnit, derivePeriodName,
  buildPcTxnSlaPayload,
  type SlaGetResult,
} from '../../services/sla.service';

const { Content } = Layout;
const { Text, Title } = Typography;
const { Option } = Select;

const REDWOOD = {
  primary: '#C74634', primaryLight: '#E85D4A',
  success: '#1D7B4D', warning: '#D4A800', info: '#0572CE',
  error: '#C74634', neutral100: '#F7F7F7', neutral200: '#E5E5E5',
  neutral300: '#C7C7C7', neutral600: '#6B6B6B', neutral900: '#1A1A1A',
  surface: '#FFFFFF',
};

const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface RegisterTab {
  key: string;
  register: PCRegister;
  transactions: PCTransaction[];
  txnLoading: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status tag helper
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default', ACTIVE: 'green', INACTIVE: 'orange', CLOSED: 'red',
};
const StatusTag: React.FC<{ status: string }> = ({ status }) => (
  <Tag color={STATUS_COLOR[status] ?? 'default'} style={{ fontSize: 11 }}>
    {status}
  </Tag>
);

const PostingTag: React.FC<{ status: string }> = ({ status }) => {
  const color = status === 'Posted' ? 'green' : status === 'Error' ? 'red' : 'default';
  return <Tag color={color} style={{ fontSize: 11 }}>{status}</Tag>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Accounting progress row
// ─────────────────────────────────────────────────────────────────────────────
interface AcctProgressRow {
  txnId:           number;
  lineNumber:      number;
  transactionType: string;
  expenseType:     string | null;
  amount:          number;
  currency:        string;
  accountingDate:  string;
  periodName:      string;
  drAccount:       string;
  drAccountDesc:   string;
  crAccount:       string;
  crAccountDesc:   string;
  status:          'pending' | 'running' | 'success' | 'error' | 'skipped';
  message?:        string;
  headerId?:       number;
}

// Convert Oracle DD-MON-YYYY or any ISO-ish string to YYYY-MM-DD
const MON_MAP: Record<string, string> = {
  JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',
  JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12',
};
function toIsoDate(s: string | null | undefined): string {
  if (!s) return '';
  const ddMon = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (ddMon) return `${ddMon[3]}-${MON_MAP[ddMon[2].toUpperCase()] ?? '01'}-${ddMon[1].padStart(2,'0')}`;
  return s.slice(0, 10); // already ISO or truncate
}

interface ApiDebugItem {
  label:     string;
  url:       string;
  body:      unknown;
  response?: unknown;
  loading?:  boolean;
  error?:    string;
}

interface ExpenseLine {
  key:              string;
  expenseType:      string;
  amount:           number | null;
  description:      string;
  chargeAccountDesc: string;
  chargeAccountCcid: number | null;
  acctDesc:         string;
}
let _lineSeq = 0;
const makeNewLine = (): ExpenseLine => ({
  key: String(++_lineSeq), expenseType: '', amount: null,
  description: '', chargeAccountDesc: '', chargeAccountCcid: null, acctDesc: '',
});

// ─────────────────────────────────────────────────────────────────────────────
// Excel export
// ─────────────────────────────────────────────────────────────────────────────
const solid = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const numFmt = '#,##0.00;[Red](#,##0.00)';

async function exportRegisterToExcel(register: PCRegister, transactions: PCTransaction[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator  = 'ReactERP';
  wb.created  = new Date();
  const ws = wb.addWorksheet('Petty Cash Register', { views: [{ showGridLines: false }] });

  // ── column widths ──────────────────────────────────────────
  ws.columns = [
    { width: 6  }, // A  #
    { width: 14 }, // B  Date
    { width: 18 }, // C  Type
    { width: 20 }, // D  Expense Type
    { width: 10 }, // E  Currency
    { width: 16 }, // F  Debit
    { width: 16 }, // G  Credit
    { width: 16 }, // H  Balance
    { width: 26 }, // I  Charge Account
    { width: 14 }, // J  Acct Date
    { width: 12 }, // K  Posting
    { width: 20 }, // L  Reference
    { width: 30 }, // M  Comments
    { width: 22 }, // N  Created By
  ];

  // ── Title row ──────────────────────────────────────────────
  ws.mergeCells('A1:N1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'Petty Cash Register — Export';
  titleCell.font  = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  titleCell.fill  = solid('FFC74634');
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 32;

  // ── Register header section ─────────────────────────────────
  const hdr: [string, string | number][] = [
    ['Register Name',   register.registerName],
    ['Business Unit',   register.businessUnit || '—'],
    ['Register ID',     register.registerId],
    ['Status',          register.status],
    ['Currency',        register.currency],
    ['Start Date',      register.startDate || '—'],
    ['End Date',        register.endDate   || '—'],
    ['Cash Account',    register.cashAccountDesc || '—'],
    ['Balance',         register.balance],
    ['Total In (Debit)',register.totalDebit],
    ['Total Out (Credit)', register.totalCredit],
    ['Export Date',     new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })],
  ];

  let r = 2;
  for (const [label, val] of hdr) {
    ws.mergeCells(`C${r}:F${r}`);
    ws.mergeCells(`G${r}:N${r}`);
    const lbl = ws.getCell(`C${r}`);
    lbl.value = label;
    lbl.font  = { bold: true, size: 11, color: { argb: 'FF1A3C5E' } };
    lbl.fill  = solid('FFF0F4FA');
    lbl.alignment = { horizontal: 'right', vertical: 'middle' };
    lbl.border = { bottom: { style: 'hair', color: { argb: 'FFE5E5E5' } } };

    const val_cell = ws.getCell(`G${r}`);
    val_cell.value = val;
    val_cell.font  = { size: 11 };
    val_cell.fill  = solid('FFFFFFFF');
    val_cell.alignment = { horizontal: 'left', vertical: 'middle' };
    val_cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E5E5' } } };
    if (typeof val === 'number') val_cell.numFmt = numFmt;
    ws.getRow(r).height = 18;
    r++;
  }

  r++; // blank spacer

  // ── Transactions header row ────────────────────────────────
  const COLS = ['#','Date','Type','Expense Type','Currency','Debit','Credit','Balance',
                'Charge Account','Acct Date','Posting','Reference','Comments','Created By'];
  const hdrRow = ws.getRow(r);
  COLS.forEach((h, i) => {
    const cell = hdrRow.getCell(i + 1);
    cell.value = h;
    cell.font  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill  = solid('FF1A3C5E');
    cell.alignment = { horizontal: i >= 5 && i <= 7 ? 'right' : 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF2E6DA4' } } };
  });
  hdrRow.height = 22;
  r++;

  // ── Transaction rows ───────────────────────────────────────
  const startDataRow = r;
  for (const txn of transactions) {
    const isRefill = txn.transactionType === 'Balance Refill';
    const rowBg    = isRefill ? 'FFF0FFF4' : 'FFFFFFFF';
    const rowData  = ws.getRow(r);

    const vals: (string | number | null)[] = [
      txn.lineNumber, txn.transactionDate, txn.transactionType,
      txn.expenseType || '', txn.currency,
      txn.debitAmount  || 0,
      txn.creditAmount || 0,
      txn.runningBalance,
      txn.chargeAccountDesc || '', txn.accountingDate || '',
      txn.postingStatus, txn.referenceNo || '',
      txn.comments || '', txn.createdBy || '',
    ];

    vals.forEach((v, i) => {
      const cell = rowData.getCell(i + 1);
      cell.value = v;
      cell.fill  = solid(rowBg);
      cell.font  = { size: 10 };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E5E5' } } };
      const isAmt = i >= 5 && i <= 7;
      cell.alignment = { horizontal: isAmt ? 'right' : i === 0 ? 'center' : 'left', vertical: 'middle' };
      if (isAmt) cell.numFmt = numFmt;
    });
    // colour debit green, credit red, balance bold
    rowData.getCell(6).font  = { size: 10, color: { argb: 'FF1D7B4D' } };
    rowData.getCell(7).font  = { size: 10, color: { argb: 'FFC74634' } };
    rowData.getCell(8).font  = { size: 10, bold: true };
    rowData.height = 16;
    r++;
  }

  // ── Totals row ─────────────────────────────────────────────
  const totRow = ws.getRow(r);
  ws.mergeCells(`A${r}:E${r}`);
  totRow.getCell(1).value = `TOTAL  (${transactions.length} transactions)`;
  totRow.getCell(1).font  = { bold: true, size: 11 };
  totRow.getCell(1).fill  = solid('FFE8F0FE');
  totRow.getCell(1).alignment = { horizontal: 'right' };

  const sumDebit  = transactions.reduce((s, t) => s + (t.debitAmount  || 0), 0);
  const sumCredit = transactions.reduce((s, t) => s + (t.creditAmount || 0), 0);
  [[6, sumDebit, 'FF1D7B4D'], [7, sumCredit, 'FFC74634'], [8, register.balance, 'FF1A1A1A']].forEach(([col, val, argb]) => {
    const c = totRow.getCell(col as number);
    c.value  = val as number;
    c.numFmt = numFmt;
    c.font   = { bold: true, size: 11, color: { argb: argb as string } };
    c.fill   = solid('FFE8F0FE');
    c.alignment = { horizontal: 'right' };
    c.border = { top: { style: 'medium', color: { argb: 'FF2E6DA4' } } };
  });
  for (let col = 1; col <= 14; col++) {
    const c = totRow.getCell(col);
    if (!c.fill || (c.fill as ExcelJS.PatternFill).fgColor?.argb === 'FF000000') c.fill = solid('FFE8F0FE');
  }
  totRow.height = 22;

  // ── Freeze panes & auto-filter ─────────────────────────────
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: startDataRow - 1, showGridLines: false }];
  ws.autoFilter = { from: { row: startDataRow - 1, column: 1 }, to: { row: r - 1, column: 14 } };

  // ── Save ──────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  const eAPI = (window as any).electronAPI;
  const safeName = register.registerName.replace(/[^a-z0-9]/gi, '_');
  const filename  = `PC_Register_${safeName}_${dayjs().format('YYYYMMDD')}.xlsx`;
  if (eAPI?.saveFile) {
    await eAPI.saveFile(buf, filename);
  } else {
    saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
  }
  message.success(`Exported: ${filename}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Register Detail Panel
// ─────────────────────────────────────────────────────────────────────────────
const RegisterDetail: React.FC<{
  tab: RegisterTab;
  onRefresh: () => void;
  currentUser: string;
  cashAccountName?: string;
}> = ({ tab, onRefresh, currentUser, cashAccountName }) => {
  const { register, transactions, txnLoading } = tab;
  const [addMoneyOpen, setAddMoneyOpen]     = useState(false);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [editTxnOpen, setEditTxnOpen]       = useState(false);
  const [editTxn, setEditTxn]               = useState<PCTransaction | null>(null);
  const [saving, setSaving]                 = useState(false);
  const [moneyForm]   = Form.useForm();
  const [expenseForm] = Form.useForm();
  const [editTxnForm] = Form.useForm();
  const needsRefresh = React.useRef(false);
  const [distCombinations, setDistCombinations] = useState<DistCombination[]>([]);
  const [openPeriods, setOpenPeriods]           = useState<APPeriod[]>([]);
  const [periodsLoaded, setPeriodsLoaded]       = useState(false);
  const [txnActionLoading, setTxnActionLoading] = useState<number | null>(null);
  const [coaOpen, setCoaOpen]     = useState(false);
  const [coaTarget, setCoaTarget] = useState<'add' | 'edit' | 'money' | 'bankAsset' | 'bankOffset'>('edit');
  const [addAcctDesc, setAddAcctDesc]     = useState<string>('');
  const [editAcctDesc, setEditAcctDesc]   = useState<string>('');
  const [moneyAcctDesc, setMoneyAcctDesc] = useState<string>('');
  const [linkedBankTxnRef, setLinkedBankTxnRef] = useState<string>('');
  const [bankTxnModalOpen, setBankTxnModalOpen] = useState(false);
  const [bankTxnForm]     = Form.useForm();
  const [bankTxnSaving, setBankTxnSaving] = useState(false);
  const [bankAccounts, setBankAccounts]   = useState<{ name: string; cashAccount: string; currency: string }[]>([]);
  const [buLegalEntityMap, setBuLegalEntityMap] = useState<Map<string, string>>(new Map());
  const [bankTxnDetailOpen, setBankTxnDetailOpen]     = useState(false);
  const [bankTxnDetail, setBankTxnDetail]             = useState<any>(null);
  const [bankTxnDetailLoading, setBankTxnDetailLoading] = useState(false);
  const [bankTxnPostResponse, setBankTxnPostResponse]   = useState<any>(null);
  const [bankTxnLookupResult, setBankTxnLookupResult]   = useState<any>(null);
  const [bankTxnPayload, setBankTxnPayload]             = useState<any>(null);
  const [bankTxnRawError, setBankTxnRawError]           = useState<string>('');
  const [chargeAcctResolved, setChargeAcctResolved] =
    useState<Map<number, { code: string; desc: string }>>(new Map());
  const [addExpenseAttachName, setAddExpenseAttachName] = useState<string>('');
  const [addExpenseAttachData, setAddExpenseAttachData] = useState<string>('');
  const [editExpenseAttachName, setEditExpenseAttachName] = useState<string>('');
  const [editExpenseAttachData, setEditExpenseAttachData] = useState<string>('');
  const [viewAttachOpen, setViewAttachOpen]   = useState(false);
  const [viewAttachData, setViewAttachData]   = useState<string>('');
  const [viewAttachName, setViewAttachName]   = useState<string>('');
  // ── Accounting state ──────────────────────────────────────────────────────
  const [selectedRowKeys, setSelectedRowKeys]   = useState<number[]>([]);
  const [acctModalOpen, setAcctModalOpen]       = useState(false);
  const [acctProgress, setAcctProgress]         = useState<AcctProgressRow[]>([]);
  const [acctRunning, setAcctRunning]           = useState(false);
  const [acctDone, setAcctDone]                 = useState(false);
  const [viewAcctOpen, setViewAcctOpen]         = useState(false);
  const [viewAcctTxn, setViewAcctTxn]           = useState<PCTransaction | null>(null);
  const [viewAcctData, setViewAcctData]         = useState<SlaGetResult | null>(null);
  const [viewAcctLoading, setViewAcctLoading]   = useState(false);
  const [ledgerInfo, setLedgerInfo]             = useState<{ ledgerId: number; ledgerName: string } | null>(null);
  const [legalEntityName, setLegalEntityName]   = useState<string>('');
  const [apiDebugOpen, setApiDebugOpen]         = useState(false);
  const [apiDebugItems, setApiDebugItems]       = useState<ApiDebugItem[]>([]);
  const [apiDebugLoading, setApiDebugLoading]   = useState(false);
  const [viewAcctLineDescs, setViewAcctLineDescs] = useState<Map<string, string>>(new Map());
  const [expenseMode, setExpenseMode]   = useState<'single' | 'multi'>('single');
  const [expenseLines, setExpenseLines] = useState<ExpenseLine[]>([makeNewLine()]);

  const updateLine = (key: string, patch: Partial<ExpenseLine>) =>
    setExpenseLines(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l));

  const isClosed   = register.status !== 'ACTIVE';
  const noBalance  = register.balance <= 0;

  // ── Resolve charge account combination + description for table ─
  useEffect(() => {
    const isCombCode = (v: string) => (v.match(/-/g) || []).length >= 5;
    transactions.forEach(t => {
      if (!t.chargeAccountDesc || chargeAcctResolved.has(t.transactionId)) return;
      if (isCombCode(t.chargeAccountDesc)) {
        // Combination code stored → resolve segment-4 description async
        validateAccountCode(t.chargeAccountDesc).then(result => {
          const seg4 = Object.values(result.segmentDetails)[3];
          setChargeAcctResolved(prev => new Map(prev).set(t.transactionId, {
            code: t.chargeAccountDesc!,
            desc: seg4?.description || '',
          }));
        });
      } else {
        // Description stored → reverse-lookup combination code from loaded combos
        const match = distCombinations.find(d => d.glAccountDesc === t.chargeAccountDesc);
        setChargeAcctResolved(prev => new Map(prev).set(t.transactionId, {
          code: match?.combinationName || '',
          desc: t.chargeAccountDesc!,
        }));
      }
    });
  }, [transactions, distCombinations]);

  // ── Load bank accounts filtered by BU via legal entity ───────
  const BANK_ACCOUNTS_URL = `${APEX_DB_CONFIG.baseUrl}/banks/bankaccounts`;
  const EXT_TXN_URL       = `${APEX_DB_CONFIG.baseUrl}/cash/externaltransactions`;
  const BU_LIST_URL       = `${APEX_DB_CONFIG.baseUrl}/gl/businessunits`;

  const loadBankAccountsByBU = (bu: string, leMap?: Map<string, string>) => {
    setBankAccounts([]);
    const map = leMap ?? buLegalEntityMap;
    const legalEntity = map.get(bu) || '';
    fetch(BANK_ACCOUNTS_URL, { headers: { Accept: 'application/json' } })
      .then(r => r.json())
      .then(data => {
        const all = (data.items || []) as any[];
        const filtered = legalEntity
          ? all.filter(i => (i.legal_entity_name || '').toLowerCase() === legalEntity.toLowerCase())
          : all;
        const seen = new Set<string>();
        const accounts = filtered
          .map((i: any) => ({
            name:        i.bank_account_name || i.bankAccountName || '',
            cashAccount: i.cash_account_combination || '',
            currency:    i.currency_code || '',
          }))
          .filter(a => a.name && !seen.has(a.name) && seen.add(a.name));
        setBankAccounts(accounts);
      })
      .catch(() => {});
  };

  // ── Pre-fill bank txn modal on open ───────────────────────────
  useEffect(() => {
    if (!bankTxnModalOpen) return;
    const mv = moneyForm.getFieldsValue();
    const bu = register.businessUnit;
    bankTxnForm.setFieldsValue({
      businessUnitName:         bu,
      amount:                   mv.amount,
      transactionDate:          mv.transactionDate || dayjs(),
      currencyCode:             mv.currency || register.currency,
      offsetAccountCombination: mv.chargeAccountDesc || '',
      description:              `Petty Cash Refill — ${register.registerName}`,
    });
    // Fetch BU list to resolve legal entity, then load bank accounts
    if (buLegalEntityMap.size > 0) {
      loadBankAccountsByBU(bu);
    } else {
      fetch(BU_LIST_URL, { headers: { Accept: 'application/json' } })
        .then(r => r.json())
        .then(data => {
          const leMap = new Map<string, string>(
            (data.items || []).map((i: any) => [
              i.business_unit_name || '',
              i.legal_entity_name  || '',
            ])
          );
          setBuLegalEntityMap(leMap);
          loadBankAccountsByBU(bu, leMap);
        })
        .catch(() => loadBankAccountsByBU(bu));
    }
  }, [bankTxnModalOpen]);

  // ── Load distribution combinations + open AP periods on mount ─
  useEffect(() => {
    searchCombinations({ status: 'ACTIVE' })
      .then(data => setDistCombinations(data.filter(d => d.module === 'PC' || d.module === 'ALL')))
      .catch(() => {});
    getOpenAPPeriods()
      .then(p => { setOpenPeriods(p); setPeriodsLoaded(true); })
      .catch(() => { setPeriodsLoaded(true); });
  }, []);

  // ── Derive AP period for a given date ────────────────────
  const findAPPeriod = (date: dayjs.Dayjs | null): APPeriod | null => {
    if (!date) return null;
    return openPeriods.find(p =>
      !date.isBefore(dayjs(p.startDate)) && !date.isAfter(dayjs(p.endDate))
    ) ?? null;
  };

  // ── Populate edit form once modal is open and editTxn is set ─
  useEffect(() => {
    if (!editTxnOpen || !editTxn) return;
    const parseOracleDate = (s: string | null | undefined) => {
      if (!s) return null;
      // Oracle TO_CHAR 'DD-MON-YYYY' returns uppercase month e.g. '19-APR-2026'
      // Normalize to title-case so dayjs 'DD-MMM-YYYY' token matches
      const norm = s.replace(/-([A-Z]{3})-/g, (_, m) => `-${m[0]}${m.slice(1).toLowerCase()}-`);
      const d = dayjs(norm, ['YYYY-MM-DD', 'DD-MMM-YYYY']);
      return d.isValid() ? d : null;
    };
    const isExpense = editTxn.transactionType === 'Expense';
    const isCombCode = (v: string) => (v.match(/-/g) || []).length >= 5;
    const raw = editTxn.chargeAccountDesc;

    let combCode = raw;
    let desc = '';

    if (raw && !isCombCode(raw)) {
      // Stored as description — reverse-lookup the combination code
      const match = distCombinations.find(d => d.glAccountDesc === raw);
      if (match) {
        combCode = match.combinationName;
        desc = raw;
      }
    } else if (raw && isCombCode(raw)) {
      // Stored as combination code — resolve description async
      validateAccountCode(raw).then(result => {
        const seg4 = Object.values(result.segmentDetails)[3];
        setEditAcctDesc(seg4?.description || '');
      });
    }

    editTxnForm.setFieldsValue({
      transactionDate:   parseOracleDate(editTxn.transactionDate),
      accountingDate:    parseOracleDate(editTxn.accountingDate),
      currency:          editTxn.currency,
      amount:            isExpense ? editTxn.debitAmount : editTxn.creditAmount,
      expenseType:       editTxn.expenseType,
      chargeAccountDesc: combCode,
      chargeAccountCcid: editTxn.chargeAccountCcid,
      referenceNo:       editTxn.referenceNo,
      comments:          editTxn.comments,
      attachment:        editTxn.attachment,
      employeeName:      editTxn.employeeName,
      receiptStatus:     editTxn.receiptStatus,
    });
    setEditAcctDesc(desc);
    setEditExpenseAttachName(editTxn.attachment || '');
    setEditExpenseAttachData('');
  }, [editTxnOpen, editTxn, distCombinations]);

  // ── Delete transaction (Unposted / Error only) ────────────
  const handleDeleteTransaction = (txn: PCTransaction) => {
    Modal.confirm({
      title: `Delete Line #${txn.lineNumber}?`,
      content: `This will permanently remove this ${txn.transactionType} transaction of ${fmt(txn.debitAmount || txn.creditAmount)} ${txn.currency}. This cannot be undone.`,
      okText: 'Delete', okButtonProps: { danger: true },
      onOk: async () => {
        setTxnActionLoading(txn.transactionId);
        try {
          await deleteTransaction(txn.transactionId);
          message.success(`Line #${txn.lineNumber} deleted`);
          onRefresh();
        } catch (e: any) {
          message.error(e?.message ?? 'Delete failed');
        } finally {
          setTxnActionLoading(null);
        }
      },
    });
  };

  // ── Reverse transaction (Posted only) ────────────────────
  const handleReverseTransaction = (txn: PCTransaction) => {
    Modal.confirm({
      title: `Reverse Line #${txn.lineNumber}?`,
      content: `This creates an offsetting Adjustment transaction to cancel this posted ${txn.transactionType}. The original line is kept for the audit trail.`,
      okText: 'Create Reversal',
      okButtonProps: { style: { background: REDWOOD.warning, borderColor: REDWOOD.warning } },
      onOk: async () => {
        setTxnActionLoading(txn.transactionId);
        try {
          await createTransaction({
            registerId:      txn.registerId,
            transactionDate: dayjs().format('YYYY-MM-DD'),
            accountingDate:  dayjs().format('YYYY-MM-DD'),
            transactionType: 'Adjustment',
            expenseType:     txn.expenseType || undefined,
            currency:        txn.currency,
            debitAmount:     txn.creditAmount,   // swap: credit→debit reverses an expense
            creditAmount:    txn.debitAmount,    // swap: debit→credit reverses a refill
            chargeAccountCcid: txn.chargeAccountCcid || undefined,
            chargeAccountDesc: txn.chargeAccountDesc || undefined,
            postingStatus:   'Unposted',
            comments:        `Reversal of Line #${txn.lineNumber}${txn.comments ? ' — ' + txn.comments : ''}`,
            referenceNo:     txn.referenceNo || undefined,
            createdBy:       currentUser,
          });
          message.success(`Reversal created for Line #${txn.lineNumber}`);
          onRefresh();
        } catch (e: any) {
          message.error(e?.message ?? 'Reversal failed');
        } finally {
          setTxnActionLoading(null);
        }
      },
    });
  };

  // ── Open edit transaction modal (fetch-first) ────────────
  const openEditTransaction = async (txn: PCTransaction) => {
    setTxnActionLoading(txn.transactionId);
    try {
      const fresh = await getTransaction(txn.transactionId);
      editTxnForm.resetFields();
      setEditTxn(fresh);
      setEditTxnOpen(true);
    } catch (e: any) {
      message.error(e?.message ?? 'Failed to load transaction');
    } finally {
      setTxnActionLoading(null);
    }
  };

  // ── Save edited transaction ───────────────────────────────
  const handleSaveEditTransaction = async (values: any) => {
    if (!editTxn) return;
    const accDate = values.accountingDate ?? values.transactionDate;
    if (periodsLoaded && openPeriods.length > 0 && !findAPPeriod(accDate)) {
      message.error(`Accounting date ${accDate.format('DD-MMM-YYYY')} does not fall within an open AP period`);
      return;
    }
    setSaving(true);
    try {
      const isExpense = editTxn.transactionType === 'Expense';
      await updateTransaction(editTxn.transactionId, {
        transactionDate:   values.transactionDate.format('YYYY-MM-DD'),
        accountingDate:    values.accountingDate
          ? values.accountingDate.format('YYYY-MM-DD')
          : values.transactionDate.format('YYYY-MM-DD'),
        currency:          values.currency,
        debitAmount:       isExpense ? values.amount : 0,
        creditAmount:      isExpense ? 0 : values.amount,
        expenseType:       values.expenseType   || null,
        chargeAccountDesc: values.chargeAccountDesc || null,
        chargeAccountCcid: values.chargeAccountCcid || null,
        referenceNo:       values.referenceNo   || null,
        comments:          values.comments      || null,
        attachment:        editExpenseAttachName || values.attachment || null,
        attachmentData:    editExpenseAttachData || undefined,
        employeeName:      values.employeeName  || null,
        receiptStatus:     values.receiptStatus || null,
        updatedBy:         currentUser,
      });
      message.success(`Line #${editTxn.lineNumber} updated`);
      setEditTxnOpen(false);
      setEditTxn(null);
      setEditExpenseAttachName('');
      setEditExpenseAttachData('');
      onRefresh();
    } catch (e: any) {
      message.error(e?.message ?? 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  // ── Add Money ──────────────────────────────────────────────
  const handleAddMoney = async (values: any) => {
    const accDate = values.accountingDate ?? values.transactionDate;
    if (periodsLoaded && openPeriods.length > 0 && !findAPPeriod(accDate)) {
      message.error(`Accounting date ${accDate.format('DD-MMM-YYYY')} does not fall within an open AP period`);
      return;
    }
    setSaving(true);
    try {
      await createTransaction({
        registerId:         register.registerId,
        transactionDate:    values.transactionDate.format('YYYY-MM-DD'),
        accountingDate:     accDate.format('YYYY-MM-DD'),
        transactionType:    'Balance Refill',
        currency:           values.currency || register.currency,
        debitAmount:        0,
        creditAmount:       values.amount,
        chargeAccountCcid:  values.chargeAccountCcid || null,
        chargeAccountDesc:  values.chargeAccountDesc || null,
        referenceNo:        values.referenceNo || null,
        bankTxnId:          linkedBankTxnRef ? (Number(linkedBankTxnRef) || null) : null,
        comments:           values.comments,
        postingStatus:      'Unposted',
        createdBy:          currentUser,
      });
      message.success('Money added to register');
      moneyForm.resetFields();
      setMoneyAcctDesc('');
      setLinkedBankTxnRef('');
      setBankTxnPostResponse(null);
      setBankTxnLookupResult(null);
      needsRefresh.current = false;
      setAddMoneyOpen(false);
      onRefresh();
    } catch (e: any) {
      message.error(e?.message ?? 'Failed to add money');
    } finally {
      setSaving(false);
    }
  };

  // ── Open bank transaction detail popup ────────────────────
  const openBankTxnDetail = async (bankTxnId: number) => {
    setBankTxnDetailLoading(true);
    setBankTxnDetailOpen(true);
    setBankTxnDetail(null);
    try {
      const res  = await fetch(`${EXT_TXN_URL}?external_transaction_id=${bankTxnId}&row_limit=1`, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      const item = (data.items || [])[0] || null;
      setBankTxnDetail(item);
    } catch { setBankTxnDetail(null); }
    finally { setBankTxnDetailLoading(false); }
  };

  // ── Create Bank Transaction (from Add Money) ──────────────
  const handleCreateBankTxn = async (values: any) => {
    setBankTxnSaving(true);
    const uniqueRef = values.referenceText?.trim() || `PC-REG${register.registerId}-${Date.now()}`;
    const payload = {
      items: [{
        BankAccountName:          values.bankAccountName,
        BusinessUnitName:         values.businessUnitName ?? register.businessUnit,
        Amount:                   values.amount,
        TransactionDate:          values.transactionDate?.format('YYYY-MM-DD'),
        CurrencyCode:             values.currencyCode ?? register.currency,
        ReferenceText:            uniqueRef,
        TransactionType:          values.transactionType ?? 'MISC',
        Description:              values.description ?? `Petty Cash Refill — ${register.registerName}`,
        Source:                   'ORA_MAN',
        Status:                   'UNR',
        AccountingFlag:           false,
        CreatedBy:                currentUser,
        CreationDate:             new Date().toISOString(),
        LastUpdatedBy:            currentUser,
        LastUpdateDate:           new Date().toISOString(),
        LastUpdateLogin:          '',
        AssetAccountCombination:  values.assetAccountCombination ?? '',
        OffsetAccountCombination: values.offsetAccountCombination ?? '',
      }],
    };
    setBankTxnPayload(payload);
    setBankTxnPostResponse(null);
    setBankTxnRawError('');
    try {
      const res = await fetch(EXT_TXN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const rawText = await res.text();
      let data: any = {};
      try { data = JSON.parse(rawText); } catch { data = { status: 'error', message: rawText }; }
      setBankTxnPostResponse(data);
      setBankTxnRawError(res.ok ? '' : `HTTP ${res.status} — ${rawText}`);
      if (data.status === 'success') {
        // externalTransactionId is now returned directly by the POST handler
        const extId: number | null = data.externalTransactionId ?? null;
        const txnRef = extId ? String(extId) : uniqueRef;
        // Also do a lookup so we can show the full record in the debug panel
        let lookupResult: any = null;
        if (extId) {
          try {
            const srch = await fetch(
              `${EXT_TXN_URL}?external_transaction_id=${extId}&row_limit=1`,
              { headers: { Accept: 'application/json' } }
            );
            lookupResult = await srch.json();
          } catch {}
        }
        setBankTxnLookupResult(lookupResult);
        message.success(`Bank transaction created — ID: ${txnRef}`);
        setLinkedBankTxnRef(txnRef);
        moneyForm.setFieldsValue({ referenceNo: uniqueRef });
        // Copy offset account → charge account in Add Money
        const offsetAcct = bankTxnForm.getFieldValue('offsetAccountCombination');
        if (offsetAcct) {
          moneyForm.setFieldsValue({ chargeAccountDesc: offsetAcct, chargeAccountCcid: null });
          validateAccountCode(offsetAcct).then(result => {
            const seg4 = Object.values(result.segmentDetails)[3];
            setMoneyAcctDesc(seg4?.description || '');
          }).catch(() => {});
        }
        setBankTxnModalOpen(false);
      } else {
        message.error(data.message || 'Failed — see API Response panel below');
      }
    } catch (e: any) {
      setBankTxnRawError(String(e));
      message.error(e?.message ?? 'Network error');
    } finally {
      setBankTxnSaving(false);
    }
  };

  // ── Add Expense ────────────────────────────────────────────
  const handleAddExpense = async (values: any) => {
    const accDate = values.accountingDate ?? values.transactionDate;
    if (periodsLoaded && openPeriods.length > 0 && !findAPPeriod(accDate)) {
      message.error(`Accounting date ${accDate.format('DD-MMM-YYYY')} does not fall within an open AP period`);
      return;
    }
    if (values.amount > register.balance) {
      message.error(`Expense amount (${fmt(values.amount)}) exceeds available balance (${fmt(register.balance)} ${register.currency})`);
      return;
    }
    setSaving(true);
    try {
      await createTransaction({
        registerId:        register.registerId,
        transactionDate:   values.transactionDate.format('YYYY-MM-DD'),
        accountingDate:    values.accountingDate
          ? values.accountingDate.format('YYYY-MM-DD')
          : values.transactionDate.format('YYYY-MM-DD'),
        transactionType:   'Expense',
        expenseType:       values.expenseType,
        currency:          values.currency || register.currency,
        debitAmount:       values.amount,
        creditAmount:      0,
        chargeAccountCcid: values.chargeAccountCcid || null,
        chargeAccountDesc: values.chargeAccountDesc || null,
        referenceNo:       values.referenceNo,
        comments:          values.comments,
        attachment:        addExpenseAttachName || null,
        attachmentData:    addExpenseAttachData || null,
        employeeName:      values.employeeName || null,
        receiptStatus:     values.receiptStatus || null,
        postingStatus:     'Unposted',
        createdBy:         currentUser,
      });
      message.success('Expense recorded');
      expenseForm.resetFields();
      setAddExpenseAttachName('');
      setAddExpenseAttachData('');
      needsRefresh.current = false;
      setAddExpenseOpen(false);
      onRefresh();
    } catch (e: any) {
      message.error(e?.message ?? 'Failed to record expense');
    } finally {
      setSaving(false);
    }
  };

  // ── Add Multiple Expenses ──────────────────────────────────
  const handleAddMultiExpense = async () => {
    const vals = expenseForm.getFieldsValue(['transactionDate', 'accountingDate', 'currency', 'referenceNo']);
    if (!vals.transactionDate) { message.error('Transaction Date is required'); return; }
    const accDate = vals.accountingDate ?? vals.transactionDate;
    if (periodsLoaded && openPeriods.length > 0 && !findAPPeriod(accDate)) {
      message.error(`Accounting date ${accDate.format('DD-MMM-YYYY')} does not fall within an open AP period`);
      return;
    }
    const validLines = expenseLines.filter(l => l.expenseType && (l.amount ?? 0) > 0);
    if (validLines.length === 0) {
      message.error('Add at least one line with Expense Type and Amount > 0');
      return;
    }
    const totalAmt = validLines.reduce((s, l) => s + (l.amount ?? 0), 0);
    if (totalAmt > register.balance) {
      message.error(`Total (${fmt(totalAmt)}) exceeds available balance (${fmt(register.balance)} ${register.currency})`);
      return;
    }
    setSaving(true);
    let created = 0;
    try {
      for (const line of validLines) {
        await createTransaction({
          registerId:        register.registerId,
          transactionDate:   vals.transactionDate.format('YYYY-MM-DD'),
          accountingDate:    accDate.format('YYYY-MM-DD'),
          transactionType:   'Expense',
          expenseType:       line.expenseType,
          currency:          vals.currency || register.currency,
          debitAmount:       line.amount!,
          creditAmount:      0,
          chargeAccountCcid: line.chargeAccountCcid || null,
          chargeAccountDesc: line.chargeAccountDesc || null,
          referenceNo:       vals.referenceNo || null,
          comments:          line.description || null,
          postingStatus:     'Unposted',
          createdBy:         currentUser,
        });
        created++;
      }
      message.success(`${created} expense line${created > 1 ? 's' : ''} recorded`);
      expenseForm.resetFields();
      setExpenseLines([makeNewLine()]);
      setExpenseMode('single');
      setAddExpenseOpen(false);
      onRefresh();
    } catch (e: any) {
      message.error(e?.message ?? 'Failed to record expenses');
    } finally {
      setSaving(false);
    }
  };

  // ── Accounting handlers ───────────────────────────────────

  const loadLedgerAndLE = async (): Promise<{ ledgerId: number; ledgerName: string; legalEntity: string } | null> => {
    let leInfo = legalEntityName;
    let ldInfo = ledgerInfo;
    if (!ldInfo) {
      try {
        const info = await fetchLedgerByBusinessUnit(register.businessUnit);
        if (!info) { message.error('Could not resolve ledger for this Business Unit'); return null; }
        setLedgerInfo(info);
        ldInfo = info;
      } catch { message.error('Failed to load ledger information'); return null; }
    }
    if (!leInfo) {
      try {
        const buRes = await fetch(`${BU_LIST_URL}`, { headers: { Accept: 'application/json' } });
        const buData = await buRes.json();
        const buItem = (buData.items || []).find((i: any) =>
          (i.business_unit_name || '').toLowerCase() === register.businessUnit.toLowerCase()
        );
        const le = buItem?.legal_entity_name || '';
        setLegalEntityName(le);
        leInfo = le;
      } catch { leInfo = ''; }
    }
    return { ...ldInfo, legalEntity: leInfo };
  };

  const openViewAccounting = async (txn: PCTransaction) => {
    setViewAcctTxn(txn);
    setViewAcctData(null);
    setViewAcctLineDescs(new Map());
    setViewAcctLoading(true);
    setViewAcctOpen(true);
    try {
      const data = await getAccounting('PC_TRANSACTIONS', txn.transactionId);
      setViewAcctData(data);
      // Resolve description for each unique account combination in the lines
      const unique = [...new Set((data.lines || []).map(l => l.accountCombination).filter(Boolean))];
      const resolved = new Map<string, string>();
      await Promise.all(unique.map(async (combo) => {
        try {
          const result = await validateAccountCode(combo);
          const seg4 = Object.values(result.segmentDetails)[3];
          resolved.set(combo, seg4?.description || '');
        } catch { resolved.set(combo, ''); }
      }));
      setViewAcctLineDescs(resolved);
    } catch { setViewAcctData(null); }
    finally { setViewAcctLoading(false); }
  };

  const openCreateAccountingModal = () => {
    const selected = transactions.filter(t =>
      selectedRowKeys.includes(t.transactionId) && t.transactionType !== 'Balance Refill'
    );
    if (selected.length === 0) {
      message.warning('Select at least one Expense or Adjustment transaction. Balance Refills are accounted on the bank transaction side.');
      return;
    }
    // Exclude transactions that have no charge account
    const skipped = selected.filter(t => !t.chargeAccountDesc);
    const eligible = selected.filter(t => !!t.chargeAccountDesc);
    if (skipped.length > 0) {
      message.warning(`${skipped.length} line(s) skipped — no charge account assigned.`);
    }
    if (eligible.length === 0) {
      message.error('None of the selected transactions have a charge account. Cannot create accounting.');
      return;
    }
    const rows: AcctProgressRow[] = eligible.map(t => {
      const isOut         = t.debitAmount > 0;
      const amount        = isOut ? t.debitAmount : t.creditAmount;
      const chargeCode    = t.chargeAccountDesc ?? '';
      const chargeDesc    = chargeAcctResolved.get(t.transactionId)?.desc ?? '';
      const cashCode      = register.cashAccountDesc ?? '';
      const cashDesc      = cashAccountName ?? '';
      const acctDate      = toIsoDate(t.accountingDate || t.transactionDate);
      return {
        txnId:           t.transactionId,
        lineNumber:      t.lineNumber,
        transactionType: t.transactionType,
        expenseType:     t.expenseType,
        amount,
        currency:        t.currency,
        accountingDate:  acctDate,
        periodName:      derivePeriodName(new Date(acctDate)),
        drAccount:       isOut ? chargeCode : cashCode,
        drAccountDesc:   isOut ? chargeDesc : cashDesc,
        crAccount:       isOut ? cashCode   : chargeCode,
        crAccountDesc:   isOut ? cashDesc   : chargeDesc,
        status:          t.postingStatus === 'Posted' ? 'skipped' : 'pending',
        message:         t.postingStatus === 'Posted' ? 'Already posted — skipped' : undefined,
      };
    });
    setAcctProgress(rows);
    setAcctDone(false);
    setAcctModalOpen(true);
  };

  const runCreateAccounting = async () => {
    setAcctRunning(true);
    const ctx = await loadLedgerAndLE();
    if (!ctx) { setAcctRunning(false); return; }

    const updateRow = (txnId: number, partial: Partial<AcctProgressRow>) =>
      setAcctProgress(prev => prev.map(r => r.txnId === txnId ? { ...r, ...partial } : r));

    const APEX_BASE = APEX_DB_CONFIG.baseUrl;

    for (const row of acctProgress) {
      if (row.status === 'skipped') continue;

      updateRow(row.txnId, { status: 'running' });
      const txn = transactions.find(t => t.transactionId === row.txnId);
      if (!txn) { updateRow(row.txnId, { status: 'error', message: 'Transaction not found locally' }); continue; }
      if (!register.cashAccountDesc) {
        updateRow(row.txnId, { status: 'error', message: 'Register has no cash account configured' }); continue;
      }
      if (!txn.chargeAccountDesc) {
        updateRow(row.txnId, { status: 'error', message: 'Transaction has no charge account' }); continue;
      }

      try {
        const isOut     = txn.debitAmount > 0;
        const amount    = isOut ? txn.debitAmount : txn.creditAmount;
        const acctDate  = toIsoDate(txn.accountingDate || txn.transactionDate);
        const periodName = derivePeriodName(new Date(acctDate));
        const eventType = txn.transactionType === 'Expense'
          ? 'PC_EXPENSE_CREATED' as const
          : isOut ? 'PC_ADJUSTMENT' as const : 'PC_EXPENSE_REVERSAL' as const;

        const payload = buildPcTxnSlaPayload({
          transactionId:        txn.transactionId,
          sourceNumber:         `PC-${register.registerId}-L${txn.lineNumber}`,
          eventTypeCode:        eventType,
          transactionDate:      toIsoDate(txn.transactionDate),
          accountingDate:       acctDate,
          periodName,
          currency:             txn.currency,
          amount,
          drAccountCombination: row.drAccount,
          crAccountCombination: row.crAccount,
          drAccountingClass:    isOut ? 'EXPENSE' : 'PETTY_CASH',
          crAccountingClass:    isOut ? 'PETTY_CASH' : 'EXPENSE',
          drDescription:        isOut ? (txn.expenseType || 'Expense') : 'Petty Cash Account',
          crDescription:        isOut ? 'Petty Cash Account' : (txn.expenseType || 'Expense reversal'),
          businessUnit:         register.businessUnit,
          legalEntity:          ctx.legalEntity || undefined,
          ledgerId:             ctx.ledgerId,
          ledgerName:           ctx.ledgerName,
          createdBy:            currentUser,
        });

        // Step 1: Create SLA entry
        const slaResult = await createAccounting(payload);

        // Step 2: Create GL journal
        const batchName = `PC-${register.registerId}-L${txn.lineNumber}-${Date.now()}`;
        const glPayload = {
          batch: {
            batchName,
            batchDescription: `Petty Cash – ${register.registerName}`,
            ledgerName:       ctx.ledgerName,
            ledgerId:         ctx.ledgerId,
            status:           'NEW',
            accountingPeriod: periodName,
            controlTotal:     amount,
            runningTotalDr:   amount,
            runningTotalCr:   amount,
            batchSource:      'Petty Cash',
            createdBy:        currentUser,
          },
          header: {
            ledgerId:               ctx.ledgerId,
            ledgerName:             ctx.ledgerName,
            jeCategory:             'Petty Cash',
            jeSource:               'Petty Cash',
            periodName,
            journalName:            `PC-${txn.transactionType}-${txn.transactionId}`,
            description:            `${txn.expenseType || txn.transactionType} – ${register.registerName}`,
            currencyCode:           txn.currency,
            currencyConversionType: 'User',
            currencyConversionDate: acctDate,
            currencyConversionRate: 1,
            status:                 'NEW',
            runningTotalDr:         amount,
            runningTotalCr:         amount,
            createdBy:              currentUser,
          },
          lines: payload.lines.map(l => ({
            enteredDr:               l.lineType === 'DR' ? l.enteredDr : null,
            enteredCr:               l.lineType === 'CR' ? l.enteredCr : null,
            accountedDr:             l.accountedDr || null,
            accountedCr:             l.accountedCr || null,
            statAmount:              null,
            description:             l.description,
            currencyCode:            l.currencyCode || txn.currency,
            currencyConversionDate:  acctDate,
            currencyConversionRate:  1,
            userCurrencyConversionType: 'User',
            accountCombination:      l.accountCombination,
            chartOfAccountsName:     'Chart of Accounts',
            reference1:              String(txn.transactionId),
            reference2:              register.registerName,
            reference3:              l.accountingClass || null,
            reference4:              register.businessUnit || null,
            reference5:              null,
            createdBy:               currentUser,
          })),
        };

        const glRes = await fetch(`${APEX_BASE}/journals/create`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body:    JSON.stringify(glPayload),
        });

        let glMsg = '';
        if (glRes.ok) {
          const glData = await glRes.json();
          // Step 3: Post SLA
          await fetch(`${APEX_BASE}/sla/accounting/post`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body:    JSON.stringify({
              headerId:    slaResult.headerId,
              glBatchId:   glData.batchId   || 0,
              glBatchName: batchName,
              glHeaderId:  glData.headerId  || 0,
              postedBy:    currentUser,
            }),
          });
          glMsg = `GL Batch: ${batchName}`;
        } else {
          glMsg = 'GL journal failed — SLA is Draft';
        }

        // Step 4: Update PC transaction posting status (dedicated endpoint — no other columns touched)
        await updateTransactionStatus(txn.transactionId, glRes.ok ? 'Posted' : 'Unposted', currentUser);

        updateRow(row.txnId, {
          status:   'success',
          message:  `SLA ${slaResult.headerId} — ${glMsg}`,
          headerId: slaResult.headerId,
        });
      } catch (e: any) {
        updateRow(row.txnId, { status: 'error', message: e?.message || 'Unexpected error' });
      }
    }

    setAcctRunning(false);
    setAcctDone(true);
    setSelectedRowKeys([]);
    onRefresh();
  };

  // ── API Debug ─────────────────────────────────────────────
  const openApiDebug = async () => {
    setApiDebugLoading(true);
    setApiDebugItems([]);
    setApiDebugOpen(true);
    try {
      const ctx = await loadLedgerAndLE();
      if (!ctx) { setApiDebugLoading(false); return; }
      const APEX_BASE = APEX_DB_CONFIG.baseUrl;
      const items: ApiDebugItem[] = [];

      for (const row of acctProgress) {
        if (row.status === 'skipped') continue;
        const txn = transactions.find(t => t.transactionId === row.txnId);
        if (!txn) continue;
        const isOut     = txn.debitAmount > 0;
        const amount    = isOut ? txn.debitAmount : txn.creditAmount;
        const acctDate  = toIsoDate(txn.accountingDate || txn.transactionDate);
        const periodName = derivePeriodName(new Date(acctDate));
        const eventType = txn.transactionType === 'Expense'
          ? 'PC_EXPENSE_CREATED' as const
          : isOut ? 'PC_ADJUSTMENT' as const : 'PC_EXPENSE_REVERSAL' as const;
        const batchName = `PC-${register.registerId}-L${txn.lineNumber}-<timestamp>`;

        const slaPayload = buildPcTxnSlaPayload({
          transactionId:        txn.transactionId,
          sourceNumber:         `PC-${register.registerId}-L${txn.lineNumber}`,
          eventTypeCode:        eventType,
          transactionDate:      toIsoDate(txn.transactionDate),
          accountingDate:       acctDate,
          periodName,
          currency:             txn.currency,
          amount,
          drAccountCombination: row.drAccount,
          crAccountCombination: row.crAccount,
          drAccountingClass:    isOut ? 'EXPENSE' : 'PETTY_CASH',
          crAccountingClass:    isOut ? 'PETTY_CASH' : 'EXPENSE',
          drDescription:        isOut ? (txn.expenseType || 'Expense') : 'Petty Cash Account',
          crDescription:        isOut ? 'Petty Cash Account' : (txn.expenseType || 'Expense reversal'),
          businessUnit:         register.businessUnit,
          legalEntity:          ctx.legalEntity || undefined,
          ledgerId:             ctx.ledgerId,
          ledgerName:           ctx.ledgerName,
          createdBy:            currentUser,
        });

        const glPayload = {
          batch: {
            batchName, batchDescription: `Petty Cash – ${register.registerName}`,
            ledgerName: ctx.ledgerName, ledgerId: ctx.ledgerId, status: 'NEW',
            accountingPeriod: periodName, controlTotal: amount,
            runningTotalDr: amount, runningTotalCr: amount,
            batchSource: 'Petty Cash', createdBy: currentUser,
          },
          header: {
            ledgerId: ctx.ledgerId, ledgerName: ctx.ledgerName,
            jeCategory: 'Petty Cash', jeSource: 'Petty Cash',
            periodName, journalName: `PC-${txn.transactionType}-${txn.transactionId}`,
            description: `${txn.expenseType || txn.transactionType} – ${register.registerName}`,
            currencyCode: txn.currency, currencyConversionType: 'User',
            currencyConversionDate: acctDate, currencyConversionRate: 1,
            status: 'NEW', runningTotalDr: amount, runningTotalCr: amount, createdBy: currentUser,
          },
          lines: slaPayload.lines.map(l => ({
            enteredDr: l.lineType === 'DR' ? l.enteredDr : null,
            enteredCr: l.lineType === 'CR' ? l.enteredCr : null,
            accountedDr: l.accountedDr || null, accountedCr: l.accountedCr || null,
            statAmount: null, description: l.description,
            currencyCode: l.currencyCode || txn.currency,
            currencyConversionDate: acctDate, currencyConversionRate: 1,
            userCurrencyConversionType: 'User', accountCombination: l.accountCombination,
            chartOfAccountsName: 'Chart of Accounts',
            reference1: String(txn.transactionId), reference2: register.registerName,
            reference3: l.accountingClass || null, reference4: register.businessUnit || null,
            reference5: null, createdBy: currentUser,
          })),
        };

        const slaPostPayload = {
          headerId: '<from SLA create response>',
          glBatchId: '<from GL create response>',
          glBatchName: batchName,
          glHeaderId: '<from GL create response>',
          postedBy: currentUser,
        };

        items.push(
          { label: `[Line ${txn.lineNumber}] 1. POST sla/accounting/create`, url: `${APEX_BASE}/sla/accounting/create`, body: slaPayload },
          { label: `[Line ${txn.lineNumber}] 2. POST journals/create`,        url: `${APEX_BASE}/journals/create`,       body: glPayload },
          { label: `[Line ${txn.lineNumber}] 3. POST sla/accounting/post`,    url: `${APEX_BASE}/sla/accounting/post`,   body: slaPostPayload },
        );
      }
      setApiDebugItems(items);
    } catch (e: any) {
      message.error(`Failed to build API preview: ${e?.message}`);
    }
    setApiDebugLoading(false);
  };

  const testApiItem = async (idx: number) => {
    const item = apiDebugItems[idx];
    if (!item || item.label.includes('sla/accounting/post')) {
      message.warning('POST sla/accounting/post requires live headerId/glBatchId — run full accounting instead.');
      return;
    }
    setApiDebugItems(prev => prev.map((it, i) => i === idx ? { ...it, loading: true, response: undefined, error: undefined } : it));
    try {
      const res = await fetch(item.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(item.body),
      });
      const data = await res.json();
      setApiDebugItems(prev => prev.map((it, i) => i === idx ? { ...it, loading: false, response: data, error: res.ok ? undefined : (data?.message || `HTTP ${res.status}`) } : it));
    } catch (e: any) {
      setApiDebugItems(prev => prev.map((it, i) => i === idx ? { ...it, loading: false, error: e?.message } : it));
    }
  };

  // ── Transaction columns ────────────────────────────────────
  const txnColumns: ColumnsType<PCTransaction> = [
    { title: '#', dataIndex: 'lineNumber', width: 50, align: 'center',
      render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Date', dataIndex: 'transactionDate', width: 100,
      render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Period', dataIndex: 'accountingPeriod', width: 100,
      render: (v) => v ? <Tag color="blue" style={{ fontSize: 11 }}>{v}</Tag> : <Text style={{ fontSize: 12, color: '#ccc' }}>—</Text> },
    { title: 'Type', dataIndex: 'transactionType', width: 120,
      render: (v) => {
        const color = v === 'Balance Refill' ? 'blue' : v === 'Expense' ? 'orange' : 'purple';
        return <Tag color={color} style={{ fontSize: 11 }}>{v}</Tag>;
      }},
    { title: 'Expense Type', dataIndex: 'expenseType', width: 120,
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Currency', dataIndex: 'currency', width: 80, align: 'center',
      render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Debit', dataIndex: 'debitAmount', width: 110, align: 'right',
      render: (v) => v > 0
        ? <Text style={{ fontSize: 12, color: REDWOOD.error }}>{fmt(v)}</Text>
        : <Text style={{ fontSize: 12, color: REDWOOD.neutral300 }}>—</Text> },
    { title: 'Credit', dataIndex: 'creditAmount', width: 110, align: 'right',
      render: (v) => v > 0
        ? <Text style={{ fontSize: 12, color: REDWOOD.success }}>{fmt(v)}</Text>
        : <Text style={{ fontSize: 12, color: REDWOOD.neutral300 }}>—</Text> },
    { title: 'Balance', dataIndex: 'runningBalance', width: 120, align: 'right',
      render: (v) => (
        <Text style={{ fontSize: 12, fontWeight: 600,
          color: v >= 0 ? REDWOOD.success : REDWOOD.error }}>
          {fmt(v)}
        </Text>
      )},
    { title: 'Charge Account', dataIndex: 'chargeAccountDesc', width: 180,
      render: (_v, rec) => {
        const r = chargeAcctResolved.get(rec.transactionId);
        const code = r?.code || rec.chargeAccountDesc || '';
        return <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{code || '—'}</Text>;
      }},
    { title: 'Acct Description', dataIndex: 'chargeAccountDesc', width: 160,
      render: (_v, rec) => {
        const r = chargeAcctResolved.get(rec.transactionId);
        const desc = r?.desc || '';
        return <Text style={{ fontSize: 11 }}>{desc || '—'}</Text>;
      }},
    { title: 'Acct Date', dataIndex: 'accountingDate', width: 100,
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Posting', dataIndex: 'postingStatus', width: 90,
      render: (v) => <PostingTag status={v} /> },
    { title: 'Reference', dataIndex: 'referenceNo', width: 120,
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Bank Txn ID', dataIndex: 'bankTxnId', width: 100,
      render: (v: number | null) => v
        ? <a style={{ fontSize: 12, fontFamily: 'monospace' }} onClick={() => openBankTxnDetail(v)}>{v}</a>
        : <Text style={{ fontSize: 12, color: REDWOOD.neutral300 }}>—</Text> },
    { title: 'Employee', dataIndex: 'employeeName', width: 130, ellipsis: true,
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Receipt', dataIndex: 'receiptStatus', width: 75, align: 'center' as const,
      render: (v) => v === 'YES' ? <Tag color="green" style={{ fontSize: 11 }}>YES</Tag>
        : v === 'NO' ? <Tag color="orange" style={{ fontSize: 11 }}>NO</Tag>
        : <Text style={{ fontSize: 12, color: REDWOOD.neutral300 }}>—</Text> },
    { title: 'Attachment', dataIndex: 'hasAttachment', width: 90, align: 'center' as const,
      render: (_v: string | null, rec: PCTransaction) => rec.hasAttachment === 'Y' ? (
        <Tooltip title={rec.attachment || 'View attachment'}>
          <Button type="text" size="small" icon={<PaperClipOutlined style={{ color: REDWOOD.info }} />}
            onClick={() => {
              getTransactionAttachment(rec.transactionId)
                .then(res => {
                  setViewAttachData(res.attachmentData);
                  setViewAttachName(res.fileName || rec.attachment || 'attachment');
                  setViewAttachOpen(true);
                })
                .catch(() => message.error('Failed to load attachment'));
            }} />
        </Tooltip>
      ) : <Text style={{ fontSize: 12, color: REDWOOD.neutral300 }}>—</Text> },
    { title: 'Comments', dataIndex: 'comments', ellipsis: true,
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Created By', dataIndex: 'createdBy', width: 130, ellipsis: true,
      render: (v) => <Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{v || '—'}</Text> },
    { title: '', key: 'actions', width: 100, align: 'center' as const, fixed: 'right' as const,
      render: (_: any, txn: PCTransaction) => {
        const isPosted  = txn.postingStatus === 'Posted';
        const isLoading = txnActionLoading === txn.transactionId;
        return (
          <Space size={2}>
            {isPosted && txn.transactionType !== 'Balance Refill' && (
              <Tooltip title="View accounting entries">
                <Button type="text" size="small"
                  icon={<BookOutlined style={{ color: REDWOOD.success }} />}
                  onClick={() => openViewAccounting(txn)}
                />
              </Tooltip>
            )}
            {!isPosted ? (
              <>
                <Tooltip title="Edit transaction">
                  <Button type="text" size="small"
                    icon={<EditOutlined style={{ color: isLoading ? undefined : REDWOOD.info }} />}
                    loading={isLoading}
                    disabled={isClosed}
                    onClick={() => openEditTransaction(txn)}
                  />
                </Tooltip>
                <Tooltip title="Delete transaction">
                  <Button type="text" danger size="small"
                    icon={<DeleteOutlined />}
                    disabled={isClosed || isLoading}
                    onClick={() => handleDeleteTransaction(txn)}
                  />
                </Tooltip>
              </>
            ) : (
              <Tooltip title="Create reversal (posted — cannot edit)">
                <Button type="text" size="small"
                  icon={<RollbackOutlined style={{ color: REDWOOD.warning }} />}
                  loading={isLoading}
                  disabled={isClosed}
                  onClick={() => handleReverseTransaction(txn)}
                />
              </Tooltip>
            )}
          </Space>
        );
      }},
  ];

  return (
    <>
      {/* Header KPIs */}
      {(() => {
        const hasLimit = register.limit != null && register.limit > 0;
        const canAdd   = hasLimit ? Math.max(0, register.limit! - register.balance) : null;
        const usedPct  = hasLimit ? Math.min(100, Math.round((register.balance / register.limit!) * 100)) : 0;
        return (
          <Row gutter={12} style={{ marginBottom: 16 }}>
            {/* Balance */}
            <Col span={4}>
              <Card size="small" style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
                <Statistic
                  title={<Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Balance</Text>}
                  value={register.balance}
                  precision={2}
                  valueStyle={{ fontSize: 20, color: register.balance >= 0 ? REDWOOD.success : REDWOOD.error }}
                  suffix={<span style={{ fontSize: 12 }}>{register.currency}</span>}
                />
                {hasLimit && (
                  <Progress
                    percent={usedPct}
                    size="small"
                    strokeColor={usedPct >= 100 ? REDWOOD.success : REDWOOD.info}
                    style={{ marginTop: 6, marginBottom: 0 }}
                    format={p => <span style={{ fontSize: 10 }}>{p}%</span>}
                  />
                )}
              </Card>
            </Col>

            {/* Limit — always visible */}
            <Col span={4}>
              <Card size="small" style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
                {hasLimit ? (
                  <Statistic
                    title={<Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Limit</Text>}
                    value={register.limit!}
                    precision={2}
                    valueStyle={{ fontSize: 20, color: REDWOOD.neutral900 }}
                    suffix={<span style={{ fontSize: 12 }}>{register.currency}</span>}
                  />
                ) : (
                  <>
                    <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 4 }}>Limit</div>
                    <div style={{ fontSize: 20, color: REDWOOD.neutral300 }}>—</div>
                  </>
                )}
              </Card>
            </Col>

            {/* Can Add — always visible */}
            <Col span={4}>
              <Card size="small" style={{
                borderRadius: 8,
                border: `1px solid ${hasLimit && canAdd! > 0 ? '#b7eb8f' : REDWOOD.neutral200}`,
                background: hasLimit && canAdd! > 0 ? '#f6ffed' : undefined,
              }}>
                {hasLimit ? (
                  <Statistic
                    title={<Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Can Add</Text>}
                    value={canAdd!}
                    precision={2}
                    valueStyle={{ fontSize: 20, color: canAdd! > 0 ? REDWOOD.success : REDWOOD.neutral300 }}
                    suffix={<span style={{ fontSize: 12 }}>{register.currency}</span>}
                  />
                ) : (
                  <>
                    <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 4 }}>Can Add</div>
                    <div style={{ fontSize: 20, color: REDWOOD.neutral300 }}>—</div>
                  </>
                )}
              </Card>
            </Col>

            {/* Total In */}
            <Col span={4}>
              <Card size="small" style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
                <Statistic
                  title={<Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Total In (Credit)</Text>}
                  value={register.totalCredit}
                  precision={2}
                  valueStyle={{ fontSize: 18, color: REDWOOD.success }}
                  prefix={<ArrowDownOutlined />}
                />
              </Card>
            </Col>

            {/* Total Out */}
            <Col span={4}>
              <Card size="small" style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
                <Statistic
                  title={<Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Total Out (Debit)</Text>}
                  value={register.totalDebit}
                  precision={2}
                  valueStyle={{ fontSize: 18, color: REDWOOD.error }}
                  prefix={<ArrowUpOutlined />}
                />
              </Card>
            </Col>

            {/* Register Info */}
            <Col span={4}>
              <Card size="small" style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
                <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 4 }}>Register Info</div>
                <div style={{ fontSize: 12 }}>
                  <b>BU:</b> {register.businessUnit || '—'}<br />
                  <b>Currency:</b> {register.currency}<br />
                  <b>Status:</b> <StatusTag status={register.status} /><br />
                  {register.ownedBy   && <><b>Owned By:</b> {register.ownedBy}<br /></>}
                  {register.startDate && <><b>From:</b> {register.startDate}<br /></>}
                  {register.endDate   && <><b>To:</b> {register.endDate}</>}
                </div>
              </Card>
            </Col>
          </Row>
        );
      })()}

      {/* Cash Account */}
      {register.cashAccountDesc && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f0f9ff',
          borderRadius: 6, border: '1px solid #bae0ff', fontSize: 12 }}>
          <b>Cash Account:</b>{' '}
          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
            {register.cashAccountDesc}
          </span>
          {cashAccountName && (
            <div style={{ marginTop: 3, color: '#1677ff', paddingLeft: 2 }}>
              {cashAccountName}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Transactions</Text>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={onRefresh}
            loading={tab.txnLoading}
          >
            Refresh
          </Button>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => exportRegisterToExcel(register, transactions)}
          >
            Export Excel
          </Button>
          <Tooltip title={selectedRowKeys.length !== 1 || transactions.find(t => t.transactionId === selectedRowKeys[0])?.postingStatus !== 'Posted'
            ? 'Select one posted transaction to view its accounting entries' : undefined}>
            <Button
              icon={<BookOutlined />}
              disabled={
                selectedRowKeys.length !== 1 ||
                transactions.find(t => t.transactionId === selectedRowKeys[0])?.postingStatus !== 'Posted' ||
                transactions.find(t => t.transactionId === selectedRowKeys[0])?.transactionType === 'Balance Refill'
              }
              onClick={() => {
                const txn = transactions.find(t => t.transactionId === selectedRowKeys[0]);
                if (txn) openViewAccounting(txn);
              }}
            >
              View Accounting
            </Button>
          </Tooltip>
          <Tooltip title={selectedRowKeys.length === 0 ? 'Select expense transactions to account' : undefined}>
            <Button
              icon={<CheckCircleOutlined />}
              disabled={isClosed || selectedRowKeys.length === 0}
              style={!isClosed && selectedRowKeys.length > 0
                ? { background: REDWOOD.info, borderColor: REDWOOD.info, color: '#fff' }
                : {}}
              onClick={openCreateAccountingModal}
            >
              Create Accounting{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}
            </Button>
          </Tooltip>
          <Tooltip title={register.limit == null ? 'Set a limit on this register before adding money' : undefined}>
          <Button
            icon={<DollarOutlined />}
            style={!isClosed && register.limit != null ? { background: REDWOOD.success, borderColor: REDWOOD.success, color: '#fff' } : {}}
            disabled={isClosed || register.limit == null}
            onClick={() => {
              moneyForm.resetFields();
              setMoneyAcctDesc('');
              setLinkedBankTxnRef('');
              setBankTxnPostResponse(null);
              setBankTxnLookupResult(null);
              setBankTxnPayload(null);
              setBankTxnRawError('');
              if (register.limit != null && register.limit > 0) {
                const canAdd = register.limit - register.balance;
                if (canAdd <= 0) {
                  message.warning(`Register is already at its limit (${fmt(register.limit)} ${register.currency}). No more money can be added.`);
                  return;
                }
                moneyForm.setFieldsValue({ amount: Math.round(canAdd * 100) / 100 });
              }
              setAddMoneyOpen(true);
            }}
          >
            Add Money
          </Button>
          </Tooltip>
          <Tooltip title={noBalance ? 'No available balance to record an expense' : undefined}>
            <Button
              icon={<MinusCircleOutlined />}
              style={!isClosed && !noBalance
                ? { background: REDWOOD.warning, borderColor: REDWOOD.warning, color: '#fff' }
                : {}}
              disabled={isClosed || noBalance}
              onClick={() => { expenseForm.resetFields(); setAddAcctDesc(''); setAddExpenseOpen(true); }}
            >
              Add Expense
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Transactions table */}
      <Table<PCTransaction>
        dataSource={transactions}
        columns={txnColumns}
        rowKey="transactionId"
        size="small"
        loading={txnLoading}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} transactions` }}
        scroll={{ x: 1600 }}
        locale={{ emptyText: 'No transactions yet — use Add Money or Add Expense to begin.' }}
        rowClassName={(r) => r.transactionType === 'Balance Refill' ? 'pc-row-refill' : ''}
        rowSelection={{
          type:            'checkbox',
          selectedRowKeys,
          onChange:        (keys) => setSelectedRowKeys(keys as number[]),
          getCheckboxProps: (rec) => ({
            disabled: rec.transactionType === 'Balance Refill',
          }),
        }}
      />

      {/* ── Add Money Modal ────────────────────────────────── */}
      <Modal
        title={<Space><DollarOutlined style={{ color: REDWOOD.success }} /> Add Money to Register</Space>}
        open={addMoneyOpen}
        onCancel={() => { setAddMoneyOpen(false); if (needsRefresh.current) { needsRefresh.current = false; onRefresh(); } }}
        footer={null}
        width={520}
        destroyOnClose
      >
        <Form form={moneyForm} layout="vertical" size="small" onFinish={handleAddMoney}>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="Transaction Date" name="transactionDate"
                rules={[{ required: true, message: 'Required' }]}
                initialValue={dayjs()}>
                <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY"
                  onChange={v => { if (v) moneyForm.setFieldsValue({ accountingDate: v }); }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Accounting Date" name="accountingDate" initialValue={dayjs()}>
                <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="AP Period" shouldUpdate>
                {({ getFieldValue }) => {
                  const d = getFieldValue('accountingDate') ?? getFieldValue('transactionDate');
                  if (!d) return <Input disabled placeholder="Select date" />;
                  if (!periodsLoaded) return <Input disabled placeholder="Loading…" />;
                  const p = findAPPeriod(d);
                  if (p) return <Input disabled value={p.periodName} style={{ color: REDWOOD.success, fontWeight: 600, background: '#f6ffed', borderColor: '#b7eb8f' }} />;
                  if (openPeriods.length === 0) return <Input disabled placeholder="Not synced" style={{ color: REDWOOD.warning }} />;
                  return <Input disabled placeholder="No open period" style={{ color: REDWOOD.error }} />;
                }}
              </Form.Item>
            </Col>
          </Row>
          {register.limit != null && register.limit > 0 && (
            <div style={{ marginBottom: 12, padding: '6px 10px', background: '#f6ffed', borderRadius: 6, border: '1px solid #b7eb8f', fontSize: 12 }}>
              <Space size={16}>
                <span><b>Limit:</b> {fmt(register.limit)} {register.currency}</span>
                <span><b>Balance:</b> {fmt(register.balance)} {register.currency}</span>
                <span style={{ color: REDWOOD.success, fontWeight: 600 }}>
                  <b>Can Add:</b> {fmt(Math.max(0, register.limit - register.balance))} {register.currency}
                </span>
              </Space>
            </div>
          )}
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Amount" name="amount"
                rules={[
                  { required: true, message: 'Required' },
                  { type: 'number', min: 0.01, message: 'Must be > 0' },
                  ...(register.limit != null && register.limit > 0 ? [{
                    type: 'number' as const,
                    max: Math.max(0, register.limit - register.balance),
                    message: `Cannot exceed limit — max ${fmt(Math.max(0, register.limit - register.balance))} ${register.currency}`,
                  }] : []),
                ]}>
                <InputNumber style={{ width: '100%' }} precision={2} min={0}
                  max={register.limit != null ? Math.max(0, register.limit - register.balance) : undefined}
                  placeholder="0.00" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Currency" name="currency" initialValue={register.currency}>
                <Select>
                  {['AED','USD','EUR','GBP','SAR','KWD','QAR','OMR','BHD','EGP','INR'].map(c =>
                    <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {/* ── Charge Account ── */}
          <Form.Item name="chargeAccountCcid" hidden><Input /></Form.Item>
          <Form.Item label="Charge Account">
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="chargeAccountDesc" noStyle>
                <Input placeholder="Browse to select account" readOnly />
              </Form.Item>
              <Button icon={<BankOutlined />} onClick={() => { setCoaTarget('money'); setCoaOpen(true); }}>
                Browse
              </Button>
            </Space.Compact>
            {moneyAcctDesc && (
              <div style={{ marginTop: 4, fontSize: 11, color: '#1677ff', paddingLeft: 2 }}>
                {moneyAcctDesc}
              </div>
            )}
          </Form.Item>

          {/* ── Bank Transaction link ── */}
          <Divider style={{ margin: '8px 0', fontSize: 12 }}>Bank Transaction</Divider>
          {linkedBankTxnRef ? (
            <div style={{ marginBottom: 12 }}>
              <div style={{ padding: '8px 12px', background: '#f6ffed', borderRadius: 6, border: '1px solid #b7eb8f', fontSize: 12, marginBottom: 8 }}>
                <Space>
                  <BankOutlined style={{ color: REDWOOD.success }} />
                  <span><b>Bank Txn ID:</b> <Text style={{ fontFamily: 'monospace', fontWeight: 700, color: REDWOOD.success, fontSize: 13 }}>{linkedBankTxnRef}</Text></span>
                  <Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>(saved to Bank Txn ID column)</Text>
                </Space>
              </div>
              <Collapse size="small" ghost>
                <Collapse.Panel header={<Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>POST response</Text>} key="post">
                  <pre style={{ fontSize: 10, maxHeight: 160, overflow: 'auto', background: '#f5f5f5', padding: 8, borderRadius: 4, margin: 0 }}>
                    {JSON.stringify(bankTxnPostResponse, null, 2)}
                  </pre>
                </Collapse.Panel>
                <Collapse.Panel header={<Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Lookup result (transaction_id source)</Text>} key="lookup">
                  <pre style={{ fontSize: 10, maxHeight: 160, overflow: 'auto', background: '#f5f5f5', padding: 8, borderRadius: 4, margin: 0 }}>
                    {JSON.stringify(bankTxnLookupResult, null, 2)}
                  </pre>
                </Collapse.Panel>
              </Collapse>
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <Button
                icon={<BankOutlined />}
                onClick={() => setBankTxnModalOpen(true)}
                style={{ width: '100%', borderStyle: 'dashed' }}
              >
                Create Bank Transaction
              </Button>
            </div>
          )}

          <Form.Item label="Reference No" name="referenceNo">
            <Input placeholder="Auto-filled from bank transaction reference" />
          </Form.Item>
          <Form.Item label="Comments" name="comments">
            <Input.TextArea rows={2} placeholder="Optional" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button onClick={() => setAddMoneyOpen(false)}>Cancel</Button>
            <Tooltip title={!linkedBankTxnRef ? 'Create a bank transaction first' : undefined}>
              <Button type="primary" htmlType="submit" loading={saving}
                disabled={!linkedBankTxnRef}
                style={{ background: linkedBankTxnRef ? REDWOOD.success : undefined, borderColor: linkedBankTxnRef ? REDWOOD.success : undefined }}>
                Add Money
              </Button>
            </Tooltip>
          </div>
        </Form>
      </Modal>

      {/* ── Create Bank Transaction Mini-Modal ────────────────── */}
      <Modal
        title={
          <Space style={{ width: '100%', justifyContent: 'space-between', paddingRight: 32 }}>
            <Space><BankOutlined style={{ color: REDWOOD.info }} /> Create Bank Transaction</Space>
            <Space size={4}>
              <Tooltip title={<><b>GET Bank Accounts</b><br />{BANK_ACCOUNTS_URL}</>} placement="bottomRight">
                <Tag icon={<ApiOutlined />} color="blue" style={{ cursor: 'help', fontSize: 11 }}>Bank Accounts</Tag>
              </Tooltip>
              <Tooltip title={<><b>POST External Transaction</b><br />{EXT_TXN_URL}</>} placement="bottomRight">
                <Tag icon={<ApiOutlined />} color="green" style={{ cursor: 'help', fontSize: 11 }}>Post Txn</Tag>
              </Tooltip>
            </Space>
          </Space>
        }
        open={bankTxnModalOpen}
        onCancel={() => setBankTxnModalOpen(false)}
        footer={null}
        width={620}
        destroyOnClose
        zIndex={1100}
      >
        <Form form={bankTxnForm} layout="vertical" size="small" onFinish={handleCreateBankTxn}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Business Unit" name="businessUnitName" rules={[{ required: true, message: 'Required' }]}>
                <Input
                  placeholder={register.businessUnit}
                  onBlur={e => {
                    const bu = e.target.value.trim();
                    if (bu) loadBankAccountsByBU(bu);
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Bank Account" name="bankAccountName" rules={[{ required: true, message: 'Required' }]}>
                <Select
                  showSearch allowClear placeholder="Select bank account"
                  options={bankAccounts.map(b => ({ value: b.name, label: b.name }))}
                  notFoundContent={<Text type="secondary" style={{ fontSize: 12 }}>No bank accounts found</Text>}
                  onChange={val => {
                    const acct = bankAccounts.find(b => b.name === val);
                    if (acct) {
                      bankTxnForm.setFieldsValue({ assetAccountCombination: acct.cashAccount });
                    }
                  }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="Amount" name="amount" rules={[{ required: true, message: 'Required' }]}>
                <InputNumber style={{ width: '100%' }} precision={2} placeholder="0.00" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Transaction Date" name="transactionDate" rules={[{ required: true, message: 'Required' }]}>
                <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Currency" name="currencyCode">
                <Select>
                  {['AED','USD','EUR','GBP','SAR','KWD','QAR','OMR','BHD','EGP','INR'].map(c =>
                    <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Transaction Type" name="transactionType">
                <Select placeholder="Select type" allowClear>
                  {['EFT','WIRE','CHECK','MISC'].map(t => <Option key={t} value={t}>{t}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Reference" name="referenceText">
                <Input placeholder="e.g. BANK-TXN-001" />
              </Form.Item>
            </Col>
          </Row>
          <Divider style={{ margin: '8px 0', fontSize: 11 }}>Account Coding</Divider>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Cash Account (Asset)">
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item name="assetAccountCombination" noStyle>
                    <Input readOnly placeholder="Select cash/bank account" style={{ fontFamily: 'monospace', fontSize: 11 }} />
                  </Form.Item>
                  <Button icon={<SearchOutlined />} onClick={() => { setCoaTarget('bankAsset'); setCoaOpen(true); }} />
                </Space.Compact>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Offset Account">
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item name="offsetAccountCombination" noStyle>
                    <Input readOnly placeholder="= Charge Account from Add Money" style={{ fontFamily: 'monospace', fontSize: 11 }} />
                  </Form.Item>
                  <Button icon={<SearchOutlined />} onClick={() => {
                    setCoaTarget('bankOffset');
                    setCoaOpen(true);
                  }} />
                </Space.Compact>
                <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginTop: 2 }}>Pre-filled from Charge Account</div>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Description" name="description">
            <Input.TextArea rows={2} placeholder="Optional" />
          </Form.Item>

          {/* ── API Inspector ── */}
          <Collapse size="small" style={{ marginBottom: 8 }}>
            <Collapse.Panel
              header={
                <Space size={4}>
                  <ApiOutlined style={{ color: REDWOOD.info }} />
                  <Text style={{ fontSize: 11 }}>API Inspector</Text>
                  <Text style={{ fontSize: 10, color: REDWOOD.neutral600 }}>
                    POST {EXT_TXN_URL}
                  </Text>
                  {bankTxnRawError && <Tag color="error" style={{ fontSize: 10 }}>Error</Tag>}
                  {bankTxnPostResponse?.status === 'success' && <Tag color="success" style={{ fontSize: 10 }}>Success</Tag>}
                </Space>
              }
              key="api"
            >
              <Text style={{ fontSize: 10, color: REDWOOD.neutral600, display: 'block', marginBottom: 4 }}>
                <b>Endpoint:</b> <Text code copyable style={{ fontSize: 10 }}>{EXT_TXN_URL}</Text>
              </Text>
              <Collapse size="small" ghost defaultActiveKey={['payload']}>
                <Collapse.Panel header={<Text style={{ fontSize: 11 }}>Request Payload (JSON)</Text>} key="payload">
                  <pre style={{ fontSize: 10, maxHeight: 200, overflow: 'auto', background: '#f0f5ff', padding: 8, borderRadius: 4, margin: 0, border: '1px solid #adc6ff' }}>
                    {bankTxnPayload ? JSON.stringify(bankTxnPayload, null, 2) : '— submit form to see payload —'}
                  </pre>
                </Collapse.Panel>
                {bankTxnPostResponse && (
                  <Collapse.Panel header={<Text style={{ fontSize: 11 }}>Response</Text>} key="response">
                    <pre style={{ fontSize: 10, maxHeight: 160, overflow: 'auto', background: bankTxnPostResponse?.status === 'success' ? '#f6ffed' : '#fff2f0', padding: 8, borderRadius: 4, margin: 0, border: `1px solid ${bankTxnPostResponse?.status === 'success' ? '#b7eb8f' : '#ffccc7'}` }}>
                      {JSON.stringify(bankTxnPostResponse, null, 2)}
                    </pre>
                  </Collapse.Panel>
                )}
                {bankTxnRawError && (
                  <Collapse.Panel header={<Text style={{ fontSize: 11, color: REDWOOD.error }}>Raw Error</Text>} key="rawerr">
                    <pre style={{ fontSize: 10, maxHeight: 120, overflow: 'auto', background: '#fff2f0', padding: 8, borderRadius: 4, margin: 0, border: '1px solid #ffccc7', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {bankTxnRawError}
                    </pre>
                  </Collapse.Panel>
                )}
              </Collapse>
            </Collapse.Panel>
          </Collapse>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button onClick={() => setBankTxnModalOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={bankTxnSaving}
              style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}>
              Create Bank Transaction
            </Button>
          </div>
        </Form>
      </Modal>

      {/* ── Add Expense Modal ──────────────────────────────── */}
      <Modal
        title={
          <Space>
            <MinusCircleOutlined style={{ color: REDWOOD.warning }} />
            Add Expense
            <Switch
              size="small"
              checkedChildren="Multiple Lines"
              unCheckedChildren="Single Line"
              checked={expenseMode === 'multi'}
              onChange={v => {
                setExpenseMode(v ? 'multi' : 'single');
                setExpenseLines([makeNewLine()]);
              }}
            />
          </Space>
        }
        open={addExpenseOpen}
        onCancel={() => {
          setAddExpenseOpen(false);
          setExpenseMode('single');
          setExpenseLines([makeNewLine()]);
          if (needsRefresh.current) { needsRefresh.current = false; onRefresh(); }
        }}
        footer={null}
        width={expenseMode === 'multi' ? 960 : 580}
        destroyOnClose
      >
        {/* ── Shared header form (used by both modes) ── */}
        <Form form={expenseForm} layout="vertical" size="small" onFinish={handleAddExpense}>
          <Row gutter={12}>
            <Col span={expenseMode === 'multi' ? 5 : 8}>
              <Form.Item label="Transaction Date" name="transactionDate"
                rules={[{ required: true, message: 'Required' }]}
                initialValue={dayjs()}>
                <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY"
                  onChange={v => { if (v) expenseForm.setFieldsValue({ accountingDate: v }); }} />
              </Form.Item>
            </Col>
            <Col span={expenseMode === 'multi' ? 5 : 8}>
              <Form.Item label="Accounting Date" name="accountingDate" initialValue={dayjs()}>
                <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
              </Form.Item>
            </Col>
            <Col span={expenseMode === 'multi' ? 4 : 8}>
              <Form.Item label="AP Period" shouldUpdate>
                {({ getFieldValue }) => {
                  const d = getFieldValue('accountingDate') ?? getFieldValue('transactionDate');
                  if (!d) return <Input disabled placeholder="Select date" />;
                  if (!periodsLoaded) return <Input disabled placeholder="Loading…" />;
                  const p = findAPPeriod(d);
                  if (p) return <Input disabled value={p.periodName} style={{ color: REDWOOD.success, fontWeight: 600, background: '#f6ffed', borderColor: '#b7eb8f' }} />;
                  if (openPeriods.length === 0) return <Input disabled placeholder="Not synced" style={{ color: REDWOOD.warning }} />;
                  return <Input disabled placeholder="No open period" style={{ color: REDWOOD.error }} />;
                }}
              </Form.Item>
            </Col>
            <Col span={expenseMode === 'multi' ? 5 : 12}>
              <Form.Item label="Currency" name="currency" initialValue={register.currency}>
                <Select>
                  {['AED','USD','EUR','GBP','SAR','KWD','QAR','OMR','BHD','EGP','INR'].map(c =>
                    <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={expenseMode === 'multi' ? 5 : 12}>
              <Form.Item label="Reference No" name="referenceNo">
                <Input placeholder="Optional" />
              </Form.Item>
            </Col>
          </Row>

          {/* ── SINGLE LINE MODE ── */}
          {expenseMode === 'single' && (
            <>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item label="Expense Type" name="expenseType"
                    rules={[{ required: true, message: 'Required' }]}>
                    <Select
                      placeholder="Select expense type"
                      showSearch
                      filterOption={(input, option) =>
                        String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                      onChange={(val) => {
                        const dist = distCombinations.find(d => d.combinationName === val);
                        expenseForm.setFieldsValue({
                          chargeAccountDesc: dist?.combinationName ?? '',
                          chargeAccountCcid: dist?.glAccountCcid ?? null,
                        });
                        setAddAcctDesc(dist?.glAccountDesc ?? '');
                      }}
                      options={distCombinations.map(d => ({
                        value: d.combinationName,
                        label: d.combinationName,
                      }))}
                      notFoundContent={
                        distCombinations.length === 0
                          ? <span style={{ fontSize: 12, color: REDWOOD.neutral600 }}>No combinations found — add them in AP Setup &gt; Manage Distribution Combinations</span>
                          : 'No match'
                      }
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Amount" name="amount"
                    rules={[{ required: true, message: 'Required' }, { type: 'number', min: 0.01, message: 'Must be > 0' }]}>
                    <InputNumber style={{ width: '100%' }} precision={2} min={0} placeholder="0.00" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="chargeAccountCcid" hidden><Input /></Form.Item>
              <Form.Item label="Charge Account">
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item name="chargeAccountDesc" noStyle>
                    <Input placeholder="Auto-filled when Expense Type is selected" />
                  </Form.Item>
                  <Button icon={<BankOutlined />} onClick={() => { setCoaTarget('add'); setCoaOpen(true); }}>
                    Browse
                  </Button>
                </Space.Compact>
                {addAcctDesc && (
                  <div style={{ marginTop: 4, fontSize: 11, color: '#1677ff', paddingLeft: 2 }}>
                    {addAcctDesc}
                  </div>
                )}
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item label="Employee Name" name="employeeName">
                    <Input prefix={<UserOutlined />} placeholder="Optional" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Receipt Status" name="receiptStatus">
                    <Select allowClear placeholder="Select">
                      <Option value="YES">YES</Option>
                      <Option value="NO">NO</Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label="Comments" name="comments">
                <Input.TextArea rows={2} placeholder="Optional" />
              </Form.Item>
              <Form.Item label="Attachment">
                <Space direction="vertical" style={{ width: '100%' }} size={4}>
                  <Upload
                    beforeUpload={(file) => {
                      const reader = new FileReader();
                      reader.readAsDataURL(file);
                      reader.onload = () => {
                        setAddExpenseAttachData(reader.result as string);
                        setAddExpenseAttachName(file.name);
                      };
                      return false;
                    }}
                    showUploadList={false}
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                    maxCount={1}
                  >
                    <Button icon={<UploadOutlined />}>
                      {addExpenseAttachName ? 'Replace file' : 'Upload file'}
                    </Button>
                  </Upload>
                  {addExpenseAttachName && (
                    <Space size={4}>
                      <PaperClipOutlined style={{ color: REDWOOD.info }} />
                      <Text style={{ fontSize: 12, color: REDWOOD.info }}>{addExpenseAttachName}</Text>
                      <Button type="text" size="small" danger icon={<CloseOutlined />}
                        onClick={() => { setAddExpenseAttachName(''); setAddExpenseAttachData(''); }} />
                    </Space>
                  )}
                </Space>
              </Form.Item>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <Button onClick={() => { setAddExpenseOpen(false); setAddExpenseAttachName(''); setAddExpenseAttachData(''); }}>Cancel</Button>
                <Button type="primary" htmlType="submit" loading={saving}
                  style={{ background: REDWOOD.warning, borderColor: REDWOOD.warning }}>
                  Save Expense
                </Button>
              </div>
            </>
          )}

          {/* ── MULTIPLE LINES MODE ── */}
          {expenseMode === 'multi' && (
            <>
              {/* Column headers */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '40px 1fr 110px 1fr 1fr 36px',
                gap: 6,
                padding: '4px 0',
                borderBottom: `1px solid ${REDWOOD.neutral200}`,
                marginBottom: 4,
              }}>
                {['S.No', 'Expense Type', 'Amount', 'Description', 'Account', ''].map((h, i) => (
                  <div key={i} style={{ fontSize: 11, fontWeight: 600, color: REDWOOD.neutral600, textAlign: i === 0 ? 'center' : 'left' }}>{h}</div>
                ))}
              </div>

              {/* Lines */}
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {expenseLines.map((line, idx) => (
                  <div key={line.key} style={{
                    display: 'grid',
                    gridTemplateColumns: '40px 1fr 110px 1fr 1fr 36px',
                    gap: 6,
                    marginBottom: 6,
                    alignItems: 'start',
                  }}>
                    {/* S.No */}
                    <div style={{ textAlign: 'center', paddingTop: 6, fontSize: 12, color: REDWOOD.neutral600 }}>{idx + 1}</div>

                    {/* Expense Type */}
                    <Select
                      size="small"
                      placeholder="Expense type"
                      showSearch
                      value={line.expenseType || undefined}
                      filterOption={(input, option) =>
                        String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                      onChange={(val) => {
                        const dist = distCombinations.find(d => d.combinationName === val);
                        updateLine(line.key, {
                          expenseType:       val,
                          chargeAccountDesc: dist?.combinationName ?? '',
                          chargeAccountCcid: dist?.glAccountCcid ?? null,
                          acctDesc:          dist?.glAccountDesc ?? '',
                        });
                      }}
                      options={distCombinations.map(d => ({ value: d.combinationName, label: d.combinationName }))}
                      style={{ width: '100%' }}
                    />

                    {/* Amount */}
                    <InputNumber
                      size="small"
                      style={{ width: '100%' }}
                      precision={2}
                      min={0}
                      placeholder="0.00"
                      value={line.amount ?? undefined}
                      onChange={v => updateLine(line.key, { amount: v as number | null })}
                    />

                    {/* Description */}
                    <Input
                      size="small"
                      placeholder="Description"
                      value={line.description}
                      onChange={e => updateLine(line.key, { description: e.target.value })}
                    />

                    {/* Account (code + desc stacked) */}
                    <div>
                      <Input
                        size="small"
                        placeholder="Auto-filled"
                        value={line.chargeAccountDesc}
                        onChange={e => updateLine(line.key, { chargeAccountDesc: e.target.value })}
                      />
                      {line.acctDesc && (
                        <div style={{ fontSize: 10, color: '#1677ff', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {line.acctDesc}
                        </div>
                      )}
                    </div>

                    {/* Delete */}
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<CloseOutlined />}
                      disabled={expenseLines.length === 1}
                      onClick={() => setExpenseLines(prev => prev.filter(l => l.key !== line.key))}
                    />
                  </div>
                ))}
              </div>

              {/* Add Line + Total */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <Button size="small" icon={<PlusOutlined />} onClick={() => setExpenseLines(prev => [...prev, makeNewLine()])}>
                  Add Line
                </Button>
                <Space>
                  <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>
                    Total:
                  </Text>
                  <Text strong style={{ fontSize: 13, color: REDWOOD.error }}>
                    {fmt(expenseLines.reduce((s, l) => s + (l.amount ?? 0), 0))} {register.currency}
                  </Text>
                  <Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>
                    / Balance: {fmt(register.balance)}
                  </Text>
                </Space>
              </div>

              <Divider style={{ margin: '10px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button onClick={() => { setAddExpenseOpen(false); setExpenseMode('single'); setExpenseLines([makeNewLine()]); }}>Cancel</Button>
                <Button
                  type="primary"
                  loading={saving}
                  style={{ background: REDWOOD.warning, borderColor: REDWOOD.warning }}
                  onClick={handleAddMultiExpense}
                >
                  Add Expense ({expenseLines.filter(l => l.expenseType && (l.amount ?? 0) > 0).length})
                </Button>
              </div>
            </>
          )}
        </Form>
      </Modal>

      {/* ── Edit Transaction Modal ─────────────────────────── */}
      <Modal
        title={
          <Space>
            <EditOutlined style={{ color: REDWOOD.info }} />
            {editTxn && (
              <>
                Edit Line #{editTxn.lineNumber}
                <Tag color={editTxn.transactionType === 'Balance Refill' ? 'blue' : editTxn.transactionType === 'Expense' ? 'orange' : 'purple'} style={{ fontSize: 11 }}>
                  {editTxn.transactionType}
                </Tag>
              </>
            )}
          </Space>
        }
        open={editTxnOpen}
        onCancel={() => { setEditTxnOpen(false); setEditTxn(null); editTxnForm.resetFields(); }}
        footer={null}
        width={580}
      >
        {editTxn && (
          <Form form={editTxnForm} layout="vertical" size="small" onFinish={handleSaveEditTransaction}>
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item label="Transaction Date" name="transactionDate"
                  rules={[{ required: true, message: 'Required' }]}>
                  <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="Accounting Date" name="accountingDate">
                  <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="Defaults to Txn Date" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="AP Period" shouldUpdate>
                  {({ getFieldValue }) => {
                    const d = getFieldValue('accountingDate') ?? getFieldValue('transactionDate');
                    if (!d) return <Input disabled placeholder="Select date" />;
                    if (!periodsLoaded) return <Input disabled placeholder="Loading…" />;
                    const p = findAPPeriod(d);
                    if (p) return <Input disabled value={p.periodName} style={{ color: REDWOOD.success, fontWeight: 600, background: '#f6ffed', borderColor: '#b7eb8f' }} />;
                    if (openPeriods.length === 0) return <Input disabled placeholder="Not synced" style={{ color: REDWOOD.warning }} />;
                    return <Input disabled placeholder="No open period" style={{ color: REDWOOD.error }} />;
                  }}
                </Form.Item>
              </Col>
            </Row>

            {editTxn.transactionType === 'Expense' && (
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item label="Expense Type" name="expenseType"
                    rules={[{ required: true, message: 'Required' }]}>
                    <Select
                      placeholder="Select expense type"
                      showSearch
                      filterOption={(input, option) =>
                        String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                      onChange={(val) => {
                        const dist = distCombinations.find(d => d.combinationName === val);
                        editTxnForm.setFieldsValue({
                          chargeAccountDesc: dist?.combinationName ?? editTxnForm.getFieldValue('chargeAccountDesc'),
                          chargeAccountCcid: dist?.glAccountCcid ?? editTxnForm.getFieldValue('chargeAccountCcid'),
                        });
                        setEditAcctDesc(dist?.glAccountDesc ?? '');
                      }}
                      options={distCombinations.map(d => ({ value: d.combinationName, label: d.combinationName }))}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Currency" name="currency">
                    <Select>
                      {['AED','USD','EUR','GBP','SAR','KWD','QAR','OMR','BHD','EGP','INR'].map(c =>
                        <Option key={c} value={c}>{c}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
            )}

            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  label={editTxn.transactionType === 'Expense' ? 'Amount (Debit)' : 'Amount (Credit)'}
                  name="amount"
                  rules={[{ required: true, message: 'Required' }, { type: 'number', min: 0.01, message: 'Must be > 0' }]}>
                  <InputNumber style={{ width: '100%' }} precision={2} min={0} placeholder="0.00" />
                </Form.Item>
              </Col>
              {editTxn.transactionType !== 'Expense' && (
                <Col span={12}>
                  <Form.Item label="Currency" name="currency">
                    <Select>
                      {['AED','USD','EUR','GBP','SAR','KWD','QAR','OMR','BHD','EGP','INR'].map(c =>
                        <Option key={c} value={c}>{c}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
              )}
              <Col span={12}>
                <Form.Item label="Reference No" name="referenceNo">
                  <Input placeholder="Optional" />
                </Form.Item>
              </Col>
            </Row>

            {editTxn.transactionType === 'Expense' && (
              <>
                <Form.Item name="chargeAccountCcid" hidden><Input /></Form.Item>
                <Form.Item label="Charge Account">
                  <Space.Compact style={{ width: '100%' }}>
                    <Form.Item name="chargeAccountDesc" noStyle>
                      <Input placeholder="Auto-filled from Expense Type" />
                    </Form.Item>
                    <Button icon={<BankOutlined />} onClick={() => { setCoaTarget('edit'); setCoaOpen(true); }}>
                      Browse
                    </Button>
                  </Space.Compact>
                  {editAcctDesc && (
                    <div style={{ marginTop: 4, fontSize: 11, color: '#1677ff', paddingLeft: 2 }}>
                      {editAcctDesc}
                    </div>
                  )}
                </Form.Item>
              </>
            )}

            {editTxn.transactionType === 'Expense' && (
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item label="Employee Name" name="employeeName">
                    <Input prefix={<UserOutlined />} placeholder="Optional" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Receipt Status" name="receiptStatus">
                    <Select allowClear placeholder="Select">
                      <Option value="YES">YES</Option>
                      <Option value="NO">NO</Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
            )}
            <Form.Item label="Comments" name="comments">
              <Input.TextArea rows={2} placeholder="Optional" />
            </Form.Item>
            {editTxn.transactionType === 'Expense' && (
              <Form.Item label="Attachment">
                <Space direction="vertical" style={{ width: '100%' }} size={4}>
                  <Space size={8}>
                    <Upload
                      beforeUpload={(file) => {
                        const reader = new FileReader();
                        reader.readAsDataURL(file);
                        reader.onload = () => {
                          setEditExpenseAttachData(reader.result as string);
                          setEditExpenseAttachName(file.name);
                        };
                        return false;
                      }}
                      showUploadList={false}
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                      maxCount={1}
                    >
                      <Button icon={<UploadOutlined />}>
                        {editExpenseAttachName ? 'Replace file' : 'Upload file'}
                      </Button>
                    </Upload>
                    {editExpenseAttachData && (
                      <Button size="small" icon={<EyeOutlined />}
                        onClick={() => { setViewAttachData(editExpenseAttachData); setViewAttachName(editExpenseAttachName); setViewAttachOpen(true); }}>
                        View
                      </Button>
                    )}
                  </Space>
                  {editExpenseAttachName && (
                    <Space size={4}>
                      <PaperClipOutlined style={{ color: REDWOOD.info }} />
                      <Text style={{ fontSize: 12, color: REDWOOD.info }}>{editExpenseAttachName}</Text>
                      <Button type="text" size="small" danger icon={<CloseOutlined />}
                        onClick={() => { setEditExpenseAttachName(''); setEditExpenseAttachData(''); }} />
                    </Space>
                  )}
                </Space>
              </Form.Item>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <Button onClick={() => { setEditTxnOpen(false); setEditTxn(null); setEditExpenseAttachName(''); setEditExpenseAttachData(''); }}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={saving}
                style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}>
                Save Changes
              </Button>
            </div>
          </Form>
        )}
      </Modal>

      {/* ── Account (COA) Selector ────────────────────────── */}
      <AccountSelector
        visible={coaOpen}
        onCancel={() => setCoaOpen(false)}
        onSelect={(accountCode, segmentDetails) => {
          const seg4Desc = Object.values(segmentDetails)[3]?.description || '';
          if (coaTarget === 'add') {
            expenseForm.setFieldsValue({ chargeAccountDesc: accountCode, chargeAccountCcid: null });
            setAddAcctDesc(seg4Desc);
          } else if (coaTarget === 'edit') {
            editTxnForm.setFieldsValue({ chargeAccountDesc: accountCode, chargeAccountCcid: null });
            setEditAcctDesc(seg4Desc);
          } else if (coaTarget === 'money') {
            moneyForm.setFieldsValue({ chargeAccountDesc: accountCode, chargeAccountCcid: null });
            setMoneyAcctDesc(seg4Desc);
            bankTxnForm.setFieldsValue({ offsetAccountCombination: accountCode });
          } else if (coaTarget === 'bankAsset') {
            bankTxnForm.setFieldsValue({ assetAccountCombination: accountCode });
          } else if (coaTarget === 'bankOffset') {
            bankTxnForm.setFieldsValue({ offsetAccountCombination: accountCode });
          }
          setCoaOpen(false);
        }}
      />

      {/* ── Bank Transaction Detail Popup ─────────────────────── */}
      <Modal
        title={<Space><BankOutlined style={{ color: REDWOOD.info }} /> Bank Transaction {bankTxnDetail?.transactionId ?? ''}</Space>}
        open={bankTxnDetailOpen}
        onCancel={() => setBankTxnDetailOpen(false)}
        footer={<Button onClick={() => setBankTxnDetailOpen(false)}>Close</Button>}
        width={620}
        zIndex={1050}
      >
        {bankTxnDetailLoading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><Text type="secondary">Loading…</Text></div>
        ) : bankTxnDetail ? (
          <Descriptions size="small" bordered column={2} labelStyle={{ fontWeight: 600, fontSize: 12 }} contentStyle={{ fontSize: 12 }}>
            <Descriptions.Item label="Txn Number">{bankTxnDetail.transactionId ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Status">{bankTxnDetail.status ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Bank Account" span={2}>{bankTxnDetail.bankAccountName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Business Unit" span={2}>{bankTxnDetail.businessUnitName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Txn Date">{bankTxnDetail.transactionDate ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Value Date">{bankTxnDetail.valueDate ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Amount">{bankTxnDetail.amount ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Currency">{bankTxnDetail.currencyCode ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Txn Type">{bankTxnDetail.transactionType ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Source">{bankTxnDetail.source ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Reference" span={2}>{bankTxnDetail.referenceText ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Asset Account" span={2}>
              <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>{bankTxnDetail.assetAccountCombination ?? '—'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Offset Account" span={2}>
              <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>{bankTxnDetail.offsetAccountCombination ?? '—'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Description" span={2}>{bankTxnDetail.description ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Created By">{bankTxnDetail.createdBy ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Created On">{bankTxnDetail.creationDate ?? '—'}</Descriptions.Item>
          </Descriptions>
        ) : (
          <div style={{ textAlign: 'center', padding: 32 }}><Text type="secondary">Bank transaction not found.</Text></div>
        )}
      </Modal>

      {/* ── Attachment Viewer ──────────────────────────────── */}
      <Modal
        title={<Space><PaperClipOutlined style={{ color: REDWOOD.info }} />{viewAttachName || 'Attachment'}</Space>}
        open={viewAttachOpen}
        onCancel={() => setViewAttachOpen(false)}
        footer={[
          <Button key="download" type="primary" icon={<DownloadOutlined />}
            onClick={() => {
              const a = document.createElement('a');
              a.href = viewAttachData;
              a.download = viewAttachName || 'attachment';
              a.click();
            }}>
            Download
          </Button>,
          <Button key="close" onClick={() => setViewAttachOpen(false)}>Close</Button>,
        ]}
        width={700}
        zIndex={1050}
      >
        {viewAttachData.startsWith('data:image') ? (
          <img src={viewAttachData} alt={viewAttachName} style={{ width: '100%', maxHeight: 500, objectFit: 'contain' }} />
        ) : viewAttachData.startsWith('data:application/pdf') ? (
          <iframe src={viewAttachData} title={viewAttachName} style={{ width: '100%', height: 500, border: 'none' }} />
        ) : (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <PaperClipOutlined style={{ fontSize: 48, color: REDWOOD.neutral300 }} />
            <div style={{ marginTop: 12 }}>
              <Text type="secondary">Preview not available for this file type.</Text>
            </div>
            <div style={{ marginTop: 8 }}>
              <Text style={{ fontSize: 12 }}>{viewAttachName}</Text>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Create Accounting Modal ───────────────────────────── */}
      <Modal
        title={<Space><CheckCircleOutlined style={{ color: REDWOOD.info }} />Create Accounting</Space>}
        open={acctModalOpen}
        onCancel={() => { if (!acctRunning) { setAcctModalOpen(false); } }}
        footer={
          acctDone
            ? <Button onClick={() => setAcctModalOpen(false)}>Close</Button>
            : [
                <Button key="api" icon={<ApiOutlined />} onClick={openApiDebug}
                  loading={apiDebugLoading} disabled={acctRunning}
                  style={{ float: 'left' }}>
                  Show API
                </Button>,
                <Button key="cancel" onClick={() => setAcctModalOpen(false)} disabled={acctRunning}>Cancel</Button>,
                <Button key="run" type="primary" loading={acctRunning}
                  disabled={acctProgress.every(r => r.status === 'skipped')}
                  style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
                  onClick={runCreateAccounting}>
                  {acctRunning ? 'Processing…' : 'Run Create Accounting'}
                </Button>,
              ]
        }
        width={900}
        destroyOnClose
      >
        {!register.cashAccountDesc && (
          <Alert
            type="warning"
            showIcon
            icon={<ExclamationCircleOutlined />}
            message="Register has no cash account configured"
            description="Set the GL Cash Account in the register settings before creating accounting entries."
            style={{ marginBottom: 12 }}
          />
        )}
        {acctProgress.length > 0 && (() => {
          const periods = [...new Set(acctProgress.map(r => r.periodName))].filter(Boolean);
          return (
            <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Accounting Period{periods.length > 1 ? 's' : ''}:</Text>
              {periods.map(p => (
                <Tag key={p} color="blue" style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>{p}</Tag>
              ))}
            </div>
          );
        })()}
        <Table<AcctProgressRow>
          dataSource={acctProgress}
          rowKey="txnId"
          size="small"
          pagination={false}
          columns={[
            { title: 'Line #', dataIndex: 'lineNumber', width: 55, align: 'center' as const,
              render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text> },
            { title: 'Type', dataIndex: 'transactionType', width: 100,
              render: (v, r) => {
                const color = v === 'Expense' ? 'orange' : 'purple';
                return <><Tag color={color} style={{ fontSize: 11 }}>{v}</Tag>
                  {r.expenseType && <div style={{ fontSize: 10, color: REDWOOD.neutral600, marginTop: 1 }}>{r.expenseType}</div>}</>;
              }},
            { title: 'Acct Date', dataIndex: 'accountingDate', width: 96,
              render: (v) => <Text style={{ fontSize: 11 }}>{v ? v.slice(0, 10) : '—'}</Text> },
            { title: 'Amount', dataIndex: 'amount', width: 110, align: 'right' as const,
              render: (v, r) => <Text style={{ fontSize: 12, fontWeight: 600 }}>{fmt(v)} {r.currency}</Text> },
            { title: 'DR Account', dataIndex: 'drAccount',
              render: (v, r) => (
                <div>
                  <Text style={{ fontSize: 11, fontFamily: 'monospace', color: REDWOOD.error }}>{v || '—'}</Text>
                  {r.drAccountDesc && (
                    <div style={{ fontSize: 10, color: REDWOOD.neutral600, marginTop: 1 }}>{r.drAccountDesc}</div>
                  )}
                </div>
              )},
            { title: 'CR Account', dataIndex: 'crAccount',
              render: (v, r) => (
                <div>
                  <Text style={{ fontSize: 11, fontFamily: 'monospace', color: REDWOOD.success }}>{v || '—'}</Text>
                  {r.crAccountDesc && (
                    <div style={{ fontSize: 10, color: REDWOOD.neutral600, marginTop: 1 }}>{r.crAccountDesc}</div>
                  )}
                </div>
              )},
            { title: 'Status', dataIndex: 'status', width: 130,
              render: (v, r) => {
                if (v === 'pending')  return <Tag color="default" style={{ fontSize: 11 }}>Pending</Tag>;
                if (v === 'running')  return <Tag icon={<SyncOutlined spin />} color="processing" style={{ fontSize: 11 }}>Running</Tag>;
                if (v === 'success')  return <><Tag color="success" style={{ fontSize: 11 }}>Done</Tag>
                  {r.message && <div style={{ fontSize: 10, color: REDWOOD.success, marginTop: 2 }}>{r.message}</div>}</>;
                if (v === 'error')    return <><Tag color="error" style={{ fontSize: 11 }}>Error</Tag>
                  {r.message && <div style={{ fontSize: 10, color: REDWOOD.error, marginTop: 2 }}>{r.message}</div>}</>;
                if (v === 'skipped')  return <Tag color="warning" style={{ fontSize: 11 }}>Already Posted</Tag>;
                return null;
              }},
          ]}
        />
        {acctDone && (
          <Alert
            type={acctProgress.some(r => r.status === 'error') ? 'warning' : 'success'}
            showIcon
            message={acctProgress.some(r => r.status === 'error')
              ? 'Accounting completed with some errors — review the rows above'
              : 'Accounting created and posted successfully'}
            style={{ marginTop: 12 }}
          />
        )}
      </Modal>

      {/* ── View Accounting Modal ──────────────────────────────── */}
      <Modal
        title={
          <Space>
            <BookOutlined style={{ color: REDWOOD.success }} />
            Accounting – Line #{viewAcctTxn?.lineNumber} ({viewAcctTxn?.transactionType})
          </Space>
        }
        open={viewAcctOpen}
        onCancel={() => setViewAcctOpen(false)}
        footer={<Button onClick={() => setViewAcctOpen(false)}>Close</Button>}
        width={680}
        zIndex={1050}
      >
        {viewAcctLoading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
        ) : !viewAcctData?.found ? (
          <Alert
            type="info"
            showIcon
            message="No accounting entries found for this transaction"
            description="Use 'Create Accounting' to generate subledger entries."
          />
        ) : (
          <>
            <Descriptions size="small" bordered column={2}
              labelStyle={{ fontWeight: 600, fontSize: 12 }} contentStyle={{ fontSize: 12 }}
              style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Status">
                <Tag color={viewAcctData.accountingStatus === 'POSTED' ? 'green' : viewAcctData.accountingStatus === 'DRAFT' ? 'orange' : 'red'}
                  style={{ fontSize: 11 }}>
                  {viewAcctData.accountingStatus}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Posting">
                <Tag color={viewAcctData.postingStatus === 'POSTED' ? 'green' : 'default'} style={{ fontSize: 11 }}>
                  {viewAcctData.postingStatus}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Accounting Date">{viewAcctData.accountingDate ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Period">{viewAcctData.periodName ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="GL Batch" span={2}>
                {viewAcctData.glBatchName
                  ? <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>{viewAcctData.glBatchName}</Text>
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Posted By">{viewAcctData.postedBy ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Posted Date">{viewAcctData.postedDate ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Description" span={2}>{viewAcctData.description ?? '—'}</Descriptions.Item>
            </Descriptions>
            <Table
              dataSource={viewAcctData.lines}
              rowKey="lineId"
              size="small"
              pagination={false}
              columns={[
                { title: '#', dataIndex: 'lineNumber', width: 40, align: 'center' as const },
                { title: 'Dr/Cr', dataIndex: 'lineType', width: 50, align: 'center' as const,
                  render: (v) => <Tag color={v === 'DR' ? 'red' : 'green'} style={{ fontSize: 11 }}>{v}</Tag> },
                { title: 'Class', dataIndex: 'accountingClass', width: 100,
                  render: (v) => <Text style={{ fontSize: 11 }}>{v}</Text> },
                { title: 'Account', dataIndex: 'accountCombination',
                  render: (v, r) => {
                    const desc = viewAcctLineDescs.get(v) || '';
                    const color = r.lineType === 'DR' ? REDWOOD.error : REDWOOD.success;
                    return (
                      <div>
                        <Text style={{ fontSize: 11, fontFamily: 'monospace', color }}>{v}</Text>
                        {desc && <div style={{ fontSize: 10, color: REDWOOD.neutral600, marginTop: 1 }}>{desc}</div>}
                      </div>
                    );
                  }},
                { title: 'Debit', dataIndex: 'enteredDr', width: 110, align: 'right' as const,
                  render: (v) => v > 0
                    ? <Text style={{ fontSize: 12, color: REDWOOD.error }}>{fmt(v)}</Text>
                    : <Text style={{ fontSize: 12, color: REDWOOD.neutral300 }}>—</Text> },
                { title: 'Credit', dataIndex: 'enteredCr', width: 110, align: 'right' as const,
                  render: (v) => v > 0
                    ? <Text style={{ fontSize: 12, color: REDWOOD.success }}>{fmt(v)}</Text>
                    : <Text style={{ fontSize: 12, color: REDWOOD.neutral300 }}>—</Text> },
              ]}
            />
          </>
        )}
      </Modal>

      {/* ── API Debug Modal ───────────────────────────────────── */}
      <Modal
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} />API Inspector — Create Accounting</Space>}
        open={apiDebugOpen}
        onCancel={() => setApiDebugOpen(false)}
        footer={<Button onClick={() => setApiDebugOpen(false)}>Close</Button>}
        width={860}
        destroyOnClose
      >
        {apiDebugLoading
          ? <div style={{ textAlign: 'center', padding: 40 }}><Spin tip="Building payloads…" /></div>
          : apiDebugItems.length === 0
          ? <Text type="secondary">No payloads to show.</Text>
          : apiDebugItems.map((item, idx) => (
            <div key={idx} style={{ marginBottom: 16, border: '1px solid #e5e5e5', borderRadius: 6, overflow: 'hidden' }}>
              {/* Header bar */}
              <div style={{ background: '#f0f4fa', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Space size={6}>
                  <Tag color="blue" style={{ margin: 0, fontFamily: 'monospace', fontSize: 11 }}>POST</Tag>
                  <Text style={{ fontSize: 12, fontWeight: 600 }}>{item.label}</Text>
                </Space>
                <Button size="small" type="primary" loading={item.loading}
                  disabled={item.label.includes('sla/accounting/post')}
                  title={item.label.includes('sla/accounting/post') ? 'Needs live IDs from previous steps' : 'Send request'}
                  onClick={() => testApiItem(idx)}>
                  Test
                </Button>
              </div>
              {/* URL */}
              <div style={{ padding: '6px 12px', background: '#fafafa', borderBottom: '1px solid #e5e5e5', fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all', color: REDWOOD.neutral600 }}>
                {item.url}
              </div>
              {/* Body */}
              <div style={{ padding: '0 12px' }}>
                <Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Request Body:</Text>
                <pre style={{ fontSize: 11, background: '#1e1e1e', color: '#d4d4d4', padding: '10px 12px', borderRadius: 4, overflowX: 'auto', marginTop: 4, maxHeight: 260 }}>
                  {JSON.stringify(item.body, null, 2)}
                </pre>
              </div>
              {/* Response */}
              {(item.response !== undefined || item.error) && (
                <div style={{ padding: '0 12px 10px' }}>
                  <Text style={{ fontSize: 11, color: item.error ? REDWOOD.error : REDWOOD.success }}>
                    {item.error ? `Error: ${item.error}` : 'Response:'}
                  </Text>
                  {item.response && (
                    <pre style={{ fontSize: 11, background: item.error ? '#fff0f0' : '#f0fff4', color: '#333', padding: '8px 12px', borderRadius: 4, overflowX: 'auto', marginTop: 4 }}>
                      {JSON.stringify(item.response, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          ))
        }
      </Modal>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
const PC_BASE = `${APEX_DB_CONFIG.baseUrl}/pc`;

const PC_API_ENDPOINTS: ApiEndpoint[] = [
  {
    method: 'GET', url: `${PC_BASE}/registers`,
    description: 'Search all petty cash registers',
    params: 'q (name contains), status (ACTIVE|CLOSED), dateFrom (YYYY-MM-DD), dateTo (YYYY-MM-DD)',
  },
  {
    method: 'POST', url: `${PC_BASE}/registers`,
    description: 'Create a new petty cash register',
    body: 'registerName*, businessUnit*, startDate, endDate, comments, cashAccountDesc, currency, createdBy',
    sampleBody: JSON.stringify({ registerName: 'Main Office Petty Cash', businessUnit: 'Business Unit Name', currency: 'AED', startDate: '2026-01-01', cashAccountDesc: '01-100-1010-000', createdBy: 'ADMIN' }, null, 2),
  },
  {
    method: 'GET', url: `${PC_BASE}/registers/:registerId`,
    description: 'Get single register with live balance, totalDebit, totalCredit',
  },
  {
    method: 'PUT', url: `${PC_BASE}/registers/:registerId`,
    description: 'Update register header fields',
    body: 'registerName, startDate, endDate, comments, cashAccountDesc, currency, status, updatedBy',
    sampleBody: JSON.stringify({ status: 'CLOSED', updatedBy: 'ADMIN' }, null, 2),
  },
  {
    method: 'DELETE', url: `${PC_BASE}/registers/:registerId`,
    description: 'Delete register — blocked if transactions exist',
  },
  {
    method: 'GET', url: `${PC_BASE}/registers/:registerId/transactions`,
    description: 'Get all transaction lines with running balance (analytic window)',
  },
  {
    method: 'POST', url: `${PC_BASE}/transactions`,
    description: 'Create a transaction — Balance Refill (debit) or Expense (credit)',
    body: 'registerId*, transactionDate*, transactionType*, currency, debitAmount, creditAmount, expenseType, chargeAccountCcid, chargeAccountDesc, accountingDate, postingStatus, comments, referenceNo, attachment, createdBy',
    sampleBody: JSON.stringify({ registerId: 1001, transactionDate: '2026-04-18', transactionType: 'Expense', expenseType: 'Meals & Entertainment', currency: 'AED', debitAmount: 0, creditAmount: 150, referenceNo: 'EXP-001', comments: 'Team lunch', createdBy: 'ADMIN' }, null, 2),
  },
  {
    method: 'PUT', url: `${PC_BASE}/transactions/:transactionId`,
    description: 'Update a transaction line',
    body: 'transactionDate, transactionType, expenseType, chargeAccountCcid, chargeAccountDesc, accountingDate, postingStatus, currency, debitAmount, creditAmount, comments, referenceNo, attachment, updatedBy',
    sampleBody: JSON.stringify({ postingStatus: 'Posted', updatedBy: 'ADMIN' }, null, 2),
  },
  {
    method: 'DELETE', url: `${PC_BASE}/transactions/:transactionId`,
    description: 'Delete a transaction line',
  },
];

const PettyCash: React.FC = () => {
  const { user } = useAuth();
  const currentUser = user?.username || 'SYSTEM';

  const [searchForm]    = Form.useForm();
  const [registerForm]  = Form.useForm();
  const [editRegForm]   = Form.useForm();
  const [regActionForm] = Form.useForm();

  const [activeTab, setActiveTab]             = useState('search');
  const [openTabs, setOpenTabs]               = useState<RegisterTab[]>([]);
  const [cashAccountNames, setCashAccountNames] = useState<Map<number, string>>(new Map());
  const [createTabOpen, setCreateTabOpen]     = useState(false);
  const openingKeys = React.useRef<Set<string>>(new Set());

  const [registers, setRegisters]             = useState<PCRegister[]>([]);
  const [searchLoading, setSearchLoading]     = useState(false);
  const [saveLoading, setSaveLoading]         = useState(false);
  const [deleteLoading, setDeleteLoading]     = useState<number | null>(null);
  const [searched, setSearched]               = useState(false);
  const [businessUnits, setBusinessUnits]     = useState<string[]>([]);

  // Edit register header
  const [editRegOpen, setEditRegOpen]         = useState(false);
  const [editRegTarget, setEditRegTarget]     = useState<RegisterTab | null>(null);
  const [editRegLoading, setEditRegLoading]   = useState(false);
  const [coaRegOpen, setCoaRegOpen]           = useState(false);

  // Close / Open register action
  const [regActionOpen, setRegActionOpen]     = useState(false);
  const [regActionTarget, setRegActionTarget] = useState<RegisterTab | null>(null);
  const [regActionLoading, setRegActionLoading] = useState(false);

  // ── Load Business Units on mount ───────────────────────────
  useEffect(() => {
    fetch(`${APEX_DB_CONFIG.baseUrl}/gl/businessunits`, { headers: { Accept: 'application/json' } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const items: any[] = Array.isArray(data) ? data : (data.items || []);
        setBusinessUnits(items.map((i: any) => i.business_unit_name || '').filter(Boolean));
      })
      .catch(() => {});
  }, []);

  // ── Search ────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    setSearchLoading(true);
    try {
      const values = searchForm.getFieldsValue();
      const rows = await searchRegisters({
        q:        values.registerName || undefined,
        status:   values.status       || undefined,
        bu:       values.businessUnit  || undefined,
        dateFrom: values.dateFrom ? values.dateFrom.format('YYYY-MM-DD') : undefined,
        dateTo:   values.dateTo   ? values.dateTo.format('YYYY-MM-DD')   : undefined,
      });
      setRegisters(rows);
      setSearched(true);
    } catch (e: any) {
      message.error(e?.message ?? 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  }, [searchForm]);

  useEffect(() => {
    searchForm.setFieldsValue({ status: 'ACTIVE' });
    handleSearch();
  }, []);  // auto-search on mount with ACTIVE default

  // ── Resolve cash account descriptions for open tabs ────────
  useEffect(() => {
    openTabs.forEach(tab => {
      const reg = tab.register;
      if (!reg.cashAccountDesc || cashAccountNames.has(reg.registerId)) return;
      validateAccountCode(reg.cashAccountDesc).then(result => {
        if (!result.segmentsLoaded || !Object.keys(result.segmentDetails).length) return;
        const name = Object.values(result.segmentDetails)
          .filter(d => d.description)
          .map(d => d.description)
          .join(' · ');
        if (name) setCashAccountNames(prev => new Map(prev).set(reg.registerId, name));
      });
    });
  }, [openTabs]);

  // ── Open register detail tab ───────────────────────────────
  const openRegisterTab = useCallback(async (reg: PCRegister) => {
    const key = `reg-${reg.registerId}`;
    // Guard: if already open or currently being opened, just switch to it
    if (openingKeys.current.has(key)) { setActiveTab(key); return; }
    if (openTabs.find(t => t.key === key)) { setActiveTab(key); return; }

    openingKeys.current.add(key);
    const newTab: RegisterTab = { key, register: reg, transactions: [], txnLoading: true };
    setOpenTabs(prev => {
      if (prev.find(t => t.key === key)) return prev;  // double-check inside updater
      return [...prev, newTab];
    });
    setActiveTab(key);

    try {
      const txns = await getTransactions(reg.registerId);
      setOpenTabs(prev => prev.map(t => t.key === key ? { ...t, transactions: txns, txnLoading: false } : t));
    } catch {
      setOpenTabs(prev => prev.map(t => t.key === key ? { ...t, txnLoading: false } : t));
    } finally {
      openingKeys.current.delete(key);
    }
  }, [openTabs]);

  // ── Refresh a tab (register header + transactions) ──────────
  const refreshTab = useCallback(async (key: string) => {
    const tab = openTabs.find(t => t.key === key);
    if (!tab) return;
    setOpenTabs(prev => prev.map(t => t.key === key ? { ...t, txnLoading: true } : t));
    try {
      const [reg, txns] = await Promise.all([
        getRegister(tab.register.registerId),
        getTransactions(tab.register.registerId),
      ]);
      setOpenTabs(prev => prev.map(t => t.key === key ? { ...t, register: reg, transactions: txns, txnLoading: false } : t));
      setRegisters(prev => prev.map(r => r.registerId === reg.registerId ? reg : r));
    } catch {
      setOpenTabs(prev => prev.map(t => t.key === key ? { ...t, txnLoading: false } : t));
    }
  }, [openTabs]);

  // ── Close tab ──────────────────────────────────────────────
  const closeTab = (key: string) => {
    const remaining = openTabs.filter(t => t.key !== key);
    setOpenTabs(remaining);
    if (activeTab === key) setActiveTab(remaining.length ? remaining[remaining.length - 1].key : 'search');
  };

  // ── Create register ────────────────────────────────────────
  const handleCreateRegister = async (values: any) => {
    setSaveLoading(true);
    try {
      const result = await createRegister({
        registerName:    values.registerName,
        businessUnit:    values.businessUnit,
        startDate:       values.startDate ? values.startDate.format('YYYY-MM-DD') : undefined,
        endDate:         values.endDate   ? values.endDate.format('YYYY-MM-DD')   : undefined,
        comments:        values.comments,
        cashAccountDesc: values.cashAccountDesc,
        ownedBy:         values.ownedBy   || null,
        limit:           values.limit     ?? null,
        currency:        values.currency || 'AED',
        status:          values.status   || 'DRAFT',
        createdBy:       currentUser,
      });
      message.success(`Register #${result.registerId} created`);
      registerForm.resetFields();
      setCreateTabOpen(false);
      setActiveTab('search');
      await handleSearch();
    } catch (e: any) {
      message.error(e?.message ?? 'Failed to create register');
    } finally {
      setSaveLoading(false);
    }
  };

  // ── Delete register ────────────────────────────────────────
  const handleDelete = async (reg: PCRegister, e: React.MouseEvent) => {
    e.stopPropagation();
    if (reg.status !== 'DRAFT') {
      message.warning(`Only Draft registers can be deleted — "${reg.registerName}" is ${reg.status}`);
      return;
    }
    Modal.confirm({
      title: `Delete "${reg.registerName}"?`,
      content: 'This cannot be undone. Only Draft registers with no transactions can be deleted.',
      okText: 'Delete', okButtonProps: { danger: true },
      onOk: async () => {
        setDeleteLoading(reg.registerId);
        try {
          await deleteRegister(reg.registerId);
          message.success('Register deleted');
          closeTab(`reg-${reg.registerId}`);
          await handleSearch();
        } catch (e: any) {
          message.error(e?.message ?? 'Delete failed');
        } finally {
          setDeleteLoading(null);
        }
      },
    });
  };

  // ── Edit register header ──────────────────────────────────
  const openEditReg = (tab: RegisterTab) => {
    setEditRegTarget(tab);
    editRegForm.setFieldsValue({
      cashAccountDesc: tab.register.cashAccountDesc,
      ownedBy:         tab.register.ownedBy,
      limit:           tab.register.limit,
    });
    setEditRegOpen(true);
  };

  const handleEditRegister = async (values: any) => {
    if (!editRegTarget) return;
    setEditRegLoading(true);
    try {
      await updateRegister(editRegTarget.register.registerId, {
        cashAccountDesc: values.cashAccountDesc || null,
        ownedBy:         values.ownedBy         || null,
        limit:           values.limit           ?? null,
        updatedBy:       currentUser,
      });
      message.success('Register updated');
      setEditRegOpen(false);
      await refreshTab(editRegTarget.key);
      await handleSearch();
    } catch (e: any) {
      message.error(e?.message ?? 'Update failed');
    } finally {
      setEditRegLoading(false);
    }
  };

  // ── Change register status ────────────────────────────────
  const openRegAction = (tab: RegisterTab) => {
    setRegActionTarget(tab);
    regActionForm.setFieldsValue({ status: tab.register.status, comments: '' });
    setRegActionOpen(true);
  };

  const handleRegAction = async (values: any) => {
    if (!regActionTarget) return;
    setRegActionLoading(true);
    try {
      await updateRegister(regActionTarget.register.registerId, {
        status:    values.status,
        comments:  values.comments || undefined,
        updatedBy: currentUser,
      });
      message.success(`Status changed to ${values.status}`);
      setRegActionOpen(false);
      await refreshTab(regActionTarget.key);
      await handleSearch();
    } catch (e: any) {
      message.error(e?.message ?? 'Action failed');
    } finally {
      setRegActionLoading(false);
    }
  };

  // ── Search results columns ─────────────────────────────────
  const searchColumns: ColumnsType<PCRegister> = [
    { title: 'ID', dataIndex: 'registerId', width: 70, align: 'center',
      render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Register Name', dataIndex: 'registerName', width: 220,
      render: (v, rec) => (
        <Button type="link" style={{ padding: 0, fontSize: 13, fontWeight: 500 }}
          onClick={(e) => { e.stopPropagation(); openRegisterTab(rec); }}>
          {v}
        </Button>
      )},
    { title: 'Business Unit', dataIndex: 'businessUnit', width: 200, ellipsis: true,
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Currency', dataIndex: 'currency', width: 80, align: 'center',
      render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Status', dataIndex: 'status', width: 90,
      render: (v) => <StatusTag status={v} /> },
    { title: 'Balance', dataIndex: 'balance', width: 130, align: 'right',
      render: (v, rec) => (
        <Text style={{ fontSize: 13, fontWeight: 600,
          color: v >= 0 ? REDWOOD.success : REDWOOD.error }}>
          {fmt(v)} <span style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{rec.currency}</span>
        </Text>
      )},
    { title: 'Total In', dataIndex: 'totalDebit', width: 110, align: 'right',
      render: (v) => <Text style={{ fontSize: 12, color: REDWOOD.success }}>{fmt(v)}</Text> },
    { title: 'Total Out', dataIndex: 'totalCredit', width: 110, align: 'right',
      render: (v) => <Text style={{ fontSize: 12, color: REDWOOD.error }}>{fmt(v)}</Text> },
    { title: 'Start Date', dataIndex: 'startDate', width: 100,
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'End Date', dataIndex: 'endDate', width: 100,
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Owned By', dataIndex: 'ownedBy', width: 130, ellipsis: true,
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Limit', dataIndex: 'limit', width: 110, align: 'right',
      render: (v, rec) => v != null
        ? <Text style={{ fontSize: 12, fontWeight: 500 }}>{fmt(v)} <span style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{rec.currency}</span></Text>
        : <Text style={{ fontSize: 12, color: REDWOOD.neutral300 }}>—</Text> },
    { title: 'Cash Account', dataIndex: 'cashAccountDesc', ellipsis: true,
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Created By', dataIndex: 'createdBy', ellipsis: true,
      render: (v) => <Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{v || '—'}</Text> },
    { title: '', key: 'actions', width: 60, align: 'center',
      render: (_, rec) => {
        const canDelete = rec.status === 'DRAFT';
        return (
          <Tooltip title={canDelete ? 'Delete register' : `${rec.status} registers cannot be deleted`}>
            <Button type="text" danger size="small" icon={<DeleteOutlined />}
              loading={deleteLoading === rec.registerId}
              disabled={!canDelete}
              onClick={(e) => handleDelete(rec, e)} />
          </Tooltip>
        );
      }},
  ];

  // ── Tab items ──────────────────────────────────────────────
  const tabItems = [
    // Search tab
    {
      key: 'search',
      label: <Space><SearchOutlined />Registers</Space>,
      children: (
        <div style={{ padding: '12px 0' }}>
          {/* Search form */}
          <Collapse
            defaultActiveKey={['search']}
            style={{ marginBottom: 12, borderRadius: 8 }}
            items={[{
              key: 'search',
              label: <Text style={{ fontWeight: 500 }}>Search Criteria</Text>,
              children: (
                <Form form={searchForm} layout="vertical" size="small">
                  <Row gutter={16}>
                    <Col span={5}>
                      <Form.Item label="Register Name" name="registerName">
                        <Input placeholder="Search by name" allowClear />
                      </Form.Item>
                    </Col>
                    <Col span={5}>
                      <Form.Item label="Business Unit" name="businessUnit">
                        <Select placeholder="All BUs" allowClear showSearch
                          filterOption={(v, o) => String(o?.value ?? '').toLowerCase().includes(v.toLowerCase())}>
                          {businessUnits.map(bu => <Option key={bu} value={bu}>{bu}</Option>)}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={3}>
                      <Form.Item label="Status" name="status">
                        <Select placeholder="All" allowClear>
                          <Option value="DRAFT">Draft</Option>
                          <Option value="ACTIVE">Active</Option>
                          <Option value="INACTIVE">Inactive</Option>
                          <Option value="CLOSED">Closed</Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item label="Start Date From" name="dateFrom">
                        <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item label="Start Date To" name="dateTo">
                        <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
                      </Form.Item>
                    </Col>
                    <Col span={3} style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 24 }}>
                      <Space>
                        <Button type="primary" icon={<SearchOutlined />}
                          style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                          onClick={handleSearch} loading={searchLoading}>
                          Search
                        </Button>
                        <Button icon={<ReloadOutlined />} onClick={() => {
                          searchForm.resetFields(); handleSearch();
                        }}>
                          Reset
                        </Button>
                      </Space>
                    </Col>
                  </Row>
                </Form>
              ),
            }]}
          />

          {/* Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 13, color: REDWOOD.neutral600 }}>
              {searched ? `${registers.length} register(s) found` : ''}
            </Text>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
              onClick={() => { setCreateTabOpen(true); setActiveTab('create'); }}
            >
              New Register
            </Button>
          </div>

          {/* Results table */}
          <Table<PCRegister>
            dataSource={registers}
            columns={searchColumns}
            rowKey="registerId"
            size="small"
            loading={searchLoading}
            pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (t) => `${t} registers` }}
            scroll={{ x: 1100 }}
            onRow={(rec) => ({ onClick: () => openRegisterTab(rec), style: { cursor: 'pointer' } })}
            locale={{ emptyText: 'No registers found. Click New Register to create one.' }}
          />
        </div>
      ),
    },

    // Create Register tab
    ...(createTabOpen ? [{
      key: 'create',
      label: <Space><PlusOutlined />New Register</Space>,
      closable: true,
      children: (
        <div style={{ padding: '16px 0', maxWidth: 680 }}>
          <Title level={5} style={{ marginBottom: 16, color: REDWOOD.neutral900 }}>
            Create Petty Cash Register
          </Title>
          <Form form={registerForm} layout="vertical" size="small" onFinish={handleCreateRegister}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label={<><span style={{ color: REDWOOD.primary }}>*</span> Register Name</>}
                  name="registerName" rules={[{ required: true, message: 'Required' }]}>
                  <Input placeholder="e.g. Main Office Petty Cash" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label={<><span style={{ color: REDWOOD.primary }}>*</span> Business Unit</>}
                  name="businessUnit" rules={[{ required: true, message: 'Business Unit is required' }]}>
                  <Select placeholder="Select Business Unit" showSearch allowClear
                    filterOption={(v, o) => String(o?.value ?? '').toLowerCase().includes(v.toLowerCase())}>
                    {businessUnits.map(bu => <Option key={bu} value={bu}>{bu}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Currency" name="currency" initialValue="AED">
                  <Select>
                    {['AED','USD','EUR','GBP','SAR','KWD','QAR','OMR','BHD','EGP','INR'].map(c =>
                      <Option key={c} value={c}>{c}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Status" name="status" initialValue="DRAFT">
                  <Select>
                    <Option value="DRAFT"><Tag color="default" style={{ fontSize: 11 }}>DRAFT</Tag> — set up, not yet active</Option>
                    <Option value="ACTIVE"><Tag color="green" style={{ fontSize: 11 }}>ACTIVE</Tag> — open for transactions</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Start Date" name="startDate">
                  <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="End Date" name="endDate">
                  <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Owned By" name="ownedBy">
                  <Input placeholder="e.g. Finance Dept / John Doe" prefix={<UserOutlined style={{ color: REDWOOD.neutral300 }} />} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Cash Limit" name="limit">
                  <InputNumber placeholder="0.00" style={{ width: '100%' }} min={0} precision={2} prefix={<FieldNumberOutlined style={{ color: REDWOOD.neutral300 }} />} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="Cash Account" name="cashAccountDesc">
              <Input.Group compact>
                <Form.Item name="cashAccountDesc" noStyle>
                  <Input style={{ width: 'calc(100% - 40px)' }} placeholder="Select from LOV or type account" readOnly />
                </Form.Item>
                <Tooltip title="Browse GL Accounts">
                  <Button icon={<SearchOutlined />} onClick={() => setCoaRegOpen(true)} />
                </Tooltip>
              </Input.Group>
            </Form.Item>
            <Form.Item label="Comments" name="comments">
              <Input.TextArea rows={3} placeholder="Optional notes" />
            </Form.Item>
            <Divider />
            <Space>
              <Button type="primary" htmlType="submit" loading={saveLoading}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>
                Save Register
              </Button>
              <Button onClick={() => { setCreateTabOpen(false); setActiveTab('search'); registerForm.resetFields(); }}>
                Cancel
              </Button>
            </Space>
          </Form>
        </div>
      ),
    }] : []),

    // Dynamic register detail tabs
    ...openTabs.map((tab) => ({
      key: tab.key,
      label: (
        <Space size={4}>
          <WalletOutlined style={{ color: REDWOOD.success }} />
          <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
            {tab.register.registerName}
          </span>
        </Space>
      ),
      closable: true,
      children: (
        <div style={{ padding: '12px 0' }}>
          {/* Register header bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <Title level={5} style={{ margin: 0 }}>{tab.register.registerName}</Title>
              <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>
                Register #{tab.register.registerId} &nbsp;·&nbsp;
                <StatusTag status={tab.register.status} />
              </Text>
            </div>
            <Space>
              <Button size="small" icon={<ReloadOutlined />}
                onClick={() => refreshTab(tab.key)}>
                Refresh
              </Button>
              <Button
                size="small"
                icon={<EditOutlined />}
                disabled={tab.register.status === 'CLOSED'}
                onClick={() => openEditReg(tab)}
              >
                Edit Header
              </Button>
              <Button
                size="small"
                icon={<SwapOutlined />}
                onClick={() => openRegAction(tab)}
              >
                Change Status
              </Button>
              <Button
                size="small"
                icon={<CloseOutlined />}
                onClick={() => closeTab(tab.key)}
              >
                Close Tab
              </Button>
            </Space>
          </div>
          <RegisterDetail
            tab={tab}
            onRefresh={() => refreshTab(tab.key)}
            currentUser={currentUser}
            cashAccountName={cashAccountNames.get(tab.register.registerId)}
          />
        </div>
      ),
    })),
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: REDWOOD.neutral100 }}>
      <Content style={{ padding: '16px 24px' }}>
        <Breadcrumb
          style={{ marginBottom: 12 }}
          items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/ap">Payables</Link> },
            { title: 'Petty Cash Registers' },
          ]}
        />

        <Card style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
          styles={{ body: { padding: 0 } }}>
          <Tabs
            type="editable-card"
            activeKey={activeTab}
            onChange={setActiveTab}
            hideAdd
            onEdit={(key, action) => { if (action === 'remove') closeTab(key as string); }}
            style={{ padding: '0 16px' }}
            tabBarStyle={{ marginBottom: 0 }}
            tabBarExtraContent={
              <div style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
                <WalletOutlined style={{ color: REDWOOD.success }} />
                <Text style={{ fontWeight: 600, color: REDWOOD.neutral900, fontSize: 14 }}>
                  Petty Cash Registers
                </Text>
                <ApiDocsModal title="Petty Cash" endpoints={PC_API_ENDPOINTS} />
              </div>
            }
            items={tabItems}
          />
        </Card>
      </Content>
      <FloatingMenu />

      {/* ── Edit Register Header Modal ─────────────────────── */}
      <Modal
        title={
          <Space>
            <EditOutlined style={{ color: REDWOOD.primary }} />
            Edit Register Header
            <Tooltip
              overlayStyle={{ maxWidth: 480 }}
              title={
                <div style={{ fontFamily: 'monospace', fontSize: 11 }}>
                  <div style={{ color: '#faad14', marginBottom: 4 }}>PUT</div>
                  {`${APEX_DB_CONFIG.baseUrl}/pc/registers/${editRegTarget?.register.registerId ?? ':id'}`}
                </div>
              }
            >
              <ApiOutlined style={{ color: REDWOOD.neutral300, fontSize: 13, cursor: 'help' }} />
            </Tooltip>
          </Space>
        }
        open={editRegOpen}
        onCancel={() => setEditRegOpen(false)}
        onOk={() => editRegForm.submit()}
        okText="Save"
        confirmLoading={editRegLoading}
        width={520}
        destroyOnClose
      >
        <Form form={editRegForm} layout="vertical" size="small" onFinish={handleEditRegister} style={{ marginTop: 16 }}>
          <Form.Item label="Owned By" name="ownedBy">
            <Input placeholder="e.g. Finance Dept / John Doe" prefix={<UserOutlined style={{ color: REDWOOD.neutral300 }} />} />
          </Form.Item>
          <Form.Item label="Cash Limit" name="limit">
            <InputNumber placeholder="0.00" style={{ width: '100%' }} min={0} precision={2} />
          </Form.Item>
          <Form.Item label="Cash Account" name="cashAccountDesc">
            <Input.Group compact>
              <Form.Item name="cashAccountDesc" noStyle>
                <Input style={{ width: 'calc(100% - 40px)' }} placeholder="Select from LOV or type account" readOnly />
              </Form.Item>
              <Tooltip title="Browse GL Accounts">
                <Button icon={<SearchOutlined />} onClick={() => setCoaRegOpen(true)} />
              </Tooltip>
            </Input.Group>
          </Form.Item>

          {/* Live JSON preview */}
          <Form.Item shouldUpdate style={{ marginBottom: 0 }}>
            {() => {
              const v = editRegForm.getFieldsValue();
              const body = {
                cashAccountDesc: v.cashAccountDesc || null,
                ownedBy:         v.ownedBy         || null,
                limit:           v.limit           ?? null,
                updatedBy:       currentUser,
              };
              return (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <ApiOutlined style={{ color: REDWOOD.info, fontSize: 12 }} />
                    <span style={{ fontSize: 11, color: REDWOOD.neutral600, fontFamily: 'monospace' }}>
                      PUT {`${APEX_DB_CONFIG.baseUrl}/pc/registers/${editRegTarget?.register.registerId ?? ':id'}`}
                    </span>
                  </div>
                  <pre style={{
                    background: '#1e1e1e', color: '#d4d4d4',
                    borderRadius: 6, padding: '8px 12px',
                    fontSize: 11, fontFamily: 'monospace',
                    margin: 0, overflowX: 'auto', lineHeight: 1.5,
                  }}>
                    {JSON.stringify(body, null, 2)}
                  </pre>
                </div>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Change Status Modal ────────────────────────────── */}
      <Modal
        title={
          <Space>
            <SwapOutlined style={{ color: REDWOOD.primary }} />
            Change Register Status
            <Tag style={{ fontSize: 11 }}>{regActionTarget?.register.registerName}</Tag>
          </Space>
        }
        open={regActionOpen}
        onCancel={() => setRegActionOpen(false)}
        onOk={() => regActionForm.submit()}
        okText="Apply"
        okButtonProps={{ style: { background: REDWOOD.primary, borderColor: REDWOOD.primary } }}
        confirmLoading={regActionLoading}
        width={420}
        destroyOnClose
      >
        <Form form={regActionForm} layout="vertical" size="small" onFinish={handleRegAction} style={{ marginTop: 16 }}>
          <Form.Item label="New Status" name="status" rules={[{ required: true, message: 'Select a status' }]}>
            <Select>
              <Option value="DRAFT"><Tag color="default" style={{ fontSize: 11 }}>DRAFT</Tag> — set up, not yet active</Option>
              <Option value="ACTIVE"><Tag color="green" style={{ fontSize: 11 }}>ACTIVE</Tag> — open for transactions</Option>
              <Option value="INACTIVE"><Tag color="orange" style={{ fontSize: 11 }}>INACTIVE</Tag> — temporarily suspended</Option>
              <Option value="CLOSED"><Tag color="red" style={{ fontSize: 11 }}>CLOSED</Tag> — permanently closed</Option>
            </Select>
          </Form.Item>
          <Form.Item label="Comments" name="comments">
            <Input.TextArea rows={3} placeholder="Reason for status change…" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── GL Account LOV for Register form ──────────────── */}
      <AccountSelector
        visible={coaRegOpen}
        onCancel={() => setCoaRegOpen(false)}
        onSelect={(accountCode, segmentDetails) => {
          const name = Object.values(segmentDetails)
            .filter(d => d.description)
            .map(d => d.description)
            .join(' · ');
          if (editRegOpen) {
            editRegForm.setFieldsValue({ cashAccountDesc: accountCode });
            if (editRegTarget && name) {
              setCashAccountNames(prev => new Map(prev).set(editRegTarget.register.registerId, name));
            }
          } else {
            registerForm.setFieldsValue({ cashAccountDesc: accountCode });
          }
          setCoaRegOpen(false);
        }}
      />
    </Layout>
  );
};

export default PettyCash;
