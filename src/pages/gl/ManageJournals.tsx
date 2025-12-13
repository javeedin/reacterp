import React, { useState } from 'react';
import {
  Layout,
  Card,
  Form,
  Select,
  Input,
  Button,
  Space,
  Typography,
  Table,
  Tag,
  Row,
  Col,
  Breadcrumb,
  Tooltip,
  Dropdown,
  DatePicker,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  HomeOutlined,
  AccountBookOutlined,
  SearchOutlined,
  ReloadOutlined,
  SaveOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  DownOutlined,
  ExportOutlined,
  PrinterOutlined,
  EyeOutlined,
  RollbackOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import Autopilot from '../../components/Autopilot';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

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

// Journal data interface
interface JournalRecord {
  key: string;
  journal: string;
  journalBatch: string;
  accountingPeriod: string;
  source: string;
  category: string;
  journalEnteredDebit: number;
  journalEnteredCredit: number;
  batchStatus: 'Posted' | 'Unposted' | 'Error' | 'Pending';
  reference: string;
  approvalStatus: 'Approved' | 'Pending' | 'Rejected' | 'Not required';
  currency: string;
}

// Mock data
const mockJournals: JournalRecord[] = [
  {
    key: '1',
    journal: 'PMS Stock Journals 01061976',
    journalBatch: 'FD-BOB-MUMBAI-ADJ-100805-279203000046...',
    accountingPeriod: 'Jan-25',
    source: 'PMS Journals',
    category: 'PMS St...',
    journalEnteredDebit: 3669.00,
    journalEnteredCredit: 3669.00,
    batchStatus: 'Posted',
    reference: 'Journal Import Cr...',
    approvalStatus: 'Not required',
    currency: 'INR',
  },
  {
    key: '2',
    journal: 'Manual Journal 01062001',
    journalBatch: 'GL-MANUAL-JAN25-001',
    accountingPeriod: 'Jan-25',
    source: 'Manual',
    category: 'Adjustment',
    journalEnteredDebit: 15000.00,
    journalEnteredCredit: 15000.00,
    batchStatus: 'Unposted',
    reference: 'Month End Adj',
    approvalStatus: 'Pending',
    currency: 'INR',
  },
  {
    key: '3',
    journal: 'Payroll Journal 01062002',
    journalBatch: 'HR-PAYROLL-JAN25-001',
    accountingPeriod: 'Jan-25',
    source: 'Payroll',
    category: 'Payroll',
    journalEnteredDebit: 250000.00,
    journalEnteredCredit: 250000.00,
    batchStatus: 'Posted',
    reference: 'Jan 2025 Payroll',
    approvalStatus: 'Approved',
    currency: 'INR',
  },
];

// Accounting periods
const accountingPeriods = [
  'Jan-25', 'Feb-25', 'Mar-25', 'Apr-25', 'May-25', 'Jun-25',
  'Jul-25', 'Aug-25', 'Sep-25', 'Oct-25', 'Nov-25', 'Dec-25',
  'Jan-24', 'Feb-24', 'Mar-24', 'Apr-24', 'May-24', 'Jun-24',
];

// Sources
const sources = [
  'Manual', 'PMS Journals', 'Payroll', 'Spreadsheet', 'AutoReverse',
  'Revaluation', 'Consolidation', 'Intercompany', 'Allocations',
];

// Categories
const categories = [
  'Adjustment', 'PMS St...', 'Payroll', 'Accrual', 'Provision',
  'Reversal', 'Reclassification', 'Closing', 'Opening',
];

// Ledgers
const ledgers = [
  'SB LEDGER', 'US LEDGER', 'UK LEDGER', 'APAC LEDGER', 'EMEA LEDGER',
];

// Batch statuses
const batchStatuses = ['Posted', 'Unposted', 'Error', 'Pending', 'All'];

// Operators
const operators = ['Starts with', 'Equals', 'Contains', 'Ends with'];

const ManageJournals: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [journals, setJournals] = useState<JournalRecord[]>(mockJournals);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // Search handler
  const handleSearch = () => {
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      // In real app, filter based on form values
    }, 1000);
  };

  // Reset handler
  const handleReset = () => {
    form.resetFields();
    setJournals(mockJournals);
  };

  // Get status tag color
  const getBatchStatusTag = (status: string) => {
    const config: Record<string, { color: string; icon: React.ReactNode }> = {
      Posted: { color: REDWOOD.success, icon: <CheckCircleOutlined /> },
      Unposted: { color: REDWOOD.warning, icon: <ClockCircleOutlined /> },
      Error: { color: REDWOOD.primary, icon: <CloseCircleOutlined /> },
      Pending: { color: REDWOOD.info, icon: <ClockCircleOutlined /> },
    };
    const cfg = config[status] || { color: REDWOOD.neutral600, icon: null };
    return (
      <Tag color={cfg.color} icon={cfg.icon} style={{ borderRadius: 4 }}>
        {status}
      </Tag>
    );
  };

  // Get approval status tag
  const getApprovalStatusTag = (status: string) => {
    const config: Record<string, string> = {
      Approved: REDWOOD.success,
      Pending: REDWOOD.warning,
      Rejected: REDWOOD.primary,
      'Not required': REDWOOD.neutral600,
    };
    return (
      <Tag color={config[status] || REDWOOD.neutral600} style={{ borderRadius: 4 }}>
        {status}
      </Tag>
    );
  };

  // Table columns
  const columns: ColumnsType<JournalRecord> = [
    {
      title: 'Journal',
      dataIndex: 'journal',
      key: 'journal',
      width: 200,
      render: (text) => (
        <a style={{ color: REDWOOD.info, fontWeight: 500 }}>{text}</a>
      ),
      sorter: (a, b) => a.journal.localeCompare(b.journal),
    },
    {
      title: 'Journal Batch',
      dataIndex: 'journalBatch',
      key: 'journalBatch',
      width: 280,
      ellipsis: true,
    },
    {
      title: 'Accounting Period',
      dataIndex: 'accountingPeriod',
      key: 'accountingPeriod',
      width: 130,
      sorter: (a, b) => a.accountingPeriod.localeCompare(b.accountingPeriod),
    },
    {
      title: 'Source',
      dataIndex: 'source',
      key: 'source',
      width: 120,
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 120,
    },
    {
      title: 'Journal Entered Debit',
      dataIndex: 'journalEnteredDebit',
      key: 'journalEnteredDebit',
      width: 160,
      align: 'right',
      render: (value, record) => (
        <span>
          {value.toLocaleString('en-IN', { minimumFractionDigits: 2 })} {record.currency}
        </span>
      ),
      sorter: (a, b) => a.journalEnteredDebit - b.journalEnteredDebit,
    },
    {
      title: 'Journal Entered Credit',
      dataIndex: 'journalEnteredCredit',
      key: 'journalEnteredCredit',
      width: 160,
      align: 'right',
      render: (value, record) => (
        <span>
          {value.toLocaleString('en-IN', { minimumFractionDigits: 2 })} {record.currency}
        </span>
      ),
      sorter: (a, b) => a.journalEnteredCredit - b.journalEnteredCredit,
    },
    {
      title: 'Batch Status',
      dataIndex: 'batchStatus',
      key: 'batchStatus',
      width: 120,
      render: (status) => getBatchStatusTag(status),
      filters: batchStatuses.filter(s => s !== 'All').map(s => ({ text: s, value: s })),
      onFilter: (value, record) => record.batchStatus === value,
    },
    {
      title: 'Reference',
      dataIndex: 'reference',
      key: 'reference',
      width: 150,
      ellipsis: true,
    },
    {
      title: 'Approval Status',
      dataIndex: 'approvalStatus',
      key: 'approvalStatus',
      width: 130,
      render: (status) => getApprovalStatusTag(status),
    },
  ];

  // Actions dropdown menu
  const actionsMenu: MenuProps['items'] = [
    { key: 'view', label: 'View', icon: <EyeOutlined /> },
    { key: 'edit', label: 'Edit', icon: <EditOutlined /> },
    { type: 'divider' },
    { key: 'post', label: 'Post Batch', icon: <CheckCircleOutlined /> },
    { key: 'reverse', label: 'Reverse Batch', icon: <RollbackOutlined /> },
    { type: 'divider' },
    { key: 'export', label: 'Export', icon: <ExportOutlined /> },
    { key: 'print', label: 'Print', icon: <PrinterOutlined /> },
  ];

  // Row selection
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  };

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb Header */}
        <div style={{
          padding: '16px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`
        }}>
          <Breadcrumb
            items={[
              { title: <Link to="/home"><HomeOutlined /> Home</Link> },
              { title: <Link to="/gl">General Ledger</Link> },
              { title: 'Manage Journals' },
            ]}
          />
        </div>

        {/* Main Content */}
        <div style={{ padding: 24 }}>
          {/* Page Header */}
          <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space align="center">
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 10,
                background: `linear-gradient(135deg, ${REDWOOD.info} 0%, ${REDWOOD.info}CC 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 4px 12px ${REDWOOD.info}40`,
              }}>
                <AccountBookOutlined style={{ fontSize: 24, color: '#fff' }} />
              </div>
              <div>
                <Title level={3} style={{ margin: 0, color: REDWOOD.neutral900 }}>
                  Manage Journals
                </Title>
                <Text type="secondary">Search and manage journal entries</Text>
              </div>
            </Space>
            <Button
              type="primary"
              style={{
                background: REDWOOD.primary,
                borderColor: REDWOOD.primary,
                borderRadius: 6,
              }}
            >
              Done
            </Button>
          </div>

          {/* Search Card */}
          <Card
            style={{
              borderRadius: 12,
              border: `1px solid ${REDWOOD.neutral200}`,
              marginBottom: 24,
            }}
            bodyStyle={{ padding: 24 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text strong style={{ fontSize: 16 }}>Search</Text>
              <Space>
                <Button size="small">Basic</Button>
                <Button size="small">Manage Watchlist</Button>
                <Select defaultValue="all" size="small" style={{ width: 120 }}>
                  <Option value="all">All Journals</Option>
                  <Option value="my">My Journals</Option>
                  <Option value="pending">Pending</Option>
                </Select>
              </Space>
            </div>

            <Form
              form={form}
              layout="horizontal"
              labelCol={{ span: 8 }}
              wrapperCol={{ span: 16 }}
              initialValues={{
                journalOperator: 'Starts with',
                batchOperator: 'Starts with',
                periodOperator: 'Equals',
                sourceOperator: 'Equals',
                categoryOperator: 'Equals',
                ledgerOperator: 'Equals',
                statusOperator: 'Equals',
              }}
            >
              <Row gutter={24}>
                <Col span={12}>
                  {/* Journal */}
                  <Form.Item label={<span><span style={{ color: REDWOOD.primary }}>**</span> Journal</span>}>
                    <Space.Compact style={{ width: '100%' }}>
                      <Form.Item name="journalOperator" noStyle>
                        <Select style={{ width: 120 }}>
                          {operators.map(op => <Option key={op} value={op}>{op}</Option>)}
                        </Select>
                      </Form.Item>
                      <Form.Item name="journal" noStyle>
                        <Input style={{ flex: 1 }} />
                      </Form.Item>
                    </Space.Compact>
                  </Form.Item>

                  {/* Journal Batch */}
                  <Form.Item label={<span><span style={{ color: REDWOOD.primary }}>**</span> Journal Batch</span>}>
                    <Space.Compact style={{ width: '100%' }}>
                      <Form.Item name="batchOperator" noStyle>
                        <Select style={{ width: 120 }}>
                          {operators.map(op => <Option key={op} value={op}>{op}</Option>)}
                        </Select>
                      </Form.Item>
                      <Form.Item name="journalBatch" noStyle>
                        <Input style={{ flex: 1 }} />
                      </Form.Item>
                    </Space.Compact>
                  </Form.Item>

                  {/* Accounting Period */}
                  <Form.Item label={<span><span style={{ color: REDWOOD.primary }}>**</span> Accounting Period</span>}>
                    <Space.Compact style={{ width: '100%' }}>
                      <Form.Item name="periodOperator" noStyle>
                        <Select style={{ width: 120 }}>
                          <Option value="Equals">Equals</Option>
                        </Select>
                      </Form.Item>
                      <Form.Item name="accountingPeriod" noStyle>
                        <Select style={{ flex: 1 }} placeholder="Select period">
                          {accountingPeriods.map(p => <Option key={p} value={p}>{p}</Option>)}
                        </Select>
                      </Form.Item>
                    </Space.Compact>
                  </Form.Item>

                  {/* Source */}
                  <Form.Item label="Source">
                    <Space.Compact style={{ width: '100%' }}>
                      <Form.Item name="sourceOperator" noStyle>
                        <Select style={{ width: 120 }}>
                          <Option value="Equals">Equals</Option>
                        </Select>
                      </Form.Item>
                      <Form.Item name="source" noStyle>
                        <Select style={{ flex: 1 }} placeholder="Select source" allowClear>
                          {sources.map(s => <Option key={s} value={s}>{s}</Option>)}
                        </Select>
                      </Form.Item>
                    </Space.Compact>
                  </Form.Item>
                </Col>

                <Col span={12}>
                  {/* Category */}
                  <Form.Item label="Category">
                    <Space.Compact style={{ width: '100%' }}>
                      <Form.Item name="categoryOperator" noStyle>
                        <Select style={{ width: 120 }}>
                          <Option value="Equals">Equals</Option>
                        </Select>
                      </Form.Item>
                      <Form.Item name="category" noStyle>
                        <Select style={{ flex: 1 }} placeholder="Select category" allowClear>
                          {categories.map(c => <Option key={c} value={c}>{c}</Option>)}
                        </Select>
                      </Form.Item>
                    </Space.Compact>
                  </Form.Item>

                  {/* Ledger */}
                  <Form.Item label="Ledger">
                    <Space.Compact style={{ width: '100%' }}>
                      <Form.Item name="ledgerOperator" noStyle>
                        <Select style={{ width: 120 }}>
                          <Option value="Equals">Equals</Option>
                        </Select>
                      </Form.Item>
                      <Form.Item name="ledger" noStyle>
                        <Select style={{ flex: 1 }} placeholder="Select ledger" allowClear>
                          {ledgers.map(l => <Option key={l} value={l}>{l}</Option>)}
                        </Select>
                      </Form.Item>
                    </Space.Compact>
                  </Form.Item>

                  {/* Batch Status */}
                  <Form.Item label={<span><span style={{ color: REDWOOD.primary }}>**</span> Batch Status</span>}>
                    <Space.Compact style={{ width: '100%' }}>
                      <Form.Item name="statusOperator" noStyle>
                        <Select style={{ width: 120 }}>
                          <Option value="Equals">Equals</Option>
                        </Select>
                      </Form.Item>
                      <Form.Item name="batchStatus" noStyle>
                        <Select style={{ flex: 1 }} placeholder="Select status" allowClear>
                          {batchStatuses.map(s => <Option key={s} value={s}>{s}</Option>)}
                        </Select>
                      </Form.Item>
                    </Space.Compact>
                  </Form.Item>

                  {/* Note about required fields */}
                  <div style={{ textAlign: 'right', marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      <span style={{ color: REDWOOD.primary }}>**</span> At least one is required
                    </Text>
                  </div>
                </Col>
              </Row>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, gap: 8 }}>
                <Button
                  type="primary"
                  icon={<SearchOutlined />}
                  onClick={handleSearch}
                  loading={loading}
                  style={{ background: REDWOOD.neutral900 }}
                >
                  Search
                </Button>
                <Button icon={<ReloadOutlined />} onClick={handleReset}>
                  Reset
                </Button>
                <Button icon={<SaveOutlined />}>
                  Save...
                </Button>
                <Dropdown menu={{ items: [
                  { key: 'period', label: 'Period Range' },
                  { key: 'amount', label: 'Amount Range' },
                  { key: 'date', label: 'Creation Date' },
                ] }}>
                  <Button>
                    Add Fields <DownOutlined />
                  </Button>
                </Dropdown>
                <Button>Reorder</Button>
              </div>
            </Form>
          </Card>

          {/* Results Table */}
          <Card
            style={{
              borderRadius: 12,
              border: `1px solid ${REDWOOD.neutral200}`,
            }}
            bodyStyle={{ padding: 0 }}
          >
            {/* Toolbar */}
            <div style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${REDWOOD.neutral200}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: REDWOOD.neutral100,
            }}>
              <Space>
                <Dropdown menu={{ items: actionsMenu }}>
                  <Button>
                    Actions <DownOutlined />
                  </Button>
                </Dropdown>
                <Dropdown menu={{ items: [
                  { key: 'columns', label: 'Columns' },
                  { key: 'detach', label: 'Detach' },
                  { key: 'sort', label: 'Sort' },
                ] }}>
                  <Button>
                    View <DownOutlined />
                  </Button>
                </Dropdown>
                <Dropdown menu={{ items: [
                  { key: 'wrap', label: 'Wrap' },
                  { key: 'resize', label: 'Resize Columns' },
                ] }}>
                  <Button>
                    Format <DownOutlined />
                  </Button>
                </Dropdown>
                <Tooltip title="Create Journal">
                  <Button icon={<PlusOutlined />} />
                </Tooltip>
                <Tooltip title="Edit">
                  <Button icon={<EditOutlined />} disabled={selectedRowKeys.length !== 1} />
                </Tooltip>
                <Tooltip title="Delete">
                  <Button icon={<DeleteOutlined />} disabled={selectedRowKeys.length === 0} danger />
                </Tooltip>
              </Space>
              <Space>
                <Button
                  type="primary"
                  disabled={selectedRowKeys.length === 0}
                  style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
                >
                  Post Batch
                </Button>
                <Button disabled={selectedRowKeys.length === 0}>
                  Reverse Batch
                </Button>
                <Button disabled={selectedRowKeys.length === 0}>
                  Reverse Journal
                </Button>
              </Space>
            </div>

            {/* Table */}
            <Table
              rowSelection={rowSelection}
              columns={columns}
              dataSource={journals}
              loading={loading}
              pagination={{
                total: journals.length,
                pageSize: 10,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total) => `Total ${total} journals`,
              }}
              scroll={{ x: 1500 }}
              size="middle"
              style={{ borderRadius: '0 0 12px 12px' }}
            />
          </Card>
        </div>
      </Content>

      {/* Autopilot */}
      <Autopilot />
    </Layout>
  );
};

export default ManageJournals;
