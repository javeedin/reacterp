import React, { useState, useEffect, useRef } from 'react';
import dayjs from 'dayjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Card,
  Typography,
  Tabs,
  Table,
  Row,
  Col,
  Space,
  Button,
  Collapse,
  Dropdown,
  Tag,
  Descriptions,
  Input,
  Select,
  DatePicker,
  Form,
  Modal,
  Spin,
  Alert,
  Divider,
  Tooltip,
  message,
} from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DownOutlined,
  EditOutlined,
  StopOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  ScissorOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  ApiOutlined,
  PlayCircleOutlined,
  AccountBookOutlined,
  FormOutlined,
  SendOutlined,
  PrinterOutlined,
  EyeOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

// Oracle Redwood Color Palette
const REDWOOD = {
  primary: '#C74634',
  success: '#1D7B4D',
  warning: '#D4A800',
  info: '#0572CE',
  error: '#D93025',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral300: '#C7C7C7',
  neutral600: '#6B6B6B',
  neutral900: '#1A1A1A',
  surface: '#FFFFFF',
};

// Payment record interface
interface PaymentRecord {
  key: string;
  checkId: number;
  paymentId: number;
  paymentNumber: number;
  paymentDocument: string;
  paymentStatus: string;
  reconciled: boolean;
  payee: string;
  paymentDate: string;
  paymentAmount: number;
  paymentCurrency: string;
  remitToAddress: string;
  remitToAccountNumber: string;
  businessUnit: string;
  legalEntity: string;
  paymentMethod: string;
  accountingStatus: string;
  paymentType: string;
  supplierNumber: string;
  payeeSite: string;
  disbursementBankAccount: string;
  paymentProcessProfile: string;
  voucherNumber: number;
  documentCategory: string;
  documentSequence: string;
  withheldAmount: number | null;
  paymentReference: number;
  paymentFileReference: number;
  paymentProcessRequest: string;
  paymentDescription: string;
  createdBy: string;
  creationDate: string;
  // Payment-level currency conversion
  conversionRate: number | null;
  conversionDate: string | null;
  conversionRateType: string | null;
  clearingDate: string | null;
  clearingAmount: number | null;
  clearingLedgerAmount: number | null;
  clearingValueDate: string | null;
  clearingConversionRate: number | null;
  clearingConversionDate: string | null;
  clearingConversionRateType: string | null;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  city: string;
  country: string;
  relatedInvoicesHref: string;
  accountingDate?: string;
  maturityDate?: string | null;
  voidDate?: string | null;
  voidAccountingDate?: string | null;
  stopDate?: string | null;
  stopReason?: string;
  stopReference?: string;
}

// Related invoice interface
interface RelatedInvoice {
  key: string;
  invoicePaymentId: number;
  checkId: number;
  invoiceId: number;
  invoiceBusinessUnit: string;
  invoiceNumber: string;
  installmentNumber: number;
  amountPaidPaymentCurrency: number;
  amountPaidInvoiceCurrency: number;
  invoicePaymentAmount: number;
  invoiceAmount: number;
  invoiceBaseAmount: number;
  paymentBaseAmount: number;
  crossCurrencyRate: number | null;
  invoiceExchangeRate: number | null;
  invoiceFunctionalAmount: number | null;  // pre-computed by API: amountPaidInvoiceCurrency × invoiceRate
  paymentFunctionalAmount: number | null;  // pre-computed by API: amountPaidPaymentCurrency × paymentRate
  realizedGainLoss: number | null;         // pre-computed by API: paymentFunctional - invoiceFunctional
  discountLost: number;
  discountTaken: number;
  invoiceCurrency: string;
  invoicePaymentStatus: string;
  liabilityDistribution: string;
}

interface PaymentDetailProps {
  payment: PaymentRecord;
  onClose: () => void;
}

// Helper to format date
const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

// Convert any date representation (display "1 Mar 2024" OR ISO "2024-03-01") → "YYYY-MM-DD" for Oracle APIs
const toApiDate = (s: string): string => {
  if (!s) return new Date().toISOString().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const MONTHS: Record<string, string> = {
    Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
    Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12',
  };
  const m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (m) {
    const mo = MONTHS[m[2]];
    if (mo) return `${m[3]}-${mo}-${m[1].padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  return new Date().toISOString().split('T')[0];
};

import { ORACLE_FUSION_CONFIG, APEX_DB_CONFIG } from '../../config/api.config';
import {
  checkAccountingExists,
  createAccounting,
  postToLedger,
  fetchLedgerByBusinessUnit,
  buildApPaymentSlaPayloads,
  getAccounting,
  getLinesByHeaderId,
  getAccountingLinesBySourceNumber,
  checkGLJournalExists,
  derivePeriodName,
} from '../../services/sla.service';
import type { SlaExistsResult, SlaGetResult, SlaCreatePayload } from '../../services/sla.service';
import { eventTypeToRef5 } from '../../services/glPosting.service';

// Fusion API config - direct URL
const FUSION_CONFIG = {
  baseUrl: ORACLE_FUSION_CONFIG.baseUrl,
  auth: btoa(`${ORACLE_FUSION_CONFIG.username}:${ORACLE_FUSION_CONFIG.password}`),
};

// APEX endpoint for related invoices
const APEX_RELATED_INVOICES_URL = `${APEX_DB_CONFIG.baseUrl}/ap/payments`;

const PaymentDetail: React.FC<PaymentDetailProps> = ({ payment, onClose }) => {
  const [activeTab, setActiveTab] = useState('paymentDetails');
  const [relatedInvoices, setRelatedInvoices] = useState<RelatedInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // ── Void Payment state ────────────────────────────────────────────────────
  const [voidForm] = Form.useForm();
  const [voidModalOpen, setVoidModalOpen] = useState(false);

  type VoidStepStatus = 'idle' | 'running' | 'success' | 'error';
  interface VoidStepState { status: VoidStepStatus; response?: any; error?: string }
  const VOID_STEP_KEYS = ['eligibility', 'void', 'sla', 'gl_create', 'gl_post', 'sla_stamp'] as const;
  type VoidStepKey = typeof VOID_STEP_KEYS[number];
  const initVoidSteps = (): Record<VoidStepKey, VoidStepState> => ({
    eligibility: { status: 'idle' }, void: { status: 'idle' }, sla: { status: 'idle' },
    gl_create: { status: 'idle' }, gl_post: { status: 'idle' }, sla_stamp: { status: 'idle' },
  });
  const [voidStepMap, setVoidStepMap] = useState<Record<VoidStepKey, VoidStepState>>(initVoidSteps());
  const [voidRunning, setVoidRunning] = useState(false);
  const [voidDone, setVoidDone] = useState(false);

  interface VoidCtx {
    voidDate: string; paymentNum: string; buName: string; ccy: string;
    exRate: number; voidPeriod: string; ledgerId: number; ledgerName: string;
    reverseLines: any[]; slaHeaderId: number | null;
    glBatchId: number | null; glHeaderId: number | null; batchName: string;
  }
  const voidCtxRef = useRef<VoidCtx>({
    voidDate: '', paymentNum: '', buName: '', ccy: 'AED', exRate: 1,
    voidPeriod: '', ledgerId: 300000003259529, ledgerName: 'BCL DIFC',
    reverseLines: [], slaHeaderId: null, glBatchId: null, glHeaderId: null, batchName: '',
  });

  const setVoidStep = (key: VoidStepKey, upd: Partial<VoidStepState>) =>
    setVoidStepMap(prev => ({ ...prev, [key]: { ...prev[key], ...upd } }));
  // ─────────────────────────────────────────────────────────────────────────

  // ── Payment Voucher PDF ───────────────────────────────────────────────────
  const [voucherPdfUrl, setVoucherPdfUrl]     = useState<string | null>(null);
  const [voucherModalOpen, setVoucherModalOpen] = useState(false);

  const generateVoucherPdf = () => {
    const p   = payment;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const fmt   = (v: any) => (v != null && v !== '') ? String(v) : '—';
    const fmtNum = (v: any) => v != null ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '—';
    const fmtAmt = (v: any) => v != null ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
    const fmtDt  = (v: any) => {
      if (!v) return '—';
      try { return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
      catch { return String(v); }
    };

    // ── Header bar ──────────────────────────────────────────────────────────
    doc.setFillColor(191, 70, 0);
    doc.rect(0, 0, pageW, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('PAYMENT VOUCHER', 14, 13);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Printed: ${new Date().toLocaleString()}`, pageW - 14, 13, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    let y = 28;

    // ── Payment number + status row ─────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(191, 70, 0);
    doc.text(`Payment #${p.paymentDocument || p.paymentNumber}`, 14, y);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text(`Status: ${fmt(p.paymentStatus)}   |   Accounting: ${fmt(p.accountingStatus)}   |   Check ID: ${p.checkId}`, 14, y + 6);
    doc.setTextColor(0, 0, 0);
    y += 14;

    // ── Section 1: Payee & Organisation ────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Payee & Organisation', 14, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      body: [
        ['Payee',           fmt(p.payee),              'Business Unit',    fmt(p.businessUnit)],
        ['Legal Entity',    fmt(p.legalEntity),         'Payee Site',       fmt(p.payeeSite)],
        ['Supplier #',      fmt(p.supplierNumber),      'Payment Type',     fmt(p.paymentType)],
        ['Remit-to Address',fmt(p.remitToAddress),      'Remit-to Account', fmt(p.remitToAccountNumber)],
      ],
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40, fillColor: [245, 245, 245] }, 2: { fontStyle: 'bold', cellWidth: 40, fillColor: [245, 245, 245] } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    // ── Section 2: Payment Details ──────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Payment Details', 14, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      body: [
        ['Payment Date',    fmtDt(p.paymentDate),       'Accounting Date',  fmtDt(p.accountingDate)],
        ['Payment Method',  fmt(p.paymentMethod),        'Bank Account',     fmt(p.disbursementBankAccount)],
        ['Pay Process Profile', fmt(p.paymentProcessProfile), 'Payment File Ref', fmt(p.paymentFileReference) !== '0' ? fmt(p.paymentFileReference) : '—'],
        ['Document Category', fmt(p.documentCategory),  'Document Seq.',    fmt(p.documentSequence)],
        ['Voucher #',       fmt(p.voucherNumber) !== '0' ? fmt(p.voucherNumber) : '—', 'Payment Reference', fmt(p.paymentReference) !== '0' ? fmt(p.paymentReference) : '—'],
      ],
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40, fillColor: [245, 245, 245] }, 2: { fontStyle: 'bold', cellWidth: 40, fillColor: [245, 245, 245] } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    // ── Section 3: Amount & Currency ────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Amount & Currency', 14, y);
    y += 2;
    const amtRows: any[][] = [
      ['Payment Currency', fmt(p.paymentCurrency), 'Payment Amount', fmtAmt(p.paymentAmount)],
      ['Withheld Amount',  fmtAmt(p.withheldAmount), 'Net Amount', fmtAmt((p.paymentAmount || 0) - (p.withheldAmount || 0))],
    ];
    if (p.paymentCurrency && p.paymentCurrency !== 'AED') {
      amtRows.push(['Conv. Rate Type', fmt(p.conversionRateType), 'Conv. Rate', fmtNum(p.conversionRate)]);
      amtRows.push(['Conv. Date', fmtDt(p.conversionDate), 'AED Equivalent', fmtAmt((p.paymentAmount || 0) * (p.conversionRate || 1))]);
    }
    autoTable(doc, {
      startY: y,
      body: amtRows,
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40, fillColor: [245, 245, 245] }, 2: { fontStyle: 'bold', cellWidth: 40, fillColor: [245, 245, 245] } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    // ── Section 4: Paid Invoices ────────────────────────────────────────────
    if (relatedInvoices.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Paid Invoices', 14, y);
      y += 2;
      const totalPaid = relatedInvoices.reduce((s, r) => s + (r.invoicePaymentAmount || 0), 0);
      autoTable(doc, {
        startY: y,
        head: [['Invoice #', 'Inst.', 'Invoice CCY', 'Invoice Amt', 'Amount Paid (Invoice CCY)', 'Amount Paid (Payment CCY)', 'Status']],
        body: relatedInvoices.map(r => [
          r.invoiceNumber,
          r.installmentNumber,
          r.invoiceCurrency,
          fmtAmt(r.invoiceAmount),
          fmtAmt(r.amountPaidInvoiceCurrency),
          fmtAmt(r.amountPaidPaymentCurrency),
          r.invoicePaymentStatus,
        ]),
        foot: [['', '', '', '', 'Total', fmtAmt(totalPaid), '']],
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [58, 58, 58], textColor: 255 },
        footStyles: { fillColor: [230, 230, 230], fontStyle: 'bold', textColor: [0, 0, 0] },
        alternateRowStyles: { fillColor: [249, 249, 249] },
        columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
        didParseCell: (data: any) => {
          if (data.section === 'foot') {
            if (data.column.index === 4) data.cell.styles.halign = 'right';
            if (data.column.index === 5) data.cell.styles.halign = 'right';
          }
        },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // ── Signature block ─────────────────────────────────────────────────────
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setDrawColor(200, 200, 200);
    const sigY = Math.max(y + 10, 250);
    const sigLabels = ['Prepared By', 'Reviewed By', 'Approved By', 'Received By'];
    const sigW = (pageW - 28 - (sigLabels.length - 1) * 8) / sigLabels.length;
    sigLabels.forEach((label, i) => {
      const sx = 14 + i * (sigW + 8);
      doc.line(sx, sigY, sx + sigW, sigY);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(label, sx + sigW / 2, sigY + 5, { align: 'center' });
    });
    doc.setTextColor(0);

    // ── Footer ──────────────────────────────────────────────────────────────
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150);
      doc.text(`Page ${i} of ${pageCount}`, pageW / 2, 290, { align: 'center' });
      doc.text('Generated by ReactERP', 14, 290);
      doc.setTextColor(0);
    }

    const blob = doc.output('blob');
    const url  = URL.createObjectURL(blob);
    setVoucherPdfUrl(url);
    setVoucherModalOpen(true);
  };
  // ─────────────────────────────────────────────────────────────────────────

  // ── Exchange Gain/Loss modal state ───────────────────────────────────────
  const [glModalOpen, setGlModalOpen] = useState(false);
  const [showRelatedInvoicesApi, setShowRelatedInvoicesApi] = useState(false);

  // ── Create Accounting state ───────────────────────────────────────────────
  const [bankAccounts, setBankAccounts] = useState<{ bankAccountName: string; cashAccountCombination: string; pdcAccountCombination: string; cashClearingAccountCombination: string; legalEntityName: string }[]>([]);
  const [acctLoading, setAcctLoading] = useState(false);
  const [acctResults, setAcctResults] = useState<{ invoiceNumber: string; status: string; headerId?: number; error?: string }[]>([]);
  const [acctModalOpen, setAcctModalOpen] = useState(false);
  const [showAcctApiSection, setShowAcctApiSection] = useState(false);
  const [acctStepStatus, setAcctStepStatus] = useState<
    { step: number; label: string; status: 'idle' | 'running' | 'success' | 'error'; detail?: string }[]
  >([]);
  // API panel state
  const [acctGetRelResult, setAcctGetRelResult] = useState<any>(null);
  const [acctGetRelRunning, setAcctGetRelRunning] = useState(false);
  const [acctPostPayload, setAcctPostPayload] = useState<any[]>([]);
  const [acctPostResult, setAcctPostResult] = useState<any>(null);
  const [acctPostRunning, setAcctPostRunning] = useState(false);
  // ─────────────────────────────────────────────────────────────────────────

  // ── SLA Status / Post to Ledger / View Accounting state ──────────────────
  const [slaStatus, setSlaStatus] = useState<SlaExistsResult | null>(null);
  const [slaLoading, setSlaLoading] = useState(false);
  const [slaActionLoading, setSlaActionLoading] = useState(false);
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [postModalHeadId, setPostModalHeadId] = useState<number | null>(null);
  const [postGLPayload, setPostGLPayload] = useState<any>(null);
  const [postGLFetchingLines, setPostGLFetchingLines] = useState(false);
  const [postGLResult, setPostGLResult] = useState<{ success: boolean; data?: any; error?: string } | null>(null);
  const [postGLLinesUrl, setPostGLLinesUrl] = useState('');
  const [postGLRawCount, setPostGLRawCount] = useState(0);
  const [viewAcctOpen, setViewAcctOpen] = useState(false);
  const [viewAcctLoading, setViewAcctLoading] = useState(false);
  const [viewAcctData, setViewAcctData] = useState<SlaGetResult | null>(null);
  const [viewAcctAllEvents, setViewAcctAllEvents] = useState<{ headerId: number; eventTypeCode: string; accountingStatus: string; accountingDate: string; lines: any[] }[]>([]);
  const [voidPreviewOpen, setVoidPreviewOpen] = useState(false);
  const [voidPreviewLoading, setVoidPreviewLoading] = useState(false);
  const [voidPreviewLines, setVoidPreviewLines] = useState<any[]>([]);
  const [voidPreviewOrigLines, setVoidPreviewOrigLines] = useState<any[]>([]);
  // ─────────────────────────────────────────────────────────────────────────

  // Actions menu
  const isVoided  = payment.paymentStatus === 'Voided';
  const isCleared = !!(payment.clearingDate || payment.clearingAmount || payment.reconciled);
  const actionsMenuItems: MenuProps['items'] = [
    { key: 'edit', label: 'Edit', icon: <EditOutlined /> },
    { type: 'divider' },
    {
      key: 'void', label: 'Void Payment', icon: <CloseCircleOutlined />, danger: true,
      disabled: isVoided || isCleared,
    },
    { key: 'stop', label: 'Stop Payment', icon: <StopOutlined />, danger: true },
  ];

  const handleActionsClick = ({ key }: { key: string }) => {
    if (key === 'void') openVoidModal();
  };

  // Fetch related invoices from APEX
  const fetchRelatedInvoices = async () => {
    setLoadingInvoices(true);
    try {
      const relatedInvoicesUrl = `${APEX_RELATED_INVOICES_URL}/${payment.checkId}/related-invoices`;
      console.log('Fetching related invoices from:', relatedInvoicesUrl);

      const response = await fetch(relatedInvoicesUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      console.log('Related invoices response:', data);
      const items = data.items || [];

      setRelatedInvoices(items.map((item: any, index: number) => ({
        key: item.InvoicePaymentId?.toString() || index.toString(),
        invoicePaymentId: item.InvoicePaymentId || 0,
        checkId: item.CheckId || 0,
        invoiceId: item.InvoiceId || 0,
        invoiceBusinessUnit: item.InvoiceBusinessUnit || '',
        invoiceNumber: item.InvoiceNumber || '',
        installmentNumber: item.InstallmentNumber || 0,
        amountPaidPaymentCurrency: item.AmountPaidPaymentCurrency || 0,
        amountPaidInvoiceCurrency: item.AmountPaidInvoiceCurrency || 0,
        invoicePaymentAmount: item.InvoicePaymentAmount || 0,
        invoiceAmount: item.InvoiceAmount || 0,
        invoiceBaseAmount: item.InvoiceBaseAmount || 0,
        paymentBaseAmount: item.PaymentBaseAmount || 0,
        crossCurrencyRate: item.CrossCurrencyRate ?? null,
        invoiceExchangeRate: item.InvoiceExchangeRate ?? null,
        invoiceFunctionalAmount: item.InvoiceFunctionalAmount ?? null,
        paymentFunctionalAmount: item.PaymentFunctionalAmount ?? null,
        realizedGainLoss: item.RealizedGainLoss ?? null,
        discountLost: item.DiscountLost || 0,
        discountTaken: item.DiscountTaken || 0,
        invoiceCurrency: item.InvoiceCurrency || '',
        invoicePaymentStatus: item.InvoicePaymentStatus || '',
        liabilityDistribution: item.LiabilityDistribution || '',
      })));
    } catch (error) {
      console.error('Error fetching related invoices:', error);
      setRelatedInvoices([]);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const openVoidModal = () => {
    setVoidStepMap(initVoidSteps());
    setVoidDone(false);
    voidCtxRef.current = {
      voidDate: '', paymentNum: '', buName: '', ccy: 'AED', exRate: 1,
      voidPeriod: '', ledgerId: 300000003259529, ledgerName: 'BCL DIFC',
      reverseLines: [], slaHeaderId: null, glBatchId: null, glHeaderId: null, batchName: '',
    };
    voidForm.setFieldsValue({ voidDate: dayjs(), voidReason: '' });
    setVoidModalOpen(true);
  };

  // ── Auto void: runs all 6 steps in sequence ──────────────────────────────
  const handleVoidAuto = async (values: any) => {
    setVoidRunning(true);
    setVoidDone(false);
    setVoidStepMap(initVoidSteps());

    const ok = async (key: VoidStepKey, fn: () => Promise<boolean>): Promise<boolean> => {
      setVoidStep(key, { status: 'running', response: undefined, error: undefined });
      try {
        const success = await fn();
        return success;
      } catch (e: any) {
        setVoidStep(key, { status: 'error', error: e.message });
        return false;
      }
    };

    // Step 1 — Eligibility
    const s1 = await ok('eligibility', async () => {
      const res  = await fetch(`${APEX_DB_CONFIG.baseUrl}/ap/payments/${payment.checkId}/void-eligibility`, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      if (!data.eligible) { setVoidStep('eligibility', { status: 'error', response: data, error: data.errors?.[0] ?? 'Not eligible' }); return false; }
      setVoidStep('eligibility', { status: 'success', response: data });
      return true;
    });
    if (!s1) { setVoidRunning(false); return; }

    // Step 2 — Void Payment
    const s2 = await ok('void', async () => {
      const voidDate   = values.voidDate ? values.voidDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
      const paymentNum = String(payment.paymentNumber || payment.checkId);
      const buName     = payment.businessUnit || '';
      const ccy        = payment.paymentCurrency || 'AED';
      const exRate     = (payment.conversionRate && payment.conversionRate > 0) ? payment.conversionRate : 1;
      const voidPeriod = derivePeriodName(new Date(voidDate));
      const ledger     = await fetchLedgerByBusinessUnit(buName);
      voidCtxRef.current = { ...voidCtxRef.current, voidDate, paymentNum, buName, ccy, exRate, voidPeriod,
        ledgerId: ledger?.ledgerId ?? 300000003259529, ledgerName: ledger?.ledgerName ?? 'BCL DIFC' };
      const body = { CheckId: payment.checkId, VoidDate: voidDate, VoidedBy: null,
        StopReason: values.voidReason || 'Payment Voided', StopReference: paymentNum };
      const res  = await fetch(`${APEX_DB_CONFIG.baseUrl}/ap/payments/void`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.status === 'error' || !res.ok) { setVoidStep('void', { status: 'error', response: data, error: data.message ?? `HTTP ${res.status}` }); return false; }
      setVoidStep('void', { status: 'success', response: data });
      return true;
    });
    if (!s2) { setVoidRunning(false); return; }

    // Step 3 — Create SLA Reversal
    const s3 = await ok('sla', async () => {
      const ctx  = voidCtxRef.current;

      // Skip if void SLA was already created (re-run scenario)
      const existingVoid = await checkAccountingExists('AP_PAYMENTS', payment.checkId, 'AP_PAYMENT_VOID').catch(() => ({ exists: false }));
      if ((existingVoid as any).exists && (existingVoid as any).headerId) {
        voidCtxRef.current.slaHeaderId = (existingVoid as any).headerId;
        setVoidStep('sla', { status: 'success', response: existingVoid });
        return true;
      }

      // Validate pre-conditions before building lines
      const bank = bankAccounts.find(b => b.bankAccountName === payment.disbursementBankAccount);
      if (!bank) throw new Error(`Bank account "${payment.disbursementBankAccount || '(none)'}" not found in loaded list (${bankAccounts.length} accounts)`);
      if (!relatedInvoices.length) throw new Error('No related invoices — try opening the Paid Invoices tab first');

      // PDC: maturity date exists and differs from payment date
      const isPdcVoid = !!(payment.maturityDate && payment.maturityDate !== payment.paymentDate);

      // For void reversal: normal payment → bank cash account; PDC → PDC account
      // Fall back to cash clearing if the specific account is not configured
      const bankAcct      = isPdcVoid
        ? (bank.pdcAccountCombination  || bank.cashClearingAccountCombination || '')
        : (bank.cashAccountCombination || bank.cashClearingAccountCombination || '');
      const bankAcctClass = isPdcVoid ? 'PDC' : 'CASH';
      const bankAcctLabel = isPdcVoid ? 'PDC' : 'Cash';
      if (!bankAcct) throw new Error(`No ${bankAcctLabel} account (or cash clearing fallback) configured for bank: ${payment.disbursementBankAccount}`);
      const reverseLines: any[] = [];
      relatedInvoices.forEach((inv, idx) => {
        const amt = Number(inv.amountPaidPaymentCurrency) || 0;
        reverseLines.push({ lineNumber: idx*2+1, lineType: 'DR', accountingClass: bankAcctClass,
          accountCombination: bankAcct, enteredDr: amt, enteredCr: 0,
          accountedDr: amt*ctx.exRate, accountedCr: 0,
          currencyCode: ctx.ccy, exchangeRate: ctx.exRate, sourceLineNumber: idx*2+1,
          description: `Void ${bankAcctLabel} – Payment ${ctx.paymentNum} / Invoice ${inv.invoiceNumber}` });
        reverseLines.push({ lineNumber: idx*2+2, lineType: 'CR', accountingClass: 'LIABILITY',
          accountCombination: inv.liabilityDistribution || '', enteredDr: 0, enteredCr: amt,
          accountedDr: 0, accountedCr: amt*ctx.exRate,
          currencyCode: ctx.ccy, exchangeRate: ctx.exRate, sourceLineNumber: idx*2+2,
          description: `Void AP Liability – Payment ${ctx.paymentNum} / Invoice ${inv.invoiceNumber}` });
      });
      voidCtxRef.current.reverseLines = reverseLines;
      const payload: SlaCreatePayload = {
        header: { moduleName: 'AP', sourceTable: 'AP_PAYMENTS', sourceId: payment.checkId,
          sourceNumber: ctx.paymentNum, sourceType: 'PAYMENT', eventTypeCode: 'AP_PAYMENT_VOID',
          eventDate: ctx.voidDate, accountingDate: ctx.voidDate, periodName: ctx.voidPeriod,
          ledgerId: ctx.ledgerId, ledgerName: ctx.ledgerName, currencyCode: ctx.ccy,
          ledgerCurrency: 'AED', exchangeRate: ctx.exRate, exchangeRateType: 'Corporate',
          businessUnit: ctx.buName || undefined, description: `AP Payment Void — ${ctx.paymentNum}`, createdBy: 'SYSTEM' },
        lines: reverseLines,
      };
      const result = await createAccounting(payload);
      if ((result as any).status === 'error' || !(result.headerId > 0)) {
        setVoidStep('sla', { status: 'error', response: result, error: (result as any).message ?? 'headerId missing' }); return false;
      }
      voidCtxRef.current.slaHeaderId = result.headerId;
      setVoidStep('sla', { status: 'success', response: result });
      return true;
    });
    if (!s3) { setVoidRunning(false); return; }

    // Step 4 — Create GL Journal
    const s4 = await ok('gl_create', async () => {
      const ctx = voidCtxRef.current;
      const ref5 = eventTypeToRef5('AP_PAYMENT_VOID');
      const batchName = `${ref5}-${ctx.paymentNum}-${ctx.voidDate.replace(/-/g,'')}-${Date.now().toString().slice(-6)}`;
      voidCtxRef.current.batchName = batchName;
      const totalDr = ctx.reverseLines.reduce((s, l) => s + (l.enteredDr||0), 0);
      const totalCr = ctx.reverseLines.reduce((s, l) => s + (l.enteredCr||0), 0);
      const payload = {
        batch: { batchName, batchDescription: `AP-PAYMENT-VOID – ${ctx.paymentNum}`,
          ledgerName: ctx.ledgerName, ledgerId: ctx.ledgerId, status: 'NEW',
          accountingPeriod: ctx.voidPeriod, controlTotal: totalDr,
          runningTotalDr: totalDr, runningTotalCr: totalCr, batchSource: 'Payables', createdBy: 'SYSTEM' },
        header: { ledgerId: ctx.ledgerId, ledgerName: ctx.ledgerName,
          jeCategory: 'AP_PAYMENT_VOID', jeSource: 'Payables', periodName: ctx.voidPeriod,
          journalName: batchName, description: `AP Payment Void — ${ctx.paymentNum}`,
          currencyCode: ctx.ccy, currencyConversionType: 'User',
          currencyConversionDate: ctx.voidDate, currencyConversionRate: ctx.exRate,
          defaultEffectiveDate: ctx.voidDate, status: 'NEW',
          runningTotalDr: totalDr, runningTotalCr: totalCr, createdBy: 'SYSTEM' },
        lines: ctx.reverseLines.map(l => ({
          enteredDr: l.enteredDr||null, enteredCr: l.enteredCr||null,
          accountedDr: l.accountedDr||null, accountedCr: l.accountedCr||null,
          statAmount: null, description: l.description||'', currencyCode: l.currencyCode||ctx.ccy,
          currencyConversionDate: ctx.voidDate, currencyConversionRate: ctx.exRate,
          userCurrencyConversionType: 'User', accountCombination: l.accountCombination||'',
          chartOfAccountsName: 'Chart of Accounts',
          reference1: ctx.paymentNum, reference2: String(payment.checkId),
          reference3: l.accountingClass||null, reference4: ctx.buName||null,
          reference5: ref5, createdBy: 'SYSTEM',
        })),
      };
      const res  = await fetch(`${APEX_DB_CONFIG.baseUrl}/journals/create`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { setVoidStep('gl_create', { status: 'error', response: data, error: data.message ?? `HTTP ${res.status}` }); return false; }
      voidCtxRef.current.glBatchId  = data.jeBatchId  ?? data.batchId  ?? null;
      voidCtxRef.current.glHeaderId = data.jeHeaderId ?? data.headerId ?? null;
      setVoidStep('gl_create', { status: 'success', response: data });
      return true;
    });
    if (!s4) { setVoidRunning(false); return; }

    // Step 5 — Post GL Journal
    const s5 = await ok('gl_post', async () => {
      const ctx = voidCtxRef.current;
      if (!ctx.glBatchId) throw new Error('GL Batch ID missing');
      const res  = await fetch(`${APEX_DB_CONFIG.baseUrl}/gl/journals/${ctx.glBatchId}/post`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) { setVoidStep('gl_post', { status: 'error', response: data, error: data.error ?? `HTTP ${res.status}` }); return false; }
      setVoidStep('gl_post', { status: 'success', response: data });
      return true;
    });
    if (!s5) { setVoidRunning(false); return; }

    // Step 6 — Stamp SLA
    await ok('sla_stamp', async () => {
      const ctx = voidCtxRef.current;
      if (!ctx.slaHeaderId) throw new Error('SLA Header ID missing');
      const result = await postToLedger(ctx.slaHeaderId, ctx.glBatchId ?? 0, ctx.batchName, ctx.glHeaderId ?? 0, 'SYSTEM');
      setVoidStep('sla_stamp', { status: 'success', response: result });
      return true;
    });

    setVoidRunning(false);
    setVoidDone(true);
    fetchSlaStatus();
  };

  useEffect(() => {
    fetchRelatedInvoices();
    fetchSlaStatus();
  }, [payment.checkId]);

  // Fetch bank accounts on mount (needed for Create Accounting)
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${APEX_DB_CONFIG.baseUrl}/banks/bankaccounts`, { headers: { Accept: 'application/json' } });
        if (!res.ok) return;
        const data = await res.json();
        setBankAccounts((data.items || []).map((item: any) => ({
          bankAccountName:                item.bank_account_name                 || '',
          cashAccountCombination:         item.cash_account_combination          || '',
          pdcAccountCombination:          item.pdc_account_combination           || '',
          cashClearingAccountCombination: item.cash_clearing_account_combination || '',
          legalEntityName:                item.legal_entity_name                 || '',
        })));
      } catch { /* silent */ }
    };
    load();
  }, []);

  // ── SLA helpers ──────────────────────────────────────────────────────────

  const fetchSlaStatus = async () => {
    setSlaLoading(true);
    try {
      const result = await checkAccountingExists('AP_PAYMENTS', payment.checkId);
      setSlaStatus(result);
    } catch (err) {
      console.error('SLA status check failed:', err);
    } finally {
      setSlaLoading(false);
    }
  };

  const handlePostToLedgerOpen = async () => {
    setSlaActionLoading(true);
    setPostGLPayload(null);
    setPostGLResult(null);
    setPostGLFetchingLines(true);
    try {
      // getAccounting already returns the header + lines — no second fetch needed
      const acctData = await getAccounting('AP_PAYMENTS', payment.checkId);
      if (!acctData.found || !acctData.headerId) {
        message.warning('No accounting entry found. Run "Create Accounting" first.');
        return;
      }
      if (acctData.accountingStatus === 'POSTED') {
        message.error('Already POSTED and locked.');
        return;
      }
      setPostModalHeadId(acctData.headerId);

      const acctUrl = `${APEX_DB_CONFIG.baseUrl}/sla/accounting?sourceTable=AP_PAYMENTS&sourceId=${payment.checkId}`;
      setPostGLLinesUrl(acctUrl);

      const lines = acctData.lines || [];
      setPostGLRawCount(lines.length);

      const ledgerInfo = await fetchLedgerByBusinessUnit(payment.businessUnit || '');
      const totalDr    = lines.reduce((s, l) => s + (l.enteredDr || 0), 0);
      const totalCr    = lines.reduce((s, l) => s + (l.enteredCr || 0), 0);
      const ledgerName = ledgerInfo?.ledgerName ?? 'BCL DIFC';
      const ledgerId   = ledgerInfo?.ledgerId   ?? 0;
      const batchName  = `SLA-AP_PAYMENTS-${acctData.periodName}-${acctData.headerId}`;

      setPostGLPayload({
        batch: {
          batchName,
          batchDescription:  acctData.description || '',
          ledgerName,
          ledgerId,
          status:            'NEW',
          accountingPeriod:  acctData.periodName,
          controlTotal:      totalDr,
          runningTotalDr:    totalDr,
          runningTotalCr:    totalCr,
          batchSource:       'Payables',
          createdBy:         'SYSTEM',
        },
        header: {
          ledgerId,
          ledgerName,
          jeCategory:             acctData.eventTypeCode || 'Payables',
          jeSource:               'Payables',
          periodName:             acctData.periodName,
          journalName:            `SLA-${payment.paymentNumber}-${acctData.eventTypeCode}`,
          description:            acctData.description || '',
          currencyCode:           payment.paymentCurrency || 'AED',
          currencyConversionType: 'User',
          currencyConversionDate: acctData.accountingDate,
          currencyConversionRate: (payment.conversionRate && payment.conversionRate > 0) ? payment.conversionRate : 1,
          defaultEffectiveDate:   acctData.accountingDate,
          status:                 'NEW',
          runningTotalDr:         totalDr,
          runningTotalCr:         totalCr,
          createdBy:              'SYSTEM',
        },
        lines: lines.map((l) => {
          const eDr  = l.lineType === 'DR' ? (l.enteredDr  || null) : null;
          const eCr  = l.lineType === 'CR' ? (l.enteredCr  || null) : null;
          const rate = (payment.conversionRate && payment.conversionRate > 0) ? payment.conversionRate : 1;
          return {
            enteredDr:                  eDr,
            enteredCr:                  eCr,
            accountedDr:                eDr != null ? Math.round(eDr * rate * 100) / 100 : null,
            accountedCr:                eCr != null ? Math.round(eCr * rate * 100) / 100 : null,
            statAmount:                 null,
            description:                l.description || acctData.description || '',
            currencyCode:               payment.paymentCurrency || 'AED',
            currencyConversionDate:     acctData.accountingDate,
            currencyConversionRate:     rate,
            userCurrencyConversionType: 'User',
            accountCombination:         l.accountCombination || '',
            chartOfAccountsName:        'Chart of Accounts',
            reference1:                 String(payment.paymentNumber || ''),
            reference2:                 String(payment.checkId || ''),
            reference3:                 l.accountingClass || null,
            reference4:                 payment.businessUnit || null,
            reference5:                 eventTypeToRef5(acctData.eventTypeCode || 'PAYMENT_CREATED'),
            createdBy:                  'SYSTEM',
          };
        }),
      });
      setPostModalOpen(true);
    } catch (err: any) {
      message.error(`Failed to prepare posting: ${err.message}`);
    } finally {
      setSlaActionLoading(false);
      setPostGLFetchingLines(false);
    }
  };

  const handlePostToLedgerConfirm = async () => {
    if (!postGLPayload || !postModalHeadId) return;
    setSlaActionLoading(true);
    try {
      // Step 1 — Duplicate check: search existing GL journal by ref1/ref2/ref5
      const ref5 = postGLPayload.lines?.[0]?.reference5 || eventTypeToRef5('PAYMENT_CREATED');
      const glExists = await checkGLJournalExists(
        String(payment.paymentNumber || ''),
        String(payment.checkId || ''),
        ref5,
      );

      let retBatchId: number | null   = glExists.batchId;
      let retHeaderId: number | null  = glExists.headerId;
      let retBatchName: string        = postGLPayload.batch.batchName;

      if (glExists.exists && glExists.status === 'P') {
        // Already fully posted — just stamp SLA and close
        message.info('GL journal already posted. Stamping SLA header.');
      } else if (glExists.exists && glExists.batchId) {
        // Journal exists but not yet posted — post it via PUT
        const putRes  = await fetch(`${APEX_DB_CONFIG.baseUrl}/gl/journals/${glExists.batchId}/post`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}',
        });
        const putData = await putRes.json().catch(() => ({}));
        if (!putRes.ok || putData?.success === false) {
          throw new Error(Array.isArray(putData?.errors) ? putData.errors[0] : putData?.error || `HTTP ${putRes.status}`);
        }
      } else {
        // Step 2 — Create the GL journal
        const glRes = await fetch(`${APEX_DB_CONFIG.baseUrl}/journals/create`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body:    JSON.stringify(postGLPayload),
        });
        const glData = await glRes.json();
        if (!glRes.ok) throw new Error(glData?.message || `HTTP ${glRes.status}`);

        retBatchId   = glData.jeBatchId  ?? glData.batchId  ?? null;
        retHeaderId  = glData.jeHeaderId ?? glData.headerId ?? null;
        retBatchName = glData.batchName  ?? retBatchName;

        // Step 3 — Post the newly created batch
        if (retBatchId) {
          const putRes  = await fetch(`${APEX_DB_CONFIG.baseUrl}/gl/journals/${retBatchId}/post`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}',
          });
          const putData = await putRes.json().catch(() => ({}));
          if (!putRes.ok || putData?.success === false) {
            throw new Error(Array.isArray(putData?.errors) ? putData.errors[0] : putData?.error || `HTTP ${putRes.status}`);
          }
        }
      }

      // Step 4 — Stamp SLA header with GL batch info
      await fetch(`${APEX_DB_CONFIG.baseUrl}/sla/accounting/post`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    JSON.stringify({ headerId: postModalHeadId, glBatchId: retBatchId, glBatchName: retBatchName, glHeaderId: retHeaderId, postedBy: 'SYSTEM' }),
      });

      setPostGLResult({ success: true, data: { batchId: retBatchId, headerId: retHeaderId } });
      message.success(`Posted to GL successfully.`);
      await fetchSlaStatus();
    } catch (err: any) {
      setPostGLResult({ success: false, error: err.message });
      message.error(`Post to GL failed: ${err.message}`);
    } finally {
      setSlaActionLoading(false);
    }
  };

  const handleViewAccounting = async () => {
    setViewAcctOpen(true);
    setViewAcctLoading(true);
    setViewAcctData(null);
    setViewAcctAllEvents([]);
    try {
      // Fetch the primary header (for the Post button check)
      const result = await getAccounting('AP_PAYMENTS', payment.checkId);
      setViewAcctData(result);

      // Fetch ALL journal lines by payment number — this returns lines from every event
      // (original payment + void reversal) unlike sla/accounting which returns only one header
      const allLinesData = payment.paymentNumber
        ? await getAccountingLinesBySourceNumber(String(payment.paymentNumber), 'AP').catch(() => ({ items: [] }))
        : { items: [] };

      const eventsMap = new Map<number, {
        headerId: number;
        eventTypeCode: string;
        accountingStatus: string;
        accountingDate: string;
        description: string;
        lines: any[];
      }>();

      for (const line of ((allLinesData as any).items || [])) {
        const hid = (line as any).headerId as number;
        if (!eventsMap.has(hid)) {
          eventsMap.set(hid, {
            headerId: hid,
            eventTypeCode: (line as any).eventTypeCode || '',
            accountingStatus: (line as any).accountingStatus || '',
            accountingDate: (line as any).accountingDate || '',
            description: (line as any).headerDescription || (line as any).description || '',
            lines: [],
          });
        }
        eventsMap.get(hid)!.lines.push(line);
      }

      if (eventsMap.size > 0) {
        setViewAcctAllEvents(Array.from(eventsMap.values()).sort((a, b) => a.headerId - b.headerId));
      } else if (result.found) {
        // Last resort: show only what getAccounting returned
        setViewAcctAllEvents([{
          headerId: result.headerId,
          eventTypeCode: result.eventTypeCode || '',
          accountingStatus: result.accountingStatus || '',
          accountingDate: result.accountingDate || '',
          description: result.description || '',
          lines: result.lines || [],
        }]);
      }
    } catch (err: any) {
      message.error(`Failed to fetch accounting: ${err.message}`);
      setViewAcctOpen(false);
    } finally {
      setViewAcctLoading(false);
    }
  };

  const handlePreviewVoidAccounting = async () => {
    setVoidPreviewOpen(true);
    setVoidPreviewLoading(true);
    setVoidPreviewLines([]);
    setVoidPreviewOrigLines([]);
    try {
      const result = await getAccounting('AP_PAYMENTS', payment.checkId);
      const lines = result.lines || [];
      setVoidPreviewOrigLines(lines);
      // Flip DR↔CR for each line to simulate reversal
      const reversed = lines.map((l: any, i: number) => ({
        ...l,
        key: `void-${i}`,
        enteredDr: l.enteredCr ?? null,
        enteredCr: l.enteredDr ?? null,
        lineType: l.lineType === 'DR' ? 'CR' : 'DR',
        description: `Reversal: ${l.description || ''}`,
      }));
      setVoidPreviewLines(reversed);
    } catch (err: any) {
      message.error(`Failed to fetch accounting for preview: ${err.message}`);
      setVoidPreviewOpen(false);
    } finally {
      setVoidPreviewLoading(false);
    }
  };

  const getAccountingStatusDisplay = () => {
    if (slaLoading) return <Spin size="small" />;
    if (!slaStatus?.exists) {
      return <Tag color="default" style={{ fontSize: 12, padding: '2px 8px' }}>Accounting: None</Tag>;
    }
    const status = slaStatus.accountingStatus || '';
    const colorMap: Record<string, string> = {
      DRAFT: '#1677ff', FINAL: '#52c41a', POSTED: '#52c41a', ERROR: '#ff4d4f',
    };
    const labelMap: Record<string, string> = {
      DRAFT: 'Draft', FINAL: 'Final', POSTED: 'Posted', ERROR: 'Error',
    };
    const iconMap: Record<string, React.ReactNode> = {
      DRAFT: <FormOutlined />, FINAL: <CheckCircleOutlined />,
      POSTED: <CheckCircleOutlined />, ERROR: <StopOutlined />,
    };
    return (
      <Tooltip title={slaStatus.message}>
        <Tag
          color={colorMap[status] || 'default'}
          icon={iconMap[status]}
          style={{ fontSize: 12, padding: '2px 8px', cursor: 'help', fontWeight: 600 }}
        >
          {labelMap[status] || status}
        </Tag>
      </Tooltip>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────

  // Create Accounting handler
  const handleCreateAccounting = async () => {
    // Reset and open modal immediately so user sees it right away
    const steps = [
      { step: 0, label: 'Check accounting exists', status: 'idle' as const },
      { step: 1, label: 'Find bank account',        status: 'idle' as const },
      { step: 2, label: 'Fetch related invoices',   status: 'idle' as const },
      { step: 3, label: 'Fetch ledger info',         status: 'idle' as const },
      { step: 4, label: 'Build SLA payloads',        status: 'idle' as const },
      { step: 5, label: 'Post accounting entries',   status: 'idle' as const },
    ];
    setAcctResults([]);
    setAcctStepStatus(steps);
    setAcctLoading(true);
    setAcctModalOpen(true);
    setAcctGetRelResult(null);
    setAcctPostPayload([]);
    setAcctPostResult(null);

    const setStep = (step: number, status: 'running' | 'success' | 'error', detail?: string) =>
      setAcctStepStatus(prev => prev.map(s => s.step === step ? { ...s, status, detail } : s));

    try {
      // Step 0: Check if already posted
      setStep(0, 'running');
      let exists: any;
      try {
        exists = await checkAccountingExists('AP_PAYMENTS', payment.checkId);
      } catch (e: any) {
        exists = { exists: false };
        setStep(0, 'error', e?.message ?? 'Check failed — proceeding anyway');
      }
      if (exists?.exists && exists?.accountingStatus === 'POSTED') {
        setStep(0, 'success', 'Already posted');
        setAcctResults([{ invoiceNumber: '—', status: 'ALREADY POSTED', headerId: exists.headerId ?? undefined }]);
        return;
      }
      setStep(0, 'success', exists?.exists ? `Exists (${exists.accountingStatus})` : 'No existing accounting');

      // Step 1: Find bank account
      setStep(1, 'running');
      const bank = bankAccounts.find(b => b.bankAccountName === payment.disbursementBankAccount);
      if (!bank) {
        setStep(1, 'error', `Not found: "${payment.disbursementBankAccount}"`);
        setAcctResults([{ invoiceNumber: '—', status: 'ERROR', error: `Bank account "${payment.disbursementBankAccount}" not found in loaded list (${bankAccounts.length} accounts loaded)` }]);
        return;
      }
      setStep(1, 'success', bank.bankAccountName);

      // Step 2: Fetch related invoices
      setStep(2, 'running');
      const relUrl = `${APEX_DB_CONFIG.baseUrl}/ap/payments/${payment.checkId}/related-invoices`;
      let relInvoices: any[] = [];
      try {
        const relRes = await fetch(relUrl, { headers: { Accept: 'application/json' } });
        const relText = await relRes.text();
        const relData = JSON.parse(relText);
        setAcctGetRelResult(relData);
        relInvoices = relData.items || [];
        if (!relRes.ok) throw new Error(`HTTP ${relRes.status}: ${relData?.message || relText.slice(0, 100)}`);
        setStep(2, 'success', `${relInvoices.length} invoice(s) found`);
      } catch (e: any) {
        setStep(2, 'error', e?.message ?? 'Fetch failed');
        setAcctResults([{ invoiceNumber: '—', status: 'ERROR', error: `Failed to fetch related invoices: ${e?.message}` }]);
        return;
      }
      if (relInvoices.length === 0) {
        setStep(2, 'error', 'No applied invoices');
        setAcctResults([{ invoiceNumber: '—', status: 'ERROR', error: 'No applied invoices found for this payment' }]);
        return;
      }

      // Step 3: Fetch ledger
      setStep(3, 'running');
      let ledgerInfo: any = null;
      try {
        ledgerInfo = await fetchLedgerByBusinessUnit(payment.businessUnit || '');
        setStep(3, 'success', ledgerInfo?.ledgerName || 'Ledger loaded');
      } catch (e: any) {
        setStep(3, 'error', e?.message ?? 'Fetch failed — using null ledger');
      }

      // Step 4: Build payload (single combined: N DR + 1 CR)
      setStep(4, 'running');
      let payloads: any[] = [];
      try {
        const paymentDate = toApiDate(payment.paymentDate || '');
        payloads = buildApPaymentSlaPayloads({
          checkId: payment.checkId,
          paymentNumber: String(payment.paymentNumber || payment.checkId),
          paymentDate,
          currencyCode: payment.paymentCurrency || 'AED',
          exchangeRate: (payment.paymentCurrency && payment.paymentCurrency !== 'AED' && payment.conversionRate && payment.conversionRate > 0)
            ? payment.conversionRate : 1,
          businessUnit: payment.businessUnit,
          legalEntity: payment.legalEntity,
          ledgerId: ledgerInfo?.ledgerId,
          ledgerName: ledgerInfo?.ledgerName,
          cashClearingAccount: (payment.maturityDate && payment.maturityDate !== payment.paymentDate)
            ? (bank.pdcAccountCombination  || '')
            : (bank.cashAccountCombination || ''),
          accountingClass: (payment.maturityDate && payment.maturityDate !== payment.paymentDate) ? 'PDC' : 'CASH',
          appliedInvoices: relInvoices.map((inv: any) => ({
            invoiceNumber: inv.InvoiceNumber || '',
            invoiceId: inv.InvoiceId || 0,
            amountPaid: inv.AmountPaidInvoiceCurrency || inv.InvoicePaymentAmount || 0,
            liabilityDistribution: inv.LiabilityDistribution || '',
          })),
        });
        setAcctPostPayload(payloads);
        setStep(4, 'success', `${payloads.length} payload(s) built`);
      } catch (e: any) {
        setStep(4, 'error', e?.message ?? 'Build failed');
        setAcctResults([{ invoiceNumber: '—', status: 'ERROR', error: `Payload build failed: ${e?.message}` }]);
        return;
      }

      // Step 5: Post each journal
      setStep(5, 'running');
      const results: typeof acctResults = [];
      for (const payload of payloads) {
        const invNum = payload.header?.description?.split('Invoice ')[1] || payload.header?.description || '—';
        try {
          const result = await createAccounting(payload);
          results.push({ invoiceNumber: invNum, status: 'DRAFT', headerId: result.headerId });
        } catch (err: any) {
          results.push({ invoiceNumber: invNum, status: 'ERROR', error: err.message });
        }
      }
      const hasErrors = results.some(r => r.status === 'ERROR');
      setStep(5, hasErrors ? 'error' : 'success',
        hasErrors ? `${results.filter(r => r.status === 'ERROR').length} error(s)` : `${results.length} journal(s) created`
      );
      setAcctResults(results);
      fetchSlaStatus(); // refresh accounting status badge
    } catch (err: any) {
      setAcctResults([{ invoiceNumber: '—', status: 'ERROR', error: err.message }]);
    } finally {
      setAcctLoading(false);
    }
  };

  // Manual GET related invoices API
  const runGetRelatedInvoicesApi = async () => {
    setAcctGetRelRunning(true);
    try {
      const res = await fetch(`${APEX_DB_CONFIG.baseUrl}/ap/payments/${payment.checkId}/related-invoices`, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      setAcctGetRelResult(data);
    } catch (e: any) {
      setAcctGetRelResult({ error: e?.message ?? 'Network error' });
    } finally {
      setAcctGetRelRunning(false);
    }
  };

  // Manual POST journal API (runs first payload)
  const runPostJournalApi = async () => {
    if (!acctPostPayload.length) return;
    setAcctPostRunning(true);
    setAcctPostResult(null);
    try {
      const res = await fetch(`${APEX_DB_CONFIG.baseUrl}/sla/accounting/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(acctPostPayload[0]),
      });
      const data = await res.json();
      setAcctPostResult(data);
    } catch (e: any) {
      setAcctPostResult({ error: e?.message ?? 'Network error' });
    } finally {
      setAcctPostRunning(false);
    }
  };

  // Get status tag color
  const getStatusTag = (status: string) => {
    const colors: Record<string, string> = {
      'Cleared': REDWOOD.success,
      'Accounted': REDWOOD.success,
      'Negotiable': REDWOOD.info,
      'Voided': REDWOOD.error,
    };
    return <Tag color={colors[status] || 'default'}>{status}</Tag>;
  };

  // Helper to format amount in UAE format
  const formatAmount = (value: number): string => {
    return new Intl.NumberFormat('en-AE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Invoice columns for Paid Invoices tab
  const invoiceColumns: ColumnsType<RelatedInvoice> = [
    {
      title: 'Invoice Number',
      dataIndex: 'invoiceNumber',
      key: 'invoiceNumber',
      width: 200,
      ellipsis: true,
      render: (text: string) => (
        <a style={{ color: REDWOOD.info }}>{text}</a>
      ),
    },
    {
      title: 'Business Unit',
      dataIndex: 'invoiceBusinessUnit',
      key: 'invoiceBusinessUnit',
      width: 220,
      ellipsis: true,
    },
    {
      title: 'Installment',
      dataIndex: 'installmentNumber',
      key: 'installmentNumber',
      width: 90,
      align: 'center',
    },
    {
      title: 'Invoice Amount',
      dataIndex: 'invoiceAmount',
      key: 'invoiceAmount',
      width: 140,
      align: 'right',
      render: (value: number) => formatAmount(value),
    },
    {
      title: `Paid (${payment.paymentCurrency || 'AED'})`,
      dataIndex: 'amountPaidPaymentCurrency',
      key: 'amountPaidPaymentCurrency',
      width: 140,
      align: 'right',
      render: (value: number) => formatAmount(value),
    },
    {
      title: 'Paid (Inv Currency)',
      dataIndex: 'amountPaidInvoiceCurrency',
      key: 'amountPaidInvoiceCurrency',
      width: 140,
      align: 'right',
      render: (value: number) => formatAmount(value),
    },
    {
      title: 'Inv. Exch. Rate',
      dataIndex: 'invoiceExchangeRate',
      key: 'invoiceExchangeRate',
      width: 110,
      align: 'right',
      render: (_: number | null, record: RelatedInvoice) => {
        const rate = getInvRate(record);
        if (rate === 1) return <Text type="secondary">1.00000</Text>;
        return rate != null ? rate.toFixed(5) : <Text type="secondary">—</Text>;
      },
    },
    {
      title: 'Functional Amt (AED)',
      dataIndex: 'invoiceBaseAmount',
      key: 'invoiceBaseAmount',
      width: 150,
      align: 'right',
      render: (_: number, record: RelatedInvoice) => {
        const amt = getInvAccounted(record);
        return amt != null
          ? <Text strong>{formatAmount(amt)}</Text>
          : <Text type="secondary">— (rate unknown)</Text>;
      },
    },
    {
      title: 'Discount Taken',
      dataIndex: 'discountTaken',
      key: 'discountTaken',
      width: 120,
      align: 'right',
      render: (value: number) => formatAmount(value),
    },
    {
      title: 'Currency',
      dataIndex: 'invoiceCurrency',
      key: 'invoiceCurrency',
      width: 80,
      align: 'center',
    },
    {
      title: 'Status',
      dataIndex: 'invoicePaymentStatus',
      key: 'invoicePaymentStatus',
      width: 130,
      render: (status: string) => {
        const color = status === 'Fully paid' ? REDWOOD.success
          : status === 'Partially paid' ? REDWOOD.warning
          : 'default';
        return <Tag color={color}>{status}</Tag>;
      },
    },
  ];

  // Functional (AED) amount at invoice rate — use API pre-computed value, fallback to calculation
  const getInvAccounted = (inv: RelatedInvoice): number | null => {
    if (inv.invoiceFunctionalAmount != null) return inv.invoiceFunctionalAmount;
    if (inv.invoiceExchangeRate) return Math.round(inv.amountPaidInvoiceCurrency * inv.invoiceExchangeRate * 100) / 100;
    if (inv.invoiceCurrency === 'AED') return inv.invoiceAmount;
    return null;
  };
  // Functional (AED) amount at payment rate — use API pre-computed value, fallback to calculation
  const getPmtAccounted = (inv: RelatedInvoice): number => {
    if (inv.paymentFunctionalAmount != null) return inv.paymentFunctionalAmount;
    if (inv.crossCurrencyRate) return Math.round(inv.amountPaidPaymentCurrency * inv.crossCurrencyRate * 100) / 100;
    return Math.round(inv.amountPaidPaymentCurrency * (payment.conversionRate ?? 1) * 100) / 100;
  };
  // Invoice exchange rate display
  const getInvRate = (inv: RelatedInvoice): number | null => {
    if (inv.invoiceExchangeRate) return inv.invoiceExchangeRate;
    if (inv.invoiceCurrency === 'AED') return 1;
    return null;
  };

  // Calculate totals for invoices
  const invoiceTotals = relatedInvoices.reduce(
    (acc, inv) => {
      const invAmt = getInvAccounted(inv);
      return {
        invoiceAmount: acc.invoiceAmount + inv.invoiceAmount,
        amountPaid: acc.amountPaid + inv.amountPaidPaymentCurrency,
        amountPaidInv: acc.amountPaidInv + inv.amountPaidInvoiceCurrency,
        invoiceBaseAmount: invAmt != null ? acc.invoiceBaseAmount + invAmt : acc.invoiceBaseAmount,
        invoiceBaseKnown: acc.invoiceBaseKnown && invAmt != null,
        paymentBaseAmount: acc.paymentBaseAmount + getPmtAccounted(inv),
        discountTaken: acc.discountTaken + inv.discountTaken,
      };
    },
    { invoiceAmount: 0, amountPaid: 0, amountPaidInv: 0, invoiceBaseAmount: 0, invoiceBaseKnown: true, paymentBaseAmount: 0, discountTaken: 0 }
  );

  // Realized gain/loss — sum pre-computed values from API, fallback to totals difference
  const allHaveApiGainLoss = relatedInvoices.length > 0 && relatedInvoices.every(i => i.realizedGainLoss != null);
  const realizedGainLoss = allHaveApiGainLoss
    ? relatedInvoices.reduce((s, i) => s + (i.realizedGainLoss ?? 0), 0)
    : invoiceTotals.invoiceBaseKnown
      ? invoiceTotals.paymentBaseAmount - invoiceTotals.invoiceBaseAmount
      : null;

  // Payment Details Tab Content
  const PaymentDetailsTab = () => (
    <div style={{ padding: 16 }}>
      {/* Payee Section */}
      <Card
        title={<Text strong>Payee</Text>}
        size="small"
        style={{ marginBottom: 16, borderRadius: 8 }}
        styles={{ body: { padding: 16 } }}
      >
        <Row gutter={[48, 12]}>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 140, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Current Name">{payment.payee}</Descriptions.Item>
              <Descriptions.Item label="Payee Site">{payment.payeeSite}</Descriptions.Item>
              <Descriptions.Item label="Remit-to Address">{payment.remitToAddress}</Descriptions.Item>
              <Descriptions.Item label="Payment Function">Payables disbursements</Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 140, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Remit-to Account">{payment.remitToAccountNumber}</Descriptions.Item>
              <Descriptions.Item label="IBAN"></Descriptions.Item>
              <Descriptions.Item label="BIC"></Descriptions.Item>
              <Descriptions.Item label="Remit-to Bank Name"></Descriptions.Item>
              <Descriptions.Item label="Remit-to Branch Name"></Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>

      {/* Processing Details Section */}
      <Card
        title={<Text strong>Processing Details</Text>}
        size="small"
        style={{ marginBottom: 16, borderRadius: 8 }}
        styles={{ body: { padding: 16 } }}
      >
        <Row gutter={[48, 12]}>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 180, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Disbursement Bank Account">{payment.disbursementBankAccount}</Descriptions.Item>
              <Descriptions.Item label="Payment Method">{payment.paymentMethod}</Descriptions.Item>
              <Descriptions.Item label="Bill Payable">No</Descriptions.Item>
              <Descriptions.Item label="Payment Process Profile">{payment.paymentProcessProfile}</Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 200, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Payment Process Request">{payment.paymentProcessRequest}</Descriptions.Item>
              <Descriptions.Item label="Payment Document">{payment.paymentDocument}</Descriptions.Item>
              <Descriptions.Item label="Payment File Reference">{payment.paymentFileReference}</Descriptions.Item>
              <Descriptions.Item label="Reference Assigned by Administrator">{payment.paymentProcessRequest}</Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>

      {/* Currency Conversion Section */}
      <Card
        title={<Text strong>Currency Conversion</Text>}
        size="small"
        style={{ marginBottom: 16, borderRadius: 8 }}
        styles={{ body: { padding: 16 } }}
      >
        <Row gutter={[48, 12]}>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 180, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Payment Currency">
                {payment.paymentCurrency || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Conversion Rate Type">
                {payment.conversionRateType || (payment.paymentCurrency === 'AED' ? 'N/A – Functional' : '—')}
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 180, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Conversion Rate">
                {payment.paymentCurrency === 'AED'
                  ? <Text type="secondary">1 (functional)</Text>
                  : payment.conversionRate != null
                    ? <Text strong style={{ color: REDWOOD.info }}>{payment.conversionRate}</Text>
                    : <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Conversion Date">
                {payment.conversionDate ? formatDate(payment.conversionDate) : '—'}
              </Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>

      {/* General Information Section */}
      <Card
        title={<Text strong>General Information</Text>}
        size="small"
        style={{ borderRadius: 8 }}
        styles={{ body: { padding: 16 } }}
      >
        <Row gutter={[48, 12]}>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 160, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Payment Description"></Descriptions.Item>
              <Descriptions.Item label="Reference Number">{payment.paymentReference}</Descriptions.Item>
              <Descriptions.Item label="Trust Receipt Number">
                <Input size="small" style={{ width: 150 }} />
              </Descriptions.Item>
              <Descriptions.Item label="Trust Receipt Start Date">
                <DatePicker size="small" format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" />
              </Descriptions.Item>
              <Descriptions.Item label="Trust Receipt End Date">
                <DatePicker size="small" format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" />
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 160, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="TR Amount">
                <Input size="small" style={{ width: 150 }} />
              </Descriptions.Item>
              <Descriptions.Item label="TT Ref #">
                <Input size="small" style={{ width: 150 }} />
              </Descriptions.Item>
              <Descriptions.Item label="Context">
                <Select size="small" style={{ width: 150 }} placeholder="Select..." />
              </Descriptions.Item>
              <Descriptions.Item label="Regional Information">
                <Select size="small" style={{ width: 150 }} placeholder="Select..." />
              </Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>
    </div>
  );

  // Paid Invoices Tab Content
  const PaidInvoicesTab = () => (
    <div style={{ padding: 16 }}>
      <Card
        size="small"
        style={{ borderRadius: 8 }}
        styles={{ body: { padding: 0 } }}
      >
        {/* Toolbar */}
        <div style={{
          padding: '8px 16px',
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: REDWOOD.neutral100,
        }}>
          <Dropdown menu={{ items: [{ key: 'view', label: 'View' }] }} trigger={['click']}>
            <Button size="small">View <DownOutlined /></Button>
          </Dropdown>
          <Button size="small" icon={<FileTextOutlined />}>Reverse</Button>
          <Button size="small">Select and Add</Button>
          <Button size="small" icon={<ScissorOutlined />}>Detach</Button>
          <div style={{ flex: 1 }} />
          <Button
            size="small"
            icon={<ApiOutlined />}
            style={showRelatedInvoicesApi ? { background: REDWOOD.info, color: '#fff', borderColor: REDWOOD.info } : { color: REDWOOD.info, borderColor: REDWOOD.info }}
            onClick={() => setShowRelatedInvoicesApi(v => !v)}
          >
            API
          </Button>
        </div>
        {showRelatedInvoicesApi && (
          <div style={{ padding: '10px 16px', background: '#0d1117', borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
            <div style={{ marginBottom: 4 }}>
              <Text style={{ color: '#8b949e', fontSize: 11, fontFamily: 'monospace' }}>GET — Related Invoices</Text>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#58a6ff', wordBreak: 'break-all' }}>
              {`${APEX_RELATED_INVOICES_URL}/${payment.checkId}/related-invoices`}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { label: 'check_id', value: String(payment.checkId) },
              ].map(p => (
                <span key={p.label} style={{ fontFamily: 'monospace', fontSize: 11 }}>
                  <span style={{ color: '#8b949e' }}>{p.label}: </span>
                  <span style={{ color: '#79c0ff' }}>{p.value}</span>
                </span>
              ))}
              <span style={{ marginLeft: 'auto' }}>
                <Text style={{ color: '#3fb950', fontSize: 11 }}>✓ {relatedInvoices.length} row{relatedInvoices.length !== 1 ? 's' : ''} returned</Text>
              </span>
            </div>
          </div>
        )}

        <Table
          columns={invoiceColumns}
          dataSource={relatedInvoices}
          loading={loadingInvoices}
          pagination={false}
          size="small"
          bordered
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row style={{ background: REDWOOD.neutral100, fontWeight: 600 }}>
                <Table.Summary.Cell index={0} colSpan={3}>
                  <Text strong>Totals ({relatedInvoices.length} invoice{relatedInvoices.length !== 1 ? 's' : ''})</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  {formatAmount(invoiceTotals.invoiceAmount)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  {formatAmount(invoiceTotals.amountPaid)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  {formatAmount(invoiceTotals.amountPaidInv)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4}></Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right">
                  <Text strong>{formatAmount(invoiceTotals.invoiceBaseAmount)}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="right">
                  {formatAmount(invoiceTotals.discountTaken)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7} colSpan={2}></Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Card>
    </div>
  );

  // History Tab Content
  const HistoryTab = () => (
    <div style={{ padding: 16 }}>
      {/* Validations Section */}
      <Card
        title={<Text strong>Validations</Text>}
        size="small"
        style={{ marginBottom: 16, borderRadius: 8 }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          columns={[
            { title: 'Error Message', dataIndex: 'errorMessage', key: 'errorMessage' },
            { title: 'Validation', dataIndex: 'validation', key: 'validation' },
            { title: 'Error Status', dataIndex: 'errorStatus', key: 'errorStatus' },
            { title: 'Fail Date', dataIndex: 'failDate', key: 'failDate' },
            { title: 'Pass Date', dataIndex: 'passDate', key: 'passDate' },
          ]}
          dataSource={[]}
          pagination={false}
          size="small"
          locale={{ emptyText: 'No data to display.' }}
        />
      </Card>

      {/* Clearing Section */}
      <Card
        title={<Text strong>Clearing</Text>}
        size="small"
        style={{ borderRadius: 8 }}
        styles={{ body: { padding: 16 } }}
      >
        <Row gutter={[48, 12]}>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 120, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Amount">
                {payment.clearingAmount?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || ''}
              </Descriptions.Item>
              <Descriptions.Item label="Date">
                {formatDate(payment.clearingDate)}
              </Descriptions.Item>
              <Descriptions.Item label="Ledger Amount">
                {payment.clearingLedgerAmount?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || ''}
              </Descriptions.Item>
              <Descriptions.Item label="Value Date">
                {formatDate(payment.clearingValueDate)}
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 160, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Conversion Rate">
                {payment.clearingConversionRate || ''}
              </Descriptions.Item>
              <Descriptions.Item label="Conversion Date">
                {formatDate(payment.clearingConversionDate)}
              </Descriptions.Item>
              <Descriptions.Item label="Conversion Rate Type">
                {payment.clearingConversionRateType || ''}
              </Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>
    </div>
  );

  // Other Tab Content
  const OtherTab = () => (
    <div style={{ padding: 16 }}>
      {/* Bank Instructions Section */}
      <Card
        title={<Text strong>Bank Instructions</Text>}
        size="small"
        style={{ marginBottom: 16, borderRadius: 8 }}
        styles={{ body: { padding: 16 } }}
      >
        <Row gutter={[48, 12]}>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 160, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Bank Instruction 1"></Descriptions.Item>
              <Descriptions.Item label="Bank Instruction 2"></Descriptions.Item>
              <Descriptions.Item label="Bank Instruction Details"></Descriptions.Item>
              <Descriptions.Item label="Delivery Channel"></Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 180, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Payment Text Message 1"></Descriptions.Item>
              <Descriptions.Item label="Payment Text Message 2"></Descriptions.Item>
              <Descriptions.Item label="Payment Text Message 3"></Descriptions.Item>
              <Descriptions.Item label="Settlement Priority Override"></Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>

      {/* Remittance Section */}
      <Card
        title={<Text strong>Remittance</Text>}
        size="small"
        style={{ marginBottom: 16, borderRadius: 8 }}
        styles={{ body: { padding: 16 } }}
      >
        <Row gutter={[48, 12]}>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 160, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Remittance Message 1"></Descriptions.Item>
              <Descriptions.Item label="Remittance Message 2"></Descriptions.Item>
              <Descriptions.Item label="Remittance Message 3"></Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 220, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Unique Remittance Identifier"></Descriptions.Item>
              <Descriptions.Item label="Unique Remittance Identifier Check Digit"></Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>

      {/* Regulatory Reporting Section */}
      <Card
        title={<Text strong>Regulatory Reporting</Text>}
        size="small"
        style={{ marginBottom: 16, borderRadius: 8 }}
        styles={{ body: { padding: 16 } }}
      >
        <Row gutter={[48, 12]}>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 140, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Payment Reported"></Descriptions.Item>
              <Descriptions.Item label="Reported Amount"></Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 100, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Format"></Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>

      {/* Sequencing Section */}
      <Card
        title={<Text strong>Sequencing</Text>}
        size="small"
        style={{ borderRadius: 8 }}
        styles={{ body: { padding: 16 } }}
      >
        <Row gutter={[48, 12]}>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 140, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Document Category">{payment.documentCategory}</Descriptions.Item>
              <Descriptions.Item label="Document Sequence">{payment.documentSequence}</Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 120, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Voucher Number">{payment.voucherNumber}</Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>
    </div>
  );

  // Tab items
  const tabItems = [
    { key: 'paymentDetails', label: 'Payment Details', children: <PaymentDetailsTab /> },
    { key: 'paidInvoices', label: 'Paid Invoices', children: <PaidInvoicesTab /> },
    { key: 'history', label: 'History', children: <HistoryTab /> },
    { key: 'other', label: 'Other', children: <OtherTab /> },
  ];

  return (
    <div style={{ background: REDWOOD.neutral100, minHeight: '100%' }}>
      {/* Payment Header */}
      <Card
        style={{
          margin: 16,
          borderRadius: 8,
          border: `1px solid ${REDWOOD.neutral200}`,
        }}
        styles={{ body: { padding: 16 } }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 16,
        }}>
          <Title level={4} style={{ margin: 0 }}>
            Payment: {payment.paymentNumber}
          </Title>
          <Space>
            <Dropdown menu={{ items: actionsMenuItems, onClick: handleActionsClick }} trigger={['click']}>
              <Button>Actions <DownOutlined /></Button>
            </Dropdown>
            {getAccountingStatusDisplay()}
            {slaStatus?.accountingStatus !== 'POSTED' && (
              <Tooltip title="Create accounting entries in DRAFT">
                <Button
                  icon={<AccountBookOutlined />}
                  onClick={handleCreateAccounting}
                >
                  {slaStatus?.accountingStatus === 'DRAFT' ? 'Re-create Accounting' : 'Create Accounting'}
                </Button>
              </Tooltip>
            )}
            {slaStatus?.exists && slaStatus.accountingStatus === 'DRAFT' && (
              <Tooltip title="Post accounting to General Ledger and lock">
                <Button
                  icon={<SendOutlined />}
                  loading={slaActionLoading}
                  style={{ borderColor: REDWOOD.info, color: REDWOOD.info }}
                  onClick={handlePostToLedgerOpen}
                >
                  Post Accounting
                </Button>
              </Tooltip>
            )}
            {slaStatus?.exists && (
              <Tooltip title="View accounting journal entries">
                <Button icon={<FormOutlined />} onClick={handleViewAccounting}>
                  View Account
                </Button>
              </Tooltip>
            )}
            {slaStatus?.exists && !isVoided && (
              <Tooltip title="Preview what the void reversal accounting will look like">
                <Button
                  icon={<EyeOutlined />}
                  style={{ borderColor: REDWOOD.warning, color: REDWOOD.warning }}
                  onClick={handlePreviewVoidAccounting}
                >
                  Preview Void
                </Button>
              </Tooltip>
            )}
            {payment.paymentCurrency && payment.paymentCurrency !== 'AED' && (
              <Tooltip title="View realized exchange gain or loss on this payment">
                <Button
                  icon={<span style={{ fontWeight: 700, marginRight: 4 }}>±</span>}
                  onClick={() => { setActiveTab('paidInvoices'); setGlModalOpen(true); }}
                >
                  Exchange Gain/Loss
                </Button>
              </Tooltip>
            )}
            <Button icon={<PrinterOutlined />} onClick={generateVoucherPdf}>
              Print Voucher
            </Button>
            <Button type="primary" style={{ background: REDWOOD.primary }} onClick={onClose}>
              Done
            </Button>
          </Space>
        </div>

        {/* Header Info Grid */}
        <Row gutter={[48, 8]}>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 140, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Business Unit">{payment.businessUnit}</Descriptions.Item>
              <Descriptions.Item label="Legal Entity">{payment.legalEntity}</Descriptions.Item>
              <Descriptions.Item label="Payee">{payment.payee}</Descriptions.Item>
              <Descriptions.Item label="Payment Date">{payment.paymentDate}</Descriptions.Item>
              <Descriptions.Item label="Status">{getStatusTag(payment.paymentStatus)}</Descriptions.Item>
              {payment.maturityDate && (
                <Descriptions.Item label="Maturity Date">
                  {(() => {
                    const isPdc = payment.maturityDate !== payment.paymentDate;
                    return (
                      <span style={{
                        fontWeight: isPdc ? 700 : undefined,
                        color: isPdc ? REDWOOD.warning : undefined,
                        padding: isPdc ? '1px 6px' : undefined,
                        background: isPdc ? '#FFF8E0' : undefined,
                        borderRadius: isPdc ? 4 : undefined,
                        border: isPdc ? `1px solid ${REDWOOD.warning}` : undefined,
                      }}>
                        {formatDate(payment.maturityDate)}
                        {isPdc && <span style={{ marginLeft: 6, fontSize: 11 }}>PDC</span>}
                      </span>
                    );
                  })()}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Accounting Status">{getStatusTag(payment.accountingStatus)}</Descriptions.Item>
              <Descriptions.Item label="Reconciled">
                <span style={{ color: payment.reconciled ? REDWOOD.success : REDWOOD.neutral600 }}>
                  {payment.reconciled ? 'Yes' : 'No'}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Type">{payment.paymentType}</Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 140, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Payment Amount">
                <Text strong style={{ color: REDWOOD.info }}>
                  {payment.paymentAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Text>
                <br />
                <Text type="secondary">{payment.paymentCurrency}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Withheld Amount">
                {payment.withheldAmount?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
                <br />
                <Text type="secondary">{payment.paymentCurrency}</Text>
              </Descriptions.Item>
              {payment.paymentCurrency && payment.paymentCurrency !== 'AED' && (
                <Descriptions.Item label="Conv. Rate">
                  {payment.conversionRate != null
                    ? <><Text strong>{payment.conversionRate}</Text><Text type="secondary"> ({payment.conversionRateType || 'User'})</Text></>
                    : <Text type="secondary">—</Text>}
                </Descriptions.Item>
              )}
              {payment.paymentCurrency && payment.paymentCurrency !== 'AED' && (
                <Descriptions.Item label="Conv. Date">
                  {payment.conversionDate ? formatDate(payment.conversionDate) : '—'}
                </Descriptions.Item>
              )}
              {payment.stopDate ? (
                <Descriptions.Item label="Stop Date">
                  <Text type="warning">{formatDate(payment.stopDate)}</Text>
                </Descriptions.Item>
              ) : null}
              {payment.voidDate ? (
                <Descriptions.Item label="Void Date">
                  <Tag color="red">{formatDate(payment.voidDate)}</Tag>
                </Descriptions.Item>
              ) : null}
              {payment.voidAccountingDate ? (
                <Descriptions.Item label="Void Acct. Date">
                  <Text type="secondary">{formatDate(payment.voidAccountingDate)}</Text>
                </Descriptions.Item>
              ) : null}
              {payment.stopReason ? (
                <Descriptions.Item label="Void Reason" span={2}>
                  <Text type="secondary">{payment.stopReason}</Text>
                </Descriptions.Item>
              ) : null}
              <Descriptions.Item label="Attachments">
                <a style={{ color: REDWOOD.info }}>None +</a>
              </Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>

        {/* Reference Fields Row */}
        <Row gutter={[32, 0]} style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${REDWOOD.neutral200}` }}>
          <Col span={5}>
            <Descriptions column={1} size="small" labelStyle={{ width: 120, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Check ID">
                <Text code style={{ fontSize: 12 }}>{payment.checkId}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Payment Number">
                <Text strong>{payment.paymentNumber}</Text>
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={5}>
            <Descriptions column={1} size="small" labelStyle={{ width: 120, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Payment Reference">
                {payment.paymentReference || <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Voucher Number">
                {payment.voucherNumber || <Text type="secondary">—</Text>}
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={6}>
            <Descriptions column={1} size="small" labelStyle={{ width: 120, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Created By">
                {payment.createdBy || <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Creation Date">
                {payment.creationDate || <Text type="secondary">—</Text>}
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={8}>
            <Descriptions column={1} size="small" labelStyle={{ width: 90, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Description">
                {payment.paymentDescription || payment.paymentProcessRequest || <Text type="secondary">—</Text>}
              </Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>

      {/* Detail Tabs */}
      <Card
        style={{
          margin: '0 16px 16px 16px',
          borderRadius: 8,
          border: `1px solid ${REDWOOD.neutral200}`,
        }}
        styles={{ body: { padding: 0 } }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          tabBarStyle={{
            padding: '0 16px',
            background: REDWOOD.surface,
            borderBottom: `1px solid ${REDWOOD.neutral200}`,
            marginBottom: 0,
          }}
        />
      </Card>

      {/* ── Void Payment Modal ──────────────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <StopOutlined style={{ color: REDWOOD.error }} />
            <span>Void Payment</span>
            <Tag color="red" style={{ marginLeft: 4 }}>{payment.paymentNumber}</Tag>
          </Space>
        }
        open={voidModalOpen}
        onCancel={() => { if (!voidRunning) { setVoidModalOpen(false); voidForm.resetFields(); } }}
        footer={null}
        width={760}
        destroyOnClose
        styles={{ body: { maxHeight: '85vh', overflowY: 'auto' } }}
      >
        <Form form={voidForm} layout="vertical" onFinish={handleVoidAuto} size="small">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="Payment Number">
                <Input value={payment.paymentNumber?.toString() ?? ''} readOnly style={{ background: '#f5f5f5' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Amount">
                <Input value={`${payment.paymentAmount.toLocaleString('en-AE', { minimumFractionDigits: 2 })} ${payment.paymentCurrency}`} readOnly style={{ background: '#f5f5f5', fontWeight: 500 }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={<><span style={{ color: REDWOOD.primary }}>*</span> Void Date</>} name="voidDate" rules={[{ required: true, message: 'Required' }]}>
                <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" disabled={voidRunning} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Void Reason" name="voidReason" style={{ marginBottom: 12 }}>
            <Input placeholder="Optional" disabled={voidRunning} />
          </Form.Item>

          {/* Related Invoices */}
          <Table size="small" loading={loadingInvoices} dataSource={relatedInvoices} rowKey="key"
            pagination={false} scroll={{ y: 100 }} style={{ marginBottom: 14 }}
            locale={{ emptyText: 'No related invoices' }}
            columns={[
              { title: 'Invoice #', dataIndex: 'invoiceNumber', key: 'invoiceNumber', ellipsis: true },
              { title: 'Installment', dataIndex: 'installmentNumber', key: 'installmentNumber', width: 90, align: 'center' as const, render: (v: any) => v || '—' },
              { title: 'Amt Paid', dataIndex: 'amountPaidPaymentCurrency', key: 'amountPaidPaymentCurrency', align: 'right' as const, render: (v: number) => v?.toLocaleString('en-AE', { minimumFractionDigits: 2 }) ?? '—' },
              { title: 'Liability Account', dataIndex: 'liabilityDistribution', key: 'liabilityDistribution', ellipsis: true },
            ]}
          />

          {/* ── 6 Step Progress Cards (auto-run) ─────────────────────────── */}
          {(() => {
            const STEPS: { key: VoidStepKey; step: number; method: string; methodColor: string; label: string; url: string }[] = [
              { key: 'eligibility', step: 1, method: 'GET',  methodColor: 'blue',   label: 'Check Void Eligibility',       url: `${APEX_DB_CONFIG.baseUrl}/ap/payments/${payment.checkId}/void-eligibility` },
              { key: 'void',        step: 2, method: 'PUT',  methodColor: 'orange', label: 'Void Payment',                 url: `${APEX_DB_CONFIG.baseUrl}/ap/payments/void` },
              { key: 'sla',         step: 3, method: 'POST', methodColor: 'green',  label: 'Create SLA Reversal Accounting', url: `${APEX_DB_CONFIG.baseUrl}/sla/accounting/create` },
              { key: 'gl_create',   step: 4, method: 'POST', methodColor: 'green',  label: 'Create GL Journal',             url: `${APEX_DB_CONFIG.baseUrl}/journals/create` },
              { key: 'gl_post',     step: 5, method: 'PUT',  methodColor: 'orange', label: 'Post GL Journal',               url: `${APEX_DB_CONFIG.baseUrl}/gl/journals/:batchId/post` },
              { key: 'sla_stamp',   step: 6, method: 'POST', methodColor: 'green',  label: 'Stamp SLA as POSTED',           url: `${APEX_DB_CONFIG.baseUrl}/sla/accounting/post` },
            ];
            return STEPS.map(s => {
              const st = voidStepMap[s.key];
              const borderColor = st.status === 'success' ? '#52c41a' : st.status === 'error' ? '#ff4d4f' : st.status === 'running' ? '#1677ff' : undefined;
              const statusIcon = st.status === 'running' ? <LoadingOutlined style={{ color: '#1677ff' }} spin />
                : st.status === 'success' ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
                : st.status === 'error'   ? <CloseCircleOutlined style={{ color: '#ff4d4f' }} /> : null;
              return (
                <Card key={s.key} size="small" style={{ marginBottom: 6, borderColor }}
                  title={
                    <Space size={4}>
                      <Tag color={s.methodColor} style={{ minWidth: 44, textAlign: 'center', margin: 0 }}>{s.method}</Tag>
                      <Text strong style={{ fontSize: 12 }}>Step {s.step}: {s.label}</Text>
                      {statusIcon}
                    </Space>
                  }
                >
                  <code style={{ fontSize: 10, background: '#f0f0f0', padding: '2px 6px', borderRadius: 3, display: 'block', wordBreak: 'break-all', marginBottom: st.response || st.error ? 6 : 0 }}>{s.url}</code>
                  {st.error && <Alert type="error" message={st.error} style={{ marginTop: 6, fontSize: 11 }} showIcon />}
                  {st.response && (
                    <pre style={{ fontSize: 10, background: '#1e1e1e', color: st.status === 'error' ? '#f48771' : '#b5cea8', padding: 6, borderRadius: 4, margin: '4px 0 0', maxHeight: 80, overflowY: 'auto' }}>
                      {JSON.stringify(st.response, null, 2)}
                    </pre>
                  )}
                </Card>
              );
            });
          })()}

          {/* Done confirmation */}
          {voidDone && (
            <Alert type="success" showIcon icon={<CheckCircleOutlined />}
              message="Void Complete"
              description="Payment voided — SLA reversal accounting created and posted to GL successfully."
              style={{ marginTop: 8 }}
            />
          )}

          {/* Footer buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <Button disabled={voidRunning} onClick={() => { setVoidModalOpen(false); voidForm.resetFields(); }}>
              Close
            </Button>
            <Button type="primary" danger htmlType="submit" loading={voidRunning}
              icon={<StopOutlined />} disabled={isVoided || isCleared || voidDone}
            >
              {voidRunning ? 'Processing…' : voidDone ? 'Voided ✓' : 'Void Payment'}
            </Button>
          </div>
        </Form>
      </Modal>
      {/* ─────────────────────────────────────────────────────────────────── */}


      {/* ── Create Accounting Modal ──────────────────────────────────────── */}
      <Modal
        open={acctModalOpen}
        onCancel={() => { setAcctModalOpen(false); setShowAcctApiSection(false); }}
        title={
          <Space>
            <AccountBookOutlined style={{ color: REDWOOD.info }} />
            <span>Create Accounting — Payment {payment.paymentNumber || payment.checkId}</span>
            <Tooltip title={showAcctApiSection ? 'Hide APIs' : 'Show API calls'}>
              <Button
                size="small"
                type={showAcctApiSection ? 'primary' : 'text'}
                icon={<ApiOutlined style={{ color: showAcctApiSection ? '#fff' : REDWOOD.info }} />}
                onClick={() => setShowAcctApiSection(v => !v)}
                style={{ marginLeft: 4 }}
              />
            </Tooltip>
          </Space>
        }
        footer={
          <Space>
            <Button
              onClick={handleCreateAccounting}
              disabled={acctLoading}
              icon={<PlayCircleOutlined />}
            >
              Run Again
            </Button>
            <Button onClick={() => { setAcctModalOpen(false); setShowAcctApiSection(false); }}>Close</Button>
          </Space>
        }
        width={showAcctApiSection ? 960 : 640}
      >
        <div style={{ display: 'flex', gap: 16 }}>
          {/* Left: Steps + Results */}
          <div style={{ flex: 1 }}>
            {/* Step Status Panel */}
            {acctStepStatus.length > 0 && (
              <div style={{ marginBottom: 14, background: '#fafafa', border: `1px solid ${REDWOOD.neutral200}`, borderRadius: 6, padding: '10px 14px' }}>
                {acctStepStatus.map(s => {
                  const icon =
                    s.status === 'running' ? <LoadingOutlined style={{ color: REDWOOD.info }} spin /> :
                    s.status === 'success' ? <CheckCircleOutlined style={{ color: REDWOOD.success }} /> :
                    s.status === 'error'   ? <CloseCircleOutlined style={{ color: REDWOOD.error }} /> :
                    <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', background: '#d9d9d9', verticalAlign: 'middle' }} />;
                  const textColor =
                    s.status === 'success' ? REDWOOD.success :
                    s.status === 'error'   ? REDWOOD.error   :
                    s.status === 'running' ? REDWOOD.info    : '#6B6B6B';
                  return (
                    <div key={s.step} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                      <span style={{ marginTop: 2 }}>{icon}</span>
                      <div>
                        <Text style={{ fontSize: 12, color: textColor }}>
                          <strong>Step {s.step}:</strong> {s.label}
                        </Text>
                        {s.detail && <div><Text type="secondary" style={{ fontSize: 11 }}>{s.detail}</Text></div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Loading indicator */}
            {acctLoading && (
              <div style={{ textAlign: 'center', padding: '8px 0 12px' }}>
                <LoadingOutlined style={{ fontSize: 20, color: REDWOOD.info }} />
                <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>Running…</Text>
              </div>
            )}

            {/* Results table */}
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Results</Text>
            <Table
              size="small"
              pagination={false}
              dataSource={acctResults.map((r, i) => ({ ...r, key: i }))}
              locale={{ emptyText: acctLoading ? 'Running…' : 'No results yet — click the button to create accounting' }}
              columns={[
                { title: 'Invoice', dataIndex: 'invoiceNumber', key: 'invoiceNumber', width: 160, ellipsis: true },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  key: 'status',
                  width: 120,
                  render: (v: string) => (
                    <Tag color={v === 'DRAFT' ? 'blue' : v === 'ALREADY POSTED' ? 'green' : 'red'}>{v}</Tag>
                  ),
                },
                {
                  title: 'Header ID',
                  dataIndex: 'headerId',
                  key: 'headerId',
                  width: 90,
                  render: (v?: number) => v ?? '—',
                },
                {
                  title: 'Error',
                  dataIndex: 'error',
                  key: 'error',
                  render: (v?: string) => v ? <span style={{ color: 'red', fontSize: 11 }}>{v}</span> : '—',
                },
              ]}
            />
          </div>

            {/* Right: API Panel */}
            {showAcctApiSection && (
              <div style={{ width: 380, borderLeft: `1px solid ${REDWOOD.neutral200}`, paddingLeft: 16 }}>
                <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>API Calls</Text>

                {/* GET related invoices */}
                <div style={{ border: '1px solid #d9d9d9', borderRadius: 6, padding: '10px 12px', marginBottom: 10, background: '#fafafa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Space size={6}>
                      <Tag color="blue" style={{ margin: 0 }}>GET</Tag>
                      <Text strong style={{ fontSize: 12 }}>Related Invoices</Text>
                    </Space>
                    <Button
                      size="small"
                      type="primary"
                      icon={acctGetRelRunning ? <LoadingOutlined spin /> : <PlayCircleOutlined />}
                      loading={acctGetRelRunning}
                      onClick={runGetRelatedInvoicesApi}
                    >
                      Run
                    </Button>
                  </div>
                  <code style={{ fontSize: 11, background: '#e3f2fd', padding: '3px 8px', borderRadius: 4, display: 'block', wordBreak: 'break-all', marginBottom: 6 }}>
                    {APEX_DB_CONFIG.baseUrl}/ap/payments/{payment.checkId}/related-invoices
                  </code>
                  {acctGetRelResult && (
                    <pre style={{ fontSize: 10, background: '#1e1e1e', color: '#d4d4d4', padding: 8, borderRadius: 4, maxHeight: 160, overflowY: 'auto', margin: 0 }}>
                      {JSON.stringify(acctGetRelResult, null, 2)}
                    </pre>
                  )}
                </div>

                {/* POST create accounting */}
                <div style={{ border: '1px solid #d9d9d9', borderRadius: 6, padding: '10px 12px', background: '#fafafa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Space size={6}>
                      <Tag color="green" style={{ margin: 0 }}>POST</Tag>
                      <Text strong style={{ fontSize: 12 }}>Create Journal</Text>
                    </Space>
                    <Button
                      size="small"
                      type="primary"
                      icon={acctPostRunning ? <LoadingOutlined spin /> : <PlayCircleOutlined />}
                      loading={acctPostRunning}
                      disabled={!acctPostPayload.length}
                      onClick={runPostJournalApi}
                    >
                      Run
                    </Button>
                  </div>
                  <code style={{ fontSize: 11, background: '#e8f5e9', padding: '3px 8px', borderRadius: 4, display: 'block', wordBreak: 'break-all', marginBottom: 6 }}>
                    {APEX_DB_CONFIG.baseUrl}/sla/accounting/create
                  </code>
                  {acctPostPayload.length > 0 && (
                    <>
                      <Text type="secondary" style={{ fontSize: 11 }}>Request body (payload 1 of {acctPostPayload.length}):</Text>
                      <pre style={{ fontSize: 10, background: '#1e1e1e', color: '#d4d4d4', padding: 8, borderRadius: 4, maxHeight: 140, overflowY: 'auto', margin: '4px 0' }}>
                        {JSON.stringify(acctPostPayload[0], null, 2)}
                      </pre>
                    </>
                  )}
                  {!acctPostPayload.length && (
                    <Text type="secondary" style={{ fontSize: 11 }}>Run Create Accounting first to build payload</Text>
                  )}
                  {acctPostResult && (
                    <>
                      <Text type="secondary" style={{ fontSize: 11 }}>Response:</Text>
                      <pre style={{ fontSize: 10, background: '#1e1e1e', color: '#d4d4d4', padding: 8, borderRadius: 4, margin: '4px 0 0', maxHeight: 120, overflowY: 'auto' }}>
                        {JSON.stringify(acctPostResult, null, 2)}
                      </pre>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
      </Modal>
      {/* ─────────────────────────────────────────────────────────────────── */}

      {/* Custom styles */}
      <style>{`
        .ant-descriptions-item-label {
          font-size: 12px !important;
        }
        .ant-descriptions-item-content {
          font-size: 12px !important;
        }
        .ant-table-thead > tr > th {
          background: ${REDWOOD.neutral100} !important;
          font-weight: 600;
          font-size: 12px;
          padding: 8px 12px !important;
        }
        .ant-table-tbody > tr > td {
          font-size: 12px;
          padding: 8px 12px !important;
        }
        .ant-tabs-tab {
          font-size: 13px;
        }
      `}</style>

      {/* Post to Ledger Modal */}
      <Modal
        title={`Post to Ledger — Payment ${payment.paymentNumber} (SLA Header ${postModalHeadId})`}
        open={postModalOpen}
        onOk={handlePostToLedgerConfirm}
        onCancel={() => { setPostModalOpen(false); setPostGLResult(null); }}
        confirmLoading={slaActionLoading}
        okText="Post to GL"
        okButtonProps={{ type: 'primary', disabled: !postGLPayload || postGLFetchingLines || !!postGLResult?.success }}
        width={740}
      >
        {/* SLA Lines API row — always visible so user can inspect */}
        {postGLLinesUrl && (
          <div style={{ marginBottom: 10, padding: '6px 10px', background: REDWOOD.neutral100, borderRadius: 6, border: `1px solid ${REDWOOD.neutral200}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Tag color="green" style={{ fontSize: 11, margin: 0 }}>GET</Tag>
            <code style={{ fontSize: 11, flex: 1, wordBreak: 'break-all', color: REDWOOD.neutral900 }}>{postGLLinesUrl}</code>
            <Button
              size="small"
              icon={<ApiOutlined />}
              onClick={() => window.open(postGLLinesUrl, '_blank')}
              style={{ fontSize: 11, flexShrink: 0 }}
            >
              Open
            </Button>
            {postGLRawCount > 0 && (
              <span style={{ fontSize: 11, color: REDWOOD.neutral600, flexShrink: 0 }}>
                {postGLRawCount} raw lines → {postGLPayload?.lines?.length ?? 0} for header {postModalHeadId}
              </span>
            )}
          </div>
        )}

        {postGLFetchingLines ? (
          <div style={{ textAlign: 'center', padding: 32 }}><Spin tip="Loading SLA lines…" /></div>
        ) : postGLResult ? (
          <Alert
            type={postGLResult.success ? 'success' : 'error'}
            message={postGLResult.success ? 'Posted to GL successfully' : 'Post failed'}
            description={
              <pre style={{ fontSize: 11, margin: 0, whiteSpace: 'pre-wrap' }}>
                {postGLResult.success ? JSON.stringify(postGLResult.data, null, 2) : postGLResult.error}
              </pre>
            }
          />
        ) : postGLPayload ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            {postGLPayload.lines?.length === 0 && (
              <Alert type="warning" message={`No SLA lines found for header ${postModalHeadId}. The backend may be ignoring the headerId filter — check the GET endpoint above.`} />
            )}
            <div style={{ color: REDWOOD.warning, fontSize: 12 }}>
              ⚠ Once posted, the accounting entry will be locked and cannot be modified.
            </div>
            {/* Step 1 payload */}
            <div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>POST</Tag>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.neutral900 }}>
                  {`${APEX_DB_CONFIG.baseUrl}/journals/create`}
                </span>
              </div>
              <pre style={{
                fontSize: 11, background: REDWOOD.neutral100,
                border: `1px solid ${REDWOOD.neutral200}`, borderRadius: 4,
                padding: '8px 10px', margin: 0, color: REDWOOD.neutral900,
                maxHeight: 360, overflowY: 'auto',
              }}>
                {JSON.stringify(postGLPayload, null, 2)}
              </pre>
            </div>
            {/* Step 2 note */}
            <div style={{ fontSize: 11, color: REDWOOD.neutral600 }}>
              <ApiOutlined /> Step 2 (auto): <Tag color="blue" style={{ fontSize: 10 }}>POST</Tag>
              <code style={{ fontSize: 11 }}>{`${APEX_DB_CONFIG.baseUrl}/sla/accounting/post`}</code>
              {' '}— stamps returned GL IDs back on SLA header
            </div>
          </Space>
        ) : null}
      </Modal>

      {/* View Accounting Modal */}
      <Modal
        title={`Accounting Entries — Payment ${payment.paymentNumber}`}
        open={viewAcctOpen}
        onCancel={() => setViewAcctOpen(false)}
        footer={
          viewAcctData?.found && viewAcctData.accountingStatus === 'DRAFT' ? (
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={slaActionLoading}
              onClick={() => { setViewAcctOpen(false); handlePostToLedgerOpen(); }}
            >
              Post Accounting
            </Button>
          ) : null
        }
        width={960}
      >
        {viewAcctLoading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
        ) : viewAcctData?.found ? (() => {
          const acctLineColumns = [
            { title: '#', dataIndex: 'lineNumber', width: 40 },
            { title: 'Type', dataIndex: 'lineType', width: 50, render: (v: string) => <Tag color={v === 'DR' ? 'blue' : 'green'}>{v}</Tag> },
            { title: 'Class', dataIndex: 'accountingClass', width: 120 },
            { title: 'Account', dataIndex: 'accountCombination', width: 200, render: (v: string, r: any) => {
              const desc = r.accountDescription || r.AccountDescription || r.account_description || r.glAccountDescription || '';
              return (
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{v || '—'}</span>
                  {desc && <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{desc}</div>}
                </div>
              );
            }},
            { title: 'Description', dataIndex: 'description', ellipsis: true },
            { title: 'Ent. Dr',  dataIndex: 'enteredDr',   width: 105, align: 'right' as const, render: (v: number) => v ? v.toLocaleString('en-US', { minimumFractionDigits: 2 }) : <span style={{ color: '#bbb' }}>—</span> },
            { title: 'Ent. Cr',  dataIndex: 'enteredCr',   width: 105, align: 'right' as const, render: (v: number) => v ? v.toLocaleString('en-US', { minimumFractionDigits: 2 }) : <span style={{ color: '#bbb' }}>—</span> },
            { title: 'Acc. Dr',  dataIndex: 'accountedDr', width: 105, align: 'right' as const, render: (v: number) => v ? v.toLocaleString('en-US', { minimumFractionDigits: 2 }) : <span style={{ color: '#bbb' }}>—</span> },
            { title: 'Acc. Cr',  dataIndex: 'accountedCr', width: 105, align: 'right' as const, render: (v: number) => v ? v.toLocaleString('en-US', { minimumFractionDigits: 2 }) : <span style={{ color: '#bbb' }}>—</span> },
            { title: 'CCY', dataIndex: 'currencyCode', width: 55 },
          ];
          const isVoid     = (code: string) => code?.includes('VOID') || code?.includes('void');
          const eventLabel = (code: string) =>
            isVoid(code) ? 'Void Reversal' : code?.includes('PAYMENT') ? 'Payment Accounting' : code || 'Accounting';

          if (viewAcctAllEvents.length > 0) {
            return (
              <Collapse
                defaultActiveKey={viewAcctAllEvents.map(e => String(e.headerId))}
                style={{ background: 'transparent' }}
                items={viewAcctAllEvents.map(event => ({
                  key: String(event.headerId),
                  label: (
                    <Space>
                      <Tag color={isVoid(event.eventTypeCode) ? 'orange' : 'blue'} style={{ fontWeight: 600 }}>
                        {eventLabel(event.eventTypeCode)}
                      </Tag>
                      <Tag color={event.accountingStatus === 'POSTED' ? 'green' : event.accountingStatus === 'DRAFT' ? 'blue' : 'default'}>
                        {event.accountingStatus}
                      </Tag>
                      <span style={{ fontSize: 12, color: '#888' }}>{event.accountingDate}</span>
                      <span style={{ fontSize: 12, color: '#999' }}>Header #{event.headerId}</span>
                      {event.description ? <span style={{ fontSize: 11, color: '#aaa' }}>{event.description}</span> : null}
                    </Space>
                  ),
                  children: (
                    <Table
                      size="small"
                      pagination={false}
                      dataSource={event.lines.map((l: any, i: number) => ({ ...l, key: i }))}
                      columns={acctLineColumns}
                      summary={(rows) => {
                        const tDr = rows.reduce((s, r) => s + (r.enteredDr || 0), 0);
                        const tCr = rows.reduce((s, r) => s + (r.enteredCr || 0), 0);
                        return (
                          <Table.Summary.Row style={{ fontWeight: 600, background: '#fafafa' }}>
                            <Table.Summary.Cell index={0} colSpan={5} align="right">Total</Table.Summary.Cell>
                            <Table.Summary.Cell index={1} align="right">{tDr ? tDr.toLocaleString('en-US', { minimumFractionDigits: 2 }) : ''}</Table.Summary.Cell>
                            <Table.Summary.Cell index={2} align="right">{tCr ? tCr.toLocaleString('en-US', { minimumFractionDigits: 2 }) : ''}</Table.Summary.Cell>
                            <Table.Summary.Cell index={3} colSpan={3} />
                          </Table.Summary.Row>
                        );
                      }}
                    />
                  ),
                }))}
              />
            );
          }

          return (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Descriptions size="small" column={3} bordered>
                <Descriptions.Item label="Header ID">{viewAcctData.headerId}</Descriptions.Item>
                <Descriptions.Item label="Status">
                  <Tag color={viewAcctData.accountingStatus === 'POSTED' ? 'green' : viewAcctData.accountingStatus === 'DRAFT' ? 'blue' : 'default'}>
                    {viewAcctData.accountingStatus}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Period">{viewAcctData.periodName}</Descriptions.Item>
                <Descriptions.Item label="Accounting Date">{viewAcctData.accountingDate}</Descriptions.Item>
                <Descriptions.Item label="Description" span={2}>{viewAcctData.description}</Descriptions.Item>
                {viewAcctData.postedDate && (
                  <Descriptions.Item label="Posted Date">{viewAcctData.postedDate}</Descriptions.Item>
                )}
              </Descriptions>
              <Table
                size="small"
                pagination={false}
                dataSource={(viewAcctData.lines || []).map((l, i) => ({ ...l, key: i }))}
                columns={acctLineColumns}
              />
            </Space>
          );
        })() : (
          <Alert message="No accounting entries found for this payment." type="info" />
        )}
      </Modal>

      {/* ── Payment Voucher PDF Preview ── */}
      <Modal
        open={voucherModalOpen}
        onCancel={() => { setVoucherModalOpen(false); if (voucherPdfUrl) URL.revokeObjectURL(voucherPdfUrl); setVoucherPdfUrl(null); }}
        title={<Space><PrinterOutlined style={{ color: REDWOOD.primary }} /><span>Payment Voucher — PDF Preview</span></Space>}
        width={860}
        footer={
          <Space>
            <Button
              icon={<PrinterOutlined />}
              type="primary"
              style={{ background: REDWOOD.primary }}
              onClick={() => {
                if (voucherPdfUrl) {
                  const a = document.createElement('a');
                  a.href = voucherPdfUrl;
                  a.download = `payment-voucher-${payment.paymentDocument || payment.paymentNumber}.pdf`;
                  a.click();
                }
              }}
            >
              Download PDF
            </Button>
            <Button onClick={() => { setVoucherModalOpen(false); if (voucherPdfUrl) URL.revokeObjectURL(voucherPdfUrl); setVoucherPdfUrl(null); }}>
              Close
            </Button>
          </Space>
        }
      >
        {voucherPdfUrl && (
          <iframe src={voucherPdfUrl} style={{ width: '100%', height: '75vh', border: 'none' }} title="Payment Voucher Preview" />
        )}
      </Modal>

      {/* ── Exchange Gain/Loss Modal ─────────────────────────────────────── */}
      <Modal
        title={`Exchange Gain / Loss — Payment ${payment.paymentNumber}`}
        open={glModalOpen}
        onCancel={() => setGlModalOpen(false)}
        footer={<Button onClick={() => setGlModalOpen(false)}>Close</Button>}
        width={700}
      >
        {payment.paymentCurrency && payment.paymentCurrency !== 'AED' ? (
          <>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message={
                <>
                  Payment currency: <strong>{payment.paymentCurrency}</strong>&nbsp;|&nbsp;
                  Payment rate: <strong>{payment.conversionRate ?? '—'}</strong>&nbsp;
                  ({payment.conversionRateType || 'User'})
                </>
              }
            />
            <Table
              size="small"
              pagination={false}
              dataSource={relatedInvoices.filter(i => i.invoiceCurrency !== 'AED')}
              rowKey="key"
              columns={[
                { title: 'Invoice', dataIndex: 'invoiceNumber', width: 160 },
                { title: 'Inv Currency', dataIndex: 'invoiceCurrency', width: 90, align: 'center' },
                {
                  title: 'Inv. Rate',
                  dataIndex: 'invoiceExchangeRate',
                  width: 90,
                  align: 'right',
                  render: (_v: number | null, r: RelatedInvoice) => {
                    const rate = getInvRate(r);
                    return rate != null ? rate.toFixed(5) : <Text type="secondary" style={{ color: REDWOOD.warning }}>— missing</Text>;
                  },
                },
                {
                  title: 'Paid Amt (Inv CCY)',
                  dataIndex: 'amountPaidInvoiceCurrency',
                  width: 130,
                  align: 'right',
                  render: (v: number) => formatAmount(v),
                },
                {
                  title: 'Inv. Accounted (AED)',
                  dataIndex: 'invoiceBaseAmount',
                  width: 140,
                  align: 'right',
                  render: (_v: number, r: RelatedInvoice) => {
                    const amt = getInvAccounted(r);
                    return amt != null ? formatAmount(amt) : <Text type="secondary" style={{ color: REDWOOD.warning }}>— rate missing</Text>;
                  },
                },
                {
                  title: 'Pmt. Accounted (AED)',
                  dataIndex: 'paymentBaseAmount',
                  width: 140,
                  align: 'right',
                  render: (_v: number, r: RelatedInvoice) => formatAmount(getPmtAccounted(r)),
                },
                {
                  title: 'Gain / (Loss)',
                  width: 120,
                  align: 'right',
                  render: (_: any, r: RelatedInvoice) => {
                    const invAmt = getInvAccounted(r);
                    if (invAmt == null) return <Text type="secondary">—</Text>;
                    const diff = getPmtAccounted(r) - invAmt;
                    if (diff === 0) return <Text type="secondary">0.00</Text>;
                    return (
                      <Text strong style={{ color: diff > 0 ? REDWOOD.success : REDWOOD.error }}>
                        {diff > 0 ? '+' : ''}{formatAmount(diff)}
                      </Text>
                    );
                  },
                },
              ]}
              summary={() => {
                const fxInvoices = relatedInvoices.filter(i => i.invoiceCurrency !== 'AED');
                const hasAllRates = fxInvoices.every(r => getInvAccounted(r) != null);
                const invTotal = fxInvoices.reduce((s, r) => s + (getInvAccounted(r) ?? 0), 0);
                const pmtTotal = fxInvoices.reduce((s, r) => s + getPmtAccounted(r), 0);
                const totalDiff = pmtTotal - invTotal;
                return (
                  <Table.Summary.Row style={{ background: REDWOOD.neutral100, fontWeight: 600 }}>
                    <Table.Summary.Cell index={0} colSpan={4}><Text strong>Total</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      {hasAllRates ? <Text strong>{formatAmount(invTotal)}</Text> : <Text type="secondary">— rate missing</Text>}
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2} align="right"><Text strong>{formatAmount(pmtTotal)}</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={3} align="right">
                      {hasAllRates
                        ? <Text strong style={{ fontSize: 15, color: totalDiff > 0 ? REDWOOD.success : totalDiff < 0 ? REDWOOD.error : undefined }}>
                            {totalDiff > 0 ? '+' : ''}{formatAmount(totalDiff)}
                          </Text>
                        : <Text type="secondary">—</Text>}
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                );
              }}
            />
            <div style={{ marginTop: 16, padding: '12px 16px', background: REDWOOD.neutral100, borderRadius: 6, border: `1px solid ${REDWOOD.neutral200}` }}>
              <Row gutter={24}>
                <Col span={8}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Invoice Accounted (AED)</Text>
                  <div>
                    {invoiceTotals.invoiceBaseKnown
                      ? <Text strong style={{ fontSize: 16 }}>{formatAmount(invoiceTotals.invoiceBaseAmount)}</Text>
                      : <Text style={{ fontSize: 14, color: REDWOOD.warning }}>— Invoice rate missing in DB</Text>}
                  </div>
                </Col>
                <Col span={8}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Payment Accounted (AED)</Text>
                  <div><Text strong style={{ fontSize: 16 }}>{formatAmount(invoiceTotals.paymentBaseAmount)}</Text></div>
                </Col>
                <Col span={8}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Realized {realizedGainLoss != null ? (realizedGainLoss >= 0 ? 'Gain' : 'Loss') : 'Gain/Loss'}</Text>
                  <div>
                    {realizedGainLoss != null
                      ? <Text strong style={{ fontSize: 18, color: realizedGainLoss > 0 ? REDWOOD.success : realizedGainLoss < 0 ? REDWOOD.error : undefined }}>
                          {realizedGainLoss > 0 ? '+' : ''}{formatAmount(realizedGainLoss)}
                        </Text>
                      : <Text style={{ fontSize: 14, color: REDWOOD.warning }}>— Need invoice rate</Text>}
                  </div>
                </Col>
              </Row>
              <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Realized gain = payment accounted − invoice accounted. Positive = gain (currency weakened), Negative = loss (currency strengthened).
                </Text>
              </div>
            </div>
          </>
        ) : (
          <Alert type="info" message="This payment is in functional currency (AED). No exchange gain/loss applies." />
        )}
      </Modal>

      {/* ── Preview Void Accounting Modal ─────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <EyeOutlined style={{ color: REDWOOD.warning }} />
            <span>Preview Void Accounting — Payment {payment.paymentNumber}</span>
          </Space>
        }
        open={voidPreviewOpen}
        onCancel={() => setVoidPreviewOpen(false)}
        footer={<Button onClick={() => setVoidPreviewOpen(false)}>Close</Button>}
        width={900}
      >
        {voidPreviewLoading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Alert
              type="warning"
              showIcon
              message="This is a preview only — no accounting has been created or modified."
            />
            {/* Original accounting */}
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13, color: REDWOOD.neutral900 }}>
                Original Payment Accounting (Posted)
              </div>
              <Table
                size="small"
                pagination={false}
                dataSource={voidPreviewOrigLines.map((l, i) => ({ ...l, key: i }))}
                columns={[
                  { title: '#', dataIndex: 'lineNumber', width: 40 },
                  { title: 'Type', dataIndex: 'lineType', width: 55, render: (v: string) => <Tag color={v === 'DR' ? 'blue' : 'green'}>{v}</Tag> },
                  { title: 'Account', dataIndex: 'account', width: 180 },
                  { title: 'Description', dataIndex: 'description', ellipsis: true },
                  { title: 'Class', dataIndex: 'accountingClass', width: 100 },
                  { title: 'Entered Dr', dataIndex: 'enteredDr', width: 110, align: 'right' as const, render: (v: number) => v != null ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '' },
                  { title: 'Entered Cr', dataIndex: 'enteredCr', width: 110, align: 'right' as const, render: (v: number) => v != null ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '' },
                ]}
                summary={(rows) => {
                  const totalDr = rows.reduce((s, r) => s + (r.enteredDr || 0), 0);
                  const totalCr = rows.reduce((s, r) => s + (r.enteredCr || 0), 0);
                  return (
                    <Table.Summary.Row style={{ fontWeight: 600, background: '#f5f5f5' }}>
                      <Table.Summary.Cell index={0} colSpan={5} align="right">Total</Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">{totalDr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="right">{totalCr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Table.Summary.Cell>
                    </Table.Summary.Row>
                  );
                }}
              />
            </div>
            {/* Void reversal */}
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13, color: REDWOOD.warning }}>
                Void Reversal Accounting (Preview — not yet posted)
              </div>
              <Table
                size="small"
                pagination={false}
                dataSource={voidPreviewLines}
                columns={[
                  { title: '#', dataIndex: 'lineNumber', width: 40 },
                  { title: 'Type', dataIndex: 'lineType', width: 55, render: (v: string) => <Tag color={v === 'DR' ? 'blue' : 'green'}>{v}</Tag> },
                  { title: 'Account', dataIndex: 'account', width: 180 },
                  { title: 'Description', dataIndex: 'description', ellipsis: true },
                  { title: 'Class', dataIndex: 'accountingClass', width: 100 },
                  { title: 'Entered Dr', dataIndex: 'enteredDr', width: 110, align: 'right' as const, render: (v: number) => v != null ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '' },
                  { title: 'Entered Cr', dataIndex: 'enteredCr', width: 110, align: 'right' as const, render: (v: number) => v != null ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '' },
                ]}
                rowClassName={() => 'void-preview-row'}
                summary={(rows) => {
                  const totalDr = rows.reduce((s, r) => s + (r.enteredDr || 0), 0);
                  const totalCr = rows.reduce((s, r) => s + (r.enteredCr || 0), 0);
                  return (
                    <Table.Summary.Row style={{ fontWeight: 600, background: '#fff8e0' }}>
                      <Table.Summary.Cell index={0} colSpan={5} align="right">Total</Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">{totalDr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="right">{totalCr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Table.Summary.Cell>
                    </Table.Summary.Row>
                  );
                }}
              />
            </div>
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default PaymentDetail;
