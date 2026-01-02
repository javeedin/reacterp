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
  StopOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
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
interface InvoiceHold {
  HoldLookupCode: string;
  HoldName: string;
  HoldType: string;
  Description: string;
  HoldClass: string;
  PostableFlag: boolean;
  ReleasableFlag: boolean;
  WaitingInvoiceApprovalFlag: boolean;
  UserUpdateableFlag: boolean;
  UserReleasableFlag: boolean;
  AccountingEventFlag: boolean;
  ActiveFlag: boolean;
  CreationDate: string;
  LastUpdateDate: string;
}

const InvoiceHolds: React.FC = () => {
  const [holds, setHolds] = useState<InvoiceHold[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [fetchProgress, setFetchProgress] = useState<{ current: number; total: number; fetching: boolean }>({
    current: 0,
    total: 0,
    fetching: false,
  });

  // Fetch all invoice holds with pagination
  const fetchAllHolds = useCallback(async () => {
    setLoading(true);
    setError('');
    setHolds([]);
    setFetchProgress({ current: 0, total: 0, fetching: true });

    const allHolds: InvoiceHold[] = [];
    let offset = 0;
    const limit = 500;
    let hasMore = true;
    let pageCount = 0;

    try {
      while (hasMore) {
        const fusionPath = `fscmRestApi/resources/11.13.18.05/payablesInvoiceHolds?limit=${limit}&offset=${offset}`;
        const url = `${PROXY_CONFIG.baseUrl}/fusion/${fusionPath}`;

        console.log(`=== FETCHING INVOICE HOLDS PAGE ${pageCount + 1} ===`);
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

        allHolds.push(...items);
        pageCount++;

        setFetchProgress({
          current: allHolds.length,
          total: result.totalResults || allHolds.length,
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
      console.log('Total holds fetched:', allHolds.length);
      console.log('Total pages:', pageCount);

      setHolds(allHolds);
      setFetchProgress({ current: allHolds.length, total: allHolds.length, fetching: false });
    } catch (err) {
      console.error('Error fetching holds:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setFetchProgress({ current: 0, total: 0, fetching: false });
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchAllHolds();
  }, [fetchAllHolds]);

  // Get unique hold types for filtering
  const holdTypes = [...new Set(holds.map(h => h.HoldType).filter(Boolean))];
  const holdClasses = [...new Set(holds.map(h => h.HoldClass).filter(Boolean))];

  // Get statistics
  const activeHolds = holds.filter(h => h.ActiveFlag).length;
  const releasableHolds = holds.filter(h => h.ReleasableFlag).length;
  const postableHolds = holds.filter(h => h.PostableFlag).length;

  // Table columns
  const columns = [
    {
      title: 'Hold Code',
      dataIndex: 'HoldLookupCode',
      key: 'HoldLookupCode',
      width: 150,
      sorter: (a: InvoiceHold, b: InvoiceHold) => (a.HoldLookupCode || '').localeCompare(b.HoldLookupCode || ''),
      render: (code: string, record: InvoiceHold) => (
        <Space size={4}>
          <Text strong style={{ fontSize: 11 }}>{code}</Text>
          {record.ActiveFlag && <CheckCircleOutlined style={{ color: REDWOOD.success, fontSize: 10 }} />}
        </Space>
      ),
    },
    {
      title: 'Hold Name',
      dataIndex: 'HoldName',
      key: 'HoldName',
      width: 200,
      ellipsis: true,
      sorter: (a: InvoiceHold, b: InvoiceHold) => (a.HoldName || '').localeCompare(b.HoldName || ''),
      render: (name: string) => <Text style={{ fontSize: 11 }}>{name}</Text>,
    },
    {
      title: 'Hold Type',
      dataIndex: 'HoldType',
      key: 'HoldType',
      width: 120,
      filters: holdTypes.map(t => ({ text: t, value: t })),
      onFilter: (value: React.Key | boolean, record: InvoiceHold) => record.HoldType === value,
      render: (type: string) => type ? <Tag style={{ fontSize: 9 }}>{type}</Tag> : '-',
    },
    {
      title: 'Hold Class',
      dataIndex: 'HoldClass',
      key: 'HoldClass',
      width: 120,
      filters: holdClasses.map(c => ({ text: c, value: c })),
      onFilter: (value: React.Key | boolean, record: InvoiceHold) => record.HoldClass === value,
      render: (cls: string) => cls ? <Tag color="blue" style={{ fontSize: 9 }}>{cls}</Tag> : '-',
    },
    {
      title: 'Description',
      dataIndex: 'Description',
      key: 'Description',
      width: 250,
      ellipsis: true,
      render: (desc: string) => <Text style={{ fontSize: 10 }}>{desc || '-'}</Text>,
    },
    {
      title: 'Postable',
      dataIndex: 'PostableFlag',
      key: 'PostableFlag',
      width: 80,
      filters: [
        { text: 'Yes', value: true },
        { text: 'No', value: false },
      ],
      onFilter: (value: React.Key | boolean, record: InvoiceHold) => record.PostableFlag === value,
      render: (flag: boolean) => (
        flag ? <CheckCircleOutlined style={{ color: REDWOOD.success }} /> : <CloseCircleOutlined style={{ color: REDWOOD.textSecondary }} />
      ),
    },
    {
      title: 'Releasable',
      dataIndex: 'ReleasableFlag',
      key: 'ReleasableFlag',
      width: 90,
      filters: [
        { text: 'Yes', value: true },
        { text: 'No', value: false },
      ],
      onFilter: (value: React.Key | boolean, record: InvoiceHold) => record.ReleasableFlag === value,
      render: (flag: boolean) => (
        flag ? <CheckCircleOutlined style={{ color: REDWOOD.success }} /> : <CloseCircleOutlined style={{ color: REDWOOD.textSecondary }} />
      ),
    },
    {
      title: 'User Releasable',
      dataIndex: 'UserReleasableFlag',
      key: 'UserReleasableFlag',
      width: 110,
      render: (flag: boolean) => (
        flag ? <CheckCircleOutlined style={{ color: REDWOOD.success }} /> : <CloseCircleOutlined style={{ color: REDWOOD.textSecondary }} />
      ),
    },
    {
      title: 'Active',
      dataIndex: 'ActiveFlag',
      key: 'ActiveFlag',
      width: 70,
      filters: [
        { text: 'Yes', value: true },
        { text: 'No', value: false },
      ],
      onFilter: (value: React.Key | boolean, record: InvoiceHold) => record.ActiveFlag === value,
      render: (flag: boolean) => (
        flag ? (
          <Tag color="green" style={{ fontSize: 10 }}>Yes</Tag>
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
              { title: <Link to="/ap">Payables</Link> },
              { title: 'Invoice Holds' },
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
                  background: REDWOOD.primaryDark,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <StopOutlined style={{ fontSize: 18, color: '#fff' }} />
                </div>
                <div>
                  <Title level={4} style={{ margin: 0, color: REDWOOD.textPrimary }}>
                    Invoice Holds
                  </Title>
                  <Text type="secondary" style={{ fontSize: 12 }}>View and manage invoice hold codes</Text>
                </div>
              </Space>
            </Col>
            <Col>
              <Button
                icon={<ReloadOutlined />}
                onClick={fetchAllHolds}
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
                  title={<Text style={{ fontSize: 11 }}>Total Holds</Text>}
                  value={holds.length}
                  prefix={<StopOutlined style={{ color: REDWOOD.info }} />}
                  valueStyle={{ fontSize: 20, color: REDWOOD.info }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small" style={{ borderRadius: 6 }} bodyStyle={{ padding: '12px 16px' }}>
                <Statistic
                  title={<Text style={{ fontSize: 11 }}>Active Holds</Text>}
                  value={activeHolds}
                  prefix={<CheckCircleOutlined style={{ color: REDWOOD.success }} />}
                  valueStyle={{ fontSize: 20, color: REDWOOD.success }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small" style={{ borderRadius: 6 }} bodyStyle={{ padding: '12px 16px' }}>
                <Statistic
                  title={<Text style={{ fontSize: 11 }}>Releasable</Text>}
                  value={releasableHolds}
                  prefix={<ExclamationCircleOutlined style={{ color: REDWOOD.warning }} />}
                  valueStyle={{ fontSize: 20, color: REDWOOD.warning }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small" style={{ borderRadius: 6 }} bodyStyle={{ padding: '12px 16px' }}>
                <Statistic
                  title={<Text style={{ fontSize: 11 }}>Postable</Text>}
                  value={postableHolds}
                  prefix={<CheckCircleOutlined style={{ color: REDWOOD.primary }} />}
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
                  Fetching invoice holds... {fetchProgress.current} records loaded
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
              message="Error Loading Invoice Holds"
              description={error}
              type="error"
              showIcon
              closable
              onClose={() => setError('')}
              style={{ marginBottom: 12, borderRadius: 6 }}
            />
          )}

          {/* Invoice Holds Table */}
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
            <Spin spinning={loading && holds.length === 0} tip="Loading invoice holds...">
              <Table
                dataSource={holds}
                columns={columns}
                rowKey="HoldLookupCode"
                size="small"
                pagination={{
                  pageSize: 20,
                  showSizeChanger: true,
                  pageSizeOptions: ['20', '50', '100', '200'],
                  showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} holds`,
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

export default InvoiceHolds;
