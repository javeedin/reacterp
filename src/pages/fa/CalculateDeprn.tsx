import React, { useState, useEffect, useCallback } from 'react';
import {
  Layout, Card, Row, Col, Breadcrumb, Typography, Select, Space,
  Button, Spin, Tag, Tooltip, message, Popover, Table, Alert, Divider,
} from 'antd';
import {
  HomeOutlined, LineChartOutlined, ReloadOutlined,
  CheckCircleOutlined, ClockCircleOutlined, ApiOutlined,
  PlayCircleOutlined, SyncOutlined, CloudUploadOutlined, EyeOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import {
  getBookControls, getDeprnLastPeriod,
  getDeprnPreview, postDeprnCalculate,
  getDeprnWorkbench,
} from '../../services/fa.service';
import { APEX_DB_CONFIG } from '../../config/api.config';
import type { BookControlRecord } from '../../services/fa.service';

const { Content } = Layout;
const { Text, Title } = Typography;
const { Option } = Select;

const REDWOOD = {
  primary:    '#C74634',
  success:    '#1D7B4D',
  warning:    '#D4A800',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral500: '#8C8C8C',
  surface:    '#FFFFFF',
};
const FA_COLOR = '#CA7700';

const fmt = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type ViewMode = 'last' | 'preview' | 'compare';

const CalculateDeprn: React.FC = () => {
  const [bookControls, setBookControls] = useState<BookControlRecord[]>([]);
  const [selectedBook, setSelectedBook] = useState<string>('');
  const [lastPeriod,   setLastPeriod]   = useState<any | null>(null);
  const [loading,      setLoading]      = useState(false);

  // Last period workbench
  const [wbItems,   setWbItems]   = useState<any[]>([]);
  const [wbSummary, setWbSummary] = useState<any>(null);
  const [wbLoading, setWbLoading] = useState(false);

  // Preview (next period calculated)
  const [previewItems,   setPreviewItems]   = useState<any[]>([]);
  const [previewSummary, setPreviewSummary] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewed,      setPreviewed]      = useState(false);

  // Posting
  const [posting, setPosting] = useState(false);

  // Which table to show
  const [viewMode, setViewMode] = useState<ViewMode>('last');

  useEffect(() => {
    getBookControls().then((bc) => {
      setBookControls(bc);
      if (bc.length > 0) setSelectedBook(bc[0].bookTypeCode);
    });
  }, []);

  const loadAll = useCallback(async (book: string) => {
    if (!book) return;
    setLoading(true);
    setPreviewed(false);
    setPreviewItems([]);
    setPreviewSummary(null);
    setViewMode('last');
    try {
      const last = await getDeprnLastPeriod(book);
      setLastPeriod(last);

      if (last?.lastPeriodCounter) {
        setWbLoading(true);
        const wb = await getDeprnWorkbench({
          bookTypeCode:  book,
          periodCounter: last.lastPeriodCounter,
          limit: 500,
        });
        setWbItems(wb.items || []);
        setWbSummary(wb.summary || null);
        setWbLoading(false);
      } else {
        setWbItems([]);
        setWbSummary(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBook) loadAll(selectedBook);
  }, [selectedBook, loadAll]);

  const handlePreview = async () => {
    if (!lastPeriod?.nextPeriodName) return;
    setPreviewLoading(true);
    setViewMode('preview');
    try {
      const result = await getDeprnPreview(selectedBook, lastPeriod.nextPeriodName);
      if (result.success) {
        setPreviewItems(result.items || []);
        setPreviewSummary(result.summary || null);
        setPreviewed(true);
      } else {
        message.error(result.error || 'Preview failed');
        setViewMode('last');
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePost = async () => {
    if (!lastPeriod?.nextPeriodName || !lastPeriod?.lastPeriodCounter) return;
    setPosting(true);
    try {
      const result = await postDeprnCalculate({
        bookTypeCode:  selectedBook,
        periodName:    lastPeriod.nextPeriodName,
        periodCounter: Number(lastPeriod.lastPeriodCounter) + 1,
      });
      if (result.success) {
        message.success(`Depreciation posted for ${lastPeriod.nextPeriodName} — ${result.assetsProcessed} assets processed`);
        await loadAll(selectedBook);
      } else {
        message.error(result.error || 'Post failed');
      }
    } finally {
      setPosting(false);
    }
  };

  const fmtDate = (v: string | null | undefined) => {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d.getTime())) return v;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const apiContent = (
    <div style={{ maxWidth: 560, fontSize: 12 }}>
      <div style={{ marginBottom: 10 }}>
        <Text strong>1. Last period status</Text>
        <Typography.Text copyable code style={{ display: 'block', fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}>
          {`${APEX_DB_CONFIG.baseUrl}/fa/deprn-periods/last?bookTypeCode=${encodeURIComponent(selectedBook)}`}
        </Typography.Text>
      </div>
      <div style={{ marginBottom: 10 }}>
        <Text strong>2. Last period actuals (workbench)</Text>
        <Typography.Text copyable code style={{ display: 'block', fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}>
          {`${APEX_DB_CONFIG.baseUrl}/fa/deprn-workbench?bookTypeCode=${encodeURIComponent(selectedBook)}&periodCounter=${lastPeriod?.lastPeriodCounter || '...'}`}
        </Typography.Text>
      </div>
      <div style={{ marginBottom: 10 }}>
        <Text strong>3. Preview next period depreciation</Text>
        <Typography.Text copyable code style={{ display: 'block', fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}>
          {`${APEX_DB_CONFIG.baseUrl}/fa/deprn-calculate/preview?bookTypeCode=${encodeURIComponent(selectedBook)}&periodName=${encodeURIComponent(lastPeriod?.nextPeriodName || '')}`}
        </Typography.Text>
      </div>
      <div>
        <Text strong>4. Post depreciation</Text>
        <Typography.Text copyable code style={{ display: 'block', fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}>
          {`POST ${APEX_DB_CONFIG.baseUrl}/fa/deprn-calculate`}
        </Typography.Text>
        <Typography.Text code style={{ display: 'block', fontSize: 11, marginTop: 2 }}>
          {`{ "bookTypeCode": "${selectedBook}", "periodName": "${lastPeriod?.nextPeriodName || ''}", "periodCounter": ${lastPeriod?.lastPeriodCounter ? Number(lastPeriod.lastPeriodCounter) + 1 : '...'} }`}
        </Typography.Text>
      </div>
    </div>
  );

  const summaryCards = (summary: any, isPreview: boolean) => [
    { label: 'Total Cost',       value: summary?.totalCost,                          color: '#1677ff' },
    { label: isPreview ? 'Calculated Deprn' : 'Deprn Amount', value: isPreview ? summary?.totalDeprnAmount : summary?.totalDeprnAmount, color: REDWOOD.primary },
    { label: isPreview ? 'New Reserve'      : 'Total Reserve', value: isPreview ? summary?.totalNewReserve  : summary?.totalDeprnReserve, color: REDWOOD.warning },
    { label: 'Total NBV',        value: summary?.totalNbv,                           color: REDWOOD.success },
  ];

  const lastColumns = [
    { title: 'Asset #',       dataIndex: 'assetNumber',  key: 'assetNumber',  width: 100, fixed: 'left' as const,
      render: (v: string) => <Text style={{ fontSize: 12, fontWeight: 600 }}>{v}</Text> },
    { title: 'Description',   dataIndex: 'description',  key: 'description',  width: 220,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'FY',            dataIndex: 'fiscalYear',   key: 'fiscalYear',   width: 60 },
    { title: 'Cost',          dataIndex: 'adjustedCost', key: 'adjustedCost', width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: 'Deprn Amount',  dataIndex: 'deprnAmount',  key: 'deprnAmount',  width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12, color: REDWOOD.primary, fontWeight: 600 }}>{fmt(v)}</Text> },
    { title: 'YTD Deprn',     dataIndex: 'ytdDeprn',     key: 'ytdDeprn',     width: 120, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: 'Reserve',       dataIndex: 'deprnReserve', key: 'deprnReserve', width: 120, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: 'NBV',           dataIndex: 'nbv',          key: 'nbv',          width: 120, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12, color: REDWOOD.success, fontWeight: 600 }}>{fmt(v)}</Text> },
    { title: 'Run Date',      dataIndex: 'deprnRunDate', key: 'deprnRunDate', width: 120,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{fmtDate(v)}</Text> },
  ];

  const previewColumns = [
    { title: 'Asset #',      dataIndex: 'assetNumber',  key: 'assetNumber',  width: 100, fixed: 'left' as const,
      render: (v: string) => <Text style={{ fontSize: 12, fontWeight: 600 }}>{v}</Text> },
    { title: 'Description',  dataIndex: 'description',  key: 'description',  width: 220,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Method',       dataIndex: 'methodCode',   key: 'methodCode',   width: 90,
      render: (v: string) => <Tag style={{ fontSize: 11 }}>{v || '—'}</Tag> },
    { title: 'Life (Months)',dataIndex: 'lifeInMonths', key: 'lifeInMonths', width: 110, align: 'right' as const },
    { title: 'Cost',         dataIndex: 'adjustedCost', key: 'adjustedCost', width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: 'Salvage',      dataIndex: 'salvageValue', key: 'salvageValue', width: 110, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: 'Deprn Amount', dataIndex: 'deprnAmount',  key: 'deprnAmount',  width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12, color: REDWOOD.primary, fontWeight: 600 }}>{fmt(v)}</Text> },
    { title: 'Prior Reserve',dataIndex: 'priorReserve', key: 'priorReserve', width: 120, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: 'New Reserve',  dataIndex: 'newReserve',   key: 'newReserve',   width: 120, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: 'NBV',          dataIndex: 'nbv',          key: 'nbv',          width: 120, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12, color: REDWOOD.success, fontWeight: 600 }}>{fmt(v)}</Text> },
  ];

  const compareColumns = [
    { title: 'Asset #',     dataIndex: 'assetNumber', key: 'assetNumber', width: 100, fixed: 'left' as const,
      render: (v: string) => <Text style={{ fontSize: 12, fontWeight: 600 }}>{v}</Text> },
    { title: 'Description', dataIndex: 'description', key: 'description', width: 200,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Method',      dataIndex: 'methodCode',  key: 'methodCode',  width: 80,
      render: (v: string) => <Tag style={{ fontSize: 11 }}>{v || '—'}</Tag> },
    { title: lastPeriod?.lastPeriodName ?? 'Last Deprn', dataIndex: 'lastDeprn', key: 'lastDeprn', width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: lastPeriod?.nextPeriodName ?? 'Next Deprn', dataIndex: 'nextDeprn', key: 'nextDeprn', width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12, color: '#1677ff', fontWeight: 600 }}>{fmt(v)}</Text> },
    { title: 'Difference',  dataIndex: 'difference',  key: 'difference',  width: 130, align: 'right' as const,
      render: (v: number) => {
        const color = v > 0 ? REDWOOD.primary : v < 0 ? REDWOOD.success : REDWOOD.neutral500;
        const prefix = v > 0 ? '+' : '';
        return <Text style={{ fontSize: 12, fontWeight: 700, color }}>{v === 0 ? '—' : `${prefix}${fmt(v)}`}</Text>;
      },
    },
    { title: `${lastPeriod?.lastPeriodName ?? 'Last'} NBV`, dataIndex: 'lastNbv', key: 'lastNbv', width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: `${lastPeriod?.nextPeriodName ?? 'Next'} NBV`, dataIndex: 'nextNbv', key: 'nextNbv', width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12, color: REDWOOD.success }}>{fmt(v)}</Text> },
  ];

  const isPreview = viewMode === 'preview';
  const isCompare = viewMode === 'compare';

  // Build compare rows — join last actuals + preview by assetId
  const compareRows = React.useMemo(() => {
    if (!previewed) return [];
    const lastMap = new Map(wbItems.map(r => [String(r.assetId), r]));
    return previewItems.map(pr => {
      const last = lastMap.get(String(pr.assetId));
      const lastAmt  = Number(last?.deprnAmount  ?? 0);
      const nextAmt  = Number(pr.deprnAmount      ?? 0);
      const diff     = nextAmt - lastAmt;
      return {
        assetId:      pr.assetId,
        assetNumber:  pr.assetNumber,
        description:  pr.description,
        methodCode:   pr.methodCode,
        lastPeriod:   lastPeriod?.lastPeriodName  ?? '—',
        nextPeriod:   lastPeriod?.nextPeriodName  ?? '—',
        lastDeprn:    lastAmt,
        nextDeprn:    nextAmt,
        difference:   diff,
        lastNbv:      Number(last?.nbv ?? 0),
        nextNbv:      Number(pr.nbv    ?? 0),
      };
    });
  }, [previewed, wbItems, previewItems, lastPeriod]);

  const activeItems   = isCompare ? compareRows   : isPreview ? previewItems   : wbItems;
  const activeSummary = isCompare ? null          : isPreview ? previewSummary : wbSummary;
  const activeLoading = isCompare ? false         : isPreview ? previewLoading : wbLoading;
  const activeRowKey  = 'assetId';

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Header bar */}
        <div style={{ padding: '12px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/fa">Fixed Assets</Link> },
            { title: 'Calculate Depreciation' },
          ]} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <Space align="center">
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: `linear-gradient(135deg, ${FA_COLOR} 0%, #9E5C00 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <LineChartOutlined style={{ fontSize: 18, color: '#fff' }} />
              </div>
              <div>
                <Title level={5} style={{ margin: 0 }}>Calculate Depreciation</Title>
                <Text type="secondary" style={{ fontSize: 11 }}>Run depreciation for the current open period</Text>
              </div>
            </Space>
            <Space>
              <Text type="secondary" style={{ fontSize: 12 }}>Book:</Text>
              <Select
                value={selectedBook || undefined}
                onChange={(v) => setSelectedBook(v)}
                style={{ width: 240 }}
                placeholder="Select book"
                showSearch
              >
                {bookControls.map(b => (
                  <Option key={b.bookTypeCode} value={b.bookTypeCode}>{b.bookTypeCode}</Option>
                ))}
              </Select>
              <Tooltip title="Refresh">
                <Button icon={<ReloadOutlined />} onClick={() => loadAll(selectedBook)} loading={loading} />
              </Tooltip>
              <Popover title="API Requests" content={apiContent} trigger="click" placement="bottomRight">
                <Tooltip title="Show API calls">
                  <Button icon={<ApiOutlined />} style={{ color: '#1677ff', borderColor: '#1677ff' }} />
                </Tooltip>
              </Popover>
            </Space>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
          ) : (
            <>
              {/* Period cards + action buttons */}
              <Row gutter={[12, 12]} style={{ marginBottom: 20 }} align="middle">
                {/* Last Run */}
                <Col xs={12} sm={6} md={4}>
                  <Card size="small" style={{
                    borderRadius: 8, border: `2px solid ${REDWOOD.success}`,
                    textAlign: 'center', background: '#f6ffed',
                  }} styles={{ body: { padding: '12px' } }}>
                    <Text style={{ fontSize: 11, color: REDWOOD.success, display: 'block', marginBottom: 4, fontWeight: 600 }}>
                      Last Depreciation Run
                    </Text>
                    {lastPeriod?.lastPeriodName ? (
                      <>
                        <div style={{ fontSize: 20, fontWeight: 700, color: REDWOOD.success }}>
                          {lastPeriod.lastPeriodName}
                        </div>
                        <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontSize: 11, marginTop: 4 }}>
                          FY {lastPeriod.fiscalYear}
                        </Tag>
                      </>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>Never Run</Text>
                    )}
                  </Card>
                </Col>

                {/* Next Period */}
                <Col xs={12} sm={6} md={4}>
                  <Card size="small" style={{
                    borderRadius: 8, border: `2px solid #1677ff`,
                    textAlign: 'center', background: '#f0f5ff',
                  }} styles={{ body: { padding: '12px' } }}>
                    <Text style={{ fontSize: 11, color: '#1677ff', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                      Next Period to Run
                    </Text>
                    {lastPeriod?.nextPeriodName ? (
                      <>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#1677ff' }}>
                          {lastPeriod.nextPeriodName}
                        </div>
                        <Tag color="processing" icon={<ClockCircleOutlined />} style={{ fontSize: 11, marginTop: 4 }}>Pending</Tag>
                      </>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
                    )}
                  </Card>
                </Col>

                {/* Action buttons */}
                <Col xs={24} sm={12} md={10}>
                  <Space wrap>
                    <Button
                      icon={<EyeOutlined />}
                      onClick={handlePreview}
                      loading={previewLoading}
                      disabled={!lastPeriod?.nextPeriodName}
                      style={{ height: 44 }}
                    >
                      Preview {lastPeriod?.nextPeriodName || ''} Depreciation
                    </Button>
                    <Button
                      type="primary"
                      icon={posting ? <SyncOutlined spin /> : <CloudUploadOutlined />}
                      loading={posting}
                      disabled={!previewed || !lastPeriod?.nextPeriodName}
                      onClick={handlePost}
                      style={{ height: 44, background: previewed ? FA_COLOR : undefined, borderColor: previewed ? FA_COLOR : undefined }}
                    >
                      Post Depreciation
                    </Button>
                    {previewed && (
                      <Tag color="orange" style={{ height: 44, display: 'flex', alignItems: 'center', fontSize: 12 }}>
                        <PlayCircleOutlined style={{ marginRight: 4 }} />
                        Preview ready — review then Post
                      </Tag>
                    )}
                  </Space>
                </Col>
              </Row>

              {/* Toggle tabs */}
              <div style={{ marginBottom: 12 }}>
                <Space>
                  <Button
                    type={viewMode === 'last' ? 'primary' : 'default'}
                    size="small"
                    onClick={() => setViewMode('last')}
                    style={viewMode === 'last' ? { background: REDWOOD.success, borderColor: REDWOOD.success } : {}}
                  >
                    Last Period — {lastPeriod?.lastPeriodName || '—'}
                  </Button>
                  {previewed && (
                    <Button
                      type={viewMode === 'preview' ? 'primary' : 'default'}
                      size="small"
                      onClick={() => setViewMode('preview')}
                      style={viewMode === 'preview' ? { background: FA_COLOR, borderColor: FA_COLOR } : {}}
                    >
                      Preview — {lastPeriod?.nextPeriodName}
                    </Button>
                  )}
                  {previewed && (
                    <Button
                      type={viewMode === 'compare' ? 'primary' : 'default'}
                      size="small"
                      icon={<SwapOutlined />}
                      onClick={() => setViewMode('compare')}
                      style={viewMode === 'compare' ? { background: '#722ed1', borderColor: '#722ed1' } : { color: '#722ed1', borderColor: '#722ed1' }}
                    >
                      Compare
                    </Button>
                  )}
                </Space>
              </div>

              {/* Preview notice */}
              {isPreview && (
                <Alert type="warning" showIcon style={{ marginBottom: 12 }}
                  message={`Depreciation preview for ${lastPeriod?.nextPeriodName} — amounts are calculated but NOT yet posted. Click "Post Depreciation" to commit.`}
                />
              )}

              {/* Compare notice + summary */}
              {isCompare && compareRows.length > 0 && (() => {
                const totalLast = compareRows.reduce((s, r) => s + r.lastDeprn, 0);
                const totalNext = compareRows.reduce((s, r) => s + r.nextDeprn, 0);
                const totalDiff = totalNext - totalLast;
                return (
                  <Row gutter={[10, 10]} style={{ marginBottom: 12 }}>
                    {[
                      { label: `${lastPeriod?.lastPeriodName} Deprn`, value: totalLast, color: REDWOOD.neutral500 },
                      { label: `${lastPeriod?.nextPeriodName} Deprn`, value: totalNext, color: '#1677ff' },
                      { label: 'Total Difference', value: totalDiff,
                        color: totalDiff > 0 ? REDWOOD.primary : totalDiff < 0 ? REDWOOD.success : REDWOOD.neutral500 },
                    ].map(s => (
                      <Col xs={8} key={s.label}>
                        <Card size="small" styles={{ body: { padding: '10px 14px' } }}
                          style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, background: REDWOOD.neutral100 }}>
                          <Text style={{ fontSize: 11, color: REDWOOD.neutral500, display: 'block' }}>{s.label}</Text>
                          <Text style={{ fontSize: 15, fontWeight: 700, color: s.color }}>
                            {s.label === 'Total Difference' && totalDiff > 0 ? '+' : ''}{fmt(s.value)}
                          </Text>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                );
              })()}

              {/* Details card */}
              <Card
                style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                styles={{ body: { padding: '16px 20px' } }}
                title={
                  <Space>
                    <LineChartOutlined style={{ color: isPreview ? FA_COLOR : REDWOOD.success }} />
                    <Text strong>
                      {isCompare
                        ? `Compare — ${lastPeriod?.lastPeriodName} vs ${lastPeriod?.nextPeriodName}`
                        : isPreview
                          ? `Calculated Depreciation — ${lastPeriod?.nextPeriodName} (Preview)`
                          : `Depreciation Details — ${lastPeriod?.lastPeriodName || '—'}`}
                    </Text>
                    {!isPreview && !isCompare && lastPeriod?.lastPeriodCounter && (
                      <Tag color="green" style={{ fontSize: 11 }}>Counter: {lastPeriod.lastPeriodCounter}</Tag>
                    )}
                    {isCompare && (
                      <Tag color="purple" icon={<SwapOutlined />} style={{ fontSize: 11 }}>
                        {compareRows.length} assets
                      </Tag>
                    )}
                  </Space>
                }
              >
                {activeLoading ? (
                  <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
                ) : (
                  <>
                    {activeSummary && (
                      <>
                        <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
                          {summaryCards(activeSummary, isPreview).map(s => (
                            <Col xs={12} md={6} key={s.label}>
                              <Card size="small" styles={{ body: { padding: '10px 14px' } }}
                                style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, background: REDWOOD.neutral100 }}>
                                <Text style={{ fontSize: 11, color: REDWOOD.neutral500, display: 'block' }}>{s.label}</Text>
                                <Text style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{fmt(s.value)}</Text>
                              </Card>
                            </Col>
                          ))}
                        </Row>
                        <Divider style={{ margin: '0 0 12px' }} />
                      </>
                    )}

                    <Table
                      dataSource={activeItems}
                      columns={isCompare ? compareColumns : isPreview ? previewColumns : lastColumns}
                      rowKey={activeRowKey}
                      size="small"
                      scroll={{ x: isCompare ? 1100 : isPreview ? 1200 : 1100, y: 420 }}
                      pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `${t} assets` }}
                      locale={{ emptyText: lastPeriod ? 'No records found' : 'Select a book' }}
                      rowClassName={(r: any) =>
                        isCompare && r.difference > 0 ? 'row-increase'
                        : isCompare && r.difference < 0 ? 'row-decrease' : ''
                      }
                    />
                  </>
                )}
              </Card>
            </>
          )}
        </div>
      </Content>
    </Layout>
  );
};

export default CalculateDeprn;
