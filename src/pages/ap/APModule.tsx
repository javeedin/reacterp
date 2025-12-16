import React, { useState, useRef, useEffect } from 'react';
import { Layout, Typography, Card, Breadcrumb, Space, Tooltip, Row, Col, Statistic, Progress, Input, Select, Button, Form, DatePicker } from 'antd';
import {
  HomeOutlined,
  FileTextOutlined,
  CheckSquareOutlined,
  BarChartOutlined,
  SearchOutlined,
  SwapOutlined,
  ReconciliationOutlined,
  BookOutlined,
  CalendarOutlined,
  DollarOutlined,
  PieChartOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  CloseOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  WarningOutlined,
  BankOutlined,
  CreditCardOutlined,
  FileDoneOutlined,
  FileAddOutlined,
  ImportOutlined,
  AuditOutlined,
  SendOutlined,
  PrinterOutlined,
  SafetyOutlined,
  FileSearchOutlined,
  ScheduleOutlined,
  ExceptionOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
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
  taskBlue: '#0572CE',
  reportGreen: '#1D7B4D',
  searchPurple: '#6B4C9A',
  matchOrange: '#D4A800',
};

// Menu item type
interface MenuItemType {
  key: string;
  icon: React.ReactNode;
  label: string;
  description?: string;
  color?: string;
  path?: string;
}

// Section type for grouped items
interface TaskSection {
  title: string;
  items: MenuItemType[];
}

// Invoice task items
const invoiceTaskItems: MenuItemType[] = [
  { key: 'create-invoice', icon: <FileAddOutlined />, label: 'Create Invoice', description: 'Create new supplier invoice', color: REDWOOD.taskBlue, path: '/ap/create-invoice' },
  { key: 'create-invoice-spreadsheet', icon: <ImportOutlined />, label: 'Create Invoice from Spreadsheet', description: 'Import invoices from file', color: REDWOOD.info },
  { key: 'create-recurring', icon: <ScheduleOutlined />, label: 'Create Recurring Invoices', description: 'Set up recurring invoices', color: REDWOOD.success },
  { key: 'manage-invoices', icon: <FileTextOutlined />, label: 'Manage Invoices', description: 'Search and manage invoices', color: REDWOOD.primary, path: '/ap/manage-invoices' },
  { key: 'apply-conversion-rates', icon: <SwapOutlined />, label: 'Apply Missing Conversion Rates', description: 'Update currency rates', color: REDWOOD.warning },
  { key: 'validate-invoices', icon: <CheckCircleOutlined />, label: 'Validate Invoices', description: 'Validate invoice entries', color: REDWOOD.success },
  { key: 'initiate-approval', icon: <AuditOutlined />, label: 'Initiate Approval Workflow', description: 'Start approval process', color: REDWOOD.info },
  { key: 'import-invoices', icon: <ImportOutlined />, label: 'Import Invoices', description: 'Batch import invoices', color: REDWOOD.taskBlue },
  { key: 'correct-import-errors', icon: <ExceptionOutlined />, label: 'Correct Import Errors', description: 'Fix import issues', color: REDWOOD.primary },
  { key: 'payables-exceptions', icon: <WarningOutlined />, label: 'Run Payables Exceptions Listing', description: 'Review exceptions', color: REDWOOD.warning },
];

// Accounting task items
const accountingTaskItems: MenuItemType[] = [
  { key: 'create-accounting', icon: <BookOutlined />, label: 'Create Accounting', description: 'Generate accounting entries', color: REDWOOD.taskBlue },
  { key: 'create-adjustment', icon: <ReconciliationOutlined />, label: 'Create Adjustment Journal', description: 'Create adjustments', color: REDWOOD.info },
  { key: 'review-journal-entries', icon: <FileSearchOutlined />, label: 'Review Journal Entries', description: 'Review posted journals', color: REDWOOD.success },
  { key: 'payables-reconciliation', icon: <ReconciliationOutlined />, label: 'Payables to Ledger Reconciliation', description: 'Reconcile with GL', color: REDWOOD.warning },
];

// Assets task items
const assetsTaskItems: MenuItemType[] = [
  { key: 'create-mass-additions', icon: <PieChartOutlined />, label: 'Create Mass Additions', description: 'Add assets in bulk', color: REDWOOD.primary },
];

// Payables Periods task items
const periodsTaskItems: MenuItemType[] = [
  { key: 'manage-periods', icon: <CalendarOutlined />, label: 'Manage Accounting Periods', description: 'Open/close periods', color: REDWOOD.info },
];

// Payment task items
const paymentTaskItems: MenuItemType[] = [
  { key: 'submit-payment-request', icon: <SendOutlined />, label: 'Submit Payment Process Request', description: 'Initiate payment run', color: REDWOOD.taskBlue, path: '/ap/submit-payment' },
  { key: 'manage-payment-requests', icon: <FileTextOutlined />, label: 'Manage Payment Process Requests', description: 'View payment requests', color: REDWOOD.info },
  { key: 'manage-payment-templates', icon: <SettingOutlined />, label: 'Manage Payment Process Request Templates', description: 'Configure templates', color: REDWOOD.success },
  { key: 'create-payment', icon: <CreditCardOutlined />, label: 'Create Payment', description: 'Create single payment', color: REDWOOD.primary, path: '/ap/create-payment' },
  { key: 'manage-payments', icon: <DollarOutlined />, label: 'Manage Payments', description: 'Search and manage payments', color: REDWOOD.warning, path: '/ap/manage-payments' },
  { key: 'create-electronic-files', icon: <FileDoneOutlined />, label: 'Create Electronic Payment Files', description: 'Generate EFT files', color: REDWOOD.taskBlue },
  { key: 'create-printed-files', icon: <PrinterOutlined />, label: 'Create Printed Payment Files', description: 'Generate check files', color: REDWOOD.info },
  { key: 'manage-payment-files', icon: <FolderOutlined />, label: 'Manage Payment Files', description: 'View payment files', color: REDWOOD.success },
  { key: 'apply-payment-rates', icon: <SwapOutlined />, label: 'Apply Missing Conversion Rates', description: 'Update currency rates', color: REDWOOD.warning },
  { key: 'create-positive-pay', icon: <SafetyOutlined />, label: 'Create Positive Pay File', description: 'Generate positive pay', color: REDWOOD.primary },
  { key: 'send-remittance', icon: <SendOutlined />, label: 'Send Separate Remittance Advice', description: 'Email remittance', color: REDWOOD.taskBlue },
  { key: 'regulatory-reporting', icon: <AuditOutlined />, label: 'Create Regulatory Reporting', description: 'Generate reports', color: REDWOOD.info },
  { key: 'payment-letter', icon: <FileTextOutlined />, label: 'Payment File Accompanying Letter', description: 'Create cover letters', color: REDWOOD.success },
  { key: 'retrieve-acknowledgments', icon: <CheckCircleOutlined />, label: 'Retrieve Disbursement Acknowledgments', description: 'Get bank responses', color: REDWOOD.warning },
];

// Report menu items
const reportMenuItems: MenuItemType[] = [
  { key: 'my-folders', icon: <FolderOutlined />, label: 'My Folders', description: 'Personal report folders', color: REDWOOD.reportGreen },
  { key: 'shared-reports', icon: <FolderOpenOutlined />, label: 'Shared Reports and Analytics', description: 'Team reports', color: REDWOOD.info },
];

// AP KPI Data (mock)
const apKpiData = {
  pendingInvoices: { value: 48, trend: 'up', change: 12 },
  approvedInvoices: { value: 234, trend: 'up', change: 8 },
  pendingPayments: { value: 15, trend: 'down', change: 5 },
  overduePayments: { value: 3, trend: 'down', change: 2 },
  totalPayables: 1245678.90,
  periodProgress: 72,
  lastSync: '30 minutes ago',
};

const APModule: React.FC = () => {
  const navigate = useNavigate();
  const [activePanel, setActivePanel] = useState<'none' | 'tasks' | 'search' | 'reports' | 'match'>('none');
  const [isClosing, setIsClosing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [selectedTaskSection, setSelectedTaskSection] = useState<string>('invoices');
  const panelRef = useRef<HTMLDivElement>(null);
  const floatingIconsRef = useRef<HTMLDivElement>(null);
  const [searchForm] = Form.useForm();
  const [matchForm] = Form.useForm();

  // Task sections for dropdown
  const taskSections = [
    { key: 'invoices', label: 'Invoices', items: invoiceTaskItems },
    { key: 'accounting', label: 'Accounting', items: accountingTaskItems },
    { key: 'assets', label: 'Assets', items: assetsTaskItems },
    { key: 'periods', label: 'Payables Periods', items: periodsTaskItems },
    { key: 'payments', label: 'Payments', items: paymentTaskItems },
  ];

  // Get current section items
  const getCurrentSectionItems = () => {
    const section = taskSections.find(s => s.key === selectedTaskSection);
    return section?.items || [];
  };

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const isOutsidePanel = panelRef.current && !panelRef.current.contains(target);
      const isOutsideFloatingIcons = floatingIconsRef.current && !floatingIconsRef.current.contains(target);

      // Check if click is on a dropdown portal (Ant Design dropdowns render in portals)
      const isDropdownClick = target.closest('.ant-select-dropdown') ||
                              target.closest('.ant-picker-dropdown') ||
                              target.closest('.ant-dropdown');

      if (isOutsidePanel && isOutsideFloatingIcons && !isDropdownClick) {
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

  const handleMenuItemClick = (key: string, path?: string) => {
    setSelectedItem(key);
    closePanel();
    if (path) {
      navigate(path);
    }
  };

  const togglePanel = (panel: 'tasks' | 'search' | 'reports' | 'match') => {
    if (activePanel === panel) {
      closePanel();
    } else {
      setIsClosing(false);
      setActivePanel(panel);
    }
  };

  // Get panel width based on active panel
  const getPanelWidth = () => {
    if (activePanel === 'match') return 360;
    if (activePanel === 'tasks') return 320;
    if (activePanel === 'search') return 320;
    if (activePanel === 'reports') return 320;
    return 0;
  };

  // Floating Action Button - connected to panel
  const FloatingIcon = ({
    icon,
    label,
    color,
    isActive,
    onClick,
    position,
    panelOpen
  }: {
    icon: React.ReactNode;
    label: string;
    color: string;
    isActive: boolean;
    onClick: () => void;
    position: 'first' | 'middle' | 'last';
    panelOpen: boolean;
  }) => {
    // When panel is open, icons connect to panel edge (rounded only on left)
    const getBorderRadius = () => {
      if (panelOpen) {
        if (position === 'first') return '8px 0 0 0';
        if (position === 'last') return '0 0 0 8px';
        return '0';
      } else {
        if (position === 'first') return '8px 8px 0 0';
        if (position === 'last') return '0 0 8px 8px';
        return '0';
      }
    };

    return (
      <Tooltip title={!isActive ? label : ''} placement="left">
        <div
          onClick={onClick}
          style={{
            width: 40,
            height: 40,
            borderRadius: getBorderRadius(),
            background: isActive ? color : REDWOOD.surface,
            border: `2px solid ${panelOpen ? REDWOOD.neutral200 : color}`,
            borderBottom: position !== 'last' ? 'none' : `2px solid ${panelOpen ? REDWOOD.neutral200 : color}`,
            borderTop: position !== 'first' ? 'none' : `2px solid ${panelOpen ? REDWOOD.neutral200 : color}`,
            borderRight: panelOpen ? 'none' : `2px solid ${color}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            boxShadow: isActive ? `0 4px 12px ${color}40` : (panelOpen ? 'none' : '0 2px 8px rgba(0,0,0,0.1)'),
            color: isActive ? '#fff' : color,
            fontSize: 18,
          }}
        >
          {icon}
        </div>
      </Tooltip>
    );
  };

  // Tasks Slide Panel with dropdown filter
  const TasksSlidePanel = () => (
    <div
      style={{
        position: 'fixed',
        right: 0,
        top: 64,
        bottom: 0,
        width: 320,
        background: REDWOOD.surface,
        boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
        overflow: 'hidden',
        animation: isClosing ? 'slideOut 0.25s ease-in forwards' : 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        zIndex: 1001,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Panel Header */}
      <div style={{
        padding: '10px 14px',
        background: REDWOOD.taskBlue,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <Text strong style={{ color: '#fff', fontSize: 14 }}>Tasks</Text>
        <CloseOutlined
          style={{ color: '#fff', cursor: 'pointer', fontSize: 14, padding: 4 }}
          onClick={closePanel}
        />
      </div>

      {/* Section Dropdown */}
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
        <Select
          value={selectedTaskSection}
          onChange={setSelectedTaskSection}
          style={{ width: '100%' }}
          size="middle"
        >
          {taskSections.map(section => (
            <Option key={section.key} value={section.key}>{section.label}</Option>
          ))}
        </Select>
      </div>

      {/* Panel Items - filtered by selected section */}
      <div style={{ padding: 10, flex: 1, overflowY: 'auto' }}>
        {getCurrentSectionItems().map((item, index) => (
          <TaskMenuItem key={item.key} item={item} index={index} />
        ))}
      </div>
    </div>
  );

  // Task Menu Item Component
  const TaskMenuItem = ({ item, index }: { item: MenuItemType; index: number }) => (
    <div
      onClick={() => handleMenuItemClick(item.key, item.path)}
      style={{
        padding: '6px 10px',
        borderRadius: 6,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        transition: 'all 0.2s ease',
        marginBottom: 4,
        background: REDWOOD.surface,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = REDWOOD.neutral100;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = REDWOOD.surface;
      }}
    >
      <div style={{
        color: REDWOOD.taskBlue,
        fontSize: 12,
      }}>
        {item.icon}
      </div>
      <Text style={{ fontSize: 12, color: REDWOOD.neutral900 }}>
        {item.label}
      </Text>
    </div>
  );

  // Search Slide Panel
  const SearchSlidePanel = () => (
    <div
      style={{
        position: 'fixed',
        right: 0,
        top: 64,
        bottom: 0,
        width: 320,
        background: REDWOOD.surface,
        boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
        overflow: 'hidden',
        animation: isClosing ? 'slideOut 0.25s ease-in forwards' : 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        zIndex: 1001,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Panel Header */}
      <div style={{
        padding: '10px 14px',
        background: REDWOOD.searchPurple,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <Text strong style={{ color: '#fff', fontSize: 14 }}>Search</Text>
        <CloseOutlined
          style={{ color: '#fff', cursor: 'pointer', fontSize: 14, padding: 4 }}
          onClick={closePanel}
        />
      </div>

      {/* Search Form */}
      <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
          ** At least one is required
        </Text>

        <Form form={searchForm} layout="vertical" size="small">
          <Form.Item
            label={<Text style={{ fontSize: 12 }}><span style={{ color: REDWOOD.primary }}>**</span> Invoice Number</Text>}
            name="invoiceNumber"
          >
            <Input placeholder="Enter invoice number" />
          </Form.Item>

          <Form.Item
            label={<Text style={{ fontSize: 12 }}><span style={{ color: REDWOOD.primary }}>**</span> Supplier or Party</Text>}
            name="supplier"
          >
            <Input placeholder="Search supplier" suffix={<SearchOutlined style={{ color: REDWOOD.neutral300 }} />} />
          </Form.Item>

          <Form.Item
            label={<Text style={{ fontSize: 12 }}>Supplier Site</Text>}
            name="supplierSite"
          >
            <Select placeholder="Select site" allowClear>
              <Option value="site1">Site 1</Option>
              <Option value="site2">Site 2</Option>
              <Option value="site3">Site 3</Option>
            </Select>
          </Form.Item>

          <Form.Item style={{ marginTop: 24, marginBottom: 0 }}>
            <Space>
              <Button type="primary" style={{ background: REDWOOD.neutral600 }}>Search</Button>
              <Button onClick={() => searchForm.resetFields()}>Reset</Button>
            </Space>
          </Form.Item>
        </Form>
      </div>
    </div>
  );

  // Reports Slide Panel
  const ReportsSlidePanel = () => (
    <div
      style={{
        position: 'fixed',
        right: 0,
        top: 64,
        bottom: 0,
        width: 320,
        background: REDWOOD.surface,
        boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
        overflow: 'hidden',
        animation: isClosing ? 'slideOut 0.25s ease-in forwards' : 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        zIndex: 1001,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Panel Header */}
      <div style={{
        padding: '10px 14px',
        background: REDWOOD.reportGreen,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <Space>
          <Button size="small" icon={<FileAddOutlined />} style={{ fontSize: 11 }}>Create</Button>
        </Space>
        <CloseOutlined
          style={{ color: '#fff', cursor: 'pointer', fontSize: 14, padding: 4 }}
          onClick={closePanel}
        />
      </div>

      {/* Reports Tree */}
      <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
        <div style={{ marginBottom: 8 }}>
          <Space>
            <FolderOutlined style={{ color: REDWOOD.matchOrange }} />
            <Text style={{ fontSize: 13, color: REDWOOD.info, cursor: 'pointer' }}>My Folders</Text>
          </Space>
        </div>
        <div>
          <Space>
            <FolderOutlined style={{ color: REDWOOD.matchOrange }} />
            <Text style={{ fontSize: 13, color: REDWOOD.info, cursor: 'pointer' }}>Shared Reports and Analytics</Text>
          </Space>
        </div>
      </div>
    </div>
  );

  // Match in Full Slide Panel
  const MatchSlidePanel = () => (
    <div
      style={{
        position: 'fixed',
        right: 0,
        top: 64,
        bottom: 0,
        width: 360,
        background: REDWOOD.surface,
        boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
        overflow: 'hidden',
        animation: isClosing ? 'slideOut 0.25s ease-in forwards' : 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        zIndex: 1001,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Panel Header */}
      <div style={{
        padding: '10px 14px',
        background: REDWOOD.matchOrange,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <Text strong style={{ color: '#fff', fontSize: 14 }}>Match in Full</Text>
        <CloseOutlined
          style={{ color: '#fff', cursor: 'pointer', fontSize: 14, padding: 4 }}
          onClick={closePanel}
        />
      </div>

      {/* Match Form */}
      <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
        <Title level={5} style={{ marginBottom: 16, textAlign: 'center' }}>Match in Full</Title>

        <Form form={matchForm} layout="horizontal" size="small" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }}>
          <Form.Item
            label={<Text style={{ fontSize: 12 }}><span style={{ color: REDWOOD.primary }}>*</span> Purchase Order</Text>}
            name="purchaseOrder"
            required
          >
            <Input suffix={<SearchOutlined style={{ color: REDWOOD.neutral300 }} />} />
          </Form.Item>

          <Form.Item
            label={<Text style={{ fontSize: 12 }}>Business Unit</Text>}
            name="businessUnit"
          >
            <Input disabled style={{ background: REDWOOD.neutral100 }} />
          </Form.Item>

          <Form.Item
            label={<Text style={{ fontSize: 12 }}>Supplier</Text>}
            name="supplier"
          >
            <Input disabled style={{ background: REDWOOD.neutral100 }} />
          </Form.Item>

          <Form.Item
            label={<Text style={{ fontSize: 12 }}>Site</Text>}
            name="site"
          >
            <Select placeholder="Select site" allowClear>
              <Option value="site1">Site 1</Option>
              <Option value="site2">Site 2</Option>
            </Select>
          </Form.Item>

          <Form.Item
            label={<Text style={{ fontSize: 12 }}>Invoice Number</Text>}
            name="invoiceNumber"
          >
            <Input />
          </Form.Item>

          <Form.Item
            label={<Text style={{ fontSize: 12 }}>Date</Text>}
            name="date"
          >
            <DatePicker format="DD-MMM-YYYY" style={{ width: '100%' }} placeholder="dd-mmm-yyyy" />
          </Form.Item>

          <Form.Item
            label={<Text style={{ fontSize: 12 }}>Total</Text>}
            name="total"
          >
            <Input disabled style={{ background: REDWOOD.neutral100 }} />
          </Form.Item>

          <Form.Item style={{ marginTop: 24, marginBottom: 0 }} wrapperCol={{ offset: 10, span: 14 }}>
            <Space>
              <Button type="primary" style={{ background: REDWOOD.primary }}>Create Invoice</Button>
              <Button onClick={() => matchForm.resetFields()}>Reset</Button>
            </Space>
          </Form.Item>
        </Form>
      </div>
    </div>
  );

  // KPI Card Component
  const KpiCard = ({
    title,
    value,
    icon,
    color,
    trend,
    change,
    suffix,
    prefix,
    isCurrency
  }: {
    title: string;
    value: number;
    icon: React.ReactNode;
    color: string;
    trend?: 'up' | 'down';
    change?: number;
    suffix?: string;
    prefix?: string;
    isCurrency?: boolean;
  }) => (
    <Card
      style={{
        borderRadius: 12,
        border: 'none',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
      bodyStyle={{ padding: 20 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Text type="secondary" style={{ fontSize: 13 }}>{title}</Text>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            {isCurrency ? (
              <Text style={{ fontSize: 24, fontWeight: 600, color: REDWOOD.neutral900 }}>
                {prefix}{value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </Text>
            ) : (
              <Statistic
                value={value}
                suffix={suffix}
                prefix={prefix}
                valueStyle={{ fontSize: 28, fontWeight: 600, color: REDWOOD.neutral900 }}
              />
            )}
            {trend && change && (
              <span style={{
                color: trend === 'up' ? REDWOOD.success : REDWOOD.primary,
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}>
                {trend === 'up' ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                {change}%
              </span>
            )}
          </div>
        </div>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: `${color}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: color,
          fontSize: 24,
        }}>
          {icon}
        </div>
      </div>
    </Card>
  );

  // Menu Card Component
  const MenuCard = ({ item }: { item: MenuItemType }) => (
    <Card
      hoverable
      onClick={() => handleMenuItemClick(item.key, item.path)}
      style={{
        borderRadius: 12,
        border: `1px solid ${REDWOOD.neutral200}`,
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        height: '100%',
      }}
      bodyStyle={{ padding: 20 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: `${item.color || REDWOOD.primary}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: item.color || REDWOOD.primary,
          fontSize: 24,
          flexShrink: 0,
        }}>
          {item.icon}
        </div>
        <div style={{ flex: 1 }}>
          <Text strong style={{ display: 'block', color: REDWOOD.neutral900, fontSize: 15 }}>
            {item.label}
          </Text>
          {item.description && (
            <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.5 }}>
              {item.description}
            </Text>
          )}
        </div>
      </div>
    </Card>
  );

  // Section Title Component
  const SectionTitle = ({ icon, title, color }: { icon: React.ReactNode; title: string; color: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        background: `${color}15`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: color,
        fontSize: 18,
      }}>
        {icon}
      </div>
      <Text strong style={{ fontSize: 18, color: REDWOOD.neutral900 }}>{title}</Text>
    </div>
  );

  // Quick task items for landing page
  const quickInvoiceTasks = invoiceTaskItems.slice(0, 4);
  const quickPaymentTasks = paymentTaskItems.slice(0, 4);

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
              { title: 'Payables' },
            ]}
          />
        </div>

        {/* Main Content Area */}
        <div style={{ padding: 24, paddingRight: 100 }}>
          {/* Page Title */}
          <div style={{ marginBottom: 24 }}>
            <Space align="center">
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                background: `linear-gradient(135deg, ${REDWOOD.info} 0%, ${REDWOOD.taskBlue} 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 4px 12px ${REDWOOD.info}40`,
              }}>
                <BankOutlined style={{ fontSize: 28, color: '#fff' }} />
              </div>
              <div>
                <Title level={2} style={{ margin: 0, color: REDWOOD.neutral900 }}>
                  Payables
                </Title>
                <Text type="secondary">Manage invoices, payments, and supplier transactions</Text>
              </div>
            </Space>
          </div>

          {/* KPI Cards Row */}
          <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
            <Col xs={24} sm={12} lg={6}>
              <KpiCard
                title="Pending Invoices"
                value={apKpiData.pendingInvoices.value}
                icon={<ClockCircleOutlined />}
                color={REDWOOD.warning}
                trend={apKpiData.pendingInvoices.trend as 'up' | 'down'}
                change={apKpiData.pendingInvoices.change}
              />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <KpiCard
                title="Approved Invoices"
                value={apKpiData.approvedInvoices.value}
                icon={<CheckCircleOutlined />}
                color={REDWOOD.success}
                trend={apKpiData.approvedInvoices.trend as 'up' | 'down'}
                change={apKpiData.approvedInvoices.change}
              />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <KpiCard
                title="Pending Payments"
                value={apKpiData.pendingPayments.value}
                icon={<CreditCardOutlined />}
                color={REDWOOD.info}
                trend={apKpiData.pendingPayments.trend as 'up' | 'down'}
                change={apKpiData.pendingPayments.change}
              />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <KpiCard
                title="Overdue Payments"
                value={apKpiData.overduePayments.value}
                icon={<WarningOutlined />}
                color={REDWOOD.primary}
                trend={apKpiData.overduePayments.trend as 'up' | 'down'}
                change={apKpiData.overduePayments.change}
              />
            </Col>
          </Row>

          {/* Total Payables and Period Progress */}
          <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
            <Col xs={24} lg={12}>
              <Card
                style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                bodyStyle={{ padding: 20 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text strong style={{ fontSize: 15 }}>Total Outstanding Payables</Text>
                  <Text type="secondary">Current Period</Text>
                </div>
                <Text style={{ fontSize: 32, fontWeight: 600, color: REDWOOD.neutral900 }}>
                  ${apKpiData.totalPayables.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Text>
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card
                style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', height: '100%' }}
                bodyStyle={{ padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <div>
                  <Text strong style={{ fontSize: 15, display: 'block' }}>Last Data Sync</Text>
                  <Text type="secondary">{apKpiData.lastSync}</Text>
                </div>
                <Link to="/sync">
                  <div style={{
                    padding: '10px 20px',
                    background: REDWOOD.surface,
                    border: `1px solid ${REDWOOD.neutral200}`,
                    borderRadius: 8,
                    color: REDWOOD.neutral600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}>
                    <SyncOutlined />
                    <span>Sync Now</span>
                  </div>
                </Link>
              </Card>
            </Col>
          </Row>

          {/* Invoice Tasks Section */}
          <div style={{ marginBottom: 32 }}>
            <SectionTitle icon={<FileTextOutlined />} title="Invoice Tasks" color={REDWOOD.taskBlue} />
            <Row gutter={[16, 16]}>
              {quickInvoiceTasks.map((item) => (
                <Col xs={24} sm={12} lg={8} xl={6} key={item.key}>
                  <MenuCard item={item} />
                </Col>
              ))}
            </Row>
          </div>

          {/* Payment Tasks Section */}
          <div style={{ marginBottom: 32 }}>
            <SectionTitle icon={<CreditCardOutlined />} title="Payment Tasks" color={REDWOOD.success} />
            <Row gutter={[16, 16]}>
              {quickPaymentTasks.map((item) => (
                <Col xs={24} sm={12} lg={8} xl={6} key={item.key}>
                  <MenuCard item={item} />
                </Col>
              ))}
            </Row>
          </div>

          {/* Accounting Tasks Section */}
          <div style={{ marginBottom: 32 }}>
            <SectionTitle icon={<BookOutlined />} title="Accounting" color={REDWOOD.info} />
            <Row gutter={[16, 16]}>
              {accountingTaskItems.map((item) => (
                <Col xs={24} sm={12} lg={8} xl={6} key={item.key}>
                  <MenuCard item={item} />
                </Col>
              ))}
            </Row>
          </div>
        </div>

        {/* Floating Connected Icons - 4 icons */}
        <div
          ref={floatingIconsRef}
          style={{
            position: 'fixed',
            right: activePanel !== 'none' && !isClosing ? getPanelWidth() : 24,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 1002,
            display: 'flex',
            flexDirection: 'column',
            transition: 'right 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Tasks Icon */}
          <FloatingIcon
            icon={<CheckSquareOutlined />}
            label="Tasks"
            color={REDWOOD.taskBlue}
            isActive={activePanel === 'tasks'}
            onClick={() => togglePanel('tasks')}
            position="first"
            panelOpen={activePanel !== 'none' && !isClosing}
          />

          {/* Search Icon */}
          <FloatingIcon
            icon={<SearchOutlined />}
            label="Search"
            color={REDWOOD.searchPurple}
            isActive={activePanel === 'search'}
            onClick={() => togglePanel('search')}
            position="middle"
            panelOpen={activePanel !== 'none' && !isClosing}
          />

          {/* Reports Icon */}
          <FloatingIcon
            icon={<BarChartOutlined />}
            label="Reports"
            color={REDWOOD.reportGreen}
            isActive={activePanel === 'reports'}
            onClick={() => togglePanel('reports')}
            position="middle"
            panelOpen={activePanel !== 'none' && !isClosing}
          />

          {/* Match in Full Icon */}
          <FloatingIcon
            icon={<ReconciliationOutlined />}
            label="Match in Full"
            color={REDWOOD.matchOrange}
            isActive={activePanel === 'match'}
            onClick={() => togglePanel('match')}
            position="last"
            panelOpen={activePanel !== 'none' && !isClosing}
          />
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
          {activePanel === 'tasks' && <TasksSlidePanel />}
          {activePanel === 'search' && <SearchSlidePanel />}
          {activePanel === 'reports' && <ReportsSlidePanel />}
          {activePanel === 'match' && <MatchSlidePanel />}
        </div>
      </Content>

      {/* Autopilot Assistant */}
      <Autopilot />

      {/* CSS Animations */}
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        @keyframes slideOut {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(100%);
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes fadeOut {
          from {
            opacity: 1;
          }
          to {
            opacity: 0;
          }
        }
      `}</style>
    </Layout>
  );
};

export default APModule;
