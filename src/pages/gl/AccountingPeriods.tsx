import React, { useState, useCallback, useEffect } from 'react';
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
  Progress,
  Statistic,
} from 'antd';
import {
  HomeOutlined,
  CalendarOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { PROXY_CONFIG } from '../../config/api.config';
import Autopilot from '../../components/Autopilot';

const { Content } = Layout;
const { Title, Text } = Typography;

// Oracle Redwood Color Palette
const REDWOOD = {
  primary: '#C74634',
  primaryDark: '#A33B2C',
  success: '#1D7B4D',
  warning: '#D4A800',
  error: '#C74634',
  info: '#0572CE',
  neutral: '#383838',
  surface: '#FFFFFF',
  surfaceSecondary: '#F7F7F7',
  border: '#E5E5E5',
  textPrimary: '#1A1A1A',
  textSecondary: '#6B6B6B',
};

// Types
interface AccountingPeriod {
  PeriodNameId: string;
  PeriodSetNameId: string;
  PeriodType: string;
  AdjustmentPeriodFlag: boolean;
  StartDate: string;
  EndDate: string;
  EnteredPeriodName: string;
  PeriodYear: number;
  PeriodNumber: number;
}

const AccountingPeriods: React.FC = () => {
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [fetchProgress, setFetchProgress] = useState<{ current: number; total: number; fetching: boolean }>({
    current: 0,
    total: 0,
    fetching: false,
  });

  // Fetch all accounting periods with pagination
  const fetchAllPeriods = useCallback(async () => {
    setLoading(true);
    setError('');
    setPeriods([]);
    setFetchProgress({ current: 0, total: 0, fetching: true });

    const allPeriods: AccountingPeriod[] = [];
    let offset = 0;
    const limit = 500;
    let hasMore = true;
    let pageCount = 0;

    try {
      while (hasMore) {
        const fusionPath = `fscmRestApi/resources/11.13.18.05/accountingPeriodsLOV?limit=${limit}&offset=${offset}`;
        const url = `${PROXY_CONFIG.baseUrl}/fusion/${fusionPath}`;

        console.log(`=== FETCHING PERIODS PAGE ${pageCount + 1} ===`);
        console.log('URL:', url);
        console.log('Offset:', offset);

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        const items = result.items || [];

        console.log('Items fetched:', items.length);
        console.log('HasMore:', result.hasMore);

        allPeriods.push(...items);
        pageCount++;

        setFetchProgress({
          current: allPeriods.length,
          total: result.totalResults || allPeriods.length,
          fetching: true,
        });

        // Check if there are more pages
        hasMore = result.hasMore === true && items.length > 0;
        offset += limit;

        // Safety check to prevent infinite loops
        if (pageCount > 50) {
          console.warn('Safety limit reached: 50 pages');
          break;
        }
      }

      console.log('=== FETCH COMPLETE ===');
      console.log('Total periods fetched:', allPeriods.length);
      console.log('Total pages:', pageCount);

      setPeriods(allPeriods);
      setFetchProgress({ current: allPeriods.length, total: allPeriods.length, fetching: false });
    } catch (err) {
      console.error('Error fetching periods:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setFetchProgress({ current: 0, total: 0, fetching: false });
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchAllPeriods();
  }, [fetchAllPeriods]);

  // Get unique period years for filtering
  const periodYears = [...new Set(periods.map(p => p.PeriodYear))].sort((a, b) => b - a);

  // Get statistics
  const adjustmentPeriods = periods.filter(p => p.AdjustmentPeriodFlag).length;
  const regularPeriods = periods.length - adjustmentPeriods;
  const uniquePeriodSets = [...new Set(periods.map(p => p.PeriodSetNameId))].length;

  // Table columns
  const columns = [
    {
      title: 'Period Name',
      dataIndex: 'EnteredPeriodName',
      key: 'EnteredPeriodName',
      width: 150,
      sorter: (a: AccountingPeriod, b: AccountingPeriod) => a.EnteredPeriodName.localeCompare(b.EnteredPeriodName),
      render: (name: string, record: AccountingPeriod) => (
        <Space size={4}>
          <Text strong style={{ fontSize: 12 }}>{name}</Text>
          {record.AdjustmentPeriodFlag && (
            <Tag color="orange" style={{ fontSize: 9, margin: 0, padding: '0 4px' }}>ADJ</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Period Set',
      dataIndex: 'PeriodSetNameId',
      key: 'PeriodSetNameId',
      width: 180,
      ellipsis: true,
      filters: [...new Set(periods.map(p => p.PeriodSetNameId))].map(s => ({ text: s, value: s })),
      onFilter: (value: React.Key | boolean, record: AccountingPeriod) => record.PeriodSetNameId === value,
      render: (name: string) => <Text style={{ fontSize: 11 }}>{name}</Text>,
    },
    {
      title: 'Year',
      dataIndex: 'PeriodYear',
      key: 'PeriodYear',
      width: 80,
      sorter: (a: AccountingPeriod, b: AccountingPeriod) => a.PeriodYear - b.PeriodYear,
      filters: periodYears.map(y => ({ text: y.toString(), value: y })),
      onFilter: (value: React.Key | boolean, record: AccountingPeriod) => record.PeriodYear === value,
      render: (year: number) => <Text code style={{ fontSize: 11 }}>{year}</Text>,
    },
    {
      title: 'Period #',
      dataIndex: 'PeriodNumber',
      key: 'PeriodNumber',
      width: 80,
      sorter: (a: AccountingPeriod, b: AccountingPeriod) => a.PeriodNumber - b.PeriodNumber,
      render: (num: number) => <Text style={{ fontSize: 11 }}>{num}</Text>,
    },
    {
      title: 'Start Date',
      dataIndex: 'StartDate',
      key: 'StartDate',
      width: 120,
      sorter: (a: AccountingPeriod, b: AccountingPeriod) => new Date(a.StartDate).getTime() - new Date(b.StartDate).getTime(),
      render: (date: string) => (
        <Text style={{ fontSize: 11 }}>{date ? new Date(date).toLocaleDateString() : '-'}</Text>
      ),
    },
    {
      title: 'End Date',
      dataIndex: 'EndDate',
      key: 'EndDate',
      width: 120,
      sorter: (a: AccountingPeriod, b: AccountingPeriod) => new Date(a.EndDate).getTime() - new Date(b.EndDate).getTime(),
      render: (date: string) => (
        <Text style={{ fontSize: 11 }}>{date ? new Date(date).toLocaleDateString() : '-'}</Text>
      ),
    },
    {
      title: 'Period Type',
      dataIndex: 'PeriodType',
      key: 'PeriodType',
      width: 150,
      ellipsis: true,
      render: (type: string) => <Text style={{ fontSize: 10 }}>{type}</Text>,
    },
    {
      title: 'Adjustment',
      dataIndex: 'AdjustmentPeriodFlag',
      key: 'AdjustmentPeriodFlag',
      width: 90,
      filters: [
        { text: 'Yes', value: true },
        { text: 'No', value: false },
      ],
      onFilter: (value: React.Key | boolean, record: AccountingPeriod) => record.AdjustmentPeriodFlag === value,
      render: (flag: boolean) => (
        flag ? (
          <Tag color="orange" style={{ fontSize: 10 }}>Yes</Tag>
        ) : (
          <Tag color="default" style={{ fontSize: 10 }}>No</Tag>
        )
      ),
    },
  ];

  return (
    <Layout style={{ height: 'calc(100vh - 64px)', background: REDWOOD.surfaceSecondary, overflow: 'hidden' }}>
      <Content style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div style={{
          padding: '8px 16px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.border}`,
          flexShrink: 0,
        }}>
          <Breadcrumb
            items={[
              { title: <Link to="/home"><HomeOutlined /> Home</Link> },
              { title: <Link to="/gl">General Ledger</Link> },
              { title: 'Accounting Periods' },
            ]}
          />
        </div>

        <div style={{ padding: '12px 16px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Title and Controls */}
          <Row justify="space-between" align="middle" style={{ marginBottom: 12, flexShrink: 0 }}>
            <Col>
              <Space align="center">
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 6,
                  background: REDWOOD.success,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <CalendarOutlined style={{ fontSize: 18, color: '#fff' }} />
                </div>
                <div>
                  <Title level={4} style={{ margin: 0, color: REDWOOD.textPrimary }}>
                    Accounting Periods
                  </Title>
                  <Text type="secondary" style={{ fontSize: 12 }}>View and manage accounting periods</Text>
                </div>
              </Space>
            </Col>
            <Col>
              <Button
                icon={<ReloadOutlined />}
                onClick={fetchAllPeriods}
                loading={loading}
                size="small"
              >
                Refresh
              </Button>
            </Col>
          </Row>

          {/* Statistics Cards */}
          <Row gutter={12} style={{ marginBottom: 12, flexShrink: 0 }}>
            <Col span={6}>
              <Card size="small" style={{ borderRadius: 6 }} bodyStyle={{ padding: '12px 16px' }}>
                <Statistic
                  title={<Text style={{ fontSize: 11 }}>Total Periods</Text>}
                  value={periods.length}
                  prefix={<CalendarOutlined style={{ color: REDWOOD.info }} />}
                  valueStyle={{ fontSize: 20, color: REDWOOD.info }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small" style={{ borderRadius: 6 }} bodyStyle={{ padding: '12px 16px' }}>
                <Statistic
                  title={<Text style={{ fontSize: 11 }}>Regular Periods</Text>}
                  value={regularPeriods}
                  prefix={<CheckCircleOutlined style={{ color: REDWOOD.success }} />}
                  valueStyle={{ fontSize: 20, color: REDWOOD.success }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small" style={{ borderRadius: 6 }} bodyStyle={{ padding: '12px 16px' }}>
                <Statistic
                  title={<Text style={{ fontSize: 11 }}>Adjustment Periods</Text>}
                  value={adjustmentPeriods}
                  prefix={<ExclamationCircleOutlined style={{ color: REDWOOD.warning }} />}
                  valueStyle={{ fontSize: 20, color: REDWOOD.warning }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small" style={{ borderRadius: 6 }} bodyStyle={{ padding: '12px 16px' }}>
                <Statistic
                  title={<Text style={{ fontSize: 11 }}>Period Sets</Text>}
                  value={uniquePeriodSets}
                  prefix={<ClockCircleOutlined style={{ color: REDWOOD.primary }} />}
                  valueStyle={{ fontSize: 20, color: REDWOOD.primary }}
                />
              </Card>
            </Col>
          </Row>

          {/* Fetch Progress */}
          {fetchProgress.fetching && (
            <Card size="small" style={{ marginBottom: 12, borderRadius: 6 }} bodyStyle={{ padding: '8px 16px' }}>
              <Space style={{ width: '100%' }}>
                <Spin size="small" />
                <Text style={{ fontSize: 12 }}>
                  Fetching periods... {fetchProgress.current} records loaded
                </Text>
                {fetchProgress.total > 0 && (
                  <Progress
                    percent={Math.round((fetchProgress.current / fetchProgress.total) * 100)}
                    size="small"
                    style={{ width: 150 }}
                  />
                )}
              </Space>
            </Card>
          )}

          {/* Error Alert */}
          {error && (
            <Alert
              message="Error Loading Periods"
              description={error}
              type="error"
              showIcon
              closable
              onClose={() => setError('')}
              style={{ marginBottom: 12, borderRadius: 6 }}
            />
          )}

          {/* Periods Table */}
          <Card
            style={{
              flex: 1,
              borderRadius: 6,
              border: `1px solid ${REDWOOD.border}`,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            bodyStyle={{ padding: 0, flex: 1, overflow: 'hidden' }}
          >
            <Spin spinning={loading && periods.length === 0} tip="Loading periods...">
              <Table
                dataSource={periods}
                columns={columns}
                rowKey="PeriodNameId"
                size="small"
                pagination={{
                  pageSize: 20,
                  showSizeChanger: true,
                  pageSizeOptions: ['20', '50', '100', '200'],
                  showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} periods`,
                  size: 'small',
                }}
                scroll={{ y: 'calc(100vh - 400px)' }}
              />
            </Spin>
          </Card>
        </div>
      </Content>

      {/* Autopilot Assistant */}
      <Autopilot />
    </Layout>
  );
};

export default AccountingPeriods;
