import React, { useState, useEffect, useCallback } from 'react';
import {
  Layout,
  Card,
  Typography,
  Button,
  Space,
  Table,
  Tag,
  Progress,
  Row,
  Col,
  Breadcrumb,
  Modal,
  Form,
  Select,
  Input,
  message,
  Tooltip,
  Statistic,
  Empty,
} from 'antd';
import {
  HomeOutlined,
  SyncOutlined,
  PlayCircleOutlined,
  StopOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

// Oracle Redwood color palette
const REDWOOD = {
  primary: '#C74634',
  success: '#13A688',
  error: '#D93025',
  warning: '#F5A623',
  info: '#0572EC',
  textPrimary: '#161513',
  textSecondary: '#6B6B6B',
  border: '#E5E5E5',
  surfacePrimary: '#FFFFFF',
  surfaceSecondary: '#F7F6F5',
};

// Python Job Server URL
const JOB_SERVER_URL = 'http://localhost:5000/api';

interface Job {
  job_id: string;
  sync_type: string;
  mode: string;
  parameters: Record<string, string>;
  status: 'starting' | 'running' | 'completed' | 'stopped' | 'error';
  progress: number;
  total_batches: number;
  processed_batches: number;
  total_headers: number;
  total_lines: number;
  errors: number;
  current_batch: string;
  message: string;
  start_time: string;
  end_time: string | null;
  pid: number | null;
}

const JobsMonitor: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [newJobModalVisible, setNewJobModalVisible] = useState(false);
  const [submittingJob, setSubmittingJob] = useState(false);
  const [form] = Form.useForm();

  // Fetch jobs from server
  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch(`${JOB_SERVER_URL}/jobs`);
      const data = await response.json();
      if (data.success) {
        setJobs(data.jobs);
        setServerOnline(true);
      }
    } catch {
      setServerOnline(false);
      setJobs([]);
    }
  }, []);

  // Check server health
  const checkServer = useCallback(async () => {
    try {
      const response = await fetch(`${JOB_SERVER_URL}/health`);
      const data = await response.json();
      setServerOnline(data.status === 'ok');
    } catch {
      setServerOnline(false);
    }
  }, []);

  // Initial load and polling
  useEffect(() => {
    checkServer();
    fetchJobs();

    // Poll every 2 seconds for running jobs
    const interval = setInterval(() => {
      fetchJobs();
    }, 2000);

    return () => clearInterval(interval);
  }, [checkServer, fetchJobs]);

  // Create new job
  const handleCreateJob = async (values: any) => {
    setSubmittingJob(true);
    try {
      const response = await fetch(`${JOB_SERVER_URL}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sync_type: values.sync_type,
          mode: values.mode,
          parameters: {
            DefaultPeriodName: values.period,
          },
        }),
      });

      const data = await response.json();
      if (data.success) {
        message.success(`Job ${data.job_id} started successfully!`);
        setNewJobModalVisible(false);
        form.resetFields();
        fetchJobs();
      } else {
        message.error(data.error || 'Failed to create job');
      }
    } catch (error) {
      message.error('Failed to connect to job server');
    }
    setSubmittingJob(false);
  };

  // Stop job
  const handleStopJob = async (jobId: string) => {
    try {
      const response = await fetch(`${JOB_SERVER_URL}/jobs/${jobId}/stop`, {
        method: 'POST',
      });
      const data = await response.json();
      if (data.success) {
        message.success('Job stopped');
        fetchJobs();
      } else {
        message.error(data.error || 'Failed to stop job');
      }
    } catch {
      message.error('Failed to connect to job server');
    }
  };

  // Delete job
  const handleDeleteJob = async (jobId: string) => {
    try {
      const response = await fetch(`${JOB_SERVER_URL}/jobs/${jobId}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        message.success('Job deleted');
        fetchJobs();
      } else {
        message.error(data.error || 'Failed to delete job');
      }
    } catch {
      message.error('Failed to connect to job server');
    }
  };

  // Clear completed jobs
  const handleClearCompleted = async () => {
    try {
      const response = await fetch(`${JOB_SERVER_URL}/jobs/clear`, {
        method: 'POST',
      });
      const data = await response.json();
      if (data.success) {
        message.success(`Cleared ${data.cleared} jobs`);
        fetchJobs();
      }
    } catch {
      message.error('Failed to connect to job server');
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <LoadingOutlined style={{ color: REDWOOD.info }} spin />;
      case 'completed':
        return <CheckCircleOutlined style={{ color: REDWOOD.success }} />;
      case 'error':
        return <CloseCircleOutlined style={{ color: REDWOOD.error }} />;
      case 'stopped':
        return <ExclamationCircleOutlined style={{ color: REDWOOD.warning }} />;
      case 'starting':
        return <ClockCircleOutlined style={{ color: REDWOOD.textSecondary }} />;
      default:
        return <ClockCircleOutlined />;
    }
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'processing';
      case 'completed':
        return 'success';
      case 'error':
        return 'error';
      case 'stopped':
        return 'warning';
      default:
        return 'default';
    }
  };

  // Format duration
  const formatDuration = (start: string, end: string | null) => {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date();
    const diff = Math.floor((endDate.getTime() - startDate.getTime()) / 1000);

    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  };

  // Table columns
  const columns = [
    {
      title: 'Job ID',
      dataIndex: 'job_id',
      key: 'job_id',
      width: 100,
      render: (id: string) => <Text code>{id}</Text>,
    },
    {
      title: 'Type',
      dataIndex: 'sync_type',
      key: 'sync_type',
      width: 120,
      render: (type: string) => (
        <Tag color="blue">{type.replace('_', ' ').toUpperCase()}</Tag>
      ),
    },
    {
      title: 'Mode',
      dataIndex: 'mode',
      key: 'mode',
      width: 80,
      render: (mode: string) => (
        <Tag color={mode === 'full' ? 'volcano' : mode === 'test' ? 'orange' : 'green'}>
          {mode.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => (
        <Space>
          {getStatusIcon(status)}
          <Tag color={getStatusColor(status)}>{status.toUpperCase()}</Tag>
        </Space>
      ),
    },
    {
      title: 'Progress',
      key: 'progress',
      width: 200,
      render: (_: unknown, record: Job) => (
        <div>
          <Progress
            percent={record.progress}
            size="small"
            status={record.status === 'error' ? 'exception' : record.status === 'completed' ? 'success' : 'active'}
            strokeColor={record.status === 'running' ? REDWOOD.info : undefined}
          />
          {record.status === 'running' && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {record.current_batch || record.message}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Stats',
      key: 'stats',
      width: 150,
      render: (_: unknown, record: Job) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 11 }}>
            Batches: {record.processed_batches}/{record.total_batches}
          </Text>
          <Text style={{ fontSize: 11 }}>
            Headers: {record.total_headers} | Lines: {record.total_lines}
          </Text>
          {record.errors > 0 && (
            <Text type="danger" style={{ fontSize: 11 }}>
              Errors: {record.errors}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Duration',
      key: 'duration',
      width: 100,
      render: (_: unknown, record: Job) => (
        <Text style={{ fontSize: 12 }}>
          {formatDuration(record.start_time, record.end_time)}
        </Text>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_: unknown, record: Job) => (
        <Space>
          {record.status === 'running' && (
            <Tooltip title="Stop Job">
              <Button
                type="text"
                size="small"
                danger
                icon={<StopOutlined />}
                onClick={() => handleStopJob(record.job_id)}
              />
            </Tooltip>
          )}
          {['completed', 'error', 'stopped'].includes(record.status) && (
            <Tooltip title="Delete Job">
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => handleDeleteJob(record.job_id)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  // Count jobs by status
  const runningJobs = jobs.filter((j) => j.status === 'running').length;
  const completedJobs = jobs.filter((j) => j.status === 'completed').length;
  const errorJobs = jobs.filter((j) => j.status === 'error').length;

  return (
    <Layout style={{ minHeight: '100vh', background: REDWOOD.surfaceSecondary }}>
      <Content style={{ padding: '24px' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          {/* Breadcrumb */}
          <Breadcrumb style={{ marginBottom: 16 }}>
            <Breadcrumb.Item>
              <Link to="/home">
                <HomeOutlined /> Home
              </Link>
            </Breadcrumb.Item>
            <Breadcrumb.Item>
              <Link to="/sync">Sync</Link>
            </Breadcrumb.Item>
            <Breadcrumb.Item>Background Jobs</Breadcrumb.Item>
          </Breadcrumb>

          {/* Header */}
          <Card
            style={{
              marginBottom: 24,
              borderRadius: 12,
              border: `1px solid ${REDWOOD.border}`,
            }}
          >
            <Row justify="space-between" align="middle">
              <Col>
                <Space>
                  <RocketOutlined style={{ fontSize: 28, color: REDWOOD.primary }} />
                  <div>
                    <Title level={4} style={{ margin: 0 }}>
                      Background Jobs Monitor
                    </Title>
                    <Text type="secondary">
                      Python-based sync jobs running in the background
                    </Text>
                  </div>
                </Space>
              </Col>
              <Col>
                <Space>
                  <Tag
                    color={serverOnline ? 'success' : 'error'}
                    icon={serverOnline ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                  >
                    Server: {serverOnline ? 'Online' : 'Offline'}
                  </Tag>
                  <Button
                    icon={<ReloadOutlined spin={loading} />}
                    onClick={() => {
                      setLoading(true);
                      fetchJobs().finally(() => setLoading(false));
                    }}
                  >
                    Refresh
                  </Button>
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={() => setNewJobModalVisible(true)}
                    disabled={!serverOnline}
                    style={{ background: REDWOOD.primary }}
                  >
                    New Job
                  </Button>
                </Space>
              </Col>
            </Row>
          </Card>

          {/* Stats */}
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={6}>
              <Card style={{ borderRadius: 12, border: `1px solid ${REDWOOD.border}` }}>
                <Statistic
                  title="Total Jobs"
                  value={jobs.length}
                  prefix={<SyncOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card style={{ borderRadius: 12, border: `1px solid ${REDWOOD.border}` }}>
                <Statistic
                  title="Running"
                  value={runningJobs}
                  valueStyle={{ color: REDWOOD.info }}
                  prefix={<LoadingOutlined spin />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card style={{ borderRadius: 12, border: `1px solid ${REDWOOD.border}` }}>
                <Statistic
                  title="Completed"
                  value={completedJobs}
                  valueStyle={{ color: REDWOOD.success }}
                  prefix={<CheckCircleOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card style={{ borderRadius: 12, border: `1px solid ${REDWOOD.border}` }}>
                <Statistic
                  title="Errors"
                  value={errorJobs}
                  valueStyle={{ color: REDWOOD.error }}
                  prefix={<CloseCircleOutlined />}
                />
              </Card>
            </Col>
          </Row>

          {/* Server Offline Warning */}
          {serverOnline === false && (
            <Card
              style={{
                marginBottom: 24,
                borderRadius: 12,
                border: `1px solid ${REDWOOD.error}`,
                background: '#fff2f0',
              }}
            >
              <Space>
                <CloseCircleOutlined style={{ color: REDWOOD.error, fontSize: 24 }} />
                <div>
                  <Title level={5} style={{ margin: 0, color: REDWOOD.error }}>
                    Job Server Offline
                  </Title>
                  <Text>
                    Start the Python job server to manage background sync jobs:
                  </Text>
                  <br />
                  <Text code>cd python && pip install -r requirements.txt && python app.py</Text>
                </div>
              </Space>
            </Card>
          )}

          {/* Jobs Table */}
          <Card
            title="Jobs"
            extra={
              <Button size="small" onClick={handleClearCompleted} disabled={!serverOnline}>
                Clear Completed
              </Button>
            }
            style={{
              borderRadius: 12,
              border: `1px solid ${REDWOOD.border}`,
            }}
            bodyStyle={{ padding: 0 }}
          >
            {jobs.length === 0 ? (
              <Empty
                description={serverOnline ? 'No jobs yet' : 'Server offline'}
                style={{ padding: 48 }}
              />
            ) : (
              <Table
                dataSource={jobs}
                columns={columns}
                rowKey="job_id"
                pagination={false}
                size="middle"
              />
            )}
          </Card>
        </div>
      </Content>

      {/* New Job Modal */}
      <Modal
        title={
          <Space>
            <PlayCircleOutlined style={{ color: REDWOOD.primary }} />
            <span>Create New Sync Job</span>
          </Space>
        }
        open={newJobModalVisible}
        onCancel={() => setNewJobModalVisible(false)}
        footer={null}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateJob}
          initialValues={{
            sync_type: 'gl_journals',
            mode: 'test',
            period: 'May-24',
          }}
        >
          <Form.Item
            name="sync_type"
            label="Sync Type"
            rules={[{ required: true }]}
          >
            <Select>
              <Option value="gl_journals">GL Journals</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="mode"
            label="Mode"
            rules={[{ required: true }]}
          >
            <Select>
              <Option value="single">Single (1 batch)</Option>
              <Option value="test">Test (25 batches)</Option>
              <Option value="full">Full Sync (All)</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="period"
            label="Period"
            rules={[{ required: true }]}
          >
            <Input placeholder="e.g., May-24" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setNewJobModalVisible(false)}>
                Cancel
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={submittingJob}
                style={{ background: REDWOOD.primary }}
              >
                Start Job
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
};

export default JobsMonitor;
