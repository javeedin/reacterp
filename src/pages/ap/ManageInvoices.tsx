import React, { useState, useEffect } from 'react';
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
  Collapse,
  message,
  DatePicker,
  InputNumber,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  HomeOutlined,
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
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  FilterOutlined,
  DownloadOutlined,
  UploadOutlined,
  PaperClipOutlined,
  FileTextOutlined,
  DollarOutlined,
  CheckSquareOutlined,
  StopOutlined,
  SendOutlined,
  BankOutlined,
  SettingOutlined,
  CopyOutlined,
  ScissorOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;
const { Panel } = Collapse;

// Oracle Redwood Color Palette
const REDWOOD = {
  primary: '#C74634',
  primaryLight: '#E85D4A',
  primaryDark: '#A33B2C',
  success: '#1D7B4D',
  warning: '#D4A800',
  info: '#0572CE',
  error: '#D93025',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral300: '#C7C7C7',
  neutral600: '#6B6B6B',
  neutral900: '#1A1A1A',
  surface: '#FFFFFF',
  taskBlue: '#0572CE',
  reportGreen: '#1D7B4D',
};

// Invoice record interface
interface InvoiceRecord {
  key: string;
  invoiceId: number;
  invoiceNumber: string;
  invoiceDate: string;
  creationDate: string;
  supplierOrParty: string;
  supplierSite: string;
  unpaidAmount: number;
  invoiceAmount: number;
  appliedPrepayments: number;
  invoiceType: string;
  attachments: string;
  notes: string;
  validationStatus: string;
  approvalStatus: string;
  holdPaidStatus: string;
  businessUnit: string;
  invoiceCurrency: string;
  supplierNumber: string;
}

// API Base URL
const API_BASE_URL = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/ap';

const ManageInvoices: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [searchCollapsed, setSearchCollapsed] = useState(false);

  // Mock data for demonstration
  useEffect(() => {
    loadMockData();
  }, []);

  const loadMockData = () => {
    const mockData: InvoiceRecord[] = [
      {
        key: '1',
        invoiceId: 300000087800001,
        invoiceNumber: 'H23-1983',
        invoiceDate: '28-Jul-2023',
        creationDate: '10-Sep-2023',
        supplierOrParty: 'HOLZ TIMBER TRADING L.L.C.',
        supplierSite: 'SHARJAH',
        unpaidAmount: 0.00,
        invoiceAmount: 0.08,
        appliedPrepayments: 0.00,
        invoiceType: 'Standard',
        attachments: 'None',
        notes: '',
        validationStatus: 'Validated',
        approvalStatus: 'Not required',
        holdPaidStatus: 'Fully paid',
        businessUnit: 'BUIMERC CORP FZE_JAFZA',
        invoiceCurrency: 'AED',
        supplierNumber: 'H014',
      },
      {
        key: '2',
        invoiceId: 300000087800002,
        invoiceNumber: 'H23-1983 CR Nt Adjust',
        invoiceDate: '31-Mar-2024',
        creationDate: '16-May-2024',
        supplierOrParty: 'HOLZ TIMBER TRADING L.L.C.',
        supplierSite: 'SHARJAH',
        unpaidAmount: 0.00,
        invoiceAmount: -0.08,
        appliedPrepayments: 0.00,
        invoiceType: 'Credit memo',
        attachments: 'None',
        notes: '',
        validationStatus: 'Validated',
        approvalStatus: 'Manually approved',
        holdPaidStatus: 'Fully paid',
        businessUnit: 'BUIMERC CORP FZE_JAFZA',
        invoiceCurrency: 'AED',
        supplierNumber: 'H014',
      },
      {
        key: '3',
        invoiceId: 300000087800003,
        invoiceNumber: 'H23-1983_Adju',
        invoiceDate: '31-Mar-2024',
        creationDate: '16-May-2024',
        supplierOrParty: 'HOLZ TIMBER TRADING L.L.C.',
        supplierSite: 'SHARJAH',
        unpaidAmount: 0.00,
        invoiceAmount: 0.00,
        appliedPrepayments: 0.00,
        invoiceType: 'Credit memo',
        attachments: 'None',
        notes: '',
        validationStatus: 'Canceled',
        approvalStatus: 'Not required',
        holdPaidStatus: 'Not paid',
        businessUnit: 'BUIMERC CORP FZE_JAFZA',
        invoiceCurrency: 'AED',
        supplierNumber: 'H014',
      },
      {
        key: '4',
        invoiceId: 300000087800004,
        invoiceNumber: 'H23-1983_Adjustment',
        invoiceDate: '31-Mar-2024',
        creationDate: '16-May-2024',
        supplierOrParty: 'HOLZ TIMBER TRADING L.L.C.',
        supplierSite: 'SHARJAH',
        unpaidAmount: 0.00,
        invoiceAmount: 0.00,
        appliedPrepayments: 0.00,
        invoiceType: 'Credit memo',
        attachments: 'None',
        notes: '',
        validationStatus: 'Canceled',
        approvalStatus: 'Not required',
        holdPaidStatus: 'Not paid',
        businessUnit: 'BUIMERC CORP FZE_JAFZA',
        invoiceCurrency: 'AED',
        supplierNumber: 'H014',
      },
      {
        key: '5',
        invoiceId: 300000087800005,
        invoiceNumber: 'H23-3176',
        invoiceDate: '28-Nov-2023',
        creationDate: '6-Dec-2023',
        supplierOrParty: 'HOLZ TIMBER TRADING L.L.C.',
        supplierSite: 'SHARJAH',
        unpaidAmount: 0.00,
        invoiceAmount: 20002.50,
        appliedPrepayments: 0.00,
        invoiceType: 'Standard',
        attachments: 'None',
        notes: '',
        validationStatus: 'Validated',
        approvalStatus: 'Manually approved',
        holdPaidStatus: 'Fully paid',
        businessUnit: 'BUIMERC CORP FZE_JAFZA',
        invoiceCurrency: 'AED',
        supplierNumber: 'H014',
      },
    ];
    setInvoices(mockData);
  };

  // Search invoices from API
  const handleSearch = async (values: any) => {
    setLoading(true);
    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (values.supplierNumber) params.append('q', `SupplierNumber=${values.supplierNumber}`);
      if (values.businessUnit) params.append('businessUnit', values.businessUnit);
      if (values.invoiceNumber) params.append('invoiceNumber', values.invoiceNumber);

      // For now, use mock data
      // const response = await fetch(`${API_BASE_URL}/invoices?${params.toString()}`);
      // const data = await response.json();

      message.success('Search completed');
      loadMockData();
    } catch (error) {
      message.error('Failed to search invoices');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Reset search form
  const handleReset = () => {
    form.resetFields();
  };

  // Get validation status tag
  const getValidationStatusTag = (status: string) => {
    const statusConfig: Record<string, { color: string; textColor: string }> = {
      'Validated': { color: REDWOOD.success, textColor: '#fff' },
      'Needs revalidation': { color: REDWOOD.warning, textColor: '#000' },
      'Canceled': { color: REDWOOD.error, textColor: '#fff' },
      'Never validated': { color: REDWOOD.neutral300, textColor: '#000' },
    };
    const config = statusConfig[status] || { color: REDWOOD.neutral300, textColor: '#000' };
    return (
      <Tag style={{ background: config.color, color: config.textColor, border: 'none' }}>
        {status}
      </Tag>
    );
  };

  // Get approval status tag
  const getApprovalStatusTag = (status: string) => {
    const statusConfig: Record<string, { color: string }> = {
      'Manually approved': { color: 'green' },
      'Workflow approved': { color: 'green' },
      'Not required': { color: 'default' },
      'Rejected': { color: 'red' },
      'Pending': { color: 'orange' },
    };
    const config = statusConfig[status] || { color: 'default' };
    return <Tag color={config.color}>{status}</Tag>;
  };

  // Action menu items
  const actionsMenuItems: MenuProps['items'] = [
    { key: 'edit', label: 'Edit', icon: <EditOutlined /> },
    { key: 'duplicate', label: 'Duplicate', icon: <CopyOutlined /> },
    { type: 'divider' },
    { key: 'delete', label: 'Delete', icon: <DeleteOutlined />, danger: true },
    { key: 'cancel', label: 'Cancel Invoice', icon: <StopOutlined />, danger: true },
  ];

  // View menu items
  const viewMenuItems: MenuProps['items'] = [
    { key: 'columns', label: 'Columns', icon: <SettingOutlined /> },
    { key: 'detach', label: 'Detach', icon: <ExportOutlined /> },
    { type: 'divider' },
    { key: 'export', label: 'Export to Excel', icon: <DownloadOutlined /> },
    { key: 'print', label: 'Print', icon: <PrinterOutlined /> },
  ];

  // Approval menu items
  const approvalMenuItems: MenuProps['items'] = [
    { key: 'approve', label: 'Approve', icon: <CheckCircleOutlined /> },
    { key: 'reject', label: 'Reject', icon: <CloseCircleOutlined /> },
    { key: 'requestInfo', label: 'Request Information', icon: <FileTextOutlined /> },
  ];

  // Post menu items
  const postMenuItems: MenuProps['items'] = [
    { key: 'post', label: 'Post to GL', icon: <SendOutlined /> },
    { key: 'unpost', label: 'Unpost', icon: <StopOutlined /> },
  ];

  // Table columns
  const columns: ColumnsType<InvoiceRecord> = [
    {
      title: 'Invoice Number',
      dataIndex: 'invoiceNumber',
      key: 'invoiceNumber',
      width: 150,
      fixed: 'left',
      render: (text: string, record: InvoiceRecord) => (
        <Link to={`/ap/invoice/${record.invoiceId}`} style={{ color: REDWOOD.info }}>
          {text}
        </Link>
      ),
      sorter: (a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber),
    },
    {
      title: 'Invoice Date',
      dataIndex: 'invoiceDate',
      key: 'invoiceDate',
      width: 110,
      sorter: true,
    },
    {
      title: 'Creation Date',
      dataIndex: 'creationDate',
      key: 'creationDate',
      width: 120,
    },
    {
      title: 'Supplier or Party',
      dataIndex: 'supplierOrParty',
      key: 'supplierOrParty',
      width: 220,
      ellipsis: true,
    },
    {
      title: 'Su Sit',
      dataIndex: 'supplierSite',
      key: 'supplierSite',
      width: 80,
      render: (text: string) => (
        <Tooltip title={text}>
          <span style={{ color: REDWOOD.primary, cursor: 'pointer' }}>
            <FileTextOutlined />
          </span>
        </Tooltip>
      ),
    },
    {
      title: 'Unpaid Amount',
      dataIndex: 'unpaidAmount',
      key: 'unpaidAmount',
      width: 120,
      align: 'right',
      render: (value: number, record: InvoiceRecord) => (
        <span style={{ color: value === 0 ? REDWOOD.neutral600 : REDWOOD.neutral900 }}>
          {value.toFixed(2)} {record.invoiceCurrency}
        </span>
      ),
    },
    {
      title: 'Invoice Amount',
      dataIndex: 'invoiceAmount',
      key: 'invoiceAmount',
      width: 130,
      align: 'right',
      render: (value: number, record: InvoiceRecord) => (
        <span style={{ color: value < 0 ? REDWOOD.error : REDWOOD.info, fontWeight: 500 }}>
          {value.toFixed(2)} {record.invoiceCurrency}
        </span>
      ),
      sorter: (a, b) => a.invoiceAmount - b.invoiceAmount,
    },
    {
      title: 'Applied Prepayments',
      dataIndex: 'appliedPrepayments',
      key: 'appliedPrepayments',
      width: 140,
      align: 'right',
      render: (value: number, record: InvoiceRecord) => (
        <span>{value.toFixed(2)} {record.invoiceCurrency}</span>
      ),
    },
    {
      title: 'Invoice Type',
      dataIndex: 'invoiceType',
      key: 'invoiceType',
      width: 110,
    },
    {
      title: 'Attachments',
      dataIndex: 'attachments',
      key: 'attachments',
      width: 100,
      render: (text: string) => (
        text !== 'None' ? (
          <Tooltip title="View attachments">
            <PaperClipOutlined style={{ color: REDWOOD.info, cursor: 'pointer' }} />
          </Tooltip>
        ) : <Text type="secondary">None</Text>
      ),
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      width: 80,
      render: (text: string) => (
        text ? (
          <Tooltip title={text}>
            <FileTextOutlined style={{ color: REDWOOD.info, cursor: 'pointer' }} />
          </Tooltip>
        ) : null
      ),
    },
    {
      title: 'Validation Status',
      dataIndex: 'validationStatus',
      key: 'validationStatus',
      width: 130,
      render: (status: string) => getValidationStatusTag(status),
      filters: [
        { text: 'Validated', value: 'Validated' },
        { text: 'Needs revalidation', value: 'Needs revalidation' },
        { text: 'Canceled', value: 'Canceled' },
        { text: 'Never validated', value: 'Never validated' },
      ],
      onFilter: (value, record) => record.validationStatus === value,
    },
    {
      title: 'Approval Status',
      dataIndex: 'approvalStatus',
      key: 'approvalStatus',
      width: 140,
      render: (status: string) => getApprovalStatusTag(status),
    },
    {
      title: 'Hold Paid Status',
      dataIndex: 'holdPaidStatus',
      key: 'holdPaidStatus',
      width: 110,
      render: (status: string) => {
        const isPaid = status === 'Fully paid';
        return (
          <span style={{ color: isPaid ? REDWOOD.success : REDWOOD.neutral600 }}>
            {isPaid ? '0' : ''} {status}
          </span>
        );
      },
    },
    {
      title: 'Business Unit',
      dataIndex: 'businessUnit',
      key: 'businessUnit',
      width: 180,
      ellipsis: true,
    },
  ];

  // Row selection config
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  };

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb Header */}
        <div style={{
          padding: '12px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Breadcrumb
            items={[
              { title: <Link to="/home"><HomeOutlined /> Home</Link> },
              { title: <Link to="/ap">Payables</Link> },
              { title: 'Manage Invoices' },
            ]}
          />
          <Button type="primary" style={{ background: REDWOOD.primary }}>
            Done
          </Button>
        </div>

        <div style={{ padding: 16 }}>
          {/* Page Title */}
          <div style={{ marginBottom: 16 }}>
            <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <BankOutlined /> Manage Invoices
            </Title>
          </div>

          {/* Search Section */}
          <Card
            style={{
              marginBottom: 16,
              borderRadius: 8,
              border: `1px solid ${REDWOOD.neutral200}`,
            }}
            bodyStyle={{ padding: searchCollapsed ? 0 : 16 }}
          >
            <Collapse
              ghost
              defaultActiveKey={['search']}
              onChange={(keys) => setSearchCollapsed(keys.length === 0)}
              items={[
                {
                  key: 'search',
                  label: (
                    <Space>
                      <FilterOutlined />
                      <Text strong>Search: Invoice</Text>
                    </Space>
                  ),
                  extra: (
                    <Space onClick={(e) => e.stopPropagation()}>
                      <Button size="small">Advanced</Button>
                      <Select
                        size="small"
                        defaultValue="all"
                        style={{ width: 150 }}
                        options={[
                          { value: 'all', label: 'All Invoices' },
                          { value: 'recent', label: 'Recent Invoices' },
                          { value: 'pending', label: 'Pending Invoices' },
                        ]}
                      />
                    </Space>
                  ),
                  children: (
                    <Form
                      form={form}
                      layout="vertical"
                      onFinish={handleSearch}
                      size="small"
                    >
                      <Row gutter={24}>
                        <Col span={8}>
                          <Form.Item label="Business Unit" name="businessUnit">
                            <Select
                              placeholder="Select Business Unit"
                              allowClear
                              showSearch
                            >
                              <Option value="BUIMERC CORP FZE_JAFZA">BUIMERC CORP FZE_JAFZA</Option>
                              <Option value="BUIMERC CORP_DIFC_INVST">BUIMERC CORP_DIFC_INVST</Option>
                            </Select>
                          </Form.Item>
                          <Form.Item
                            label={<><span style={{ color: REDWOOD.primary }}>**</span> Invoice Number</>}
                            name="invoiceNumber"
                          >
                            <Input placeholder="Enter invoice number" />
                          </Form.Item>
                          <Form.Item label="Invoice Amount" name="invoiceAmount">
                            <InputNumber style={{ width: '100%' }} placeholder="0.00" />
                          </Form.Item>
                          <Form.Item
                            label={<><span style={{ color: REDWOOD.primary }}>**</span> Invoice Date</>}
                            name="invoiceDate"
                          >
                            <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" />
                          </Form.Item>
                          <Form.Item
                            label={<><span style={{ color: REDWOOD.primary }}>**</span> Supplier or Party</>}
                            name="supplierOrParty"
                          >
                            <Input
                              placeholder="Search supplier"
                              suffix={<SearchOutlined style={{ color: REDWOOD.neutral300 }} />}
                            />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item
                            label={<><span style={{ color: REDWOOD.primary }}>**</span> Supplier Number</>}
                            name="supplierNumber"
                          >
                            <Input placeholder="e.g. H014" />
                          </Form.Item>
                          <Form.Item label="Supplier Site" name="supplierSite">
                            <Select placeholder="Select site" allowClear>
                              <Option value="SHARJAH">SHARJAH</Option>
                              <Option value="DUBAI">DUBAI</Option>
                            </Select>
                          </Form.Item>
                          <Form.Item label="Taxpayer ID" name="taxpayerId">
                            <Input placeholder="Enter taxpayer ID" />
                          </Form.Item>
                          <Form.Item
                            label={<><span style={{ color: REDWOOD.primary }}>**</span> Invoice Group</>}
                            name="invoiceGroup"
                          >
                            <Input placeholder="Enter invoice group" />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            ** At least one is required
                          </Text>
                        </Col>
                      </Row>
                      <Row justify="end" style={{ marginTop: 8 }}>
                        <Space>
                          <Button icon={<SearchOutlined />} type="primary" htmlType="submit" loading={loading}>
                            Search
                          </Button>
                          <Button icon={<ReloadOutlined />} onClick={handleReset}>
                            Reset
                          </Button>
                          <Button icon={<SaveOutlined />}>
                            Save...
                          </Button>
                        </Space>
                      </Row>
                    </Form>
                  ),
                },
              ]}
            />
          </Card>

          {/* Results Section */}
          <Card
            style={{
              borderRadius: 8,
              border: `1px solid ${REDWOOD.neutral200}`,
            }}
            bodyStyle={{ padding: 0 }}
          >
            {/* Action Toolbar */}
            <div style={{
              padding: '8px 16px',
              borderBottom: `1px solid ${REDWOOD.neutral200}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: REDWOOD.neutral100,
            }}>
              <Space size="small">
                <Dropdown menu={{ items: actionsMenuItems }} trigger={['click']}>
                  <Button size="small">
                    Actions <DownOutlined />
                  </Button>
                </Dropdown>
                <Dropdown menu={{ items: viewMenuItems }} trigger={['click']}>
                  <Button size="small">
                    View <DownOutlined />
                  </Button>
                </Dropdown>
                <Tooltip title="Edit">
                  <Button size="small" icon={<EditOutlined />} />
                </Tooltip>
                <Tooltip title="Add Attachment">
                  <Button size="small" icon={<PaperClipOutlined />} />
                </Tooltip>
                <Tooltip title="Export">
                  <Button size="small" icon={<ExportOutlined />} />
                </Tooltip>
                <Button size="small" icon={<ScissorOutlined />}>
                  Detach
                </Button>
                <Button
                  size="small"
                  type="primary"
                  style={{ background: REDWOOD.success }}
                  icon={<CheckCircleOutlined />}
                >
                  Validate
                </Button>
                <Button
                  size="small"
                  type="primary"
                  style={{ background: REDWOOD.info }}
                  icon={<DollarOutlined />}
                >
                  Pay in Full
                </Button>
                <Dropdown menu={{ items: approvalMenuItems }} trigger={['click']}>
                  <Button size="small" type="primary" style={{ background: REDWOOD.warning }}>
                    Approval <DownOutlined />
                  </Button>
                </Dropdown>
                <Dropdown menu={{ items: postMenuItems }} trigger={['click']}>
                  <Button size="small">
                    Post <DownOutlined />
                  </Button>
                </Dropdown>
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {invoices.length} items | {selectedRowKeys.length} selected
              </Text>
            </div>

            {/* Data Table */}
            <Table
              columns={columns}
              dataSource={invoices}
              rowSelection={rowSelection}
              loading={loading}
              pagination={{
                pageSize: 25,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
              }}
              scroll={{ x: 1800 }}
              size="small"
              rowClassName={(record, index) => index % 2 === 0 ? '' : 'table-row-light'}
              onRow={(record) => ({
                onDoubleClick: () => navigate(`/ap/invoice/${record.invoiceId}`),
                style: { cursor: 'pointer' },
              })}
            />
          </Card>
        </div>

        {/* Custom styles */}
        <style>{`
          .table-row-light {
            background-color: ${REDWOOD.neutral100};
          }
          .ant-table-thead > tr > th {
            background: ${REDWOOD.neutral100} !important;
            font-weight: 600;
            font-size: 12px;
          }
          .ant-table-tbody > tr > td {
            font-size: 12px;
          }
          .ant-collapse-header {
            padding: 8px 16px !important;
          }
          .ant-form-item {
            margin-bottom: 12px;
          }
          .ant-form-item-label {
            padding-bottom: 2px !important;
          }
          .ant-form-item-label > label {
            font-size: 12px;
            color: ${REDWOOD.neutral600};
          }
        `}</style>
      </Content>
    </Layout>
  );
};

export default ManageInvoices;
