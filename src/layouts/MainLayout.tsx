import React from 'react';
import { Layout, Dropdown, Avatar, Space, Typography, Tooltip, Badge, Button } from 'antd';
import {
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
  HomeOutlined,
  CloudServerOutlined,
  StarOutlined,
  FlagOutlined,
  EyeOutlined,
  BellOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { MenuProps } from 'antd';

const { Header, Content } = Layout;
const { Text } = Typography;

// Oracle Redwood Color
const REDWOOD_PRIMARY = '#C74634';

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
      {/* Global Toolbar - Oracle Fusion Style */}
      <div style={{
        padding: '6px 24px',
        background: REDWOOD_PRIMARY,
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 4,
      }}>
        <Tooltip title="Home">
          <Button
            type="text"
            icon={<HomeOutlined style={{ fontSize: 18, color: '#fff' }} />}
            style={{ color: '#fff' }}
            onClick={() => navigate('/home')}
          />
        </Tooltip>
        <Tooltip title="Favorites">
          <Button
            type="text"
            icon={<StarOutlined style={{ fontSize: 18, color: '#fff' }} />}
            style={{ color: '#fff' }}
          />
        </Tooltip>
        <Tooltip title="Recent Items">
          <Button
            type="text"
            icon={<FlagOutlined style={{ fontSize: 18, color: '#fff' }} />}
            style={{ color: '#fff' }}
          />
        </Tooltip>
        <Tooltip title="Watchlist">
          <Button
            type="text"
            icon={<EyeOutlined style={{ fontSize: 18, color: '#fff' }} />}
            style={{ color: '#fff' }}
          />
        </Tooltip>
        <Tooltip title="Notifications">
          <Badge count={295} size="small" offset={[-5, 5]}>
            <Button
              type="text"
              icon={<BellOutlined style={{ fontSize: 18, color: '#fff' }} />}
              style={{ color: '#fff' }}
            />
          </Badge>
        </Tooltip>
        <Tooltip title="User Profile">
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
            <Avatar
              size={32}
              src="https://randomuser.me/api/portraits/men/32.jpg"
              style={{ cursor: 'pointer', marginLeft: 8, border: '2px solid rgba(255,255,255,0.3)' }}
            />
          </Dropdown>
        </Tooltip>
      </div>

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

        <Space style={{ cursor: 'pointer' }}>
          <div style={{ lineHeight: 1.2, textAlign: 'right' }}>
            <Text style={{ color: '#fff', display: 'block', fontSize: 14 }}>
              {user?.name}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>
              {user?.role}
            </Text>
          </div>
        </Space>
      </Header>

      <Content>
        <Outlet />
      </Content>
    </Layout>
  );
};

export default MainLayout;
