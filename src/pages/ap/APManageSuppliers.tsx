import React, { useState, useEffect, useCallback } from 'react';
import {
  Layout, Breadcrumb, Typography, Card, Table, Button, Input, Select,
  Row, Col, Space, Tag, Tabs, Spin, Empty, Tooltip, Drawer,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, SearchOutlined, ReloadOutlined, TeamOutlined,
  EnvironmentOutlined, BankOutlined, FileTextOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { APEX_DB_CONFIG } from '../../config/api.config';

const { Content } = Layout;
const { Text, Title } = Typography;

const REDWOOD = {
  primary: '#C74634', primaryDark: '#A33B2C',
  success: '#1D7B4D', warning: '#B07700', info: '#0572CE',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral300: '#C7C7C7',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
  textSecondary: '#6B6B6B',
};

const SUPPLIERS_URL = `${APEX_DB_CONFIG.baseUrl}/suppliers`;
const SITES_URL     = `${APEX_DB_CONFIG.baseUrl}/suppliers/sites`;

// ── Types ─────────────────────────────────────────────────────────────────────
interface ApSupplier {
  key: string;
  supplierId: number;
  supplierNumber: string;
  supplier: string;
  alternateName: string;
  status: string;
  supplierType: string;
  taxpayerId: string;
  creationDate: string;
}

interface ApSupplierSite {
  siteId: string;
  siteName: string;
  address: string;
  city: string;
  country: string;
  email: string;
  phone: string;
}

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ── Stat card ─────────────────────────────────────────────────────────────────
const StatCard: React.FC<{ label: string; value: React.ReactNode; color: string }> = ({ label, value, color }) => (
  <Card size="small" style={{ textAlign: 'center', border: `1px solid ${color}30`, background: `${color}0D`, borderRadius: 8 }}
    styles={{ body: { padding: '12px 8px' } }}>
    <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
    <div style={{ fontSize: 10, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>{label}</div>
  </Card>
);

// ── Main component ─────────────────────────────────────────────────────────────
const APManageSuppliers: React.FC = () => {
  const navigate = useNavigate();

  const [suppliers,        setSuppliers]        = useState<ApSupplier[]>([]);
  const [loading,          setLoading]          = useState(false);
  const [search,           setSearch]           = useState('');
  const [statusFilter,     setStatusFilter]     = useState<string | null>(null);
  const [typeFilter,       setTypeFilter]       = useState<string | null>(null);

  // Detail drawer
  const [drawerOpen,       setDrawerOpen]       = useState(false);
  const [selected,         setSelected]         = useState<ApSupplier | null>(null);
  const [sites,            setSites]            = useState<ApSupplierSite[]>([]);
  const [sitesLoading,     setSitesLoading]     = useState(false);

  // ── Fetch all suppliers ────────────────────────────────────────────────────
  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${SUPPLIERS_URL}?limit=1000`, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      const items: any[] = data.items ?? (Array.isArray(data) ? data : []);
      setSuppliers(items.map((r, i) => ({
        key:            r.supplier_id?.toString() ?? String(i),
        supplierId:     Number(r.supplier_id ?? 0),
        supplierNumber: r.supplier_number ?? '',
        supplier:       r.supplier        ?? '',
        alternateName:  r.alternate_name  ?? '',
        status:         r.status          ?? '',
        supplierType:   r.supplier_type   ?? '',
        taxpayerId:     r.taxpayer_id     ?? '',
        creationDate:   fmtDate(r.creation_date),
      })));
    } catch (_) {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  // ── Fetch sites for selected supplier ─────────────────────────────────────
  const fetchSites = async (supplierId: number) => {
    setSitesLoading(true);
    setSites([]);
    try {
      const res  = await fetch(`${SITES_URL}?P_SUPPLIER_ID=${supplierId}&limit=500`, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      const items: any[] = data.items ?? (Array.isArray(data) ? data : []);
      setSites(items.map(r => ({
        siteId:   r.suppliersiteid?.toString() ?? r.site_id?.toString() ?? '',
        siteName: r.supplier_site ?? r.site_name ?? '',
        address:  r.address_line1 ?? r.address ?? '',
        city:     r.city   ?? '',
        country:  r.country ?? '',
        email:    r.email_address ?? r.email ?? '',
        phone:    r.phone_number  ?? r.phone ?? '',
      })));
    } catch (_) {
      /* ignore */
    } finally {
      setSitesLoading(false);
    }
  };

  const openDetail = (row: ApSupplier) => {
    setSelected(row);
    setDrawerOpen(true);
    fetchSites(row.supplierId);
  };

  // ── Derived data ───────────────────────────────────────────────────────────
  const statuses    = [...new Set(suppliers.map(s => s.status).filter(Boolean))].sort();
  const types       = [...new Set(suppliers.map(s => s.supplierType).filter(Boolean))].sort();
  const activeCount = suppliers.filter(s => s.status?.toLowerCase() === 'active').length;
  const inactCount  = suppliers.length - activeCount;

  const filtered = suppliers.filter(s => {
    if (statusFilter && s.status !== statusFilter) return false;
    if (typeFilter   && s.supplierType !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return s.supplier.toLowerCase().includes(q) ||
        s.supplierNumber.toLowerCase().includes(q) ||
        s.alternateName.toLowerCase().includes(q) ||
        s.taxpayerId.toLowerCase().includes(q);
    }
    return true;
  });

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns: ColumnsType<ApSupplier> = [
    {
      title: 'Supplier Number', dataIndex: 'supplierNumber', width: 150, fixed: 'left',
      render: v => <Text style={{ fontFamily: 'monospace', fontWeight: 600, color: REDWOOD.info }}>{v || '—'}</Text>,
    },
    {
      title: 'Supplier Name', dataIndex: 'supplier', ellipsis: true,
      render: (v, row) => (
        <Button type="link" style={{ padding: 0, fontWeight: 600, color: REDWOOD.primary }}
          onClick={() => openDetail(row)}>{v || '—'}</Button>
      ),
    },
    {
      title: 'Alternate Name', dataIndex: 'alternateName', ellipsis: true,
      render: v => <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>{v || '—'}</Text>,
    },
    {
      title: 'Status', dataIndex: 'status', width: 100,
      render: v => (
        <Tag color={v?.toLowerCase() === 'active' ? 'success' : 'default'} style={{ fontWeight: 600 }}>
          {v || '—'}
        </Tag>
      ),
    },
    {
      title: 'Type', dataIndex: 'supplierType', width: 130,
      render: v => v ? <Tag color="blue" style={{ fontSize: 11 }}>{v}</Tag> : <Text style={{ color: REDWOOD.neutral300 }}>—</Text>,
    },
    {
      title: 'Tax ID', dataIndex: 'taxpayerId', width: 130,
      render: v => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v || '—'}</Text>,
    },
    {
      title: 'Created', dataIndex: 'creationDate', width: 120,
      render: v => <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>{v}</Text>,
    },
    {
      title: '', key: 'actions', width: 100, fixed: 'right',
      render: (_, row) => (
        <Space size={4}>
          <Tooltip title="View details">
            <Button type="text" size="small" icon={<InfoCircleOutlined />}
              style={{ color: REDWOOD.info }} onClick={() => openDetail(row)} />
          </Tooltip>
          <Tooltip title="View invoices">
            <Button type="text" size="small" icon={<FileTextOutlined />}
              style={{ color: REDWOOD.neutral600 }}
              onClick={() => navigate(`/ap/manage-invoices?supplier_number=${row.supplierNumber}`)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const siteCols: ColumnsType<ApSupplierSite> = [
    { title: 'Site Name', dataIndex: 'siteName', width: 160, render: v => <Text style={{ fontWeight: 600 }}>{v || '—'}</Text> },
    { title: 'Address',   dataIndex: 'address',  ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'City',      dataIndex: 'city',     width: 120 },
    { title: 'Country',   dataIndex: 'country',  width: 90 },
    { title: 'Email',     dataIndex: 'email',    width: 180, ellipsis: true, render: v => v ? <a href={`mailto:${v}`}>{v}</a> : '—' },
    { title: 'Phone',     dataIndex: 'phone',    width: 130, render: v => v || '—' },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Page header */}
        <div style={{ padding: '10px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/ap">Accounts Payable</Link> },
            { title: 'Suppliers' },
          ]} />
        </div>
        <div style={{ background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}`, padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `linear-gradient(135deg, ${REDWOOD.primary} 0%, ${REDWOOD.primaryDark} 100%)`,
            boxShadow: `0 4px 12px ${REDWOOD.primary}40` }}>
            <TeamOutlined style={{ fontSize: 22, color: '#fff' }} />
          </div>
          <div>
            <Title level={4} style={{ margin: 0, color: REDWOOD.neutral900 }}>AP Suppliers</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>Supplier master data from local database</Text>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <Button icon={<ReloadOutlined />} onClick={fetchSuppliers} loading={loading}>Refresh</Button>
          </div>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Summary stats */}
          <Row gutter={[12, 12]}>
            <Col xs={12} sm={6}>
              <StatCard label="Total Suppliers" value={loading ? <Spin size="small" /> : suppliers.length} color={REDWOOD.info} />
            </Col>
            <Col xs={12} sm={6}>
              <StatCard label="Active" value={loading ? <Spin size="small" /> : activeCount} color={REDWOOD.success} />
            </Col>
            <Col xs={12} sm={6}>
              <StatCard label="Inactive / Other" value={loading ? <Spin size="small" /> : inactCount} color={REDWOOD.neutral600} />
            </Col>
            <Col xs={12} sm={6}>
              <StatCard label="Types" value={loading ? <Spin size="small" /> : types.length} color={REDWOOD.warning} />
            </Col>
          </Row>

          {/* Search & filters */}
          <Card size="small" style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
            styles={{ body: { padding: '12px 16px' } }}>
            <Row gutter={[12, 8]} align="middle">
              <Col flex="1" style={{ minWidth: 200 }}>
                <Input placeholder="Search by name, number, alternate name, tax ID…"
                  prefix={<SearchOutlined style={{ color: REDWOOD.neutral300 }} />}
                  value={search} onChange={e => setSearch(e.target.value)} allowClear />
              </Col>
              <Col>
                <Select allowClear placeholder="All statuses" style={{ width: 140 }}
                  value={statusFilter ?? undefined} onChange={v => setStatusFilter(v ?? null)}>
                  {statuses.map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}
                </Select>
              </Col>
              <Col>
                <Select allowClear placeholder="All types" style={{ width: 160 }}
                  value={typeFilter ?? undefined} onChange={v => setTypeFilter(v ?? null)}>
                  {types.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
                </Select>
              </Col>
              {(search || statusFilter || typeFilter) && (
                <Col>
                  <Button onClick={() => { setSearch(''); setStatusFilter(null); setTypeFilter(null); }}>
                    Clear
                  </Button>
                </Col>
              )}
            </Row>
          </Card>

          {/* Suppliers table */}
          <Card size="small" style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
            styles={{ body: { padding: 0 } }}
            title={
              <Space>
                <TeamOutlined style={{ color: REDWOOD.primary }} />
                <Text strong>Suppliers</Text>
                <Tag color="red">{filtered.length}{filtered.length !== suppliers.length ? ` / ${suppliers.length}` : ''}</Tag>
              </Space>
            }>
            <Table<ApSupplier>
              dataSource={filtered}
              columns={columns}
              rowKey="key"
              size="small"
              loading={loading}
              scroll={{ x: 1100 }}
              pagination={{ pageSize: 25, showSizeChanger: true, showTotal: (t, [s, e]) => `${s}–${e} of ${t} suppliers` }}
              style={{ fontSize: 12 }}
              locale={{ emptyText: <Empty description="No suppliers found" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              rowClassName={(_, i) => i % 2 !== 0 ? 'ant-table-row-alt' : ''}
            />
          </Card>
        </div>

        {/* Detail drawer */}
        <Drawer
          open={drawerOpen}
          onClose={() => { setDrawerOpen(false); setSelected(null); setSites([]); }}
          width={700}
          title={
            <Space>
              <TeamOutlined style={{ color: REDWOOD.primary }} />
              <Text strong>{selected?.supplier}</Text>
              <Tag color="default" style={{ fontFamily: 'monospace' }}>{selected?.supplierNumber}</Tag>
              <Tag color={selected?.status?.toLowerCase() === 'active' ? 'success' : 'default'}>{selected?.status}</Tag>
            </Space>
          }
        >
          {selected && (
            <Tabs size="small" defaultActiveKey="info" items={[
              {
                key: 'info',
                label: <Space size={4}><InfoCircleOutlined />Details</Space>,
                children: (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', padding: '8px 0' }}>
                    {[
                      ['Supplier ID',     selected.supplierId],
                      ['Supplier Number', selected.supplierNumber],
                      ['Supplier Name',   selected.supplier],
                      ['Alternate Name',  selected.alternateName || '—'],
                      ['Status',         selected.status || '—'],
                      ['Type',           selected.supplierType || '—'],
                      ['Tax ID',         selected.taxpayerId || '—'],
                      ['Created',        selected.creationDate],
                    ].map(([label, val]) => (
                      <div key={String(label)} style={{ borderBottom: `1px solid ${REDWOOD.neutral200}`, paddingBottom: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                        <div style={{ fontSize: 13, color: REDWOOD.neutral900, marginTop: 2, fontFamily: label === 'Supplier ID' || label === 'Tax ID' ? 'monospace' : undefined }}>{String(val)}</div>
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                key: 'sites',
                label: <Space size={4}><EnvironmentOutlined />Sites {!sitesLoading && sites.length > 0 && <Tag color="blue" style={{ fontSize: 10, marginLeft: 2 }}>{sites.length}</Tag>}</Space>,
                children: sitesLoading
                  ? <div style={{ textAlign: 'center', padding: 40 }}><Spin tip="Loading sites…" /></div>
                  : (
                    <Table<ApSupplierSite>
                      dataSource={sites} columns={siteCols} rowKey="siteId"
                      size="small" bordered pagination={false}
                      locale={{ emptyText: <Empty description="No sites found" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                    />
                  ),
              },
              {
                key: 'invoices',
                label: <Space size={4}><FileTextOutlined />Invoices</Space>,
                children: (
                  <div style={{ padding: '20px 0' }}>
                    <Button type="primary" icon={<FileTextOutlined />}
                      style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                      onClick={() => navigate(`/ap/manage-invoices?supplier_number=${selected.supplierNumber}`)}>
                      View Invoices for {selected.supplier}
                    </Button>
                    <div style={{ marginTop: 12 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Opens the AP Invoices page filtered to this supplier.
                      </Text>
                    </div>
                  </div>
                ),
              },
              {
                key: 'payments',
                label: <Space size={4}><BankOutlined />Payments</Space>,
                children: (
                  <div style={{ padding: '20px 0' }}>
                    <Button icon={<BankOutlined />}
                      onClick={() => navigate(`/ap/manage-payments?supplier_number=${selected.supplierNumber}`)}>
                      View Payments for {selected.supplier}
                    </Button>
                  </div>
                ),
              },
            ]} />
          )}
        </Drawer>
      </Content>
    </Layout>
  );
};

export default APManageSuppliers;
