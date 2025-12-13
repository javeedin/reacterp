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
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { SYNC_OBJECTS, type SyncObjectConfig, type ApiType } from '../../config/api.config';
import { fetchFromOracle, insertToApex, getOracleTotalCount } from '../../services/sync.service';
import type { SyncLog, SyncProgress } from '../../types/sync.types';

const { Content } = Layout;
const { Text } = Typography;
const { Option } = Select;

const SyncData: React.FC = () => {
  const [form] = Form.useForm();
  const [selectedObject, setSelectedObject] = useState<SyncObjectConfig | null>(null);
  const [, setApiType] = useState<ApiType>('REST');
  const [logs, setLogs] = useState<SyncLog[]>([]);
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
      id: Date.now().toString(),
      timestamp: new Date(),
      type,
      message,
    };
    setLogs((prev) => [log, ...prev].slice(0, 100)); // Keep last 100 logs
  }, []);

  const handleObjectChange = (objectId: string) => {
    const object = SYNC_OBJECTS.find((o) => o.id === objectId);
    setSelectedObject(object || null);
    form.resetFields(['parameters']);
  };

  const handleSync = async () => {
    if (!selectedObject) {
      addLog('error', 'Please select a sync object');
      return;
    }

    const values = await form.validateFields();
    const parameters: Record<string, string> = {};

    selectedObject.parameters.forEach((param) => {
      if (values[param.key]) {
        parameters[param.key] = values[param.key];
      }
    });

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
    addLog('info', `Starting sync for ${selectedObject.name}...`);
    addLog('info', `Parameters: ${JSON.stringify(parameters)}`);

    try {
      // Get total count first
      addLog('info', 'Fetching total record count from Oracle Fusion...');
      const totalCount = await getOracleTotalCount(selectedObject, parameters);

      if (totalCount === 0) {
        addLog('warning', 'No records found in Oracle Fusion for the given parameters');
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
        addLog('info', `Processing batch ${batchNumber}/${totalBatches} (offset: ${offset})...`);

        setProgress((prev) => ({
          ...prev,
          currentBatch: batchNumber,
          currentOffset: offset,
        }));

        // Fetch from Oracle
        addLog('info', `Fetching records from Oracle (offset: ${offset}, limit: ${limit})...`);
        const fetchResult = await fetchFromOracle(selectedObject, parameters, offset, limit);

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

        addLog('success', `Fetched ${records.length} records from Oracle`);
        setProgress((prev) => ({
          ...prev,
          totalFetched,
        }));

        if (records.length > 0) {
          // Insert to APEX
          addLog('info', `Inserting ${records.length} records to APEX Database...`);
          setProgress((prev) => ({ ...prev, status: 'inserting' }));

          const insertResult = await insertToApex(selectedObject, records);

          if (insertResult.success) {
            totalInserted += records.length;
            addLog('success', `Successfully inserted ${records.length} records to APEX`);
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

        // Small delay to prevent overwhelming the APIs
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (isSyncingRef.current) {
        addLog('success', `Sync completed! Fetched: ${totalFetched}, Inserted: ${totalInserted}, Failed: ${totalFailed}`);
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
          <Text>{message}</Text>
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
                    <SyncOutlined spin={isSyncing} />
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
                      disabled={isSyncing}
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
                    <Select disabled={isSyncing} onChange={(v) => setApiType(v)}>
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
                        <Select disabled={isSyncing}>
                          {param.options?.map((opt) => (
                            <Option key={opt.value} value={opt.value}>
                              {opt.label}
                            </Option>
                          ))}
                        </Select>
                      ) : (
                        <Input placeholder={`Enter ${param.label}`} disabled={isSyncing} />
                      )}
                    </Form.Item>
                  ))}

                  <Divider />

                  <Space style={{ width: '100%', justifyContent: 'center' }}>
                    {!isSyncing ? (
                      <Button
                        type="primary"
                        icon={<PlayCircleOutlined />}
                        size="large"
                        onClick={handleSync}
                        disabled={!selectedObject}
                      >
                        Start Sync
                      </Button>
                    ) : (
                      <Button
                        danger
                        icon={<StopOutlined />}
                        size="large"
                        onClick={handleStop}
                      >
                        Stop Sync
                      </Button>
                    )}
                  </Space>
                </Form>
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
                  pagination={{ pageSize: 10, size: 'small' }}
                  scroll={{ y: 300 }}
                  locale={{ emptyText: 'No sync logs yet. Start a sync to see activity.' }}
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
