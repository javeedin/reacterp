import React, { useState, useCallback, useRef } from 'react';
import {
  Layout, Card, Form, Input, Button, Space, Typography, Table, Tabs,
  Row, Col, Breadcrumb, Tooltip, message, Tag, Spin, Descriptions,
  Badge, Divider, Statistic, Empty, Alert,
} from 'antd';
import {
  HomeOutlined, SearchOutlined, ReloadOutlined,
  UserOutlined, PhoneOutlined, MailOutlined, BankOutlined,
  FileTextOutlined, DollarOutlined, CloseOutlined, InfoCircleOutlined,
  EnvironmentOutlined, IdcardOutlined, DownloadOutlined, ApiOutlined, CopyOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import * as XLSX from 'xlsx';
import FloatingMenu from '../../components/FloatingMenu';
import { APEX_DB_CONFIG } from '../../config/api.config';

const { Content } = Layout;
const { Title, Text } = Typography;

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

const BASE = APEX_DB_CONFIG.baseUrl;

// ── Types ────────────────────────────────────────────────────────────────────

interface CustomerRow {
  key: string;
  billToSiteUseId: number;
  billToSiteNumber: string;
  billToSiteAddress: string;
  accountNumber: string;
  customerName: string;
  taxRegistrationNumber: string;
  totalOpenReceivables: number;
  totalTransactionsDue: number;
  syncDate: string;
}

interface ReceiptRow {
  key: string;
  standardReceiptId: number;
  receiptNumber: string;
  receiptDate: string;
  amount: number;
  unappliedAmount: number;
  currency: string;
  state: string;
  accountingStatus: string;
  receiptMethod: string;
  businessUnit: string;
}

interface InvoiceRow {
  key: string;
  customerTransactionId: number;
  transactionNumber: string;
  transactionDate: string;
  dueDate: string;
  amount: number;
  balanceDue: number;
  currency: string;
  status: string;
  businessUnit: string;
}

interface CustomerTab {
  key: string;
  customer: CustomerRow;
  receiptsLoading: boolean;
  receipts: ReceiptRow[];
  invoicesLoading: boolean;
  invoices: InvoiceRow[];
  receiptsLoaded: boolean;
  invoicesLoaded: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number, currency = 'AED') =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n ?? 0);

const fmtDate = (s: string) => {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const stateColor = (s: string) => {
  const m: Record<string, string> = {
    APPROVED: 'green', POSTED: 'green', APPLIED: 'green',
    UNIDENTIFIED: 'orange', UNAPPLIED: 'orange',
    REVERSED: 'red', NSF: 'red', STOP_PAYMENT: 'red',
  };
  return m[s?.toUpperCase()] ?? 'default';
};

// ── Component ─────────────────────────────────────────────────────────────────

const ManageCustomers: React.FC = () => {
  const [form] = Form.useForm();

  // Search state
  const [searching, setSearching]     = useState(false);
  const [customers, setCustomers]     = useState<CustomerRow[]>([]);
  const [searched, setSearched]       = useState(false);
  const [lastUrl, setLastUrl]         = useState('');   // last search endpoint (for API icon)
  const [searchError, setSearchError] = useState('');   // last search error (shown as alert)

  // Tabs state
  const [tabs, setTabs]               = useState<CustomerTab[]>([]);
  const [activeKey, setActiveKey]     = useState<string>('search');

  const loadedRef = useRef<Set<string>>(new Set());

  // ── Search ────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async (values: any) => {
    setSearching(true);
    setSearched(false);
    setSearchError('');
    const p = new URLSearchParams();
    if (values.customerName) p.append('customer_name', values.customerName);
    if (values.accountNumber) p.append('account_number', values.accountNumber);
    if (values.taxNumber) p.append('tax_number', values.taxNumber);
    const url = `${BASE}/ar/customer-site-activities?${p}`;
    setLastUrl(url);
    try {
      const res  = await fetch(url, { headers: { Accept: 'application/json' } });
      const raw  = await res.text();
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { /* non-JSON error body */ }
      if (!res.ok) {
        throw new Error(data?.message || data?.error || `HTTP ${res.status} — ${raw.slice(0, 300) || res.statusText}`);
      }
      const items: any[] = data.items ?? data.rows ?? (Array.isArray(data) ? data : []);
      setCustomers(items.map((r: any, i: number) => ({
        key: String(r.bill_to_site_use_id ?? r.BILL_TO_SITE_USE_ID ?? i),
        billToSiteUseId:       r.bill_to_site_use_id       ?? r.BILL_TO_SITE_USE_ID       ?? 0,
        billToSiteNumber:      r.bill_to_site_number       ?? r.BILL_TO_SITE_NUMBER        ?? '',
        billToSiteAddress:     r.bill_to_site_address      ?? r.BILL_TO_SITE_ADDRESS       ?? '',
        accountNumber:         r.account_number            ?? r.ACCOUNT_NUMBER             ?? '',
        customerName:          r.customer_name             ?? r.CUSTOMER_NAME              ?? '',
        taxRegistrationNumber: r.tax_registration_number   ?? r.TAX_REGISTRATION_NUMBER    ?? '',
        totalOpenReceivables:  Number(r.total_open_receivables_for_site ?? r.TOTAL_OPEN_RECEIVABLES_FOR_SITE ?? 0),
        totalTransactionsDue:  Number(r.total_transactions_due_for_site ?? r.TOTAL_TRANSACTIONS_DUE_FOR_SITE ?? 0),
        syncDate:              r.sync_date                 ?? r.SYNC_DATE                  ?? '',
      })));
      setSearched(true);
    } catch (e: any) {
      setSearchError(e.message || String(e));
      setSearched(true);
      message.error('Search failed: ' + e.message);
    } finally {
      setSearching(false);
    }
  }, []);

  // ── Open customer tab ─────────────────────────────────────────────────────

  const openCustomerTab = useCallback((customer: CustomerRow) => {
    const key = `cust-${customer.billToSiteUseId}`;
    const existing = tabs.find(t => t.key === key);
    if (existing) { setActiveKey(key); return; }

    const newTab: CustomerTab = {
      key, customer,
      receiptsLoading: false, receipts: [], receiptsLoaded: false,
      invoicesLoading: false,  invoices: [], invoicesLoaded:  false,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveKey(key);
  }, [tabs]);

  // ── Load receipts for a tab ───────────────────────────────────────────────

  const loadReceipts = useCallback(async (tabKey: string, customer: CustomerRow) => {
    if (loadedRef.current.has(`rcpt-${tabKey}`)) return;
    loadedRef.current.add(`rcpt-${tabKey}`);

    setTabs(prev => prev.map(t => t.key === tabKey ? { ...t, receiptsLoading: true } : t));
    try {
      const p = new URLSearchParams({ customer: customer.accountNumber, limit: '200' });
      const res  = await fetch(`${BASE}/ar/receipts?${p}`);
      const data = await res.json();
      const items: any[] = data.items ?? data.rows ?? (Array.isArray(data) ? data : []);
      const rows: ReceiptRow[] = items.map((r: any, i: number) => ({
        key: String(r.standard_receipt_id ?? i),
        standardReceiptId: r.standard_receipt_id ?? 0,
        receiptNumber:     r.receipt_number     ?? '',
        receiptDate:       r.receipt_date        ?? '',
        amount:            Number(r.amount        ?? 0),
        unappliedAmount:   Number(r.unapplied_amount ?? 0),
        currency:          r.currency            ?? '',
        state:             r.state               ?? '',
        accountingStatus:  r.accounting_status   ?? '',
        receiptMethod:     r.receipt_method       ?? '',
        businessUnit:      r.business_unit        ?? '',
      }));
      setTabs(prev => prev.map(t => t.key === tabKey ? { ...t, receiptsLoading: false, receipts: rows, receiptsLoaded: true } : t));
    } catch {
      loadedRef.current.delete(`rcpt-${tabKey}`);
      setTabs(prev => prev.map(t => t.key === tabKey ? { ...t, receiptsLoading: false } : t));
    }
  }, []);

  // ── Load invoices for a tab ───────────────────────────────────────────────

  const loadInvoices = useCallback(async (tabKey: string, customer: CustomerRow) => {
    if (loadedRef.current.has(`inv-${tabKey}`)) return;
    loadedRef.current.add(`inv-${tabKey}`);

    setTabs(prev => prev.map(t => t.key === tabKey ? { ...t, invoicesLoading: true } : t));
    try {
      const p = new URLSearchParams({ bill_to_customer: customer.accountNumber, limit: '200' });
      const res  = await fetch(`${BASE}/ar/invoices?${p}`);
      const data = await res.json();
      const items: any[] = data.items ?? data.rows ?? (Array.isArray(data) ? data : []);
      const rows: InvoiceRow[] = items.map((r: any, i: number) => ({
        key: String(r.customer_transaction_id ?? i),
        customerTransactionId: r.customer_transaction_id ?? 0,
        transactionNumber:     r.transaction_number      ?? '',
        transactionDate:       r.transaction_date        ?? '',
        dueDate:               r.due_date                ?? '',
        amount:                Number(r.amount           ?? 0),
        balanceDue:            Number(r.balance_due      ?? 0),
        currency:              r.currency                ?? '',
        status:                r.status                  ?? '',
        businessUnit:          r.business_unit           ?? '',
      }));
      setTabs(prev => prev.map(t => t.key === tabKey ? { ...t, invoicesLoading: false, invoices: rows, invoicesLoaded: true } : t));
    } catch {
      loadedRef.current.delete(`inv-${tabKey}`);
      setTabs(prev => prev.map(t => t.key === tabKey ? { ...t, invoicesLoading: false } : t));
    }
  }, []);

  // ── Close tab ─────────────────────────────────────────────────────────────

  const closeTab = (key: string) => {
    const idx = tabs.findIndex(t => t.key === key);
    const nextKey = idx > 0 ? tabs[idx - 1].key : 'search';
    setTabs(prev => prev.filter(t => t.key !== key));
    loadedRef.current.delete(`rcpt-${key}`);
    loadedRef.current.delete(`inv-${key}`);
    if (activeKey === key) setActiveKey(nextKey);
  };

  // ── Export ────────────────────────────────────────────────────────────────

  const exportXlsx = () => {
    const ws = XLSX.utils.json_to_sheet(customers.map(r => ({
      'Customer Name':         r.customerName,
      'Account Number':        r.accountNumber,
      'Site Number':           r.billToSiteNumber,
      'Address':               r.billToSiteAddress,
      'Tax Reg No':            r.taxRegistrationNumber,
      'Open Receivables':      r.totalOpenReceivables,
      'Transactions Due':      r.totalTransactionsDue,
      'Sync Date':             r.syncDate,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Customers');
    XLSX.writeFile(wb, 'customers.xlsx');
  };

  // ── Search columns ────────────────────────────────────────────────────────

  const searchColumns: ColumnsType<CustomerRow> = [
    {
      title: 'Customer Name',
      dataIndex: 'customerName',
      key: 'customerName',
      fixed: 'left',
      width: 240,
      render: (v: string, r: CustomerRow) => (
        <Button type="link" style={{ padding: 0, textAlign: 'left', height: 'auto', fontSize: 13, fontWeight: 600, color: REDWOOD.info }}
          onClick={() => openCustomerTab(r)}>
          {v || '—'}
        </Button>
      ),
    },
    { title: 'Account #', dataIndex: 'accountNumber', width: 130,
      render: (v: string) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Site #', dataIndex: 'billToSiteNumber', width: 100,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Address', dataIndex: 'billToSiteAddress', width: 260, ellipsis: true,
      render: (v: string) => <Tooltip title={v}><Text style={{ fontSize: 12 }}>{v || '—'}</Text></Tooltip> },
    { title: 'Tax Reg #', dataIndex: 'taxRegistrationNumber', width: 140,
      render: (v: string) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Open Receivables', dataIndex: 'totalOpenReceivables', width: 150, align: 'right' as const,
      sorter: (a, b) => a.totalOpenReceivables - b.totalOpenReceivables,
      render: (v: number) => (
        <Text style={{ fontFamily: 'monospace', fontSize: 12, color: v > 0 ? REDWOOD.primary : REDWOOD.success, fontWeight: 600 }}>
          {fmt(v)}
        </Text>
      ) },
    { title: 'Transactions Due', dataIndex: 'totalTransactionsDue', width: 150, align: 'right' as const,
      sorter: (a, b) => a.totalTransactionsDue - b.totalTransactionsDue,
      render: (v: number) => (
        <Text style={{ fontFamily: 'monospace', fontSize: 12, color: v > 0 ? REDWOOD.warning : REDWOOD.neutral600 }}>
          {fmt(v)}
        </Text>
      ) },
    { title: 'Sync Date', dataIndex: 'syncDate', width: 140,
      render: (v: string) => <Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{v || '—'}</Text> },
    {
      title: '',
      key: 'open',
      width: 70,
      fixed: 'right',
      render: (_: any, r: CustomerRow) => (
        <Button size="small" icon={<FileTextOutlined />} onClick={() => openCustomerTab(r)}
          style={{ fontSize: 11 }}>
          Open
        </Button>
      ),
    },
  ];

  // ── Receipt columns ───────────────────────────────────────────────────────

  const receiptColumns: ColumnsType<ReceiptRow> = [
    { title: 'Receipt #', dataIndex: 'receiptNumber', width: 160,
      render: (v: string) => <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: REDWOOD.info }}>{v}</Text> },
    { title: 'Date', dataIndex: 'receiptDate', width: 110, render: fmtDate },
    { title: 'Amount', dataIndex: 'amount', width: 140, align: 'right' as const,
      render: (v: number, r: ReceiptRow) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmt(v, r.currency)}</Text> },
    { title: 'Unapplied', dataIndex: 'unappliedAmount', width: 140, align: 'right' as const,
      render: (v: number, r: ReceiptRow) => (
        <Text style={{ fontFamily: 'monospace', fontSize: 12, color: v > 0 ? REDWOOD.warning : REDWOOD.neutral600 }}>
          {fmt(v, r.currency)}
        </Text>
      ) },
    { title: 'Method', dataIndex: 'receiptMethod', width: 130,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'State', dataIndex: 'state', width: 110,
      render: (v: string) => <Tag color={stateColor(v)} style={{ fontSize: 11 }}>{v || '—'}</Tag> },
    { title: 'Accounting', dataIndex: 'accountingStatus', width: 110,
      render: (v: string) => <Tag color={v === 'Accounted' ? 'green' : 'orange'} style={{ fontSize: 11 }}>{v || 'Unaccounted'}</Tag> },
    { title: 'Business Unit', dataIndex: 'businessUnit', width: 160,
      render: (v: string) => <Text style={{ fontSize: 11 }}>{v || '—'}</Text> },
  ];

  // ── Invoice columns ───────────────────────────────────────────────────────

  const invoiceColumns: ColumnsType<InvoiceRow> = [
    { title: 'Transaction #', dataIndex: 'transactionNumber', width: 160,
      render: (v: string) => <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: REDWOOD.info }}>{v}</Text> },
    { title: 'Txn Date', dataIndex: 'transactionDate', width: 110, render: fmtDate },
    { title: 'Due Date', dataIndex: 'dueDate', width: 110, render: fmtDate },
    { title: 'Amount', dataIndex: 'amount', width: 140, align: 'right' as const,
      render: (v: number, r: InvoiceRow) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmt(v, r.currency)}</Text> },
    { title: 'Balance Due', dataIndex: 'balanceDue', width: 140, align: 'right' as const,
      render: (v: number, r: InvoiceRow) => (
        <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600,
          color: v > 0 ? REDWOOD.primary : REDWOOD.success }}>
          {fmt(v, r.currency)}
        </Text>
      ) },
    { title: 'Status', dataIndex: 'status', width: 110,
      render: (v: string) => <Tag color={v === 'OPEN' ? 'orange' : v === 'CLOSED' ? 'green' : 'default'} style={{ fontSize: 11 }}>{v || '—'}</Tag> },
    { title: 'Business Unit', dataIndex: 'businessUnit', width: 160,
      render: (v: string) => <Text style={{ fontSize: 11 }}>{v || '—'}</Text> },
  ];

  // ── Customer detail panel ─────────────────────────────────────────────────

  const renderCustomerDetail = (tab: CustomerTab) => {
    const c = tab.customer;
    return (
      <div style={{ padding: '0 4px' }}>
        {/* Summary cards */}
        <Row gutter={16} style={{ marginBottom: 20 }}>
          <Col span={8}>
            <Card size="small" style={{ borderRadius: 8, background: '#f6ffed', border: '1px solid #b7eb8f' }}>
              <Statistic
                title={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Open Receivables</Text>}
                value={c.totalOpenReceivables}
                precision={2}
                prefix="AED"
                valueStyle={{ fontSize: 18, fontWeight: 700, color: REDWOOD.primary }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" style={{ borderRadius: 8, background: '#fffbe6', border: '1px solid #ffe58f' }}>
              <Statistic
                title={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Transactions Due</Text>}
                value={c.totalTransactionsDue}
                precision={2}
                prefix="AED"
                valueStyle={{ fontSize: 18, fontWeight: 700, color: REDWOOD.warning }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" style={{ borderRadius: 8, background: REDWOOD.neutral100, border: `1px solid ${REDWOOD.border}` }}>
              <Statistic
                title={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Receipts Loaded</Text>}
                value={tab.receipts.length}
                valueStyle={{ fontSize: 18, fontWeight: 700, color: REDWOOD.info }}
              />
            </Card>
          </Col>
        </Row>

        {/* Customer info */}
        <Descriptions
          size="small"
          bordered
          column={2}
          style={{ marginBottom: 20, borderRadius: 6, overflow: 'hidden' }}
          labelStyle={{ background: REDWOOD.neutral100, fontWeight: 600, fontSize: 12, width: 160 }}
          contentStyle={{ fontSize: 12 }}
        >
          <Descriptions.Item label={<Space size={4}><UserOutlined />Customer Name</Space>} span={2}>
            <Text strong style={{ fontSize: 13 }}>{c.customerName}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={<Space size={4}><IdcardOutlined />Account Number</Space>}>
            <Text style={{ fontFamily: 'monospace' }}>{c.accountNumber || '—'}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={<Space size={4}><BankOutlined />Tax Reg #</Space>}>
            <Text style={{ fontFamily: 'monospace' }}>{c.taxRegistrationNumber || '—'}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={<Space size={4}><InfoCircleOutlined />Site Number</Space>}>
            {c.billToSiteNumber || '—'}
          </Descriptions.Item>
          <Descriptions.Item label={<Space size={4}><EnvironmentOutlined />Site Address</Space>}>
            {c.billToSiteAddress || '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Sync Date" span={2}>
            <Text style={{ color: REDWOOD.neutral600, fontSize: 11 }}>{c.syncDate || '—'}</Text>
          </Descriptions.Item>
        </Descriptions>

        {/* Sub-tabs: Receipts / Invoices */}
        <Tabs
          size="small"
          onChange={subKey => {
            if (subKey === 'receipts' && !tab.receiptsLoaded) loadReceipts(tab.key, c);
            if (subKey === 'invoices' && !tab.invoicesLoaded)  loadInvoices(tab.key, c);
          }}
          items={[
            {
              key: 'receipts',
              label: (
                <Space size={4}>
                  <DollarOutlined />
                  Receipts
                  {tab.receiptsLoaded && <Badge count={tab.receipts.length} style={{ backgroundColor: REDWOOD.info }} />}
                </Space>
              ),
              children: (
                tab.receiptsLoading
                  ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
                  : tab.receiptsLoaded
                    ? tab.receipts.length === 0
                      ? <Empty description="No receipts found for this customer" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                      : <Table
                          dataSource={tab.receipts}
                          columns={receiptColumns}
                          size="small"
                          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} receipts` }}
                          scroll={{ x: 'max-content' }}
                        />
                    : (
                      <div style={{ textAlign: 'center', padding: 40 }}>
                        <Button icon={<DollarOutlined />} onClick={() => loadReceipts(tab.key, c)}>
                          Load Receipts
                        </Button>
                      </div>
                    )
              ),
            },
            {
              key: 'invoices',
              label: (
                <Space size={4}>
                  <FileTextOutlined />
                  Invoices
                  {tab.invoicesLoaded && <Badge count={tab.invoices.length} style={{ backgroundColor: REDWOOD.success }} />}
                </Space>
              ),
              children: (
                tab.invoicesLoading
                  ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
                  : tab.invoicesLoaded
                    ? tab.invoices.length === 0
                      ? <Empty description="No invoices found for this customer" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                      : <Table
                          dataSource={tab.invoices}
                          columns={invoiceColumns}
                          size="small"
                          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} invoices` }}
                          scroll={{ x: 'max-content' }}
                        />
                    : (
                      <div style={{ textAlign: 'center', padding: 40 }}>
                        <Button icon={<FileTextOutlined />} onClick={() => loadInvoices(tab.key, c)}>
                          Load Invoices
                        </Button>
                      </div>
                    )
              ),
            },
          ]}
        />
      </div>
    );
  };

  // ── Tab items ─────────────────────────────────────────────────────────────

  const tabItems = [
    {
      key: 'search',
      label: <Space size={4}><SearchOutlined />Customers</Space>,
      children: (
        <div style={{ padding: '0 4px' }}>
          {/* Search form */}
          <Card
            size="small"
            style={{ marginBottom: 16, borderRadius: 8, border: `1px solid ${REDWOOD.border}` }}
            bodyStyle={{ padding: '16px 20px 8px' }}
          >
            <Form form={form} layout="inline" onFinish={handleSearch}
              initialValues={{ customerName: '', accountNumber: '', taxNumber: '' }}>
              <Form.Item name="customerName" style={{ marginBottom: 8 }}>
                <Input
                  prefix={<UserOutlined style={{ color: REDWOOD.neutral600 }} />}
                  placeholder="Customer name"
                  style={{ width: 260 }}
                  allowClear
                />
              </Form.Item>
              <Form.Item name="accountNumber" style={{ marginBottom: 8 }}>
                <Input
                  prefix={<IdcardOutlined style={{ color: REDWOOD.neutral600 }} />}
                  placeholder="Account number"
                  style={{ width: 200 }}
                  allowClear
                />
              </Form.Item>
              <Form.Item name="taxNumber" style={{ marginBottom: 8 }}>
                <Input
                  prefix={<BankOutlined style={{ color: REDWOOD.neutral600 }} />}
                  placeholder="Tax reg number"
                  style={{ width: 200 }}
                  allowClear
                />
              </Form.Item>
              <Form.Item style={{ marginBottom: 8 }}>
                <Space>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<SearchOutlined />}
                    loading={searching}
                    style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                  >
                    Search
                  </Button>
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={() => { form.resetFields(); setCustomers([]); setSearched(false); }}
                  >
                    Reset
                  </Button>
                  {customers.length > 0 && (
                    <Button icon={<DownloadOutlined />} onClick={exportXlsx}>
                      Export
                    </Button>
                  )}
                  <Tooltip
                    title={
                      <div style={{ maxWidth: 460 }}>
                        <div style={{ fontSize: 11, marginBottom: 4, opacity: 0.85 }}>Customer search endpoint:</div>
                        <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#fff', wordBreak: 'break-all' }}>
                          GET {lastUrl || `${BASE}/ar/customer-site-activities?customer_name=&account_number=&tax_number=`}
                        </div>
                        <div style={{ fontSize: 10, marginTop: 6, opacity: 0.75 }}>Click to copy</div>
                      </div>
                    }>
                    <Button
                      type="text"
                      icon={<ApiOutlined style={{ color: REDWOOD.info }} />}
                      onClick={() => {
                        const u = lastUrl || `${BASE}/ar/customer-site-activities`;
                        navigator.clipboard.writeText(u);
                        message.success('Endpoint URL copied');
                      }}
                    />
                  </Tooltip>
                </Space>
              </Form.Item>
            </Form>
            {searchError && (
              <Alert
                type="error"
                showIcon
                style={{ marginTop: 4 }}
                message="Customer search failed"
                description={
                  <div>
                    <div style={{ marginBottom: 6 }}>{searchError}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', color: REDWOOD.neutral600 }}>
                      GET {lastUrl}
                    </div>
                    <Button size="small" type="link" icon={<CopyOutlined />} style={{ paddingLeft: 0 }}
                      onClick={() => { navigator.clipboard.writeText(lastUrl); message.success('URL copied'); }}>
                      Copy URL
                    </Button>
                  </div>
                }
              />
            )}
          </Card>

          {/* Results */}
          {!searched && !searching && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: REDWOOD.neutral600 }}>
              <UserOutlined style={{ fontSize: 48, color: REDWOOD.neutral200, display: 'block', marginBottom: 12 }} />
              <Text type="secondary">Enter search criteria and click Search to find customers</Text>
            </div>
          )}

          {searched && (
            <Card
              size="small"
              style={{ borderRadius: 8, border: `1px solid ${REDWOOD.border}` }}
              bodyStyle={{ padding: 0 }}
              title={
                <Space>
                  <UserOutlined style={{ color: REDWOOD.primary }} />
                  <span style={{ fontWeight: 600 }}>
                    {customers.length} customer{customers.length !== 1 ? 's' : ''} found
                  </span>
                </Space>
              }
            >
              <Table
                dataSource={customers}
                columns={searchColumns}
                size="small"
                loading={searching}
                scroll={{ x: 'max-content' }}
                pagination={{
                  pageSize: 25,
                  showSizeChanger: true,
                  pageSizeOptions: ['10', '25', '50', '100'],
                  showTotal: (total, [start, end]) => `${start}–${end} of ${total}`,
                }}
                onRow={(r) => ({
                  onDoubleClick: () => openCustomerTab(r),
                  style: { cursor: 'pointer' },
                })}
              />
            </Card>
          )}
        </div>
      ),
    },
    ...tabs.map((tab) => ({
      key: tab.key,
      label: (
        <Space size={4} style={{ maxWidth: 200, overflow: 'hidden' }}>
          <UserOutlined />
          <span style={{ fontSize: 13, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
            {tab.customer.customerName}
          </span>
          <CloseOutlined
            style={{ fontSize: 10, color: REDWOOD.neutral600, marginLeft: 2 }}
            onClick={(e) => { e.stopPropagation(); closeTab(tab.key); }}
          />
        </Space>
      ),
      children: renderCustomerDetail(tab),
    })),
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Layout style={{ minHeight: '100vh', background: REDWOOD.neutral100 }}>
      <Content style={{ padding: '16px 24px' }}>
        {/* Breadcrumb */}
        <Breadcrumb style={{ marginBottom: 12 }}>
          <Breadcrumb.Item><Link to="/"><HomeOutlined /></Link></Breadcrumb.Item>
          <Breadcrumb.Item>Accounts Receivable</Breadcrumb.Item>
          <Breadcrumb.Item>Manage Customers</Breadcrumb.Item>
        </Breadcrumb>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 12 }}>
          <UserOutlined style={{ fontSize: 22, color: REDWOOD.primary }} />
          <Title level={4} style={{ margin: 0, color: REDWOOD.primary }}>
            Manage Customers
          </Title>
          {tabs.length > 0 && (
            <Badge count={tabs.length} style={{ backgroundColor: REDWOOD.info }}
              title={`${tabs.length} customer tab${tabs.length > 1 ? 's' : ''} open`} />
          )}
        </div>

        {/* Main tabs */}
        <Card
          bodyStyle={{ padding: '0 0 16px' }}
          style={{ borderRadius: 8, border: `1px solid ${REDWOOD.border}` }}
        >
          <Tabs
            activeKey={activeKey}
            onChange={key => {
              setActiveKey(key);
              // Auto-load receipts when switching to a customer tab for the first time
              const tab = tabs.find(t => t.key === key);
              if (tab && !tab.receiptsLoaded && !tab.receiptsLoading) {
                loadReceipts(tab.key, tab.customer);
              }
            }}
            type="card"
            size="small"
            style={{ padding: '8px 16px 0' }}
            items={tabItems}
          />
        </Card>
      </Content>
      <FloatingMenu />
    </Layout>
  );
};

export default ManageCustomers;
