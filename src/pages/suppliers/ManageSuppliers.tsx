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
  Row,
  Col,
  Breadcrumb,
  Collapse,
  message,
  DatePicker,
  Tabs,
  Switch,
  Spin,
  Divider,
  Descriptions,
  Checkbox,
  Modal,
  Tag,
  Tooltip,
} from 'antd';
import {
  HomeOutlined,
  SearchOutlined,
  ReloadOutlined,
  SaveOutlined,
  PlusOutlined,
  SettingOutlined,
  SwapOutlined,
  CloudOutlined,
  DatabaseOutlined,
  UserOutlined,
  EnvironmentOutlined,
  BankOutlined,
  ContactsOutlined,
  SafetyCertificateOutlined,
  StarOutlined,
  CloseOutlined,
  ApiOutlined,
  CopyOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;
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
};

// Proxy config
const PROXY_CONFIG = {
  baseUrl: 'http://localhost:3001/api',
};

// Supplier record interface
interface SupplierRecord {
  key: string;
  supplierId: number;
  supplier: string;
  supplierNumber: string;
  alternateName: string;
  businessRelationship: string;
  parentSupplier: string;
  creationDate: string;
  inactiveSince: string;
  taxRegistrationNumber: string;
  taxpayerId: string;
  dunsNumber: string;
  supplierType: string;
  taxOrganizationType: string;
  status: string;
}

// Supplier detail interface
interface SupplierDetail extends SupplierRecord {
  // General
  creationSource: string;
  registrationRequest: string;
  parentSupplierNumber: string;
  inactiveDate: string;
  // Identification
  alias: string;
  customerNumber: string;
  sic: string;
  nationalInsuranceNumber: string;
  corporateWebSite: string;
  oneTimeSupplier: boolean;
  registryId: string;
  relationships: string;
  // Regional Information
  regionalInformation: string;
  // Corporate Profile
  yearEstablished: string;
  missionStatement: string;
  yearIncorporated: string;
  chiefExecutiveTitle: string;
  chiefExecutiveName: string;
  principalTitle: string;
  principalName: string;
  // Financial Profile
  fiscalYearEndMonth: string;
  currentFiscalYearRevenue: string;
  preferredFunctionalCurrency: string;
}

// Tab item interface for open suppliers
interface SupplierTab {
  key: string;
  label: string;
  supplier: SupplierRecord;
  detail?: SupplierDetail;
  loading?: boolean;
}

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

// Map Fusion API response to SupplierRecord
const mapFusionToSupplierRecord = (item: any, index: number): SupplierRecord => ({
  key: item.SupplierId?.toString() || index.toString(),
  supplierId: item.SupplierId,
  supplier: item.Supplier || '',
  supplierNumber: item.SupplierNumber || '',
  alternateName: item.AlternateName || '',
  businessRelationship: item.BusinessRelationship || '',
  parentSupplier: item.ParentSupplier || '',
  creationDate: formatDate(item.CreationDate),
  inactiveSince: formatDate(item.InactiveDate),
  taxRegistrationNumber: item.TaxRegistrationNumber || '',
  taxpayerId: item.TaxpayerId || '',
  dunsNumber: item.DUNSNumber || '',
  supplierType: item.SupplierType || '',
  taxOrganizationType: item.TaxOrganizationType || '',
  status: item.Status || 'Active',
});

// Map APEX API response to SupplierRecord (lowercase column names)
const mapApexToSupplierRecord = (item: any, index: number): SupplierRecord => ({
  key: item.supplier_id?.toString() || index.toString(),
  supplierId: item.supplier_id,
  supplier: item.supplier || '',
  supplierNumber: item.supplier_number || '',
  alternateName: item.alternate_name || '',
  businessRelationship: item.business_relationship || '',
  parentSupplier: item.parent_supplier || '',
  creationDate: formatDate(item.creation_date),
  inactiveSince: formatDate(item.inactive_date),
  taxRegistrationNumber: item.tax_registration_number || '',
  taxpayerId: item.taxpayer_id || '',
  dunsNumber: item.duns_number || '',
  supplierType: item.supplier_type || '',
  taxOrganizationType: item.tax_organization_type || '',
  status: item.status || 'Active',
});

// Map Fusion detail API response to SupplierDetail
const mapFusionToSupplierDetail = (item: any): SupplierDetail => ({
  key: item.SupplierId?.toString() || '',
  supplierId: item.SupplierId,
  supplier: item.Supplier || '',
  supplierNumber: item.SupplierNumber || '',
  alternateName: item.AlternateName || '',
  businessRelationship: item.BusinessRelationship || '',
  parentSupplier: item.ParentSupplier || '',
  creationDate: formatDate(item.CreationDate),
  inactiveSince: formatDate(item.InactiveDate),
  taxRegistrationNumber: item.TaxRegistrationNumber || '',
  taxpayerId: item.TaxpayerId || '',
  dunsNumber: item.DUNSNumber || '',
  supplierType: item.SupplierType || '',
  taxOrganizationType: item.TaxOrganizationType || '',
  status: item.Status || 'Active',
  // General
  creationSource: item.CreationSource || '',
  registrationRequest: item.RegistrationRequest || '',
  parentSupplierNumber: item.ParentSupplierNumber || '',
  inactiveDate: formatDate(item.InactiveDate),
  // Identification
  alias: item.Alias || '',
  customerNumber: item.CustomerNumber || '',
  sic: item.SIC || '',
  nationalInsuranceNumber: item.NationalInsuranceNumber || '',
  corporateWebSite: item.CorporateWebSite || '',
  oneTimeSupplier: item.OneTimeSupplierFlag === 'Y',
  registryId: item.RegistryId || '',
  relationships: item.Relationships || 'Supplier',
  // Regional Information
  regionalInformation: item.RegionalInformation || '',
  // Corporate Profile
  yearEstablished: item.YearEstablished || '',
  missionStatement: item.MissionStatement || '',
  yearIncorporated: item.YearIncorporated || '',
  chiefExecutiveTitle: item.ChiefExecutiveTitle || '',
  chiefExecutiveName: item.ChiefExecutiveName || '',
  principalTitle: item.PrincipalTitle || '',
  principalName: item.PrincipalName || '',
  // Financial Profile
  fiscalYearEndMonth: item.FiscalYearEndMonth || '',
  currentFiscalYearRevenue: item.CurrentFiscalYearRevenue || '',
  preferredFunctionalCurrency: item.PreferredFunctionalCurrency || '',
});

const ManageSuppliers: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [searchCollapsed, setSearchCollapsed] = useState(false);
  const [dataSource, setDataSource] = useState<'fusion' | 'apex'>('fusion');

  // Tab management state
  const [activeTab, setActiveTab] = useState('search');
  const [openTabs, setOpenTabs] = useState<SupplierTab[]>([]);

  // API Info Modal state
  const [apiModalVisible, setApiModalVisible] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // API Configuration for this page
  const PAGE_APIS = {
    fusion: [
      {
        name: 'Search Suppliers',
        method: 'GET',
        proxyUrl: `${PROXY_CONFIG.baseUrl}/fusion/fscmRestApi/resources/11.13.18.05/suppliers`,
        actualUrl: 'https://iaaobn.fa.ocs.oraclecloud.com:443/fscmRestApi/resources/11.13.18.05/suppliers',
        params: 'limit=25&onlyData=true',
        description: 'Fetches list of suppliers with pagination',
      },
      {
        name: 'Get Supplier Detail',
        method: 'GET',
        proxyUrl: `${PROXY_CONFIG.baseUrl}/fusion/fscmRestApi/resources/11.13.18.05/suppliers/{supplierId}`,
        actualUrl: 'https://iaaobn.fa.ocs.oraclecloud.com:443/fscmRestApi/resources/11.13.18.05/suppliers/{supplierId}',
        params: '',
        description: 'Fetches complete supplier details by ID',
      },
    ],
    apex: [
      {
        name: 'Search Suppliers',
        method: 'GET',
        proxyUrl: `${PROXY_CONFIG.baseUrl}/apex/suppliers`,
        actualUrl: 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/suppliers',
        params: '',
        description: 'Fetches suppliers from APEX database',
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

  // Fetch supplier detail from Fusion
  const fetchSupplierDetail = async (supplierId: number): Promise<SupplierDetail | null> => {
    try {
      const fusionPath = `fscmRestApi/resources/11.13.18.05/suppliers/${supplierId}`;
      const proxyUrl = `${PROXY_CONFIG.baseUrl}/fusion/${fusionPath}`;

      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return mapFusionToSupplierDetail(data);
    } catch (error) {
      console.error('Error fetching supplier detail:', error);
      message.error('Failed to fetch supplier details');
      return null;
    }
  };

  // Open supplier in new tab
  const openSupplierTab = async (record: SupplierRecord) => {
    const tabKey = `supplier-${record.supplierId}`;

    // Check if tab already exists
    const existingTab = openTabs.find((tab) => tab.key === tabKey);
    if (existingTab) {
      setActiveTab(tabKey);
      return;
    }

    // Add new tab with loading state
    const newTab: SupplierTab = {
      key: tabKey,
      label: record.supplier,
      supplier: record,
      loading: dataSource === 'fusion',
    };
    setOpenTabs([...openTabs, newTab]);
    setActiveTab(tabKey);

    // Fetch detail if Fusion mode
    if (dataSource === 'fusion') {
      const detail = await fetchSupplierDetail(record.supplierId);
      setOpenTabs((prevTabs) =>
        prevTabs.map((tab) =>
          tab.key === tabKey ? { ...tab, detail: detail || undefined, loading: false } : tab
        )
      );
    }
  };

  // Close supplier tab
  const closeSupplierTab = (tabKey: string) => {
    const newTabs = openTabs.filter((tab) => tab.key !== tabKey);
    setOpenTabs(newTabs);

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
      closeSupplierTab(targetKey);
    }
  };

  // Search suppliers from API
  const handleSearch = async () => {
    setLoading(true);
    try {
      let proxyUrl: string;
      let mapFunction: (item: any, index: number) => SupplierRecord;

      if (dataSource === 'fusion') {
        // Fusion API
        const fusionPath = 'fscmRestApi/resources/11.13.18.05/suppliers';
        proxyUrl = `${PROXY_CONFIG.baseUrl}/fusion/${fusionPath}?limit=25&onlyData=true`;
        mapFunction = mapFusionToSupplierRecord;
      } else {
        // APEX API
        proxyUrl = `${PROXY_CONFIG.baseUrl}/apex/suppliers`;
        mapFunction = mapApexToSupplierRecord;
      }

      console.log('Fetching suppliers from:', proxyUrl);

      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('API Response:', data);

      const items = data.items || data || [];

      if (Array.isArray(items) && items.length > 0) {
        const mappedSuppliers = items.slice(0, 25).map(mapFunction);
        setSuppliers(mappedSuppliers);
        message.success(`Found ${mappedSuppliers.length} suppliers from ${dataSource === 'fusion' ? 'Fusion' : 'APEX'}`);
      } else {
        setSuppliers([]);
        message.info('No suppliers found');
      }
    } catch (error) {
      console.error('Search error:', error);
      message.error(`Failed to search suppliers: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Reset search form
  const handleReset = () => {
    form.resetFields();
    setSuppliers([]);
  };

  // Table columns
  const columns: ColumnsType<SupplierRecord> = [
    {
      title: 'Supplier',
      dataIndex: 'supplier',
      key: 'supplier',
      width: 250,
      render: (text: string, record: SupplierRecord) => (
        <a
          onClick={() => openSupplierTab(record)}
          style={{ color: REDWOOD.info, fontWeight: 500 }}
        >
          {text}
        </a>
      ),
    },
    {
      title: 'Supplier Number',
      dataIndex: 'supplierNumber',
      key: 'supplierNumber',
      width: 120,
    },
    {
      title: 'Alt Name',
      dataIndex: 'alternateName',
      key: 'alternateName',
      width: 150,
    },
    {
      title: 'Business Relationship',
      dataIndex: 'businessRelationship',
      key: 'businessRelationship',
      width: 150,
    },
    {
      title: 'Parent Supplier',
      dataIndex: 'parentSupplier',
      key: 'parentSupplier',
      width: 150,
    },
    {
      title: 'Creation Date',
      dataIndex: 'creationDate',
      key: 'creationDate',
      width: 120,
    },
    {
      title: 'Inactive Since',
      dataIndex: 'inactiveSince',
      key: 'inactiveSince',
      width: 120,
    },
    {
      title: 'Tax Registration Number',
      dataIndex: 'taxRegistrationNumber',
      key: 'taxRegistrationNumber',
      width: 160,
    },
    {
      title: 'Taxpayer ID',
      dataIndex: 'taxpayerId',
      key: 'taxpayerId',
      width: 120,
    },
    {
      title: 'D-U-N-S Number',
      dataIndex: 'dunsNumber',
      key: 'dunsNumber',
      width: 120,
    },
  ];

  // Row selection config
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  };

  // Render search tab content
  const renderSearchTab = () => (
    <div style={{ padding: '0 24px 24px' }}>
      {/* Search Form */}
      <Card
        style={{
          marginBottom: 16,
          borderRadius: 8,
          border: `1px solid ${REDWOOD.neutral200}`,
        }}
        bodyStyle={{ padding: 16 }}
      >
        <Collapse
          activeKey={searchCollapsed ? [] : ['1']}
          onChange={() => setSearchCollapsed(!searchCollapsed)}
          bordered={false}
          style={{ background: 'transparent' }}
        >
          <Panel
            header={
              <Space>
                <SearchOutlined />
                <Text strong>Advanced Search</Text>
              </Space>
            }
            key="1"
          >
            <Form form={form} layout="horizontal" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }} size="small">
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="Supplier" name="supplier" style={{ marginBottom: 8 }}>
                    <Input placeholder="" size="small" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Supplier Type" name="supplierType" style={{ marginBottom: 8 }}>
                    <Select placeholder="" allowClear size="small">
                      <Option value="">All</Option>
                      <Option value="Vendor">Vendor</Option>
                      <Option value="Contractor">Contractor</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <div style={{ textAlign: 'right', paddingTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>** At least one is required</Text>
                  </div>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="Taxpayer ID" name="taxpayerId" style={{ marginBottom: 8 }}>
                    <Input placeholder="" size="small" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Tax Organization Type" name="taxOrganizationType" style={{ marginBottom: 8 }}>
                    <Select placeholder="" allowClear size="small">
                      <Option value="">All</Option>
                      <Option value="Corporation">Corporation</Option>
                      <Option value="Individual">Individual</Option>
                      <Option value="Partnership">Partnership</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={8} />
              </Row>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="Tax Registration Number" name="taxRegistrationNumber" style={{ marginBottom: 8 }}>
                    <Input placeholder="" size="small" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Business Classification" name="businessClassification" style={{ marginBottom: 8 }}>
                    <Select placeholder="" allowClear size="small">
                      <Option value="">All</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={8} />
              </Row>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="Creation Date" name="creationDate" style={{ marginBottom: 8 }}>
                    <RangePicker size="small" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Products and Services" name="productsServices" style={{ marginBottom: 8 }}>
                    <Input placeholder="" size="small" suffix={<SearchOutlined />} />
                  </Form.Item>
                </Col>
                <Col span={8} />
              </Row>
            </Form>
          </Panel>
        </Collapse>

        {/* Action buttons */}
        <Row justify="end" style={{ marginTop: 16 }}>
          <Space>
            <Button icon={<SearchOutlined />} type="primary" onClick={handleSearch} loading={loading}>
              Search
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              Reset
            </Button>
            <Button icon={<SaveOutlined />}>Save...</Button>
            <Button icon={<PlusOutlined />}>Add Fields</Button>
            <Button icon={<SwapOutlined />}>Reorder</Button>
          </Space>
        </Row>
      </Card>

      {/* Data Source Toggle */}
      <Card
        style={{
          marginBottom: 16,
          borderRadius: 8,
          border: `1px solid ${REDWOOD.neutral200}`,
        }}
        bodyStyle={{ padding: '12px 16px' }}
      >
        <Row justify="space-between" align="middle">
          <Col>
            <Space size="large">
              <Text strong>Data Source:</Text>
              <Space>
                <CloudOutlined style={{ color: dataSource === 'fusion' ? REDWOOD.info : REDWOOD.neutral600 }} />
                <Text style={{ color: dataSource === 'fusion' ? REDWOOD.info : REDWOOD.neutral600 }}>Fusion</Text>
                <Switch
                  checked={dataSource === 'apex'}
                  onChange={(checked) => {
                    setDataSource(checked ? 'apex' : 'fusion');
                    setSuppliers([]);
                  }}
                  style={{ margin: '0 8px' }}
                />
                <DatabaseOutlined style={{ color: dataSource === 'apex' ? REDWOOD.success : REDWOOD.neutral600 }} />
                <Text style={{ color: dataSource === 'apex' ? REDWOOD.success : REDWOOD.neutral600 }}>APEX</Text>
              </Space>
            </Space>
          </Col>
          <Col>
            <Text type="secondary">
              {dataSource === 'fusion' ? 'Fetching live data from Oracle Fusion' : 'Fetching synced data from APEX database'}
            </Text>
          </Col>
        </Row>
      </Card>

      {/* Search Results */}
      <Card
        title={
          <Space>
            <Text strong>Search Results</Text>
            {suppliers.length > 0 && (
              <Text type="secondary">({suppliers.length} records)</Text>
            )}
          </Space>
        }
        style={{
          borderRadius: 8,
          border: `1px solid ${REDWOOD.neutral200}`,
        }}
        extra={
          <Space>
            <Button size="small" icon={<PlusOutlined />} type="primary">
              Register Supplier
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={suppliers}
          rowSelection={rowSelection}
          loading={loading}
          scroll={{ x: 1400 }}
          pagination={{
            pageSize: 25,
            showSizeChanger: true,
            showTotal: (total) => `${total} suppliers`,
          }}
          size="small"
          onRow={(record) => ({
            onDoubleClick: () => openSupplierTab(record),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>
    </div>
  );

  // Render supplier detail tab content
  const renderSupplierDetailTab = (tab: SupplierTab) => {
    if (tab.loading) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
          <Spin size="large" tip="Loading supplier details..." />
        </div>
      );
    }

    const detail = tab.detail || tab.supplier;

    return (
      <div style={{ padding: '0 24px 24px' }}>
        {/* Header */}
        <Card
          style={{
            marginBottom: 16,
            borderRadius: 8,
            border: `1px solid ${REDWOOD.neutral200}`,
          }}
          bodyStyle={{ padding: '16px 24px' }}
        >
          <Row justify="space-between" align="middle">
            <Col>
              <Space>
                <Title level={4} style={{ margin: 0 }}>
                  Edit Supplier: {detail.supplier}
                </Title>
                <StarOutlined style={{ color: REDWOOD.warning }} />
              </Space>
            </Col>
            <Col>
              <Space>
                <Button type="primary" style={{ background: REDWOOD.primary }}>Save</Button>
                <Button type="primary" style={{ background: REDWOOD.info }}>Save and Close</Button>
                <Button onClick={() => closeSupplierTab(tab.key)}>Cancel</Button>
                <Text type="secondary" style={{ marginLeft: 16 }}>
                  Last Saved: {new Date().toLocaleString()}
                </Text>
              </Space>
            </Col>
          </Row>
        </Card>

        {/* Supplier Detail Tabs */}
        <Card
          style={{
            borderRadius: 8,
            border: `1px solid ${REDWOOD.neutral200}`,
          }}
        >
          <Tabs
            defaultActiveKey="profile"
            items={[
              {
                key: 'profile',
                label: (
                  <Space>
                    <UserOutlined />
                    Profile
                  </Space>
                ),
                children: renderProfileTab(detail as SupplierDetail),
              },
              {
                key: 'addresses',
                label: (
                  <Space>
                    <EnvironmentOutlined />
                    Addresses
                  </Space>
                ),
                children: <div style={{ padding: 24 }}><Text type="secondary">Addresses tab content</Text></div>,
              },
              {
                key: 'sites',
                label: (
                  <Space>
                    <BankOutlined />
                    Sites
                  </Space>
                ),
                children: <div style={{ padding: 24 }}><Text type="secondary">Sites tab content</Text></div>,
              },
              {
                key: 'contacts',
                label: (
                  <Space>
                    <ContactsOutlined />
                    Contacts
                  </Space>
                ),
                children: <div style={{ padding: 24 }}><Text type="secondary">Contacts tab content</Text></div>,
              },
              {
                key: 'qualifications',
                label: (
                  <Space>
                    <SafetyCertificateOutlined />
                    Qualifications
                  </Space>
                ),
                children: <div style={{ padding: 24 }}><Text type="secondary">Qualifications tab content</Text></div>,
              },
            ]}
          />
        </Card>
      </div>
    );
  };

  // Render Profile tab content
  const renderProfileTab = (detail: SupplierDetail) => (
    <div>
      {/* General Section */}
      <Collapse defaultActiveKey={['general']} bordered={false}>
        <Panel header={<Text strong>General</Text>} key="general">
          <Row gutter={24}>
            <Col span={12}>
              <Form layout="horizontal" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }} size="small">
                <Form.Item label="Supplier" required style={{ marginBottom: 6 }}>
                  <Input value={detail.supplier} size="small" />
                </Form.Item>
                <Form.Item label="Supplier Number" style={{ marginBottom: 6 }}>
                  <Text>{detail.supplierNumber}</Text>
                </Form.Item>
                <Form.Item label="Alternate Name" style={{ marginBottom: 6 }}>
                  <Input value={detail.alternateName} size="small" />
                </Form.Item>
                <Form.Item label="Tax Organization Type" style={{ marginBottom: 6 }}>
                  <Select value={detail.taxOrganizationType || 'Corporation'} style={{ width: '100%' }} size="small">
                    <Option value="Corporation">Corporation</Option>
                    <Option value="Individual">Individual</Option>
                    <Option value="Partnership">Partnership</Option>
                  </Select>
                </Form.Item>
                <Form.Item label="Supplier Type" style={{ marginBottom: 6 }}>
                  <Select value={detail.supplierType} style={{ width: '100%' }} allowClear size="small">
                    <Option value="Vendor">Vendor</Option>
                    <Option value="Contractor">Contractor</Option>
                  </Select>
                </Form.Item>
                <Form.Item label="Inactive Date" style={{ marginBottom: 6 }}>
                  <DatePicker style={{ width: '100%' }} placeholder="dd-mmm-yyyy" size="small" />
                </Form.Item>
                <Form.Item label="Status" style={{ marginBottom: 6 }}>
                  <Text>{detail.status}</Text>
                </Form.Item>
              </Form>
            </Col>
            <Col span={12}>
              <Form layout="horizontal" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }} size="small">
                <Form.Item label="Business Relationship" style={{ marginBottom: 6 }}>
                  <Text>{detail.businessRelationship}</Text>
                </Form.Item>
                <Form.Item label="Parent Supplier" style={{ marginBottom: 6 }}>
                  <Input suffix={<SearchOutlined />} size="small" />
                </Form.Item>
                <Form.Item label="Parent Supplier Number" style={{ marginBottom: 6 }}>
                  <Text>{detail.parentSupplierNumber}</Text>
                </Form.Item>
                <Form.Item label="Creation Date" style={{ marginBottom: 6 }}>
                  <Text>{detail.creationDate}</Text>
                </Form.Item>
                <Form.Item label="Creation Source" style={{ marginBottom: 6 }}>
                  <Text>{detail.creationSource || 'Import'}</Text>
                </Form.Item>
                <Form.Item label="Registration Request" style={{ marginBottom: 6 }}>
                  <Text>{detail.registrationRequest}</Text>
                </Form.Item>
                <Form.Item label="Attachments" style={{ marginBottom: 6 }}>
                  <Button type="link" style={{ padding: 0 }} size="small">None +</Button>
                </Form.Item>
              </Form>
            </Col>
          </Row>
        </Panel>
      </Collapse>

      <Divider style={{ margin: '16px 0' }} />

      {/* Profile Details Section */}
      <Title level={5}>Profile Details</Title>
      <Tabs
        defaultActiveKey="organization"
        size="small"
        items={[
          {
            key: 'organization',
            label: 'Organization',
            children: renderOrganizationTab(detail),
          },
          {
            key: 'businessClassifications',
            label: 'Business Classifications',
            children: <div style={{ padding: 16 }}><Text type="secondary">Business Classifications content</Text></div>,
          },
          {
            key: 'productsServices',
            label: 'Products and Services',
            children: <div style={{ padding: 16 }}><Text type="secondary">Products and Services content</Text></div>,
          },
          {
            key: 'transactionTax',
            label: 'Transaction Tax',
            children: <div style={{ padding: 16 }}><Text type="secondary">Transaction Tax content</Text></div>,
          },
          {
            key: 'incomeTax',
            label: 'Income Tax',
            children: <div style={{ padding: 16 }}><Text type="secondary">Income Tax content</Text></div>,
          },
          {
            key: 'payments',
            label: 'Payments',
            children: <div style={{ padding: 16 }}><Text type="secondary">Payments content</Text></div>,
          },
        ]}
      />
    </div>
  );

  // Render Organization sub-tab
  const renderOrganizationTab = (detail: SupplierDetail) => (
    <div>
      {/* Identification */}
      <Collapse defaultActiveKey={['identification', 'corporate', 'financial']} bordered={false}>
        <Panel header={<Text strong>Identification</Text>} key="identification">
          <Row gutter={24}>
            <Col span={12}>
              <Form layout="horizontal" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }} size="small">
                <Form.Item label="Alias" style={{ marginBottom: 6 }}>
                  <Input value={detail.alias} size="small" />
                </Form.Item>
                <Form.Item label="D-U-N-S Number" style={{ marginBottom: 6 }}>
                  <Input value={detail.dunsNumber} size="small" />
                </Form.Item>
                <Form.Item label=" " colon={false} style={{ marginBottom: 6 }}>
                  <Checkbox checked={detail.oneTimeSupplier}>One-time supplier</Checkbox>
                </Form.Item>
                <Form.Item label="Registry ID" style={{ marginBottom: 6 }}>
                  <Text>{detail.registryId}</Text>
                </Form.Item>
                <Form.Item label="Relationships" style={{ marginBottom: 6 }}>
                  <Text>{detail.relationships}</Text>
                </Form.Item>
              </Form>
            </Col>
            <Col span={12}>
              <Form layout="horizontal" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }} size="small">
                <Form.Item label="Customer Number" style={{ marginBottom: 6 }}>
                  <Input value={detail.customerNumber} size="small" />
                </Form.Item>
                <Form.Item label="SIC" style={{ marginBottom: 6 }}>
                  <Input value={detail.sic} size="small" />
                </Form.Item>
                <Form.Item label="National Insurance Number" style={{ marginBottom: 6 }}>
                  <Input value={detail.nationalInsuranceNumber} size="small" />
                </Form.Item>
                <Form.Item label="Corporate Web Site" style={{ marginBottom: 6 }}>
                  <Input value={detail.corporateWebSite} size="small" />
                </Form.Item>
              </Form>
            </Col>
          </Row>
        </Panel>

        <Panel header={<Text strong>Regional Information</Text>} key="regional">
          <Form layout="horizontal" labelCol={{ span: 5 }} wrapperCol={{ span: 19 }} size="small">
            <Form.Item label="Regional Information" style={{ marginBottom: 6 }}>
              <Select style={{ width: 300 }} allowClear size="small">
                <Option value="">Select...</Option>
              </Select>
            </Form.Item>
          </Form>
        </Panel>

        <Panel header={<Text strong>Corporate Profile</Text>} key="corporate">
          <Row gutter={24}>
            <Col span={12}>
              <Form layout="horizontal" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }} size="small">
                <Form.Item label="Year Established" style={{ marginBottom: 6 }}>
                  <Input value={detail.yearEstablished} size="small" />
                </Form.Item>
                <Form.Item label="Mission Statement" style={{ marginBottom: 6 }}>
                  <Input.TextArea value={detail.missionStatement} rows={2} size="small" />
                </Form.Item>
                <Form.Item label="Year Incorporated" style={{ marginBottom: 6 }}>
                  <Input value={detail.yearIncorporated} size="small" />
                </Form.Item>
              </Form>
            </Col>
            <Col span={12}>
              <Form layout="horizontal" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }} size="small">
                <Form.Item label="Chief Executive Title" style={{ marginBottom: 6 }}>
                  <Input value={detail.chiefExecutiveTitle} size="small" />
                </Form.Item>
                <Form.Item label="Chief Executive Name" style={{ marginBottom: 6 }}>
                  <Input value={detail.chiefExecutiveName} size="small" />
                </Form.Item>
                <Form.Item label="Principal Title" style={{ marginBottom: 6 }}>
                  <Input value={detail.principalTitle} size="small" />
                </Form.Item>
                <Form.Item label="Principal Name" style={{ marginBottom: 6 }}>
                  <Input value={detail.principalName} size="small" />
                </Form.Item>
              </Form>
            </Col>
          </Row>
        </Panel>

        <Panel header={<Text strong>Financial Profile</Text>} key="financial">
          <Form layout="horizontal" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }} style={{ maxWidth: 600 }} size="small">
            <Form.Item label="Fiscal Year End Month" style={{ marginBottom: 6 }}>
              <Select style={{ width: 200 }} value={detail.fiscalYearEndMonth} allowClear size="small">
                <Option value="January">January</Option>
                <Option value="February">February</Option>
                <Option value="March">March</Option>
                <Option value="December">December</Option>
              </Select>
            </Form.Item>
            <Form.Item label="Current Fiscal Year's Potential Revenue" style={{ marginBottom: 6 }}>
              <Input value={detail.currentFiscalYearRevenue} size="small" />
            </Form.Item>
            <Form.Item label="Preferred Functional Currency" style={{ marginBottom: 6 }}>
              <Select style={{ width: 200 }} value={detail.preferredFunctionalCurrency} allowClear size="small">
                <Option value="AED">AED</Option>
                <Option value="USD">USD</Option>
                <Option value="EUR">EUR</Option>
              </Select>
            </Form.Item>
          </Form>
        </Panel>
      </Collapse>
    </div>
  );

  // Build tab items
  const tabItems = [
    {
      key: 'search',
      label: (
        <Space>
          <SearchOutlined />
          Manage Suppliers
        </Space>
      ),
      children: renderSearchTab(),
      closable: false,
    },
    ...openTabs.map((tab) => ({
      key: tab.key,
      label: (
        <Space>
          <Text>Supplier: {tab.label}</Text>
        </Space>
      ),
      children: renderSupplierDetailTab(tab),
      closable: true,
    })),
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb */}
        <div style={{ padding: '16px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb>
            <Breadcrumb.Item>
              <Link to="/home">
                <HomeOutlined /> Home
              </Link>
            </Breadcrumb.Item>
            <Breadcrumb.Item>
              <Link to="/procurement">Procurement</Link>
            </Breadcrumb.Item>
            <Breadcrumb.Item>Suppliers</Breadcrumb.Item>
          </Breadcrumb>
        </div>

        {/* Page Title */}
        <div style={{ padding: '16px 24px', background: REDWOOD.surface }}>
          <Row justify="space-between" align="middle">
            <Col>
              <Title level={3} style={{ margin: 0 }}>
                Manage Suppliers
              </Title>
            </Col>
            <Col>
              <Space>
                <Tooltip title="View API Endpoints">
                  <Button
                    type="text"
                    icon={<ApiOutlined />}
                    onClick={() => setApiModalVisible(true)}
                    style={{ color: REDWOOD.info }}
                  >
                    API
                  </Button>
                </Tooltip>
                <Button type="text" style={{ color: REDWOOD.info }}>Done</Button>
              </Space>
            </Col>
          </Row>
        </div>

        {/* Tabs */}
        <Tabs
          type="editable-card"
          activeKey={activeTab}
          onChange={onTabChange}
          onEdit={onTabEdit}
          hideAdd
          items={tabItems}
          style={{ background: REDWOOD.surface }}
          tabBarStyle={{
            padding: '0 24px',
            marginBottom: 0,
            borderBottom: `1px solid ${REDWOOD.neutral200}`,
          }}
        />

        {/* API Info Modal */}
        <Modal
          title={
            <Space>
              <ApiOutlined style={{ color: REDWOOD.info }} />
              <span>API Endpoints - Manage Suppliers</span>
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
            <Tag color="blue" style={{ marginRight: 8 }}>
              Current Mode: {dataSource === 'fusion' ? 'Fusion' : 'APEX'}
            </Tag>
            <Text type="secondary">
              Switch between Fusion and APEX using the toggle on the search page
            </Text>
          </div>

          {/* Fusion APIs */}
          <Card
            size="small"
            title={
              <Space>
                <CloudOutlined style={{ color: REDWOOD.info }} />
                <Text strong>Fusion APIs</Text>
                <Tag color={dataSource === 'fusion' ? 'green' : 'default'}>
                  {dataSource === 'fusion' ? 'Active' : 'Inactive'}
                </Tag>
              </Space>
            }
            style={{ marginBottom: 16 }}
          >
            {PAGE_APIS.fusion.map((api, index) => (
              <div
                key={index}
                style={{
                  padding: '12px',
                  background: REDWOOD.neutral100,
                  borderRadius: 6,
                  marginBottom: index < PAGE_APIS.fusion.length - 1 ? 12 : 0,
                }}
              >
                <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
                  <Col>
                    <Space>
                      <Tag color="blue">{api.method}</Tag>
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
                      type="text"
                      size="small"
                      icon={copiedUrl === api.proxyUrl ? <CheckOutlined /> : <CopyOutlined />}
                      onClick={() => copyToClipboard(api.proxyUrl + (api.params ? `?${api.params}` : ''))}
                    />
                  </div>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>Actual URL:</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code
                      style={{
                        background: '#e6f7ff',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {api.actualUrl}{api.params ? `?${api.params}` : ''}
                    </code>
                    <Button
                      type="text"
                      size="small"
                      icon={copiedUrl === api.actualUrl ? <CheckOutlined /> : <CopyOutlined />}
                      onClick={() => copyToClipboard(api.actualUrl + (api.params ? `?${api.params}` : ''))}
                    />
                  </div>
                </div>
              </div>
            ))}
          </Card>

          {/* APEX APIs */}
          <Card
            size="small"
            title={
              <Space>
                <DatabaseOutlined style={{ color: REDWOOD.success }} />
                <Text strong>APEX APIs</Text>
                <Tag color={dataSource === 'apex' ? 'green' : 'default'}>
                  {dataSource === 'apex' ? 'Active' : 'Inactive'}
                </Tag>
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
                      <Tag color="green">{api.method}</Tag>
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
                      {api.proxyUrl}
                    </code>
                    <Button
                      type="text"
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
                        background: '#f6ffed',
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
                      type="text"
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

export default ManageSuppliers;
