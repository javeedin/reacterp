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
  Statistic,
  Row,
  Col,
  Divider,
  Alert,
  Breadcrumb,
} from 'antd';
import {
  SyncOutlined,
  PlayCircleOutlined,
  StopOutlined,
  HomeOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  WarningOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { SYNC_OBJECTS, ORACLE_FUSION_CONFIG, APEX_DB_CONFIG, type SyncObjectConfig, type ApiType } from '../../config/api.config';
import { fetchFromOracle, insertToApex, getOracleTotalCount, testOracleConnection, buildOracleUrl } from '../../services/sync.service';
import type { SyncLog, SyncProgress } from '../../types/sync.types';

const { Content } = Layout;
const { Text } = Typography;
const { Option } = Select;

const SyncData: React.FC = () => {
  const [form] = Form.useForm();
  const [selectedObject, setSelectedObject] = useState<SyncObjectConfig | null>(null);
  const [, setApiType] = useState<ApiType>('REST');
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [progress, setProgress] = useState<SyncProgress>({
    status: 'idle',
    totalRecordsInSource: 0,
    totalFetched: 0,
    totalInserted: 0,
    totalFailed: 0,
    currentOffset: 0,
    currentBatch: 0,
    totalBatches: 0,
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const isSyncingRef = useRef(false);

  const addLog = useCallback((type: SyncLog['type'], message: string) => {
    const log: SyncLog = {
      id: Date.now().toString() + Math.random(),
      timestamp: new Date(),
      type,
      message,
    };
    setLogs((prev) => [log, ...prev].slice(0, 200)); // Keep last 200 logs
  }, []);

  const handleObjectChange = (objectId: string) => {
    const object = SYNC_OBJECTS.find((o) => o.id === objectId);
    setSelectedObject(object || null);
    form.resetFields(['parameters']);

    if (object) {
      addLog('info', `Selected: ${object.name}`);
      addLog('info', `Oracle Endpoint: ${ORACLE_FUSION_CONFIG.baseUrl}${object.oracleEndpoint}`);
      addLog('info', `APEX Endpoint: ${APEX_DB_CONFIG.baseUrl}${object.apexEndpoint}`);
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
    if (!selectedObject) {
      addLog('error', 'Please select a sync object first');
      return;
    }

    setIsTesting(true);
    setLogs([]);

    const parameters = getParameters();

    addLog('info', '=== TESTING ORACLE CONNECTION ===');
    addLog('info', `Object: ${selectedObject.name}`);
    addLog('info', `Base URL: ${ORACLE_FUSION_CONFIG.baseUrl}`);
    addLog('info', `User: ${ORACLE_FUSION_CONFIG.username}`);

    const url = buildOracleUrl(selectedObject, parameters, 0, 1);
    addLog('info', `Full URL: ${url}`);

    const result = await testOracleConnection(selectedObject, parameters, addLog);

    if (result.success) {
      addLog('success', '=== CONNECTION TEST PASSED ===');
    } else {
      addLog('error', '=== CONNECTION TEST FAILED ===');
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

    setProgress({
      status: 'fetching',
      totalRecordsInSource: 0,
      totalFetched: 0,
      totalInserted: 0,
      totalFailed: 0,
      currentOffset: 0,
      currentBatch: 0,
      totalBatches: 0,
      startTime: new Date(),
    });

    setLogs([]);
    addLog('info', '=== STARTING SYNC ===');
    addLog('info', `Object: ${selectedObject.name}`);
    addLog('info', `Parameters: ${JSON.stringify(parameters)}`);
    addLog('info', `Oracle URL: ${ORACLE_FUSION_CONFIG.baseUrl}${selectedObject.oracleEndpoint}`);
    addLog('info', `APEX URL: ${APEX_DB_CONFIG.baseUrl}${selectedObject.apexEndpoint}`);

    try {
      // Get total count first
      addLog('info', 'Step 1: Getting total record count from Oracle Fusion...');
      const totalCount = await getOracleTotalCount(selectedObject, parameters, addLog);

      if (totalCount === 0) {
        addLog('warning', 'No records found in Oracle Fusion for the given parameters');
        addLog('warning', 'This could be due to: CORS blocking, invalid credentials, or no matching data');
        setProgress((prev) => ({ ...prev, status: 'completed', endTime: new Date() }));
        return;
      }

      const limit = 500;
      const totalBatches = Math.ceil(totalCount / limit);

      addLog('success', `Found ${totalCount} records in Oracle Fusion`);
      addLog('info', `Will process in ${totalBatches} batches of ${limit} records each`);

      setProgress((prev) => ({
        ...prev,
        totalRecordsInSource: totalCount,
        totalBatches,
      }));

      let offset = 0;
      let batchNumber = 0;
      let totalFetched = 0;
      let totalInserted = 0;
      let totalFailed = 0;
      let hasMore = true;

      while (hasMore && isSyncingRef.current) {
        batchNumber++;
        addLog('info', `=== BATCH ${batchNumber}/${totalBatches} ===`);

        setProgress((prev) => ({
          ...prev,
          currentBatch: batchNumber,
          currentOffset: offset,
        }));

        // Fetch from Oracle
        addLog('info', `Fetching from Oracle (offset: ${offset}, limit: ${limit})...`);
        const fetchResult = await fetchFromOracle(selectedObject, parameters, offset, limit, addLog);

        if (!fetchResult.success) {
          addLog('error', `Fetch failed: ${fetchResult.error}`);
          totalFailed += limit;
          setProgress((prev) => ({
            ...prev,
            status: 'error',
            totalFailed,
            errorMessage: fetchResult.error,
          }));
          break;
        }

        const records = fetchResult.data || [];
        totalFetched += records.length;
        hasMore = fetchResult.hasMore || false;

        addLog('success', `Fetched ${records.length} records (total fetched: ${totalFetched})`);
        setProgress((prev) => ({
          ...prev,
          totalFetched,
        }));

        if (records.length > 0) {
          // Insert to APEX
          addLog('info', `Inserting ${records.length} records to APEX Database...`);
          setProgress((prev) => ({ ...prev, status: 'inserting' }));

          const insertResult = await insertToApex(selectedObject, records, addLog);

          if (insertResult.success) {
            totalInserted += records.length;
            addLog('success', `Inserted ${records.length} records (total inserted: ${totalInserted})`);
          } else {
            totalFailed += records.length;
            addLog('error', `Insert failed: ${insertResult.error}`);
          }

          setProgress((prev) => ({
            ...prev,
            status: 'fetching',
            totalInserted,
            totalFailed,
          }));
        }

        offset += limit;
        addLog('info', `hasMore: ${hasMore}, next offset: ${offset}`);

        // Small delay to prevent overwhelming the APIs
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (isSyncingRef.current) {
        addLog('success', '=== SYNC COMPLETED ===');
        addLog('success', `Total Fetched: ${totalFetched}`);
        addLog('success', `Total Inserted: ${totalInserted}`);
        addLog('success', `Total Failed: ${totalFailed}`);
        setProgress((prev) => ({
          ...prev,
          status: 'completed',
          endTime: new Date(),
        }));
      } else {
        addLog('warning', 'Sync was stopped by user');
        setProgress((prev) => ({
          ...prev,
          status: 'idle',
          endTime: new Date(),
        }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addLog('error', `Sync error: ${errorMessage}`);
      setProgress((prev) => ({
        ...prev,
        status: 'error',
        errorMessage,
        endTime: new Date(),
      }));
    }

    isSyncingRef.current = false;
  };

  const handleStop = () => {
    isSyncingRef.current = false;
    abortControllerRef.current?.abort();
    addLog('warning', 'Stopping sync...');
  };

  const getProgressPercent = () => {
    if (progress.totalRecordsInSource === 0) return 0;
    return Math.round((progress.totalFetched / progress.totalRecordsInSource) * 100);
  };

  const getLogIcon = (type: SyncLog['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'error':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      case 'warning':
        return <WarningOutlined style={{ color: '#faad14' }} />;
      default:
        return <InfoCircleOutlined style={{ color: '#1890ff' }} />;
    }
  };

  const logColumns = [
    {
      title: 'Time',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 100,
      render: (date: Date) => date.toLocaleTimeString(),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (type: SyncLog['type']) => {
        const colors: Record<string, string> = {
          info: 'blue',
          success: 'green',
          error: 'red',
          warning: 'orange',
        };
        return <Tag color={colors[type]}>{type.toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Message',
      dataIndex: 'message',
      key: 'message',
      render: (message: string, record: SyncLog) => (
        <Space>
          {getLogIcon(record.type)}
          <Text style={{ fontSize: 12, wordBreak: 'break-all' }}>{message}</Text>
        </Space>
      ),
    },
  ];

  const isSyncing = progress.status === 'fetching' || progress.status === 'inserting';

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: '#f5f5f5' }}>
      <Content>
        <div style={{ padding: '16px 24px', background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
          <Breadcrumb
            items={[
              { title: <Link to="/home"><HomeOutlined /> Home</Link> },
              { title: 'Sync Data' },
            ]}
          />
        </div>

        <div style={{ padding: 24 }}>
          <Row gutter={24}>
            {/* Configuration Panel */}
            <Col xs={24} lg={8}>
              <Card
                title={
                  <Space>
                    <SyncOutlined spin={isSyncing || isTesting} />
                    <span>Sync Configuration</span>
                  </Space>
                }
              >
                <Form form={form} layout="vertical">
                  <Form.Item
                    label="Sync Object"
                    name="syncObject"
                    rules={[{ required: true, message: 'Please select a sync object' }]}
                  >
                    <Select
                      placeholder="Select object to sync"
                      onChange={handleObjectChange}
                      disabled={isSyncing || isTesting}
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
                      style={{ marginBottom: 16 }}
                    />
                  )}

                  <Form.Item label="API Type" name="apiType" initialValue="REST">
                    <Select disabled={isSyncing || isTesting} onChange={(v) => setApiType(v)}>
                      <Option value="REST">REST API</Option>
                      <Option value="SOAP" disabled>
                        SOAP (Coming Soon)
                      </Option>
                    </Select>
                  </Form.Item>

                  {selectedObject?.parameters.map((param) => (
                    <Form.Item
                      key={param.key}
                      label={param.label}
                      name={param.key}
                      rules={[{ required: param.required, message: `Please enter ${param.label}` }]}
                      initialValue={param.defaultValue}
                    >
                      {param.type === 'select' ? (
                        <Select disabled={isSyncing || isTesting}>
                          {param.options?.map((opt) => (
                            <Option key={opt.value} value={opt.value}>
                              {opt.label}
                            </Option>
                          ))}
                        </Select>
                      ) : (
                        <Input placeholder={`Enter ${param.label}`} disabled={isSyncing || isTesting} />
                      )}
                    </Form.Item>
                  ))}

                  <Divider />

                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Button
                      icon={<ApiOutlined />}
                      onClick={handleTestConnection}
                      disabled={!selectedObject || isSyncing || isTesting}
                      loading={isTesting}
                      block
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
                      >
                        Stop Sync
                      </Button>
                    )}
                  </Space>
                </Form>

                {/* API Info */}
                <Divider />
                <div style={{ fontSize: 11, color: '#888' }}>
                  <div><strong>Oracle Host:</strong></div>
                  <div style={{ wordBreak: 'break-all', marginBottom: 8 }}>
                    {ORACLE_FUSION_CONFIG.baseUrl}
                  </div>
                  <div><strong>APEX Host:</strong></div>
                  <div style={{ wordBreak: 'break-all' }}>
                    {APEX_DB_CONFIG.baseUrl}
                  </div>
                </div>
              </Card>
            </Col>

            {/* Progress Panel */}
            <Col xs={24} lg={16}>
              <Card title="Sync Progress" style={{ marginBottom: 24 }}>
                <Row gutter={16}>
                  <Col span={6}>
                    <Statistic
                      title="Total in Source"
                      value={progress.totalRecordsInSource}
                      prefix={<CloudDownloadOutlined />}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="Fetched"
                      value={progress.totalFetched}
                      valueStyle={{ color: '#1890ff' }}
                      prefix={<CloudDownloadOutlined />}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="Inserted"
                      value={progress.totalInserted}
                      valueStyle={{ color: '#52c41a' }}
                      prefix={<CloudUploadOutlined />}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="Failed"
                      value={progress.totalFailed}
                      valueStyle={{ color: '#ff4d4f' }}
                      prefix={<CloseCircleOutlined />}
                    />
                  </Col>
                </Row>

                <Divider />

                <div style={{ marginBottom: 16 }}>
                  <Space style={{ marginBottom: 8 }}>
                    <Text strong>Overall Progress:</Text>
                    <Text type="secondary">
                      Batch {progress.currentBatch} of {progress.totalBatches}
                    </Text>
                  </Space>
                  <Progress
                    percent={getProgressPercent()}
                    status={
                      progress.status === 'error'
                        ? 'exception'
                        : progress.status === 'completed'
                        ? 'success'
                        : 'active'
                    }
                    strokeColor={{
                      '0%': '#108ee9',
                      '100%': '#87d068',
                    }}
                  />
                </div>

                <Row gutter={16}>
                  <Col span={12}>
                    <Card size="small" style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
                      <Statistic
                        title="Fetch Progress"
                        value={progress.totalFetched}
                        suffix={`/ ${progress.totalRecordsInSource}`}
                        valueStyle={{ fontSize: 18 }}
                      />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small" style={{ background: '#e6f7ff', borderColor: '#91d5ff' }}>
                      <Statistic
                        title="Insert Progress"
                        value={progress.totalInserted}
                        suffix={`/ ${progress.totalFetched}`}
                        valueStyle={{ fontSize: 18 }}
                      />
                    </Card>
                  </Col>
                </Row>

                {progress.status !== 'idle' && (
                  <div style={{ marginTop: 16 }}>
                    <Tag
                      color={
                        progress.status === 'completed'
                          ? 'success'
                          : progress.status === 'error'
                          ? 'error'
                          : 'processing'
                      }
                      style={{ padding: '4px 12px', fontSize: 14 }}
                    >
                      {progress.status.toUpperCase()}
                    </Tag>
                    {progress.startTime && (
                      <Text type="secondary" style={{ marginLeft: 8 }}>
                        Started: {progress.startTime.toLocaleTimeString()}
                      </Text>
                    )}
                    {progress.endTime && (
                      <Text type="secondary" style={{ marginLeft: 8 }}>
                        | Ended: {progress.endTime.toLocaleTimeString()}
                      </Text>
                    )}
                  </div>
                )}
              </Card>

              {/* Sync Logs */}
              <Card
                title={
                  <Space>
                    <span>Sync Logs</span>
                    <Tag>{logs.length} entries</Tag>
                  </Space>
                }
                extra={
                  <Button size="small" onClick={() => setLogs([])}>
                    Clear Logs
                  </Button>
                }
              >
                <Table
                  dataSource={logs}
                  columns={logColumns}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 15, size: 'small' }}
                  scroll={{ y: 400 }}
                  locale={{ emptyText: 'No sync logs yet. Click "Test Connection" or "Start Sync" to see activity.' }}
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
