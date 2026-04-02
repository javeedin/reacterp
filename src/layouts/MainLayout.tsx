import React, { useState, useEffect } from 'react';
import { Layout, Dropdown, Avatar, Space, Typography, Tooltip, Badge, Button, Modal } from 'antd';
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
  DownloadOutlined,
  ShareAltOutlined,
  PlusSquareOutlined,
  ProfileOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ProfileModal from '../components/ProfileModal';
import SupportTicketButton from '../components/SupportTicketButton';
import type { MenuProps } from 'antd';

// Type for BeforeInstallPromptEvent
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Detect iOS device
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

// Detect if in standalone mode (already installed)
const isInStandaloneMode = () => {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
};

const { Content } = Layout;
const { Text } = Typography;

// Oracle Redwood Color
const REDWOOD_PRIMARY = '#C74634';

const MainLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // Listen for PWA install prompt
  useEffect(() => {
    // Check if already installed
    if (isInStandaloneMode()) {
      setIsInstalled(true);
      return;
    }

    // Show install button for iOS (manual instructions needed)
    if (isIOS()) {
      setShowInstallButton(true);
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      setShowInstallButton(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setShowInstallButton(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    // iOS - show instructions modal
    if (isIOS()) {
      setShowIOSModal(true);
      return;
    }

    // Android/Desktop - use native prompt
    if (!installPrompt) return;

    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;

    if (outcome === 'accepted') {
      setInstallPrompt(null);
      setShowInstallButton(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'My Profile',
      onClick: () => setShowProfile(true),
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
          {/* Install App Button - shows on iOS, Android, and Desktop when installable */}
          {showInstallButton && !isInstalled && (
            <Tooltip title="Install App">
              <Button
                type="text"
                icon={<DownloadOutlined style={{ fontSize: 18, color: '#fff' }} />}
                style={{
                  color: '#fff',
                  background: 'rgba(255,255,255,0.15)',
                  borderRadius: 4,
                }}
                onClick={handleInstallClick}
              />
            </Tooltip>
          )}
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
          <Tooltip title="My Tickets" placement="bottom">
            <Button
              type="text"
              icon={<ProfileOutlined style={{ fontSize: 16, color: '#fff' }} />}
              onClick={() => navigate('/support/my-tickets')}
              style={{ color: '#fff' }}
            />
          </Tooltip>
          <SupportTicketButton />
          <Tooltip title={user?.name || 'User Profile'}>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
              <Avatar
                size={32}
                src={user?.photo}
                icon={!user?.photo && <UserOutlined />}
                style={{ cursor: 'pointer', marginLeft: 8, border: '2px solid rgba(255,255,255,0.3)', background: !user?.photo ? '#1677ff' : undefined }}
              />
            </Dropdown>
          </Tooltip>
        </Space>
      </div>

      <Content>
        <Outlet />
      </Content>

      {/* iOS Install Instructions Modal */}
      <Modal
        title="Install ReactERP App"
        open={showIOSModal}
        onCancel={() => setShowIOSModal(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setShowIOSModal(false)}>
            Got it!
          </Button>
        ]}
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Text style={{ fontSize: 16, display: 'block', marginBottom: 24 }}>
            Install ReactERP on your iPhone/iPad:
          </Text>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: '#f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <ShareAltOutlined style={{ fontSize: 20, color: '#0572CE' }} />
              </div>
              <div>
                <Text strong>Step 1:</Text>
                <Text style={{ display: 'block' }}>
                  Tap the <ShareAltOutlined /> Share button in Safari
                </Text>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: '#f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <PlusSquareOutlined style={{ fontSize: 20, color: '#0572CE' }} />
              </div>
              <div>
                <Text strong>Step 2:</Text>
                <Text style={{ display: 'block' }}>
                  Scroll down and tap "Add to Home Screen"
                </Text>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: REDWOOD_PRIMARY,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 'bold',
              }}>
                R
              </div>
              <div>
                <Text strong>Step 3:</Text>
                <Text style={{ display: 'block' }}>
                  Tap "Add" to install the app
                </Text>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </Layout>
  );
};

export default MainLayout;
