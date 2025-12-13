import React from 'react';
import { Layout, Dropdown, Avatar, Space, Typography } from 'antd';
import {
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
  HomeOutlined,
  CloudServerOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { MenuProps } from 'antd';

const { Header, Content } = Layout;
const { Text } = Typography;

const MainLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'My Profile',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Sign Out',
      onClick: handleLogout,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          background: 'linear-gradient(90deg, #1a1a2e 0%, #16213e 100%)',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <Link to="/home" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <CloudServerOutlined style={{ fontSize: 28, color: '#1890ff' }} />
            <Text strong style={{ color: '#fff', fontSize: 20 }}>
              ReactERP
            </Text>
          </Link>
          <Link
            to="/home"
            style={{
              color: 'rgba(255,255,255,0.85)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <HomeOutlined />
            Home
          </Link>
        </div>

        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
          <Space style={{ cursor: 'pointer' }}>
            <Avatar
              style={{ backgroundColor: '#1890ff' }}
              icon={<UserOutlined />}
            />
            <div style={{ lineHeight: 1.2 }}>
              <Text style={{ color: '#fff', display: 'block', fontSize: 14 }}>
                {user?.name}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>
                {user?.role}
              </Text>
            </div>
          </Space>
        </Dropdown>
      </Header>

      <Content>
        <Outlet />
      </Content>
    </Layout>
  );
};

export default MainLayout;
