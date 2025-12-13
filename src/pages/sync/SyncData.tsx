import React, { useState, useCallback, useRef } from 'react';
import {
  Layout,
  Card,
  Form,
  Select,
  Input,
  Button,
  Space,
  Typography,
  Progress,
  Table,
  Tag,
  Row,
  Col,
  Divider,
  Alert,
  Breadcrumb,
  Switch,
  Tooltip,
} from 'antd';
import {
  SyncOutlined,
  PlayCircleOutlined,
  StopOutlined,
  HomeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  WarningOutlined,
  ApiOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  UnorderedListOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { SYNC_OBJECTS, ORACLE_FUSION_CONFIG, PROXY_CONFIG, type SyncObjectConfig, type ApiType } from '../../config/api.config';
import { syncGLJournals, testGLConnection, type SyncProgress, type LogCallback } from '../../services/gl-sync.service';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

const SYNC_VERSION = '2.0.0'; // Hierarchical sync with Redwood UI

// Oracle Redwood Color Palette
const REDWOOD = {
  primary: '#C74634',      // Oracle Red
  primaryDark: '#A33B2C',  // Darker red
  success: '#1D7B4D',      // Green
  warning: '#D4A800',      // Amber
  error: '#C74634',        // Red
  info: '#0572CE',         // Blue
  neutral: '#383838',      // Dark gray
  surface: '#FFFFFF',
  surfaceSecondary: '#F7F7F7',
  border: '#E5E5E5',
  textPrimary: '#1A1A1A',
  textSecondary: '#6B6B6B',
};

interface SyncLog {
  id: string;
  timestamp: Date;
  type: 'info' | 'success' | 'error' | 'warning' | 'step';
  message: string;
}

const SyncData: React.FC = () => {
  const [form] = Form.useForm();
  const [selectedObject, setSelectedObject] = useState<SyncObjectConfig | null>(null);
  const [, setApiType] = useState<ApiType>('REST');
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [testMode, setTestMode] = useState(true); // Default to test mode (25 batches)
  const [progress, setProgress] = useState<SyncProgress>({
    status: 'idle',
    totalBatches: 0,
    processedBatches: 0,
    currentBatchId: null,
    currentBatchName: '',
    totalHeaders: 0,
    processedHeaders: 0,
    currentHeaderId: null,
    currentHeaderName: '',
    totalLines: 0,
    processedLines: 0,
    totalBatchesInserted: 0,
    totalHeadersInserted: 0,
    totalLinesInserted: 0,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const isSyncingRef = useRef(false);

  const addLog: LogCallback = useCallback((type, message) => {
    const log: SyncLog = {
      id: Date.now().toString() + Math.random(),
      timestamp: new Date(),
      type,
      message,
    };
    setLogs((prev) => [log, ...prev].slice(0, 500));
  }, []);

  const handleObjectChange = (objectId: string) => {
    const object = SYNC_OBJECTS.find((o) => o.id === objectId);
    setSelectedObject(object || null);
    form.resetFields(['parameters']);

    if (object) {
      addLog('info', `Selected: ${object.name}`);
    }
  };

  const getParameters = (): Record<string, string> => {
    const values = form.getFieldsValue();
    const parameters: Record<string, string> = {};

    selectedObject?.parameters.forEach((param) => {
      if (values[param.key]) {
        parameters[param.key] = values[param.key];
      }
    });

    return parameters;
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setLogs([]);
    addLog('info', '═══════════════════════════════════════════════════════════');
    addLog('info', '  Testing Oracle Fusion Connection');
    addLog('info', '═══════════════════════════════════════════════════════════');

    const success = await testGLConnection(addLog);

    if (success) {
      addLog('success', '✓ Connection test passed');
    } else {
      addLog('error', '✗ Connection test failed');
    }

    setIsTesting(false);
  };

  const handleSync = async () => {
    if (!selectedObject) {
      addLog('error', 'Please select a sync object');
      return;
    }

    const parameters = getParameters();

    isSyncingRef.current = true;
    abortControllerRef.current = new AbortController();

    setLogs([]);
    setProgress({
      status: 'fetching_batches',
      totalBatches: 0,
      processedBatches: 0,
      currentBatchId: null,
      currentBatchName: '',
      totalHeaders: 0,
      processedHeaders: 0,
      currentHeaderId: null,
      currentHeaderName: '',
      totalLines: 0,
      processedLines: 0,
      totalBatchesInserted: 0,
      totalHeadersInserted: 0,
      totalLinesInserted: 0,
      errors: 0,
      lastError: '',
      startTime: new Date(),
      endTime: null,
    });

    addLog('step', '═══════════════════════════════════════════════════════════');
    addLog('step', `  GL JOURNAL SYNC - ${testMode ? 'TEST MODE (25 batches)' : 'FULL SYNC'}`);
    addLog('step', '═══════════════════════════════════════════════════════════');

    await syncGLJournals(
      parameters,
      testMode,
      addLog,
      (newProgress) => setProgress((prev) => ({ ...prev, ...newProgress })),
      abortControllerRef.current.signal
    );

    isSyncingRef.current = false;
  };

  const handleStop = () => {
    isSyncingRef.current = false;
    abortControllerRef.current?.abort();
    addLog('warning', '⚠ Stopping sync...');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return REDWOOD.success;
      case 'error': return REDWOOD.error;
      case 'stopped': return REDWOOD.warning;
      default: return REDWOOD.info;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'idle': return 'Ready';
      case 'fetching_batches': return 'Fetching Batches...';
      case 'processing_batch': return 'Processing Batch...';
      case 'fetching_headers': return 'Fetching Headers...';
      case 'processing_header': return 'Processing Header...';
      case 'fetching_lines': return 'Fetching Lines...';
      case 'inserting': return 'Inserting to APEX...';
      case 'completed': return 'Completed';
      case 'error': return 'Error';
      case 'stopped': return 'Stopped';
      default: return status;
    }
  };

  const getLogIcon = (type: SyncLog['type']) => {
    switch (type) {
      case 'success': return <CheckCircleOutlined style={{ color: REDWOOD.success }} />;
      case 'error': return <CloseCircleOutlined style={{ color: REDWOOD.error }} />;
      case 'warning': return <WarningOutlined style={{ color: REDWOOD.warning }} />;
      case 'step': return <ThunderboltOutlined style={{ color: REDWOOD.primary }} />;
      default: return <InfoCircleOutlined style={{ color: REDWOOD.info }} />;
    }
  };

  const logColumns = [
    {
      title: 'Time',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 90,
      render: (date: Date) => (
        <Text style={{ fontSize: 11, color: REDWOOD.textSecondary }}>
          {date.toLocaleTimeString()}
        </Text>
      ),
    },
    {
      title: 'Message',
      dataIndex: 'message',
      key: 'message',
      render: (message: string, record: SyncLog) => (
        <Space>
          {getLogIcon(record.type)}
          <Text
            style={{
              fontSize: 12,
              fontFamily: record.type === 'step' ? 'monospace' : 'inherit',
              fontWeight: record.type === 'step' ? 600 : 400,
              color: record.type === 'step' ? REDWOOD.primary : REDWOOD.textPrimary,
            }}
          >
            {message}
          </Text>
        </Space>
      ),
    },
  ];

  const isSyncing = !['idle', 'completed', 'error', 'stopped'].includes(progress.status);

  // Calculate progress percentages
  const batchProgress = progress.totalBatches > 0
    ? Math.round((progress.processedBatches / progress.totalBatches) * 100)
    : 0;

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.surfaceSecondary }}>
      <Content>
        {/* Header */}
        <div style={{
          padding: '16px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.border}`
        }}>
          <Breadcrumb
            items={[
              { title: <Link to="/home"><HomeOutlined /> Home</Link> },
              { title: 'Sync Data' },
            ]}
          />
        </div>

        <div style={{ padding: 24 }}>
          {/* Title Section */}
          <div style={{ marginBottom: 24 }}>
            <Space align="center">
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                background: REDWOOD.primary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <SyncOutlined style={{ fontSize: 24, color: '#fff' }} spin={isSyncing || isTesting} />
              </div>
              <div>
                <Title level={3} style={{ margin: 0, color: REDWOOD.textPrimary }}>
                  Data Synchronization
                </Title>
                <Text type="secondary">Oracle Fusion → APEX Database</Text>
              </div>
              <Tag color={REDWOOD.primary} style={{ marginLeft: 16 }}>v{SYNC_VERSION}</Tag>
            </Space>
          </div>

          <Row gutter={24}>
            {/* Left Panel - Configuration */}
            <Col xs={24} lg={7}>
              <Card
                style={{
                  borderRadius: 12,
                  border: `1px solid ${REDWOOD.border}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                }}
                bodyStyle={{ padding: 20 }}
              >
                <Title level={5} style={{ marginBottom: 16, color: REDWOOD.textPrimary }}>
                  <DatabaseOutlined style={{ marginRight: 8, color: REDWOOD.primary }} />
                  Configuration
                </Title>

                <Form form={form} layout="vertical">
                  <Form.Item
                    label={<Text strong>Sync Object</Text>}
                    name="syncObject"
                    rules={[{ required: true, message: 'Please select a sync object' }]}
                  >
                    <Select
                      placeholder="Select object to sync"
                      onChange={handleObjectChange}
                      disabled={isSyncing || isTesting}
                      size="large"
                    >
                      {SYNC_OBJECTS.map((obj) => (
                        <Option key={obj.id} value={obj.id}>
                          {obj.name}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>

                  {selectedObject && (
                    <Alert
                      message={selectedObject.description}
                      type="info"
                      showIcon
                      style={{ marginBottom: 16, borderRadius: 8 }}
                    />
                  )}

                  <Form.Item label={<Text strong>API Type</Text>} name="apiType" initialValue="REST">
                    <Select disabled={isSyncing || isTesting} onChange={(v) => setApiType(v)}>
                      <Option value="REST">REST API</Option>
                      <Option value="SOAP" disabled>SOAP (Coming Soon)</Option>
                    </Select>
                  </Form.Item>

                  {selectedObject?.parameters.map((param) => (
                    <Form.Item
                      key={param.key}
                      label={<Text strong>{param.label}</Text>}
                      name={param.key}
                      rules={[{ required: param.required, message: `Please enter ${param.label}` }]}
                      initialValue={param.defaultValue}
                    >
                      <Input placeholder={`Enter ${param.label}`} disabled={isSyncing || isTesting} />
                    </Form.Item>
                  ))}

                  <Divider style={{ margin: '16px 0' }} />

                  {/* Test Mode Toggle */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 16,
                    padding: '12px 16px',
                    background: REDWOOD.surfaceSecondary,
                    borderRadius: 8,
                  }}>
                    <div>
                      <Text strong>Test Mode</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Limit to {ORACLE_FUSION_CONFIG.testLimit} batches
                      </Text>
                    </div>
                    <Switch
                      checked={testMode}
                      onChange={setTestMode}
                      disabled={isSyncing}
                      style={{ backgroundColor: testMode ? REDWOOD.primary : undefined }}
                    />
                  </div>

                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <Button
                      icon={<ApiOutlined />}
                      onClick={handleTestConnection}
                      disabled={isSyncing || isTesting}
                      loading={isTesting}
                      block
                      size="large"
                      style={{ borderRadius: 8 }}
                    >
                      Test Connection
                    </Button>

                    {!isSyncing ? (
                      <Button
                        type="primary"
                        icon={<PlayCircleOutlined />}
                        size="large"
                        onClick={handleSync}
                        disabled={!selectedObject || isTesting}
                        block
                        style={{
                          borderRadius: 8,
                          background: REDWOOD.primary,
                          borderColor: REDWOOD.primary,
                          height: 48,
                        }}
                      >
                        Start Sync
                      </Button>
                    ) : (
                      <Button
                        danger
                        icon={<StopOutlined />}
                        size="large"
                        onClick={handleStop}
                        block
                        style={{ borderRadius: 8, height: 48 }}
                      >
                        Stop Sync
                      </Button>
                    )}
                  </Space>
                </Form>

                {/* Proxy Info */}
                <Divider style={{ margin: '16px 0' }} />
                <Alert
                  message="Proxy Server Required"
                  description={
                    <div style={{ fontSize: 12 }}>
                      <code style={{
                        background: REDWOOD.surfaceSecondary,
                        padding: '2px 6px',
                        borderRadius: 4
                      }}>
                        npm run server
                      </code>
                      <div style={{ marginTop: 4 }}>
                        <Text type="secondary">{PROXY_CONFIG.baseUrl}</Text>
                      </div>
                    </div>
                  }
                  type="warning"
                  showIcon
                  style={{ borderRadius: 8 }}
                />
              </Card>
            </Col>

            {/* Right Panel - Progress & Logs */}
            <Col xs={24} lg={17}>
              {/* Progress Cards */}
              <Row gutter={16} style={{ marginBottom: 16 }}>
                {/* Batches Card */}
                <Col xs={24} sm={8}>
                  <Card
                    style={{
                      borderRadius: 12,
                      border: `1px solid ${REDWOOD.border}`,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    }}
                    bodyStyle={{ padding: 16 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                      <DatabaseOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                      <Text strong>Batches</Text>
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                      {progress.processedBatches} / {progress.totalBatches}
                    </div>
                    <Progress
                      percent={batchProgress}
                      showInfo={false}
                      strokeColor={REDWOOD.primary}
                      style={{ marginTop: 8 }}
                    />
                    {progress.currentBatchName && (
                      <Tooltip title={progress.currentBatchName}>
                        <Text
                          type="secondary"
                          style={{ fontSize: 11, display: 'block', marginTop: 4 }}
                          ellipsis
                        >
                          {progress.currentBatchName}
                        </Text>
                      </Tooltip>
                    )}
                  </Card>
                </Col>

                {/* Headers Card */}
                <Col xs={24} sm={8}>
                  <Card
                    style={{
                      borderRadius: 12,
                      border: `1px solid ${REDWOOD.border}`,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    }}
                    bodyStyle={{ padding: 16 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                      <FileTextOutlined style={{ fontSize: 20, color: REDWOOD.info, marginRight: 8 }} />
                      <Text strong>Headers</Text>
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                      {progress.totalHeadersInserted}
                      <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                        / {progress.totalHeaders}
                      </Text>
                    </div>
                    <Progress
                      percent={progress.totalHeaders > 0 ? Math.round((progress.totalHeadersInserted / progress.totalHeaders) * 100) : 0}
                      showInfo={false}
                      strokeColor={REDWOOD.info}
                      style={{ marginTop: 8 }}
                    />
                    {progress.currentHeaderName && (
                      <Tooltip title={progress.currentHeaderName}>
                        <Text
                          type="secondary"
                          style={{ fontSize: 11, display: 'block', marginTop: 4 }}
                          ellipsis
                        >
                          {progress.currentHeaderName}
                        </Text>
                      </Tooltip>
                    )}
                  </Card>
                </Col>

                {/* Lines Card */}
                <Col xs={24} sm={8}>
                  <Card
                    style={{
                      borderRadius: 12,
                      border: `1px solid ${REDWOOD.border}`,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    }}
                    bodyStyle={{ padding: 16 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                      <UnorderedListOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                      <Text strong>Lines</Text>
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                      {progress.totalLinesInserted}
                      <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                        / {progress.totalLines}
                      </Text>
                    </div>
                    <Progress
                      percent={progress.totalLines > 0 ? Math.round((progress.totalLinesInserted / progress.totalLines) * 100) : 0}
                      showInfo={false}
                      strokeColor={REDWOOD.success}
                      style={{ marginTop: 8 }}
                    />
                    {progress.errors > 0 && (
                      <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                        {progress.errors} errors
                      </Text>
                    )}
                  </Card>
                </Col>
              </Row>

              {/* Status Bar */}
              <Card
                style={{
                  borderRadius: 12,
                  border: `1px solid ${REDWOOD.border}`,
                  marginBottom: 16,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                }}
                bodyStyle={{ padding: '12px 20px' }}
              >
                <Row justify="space-between" align="middle">
                  <Col>
                    <Space size="large">
                      <div>
                        <Tag
                          color={getStatusColor(progress.status)}
                          style={{
                            padding: '4px 12px',
                            fontSize: 13,
                            borderRadius: 16,
                          }}
                        >
                          {getStatusText(progress.status)}
                        </Tag>
                      </div>
                      {progress.startTime && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Started: {progress.startTime.toLocaleTimeString()}
                        </Text>
                      )}
                      {progress.endTime && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Ended: {progress.endTime.toLocaleTimeString()}
                        </Text>
                      )}
                    </Space>
                  </Col>
                  <Col>
                    <Space>
                      <Text type="secondary">
                        <CheckCircleOutlined style={{ color: REDWOOD.success, marginRight: 4 }} />
                        {progress.totalBatchesInserted + progress.totalHeadersInserted + progress.totalLinesInserted} inserted
                      </Text>
                      {progress.errors > 0 && (
                        <Text type="danger">
                          <CloseCircleOutlined style={{ marginRight: 4 }} />
                          {progress.errors} errors
                        </Text>
                      )}
                    </Space>
                  </Col>
                </Row>
              </Card>

              {/* Sync Logs */}
              <Card
                title={
                  <Space>
                    <span>Sync Logs</span>
                    <Tag style={{ borderRadius: 12 }}>{logs.length}</Tag>
                  </Space>
                }
                extra={
                  <Button size="small" onClick={() => setLogs([])}>
                    Clear
                  </Button>
                }
                style={{
                  borderRadius: 12,
                  border: `1px solid ${REDWOOD.border}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                }}
                bodyStyle={{ padding: 0 }}
              >
                <Table
                  dataSource={logs}
                  columns={logColumns}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 20, size: 'small' }}
                  scroll={{ y: 400 }}
                  locale={{ emptyText: 'No sync logs yet. Click "Test Connection" or "Start Sync" to begin.' }}
                  style={{ borderRadius: '0 0 12px 12px' }}
                />
              </Card>
            </Col>
          </Row>
        </div>
      </Content>
    </Layout>
  );
};

export default SyncData;
