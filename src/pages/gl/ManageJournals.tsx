import React, { useState, useEffect, useRef } from 'react';
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
  Tabs,
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
  FilterOutlined,
  CheckSquareOutlined,
  BarChartOutlined,
  FileTextOutlined,
  SwapOutlined,
  ReconciliationOutlined,
  CalendarOutlined,
  AuditOutlined,
  DollarOutlined,
  ProfileOutlined,
  PieChartOutlined,
  LineChartOutlined,
  FundOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import Autopilot from '../../components/Autopilot';

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
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral300: '#C7C7C7',
  neutral600: '#6B6B6B',
  neutral900: '#1A1A1A',
  surface: '#FFFFFF',
  taskBlue: '#0572CE',
  reportGreen: '#1D7B4D',
};

// Menu item type for floating panels
interface FloatingMenuItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  description?: string;
  color?: string;
  path?: string;
}

// Task menu items
const taskMenuItems: FloatingMenuItem[] = [
  { key: 'manage-journals', icon: <AccountBookOutlined />, label: 'Manage Journals', description: 'Search and manage journal entries', color: REDWOOD.primary, path: '/gl/manage-journals' },
  { key: 'journal-entry', icon: <FileTextOutlined />, label: 'Create Journal', description: 'Create manual journal entry', color: REDWOOD.taskBlue },
  { key: 'import-journals', icon: <SwapOutlined />, label: 'Import Journals', description: 'Import from spreadsheet', color: REDWOOD.info },
  { key: 'reverse-journal', icon: <ReconciliationOutlined />, label: 'Reverse Journal', description: 'Reverse posted journals', color: REDWOOD.warning },
  { key: 'open-period', icon: <CalendarOutlined />, label: 'Open Period', description: 'Open accounting period', color: REDWOOD.success },
  { key: 'close-period', icon: <AuditOutlined />, label: 'Close Period', description: 'Close accounting period', color: REDWOOD.primaryDark },
  { key: 'revaluation', icon: <DollarOutlined />, label: 'Run Revaluation', description: 'Foreign currency revaluation', color: REDWOOD.primary },
];

// Report menu items
const reportMenuItems: FloatingMenuItem[] = [
  { key: 'trial-balance', icon: <ProfileOutlined />, label: 'Trial Balance', description: 'View trial balance report', color: REDWOOD.reportGreen },
  { key: 'balance-sheet', icon: <PieChartOutlined />, label: 'Balance Sheet', description: 'Financial position report', color: REDWOOD.info },
  { key: 'income-statement', icon: <LineChartOutlined />, label: 'Income Statement', description: 'Profit and loss report', color: REDWOOD.success },
  { key: 'journal-report', icon: <FileTextOutlined />, label: 'Journal Report', description: 'Posted journals listing', color: REDWOOD.taskBlue },
  { key: 'account-analysis', icon: <FundOutlined />, label: 'Account Analysis', description: 'Account detail analysis', color: REDWOOD.warning },
  { key: 'gl-balances', icon: <BarChartOutlined />, label: 'GL Balances', description: 'General ledger balances', color: REDWOOD.primary },
];

// API Base URL
const API_BASE_URL = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/gl/journals';

// Journal data interface matching API response
interface JournalLine {
  lineId: number;
  lineNum: number;
  account: string;
  description: string;
  enteredDr: number;
  enteredCr: number;
  accountedDr: number;
  accountedCr: number;
  currency: string;
}

interface JournalRecord {
  key: string;
  // Batch fields
  batchId: number;
  jeBatchId: number;
  batchName: string;
  batchDescription: string;
  source: string;
  status: string;
  statusMeaning: string;
  approvalStatusMeaning: string;
  postedDate: string | null;
  // Header fields
  headerId: number;
  jeHeaderId: number;
  journalName: string;
  journalDescription: string;
  periodName: string;
  category: string;
  ledgerName: string;
  legalEntityName: string;
  currencyCode: string;
  enteredDebit: number;
  enteredCredit: number;
  accountedDebit: number;
  accountedCredit: number;
  effectiveDate: string;
  externalReference: string;
  creationDate: string;
  // Lines
  lines: JournalLine[];
}

interface ApiResponse {
  success: boolean;
  totalCount: number;
  offset: number;
  limit: number;
  items: JournalRecord[];
  error?: string;
}

// Accounting periods
const accountingPeriods = [
  'Jan-25', 'Feb-25', 'Mar-25', 'Apr-25', 'May-25', 'Jun-25',
  'Jul-25', 'Aug-25', 'Sep-25', 'Oct-25', 'Nov-25', 'Dec-25',
  'Jan-24', 'Feb-24', 'Mar-24', 'Apr-24', 'May-24', 'Jun-24',
  'Jul-24', 'Aug-24', 'Sep-24', 'Oct-24', 'Nov-24', 'Dec-24',
];

// Ledgers - BUIMERC LEDGER as default
const ledgers = [
  'BUIMERC LEDGER',
  'SB LEDGER',
  'US LEDGER',
  'UK LEDGER',
  'APAC LEDGER',
  'EMEA LEDGER',
];

// Batch statuses
const batchStatuses = ['Posted', 'Unposted', 'Error', 'Pending', 'All'];

// Operators
const operators = ['Starts with', 'Equals', 'Contains', 'Ends with'];

// Session storage key for preserving search data
const STORAGE_KEY = 'manageJournals_searchData';

// Interface for open journal tabs
interface OpenJournalTab {
  key: string;
  journal: JournalRecord;
}

const ManageJournals: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [journals, setJournals] = useState<JournalRecord[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchExpanded, setSearchExpanded] = useState<string[]>(['search']);

  // Tab management state
  const [activeTabKey, setActiveTabKey] = useState('search');
  const [openJournalTabs, setOpenJournalTabs] = useState<OpenJournalTab[]>([]);

  // Floating panel state
  const [activePanel, setActivePanel] = useState<'none' | 'tasks' | 'reports'>('none');
  const [isClosing, setIsClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const floatingIconsRef = useRef<HTMLDivElement>(null);

  // Restore search data from sessionStorage on mount
  useEffect(() => {
    const savedData = sessionStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const { journals: savedJournals, totalCount: savedTotal, formValues } = JSON.parse(savedData);
        if (savedJournals && savedJournals.length > 0) {
          setJournals(savedJournals);
          setTotalCount(savedTotal);
          setSearchExpanded([]); // Collapse search when data exists
          if (formValues) {
            form.setFieldsValue(formValues);
          }
        }
      } catch (e) {
        console.error('Error restoring search data:', e);
      }
    }
  }, []);

  // Click outside handler for floating panels
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isOutsidePanel = panelRef.current && !panelRef.current.contains(target);
      const isOutsideFloatingIcons = floatingIconsRef.current && !floatingIconsRef.current.contains(target);

      if (isOutsidePanel && isOutsideFloatingIcons) {
        closePanel();
      }
    };

    if (activePanel !== 'none') {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activePanel]);

  const closePanel = () => {
    setIsClosing(true);
    setTimeout(() => {
      setActivePanel('none');
      setIsClosing(false);
    }, 250);
  };

  const togglePanel = (panel: 'tasks' | 'reports') => {
    if (activePanel === panel) {
      closePanel();
    } else {
      setIsClosing(false);
      setActivePanel(panel);
    }
  };

  const handleMenuItemClick = (key: string, path?: string) => {
    closePanel();
    if (path) {
      navigate(path);
    }
  };

  // Open journal in a new tab
  const openJournalTab = (journal: JournalRecord) => {
    const tabKey = `journal-${journal.jeHeaderId}`;

    // Check if tab is already open
    const existingTab = openJournalTabs.find(tab => tab.key === tabKey);
    if (existingTab) {
      // Just switch to existing tab
      setActiveTabKey(tabKey);
      return;
    }

    // Add new tab
    setOpenJournalTabs(prev => [...prev, { key: tabKey, journal }]);
    setActiveTabKey(tabKey);
  };

  // Close journal tab
  const closeJournalTab = (tabKey: string) => {
    const newTabs = openJournalTabs.filter(tab => tab.key !== tabKey);
    setOpenJournalTabs(newTabs);

    // If closing active tab, switch to search or last tab
    if (activeTabKey === tabKey) {
      if (newTabs.length > 0) {
        setActiveTabKey(newTabs[newTabs.length - 1].key);
      } else {
        setActiveTabKey('search');
      }
    }
  };

  // Handle tab change
  const onTabChange = (key: string) => {
    setActiveTabKey(key);
  };

  // Handle tab edit (close)
  const onTabEdit = (targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => {
    if (action === 'remove' && typeof targetKey === 'string') {
      closeJournalTab(targetKey);
    }
  };

  // Search handler - calls the API
  const handleSearch = async () => {
    const values = form.getFieldsValue();

    // Validate required fields
    if (!values.ledger) {
      message.error('Ledger is required');
      return;
    }
    if (!values.accountingPeriod) {
      message.error('Accounting Period is required');
      return;
    }

    setLoading(true);

    try {
      // Build query parameters
      const params = new URLSearchParams();
      params.append('ledger', values.ledger);
      params.append('period', values.accountingPeriod);

      if (values.journalBatch) {
        params.append('batchName', values.journalBatch);
      }
      if (values.journalDescription) {
        params.append('journalDesc', values.journalDescription);
      }
      if (values.source) {
        params.append('source', values.source);
      }
      if (values.batchStatus && values.batchStatus !== 'All') {
        params.append('statusMeaning', values.batchStatus);
      }

      const url = `${API_BASE_URL}/headers?${params.toString()}`;
      console.log('Fetching:', url);

      const response = await fetch(url);
      const data: ApiResponse = await response.json();

      if (data.success) {
        // Map response to table data with keys
        const mappedData = data.items.map((item, index) => ({
          ...item,
          key: item.headerId?.toString() || index.toString(),
        }));
        setJournals(mappedData);
        setTotalCount(data.totalCount);

        // Save to sessionStorage for persistence
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
          journals: mappedData,
          totalCount: data.totalCount,
          formValues: values,
        }));

        message.success(`Found ${data.totalCount} journals`);
      } else {
        message.error(data.error || 'Failed to fetch journals');
        setJournals([]);
        setTotalCount(0);
      }
    } catch (error) {
      console.error('Error fetching journals:', error);
      message.error('Failed to connect to server');
      setJournals([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  // Reset handler
  const handleReset = () => {
    form.resetFields();
    setJournals([]);
    setTotalCount(0);
    setSelectedRowKeys([]);
    sessionStorage.removeItem(STORAGE_KEY);
  };

  // Get status tag color
  const getBatchStatusTag = (status: string) => {
    const statusLower = status?.toLowerCase() || '';
    const config: Record<string, { color: string; icon: React.ReactNode }> = {
      posted: { color: REDWOOD.success, icon: <CheckCircleOutlined /> },
      unposted: { color: REDWOOD.warning, icon: <ClockCircleOutlined /> },
      error: { color: REDWOOD.primary, icon: <CloseCircleOutlined /> },
      pending: { color: REDWOOD.info, icon: <ClockCircleOutlined /> },
    };
    const cfg = config[statusLower] || { color: REDWOOD.neutral600, icon: null };
    return (
      <Tag color={cfg.color} icon={cfg.icon} style={{ borderRadius: 4 }}>
        {status || 'Unknown'}
      </Tag>
    );
  };

  // Get approval status tag
  const getApprovalStatusTag = (status: string) => {
    const config: Record<string, string> = {
      'Approved': REDWOOD.success,
      'Pending': REDWOOD.warning,
      'Rejected': REDWOOD.primary,
      'Not required': REDWOOD.neutral600,
    };
    return (
      <Tag color={config[status] || REDWOOD.neutral600} style={{ borderRadius: 4 }}>
        {status || 'Not required'}
      </Tag>
    );
  };

  // Format currency
  const formatCurrency = (value: number, currency: string = 'AED') => {
    if (value === null || value === undefined) return '-';
    return `${value.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${currency}`;
  };

  // Table columns
  const columns: ColumnsType<JournalRecord> = [
    {
      title: 'Journal',
      dataIndex: 'journalName',
      key: 'journalName',
      width: 200,
      fixed: 'left',
      render: (text, record) => (
        <a
          style={{ color: REDWOOD.info, fontWeight: 500 }}
          onClick={() => openJournalTab(record)}
        >
          {text || '-'}
        </a>
      ),
      sorter: (a, b) => (a.journalName || '').localeCompare(b.journalName || ''),
    },
    {
      title: 'Journal Batch',
      dataIndex: 'batchName',
      key: 'batchName',
      width: 250,
      ellipsis: true,
      render: (text, record) => {
        const batchName = text || record.batchDescription || '-';
        return (
          <a
            style={{ color: REDWOOD.info }}
            onClick={() => openJournalTab(record)}
          >
            {batchName}
          </a>
        );
      },
    },
    {
      title: 'Accounting Period',
      dataIndex: 'periodName',
      key: 'periodName',
      width: 130,
      sorter: (a, b) => (a.periodName || '').localeCompare(b.periodName || ''),
    },
    {
      title: 'Source',
      dataIndex: 'source',
      key: 'source',
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: 'Entered Debit',
      dataIndex: 'enteredDebit',
      key: 'enteredDebit',
      width: 150,
      align: 'right',
      render: (value, record) => formatCurrency(value, record.currencyCode),
      sorter: (a, b) => (a.enteredDebit || 0) - (b.enteredDebit || 0),
    },
    {
      title: 'Entered Credit',
      dataIndex: 'enteredCredit',
      key: 'enteredCredit',
      width: 150,
      align: 'right',
      render: (value, record) => formatCurrency(value, record.currencyCode),
      sorter: (a, b) => (a.enteredCredit || 0) - (b.enteredCredit || 0),
    },
    {
      title: 'Batch Status',
      dataIndex: 'statusMeaning',
      key: 'statusMeaning',
      width: 120,
      render: (status) => getBatchStatusTag(status),
      filters: batchStatuses.filter(s => s !== 'All').map(s => ({ text: s, value: s })),
      onFilter: (value, record) => record.statusMeaning === value,
    },
    {
      title: 'Currency',
      dataIndex: 'currencyCode',
      key: 'currencyCode',
      width: 80,
      render: (text) => text || '-',
    },
    {
      title: 'Ledger',
      dataIndex: 'ledgerName',
      key: 'ledgerName',
      width: 150,
      render: (text) => text || '-',
    },
    {
      title: 'Approval Status',
      dataIndex: 'approvalStatusMeaning',
      key: 'approvalStatusMeaning',
      width: 130,
      render: (status) => getApprovalStatusTag(status),
    },
    {
      title: 'Posted Date',
      dataIndex: 'postedDate',
      key: 'postedDate',
      width: 110,
      render: (text) => text || '-',
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

  // Render Journal Edit Panel (for tab content)
  const renderJournalEditPanel = (journal: JournalRecord) => {
    const formatNumber = (num: number | null | undefined) => {
      if (num === null || num === undefined) return '';
      return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    return (
      <div style={{ padding: 16 }}>
        {/* Journal Header Card */}
        <Card
          style={{ marginBottom: 12, borderRadius: 6 }}
          bodyStyle={{ padding: 0 }}
        >
          <div
            style={{
              padding: '8px 12px',
              background: REDWOOD.neutral100,
              borderBottom: `1px solid ${REDWOOD.neutral200}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Space>
              <Text strong style={{ fontSize: 11 }}>
                Journal Batch: {journal.batchName}
              </Text>
            </Space>
            <Space size="small">
              <Dropdown.Button
                type="primary"
                size="small"
                style={{ background: REDWOOD.success }}
              >
                Save
              </Dropdown.Button>
              <Button size="small" style={{ background: '#1890ff', color: '#fff', fontSize: 10 }}>
                Post
              </Button>
            </Space>
          </div>

          <div style={{ padding: 10 }}>
            <Row gutter={[16, 6]}>
              <Col span={12}>
                <Row gutter={[6, 5]}>
                  <Col span={8}><Text type="secondary" style={{ fontSize: 10 }}>Journal Batch</Text></Col>
                  <Col span={16}><Text style={{ fontSize: 10 }}>{journal.batchName}</Text></Col>

                  <Col span={8}><Text type="secondary" style={{ fontSize: 10 }}>Description</Text></Col>
                  <Col span={16}><Text style={{ fontSize: 10 }}>{journal.batchDescription}</Text></Col>

                  <Col span={8}><Text type="secondary" style={{ fontSize: 10 }}>Period</Text></Col>
                  <Col span={16}><Text style={{ fontSize: 10 }}>{journal.periodName}</Text></Col>

                  <Col span={8}><Text type="secondary" style={{ fontSize: 10 }}>Source</Text></Col>
                  <Col span={16}><Text style={{ fontSize: 10 }}>{journal.source}</Text></Col>
                </Row>
              </Col>
              <Col span={12}>
                <Row gutter={[6, 5]}>
                  <Col span={8}><Text type="secondary" style={{ fontSize: 10 }}>Ledger</Text></Col>
                  <Col span={16}><Text style={{ fontSize: 10 }}>{journal.ledger}</Text></Col>

                  <Col span={8}><Text type="secondary" style={{ fontSize: 10 }}>Currency</Text></Col>
                  <Col span={16}><Text style={{ fontSize: 10 }}>{journal.currency}</Text></Col>

                  <Col span={8}><Text type="secondary" style={{ fontSize: 10 }}>Status</Text></Col>
                  <Col span={16}>
                    <Tag style={{ fontSize: 9 }} color={journal.statusMeaning === 'Posted' ? REDWOOD.success : REDWOOD.warning}>
                      {journal.statusMeaning}
                    </Tag>
                  </Col>

                  <Col span={8}><Text type="secondary" style={{ fontSize: 10 }}>Approval</Text></Col>
                  <Col span={16}><Text style={{ fontSize: 10 }}>{journal.approvalStatusMeaning}</Text></Col>
                </Row>
              </Col>
            </Row>
          </div>
        </Card>

        {/* Journal Details Card */}
        <Card
          style={{ marginBottom: 12, borderRadius: 6 }}
          bodyStyle={{ padding: 0 }}
        >
          <div
            style={{
              padding: '8px 12px',
              background: REDWOOD.neutral100,
              borderBottom: `1px solid ${REDWOOD.neutral200}`,
            }}
          >
            <Text strong style={{ fontSize: 11 }}>Journal: {journal.journalName}</Text>
          </div>

          <div style={{ padding: 10 }}>
            <Row gutter={[16, 6]}>
              <Col span={12}>
                <Row gutter={[6, 5]}>
                  <Col span={8}><Text type="secondary" style={{ fontSize: 10 }}>Journal</Text></Col>
                  <Col span={16}><Text strong style={{ fontSize: 10 }}>{journal.journalName}</Text></Col>

                  <Col span={8}><Text type="secondary" style={{ fontSize: 10 }}>Description</Text></Col>
                  <Col span={16}><Text style={{ fontSize: 10 }}>{journal.journalDescription || '-'}</Text></Col>

                  <Col span={8}><Text type="secondary" style={{ fontSize: 10 }}>Category</Text></Col>
                  <Col span={16}><Text style={{ fontSize: 10 }}>{journal.category}</Text></Col>

                  <Col span={8}><Text type="secondary" style={{ fontSize: 10 }}>Accounting Date</Text></Col>
                  <Col span={16}><Text style={{ fontSize: 10 }}>{journal.defaultEffectiveDate}</Text></Col>
                </Row>
              </Col>
              <Col span={12}>
                <Row gutter={[6, 5]}>
                  <Col span={8}><Text type="secondary" style={{ fontSize: 10 }}>Entered Dr</Text></Col>
                  <Col span={16}><Text style={{ fontSize: 10, color: REDWOOD.success }}>{formatNumber(journal.runningTotalEnteredDr)}</Text></Col>

                  <Col span={8}><Text type="secondary" style={{ fontSize: 10 }}>Entered Cr</Text></Col>
                  <Col span={16}><Text style={{ fontSize: 10, color: REDWOOD.primary }}>{formatNumber(journal.runningTotalEnteredCr)}</Text></Col>

                  <Col span={8}><Text type="secondary" style={{ fontSize: 10 }}>Accounted Dr</Text></Col>
                  <Col span={16}><Text style={{ fontSize: 10, color: REDWOOD.success }}>{formatNumber(journal.runningTotalAccountedDr)}</Text></Col>

                  <Col span={8}><Text type="secondary" style={{ fontSize: 10 }}>Accounted Cr</Text></Col>
                  <Col span={16}><Text style={{ fontSize: 10, color: REDWOOD.primary }}>{formatNumber(journal.runningTotalAccountedCr)}</Text></Col>
                </Row>
              </Col>
            </Row>
          </div>
        </Card>

        {/* Journal Lines Card */}
        <Card
          style={{ borderRadius: 6 }}
          bodyStyle={{ padding: 0 }}
        >
          <div
            style={{
              padding: '8px 12px',
              background: REDWOOD.neutral100,
              borderBottom: `1px solid ${REDWOOD.neutral200}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text strong style={{ fontSize: 11 }}>Journal Lines</Text>
            <Space size="small">
              <Dropdown menu={{ items: [{ key: 'add', label: 'Add Row' }] }}>
                <Button size="small" style={{ fontSize: 10 }}>Actions <DownOutlined /></Button>
              </Dropdown>
              <Button size="small" icon={<PlusOutlined />} />
              <Button size="small" icon={<DeleteOutlined />} />
            </Space>
          </div>

          <Table
            columns={[
              { title: 'Line', dataIndex: 'lineNum', key: 'lineNum', width: 60 },
              { title: 'Account', dataIndex: 'account', key: 'account', width: 200 },
              { title: 'Description', dataIndex: 'description', key: 'description', width: 200, ellipsis: true },
              { title: 'Currency', dataIndex: 'currency', key: 'currency', width: 80 },
              { title: 'Entered Dr', dataIndex: 'enteredDr', key: 'enteredDr', width: 100, align: 'right' as const, render: (v: number) => v > 0 ? formatNumber(v) : '' },
              { title: 'Entered Cr', dataIndex: 'enteredCr', key: 'enteredCr', width: 100, align: 'right' as const, render: (v: number) => v > 0 ? formatNumber(v) : '' },
              { title: 'Accounted Dr', dataIndex: 'accountedDr', key: 'accountedDr', width: 100, align: 'right' as const, render: (v: number) => v > 0 ? formatNumber(v) : '' },
              { title: 'Accounted Cr', dataIndex: 'accountedCr', key: 'accountedCr', width: 100, align: 'right' as const, render: (v: number) => v > 0 ? formatNumber(v) : '' },
            ]}
            dataSource={journal.lines?.map((line, idx) => ({ ...line, key: idx })) || []}
            pagination={false}
            scroll={{ x: 1000 }}
            size="small"
            bordered
            className="compact-table"
            locale={{ emptyText: 'No journal lines' }}
            summary={() => {
              const lines = journal.lines || [];
              const totals = lines.reduce(
                (acc, line) => ({
                  enteredDr: acc.enteredDr + (line.enteredDr || 0),
                  enteredCr: acc.enteredCr + (line.enteredCr || 0),
                  accountedDr: acc.accountedDr + (line.accountedDr || 0),
                  accountedCr: acc.accountedCr + (line.accountedCr || 0),
                }),
                { enteredDr: 0, enteredCr: 0, accountedDr: 0, accountedCr: 0 }
              );
              const isBalanced = Math.abs(totals.enteredDr - totals.enteredCr) < 0.01;

              return (
                <Table.Summary fixed>
                  <Table.Summary.Row style={{ background: REDWOOD.neutral100 }}>
                    <Table.Summary.Cell index={0} />
                    <Table.Summary.Cell index={1}>
                      <Text strong style={{ fontSize: 11 }}>Total</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2} />
                    <Table.Summary.Cell index={3} />
                    <Table.Summary.Cell index={4} align="right">
                      <Text strong style={{ fontSize: 11, color: REDWOOD.success }}>{formatNumber(totals.enteredDr)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">
                      <Text strong style={{ fontSize: 11, color: REDWOOD.primary }}>{formatNumber(totals.enteredCr)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="right">
                      <Text strong style={{ fontSize: 11, color: REDWOOD.success }}>{formatNumber(totals.accountedDr)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={7} align="right">
                      <Text strong style={{ fontSize: 11, color: REDWOOD.primary }}>{formatNumber(totals.accountedCr)}</Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                  <Table.Summary.Row style={{ background: isBalanced ? '#e6f7e6' : '#fff2f0' }}>
                    <Table.Summary.Cell index={0} colSpan={4}>
                      <Text strong style={{ fontSize: 11 }}>
                        {isBalanced ? '✓ Balanced' : '⚠ Out of Balance'}
                      </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} colSpan={2} align="right">
                      <Text style={{ fontSize: 11 }}>
                        Difference: {formatNumber(Math.abs(totals.enteredDr - totals.enteredCr))}
                      </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} colSpan={2} align="right">
                      <Text style={{ fontSize: 11 }}>
                        Difference: {formatNumber(Math.abs(totals.accountedDr - totals.accountedCr))}
                      </Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              );
            }}
          />
        </Card>
      </div>
    );
  };

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb Header */}
        <div style={{
          padding: '12px 24px',
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

        {/* Tabbed Content */}
        <Tabs
          type="editable-card"
          activeKey={activeTabKey}
          onChange={onTabChange}
          onEdit={onTabEdit}
          hideAdd
          style={{ background: REDWOOD.surface }}
          tabBarStyle={{
            margin: 0,
            padding: '4px 16px 0',
            background: REDWOOD.neutral200,
            borderBottom: `2px solid ${REDWOOD.info}`,
          }}
          items={[
            {
              key: 'search',
              label: (
                <span style={{
                  fontSize: 12,
                  fontWeight: activeTabKey === 'search' ? 600 : 400,
                  color: activeTabKey === 'search' ? REDWOOD.info : REDWOOD.neutral600,
                  padding: '4px 8px',
                }}>
                  <SearchOutlined style={{ marginRight: 6 }} />
                  Search
                  {totalCount > 0 && (
                    <Tag color={REDWOOD.info} style={{ fontSize: 10, marginLeft: 8 }}>{totalCount}</Tag>
                  )}
                </span>
              ),
              closable: false,
              children: (
                <div style={{ padding: 16 }}>
          {/* Collapsible Search Card */}
          <Collapse
            activeKey={searchExpanded}
            onChange={(keys) => setSearchExpanded(keys as string[])}
            style={{
              marginBottom: 16,
              borderRadius: 8,
              border: `1px solid ${REDWOOD.neutral200}`,
              background: REDWOOD.surface,
            }}
            expandIconPosition="end"
          >
            <Panel
              header={
                <Space>
                  <FilterOutlined style={{ color: REDWOOD.info, fontSize: 14 }} />
                  <Text strong style={{ fontSize: 13 }}>Search Parameters</Text>
                  {!searchExpanded.includes('search') && journals.length > 0 && (
                    <Tag color={REDWOOD.info} style={{ fontSize: 11 }}>{totalCount} results</Tag>
                  )}
                </Space>
              }
              key="search"
              style={{ borderRadius: 8 }}
            >
              <Form
                form={form}
                layout="horizontal"
                labelCol={{ span: 8 }}
                wrapperCol={{ span: 16 }}
                initialValues={{
                  ledger: 'BUIMERC LEDGER',
                  accountingPeriod: 'May-24',
                  journalOperator: 'Starts with',
                  batchOperator: 'Starts with',
                }}
              >
                <Row gutter={24}>
                  <Col span={12}>
                    {/* Ledger - Required */}
                    <Form.Item
                      label={<span><span style={{ color: REDWOOD.primary }}>*</span> Ledger</span>}
                      name="ledger"
                      rules={[{ required: true, message: 'Ledger is required' }]}
                    >
                      <Select placeholder="Select ledger">
                        {ledgers.map(l => <Option key={l} value={l}>{l}</Option>)}
                      </Select>
                    </Form.Item>

                    {/* Accounting Period - Required */}
                    <Form.Item
                      label={<span><span style={{ color: REDWOOD.primary }}>*</span> Period</span>}
                      name="accountingPeriod"
                      rules={[{ required: true, message: 'Period is required' }]}
                    >
                      <Select placeholder="Select period">
                        {accountingPeriods.map(p => <Option key={p} value={p}>{p}</Option>)}
                      </Select>
                    </Form.Item>

                    {/* Journal Batch */}
                    <Form.Item label="Journal Batch">
                      <Space.Compact style={{ width: '100%' }}>
                        <Form.Item name="batchOperator" noStyle>
                          <Select style={{ width: 120 }}>
                            {operators.map(op => <Option key={op} value={op}>{op}</Option>)}
                          </Select>
                        </Form.Item>
                        <Form.Item name="journalBatch" noStyle>
                          <Input style={{ flex: 1 }} placeholder="Enter batch name" />
                        </Form.Item>
                      </Space.Compact>
                    </Form.Item>
                  </Col>

                  <Col span={12}>
                    {/* Journal Description */}
                    <Form.Item label="Journal Desc">
                      <Space.Compact style={{ width: '100%' }}>
                        <Form.Item name="journalOperator" noStyle>
                          <Select style={{ width: 120 }}>
                            {operators.map(op => <Option key={op} value={op}>{op}</Option>)}
                          </Select>
                        </Form.Item>
                        <Form.Item name="journalDescription" noStyle>
                          <Input style={{ flex: 1 }} placeholder="Enter description" />
                        </Form.Item>
                      </Space.Compact>
                    </Form.Item>

                    {/* Source */}
                    <Form.Item label="Source" name="source">
                      <Input placeholder="Enter source" allowClear />
                    </Form.Item>

                    {/* Batch Status */}
                    <Form.Item label="Batch Status" name="batchStatus">
                      <Select placeholder="Select status" allowClear>
                        {batchStatuses.map(s => <Option key={s} value={s}>{s}</Option>)}
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>

                {/* Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, gap: 8 }}>
                  <Button
                    type="primary"
                    icon={<SearchOutlined />}
                    onClick={handleSearch}
                    loading={loading}
                    style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                  >
                    Search
                  </Button>
                  <Button icon={<ReloadOutlined />} onClick={handleReset}>
                    Reset
                  </Button>
                  <Button icon={<SaveOutlined />}>
                    Save...
                  </Button>
                </div>
              </Form>
            </Panel>
          </Collapse>

          {/* Results Table */}
          <Card
            style={{
              borderRadius: 8,
              border: `1px solid ${REDWOOD.neutral200}`,
            }}
            bodyStyle={{ padding: 0 }}
          >
            {/* Toolbar */}
            <div style={{
              padding: '8px 12px',
              borderBottom: `1px solid ${REDWOOD.neutral200}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: REDWOOD.neutral100,
            }}>
              <Space size="small">
                <Dropdown menu={{ items: actionsMenu }}>
                  <Button size="small" style={{ fontSize: 11 }}>
                    Actions <DownOutlined />
                  </Button>
                </Dropdown>
                <Dropdown menu={{ items: [
                  { key: 'columns', label: 'Columns' },
                  { key: 'detach', label: 'Detach' },
                  { key: 'sort', label: 'Sort' },
                ] }}>
                  <Button size="small" style={{ fontSize: 11 }}>
                    View <DownOutlined />
                  </Button>
                </Dropdown>
                <Dropdown menu={{ items: [
                  { key: 'wrap', label: 'Wrap' },
                  { key: 'resize', label: 'Resize Columns' },
                ] }}>
                  <Button size="small" style={{ fontSize: 11 }}>
                    Format <DownOutlined />
                  </Button>
                </Dropdown>
                <Tooltip title="Create Journal">
                  <Button size="small" icon={<PlusOutlined />} />
                </Tooltip>
                <Tooltip title="Edit">
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    disabled={selectedRowKeys.length !== 1}
                    onClick={() => {
                      const selectedJournal = journals.find(j => j.key === selectedRowKeys[0]);
                      if (selectedJournal) {
                        openJournalTab(selectedJournal);
                      }
                    }}
                  />
                </Tooltip>
                <Tooltip title="Delete">
                  <Button size="small" icon={<DeleteOutlined />} disabled={selectedRowKeys.length === 0} danger />
                </Tooltip>
              </Space>
              <Space size="small">
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {totalCount > 0 ? `${totalCount} journals found` : 'No results'}
                </Text>
                <Button
                  size="small"
                  type="primary"
                  disabled={selectedRowKeys.length === 0}
                  style={{ background: REDWOOD.success, borderColor: REDWOOD.success, fontSize: 11 }}
                >
                  Post Batch
                </Button>
                <Button size="small" disabled={selectedRowKeys.length === 0} style={{ fontSize: 11 }}>
                  Reverse Batch
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
                total: totalCount,
                pageSize: 25,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total) => `Total ${total} journals`,
                size: 'small',
              }}
              scroll={{ x: 1800 }}
              size="small"
              style={{ borderRadius: '0 0 12px 12px', fontSize: 12 }}
              className="compact-table"
              locale={{
                emptyText: 'Click Search to load journals',
              }}
            />
          </Card>
                </div>
              ),
            },
            // Dynamic journal tabs
            ...openJournalTabs.map(tab => ({
              key: tab.key,
              label: (
                <span style={{
                  fontSize: 12,
                  fontWeight: activeTabKey === tab.key ? 600 : 400,
                  color: activeTabKey === tab.key ? REDWOOD.primary : REDWOOD.neutral600,
                  padding: '4px 8px',
                }}>
                  <FileTextOutlined style={{ marginRight: 6, color: REDWOOD.primary }} />
                  {tab.journal.journalName}
                </span>
              ),
              closable: true,
              children: renderJournalEditPanel(tab.journal),
            })),
          ]}
        />
      </Content>

      {/* Floating Connected Icons */}
      <div
        ref={floatingIconsRef}
        style={{
          position: 'fixed',
          right: 24,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Tasks Icon */}
        <Tooltip title={activePanel !== 'tasks' ? 'Tasks' : ''} placement="left">
          <div
            onClick={() => togglePanel('tasks')}
            style={{
              width: 56,
              height: 56,
              borderRadius: '12px 12px 0 0',
              background: activePanel === 'tasks' ? REDWOOD.taskBlue : REDWOOD.surface,
              border: `2px solid ${REDWOOD.taskBlue}`,
              borderBottom: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: activePanel === 'tasks' ? `0 4px 12px ${REDWOOD.taskBlue}40` : '0 2px 8px rgba(0,0,0,0.1)',
              color: activePanel === 'tasks' ? '#fff' : REDWOOD.taskBlue,
              fontSize: 24,
            }}
          >
            <CheckSquareOutlined />
          </div>
        </Tooltip>

        {/* Connector Line */}
        <div style={{
          width: 56,
          height: 2,
          background: REDWOOD.neutral200,
        }} />

        {/* Reports Icon */}
        <Tooltip title={activePanel !== 'reports' ? 'Reports' : ''} placement="left">
          <div
            onClick={() => togglePanel('reports')}
            style={{
              width: 56,
              height: 56,
              borderRadius: '0 0 12px 12px',
              background: activePanel === 'reports' ? REDWOOD.reportGreen : REDWOOD.surface,
              border: `2px solid ${REDWOOD.reportGreen}`,
              borderTop: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: activePanel === 'reports' ? `0 4px 12px ${REDWOOD.reportGreen}40` : '0 2px 8px rgba(0,0,0,0.1)',
              color: activePanel === 'reports' ? '#fff' : REDWOOD.reportGreen,
              fontSize: 24,
            }}
          >
            <BarChartOutlined />
          </div>
        </Tooltip>
      </div>

      {/* Backdrop Overlay */}
      {activePanel !== 'none' && (
        <div
          onClick={closePanel}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.3)',
            zIndex: 1000,
            animation: isClosing ? 'fadeOut 0.25s ease forwards' : 'fadeIn 0.3s ease forwards',
          }}
        />
      )}

      {/* Slide-out Panels */}
      <div ref={panelRef}>
        {activePanel === 'tasks' && (
          <div
            style={{
              position: 'fixed',
              right: 0,
              top: 0,
              bottom: 0,
              width: 400,
              background: REDWOOD.surface,
              boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
              overflow: 'hidden',
              animation: isClosing ? 'slideOut 0.25s ease-in forwards' : 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              zIndex: 1001,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{
              padding: '20px 24px',
              background: REDWOOD.taskBlue,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0,
            }}>
              <Text strong style={{ color: '#fff', fontSize: 18 }}>Tasks</Text>
              <CloseOutlined
                style={{ color: '#fff', cursor: 'pointer', fontSize: 16, padding: 8 }}
                onClick={closePanel}
              />
            </div>
            <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
              {taskMenuItems.map((item, index) => (
                <div
                  key={item.key}
                  onClick={() => handleMenuItemClick(item.key, item.path)}
                  style={{
                    padding: '16px 20px',
                    borderRadius: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    transition: 'all 0.2s ease',
                    marginBottom: 8,
                    border: `1px solid ${REDWOOD.neutral200}`,
                    background: REDWOOD.surface,
                    opacity: 0,
                    animation: `fadeInItem 0.3s ease-out ${index * 0.05}s forwards`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = REDWOOD.neutral100;
                    e.currentTarget.style.borderColor = item.color || REDWOOD.taskBlue;
                    e.currentTarget.style.transform = 'translateX(-4px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = REDWOOD.surface;
                    e.currentTarget.style.borderColor = REDWOOD.neutral200;
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <div style={{
                    width: 46,
                    height: 46,
                    borderRadius: 12,
                    background: `${item.color || REDWOOD.taskBlue}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: item.color || REDWOOD.taskBlue,
                    fontSize: 22,
                    flexShrink: 0,
                  }}>
                    {item.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <Text strong style={{ display: 'block', color: REDWOOD.neutral900, fontSize: 15 }}>
                      {item.label}
                    </Text>
                    {item.description && (
                      <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.4 }}>
                        {item.description}
                      </Text>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {activePanel === 'reports' && (
          <div
            style={{
              position: 'fixed',
              right: 0,
              top: 0,
              bottom: 0,
              width: 400,
              background: REDWOOD.surface,
              boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
              overflow: 'hidden',
              animation: isClosing ? 'slideOut 0.25s ease-in forwards' : 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              zIndex: 1001,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{
              padding: '20px 24px',
              background: REDWOOD.reportGreen,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0,
            }}>
              <Text strong style={{ color: '#fff', fontSize: 18 }}>Reports</Text>
              <CloseOutlined
                style={{ color: '#fff', cursor: 'pointer', fontSize: 16, padding: 8 }}
                onClick={closePanel}
              />
            </div>
            <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
              {reportMenuItems.map((item, index) => (
                <div
                  key={item.key}
                  onClick={() => handleMenuItemClick(item.key, item.path)}
                  style={{
                    padding: '16px 20px',
                    borderRadius: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    transition: 'all 0.2s ease',
                    marginBottom: 8,
                    border: `1px solid ${REDWOOD.neutral200}`,
                    background: REDWOOD.surface,
                    opacity: 0,
                    animation: `fadeInItem 0.3s ease-out ${index * 0.05}s forwards`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = REDWOOD.neutral100;
                    e.currentTarget.style.borderColor = item.color || REDWOOD.reportGreen;
                    e.currentTarget.style.transform = 'translateX(-4px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = REDWOOD.surface;
                    e.currentTarget.style.borderColor = REDWOOD.neutral200;
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <div style={{
                    width: 46,
                    height: 46,
                    borderRadius: 12,
                    background: `${item.color || REDWOOD.reportGreen}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: item.color || REDWOOD.reportGreen,
                    fontSize: 22,
                    flexShrink: 0,
                  }}>
                    {item.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <Text strong style={{ display: 'block', color: REDWOOD.neutral900, fontSize: 15 }}>
                      {item.label}
                    </Text>
                    {item.description && (
                      <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.4 }}>
                        {item.description}
                      </Text>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes slideOut {
          from { transform: translateX(0); }
          to { transform: translateX(100%); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes fadeInItem {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {/* Autopilot */}
      <Autopilot />
    </Layout>
  );
};

export default ManageJournals;
