import React from 'react';
import { Layout, Card, Typography, Breadcrumb } from 'antd';
import { Link } from 'react-router-dom';
import { HomeOutlined, WalletOutlined } from '@ant-design/icons';
import FloatingMenu from '../../components/FloatingMenu';

const { Content } = Layout;
const { Title, Text } = Typography;

const REDWOOD = {
  primary: '#C74634', success: '#1D7B4D', warning: '#D4A800',
  info: '#0572CE', neutral100: '#F7F7F7', neutral200: '#E5E5E5',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
};

const PettyCash: React.FC = () => (
  <Layout style={{ minHeight: '100vh', background: REDWOOD.neutral100 }}>
    <Content style={{ padding: '16px 24px' }}>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/home"><HomeOutlined /> Home</Link> },
          { title: 'Petty Cash' },
          { title: 'Registers' },
        ]}
      />
      <Card
        style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
        styles={{ body: { padding: 32, textAlign: 'center' } }}
      >
        <WalletOutlined style={{ fontSize: 48, color: REDWOOD.success, marginBottom: 16 }} />
        <Title level={3} style={{ color: REDWOOD.neutral900, marginBottom: 8 }}>
          Petty Cash Registers
        </Title>
        <Text style={{ color: REDWOOD.neutral600 }}>
          Page under construction — coming next.
        </Text>
      </Card>
    </Content>
    <FloatingMenu />
  </Layout>
);

export default PettyCash;
