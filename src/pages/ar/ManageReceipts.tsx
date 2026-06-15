import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Layout, Card, Form, Select, Input, Button, Space, Typography, Table, Tag,
  Row, Col, Breadcrumb, Tooltip, DatePicker, message, Tabs, Divider,
  Badge, Alert, Modal, InputNumber, Radio, Spin,
} from 'antd';
import {
  HomeOutlined, SearchOutlined, PlusOutlined, CloseOutlined,
  DollarOutlined, SaveOutlined, FilterOutlined, ReloadOutlined,
  DownloadOutlined, UserOutlined, BankOutlined, LockOutlined,
  FileTextOutlined, EyeOutlined, UnorderedListOutlined, InfoCircleOutlined,
  ApiOutlined, DeleteOutlined, ExclamationCircleOutlined, SendOutlined, CodeOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import FloatingMenu from '../../components/FloatingMenu';
import { APEX_DB_CONFIG } from '../../config/api.config';

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
  remittanceBankName:    string;
  customerName:          string;
  customerAccountNumber: string;
  comments:              string;
  syncStatus:            string;
}

interface ReceiptDraft {
  standardReceiptId:              number;
  receiptNumber:                  string;
  documentNumber:                 number | null;
  receiptType:                    string;
  businessUnit:                   string;
  receiptMethod:                  string;
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
}

interface ReceiptTab {
  key:        string;
  draft:      ReceiptDraft;
  syncStatus: string;
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
    businessUnit: '', receiptMethod: '',
    receiptDate: today(), accountingDate: today(), maturityDate: today(),
    amount: null, unappliedAmount: null, accountedAmount: null,
    currency: 'AED', conversionRateType: '', conversionRate: null,
    state: '', status: '', receiptAtRisk: 'N',
    remittanceBankName: '', remittanceBankBranch: '',
    remittanceBankAccountNumber: '', remittanceBankDepositDate: '',
    customerName: '', customerAccountNumber: '', customerSite: '',
    customerBank: '', customerBankBranch: '', customerBankAccountNumber: '',
    receivablesSpecialist: '', comments: '', structuredPaymentReference: '',
    receiptBatchName: '',
  };
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

const LOCKED_SYNC = ['UPDATED', 'NEW'];

// ── Component ─────────────────────────────────────────────────────────────────

const ManageReceipts: React.FC = () => {
  const [searchForm] = Form.useForm();

  const [businessUnits,   setBusinessUnits]   = useState<{ name: string; companyCode: string }[]>([]);
  const [receiptMethods,  setReceiptMethods]  = useState<{ id: number; name: string; receiptClass: string }[]>([]);
  // All receipt method accounts pre-loaded on mount, keyed by receipt_method_id
  const [allMethodAccounts,        setAllMethodAccounts]        = useState<Record<number, ReceiptMethodAccount[]>>({});
  const [allMethodAccountsLoading, setAllMethodAccountsLoading] = useState(false);
  const [searchRows, setSearchRows]           = useState<ReceiptRow[]>([]);
  const [searching, setSearching]         = useState(false);
  const [tabs, setTabs]                   = useState<ReceiptTab[]>([]);
  const [activeKey, setActiveKey]         = useState<string>('search');
  const [saving, setSaving]               = useState<Record<string, boolean>>({});
  const [deleting, setDeleting]           = useState<Record<string, boolean>>({});
  const [fxRateLoading, setFxRateLoading] = useState<Record<string, boolean>>({});
  const [apiModal, setApiModal]           = useState<{ tabKey: string; testResult: string | null; testing: boolean } | null>(null);
  const [gridFilter, setGridFilter]       = useState('');

  // Receipt applications (per tab)
  const [receiptApplications, setReceiptApplications] = useState<
    Record<string, { loading: boolean; rows: AppRow[] }>
  >({});

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
    bankAccountNum:             r.BANK_ACCOUNT_NUM             ?? r.bank_account_num             ?? '',
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

  const openLov = (context: 'search' | string) => {
    setLovContext(context);
    setLovSearch('');
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

  // ── Load business units, receipt methods, and all method accounts ─────────
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

    // Receipt methods
    fetch(`${APEX_RECEIPT_METHODS}?limit=300`, { headers: { Accept: 'application/json' } })
      .then(r => r.json())
      .then(data => {
        setReceiptMethods(
          ((data.items || []) as any[])
            .map((i: any) => ({ id: i.id ?? 0, name: i.name ?? '', receiptClass: i.receiptclass ?? '' }))
            .filter(m => m.name)
        );
      })
      .catch(() => {});

    // Pre-load ALL receipt method bank accounts — used to enrich the dropdown and Remittance Bank tab
    setAllMethodAccountsLoading(true);
    fetch(`${ORDS_RECEIPT_METHOD_ACCOUNTS}?limit=500`, { headers: { Accept: 'application/json' } })
      .then(r => r.json())
      .then(data => {
        const grouped: Record<number, ReceiptMethodAccount[]> = {};
        ((data.items ?? []) as any[]).forEach(r => {
          const acct = mapAccount(r);
          if (!grouped[acct.receiptMethodId]) grouped[acct.receiptMethodId] = [];
          grouped[acct.receiptMethodId].push(acct);
        });
        setAllMethodAccounts(grouped);
      })
      .catch(() => {})
      .finally(() => setAllMethodAccountsLoading(false));
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

      const res  = await fetch(`${APEX_AR_RECEIPTS}?${p}`);
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
        remittanceBankName:    r.remittance_bank_name    ?? '',
        customerName:          r.customer_name           ?? '',
        customerAccountNumber: r.customer_account_number ?? '',
        comments:              r.comments                ?? '',
        syncStatus:            r.sync_status             ?? '',
      }));

      setSearchRows(rows);
      if (rows.length === 0) message.info('No receipts found');
    } catch (e: any) { message.error(`Search failed: ${e.message}`); }
    finally { setSearching(false); }
  };

  // ── Open receipt tab ──────────────────────────────────────────────────────
  const openReceiptTab = useCallback((row: ReceiptRow) => {
    const key = `rcpt-${row.standardReceiptId}`;
    if (tabs.find(t => t.key === key)) { setActiveKey(key); return; }

    const draft: ReceiptDraft = {
      standardReceiptId:           row.standardReceiptId,
      receiptNumber:               row.receiptNumber,
      documentNumber:              row.documentNumber,
      receiptType:                 row.receiptType,
      businessUnit:                row.businessUnit,
      receiptMethod:               row.receiptMethod,
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
    };

    setTabs(prev => [...prev, { key, draft, syncStatus: row.syncStatus }]);
    setActiveKey(key);
  }, [tabs]);

  // ── New receipt tab ───────────────────────────────────────────────────────
  const openNewTab = () => {
    const key = `new-${Date.now()}`;
    setTabs(prev => [...prev, { key, draft: blankDraft(), syncStatus: '' }]);
    setActiveKey(key);
  };

  // ── Close tab ─────────────────────────────────────────────────────────────
  const closeTab = (key: string) => {
    fetchedAppsRef.current.delete(key);
    setReceiptApplications(prev => { const n = { ...prev }; delete n[key]; return n; });
    setTabs(prev => {
      const next = prev.filter(t => t.key !== key);
      if (activeKey === key) setActiveKey(next.length > 0 ? next[next.length - 1].key : 'search');
      return next;
    });
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
  const buildPayload = (draft: ReceiptDraft, receiptId: number | null) => ({
    ...(receiptId != null ? { StandardReceiptId: receiptId } : {}),
    ReceiptNumber:               draft.receiptNumber                || undefined,
    DocumentNumber:              draft.documentNumber               ?? undefined,
    ReceiptType:                 draft.receiptType                  || undefined,
    BusinessUnit:                draft.businessUnit,
    ReceiptMethod:               draft.receiptMethod,
    ReceiptDate:                 draft.receiptDate,
    AccountingDate:              draft.accountingDate               || draft.receiptDate,
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
  });

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
    if (!draft.customerAccountNumber)         missing.push('Customer');

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

      const res    = await fetch(APEX_AR_RECEIPTS, {
        method:  'POST',
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

      message.success(
        isNew
          ? `Receipt created (ID: ${result?.receiptId ?? '—'})`
          : `Receipt saved`
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
    const isNew    = draft.standardReceiptId === 0;
    const isLocked = LOCKED_SYNC.includes((syncStatus || '').toUpperCase()) && !isNew;
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

    const inp = (f: keyof ReceiptDraft, placeholder = '') => (
      <Input size="small" style={{ fontSize: 12 }} value={draft[f] as string}
        placeholder={placeholder} readOnly={isLocked}
        onChange={e => !isLocked && updateDraft(tabKey, { [f]: e.target.value } as any)} />
    );

    const sel = (f: keyof ReceiptDraft, options: string[]) => (
      <Select size="small" style={{ width: '100%', fontSize: 12 }} value={(draft[f] as string) || undefined}
        allowClear disabled={isLocked}
        onChange={v => updateDraft(tabKey, { [f]: v ?? '' } as any)}>
        {options.map(o => <Option key={o} value={o}>{o}</Option>)}
      </Select>
    );

    const dp = (f: keyof ReceiptDraft) => (
      <DatePicker size="small" style={{ width: '100%', fontSize: 12 }}
        value={draft[f] ? dayjs(draft[f] as string) : null}
        format="DD-MMM-YYYY" disabled={isLocked}
        onChange={d => updateDraft(tabKey, { [f]: d ? d.format('YYYY-MM-DD') : '' } as any)} />
    );

    const num = (f: keyof ReceiptDraft) => (
      <InputNumber size="small" style={{ width: '100%', fontSize: 12 }}
        value={draft[f] as number} precision={2} disabled={isLocked}
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
            value={draft.businessUnit || undefined} allowClear disabled={isLocked} showSearch
            filterOption={(input, opt) => String(opt?.children ?? '').toLowerCase().includes(input.toLowerCase())}
            onChange={v => updateDraft(tabKey, { businessUnit: v ?? '' })}>
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
      const display = draft.customerAccountNumber
        ? `${draft.customerName} (${draft.customerAccountNumber})`
        : '';
      return (
        <Input size="small" readOnly
          value={display}
          placeholder="Click to search customer…"
          style={{ cursor: isLocked ? 'default' : 'pointer', fontSize: 12, background: '#fff' }}
          onClick={() => { if (!isLocked) openLov(tabKey); }}
          suffix={
            draft.customerAccountNumber
              ? <CloseOutlined style={{ fontSize: 10, cursor: 'pointer', color: REDWOOD.neutral600 }}
                  onClick={e => { e.stopPropagation(); if (!isLocked) updateDraft(tabKey, { customerName: '', customerAccountNumber: '' }); }} />
              : <SearchOutlined style={{ color: REDWOOD.info, cursor: isLocked ? 'default' : 'pointer' }}
                  onClick={() => { if (!isLocked) openLov(tabKey); }} />
          }
        />
      );
    };

    const currSel = () => (
      <Space.Compact style={{ width: '100%' }}>
        <Select size="small" style={{ flex: 1, fontSize: 12 }}
          value={draft.currency || undefined} allowClear disabled={isLocked}
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
                : draft.standardReceiptId > 0
                  ? <Text type="secondary" style={{ fontSize: 12 }}>Fusion Receipt ID: {draft.standardReceiptId}</Text>
                  : <Badge color="blue" text={<Text style={{ fontSize: 12 }}>Saved Locally</Text>} />
              }
              {syncStatus && <Tag color={syncStatusColor(syncStatus)} style={{ fontSize: 11 }}>{syncStatus}</Tag>}
            </Space>
            <Space size="small">
              {/* API Inspector */}
              <Tooltip title="Inspect POST payload">
                <Button size="small" icon={<CodeOutlined style={{ color: REDWOOD.info }} />}
                  onClick={() => setApiModal({ tabKey, testResult: null, testing: false })} />
              </Tooltip>

              {/* Delete */}
              {!isNew && (
                <Tooltip title="Delete receipt">
                  <Button size="small" danger icon={<DeleteOutlined />} loading={deleting[tabKey]}
                    onClick={() => handleDelete(tabKey)} />
                </Tooltip>
              )}

              {!isLocked && <>
                <Button size="small" type="primary" icon={<SaveOutlined />} loading={isSaving}
                  style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                  onClick={() => handleSave(tabKey)}>Save</Button>
                <Button size="small" icon={<SaveOutlined />} loading={isSaving}
                  onClick={async () => { const ok = await handleSave(tabKey); if (ok) closeTab(tabKey); }}>
                  Save and Close
                </Button>
              </>}
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
                            value={draft.receiptType || undefined} allowClear disabled={isLocked}
                            onChange={v => updateDraft(tabKey, { receiptType: v ?? '' })}>
                            <Option value="CASH"><Tag color="blue" style={{ fontSize: 11 }}>CASH</Tag></Option>
                            <Option value="MISC"><Tag color="purple" style={{ fontSize: 11 }}>MISC</Tag></Option>
                          </Select>
                        , true)}
                        {field('Receipt Method',
                          <div>
                            <Select
                              size="small"
                              style={{ width: '100%', fontSize: 12 }}
                              value={draft.receiptMethod || undefined}
                              allowClear
                              disabled={isLocked}
                              showSearch
                              loading={allMethodAccountsLoading}
                              placeholder="Select method…"
                              filterOption={(input, opt) =>
                                String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
                              }
                              onChange={v => updateDraft(tabKey, { receiptMethod: v ?? '' })}
                              optionLabelProp="label"
                            >
                              {receiptMethods.map(m => {
                                const accts = allMethodAccounts[m.id] ?? [];
                                const primary = accts.find(a => a.primaryFlag === 'Y') ?? accts[0];
                                return (
                                  <Option key={m.id} value={m.name} label={m.name}>
                                    <div style={{ lineHeight: 1.6, padding: '2px 0' }}>
                                      {/* Row 1: name + class */}
                                      <div>
                                        <span style={{ fontWeight: 600, fontSize: 12 }}>{m.name}</span>
                                        {m.receiptClass && (
                                          <Tag color="default" style={{ fontSize: 10, marginLeft: 6, verticalAlign: 'middle' }}>
                                            {m.receiptClass}
                                          </Tag>
                                        )}
                                      </div>
                                      {/* Row 2: bank account (primary) */}
                                      {primary && (
                                        <div style={{ fontSize: 11, color: '#595959', marginTop: 1 }}>
                                          <BankOutlined style={{ marginRight: 4, color: REDWOOD.info }} />
                                          {primary.bankAccountName || primary.bankName || ''}
                                          {primary.bankAccountNum && (
                                            <span style={{ fontFamily: 'monospace', marginLeft: 6, color: REDWOOD.info }}>
                                              {primary.bankAccountNum}
                                            </span>
                                          )}
                                          {primary.bankCurrency && (
                                            <Tag color="blue" style={{ fontSize: 10, marginLeft: 6, verticalAlign: 'middle' }}>
                                              {primary.bankCurrency}
                                            </Tag>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </Option>
                                );
                              })}
                            </Select>
                            {/* Selected: show class + all bank accounts as tags */}
                            {draft.receiptMethod && (() => {
                              const m     = receiptMethods.find(x => x.name === draft.receiptMethod);
                              const accts = allMethodAccounts[m?.id ?? -1] ?? [];
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
                            value={draft.comments} readOnly={isLocked}
                            onChange={e => !isLocked && updateDraft(tabKey, { comments: e.target.value })} />
                        )}
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
                      const acctList   = allMethodAccounts[m?.id ?? -1] ?? [];
                      const isLoading  = allMethodAccountsLoading;
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
                                ].map(({ label, ccid, combo, color, border, textColor }) => (
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
                                      {ccid > 0 && (
                                        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 2 }}>
                                          CCID: {ccid}
                                        </Text>
                                      )}
                                    </div>
                                  </Col>
                                ))}
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
                      value={draft.comments} readOnly={isLocked}
                      placeholder="Enter comments…"
                      onChange={e => !isLocked && updateDraft(tabKey, { comments: e.target.value })} />
                  </div>
                ),
              },
            ]} />
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
    </Layout>
  );
};

export default ManageReceipts;
