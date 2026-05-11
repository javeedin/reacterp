import React, { useState, useCallback, useEffect, useRef } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
  Layout, Breadcrumb, Typography, Card, Table, Button, Form, Input, Select,
  DatePicker, InputNumber, Checkbox, Row, Col, Space, Tag, Tooltip, Tabs,
  message, Spin, Empty, Divider, Badge, Collapse, Modal, Upload, Popconfirm,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, BankOutlined, PlusOutlined, SearchOutlined, ReloadOutlined,
  EditOutlined, CloseOutlined, FilterOutlined, SwapOutlined, DollarOutlined,
  FileTextOutlined, ApiOutlined, ExportOutlined, DownloadOutlined,
  PrinterOutlined, PaperClipOutlined, UploadOutlined, EyeOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
}

interface BankAccountOption { label: string; value: string; }
interface BUOption { label: string; value: string; }

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
  y = (doc as any).lastAutoTable.finalY + 10;

  // Signature row
  const sigLabels = ['Prepared by', 'Checked by', 'Approved by', 'Received by'];
  const sigW = (pageW - 2 * margin) / sigLabels.length;
  sigLabels.forEach((label, i) => {
    const x = margin + i * sigW;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(label, x + sigW / 2, y, { align: 'center' });
    doc.line(x + 4, y + 12, x + sigW - 4, y + 12);
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
  onSave: () => void;
  onCancel: () => void;
}> = ({ initialValues, bankAccounts, businessUnits, bankCurrencyMap, buBankMap, bankAccountAssetMap, onSave, onCancel }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [apiModal, setApiModal]       = useState(false);
  const [apiPayload, setApiPayload]   = useState('');
  const [apiPosting, setApiPosting]   = useState(false);
  const [apiResponse, setApiResponse] = useState<{ status: number; body: string } | null>(null);
  const [apiGetRunning, setApiGetRunning] = useState(false);
  const [apiGetResponse, setApiGetResponse] = useState<{ status: number; body: string } | null>(null);
  const [apiTab, setApiTab] = useState<'get' | 'post' | 'attachments'>('post');
  const [attApiLog, setAttApiLog] = useState<Array<{ dir: string; url: string; status: number | null; body: string }>>([]);
  const isEdit = !!initialValues?.bankAccountTransferId;

  const [fromCurrency, setFromCurrency] = useState<string>(initialValues?.fromCurrencyCode ?? '');
  const [toCurrency, setToCurrency] = useState<string>(initialValues?.toCurrencyCode ?? '');
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
    } else {
      form.resetFields();
      form.setFieldsValue({ transactionDate: dayjs(), isSettledWithIbyFlag: true });
      setFromCurrency('');
      setToCurrency('');
    }
  }, [initialValues, form]);

  // Load attachments once when the transfer ID becomes available
  const transferId = initialValues?.bankAccountTransferId;
  useEffect(() => {
    if (!transferId) return;
    const url = `${APEX_BASE}/cash/banktransfers/${transferId}/attachments`;
    setAttApiLog(prev => [...prev, { dir: 'GET', url, status: null, body: '…fetching…' }]);
    fetch(url, { headers: { Accept: 'application/json' } })
      .then(r => r.json())
      .then(d => {
        setAttApiLog(prev => [...prev.slice(-9), { dir: 'GET', url, status: 200, body: JSON.stringify(d, null, 2) }]);
        if (Array.isArray(d.items)) {
          setAttachments(d.items.map((a: any) => ({
            id: a.id, uid: String(a.id), name: a.fileName, fileType: a.fileType || '', fileSize: a.fileSize || 0, status: 'done' as const,
          })));
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
        onSave();
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
      Status:                    initialValues?.status ?? 'Pending',
      PaymentStatus:             initialValues?.paymentStatus ?? '',
      PaymentMethod:             values.paymentMethod ?? '',
      PaymentProfileName:        values.paymentProfileName ?? '',
      Businessunit:              values.businessUnit ?? '',
      IsSettledWithIbyFlag:      values.isSettledWithIbyFlag ? 'true' : 'false',
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
    if (!att) return;
    if (att.content) {
      const blobUrl = makeBlobUrl(att.content, att.fileType || 'application/octet-stream');
      setPreviewAtt({ name: att.name, fileType: att.fileType, content: att.content, blobUrl });
      return;
    }
    if (!att.id || !initialValues?.bankAccountTransferId) return;
    setPreviewLoading(true);
    try {
      const res = await fetch(`${APEX_BASE}/cash/banktransfers/${initialValues.bankAccountTransferId}/attachments/${att.id}`, { headers: { Accept: 'application/json' } });
      const d = await res.json();
      const content = d.content || d.CONTENT || '';
      const fileType = att.fileType || d.fileType || 'application/octet-stream';
      if (!content) { message.warning('No content available for preview.'); return; }
      const blobUrl = makeBlobUrl(content, fileType);
      setPreviewAtt({ name: att.name, fileType, content, blobUrl });
    } catch { message.error('Failed to load attachment.'); }
    finally { setPreviewLoading(false); }
  };

  const handleDownloadAttachment = async (file: any) => {
    const att = attachments.find(a => a.uid === file.uid);
    if (!att) return;
    let content = att.content;
    let fileType = att.fileType;
    if (!content && att.id && initialValues?.bankAccountTransferId) {
      try {
        const res = await fetch(`${APEX_BASE}/cash/banktransfers/${initialValues.bankAccountTransferId}/attachments/${att.id}`, { headers: { Accept: 'application/json' } });
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
    if (!initialValues?.bankAccountTransferId) { message.error('Transfer ID not available'); return; }
    setAttSaving(true);
    const postUrl = `${APEX_BASE}/cash/banktransfers/${initialValues.bankAccountTransferId}/attachments`;
    let saved = 0;
    for (const att of pending) {
      const payload = { fileName: att.name, fileType: att.fileType, fileSize: att.fileSize, content: att.content, createdBy: 'ERP_USER' };
      try {
        const res = await fetch(postUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const respText = await res.text();
        setAttApiLog(prev => [...prev.slice(-9), {
          dir: 'POST', url: postUrl, status: res.status,
          body: `Request: ${JSON.stringify({ ...payload, content: payload.content ? '[base64 ' + payload.content.length + ' chars]' : '' }, null, 2)}\n\nResponse: ${respText}`,
        }]);
        if (res.ok) saved++;
      } catch (e: any) {
        setAttApiLog(prev => [...prev.slice(-9), { dir: 'POST', url: postUrl, status: 0, body: 'Error: ' + e.message }]);
      }
    }
    // Refresh list
    const getUrl = `${APEX_BASE}/cash/banktransfers/${initialValues.bankAccountTransferId}/attachments`;
    try {
      const r = await fetch(getUrl, { headers: { Accept: 'application/json' } });
      const d = await r.json();
      setAttApiLog(prev => [...prev.slice(-9), { dir: 'GET (refresh)', url: getUrl, status: r.status, body: JSON.stringify(d, null, 2) }]);
      if (Array.isArray(d.items)) {
        setAttachments(d.items.map((a: any) => ({ id: a.id, uid: String(a.id), name: a.fileName, fileType: a.fileType || '', fileSize: a.fileSize || 0, status: 'done' as const })));
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
  const [attachments, setAttachments] = useState<Array<{id?: number; uid: string; name: string; fileType: string; fileSize: number; content?: string; status: 'done' | 'uploading' | 'error'}>>([]);
  const [attSaving, setAttSaving] = useState(false);
  const [attPostTesting, setAttPostTesting] = useState(false);
  const [previewAtt, setPreviewAtt] = useState<{ name: string; fileType: string; content: string; blobUrl?: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [selectedBu, setSelectedBu] = useState<string | undefined>(
    initialValues?.businessUnit ?? undefined
  );
  const buSelected = !!selectedBu;
  const [selectedFromAcct, setSelectedFromAcct] = useState<string>(initialValues?.fromBankAccountName ?? '');
  const [selectedToAcct,   setSelectedToAcct]   = useState<string>(initialValues?.toBankAccountName   ?? '');

  // Filter bank accounts to those belonging to the selected BU
  const filteredBankAccounts = selectedBu && buBankMap[selectedBu]?.length
    ? bankAccounts.filter(a => buBankMap[selectedBu].includes(a.value))
    : bankAccounts;

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
        {isEdit ? 'View Bank Account Transfer' : 'Create Bank Account Transfer'}
      </Text>

      {isEdit && (
        <div style={{ marginBottom: 12, padding: '6px 12px', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 4 }}>
          <Text style={{ fontSize: 12, color: '#ad6800' }}>This record is read-only. Synced records cannot be edited.</Text>
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
                disabled={isEdit}
              />
            </Form.Item>
          </Col>
          {!buSelected && (
            <Col xs={24} lg={12} style={{ display: 'flex', alignItems: 'center', paddingBottom: 14 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Select a Business Unit to continue</Text>
            </Col>
          )}
        </Row>

        <Row gutter={40}>
          {/* Left column */}
          <Col xs={24} lg={12}>
            <Form.Item label="From Account" style={{ marginBottom: 4 }}>
              <div style={{ display: 'flex', gap: 0 }}>
                <Form.Item name="fromBankAccountName" noStyle rules={[{ required: true, message: 'From Account is required' }]}>
                  <Select showSearch placeholder="Select bank account" optionFilterProp="label" options={filteredBankAccounts}
                    style={{ borderRadius: '6px 0 0 6px', flex: 1 }} disabled={isEdit || !buSelected}
                    notFoundContent={<Text type="secondary">{buSelected ? 'No accounts for this BU' : 'Select a BU first'}</Text>}
                    onChange={(v: string) => {
                      setFromCurrency(bankCurrencyMap[v] ?? '');
                      setSelectedFromAcct(v);
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
            </Form.Item>

            <Form.Item label="To Account" style={{ marginBottom: 4 }}>
              <div style={{ display: 'flex', gap: 0 }}>
                <Form.Item name="toBankAccountName" noStyle rules={[{ required: true, message: 'To Account is required' }]}>
                  <Select showSearch placeholder="Select bank account" optionFilterProp="label" options={filteredBankAccounts}
                    style={{ borderRadius: '6px 0 0 6px', flex: 1 }} disabled={isEdit || !buSelected}
                    notFoundContent={<Text type="secondary">{buSelected ? 'No accounts for this BU' : 'Select a BU first'}</Text>}
                    onChange={(v: string) => {
                      const ccy = bankCurrencyMap[v] ?? '';
                      setToCurrency(ccy);
                      setSelectedToAcct(v);
                      if (ccy) form.setFieldsValue({ paymentCurrencyCode: ccy });
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
            <div style={{ marginBottom: 14 }} />

            <Form.Item label="Payment Currency" name="paymentCurrencyCode" style={fs}>
              <Select placeholder="Select currency" allowClear disabled={isEdit || !buSelected}>
                {['AED', 'USD', 'EUR', 'GBP', 'SAR', 'QAR', 'BHD', 'KWD', 'OMR', 'JOD', 'EGP', 'INR', 'PKR'].map(c => (
                  <Option key={c} value={c}>{c}</Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item label="Transfer Date" name="transactionDate" rules={[{ required: true, message: 'Transfer Date is required' }]} style={fs}>
              <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" disabled={isEdit || !buSelected} />
            </Form.Item>

            <Form.Item label="Transfer Amount" name="paymentAmount" rules={[{ required: true, message: 'Amount is required' }]} style={{ marginBottom: fromAmount != null ? 6 : 14 }}>
              <InputNumber style={{ width: '100%' }} min={0} precision={2} disabled={isEdit || !buSelected} />
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
              <Select placeholder="Select type" allowClear disabled={isEdit || !buSelected}>
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
                required: !!watchedPaymentCcy && watchedPaymentCcy !== 'AED',
                message: 'Conversion Rate is required for non-AED payment currency',
              }]}
            >
              <InputNumber style={{ width: '100%' }} min={0} precision={6} disabled={isEdit || !buSelected} />
            </Form.Item>
            {watchedPaymentCcy && watchedPaymentCcy !== 'AED' && (
              <div style={{ fontSize: 11, color: REDWOOD.warning, marginTop: -10, marginBottom: 8 }}>
                Required: payment currency is {watchedPaymentCcy} (functional: AED)
              </div>
            )}
          </Col>

          {/* Right column */}
          <Col xs={24} lg={12}>
            <Form.Item label=" " colon={false} name="isSettledWithIbyFlag" valuePropName="checked" style={fs}>
              <Checkbox style={{ color: REDWOOD.info, fontWeight: 500 }} disabled={isEdit || !buSelected}>
                Settle transaction through Payments
              </Checkbox>
            </Form.Item>

            <Form.Item label="Payment Method" name="paymentMethod" rules={[{ required: true, message: 'Payment Method is required' }]} style={fs}>
              <Select placeholder="Select method" disabled={isEdit || !buSelected}>
                <Option value="Electronic">Electronic</Option>
                <Option value="Check">Check</Option>
                <Option value="Wire">Wire</Option>
                <Option value="EFT">EFT</Option>
              </Select>
            </Form.Item>

            <Form.Item label="Payment Profile" name="paymentProfileName" rules={[{ required: true, message: 'Payment Profile is required' }]} style={fs}>
              <Select placeholder="Select profile" showSearch optionFilterProp="children" disabled={isEdit || !buSelected}>
                {['BOB BCL EFT', 'BOB BCL WIRE', 'ADIB EFT', 'ADCB EFT', 'FAB EFT'].map(p => (
                  <Option key={p} value={p}>{p}</Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item label="Memo" name="memo" style={fs}>
              <Input.TextArea rows={3} placeholder="Enter memo / description" disabled={isEdit || !buSelected} />
            </Form.Item>

            <Form.Item label="Attachments" style={fs}>
              <div>
                <Upload
                  fileList={attachments.map(a => ({ uid: a.uid, name: a.name, status: a.status, size: a.fileSize, type: a.fileType }))}
                  beforeUpload={(file) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                      const base64 = (e.target?.result as string)?.split(',')[1] || '';
                      setAttachments(prev => [...prev, { uid: `new-${Date.now()}`, name: file.name, fileType: file.type, fileSize: file.size, content: base64, status: 'done' as const }]);
                    };
                    reader.readAsDataURL(file);
                    return false;
                  }}
                  onRemove={(file) => {
                    const att = attachments.find(a => a.uid === file.uid);
                    if (att?.id && initialValues?.bankAccountTransferId) {
                      fetch(`${APEX_BASE}/cash/banktransfers/${initialValues.bankAccountTransferId}/attachments/${att.id}`, { method: 'DELETE' }).catch(() => {});
                    }
                    setAttachments(prev => prev.filter(a => a.uid !== file.uid));
                  }}
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
            <Button onClick={onCancel}>{isEdit ? 'Close' : 'Cancel'}</Button>
            {!isEdit && (
              <Button type="primary" loading={saving} onClick={handleSubmit}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>
                Create Transfer
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
                const tid = initialValues?.bankAccountTransferId;
                const baseUrl = tid ? `${APEX_BASE}/cash/banktransfers/${tid}/attachments` : `${APEX_BASE}/cash/banktransfers/:transferId/attachments`;
                const samplePayload = JSON.stringify({
                  fileName: 'document.pdf',
                  fileType: 'application/pdf',
                  fileSize: 12345,
                  content: '<base64-encoded file content>',
                  createdBy: 'ERP_USER',
                }, null, 2);
                const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
                return (
                  <div>
                    <div style={{ background: '#f0f5ff', border: '1px solid #adc6ff', borderRadius: 6, padding: '10px 14px', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Tag color="green" style={{ fontSize: 11, margin: 0 }}>GET</Tag>
                        <Text code copyable style={{ fontSize: 12, wordBreak: 'break-all' }}>{baseUrl}</Text>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>POST</Tag>
                        <Text code copyable style={{ fontSize: 12, wordBreak: 'break-all' }}>{baseUrl}</Text>
                      </div>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <Text strong style={{ fontSize: 12 }}>POST Body (JSON):</Text>
                      <pre style={{ background: '#1e1e2e', color: '#cdd6f4', padding: 10, borderRadius: 6, fontSize: 11, margin: '4px 0 10px', whiteSpace: 'pre-wrap' }}>
                        {samplePayload}
                      </pre>
                    </div>
                    <Space style={{ marginBottom: 10 }}>
                      <Button size="small" disabled={!tid} onClick={() => {
                        if (!tid) return;
                        const url = baseUrl;
                        setAttApiLog(prev => [...prev.slice(-9), { dir: 'GET (test)', url, status: null, body: '…fetching…' }]);
                        fetch(url, { headers: { Accept: 'application/json' } })
                          .then(r => r.text().then(t => ({ status: r.status, t })))
                          .then(({ status, t }) => {
                            const body = (() => { try { return JSON.stringify(JSON.parse(t), null, 2); } catch { return t; } })();
                            setAttApiLog(prev => [...prev.slice(-9), { dir: 'GET (test)', url, status, body }]);
                          })
                          .catch(e => setAttApiLog(prev => [...prev.slice(-9), { dir: 'GET (test)', url, status: 0, body: String(e) }]));
                      }}>Test GET</Button>
                      <Button size="small" type="primary" loading={attPostTesting} disabled={!tid}
                        style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
                        onClick={async () => {
                          if (!tid) return;
                          setAttPostTesting(true);
                          const url = baseUrl;
                          const body = { fileName: 'test-ping.png', fileType: 'image/png', fileSize: TINY_PNG.length, content: TINY_PNG, createdBy: 'ERP_USER' };
                          const reqStr = `POST ${url}\nContent-Type: application/json\n\n${JSON.stringify(body, null, 2)}`;
                          setAttApiLog(prev => [...prev.slice(-9), { dir: 'POST (test)', url, status: null, body: reqStr }]);
                          try {
                            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                            const t = await res.text();
                            const respBody = (() => { try { return JSON.stringify(JSON.parse(t), null, 2); } catch { return t; } })();
                            setAttApiLog(prev => [...prev.slice(-9), { dir: 'POST (test)', url, status: res.status, body: `Request:\n${JSON.stringify(body, null, 2)}\n\nResponse (HTTP ${res.status}):\n${respBody}` }]);
                            if (res.ok) { message.success('POST succeeded — endpoint is working!'); }
                            else { message.error(`POST failed — HTTP ${res.status}. Check the log.`); }
                          } catch (e: any) {
                            setAttApiLog(prev => [...prev.slice(-9), { dir: 'POST (test)', url, status: 0, body: 'Network error: ' + e.message }]);
                            message.error('POST failed: ' + e.message);
                          } finally { setAttPostTesting(false); }
                        }}>
                        Test POST (ping)
                      </Button>
                    </Space>
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
            return <iframe src={previewAtt.blobUrl} style={{ width: '100%', height: '70vh', border: 'none' }} title={previewAtt.name} />;
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
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────────────────────────────────
interface TabItem { key: string; label: React.ReactNode; record?: TransferRecord; }

const ManageBankTransfers: React.FC<{ module?: 'ap' | 'cash' }> = ({ module = 'cash' }) => {
  // ── State ─────────────────────────────────────────────────────────────────
  const [transfers, setTransfers]         = useState<TransferRecord[]>([]);
  const [loading, setLoading]             = useState(false);
  const [hasSearched, setHasSearched]     = useState(false);
  const [bankAccounts, setBankAccounts]       = useState<BankAccountOption[]>([]);
  const [businessUnits, setBusinessUnits]     = useState<BUOption[]>([]);
  const [bankCurrencyMap, setBankCurrencyMap] = useState<Record<string, string>>({});
  const [buBankMap, setBuBankMap]             = useState<Record<string, string[]>>({});
  const [bankAccountAssetMap, setBankAccountAssetMap] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab]         = useState('search');
  const [editTabs, setEditTabs]           = useState<TabItem[]>([]);
  const [showApiModal, setShowApiModal]   = useState(false);
  const [lastApiUrl, setLastApiUrl]       = useState('');
  const [gridSearch, setGridSearch]       = useState('');
  const [searchForm]                      = Form.useForm();

  const modulePrefix = module === 'ap' ? '/ap' : '/cash';

  // ── Load LOV data from existing transfers ─────────────────────────────────
  const loadLovs = useCallback(async () => {
    try {
      // Load BU→bank mapping and cash account from external transactions
      const extRes = await fetch(`${APEX_BASE}/cash/externaltransactions?limit=2000`);
      const extData = await extRes.json();
      if (extData.items) {
        const extItems: any[] = extData.items;
        const buBankMapLocal: Record<string, string[]> = {};
        const assetMapLocal: Record<string, string> = {};
        const currMapLocal: Record<string, string> = {};
        const acctSet = new Set<string>();
        const buSet   = new Set<string>();

        extItems.forEach(i => {
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
          if (i.currencyCode) currMapLocal[acct] = i.currencyCode;
        });

        setBankAccounts([...acctSet].sort().map(n => ({ label: n, value: n })));
        setBuBankMap(buBankMapLocal);
        setBankAccountAssetMap(assetMapLocal);
        setBankCurrencyMap(currMapLocal);
        setBusinessUnits([...buSet].sort().map(n => ({ label: n, value: n })));
      }
    } catch { /* silently skip */ }
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

  const handleSaved = () => { loadLovs(); handleSearch(); closeTab(activeTab); };

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns: ColumnsType<TransferRecord> = [
    {
      title: 'Transfer Number',
      dataIndex: 'bankAccountTransferNumber',
      key: 'transferNum',
      width: 110,
      fixed: 'left',
      render: (val, record) => (
        <Button type="link" size="small" style={{ color: REDWOOD.info, padding: 0, fontWeight: 500 }}
          onClick={() => openEdit(record)}>
          {val ?? '—'}
        </Button>
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
      title: 'Business Unit',
      dataIndex: 'businessUnit',
      key: 'bu',
      width: 180,
      render: (val: string) => <Text style={{ fontSize: 12 }}>{val ?? '—'}</Text>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 90,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
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
  const searchPanel = (
    <Card
      style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
      styles={{ body: { padding: '16px 20px 4px' } }}
    >
      <Form form={searchForm} layout="horizontal" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }}>
        <Row gutter={24}>
          <Col xs={24} sm={12} lg={8}>
            <Form.Item label="From Account" name="fromAccount">
              <Select showSearch allowClear placeholder="Any" options={bankAccounts} optionFilterProp="label" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Form.Item label="To Account" name="toAccount">
              <Select showSearch allowClear placeholder="Any" options={bankAccounts} optionFilterProp="label" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Form.Item label="Business Unit" name="businessUnit">
              <Select showSearch allowClear placeholder="Any" options={businessUnits} optionFilterProp="label" />
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
          scroll={{ x: 1400 }}
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
          onSave={handleSaved}
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
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /> API Endpoint</Space>}
        footer={null}
        width={700}
      >
        <div style={{ background: '#0d1117', borderRadius: 8, padding: 16 }}>
          <Text style={{ color: '#58a6ff', fontSize: 12, wordBreak: 'break-all', display: 'block' }}>
            GET {lastApiUrl || `${APEX_BASE}/cash/banktransfers`}
          </Text>
          <Divider style={{ borderColor: '#2d333b', margin: '12px 0' }} />
          <Text style={{ color: '#8b949e', fontSize: 11, display: 'block' }}>POST (Create/Sync)</Text>
          <Text style={{ color: '#98c379', fontSize: 12, display: 'block', marginTop: 4 }}>
            {APEX_BASE}/cash/banktransfers
          </Text>
        </div>
      </Modal>
    </Layout>
  );
};

export default ManageBankTransfers;
