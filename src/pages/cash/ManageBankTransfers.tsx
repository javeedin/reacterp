import React, { useState, useCallback, useEffect, useRef } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
  Layout, Breadcrumb, Typography, Card, Table, Button, Form, Input, Select,
  DatePicker, InputNumber, Checkbox, Row, Col, Space, Tag, Tooltip, Tabs,
  message, Spin, Empty, Divider, Badge, Collapse, Modal, Upload, Popconfirm, Alert,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, BankOutlined, PlusOutlined, SearchOutlined, ReloadOutlined,
  EditOutlined, CloseOutlined, FilterOutlined, SwapOutlined, DollarOutlined,
  FileTextOutlined, ApiOutlined, ExportOutlined, DownloadOutlined,
  PrinterOutlined, PaperClipOutlined, UploadOutlined, EyeOutlined, DeleteOutlined,
  AccountBookOutlined, CheckCircleOutlined, SyncOutlined, LockOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../../context/AuthContext';
import {
  buildBankTransferSlaPayload, createAccounting, checkAccountingExists, checkGLJournalExists,
  fetchLedgerByBusinessUnit, derivePeriodName,
} from '../../services/sla.service';
import { validateGlPayload, persistValidationLog, type GlJournalPayload } from '../../services/glValidation.service';
import { useGlValidation } from '../../context/GlValidationContext';
import AccountSelector from '../../components/AccountSelector';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;
const { Panel } = Collapse;

// ── Redwood palette ──────────────────────────────────────────────────────────
const REDWOOD = {
  primary: '#C74634', primaryLight: '#E85D4A', primaryDark: '#A33B2C',
  success: '#1D7B4D', warning: '#D4A800', info: '#0572CE', error: '#D93025',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral300: '#C7C7C7',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
};

const APEX_BASE = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp';

// ── Types ────────────────────────────────────────────────────────────────────
interface TransferRecord {
  bankAccountTransferId: number;
  bankAccountTransferNumber: number;
  transactionDate: string;
  memo: string;
  paymentAmount: number;
  fromAmount: number;
  conversionRate: number;
  fromBankAccountName: string;
  toBankAccountName: string;
  fromCurrencyCode: string;
  toCurrencyCode: string;
  paymentCurrencyCode: string;
  conversionRateType: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  paymentProfileName: string;
  businessUnit: string;
  paymentFile: number;
  fromExternalTrxId: number;
  toExternalTrxId: number;
  isSettledWithIbyFlag: string;
  createdBy: string;
  creationDate: string;
  lastUpdateDate: string;
  syncDate: string;
  accountingFlag?: string;
  reconciledFlag?: string;
  reconciledDate?: string;
  cashClearingAccount?: string;
}

interface BankAccountOption { label: string; value: string; }
interface BUOption { label: string; value: string; }

interface TransferAcctRow {
  transferId:       number;
  txnDate:          string;
  periodName:       string;
  amount:           number;
  currency:         string;
  fromCurrency:     string;
  toCurrency:       string;
  fromAsset:        string;
  toAsset:          string;
  clearingAccount:  string;
  fromBankName:     string;
  toBankName:       string;
  bu:               string;
  /** @deprecated kept for compat */ drAccount: string;
  /** @deprecated kept for compat */ crAccount: string;
  status:     'pending' | 'running' | 'success' | 'error' | 'skipped';
  message?:   string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Oracle TO_CHAR omits leading zeros for decimals < 1 (e.g. .0428 → invalid JSON).
// Fix by inserting a 0 before any bare leading decimal point in JSON number values.
const parseApexJson = async (res: Response) => {
  const text = await res.text();
  const fixed = text
    .replace(/:(-?)\.(\d)/g, ':$10.$2')   // .428 → 0.428  (missing leading zero)
    .replace(/(\d)\.([,}\]])/g, '$1$2');  // 100., → 100,  (trailing dot on integers)
  return JSON.parse(fixed);
};

const fmtAmount = (val?: number, ccy?: string) => {
  if (val == null) return '—';
  const s = new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  return ccy ? `${s} ${ccy}` : s;
};

const fmtDate = (d?: string) => {
  if (!d) return '—';
  try { return dayjs(d).format('D-MMM-YYYY'); } catch { return d; }
};

const statusColor = (s: string) => {
  const m: Record<string, string> = { Completed: 'success', Cancelled: 'error', Terminated: 'warning', Processing: 'processing' };
  return m[s] ?? 'default';
};

const shortAcct = (name: string) => name?.length > 22 ? name.substring(0, 22) + '…' : (name ?? '—');

// ── PDF Generator ─────────────────────────────────────────────────────────────
const generateTransferPdf = (r: Partial<TransferRecord>): jsPDF => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const fmt = (v: any) => v != null && v !== '' ? String(v) : '—';
  const fmtNum = (v: any) => v != null ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '—';
  const fmtDt  = (v: any) => { if (!v) return '—'; try { return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return String(v); } };
  const margin = 14;

  // Red header bar
  doc.setFillColor(199, 70, 52);
  doc.rect(0, 0, pageW, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Bank Account Transfer', margin, 12);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Printed: ${new Date().toLocaleString()}`, pageW - margin, 12, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  // Transfer number + date
  let y = 26;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(199, 70, 52);
  doc.text(`Transfer #: ${r.bankAccountTransferNumber ?? r.bankAccountTransferId ?? '—'}`, margin, y);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${fmtDt(r.transactionDate)}`, pageW - margin, y, { align: 'right' });
  y += 8;

  // Section 1: Organisation & Accounts
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Organisation & Accounts', margin, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    body: [
      ['Business Unit', fmt(r.businessUnit), 'Status', fmt(r.status)],
      ['From Account',  fmt(r.fromBankAccountName), 'From Currency', fmt(r.fromCurrencyCode)],
      ['To Account',    fmt(r.toBankAccountName),   'To Currency',   fmt(r.toCurrencyCode)],
    ],
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 }, 2: { fontStyle: 'bold', cellWidth: 42 } },
    alternateRowStyles: { fillColor: [247, 247, 247] },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Section 2: Transfer Details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Transfer Details', margin, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    body: [
      ['Payment Amount', fmtNum(r.paymentAmount), 'Payment Currency', fmt(r.paymentCurrencyCode)],
      ['From Amount',    fmtNum(r.fromAmount),    'Conversion Rate',  fmtNum(r.conversionRate)],
      ['Conv. Rate Type', fmt(r.conversionRateType), 'Payment Method', fmt(r.paymentMethod)],
      ['Payment Profile', fmt(r.paymentProfileName), 'Payment Status', fmt(r.paymentStatus)],
      ['Settled via IBY', fmt(r.isSettledWithIbyFlag), 'Payment File', fmt(r.paymentFile)],
      ['Memo', fmt(r.memo), '', ''],
    ],
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 }, 2: { fontStyle: 'bold', cellWidth: 42 } },
    alternateRowStyles: { fillColor: [247, 247, 247] },
    margin: { left: margin, right: margin },
  });
  // Signature row — pinned to page footer
  const pageH   = doc.internal.pageSize.getHeight();
  const sigLabels = ['Prepared by', 'Checked by', 'Approved by', 'Received by'];
  const sigW    = (pageW - 2 * margin) / sigLabels.length;
  const sigY    = pageH - 20; // 20 mm from bottom
  doc.setDrawColor(180, 180, 180);
  doc.line(margin, sigY - 4, pageW - margin, sigY - 4); // thin separator line
  sigLabels.forEach((label, i) => {
    const x = margin + i * sigW;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(label, x + sigW / 2, sigY, { align: 'center' });
    doc.setDrawColor(100, 100, 100);
    doc.line(x + 6, sigY + 10, x + sigW - 6, sigY + 10);
  });

  return doc;
};

// ── Edit/Create tab key ───────────────────────────────────────────────────────
let tabCounter = 0;
const newTabKey = () => `tab_${++tabCounter}`;

// ────────────────────────────────────────────────────────────────────────────
// Transfer Form (Create / Edit)
// ────────────────────────────────────────────────────────────────────────────
const TransferForm: React.FC<{
  initialValues?: Partial<TransferRecord>;
  bankAccounts: BankAccountOption[];
  businessUnits: BUOption[];
  bankCurrencyMap: Record<string, string>;
  buBankMap: Record<string, string[]>;
  bankAccountAssetMap: Record<string, string>;
  buCompanyMap: Record<string, string>;
  onSave: (created?: { bankAccountTransferId: number; bankAccountTransferNumber: string }) => void;
  onCancel: () => void;
}> = ({ initialValues, bankAccounts, businessUnits, bankCurrencyMap, buBankMap, bankAccountAssetMap, buCompanyMap, onSave, onCancel }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [apiModal, setApiModal]       = useState(false);
  const [apiPayload, setApiPayload]   = useState('');
  const [apiPosting, setApiPosting]   = useState(false);
  const [apiResponse, setApiResponse] = useState<{ status: number; body: string } | null>(null);
  const [apiGetRunning, setApiGetRunning] = useState(false);
  const [apiGetResponse, setApiGetResponse] = useState<{ status: number; body: string } | null>(null);
  const [apiTab, setApiTab] = useState<'get' | 'post' | 'attachments'>('post');
  const [attApiLog, setAttApiLog] = useState<Array<{ dir: string; url: string; status: number | null; body: string }>>([]);
  const isEdit = !!initialValues?.bankAccountTransferId;
  const isAccounted  = isEdit && initialValues?.accountingFlag === 'Y';
  const isReconciled = isEdit && (initialValues?.reconciledFlag === 'Y' || initialValues?.paymentStatus === 'Reconciled' || initialValues?.paymentStatus === 'RECONCILED');
  const isPermanentlyLocked = isAccounted || isReconciled;
  const [editMode, setEditMode] = useState(false);
  const isReadOnly = isPermanentlyLocked || (isEdit && !editMode);

  const [fromCurrency, setFromCurrency] = useState<string>(initialValues?.fromCurrencyCode ?? '');
  const [toCurrency, setToCurrency] = useState<string>(initialValues?.toCurrencyCode ?? '');
  const [cashClearingAcct, setCashClearingAcct] = useState<string>(initialValues?.cashClearingAccount ?? '');
  const [cashClearingDesc, setCashClearingDesc] = useState<string>('');
  const [cashClearingOpen, setCashClearingOpen] = useState(false);
  const [previewAcctOpen, setPreviewAcctOpen]   = useState(false);
  const [acctCreating,    setAcctCreating]      = useState(false);
  const watchedPaymentCcy  = Form.useWatch('paymentCurrencyCode', form);
  const watchedAmount      = Form.useWatch('paymentAmount', form);
  const watchedRate        = Form.useWatch('conversionRate', form);
  const isCrossCurrency    = !!watchedPaymentCcy && !!fromCurrency && watchedPaymentCcy !== fromCurrency;
  const fromAmount         = isCrossCurrency && watchedAmount && watchedRate
    ? watchedAmount * watchedRate : null;

  useEffect(() => {
    if (initialValues) {
      form.setFieldsValue({
        fromBankAccountName: initialValues.fromBankAccountName,
        toBankAccountName: initialValues.toBankAccountName,
        transactionDate: initialValues.transactionDate ? dayjs(initialValues.transactionDate) : dayjs(),
        paymentAmount: initialValues.paymentAmount,
        conversionRateType: initialValues.conversionRateType,
        conversionRate: initialValues.conversionRate,
        isSettledWithIbyFlag: initialValues.isSettledWithIbyFlag === 'Y',
        businessUnit: initialValues.businessUnit,
        paymentMethod: initialValues.paymentMethod,
        paymentProfileName: initialValues.paymentProfileName,
        memo: initialValues.memo,
        paymentCurrencyCode: initialValues.paymentCurrencyCode ?? '',
      });
      setFromCurrency(initialValues.fromCurrencyCode ?? '');
      setToCurrency(initialValues.toCurrencyCode ?? '');
      setEditMode(false);
    } else {
      form.resetFields();
      form.setFieldsValue({ transactionDate: dayjs(), isSettledWithIbyFlag: true });
      setFromCurrency('');
      setToCurrency('');
      setEditMode(false);
    }
  }, [initialValues, form]);

  const handleDelete = async () => {
    if (!initialValues?.bankAccountTransferId) return;
    setDeleting(true);
    try {
      const res = await fetch(`${APEX_BASE}/cash/banktransfers/${initialValues.bankAccountTransferId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.status === 'success') {
        message.success('Transfer deleted.');
        onSave();
      } else {
        message.error(data.message || 'Delete failed.');
      }
    } catch (e: any) {
      message.error('Network error: ' + e.message);
    } finally { setDeleting(false); }
  };

  // Load attachments once when the transfer ID becomes available
  const transferId = initialValues?.bankAccountTransferId;
  const extTrxId = initialValues?.fromExternalTrxId || initialValues?.bankAccountTransferId || null;
  useEffect(() => {
    if (extTrxId) setInspTxnIdInput(String(extTrxId));
  }, [extTrxId]);
  useEffect(() => {
    if (!transferId) return;
    const url = extTrxId
      ? `${APEX_BASE}/cash/externaltransactions/${extTrxId}/attachments`
      : null;
    if (!url) return;
    setAttApiLog(prev => [...prev, { dir: 'GET', url, status: null, body: '…fetching…' }]);
    fetch(url, { headers: { Accept: 'application/json' } })
      .then(r => r.json())
      .then(d => {
        setAttApiLog(prev => [...prev.slice(-9), { dir: 'GET', url, status: 200, body: JSON.stringify(d, null, 2) }]);
        if (Array.isArray(d.items)) {
          setAttachments(d.items.map((a: any) => ({
            id: a.id, uid: String(a.id), name: a.fileName, fileType: a.fileType || '', fileSize: a.fileSize || 0, status: 'done' as const,
          })));
          if (d.items[0]?.id) setInspAttIdInput(String(d.items[0].id));
        }
      })
      .catch(err => {
        setAttApiLog(prev => [...prev.slice(-9), { dir: 'GET', url, status: 0, body: String(err) }]);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferId]);

  const handleSubmit = async () => {
    let values: any;
    try { values = await form.validateFields(); } catch { return; }

    setSaving(true);
    try {
      const payload = buildPayload(values);

      const res = await fetch(`${APEX_BASE}/cash/banktransfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.status === 'success') {
        message.success(isEdit ? 'Transfer updated.' : 'Transfer created.');
        if (!isEdit && data.bankAccountTransferId) {
          onSave({ bankAccountTransferId: data.bankAccountTransferId, bankAccountTransferNumber: String(data.bankAccountTransferNumber ?? '') });
        } else {
          onSave();
        }
      } else {
        message.error(data.message || 'Save failed.');
      }
    } catch (e: any) {
      message.error('Network error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const buildPayload = (values: any) => ({
    items: [{
      BankAccountTransferId:     initialValues?.bankAccountTransferId ?? undefined,
      BankAccountTransferNumber: initialValues?.bankAccountTransferNumber ?? undefined,
      TransactionDate:           values.transactionDate?.format('YYYY-MM-DD'),
      Memo:                      values.memo ?? '',
      PaymentAmount:             values.paymentAmount,
      FromAmount:                (values.paymentCurrencyCode && values.paymentCurrencyCode !== fromCurrency && values.conversionRate)
                                   ? values.paymentAmount * values.conversionRate
                                   : values.paymentAmount,
      FromBankAccountName:       values.fromBankAccountName,
      ToBankAccountName:         values.toBankAccountName,
      FromCurrencyCode:          fromCurrency,
      ToCurrencyCode:            toCurrency,
      PaymentCurrencyCode:       values.paymentCurrencyCode ?? '',
      ConversionRateType:        values.conversionRateType ?? '',
      ConversionRate:            values.conversionRate ?? null,
      Status:                    'Completed',
      PaymentStatus:             initialValues?.paymentStatus ?? '',
      PaymentMethod:             values.paymentMethod ?? '',
      PaymentProfileName:        values.paymentProfileName ?? '',
      Businessunit:              values.businessUnit ?? '',
      IsSettledWithIbyFlag:      values.isSettledWithIbyFlag ? 'true' : 'false',
      CashClearingAccount:       cashClearingAcct || null,
      CreatedBy:                 'ERP_USER',
      CreationDate:              new Date().toISOString(),
      LastUpdatedBy:             'ERP_USER',
      LastUpdateDate:            new Date().toISOString(),
      LastUpdateLogin:           '',
    }],
  });

  const handlePrintPdf = () => {
    if (!initialValues) return;
    const doc = generateTransferPdf(initialValues);
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    if (voucherPdfUrl) URL.revokeObjectURL(voucherPdfUrl);
    setVoucherPdfUrl(url);
    setVoucherModalOpen(true);
  };

  const makeBlobUrl = (base64: string, mimeType: string): string => {
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return URL.createObjectURL(new Blob([arr], { type: mimeType || 'application/octet-stream' }));
  };

  const handlePreviewAttachment = async (file: any) => {
    const att = attachments.find(a => a.uid === file.uid);
    if (!att) { console.warn('[preview] attachment not found in state', file.uid); return; }
    if (att.content) {
      try {
        const blobUrl = makeBlobUrl(att.content, att.fileType || 'application/octet-stream');
        setPreviewAtt({ name: att.name, fileType: att.fileType, content: att.content, blobUrl });
      } catch (e) { message.error('Preview error: ' + (e as any).message); }
      return;
    }
    if (!att.id) { message.warning('Attachment has no ID — save first, then preview.'); return; }
    if (!extTrxId) { message.warning('Transfer ID not available for preview.'); return; }
    setPreviewLoading(true);
    try {
      const url = `${APEX_BASE}/cash/externaltransactions/${extTrxId}/attachments/${att.id}`;
      console.log('[preview] fetching', url);
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const txt = await res.text();
      console.log('[preview] response length:', txt.length, 'status:', res.status);
      let d: any = {};
      try { d = JSON.parse(txt); } catch (e) { message.error('Preview: server returned invalid JSON'); return; }
      const content = d.content || d.CONTENT || '';
      const fileType = att.fileType || d.fileType || 'application/octet-stream';
      console.log('[preview] content length:', content.length, 'fileType:', fileType, 'first50:', content.slice(0,50));
      if (!content) { message.warning('No content returned — try re-uploading the file.'); return; }
      try {
        const blobUrl = makeBlobUrl(content, fileType);
        console.log('[preview] blobUrl created:', blobUrl);
        setPreviewAtt({ name: att.name, fileType, content, blobUrl });
        console.log('[preview] setPreviewAtt called');
      } catch (e) { message.error('Failed to decode file: ' + (e as any).message); console.error('[preview] decode error', e); }
    } catch (e: any) { message.error('Failed to load attachment: ' + e.message); }
    finally { setPreviewLoading(false); }
  };

  const handleDownloadAttachment = async (file: any) => {
    const att = attachments.find(a => a.uid === file.uid);
    if (!att) return;
    let content = att.content;
    let fileType = att.fileType;
    if (!content && att.id && extTrxId) {
      try {
        const res = await fetch(`${APEX_BASE}/cash/externaltransactions/${extTrxId}/attachments/${att.id}`, { headers: { Accept: 'application/json' } });
        const d = await res.json();
        content = d.content || d.CONTENT || '';
        fileType = att.fileType || d.fileType || 'application/octet-stream';
      } catch { message.error('Failed to download attachment.'); return; }
    }
    if (!content) { message.warning('No content available for download.'); return; }
    const bytes = atob(content);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blobUrl = URL.createObjectURL(new Blob([arr], { type: fileType || 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = att.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  };

  const handleSaveAttachments = async () => {
    const pending = attachments.filter(a => !a.id);
    if (pending.length === 0) { message.info('No new attachments to save.'); return; }
    if (!extTrxId) { message.error('Transfer ID not available — cannot save attachments'); return; }
    setAttSaving(true);
    let saved = 0;
    for (const att of pending) {
      if (!att.rawFile && !att.content) {
        setAttApiLog(prev => [...prev.slice(-9), { dir: 'POST', url: '', status: 0, body: `${att.name}: no file data — skipped` }]);
        continue;
      }
      const postUrl = `${APEX_BASE}/cash/externaltransactions/${extTrxId}/attachments`;
      try {
        const base64 = att.content ?? await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => { const r = reader.result as string; resolve(r.split(',')[1] ?? r); };
          reader.onerror = reject;
          reader.readAsDataURL(att.rawFile!);
        });
        console.log('[save] file:', att.name, 'base64 len:', base64.length, 'first50:', base64.slice(0, 50));
        const payload = JSON.stringify({ fileName: att.name, fileType: att.fileType || '', fileSize: att.fileSize, content: base64, createdBy: 'ERP_USER' });
        const res = await fetch(postUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
        const respText = await res.text();
        let resp: any = null;
        try { resp = JSON.parse(respText); } catch { /* not JSON */ }
        console.log('[save] POST response:', respText);
        setAttApiLog(prev => [...prev.slice(-9), {
          dir: 'POST', url: postUrl, status: res.status,
          body: `Sent: ${att.name} — JSON\n\nResponse: ${respText}`,
        }]);
        if (resp?.status === 'success') saved++;
        else message.error(`${att.name}: ${resp?.message || respText}`);
      } catch (e: any) {
        setAttApiLog(prev => [...prev.slice(-9), { dir: 'POST', url: postUrl, status: 0, body: 'Error: ' + e.message }]);
      }
    }
    // Refresh list
    const getUrl = `${APEX_BASE}/cash/externaltransactions/${extTrxId}/attachments`;
    try {
      const r = await fetch(getUrl, { headers: { Accept: 'application/json' } });
      const d = await r.json();
      setAttApiLog(prev => [...prev.slice(-9), { dir: 'GET (refresh)', url: getUrl, status: r.status, body: JSON.stringify(d, null, 2) }]);
      if (Array.isArray(d.items)) {
        setAttachments(d.items.map((a: any) => ({ id: a.id, uid: String(a.id), name: a.fileName, fileType: a.fileType || '', fileSize: a.fileSize || 0, status: 'done' as const })));
        if (d.items[0]?.id) setInspAttIdInput(String(d.items[0].id));
      }
    } catch (e: any) {
      setAttApiLog(prev => [...prev.slice(-9), { dir: 'GET (refresh)', url: getUrl, status: 0, body: 'Error: ' + String(e) }]);
    }
    message.success(`${saved} attachment(s) saved.`);
    setAttSaving(false);
  };

  const handleApiOpen = async () => {
    let values: any;
    try { values = await form.getFieldsValue(); } catch { return; }
    setApiPayload(JSON.stringify(buildPayload(values), null, 2));
    setApiResponse(null);
    setApiGetResponse(null);
    setApiTab('post');
    setApiModal(true);
  };

  const handleApiGet = async () => {
    setApiGetRunning(true);
    setApiGetResponse(null);
    try {
      const url = `${APEX_BASE}/cash/banktransfers?row_limit=10`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const text = await res.text();
      setApiGetResponse({ status: res.status, body: (() => { try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; } })() });
    } catch (e: any) {
      setApiGetResponse({ status: 0, body: 'Network error: ' + e.message });
    } finally {
      setApiGetRunning(false);
    }
  };

  const handleApiPost = async () => {
    setApiPosting(true);
    setApiResponse(null);
    try {
      const res = await fetch(`${APEX_BASE}/cash/banktransfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: apiPayload,
      });
      const text = await res.text();
      setApiResponse({ status: res.status, body: (() => { try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; } })() });
    } catch (e: any) {
      setApiResponse({ status: 0, body: 'Network error: ' + e.message });
    } finally {
      setApiPosting(false);
    }
  };

  const [voucherPdfUrl, setVoucherPdfUrl] = useState<string | null>(null);
  const [voucherModalOpen, setVoucherModalOpen] = useState(false);
  const [attachments, setAttachments] = useState<Array<{id?: number; uid: string; name: string; fileType: string; fileSize: number; content?: string; rawFile?: File; status: 'done' | 'uploading' | 'error'}>>([]);
  const [attSaving, setAttSaving] = useState(false);
  const [attPostTesting, setAttPostTesting] = useState(false);
  const [attGetSingleTesting, setAttGetSingleTesting] = useState(false);
  const [inspTxnIdInput, setInspTxnIdInput] = useState('');
  const [inspAttIdInput, setInspAttIdInput] = useState('');
  const [previewAtt, setPreviewAtt] = useState<{ name: string; fileType: string; content: string; blobUrl?: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [selectedBu, setSelectedBu] = useState<string | undefined>(
    initialValues?.businessUnit ?? undefined
  );
  const buSelected = !!selectedBu;
  const derivedCompany = selectedBu ? (buCompanyMap[selectedBu] || '') : '';
  const [selectedFromAcct, setSelectedFromAcct] = useState<string>(initialValues?.fromBankAccountName ?? '');
  const [selectedToAcct,   setSelectedToAcct]   = useState<string>(initialValues?.toBankAccountName   ?? '');

  // Filter bank accounts to those belonging to the selected BU
  const filteredBankAccounts = selectedBu && buBankMap[selectedBu]?.length
    ? bankAccounts.filter(a => buBankMap[selectedBu].includes(a.value))
    : bankAccounts;

  // Business rule: one side must be AED.
  // If From Account is non-AED, restrict To Account to AED accounts only.
  const filteredToAccounts = fromCurrency && fromCurrency !== 'AED'
    ? filteredBankAccounts.filter(a => (bankCurrencyMap[a.value] ?? '') === 'AED')
    : filteredBankAccounts;

  // sync selectedBu when initialValues changes (edit mode)
  useEffect(() => {
    setSelectedBu(initialValues?.businessUnit ?? undefined);
    setSelectedFromAcct(initialValues?.fromBankAccountName ?? '');
    setSelectedToAcct(initialValues?.toBankAccountName ?? '');
  }, [initialValues]);

  const fs = { marginBottom: 14 };
  const lc = { span: 8 };
  const wc = { span: 16 };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '12px 24px' }}>
      <Text style={{ fontSize: 12, color: REDWOOD.neutral600, display: 'block', marginBottom: 16 }}>
        {isEdit
          ? (isPermanentlyLocked ? 'View Bank Account Transfer (Read-only)' : editMode ? 'Edit Bank Account Transfer' : 'View Bank Account Transfer')
          : 'Create Bank Account Transfer'}
      </Text>

      {isPermanentlyLocked && (
        <div style={{ marginBottom: 12, padding: '6px 12px', background: '#fff1f0', border: '1px solid #ffa39e', borderRadius: 4 }}>
          <LockOutlined style={{ color: '#a8071a', marginRight: 6 }} />
          <Text style={{ fontSize: 12, color: '#a8071a' }}>
            This transfer cannot be edited — it has been {isAccounted ? 'accounted' : ''}{isAccounted && isReconciled ? ' and ' : ''}{isReconciled ? 'reconciled with bank' : ''}.
          </Text>
        </div>
      )}

      <Form form={form} layout="horizontal" labelCol={lc} wrapperCol={wc}>

        {/* ── Business Unit — must be selected first ── */}
        <Row gutter={40}>
          <Col xs={24} lg={12}>
            <Form.Item label="Business Unit" name="businessUnit" rules={[{ required: !isEdit, message: 'Business Unit is required' }]} style={fs}>
              <Select
                showSearch placeholder="Select business unit" optionFilterProp="label" options={businessUnits}
                style={{ width: '100%' }}
                onChange={(v) => {
                  setSelectedBu(v ?? undefined);
                  form.setFieldsValue({ fromBankAccountName: undefined, toBankAccountName: undefined });
                  setSelectedFromAcct('');
                  setSelectedToAcct('');
                  setFromCurrency('');
                  setToCurrency('');
                }}
                allowClear
                onClear={() => {
                  setSelectedBu(undefined);
                  form.setFieldsValue({ fromBankAccountName: undefined, toBankAccountName: undefined });
                  setSelectedFromAcct('');
                  setSelectedToAcct('');
                  setFromCurrency('');
                  setToCurrency('');
                }}
                disabled={isReadOnly}
              />
            </Form.Item>
          </Col>
          {!buSelected && (
            <Col xs={24} lg={12} style={{ display: 'flex', alignItems: 'center', paddingBottom: 14 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Select a Business Unit to continue</Text>
            </Col>
          )}
        </Row>

        {/* From / To accounts — full width so names aren't truncated */}
        <Row gutter={40}>
          <Col xs={24}>
            <Form.Item label="From Account" labelCol={{ span: 4 }} wrapperCol={{ span: 20 }} style={{ marginBottom: 4 }}>
              <div style={{ display: 'flex', gap: 0 }}>
                <Form.Item name="fromBankAccountName" noStyle rules={[{ required: true, message: 'From Account is required' }]}>
                  <Select showSearch placeholder="Select bank account" optionFilterProp="label" options={filteredBankAccounts}
                    style={{ borderRadius: '6px 0 0 6px', flex: 1 }} disabled={isReadOnly || !buSelected}
                    notFoundContent={<Text type="secondary">{buSelected ? 'No accounts for this BU' : 'Select a BU first'}</Text>}
                    onChange={(v: string) => {
                      const ccy = bankCurrencyMap[v] ?? '';
                      setFromCurrency(ccy);
                      setSelectedFromAcct(v);
                      // If new from-currency makes current to-account invalid, clear it
                      if (ccy !== 'AED' && toCurrency && toCurrency !== 'AED') {
                        form.setFieldsValue({ toBankAccountName: undefined, paymentCurrencyCode: undefined });
                        setToCurrency('');
                        setSelectedToAcct('');
                      }
                    }}
                  />
                </Form.Item>
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px', background: '#f5f5f5', border: '1px solid #d9d9d9', borderLeft: 0, borderRadius: '0 6px 6px 0', minWidth: 52, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: 600, color: fromCurrency ? REDWOOD.info : REDWOOD.neutral300 }}>{fromCurrency || 'CCY'}</Text>
                </div>
              </div>
              {selectedFromAcct && bankAccountAssetMap[selectedFromAcct] && (
                <div style={{ marginTop: 4, fontSize: 11, color: REDWOOD.info, fontFamily: 'monospace', paddingLeft: 2 }}>
                  Cash Account: <strong>{bankAccountAssetMap[selectedFromAcct]}</strong>
                </div>
              )}
              {fromCurrency && fromCurrency !== 'AED' && (
                <div style={{ marginTop: 4, fontSize: 11, color: REDWOOD.warning, paddingLeft: 2 }}>
                  Non-AED from account — To Account is restricted to AED accounts only
                </div>
              )}
            </Form.Item>

            <Form.Item label="To Account" labelCol={{ span: 4 }} wrapperCol={{ span: 20 }} style={{ marginBottom: 4 }}>
              <div style={{ display: 'flex', gap: 0 }}>
                <Form.Item name="toBankAccountName" noStyle rules={[{ required: true, message: 'To Account is required' }]}>
                  <Select showSearch placeholder={fromCurrency && fromCurrency !== 'AED' ? 'AED accounts only' : 'Select bank account'}
                    optionFilterProp="label" options={filteredToAccounts}
                    style={{ borderRadius: '6px 0 0 6px', flex: 1 }} disabled={isReadOnly || !buSelected}
                    notFoundContent={<Text type="secondary">{!buSelected ? 'Select a BU first' : fromCurrency && fromCurrency !== 'AED' ? 'No AED accounts found' : 'No accounts for this BU'}</Text>}
                    onChange={(v: string) => {
                      const ccy = bankCurrencyMap[v] ?? '';
                      setToCurrency(ccy);
                      setSelectedToAcct(v);
                      // Payment currency always follows To Account
                      form.setFieldsValue({ paymentCurrencyCode: ccy });
                    }}
                  />
                </Form.Item>
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px', background: '#f5f5f5', border: '1px solid #d9d9d9', borderLeft: 0, borderRadius: '0 6px 6px 0', minWidth: 52, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: 600, color: toCurrency ? REDWOOD.info : REDWOOD.neutral300 }}>{toCurrency || 'CCY'}</Text>
                </div>
              </div>
              {selectedToAcct && bankAccountAssetMap[selectedToAcct] && (
                <div style={{ marginTop: 4, fontSize: 11, color: REDWOOD.success, fontFamily: 'monospace', paddingLeft: 2 }}>
                  Cash Account: <strong>{bankAccountAssetMap[selectedToAcct]}</strong>
                </div>
              )}
            </Form.Item>
            <Form.Item label="Cash Clearing Account" labelCol={{ span: 4 }} wrapperCol={{ span: 20 }} style={{ marginBottom: 4 }}>
              <Input.Group compact style={{ display: 'flex' }}>
                <Input
                  value={cashClearingAcct}
                  readOnly
                  placeholder="Select clearing account combination"
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, cursor: 'pointer' }}
                  onClick={() => !isReadOnly && setCashClearingOpen(true)}
                />
                <Button
                  icon={<SearchOutlined />}
                  disabled={isReadOnly}
                  onClick={() => setCashClearingOpen(true)}
                  style={{ borderLeft: 0 }}
                />
              </Input.Group>
              {cashClearingDesc && (
                <div style={{ marginTop: 2, fontSize: 11, color: REDWOOD.neutral600, paddingLeft: 2 }}>
                  {cashClearingDesc}
                </div>
              )}
            </Form.Item>
            <div style={{ marginBottom: 14 }} />
          </Col>
        </Row>

        <Row gutter={40}>
          {/* Left column */}
          <Col xs={24} lg={12}>

            <Form.Item label="Payment Currency" name="paymentCurrencyCode" style={fs}>
              <Input readOnly
                value={toCurrency || ''}
                style={{ background: '#f5f5f5', color: toCurrency ? REDWOOD.info : REDWOOD.neutral600, fontWeight: 600, cursor: 'default' }}
                placeholder="Set by To Account"
                suffix={<Tooltip title="Payment currency is always the To Account currency"><span style={{ fontSize: 11, color: REDWOOD.neutral600 }}>auto</span></Tooltip>}
              />
            </Form.Item>

            <Form.Item label="Transfer Date" name="transactionDate" rules={[{ required: true, message: 'Transfer Date is required' }]} style={fs}>
              <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" disabled={isReadOnly || !buSelected} />
            </Form.Item>

            <Form.Item label="Transfer Amount" name="paymentAmount" rules={[{ required: true, message: 'Amount is required' }]} style={{ marginBottom: fromAmount != null ? 6 : 14 }}>
              <InputNumber style={{ width: '100%' }} min={0} precision={2} disabled={isReadOnly || !buSelected} />
            </Form.Item>
            {fromAmount != null && (
              <div style={{ marginBottom: 14, marginLeft: lc.span * (100 / 24) + '%', padding: '8px 12px', background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 6, fontSize: 12 }}>
                <SwapOutlined style={{ color: REDWOOD.info, marginRight: 6 }} />
                <Text style={{ color: REDWOOD.neutral600 }}>
                  {new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(watchedAmount)} {watchedPaymentCcy}
                  {' = '}
                </Text>
                <Text strong style={{ color: REDWOOD.info, fontSize: 13 }}>
                  {new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(fromAmount)} {fromCurrency}
                </Text>
                <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                  (Rate: 1 {watchedPaymentCcy} = {watchedRate} {fromCurrency})
                </Text>
              </div>
            )}

            <Form.Item label="Conversion Rate Type" name="conversionRateType" style={fs}>
              <Select placeholder="Select type" allowClear disabled={isReadOnly || !buSelected}>
                <Option value="User">User</Option>
                <Option value="Corporate">Corporate</Option>
                <Option value="Spot">Spot</Option>
                <Option value="Period Average">Period Average</Option>
              </Select>
            </Form.Item>

            <Form.Item
              label="Conversion Rate"
              name="conversionRate"
              style={fs}
              rules={[{
                required: !!(fromCurrency && toCurrency && fromCurrency !== toCurrency),
                message: 'Conversion Rate is required when currencies differ',
              }]}
            >
              <InputNumber style={{ width: '100%' }} min={0} precision={6} disabled={isReadOnly || !buSelected} />
            </Form.Item>
            {fromCurrency && toCurrency && fromCurrency !== toCurrency && (
              <div style={{ fontSize: 11, color: REDWOOD.warning, marginTop: -10, marginBottom: 8 }}>
                Required: {fromCurrency} → {toCurrency} cross-currency transfer
              </div>
            )}
          </Col>

          {/* Right column */}
          <Col xs={24} lg={12}>
            <Form.Item label=" " colon={false} name="isSettledWithIbyFlag" valuePropName="checked" style={fs}>
              <Checkbox style={{ color: REDWOOD.info, fontWeight: 500 }} disabled={isReadOnly || !buSelected}>
                Settle transaction through Payments
              </Checkbox>
            </Form.Item>

            <Form.Item label="Payment Method" name="paymentMethod" rules={[{ required: true, message: 'Payment Method is required' }]} style={fs}>
              <Select placeholder="Select method" disabled={isReadOnly || !buSelected}>
                <Option value="Electronic">Electronic</Option>
                <Option value="Check">Check</Option>
                <Option value="Wire">Wire</Option>
                <Option value="EFT">EFT</Option>
              </Select>
            </Form.Item>

            <Form.Item label="Payment Profile" name="paymentProfileName" rules={[{ required: true, message: 'Payment Profile is required' }]} style={fs}>
              <Select placeholder="Select profile" showSearch optionFilterProp="children" disabled={isReadOnly || !buSelected}>
                {['BOB BCL EFT', 'BOB BCL WIRE', 'ADIB EFT', 'ADCB EFT', 'FAB EFT'].map(p => (
                  <Option key={p} value={p}>{p}</Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item label="Memo" name="memo" style={fs}>
              <Input.TextArea rows={3} placeholder="Enter memo / description" disabled={isReadOnly || !buSelected} />
            </Form.Item>

            <Form.Item label="Attachments" style={fs}>
              <div>
                <Upload
                  fileList={attachments.map(a => ({ uid: a.uid, name: a.name, status: a.status, size: a.fileSize, type: a.fileType }))}
                  beforeUpload={(file) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                      const base64 = (e.target?.result as string)?.split(',')[1] || '';
                      setAttachments(prev => [...prev, { uid: `new-${Date.now()}`, name: file.name, fileType: file.type, fileSize: file.size, content: base64, rawFile: file, status: 'done' as const }]);
                    };
                    reader.readAsDataURL(file);
                    return false;
                  }}
                  onRemove={(file) => new Promise((resolve) => {
                    Modal.confirm({
                      title: 'Delete attachment?',
                      content: `"${file.name}" will be permanently removed.`,
                      okText: 'Delete',
                      okButtonProps: { danger: true },
                      cancelText: 'Cancel',
                      onOk: async () => {
                        const att = attachments.find(a => a.uid === file.uid);
                        if (att?.id && extTrxId) {
                          await fetch(`${APEX_BASE}/cash/externaltransactions/${extTrxId}/attachments/${att.id}`, { method: 'DELETE' }).catch(() => {});
                        }
                        setAttachments(prev => prev.filter(a => a.uid !== file.uid));
                        resolve(false);
                      },
                      onCancel: () => resolve(false),
                    });
                  })}
                  onPreview={handlePreviewAttachment}
                  onDownload={handleDownloadAttachment}
                  showUploadList={{ showPreviewIcon: true, showDownloadIcon: true, showRemoveIcon: true }}
                  multiple
                  disabled={!isEdit}
                >
                  <Button size="small" icon={<UploadOutlined />} disabled={!isEdit}>Attach Files</Button>
                </Upload>
                {previewLoading && <Spin size="small" style={{ marginTop: 6 }} />}
                {isEdit && attachments.some(a => !a.id) && (
                  <Button
                    size="small"
                    icon={<PaperClipOutlined />}
                    loading={attSaving}
                    onClick={handleSaveAttachments}
                    style={{ marginTop: 6 }}
                  >
                    Save Attachments
                  </Button>
                )}
                {!isEdit && <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>Save transfer first to add attachments</Text>}
              </div>
            </Form.Item>
          </Col>
        </Row>

        <Divider />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Button icon={<ApiOutlined />} onClick={handleApiOpen} style={{ color: REDWOOD.info, borderColor: REDWOOD.info }}>
              API
            </Button>
            {isEdit && (
              <Button icon={<PrinterOutlined />} onClick={handlePrintPdf} style={{ color: REDWOOD.info, borderColor: REDWOOD.info }}>
                Print PDF
              </Button>
            )}
          </Space>
          <Space>
            {isEdit && !isAccounted && (
              <Popconfirm
                title="Delete this transfer?"
                description="This action cannot be undone."
                onConfirm={handleDelete}
                okText="Delete"
                okButtonProps={{ danger: true }}
                cancelText="Cancel"
              >
                <Button danger loading={deleting} icon={<DeleteOutlined />}>Delete</Button>
              </Popconfirm>
            )}
            <Button onClick={onCancel}>{isEdit ? 'Close' : 'Cancel'}</Button>
            <Tooltip title={
              !isEdit ? 'Save the transfer first before creating accounting' :
              isAccounted ? 'Accounting has already been created for this transfer' :
              !cashClearingAcct ? 'Select a cash clearing account first' :
              (!selectedFromAcct || !selectedToAcct) ? 'Select both bank accounts first' : undefined
            }>
              <Button
                icon={<AccountBookOutlined />}
                onClick={() => setPreviewAcctOpen(true)}
                disabled={!isEdit || isAccounted || !selectedFromAcct || !selectedToAcct || !cashClearingAcct}
                style={{ color: (!isEdit || isAccounted) ? undefined : REDWOOD.info, borderColor: (!isEdit || isAccounted) ? undefined : REDWOOD.info }}
              >
                {isAccounted ? 'Accounted' : 'Preview Accounting'}
              </Button>
            </Tooltip>
            {!isEdit && (
              <Button type="primary" loading={saving} onClick={handleSubmit}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>
                Create Transfer
              </Button>
            )}
            {isEdit && !isPermanentlyLocked && !editMode && (
              <Button type="default" icon={<EditOutlined />}
                style={{ color: REDWOOD.info, borderColor: REDWOOD.info }}
                onClick={() => setEditMode(true)}>
                Edit
              </Button>
            )}
            {isEdit && editMode && (
              <Button type="primary" loading={saving} onClick={handleSubmit}
                style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}>
                Update
              </Button>
            )}
          </Space>
        </div>
      </Form>

      {/* ── API Inspector Modal ── */}
      <Modal
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /><span>API Inspector — Bank Transfers</span></Space>}
        open={apiModal}
        onCancel={() => setApiModal(false)}
        width={820}
        footer={null}
        styles={{ body: { padding: '16px 24px' } }}
      >
        <Tabs
          activeKey={apiTab}
          onChange={k => setApiTab(k as 'get' | 'post' | 'attachments')}
          items={[
            {
              key: 'get',
              label: 'GET /cash/banktransfers',
              children: (
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Endpoint: <Text code copyable style={{ fontSize: 12 }}>{APEX_BASE}/cash/banktransfers</Text>
                  </Text>

                  <div style={{ marginTop: 12, marginBottom: 8 }}>
                    <Text strong style={{ fontSize: 13 }}>Available Query Parameters</Text>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 16 }}>
                    <thead>
                      <tr style={{ background: REDWOOD.neutral100 }}>
                        <th style={{ padding: '6px 10px', textAlign: 'left', border: `1px solid ${REDWOOD.neutral200}`, fontWeight: 600 }}>Parameter</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left', border: `1px solid ${REDWOOD.neutral200}`, fontWeight: 600 }}>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['date_from', 'Filter transfers from this date (YYYY-MM-DD)'],
                        ['date_to', 'Filter transfers up to this date (YYYY-MM-DD)'],
                        ['from_account', 'Filter by source bank account name'],
                        ['to_account', 'Filter by destination bank account name'],
                        ['status', 'Filter by transfer status (e.g. Completed, Cancelled)'],
                        ['row_limit', 'Maximum number of rows to return (default 200)'],
                      ].map(([param, desc]) => (
                        <tr key={param}>
                          <td style={{ padding: '6px 10px', border: `1px solid ${REDWOOD.neutral200}`, fontFamily: 'monospace', color: REDWOOD.info }}>{param}</td>
                          <td style={{ padding: '6px 10px', border: `1px solid ${REDWOOD.neutral200}`, color: REDWOOD.neutral600 }}>{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                    <Button
                      type="primary"
                      icon={<ApiOutlined />}
                      loading={apiGetRunning}
                      onClick={handleApiGet}
                      style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
                    >
                      Run GET (limit 10)
                    </Button>
                  </div>

                  {apiGetResponse && (
                    <>
                      <Divider style={{ margin: '12px 0' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <Text strong>Response</Text>
                        <Tag color={apiGetResponse.status >= 200 && apiGetResponse.status < 300 ? 'success' : 'error'}>
                          HTTP {apiGetResponse.status || 'Error'}
                        </Tag>
                      </div>
                      <pre style={{
                        background: apiGetResponse.status >= 200 && apiGetResponse.status < 300 ? '#f6ffed' : '#fff2f0',
                        border: `1px solid ${apiGetResponse.status >= 200 && apiGetResponse.status < 300 ? '#b7eb8f' : '#ffccc7'}`,
                        color: REDWOOD.neutral900, padding: 16, borderRadius: 6,
                        fontSize: 12, overflowX: 'auto', maxHeight: 280, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                        margin: 0,
                      }}>
                        {apiGetResponse.body}
                      </pre>
                    </>
                  )}
                </div>
              ),
            },
            {
              key: 'post',
              label: 'POST /cash/banktransfers',
              children: (
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Endpoint: <Text code copyable style={{ fontSize: 12 }}>{APEX_BASE}/cash/banktransfers</Text>
                  </Text>

                  <div style={{ marginTop: 12, marginBottom: 8 }}>
                    <Text strong>Request Body (JSON)</Text>
                  </div>
                  <pre style={{
                    background: '#1e1e2e', color: '#cdd6f4', padding: 16, borderRadius: 6,
                    fontSize: 12, overflowX: 'auto', maxHeight: 320, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                    margin: 0,
                  }}>
                    {apiPayload}
                  </pre>

                  <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      type="primary"
                      icon={<ApiOutlined />}
                      loading={apiPosting}
                      onClick={handleApiPost}
                      style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
                    >
                      POST Request
                    </Button>
                  </div>

                  {apiResponse && (
                    <>
                      <Divider style={{ margin: '16px 0 12px' }} />
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
                        fontSize: 12, overflowX: 'auto', maxHeight: 240, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                        margin: 0,
                      }}>
                        {apiResponse.body}
                      </pre>
                    </>
                  )}
                </div>
              ),
            },
            {
              key: 'attachments',
              label: 'Attachments API',
              children: (() => {
                const baseUrl = inspTxnIdInput
                  ? `${APEX_BASE}/cash/externaltransactions/${inspTxnIdInput}/attachments`
                  : `${APEX_BASE}/cash/externaltransactions/:externalTransactionId/attachments`;
                const singleUrl = inspTxnIdInput && inspAttIdInput
                  ? `${APEX_BASE}/cash/externaltransactions/${inspTxnIdInput}/attachments/${inspAttIdInput}`
                  : `${APEX_BASE}/cash/externaltransactions/:externalTransactionId/attachments/:attachmentId`;
                const samplePayload = JSON.stringify({
                  fileName: 'document.pdf',
                  fileType: 'application/pdf',
                  fileSize: 12345,
                  content: '<base64-encoded file content>',
                  createdBy: 'ERP_USER',
                }, null, 2);
                const sqlBlock = `-- Run in SQL Workshop → SQL Commands

-- 1) External Transactions — GET single attachment with content
BEGIN
  ORDS.DEFINE_HANDLER(
    p_module_name    => 'reerp',
    p_pattern        => 'cash/externaltransactions/:externalTransactionId/attachments/:attachmentId',
    p_method         => 'GET',
    p_source_type    => ORDS.source_type_plsql,
    p_items_per_page => 0,
    p_source         => q'[
DECLARE r RR_EXTERNAL_TRX_ATTACHMENTS%ROWTYPE;
BEGIN
  SELECT * INTO r FROM RR_EXTERNAL_TRX_ATTACHMENTS
   WHERE ID = :attachmentId AND EXTERNAL_TRANSACTION_ID = :externalTransactionId;
  HTP.P(\'{"id":\' || r.ID
    || \',"fileName":\' || APEX_JSON.STRINGIFY(r.FILE_NAME)
    || \',"fileType":\' || APEX_JSON.STRINGIFY(NVL(r.FILE_TYPE,\'\'))
    || \',"content":\' || APEX_JSON.STRINGIFY(NVL(r.FILE_CONTENT,\'\'))
    || \'}\');
EXCEPTION WHEN NO_DATA_FOUND THEN HTP.P(\'{"error":"Not found"}\');
WHEN OTHERS THEN HTP.P(\'{"error":\' || APEX_JSON.STRINGIFY(SQLERRM) || \'}\');
END;]'
  );
  COMMIT;
END;
/

-- 2) Bank Transfers — GET single attachment with content
BEGIN
  ORDS.DEFINE_HANDLER(
    p_module_name    => 'reerp',
    p_pattern        => 'cash/banktransfers/:transferId/attachments/:attachmentId',
    p_method         => 'GET',
    p_source_type    => ORDS.source_type_plsql,
    p_items_per_page => 0,
    p_source         => q'[
DECLARE r RR_BANK_TRANSFER_ATTACHMENTS%ROWTYPE;
BEGIN
  SELECT * INTO r FROM RR_BANK_TRANSFER_ATTACHMENTS
   WHERE ID = :attachmentId AND BANK_ACCOUNT_TRANSFER_ID = :transferId;
  HTP.P(\'{"id":\' || r.ID
    || \',"fileName":\' || APEX_JSON.STRINGIFY(r.FILE_NAME)
    || \',"fileType":\' || APEX_JSON.STRINGIFY(NVL(r.FILE_TYPE,\'\'))
    || \',"content":\' || APEX_JSON.STRINGIFY(NVL(r.FILE_CONTENT,\'\'))
    || \'}\');
EXCEPTION WHEN NO_DATA_FOUND THEN HTP.P(\'{"error":"Not found"}\');
WHEN OTHERS THEN HTP.P(\'{"error":\' || APEX_JSON.STRINGIFY(SQLERRM) || \'}\');
END;]'
  );
  COMMIT;
END;
/`;
                return (
                  <div>
                    {/* ID inputs */}
                    <Row gutter={8} style={{ marginBottom: 10 }}>
                      <Col span={12}>
                        <Text style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>
                          External Transaction ID <Text type="secondary" style={{ fontSize: 10 }}>(fromExternalTrxId)</Text>
                        </Text>
                        <Input
                          size="small"
                          value={inspTxnIdInput}
                          onChange={e => setInspTxnIdInput(e.target.value)}
                          placeholder="e.g. 2420251"
                          style={{ fontFamily: 'monospace', fontSize: 12 }}
                        />
                      </Col>
                      <Col span={12}>
                        <Text style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>
                          Attachment ID <Text type="secondary" style={{ fontSize: 10 }}>(from list above)</Text>
                        </Text>
                        <Input
                          size="small"
                          value={inspAttIdInput}
                          onChange={e => setInspAttIdInput(e.target.value)}
                          placeholder="e.g. 26"
                          style={{ fontFamily: 'monospace', fontSize: 12 }}
                        />
                      </Col>
                    </Row>

                    {/* Endpoints */}
                    <div style={{ background: '#f0f5ff', border: '1px solid #adc6ff', borderRadius: 6, padding: '10px 14px', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Tag color="green" style={{ fontSize: 11, margin: 0 }}>GET</Tag>
                        <Text type="secondary" style={{ fontSize: 11, marginRight: 4 }}>list</Text>
                        <Text code copyable style={{ fontSize: 12, wordBreak: 'break-all' }}>{baseUrl}</Text>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Tag color="green" style={{ fontSize: 11, margin: 0 }}>GET</Tag>
                        <Text type="secondary" style={{ fontSize: 11, marginRight: 4 }}>single</Text>
                        <Text code copyable style={{ fontSize: 12, wordBreak: 'break-all' }}>{singleUrl}</Text>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>POST</Tag>
                        <Text type="secondary" style={{ fontSize: 11, marginRight: 4 }}>upload</Text>
                        <Text code copyable style={{ fontSize: 12, wordBreak: 'break-all' }}>{baseUrl}</Text>
                      </div>
                    </div>

                    {/* POST body */}
                    <div style={{ marginBottom: 10 }}>
                      <Text strong style={{ fontSize: 12 }}>POST Body (JSON):</Text>
                      <pre style={{ background: '#1e1e2e', color: '#cdd6f4', padding: 10, borderRadius: 6, fontSize: 11, margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
                        {samplePayload}
                      </pre>
                    </div>

                    {/* Test buttons */}
                    <Space wrap style={{ marginBottom: 10 }}>
                      <Button size="small" disabled={!inspTxnIdInput} onClick={() => {
                        if (!inspTxnIdInput) return;
                        setAttApiLog(prev => [...prev.slice(-9), { dir: 'GET list', url: baseUrl, status: null, body: '…fetching…' }]);
                        fetch(baseUrl, { headers: { Accept: 'application/json' } })
                          .then(r => r.text().then(t => ({ status: r.status, t })))
                          .then(({ status, t }) => {
                            const body = (() => { try { return JSON.stringify(JSON.parse(t), null, 2); } catch { return t; } })();
                            setAttApiLog(prev => [...prev.slice(-9), { dir: 'GET list', url: baseUrl, status, body }]);
                          })
                          .catch(e => setAttApiLog(prev => [...prev.slice(-9), { dir: 'GET list', url: baseUrl, status: 0, body: String(e) }]));
                      }}>Test GET List</Button>
                      <Button size="small" loading={attGetSingleTesting} disabled={!inspTxnIdInput || !inspAttIdInput}
                        title={!inspAttIdInput ? 'Enter an Attachment ID above' : ''}
                        onClick={async () => {
                          if (!inspTxnIdInput || !inspAttIdInput) return;
                          setAttGetSingleTesting(true);
                          setAttApiLog(prev => [...prev.slice(-9), { dir: 'GET single', url: singleUrl, status: null, body: '…fetching…' }]);
                          try {
                            const r = await fetch(singleUrl, { headers: { Accept: 'application/json' } });
                            const t = await r.text();
                            const parsed = (() => { try { return JSON.parse(t); } catch { return null; } })();
                            const preview = parsed ? JSON.stringify({ ...parsed, content: parsed.content ? `<${parsed.content.length} chars of base64>` : '' }, null, 2) : t;
                            setAttApiLog(prev => [...prev.slice(-9), { dir: 'GET single', url: singleUrl, status: r.status, body: preview }]);
                            if (r.ok && parsed?.content) message.success('GET single OK — content returned!');
                            else if (r.ok) message.warning('GET single OK but no content field — endpoint may not be registered yet.');
                            else message.error(`GET single failed — HTTP ${r.status}`);
                          } catch (e: any) {
                            setAttApiLog(prev => [...prev.slice(-9), { dir: 'GET single', url: singleUrl, status: 0, body: 'Network error: ' + e.message }]);
                            message.error('GET single failed: ' + e.message);
                          } finally { setAttGetSingleTesting(false); }
                        }}>Test GET Single</Button>
                      <>
                        <input
                          id="insp-file-input"
                          type="file"
                          style={{ display: 'none' }}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file || !inspTxnIdInput) return;
                            setAttPostTesting(true);
                            try {
                              const base64 = await new Promise<string>((resolve, reject) => {
                                const reader = new FileReader();
                                reader.onload = () => {
                                  const result = reader.result as string;
                                  resolve(result.split(',')[1] ?? result);
                                };
                                reader.onerror = reject;
                                reader.readAsDataURL(file);
                              });
                              const inspPayload = JSON.stringify({ fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, content: base64, createdBy: 'ERP_USER' });
                              const res = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: inspPayload });
                              const t = await res.text();
                              const respBody = (() => { try { return JSON.stringify(JSON.parse(t), null, 2); } catch { return t; } })();
                              setAttApiLog(prev => [...prev.slice(-9), {
                                dir: 'POST upload',
                                url: uploadUrl,
                                status: res.status,
                                body: `━━ REQUEST ━━\nFile: ${file.name}  |  size: ${file.size} bytes (raw binary — no base64)\nPOST ${uploadUrl}\n\n━━ SERVER RESPONSE (HTTP ${res.status}) ━━\n${respBody}`,
                              }]);
                              if (res.ok) message.success(`POST succeeded — check the log for bodyLen / contentLength`);
                              else message.error(`POST failed — HTTP ${res.status}. Check the log.`);
                            } catch (e: any) {
                              setAttApiLog(prev => [...prev.slice(-9), { dir: 'POST upload', url: baseUrl, status: 0, body: 'Error: ' + e.message }]);
                              message.error('POST failed: ' + e.message);
                            } finally { setAttPostTesting(false); }
                          }}
                        />
                        <input
                          id="insp-dl-input"
                          type="file"
                          style={{ display: 'none' }}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            const base64 = await new Promise<string>((resolve, reject) => {
                              const reader = new FileReader();
                              reader.onload = () => { const r = reader.result as string; resolve(r.split(',')[1] ?? r); };
                              reader.onerror = reject;
                              reader.readAsDataURL(file);
                            });
                            const payload = { fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, content: base64, createdBy: 'ERP_USER' };
                            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(blob);
                            a.download = file.name.replace(/\.[^.]+$/, '') + '-postman.json';
                            a.click();
                            URL.revokeObjectURL(a.href);
                            message.success(`Downloaded ${a.download} — use as raw JSON body in Postman`);
                          }}
                        />
                        <Button size="small" type="primary" loading={attPostTesting} disabled={!inspTxnIdInput}
                          style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
                          onClick={() => { document.getElementById('insp-file-input')?.click(); }}>
                          Test POST (pick file)
                        </Button>
                        <Button size="small" onClick={() => { document.getElementById('insp-dl-input')?.click(); }}
                          title="Pick a file → downloads full JSON with base64 for Postman">
                          ↓ Postman JSON
                        </Button>
                      </>
                    </Space>

                    {/* SQL to register handlers */}
                    <Divider style={{ margin: '8px 0' }} />
                    <Collapse ghost size="small">
                      <Panel header={<Text strong style={{ fontSize: 12 }}>SQL — Register GET single-attachment handlers in ORDS</Text>} key="sql">
                        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
                          Copy and run in SQL Workshop → SQL Commands. Required for preview &amp; download to work.
                        </Text>
                        <pre style={{ background: '#1e1e2e', color: '#cdd6f4', padding: 10, borderRadius: 6, fontSize: 11, overflowX: 'auto', maxHeight: 320, whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, userSelect: 'all' }}>
                          {sqlBlock}
                        </pre>
                      </Panel>
                    </Collapse>

                    {/* Log */}
                    <Divider style={{ margin: '8px 0' }} />
                    <Text strong style={{ fontSize: 13 }}>Request / Response Log</Text>
                    <div style={{ marginTop: 8 }}>
                      {attApiLog.length === 0 ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>No calls logged yet.</Text>
                      ) : (
                        [...attApiLog].reverse().map((entry, i) => (
                          <div key={i} style={{ marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <Tag color={entry.dir.startsWith('POST') ? 'blue' : 'green'} style={{ fontSize: 11 }}>{entry.dir}</Tag>
                              {entry.status != null && (
                                <Tag color={entry.status >= 200 && entry.status < 300 ? 'success' : 'error'}>HTTP {entry.status}</Tag>
                              )}
                              <Text type="secondary" style={{ fontSize: 11, wordBreak: 'break-all' }}>{entry.url}</Text>
                            </div>
                            <pre style={{ background: '#1e1e2e', color: '#cdd6f4', padding: 10, borderRadius: 6, fontSize: 11, overflowX: 'auto', maxHeight: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                              {entry.body}
                            </pre>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })(),
            },
          ]}
        />
      </Modal>

      {/* ── PDF Preview Modal ── */}
      <Modal
        title={<Space><PrinterOutlined style={{ color: REDWOOD.info }} /><span>Bank Transfer — PDF Preview</span></Space>}
        open={voucherModalOpen}
        onCancel={() => { setVoucherModalOpen(false); if (voucherPdfUrl) URL.revokeObjectURL(voucherPdfUrl); setVoucherPdfUrl(null); }}
        footer={[
          <Button key="dl" type="primary" icon={<DownloadOutlined />}
            style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
            onClick={() => { if (!voucherPdfUrl) return; const a = document.createElement('a'); a.href = voucherPdfUrl; a.download = `transfer-${initialValues?.bankAccountTransferNumber ?? 'draft'}.pdf`; a.click(); }}>
            Download PDF
          </Button>,
          <Button key="cl" onClick={() => { setVoucherModalOpen(false); if (voucherPdfUrl) URL.revokeObjectURL(voucherPdfUrl); setVoucherPdfUrl(null); }}>Close</Button>,
        ]}
        width={820}
        styles={{ body: { padding: 0 } }}
        destroyOnClose
      >
        {voucherPdfUrl && <iframe src={voucherPdfUrl} style={{ width: '100%', height: '75vh', border: 'none' }} title="Transfer PDF" />}
      </Modal>

      {/* ── Attachment Preview Modal ── */}
      <Modal
        title={<Space><PaperClipOutlined style={{ color: REDWOOD.info }} /><span>{previewAtt?.name}</span></Space>}
        open={!!previewAtt}
        onCancel={() => { if (previewAtt?.blobUrl) URL.revokeObjectURL(previewAtt.blobUrl); setPreviewAtt(null); }}
        footer={[
          <Button key="dl" icon={<DownloadOutlined />} type="primary"
            style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
            onClick={() => {
              if (!previewAtt) return;
              const a = document.createElement('a');
              a.href = previewAtt.blobUrl || `data:${previewAtt.fileType};base64,${previewAtt.content}`;
              a.download = previewAtt.name;
              a.click();
            }}>
            Download
          </Button>,
          <Button key="cl" onClick={() => { if (previewAtt?.blobUrl) URL.revokeObjectURL(previewAtt.blobUrl); setPreviewAtt(null); }}>Close</Button>,
        ]}
        width={860}
        styles={{ body: { padding: 0, minHeight: 200 } }}
      >
        {previewAtt && (() => {
          if (previewAtt.fileType?.startsWith('image/')) {
            return <div style={{ textAlign: 'center', padding: 16 }}><img src={previewAtt.blobUrl} alt={previewAtt.name} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} /></div>;
          }
          if (previewAtt.fileType?.includes('pdf')) {
            return <embed src={previewAtt.blobUrl} type="application/pdf" style={{ width: '100%', height: '70vh' }} />;
          }
          return (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <PaperClipOutlined style={{ fontSize: 48, color: '#aaa', marginBottom: 12 }} />
              <div><Text type="secondary">Preview not available. Download to view.</Text></div>
              <Button icon={<DownloadOutlined />} style={{ marginTop: 16 }}
                onClick={() => {
                  if (!previewAtt) return;
                  const a = document.createElement('a');
                  a.href = previewAtt.blobUrl || `data:${previewAtt.fileType};base64,${previewAtt.content}`;
                  a.download = previewAtt.name;
                  a.click();
                }}>
                Download
              </Button>
            </div>
          );
        })()}
      </Modal>

      {/* Cash Clearing Account Selector */}
      <AccountSelector
        visible={cashClearingOpen}
        onCancel={() => setCashClearingOpen(false)}
        initialValue={cashClearingAcct}
        lockedFirstSegment={derivedCompany || undefined}
        onSelect={(code: string, segments: Record<string, { value: string; description: string; name?: string }>) => {
          setCashClearingAcct(code);
          const desc = Object.values(segments).map(s => s.description).filter(Boolean).join(' | ');
          setCashClearingDesc(desc);
          setCashClearingOpen(false);
        }}
      />

      {/* Preview Accounting Modal */}
      <Modal
        open={previewAcctOpen}
        onCancel={() => setPreviewAcctOpen(false)}
        title={<Space><AccountBookOutlined style={{ color: REDWOOD.info }} /> Preview Accounting — Bank Transfer</Space>}
        width={820}
        footer={
          <Space>
            <Button onClick={() => setPreviewAcctOpen(false)}>Close</Button>
            <Button type="primary" loading={acctCreating}
              disabled={isAccounted || !cashClearingAcct || !selectedFromAcct || !selectedToAcct}
              style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
              onClick={async () => {
                const values = form.getFieldsValue();
                const pmtAmt = values.paymentAmount ?? 0;
                const rate   = values.conversionRate ?? 1;
                const fromAsset = bankAccountAssetMap[selectedFromAcct] || '';
                const toAsset   = bankAccountAssetMap[selectedToAcct]   || '';
                setAcctCreating(true);
                try {
                  const { createAccounting, fetchLedgerByBusinessUnit, derivePeriodName } = await import('../../services/sla.service');
                  const ledger = await fetchLedgerByBusinessUnit(values.businessUnit || '');
                  const today  = values.transactionDate ? values.transactionDate.format('YYYY-MM-DD') : new Date().toISOString().slice(0,10);
                  const period = derivePeriodName(new Date(today));

                  // Journal 1: DR Cash Clearing / CR From Bank (From currency)
                  const j1currency = fromCurrency || 'AED';
                  const j1Rate     = j1currency === 'AED' ? 1 : (rate || 1);
                  await createAccounting({
                    header: {
                      moduleName: 'CM', sourceTable: 'BANK_ACCOUNT_TRANSFERS',
                      sourceId: initialValues?.bankAccountTransferId ?? 0,
                      sourceNumber: String(values.bankAccountTransferNumber ?? ''),
                      sourceType: 'Bank Transfer', eventTypeCode: 'BANK_TRANSFER_DISBURSE',
                      eventDate: today, accountingDate: today, periodName: period,
                      ledgerId: ledger?.ledgerId ?? 0, ledgerName: ledger?.ledgerName ?? '',
                      currencyCode: j1currency, ledgerCurrency: 'AED',
                      exchangeRate: j1Rate, exchangeRateType: 'Corporate',
                      businessUnit: values.businessUnit, description: `Bank Transfer - Disbursement`,
                      createdBy: 'SYSTEM',
                    },
                    lines: [
                      { lineNumber: 1, lineType: 'DR', accountingClass: 'CASH_CLEARING',
                        accountCombination: cashClearingAcct,
                        enteredDr: pmtAmt, enteredCr: 0,
                        accountedDr: Math.round(pmtAmt * j1Rate * 100) / 100, accountedCr: 0,
                        currencyCode: j1currency, exchangeRate: j1Rate,
                        description: `Cash Clearing DR – From ${selectedFromAcct}` },
                      { lineNumber: 2, lineType: 'CR', accountingClass: 'BANK_ASSET',
                        accountCombination: fromAsset,
                        enteredDr: 0, enteredCr: pmtAmt,
                        accountedDr: 0, accountedCr: Math.round(pmtAmt * j1Rate * 100) / 100,
                        currencyCode: j1currency, exchangeRate: j1Rate,
                        description: `From Bank CR – ${selectedFromAcct}` },
                    ],
                  });

                  // Journal 2: DR To Bank / CR Cash Clearing (To currency)
                  const j2currency = toCurrency || 'AED';
                  const j2Rate     = j2currency === 'AED' ? 1 : (rate || 1);
                  const isCross2   = j2currency !== j1currency;
                  const toAmt      = !isCross2
                    ? pmtAmt
                    : j1currency !== 'AED'
                      ? Math.round(pmtAmt * j1Rate * 100) / 100
                      : rate > 0 ? Math.round((pmtAmt / rate) * 100) / 100 : pmtAmt;
                  await createAccounting({
                    header: {
                      moduleName: 'CM', sourceTable: 'BANK_ACCOUNT_TRANSFERS',
                      sourceId: initialValues?.bankAccountTransferId ?? 0,
                      sourceNumber: String(values.bankAccountTransferNumber ?? ''),
                      sourceType: 'Bank Transfer', eventTypeCode: 'BANK_TRANSFER_RECEIPT',
                      eventDate: today, accountingDate: today, periodName: period,
                      ledgerId: ledger?.ledgerId ?? 0, ledgerName: ledger?.ledgerName ?? '',
                      currencyCode: j2currency, ledgerCurrency: 'AED',
                      exchangeRate: j2Rate, exchangeRateType: 'Corporate',
                      businessUnit: values.businessUnit, description: `Bank Transfer - Receipt`,
                      createdBy: 'SYSTEM',
                    },
                    lines: [
                      { lineNumber: 1, lineType: 'DR', accountingClass: 'BANK_ASSET',
                        accountCombination: toAsset,
                        enteredDr: toAmt, enteredCr: 0,
                        accountedDr: Math.round(toAmt * j2Rate * 100) / 100, accountedCr: 0,
                        currencyCode: j2currency, exchangeRate: j2Rate,
                        description: `To Bank DR – ${selectedToAcct}` },
                      { lineNumber: 2, lineType: 'CR', accountingClass: 'CASH_CLEARING',
                        accountCombination: cashClearingAcct,
                        enteredDr: 0, enteredCr: toAmt,
                        accountedDr: 0, accountedCr: Math.round(toAmt * j2Rate * 100) / 100,
                        currencyCode: j2currency, exchangeRate: j2Rate,
                        description: `Cash Clearing CR – To ${selectedToAcct}` },
                    ],
                  });

                  message.success('Accounting journals created successfully');
                  setPreviewAcctOpen(false);
                } catch (e: any) {
                  message.error('Failed to create accounting: ' + e.message);
                } finally {
                  setAcctCreating(false);
                }
              }}>
              Create Accounting
            </Button>
          </Space>
        }
        destroyOnClose
      >
        {(() => {
          const values = form.getFieldsValue();
          const pmtAmt = values.paymentAmount ?? 0;
          const rate   = values.conversionRate ?? 1;
          const j1currency = fromCurrency || 'AED';
          const j1Rate     = j1currency === 'AED' ? 1 : (rate || 1);
          const j2currency = toCurrency || 'AED';
          const j2Rate     = j2currency === 'AED' ? 1 : (rate || 1);
          const isCross    = j1currency !== j2currency;
          const toAmt      = !isCross
            ? pmtAmt
            : j1currency !== 'AED'
              ? Math.round(pmtAmt * j1Rate * 100) / 100
              : rate > 0 ? Math.round((pmtAmt / rate) * 100) / 100 : pmtAmt;
          const fromAsset  = bankAccountAssetMap[selectedFromAcct] || '—';
          const toAsset    = bankAccountAssetMap[selectedToAcct]   || '—';
          const clearing   = cashClearingAcct || '—';

          if (!cashClearingAcct) return (
            <Alert type="warning" message="Please select a Cash Clearing Account before previewing accounting." showIcon />
          );

          const lineStyle = { fontSize: 12, padding: '6px 12px' };
          const hdrStyle  = { background: '#f0f5ff', fontWeight: 600 as const, fontSize: 12, padding: '8px 12px', borderRadius: '6px 6px 0 0' };

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Journal 1 */}
              <div style={{ border: `1px solid ${REDWOOD.neutral200}`, borderRadius: 6, overflow: 'hidden' }}>
                <div style={hdrStyle}>
                  <Space>
                    <Tag color="blue">Journal 1</Tag>
                    <span>Disbursement — {selectedFromAcct}</span>
                    <Tag color="geekblue">{j1currency}</Tag>
                  </Space>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: REDWOOD.neutral100, fontSize: 11, color: REDWOOD.neutral600 }}>
                      <th style={{ padding: '4px 12px', textAlign: 'left' }}>Account</th>
                      <th style={{ padding: '4px 12px', textAlign: 'right' }}>Entered Dr</th>
                      <th style={{ padding: '4px 12px', textAlign: 'right' }}>Entered Cr</th>
                      <th style={{ padding: '4px 12px', textAlign: 'right' }}>Accounted Dr (AED)</th>
                      <th style={{ padding: '4px 12px', textAlign: 'right' }}>Accounted Cr (AED)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderTop: `1px solid ${REDWOOD.neutral200}` }}>
                      <td style={lineStyle}><Tag color="green" style={{ fontSize: 10 }}>DR</Tag> <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>{clearing}</Text> <Text type="secondary" style={{ fontSize: 11 }}>(Cash Clearing)</Text></td>
                      <td style={{ ...lineStyle, textAlign: 'right', color: REDWOOD.success, fontWeight: 500 }}>{new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2 }).format(pmtAmt)} {j1currency}</td>
                      <td style={lineStyle} />
                      <td style={{ ...lineStyle, textAlign: 'right' }}>{new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2 }).format(Math.round(pmtAmt * j1Rate * 100) / 100)}</td>
                      <td style={lineStyle} />
                    </tr>
                    <tr style={{ borderTop: `1px solid ${REDWOOD.neutral200}` }}>
                      <td style={lineStyle}><Tag color="red" style={{ fontSize: 10 }}>CR</Tag> <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>{fromAsset}</Text> <Text type="secondary" style={{ fontSize: 11 }}>(From Bank)</Text></td>
                      <td style={lineStyle} />
                      <td style={{ ...lineStyle, textAlign: 'right', color: REDWOOD.error, fontWeight: 500 }}>{new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2 }).format(pmtAmt)} {j1currency}</td>
                      <td style={lineStyle} />
                      <td style={{ ...lineStyle, textAlign: 'right' }}>{new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2 }).format(Math.round(pmtAmt * j1Rate * 100) / 100)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Journal 2 */}
              <div style={{ border: `1px solid ${REDWOOD.neutral200}`, borderRadius: 6, overflow: 'hidden' }}>
                <div style={hdrStyle}>
                  <Space>
                    <Tag color="green">Journal 2</Tag>
                    <span>Receipt — {selectedToAcct}</span>
                    <Tag color="success">{j2currency}</Tag>
                  </Space>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: REDWOOD.neutral100, fontSize: 11, color: REDWOOD.neutral600 }}>
                      <th style={{ padding: '4px 12px', textAlign: 'left' }}>Account</th>
                      <th style={{ padding: '4px 12px', textAlign: 'right' }}>Entered Dr</th>
                      <th style={{ padding: '4px 12px', textAlign: 'right' }}>Entered Cr</th>
                      <th style={{ padding: '4px 12px', textAlign: 'right' }}>Accounted Dr (AED)</th>
                      <th style={{ padding: '4px 12px', textAlign: 'right' }}>Accounted Cr (AED)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderTop: `1px solid ${REDWOOD.neutral200}` }}>
                      <td style={lineStyle}><Tag color="green" style={{ fontSize: 10 }}>DR</Tag> <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>{toAsset}</Text> <Text type="secondary" style={{ fontSize: 11 }}>(To Bank)</Text></td>
                      <td style={{ ...lineStyle, textAlign: 'right', color: REDWOOD.success, fontWeight: 500 }}>{new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2 }).format(toAmt)} {j2currency}</td>
                      <td style={lineStyle} />
                      <td style={{ ...lineStyle, textAlign: 'right' }}>{new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2 }).format(Math.round(toAmt * j2Rate * 100) / 100)}</td>
                      <td style={lineStyle} />
                    </tr>
                    <tr style={{ borderTop: `1px solid ${REDWOOD.neutral200}` }}>
                      <td style={lineStyle}><Tag color="red" style={{ fontSize: 10 }}>CR</Tag> <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>{clearing}</Text> <Text type="secondary" style={{ fontSize: 11 }}>(Cash Clearing)</Text></td>
                      <td style={lineStyle} />
                      <td style={{ ...lineStyle, textAlign: 'right', color: REDWOOD.error, fontWeight: 500 }}>{new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2 }).format(toAmt)} {j2currency}</td>
                      <td style={lineStyle} />
                      <td style={{ ...lineStyle, textAlign: 'right' }}>{new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2 }).format(Math.round(toAmt * j2Rate * 100) / 100)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <Alert type="info" showIcon style={{ fontSize: 12 }}
                message="Cash Clearing nets to zero — Journal 1 Dr is offset by Journal 2 Cr through the clearing account." />
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// ── API Inspector Panel ──────────────────────────────────────────────────────
const ApiInspectorPanel: React.FC<{ apexBase: string; lastApiUrl: string }> = ({ apexBase, lastApiUrl }) => {
  const [results, setResults] = React.useState<Record<string, { loading: boolean; status?: number; body?: string; error?: string }>>({});

  const endpoints = [
    { key: 'bu',   label: 'Business Units LOV',   color: 'blue',    url: `${apexBase}/gl/businessunits` },
    { key: 'ba',   label: 'Bank Accounts LOV',     color: 'cyan',    url: `${apexBase}/banks/bankaccounts` },
    { key: 'list', label: 'Bank Transfers (last search)', color: 'green', url: lastApiUrl || `${apexBase}/cash/banktransfers` },
    { key: 'post', label: 'POST — Create/Sync',    color: 'orange',  url: `${apexBase}/cash/banktransfers`, method: 'POST' },
  ];

  const test = async (key: string, url: string, method = 'GET') => {
    setResults(prev => ({ ...prev, [key]: { loading: true } }));
    try {
      const res = await fetch(url, method === 'POST' ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"items":[]}' } : {});
      const text = await res.text();
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch {}
      setResults(prev => ({ ...prev, [key]: { loading: false, status: res.status, body: pretty.slice(0, 2000) + (pretty.length > 2000 ? '\n…(truncated)' : '') } }));
    } catch (e: any) {
      setResults(prev => ({ ...prev, [key]: { loading: false, error: e.message } }));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {endpoints.map(ep => {
        const r = results[ep.key];
        return (
          <div key={ep.key} style={{ border: `1px solid #2d333b`, borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ background: '#161b22', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Tag color={ep.color} style={{ margin: 0, fontSize: 10, flexShrink: 0 }}>{ep.method ?? 'GET'}</Tag>
                <Text style={{ color: '#8b949e', fontSize: 11, flexShrink: 0 }}>{ep.label}</Text>
              </div>
              <Button size="small" loading={r?.loading}
                style={{ fontSize: 11, flexShrink: 0 }}
                onClick={() => test(ep.key, ep.url, ep.method)}>
                Test
              </Button>
            </div>
            <div style={{ background: '#0d1117', padding: '6px 12px' }}>
              <Text copyable={{ text: ep.url }} style={{ color: '#58a6ff', fontSize: 11, wordBreak: 'break-all', display: 'block' }}>
                {ep.url}
              </Text>
            </div>
            {r && !r.loading && (
              <div style={{ background: '#0d1117', borderTop: '1px solid #2d333b', padding: '8px 12px' }}>
                {r.error
                  ? <Text style={{ color: '#f85149', fontSize: 11 }}>Error: {r.error}</Text>
                  : (
                    <>
                      <Tag color={r.status === 200 ? 'success' : 'error'} style={{ marginBottom: 6 }}>HTTP {r.status}</Tag>
                      <pre style={{ color: '#c9d1d9', fontSize: 11, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto' }}>
                        {r.body}
                      </pre>
                    </>
                  )
                }
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Main Page
// ────────────────────────────────────────────────────────────────────────────
interface TabItem { key: string; label: React.ReactNode; record?: TransferRecord; }

const ManageBankTransfers: React.FC<{ module?: 'ap' | 'cash' }> = ({ module = 'cash' }) => {
  const { user } = useAuth();
  const currentUser = user?.email ?? user?.username ?? 'SYSTEM';
  const { addSessionEntry } = useGlValidation();

  // ── State ─────────────────────────────────────────────────────────────────
  const [transfers, setTransfers]         = useState<TransferRecord[]>([]);
  const [loading, setLoading]             = useState(false);
  const [hasSearched, setHasSearched]     = useState(false);
  const [bankAccounts, setBankAccounts]       = useState<BankAccountOption[]>([]);
  const [businessUnits, setBusinessUnits]     = useState<BUOption[]>([]);
  const [bankCurrencyMap, setBankCurrencyMap] = useState<Record<string, string>>({});
  const [buBankMap, setBuBankMap]             = useState<Record<string, string[]>>({});
  const [bankAccountAssetMap, setBankAccountAssetMap] = useState<Record<string, string>>({});
  const [buCompanyMap, setBuCompanyMap]               = useState<Record<string, string>>({});
  const [activeTab, setActiveTab]         = useState('search');
  const [editTabs, setEditTabs]           = useState<TabItem[]>([]);
  const [showApiModal, setShowApiModal]   = useState(false);
  const [lastApiUrl, setLastApiUrl]       = useState('');
  const [gridSearch, setGridSearch]       = useState('');
  const [searchBu, setSearchBu]           = useState<string | undefined>(undefined);
  const [searchForm]                      = Form.useForm();

  // ── Create Accounting state ───────────────────────────────────────────────
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [acctModalOpen, setAcctModalOpen]     = useState(false);
  const [acctProgress, setAcctProgress]       = useState<TransferAcctRow[]>([]);
  const [acctRunning, setAcctRunning]         = useState(false);
  const [acctDone, setAcctDone]               = useState(false);
  // ── View Accounting state ─────────────────────────────────────────────────
  const [viewAcctOpen, setViewAcctOpen]       = useState(false);
  const [viewAcctSourceId, setViewAcctSourceId] = useState<number | null>(null);
  const [viewAcctLines, setViewAcctLines]     = useState<any[]>([]);
  const [viewAcctLoading, setViewAcctLoading] = useState(false);

  const modulePrefix = module === 'ap' ? '/ap' : '/cash';

  // ── Load LOV data ─────────────────────────────────────────────────────────
  const loadLovs = useCallback(async () => {
    const buBankMapLocal: Record<string, string[]> = {};
    const currMapLocal: Record<string, string> = {};
    const assetMapLocal: Record<string, string> = {};
    const companyMapLocal: Record<string, string> = {};
    const acctSet = new Set<string>();
    const buSet   = new Set<string>();

    // 1. BUs from dedicated endpoint
    try {
      const res  = await fetch(`${APEX_BASE}/gl/businessunits`);
      const data = await res.json();
      console.log('[ManageBankTransfers] gl/businessunits response:', data);
      (data.items ?? []).forEach((b: any) => {
        const name    = b.business_unit_name || b.businessUnitName || b.BUSINESS_UNIT_NAME;
        const company = b.company || b.COMPANY || '';
        if (name) { buSet.add(name); if (company) companyMapLocal[name] = company; }
      });
    } catch (e) { console.error('[ManageBankTransfers] gl/businessunits failed:', e); }

    // 2. Bank accounts from master table
    try {
      const res  = await fetch(`${APEX_BASE}/banks/bankaccounts`);
      const data = await res.json();
      console.log('[ManageBankTransfers] banks/bankaccounts response:', data);
      (data.items ?? []).forEach((i: any) => {
        const acct = i.bank_account_name ?? i.bankAccountName ?? i.BANK_ACCOUNT_NAME;
        const le   = i.legal_entity_name ?? i.legalEntityName ?? i.LEGAL_ENTITY_NAME;
        if (!acct) return;
        acctSet.add(acct);
        const ccy  = i.currency_code ?? i.currencyCode;
        const cash = i.cash_account_combination ?? i.cashAccountCombination;
        if (ccy)  currMapLocal[acct] = ccy;
        if (cash) assetMapLocal[acct] = cash;
        if (le) {
          buSet.add(le);
          if (!buBankMapLocal[le]) buBankMapLocal[le] = [];
          if (!buBankMapLocal[le].includes(acct)) buBankMapLocal[le].push(acct);
        }
      });
    } catch (e) { console.error('[ManageBankTransfers] banks/bankaccounts failed:', e); }

    // 3. External transactions — supplement BU→bank mapping + asset map
    try {
      const res  = await fetch(`${APEX_BASE}/cash/externaltransactions?row_limit=2000`);
      const data = await res.json();
      (data.items ?? []).forEach((i: any) => {
        const acct = i.bankAccountName;
        const bu   = i.businessUnitName;
        if (!acct) return;
        acctSet.add(acct);
        if (bu) {
          buSet.add(bu);
          if (!buBankMapLocal[bu]) buBankMapLocal[bu] = [];
          if (!buBankMapLocal[bu].includes(acct)) buBankMapLocal[bu].push(acct);
        }
        if (i.assetAccountCombination) assetMapLocal[acct] = i.assetAccountCombination;
        if (i.currencyCode && !currMapLocal[acct]) currMapLocal[acct] = i.currencyCode;
      });
    } catch (e) { console.error('[ManageBankTransfers] externaltransactions failed:', e); }

    console.log('[ManageBankTransfers] buSet:', [...buSet]);
    console.log('[ManageBankTransfers] acctSet:', [...acctSet]);
    setBankAccounts([...acctSet].sort().map(n => ({ label: n, value: n })));
    setBuBankMap(buBankMapLocal);
    setBankAccountAssetMap(assetMapLocal);
    setBankCurrencyMap(currMapLocal);
    setBuCompanyMap(companyMapLocal);
    setBusinessUnits([...buSet].sort().map(n => ({ label: n, value: n })));
  }, []);

  useEffect(() => { loadLovs(); }, [loadLovs]);

  // ── Search ────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    const values = searchForm.getFieldsValue();
    const params = new URLSearchParams();
    if (values.dateFrom) params.set('date_from', (values.dateFrom as Dayjs).format('YYYY-MM-DD'));
    if (values.dateTo)   params.set('date_to',   (values.dateTo as Dayjs).format('YYYY-MM-DD'));
    if (values.fromAccount) params.set('from_account', values.fromAccount);
    if (values.toAccount)   params.set('to_account',   values.toAccount);
    if (values.status)      params.set('status',        values.status);
    if (values.businessUnit) params.set('business_unit', values.businessUnit);
    params.set('row_limit', '200');

    const url = `${APEX_BASE}/cash/banktransfers?${params.toString()}`;
    setLastApiUrl(url);
    setLoading(true);
    setHasSearched(true);
    try {
      const res  = await fetch(url);
      const data = await parseApexJson(res);
      if (data.status === 'success') {
        setTransfers(data.items ?? []);
        if ((data.items ?? []).length === 0) message.info('No transfers found for the selected criteria.');
      } else {
        message.error(data.message || 'Search failed.');
      }
    } catch (e: any) {
      message.error('Network error: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [searchForm]);

  const handleReset = () => { searchForm.resetFields(); setTransfers([]); setHasSearched(false); };

  const exportToExcel = () => {
    const rows = transfers.map(t => ({
      'Transfer ID':          t.bankAccountTransferId ?? '',
      'Transfer Number':      t.bankAccountTransferNumber ?? '',
      'Date':                 t.transactionDate ?? '',
      'From Account':         t.fromBankAccountName ?? '',
      'To Account':           t.toBankAccountName ?? '',
      'Business Unit':        t.businessUnit ?? '',
      'Payment Amount':       t.paymentAmount ?? '',
      'From Amount':          t.fromAmount ?? '',
      'From Currency':        t.fromCurrencyCode ?? '',
      'To Currency':          t.toCurrencyCode ?? '',
      'Payment Currency':     t.paymentCurrencyCode ?? '',
      'Conversion Rate':      t.conversionRate ?? '',
      'Conversion Rate Type': t.conversionRateType ?? '',
      'Status':               t.status ?? '',
      'Payment Status':       t.paymentStatus ?? '',
      'Payment Method':       t.paymentMethod ?? '',
      'Payment Profile':      t.paymentProfileName ?? '',
      'Settled via IBY':      t.isSettledWithIbyFlag ?? '',
      'Memo':                 t.memo ?? '',
      'Created By':           t.createdBy ?? '',
      'Creation Date':        t.creationDate ?? '',
      'Last Update Date':     t.lastUpdateDate ?? '',
      'Sync Date':            t.syncDate ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bank Transfers');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buf], { type: 'application/octet-stream' }), `bank_transfers_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`);
  };

  // ── Tab management ────────────────────────────────────────────────────────
  const openCreate = () => {
    const exists = editTabs.find(t => t.key === 'create');
    if (exists) { setActiveTab('create'); return; }
    setEditTabs(prev => [...prev, { key: 'create', label: <span><PlusOutlined /> New Transfer</span> }]);
    setActiveTab('create');
  };

  const openEdit = (record: TransferRecord) => {
    const existingKey = editTabs.find(t => t.record?.bankAccountTransferId === record.bankAccountTransferId)?.key;
    if (existingKey) { setActiveTab(existingKey); return; }
    const key = newTabKey();
    setEditTabs(prev => [...prev, {
      key,
      label: <span><EditOutlined /> #{record.bankAccountTransferNumber}</span>,
      record,
    }]);
    setActiveTab(key);
  };

  const closeTab = (key: string) => {
    setEditTabs(prev => prev.filter(t => t.key !== key));
    if (activeTab === key) setActiveTab('search');
  };

  const handleSaved = async (created?: { bankAccountTransferId: number; bankAccountTransferNumber: string }) => {
    loadLovs();
    handleSearch();
    if (created) {
      // Fetch the newly created record and open it as an edit tab, replacing the create tab
      try {
        const res = await fetch(`${APEX_BASE}/cash/banktransfers/${created.bankAccountTransferId}`, { headers: { Accept: 'application/json' } });
        const data = res.ok ? await res.json() : null;
        const record: TransferRecord | null = data?.items?.[0] ?? data ?? null;
        if (record?.bankAccountTransferId) {
          const key = newTabKey();
          setEditTabs(prev => [
            ...prev.filter(t => t.key !== 'create'),
            { key, label: <span><EditOutlined /> #{record.bankAccountTransferNumber}</span>, record },
          ]);
          setActiveTab(key);
        }
      } catch {
        // If fetch fails just close the create tab
        setEditTabs(prev => prev.filter(t => t.key !== 'create'));
        setActiveTab('search');
      }
    }
  };
  const handleEditSaved = (_created?: { bankAccountTransferId: number; bankAccountTransferNumber: string }) => { loadLovs(); handleSearch(); };

  // ── Create Accounting ─────────────────────────────────────────────────────
  const openCreateAccountingModal = (forTransfers?: TransferRecord[]) => {
    const selected = forTransfers ?? transfers.filter(t => selectedRowKeys.includes(t.bankAccountTransferId));
    const rows: TransferAcctRow[] = selected.map(t => {
      const alreadyAccounted = t.accountingFlag === 'Y';
      const fromAsset    = bankAccountAssetMap[t.fromBankAccountName] || '';
      const toAsset      = bankAccountAssetMap[t.toBankAccountName]   || '';
      const clearingAcct = t.cashClearingAccount || '';
      const date = t.transactionDate || dayjs().format('YYYY-MM-DD');
      let status: TransferAcctRow['status'] = 'pending';
      let msg: string | undefined;
      if (alreadyAccounted) { status = 'skipped'; msg = 'Already accounted — skipped'; }
      else if (!fromAsset || !toAsset) { status = 'error'; msg = `Missing asset account for ${!fromAsset ? t.fromBankAccountName : t.toBankAccountName}`; }
      else if (!clearingAcct) { status = 'error'; msg = 'No cash clearing account — open the record and set it first'; }
      return {
        transferId:      t.bankAccountTransferId,
        txnDate:         date,
        periodName:      derivePeriodName(new Date(date)),
        amount:          Math.abs(t.paymentAmount ?? 0),
        currency:        t.fromCurrencyCode || t.paymentCurrencyCode || 'AED',
        fromCurrency:    t.fromCurrencyCode || 'AED',
        toCurrency:      t.toCurrencyCode   || 'AED',
        fromAsset,
        toAsset,
        clearingAccount: clearingAcct,
        fromBankName:    t.fromBankAccountName || '',
        toBankName:      t.toBankAccountName   || '',
        bu:              t.businessUnit || '',
        drAccount:       toAsset,
        crAccount:       fromAsset,
        status, message: msg,
      };
    });
    setAcctProgress(rows);
    setAcctDone(false);
    setAcctModalOpen(true);
  };

  const runCreateAccounting = async () => {
    setAcctRunning(true);
    const updateRow = (transferId: number, partial: Partial<TransferAcctRow>) =>
      setAcctProgress(prev => prev.map(r => r.transferId === transferId ? { ...r, ...partial } : r));

    for (const row of acctProgress) {
      if (row.status === 'skipped' || row.status === 'error') continue;
      updateRow(row.transferId, { status: 'running' });
      const txn = transfers.find(t => t.bankAccountTransferId === row.transferId);
      if (!txn) { updateRow(row.transferId, { status: 'error', message: 'Transfer not found' }); continue; }

      try {
        const [existingDisburse, existingReceipt] = await Promise.all([
          checkAccountingExists('BANK_ACCOUNT_TRANSFERS', txn.bankAccountTransferId, 'BANK_TRANSFER_DISBURSE'),
          checkAccountingExists('BANK_ACCOUNT_TRANSFERS', txn.bankAccountTransferId, 'BANK_TRANSFER_RECEIPT'),
        ]);
        const bothPosted = existingDisburse.exists && existingReceipt.exists;
        if (bothPosted) {
          updateRow(row.transferId, { status: 'skipped', message: `Already posted — SLA ${existingDisburse.headerId}/${existingReceipt.headerId}` });
          setTransfers(prev => prev.map(t => t.bankAccountTransferId === txn.bankAccountTransferId ? { ...t, accountingFlag: 'Y' } : t));
          continue;
        }

        const ledger = await fetchLedgerByBusinessUnit(txn.businessUnit);
        if (!ledger) { updateRow(row.transferId, { status: 'error', message: 'Could not resolve ledger for BU' }); continue; }

        const fromAsset    = bankAccountAssetMap[txn.fromBankAccountName] || '';
        const toAsset      = bankAccountAssetMap[txn.toBankAccountName]   || '';
        const clearingAcct = txn.cashClearingAccount || '';
        const pmtAmt       = Math.abs(txn.paymentAmount ?? 0);
        const rate         = txn.conversionRate || 1;

        // Resolve currencies — DB fields may be NULL for synced transfers, fall back to bankCurrencyMap
        const j1currency = txn.fromCurrencyCode || bankCurrencyMap[txn.fromBankAccountName] || 'AED';
        const j2currency = txn.toCurrencyCode   || bankCurrencyMap[txn.toBankAccountName]   || 'AED';
        const isCross    = j1currency !== j2currency;

        // Exchange rates: the stored conversionRate is always "foreign units per 1 AED" direction
        // if j1 is functional (AED), rate applies to j2; otherwise rate applies to j1.
        const j1Rate = j1currency === 'AED' ? 1 : rate;
        const j2Rate = j2currency === 'AED' ? 1 : rate;

        // toAmt = amount the TO bank receives in its own currency
        // When j1 is foreign and j2 is AED: toAmt = pmtAmt (foreign) × rate = AED equivalent
        // When j1 is AED and j2 is foreign: toAmt = pmtAmt (AED) ÷ rate  (guard divide-by-zero)
        // When same currency: toAmt = pmtAmt
        const toAmt = !isCross
          ? pmtAmt
          : j1currency !== 'AED'
            ? Math.round(pmtAmt * j1Rate * 100) / 100
            : rate > 0
              ? Math.round((pmtAmt / rate) * 100) / 100
              : pmtAmt;

        const postGlAndSla = async (
          slaPayload: Parameters<typeof createAccounting>[0],
          glJournalName: string,
          glLines: Array<{ accountCombination: string; enteredDr: number | null; enteredCr: number | null; accountedDr: number | null; accountedCr: number | null; currencyCode: string; description: string; accountingClass: string }>,
          glAmount: number,
          glCurrency: string,
          existingSla: Awaited<ReturnType<typeof checkAccountingExists>>,
          glRef5: string,
        ) => {
          // Reuse existing SLA header if already created; otherwise create a new one
          let slaResult: { headerId: number };
          if (existingSla.exists && existingSla.headerId) {
            slaResult = { headerId: existingSla.headerId };
          } else {
            slaResult = await createAccounting(slaPayload);
          }

          // Check GL journal before creating to prevent duplicates
          const glCheck = await checkGLJournalExists(
            String(txn.bankAccountTransferId),
            String(txn.bankAccountTransferNumber),
            glRef5,
          );
          if (glCheck.exists) {
            // GL already exists — link SLA if not yet linked
            if (!existingSla.exists || existingSla.postingStatus !== 'POSTED') {
              await fetch(`${APEX_BASE}/sla/accounting/post`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({
                  headerId: slaResult.headerId, glBatchId: glCheck.batchId || 0,
                  glBatchName: glJournalName, glHeaderId: glCheck.headerId || 0,
                  postedBy: currentUser,
                }),
              });
            }
            return slaResult;
          }

          const glPayload = {
            batch: {
              batchName: glJournalName, batchDescription: slaPayload.header.description,
              ledgerName: ledger.ledgerName, ledgerId: ledger.ledgerId, status: 'NEW',
              accountingPeriod: row.periodName, controlTotal: glAmount,
              runningTotalDr: glAmount, runningTotalCr: glAmount,
              batchSource: 'Cash Management', createdBy: currentUser,
            },
            header: {
              ledgerId: ledger.ledgerId, ledgerName: ledger.ledgerName,
              jeCategory: 'Cash Management', jeSource: 'Cash Management',
              periodName: row.periodName, journalName: glJournalName,
              description: slaPayload.header.description,
              currencyCode: glCurrency,
              currencyConversionType: 'Corporate',
              currencyConversionDate: row.txnDate,
              currencyConversionRate: glCurrency === 'AED' ? 1 : rate,
              defaultEffectiveDate: row.txnDate,
              status: 'NEW', runningTotalDr: glAmount, runningTotalCr: glAmount,
              createdBy: currentUser,
            },
            lines: glLines.map(l => ({
              ...l,
              statAmount: null,
              currencyConversionDate: row.txnDate,
              currencyConversionRate: glCurrency === 'AED' ? 1 : rate,
              userCurrencyConversionType: 'Corporate',
              chartOfAccountsName: 'Chart of Accounts',
              reference1: String(txn.bankAccountTransferId),
              reference2: String(txn.bankAccountTransferNumber),
              reference4: txn.businessUnit || null,
              reference5: glRef5, createdBy: currentUser,
            })),
          };
          const glRes = await fetch(`${APEX_BASE}/journals/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(glPayload),
          });
          if (!glRes.ok) {
            const errData = await glRes.json().catch(() => ({}));
            throw new Error(errData?.message || `GL journals/create failed (HTTP ${glRes.status})`);
          }
          const glData   = await glRes.json();
          const glBatchId  = glData.jeBatchId  ?? glData.je_batch_id  ?? glData.batchId  ?? null;
          const glHeaderId = glData.jeHeaderId ?? glData.je_header_id ?? glData.headerId ?? null;

          // Post the GL batch to move it from NEW → POSTED
          if (glBatchId) {
            const postRes = await fetch(`${APEX_BASE}/gl/journals/${glBatchId}/post`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: '{}',
            });
            if (!postRes.ok) {
              const postData = await postRes.json().catch(() => ({}));
              const err = Array.isArray(postData?.errors) && postData.errors.length > 0
                ? postData.errors[0] : postData?.error || `HTTP ${postRes.status}`;
              throw new Error(`GL post failed: ${err}`);
            }
          }

          // Stamp SLA header with GL reference
          await fetch(`${APEX_BASE}/sla/accounting/post`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              headerId: slaResult.headerId, glBatchId: glBatchId || 0,
              glBatchName: glJournalName, glHeaderId: glHeaderId || 0,
              postedBy: currentUser,
            }),
          });
          return slaResult;
        };

        const j1Name = `BANKTFR-${txn.bankAccountTransferNumber}-DISBURSE`;
        const j2Name = `BANKTFR-${txn.bankAccountTransferNumber}-RECEIPT`;
        const skipDisburse = existingDisburse.exists && existingDisburse.postingStatus === 'POSTED';
        const skipReceipt  = existingReceipt.exists  && existingReceipt.postingStatus  === 'POSTED';

        // Journal 1 (Disbursement): DR Cash Clearing / CR From Bank
        if (!skipDisburse) {
          await postGlAndSla(
            {
              header: {
                moduleName: 'CM', sourceTable: 'BANK_ACCOUNT_TRANSFERS',
                sourceId: txn.bankAccountTransferId,
                sourceNumber: String(txn.bankAccountTransferNumber),
                sourceType: 'Bank Transfer', eventTypeCode: 'BANK_TRANSFER_DISBURSE',
                eventDate: row.txnDate, accountingDate: row.txnDate, periodName: row.periodName,
                ledgerId: ledger.ledgerId, ledgerName: ledger.ledgerName,
                currencyCode: j1currency, ledgerCurrency: ledger.currency || 'AED',
                exchangeRate: j1Rate, exchangeRateType: 'Corporate',
                businessUnit: txn.businessUnit, description: `Bank Transfer ${txn.bankAccountTransferNumber} — Disbursement`,
                createdBy: currentUser,
              },
              lines: [
                { lineNumber: 1, lineType: 'DR', accountingClass: 'CASH_CLEARING',
                  accountCombination: clearingAcct, enteredDr: pmtAmt, enteredCr: 0,
                  accountedDr: Math.round(pmtAmt * j1Rate * 100) / 100, accountedCr: 0,
                  currencyCode: j1currency, exchangeRate: j1Rate,
                  description: `Cash Clearing DR – ${txn.fromBankAccountName}` },
                { lineNumber: 2, lineType: 'CR', accountingClass: 'BANK_ASSET',
                  accountCombination: fromAsset, enteredDr: 0, enteredCr: pmtAmt,
                  accountedDr: 0, accountedCr: Math.round(pmtAmt * j1Rate * 100) / 100,
                  currencyCode: j1currency, exchangeRate: j1Rate,
                  description: `From Bank CR – ${txn.fromBankAccountName}` },
              ],
            },
            j1Name,
            [
              { accountCombination: clearingAcct, enteredDr: pmtAmt, enteredCr: null, accountedDr: Math.round(pmtAmt * j1Rate * 100) / 100, accountedCr: null, currencyCode: j1currency, description: `Cash Clearing DR – ${txn.fromBankAccountName}`, accountingClass: 'CASH_CLEARING' },
              { accountCombination: fromAsset,    enteredDr: null, enteredCr: pmtAmt, accountedDr: null, accountedCr: Math.round(pmtAmt * j1Rate * 100) / 100, currencyCode: j1currency, description: `From Bank CR – ${txn.fromBankAccountName}`,    accountingClass: 'BANK_ASSET' },
            ],
            pmtAmt, j1currency, existingDisburse, 'BANKTFR-DISBURSE',
          );
        }

        // Journal 2 (Receipt): DR To Bank / CR Cash Clearing
        if (!skipReceipt) {
          await postGlAndSla(
            {
              header: {
                moduleName: 'CM', sourceTable: 'BANK_ACCOUNT_TRANSFERS',
                sourceId: txn.bankAccountTransferId,
                sourceNumber: String(txn.bankAccountTransferNumber),
                sourceType: 'Bank Transfer', eventTypeCode: 'BANK_TRANSFER_RECEIPT',
                eventDate: row.txnDate, accountingDate: row.txnDate, periodName: row.periodName,
                ledgerId: ledger.ledgerId, ledgerName: ledger.ledgerName,
                currencyCode: j2currency, ledgerCurrency: ledger.currency || 'AED',
                exchangeRate: j2Rate, exchangeRateType: 'Corporate',
                businessUnit: txn.businessUnit, description: `Bank Transfer ${txn.bankAccountTransferNumber} — Receipt`,
                createdBy: currentUser,
              },
              lines: [
                { lineNumber: 1, lineType: 'DR', accountingClass: 'BANK_ASSET',
                  accountCombination: toAsset, enteredDr: toAmt, enteredCr: 0,
                  accountedDr: Math.round(toAmt * j2Rate * 100) / 100, accountedCr: 0,
                  currencyCode: j2currency, exchangeRate: j2Rate,
                  description: `To Bank DR – ${txn.toBankAccountName}` },
                { lineNumber: 2, lineType: 'CR', accountingClass: 'CASH_CLEARING',
                  accountCombination: clearingAcct, enteredDr: 0, enteredCr: toAmt,
                  accountedDr: 0, accountedCr: Math.round(toAmt * j2Rate * 100) / 100,
                  currencyCode: j2currency, exchangeRate: j2Rate,
                  description: `Cash Clearing CR – ${txn.toBankAccountName}` },
              ],
            },
            j2Name,
            [
              { accountCombination: toAsset,      enteredDr: toAmt, enteredCr: null, accountedDr: Math.round(toAmt * j2Rate * 100) / 100, accountedCr: null, currencyCode: j2currency, description: `To Bank DR – ${txn.toBankAccountName}`,         accountingClass: 'BANK_ASSET' },
              { accountCombination: clearingAcct, enteredDr: null, enteredCr: toAmt, accountedDr: null, accountedCr: Math.round(toAmt * j2Rate * 100) / 100, currencyCode: j2currency, description: `Cash Clearing CR – ${txn.toBankAccountName}`, accountingClass: 'CASH_CLEARING' },
            ],
            toAmt, j2currency, existingReceipt, 'BANKTFR-RECEIPT',
          );
        }

        // Stamp accountingFlag
        const flagUrl = `${APEX_BASE}/cash/banktransfers/${txn.bankAccountTransferId}/acctflag?updated_by=${encodeURIComponent(currentUser)}`;
        const flagRes = await fetch(flagUrl, { method: 'PUT', headers: { Accept: 'application/json' } });
        const flagData = await flagRes.json().catch(() => ({})) as { success?: boolean; message?: string };
        if (!flagRes.ok || !flagData.success) {
          throw new Error(flagData.message || `Accounting flag update failed (HTTP ${flagRes.status})`);
        }
        setTransfers(prev => prev.map(t =>
          t.bankAccountTransferId === txn.bankAccountTransferId ? { ...t, accountingFlag: 'Y' } : t
        ));
        updateRow(row.transferId, { status: 'success', message: `GL: ${j1Name} + ${j2Name}` });
      } catch (e: any) {
        updateRow(row.transferId, { status: 'error', message: e?.message || 'Unexpected error' });
      }
    }

    setAcctRunning(false);
    setAcctDone(true);
    setSelectedRowKeys([]);
  };

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns: ColumnsType<TransferRecord> = [
    {
      title: 'Transfer Number',
      dataIndex: 'bankAccountTransferNumber',
      key: 'transferNum',
      width: 110,
      fixed: 'left',
      render: (val, record) => (
        <div>
          <Button type="link" size="small" style={{ color: REDWOOD.info, padding: 0, fontWeight: 500 }}
            onClick={() => openEdit(record)}>
            {val ?? '—'}
          </Button>
          {record.businessUnit && (
            <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginTop: 1 }}>{record.businessUnit}</div>
          )}
        </div>
      ),
    },
    {
      title: 'From Account',
      dataIndex: 'fromBankAccountName',
      key: 'fromAcct',
      width: 180,
      render: (val: string) => (
        <Tooltip title={val}>
          <Text style={{ fontSize: 12 }}>{shortAcct(val)}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'To Account',
      dataIndex: 'toBankAccountName',
      key: 'toAcct',
      width: 180,
      render: (val: string) => (
        <Tooltip title={val}>
          <Text style={{ fontSize: 12 }}>{shortAcct(val)}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Pmt Currency',
      dataIndex: 'paymentCurrencyCode',
      key: 'paymentCurrencyCode',
      width: 90,
      render: (v: string) => v ? <Tag style={{ margin: 0, fontSize: 11 }}>{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Transfer Amt',
      dataIndex: 'paymentAmount',
      key: 'paymentAmount',
      width: 120,
      align: 'right' as const,
      render: (v: number, r: TransferRecord) => (
        <Text style={{ fontWeight: 500, color: REDWOOD.neutral900 }}>
          {fmtAmount(v, r.paymentCurrencyCode)}
        </Text>
      ),
    },
    {
      title: 'Conv. Rate',
      key: 'convRate',
      width: 120,
      align: 'right' as const,
      render: (_: any, r: TransferRecord) => {
        if (!r.conversionRate || r.fromCurrencyCode === r.toCurrencyCode) return <Text type="secondary">—</Text>;
        return (
          <Tooltip title={`${r.fromCurrencyCode} → ${r.toCurrencyCode}`}>
            <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>
              {r.conversionRate.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: 'Transfer Date',
      dataIndex: 'transactionDate',
      key: 'txnDate',
      width: 110,
      render: fmtDate,
      sorter: (a, b) => (a.transactionDate ?? '').localeCompare(b.transactionDate ?? ''),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Amount',
      key: 'amount',
      width: 140,
      align: 'right',
      render: (_, r) => (
        <Text style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          {new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(r.paymentAmount ?? 0)}
        </Text>
      ),
      sorter: (a, b) => (a.paymentAmount ?? 0) - (b.paymentAmount ?? 0),
    },
    {
      title: 'Currency',
      dataIndex: 'fromCurrencyCode',
      key: 'ccy',
      width: 80,
      render: (val: string) => val ? <Tag style={{ fontSize: 11 }}>{val}</Tag> : <Text type="secondary">—</Text>,
      filters: [...new Set(transfers.map(t => t.fromCurrencyCode).filter(Boolean))].map(c => ({ text: c, value: c })),
      onFilter: (val, rec) => rec.fromCurrencyCode === val,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (val: string) => val ? <Badge status={statusColor(val) as any} text={<Text style={{ fontSize: 12 }}>{val}</Text>} /> : <Text type="secondary">—</Text>,
      filters: [
        { text: 'Completed', value: 'Completed' },
        { text: 'Cancelled', value: 'Cancelled' },
        { text: 'Terminated', value: 'Terminated' },
      ],
      onFilter: (val, rec) => rec.status === val,
    },
    {
      title: 'Payment Status',
      dataIndex: 'paymentStatus',
      key: 'pmtStatus',
      width: 140,
      render: (val: string) => val
        ? <Button type="link" size="small" style={{ color: REDWOOD.info, padding: 0, fontSize: 12 }}>{val.replace(/_/g, ' ')}</Button>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'Payment File',
      dataIndex: 'paymentFile',
      key: 'pmtFile',
      width: 100,
      render: (val: number) => val
        ? <Button type="link" size="small" style={{ color: REDWOOD.info, padding: 0, fontSize: 12 }}>{val}</Button>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'From Ext. Trx',
      dataIndex: 'fromExternalTrxId',
      key: 'fromExtTrx',
      width: 110,
      render: (val: number) => val
        ? <Button type="link" size="small" style={{ color: REDWOOD.info, padding: 0, fontSize: 12 }}>{val}</Button>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'To Ext. Trx',
      dataIndex: 'toExternalTrxId',
      key: 'toExtTrx',
      width: 110,
      render: (val: number) => val
        ? <Button type="link" size="small" style={{ color: REDWOOD.info, padding: 0, fontSize: 12 }}>{val}</Button>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'Accounting',
      key: 'acctFlag',
      width: 100,
      render: (_, r) => r.accountingFlag === 'Y'
        ? <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontSize: 11 }}>Accounted</Tag>
        : <Tag color="default" style={{ fontSize: 11 }}>Unposted</Tag>,
    },
    {
      title: 'Reconciled',
      key: 'reconStatus',
      width: 110,
      render: (_, r) => {
        const isRecon = r.reconciledFlag === 'Y';
        return isRecon
          ? <Tag color="green" icon={<CheckCircleOutlined />} style={{ fontSize: 11 }}>Reconciled</Tag>
          : <Tag color="orange" style={{ fontSize: 11 }}>Unreconciled</Tag>;
      },
      filters: [
        { text: 'Reconciled',   value: 'Y' },
        { text: 'Unreconciled', value: 'N' },
      ],
      onFilter: (val, r) => val === 'Y' ? r.reconciledFlag === 'Y' : r.reconciledFlag !== 'Y',
    },
    {
      title: 'Cleared Date',
      dataIndex: 'reconciledDate',
      key: 'reconciledDate',
      width: 110,
      render: (val: string) => val ? fmtDate(val) : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 110,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          {record.accountingFlag === 'Y' ? (
            <Tooltip title="View Accounting">
              <Button type="text" size="small" icon={<EyeOutlined />}
                style={{ color: REDWOOD.success }}
                onClick={async () => {
                  setViewAcctSourceId(record.bankAccountTransferId);
                  setViewAcctLines([]);
                  setViewAcctLoading(true);
                  setViewAcctOpen(true);
                  try {
                    const { getLinesByHeaderId } = await import('../../services/sla.service');
                    // Step 1: get all headers for this transfer (exact sourceTable, sourceNumber)
                    const hdrsUrl = `${APEX_BASE}/sla/journals?sourceTable=BANK_ACCOUNT_TRANSFERS&sourceNumber=${encodeURIComponent(String(record.bankAccountTransferNumber))}&moduleName=CM&limit=20`;
                    const hdrsRes = await fetch(hdrsUrl);
                    const hdrsData = hdrsRes.ok ? await hdrsRes.json() : { items: [] };
                    const headers = (hdrsData.items ?? []).filter(
                      (h: any) => String(h.sourceNumber) === String(record.bankAccountTransferNumber)
                    );
                    // Step 2: fetch lines for each header individually
                    const allLines: any[] = [];
                    for (const hdr of headers) {
                      const linesResult = await getLinesByHeaderId(hdr.headerId);
                      (linesResult.items ?? []).forEach((l: any) => allLines.push({
                        ...l,
                        headerId: hdr.headerId,
                        eventTypeCode: hdr.eventTypeCode,
                        periodName: hdr.periodName,
                        currencyCode: l.currencyCode || hdr.currencyCode,
                      }));
                    }
                    setViewAcctLines(allLines);
                  } catch { setViewAcctLines([]); }
                  finally { setViewAcctLoading(false); }
                }} />
            </Tooltip>
          ) : (
            <Tooltip title="Create Accounting (2 journals)">
              <Button type="text" size="small" icon={<AccountBookOutlined />}
                style={{ color: REDWOOD.info }}
                onClick={() => openCreateAccountingModal([record])} />
            </Tooltip>
          )}
          <Tooltip title="Print PDF">
            <Button type="text" size="small" icon={<PrinterOutlined />}
              style={{ color: REDWOOD.neutral600 }}
              onClick={() => {
                const doc = generateTransferPdf(record);
                const blob = doc.output('blob');
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
              }} />
          </Tooltip>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />}
              style={{ color: REDWOOD.info }}
              onClick={() => openEdit(record)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // ── Search panel ──────────────────────────────────────────────────────────
  // compute filtered options for search form
  const searchBankOpts = searchBu && buBankMap[searchBu]?.length
    ? bankAccounts.filter(a => buBankMap[searchBu].includes(a.value))
    : bankAccounts;

  const searchPanel = (
    <Card
      style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
      styles={{ body: { padding: '16px 20px 4px' } }}
    >
      <Form form={searchForm} layout="horizontal" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }}>
        <Row gutter={24}>
          <Col xs={24} sm={12} lg={8}>
            <Form.Item label="Business Unit" name="businessUnit">
              <Select showSearch allowClear placeholder="Any" options={businessUnits} optionFilterProp="label"
                onChange={(v) => setSearchBu(v ?? undefined)}
                onClear={() => setSearchBu(undefined)}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Form.Item label="From Account" name="fromAccount">
              <Select showSearch allowClear placeholder="Any" options={searchBankOpts} optionFilterProp="label" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Form.Item label="To Account" name="toAccount">
              <Select showSearch allowClear placeholder="Any" options={searchBankOpts} optionFilterProp="label" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Form.Item label="Date From" name="dateFrom">
              <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Form.Item label="Date To" name="dateTo">
              <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Form.Item label="Status" name="status">
              <Select allowClear placeholder="Any">
                <Option value="Completed">Completed</Option>
                <Option value="Cancelled">Cancelled</Option>
                <Option value="Terminated">Terminated</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
        <Row justify="end" style={{ marginBottom: 12 }}>
          <Space>
            <Button onClick={handleReset}>Reset</Button>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>
              Search
            </Button>
          </Space>
        </Row>
      </Form>
    </Card>
  );

  // ── Results table ─────────────────────────────────────────────────────────
  const resultsPanel = (
    <>
      {/* Toolbar */}
      {(() => {
        const q = gridSearch.trim().toLowerCase();
        const filtered = q
          ? transfers.filter(r =>
              [r.bankAccountTransferNumber, r.fromBankAccountName, r.toBankAccountName,
               r.businessUnit, r.status, r.paymentStatus, r.paymentMethod,
               r.paymentProfileName, r.memo, r.transactionDate, r.fromCurrencyCode]
              .some(v => String(v ?? '').toLowerCase().includes(q))
            )
          : transfers;
        return (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <Space>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {hasSearched
                    ? `${filtered.length}${q && filtered.length !== transfers.length ? ` / ${transfers.length}` : ''} transfer${filtered.length !== 1 ? 's' : ''} found`
                    : 'Use the search panel above to find transfers'}
                </Text>
                {hasSearched && (
                  <Input
                    prefix={<SearchOutlined style={{ color: REDWOOD.neutral600 }} />}
                    placeholder="Filter results…"
                    allowClear
                    size="small"
                    style={{ width: 220 }}
                    value={gridSearch}
                    onChange={e => setGridSearch(e.target.value)}
                  />
                )}
              </Space>
              <Space>
                {selectedRowKeys.length > 0 && (
                  <Button size="small" icon={<AccountBookOutlined />}
                    style={{ color: REDWOOD.info, borderColor: REDWOOD.info }}
                    onClick={openCreateAccountingModal}>
                    Create Accounting ({selectedRowKeys.length})
                  </Button>
                )}
                <Tooltip title="API endpoint">
                  <Button size="small" icon={<ApiOutlined />} onClick={() => setShowApiModal(true)}
                    style={{ color: REDWOOD.info }} />
                </Tooltip>
                <Button size="small" icon={<ReloadOutlined />} onClick={handleSearch} loading={loading}>Refresh</Button>
                <Button size="small" icon={<PlusOutlined />} type="primary"
                  style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                  onClick={openCreate}>
                  Create Transfer
                </Button>
              </Space>
            </div>

            <div style={{ background: REDWOOD.surface, borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, overflow: 'hidden' }}>
              <Table<TransferRecord>
                columns={columns}
                dataSource={filtered}
          rowKey="bankAccountTransferId"
          loading={loading}
          size="small"
          scroll={{ x: 1500 }}
          rowSelection={{ selectedRowKeys, onChange: keys => setSelectedRowKeys(keys as number[]), getCheckboxProps: r => ({ disabled: r.accountingFlag === 'Y' }) }}
          pagination={{
            pageSize: 15,
            showSizeChanger: true,
            showTotal: total => `${total} transfer${total !== 1 ? 's' : ''}`,
            style: { padding: '8px 16px' },
          }}
              locale={{ emptyText: hasSearched ? <Empty description="No transfers found" /> : <Empty description="Enter search criteria and click Search" /> }}
              onRow={record => ({ onDoubleClick: () => openEdit(record), style: { cursor: 'pointer' } })}
            />
            </div>
          </>
        );
      })()}
    </>
  );

  // ── Tab items ─────────────────────────────────────────────────────────────
  const tabItems = [
    {
      key: 'search',
      label: <span><SearchOutlined /> Search</span>,
      children: (
        <div style={{ padding: '16px 0' }}>
          {searchPanel}
          {resultsPanel}
        </div>
      ),
    },
    // Create tab
    ...editTabs.filter(t => t.key === 'create').map(t => ({
      key: 'create',
      label: (
        <span>
          {t.label}
          <CloseOutlined style={{ marginLeft: 6, fontSize: 10 }} onClick={e => { e.stopPropagation(); closeTab('create'); }} />
        </span>
      ),
      children: (
        <TransferForm
          bankAccounts={bankAccounts}
          businessUnits={businessUnits}
          bankCurrencyMap={bankCurrencyMap}
          buBankMap={buBankMap}
          bankAccountAssetMap={bankAccountAssetMap}
          buCompanyMap={buCompanyMap}
          onSave={handleSaved}
          onCancel={() => closeTab('create')}
        />
      ),
    })),
    // Edit tabs
    ...editTabs.filter(t => t.key !== 'create').map(t => ({
      key: t.key,
      label: (
        <span>
          {t.label}
          <CloseOutlined style={{ marginLeft: 6, fontSize: 10 }} onClick={e => { e.stopPropagation(); closeTab(t.key); }} />
        </span>
      ),
      children: (
        <TransferForm
          initialValues={t.record}
          bankAccounts={bankAccounts}
          businessUnits={businessUnits}
          bankCurrencyMap={bankCurrencyMap}
          buBankMap={buBankMap}
          bankAccountAssetMap={bankAccountAssetMap}
          buCompanyMap={buCompanyMap}
          onSave={handleEditSaved}
          onCancel={() => closeTab(t.key)}
        />
      ),
    })),
  ];

  // ── Breadcrumb items ──────────────────────────────────────────────────────
  const breadcrumbItems = module === 'ap'
    ? [
        { title: <Link to="/home"><HomeOutlined /> Home</Link> },
        { title: <Link to="/ap">Payables</Link> },
        { title: 'Manage Bank Transfers' },
      ]
    : [
        { title: <Link to="/home"><HomeOutlined /> Home</Link> },
        { title: <Link to="/cash">Cash Management</Link> },
        { title: 'Manage Bank Transfers' },
      ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb */}
        <div style={{ padding: '14px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={breadcrumbItems} />
        </div>

        <div style={{ padding: 24 }}>
          {/* Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 12 }}>
            <Space>
              <Button icon={<DownloadOutlined />} onClick={exportToExcel} disabled={transfers.length === 0}>
                Export to Excel
              </Button>
              <Button icon={<PlusOutlined />} type="primary" onClick={openCreate}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>
                Create Transfer
              </Button>
            </Space>
          </div>

          {/* Tabs */}
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            type="card"
            items={tabItems}
            style={{ background: REDWOOD.surface, borderRadius: 10, padding: '0 16px 16px' }}
          />
        </div>
      </Content>

      {/* API Info Modal */}
      <Modal
        open={showApiModal}
        onCancel={() => setShowApiModal(false)}
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /> API Inspector — Bank Transfers</Space>}
        footer={null}
        width={780}
        destroyOnClose
      >
        <ApiInspectorPanel apexBase={APEX_BASE} lastApiUrl={lastApiUrl} />
      </Modal>

      {/* ── Create Accounting Modal ───────────────────────────────── */}
      <Modal
        title={<Space><AccountBookOutlined style={{ color: REDWOOD.info }} />Create Accounting — Bank Transfers</Space>}
        open={acctModalOpen}
        onCancel={() => { if (!acctRunning) setAcctModalOpen(false); }}
        footer={
          acctDone
            ? <Button onClick={() => setAcctModalOpen(false)}>Close</Button>
            : [
                <Button key="cancel" onClick={() => setAcctModalOpen(false)} disabled={acctRunning}>Cancel</Button>,
                <Button key="run" type="primary" loading={acctRunning}
                  disabled={acctProgress.every(r => r.status === 'skipped' || r.status === 'error')}
                  style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
                  onClick={runCreateAccounting}>
                  {acctRunning ? 'Processing…' : 'Run Create Accounting'}
                </Button>,
              ]
        }
        width={780}
        destroyOnClose
      >
        {acctProgress.length > 0 && (() => {
          const periods = [...new Set(acctProgress.map(r => r.periodName))].filter(Boolean);
          return (
            <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Accounting Period{periods.length > 1 ? 's' : ''}:</Text>
              {periods.map(p => <Tag key={p} color="blue" style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>{p}</Tag>)}
            </div>
          );
        })()}
        {acctProgress.map(r => {
          const rate    = transfers.find(t => t.bankAccountTransferId === r.transferId)?.conversionRate || 1;
          const j1Rate  = r.fromCurrency === 'AED' ? 1 : rate;
          const j2Rate  = r.toCurrency   === 'AED' ? 1 : rate;
          const toAmt   = r.toCurrency === r.fromCurrency ? r.amount : Math.round(r.amount * j1Rate * 100) / 100;
          const statusEl = (() => {
            if (r.status === 'pending') return <Tag color="default">Pending</Tag>;
            if (r.status === 'running') return <Tag icon={<SyncOutlined spin />} color="processing">Running…</Tag>;
            if (r.status === 'success') return <Tag color="success">Done</Tag>;
            if (r.status === 'error')   return <Tag color="error">Error</Tag>;
            if (r.status === 'skipped') return <Tag color="warning">Already Posted</Tag>;
            return null;
          })();
          const acctLine = (dr: boolean, account: string, bankName: string, amount: number, ccy: string, accounted: number) => (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
              <Tag color={dr ? 'blue' : 'orange'} style={{ minWidth: 32, textAlign: 'center', margin: 0 }}>{dr ? 'DR' : 'CR'}</Tag>
              <div style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>{account || '—'}</Text>
                {bankName && <div style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{bankName}</div>}
              </div>
              <div style={{ textAlign: 'right', minWidth: 140 }}>
                <Text style={{ fontWeight: 600, fontSize: 12 }}>{fmtAmount(amount, ccy)}</Text>
                {ccy !== 'AED' && <div style={{ fontSize: 11, color: REDWOOD.info }}>{fmtAmount(accounted, 'AED')}</div>}
              </div>
            </div>
          );
          return (
            <div key={r.transferId} style={{ border: '1px solid #e5e5e5', borderRadius: 8, marginBottom: 16, overflow: 'hidden' }}>
              {/* Header row */}
              <div style={{ background: '#fafafa', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid #e5e5e5' }}>
                <Text style={{ fontWeight: 600, fontSize: 13 }}>Transfer #{r.transferId}</Text>
                <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>{r.txnDate}</Text>
                <Text style={{ fontWeight: 600, fontSize: 12 }}>{fmtAmount(r.amount, r.fromCurrency)}</Text>
                <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>{r.periodName}</Tag>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {statusEl}
                  {r.message && <Text style={{ fontSize: 11, color: r.status === 'error' ? REDWOOD.error : REDWOOD.neutral600 }}>{r.message}</Text>}
                </div>
              </div>
              {r.status !== 'skipped' && r.status !== 'error' && (
                <div style={{ padding: '10px 14px' }}>
                  {/* Journal 1 */}
                  <div style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: 600, color: REDWOOD.info, display: 'block', marginBottom: 4 }}>
                      Journal 1 — Disbursement ({r.fromCurrency})
                    </Text>
                    {acctLine(true,  r.clearingAccount, 'Cash Clearing Account',  r.amount, r.fromCurrency, Math.round(r.amount * j1Rate * 100) / 100)}
                    {acctLine(false, r.fromAsset,       r.fromBankName,           r.amount, r.fromCurrency, Math.round(r.amount * j1Rate * 100) / 100)}
                  </div>
                  {/* Journal 2 */}
                  <div>
                    <Text style={{ fontSize: 11, fontWeight: 600, color: REDWOOD.success, display: 'block', marginBottom: 4 }}>
                      Journal 2 — Receipt ({r.toCurrency})
                    </Text>
                    {acctLine(true,  r.toAsset,         r.toBankName,             toAmt, r.toCurrency, Math.round(toAmt * j2Rate * 100) / 100)}
                    {acctLine(false, r.clearingAccount, 'Cash Clearing Account',  toAmt, r.toCurrency, Math.round(toAmt * j2Rate * 100) / 100)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {acctDone && (
          <Alert
            type={acctProgress.some(r => r.status === 'error') ? 'warning' : 'success'}
            showIcon
            message={acctProgress.some(r => r.status === 'error')
              ? 'Accounting completed with some errors'
              : 'Accounting created and posted to GL successfully'}
            style={{ marginTop: 12 }}
          />
        )}
      </Modal>

      {/* ── View Accounting Modal ─────────────────────────────────── */}
      <Modal
        title={<Space><EyeOutlined style={{ color: REDWOOD.success }} />Accounting Journals — Transfer #{viewAcctSourceId}</Space>}
        open={viewAcctOpen}
        onCancel={() => setViewAcctOpen(false)}
        footer={<Button onClick={() => setViewAcctOpen(false)}>Close</Button>}
        width={920}
        destroyOnClose
      >
        {viewAcctLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : viewAcctLines.length === 0 ? (
          <Empty description="No accounting lines found" />
        ) : (
          <>
            {[...new Set(viewAcctLines.map((l: any) => l.headerId))].map((hid, idx) => {
              const lines = viewAcctLines.filter((l: any) => l.headerId === hid);
              const first = lines[0] ?? {};
              const eventType = first.eventTypeCode ?? '';
              const label = eventType.includes('DISBURSE')
                ? 'Journal 1 — Disbursement (DR Clearing / CR From Bank)'
                : eventType.includes('RECEIPT')
                ? 'Journal 2 — Receipt (DR To Bank / CR Clearing)'
                : `Journal ${idx + 1} — Header ${hid}`;
              const ccy = first.currencyCode ?? '';
              return (
                <div key={String(hid)} style={{ marginBottom: 24 }}>
                  <div style={{ background: '#f0f5ff', padding: '8px 12px', borderRadius: '6px 6px 0 0', fontWeight: 600, fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{label}</span>
                    <span style={{ fontWeight: 400, color: REDWOOD.neutral600 }}>
                      {first.periodName} {ccy && <Tag style={{ margin: 0, fontSize: 11 }}>{ccy}</Tag>}
                    </span>
                  </div>
                  <Table
                    size="small"
                    pagination={false}
                    dataSource={lines.map((l: any, i: number) => ({ ...l, key: i }))}
                    columns={[
                      { title: '#', dataIndex: 'lineNumber', key: 'ln', width: 40,
                        render: (v: any, _: any, i: number) => v ?? i + 1 },
                      { title: 'Dr/Cr', key: 'drCr', width: 55,
                        render: (_: any, l: any) =>
                          (l.enteredDr ?? 0) > 0
                            ? <Tag color="blue" style={{ margin: 0 }}>DR</Tag>
                            : <Tag color="orange" style={{ margin: 0 }}>CR</Tag> },
                      { title: 'Account', key: 'acct', width: 200,
                        render: (_: any, l: any) => (
                          <div>
                            <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>
                              {l.accountCombination ?? '—'}
                            </Text>
                            {(l.accountDescription) && (
                              <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginTop: 1 }}>
                                {l.accountDescription}
                              </div>
                            )}
                          </div>
                        )},
                      { title: 'Line Description', key: 'desc',
                        render: (_: any, l: any) =>
                          <Text style={{ fontSize: 12 }}>{l.description ?? '—'}</Text> },
                      { title: 'Entered Dr', key: 'eDr', width: 120, align: 'right' as const,
                        render: (_: any, l: any) => {
                          const v = l.enteredDr ?? 0;
                          return v > 0 ? <Text style={{ fontWeight: 600 }}>{fmtAmount(v, l.currencyCode)}</Text> : <Text type="secondary">—</Text>;
                        }},
                      { title: 'Entered Cr', key: 'eCr', width: 120, align: 'right' as const,
                        render: (_: any, l: any) => {
                          const v = l.enteredCr ?? 0;
                          return v > 0 ? <Text style={{ fontWeight: 600 }}>{fmtAmount(v, l.currencyCode)}</Text> : <Text type="secondary">—</Text>;
                        }},
                      { title: 'Accounted Dr', key: 'aDr', width: 120, align: 'right' as const,
                        render: (_: any, l: any) => {
                          const v = l.accountedDr ?? 0;
                          return v > 0 ? <Text style={{ color: REDWOOD.info, fontWeight: 500 }}>{fmtAmount(v, 'AED')}</Text> : <Text type="secondary">—</Text>;
                        }},
                      { title: 'Accounted Cr', key: 'aCr', width: 120, align: 'right' as const,
                        render: (_: any, l: any) => {
                          const v = l.accountedCr ?? 0;
                          return v > 0 ? <Text style={{ color: REDWOOD.info, fontWeight: 500 }}>{fmtAmount(v, 'AED')}</Text> : <Text type="secondary">—</Text>;
                        }},
                    ]}
                    style={{ borderRadius: '0 0 6px 6px', overflow: 'hidden' }}
                  />
                </div>
              );
            })}
          </>
        )}
      </Modal>
    </Layout>
  );
};

export default ManageBankTransfers;
