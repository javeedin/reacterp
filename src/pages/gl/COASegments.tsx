import React, { useState, useRef } from 'react';
import {
  Layout,
  Typography,
  Card,
  Button,
  Table,
  Space,
  message,
  Spin,
  Input,
  Tag,
  Empty,
  Breadcrumb,
  Row,
  Col,
  Tooltip,
  Badge,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  DatabaseOutlined,
  RightOutlined,
  HomeOutlined,
  UnorderedListOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { ORACLE_FUSION_CONFIG } from '../../config/api.config';
import Autopilot from '../../components/Autopilot';

const { Content } = Layout;
const { Title, Text } = Typography;

// Oracle Redwood Color Palette
const REDWOOD = {
  primary: '#C74634',
  primaryLight: '#E85D4A',
  primaryDark: '#A33B2C',
  success: '#1D7B4D',
  warning: '#D4A800',
  info: '#0572CE',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral300: '#C7C7C7',
  neutral600: '#6B6B6B',
  neutral900: '#1A1A1A',
  surface: '#FFFFFF',
};

// Interface for Segment
interface Segment {
  key_flex_filed_name_code: string;
  structure_code: string;
  sequence_no: number;
  segment_name: string;
  segment_code: string;
  column_name: string;
  prompt: string;
  enabled: string;
}

// Interface for Value
interface ValueSetValue {
  Value: string;
  Description: string;
  EnabledFlag: string;
  StartDateActive: string;
  EndDateActive: string;
  SortOrder: number;
}

const COASegments: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [valuesLoading, setValuesLoading] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);
  const [values, setValues] = useState<ValueSetValue[]>([]);
  const [searchText, setSearchText] = useState('');

  // Use ref to persist data across renders (until page refresh)
  const segmentsCache = useRef<Segment[]>([]);
  const valuesCache = useRef<Map<string, ValueSetValue[]>>(new Map());

  // Fetch segments from API
  const fetchSegments = async () => {
    setLoading(true);
    try {
      const apiUrl = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/chartofaccounts/structuresegments';

      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      const segmentData = result.items || [];
      setSegments(segmentData);
      segmentsCache.current = segmentData;
      message.success(`Loaded ${segmentData.length} segments`);
    } catch (error) {
      console.error('Error fetching segments:', error);
      message.error('Failed to fetch segments');
    } finally {
      setLoading(false);
    }
  };

  // Fetch values for a segment
  const fetchValues = async (segmentCode: string) => {
    // Check cache first
    if (valuesCache.current.has(segmentCode)) {
      setValues(valuesCache.current.get(segmentCode)!);
      return;
    }

    setValuesLoading(true);
    try {
      const apiUrl = `https://iaaobn.fa.ocs.oraclecloud.com:443/fscmRestApi/resources/11.13.18.05/valueSets/${segmentCode}/child/values?limit=100&offset=0`;
      const credentials = btoa(`${ORACLE_FUSION_CONFIG.username}:${ORACLE_FUSION_CONFIG.password}`);

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      const valueData = result.items || [];
      setValues(valueData);
      valuesCache.current.set(segmentCode, valueData);
      message.success(`Loaded ${valueData.length} values`);
    } catch (error) {
      console.error('Error fetching values:', error);
      message.error('Failed to fetch values. Make sure you are running in Electron mode.');
      setValues([]);
    } finally {
      setValuesLoading(false);
    }
  };

  // Handle segment selection
  const handleSegmentSelect = (segment: Segment) => {
    setSelectedSegment(segment);
    fetchValues(segment.segment_code);
  };

  // Handle refresh - clear cache and reload
  const handleRefresh = () => {
    segmentsCache.current = [];
    valuesCache.current.clear();
    setSegments([]);
    setValues([]);
    setSelectedSegment(null);
    fetchSegments();
  };

  // Filter segments based on search
  const filteredSegments = segments.filter(seg =>
    seg.segment_name?.toLowerCase().includes(searchText.toLowerCase()) ||
    seg.segment_code?.toLowerCase().includes(searchText.toLowerCase())
  );

  // Segment card component
  const SegmentCard = ({ segment, isSelected }: { segment: Segment; isSelected: boolean }) => (
    <Card
      hoverable
      onClick={() => handleSegmentSelect(segment)}
      style={{
        borderRadius: 12,
        border: isSelected ? `2px solid ${REDWOOD.info}` : `1px solid ${REDWOOD.neutral200}`,
        background: isSelected ? `${REDWOOD.info}08` : REDWOOD.surface,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        height: '100%',
      }}
      bodyStyle={{ padding: 16 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: isSelected ? REDWOOD.info : `${REDWOOD.primary}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isSelected ? '#fff' : REDWOOD.primary,
          fontSize: 20,
          flexShrink: 0,
        }}>
          <DatabaseOutlined />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Text strong style={{
              color: REDWOOD.neutral900,
              fontSize: 14,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {segment.segment_name}
            </Text>
            {segment.enabled === 'Y' ? (
              <Tag color="success" style={{ margin: 0, fontSize: 10 }}>Active</Tag>
            ) : (
              <Tag color="default" style={{ margin: 0, fontSize: 10 }}>Inactive</Tag>
            )}
          </div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
            {segment.segment_code}
          </Text>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <Tag style={{ margin: 0, fontSize: 10 }}>Seq: {segment.sequence_no}</Tag>
            <Tag style={{ margin: 0, fontSize: 10 }}>{segment.column_name}</Tag>
          </div>
        </div>
        <RightOutlined style={{ color: REDWOOD.neutral300, fontSize: 12 }} />
      </div>
    </Card>
  );

  // Values table columns
  const valueColumns = [
    {
      title: 'Value',
      dataIndex: 'Value',
      key: 'Value',
      width: 120,
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: 'Description',
      dataIndex: 'Description',
      key: 'Description',
      ellipsis: true,
    },
    {
      title: 'Enabled',
      dataIndex: 'EnabledFlag',
      key: 'EnabledFlag',
      width: 80,
      align: 'center' as const,
      render: (flag: string) => (
        flag === 'Y' || flag === 'true' ? (
          <CheckCircleOutlined style={{ color: REDWOOD.success, fontSize: 16 }} />
        ) : (
          <CloseCircleOutlined style={{ color: REDWOOD.neutral300, fontSize: 16 }} />
        )
      ),
    },
    {
      title: 'Start Date',
      dataIndex: 'StartDateActive',
      key: 'StartDateActive',
      width: 120,
    },
    {
      title: 'End Date',
      dataIndex: 'EndDateActive',
      key: 'EndDateActive',
      width: 120,
      render: (date: string) => date || '-',
    },
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb Header */}
        <div style={{
          padding: '16px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
        }}>
          <Breadcrumb
            items={[
              { title: <Link to="/home"><HomeOutlined /> Home</Link> },
              { title: <Link to="/gl">General Ledger</Link> },
              { title: 'COA Segments' },
            ]}
          />
        </div>

        {/* Page Header */}
        <div style={{
          padding: '20px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space align="center" size={16}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                background: `linear-gradient(135deg, ${REDWOOD.info} 0%, #0456a8 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 4px 12px ${REDWOOD.info}40`,
              }}>
                <AppstoreOutlined style={{ fontSize: 28, color: '#fff' }} />
              </div>
              <div>
                <Title level={3} style={{ margin: 0, color: REDWOOD.neutral900 }}>
                  COA Segments
                </Title>
                <Text type="secondary">Browse Chart of Accounts segments and their values</Text>
              </div>
            </Space>
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={handleRefresh}
              >
                Refresh
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                style={{ background: REDWOOD.info }}
              >
                Add Value Set
              </Button>
            </Space>
          </div>
        </div>

        {/* Main Content */}
        <div style={{ padding: 24 }}>
          <Row gutter={24}>
            {/* Left Panel - Segments List */}
            <Col xs={24} lg={10} xl={8}>
              <Card
                style={{
                  borderRadius: 12,
                  border: `1px solid ${REDWOOD.neutral200}`,
                  height: 'calc(100vh - 280px)',
                  display: 'flex',
                  flexDirection: 'column',
                }}
                bodyStyle={{
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                }}
              >
                {/* Search Header */}
                <div style={{ padding: 16, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Text strong style={{ fontSize: 15, color: REDWOOD.neutral900 }}>
                      Segments
                    </Text>
                    <Badge count={segments.length} style={{ backgroundColor: REDWOOD.info }} />
                  </div>
                  <Input
                    placeholder="Search segments..."
                    prefix={<SearchOutlined style={{ color: REDWOOD.neutral300 }} />}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    style={{ borderRadius: 8 }}
                  />
                </div>

                {/* Segments List */}
                <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
                  {segments.length === 0 && !loading ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                          <Text type="secondary">
                            Click "Fetch Segments" to load data
                          </Text>
                        }
                      >
                        <Button
                          type="primary"
                          icon={<DatabaseOutlined />}
                          onClick={fetchSegments}
                          style={{ background: REDWOOD.info }}
                        >
                          Fetch Segments
                        </Button>
                      </Empty>
                    </div>
                  ) : (
                    <Spin spinning={loading}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {filteredSegments.map((segment) => (
                          <SegmentCard
                            key={segment.segment_code}
                            segment={segment}
                            isSelected={selectedSegment?.segment_code === segment.segment_code}
                          />
                        ))}
                      </div>
                    </Spin>
                  )}
                </div>
              </Card>
            </Col>

            {/* Right Panel - Values */}
            <Col xs={24} lg={14} xl={16}>
              <Card
                style={{
                  borderRadius: 12,
                  border: `1px solid ${REDWOOD.neutral200}`,
                  height: 'calc(100vh - 280px)',
                }}
                bodyStyle={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}
              >
                {/* Values Header */}
                <div style={{
                  padding: 16,
                  borderBottom: `1px solid ${REDWOOD.neutral200}`,
                  background: selectedSegment ? `${REDWOOD.info}08` : REDWOOD.surface,
                }}>
                  {selectedSegment ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <UnorderedListOutlined style={{ color: REDWOOD.info }} />
                          <Text strong style={{ fontSize: 15, color: REDWOOD.neutral900 }}>
                            {selectedSegment.segment_name}
                          </Text>
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Value Set: {selectedSegment.segment_code}
                        </Text>
                      </div>
                      <Space>
                        <Badge count={values.length} style={{ backgroundColor: REDWOOD.success }} />
                        <Tooltip title="Add New Value">
                          <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            size="small"
                            style={{ background: REDWOOD.success }}
                          >
                            Add Value
                          </Button>
                        </Tooltip>
                      </Space>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <UnorderedListOutlined style={{ color: REDWOOD.neutral300 }} />
                      <Text type="secondary">Select a segment to view its values</Text>
                    </div>
                  )}
                </div>

                {/* Values Table */}
                <div style={{ flex: 1, overflow: 'auto' }}>
                  {!selectedSegment ? (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      background: REDWOOD.neutral100,
                    }}>
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                          <Text type="secondary">
                            Select a segment from the left panel to view its values
                          </Text>
                        }
                      />
                    </div>
                  ) : (
                    <Spin spinning={valuesLoading}>
                      <Table
                        columns={valueColumns}
                        dataSource={values}
                        rowKey="Value"
                        size="small"
                        pagination={{
                          pageSize: 15,
                          showSizeChanger: true,
                          showTotal: (total) => `Total ${total} values`,
                        }}
                        scroll={{ y: 'calc(100vh - 450px)' }}
                        className="compact-table"
                      />
                    </Spin>
                  )}
                </div>
              </Card>
            </Col>
          </Row>
        </div>
      </Content>

      {/* Autopilot Assistant */}
      <Autopilot />

      {/* Compact table styles */}
      <style>{`
        .compact-table .ant-table-tbody > tr > td {
          padding: 8px 12px !important;
        }
        .compact-table .ant-table-thead > tr > th {
          padding: 10px 12px !important;
          background: ${REDWOOD.neutral100} !important;
        }
      `}</style>
    </Layout>
  );
};

export default COASegments;
