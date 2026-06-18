import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Layout, Card, Form, Select, Input, Button, Space, Typography, Table, Tag,
  Row, Col, Breadcrumb, Tooltip, DatePicker, message, Tabs, Divider, InputNumber,
  Checkbox, Badge, Alert, Modal, Dropdown,
} from 'antd';
import {
  HomeOutlined, SearchOutlined, PlusOutlined, CloseOutlined,
  FileTextOutlined, SaveOutlined, EditOutlined, DeleteOutlined,
  UserOutlined, CreditCardOutlined, SettingOutlined, FilePdfOutlined,
  LockOutlined, EyeOutlined, DownloadOutlined, FilterOutlined, ReloadOutlined,
  ApiOutlined, DownOutlined, ProfileOutlined, ApartmentOutlined, AuditOutlined, AccountBookOutlined,
  OrderedListOutlined, SyncOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import FloatingMenu from '../../components/FloatingMenu';
import { APEX_DB_CONFIG } from '../../config/api.config';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

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

const APEX_AR = `${APEX_DB_CONFIG.baseUrl}/ar/invoices`;

// ── Types ────────────────────────────────────────────────────────────────────

interface ARInvoiceLine {
  key:                        string;
  lineNumber:                 number;
  item:                       string;
  description:                string;
  memoLine:                   string;
  uom:                        string;
  quantity:                   number | null;
  unitPrice:                  number | null;
  amount:                     number;
  taxClassification:          string;
  transactionBusinessCategory: string;
}

interface ARInvoiceDraft {
  customerTransactionId:       number;  // 0 = new unsaved
  // General
  transactionClass:            string;
  businessUnit:                string;
  companyCode:                 string;
  transactionSource:           string;
  transactionType:             string;
  transactionNumber:           string;
  crossReference:              string;
  documentNumber:              string;
  transactionDate:             string;
  accountingDate:              string;
  salesperson:                 string;
  invoicingRule:               string;
  currency:                    string;
  conversionDate:              string;
  conversionType:              string;
  conversionRate:              number | null;
  // Customer tab
  billToName:                  string;
  billToAccountNumber:         string;
  billToTaxRegNumber:          string;
  billToSite:                  string;
  billToAddress:               string;
  billToContact:               string;
  shipToName:                  string;
  shipToSite:                  string;
  shipToAddress:               string;
  shipToContact:               string;
  soldToName:                  string;
  payingCustomerName:          string;
  payingCustomerAccount:       string;
  payingCustomerSite:          string;
  // Payment tab
  paymentTerms:                string;
  exemptFromLateCharges:       boolean;
  remitToAddress:              string;
  // Miscellaneous tab
  legalEntity:                 string;
  taxRegistrationNumber:       string;
  taxationCountry:             string;
  documentFiscalClassification: string;
  crossReferenceMisc:          string;
  generateBill:                string;
  specialInstructions:         string;
  comments:                    string;
  structuredPaymentReference:  string;
  poNumber:                    string;
  excludeFromNetting:          boolean;
  // Lines
  lines:                       ARInvoiceLine[];
}

interface ARInvoiceTab {
  key:        string;
  draft:      ARInvoiceDraft;
  syncStatus: string;
}

interface SearchRow {
  key:                   string;
  customerTransactionId: number;
  transactionNumber:     string;
  transactionClass:      string;
  transactionType:       string;
  transactionSource:     string;
  crossReference:        string;
  billToCustomerName:    string;
  billToCustomerNumber:  string;
  transactionDate:       string;
  accountingDate:        string;
  enteredAmount:         number;
  balanceAmount:         number | null;
  invoiceCurrencyCode:   string;
  invoiceStatus:         string;
  businessUnit:          string;
  purchaseOrder:         string;
  syncStatus:            string;
}

interface ReceiptApp {
  key:                        string;
  applicationId:              number;
  applicationDate:            string;
  applicationAmount:          number;
  applicationStatus:          string;
  accountingDate:             string;
  activityName:               string;
  referenceTransactionNumber: string;
  standardReceiptId:          number;
  receiptNumber:              string;
  enteredCurrency:            string;
  processStatus:              string;
  isLatestApplication:        string;
}

interface InvoiceAdj {
  key:                 string;
  adjustmentId:        number;
  adjustmentNumber:    string;
  adjustmentType:      string;
  adjustmentAmount:    number;
  adjustmentDate:      string;
  accountingDate:      string;
  status:              string;
  receivablesActivity: string;
  currency:            string;
  installmentBalance:  number;
  adjustmentReason:    string;
  approvedBy:          string;
  accountCombination:  string;
  syncStatus:          string;
}

interface BalanceRow {
  key:            string;
  category:       string;
  lineAmount:     number;
  taxAmount:      number;
  freightAmount:  number;
  chargeAmount:   number;
  totalAmount:    number;
  sortOrder:      number;
  isTotal:        string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const today = () => dayjs().format('YYYY-MM-DD');

function blankDraft(): ARInvoiceDraft {
  return {
    customerTransactionId: 0,
    transactionClass: 'Invoice', businessUnit: '', companyCode: '', transactionSource: '',
    transactionType: 'Invoice', transactionNumber: '', crossReference: '',
    documentNumber: '', transactionDate: today(), accountingDate: today(),
    salesperson: '', invoicingRule: '', currency: 'AED',
    conversionDate: '', conversionType: '', conversionRate: null,
    billToName: '', billToAccountNumber: '', billToTaxRegNumber: '',
    billToSite: '', billToAddress: '', billToContact: '',
    shipToName: '', shipToSite: '', shipToAddress: '', shipToContact: '',
    soldToName: '', payingCustomerName: '', payingCustomerAccount: '', payingCustomerSite: '',
    paymentTerms: '', exemptFromLateCharges: false, remitToAddress: '',
    legalEntity: '', taxRegistrationNumber: '', taxationCountry: '',
    documentFiscalClassification: '', crossReferenceMisc: '', generateBill: '',
    specialInstructions: '', comments: '', structuredPaymentReference: '',
    poNumber: '', excludeFromNetting: false,
    lines: [blankLine(1)],
  };
}

function blankLine(num: number): ARInvoiceLine {
  return { key: `line-${Date.now()}-${num}`, lineNumber: num, item: '', description: '', memoLine: '', uom: '', quantity: null, unitPrice: null, amount: 0, taxClassification: '', transactionBusinessCategory: '' };
}

function fmt(n: number) {
  return n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusColor(s: string) {
  const m: Record<string, string> = { Complete: 'green', Incomplete: 'orange', 'Void': 'red' };
  return m[s] || 'default';
}

function syncStatusColor(s: string) {
  const m: Record<string, string> = { FUSION: 'blue', UPDATE: 'orange', NEW: 'green', ERROR: 'red' };
  return m[(s || '').toUpperCase()] || 'default';
}

const LOCKED_SYNC = ['UPDATE', 'UPDATED', 'FUSION'];

// ── PDF generation ────────────────────────────────────────────────────────────

function generateInvoicePdf(draft: ARInvoiceDraft): { url: string; fileName: string } {
  const doc  = new jsPDF('portrait', 'mm', 'a4');
  const W    = doc.internal.pageSize.getWidth();
  const pri  = [199, 70, 52]  as [number, number, number]; // #C74634
  const dark = [26,  26, 26]  as [number, number, number]; // #1A1A1A
  const mid  = [107, 107, 107] as [number, number, number]; // #6B6B6B
  const lite = [245, 245, 245] as [number, number, number]; // #F5F5F5

  // ── Header bar ────────────────────────────────────────────────────────────
  doc.setFillColor(...pri);
  doc.rect(0, 0, W, 28, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text('TAX INVOICE', 14, 12);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Transaction #: ${draft.transactionNumber || 'DRAFT'}`, 14, 20);
  doc.text(`Business Unit: ${draft.businessUnit}`, 14, 25);

  if (draft.transactionClass) {
    doc.setFont('helvetica', 'bold');
    doc.text(draft.transactionClass.toUpperCase(), W - 14, 18, { align: 'right' });
  }

  // ── Bill-to + Invoice details (two columns) ───────────────────────────────
  let y = 36;

  // Left – Bill-to
  doc.setFillColor(...lite);
  doc.roundedRect(12, y, 85, 46, 2, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...mid);
  doc.text('BILL TO', 16, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...dark);
  const billLines = [
    draft.billToName,
    draft.billToAccountNumber ? `Account: ${draft.billToAccountNumber}` : '',
    draft.billToSite || '',
    draft.billToAddress || '',
    draft.billToContact ? `Contact: ${draft.billToContact}` : '',
  ].filter(Boolean);
  billLines.forEach((l, i) => doc.text(l, 16, y + 13 + i * 5.5));

  // Right – Invoice details grid
  doc.setFillColor(...lite);
  doc.roundedRect(101, y, 97, 46, 2, 2, 'F');

  const detailRows = [
    ['Transaction Date', draft.transactionDate || ''],
    ['Accounting Date',  draft.accountingDate  || ''],
    ['Currency',         draft.currency        || ''],
    ['Payment Terms',    draft.paymentTerms    || ''],
    ['PO Number',        draft.poNumber        || ''],
    ['Cross Reference',  draft.crossReference  || ''],
  ];
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...mid);
  doc.text('INVOICE DETAILS', 105, y + 6);
  detailRows.forEach(([label, val], i) => {
    const row = y + 13 + i * 5.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...mid);
    doc.text(label, 105, row);
    doc.setTextColor(...dark);
    doc.text(val, 165, row, { align: 'right' });
  });

  y += 52;

  // ── Invoice Lines table ───────────────────────────────────────────────────
  const lineData = draft.lines.map((l, i) => [
    String(i + 1),
    l.description || l.item || '',
    l.memoLine || '',
    l.uom || '',
    l.quantity != null ? String(l.quantity) : '',
    l.unitPrice != null ? fmt(l.unitPrice) : '',
    fmt(l.amount || 0),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['#', 'Description', 'Memo Line', 'UOM', 'Qty', 'Unit Price', 'Amount']],
    body: lineData,
    styles:       { fontSize: 8, cellPadding: 2.5, textColor: dark },
    headStyles:   { fillColor: pri, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [251, 251, 251] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 55 },
      2: { cellWidth: 30 },
      3: { cellWidth: 15, halign: 'center' },
      4: { cellWidth: 15, halign: 'right' },
      5: { cellWidth: 25, halign: 'right' },
      6: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 12, right: 12 },
  });

  // ── Totals ────────────────────────────────────────────────────────────────
  const afterTable = (doc as any).lastAutoTable.finalY + 6;
  const totalLines = draft.lines.reduce((s, l) => s + l.amount, 0);
  const grandTotal = totalLines;

  const totRows = [
    ['Lines Total', fmt(totalLines)],
    ['Tax',         fmt(0)],
    ['Freight',     fmt(0)],
    ['Charges',     fmt(0)],
  ];

  let ty = afterTable;
  totRows.forEach(([label, val]) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...mid);
    doc.text(label, W - 55, ty);
    doc.setTextColor(...dark);
    doc.text(val, W - 12, ty, { align: 'right' });
    ty += 6;
  });

  // Grand total bar
  doc.setFillColor(...pri);
  doc.roundedRect(W - 70, ty, 58, 10, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(255, 255, 255);
  doc.text('TOTAL', W - 67, ty + 6.5);
  doc.text(fmt(grandTotal), W - 14, ty + 6.5, { align: 'right' });

  // ── Comments / Special Instructions ──────────────────────────────────────
  if (draft.comments || draft.specialInstructions) {
    let cy = ty + 18;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...mid);
    doc.text('NOTES', 14, cy);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...dark);
    const notes = [draft.specialInstructions, draft.comments].filter(Boolean).join('  |  ');
    const wrapped = doc.splitTextToSize(notes, W - 28);
    doc.text(wrapped, 14, cy + 5);
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFillColor(...pri);
  doc.rect(0, pageH - 10, W, 10, 'F');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
  doc.text('Generated by ReactERP', 14, pageH - 4);
  doc.text(`${draft.legalEntity || draft.businessUnit}`, W / 2, pageH - 4, { align: 'center' });
  doc.text(dayjs().format('DD-MMM-YYYY HH:mm'), W - 14, pageH - 4, { align: 'right' });

  const fileName = `Invoice_${draft.transactionNumber || 'DRAFT'}_${dayjs().format('YYYYMMDD')}.pdf`;
  const url = URL.createObjectURL(doc.output('blob'));
  return { url, fileName };
}

// ── Component ─────────────────────────────────────────────────────────────────

const ManageReceivables: React.FC = () => {
  const [searchForm] = Form.useForm();

  // Business units
  const [businessUnits, setBusinessUnits] = useState<{ name: string; companyCode: string }[]>([]);

  // Transaction sources, types, memo lines, tax codes
  const [txnSources, setTxnSources] = useState<string[]>([]);
  const [txnTypes, setTxnTypes]   = useState<string[]>([]);
  const [memoLines, setMemoLines] = useState<string[]>([]);
  const [taxCodes, setTaxCodes]   = useState<string[]>([]);
  const [showLookupApi, setShowLookupApi] = useState(false);

  // Search tab state
  const [searchRows, setSearchRows]     = useState<SearchRow[]>([]);
  const [searching, setSearching]       = useState(false);

  // Open invoice tabs
  const [tabs, setTabs]                 = useState<ARInvoiceTab[]>([]);
  const [activeKey, setActiveKey]       = useState<string>('search');

  // Per-tab saving state
  const [saving, setSaving]             = useState<Record<string, boolean>>({});

  // PDF preview state
  const [pdfPreviewVisible, setPdfPreviewVisible] = useState(false);
  const [pdfDataUrl, setPdfDataUrl]               = useState<string | null>(null);
  const [pdfFileName, setPdfFileName]             = useState('');

  // Customer LOV — fetch all once, filter client-side
  interface CustomerOption { custAccountId: number; accountNumber: string; accountName: string; }
  const [lovVisible,    setLovVisible]    = useState(false);
  const [lovSearch,     setLovSearch]     = useState('');
  const [lovAllRows,    setLovAllRows]    = useState<CustomerOption[]>([]);
  const [lovLoading,    setLovLoading]    = useState(false);
  const [lovSelected,   setLovSelected]   = useState<CustomerOption | null>(null);
  const lovFetched = useRef(false);

  const lovRows = lovSearch.trim()
    ? lovAllRows.filter(c => {
        const q = lovSearch.trim().toUpperCase();
        return c.accountName.toUpperCase().includes(q) || c.accountNumber.toUpperCase().includes(q);
      })
    : lovAllRows;

  const fetchAllCustomers = () => {
    if (lovFetched.current) return;
    setLovLoading(true);
    fetch(
      `${APEX_DB_CONFIG.baseUrl}/ar/customers`,
      { headers: { Accept: 'application/json' } }
    )
      .then(r => r.json())
      .then(data => {
        const rows = ((data.items ?? []) as any[]).map((c: any) => ({
          custAccountId: c.cust_account_id ?? c.CUST_ACCOUNT_ID ?? 0,
          accountNumber: c.account_number  ?? c.ACCOUNT_NUMBER  ?? '',
          accountName:   c.account_name    ?? c.ACCOUNT_NAME    ?? '',
        }));
        setLovAllRows(rows);
        lovFetched.current = true;
      })
      .catch(err => { console.error('[AR customers LOV]', err); })
      .finally(() => setLovLoading(false));
  };

  const openLov = () => { setLovSearch(''); setLovVisible(true); };

  const selectLovRow = (c: CustomerOption) => {
    setLovSelected(c);
    searchForm.setFieldValue('billToCustomer', c.accountName);
    setLovVisible(false);
  };

  const clearLov = () => {
    setLovSelected(null);
    searchForm.setFieldValue('billToCustomer', undefined);
  };

  // ── Installments modal ────────────────────────────────────────────────────
  interface InstallmentRow {
    installmentId: number; sequenceNumber: number; status: string;
    dueDate: string; closedDate: string; glClosedDate: string;
    originalAmount: number; balanceDue: number; amountPaid: number;
    accountedBalanceDue: number; daysLate: number | null;
    taxAmountOriginal: number; lineAmountOriginal: number; freightAmountOriginal: number;
  }
  const [instVisible, setInstVisible] = useState(false);
  const [instLoading, setInstLoading] = useState(false);
  const [instRows,    setInstRows]    = useState<InstallmentRow[]>([]);
  const [instTxnId,   setInstTxnId]   = useState<number>(0);

  const openInstallments = (txnId: number) => {
    setInstTxnId(txnId);
    setInstRows([]);
    setInstVisible(true);
    setInstLoading(true);
    fetch(`${APEX_DB_CONFIG.baseUrl}/ar/invoices/${txnId}/installments`, { headers: { Accept: 'application/json' } })
      .then(r => r.json())
      .then(d => setInstRows(((d.items ?? []) as any[]).map((x: any) => ({
        installmentId:        x.installment_id          ?? x.INSTALLMENT_ID          ?? 0,
        sequenceNumber:       x.installment_sequence_number ?? x.INSTALLMENT_SEQUENCE_NUMBER ?? 0,
        status:               x.installment_status      ?? x.INSTALLMENT_STATUS      ?? '',
        dueDate:              x.installment_due_date    ?? x.INSTALLMENT_DUE_DATE    ?? '',
        closedDate:           x.installment_closed_date ?? x.INSTALLMENT_CLOSED_DATE ?? '',
        glClosedDate:         x.installment_gl_closed_date ?? x.INSTALLMENT_GL_CLOSED_DATE ?? '',
        originalAmount:       x.original_amount         ?? x.ORIGINAL_AMOUNT         ?? 0,
        balanceDue:           x.installment_balance_due ?? x.INSTALLMENT_BALANCE_DUE ?? 0,
        amountPaid:           x.amount_paid             ?? x.AMOUNT_PAID             ?? 0,
        accountedBalanceDue:  x.accounted_balance_due   ?? x.ACCOUNTED_BALANCE_DUE   ?? 0,
        daysLate:             x.payment_days_late       ?? x.PAYMENT_DAYS_LATE       ?? null,
        taxAmountOriginal:    x.installment_tax_amount_original     ?? x.INSTALLMENT_TAX_AMOUNT_ORIGINAL     ?? 0,
        lineAmountOriginal:   x.installment_line_amount_original    ?? x.INSTALLMENT_LINE_AMOUNT_ORIGINAL    ?? 0,
        freightAmountOriginal:x.installment_freight_amount_original ?? x.INSTALLMENT_FREIGHT_AMOUNT_ORIGINAL ?? 0,
      }))))
      .catch(err => { console.error('[AR installments]', err); setInstRows([]); })
      .finally(() => setInstLoading(false));
  };

  // ── Distributions modal ───────────────────────────────────────────────────
  interface DistributionRow {
    distributionId: number; lineNumber: number | null; taxLineNumber: number | null;
    accountClass: string; accountCombination: string;
    amount: number; accountedAmount: number; percent: number; comments: string;
  }
  const [distVisible, setDistVisible] = useState(false);
  const [distLoading, setDistLoading] = useState(false);
  const [distRows,    setDistRows]    = useState<DistributionRow[]>([]);
  const [distTxnId,   setDistTxnId]   = useState<number>(0);

  const openDistributions = (txnId: number) => {
    setDistTxnId(txnId);
    setDistRows([]);
    setDistVisible(true);
    setDistLoading(true);
    fetch(`${APEX_DB_CONFIG.baseUrl}/ar/invoices/${txnId}/distributions`, { headers: { Accept: 'application/json' } })
      .then(r => r.json())
      .then(d => setDistRows(((d.items ?? []) as any[]).map((x: any) => ({
        distributionId:    x.distribution_id         ?? x.DISTRIBUTION_ID         ?? 0,
        lineNumber:        x.invoice_line_number      ?? x.INVOICE_LINE_NUMBER      ?? null,
        taxLineNumber:     x.detailed_tax_line_number ?? x.DETAILED_TAX_LINE_NUMBER ?? null,
        accountClass:      x.account_class            ?? x.ACCOUNT_CLASS            ?? '',
        accountCombination:x.account_combination      ?? x.ACCOUNT_COMBINATION      ?? '',
        amount:            x.amount                   ?? x.AMOUNT                   ?? 0,
        accountedAmount:   x.accounted_amount         ?? x.ACCOUNTED_AMOUNT         ?? 0,
        percent:           x.percent                  ?? x.PERCENT                  ?? 0,
        comments:          x.comments                 ?? x.COMMENTS                 ?? '',
      }))))
      .catch(err => { console.error('[AR distributions]', err); setDistRows([]); })
      .finally(() => setDistLoading(false));
  };

  // ── Per-tab KPI summary (installments + distributions) ───────────────────
  interface TabKpi {
    instCount: number; instTotalOriginal: number; instTotalBalDue: number; instTotalPaid: number;
    distCount: number; distTotalAmount: number;
  }
  const [tabKpis, setTabKpis] = useState<Record<number, TabKpi>>({});

  const fetchTabKpis = (txnId: number) => {
    if (!txnId || tabKpis[txnId]) return; // already loaded
    Promise.all([
      fetch(`${APEX_DB_CONFIG.baseUrl}/ar/invoices/${txnId}/installments`, { headers: { Accept: 'application/json' } }).then(r => r.json()).catch(() => ({ items: [] })),
      fetch(`${APEX_DB_CONFIG.baseUrl}/ar/invoices/${txnId}/distributions`, { headers: { Accept: 'application/json' } }).then(r => r.json()).catch(() => ({ items: [] })),
    ]).then(([instData, distData]) => {
      const insts = (instData.items ?? []) as any[];
      const dists = (distData.items ?? []) as any[];
      setTabKpis(prev => ({
        ...prev,
        [txnId]: {
          instCount:         insts.length,
          instTotalOriginal: insts.reduce((s: number, x: any) => s + (x.original_amount ?? x.ORIGINAL_AMOUNT ?? 0), 0),
          instTotalBalDue:   insts.reduce((s: number, x: any) => s + (x.installment_balance_due ?? x.INSTALLMENT_BALANCE_DUE ?? 0), 0),
          instTotalPaid:     insts.reduce((s: number, x: any) => s + (x.amount_paid ?? x.AMOUNT_PAID ?? 0), 0),
          distCount:         dists.length,
          distTotalAmount:   dists.reduce((s: number, x: any) => s + (x.amount ?? x.AMOUNT ?? 0), 0),
        },
      }));
    });
  };

  // ── Receipt applications per invoice tab ─────────────────────────────────
  const [receiptAppsMap, setReceiptAppsMap] = useState<Record<string, {
    loading: boolean; rows: ReceiptApp[]; url: string; fetched: boolean;
  }>>({});
  const fetchedReceiptTabsRef = useRef<Set<string>>(new Set());
  const [showRcptApiUrl, setShowRcptApiUrl] = useState<Record<string, boolean>>({});

  // ── Adjustments per invoice tab ──────────────────────────────────────────
  const [adjMap, setAdjMap] = useState<Record<string, {
    loading: boolean; rows: InvoiceAdj[]; url: string; fetched: boolean;
  }>>({});
  const fetchedAdjTabsRef = useRef<Set<string>>(new Set());
  const [showAdjApiUrl, setShowAdjApiUrl] = useState<Record<string, boolean>>({});

  const fetchAdjustments = useCallback(async (tabKey: string, transactionNumber: string) => {
    if (!transactionNumber || fetchedAdjTabsRef.current.has(tabKey)) return;
    fetchedAdjTabsRef.current.add(tabKey);
    const url = `${APEX_DB_CONFIG.baseUrl}/ar/adjustments?transaction_number=${encodeURIComponent(transactionNumber)}&limit=200`;
    setAdjMap(prev => ({ ...prev, [tabKey]: { loading: true, rows: [], url, fetched: false } }));
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows: InvoiceAdj[] = (data.items || []).map((item: any, i: number) => ({
        key:                 String(item.adjustment_id ?? i),
        adjustmentId:        item.adjustment_id        ?? 0,
        adjustmentNumber:    item.adjustment_number    ?? '',
        adjustmentType:      item.adjustment_type      ?? '',
        adjustmentAmount:    item.adjustment_amount    ?? 0,
        adjustmentDate:     (item.adjustment_date      ?? '').slice(0, 10),
        accountingDate:     (item.accounting_date      ?? '').slice(0, 10),
        status:              item.status               ?? '',
        receivablesActivity: item.receivables_activity ?? '',
        currency:            item.currency             ?? '',
        installmentBalance:  item.installment_balance  ?? 0,
        adjustmentReason:    item.adjustment_reason    ?? '',
        approvedBy:          item.approved_by          ?? '',
        accountCombination:  item.account_combination  ?? '',
        syncStatus:          item.sync_status          ?? '',
      }));
      setAdjMap(prev => ({ ...prev, [tabKey]: { loading: false, rows, url, fetched: true } }));
    } catch {
      setAdjMap(prev => ({ ...prev, [tabKey]: { ...prev[tabKey], loading: false, fetched: true } }));
    }
  }, []);

  // ── Balance Details per invoice tab ─────────────────────────────────────
  const [balanceMap, setBalanceMap] = useState<Record<string, {
    loading: boolean; rows: BalanceRow[]; balance: number; url: string; fetched: boolean;
  }>>({});
  const fetchedBalanceTabsRef = useRef<Set<string>>(new Set());
  const [showBalApiUrl, setShowBalApiUrl] = useState<Record<string, boolean>>({});

  const fetchBalance = useCallback(async (tabKey: string, customerTransactionId: number, transactionNumber: string) => {
    if (!customerTransactionId || fetchedBalanceTabsRef.current.has(tabKey)) return;
    fetchedBalanceTabsRef.current.add(tabKey);
    const url = `${APEX_DB_CONFIG.baseUrl}/ar/invoice-balances?customer_transaction_id=${customerTransactionId}&transaction_number=${encodeURIComponent(transactionNumber || '')}`;
    setBalanceMap(prev => ({ ...prev, [tabKey]: { loading: true, rows: [], balance: 0, url, fetched: false } }));
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows: BalanceRow[] = (data.items || []).map((item: any) => ({
        key:           String(item.sort_order ?? Math.random()),
        category:      item.category       ?? '',
        lineAmount:    item.line_amount     ?? 0,
        taxAmount:     item.tax_amount      ?? 0,
        freightAmount: item.freight_amount  ?? 0,
        chargeAmount:  item.charge_amount   ?? 0,
        totalAmount:   item.total_amount    ?? 0,
        sortOrder:     item.sort_order      ?? 0,
        isTotal:       item.is_total        ?? 'N',
      }));
      setBalanceMap(prev => ({ ...prev, [tabKey]: { loading: false, rows, balance: data.balance ?? 0, url, fetched: true } }));
    } catch {
      setBalanceMap(prev => ({ ...prev, [tabKey]: { ...prev[tabKey], loading: false, fetched: true } }));
    }
  }, []);

  const [balanceModalTabKey, setBalanceModalTabKey] = useState<string | null>(null);

  const fetchReceiptApps = useCallback(async (tabKey: string, transactionNumber: string) => {
    if (!transactionNumber || fetchedReceiptTabsRef.current.has(tabKey)) return;
    fetchedReceiptTabsRef.current.add(tabKey);
    const url = `${APEX_DB_CONFIG.baseUrl}/ar/receipt-applications?reference_txn_number=${encodeURIComponent(transactionNumber)}&limit=500`;
    setReceiptAppsMap(prev => ({ ...prev, [tabKey]: { loading: true, rows: [], url, fetched: false } }));
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows: ReceiptApp[] = (data.items || []).map((item: any, i: number) => ({
        key:                        String(item.application_id ?? item.ApplicationId ?? i),
        applicationId:              item.application_id              ?? item.ApplicationId              ?? 0,
        applicationDate:           (item.application_date           ?? item.ApplicationDate            ?? '').slice(0, 10),
        applicationAmount:          item.application_amount          ?? item.ApplicationAmount          ?? 0,
        applicationStatus:          item.application_status          ?? item.ApplicationStatus          ?? '',
        accountingDate:            (item.accounting_date             ?? item.AccountingDate             ?? '').slice(0, 10),
        activityName:               item.activity_name               ?? item.ActivityName               ?? '',
        referenceTransactionNumber: item.reference_txn_number        ?? item.ReferenceTransactionNumber ?? '',
        standardReceiptId:          item.standard_receipt_id         ?? item.StandardReceiptId          ?? 0,
        receiptNumber:              item.receipt_number              ?? item.ReceiptNumber              ?? '',
        enteredCurrency:            item.entered_currency            ?? item.EnteredCurrency            ?? '',
        processStatus:              item.process_status              ?? item.ProcessStatus              ?? '',
        isLatestApplication:        item.is_latest_application       ?? item.IsLatestApplication        ?? '',
      }));
      setReceiptAppsMap(prev => ({ ...prev, [tabKey]: { loading: false, rows, url, fetched: true } }));
    } catch {
      setReceiptAppsMap(prev => ({ ...prev, [tabKey]: { ...prev[tabKey], loading: false, fetched: true } }));
    }
  }, []);

  // ── DFF (Additional Info) per invoice tab ────────────────────────────────
  interface DffData {
    flexContext: string; flexContextDisplay: string;
    unit: string; location: string; propertyType: string;
    nameOfTenant: string; nationality: string; occupantStatus: string;
    noOfOccupant: number | null; ejari: string;
    contractStartDate: string; contractEndDate: string;
    rent: number | null; modeOfPay: string; noOfCheques: number | null;
    pmgtFee: number | null; chqsWith: string;
    attribute1: string; attribute2: string; attribute3: string; attribute4: string; attribute5: string;
  }
  const [dffMap, setDffMap] = useState<Record<string, { loading: boolean; data: DffData | null; fetched: boolean }>>({});
  const fetchedDffTabsRef = useRef<Set<string>>(new Set());

  const fetchDff = useCallback(async (tabKey: string, customerTransactionId: number) => {
    if (!customerTransactionId || fetchedDffTabsRef.current.has(tabKey)) return;
    fetchedDffTabsRef.current.add(tabKey);
    setDffMap(prev => ({ ...prev, [tabKey]: { loading: true, data: null, fetched: false } }));
    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/ar/invoices/${customerTransactionId}/dff`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      const item = (d.items ?? [])[0] ?? null;
      const data: DffData | null = item ? {
        flexContext:        item.flex_context         ?? '',
        flexContextDisplay: item.flex_context_display ?? '',
        unit:               item.unit                 ?? '',
        location:           item.location             ?? '',
        propertyType:       item.property_type        ?? '',
        nameOfTenant:       item.name_of_tenant       ?? '',
        nationality:        item.nationality           ?? '',
        occupantStatus:     item.occupant_status       ?? '',
        noOfOccupant:       item.no_of_occupant        ?? null,
        ejari:              item.ejari                 ?? '',
        contractStartDate:  item.contract_start_date   ? String(item.contract_start_date).substring(0, 10) : '',
        contractEndDate:    item.contract_end_date     ? String(item.contract_end_date).substring(0, 10)   : '',
        rent:               item.rent                  ?? null,
        modeOfPay:          item.mode_of_pay           ?? '',
        noOfCheques:        item.no_of_cheques         ?? null,
        pmgtFee:            item.pmgt_fee              ?? null,
        chqsWith:           item.chqs_with             ?? '',
        attribute1:         item.attribute1            ?? '',
        attribute2:         item.attribute2            ?? '',
        attribute3:         item.attribute3            ?? '',
        attribute4:         item.attribute4            ?? '',
        attribute5:         item.attribute5            ?? '',
      } : null;
      setDffMap(prev => ({ ...prev, [tabKey]: { loading: false, data, fetched: true } }));
    } catch {
      setDffMap(prev => ({ ...prev, [tabKey]: { loading: false, data: null, fetched: true } }));
    }
  }, []);

  // ── Installments per invoice tab ─────────────────────────────────────────
  interface InstTabRow {
    key: string; sequenceNumber: number; status: string;
    dueDate: string; closedDate: string;
    originalAmount: number; balanceDue: number; amountPaid: number;
    taxAmountOriginal: number; lineAmountOriginal: number; freightAmountOriginal: number;
    daysLate: number | null;
  }
  const [instTabMap, setInstTabMap] = useState<Record<string, { loading: boolean; rows: InstTabRow[]; fetched: boolean }>>({});
  const fetchedInstTabsRef = useRef<Set<string>>(new Set());

  const fetchInstTab = useCallback(async (tabKey: string, customerTransactionId: number) => {
    if (!customerTransactionId || fetchedInstTabsRef.current.has(tabKey)) return;
    fetchedInstTabsRef.current.add(tabKey);
    setInstTabMap(prev => ({ ...prev, [tabKey]: { loading: true, rows: [], fetched: false } }));
    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/ar/invoices/${customerTransactionId}/installments`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      const rows: InstTabRow[] = (d.items ?? []).map((x: any, i: number) => ({
        key:                  String(x.installment_id ?? i),
        sequenceNumber:       x.installment_sequence_number ?? x.INSTALLMENT_SEQUENCE_NUMBER ?? 0,
        status:               x.installment_status          ?? x.INSTALLMENT_STATUS          ?? '',
        dueDate:              x.installment_due_date        ?? x.INSTALLMENT_DUE_DATE        ?? '',
        closedDate:           x.installment_closed_date     ?? x.INSTALLMENT_CLOSED_DATE     ?? '',
        originalAmount:       x.original_amount             ?? x.ORIGINAL_AMOUNT             ?? 0,
        balanceDue:           x.installment_balance_due     ?? x.INSTALLMENT_BALANCE_DUE     ?? 0,
        amountPaid:           x.amount_paid                 ?? x.AMOUNT_PAID                 ?? 0,
        taxAmountOriginal:    x.installment_tax_amount_original     ?? x.INSTALLMENT_TAX_AMOUNT_ORIGINAL     ?? 0,
        lineAmountOriginal:   x.installment_line_amount_original    ?? x.INSTALLMENT_LINE_AMOUNT_ORIGINAL    ?? 0,
        freightAmountOriginal:x.installment_freight_amount_original ?? x.INSTALLMENT_FREIGHT_AMOUNT_ORIGINAL ?? 0,
        daysLate:             x.payment_days_late           ?? x.PAYMENT_DAYS_LATE           ?? null,
      }));
      setInstTabMap(prev => ({ ...prev, [tabKey]: { loading: false, rows, fetched: true } }));
    } catch {
      setInstTabMap(prev => ({ ...prev, [tabKey]: { loading: false, rows: [], fetched: true } }));
    }
  }, []);

  // Auto-fetch receipts, adjustments and balance when an invoice tab becomes active
  useEffect(() => {
    if (!activeKey || activeKey === 'search') return;
    const tab = tabs.find(t => t.key === activeKey);
    if (!tab || tab.draft.customerTransactionId === 0) return;
    fetchReceiptApps(activeKey, tab.draft.transactionNumber);
    fetchAdjustments(activeKey, tab.draft.transactionNumber);
    fetchBalance(activeKey, tab.draft.customerTransactionId, tab.draft.transactionNumber);
    fetchDff(activeKey, tab.draft.customerTransactionId);
    fetchInstTab(activeKey, tab.draft.customerTransactionId);
  }, [activeKey, tabs, fetchReceiptApps, fetchAdjustments, fetchBalance, fetchDff, fetchInstTab]);

  // Grid-level quick filter for search results
  const [gridFilter, setGridFilter] = useState('');

  // ── Load business units on mount ───────────────────────────────────────────
  useEffect(() => {
    fetch(`${APEX_DB_CONFIG.baseUrl}/gl/businessunits`, { headers: { Accept: 'application/json' } })
      .then(r => r.json())
      .then(data => {
        const units = ((data.items || []) as any[])
          .map((i: any) => ({ name: i.business_unit_name || i.businessUnitName || '', companyCode: i.company_code || i.companyCode || '' }))
          .filter(u => u.name)
          .sort((a, b) => a.name.localeCompare(b.name));
        setBusinessUnits(units);
      })
      .catch(() => {});
    fetch(`${APEX_DB_CONFIG.baseUrl}/ar/transaction-sources`, { headers: { Accept: 'application/json' } })
      .then(r => r.json())
      .then(data => {
        const sources = ((data.items || []) as any[])
          .map((i: any) => i.name ?? i.source_name ?? i.TRANSACTION_SOURCE_NAME ?? '')
          .filter(Boolean);
        setTxnSources(sources);
      })
      .catch(() => {});
    fetch(`${APEX_DB_CONFIG.baseUrl}/ar/transaction-types`, { headers: { Accept: 'application/json' } })
      .then(r => r.json())
      .then(data => {
        const types = ((data.items || []) as any[])
          .map((i: any) => i.name ?? i.transaction_type_name ?? i.TRANSACTION_TYPE_NAME ?? '')
          .filter(Boolean);
        setTxnTypes(types);
      })
      .catch(() => {});
    fetch(`${APEX_DB_CONFIG.baseUrl}/ar/memo-lines`, { headers: { Accept: 'application/json' } })
      .then(r => r.json())
      .then(data => {
        const lines = ((data.items || []) as any[])
          .map((i: any) => i.memo_line_name ?? i.MEMO_LINE_NAME ?? i.name ?? '')
          .filter(Boolean);
        setMemoLines(lines);
      })
      .catch(() => {});
    fetch(`${APEX_DB_CONFIG.baseUrl}/ar/tax-rates`, { headers: { Accept: 'application/json' } })
      .then(r => r.json())
      .then(data => {
        const codes = ((data.items || []) as any[])
          .map((i: any) => i.tax_rate_code ?? i.TAX_RATE_CODE ?? i.name ?? '')
          .filter(Boolean);
        setTaxCodes(codes);
      })
      .catch(() => {});
  }, []);

  // ── Open a fetched invoice in a new tab ────────────────────────────────────
  const openInvoiceTab = useCallback(async (row: SearchRow) => {
    const key = `inv-${row.customerTransactionId}`;
    if (tabs.find(t => t.key === key)) { setActiveKey(key); return; }

    // Fetch lines
    let lines: ARInvoiceLine[] = [];
    try {
      const r = await fetch(`${APEX_AR}/${row.customerTransactionId}/lines`);
      const d = await r.json();
      lines = (d.items || []).map((l: any, i: number) => ({
        key:  String(l.customer_transaction_line_id ?? i),
        lineNumber:   l.line_number ?? i + 1,
        item: l.inventory_item ?? '',
        description:  l.description ?? '',
        memoLine: l.memo_line ?? '',
        uom:  l.unit_of_measure ?? '',
        quantity: l.quantity ?? null,
        unitPrice: l.unit_selling_price ?? null,
        amount: l.line_amount ?? 0,
        taxClassification: l.tax_classification_code ?? '',
        transactionBusinessCategory: l.transaction_business_category ?? '',
      }));
    } catch { /* use empty */ }

    const draft: ARInvoiceDraft = {
      customerTransactionId: row.customerTransactionId,
      transactionClass:   row.transactionClass   || 'Invoice',
      businessUnit:       row.businessUnit       || '',
      companyCode:        '',
      transactionSource:  row.transactionSource  || '',
      transactionType:    row.transactionType    || '',
      transactionNumber:  row.transactionNumber  || '',
      crossReference:     '',
      documentNumber:     '',
      transactionDate:    row.transactionDate    || today(),
      accountingDate:     row.accountingDate     || today(),
      salesperson: '', invoicingRule: '',
      currency:           row.invoiceCurrencyCode || 'AED',
      conversionDate: '', conversionType: '', conversionRate: null,
      billToName:         row.billToCustomerName  || '',
      billToAccountNumber: row.billToCustomerNumber || '',
      billToTaxRegNumber: '', billToSite: '', billToAddress: '', billToContact: '',
      shipToName: '', shipToSite: '', shipToAddress: '', shipToContact: '',
      soldToName: '', payingCustomerName: '', payingCustomerAccount: '', payingCustomerSite: '',
      paymentTerms: '', exemptFromLateCharges: false, remitToAddress: '',
      legalEntity: '', taxRegistrationNumber: '', taxationCountry: '',
      documentFiscalClassification: '', crossReferenceMisc: '', generateBill: '',
      specialInstructions: '', comments: '', structuredPaymentReference: '',
      poNumber: '', excludeFromNetting: false,
      lines: lines.length > 0 ? lines : [blankLine(1)],
    };

    setTabs(prev => [...prev, { key, draft, syncStatus: row.syncStatus }]);
    setActiveKey(key);
    fetchTabKpis(row.customerTransactionId);
  }, [tabs]);

  // ── Open a blank new invoice tab ───────────────────────────────────────────
  const openNewTab = () => {
    const key = `new-${Date.now()}`;
    setTabs(prev => [...prev, { key, draft: blankDraft(), syncStatus: '' }]);
    setActiveKey(key);
  };

  // ── Close a tab ────────────────────────────────────────────────────────────
  const closeTab = (key: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.key !== key);
      if (activeKey === key) setActiveKey(next.length > 0 ? next[next.length - 1].key : 'search');
      return next;
    });
    fetchedReceiptTabsRef.current.delete(key);
    fetchedAdjTabsRef.current.delete(key);
    fetchedBalanceTabsRef.current.delete(key);
    setReceiptAppsMap(prev => { const n = { ...prev }; delete n[key]; return n; });
    setAdjMap(prev => { const n = { ...prev }; delete n[key]; return n; });
    setBalanceMap(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  // ── Update a draft field ───────────────────────────────────────────────────
  const updateDraft = (key: string, patch: Partial<ARInvoiceDraft>) => {
    setTabs(prev => prev.map(t => t.key === key ? { ...t, draft: { ...t.draft, ...patch } } : t));
  };

  const updateLine = (tabKey: string, lineKey: string, patch: Partial<ARInvoiceLine>) => {
    setTabs(prev => prev.map(t => {
      if (t.key !== tabKey) return t;
      const lines = t.draft.lines.map(l => {
        if (l.key !== lineKey) return l;
        const updated = { ...l, ...patch };
        updated.amount = ((updated.quantity ?? 0) * (updated.unitPrice ?? 0));
        return updated;
      });
      return { ...t, draft: { ...t.draft, lines } };
    }));
  };

  const addLine = (tabKey: string) => {
    setTabs(prev => prev.map(t => {
      if (t.key !== tabKey) return t;
      const num = t.draft.lines.length + 1;
      return { ...t, draft: { ...t.draft, lines: [...t.draft.lines, blankLine(num)] } };
    }));
  };

  const removeLine = (tabKey: string, lineKey: string) => {
    setTabs(prev => prev.map(t => {
      if (t.key !== tabKey) return t;
      const lines = t.draft.lines.filter(l => l.key !== lineKey);
      return { ...t, draft: { ...t.draft, lines: lines.length > 0 ? lines : [blankLine(1)] } };
    }));
  };

  // ── Search ─────────────────────────────────────────────────────────────────
  const handleSearch = async () => {
    const v = searchForm.getFieldsValue();
    setSearching(true);
    try {
      const p = new URLSearchParams();
      if (v.businessUnit)      p.set('business_unit',     v.businessUnit);
      if (v.transactionNumber) p.set('transaction_number', v.transactionNumber);
      if (v.billToCustomer)    p.set('bill_to_customer',   v.billToCustomer);
      if (v.transactionClass)  p.set('transaction_class',  v.transactionClass);
      if (v.invoiceStatus)     p.set('invoice_status',     v.invoiceStatus);
      if (v.dateRange?.[0])    p.set('date_from', v.dateRange[0].format('YYYY-MM-DD'));
      if (v.dateRange?.[1])    p.set('date_to',   v.dateRange[1].format('YYYY-MM-DD'));
      p.set('limit', '200');
      const res  = await fetch(`${APEX_AR}?${p}`);
      const data = await res.json();
      const rows: SearchRow[] = (data.items || []).map((r: any, i: number) => ({
        key:                   String(r.customer_transaction_id ?? i),
        customerTransactionId: r.customer_transaction_id ?? 0,
        transactionNumber:     r.transaction_number       ?? '',
        transactionClass:      r.transaction_class        ?? '',
        transactionType:       r.transaction_type         ?? '',
        transactionSource:     r.transaction_source       ?? '',
        crossReference:        r.cross_reference          ?? r.cross_ref ?? '',
        billToCustomerName:    r.bill_to_customer_name    ?? r.bill_to_customer ?? '',
        billToCustomerNumber:  r.bill_to_customer_number  ?? '',
        transactionDate:       (r.transaction_date  || '').slice(0, 10),
        accountingDate:        (r.accounting_date   || '').slice(0, 10),
        enteredAmount:         r.entered_amount           ?? r.invoice_amount ?? 0,
        balanceAmount:         r.computed_balance         ?? null,
        invoiceCurrencyCode:   r.invoice_currency_code    ?? 'AED',
        invoiceStatus:         r.invoice_status           ?? '',
        businessUnit:          r.business_unit            ?? '',
        purchaseOrder:         r.purchase_order           ?? r.po_number ?? '',
        syncStatus:            r.sync_status              ?? '',
      }));
      setSearchRows(rows);
      if (rows.length === 0) message.info('No invoices found');
    } catch (e: any) { message.error(`Search failed: ${e.message}`); }
    finally { setSearching(false); }
  };

  // ── Save (create or update) ────────────────────────────────────────────────
  const handleSave = async (tabKey: string): Promise<boolean> => {
    const tab = tabs.find(t => t.key === tabKey);
    if (!tab) return false;
    const { draft } = tab;
    if (!draft.billToAccountNumber && !draft.billToName) {
      message.error('Bill-to Customer is required'); return false;
    }
    if (!draft.businessUnit)    { message.error('Business Unit is required');     return false; }
    if (!draft.transactionDate) { message.error('Transaction Date is required');  return false; }
    if (!draft.currency)        { message.error('Currency is required');           return false; }

    setSaving(prev => ({ ...prev, [tabKey]: true }));
    try {
      const isNew = draft.customerTransactionId === 0;
      const validLines = draft.lines.filter(l => l.description || l.quantity != null || l.unitPrice != null);

      const body = {
        // PK — only sent for PUT
        ...(isNew ? {} : { CustomerTransactionId: draft.customerTransactionId }),
        // Header fields — PascalCase matches JSON_VALUE keys in PL/SQL
        TransactionClass:    draft.transactionClass,
        BusinessUnit:        draft.businessUnit,
        TransactionSource:   draft.transactionSource,
        TransactionType:     draft.transactionType,
        TransactionNumber:   draft.transactionNumber || undefined,
        CrossReference:      draft.crossReference    || undefined,
        TransactionDate:     draft.transactionDate,
        AccountingDate:      draft.accountingDate,
        InvoiceCurrencyCode: draft.currency,
        ConversionType:      draft.conversionType    || undefined,
        ConversionDate:      draft.conversionDate    || undefined,
        ConversionRate:      draft.conversionRate    ?? undefined,
        BillToCustomerName:    draft.billToName,
        BillToCustomerNumber:  draft.billToAccountNumber,
        BillToSite:            draft.billToSite      || undefined,
        BillToContact:         draft.billToContact   || undefined,
        ShipToCustomerName:    draft.shipToName      || undefined,
        ShipToSite:            draft.shipToSite      || undefined,
        ShipToContact:         draft.shipToContact   || undefined,
        PayingCustomerName:    draft.payingCustomerName    || undefined,
        PayingCustomerSite:    draft.payingCustomerSite    || undefined,
        PayingCustomerAccount: draft.payingCustomerAccount || undefined,
        PaymentTerms:          draft.paymentTerms    || undefined,
        LegalEntityIdentifier: draft.legalEntity     || undefined,
        PurchaseOrder:         draft.poNumber        || undefined,
        SpecialInstructions:   draft.specialInstructions || undefined,
        Comments:              draft.comments        || undefined,
        InvoicingRule:         draft.invoicingRule   || undefined,
        RemitToAddress:        draft.remitToAddress  || undefined,
        lines: validLines.map(l => ({
          LineNumber:            l.lineNumber,
          Description:           l.description,
          ItemNumber:            l.item           || undefined,
          UnitOfMeasure:         l.uom            || undefined,
          MemoLine:              l.memoLine       || undefined,
          Quantity:              l.quantity       ?? undefined,
          UnitSellingPrice:      l.unitPrice      ?? undefined,
          LineAmount:            l.amount         || undefined,
          TaxClassificationCode: l.taxClassification || undefined,
          TransactionBusinessCategory: l.transactionBusinessCategory || undefined,
        })),
      };

      const url = isNew ? APEX_AR : `${APEX_AR}/${draft.customerTransactionId}`;
      const res  = await fetch(url, {
        method:  isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const result = await res.json().catch(() => ({} as any));

      if (result?.status === 'ERROR' || !res.ok) {
        message.error(result?.message || `Save failed: HTTP ${res.status}`);
        return false;
      }

      if (isNew) {
        const newId  = result.customerTransactionId as number;
        const newNum = result.transactionNumber     as string;
        message.success(`Invoice created — ID: ${newId}, Txn #: ${newNum || ''}`);
        updateDraft(tabKey, {
          customerTransactionId: newId,
          transactionNumber:     newNum || draft.transactionNumber,
        } as any);
      } else {
        message.success('Invoice saved');
      }
      return true;
    } catch (e: any) { message.error(`Save error: ${e.message}`); return false; }
    finally { setSaving(prev => ({ ...prev, [tabKey]: false })); }
  };

  // ── Search columns ─────────────────────────────────────────────────────────
  const searchColumns: ColumnsType<SearchRow> = [
    { title: '#', key: 'seq', width: 42, fixed: 'left', render: (_,__,i) => <Text type="secondary" style={{ fontSize: 12 }}>{i+1}</Text> },
    { title: 'Transaction #', dataIndex: 'transactionNumber', width: 160, fixed: 'left',
      render: (v, r) => <Button type="link" style={{ padding: 0, fontSize: 12, fontWeight: 600 }} onClick={() => openInvoiceTab(r)}>{v || '—'}</Button> },
    { title: 'Customer', dataIndex: 'billToCustomerName', width: 220, ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Cust #', dataIndex: 'billToCustomerNumber', width: 130, ellipsis: true, render: v => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{v || '—'}</Text> },
    { title: 'Source', dataIndex: 'transactionSource', width: 110, ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Cross Ref', dataIndex: 'crossReference', width: 130, ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'PO #', dataIndex: 'purchaseOrder', width: 120, ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Class', dataIndex: 'transactionClass', width: 90, render: v => <Tag style={{ fontSize: 11 }}>{v}</Tag> },
    { title: 'Txn Date', dataIndex: 'transactionDate', width: 105, render: v => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'CCY', dataIndex: 'invoiceCurrencyCode', width: 60, render: v => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Amount', dataIndex: 'enteredAmount', width: 120, align: 'right',
      render: v => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{fmt(v || 0)}</Text> },
    { title: 'Balance', dataIndex: 'balanceAmount', width: 120, align: 'right',
      render: (v: number | null) => v === null
        ? <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
        : <Text style={{ fontSize: 12, fontFamily: 'monospace', color: v > 0 ? '#cf1322' : '#389e0d', fontWeight: 600 }}>{fmt(v)}</Text> },
    { title: 'Status', dataIndex: 'invoiceStatus', width: 100,
      render: v => <Tag color={statusColor(v)} style={{ fontSize: 11 }}>{v || '—'}</Tag> },
    { title: 'Sync', dataIndex: 'syncStatus', width: 90,
      render: v => v ? <Tag color={syncStatusColor(v)} style={{ fontSize: 11 }}>{v}</Tag> : <Text type="secondary" style={{ fontSize: 11 }}>—</Text> },
    { title: 'Business Unit', dataIndex: 'businessUnit', width: 160, ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: '', key: 'open', width: 50, fixed: 'right', render: (_,r) =>
        <Tooltip title="Open invoice"><Button size="small" icon={<FileTextOutlined />} onClick={() => openInvoiceTab(r)} /></Tooltip> },
  ];

  // ── Export search results to Excel ────────────────────────────────────────
  const exportToExcel = (rows: SearchRow[]) => {
    const headers = [
      'Transaction #', 'Customer', 'Customer #', 'Source',
      'Cross Reference', 'PO #', 'Class', 'Type',
      'Txn Date', 'Accounting Date', 'Currency', 'Amount', 'Balance',
      'Status', 'Sync Status', 'Business Unit',
    ];

    // Data rows — Amount/Balance stay as numbers so Excel can format/sum them
    const dataRows = rows.map(r => [
      r.transactionNumber,
      r.billToCustomerName,
      r.billToCustomerNumber,
      r.transactionSource,
      r.crossReference,
      r.purchaseOrder,
      r.transactionClass,
      r.transactionType,
      r.transactionDate,
      r.accountingDate,
      r.invoiceCurrencyCode,
      r.enteredAmount ?? 0,
      r.balanceAmount ?? '',
      r.invoiceStatus,
      r.syncStatus,
      r.businessUnit,
    ]);

    // Totals row
    const total = rows.reduce((s, r) => s + (r.enteredAmount ?? 0), 0);
    const totalBalance = rows.reduce((s, r) => s + (r.balanceAmount ?? 0), 0);
    const totalsRow = [
      `Total (${rows.length} rows)`, '', '', '', '', '', '', '',
      '', '', '', total, totalBalance, '', '', '',
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows, totalsRow]);

    // Column widths (characters)
    ws['!cols'] = [
      { wch: 18 }, // Transaction #
      { wch: 36 }, // Customer
      { wch: 16 }, // Customer #
      { wch: 18 }, // Source
      { wch: 18 }, // Cross Reference
      { wch: 16 }, // PO #
      { wch: 12 }, // Class
      { wch: 14 }, // Type
      { wch: 14 }, // Txn Date
      { wch: 16 }, // Accounting Date
      { wch: 10 }, // Currency
      { wch: 16 }, // Amount
      { wch: 16 }, // Balance
      { wch: 14 }, // Status
      { wch: 12 }, // Sync Status
      { wch: 26 }, // Business Unit
    ];

    // Freeze the header row
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    // Apply number format to Amount (col L) and Balance (col M)
    for (const colLetter of ['L', 'M']) {
      for (let row = 2; row <= rows.length + 2; row++) {
        const cell = ws[`${colLetter}${row}`];
        if (cell && typeof cell.v === 'number') {
          cell.t = 'n';
          cell.z = '#,##0.00';
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'AR Transactions');
    XLSX.writeFile(wb, `AR_Transactions_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`);
  };

  // ── Invoice form panel ─────────────────────────────────────────────────────
  const renderInvoicePanel = (tab: ARInvoiceTab) => {
    const { key: tabKey, draft, syncStatus } = tab;
    const isNew    = draft.customerTransactionId === 0;
    const isLocked = LOCKED_SYNC.includes((syncStatus || '').toUpperCase());
    const isSaving = saving[tabKey] || false;

    const totalLines   = draft.lines.reduce((s, l) => s + l.amount, 0);
    const totalTax     = 0;
    const totalFreight = 0;
    const totalCharges = 0;
    const grandTotal   = totalLines + totalTax + totalFreight + totalCharges;

    const field = (label: string, node: React.ReactNode, required = false) => (
      <Row gutter={4} align="middle" style={{ marginBottom: 5 }}>
        <Col span={8} style={{ textAlign: 'right', paddingRight: 6 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {required && <span style={{ color: REDWOOD.primary, marginRight: 2 }}>*</span>}{label}
          </Text>
        </Col>
        <Col span={16}>{node}</Col>
      </Row>
    );

    const inp = (f: keyof ARInvoiceDraft, placeholder = '') => (
      <Input size="small" style={{ fontSize: 12 }} value={draft[f] as string}
        placeholder={placeholder} readOnly={isLocked}
        onChange={e => !isLocked && updateDraft(tabKey, { [f]: e.target.value } as any)} />
    );

    const sel = (f: keyof ARInvoiceDraft, options: string[], placeholder = '') => (
      <Select size="small" style={{ width: '100%', fontSize: 12 }} value={draft[f] as string || undefined}
        placeholder={placeholder} allowClear disabled={isLocked}
        onChange={v => updateDraft(tabKey, { [f]: v ?? '' } as any)}>
        {options.map(o => <Option key={o} value={o}>{o}</Option>)}
      </Select>
    );

    const dp = (f: keyof ARInvoiceDraft) => (
      <DatePicker size="small" style={{ width: '100%', fontSize: 12 }}
        value={draft[f] ? dayjs(draft[f] as string) : null}
        format="DD-MMM-YYYY" disabled={isLocked}
        onChange={d => updateDraft(tabKey, { [f]: d ? d.format('YYYY-MM-DD') : '' } as any)} />
    );

    // Invoice Lines columns
    const lineColumns: ColumnsType<ARInvoiceLine> = [
      { title: 'Line', dataIndex: 'lineNumber', width: 50, render: v => <Text style={{ fontSize: 12 }}>{v}</Text> },
      { title: 'Item', dataIndex: 'item', width: 130,
        render: (v, r) => <Input size="small" style={{ fontSize: 12 }} value={v} readOnly={isLocked}
          onChange={e => !isLocked && updateLine(tabKey, r.key, { item: e.target.value })} /> },
      { title: <span><span style={{ color: REDWOOD.primary }}>*</span> Description</span>, dataIndex: 'description', width: 180,
        render: (v, r) => <Input size="small" style={{ fontSize: 12 }} value={v} readOnly={isLocked}
          onChange={e => !isLocked && updateLine(tabKey, r.key, { description: e.target.value })} /> },
      { title: 'Memo Line', dataIndex: 'memoLine', width: 150,
        render: (v, r) => (
          <Select size="small" style={{ width: '100%', fontSize: 12 }} value={v || undefined}
            placeholder="Select…" showSearch allowClear disabled={isLocked}
            onChange={val => !isLocked && updateLine(tabKey, r.key, { memoLine: val ?? '' })}
            options={memoLines.map(m => ({ value: m, label: m }))} />
        ) },
      { title: 'UOM', dataIndex: 'uom', width: 80,
        render: (v, r) => <Input size="small" style={{ fontSize: 12 }} value={v} readOnly={isLocked}
          onChange={e => !isLocked && updateLine(tabKey, r.key, { uom: e.target.value })} /> },
      { title: <span><span style={{ color: REDWOOD.primary }}>*</span> Quantity</span>, dataIndex: 'quantity', width: 90,
        render: (v, r) => <InputNumber size="small" style={{ width: '100%', fontSize: 12 }} value={v}
          disabled={isLocked} onChange={val => !isLocked && updateLine(tabKey, r.key, { quantity: val })} /> },
      { title: <span><span style={{ color: REDWOOD.primary }}>*</span> Unit Price</span>, dataIndex: 'unitPrice', width: 110,
        render: (v, r) => <InputNumber size="small" style={{ width: '100%', fontSize: 12 }} value={v}
          precision={2} disabled={isLocked} onChange={val => !isLocked && updateLine(tabKey, r.key, { unitPrice: val })} /> },
      { title: 'Amount', dataIndex: 'amount', width: 110, align: 'right',
        render: v => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{fmt(v || 0)}</Text> },
      { title: 'Tax Classification', dataIndex: 'taxClassification', width: 150,
        render: (v, r) => (
          <Select size="small" style={{ width: '100%', fontSize: 12 }} value={v || undefined}
            placeholder="Select…" showSearch allowClear disabled={isLocked}
            onChange={val => !isLocked && updateLine(tabKey, r.key, { taxClassification: val ?? '' })}
            options={taxCodes.map(t => ({ value: t, label: t }))} />
        ) },
      { title: 'Txn Business Category', dataIndex: 'transactionBusinessCategory', width: 160,
        render: (v, r) => <Input size="small" style={{ fontSize: 12 }} value={v} readOnly={isLocked}
          onChange={e => !isLocked && updateLine(tabKey, r.key, { transactionBusinessCategory: e.target.value })} /> },
      ...(!isLocked ? [{ title: '', key: 'del', width: 40,
        render: (_: any, r: ARInvoiceLine) => <Button size="small" danger icon={<DeleteOutlined />}
          onClick={() => removeLine(tabKey, r.key)} /> }] : []),
    ];

    return (
      <div style={{ background: REDWOOD.neutral100, minHeight: '100%' }}>
        {/* ── Toolbar ──────────────────────────────────────────────────── */}
        <div style={{ background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.border}`, padding: '8px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space align="center">
              {isNew ? (
                <Badge color="purple" text={<Text style={{ fontSize: 12 }}>New — Not Saved</Text>} />
              ) : (
                <Space align="center" size={8}>
                  <Text strong style={{ fontSize: 18, color: REDWOOD.primary, letterSpacing: 0.3 }}>
                    {draft.transactionNumber || `Txn #${draft.customerTransactionId}`}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>ID: {draft.customerTransactionId}</Text>
                </Space>
              )}
              {isLocked && (
                <Tag icon={<LockOutlined />} color="warning" style={{ fontSize: 11 }}>Read Only</Tag>
              )}
              {syncStatus && <Tag color={syncStatusColor(syncStatus)} style={{ fontSize: 11 }}>{syncStatus}</Tag>}
              {/* Balance badge — clickable to open details modal */}
              {!isNew && (() => {
                const bs = balanceMap[tabKey];
                const bal = bs?.balance ?? 0;
                return (
                  <Tooltip title="Click to view Balance Details">
                    <Tag
                      icon={<AccountBookOutlined />}
                      color={bs?.loading ? 'default' : bal > 0 ? 'red' : 'green'}
                      style={{ cursor: 'pointer', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, padding: '2px 10px' }}
                      onClick={() => setBalanceModalTabKey(tabKey)}
                    >
                      {bs?.loading ? ' …' : ` ${bal.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`}
                    </Tag>
                  </Tooltip>
                );
              })()}
            </Space>
            <Space size="small">
              {/* Actions dropdown — only for saved invoices */}
              {!isNew && (
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'installments',
                        icon: <ProfileOutlined />,
                        label: 'Review Installments',
                        onClick: () => openInstallments(draft.customerTransactionId),
                      },
                      {
                        key: 'distributions',
                        icon: <ApartmentOutlined />,
                        label: 'Review Distributions',
                        onClick: () => openDistributions(draft.customerTransactionId),
                      },
                    ],
                  }}
                  trigger={['click']}
                >
                  <Button size="small">
                    Actions <DownOutlined style={{ fontSize: 10 }} />
                  </Button>
                </Dropdown>
              )}
              <Button size="small" icon={<FilePdfOutlined />}
                style={{ borderColor: REDWOOD.primary, color: REDWOOD.primary }}
                onClick={() => {
                  const { url, fileName } = generateInvoicePdf(draft);
                  if (pdfDataUrl) URL.revokeObjectURL(pdfDataUrl);
                  setPdfDataUrl(url);
                  setPdfFileName(fileName);
                  setPdfPreviewVisible(true);
                }}>
                PDF
              </Button>
              {!isLocked && <>
                <Button size="small" type="primary" icon={<SaveOutlined />} loading={isSaving}
                  style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                  onClick={() => handleSave(tabKey)}>
                  Save
                </Button>
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
          {/* ── General Information ───────────────────────────────────── */}
          <Card size="small" style={{ marginBottom: 10, borderRadius: 8 }}
            title={<Text strong style={{ fontSize: 13 }}>General Information</Text>}>
            <Row gutter={24}>
              {/* Left column */}
              <Col span={8}>
                {/* API debug panel */}
                <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Tooltip title="Show lookup API endpoints">
                    <Button size="small" icon={<ApiOutlined />}
                      type={showLookupApi ? 'primary' : 'default'}
                      onClick={() => setShowLookupApi(v => !v)} />
                  </Tooltip>
                  {showLookupApi && (
                    <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 4, padding: '4px 8px', flex: 1 }}>
                      {([
                        ['BU',     'gl/businessunits',       businessUnits.length],
                        ['Source', 'ar/transaction-sources', txnSources.length],
                        ['Type',   'ar/transaction-types',   txnTypes.length],
                        ['Memo',   'ar/memo-lines',          memoLines.length],
                        ['Tax',    'ar/tax-rates',           taxCodes.length],
                        ['Cust',   'ar/customers',           lovAllRows.length],
                      ] as [string, string, number][]).map(([lbl, ep, cnt]) => (
                        <div key={ep} style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontFamily: 'monospace', fontSize: 10, color: cnt > 0 ? '#3fb950' : '#f85149', minWidth: 44 }}>{lbl}</span>
                          <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#58a6ff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{APEX_DB_CONFIG.baseUrl}/{ep}</span>
                          <span style={{ fontFamily: 'monospace', fontSize: 10, color: cnt > 0 ? '#3fb950' : '#f85149' }}>{cnt > 0 ? `✓ ${cnt}` : '✗ 0'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {field('Transaction Class', sel('transactionClass', ['Invoice', 'Credit Memo', 'Debit Memo', 'Chargeback']))}
                {field('Business Unit',
                  <Select size="small" style={{ width: '100%', fontSize: 12 }} value={draft.businessUnit || undefined}
                    placeholder="" allowClear disabled={isLocked} showSearch
                    filterOption={(input, opt) => String(opt?.value ?? '').toLowerCase().includes(input.toLowerCase())}
                    onChange={v => {
                      const bu = businessUnits.find(u => u.name === v);
                      updateDraft(tabKey, { businessUnit: v ?? '', companyCode: bu?.companyCode ?? '' } as any);
                    }}>
                    {businessUnits.map(bu => <Option key={bu.name} value={bu.name}>{bu.name}</Option>)}
                  </Select>, true)}
                {field('Company Code', <Input size="small" style={{ fontSize: 12 }} value={draft.companyCode} readOnly />)}
                {field('Transaction Source', (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <div style={{ flex: 1 }}>{sel('transactionSource', txnSources)}</div>
                    <Tooltip title={`${APEX_DB_CONFIG.baseUrl}/ar/transaction-sources  →  ${txnSources.length} records`}>
                      <Button size="small" icon={<ApiOutlined />}
                        style={{ color: txnSources.length > 0 ? '#52c41a' : '#ff4d4f', borderColor: txnSources.length > 0 ? '#52c41a' : '#ff4d4f', flexShrink: 0 }} />
                    </Tooltip>
                  </div>
                ))}
                {field('Transaction Type', (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <div style={{ flex: 1 }}>{sel('transactionType', txnTypes)}</div>
                    <Tooltip title={`${APEX_DB_CONFIG.baseUrl}/ar/transaction-types  →  ${txnTypes.length} records`}>
                      <Button size="small" icon={<ApiOutlined />}
                        style={{ color: txnTypes.length > 0 ? '#52c41a' : '#ff4d4f', borderColor: txnTypes.length > 0 ? '#52c41a' : '#ff4d4f', flexShrink: 0 }} />
                    </Tooltip>
                  </div>
                ), true)}
                {field('Transaction Number', inp('transactionNumber', 'Auto-generated if blank'))}
                {field('Cross Reference',   inp('crossReference'))}
                {field('Document Number',   <Input size="small" style={{ fontSize: 12 }} value={draft.documentNumber} readOnly />)}
              </Col>
              {/* Middle column */}
              <Col span={8}>
                {field('Transaction Date',  dp('transactionDate'), true)}
                {field('Accounting Date',   dp('accountingDate'),  true)}
                {field('Salesperson',       inp('salesperson'))}
                {field('Invoicing Rule',    sel('invoicingRule', ['Bill in Advance', 'Bill in Arrears']))}
                {field('Currency',          sel('currency', ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR']), true)}
                {field('Conversion Date',
                  <DatePicker size="small" style={{ width: '100%', fontSize: 12 }}
                    value={draft.conversionDate ? dayjs(draft.conversionDate) : null}
                    format="DD-MMM-YYYY" disabled={isLocked}
                    onChange={d => updateDraft(tabKey, { conversionDate: d ? d.format('YYYY-MM-DD') : '' })} />)}
                {field('Conversion Type',
                  <Select size="small" style={{ width: '100%', fontSize: 12 }} value={draft.conversionType || undefined}
                    allowClear disabled={isLocked}
                    onChange={v => updateDraft(tabKey, { conversionType: v ?? '' })}>
                    {['Corporate', 'Spot', 'User'].map(o => <Option key={o} value={o}>{o}</Option>)}
                  </Select>)}
                {field('Conversion Rate',
                  <InputNumber size="small" style={{ width: '100%', fontSize: 12 }} value={draft.conversionRate} readOnly />)}
              </Col>
              {/* Right: totals */}
              <Col span={8}>
                <Card size="small" style={{ background: REDWOOD.neutral100, borderRadius: 6 }}>
                  {[
                    ['Transaction Total', fmt(grandTotal), true],
                    ['Lines',             fmt(totalLines), false],
                    ['Tax',               fmt(totalTax),   false],
                    ['Freight',           fmt(totalFreight), false],
                    ['Charges',           fmt(totalCharges), false],
                  ].map(([label, val, bold]) => (
                    <div key={label as string} style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12, minWidth: 120 }}>{label as string}</Text>
                      <Text style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: bold ? 700 : 400, marginLeft: 8 }}>{val as string}</Text>
                    </div>
                  ))}
                </Card>
              </Col>
            </Row>
          </Card>

          {/* ── Sub-tabs: Customer | Payment | Miscellaneous | Receipts ─ */}
          <Card size="small" style={{ marginBottom: 10, borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
            <Tabs size="small" style={{ padding: '0 12px' }}
              onChange={(key) => {
                if (key === 'customer')                fetchAllCustomers();
                if (key === 'receipts'    && !isNew) fetchReceiptApps(tabKey, draft.transactionNumber);
                if (key === 'adjustments' && !isNew) fetchAdjustments(tabKey, draft.transactionNumber);
                if (key === 'balance'     && !isNew) fetchBalance(tabKey, draft.customerTransactionId, draft.transactionNumber);
                if (key === 'dff'         && !isNew) fetchDff(tabKey, draft.customerTransactionId);
                if (key === 'installments'&& !isNew) fetchInstTab(tabKey, draft.customerTransactionId);
              }}
              items={[
                // ── Customer ─────────────────────────────────────────────
                {
                  key: 'customer',
                  label: <span><UserOutlined style={{ marginRight: 4 }} />Customer</span>,
                  children: (
                    <div style={{ padding: '8px 4px 12px' }}>
                      <Row gutter={32}>
                        <Col span={8}>
                          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Bill-to</Text>
                          {field('Customer', (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <Select
                                size="small" style={{ width: '100%', fontSize: 12 }}
                                showSearch allowClear disabled={isLocked}
                                placeholder="Search customer…"
                                value={draft.billToAccountNumber || undefined}
                                filterOption={(input, opt) => {
                                  const label = String(opt?.label ?? '');
                                  return label.toLowerCase().includes(input.toLowerCase());
                                }}
                                onChange={(val) => {
                                  const c = lovAllRows.find(r => r.accountNumber === val);
                                  if (c) updateDraft(tabKey, { billToName: c.accountName, billToAccountNumber: c.accountNumber });
                                  else updateDraft(tabKey, { billToAccountNumber: val ?? '' });
                                }}
                                options={lovAllRows.map(c => ({
                                  value: c.accountNumber,
                                  label: `${c.accountName}${c.accountNumber ? ` (${c.accountNumber})` : ''}`,
                                }))}
                              />
                              <Tooltip title={`${APEX_DB_CONFIG.baseUrl}/ar/customers  →  ${lovAllRows.length} records`}>
                                <Button size="small" icon={<ApiOutlined />}
                                  style={{ color: lovAllRows.length > 0 ? '#52c41a' : '#ff4d4f', borderColor: lovAllRows.length > 0 ? '#52c41a' : '#ff4d4f', flexShrink: 0 }} />
                              </Tooltip>
                            </div>
                          ), true)}
                          {field('Name',           inp('billToName'), true)}
                          {field('Account Number', inp('billToAccountNumber'), true)}
                          {field('Third-Party Tax Reg #', inp('billToTaxRegNumber'))}
                          {field('Site',           inp('billToSite'))}
                          {field('Address',        inp('billToAddress'))}
                          {field('Contact',        inp('billToContact'))}
                        </Col>
                        <Col span={8}>
                          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Ship-to</Text>
                          {field('Name',    inp('shipToName'))}
                          {field('Site',    inp('shipToSite'))}
                          {field('Address', inp('shipToAddress'))}
                          {field('Contact', inp('shipToContact'))}
                        </Col>
                        <Col span={8}>
                          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Sold-to</Text>
                          {field('Name', inp('soldToName'))}
                          <Divider style={{ margin: '12px 0 8px' }} />
                          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Paying Customer</Text>
                          {field('Name',           inp('payingCustomerName'))}
                          {field('Account Number', inp('payingCustomerAccount'))}
                          {field('Site',           inp('payingCustomerSite'))}
                        </Col>
                      </Row>
                    </div>
                  ),
                },
                // ── Payment ──────────────────────────────────────────────
                {
                  key: 'payment',
                  label: <span><CreditCardOutlined style={{ marginRight: 4 }} />Payment</span>,
                  children: (
                    <div style={{ padding: '8px 4px 12px' }}>
                      <Row gutter={32}>
                        <Col span={8}>
                          {field('Payment Terms', sel('paymentTerms', ['Immediate', 'Net 30', 'Net 45', 'Net 60', 'Net 90', '2/10 Net 30']), true)}
                          {field('Due Date', <Input size="small" style={{ fontSize: 12 }} readOnly placeholder="Auto-calculated" />)}
                        </Col>
                        <Col span={8}>
                          {field('Exempt from Late Charges',
                            <Checkbox checked={draft.exemptFromLateCharges}
                              onChange={e => updateDraft(tabKey, { exemptFromLateCharges: e.target.checked })} />)}
                        </Col>
                        <Col span={8}>
                          {field('Remit-to Address', sel('remitToAddress', ['Primary Bank Account', 'Secondary Bank Account']), true)}
                        </Col>
                      </Row>
                    </div>
                  ),
                },
                // ── Miscellaneous ─────────────────────────────────────────
                {
                  key: 'misc',
                  label: <span><SettingOutlined style={{ marginRight: 4 }} />Miscellaneous</span>,
                  children: (
                    <div style={{ padding: '8px 4px 12px' }}>
                      <Row gutter={32}>
                        <Col span={8}>
                          {field('Legal Entity',                   inp('legalEntity'), true)}
                          {field('Tax Registration Number',        inp('taxRegistrationNumber'))}
                          {field('Taxation Country',               inp('taxationCountry'))}
                          {field('Document Fiscal Classification', inp('documentFiscalClassification'))}
                          {field('Default Tax Exemption Handling', <Text style={{ fontSize: 12 }}>Standard</Text>)}
                          {field('Cross Reference',                inp('crossReferenceMisc'))}
                        </Col>
                        <Col span={8}>
                          {field('Generate Bill',              sel('generateBill', ['Yes', 'No']))}
                          {field('Special Instructions',
                            <Input.TextArea size="small" style={{ fontSize: 12 }} rows={2}
                              value={draft.specialInstructions}
                              onChange={e => updateDraft(tabKey, { specialInstructions: e.target.value })} />)}
                          {field('Comments',
                            <Input.TextArea size="small" style={{ fontSize: 12 }} rows={2}
                              value={draft.comments}
                              onChange={e => updateDraft(tabKey, { comments: e.target.value })} />)}
                          {field('Structured Payment Reference',
                            <Input.TextArea size="small" style={{ fontSize: 12 }} rows={2}
                              value={draft.structuredPaymentReference}
                              onChange={e => updateDraft(tabKey, { structuredPaymentReference: e.target.value })} />)}
                          {field('PO Number', inp('poNumber'))}
                        </Col>
                        <Col span={8}>
                          {field('Exclude From Netting',
                            <Checkbox checked={draft.excludeFromNetting}
                              onChange={e => updateDraft(tabKey, { excludeFromNetting: e.target.checked })} />)}
                        </Col>
                      </Row>
                    </div>
                  ),
                },
                // ── Receipts ──────────────────────────────────────────────
                {
                  key: 'receipts',
                  label: (
                    <span>
                      <CreditCardOutlined style={{ marginRight: 4 }} />
                      Receipts
                      {(receiptAppsMap[tabKey]?.rows.length ?? 0) > 0 && (
                        <span style={{
                          marginLeft: 5, background: REDWOOD.info, color: '#fff',
                          borderRadius: 10, fontSize: 10, padding: '1px 6px', fontWeight: 600,
                        }}>{receiptAppsMap[tabKey]!.rows.length}</span>
                      )}
                    </span>
                  ),
                  children: (() => {
                    const rcptState = receiptAppsMap[tabKey];
                    const rcptUrl = `${APEX_DB_CONFIG.baseUrl}/ar/receipt-applications?reference_txn_number=${encodeURIComponent(draft.transactionNumber || '')}&limit=500`;
                    const appColumns: ColumnsType<ReceiptApp> = [
                      { title: '#', key: 'seq', width: 45, render: (_,__,i) => <Text type="secondary" style={{ fontSize: 11 }}>{i+1}</Text> },
                      { title: 'Receipt Number', dataIndex: 'receiptNumber', width: 160, render: v => <Text strong style={{ fontSize: 12 }}>{v || '—'}</Text> },
                      { title: 'Application Date', dataIndex: 'applicationDate', width: 125, render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
                      { title: 'Amount', dataIndex: 'applicationAmount', width: 130, align: 'right',
                        render: v => <Text style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}>{fmt(v || 0)}</Text> },
                      { title: 'CCY', dataIndex: 'enteredCurrency', width: 70, render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
                      { title: 'Status', dataIndex: 'applicationStatus', width: 100,
                        render: v => { const vUp = (v||'').toUpperCase(); return <Tag color={vUp === 'APP' || vUp === 'APPLIED' ? 'green' : vUp === 'UNAPP' || vUp === 'UNAPPLIED' ? 'orange' : 'default'} style={{ fontSize: 11 }}>{v || '—'}</Tag>; } },
                      { title: 'Accounting Date', dataIndex: 'accountingDate', width: 125, render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
                      { title: 'Activity', dataIndex: 'activityName', ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
                      { title: 'Process Status', dataIndex: 'processStatus', width: 120,
                        render: v => <Tag style={{ fontSize: 11 }}>{v || '—'}</Tag> },
                      { title: 'Latest', dataIndex: 'isLatestApplication', width: 65, align: 'center',
                        render: v => v === 'Y' ? <Tag color="green" style={{ fontSize: 11 }}>Y</Tag> : <Text type="secondary" style={{ fontSize: 11 }}>{v || '—'}</Text> },
                    ];
                    return (
                      <div style={{ padding: '8px 4px 12px' }}>
                        {/* API icon + refresh */}
                        <Space style={{ marginBottom: 8 }}>
                          <Tooltip title="Show API URL">
                            <Button size="small" icon={<ApiOutlined />}
                              type={showRcptApiUrl[tabKey] ? 'primary' : 'default'}
                              onClick={() => setShowRcptApiUrl(p => ({ ...p, [tabKey]: !p[tabKey] }))}
                            />
                          </Tooltip>
                          <Tooltip title="Refresh">
                            <Button size="small" icon={<ReloadOutlined />}
                              onClick={() => {
                                fetchedReceiptTabsRef.current.delete(tabKey);
                                fetchReceiptApps(tabKey, draft.transactionNumber);
                              }}
                            />
                          </Tooltip>
                        </Space>
                        {showRcptApiUrl[tabKey] && (
                          <div
                            title="Click to copy URL"
                            onClick={() => navigator.clipboard?.writeText(rcptUrl).catch(() => {})}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              background: '#0d1117', border: '1px solid #30363d',
                              borderRadius: 4, padding: '4px 10px', marginBottom: 8,
                              cursor: 'copy',
                            }}
                          >
                            <ApiOutlined style={{ color: '#58a6ff', fontSize: 13, flexShrink: 0 }} />
                            <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#58a6ff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {rcptUrl}
                            </span>
                          </div>
                        )}
                        {isNew ? (
                          <Alert type="info" showIcon message="Save the invoice first to view receipt applications." />
                        ) : (
                          <Table<ReceiptApp>
                            dataSource={rcptState?.rows ?? []}
                            rowKey="key"
                            size="small"
                            loading={rcptState?.loading ?? false}
                            pagination={{ pageSize: 20, size: 'small', showTotal: t => `${t} application${t !== 1 ? 's' : ''}` }}
                            scroll={{ x: 1100 }}
                            columns={appColumns}
                            summary={rows => {
                              const total = rows.reduce((s, r) => s + (r.applicationAmount || 0), 0);
                              return rows.length > 0 ? (
                                <Table.Summary.Row>
                                  <Table.Summary.Cell index={0} colSpan={3}><Text strong style={{ fontSize: 12 }}>Total</Text></Table.Summary.Cell>
                                  <Table.Summary.Cell index={3} align="right"><Text strong style={{ fontSize: 12, fontFamily: 'monospace' }}>{fmt(total)}</Text></Table.Summary.Cell>
                                  <Table.Summary.Cell index={4} colSpan={6} />
                                </Table.Summary.Row>
                              ) : null;
                            }}
                          />
                        )}
                      </div>
                    );
                  })(),
                },
                // ── Adjustments ───────────────────────────────────────────
                {
                  key: 'adjustments',
                  label: (
                    <span>
                      <AuditOutlined style={{ marginRight: 4 }} />
                      Adjustments
                      {(adjMap[tabKey]?.rows.length ?? 0) > 0 && (
                        <span style={{
                          marginLeft: 5, background: REDWOOD.primary, color: '#fff',
                          borderRadius: 10, fontSize: 10, padding: '1px 6px', fontWeight: 600,
                        }}>{adjMap[tabKey]!.rows.length}</span>
                      )}
                    </span>
                  ),
                  children: (() => {
                    const adjState = adjMap[tabKey];
                    const adjUrl = `${APEX_DB_CONFIG.baseUrl}/ar/adjustments?transaction_number=${encodeURIComponent(draft.transactionNumber || '')}&limit=200`;
                    const adjColumns: ColumnsType<InvoiceAdj> = [
                      { title: '#', key: 'seq', width: 45, render: (_,__,i) => <Text type="secondary" style={{ fontSize: 11 }}>{i+1}</Text> },
                      { title: 'Adj #', dataIndex: 'adjustmentNumber', width: 100, render: v => <Text strong style={{ fontSize: 12 }}>{v || '—'}</Text> },
                      { title: 'Type', dataIndex: 'adjustmentType', width: 160, ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
                      { title: 'Adj Date', dataIndex: 'adjustmentDate', width: 100, render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
                      { title: 'Status', dataIndex: 'status', width: 170,
                        render: v => {
                          const color = v === 'Approved' ? 'green' : v === 'Rejected' ? 'red' : 'orange';
                          return <Tag color={color} style={{ fontSize: 11 }}>{v || '—'}</Tag>;
                        } },
                      { title: 'CCY', dataIndex: 'currency', width: 65, render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
                      { title: 'Adj Amount', dataIndex: 'adjustmentAmount', width: 130, align: 'right',
                        render: v => <Text style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600,
                          color: v < 0 ? '#C74634' : 'inherit' }}>{fmt(v || 0)}</Text> },
                      { title: 'Inst Balance', dataIndex: 'installmentBalance', width: 120, align: 'right',
                        render: v => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{fmt(v || 0)}</Text> },
                      { title: 'Activity', dataIndex: 'receivablesActivity', ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
                      { title: 'Reason', dataIndex: 'adjustmentReason', width: 130, ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
                      { title: 'Approved By', dataIndex: 'approvedBy', width: 140, ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
                    ];
                    return (
                      <div style={{ padding: '8px 4px 12px' }}>
                        <Space style={{ marginBottom: 8 }}>
                          <Tooltip title="Show API URL">
                            <Button size="small" icon={<ApiOutlined />}
                              type={showAdjApiUrl[tabKey] ? 'primary' : 'default'}
                              onClick={() => setShowAdjApiUrl(p => ({ ...p, [tabKey]: !p[tabKey] }))}
                            />
                          </Tooltip>
                          <Tooltip title="Refresh">
                            <Button size="small" icon={<ReloadOutlined />}
                              onClick={() => {
                                fetchedAdjTabsRef.current.delete(tabKey);
                                fetchAdjustments(tabKey, draft.transactionNumber);
                              }}
                            />
                          </Tooltip>
                        </Space>
                        {showAdjApiUrl[tabKey] && (
                          <div
                            title="Click to copy URL"
                            onClick={() => navigator.clipboard?.writeText(adjUrl).catch(() => {})}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              background: '#0d1117', border: '1px solid #30363d',
                              borderRadius: 4, padding: '4px 10px', marginBottom: 8,
                              cursor: 'copy',
                            }}
                          >
                            <ApiOutlined style={{ color: '#58a6ff', fontSize: 13, flexShrink: 0 }} />
                            <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#58a6ff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {adjUrl}
                            </span>
                          </div>
                        )}
                        {isNew ? (
                          <Alert type="info" showIcon message="Save the invoice first to view adjustments." />
                        ) : (
                          <Table<InvoiceAdj>
                            dataSource={adjState?.rows ?? []}
                            rowKey="key"
                            size="small"
                            loading={adjState?.loading ?? false}
                            pagination={{ pageSize: 20, size: 'small', showTotal: t => `${t} adjustment${t !== 1 ? 's' : ''}` }}
                            scroll={{ x: 1200 }}
                            columns={adjColumns}
                            summary={rows => {
                              const total = rows.reduce((s, r) => s + (r.adjustmentAmount || 0), 0);
                              return rows.length > 0 ? (
                                <Table.Summary.Row>
                                  <Table.Summary.Cell index={0} colSpan={6}><Text strong style={{ fontSize: 12 }}>Total</Text></Table.Summary.Cell>
                                  <Table.Summary.Cell index={6} align="right">
                                    <Text strong style={{ fontSize: 12, fontFamily: 'monospace', color: total < 0 ? '#C74634' : 'inherit' }}>{fmt(total)}</Text>
                                  </Table.Summary.Cell>
                                  <Table.Summary.Cell index={7} colSpan={4} />
                                </Table.Summary.Row>
                              ) : null;
                            }}
                          />
                        )}
                      </div>
                    );
                  })(),
                },
                // ── Balance Details ──────────────────────────────────────
                {
                  key: 'balance',
                  label: <span><AccountBookOutlined style={{ marginRight: 4 }} />Balance Details</span>,
                  children: (() => {
                    const balState = balanceMap[tabKey];
                    const balUrl = `${APEX_DB_CONFIG.baseUrl}/ar/invoice-balances?customer_transaction_id=${draft.customerTransactionId}&transaction_number=${encodeURIComponent(draft.transactionNumber || '')}`;

                    const balColumns = [
                      {
                        title: 'Balance Details', dataIndex: 'category', width: 180,
                        render: (v: string, r: BalanceRow) => (
                          <Text strong={r.isTotal === 'Y'} style={{ fontSize: 13 }}>{v}</Text>
                        ),
                      },
                      {
                        title: 'Lines', dataIndex: 'lineAmount', align: 'right' as const, width: 130,
                        render: (v: number, r: BalanceRow) => (
                          <Text strong={r.isTotal === 'Y'} style={{
                            fontFamily: 'monospace', fontSize: 13,
                            color: v < 0 ? '#C74634' : 'inherit',
                          }}>{v !== 0 || r.isTotal === 'Y' ? v.toLocaleString('en-AE', { minimumFractionDigits: 2 }) : '0.00'}</Text>
                        ),
                      },
                      {
                        title: 'Tax', dataIndex: 'taxAmount', align: 'right' as const, width: 110,
                        render: (v: number, r: BalanceRow) => (
                          <Text style={{ fontFamily: 'monospace', fontSize: 13, color: REDWOOD.neutral600 }}>
                            {v.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                          </Text>
                        ),
                      },
                      {
                        title: 'Freight', dataIndex: 'freightAmount', align: 'right' as const, width: 110,
                        render: (v: number) => (
                          <Text style={{ fontFamily: 'monospace', fontSize: 13, color: REDWOOD.neutral600 }}>
                            {v.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                          </Text>
                        ),
                      },
                      {
                        title: 'Charges', dataIndex: 'chargeAmount', align: 'right' as const, width: 110,
                        render: (v: number) => (
                          <Text style={{ fontFamily: 'monospace', fontSize: 13, color: REDWOOD.neutral600 }}>
                            {v.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                          </Text>
                        ),
                      },
                      {
                        title: 'Total', dataIndex: 'totalAmount', align: 'right' as const, width: 140,
                        render: (v: number, r: BalanceRow) => (
                          <Text strong={r.isTotal === 'Y'} style={{
                            fontFamily: 'monospace', fontSize: 13,
                            color: v < 0 ? '#C74634' : r.isTotal === 'Y' ? REDWOOD.success : 'inherit',
                          }}>{v.toLocaleString('en-AE', { minimumFractionDigits: 2 })}</Text>
                        ),
                      },
                    ];

                    return (
                      <div style={{ padding: '8px 4px 12px' }}>
                        {/* API icon + refresh */}
                        <Space style={{ marginBottom: 8 }}>
                          <Tooltip title="Show API URL">
                            <Button size="small" icon={<ApiOutlined />}
                              type={showBalApiUrl[tabKey] ? 'primary' : 'default'}
                              onClick={() => setShowBalApiUrl(p => ({ ...p, [tabKey]: !p[tabKey] }))}
                            />
                          </Tooltip>
                          <Tooltip title="Refresh">
                            <Button size="small" icon={<ReloadOutlined />}
                              onClick={() => {
                                fetchedBalanceTabsRef.current.delete(tabKey);
                                fetchBalance(tabKey, draft.customerTransactionId, draft.transactionNumber);
                              }}
                            />
                          </Tooltip>
                        </Space>

                        {showBalApiUrl[tabKey] && (
                          <div
                            title="Click to copy URL"
                            onClick={() => navigator.clipboard?.writeText(balUrl).catch(() => {})}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              background: '#0d1117', border: '1px solid #30363d',
                              borderRadius: 4, padding: '4px 10px', marginBottom: 8,
                              cursor: 'copy',
                            }}
                          >
                            <ApiOutlined style={{ color: '#58a6ff', fontSize: 13, flexShrink: 0 }} />
                            <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#58a6ff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {balUrl}
                            </span>
                          </div>
                        )}

                        {isNew ? (
                          <Alert type="info" showIcon message="Save the invoice first to view balance details." />
                        ) : (
                          <>
                            {/* Outstanding balance badge */}
                            {balState?.fetched && (
                              <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 10,
                                background: REDWOOD.neutral100, border: `1px solid ${REDWOOD.border}`,
                                borderRadius: 8, padding: '6px 16px', marginBottom: 12,
                              }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>Outstanding Balance</Text>
                                <Text strong style={{
                                  fontSize: 18, fontFamily: 'monospace',
                                  color: (balState.balance ?? 0) > 0 ? REDWOOD.primary : REDWOOD.success,
                                }}>
                                  {(balState.balance ?? 0).toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                                </Text>
                              </div>
                            )}

                            <Table<BalanceRow>
                              dataSource={balState?.rows ?? []}
                              rowKey="key"
                              size="small"
                              loading={balState?.loading ?? false}
                              pagination={false}
                              columns={balColumns}
                              rowClassName={(r) =>
                                r.category === 'Original Amount' ? 'balance-orig-row'
                                : r.isTotal === 'Y' ? 'balance-total-row'
                                : ''
                              }
                              style={{ borderRadius: 6 }}
                            />
                            <style>{`
                              .balance-orig-row td { background: #e6f4ff !important; }
                              .balance-total-row td { background: #f6ffed !important; font-weight: 700; border-top: 2px solid #b7eb8f !important; }
                            `}</style>
                          </>
                        )}
                      </div>
                    );
                  })(),
                },

                // ── Additional Information (DFF) ──────────────────────────
                {
                  key: 'dff',
                  label: <span><FileTextOutlined style={{ marginRight: 4 }} />Additional Info</span>,
                  children: (() => {
                    const dffState = dffMap[tabKey];
                    const dff = dffState?.data;
                    const fmt = (v: number | null) =>
                      v !== null && v !== undefined
                        ? v.toLocaleString('en-AE', { minimumFractionDigits: 2 })
                        : '—';
                    const val = (v: string | null | undefined) =>
                      v ? <Text style={{ fontSize: 13 }}>{v}</Text> : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;

                    return (
                      <div style={{ padding: '12px 4px' }}>
                        {isNew ? (
                          <Alert type="info" showIcon message="Save the invoice first to view additional information." />
                        ) : dffState?.loading ? (
                          <div style={{ textAlign: 'center', padding: 32 }}>
                            <SyncOutlined spin style={{ fontSize: 28, color: REDWOOD.primary }} />
                          </div>
                        ) : dffState?.fetched && !dff ? (
                          <Alert type="info" showIcon
                            message="No Descriptive Flexfield data found for this invoice."
                            description="Run the AR Invoice DFF Sync to populate this data from Oracle Fusion."
                          />
                        ) : dff ? (
                          <>
                            {/* Context badge */}
                            {dff.flexContextDisplay && (
                              <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                background: '#eff6ff', border: `1px solid ${REDWOOD.border}`,
                                borderRadius: 8, padding: '5px 14px', marginBottom: 14,
                              }}>
                                <Text type="secondary" style={{ fontSize: 11 }}>Context</Text>
                                <Text strong style={{ fontSize: 13, color: REDWOOD.primary }}>{dff.flexContextDisplay}</Text>
                              </div>
                            )}

                            {/* Rental Details */}
                            <Row gutter={[24, 0]}>
                              <Col span={8}>
                                <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8, color: REDWOOD.neutral600 }}>Property</Text>
                                {[
                                  ['Unit',          val(dff.unit)],
                                  ['Location',      val(dff.location)],
                                  ['Property Type', val(dff.propertyType)],
                                  ['EJARI',         val(dff.ejari)],
                                ].map(([label, node]) => (
                                  <Row key={String(label)} style={{ marginBottom: 6, alignItems: 'center' }}>
                                    <Col span={10}><Text type="secondary" style={{ fontSize: 12 }}>{label}</Text></Col>
                                    <Col span={14}>{node}</Col>
                                  </Row>
                                ))}
                              </Col>
                              <Col span={8}>
                                <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8, color: REDWOOD.neutral600 }}>Tenant</Text>
                                {[
                                  ['Name',             val(dff.nameOfTenant)],
                                  ['Nationality',      val(dff.nationality)],
                                  ['Occupant Status',  val(dff.occupantStatus)],
                                  ['No. of Occupants', dff.noOfOccupant !== null ? <Text style={{ fontSize: 13 }}>{dff.noOfOccupant}</Text> : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>],
                                ].map(([label, node]) => (
                                  <Row key={String(label)} style={{ marginBottom: 6, alignItems: 'center' }}>
                                    <Col span={10}><Text type="secondary" style={{ fontSize: 12 }}>{label}</Text></Col>
                                    <Col span={14}>{node}</Col>
                                  </Row>
                                ))}
                              </Col>
                              <Col span={8}>
                                <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8, color: REDWOOD.neutral600 }}>Contract</Text>
                                {[
                                  ['Start Date',    val(dff.contractStartDate)],
                                  ['End Date',      val(dff.contractEndDate)],
                                  ['Rent',          <Text style={{ fontSize: 13, fontFamily: 'monospace' }}>{fmt(dff.rent)}</Text>],
                                  ['Mode of Pay',   val(dff.modeOfPay)],
                                  ['No. of Cheques', dff.noOfCheques !== null ? <Text style={{ fontSize: 13 }}>{dff.noOfCheques}</Text> : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>],
                                  ['Mgmt Fee',      <Text style={{ fontSize: 13, fontFamily: 'monospace' }}>{fmt(dff.pmgtFee)}</Text>],
                                  ['Cheques With',  val(dff.chqsWith)],
                                ].map(([label, node]) => (
                                  <Row key={String(label)} style={{ marginBottom: 6, alignItems: 'center' }}>
                                    <Col span={12}><Text type="secondary" style={{ fontSize: 12 }}>{label}</Text></Col>
                                    <Col span={12}>{node}</Col>
                                  </Row>
                                ))}
                              </Col>
                            </Row>

                            {/* Attributes */}
                            {[dff.attribute1, dff.attribute2, dff.attribute3, dff.attribute4, dff.attribute5].some(Boolean) && (
                              <>
                                <Divider style={{ margin: '12px 0' }} />
                                <Text strong style={{ fontSize: 12, color: REDWOOD.neutral600, display: 'block', marginBottom: 8 }}>Additional Segments</Text>
                                <Row gutter={16}>
                                  {[dff.attribute1, dff.attribute2, dff.attribute3, dff.attribute4, dff.attribute5].map((v, i) =>
                                    v ? (
                                      <Col key={i} span={4}>
                                        <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Attribute {i + 1}</Text>
                                        <Text style={{ fontSize: 12 }}>{v}</Text>
                                      </Col>
                                    ) : null
                                  )}
                                </Row>
                              </>
                            )}

                            {/* Refresh */}
                            <div style={{ marginTop: 14, textAlign: 'right' }}>
                              <Button size="small" icon={<ReloadOutlined />}
                                onClick={() => {
                                  fetchedDffTabsRef.current.delete(tabKey);
                                  setDffMap(prev => { const n = { ...prev }; delete n[tabKey]; return n; });
                                  fetchDff(tabKey, draft.customerTransactionId);
                                }}>
                                Refresh
                              </Button>
                            </div>
                          </>
                        ) : null}
                      </div>
                    );
                  })(),
                },

                // ── Installment Details ───────────────────────────────────
                {
                  key: 'installments',
                  label: <span><OrderedListOutlined style={{ marginRight: 4 }} />Installment Details</span>,
                  children: (() => {
                    const instState = instTabMap[tabKey];
                    const rows = instState?.rows ?? [];
                    const totalOriginal = rows.reduce((s, r) => s + r.originalAmount, 0);
                    const totalBalance  = rows.reduce((s, r) => s + r.balanceDue,     0);
                    const totalPaid     = rows.reduce((s, r) => s + r.amountPaid,     0);
                    const fmtAmt = (v: number) => v.toLocaleString('en-AE', { minimumFractionDigits: 2 });

                    const instCols = [
                      { title: '#', dataIndex: 'sequenceNumber', width: 50,
                        render: (v: number) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
                      { title: 'Status', dataIndex: 'status', width: 110,
                        render: (v: string) => {
                          const color = v === 'OP' || v === 'Open' ? 'blue' : v === 'CL' || v === 'Closed' ? 'green' : 'default';
                          return <Tag color={color} style={{ fontSize: 11 }}>{v || '—'}</Tag>;
                        }},
                      { title: 'Due Date', dataIndex: 'dueDate', width: 110,
                        render: (v: string) => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{v ? v.substring(0, 10) : '—'}</Text> },
                      { title: 'Closed Date', dataIndex: 'closedDate', width: 110,
                        render: (v: string) => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{v ? v.substring(0, 10) : '—'}</Text> },
                      { title: 'Original', dataIndex: 'originalAmount', align: 'right' as const, width: 130,
                        render: (v: number) => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{fmtAmt(v)}</Text> },
                      { title: 'Balance Due', dataIndex: 'balanceDue', align: 'right' as const, width: 130,
                        render: (v: number) => <Text strong style={{ fontSize: 12, fontFamily: 'monospace', color: v > 0 ? REDWOOD.primary : REDWOOD.success }}>{fmtAmt(v)}</Text> },
                      { title: 'Amount Paid', dataIndex: 'amountPaid', align: 'right' as const, width: 130,
                        render: (v: number) => <Text style={{ fontSize: 12, fontFamily: 'monospace', color: REDWOOD.success }}>{fmtAmt(v)}</Text> },
                      { title: 'Days Late', dataIndex: 'daysLate', width: 90, align: 'right' as const,
                        render: (v: number | null) => v !== null
                          ? <Tag color={v > 0 ? 'red' : 'green'} style={{ fontSize: 11 }}>{v}</Tag>
                          : <Text type="secondary" style={{ fontSize: 11 }}>—</Text> },
                    ];

                    return (
                      <div style={{ padding: '8px 4px 12px' }}>
                        {isNew ? (
                          <Alert type="info" showIcon message="Save the invoice first to view installments." />
                        ) : (
                          <>
                            {/* KPI strip */}
                            {instState?.fetched && rows.length > 0 && (
                              <Row gutter={12} style={{ marginBottom: 10 }}>
                                {[
                                  { title: 'Installments', value: rows.length,    color: undefined },
                                  { title: 'Original',     value: fmtAmt(totalOriginal), color: undefined },
                                  { title: 'Balance Due',  value: fmtAmt(totalBalance),  color: totalBalance > 0 ? REDWOOD.primary : REDWOOD.success },
                                  { title: 'Amount Paid',  value: fmtAmt(totalPaid),     color: REDWOOD.success },
                                ].map(s => (
                                  <Col span={6} key={s.title}>
                                    <Card size="small" style={{ borderRadius: 8, textAlign: 'center' }}>
                                      <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 2 }}>{s.title}</div>
                                      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: s.color }}>{s.value}</div>
                                    </Card>
                                  </Col>
                                ))}
                              </Row>
                            )}

                            <Table<InstTabRow>
                              dataSource={rows}
                              rowKey="key"
                              size="small"
                              loading={instState?.loading ?? false}
                              pagination={false}
                              columns={instCols}
                              style={{ borderRadius: 6 }}
                            />

                            <div style={{ marginTop: 10, textAlign: 'right' }}>
                              <Button size="small" icon={<ReloadOutlined />}
                                onClick={() => {
                                  fetchedInstTabsRef.current.delete(tabKey);
                                  setInstTabMap(prev => { const n = { ...prev }; delete n[tabKey]; return n; });
                                  fetchInstTab(tabKey, draft.customerTransactionId);
                                }}>
                                Refresh
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })(),
                },
              ]}
            />
          </Card>

          {/* ── Invoice Lines ─────────────────────────────────────────── */}
          <Card size="small" style={{ borderRadius: 8 }}
            title={<Text strong style={{ fontSize: 13 }}>Invoice Lines</Text>}>
            <Table<ARInvoiceLine>
              dataSource={draft.lines} columns={lineColumns} rowKey="key"
              size="small" pagination={false} scroll={{ x: 1200 }}
            />
            {!isLocked && (
              <div style={{ marginTop: 8 }}>
                <Button size="small" type="dashed" icon={<PlusOutlined />}
                  onClick={() => addLine(tabKey)}>
                  Add Line
                </Button>
              </div>
            )}
            {/* Totals footer */}
            <Row justify="end" style={{ marginTop: 8, paddingRight: 50 }}>
              <Space direction="vertical" align="end" size={2}>
                <Text type="secondary" style={{ fontSize: 12 }}>Lines Total: <Text strong style={{ fontFamily: 'monospace' }}>{fmt(totalLines)}</Text></Text>
              </Space>
            </Row>
          </Card>
        </div>

        {/* ── Balance Details Modal ─────────────────────────────────── */}
        {balanceModalTabKey === tabKey && (() => {
          const bState = balanceMap[tabKey];
          const modalBalColumns = [
            { title: 'Balance Details', dataIndex: 'category', width: 180,
              render: (v: string, r: BalanceRow) => (
                <Text strong={r.isTotal === 'Y'} style={{ fontSize: 13 }}>{v}</Text>
              ) },
            { title: 'Lines', dataIndex: 'lineAmount', align: 'right' as const, width: 130,
              render: (v: number, r: BalanceRow) => (
                <Text strong={r.isTotal === 'Y'} style={{ fontFamily: 'monospace', fontSize: 13,
                  color: v < 0 ? '#C74634' : 'inherit' }}>
                  {v.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                </Text>
              ) },
            { title: 'Tax', dataIndex: 'taxAmount', align: 'right' as const, width: 100,
              render: (v: number) => (
                <Text style={{ fontFamily: 'monospace', fontSize: 13, color: REDWOOD.neutral600 }}>
                  {v.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                </Text>
              ) },
            { title: 'Freight', dataIndex: 'freightAmount', align: 'right' as const, width: 100,
              render: (v: number) => (
                <Text style={{ fontFamily: 'monospace', fontSize: 13, color: REDWOOD.neutral600 }}>
                  {v.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                </Text>
              ) },
            { title: 'Charges', dataIndex: 'chargeAmount', align: 'right' as const, width: 100,
              render: (v: number) => (
                <Text style={{ fontFamily: 'monospace', fontSize: 13, color: REDWOOD.neutral600 }}>
                  {v.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                </Text>
              ) },
            { title: 'Total', dataIndex: 'totalAmount', align: 'right' as const, width: 130,
              render: (v: number, r: BalanceRow) => (
                <Text strong={r.isTotal === 'Y'} style={{ fontFamily: 'monospace', fontSize: 13,
                  color: v < 0 ? '#C74634' : r.isTotal === 'Y' ? REDWOOD.success : 'inherit' }}>
                  {v.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                </Text>
              ) },
          ];
          return (
            <Modal
              open
              title={
                <Space>
                  <AccountBookOutlined style={{ color: REDWOOD.primary }} />
                  <Text strong>Balance Details: Invoice {draft.transactionNumber || draft.customerTransactionId}</Text>
                </Space>
              }
              onCancel={() => setBalanceModalTabKey(null)}
              footer={[
                <Button key="refresh" icon={<ReloadOutlined />} onClick={() => {
                  fetchedBalanceTabsRef.current.delete(tabKey);
                  fetchBalance(tabKey, draft.customerTransactionId, draft.transactionNumber);
                }}>
                  Refresh
                </Button>,
                <Button key="close" type="primary"
                  style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                  onClick={() => setBalanceModalTabKey(null)}>
                  Done
                </Button>,
              ]}
              width={780}
              centered
            >
              {/* Outstanding balance */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 16,
                background: REDWOOD.neutral100, border: `1px solid ${REDWOOD.border}`,
                borderRadius: 8, padding: '10px 18px', marginBottom: 16,
              }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>View By</Text>
                  <Text style={{ fontSize: 12 }}>Entered Currency ({draft.currency || 'AED'})</Text>
                </div>
                <div style={{ flex: 1 }} />
                <Text type="secondary" style={{ fontSize: 12 }}>Outstanding Balance</Text>
                <Text strong style={{
                  fontSize: 22, fontFamily: 'monospace',
                  color: (bState?.balance ?? 0) > 0 ? REDWOOD.primary : REDWOOD.success,
                }}>
                  {(bState?.balance ?? 0).toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                </Text>
              </div>

              <Table<BalanceRow>
                dataSource={bState?.rows ?? []}
                rowKey="key"
                size="small"
                loading={bState?.loading ?? false}
                pagination={false}
                columns={modalBalColumns}
                rowClassName={(r) =>
                  r.category === 'Original Amount' ? 'balance-orig-row'
                  : r.isTotal === 'Y' ? 'balance-total-row'
                  : ''
                }
                style={{ borderRadius: 6 }}
              />
              <style>{`
                .balance-orig-row td { background: #e6f4ff !important; }
                .balance-total-row td { background: #f6ffed !important; font-weight: 700; border-top: 2px solid #b7eb8f !important; }
              `}</style>
            </Modal>
          );
        })()}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Layout style={{ minHeight: '100vh', background: REDWOOD.neutral100 }}>
      <Content style={{ padding: '16px 20px' }}>

        <Breadcrumb style={{ marginBottom: 12 }} items={[
          { title: <Link to="/"><HomeOutlined /></Link> },
          { title: <Link to="/ar">Accounts Receivable</Link> },
          { title: 'Manage Receivable Invoices' },
        ]} />

        <Space style={{ marginBottom: 14 }} align="center">
          <FileTextOutlined style={{ fontSize: 22, color: REDWOOD.primary }} />
          <Title level={4} style={{ margin: 0 }}>Manage Receivable Invoices</Title>
          <Button type="primary" icon={<PlusOutlined />}
            style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary, marginLeft: 16 }}
            onClick={openNewTab}>
            Create New Invoice
          </Button>
        </Space>

        <Tabs
          type="editable-card"
          hideAdd
          activeKey={activeKey}
          onChange={setActiveKey}
          onEdit={(key, action) => { if (action === 'remove') closeTab(String(key)); }}
          items={[
            // ── Search tab ─────────────────────────────────────────────
            {
              key: 'search',
              label: <span><SearchOutlined style={{ marginRight: 4 }} />Search</span>,
              closable: false,
              children: (
                <div style={{ paddingTop: 4 }}>
                  {/* Filter form */}
                  <Card size="small" style={{ marginBottom: 12, borderRadius: 8 }}>
                    <Form form={searchForm} layout="inline" size="small" onFinish={handleSearch}>
                      <Form.Item name="businessUnit" label="Business Unit"
                        rules={[{ required: true, message: 'Select a Business Unit' }]}>
                        <Select style={{ width: 220 }} placeholder="Select BU" allowClear showSearch
                          filterOption={(input, opt) =>
                            String(opt?.value ?? '').toLowerCase().includes(input.toLowerCase())
                          }>
                          {businessUnits.map(bu => <Option key={bu.name} value={bu.name}>{bu.name}</Option>)}
                        </Select>
                      </Form.Item>
                      <Form.Item name="transactionNumber" label="Transaction #">
                        <Input style={{ width: 140 }} placeholder="Txn number" allowClear />
                      </Form.Item>
                      <Form.Item label="Customer">
                        {/* hidden field stores the value used in search */}
                        <Form.Item name="billToCustomer" noStyle><Input type="hidden" /></Form.Item>
                        <Input
                          readOnly
                          value={lovSelected
                            ? `${lovSelected.accountName}${lovSelected.accountNumber ? ` (${lovSelected.accountNumber})` : ''}`
                            : ''}
                          placeholder="Click to search customers…"
                          style={{ width: 240, cursor: 'pointer', background: '#fff' }}
                          onClick={openLov}
                          suffix={lovSelected
                            ? <CloseOutlined style={{ color: REDWOOD.neutral600, cursor: 'pointer', fontSize: 11 }}
                                onClick={e => { e.stopPropagation(); clearLov(); }} />
                            : <SearchOutlined style={{ color: REDWOOD.info, cursor: 'pointer' }} onClick={openLov} />}
                        />
                      </Form.Item>
                      <Form.Item name="transactionClass" label="Class">
                        <Select style={{ width: 120 }} placeholder="Any" allowClear>
                          {['Invoice','Credit Memo','Debit Memo'].map(o => <Option key={o} value={o}>{o}</Option>)}
                        </Select>
                      </Form.Item>
                      <Form.Item name="invoiceStatus" label="Status">
                        <Select style={{ width: 110 }} placeholder="Any" allowClear>
                          {['Complete','Incomplete','Void'].map(o => <Option key={o} value={o}>{o}</Option>)}
                        </Select>
                      </Form.Item>
                      <Form.Item name="dateRange" label="Date Range">
                        <DatePicker.RangePicker size="small" format="DD-MMM-YYYY" style={{ width: 230 }} />
                      </Form.Item>
                      <Form.Item>
                        <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={searching}
                          style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>
                          Search
                        </Button>
                      </Form.Item>
                    </Form>
                  </Card>

                  {/* Results */}
                  {(() => {
                    const q = gridFilter.trim().toLowerCase();
                    const filtered = q
                      ? searchRows.filter(r => {
                          const amt = r.enteredAmount ?? 0;
                          const amtStr = fmt(amt);                       // "1,234.56"
                          const amtRaw = String(amt);                    // "1234.56"
                          return (
                            (r.transactionNumber    || '').toLowerCase().includes(q) ||
                            (r.billToCustomerName   || '').toLowerCase().includes(q) ||
                            (r.billToCustomerNumber || '').toLowerCase().includes(q) ||
                            (r.transactionSource    || '').toLowerCase().includes(q) ||
                            (r.crossReference       || '').toLowerCase().includes(q) ||
                            (r.purchaseOrder        || '').toLowerCase().includes(q) ||
                            (r.transactionClass     || '').toLowerCase().includes(q) ||
                            (r.transactionType      || '').toLowerCase().includes(q) ||
                            (r.invoiceCurrencyCode  || '').toLowerCase().includes(q) ||
                            (r.invoiceStatus        || '').toLowerCase().includes(q) ||
                            (r.syncStatus           || '').toLowerCase().includes(q) ||
                            (r.businessUnit         || '').toLowerCase().includes(q) ||
                            (r.transactionDate      || '').toLowerCase().includes(q) ||
                            (r.accountingDate       || '').toLowerCase().includes(q) ||
                            amtStr.includes(q) ||
                            amtRaw.includes(q)
                          );
                        })
                      : searchRows;
                    return (
                      <Card size="small" style={{ borderRadius: 8 }}
                        title={
                          <Space wrap>
                            <Badge count={filtered.length} style={{ backgroundColor: REDWOOD.primary }} overflowCount={9999} />
                            <Text strong>Transactions</Text>
                            {gridFilter && searchRows.length !== filtered.length && (
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                ({searchRows.length} total, {filtered.length} shown)
                              </Text>
                            )}
                          </Space>
                        }
                        extra={
                          <Space size="small">
                            <Input
                              size="small"
                              allowClear
                              prefix={<FilterOutlined style={{ color: REDWOOD.neutral600 }} />}
                              placeholder="Filter results…"
                              style={{ width: 200 }}
                              value={gridFilter}
                              onChange={e => setGridFilter(e.target.value)}
                            />
                            <Tooltip title="Export visible rows to Excel">
                              <Button
                                size="small"
                                icon={<DownloadOutlined />}
                                disabled={filtered.length === 0}
                                onClick={() => exportToExcel(filtered)}
                              >
                                Excel
                              </Button>
                            </Tooltip>
                            <Tooltip title="Clear filter">
                              <Button size="small" icon={<ReloadOutlined />} onClick={() => setGridFilter('')} />
                            </Tooltip>
                          </Space>
                        }
                      >
                        <Table<SearchRow>
                          dataSource={filtered} columns={searchColumns} rowKey="key"
                          size="small" loading={searching}
                          pagination={{ pageSize: 50, size: 'small', showSizeChanger: true, showTotal: t => `${t} transactions` }}
                          scroll={{ x: 1700, y: 500 }}
                          onRow={r => ({ onDoubleClick: () => openInvoiceTab(r), style: { cursor: 'pointer' } })}
                        />
                      </Card>
                    );
                  })()}

                </div>
              ),
            },

            // ── Dynamic invoice tabs ───────────────────────────────────
            ...tabs.map(tab => ({
              key:      tab.key,
              closable: true,
              label: (
                <span style={{ fontSize: 12 }}>
                  <FileTextOutlined style={{ marginRight: 4, color: REDWOOD.primary }} />
                  {tab.draft.customerTransactionId === 0
                    ? 'New Invoice'
                    : (tab.draft.transactionNumber || `Txn ${tab.draft.customerTransactionId}`)}
                </span>
              ),
              children: renderInvoicePanel(tab),
            })),
          ]}
        />

      </Content>
      <FloatingMenu />

      {/* ── Customer LOV Modal ─────────────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <UserOutlined style={{ color: REDWOOD.info }} />
            <span>Search Customers</span>
          </Space>
        }
        open={lovVisible}
        onCancel={() => setLovVisible(false)}
        afterOpenChange={(open) => { if (open) fetchAllCustomers(); }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {lovLoading
                ? 'Loading customers…'
                : `${lovRows.length} of ${lovAllRows.length} customer${lovAllRows.length !== 1 ? 's' : ''}`}
            </Text>
            <Button onClick={() => setLovVisible(false)}>Cancel</Button>
          </div>
        }
        width={680}
        styles={{ body: { padding: '12px 24px' } }}
      >
        <Input
          autoFocus
          allowClear
          prefix={<SearchOutlined style={{ color: REDWOOD.neutral600 }} />}
          placeholder="Type to filter by account number or name…"
          value={lovSearch}
          onChange={e => setLovSearch(e.target.value)}
          style={{ marginBottom: 8 }}
          size="middle"
        />
        {/* API URL debug bar */}
        <div
          title="Click to copy URL"
          onClick={() => {
            navigator.clipboard?.writeText(`${APEX_DB_CONFIG.baseUrl}/ar/customers`).catch(() => {});
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#0d1117', border: '1px solid #30363d',
            borderRadius: 4, padding: '4px 10px', marginBottom: 10,
            cursor: 'copy',
          }}
        >
          <ApiOutlined style={{ color: '#58a6ff', fontSize: 13, flexShrink: 0 }} />
          <span style={{
            fontFamily: 'monospace', fontSize: 11, color: '#58a6ff',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {`${APEX_DB_CONFIG.baseUrl}/ar/customers`}
          </span>
        </div>
        <Table<CustomerOption>
          dataSource={lovRows}
          rowKey={r => String(r.custAccountId) || r.accountNumber}
          loading={lovLoading}
          size="small"
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: t => `${t} customers` }}
          scroll={{ y: 320 }}
          onRow={r => ({
            onClick:       () => selectLovRow(r),
            onDoubleClick: () => selectLovRow(r),
            style: { cursor: 'pointer' },
          })}
          columns={[
            {
              title: 'Account #',
              dataIndex: 'accountNumber',
              width: 130,
              sorter: (a, b) => a.accountNumber.localeCompare(b.accountNumber),
              render: v => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{v}</Text>,
            },
            {
              title: 'Account Name',
              dataIndex: 'accountName',
              sorter: (a, b) => a.accountName.localeCompare(b.accountName),
              render: v => <Text style={{ fontSize: 12 }}>{v}</Text>,
            },
            {
              title: '',
              key: 'select',
              width: 70,
              render: (_, r) => (
                <Button type="link" size="small" style={{ color: REDWOOD.info, padding: 0, fontSize: 12 }}
                  onClick={() => selectLovRow(r)}>
                  Select
                </Button>
              ),
            },
          ]}
        />
      </Modal>

      {/* ── PDF Preview Modal ──────────────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <FilePdfOutlined style={{ color: REDWOOD.primary }} />
            <span>Invoice Preview</span>
            <Text type="secondary" style={{ fontSize: 12 }}>{pdfFileName}</Text>
          </Space>
        }
        open={pdfPreviewVisible}
        onCancel={() => {
          setPdfPreviewVisible(false);
          if (pdfDataUrl) URL.revokeObjectURL(pdfDataUrl);
          setPdfDataUrl(null);
        }}
        width="80vw"
        style={{ top: 20 }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Generated on {dayjs().format('DD-MMM-YYYY HH:mm:ss')}
            </Text>
            <Space>
              <Button onClick={() => {
                setPdfPreviewVisible(false);
                if (pdfDataUrl) URL.revokeObjectURL(pdfDataUrl);
                setPdfDataUrl(null);
              }}>
                Close
              </Button>
              <Button
                type="primary"
                icon={<FilePdfOutlined />}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                onClick={() => {
                  if (pdfDataUrl) {
                    const a = document.createElement('a');
                    a.href = pdfDataUrl;
                    a.download = pdfFileName;
                    a.click();
                  }
                }}
              >
                Download PDF
              </Button>
            </Space>
          </div>
        }
        styles={{ body: { padding: 0, height: 'calc(100vh - 220px)', overflow: 'hidden' } }}
      >
        {pdfDataUrl && (
          <iframe
            src={pdfDataUrl}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="Invoice PDF Preview"
          />
        )}
      </Modal>

      {/* ── Review Installments Modal ──────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <ProfileOutlined style={{ color: REDWOOD.info }} />
            <span>Review Installments</span>
            <Text type="secondary" style={{ fontSize: 12 }}>Txn ID: {instTxnId}</Text>
          </Space>
        }
        open={instVisible}
        onCancel={() => setInstVisible(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {instLoading ? 'Loading…' : `${instRows.length} installment${instRows.length !== 1 ? 's' : ''}`}
              {!instLoading && instRows.length > 0 && (
                <span style={{ marginLeft: 16 }}>
                  Cumulative Balance: <strong>{fmt(instRows.reduce((s, r) => s + r.accountedBalanceDue, 0))}</strong> AED
                </span>
              )}
            </Text>
            <Button onClick={() => setInstVisible(false)}>Close</Button>
          </div>
        }
        width={1000}
        styles={{ body: { padding: '12px 24px' } }}
      >
        <Table<InstallmentRow>
          dataSource={instRows}
          rowKey="installmentId"
          loading={instLoading}
          size="small"
          pagination={false}
          scroll={{ x: 960, y: 400 }}
          summary={rows => {
            const totalOrig  = rows.reduce((s, r) => s + r.originalAmount,      0);
            const totalBal   = rows.reduce((s, r) => s + r.balanceDue,          0);
            const totalPaid  = rows.reduce((s, r) => s + r.amountPaid,          0);
            return (
              <Table.Summary.Row style={{ fontWeight: 700, background: '#fafafa' }}>
                <Table.Summary.Cell index={0} colSpan={3}><Text strong>Total</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right"><Text strong style={{ fontFamily: 'monospace' }}>{fmt(totalOrig)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right"><Text strong style={{ fontFamily: 'monospace' }}>{fmt(totalBal)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right"><Text strong style={{ fontFamily: 'monospace' }}>{fmt(totalPaid)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={6} colSpan={4} />
              </Table.Summary.Row>
            );
          }}
          columns={[
            { title: 'Seq', dataIndex: 'sequenceNumber', width: 55, align: 'center',
              render: v => <Text style={{ fontSize: 12 }}>{v}</Text> },
            { title: 'Days Late', dataIndex: 'daysLate', width: 80, align: 'right',
              render: v => <Text style={{ fontSize: 12, color: v > 0 ? REDWOOD.primary : undefined }}>{v ?? '—'}</Text> },
            { title: 'Due Date', dataIndex: 'dueDate', width: 105,
              render: v => <Text style={{ fontSize: 12 }}>{v ? dayjs(v).format('DD-MMM-YYYY') : '—'}</Text> },
            { title: 'Original Amount', dataIndex: 'originalAmount', width: 130, align: 'right',
              render: v => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{fmt(v)}</Text> },
            { title: 'Balance Due', dataIndex: 'balanceDue', width: 110, align: 'right',
              render: v => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{fmt(v)}</Text> },
            { title: 'Amount Paid', dataIndex: 'amountPaid', width: 110, align: 'right',
              render: v => <Text style={{ fontSize: 12, fontFamily: 'monospace', color: v > 0 ? REDWOOD.success : undefined }}>{fmt(v)}</Text> },
            { title: 'Status', dataIndex: 'status', width: 90,
              render: v => {
                const color = v === 'Closed' ? 'green' : v === 'Open' ? 'orange' : 'default';
                return <Tag color={color} style={{ fontSize: 11 }}>{v || '—'}</Tag>;
              }},
            { title: 'Closed Date', dataIndex: 'closedDate', width: 110,
              render: v => <Text style={{ fontSize: 12 }}>{v ? dayjs(v).format('DD-MMM-YYYY') : '—'}</Text> },
            { title: 'Accounted Bal Due', dataIndex: 'accountedBalanceDue', width: 140, align: 'right',
              render: v => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{fmt(v)}</Text> },
            { title: 'Tax Orig.', dataIndex: 'taxAmountOriginal', width: 100, align: 'right',
              render: v => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{fmt(v)}</Text> },
          ]}
        />
      </Modal>

      {/* ── Review Distributions Modal ─────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <ApartmentOutlined style={{ color: REDWOOD.info }} />
            <span>Review Distributions</span>
            <Text type="secondary" style={{ fontSize: 12 }}>Txn ID: {distTxnId}</Text>
          </Space>
        }
        open={distVisible}
        onCancel={() => setDistVisible(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {distLoading ? 'Loading…' : `${distRows.length} distribution${distRows.length !== 1 ? 's' : ''}`}
              {!distLoading && distRows.length > 0 && (
                <span style={{ marginLeft: 16 }}>
                  Total Amount: <strong>{fmt(distRows.reduce((s, r) => s + r.amount, 0))}</strong> AED
                </span>
              )}
            </Text>
            <Button onClick={() => setDistVisible(false)}>Close</Button>
          </div>
        }
        width={1100}
        styles={{ body: { padding: '12px 24px' } }}
      >
        <Table<DistributionRow>
          dataSource={distRows}
          rowKey="distributionId"
          loading={distLoading}
          size="small"
          pagination={false}
          scroll={{ x: 1050, y: 400 }}
          summary={rows => {
            const totalAmt  = rows.reduce((s, r) => s + r.amount,         0);
            const totalAcct = rows.reduce((s, r) => s + r.accountedAmount, 0);
            return (
              <Table.Summary.Row style={{ fontWeight: 700, background: '#fafafa' }}>
                <Table.Summary.Cell index={0} colSpan={4}><Text strong>Total</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right"><Text strong style={{ fontFamily: 'monospace' }}>{fmt(totalAmt)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right"><Text strong style={{ fontFamily: 'monospace' }}>{fmt(totalAcct)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={6} colSpan={2} />
              </Table.Summary.Row>
            );
          }}
          columns={[
            { title: 'Line #', dataIndex: 'lineNumber', width: 65, align: 'center',
              render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
            { title: 'Detail Tax Line', dataIndex: 'taxLineNumber', width: 110, align: 'center',
              render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
            { title: 'Account Class', dataIndex: 'accountClass', width: 120,
              render: v => {
                const color: Record<string,string> = { Receivable: 'blue', Revenue: 'green', Tax: 'orange', Rounding: 'default' };
                return <Tag color={color[v] ?? 'default'} style={{ fontSize: 11 }}>{v || '—'}</Tag>;
              }},
            { title: 'Distribution (Account)', dataIndex: 'accountCombination', width: 300, ellipsis: true,
              render: v => <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{v || '—'}</Text> },
            { title: 'Amount (AED)', dataIndex: 'amount', width: 130, align: 'right',
              render: v => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{fmt(v)}</Text> },
            { title: 'Accounted Amt (AED)', dataIndex: 'accountedAmount', width: 150, align: 'right',
              render: v => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{fmt(v)}</Text> },
            { title: 'Percent', dataIndex: 'percent', width: 80, align: 'right',
              render: v => <Text style={{ fontSize: 12 }}>{v != null ? `${v}%` : '—'}</Text> },
            { title: 'Comments', dataIndex: 'comments', ellipsis: true,
              render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
          ]}
        />
      </Modal>
    </Layout>
  );
};

export default ManageReceivables;
