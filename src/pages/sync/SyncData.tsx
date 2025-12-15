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
  Tooltip,
  Modal,
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
  ExpandOutlined,
  DownloadOutlined,
  SendOutlined,
  BugOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { SYNC_OBJECTS, ORACLE_FUSION_CONFIG, PROXY_CONFIG, APEX_DB_CONFIG, type SyncObjectConfig, type ApiType } from '../../config/api.config';
import { syncGLJournals, testGLConnection, type SyncProgress, type LogCallback, type BatchPayloadCallback } from '../../services/gl-sync.service';
import Autopilot from '../../components/Autopilot';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

const SYNC_VERSION = '2.1.0'; // Added proxy status check

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

// Interface for batch payload debugging
interface BatchPayloadLog {
  batchId: number;
  batchName: string;
  payload: any;
  postResult?: any;
  status: 'pending' | 'success' | 'error';
  errorMessage?: string;
}

// Proxy status type
type ProxyStatus = 'unknown' | 'checking' | 'online' | 'offline';

const SyncData: React.FC = () => {
  const [form] = Form.useForm();
  const [selectedObject, setSelectedObject] = useState<SyncObjectConfig | null>(null);
  const [, setApiType] = useState<ApiType>('REST');
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [testMode, setTestMode] = useState<boolean | 'single'>(true); // true=25, false=full, 'single'=1
  const [proxyStatus, setProxyStatus] = useState<ProxyStatus>('unknown');
  const [proxyError, setProxyError] = useState<string>('');
  const [logDetailVisible, setLogDetailVisible] = useState(false);
  const [selectedLog, setSelectedLog] = useState<SyncLog | null>(null);
  const [batchPayloads, setBatchPayloads] = useState<BatchPayloadLog[]>([]);
  const [batchDebugVisible, setBatchDebugVisible] = useState(false);
  const [selectedBatchPayload, setSelectedBatchPayload] = useState<BatchPayloadLog | null>(null);
  const [isPostingBatch, setIsPostingBatch] = useState(false);
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
  const logCounterRef = useRef(0); // Track total logs generated for debugging

  const addLog: LogCallback = useCallback((type, message) => {
    logCounterRef.current += 1;
    const logNumber = logCounterRef.current;

    const log: SyncLog = {
      id: `${logNumber}-${Date.now()}`,
      timestamp: new Date(),
      type,
      message,
    };

    // Only log to console in test modes (verbose), not full sync for performance
    // Full sync will have minimal logs from the service anyway
    if (testMode !== false) {
      console.log(`[LOG #${logNumber}] [${type.toUpperCase()}] ${message}`);
    }

    setLogs((prev) => [log, ...prev].slice(0, 500));
  }, [testMode]);

  // Update batch payload status after POST
  const updateBatchPayloadStatus = useCallback((batchId: number, status: 'success' | 'error', postResult?: any, errorMessage?: string) => {
    setBatchPayloads((prev) => prev.map((bp) =>
      bp.batchId === batchId
        ? { ...bp, status, postResult, errorMessage }
        : bp
    ));
  }, []);

  // Download batch payloads as log file
  const downloadBatchPayloads = useCallback(() => {
    let content = `BATCH PAYLOADS LOG\n`;
    content += `Generated: ${new Date().toLocaleString()}\n`;
    content += `Total Batches: ${batchPayloads.length}\n`;
    content += `${'='.repeat(80)}\n\n`;

    batchPayloads.forEach((bp, index) => {
      content += `BATCH #${index + 1}\n`;
      content += `${'─'.repeat(40)}\n`;
      content += `Batch ID: ${bp.batchId}\n`;
      content += `Batch Name: ${bp.batchName}\n`;
      content += `Status: ${bp.status.toUpperCase()}\n`;
      if (bp.errorMessage) {
        content += `Error: ${bp.errorMessage}\n`;
      }
      content += `\nPOST Payload:\n`;
      content += JSON.stringify(bp.payload, null, 2);
      content += `\n`;
      if (bp.postResult) {
        content += `\nPOST Response:\n`;
        content += JSON.stringify(bp.postResult, null, 2);
      }
      content += `\n${'─'.repeat(40)}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-payloads-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [batchPayloads]);

  // POST a single batch manually
  const postSingleBatch = useCallback(async (batchPayload: BatchPayloadLog) => {
    setIsPostingBatch(true);
    addLog('step', `──── Manual POST for Batch ${batchPayload.batchId} ────`);

    try {
      const url = `${PROXY_CONFIG.baseUrl}/apex/${APEX_DB_CONFIG.endpoints.journalBatches}`;
      addLog('info', `POST URL: ${url}`);
      addLog('info', `POST Payload: ${JSON.stringify(batchPayload.payload)}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchPayload.payload),
      });

      const data = await response.json();
      addLog('success', `POST Response: ${JSON.stringify(data)}`);

      if (data.success || data.inserted > 0) {
        updateBatchPayloadStatus(batchPayload.batchId, 'success', data);
        addLog('success', `✓ Batch ${batchPayload.batchId} posted successfully!`);
      } else {
        updateBatchPayloadStatus(batchPayload.batchId, 'error', data, data.error || data.lastError || 'Unknown error');
        addLog('error', `✗ Batch ${batchPayload.batchId} failed: ${data.error || data.lastError || JSON.stringify(data)}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      updateBatchPayloadStatus(batchPayload.batchId, 'error', undefined, errorMsg);
      addLog('error', `✗ Batch ${batchPayload.batchId} error: ${errorMsg}`);
    }

    setIsPostingBatch(false);
  }, [addLog, updateBatchPayloadStatus]);

  // Check proxy server status
  const checkProxyStatus = useCallback(async () => {
    setProxyStatus('checking');
    setProxyError('');
    addLog('info', `Checking proxy server at ${PROXY_CONFIG.baseUrl}...`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(`${PROXY_CONFIG.baseUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        setProxyStatus('online');
        addLog('success', `✓ Proxy server is ONLINE (${data.timestamp})`);
        addLog('info', `Proxy URL: ${PROXY_CONFIG.baseUrl}`);
        return true;
      } else {
        setProxyStatus('offline');
        setProxyError(`HTTP ${response.status}`);
        addLog('error', `✗ Proxy returned HTTP ${response.status}`);
        return false;
      }
    } catch (error) {
      setProxyStatus('offline');
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      if (errorMsg.includes('abort')) {
        setProxyError('Connection timeout (5s)');
        addLog('error', '✗ Proxy connection timeout after 5 seconds');
      } else if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
        setProxyError('Cannot connect - server not running?');
        addLog('error', '✗ Cannot connect to proxy server');
        addLog('warning', 'Make sure proxy server is running: node server/proxy.cjs');
      } else {
        setProxyError(errorMsg);
        addLog('error', `✗ Proxy error: ${errorMsg}`);
      }

      addLog('info', '─────────────────────────────────────────');
      addLog('info', 'To start the proxy server, run in a terminal:');
      addLog('step', '  cd C:\\FusionApi\\reacterp');
      addLog('step', '  node server/proxy.cjs');
      addLog('info', '─────────────────────────────────────────');

      return false;
    }
  }, [addLog]);

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
    addLog('step', '═══════════════════════════════════════════════════════════');
    addLog('step', '  CONNECTION TEST');
    addLog('step', '═══════════════════════════════════════════════════════════');

    // Step 1: Check proxy
    addLog('info', '');
    addLog('info', '▶ STEP 1: Checking Proxy Server...');
    const proxyOk = await checkProxyStatus();

    if (!proxyOk) {
      addLog('error', '');
      addLog('error', '✗ CONNECTION TEST FAILED - Proxy server not available');
      setIsTesting(false);
      return;
    }

    // Step 2: Test Oracle connection via proxy
    addLog('info', '');
    addLog('info', '▶ STEP 2: Testing Oracle Fusion via Proxy...');

    const success = await testGLConnection(addLog);

    addLog('info', '');
    if (success) {
      addLog('success', '═══════════════════════════════════════════════════════════');
      addLog('success', '  ✓ CONNECTION TEST PASSED');
      addLog('success', '═══════════════════════════════════════════════════════════');
    } else {
      addLog('error', '═══════════════════════════════════════════════════════════');
      addLog('error', '  ✗ CONNECTION TEST FAILED');
      addLog('error', '═══════════════════════════════════════════════════════════');
    }

    setIsTesting(false);
  };

  // Batch payload callback handler
  const handleBatchPayload: BatchPayloadCallback = useCallback((batchId, batchName, payload, result, error) => {
    setBatchPayloads((prev) => {
      const existing = prev.find((bp) => bp.batchId === batchId);
      if (existing) {
        // Update existing entry
        return prev.map((bp) =>
          bp.batchId === batchId
            ? {
                ...bp,
                postResult: result,
                status: error ? 'error' : (result ? 'success' : 'pending'),
                errorMessage: error,
              }
            : bp
        );
      } else {
        // Add new entry
        return [...prev, {
          batchId,
          batchName,
          payload,
          postResult: result,
          status: error ? 'error' : (result ? 'success' : 'pending'),
          errorMessage: error,
        }];
      }
    });
  }, []);

  const handleSync = async () => {
    if (!selectedObject) {
      addLog('error', 'Please select a sync object');
      return;
    }

    const parameters = getParameters();

    isSyncingRef.current = true;
    abortControllerRef.current = new AbortController();

    // Clear previous data
    setLogs([]);
    setBatchPayloads([]);
    logCounterRef.current = 0;

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

    const modeLabel = testMode === 'single' ? 'SINGLE RECORD DEBUG' : (testMode ? 'TEST MODE (25 batches)' : 'FULL SYNC');
    addLog('step', '═══════════════════════════════════════════════════════════');
    addLog('step', `  GL JOURNAL SYNC - ${modeLabel}`);
    addLog('step', '═══════════════════════════════════════════════════════════');

    await syncGLJournals(
      parameters,
      testMode,
      addLog,
      (newProgress) => setProgress((prev) => ({ ...prev, ...newProgress })),
      abortControllerRef.current.signal,
      handleBatchPayload
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

  const handleViewLog = (log: SyncLog) => {
    setSelectedLog(log);
    setLogDetailVisible(true);
  };

  // Try to format JSON if the message contains JSON
  const formatLogMessage = (message: string) => {
    // Check if message contains JSON object or array
    const jsonMatch = message.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const before = message.substring(0, jsonMatch.index);
        const after = message.substring((jsonMatch.index || 0) + jsonMatch[0].length);
        return (
          <>
            {before && <div style={{ marginBottom: 8 }}>{before}</div>}
            <pre style={{
              background: REDWOOD.surfaceSecondary,
              padding: 12,
              borderRadius: 8,
              overflow: 'auto',
              maxHeight: 400,
              fontSize: 12,
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {JSON.stringify(parsed, null, 2)}
            </pre>
            {after && <div style={{ marginTop: 8 }}>{after}</div>}
          </>
        );
      } catch {
        // Not valid JSON, return as-is
      }
    }
    // Check for URLs
    if (message.includes('http://') || message.includes('https://')) {
      return (
        <div style={{
          wordBreak: 'break-all',
          fontFamily: 'monospace',
          fontSize: 12,
          lineHeight: 1.6,
        }}>
          {message}
        </div>
      );
    }
    return message;
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
              maxWidth: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'inline-block',
            }}
          >
            {message}
          </Text>
        </Space>
      ),
    },
    {
      title: '',
      key: 'action',
      width: 40,
      render: (_: unknown, record: SyncLog) => (
        <Tooltip title="View full message">
          <Button
            type="text"
            size="small"
            icon={<ExpandOutlined style={{ color: REDWOOD.info }} />}
            onClick={() => handleViewLog(record)}
          />
        </Tooltip>
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
              <Link to="/sync/jobs">
                <Button
                  type="default"
                  icon={<RocketOutlined />}
                  style={{ marginLeft: 16 }}
                >
                  Background Jobs
                </Button>
              </Link>
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

                  {/* Sync Mode Selection */}
                  <div style={{
                    marginBottom: 16,
                    padding: '12px 16px',
                    background: REDWOOD.surfaceSecondary,
                    borderRadius: 8,
                  }}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>Sync Mode</Text>
                    <Select
                      value={testMode}
                      onChange={(value) => setTestMode(value)}
                      disabled={isSyncing}
                      style={{ width: '100%' }}
                    >
                      <Option value="single">
                        <span style={{ color: REDWOOD.warning }}>●</span> Single Record (Debug)
                      </Option>
                      <Option value={true}>
                        <span style={{ color: REDWOOD.info }}>●</span> Test Mode ({ORACLE_FUSION_CONFIG.testLimit} batches)
                      </Option>
                      <Option value={false}>
                        <span style={{ color: REDWOOD.success }}>●</span> Full Sync (All records)
                      </Option>
                    </Select>
                    <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                      {testMode === 'single'
                        ? 'Debug mode: Sync only 1 batch with full logging'
                        : testMode
                        ? `Limited to ${ORACLE_FUSION_CONFIG.testLimit} batches for testing`
                        : 'Full sync - all matching records'}
                    </Text>
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

                {/* Proxy Status */}
                <Divider style={{ margin: '16px 0' }} />
                <div style={{
                  padding: 16,
                  background: proxyStatus === 'online' ? '#f6ffed' : proxyStatus === 'offline' ? '#fff2f0' : REDWOOD.surfaceSecondary,
                  borderRadius: 8,
                  border: `1px solid ${proxyStatus === 'online' ? '#b7eb8f' : proxyStatus === 'offline' ? '#ffccc7' : REDWOOD.border}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text strong>Proxy Server</Text>
                    <Tag
                      color={
                        proxyStatus === 'online' ? 'success' :
                        proxyStatus === 'offline' ? 'error' :
                        proxyStatus === 'checking' ? 'processing' : 'default'
                      }
                    >
                      {proxyStatus === 'online' ? '● ONLINE' :
                       proxyStatus === 'offline' ? '● OFFLINE' :
                       proxyStatus === 'checking' ? '● CHECKING...' : '● UNKNOWN'}
                    </Tag>
                  </div>

                  <div style={{ fontSize: 12, marginBottom: 8 }}>
                    <Text type="secondary">{PROXY_CONFIG.baseUrl}</Text>
                  </div>

                  {proxyError && (
                    <div style={{ fontSize: 11, color: REDWOOD.error, marginBottom: 8 }}>
                      Error: {proxyError}
                    </div>
                  )}

                  <Button
                    size="small"
                    icon={<ApiOutlined />}
                    onClick={checkProxyStatus}
                    loading={proxyStatus === 'checking'}
                    style={{ marginBottom: 8 }}
                    block
                  >
                    Check Proxy Status
                  </Button>

                  {proxyStatus === 'offline' && (
                    <Alert
                      message="Start proxy server"
                      description={
                        <div style={{ fontSize: 11 }}>
                          <div>Open a terminal and run:</div>
                          <code style={{
                            display: 'block',
                            background: '#fff',
                            padding: '4px 8px',
                            borderRadius: 4,
                            marginTop: 4,
                            fontSize: 11,
                          }}>
                            cd C:\FusionApi\reacterp<br/>
                            node server/proxy.cjs
                          </code>
                        </div>
                      }
                      type="error"
                      showIcon
                      style={{ borderRadius: 6, marginTop: 8 }}
                    />
                  )}
                </div>
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

              {/* Batch Debug Section */}
              {batchPayloads.length > 0 && (
                <Card
                  title={
                    <Space>
                      <BugOutlined style={{ color: REDWOOD.warning }} />
                      <span>Batch Debug</span>
                      <Tag style={{ borderRadius: 12 }}>{batchPayloads.length} batches</Tag>
                      <Tag color="success" style={{ borderRadius: 12 }}>
                        {batchPayloads.filter((bp) => bp.status === 'success').length} success
                      </Tag>
                      <Tag color="error" style={{ borderRadius: 12 }}>
                        {batchPayloads.filter((bp) => bp.status === 'error').length} errors
                      </Tag>
                    </Space>
                  }
                  extra={
                    <Space>
                      <Button
                        size="small"
                        icon={<DownloadOutlined />}
                        onClick={downloadBatchPayloads}
                      >
                        Download Log
                      </Button>
                      <Button size="small" onClick={() => setBatchPayloads([])}>
                        Clear
                      </Button>
                    </Space>
                  }
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${REDWOOD.border}`,
                    marginBottom: 16,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  }}
                  bodyStyle={{ padding: 0 }}
                >
                  <Table
                    dataSource={batchPayloads}
                    rowKey="batchId"
                    size="small"
                    pagination={false}
                    scroll={{ y: 200 }}
                    columns={[
                      {
                        title: 'Batch ID',
                        dataIndex: 'batchId',
                        key: 'batchId',
                        width: 100,
                        render: (id: number) => <Text code>{id}</Text>,
                      },
                      {
                        title: 'Batch Name',
                        dataIndex: 'batchName',
                        key: 'batchName',
                        ellipsis: true,
                      },
                      {
                        title: 'Status',
                        dataIndex: 'status',
                        key: 'status',
                        width: 100,
                        render: (status: string) => (
                          <Tag color={status === 'success' ? 'success' : status === 'error' ? 'error' : 'default'}>
                            {status.toUpperCase()}
                          </Tag>
                        ),
                      },
                      {
                        title: 'Error',
                        dataIndex: 'errorMessage',
                        key: 'errorMessage',
                        width: 200,
                        ellipsis: true,
                        render: (error: string) => error ? <Text type="danger" style={{ fontSize: 11 }}>{error}</Text> : '-',
                      },
                      {
                        title: 'Actions',
                        key: 'actions',
                        width: 140,
                        render: (_: unknown, record: BatchPayloadLog) => (
                          <Space size="small">
                            <Tooltip title="View Payload">
                              <Button
                                type="text"
                                size="small"
                                icon={<ExpandOutlined style={{ color: REDWOOD.info }} />}
                                onClick={() => {
                                  setSelectedBatchPayload(record);
                                  setBatchDebugVisible(true);
                                }}
                              />
                            </Tooltip>
                            <Tooltip title="POST this batch">
                              <Button
                                type="text"
                                size="small"
                                icon={<SendOutlined style={{ color: REDWOOD.primary }} />}
                                onClick={() => postSingleBatch(record)}
                                loading={isPostingBatch}
                              />
                            </Tooltip>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Card>
              )}

              {/* Sync Logs */}
              <Card
                title={
                  <Space>
                    <span>Sync Logs</span>
                    <Tag style={{ borderRadius: 12 }}>{logs.length} displayed</Tag>
                    <Tag color="blue" style={{ borderRadius: 12 }}>{logCounterRef.current} generated</Tag>
                    {logCounterRef.current !== logs.length && logCounterRef.current > 0 && (
                      <Tag color="warning" style={{ borderRadius: 12 }}>
                        {logCounterRef.current - logs.length} missing!
                      </Tag>
                    )}
                  </Space>
                }
                extra={
                  <Space>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Check browser console (F12) for all logs
                    </Text>
                    <Button size="small" onClick={() => { setLogs([]); logCounterRef.current = 0; }}>
                      Clear
                    </Button>
                  </Space>
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

      {/* Autopilot Assistant */}
      <Autopilot />

      {/* Log Detail Modal */}
      <Modal
        title={
          <Space>
            {selectedLog && getLogIcon(selectedLog.type)}
            <span>Log Details</span>
            {selectedLog && (
              <Tag
                color={
                  selectedLog.type === 'success' ? 'success' :
                  selectedLog.type === 'error' ? 'error' :
                  selectedLog.type === 'warning' ? 'warning' :
                  selectedLog.type === 'step' ? 'volcano' : 'blue'
                }
              >
                {selectedLog.type.toUpperCase()}
              </Tag>
            )}
          </Space>
        }
        open={logDetailVisible}
        onCancel={() => setLogDetailVisible(false)}
        footer={[
          <Button key="copy" onClick={() => {
            if (selectedLog) {
              navigator.clipboard.writeText(selectedLog.message);
            }
          }}>
            Copy to Clipboard
          </Button>,
          <Button key="close" type="primary" onClick={() => setLogDetailVisible(false)}>
            Close
          </Button>,
        ]}
        width={700}
      >
        {selectedLog && (
          <div>
            <div style={{
              marginBottom: 12,
              padding: '8px 12px',
              background: REDWOOD.surfaceSecondary,
              borderRadius: 6,
              fontSize: 12,
            }}>
              <Text type="secondary">Time: </Text>
              <Text strong>{selectedLog.timestamp.toLocaleString()}</Text>
            </div>
            <div style={{
              padding: 16,
              background: '#fafafa',
              borderRadius: 8,
              border: `1px solid ${REDWOOD.border}`,
              minHeight: 100,
              maxHeight: 500,
              overflow: 'auto',
            }}>
              {formatLogMessage(selectedLog.message)}
            </div>
          </div>
        )}
      </Modal>

      {/* Batch Debug Modal */}
      <Modal
        title={
          <Space>
            <BugOutlined style={{ color: REDWOOD.warning }} />
            <span>Batch Payload Debug</span>
            {selectedBatchPayload && (
              <Tag
                color={
                  selectedBatchPayload.status === 'success' ? 'success' :
                  selectedBatchPayload.status === 'error' ? 'error' : 'default'
                }
              >
                {selectedBatchPayload.status.toUpperCase()}
              </Tag>
            )}
          </Space>
        }
        open={batchDebugVisible}
        onCancel={() => setBatchDebugVisible(false)}
        footer={[
          <Button
            key="copy"
            onClick={() => {
              if (selectedBatchPayload) {
                navigator.clipboard.writeText(JSON.stringify(selectedBatchPayload.payload, null, 2));
              }
            }}
          >
            Copy Payload
          </Button>,
          <Button
            key="post"
            type="primary"
            icon={<SendOutlined />}
            loading={isPostingBatch}
            onClick={() => {
              if (selectedBatchPayload) {
                postSingleBatch(selectedBatchPayload);
              }
            }}
            style={{ background: REDWOOD.primary }}
          >
            POST This Batch
          </Button>,
          <Button key="close" onClick={() => setBatchDebugVisible(false)}>
            Close
          </Button>,
        ]}
        width={800}
      >
        {selectedBatchPayload && (
          <div>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={12}>
                <div style={{
                  padding: '8px 12px',
                  background: REDWOOD.surfaceSecondary,
                  borderRadius: 6,
                  fontSize: 12,
                }}>
                  <Text type="secondary">Batch ID: </Text>
                  <Text strong code>{selectedBatchPayload.batchId}</Text>
                </div>
              </Col>
              <Col span={12}>
                <div style={{
                  padding: '8px 12px',
                  background: REDWOOD.surfaceSecondary,
                  borderRadius: 6,
                  fontSize: 12,
                }}>
                  <Text type="secondary">Batch Name: </Text>
                  <Text strong>{selectedBatchPayload.batchName}</Text>
                </div>
              </Col>
            </Row>

            {selectedBatchPayload.errorMessage && (
              <Alert
                type="error"
                message="Error"
                description={selectedBatchPayload.errorMessage}
                style={{ marginBottom: 16 }}
              />
            )}

            <Divider style={{ margin: '12px 0' }}>POST Payload</Divider>
            <pre style={{
              background: '#fafafa',
              padding: 16,
              borderRadius: 8,
              border: `1px solid ${REDWOOD.border}`,
              maxHeight: 300,
              overflow: 'auto',
              fontSize: 12,
              fontFamily: 'monospace',
            }}>
              {JSON.stringify(selectedBatchPayload.payload, null, 2)}
            </pre>

            {selectedBatchPayload.postResult && (
              <>
                <Divider style={{ margin: '12px 0' }}>POST Response</Divider>
                <pre style={{
                  background: selectedBatchPayload.status === 'success' ? '#f6ffed' : '#fff2f0',
                  padding: 16,
                  borderRadius: 8,
                  border: `1px solid ${selectedBatchPayload.status === 'success' ? '#b7eb8f' : '#ffccc7'}`,
                  maxHeight: 200,
                  overflow: 'auto',
                  fontSize: 12,
                  fontFamily: 'monospace',
                }}>
                  {JSON.stringify(selectedBatchPayload.postResult, null, 2)}
                </pre>
              </>
            )}
          </div>
        )}
      </Modal>
    </Layout>
  );
};

export default SyncData;
