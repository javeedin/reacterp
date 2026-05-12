import React, { useState, useCallback, useEffect, useRef } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
  Layout, Breadcrumb, Typography, Card, Table, Button, Form, Input, Select,
  DatePicker, InputNumber, Row, Col, Space, Tag, Tooltip, Tabs, Collapse,
  message, Empty, Divider, Badge, Modal, Alert, Spin, Segmented, Upload, Popconfirm, AutoComplete,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, BankOutlined, PlusOutlined, SearchOutlined, ReloadOutlined,
  EditOutlined, CloseOutlined, DollarOutlined, ApiOutlined, FileTextOutlined,
  SwapOutlined, DownloadOutlined, CheckCircleOutlined, SyncOutlined,
  AccountBookOutlined, EyeOutlined, UploadOutlined, PaperClipOutlined, DeleteOutlined,
  LockOutlined, PrinterOutlined, FilePdfOutlined,
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
import { searchCombinations, type DistCombination } from '../../services/distCombinations.service';
import { validateGlPayload, persistValidationLog, type GlJournalPayload } from '../../services/glValidation.service';
import { useGlValidation } from '../../context/GlValidationContext';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

const REDWOOD = {
  primary: '#C74634', primaryLight: '#E85D4A', primaryDark: '#A33B2C',
  success: '#1D7B4D', warning: '#D4A800', info: '#0572CE', error: '#D93025',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral300: '#C7C7C7',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
  textSecondary: '#6B6B6B',
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
  buCompanyMap: Record<string, string>;
  onSave: () => void;
  onCancel: () => void;
  onPayeeCreated: (newOption: PayeeOption) => void;
  onCreateAccounting?: (txns: ExternalTxnRecord[]) => void;
}> = ({ initialValues, bankAccounts, businessUnits, bankAccountMap, bankAccountCurrencyMap, buBankMap, buCompanyMap, payeeOptions, onSave, onCancel, onPayeeCreated, onCreateAccounting }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [txnDirection, setTxnDirection] = useState<'DR' | 'CR'>('CR');
  const [selectedBu, setSelectedBu] = useState<string | undefined>(initialValues?.businessUnitName);
  const derivedCompany = selectedBu ? (buCompanyMap[selectedBu] || '') : '';
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
  const [distCombinations, setDistCombinations] = useState<DistCombination[]>([]);
  const [offsetDistSet, setOffsetDistSet] = useState('');                  // single mode
  const [lineDistSets, setLineDistSets]   = useState<Record<number, string>>({}); // multiple mode
  const [attachments, setAttachments]   = useState<Array<{id?: number; uid: string; name: string; fileType: string; fileSize: number; content?: string; rawFile?: File; status: 'done' | 'uploading' | 'error'}>>([]);
  const [attachUploading, setAttachUploading] = useState(false);
  const [previewAtt, setPreviewAtt] = useState<{ name: string; fileType: string; content: string; blobUrl?: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedExtId, setSavedExtId] = useState<number | null>(null);
  const [savedExtIds, setSavedExtIds] = useState<number[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [attSaving, setAttSaving] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfVisible, setPdfVisible] = useState(false);
  const [createPayeeVisible, setCreatePayeeVisible] = useState(false);
  const [createPayeeForm] = Form.useForm();
  const [createPayeeSaving, setCreatePayeeSaving] = useState(false);
  const isEdit = !!initialValues?.externalTransactionId;
  const buSelected = !!selectedBu;
  const [selectedBank, setSelectedBank] = useState<string | undefined>(initialValues?.bankAccountName);
  const bankSelected = !!selectedBank;

  const watchedAsset   = Form.useWatch('assetAccountCombination', form);
  const watchedOffset  = Form.useWatch('offsetAccountCombination', form);
  const watchedAmount  = Form.useWatch('amount', form);
  const watchedTxnType = Form.useWatch('transactionType', form);
  const watchedCurrency = Form.useWatch('currencyCode', form);
  const watchedRate     = Form.useWatch('bankConversionRate', form);
  const [inverseRateVal, setInverseRateVal] = useState<number | undefined>(undefined);
  const isForeignCurrency = !!watchedCurrency && watchedCurrency !== 'AED';
  const isAdhocPayment = watchedTxnType === 'Adhoc Payment';

  // Adhoc Payment → always money out (CR), always single mode
  useEffect(() => {
    if (isAdhocPayment) {
      setTxnDirection('CR');
      form.setFieldsValue({ transactionDirection: 'CR' });
      setExtTxnMode('single');
    }
  }, [isAdhocPayment, form]);

  // AED → auto-set conversion rate to 1
  useEffect(() => {
    if (watchedCurrency === 'AED') {
      form.setFieldsValue({ bankConversionRate: 1, bankConversionRateType: 'Corporate' });
      setInverseRateVal(1);
    }
  }, [watchedCurrency, form]);

  // Sync inverse rate display when watchedRate changes externally (e.g. on edit load)
  useEffect(() => {
    if (watchedRate && watchedRate > 0) {
      setInverseRateVal(Math.round((1 / watchedRate) * 1000000) / 1000000);
    }
  }, [watchedRate]);

  const filteredBankAccounts = selectedBu && buBankMap[selectedBu]?.length
    ? buBankMap[selectedBu].sort().map(n => ({ label: n, value: n }))
    : bankAccounts;

  const updateExtLine = (idx: number, field: string, value: any) =>
    setExtTxnLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));

  useEffect(() => { setSelectedBu(initialValues?.businessUnitName); }, [initialValues]);

  useEffect(() => {
    searchCombinations({}).then(setDistCombinations).catch(() => {});
  }, []);

  const applyCompanySegment = useCallback((combo: string): string => {
    if (!derivedCompany || !combo) return combo;
    const parts = combo.split('-');
    parts[0] = derivedCompany;
    return parts.join('-');
  }, [derivedCompany]);

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
        bankConversionRate:        initialValues.bankConversionRate ?? null,
        bankConversionRateType:    initialValues.bankConversionRateType ?? null,
        transactionDirection:      dir,
        paymentMethod:             initialValues.paymentMethod,
        paymentDocument:           initialValues.paymentDocument,
        paperDocumentNumber:       initialValues.paperDocumentNumber,
        payeeName:                 initialValues.payeeName,
        payeeId:                   initialValues.payeeId,
      });
      // Populate lines table from initial values (edit mode)
      setExtTxnLines([{
        key: 0,
        amount: initialValues.amount ?? undefined,
        description: initialValues.description ?? '',
        offsetAccount: initialValues.offsetAccountCombination ?? '',
        offsetDesc: '',
      }]);
      // Fetch existing attachments for edit mode — moved to dedicated effect below
    } else {
      form.resetFields();
      form.setFieldsValue({ transactionDate: dayjs(), valueDate: dayjs(), transactionDirection: 'CR', transactionType: 'External Transaction' });
      setTxnDirection('CR');
      setAssetAcctDesc('');
      setOffsetAcctDesc('');
      setExtTxnLines([{ key: 0, amount: undefined, description: '', offsetAccount: '', offsetDesc: '' }]);
    }
  }, [initialValues, form]);

  // Load attachments only once when the transaction ID becomes known
  const extTxnId = initialValues?.externalTransactionId;
  useEffect(() => {
    if (!extTxnId) return;
    fetch(`${APEX_BASE}/cash/externaltransactions/${extTxnId}/attachments`, { headers: { Accept: 'application/json' } })
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.items)) {
          setAttachments(d.items.map((a: any) => ({
            id: a.id, uid: String(a.id), name: a.fileName, fileType: a.fileType || '', fileSize: a.fileSize || 0, status: 'done' as const,
          })));
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extTxnId]);

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
      BankConversionRate:    values.bankConversionRate ?? null,
      BankConversionRateType: values.bankConversionRateType ?? null,
      PaymentMethod:        values.paymentMethod ?? null,
      PaymentDocument:      values.paymentDocument ?? null,
      PaperDocumentNumber:  values.paperDocumentNumber ?? null,
      PayeeName:            values.payeeName ?? null,
      PayeeId:              values.payeeId ?? null,
    }],
  });

  const handlePrintPdf = () => {
    const values = form.getFieldsValue();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const fmt = (v: any) => v != null && v !== '' ? String(v) : '—';
    const fmtNum = (v: any) => v != null ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '—';
    const fmtDate = (v: any) => {
      if (!v) return '—';
      try { return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
      catch { return String(v); }
    };

    // Header bar
    doc.setFillColor(191, 70, 0);
    doc.rect(0, 0, pageW, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('External Transaction', 14, 11);
    doc.setFontSize(9);
    doc.text(`Printed: ${new Date().toLocaleString()}`, pageW - 14, 11, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    let y = 26;

    // Transaction ID if saved
    if (savedExtId) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(191, 70, 0);
      doc.text(`Transaction ID: ${savedExtId}`, 14, y);
      doc.setTextColor(0, 0, 0);
      y += 8;
    }

    // Section 1: Organisation & Bank
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Organisation & Bank', 14, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      body: [
        ['Business Unit', fmt(values.businessUnitName), 'Company Code', fmt(derivedCompany)],
        ['Bank Account', fmt(values.bankAccountName), 'Currency', fmt(values.currencyCode)],
        ['Cash / Asset Account', fmt(values.assetAccountCombination), 'Direction', values.transactionDirection === 'DR' ? 'Money In (DR)' : 'Money Out (CR)'],
      ],
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 }, 2: { fontStyle: 'bold', cellWidth: 42 } },
      alternateRowStyles: { fillColor: [247, 247, 247] },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 6;

    // Section 2: Transaction Details
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Transaction Details', 14, y);
    y += 2;
    const inverseRate = watchedRate && watchedRate > 0 ? Math.round((1 / watchedRate) * 1000000) / 1000000 : null;
    autoTable(doc, {
      startY: y,
      body: [
        ['Transaction Date', fmtDate(values.transactionDate), 'Value Date', fmtDate(values.valueDate)],
        ['Transaction Type', fmt(values.transactionType), 'Reference', fmt(values.referenceText)],
        ['Payment Method', fmt(values.paymentMethod), 'Payment Document', fmt(values.paymentDocument)],
        ['Paper Doc #', fmt(values.paperDocumentNumber), 'Conv. Rate Type', fmt(values.bankConversionRateType)],
        [`Conv. Rate (${values.currencyCode || 'FCY'}→AED)`, fmtNum(values.bankConversionRate),
         `Inverse Rate (AED→${values.currencyCode || 'FCY'})`, fmtNum(inverseRate)],
      ],
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 }, 2: { fontStyle: 'bold', cellWidth: 42 } },
      alternateRowStyles: { fillColor: [247, 247, 247] },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 6;

    // Section 3: Adhoc Payee (if applicable)
    if (values.transactionType === 'Adhoc Payment' && values.payeeName) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Payee Details', 14, y);
      y += 2;
      autoTable(doc, {
        startY: y,
        body: [
          ['Payee Name', fmt(values.payeeName), 'Payee Type', fmt(values.payeeType)],
          ['Payee Account', fmt(values.payeeAccountNumber), 'Bank Name', fmt(values.payeeBankName)],
          ['IBAN', fmt(values.payeeIban), '', ''],
        ],
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 }, 2: { fontStyle: 'bold', cellWidth: 42 } },
        alternateRowStyles: { fillColor: [247, 247, 247] },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // Section 4: Transaction Lines
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Transaction Lines', 14, y);
    y += 2;

    const lineRows = extTxnLines.map((l, i) => [
      i + 1,
      l.offsetAccount || '—',
      l.offsetDesc || '—',
      l.description || '—',
      l.amount != null ? fmtNum(Math.abs(l.amount)) : '—',
    ]);
    const totalAmt = extTxnLines.reduce((s, l) => s + Math.abs(l.amount ?? 0), 0);
    lineRows.push(['', '', '', 'Total', fmtNum(totalAmt)] as any);

    autoTable(doc, {
      startY: y,
      head: [['#', 'Offset Account', 'Account Desc', 'Description', 'Amount']],
      body: lineRows,
      styles: { fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: [58, 58, 58] },
      alternateRowStyles: { fillColor: [247, 247, 247] },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 50 }, 4: { halign: 'right', cellWidth: 28 } },
      margin: { left: 14, right: 14 },
    });

    // Footer
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
    const url = URL.createObjectURL(blob);
    setPdfUrl(url);
    setPdfVisible(true);
  };

  const handleSubmit = async () => {
    let values: any;
    try { values = await form.validateFields(); } catch { return; }

    const invalid = extTxnLines.filter(l => !l.amount);
    if (invalid.length > 0) { message.error('All lines must have an amount'); return; }
    const missingOffset = extTxnLines.filter(l => !l.offsetAccount);
    if (missingOffset.length > 0) { message.error('All lines must have an offset account'); return; }

    setSaving(true);

    if (isEdit) {
      // Edit: update the single transaction using first line values
      const line = extTxnLines[0];
      try {
        const res = await fetch(`${APEX_BASE}/cash/externaltransactions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload({ ...values, amount: line.amount, description: line.description ?? '', offsetAccountCombination: line.offsetAccount ?? '' })),
        });
        const data = await res.json();
        if (data.status === 'success') {
          message.success('Transaction updated.');
          onSave();
        } else {
          message.error(data.message || 'Update failed.');
        }
      } catch (e: any) {
        message.error('Network error: ' + e.message);
      } finally { setSaving(false); }
      return;
    }

    // Create: one POST per line
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
      BankConversionRate:      values.bankConversionRate ?? null,
      BankConversionRateType:  values.bankConversionRateType ?? null,
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
    let savedId: any = null;
    const allSavedIds: number[] = [];
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
          if (i === 0) savedId = data.externalTransactionId ?? null;
          if (data.externalTransactionId) allSavedIds.push(data.externalTransactionId);
          // Upload attachments on first line
          if (i === 0 && data.externalTransactionId && attachments.length > 0) {
            for (const att of attachments.filter(a => !a.id)) {
              try {
                await fetch(`${APEX_BASE}/cash/externaltransactions/${data.externalTransactionId}/attachments`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ fileName: att.name, fileType: att.fileType, fileSize: att.fileSize, content: att.content, createdBy: 'ERP_USER' }),
                });
              } catch { /* ignore */ }
            }
          }
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
    setSaved(true);
    setSavedExtId(savedId);
    setSavedExtIds(allSavedIds);
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
    if (!att.id || !initialValues?.externalTransactionId) return;
    setPreviewLoading(true);
    try {
      const res = await fetch(`${APEX_BASE}/cash/externaltransactions/${initialValues.externalTransactionId}/attachments/${att.id}`, { headers: { Accept: 'application/json' } });
      const d = await res.json();
      const content = d.content || d.CONTENT || '';
      const fileType = att.fileType || d.fileType || d.FILE_TYPE || 'application/octet-stream';
      if (!content) { message.warning('No content available for preview.'); return; }
      const blobUrl = makeBlobUrl(content, fileType);
      setPreviewAtt({ name: att.name, fileType, content, blobUrl });
    } catch {
      message.error('Failed to load attachment for preview.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownloadAttachment = async (file: any) => {
    const att = attachments.find(a => a.uid === file.uid);
    if (!att) return;
    let content = att.content;
    let fileType = att.fileType;
    if (!content && att.id && initialValues?.externalTransactionId) {
      try {
        const res = await fetch(`${APEX_BASE}/cash/externaltransactions/${initialValues.externalTransactionId}/attachments/${att.id}`, { headers: { Accept: 'application/json' } });
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

  // Locked = reconciled or accounted — cannot delete, but can still add attachments
  const isLocked = isEdit && (initialValues?.status === 'REC' || initialValues?.accountingFlag === 'Y');

  const handleSaveAttachments = async () => {
    const extId = savedExtId ?? initialValues?.externalTransactionId;
    if (!extId) { message.error('Transaction ID not available'); return; }
    const pending = attachments.filter(a => !a.id);
    if (pending.length === 0) { message.info('No new attachments to save.'); return; }
    setAttSaving(true);
    let savedCount = 0;
    for (const att of pending) {
      if (!att.rawFile) { message.warning(`${att.name}: no file data — skipped`); continue; }
      try {
        const params = new URLSearchParams({ fileName: att.name, fileType: att.fileType || '', fileSize: String(att.fileSize), createdBy: 'ERP_USER' });
        const postUrl = `${APEX_BASE}/cash/externaltransactions/${extId}/attachments?${params}`;
        const res = await fetch(postUrl, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: att.rawFile });
        const txt = await res.text();
        let resp: any = null;
        try { resp = JSON.parse(txt); } catch { /* not JSON */ }
        if (resp?.status === 'success') savedCount++;
        else message.error(`${att.name}: ${resp?.message || txt || `HTTP ${res.status}`}`);
      } catch (e: any) { message.error(`${att.name}: ${e.message}`); }
    }
    // Refresh attachment list from server
    try {
      const r = await fetch(`${APEX_BASE}/cash/externaltransactions/${extId}/attachments`, { headers: { Accept: 'application/json' } });
      const d = await r.json();
      if (Array.isArray(d.items)) {
        setAttachments(d.items.map((a: any) => ({
          id: a.id, uid: String(a.id), name: a.fileName, fileType: a.fileType || '', fileSize: a.fileSize || 0, status: 'done' as const,
        })));
      }
    } catch { /* silent */ }
    message.success(`${savedCount} attachment(s) saved.`);
    setAttSaving(false);
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
    <div style={{ padding: '0 0 80px' }}>
      <style>{`
        .direction-dr .ant-segmented-item-selected { background: #1677ff !important; color: #fff !important; }
        .direction-cr .ant-segmented-item-selected { background: #ff4d4f !important; color: #fff !important; }
        .ext-doc-wrap { border: 1px solid #d0d0d0; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.09); background: #fff; max-width: 1400px; margin: 0 auto; }
        .ext-sec { border-bottom: 2px solid #ddd; }
        .ext-sec-title { font-weight: 700; font-size: 13px; color: #1a1a1a; padding: 9px 14px; border-bottom: 1px solid #e4e4e4; background: #fafafa; letter-spacing: 0.1px; }
        .ext-row { display: grid; grid-template-columns: 180px 1fr 160px 1fr; border-bottom: 1px solid #ebebeb; min-height: 48px; }
        .ext-row:last-child { border-bottom: none; }
        .ext-row-alt { background: #fff; }
        .ext-lbl { font-weight: 600; font-size: 12px; color: #3a3a3a; padding: 8px 12px; background: #efefef; border-right: 1px solid #e0e0e0; display: flex; align-items: center; }
        .ext-val { padding: 4px 10px; border-right: 1px solid #e8e8e8; display: flex; align-items: center; flex-wrap: wrap; gap: 2px; min-height: 48px; }
        .ext-val:last-child { border-right: none; }
        .ext-val .ant-form-item { margin-bottom: 0; width: 100%; }
        .ext-val .ant-select { width: 100%; }
        .ext-val .ant-picker { width: 100%; }
        .ext-val .ant-input-number { width: 100%; }
        .ext-lines-hdr { font-weight: 700; font-size: 13px; color: #1a1a1a; padding: 9px 14px; background: #fafafa; border-bottom: 1px solid #e4e4e4; border-top: 2px solid #ddd; display: flex; justify-content: space-between; align-items: center; }
        .ext-attach { padding: 12px 16px; border-top: 2px solid #ddd; background: #fafafa; }
        .ext-attach-title { font-weight: 700; font-size: 13px; color: #1a1a1a; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
      `}</style>

      <Form form={form} layout="vertical" size="middle">
        <div className="ext-doc-wrap">


          {/* ══════════ SECTION 1: Organisation & Bank ══════════ */}
          <div className="ext-sec">
            <div className="ext-sec-title">Organisation &amp; Bank</div>

            {/* Business Unit | Company Code */}
            <div className="ext-row">
              <div className="ext-lbl">Business Unit</div>
              <div className="ext-val">
                <Form.Item name="businessUnitName" rules={[{ required: !isEdit, message: 'Required' }]}>
                  <Select
                    showSearch optionFilterProp="label" options={businessUnits}
                    placeholder="Select business unit" variant="borderless"
                    disabled={isEdit || saved || !!selectedBank}
                    className="ext-txn-bu-select"
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
              </div>
              <div className="ext-lbl">Company Code</div>
              <div className="ext-val">
                {derivedCompany
                  ? <Tag color="blue" style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>{derivedCompany}</Tag>
                  : selectedBu
                    ? <Text style={{ fontSize: 12, color: '#cf1322' }}>⚠ Not configured</Text>
                    : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
                }
              </div>
            </div>

            {/* Bank Account | Currency */}
            <div className="ext-row ext-row-alt">
              <div className="ext-lbl">Bank Account</div>
              <div className="ext-val">
                <Form.Item name="bankAccountName" rules={[{ required: !isEdit, message: 'Required' }]}>
                  <Select
                    showSearch optionFilterProp="label" optionLabelProp="label" options={filteredBankAccounts}
                    variant="borderless"
                    placeholder={buSelected && !derivedCompany ? 'No company code' : buSelected ? 'Select bank account' : 'Select BU first'}
                    disabled={isEdit || !buSelected || saved || (!derivedCompany && buSelected)}
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
              </div>
              <div className="ext-lbl">Currency</div>
              <div className="ext-val">
                <Form.Item name="currencyCode">
                  <Select variant="borderless" placeholder="Auto" allowClear disabled={isEdit || !bankSelected || saved}>
                    {['AED', 'USD', 'EUR', 'GBP', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR'].map(c => (
                      <Option key={c} value={c}>{c}</Option>
                    ))}
                  </Select>
                </Form.Item>
              </div>
            </div>

            {/* Cash / Asset Account | Direction */}
            <div className="ext-row">
              <div className="ext-lbl">Cash / Asset Account</div>
              <div className="ext-val" style={{ flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }}>
                <div style={{ display: 'flex', width: '100%', gap: 0 }}>
                  <Form.Item name="assetAccountCombination" noStyle>
                    <Input
                      readOnly disabled={isEdit || saved} variant="borderless"
                      placeholder={isEdit ? '—' : 'Auto-populated from bank account'}
                      style={{ fontFamily: 'monospace', fontSize: 12, flex: 1 }}
                    />
                  </Form.Item>
                  {!isEdit && !saved && (
                    <Button size="small" type="text" icon={<SearchOutlined />}
                      disabled={!bankSelected} onClick={() => setCashAcctOpen(true)} />
                  )}
                </div>
                {assetAcctDesc && <div style={{ fontSize: 11, color: REDWOOD.info, paddingLeft: 4 }}>{assetAcctDesc}</div>}
              </div>
              <div className="ext-lbl">Direction</div>
              <div className="ext-val">
                <Form.Item name="transactionDirection" initialValue="CR" noStyle>
                  <Segmented
                    options={[{ label: 'Money In', value: 'DR' }, { label: 'Money Out', value: 'CR' }]}
                    onChange={v => {
                      const dir = v as 'DR' | 'CR';
                      setTxnDirection(dir);
                      setExtTxnLines(prev => prev.map(l =>
                        l.amount != null
                          ? { ...l, amount: dir === 'DR' ? Math.abs(l.amount) : -Math.abs(l.amount) }
                          : l
                      ));
                    }}
                    disabled={isEdit || !bankSelected || isAdhocPayment || saved}
                    style={{ background: txnDirection === 'DR' ? '#e6f4ff' : '#fff1f0', opacity: isAdhocPayment ? 0.7 : 1 }}
                    className={`direction-segmented direction-${txnDirection.toLowerCase()}`}
                  />
                </Form.Item>
              </div>
            </div>
          </div>

          {/* ══════════ SECTION 2: Transaction Details ══════════ */}
          <div className="ext-sec">
            <div className="ext-sec-title">Transaction Details</div>

            {/* Transaction Date | Value Date */}
            <div className="ext-row">
              <div className="ext-lbl">Transaction Date</div>
              <div className="ext-val">
                <Form.Item name="transactionDate" rules={[{ required: !isEdit, message: 'Required' }]}>
                  <DatePicker format="D-MMM-YYYY" variant="borderless" disabled={isEdit || !bankSelected || saved} style={{ width: '100%' }} />
                </Form.Item>
              </div>
              <div className="ext-lbl">Value Date</div>
              <div className="ext-val">
                <Form.Item name="valueDate">
                  <DatePicker format="D-MMM-YYYY" variant="borderless" disabled={isEdit || !bankSelected || saved} style={{ width: '100%' }} />
                </Form.Item>
              </div>
            </div>

            {/* Transaction Type | Reference */}
            <div className="ext-row ext-row-alt">
              <div className="ext-lbl">Transaction Type</div>
              <div className="ext-val">
                <Form.Item name="transactionType" initialValue="External Transaction" rules={[{ required: true, message: 'Required' }]}>
                  <Select variant="borderless" placeholder="Select type" disabled={isEdit || !bankSelected || saved}
                    onChange={(val) => {
                      if (val === 'Adhoc Payment' && extTxnLines.length > 1) {
                        Modal.confirm({
                          title: 'Switch to Adhoc Payment?',
                          content: 'Adhoc Payment supports only one line. All existing lines will be cleared. Continue?',
                          okText: 'Yes, clear lines', cancelText: 'Cancel',
                          onOk: () => {
                            setExtTxnLines([{ key: 0, amount: undefined, description: '', offsetAccount: '', offsetDesc: '' }]);
                            form.setFieldValue('transactionType', val);
                          },
                          onCancel: () => { form.setFieldValue('transactionType', 'External Transaction'); },
                        });
                      }
                    }}
                  >
                    <Option value="External Transaction">External Transaction</Option>
                    <Option value="Adhoc Payment">Adhoc Payment</Option>
                  </Select>
                </Form.Item>
              </div>
              <div className="ext-lbl">Reference</div>
              <div className="ext-val">
                <Form.Item name="referenceText">
                  <Input variant="borderless" placeholder="e.g. STMT-REF-001" disabled={isEdit || !bankSelected || saved} />
                </Form.Item>
              </div>
            </div>

            {/* Payment Method | Conv. Rate Type */}
            <div className="ext-row">
              <div className="ext-lbl">Payment Method</div>
              <div className="ext-val">
                <Form.Item name="paymentMethod" rules={[{ required: true, message: 'Required' }]}>
                  <Select variant="borderless" placeholder="Select method" allowClear disabled={isEdit || !bankSelected || saved}>
                    {['CHECK', 'EFT', 'WIRE', 'CASH', 'MISC'].map(m => <Option key={m} value={m}>{m}</Option>)}
                  </Select>
                </Form.Item>
              </div>
              <div className="ext-lbl">
                Conv. Rate Type{isForeignCurrency && <span style={{ color: '#ff4d4f', marginLeft: 2 }}>*</span>}
              </div>
              <div className="ext-val">
                <Form.Item name="bankConversionRateType"
                  rules={[{ required: isForeignCurrency, message: 'Required' }]}
                >
                  <Select variant="borderless"
                    placeholder={isForeignCurrency ? 'Required' : 'Optional'}
                    allowClear disabled={isEdit || !bankSelected || saved}
                  >
                    <Option value="Corporate">Corporate</Option>
                    <Option value="Spot">Spot</Option>
                    <Option value="User">User</Option>
                  </Select>
                </Form.Item>
              </div>
            </div>

            {/* Paper Doc # | Conv. Rate */}
            <div className="ext-row ext-row-alt">
              <div className="ext-lbl">Paper Doc #</div>
              <div className="ext-val">
                <Form.Item name="paperDocumentNumber">
                  <Input variant="borderless" placeholder="CHQ-00123" disabled={isEdit || !bankSelected || saved} />
                </Form.Item>
              </div>
              <div className="ext-lbl" style={{ fontFamily: 'monospace', fontSize: 11 }}>
                Conv. Rate ({watchedCurrency || 'FCY'}→AED){isForeignCurrency && <span style={{ color: '#ff4d4f', marginLeft: 2 }}>*</span>}
              </div>
              <div className="ext-val">
                <Form.Item name="bankConversionRate"
                  rules={[{ required: isForeignCurrency, message: 'Required' }]}
                >
                  <InputNumber
                    variant="borderless" precision={6} min={0}
                    placeholder="e.g. 3.6725"
                    disabled={isEdit || !bankSelected || saved}
                    style={{ width: '100%' }}
                    onChange={v => {
                      if (v && v > 0) setInverseRateVal(Math.round((1 / v) * 1000000) / 1000000);
                      else setInverseRateVal(undefined);
                    }}
                  />
                </Form.Item>
              </div>
            </div>

            {/* Payment Document | Inverse Rate */}
            <div className="ext-row">
              <div className="ext-lbl">Payment Document</div>
              <div className="ext-val">
                <Form.Item name="paymentDocument" rules={[{ required: true, message: 'Required' }]}>
                  <Input variant="borderless" placeholder="e.g. Cheque Book Name" disabled={isEdit || !bankSelected || saved} />
                </Form.Item>
              </div>
              <div className="ext-lbl" style={{ fontFamily: 'monospace', fontSize: 11 }}>
                Inverse Rate (AED→{watchedCurrency || 'FCY'}){isForeignCurrency && <span style={{ color: '#ff4d4f', marginLeft: 2 }}>*</span>}
              </div>
              <div className="ext-val">
                <InputNumber
                  variant="borderless" precision={6} min={0}
                  placeholder="e.g. 0.2724"
                  disabled={isEdit || !bankSelected || saved}
                  value={inverseRateVal}
                  style={{ width: '100%' }}
                  onChange={v => {
                    setInverseRateVal(v ?? undefined);
                    if (v && v > 0) form.setFieldValue('bankConversionRate', Math.round((1 / v) * 1000000) / 1000000);
                  }}
                />
              </div>
            </div>
          </div>

          {/* ══════════ SECTION 3: Payee Details (Adhoc Payment only) ══════════ */}
          {isAdhocPayment && (
            <div className="ext-sec">
              <div className="ext-sec-title">Payee Details</div>

              <div className="ext-row">
                <div className="ext-lbl">Payee Name</div>
                <div className="ext-val">
                  <div style={{ display: 'flex', width: '100%', gap: 4, alignItems: 'center' }}>
                    <Form.Item name="payeeId" rules={[{ required: true, message: 'Select a payee' }]} style={{ flex: 1, marginBottom: 0 }}>
                      <Select showSearch placeholder="Select payee..." variant="borderless"
                        disabled={isEdit || !bankSelected || saved}
                        optionFilterProp="label" options={payeeOptions}
                        onChange={(val: number) => {
                          const p = payeeOptions.find(o => o.value === val);
                          if (p) form.setFieldValue('payeeName', p.payeeName);
                        }}
                      />
                    </Form.Item>
                    {!isEdit && !saved && (
                      <Tooltip title="Create new payee">
                        <Button size="small" icon={<PlusOutlined />}
                          onClick={() => { createPayeeForm.resetFields(); setCreatePayeeVisible(true); }} />
                      </Tooltip>
                    )}
                  </div>
                  <Form.Item name="payeeName" hidden><Input /></Form.Item>
                </div>
                <div className="ext-lbl">Payee Type</div>
                <div className="ext-val"><Text type="secondary" style={{ fontSize: 12 }}>—</Text></div>
              </div>

              <div className="ext-row ext-row-alt">
                <div className="ext-lbl">Payee Account</div>
                <div className="ext-val"><Text type="secondary" style={{ fontSize: 12 }}>—</Text></div>
                <div className="ext-lbl">Bank Name</div>
                <div className="ext-val"><Text type="secondary" style={{ fontSize: 12 }}>—</Text></div>
              </div>

              <div className="ext-row">
                <div className="ext-lbl">IBAN</div>
                <div className="ext-val"><Text type="secondary" style={{ fontSize: 12 }}>—</Text></div>
                <div className="ext-lbl"></div>
                <div className="ext-val"></div>
              </div>
            </div>
          )}

          {/* ══════════ SECTION 4: Transaction Lines ══════════ */}
          <div>
            <div className="ext-lines-hdr">
              <span>Transaction Lines</span>
              <Space>
                <Text type="secondary" style={{ fontSize: 12 }}>{extTxnLines.length} line(s)</Text>
                <Divider type="vertical" />
                <Text strong style={{ fontSize: 13, color: REDWOOD.primary }}>
                  {fmtAmount(extTxnLines.reduce((s, l) => s + (l.amount ?? 0), 0), form.getFieldValue('currencyCode'))}
                </Text>
              </Space>
            </div>
            <Table
              size="small"
              dataSource={extTxnLines}
              rowKey="key"
              pagination={false}
              scroll={{ x: 1200 }}
              rowClassName={(_, idx) => idx % 2 === 1 ? 'alt-row' : ''}
              columns={[
                {
                  title: <span style={{ fontSize: 11, color: REDWOOD.neutral600 }}>#</span>,
                  width: 36,
                  render: (_: any, _r: any, idx: number) => (
                    <span style={{ fontSize: 12, color: REDWOOD.neutral600, fontWeight: 600 }}>{idx + 1}</span>
                  ),
                },
                {
                  title: <span style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Distribution Set <span style={{ color: '#ff4d4f' }}>*</span></span>,
                  width: 230,
                  render: (_: any, _record: ExtTxnLine, idx: number) => (
                    <Space.Compact style={{ width: '100%' }}>
                      <AutoComplete
                        size="small"
                        value={lineDistSets[idx] || ''}
                        placeholder="Search distribution set…"
                        disabled={isEdit || !bankSelected || saved}
                        style={{ width: '100%' }}
                        options={distCombinations
                          .filter(d => {
                            const q = (lineDistSets[idx] || '').toLowerCase();
                            if (!q) return true;
                            return d.combinationName.toLowerCase().includes(q)
                              || (d.description || '').toLowerCase().includes(q)
                              || (d.glAccountDesc || '').toLowerCase().includes(q);
                          })
                          .map(d => ({
                            value: d.combinationName,
                            label: (
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                <span style={{ fontSize: 11, fontWeight: 600 }}>{d.combinationName}</span>
                                <span style={{ fontSize: 10, color: '#999', fontFamily: 'monospace' }}>{d.glAccountDesc || ''}</span>
                              </div>
                            ),
                            combination: d,
                          }))}
                        onChange={v => setLineDistSets(prev => ({ ...prev, [idx]: v }))}
                        onSelect={(_v, opt) => {
                          const d = (opt as { combination: DistCombination }).combination;
                          setLineDistSets(prev => ({ ...prev, [idx]: d.combinationName }));
                          if (d.glAccountDesc) {
                            const acct = applyCompanySegment(d.glAccountDesc);
                            updateExtLine(idx, 'offsetAccount', acct);
                            validateAccountCode(acct).then(r => {
                              const seg4 = Object.values(r.segmentDetails)[3];
                              updateExtLine(idx, 'offsetDesc', (seg4 as any)?.description || '');
                            }).catch(() => { updateExtLine(idx, 'offsetDesc', ''); });
                          }
                        }}
                        filterOption={false}
                      >
                        <Input size="small" variant="borderless" />
                      </AutoComplete>
                    </Space.Compact>
                  ),
                },
                {
                  title: <span style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Offset Account <span style={{ color: '#ff4d4f' }}>*</span></span>,
                  width: 230,
                  render: (_: any, record: ExtTxnLine, idx: number) => (
                    <Space.Compact style={{ width: '100%' }}>
                      <div style={{ flex: 1, fontFamily: 'monospace', fontSize: 10, color: REDWOOD.info, display: 'flex', alignItems: 'center', paddingLeft: 6, overflow: 'hidden' }}>
                        {record.offsetAccount || <span style={{ color: REDWOOD.neutral300, fontFamily: 'sans-serif', fontSize: 11 }}>—</span>}
                      </div>
                      <Button size="small" icon={<SearchOutlined />}
                        disabled={isEdit || !bankSelected || saved}
                        onClick={() => { setLineCoaIdx(idx); setLineCoaInitial(record.offsetAccount || ''); setLineCoaOpen(true); }} />
                    </Space.Compact>
                  ),
                },
                {
                  title: <span style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Account Desc</span>,
                  width: 160,
                  render: (_: any, record: ExtTxnLine) => (
                    <span style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{record.offsetDesc || '—'}</span>
                  ),
                },
                {
                  title: <span style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Description</span>,
                  width: 180,
                  render: (_: any, record: ExtTxnLine, idx: number) => (
                    <Input
                      size="small" value={record.description}
                      disabled={isEdit || !bankSelected || saved}
                      placeholder="Optional"
                      onChange={(e) => updateExtLine(idx, 'description', e.target.value)}
                    />
                  ),
                },
                {
                  title: <span style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Amount ({watchedCurrency || 'CCY'}) <span style={{ color: '#ff4d4f' }}>*</span></span>,
                  width: 140,
                  align: 'right' as const,
                  render: (_: any, record: ExtTxnLine, idx: number) => (
                    <InputNumber
                      size="small" style={{ width: '100%' }} precision={2}
                      value={record.amount}
                      disabled={isEdit || !bankSelected || saved}
                      placeholder={txnDirection === 'DR' ? '+ve' : '-ve'}
                      onChange={(v) => {
                        if (v === null || v === undefined) { updateExtLine(idx, 'amount', v); return; }
                        const signed = txnDirection === 'DR' ? Math.abs(Number(v)) : -Math.abs(Number(v));
                        updateExtLine(idx, 'amount', signed);
                      }}
                    />
                  ),
                },
                ...(isForeignCurrency ? [{
                  title: <span style={{ fontSize: 11, color: REDWOOD.neutral600 }}>AED Equiv.</span>,
                  width: 100,
                  align: 'right' as const,
                  render: (_: any, record: ExtTxnLine) => {
                    const rate = form.getFieldValue('bankConversionRate');
                    if (!record.amount || !rate) return <span style={{ fontSize: 11, color: REDWOOD.neutral300 }}>—</span>;
                    const aed = Math.abs(record.amount) * Number(rate);
                    return (
                      <span style={{ fontSize: 12, fontFamily: 'monospace', color: REDWOOD.neutral600 }}>
                        {aed.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    );
                  },
                }] : []),
                ...(!isEdit && !saved ? [{
                  title: '',
                  width: 36,
                  render: (_: any, record: ExtTxnLine) => (
                    <Tooltip title="Remove line">
                      <Button size="small" type="text" danger icon={<CloseOutlined />}
                        disabled={extTxnLines.length === 1}
                        onClick={() => setExtTxnLines(prev => prev.filter(l => l.key !== record.key))} />
                    </Tooltip>
                  ),
                }] : []),
              ]}
            />
            {!isEdit && !saved && !isAdhocPayment && (
              <div style={{ padding: '8px 16px', borderTop: '1px solid #f0f0f0' }}>
                <Button size="small" type="dashed" icon={<PlusOutlined />}
                  disabled={!bankSelected}
                  onClick={() => setExtTxnLines(prev => [
                    ...prev,
                    { key: Date.now(), amount: undefined, description: '', offsetAccount: '', offsetDesc: '' },
                  ])}
                >
                  Add Line
                </Button>
              </div>
            )}
          </div>

          {/* ══════════ SECTION 5: Attachments ══════════ */}
          <div className="ext-attach">
            <div className="ext-attach-title">
              <PaperClipOutlined style={{ color: REDWOOD.neutral600 }} /> Attachments
            </div>
            <Upload
              fileList={attachments.map(a => ({ uid: a.uid, name: a.name, status: a.status, size: a.fileSize, type: a.fileType, url: ' ' }))}
              beforeUpload={(file) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                  const base64 = (e.target?.result as string)?.split(',')[1] || '';
                  setAttachments(prev => [...prev, { uid: `new-${Date.now()}`, name: file.name, fileType: file.type, fileSize: file.size, content: base64, rawFile: file, status: 'done' }]);
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
              onPreview={handlePreviewAttachment}
              onDownload={handleDownloadAttachment}
              showUploadList={{ showPreviewIcon: true, showDownloadIcon: true, showRemoveIcon: true }}
              multiple
              disabled={!isEdit && (!bankSelected || saved)}
            >
              <Button icon={<UploadOutlined />} disabled={!isEdit && (!bankSelected || saved)}>Attach Files</Button>
            </Upload>
            {previewLoading && <Spin size="small" style={{ marginTop: 8 }} />}
            {attachments.length === 0 && (
              <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>No attachments</Text>
            )}
          </div>

        </div>
      </Form>

      {/* ── Create Payee Modal ── */}
      <Modal
        title="Create New Payee"
        open={createPayeeVisible}
        onCancel={() => setCreatePayeeVisible(false)}
        confirmLoading={createPayeeSaving}
        onOk={async () => {
          try {
            const vals = await createPayeeForm.validateFields();
            setCreatePayeeSaving(true);
            const res = await fetch(`${APEX_BASE}/cash/payees`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({ payeeName: vals.payeeName, taxRegistrationNumber: vals.taxRegistrationNumber || null, description: vals.description || null, active: 'Y' }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
            const newId = data.payee_id ?? data.payeeId ?? data.id;
            const newName = vals.payeeName;
            const newOption: PayeeOption = { label: newName, value: newId, payeeName: newName };
            onPayeeCreated(newOption);
            form.setFieldsValue({ payeeId: newId, payeeName: newName });
            setCreatePayeeVisible(false);
            message.success(`Payee "${newName}" created`);
          } catch (err: any) {
            if (err?.errorFields) return;
            message.error(`Failed to create payee: ${err?.message ?? err}`);
          } finally { setCreatePayeeSaving(false); }
        }}
        okText="Create Payee"
        width={480}
      >
        <Form form={createPayeeForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item label="Payee Name" name="payeeName" rules={[{ required: true, message: 'Payee name is required' }]}>
            <Input placeholder="Enter payee name" />
          </Form.Item>
          <Form.Item label="Tax Registration Number" name="taxRegistrationNumber">
            <Input placeholder="Optional" />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea rows={3} placeholder="Optional" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Sticky footer ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: REDWOOD.surface, borderTop: `1px solid ${REDWOOD.neutral200}`,
        padding: '12px 28px', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', zIndex: 100, boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
      }}>
        <Space size={8}>
          {!isEdit && !saved && (
            <Button icon={<ApiOutlined />} onClick={handleApiOpen}
              style={{ color: REDWOOD.neutral600, borderColor: REDWOOD.neutral300 }}>
              API Inspector
            </Button>
          )}
          {(saved || isEdit || bankSelected) && (
            <Button icon={<PrinterOutlined />} onClick={handlePrintPdf}>
              Print PDF
            </Button>
          )}
          {saved && (
            <Space size={4}>
              <LockOutlined style={{ color: REDWOOD.success }} />
              <span style={{ fontSize: 13, color: REDWOOD.success, fontWeight: 600 }}>Saved &amp; Locked</span>
            </Space>
          )}
        </Space>
        <Space size={8}>
          {isEdit && (
            <Button
              size="large"
              icon={<PaperClipOutlined />}
              loading={attSaving}
              onClick={handleSaveAttachments}
            >
              Save Attachments
            </Button>
          )}
          {(saved || (isEdit && !isLocked)) && onCreateAccounting && (
            <Button
              size="large"
              icon={<AccountBookOutlined />}
              style={{ color: REDWOOD.info, borderColor: REDWOOD.info }}
              onClick={() => {
                const values = form.getFieldsValue();
                const ids = savedExtIds.length > 0 ? savedExtIds : (savedExtId ? [savedExtId] : (initialValues?.externalTransactionId ? [initialValues.externalTransactionId] : []));
                const records: ExternalTxnRecord[] = ids.map((extId, i) => ({
                  externalTransactionId: extId,
                  transactionId:         initialValues?.transactionId ?? 0,
                  transactionDate:       values.transactionDate?.format('YYYY-MM-DD') ?? '',
                  valueDate:             values.valueDate?.format('YYYY-MM-DD') ?? '',
                  clearedDate:           '',
                  amount:                extTxnLines[i]?.amount ?? 0,
                  currencyCode:          values.currencyCode ?? '',
                  description:           extTxnLines[i]?.description ?? '',
                  referenceText:         values.referenceText ?? '',
                  source:                'ORA_MAN',
                  status:                initialValues?.status ?? 'UNR',
                  transactionType:       values.transactionType ?? '',
                  accountingFlag:        initialValues?.accountingFlag ?? '',
                  bankAccountName:       values.bankAccountName ?? '',
                  businessUnitName:      values.businessUnitName ?? '',
                  legalEntityName:       initialValues?.legalEntityName ?? '',
                  assetAccountCombination:  values.assetAccountCombination ?? '',
                  offsetAccountCombination: extTxnLines[i]?.offsetAccount ?? '',
                  bankConversionRate:    values.bankConversionRate ?? 0,
                  bankConversionRateType: values.bankConversionRateType ?? '',
                  transferId:            0,
                  checkNumber:           '',
                  reconReference:        '',
                  createdBy:             'ERP_USER',
                  creationDate:          new Date().toISOString(),
                  lastUpdateDate:        new Date().toISOString(),
                  syncDate:              '',
                  transactionDirection:  values.transactionDirection ?? txnDirection,
                  paymentMethod:         values.paymentMethod,
                  paymentDocument:       values.paymentDocument,
                  paperDocumentNumber:   values.paperDocumentNumber,
                  payeeName:             values.payeeName,
                  payeeId:               values.payeeId,
                }));
                onCreateAccounting(records);
              }}
            >
              Create Accounting
            </Button>
          )}
          {(saved || (isEdit && !isLocked)) && (
            <Popconfirm title="Delete this transaction?" description="This action cannot be undone."
              onConfirm={handleDelete} okText="Delete" okButtonProps={{ danger: true }}>
              <Button size="large" danger loading={deleting} icon={<DeleteOutlined />} style={{ minWidth: 110 }}>
                Delete
              </Button>
            </Popconfirm>
          )}
          {!isEdit && (
            <Button size="large"
              onClick={() => {
                form.resetFields();
                setSelectedBu(undefined);
                setSelectedBank(undefined);
                setSaved(false);
                setSavedExtId(null);
                setSavedExtIds([]);
                setExtTxnLines([{ key: 0, amount: undefined, description: '', offsetAccount: '', offsetDesc: '' }]);
                setAttachments([]);
                setTimeout(() => {
                  const sel = document.querySelector('.ext-txn-bu-select .ant-select-selector');
                  if (sel) (sel as HTMLElement).click();
                }, 100);
              }}
              style={{ minWidth: 110 }}
            >
              Clear Data
            </Button>
          )}
          <Button size="large" onClick={onCancel} style={{ minWidth: 100 }}>
            {isEdit || saved ? 'Close' : 'Cancel'}
          </Button>
          {!isEdit && !saved && (
            <Tooltip title={selectedBu && !derivedCompany ? 'No company code configured for this Business Unit. Cannot save.' : undefined}>
              <Button size="large" type="primary" loading={saving}
                disabled={!!(selectedBu && !derivedCompany)}
                onClick={handleSubmit} icon={<PlusOutlined />}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary, minWidth: 180 }}
              >
                {extTxnLines.length > 1
                  ? `Save ${extTxnLines.length} Transaction${extTxnLines.length !== 1 ? 's' : ''}`
                  : 'Save'}
              </Button>
            </Tooltip>
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
        lockedFirstSegment={derivedCompany || undefined}
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
        lockedFirstSegment={derivedCompany || undefined}
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

      {/* ── PDF Preview Modal ── */}
      <Modal
        open={pdfVisible}
        onCancel={() => { setPdfVisible(false); setPdfUrl(null); }}
        title={<Space><PrinterOutlined style={{ color: REDWOOD.primary }} /><span>External Transaction — PDF Preview</span></Space>}
        width="85vw"
        style={{ top: 20 }}
        footer={
          <Space>
            <Button onClick={() => { setPdfVisible(false); setPdfUrl(null); }}>Close</Button>
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              onClick={() => {
                if (pdfUrl) {
                  const a = document.createElement('a');
                  a.href = pdfUrl;
                  a.download = `external-transaction${savedExtId ? `-${savedExtId}` : ''}.pdf`;
                  a.click();
                }
              }}
            >
              Download PDF
            </Button>
          </Space>
        }
        destroyOnClose
      >
        {pdfUrl && (
          <iframe src={pdfUrl} style={{ width: '100%', height: '75vh', border: 'none' }} title="PDF Preview" />
        )}
      </Modal>

      {/* ── Attachment Preview Modal ──────────────────────────────────── */}
      <Modal
        title={<Space><PaperClipOutlined style={{ color: REDWOOD.info }} /><span>{previewAtt?.name}</span></Space>}
        open={!!previewAtt}
        onCancel={() => { if (previewAtt?.blobUrl) URL.revokeObjectURL(previewAtt.blobUrl); setPreviewAtt(null); }}
        footer={[
          <Button key="download" icon={<DownloadOutlined />} type="primary"
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
          <Button key="close" onClick={() => { if (previewAtt?.blobUrl) URL.revokeObjectURL(previewAtt.blobUrl); setPreviewAtt(null); }}>Close</Button>,
        ]}
        width={860}
        styles={{ body: { padding: 0, minHeight: 200 } }}
      >
        {previewAtt && (() => {
          if (previewAtt.fileType?.startsWith('image/')) {
            return (
              <div style={{ textAlign: 'center', padding: 16 }}>
                <img src={previewAtt.blobUrl} alt={previewAtt.name} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
              </div>
            );
          }
          if (previewAtt.fileType?.includes('pdf')) {
            return <iframe src={previewAtt.blobUrl} style={{ width: '100%', height: '70vh', border: 'none' }} title={previewAtt.name} />;
          }
          return (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <PaperClipOutlined style={{ fontSize: 48, color: REDWOOD.neutral600, marginBottom: 12 }} />
              <div><Text type="secondary">Preview not available for this file type ({previewAtt.fileType || 'unknown'}).</Text></div>
              <Button
                icon={<DownloadOutlined />}
                style={{ marginTop: 16 }}
                onClick={() => {
                  if (!previewAtt) return;
                  const a = document.createElement('a');
                  a.href = previewAtt.blobUrl || `data:${previewAtt.fileType};base64,${previewAtt.content}`;
                  a.download = previewAtt.name;
                  a.click();
                }}
              >
                Download to view
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
const ManageExternalTransactions: React.FC<{ module?: 'ap' | 'cash' }> = ({ module = 'cash' }) => {
  const { user } = useAuth();
  const currentUser = user?.email ?? user?.username ?? 'SYSTEM';
  const { addSessionEntry } = useGlValidation();

  const [transactions, setTransactions]   = useState<ExternalTxnRecord[]>([]);
  const [loading, setLoading]             = useState(false);
  const [hasSearched, setHasSearched]     = useState(false);
  const [allBankAccounts, setAllBankAccounts] = useState<BankAccountOption[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BUOption[]>([]);
  const [bankAccountMap, setBankAccountMap] = useState<Record<string, string>>({});
  const [bankAccountCurrencyMap, setBankAccountCurrencyMap] = useState<Record<string, string>>({});
  const [buLeMap, setBuLeMap]             = useState<Record<string, string>>({});
  const [buCompanyMap, setBuCompanyMap]   = useState<Record<string, string>>({});
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
    ? buBankMap[selectedBU].sort().map(n => ({ label: bankAccountCurrencyMap[n] ? `${n} (${bankAccountCurrencyMap[n]})` : n, value: n }))
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
  const [singleAcctTxnRecords, setSingleAcctTxnRecords] = useState<ExternalTxnRecord[]>([]);

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

  const exportToPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const fmtDt = (v: any) => v ? dayjs(v).format('D-MMM-YYYY') : '—';
    const fmtAmt = (v: any) => v != null ? Number(v).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

    doc.setFillColor(191, 70, 0);
    doc.rect(0, 0, pageW, 16, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('External Transactions', 14, 10);
    doc.setFontSize(9);
    doc.text(`Printed: ${new Date().toLocaleString()}  |  Records: ${transactions.length}`, pageW - 14, 10, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    autoTable(doc, {
      startY: 20,
      head: [['Txn #', 'Bank Account', 'Business Unit', 'Date', 'Currency', 'Amount', 'Reference', 'Type', 'Status', 'Accounted']],
      body: transactions.map(t => [
        t.transactionId ?? '',
        t.bankAccountName ?? '',
        t.businessUnitName ?? '',
        fmtDt(t.transactionDate),
        t.currencyCode ?? '',
        fmtAmt(t.amount),
        t.referenceText ?? '',
        t.transactionType ?? '',
        statusLabel(t.status),
        t.accountingFlag === 'Y' ? 'Posted' : 'No',
      ]),
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [58, 58, 58] },
      alternateRowStyles: { fillColor: [247, 247, 247] },
      columnStyles: {
        0: { cellWidth: 20 },
        3: { cellWidth: 24 },
        4: { cellWidth: 16 },
        5: { halign: 'right', cellWidth: 26 },
        8: { cellWidth: 24 },
        9: { cellWidth: 18 },
      },
      margin: { left: 14, right: 14 },
    });

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150);
      doc.text(`Page ${i} of ${pageCount}`, pageW / 2, 205, { align: 'center' });
      doc.text('Generated by ReactERP', 14, 205);
      doc.setTextColor(0);
    }

    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  // ── Load LOVs ─────────────────────────────────────────────────────────────
  const loadLovs = useCallback(async () => {
    const buLeMapping: Record<string, string> = {};
    const buCompanyMapping: Record<string, string> = {};
    const buSet = new Set<string>();

    // Step 1: BUs from gl/businessunits
    try {
      const buRes = await fetch(`${APEX_BASE}/gl/businessunits`, { headers: { Accept: 'application/json' } });
      const buData = buRes.ok ? await buRes.json() : null;
      if (buData?.items) {
        (buData.items as any[]).forEach(i => {
          const buName = i.business_unit_name || i.businessUnitName || '';
          const leName = i.legal_entity_name  || i.legalEntityName  || '';
          const company = i.company || '';
          if (buName) { buSet.add(buName); buLeMapping[buName] = leName; buCompanyMapping[buName] = company; }
        });
      }
    } catch { /* silent */ }

    setBuLeMap({ ...buLeMapping });
    setBuCompanyMap({ ...buCompanyMapping });
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
        // Map: legal entity name → list of bank account names
        const leBankMap: Record<string, string[]> = {};
        (baData.items as any[]).forEach((i: any) => {
          const name = i.bank_account_name || '';
          if (!name) return;
          allAccts.push(name);
          if (i.cash_account_combination) acctMap[name] = i.cash_account_combination;
          if (i.currency_code)            ccyMap[name]  = i.currency_code;
          const le = (i.legal_entity_name || '').trim();
          if (le) {
            if (!leBankMap[le]) leBankMap[le] = [];
            leBankMap[le].push(name);
          }
        });
        setAllBankAccounts(allAccts.sort().map(n => ({ label: ccyMap[n] ? `${n} (${ccyMap[n]})` : n, value: n })));
        setBankAccountMap(acctMap);
        setBankAccountCurrencyMap(ccyMap);

        // Build BU → bank accounts from bank master via legal entity
        const buBanksFromMaster: Record<string, string[]> = {};
        Object.entries(buLeMapping).forEach(([buName, leName]) => {
          const banks = leBankMap[leName] || [];
          if (banks.length > 0) buBanksFromMaster[buName] = banks;
        });
        if (Object.keys(buBanksFromMaster).length > 0) {
          setBuBankMap(buBanksFromMaster);
        }
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
        // Build LE → bank map from transaction data as well
        const leBankMapFromTxn: Record<string, Set<string>> = {};

        items.forEach(i => {
          if (i.bankAccountName) {
            if (i.businessUnitName) {
              if (!buBanks[i.businessUnitName]) buBanks[i.businessUnitName] = new Set();
              buBanks[i.businessUnitName].add(i.bankAccountName);
              buSet.add(i.businessUnitName);
            }
            if (i.legalEntityName) {
              if (!leBankMapFromTxn[i.legalEntityName]) leBankMapFromTxn[i.legalEntityName] = new Set();
              leBankMapFromTxn[i.legalEntityName].add(i.bankAccountName);
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
        // Only fill buBankMap from transaction history for BUs not covered by bank master data
        // Build BU→bank via LE chain from transaction data (most reliable source)
        const buBanksViaLe: Record<string, string[]> = {};
        Object.entries(buLeMapping).forEach(([buName, leName]) => {
          const leSet = leBankMapFromTxn[leName];
          if (leSet?.size) buBanksViaLe[buName] = [...leSet];
        });

        setBuBankMap(prev => {
          const merged = { ...prev };
          // First layer: history-based BU → bank (direct)
          Object.entries(buBanks).forEach(([bu, set]) => {
            if (!merged[bu]) merged[bu] = [...set];
          });
          // Second layer: LE-chain derived (overrides if present, more accurate)
          Object.entries(buBanksViaLe).forEach(([bu, banks]) => {
            const existing = new Set(merged[bu] || []);
            banks.forEach(b => existing.add(b));
            merged[bu] = [...existing].sort();
          });
          return merged;
        });
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

        // Validate company codes match between DR and CR
        const drCompany = (drAccount || '').split('-')[0]?.trim();
        const crCompany = (crAccount || '').split('-')[0]?.trim();
        if (!drCompany || !crCompany) {
          updateRow(row.extTxnId, { status: 'error', message: `Company code not found for Business Unit '${txn.businessUnitName}'. Cannot create accounting without a valid company code.` });
          continue;
        }
        if (drCompany !== crCompany) {
          updateRow(row.extTxnId, { status: 'error', message: `Company code mismatch: DR account starts with '${drCompany}' but CR account starts with '${crCompany}'. Both must use the same company code.` });
          continue;
        }

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
          description:             txn.description || undefined,
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

        // GL pre-flight validation + session logging
        const validationPayload: GlJournalPayload = {
          batch: { batchName, ledgerId: ledger.ledgerId, ledgerName: ledger.ledgerName, accountingPeriod: row.periodName, controlTotal: absAmount, runningTotalDr: absAmount, runningTotalCr: absAmount },
          header: { periodName: row.periodName, currencyCode: txn.currencyCode || 'AED', currencyConversionDate: row.txnDate, journalName: `BANK-EXT-${txn.externalTransactionId}` },
          lines: glPayload.lines.map((l: any) => ({ enteredDr: l.enteredDr, enteredCr: l.enteredCr, accountCombination: l.accountCombination, description: l.description, reference1: l.reference1 })),
        };
        const validation = validateGlPayload(validationPayload, { module: 'CASH', referenceNo: txn.referenceText || String(txn.externalTransactionId) });
        const logId = await persistValidationLog('CASH', txn.referenceText || String(txn.externalTransactionId), batchName, validation.valid ? 'PASSED' : 'FAILED', validation.errors, validationPayload, currentUser);
        addSessionEntry({
          logId: logId ?? Date.now(),
          module: 'CASH',
          referenceNo: txn.referenceText || String(txn.externalTransactionId),
          batchName,
          result: validation.valid ? 'PASSED' : 'FAILED',
          errorCount: validation.errors.filter(e => e.severity === 'ERROR').length,
          warningCount: validation.errors.filter(e => e.severity === 'WARNING').length,
          errorCategories: [...new Set(validation.errors.map(e => e.category))].join(',') || null,
          errorSummary: validation.errors.filter(e => e.severity === 'ERROR').map(e => `[${e.category}] ${e.message}`).join(' | ') || null,
          errorDetail: validation.errors,
          createdBy: currentUser,
          creationDate: new Date().toISOString(),
        });
        if (!validation.valid) {
          updateRow(row.extTxnId, { status: 'error', message: `GL validation failed: ${validation.errors.filter(e => e.severity === 'ERROR').map(e => e.category).join(', ')}` });
          continue;
        }

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
  const openSingleAcctModal = (txnOrTxns: ExternalTxnRecord | ExternalTxnRecord[]) => {
    const txnArray = Array.isArray(txnOrTxns) ? txnOrTxns : [txnOrTxns];
    const missing = txnArray.filter(t => !t.assetAccountCombination || !t.offsetAccountCombination);
    if (missing.length > 0) {
      message.warning('Some transactions are missing cash/offset accounts — cannot create accounting.');
      return;
    }
    const rows: BankAcctProgressRow[] = txnArray.map(txn => {
      const date = txn.transactionDate || txn.valueDate || dayjs().format('YYYY-MM-DD');
      const absAmount = Math.abs(txn.amount ?? 0);
      const direction = txn.transactionDirection ?? ((txn.amount ?? 0) >= 0 ? 'DR' : 'CR');
      const drAccount = direction === 'DR' ? txn.assetAccountCombination : txn.offsetAccountCombination;
      const crAccount = direction === 'DR' ? txn.offsetAccountCombination : txn.assetAccountCombination;
      return {
        extTxnId:   txn.externalTransactionId,
        txnDate:    date,
        periodName: derivePeriodName(new Date(date)),
        amount:     absAmount,
        currency:   txn.currencyCode || 'AED',
        drAccount,
        crAccount,
        bu:         txn.businessUnitName || '',
        status:     'pending' as const,
      };
    });
    setSingleAcctProgress(rows);
    setSingleAcctDone(false);
    setSingleAcctTxnRecords(txnArray);
    setSingleAcctModalOpen(true);
  };

  const runSingleAccounting = async () => {
    setSingleAcctRunning(true);
    const updateRow = (extTxnId: number, partial: Partial<BankAcctProgressRow>) =>
      setSingleAcctProgress(prev => prev.map(r => r.extTxnId === extTxnId ? { ...r, ...partial } : r));

    for (const row of singleAcctProgress) {
      if (row.status === 'skipped' || row.status === 'error') continue;
      updateRow(row.extTxnId, { status: 'running' });
      const txn = transactions.find(t => t.externalTransactionId === row.extTxnId)
        ?? singleAcctTxnRecords.find(t => t.externalTransactionId === row.extTxnId)
        ?? null;
      if (!txn) { updateRow(row.extTxnId, { status: 'error', message: 'Transaction not found' }); continue; }
      try {
        const ledger = await fetchLedgerByBusinessUnit(txn.businessUnitName);
        if (!ledger) { updateRow(row.extTxnId, { status: 'error', message: 'Could not resolve ledger for BU' }); continue; }
        const direction = txn.transactionDirection ?? ((txn.amount ?? 0) >= 0 ? 'DR' : 'CR');
        const absAmount = Math.abs(txn.amount ?? 0);
        const drAccount = direction === 'DR' ? txn.assetAccountCombination : txn.offsetAccountCombination;
        const crAccount = direction === 'DR' ? txn.offsetAccountCombination : txn.assetAccountCombination;

        // Validate company codes match between DR and CR
        const drCompany = (drAccount || '').split('-')[0]?.trim();
        const crCompany = (crAccount || '').split('-')[0]?.trim();
        if (!drCompany || !crCompany) {
          updateRow(row.extTxnId, { status: 'error', message: `Company code not found for Business Unit '${txn.businessUnitName}'. Cannot create accounting without a valid company code.` });
          continue;
        }
        if (drCompany !== crCompany) {
          updateRow(row.extTxnId, { status: 'error', message: `Company code mismatch: DR account starts with '${drCompany}' but CR account starts with '${crCompany}'. Both must use the same company code.` });
          continue;
        }

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
          description:             txn.description || undefined,
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
        // GL pre-flight validation + session logging
        const validationPayload: GlJournalPayload = {
          batch: { batchName, ledgerId: ledger.ledgerId, ledgerName: ledger.ledgerName, accountingPeriod: row.periodName, controlTotal: absAmount, runningTotalDr: absAmount, runningTotalCr: absAmount },
          header: { periodName: row.periodName, currencyCode: txn.currencyCode || 'AED', currencyConversionDate: row.txnDate, journalName: `BANK-EXT-${txn.externalTransactionId}` },
          lines: glPayload.lines.map((l: any) => ({ enteredDr: l.enteredDr, enteredCr: l.enteredCr, accountCombination: l.accountCombination, description: l.description, reference1: l.reference1 })),
        };
        const validation = validateGlPayload(validationPayload, { module: 'CASH', referenceNo: txn.referenceText || String(txn.externalTransactionId) });
        const logId = await persistValidationLog('CASH', txn.referenceText || String(txn.externalTransactionId), batchName, validation.valid ? 'PASSED' : 'FAILED', validation.errors, validationPayload, currentUser);
        addSessionEntry({
          logId: logId ?? Date.now(),
          module: 'CASH',
          referenceNo: txn.referenceText || String(txn.externalTransactionId),
          batchName,
          result: validation.valid ? 'PASSED' : 'FAILED',
          errorCount: validation.errors.filter(e => e.severity === 'ERROR').length,
          warningCount: validation.errors.filter(e => e.severity === 'WARNING').length,
          errorCategories: [...new Set(validation.errors.map(e => e.category))].join(',') || null,
          errorSummary: validation.errors.filter(e => e.severity === 'ERROR').map(e => `[${e.category}] ${e.message}`).join(' | ') || null,
          errorDetail: validation.errors,
          createdBy: currentUser,
          creationDate: new Date().toISOString(),
        });
        if (!validation.valid) {
          updateRow(row.extTxnId, { status: 'error', message: `GL validation failed: ${validation.errors.filter(e => e.severity === 'ERROR').map(e => e.category).join(', ')}` });
          continue;
        }
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
    const label = `Txn #${record.transactionId ?? record.externalTransactionId}`;
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
    const fmt = (v: any) => v != null && v !== '' ? String(v) : '—';
    const fmtNum = (v: any) => v != null ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '—';
    const fmtDt = (v: any) => {
      if (!v) return '—';
      try { return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
      catch { return String(v); }
    };

    // Header bar
    doc.setFillColor(191, 70, 0);
    doc.rect(0, 0, pageW, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('External Transaction', 14, 11);
    doc.setFontSize(9);
    doc.text(`Printed: ${new Date().toLocaleString()}`, pageW - 14, 11, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    let y = 26;

    // Transaction ID
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(191, 70, 0);
    doc.text(`Transaction ID: ${r.transactionId || r.externalTransactionId}`, 14, y);
    doc.setTextColor(0, 0, 0);
    y += 8;

    // Section 1: Organisation & Bank
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Organisation & Bank', 14, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      body: [
        ['Business Unit', fmt(r.businessUnitName), 'Legal Entity', fmt(r.legalEntityName)],
        ['Bank Account', fmt(r.bankAccountName), 'Currency', fmt(r.currencyCode)],
        ['Cash / Asset Account', fmt(r.assetAccountCombination), 'Direction', r.transactionDirection === 'DR' ? 'Money In (DR)' : 'Money Out (CR)'],
      ],
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 }, 2: { fontStyle: 'bold', cellWidth: 42 } },
      alternateRowStyles: { fillColor: [247, 247, 247] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    // Section 2: Transaction Details
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Transaction Details', 14, y);
    y += 2;
    const inverseRate = r.bankConversionRate && r.bankConversionRate > 0
      ? Math.round((1 / r.bankConversionRate) * 1000000) / 1000000
      : null;
    autoTable(doc, {
      startY: y,
      body: [
        ['Transaction Date', fmtDt(r.transactionDate), 'Value Date', fmtDt(r.valueDate)],
        ['Transaction Type', fmt(r.transactionType), 'Reference', fmt(r.referenceText)],
        ['Payment Method', fmt(r.paymentMethod), 'Payment Document', fmt(r.paymentDocument)],
        ['Paper Doc #', fmt(r.paperDocumentNumber), 'Conv. Rate Type', fmt(r.bankConversionRateType)],
        [`Conv. Rate (${r.currencyCode || 'FCY'}→AED)`, fmtNum(r.bankConversionRate),
         `Inverse Rate (AED→${r.currencyCode || 'FCY'})`, fmtNum(inverseRate)],
      ],
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 }, 2: { fontStyle: 'bold', cellWidth: 42 } },
      alternateRowStyles: { fillColor: [247, 247, 247] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    // Section 3: Payee Details (if adhoc)
    if (r.transactionType === 'Adhoc Payment' && r.payeeName) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Payee Details', 14, y);
      y += 2;
      autoTable(doc, {
        startY: y,
        body: [
          ['Payee Name', fmt(r.payeeName), 'Check #', fmt(r.checkNumber)],
        ],
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 }, 2: { fontStyle: 'bold', cellWidth: 42 } },
        alternateRowStyles: { fillColor: [247, 247, 247] },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // Section 4: Transaction Lines
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Transaction Lines', 14, y);
    y += 2;
    const fmtAmt = (v: number) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    autoTable(doc, {
      startY: y,
      head: [['#', 'Offset Account', 'Description', 'Amount']],
      body: [[1, r.offsetAccountCombination || '—', r.description || '—', fmtAmt(Math.abs(r.amount))]],
      foot: [['', '', 'Total', fmtAmt(Math.abs(r.amount))]],
      styles: { fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: [58, 58, 58] },
      footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [247, 247, 247] },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 55 }, 3: { halign: 'right', cellWidth: 28 } },
      margin: { left: 14, right: 14 },
    });

    // Footer
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

    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    setVoucherPdfUrl(url);
    setVoucherModalOpen(true);
  };

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns: ColumnsType<ExternalTxnRecord> = [
    {
      title: 'Txn Number', dataIndex: 'transactionId', width: 105,
      render: (v, r) => (
        <Button type="link" size="small" style={{ padding: 0, color: REDWOOD.info }} onClick={() => openEditTab(r)}>
          {v}
        </Button>
      ),
    },
    {
      title: 'Bank Account', dataIndex: 'bankAccountName', ellipsis: true, width: 220,
      render: v => <Tooltip title={v}><Text style={{ fontSize: 12 }}>{v || '—'}</Text></Tooltip>,
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
        <Form form={searchForm} layout="horizontal" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }}
          initialValues={{ dateFrom: dayjs(), dateTo: dayjs() }}>
          <Row gutter={[16, 0]}>

            <Col xs={24} md={12}>
              <Form.Item label="Business Unit" name="businessUnit" style={{ marginBottom: 4 }}>
                <Select showSearch placeholder="Select Business Unit" optionFilterProp="label" options={businessUnits}
                  allowClear style={{ width: '100%' }} onChange={handleBUChange} onClear={() => handleBUChange('')} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Legal Entity" style={{ marginBottom: 4 }}>
                <Input value={derivedLE || (selectedBU ? '—' : '')} readOnly placeholder="Auto-derived from BU"
                  style={{ background: '#f5f5f5', color: derivedLE ? REDWOOD.info : REDWOOD.neutral600, cursor: 'default' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Bank Account" name="bankAccount" style={{ marginBottom: 4 }}>
                <Select showSearch placeholder={selectedBU ? `Banks for ${selectedBU}` : 'Select account'}
                  optionFilterProp="label" options={filteredBankAccounts} allowClear style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Date From" name="dateFrom" style={{ marginBottom: 4 }}>
                <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Status" name="status" style={{ marginBottom: 4 }}>
                <Select placeholder="Select status" allowClear>
                  <Option value="REC">Reconciled</Option>
                  <Option value="UNR">Unreconciled</Option>
                  <Option value="CLR">Cleared</Option>
                  <Option value="CAN">Cancelled</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Date To" name="dateTo" style={{ marginBottom: 4 }}>
                <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Transaction #" name="transactionNumber" style={{ marginBottom: 4 }}>
                <Input placeholder="Transaction number" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Reference" name="reference" style={{ marginBottom: 4 }}>
                <Input placeholder="Reference text" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Transaction Type" name="transactionType" style={{ marginBottom: 4 }}>
                <Select placeholder="Select type" allowClear>
                  <Option value="External Transaction">External Transaction</Option>
                  <Option value="Adhoc Payment">Adhoc Payment</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Currency" name="currencyCode" style={{ marginBottom: 4 }}>
                <Select placeholder="Select currency" allowClear>
                  {['AED','USD','EUR','GBP','SAR','QAR','KWD','BHD','OMR'].map(c => <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Amount From" name="amountFrom" style={{ marginBottom: 4 }}>
                <InputNumber style={{ width: '100%' }} placeholder="Min amount" precision={2} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Amount To" name="amountTo" style={{ marginBottom: 4 }}>
                <InputNumber style={{ width: '100%' }} placeholder="Max amount" precision={2} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Origin" name="source" style={{ marginBottom: 4 }}>
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
          buCompanyMap={buCompanyMap}
          payeeOptions={payeeOptions}
          onPayeeCreated={(newOpt) => setPayeeOptions(prev => [...prev, newOpt].sort((a, b) => a.label.localeCompare(b.label)))}
          onSave={() => { closeTab(t.key); handleSearch(); loadLovs(); }}
          onCancel={() => closeTab(t.key)}
          onCreateAccounting={(txns) => openSingleAcctModal(txns)}
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
                Export Excel
              </Button>
              <Button icon={<FilePdfOutlined />} onClick={exportToPdf} disabled={transactions.length === 0}>
                Export PDF
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
          width={860}
          destroyOnClose
        >
          {viewAcctTxn && (() => {
            const txn = viewAcctTxn;
            const direction = txn.transactionDirection ?? ((txn.amount ?? 0) >= 0 ? 'DR' : 'CR');
            const absAmount = Math.abs(txn.amount ?? 0);
            const exRate    = txn.bankConversionRate ?? 1;
            const acctedAmt = Math.round(absAmount * exRate * 100) / 100;
            const ledgerCcy = 'AED';
            const drLabel = direction === 'DR' ? 'Bank / Asset Account' : 'Offset Account';
            const crLabel = direction === 'DR' ? 'Offset Account' : 'Bank / Asset Account';
            const drAcct  = direction === 'DR' ? txn.assetAccountCombination : txn.offsetAccountCombination;
            const crAcct  = direction === 'DR' ? txn.offsetAccountCombination : txn.assetAccountCombination;
            const tdStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
              padding: '8px 10px', border: `1px solid ${REDWOOD.neutral200}`, ...extra,
            });
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
                    <Col xs={24} md={6}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Direction</Text>
                      <div>
                        <Tag color={direction === 'DR' ? 'blue' : 'green'} style={{ fontSize: 12, fontWeight: 600 }}>
                          {direction === 'DR' ? '▲ DR — Money In' : '▼ CR — Money Out'}
                        </Tag>
                      </div>
                    </Col>
                    <Col xs={24} md={6}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Reference</Text>
                      <div style={{ fontSize: 13 }}>{txn.referenceText || '—'}</div>
                    </Col>
                    <Col xs={12} md={6}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Conversion Rate</Text>
                      <div style={{ fontSize: 13, fontFamily: 'monospace' }}>{exRate} ({txn.bankConversionRateType || 'Corporate'})</div>
                    </Col>
                    <Col xs={12} md={6}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Ledger Currency</Text>
                      <div style={{ fontSize: 13, fontFamily: 'monospace' }}>{ledgerCcy}</div>
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
                      <th style={tdStyle({ textAlign: 'left', width: 44 })}>Dr/Cr</th>
                      <th style={tdStyle({ textAlign: 'left' })}>Account</th>
                      <th style={tdStyle({ textAlign: 'left', width: 130, fontSize: 11 })}>Label</th>
                      <th colSpan={2} style={tdStyle({ textAlign: 'center', width: 220, background: '#e6f4ff', color: REDWOOD.info })}>
                        Entered ({txn.currencyCode || '—'})
                      </th>
                      <th colSpan={2} style={tdStyle({ textAlign: 'center', width: 220, background: '#f6ffed', color: REDWOOD.success })}>
                        Accounted ({ledgerCcy})
                      </th>
                    </tr>
                    <tr style={{ background: REDWOOD.neutral100 }}>
                      <th style={tdStyle()} />
                      <th style={tdStyle()} />
                      <th style={tdStyle()} />
                      <th style={tdStyle({ textAlign: 'right', background: '#e6f4ff', fontSize: 11 })}>DR</th>
                      <th style={tdStyle({ textAlign: 'right', background: '#e6f4ff', fontSize: 11 })}>CR</th>
                      <th style={tdStyle({ textAlign: 'right', background: '#f6ffed', fontSize: 11 })}>DR</th>
                      <th style={tdStyle({ textAlign: 'right', background: '#f6ffed', fontSize: 11 })}>CR</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={tdStyle({ color: REDWOOD.info, fontWeight: 700 })}>DR</td>
                      <td style={tdStyle()}>{drAcct || '—'}</td>
                      <td style={tdStyle({ fontSize: 11, color: REDWOOD.neutral600 })}>{drLabel}</td>
                      <td style={tdStyle({ textAlign: 'right', color: REDWOOD.info, fontWeight: 600 })}>{fmtAmount(absAmount)}</td>
                      <td style={tdStyle({ textAlign: 'right' })}>—</td>
                      <td style={tdStyle({ textAlign: 'right', color: REDWOOD.info, fontWeight: 600 })}>{fmtAmount(acctedAmt)}</td>
                      <td style={tdStyle({ textAlign: 'right' })}>—</td>
                    </tr>
                    <tr style={{ background: REDWOOD.neutral100 }}>
                      <td style={tdStyle({ color: REDWOOD.success, fontWeight: 700 })}>CR</td>
                      <td style={tdStyle()}>{crAcct || '—'}</td>
                      <td style={tdStyle({ fontSize: 11, color: REDWOOD.neutral600 })}>{crLabel}</td>
                      <td style={tdStyle({ textAlign: 'right' })}>—</td>
                      <td style={tdStyle({ textAlign: 'right', color: REDWOOD.success, fontWeight: 600 })}>{fmtAmount(absAmount)}</td>
                      <td style={tdStyle({ textAlign: 'right' })}>—</td>
                      <td style={tdStyle({ textAlign: 'right', color: REDWOOD.success, fontWeight: 600 })}>{fmtAmount(acctedAmt)}</td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ marginTop: 0, display: 'flex', justifyContent: 'flex-end', gap: 24, padding: '6px 12px', background: REDWOOD.neutral100, borderRadius: '0 0 4px 4px', border: `1px solid ${REDWOOD.neutral200}`, borderTop: 'none' }}>
                  <Text style={{ fontSize: 12 }}>Entered DR: <Text strong style={{ color: REDWOOD.info }}>{fmtAmount(absAmount, txn.currencyCode)}</Text></Text>
                  <Text style={{ fontSize: 12 }}>Entered CR: <Text strong style={{ color: REDWOOD.success }}>{fmtAmount(absAmount, txn.currencyCode)}</Text></Text>
                  <Text style={{ fontSize: 12 }}>Accounted DR: <Text strong style={{ color: REDWOOD.info }}>{fmtAmount(acctedAmt, ledgerCcy)}</Text></Text>
                  <Text style={{ fontSize: 12 }}>Accounted CR: <Text strong style={{ color: REDWOOD.success }}>{fmtAmount(acctedAmt, ledgerCcy)}</Text></Text>
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
