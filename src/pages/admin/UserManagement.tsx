import React, { useEffect, useState, useCallback } from 'react';
import {
  Layout, Breadcrumb, Typography, Table, Button, Input, Tag, Space,
  Modal, Form, Switch, Drawer, Tabs, Checkbox, Avatar, Tooltip,
  Popconfirm, message, Spin, Empty, Divider, Row, Col, Badge,
} from 'antd';
import {
  HomeOutlined, TeamOutlined, PlusOutlined, SearchOutlined,
  EditOutlined, LockOutlined, StopOutlined, CheckOutlined,
  AppstoreOutlined, BankOutlined, ReloadOutlined, UserOutlined,
  EyeInvisibleOutlined, EyeTwoTone,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';

const { Content } = Layout;
const { Title, Text } = Typography;

// ─── Oracle Redwood palette ────────────────────────────────────────────────
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
};

const APEX_ADMIN_BASE =
  'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/admin';

// ─── API types ─────────────────────────────────────────────────────────────
interface UserRecord {
  username: string;
  suspended_flag: string;   // 'Y' | 'N'
  is_admin: string;         // 'Y' | 'N'
  created_date: string;
}

interface ModuleRecord {
  module_code: string;
  module_name: string;
}

interface BURecord {
  bu_id: number;
  bu_name: string;
}

interface UserAccessData {
  status: string;
  is_admin: string;
  modules: string[];
  bus: Array<{ id: number; name: string }>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────
const avatarColor = (username: string) => {
  const palette = [
    REDWOOD.primary, REDWOOD.info, REDWOOD.success,
    '#7B68EE', '#FA8C16', '#13C2C2', '#EB2F96', '#722ED1',
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
};

const apiFetch = async (path: string, options?: RequestInit) => {
  const res = await fetch(`${APEX_ADMIN_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return res.json();
};

// ─── Sub-components ────────────────────────────────────────────────────────

/** Manage Access Drawer — Modules + Business Units tabs */
const ManageAccessDrawer: React.FC<{
  open: boolean;
  username: string | null;
  onClose: () => void;
}> = ({ open, username, onClose }) => {
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [allModules, setAllModules]       = useState<ModuleRecord[]>([]);
  const [allBUs, setAllBUs]               = useState<BURecord[]>([]);
  const [assignedModules, setAssignedModules] = useState<string[]>([]);
  const [assignedBUs, setAssignedBUs]         = useState<number[]>([]);
  const [savingModules, setSavingModules] = useState(false);
  const [savingBUs, setSavingBUs]         = useState(false);

  const load = useCallback(async () => {
    if (!username) return;
    setLoadingAccess(true);
    try {
      const [modsRes, busRes, accessRes] = await Promise.all([
        apiFetch('/modules'),
        apiFetch('/bus'),
        apiFetch(`/user-access/${encodeURIComponent(username)}`),
      ]);
      setAllModules(modsRes.modules ?? []);
      setAllBUs(busRes.bus ?? []);
      if (accessRes.status === 'OK') {
        setAssignedModules(accessRes.modules ?? []);
        setAssignedBUs((accessRes.bus ?? []).map((b: { id: number }) => b.id));
      }
    } catch {
      message.error('Failed to load access data.');
    } finally {
      setLoadingAccess(false);
    }
  }, [username]);

  useEffect(() => {
    if (open && username) load();
  }, [open, username, load]);

  // ── Module toggle ──────────────────────────────────────────────────────
  const handleModuleToggle = async (code: string, checked: boolean) => {
    if (!username) return;
    setSavingModules(true);
    try {
      const endpoint = checked ? '/user-access/assign-module' : '/user-access/remove-module';
      const body = { username, module_code: code };
      const res = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
      if (res.status === 'OK' || res.status === 'SUCCESS') {
        setAssignedModules(prev =>
          checked ? [...prev, code] : prev.filter(m => m !== code)
        );
      } else {
        message.error(res.message || 'Operation failed.');
      }
    } catch {
      message.error('Network error.');
    } finally {
      setSavingModules(false);
    }
  };

  // ── BU toggle ─────────────────────────────────────────────────────────
  const handleBUToggle = async (bu: BURecord, checked: boolean) => {
    if (!username) return;
    setSavingBUs(true);
    try {
      if (checked) {
        const res = await apiFetch('/user-access/assign-bu', {
          method: 'POST',
          body: JSON.stringify({ username, bu_id: bu.bu_id, bu_name: bu.bu_name }),
        });
        if (res.status === 'OK' || res.status === 'SUCCESS') {
          setAssignedBUs(prev => [...prev, bu.bu_id]);
        } else {
          message.error(res.message || 'Operation failed.');
        }
      } else {
        const res = await apiFetch('/user-access/remove-bu', {
          method: 'POST',
          body: JSON.stringify({ username, bu_id: bu.bu_id }),
        });
        if (res.status === 'OK' || res.status === 'SUCCESS') {
          setAssignedBUs(prev => prev.filter(id => id !== bu.bu_id));
        } else {
          message.error(res.message || 'Operation failed.');
        }
      }
    } catch {
      message.error('Network error.');
    } finally {
      setSavingBUs(false);
    }
  };

  const drawerTabs = [
    {
      key: 'modules',
      label: (
        <span>
          <AppstoreOutlined style={{ marginRight: 6 }} />
          Modules
        </span>
      ),
      children: (
        <Spin spinning={loadingAccess || savingModules}>
          {allModules.length === 0 && !loadingAccess ? (
            <Empty description="No modules found" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allModules.map(mod => {
                const checked = assignedModules.includes(mod.module_code);
                return (
                  <div
                    key={mod.module_code}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${checked ? REDWOOD.primary + '40' : REDWOOD.neutral200}`,
                      background: checked ? `${REDWOOD.primary}08` : REDWOOD.surface,
                      transition: 'all 0.2s',
                    }}
                  >
                    <Text style={{ fontSize: 14, color: REDWOOD.neutral900 }}>
                      {mod.module_name}
                    </Text>
                    <Switch
                      checked={checked}
                      size="small"
                      onChange={(val) => handleModuleToggle(mod.module_code, val)}
                      style={{ background: checked ? REDWOOD.primary : undefined }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Spin>
      ),
    },
    {
      key: 'bus',
      label: (
        <span>
          <BankOutlined style={{ marginRight: 6 }} />
          Business Units
        </span>
      ),
      children: (
        <Spin spinning={loadingAccess || savingBUs}>
          {allBUs.length === 0 && !loadingAccess ? (
            <Empty description="No business units found" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allBUs.map(bu => {
                const checked = assignedBUs.includes(bu.bu_id);
                return (
                  <div
                    key={bu.bu_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${checked ? REDWOOD.info + '40' : REDWOOD.neutral200}`,
                      background: checked ? `${REDWOOD.info}08` : REDWOOD.surface,
                      transition: 'all 0.2s',
                    }}
                  >
                    <Text style={{ fontSize: 14, color: REDWOOD.neutral900 }}>
                      {bu.bu_name}
                    </Text>
                    <Switch
                      checked={checked}
                      size="small"
                      onChange={(val) => handleBUToggle(bu, val)}
                      style={{ background: checked ? REDWOOD.info : undefined }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Spin>
      ),
    },
  ];

  return (
    <Drawer
      title={
        <Space>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `${REDWOOD.primary}15`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: REDWOOD.primary, fontSize: 16,
          }}>
            <AppstoreOutlined />
          </div>
          <span>Manage Access — <Text strong>{username}</Text></span>
        </Space>
      }
      open={open}
      onClose={onClose}
      width={440}
      destroyOnHidden
      extra={
        <Button icon={<ReloadOutlined />} onClick={load} size="small">
          Refresh
        </Button>
      }
    >
      <Tabs items={drawerTabs} />
    </Drawer>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────
const UserManagement: React.FC = () => {
  const [users, setUsers]           = useState<UserRecord[]>([]);
  const [loading, setLoading]       = useState(false);
  const [search, setSearch]         = useState('');

  // Create / Edit modal
  const [editModalOpen, setEditModalOpen]   = useState(false);
  const [editingUser, setEditingUser]       = useState<UserRecord | null>(null);
  const [editForm]                          = Form.useForm();
  const [savingUser, setSavingUser]         = useState(false);

  // Reset Password modal
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetTarget, setResetTarget]       = useState<string | null>(null);
  const [resetForm]                         = Form.useForm();
  const [savingReset, setSavingReset]       = useState(false);

  // Manage Access drawer
  const [accessDrawerOpen, setAccessDrawerOpen] = useState(false);
  const [accessTarget, setAccessTarget]         = useState<string | null>(null);

  // ── Load users ────────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/users');
      setUsers(data.users ?? []);
    } catch {
      message.error('Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // ── Filtered rows ──────────────────────────────────────────────────────
  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  // ── Create / Edit modal ────────────────────────────────────────────────
  const openCreate = () => {
    setEditingUser(null);
    editForm.resetFields();
    editForm.setFieldsValue({ is_admin: false, suspended_flag: false });
    setEditModalOpen(true);
  };

  const openEdit = (record: UserRecord) => {
    setEditingUser(record);
    editForm.setFieldsValue({
      username: record.username,
      is_admin: record.is_admin === 'Y',
      suspended_flag: record.suspended_flag === 'Y',
    });
    setEditModalOpen(true);
  };

  const handleSaveUser = async () => {
    let values: { username: string; is_admin: boolean; suspended_flag: boolean };
    try {
      values = await editForm.validateFields();
    } catch { return; }

    setSavingUser(true);
    try {
      if (editingUser) {
        // Update
        const res = await apiFetch('/users/update', {
          method: 'POST',
          body: JSON.stringify({
            username: values.username,
            is_admin: values.is_admin ? 'Y' : 'N',
            suspended_flag: values.suspended_flag ? 'Y' : 'N',
          }),
        });
        if (res.status === 'OK' || res.status === 'SUCCESS') {
          message.success('User updated.');
          setEditModalOpen(false);
          loadUsers();
        } else {
          message.error(res.message || 'Update failed.');
        }
      } else {
        // Create
        const res = await apiFetch('/users', {
          method: 'POST',
          body: JSON.stringify({
            username: values.username,
            is_admin: values.is_admin ? 'Y' : 'N',
          }),
        });
        if (res.status === 'OK' || res.status === 'SUCCESS') {
          message.success('User created.');
          setEditModalOpen(false);
          loadUsers();
        } else {
          message.error(res.message || 'Create failed.');
        }
      }
    } catch {
      message.error('Network error.');
    } finally {
      setSavingUser(false);
    }
  };

  // ── Toggle Status ──────────────────────────────────────────────────────
  const handleToggleStatus = async (record: UserRecord) => {
    const newFlag = record.suspended_flag === 'Y' ? 'N' : 'Y';
    try {
      const res = await apiFetch('/users/update', {
        method: 'POST',
        body: JSON.stringify({
          username: record.username,
          is_admin: record.is_admin,
          suspended_flag: newFlag,
        }),
      });
      if (res.status === 'OK' || res.status === 'SUCCESS') {
        message.success(newFlag === 'Y' ? 'User suspended.' : 'User activated.');
        loadUsers();
      } else {
        message.error(res.message || 'Operation failed.');
      }
    } catch {
      message.error('Network error.');
    }
  };

  // ── Reset Password modal ───────────────────────────────────────────────
  const openReset = (username: string) => {
    setResetTarget(username);
    resetForm.resetFields();
    setResetModalOpen(true);
  };

  const handleResetPassword = async () => {
    let values: { new_password: string; confirm_password: string };
    try {
      values = await resetForm.validateFields();
    } catch { return; }

    if (values.new_password !== values.confirm_password) {
      resetForm.setFields([{ name: 'confirm_password', errors: ['Passwords do not match.'] }]);
      return;
    }

    setSavingReset(true);
    try {
      const res = await apiFetch('/users/reset-password', {
        method: 'POST',
        body: JSON.stringify({ username: resetTarget, new_password: values.new_password }),
      });
      if (res.status === 'OK' || res.status === 'SUCCESS') {
        message.success(`Password reset for ${resetTarget}.`);
        setResetModalOpen(false);
      } else {
        message.error(res.message || 'Reset failed.');
      }
    } catch {
      message.error('Network error.');
    } finally {
      setSavingReset(false);
    }
  };

  // ── Table columns ──────────────────────────────────────────────────────
  const columns: ColumnsType<UserRecord> = [
    {
      title: 'User',
      key: 'user',
      width: 260,
      render: (_, record) => (
        <Space>
          <Avatar
            size={36}
            style={{
              background: avatarColor(record.username),
              color: '#fff',
              fontWeight: 600,
              fontSize: 15,
              flexShrink: 0,
            }}
          >
            {record.username.charAt(0).toUpperCase()}
          </Avatar>
          <div>
            <div style={{ fontWeight: 500, color: REDWOOD.neutral900, lineHeight: 1.3 }}>
              {record.username}
            </div>
            <div style={{ fontSize: 12, color: REDWOOD.neutral600 }}>
              {record.username}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 110,
      render: (_, record) =>
        record.suspended_flag === 'Y' ? (
          <Badge
            status="error"
            text={<Text style={{ fontSize: 13, color: '#CF1322' }}>Suspended</Text>}
          />
        ) : (
          <Badge
            status="success"
            text={<Text style={{ fontSize: 13, color: REDWOOD.success }}>Active</Text>}
          />
        ),
      filters: [
        { text: 'Active', value: 'N' },
        { text: 'Suspended', value: 'Y' },
      ],
      onFilter: (value, record) => record.suspended_flag === value,
    },
    {
      title: 'Admin',
      key: 'admin',
      width: 80,
      render: (_, record) =>
        record.is_admin === 'Y' ? (
          <Tag
            color="red"
            style={{ borderRadius: 4, fontSize: 11, padding: '0 6px' }}
          >
            Admin
          </Tag>
        ) : null,
      filters: [
        { text: 'Admin', value: 'Y' },
        { text: 'Standard', value: 'N' },
      ],
      onFilter: (value, record) => record.is_admin === value,
    },
    {
      title: 'Created',
      dataIndex: 'created_date',
      key: 'created_date',
      width: 160,
      render: (val: string) => {
        if (!val) return <Text type="secondary">—</Text>;
        try {
          return (
            <Text style={{ fontSize: 13 }}>
              {new Date(val).toLocaleDateString('en-AE', {
                year: 'numeric', month: 'short', day: '2-digit',
              })}
            </Text>
          );
        } catch { return <Text style={{ fontSize: 13 }}>{val}</Text>; }
      },
      sorter: (a, b) =>
        new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime(),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="Edit User">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEdit(record)}
              style={{ color: REDWOOD.info }}
            />
          </Tooltip>
          <Tooltip title="Reset Password">
            <Button
              type="text"
              size="small"
              icon={<LockOutlined />}
              onClick={() => openReset(record.username)}
              style={{ color: REDWOOD.warning }}
            />
          </Tooltip>
          <Tooltip title={record.suspended_flag === 'Y' ? 'Activate User' : 'Suspend User'}>
            <Popconfirm
              title={`${record.suspended_flag === 'Y' ? 'Activate' : 'Suspend'} ${record.username}?`}
              onConfirm={() => handleToggleStatus(record)}
              okText="Yes"
              cancelText="No"
              okButtonProps={{
                style: { background: REDWOOD.primary, borderColor: REDWOOD.primary },
              }}
            >
              <Button
                type="text"
                size="small"
                icon={record.suspended_flag === 'Y' ? <CheckOutlined /> : <StopOutlined />}
                style={{ color: record.suspended_flag === 'Y' ? REDWOOD.success : '#CF1322' }}
              />
            </Popconfirm>
          </Tooltip>
          <Tooltip title="Manage Access">
            <Button
              type="text"
              size="small"
              icon={<AppstoreOutlined />}
              onClick={() => { setAccessTarget(record.username); setAccessDrawerOpen(true); }}
              style={{ color: REDWOOD.primary }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb */}
        <div style={{
          padding: '14px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
        }}>
          <Breadcrumb
            items={[
              { title: <Link to="/home"><HomeOutlined /> Home</Link> },
              { title: <Link to="/admin">Administration</Link> },
              { title: 'User Management' },
            ]}
          />
        </div>

        {/* Page Body */}
        <div style={{ padding: 24 }}>
          {/* Page Header */}
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 10,
                background: `linear-gradient(135deg, ${REDWOOD.primary} 0%, ${REDWOOD.primaryDark} 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 4px 12px ${REDWOOD.primary}40`,
              }}>
                <TeamOutlined style={{ fontSize: 24, color: '#fff' }} />
              </div>
              <div>
                <Title level={3} style={{ margin: 0, color: REDWOOD.neutral900 }}>
                  User Management
                </Title>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Manage user accounts, roles, and access permissions
                </Text>
              </div>
            </div>

            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={loadUsers}
                loading={loading}
                style={{ borderColor: REDWOOD.neutral300 }}
              >
                Refresh
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={openCreate}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
              >
                Create User
              </Button>
            </Space>
          </div>

          {/* Search */}
          <div style={{ marginBottom: 16 }}>
            <Input
              prefix={<SearchOutlined style={{ color: REDWOOD.neutral600 }} />}
              placeholder="Search by username…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
              style={{ maxWidth: 320, borderRadius: 6 }}
            />
          </div>

          {/* Table */}
          <div style={{
            background: REDWOOD.surface,
            borderRadius: 10,
            border: `1px solid ${REDWOOD.neutral200}`,
            overflow: 'hidden',
          }}>
            <Table<UserRecord>
              columns={columns}
              dataSource={filteredUsers}
              rowKey="username"
              loading={loading}
              pagination={{
                pageSize: 15,
                showSizeChanger: true,
                showTotal: (total) => `${total} user${total !== 1 ? 's' : ''}`,
                style: { padding: '12px 16px' },
              }}
              scroll={{ x: 760 }}
              locale={{ emptyText: <Empty description="No users found" /> }}
              size="middle"
            />
          </div>
        </div>
      </Content>

      {/* ── Create / Edit Modal ──────────────────────────────────────── */}
      <Modal
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onOk={handleSaveUser}
        confirmLoading={savingUser}
        title={
          <Space>
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: `${REDWOOD.primary}15`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: REDWOOD.primary, fontSize: 14,
            }}>
              <UserOutlined />
            </div>
            {editingUser ? 'Edit User' : 'Create User'}
          </Space>
        }
        okText={editingUser ? 'Save Changes' : 'Create User'}
        okButtonProps={{ style: { background: REDWOOD.primary, borderColor: REDWOOD.primary } }}
        width={440}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="Username (Email)"
            name="username"
            rules={[
              { required: true, message: 'Username is required.' },
              { type: 'email', message: 'Must be a valid email address.' },
            ]}
          >
            <Input
              prefix={<UserOutlined style={{ color: REDWOOD.neutral600 }} />}
              placeholder="user@example.com"
              disabled={!!editingUser}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Administrator"
                name="is_admin"
                valuePropName="checked"
              >
                <Switch
                  checkedChildren="Yes"
                  unCheckedChildren="No"
                  style={{ background: editForm.getFieldValue('is_admin') ? REDWOOD.primary : undefined }}
                />
              </Form.Item>
            </Col>
            {editingUser && (
              <Col span={12}>
                <Form.Item
                  label="Suspended"
                  name="suspended_flag"
                  valuePropName="checked"
                >
                  <Switch
                    checkedChildren="Yes"
                    unCheckedChildren="No"
                    style={{ background: editForm.getFieldValue('suspended_flag') ? '#CF1322' : undefined }}
                  />
                </Form.Item>
              </Col>
            )}
          </Row>
        </Form>
      </Modal>

      {/* ── Reset Password Modal ────────────────────────────────────── */}
      <Modal
        open={resetModalOpen}
        onCancel={() => setResetModalOpen(false)}
        onOk={handleResetPassword}
        confirmLoading={savingReset}
        title={
          <Space>
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: `${REDWOOD.warning}20`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: REDWOOD.warning, fontSize: 14,
            }}>
              <LockOutlined />
            </div>
            Reset Password — <Text strong>{resetTarget}</Text>
          </Space>
        }
        okText="Reset Password"
        okButtonProps={{ style: { background: REDWOOD.primary, borderColor: REDWOOD.primary } }}
        width={400}
        destroyOnHidden
      >
        <div style={{ marginBottom: 12, marginTop: 16 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Set a new password for this user directly. No OTP required.
          </Text>
        </div>
        <Form form={resetForm} layout="vertical">
          <Form.Item
            label="New Password"
            name="new_password"
            rules={[
              { required: true, message: 'New password is required.' },
              { min: 8, message: 'Password must be at least 8 characters.' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: REDWOOD.neutral600 }} />}
              iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
              placeholder="Enter new password"
            />
          </Form.Item>
          <Form.Item
            label="Confirm Password"
            name="confirm_password"
            dependencies={['new_password']}
            rules={[
              { required: true, message: 'Please confirm the password.' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) return Promise.resolve();
                  return Promise.reject(new Error('Passwords do not match.'));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: REDWOOD.neutral600 }} />}
              iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
              placeholder="Confirm new password"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Manage Access Drawer ────────────────────────────────────── */}
      <ManageAccessDrawer
        open={accessDrawerOpen}
        username={accessTarget}
        onClose={() => { setAccessDrawerOpen(false); setAccessTarget(null); }}
      />
    </Layout>
  );
};

export default UserManagement;
