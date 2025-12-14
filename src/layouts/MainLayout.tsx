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

const { Content } = Layout;
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
        padding: '8px 24px',
        background: REDWOOD_PRIMARY,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        {/* Left side - Logo and App Name */}
        <Link to="/home" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <CloudServerOutlined style={{ fontSize: 24, color: '#fff' }} />
          <Text strong style={{ color: '#fff', fontSize: 18 }}>
            ReactERP
          </Text>
        </Link>

        {/* Right side - Icons */}
        <Space size={4}>
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
            <Badge count={99} size="small" offset={[-5, 5]} overflowCount={99}>
              <Button
                type="text"
                icon={<BellOutlined style={{ fontSize: 18, color: '#fff' }} />}
                style={{ color: '#fff' }}
              />
            </Badge>
          </Tooltip>
          <Tooltip title={user?.name || 'User Profile'}>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
              <Avatar
                size={32}
                src="https://randomuser.me/api/portraits/men/32.jpg"
                style={{ cursor: 'pointer', marginLeft: 8, border: '2px solid rgba(255,255,255,0.3)' }}
              />
            </Dropdown>
          </Tooltip>
        </Space>
      </div>

      <Content>
        <Outlet />
      </Content>
    </Layout>
  );
};

export default MainLayout;
