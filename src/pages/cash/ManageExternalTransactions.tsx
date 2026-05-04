import React, { useState, useCallback, useEffect, useRef } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
  Layout, Breadcrumb, Typography, Card, Table, Button, Form, Input, Select,
  DatePicker, InputNumber, Row, Col, Space, Tag, Tooltip, Tabs, Collapse,
  message, Empty, Divider, Badge, Modal, Alert, Spin, Segmented, Upload, Popconfirm,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, BankOutlined, PlusOutlined, SearchOutlined, ReloadOutlined,
  EditOutlined, CloseOutlined, DollarOutlined, ApiOutlined, FileTextOutlined,
  SwapOutlined, DownloadOutlined, CheckCircleOutlined, SyncOutlined,
  AccountBookOutlined, EyeOutlined, UploadOutlined, PaperClipOutlined, DeleteOutlined,
  LockOutlined, PrinterOutlined,
} from '@ant-design/icons';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import AccountSelector, { validateAccountCode } from '../../components/AccountSelector';
import { useAuth } from '../../context/AuthContext';
import {
  buildPcBankTxnSlaPayload, fetchLedgerByBusinessUnit, derivePeriodName, createAccounting,
} from '../../services/sla.service';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

const REDWOOD = {
  primary: '#C74634', primaryLight: '#E85D4A', primaryDark: '#A33B2C',
  success: '#1D7B4D', warning: '#D4A800', info: '#0572CE', error: '#D93025',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral300: '#C7C7C7',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
};

const APEX_BASE = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp';

// ── Types ────────────────────────────────────────────────────────────────────
interface ExternalTxnRecord {
  externalTransactionId: number;
  transactionId: number;
  transactionDate: string;
  valueDate: string;
  clearedDate: string;
  amount: number;
  currencyCode: string;
  description: string;
  referenceText: string;
  source: string;
  status: string;
  transactionType: string;
  accountingFlag: string;
  bankAccountName: string;
  businessUnitName: string;
  legalEntityName: string;
  assetAccountCombination: string;
  offsetAccountCombination: string;
  bankConversionRate: number;
  bankConversionRateType: string;
  transferId: number;
  checkNumber: string;
  reconReference: string;
  createdBy: string;
  creationDate: string;
  lastUpdateDate: string;
  syncDate: string;
  transactionDirection?: string;
  paymentMethod?: string;
  paymentDocument?: string;
  paperDocumentNumber?: string;
  payeeName?: string;
  payeeId?: number;
}

interface BankAccountOption { label: string; value: string; }
interface BUOption          { label: string; value: string; }

// ── Helpers ──────────────────────────────────────────────────────────────────

const parseApexJson = async (res: Response) => {
  const text = await res.text();
  const fix = (s: string) => s
    .replace(/:(-?)\.(\d)/g, ':$10.$2')   // .428 → 0.428
    .replace(/(\d)\.([,}\]])/g, '$1$2');  // 100., → 100,
  try {
    return JSON.parse(fix(text));
  } catch {
    // Sanitise raw control characters that Oracle may not have escaped,
    // then retry — handles edge cases in long description/reference fields.
    const cleaned = fix(
      text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
          .replace(/\x0a/g, '\\n')
          .replace(/\x0d/g, '\\r')
    );
    return JSON.parse(cleaned);
  }
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
  const m: Record<string, string> = {
    REC: 'success', UNR: 'default', CLR: 'processing', CAN: 'error',
  };
  return m[s] ?? 'default';
};

const statusLabel = (s: string) => {
  const m: Record<string, string> = {
    REC: 'Reconciled', UNR: 'Unreconciled', CLR: 'Cleared', CAN: 'Cancelled',
  };
  return m[s] ?? s;
};

interface BankAcctProgressRow {
  extTxnId:    number;
  txnDate:     string;
  periodName:  string;
  amount:      number;
  currency:    string;
  drAccount:   string;
  crAccount:   string;
  bu:          string;
  status:      'pending' | 'running' | 'success' | 'error' | 'skipped';
  message?:    string;
}

const SOURCE_LABELS: Record<string, string> = {
  ORA_BAT: 'Bank', ORA_MAN: 'Manual', ORA_STA: 'Statement',
};

// ── Tab management ───────────────────────────────────────────────────────────
let tabCounter = 0;
const newTabKey = () => `tab_${++tabCounter}`;

// ────────────────────────────────────────────────────────────────────────────
// Create / Edit Form
// ────────────────────────────────────────────────────────────────────────────
interface ExtTxnLine { key: number; amount?: number; description: string; offsetAccount: string; offsetDesc: string; }

interface PayeeOption { label: string; value: number; payeeName: string; }

const ExternalTxnForm: React.FC<{
  initialValues?: Partial<ExternalTxnRecord>;
  bankAccounts: BankAccountOption[];
  businessUnits: BUOption[];
  bankAccountMap: Record<string, string>;
  bankAccountCurrencyMap: Record<string, string>;
  payeeOptions: PayeeOption[];
  buBankMap: Record<string, string[]>;
  onSave: () => void;
  onCancel: () => void;
}> = ({ initialValues, bankAccounts, businessUnits, bankAccountMap, bankAccountCurrencyMap, buBankMap, payeeOptions, onSave, onCancel }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [txnDirection, setTxnDirection] = useState<'DR' | 'CR'>('CR');
  const [selectedBu, setSelectedBu] = useState<string | undefined>(initialValues?.businessUnitName);
  const [apiModal, setApiModal]           = useState(false);
  const [apiPayload, setApiPayload]       = useState('');
  const [apiPosting, setApiPosting]       = useState(false);
  const [apiResponse, setApiResponse]     = useState<{ status: number; body: string } | null>(null);
  const [cashAcctOpen, setCashAcctOpen]   = useState(false);
  const [offsetAcctOpen, setOffsetAcctOpen] = useState(false);
  const [assetAcctDesc,  setAssetAcctDesc]  = useState('');
  const [offsetAcctDesc, setOffsetAcctDesc] = useState('');
  const [extTxnMode, setExtTxnMode]       = useState<'single' | 'multiple'>('single');
  const [extTxnLines, setExtTxnLines]     = useState<ExtTxnLine[]>([
    { key: 0, amount: undefined, description: '', offsetAccount: '', offsetDesc: '' },
  ]);
  const [lineCoaOpen, setLineCoaOpen]     = useState(false);
  const [lineCoaIdx, setLineCoaIdx]       = useState(0);
  const [lineCoaInitial, setLineCoaInitial] = useState('');
  const [attachments, setAttachments]   = useState<Array<{id?: number; uid: string; name: string; fileType: string; fileSize: number; content?: string; status: 'done' | 'uploading' | 'error'}>>([]);
  const [attachUploading, setAttachUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedExtId, setSavedExtId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const isEdit = !!initialValues?.externalTransactionId;
  const buSelected = !!selectedBu;
  const [selectedBank, setSelectedBank] = useState<string | undefined>(initialValues?.bankAccountName);
  const bankSelected = !!selectedBank;

  const watchedAsset   = Form.useWatch('assetAccountCombination', form);
  const watchedOffset  = Form.useWatch('offsetAccountCombination', form);
  const watchedAmount  = Form.useWatch('amount', form);
  const watchedTxnType = Form.useWatch('transactionType', form);
  const isAdhocPayment = watchedTxnType === 'Adhoc Payment';

  // Adhoc Payment → always money out (CR), always single mode
  useEffect(() => {
    if (isAdhocPayment) {
      setTxnDirection('CR');
      form.setFieldsValue({ transactionDirection: 'CR' });
      setExtTxnMode('single');
    }
  }, [isAdhocPayment, form]);

  const filteredBankAccounts = selectedBu && buBankMap[selectedBu]?.length
    ? buBankMap[selectedBu].sort().map(n => ({ label: n, value: n }))
    : bankAccounts;

  const updateExtLine = (idx: number, field: string, value: any) =>
    setExtTxnLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));

  useEffect(() => { setSelectedBu(initialValues?.businessUnitName); }, [initialValues]);

  useEffect(() => {
    if (initialValues) {
      const dir = (initialValues.transactionDirection as 'DR' | 'CR') || 'DR';
      setTxnDirection(dir);
      form.setFieldsValue({
        bankAccountName:           initialValues.bankAccountName,
        businessUnitName:          initialValues.businessUnitName,
        amount:                    initialValues.amount,
        transactionDate:           initialValues.transactionDate ? dayjs(initialValues.transactionDate) : dayjs(),
        valueDate:                 initialValues.valueDate ? dayjs(initialValues.valueDate) : undefined,
        referenceText:             initialValues.referenceText,
        transactionType:           initialValues.transactionType,
        description:               initialValues.description,
        currencyCode:              initialValues.currencyCode,
        assetAccountCombination:   initialValues.assetAccountCombination,
        offsetAccountCombination:  initialValues.offsetAccountCombination,
        transactionDirection:      dir,
        paymentMethod:             initialValues.paymentMethod,
        paymentDocument:           initialValues.paymentDocument,
        paperDocumentNumber:       initialValues.paperDocumentNumber,
        payeeName:                 initialValues.payeeName,
        payeeId:                   initialValues.payeeId,
      });
      // Fetch existing attachments for edit mode
      if (initialValues.externalTransactionId) {
        fetch(`${APEX_BASE}/cash/externaltransactions/${initialValues.externalTransactionId}/attachments`, { headers: { Accept: 'application/json' } })
          .then(r => r.json())
          .then(d => {
            setAttachments((d.items || []).map((a: any) => ({
              id: a.id, uid: String(a.id), name: a.fileName, fileType: a.fileType || '', fileSize: a.fileSize || 0, status: 'done' as const,
            })));
          }).catch(() => {});
      }
    } else {
      form.resetFields();
      form.setFieldsValue({ transactionDate: dayjs(), transactionDirection: 'CR', transactionType: 'External Transaction' });
      setTxnDirection('CR');
      setAssetAcctDesc('');
      setOffsetAcctDesc('');
    }
  }, [initialValues, form]);

  const buildPayload = (values: any) => ({
    items: [{
      ExternalTransactionId: initialValues?.externalTransactionId ?? undefined,
      TransactionId:         initialValues?.transactionId ?? undefined,
      BankAccountName:       values.bankAccountName,
      BusinessUnitName:      values.businessUnitName ?? '',
      Amount:                values.amount,
      TransactionDate:       values.transactionDate?.format('YYYY-MM-DD'),
      ValueDate:             values.valueDate?.format('YYYY-MM-DD') ?? null,
      CurrencyCode:          values.currencyCode ?? '',
      ReferenceText:         values.referenceText ?? '',
      TransactionType:       values.transactionType ?? '',
      Description:           values.description ?? '',
      Source:                'ORA_MAN',
      Status:                initialValues?.status ?? 'UNR',
      AccountingFlag:        false,
      CreatedBy:             'ERP_USER',
      CreationDate:          new Date().toISOString(),
      LastUpdatedBy:         'ERP_USER',
      LastUpdateDate:        new Date().toISOString(),
      LastUpdateLogin:       '',
      AssetAccountCombination:  values.assetAccountCombination ?? '',
      OffsetAccountCombination: values.offsetAccountCombination ?? '',
      TransactionDirection:  values.transactionDirection ?? txnDirection,
      PaymentMethod:        values.paymentMethod ?? null,
      PaymentDocument:      values.paymentDocument ?? null,
      PaperDocumentNumber:  values.paperDocumentNumber ?? null,
      PayeeName:            values.payeeName ?? null,
      PayeeId:              values.payeeId ?? null,
    }],
  });

  const handleSubmit = async () => {
    let values: any;
    try { values = await form.validateFields(); } catch { return; }

    if (extTxnMode === 'multiple') {
      const invalid = extTxnLines.filter(l => !l.amount);
      if (invalid.length > 0) { message.error('All lines must have an amount'); return; }
      const missingOffset = extTxnLines.filter(l => !l.offsetAccount);
      if (missingOffset.length > 0) { message.error('All lines must have an offset account'); return; }
      setSaving(true);
      const baseRef = values.referenceText?.trim() || '';
      const baseHeader = {
        BankAccountName:         values.bankAccountName,
        BusinessUnitName:        values.businessUnitName ?? '',
        TransactionDate:         values.transactionDate?.format('YYYY-MM-DD'),
        ValueDate:               values.valueDate?.format('YYYY-MM-DD') ?? null,
        CurrencyCode:            values.currencyCode ?? '',
        TransactionType:         values.transactionType ?? '',
        AssetAccountCombination: values.assetAccountCombination ?? '',
        TransactionDirection:    values.transactionDirection ?? txnDirection,
        Source: 'ORA_MAN', Status: 'UNR', AccountingFlag: false,
        CreatedBy: 'ERP_USER', CreationDate: new Date().toISOString(),
        LastUpdatedBy: 'ERP_USER', LastUpdateDate: new Date().toISOString(), LastUpdateLogin: '',
        PaymentMethod:        values.paymentMethod ?? null,
        PaymentDocument:      values.paymentDocument ?? null,
        PaperDocumentNumber:  values.paperDocumentNumber ?? null,
        PayeeName:            values.payeeName ?? null,
        PayeeId:              values.payeeId ?? null,
      };
      let successCount = 0;
      for (let i = 0; i < extTxnLines.length; i++) {
        const line = extTxnLines[i];
        const payload = {
          items: [{
            ...baseHeader,
            Amount:                   line.amount,
            ReferenceText:            extTxnLines.length > 1 ? `${baseRef}-${i + 1}` : baseRef,
            Description:              line.description ?? '',
            OffsetAccountCombination: line.offsetAccount ?? '',
          }],
        };
        try {
          const res = await fetch(`${APEX_BASE}/cash/externaltransactions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (data.status === 'success') {
            successCount++;
          } else {
            message.error(`Line ${i + 1}: ${data.message || 'Save failed.'}`);
            setSaving(false);
            return;
          }
        } catch (e: any) {
          message.error(`Line ${i + 1}: Network error: ${e.message}`);
          setSaving(false);
          return;
        }
      }
      setSaving(false);
      message.success(`${successCount} transaction(s) created.`);
      onSave();
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${APEX_BASE}/cash/externaltransactions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(values)),
      });
      const data = await res.json();
      if (data.status === 'success') {
        // Upload attachments
        const newExtId = data.externalTransactionId;
        if (newExtId && attachments.length > 0) {
          for (const att of attachments.filter(a => !a.id)) {
            try {
              await fetch(`${APEX_BASE}/cash/externaltransactions/${newExtId}/attachments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: att.name, fileType: att.fileType, fileSize: att.fileSize, content: att.content, createdBy: 'ERP_USER' }),
              });
            } catch { /* ignore upload errors silently */ }
          }
        }
        message.success(isEdit ? 'Transaction updated.' : 'Transaction created.');
        if (isEdit) {
          onSave();
        } else {
          setSaved(true);
          setSavedExtId(data.externalTransactionId ?? null);
        }
      } else {
        message.error(data.message || 'Save failed.');
      }
    } catch (e: any) {
      message.error('Network error: ' + e.message);
    } finally { setSaving(false); }
  };

  const handleApiOpen = async () => {
    let values: any;
    try { values = await form.validateFields(); } catch { return; }
    setApiPayload(JSON.stringify(buildPayload(values), null, 2));
    setApiResponse(null);
    setApiModal(true);
  };

  const handleApiPost = async () => {
    setApiPosting(true);
    setApiResponse(null);
    try {
      const res = await fetch(`${APEX_BASE}/cash/externaltransactions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: apiPayload,
      });
      const text = await res.text();
      setApiResponse({ status: res.status, body: (() => { try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; } })() });
    } catch (e: any) {
      setApiResponse({ status: 0, body: 'Network error: ' + e.message });
    } finally { setApiPosting(false); }
  };

  const handleDelete = async () => {
    const extId = savedExtId ?? initialValues?.externalTransactionId;
    if (!extId) { message.error('Transaction ID not available'); return; }
    setDeleting(true);
    try {
      const res = await fetch(`${APEX_BASE}/cash/externaltransactions/${extId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.status === 'success') {
        message.success('Transaction deleted.');
        onSave();
      } else {
        message.error(data.message || 'Delete failed.');
      }
    } catch (e: any) {
      message.error('Network error: ' + e.message);
    } finally { setDeleting(false); }
  };

  // ── Styles ──────────────────────────────────────────────────────────────────
  const sectionCard = (accent: string) => ({
    borderRadius: 8,
    border: `1px solid ${REDWOOD.neutral200}`,
    borderLeft: `3px solid ${accent}`,
    marginBottom: 16,
    background: REDWOOD.surface,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  });
  const sectionHeader = (color: string) => ({
    fontSize: 12,
    fontWeight: 600,
    color,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  });
  const acctFieldStyle = {
    background: '#f8f9fc',
    border: `1px solid ${REDWOOD.neutral300}`,
    borderRadius: 6,
    padding: '8px 12px',
    fontFamily: 'monospace',
    fontSize: 12,
    flex: 1,
    cursor: 'default',
    color: REDWOOD.neutral900,
    minWidth: 0,
  };

  return (
    <div style={{ padding: '0 0 72px' }}>
      <style>{`
        .direction-dr .ant-segmented-item-selected { background: #1677ff !important; color: #fff !important; }
        .direction-cr .ant-segmented-item-selected { background: #ff4d4f !important; color: #fff !important; }
      `}</style>

      <Form form={form} layout="vertical" size="middle">
        <Row gutter={16} align="stretch">
        <Col xs={24} xl={11} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ── Section 1: Organisation ── */}
        <Card styles={{ body: { padding: '14px 16px' } }} style={sectionCard(REDWOOD.info)}>
          <div style={sectionHeader(REDWOOD.info)}>
            <BankOutlined /> Organisation
          </div>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label={<span style={{ fontWeight: 600, fontSize: 13 }}>Business Unit</span>}
                name="businessUnitName"
                rules={[{ required: !isEdit, message: 'Required' }]}
                style={{ marginBottom: 0 }}
              >
                <Select
                  showSearch optionFilterProp="label" options={businessUnits}
                  placeholder="Select business unit"
                  disabled={isEdit || saved}
                  style={{ width: '100%' }}
                  onChange={v => {
                    setSelectedBu(v);
                    setSelectedBank(undefined);
                    if (!isEdit) {
                      const banks = buBankMap[v] || [];
                      const cur = form.getFieldValue('bankAccountName');
                      if (cur && banks.length > 0 && !banks.includes(cur)) {
                        form.setFieldsValue({ bankAccountName: undefined, currencyCode: undefined, assetAccountCombination: '' });
                      }
                    }
                  }}
                  allowClear onClear={() => { setSelectedBu(undefined); setSelectedBank(undefined); }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label={<span style={{ fontWeight: 600, fontSize: 13 }}>Bank Account</span>}
                name="bankAccountName"
                rules={[{ required: !isEdit, message: 'Required' }]}
                style={{ marginBottom: 0 }}
              >
                <Select
                  showSearch optionFilterProp="label"
                  options={filteredBankAccounts}
                  placeholder={buSelected ? 'Select bank account' : 'Select Business Unit first'}
                  disabled={isEdit || !buSelected || saved}
                  style={{ width: '100%' }}
                  notFoundContent={<Text type="secondary">No accounts for this BU</Text>}
                  onChange={v => {
                    setSelectedBank(v);
                    if (!isEdit) {
                      const acct = bankAccountMap[v] ?? '';
                      form.setFieldValue('assetAccountCombination', acct);
                      form.setFieldValue('currencyCode', bankAccountCurrencyMap[v] ?? '');
                      setAssetAcctDesc('');
                      if (acct) {
                        validateAccountCode(acct).then(r => {
                          const seg4 = Object.values(r.segmentDetails)[3];
                          setAssetAcctDesc((seg4 as any)?.description || '');
                        }).catch(() => {});
                      }
                    }
                  }}
                />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* ── Section 2: Transaction Details ── */}
        <Card styles={{ body: { padding: '14px 16px' } }} style={{ ...sectionCard(REDWOOD.primary), flex: 1 }}>
          <div style={sectionHeader(REDWOOD.primary)}>
            <DollarOutlined /> Transaction Details
          </div>
          <Row gutter={16}>
            <Col xs={12} md={6}>
              <Form.Item
                label={<span style={{ fontWeight: 600, fontSize: 13 }}>Transaction Date</span>}
                name="transactionDate"
                rules={[{ required: !isEdit, message: 'Required' }]}
                style={{ marginBottom: 10 }}
              >
                <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" disabled={isEdit || !bankSelected || saved} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item
                label={<span style={{ fontWeight: 600, fontSize: 13 }}>Value Date</span>}
                name="valueDate"
                style={{ marginBottom: 10 }}
              >
                <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" disabled={isEdit || !bankSelected || saved} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item
                label={<span style={{ fontWeight: 600, fontSize: 13 }}>Currency</span>}
                name="currencyCode"
                style={{ marginBottom: 10 }}
              >
                <Select placeholder="Auto-filled" allowClear disabled={isEdit || !bankSelected || saved}>
                  {['AED', 'USD', 'EUR', 'GBP', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR'].map(c => (
                    <Option key={c} value={c}>{c}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item
                label={<span style={{ fontWeight: 600, fontSize: 13 }}>Transaction Type</span>}
                name="transactionType"
                initialValue="External Transaction"
                rules={[{ required: true, message: 'Transaction Type is required' }]}
                style={{ marginBottom: 10 }}
              >
                <Select placeholder="Select type" disabled={isEdit || !bankSelected || saved}>
                  <Option value="External Transaction">External Transaction</Option>
                  <Option value="Adhoc Payment">Adhoc Payment</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label={<span style={{ fontWeight: 600, fontSize: 13 }}>Reference</span>}
                name="referenceText"
                style={{ marginBottom: 0 }}
              >
                <Input placeholder="e.g. STMT-REF-001" disabled={isEdit || !bankSelected || saved} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label={<span style={{ fontWeight: 600, fontSize: 13 }}>Direction</span>}
                name="transactionDirection"
                initialValue="CR"
                style={{ marginBottom: 0 }}
              >
                <Segmented
                  options={[
                    { label: '▲ DR — Money In',  value: 'DR' },
                    { label: '▼ CR — Money Out', value: 'CR' },
                  ]}
                  onChange={(v) => {
                    const dir = v as 'DR' | 'CR';
                    setTxnDirection(dir);
                    // Re-sign single-mode amount
                    const cur = form.getFieldValue('amount');
                    if (cur != null && cur !== '' && cur !== 0) {
                      const abs = Math.abs(Number(cur));
                      form.setFieldsValue({ amount: dir === 'DR' ? abs : -abs });
                    }
                    // Re-sign all multi-line amounts
                    setExtTxnLines(prev => prev.map(l =>
                      l.amount != null
                        ? { ...l, amount: dir === 'DR' ? Math.abs(l.amount) : -Math.abs(l.amount) }
                        : l
                    ));
                  }}
                  disabled={isEdit || !bankSelected || isAdhocPayment || saved}
                  style={{
                    background: txnDirection === 'DR' ? '#e6f4ff' : '#fff1f0',
                    opacity: isAdhocPayment ? 0.7 : 1,
                  }}
                  className={`direction-segmented direction-${txnDirection.toLowerCase()}`}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16} style={{ marginTop: 8 }}>
            <Col xs={24} md={8}>
              <Form.Item
                label={<span style={{ fontWeight: 600, fontSize: 13 }}>Payment Method</span>}
                name="paymentMethod"
                style={{ marginBottom: isAdhocPayment ? 10 : 0 }}
              >
                <Select placeholder="Select method" allowClear disabled={isEdit || !bankSelected || saved}>
                  {['CHECK', 'EFT', 'WIRE', 'CASH', 'MISC'].map(m => <Option key={m} value={m}>{m}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                label={<span style={{ fontWeight: 600, fontSize: 13 }}>Payment Document</span>}
                name="paymentDocument"
                style={{ marginBottom: isAdhocPayment ? 10 : 0 }}
              >
                <Input placeholder="e.g. Cheque Book Name" disabled={isEdit || !bankSelected || saved} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                label={<span style={{ fontWeight: 600, fontSize: 13 }}>Paper Document #</span>}
                name="paperDocumentNumber"
                style={{ marginBottom: isAdhocPayment ? 10 : 0 }}
              >
                <Input placeholder="e.g. CHQ-00123" disabled={isEdit || !bankSelected || saved} />
              </Form.Item>
            </Col>
          </Row>
          {isAdhocPayment && (
            <Row gutter={16} style={{ marginTop: 8 }}>
              <Col xs={24}>
                <Form.Item
                  label={<span style={{ fontWeight: 600, fontSize: 13 }}>Payee</span>}
                  name="payeeId"
                  rules={[{ required: true, message: 'Select a payee for Adhoc Payment' }]}
                  style={{ marginBottom: 0 }}
                >
                  <Select
                    showSearch
                    placeholder="Select payee..."
                    disabled={isEdit || !bankSelected || saved}
                    optionFilterProp="label"
                    options={payeeOptions}
                    onChange={(val: number) => {
                      const p = payeeOptions.find(o => o.value === val);
                      if (p) form.setFieldsValue({ payeeName: p.payeeName });
                    }}
                  />
                </Form.Item>
                {/* hidden field keeps payeeName in sync */}
                <Form.Item name="payeeName" hidden><Input /></Form.Item>
              </Col>
            </Row>
          )}
        </Card>

        </Col>
        {/* RIGHT COLUMN */}
        <Col xs={24} xl={13} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ── Section 3: Account Coding ── */}
        <Card
          styles={{ body: { padding: '14px 16px' } }}
          style={{ ...sectionCard(REDWOOD.success), flex: 1 }}
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
              <span style={{ ...sectionHeader(REDWOOD.success), marginBottom: 0 }}>
                <FileTextOutlined /> Account Coding
              </span>
              {!isEdit && !isAdhocPayment && (
                <Segmented
                  size="small"
                  value={extTxnMode}
                  onChange={(v) => setExtTxnMode(v as 'single' | 'multiple')}
                  options={[
                    { label: 'Single', value: 'single' },
                    { label: 'Multiple', value: 'multiple' },
                  ]}
                />
              )}
            </div>
          }
        >
          <Row gutter={16}>
            <Col xs={24} md={extTxnMode === 'single' ? 12 : 24}>
              <Form.Item
                label={<span style={{ fontWeight: 600, fontSize: 13 }}>Cash / Asset Account</span>}
                style={{ marginBottom: 0 }}
              >
                <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
                  <Form.Item name="assetAccountCombination" noStyle>
                    <Input
                      readOnly disabled={isEdit || saved}
                      placeholder={isEdit ? '—' : 'Auto-populated from bank account'}
                      style={{ ...acctFieldStyle, borderRadius: isEdit ? 6 : '6px 0 0 6px' }}
                    />
                  </Form.Item>
                  {!isEdit && !saved && (
                    <Button
                      icon={<SearchOutlined />}
                      disabled={!bankSelected}
                      onClick={() => setCashAcctOpen(true)}
                      style={{ borderRadius: '0 6px 6px 0', height: 36, borderLeft: 0 }}
                    />
                  )}
                </div>
                {assetAcctDesc && <div style={{ fontSize: 11, color: REDWOOD.info, marginTop: 3 }}>{assetAcctDesc}</div>}
              </Form.Item>
            </Col>
            {extTxnMode === 'single' && (
              <Col xs={24} md={12}>
                <Form.Item
                  label={<span style={{ fontWeight: 600, fontSize: 13 }}>Offset Account</span>}
                  style={{ marginBottom: 0 }}
                >
                  <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
                    <Form.Item name="offsetAccountCombination" noStyle
                      rules={[{ required: !isEdit, message: 'Offset account is required' }]}
                    >
                      <Input
                        readOnly disabled={isEdit || saved}
                        placeholder={isEdit ? '—' : 'Select offset account'}
                        style={{ ...acctFieldStyle, borderRadius: isEdit ? 6 : '6px 0 0 6px' }}
                      />
                    </Form.Item>
                    {!isEdit && !saved && (
                      <Button
                        icon={<SearchOutlined />}
                        disabled={!bankSelected}
                        onClick={() => setOffsetAcctOpen(true)}
                        style={{ borderRadius: '0 6px 6px 0', height: 36, borderLeft: 0 }}
                      />
                    )}
                  </div>
                  {offsetAcctDesc && <div style={{ fontSize: 11, color: REDWOOD.info, marginTop: 3 }}>{offsetAcctDesc}</div>}
                </Form.Item>
              </Col>
            )}
          </Row>

          {/* ── Amount + Description (single mode) ── */}
          {(isEdit || extTxnMode === 'single') && (
            <Row gutter={12} style={{ marginTop: 10 }}>
              <Col xs={24} md={10}>
                <Form.Item
                  label={<span style={{ fontWeight: 600, fontSize: 13 }}>Amount</span>}
                  name="amount"
                  rules={[{ required: !isEdit, message: 'Required' }]}
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber
                    style={{ width: '100%' }}
                    precision={2}
                    disabled={isEdit || !bankSelected || saved}
                    placeholder={txnDirection === 'DR' ? '+ve Money In' : '-ve Money Out'}
                    formatter={v => v ? String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                    onChange={(v) => {
                      if (v == null) return;
                      const signed = txnDirection === 'DR' ? Math.abs(Number(v)) : -Math.abs(Number(v));
                      if (signed !== Number(v)) form.setFieldsValue({ amount: signed });
                    }}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={14}>
                <Form.Item
                  label={<span style={{ fontWeight: 600, fontSize: 13 }}>Description</span>}
                  name="description"
                  style={{ marginBottom: 0 }}
                >
                  <Input.TextArea
                    rows={1}
                    autoSize={{ minRows: 1, maxRows: 3 }}
                    placeholder="Enter description"
                    disabled={isEdit || !bankSelected || saved}
                  />
                </Form.Item>
              </Col>
            </Row>
          )}

          {/* ── Journal Entry Preview ── */}
          {extTxnMode === 'single' && watchedAsset && watchedOffset && (
            <div style={{
              marginTop: 16,
              background: '#1e1e2e',
              borderRadius: 6,
              padding: '12px 16px',
              fontFamily: 'monospace',
              fontSize: 12,
            }}>
              <div style={{ color: '#89b4fa', fontWeight: 600, marginBottom: 8, fontSize: 11, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Journal Entry Preview
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ color: '#6c7086', fontSize: 10, textAlign: 'left', paddingBottom: 4, width: 36 }}>Dr/Cr</th>
                    <th style={{ color: '#6c7086', fontSize: 10, textAlign: 'left', paddingBottom: 4 }}>Account</th>
                    <th style={{ color: '#6c7086', fontSize: 10, textAlign: 'right', paddingBottom: 4, width: 100 }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {txnDirection === 'DR' ? (
                    <>
                      <tr>
                        <td style={{ color: '#89b4fa', fontWeight: 700, paddingTop: 2, verticalAlign: 'top' }}>DR</td>
                        <td style={{ color: '#cdd6f4', paddingTop: 2 }}>
                          {watchedAsset}
                          {assetAcctDesc && <div style={{ color: '#6c7086', fontSize: 10, marginTop: 1 }}>{assetAcctDesc}</div>}
                        </td>
                        <td style={{ color: '#89b4fa', textAlign: 'right', paddingTop: 2, verticalAlign: 'top' }}>{fmtAmount(Math.abs(watchedAmount ?? 0))}</td>
                      </tr>
                      <tr>
                        <td style={{ color: '#a6e3a1', fontWeight: 700, paddingTop: 4, verticalAlign: 'top' }}>CR</td>
                        <td style={{ color: '#cdd6f4', paddingTop: 4 }}>
                          {watchedOffset}
                          {offsetAcctDesc && <div style={{ color: '#6c7086', fontSize: 10, marginTop: 1 }}>{offsetAcctDesc}</div>}
                        </td>
                        <td style={{ color: '#a6e3a1', textAlign: 'right', paddingTop: 4, verticalAlign: 'top' }}>{fmtAmount(Math.abs(watchedAmount ?? 0))}</td>
                      </tr>
                    </>
                  ) : (
                    <>
                      <tr>
                        <td style={{ color: '#89b4fa', fontWeight: 700, paddingTop: 2, verticalAlign: 'top' }}>DR</td>
                        <td style={{ color: '#cdd6f4', paddingTop: 2 }}>
                          {watchedOffset}
                          {offsetAcctDesc && <div style={{ color: '#6c7086', fontSize: 10, marginTop: 1 }}>{offsetAcctDesc}</div>}
                        </td>
                        <td style={{ color: '#89b4fa', textAlign: 'right', paddingTop: 2, verticalAlign: 'top' }}>{fmtAmount(Math.abs(watchedAmount ?? 0))}</td>
                      </tr>
                      <tr>
                        <td style={{ color: '#a6e3a1', fontWeight: 700, paddingTop: 4, verticalAlign: 'top' }}>CR</td>
                        <td style={{ color: '#cdd6f4', paddingTop: 4 }}>
                          {watchedAsset}
                          {assetAcctDesc && <div style={{ color: '#6c7086', fontSize: 10, marginTop: 1 }}>{assetAcctDesc}</div>}
                        </td>
                        <td style={{ color: '#a6e3a1', textAlign: 'right', paddingTop: 4, verticalAlign: 'top' }}>{fmtAmount(Math.abs(watchedAmount ?? 0))}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ── Transaction Lines (multiple mode, inside right column) ── */}
        {!isEdit && extTxnMode === 'multiple' && (
        <Card
          styles={{ body: { padding: '14px 16px' } }}
          style={{ ...sectionCard(REDWOOD.warning), marginBottom: 0 }}
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
              <span style={{ ...sectionHeader(REDWOOD.warning), marginBottom: 0 }}>
                <SwapOutlined /> Transaction Lines
              </span>
            </div>
          }
        >
          <Table
            size="small"
            dataSource={extTxnLines}
            rowKey="key"
            pagination={false}
            scroll={{ y: 200 }}
            style={{ marginBottom: 10, borderRadius: 6, overflow: 'hidden' }}
            rowClassName={(_, idx) => idx % 2 === 1 ? 'alt-row' : ''}
            columns={[
              {
                title: <span style={{ fontSize: 11, color: REDWOOD.neutral600 }}>#</span>,
                width: 32,
                render: (_: any, _r: any, idx: number) => (
                  <span style={{ fontSize: 12, color: REDWOOD.neutral600, fontWeight: 600 }}>{idx + 1}</span>
                ),
              },
              {
                title: <span style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Amount</span>,
                width: 120,
                render: (_: any, record: ExtTxnLine, idx: number) => (
                  <InputNumber
                    size="small" style={{ width: '100%' }} precision={2}
                    value={record.amount}
                    placeholder={txnDirection === 'DR' ? '+ve' : '-ve'}
                    onChange={(v) => {
                      if (v === null || v === undefined) { updateExtLine(idx, 'amount', v); return; }
                      const signed = txnDirection === 'DR' ? Math.abs(Number(v)) : -Math.abs(Number(v));
                      updateExtLine(idx, 'amount', signed);
                    }}
                  />
                ),
              },
              {
                title: <span style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Description</span>,
                render: (_: any, record: ExtTxnLine, idx: number) => (
                  <Input
                    size="small" value={record.description}
                    placeholder="Optional"
                    onChange={(e) => updateExtLine(idx, 'description', e.target.value)}
                  />
                ),
              },
              {
                title: <span style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Offset Account</span>,
                width: 200,
                render: (_: any, record: ExtTxnLine, idx: number) => (
                  <>
                    <Space.Compact style={{ width: '100%' }}>
                      <Input
                        size="small" readOnly value={record.offsetAccount}
                        style={{ fontFamily: 'monospace', fontSize: 11, background: record.offsetAccount ? '#f0f7ff' : undefined }}
                        placeholder="Select account…"
                      />
                      <Button size="small" icon={<SearchOutlined />} onClick={() => {
                        setLineCoaIdx(idx);
                        setLineCoaInitial(record.offsetAccount || '');
                        setLineCoaOpen(true);
                      }} />
                    </Space.Compact>
                    {record.offsetDesc && (
                      <div style={{ fontSize: 10, color: REDWOOD.info, marginTop: 2, paddingLeft: 2 }}>{record.offsetDesc}</div>
                    )}
                  </>
                ),
              },
              {
                title: '',
                width: 32,
                render: (_: any, _r: any, idx: number) => (
                  <Tooltip title="Remove line">
                    <Button size="small" type="text" danger icon={<CloseOutlined />}
                      onClick={() => setExtTxnLines(prev => prev.filter((_, i) => i !== idx))} />
                  </Tooltip>
                ),
              },
            ]}
            footer={() => (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                <Button
                  size="small" type="dashed" icon={<PlusOutlined />}
                  onClick={() => setExtTxnLines(prev => [
                    ...prev,
                    { key: Date.now(), amount: undefined, description: '', offsetAccount: '', offsetDesc: '' },
                  ])}
                >
                  Add Line
                </Button>
                <Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>{extTxnLines.length} line(s)</Text>
                  <Divider type="vertical" />
                  <Text strong style={{ fontSize: 13, color: REDWOOD.primary }}>
                    {fmtAmount(extTxnLines.reduce((s, l) => s + (l.amount ?? 0), 0), form.getFieldValue('currencyCode'))}
                  </Text>
                </Space>
              </div>
            )}
          />
        </Card>
        )}

        {/* ── Attachments ── */}
        <Card styles={{ body: { padding: '14px 16px' } }} style={sectionCard(REDWOOD.neutral600)}>
          <div style={sectionHeader(REDWOOD.neutral600)}>
            <PaperClipOutlined /> Attachments
          </div>
          <Upload
            fileList={attachments.map(a => ({
              uid: a.uid, name: a.name, status: a.status,
              size: a.fileSize, type: a.fileType,
            }))}
            beforeUpload={(file) => {
              const reader = new FileReader();
              reader.onload = (e) => {
                const base64 = (e.target?.result as string)?.split(',')[1] || '';
                setAttachments(prev => [...prev, {
                  uid: `new-${Date.now()}`, name: file.name, fileType: file.type,
                  fileSize: file.size, content: base64, status: 'done',
                }]);
              };
              reader.readAsDataURL(file);
              return false;
            }}
            onRemove={(file) => {
              const att = attachments.find(a => a.uid === file.uid);
              if (att?.id && initialValues?.externalTransactionId) {
                fetch(`${APEX_BASE}/cash/externaltransactions/${initialValues.externalTransactionId}/attachments/${att.id}`, { method: 'DELETE' }).catch(() => {});
              }
              setAttachments(prev => prev.filter(a => a.uid !== file.uid));
            }}
            multiple
            disabled={(!bankSelected && !isEdit) || saved}
          >
            <Button icon={<UploadOutlined />} disabled={(!bankSelected && !isEdit) || saved}>
              Attach Files
            </Button>
          </Upload>
          {attachments.length === 0 && (
            <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>No attachments</Text>
          )}
        </Card>

        </Col>
        </Row>

      </Form>

      {/* ── Sticky footer ── */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: REDWOOD.surface,
        borderTop: `1px solid ${REDWOOD.neutral200}`,
        padding: '12px 28px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 100,
        boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
      }}>
        <div>
          {!isEdit && !saved && (
            <Button
              icon={<ApiOutlined />}
              onClick={handleApiOpen}
              style={{ color: REDWOOD.neutral600, borderColor: REDWOOD.neutral300 }}
            >
              API Inspector
            </Button>
          )}
          {saved && (
            <Space>
              <LockOutlined style={{ color: REDWOOD.success }} />
              <span style={{ fontSize: 13, color: REDWOOD.success, fontWeight: 600 }}>Saved &amp; Locked</span>
            </Space>
          )}
        </div>
        <Space size={8}>
          {/* Delete button — shown after save (new) or in edit when not accounted */}
          {(saved || (isEdit && initialValues?.accountingFlag !== 'Y')) && (
            <Popconfirm
              title="Delete this transaction?"
              description="This action cannot be undone."
              onConfirm={handleDelete}
              okText="Delete"
              okButtonProps={{ danger: true }}
            >
              <Button
                size="large"
                danger
                loading={deleting}
                icon={<DeleteOutlined />}
                style={{ minWidth: 110 }}
              >
                Delete
              </Button>
            </Popconfirm>
          )}
          <Button size="large" onClick={onCancel} style={{ minWidth: 100 }}>
            {isEdit || saved ? 'Close' : 'Cancel'}
          </Button>
          {!isEdit && !saved && (
            <Button
              size="large"
              type="primary"
              loading={saving}
              onClick={handleSubmit}
              icon={<PlusOutlined />}
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary, minWidth: 180 }}
            >
              {extTxnMode === 'multiple'
                ? `Create ${extTxnLines.length} Transaction${extTxnLines.length !== 1 ? 's' : ''}`
                : 'Create Transaction'}
            </Button>
          )}
        </Space>
      </div>

      {/* ── Account Selector Modals ── */}
      <AccountSelector
        visible={cashAcctOpen}
        onCancel={() => setCashAcctOpen(false)}
        initialValue={form.getFieldValue('assetAccountCombination') || ''}
        onSelect={(code: string) => {
          form.setFieldValue('assetAccountCombination', code);
          setCashAcctOpen(false);
          validateAccountCode(code).then(r => {
            const seg4 = Object.values(r.segmentDetails)[3];
            setAssetAcctDesc((seg4 as any)?.description || '');
          }).catch(() => {});
        }}
      />
      <AccountSelector
        visible={offsetAcctOpen}
        onCancel={() => setOffsetAcctOpen(false)}
        initialValue={form.getFieldValue('offsetAccountCombination') || ''}
        onSelect={(code: string) => {
          form.setFieldValue('offsetAccountCombination', code);
          setOffsetAcctOpen(false);
          validateAccountCode(code).then(r => {
            const seg4 = Object.values(r.segmentDetails)[3];
            setOffsetAcctDesc((seg4 as any)?.description || '');
          }).catch(() => {});
        }}
      />
      <AccountSelector
        visible={lineCoaOpen}
        onCancel={() => setLineCoaOpen(false)}
        initialValue={lineCoaInitial}
        onSelect={(code: string) => {
          updateExtLine(lineCoaIdx, 'offsetAccount', code);
          validateAccountCode(code).then(r => {
            const seg4 = Object.values(r.segmentDetails)[3];
            updateExtLine(lineCoaIdx, 'offsetDesc', (seg4 as any)?.description || '');
          }).catch(() => {});
          setLineCoaOpen(false);
        }}
      />

      {/* ── API Inspector Modal ── */}
      <Modal
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /><span>API Inspector — POST /cash/externaltransactions</span></Space>}
        open={apiModal} onCancel={() => setApiModal(false)} width={780} footer={null}
        styles={{ body: { padding: '16px 24px' } }}
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          Endpoint: <Text code copyable style={{ fontSize: 12 }}>{APEX_BASE}/cash/externaltransactions</Text>
        </Text>
        <div style={{ marginTop: 12, marginBottom: 8 }}><Text strong>Request Body (JSON)</Text></div>
        <pre style={{ background: '#1e1e2e', color: '#cdd6f4', padding: 16, borderRadius: 6, fontSize: 12, overflowX: 'auto', maxHeight: 320, whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
          {apiPayload}
        </pre>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="primary" icon={<ApiOutlined />} loading={apiPosting} onClick={handleApiPost}
            style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}>
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
              color: REDWOOD.neutral900, padding: 16, borderRadius: 6, fontSize: 12,
              overflowX: 'auto', maxHeight: 240, whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0,
            }}>
              {apiResponse.body}
            </pre>
          </>
        )}
      </Modal>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────────────────────────────────
const ManageExternalTransactions: React.FC<{ module?: 'ap' | 'cash' }> = ({ module = 'cash' }) => {
  const { user } = useAuth();
  const currentUser = user?.email ?? user?.username ?? 'SYSTEM';

  const [transactions, setTransactions]   = useState<ExternalTxnRecord[]>([]);
  const [loading, setLoading]             = useState(false);
  const [hasSearched, setHasSearched]     = useState(false);
  const [allBankAccounts, setAllBankAccounts] = useState<BankAccountOption[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BUOption[]>([]);
  const [bankAccountMap, setBankAccountMap] = useState<Record<string, string>>({});
  const [bankAccountCurrencyMap, setBankAccountCurrencyMap] = useState<Record<string, string>>({});
  const [buLeMap, setBuLeMap]             = useState<Record<string, string>>({});
  const [buBankMap, setBuBankMap]         = useState<Record<string, string[]>>({});
  const [payeeOptions, setPayeeOptions]   = useState<PayeeOption[]>([]);
  const [selectedBU, setSelectedBU]       = useState<string>('');
  const [derivedLE, setDerivedLE]         = useState<string>('');
  const [activeTabKey, setActiveTabKey]   = useState('search');
  const [tabs, setTabs]                   = useState<{ key: string; label: string; record?: ExternalTxnRecord }[]>([]);
  const [lastApiUrl, setLastApiUrl]       = useState('');
  const [showApiModal, setShowApiModal]   = useState(false);
  const [searchForm] = Form.useForm();

  // Bank accounts filtered by selected BU (or all if no BU selected)
  const filteredBankAccounts = selectedBU && buBankMap[selectedBU]
    ? buBankMap[selectedBU].sort().map(n => ({ label: n, value: n }))
    : allBankAccounts;

  // ── Accounting state ─────────────────────────────────────────────────────
  const [selectedRowKeys, setSelectedRowKeys]   = useState<number[]>([]);
  const [acctModalOpen, setAcctModalOpen]       = useState(false);
  const [acctProgress, setAcctProgress]         = useState<BankAcctProgressRow[]>([]);
  const [acctRunning, setAcctRunning]           = useState(false);
  const [acctDone, setAcctDone]                 = useState(false);

  // ── Single-row Create Accounting state ───────────────────────────────────
  const [singleAcctModalOpen, setSingleAcctModalOpen] = useState(false);
  const [singleAcctProgress, setSingleAcctProgress]   = useState<BankAcctProgressRow[]>([]);
  const [singleAcctRunning, setSingleAcctRunning]     = useState(false);
  const [singleAcctDone, setSingleAcctDone]           = useState(false);

  // ── View Accounting modal state ───────────────────────────────────────────
  const [viewAcctOpen, setViewAcctOpen]   = useState(false);
  const [viewAcctTxn, setViewAcctTxn]     = useState<ExternalTxnRecord | null>(null);

  const modulePrefix = module === 'ap' ? '/ap' : '/cash';

  const exportToExcel = () => {
    const rows = transactions.map(t => ({
      'Txn Number':       t.transactionId ?? '',
      'Bank Account':     t.bankAccountName ?? '',
      'Business Unit':    t.businessUnitName ?? '',
      'Date':             t.transactionDate ?? '',
      'Value Date':       t.valueDate ?? '',
      'Cleared Date':     t.clearedDate ?? '',
      'Amount':           t.amount ?? '',
      'Currency':         t.currencyCode ?? '',
      'Reference':        t.referenceText ?? '',
      'Description':      t.description ?? '',
      'Cash Account':     t.assetAccountCombination ?? '',
      'Offset Account':   t.offsetAccountCombination ?? '',
      'Transaction Type': t.transactionType ?? '',
      'Status':           t.status ?? '',
      'Origin':           t.source ?? '',
      'Legal Entity':     t.legalEntityName ?? '',
      'Accounting Flag':  t.accountingFlag ?? '',
      'Check Number':     t.checkNumber ?? '',
      'Recon Reference':  t.reconReference ?? '',
      'Created By':       t.createdBy ?? '',
      'Creation Date':    t.creationDate ?? '',
      'Last Update Date': t.lastUpdateDate ?? '',
      'Sync Date':        t.syncDate ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'External Transactions');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buf], { type: 'application/octet-stream' }), `external_transactions_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`);
  };

  // ── Load LOVs ─────────────────────────────────────────────────────────────
  const loadLovs = useCallback(async () => {
    const buLeMapping: Record<string, string> = {};
    const buSet = new Set<string>();

    // Step 1: BUs from gl/businessunits
    try {
      const buRes = await fetch(`${APEX_BASE}/gl/businessunits`, { headers: { Accept: 'application/json' } });
      const buData = buRes.ok ? await buRes.json() : null;
      if (buData?.items) {
        (buData.items as any[]).forEach(i => {
          const buName = i.business_unit_name || i.businessUnitName || '';
          const leName = i.legal_entity_name  || i.legalEntityName  || '';
          if (buName) { buSet.add(buName); buLeMapping[buName] = leName; }
        });
      }
    } catch { /* silent */ }

    setBuLeMap({ ...buLeMapping });
    setBusinessUnits([...buSet].sort().map(n => ({ label: n, value: n })));

    // Step 2: Payees from cash/payees
    try {
      const pyRes = await fetch(`${APEX_BASE}/cash/payees`, { headers: { Accept: 'application/json' } });
      const pyData = pyRes.ok ? await pyRes.json() : null;
      if (pyData?.items) {
        const opts: PayeeOption[] = (pyData.items as any[])
          .filter((i: any) => i.active !== 'N')
          .map((i: any) => ({
            label: i.payee_name || '',
            value: i.payee_id,
            payeeName: i.payee_name || '',
          }))
          .sort((a: PayeeOption, b: PayeeOption) => a.label.localeCompare(b.label));
        setPayeeOptions(opts);
      }
    } catch { /* silent */ }

    // Step 3: Bank accounts from banks/bankaccounts (same source as AP / Bank Recon)
    try {
      const baRes = await fetch(`${APEX_BASE}/banks/bankaccounts`, { headers: { Accept: 'application/json' } });
      const baData = baRes.ok ? await baRes.json() : null;
      if (baData?.items) {
        const acctMap: Record<string, string> = {};
        const ccyMap:  Record<string, string> = {};
        const allAccts: string[] = [];
        (baData.items as any[]).forEach((i: any) => {
          const name = i.bank_account_name || '';
          if (!name) return;
          allAccts.push(name);
          if (i.cash_account_combination) acctMap[name] = i.cash_account_combination;
          if (i.currency_code)            ccyMap[name]  = i.currency_code;
        });
        setAllBankAccounts(allAccts.sort().map(n => ({ label: n, value: n })));
        setBankAccountMap(acctMap);
        setBankAccountCurrencyMap(ccyMap);
      }
    } catch { /* silent */ }

    // Step 3: Scan existing transactions to build BU → bank-account mapping
    // and enrich acctMap / ccyMap with values from actual transaction records.
    try {
      const res = await fetch(`${APEX_BASE}/cash/externaltransactions?row_limit=2000`);
      const data = await parseApexJson(res);
      if (data.success && data.items) {
        const items: ExternalTxnRecord[] = data.items;
        const acctMap: Record<string, string>      = {};
        const ccyMap:  Record<string, string>      = {};
        const buBanks: Record<string, Set<string>> = {};

        items.forEach(i => {
          if (i.bankAccountName) {
            if (i.businessUnitName) {
              if (!buBanks[i.businessUnitName]) buBanks[i.businessUnitName] = new Set();
              buBanks[i.businessUnitName].add(i.bankAccountName);
              buSet.add(i.businessUnitName);
            }
          }
          if (i.bankAccountName && i.assetAccountCombination)
            acctMap[i.bankAccountName] = i.assetAccountCombination;
          if (i.bankAccountName && i.currencyCode)
            ccyMap[i.bankAccountName] = i.currencyCode;
          if (i.businessUnitName && i.legalEntityName && !buLeMapping[i.businessUnitName])
            buLeMapping[i.businessUnitName] = i.legalEntityName;
        });

        // Merge transaction-derived account/currency hints (don't overwrite bank master)
        setBankAccountMap(prev => ({ ...prev, ...acctMap }));
        setBankAccountCurrencyMap(prev => ({ ...prev, ...ccyMap }));
        setBuLeMap({ ...buLeMapping });
        setBuBankMap(Object.fromEntries(
          Object.entries(buBanks).map(([bu, set]) => [bu, [...set]])
        ));
        setBusinessUnits([...buSet].sort().map(n => ({ label: n, value: n })));
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadLovs(); }, [loadLovs]);

  // ── Search ────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    const values = searchForm.getFieldsValue();
    const params = new URLSearchParams();
    if (values.transactionNumber)  params.set('transaction_number', values.transactionNumber);
    if (values.bankAccount)        params.set('bank_account',       values.bankAccount);
    if (values.businessUnit)       params.set('business_unit',      values.businessUnit);
    if (values.currencyCode)       params.set('currency_code',      values.currencyCode);
    if (values.transactionType)    params.set('transaction_type',   values.transactionType);
    if (values.source)             params.set('source',             values.source);
    if (values.status)             params.set('status',             values.status);
    if (values.reference)          params.set('reference',          values.reference);
    if (values.dateFrom)           params.set('date_from', (values.dateFrom as Dayjs).format('YYYY-MM-DD'));
    if (values.dateTo)             params.set('date_to',   (values.dateTo   as Dayjs).format('YYYY-MM-DD'));
    if (values.amountFrom != null) params.set('amount_from', String(values.amountFrom));
    if (values.amountTo   != null) params.set('amount_to',   String(values.amountTo));
    params.set('row_limit', '500');

    const url = `${APEX_BASE}/cash/externaltransactions?${params.toString()}`;
    setLastApiUrl(url);
    setLoading(true);
    setHasSearched(true);
    try {
      const res  = await fetch(url);
      const data = await parseApexJson(res);
      if (data.success) {
        setTransactions(data.items ?? []);
        if ((data.items ?? []).length === 0) message.info('No transactions found for the selected criteria.');
      } else {
        message.error(data.message || 'Search failed.');
      }
    } catch (e: any) {
      message.error('Network error: ' + e.message);
    } finally { setLoading(false); }
  }, [searchForm]);

  const handleBUChange = (bu: string) => {
    setSelectedBU(bu || '');
    setDerivedLE(bu ? (buLeMap[bu] || '') : '');
    // Clear bank account if it doesn't belong to this BU
    const banks = bu ? (buBankMap[bu] || []) : [];
    const currentBank = searchForm.getFieldValue('bankAccount');
    if (currentBank && banks.length > 0 && !banks.includes(currentBank)) {
      searchForm.setFieldValue('bankAccount', undefined);
    }
  };

  const handleReset = () => {
    searchForm.resetFields();
    setTransactions([]);
    setHasSearched(false);
    setSelectedRowKeys([]);
    setSelectedBU('');
    setDerivedLE('');
  };

  // ── Create Accounting ─────────────────────────────────────────────────────
  const openCreateAccountingModal = () => {
    const selected = transactions.filter(t => selectedRowKeys.includes(t.externalTransactionId));
    const noAccounts = selected.filter(t => !t.assetAccountCombination || !t.offsetAccountCombination);
    if (noAccounts.length > 0) {
      message.warning(`${noAccounts.length} row(s) have missing cash/offset account — they will be skipped.`);
    }
    const rows: BankAcctProgressRow[] = selected.map(t => {
      const missingAccounts = !t.assetAccountCombination || !t.offsetAccountCombination;
      const alreadyAccounted = t.accountingFlag === 'Y';
      const date = t.transactionDate || t.valueDate || dayjs().format('YYYY-MM-DD');
      const absAmount = Math.abs(t.amount ?? 0);
      const direction = t.transactionDirection ?? ((t.amount ?? 0) >= 0 ? 'DR' : 'CR');
      // DR = money in: DR bank/asset, CR offset
      // CR = money out: DR offset, CR bank/asset
      const drAccount = direction === 'DR' ? t.assetAccountCombination : t.offsetAccountCombination;
      const crAccount = direction === 'DR' ? t.offsetAccountCombination : t.assetAccountCombination;
      return {
        extTxnId:   t.externalTransactionId,
        txnDate:    date,
        periodName: derivePeriodName(new Date(date)),
        amount:     absAmount,
        currency:   t.currencyCode || 'AED',
        drAccount,
        crAccount,
        bu:         t.businessUnitName || '',
        status:     alreadyAccounted ? 'skipped' : missingAccounts ? 'error' : 'pending',
        message:    alreadyAccounted ? 'Already accounted — skipped' : missingAccounts ? 'Missing asset/offset account' : undefined,
      };
    });
    setAcctProgress(rows);
    setAcctDone(false);
    setAcctModalOpen(true);
  };

  const runCreateAccounting = async () => {
    setAcctRunning(true);

    const updateRow = (extTxnId: number, partial: Partial<BankAcctProgressRow>) =>
      setAcctProgress(prev => prev.map(r => r.extTxnId === extTxnId ? { ...r, ...partial } : r));

    for (const row of acctProgress) {
      if (row.status === 'skipped' || row.status === 'error') continue;

      updateRow(row.extTxnId, { status: 'running' });
      const txn = transactions.find(t => t.externalTransactionId === row.extTxnId);
      if (!txn) { updateRow(row.extTxnId, { status: 'error', message: 'Transaction not found' }); continue; }

      try {
        // 1. Resolve ledger dynamically
        const ledger = await fetchLedgerByBusinessUnit(txn.businessUnitName);
        if (!ledger) { updateRow(row.extTxnId, { status: 'error', message: 'Could not resolve ledger for BU' }); continue; }

        const direction = txn.transactionDirection ?? ((txn.amount ?? 0) >= 0 ? 'DR' : 'CR');
        const absAmount = Math.abs(txn.amount ?? 0);

        // DR = money in: DR bank/asset, CR offset
        // CR = money out: DR offset, CR bank/asset
        const drAccount = direction === 'DR' ? txn.assetAccountCombination : txn.offsetAccountCombination;
        const crAccount = direction === 'DR' ? txn.offsetAccountCombination : txn.assetAccountCombination;

        // buildPcBankTxnSlaPayload always makes offsetAccount the DR line and assetAccount the CR line
        const slaPayload = buildPcBankTxnSlaPayload({
          externalTransactionId:   txn.externalTransactionId,
          referenceText:           txn.referenceText || String(txn.externalTransactionId),
          transactionDate:         row.txnDate,
          accountingDate:          row.txnDate,
          periodName:              row.periodName,
          currency:                txn.currencyCode || 'AED',
          amount:                  absAmount,
          assetAccountCombination: crAccount,   // CR side goes to assetAccountCombination param
          offsetAccountCombination: drAccount,  // DR side goes to offsetAccountCombination param
          businessUnit:            txn.businessUnitName || undefined,
          legalEntity:             txn.legalEntityName  || undefined,
          ledgerId:                ledger.ledgerId,
          ledgerName:              ledger.ledgerName,
          createdBy:               currentUser,
        });

        // 2. Create SLA entry
        const slaResult = await createAccounting(slaPayload);

        // 3. Create GL journal
        const batchName = `BANK-${txn.externalTransactionId}-${Date.now()}`;
        const glPayload = {
          batch: {
            batchName, batchDescription: `Bank External Txn ${txn.externalTransactionId}`,
            ledgerName: ledger.ledgerName, ledgerId: ledger.ledgerId, status: 'NEW',
            accountingPeriod: row.periodName, controlTotal: absAmount,
            runningTotalDr: absAmount, runningTotalCr: absAmount,
            batchSource: 'Cash Management', createdBy: currentUser,
          },
          header: {
            ledgerId: ledger.ledgerId, ledgerName: ledger.ledgerName,
            jeCategory: 'Cash Management', jeSource: 'Cash Management',
            periodName: row.periodName,
            journalName: `BANK-EXT-${txn.externalTransactionId}`,
            description: `${txn.transactionType || 'Bank Txn'} – ${txn.referenceText || txn.externalTransactionId}`,
            currencyCode: txn.currencyCode || 'AED',
            currencyConversionType: 'User', currencyConversionDate: row.txnDate,
            currencyConversionRate: txn.bankConversionRate || 1,
            defaultEffectiveDate: row.txnDate,
            status: 'NEW', runningTotalDr: absAmount, runningTotalCr: absAmount,
            createdBy: currentUser,
          },
          lines: slaPayload.lines.map(l => ({
            enteredDr: l.lineType === 'DR' ? l.enteredDr : null,
            enteredCr: l.lineType === 'CR' ? l.enteredCr : null,
            accountedDr: l.accountedDr || null, accountedCr: l.accountedCr || null,
            statAmount: null, description: l.description,
            currencyCode: l.currencyCode || txn.currencyCode || 'AED',
            currencyConversionDate: row.txnDate,
            currencyConversionRate: txn.bankConversionRate || 1,
            userCurrencyConversionType: 'User',
            accountCombination: l.accountCombination,
            chartOfAccountsName: 'Chart of Accounts',
            reference1: String(txn.externalTransactionId),
            reference2: txn.referenceText || '',
            reference3: l.accountingClass || null,
            reference4: txn.businessUnitName || null,
            reference5: null, createdBy: currentUser,
          })),
        };

        const glRes = await fetch(`${APEX_BASE}/journals/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(glPayload),
        });

        let glMsg = '';
        if (glRes.ok) {
          const glData = await glRes.json();
          await fetch(`${APEX_BASE}/sla/accounting/post`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              headerId: slaResult.headerId,
              glBatchId: glData.batchId || 0,
              glBatchName: batchName,
              glHeaderId: glData.headerId || 0,
              postedBy: currentUser,
            }),
          });
          // 4. Stamp accounting flag via dedicated endpoint (no body parsing — URL params only)
          const flagUrl = `${APEX_BASE}/cash/externaltransactions/${txn.externalTransactionId}/acctflag?updated_by=${encodeURIComponent(currentUser)}`;
          const flagRes = await fetch(flagUrl, { method: 'PUT', headers: { Accept: 'application/json' } });
          const flagData = await flagRes.json().catch(() => ({})) as { success?: boolean; message?: string };
          if (!flagRes.ok || !flagData.success) {
            throw new Error(flagData.message || `Accounting flag update failed (HTTP ${flagRes.status})`);
          }
          // Update local state so the table reflects the change immediately
          setTransactions(prev => prev.map(t =>
            t.externalTransactionId === txn.externalTransactionId ? { ...t, accountingFlag: 'Y' } : t
          ));
          glMsg = `GL: ${batchName}`;
        } else {
          glMsg = 'GL journal failed — SLA is Draft';
        }

        updateRow(row.extTxnId, { status: 'success', message: `SLA ${slaResult.headerId} — ${glMsg}` });
      } catch (e: any) {
        updateRow(row.extTxnId, { status: 'error', message: e?.message || 'Unexpected error' });
      }
    }

    setAcctRunning(false);
    setAcctDone(true);
    setSelectedRowKeys([]);
  };

  // ── Single-row Create Accounting ──────────────────────────────────────────
  const openSingleAcctModal = (txn: ExternalTxnRecord) => {
    if (!txn.assetAccountCombination || !txn.offsetAccountCombination) {
      message.warning('Missing cash/offset account — cannot create accounting.');
      return;
    }
    const date = txn.transactionDate || txn.valueDate || dayjs().format('YYYY-MM-DD');
    const absAmount = Math.abs(txn.amount ?? 0);
    const direction = txn.transactionDirection ?? ((txn.amount ?? 0) >= 0 ? 'DR' : 'CR');
    const drAccount = direction === 'DR' ? txn.assetAccountCombination : txn.offsetAccountCombination;
    const crAccount = direction === 'DR' ? txn.offsetAccountCombination : txn.assetAccountCombination;
    const row: BankAcctProgressRow = {
      extTxnId:   txn.externalTransactionId,
      txnDate:    date,
      periodName: derivePeriodName(new Date(date)),
      amount:     absAmount,
      currency:   txn.currencyCode || 'AED',
      drAccount,
      crAccount,
      bu:         txn.businessUnitName || '',
      status:     'pending',
    };
    setSingleAcctProgress([row]);
    setSingleAcctDone(false);
    setSingleAcctModalOpen(true);
  };

  const runSingleAccounting = async () => {
    setSingleAcctRunning(true);
    const updateRow = (extTxnId: number, partial: Partial<BankAcctProgressRow>) =>
      setSingleAcctProgress(prev => prev.map(r => r.extTxnId === extTxnId ? { ...r, ...partial } : r));

    for (const row of singleAcctProgress) {
      if (row.status === 'skipped' || row.status === 'error') continue;
      updateRow(row.extTxnId, { status: 'running' });
      const txn = transactions.find(t => t.externalTransactionId === row.extTxnId);
      if (!txn) { updateRow(row.extTxnId, { status: 'error', message: 'Transaction not found' }); continue; }
      try {
        const ledger = await fetchLedgerByBusinessUnit(txn.businessUnitName);
        if (!ledger) { updateRow(row.extTxnId, { status: 'error', message: 'Could not resolve ledger for BU' }); continue; }
        const direction = txn.transactionDirection ?? ((txn.amount ?? 0) >= 0 ? 'DR' : 'CR');
        const absAmount = Math.abs(txn.amount ?? 0);
        const drAccount = direction === 'DR' ? txn.assetAccountCombination : txn.offsetAccountCombination;
        const crAccount = direction === 'DR' ? txn.offsetAccountCombination : txn.assetAccountCombination;
        const slaPayload = buildPcBankTxnSlaPayload({
          externalTransactionId:   txn.externalTransactionId,
          referenceText:           txn.referenceText || String(txn.externalTransactionId),
          transactionDate:         row.txnDate,
          accountingDate:          row.txnDate,
          periodName:              row.periodName,
          currency:                txn.currencyCode || 'AED',
          amount:                  absAmount,
          assetAccountCombination: crAccount,
          offsetAccountCombination: drAccount,
          businessUnit:            txn.businessUnitName || undefined,
          legalEntity:             txn.legalEntityName  || undefined,
          ledgerId:                ledger.ledgerId,
          ledgerName:              ledger.ledgerName,
          createdBy:               currentUser,
        });
        const slaResult = await createAccounting(slaPayload);
        const batchName = `BANK-${txn.externalTransactionId}-${Date.now()}`;
        const glPayload = {
          batch: {
            batchName, batchDescription: `Bank External Txn ${txn.externalTransactionId}`,
            ledgerName: ledger.ledgerName, ledgerId: ledger.ledgerId, status: 'NEW',
            accountingPeriod: row.periodName, controlTotal: absAmount,
            runningTotalDr: absAmount, runningTotalCr: absAmount,
            batchSource: 'Cash Management', createdBy: currentUser,
          },
          header: {
            ledgerId: ledger.ledgerId, ledgerName: ledger.ledgerName,
            jeCategory: 'Cash Management', jeSource: 'Cash Management',
            periodName: row.periodName,
            journalName: `BANK-EXT-${txn.externalTransactionId}`,
            description: `${txn.transactionType || 'Bank Txn'} – ${txn.referenceText || txn.externalTransactionId}`,
            currencyCode: txn.currencyCode || 'AED',
            currencyConversionType: 'User', currencyConversionDate: row.txnDate,
            currencyConversionRate: txn.bankConversionRate || 1,
            defaultEffectiveDate: row.txnDate,
            status: 'NEW', runningTotalDr: absAmount, runningTotalCr: absAmount,
            createdBy: currentUser,
          },
          lines: slaPayload.lines.map(l => ({
            enteredDr: l.lineType === 'DR' ? l.enteredDr : null,
            enteredCr: l.lineType === 'CR' ? l.enteredCr : null,
            accountedDr: l.accountedDr || null, accountedCr: l.accountedCr || null,
            statAmount: null, description: l.description,
            currencyCode: l.currencyCode || txn.currencyCode || 'AED',
            currencyConversionDate: row.txnDate,
            currencyConversionRate: txn.bankConversionRate || 1,
            userCurrencyConversionType: 'User',
            accountCombination: l.accountCombination,
            chartOfAccountsName: 'Chart of Accounts',
            reference1: String(txn.externalTransactionId),
            reference2: txn.referenceText || '',
            reference3: l.accountingClass || null,
            reference4: txn.businessUnitName || null,
            reference5: null, createdBy: currentUser,
          })),
        };
        const glRes = await fetch(`${APEX_BASE}/journals/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(glPayload),
        });
        let glMsg = '';
        if (glRes.ok) {
          const glData = await glRes.json();
          await fetch(`${APEX_BASE}/sla/accounting/post`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              headerId: slaResult.headerId,
              glBatchId: glData.batchId || 0,
              glBatchName: batchName,
              glHeaderId: glData.headerId || 0,
              postedBy: currentUser,
            }),
          });
          const flagUrl = `${APEX_BASE}/cash/externaltransactions/${txn.externalTransactionId}/acctflag?updated_by=${encodeURIComponent(currentUser)}`;
          const flagRes = await fetch(flagUrl, { method: 'PUT', headers: { Accept: 'application/json' } });
          const flagData = await flagRes.json().catch(() => ({})) as { success?: boolean; message?: string };
          if (!flagRes.ok || !flagData.success) {
            throw new Error(flagData.message || `Accounting flag update failed (HTTP ${flagRes.status})`);
          }
          setTransactions(prev => prev.map(t =>
            t.externalTransactionId === txn.externalTransactionId ? { ...t, accountingFlag: 'Y' } : t
          ));
          glMsg = `GL: ${batchName}`;
        } else {
          glMsg = 'GL journal failed — SLA is Draft';
        }
        updateRow(row.extTxnId, { status: 'success', message: `SLA ${slaResult.headerId} — ${glMsg}` });
      } catch (e: any) {
        updateRow(row.extTxnId, { status: 'error', message: e?.message || 'Unexpected error' });
      }
    }
    setSingleAcctRunning(false);
    setSingleAcctDone(true);
  };

  // ── Tab management ────────────────────────────────────────────────────────
  const openCreateTab = () => {
    const key   = newTabKey();
    const label = 'New Transaction';
    setTabs(prev => [...prev, { key, label }]);
    setActiveTabKey(key);
  };

  const openEditTab = (record: ExternalTxnRecord) => {
    const existing = tabs.find(t => t.record?.externalTransactionId === record.externalTransactionId);
    if (existing) { setActiveTabKey(existing.key); return; }
    const key   = newTabKey();
    const label = `Txn #${record.transactionId}`;
    setTabs(prev => [...prev, { key, label, record }]);
    setActiveTabKey(key);
  };

  const closeTab = (key: string) => {
    setTabs(prev => prev.filter(t => t.key !== key));
    if (activeTabKey === key) setActiveTabKey('search');
  };

  // ── Voucher PDF ──────────────────────────────────────────────────────────
  const [voucherPdfUrl, setVoucherPdfUrl] = useState<string | null>(null);
  const [voucherModalOpen, setVoucherModalOpen] = useState(false);

  const generateVoucherPdf = (r: ExternalTxnRecord) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;
    const fmt = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // ── Header ──────────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Buimerc Corporation Limited', pageW / 2, 18, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('DIFC, Dubai', pageW / 2, 24, { align: 'center' });

    // ── "Payment Voucher" box ────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const pvW = 70;
    const pvX = (pageW - pvW) / 2;
    doc.rect(pvX, 30, pvW, 9);
    doc.text('Payment Voucher', pageW / 2, 36, { align: 'center' });

    // ── Ref / Date (top-right) ───────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Ref No:  ${r.referenceText || r.transactionId}`, pageW - margin, 32, { align: 'right' });
    doc.text(`Date:    ${dayjs(r.transactionDate).format('DD-MMM-YYYY')}`, pageW - margin, 38, { align: 'right' });

    // ── Paid To / Chq row ───────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    let y = 48;
    doc.text('Paid to', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(r.payeeName || '', margin + 20, y);

    y += 7;
    doc.setFont('helvetica', 'bold');
    doc.text('Chq #', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(r.checkNumber || '', margin + 20, y);
    doc.setFont('helvetica', 'bold');
    doc.text('Chq Date#', margin + 70, y);
    doc.setFont('helvetica', 'normal');
    doc.text('', margin + 95, y);
    doc.setFont('helvetica', 'bold');
    doc.text('Drawn:', margin + 130, y);
    doc.setFont('helvetica', 'normal');
    doc.text(r.bankAccountName || '', margin + 145, y);

    // ── Amount ───────────────────────────────────────────────────────────────
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.text('Amount :', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`${r.currencyCode || 'AED'} ${fmt(Math.abs(r.amount))}`, margin + 20, y);

    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('in words:', margin, y);
    doc.setFont('helvetica', 'normal');
    // simple number-to-words stub (just show the figure)
    doc.text(`${r.currencyCode || 'AED'} ${fmt(Math.abs(r.amount))} Only`, margin + 20, y);

    // ── Narration ────────────────────────────────────────────────────────────
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.text('Narration', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(r.description || '', margin + 22, y, { maxWidth: pageW - margin - 22 - margin });

    // ── Account Details table ─────────────────────────────────────────────────
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Account Details', margin, y);
    y += 4;

    const isDebit = r.amount > 0;
    const rows: any[] = [
      [
        r.assetAccountCombination?.split('-')[3] || r.assetAccountCombination || '',
        r.assetAccountCombination?.split('-')[4] || '0',
        r.bankAccountName || '',
        r.description || '',
        isDebit ? fmt(Math.abs(r.amount)) : '',
        !isDebit ? fmt(Math.abs(r.amount)) : '',
      ],
      [
        r.offsetAccountCombination?.split('-')[3] || r.offsetAccountCombination || '',
        r.offsetAccountCombination?.split('-')[4] || '0',
        '',
        r.description || '',
        !isDebit ? fmt(Math.abs(r.amount)) : '',
        isDebit ? fmt(Math.abs(r.amount)) : '',
      ],
    ];

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['A/c #', 'Sub a/c', 'GL Name', 'Narration', 'Debit', 'Credit']],
      body: rows,
      foot: [['', '', '', 'Total', fmt(Math.abs(r.amount)), fmt(Math.abs(r.amount))]],
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.3, lineColor: [0, 0, 0] },
      bodyStyles: { textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0] },
      footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.3, lineColor: [0, 0, 0] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 18, halign: 'center' },
        2: { cellWidth: 40 },
        3: { cellWidth: 45 },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 22, halign: 'right' },
      },
      theme: 'grid',
    });

    // ── Signature row ────────────────────────────────────────────────────────
    const finalY = (doc as any).lastAutoTable.finalY + 16;
    const sigLabels = ['Prepared by', 'Checked by', 'Approved by', 'Received by'];
    const sigW = (pageW - 2 * margin) / sigLabels.length;
    sigLabels.forEach((label, i) => {
      const x = margin + i * sigW;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(label, x + sigW / 2, finalY, { align: 'center' });
      doc.line(x + 4, finalY + 12, x + sigW - 4, finalY + 12);
    });

    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    setVoucherPdfUrl(url);
    setVoucherModalOpen(true);
  };

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns: ColumnsType<ExternalTxnRecord> = [
    {
      title: 'Txn Number', dataIndex: 'transactionId', width: 100,
      render: (v, r) => (
        <Button type="link" size="small" style={{ padding: 0, color: REDWOOD.info }} onClick={() => openEditTab(r)}>
          {v}
        </Button>
      ),
    },
    {
      title: 'Bank Account', dataIndex: 'bankAccountName', ellipsis: true,
      render: v => <Tooltip title={v}><Text style={{ fontSize: 12 }}>{v?.length > 28 ? v.substring(0, 28) + '…' : v || '—'}</Text></Tooltip>,
    },
    { title: 'Business Unit', dataIndex: 'businessUnitName', ellipsis: true, width: 160,
      render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Date', dataIndex: 'transactionDate', width: 105, render: fmtDate },
    {
      title: 'Amount', dataIndex: 'amount', width: 130, align: 'right',
      render: (v, r) => (
        <Text style={{ fontSize: 12, color: v < 0 ? REDWOOD.error : REDWOOD.success }}>
          {fmtAmount(v, r.currencyCode)}
        </Text>
      ),
    },
    { title: 'Reference', dataIndex: 'referenceText', ellipsis: true, width: 140,
      render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    {
      title: 'Cash Account', dataIndex: 'assetAccountCombination', ellipsis: true, width: 180,
      render: v => <Tooltip title={v}><Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{v || '—'}</Text></Tooltip>,
    },
    {
      title: 'Offset Account', dataIndex: 'offsetAccountCombination', ellipsis: true, width: 180,
      render: v => <Tooltip title={v}><Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{v || '—'}</Text></Tooltip>,
    },
    {
      title: 'Status', dataIndex: 'status', width: 110,
      render: v => <Badge status={statusColor(v) as any} text={<Text style={{ fontSize: 12 }}>{statusLabel(v)}</Text>} />,
    },
    {
      title: 'Origin', dataIndex: 'source', width: 90,
      render: v => <Text style={{ fontSize: 12 }}>{(SOURCE_LABELS[v] ?? v) || '—'}</Text>,
    },
    {
      title: 'Accounted', dataIndex: 'accountingFlag', width: 80, align: 'center',
      render: (v) => v === 'Y'
        ? <Tag color="green" style={{ fontSize: 11, margin: 0 }}>Posted</Tag>
        : <Tag color="default" style={{ fontSize: 11, margin: 0 }}>No</Tag>,
    },
    {
      title: 'Dir', dataIndex: 'transactionDirection', width: 60, align: 'center',
      render: v => v
        ? <Tag color={v === 'DR' ? 'blue' : 'volcano'} style={{ fontSize: 11, margin: 0 }}>{v}</Tag>
        : <Text style={{ fontSize: 12, color: '#bbb' }}>—</Text>,
    },
    {
      title: 'Type', dataIndex: 'transactionType', ellipsis: true, width: 130,
      render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text>,
    },
    {
      title: 'Pmt Method', dataIndex: 'paymentMethod', width: 100,
      render: v => v
        ? <Tag style={{ fontSize: 11, margin: 0 }}>{v}</Tag>
        : <Text style={{ fontSize: 12, color: '#bbb' }}>—</Text>,
    },
    {
      title: 'Payee', dataIndex: 'payeeName', ellipsis: true,
      render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text>,
    },
    {
      title: 'Actions', key: 'actions', width: 130, align: 'center',
      render: (_, r) => (
        <Space size={2}>
          <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditTab(r)} /></Tooltip>
          <Tooltip title="Print Voucher">
            <Button type="text" size="small" icon={<PrinterOutlined />}
              style={{ color: REDWOOD.info }}
              onClick={() => generateVoucherPdf(r)} />
          </Tooltip>
          {r.accountingFlag !== 'Y' && (
            <Tooltip title="Create Accounting">
              <Button type="text" size="small" icon={<AccountBookOutlined />}
                style={{ color: REDWOOD.info }}
                onClick={() => openSingleAcctModal(r)} />
            </Tooltip>
          )}
          {r.accountingFlag === 'Y' && (
            <Tooltip title="View Accounting">
              <Button type="text" size="small" icon={<EyeOutlined />}
                style={{ color: REDWOOD.success }}
                onClick={() => { setViewAcctTxn(r); setViewAcctOpen(true); }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const [searchOpen, setSearchOpen] = useState(true);
  const [gridSearch, setGridSearch] = useState('');

  // ── Tab items ─────────────────────────────────────────────────────────────
  const searchPane = (
    <div style={{ padding: '16px 0' }}>
      {/* Collapsible Search Form */}
      <Collapse
        activeKey={searchOpen ? ['search'] : []}
        onChange={(keys: string | string[]) => setSearchOpen((Array.isArray(keys) ? keys : [keys]).includes('search'))}
        style={{ marginBottom: 16, borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, background: REDWOOD.surface }}
        items={[{
          key: 'search',
          label: <Text strong style={{ fontSize: 13 }}>Search</Text>,
          extra: (
            <Space size={8} onClick={e => e.stopPropagation()}>
              <Button size="small" onClick={e => { e.stopPropagation(); handleReset(); }} icon={<ReloadOutlined />}>Reset</Button>
              <Button size="small" icon={<ApiOutlined />} onClick={e => { e.stopPropagation(); setShowApiModal(true); }} style={{ color: REDWOOD.neutral600 }}>API</Button>
              <Button size="small" type="primary" icon={<SearchOutlined />} loading={loading} onClick={e => { e.stopPropagation(); handleSearch(); }}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>
                Search
              </Button>
            </Space>
          ),
          children: (
        <Form form={searchForm} layout="horizontal" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }}>
          <Row gutter={[24, 4]}>

            {/* ── Row 1: BU → LE ── */}
            <Col xs={24} md={12}>
              <Form.Item label="Business Unit" name="businessUnit" style={{ marginBottom: 10 }}>
                <Select
                  showSearch placeholder="Select Business Unit"
                  optionFilterProp="label" options={businessUnits}
                  allowClear style={{ width: '100%' }}
                  onChange={handleBUChange}
                  onClear={() => handleBUChange('')}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Legal Entity" style={{ marginBottom: 10 }}>
                <Input
                  value={derivedLE || (selectedBU ? '—' : '')}
                  readOnly
                  placeholder="Auto-derived from BU"
                  style={{ background: '#f5f5f5', color: derivedLE ? REDWOOD.info : REDWOOD.neutral600, cursor: 'default' }}
                />
              </Form.Item>
            </Col>

            {/* ── Row 2: Bank (filtered by BU) + Date From ── */}
            <Col xs={24} md={12}>
              <Form.Item label="Bank Account" name="bankAccount" style={{ marginBottom: 10 }}>
                <Select
                  showSearch placeholder={selectedBU ? `Banks for ${selectedBU}` : 'Select account'}
                  optionFilterProp="label" options={filteredBankAccounts}
                  allowClear style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Date From" name="dateFrom" style={{ marginBottom: 10 }}>
                <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" />
              </Form.Item>
            </Col>

            {/* ── Row 3: Status + Date To ── */}
            <Col xs={24} md={12}>
              <Form.Item label="Status" name="status" style={{ marginBottom: 10 }}>
                <Select placeholder="Select status" allowClear>
                  <Option value="REC">Reconciled</Option>
                  <Option value="UNR">Unreconciled</Option>
                  <Option value="CLR">Cleared</Option>
                  <Option value="CAN">Cancelled</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Date To" name="dateTo" style={{ marginBottom: 10 }}>
                <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" />
              </Form.Item>
            </Col>

            {/* ── Row 4: Txn # + Reference ── */}
            <Col xs={24} md={12}>
              <Form.Item label="Transaction #" name="transactionNumber" style={{ marginBottom: 10 }}>
                <Input placeholder="Transaction number" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Reference" name="reference" style={{ marginBottom: 10 }}>
                <Input placeholder="Reference text" />
              </Form.Item>
            </Col>

            {/* ── Row 5: Type + Currency ── */}
            <Col xs={24} md={12}>
              <Form.Item label="Transaction Type" name="transactionType" style={{ marginBottom: 10 }}>
                <Select placeholder="Select type" allowClear>
                  <Option value="External Transaction">External Transaction</Option>
                  <Option value="Adhoc Payment">Adhoc Payment</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Currency" name="currencyCode" style={{ marginBottom: 10 }}>
                <Select placeholder="Select currency" allowClear>
                  {['AED','USD','EUR','GBP','SAR','QAR','KWD','BHD','OMR'].map(c => <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </Form.Item>
            </Col>

            {/* ── Row 6: Amount range + Origin ── */}
            <Col xs={24} md={12}>
              <Form.Item label="Amount From" name="amountFrom" style={{ marginBottom: 10 }}>
                <InputNumber style={{ width: '100%' }} placeholder="Min amount" precision={2} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Amount To" name="amountTo" style={{ marginBottom: 10 }}>
                <InputNumber style={{ width: '100%' }} placeholder="Max amount" precision={2} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Origin" name="source" style={{ marginBottom: 10 }}>
                <Select placeholder="Select origin" allowClear>
                  <Option value="ORA_BAT">Bank</Option>
                  <Option value="ORA_MAN">Manual</Option>
                  <Option value="ORA_STA">Statement</Option>
                  <Option value="MANUAL">Manual (Legacy)</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Text type="secondary" style={{ fontSize: 11 }}>Select a Business Unit to filter banks and legal entity</Text>
        </Form>
          ),
        }]}
      />

      {/* Results */}
      {hasSearched && (() => {
        const q = gridSearch.trim().toLowerCase();
        const filtered = q
          ? transactions.filter(r =>
              [r.transactionId, r.bankAccountName, r.businessUnitName, r.referenceText,
               r.description, r.status, r.source, r.transactionType, r.currencyCode,
               r.assetAccountCombination, r.offsetAccountCombination, r.transactionDate]
              .some(v => String(v ?? '').toLowerCase().includes(q))
            )
          : transactions;
        return (
          <Card style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
            styles={{ body: { padding: 0 } }}
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Space>
                  <Text strong>
                    Search Results{' '}
                    <Tag color="blue">{filtered.length}{q && filtered.length !== transactions.length ? ` / ${transactions.length}` : ''}</Tag>
                  </Text>
                  {selectedRowKeys.length > 0 && (
                    <Button
                      size="small" type="primary" icon={<CheckCircleOutlined />}
                      style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
                      onClick={openCreateAccountingModal}>
                      Create Accounting ({selectedRowKeys.length})
                    </Button>
                  )}
                </Space>
                <Input
                  prefix={<SearchOutlined style={{ color: REDWOOD.neutral600 }} />}
                  placeholder="Filter results…"
                  allowClear
                  size="small"
                  style={{ width: 220 }}
                  value={gridSearch}
                  onChange={e => setGridSearch(e.target.value)}
                />
              </div>
            }
          >
            <Table
              dataSource={filtered} columns={columns} rowKey="externalTransactionId"
              loading={loading} size="small" pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} transactions` }}
              locale={{ emptyText: <Empty description="No transactions found" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              scroll={{ x: 1600 }}
              rowSelection={{
                type: 'checkbox',
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys as number[]),
                getCheckboxProps: (r) => ({ disabled: r.accountingFlag === 'Y' }),
              }}
            />
          </Card>
        );
      })()}
    </div>
  );

  const tabItems = [
    { key: 'search', label: <span><SearchOutlined /> Search</span>, children: searchPane, closable: false },
    ...tabs.map(t => ({
      key: t.key,
      label: (
        <span>
          {t.record ? <EditOutlined style={{ marginRight: 4 }} /> : <PlusOutlined style={{ marginRight: 4 }} />}
          {t.label}
          <CloseOutlined style={{ marginLeft: 8, fontSize: 10 }} onClick={e => { e.stopPropagation(); closeTab(t.key); }} />
        </span>
      ),
      children: (
        <ExternalTxnForm
          initialValues={t.record}
          bankAccounts={allBankAccounts}
          businessUnits={businessUnits}
          bankAccountMap={bankAccountMap}
          bankAccountCurrencyMap={bankAccountCurrencyMap}
          buBankMap={buBankMap}
          payeeOptions={payeeOptions}
          onSave={() => { closeTab(t.key); handleSearch(); loadLovs(); }}
          onCancel={() => closeTab(t.key)}
        />
      ),
      closable: false,
    })),
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Header */}
        <div style={{ padding: '14px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to={modulePrefix}>{module === 'ap' ? 'Payables' : 'Cash Management'}</Link> },
            { title: 'Manage External Transactions' },
          ]} />
        </div>

        <div style={{ padding: '0 24px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '14px 0 4px' }}>
            <Space>
              <Button icon={<DownloadOutlined />} onClick={exportToExcel} disabled={transactions.length === 0}>
                Export to Excel
              </Button>
              <Button icon={<PlusOutlined />} type="primary"
                onClick={openCreateTab}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>
                Create Transaction
              </Button>
            </Space>
          </div>

          <Tabs
            type="card"
            activeKey={activeTabKey}
            onChange={setActiveTabKey}
            items={tabItems}
            style={{ marginTop: 8 }}
          />
        </div>

        {/* ── Create Accounting Modal ──────────────────────────── */}
        <Modal
          title={<Space><CheckCircleOutlined style={{ color: REDWOOD.info }} />Create Accounting — Bank Transactions</Space>}
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
          width={900}
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
          <Table<BankAcctProgressRow>
            dataSource={acctProgress}
            rowKey="extTxnId"
            size="small"
            pagination={false}
            columns={[
              { title: 'Ext Txn ID', dataIndex: 'extTxnId', width: 90,
                render: v => <Text style={{ fontSize: 12 }}>{v}</Text> },
              { title: 'Date', dataIndex: 'txnDate', width: 95,
                render: v => <Text style={{ fontSize: 11 }}>{v}</Text> },
              { title: 'Amount', dataIndex: 'amount', width: 110, align: 'right' as const,
                render: (v, r) => <Text style={{ fontSize: 12, fontWeight: 600 }}>{fmtAmount(v, r.currency)}</Text> },
              { title: 'DR Account', dataIndex: 'drAccount',
                render: v => <Text style={{ fontSize: 11, fontFamily: 'monospace', color: '#c74634' }}>{v || '—'}</Text> },
              { title: 'CR Account', dataIndex: 'crAccount',
                render: v => <Text style={{ fontSize: 11, fontFamily: 'monospace', color: '#1d7b4d' }}>{v || '—'}</Text> },
              { title: 'Status', dataIndex: 'status', width: 140,
                render: (v, r) => {
                  if (v === 'pending') return <Tag color="default" style={{ fontSize: 11 }}>Pending</Tag>;
                  if (v === 'running') return <Tag icon={<SyncOutlined spin />} color="processing" style={{ fontSize: 11 }}>Running</Tag>;
                  if (v === 'success') return <><Tag color="success" style={{ fontSize: 11 }}>Done</Tag>
                    {r.message && <div style={{ fontSize: 10, color: '#1d7b4d', marginTop: 2 }}>{r.message}</div>}</>;
                  if (v === 'error')   return <><Tag color="error" style={{ fontSize: 11 }}>Error</Tag>
                    {r.message && <div style={{ fontSize: 10, color: '#c74634', marginTop: 2 }}>{r.message}</div>}</>;
                  if (v === 'skipped') return <Tag color="warning" style={{ fontSize: 11 }}>Already Posted</Tag>;
                  return null;
                }},
            ]}
          />
          {acctDone && (
            <Alert
              type={acctProgress.some(r => r.status === 'error') ? 'warning' : 'success'}
              showIcon
              message={acctProgress.some(r => r.status === 'error')
                ? 'Accounting completed with some errors'
                : 'Accounting created and posted successfully'}
              style={{ marginTop: 12 }}
            />
          )}
        </Modal>

        {/* ── Single-Row Create Accounting Modal ──────────────────── */}
        <Modal
          title={<Space><AccountBookOutlined style={{ color: REDWOOD.info }} />Create Accounting</Space>}
          open={singleAcctModalOpen}
          onCancel={() => { if (!singleAcctRunning) setSingleAcctModalOpen(false); }}
          footer={
            singleAcctDone
              ? <Button onClick={() => setSingleAcctModalOpen(false)}>Close</Button>
              : [
                  <Button key="cancel" onClick={() => setSingleAcctModalOpen(false)} disabled={singleAcctRunning}>Cancel</Button>,
                  <Button key="run" type="primary" loading={singleAcctRunning}
                    disabled={singleAcctProgress.every(r => r.status === 'skipped' || r.status === 'error')}
                    style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
                    onClick={runSingleAccounting}>
                    {singleAcctRunning ? 'Processing…' : 'Run Create Accounting'}
                  </Button>,
                ]
          }
          width={800}
          destroyOnClose
        >
          <Table<BankAcctProgressRow>
            dataSource={singleAcctProgress}
            rowKey="extTxnId"
            size="small"
            pagination={false}
            columns={[
              { title: 'Ext Txn ID', dataIndex: 'extTxnId', width: 90,
                render: v => <Text style={{ fontSize: 12 }}>{v}</Text> },
              { title: 'Date', dataIndex: 'txnDate', width: 95,
                render: v => <Text style={{ fontSize: 11 }}>{v}</Text> },
              { title: 'Amount', dataIndex: 'amount', width: 110, align: 'right' as const,
                render: (v, r) => <Text style={{ fontSize: 12, fontWeight: 600 }}>{fmtAmount(v, r.currency)}</Text> },
              { title: 'DR Account', dataIndex: 'drAccount',
                render: v => <Text style={{ fontSize: 11, fontFamily: 'monospace', color: REDWOOD.info }}>{v || '—'}</Text> },
              { title: 'CR Account', dataIndex: 'crAccount',
                render: v => <Text style={{ fontSize: 11, fontFamily: 'monospace', color: REDWOOD.success }}>{v || '—'}</Text> },
              { title: 'Status', dataIndex: 'status', width: 140,
                render: (v, r) => {
                  if (v === 'pending') return <Tag color="default" style={{ fontSize: 11 }}>Pending</Tag>;
                  if (v === 'running') return <Tag icon={<SyncOutlined spin />} color="processing" style={{ fontSize: 11 }}>Running</Tag>;
                  if (v === 'success') return <><Tag color="success" style={{ fontSize: 11 }}>Done</Tag>
                    {r.message && <div style={{ fontSize: 10, color: '#1d7b4d', marginTop: 2 }}>{r.message}</div>}</>;
                  if (v === 'error')   return <><Tag color="error" style={{ fontSize: 11 }}>Error</Tag>
                    {r.message && <div style={{ fontSize: 10, color: '#c74634', marginTop: 2 }}>{r.message}</div>}</>;
                  if (v === 'skipped') return <Tag color="warning" style={{ fontSize: 11 }}>Already Posted</Tag>;
                  return null;
                }},
            ]}
          />
          {singleAcctDone && (
            <Alert
              type={singleAcctProgress.some(r => r.status === 'error') ? 'warning' : 'success'}
              showIcon
              message={singleAcctProgress.some(r => r.status === 'error')
                ? 'Accounting completed with some errors'
                : 'Accounting created and posted successfully'}
              style={{ marginTop: 12 }}
            />
          )}
        </Modal>

        {/* ── View Accounting Modal ────────────────────────────────── */}
        <Modal
          title={<Space><EyeOutlined style={{ color: REDWOOD.success }} />View Accounting</Space>}
          open={viewAcctOpen}
          onCancel={() => setViewAcctOpen(false)}
          footer={<Button onClick={() => setViewAcctOpen(false)}>Close</Button>}
          width={700}
          destroyOnClose
        >
          {viewAcctTxn && (() => {
            const txn = viewAcctTxn;
            const direction = txn.transactionDirection ?? ((txn.amount ?? 0) >= 0 ? 'DR' : 'CR');
            const absAmount = Math.abs(txn.amount ?? 0);
            const drLabel = direction === 'DR' ? 'Bank / Asset Account' : 'Offset Account';
            const crLabel = direction === 'DR' ? 'Offset Account' : 'Bank / Asset Account';
            const drAcct  = direction === 'DR' ? txn.assetAccountCombination : txn.offsetAccountCombination;
            const crAcct  = direction === 'DR' ? txn.offsetAccountCombination : txn.assetAccountCombination;
            return (
              <>
                {/* Transaction Info Header */}
                <div style={{ background: REDWOOD.neutral100, borderRadius: 6, padding: '12px 16px', marginBottom: 16 }}>
                  <Row gutter={16}>
                    <Col xs={12} md={6}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Transaction ID</Text>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{txn.transactionId || txn.externalTransactionId}</div>
                    </Col>
                    <Col xs={12} md={6}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Date</Text>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{fmtDate(txn.transactionDate)}</div>
                    </Col>
                    <Col xs={12} md={6}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Amount</Text>
                      <div style={{ fontWeight: 600, fontSize: 13, color: absAmount >= 0 ? REDWOOD.success : REDWOOD.error }}>
                        {fmtAmount(absAmount, txn.currencyCode)}
                      </div>
                    </Col>
                    <Col xs={12} md={6}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Business Unit</Text>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{txn.businessUnitName || '—'}</div>
                    </Col>
                  </Row>
                  <Row gutter={16} style={{ marginTop: 8 }}>
                    <Col xs={24} md={12}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Direction</Text>
                      <div>
                        <Tag color={direction === 'DR' ? 'blue' : 'green'} style={{ fontSize: 12, fontWeight: 600 }}>
                          {direction === 'DR' ? '▲ DR — Money In' : '▼ CR — Money Out'}
                        </Tag>
                      </div>
                    </Col>
                    <Col xs={24} md={12}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Reference</Text>
                      <div style={{ fontSize: 13 }}>{txn.referenceText || '—'}</div>
                    </Col>
                  </Row>
                </div>

                {/* Journal Lines */}
                <div style={{ fontWeight: 600, fontSize: 12, color: REDWOOD.neutral600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Journal Entry
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: REDWOOD.neutral100 }}>
                      <th style={{ textAlign: 'left', padding: '8px 12px', border: `1px solid ${REDWOOD.neutral200}`, width: 50 }}>Dr/Cr</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px', border: `1px solid ${REDWOOD.neutral200}` }}>Account</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px', border: `1px solid ${REDWOOD.neutral200}`, width: 120 }}>Label</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px', border: `1px solid ${REDWOOD.neutral200}`, width: 110 }}>DR Amount</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px', border: `1px solid ${REDWOOD.neutral200}`, width: 110 }}>CR Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: '8px 12px', border: `1px solid ${REDWOOD.neutral200}`, color: REDWOOD.info, fontWeight: 700 }}>DR</td>
                      <td style={{ padding: '8px 12px', border: `1px solid ${REDWOOD.neutral200}` }}>{drAcct || '—'}</td>
                      <td style={{ padding: '8px 12px', border: `1px solid ${REDWOOD.neutral200}`, fontSize: 11, color: REDWOOD.neutral600 }}>{drLabel}</td>
                      <td style={{ padding: '8px 12px', border: `1px solid ${REDWOOD.neutral200}`, textAlign: 'right', color: REDWOOD.info, fontWeight: 600 }}>{fmtAmount(absAmount)}</td>
                      <td style={{ padding: '8px 12px', border: `1px solid ${REDWOOD.neutral200}`, textAlign: 'right' }}>—</td>
                    </tr>
                    <tr style={{ background: REDWOOD.neutral100 }}>
                      <td style={{ padding: '8px 12px', border: `1px solid ${REDWOOD.neutral200}`, color: REDWOOD.success, fontWeight: 700 }}>CR</td>
                      <td style={{ padding: '8px 12px', border: `1px solid ${REDWOOD.neutral200}` }}>{crAcct || '—'}</td>
                      <td style={{ padding: '8px 12px', border: `1px solid ${REDWOOD.neutral200}`, fontSize: 11, color: REDWOOD.neutral600 }}>{crLabel}</td>
                      <td style={{ padding: '8px 12px', border: `1px solid ${REDWOOD.neutral200}`, textAlign: 'right' }}>—</td>
                      <td style={{ padding: '8px 12px', border: `1px solid ${REDWOOD.neutral200}`, textAlign: 'right', color: REDWOOD.success, fontWeight: 600 }}>{fmtAmount(absAmount)}</td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end', gap: 16, padding: '6px 12px', background: REDWOOD.neutral100, borderRadius: '0 0 4px 4px', border: `1px solid ${REDWOOD.neutral200}`, borderTop: 'none' }}>
                  <Text style={{ fontSize: 12 }}>Total DR: <Text strong style={{ color: REDWOOD.info }}>{fmtAmount(absAmount, txn.currencyCode)}</Text></Text>
                  <Text style={{ fontSize: 12 }}>Total CR: <Text strong style={{ color: REDWOOD.success }}>{fmtAmount(absAmount, txn.currencyCode)}</Text></Text>
                </div>
              </>
            );
          })()}
        </Modal>

        {/* API Info Modal */}
        <Modal title={<Space><ApiOutlined /><span>API Endpoint Info</span></Space>}
          open={showApiModal} onCancel={() => setShowApiModal(false)} footer={null} width={600}>
          <div style={{ padding: 8 }}>
            <Text strong>GET (Query)</Text>
            <Text code copyable style={{ display: 'block', marginTop: 4, fontSize: 11, wordBreak: 'break-all' }}>
              {lastApiUrl || `${APEX_BASE}/cash/externaltransactions?bank_account=&status=&date_from=&date_to=`}
            </Text>
            <Divider />
            <Text strong>POST (Sync)</Text>
            <Text code copyable style={{ display: 'block', marginTop: 4, fontSize: 11 }}>
              {APEX_BASE}/cash/externaltransactions
            </Text>
          </div>
        </Modal>

        {/* ── Payment Voucher PDF Preview ──────────────────────────── */}
        <Modal
          title={<Space><PrinterOutlined style={{ color: REDWOOD.info }} /><span>Payment Voucher</span></Space>}
          open={voucherModalOpen}
          onCancel={() => { setVoucherModalOpen(false); if (voucherPdfUrl) URL.revokeObjectURL(voucherPdfUrl); setVoucherPdfUrl(null); }}
          footer={[
            <Button key="download" type="primary" icon={<DownloadOutlined />}
              style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
              onClick={() => {
                if (!voucherPdfUrl) return;
                const a = document.createElement('a');
                a.href = voucherPdfUrl;
                a.download = 'payment-voucher.pdf';
                a.click();
              }}>
              Download PDF
            </Button>,
            <Button key="close" onClick={() => { setVoucherModalOpen(false); if (voucherPdfUrl) URL.revokeObjectURL(voucherPdfUrl); setVoucherPdfUrl(null); }}>
              Close
            </Button>,
          ]}
          width={820}
          styles={{ body: { padding: 0 } }}
        >
          {voucherPdfUrl && (
            <iframe
              src={voucherPdfUrl}
              style={{ width: '100%', height: '70vh', border: 'none' }}
              title="Payment Voucher Preview"
            />
          )}
        </Modal>
      </Content>
    </Layout>
  );
};

export default ManageExternalTransactions;
