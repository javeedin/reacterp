import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Layout,
  Card,
  Table,
  Button,
  Space,
  Typography,
  Breadcrumb,
  Tag,
  Row,
  Col,
  Spin,
  Alert,
  Select,
  Statistic,
  Empty,
  Tooltip,
  Badge,
  Modal,
  Input,
} from 'antd';
import {
  HomeOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  ReconciliationOutlined,
  SearchOutlined,
  BankOutlined,
  FileTextOutlined,
  UnorderedListOutlined,
  ApiOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { APEX_DB_CONFIG } from '../../config/api.config';

const { Content } = Layout;
const { Title, Text } = Typography;

const REDWOOD = {
  primary: '#C74634',
  primaryDark: '#A33B2C',
  success: '#1D7B4D',
  warning: '#D4A800',
  error: '#C74634',
  info: '#0572CE',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral600: '#6B6B6B',
  neutral900: '#1A1A1A',
  surface: '#FFFFFF',
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface Ledger {
  ledger_name: string;
  batch_count: number;
  periods: Period[];
}

interface Period {
  period_name: string;
  batch_count: number;
}

interface HeaderDetail {
  je_header_id: number;
  journal_name: string;
  description: string;
  header_dr: number;
  header_cr: number;
  lines_dr: number;
  lines_cr: number;
  line_count: number;
  dr_ok: string;
  cr_ok: string;
}

interface BatchRow {
  key: string;
  je_batch_id: number;
  batch_name: string;
  period_name: string;
  batch_dr: number;
  batch_cr: number;
  headers_dr: number;
  headers_cr: number;
  lines_dr: number;
  lines_cr: number;
  header_count: number;
  line_count: number;
  batch_hdr_dr_ok: string;
  batch_hdr_cr_ok: string;
  hdr_lines_dr_ok: string;
  hdr_lines_cr_ok: string;
  headers: HeaderDetail[];
}

interface LineRow {
  key: string;
  line_number: number;
  account_combination: string;
  description: string;
  currency_code: string;
  entered_dr: number;
  entered_cr: number;
  accounted_dr: number;
  accounted_cr: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const matchTag = (ok: string, label: string) =>
  ok === 'Y' ? (
    <Tag icon={<CheckCircleOutlined />} color="success" style={{ fontSize: 11 }}>
      {label}
    </Tag>
  ) : (
    <Tag icon={<CloseCircleOutlined />} color="error" style={{ fontSize: 11 }}>
      {label}
    </Tag>
  );

const rowStyle = (record: BatchRow): React.CSSProperties => {
  const mismatch =
    record.batch_hdr_dr_ok === 'N' ||
    record.batch_hdr_cr_ok === 'N' ||
    record.hdr_lines_dr_ok === 'N' ||
    record.hdr_lines_cr_ok === 'N';
  const noLines = record.line_count === 0;
  if (mismatch) return { background: '#fff1f0' };
  if (noLines) return { background: '#fffbe6' };
  return {};
};

const headerRowStyle = (record: HeaderDetail): React.CSSProperties => {
  const mismatch = record.dr_ok === 'N' || record.cr_ok === 'N';
  if (mismatch) return { background: '#fff1f0' };
  return {};
};

// ─── HeadersPanel: shows headers table with expandable lines ─────────────────

function HeadersPanel({ headers }: { headers: HeaderDetail[] }) {
  const [linesMap, setLinesMap] = useState<Record<number, { loading: boolean; lines: LineRow[]; totals: any }>>({});

  const fetchLines = async (headerId: number) => {
    if (linesMap[headerId]) return;
    setLinesMap(prev => ({ ...prev, [headerId]: { loading: true, lines: [], totals: null } }));
    try {
      const res = await fetch(`${APEX_DB_CONFIG.baseUrl}/gl/reconciliation/lines?je_header_id=${headerId}`);
      const data = await res.json();
      const lines: LineRow[] = (data.items ?? []).map((l: any, i: number) => ({ ...l, key: String(i) }));
      setLinesMap(prev => ({ ...prev, [headerId]: { loading: false, lines, totals: data.totals ?? null } }));
    } catch {
      setLinesMap(prev => ({ ...prev, [headerId]: { loading: false, lines: [], totals: null } }));
    }
  };

  const linesExpandedRowRender = (h: HeaderDetail & { key: string }) => {
    const state = linesMap[h.je_header_id];
    if (!state || state.loading) return <Spin size="small" style={{ padding: 16 }} />;
    if (state.lines.length === 0) return <Empty description="No lines" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

    const lineCols = [
      { title: '#', dataIndex: 'line_number', key: 'line_number', width: 50 },
      { title: 'Account', dataIndex: 'account_combination', key: 'account_combination', ellipsis: true, width: 200 },
      { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
      { title: 'CCY', dataIndex: 'currency_code', key: 'currency_code', width: 55 },
      {
        title: 'Entered DR', dataIndex: 'entered_dr', key: 'entered_dr', align: 'right' as const, width: 130,
        render: (v: number) => <Text style={{ fontFamily: 'monospace' }}>{fmt(v)}</Text>,
      },
      {
        title: 'Entered CR', dataIndex: 'entered_cr', key: 'entered_cr', align: 'right' as const, width: 130,
        render: (v: number) => <Text style={{ fontFamily: 'monospace' }}>{fmt(v)}</Text>,
      },
      {
        title: 'Accounted DR', dataIndex: 'accounted_dr', key: 'accounted_dr', align: 'right' as const, width: 130,
        render: (v: number) => <Text style={{ fontFamily: 'monospace' }}>{fmt(v)}</Text>,
      },
      {
        title: 'Accounted CR', dataIndex: 'accounted_cr', key: 'accounted_cr', align: 'right' as const, width: 130,
        render: (v: number) => <Text style={{ fontFamily: 'monospace' }}>{fmt(v)}</Text>,
      },
    ];

    const t = state.totals;
    return (
      <Table
        columns={lineCols}
        dataSource={state.lines}
        pagination={false}
        size="small"
        scroll={{ x: 900 }}
        style={{ marginLeft: 8, marginBottom: 4 }}
        summary={() => t && (
          <Table.Summary.Row style={{ background: '#f0f5ff', fontWeight: 600 }}>
            <Table.Summary.Cell index={0} colSpan={4}>
              <Text strong>Total</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={4} align="right">
              <Text style={{ fontFamily: 'monospace', color: REDWOOD.success }}>{fmt(t.entered_dr)}</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={5} align="right">
              <Text style={{ fontFamily: 'monospace', color: REDWOOD.success }}>{fmt(t.entered_cr)}</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={6} align="right">
              <Text style={{ fontFamily: 'monospace', color: REDWOOD.info }}>{fmt(t.accounted_dr)}</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={7} align="right">
              <Text style={{ fontFamily: 'monospace', color: REDWOOD.info }}>{fmt(t.accounted_cr)}</Text>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />
    );
  };

  const headerCols = [
    { title: 'Journal Name', dataIndex: 'journal_name', key: 'journal_name', ellipsis: true, width: 240 },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Header DR', dataIndex: 'header_dr', key: 'header_dr', align: 'right' as const, width: 130,
      render: (v: number) => <Text style={{ fontFamily: 'monospace' }}>{fmt(v)}</Text> },
    { title: 'Header CR', dataIndex: 'header_cr', key: 'header_cr', align: 'right' as const, width: 130,
      render: (v: number) => <Text style={{ fontFamily: 'monospace' }}>{fmt(v)}</Text> },
    { title: 'Lines DR', dataIndex: 'lines_dr', key: 'lines_dr', align: 'right' as const, width: 130,
      render: (v: number) => <Text style={{ fontFamily: 'monospace' }}>{fmt(v)}</Text> },
    { title: 'Lines CR', dataIndex: 'lines_cr', key: 'lines_cr', align: 'right' as const, width: 130,
      render: (v: number) => <Text style={{ fontFamily: 'monospace' }}>{fmt(v)}</Text> },
    { title: 'Lines', dataIndex: 'line_count', key: 'line_count', align: 'center' as const, width: 55 },
    {
      title: 'Match', key: 'match', width: 110,
      render: (_: any, r: HeaderDetail) => (
        <Space size={2}>
          {matchTag(r.dr_ok, 'DR')}
          {matchTag(r.cr_ok, 'CR')}
        </Space>
      ),
    },
  ];

  if (!headers || headers.length === 0)
    return <Empty description="No journal headers" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  return (
    <Table
      columns={headerCols}
      dataSource={headers.map((h) => ({ ...h, key: String(h.je_header_id) }))}
      pagination={false}
      size="small"
      scroll={{ x: 900 }}
      onRow={(r: any) => ({ style: headerRowStyle(r) })}
      expandable={{
        expandedRowRender: linesExpandedRowRender,
        rowExpandable: (r: any) => r.line_count > 0,
        onExpand: (expanded: boolean, r: any) => { if (expanded) fetchLines(r.je_header_id); },
      }}
      style={{ marginLeft: 8 }}
    />
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function JournalReconciliation() {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [selectedLedger, setSelectedLedger] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLedgers, setLoadingLedgers] = useState(false);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [apiModalOpen, setApiModalOpen] = useState(false);

  // Periods derived from selected ledger — no extra API call
  const periods: Period[] = ledgers.find((l) => l.ledger_name === selectedLedger)?.periods ?? [];

  // Current reconciliation API URL
  const reconUrl = (() => {
    if (!selectedLedger) return `${APEX_DB_CONFIG.baseUrl}/gl/reconciliation?ledger_id=<select ledger>`;
    const url = new URL(`${APEX_DB_CONFIG.baseUrl}/gl/reconciliation`);
    url.searchParams.set('ledger_id', selectedLedger);
    if (selectedPeriod) url.searchParams.set('period_name', selectedPeriod);
    return url.toString();
  })();

  const ledgersUrl = `${APEX_DB_CONFIG.baseUrl}/gl/reconciliation/ledgers`;

  // Summary stats
  const totalBatches = batches.length;
  const matchedBatches = batches.filter(
    (b) =>
      b.batch_hdr_dr_ok === 'Y' &&
      b.batch_hdr_cr_ok === 'Y' &&
      b.hdr_lines_dr_ok === 'Y' &&
      b.hdr_lines_cr_ok === 'Y' &&
      b.line_count > 0
  ).length;
  const mismatchedBatches = batches.filter(
    (b) =>
      b.batch_hdr_dr_ok === 'N' ||
      b.batch_hdr_cr_ok === 'N' ||
      b.hdr_lines_dr_ok === 'N' ||
      b.hdr_lines_cr_ok === 'N'
  ).length;
  const noLinesBatches = batches.filter((b) => b.line_count === 0).length;

  // ── Fetch ledgers on mount ──────────────────────────────────────────────────
  useEffect(() => {
    const fetchLedgers = async () => {
      setLoadingLedgers(true);
      try {
        const res = await fetch(`${APEX_DB_CONFIG.baseUrl}/gl/reconciliation/ledgers`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const items: Ledger[] = Array.isArray(data) ? data : data.items ?? data.ledgers ?? [];
        setLedgers(items);
        if (items.length === 1) setSelectedLedger(items[0].ledger_name);
      } catch (e: any) {
        console.error('Failed to fetch ledgers', e);
      } finally {
        setLoadingLedgers(false);
      }
    };
    fetchLedgers();
  }, []);

  // ── Reset period when ledger changes ───────────────────────────────────────
  useEffect(() => {
    setSelectedPeriod(null);
  }, [selectedLedger]);

  // ── Load reconciliation data ────────────────────────────────────────────────
  const handleLoad = useCallback(async () => {
    if (!selectedLedger) return;
    setLoading(true);
    setError(null);
    setBatches([]);
    try {
      const url = new URL(`${APEX_DB_CONFIG.baseUrl}/gl/reconciliation`);
      url.searchParams.set('ledger_id', selectedLedger);
      if (selectedPeriod) url.searchParams.set('period_name', selectedPeriod);

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const rawBatches: any[] = Array.isArray(data) ? data : data.items ?? data.batches ?? [];
      const rows: BatchRow[] = rawBatches.map((b: any, idx: number) => ({
        key: String(b.je_batch_id ?? idx),
        je_batch_id: b.je_batch_id,
        batch_name: b.batch_name,
        period_name: b.period_name ?? b.default_period_name,
        batch_dr: Number(b.batch_dr ?? 0),
        batch_cr: Number(b.batch_cr ?? 0),
        headers_dr: Number(b.headers_dr ?? 0),
        headers_cr: Number(b.headers_cr ?? 0),
        lines_dr: Number(b.lines_dr ?? 0),
        lines_cr: Number(b.lines_cr ?? 0),
        header_count: Number(b.header_count ?? 0),
        line_count: Number(b.line_count ?? 0),
        batch_hdr_dr_ok: b.batch_hdr_dr_ok ?? 'Y',
        batch_hdr_cr_ok: b.batch_hdr_cr_ok ?? 'Y',
        hdr_lines_dr_ok: b.hdr_lines_dr_ok ?? 'Y',
        hdr_lines_cr_ok: b.hdr_lines_cr_ok ?? 'Y',
        headers: Array.isArray(b.headers) ? b.headers : [],
      }));
      setBatches(rows);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load reconciliation data');
    } finally {
      setLoading(false);
    }
  }, [selectedLedger, selectedPeriod]);

  // ── Expanded row: headers panel with drilldown to lines ───────────────────
  const expandedRowRender = (record: BatchRow) => (
    <HeadersPanel headers={record.headers} />
  );

  // ── Main batch columns ──────────────────────────────────────────────────────
  const columns = [
    {
      title: 'Batch ID',
      dataIndex: 'je_batch_id',
      key: 'je_batch_id',
      width: 90,
      render: (v: number) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Batch Name',
      dataIndex: 'batch_name',
      key: 'batch_name',
      ellipsis: true,
      width: 260,
    },
    {
      title: 'Period',
      dataIndex: 'period_name',
      key: 'period_name',
      width: 100,
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: 'Batch DR',
      dataIndex: 'batch_dr',
      key: 'batch_dr',
      align: 'right' as const,
      width: 140,
      render: (v: number) => <Text style={{ fontFamily: 'monospace' }}>{fmt(v)}</Text>,
    },
    {
      title: 'Batch CR',
      dataIndex: 'batch_cr',
      key: 'batch_cr',
      align: 'right' as const,
      width: 140,
      render: (v: number) => <Text style={{ fontFamily: 'monospace' }}>{fmt(v)}</Text>,
    },
    {
      title: 'Headers DR',
      dataIndex: 'headers_dr',
      key: 'headers_dr',
      align: 'right' as const,
      width: 140,
      render: (v: number) => <Text style={{ fontFamily: 'monospace' }}>{fmt(v)}</Text>,
    },
    {
      title: 'Lines DR',
      dataIndex: 'lines_dr',
      key: 'lines_dr',
      align: 'right' as const,
      width: 140,
      render: (v: number) => <Text style={{ fontFamily: 'monospace' }}>{fmt(v)}</Text>,
    },
    {
      title: 'Hdrs',
      dataIndex: 'header_count',
      key: 'header_count',
      align: 'center' as const,
      width: 55,
    },
    {
      title: 'Lines',
      dataIndex: 'line_count',
      key: 'line_count',
      align: 'center' as const,
      width: 55,
      render: (v: number) =>
        v === 0 ? <Tag color="warning" style={{ fontSize: 11 }}>0</Tag> : v,
    },
    {
      title: 'Batch↔Hdr',
      key: 'batch_hdr',
      width: 110,
      render: (_: any, r: BatchRow) => (
        <Space size={2}>
          {matchTag(r.batch_hdr_dr_ok, 'DR')}
          {matchTag(r.batch_hdr_cr_ok, 'CR')}
        </Space>
      ),
    },
    {
      title: 'Hdr↔Lines',
      key: 'hdr_lines',
      width: 110,
      render: (_: any, r: BatchRow) => (
        <Space size={2}>
          {matchTag(r.hdr_lines_dr_ok, 'DR')}
          {matchTag(r.hdr_lines_cr_ok, 'CR')}
        </Space>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 110,
      render: (_: any, r: BatchRow) => {
        const mismatch =
          r.batch_hdr_dr_ok === 'N' || r.batch_hdr_cr_ok === 'N' ||
          r.hdr_lines_dr_ok === 'N' || r.hdr_lines_cr_ok === 'N';
        const noLines = r.line_count === 0;
        if (mismatch)
          return <Badge status="error" text={<Text style={{ color: REDWOOD.error, fontSize: 12, fontWeight: 600 }}>Mismatch</Text>} />;
        if (noLines)
          return <Badge status="warning" text={<Text style={{ color: REDWOOD.warning, fontSize: 12 }}>No Lines</Text>} />;
        return <Badge status="success" text={<Text style={{ color: REDWOOD.success, fontSize: 12 }}>Matched</Text>} />;
      },
    },
  ];

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <Layout style={{ minHeight: '100vh', background: REDWOOD.neutral100 }}>
      <Content style={{ padding: '24px' }}>
        {/* Breadcrumb */}
        <Breadcrumb style={{ marginBottom: 16 }}>
          <Breadcrumb.Item><Link to="/"><HomeOutlined /></Link></Breadcrumb.Item>
          <Breadcrumb.Item><Link to="/gl">General Ledger</Link></Breadcrumb.Item>
          <Breadcrumb.Item>Fusion Journal Reconciliation</Breadcrumb.Item>
        </Breadcrumb>

        {/* Header */}
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <ReconciliationOutlined style={{ fontSize: 28, color: REDWOOD.primary }} />
          <div>
            <Title level={3} style={{ margin: 0, color: REDWOOD.neutral900 }}>
              Fusion Journal Reconciliation
            </Title>
            <Text style={{ color: REDWOOD.neutral600 }}>
              Compare batch totals ↔ header totals ↔ line totals
            </Text>
          </div>
        </div>

        {/* Filter Bar */}
        <Card
          size="small"
          style={{ marginBottom: 16, borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}
        >
          <Space wrap size="middle">
            <div>
              <Text style={{ fontSize: 12, color: REDWOOD.neutral600, display: 'block', marginBottom: 4 }}>
                Ledger
              </Text>
              <Select
                style={{ width: 260 }}
                placeholder="Select ledger"
                loading={loadingLedgers}
                value={selectedLedger ?? undefined}
                onChange={(v) => setSelectedLedger(v)}
                showSearch
                filterOption={(input, opt) =>
                  String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                options={ledgers.map((l) => ({
                  value: l.ledger_name,
                  label: `${l.ledger_name} (${l.batch_count} batches)`,
                }))}
              />
            </div>
            <div>
              <Text style={{ fontSize: 12, color: REDWOOD.neutral600, display: 'block', marginBottom: 4 }}>
                Period
              </Text>
              <Select
                style={{ width: 220 }}
                placeholder="All periods"
                loading={loadingLedgers}
                value={selectedPeriod ?? undefined}
                onChange={(v) => setSelectedPeriod(v)}
                allowClear
                showSearch
                filterOption={(input, opt) =>
                  String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                options={periods.map((p) => ({
                  value: p.period_name,
                  label: `${p.period_name}${p.batch_count != null ? ` (${p.batch_count})` : ''}`,
                }))}
              />
            </div>
            <div style={{ paddingTop: 20, display: 'flex', gap: 8 }}>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleLoad}
                disabled={!selectedLedger}
                loading={loading}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
              >
                Load
              </Button>
              <Tooltip title="View API URLs">
                <Button
                  icon={<ApiOutlined />}
                  onClick={() => setApiModalOpen(true)}
                />
              </Tooltip>
            </div>
          </Space>
        </Card>

        {/* Summary Cards */}
        {batches.length > 0 && (
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderRadius: 8, textAlign: 'center', borderTop: `3px solid ${REDWOOD.info}` }}>
                <Statistic
                  title="Total Batches"
                  value={totalBatches}
                  prefix={<UnorderedListOutlined style={{ color: REDWOOD.info }} />}
                  valueStyle={{ color: REDWOOD.info }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderRadius: 8, textAlign: 'center', borderTop: `3px solid ${REDWOOD.success}` }}>
                <Statistic
                  title="Matched"
                  value={matchedBatches}
                  prefix={<CheckCircleOutlined style={{ color: REDWOOD.success }} />}
                  valueStyle={{ color: REDWOOD.success }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderRadius: 8, textAlign: 'center', borderTop: `3px solid ${REDWOOD.error}` }}>
                <Statistic
                  title="Mismatched"
                  value={mismatchedBatches}
                  prefix={<CloseCircleOutlined style={{ color: REDWOOD.error }} />}
                  valueStyle={{ color: REDWOOD.error }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderRadius: 8, textAlign: 'center', borderTop: `3px solid ${REDWOOD.warning}` }}>
                <Statistic
                  title="No Lines"
                  value={noLinesBatches}
                  prefix={<WarningOutlined style={{ color: REDWOOD.warning }} />}
                  valueStyle={{ color: REDWOOD.warning }}
                />
              </Card>
            </Col>
          </Row>
        )}

        {/* Legend */}
        {batches.length > 0 && (
          <div style={{ marginBottom: 12, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Legend:</Text>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 14, borderRadius: 2, background: '#fff1f0', border: '1px solid #ffa39e', display: 'inline-block' }} />
              <Text style={{ fontSize: 12 }}>Mismatch</Text>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 14, borderRadius: 2, background: '#fffbe6', border: '1px solid #ffe58f', display: 'inline-block' }} />
              <Text style={{ fontSize: 12 }}>No Lines</Text>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 14, borderRadius: 2, background: '#f6ffed', border: '1px solid #b7eb8f', display: 'inline-block' }} />
              <Text style={{ fontSize: 12 }}>Matched</Text>
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <Alert
            type="error"
            message="Failed to load reconciliation data"
            description={error}
            showIcon
            closable
            onClose={() => setError(null)}
            style={{ marginBottom: 16 }}
          />
        )}

        {/* Main Table */}
        <Card
          style={{ borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}
          bodyStyle={{ padding: 0 }}
        >
          {!loading && batches.length === 0 && !error ? (
            <Empty
              description={
                selectedLedger
                  ? 'Click Load to fetch reconciliation data'
                  : 'Select a ledger to begin'
              }
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ padding: '48px 0' }}
            />
          ) : (
            <Spin spinning={loading}>
              <Table
                columns={columns}
                dataSource={batches}
                rowKey="key"
                size="small"
                scroll={{ x: 1400 }}
                expandable={{
                  expandedRowRender,
                  rowExpandable: (r) => r.header_count > 0,
                }}
                onRow={(record) => ({ style: rowStyle(record) })}
                pagination={{
                  pageSize: 50,
                  showSizeChanger: true,
                  pageSizeOptions: ['25', '50', '100'],
                  showTotal: (total) => `${total} batches`,
                }}
              />
            </Spin>
          )}
        </Card>
      </Content>

      {/* API URL Viewer Modal */}
      <Modal
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /> API Endpoints</Space>}
        open={apiModalOpen}
        onCancel={() => setApiModalOpen(false)}
        footer={null}
        width={720}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: REDWOOD.neutral600, marginBottom: 4, fontWeight: 600 }}>
            GET — Ledgers (with periods)
          </div>
          <Input.Group compact style={{ display: 'flex' }}>
            <Input value={ledgersUrl} readOnly style={{ fontFamily: 'monospace', fontSize: 12 }} />
            <Tooltip title="Copy">
              <Button icon={<CopyOutlined />} onClick={() => navigator.clipboard.writeText(ledgersUrl)} />
            </Tooltip>
            <Button
              type="primary"
              style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
              onClick={() => window.open(ledgersUrl, '_blank')}
            >
              Test
            </Button>
          </Input.Group>
        </div>

        <div>
          <div style={{ fontSize: 12, color: REDWOOD.neutral600, marginBottom: 4, fontWeight: 600 }}>
            GET — Reconciliation Data
          </div>
          <Input.Group compact style={{ display: 'flex' }}>
            <Input value={reconUrl} readOnly style={{ fontFamily: 'monospace', fontSize: 12 }} />
            <Tooltip title="Copy">
              <Button icon={<CopyOutlined />} onClick={() => navigator.clipboard.writeText(reconUrl)} />
            </Tooltip>
            <Button
              type="primary"
              style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
              disabled={!selectedLedger}
              onClick={() => window.open(reconUrl, '_blank')}
            >
              Test
            </Button>
          </Input.Group>
          {!selectedLedger && (
            <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginTop: 4 }}>
              Select a ledger to build the full URL
            </div>
          )}
        </div>
      </Modal>
    </Layout>
  );
}
