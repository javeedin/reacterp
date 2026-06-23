import React, { useState, useEffect, useCallback } from 'react';
import {
  Layout, Card, Row, Col, Breadcrumb, Typography, Select, Space,
  Button, Spin, Tag, Descriptions, Divider, Tooltip, message, Badge, Modal,
} from 'antd';
import {
  HomeOutlined, LineChartOutlined, ReloadOutlined, PlayCircleOutlined,
  CheckCircleOutlined, ClockCircleOutlined, SyncOutlined, ApiOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { getBookControls, getDeprnPeriodsCurrent, getDeprnLastPeriod } from '../../services/fa.service';
import { APEX_DB_CONFIG } from '../../config/api.config';
import type { BookControlRecord } from '../../services/fa.service';

const { Content } = Layout;
const { Text, Title } = Typography;
const { Option } = Select;

const REDWOOD = {
  primary:    '#C74634',
  success:    '#1D7B4D',
  warning:    '#D4A800',
  info:       '#0572CE',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral300: '#C7C7C7',
  neutral500: '#8C8C8C',
  neutral900: '#1A1A1A',
  surface:    '#FFFFFF',
};
const FA_COLOR = '#CA7700';

const CalculateDeprn: React.FC = () => {
  const [bookControls, setBookControls] = useState<BookControlRecord[]>([]);
  const [selectedBook, setSelectedBook] = useState<string>('');
  const [periodData,   setPeriodData]   = useState<any[]>([]);
  const [lastPeriod,   setLastPeriod]   = useState<any | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [calculating,  setCalculating]  = useState(false);
  const [lastApiUrl,   setLastApiUrl]   = useState('');

  useEffect(() => {
    getBookControls().then((bc) => {
      setBookControls(bc);
      if (bc.length > 0) setSelectedBook(bc[0].bookTypeCode);
    });
  }, []);

  const loadPeriod = useCallback(async (book: string) => {
    if (!book) return;
    setLoading(true);
    const url = `${APEX_DB_CONFIG.baseUrl}/fa/deprn-periods/current?bookTypeCode=${encodeURIComponent(book)}`;
    setLastApiUrl(url);
    try {
      const [items, last] = await Promise.all([
        getDeprnPeriodsCurrent(book),
        getDeprnLastPeriod(book),
      ]);
      setPeriodData(items);
      setLastPeriod(last);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBook) loadPeriod(selectedBook);
  }, [selectedBook, loadPeriod]);

  const currentBook = periodData.find(p => p.bookTypeCode === selectedBook) || null;

  const handleCalculate = async () => {
    if (!currentBook) return;
    setCalculating(true);
    try {
      // Stub — in production this would POST to fa/deprn-calculate
      await new Promise(res => setTimeout(res, 2000));
      message.success(`Depreciation calculated for ${currentBook.openPeriodName || 'current period'}`);
      loadPeriod(selectedBook);
    } catch {
      message.error('Calculation failed');
    } finally {
      setCalculating(false);
    }
  };

  const fmtDate = (v: string | null | undefined) => {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d.getTime())) return v;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const deprnAlreadyRun = currentBook?.deprnRun === 'Y';

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
                <Button icon={<ReloadOutlined />} onClick={() => loadPeriod(selectedBook)} loading={loading} />
              </Tooltip>
              {selectedBook && (
                <Tooltip title="Show API URL">
                  <Button
                    icon={<ApiOutlined />}
                    style={{ color: '#1677ff', borderColor: '#1677ff' }}
                    onClick={() => Modal.info({
                      title: 'API Request — fa/deprn-periods/current',
                      width: 860,
                      content: (
                        <Typography.Text copyable style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
                          {lastApiUrl || `${APEX_DB_CONFIG.baseUrl}/fa/deprn-periods/current?bookTypeCode=${encodeURIComponent(selectedBook)}`}
                        </Typography.Text>
                      ),
                    })}
                  />
                </Tooltip>
              )}
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
                {/* Last Run Period */}
                <Col xs={12} sm={8} md={5}>
                  <Card
                    size="small"
                    style={{
                      borderRadius: 8,
                      border: `2px solid ${REDWOOD.success}`,
                      textAlign: 'center', minHeight: 120,
                      background: '#f6ffed',
                    }}
                    styles={{ body: { padding: '16px 12px' } }}
                  >
                    <Text style={{ fontSize: 11, color: REDWOOD.success, display: 'block', marginBottom: 8, fontWeight: 600 }}>
                      Last Depreciation Run
                    </Text>
                    {lastPeriod?.lastPeriodName ? (
                      <>
                        <div style={{ fontSize: 22, fontWeight: 700, color: REDWOOD.success, lineHeight: 1.2 }}>
                          {lastPeriod.lastPeriodName}
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontSize: 11 }}>
                            FY {lastPeriod.fiscalYear}
                          </Tag>
                        </div>
                      </>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>Never Run</Text>
                    )}
                  </Card>
                </Col>

                {/* Next Period to Run */}
                <Col xs={12} sm={8} md={5}>
                  <Card
                    size="small"
                    style={{
                      borderRadius: 8,
                      border: `2px solid #1677ff`,
                      textAlign: 'center', minHeight: 120,
                      background: '#f0f5ff',
                    }}
                    styles={{ body: { padding: '16px 12px' } }}
                  >
                    <Text style={{ fontSize: 11, color: '#1677ff', display: 'block', marginBottom: 8, fontWeight: 600 }}>
                      Next Period to Run
                    </Text>
                    {lastPeriod?.nextPeriodName ? (
                      <>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#1677ff', lineHeight: 1.2 }}>
                          {lastPeriod.nextPeriodName}
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <Tag color="processing" icon={<ClockCircleOutlined />} style={{ fontSize: 11 }}>Pending</Tag>
                        </div>
                      </>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
                    )}
                  </Card>
                </Col>
              </Row>

              {/* Period Details + Action */}
              {currentBook && (
                <Card
                  style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                  styles={{ body: { padding: '20px 24px' } }}
                  title={
                    <Space>
                      <LineChartOutlined style={{ color: FA_COLOR }} />
                      <Text strong>Period Details</Text>
                    </Space>
                  }
                  extra={
                    <Space>
                      <Button
                        type="primary"
                        icon={calculating ? <SyncOutlined spin /> : <PlayCircleOutlined />}
                        loading={calculating}
                        disabled={deprnAlreadyRun}
                        onClick={handleCalculate}
                        style={{ background: deprnAlreadyRun ? undefined : FA_COLOR, borderColor: deprnAlreadyRun ? undefined : FA_COLOR }}
                      >
                        {deprnAlreadyRun ? 'Already Calculated' : 'Calculate Depreciation'}
                      </Button>
                    </Space>
                  }
                >
                  <Row gutter={[32, 0]}>
                    <Col xs={24} md={12}>
                      <Descriptions column={1} size="small"
                        styles={{ label: { fontWeight: 500, color: REDWOOD.neutral500, width: 180 } }}
                      >
                        <Descriptions.Item label="Period Close Date">
                          <Text strong>{fmtDate(currentBook.openPeriodCloseDate)}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="Book">
                          <Text strong>{currentBook.bookTypeCode}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="Open Period">
                          <Text strong>{currentBook.openPeriodName || '—'}</Text>
                          {' '}
                          <Text type="secondary" style={{ fontSize: 11 }}>FY {currentBook.openFiscalYear}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="Period Open Date">
                          {fmtDate(currentBook.openPeriodOpenDate)}
                        </Descriptions.Item>
                      </Descriptions>
                    </Col>
                    <Col xs={24} md={12}>
                      <Descriptions column={1} size="small"
                        styles={{ label: { fontWeight: 500, color: REDWOOD.neutral500, width: 180 } }}
                      >
                        <Descriptions.Item label="Completed Additions">
                          <Badge count={0} showZero style={{ backgroundColor: '#1677ff' }} />
                        </Descriptions.Item>
                        <Descriptions.Item label="Completed Retirements">
                          <Badge count={0} showZero style={{ backgroundColor: '#1677ff' }} />
                        </Descriptions.Item>
                        <Descriptions.Item label="Last Depreciation">
                          {currentBook.lastDeprnDate
                            ? <Text>{fmtDate(currentBook.lastDeprnDate)}</Text>
                            : <Text type="secondary">—</Text>
                          }
                        </Descriptions.Item>
                        <Descriptions.Item label="Last Run Period">
                          {currentBook.lastRunPeriodName
                            ? <Tag color="blue">{currentBook.lastRunPeriodName}</Tag>
                            : <Text type="secondary">Never run</Text>
                          }
                        </Descriptions.Item>
                      </Descriptions>
                    </Col>
                  </Row>

                  {currentBook.lastRunPeriodName && (
                    <>
                      <Divider style={{ margin: '16px 0' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CheckCircleOutlined style={{ color: REDWOOD.success }} />
                        <Text style={{ fontSize: 12 }}>
                          Last depreciation run: <Text strong>{currentBook.lastRunPeriodName}</Text>
                          {currentBook.lastRunCloseDate && <> (closed {fmtDate(currentBook.lastRunCloseDate)})</>}
                        </Text>
                      </div>
                    </>
                  )}
                </Card>
              )}

              {!currentBook && !loading && selectedBook && (
                <Card style={{ borderRadius: 12, textAlign: 'center', padding: 40 }}>
                  <Text type="secondary">No depreciation period data found for {selectedBook}</Text>
                </Card>
              )}
            </>
          )}
        </div>
      </Content>
    </Layout>
  );
};

export default CalculateDeprn;
