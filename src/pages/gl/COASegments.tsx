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
  HomeOutlined,
  UnorderedListOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  AppstoreOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { ORACLE_FUSION_CONFIG } from '../../config/api.config';
import Autopilot from '../../components/Autopilot';

const { Content } = Layout;
const { Text } = Typography;

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
    // Use cache if available
    if (segmentsCache.current.length > 0) {
      setSegments(segmentsCache.current);
      return;
    }

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

  // Handle segment selection - show in right panel
  const handleSegmentSelect = (segment: Segment) => {
    setSelectedSegment(segment);
    fetchValues(segment.segment_code);
  };

  // Handle open in new tab
  const handleOpenInNewTab = (segment: Segment) => {
    window.open(`#/gl/values/${segment.segment_code}`, '_blank');
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
    seg.column_name?.toLowerCase().includes(searchText.toLowerCase())
  );

  // Compact segment item component
  const SegmentItem = ({ segment, isSelected }: { segment: Segment; isSelected: boolean }) => (
    <div
      onClick={() => handleSegmentSelect(segment)}
      style={{
        padding: '8px 12px',
        borderRadius: 6,
        border: isSelected ? `2px solid ${REDWOOD.info}` : `1px solid ${REDWOOD.neutral200}`,
        background: isSelected ? `${REDWOOD.info}08` : REDWOOD.surface,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = `${REDWOOD.info}05`;
          e.currentTarget.style.borderColor = REDWOOD.info;
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = REDWOOD.surface;
          e.currentTarget.style.borderColor = REDWOOD.neutral200;
        }
      }}
    >
      {/* Sequence Badge */}
      <div style={{
        width: 24,
        height: 24,
        borderRadius: 4,
        background: isSelected ? REDWOOD.info : REDWOOD.neutral200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: isSelected ? '#fff' : REDWOOD.neutral600,
        fontSize: 11,
        fontWeight: 600,
        flexShrink: 0,
      }}>
        {segment.sequence_no}
      </div>

      {/* Segment Name and Column */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text strong style={{ color: REDWOOD.neutral900, fontSize: 12 }}>
          {segment.segment_name}
        </Text>
        <Text type="secondary" style={{ fontSize: 10, marginLeft: 4 }}>
          ({segment.column_name})
        </Text>
      </div>

      {/* Open in new tab button */}
      <Tooltip title="Open in new tab">
        <ExportOutlined
          onClick={(e) => {
            e.stopPropagation();
            handleOpenInNewTab(segment);
          }}
          style={{ color: REDWOOD.neutral300, fontSize: 12 }}
        />
      </Tooltip>
    </div>
  );

  // Values table columns
  const valueColumns = [
    {
      title: 'Value',
      dataIndex: 'Value',
      key: 'Value',
      width: 100,
      render: (text: string) => <Text strong style={{ fontSize: 12 }}>{text}</Text>,
    },
    {
      title: 'Description',
      dataIndex: 'Description',
      key: 'Description',
      ellipsis: true,
      render: (text: string) => <Text style={{ fontSize: 12 }}>{text}</Text>,
    },
    {
      title: 'Enabled',
      dataIndex: 'EnabledFlag',
      key: 'EnabledFlag',
      width: 60,
      align: 'center' as const,
      render: (flag: string) => (
        flag === 'Y' || flag === 'true' ? (
          <CheckCircleOutlined style={{ color: REDWOOD.success, fontSize: 14 }} />
        ) : (
          <CloseCircleOutlined style={{ color: REDWOOD.neutral300, fontSize: 14 }} />
        )
      ),
    },
    {
      title: 'Start Date',
      dataIndex: 'StartDateActive',
      key: 'StartDateActive',
      width: 90,
      render: (date: string) => <Text style={{ fontSize: 11 }}>{date}</Text>,
    },
    {
      title: 'End Date',
      dataIndex: 'EndDateActive',
      key: 'EndDateActive',
      width: 90,
      render: (date: string) => <Text style={{ fontSize: 11 }}>{date || '-'}</Text>,
    },
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Compact Header */}
        <div style={{
          padding: '8px 20px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: REDWOOD.info,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <AppstoreOutlined style={{ fontSize: 14, color: '#fff' }} />
            </div>
            <Text strong style={{ fontSize: 14, color: REDWOOD.neutral900 }}>
              COA Segments
            </Text>
            <Breadcrumb
              style={{ marginLeft: 8 }}
              items={[
                { title: <Link to="/home"><HomeOutlined /></Link> },
                { title: <Link to="/gl">GL</Link> },
              ]}
            />
          </div>
          <Space size="small">
            <Button size="small" icon={<ReloadOutlined />} onClick={handleRefresh}>
              Refresh
            </Button>
            <Button size="small" type="primary" icon={<PlusOutlined />} style={{ background: REDWOOD.info }}>
              Add Value Set
            </Button>
          </Space>
        </div>

        {/* Main Content - Two Panel Layout */}
        <div style={{ padding: 16, height: 'calc(100vh - 120px)' }}>
          <Row gutter={16} style={{ height: '100%' }}>
            {/* Left Panel - Segments List */}
            <Col xs={24} lg={8} xl={6} style={{ height: '100%' }}>
              <Card
                size="small"
                style={{
                  borderRadius: 8,
                  border: `1px solid ${REDWOOD.neutral200}`,
                  height: '100%',
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
                <div style={{ padding: 12, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text strong style={{ fontSize: 12, color: REDWOOD.neutral900 }}>
                      Segments
                    </Text>
                    <Badge count={segments.length} style={{ backgroundColor: REDWOOD.info }} />
                  </div>
                  <Input
                    size="small"
                    placeholder="Search..."
                    prefix={<SearchOutlined style={{ color: REDWOOD.neutral300, fontSize: 12 }} />}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    style={{ borderRadius: 6 }}
                    allowClear
                  />
                </div>

                {/* Segments List */}
                <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
                  {segments.length === 0 && !loading ? (
                    <div style={{ textAlign: 'center', padding: '30px 16px' }}>
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        imageStyle={{ height: 40 }}
                        description={
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            Click to load segments
                          </Text>
                        }
                      >
                        <Button
                          size="small"
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {filteredSegments
                          .sort((a, b) => a.sequence_no - b.sequence_no)
                          .map((segment) => (
                            <SegmentItem
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
            <Col xs={24} lg={16} xl={18} style={{ height: '100%' }}>
              <Card
                size="small"
                style={{
                  borderRadius: 8,
                  border: `1px solid ${REDWOOD.neutral200}`,
                  height: '100%',
                }}
                bodyStyle={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}
              >
                {/* Values Header */}
                <div style={{
                  padding: '10px 12px',
                  borderBottom: `1px solid ${REDWOOD.neutral200}`,
                  background: selectedSegment ? `${REDWOOD.info}05` : REDWOOD.surface,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  {selectedSegment ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <UnorderedListOutlined style={{ color: REDWOOD.info, fontSize: 14 }} />
                        <Text strong style={{ fontSize: 13, color: REDWOOD.neutral900 }}>
                          {selectedSegment.segment_name}
                        </Text>
                        <Tooltip title={selectedSegment.segment_code}>
                          <Tag style={{ fontSize: 10, margin: 0 }}>{selectedSegment.column_name}</Tag>
                        </Tooltip>
                      </div>
                      <Space size="small">
                        <Badge count={values.length} style={{ backgroundColor: REDWOOD.success }} />
                        <Tooltip title="Open in new tab">
                          <Button
                            size="small"
                            icon={<ExportOutlined />}
                            onClick={() => handleOpenInNewTab(selectedSegment)}
                          />
                        </Tooltip>
                        <Button
                          size="small"
                          type="primary"
                          icon={<PlusOutlined />}
                          style={{ background: REDWOOD.success }}
                        >
                          Add
                        </Button>
                      </Space>
                    </>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <UnorderedListOutlined style={{ color: REDWOOD.neutral300, fontSize: 14 }} />
                      <Text type="secondary" style={{ fontSize: 12 }}>Select a segment to view values</Text>
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
                        imageStyle={{ height: 50 }}
                        description={
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            Select a segment from the left
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
                          size: 'small',
                          pageSize: 20,
                          showSizeChanger: false,
                          showTotal: (total) => <Text style={{ fontSize: 11 }}>{total} values</Text>,
                        }}
                        scroll={{ y: 'calc(100vh - 300px)' }}
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
          padding: 6px 8px !important;
        }
        .compact-table .ant-table-thead > tr > th {
          padding: 8px !important;
          background: ${REDWOOD.neutral100} !important;
          font-size: 11px !important;
        }
      `}</style>
    </Layout>
  );
};

export default COASegments;
