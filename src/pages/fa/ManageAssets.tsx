import React, { useState, useEffect, useCallback } from 'react';
import {
  Layout, Card, Form, Input, Button, Space, Typography, Table, Tag,
  Row, Col, Breadcrumb, Tooltip, Select, Drawer, Tabs, Descriptions,
  Spin, Empty, Badge, Divider, message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, SearchOutlined, ReloadOutlined, PlusOutlined,
  FileTextOutlined, DollarOutlined, LineChartOutlined, AuditOutlined,
  EnvironmentOutlined, DatabaseOutlined, InfoCircleOutlined,
  BookOutlined, HistoryOutlined, BarcodeOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import Autopilot from '../../components/Autopilot';
import {
  searchAssets, getAssetDetail, getAssetBooks, getAssetDeprn,
  getAssetDistributions, getAssetInvoices, getAssetTransactions,
  formatCurrency, assetTypeLabel, assetStatusColor, assetStatusLabel,
} from '../../services/fa.service';
import type {
  AssetRecord, AssetDetail, AssetBook, DeprnRecord,
  DistributionRecord, InvoiceRecord, TransactionRecord,
} from '../../services/fa.service';

const { Content } = Layout;
const { Text, Title } = Typography;
const { Option } = Select;

// Oracle Redwood palette
const REDWOOD = {
  primary:    '#C74634',
  success:    '#1D7B4D',
  warning:    '#D4A800',
  info:       '#0572CE',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral300: '#C7C7C7',
  neutral600: '#6B6B6B',
  neutral900: '#1A1A1A',
  surface:    '#FFFFFF',
};
const FA_COLOR = '#CA7700';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const statusTag = (retiredFlag: string) => (
  <Tag color={retiredFlag === 'YES' ? 'error' : 'success'} style={{ borderRadius: 4, fontSize: 11 }}>
    {assetStatusLabel(retiredFlag)}
  </Tag>
);

// ─── Main Component ───────────────────────────────────────────────────────────
const ManageAssets: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();

  // Search state
  const [rows,       setRows]       = useState<AssetRecord[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page,       setPage]       = useState(1);
  const [pageSize,   setPageSize]   = useState(25);
  const [searched,   setSearched]   = useState(false);

  // Drawer / detail state
  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetRecord | null>(null);
  const [detail,        setDetail]        = useState<Partial<AssetDetail> | null>(null);
  const [books,         setBooks]         = useState<AssetBook[]>([]);
  const [deprn,         setDeprn]         = useState<DeprnRecord[]>([]);
  const [distributions, setDistributions] = useState<DistributionRecord[]>([]);
  const [invoices,      setInvoices]      = useState<InvoiceRecord[]>([]);
  const [transactions,  setTransactions]  = useState<TransactionRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab,     setActiveTab]     = useState('general');

  // Run search
  const runSearch = useCallback(async (pg = 1, ps = pageSize) => {
    const vals = form.getFieldsValue();
    setLoading(true);
    try {
      const res = await searchAssets({
        assetNumber:  vals.assetNumber  || undefined,
        description:  vals.description  || undefined,
        category:     vals.category     || undefined,
        bookTypeCode: vals.bookTypeCode || undefined,
        assetType:    vals.assetType    || undefined,
        status:       vals.status       || undefined,
        offset:       (pg - 1) * ps,
        limit:        ps,
      });
      if (res.success) {
        setRows(res.items);
        setTotalCount(res.totalCount);
        setPage(pg);
      } else {
        message.error(res.error || 'Search failed');
      }
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, [form, pageSize]);

  // Load all on mount
  useEffect(() => { runSearch(1, pageSize); }, []);

  // Open drawer and fetch detail tabs
  const openAsset = async (asset: AssetRecord) => {
    setSelectedAsset(asset);
    setDrawerOpen(true);
    setActiveTab('general');
    setDetail(null);
    setBooks([]);
    setDeprn([]);
    setDistributions([]);
    setInvoices([]);
    setTransactions([]);
    setDetailLoading(true);
    try {
      const [det, bks, dep, dist, inv, txn] = await Promise.all([
        getAssetDetail(asset.assetId),
        getAssetBooks(asset.assetId),
        getAssetDeprn(asset.assetId),
        getAssetDistributions(asset.assetId),
        getAssetInvoices(asset.assetId),
        getAssetTransactions(asset.assetId),
      ]);
      if (det.success) setDetail(det);
      setBooks(bks.items || []);
      setDeprn(dep.items || []);
      setDistributions(dist.items || []);
      setInvoices(inv.items || []);
      setTransactions(txn.items || []);
    } catch {
      message.error('Failed to load asset details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleReset = () => {
    form.resetFields();
    setRows([]);
    setTotalCount(0);
    setSearched(false);
  };

  // ── Table columns ───────────────────────────────────────────────────────────
  const columns: ColumnsType<AssetRecord> = [
    {
      title: 'Asset Number', dataIndex: 'assetNumber', key: 'assetNumber', width: 130,
      render: (v, record) => (
        <Button type="link" style={{ padding: 0, fontWeight: 600 }} onClick={() => openAsset(record)}>
          {v}
        </Button>
      ),
    },
    {
      title: 'Description', dataIndex: 'description', key: 'description',
      ellipsis: true,
    },
    {
      title: 'Type', dataIndex: 'assetType', key: 'assetType', width: 110,
      render: (v) => <Tag style={{ borderRadius: 4, fontSize: 11 }}>{assetTypeLabel(v)}</Tag>,
    },
    {
      title: 'Book', dataIndex: 'bookTypeCode', key: 'bookTypeCode', width: 150,
      ellipsis: true,
    },
    {
      title: 'Date in Service', dataIndex: 'datePlacedInService', key: 'datePlacedInService', width: 130,
    },
    {
      title: 'Cost', dataIndex: 'cost', key: 'cost', width: 120, align: 'right' as const,
      render: (v) => formatCurrency(v),
    },
    {
      title: 'NBV', dataIndex: 'nbv', key: 'nbv', width: 120, align: 'right' as const,
      render: (v) => formatCurrency(v),
    },
    {
      title: 'Status', dataIndex: 'retiredFlag', key: 'status', width: 90,
      render: (v) => statusTag(v),
    },
    {
      title: '', key: 'actions', width: 60, align: 'center' as const,
      render: (_: any, record: AssetRecord) => (
        <Tooltip title="View details">
          <Button
            size="small" type="text" icon={<InfoCircleOutlined />}
            onClick={() => openAsset(record)}
          />
        </Tooltip>
      ),
    },
  ];

  // ── Drawer tab panels ───────────────────────────────────────────────────────
  const GeneralTab = () => (
    <div>
      <Descriptions column={2} size="small" bordered labelStyle={{ fontWeight: 500, width: 160 }}>
        <Descriptions.Item label="Asset Number">{detail?.assetNumber || selectedAsset?.assetNumber}</Descriptions.Item>
        <Descriptions.Item label="Asset Type">{assetTypeLabel(detail?.assetType || selectedAsset?.assetType || '')}</Descriptions.Item>
        <Descriptions.Item label="Description" span={2}>{detail?.description || selectedAsset?.description}</Descriptions.Item>
        <Descriptions.Item label="Tag Number">{detail?.tagNumber || selectedAsset?.tagNumber || '—'}</Descriptions.Item>
        <Descriptions.Item label="Serial Number">{detail?.serialNumber || selectedAsset?.serialNumber || '—'}</Descriptions.Item>
        <Descriptions.Item label="Manufacturer">{detail?.manufacturerName || detail?.manufacturer || '—'}</Descriptions.Item>
        <Descriptions.Item label="Model Number">{detail?.modelNumber || '—'}</Descriptions.Item>
        <Descriptions.Item label="In Use">{detail?.inUseFlag || selectedAsset?.inUseFlag || '—'}</Descriptions.Item>
        <Descriptions.Item label="Owned/Leased">{detail?.ownedLeased || selectedAsset?.ownedLeased || '—'}</Descriptions.Item>
        <Descriptions.Item label="Units">{detail?.units || selectedAsset?.units || '—'}</Descriptions.Item>
        <Descriptions.Item label="Capitalized">{detail?.capitalizedFlag || selectedAsset?.capitalizedFlag || '—'}</Descriptions.Item>
        <Descriptions.Item label="New/Used">{detail?.newUsed || '—'}</Descriptions.Item>
        <Descriptions.Item label="Property Type">{detail?.propertyTypeCode || '—'}</Descriptions.Item>
        <Descriptions.Item label="Feeder System">{detail?.feederSystemName || '—'}</Descriptions.Item>
        <Descriptions.Item label="Created">{detail?.creationDate || selectedAsset?.creationDate || '—'}</Descriptions.Item>
        <Descriptions.Item label="Last Updated">{detail?.lastUpdateDate || selectedAsset?.lastUpdateDate || '—'}</Descriptions.Item>
      </Descriptions>
    </div>
  );

  const BooksTab = () => (
    books.length === 0
      ? <Empty description="No book records" />
      : books.map((b, i) => (
        <Card key={i} size="small" style={{ marginBottom: 12, borderRadius: 8 }}
          title={<Space><BookOutlined style={{ color: FA_COLOR }} /><Text strong>{b.bookTypeCode}</Text></Space>}
        >
          <Descriptions column={2} size="small">
            <Descriptions.Item label="Date in Service">{b.datePlacedInService}</Descriptions.Item>
            <Descriptions.Item label="Deprn Start">{b.deprnStartDate}</Descriptions.Item>
            <Descriptions.Item label="Cost">{formatCurrency(b.cost)}</Descriptions.Item>
            <Descriptions.Item label="Original Cost">{formatCurrency(b.originalCost)}</Descriptions.Item>
            <Descriptions.Item label="Salvage Value">{formatCurrency(b.salvageValue)}</Descriptions.Item>
            <Descriptions.Item label="Recoverable Cost">{formatCurrency(b.recoverableCost)}</Descriptions.Item>
            <Descriptions.Item label="Deprn Reserve">{formatCurrency(b.deprnReserve)}</Descriptions.Item>
            <Descriptions.Item label="NBV">{formatCurrency(b.nbv)}</Descriptions.Item>
            <Descriptions.Item label="Method">{b.methodCode || b.methodName || '—'}</Descriptions.Item>
            <Descriptions.Item label="Life (Months)">{b.lifeInMonths || '—'}</Descriptions.Item>
            <Descriptions.Item label="Depreciate">{b.depreciateFlag}</Descriptions.Item>
            <Descriptions.Item label="Capitalize">{b.capitalizeFlag}</Descriptions.Item>
          </Descriptions>
        </Card>
      ))
  );

  const deprnColumns: ColumnsType<DeprnRecord> = [
    { title: 'Period',   dataIndex: 'periodName',    key: 'periodName',   width: 110 },
    { title: 'FY',       dataIndex: 'fiscalYear',    key: 'fiscalYear',   width: 60  },
    { title: 'Book',     dataIndex: 'bookTypeCode',  key: 'bookTypeCode', ellipsis: true },
    { title: 'Deprn Amt', dataIndex: 'deprnAmount',  key: 'deprnAmount',  align: 'right' as const, render: formatCurrency },
    { title: 'YTD',       dataIndex: 'ytdDeprn',     key: 'ytdDeprn',     align: 'right' as const, render: formatCurrency },
    { title: 'Reserve',   dataIndex: 'deprnReserve', key: 'deprnReserve', align: 'right' as const, render: formatCurrency },
    { title: 'NBV',       dataIndex: 'nbv',          key: 'nbv',          align: 'right' as const, render: formatCurrency },
  ];

  const distColumns: ColumnsType<DistributionRecord> = [
    { title: 'ID',       dataIndex: 'distributionId',  key: 'distributionId',  width: 80  },
    { title: 'Book',     dataIndex: 'bookTypeCode',    key: 'bookTypeCode',    ellipsis: true },
    { title: 'Units',    dataIndex: 'unitsAssigned',   key: 'unitsAssigned',   width: 70  },
    { title: 'Location', key: 'location',
      render: (_: any, r: DistributionRecord) =>
        [r.locationSeg1, r.locationSeg2, r.locationSeg3].filter(Boolean).join(' / ') || '—',
    },
    { title: 'Effective', dataIndex: 'dateEffective',    key: 'dateEffective',    width: 110 },
    { title: 'End Date',  dataIndex: 'dateIneffective',  key: 'dateIneffective',  width: 110,
      render: (v) => v || '—' },
  ];

  const invoiceColumns: ColumnsType<InvoiceRecord> = [
    { title: 'Invoice ID',   dataIndex: 'assetInvoiceId',  key: 'assetInvoiceId',  width: 90  },
    { title: 'Book',         dataIndex: 'bookTypeCode',    key: 'bookTypeCode',    ellipsis: true },
    { title: 'Cost',         dataIndex: 'fixedAssetsCost', key: 'fixedAssetsCost', align: 'right' as const, render: formatCurrency },
    { title: 'Description',  dataIndex: 'description',     key: 'description',     ellipsis: true },
    { title: 'Feeder',       dataIndex: 'feederSystemName',key: 'feederSystemName',ellipsis: true },
    { title: 'Effective',    dataIndex: 'dateEffective',   key: 'dateEffective',   width: 110 },
  ];

  const txnColumns: ColumnsType<TransactionRecord> = [
    { title: 'Txn ID',    dataIndex: 'transactionHeaderId', key: 'txnId',   width: 90  },
    { title: 'Book',      dataIndex: 'bookTypeCode',        key: 'book',    ellipsis: true },
    { title: 'Type',      dataIndex: 'transactionTypeCode', key: 'type',
      render: (v) => <Tag style={{ borderRadius: 4, fontSize: 11 }}>{v}</Tag> },
    { title: 'Txn Date',  dataIndex: 'transactionDate',     key: 'txnDate', width: 110 },
    { title: 'Effective', dataIndex: 'dateEffective',       key: 'effDate', width: 110 },
    { title: 'Interface', dataIndex: 'callingInterface',    key: 'iface',   ellipsis: true },
  ];

  const drawerTabs = [
    {
      key: 'general', label: <span><InfoCircleOutlined /> General</span>,
      children: detailLoading ? <Spin style={{ display: 'block', margin: '40px auto' }} /> : <GeneralTab />,
    },
    {
      key: 'books', label: <span><BookOutlined /> Books</span>,
      children: detailLoading
        ? <Spin style={{ display: 'block', margin: '40px auto' }} />
        : <BooksTab />,
    },
    {
      key: 'depreciation', label: <span><LineChartOutlined /> Depreciation</span>,
      children: detailLoading
        ? <Spin style={{ display: 'block', margin: '40px auto' }} />
        : <Table
            dataSource={deprn} columns={deprnColumns} rowKey="periodCounter"
            size="small" pagination={{ pageSize: 10 }}
            locale={{ emptyText: 'No depreciation records' }}
          />,
    },
    {
      key: 'distributions', label: <span><EnvironmentOutlined /> Distributions</span>,
      children: detailLoading
        ? <Spin style={{ display: 'block', margin: '40px auto' }} />
        : <Table
            dataSource={distributions} columns={distColumns} rowKey="distributionId"
            size="small" pagination={false}
            locale={{ emptyText: 'No distribution records' }}
          />,
    },
    {
      key: 'invoices', label: <span><FileTextOutlined /> Invoices</span>,
      children: detailLoading
        ? <Spin style={{ display: 'block', margin: '40px auto' }} />
        : <Table
            dataSource={invoices} columns={invoiceColumns} rowKey="assetInvoiceId"
            size="small" pagination={false}
            locale={{ emptyText: 'No invoice records' }}
          />,
    },
    {
      key: 'transactions', label: <span><HistoryOutlined /> Transactions</span>,
      children: detailLoading
        ? <Spin style={{ display: 'block', margin: '40px auto' }} />
        : <Table
            dataSource={transactions} columns={txnColumns} rowKey="transactionHeaderId"
            size="small" pagination={{ pageSize: 10 }}
            locale={{ emptyText: 'No transaction records' }}
          />,
    },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb */}
        <div style={{ padding: '16px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/fa">Fixed Assets</Link> },
            { title: 'Manage Assets' },
          ]} />
        </div>

        <div style={{ padding: 24 }}>
          {/* Title row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Space align="center">
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: `linear-gradient(135deg, ${FA_COLOR} 0%, #9E5C00 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <DatabaseOutlined style={{ fontSize: 22, color: '#fff' }} />
              </div>
              <div>
                <Title level={4} style={{ margin: 0 }}>Asset Workbench</Title>
                <Text type="secondary" style={{ fontSize: 12 }}>Search and manage fixed asset records</Text>
              </div>
            </Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ background: FA_COLOR, borderColor: FA_COLOR }}
              onClick={() => navigate('/fa/create-asset')}
            >
              New Asset
            </Button>
          </div>

          {/* Search card */}
          <Card
            style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}
            bodyStyle={{ padding: '16px 20px' }}
          >
            <Form form={form} layout="vertical" onFinish={() => runSearch(1, pageSize)}>
              <Row gutter={[16, 0]}>
                <Col xs={24} sm={12} md={6}>
                  <Form.Item name="assetNumber" label="Asset Number" style={{ marginBottom: 8 }}>
                    <Input placeholder="e.g. FA-0001" allowClear prefix={<BarcodeOutlined />} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={6}>
                  <Form.Item name="description" label="Description" style={{ marginBottom: 8 }}>
                    <Input placeholder="Contains..." allowClear prefix={<SearchOutlined />} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={6}>
                  <Form.Item name="assetType" label="Asset Type" style={{ marginBottom: 8 }}>
                    <Select allowClear placeholder="All types">
                      <Option value="CAPITALIZED">Capitalized</Option>
                      <Option value="CIP">CIP</Option>
                      <Option value="EXPENSED">Expensed</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={6}>
                  <Form.Item name="status" label="Status" style={{ marginBottom: 8 }}>
                    <Select allowClear placeholder="All">
                      <Option value="ACTIVE">Active</Option>
                      <Option value="RETIRED">Retired</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <Form.Item name="bookTypeCode" label="Book" style={{ marginBottom: 8 }}>
                    <Input placeholder="Book type code" allowClear />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <Form.Item name="category" label="Category" style={{ marginBottom: 8 }}>
                    <Input placeholder="Category segment" allowClear />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8} style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <Form.Item style={{ marginBottom: 8, width: '100%' }}>
                    <Space>
                      <Button
                        type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}
                        style={{ background: FA_COLOR, borderColor: FA_COLOR }}
                      >
                        Search
                      </Button>
                      <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
                    </Space>
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </Card>

          {/* Results table */}
          <Card
            style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
            bodyStyle={{ padding: 0 }}
            title={
              searched
                ? <Text strong>Results <Badge count={totalCount} style={{ backgroundColor: FA_COLOR }} /></Text>
                : <Text strong>Assets</Text>
            }
          >
            <Table<AssetRecord>
              dataSource={rows}
              columns={columns}
              rowKey="assetId"
              loading={loading}
              size="small"
              scroll={{ x: 1000 }}
              locale={{ emptyText: searched ? 'No assets found' : 'Enter search criteria above' }}
              onRow={(record) => ({ onClick: () => openAsset(record), style: { cursor: 'pointer' } })}
              pagination={{
                current: page,
                pageSize,
                total: totalCount,
                showSizeChanger: true,
                showTotal: (t) => `${t} assets`,
                pageSizeOptions: ['25', '50', '100'],
                onChange: (p, ps) => { setPageSize(ps); runSearch(p, ps); },
              }}
            />
          </Card>
        </div>

        {/* Asset Detail Drawer */}
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={780}
          title={
            selectedAsset
              ? (
                <Space>
                  <DatabaseOutlined style={{ color: FA_COLOR }} />
                  <span>{selectedAsset.assetNumber}</span>
                  <Divider type="vertical" />
                  <Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>{selectedAsset.description}</Text>
                  {statusTag(selectedAsset.retiredFlag)}
                </Space>
              )
              : 'Asset Detail'
          }
          extra={
            <Space>
              <Button
                size="small"
                style={{ borderColor: FA_COLOR, color: FA_COLOR }}
                onClick={() => { setDrawerOpen(false); navigate(`/fa/create-asset`); }}
              >
                New Asset
              </Button>
            </Space>
          }
        >
          {selectedAsset && (
            <>
              {/* Mini summary strip */}
              <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                {[
                  { label: 'Cost',    value: formatCurrency(selectedAsset.cost),         color: FA_COLOR      },
                  { label: 'NBV',     value: formatCurrency(selectedAsset.nbv),           color: REDWOOD.info  },
                  { label: 'Reserve', value: formatCurrency(selectedAsset.deprnReserve),  color: REDWOOD.warning },
                  { label: 'Units',   value: selectedAsset.units,                          color: REDWOOD.success },
                ].map(({ label, value, color }) => (
                  <Col xs={12} sm={6} key={label}>
                    <div style={{
                      textAlign: 'center', padding: '10px 8px', borderRadius: 8,
                      background: `${color}10`, border: `1px solid ${color}30`,
                    }}>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{label}</Text>
                      <Text strong style={{ color, fontSize: 14 }}>{value}</Text>
                    </div>
                  </Col>
                ))}
              </Row>

              <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                size="small"
                items={drawerTabs}
              />
            </>
          )}
        </Drawer>
      </Content>

      <Autopilot />
    </Layout>
  );
};

export default ManageAssets;
