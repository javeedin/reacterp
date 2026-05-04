import React, { useState } from 'react';
import {
  Drawer, Button, Badge, Tag, Typography, Space, Tooltip, Empty, Spin,
  Table, Select,
} from 'antd';
import {
  BellOutlined, CheckOutlined, DeleteOutlined, ReloadOutlined,
  WarningOutlined, InfoCircleOutlined, CloseCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useNotifications, type AppNotification, type NotificationModule } from '../context/NotificationContext';

const { Text } = Typography;

const MODULES: { label: string; value: 'All' | NotificationModule }[] = [
  { label: 'All',     value: 'All'     },
  { label: 'General', value: 'General' },
  { label: 'GL',      value: 'GL'      },
  { label: 'AP',      value: 'AP'      },
  { label: 'AR',      value: 'AR'      },
  { label: 'CM',      value: 'CM'      },
  { label: 'RM',      value: 'RM'      },
  { label: 'FA',      value: 'FA'      },
  { label: 'PMS',     value: 'PMS'     },
];

const SEVERITY_ICON: Record<string, React.ReactNode> = {
  error:   <CloseCircleOutlined style={{ color: '#C74634' }} />,
  warning: <WarningOutlined     style={{ color: '#D4A800' }} />,
  info:    <InfoCircleOutlined  style={{ color: '#0572CE' }} />,
};

const STATUS_COLOR: Record<string, string> = {
  Unread:   'red',
  Read:     'default',
  Actioned: 'green',
};

const MODULE_COLOR: Record<string, string> = {
  AP: 'purple', GL: 'blue', AR: 'cyan', CM: 'geekblue',
  RM: 'volcano', FA: 'orange', PMS: 'magenta', General: 'default',
};

const NotificationPanel: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { notifications, unreadCount, markRead, markAllRead, clearAll, refreshPdcNotifications, pdcChecking } = useNotifications();
  const [activeModule, setActiveModule] = useState<'All' | NotificationModule>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  const filtered = notifications.filter(n => {
    if (activeModule !== 'All' && n.module !== activeModule) return false;
    if (statusFilter !== 'All' && n.status !== statusFilter) return false;
    return true;
  });

  const columns: ColumnsType<AppNotification> = [
    {
      title: 'Module',
      dataIndex: 'module',
      key: 'module',
      width: 72,
      render: (v: string) => <Tag color={MODULE_COLOR[v] || 'default'} style={{ fontSize: 10, margin: 0 }}>{v}</Tag>,
    },
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      width: 90,
      render: (v: string) => <Text style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{v ? dayjs(v).format('DD-MMM-YY') : '—'}</Text>,
    },
    {
      title: 'Transaction',
      dataIndex: 'transaction',
      key: 'transaction',
      width: 100,
      render: (v: string, record: AppNotification) => (
        <Space size={4}>
          {SEVERITY_ICON[record.severity || 'info']}
          <Text style={{ fontSize: 11 }}>{v}</Text>
        </Space>
      ),
    },
    {
      title: 'Trx No',
      dataIndex: 'trxNo',
      key: 'trxNo',
      width: 90,
      render: (v: string) => <Text style={{ fontSize: 11, color: '#0572CE' }}>{v || '—'}</Text>,
    },
    {
      title: 'Notification Details',
      dataIndex: 'details',
      key: 'details',
      render: (v: string, record: AppNotification) => (
        <Text
          style={{
            fontSize: 11,
            fontWeight: record.status === 'Unread' ? 600 : undefined,
            color: record.severity === 'error' ? '#C74634' : record.severity === 'warning' ? '#8a6000' : '#1A1A1A',
          }}
        >
          {v}
        </Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 76,
      render: (v: string) => <Tag color={STATUS_COLOR[v] || 'default'} style={{ fontSize: 10, margin: 0 }}>{v}</Tag>,
    },
    {
      title: '',
      key: 'action',
      width: 36,
      render: (_: any, record: AppNotification) =>
        record.status === 'Unread' ? (
          <Tooltip title="Mark as read">
            <Button type="text" size="small" icon={<CheckOutlined style={{ color: '#1D7B4D', fontSize: 12 }} />} onClick={() => markRead(record.id)} />
          </Tooltip>
        ) : null,
    },
  ];

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space>
            <BellOutlined style={{ color: '#722ed1', fontSize: 16 }} />
            <span style={{ fontWeight: 600 }}>Notifications</span>
            {unreadCount > 0 && <Badge count={unreadCount} style={{ background: '#C74634' }} />}
          </Space>
          <Space size={4}>
            <Tooltip title="Refresh PDC maturity notifications">
              <Button size="small" icon={<ReloadOutlined spin={pdcChecking} />} onClick={refreshPdcNotifications} loading={pdcChecking} />
            </Tooltip>
            <Tooltip title="Mark all read">
              <Button size="small" icon={<CheckOutlined />} onClick={markAllRead} disabled={unreadCount === 0} />
            </Tooltip>
            <Tooltip title="Clear all">
              <Button size="small" danger icon={<DeleteOutlined />} onClick={clearAll} disabled={notifications.length === 0} />
            </Tooltip>
          </Space>
        </div>
      }
      open={open}
      onClose={onClose}
      width={900}
      styles={{ body: { padding: '12px 16px', background: '#F7F7F7' } }}
      closable
    >
      {/* Module filter toggles */}
      <div style={{ marginBottom: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {MODULES.map(m => {
          const cnt = m.value === 'All'
            ? notifications.filter(n => n.status === 'Unread').length
            : notifications.filter(n => n.module === m.value && n.status === 'Unread').length;
          const active = activeModule === m.value;
          return (
            <Badge key={m.value} count={cnt} size="small" offset={[-4, 4]}>
              <Button
                size="small"
                type={active ? 'primary' : 'default'}
                onClick={() => setActiveModule(m.value)}
                style={{
                  borderRadius: 14,
                  fontSize: 12,
                  fontWeight: active ? 600 : undefined,
                  background: active ? '#722ed1' : undefined,
                  borderColor: active ? '#722ed1' : undefined,
                }}
              >
                {m.label}
              </Button>
            </Badge>
          );
        })}
        <div style={{ marginLeft: 'auto' }}>
          <Select
            size="small"
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 110 }}
            options={[
              { value: 'All',      label: 'All Status'  },
              { value: 'Unread',   label: 'Unread'      },
              { value: 'Read',     label: 'Read'        },
              { value: 'Actioned', label: 'Actioned'    },
            ]}
          />
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
          {pdcChecking
            ? <Spin tip="Checking for notifications…" />
            : <Empty description="No notifications" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          }
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #E5E5E5', overflow: 'hidden' }}>
          <Table
            columns={columns}
            dataSource={filtered}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 15, size: 'small', showTotal: t => `${t} notifications` }}
            rowClassName={(r: AppNotification) => r.status === 'Unread' ? 'notif-unread-row' : ''}
            onRow={(record: AppNotification) => ({
              onClick: () => record.status === 'Unread' && markRead(record.id),
              style: { cursor: record.status === 'Unread' ? 'pointer' : 'default' },
            })}
          />
        </div>
      )}

      <style>{`
        .notif-unread-row td { background: #fdf4ff !important; }
        .notif-unread-row:hover td { background: #f5e6ff !important; }
      `}</style>
    </Drawer>
  );
};

export default NotificationPanel;
