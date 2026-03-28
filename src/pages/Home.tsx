import React, { useState, useRef, useEffect } from 'react';
import { Card, Row, Col, Typography, Space, Progress, Divider, Tooltip } from 'antd';
import {
  AccountBookOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  ProjectOutlined,
  BarChartOutlined,
  SettingOutlined,
  DollarOutlined,
  InboxOutlined,
  TruckOutlined,
  ToolOutlined,
  SyncOutlined,
  StockOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  BankOutlined,
  AppstoreOutlined,
  CloseOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { Module } from '../types';
import Autopilot from '../components/Autopilot';

const { Title, Text } = Typography;

// Oracle Redwood Color Palette
const REDWOOD = {
  primary: '#C74634',
  primaryLight: '#E85D4A',
  success: '#1D7B4D',
  warning: '#D4A800',
  info: '#0572CE',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral600: '#6B6B6B',
  neutral900: '#1A1A1A',
  surface: '#FFFFFF',
  moduleOrange: '#FA8C16',
};

// KPI Data (placeholder - will be replaced with API calls)
const kpiData = {
  revenue: { value: 0, change: 0, label: 'Total Revenue', prefix: '$' },
  expenses: { value: 0, change: 0, label: 'Total Expenses', prefix: '$' },
  receivables: { value: 0, label: 'Open Receivables', prefix: '$' },
  payables: { value: 0, label: 'Open Payables', prefix: '$' },
  pendingJournals: { value: 0, label: 'Pending Journals' },
  openPOs: { value: 0, label: 'Open POs' },
};

const modules: Module[] = [
  {
    id: 'gl',
    name: 'General Ledger',
    description: 'Chart of Accounts, Journal Entries, Financial Reports',
    icon: <AccountBookOutlined style={{ fontSize: 32 }} />,
    path: '/gl',
    color: REDWOOD.primary,
  },
  {
    id: 'ap',
    name: 'Accounts Payable',
    description: 'Vendor Management, Invoices, Payments',
    icon: <DollarOutlined style={{ fontSize: 32 }} />,
    path: '/ap',
    color: REDWOOD.success,
  },
  {
    id: 'cash',
    name: 'Cash Management',
    description: 'Bank Transfers, Reconciliation, Cash Position',
    icon: <BankOutlined style={{ fontSize: 32 }} />,
    path: '/cash',
    color: '#0572CE',
  },
  {
    id: 'ar',
    name: 'Accounts Receivable',
    description: 'Customer Management, Billing, Collections',
    icon: <ShoppingCartOutlined style={{ fontSize: 32 }} />,
    path: '/ar',
    color: '#fa8c16',
  },
  {
    id: 'inventory',
    name: 'Inventory',
    description: 'Items, Stock Management, Warehouses',
    icon: <InboxOutlined style={{ fontSize: 32 }} />,
    path: '/inventory',
    color: '#722ed1',
  },
  {
    id: 'procurement',
    name: 'Procurement',
    description: 'Purchase Orders, Requisitions, Suppliers',
    icon: <TruckOutlined style={{ fontSize: 32 }} />,
    path: '/procurement',
    color: '#13c2c2',
  },
  {
    id: 'hr',
    name: 'Human Resources',
    description: 'Employees, Payroll, Leave Management',
    icon: <TeamOutlined style={{ fontSize: 32 }} />,
    path: '/hr',
    color: '#eb2f96',
  },
  {
    id: 'pms',
    name: 'Portfolio Management',
    description: 'Watchlists, Portfolio Tracking, Stock Monitoring',
    icon: <StockOutlined style={{ fontSize: 32 }} />,
    path: '/pms',
    color: '#6B4C9A',
  },
  {
    id: 'projects',
    name: 'Projects',
    description: 'Project Planning, Tasks, Time & Expense',
    icon: <ProjectOutlined style={{ fontSize: 32 }} />,
    path: '/projects',
    color: '#faad14',
  },
  {
    id: 'manufacturing',
    name: 'Manufacturing',
    description: 'BOM, Work Orders, Production',
    icon: <ToolOutlined style={{ fontSize: 32 }} />,
    path: '/manufacturing',
    color: '#f5222d',
  },
  {
    id: 'reports',
    name: 'Reports & Analytics',
    description: 'Dashboards, KPIs, Business Intelligence',
    icon: <BarChartOutlined style={{ fontSize: 32 }} />,
    path: '/reports',
    color: REDWOOD.info,
  },
  {
    id: 'admin',
    name: 'Administration',
    description: 'Users, Roles, System Settings',
    icon: <SettingOutlined style={{ fontSize: 32 }} />,
    path: '/admin',
    color: '#595959',
  },
  {
    id: 'rm',
    name: 'Rental Management',
    description: 'Agreements, Tenants, Installments, Revenue Split — Dubai',
    icon: <KeyOutlined style={{ fontSize: 32 }} />,
    path: '/rm',
    color: '#0B6E6E',
  },
  {
    id: 'sync',
    name: 'Sync Data',
    description: 'Sync data from Oracle Fusion ERP',
    icon: <SyncOutlined style={{ fontSize: 32 }} />,
    path: '/sync',
    color: REDWOOD.info,
  },
];

// KPI Card Component
const KPICard = ({
  icon,
  label,
  value,
  prefix = '',
  suffix = '',
  change,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  change?: number;
  color: string;
}) => (
  <Card
    style={{
      borderRadius: 12,
      border: `1px solid ${REDWOOD.neutral200}`,
      height: '100%',
    }}
    styles={{ body: { padding: 20 } }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div>
        <Text type="secondary" style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </Text>
        <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.neutral900, marginTop: 4 }}>
          {prefix}{value.toLocaleString()}{suffix}
        </div>
        {change !== undefined && (
          <Space style={{ marginTop: 8 }}>
            {change >= 0 ? (
              <ArrowUpOutlined style={{ color: REDWOOD.success, fontSize: 12 }} />
            ) : (
              <ArrowDownOutlined style={{ color: REDWOOD.primary, fontSize: 12 }} />
            )}
            <Text style={{ color: change >= 0 ? REDWOOD.success : REDWOOD.primary, fontSize: 13 }}>
              {Math.abs(change)}% vs last month
            </Text>
          </Space>
        )}
      </div>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: `${color}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: color,
          fontSize: 22,
        }}
      >
        {icon}
      </div>
    </div>
  </Card>
);

// Quick Action Card
const QuickActionCard = ({
  icon,
  label,
  count,
  color,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: string;
  onClick?: () => void;
}) => (
  <Card
    hoverable
    onClick={onClick}
    style={{
      borderRadius: 12,
      border: `1px solid ${REDWOOD.neutral200}`,
      cursor: 'pointer',
    }}
    styles={{ body: { padding: 16 } }}
  >
    <Space>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: `${color}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: color,
          fontSize: 18,
        }}
      >
        {icon}
      </div>
      <div>
        <Text strong style={{ display: 'block' }}>{label}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>{count} pending</Text>
      </div>
    </Space>
  </Card>
);

const Home: React.FC = () => {
  const navigate = useNavigate();
  const [isModulesOpen, setIsModulesOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const floatingIconRef = useRef<HTMLDivElement>(null);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isOutsidePanel = panelRef.current && !panelRef.current.contains(target);
      const isOutsideFloatingIcon = floatingIconRef.current && !floatingIconRef.current.contains(target);

      if (isOutsidePanel && isOutsideFloatingIcon) {
        closePanel();
      }
    };

    if (isModulesOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isModulesOpen]);

  const closePanel = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsModulesOpen(false);
      setIsClosing(false);
    }, 250);
  };

  const toggleModulesPanel = () => {
    if (isModulesOpen) {
      closePanel();
    } else {
      setIsClosing(false);
      setIsModulesOpen(true);
    }
  };

  const handleModuleClick = (module: Module) => {
    closePanel();
    navigate(module.path);
  };

  return (
    <div style={{ padding: '24px', paddingRight: 100, background: REDWOOD.neutral100, minHeight: 'calc(100vh - 64px)' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Space align="center">
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              background: `linear-gradient(135deg, ${REDWOOD.primary} 0%, ${REDWOOD.primaryLight} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 4px 12px ${REDWOOD.primary}40`,
            }}
          >
            <BarChartOutlined style={{ fontSize: 28, color: '#fff' }} />
          </div>
          <div>
            <Title level={2} style={{ margin: 0, color: REDWOOD.neutral900 }}>
              Dashboard
            </Title>
            <Text type="secondary">Welcome back! Here's your business overview.</Text>
          </div>
        </Space>
      </div>

      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <KPICard
            icon={<DollarOutlined />}
            label={kpiData.revenue.label}
            value={kpiData.revenue.value}
            prefix="$"
            change={kpiData.revenue.change}
            color={REDWOOD.success}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KPICard
            icon={<BankOutlined />}
            label={kpiData.expenses.label}
            value={kpiData.expenses.value}
            prefix="$"
            change={kpiData.expenses.change}
            color={REDWOOD.primary}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KPICard
            icon={<ShoppingCartOutlined />}
            label={kpiData.receivables.label}
            value={kpiData.receivables.value}
            prefix="$"
            color={REDWOOD.warning}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KPICard
            icon={<TruckOutlined />}
            label={kpiData.payables.label}
            value={kpiData.payables.value}
            prefix="$"
            color={REDWOOD.info}
          />
        </Col>
      </Row>

      {/* Quick Actions */}
      <Card
        style={{
          borderRadius: 12,
          border: `1px solid ${REDWOOD.neutral200}`,
          marginBottom: 24,
        }}
        styles={{ body: { padding: 20 } }}
      >
        <Text
          strong
          style={{
            display: 'block',
            marginBottom: 16,
            color: REDWOOD.neutral600,
            textTransform: 'uppercase',
            fontSize: 12,
            letterSpacing: 1,
          }}
        >
          Quick Actions
        </Text>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <QuickActionCard
              icon={<FileTextOutlined />}
              label="Pending Journals"
              count={kpiData.pendingJournals.value}
              color={REDWOOD.primary}
              onClick={() => navigate('/gl')}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <QuickActionCard
              icon={<ClockCircleOutlined />}
              label="Open POs"
              count={kpiData.openPOs.value}
              color={REDWOOD.info}
              onClick={() => navigate('/procurement')}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <QuickActionCard
              icon={<CheckCircleOutlined />}
              label="Pending Approvals"
              count={0}
              color={REDWOOD.warning}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <QuickActionCard
              icon={<SyncOutlined />}
              label="Sync Data"
              count={0}
              color={REDWOOD.success}
              onClick={() => navigate('/sync')}
            />
          </Col>
        </Row>
      </Card>

      {/* Period Status */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card
            style={{
              borderRadius: 12,
              border: `1px solid ${REDWOOD.neutral200}`,
              height: '100%',
            }}
            styles={{ body: { padding: 20 } }}
          >
            <Text
              strong
              style={{
                display: 'block',
                marginBottom: 16,
                color: REDWOOD.neutral600,
                textTransform: 'uppercase',
                fontSize: 12,
                letterSpacing: 1,
              }}
            >
              Period Status
            </Text>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text>Current Period</Text>
                <Text strong>--</Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text>GL Period Status</Text>
                <Text strong style={{ color: REDWOOD.neutral600 }}>--</Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>AP Period Status</Text>
                <Text strong style={{ color: REDWOOD.neutral600 }}>--</Text>
              </div>
            </div>
            <Divider style={{ margin: '16px 0' }} />
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Period Progress</Text>
              <Progress percent={0} strokeColor={REDWOOD.primary} style={{ marginTop: 8 }} />
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            style={{
              borderRadius: 12,
              border: `1px solid ${REDWOOD.neutral200}`,
              height: '100%',
            }}
            styles={{ body: { padding: 20 } }}
          >
            <Text
              strong
              style={{
                display: 'block',
                marginBottom: 16,
                color: REDWOOD.neutral600,
                textTransform: 'uppercase',
                fontSize: 12,
                letterSpacing: 1,
              }}
            >
              Recent Activity
            </Text>
            <div style={{ textAlign: 'center', padding: '20px 0', color: REDWOOD.neutral600 }}>
              <ClockCircleOutlined style={{ fontSize: 32, marginBottom: 8, opacity: 0.5 }} />
              <div>No recent activity</div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Activity will appear here once you start using the system
              </Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Modules Grid */}
      <Card
        style={{
          borderRadius: 12,
          border: `1px solid ${REDWOOD.neutral200}`,
        }}
        styles={{ body: { padding: 20 } }}
      >
        <Text
          strong
          style={{
            display: 'block',
            marginBottom: 16,
            color: REDWOOD.neutral600,
            textTransform: 'uppercase',
            fontSize: 12,
            letterSpacing: 1,
          }}
        >
          Modules
        </Text>
        <Row gutter={[16, 16]}>
          {modules.map((module) => (
            <Col xs={12} sm={8} md={6} lg={4} xl={3} key={module.id}>
              <Card
                hoverable
                onClick={() => handleModuleClick(module)}
                style={{
                  borderRadius: 12,
                  textAlign: 'center',
                  border: `1px solid ${REDWOOD.neutral200}`,
                  transition: 'all 0.3s ease',
                }}
                styles={{ body: { padding: 16 } }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = module.color;
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = `0 4px 12px ${module.color}20`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = REDWOOD.neutral200;
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    background: `${module.color}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px',
                    color: module.color,
                  }}
                >
                  {module.icon}
                </div>
                <Text strong style={{ fontSize: 13, display: 'block' }}>
                  {module.name}
                </Text>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      {/* Floating Modules Icon */}
      <div
        ref={floatingIconRef}
        style={{
          position: 'fixed',
          right: 24,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 1000,
        }}
      >
        <Tooltip title={isModulesOpen ? '' : 'Modules'} placement="left">
          <div
            onClick={toggleModulesPanel}
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              background: isModulesOpen ? REDWOOD.moduleOrange : REDWOOD.surface,
              border: `2px solid ${REDWOOD.moduleOrange}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: isModulesOpen ? `0 4px 12px ${REDWOOD.moduleOrange}40` : '0 2px 8px rgba(0,0,0,0.1)',
              color: isModulesOpen ? '#fff' : REDWOOD.moduleOrange,
              fontSize: 24,
            }}
          >
            <AppstoreOutlined />
          </div>
        </Tooltip>
      </div>

      {/* Backdrop Overlay */}
      {isModulesOpen && (
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

      {/* Modules Slide-out Panel */}
      {isModulesOpen && (
        <div
          ref={panelRef}
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
          {/* Panel Header */}
          <div style={{
            padding: '20px 24px',
            background: REDWOOD.moduleOrange,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <AppstoreOutlined style={{ fontSize: 22, color: '#fff' }} />
              <Text strong style={{ color: '#fff', fontSize: 18 }}>Modules</Text>
            </div>
            <CloseOutlined
              style={{ color: '#fff', cursor: 'pointer', fontSize: 16, padding: 8 }}
              onClick={closePanel}
            />
          </div>

          {/* Panel Content */}
          <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
            {modules.map((module, index) => (
              <div
                key={module.id}
                onClick={() => handleModuleClick(module)}
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
                  animation: `fadeInItem 0.3s ease-out ${index * 0.03}s forwards`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = REDWOOD.neutral100;
                  e.currentTarget.style.borderColor = module.color;
                  e.currentTarget.style.transform = 'translateX(-4px)';
                  e.currentTarget.style.boxShadow = `0 2px 8px ${module.color}20`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = REDWOOD.surface;
                  e.currentTarget.style.borderColor = REDWOOD.neutral200;
                  e.currentTarget.style.transform = 'translateX(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: `${module.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: module.color,
                  fontSize: 24,
                  flexShrink: 0,
                }}>
                  {React.isValidElement(module.icon) && React.cloneElement(module.icon as React.ReactElement<{ style?: React.CSSProperties }>, { style: { fontSize: 24 } })}
                </div>
                <div style={{ flex: 1 }}>
                  <Text strong style={{ display: 'block', color: REDWOOD.neutral900, fontSize: 15 }}>
                    {module.name}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.4 }}>
                    {module.description}
                  </Text>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
        @keyframes fadeInItem {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
};

export default Home;
