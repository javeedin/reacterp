import React, { useState, useCallback } from 'react';
import {
  Layout, Card, Form, Input, Button, Space, Typography, Table, Tabs,
  Row, Col, Breadcrumb, Spin, message, Empty,
} from 'antd';
import {
  HomeOutlined, SearchOutlined, DownloadOutlined, CloseOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import * as XLSX from 'xlsx';
import FloatingMenu from '../../components/FloatingMenu';
import { ORACLE_SOAP_CONFIG } from '../../config/api.config';

const { Content } = Layout;
const { Title, Text } = Typography;

const REDWOOD = {
  primary:    '#C74634',
  success:    '#1D7B4D',
  warning:    '#D4A800',
  info:       '#0572CE',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral600: '#6B6B6B',
  surface:    '#FFFFFF',
  border:     '#E5E5E5',
};

const { username, password } = ORACLE_SOAP_CONFIG.prod;
const AUTH_HEADER = 'Basic ' + btoa(`${username}:${password}`);

const BASE_URL = '/proxy/fusion/fscmRestApi/resources/11.13.18.05/receivablesCustomerAccountSiteActivities';

const CHILD_LABEL_MAP: Record<string, string> = {
  creditMemoApplications:          'CM Applications',
  creditMemos:                      'Credit Memos',
  standardReceiptApplications:     'Receipt Applications',
  standardReceipts:                 'Standard Receipts',
  transactionAdjustments:           'Adjustments',
  transactionPaymentSchedules:      'Payment Schedules',
  transactionsPaidByOtherCustomers: 'Paid by Others',
};

const CHILD_NAMES = Object.keys(CHILD_LABEL_MAP);

interface SiteRecord {
  BillToSiteUseId: number;
  BillToSiteNumber: string;
  BillToSiteAddress: string;
  AccountNumber: string;
  CustomerName: string;
  TaxRegistrationNumber: string;
  TotalOpenReceivablesForSite: number;
  TotalTransactionsDueForSite: number;
}

interface ChildTabState {
  key: string;
  label: string;
  siteId: number;
  childName: string;
  loading: boolean;
  data: Record<string, unknown>[];
  columns: ColumnsType<Record<string, unknown>>;
}

function formatValue(key: string, val: unknown): React.ReactNode {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'number') {
    const k = key.toLowerCase();
    if (
      k.includes('amount') || k.includes('total') || k.includes('balance') ||
      k.includes('due') || k.includes('receivable')
    ) {
      return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return val.toString();
  }
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
    }
  }
  return String(val);
}

function buildColumns(items: Record<string, unknown>[]): ColumnsType<Record<string, unknown>> {
  if (!items || items.length === 0) return [];
  const keys = Object.keys(items[0]).filter(k => k !== 'links');
  return keys.map(key => ({
    title: key.replace(/([A-Z])/g, ' $1').trim(),
    dataIndex: key,
    key,
    ellipsis: true,
    render: (val: unknown) => formatValue(key, val),
  }));
}

function exportToExcel(data: Record<string, unknown>[], filename: string) {
  const cleaned = data.map(row => {
    const r: Record<string, unknown> = {};
    Object.keys(row).filter(k => k !== 'links').forEach(k => { r[k] = row[k]; });
    return r;
  });
  const ws = XLSX.utils.json_to_sheet(cleaned);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

const CustomerSiteActivities: React.FC = () => {
  const [form] = Form.useForm();
  const [searchResults, setSearchResults] = useState<SiteRecord[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('search');
  const [childTabs, setChildTabs] = useState<ChildTabState[]>([]);

  const handleSearch = useCallback(async () => {
    const values = form.getFieldsValue();
    const filters: string[] = [];
    if (values.CustomerName) filters.push(`CustomerName like "%${values.CustomerName}%"`);
    if (values.AccountNumber) filters.push(`AccountNumber like "%${values.AccountNumber}%"`);
    if (values.BillToSiteNumber) filters.push(`BillToSiteNumber like "%${values.BillToSiteNumber}%"`);

    let url = `${BASE_URL}?limit=50`;
    if (filters.length > 0) url += `&q=${encodeURIComponent(filters.join(' AND '))}`;

    setSearchLoading(true);
    try {
      const res = await fetch(url, { headers: { Authorization: AUTH_HEADER } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setSearchResults(json.items || []);
      if ((json.items || []).length === 0) message.info('No results found');
    } catch (err: unknown) {
      message.error(`Search failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSearchLoading(false);
    }
  }, [form]);

  const handleViewDetails = useCallback(async (site: SiteRecord) => {
    const siteId = site.BillToSiteUseId;
    const siteLabel = `${site.CustomerName} - Site ${site.BillToSiteNumber}`;

    const newTabs: ChildTabState[] = CHILD_NAMES.map(childName => ({
      key: `child-${siteId}-${childName}`,
      label: `${CHILD_LABEL_MAP[childName]} (${siteLabel})`,
      siteId,
      childName,
      loading: true,
      data: [],
      columns: [],
    }));

    setChildTabs(prev => {
      const filtered = prev.filter(t => t.siteId !== siteId);
      return [...filtered, ...newTabs];
    });

    setActiveTab(`child-${siteId}-${CHILD_NAMES[0]}`);

    await Promise.all(
      CHILD_NAMES.map(async childName => {
        const tabKey = `child-${siteId}-${childName}`;
        try {
          const url = `${BASE_URL}/${siteId}/child/${childName}`;
          const res = await fetch(url, { headers: { Authorization: AUTH_HEADER } });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          const items: Record<string, unknown>[] = json.items || [];
          const columns = buildColumns(items);
          setChildTabs(prev =>
            prev.map(t => t.key === tabKey ? { ...t, loading: false, data: items, columns } : t)
          );
        } catch {
          setChildTabs(prev =>
            prev.map(t => t.key === tabKey ? { ...t, loading: false, data: [], columns: [] } : t)
          );
        }
      })
    );
  }, []);

  const handleCloseTab = useCallback((targetKey: string) => {
    setChildTabs(prev => prev.filter(t => t.key !== targetKey));
    setActiveTab(prev => (prev === targetKey ? 'search' : prev));
  }, []);

  const searchColumns: ColumnsType<SiteRecord> = [
    { title: 'Customer Name',     dataIndex: 'CustomerName',               key: 'CustomerName', ellipsis: true },
    { title: 'Account Number',    dataIndex: 'AccountNumber',              key: 'AccountNumber' },
    { title: 'Site Number',       dataIndex: 'BillToSiteNumber',           key: 'BillToSiteNumber' },
    { title: 'Site Address',      dataIndex: 'BillToSiteAddress',          key: 'BillToSiteAddress', ellipsis: true },
    { title: 'Tax Reg No',        dataIndex: 'TaxRegistrationNumber',      key: 'TaxRegistrationNumber' },
    {
      title: 'Open Receivables', dataIndex: 'TotalOpenReceivablesForSite', key: 'TotalOpenReceivablesForSite',
      align: 'right' as const,
      render: (v: number) => typeof v === 'number' ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-',
    },
    {
      title: 'Transactions Due', dataIndex: 'TotalTransactionsDueForSite', key: 'TotalTransactionsDueForSite',
      align: 'right' as const,
      render: (v: number) => typeof v === 'number' ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-',
    },
    {
      title: 'Action', key: 'action',
      render: (_: unknown, record: SiteRecord) => (
        <Button size="small" icon={<EyeOutlined />} type="link" onClick={() => handleViewDetails(record)}>
          View Details
        </Button>
      ),
    },
  ];

  const tabItems = [
    {
      key: 'search',
      label: 'Site Activities',
      closable: false,
      children: (
        <div>
          <Card style={{ marginBottom: 16, borderColor: REDWOOD.border }} bodyStyle={{ padding: '16px 24px' }}>
            <Form form={form} layout="inline" onFinish={handleSearch}>
              <Form.Item name="CustomerName" label="Customer Name">
                <Input placeholder="Customer name..." style={{ width: 200 }} />
              </Form.Item>
              <Form.Item name="AccountNumber" label="Account Number">
                <Input placeholder="Account number..." style={{ width: 160 }} />
              </Form.Item>
              <Form.Item name="BillToSiteNumber" label="Site Number">
                <Input placeholder="Site number..." style={{ width: 140 }} />
              </Form.Item>
              <Form.Item>
                <Button
                  type="primary" htmlType="submit" icon={<SearchOutlined />} loading={searchLoading}
                  style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                >
                  Search
                </Button>
              </Form.Item>
              {searchResults.length > 0 && (
                <Form.Item>
                  <Button
                    icon={<DownloadOutlined />}
                    onClick={() => exportToExcel(searchResults as unknown as Record<string, unknown>[], 'CustomerSiteActivities')}
                  >
                    Export to Excel
                  </Button>
                </Form.Item>
              )}
            </Form>
          </Card>
          <Card style={{ borderColor: REDWOOD.border }}>
            <Table
              dataSource={searchResults}
              columns={searchColumns}
              rowKey="BillToSiteUseId"
              loading={searchLoading}
              size="small"
              scroll={{ x: 'max-content' }}
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Total ${t} sites` }}
              onRow={(record) => ({ onClick: () => handleViewDetails(record), style: { cursor: 'pointer' } })}
            />
          </Card>
        </div>
      ),
    },
    ...childTabs.map(tab => ({
      key: tab.key,
      closable: true,
      label: (
        <span>
          {CHILD_LABEL_MAP[tab.childName]}
          <CloseOutlined
            style={{ marginLeft: 8, fontSize: 10 }}
            onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.key); }}
          />
        </span>
      ),
      children: (
        <div>
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary">{tab.label}</Text>
            {!tab.loading && tab.data.length > 0 && (
              <Button
                size="small" icon={<DownloadOutlined />}
                onClick={() => exportToExcel(tab.data, `${tab.childName}-${tab.siteId}`)}
              >
                Export to Excel
              </Button>
            )}
          </div>
          {tab.loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin size="large" />
            </div>
          ) : tab.data.length === 0 ? (
            <Empty description="No data available" />
          ) : (
            <Table
              dataSource={tab.data}
              columns={tab.columns}
              rowKey={(_rec, idx) => String(idx)}
              size="small"
              scroll={{ x: 'max-content' }}
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Total ${t} records` }}
            />
          )}
        </div>
      ),
    })),
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: REDWOOD.neutral100 }}>
      <Content>
        <div style={{
          padding: '16px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}`,
        }}>
          <Breadcrumb items={[
            { title: <Link to="/"><HomeOutlined /> Home</Link> },
            { title: <Link to="/ar">Accounts Receivable</Link> },
            { title: 'Customer Site Activities' },
          ]} />
        </div>

        <div style={{ padding: 24 }}>
          <div style={{ marginBottom: 24 }}>
            <Row justify="space-between" align="middle">
              <Col>
                <Space align="center">
                  <div style={{
                    width: 48, height: 48, borderRadius: 10,
                    background: `linear-gradient(135deg, ${REDWOOD.primary} 0%, #E85D4A 100%)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <EyeOutlined style={{ color: '#fff', fontSize: 22 }} />
                  </div>
                  <div>
                    <Title level={4} style={{ margin: 0 }}>Customer Account Site Activities</Title>
                    <Text type="secondary">Oracle AR — View receivables activity by customer site</Text>
                  </div>
                </Space>
              </Col>
            </Row>
          </div>

          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            type="card"
            items={tabItems}
            style={{ background: REDWOOD.surface, borderRadius: 8 }}
          />
        </div>

        <FloatingMenu />
      </Content>
    </Layout>
  );
};

export default CustomerSiteActivities;
