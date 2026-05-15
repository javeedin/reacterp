import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Layout, Breadcrumb, Typography, Card, Table, Input, Row, Col, Spin, Alert,
  Tag, Select, Drawer, List, Badge,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { HomeOutlined, AppstoreOutlined, SearchOutlined, CloseOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';

const { Content } = Layout;
const { Title, Text } = Typography;

const ORDS_BASE = 'https://g827cd88c3cfc03-mitsumioracledb.adb.me-dubai-1.oraclecloudapps.com/ords/test/FUSIONCLIENTERP';

const REDWOOD = {
  primary: '#C74634', primaryDark: '#A33B2C', primaryLight: '#E85D4A',
  success: '#1D7B4D', warning: '#D4A800', info: '#0572CE', error: '#D93025',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral300: '#C7C7C7',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
  teal: '#00918A',
};

interface ItemRow {
  inventory_item_id: string;
  item_number: string;
  description: string;
  primary_uom_code: string;
  inventory_item_status_code: string;
  organization_code: string;
  sales_account: string;
  item_price: string;
  barcode: string | null;
  old_item_code: string;
  inventory_item_flag: string;
  stock_enabled_flag: string;
  inventory_asset_flag: string;
  attribute1: string;
  attribute2: string;
  attribute3: string;
  attribute4: string;
  attribute5: string;
  attribute6: string;
  attribute7: string;
  attribute8: string;
  attribute9: string;
  attribute10: string;
}

const ATTR_LABELS: Record<string, string> = {
  attribute1: 'Brand',
  attribute2: 'Type',
  attribute3: 'RMA',
  attribute4: 'Rep Status',
  attribute5: 'Category',
};

const fetchAllPages = async (): Promise<ItemRow[]> => {
  const all: ItemRow[] = [];
  let offset = 0;
  const limit = 500;
  while (true) {
    const r = await fetch(`${ORDS_BASE}/inventory/itemmaster?limit=${limit}&offset=${offset}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const items: ItemRow[] = Array.isArray(d) ? d : (d.items ?? []);
    all.push(...items);
    if (!d.hasMore || items.length < limit) break;
    offset += limit;
  }
  return all;
};

interface DrawerState {
  open: boolean;
  attrKey: string;
  attrLabel: string;
  values: { value: string; count: number }[];
}

const ItemMaster: React.FC = () => {
  const [data, setData] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [orgFilter, setOrgFilter] = useState<string>('');
  const [drawer, setDrawer] = useState<DrawerState>({ open: false, attrKey: '', attrLabel: '', values: [] });

  useEffect(() => {
    fetchAllPages()
      .then(rows => setData(rows))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const orgOptions = useMemo(() => {
    const set = new Set(data.map(r => r.organization_code).filter(Boolean));
    return Array.from(set).sort().map(v => ({ label: v, value: v }));
  }, [data]);

  const statusOptions = useMemo(() => {
    const set = new Set(data.map(r => r.inventory_item_status_code).filter(Boolean));
    return Array.from(set).sort().map(v => ({ label: v, value: v }));
  }, [data]);

  const attrDistinct = useCallback((key: keyof ItemRow) => {
    const map = new Map<string, number>();
    data.forEach(row => {
      const v = String(row[key] ?? '').trim() || '(blank)';
      map.set(v, (map.get(v) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  const openDrawer = (attrKey: string, attrLabel: string) => {
    setDrawer({ open: true, attrKey, attrLabel, values: attrDistinct(attrKey as keyof ItemRow) });
  };

  const filtered = useMemo(() => {
    return data.filter(row => {
      if (statusFilter && row.inventory_item_status_code !== statusFilter) return false;
      if (orgFilter && row.organization_code !== orgFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!row.item_number.toLowerCase().includes(q) && !row.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [data, search, statusFilter, orgFilter]);

  const kpiAttrs = ['attribute1', 'attribute2', 'attribute3', 'attribute4', 'attribute5'] as const;

  const columns: ColumnsType<ItemRow> = [
    { title: 'Item Number', dataIndex: 'item_number', key: 'item_number', width: 130, fixed: 'left', ellipsis: true },
    { title: 'Description', dataIndex: 'description', key: 'description', width: 260, ellipsis: true },
    { title: 'Org', dataIndex: 'organization_code', key: 'organization_code', width: 70 },
    { title: 'UOM', dataIndex: 'primary_uom_code', key: 'primary_uom_code', width: 70 },
    {
      title: 'Status', dataIndex: 'inventory_item_status_code', key: 'status', width: 90,
      render: (v: string) => (
        <Tag style={{ borderRadius: 10, fontSize: 11 }} color={v === 'Active' ? 'success' : 'error'}>
          {v || '—'}
        </Tag>
      ),
    },
    {
      title: 'Price', dataIndex: 'item_price', key: 'item_price', width: 80,
      render: v => (v && v.trim()) ? v.trim() : '—',
    },
    {
      title: 'Inv Flag', dataIndex: 'inventory_item_flag', key: 'inventory_item_flag', width: 80,
      render: v => v === 'Y' ? <Tag color="success" style={{ fontSize: 10 }}>Y</Tag> : <Tag style={{ fontSize: 10 }}>{v || '—'}</Tag>,
    },
    {
      title: 'Stock Flag', dataIndex: 'stock_enabled_flag', key: 'stock_enabled_flag', width: 90,
      render: v => v === 'Y' ? <Tag color="success" style={{ fontSize: 10 }}>Y</Tag> : <Tag style={{ fontSize: 10 }}>{v || '—'}</Tag>,
    },
    {
      title: 'Asset Flag', dataIndex: 'inventory_asset_flag', key: 'inventory_asset_flag', width: 90,
      render: v => v === 'Y' ? <Tag color="success" style={{ fontSize: 10 }}>Y</Tag> : <Tag style={{ fontSize: 10 }}>{v || '—'}</Tag>,
    },
    { title: 'Brand', dataIndex: 'attribute1', key: 'attribute1', width: 100, ellipsis: true, render: v => v || '—' },
    { title: 'Type', dataIndex: 'attribute2', key: 'attribute2', width: 100, ellipsis: true, render: v => v || '—' },
    { title: 'RMA', dataIndex: 'attribute3', key: 'attribute3', width: 80, render: v => v || '—' },
    { title: 'Rep Status', dataIndex: 'attribute4', key: 'attribute4', width: 100, render: v => v || '—' },
    { title: 'Category', dataIndex: 'attribute5', key: 'attribute5', width: 100, render: v => v || '—' },
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        <div style={{ padding: '14px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/procurement">Procurement</Link> },
            { title: 'Item Master' },
          ]} />
        </div>

        <div style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 12,
              background: `linear-gradient(135deg, ${REDWOOD.success} 0%, #155E3A 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 14px ${REDWOOD.success}40`,
            }}>
              <AppstoreOutlined style={{ fontSize: 26, color: '#fff' }} />
            </div>
            <div>
              <Title level={2} style={{ margin: 0, color: REDWOOD.neutral900 }}>Item Master</Title>
              <Text type="secondary">Item catalog with attributes, pricing and flags</Text>
            </div>
          </div>

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
              <Spin size="large" />
            </div>
          )}

          {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

          {!loading && !error && (
            <>
              <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
                <Col xs={24} sm={8} md={4}>
                  <Card style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, textAlign: 'center' }} styles={{ body: { padding: '14px 12px' } }}>
                    <Text style={{ fontSize: 24, fontWeight: 700, color: REDWOOD.success, display: 'block' }}>{data.length.toLocaleString()}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>Total Items</Text>
                  </Card>
                </Col>
                {kpiAttrs.map(attr => {
                  const distinct = attrDistinct(attr as keyof ItemRow);
                  const label = ATTR_LABELS[attr] ?? attr;
                  return (
                    <Col xs={24} sm={8} md={4} key={attr}>
                      <Card
                        hoverable
                        onClick={() => openDrawer(attr, label)}
                        style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, textAlign: 'center', cursor: 'pointer' }}
                        styles={{ body: { padding: '14px 12px' } }}
                      >
                        <Text style={{ fontSize: 24, fontWeight: 700, color: REDWOOD.info, display: 'block' }}>{distinct.length}</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {label}
                          <span style={{ display: 'block', fontSize: 10, color: REDWOOD.neutral300 }}>distinct values</span>
                        </Text>
                      </Card>
                    </Col>
                  );
                })}
              </Row>

              <Card style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }} styles={{ body: { padding: 0 } }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${REDWOOD.neutral200}`, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Input
                    placeholder="Search by item number or description..."
                    prefix={<SearchOutlined style={{ color: REDWOOD.neutral600 }} />}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    allowClear
                    style={{ width: 320 }}
                  />
                  <Select
                    placeholder="Filter by status"
                    options={statusOptions}
                    value={statusFilter || undefined}
                    onChange={v => setStatusFilter(v ?? '')}
                    allowClear
                    style={{ width: 160 }}
                  />
                  <Select
                    placeholder="Filter by org"
                    options={orgOptions}
                    value={orgFilter || undefined}
                    onChange={v => setOrgFilter(v ?? '')}
                    allowClear
                    style={{ width: 120 }}
                    showSearch
                  />
                  <Text type="secondary" style={{ fontSize: 12, marginLeft: 'auto' }}>
                    {filtered.length.toLocaleString()} of {data.length.toLocaleString()} items
                  </Text>
                </div>
                <Table
                  dataSource={filtered}
                  columns={columns}
                  rowKey={(r, i) => r.inventory_item_id ?? String(i)}
                  size="small"
                  bordered
                  scroll={{ x: 1400 }}
                  pagination={{ pageSize: 100, showSizeChanger: true, pageSizeOptions: ['50', '100', '250', '500'], showTotal: t => `${t} records` }}
                />
              </Card>
            </>
          )}
        </div>
      </Content>

      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Attribute: {drawer.attrLabel}</span>
            <Badge count={drawer.values.length} style={{ backgroundColor: REDWOOD.info }} />
          </div>
        }
        open={drawer.open}
        onClose={() => setDrawer(d => ({ ...d, open: false }))}
        width={360}
        closeIcon={<CloseOutlined />}
      >
        <List
          size="small"
          dataSource={drawer.values}
          renderItem={item => (
            <List.Item style={{ padding: '8px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 8 }}>
                <Text style={{ flex: 1 }} ellipsis>{item.value}</Text>
                <Tag style={{ borderRadius: 10, minWidth: 40, textAlign: 'center' }} color="blue">{item.count.toLocaleString()}</Tag>
              </div>
            </List.Item>
          )}
        />
      </Drawer>
    </Layout>
  );
};

export default ItemMaster;
