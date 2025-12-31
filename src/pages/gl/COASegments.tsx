import React, { useState, useRef } from 'react';
import {
  Layout,
  Typography,
  Card,
  Button,
  Space,
  message,
  Spin,
  Input,
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
  AppstoreOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
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

const COASegments: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [searchText, setSearchText] = useState('');

  // Use ref to persist data across renders (until page refresh)
  const segmentsCache = useRef<Segment[]>([]);

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

  // Handle segment click - navigate to values page
  const handleSegmentClick = (segment: Segment) => {
    navigate(`/gl/values/${segment.segment_code}`, {
      state: { segmentName: segment.segment_name }
    });
  };

  // Handle refresh - clear cache and reload
  const handleRefresh = () => {
    segmentsCache.current = [];
    setSegments([]);
    fetchSegments();
  };

  // Filter segments based on search
  const filteredSegments = segments.filter(seg =>
    seg.segment_name?.toLowerCase().includes(searchText.toLowerCase()) ||
    seg.column_name?.toLowerCase().includes(searchText.toLowerCase())
  );

  // Compact segment item component
  const SegmentItem = ({ segment }: { segment: Segment }) => (
    <div
      onClick={() => handleSegmentClick(segment)}
      style={{
        padding: '10px 14px',
        borderRadius: 8,
        border: `1px solid ${REDWOOD.neutral200}`,
        background: REDWOOD.surface,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `${REDWOOD.info}08`;
        e.currentTarget.style.borderColor = REDWOOD.info;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = REDWOOD.surface;
        e.currentTarget.style.borderColor = REDWOOD.neutral200;
      }}
    >
      {/* Sequence Badge */}
      <div style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        background: REDWOOD.info,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
        flexShrink: 0,
      }}>
        {segment.sequence_no}
      </div>

      {/* Segment Name and Column */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text strong style={{
          color: REDWOOD.neutral900,
          fontSize: 13,
        }}>
          {segment.segment_name}
        </Text>
        <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>
          ({segment.column_name})
        </Text>
      </div>

      {/* Value Set Icon with Tooltip */}
      <Tooltip title={segment.segment_code}>
        <InfoCircleOutlined style={{ color: REDWOOD.neutral300, fontSize: 14 }} />
      </Tooltip>
    </div>
  );

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Compact Header */}
        <div style={{
          padding: '10px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Breadcrumb
              items={[
                { title: <Link to="/home"><HomeOutlined /></Link> },
                { title: <Link to="/gl">GL</Link> },
                { title: 'COA Segments' },
              ]}
            />
          </div>
          <Space>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
            >
              Refresh
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<PlusOutlined />}
              style={{ background: REDWOOD.info }}
            >
              Add Value Set
            </Button>
          </Space>
        </div>

        {/* Title Bar - Compact */}
        <div style={{
          padding: '12px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: `linear-gradient(135deg, ${REDWOOD.info} 0%, #0456a8 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <AppstoreOutlined style={{ fontSize: 18, color: '#fff' }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 15, color: REDWOOD.neutral900 }}>
              COA Segments
            </Text>
            <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
              Click on a segment to view values
            </Text>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <Badge count={segments.length} style={{ backgroundColor: REDWOOD.info }} />
          </div>
        </div>

        {/* Main Content */}
        <div style={{ padding: 20 }}>
          {/* Search */}
          <div style={{ marginBottom: 16, maxWidth: 400 }}>
            <Input
              placeholder="Search segments..."
              prefix={<SearchOutlined style={{ color: REDWOOD.neutral300 }} />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ borderRadius: 8 }}
              allowClear
            />
          </div>

          {/* Segments Grid */}
          {segments.length === 0 && !loading ? (
            <Card style={{ borderRadius: 12 }}>
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
            </Card>
          ) : (
            <Spin spinning={loading}>
              <Row gutter={[12, 12]}>
                {filteredSegments
                  .sort((a, b) => a.sequence_no - b.sequence_no)
                  .map((segment) => (
                    <Col xs={24} sm={12} md={8} lg={6} key={segment.segment_code}>
                      <SegmentItem segment={segment} />
                    </Col>
                  ))}
              </Row>
            </Spin>
          )}
        </div>
      </Content>

      {/* Autopilot Assistant */}
      <Autopilot />
    </Layout>
  );
};

export default COASegments;
