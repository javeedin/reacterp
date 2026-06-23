import React, { useState, useEffect, useCallback } from 'react';
import {
  Layout, Card, Row, Col, Breadcrumb, Typography, Select, Space,
  Button, Spin, Tag, Tooltip, message, Popover, Table,
} from 'antd';
import {
  HomeOutlined, LineChartOutlined, ReloadOutlined,
  CheckCircleOutlined, ClockCircleOutlined, ApiOutlined, PlayCircleOutlined, SyncOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { getBookControls, getDeprnPeriodsCurrent, getDeprnLastPeriod, getDeprnWorkbench } from '../../services/fa.service';
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

const CalculateDeprn: React.FC = () => {
  const [bookControls,  setBookControls]  = useState<BookControlRecord[]>([]);
  const [selectedBook,  setSelectedBook]  = useState<string>('');
  const [lastPeriod,    setLastPeriod]    = useState<any | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [calculating,   setCalculating]   = useState(false);

  // Inline workbench data
  const [wbItems,   setWbItems]   = useState<any[]>([]);
  const [wbSummary, setWbSummary] = useState<any>(null);
  const [wbLoading, setWbLoading] = useState(false);

  useEffect(() => {
    getBookControls().then((bc) => {
      setBookControls(bc);
      if (bc.length > 0) setSelectedBook(bc[0].bookTypeCode);
    });
  }, []);

  const loadAll = useCallback(async (book: string) => {
    if (!book) return;
    setLoading(true);
    try {
      const [, last] = await Promise.all([
        getDeprnPeriodsCurrent(book),
        getDeprnLastPeriod(book),
      ]);
      setLastPeriod(last);

      // Load workbench for last period
      if (last?.lastPeriodCounter) {
        setWbLoading(true);
        const result = await getDeprnWorkbench({
          bookTypeCode:  book,
          periodCounter: last.lastPeriodCounter,
          limit: 500,
        });
        setWbItems(result.items || []);
        setWbSummary(result.summary || null);
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

  const fmtDate = (v: string | null | undefined) => {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d.getTime())) return v;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const handleCalculate = async () => {
    setCalculating(true);
    try {
      await new Promise(res => setTimeout(res, 2000));
      message.success(`Depreciation calculated for ${lastPeriod?.nextPeriodName || 'next period'}`);
      loadAll(selectedBook);
    } catch {
      message.error('Calculation failed');
    } finally {
      setCalculating(false);
    }
  };

  const apiContent = (
    <div style={{ maxWidth: 520, fontSize: 12 }}>
      <div style={{ marginBottom: 8 }}>
        <Text strong>1. Last period status</Text>
        <Typography.Text copyable code style={{ display: 'block', fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}>
          {`${APEX_DB_CONFIG.baseUrl}/fa/deprn-periods/last?bookTypeCode=${encodeURIComponent(selectedBook)}`}
        </Typography.Text>
      </div>
      <div>
        <Text strong>2. Depreciation detail (by period counter)</Text>
        <Typography.Text copyable code style={{ display: 'block', fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}>
          {`${APEX_DB_CONFIG.baseUrl}/fa/deprn-workbench?bookTypeCode=${encodeURIComponent(selectedBook)}&periodCounter=${lastPeriod?.lastPeriodCounter || '...'}`}
        </Typography.Text>
      </div>
    </div>
  );

  const columns = [
    { title: 'Asset #',       dataIndex: 'assetNumber',  key: 'assetNumber',  width: 100, fixed: 'left' as const,
      render: (v: string) => <Text style={{ fontSize: 12, fontWeight: 600 }}>{v}</Text> },
    { title: 'Description',   dataIndex: 'description',  key: 'description',  width: 220,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'FY',            dataIndex: 'fiscalYear',   key: 'fiscalYear',   width: 60,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Cost',          dataIndex: 'adjustedCost', key: 'adjustedCost', width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: 'Deprn Amount',  dataIndex: 'deprnAmount',  key: 'deprnAmount',  width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12, color: REDWOOD.primary, fontWeight: 600 }}>{fmt(v)}</Text> },
    { title: 'YTD Deprn',     dataIndex: 'ytdDeprn',     key: 'ytdDeprn',     width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: 'Reserve',       dataIndex: 'deprnReserve', key: 'deprnReserve', width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: 'NBV',           dataIndex: 'nbv',          key: 'nbv',          width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12, color: REDWOOD.success, fontWeight: 600 }}>{fmt(v)}</Text> },
    { title: 'Deprn Run Date',dataIndex: 'deprnRunDate', key: 'deprnRunDate', width: 130,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{fmtDate(v)}</Text> },
  ];

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
              {/* Period status cards */}
              <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
                <Col xs={12} sm={8} md={5}>
                  <Card size="small" style={{
                    borderRadius: 8, border: `2px solid ${REDWOOD.success}`,
                    textAlign: 'center', minHeight: 110, background: '#f6ffed',
                  }} styles={{ body: { padding: '14px 12px' } }}>
                    <Text style={{ fontSize: 11, color: REDWOOD.success, display: 'block', marginBottom: 6, fontWeight: 600 }}>
                      Last Depreciation Run
                    </Text>
                    {lastPeriod?.lastPeriodName ? (
                      <>
                        <div style={{ fontSize: 22, fontWeight: 700, color: REDWOOD.success, lineHeight: 1.2 }}>
                          {lastPeriod.lastPeriodName}
                        </div>
                        <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontSize: 11, marginTop: 6 }}>
                          FY {lastPeriod.fiscalYear}
                        </Tag>
                      </>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>Never Run</Text>
                    )}
                  </Card>
                </Col>

                <Col xs={12} sm={8} md={5}>
                  <Card size="small" style={{
                    borderRadius: 8, border: `2px solid #1677ff`,
                    textAlign: 'center', minHeight: 110, background: '#f0f5ff',
                  }} styles={{ body: { padding: '14px 12px' } }}>
                    <Text style={{ fontSize: 11, color: '#1677ff', display: 'block', marginBottom: 6, fontWeight: 600 }}>
                      Next Period to Run
                    </Text>
                    {lastPeriod?.nextPeriodName ? (
                      <>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#1677ff', lineHeight: 1.2 }}>
                          {lastPeriod.nextPeriodName}
                        </div>
                        <Tag color="processing" icon={<ClockCircleOutlined />} style={{ fontSize: 11, marginTop: 6 }}>Pending</Tag>
                      </>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
                    )}
                  </Card>
                </Col>

                {/* Calculate button card */}
                <Col xs={24} sm={8} md={6} style={{ display: 'flex', alignItems: 'center' }}>
                  <Button
                    type="primary"
                    size="large"
                    icon={calculating ? <SyncOutlined spin /> : <PlayCircleOutlined />}
                    loading={calculating}
                    onClick={handleCalculate}
                    style={{ background: FA_COLOR, borderColor: FA_COLOR, height: 48 }}
                  >
                    Calculate Depreciation for {lastPeriod?.nextPeriodName || '—'}
                  </Button>
                </Col>
              </Row>

              {/* Inline workbench detail */}
              <Card
                style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                styles={{ body: { padding: '16px 20px' } }}
                title={
                  <Space>
                    <LineChartOutlined style={{ color: FA_COLOR }} />
                    <Text strong>
                      Depreciation Details — {lastPeriod?.lastPeriodName || '—'}
                    </Text>
                    {lastPeriod?.lastPeriodName && (
                      <Tag color="green" style={{ fontSize: 11 }}>Period Counter: {lastPeriod.lastPeriodCounter}</Tag>
                    )}
                  </Space>
                }
              >
                {wbLoading ? (
                  <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
                ) : (
                  <>
                    {/* Summary cards */}
                    {wbSummary && (
                      <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
                        {[
                          { label: 'Total Cost',    value: wbSummary.totalCost,         color: '#1677ff' },
                          { label: 'Deprn Amount',  value: wbSummary.totalDeprnAmount,  color: REDWOOD.primary },
                          { label: 'Total Reserve', value: wbSummary.totalDeprnReserve, color: REDWOOD.warning },
                          { label: 'Total NBV',     value: wbSummary.totalNbv,          color: REDWOOD.success },
                        ].map(s => (
                          <Col xs={12} md={6} key={s.label}>
                            <Card size="small" styles={{ body: { padding: '10px 14px' } }}
                              style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, background: REDWOOD.neutral100 }}>
                              <Text style={{ fontSize: 11, color: REDWOOD.neutral500, display: 'block' }}>{s.label}</Text>
                              <Text style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{fmt(s.value)}</Text>
                            </Card>
                          </Col>
                        ))}
                      </Row>
                    )}

                    <Table
                      dataSource={wbItems}
                      columns={columns}
                      rowKey="assetId"
                      size="small"
                      scroll={{ x: 1100, y: 480 }}
                      pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `${t} assets` }}
                      locale={{ emptyText: lastPeriod?.lastPeriodName ? 'No depreciation records found' : 'Select a book to load data' }}
                      summary={() => wbSummary ? (
                        <Table.Summary fixed>
                          <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 600 }}>
                            <Table.Summary.Cell index={0} colSpan={3}><Text strong>Total</Text></Table.Summary.Cell>
                            <Table.Summary.Cell index={3} align="right"><Text strong>{fmt(wbSummary.totalCost)}</Text></Table.Summary.Cell>
                            <Table.Summary.Cell index={4} align="right"><Text style={{ color: REDWOOD.primary, fontWeight: 600 }}>{fmt(wbSummary.totalDeprnAmount)}</Text></Table.Summary.Cell>
                            <Table.Summary.Cell index={5} align="right"><Text strong>{fmt(wbSummary.totalDeprnReserve)}</Text></Table.Summary.Cell>
                            <Table.Summary.Cell index={6} align="right"><Text strong>{fmt(wbSummary.totalDeprnReserve)}</Text></Table.Summary.Cell>
                            <Table.Summary.Cell index={7} align="right"><Text style={{ color: REDWOOD.success, fontWeight: 600 }}>{fmt(wbSummary.totalNbv)}</Text></Table.Summary.Cell>
                            <Table.Summary.Cell index={8} />
                          </Table.Summary.Row>
                        </Table.Summary>
                      ) : undefined}
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
