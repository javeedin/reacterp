import React, { useState, useRef, useEffect } from 'react';
import { Layout, Typography, Card, Breadcrumb, Space, Tooltip } from 'antd';
import {
  HomeOutlined,
  AccountBookOutlined,
  CheckSquareOutlined,
  BarChartOutlined,
  FileTextOutlined,
  SettingOutlined,
  SwapOutlined,
  AuditOutlined,
  BookOutlined,
  BankOutlined,
  CalendarOutlined,
  DollarOutlined,
  ReconciliationOutlined,
  PieChartOutlined,
  LineChartOutlined,
  FundOutlined,
  ProfileOutlined,
  SolutionOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';

const { Content } = Layout;
const { Title, Text } = Typography;

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

// Menu item type
interface MenuItemType {
  key: string;
  icon: React.ReactNode;
  label: string;
  description?: string;
}

// Task menu items
const taskMenuItems: MenuItemType[] = [
  { key: 'journal-entry', icon: <FileTextOutlined />, label: 'Create Journal', description: 'Create manual journal entry' },
  { key: 'import-journals', icon: <SwapOutlined />, label: 'Import Journals', description: 'Import from spreadsheet' },
  { key: 'reverse-journal', icon: <ReconciliationOutlined />, label: 'Reverse Journal', description: 'Reverse posted journals' },
  { key: 'open-period', icon: <CalendarOutlined />, label: 'Open Period', description: 'Open accounting period' },
  { key: 'close-period', icon: <AuditOutlined />, label: 'Close Period', description: 'Close accounting period' },
  { key: 'revaluation', icon: <DollarOutlined />, label: 'Run Revaluation', description: 'Foreign currency revaluation' },
];

// Report menu items
const reportMenuItems: MenuItemType[] = [
  { key: 'trial-balance', icon: <ProfileOutlined />, label: 'Trial Balance', description: 'View trial balance report' },
  { key: 'balance-sheet', icon: <PieChartOutlined />, label: 'Balance Sheet', description: 'Financial position report' },
  { key: 'income-statement', icon: <LineChartOutlined />, label: 'Income Statement', description: 'Profit and loss report' },
  { key: 'journal-report', icon: <FileTextOutlined />, label: 'Journal Report', description: 'Posted journals listing' },
  { key: 'account-analysis', icon: <FundOutlined />, label: 'Account Analysis', description: 'Account detail analysis' },
  { key: 'gl-balances', icon: <BarChartOutlined />, label: 'GL Balances', description: 'General ledger balances' },
];

// Quick links for the main area
const quickLinks = [
  { key: 'chart-of-accounts', icon: <BookOutlined />, label: 'Chart of Accounts', color: REDWOOD.primary },
  { key: 'ledgers', icon: <AccountBookOutlined />, label: 'Ledgers', color: REDWOOD.info },
  { key: 'fiscal-calendar', icon: <CalendarOutlined />, label: 'Fiscal Calendar', color: REDWOOD.success },
  { key: 'currencies', icon: <DollarOutlined />, label: 'Currencies', color: REDWOOD.warning },
  { key: 'account-combinations', icon: <SettingOutlined />, label: 'Account Combinations', color: REDWOOD.primaryDark },
  { key: 'cross-validation', icon: <SolutionOutlined />, label: 'Cross Validation', color: REDWOOD.reportGreen },
];

const GLModule: React.FC = () => {
  const [activePanel, setActivePanel] = useState<'none' | 'tasks' | 'reports'>('none');
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setActivePanel('none');
      }
    };

    if (activePanel !== 'none') {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activePanel]);

  const handleMenuItemClick = (key: string) => {
    setSelectedItem(key);
    setActivePanel('none');
    // Here you would navigate or load the content
    console.log('Selected:', key);
  };

  const togglePanel = (panel: 'tasks' | 'reports') => {
    setActivePanel(activePanel === panel ? 'none' : panel);
  };

  // Floating Action Button
  const FloatingIcon = ({
    icon,
    label,
    color,
    isActive,
    onClick,
    position
  }: {
    icon: React.ReactNode;
    label: string;
    color: string;
    isActive: boolean;
    onClick: () => void;
    position: 'top' | 'bottom';
  }) => (
    <Tooltip title={!isActive ? label : ''} placement="left">
      <div
        onClick={onClick}
        style={{
          width: 56,
          height: 56,
          borderRadius: position === 'top' ? '12px 12px 0 0' : '0 0 12px 12px',
          background: isActive ? color : REDWOOD.surface,
          border: `2px solid ${color}`,
          borderBottom: position === 'top' ? 'none' : `2px solid ${color}`,
          borderTop: position === 'bottom' ? 'none' : `2px solid ${color}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          boxShadow: isActive ? `0 4px 12px ${color}40` : '0 2px 8px rgba(0,0,0,0.1)',
          color: isActive ? '#fff' : color,
          fontSize: 24,
        }}
      >
        {icon}
      </div>
    </Tooltip>
  );

  // Slide-out Panel
  const SlidePanel = ({
    title,
    items,
    color
  }: {
    title: string;
    items: MenuItemType[];
    color: string;
  }) => (
    <div
      style={{
        position: 'absolute',
        right: 72,
        top: 0,
        width: 320,
        background: REDWOOD.surface,
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        overflow: 'hidden',
        animation: 'slideIn 0.2s ease-out',
      }}
    >
      {/* Panel Header */}
      <div style={{
        padding: '16px 20px',
        background: color,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <Text strong style={{ color: '#fff', fontSize: 16 }}>{title}</Text>
        <CloseOutlined
          style={{ color: '#fff', cursor: 'pointer', fontSize: 14 }}
          onClick={() => setActivePanel('none')}
        />
      </div>

      {/* Panel Items */}
      <div style={{ padding: 8, maxHeight: 400, overflowY: 'auto' }}>
        {items.map((item) => (
          <div
            key={item.key}
            onClick={() => handleMenuItemClick(item.key)}
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              transition: 'background 0.2s',
              marginBottom: 4,
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = REDWOOD.neutral100}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
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
              flexShrink: 0,
            }}>
              {item.icon}
            </div>
            <div style={{ flex: 1 }}>
              <Text strong style={{ display: 'block', color: REDWOOD.neutral900 }}>
                {item.label}
              </Text>
              {item.description && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {item.description}
                </Text>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

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
              { title: 'General Ledger' },
            ]}
          />
        </div>

        {/* Main Content Area */}
        <div style={{ padding: 24, position: 'relative' }}>
          {/* Page Title */}
          <div style={{ marginBottom: 24 }}>
            <Space align="center">
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                background: `linear-gradient(135deg, ${REDWOOD.primary} 0%, ${REDWOOD.primaryDark} 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 4px 12px ${REDWOOD.primary}40`,
              }}>
                <AccountBookOutlined style={{ fontSize: 28, color: '#fff' }} />
              </div>
              <div>
                <Title level={2} style={{ margin: 0, color: REDWOOD.neutral900 }}>
                  General Ledger
                </Title>
                <Text type="secondary">Manage accounts, journals, and financial reporting</Text>
              </div>
            </Space>
          </div>

          {/* Quick Links Grid */}
          <div style={{ marginBottom: 24 }}>
            <Text strong style={{
              display: 'block',
              marginBottom: 16,
              color: REDWOOD.neutral600,
              textTransform: 'uppercase',
              fontSize: 12,
              letterSpacing: 1,
            }}>
              Quick Links
            </Text>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 16
            }}>
              {quickLinks.map((link) => (
                <Card
                  key={link.key}
                  hoverable
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${REDWOOD.neutral200}`,
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                  }}
                  bodyStyle={{ padding: 20 }}
                  onClick={() => handleMenuItemClick(link.key)}
                >
                  <Space>
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: `${link.color}15`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: link.color,
                      fontSize: 22,
                    }}>
                      {link.icon}
                    </div>
                    <Text strong style={{ color: REDWOOD.neutral900 }}>{link.label}</Text>
                  </Space>
                </Card>
              ))}
            </div>
          </div>

          {/* Selected Content Area */}
          {selectedItem && (
            <Card
              style={{
                borderRadius: 12,
                border: `1px solid ${REDWOOD.neutral200}`,
                minHeight: 300,
              }}
            >
              <div style={{ textAlign: 'center', padding: 60 }}>
                <AccountBookOutlined style={{ fontSize: 48, color: REDWOOD.neutral300, marginBottom: 16 }} />
                <Title level={4} style={{ color: REDWOOD.neutral600 }}>
                  {selectedItem.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                </Title>
                <Text type="secondary">
                  Content will be loaded from web services
                </Text>
              </div>
            </Card>
          )}

          {/* Floating Connected Icons */}
          <div
            ref={panelRef}
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
            <FloatingIcon
              icon={<CheckSquareOutlined />}
              label="Tasks"
              color={REDWOOD.taskBlue}
              isActive={activePanel === 'tasks'}
              onClick={() => togglePanel('tasks')}
              position="top"
            />

            {/* Connector Line */}
            <div style={{
              width: 56,
              height: 2,
              background: REDWOOD.neutral200,
            }} />

            {/* Reports Icon */}
            <FloatingIcon
              icon={<BarChartOutlined />}
              label="Reports"
              color={REDWOOD.reportGreen}
              isActive={activePanel === 'reports'}
              onClick={() => togglePanel('reports')}
              position="bottom"
            />

            {/* Slide-out Panels */}
            {activePanel === 'tasks' && (
              <SlidePanel
                title="Tasks"
                items={taskMenuItems}
                color={REDWOOD.taskBlue}
              />
            )}
            {activePanel === 'reports' && (
              <SlidePanel
                title="Reports"
                items={reportMenuItems}
                color={REDWOOD.reportGreen}
              />
            )}
          </div>
        </div>
      </Content>

      {/* CSS Animation */}
      <style>{`
        @keyframes slideIn {
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
    </Layout>
  );
};

export default GLModule;
