import React, { useState, useEffect, useCallback } from 'react';
import {
  Layout, Breadcrumb, Typography, Card, Table, Button, Form, Input,
  Switch, Tag, Space, Modal, Popconfirm, message, Tooltip, Badge, Divider,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, RobotOutlined, PlusOutlined, ReloadOutlined,
  EditOutlined, DeleteOutlined, CheckCircleOutlined, StopOutlined, EyeOutlined, EyeInvisibleOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';

const { Content } = Layout;
const { Title, Text } = Typography;

const REDWOOD = {
  primary: '#C74634', primaryLight: '#E85D4A', primaryDark: '#A33B2C',
  success: '#1D7B4D', warning: '#D4A800', info: '#0572CE',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral300: '#C7C7C7',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
};

const APEX_BASE = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp';

interface ClaudeKey {
  id: number;
  apiKey: string;
  description: string;
  isActive: string;
  createdBy: string;
  creationDate: string;
  lastUpdatedBy: string;
  lastUpdateDate: string;
}

const maskKey = (key: string) => {
  if (!key || key.length < 16) return key;
  return key.substring(0, 14) + '••••••••••••' + key.substring(key.length - 4);
};

const fmtDate = (d?: string) => d ? dayjs(d).format('D-MMM-YYYY HH:mm') : '—';

const ClaudeKeySettings: React.FC = () => {
  const [keys, setKeys]           = useState<ClaudeKey[]>([]);
  const [loading, setLoading]     = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState<ClaudeKey | null>(null);
  const [saving, setSaving]       = useState(false);
  const [revealId, setRevealId]   = useState<number | null>(null);
  const [form] = Form.useForm();

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${APEX_BASE}/admin/claudekeys`);
      const data = await res.json();
      if (data.status === 'success') {
        setKeys(data.items ?? []);
      } else {
        message.error(data.message || 'Failed to load keys.');
      }
    } catch (e: any) {
      message.error('Network error: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (rec: ClaudeKey) => {
    setEditing(rec);
    form.setFieldsValue({ description: rec.description, isActive: rec.isActive === 'Y' });
    setModalOpen(true);
  };

  const handleSave = async () => {
    let values: any;
    try { values = await form.validateFields(); } catch { return; }

    setSaving(true);
    try {
      if (editing) {
        // Update description / active flag
        const res  = await fetch(`${APEX_BASE}/admin/claudekeys/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: values.description ?? '',
            isActive:    values.isActive ? 'Y' : 'N',
            lastUpdatedBy: 'ERP_USER',
          }),
        });
        const data = await res.json();
        if (data.status === 'success') {
          message.success('Key updated.');
          setModalOpen(false);
          loadKeys();
        } else {
          message.error(data.message || 'Update failed.');
        }
      } else {
        // Insert new key
        const res  = await fetch(`${APEX_BASE}/admin/claudekeys`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey:      values.apiKey,
            description: values.description ?? '',
            isActive:    values.isActive ? 'Y' : 'N',
            createdBy:   'ERP_USER',
          }),
        });
        const data = await res.json();
        if (data.status === 'success') {
          message.success('Claude API key saved.');
          setModalOpen(false);
          loadKeys();
        } else {
          message.error(data.message || 'Save failed.');
        }
      }
    } catch (e: any) {
      message.error('Network error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (rec: ClaudeKey) => {
    const newFlag = rec.isActive === 'Y' ? 'N' : 'Y';
    try {
      const res  = await fetch(`${APEX_BASE}/admin/claudekeys/${rec.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newFlag, description: rec.description, lastUpdatedBy: 'ERP_USER' }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        message.success(newFlag === 'Y' ? 'Key activated.' : 'Key deactivated.');
        loadKeys();
      } else {
        message.error(data.message || 'Update failed.');
      }
    } catch (e: any) {
      message.error('Network error: ' + e.message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res  = await fetch(`${APEX_BASE}/admin/claudekeys/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.status === 'success') {
        message.success('Key deleted.');
        loadKeys();
      } else {
        message.error(data.message || 'Delete failed.');
      }
    } catch (e: any) {
      message.error('Network error: ' + e.message);
    }
  };

  const columns: ColumnsType<ClaudeKey> = [
    {
      title: 'Status',
      dataIndex: 'isActive',
      width: 90,
      align: 'center',
      render: (val: string) =>
        val === 'Y'
          ? <Badge status="success" text={<Text style={{ fontSize: 12, color: REDWOOD.success }}>Active</Text>} />
          : <Badge status="default" text={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Inactive</Text>} />,
      filters: [{ text: 'Active', value: 'Y' }, { text: 'Inactive', value: 'N' }],
      onFilter: (val, rec) => rec.isActive === val,
    },
    {
      title: 'API Key',
      dataIndex: 'apiKey',
      render: (val: string, rec: ClaudeKey) => (
        <Space>
          <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>
            {revealId === rec.id ? val : maskKey(val)}
          </Text>
          <Tooltip title={revealId === rec.id ? 'Hide' : 'Reveal'}>
            <Button
              type="text"
              size="small"
              icon={revealId === rec.id ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              onClick={() => setRevealId(prev => prev === rec.id ? null : rec.id)}
              style={{ color: REDWOOD.neutral600 }}
            />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      render: (val: string) => <Text style={{ fontSize: 12 }}>{val || <Text type="secondary">—</Text>}</Text>,
    },
    {
      title: 'Created By',
      dataIndex: 'createdBy',
      width: 120,
      render: (val: string) => <Text style={{ fontSize: 12 }}>{val || '—'}</Text>,
    },
    {
      title: 'Creation Date',
      dataIndex: 'creationDate',
      width: 160,
      render: fmtDate,
      sorter: (a, b) => (a.creationDate ?? '').localeCompare(b.creationDate ?? ''),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Last Updated',
      dataIndex: 'lastUpdateDate',
      width: 160,
      render: fmtDate,
    },
    {
      title: 'Actions',
      width: 130,
      align: 'center',
      render: (_, rec) => (
        <Space size={4}>
          <Tooltip title={rec.isActive === 'Y' ? 'Deactivate' : 'Activate'}>
            <Button
              size="small"
              type={rec.isActive === 'Y' ? 'default' : 'primary'}
              icon={rec.isActive === 'Y' ? <StopOutlined /> : <CheckCircleOutlined />}
              onClick={() => handleToggleActive(rec)}
              style={rec.isActive === 'Y'
                ? { color: REDWOOD.warning, borderColor: REDWOOD.warning }
                : { background: REDWOOD.success, borderColor: REDWOOD.success }}
            />
          </Tooltip>
          <Tooltip title="Edit description">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(rec)} />
          </Tooltip>
          <Popconfirm
            title="Delete this API key?"
            description="This action cannot be undone."
            onConfirm={() => handleDelete(rec.id)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Delete">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        <div style={{ padding: '14px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/admin">Administration</Link> },
            { title: 'Claude AI Key Settings' },
          ]} />
        </div>

        <div style={{ padding: 24 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 12,
                background: 'linear-gradient(135deg, #722ed1 0%, #531dab 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px #722ed140',
              }}>
                <RobotOutlined style={{ fontSize: 26, color: '#fff' }} />
              </div>
              <div>
                <Title level={3} style={{ margin: 0, color: REDWOOD.neutral900 }}>Claude AI Key Settings</Title>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Manage Anthropic Claude API keys used by AI agents (Bank Reconciliation, etc.)
                </Text>
              </div>
            </div>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={loadKeys} loading={loading}>Refresh</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}
                style={{ background: '#722ed1', borderColor: '#722ed1' }}>
                Add Key
              </Button>
            </Space>
          </div>

          {/* Info banner */}
          <Card style={{ marginBottom: 16, borderRadius: 8, background: '#f9f0ff', border: '1px solid #d3adf7' }}
            styles={{ body: { padding: '12px 16px' } }}>
            <Space>
              <RobotOutlined style={{ color: '#722ed1', fontSize: 16 }} />
              <Text style={{ fontSize: 13, color: '#531dab' }}>
                Only the <strong>active</strong> key is used. If multiple keys are active, the newest one takes precedence.
                Get your key from <Text code style={{ fontSize: 12 }}>console.anthropic.com → API Keys</Text>.
              </Text>
            </Space>
          </Card>

          {/* Table */}
          <Card style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }} styles={{ body: { padding: 0 } }}>
            <Table<ClaudeKey>
              columns={columns}
              dataSource={keys}
              rowKey="id"
              loading={loading}
              size="small"
              pagination={false}
              locale={{ emptyText: 'No API keys configured. Click "Add Key" to get started.' }}
              rowClassName={(rec) => rec.isActive === 'Y' ? 'claude-row-active' : ''}
            />
            <style>{`.claude-row-active td { background: #f9f0ff !important; }`}</style>
          </Card>
        </div>
      </Content>

      {/* Add / Edit Modal */}
      <Modal
        title={
          <Space>
            <RobotOutlined style={{ color: '#722ed1' }} />
            <span>{editing ? 'Edit Key Settings' : 'Add Claude API Key'}</span>
          </Space>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText={editing ? 'Save Changes' : 'Save Key'}
        okButtonProps={{ loading: saving, style: { background: '#722ed1', borderColor: '#722ed1' } }}
        width={520}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {!editing && (
            <Form.Item
              label="API Key"
              name="apiKey"
              rules={[
                { required: true, message: 'API key is required' },
                { pattern: /^sk-ant-/, message: 'Claude keys start with sk-ant-' },
              ]}
              extra={<Text type="secondary" style={{ fontSize: 12 }}>Starts with sk-ant-api03-…</Text>}
            >
              <Input.Password placeholder="sk-ant-api03-..." autoComplete="off" />
            </Form.Item>
          )}

          <Form.Item label="Description" name="description">
            <Input placeholder="e.g. Claude Sonnet — Production" maxLength={200} />
          </Form.Item>

          <Form.Item label="Active" name="isActive" valuePropName="checked" initialValue={true}>
            <Switch
              checkedChildren="Active"
              unCheckedChildren="Inactive"
              style={{ background: form.getFieldValue('isActive') ? '#722ed1' : undefined }}
            />
          </Form.Item>

          {editing && (
            <>
              <Divider style={{ margin: '8px 0' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Key: <Text code style={{ fontSize: 11 }}>{maskKey(editing.apiKey)}</Text>
                <br />To replace the key, delete this entry and add a new one.
              </Text>
            </>
          )}
        </Form>
      </Modal>
    </Layout>
  );
};

export default ClaudeKeySettings;
