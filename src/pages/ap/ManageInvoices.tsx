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
  Collapse,
  message,
  DatePicker,
  InputNumber,
  Tabs,
  Modal,
  Switch,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  HomeOutlined,
  SearchOutlined,
  ReloadOutlined,
  SaveOutlined,
  EditOutlined,
  DeleteOutlined,
  DownOutlined,
  ExportOutlined,
  PrinterOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FilterOutlined,
  DownloadOutlined,
  PaperClipOutlined,
  FileTextOutlined,
  DollarOutlined,
  StopOutlined,
  SendOutlined,
  BankOutlined,
  SettingOutlined,
  CopyOutlined,
  ScissorOutlined,
  ApiOutlined,
  CheckOutlined,
  CloudOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import InvoiceDetail from './InvoiceDetail';
import { APEX_DB_CONFIG } from '../../config/api.config';

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

// Tab item interface
interface InvoiceTab {
  key: string;
  label: string;
  invoice: InvoiceRecord;
}

// APEX endpoint for invoices
const APEX_INVOICE_URL = `${APEX_DB_CONFIG.baseUrl}/ap/createinvoice`;

// Helper function to format date
const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

// Map API response to InvoiceRecord (API returns lowercase snake_case field names)
const mapApiToInvoiceRecord = (item: any, index: number): InvoiceRecord => ({
  key: item.invoice_id?.toString() || index.toString(),
  invoiceId: item.invoice_id,
  invoiceNumber: item.invoice_number || '',
  invoiceDate: formatDate(item.invoice_date),
  creationDate: formatDate(item.creation_date || item.fusion_creation_date),
  supplierOrParty: item.supplier || item.party || '',
  supplierSite: item.supplier_site || '',
  unpaidAmount: (item.invoice_amount || 0) - (item.amount_paid || 0),
  invoiceAmount: item.invoice_amount || 0,
  appliedPrepayments: 0, // Not in API response
  invoiceType: item.invoice_type || 'Standard',
  attachments: 'None',
  notes: item.description || '',
  validationStatus: item.validation_status || 'Never validated',
  approvalStatus: item.approval_status || 'Not required',
  holdPaidStatus: item.paid_status || 'Not paid',
  businessUnit: item.business_unit || '',
  invoiceCurrency: item.invoice_currency || 'AED',
  supplierNumber: item.supplier_number || '',
});

const ManageInvoices: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [searchCollapsed, setSearchCollapsed] = useState(false);

  // Tab management state
  const [activeTab, setActiveTab] = useState('search');
  const [openTabs, setOpenTabs] = useState<InvoiceTab[]>([]);

  // API viewer modal state
  const [apiModalVisible, setApiModalVisible] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [lastCalledUrl, setLastCalledUrl] = useState<string | null>(null);
  const [lastApiResponse, setLastApiResponse] = useState<string | null>(null);

  // API Configuration for this page
  const PAGE_APIS = {
    apex: [
      {
        name: 'Search Invoices',
        method: 'GET',
        proxyUrl: APEX_INVOICE_URL,
        actualUrl: APEX_INVOICE_URL,
        params: 'supplier_number={supplierNumber}',
        description: 'Fetches invoices from APEX database with optional filters',
      },
      {
        name: 'Create Invoice',
        method: 'POST',
        proxyUrl: APEX_INVOICE_URL,
        actualUrl: APEX_INVOICE_URL,
        params: '',
        description: 'Creates a new invoice in APEX database',
      },
    ],
  };

  // Copy URL to clipboard
  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    message.success('URL copied to clipboard');
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  // Open invoice in new tab
  const openInvoiceTab = (record: InvoiceRecord) => {
    const tabKey = `invoice-${record.invoiceId}`;

    // Check if tab already exists
    const existingTab = openTabs.find((tab) => tab.key === tabKey);
    if (existingTab) {
      setActiveTab(tabKey);
      return;
    }

    // Add new tab
    const newTab: InvoiceTab = {
      key: tabKey,
      label: record.invoiceNumber,
      invoice: record,
    };
    setOpenTabs([...openTabs, newTab]);
    setActiveTab(tabKey);
  };

  // Close invoice tab
  const closeInvoiceTab = (tabKey: string) => {
    const newTabs = openTabs.filter((tab) => tab.key !== tabKey);
    setOpenTabs(newTabs);

    // If closing active tab, switch to search
    if (activeTab === tabKey) {
      setActiveTab('search');
    }
  };

  // Handle tab change
  const onTabChange = (key: string) => {
    setActiveTab(key);
  };

  // Handle tab edit (close)
  const onTabEdit = (targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => {
    if (action === 'remove' && typeof targetKey === 'string') {
      closeInvoiceTab(targetKey);
    }
  };

  // Search invoices from API
  const handleSearch = async (values: any) => {
    setLoading(true);
    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (values.supplierNumber) params.append('supplier_number', values.supplierNumber);
      if (values.businessUnit) params.append('business_unit', values.businessUnit);
      if (values.invoiceNumber) params.append('invoice_number', values.invoiceNumber);

      // Build URL - call APEX endpoint directly
      const queryString = params.toString();
      const apiUrl = queryString ? `${APEX_INVOICE_URL}?${queryString}` : APEX_INVOICE_URL;

      console.log('Fetching invoices from:', apiUrl);
      setLastCalledUrl(apiUrl);

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        setLastApiResponse(`Error: HTTP ${response.status} ${response.statusText}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('API Response:', data);

      // Handle response - could be { items: [...] } or direct array
      const items = data.items || data || [];

      if (Array.isArray(items) && items.length > 0) {
        const mappedInvoices = items.map(mapApiToInvoiceRecord);
        setInvoices(mappedInvoices);
        setLastApiResponse(`Success: ${mappedInvoices.length} invoices returned`);
        message.success(`Found ${mappedInvoices.length} invoices`);
      } else {
        setInvoices([]);
        setLastApiResponse(`Success: 0 invoices returned (empty result). Response keys: ${JSON.stringify(Object.keys(data))}`);
        message.info('No invoices found');
      }
    } catch (error) {
      console.error('Search error:', error);
      if (!lastApiResponse?.startsWith('Error:')) {
        setLastApiResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      message.error(`Failed to search invoices: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        <a
          onClick={() => openInvoiceTab(record)}
          style={{ color: REDWOOD.info, cursor: 'pointer' }}
        >
          {text}
        </a>
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

  // Build tab items
  const tabItems = [
    {
      key: 'search',
      label: 'Search Results',
      closable: false,
      children: (
        <div style={{ padding: 16 }}>
          {/* Search Section */}
          <Card
            style={{
              marginBottom: 16,
              borderRadius: 8,
              border: `1px solid ${REDWOOD.neutral200}`,
            }}
            styles={{ body: { padding: searchCollapsed ? 0 : 16 } }}
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
            styles={{ body: { padding: 0 } }}
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
              rowClassName={(_record, index) => index % 2 === 0 ? '' : 'table-row-light'}
              onRow={(record) => ({
                onDoubleClick: () => openInvoiceTab(record),
                style: { cursor: 'pointer' },
              })}
            />
          </Card>
        </div>
      ),
    },
    // Add open invoice tabs
    ...openTabs.map((tab) => ({
      key: tab.key,
      label: tab.label,
      closable: true,
      children: (
        <InvoiceDetail
          invoice={tab.invoice}
          onClose={() => closeInvoiceTab(tab.key)}
        />
      ),
    })),
  ];

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
          <Space>
            <Tooltip title="View Page APIs">
              <Button
                icon={<ApiOutlined />}
                onClick={() => setApiModalVisible(true)}
                style={{ color: REDWOOD.info }}
              />
            </Tooltip>
            <Button type="primary" style={{ background: REDWOOD.primary }}>
              Done
            </Button>
          </Space>
        </div>

        {/* Page Title and Tabs */}
        <div style={{ background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <div style={{ padding: '8px 16px 0 16px' }}>
            <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <BankOutlined /> Manage Invoices (Search)
            </Title>
          </div>

          {/* Tab Navigation */}
          <Tabs
            type="editable-card"
            activeKey={activeTab}
            onChange={onTabChange}
            onEdit={onTabEdit}
            hideAdd
            items={tabItems}
            style={{ marginBottom: 0 }}
            tabBarStyle={{
              margin: 0,
              padding: '0 16px',
              background: REDWOOD.surface,
            }}
          />
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
          .ant-tabs-tab {
            border-radius: 4px 4px 0 0 !important;
          }
          .ant-tabs-tab-active {
            background: ${REDWOOD.surface} !important;
            border-bottom: 2px solid ${REDWOOD.primary} !important;
          }
          .ant-tabs-nav {
            margin-bottom: 0 !important;
          }
          .ant-tabs-content-holder {
            background: ${REDWOOD.neutral100};
          }
        `}</style>

        {/* API Viewer Modal */}
        <Modal
          title={
            <Space>
              <ApiOutlined style={{ color: REDWOOD.info }} />
              <span>Page APIs - Manage Invoices</span>
            </Space>
          }
          open={apiModalVisible}
          onCancel={() => setApiModalVisible(false)}
          footer={[
            <Button key="close" onClick={() => setApiModalVisible(false)}>
              Close
            </Button>,
          ]}
          width={900}
        >
          <div style={{ marginBottom: 16 }}>
            <Tag color="green">Data Source: APEX</Tag>
            <Text type="secondary" style={{ marginLeft: 8 }}>
              This page uses APEX database for invoice operations
            </Text>
          </div>

          {/* Last Called URL */}
          {lastCalledUrl && (
            <Card
              size="small"
              style={{ marginBottom: 16, border: `1px solid ${lastApiResponse?.startsWith('Error') ? '#ff4d4f' : '#52c41a'}` }}
              title={
                <Space>
                  <CloudOutlined style={{ color: lastApiResponse?.startsWith('Error') ? '#ff4d4f' : '#52c41a' }} />
                  <Text strong>Last Called URL</Text>
                  <Tag color={lastApiResponse?.startsWith('Error') ? 'red' : 'green'}>
                    {lastApiResponse?.startsWith('Error') ? 'Failed' : 'Success'}
                  </Tag>
                </Space>
              }
            >
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>URL:</Text>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code
                    style={{
                      background: '#fff7e6',
                      padding: '6px 10px',
                      borderRadius: 4,
                      fontSize: 12,
                      flex: 1,
                      wordBreak: 'break-all',
                      border: '1px solid #ffd591',
                    }}
                  >
                    {lastCalledUrl}
                  </code>
                  <Button
                    size="small"
                    icon={copiedUrl === lastCalledUrl ? <CheckOutlined /> : <CopyOutlined />}
                    onClick={() => copyToClipboard(lastCalledUrl)}
                  />
                </div>
              </div>
              {lastApiResponse && (
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>Response:</Text>
                  <div>
                    <code
                      style={{
                        background: lastApiResponse.startsWith('Error') ? '#fff2f0' : '#f6ffed',
                        padding: '6px 10px',
                        borderRadius: 4,
                        fontSize: 12,
                        display: 'block',
                        wordBreak: 'break-all',
                        border: `1px solid ${lastApiResponse.startsWith('Error') ? '#ffccc7' : '#b7eb8f'}`,
                      }}
                    >
                      {lastApiResponse}
                    </code>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* APEX APIs */}
          <Card
            size="small"
            title={
              <Space>
                <DatabaseOutlined style={{ color: REDWOOD.success }} />
                <Text strong>APEX APIs</Text>
                <Tag color="green">Active</Tag>
              </Space>
            }
          >
            {PAGE_APIS.apex.map((api, index) => (
              <div
                key={index}
                style={{
                  padding: '12px',
                  background: REDWOOD.neutral100,
                  borderRadius: 6,
                  marginBottom: index < PAGE_APIS.apex.length - 1 ? 12 : 0,
                }}
              >
                <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
                  <Col>
                    <Space>
                      <Tag color={api.method === 'GET' ? 'blue' : 'orange'}>{api.method}</Tag>
                      <Text strong>{api.name}</Text>
                    </Space>
                  </Col>
                </Row>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  {api.description}
                </Text>
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Proxy URL:</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code
                      style={{
                        background: '#f5f5f5',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {api.proxyUrl}{api.params ? `?${api.params}` : ''}
                    </code>
                    <Button
                      size="small"
                      icon={copiedUrl === api.proxyUrl ? <CheckOutlined /> : <CopyOutlined />}
                      onClick={() => copyToClipboard(api.proxyUrl)}
                    />
                  </div>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>Actual URL:</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code
                      style={{
                        background: '#e8f5e9',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {api.actualUrl}
                    </code>
                    <Button
                      size="small"
                      icon={copiedUrl === api.actualUrl ? <CheckOutlined /> : <CopyOutlined />}
                      onClick={() => copyToClipboard(api.actualUrl)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </Modal>
      </Content>
    </Layout>
  );
};

export default ManageInvoices;
