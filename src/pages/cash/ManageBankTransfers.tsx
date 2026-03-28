import React, { useState, useCallback, useEffect, useRef } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
  Layout, Breadcrumb, Typography, Card, Table, Button, Form, Input, Select,
  DatePicker, InputNumber, Checkbox, Row, Col, Space, Tag, Tooltip, Tabs,
  message, Spin, Empty, Divider, Badge, Collapse, Modal,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, BankOutlined, PlusOutlined, SearchOutlined, ReloadOutlined,
  EditOutlined, CloseOutlined, FilterOutlined, SwapOutlined, DollarOutlined,
  FileTextOutlined, ApiOutlined, ExportOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';

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
  onSave: () => void;
  onCancel: () => void;
}> = ({ initialValues, bankAccounts, businessUnits, onSave, onCancel }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [apiModal, setApiModal]       = useState(false);
  const [apiPayload, setApiPayload]   = useState('');
  const [apiPosting, setApiPosting]   = useState(false);
  const [apiResponse, setApiResponse] = useState<{ status: number; body: string } | null>(null);
  const isEdit = !!initialValues?.bankAccountTransferId;

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
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ transactionDate: dayjs(), isSettledWithIbyFlag: true });
    }
  }, [initialValues, form]);

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
      FromAmount:                values.paymentAmount,
      FromBankAccountName:       values.fromBankAccountName,
      ToBankAccountName:         values.toBankAccountName,
      FromCurrencyCode:          '',
      ToCurrencyCode:            '',
      PaymentCurrencyCode:       '',
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

  const [selectedBu, setSelectedBu] = useState<string | undefined>(
    initialValues?.businessUnit ?? undefined
  );
  const buSelected = !!selectedBu;

  // sync selectedBu when initialValues changes (edit mode)
  useEffect(() => { setSelectedBu(initialValues?.businessUnit ?? undefined); }, [initialValues]);

  const fs = { marginBottom: 14 };
  const lc = { span: 8 };
  const wc = { span: 16 };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '12px 24px' }}>
      <Text style={{ fontSize: 12, color: REDWOOD.neutral600, display: 'block', marginBottom: 16 }}>
        {isEdit ? 'Edit Bank Account Transfer' : 'Create Bank Account Transfer'}
      </Text>

      <Form form={form} layout="horizontal" labelCol={lc} wrapperCol={wc}>

        {/* ── Business Unit — must be selected first ── */}
        <Row gutter={40}>
          <Col xs={24} lg={12}>
            <Form.Item label="Business Unit" name="businessUnit" rules={[{ required: true, message: 'Business Unit is required' }]} style={fs}>
              <Select
                showSearch placeholder="Select business unit" optionFilterProp="label" options={businessUnits}
                style={{ width: '100%' }}
                onChange={(v) => setSelectedBu(v ?? undefined)}
                allowClear
                onClear={() => setSelectedBu(undefined)}
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
            <Form.Item label="From Account" name="fromBankAccountName" rules={[{ required: true, message: 'From Account is required' }]} style={fs}>
              <Select showSearch placeholder="Select bank account" optionFilterProp="label" options={bankAccounts}
                style={{ width: '100%' }} disabled={!buSelected}
                notFoundContent={<Text type="secondary">No accounts loaded</Text>} />
            </Form.Item>

            <Form.Item label="To Account" name="toBankAccountName" rules={[{ required: true, message: 'To Account is required' }]} style={fs}>
              <Select showSearch placeholder="Select bank account" optionFilterProp="label" options={bankAccounts}
                style={{ width: '100%' }} disabled={!buSelected}
                notFoundContent={<Text type="secondary">No accounts loaded</Text>} />
            </Form.Item>

            <Form.Item label="Transfer Date" name="transactionDate" rules={[{ required: true, message: 'Transfer Date is required' }]} style={fs}>
              <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" disabled={!buSelected} />
            </Form.Item>

            <Form.Item label="Transfer Amount" name="paymentAmount" rules={[{ required: true, message: 'Amount is required' }]} style={fs}>
              <InputNumber style={{ width: '100%' }} min={0} precision={2} disabled={!buSelected} />
            </Form.Item>

            <Form.Item label="Conversion Rate Type" name="conversionRateType" style={fs}>
              <Select placeholder="Select type" allowClear disabled={!buSelected}>
                <Option value="User">User</Option>
                <Option value="Corporate">Corporate</Option>
                <Option value="Spot">Spot</Option>
                <Option value="Period Average">Period Average</Option>
              </Select>
            </Form.Item>

            <Form.Item label="Conversion Rate" name="conversionRate" style={fs}>
              <InputNumber style={{ width: '100%' }} min={0} precision={6} disabled={!buSelected} />
            </Form.Item>
          </Col>

          {/* Right column */}
          <Col xs={24} lg={12}>
            <Form.Item label=" " colon={false} name="isSettledWithIbyFlag" valuePropName="checked" style={fs}>
              <Checkbox style={{ color: REDWOOD.info, fontWeight: 500 }} disabled={!buSelected}>
                Settle transaction through Payments
              </Checkbox>
            </Form.Item>

            <Form.Item label="Payment Method" name="paymentMethod" rules={[{ required: true, message: 'Payment Method is required' }]} style={fs}>
              <Select placeholder="Select method" disabled={!buSelected}>
                <Option value="Electronic">Electronic</Option>
                <Option value="Check">Check</Option>
                <Option value="Wire">Wire</Option>
                <Option value="EFT">EFT</Option>
              </Select>
            </Form.Item>

            <Form.Item label="Payment Profile" name="paymentProfileName" rules={[{ required: true, message: 'Payment Profile is required' }]} style={fs}>
              <Select placeholder="Select profile" showSearch optionFilterProp="children" disabled={!buSelected}>
                {['BOB BCL EFT', 'BOB BCL WIRE', 'ADIB EFT', 'ADCB EFT', 'FAB EFT'].map(p => (
                  <Option key={p} value={p}>{p}</Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item label="Memo" name="memo" style={fs}>
              <Input.TextArea rows={3} placeholder="Enter memo / description" disabled={!buSelected} />
            </Form.Item>

            <Form.Item label="Attachments" style={fs}>
              <Text type="secondary">None</Text>
              <Button size="small" icon={<PlusOutlined />} style={{ marginLeft: 8 }} disabled>Add</Button>
            </Form.Item>
          </Col>
        </Row>

        <Divider />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button icon={<ApiOutlined />} onClick={handleApiOpen} style={{ color: REDWOOD.info, borderColor: REDWOOD.info }}>
            API
          </Button>
          <Space>
            <Button onClick={onCancel}>Cancel</Button>
            <Button
              type="primary"
              loading={saving}
              onClick={handleSubmit}
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
            >
              {isEdit ? 'Save Changes' : 'Create Transfer'}
            </Button>
          </Space>
        </div>
      </Form>

      {/* ── API Inspector Modal ── */}
      <Modal
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /><span>API Inspector — POST /cash/banktransfers</span></Space>}
        open={apiModal}
        onCancel={() => setApiModal(false)}
        width={780}
        footer={null}
        styles={{ body: { padding: '16px 24px' } }}
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          Endpoint: <Text code copyable style={{ fontSize: 12 }}>{APEX_BASE}/cash/banktransfers</Text>
        </Text>

        <div style={{ marginTop: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
  const [bankAccounts, setBankAccounts]   = useState<BankAccountOption[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BUOption[]>([]);
  const [activeTab, setActiveTab]         = useState('search');
  const [editTabs, setEditTabs]           = useState<TabItem[]>([]);
  const [showApiModal, setShowApiModal]   = useState(false);
  const [lastApiUrl, setLastApiUrl]       = useState('');
  const [searchForm]                      = Form.useForm();

  const modulePrefix = module === 'ap' ? '/ap' : '/cash';

  // ── Load LOV data from existing transfers ─────────────────────────────────
  const loadLovs = useCallback(async () => {
    try {
      const res = await fetch(`${APEX_BASE}/cash/banktransfers?row_limit=500`);
      const data = await parseApexJson(res);
      if (data.status === 'success' && data.items) {
        const items: TransferRecord[] = data.items;

        // Unique bank account names
        const acctSet = new Set<string>();
        items.forEach(i => { if (i.fromBankAccountName) acctSet.add(i.fromBankAccountName); if (i.toBankAccountName) acctSet.add(i.toBankAccountName); });
        setBankAccounts([...acctSet].sort().map(n => ({ label: n, value: n })));

        // Unique BUs
        const buSet = new Set<string>();
        items.forEach(i => { if (i.businessUnit) buSet.add(i.businessUnit); });
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
      width: 70,
      fixed: 'right',
      render: (_, record) => (
        <Tooltip title="Edit">
          <Button type="text" size="small" icon={<EditOutlined />}
            style={{ color: REDWOOD.info }}
            onClick={() => openEdit(record)} />
        </Tooltip>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {hasSearched ? `${transfers.length} transfer${transfers.length !== 1 ? 's' : ''} found` : 'Use the search panel above to find transfers'}
          </Text>
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
          dataSource={transfers}
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
          {/* Page header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 10,
                background: `linear-gradient(135deg, ${REDWOOD.info} 0%, #0450A0 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 4px 12px ${REDWOOD.info}40`,
              }}>
                <SwapOutlined style={{ fontSize: 24, color: '#fff' }} />
              </div>
              <div>
                <Title level={3} style={{ margin: 0, color: REDWOOD.neutral900 }}>
                  Manage Bank Account Transfers
                </Title>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Search, create and manage interbank transfers
                </Text>
              </div>
            </div>
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
