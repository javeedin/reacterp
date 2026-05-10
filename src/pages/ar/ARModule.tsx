import React from 'react';
import { Layout, Typography, Card, Breadcrumb, Row, Col } from 'antd';
import {
  HomeOutlined,
  FileTextOutlined,
  TeamOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import FloatingMenu from '../../components/FloatingMenu';
import Autopilot from '../../components/Autopilot';

const { Content } = Layout;
const { Title, Text } = Typography;

const REDWOOD = {
  primary: '#C74634',
  surface: '#FFFFFF',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral900: '#1A1A1A',
  neutral600: '#6B6B6B',
  taskBlue: '#0572CE',
};

const tasks = [
  {
    key: 'manage-invoices',
    icon: <FileTextOutlined style={{ fontSize: 28, color: REDWOOD.taskBlue }} />,
    label: 'Manage Invoices',
    description: 'Search, view and manage AR transactions',
    path: '/ar/manage-invoices',
  },
  {
    key: 'manage-customers',
    icon: <TeamOutlined style={{ fontSize: 28, color: REDWOOD.primary }} />,
    label: 'Manage Customers',
    description: 'View and manage customer accounts',
    path: '/ar/manage-customers',
  },
  {
    key: 'manage-receipts',
    icon: <DollarOutlined style={{ fontSize: 28, color: '#1D7B4D' }} />,
    label: 'Manage Receipts',
    description: 'Search and manage cash receipts',
    path: '/ar/manage-receipts',
  },
];

const ARModule: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Layout style={{ minHeight: '100vh', background: REDWOOD.neutral100 }}>
      <Content style={{ padding: '0 24px 24px' }}>
        <Breadcrumb style={{ padding: '16px 0' }}
          items={[
            { title: <Link to="/"><HomeOutlined /></Link> },
            { title: 'Accounts Receivable' },
          ]}
        />

        {/* Header */}
        <div style={{
          background: REDWOOD.primary,
          borderRadius: 8,
          padding: '20px 28px',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          <FileTextOutlined style={{ fontSize: 32, color: '#fff' }} />
          <div>
            <Title level={3} style={{ color: '#fff', margin: 0 }}>Accounts Receivable</Title>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
              Manage invoices, customers and receipts
            </Text>
          </div>
        </div>

        {/* Task Cards */}
        <Row gutter={[16, 16]}>
          {tasks.map(task => (
            <Col xs={24} sm={12} md={8} key={task.key}>
              <Card
                hoverable
                onClick={() => navigate(task.path)}
                style={{
                  borderRadius: 8,
                  border: `1px solid ${REDWOOD.neutral200}`,
                  cursor: 'pointer',
                }}
                bodyStyle={{ padding: 24 }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 10,
                    background: REDWOOD.neutral100,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {task.icon}
                  </div>
                  <div>
                    <Text strong style={{ fontSize: 15, color: REDWOOD.neutral900, display: 'block' }}>
                      {task.label}
                    </Text>
                    <Text style={{ fontSize: 13, color: REDWOOD.neutral600 }}>
                      {task.description}
                    </Text>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </Content>
      <FloatingMenu />
      <Autopilot />
    </Layout>
  );
};

export default ARModule;
