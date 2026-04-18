import React, { useState } from 'react';
import { Modal, Table, Tag, Button, Space, Tooltip, Typography, Input } from 'antd';
import { ApiOutlined, CopyOutlined, CheckOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

const { Text, Paragraph } = Typography;

export interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  description: string;
  params?: string;   // query params or path params note
  body?: string;     // JSON body fields summary
}

interface Props {
  title: string;
  endpoints: ApiEndpoint[];
  /** optional: override the trigger button */
  buttonStyle?: React.CSSProperties;
}

const METHOD_COLOR: Record<string, string> = {
  GET:    'blue',
  POST:   'green',
  PUT:    'orange',
  DELETE: 'red',
};

const ApiDocsModal: React.FC<Props> = ({ title, endpoints, buttonStyle }) => {
  const [open, setOpen]       = useState(false);
  const [copied, setCopied]   = useState<string | null>(null);
  const [filter, setFilter]   = useState('');

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  const filtered = filter
    ? endpoints.filter(e =>
        e.url.toLowerCase().includes(filter.toLowerCase()) ||
        e.description.toLowerCase().includes(filter.toLowerCase()) ||
        e.method.toLowerCase().includes(filter.toLowerCase()))
    : endpoints;

  const columns: ColumnsType<ApiEndpoint> = [
    {
      title: 'Method',
      dataIndex: 'method',
      width: 80,
      render: (m) => <Tag color={METHOD_COLOR[m]} style={{ fontWeight: 600, fontSize: 11 }}>{m}</Tag>,
    },
    {
      title: 'Endpoint URL',
      dataIndex: 'url',
      render: (url) => (
        <Space size={6}>
          <Text
            style={{
              fontFamily: 'monospace', fontSize: 12,
              background: '#f5f5f5', padding: '2px 6px',
              borderRadius: 4, wordBreak: 'break-all',
            }}
          >
            {url}
          </Text>
          <Tooltip title={copied === url ? 'Copied!' : 'Copy URL'}>
            <Button
              type="text" size="small"
              icon={copied === url ? <CheckOutlined style={{ color: '#52c41a' }} /> : <CopyOutlined />}
              onClick={() => copy(url)}
            />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Params / Body',
      width: 220,
      render: (_, rec) => (
        <div style={{ fontSize: 11, color: '#555' }}>
          {rec.params && (
            <div><Text type="secondary" style={{ fontSize: 10 }}>PARAMS</Text><br />{rec.params}</div>
          )}
          {rec.body && (
            <div style={{ marginTop: rec.params ? 4 : 0 }}>
              <Text type="secondary" style={{ fontSize: 10 }}>BODY</Text><br />{rec.body}
            </div>
          )}
          {!rec.params && !rec.body && <Text type="secondary">—</Text>}
        </div>
      ),
    },
  ];

  return (
    <>
      <Tooltip title="View API endpoints for this page">
        <Button
          size="small"
          icon={<ApiOutlined />}
          onClick={() => setOpen(true)}
          style={buttonStyle}
        >
          API
        </Button>
      </Tooltip>

      <Modal
        title={
          <Space>
            <ApiOutlined style={{ color: '#0572CE' }} />
            <span>API Endpoints — {title}</span>
            <Tag color="blue" style={{ fontSize: 11 }}>{endpoints.length} endpoints</Tag>
          </Space>
        }
        open={open}
        onCancel={() => { setOpen(false); setFilter(''); }}
        footer={<Button onClick={() => { setOpen(false); setFilter(''); }}>Close</Button>}
        width={960}
        styles={{ body: { padding: '12px 0' } }}
      >
        <div style={{ padding: '0 24px 10px' }}>
          <Input
            placeholder="Filter by URL, method or description…"
            allowClear
            size="small"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: 320 }}
          />
        </div>
        <Table<ApiEndpoint>
          dataSource={filtered}
          columns={columns}
          rowKey={(r) => `${r.method}-${r.url}`}
          size="small"
          pagination={false}
          scroll={{ y: 460 }}
          style={{ padding: '0 24px' }}
        />
      </Modal>
    </>
  );
};

export default ApiDocsModal;
