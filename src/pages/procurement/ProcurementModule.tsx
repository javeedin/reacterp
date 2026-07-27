import React, { useState } from 'react';
import { Layout, Breadcrumb, Typography, Card, Row, Col, Input, Button, Form, Alert, Divider, message, Tag } from 'antd';
import {
  HomeOutlined, ShoppingCartOutlined, TeamOutlined, AppstoreOutlined,
  DatabaseOutlined, CheckCircleOutlined, LockOutlined, BugOutlined,
  ApartmentOutlined, BankOutlined, SafetyCertificateOutlined, InboxOutlined,
  DollarOutlined, ReconciliationOutlined, CloudOutlined, HistoryOutlined,
  SwapOutlined, CarOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';

const { Content } = Layout;
const { Title, Text } = Typography;

const REDWOOD = {
  primary: '#C74634', primaryLight: '#E85D4A', primaryDark: '#A33B2C',
  success: '#1D7B4D', warning: '#D4A800', info: '#0572CE', error: '#D93025',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral300: '#C7C7C7',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
  teal: '#00918A',
};

const CORRECT_PASSWORD = 'MIT12345';
const SESSION_KEY = 'procurement_auth';

interface MenuItemType {
  key: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  color: string;
  path?: string;
}

const procurementItems: MenuItemType[] = [
  {
    key: 'purchase-orders',
    icon: <ShoppingCartOutlined />,
    label: 'Purchase Orders',
    description: 'Search, view and manage purchase orders from Oracle Fusion',
    color: REDWOOD.primary,
    path: '/procurement/purchase-orders',
  },
  {
    key: 'suppliers',
    icon: <TeamOutlined />,
    label: 'Suppliers',
    description: 'Manage supplier records, sites and contacts',
    color: REDWOOD.info,
    path: '/procurement/suppliers',
  },
  {
    key: 'items',
    icon: <AppstoreOutlined />,
    label: 'Items',
    description: 'Manage item master, categories and attributes',
    color: REDWOOD.warning,
    path: '/inventory/items',
  },
  {
    key: 'on-hand-inventory',
    icon: <DatabaseOutlined />,
    label: 'On-Hand Inventory',
    description: 'View current on-hand stock levels by item and location',
    color: REDWOOD.success,
    path: '/inventory/onhand',
  },
  {
    key: 'subinventories',
    icon: <ApartmentOutlined />,
    label: 'Subinventories',
    description: 'Warehouse and subinventory hierarchy by business unit',
    color: REDWOOD.teal,
    path: '/inventory/subinventories',
  },
  {
    key: 'business-units',
    icon: <BankOutlined />,
    label: 'Business Units',
    description: 'Oracle Fusion business units',
    color: REDWOOD.info,
    path: '/procurement/business-units',
  },
  {
    key: 'legal-entities',
    icon: <SafetyCertificateOutlined />,
    label: 'Legal Entities',
    description: 'Legal entity setup and configuration',
    color: REDWOOD.warning,
    path: '/procurement/legal-entities',
  },
  {
    key: 'item-master',
    icon: <AppstoreOutlined />,
    label: 'Item Master',
    description: 'Item catalog with attributes, pricing and flags',
    color: REDWOOD.success,
    path: '/inventory/items',
  },
  {
    key: 'expected-receipts',
    icon: <InboxOutlined />,
    label: 'Expected PO Receipts',
    description: 'View and manage purchase order lines pending receipt in Oracle Fusion',
    color: REDWOOD.teal,
    path: '/procurement/expected-receipts',
  },
  {
    key: 'transfer-orders',
    icon: <SwapOutlined />,
    label: 'Transfer Orders',
    description: 'Transfer stock between inventory organizations (search & create via SCO)',
    color: REDWOOD.info,
    path: '/procurement/transfer-orders',
  },
  {
    key: 'shipment-lines',
    icon: <CarOutlined />,
    label: 'Manage Shipment Lines',
    description: 'Search pending & in-progress shipment lines from Oracle Fusion (shipmentLines)',
    color: REDWOOD.teal,
    path: '/procurement/shipment-lines',
  },
  {
    key: 'item-costs',
    icon: <DollarOutlined />,
    label: 'Manage Item Cost',
    description: 'Search item costs from Oracle Fusion (itemCosts)',
    color: REDWOOD.primary,
    path: '/procurement/item-costs',
  },
  {
    key: 'receipt-costs',
    icon: <ReconciliationOutlined />,
    label: 'Manage Receipt Cost',
    description: 'Search receipt costs from Oracle Fusion (receiptCosts)',
    color: REDWOOD.teal,
    path: '/procurement/receipt-costs',
  },
  {
    key: 'uat',
    icon: <BugOutlined />,
    label: 'UAT / Diagnostics',
    description: 'Automated UAT scripts — fetch live data from Fusion and validate expected values',
    color: '#7c3aed',
    path: '/procurement/uat',
  },
  {
    key: 'tb-loading',
    icon: <DatabaseOutlined />,
    label: 'Trial Balance Loading',
    description: 'Load trial balance from Excel, filter and review the data',
    color: '#0572CE',
    path: '/procurement/tb-loading',
  },
  {
    key: 'login-history',
    icon: <HistoryOutlined />,
    label: 'Login History',
    description: 'Oracle Fusion (IDCS) sign-in history via Audit Events',
    color: REDWOOD.info,
    path: '/procurement/login-history',
  },
  {
    key: 'cost-management',
    icon: <DollarOutlined />,
    label: 'Cost Management',
    description: 'Cost received items — Receipt & Cost Accounting ESS jobs (run & monitor)',
    color: REDWOOD.primary,
    path: '/procurement/cost-management',
  },
];

const TaskCard: React.FC<{ item: MenuItemType; onClick: () => void }> = ({ item, onClick }) => (
  <Card
    hoverable={!!item.path}
    onClick={onClick}
    style={{
      borderRadius: 8,
      border: item.path ? `1px solid ${REDWOOD.success}30` : `1px solid ${REDWOOD.neutral200}`,
      cursor: item.path ? 'pointer' : 'default',
      opacity: item.path ? 1 : 0.6,
      position: 'relative',
    }}
    styles={{ body: { padding: '14px 16px' } }}
  >
    {item.path && (
      <div style={{
        position: 'absolute', top: 6, right: 6,
        background: REDWOOD.success, color: '#fff',
        borderRadius: '50%', width: 16, height: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <CheckCircleOutlined style={{ fontSize: 10 }} />
      </div>
    )}
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
        background: item.color + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: item.color, fontSize: 18,
      }}>
        {item.icon}
      </div>
      <div>
        <Text strong style={{ fontSize: 13, color: item.path ? item.color : REDWOOD.neutral900 }}>
          {item.label}
        </Text>
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
          {item.description}
        </Text>
      </div>
    </div>
  </Card>
);

// ── Password Gate ────────────────────────────────────────────────────────────
const PasswordGate: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fusionLoading, setFusionLoading] = useState(false);

  // Open the real Oracle Cloud (IDCS) sign-in window. On success, capture the
  // username and unlock the module.
  const handleFusionLogin = async () => {
    const api = (window as any).electronAPI;
    if (!api?.fusionLogin) {
      setError('Fusion login is only available in the desktop app.');
      return;
    }
    setError('');
    setFusionLoading(true);
    try {
      const res = await api.fusionLogin();
      if (res?.success) {
        sessionStorage.setItem(SESSION_KEY, 'true');
        if (res.username) {
          sessionStorage.setItem('fusion_user', res.username);
          window.dispatchEvent(new CustomEvent('fusion-user-changed', { detail: res.username }));
        }
        message.success(`Signed in to Oracle Fusion${res.username ? ` as ${res.username}` : ''}`);
        onSuccess();
      } else if (res?.cancelled) {
        setError('Fusion sign-in was cancelled.');
      } else {
        setError(res?.error || 'Fusion sign-in did not complete.');
      }
    } catch (e: any) {
      setError(e?.message || 'Fusion sign-in failed.');
    } finally {
      setFusionLoading(false);
    }
  };

  const handleLogin = () => {
    setLoading(true);
    setTimeout(() => {
      if (password === CORRECT_PASSWORD) {
        sessionStorage.setItem(SESSION_KEY, 'true');
        onSuccess();
      } else {
        setError('Incorrect password. Please try again.');
      }
      setLoading(false);
    }, 400);
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 64px)',
      background: REDWOOD.neutral100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <Card
        style={{
          width: 380,
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          border: `1px solid ${REDWOOD.neutral200}`,
        }}
        styles={{ body: { padding: 36 } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: `linear-gradient(135deg, ${REDWOOD.primary} 0%, ${REDWOOD.primaryDark} 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: `0 4px 14px ${REDWOOD.primary}40`,
          }}>
            <LockOutlined style={{ fontSize: 28, color: '#fff' }} />
          </div>
          <Title level={3} style={{ margin: 0, color: REDWOOD.neutral900 }}>Fusion Client</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>Enter your access password to continue</Text>
        </div>

        {error && (
          <Alert
            type="error"
            message={error}
            style={{ marginBottom: 16, borderRadius: 6 }}
            closable
            onClose={() => setError('')}
          />
        )}

        <Form onFinish={handleLogin}>
          <Form.Item style={{ marginBottom: 16 }}>
            <Input.Password
              size="large"
              placeholder="Password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              prefix={<LockOutlined style={{ color: REDWOOD.neutral300 }} />}
              style={{ borderRadius: 6 }}
              onPressEnter={handleLogin}
            />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            size="large"
            loading={loading}
            block
            style={{
              background: REDWOOD.primary,
              borderColor: REDWOOD.primary,
              borderRadius: 6,
              fontWeight: 600,
              height: 44,
            }}
          >
            Access Fusion Client
          </Button>
        </Form>

        <Divider plain style={{ fontSize: 12, color: REDWOOD.neutral600, margin: '20px 0 16px' }}>or</Divider>

        <Button
          block
          size="large"
          icon={<CloudOutlined />}
          loading={fusionLoading}
          onClick={handleFusionLogin}
          style={{ height: 44, fontWeight: 600, borderColor: REDWOOD.info, color: REDWOOD.info }}
        >
          Login to Fusion
        </Button>
        <Text type="secondary" style={{ fontSize: 11, display: 'block', textAlign: 'center', marginTop: 8 }}>
          Sign in with your Oracle Cloud account
        </Text>
      </Card>
    </div>
  );
};

// ── Module Home ───────────────────────────────────────────────────────────────
const ProcurementHome: React.FC = () => {
  const navigate = useNavigate();
  const fusionUser = sessionStorage.getItem('fusion_user');

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        <div style={{ padding: '14px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: 'Fusion Client' },
          ]} />
        </div>

        <div style={{ padding: 24 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 12,
              background: `linear-gradient(135deg, ${REDWOOD.primary} 0%, ${REDWOOD.primaryDark} 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 14px ${REDWOOD.primary}40`,
            }}>
              <ShoppingCartOutlined style={{ fontSize: 26, color: '#fff' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Title level={2} style={{ margin: 0, color: REDWOOD.neutral900 }}>Fusion Client</Title>
                {fusionUser && (
                  <Tag icon={<CloudOutlined />} color="green" style={{ fontWeight: 600, fontSize: 12 }}>
                    {fusionUser}
                  </Tag>
                )}
              </div>
              <Text type="secondary">Interface to query and perform transactions in Oracle Fusion</Text>
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <Text strong style={{ fontSize: 13, color: REDWOOD.neutral900, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 10 }}>
              FUSION CLIENT
            </Text>
            <Row gutter={[12, 12]}>
              {procurementItems.map(item => (
                <Col key={item.key} xs={24} sm={12} lg={8}>
                  <TaskCard item={item} onClick={() => item.path && navigate(item.path)} />
                </Col>
              ))}
            </Row>
          </div>
        </div>
      </Content>
    </Layout>
  );
};

// ── Main Export with Password Gate ───────────────────────────────────────────
const ProcurementModule: React.FC = () => {
  const [authenticated, setAuthenticated] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === 'true'
  );

  if (!authenticated) {
    return <PasswordGate onSuccess={() => setAuthenticated(true)} />;
  }

  return <ProcurementHome />;
};

export default ProcurementModule;
