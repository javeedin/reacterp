import React from 'react';
import {
  Layout,
  Card,
  Row,
  Col,
  Typography,
  Space,
  Statistic,
  Breadcrumb,
} from 'antd';
import {
  HomeOutlined,
  StockOutlined,
  EyeOutlined,
  FundOutlined,
  PieChartOutlined,
  RiseOutlined,
  FallOutlined,
  PlusOutlined,
  UnorderedListOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';

const { Text, Title } = Typography;
const { Content } = Layout;

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
  portfolioPurple: '#6B4C9A',
};

interface MenuItemType {
  key: string;
  icon: React.ReactNode;
  label: string;
  description?: string;
  color?: string;
  path?: string;
}

const PMSModule: React.FC = () => {
  const navigate = useNavigate();

  const handleMenuItemClick = (_key: string, path?: string) => {
    if (path) {
      navigate(path);
    }
  };

  // Watchlist Tasks
  const watchlistItems: MenuItemType[] = [
    {
      key: 'create-watchlist',
      icon: <PlusOutlined />,
      label: 'Create Watchlist',
      description: 'Create a new stock watchlist',
      color: REDWOOD.taskBlue,
      path: '/pms/watchlist',
    },
    {
      key: 'manage-watchlists',
      icon: <UnorderedListOutlined />,
      label: 'Manage Watchlists',
      description: 'View and manage your watchlists',
      color: REDWOOD.info,
      path: '/pms/watchlist',
    },
    {
      key: 'market-overview',
      icon: <DashboardOutlined />,
      label: 'Market Overview',
      description: 'Live market data and trends',
      color: REDWOOD.warning,
      path: '/pms/watchlist',
    },
  ];

  // Portfolio Tasks
  const portfolioItems: MenuItemType[] = [
    {
      key: 'my-portfolio',
      icon: <PieChartOutlined />,
      label: 'My Portfolio',
      description: 'View holdings and performance',
      color: REDWOOD.portfolioPurple,
      path: '/pms/portfolio',
    },
    {
      key: 'portfolio-analytics',
      icon: <FundOutlined />,
      label: 'Portfolio Analytics',
      description: 'Detailed performance analysis',
      color: REDWOOD.reportGreen,
      path: '/pms/portfolio',
    },
    {
      key: 'add-holding',
      icon: <PlusOutlined />,
      label: 'Add Holding',
      description: 'Add a new stock to your portfolio',
      color: REDWOOD.taskBlue,
      path: '/pms/portfolio',
    },
  ];

  // Sub-Components
  const KpiCard = ({ title, value, prefix, suffix, icon, color, trend }: {
    title: string; value: string | number; prefix?: string; suffix?: string;
    icon: React.ReactNode; color: string; trend?: { value: number; isUp: boolean };
  }) => (
    <Card
      style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', height: '100%' }}
      bodyStyle={{ padding: '20px 24px' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Text type="secondary" style={{ fontSize: 13 }}>{title}</Text>
          <Statistic
            value={value}
            prefix={prefix}
            suffix={suffix}
            valueStyle={{ fontSize: 28, fontWeight: 700, color: REDWOOD.neutral900 }}
          />
          {trend && (
            <Space size={4} style={{ marginTop: 4 }}>
              {trend.isUp ? (
                <ArrowUpOutlined style={{ color: REDWOOD.success, fontSize: 12 }} />
              ) : (
                <ArrowDownOutlined style={{ color: REDWOOD.error, fontSize: 12 }} />
              )}
              <Text style={{ fontSize: 12, color: trend.isUp ? REDWOOD.success : REDWOOD.error }}>
                {trend.value}%
              </Text>
            </Space>
          )}
        </div>
        <div style={{
          background: `${color}15`,
          borderRadius: 12,
          padding: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {React.cloneElement(icon as React.ReactElement<{ style?: React.CSSProperties }>, {
            style: { fontSize: 28, color },
          })}
        </div>
      </div>
    </Card>
  );

  const SectionTitle = ({ icon, title, color }: { icon: React.ReactNode; title: string; color: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <div style={{
        background: `${color}15`,
        borderRadius: 8,
        padding: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {React.cloneElement(icon as React.ReactElement<{ style?: React.CSSProperties }>, {
          style: { fontSize: 20, color },
        })}
      </div>
      <Text strong style={{ fontSize: 18, color: REDWOOD.neutral900 }}>{title}</Text>
    </div>
  );

  const MenuCard = ({ item }: { item: MenuItemType }) => (
    <Col xs={24} sm={12} md={8} lg={6}>
      <Card
        hoverable
        style={{
          borderRadius: 10,
          border: `1px solid ${REDWOOD.neutral200}`,
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          height: '100%',
          cursor: 'pointer',
        }}
        bodyStyle={{ padding: '16px 20px' }}
        onClick={() => handleMenuItemClick(item.key, item.path)}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            background: `${item.color}15`,
            borderRadius: 12,
            padding: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            {React.cloneElement(item.icon as React.ReactElement<{ style?: React.CSSProperties }>, {
              style: { fontSize: 22, color: item.color },
            })}
          </div>
          <div>
            <Text strong style={{ fontSize: 14, color: REDWOOD.neutral900, display: 'block' }}>
              {item.label}
            </Text>
            {item.description && (
              <Text type="secondary" style={{ fontSize: 12 }}>{item.description}</Text>
            )}
          </div>
        </div>
      </Card>
    </Col>
  );

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb */}
        <div style={{
          padding: '12px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
        }}>
          <Breadcrumb
            items={[
              { title: <Link to="/home"><HomeOutlined /> Home</Link> },
              { title: 'Portfolio Management' },
            ]}
          />
        </div>

        <div style={{ padding: '24px', paddingRight: 48 }}>
          {/* Page Title */}
          <div style={{ marginBottom: 24 }}>
            <Space align="center" size={12}>
              <div style={{
                background: `${REDWOOD.portfolioPurple}15`,
                borderRadius: 12,
                padding: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <StockOutlined style={{ fontSize: 28, color: REDWOOD.portfolioPurple }} />
              </div>
              <div>
                <Title level={3} style={{ margin: 0, color: REDWOOD.neutral900 }}>
                  Portfolio Management System
                </Title>
                <Text type="secondary">
                  Monitor your watchlists, track portfolio performance, and manage investments
                </Text>
              </div>
            </Space>
          </div>

          {/* KPI Cards */}
          <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
            <Col xs={24} sm={12} lg={6}>
              <KpiCard
                title="Total Watchlists"
                value={0}
                icon={<EyeOutlined />}
                color={REDWOOD.info}
              />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <KpiCard
                title="Watched Stocks"
                value={0}
                icon={<StockOutlined />}
                color={REDWOOD.warning}
              />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <KpiCard
                title="Portfolio Holdings"
                value={0}
                icon={<PieChartOutlined />}
                color={REDWOOD.portfolioPurple}
              />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <KpiCard
                title="Portfolio Value"
                value={0}
                prefix="$"
                icon={<FundOutlined />}
                color={REDWOOD.success}
                trend={{ value: 0, isUp: true }}
              />
            </Col>
          </Row>

          {/* Watchlist Section */}
          <div style={{ marginBottom: 32 }}>
            <SectionTitle
              icon={<EyeOutlined />}
              title="Watchlist"
              color={REDWOOD.info}
            />
            <Row gutter={[16, 16]}>
              {watchlistItems.map((item) => (
                <MenuCard key={item.key} item={item} />
              ))}
            </Row>
          </div>

          {/* Portfolio Section */}
          <div style={{ marginBottom: 32 }}>
            <SectionTitle
              icon={<PieChartOutlined />}
              title="Portfolio"
              color={REDWOOD.portfolioPurple}
            />
            <Row gutter={[16, 16]}>
              {portfolioItems.map((item) => (
                <MenuCard key={item.key} item={item} />
              ))}
            </Row>
          </div>
        </div>
      </Content>
    </Layout>
  );
};

export default PMSModule;
