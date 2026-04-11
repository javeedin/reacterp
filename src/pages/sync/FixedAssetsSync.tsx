import React, { useState, useCallback } from 'react';
import {
  Modal, Layout, Tabs, Button, Table, Space, Tag, Spin,
  Alert, Tooltip, Typography, Badge, Divider, Input,
} from 'antd';
import {
  AuditOutlined, CloudDownloadOutlined, FileExcelOutlined,
  CloseOutlined, SyncOutlined, InfoCircleOutlined, SearchOutlined,
  CheckCircleOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import { ORACLE_SOAP_CONFIG } from '../../config/api.config';
import { callSoapBip } from '../../services/sync-http';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

const { Sider, Content } = Layout;
const { Text, Title } = Typography;

const FA_BASE_PATH = '/Custom/FA_REPORTS/ReERPFAreports';

const FA_REPORTS = [
  { id: 'FA_ADDITIONS_B',         label: 'FA_ADDITIONS_B',         description: 'Asset identity' },
  { id: 'FA_ADDITIONS_TL',        label: 'FA_ADDITIONS_TL',        description: 'Asset description' },
  { id: 'FA_ASSET_HISTORY',       label: 'FA_ASSET_HISTORY',       description: 'Category + BOOK_TYPE_CODE per asset' },
  { id: 'FA_BOOKS',               label: 'FA_BOOKS',               description: 'Cost, depreciation info' },
  { id: 'FA_BOOK_CONTROLS',       label: 'FA_BOOK_CONTROLS',       description: 'Book name, ledger, calendar' },
  { id: 'FA_CATEGORIES_B',        label: 'FA_CATEGORIES_B',        description: 'Category segments (SEGMENT1, SEGMENT2)' },
  { id: 'FA_CATEGORIES_TL',       label: 'FA_CATEGORIES_TL',       description: 'Category description' },
  { id: 'FA_CATEGORY_BOOKS',      label: 'FA_CATEGORY_BOOKS',      description: 'GL account CCIDs per category+book' },
  { id: 'FA_DEPRN_SUMMARY',       label: 'FA_DEPRN_SUMMARY',       description: 'NBV, YTD, accumulated depreciation' },
  { id: 'FA_DEPRN_PERIODS',       label: 'FA_DEPRN_PERIODS',       description: 'Period names per book' },
  { id: 'FA_DISTRIBUTION_HISTORY',label: 'FA_DISTRIBUTION_HISTORY',description: 'Cost center, location, employee' },
  { id: 'FA_LOCATIONS',           label: 'FA_LOCATIONS',           description: 'Location description' },
  { id: 'FA_RETIREMENTS',         label: 'FA_RETIREMENTS',         description: 'Retired assets' },
  { id: 'FA_TRANSACTION_HEADERS', label: 'FA_TRANSACTION_HEADERS', description: 'Transaction audit trail' },
  { id: 'FA_DEPRN_DETAIL',        label: 'FA_DEPRN_DETAIL',        description: 'Depreciation by distribution line' },
  { id: 'FA_ASSET_INVOICES',      label: 'FA_ASSET_INVOICES',      description: 'AP/PO source' },
  { id: 'FA_MASS_ADDITIONS',      label: 'FA_MASS_ADDITIONS',      description: 'AP interface' },
  { id: 'FA_ADJUSTMENTS',         label: 'FA_ADJUSTMENTS',         description: 'GL journal lines' },
  { id: 'FA_METHODS',             label: 'FA_METHODS',             description: 'Depreciation method names' },
  { id: 'FA_CALENDAR_PERIODS',    label: 'FA_CALENDAR_PERIODS',    description: 'Calendar dates' },
  { id: 'FA_CONVENTION_TYPES',    label: 'FA_CONVENTION_TYPES',    description: 'Prorate convention names' },
  { id: 'FA_TRANSFER_DETAILS',    label: 'FA_TRANSFER_DETAILS',    description: 'Transfer details' },
  { id: 'FA_MASS_TRANSACTIONS',   label: 'FA_MASS_TRANSACTIONS',   description: 'Mass transaction requests' },
  { id: 'FA_LEASE_DETAILS',       label: 'FA_LEASE_DETAILS',       description: 'Lease information' },
  { id: 'FA_ADD_WARRANTIES',      label: 'FA_ADD_WARRANTIES',      description: 'Warranty information' },
  { id: 'FA_BOOKS_SUMMARY',       label: 'FA_BOOKS_SUMMARY',       description: 'Group assets only' },
];

interface TabState {
  loading: boolean;
  error: string | null;
  columns: string[];
  rows: Record<string, string>[];
  duration: number | null;
  gridSearch: string;
}

const buildSoapEnvelope = (
  reportPath: string,
  params: Record<string, string>,
  username: string,
  password: string,
): string => {
  const paramXml = Object.entries(params)
    .map(([k, v]) => `<v2:item><v2:name>${k}</v2:name><v2:values><v2:item>${v}</v2:item></v2:values></v2:item>`)
    .join('');
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v2="http://xmlns.oracle.com/oxp/service/v2">
  <soapenv:Header/>
  <soapenv:Body>
    <v2:runReport>
      <v2:reportRequest>
        <v2:reportAbsolutePath>${reportPath}</v2:reportAbsolutePath>
        <v2:parameterNameValues><v2:listOfParamNameValues>${paramXml}</v2:listOfParamNameValues></v2:parameterNameValues>
        <v2:reportData/><v2:reportOutputPath/>
      </v2:reportRequest>
      <v2:userID>${username}</v2:userID>
      <v2:password>${password}</v2:password>
    </v2:runReport>
  </soapenv:Body>
</soapenv:Envelope>`;
};

// Generic XML parser — auto-detects row element and columns
const parseGenericXml = (xmlString: string): { columns: string[]; rows: Record<string, string>[] } => {
  if (!xmlString.trim()) return { columns: [], rows: [] };

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');

  // Try G_1 first (standard BIP row element), then find most-repeated child
  let elements: NodeListOf<Element> | Element[] = doc.querySelectorAll('G_1');

  if (elements.length === 0) {
    const root = doc.documentElement;
    const childCounts = new Map<string, number>();
    Array.from(root.children).forEach(c => childCounts.set(c.tagName, (childCounts.get(c.tagName) || 0) + 1));
    let best = { tag: '', count: 0 };
    childCounts.forEach((count, tag) => { if (count > best.count) best = { tag, count }; });
    if (best.tag) elements = doc.querySelectorAll(best.tag);
  }

  if (elements.length === 0) return { columns: [], rows: [] };

  // Collect all column names from ALL rows (union) in case first row is sparse
  const colSet = new Set<string>();
  const colOrder: string[] = [];
  Array.from(elements).slice(0, 5).forEach(el => {
    Array.from(el.children).forEach(c => {
      if (!colSet.has(c.tagName)) { colSet.add(c.tagName); colOrder.push(c.tagName); }
    });
  });

  const rows: Record<string, string>[] = Array.from(elements).map(el => {
    const row: Record<string, string> = {};
    colOrder.forEach(col => {
      row[col] = el.querySelector(col)?.textContent?.trim() || '';
    });
    return row;
  });

  return { columns: colOrder, rows };
};

// ── Component ─────────────────────────────────────────────────────────────────
interface Props { open: boolean; onClose: () => void; }

const FixedAssetsSync: React.FC<Props> = ({ open, onClose }) => {
  const [openTabs, setOpenTabs]   = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  const [tabStates, setTabStates] = useState<Record<string, TabState>>({});
  const [sideSearch, setSideSearch] = useState('');

  const openReport = (reportId: string) => {
    if (!openTabs.includes(reportId)) {
      setOpenTabs(prev => [...prev, reportId]);
    }
    setActiveTab(reportId);
  };

  const closeTab = (reportId: string) => {
    const newTabs = openTabs.filter(t => t !== reportId);
    setOpenTabs(newTabs);
    if (activeTab === reportId) setActiveTab(newTabs[newTabs.length - 1] || '');
    setTabStates(prev => { const n = { ...prev }; delete n[reportId]; return n; });
  };

  const fetchReport = useCallback(async (reportId: string) => {
    setTabStates(prev => ({
      ...prev,
      [reportId]: { loading: true, error: null, columns: [], rows: [], duration: null, gridSearch: '' },
    }));

    const reportPath = `${FA_BASE_PATH}/${reportId}_BIP.xdo`;
    const env = ORACLE_SOAP_CONFIG.prod;
    const envelope = buildSoapEnvelope(reportPath, {}, env.username, env.password);

    const result = await callSoapBip(env.baseUrl, envelope);

    if (!result.success || !result.decodedXml) {
      setTabStates(prev => ({
        ...prev,
        [reportId]: {
          loading: false,
          error: result.error || 'SOAP call failed — no data returned',
          columns: [], rows: [], duration: result.duration ?? null, gridSearch: '',
        },
      }));
      return;
    }

    const { columns, rows } = parseGenericXml(result.decodedXml);
    setTabStates(prev => ({
      ...prev,
      [reportId]: {
        loading: false, error: null,
        columns, rows,
        duration: result.duration ?? null,
        gridSearch: '',
      },
    }));
  }, []);

  const exportToExcel = (reportId: string) => {
    const state = tabStates[reportId];
    if (!state?.rows.length) return;
    const ws = XLSX.utils.json_to_sheet(state.rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, reportId.slice(0, 31));
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const eAPI = (window as any).electronAPI;
    if (eAPI?.openExcel) {
      eAPI.openExcel(buf, `${reportId}.xlsx`);
    } else {
      saveAs(
        new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `${reportId}.xlsx`,
      );
    }
  };

  const renderTabContent = (reportId: string) => {
    const report = FA_REPORTS.find(r => r.id === reportId)!;
    const state  = tabStates[reportId];

    if (!state) {
      return (
        <div style={{ padding: 32, textAlign: 'center' }}>
          <AuditOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
          <div style={{ color: '#8c8c8c', marginBottom: 24 }}>
            Click <strong>Fetch Data</strong> to run the BIP report
          </div>
          <div style={{ marginBottom: 8, fontSize: 12, color: '#aaa', fontFamily: 'monospace' }}>
            {FA_BASE_PATH}/{reportId}_BIP.xdo
          </div>
          <Button
            type="primary"
            icon={<CloudDownloadOutlined />}
            size="large"
            onClick={() => fetchReport(reportId)}
          >
            Fetch Data
          </Button>
        </div>
      );
    }

    if (state.loading) {
      return (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16, color: '#8c8c8c' }}>
            Running SOAP call to Oracle BI Publisher…
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: '#aaa', fontFamily: 'monospace' }}>
            {FA_BASE_PATH}/{reportId}_BIP.xdo
          </div>
        </div>
      );
    }

    if (state.error) {
      return (
        <div style={{ padding: 24 }}>
          <Alert type="error" showIcon message="SOAP Call Failed" description={state.error}
            style={{ marginBottom: 16 }} />
          <Button icon={<CloudDownloadOutlined />} onClick={() => fetchReport(reportId)}>
            Retry
          </Button>
        </div>
      );
    }

    // Filter rows by grid search
    const search = state.gridSearch.toLowerCase();
    const filtered = search
      ? state.rows.filter(r => Object.values(r).some(v => v.toLowerCase().includes(search)))
      : state.rows;

    // Build dynamic columns
    const tableCols = state.columns.map(col => ({
      title: col,
      dataIndex: col,
      key: col,
      width: 140,
      ellipsis: true,
      render: (v: string) => (
        <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>{v || <span style={{ color: '#d9d9d9' }}>—</span>}</Text>
      ),
    }));

    return (
      <div>
        {/* Toolbar */}
        <Space style={{ marginBottom: 12 }} wrap>
          <Button
            type="primary"
            icon={<CloudDownloadOutlined />}
            onClick={() => fetchReport(reportId)}
          >
            Fetch Data
          </Button>
          <Button
            icon={<FileExcelOutlined />}
            disabled={!state.rows.length}
            onClick={() => exportToExcel(reportId)}
            style={{ borderColor: '#1D6F42', color: '#1D6F42' }}
          >
            Export Excel
          </Button>
          <Button
            icon={<SyncOutlined />}
            disabled
            title="Sync to APEX — coming soon"
          >
            Sync to APEX
          </Button>
          <Input.Search
            placeholder="Search grid…"
            allowClear
            size="small"
            style={{ width: 200 }}
            value={state.gridSearch}
            onChange={e => setTabStates(prev => ({
              ...prev, [reportId]: { ...prev[reportId], gridSearch: e.target.value },
            }))}
          />
          {state.duration !== null && (
            <Tag icon={<ClockCircleOutlined />} color="blue">
              {(state.duration / 1000).toFixed(1)}s
            </Tag>
          )}
          {state.rows.length > 0 && (
            <Tag icon={<CheckCircleOutlined />} color="green">
              {filtered.length.toLocaleString()} / {state.rows.length.toLocaleString()} rows
            </Tag>
          )}
        </Space>

        {/* Report path info */}
        <div style={{ marginBottom: 8, fontSize: 11, color: '#8c8c8c', fontFamily: 'monospace' }}>
          <InfoCircleOutlined style={{ marginRight: 4 }} />
          {FA_BASE_PATH}/{reportId}_BIP.xdo
          {' · '}
          {report.description}
        </div>

        <Table
          dataSource={filtered.map((r, i) => ({ ...r, _key: i }))}
          rowKey="_key"
          columns={tableCols}
          size="small"
          scroll={{ x: state.columns.length * 140, y: 420 }}
          pagination={{ pageSize: 100, showSizeChanger: true, showQuickJumper: true }}
          bordered
        />
      </div>
    );
  };

  const filteredReports = sideSearch.trim()
    ? FA_REPORTS.filter(r =>
        r.label.toLowerCase().includes(sideSearch.toLowerCase()) ||
        r.description.toLowerCase().includes(sideSearch.toLowerCase())
      )
    : FA_REPORTS;

  const tabItems = openTabs.map(id => {
    const report = FA_REPORTS.find(r => r.id === id)!;
    const state  = tabStates[id];
    return {
      key: id,
      closable: true,
      label: (
        <span style={{ fontSize: 12 }}>
          {state?.loading && <SyncOutlined spin style={{ marginRight: 4 }} />}
          {state?.rows.length && !state.loading
            ? <Badge count={state.rows.length} size="small" style={{ marginRight: 4, backgroundColor: '#52c41a' }} />
            : null}
          {report.label}
        </span>
      ),
      children: renderTabContent(id),
    };
  });

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width="92vw"
      style={{ top: 20 }}
      styles={{ body: { padding: 0, height: '85vh', overflow: 'hidden' } }}
      title={
        <Space>
          <AuditOutlined style={{ color: '#C74634', fontSize: 18 }} />
          <span style={{ fontWeight: 700 }}>Fixed Assets — BIP Reports</span>
          <Tag color="orange">{FA_REPORTS.length} Reports</Tag>
          <Tag color="blue" style={{ fontFamily: 'monospace', fontSize: 11 }}>{FA_BASE_PATH}</Tag>
        </Space>
      }
      destroyOnClose
    >
      <Layout style={{ height: '100%', background: '#fff' }}>
        {/* Left sidebar — report list */}
        <Sider
          width={260}
          style={{
            background: '#fafafa',
            borderRight: '1px solid #f0f0f0',
            height: '100%',
            overflowY: 'auto',
          }}
        >
          <div style={{ padding: '12px 12px 8px' }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#aaa' }} />}
              placeholder="Search reports…"
              size="small"
              allowClear
              value={sideSearch}
              onChange={e => setSideSearch(e.target.value)}
            />
          </div>
          <Divider style={{ margin: '0 0 4px' }} />

          {filteredReports.map(report => {
            const isOpen   = openTabs.includes(report.id);
            const state    = tabStates[report.id];
            const isActive = activeTab === report.id;

            return (
              <div
                key={report.id}
                onClick={() => openReport(report.id)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  background: isActive ? '#fff2e8' : isOpen ? '#f6ffed' : 'transparent',
                  borderLeft: isActive ? '3px solid #C74634' : isOpen ? '3px solid #52c41a' : '3px solid transparent',
                  borderBottom: '1px solid #f5f5f5',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Text
                    style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: isActive ? 700 : 500 }}
                    ellipsis
                  >
                    {report.label}
                  </Text>
                  {state?.loading && <SyncOutlined spin style={{ fontSize: 10, color: '#C74634' }} />}
                  {state?.rows.length && !state.loading
                    ? <Tag color="green" style={{ fontSize: 9, padding: '0 3px', lineHeight: '14px', marginLeft: 'auto' }}>
                        {state.rows.length}
                      </Tag>
                    : null}
                  {state?.error && <Tag color="red" style={{ fontSize: 9, padding: '0 3px', lineHeight: '14px', marginLeft: 'auto' }}>ERR</Tag>}
                </div>
                <Text type="secondary" style={{ fontSize: 10 }} ellipsis>{report.description}</Text>
              </div>
            );
          })}
        </Sider>

        {/* Main tabbed content */}
        <Content style={{ padding: 16, overflowY: 'auto', height: '100%' }}>
          {openTabs.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 80, color: '#8c8c8c' }}>
              <AuditOutlined style={{ fontSize: 64, color: '#d9d9d9', marginBottom: 16 }} />
              <div style={{ fontSize: 16, marginBottom: 8 }}>No reports open</div>
              <div style={{ fontSize: 13 }}>Click a report in the left panel to open it</div>
            </div>
          ) : (
            <Tabs
              type="editable-card"
              hideAdd
              activeKey={activeTab}
              onChange={setActiveTab}
              onEdit={(key, action) => {
                if (action === 'remove') closeTab(key as string);
              }}
              items={tabItems}
              style={{ height: '100%' }}
            />
          )}
        </Content>
      </Layout>
    </Modal>
  );
};

export default FixedAssetsSync;
