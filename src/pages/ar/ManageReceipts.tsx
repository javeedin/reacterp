import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Layout, Card, Form, Select, Input, Button, Space, Typography, Table, Tag,
  Row, Col, Breadcrumb, Tooltip, DatePicker, message, Tabs, Divider,
  Badge, Alert, Modal, InputNumber, Radio, Spin, Descriptions, Dropdown,
} from 'antd';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  HomeOutlined, SearchOutlined, PlusOutlined, CloseOutlined,
  DollarOutlined, SaveOutlined, FilterOutlined, ReloadOutlined,
  DownloadOutlined, UserOutlined, BankOutlined, LockOutlined,
  FileTextOutlined, EyeOutlined, UnorderedListOutlined, InfoCircleOutlined,
  ApiOutlined, DeleteOutlined, ExclamationCircleOutlined, SendOutlined, CodeOutlined,
  BookOutlined, CheckCircleOutlined, PaperClipOutlined, UploadOutlined, PrinterOutlined, EditOutlined,
  CopyOutlined, RollbackOutlined, DownOutlined,
} from '@ant-design/icons';
import { Upload } from 'antd';
import { Link } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import FloatingMenu from '../../components/FloatingMenu';
import { useAuth } from '../../context/AuthContext';
import { APEX_DB_CONFIG } from '../../config/api.config';
import { validateAccountCode } from '../../components/AccountSelector';
import AccountSelector from '../../components/AccountSelector';
import {
  createAccounting, postToLedger, fetchLedgerByBusinessUnit,
  derivePeriodName, checkAccountingExists, getAccounting, type SlaCreatePayload,
} from '../../services/sla.service';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

const REDWOOD = {
  primary:    '#C74634',
  success:    '#1D7B4D',
  warning:    '#D4A800',
  info:       '#0572CE',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral600: '#6B6B6B',
  surface:    '#FFFFFF',
  border:     '#E5E5E5',
};

const APEX_AR_RECEIPTS     = `${APEX_DB_CONFIG.baseUrl}/ar/receipts`;
const APEX_RECEIPT_APPS    = `${APEX_DB_CONFIG.baseUrl}/ar/receipt-applications`;
const APEX_RECEIPT_METHODS = `${APEX_DB_CONFIG.baseUrl}/ar/receiptmethods`;
const GL_ORDS_BASE         = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp';
const ORDS_RECEIPT_METHOD_ACCOUNTS = `${GL_ORDS_BASE}/ar/receipt-method-accounts`;

// ── Types ────────────────────────────────────────────────────────────────────

interface ReceiptRow {
  key:                   string;
  standardReceiptId:     number;
  receiptNumber:         string;
  documentNumber:        number | null;
  receiptType:           string;
  businessUnit:          string;
  receiptMethod:         string;
  receiptDate:           string;
  accountingDate:        string;
  amount:                number;
  unappliedAmount:       number;
  accountedAmount:       number;
  currency:              string;
  state:                 string;
  status:                string;
  remittanceBankName:          string;
  remittanceBankAccountNumber: string;
  maturityDate:                string;
  customerName:                string;
  customerAccountNumber:       string;
  comments:                    string;
  syncStatus:                  string;
  accountingStatus:            string;
}

interface ReceiptDraft {
  standardReceiptId:              number;
  receiptNumber:                  string;
  documentNumber:                 number | null;
  receiptType:                    string;
  businessUnit:                   string;
  receiptMethod:                  string;
  receiptMethodId:                number | null;
  selectedBankAccountId:          number | null;
  receiptDate:                    string;
  accountingDate:                 string;
  maturityDate:                   string;
  amount:                         number | null;
  unappliedAmount:                number | null;
  accountedAmount:                number | null;
  currency:                       string;
  conversionRateType:             string;
  conversionRate:                 number | null;
  state:                          string;
  status:                         string;
  receiptAtRisk:                  string;
  remittanceBankName:             string;
  remittanceBankBranch:           string;
  remittanceBankAccountNumber:    string;
  remittanceBankDepositDate:      string;
  customerName:                   string;
  customerAccountNumber:          string;
  customerSite:                   string;
  customerBank:                   string;
  customerBankBranch:             string;
  customerBankAccountNumber:      string;
  receivablesSpecialist:          string;
  comments:                       string;
  structuredPaymentReference:     string;
  receiptBatchName:               string;
  drAccount:                      string;
  drAccountDesc:                  string;
  crAccount:                      string;
  crAccountDesc:                  string;
  accountingStatus:               string;
}

interface ReceiptTab {
  key:          string;
  draft:        ReceiptDraft;
  syncStatus:   string;
  slaHeaderId:  number | null;
  slaPosted:    boolean;
}

interface AppRow {
  key:                        string;
  applicationId:              number;
  applicationDate:            string;
  applicationAmount:          number;
  applicationStatus:          string;
  accountingDate:             string;
  referenceTransactionNumber: string;
  referenceTransactionId:     number | null;
  referenceTransactionStatus: string;
  activityName:               string;
  standardReceiptId:          number;
  enteredCurrency:            string;
  processStatus:              string;
  isLatestApplication:        string;
  custAccountId:              number | null;
  customerSite:               string;
}

interface ReceiptMethodAccount {
  id:                         number;
  receiptMethodId:            number;
  receiptMethodName:          string;
  receiptClass:               string;
  orgId:                      number;
  businessUnitName:           string;
  company:                    string;
  bankAccountId:              number;
  bankAccountName:            string;
  bankAccountNum:             string;
  bankName:                   string;
  bankBranchName:             string;
  bankCurrency:               string;
  primaryFlag:                string;
  startDate:                  string;
  endDate:                    string;
  cashCcid:                   number;
  cashCombination:            string;
  unappliedCcid:              number;
  unappliedCombination:       string;
  unidentifiedCcid:           number;
  unidentifiedCombination:    string;
  onAccountCcid:              number;
  onAccountCombination:       string;
  receiptClearingCcid:        number;
  receiptClearingCombination: string;
  remittanceCcid:             number;
  remittanceCombination:      string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const today = () => dayjs().format('YYYY-MM-DD');

function blankDraft(): ReceiptDraft {
  return {
    standardReceiptId: 0,
    receiptNumber: '', documentNumber: null, receiptType: '',
    businessUnit: '', receiptMethod: '', receiptMethodId: null, selectedBankAccountId: null,
    receiptDate: today(), accountingDate: today(), maturityDate: today(),
    amount: null, unappliedAmount: null, accountedAmount: null,
    currency: 'AED', conversionRateType: '', conversionRate: null,
    state: '', status: '', receiptAtRisk: 'N',
    remittanceBankName: '', remittanceBankBranch: '',
    remittanceBankAccountNumber: '', remittanceBankDepositDate: '',
    customerName: '', customerAccountNumber: '', customerSite: '',
    customerBank: '', customerBankBranch: '', customerBankAccountNumber: '',
    receivablesSpecialist: '', comments: '', structuredPaymentReference: '',
    receiptBatchName: '', drAccount: '', drAccountDesc: '', crAccount: '', crAccountDesc: '',
    accountingStatus: '',
  };
}

function maskAcct(num: string) {
  if (!num) return '';
  const s = num.replace(/[^0-9A-Za-z]/g, '');
  return s.length <= 4 ? num : 'X'.repeat(s.length - 4) + s.slice(-4);
}

function fmt(n: number) {
  return n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function stateColor(s: string) {
  const m: Record<string, string> = {
    Applied: 'green', Unapplied: 'blue', 'On Account': 'purple',
    Reversed: 'red', NSF: 'red', Stop: 'red',
  };
  return m[s] || 'default';
}

function statusColor(s: string) {
  const m: Record<string, string> = {
    Cleared: 'green', Uncleared: 'orange', Reversed: 'red', Remitted: 'blue',
  };
  return m[s] || 'default';
}

function syncStatusColor(s: string) {
  const m: Record<string, string> = { NEW: 'green', UPDATED: 'blue', ERROR: 'red' };
  return m[(s || '').toUpperCase()] || 'default';
}

const LOCKED_SYNC = ['FUSION SYNC'];

// ── Component ─────────────────────────────────────────────────────────────────

const ManageReceipts: React.FC = () => {
  const { user } = useAuth();
  const currentUser = user?.email ?? user?.username ?? 'REERP';
  const [searchForm] = Form.useForm();

  const [businessUnits,   setBusinessUnits]   = useState<{ name: string; companyCode: string }[]>([]);
  // Flat list of all receipt method+bank account rows for the current tab's BU
  const [receiptMethods,           setReceiptMethods]           = useState<{ id: number; name: string; receiptClass: string }[]>([]);
  const [allMethodAccounts,        setAllMethodAccounts]        = useState<ReceiptMethodAccount[]>([]);
  const [allMethodAccountsLoading, setAllMethodAccountsLoading] = useState<Record<string, boolean>>({});
  // ccid → { combination: string; description: string; segmentDescs: Record<string,string> }
  const [acctDescCache, setAcctDescCache] = useState<Record<number, { description: string; segmentDescs: Record<string, string> }>>({});

  const enrichWithDescriptions = useCallback(async (items: ReceiptMethodAccount[]) => {
    const ccidSet = new Set<number>();
    items.forEach(a => {
      [a.cashCcid, a.unappliedCcid, a.unidentifiedCcid, a.onAccountCcid, a.receiptClearingCcid, a.remittanceCcid]
        .filter(id => id > 0)
        .forEach(id => ccidSet.add(id));
    });
    const newCache: Record<number, { description: string; segmentDescs: Record<string, string> }> = {};
    // Build combo→ccid map so we can validate by combo string
    const combos: { ccid: number; combo: string }[] = [];
    items.forEach(a => {
      const pairs: [number, string][] = [
        [a.cashCcid, a.cashCombination], [a.unappliedCcid, a.unappliedCombination],
        [a.unidentifiedCcid, a.unidentifiedCombination], [a.onAccountCcid, a.onAccountCombination],
        [a.receiptClearingCcid, a.receiptClearingCombination], [a.remittanceCcid, a.remittanceCombination],
      ];
      pairs.forEach(([ccid, combo]) => {
        if (ccid > 0 && combo && !newCache[ccid]) combos.push({ ccid, combo });
      });
    });
    // Deduplicate by ccid
    const seen = new Set<number>();
    const unique = combos.filter(x => { if (seen.has(x.ccid)) return false; seen.add(x.ccid); return true; });
    await Promise.all(unique.map(async ({ ccid, combo }) => {
      try {
        const result = await validateAccountCode(combo.replace(/\./g, '-'));
        const segmentDescs: Record<string, string> = {};
        Object.entries(result.segmentDetails ?? {}).forEach(([k, v]) => {
          segmentDescs[k] = v.description || '';
        });
        const description = Object.values(result.segmentDetails ?? {})
          .map(v => v.description).filter(Boolean).join(' · ');
        newCache[ccid] = { description, segmentDescs };
      } catch { /* ignore */ }
    }));
    setAcctDescCache(prev => ({ ...prev, ...newCache }));
  }, []);

  const fetchMethodAccountsByBU = useCallback(async (tabKey: string, businessUnit: string) => {
    if (!businessUnit) return;
    setAllMethodAccountsLoading(prev => ({ ...prev, [tabKey]: true }));
    try {
      const params = new URLSearchParams({ limit: '500', business_unit_name: businessUnit });
      const res  = await fetch(`${ORDS_RECEIPT_METHOD_ACCOUNTS}?${params}`, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      const items = ((data.items ?? []) as any[]).map(mapAccount);

      // Build unique receipt methods list for this tab's dropdown
      const methodMap: Record<number, { id: number; name: string; receiptClass: string }> = {};
      items.forEach(a => {
        if (!methodMap[a.receiptMethodId]) {
          methodMap[a.receiptMethodId] = {
            id:           a.receiptMethodId,
            name:         a.receiptMethodName || `Method ${a.receiptMethodId}`,
            receiptClass: a.receiptClass,
          };
        }
      });
      setReceiptMethods(Object.values(methodMap).sort((a, b) => a.name.localeCompare(b.name)));
      setAllMethodAccounts(items);
      enrichWithDescriptions(items);
    } catch {
      message.error('Failed to load receipt methods for this Business Unit');
    } finally {
      setAllMethodAccountsLoading(prev => ({ ...prev, [tabKey]: false }));
    }
  }, []);
  const [searchRows, setSearchRows]           = useState<ReceiptRow[]>([]);
  const [searching, setSearching]         = useState(false);
  const [tabs, setTabs]                   = useState<ReceiptTab[]>([]);
  const [activeKey, setActiveKey]         = useState<string>('search');
  const [saving, setSaving]               = useState<Record<string, boolean>>({});
  const [deleting, setDeleting]           = useState<Record<string, boolean>>({});
  const [fxRateLoading, setFxRateLoading] = useState<Record<string, boolean>>({});
  const [apiModal, setApiModal]           = useState<{ tabKey: string; testResult: string | null; testing: boolean } | null>(null);
  const [apiInfoVisible, setApiInfoVisible] = useState(false);
  const [gridFilter, setGridFilter]       = useState('');
  const [lastSearchUrl, setLastSearchUrl] = useState('');
  const [miscAcctVisible, setMiscAcctVisible] = useState(false);
  const [miscAcctTabKey, setMiscAcctTabKey]   = useState('');
  const [miscAcctField, setMiscAcctField]     = useState<'drAccount' | 'crAccount'>('crAccount');
  // Per-tab edit mode: false = view/locked, true = editing enabled
  const [editingEnabled, setEditingEnabled]   = useState<Record<string, boolean>>({});
  const [acctModal, setAcctModal] = useState<{
    visible: boolean; tabKey: string; creating: boolean; posting: boolean;
    slaHeaderId: number | null; slaStatus: string; glBatchId: number | null;
    lines: { lineType: string; accountingClass: string; accountCombination: string;
             accountDesc: string; enteredDr: number; enteredCr: number; description: string }[];
  } | null>(null);

  const [viewAcctModal, setViewAcctModal] = useState<{
    receiptNumber: string; loading: boolean;
    header: any; lines: any[];
  } | null>(null);

  const openViewAccounting = async (draft: ReceiptDraft) => {
    setViewAcctModal({ receiptNumber: draft.receiptNumber, loading: true, header: null, lines: [] });
    try {
      const res = await fetch(`${APEX_DB_CONFIG.baseUrl}/gl/journals/by-txn?txn_id=${encodeURIComponent(draft.receiptNumber)}`,
        { headers: { Accept: 'application/json' } });
      const d = await res.json();
      setViewAcctModal({ receiptNumber: draft.receiptNumber, loading: false,
        header: d.found !== false ? d : null,
        lines: d.lines || [] });
    } catch (e: any) {
      message.error('Failed to load GL journal: ' + e.message);
      setViewAcctModal(null);
    }
  };


  const [receiptApplications, setReceiptApplications] = useState<
    Record<string, { loading: boolean; rows: AppRow[] }>
  >({});

  // Attachments (per tab)
  type AttachItem = { id?: number; uid: string; name: string; fileType: string; fileSize: number; content?: string; rawFile?: File; status: 'done' | 'uploading' | 'error' };
  const [tabAttachments, setTabAttachments] = useState<Record<string, AttachItem[]>>({});
  const [attSaving, setAttSaving] = useState<Record<string, boolean>>({});
  const [previewAtt, setPreviewAtt] = useState<{ name: string; fileType: string; blobUrl: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [attApiDebug, setAttApiDebug] = useState<{ url: string; body: string } | null>(null);

  // Helper to map raw API row → ReceiptMethodAccount
  const mapAccount = (r: any): ReceiptMethodAccount => ({
    id:                         r.ID                           ?? r.id                           ?? 0,
    receiptMethodId:            r.RECEIPT_METHOD_ID            ?? r.receipt_method_id            ?? 0,
    receiptMethodName:          r.RECEIPT_METHOD_NAME          ?? r.receipt_method_name          ?? '',
    receiptClass:               r.RECEIPT_CLASS                ?? r.receipt_class                ?? '',
    orgId:                      r.ORG_ID                       ?? r.org_id                       ?? 0,
    businessUnitName:           r.BUSINESS_UNIT_NAME           ?? r.business_unit_name           ?? '',
    company:                    r.COMPANY                      ?? r.company                      ?? '',
    bankAccountId:              r.BANK_ACCOUNT_ID              ?? r.bank_account_id              ?? 0,
    bankAccountName:            r.BANK_ACCOUNT_NAME            ?? r.bank_account_name            ?? '',
    bankAccountNum:             r.BANK_ACCOUNT_NUM             ?? r.bank_account_num             ?? r.bank_account_number ?? '',
    bankName:                   r.BANK_NAME                    ?? r.bank_name                    ?? '',
    bankBranchName:             r.BANK_BRANCH_NAME             ?? r.bank_branch_name             ?? '',
    bankCurrency:               r.BANK_CURRENCY                ?? r.bank_currency                ?? '',
    primaryFlag:                r.PRIMARY_FLAG                 ?? r.primary_flag                 ?? '',
    startDate:                  (r.START_DATE                  ?? r.start_date                   ?? '').slice(0, 10),
    endDate:                    (r.END_DATE                    ?? r.end_date                     ?? '').slice(0, 10),
    cashCcid:                   r.CASH_CCID                    ?? r.cash_ccid                    ?? 0,
    cashCombination:            r.CASH_COMBINATION             ?? r.cash_combination             ?? '',
    unappliedCcid:              r.UNAPPLIED_CCID               ?? r.unapplied_ccid               ?? 0,
    unappliedCombination:       r.UNAPPLIED_COMBINATION        ?? r.unapplied_combination        ?? '',
    unidentifiedCcid:           r.UNIDENTIFIED_CCID            ?? r.unidentified_ccid            ?? 0,
    unidentifiedCombination:    r.UNIDENTIFIED_COMBINATION     ?? r.unidentified_combination     ?? '',
    onAccountCcid:              r.ON_ACCOUNT_CCID              ?? r.on_account_ccid              ?? 0,
    onAccountCombination:       r.ON_ACCOUNT_COMBINATION       ?? r.on_account_combination       ?? '',
    receiptClearingCcid:        r.RECEIPT_CLEARING_CCID        ?? r.receipt_clearing_ccid        ?? 0,
    receiptClearingCombination: r.RECEIPT_CLEARING_COMBINATION ?? r.receipt_clearing_combination ?? '',
    remittanceCcid:             r.REMITTANCE_CCID              ?? r.remittance_ccid              ?? 0,
    remittanceCombination:      r.REMITTANCE_COMBINATION       ?? r.remittance_combination       ?? '',
  });

  // Date preset
  const [datePreset, setDatePreset] = useState<string>('range');

  // Customer LOV — shared between search panel and receipt tabs
  // lovContext = 'search' → updates lovSelected; otherwise = tabKey → updates draft
  interface CustomerOption { custAccountId: number; accountNumber: string; accountName: string; }
  const [lovVisible,  setLovVisible]  = useState(false);
  const [lovSearch,   setLovSearch]   = useState('');
  const [lovAllRows,  setLovAllRows]  = useState<CustomerOption[]>([]);
  const [lovLoading,  setLovLoading]  = useState(false);
  const [lovSelected, setLovSelected] = useState<CustomerOption | null>(null);
  const [lovContext,  setLovContext]  = useState<'search' | string>('search');
  const lovFetched      = useRef(false);
  const fetchedAppsRef  = useRef<Set<string>>(new Set());

  const openLov = (context: 'search' | string, prefill?: string) => {
    setLovContext(context);
    setLovSearch(prefill ?? '');
    setLovVisible(true);
    fetchAllCustomers();
  };

  const onLovSelect = (c: CustomerOption) => {
    if (lovContext === 'search') {
      setLovSelected(c);
    } else {
      updateDraft(lovContext, { customerName: c.accountName, customerAccountNumber: c.accountNumber });
    }
    setLovVisible(false);
  };

  const lovRows = lovSearch.trim()
    ? lovAllRows.filter(c => {
        const q = lovSearch.trim().toUpperCase();
        return c.accountName.toUpperCase().includes(q) || c.accountNumber.toUpperCase().includes(q);
      })
    : lovAllRows;

  const fetchAllCustomers = () => {
    if (lovFetched.current) return;
    setLovLoading(true);
    fetch(`${APEX_DB_CONFIG.baseUrl}/ar/customers`, { headers: { Accept: 'application/json' } })
      .then(r => r.json())
      .then(data => {
        setLovAllRows(((data.items ?? []) as any[]).map((c: any) => ({
          custAccountId: c.cust_account_id ?? 0,
          accountNumber: c.account_number  ?? '',
          accountName:   c.account_name    ?? '',
        })));
        lovFetched.current = true;
      })
      .catch(() => {})
      .finally(() => setLovLoading(false));
  };

  // ── Fetch receipt applications ────────────────────────────────────────────
  const fetchApplications = useCallback((tabKey: string, standardReceiptId: number) => {
    if (!standardReceiptId) return;
    fetchedAppsRef.current.add(tabKey);
    setReceiptApplications(prev => ({ ...prev, [tabKey]: { loading: true, rows: [] } }));
    fetch(`${APEX_RECEIPT_APPS}?standard_receipt_id=${standardReceiptId}&limit=200`, {
      headers: { Accept: 'application/json' },
    })
      .then(r => r.json())
      .then(data => {
        const rows: AppRow[] = ((data.items || []) as any[]).map((a: any) => ({
          key:                        String(a.application_id ?? Math.random()),
          applicationId:              a.application_id              ?? 0,
          applicationDate:            (a.application_date  || '').slice(0, 10),
          applicationAmount:          a.application_amount          ?? 0,
          applicationStatus:          a.application_status          ?? '',
          accountingDate:             (a.accounting_date   || '').slice(0, 10),
          referenceTransactionNumber: a.reference_transaction_number ?? '',
          referenceTransactionId:     a.reference_transaction_id    ?? null,
          referenceTransactionStatus: a.reference_transaction_status ?? '',
          activityName:               a.activity_name               ?? '',
          standardReceiptId:          a.standard_receipt_id         ?? 0,
          enteredCurrency:            a.entered_currency             ?? '',
          processStatus:              a.process_status               ?? '',
          isLatestApplication:        a.is_latest_application        ?? '',
          custAccountId:              a.cust_account_id              ?? null,
          customerSite:               a.customer_site                ?? '',
        }));
        setReceiptApplications(prev => ({ ...prev, [tabKey]: { loading: false, rows } }));
      })
      .catch(() => {
        setReceiptApplications(prev => ({ ...prev, [tabKey]: { loading: false, rows: [] } }));
      });
  }, []);

  useEffect(() => {
    if (!activeKey || activeKey === 'search') return;
    const tab = tabs.find(t => t.key === activeKey);
    if (!tab || !tab.draft.standardReceiptId) return;
    if (fetchedAppsRef.current.has(activeKey)) return;
    fetchedAppsRef.current.add(activeKey);
    fetchApplications(activeKey, tab.draft.standardReceiptId);
  }, [activeKey, tabs, fetchApplications]);

  // ── Load business units + all receipt method accounts from ORDS ──────────
  useEffect(() => {
    // Business units
    fetch(`${APEX_DB_CONFIG.baseUrl}/gl/businessunits`, { headers: { Accept: 'application/json' } })
      .then(r => r.json())
      .then(data => {
        setBusinessUnits(
          ((data.items || []) as any[])
            .map((i: any) => ({ name: i.business_unit_name || '', companyCode: i.company_code ?? '' }))
            .filter(b => b.name)
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      })
      .catch(() => {});

    // Receipt methods are loaded per-tab when Business Unit is selected
  }, []);

  // ── Date preset logic ─────────────────────────────────────────────────────
  const applyDatePreset = (preset: string) => {
    setDatePreset(preset);
    if (preset === 'today') {
      const d = dayjs();
      searchForm.setFieldsValue({ dateRange: [d, d] });
    } else if (preset === 'last7') {
      searchForm.setFieldsValue({ dateRange: [dayjs().subtract(6, 'day'), dayjs()] });
    } else if (preset === 'last30') {
      searchForm.setFieldsValue({ dateRange: [dayjs().subtract(29, 'day'), dayjs()] });
    } else if (preset === 'range') {
      // leave picker open for user input
    }
  };

  // ── Search ────────────────────────────────────────────────────────────────
  const handleSearch = async () => {
    try { await searchForm.validateFields(['businessUnit']); } catch { return; }
    const v = searchForm.getFieldsValue();
    setSearching(true);
    try {
      const p = new URLSearchParams();
      if (v.businessUnit)   p.set('business_unit',    v.businessUnit);
      if (lovSelected)      p.set('customer',          lovSelected.accountName);
      if (v.receiptMethod)  p.set('receipt_number',    v.receiptNumber || '');
      if (v.receiptNumber)  p.set('receipt_number',    v.receiptNumber);
      if (v.receiptType)    p.set('receipt_type',      v.receiptType);
      if (v.state)          p.set('state',             v.state);
      if (v.status)         p.set('status',            v.status);
      if (v.currency)       p.set('currency',          v.currency);
      if (v.dateRange?.[0]) p.set('date_from', v.dateRange[0].format('YYYY-MM-DD'));
      if (v.dateRange?.[1]) p.set('date_to',   v.dateRange[1].format('YYYY-MM-DD'));
      p.set('limit', '200');

      const searchUrl = `${APEX_AR_RECEIPTS}?${p}`;
      setLastSearchUrl(searchUrl);
      const res  = await fetch(searchUrl);
      const data = await res.json();

      const rows: ReceiptRow[] = ((data.items || []) as any[]).map((r: any, i: number) => ({
        key:                   String(r.standard_receipt_id ?? i),
        standardReceiptId:     r.standard_receipt_id     ?? 0,
        receiptNumber:         r.receipt_number          ?? '',
        documentNumber:        r.document_number         ?? null,
        receiptType:           r.receipt_type            ?? '',
        businessUnit:          r.business_unit           ?? '',
        receiptMethod:         r.receipt_method          ?? '',
        receiptDate:           (r.receipt_date    || '').slice(0, 10),
        accountingDate:        (r.accounting_date || '').slice(0, 10),
        amount:                r.amount                  ?? 0,
        unappliedAmount:       r.unapplied_amount        ?? 0,
        accountedAmount:       r.accounted_amount        ?? 0,
        currency:              r.currency                ?? 'AED',
        state:                 r.state                   ?? '',
        status:                r.status                  ?? '',
        remittanceBankName:          r.remittance_bank_name             ?? '',
        remittanceBankAccountNumber: r.remittance_bank_account_number   ?? '',
        maturityDate:                (r.maturity_date || '').slice(0, 10),
        customerName:                r.customer_name                    ?? '',
        customerAccountNumber:       r.customer_account_number          ?? '',
        comments:                    r.comments                         ?? '',
        syncStatus:                  r.sync_status                      ?? '',
        accountingStatus:            r.accounting_status                ?? '',
      }));

      setSearchRows(rows);
      if (rows.length === 0) message.info('No receipts found');
    } catch (e: any) { message.error(`Search failed: ${e.message}`); }
    finally { setSearching(false); }
  };

  // ── Open receipt tab — fetches full record via GET ar/receipts/:id ──────────
  const openReceiptTab = useCallback(async (row: ReceiptRow) => {
    const key = `rcpt-${row.standardReceiptId}`;
    if (tabs.find(t => t.key === key)) { setActiveKey(key); return; }

    // Open tab immediately with search-row data so user sees it right away
    const placeholderDraft: ReceiptDraft = {
      standardReceiptId:           row.standardReceiptId,
      receiptNumber:               row.receiptNumber,
      documentNumber:              row.documentNumber,
      receiptType:                 row.receiptType,
      businessUnit:                row.businessUnit,
      receiptMethod:               row.receiptMethod,
      receiptMethodId:             null,
      selectedBankAccountId:       null,
      receiptDate:                 row.receiptDate,
      accountingDate:              row.accountingDate,
      maturityDate:                '',
      amount:                      row.amount,
      unappliedAmount:             row.unappliedAmount,
      accountedAmount:             row.accountedAmount,
      currency:                    row.currency,
      conversionRateType:          '',
      conversionRate:              null,
      state:                       row.state,
      status:                      row.status,
      receiptAtRisk:               'N',
      remittanceBankName:          row.remittanceBankName,
      remittanceBankBranch:        '',
      remittanceBankAccountNumber: '',
      remittanceBankDepositDate:   '',
      customerName:                row.customerName,
      customerAccountNumber:       row.customerAccountNumber,
      customerSite:                '',
      customerBank:                '',
      customerBankBranch:          '',
      customerBankAccountNumber:   '',
      receivablesSpecialist:       '',
      comments:                    row.comments,
      structuredPaymentReference:  '',
      receiptBatchName:            '',
      drAccount:                   '',
      drAccountDesc:               '',
      crAccount:                   '',
      crAccountDesc:               '',
      accountingStatus:            '',
    };
    setTabs(prev => [...prev, { key, draft: placeholderDraft, syncStatus: row.syncStatus, slaHeaderId: null, slaPosted: false }]);
    setActiveKey(key);

    // Fetch full receipt record — all columns including DR/CR accounts
    try {
      const res  = await fetch(`${APEX_AR_RECEIPTS}/${row.standardReceiptId}`, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      const r    = (data.items ?? [data])[0];
      if (!r) return;

      const fullDraft: ReceiptDraft = {
        standardReceiptId:           r.standard_receipt_id     ?? row.standardReceiptId,
        receiptNumber:               r.receipt_number          ?? row.receiptNumber,
        documentNumber:              r.document_number         ?? row.documentNumber,
        receiptType:                 r.receipt_type            ?? row.receiptType,
        businessUnit:                r.business_unit           ?? row.businessUnit,
        receiptMethod:               r.receipt_method          ?? row.receiptMethod,
        receiptMethodId:             r.receipt_method_id       ?? null,
        selectedBankAccountId:       null,
        receiptDate:                 r.receipt_date            ? r.receipt_date.substring(0, 10) : row.receiptDate,
        accountingDate:              r.accounting_date         ? r.accounting_date.substring(0, 10) : row.accountingDate,
        maturityDate:                r.maturity_date           ? r.maturity_date.substring(0, 10) : '',
        amount:                      r.amount                  ?? row.amount,
        unappliedAmount:             r.unapplied_amount        ?? row.unappliedAmount,
        accountedAmount:             r.accounted_amount        ?? row.accountedAmount,
        currency:                    r.currency                ?? row.currency,
        conversionRateType:          r.conversion_rate_type    ?? '',
        conversionRate:              r.conversion_rate         ?? null,
        state:                       r.state                   ?? row.state,
        status:                      r.status                  ?? row.status,
        receiptAtRisk:               r.receipt_at_risk         ?? 'N',
        remittanceBankName:          r.remittance_bank_name    ?? row.remittanceBankName,
        remittanceBankBranch:        r.remittance_bank_branch  ?? '',
        remittanceBankAccountNumber: r.remittance_bank_account_number ?? '',
        remittanceBankDepositDate:   r.remittance_bank_deposit_date   ? r.remittance_bank_deposit_date.substring(0, 10) : '',
        customerName:                r.customer_name           ?? row.customerName,
        customerAccountNumber:       r.customer_account_number ?? row.customerAccountNumber,
        customerSite:                r.customer_site           ?? '',
        customerBank:                r.customer_bank           ?? '',
        customerBankBranch:          r.customer_bank_branch    ?? '',
        customerBankAccountNumber:   r.customer_bank_account_number ?? '',
        receivablesSpecialist:       r.receivables_specialist  ?? '',
        comments:                    r.comments                ?? row.comments,
        structuredPaymentReference:  r.structured_payment_reference ?? '',
        receiptBatchName:            r.receipt_batch_name      ?? '',
        drAccount:                   r.dr_account              ?? '',
        drAccountDesc:               '',
        crAccount:                   r.cr_account              ?? '',
        crAccountDesc:               '',
        accountingStatus:            r.accounting_status       ?? '',
      };

      setTabs(prev => prev.map(t => t.key === key ? { ...t, draft: fullDraft } : t));

      // Resolve descriptions for saved DR / CR account codes
      const resolveDesc = async (code: string) => {
        if (!code) return '';
        try {
          const result = await validateAccountCode(code);
          return Object.values(result.segmentDetails ?? {}).map((s: any) => s.description).filter(Boolean).join(' · ');
        } catch { return ''; }
      };
      const [drDesc, crDesc] = await Promise.all([
        resolveDesc(fullDraft.drAccount),
        resolveDesc(fullDraft.crAccount),
      ]);
      if (drDesc || crDesc) {
        setTabs(prev => prev.map(t => t.key === key ? {
          ...t, draft: { ...t.draft, drAccountDesc: drDesc, crAccountDesc: crDesc }
        } : t));
      }

      // Auto-load receipt methods for this BU so the dropdown is populated
      if (fullDraft.businessUnit) {
        await fetchMethodAccountsByBU(key, fullDraft.businessUnit);
      }

      // Check if SLA accounting already exists for this receipt
      try {
        const slaCheck = await checkAccountingExists('AR_RECEIPTS', fullDraft.standardReceiptId);
        if (slaCheck?.exists) {
          const slaData = await getAccounting('AR_RECEIPTS', fullDraft.standardReceiptId);
          const headerId = slaData?.items?.[0]?.headerId ?? slaData?.headerId ?? null;
          const posted   = slaData?.items?.[0]?.status === 'POSTED' || slaData?.status === 'POSTED';
          if (headerId) {
            setTabs(prev => prev.map(t => t.key === key ? { ...t, slaHeaderId: headerId, slaPosted: posted } : t));
          }
        }
      } catch { /* SLA check is non-critical */ }
    } catch {
      // Tab already open with placeholder data — silent fail
    }
  }, [tabs, fetchMethodAccountsByBU]);

  // ── New receipt tab ───────────────────────────────────────────────────────
  const openNewTab = () => {
    const key = `new-${Date.now()}`;
    setTabs(prev => [...prev, { key, draft: blankDraft(), syncStatus: '', slaHeaderId: null, slaPosted: false }]);
    setActiveKey(key);
  };

  // ── Close tab ─────────────────────────────────────────────────────────────
  const closeTab = (key: string) => {
    fetchedAppsRef.current.delete(key);
    setReceiptApplications(prev => { const n = { ...prev }; delete n[key]; return n; });
    setTabAttachments(prev => { const n = { ...prev }; delete n[key]; return n; });
    setEditingEnabled(prev => { const n = { ...prev }; delete n[key]; return n; });
    setTabs(prev => {
      const next = prev.filter(t => t.key !== key);
      if (activeKey === key) setActiveKey(next.length > 0 ? next[next.length - 1].key : 'search');
      return next;
    });
  };

  // ── Load attachments for a receipt tab ───────────────────────────────────
  const loadedAttRef = useRef(new Set<string>());
  const loadAttachments = useCallback(async (tabKey: string, receiptId: number) => {
    if (!receiptId || loadedAttRef.current.has(tabKey)) return;
    loadedAttRef.current.add(tabKey);
    try {
      const res = await fetch(`${APEX_AR_RECEIPTS}/${receiptId}/attachments`, { headers: { Accept: 'application/json' } });
      const d = await res.json();
      if (Array.isArray(d.items)) {
        setTabAttachments(prev => ({
          ...prev,
          [tabKey]: d.items.map((a: any) => ({ id: a.id, uid: String(a.id), name: a.fileName || a.file_name, fileType: a.fileType || a.file_type || '', fileSize: a.fileSize || a.file_size || 0, status: 'done' as const })),
        }));
      }
    } catch { /* silent */ }
  }, []);

  // Trigger load when a tab with an existing receipt is opened
  useEffect(() => {
    tabs.forEach(t => {
      if (t.draft.standardReceiptId > 0) loadAttachments(t.key, t.draft.standardReceiptId);
    });
  }, [tabs, loadAttachments]);

  // After methods load for any tab, restore selectedBankAccountId by matching
  // the saved bank account number or receipt method id.
  // Also auto-fill DR Account from cash combination if blank.
  useEffect(() => {
    if (allMethodAccounts.length === 0) return;
    setTabs(prev => prev.map(t => {
      if (t.draft.selectedBankAccountId != null) return t; // already set
      const { remittanceBankAccountNumber, receiptMethodId, receiptMethod } = t.draft;
      let match = remittanceBankAccountNumber
        ? allMethodAccounts.find(a => a.bankAccountNum === remittanceBankAccountNumber && (receiptMethodId ? a.receiptMethodId === receiptMethodId : a.receiptMethodName === receiptMethod))
        : undefined;
      if (!match && receiptMethodId) {
        match = allMethodAccounts.find(a => a.receiptMethodId === receiptMethodId);
      }
      if (!match && receiptMethod) {
        match = allMethodAccounts.find(a => a.receiptMethodName === receiptMethod);
      }
      if (!match) return t;
      const cashCombo = match.cashCombination ? match.cashCombination.replace(/\./g, '-') : '';
      const cashDesc  = match.cashCcid > 0 ? (acctDescCache[match.cashCcid]?.description ?? '') : '';
      return {
        ...t,
        draft: {
          ...t.draft,
          selectedBankAccountId: match.id,
          // auto-fill DR Account from cash combination only when blank
          ...(cashCombo && !t.draft.drAccount ? { drAccount: cashCombo, drAccountDesc: cashDesc } : {}),
        },
      };
    }));
  }, [allMethodAccounts, acctDescCache]);

  const makeBlobUrl = (base64: string, mimeType: string) => {
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return URL.createObjectURL(new Blob([arr], { type: mimeType || 'application/octet-stream' }));
  };

  const handlePreviewAtt = async (tabKey: string, att: AttachItem, receiptId: number) => {
    if (att.content) {
      setPreviewAtt({ name: att.name, fileType: att.fileType, blobUrl: makeBlobUrl(att.content, att.fileType) });
      return;
    }
    if (!att.id || !receiptId) return;
    setPreviewLoading(true);
    try {
      const res = await fetch(`${APEX_AR_RECEIPTS}/${receiptId}/attachments/${att.id}`, { headers: { Accept: 'application/json' } });
      const d = await res.json();
      const content = d.content || d.CONTENT || '';
      const ft = att.fileType || d.fileType || d.FILE_TYPE || 'application/octet-stream';
      if (!content) { message.warning('No content available for preview.'); return; }
      setPreviewAtt({ name: att.name, fileType: ft, blobUrl: makeBlobUrl(content, ft) });
    } catch { message.error('Failed to load attachment for preview.'); }
    finally { setPreviewLoading(false); }
  };

  const handleDownloadAtt = async (tabKey: string, att: AttachItem, receiptId: number) => {
    let content = att.content;
    let ft = att.fileType;
    if (!content && att.id && receiptId) {
      try {
        const res = await fetch(`${APEX_AR_RECEIPTS}/${receiptId}/attachments/${att.id}`, { headers: { Accept: 'application/json' } });
        const d = await res.json();
        content = d.content || d.CONTENT || '';
        ft = att.fileType || d.fileType || 'application/octet-stream';
      } catch { message.error('Failed to download.'); return; }
    }
    if (!content) { message.warning('No content available.'); return; }
    const blobUrl = makeBlobUrl(content, ft || 'application/octet-stream');
    const a = document.createElement('a'); a.href = blobUrl; a.download = att.name; a.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  };

  // ── Copy Receipt ─────────────────────────────────────────────────────────
  const [copyModal, setCopyModal] = useState<{ draft: ReceiptDraft } | null>(null);
  const [copying, setCopying] = useState(false);

  const openCopyModal = (draft: ReceiptDraft) => {
    // Prepare the copy draft — blank out identity fields
    setCopyModal({ draft });
  };

  const handleConfirmCopy = async () => {
    if (!copyModal) return;
    const src = copyModal.draft;
    setCopying(true);
    try {
      const newReceiptNumber = `Copy:${src.receiptNumber}`;
      const body = {
        receipt_number:                  newReceiptNumber,
        receipt_type:                    src.receiptType,
        business_unit:                   src.businessUnit,
        receipt_method:                  src.receiptMethod,
        receipt_method_id:               src.receiptMethodId,
        receipt_date:                    src.receiptDate,
        accounting_date:                 null,           // blank per requirement
        maturity_date:                   src.maturityDate || null,
        amount:                          src.amount,
        currency_code:                   src.currency,
        conversion_rate_type:            src.conversionRateType || null,
        conversion_rate:                 src.conversionRate,
        state:                           src.state || null,
        status:                          src.status || null,
        receipt_at_risk:                 src.receiptAtRisk || 'N',
        remittance_bank_name:            src.remittanceBankName || null,
        remittance_bank_branch:          src.remittanceBankBranch || null,
        remittance_bank_account_number:  src.remittanceBankAccountNumber || null,
        remittance_bank_deposit_date:    null,
        customer_name:                   src.customerName || null,
        customer_account_number:         src.customerAccountNumber || null,
        customer_site:                   src.customerSite || null,
        customer_bank:                   src.customerBank || null,
        customer_bank_branch:            src.customerBankBranch || null,
        customer_bank_account_number:    src.customerBankAccountNumber || null,
        receivables_specialist:          src.receivablesSpecialist || null,
        comments:                        src.comments || null,
        structured_payment_reference:    src.structuredPaymentReference || null,
        receipt_batch_name:              src.receiptBatchName || null,
        dr_account:                      src.drAccount || null,
        cr_account:                      src.crAccount || null,
        accounting_status:               null,           // blank per requirement
        sync_status:                     'NEW',
      };

      const res    = await fetch(APEX_AR_RECEIPTS, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const result = await res.json().catch(() => ({}));

      if (!res.ok || (result?.errors ?? 0) > 0) {
        message.error(result?.message || `Copy failed (HTTP ${res.status})`);
        return;
      }

      const newId = result?.receiptId ?? result?.standard_receipt_id;
      if (!newId) { message.error('Copy created but could not retrieve new Receipt ID'); return; }

      message.success(`Receipt copied — new ID: ${newId}`);
      setCopyModal(null);

      // Fetch the new receipt and open it in a new tab
      const fetchRes = await fetch(`${APEX_AR_RECEIPTS}/${newId}`, { headers: { Accept: 'application/json' } });
      const fetchData = await fetchRes.json();
      const r = (fetchData.items ?? [fetchData])[0];
      if (!r) { message.warning('Copied receipt created but could not open it automatically'); return; }

      const newRow: ReceiptRow = {
        key:                         String(newId),
        standardReceiptId:           newId,
        receiptNumber:               r.receipt_number          ?? newReceiptNumber,
        documentNumber:              r.document_number         ?? null,
        receiptType:                 r.receipt_type            ?? src.receiptType,
        businessUnit:                r.business_unit           ?? src.businessUnit,
        receiptMethod:               r.receipt_method          ?? src.receiptMethod,
        receiptDate:                 r.receipt_date            ?? src.receiptDate,
        accountingDate:              r.accounting_date         ?? '',
        amount:                      r.amount                  ?? src.amount ?? 0,
        unappliedAmount:             r.unapplied_amount        ?? 0,
        accountedAmount:             r.accounted_amount        ?? 0,
        currency:                    r.currency_code           ?? src.currency,
        state:                       r.state                   ?? '',
        status:                      r.status                  ?? '',
        remittanceBankName:          r.remittance_bank_name    ?? '',
        remittanceBankAccountNumber: r.remittance_bank_account_number ?? '',
        maturityDate:                r.maturity_date           ?? '',
        customerName:                r.customer_name           ?? src.customerName,
        customerAccountNumber:       r.customer_account_number ?? src.customerAccountNumber,
        comments:                    r.comments                ?? src.comments,
        syncStatus:                  r.sync_status             ?? 'NEW',
        accountingStatus:            '',
      };
      openReceiptTab(newRow);
    } catch (e: any) {
      message.error(`Copy failed: ${e.message}`);
    } finally {
      setCopying(false);
    }
  };

  const handleSaveAttachments = async (tabKey: string, receiptId: number) => {
    if (!receiptId) { message.error('Receipt ID not available — save the receipt first.'); return; }
    const pending = (tabAttachments[tabKey] || []).filter(a => !a.id);
    if (pending.length === 0) { message.info('No new attachments to save.'); return; }
    setAttSaving(prev => ({ ...prev, [tabKey]: true }));
    let savedCount = 0;
    for (const att of pending) {
      if (!att.rawFile && !att.content) { message.warning(`${att.name}: no file data — skipped`); continue; }
      try {
        const base64 = att.content ?? await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => { const r = reader.result as string; resolve(r.split(',')[1] ?? r); };
          reader.onerror = reject;
          reader.readAsDataURL(att.rawFile!);
        });
        const payload = JSON.stringify({ fileName: att.name, fileType: att.fileType || '', fileSize: att.fileSize, content: base64 });
        const res = await fetch(`${APEX_AR_RECEIPTS}/${receiptId}/attachments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
        const txt = await res.text();
        let resp: any = null;
        try { resp = JSON.parse(txt); } catch { /* not JSON */ }
        if (resp?.status === 'success' || res.ok) savedCount++;
        else message.error(`${att.name}: ${resp?.message || txt || `HTTP ${res.status}`}`);
      } catch (e: any) { message.error(`${att.name}: ${e.message}`); }
    }
    // Refresh
    loadedAttRef.current.delete(tabKey);
    await loadAttachments(tabKey, receiptId);
    message.success(`${savedCount} attachment(s) saved.`);
    setAttSaving(prev => ({ ...prev, [tabKey]: false }));
  };

  // ── Receipt PDF ──────────────────────────────────────────────────────────
  const [receiptPdfUrl, setReceiptPdfUrl] = useState<string | null>(null);
  const [receiptPdfModal, setReceiptPdfModal] = useState(false);

  const generateReceiptPdf = (draft: ReceiptDraft) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();

    const fmt = (v: any) => (v != null && v !== '') ? String(v) : '—';
    const fmtAmt = (v: any) => v != null ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
    const fmtDt = (v: any) => {
      if (!v) return '—';
      try { return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
      catch { return String(v); }
    };

    // ── Header bar ─────────────────────────────────────────────────────────
    doc.setFillColor(29, 123, 77);   // REDWOOD success green for AR
    doc.rect(0, 0, pageW, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('RECEIPT VOUCHER', 14, 13);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Printed: ${new Date().toLocaleString()}`, pageW - 14, 13, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    let y = 28;

    // ── Receipt number + state ──────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(29, 123, 77);
    doc.text(`Receipt #${draft.receiptNumber || '—'}`, 14, y);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text(
      `State: ${fmt(draft.state)}   |   Status: ${fmt(draft.status)}   |   Type: ${fmt(draft.receiptType)}`,
      14, y + 6,
    );
    doc.setTextColor(0, 0, 0);
    y += 16;

    // ── Section 1: Receipt Details ─────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Receipt Details', 14, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      body: [
        ['Business Unit',    fmt(draft.businessUnit),          'Receipt Method',    fmt(draft.receiptMethod)],
        ['Receipt Date',     fmtDt(draft.receiptDate),          'Accounting Date',   fmtDt(draft.accountingDate)],
        ['Maturity Date',    fmtDt(draft.maturityDate),         'Receipt at Risk',   fmt(draft.receiptAtRisk)],
        ['Document #',       fmt(draft.documentNumber),         'Receipt ID',        fmt(draft.standardReceiptId || '—')],
        ['Struct. Pay. Ref', fmt(draft.structuredPaymentReference), 'Receipt Batch', fmt(draft.receiptBatchName)],
      ],
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 42, fillColor: [245, 245, 245] },
        2: { fontStyle: 'bold', cellWidth: 42, fillColor: [245, 245, 245] },
      },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    // ── Section 2: Customer ────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Customer', 14, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      body: [
        ['Customer Name',    fmt(draft.customerName),           'Account Number',    fmt(draft.customerAccountNumber)],
        ['Customer Site',    fmt(draft.customerSite),           'Rec. Specialist',   fmt(draft.receivablesSpecialist)],
        ['Customer Bank',    fmt(draft.customerBank),           'Cust. Bank Branch', fmt(draft.customerBankBranch)],
        ['Cust. Bank Acct.', fmt(draft.customerBankAccountNumber), '', ''],
      ],
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 42, fillColor: [245, 245, 245] },
        2: { fontStyle: 'bold', cellWidth: 42, fillColor: [245, 245, 245] },
      },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    // ── Section 3: Amount & Currency ───────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Amount & Currency', 14, y);
    y += 2;
    const amtRows: any[][] = [
      ['Currency',         fmt(draft.currency),                'Entered Amount',   fmtAmt(draft.amount)],
      ['Accounted Amount', fmtAmt(draft.accountedAmount),      'Unapplied Amount', fmtAmt(draft.unappliedAmount)],
    ];
    if (draft.currency && draft.currency !== 'AED') {
      amtRows.push(['Conv. Rate Type', fmt(draft.conversionRateType), 'Conv. Rate', fmt(draft.conversionRate)]);
    }
    autoTable(doc, {
      startY: y,
      body: amtRows,
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 42, fillColor: [245, 245, 245] },
        2: { fontStyle: 'bold', cellWidth: 42, fillColor: [245, 245, 245] },
        3: { halign: 'right' as const },
        1: { halign: 'right' as const },
      },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    // ── Section 4: Remittance Bank ─────────────────────────────────────────
    if (draft.remittanceBankName || draft.remittanceBankAccountNumber) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Remittance Bank', 14, y);
      y += 2;
      autoTable(doc, {
        startY: y,
        body: [
          ['Bank Name',        fmt(draft.remittanceBankName),    'Branch',          fmt(draft.remittanceBankBranch)],
          ['Account Number',   fmt(draft.remittanceBankAccountNumber), 'Deposit Date', fmtDt(draft.remittanceBankDepositDate)],
        ],
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 42, fillColor: [245, 245, 245] },
          2: { fontStyle: 'bold', cellWidth: 42, fillColor: [245, 245, 245] },
        },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // ── Comments ───────────────────────────────────────────────────────────
    if (draft.comments) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Comments', 14, y);
      y += 2;
      autoTable(doc, {
        startY: y,
        body: [[draft.comments]],
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: { 0: { fillColor: [250, 250, 250] } },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // ── Signature block ────────────────────────────────────────────────────
    if (y > 230) { doc.addPage(); y = 20; }
    const sigY = Math.max(y + 12, 240);
    const sigLabels = ['Created By', 'Reviewed By', 'Approved By'];
    const sigValues = [fmt(currentUser), '', ''];
    const sigW = (pageW - 28 - (sigLabels.length - 1) * 10) / sigLabels.length;
    doc.setDrawColor(180, 180, 180);
    sigLabels.forEach((label, i) => {
      const sx = 14 + i * (sigW + 10);
      // Box
      doc.setFillColor(249, 249, 249);
      doc.roundedRect(sx, sigY - 14, sigW, 22, 2, 2, 'FD');
      // Value (pre-filled for Created By)
      if (sigValues[i]) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(29, 123, 77);
        doc.text(sigValues[i], sx + sigW / 2, sigY - 4, { align: 'center', maxWidth: sigW - 4 });
      }
      // Signature line
      doc.setDrawColor(120, 120, 120);
      doc.line(sx + 4, sigY + 2, sx + sigW - 4, sigY + 2);
      // Label below line
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(label, sx + sigW / 2, sigY + 7, { align: 'center' });
    });
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);

    // ── Footer on every page ───────────────────────────────────────────────
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150);
      doc.line(14, 286, pageW - 14, 286);
      doc.text('Generated by ReactERP', 14, 291);
      doc.text(`Page ${i} of ${pageCount}`, pageW / 2, 291, { align: 'center' });
      doc.text(new Date().toLocaleString(), pageW - 14, 291, { align: 'right' });
      doc.setTextColor(0);
    }

    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    if (receiptPdfUrl) URL.revokeObjectURL(receiptPdfUrl);
    setReceiptPdfUrl(url);
    setReceiptPdfModal(true);
  };

  // ── Update draft ──────────────────────────────────────────────────────────
  const updateDraft = (key: string, patch: Partial<ReceiptDraft>) => {
    setTabs(prev => prev.map(t => t.key === key ? { ...t, draft: { ...t.draft, ...patch } } : t));
  };

  // ── Fetch FX conversion rate ───────────────────────────────────────────────
  const fetchFxRate = async (tabKey: string, currency: string) => {
    if (!currency || currency === 'AED') {
      updateDraft(tabKey, { conversionRate: 1, conversionRateType: 'User' });
      return;
    }
    setFxRateLoading(prev => ({ ...prev, [tabKey]: true }));
    try {
      const params = new URLSearchParams({ from_currency: currency, to_currency: 'AED' });
      const res  = await fetch(`${GL_ORDS_BASE}/currencies/dailyrates?${params}`, {
        headers: { Accept: 'application/json' },
      });
      const text  = await res.text();
      const fixed = text.replace(/:\s*\./g, ': 0.');
      const data  = JSON.parse(fixed);
      const rates = (data.items ?? []) as any[];
      if (rates.length === 0) { message.warning(`No FX rate found for ${currency} → AED`); return; }
      const latest = rates.reduce((best: any, r: any) =>
        (r.rateDate ?? '') > (best.rateDate ?? '') ? r : best, rates[0]);
      updateDraft(tabKey, {
        conversionRate:     parseFloat(latest.conversionRate ?? latest.rate ?? 0),
        conversionRateType: latest.rateType ?? latest.conversionRateType ?? 'Corporate',
      });
      message.success(`FX rate loaded: 1 ${currency} = ${latest.conversionRate ?? latest.rate} AED`);
    } catch { message.error('Failed to fetch FX rate'); }
    finally { setFxRateLoading(prev => ({ ...prev, [tabKey]: false })); }
  };

  // ── Build POST payload (shared by save and API inspector) ────────────────
  // receiptId = null → new receipt, DB assigns ID via RR_AR_RECEIPTS_LOCAL_SEQ
  const buildPayload = (draft: ReceiptDraft, receiptId: number | null) => {
    const nowIso = new Date().toISOString().slice(0, 19);
    return {
      ...(receiptId != null ? { StandardReceiptId: receiptId } : {}),
      ReceiptNumber:               draft.receiptNumber                || undefined,
      DocumentNumber:              draft.documentNumber               ?? undefined,
      ReceiptType:                 draft.receiptType                  || undefined,
      BusinessUnit:                draft.businessUnit,
      ReceiptMethod:               draft.receiptMethod,
      ReceiptMethodId:             draft.receiptMethodId      ?? undefined,
      ReceiptDate:                 draft.receiptDate,
      MaturityDate:                draft.maturityDate                 || undefined,
      Amount:                      draft.amount,
      UnappliedAmount:             draft.unappliedAmount              ?? draft.amount,
      AccountedAmount:             draft.accountedAmount              ?? undefined,
      Currency:                    draft.currency,
      ConversionRateType:          draft.conversionRateType           || undefined,
      ConversionRate:              draft.conversionRate               ?? undefined,
      State:                       draft.state                        || 'Unapplied',
      Status:                      draft.status                       || 'Uncleared',
      ReceiptAtRisk:               draft.receiptAtRisk                || 'N',
      RemittanceBankName:          draft.remittanceBankName           || undefined,
      RemittanceBankBranch:        draft.remittanceBankBranch         || undefined,
      RemittanceBankAccountNumber: draft.remittanceBankAccountNumber  || undefined,
      RemittanceBankDepositDate:   draft.remittanceBankDepositDate    || undefined,
      CustomerName:                draft.customerName,
      CustomerAccountNumber:       draft.customerAccountNumber,
      CustomerSite:                draft.customerSite                 || undefined,
      CustomerBank:                draft.customerBank                 || undefined,
      CustomerBankBranch:          draft.customerBankBranch           || undefined,
      CustomerBankAccountNumber:   draft.customerBankAccountNumber    || undefined,
      ReceivablesSpecialist:       draft.receivablesSpecialist        || undefined,
      Comments:                    draft.comments                     || undefined,
      StructuredPaymentReference:  draft.structuredPaymentReference   || undefined,
      ReceiptBatchName:            draft.receiptBatchName             || undefined,
      DrAccount:                   draft.drAccount                    || undefined,
      CrAccount:                   draft.crAccount                    || undefined,
      CreatedBy:                   currentUser,
      CreationDate:                nowIso,
      LastUpdatedBy:               currentUser,
      LastUpdateDate:              nowIso,
    };
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = (tabKey: string) => {
    const tab = tabs.find(t => t.key === tabKey);
    if (!tab) return;
    const { draft } = tab;

    if (draft.standardReceiptId === 0) {
      closeTab(tabKey);
      return;
    }

    Modal.confirm({
      title:   'Delete Receipt',
      icon:    <ExclamationCircleOutlined style={{ color: REDWOOD.primary }} />,
      content: (
        <div>
          <p>This will permanently delete receipt
            <strong> {draft.receiptNumber || `ID ${draft.standardReceiptId}`}</strong> from the database.</p>
          {draft.standardReceiptId > 0 && (
            <p style={{ color: REDWOOD.warning, fontSize: 12 }}>
              Note: This only deletes the local copy. The receipt still exists in Oracle Fusion.
            </p>
          )}
        </div>
      ),
      okText:    'Delete',
      okType:    'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        setDeleting(prev => ({ ...prev, [tabKey]: true }));
        try {
          const res    = await fetch(`${APEX_AR_RECEIPTS}/${draft.standardReceiptId}`, { method: 'DELETE' });
          const result = await res.json().catch(() => ({}));
          if (!res.ok || result?.status === 'ERROR') {
            message.error(result?.message || `Delete failed (HTTP ${res.status})`);
            return;
          }
          message.success(`Receipt deleted`);
          closeTab(tabKey);
          setSearchRows(prev => prev.filter(r => r.standardReceiptId !== draft.standardReceiptId));
        } catch (e: any) {
          message.error(`Delete error: ${e.message}`);
        } finally {
          setDeleting(prev => ({ ...prev, [tabKey]: false }));
        }
      },
    });
  };

  // ── Open Accounting Modal ────────────────────────────────────────────────
  const openAcctModal = (tabKey: string) => {
    const tab = tabs.find(t => t.key === tabKey);
    if (!tab) return;
    const { draft, slaHeaderId, slaPosted } = tab;
    const acct   = allMethodAccounts.find(a => a.id === draft.selectedBankAccountId);
    const amount = Math.abs(draft.amount ?? 0);
    const isMisc = draft.receiptType === 'MISC';
    const cashDesc       = acct?.cashCcid     ? (acctDescCache[acct.cashCcid]?.description      ?? '') : '';
    const unappliedDesc  = acct?.unappliedCcid ? (acctDescCache[acct.unappliedCcid]?.description ?? '') : '';
    const crDesc         = draft.crAccountDesc || '';
    let lines: NonNullable<typeof acctModal>['lines'] = [];
    if (isMisc) {
      lines = [
        { lineType: 'DR', accountingClass: 'CASH', accountCombination: acct?.cashCombination?.replace(/\./g, '-') || draft.drAccount || '', accountDesc: cashDesc || draft.drAccountDesc, enteredDr: amount, enteredCr: 0,      description: `Receipt ${draft.receiptNumber} — Cash DR` },
        { lineType: 'CR', accountingClass: 'MISC', accountCombination: draft.crAccount || '',                                               accountDesc: crDesc,                           enteredDr: 0,      enteredCr: amount, description: `Receipt ${draft.receiptNumber} — Cr Account CR` },
      ];
    } else {
      lines = [
        { lineType: 'DR', accountingClass: 'CASH',      accountCombination: acct?.cashCombination?.replace(/\./g, '-') || draft.drAccount || '',      accountDesc: cashDesc || draft.drAccountDesc,    enteredDr: amount, enteredCr: 0,      description: `Receipt ${draft.receiptNumber} — Cash DR` },
        { lineType: 'CR', accountingClass: 'UNAPPLIED', accountCombination: acct?.unappliedCombination?.replace(/\./g, '-') || '',                    accountDesc: unappliedDesc,                      enteredDr: 0,      enteredCr: amount, description: `Receipt ${draft.receiptNumber} — Unapplied CR` },
      ];
    }
    setAcctModal({ visible: true, tabKey, creating: false, posting: false,
      slaHeaderId: slaHeaderId, slaStatus: slaPosted ? 'POSTED' : (slaHeaderId ? 'CREATED' : ''),
      glBatchId: null, lines });
  };

  const handleCreateAccounting = async () => {
    if (!acctModal) return;
    const { tabKey, lines } = acctModal;
    const tab = tabs.find(t => t.key === tabKey);
    if (!tab) return;
    const { draft } = tab;
    setAcctModal(m => m ? { ...m, creating: true } : m);
    try {
      const ledger = await fetchLedgerByBusinessUnit(draft.businessUnit);
      if (!ledger) throw new Error('Could not resolve ledger for Business Unit: ' + draft.businessUnit);
      const exRate    = draft.conversionRate ?? 1;
      const period    = derivePeriodName(new Date(draft.receiptDate || today()));
      const amount    = Math.abs(draft.amount ?? 0);
      const batchName = `AR-${draft.receiptNumber}-${Date.now()}`;

      // Step 1: Create SLA accounting
      const slaPayload: SlaCreatePayload = {
        header: {
          moduleName: 'AR', sourceTable: 'AR_RECEIPTS',
          sourceId:     draft.standardReceiptId,
          sourceNumber: draft.receiptNumber,
          sourceType:   'Receipt',
          eventTypeCode: draft.receiptType === 'MISC' ? 'AR_MISC_RECEIPT' : 'AR_CASH_RECEIPT',
          eventDate:        draft.receiptDate || today(),
          accountingDate:   draft.accountingDate || draft.receiptDate || today(),
          periodName:       period,
          ledgerId:         ledger.ledgerId,
          ledgerName:       ledger.ledgerName,
          currencyCode:     draft.currency || 'AED',
          ledgerCurrency:   'AED',
          exchangeRate:     exRate,
          exchangeRateType: draft.conversionRateType || 'Corporate',
          businessUnit:     draft.businessUnit,
          description:      `Receipt ${draft.receiptNumber}`,
          createdBy:        currentUser,
        },
        lines: lines.map((l, i) => ({
          lineNumber:       i + 1,
          lineType:         l.lineType as 'DR' | 'CR',
          accountingClass:  l.accountingClass,
          accountCombination: l.accountCombination,
          enteredDr:        l.lineType === 'DR' ? l.enteredDr : 0,
          enteredCr:        l.lineType === 'CR' ? l.enteredCr : 0,
          accountedDr:      l.lineType === 'DR' ? l.enteredDr * exRate : 0,
          accountedCr:      l.lineType === 'CR' ? l.enteredCr * exRate : 0,
          currencyCode:     draft.currency || 'AED',
          exchangeRate:     exRate,
          description:      draft.comments || l.description,
        })),
      };
      const slaResult = await createAccounting(slaPayload);
      const slaHeaderId = slaResult.headerId;
      setAcctModal(m => m ? { ...m, slaHeaderId, slaStatus: slaResult.status } : m);

      // Step 2: Post GL Journal
      const glPayload = {
        batch: {
          batchName, batchDescription: `AR Receipt ${draft.receiptNumber}`,
          ledgerName: ledger.ledgerName, ledgerId: ledger.ledgerId, status: 'NEW',
          accountingPeriod: period, controlTotal: amount,
          runningTotalDr: amount, runningTotalCr: amount,
          batchSource: 'Accounts Receivable', createdBy: currentUser,
        },
        header: {
          ledgerId: ledger.ledgerId, ledgerName: ledger.ledgerName,
          jeCategory: 'Receipts', jeSource: 'Receivables',
          periodName: period,
          journalName: `AR-${draft.receiptNumber}`,
          description: `Receipt ${draft.receiptNumber} — ${draft.customerName || ''}`,
          currencyCode: draft.currency || 'AED',
          currencyConversionType: draft.conversionRateType || 'Corporate',
          currencyConversionDate: draft.receiptDate || today(),
          currencyConversionRate: exRate,
          defaultEffectiveDate: draft.receiptDate || today(),
          status: 'NEW', runningTotalDr: amount, runningTotalCr: amount, createdBy: currentUser,
        },
        lines: lines.map(l => ({
          enteredDr:  l.lineType === 'DR' ? l.enteredDr : null,
          enteredCr:  l.lineType === 'CR' ? l.enteredCr : null,
          accountedDr: l.lineType === 'DR' ? l.enteredDr * exRate : null,
          accountedCr: l.lineType === 'CR' ? l.enteredCr * exRate : null,
          statAmount: null,
          description: draft.comments || l.description,
          currencyCode: draft.currency || 'AED',
          currencyConversionDate: draft.receiptDate || today(),
          currencyConversionRate: exRate,
          userCurrencyConversionType: draft.conversionRateType || 'Corporate',
          accountCombination: l.accountCombination,
          chartOfAccountsName: 'Chart of Accounts',
          reference1: draft.receiptNumber,
          reference2: String(draft.standardReceiptId),
          reference3: l.accountingClass,
          reference4: draft.businessUnit,
          reference5: 'AR_RECEIPTS',
          createdBy: currentUser,
        })),
      };
      const glRes = await fetch(`${APEX_DB_CONFIG.baseUrl}/journals/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(glPayload),
      });
      const glBody = await glRes.json();
      if (!glRes.ok) throw new Error(glBody?.message || `GL HTTP ${glRes.status}`);
      const glBatchId  = glBody?.batchId  ?? glBody?.batch_id  ?? 0;
      const glHeaderId = glBody?.headerId ?? glBody?.header_id ?? 0;
      await postToLedger(slaHeaderId, glBatchId, batchName, glHeaderId, currentUser);

      // Step 3: Stamp ACCOUNTING_STATUS = Accounted on the receipt
      try {
        await fetch(`${APEX_AR_RECEIPTS}/${draft.standardReceiptId}/accounting-status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({}),
        });
      } catch { /* non-critical */ }

      setTabs(prev => prev.map(t => t.key === tabKey
        ? { ...t, slaHeaderId, slaPosted: true, draft: { ...t.draft, accountingStatus: 'Accounted' } }
        : t));
      setAcctModal(m => m ? { ...m, creating: false, glBatchId, slaStatus: 'POSTED' } : m);
      message.success(`Accounting created and posted — Batch ${batchName}`);
    } catch (e: any) {
      setAcctModal(m => m ? { ...m, creating: false } : m);
      message.error('Create Accounting failed: ' + (e?.message || String(e)));
    }
  };


  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async (tabKey: string): Promise<boolean> => {
    const tab = tabs.find(t => t.key === tabKey);
    if (!tab) return false;
    const { draft } = tab;

    // Required field validation
    const missing: string[] = [];
    if (!draft.businessUnit)                  missing.push('Business Unit');
    if (!draft.receiptType)                   missing.push('Receipt Type');
    if (!draft.receiptMethod)                 missing.push('Receipt Method');
    if (!draft.receiptDate)                   missing.push('Receipt Date');
    if (!draft.currency)                      missing.push('Currency');
    if (!draft.amount || draft.amount <= 0)   missing.push('Amount (must be > 0)');
    if (draft.receiptType === 'MISC') {
      if (!draft.customerName)                missing.push('Customer');
    } else {
      if (!draft.customerAccountNumber && !draft.customerName) missing.push('Customer');
    }
    if (!draft.comments)                      missing.push('Comments');

    if (missing.length > 0) {
      message.warning({ content: `Please fill required fields: ${missing.join(' · ')}`, duration: 5 });
      return false;
    }

    const isNew     = draft.standardReceiptId === 0;
    // null → DB assigns ID via RR_AR_RECEIPTS_LOCAL_SEQ; existing → pass the existing ID for UPDATE
    const receiptId = isNew ? null : draft.standardReceiptId;

    setSaving(prev => ({ ...prev, [tabKey]: true }));
    try {
      const body = buildPayload(draft, receiptId);

      // POST for new receipts, PUT for existing ones
      const url    = isNew ? APEX_AR_RECEIPTS : `${APEX_AR_RECEIPTS}/${draft.standardReceiptId}`;
      const method = isNew ? 'POST' : 'PUT';

      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const result = await res.json().catch(() => ({}));

      if (!res.ok || (result?.errors ?? 0) > 0) {
        message.error(result?.message || `Save failed (HTTP ${res.status})`);
        return false;
      }

      // Persist the DB-assigned sequence ID so subsequent saves do UPDATE
      if (isNew && result?.receiptId) {
        updateDraft(tabKey, { standardReceiptId: result.receiptId });
      }
      // Lock the form after save — user clicks Edit to make further changes
      setEditingEnabled(prev => ({ ...prev, [tabKey]: false }));

      message.success(
        isNew
          ? `Receipt created (ID: ${result?.receiptId ?? '—'})`
          : `Receipt updated`
      );
      return true;
    } catch (e: any) {
      message.error(`Save error: ${e.message}`);
      return false;
    } finally {
      setSaving(prev => ({ ...prev, [tabKey]: false }));
    }
  };

  // ── Export Excel ──────────────────────────────────────────────────────────
  const exportToExcel = (rows: ReceiptRow[]) => {
    const headers = ['Receipt #', 'Customer', 'Cust #', 'Business Unit', 'Method',
      'Receipt Date', 'Accounting Date', 'Currency', 'Amount', 'Unapplied', 'Accounted',
      'State', 'Status', 'Remittance Bank', 'Sync'];
    const data = rows.map(r => [
      r.receiptNumber, r.customerName, r.customerAccountNumber, r.businessUnit, r.receiptMethod,
      r.receiptDate, r.accountingDate, r.currency,
      r.amount ?? 0, r.unappliedAmount ?? 0, r.accountedAmount ?? 0,
      r.state, r.status, r.remittanceBankName, r.syncStatus,
    ]);
    const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
    const totals = [`Total (${rows.length})`, '', '', '', '', '', '', '', total, '', '', '', '', '', ''];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data, totals]);
    ws['!cols'] = [
      { wch: 20 }, { wch: 36 }, { wch: 12 }, { wch: 30 }, { wch: 18 },
      { wch: 14 }, { wch: 14 }, { wch: 8  }, { wch: 16 }, { wch: 16 }, { wch: 16 },
      { wch: 12 }, { wch: 14 }, { wch: 28 }, { wch: 10 },
    ];
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    for (let row = 2; row <= rows.length + 2; row++) {
      ['I', 'J', 'K'].forEach(col => {
        const cell = ws[`${col}${row}`];
        if (cell && typeof cell.v === 'number') { cell.t = 'n'; cell.z = '#,##0.00'; }
      });
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'AR Receipts');
    XLSX.writeFile(wb, `AR_Receipts_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`);
  };

  // ── Search columns ────────────────────────────────────────────────────────
  const searchColumns: ColumnsType<ReceiptRow> = [
    { title: '#', key: 'seq', width: 42, fixed: 'left',
      render: (_,__,i) => <Text type="secondary" style={{ fontSize: 12 }}>{i + 1}</Text> },
    { title: 'ID', dataIndex: 'standardReceiptId', width: 100, fixed: 'left',
      render: (v, r) => (
        <Button type="link" style={{ padding: 0, fontSize: 11, fontFamily: 'monospace', fontWeight: 600 }}
          onClick={() => openReceiptTab(r)}>{v || '—'}</Button>
      ) },
    { title: 'Acctg Status', dataIndex: 'accountingStatus', width: 110, fixed: 'left',
      render: v => v === 'Accounted'
        ? <Tag color="green" style={{ fontSize: 11 }}>Accounted</Tag>
        : v ? <Tag color="blue" style={{ fontSize: 11 }}>{v}</Tag>
            : <Text type="secondary" style={{ fontSize: 11 }}>—</Text> },
    { title: 'Type', dataIndex: 'receiptType', width: 70, fixed: 'left',
      render: v => v
        ? <Tag color={v === 'CASH' ? 'blue' : v === 'MISC' ? 'purple' : 'default'} style={{ fontSize: 11, fontWeight: 600 }}>{v}</Tag>
        : <Text type="secondary">—</Text>,
    },
    { title: 'Receipt #', dataIndex: 'receiptNumber', width: 180, fixed: 'left',
      render: (v, r) => (
        <Button type="link" style={{ padding: 0, fontSize: 12, fontWeight: 600 }}
          onClick={() => openReceiptTab(r)}>{v || '—'}</Button>
      ) },
    { title: 'Doc #', dataIndex: 'documentNumber', width: 100,
      render: v => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{v ?? '—'}</Text> },
    { title: 'Customer', dataIndex: 'customerName', width: 220, ellipsis: true,
      render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Cust #', dataIndex: 'customerAccountNumber', width: 100,
      render: v => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{v || '—'}</Text> },
    { title: 'Method', dataIndex: 'receiptMethod', width: 120, ellipsis: true,
      render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Receipt Date', dataIndex: 'receiptDate', width: 110,
      render: v => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'CCY', dataIndex: 'currency', width: 60,
      render: v => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Amount', dataIndex: 'amount', width: 130, align: 'right',
      render: v => <Text style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}>{fmt(v || 0)}</Text> },
    { title: 'Unapplied', dataIndex: 'unappliedAmount', width: 110, align: 'right',
      render: v => <Text style={{ fontSize: 12, fontFamily: 'monospace', color: v > 0 ? REDWOOD.warning : REDWOOD.success }}>{fmt(v || 0)}</Text> },
    { title: 'State', dataIndex: 'state', width: 100,
      render: v => <Tag color={stateColor(v)} style={{ fontSize: 11 }}>{v || '—'}</Tag> },
    { title: 'Status', dataIndex: 'status', width: 100,
      render: v => <Tag color={statusColor(v)} style={{ fontSize: 11 }}>{v || '—'}</Tag> },
    { title: 'Remittance Bank', dataIndex: 'remittanceBankName', width: 180, ellipsis: true,
      render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Bank Acct #', dataIndex: 'remittanceBankAccountNumber', width: 140,
      render: v => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{v || '—'}</Text> },
    { title: 'Maturity Date', dataIndex: 'maturityDate', width: 110,
      render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Business Unit', dataIndex: 'businessUnit', width: 200, ellipsis: true,
      render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Sync', dataIndex: 'syncStatus', width: 80,
      render: v => v ? <Tag color={syncStatusColor(v)} style={{ fontSize: 11 }}>{v}</Tag>
                     : <Text type="secondary" style={{ fontSize: 11 }}>—</Text> },
    { title: '', key: 'open', width: 46, fixed: 'right',
      render: (_, r) => (
        <Tooltip title="Open receipt">
          <Button size="small" icon={<EyeOutlined />} onClick={() => openReceiptTab(r)} />
        </Tooltip>
      ) },
  ];

  // ── Receipt panel ─────────────────────────────────────────────────────────
  const renderReceiptPanel = (tab: ReceiptTab) => {
    const { key: tabKey, draft, syncStatus } = tab;
    const isNew         = draft.standardReceiptId === 0;
    const hasSavedId    = draft.standardReceiptId > 0;
    const isFusionLocked = LOCKED_SYNC.includes((syncStatus || '').toUpperCase()) && !isNew;
    const isAccounted    = draft.accountingStatus === 'Accounted';
    // isEditing: new records are always editable; saved records require Edit button
    const isEditing     = isNew || (editingEnabled[tabKey] ?? false);
    // isLocked: Fusion-synced records or Accounted receipts cannot be edited
    const isLocked      = isFusionLocked || isAccounted;
    const isSaving = saving[tabKey] || false;
    const apps     = receiptApplications[tabKey];

    const appsApiUrl = draft.standardReceiptId
      ? `${APEX_RECEIPT_APPS}?standard_receipt_id=${draft.standardReceiptId}&limit=200`
      : APEX_RECEIPT_APPS;

    // Field helper: right-aligned label + input (for single-col use)
    const field = (label: string, node: React.ReactNode, required = false) => (
      <Row align="middle" style={{ marginBottom: 5 }}>
        <Col span={9} style={{ textAlign: 'right', paddingRight: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {required && <span style={{ color: REDWOOD.primary, marginRight: 2 }}>*</span>}{label}
          </Text>
        </Col>
        <Col span={15}>{node}</Col>
      </Row>
    );

    const fieldDisabled = isLocked || !isEditing;

    const inp = (f: keyof ReceiptDraft, placeholder = '') => (
      <Input size="small" style={{ fontSize: 12 }} value={draft[f] as string}
        placeholder={placeholder} readOnly={fieldDisabled}
        onChange={e => !fieldDisabled && updateDraft(tabKey, { [f]: e.target.value } as any)} />
    );

    const sel = (f: keyof ReceiptDraft, options: string[]) => (
      <Select size="small" style={{ width: '100%', fontSize: 12 }} value={(draft[f] as string) || undefined}
        allowClear disabled={fieldDisabled}
        onChange={v => updateDraft(tabKey, { [f]: v ?? '' } as any)}>
        {options.map(o => <Option key={o} value={o}>{o}</Option>)}
      </Select>
    );

    const dp = (f: keyof ReceiptDraft) => (
      <DatePicker size="small" style={{ width: '100%', fontSize: 12 }}
        value={draft[f] ? dayjs(draft[f] as string) : null}
        format="DD-MMM-YYYY" disabled={fieldDisabled}
        onChange={d => updateDraft(tabKey, { [f]: d ? d.format('YYYY-MM-DD') : '' } as any)} />
    );

    const num = (f: keyof ReceiptDraft) => (
      <InputNumber size="small" style={{ width: '100%', fontSize: 12 }}
        value={draft[f] as number} precision={2} disabled={fieldDisabled}
        onChange={v => updateDraft(tabKey, { [f]: v } as any)} />
    );

    const roVal = (v: React.ReactNode, mono = false) => (
      <Text style={{ fontSize: 12, fontFamily: mono ? 'monospace' : undefined }}>{v || '—'}</Text>
    );

    const buSel = () => {
      const selectedBu = businessUnits.find(b => b.name === draft.businessUnit);
      return (
        <div>
          <Select size="small" style={{ width: '100%', fontSize: 12 }}
            value={draft.businessUnit || undefined} allowClear disabled={fieldDisabled} showSearch
            filterOption={(input, opt) => String(opt?.children ?? '').toLowerCase().includes(input.toLowerCase())}
            onChange={v => {
              updateDraft(tabKey, { businessUnit: v ?? '', receiptMethod: '', selectedBankAccountId: null });
              setReceiptMethods([]);
              setAllMethodAccounts([]);
              if (v) fetchMethodAccountsByBU(tabKey, v);
            }}>
            {businessUnits.map(bu => (
              <Option key={bu.name} value={bu.name}>
                {bu.companyCode ? `${bu.name} — ${bu.companyCode}` : bu.name}
              </Option>
            ))}
          </Select>
          {selectedBu?.companyCode && (
            <div style={{ marginTop: 3 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>Company Code: </Text>
              <Text style={{ fontSize: 11, fontWeight: 600, fontFamily: 'monospace', color: REDWOOD.info }}>
                {selectedBu.companyCode}
              </Text>
            </div>
          )}
        </div>
      );
    };

    const custSel = () => {
      const isMisc = draft.receiptType === 'MISC';
      const display = draft.customerAccountNumber
        ? `${draft.customerName} (${draft.customerAccountNumber})`
        : '';

      if (isMisc) {
        // MISC: free-text name with optional popup search
        return (
          <Space.Compact style={{ width: '100%' }}>
            <Input size="small"
              value={draft.customerName}
              placeholder="Type customer name…"
              disabled={fieldDisabled}
              style={{ fontSize: 12 }}
              onChange={e => updateDraft(tabKey, { customerName: e.target.value, customerAccountNumber: '' })}
            />
            <Tooltip title="Search customer">
              <Button size="small" icon={<SearchOutlined />} disabled={fieldDisabled}
                onClick={() => { if (!fieldDisabled) openLov(tabKey, draft.customerName); }} />
            </Tooltip>
            {draft.customerAccountNumber && (
              <Tooltip title="Clear">
                <Button size="small" icon={<CloseOutlined />} disabled={fieldDisabled}
                  onClick={() => { if (!fieldDisabled) updateDraft(tabKey, { customerName: '', customerAccountNumber: '' }); }} />
              </Tooltip>
            )}
          </Space.Compact>
        );
      }

      // CASH (and default): popup only
      return (
        <Input size="small" readOnly
          value={display}
          placeholder={draft.receiptType ? 'Click to search customer…' : 'Select Receipt Type first'}
          style={{ cursor: fieldDisabled ? 'default' : 'pointer', fontSize: 12, background: '#fff' }}
          onClick={() => { if (!fieldDisabled) openLov(tabKey); }}
          suffix={
            draft.customerAccountNumber
              ? <CloseOutlined style={{ fontSize: 10, cursor: 'pointer', color: REDWOOD.neutral600 }}
                  onClick={e => { e.stopPropagation(); if (!fieldDisabled) updateDraft(tabKey, { customerName: '', customerAccountNumber: '' }); }} />
              : <SearchOutlined style={{ color: REDWOOD.info, cursor: fieldDisabled ? 'default' : 'pointer' }}
                  onClick={() => { if (!fieldDisabled) openLov(tabKey); }} />
          }
        />
      );
    };

    const currSel = () => (
      <Space.Compact style={{ width: '100%' }}>
        <Select size="small" style={{ flex: 1, fontSize: 12 }}
          value={draft.currency || undefined} allowClear disabled={fieldDisabled}
          onChange={v => { updateDraft(tabKey, { currency: v ?? '' }); if (v) fetchFxRate(tabKey, v); }}>
          {['AED', 'USD', 'EUR', 'GBP', 'SAR', 'QAR', 'KWD'].map(o => <Option key={o} value={o}>{o}</Option>)}
        </Select>
        {fxRateLoading[tabKey] && <Spin size="small" style={{ marginLeft: 6, alignSelf: 'center' }} />}
      </Space.Compact>
    );

    const appStatusColor = (s: string) => ({ Applied: 'green', Unapplied: 'blue', Reversed: 'red' }[s] || 'default');
    const procStatusColor = (s: string) => ({ Closed: 'green', Open: 'blue', Reversed: 'red' }[s] || 'default');

    const appColumns: ColumnsType<AppRow> = [
      { title: '#', key: 'seq', width: 36,
        render: (_,__,i) => <Text type="secondary" style={{ fontSize: 11 }}>{i + 1}</Text> },
      { title: 'Application Reference', dataIndex: 'referenceTransactionNumber', width: 160, ellipsis: true,
        render: v => <Text style={{ fontSize: 12, fontWeight: 600 }}>{v || '—'}</Text> },
      { title: 'Receivables Activity', dataIndex: 'activityName', width: 150, ellipsis: true,
        render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
      { title: 'Cust Account', dataIndex: 'custAccountId', width: 110,
        render: v => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{v ?? '—'}</Text> },
      { title: 'Process Status', dataIndex: 'processStatus', width: 110,
        render: v => v ? <Tag color={procStatusColor(v)} style={{ fontSize: 11 }}>{v}</Tag> : <Text type="secondary">—</Text> },
      { title: 'Applied Amount', dataIndex: 'applicationAmount', width: 130, align: 'right',
        render: v => (
          <Text style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600,
            color: v > 0 ? REDWOOD.success : undefined }}>
            {fmt(v || 0)}
          </Text>
        ) },
      { title: 'CCY', dataIndex: 'enteredCurrency', width: 55,
        render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
      { title: 'App. Status', dataIndex: 'applicationStatus', width: 100,
        render: v => v ? <Tag color={appStatusColor(v)} style={{ fontSize: 11 }}>{v}</Tag> : <Text type="secondary">—</Text> },
      { title: 'Ref Txn Status', dataIndex: 'referenceTransactionStatus', width: 110,
        render: v => v ? <Tag color={procStatusColor(v)} style={{ fontSize: 11 }}>{v}</Tag> : <Text type="secondary">—</Text> },
      { title: 'Latest', dataIndex: 'isLatestApplication', width: 56, align: 'center',
        render: v => v === 'Y'
          ? <Tag color="green" style={{ fontSize: 10, margin: 0 }}>Y</Tag>
          : <Text type="secondary" style={{ fontSize: 11 }}>N</Text> },
      { title: 'Application Date', dataIndex: 'applicationDate', width: 115,
        render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
      { title: 'Accounting Date', dataIndex: 'accountingDate', width: 115,
        render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    ];

    return (
      <div style={{ background: REDWOOD.neutral100, minHeight: '100%' }}>

        {/* ── Toolbar ── */}
        <div style={{ background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.border}`, padding: '8px 16px' }}>
          {isLocked && (
            <Alert type="info" showIcon icon={<LockOutlined />} style={{ marginBottom: 8, fontSize: 12 }}
              message={<span><strong>Synced from Oracle Fusion</strong> — Sync Status:&nbsp;
                <Tag color={syncStatusColor(syncStatus)} style={{ fontSize: 11 }}>{syncStatus}</Tag>
              </span>} />
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              {isNew
                ? <Badge color="purple" text={<Text style={{ fontSize: 12 }}>New — Not Saved</Text>} />
                : hasSavedId
                  ? <>
                      <Text type="secondary" style={{ fontSize: 12 }}>Receipt ID:</Text>
                      <Text strong style={{ fontSize: 12, fontFamily: 'monospace', color: REDWOOD.info }}>{draft.standardReceiptId}</Text>
                      {isEditing
                        ? <Badge color="orange" text={<Text style={{ fontSize: 12, color: '#d46b08' }}>Edit Mode</Text>} />
                        : <Badge color="green" text={<Text style={{ fontSize: 12 }}>Saved</Text>} />
                      }
                    </>
                  : <Badge color="blue" text={<Text style={{ fontSize: 12 }}>Saved Locally</Text>} />
              }
              {syncStatus && <Tag color={syncStatusColor(syncStatus)} style={{ fontSize: 11 }}>{syncStatus}</Tag>}
              {draft.accountingStatus === 'Accounted'
                ? <><Tag color="green" style={{ fontSize: 11 }}>Accounted</Tag>
                    <Tag icon={<LockOutlined />} color="red" style={{ fontSize: 11 }}>Read Only</Tag></>
                : tab.slaHeaderId
                  ? <Tag color="blue" style={{ fontSize: 11 }}>SLA Created</Tag>
                  : null
              }
            </Space>
            <Space size="small">
              {/* API Services info */}
              <Tooltip title="API Services">
                <Button size="small" icon={<ApiOutlined style={{ color: REDWOOD.info }} />}
                  onClick={() => setApiInfoVisible(true)} />
              </Tooltip>
              {/* Payload inspector */}
              <Tooltip title="Inspect POST payload">
                <Button size="small" icon={<CodeOutlined style={{ color: REDWOOD.neutral600 }} />}
                  onClick={() => setApiModal({ tabKey, testResult: null, testing: false })} />
              </Tooltip>

              {/* Print — always visible for saved receipts */}
              {hasSavedId && (
                <Tooltip title="Print Receipt">
                  <Button size="small" icon={<PrinterOutlined />}
                    onClick={() => generateReceiptPdf(draft)}>
                    Print
                  </Button>
                </Tooltip>
              )}

              {/* Delete */}
              {hasSavedId && isEditing && !isLocked && (
                <Tooltip title="Delete receipt">
                  <Button size="small" danger icon={<DeleteOutlined />} loading={deleting[tabKey]}
                    onClick={() => handleDelete(tabKey)} />
                </Tooltip>
              )}

              {/* Accounting buttons — only after receipt is saved */}
              {hasSavedId && (
                isAccounted
                  ? <Button size="small" icon={<EyeOutlined />}
                      style={{ color: '#722ed1', borderColor: '#722ed1' }}
                      onClick={() => openViewAccounting(draft)}>
                      View Accounting
                    </Button>
                  : <Tooltip title={!draft.receiptMethod ? 'Select a Receipt Method first' : 'Create SLA accounting entries'}>
                      <Button size="small" icon={<BookOutlined />}
                        style={{ color: REDWOOD.success, borderColor: REDWOOD.success }}
                        onClick={() => openAcctModal(tabKey)}>
                        Create Accounting
                      </Button>
                    </Tooltip>
              )}

              {/* Edit / Save / Cancel */}
              {hasSavedId && !isEditing && !isLocked && (
                <Button size="small" icon={<EditOutlined />}
                  style={{ color: REDWOOD.warning, borderColor: REDWOOD.warning }}
                  onClick={() => setEditingEnabled(prev => ({ ...prev, [tabKey]: true }))}>
                  Edit
                </Button>
              )}
              {isEditing && !isLocked && <>
                <Button size="small" type="primary" icon={<SaveOutlined />} loading={isSaving}
                  style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                  onClick={() => handleSave(tabKey)}>Save</Button>
                <Button size="small" icon={<SaveOutlined />} loading={isSaving}
                  onClick={async () => { const ok = await handleSave(tabKey); if (ok) closeTab(tabKey); }}>
                  Save and Close
                </Button>
                {hasSavedId && (
                  <Button size="small" onClick={() => setEditingEnabled(prev => ({ ...prev, [tabKey]: false }))}>
                    Cancel
                  </Button>
                )}
              </>}
              {/* Actions dropdown — only for saved receipts */}
              {hasSavedId && (
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      {
                        key: 'copy',
                        icon: <CopyOutlined />,
                        label: 'Copy Receipt',
                        onClick: () => openCopyModal(draft),
                      },
                      {
                        key: 'reverse',
                        icon: <RollbackOutlined />,
                        label: 'Reverse Receipt',
                        disabled: true,
                        title: 'Coming soon',
                      },
                    ],
                  }}
                >
                  <Button size="small">
                    Actions <DownOutlined style={{ fontSize: 10 }} />
                  </Button>
                </Dropdown>
              )}
              <Button size="small" icon={<CloseOutlined />} onClick={() => closeTab(tabKey)}>Close</Button>
            </Space>
          </div>
        </div>

        <div style={{ padding: '12px 16px' }}>

          {/* ── Main tabs ── */}
          <Card size="small" style={{ marginBottom: 10, borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
            <Tabs size="small" style={{ padding: '0 12px' }} defaultActiveKey="geninfo" items={[
              /* ── General Information ── */
              {
                key: 'geninfo',
                label: <span><InfoCircleOutlined style={{ marginRight: 4 }} />General Information</span>,
                children: (
                  <div style={{ padding: '10px 8px 14px' }}>
                    {/* 3-column layout matching Oracle Fusion */}
                    <Row gutter={0}>

                      {/* Col 1: Receipt info */}
                      <Col span={8} style={{ paddingRight: 16, borderRight: `1px solid ${REDWOOD.border}` }}>
                        {field('Business Unit',  buSel(), true)}
                        {field('Receipt Type',
                          <Select size="small" style={{ width: '100%', fontSize: 12 }}
                            value={draft.receiptType || undefined} allowClear disabled={fieldDisabled}
                            onChange={v => updateDraft(tabKey, { receiptType: v ?? '' })}>
                            <Option value="CASH"><Tag color="blue" style={{ fontSize: 11 }}>CASH</Tag></Option>
                            <Option value="MISC"><Tag color="purple" style={{ fontSize: 11 }}>MISC</Tag></Option>
                          </Select>
                        , true)}
                        {field('Receipt Method',
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4, gap: 6 }}>
                              <Text type="secondary" style={{ fontSize: 10 }}>
                                {allMethodAccountsLoading[tabKey] ? 'Loading…' : `${receiptMethods.length} methods loaded`}
                              </Text>
                              <Tooltip title="Reload methods for this Business Unit">
                                <Button size="small" type="text" icon={<ReloadOutlined spin={!!allMethodAccountsLoading[tabKey]} />}
                                  style={{ fontSize: 11, padding: '0 4px', height: 18, lineHeight: '18px' }}
                                  disabled={!draft.businessUnit}
                                  onClick={() => fetchMethodAccountsByBU(tabKey, draft.businessUnit)} />
                              </Tooltip>
                            </div>
                            <Select
                              size="small"
                              style={{ width: '100%', fontSize: 12 }}
                              value={draft.selectedBankAccountId ?? undefined}
                              allowClear
                              disabled={fieldDisabled}
                              showSearch
                              loading={allMethodAccountsLoading[tabKey]}
                              placeholder={allMethodAccountsLoading[tabKey] ? 'Loading…' : draft.businessUnit ? 'Select method…' : 'Select Business Unit first'}
                              optionLabelProp="label"
                              dropdownStyle={{ minWidth: 620 }}
                              filterOption={(input, opt) =>
                                String(opt?.searchtext ?? '').toLowerCase().includes(input.trim().toLowerCase())
                              }
                              onChange={(v) => {
                                const acct = allMethodAccounts.find(a => a.id === v);
                                const tab  = tabs.find(t => t.key === tabKey);
                                updateDraft(tabKey, {
                                  receiptMethod:               acct?.receiptMethodName ?? '',
                                  receiptMethodId:             acct?.receiptMethodId   ?? null,
                                  selectedBankAccountId:       v ?? null,
                                  remittanceBankName:          acct?.bankName          ?? '',
                                  remittanceBankAccountNumber: acct?.bankAccountNum    ?? '',
                                  // auto-fill DR Account from Cash account if currently blank
                                  ...(acct?.cashCombination && !(tab?.draft.drAccount) ? {
                                    drAccount:     acct.cashCombination.replace(/\./g, '-'),
                                    drAccountDesc: acct.cashCcid > 0 ? (acctDescCache[acct.cashCcid]?.description ?? '') : '',
                                  } : {}),
                                });
                              }}
                            >
                              {allMethodAccounts.map(a => {
                                const masked     = maskAcct(a.bankAccountNum);
                                const searchtext = [a.receiptMethodName, a.receiptClass, a.bankName, a.bankAccountName, a.bankAccountNum].filter(Boolean).join(' ');
                                return (
                                  <Option key={a.id} value={a.id} label={a.receiptMethodName} searchtext={searchtext}>
                                    <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, padding: '2px 0' }}>
                                      <span style={{ fontWeight: 600, minWidth: 160, flexShrink: 0 }}>{a.receiptMethodName}</span>
                                      <span style={{ flex: 1, color: '#595959', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: 8 }}>
                                        {a.bankAccountName || a.bankName || '—'}
                                      </span>
                                      <span style={{ fontFamily: 'monospace', color: REDWOOD.info, marginLeft: 8, flexShrink: 0, fontSize: 11, minWidth: 100, textAlign: 'right' }}>
                                        {masked}
                                      </span>
                                      <span style={{ color: '#8c8c8c', fontSize: 10, marginLeft: 12, flexShrink: 0, minWidth: 90, textAlign: 'right' }}>
                                        {a.receiptClass || ''}
                                      </span>
                                    </div>
                                  </Option>
                                );
                              })}
                            </Select>
                            {/* Selected: show class + chosen bank account */}
                            {draft.receiptMethod && (() => {
                              const m     = receiptMethods.find(x => x.name === draft.receiptMethod);
                              const accts = draft.selectedBankAccountId
                                ? allMethodAccounts.filter(a => a.id === draft.selectedBankAccountId)
                                : allMethodAccounts.filter(a => a.receiptMethodName === draft.receiptMethod);
                              return (
                                <div style={{ marginTop: 4 }}>
                                  {m?.receiptClass && (
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                      Class: <strong>{m.receiptClass}</strong>
                                    </Text>
                                  )}
                                  {accts.length > 0 && (
                                    <div style={{ marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                      {accts.map(a => (
                                        <Tag key={a.id} color="blue" icon={<BankOutlined />}
                                          style={{ fontSize: 10, margin: 0 }}>
                                          {a.bankAccountName
                                            ? `${a.bankAccountName}${a.bankAccountNum ? ' · ' + a.bankAccountNum : ''}`
                                            : a.bankAccountNum || `Acct ${a.bankAccountId}`}
                                          {a.primaryFlag === 'Y' ? ' ★' : ''}
                                        </Tag>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        , true)}
                        {field('Dr. Account',
                          <div>
                            <Space.Compact style={{ width: '100%' }}>
                              <Input size="small" readOnly
                                value={draft.drAccount}
                                placeholder="Select GL combination…"
                                style={{ fontSize: 11, fontFamily: draft.drAccount ? 'monospace' : undefined, background: '#fff', cursor: 'pointer', letterSpacing: draft.drAccount ? '0.02em' : undefined }}
                                onClick={() => { if (!fieldDisabled) { setMiscAcctTabKey(tabKey); setMiscAcctField('drAccount'); setMiscAcctVisible(true); } }}
                              />
                              {draft.drAccount
                                ? <Button size="small" icon={<CloseOutlined />} disabled={fieldDisabled}
                                    onClick={() => updateDraft(tabKey, { drAccount: '', drAccountDesc: '' })} />
                                : <Button size="small" icon={<SearchOutlined />} disabled={fieldDisabled}
                                    onClick={() => { setMiscAcctTabKey(tabKey); setMiscAcctField('drAccount'); setMiscAcctVisible(true); }} />
                              }
                            </Space.Compact>
                            {draft.drAccountDesc && (
                              <Text style={{ fontSize: 10, color: REDWOOD.info, display: 'block', marginTop: 2 }}>
                                {draft.drAccountDesc}
                              </Text>
                            )}
                          </div>
                        )}
                        {field('Cr. Account',
                          <div>
                            <Space.Compact style={{ width: '100%' }}>
                              <Input size="small" readOnly
                                value={draft.crAccount}
                                placeholder="Select GL combination…"
                                style={{ fontSize: 11, fontFamily: draft.crAccount ? 'monospace' : undefined, background: '#fff', cursor: 'pointer', letterSpacing: draft.crAccount ? '0.02em' : undefined }}
                                onClick={() => { if (!fieldDisabled) { setMiscAcctTabKey(tabKey); setMiscAcctField('crAccount'); setMiscAcctVisible(true); } }}
                              />
                              {draft.crAccount
                                ? <Button size="small" icon={<CloseOutlined />} disabled={fieldDisabled}
                                    onClick={() => updateDraft(tabKey, { crAccount: '', crAccountDesc: '' })} />
                                : <Button size="small" icon={<SearchOutlined />} disabled={fieldDisabled}
                                    onClick={() => { setMiscAcctTabKey(tabKey); setMiscAcctField('crAccount'); setMiscAcctVisible(true); }} />
                              }
                            </Space.Compact>
                            {draft.crAccountDesc && (
                              <Text style={{ fontSize: 10, color: REDWOOD.info, display: 'block', marginTop: 2 }}>
                                {draft.crAccountDesc}
                              </Text>
                            )}
                          </div>
                        )}
                        {field('Receipt Number', inp('receiptNumber', 'Auto-generated if blank'), true)}
                        {field('Customer',       custSel())}
                        {field('State',          sel('state', ['Applied', 'Unapplied', 'On Account', 'Reversed', 'NSF', 'Stop']))}
                        {field('Status',         sel('status', ['Cleared', 'Uncleared', 'Reversed', 'Remitted']))}
                      </Col>

                      {/* Col 2: Amounts + specialist */}
                      <Col span={8} style={{ paddingLeft: 16, paddingRight: 16, borderRight: `1px solid ${REDWOOD.border}` }}>
                        {field('Currency',          currSel(), true)}
                        {/* Entered Amount input */}
                        {field('Entered Amount',    num('amount'), true)}
                        {/* Accounted Amount display */}
                        {field('Accounted Amount',
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 14, fontFamily: 'monospace', fontWeight: 700, color: '#1a1a1a' }}>
                              {fmt(draft.accountedAmount ?? 0)}
                            </Text>
                          </div>
                        )}
                        {/* Unapplied display */}
                        {field('Unapplied Amount',
                          <Text style={{ fontSize: 13, fontFamily: 'monospace',
                            color: (draft.unappliedAmount ?? 0) > 0 ? REDWOOD.warning : REDWOOD.success }}>
                            {fmt(draft.unappliedAmount ?? 0)}
                          </Text>
                        )}
                        {field('Rec. Specialist',   inp('receivablesSpecialist'))}
                        {field('Comments',
                          <Input.TextArea size="small" style={{ fontSize: 12 }} rows={2}
                            value={draft.comments} readOnly={fieldDisabled}
                            onChange={e => !fieldDisabled && updateDraft(tabKey, { comments: e.target.value })} />
                        , true)}
                      </Col>

                      {/* Col 3: Dates + other */}
                      <Col span={8} style={{ paddingLeft: 16 }}>
                        {field('Receipt Date',     dp('receiptDate'),     true)}
                        {field('Accounting Date',  dp('accountingDate'),  true)}
                        {field('Maturity Date',    dp('maturityDate'))}
                        {field('Receipt at Risk',  sel('receiptAtRisk', ['Y', 'N']))}
                        {field('Conv. Rate Type',  inp('conversionRateType'))}
                        {field('Conv. Rate',       num('conversionRate'))}
                        {field('Struct. Pay. Ref', inp('structuredPaymentReference'))}
                      </Col>

                    </Row>
                  </div>
                ),
              },

              /* ── Remittance Bank ── */
              {
                key: 'bank',
                label: <span><BankOutlined style={{ marginRight: 4 }} />Remittance Bank</span>,
                children: (
                  <div style={{ padding: '10px 8px 14px' }}>
                    {/* Manual bank fields */}
                    <Row gutter={0} style={{ marginBottom: 16 }}>
                      <Col span={8} style={{ paddingRight: 16, borderRight: `1px solid ${REDWOOD.border}` }}>
                        {field('Bank Name',       inp('remittanceBankName'))}
                        {field('Branch',          inp('remittanceBankBranch'))}
                        {field('Account Number',  inp('remittanceBankAccountNumber'))}
                        {field('Deposit Date',    dp('remittanceBankDepositDate'))}
                      </Col>
                      <Col span={8} style={{ paddingLeft: 16, paddingRight: 16, borderRight: `1px solid ${REDWOOD.border}` }}>
                        {field('Batch Name',      inp('receiptBatchName'))}
                        {field('Struct. Pay. Ref', inp('structuredPaymentReference'))}
                      </Col>
                      <Col span={8} style={{ paddingLeft: 16 }}>
                        {field('Customer Bank',        inp('customerBank'))}
                        {field('Cust. Bank Branch',    inp('customerBankBranch'))}
                        {field('Cust. Bank Acct. No.', inp('customerBankAccountNumber'))}
                      </Col>
                    </Row>

                    {/* GL Accounts from Receipt Method */}
                    <Divider style={{ fontSize: 13, margin: '12px 0' }}>
                      <Space>
                        <BankOutlined style={{ color: REDWOOD.info }} />
                        GL Accounts — Receipt Method
                        {draft.receiptMethod
                          ? <Tag color="blue" style={{ fontSize: 11 }}>{draft.receiptMethod}</Tag>
                          : <Text type="secondary" style={{ fontSize: 12 }}>Select a Receipt Method above to load accounts</Text>
                        }
                      </Space>
                    </Divider>

                    {(() => {
                      const m          = receiptMethods.find(x => x.name === draft.receiptMethod);
                      const acctList   = draft.selectedBankAccountId
                        ? allMethodAccounts.filter(a => a.id === draft.selectedBankAccountId)
                        : allMethodAccounts.filter(a => a.receiptMethodName === draft.receiptMethod);
                      const isLoading  = allMethodAccountsLoading[tabKey];
                      return (
                      <Spin spinning={isLoading} tip="Loading bank accounts…">
                      {!draft.receiptMethod ? (
                        <Alert type="info" showIcon style={{ fontSize: 12 }}
                          message="Select a Receipt Method in the General Information tab to view the associated GL accounts." />
                      ) : acctList.length === 0 && !isLoading ? (
                        <Alert type="warning" showIcon style={{ fontSize: 12 }}
                          message={`No bank accounts found for receipt method "${draft.receiptMethod}".`} />
                      ) : (
                        acctList.map((acct, idx) => (
                          <div key={acct.id} style={{
                            border: `1px solid ${REDWOOD.border}`, borderRadius: 8,
                            marginBottom: 12, overflow: 'hidden',
                          }}>
                            {/* Account header */}
                            <div style={{
                              background: '#e6f4ff', borderBottom: `1px solid #91caff`,
                              padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                            }}>
                              <BankOutlined style={{ color: REDWOOD.info }} />
                              <Text strong style={{ fontSize: 12, color: REDWOOD.info }}>
                                {acct.bankAccountName || `Bank Account #${idx + 1}`}
                              </Text>
                              {acct.bankAccountNum && (
                                <Text style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}>
                                  {acct.bankAccountNum}
                                </Text>
                              )}
                              {acct.primaryFlag === 'Y' && (
                                <Tag color="gold" style={{ fontSize: 10, margin: 0 }}>Primary</Tag>
                              )}
                              {acct.bankCurrency && (
                                <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>{acct.bankCurrency}</Tag>
                              )}
                              <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>
                                {acct.businessUnitName && <span>{acct.businessUnitName}</span>}
                                {acct.company          && <span> ({acct.company})</span>}
                                {acct.bankName         && <span> · {acct.bankName}</span>}
                                {acct.bankBranchName   && <span> · {acct.bankBranchName}</span>}
                                {acct.startDate        ? <span> · From: {acct.startDate}</span> : ''}
                                {acct.endDate          ? <span> · To: {acct.endDate}</span> : ''}
                              </Text>
                            </div>

                            {/* GL Combinations grid */}
                            <div style={{ padding: '10px 14px', background: '#fff' }}>
                              <Row gutter={[12, 8]}>
                                {[
                                  { label: 'Cash',              ccid: acct.cashCcid,              combo: acct.cashCombination,              color: '#f6ffed', border: '#b7eb8f', textColor: REDWOOD.success },
                                  { label: 'Unapplied',         ccid: acct.unappliedCcid,         combo: acct.unappliedCombination,         color: '#e6f4ff', border: '#91caff', textColor: REDWOOD.info },
                                  { label: 'Unidentified',      ccid: acct.unidentifiedCcid,      combo: acct.unidentifiedCombination,      color: '#fff7e6', border: '#ffd591', textColor: REDWOOD.warning },
                                  { label: 'On Account',        ccid: acct.onAccountCcid,         combo: acct.onAccountCombination,         color: '#f9f0ff', border: '#d3adf7', textColor: '#722ed1' },
                                  { label: 'Receipt Clearing',  ccid: acct.receiptClearingCcid,   combo: acct.receiptClearingCombination,   color: '#e6fffb', border: '#87e8de', textColor: '#08979c' },
                                  { label: 'Remittance',        ccid: acct.remittanceCcid,        combo: acct.remittanceCombination,        color: '#fff0f6', border: '#ffadd2', textColor: '#c41d7f' },
                                ].map(({ label, ccid, combo, color, border, textColor }) => {
                                  const descInfo = ccid > 0 ? acctDescCache[ccid] : undefined;
                                  return (
                                  <Col xs={24} md={12} lg={8} key={label}>
                                    <div style={{
                                      background: color, border: `1px solid ${border}`,
                                      borderRadius: 6, padding: '6px 10px',
                                    }}>
                                      <Text type="secondary" style={{ fontSize: 10, display: 'block', marginBottom: 2 }}>
                                        {label}
                                      </Text>
                                      <Text style={{
                                        fontSize: 11, fontFamily: 'monospace', fontWeight: 600,
                                        color: combo ? textColor : '#bfbfbf', wordBreak: 'break-all',
                                      }}>
                                        {combo || '—'}
                                      </Text>
                                      {descInfo?.description && (
                                        <Text style={{ fontSize: 10, color: textColor, display: 'block', marginTop: 2, opacity: 0.85 }}>
                                          {descInfo.description}
                                        </Text>
                                      )}
                                      {ccid > 0 && (
                                        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 2 }}>
                                          CCID: {ccid}
                                        </Text>
                                      )}
                                    </div>
                                  </Col>
                                  );
                                })}
                              </Row>
                            </div>
                          </div>
                        ))
                      )}
                      </Spin>
                      );
                    })()}
                  </div>
                ),
              },

              /* ── Customer ── */
              {
                key: 'customer',
                label: <span><UserOutlined style={{ marginRight: 4 }} />Customer</span>,
                children: (
                  <div style={{ padding: '10px 8px 14px' }}>
                    <Row gutter={0}>
                      <Col span={8} style={{ paddingRight: 16, borderRight: `1px solid ${REDWOOD.border}` }}>
                        {field('Customer Name',       inp('customerName'), true)}
                        {field('Account Number',      inp('customerAccountNumber'))}
                        {field('Customer Site',       inp('customerSite'))}
                      </Col>
                      <Col span={8} style={{ paddingLeft: 16 }}>
                        {field('Rec. Specialist', inp('receivablesSpecialist'))}
                      </Col>
                    </Row>
                  </div>
                ),
              },

              /* ── Notes ── */
              {
                key: 'notes',
                label: <span><FileTextOutlined style={{ marginRight: 4 }} />Notes</span>,
                children: (
                  <div style={{ padding: '10px 8px 14px' }}>
                    <Input.TextArea rows={6} style={{ fontSize: 12 }}
                      value={draft.comments} readOnly={fieldDisabled}
                      placeholder="Enter comments…"
                      onChange={e => !fieldDisabled && updateDraft(tabKey, { comments: e.target.value })} />
                  </div>
                ),
              },
            ]} />
          </Card>

          {/* ── Attachments ── */}
          <Card size="small" style={{ marginBottom: 10, borderRadius: 8 }}
            title={
              <Space>
                <PaperClipOutlined style={{ color: REDWOOD.neutral600 }} />
                <Text strong style={{ fontSize: 13 }}>Attachments</Text>
                {(tabAttachments[tabKey] || []).length > 0 && (
                  <Badge count={(tabAttachments[tabKey] || []).length} style={{ backgroundColor: REDWOOD.info }} />
                )}
              </Space>
            }
            extra={
              <Space size={4}>
                <Tooltip title="Show API request details (URL & JSON body)">
                  <Button size="small" icon={<ApiOutlined />} onClick={() => {
                    const pending = (tabAttachments[tabKey] || []).filter(a => !a.id);
                    const url = `${APEX_AR_RECEIPTS}/${draft.standardReceiptId}/attachments`;
                    const body = pending.length > 0
                      ? JSON.stringify({ fileName: pending[0].name, fileType: pending[0].fileType || '', fileSize: pending[0].fileSize, content: '(base64 content omitted for brevity)' }, null, 2)
                      : '(no pending attachments — add a file first)';
                    setAttApiDebug({ url, body });
                  }} />
                </Tooltip>
                <Tooltip title={!hasSavedId ? 'Save the receipt first' : undefined}>
                  <Button size="small" icon={<UploadOutlined />}
                    disabled={!hasSavedId}
                    loading={attSaving[tabKey]}
                    onClick={() => handleSaveAttachments(tabKey, draft.standardReceiptId)}>
                    Save Attachments
                  </Button>
                </Tooltip>
              </Space>
            }
          >
            <div style={{ padding: '8px 12px' }}>
              <Upload
                fileList={(tabAttachments[tabKey] || []).map(a => ({ uid: a.uid, name: a.name, status: a.status, size: a.fileSize, type: a.fileType }))}
                beforeUpload={(file) => {
                  const reader = new FileReader();
                  reader.onload = (e) => {
                    const base64 = (e.target?.result as string)?.split(',')[1] || '';
                    setTabAttachments(prev => ({
                      ...prev,
                      [tabKey]: [...(prev[tabKey] || []), { uid: `new-${Date.now()}`, name: file.name, fileType: file.type, fileSize: file.size, content: base64, rawFile: file, status: 'done' }],
                    }));
                  };
                  reader.readAsDataURL(file);
                  return false;
                }}
                onRemove={(file) => new Promise((resolve) => {
                  Modal.confirm({
                    title: 'Delete attachment?',
                    content: `"${file.name}" will be permanently removed.`,
                    okText: 'Delete', okButtonProps: { danger: true }, cancelText: 'Cancel',
                    onOk: async () => {
                      const att = (tabAttachments[tabKey] || []).find(a => a.uid === file.uid);
                      if (att?.id && draft.standardReceiptId) {
                        await fetch(`${APEX_AR_RECEIPTS}/${draft.standardReceiptId}/attachments/${att.id}`, { method: 'DELETE' }).catch(() => {});
                      }
                      setTabAttachments(prev => ({ ...prev, [tabKey]: (prev[tabKey] || []).filter(a => a.uid !== file.uid) }));
                      resolve(false);
                    },
                    onCancel: () => resolve(false),
                  });
                })}
                showUploadList={false}
                multiple
                disabled={!hasSavedId}
              >
                <Tooltip title={!hasSavedId ? 'Save the receipt first to attach files' : undefined}>
                  <Button icon={<UploadOutlined />} disabled={!hasSavedId} size="small">
                    Attach Files
                  </Button>
                </Tooltip>
              </Upload>

              <div style={{ marginTop: 8 }}>
                {(tabAttachments[tabKey] || []).map(att => (
                  <div key={att.uid} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 0', fontSize: 13 }}>
                    <PaperClipOutlined style={{ color: REDWOOD.neutral600, flexShrink: 0 }} />
                    <span style={{ flex: '0 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }} title={att.name}>
                      {att.name}
                    </span>
                    {att.fileSize > 0 && (
                      <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>
                        ({att.fileSize < 1024 ? `${att.fileSize} B` : att.fileSize < 1048576 ? `${(att.fileSize / 1024).toFixed(1)} KB` : `${(att.fileSize / 1048576).toFixed(1)} MB`})
                      </Text>
                    )}
                    {!att.id && <Tag color="orange" style={{ fontSize: 10, margin: 0 }}>Pending</Tag>}
                    <Button type="text" size="small" icon={<EyeOutlined />} style={{ flexShrink: 0, padding: '0 4px' }}
                      onClick={() => handlePreviewAtt(tabKey, att, draft.standardReceiptId)} />
                    <Button type="text" size="small" icon={<DownloadOutlined />} style={{ flexShrink: 0, padding: '0 4px' }}
                      onClick={() => handleDownloadAtt(tabKey, att, draft.standardReceiptId)} />
                    <Button type="text" size="small" icon={<DeleteOutlined />} style={{ flexShrink: 0, padding: '0 4px', color: '#ff4d4f' }}
                      onClick={() => {
                        Modal.confirm({
                          title: 'Delete attachment?',
                          content: `"${att.name}" will be permanently removed.`,
                          okText: 'Delete', okButtonProps: { danger: true }, cancelText: 'Cancel',
                          onOk: async () => {
                            if (att.id && draft.standardReceiptId) {
                              await fetch(`${APEX_AR_RECEIPTS}/${draft.standardReceiptId}/attachments/${att.id}`, { method: 'DELETE' }).catch(() => {});
                            }
                            setTabAttachments(prev => ({ ...prev, [tabKey]: (prev[tabKey] || []).filter(a => a.uid !== att.uid) }));
                          },
                        });
                      }}
                    />
                  </div>
                ))}
                {previewLoading && <Spin size="small" style={{ marginTop: 8 }} />}
                {(tabAttachments[tabKey] || []).length === 0 && (
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>No attachments</Text>
                )}
              </div>
            </div>
          </Card>

          {/* ── Receipt Applications ── */}
          <Card size="small" style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}
            title={
              <Space>
                <UnorderedListOutlined style={{ color: REDWOOD.info }} />
                <Text strong style={{ fontSize: 13 }}>Receipt Applications</Text>
                {apps && !apps.loading && (
                  <Badge count={apps.rows.length} style={{ backgroundColor: REDWOOD.info }} overflowCount={9999} />
                )}
              </Space>
            }
            extra={
              <Space size="small">
                {/* API debug icon — hover to see the URL being called */}
                <Tooltip
                  title={
                    <div style={{ fontSize: 11 }}>
                      <div style={{ marginBottom: 4, fontWeight: 600 }}>GET endpoint:</div>
                      <code style={{ wordBreak: 'break-all', fontSize: 10 }}>{appsApiUrl}</code>
                    </div>
                  }
                  placement="bottomRight"
                >
                  <Button size="small" icon={<ApiOutlined style={{ color: REDWOOD.info }} />} />
                </Tooltip>
                <Button size="small" icon={<ReloadOutlined />}
                  disabled={!draft.standardReceiptId}
                  onClick={() => {
                    fetchedAppsRef.current.delete(tabKey);
                    fetchApplications(tabKey, draft.standardReceiptId);
                  }}>
                  Refresh
                </Button>
              </Space>
            }
          >
            {!draft.standardReceiptId ? (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Save the receipt first to load applications.
                </Text>
              </div>
            ) : apps?.loading ? (
              <div style={{ padding: 32, textAlign: 'center' }}>
                <Spin size="small" />
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                  Loading applications…
                </Text>
              </div>
            ) : (
              <Table<AppRow>
                dataSource={apps?.rows || []}
                columns={appColumns}
                rowKey="key"
                size="small"
                pagination={false}
                scroll={{ x: 1150 }}
                locale={{ emptyText: 'No applications found for this receipt' }}
                summary={rows => {
                  const total = rows.reduce((s, r) => s + (r.applicationAmount || 0), 0);
                  return total > 0 ? (
                    <Table.Summary fixed>
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={5}>
                          <Text strong style={{ fontSize: 12 }}>Total</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={5} align="right">
                          <Text strong style={{ fontSize: 12, fontFamily: 'monospace', color: REDWOOD.success }}>
                            {fmt(total)}
                          </Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={6} colSpan={6} />
                      </Table.Summary.Row>
                    </Table.Summary>
                  ) : null;
                }}
              />
            )}
          </Card>

        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const q = gridFilter.trim().toLowerCase();
  const filteredRows = q
    ? searchRows.filter(r =>
        [r.receiptNumber, r.customerName, r.customerAccountNumber, r.receiptMethod,
         r.state, r.status, r.remittanceBankName, r.businessUnit, r.currency,
         r.receiptDate, String(r.amount ?? 0), fmt(r.amount ?? 0), r.syncStatus]
          .some(v => (v || '').toLowerCase().includes(q))
      )
    : searchRows;

  return (
    <Layout style={{ minHeight: '100vh', background: REDWOOD.neutral100 }}>
      <Content style={{ padding: '16px 20px' }}>

        <Breadcrumb style={{ marginBottom: 12 }} items={[
          { title: <Link to="/"><HomeOutlined /></Link> },
          { title: <Link to="/ar">Accounts Receivable</Link> },
          { title: 'Manage Receipts' },
        ]} />

        <Space style={{ marginBottom: 14 }} align="center">
          <DollarOutlined style={{ fontSize: 22, color: REDWOOD.success }} />
          <Title level={4} style={{ margin: 0 }}>Manage Receipts</Title>
          <Button type="primary" icon={<PlusOutlined />}
            style={{ background: REDWOOD.success, borderColor: REDWOOD.success, marginLeft: 16 }}
            onClick={openNewTab}>
            Create New Receipt
          </Button>
        </Space>

        <Tabs type="editable-card" hideAdd activeKey={activeKey} onChange={setActiveKey}
          onEdit={(key, action) => { if (action === 'remove') closeTab(String(key)); }}
          items={[
            // ── Search tab ───────────────────────────────────────────────
            {
              key: 'search',
              label: <span><SearchOutlined style={{ marginRight: 4 }} />Search</span>,
              closable: false,
              children: (
                <div style={{ paddingTop: 4 }}>
                  <Card size="small" style={{ marginBottom: 12, borderRadius: 8 }}>
                    <Form form={searchForm} layout="inline" size="small" onFinish={handleSearch}>
                      <Row gutter={[8, 8]} style={{ width: '100%' }}>
                        {/* Row 1 */}
                        <Col xs={24} sm={12} md={8} lg={6}>
                          <Form.Item name="businessUnit" label="Business Unit"
                            rules={[{ required: true, message: 'Required' }]}
                            style={{ marginBottom: 0, width: '100%' }}>
                            <Select style={{ width: '100%' }} placeholder="Select BU" allowClear showSearch
                              filterOption={(input, opt) =>
                                String(opt?.children ?? '').toLowerCase().includes(input.toLowerCase())
                              }>
                              {businessUnits.map(bu => (
                                <Option key={bu.name} value={bu.name}>
                                  {bu.companyCode ? `${bu.name} — ${bu.companyCode}` : bu.name}
                                </Option>
                              ))}
                            </Select>
                          </Form.Item>
                        </Col>

                        <Col xs={24} sm={12} md={8} lg={6}>
                          <Form.Item label="Customer" style={{ marginBottom: 0, width: '100%' }}>
                            <Form.Item name="customer" noStyle><Input type="hidden" /></Form.Item>
                            <Input readOnly
                              value={lovSelected ? `${lovSelected.accountName} (${lovSelected.accountNumber})` : ''}
                              placeholder="Click to search…"
                              style={{ cursor: 'pointer', background: '#fff' }}
                              onClick={() => openLov('search')}
                              suffix={lovSelected
                                ? <CloseOutlined style={{ fontSize: 11, cursor: 'pointer' }}
                                    onClick={e => { e.stopPropagation(); setLovSelected(null); }} />
                                : <SearchOutlined style={{ color: REDWOOD.info, cursor: 'pointer' }}
                                    onClick={() => openLov('search')} />
                              }
                            />
                          </Form.Item>
                        </Col>

                        <Col xs={24} sm={12} md={8} lg={6}>
                          <Form.Item name="receiptNumber" label="Receipt #" style={{ marginBottom: 0 }}>
                            <Input placeholder="Receipt number" allowClear style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>

                        <Col xs={24} sm={12} md={8} lg={6}>
                          <Form.Item name="receiptType" label="Receipt Type" style={{ marginBottom: 0 }}>
                            <Select style={{ width: '100%' }} placeholder="All" allowClear>
                              <Option value="CASH">CASH</Option>
                              <Option value="MISC">MISC</Option>
                            </Select>
                          </Form.Item>
                        </Col>

                        <Col xs={24} sm={12} md={8} lg={6}>
                          <Form.Item name="currency" label="Currency" style={{ marginBottom: 0 }}>
                            <Select style={{ width: '100%' }} placeholder="Any" allowClear>
                              {['AED', 'USD', 'EUR', 'GBP', 'SAR', 'QAR', 'KWD'].map(c =>
                                <Option key={c} value={c}>{c}</Option>
                              )}
                            </Select>
                          </Form.Item>
                        </Col>

                        {/* Row 2 */}
                        <Col xs={24} sm={12} md={8} lg={6}>
                          <Form.Item name="state" label="State" style={{ marginBottom: 0 }}>
                            <Select style={{ width: '100%' }} placeholder="Any" allowClear>
                              {['Applied', 'Unapplied', 'On Account', 'Reversed', 'NSF', 'Stop'].map(s =>
                                <Option key={s} value={s}>{s}</Option>
                              )}
                            </Select>
                          </Form.Item>
                        </Col>

                        <Col xs={24} sm={12} md={8} lg={6}>
                          <Form.Item name="status" label="Status" style={{ marginBottom: 0 }}>
                            <Select style={{ width: '100%' }} placeholder="Any" allowClear>
                              {['Cleared', 'Uncleared', 'Reversed', 'Remitted'].map(s =>
                                <Option key={s} value={s}>{s}</Option>
                              )}
                            </Select>
                          </Form.Item>
                        </Col>

                        {/* Date preset + picker */}
                        <Col xs={24} sm={24} md={16} lg={12}>
                          <Form.Item label="Receipt Date" style={{ marginBottom: 0 }}>
                            <Space>
                              <Radio.Group size="small" value={datePreset}
                                onChange={e => applyDatePreset(e.target.value)}>
                                <Radio.Button value="today">Today</Radio.Button>
                                <Radio.Button value="last7">Last 7d</Radio.Button>
                                <Radio.Button value="last30">Last 30d</Radio.Button>
                                <Radio.Button value="range">Range</Radio.Button>
                              </Radio.Group>
                              <Form.Item name="dateRange" noStyle>
                                <RangePicker size="small" format="DD-MMM-YYYY" style={{ width: 230 }}
                                  onChange={() => setDatePreset('range')} />
                              </Form.Item>
                            </Space>
                          </Form.Item>
                        </Col>

                        {/* Search button */}
                        <Col xs={24} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <Space>
                            <Button onClick={() => { searchForm.resetFields(); setLovSelected(null); setDatePreset('range'); }}>
                              Clear
                            </Button>
                            <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={searching}
                              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>
                              Search
                            </Button>
                          </Space>
                        </Col>
                      </Row>
                    </Form>
                  </Card>

                  {/* Results */}
                  <Card size="small" style={{ borderRadius: 8 }}
                    title={
                      <Space wrap>
                        <Badge count={filteredRows.length} style={{ backgroundColor: REDWOOD.primary }} overflowCount={9999} />
                        <Text strong>Receipts</Text>
                        {gridFilter && searchRows.length !== filteredRows.length && (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            ({searchRows.length} total, {filteredRows.length} shown)
                          </Text>
                        )}
                      </Space>
                    }
                    extra={
                      <Space size="small">
                        <Input size="small" allowClear
                          prefix={<FilterOutlined style={{ color: REDWOOD.neutral600 }} />}
                          placeholder="Filter results…" style={{ width: 200 }}
                          value={gridFilter} onChange={e => setGridFilter(e.target.value)} />
                        {lastSearchUrl && (
                          <Tooltip title="Show last API request URL">
                            <Button size="small" icon={<ApiOutlined style={{ color: REDWOOD.info }} />}
                              onClick={() => Modal.info({
                                title: 'Search API Request',
                                width: 720,
                                content: (
                                  <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
                                    <div style={{ marginBottom: 6 }}><strong>Method:</strong> GET</div>
                                    <div style={{ background: '#f5f5f5', border: '1px solid #d9d9d9', borderRadius: 4, padding: '8px 10px', wordBreak: 'break-all' }}>
                                      {lastSearchUrl}
                                    </div>
                                    <div style={{ marginTop: 10, color: '#888', fontSize: 11 }}>
                                      Tip: paste this URL in a browser to see the raw ORDS JSON response and verify ACCOUNTING_STATUS is returned.
                                    </div>
                                  </div>
                                ),
                              })} />
                          </Tooltip>
                        )}
                        <Tooltip title="Export to Excel">
                          <Button size="small" icon={<DownloadOutlined />}
                            disabled={filteredRows.length === 0}
                            onClick={() => exportToExcel(filteredRows)}>Excel</Button>
                        </Tooltip>
                        <Button size="small" icon={<ReloadOutlined />} onClick={() => setGridFilter('')} />
                      </Space>
                    }
                  >
                    <Table<ReceiptRow>
                      dataSource={filteredRows} columns={searchColumns} rowKey="key"
                      size="small" loading={searching}
                      pagination={{ pageSize: 50, size: 'small', showSizeChanger: true,
                        showTotal: t => `${t} receipts` }}
                      scroll={{ x: 1800, y: 500 }}
                      onRow={r => ({ onDoubleClick: () => openReceiptTab(r), style: { cursor: 'pointer' } })}
                    />
                  </Card>
                </div>
              ),
            },

            // ── Dynamic receipt tabs ─────────────────────────────────────
            ...tabs.map(tab => ({
              key:      tab.key,
              closable: true,
              label: (
                <span style={{ fontSize: 12 }}>
                  <DollarOutlined style={{ marginRight: 4, color: REDWOOD.success }} />
                  {tab.draft.standardReceiptId === 0
                    ? 'New Receipt'
                    : tab.draft.receiptNumber
                      ? tab.draft.receiptNumber
                      : tab.draft.standardReceiptId > 0
                        ? `ID ${tab.draft.standardReceiptId}`
                        : 'New Receipt'}
                </span>
              ),
              children: renderReceiptPanel(tab),
            })),
          ]}
        />
      </Content>
      <FloatingMenu />

      {/* Receipt PDF Preview Modal */}
      <Modal
        open={receiptPdfModal}
        title={<Space><PrinterOutlined /><span>Receipt Voucher</span></Space>}
        onCancel={() => { setReceiptPdfModal(false); if (receiptPdfUrl) { URL.revokeObjectURL(receiptPdfUrl); setReceiptPdfUrl(null); } }}
        footer={
          <Space>
            <Button icon={<PrinterOutlined />} type="primary"
              onClick={() => { if (receiptPdfUrl) { const w = window.open(receiptPdfUrl); w?.print(); } }}>
              Print
            </Button>
            <Button icon={<DownloadOutlined />}
              onClick={() => { if (receiptPdfUrl) { const a = document.createElement('a'); a.href = receiptPdfUrl; a.download = 'receipt.pdf'; a.click(); } }}>
              Download PDF
            </Button>
            <Button onClick={() => { setReceiptPdfModal(false); if (receiptPdfUrl) { URL.revokeObjectURL(receiptPdfUrl); setReceiptPdfUrl(null); } }}>
              Close
            </Button>
          </Space>
        }
        width={860}
        styles={{ body: { padding: 0, height: '75vh' } }}
      >
        {receiptPdfUrl && (
          <iframe src={receiptPdfUrl} title="Receipt PDF" style={{ width: '100%', height: '100%', border: 'none' }} />
        )}
      </Modal>

      {/* Attachment Preview Modal */}
      {previewAtt && (
        <Modal
          open title={<Space><PaperClipOutlined /><span>{previewAtt.name}</span></Space>}
          onCancel={() => { URL.revokeObjectURL(previewAtt.blobUrl); setPreviewAtt(null); }}
          footer={<Button onClick={() => { URL.revokeObjectURL(previewAtt.blobUrl); setPreviewAtt(null); }}>Close</Button>}
          width={860}
          styles={{ body: { padding: 0, maxHeight: '70vh', overflow: 'auto' } }}
        >
          {previewAtt.fileType.startsWith('image/') ? (
            <img src={previewAtt.blobUrl} alt={previewAtt.name} style={{ width: '100%' }} />
          ) : previewAtt.fileType === 'application/pdf' ? (
            <iframe src={previewAtt.blobUrl} title={previewAtt.name} style={{ width: '100%', height: '65vh', border: 'none' }} />
          ) : (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <Text type="secondary">Preview not available for this file type.</Text>
              <br />
              <Button icon={<DownloadOutlined />} style={{ marginTop: 12 }}
                onClick={() => { const a = document.createElement('a'); a.href = previewAtt.blobUrl; a.download = previewAtt.name; a.click(); }}>
                Download
              </Button>
            </div>
          )}
        </Modal>
      )}

      {/* Attachment API Debug Modal */}
      <Modal
        open={!!attApiDebug}
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /><span>Attachment API Request</span></Space>}
        onCancel={() => setAttApiDebug(null)}
        footer={<Button onClick={() => setAttApiDebug(null)}>Close</Button>}
        width={700}
      >
        {attApiDebug && (
          <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Method:</Text> <Text code>POST</Text>
            </div>
            <div style={{ marginBottom: 8 }}>
              <Text strong>URL:</Text>
              <div style={{ background: '#f5f5f5', border: '1px solid #d9d9d9', borderRadius: 4, padding: '6px 10px', marginTop: 4, wordBreak: 'break-all' }}>
                {attApiDebug.url}
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Headers:</Text>
              <div style={{ background: '#f5f5f5', border: '1px solid #d9d9d9', borderRadius: 4, padding: '6px 10px', marginTop: 4 }}>
                {`Content-Type: application/json`}
              </div>
            </div>
            <div>
              <Text strong>Body (first pending attachment):</Text>
              <pre style={{ background: '#f5f5f5', border: '1px solid #d9d9d9', borderRadius: 4, padding: '8px 10px', marginTop: 4, maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {attApiDebug.body}
              </pre>
            </div>
          </div>
        )}
      </Modal>

      {/* Customer LOV Modal — shared for search panel and receipt tabs */}
      <Modal
        title={
          <Space>
            <UserOutlined style={{ color: REDWOOD.info }} />
            <span>{lovContext === 'search' ? 'Search Customers' : 'Select Customer'}</span>
          </Space>
        }
        open={lovVisible} onCancel={() => setLovVisible(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {lovLoading ? 'Loading…' : `${lovRows.length.toLocaleString()} of ${lovAllRows.length.toLocaleString()} customers`}
            </Text>
            <Button onClick={() => setLovVisible(false)}>Cancel</Button>
          </div>
        }
        width={680} styles={{ body: { padding: '12px 24px' } }}
      >
        <Input autoFocus allowClear
          prefix={<SearchOutlined style={{ color: REDWOOD.neutral600 }} />}
          placeholder="Filter by name or account number…"
          value={lovSearch} onChange={e => setLovSearch(e.target.value)}
          style={{ marginBottom: 8 }} />
        <Table
          dataSource={lovRows} rowKey="custAccountId" size="small"
          loading={lovLoading}
          pagination={{ pageSize: 15, size: 'small', showTotal: t => `${t} customers` }}
          onRow={c => ({ onClick: () => onLovSelect(c), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Account #', dataIndex: 'accountNumber', width: 130,
              render: v => <Text style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}>{v}</Text> },
            { title: 'Customer Name', dataIndex: 'accountName',
              render: v => <Text style={{ fontSize: 12 }}>{v}</Text> },
          ]}
        />
      </Modal>

      {/* ── API Inspector Modal ─────────────────────────────────────────── */}
      {apiModal && (() => {
        const tab = tabs.find(t => t.key === apiModal.tabKey);
        if (!tab) return null;
        const { draft } = tab;
        const isNew     = draft.standardReceiptId === 0;
        const receiptId = isNew ? null : draft.standardReceiptId;
        const payload   = buildPayload(draft, receiptId);
        const bodyJson = JSON.stringify(payload, null, 2);
        const postUrl  = APEX_AR_RECEIPTS;
        const deleteUrl = `${APEX_AR_RECEIPTS}/${draft.standardReceiptId}`;

        const runTest = async () => {
          setApiModal(prev => prev ? { ...prev, testing: true, testResult: null } : null);
          try {
            const res    = await fetch(postUrl, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify(payload),
            });
            const text = await res.text();
            setApiModal(prev => prev
              ? { ...prev, testing: false, testResult: `HTTP ${res.status}\n\n${text}` }
              : null);
          } catch (e: any) {
            setApiModal(prev => prev
              ? { ...prev, testing: false, testResult: `Error: ${e.message}` }
              : null);
          }
        };

        return (
          <Modal
            title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /><span>API Inspector — Receipt</span></Space>}
            open onCancel={() => setApiModal(null)}
            width={720}
            footer={
              <Space>
                <Button icon={<SendOutlined />} type="primary" loading={apiModal.testing}
                  style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
                  onClick={runTest}>
                  Test POST
                </Button>
                <Button onClick={() => setApiModal(null)}>Close</Button>
              </Space>
            }
            styles={{ body: { padding: '12px 24px' } }}
          >
            {/* POST endpoint */}
            <div style={{ marginBottom: 12 }}>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                POST Endpoint
              </Text>
              <div style={{ background: '#f0f7ff', border: '1px solid #bae0ff', borderRadius: 4,
                padding: '6px 10px', fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
                <Tag color="blue" style={{ fontSize: 11, marginRight: 8 }}>POST</Tag>
                {postUrl}
              </div>
            </div>

            {/* DELETE endpoint (only for saved receipts) */}
            {!isNew && (
              <div style={{ marginBottom: 12 }}>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                  DELETE Endpoint
                </Text>
                <div style={{ background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 4,
                  padding: '6px 10px', fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
                  <Tag color="red" style={{ fontSize: 11, marginRight: 8 }}>DELETE</Tag>
                  {deleteUrl}
                </div>
              </div>
            )}

            {/* JSON Payload */}
            <div style={{ marginBottom: apiModal.testResult ? 12 : 0 }}>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                POST Body (JSON)
              </Text>
              <pre style={{
                background: '#1e1e1e', color: '#d4d4d4', borderRadius: 6,
                padding: '10px 14px', fontSize: 11, maxHeight: 320,
                overflowY: 'auto', margin: 0, lineHeight: 1.5,
              }}>
                {bodyJson}
              </pre>
            </div>

            {/* Test result */}
            {apiModal.testResult && (
              <div style={{ marginTop: 12 }}>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                  Response
                </Text>
                <pre style={{
                  background: apiModal.testResult.startsWith('HTTP 2')
                    ? '#f6ffed' : '#fff2f0',
                  border: `1px solid ${apiModal.testResult.startsWith('HTTP 2') ? '#b7eb8f' : '#ffccc7'}`,
                  borderRadius: 6, padding: '8px 12px', fontSize: 11,
                  maxHeight: 160, overflowY: 'auto', margin: 0, whiteSpace: 'pre-wrap',
                }}>
                  {apiModal.testResult}
                </pre>
              </div>
            )}
          </Modal>
        );
      })()}

      {/* ── API Services Info Modal ── */}
      <Modal
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /><span>API Services</span></Space>}
        open={apiInfoVisible} onCancel={() => setApiInfoVisible(false)}
        footer={<Button onClick={() => setApiInfoVisible(false)}>Close</Button>}
        width={760}
      >
        <Table
          size="small" pagination={false}
          dataSource={[
            { key: 1, service: 'AR Receipts',             method: 'GET / POST / PUT', url: APEX_AR_RECEIPTS },
            { key: 2, service: 'AR Receipt Applications', method: 'GET',              url: APEX_RECEIPT_APPS },
            { key: 3, service: 'AR Customers',            method: 'GET',              url: `${APEX_DB_CONFIG.baseUrl}/ar/customers` },
            { key: 4, service: 'Business Units',          method: 'GET',              url: `${APEX_DB_CONFIG.baseUrl}/gl/businessunits` },
            { key: 5, service: 'Receipt Method Accounts', method: 'GET',              url: ORDS_RECEIPT_METHOD_ACCOUNTS },
            { key: 6, service: 'GL Segment Values',       method: 'GET',              url: 'chartofaccounts/structuresegments (via AccountSelector)' },
            { key: 7, service: 'FX Daily Rates',          method: 'GET',              url: `${GL_ORDS_BASE}/currencies/dailyrates` },
            { key: 8, service: 'SLA Create Accounting',   method: 'POST',             url: `${APEX_DB_CONFIG.baseUrl}/sla/accounting/create` },
            { key: 9, service: 'SLA Post to Ledger',      method: 'POST',             url: `${APEX_DB_CONFIG.baseUrl}/sla/accounting/post` },
            { key: 10, service: 'GL Journals Create',     method: 'POST',             url: `${APEX_DB_CONFIG.baseUrl}/journals/create` },
          ]}
          columns={[
            { title: 'Service', dataIndex: 'service', width: 200, render: v => <Text strong style={{ fontSize: 12 }}>{v}</Text> },
            { title: 'Method', dataIndex: 'method', width: 130,
              render: v => v.split(' / ').map((m: string) => (
                <Tag key={m} color={m === 'GET' ? 'blue' : m === 'POST' ? 'green' : 'orange'} style={{ fontSize: 10, margin: '0 2px' }}>{m}</Tag>
              )) },
            { title: 'URL', dataIndex: 'url', render: v => <Text style={{ fontSize: 10, fontFamily: 'monospace', wordBreak: 'break-all' }}>{v}</Text> },
          ]}
        />
      </Modal>

      {/* ── AccountSelector for Dr / Cr Account ── */}
      {miscAcctVisible && (() => {
        const miscTab = tabs.find(t => t.key === miscAcctTabKey);
        const companyCode = businessUnits.find(b => b.name === miscTab?.draft.businessUnit)?.companyCode ?? '';
        return (
          <AccountSelector
            visible={miscAcctVisible}
            lockedFirstSegment={companyCode || undefined}
            onSelect={(code, segments) => {
              const desc = Object.values(segments ?? {})
                .map((s: any) => s.description).filter(Boolean).join(' · ');
              const descField = miscAcctField === 'drAccount' ? 'drAccountDesc' : 'crAccountDesc';
              updateDraft(miscAcctTabKey, { [miscAcctField]: code, [descField]: desc } as any);
              setMiscAcctVisible(false);
            }}
            onCancel={() => setMiscAcctVisible(false)}
          />
        );
      })()}

      {/* ── View Accounting Modal ── */}
      {viewAcctModal && (
        <Modal
          open
          title={<Space><EyeOutlined style={{ color: '#722ed1' }} /><span>GL Journal — Receipt {viewAcctModal.receiptNumber}</span></Space>}
          onCancel={() => setViewAcctModal(null)}
          footer={<Button onClick={() => setViewAcctModal(null)}>Close</Button>}
          width={900}
        >
          {viewAcctModal.loading
            ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
            : viewAcctModal.header
              ? <>
                  <Descriptions size="small" bordered column={3} style={{ marginBottom: 16 }}>
                    <Descriptions.Item label="Journal Name">{viewAcctModal.header.journalName || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Batch">{viewAcctModal.header.batchName || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Status"><Tag color="green">{viewAcctModal.header.batchStatus || 'Posted'}</Tag></Descriptions.Item>
                    <Descriptions.Item label="Period">{viewAcctModal.header.periodName || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Acctg Date">{viewAcctModal.header.accountingDate || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Created By">{viewAcctModal.header.createdBy || '—'}</Descriptions.Item>
                  </Descriptions>
                  <Table
                    dataSource={(viewAcctModal.lines || []).map((l: any, i: number) => ({ ...l, key: i }))}
                    size="small"
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                    columns={[
                      { title: 'Line', dataIndex: 'lineNumber', width: 50, render: (_: any, __: any, i: number) => i + 1 },
                      { title: 'Account', dataIndex: 'accountCombination', width: 220, render: (v: string) => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{v}</Text> },
                      { title: 'Description', dataIndex: 'description', ellipsis: true, render: (v: string) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
                      { title: 'Dr', dataIndex: 'enteredDr', width: 130, align: 'right' as const,
                        render: (v: number) => v ? <Text style={{ fontSize: 12, fontFamily: 'monospace', color: REDWOOD.success }}>{Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text> : <Text type="secondary">—</Text> },
                      { title: 'Cr', dataIndex: 'enteredCr', width: 130, align: 'right' as const,
                        render: (v: number) => v ? <Text style={{ fontSize: 12, fontFamily: 'monospace', color: REDWOOD.primary }}>{Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text> : <Text type="secondary">—</Text> },
                      { title: 'Ref2', dataIndex: 'reference2', width: 120, render: (v: string) => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{v || '—'}</Text> },
                    ]}
                  />
                </>
              : <Alert type="warning" showIcon message={`No GL journal found for receipt number "${viewAcctModal.receiptNumber}"`} />
          }
        </Modal>
      )}

      {/* ── Create / Post Accounting Modal ── */}
      {acctModal?.visible && (() => {
        const tab = tabs.find(t => t.key === acctModal.tabKey);
        const draft2 = tab?.draft;
        const amount = Math.abs(draft2?.amount ?? 0);
        const isPosted = acctModal.slaStatus === 'POSTED';
        const exRate = draft2?.conversionRate ?? 1;
        const period = draft2?.receiptDate ? derivePeriodName(new Date(draft2.receiptDate)) : '—';
        return (
          <Modal
            title={
              <Space>
                <BookOutlined style={{ color: REDWOOD.success }} />
                <span>Accounting — Receipt {draft2?.receiptNumber}</span>
                {acctModal.slaHeaderId && (
                  <Tag color="green" style={{ fontSize: 11 }}>SLA #{acctModal.slaHeaderId}</Tag>
                )}
                {isPosted && <Tag color="purple" style={{ fontSize: 11 }}>POSTED</Tag>}
              </Space>
            }
            open onCancel={() => setAcctModal(null)}
            width={900}
            footer={
              <Space>
                <Button
                  type="primary" icon={<BookOutlined />}
                  loading={acctModal.creating}
                  disabled={!!acctModal.slaHeaderId}
                  style={!acctModal.slaHeaderId ? { background: REDWOOD.success, borderColor: REDWOOD.success } : {}}
                  onClick={handleCreateAccounting}
                >
                  Create Accounting
                </Button>
                <Button onClick={() => setAcctModal(null)}>Close</Button>
              </Space>
            }
          >
            {acctModal.slaHeaderId && (
              <Alert type="success" showIcon style={{ marginBottom: 12, fontSize: 12 }}
                message={`SLA Journal created — Header ID: ${acctModal.slaHeaderId}${acctModal.glBatchId ? ` · GL Batch ID: ${acctModal.glBatchId}` : ''}`} />
            )}

            {/* ── SLA Header ── */}
            <div style={{ marginBottom: 10 }}>
              <Text strong style={{ fontSize: 12, color: REDWOOD.neutral600, display: 'block', marginBottom: 6 }}>
                SLA Header
              </Text>
              <Descriptions bordered size="small" column={3}
                labelStyle={{ fontSize: 11, fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap' }}
                contentStyle={{ fontSize: 11, fontFamily: 'monospace' }}
              >
                <Descriptions.Item label="Module">AR</Descriptions.Item>
                <Descriptions.Item label="Source Table">AR_RECEIPTS</Descriptions.Item>
                <Descriptions.Item label="Source ID">{draft2?.standardReceiptId}</Descriptions.Item>
                <Descriptions.Item label="Receipt #">{draft2?.receiptNumber}</Descriptions.Item>
                <Descriptions.Item label="Event Type">{draft2?.receiptType === 'MISC' ? 'AR_MISC_RECEIPT' : 'AR_CASH_RECEIPT'}</Descriptions.Item>
                <Descriptions.Item label="Source Type">Receipt</Descriptions.Item>
                <Descriptions.Item label="Receipt Date">{draft2?.receiptDate || '—'}</Descriptions.Item>
                <Descriptions.Item label="Accounting Date">{draft2?.accountingDate || draft2?.receiptDate || '—'}</Descriptions.Item>
                <Descriptions.Item label="Period">{period}</Descriptions.Item>
                <Descriptions.Item label="Currency">{draft2?.currency || 'AED'}</Descriptions.Item>
                <Descriptions.Item label="Ledger Currency">AED</Descriptions.Item>
                <Descriptions.Item label="Exchange Rate">{exRate !== 1 ? exRate : '1 (functional)'}</Descriptions.Item>
                <Descriptions.Item label="Rate Type">{draft2?.conversionRateType || 'Corporate'}</Descriptions.Item>
                <Descriptions.Item label="Business Unit">{draft2?.businessUnit}</Descriptions.Item>
                <Descriptions.Item label="Created By">{currentUser}</Descriptions.Item>
                <Descriptions.Item label="Description" span={3}>
                  Receipt {draft2?.receiptNumber}
                </Descriptions.Item>
              </Descriptions>
            </div>

            {/* ── GL Batch / Header ── */}
            <div style={{ marginBottom: 10 }}>
              <Text strong style={{ fontSize: 12, color: REDWOOD.neutral600, display: 'block', marginBottom: 6 }}>
                GL Journal Header
              </Text>
              <Descriptions bordered size="small" column={3}
                labelStyle={{ fontSize: 11, fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap' }}
                contentStyle={{ fontSize: 11, fontFamily: 'monospace' }}
              >
                <Descriptions.Item label="Batch Name" span={2}>{`AR-${draft2?.receiptNumber}-<timestamp>`}</Descriptions.Item>
                <Descriptions.Item label="Batch Source">Accounts Receivable</Descriptions.Item>
                <Descriptions.Item label="JE Category">Receipts</Descriptions.Item>
                <Descriptions.Item label="JE Source">Receivables</Descriptions.Item>
                <Descriptions.Item label="Period">{period}</Descriptions.Item>
                <Descriptions.Item label="Journal Name">{`AR-${draft2?.receiptNumber}`}</Descriptions.Item>
                <Descriptions.Item label="Effective Date">{draft2?.receiptDate || '—'}</Descriptions.Item>
                <Descriptions.Item label="Control Total" ><Text style={{ fontFamily: 'monospace', fontWeight: 600 }}>{fmt(amount)}</Text></Descriptions.Item>
              </Descriptions>
            </div>

            {/* ── Journal Lines ── */}
            <div style={{ marginBottom: 6 }}>
              <Text strong style={{ fontSize: 12, color: REDWOOD.neutral600, display: 'block', marginBottom: 6 }}>
                Journal Lines
              </Text>
            </div>
            <Table
              size="small" pagination={false}
              dataSource={acctModal.lines.map((l, i) => ({ ...l, key: i }))}
              scroll={{ x: 900 }}
              columns={[
                { title: 'Type', dataIndex: 'lineType', width: 55,
                  render: v => <Tag color={v === 'DR' ? 'blue' : 'green'} style={{ fontSize: 11, fontWeight: 700 }}>{v}</Tag> },
                { title: 'Class', dataIndex: 'accountingClass', width: 90,
                  render: v => <Text style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{v}</Text> },
                { title: 'Account', dataIndex: 'accountCombination', width: 150,
                  render: (v, r: any) => {
                    const acctSegDesc = r.accountDesc
                      ? r.accountDesc.split(' · ').filter((s: string) => s && s !== 'Default').slice(1).join(' · ')
                      : '';
                    return (
                      <Tooltip title={<><div>{v}</div>{r.accountDesc && <div style={{ fontSize: 10, marginTop: 2 }}>{r.accountDesc}</div>}</>} placement="topLeft">
                        <div style={{ minWidth: 130, cursor: 'default' }}>
                          <Text style={{ fontSize: 11, fontFamily: 'monospace', color: v ? REDWOOD.info : '#bfbfbf', whiteSpace: 'nowrap', display: 'block' }}>{v || '— not set —'}</Text>
                          {acctSegDesc && <div style={{ fontSize: 10, color: '#8c8c8c', marginTop: 2, whiteSpace: 'nowrap' }}>{acctSegDesc}</div>}
                        </div>
                      </Tooltip>
                    );
                  } },
                { title: 'Line Description', dataIndex: 'description', width: 280,
                  render: (_, r: any) => {
                    const desc = draft2?.comments || r.description;
                    return (
                      <Tooltip title={desc} placement="topLeft">
                        <div style={{
                          fontSize: 11, color: REDWOOD.neutral600,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          overflow: 'hidden', wordBreak: 'break-word', cursor: 'default',
                        }}>{desc || '—'}</div>
                      </Tooltip>
                    );
                  } },
                { title: 'Ref 1', width: 100,
                  render: () => {
                    const ref1 = draft2?.receiptNumber;
                    return (
                      <Tooltip title={ref1} placement="topLeft">
                        <div style={{
                          fontSize: 10, fontFamily: 'monospace', color: '#888',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          overflow: 'hidden', wordBreak: 'break-all', cursor: 'default',
                        }}>{ref1}</div>
                      </Tooltip>
                    );
                  } },
                { title: 'Ref 2', width: 100,
                  render: () => <Text style={{ fontSize: 10, fontFamily: 'monospace', color: '#888', whiteSpace: 'nowrap' }}>{draft2?.standardReceiptId}</Text> },
                { title: 'Debit', dataIndex: 'enteredDr', width: 110, align: 'right' as const,
                  render: v => v ? <Text style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: REDWOOD.success, whiteSpace: 'nowrap' }}>{fmt(v)}</Text> : <Text type="secondary">—</Text> },
                { title: 'Credit', dataIndex: 'enteredCr', width: 110, align: 'right' as const,
                  render: v => v ? <Text style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: REDWOOD.primary, whiteSpace: 'nowrap' }}>{fmt(v)}</Text> : <Text type="secondary">—</Text> },
              ]}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={6}>
                    <Text strong style={{ fontSize: 11 }}>Total</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right">
                    <Text strong style={{ fontSize: 12, fontFamily: 'monospace', color: REDWOOD.success }}>{fmt(amount)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right">
                    <Text strong style={{ fontSize: 12, fontFamily: 'monospace', color: REDWOOD.primary }}>{fmt(amount)}</Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
            <div style={{ marginTop: 10, padding: '8px 12px', background: '#f5f5f5', borderRadius: 6, fontSize: 11 }}>
              <Text type="secondary">
                Currency: <strong>{draft2?.currency || 'AED'}</strong>
                {draft2?.conversionRate && draft2.conversionRate !== 1 && <> · Rate: <strong>{draft2.conversionRate}</strong></>}
                {' · '}BU: <strong>{draft2?.businessUnit}</strong>
                {' · '}Reference5: <strong>AR_RECEIPTS</strong>
                {' · '}Line description sourced from: <strong>Comments</strong>
              </Text>
            </div>
          </Modal>
        );
      })()}

      {/* ── Copy Receipt Modal ── */}
      {copyModal && (
        <Modal
          open
          title={<Space><CopyOutlined style={{ color: REDWOOD.info }} /><span>Copy Receipt — {copyModal.draft.receiptNumber}</span></Space>}
          onCancel={() => { if (!copying) setCopyModal(null); }}
          width={680}
          footer={[
            <Button key="cancel" onClick={() => setCopyModal(null)} disabled={copying}>Cancel</Button>,
            <Button key="copy" type="primary" icon={<CopyOutlined />} loading={copying}
              style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
              onClick={handleConfirmCopy}>
              Copy Receipt
            </Button>,
          ]}
        >
          <Alert
            type="info" showIcon style={{ marginBottom: 16 }}
            message="A new receipt will be created with the data below."
            description={<>Receipt Number will be set to <strong>Copy:{copyModal.draft.receiptNumber}</strong>. Accounting Date and Accounting Status will be blank.</>}
          />
          <Descriptions bordered size="small" column={2} labelStyle={{ fontWeight: 600, fontSize: 12 }} contentStyle={{ fontSize: 12 }}>
            <Descriptions.Item label="New Receipt #" span={2}>
              <Text strong style={{ color: REDWOOD.info }}>Copy:{copyModal.draft.receiptNumber}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Receipt Type">{copyModal.draft.receiptType || '—'}</Descriptions.Item>
            <Descriptions.Item label="Business Unit">{copyModal.draft.businessUnit || '—'}</Descriptions.Item>
            <Descriptions.Item label="Receipt Method">{copyModal.draft.receiptMethod || '—'}</Descriptions.Item>
            <Descriptions.Item label="Currency">{copyModal.draft.currency || '—'}</Descriptions.Item>
            <Descriptions.Item label="Receipt Date">{copyModal.draft.receiptDate || '—'}</Descriptions.Item>
            <Descriptions.Item label="Accounting Date"><Text type="secondary">— (blank)</Text></Descriptions.Item>
            <Descriptions.Item label="Amount" span={2}>
              <Text strong style={{ fontFamily: 'monospace', fontSize: 14 }}>
                {copyModal.draft.amount?.toLocaleString('en-AE', { minimumFractionDigits: 2 }) ?? '0.00'}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Customer" span={2}>{copyModal.draft.customerName || copyModal.draft.customerAccountNumber || '—'}</Descriptions.Item>
            <Descriptions.Item label="Customer Site">{copyModal.draft.customerSite || '—'}</Descriptions.Item>
            <Descriptions.Item label="Customer Account #">{copyModal.draft.customerAccountNumber || '—'}</Descriptions.Item>
            <Descriptions.Item label="Remittance Bank" span={2}>{copyModal.draft.remittanceBankName || '—'}</Descriptions.Item>
            <Descriptions.Item label="Bank Account #">{copyModal.draft.remittanceBankAccountNumber || '—'}</Descriptions.Item>
            <Descriptions.Item label="State">{copyModal.draft.state || '—'}</Descriptions.Item>
            <Descriptions.Item label="Comments" span={2}>{copyModal.draft.comments || '—'}</Descriptions.Item>
            <Descriptions.Item label="DR Account">{copyModal.draft.drAccount || '—'}</Descriptions.Item>
            <Descriptions.Item label="CR Account">{copyModal.draft.crAccount || '—'}</Descriptions.Item>
            <Descriptions.Item label="Accounting Status" span={2}><Text type="secondary">— (blank)</Text></Descriptions.Item>
          </Descriptions>
        </Modal>
      )}

    </Layout>
  );
};

export default ManageReceipts;
