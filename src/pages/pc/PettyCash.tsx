import React, { useState, useEffect, useCallback } from 'react';
import {
  Layout, Card, Typography, Breadcrumb, Tabs, Form, Input, Select,
  DatePicker, Button, Table, Tag, Row, Col, Space, Divider,
  Modal, InputNumber, message, Tooltip, Statistic, Collapse,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  HomeOutlined, WalletOutlined, PlusOutlined, SearchOutlined,
  ReloadOutlined, EditOutlined, DeleteOutlined, CloseOutlined,
  DollarOutlined, MinusCircleOutlined, ArrowUpOutlined, ArrowDownOutlined,
} from '@ant-design/icons';
import FloatingMenu from '../../components/FloatingMenu';
import ApiDocsModal, { type ApiEndpoint } from '../../components/ApiDocsModal';
import { useAuth } from '../../context/AuthContext';
import { APEX_DB_CONFIG } from '../../config/api.config';
import {
  searchRegisters, getRegister, createRegister, updateRegister, deleteRegister,
  getTransactions, createTransaction,
  type PCRegister, type PCTransaction,
} from '../../services/pc.service';

const { Content } = Layout;
const { Text, Title } = Typography;
const { Option } = Select;

const REDWOOD = {
  primary: '#C74634', primaryLight: '#E85D4A',
  success: '#1D7B4D', warning: '#D4A800', info: '#0572CE',
  error: '#C74634', neutral100: '#F7F7F7', neutral200: '#E5E5E5',
  neutral300: '#C7C7C7', neutral600: '#6B6B6B', neutral900: '#1A1A1A',
  surface: '#FFFFFF',
};

const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface RegisterTab {
  key: string;
  register: PCRegister;
  transactions: PCTransaction[];
  txnLoading: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status tag helper
// ─────────────────────────────────────────────────────────────────────────────
const StatusTag: React.FC<{ status: string }> = ({ status }) => (
  <Tag color={status === 'ACTIVE' ? 'green' : 'default'} style={{ fontSize: 11 }}>
    {status}
  </Tag>
);

const PostingTag: React.FC<{ status: string }> = ({ status }) => {
  const color = status === 'Posted' ? 'green' : status === 'Error' ? 'red' : 'default';
  return <Tag color={color} style={{ fontSize: 11 }}>{status}</Tag>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Register Detail Panel
// ─────────────────────────────────────────────────────────────────────────────
const RegisterDetail: React.FC<{
  tab: RegisterTab;
  onRefresh: () => void;
  currentUser: string;
}> = ({ tab, onRefresh, currentUser }) => {
  const { register, transactions, txnLoading } = tab;
  const [addMoneyOpen, setAddMoneyOpen]     = useState(false);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [moneyForm]   = Form.useForm();
  const [expenseForm] = Form.useForm();
  const needsRefresh = React.useRef(false);

  const isClosed   = register.status === 'CLOSED';
  const noBalance  = register.balance <= 0;

  // ── Add Money ──────────────────────────────────────────────
  const handleAddMoney = async (values: any) => {
    setSaving(true);
    try {
      await createTransaction({
        registerId:      register.registerId,
        transactionDate: values.transactionDate.format('YYYY-MM-DD'),
        accountingDate:  values.accountingDate
          ? values.accountingDate.format('YYYY-MM-DD')
          : values.transactionDate.format('YYYY-MM-DD'),
        transactionType: 'Balance Refill',
        currency:        values.currency || register.currency,
        debitAmount:     values.amount,
        creditAmount:    0,
        referenceNo:     values.referenceNo,
        comments:        values.comments,
        postingStatus:   'Unposted',
        createdBy:       currentUser,
      });
      message.success('Money added to register');
      moneyForm.resetFields();
      needsRefresh.current = false;
      setAddMoneyOpen(false);
      onRefresh();
    } catch (e: any) {
      message.error(e?.message ?? 'Failed to add money');
    } finally {
      setSaving(false);
    }
  };

  // ── Add Expense ────────────────────────────────────────────
  const handleAddExpense = async (values: any) => {
    if (values.amount > register.balance) {
      message.error(`Expense amount (${fmt(values.amount)}) exceeds available balance (${fmt(register.balance)} ${register.currency})`);
      return;
    }
    setSaving(true);
    try {
      await createTransaction({
        registerId:        register.registerId,
        transactionDate:   values.transactionDate.format('YYYY-MM-DD'),
        accountingDate:    values.accountingDate
          ? values.accountingDate.format('YYYY-MM-DD')
          : values.transactionDate.format('YYYY-MM-DD'),
        transactionType:   'Expense',
        expenseType:       values.expenseType,
        currency:          values.currency || register.currency,
        debitAmount:       0,
        creditAmount:      values.amount,
        chargeAccountCcid: values.chargeAccountCcid || null,
        chargeAccountDesc: values.chargeAccountDesc || null,
        referenceNo:       values.referenceNo,
        comments:          values.comments,
        attachment:        values.attachment,
        postingStatus:     'Unposted',
        createdBy:         currentUser,
      });
      message.success('Expense recorded');
      expenseForm.resetFields();
      needsRefresh.current = false;
      setAddExpenseOpen(false);
      onRefresh();
    } catch (e: any) {
      message.error(e?.message ?? 'Failed to record expense');
    } finally {
      setSaving(false);
    }
  };

  // ── Transaction columns ────────────────────────────────────
  const txnColumns: ColumnsType<PCTransaction> = [
    { title: '#', dataIndex: 'lineNumber', width: 50, align: 'center',
      render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Date', dataIndex: 'transactionDate', width: 100,
      render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Type', dataIndex: 'transactionType', width: 120,
      render: (v) => {
        const color = v === 'Balance Refill' ? 'blue' : v === 'Expense' ? 'orange' : 'purple';
        return <Tag color={color} style={{ fontSize: 11 }}>{v}</Tag>;
      }},
    { title: 'Expense Type', dataIndex: 'expenseType', width: 120,
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Currency', dataIndex: 'currency', width: 80, align: 'center',
      render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Debit', dataIndex: 'debitAmount', width: 110, align: 'right',
      render: (v) => v > 0
        ? <Text style={{ fontSize: 12, color: REDWOOD.success }}>{fmt(v)}</Text>
        : <Text style={{ fontSize: 12, color: REDWOOD.neutral300 }}>—</Text> },
    { title: 'Credit', dataIndex: 'creditAmount', width: 110, align: 'right',
      render: (v) => v > 0
        ? <Text style={{ fontSize: 12, color: REDWOOD.error }}>{fmt(v)}</Text>
        : <Text style={{ fontSize: 12, color: REDWOOD.neutral300 }}>—</Text> },
    { title: 'Balance', dataIndex: 'runningBalance', width: 120, align: 'right',
      render: (v) => (
        <Text style={{ fontSize: 12, fontWeight: 600,
          color: v >= 0 ? REDWOOD.success : REDWOOD.error }}>
          {fmt(v)}
        </Text>
      )},
    { title: 'Charge Account', dataIndex: 'chargeAccountDesc', width: 160,
      render: (v) => <Text style={{ fontSize: 11 }}>{v || '—'}</Text> },
    { title: 'Acct Date', dataIndex: 'accountingDate', width: 100,
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Posting', dataIndex: 'postingStatus', width: 90,
      render: (v) => <PostingTag status={v} /> },
    { title: 'Reference', dataIndex: 'referenceNo', width: 120,
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Comments', dataIndex: 'comments', ellipsis: true,
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Created By', dataIndex: 'createdBy', width: 110,
      render: (v) => <Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{v || '—'}</Text> },
  ];

  return (
    <>
      {/* Header summary */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small" style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
            <Statistic
              title={<Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Balance</Text>}
              value={register.balance}
              precision={2}
              valueStyle={{ fontSize: 22, color: register.balance >= 0 ? REDWOOD.success : REDWOOD.error }}
              suffix={<span style={{ fontSize: 13 }}>{register.currency}</span>}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
            <Statistic
              title={<Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Total In (Debit)</Text>}
              value={register.totalDebit}
              precision={2}
              valueStyle={{ fontSize: 18, color: REDWOOD.success }}
              prefix={<ArrowDownOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
            <Statistic
              title={<Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Total Out (Credit)</Text>}
              value={register.totalCredit}
              precision={2}
              valueStyle={{ fontSize: 18, color: REDWOOD.error }}
              prefix={<ArrowUpOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
            <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 4 }}>Register Info</div>
            <div style={{ fontSize: 12 }}>
              <b>Currency:</b> {register.currency}<br />
              <b>Status:</b> <StatusTag status={register.status} /><br />
              {register.startDate && <><b>From:</b> {register.startDate}<br /></>}
              {register.endDate   && <><b>To:</b> {register.endDate}</>}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Cash Account */}
      {register.cashAccountDesc && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f0f9ff',
          borderRadius: 6, border: '1px solid #bae0ff', fontSize: 12 }}>
          <b>Cash Account:</b> {register.cashAccountDesc}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Transactions</Text>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={onRefresh}
            loading={tab.txnLoading}
          >
            Refresh
          </Button>
          <Button
            icon={<DollarOutlined />}
            style={{ background: REDWOOD.success, borderColor: REDWOOD.success, color: '#fff' }}
            disabled={isClosed}
            onClick={() => { moneyForm.resetFields(); setAddMoneyOpen(true); }}
          >
            Add Money
          </Button>
          <Tooltip title={noBalance ? 'No available balance to record an expense' : undefined}>
            <Button
              icon={<MinusCircleOutlined />}
              style={!isClosed && !noBalance
                ? { background: REDWOOD.warning, borderColor: REDWOOD.warning, color: '#fff' }
                : {}}
              disabled={isClosed || noBalance}
              onClick={() => { expenseForm.resetFields(); setAddExpenseOpen(true); }}
            >
              Add Expense
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Transactions table */}
      <Table<PCTransaction>
        dataSource={transactions}
        columns={txnColumns}
        rowKey="transactionId"
        size="small"
        loading={txnLoading}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} transactions` }}
        scroll={{ x: 1400 }}
        locale={{ emptyText: 'No transactions yet — use Add Money or Add Expense to begin.' }}
        rowClassName={(r) => r.transactionType === 'Balance Refill' ? 'pc-row-refill' : ''}
      />

      {/* ── Add Money Modal ────────────────────────────────── */}
      <Modal
        title={<Space><DollarOutlined style={{ color: REDWOOD.success }} /> Add Money to Register</Space>}
        open={addMoneyOpen}
        onCancel={() => { setAddMoneyOpen(false); if (needsRefresh.current) { needsRefresh.current = false; onRefresh(); } }}
        footer={null}
        width={520}
        destroyOnClose
      >
        <Form form={moneyForm} layout="vertical" size="small" onFinish={handleAddMoney}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Transaction Date" name="transactionDate"
                rules={[{ required: true, message: 'Required' }]}
                initialValue={dayjs()}>
                <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Accounting Date" name="accountingDate">
                <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="Defaults to Txn Date" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Amount" name="amount"
                rules={[{ required: true, message: 'Required' }, { type: 'number', min: 0.01, message: 'Must be > 0' }]}>
                <InputNumber style={{ width: '100%' }} precision={2} min={0} placeholder="0.00" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Currency" name="currency" initialValue={register.currency}>
                <Select>
                  {['AED','USD','EUR','GBP','SAR','KWD','QAR','OMR','BHD','EGP','INR'].map(c =>
                    <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Reference No" name="referenceNo">
            <Input placeholder="e.g. Payment001" />
          </Form.Item>
          <Form.Item label="Comments" name="comments">
            <Input.TextArea rows={2} placeholder="Optional" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button onClick={() => setAddMoneyOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={saving}
              style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}>
              Add Money
            </Button>
          </div>
        </Form>
      </Modal>

      {/* ── Add Expense Modal ──────────────────────────────── */}
      <Modal
        title={<Space><MinusCircleOutlined style={{ color: REDWOOD.warning }} /> Add Expense</Space>}
        open={addExpenseOpen}
        onCancel={() => { setAddExpenseOpen(false); if (needsRefresh.current) { needsRefresh.current = false; onRefresh(); } }}
        footer={null}
        width={580}
        destroyOnClose
      >
        <Form form={expenseForm} layout="vertical" size="small" onFinish={handleAddExpense}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Transaction Date" name="transactionDate"
                rules={[{ required: true, message: 'Required' }]}
                initialValue={dayjs()}>
                <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Accounting Date" name="accountingDate">
                <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="Defaults to Txn Date" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Expense Type" name="expenseType"
                rules={[{ required: true, message: 'Required' }]}>
                <Select placeholder="Select expense type" showSearch>
                  {['Meals & Entertainment','Travel','Office Supplies','Utilities','Maintenance',
                    'Accommodation','Transport','Postage','Printing','Miscellaneous'].map(t =>
                    <Option key={t} value={t}>{t}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Currency" name="currency" initialValue={register.currency}>
                <Select>
                  {['AED','USD','EUR','GBP','SAR','KWD','QAR','OMR','BHD','EGP','INR'].map(c =>
                    <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Amount" name="amount"
                rules={[{ required: true, message: 'Required' }, { type: 'number', min: 0.01, message: 'Must be > 0' }]}>
                <InputNumber style={{ width: '100%' }} precision={2} min={0} placeholder="0.00" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Reference No" name="referenceNo">
                <Input placeholder="Optional" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Charge Account" name="chargeAccountDesc">
            <Input placeholder="e.g. 01-100-6010-000" />
          </Form.Item>
          <Form.Item label="Comments" name="comments">
            <Input.TextArea rows={2} placeholder="Optional" />
          </Form.Item>
          <Form.Item label="Attachment" name="attachment">
            <Input placeholder="File name or URL" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button onClick={() => setAddExpenseOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={saving}
              style={{ background: REDWOOD.warning, borderColor: REDWOOD.warning }}>
              Save Expense
            </Button>
          </div>
        </Form>
      </Modal>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
const PC_BASE = `${APEX_DB_CONFIG.baseUrl}/pc`;

const PC_API_ENDPOINTS: ApiEndpoint[] = [
  {
    method: 'GET', url: `${PC_BASE}/registers`,
    description: 'Search all petty cash registers',
    params: 'q (name contains), status (ACTIVE|CLOSED), dateFrom (YYYY-MM-DD), dateTo (YYYY-MM-DD)',
  },
  {
    method: 'POST', url: `${PC_BASE}/registers`,
    description: 'Create a new petty cash register',
    body: 'registerName*, startDate, endDate, comments, cashAccountDesc, currency, createdBy',
    sampleBody: JSON.stringify({ registerName: 'Main Office Petty Cash', currency: 'AED', startDate: '2026-01-01', cashAccountDesc: '01-100-1010-000', createdBy: 'ADMIN' }, null, 2),
  },
  {
    method: 'GET', url: `${PC_BASE}/registers/:registerId`,
    description: 'Get single register with live balance, totalDebit, totalCredit',
  },
  {
    method: 'PUT', url: `${PC_BASE}/registers/:registerId`,
    description: 'Update register header fields',
    body: 'registerName, startDate, endDate, comments, cashAccountDesc, currency, status, updatedBy',
    sampleBody: JSON.stringify({ status: 'CLOSED', updatedBy: 'ADMIN' }, null, 2),
  },
  {
    method: 'DELETE', url: `${PC_BASE}/registers/:registerId`,
    description: 'Delete register — blocked if transactions exist',
  },
  {
    method: 'GET', url: `${PC_BASE}/registers/:registerId/transactions`,
    description: 'Get all transaction lines with running balance (analytic window)',
  },
  {
    method: 'POST', url: `${PC_BASE}/transactions`,
    description: 'Create a transaction — Balance Refill (debit) or Expense (credit)',
    body: 'registerId*, transactionDate*, transactionType*, currency, debitAmount, creditAmount, expenseType, chargeAccountCcid, chargeAccountDesc, accountingDate, postingStatus, comments, referenceNo, attachment, createdBy',
    sampleBody: JSON.stringify({ registerId: 1001, transactionDate: '2026-04-18', transactionType: 'Expense', expenseType: 'Meals & Entertainment', currency: 'AED', debitAmount: 0, creditAmount: 150, referenceNo: 'EXP-001', comments: 'Team lunch', createdBy: 'ADMIN' }, null, 2),
  },
  {
    method: 'PUT', url: `${PC_BASE}/transactions/:transactionId`,
    description: 'Update a transaction line',
    body: 'transactionDate, transactionType, expenseType, chargeAccountCcid, chargeAccountDesc, accountingDate, postingStatus, currency, debitAmount, creditAmount, comments, referenceNo, attachment, updatedBy',
    sampleBody: JSON.stringify({ postingStatus: 'Posted', updatedBy: 'ADMIN' }, null, 2),
  },
  {
    method: 'DELETE', url: `${PC_BASE}/transactions/:transactionId`,
    description: 'Delete a transaction line',
  },
];

const PettyCash: React.FC = () => {
  const { user } = useAuth();
  const currentUser = user?.username || 'SYSTEM';

  const [searchForm]  = Form.useForm();
  const [registerForm] = Form.useForm();

  const [activeTab, setActiveTab]             = useState('search');
  const [openTabs, setOpenTabs]               = useState<RegisterTab[]>([]);
  const [createTabOpen, setCreateTabOpen]     = useState(false);
  const openingKeys = React.useRef<Set<string>>(new Set());

  const [registers, setRegisters]             = useState<PCRegister[]>([]);
  const [searchLoading, setSearchLoading]     = useState(false);
  const [saveLoading, setSaveLoading]         = useState(false);
  const [deleteLoading, setDeleteLoading]     = useState<number | null>(null);
  const [searched, setSearched]               = useState(false);

  // ── Search ────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    setSearchLoading(true);
    try {
      const values = searchForm.getFieldsValue();
      const rows = await searchRegisters({
        q:        values.registerName || undefined,
        status:   values.status       || undefined,
        dateFrom: values.dateFrom ? values.dateFrom.format('YYYY-MM-DD') : undefined,
        dateTo:   values.dateTo   ? values.dateTo.format('YYYY-MM-DD')   : undefined,
      });
      setRegisters(rows);
      setSearched(true);
    } catch (e: any) {
      message.error(e?.message ?? 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  }, [searchForm]);

  useEffect(() => { handleSearch(); }, []);  // auto-search on mount

  // ── Open register detail tab ───────────────────────────────
  const openRegisterTab = useCallback(async (reg: PCRegister) => {
    const key = `reg-${reg.registerId}`;
    // Guard: if already open or currently being opened, just switch to it
    if (openingKeys.current.has(key)) { setActiveTab(key); return; }
    if (openTabs.find(t => t.key === key)) { setActiveTab(key); return; }

    openingKeys.current.add(key);
    const newTab: RegisterTab = { key, register: reg, transactions: [], txnLoading: true };
    setOpenTabs(prev => {
      if (prev.find(t => t.key === key)) return prev;  // double-check inside updater
      return [...prev, newTab];
    });
    setActiveTab(key);

    try {
      const txns = await getTransactions(reg.registerId);
      setOpenTabs(prev => prev.map(t => t.key === key ? { ...t, transactions: txns, txnLoading: false } : t));
    } catch {
      setOpenTabs(prev => prev.map(t => t.key === key ? { ...t, txnLoading: false } : t));
    } finally {
      openingKeys.current.delete(key);
    }
  }, [openTabs]);

  // ── Refresh a tab (register header + transactions) ──────────
  const refreshTab = useCallback(async (key: string) => {
    const tab = openTabs.find(t => t.key === key);
    if (!tab) return;
    setOpenTabs(prev => prev.map(t => t.key === key ? { ...t, txnLoading: true } : t));
    try {
      const [reg, txns] = await Promise.all([
        getRegister(tab.register.registerId),
        getTransactions(tab.register.registerId),
      ]);
      setOpenTabs(prev => prev.map(t => t.key === key ? { ...t, register: reg, transactions: txns, txnLoading: false } : t));
      setRegisters(prev => prev.map(r => r.registerId === reg.registerId ? reg : r));
    } catch {
      setOpenTabs(prev => prev.map(t => t.key === key ? { ...t, txnLoading: false } : t));
    }
  }, [openTabs]);

  // ── Close tab ──────────────────────────────────────────────
  const closeTab = (key: string) => {
    const remaining = openTabs.filter(t => t.key !== key);
    setOpenTabs(remaining);
    if (activeTab === key) setActiveTab(remaining.length ? remaining[remaining.length - 1].key : 'search');
  };

  // ── Create register ────────────────────────────────────────
  const handleCreateRegister = async (values: any) => {
    setSaveLoading(true);
    try {
      const result = await createRegister({
        registerName:    values.registerName,
        startDate:       values.startDate ? values.startDate.format('YYYY-MM-DD') : undefined,
        endDate:         values.endDate   ? values.endDate.format('YYYY-MM-DD')   : undefined,
        comments:        values.comments,
        cashAccountDesc: values.cashAccountDesc,
        currency:        values.currency || 'AED',
        createdBy:       currentUser,
      });
      message.success(`Register #${result.registerId} created`);
      registerForm.resetFields();
      setCreateTabOpen(false);
      setActiveTab('search');
      await handleSearch();
    } catch (e: any) {
      message.error(e?.message ?? 'Failed to create register');
    } finally {
      setSaveLoading(false);
    }
  };

  // ── Delete register ────────────────────────────────────────
  const handleDelete = async (reg: PCRegister, e: React.MouseEvent) => {
    e.stopPropagation();
    Modal.confirm({
      title: `Delete "${reg.registerName}"?`,
      content: 'This cannot be undone. Registers with transactions cannot be deleted.',
      okText: 'Delete', okButtonProps: { danger: true },
      onOk: async () => {
        setDeleteLoading(reg.registerId);
        try {
          await deleteRegister(reg.registerId);
          message.success('Register deleted');
          closeTab(`reg-${reg.registerId}`);
          await handleSearch();
        } catch (e: any) {
          message.error(e?.message ?? 'Delete failed');
        } finally {
          setDeleteLoading(null);
        }
      },
    });
  };

  // ── Search results columns ─────────────────────────────────
  const searchColumns: ColumnsType<PCRegister> = [
    { title: 'ID', dataIndex: 'registerId', width: 70, align: 'center',
      render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Register Name', dataIndex: 'registerName',
      render: (v, rec) => (
        <Button type="link" style={{ padding: 0, fontSize: 13, fontWeight: 500 }}
          onClick={(e) => { e.stopPropagation(); openRegisterTab(rec); }}>
          {v}
        </Button>
      )},
    { title: 'Currency', dataIndex: 'currency', width: 80, align: 'center',
      render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Status', dataIndex: 'status', width: 90,
      render: (v) => <StatusTag status={v} /> },
    { title: 'Balance', dataIndex: 'balance', width: 130, align: 'right',
      render: (v, rec) => (
        <Text style={{ fontSize: 13, fontWeight: 600,
          color: v >= 0 ? REDWOOD.success : REDWOOD.error }}>
          {fmt(v)} <span style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{rec.currency}</span>
        </Text>
      )},
    { title: 'Total In', dataIndex: 'totalDebit', width: 110, align: 'right',
      render: (v) => <Text style={{ fontSize: 12, color: REDWOOD.success }}>{fmt(v)}</Text> },
    { title: 'Total Out', dataIndex: 'totalCredit', width: 110, align: 'right',
      render: (v) => <Text style={{ fontSize: 12, color: REDWOOD.error }}>{fmt(v)}</Text> },
    { title: 'Start Date', dataIndex: 'startDate', width: 100,
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'End Date', dataIndex: 'endDate', width: 100,
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Cash Account', dataIndex: 'cashAccountDesc', ellipsis: true,
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Created By', dataIndex: 'createdBy', width: 110,
      render: (v) => <Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{v || '—'}</Text> },
    { title: '', key: 'actions', width: 60, align: 'center',
      render: (_, rec) => (
        <Tooltip title="Delete register">
          <Button type="text" danger size="small" icon={<DeleteOutlined />}
            loading={deleteLoading === rec.registerId}
            onClick={(e) => handleDelete(rec, e)} />
        </Tooltip>
      )},
  ];

  // ── Tab items ──────────────────────────────────────────────
  const tabItems = [
    // Search tab
    {
      key: 'search',
      label: <Space><SearchOutlined />Registers</Space>,
      children: (
        <div style={{ padding: '12px 0' }}>
          {/* Search form */}
          <Collapse
            defaultActiveKey={['search']}
            style={{ marginBottom: 12, borderRadius: 8 }}
            items={[{
              key: 'search',
              label: <Text style={{ fontWeight: 500 }}>Search Criteria</Text>,
              children: (
                <Form form={searchForm} layout="vertical" size="small">
                  <Row gutter={16}>
                    <Col span={6}>
                      <Form.Item label="Register Name" name="registerName">
                        <Input placeholder="Search by name" allowClear />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item label="Status" name="status">
                        <Select placeholder="All" allowClear>
                          <Option value="ACTIVE">Active</Option>
                          <Option value="CLOSED">Closed</Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={5}>
                      <Form.Item label="Start Date From" name="dateFrom">
                        <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
                      </Form.Item>
                    </Col>
                    <Col span={5}>
                      <Form.Item label="Start Date To" name="dateTo">
                        <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
                      </Form.Item>
                    </Col>
                    <Col span={4} style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 24 }}>
                      <Space>
                        <Button type="primary" icon={<SearchOutlined />}
                          style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                          onClick={handleSearch} loading={searchLoading}>
                          Search
                        </Button>
                        <Button icon={<ReloadOutlined />} onClick={() => {
                          searchForm.resetFields(); handleSearch();
                        }}>
                          Reset
                        </Button>
                      </Space>
                    </Col>
                  </Row>
                </Form>
              ),
            }]}
          />

          {/* Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 13, color: REDWOOD.neutral600 }}>
              {searched ? `${registers.length} register(s) found` : ''}
            </Text>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
              onClick={() => { setCreateTabOpen(true); setActiveTab('create'); }}
            >
              New Register
            </Button>
          </div>

          {/* Results table */}
          <Table<PCRegister>
            dataSource={registers}
            columns={searchColumns}
            rowKey="registerId"
            size="small"
            loading={searchLoading}
            pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (t) => `${t} registers` }}
            scroll={{ x: 1100 }}
            onRow={(rec) => ({ onClick: () => openRegisterTab(rec), style: { cursor: 'pointer' } })}
            locale={{ emptyText: 'No registers found. Click New Register to create one.' }}
          />
        </div>
      ),
    },

    // Create Register tab
    ...(createTabOpen ? [{
      key: 'create',
      label: <Space><PlusOutlined />New Register</Space>,
      closable: true,
      children: (
        <div style={{ padding: '16px 0', maxWidth: 680 }}>
          <Title level={5} style={{ marginBottom: 16, color: REDWOOD.neutral900 }}>
            Create Petty Cash Register
          </Title>
          <Form form={registerForm} layout="vertical" size="small" onFinish={handleCreateRegister}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label={<><span style={{ color: REDWOOD.primary }}>*</span> Register Name</>}
                  name="registerName" rules={[{ required: true, message: 'Required' }]}>
                  <Input placeholder="e.g. Main Office Petty Cash" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Currency" name="currency" initialValue="AED">
                  <Select>
                    {['AED','USD','EUR','GBP','SAR','KWD','QAR','OMR','BHD','EGP','INR'].map(c =>
                      <Option key={c} value={c}>{c}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Start Date" name="startDate">
                  <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="End Date" name="endDate">
                  <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="Cash Account" name="cashAccountDesc">
              <Input placeholder="e.g. 01-100-1010-000 (GL account segments)" />
            </Form.Item>
            <Form.Item label="Comments" name="comments">
              <Input.TextArea rows={3} placeholder="Optional notes" />
            </Form.Item>
            <Divider />
            <Space>
              <Button type="primary" htmlType="submit" loading={saveLoading}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>
                Save Register
              </Button>
              <Button onClick={() => { setCreateTabOpen(false); setActiveTab('search'); registerForm.resetFields(); }}>
                Cancel
              </Button>
            </Space>
          </Form>
        </div>
      ),
    }] : []),

    // Dynamic register detail tabs
    ...openTabs.map((tab) => ({
      key: tab.key,
      label: (
        <Space size={4}>
          <WalletOutlined style={{ color: REDWOOD.success }} />
          <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
            {tab.register.registerName}
          </span>
        </Space>
      ),
      closable: true,
      children: (
        <div style={{ padding: '12px 0' }}>
          {/* Register header bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <Title level={5} style={{ margin: 0 }}>{tab.register.registerName}</Title>
              <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>
                Register #{tab.register.registerId} &nbsp;·&nbsp;
                <StatusTag status={tab.register.status} />
              </Text>
            </div>
            <Space>
              <Button size="small" icon={<ReloadOutlined />}
                onClick={() => refreshTab(tab.key)}>
                Refresh
              </Button>
              <Button size="small" icon={<EditOutlined />} disabled>
                Edit Header
              </Button>
            </Space>
          </div>
          <RegisterDetail
            tab={tab}
            onRefresh={() => refreshTab(tab.key)}
            currentUser={currentUser}
          />
        </div>
      ),
    })),
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: REDWOOD.neutral100 }}>
      <Content style={{ padding: '16px 24px' }}>
        <Breadcrumb
          style={{ marginBottom: 12 }}
          items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: 'Petty Cash' },
            { title: 'Registers' },
          ]}
        />

        <Card style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
          styles={{ body: { padding: 0 } }}>
          <Tabs
            type="editable-card"
            activeKey={activeTab}
            onChange={setActiveTab}
            hideAdd
            onEdit={(key, action) => { if (action === 'remove') closeTab(key as string); }}
            style={{ padding: '0 16px' }}
            tabBarStyle={{ marginBottom: 0 }}
            tabBarExtraContent={
              <div style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
                <WalletOutlined style={{ color: REDWOOD.success }} />
                <Text style={{ fontWeight: 600, color: REDWOOD.neutral900, fontSize: 14 }}>
                  Petty Cash Registers
                </Text>
                <ApiDocsModal title="Petty Cash" endpoints={PC_API_ENDPOINTS} />
              </div>
            }
            items={tabItems}
          />
        </Card>
      </Content>
      <FloatingMenu />
    </Layout>
  );
};

export default PettyCash;
