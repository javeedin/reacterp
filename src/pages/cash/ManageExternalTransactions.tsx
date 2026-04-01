import React, { useState, useCallback, useEffect } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
  Layout, Breadcrumb, Typography, Card, Table, Button, Form, Input, Select,
  DatePicker, InputNumber, Row, Col, Space, Tag, Tooltip, Tabs, Collapse,
  message, Empty, Divider, Badge, Modal,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, BankOutlined, PlusOutlined, SearchOutlined, ReloadOutlined,
  EditOutlined, CloseOutlined, DollarOutlined, ApiOutlined, FileTextOutlined,
  SwapOutlined, DownloadOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import AccountSelector from '../../components/AccountSelector';

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
}

interface BankAccountOption { label: string; value: string; }
interface BUOption          { label: string; value: string; }

// ── Helpers ──────────────────────────────────────────────────────────────────

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

const SOURCE_LABELS: Record<string, string> = {
  ORA_BAT: 'Bank', ORA_MAN: 'Manual', ORA_STA: 'Statement',
};

// ── Tab management ───────────────────────────────────────────────────────────
let tabCounter = 0;
const newTabKey = () => `tab_${++tabCounter}`;

// ────────────────────────────────────────────────────────────────────────────
// Create / Edit Form
// ────────────────────────────────────────────────────────────────────────────
const ExternalTxnForm: React.FC<{
  initialValues?: Partial<ExternalTxnRecord>;
  bankAccounts: BankAccountOption[];
  businessUnits: BUOption[];
  bankAccountMap: Record<string, string>;   // bankAccountName → assetAccountCombination
  onSave: () => void;
  onCancel: () => void;
}> = ({ initialValues, bankAccounts, businessUnits, bankAccountMap, onSave, onCancel }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [selectedBu, setSelectedBu] = useState<string | undefined>(initialValues?.businessUnitName);
  const [apiModal, setApiModal]           = useState(false);
  const [apiPayload, setApiPayload]       = useState('');
  const [apiPosting, setApiPosting]       = useState(false);
  const [apiResponse, setApiResponse]     = useState<{ status: number; body: string } | null>(null);
  const [cashAcctOpen, setCashAcctOpen]   = useState(false);
  const [offsetAcctOpen, setOffsetAcctOpen] = useState(false);
  const isEdit = !!initialValues?.externalTransactionId;
  const buSelected = !!selectedBu;

  useEffect(() => { setSelectedBu(initialValues?.businessUnitName); }, [initialValues]);

  useEffect(() => {
    if (initialValues) {
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
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ transactionDate: dayjs() });
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
    }],
  });

  const handleSubmit = async () => {
    let values: any;
    try { values = await form.validateFields(); } catch { return; }
    setSaving(true);
    try {
      const res = await fetch(`${APEX_BASE}/cash/externaltransactions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(values)),
      });
      const data = await res.json();
      if (data.status === 'success') {
        message.success(isEdit ? 'Transaction updated.' : 'Transaction created.');
        onSave();
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

  const fs = { marginBottom: 14 };
  const lc = { span: 8 };
  const wc = { span: 16 };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '12px 24px' }}>
      <Text style={{ fontSize: 12, color: REDWOOD.neutral600, display: 'block', marginBottom: 14 }}>
        {isEdit ? 'View External Transaction' : 'Create External Transaction'}
      </Text>

      {isEdit && (
        <div style={{ marginBottom: 12, padding: '6px 12px', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 4 }}>
          <Text style={{ fontSize: 12, color: '#ad6800' }}>This record is read-only. Synced records cannot be edited.</Text>
        </div>
      )}

      <div style={{ marginBottom: 10, padding: '6px 12px', background: REDWOOD.neutral100, borderRadius: 4, display: 'flex', gap: 24 }}>
        {isEdit && <><Text style={{ fontSize: 12 }}>Transaction #: <Text strong>{initialValues?.transactionId ?? '—'}</Text></Text>
        <Text style={{ fontSize: 12 }}>Origin: <Text strong>Manual</Text></Text></>}
        {!isEdit && <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Origin: <Text strong>Manual</Text></Text>}
      </div>

      <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 12, color: REDWOOD.neutral900 }}>
        Transaction Details
      </Text>

      <Form form={form} layout="horizontal" labelCol={lc} wrapperCol={wc}>
        {/* Bank Account first — drives Business Unit auto-fill */}
        <Row gutter={40}>
          <Col xs={24} lg={12}>
            <Form.Item label="Bank Account" name="bankAccountName" rules={[{ required: !isEdit, message: 'Bank Account is required' }]} style={fs}>
              <Select showSearch placeholder="Select bank account" optionFilterProp="label" options={bankAccounts}
                style={{ width: '100%' }} notFoundContent={<Text type="secondary">No accounts loaded</Text>}
                disabled={isEdit}
                onChange={v => {
                  if (!isEdit) {
                    form.setFieldValue('assetAccountCombination', bankAccountMap[v] ?? '');
                  }
                }} />
            </Form.Item>
          </Col>
          <Col xs={24} lg={12}>
            <Form.Item label="Business Unit" name="businessUnitName" rules={[{ required: !isEdit, message: 'Business Unit is required' }]} style={fs}>
              <Select showSearch placeholder="Select business unit" optionFilterProp="label" options={businessUnits}
                style={{ width: '100%' }} onChange={v => setSelectedBu(v)} allowClear onClear={() => setSelectedBu(undefined)}
                disabled={isEdit} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={40}>
          <Col xs={24} lg={12}>
            <Form.Item label="Amount" name="amount" rules={[{ required: !isEdit, message: 'Amount is required' }]} style={fs}>
              <InputNumber style={{ width: '100%' }} precision={2} disabled={isEdit || !buSelected}
                placeholder="Enter amount (negative for debit)" />
            </Form.Item>

            <Form.Item label="Date" name="transactionDate" rules={[{ required: !isEdit, message: 'Date is required' }]} style={fs}>
              <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" disabled={isEdit || !buSelected} />
            </Form.Item>

            <Form.Item label="Reference" name="referenceText" style={fs}>
              <Input placeholder="Reference text" disabled={isEdit || !buSelected} />
            </Form.Item>

            <Form.Item label="Transaction Type" name="transactionType" style={fs}>
              <Select placeholder="Select type" allowClear disabled={isEdit || !buSelected}>
                <Option value="EFT">EFT</Option>
                <Option value="WIRE">WIRE</Option>
                <Option value="CHECK">CHECK</Option>
                <Option value="MISC">MISC</Option>
              </Select>
            </Form.Item>

            <Form.Item label="Description" name="description" style={fs}>
              <Input.TextArea rows={3} placeholder="Enter description" disabled={isEdit || !buSelected} />
            </Form.Item>
          </Col>

          <Col xs={24} lg={12}>
            <Form.Item label="Value Date" name="valueDate" style={fs}>
              <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" disabled={isEdit || !buSelected} />
            </Form.Item>

            <Form.Item label="Currency" name="currencyCode" style={fs}>
              <Select placeholder="Select currency" allowClear disabled={isEdit || !buSelected}>
                {['AED', 'USD', 'EUR', 'GBP', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR'].map(c => (
                  <Option key={c} value={c}>{c}</Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item label="Attachments" style={fs}>
              <Text type="secondary">None</Text>
              <Button size="small" icon={<PlusOutlined />} style={{ marginLeft: 8 }} disabled>Add</Button>
            </Form.Item>
          </Col>
        </Row>

        {/* ── Account Combinations ── */}
        <Divider style={{ fontSize: 12, color: REDWOOD.neutral600, margin: '8px 0 14px' }}>
          Account Coding
        </Divider>

        <Row gutter={40}>
          <Col xs={24} lg={12}>
            <Form.Item label="Cash Account" name="assetAccountCombination" style={fs}>
              <Input.Group compact style={{ display: 'flex' }}>
                <Form.Item name="assetAccountCombination" noStyle>
                  <Input
                    readOnly
                    disabled={isEdit}
                    placeholder={isEdit ? '—' : 'Auto-populated from bank account'}
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                  />
                </Form.Item>
                {!isEdit && (
                  <Button
                    icon={<SearchOutlined />}
                    disabled={!buSelected}
                    onClick={() => setCashAcctOpen(true)}
                    title="Select account"
                  />
                )}
              </Input.Group>
            </Form.Item>
          </Col>
          <Col xs={24} lg={12}>
            <Form.Item label="Offset Account" name="offsetAccountCombination" style={fs}>
              <Input.Group compact style={{ display: 'flex' }}>
                <Form.Item name="offsetAccountCombination" noStyle>
                  <Input
                    readOnly
                    disabled={isEdit}
                    placeholder={isEdit ? '—' : 'Select offset account'}
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                  />
                </Form.Item>
                {!isEdit && (
                  <Button
                    icon={<SearchOutlined />}
                    disabled={!buSelected}
                    onClick={() => setOffsetAcctOpen(true)}
                    title="Select account"
                  />
                )}
              </Input.Group>
            </Form.Item>
          </Col>
        </Row>

        <Divider />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {!isEdit && (
            <Button icon={<ApiOutlined />} onClick={handleApiOpen} style={{ color: REDWOOD.info, borderColor: REDWOOD.info }}>
              API
            </Button>
          )}
          {isEdit && <span />}
          <Space>
            <Button onClick={onCancel}>{isEdit ? 'Close' : 'Cancel'}</Button>
            {!isEdit && (
              <Button type="primary" loading={saving} onClick={handleSubmit}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>
                Create Transaction
              </Button>
            )}
          </Space>
        </div>
      </Form>

      {/* ── Account Selector Modals ── */}
      <AccountSelector
        visible={cashAcctOpen}
        onCancel={() => setCashAcctOpen(false)}
        onSelect={(code: string) => { form.setFieldValue('assetAccountCombination', code); setCashAcctOpen(false); }}
      />
      <AccountSelector
        visible={offsetAcctOpen}
        onCancel={() => setOffsetAcctOpen(false)}
        onSelect={(code: string) => { form.setFieldValue('offsetAccountCombination', code); setOffsetAcctOpen(false); }}
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
  const [transactions, setTransactions]   = useState<ExternalTxnRecord[]>([]);
  const [loading, setLoading]             = useState(false);
  const [hasSearched, setHasSearched]     = useState(false);
  const [bankAccounts, setBankAccounts]   = useState<BankAccountOption[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BUOption[]>([]);
  const [bankAccountMap, setBankAccountMap] = useState<Record<string, string>>({});
  const [activeTabKey, setActiveTabKey]   = useState('search');
  const [tabs, setTabs]                   = useState<{ key: string; label: string; record?: ExternalTxnRecord }[]>([]);
  const [lastApiUrl, setLastApiUrl]       = useState('');
  const [showApiModal, setShowApiModal]   = useState(false);
  const [searchForm] = Form.useForm();

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
    try {
      const res = await fetch(`${APEX_BASE}/cash/externaltransactions?row_limit=1000`);
      const data = await parseApexJson(res);
      if (data.status === 'success' && data.items) {
        const items: ExternalTxnRecord[] = data.items;
        const acctSet = new Set<string>();
        const buSet   = new Set<string>();
        const acctMap: Record<string, string> = {};
        items.forEach(i => {
          if (i.bankAccountName)   acctSet.add(i.bankAccountName);
          if (i.businessUnitName)  buSet.add(i.businessUnitName);
          if (i.bankAccountName && i.assetAccountCombination) {
            acctMap[i.bankAccountName] = i.assetAccountCombination;
          }
        });
        setBankAccounts([...acctSet].sort().map(n => ({ label: n, value: n })));
        setBusinessUnits([...buSet].sort().map(n => ({ label: n, value: n })));
        setBankAccountMap(acctMap);
      }
    } catch { /* silently skip */ }
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
      if (data.status === 'success') {
        setTransactions(data.items ?? []);
        if ((data.items ?? []).length === 0) message.info('No transactions found for the selected criteria.');
      } else {
        message.error(data.message || 'Search failed.');
      }
    } catch (e: any) {
      message.error('Network error: ' + e.message);
    } finally { setLoading(false); }
  }, [searchForm]);

  const handleReset = () => { searchForm.resetFields(); setTransactions([]); setHasSearched(false); };

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
      title: 'Actions', key: 'actions', width: 70, align: 'center',
      render: (_, r) => (
        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditTab(r)} />
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
            <Col xs={24} md={12}>
              <Form.Item label="Transaction #" name="transactionNumber" style={{ marginBottom: 10 }}>
                <Input placeholder="Transaction number" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Date From" name="dateFrom" style={{ marginBottom: 10 }}>
                <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Bank Account" name="bankAccount" style={{ marginBottom: 10 }}>
                <Select showSearch placeholder="Select account" optionFilterProp="label" options={bankAccounts} allowClear style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Date To" name="dateTo" style={{ marginBottom: 10 }}>
                <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Currency" name="currencyCode" style={{ marginBottom: 10 }}>
                <Select placeholder="Select currency" allowClear>
                  {['AED','USD','EUR','GBP','SAR','QAR','KWD','BHD','OMR'].map(c => <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Amount From" name="amountFrom" style={{ marginBottom: 10 }}>
                <InputNumber style={{ width: '100%' }} placeholder="Min amount" precision={2} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Business Unit" name="businessUnit" style={{ marginBottom: 10 }}>
                <Select showSearch placeholder="Select BU" optionFilterProp="label" options={businessUnits} allowClear style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Amount To" name="amountTo" style={{ marginBottom: 10 }}>
                <InputNumber style={{ width: '100%' }} placeholder="Max amount" precision={2} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Transaction Type" name="transactionType" style={{ marginBottom: 10 }}>
                <Select placeholder="Select type" allowClear>
                  <Option value="EFT">EFT</Option>
                  <Option value="WIRE">WIRE</Option>
                  <Option value="CHECK">CHECK</Option>
                  <Option value="MISC">MISC</Option>
                  <Option value="BKF">BKF</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Reference" name="reference" style={{ marginBottom: 10 }}>
                <Input placeholder="Reference text" />
              </Form.Item>
            </Col>
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
          <Text type="secondary" style={{ fontSize: 11 }}>** At least one filter recommended</Text>
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
                <Text strong>
                  Search Results{' '}
                  <Tag color="blue">{filtered.length}{q && filtered.length !== transactions.length ? ` / ${transactions.length}` : ''}</Tag>
                </Text>
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
              scroll={{ x: 1500 }}
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
          bankAccounts={bankAccounts}
          businessUnits={businessUnits}
          bankAccountMap={bankAccountMap}
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
      </Content>
    </Layout>
  );
};

export default ManageExternalTransactions;
