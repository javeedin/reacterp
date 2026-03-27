import React, { useRef, useState } from 'react';
import { Modal, Avatar, Button, Upload, Progress, Typography, Space, Divider } from 'antd';
import { UserOutlined, CameraOutlined, DeleteOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';

const { Text, Title } = Typography;

const MAX_SIZE_MB = 2;

function resizeImage(file: File, maxPx = 400): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      const mimeType = 'image/jpeg';
      const dataUrl = canvas.toDataURL(mimeType, 0.75);
      const base64 = dataUrl.split(',')[1];
      resolve({ base64, mimeType });
    };
    img.onerror = reject;
    img.src = url;
  });
}

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ open, onClose }) => {
  const { user, uploadPhoto } = useAuth();
  const [loading, setLoading]   = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError]       = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File too large. Max size is ${MAX_SIZE_MB}MB.`);
      return;
    }
    setError('');
    setLoading(true);
    setProgress(30);
    try {
      const { base64, mimeType } = await resizeImage(file, 250);
      setProgress(60);
      const result = await uploadPhoto(user!.username, base64, mimeType);
      setProgress(100);
      if (result.status !== 'OK') setError(result.message || 'Upload failed.');
    } catch {
      setError('Failed to process image.');
    } finally {
      setLoading(false);
      setTimeout(() => setProgress(0), 800);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      width={400}
      centered
      destroyOnHidden
    >
      <div style={{ textAlign: 'center', padding: '8px 0 24px' }}>
        <Title level={4} style={{ marginBottom: 4 }}>My Profile</Title>
        <Text type="secondary" style={{ fontSize: 13 }}>{user?.email}</Text>
      </div>

      {/* Avatar */}
      <div style={{ textAlign: 'center', marginBottom: 24, position: 'relative', display: 'inline-block', width: '100%' }}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <Avatar
            size={120}
            src={user?.photo}
            icon={!user?.photo && <UserOutlined />}
            style={{ border: '3px solid #1677ff', boxShadow: '0 4px 16px rgba(22,119,255,0.2)' }}
          />
          <Button
            type="primary"
            shape="circle"
            icon={<CameraOutlined />}
            size="small"
            loading={loading}
            onClick={() => fileRef.current?.click()}
            style={{
              position: 'absolute', bottom: 4, right: 4,
              width: 32, height: 32, minWidth: 32,
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          />
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {progress > 0 && (
        <Progress percent={progress} size="small" style={{ marginBottom: 12 }} />
      )}

      {error && (
        <Text type="danger" style={{ display: 'block', textAlign: 'center', marginBottom: 12 }}>
          {error}
        </Text>
      )}

      <Divider style={{ margin: '8px 0 16px' }} />

      {/* User info */}
      <div style={{ padding: '0 8px' }}>
        <Space orientation="vertical" style={{ width: '100%' }} size={8}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text type="secondary">Name</Text>
            <Text strong>{user?.name}</Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text type="secondary">Username</Text>
            <Text strong>{user?.username}</Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text type="secondary">Role</Text>
            <Text strong>{user?.role}</Text>
          </div>
        </Space>
      </div>

      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <Button block onClick={() => fileRef.current?.click()} loading={loading} icon={<CameraOutlined />}>
          {user?.photo ? 'Change Photo' : 'Upload Photo'}
        </Button>
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 6 }}>
          JPG, PNG or WebP · Max {MAX_SIZE_MB}MB · Auto-resized to 400px
        </Text>
      </div>
    </Modal>
  );
};

export default ProfileModal;
