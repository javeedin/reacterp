import React, { useState, useCallback, useMemo } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import {
  Layout, Card, Form, Select, Button, Table, Tag, Space, Row, Col,
  DatePicker, Tooltip, Typography, Statistic, Divider, Badge, message,
  Empty, Spin, Alert,
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, HomeOutlined, CheckCircleOutlined,
  CloseCircleOutlined, LinkOutlined, DisconnectOutlined, BarChartOutlined,
  FileTextOutlined, DollarOutlined, AuditOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import { APEX_DB_CONFIG } from '../../config/api.config';

const { Content } = Layout;
const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

const APEX_BASE = APEX_DB_CONFIG.baseUrl;

const REDWOOD = {
  primary:    '#C74634',
  success:    '#2E7D32',
  warning:    '#F57C00',
  info:       '#1565C0',
  error:      '#C62828',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral600: '#6B6B6B',
  neutral900: '#1A1A1A',
};

// ── Types ──────────────────────────────────────────────────────────────────────
interface GLJournalLine {
  jeHeaderId:       number;
  jeLineNumber:     number;
  jeHeaderName:     string;
  journalDate:      string;
  jeCategory:       string;
  jeSource:         string;
  accountCode:      string;
  enteredDr:        number | null;
  enteredCr:        number | null;
  accountedDr:      number | null;
  accountedCr:      number | null;
  currencyCode:     string;
  description:      string;
  reference1:       string;   // AP payment/invoice number
  businessUnit:     string;
  batchName:        string;
  reconciledFlag:   string;
  // matched state
  matchedApId?:     number;
  matchKey:         string;
}

interface APTransaction {
  id:               number;
  type:             'PAYMENT' | 'INVOICE';
  transactionNumber: string;
  transactionDate:  string;
  amount:           number;
  currencyCode:     string;
  supplier:         string;
  supplierNumber:   string;
  businessUnit:     string;
  status:           string;
  description:      string;
  reconciledFlag:   string;
  // matched state
  matchedGlKeys:    string[];
  matchKey:         string;
}

interface MatchPair {
  glKey:    string;
  apId:     number;
  apType:   string;
  amount:   number;
  currency: string;
  matchedBy: string;
}

const fmtDate  = (v: string) => v ? dayjs(v).format('DD-MMM-YYYY') : '—';
const fmtAmt   = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Component ──────────────────────────────────────────────────────────────────
const APGLReconcile: React.FC = () => {
  const [form] = Form.useForm();

  // Search state
  const [businessUnits, setBusinessUnits]   = useState<{ name: string; legalEntityName: string }[]>([]);
  const [buLoading, setBuLoading]           = useState(false);

  // Data
  const [glLines,   setGlLines]   = useState<GLJournalLine[]>([]);
  const [apTxns,    setApTxns]    = useState<APTransaction[]>([]);
  const [loadingGL, setLoadingGL] = useState(false);
  const [loadingAP, setLoadingAP] = useState(false);

  // Reconcile pairs
  const [matched, setMatched]       = useState<MatchPair[]>([]);
  const [selectedGlKeys, setSelectedGlKeys] = useState<React.Key[]>([]);
  const [selectedApIds,  setSelectedApIds]  = useState<React.Key[]>([]);

  // Filter tabs
  const [glFilter,  setGlFilter]  = useState<'ALL' | 'MATCHED' | 'UNMATCHED'>('ALL');
  const [apFilter,  setApFilter]  = useState<'ALL' | 'MATCHED' | 'UNMATCHED'>('ALL');

  // ── Load BUs on mount ────────────────────────────────────────────────────────
  React.useEffect(() => {
    setBuLoading(true);
    fetch(`${APEX_BASE}/gl/businessunits`, { headers: { Accept: 'application/json' } })
      .then(r => r.json())
      .then(d => setBusinessUnits((d.items || []).map((i: any) => ({
        name:            i.business_unit_name || '',
        legalEntityName: i.legal_entity_name  || '',
      }))))
      .catch(() => {})
      .finally(() => setBuLoading(false));
  }, []);

  // ── Fetch GL lines (AP category journals) ────────────────────────────────────
  const fetchGL = useCallback(async (buName: string, dateFrom: string, dateTo: string) => {
    setLoadingGL(true);
    try {
      const q = new URLSearchParams({
        business_unit: buName,
        date_from:     dateFrom,
        date_to:       dateTo,
        je_source:     'Payables',
        row_limit:     '1000',
      });
      const res  = await fetch(`${APEX_BASE}/gl/journals/lines?${q}`);
      const data = await res.json();
      const items = (data.items || []).map((i: any): GLJournalLine => ({
        jeHeaderId:     i.je_header_id   ?? i.jeHeaderId   ?? 0,
        jeLineNumber:   i.je_line_number ?? i.jeLineNumber ?? 0,
        jeHeaderName:   i.je_header_name ?? i.jeHeaderName ?? '',
        journalDate:    i.journal_date   ?? i.journalDate  ?? '',
        jeCategory:     i.je_category    ?? i.jeCategory   ?? '',
        jeSource:       i.je_source      ?? i.jeSource     ?? '',
        accountCode:    i.account_combination ?? i.accountCombination ?? i.account_code ?? '',
        enteredDr:      i.entered_dr     ?? i.enteredDr     ?? null,
        enteredCr:      i.entered_cr     ?? i.enteredCr     ?? null,
        accountedDr:    i.accounted_dr   ?? i.accountedDr   ?? null,
        accountedCr:    i.accounted_cr   ?? i.accountedCr   ?? null,
        currencyCode:   i.currency_code  ?? i.currencyCode  ?? '',
        description:    i.description    ?? '',
        reference1:     i.reference1     ?? i.reference     ?? '',
        businessUnit:   i.business_unit  ?? i.businessUnit  ?? buName,
        batchName:      i.batch_name     ?? i.batchName     ?? '',
        reconciledFlag: i.reconciled_flag ?? 'N',
        matchKey:       `${i.je_header_id ?? 0}-${i.je_line_number ?? 0}`,
        matchedApId:    undefined,
      }));
      setGlLines(items);
    } catch {
      message.error('Failed to load GL journal lines');
    } finally {
      setLoadingGL(false);
    }
  }, []);

  // ── Fetch AP payments ─────────────────────────────────────────────────────────
  const fetchAP = useCallback(async (buName: string, dateFrom: string, dateTo: string) => {
    setLoadingAP(true);
    try {
      const q = new URLSearchParams({
        business_unit: buName,
        date_from:     dateFrom,
        date_to:       dateTo,
        row_limit:     '1000',
      });
      const res  = await fetch(`${APEX_BASE}/ap/payments?${q}`);
      const data = await res.json();
      const items = (data.items || []).map((i: any): APTransaction => ({
        id:                i.check_id        ?? i.checkId        ?? i.payment_id ?? 0,
        type:              'PAYMENT',
        transactionNumber: i.payment_number  ?? i.paymentNumber  ?? '',
        transactionDate:   i.payment_date    ?? i.paymentDate    ?? '',
        amount:            i.payment_amount  ?? i.paymentAmount  ?? 0,
        currencyCode:      i.payment_currency ?? i.paymentCurrency ?? '',
        supplier:          i.payee           ?? i.supplier       ?? '',
        supplierNumber:    i.supplier_number ?? i.supplierNumber ?? '',
        businessUnit:      i.business_unit   ?? i.businessUnit   ?? buName,
        status:            i.payment_status  ?? i.paymentStatus  ?? '',
        description:       i.description     ?? '',
        reconciledFlag:    i.reconciled_flag ?? 'N',
        matchedGlKeys:     [],
        matchKey:          String(i.check_id ?? i.checkId ?? i.payment_id ?? Math.random()),
      }));
      setApTxns(items);
    } catch {
      message.error('Failed to load AP payments');
    } finally {
      setLoadingAP(false);
    }
  }, []);

  // ── Search handler ────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    const values = form.getFieldsValue();
    const buName  = values.businessUnit || '';
    const dateRange: [Dayjs, Dayjs] | null = values.dateRange ?? null;
    if (!buName) { message.warning('Select a Business Unit'); return; }
    if (!dateRange) { message.warning('Select a date range'); return; }
    const dateFrom = dateRange[0].format('YYYY-MM-DD');
    const dateTo   = dateRange[1].format('YYYY-MM-DD');
    setMatched([]);
    setSelectedGlKeys([]);
    setSelectedApIds([]);
    await Promise.all([fetchGL(buName, dateFrom, dateTo), fetchAP(buName, dateFrom, dateTo)]);
  }, [form, fetchGL, fetchAP]);

  // ── Auto-match: by reference1 = payment_number & amount ──────────────────────
  const handleAutoMatch = useCallback(() => {
    const newPairs: MatchPair[] = [];
    const usedAp  = new Set<string>();
    const usedGl  = new Set<string>();

    for (const gl of glLines) {
      if (usedGl.has(gl.matchKey)) continue;
      const glAmt = (gl.enteredDr ?? 0) - (gl.enteredCr ?? 0);
      // Try match by reference1 (AP payment number) + amount
      const ap = apTxns.find(t =>
        !usedAp.has(t.matchKey) &&
        t.currencyCode === gl.currencyCode &&
        Math.abs(Math.abs(t.amount) - Math.abs(glAmt)) < 0.01 &&
        (t.transactionNumber === gl.reference1 || gl.reference1 === '')
      );
      if (ap) {
        newPairs.push({
          glKey:    gl.matchKey,
          apId:     ap.id,
          apType:   ap.type,
          amount:   Math.abs(glAmt),
          currency: gl.currencyCode,
          matchedBy: 'Amount + Reference',
        });
        usedAp.add(ap.matchKey);
        usedGl.add(gl.matchKey);
      }
    }

    setMatched(prev => {
      const existingGl = new Set(prev.map(p => p.glKey));
      const fresh = newPairs.filter(p => !existingGl.has(p.glKey));
      return [...prev, ...fresh];
    });
    message.success(`Auto-matched ${newPairs.length} pair(s)`);
  }, [glLines, apTxns]);

  // ── Manual match selected rows ────────────────────────────────────────────────
  const handleManualMatch = useCallback(() => {
    if (selectedGlKeys.length === 0 || selectedApIds.length === 0) {
      message.warning('Select at least one GL line and one AP transaction');
      return;
    }
    const newPairs: MatchPair[] = [];
    const matchedGlSet = new Set(matched.map(m => m.glKey));
    const matchedApSet = new Set(matched.map(m => String(m.apId)));

    for (const gk of selectedGlKeys) {
      if (matchedGlSet.has(String(gk))) continue;
      const gl = glLines.find(l => l.matchKey === String(gk));
      if (!gl) continue;
      const glAmt = Math.abs((gl.enteredDr ?? 0) - (gl.enteredCr ?? 0));
      for (const ak of selectedApIds) {
        if (matchedApSet.has(String(ak))) continue;
        const ap = apTxns.find(t => String(t.id) === String(ak));
        if (!ap) continue;
        newPairs.push({
          glKey:    gl.matchKey,
          apId:     ap.id,
          apType:   ap.type,
          amount:   glAmt,
          currency: gl.currencyCode,
          matchedBy: 'Manual',
        });
        matchedGlSet.add(gl.matchKey);
        matchedApSet.add(String(ap.id));
        break;
      }
    }

    setMatched(prev => [...prev, ...newPairs]);
    setSelectedGlKeys([]);
    setSelectedApIds([]);
    message.success(`Matched ${newPairs.length} pair(s)`);
  }, [selectedGlKeys, selectedApIds, glLines, apTxns, matched]);

  // ── Unmatch a pair ────────────────────────────────────────────────────────────
  const handleUnmatch = useCallback((glKey: string) => {
    setMatched(prev => prev.filter(p => p.glKey !== glKey));
  }, []);

  // ── Derived sets ─────────────────────────────────────────────────────────────
  const matchedGlKeys = useMemo(() => new Set(matched.map(m => m.glKey)), [matched]);
  const matchedApIds  = useMemo(() => new Set(matched.map(m => String(m.apId))), [matched]);

  // ── Filtered data ─────────────────────────────────────────────────────────────
  const filteredGL = useMemo(() => {
    if (glFilter === 'MATCHED')   return glLines.filter(l => matchedGlKeys.has(l.matchKey));
    if (glFilter === 'UNMATCHED') return glLines.filter(l => !matchedGlKeys.has(l.matchKey));
    return glLines;
  }, [glLines, glFilter, matchedGlKeys]);

  const filteredAP = useMemo(() => {
    if (apFilter === 'MATCHED')   return apTxns.filter(t => matchedApIds.has(String(t.id)));
    if (apFilter === 'UNMATCHED') return apTxns.filter(t => !matchedApIds.has(String(t.id)));
    return apTxns;
  }, [apTxns, apFilter, matchedApIds]);

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    glTotal:       glLines.length,
    glMatched:     glLines.filter(l => matchedGlKeys.has(l.matchKey)).length,
    apTotal:       apTxns.length,
    apMatched:     apTxns.filter(t => matchedApIds.has(String(t.id))).length,
    glSumEntered:  glLines.reduce((s, l) => s + Math.abs((l.enteredDr ?? 0) - (l.enteredCr ?? 0)), 0),
    apSum:         apTxns.reduce((s, t) => s + t.amount, 0),
  }), [glLines, apTxns, matchedGlKeys, matchedApIds]);

  // ── GL columns ────────────────────────────────────────────────────────────────
  const glColumns: ColumnsType<GLJournalLine> = [
    {
      title: 'Status',
      key: 'status',
      width: 80,
      render: (_: unknown, r) => matchedGlKeys.has(r.matchKey)
        ? <Tag color="success" icon={<CheckCircleOutlined />} style={{ margin: 0, fontSize: 10 }}>Matched</Tag>
        : <Tag color="default" icon={<CloseCircleOutlined />} style={{ margin: 0, fontSize: 10 }}>Open</Tag>,
    },
    {
      title: 'Journal',
      dataIndex: 'jeHeaderName',
      key: 'jeHeaderName',
      ellipsis: true,
      width: 150,
      render: (v: string, r) => (
        <Tooltip title={`${r.jeCategory} — ${r.batchName}`}>
          <Text style={{ fontSize: 11 }}>{v || '—'}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'journalDate',
      key: 'journalDate',
      width: 95,
      render: fmtDate,
    },
    {
      title: 'Account',
      dataIndex: 'accountCode',
      key: 'accountCode',
      width: 130,
      ellipsis: true,
      render: (v: string) => <Text code style={{ fontSize: 10 }}>{v || '—'}</Text>,
    },
    {
      title: 'DR',
      dataIndex: 'enteredDr',
      key: 'enteredDr',
      width: 110,
      align: 'right',
      render: (v: number | null) => v ? <Text style={{ color: REDWOOD.info, fontSize: 11 }}>{fmtAmt(v)}</Text> : '—',
    },
    {
      title: 'CR',
      dataIndex: 'enteredCr',
      key: 'enteredCr',
      width: 110,
      align: 'right',
      render: (v: number | null) => v ? <Text style={{ color: REDWOOD.error, fontSize: 11 }}>{fmtAmt(v)}</Text> : '—',
    },
    {
      title: 'CCY',
      dataIndex: 'currencyCode',
      key: 'currencyCode',
      width: 50,
    },
    {
      title: 'Reference',
      dataIndex: 'reference1',
      key: 'reference1',
      width: 110,
      ellipsis: true,
      render: (v: string) => v || '—',
    },
  ];

  // ── AP columns ────────────────────────────────────────────────────────────────
  const apColumns: ColumnsType<APTransaction> = [
    {
      title: 'Status',
      key: 'status',
      width: 80,
      render: (_: unknown, r) => matchedApIds.has(String(r.id))
        ? <Tag color="success" icon={<CheckCircleOutlined />} style={{ margin: 0, fontSize: 10 }}>Matched</Tag>
        : <Tag color="default" icon={<CloseCircleOutlined />} style={{ margin: 0, fontSize: 10 }}>Open</Tag>,
    },
    {
      title: 'Txn #',
      dataIndex: 'transactionNumber',
      key: 'transactionNumber',
      width: 120,
      ellipsis: true,
    },
    {
      title: 'Date',
      dataIndex: 'transactionDate',
      key: 'transactionDate',
      width: 95,
      render: fmtDate,
    },
    {
      title: 'Supplier',
      dataIndex: 'supplier',
      key: 'supplier',
      ellipsis: true,
      render: (v: string, r) => (
        <Tooltip title={r.supplierNumber ? `${v} (${r.supplierNumber})` : v}>
          <span>{v || '—'}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      align: 'right',
      render: (v: number) => <Text style={{ fontWeight: 500, fontSize: 11 }}>{fmtAmt(v)}</Text>,
    },
    {
      title: 'CCY',
      dataIndex: 'currencyCode',
      key: 'currencyCode',
      width: 50,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'txnStatus',
      width: 90,
      render: (v: string) => v
        ? <Tag style={{ margin: 0, fontSize: 10 }}>{v}</Tag>
        : '—',
    },
  ];

  // ── Matched pairs columns ─────────────────────────────────────────────────────
  const matchedColumns: ColumnsType<MatchPair> = [
    {
      title: 'GL Line',
      dataIndex: 'glKey',
      key: 'glKey',
      width: 140,
      render: (v: string) => {
        const gl = glLines.find(l => l.matchKey === v);
        return (
          <Tooltip title={gl?.jeHeaderName}>
            <Text code style={{ fontSize: 10 }}>{v}</Text>
          </Tooltip>
        );
      },
    },
    {
      title: 'AP Payment',
      dataIndex: 'apId',
      key: 'apId',
      render: (v: number) => {
        const ap = apTxns.find(t => t.id === v);
        return <Text style={{ fontSize: 11 }}>{ap?.transactionNumber || String(v)}</Text>;
      },
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      align: 'right',
      render: (v: number, r) => <Text style={{ fontSize: 11 }}>{fmtAmt(v)} {r.currency}</Text>,
    },
    {
      title: 'Matched By',
      dataIndex: 'matchedBy',
      key: 'matchedBy',
      width: 140,
      render: (v: string) => <Tag color={v === 'Manual' ? 'blue' : 'purple'} style={{ fontSize: 10, margin: 0 }}>{v}</Tag>,
    },
    {
      title: '',
      key: 'action',
      width: 70,
      render: (_: unknown, r) => (
        <Tooltip title="Unmatch">
          <Button
            size="small"
            danger
            icon={<DisconnectOutlined />}
            onClick={() => handleUnmatch(r.glKey)}
          />
        </Tooltip>
      ),
    },
  ];

  const hasData  = glLines.length > 0 || apTxns.length > 0;
  const isLoading = loadingGL || loadingAP;

  const filterBtn = (label: string, val: 'ALL' | 'MATCHED' | 'UNMATCHED', current: string, set: (v: any) => void) => (
    <Button
      size="small"
      type={current === val ? 'primary' : 'default'}
      onClick={() => set(val)}
      style={current === val ? { background: REDWOOD.primary, borderColor: REDWOOD.primary } : {}}
    >
      {label}
    </Button>
  );

  return (
    <Layout style={{ minHeight: '100vh', background: REDWOOD.neutral100 }}>
      <Content style={{ padding: '16px 20px' }}>
        {/* Breadcrumb */}
        <Space style={{ marginBottom: 12, fontSize: 12, color: REDWOOD.neutral600 }}>
          <Link to="/"><HomeOutlined /></Link>
          <Text style={{ color: REDWOOD.neutral600 }}>/</Text>
          <Text style={{ color: REDWOOD.neutral600 }}>Accounts Payable</Text>
          <Text style={{ color: REDWOOD.neutral600 }}>/</Text>
          <Text strong style={{ color: REDWOOD.primary }}>AP–GL Reconciliation</Text>
        </Space>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <AuditOutlined style={{ fontSize: 20, color: REDWOOD.primary }} />
          <Title level={4} style={{ margin: 0, color: REDWOOD.neutral900 }}>AP–GL Reconciliation</Title>
          <Tag color="orange" style={{ fontSize: 11 }}>BETA</Tag>
        </div>

        {/* Search form */}
        <Card size="small" style={{ marginBottom: 14, borderColor: REDWOOD.neutral200 }}>
          <Form form={form} layout="inline" size="small" onFinish={handleSearch}>
            <Form.Item name="businessUnit" label="Business Unit" rules={[{ required: true, message: 'Required' }]}>
              <Select
                placeholder="Select business unit"
                showSearch
                loading={buLoading}
                optionFilterProp="label"
                style={{ width: 240 }}
              >
                {businessUnits.map(bu => (
                  <Select.Option key={bu.name} value={bu.name} label={bu.name}>
                    {bu.name}
                    {bu.legalEntityName && (
                      <Text type="secondary" style={{ fontSize: 10, marginLeft: 6 }}>({bu.legalEntityName})</Text>
                    )}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="dateRange" label="Date Range" rules={[{ required: true, message: 'Required' }]}>
              <RangePicker
                format="DD-MMM-YYYY"
                style={{ width: 260 }}
                defaultValue={[dayjs().subtract(1, 'month'), dayjs()]}
              />
            </Form.Item>
            <Form.Item>
              <Space>
                <Button
                  type="primary"
                  icon={<SearchOutlined />}
                  htmlType="submit"
                  loading={isLoading}
                  style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                >
                  Search
                </Button>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => { form.resetFields(); setGlLines([]); setApTxns([]); setMatched([]); }}
                >
                  Reset
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>

        {/* Summary stats */}
        {hasData && (
          <Row gutter={12} style={{ marginBottom: 14 }}>
            {[
              { title: 'GL Lines',       value: stats.glTotal,      suffix: `(${stats.glMatched} matched)`,   color: REDWOOD.info,    icon: <FileTextOutlined /> },
              { title: 'AP Payments',    value: stats.apTotal,      suffix: `(${stats.apMatched} matched)`,   color: REDWOOD.primary, icon: <DollarOutlined /> },
              { title: 'Matched Pairs',  value: matched.length,     suffix: '',                               color: REDWOOD.success, icon: <LinkOutlined /> },
              { title: 'GL Unmatched',   value: stats.glTotal - stats.glMatched, suffix: 'lines',             color: stats.glTotal - stats.glMatched > 0 ? REDWOOD.warning : REDWOOD.success, icon: <BarChartOutlined /> },
              { title: 'AP Unmatched',   value: stats.apTotal - stats.apMatched, suffix: 'payments',          color: stats.apTotal - stats.apMatched > 0 ? REDWOOD.warning : REDWOOD.success, icon: <BarChartOutlined /> },
            ].map(s => (
              <Col key={s.title} flex="1">
                <Card size="small" style={{ borderColor: REDWOOD.neutral200, textAlign: 'center' }}>
                  <Statistic
                    title={<Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{s.title}</Text>}
                    value={s.value}
                    suffix={<Text style={{ fontSize: 10, color: REDWOOD.neutral600 }}>{s.suffix}</Text>}
                    valueStyle={{ fontSize: 20, color: s.color }}
                    prefix={React.cloneElement(s.icon as React.ReactElement, { style: { fontSize: 14, color: s.color } })}
                  />
                </Card>
              </Col>
            ))}
          </Row>
        )}

        {/* Match action bar */}
        {hasData && (
          <Card size="small" style={{ marginBottom: 14, background: '#fffbe6', borderColor: '#ffe58f' }}>
            <Space wrap>
              <Text strong style={{ fontSize: 12 }}>Reconcile Actions:</Text>
              <Button
                type="primary"
                icon={<LinkOutlined />}
                size="small"
                onClick={handleAutoMatch}
                style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
              >
                Auto-Match
              </Button>
              <Button
                icon={<LinkOutlined />}
                size="small"
                onClick={handleManualMatch}
                disabled={selectedGlKeys.length === 0 || selectedApIds.length === 0}
                style={{ borderColor: REDWOOD.info, color: REDWOOD.info }}
              >
                Match Selected ({selectedGlKeys.length} GL / {selectedApIds.length} AP)
              </Button>
              {matched.length > 0 && (
                <Button
                  icon={<DisconnectOutlined />}
                  size="small"
                  danger
                  onClick={() => { setMatched([]); message.info('All matches cleared'); }}
                >
                  Clear All Matches
                </Button>
              )}
              <Text type="secondary" style={{ fontSize: 11 }}>
                Select rows in both tables below then click Match Selected, or use Auto-Match to match by amount + reference.
              </Text>
            </Space>
          </Card>
        )}

        {/* Main split view */}
        <Row gutter={12}>
          {/* GL Lines */}
          <Col span={12}>
            <Card
              size="small"
              title={
                <Space>
                  <FileTextOutlined style={{ color: REDWOOD.info }} />
                  <Text strong>GL Journal Lines (AP Source)</Text>
                  <Badge count={glLines.length} style={{ background: REDWOOD.info }} />
                  {loadingGL && <Spin size="small" />}
                </Space>
              }
              extra={
                <Space size={4}>
                  {filterBtn('All', 'ALL', glFilter, setGlFilter)}
                  {filterBtn('Matched', 'MATCHED', glFilter, setGlFilter)}
                  {filterBtn('Unmatched', 'UNMATCHED', glFilter, setGlFilter)}
                </Space>
              }
              style={{ borderColor: REDWOOD.neutral200 }}
            >
              {!hasData && !loadingGL ? (
                <Empty description="Run a search to load GL journal lines" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <Table
                  columns={glColumns}
                  dataSource={filteredGL}
                  rowKey="matchKey"
                  size="small"
                  loading={loadingGL}
                  scroll={{ x: 800, y: 420 }}
                  pagination={{ pageSize: 50, showSizeChanger: false, showTotal: (t, r) => `${r[0]}-${r[1]} of ${t}` }}
                  rowSelection={{
                    selectedRowKeys: selectedGlKeys,
                    onChange: setSelectedGlKeys,
                    getCheckboxProps: r => ({
                      disabled: matchedGlKeys.has(r.matchKey),
                    }),
                  }}
                  rowClassName={r => matchedGlKeys.has(r.matchKey) ? 'table-row-matched' : ''}
                  onRow={r => ({
                    style: matchedGlKeys.has(r.matchKey)
                      ? { background: '#f6ffed' }
                      : undefined,
                  })}
                />
              )}
            </Card>
          </Col>

          {/* AP Transactions */}
          <Col span={12}>
            <Card
              size="small"
              title={
                <Space>
                  <DollarOutlined style={{ color: REDWOOD.primary }} />
                  <Text strong>AP Payments</Text>
                  <Badge count={apTxns.length} style={{ background: REDWOOD.primary }} />
                  {loadingAP && <Spin size="small" />}
                </Space>
              }
              extra={
                <Space size={4}>
                  {filterBtn('All', 'ALL', apFilter, setApFilter)}
                  {filterBtn('Matched', 'MATCHED', apFilter, setApFilter)}
                  {filterBtn('Unmatched', 'UNMATCHED', apFilter, setApFilter)}
                </Space>
              }
              style={{ borderColor: REDWOOD.neutral200 }}
            >
              {!hasData && !loadingAP ? (
                <Empty description="Run a search to load AP payments" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <Table
                  columns={apColumns}
                  dataSource={filteredAP}
                  rowKey={r => String(r.id)}
                  size="small"
                  loading={loadingAP}
                  scroll={{ x: 700, y: 420 }}
                  pagination={{ pageSize: 50, showSizeChanger: false, showTotal: (t, r) => `${r[0]}-${r[1]} of ${t}` }}
                  rowSelection={{
                    selectedRowKeys: selectedApIds,
                    onChange: setSelectedApIds,
                    getCheckboxProps: r => ({
                      disabled: matchedApIds.has(String(r.id)),
                    }),
                  }}
                  onRow={r => ({
                    style: matchedApIds.has(String(r.id))
                      ? { background: '#f6ffed' }
                      : undefined,
                  })}
                />
              )}
            </Card>
          </Col>
        </Row>

        {/* Matched pairs table */}
        {matched.length > 0 && (
          <>
            <Divider style={{ margin: '16px 0 12px' }}>
              <Space>
                <CheckCircleOutlined style={{ color: REDWOOD.success }} />
                <Text strong style={{ color: REDWOOD.success }}>Reconciled Pairs ({matched.length})</Text>
              </Space>
            </Divider>
            <Card size="small" style={{ borderColor: '#b7eb8f', background: '#f6ffed' }}>
              <Table
                columns={matchedColumns}
                dataSource={matched}
                rowKey="glKey"
                size="small"
                pagination={false}
                scroll={{ x: 700 }}
              />
            </Card>
          </>
        )}

        {/* Info alert when no matches yet */}
        {hasData && matched.length === 0 && (
          <Alert
            style={{ marginTop: 14 }}
            type="info"
            showIcon
            message="No reconciled pairs yet"
            description='Use "Auto-Match" to automatically match GL lines to AP payments by amount and reference, or select rows manually and click "Match Selected".'
          />
        )}
      </Content>
    </Layout>
  );
};

export default APGLReconcile;
