import React, { useState, useRef, useEffect } from 'react';
import { Layout, Typography, Card, Breadcrumb, Space, Tooltip, Row, Col, Statistic, Input, Select, Button, Form, DatePicker, Spin, Tag } from 'antd';
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
  StopOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import Autopilot from '../../components/Autopilot';
import FloatingMenu from '../../components/FloatingMenu';
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

// Invoice task items
const invoiceTaskItems: MenuItemType[] = [
  { key: 'create-invoice', icon: <FileAddOutlined />, label: 'Create Invoice', description: 'Create new supplier invoice', color: REDWOOD.taskBlue, path: '/ap/manage-invoices' },
  { key: 'create-invoice-spreadsheet', icon: <ImportOutlined />, label: 'Create Invoice from Spreadsheet', description: 'Import invoices from file', color: REDWOOD.info },
  { key: 'create-recurring', icon: <ScheduleOutlined />, label: 'Create Recurring Invoices', description: 'Set up recurring invoices', color: REDWOOD.success },
  { key: 'manage-invoices', icon: <FileTextOutlined />, label: 'Manage Invoices', description: 'Search and manage invoices', color: REDWOOD.primary, path: '/ap/manage-invoices' },
  { key: 'prepayment-applications', icon: <SwapOutlined />, label: 'Prepayment Applications', description: 'Apply and manage prepayment applications', color: REDWOOD.success, path: '/ap/prepayment-applications' },
  { key: 'apply-conversion-rates', icon: <SwapOutlined />, label: 'Apply Missing Conversion Rates', description: 'Update currency rates', color: REDWOOD.warning },
  { key: 'validate-invoices', icon: <CheckCircleOutlined />, label: 'Validate Invoices', description: 'Validate invoice entries', color: REDWOOD.success },
  { key: 'initiate-approval', icon: <AuditOutlined />, label: 'Initiate Approval Workflow', description: 'Start approval process', color: REDWOOD.info },
  { key: 'import-invoices', icon: <ImportOutlined />, label: 'Import Invoices', description: 'Batch import invoices', color: REDWOOD.taskBlue },
  { key: 'correct-import-errors', icon: <ExceptionOutlined />, label: 'Correct Import Errors', description: 'Fix import issues', color: REDWOOD.primary },
  { key: 'payables-exceptions', icon: <WarningOutlined />, label: 'Run Payables Exceptions Listing', description: 'Review exceptions', color: REDWOOD.warning },
];

// Accounting task items
const accountingTaskItems: MenuItemType[] = [
  { key: 'create-accounting', icon: <BookOutlined />, label: 'Create Accounting', description: 'Generate accounting entries', color: REDWOOD.taskBlue, path: '/ap/create-accounting' },
  { key: 'sla-journals', icon: <FileSearchOutlined />, label: 'Manage Subledger Journals', description: 'Review SLA journal entries and lines', color: REDWOOD.success, path: '/ap/sla-journals' },
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

// Setup & Maintenance items
const setupItems: MenuItemType[] = [
  { key: 'banks', icon: <BankOutlined />, label: 'Banks', description: 'Manage banks, branches & accounts', color: REDWOOD.info, path: '/ap/banks' },
  { key: 'suppliers', icon: <FileTextOutlined />, label: 'Suppliers', description: 'Manage supplier master data', color: REDWOOD.success, path: '/ap/suppliers' },
  { key: 'payment-terms', icon: <CalendarOutlined />, label: 'Payment Terms', description: 'Configure payment terms', color: REDWOOD.warning },
  { key: 'payment-methods', icon: <CreditCardOutlined />, label: 'Payment Methods', description: 'Setup payment methods', color: REDWOOD.primary },
  { key: 'invoice-holds', icon: <StopOutlined />, label: 'Manage Invoice Holds', description: 'View and manage invoice hold codes', color: REDWOOD.primaryDark, path: '/ap/invoice-holds' },
];

// Payment task items
const paymentTaskItems: MenuItemType[] = [
  { key: 'manage-payments', icon: <DollarOutlined />, label: 'Manage Payments', description: 'Search and manage payments', color: REDWOOD.taskBlue, path: '/ap/manage-payments' },
  { key: 'manage-bank-transfers',    icon: <SwapOutlined />,    label: 'Manage Bank Account Transfers', description: 'Create and manage interbank fund transfers',    color: REDWOOD.info,    path: '/ap/bank-transfers' },
  { key: 'manage-external-txns',    icon: <FileTextOutlined />, label: 'Manage External Transactions',  description: 'Search and create external cash transactions',  color: REDWOOD.success, path: '/ap/external-transactions' },
  { key: 'submit-payment-request', icon: <SendOutlined />, label: 'Submit Payment Process Request', description: 'Initiate payment run', color: REDWOOD.info, path: '/ap/submit-payment' },
  { key: 'manage-payment-templates', icon: <SettingOutlined />, label: 'Manage Payment Process Request Templates', description: 'Configure templates', color: REDWOOD.success },
  { key: 'create-payment', icon: <CreditCardOutlined />, label: 'Create Payment', description: 'Create single payment', color: REDWOOD.primary, path: '/ap/create-payment' },
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

interface KpiData {
  pendingInvoices: number;
  approvedInvoices: number;
  pendingPayments: number;
  overduePayments: number;
  totalPayables: number;
  lastSync: string;
}

const DEFAULT_KPI: KpiData = {
  pendingInvoices: 0,
  approvedInvoices: 0,
  pendingPayments: 0,
  overduePayments: 0,
  totalPayables: 0,
  lastSync: '—',
};

const APModule: React.FC = () => {
  const navigate = useNavigate();
  const [kpi, setKpi] = useState<KpiData>(DEFAULT_KPI);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [businessUnits, setBusinessUnits] = useState<string[]>([]);
  const [selectedBU, setSelectedBU] = useState<string>('');   // '' = All

  // Fetch BU list once on mount
  useEffect(() => {
    fetch(`${APEX_DB_CONFIG.baseUrl}/gl/businessunits`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const items: any[] = Array.isArray(data) ? data : (data.items || []);
        setBusinessUnits(items.map((i: any) => i.business_unit_name || '').filter(Boolean));
      })
      .catch(() => {});
  }, []);

  // Fetch stats whenever selectedBU changes
  useEffect(() => {
    const fetchStats = async () => {
      setKpiLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedBU) params.set('P_BUSINESS_UNIT', selectedBU);
        const qs = params.toString();
        const url = `${APEX_DB_CONFIG.baseUrl}/ap/invoices/stats${qs ? '?' + qs : ''}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!text.trim()) throw new Error('empty');
        const data = JSON.parse(text);
        const d = Array.isArray(data?.items) && data.items.length > 0 ? data.items[0] : data;
        setKpi({
          pendingInvoices:  Number(d.pending_invoices  ?? 0),
          approvedInvoices: Number(d.approved_invoices ?? 0),
          pendingPayments:  Number(d.pending_payments  ?? 0),
          overduePayments:  Number(d.overdue_payments  ?? 0),
          totalPayables:    Number(d.total_outstanding ?? 0),
          lastSync: d.last_sync_date
            ? new Date(d.last_sync_date).toLocaleString()
            : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
      } catch {
        setKpi({ ...DEFAULT_KPI, lastSync: 'Unavailable' });
      } finally {
        setKpiLoading(false);
      }
    };
    fetchStats();
  }, [selectedBU]);

  const handleMenuItemClick = (key: string, path?: string) => {
    if (key === 'create-invoice') {
      navigate('/ap/manage-invoices', { state: { quickCreate: true } });
      return;
    }
    if (path) {
      navigate(path);
    }
  };

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

  // Menu Card Component — shows green "Implemented" badge when the feature has a path
  const MenuCard = ({ item }: { item: MenuItemType }) => (
    <Card
      hoverable={!!item.path}
      onClick={() => handleMenuItemClick(item.key, item.path)}
      style={{
        borderRadius: 12,
        border: item.path ? `1px solid ${REDWOOD.success}30` : `1px solid ${REDWOOD.neutral200}`,
        cursor: item.path ? 'pointer' : 'default',
        transition: 'all 0.3s ease',
        height: '100%',
        position: 'relative',
        opacity: item.path ? 1 : 0.72,
      }}
      bodyStyle={{ padding: 20 }}
    >
      {item.path && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          background: REDWOOD.success, color: '#fff',
          borderRadius: '50%', width: 18, height: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11,
        }}>
          <CheckCircleOutlined style={{ fontSize: 11 }} />
        </div>
      )}
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
          <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            {/* Business Unit filter */}
            <Space>
              <Text type="secondary" style={{ fontSize: 13 }}>Business Unit:</Text>
              <Select
                value={selectedBU || 'all'}
                onChange={v => setSelectedBU(v === 'all' ? '' : v)}
                style={{ width: 260 }}
                showSearch
                filterOption={(input, option) =>
                  String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())
                }
              >
                <Select.Option value="all">All Business Units</Select.Option>
                {businessUnits.map(bu => (
                  <Select.Option key={bu} value={bu}>{bu}</Select.Option>
                ))}
              </Select>
            </Space>
          </div>

          {/* KPI Cards Row */}
          <Spin spinning={kpiLoading}>
            <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
              <Col xs={24} sm={12} lg={6}>
                <KpiCard title="Pending Invoices"  value={kpi.pendingInvoices}  icon={<ClockCircleOutlined />} color={REDWOOD.warning} />
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <KpiCard title="Approved Invoices" value={kpi.approvedInvoices} icon={<CheckCircleOutlined />}  color={REDWOOD.success} />
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <KpiCard title="Pending Payments"  value={kpi.pendingPayments}  icon={<CreditCardOutlined />}  color={REDWOOD.info} />
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <KpiCard title="Overdue Payments"  value={kpi.overduePayments}  icon={<WarningOutlined />}     color={REDWOOD.primary} />
              </Col>
            </Row>

            {/* Total Payables and Last Sync */}
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
                    ${kpi.totalPayables.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
                    <Text type="secondary">{kpi.lastSync}</Text>
                  </div>
                  <Button
                    icon={<SyncOutlined />}
                    onClick={() => { setKpiLoading(true); setKpi(DEFAULT_KPI); setTimeout(() => window.location.reload(), 100); }}
                  >
                    Sync Now
                  </Button>
                </Card>
              </Col>
            </Row>
          </Spin>

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

          {/* Setup & Maintenance Section */}
          <div style={{ marginBottom: 32 }}>
            <SectionTitle icon={<SettingOutlined />} title="Setup & Maintenance" color={REDWOOD.neutral600} />
            <Row gutter={[16, 16]}>
              {setupItems.map((item) => (
                <Col xs={24} sm={12} lg={8} xl={6} key={item.key}>
                  <MenuCard item={item} />
                </Col>
              ))}
            </Row>
          </div>
        </div>

      </Content>

      {/* Autopilot Assistant */}
      <Autopilot module="ap" />
      <FloatingMenu />
    </Layout>
  );
};

export default APModule;
