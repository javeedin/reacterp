import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import {
  Card,
  Typography,
  Tabs,
  Table,
  Row,
  Col,
  Space,
  Button,
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
  Collapse,
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
  discountLost: number;
  discountTaken: number;
  invoiceCurrency: string;
  invoicePaymentStatus: string;
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

import { ORACLE_FUSION_CONFIG, APEX_DB_CONFIG } from '../../config/api.config';
import {
  checkAccountingExists,
  createAccounting,
  fetchLedgerByBusinessUnit,
  buildApPaymentSlaPayloads,
} from '../../services/sla.service';

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
  const [voidModalOpen, setVoidModalOpen]           = useState(false);
  const [showApiSection, setShowApiSection]         = useState(false);
  const [voidEligibility, setVoidEligibility]       = useState<{ eligible: boolean; errors: string[] } | null>(null);
  const [voidEligLoading, setVoidEligLoading]       = useState(false);
  const [voidEligApiRunning, setVoidEligApiRunning] = useState(false);
  const [voidEligApiResult, setVoidEligApiResult]   = useState<any>(null);
  const [voidPutApiRunning, setVoidPutApiRunning]   = useState(false);
  const [voidPutResult, setVoidPutResult]           = useState<any>(null);
  const [voidSubmitting, setVoidSubmitting]         = useState(false);
  const [voidStepStatus, setVoidStepStatus]       = useState<
    { step: number; label: string; status: 'idle' | 'running' | 'success' | 'error'; detail?: string }[]
  >([]);
  // ─────────────────────────────────────────────────────────────────────────

  // ── Create Accounting state ───────────────────────────────────────────────
  const [bankAccounts, setBankAccounts] = useState<{ bankAccountName: string; cashClearingAccountCombination: string; legalEntityName: string }[]>([]);
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
        discountLost: item.DiscountLost || 0,
        discountTaken: item.DiscountTaken || 0,
        invoiceCurrency: item.InvoiceCurrency || '',
        invoicePaymentStatus: item.InvoicePaymentStatus || '',
      })));
    } catch (error) {
      console.error('Error fetching related invoices:', error);
      setRelatedInvoices([]);
    } finally {
      setLoadingInvoices(false);
    }
  };

  // Open void modal — auto-runs eligibility check
  const openVoidModal = async () => {
    setVoidEligibility(null);
    setVoidEligApiResult(null);
    setVoidPutResult(null);
    setShowApiSection(false);
    setVoidStepStatus([]);
    voidForm.setFieldsValue({ voidDate: dayjs(), voidReason: '' });
    setVoidModalOpen(true);
    setVoidEligLoading(true);
    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/ap/payments/${payment.checkId}/void-eligibility`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        const err = { eligible: false, errors: [`API returned HTTP ${res.status}`] };
        setVoidEligibility(err);
        setVoidEligApiResult(err);
      } else {
        const data = await res.json();
        setVoidEligibility({ ...data, errors: Array.isArray(data.errors) ? data.errors : [] });
        setVoidEligApiResult(data);
      }
    } catch (e: any) {
      setVoidEligibility({ eligible: false, errors: [e?.message ?? 'Network error'] });
    } finally {
      setVoidEligLoading(false);
    }
  };

  const runVoidPutApi = async () => {
    setVoidPutApiRunning(true);
    setVoidPutResult(null);
    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/ap/payments/void`;
      const body = {
        CheckId:       payment.checkId,
        VoidDate:      dayjs().format('YYYY-MM-DD'),
        VoidedBy:      null,
        StopReason:    'Payment Voided',
        StopReference: payment.paymentNumber?.toString() ?? null,
      };
      const res = await fetch(url, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    JSON.stringify(body),
      });
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        setVoidPutResult(data);
      } catch {
        setVoidPutResult({ error: `HTTP ${res.status} — non-JSON response`, raw: text.slice(0, 500) });
      }
    } catch (e: any) {
      const msg: string = e?.message ?? 'Network error';
      if (msg === 'Failed to fetch' || msg.includes('NetworkError') || msg.includes('CORS')) {
        setVoidPutResult({
          error: 'Failed to fetch',
          hint: 'CORS or network error. Likely causes: (1) ORDS handler missing OWA_UTIL.MIME_HEADER call — re-run ap_void_payment_ords_rest.sql on the DB, (2) CORS not enabled for this ORDS module, (3) VPN/network connectivity.',
          url: `${APEX_DB_CONFIG.baseUrl}/ap/payments/void`,
        });
      } else {
        setVoidPutResult({ error: msg });
      }
    } finally {
      setVoidPutApiRunning(false);
    }
  };

  const runVoidEligibilityApi = async () => {
    setVoidEligApiRunning(true);
    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/ap/payments/${payment.checkId}/void-eligibility`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        const err = { error: `HTTP ${res.status}`, eligible: false, errors: [`API returned HTTP ${res.status}`] };
        setVoidEligApiResult(err);
        setVoidEligibility({ eligible: false, errors: err.errors });
      } else {
        const data = await res.json();
        setVoidEligApiResult(data);
        setVoidEligibility({ ...data, errors: Array.isArray(data.errors) ? data.errors : [] });
      }
    } catch (e: any) {
      setVoidEligApiResult({ error: e?.message ?? 'Network error' });
    } finally {
      setVoidEligApiRunning(false);
    }
  };

  const handleVoidSubmit = async (values: any) => {
    const steps = [
      { step: 0, label: 'Re-check eligibility', status: 'idle' as const },
      { step: 1, label: 'Void payment',          status: 'idle' as const },
    ];
    setVoidStepStatus(steps);
    setVoidSubmitting(true);
    const setStep = (step: number, status: 'running' | 'success' | 'error', detail?: string) =>
      setVoidStepStatus(prev => prev.map(s => s.step === step ? { ...s, status, detail } : s));
    try {
      setStep(0, 'running');
      const eligRes = await fetch(
        `${APEX_DB_CONFIG.baseUrl}/ap/payments/${payment.checkId}/void-eligibility`,
        { headers: { Accept: 'application/json' } }
      );
      const eligData = eligRes.ok ? await eligRes.json() : { eligible: false, errors: [`HTTP ${eligRes.status}`] };
      if (!eligData.eligible) {
        setStep(0, 'error', (eligData.errors ?? [])[0] ?? 'Not eligible');
        message.error('Payment is not eligible for void');
        return;
      }
      setStep(0, 'success', 'Eligible for void');

      setStep(1, 'running');
      const voidBody = {
        CheckId:       payment.checkId,
        VoidDate:      values.voidDate ? values.voidDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        VoidedBy:      null,
        StopReason:    values.voidReason || 'Payment Voided',
        StopReference: payment.paymentNumber?.toString() ?? null,
      };
      const voidRes = await fetch(`${APEX_DB_CONFIG.baseUrl}/ap/payments/void`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(voidBody),
      });
      const voidData = await voidRes.json();
      setVoidPutResult(voidData);
      if (voidData.status === 'error' || !voidRes.ok) {
        setStep(1, 'error', voidData.message ?? `HTTP ${voidRes.status}`);
        message.error('Void failed: ' + (voidData.message ?? 'Unknown error'));
        return;
      }
      setStep(1, 'success',
        `Voided — New balance: ${voidData.newBalance != null ? Number(voidData.newBalance).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}`
      );
      message.success('Payment voided successfully');
      setTimeout(() => {
        setVoidModalOpen(false);
        voidForm.resetFields();
        setVoidStepStatus([]);
        onClose(); // close the detail view so user sees refreshed list
      }, 1800);
    } finally {
      setVoidSubmitting(false);
    }
  };

  useEffect(() => {
    fetchRelatedInvoices();
  }, [payment.checkId]);

  // Fetch bank accounts on mount (needed for Create Accounting)
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${APEX_DB_CONFIG.baseUrl}/banks/bankaccounts`, { headers: { Accept: 'application/json' } });
        if (!res.ok) return;
        const data = await res.json();
        setBankAccounts((data.items || []).map((item: any) => ({
          bankAccountName: item.bank_account_name || '',
          cashClearingAccountCombination: item.cash_clearing_account_combination || '',
          legalEntityName: item.legal_entity_name || '',
        })));
      } catch { /* silent */ }
    };
    load();
  }, []);

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

      // Step 4: Build payloads
      setStep(4, 'running');
      let payloads: any[] = [];
      try {
        const paymentDate = payment.paymentDate || new Date().toISOString().split('T')[0];
        payloads = buildApPaymentSlaPayloads({
          checkId: payment.checkId,
          paymentNumber: String(payment.paymentNumber || payment.checkId),
          paymentDate,
          currencyCode: payment.paymentCurrency || 'AED',
          businessUnit: payment.businessUnit,
          legalEntity: payment.legalEntity,
          ledgerId: ledgerInfo?.ledgerId,
          ledgerName: ledgerInfo?.ledgerName,
          cashClearingAccount: bank.cashClearingAccountCombination,
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

  // Calculate totals for invoices
  const invoiceTotals = relatedInvoices.reduce(
    (acc, inv) => ({
      invoiceAmount: acc.invoiceAmount + inv.invoiceAmount,
      amountPaid: acc.amountPaid + inv.amountPaidPaymentCurrency,
      amountPaidInv: acc.amountPaidInv + inv.amountPaidInvoiceCurrency,
      discountTaken: acc.discountTaken + inv.discountTaken,
    }),
    { invoiceAmount: 0, amountPaid: 0, amountPaidInv: 0, discountTaken: 0 }
  );

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
        </div>

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
                <Table.Summary.Cell index={4} align="right">
                  {formatAmount(invoiceTotals.discountTaken)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} colSpan={2}></Table.Summary.Cell>
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
            <Tooltip title="Create Accounting">
              <Button icon={<AccountBookOutlined />} onClick={handleCreateAccounting}>
                Create Accounting
              </Button>
            </Tooltip>
            <Button type="primary" style={{ background: REDWOOD.primary }} onClick={onClose}>
              Done
            </Button>
          </Space>
        </div>

        {/* Header Info Grid */}
        <Row gutter={[48, 8]}>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 140, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Payee">{payment.payee}</Descriptions.Item>
              <Descriptions.Item label="Payment Date">{payment.paymentDate}</Descriptions.Item>
              <Descriptions.Item label="Status">{getStatusTag(payment.paymentStatus)}</Descriptions.Item>
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
              <Descriptions.Item label="Business Unit">{payment.businessUnit}</Descriptions.Item>
              <Descriptions.Item label="Legal Entity">{payment.legalEntity}</Descriptions.Item>
              <Descriptions.Item label="Stop Date"></Descriptions.Item>
              <Descriptions.Item label="Void Date"></Descriptions.Item>
              <Descriptions.Item label="Attachments">
                <a style={{ color: REDWOOD.info }}>None +</a>
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
            <Tooltip title={showApiSection ? 'Hide APIs' : 'Show APIs'}>
              <Button
                size="small"
                type={showApiSection ? 'primary' : 'text'}
                icon={<ApiOutlined style={{ color: showApiSection ? '#fff' : REDWOOD.info }} />}
                onClick={() => setShowApiSection(v => !v)}
                style={{ marginLeft: 4 }}
              />
            </Tooltip>
          </Space>
        }
        open={voidModalOpen}
        onCancel={() => { setVoidModalOpen(false); voidForm.resetFields(); setVoidStepStatus([]); setShowApiSection(false); }}
        footer={null}
        width={showApiSection ? 900 : 700}
        destroyOnClose
      >
        <Spin spinning={voidEligLoading} tip="Checking eligibility...">
          {/* Eligibility Banner */}
          {voidEligibility && !voidEligLoading && (
            <Alert
              type={voidEligibility.eligible ? 'success' : 'error'}
              showIcon
              message={voidEligibility.eligible ? 'Payment is eligible for void' : 'Payment cannot be voided'}
              description={
                !voidEligibility.eligible && (voidEligibility.errors?.length ?? 0) > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {voidEligibility.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                ) : null
              }
              style={{ marginBottom: 16 }}
            />
          )}

          <Form form={voidForm} layout="vertical" onFinish={handleVoidSubmit} size="small">
            {/* Row 1: Payment Number | Void Date */}
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Payment Number">
                  <Input value={payment.paymentNumber?.toString() ?? ''} readOnly style={{ background: '#f5f5f5', color: '#555' }} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label={<><span style={{ color: REDWOOD.primary }}>*</span> Void Date</>}
                  name="voidDate"
                  rules={[{ required: true, message: 'Required' }]}
                >
                  <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" />
                </Form.Item>
              </Col>
            </Row>

            {/* Row 2: Payment Date | Accounting Date */}
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Payment Date">
                  <Input value={payment.paymentDate ?? ''} readOnly style={{ background: '#f5f5f5', color: '#555' }} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Accounting Date">
                  <Input value={payment.accountingDate ?? ''} readOnly style={{ background: '#f5f5f5', color: '#555' }} />
                </Form.Item>
              </Col>
            </Row>

            {/* Row 3: Payment Amount | Void Reason */}
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Payment Amount">
                  <Input
                    value={`${payment.paymentAmount.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${payment.paymentCurrency}`}
                    readOnly
                    style={{ background: '#f5f5f5', color: '#555', fontWeight: 500 }}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Void Reason" name="voidReason">
                  <Input placeholder="Enter void reason (optional)" />
                </Form.Item>
              </Col>
            </Row>

            {/* Related Invoices */}
            <Divider orientation="left" style={{ fontSize: 12, margin: '4px 0 10px' }}>
              Related Invoices
            </Divider>
            <Table
              size="small"
              loading={loadingInvoices}
              dataSource={relatedInvoices}
              rowKey="key"
              pagination={false}
              scroll={{ y: 140 }}
              style={{ marginBottom: 16 }}
              locale={{ emptyText: loadingInvoices ? 'Loading...' : 'No related invoices found' }}
              columns={[
                { title: 'Invoice #', dataIndex: 'invoiceNumber', key: 'invoiceNumber', width: 140, ellipsis: true },
                {
                  title: 'Invoice Amount', dataIndex: 'invoiceAmount', key: 'invoiceAmount', width: 130, align: 'right' as const,
                  render: (v: number) => v != null ? v.toLocaleString('en-AE', { minimumFractionDigits: 2 }) : '—',
                },
                {
                  title: 'Amt Paid', dataIndex: 'amountPaidInvoiceCurrency', key: 'amountPaidInvoiceCurrency', width: 120, align: 'right' as const,
                  render: (v: number) => v != null ? v.toLocaleString('en-AE', { minimumFractionDigits: 2 }) : '—',
                },
                { title: 'Currency', dataIndex: 'invoiceCurrency', key: 'invoiceCurrency', width: 80 },
                {
                  title: 'Status', dataIndex: 'invoicePaymentStatus', key: 'invoicePaymentStatus', width: 100,
                  render: (s: string) => s ? <Tag color={s === 'Voided' ? 'red' : 'blue'}>{s}</Tag> : null,
                },
              ]}
            />

            {/* Step Status Panel */}
            {voidStepStatus.length > 0 && (
              <div style={{ marginBottom: 16, background: '#fafafa', border: '1px solid #e8e8e8', borderRadius: 6, padding: '10px 14px' }}>
                {voidStepStatus.map(s => {
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

            {/* ── Inline API Reference Panel ─────────────────────────────── */}
            {showApiSection && (
              <div style={{ marginBottom: 16 }}>
                <Divider orientation="left" style={{ fontSize: 12, margin: '8px 0 10px' }}>
                  API Reference
                </Divider>

                {/* GET eligibility */}
                <div style={{ border: '1px solid #d9d9d9', borderRadius: 6, padding: '10px 12px', marginBottom: 10, background: '#fafafa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Space size={6}>
                      <Tag color="blue" style={{ margin: 0 }}>GET</Tag>
                      <Text strong style={{ fontSize: 12 }}>Check Void Eligibility</Text>
                    </Space>
                    <Button
                      size="small"
                      type="primary"
                      icon={voidEligApiRunning ? <LoadingOutlined spin /> : <PlayCircleOutlined />}
                      loading={voidEligApiRunning}
                      onClick={runVoidEligibilityApi}
                    >
                      Run
                    </Button>
                  </div>
                  <code style={{ fontSize: 11, background: '#e8f5e9', padding: '3px 8px', borderRadius: 4, display: 'block', wordBreak: 'break-all', marginBottom: 8 }}>
                    {APEX_DB_CONFIG.baseUrl}/ap/payments/{payment.checkId}/void-eligibility
                  </code>
                  {voidEligApiResult && (
                    <pre style={{ fontSize: 10, background: '#1e1e1e', color: '#d4d4d4', padding: 8, borderRadius: 4, maxHeight: 140, overflowY: 'auto', margin: 0 }}>
                      {JSON.stringify(voidEligApiResult, null, 2)}
                    </pre>
                  )}
                </div>

                {/* PUT void */}
                <div style={{ border: '1px solid #d9d9d9', borderRadius: 6, padding: '10px 12px', background: '#fafafa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Space size={6}>
                      <Tag color="orange" style={{ margin: 0 }}>PUT</Tag>
                      <Text strong style={{ fontSize: 12 }}>Execute Void</Text>
                    </Space>
                    <Button
                      size="small"
                      type="primary"
                      danger
                      icon={voidPutApiRunning ? <LoadingOutlined spin /> : <PlayCircleOutlined />}
                      loading={voidPutApiRunning}
                      onClick={runVoidPutApi}
                    >
                      Run
                    </Button>
                  </div>
                  <code style={{ fontSize: 11, background: '#fff3e0', padding: '3px 8px', borderRadius: 4, display: 'block', wordBreak: 'break-all', marginBottom: 8 }}>
                    {APEX_DB_CONFIG.baseUrl}/ap/payments/void
                  </code>
                  <Text type="secondary" style={{ fontSize: 11 }}>Request body:</Text>
                  <pre style={{ fontSize: 10, background: '#1e1e1e', color: '#d4d4d4', padding: 8, borderRadius: 4, margin: '4px 0', maxHeight: 100, overflowY: 'auto' }}>
                    {JSON.stringify({ CheckId: payment.checkId, VoidDate: dayjs().format('YYYY-MM-DD'), VoidedBy: null, StopReason: 'Payment Voided', StopReference: payment.paymentNumber?.toString() ?? null }, null, 2)}
                  </pre>
                  {voidPutResult && (
                    <>
                      <Text type="secondary" style={{ fontSize: 11 }}>Response:</Text>
                      <pre style={{ fontSize: 10, background: '#1e1e1e', color: '#d4d4d4', padding: 8, borderRadius: 4, margin: '4px 0 0', maxHeight: 100, overflowY: 'auto' }}>
                        {JSON.stringify(voidPutResult, null, 2)}
                      </pre>
                    </>
                  )}
                </div>
              </div>
            )}
            {/* ─────────────────────────────────────────────────────────── */}

            {/* Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <Button onClick={() => { setVoidModalOpen(false); voidForm.resetFields(); setVoidStepStatus([]); setShowApiSection(false); }}>
                Cancel
              </Button>
              <Tooltip title={isVoided ? 'Already voided' : isCleared ? 'Cleared — cannot void' : ''}>
                <Button
                  type="primary"
                  danger
                  htmlType="submit"
                  loading={voidSubmitting}
                  disabled={!voidEligibility?.eligible || voidEligLoading}
                  icon={<StopOutlined />}
                >
                  Void Payment
                </Button>
              </Tooltip>
            </div>
          </Form>
        </Spin>
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
        )}
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
    </div>
  );
};

export default PaymentDetail;
