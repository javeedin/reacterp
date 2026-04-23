import React, { useState, useCallback, useEffect } from 'react';
import dayjs from 'dayjs';
import {
  Layout, Card, Form, Select, Input, Button, Space, Typography,
  Table, Tag, Row, Col, Breadcrumb, Tabs, Descriptions, Alert,
  Modal, message, Tooltip, Statistic, Spin,
} from 'antd';
import {
  HomeOutlined, SearchOutlined, ReloadOutlined, CalendarOutlined,
  CheckCircleOutlined, CloseOutlined, SyncOutlined, BookOutlined,
  FileTextOutlined, WarningOutlined, ApiOutlined, CopyOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { APEX_DB_CONFIG } from '../../config/api.config';
import {
  listMpaInvoices, getMpaSchedule, generateMpaSchedule, markPeriodPosted,
  type MpaInvoiceSummary, type MpaScheduleLine, type MpaInvoiceDetail,
} from '../../services/multiperiod.service';
import {
  createAccounting, fetchLedgerByBusinessUnit, getAccounting,
  type SlaCreatePayload, type SlaGetResult,
} from '../../services/sla.service';
import { useAuth } from '../../context/AuthContext';

const { Content } = Layout;
const { Text, Title } = Typography;
const { Option } = Select;

const REDWOOD = {
  primary: '#C74634',
  success: '#1D7B4D',
  warning: '#D4A800',
  info:    '#0572CE',
  neutral: '#F7F7F7',
};

const APEX_BU_URL = `${APEX_DB_CONFIG.baseUrl}/gl/businessunits`;

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtAmt = (v: number | null | undefined, currency = 'AED') =>
  v == null ? '—' : `${currency} ${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (s: string | null | undefined) =>
  s ? dayjs(s).format('DD MMM YYYY') : '—';

const currentPeriod = () => dayjs().format('MMM-YYYY');   // e.g. "Apr-2026"

const statusTag = (status: string) => {
  if (status === 'Posted')     return <Tag color="success" icon={<CheckCircleOutlined />}>Posted</Tag>;
  if (status === 'Not Posted') return <Tag color="warning" icon={<WarningOutlined />}>Not Posted</Tag>;
  if (status === 'Error')      return <Tag color="error">Error</Tag>;
  return <Tag>{status}</Tag>;
};

// ── types ─────────────────────────────────────────────────────────────────────

interface DetailTab {
  key:     string;
  invoiceId: number;
  label:   string;
  detail:  MpaInvoiceDetail | null;
  loading: boolean;
  error:   string | null;
}

// ── component ─────────────────────────────────────────────────────────────────

const ManageMultiperiod: React.FC = () => {
  const { user } = useAuth();
  const [form] = Form.useForm();

  const [activeTab,    setActiveTab]    = useState('search');
  const [detailTabs,   setDetailTabs]   = useState<DetailTab[]>([]);
  const [searchResult, setSearchResult] = useState<MpaInvoiceSummary[]>([]);
  const [searching,    setSearching]    = useState(false);
  const [searchErr,    setSearchErr]    = useState<string | null>(null);
  const [businessUnits, setBusinessUnits] = useState<string[]>([]);
  const [generating,   setGenerating]   = useState<Set<number>>(new Set());
  const [postingTab,   setPostingTab]   = useState<string | null>(null);
  const [confirmOpen,  setConfirmOpen]  = useState(false);
  const [confirmTab,   setConfirmTab]   = useState<string | null>(null);
  const [apiModalOpen,       setApiModalOpen]       = useState(false);
  const [lastApiUrl,         setLastApiUrl]         = useState<string | null>(null);
  const [lastApiStatus,      setLastApiStatus]      = useState<'success' | 'error' | null>(null);
  const [lastApiNote,        setLastApiNote]        = useState<string | null>(null);
  const [copiedUrl,          setCopiedUrl]          = useState(false);
  const [acctModalOpen,      setAcctModalOpen]      = useState(false);
  const [acctModalInvoiceId, setAcctModalInvoiceId] = useState<number | null>(null);
  const [acctData,           setAcctData]           = useState<SlaGetResult | null>(null);
  const [acctLoading,        setAcctLoading]        = useState(false);

  // Load business units
  useEffect(() => {
    fetch(APEX_BU_URL, { headers: { Accept: 'application/json' } })
      .then(r => r.json())
      .then(d => setBusinessUnits((d?.items ?? []).map((i: any) => i.business_unit_name).filter(Boolean)))
      .catch(() => {});
  }, []);

  // ── search ────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    const vals = form.getFieldsValue();
    setSearching(true);
    setSearchErr(null);

    // Build URL for debug display
    const BASE_URL = `${APEX_DB_CONFIG.baseUrl}/ap/multiperiod`;
    const q = new URLSearchParams();
    if (vals.invoiceNumber) q.set('invoice_number', vals.invoiceNumber);
    if (vals.supplier)      q.set('supplier',       vals.supplier);
    if (vals.businessUnit)  q.set('business_unit',  vals.businessUnit);
    if (vals.postingStatus) q.set('posting_status', vals.postingStatus);
    const calledUrl = q.toString() ? `${BASE_URL}?${q.toString()}` : BASE_URL;
    setLastApiUrl(calledUrl);

    try {
      const rows = await listMpaInvoices({
        invoiceNumber: vals.invoiceNumber || undefined,
        supplier:      vals.supplier      || undefined,
        businessUnit:  vals.businessUnit  || undefined,
        postingStatus: vals.postingStatus || undefined,
      });
      setSearchResult(rows);
      setLastApiStatus('success');
      setLastApiNote(`${rows.length} invoice(s) returned`);
    } catch (e: any) {
      setSearchErr(e?.message ?? 'Search failed');
      setLastApiStatus('error');
      setLastApiNote(e?.message ?? 'Unknown error');
    }
    setSearching(false);
  }, [form]);

  const handleReset = () => { form.resetFields(); setSearchResult([]); setSearchErr(null); };

  // ── open detail tab ───────────────────────────────────────────────────────

  const openDetail = useCallback(async (row: MpaInvoiceSummary) => {
    const tabKey = `inv-${row.invoiceId}`;
    const existing = detailTabs.find(t => t.key === tabKey);
    if (existing) { setActiveTab(tabKey); return; }

    const newTab: DetailTab = {
      key: tabKey, invoiceId: row.invoiceId,
      label: row.invoiceNumber, detail: null, loading: true, error: null,
    };
    setDetailTabs(prev => [...prev, newTab]);
    setActiveTab(tabKey);

    try {
      const detail = await getMpaSchedule(row.invoiceId);
      setDetailTabs(prev => prev.map(t => t.key === tabKey ? { ...t, detail, loading: false } : t));
    } catch (e: any) {
      setDetailTabs(prev => prev.map(t => t.key === tabKey ? { ...t, loading: false, error: e?.message ?? 'Failed to load' } : t));
    }
  }, [detailTabs]);

  const closeTab = (key: string) => {
    setDetailTabs(prev => prev.filter(t => t.key !== key));
    if (activeTab === key) setActiveTab('search');
  };

  // ── refresh detail ────────────────────────────────────────────────────────

  const refreshDetail = useCallback(async (tabKey: string, invoiceId: number) => {
    setDetailTabs(prev => prev.map(t => t.key === tabKey ? { ...t, loading: true, error: null } : t));
    try {
      const detail = await getMpaSchedule(invoiceId);
      setDetailTabs(prev => prev.map(t => t.key === tabKey ? { ...t, detail, loading: false } : t));
    } catch (e: any) {
      setDetailTabs(prev => prev.map(t => t.key === tabKey ? { ...t, loading: false, error: e?.message ?? 'Failed' } : t));
    }
  }, []);

  // ── generate schedule ─────────────────────────────────────────────────────

  const handleGenerate = useCallback(async (invoiceId: number, tabKey?: string) => {
    setGenerating(prev => new Set([...prev, invoiceId]));
    try {
      await generateMpaSchedule(invoiceId);
      message.success('Schedule generated');
      if (tabKey) await refreshDetail(tabKey, invoiceId);
      else await handleSearch();
    } catch (e: any) {
      message.error(`Generate failed: ${e?.message}`);
    }
    setGenerating(prev => { const s = new Set(prev); s.delete(invoiceId); return s; });
  }, [handleSearch, refreshDetail]);

  // ── post current period ───────────────────────────────────────────────────

  const handlePostConfirm = async () => {
    if (!confirmTab) return;
    const tab = detailTabs.find(t => t.key === confirmTab);
    if (!tab?.detail) return;

    const period = currentPeriod();
    const linesToPost = (tab.detail.lines || []).filter(
      l => l.periodName === period && l.postingStatus === 'Not Posted',
    );
    if (linesToPost.length === 0) {
      message.warning(`No unposted lines for ${period}`);
      setConfirmOpen(false);
      return;
    }

    setConfirmOpen(false);
    setPostingTab(confirmTab);
    const postedBy = user?.name || user?.username || 'System';

    try {
      const ledger = await fetchLedgerByBusinessUnit(tab.detail.businessUnit);
      if (!ledger) throw new Error('Could not find ledger for Business Unit: ' + tab.detail.businessUnit);

      const currency = tab.detail.currencyCode || 'AED';
      const payload: SlaCreatePayload = {
        header: {
          moduleName:     'AP',
          sourceTable:    'RR_AP_INVOICE_MULTIPERIOD_SCHEDULE',
          sourceId:       tab.detail.invoiceId,
          sourceNumber:   `${tab.detail.invoiceNumber}_${period}`,
          sourceType:     'Multiperiod',
          eventTypeCode:  'MULTIPERIOD_ACCRUAL',
          eventDate:      dayjs().format('YYYY-MM-DD'),
          accountingDate: dayjs().format('YYYY-MM-DD'),
          periodName:     period,
          ledgerId:       ledger.ledgerId,
          ledgerName:     ledger.ledgerName,
          currencyCode:   currency,
          ledgerCurrency: ledger.ledgerName,
          exchangeRate:   1,
          businessUnit:   tab.detail.businessUnit,
          description:    `Multiperiod Accrual – ${tab.detail.invoiceNumber} – ${period}`,
          createdBy:      postedBy,
        },
        lines: linesToPost.flatMap((l, idx) => [
          {
            lineNumber:        idx * 2 + 1,
            lineType:          'DR',
            accountingClass:   'EXPENSE',
            accountCombination: l.chargeAccount || '',
            enteredDr:         l.periodAmount,
            enteredCr:         0,
            accountedDr:       l.periodAmount,
            accountedCr:       0,
            currencyCode:      currency,
            exchangeRate:      1,
            description:       `${l.description || 'Expense'} – ${period}`,
            sourceLineId:      l.scheduleId,
            sourceLineNumber:  l.lineNumber,
          },
          {
            lineNumber:        idx * 2 + 2,
            lineType:          'CR',
            accountingClass:   'ACCRUAL',
            accountCombination: l.accrualAccount || '',
            enteredDr:         0,
            enteredCr:         l.periodAmount,
            accountedDr:       0,
            accountedCr:       l.periodAmount,
            currencyCode:      currency,
            exchangeRate:      1,
            description:       `${l.description || 'Accrual'} – ${period}`,
            sourceLineId:      l.scheduleId,
            sourceLineNumber:  l.lineNumber,
          },
        ]),
      };

      const result = await createAccounting(payload);
      await markPeriodPosted(tab.detail.invoiceId, period, result.headerId, postedBy);
      message.success(`${period} accrual posted — SLA header #${result.headerId}`);
      await refreshDetail(confirmTab, tab.detail.invoiceId);
    } catch (e: any) {
      message.error(`Posting failed: ${e?.message}`);
    }
    setPostingTab(null);
  };

  const openPostConfirm = (tabKey: string) => {
    const tab = detailTabs.find(t => t.key === tabKey);
    if (!tab?.detail) return;

    const period = currentPeriod();

    // Validation 1: invoice must be posted
    const invStatus = tab.detail.invoiceAccountingStatus?.toUpperCase();
    if (!invStatus || invStatus !== 'POSTED') {
      Modal.error({
        title: 'Invoice Not Posted',
        content: (
          <span>
            The invoice must be <strong>accounted and posted</strong> before posting multiperiod
            accruals.
            {tab.detail.invoiceAccountingStatus
              ? ` Current accounting status: ${tab.detail.invoiceAccountingStatus}.`
              : ' No accounting entries found for this invoice.'}
            {' '}Use <em>Refresh</em> if the invoice was recently posted.
          </span>
        ),
      });
      return;
    }

    // Validation 2: current period only
    const currentLines = (tab.detail.lines || []).filter(
      l => l.periodName === period && l.postingStatus === 'Not Posted',
    );
    if (currentLines.length === 0) {
      Modal.error({
        title: 'Cannot Post Accrual',
        content: (
          <span>
            Multiperiod accruals can only be posted for the <strong>current period ({period})</strong>.
            No unposted lines were found for this period.
          </span>
        ),
      });
      return;
    }

    setConfirmTab(tabKey);
    setConfirmOpen(true);
  };

  // ── view accounting ───────────────────────────────────────────────────────

  const openAccountingModal = useCallback(async (invoiceId: number) => {
    setAcctModalInvoiceId(invoiceId);
    setAcctModalOpen(true);
    setAcctLoading(true);
    setAcctData(null);
    try {
      const result = await getAccounting('RR_AP_INVOICE_MULTIPERIOD_SCHEDULE', invoiceId);
      setAcctData(result);
    } catch (e: any) {
      message.error(`Failed to load accounting: ${e?.message}`);
      setAcctModalOpen(false);
    }
    setAcctLoading(false);
  }, []);

  // ── search columns ────────────────────────────────────────────────────────

  const searchColumns: ColumnsType<MpaInvoiceSummary> = [
    {
      title: 'Invoice Number',
      dataIndex: 'invoiceNumber',
      width: 160,
      render: (v, rec) => (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => openDetail(rec)}>{v}</Button>
      ),
    },
    { title: 'Supplier',       dataIndex: 'supplier',      ellipsis: true },
    { title: 'Business Unit',  dataIndex: 'businessUnit',  width: 180, ellipsis: true },
    {
      title: 'Invoice Date', dataIndex: 'invoiceDate', width: 110,
      render: v => <Text style={{ fontSize: 12 }}>{fmtDate(v)}</Text>,
    },
    {
      title: 'Period Range', width: 160,
      render: (_, rec) => (
        <Text style={{ fontSize: 12 }}>
          {fmtDate(rec.minPeriodDate)} – {fmtDate(rec.maxPeriodDate)}
        </Text>
      ),
    },
    {
      title: 'Not Posted', dataIndex: 'notPostedAmount', width: 120, align: 'right',
      render: (v, rec) => v > 0
        ? <Text type="warning" style={{ fontSize: 12 }}>{fmtAmt(v, rec.currencyCode)}</Text>
        : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    {
      title: 'Posted', dataIndex: 'postedAmount', width: 120, align: 'right',
      render: (v, rec) => v > 0
        ? <Text style={{ color: REDWOOD.success, fontSize: 12 }}>{fmtAmt(v, rec.currencyCode)}</Text>
        : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    {
      title: 'Actions', width: 160,
      render: (_, rec) => (
        <Space size={4}>
          <Button size="small" type="primary" onClick={() => openDetail(rec)}>View</Button>
          <Button
            size="small"
            icon={<SyncOutlined />}
            loading={generating.has(rec.invoiceId)}
            onClick={() => handleGenerate(rec.invoiceId)}
          >
            Regenerate
          </Button>
        </Space>
      ),
    },
  ];

  // ── detail schedule columns ───────────────────────────────────────────────

  const scheduleColumns: ColumnsType<MpaScheduleLine> = [
    {
      title: 'Period', dataIndex: 'periodName', width: 100,
      render: v => <Text strong>{v}</Text>,
    },
    { title: 'Line', dataIndex: 'lineNumber', width: 55, align: 'center' as const },
    { title: 'Description', dataIndex: 'description', ellipsis: true },
    {
      title: 'Original Amt', dataIndex: 'originalAmount', width: 130, align: 'right' as const,
      render: v => <Text style={{ fontSize: 12 }}>{fmtAmt(v)}</Text>,
    },
    {
      title: 'Period Amt', dataIndex: 'periodAmount', width: 130, align: 'right' as const,
      render: v => <Text strong style={{ fontSize: 12 }}>{fmtAmt(v)}</Text>,
    },
    {
      title: 'Charge A/C (Dr)', dataIndex: 'chargeAccount', width: 200, ellipsis: true,
      render: v => <Text code style={{ fontSize: 11 }}>{v || '—'}</Text>,
    },
    {
      title: 'Accrual A/C (Cr)', dataIndex: 'accrualAccount', width: 200, ellipsis: true,
      render: v => <Text code style={{ fontSize: 11 }}>{v || '—'}</Text>,
    },
    {
      title: 'Status', dataIndex: 'postingStatus', width: 120,
      render: v => statusTag(v),
    },
    {
      title: 'Posted By / Date', width: 150,
      render: (_, rec) => rec.postingStatus === 'Posted'
        ? <Text type="secondary" style={{ fontSize: 11 }}>{rec.postedBy}<br />{fmtDate(rec.postedDate)}</Text>
        : null,
    },
  ];

  // ── render detail tab content ─────────────────────────────────────────────

  const renderDetail = (tab: DetailTab) => {
    if (tab.loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /></div>;
    if (tab.error)   return <Alert type="error" showIcon message="Failed to load schedule" description={tab.error} style={{ margin: 24 }} />;
    if (!tab.detail) return null;

    const d = tab.detail;
    const period = currentPeriod();
    const currentLines = (d.lines || []).filter(l => l.periodName === period && l.postingStatus === 'Not Posted');
    const hasCurrentPeriod = currentLines.length > 0;
    const isPosting = postingTab === tab.key;
    const isInvoicePosted = d.invoiceAccountingStatus?.toUpperCase() === 'POSTED';
    const canPost = hasCurrentPeriod && isInvoicePosted;

    const postDisabledReason = !isInvoicePosted
      ? `Invoice must be Posted before posting accruals (current: ${d.invoiceAccountingStatus || 'Not Accounted'})`
      : !hasCurrentPeriod
      ? `No unposted lines for the current period (${period})`
      : undefined;

    const totalAmt      = d.lines.reduce((s, l) => s + (l.periodAmount || 0), 0);
    const postedAmt     = d.lines.filter(l => l.postingStatus === 'Posted').reduce((s, l) => s + l.periodAmount, 0);
    const notPostedAmt  = d.lines.filter(l => l.postingStatus === 'Not Posted').reduce((s, l) => s + l.periodAmount, 0);

    return (
      <div style={{ padding: '0 8px' }}>
        {/* Invoice header */}
        <Card size="small" style={{ marginBottom: 12 }}>
          <Descriptions size="small" column={5}>
            <Descriptions.Item label="Invoice Number">
              <Text strong>{d.invoiceNumber}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Invoice Date">{fmtDate(d.invoiceDate)}</Descriptions.Item>
            <Descriptions.Item label="Supplier">{d.supplier}</Descriptions.Item>
            <Descriptions.Item label="Business Unit">{d.businessUnit}</Descriptions.Item>
            <Descriptions.Item label="Invoice Accounting">
              {isInvoicePosted
                ? <Tag color="success" icon={<CheckCircleOutlined />}>Posted</Tag>
                : <Tag color="warning" icon={<WarningOutlined />}>{d.invoiceAccountingStatus || 'Not Accounted'}</Tag>
              }
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* Summary stats */}
        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic title="Total Schedule" value={totalAmt} precision={2} prefix={d.currencyCode} valueStyle={{ fontSize: 14 }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="Posted" value={postedAmt} precision={2} prefix={d.currencyCode} valueStyle={{ fontSize: 14, color: REDWOOD.success }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="Not Posted" value={notPostedAmt} precision={2} prefix={d.currencyCode} valueStyle={{ fontSize: 14, color: REDWOOD.warning }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="Periods" value={new Set(d.lines.map(l => l.periodName)).size} valueStyle={{ fontSize: 14 }} />
            </Card>
          </Col>
        </Row>

        {/* Action bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Space>
            <Button
              icon={<ReloadOutlined />}
              size="small"
              onClick={() => refreshDetail(tab.key, tab.invoiceId)}
            >
              Refresh
            </Button>
            <Button
              icon={<EyeOutlined />}
              size="small"
              onClick={() => openAccountingModal(tab.invoiceId)}
            >
              View Accounting
            </Button>
          </Space>

          <Tooltip title={postDisabledReason ?? `Create Dr Expense / Cr Accrual entries for ${period}`}>
            <Button
              type="primary"
              icon={<BookOutlined />}
              disabled={!canPost}
              loading={isPosting}
              onClick={() => openPostConfirm(tab.key)}
              style={{ background: canPost ? REDWOOD.primary : undefined }}
            >
              Post {period} Accrual
            </Button>
          </Tooltip>
        </div>

        {/* Schedule table */}
        <Table
          dataSource={d.lines}
          columns={scheduleColumns}
          rowKey="scheduleId"
          size="small"
          pagination={false}
          scroll={{ x: 1050 }}
          rowClassName={(rec) => rec.periodName === period && rec.postingStatus === 'Not Posted' ? 'ant-table-row-selected' : ''}
        />
      </div>
    );
  };

  // ── confirm modal lines preview ───────────────────────────────────────────

  const confirmModalLines = () => {
    if (!confirmTab) return [];
    const tab = detailTabs.find(t => t.key === confirmTab);
    return (tab?.detail?.lines || []).filter(l => l.periodName === currentPeriod() && l.postingStatus === 'Not Posted');
  };

  // ── tabs ──────────────────────────────────────────────────────────────────

  const tabItems = [
    {
      key:   'search',
      label: 'Manage Multiperiod Accounting',
      children: (
        <>
          {/* Search form */}
          <Card size="small" style={{ marginBottom: 12 }}>
            <Form form={form} layout="inline" size="small" onFinish={handleSearch}>
              <Form.Item name="invoiceNumber" label="Invoice Number">
                <Input placeholder="Search…" style={{ width: 160 }} allowClear />
              </Form.Item>
              <Form.Item name="supplier" label="Supplier">
                <Input placeholder="Search…" style={{ width: 180 }} allowClear />
              </Form.Item>
              <Form.Item name="businessUnit" label="Business Unit">
                <Select placeholder="All" style={{ width: 200 }} allowClear>
                  {businessUnits.map(bu => <Option key={bu} value={bu}>{bu}</Option>)}
                </Select>
              </Form.Item>
              <Form.Item name="postingStatus" label="Status">
                <Select placeholder="All" style={{ width: 130 }} allowClear>
                  <Option value="Not Posted">Not Posted</Option>
                  <Option value="Posted">Posted</Option>
                  <Option value="Error">Error</Option>
                </Select>
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={searching}>Search</Button>
                  <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>

          {searchErr && <Alert type="error" showIcon message={searchErr} style={{ marginBottom: 12 }} />}

          <Table
            dataSource={searchResult}
            columns={searchColumns}
            rowKey="invoiceId"
            size="small"
            loading={searching}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            scroll={{ x: 1000 }}
            locale={{ emptyText: 'Run a search to see multiperiod invoices' }}
          />
        </>
      ),
    },
    ...detailTabs.map(tab => ({
      key:   tab.key,
      label: (
        <span>
          <FileTextOutlined style={{ marginRight: 4 }} />
          {tab.label}
          <CloseOutlined
            style={{ marginLeft: 8, fontSize: 11, color: '#999' }}
            onClick={(e) => { e.stopPropagation(); closeTab(tab.key); }}
          />
        </span>
      ),
      children: renderDetail(tab),
    })),
  ];

  // ── main render ───────────────────────────────────────────────────────────

  return (
    <Layout style={{ minHeight: '100vh', background: REDWOOD.neutral }}>
      <Content style={{ padding: '12px 16px' }}>
        {/* Breadcrumb */}
        <Breadcrumb style={{ marginBottom: 8 }} items={[
          { title: <Link to="/"><HomeOutlined /></Link> },
          { title: <Link to="/ap">Accounts Payable</Link> },
          { title: 'Multiperiod Accounting' },
        ]} />

        {/* Page title */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Space size={10}>
            <CalendarOutlined style={{ fontSize: 22, color: REDWOOD.primary }} />
            <Title level={4} style={{ margin: 0, color: REDWOOD.primary }}>Multiperiod Accounting</Title>
          </Space>
          <Tooltip title="View Page APIs">
            <Button
              icon={<ApiOutlined />}
              size="small"
              style={{ color: REDWOOD.info }}
              onClick={() => setApiModalOpen(true)}
            />
          </Tooltip>
        </div>

        <Card bodyStyle={{ padding: 12 }}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            type="card"
            size="small"
            items={tabItems}
          />
        </Card>

        {/* Post confirmation modal */}
        <Modal
          open={confirmOpen}
          title={<Space><BookOutlined />Post {currentPeriod()} Accrual</Space>}
          onOk={handlePostConfirm}
          onCancel={() => setConfirmOpen(false)}
          okText="Post Accrual"
          okType="primary"
          okButtonProps={{ style: { background: REDWOOD.primary } }}
          width={700}
        >
          <Alert
            type="info"
            showIcon
            message={`This will create Dr Expense / Cr Accrual accounting entries for period ${currentPeriod()}.`}
            style={{ marginBottom: 12 }}
          />
          <Table
            dataSource={confirmModalLines()}
            rowKey="scheduleId"
            size="small"
            pagination={false}
            columns={[
              { title: 'Line', dataIndex: 'lineNumber', width: 55 },
              { title: 'Description', dataIndex: 'description', ellipsis: true },
              { title: 'Dr (Expense)', dataIndex: 'chargeAccount', ellipsis: true, width: 180,
                render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
              { title: 'Cr (Accrual)', dataIndex: 'accrualAccount', ellipsis: true, width: 180,
                render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
              { title: 'Amount', dataIndex: 'periodAmount', width: 110, align: 'right' as const,
                render: v => <Text strong>{fmtAmt(v)}</Text> },
            ]}
          />
        </Modal>

        {/* ── View Accounting Modal ────────────────────────────────────── */}
        <Modal
          open={acctModalOpen}
          title={<Space><EyeOutlined style={{ color: REDWOOD.info }} />Multiperiod Accounting Journal</Space>}
          onCancel={() => setAcctModalOpen(false)}
          footer={<Button onClick={() => setAcctModalOpen(false)}>Close</Button>}
          width={900}
        >
          {acctLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
          ) : !acctData?.found ? (
            <Alert
              type="warning"
              showIcon
              message="No accounting entries found"
              description="No journal entries have been posted yet for this invoice's multiperiod schedule."
            />
          ) : (
            <>
              <Descriptions size="small" column={3} style={{ marginBottom: 12 }}>
                <Descriptions.Item label="Journal #">{acctData.headerId}</Descriptions.Item>
                <Descriptions.Item label="Period">{acctData.periodName}</Descriptions.Item>
                <Descriptions.Item label="Accounting Date">{acctData.accountingDate ? dayjs(acctData.accountingDate).format('DD MMM YYYY') : '—'}</Descriptions.Item>
                <Descriptions.Item label="Status">
                  {acctData.accountingStatus === 'POSTED'
                    ? <Tag color="success">Posted</Tag>
                    : <Tag color="processing">{acctData.accountingStatus}</Tag>}
                </Descriptions.Item>
                <Descriptions.Item label="Posted By">{acctData.postedBy || '—'}</Descriptions.Item>
                <Descriptions.Item label="GL Batch">{acctData.glBatchName || '—'}</Descriptions.Item>
              </Descriptions>
              <Table
                dataSource={acctData.lines}
                rowKey="lineId"
                size="small"
                pagination={false}
                scroll={{ x: 800 }}
                columns={[
                  { title: '#', dataIndex: 'lineNumber', width: 45, align: 'center' as const },
                  {
                    title: 'Type', dataIndex: 'lineType', width: 55, align: 'center' as const,
                    render: (v: string) => (
                      <Tag color={v === 'DR' ? 'blue' : 'orange'} style={{ fontWeight: 600 }}>{v}</Tag>
                    ),
                  },
                  { title: 'Class', dataIndex: 'accountingClass', width: 100 },
                  {
                    title: 'Account', dataIndex: 'accountCombination', ellipsis: true,
                    render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text>,
                  },
                  { title: 'Description', dataIndex: 'description', ellipsis: true },
                  {
                    title: 'Dr Amount', dataIndex: 'enteredDr', width: 120, align: 'right' as const,
                    render: (v: number) => v ? <Text style={{ color: REDWOOD.info }}>{fmtAmt(v)}</Text> : <Text type="secondary">—</Text>,
                  },
                  {
                    title: 'Cr Amount', dataIndex: 'enteredCr', width: 120, align: 'right' as const,
                    render: (v: number) => v ? <Text style={{ color: REDWOOD.success }}>{fmtAmt(v)}</Text> : <Text type="secondary">—</Text>,
                  },
                ]}
                summary={() => {
                  const totalDr = acctData.lines.reduce((s, l) => s + (l.enteredDr || 0), 0);
                  const totalCr = acctData.lines.reduce((s, l) => s + (l.enteredCr || 0), 0);
                  return (
                    <Table.Summary fixed>
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={5} align="right">
                          <Text strong>Total</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={5} align="right">
                          <Text strong style={{ color: REDWOOD.info }}>{fmtAmt(totalDr)}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={6} align="right">
                          <Text strong style={{ color: REDWOOD.success }}>{fmtAmt(totalCr)}</Text>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    </Table.Summary>
                  );
                }}
              />
            </>
          )}
        </Modal>

        {/* ── API Debug Modal ──────────────────────────────────────────── */}
        <Modal
          open={apiModalOpen}
          title={<Space><ApiOutlined style={{ color: REDWOOD.info }} />Page APIs — Multiperiod Accounting</Space>}
          onCancel={() => setApiModalOpen(false)}
          footer={<Button onClick={() => setApiModalOpen(false)}>Close</Button>}
          width={800}
        >
          <div style={{ marginBottom: 12 }}>
            <Tag color="blue">Module: ap</Tag>
            <Tag color="green">Source: Oracle APEX ORDS</Tag>
          </div>

          {/* Endpoint reference table */}
          <Table
            size="small"
            pagination={false}
            style={{ marginBottom: lastApiUrl ? 16 : 0 }}
            dataSource={[
              { method: 'GET',  endpoint: `${APEX_DB_CONFIG.baseUrl}/ap/multiperiod`,                  purpose: 'Search — list invoices with MPA schedules' },
              { method: 'GET',  endpoint: `${APEX_DB_CONFIG.baseUrl}/ap/multiperiod/:invoice_id`,      purpose: 'Detail — schedule lines for one invoice' },
              { method: 'POST', endpoint: `${APEX_DB_CONFIG.baseUrl}/ap/multiperiod/generate`,         purpose: 'Generate / refresh schedule for an invoice' },
              { method: 'POST', endpoint: `${APEX_DB_CONFIG.baseUrl}/ap/multiperiod/mark-posted`,      purpose: 'Mark period lines as Posted after SLA create' },
            ]}
            rowKey="endpoint"
            columns={[
              { title: 'Method', dataIndex: 'method', width: 70,
                render: v => <Tag color={v === 'GET' ? 'blue' : 'orange'}>{v}</Tag> },
              { title: 'Endpoint', dataIndex: 'endpoint', ellipsis: true,
                render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
              { title: 'Purpose', dataIndex: 'purpose' },
            ]}
          />

          {/* Last called URL */}
          {lastApiUrl && (
            <Card
              size="small"
              title={
                <Space>
                  <span style={{ color: lastApiStatus === 'error' ? '#ff4d4f' : '#52c41a' }}>●</span>
                  <Text strong>Last Search Request</Text>
                  <Tag color={lastApiStatus === 'error' ? 'red' : 'green'}>
                    {lastApiStatus === 'error' ? 'Failed' : 'Success'}
                  </Tag>
                  {lastApiNote && <Text type="secondary" style={{ fontSize: 12 }}>{lastApiNote}</Text>}
                </Space>
              }
              style={{ border: `1px solid ${lastApiStatus === 'error' ? '#ff4d4f' : '#52c41a'}` }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text code style={{ fontSize: 11, flex: 1, wordBreak: 'break-all' }}>{lastApiUrl}</Text>
                <Tooltip title={copiedUrl ? 'Copied!' : 'Copy URL'}>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => {
                      navigator.clipboard.writeText(lastApiUrl);
                      setCopiedUrl(true);
                      setTimeout(() => setCopiedUrl(false), 2000);
                    }}
                  />
                </Tooltip>
                <Tooltip title="Open in new tab">
                  <Button
                    size="small"
                    icon={<ApiOutlined />}
                    onClick={() => window.open(lastApiUrl, '_blank')}
                  />
                </Tooltip>
              </div>
            </Card>
          )}

          {!lastApiUrl && (
            <Alert type="info" showIcon message="Run a search to see the last called API URL here." />
          )}
        </Modal>
      </Content>
    </Layout>
  );
};

export default ManageMultiperiod;
