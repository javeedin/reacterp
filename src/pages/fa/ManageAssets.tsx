import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import {
  Layout, Card, Form, Input, Button, Space, Typography, Table, Tag,
  Row, Col, Breadcrumb, Tooltip, Select, Tabs, Descriptions,
  Spin, Empty, Badge, message, Modal, Switch, Statistic, DatePicker, Popconfirm,
} from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import {
  HomeOutlined, SearchOutlined, ReloadOutlined, PlusOutlined,
  FileTextOutlined, LineChartOutlined,
  EnvironmentOutlined, DatabaseOutlined, InfoCircleOutlined,
  BookOutlined, HistoryOutlined, BarcodeOutlined, ApiOutlined, CheckOutlined,
  FilterOutlined, DownloadOutlined, DollarOutlined, SaveOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { APEX_DB_CONFIG } from '../../config/api.config';
import {
  searchAssets, getAssetDetail, getAssetBooks, getAssetDeprn,
  getAssetDistributions, getAssetInvoices, getAssetTransactions,
  getCategoryDetail, getCategoryBooks, postAssetDeprn, deleteAssetDeprn,
  getBookControls,
  formatCurrency, assetTypeLabel, assetStatusLabel,
} from '../../services/fa.service';
import type {
  AssetRecord, AssetDetail, AssetBook, DeprnRecord,
  DistributionRecord, InvoiceRecord, TransactionRecord, CategoryBookRecord,
  BookControlRecord,
} from '../../services/fa.service';

const { Content } = Layout;
const { Text, Title } = Typography;
const { Option } = Select;

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtDate = (v: string | null | undefined): string => {
  if (!v) return '—';
  if (/^\d{4}-[A-Za-z]{3}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return `${d.getUTCFullYear()}-${MONTHS[d.getUTCMonth()]}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

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

const statusTag = (retiredFlag: string) => (
  <Tag color={retiredFlag === 'YES' ? 'error' : 'success'} style={{ borderRadius: 4, fontSize: 11 }}>
    {assetStatusLabel(retiredFlag)}
  </Tag>
);

// ── Per-tab data ───────────────────────────────────────────────────────────────
interface OpenAssetTab {
  key: string;
  asset: AssetRecord;
  loading: boolean;
  detail: Partial<AssetDetail> | null;
  books: AssetBook[];
  deprn: DeprnRecord[];
  distributions: DistributionRecord[];
  invoices: InvoiceRecord[];
  transactions: TransactionRecord[];
  categoryBooks: CategoryBookRecord[];
  categoryName: string;
  categoryId: string;
  categoryApiUrl: string;
  activeSubTab: string;
}

// ── Asset tab content ──────────────────────────────────────────────────────────
const AssetTabContent: React.FC<{
  tab: OpenAssetTab;
  onSubTabChange: (key: string, subTab: string) => void;
}> = ({ tab, onSubTabChange }) => {
  const { asset, detail, books, deprn, distributions, invoices, transactions, categoryBooks, categoryName, categoryId, categoryApiUrl, loading, activeSubTab } = tab;

  // Depreciation filter state
  const [deprnFY,     setDeprnFY]     = useState('');
  const [deprnPeriod, setDeprnPeriod] = useState('');

  // Depreciation preview modal state
  interface DeprnRow { period: string; openingNbv: number; depreciation: number; closingNbv: number; }
  interface PostResult { period: string; status: 'POSTED' | 'ALREADY_EXISTS' | 'ERROR'; message?: string; }
  const [deprnModal,     setDeprnModal]     = useState(false);
  const [deprnFromDate,  setDeprnFromDate]  = useState<dayjs.Dayjs | null>(null);
  const [deprnToDate,    setDeprnToDate]    = useState<dayjs.Dayjs>(dayjs());
  const [deprnRows,      setDeprnRows]      = useState<DeprnRow[]>([]);
  const [selectedPeriods,setSelectedPeriods]= useState<Set<string>>(new Set());
  const [postResults,    setPostResults]    = useState<PostResult[]>([]);
  const [posting,        setPosting]        = useState(false);

  const openDeprnPreview = () => {
    const dpis = asset.datePlacedInService;
    setDeprnFromDate(dpis ? dayjs(dpis) : null);
    setDeprnToDate(dayjs());
    setDeprnRows([]);
    setSelectedPeriods(new Set());
    setPostResults([]);
    setDeprnModal(true);
  };

  // Normalise a period string to "YYYY-MM" for duplicate detection
  const normPeriod = (p: string) => {
    const d = dayjs(p, ['MMM-YYYY', 'MMM-YY', 'MMMM-YYYY']);
    return d.isValid() ? d.format('YYYY-MM') : p.toUpperCase();
  };

  // Periods already posted for this asset (from deprn tab data)
  const postedPeriods = new Set(deprn.map(r => normPeriod(r.periodName)));
  const isPosted = (period: string) => postedPeriods.has(normPeriod(period));

  const handleCreateDeprn = async () => {
    const toPost = deprnRows.filter(r => selectedPeriods.has(r.period) && !isPosted(r.period));
    if (!toPost.length) return;
    setPosting(true);
    setPostResults([]);
    const results: PostResult[] = [];
    for (const row of toPost) {
      const res = await postAssetDeprn({
        assetId:      asset.assetId,
        bookTypeCode: asset.bookTypeCode || books[0]?.bookTypeCode || '',
        periodName:   row.period,
        deprnAmount:  row.depreciation,
      });
      results.push({
        period:  row.period,
        status:  res.success ? 'POSTED' : (res.status === 'ALREADY_EXISTS' ? 'ALREADY_EXISTS' : 'ERROR'),
        message: res.error,
      });
    }
    setPostResults(results);
    setSelectedPeriods(new Set());
    setPosting(false);
    // Refresh deprn tab in background by reloading (handled via message)
    const posted = results.filter(r => r.status === 'POSTED').length;
    if (posted > 0) message.success(`${posted} period(s) posted successfully`);
  };

  const calcDeprn = () => {
    const b0 = books[0];
    const cost       = parseFloat(asset.cost)       || 0;
    const salvage    = parseFloat(b0?.salvageValue ?? asset.salvageValue) || 0;
    const lifeMonths = Number(b0?.lifeInMonths)     || 0;

    if (lifeMonths <= 0 || cost <= 0 || !deprnFromDate) { setDeprnRows([]); return; }

    const monthlyDeprn = (cost - salvage) / lifeMonths;
    const rows: DeprnRow[] = [];
    let nbv = cost;
    let cur = deprnFromDate.startOf('month');
    const end = deprnToDate.startOf('month');

    while (cur.isBefore(end) || cur.isSame(end, 'month')) {
      const depr = Math.min(monthlyDeprn, nbv - salvage);
      if (depr <= 0) { cur = cur.add(1, 'month'); continue; }
      rows.push({ period: cur.format('MMM-YYYY'), openingNbv: nbv, depreciation: depr, closingNbv: nbv - depr });
      nbv -= depr;
      cur = cur.add(1, 'month');
    }
    setDeprnRows(rows);
  };

  // Derived unique option lists for filter dropdowns
  const fyOptions     = Array.from(new Set(deprn.map(r => r.fiscalYear).filter(Boolean))).sort((a, b) => b.localeCompare(a));
  const periodOptions = Array.from(new Set(deprn.map(r => r.periodName).filter(Boolean))).sort((a, b) => b.localeCompare(a));

  const filteredDeprn = deprn
    .filter(r =>
      (!deprnFY     || r.fiscalYear  === deprnFY) &&
      (!deprnPeriod || r.periodName  === deprnPeriod)
    )
    .sort((a, b) => {
      const fyDiff = (a.fiscalYear || '').localeCompare(b.fiscalYear || '');
      if (fyDiff !== 0) return fyDiff;
      return (Number(a.periodNum) || 0) - (Number(b.periodNum) || 0);
    });

  const exportDeprnToExcel = () => {
    const data = filteredDeprn.map(r => ({
      'FY':                         r.fiscalYear,
      'Period Num':                 r.periodNum,
      'Period':                     r.periodName,
      'Total Amount':               parseFloat(r.totalDeprnAmount) || 0,
      'Depreciation Amount':        parseFloat(r.deprnAmount) || 0,
      'Deprn Adjustment':           parseFloat(r.deprnAdjustmentAmount) || 0,
      'Bonus Deprn Amount':         parseFloat(r.bonusDeprnAmount) || 0,
      'Bonus Deprn Adjustment':     parseFloat(r.bonusDeprnAdjustmentAmount) || 0,
      'YTD Deprn':                  parseFloat(r.ytdDeprn) || 0,
      'Deprn Reserve':              parseFloat(r.deprnReserve) || 0,
      'Cost':                       parseFloat(r.cost) || 0,
      'NBV':                        parseFloat(r.nbv) || 0,
      'Reval Reserve':              parseFloat(r.revalReserve) || 0,
      'Impairment Amount':          parseFloat(r.impairmentAmount) || 0,
      'Backlog Deprn Reserve':      parseFloat(r.backlogDeprnReserve) || 0,
      'Distribution ID':            r.distributionId,
      'Source Code':                r.deprnSourceCode,
      'Run Date':                   r.deprnRunDate,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Depreciation');
    XLSX.writeFile(wb, `deprn_asset${asset.assetId}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const [deletingPeriod, setDeletingPeriod] = useState<string | null>(null);

  const handleDeleteDeprn = async (record: DeprnRecord) => {
    const book = books[0]?.bookTypeCode || '';
    if (!book) { message.error('No book found for this asset'); return; }
    setDeletingPeriod(record.periodName);
    try {
      const res = await deleteAssetDeprn({
        assetId: asset.assetId,
        bookTypeCode: book,
        periodName: record.periodName,
      });
      if (res.success) {
        message.success(`Depreciation deleted for period ${record.periodName}`);
      } else if (res.status === 'PERIOD_CLOSED') {
        message.error(`Period ${record.periodName} is closed and cannot be deleted`);
      } else {
        message.error(res.error || 'Delete failed');
      }
    } finally {
      setDeletingPeriod(null);
    }
  };

  const deprnColumns: ColumnsType<DeprnRecord> = [
    { title: 'FY',          dataIndex: 'fiscalYear',               key: 'fiscalYear',  width: 60  },
    { title: 'Period Num',  dataIndex: 'periodNum',                key: 'periodNum',   width: 80  },
    { title: 'Period',      dataIndex: 'periodName',               key: 'periodName',  width: 110 },
    { title: 'Total Amount',            dataIndex: 'totalDeprnAmount',           key: 'totalAmt',  align: 'right' as const, render: (v) => formatCurrency(v) },
    { title: 'Depreciation Amount',     dataIndex: 'deprnAmount',                key: 'deprnAmt',  align: 'right' as const, render: (v) => formatCurrency(v) },
    { title: 'Deprn Adjustment',        dataIndex: 'deprnAdjustmentAmount',      key: 'deprnAdj',  align: 'right' as const, render: (v) => formatCurrency(v) },
    { title: 'Bonus Deprn Amount',      dataIndex: 'bonusDeprnAmount',           key: 'bonusAmt',  align: 'right' as const, render: (v) => formatCurrency(v) },
    { title: 'Bonus Deprn Adjustment',  dataIndex: 'bonusDeprnAdjustmentAmount', key: 'bonusAdj',  align: 'right' as const, render: (v) => formatCurrency(v) },
    { title: 'YTD Deprn',               dataIndex: 'ytdDeprn',                   key: 'ytdDeprn',  align: 'right' as const, render: (v) => formatCurrency(v) },
    { title: 'Deprn Reserve',           dataIndex: 'deprnReserve',               key: 'reserve',   align: 'right' as const, render: (v) => formatCurrency(v) },
    {
      title: '',
      key: 'action',
      width: 70,
      fixed: 'right' as const,
      render: (_: any, record: DeprnRecord) => (
        <Popconfirm
          title={`Delete depreciation for ${record.periodName}?`}
          description="This cannot be undone if the period has been transferred to GL."
          onConfirm={() => handleDeleteDeprn(record)}
          okText="Delete"
          okButtonProps={{ danger: true }}
        >
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            loading={deletingPeriod === record.periodName}
          />
        </Popconfirm>
      ),
    },
  ];

  const distColumns: ColumnsType<DistributionRecord> = [
    { title: 'ID',        dataIndex: 'distributionId',   key: 'distributionId',  width: 80  },
    { title: 'Book',      dataIndex: 'bookTypeCode',     key: 'bookTypeCode',    ellipsis: true },
    { title: 'Units',     dataIndex: 'unitsAssigned',    key: 'unitsAssigned',   width: 70  },
    { title: 'Location',  key: 'location',
      render: (_: any, r: DistributionRecord) =>
        [r.locationSeg1, r.locationSeg2, r.locationSeg3].filter(Boolean).join(' / ') || '—' },
    { title: 'Effective', dataIndex: 'dateEffective',    key: 'dateEffective',   width: 110, render: fmtDate },
    { title: 'End Date',  dataIndex: 'dateIneffective',  key: 'dateIneffective', width: 110,
      render: (v) => v ? fmtDate(v) : '—' },
  ];

  const invoiceColumns: ColumnsType<InvoiceRecord> = [
    { title: 'Invoice ID',  dataIndex: 'assetInvoiceId',   key: 'assetInvoiceId',  width: 90  },
    { title: 'Book',        dataIndex: 'bookTypeCode',     key: 'bookTypeCode',    ellipsis: true },
    { title: 'Cost',        dataIndex: 'fixedAssetsCost',  key: 'fixedAssetsCost', align: 'right' as const, render: (v) => formatCurrency(v) },
    { title: 'Description', dataIndex: 'description',      key: 'description',     ellipsis: true },
    { title: 'Feeder',      dataIndex: 'feederSystemName', key: 'feederSystemName',ellipsis: true },
    { title: 'Effective',   dataIndex: 'dateEffective',    key: 'dateEffective',   width: 110, render: fmtDate },
  ];

  const txnColumns: ColumnsType<TransactionRecord> = [
    { title: 'Txn ID',    dataIndex: 'transactionHeaderId', key: 'txnId',   width: 90  },
    { title: 'Book',      dataIndex: 'bookTypeCode',        key: 'book',    ellipsis: true },
    { title: 'Type',      dataIndex: 'transactionTypeCode', key: 'type',
      render: (v) => <Tag style={{ borderRadius: 4, fontSize: 11 }}>{v}</Tag> },
    { title: 'Txn Date',  dataIndex: 'transactionDate',     key: 'txnDate', width: 110, render: fmtDate },
    { title: 'Effective', dataIndex: 'dateEffective',       key: 'effDate', width: 110, render: fmtDate },
    { title: 'Interface', dataIndex: 'callingInterface',    key: 'iface',   ellipsis: true },
  ];

  const subTabs = [
    {
      key: 'general',
      label: <span><InfoCircleOutlined style={{ marginRight: 4 }} />Financial</span>,
      children: loading
        ? <Spin style={{ display: 'block', margin: '40px auto' }} />
        : (
          <Descriptions column={2} size="small" bordered
            styles={{ label: { fontWeight: 500, width: 160, background: REDWOOD.neutral100 } }}
            style={{ marginTop: 4 }}
          >
            <Descriptions.Item label="Asset Number">{asset.asset_number || asset.assetNumber || asset.assetId}</Descriptions.Item>
            <Descriptions.Item label="Asset ID">{asset.assetId}</Descriptions.Item>
            <Descriptions.Item label="Asset Type">{assetTypeLabel(detail?.assetType || asset.assetType || '')}</Descriptions.Item>
            <Descriptions.Item label="Description" span={2}>{detail?.description || asset.description}</Descriptions.Item>
            <Descriptions.Item label="Book">{asset.bookTypeCode || '—'}</Descriptions.Item>
            <Descriptions.Item label="Date in Service">{fmtDate(asset.datePlacedInService)}</Descriptions.Item>
            <Descriptions.Item label="Cost">{formatCurrency(asset.cost)}</Descriptions.Item>
            <Descriptions.Item label="Original Cost">{formatCurrency(asset.originalCost)}</Descriptions.Item>
            <Descriptions.Item label="Adjusted Cost">{formatCurrency(asset.adjustedCost)}</Descriptions.Item>
            <Descriptions.Item label="Salvage Value">{formatCurrency(asset.salvageValue)}</Descriptions.Item>
            <Descriptions.Item label="Deprn Reserve">{formatCurrency(asset.deprnReserve)}</Descriptions.Item>
            <Descriptions.Item label="NBV">{formatCurrency(asset.nbv)}</Descriptions.Item>
            <Descriptions.Item label="Depreciate">{asset.depreciateFlag || '—'}</Descriptions.Item>
            <Descriptions.Item label="Capitalize">{asset.capitalizeFlag || '—'}</Descriptions.Item>
            <Descriptions.Item label="Status">{statusTag(asset.retiredFlag)}</Descriptions.Item>
            <Descriptions.Item label="Date Ineffective">{fmtDate(asset.dateIneffective)}</Descriptions.Item>
            {books[0] && (() => {
              const b0 = books[0];
              const totalMonths = Number(b0.lifeInMonths) || 0;
              const calcRemaining = (fromDate: string) => {
                if (!fromDate || !totalMonths) return null;
                const start = new Date(fromDate);
                const now = new Date();
                const elapsed = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
                const rem = Math.max(0, totalMonths - elapsed);
                return { years: Math.floor(rem / 12), months: rem % 12 };
              };
              const remSvc    = calcRemaining(b0.datePlacedInService);
              const remProrate = calcRemaining(b0.prorateDate);
              return (
                <>
                  <Descriptions.Item label="Depreciation Method">{b0.methodName || b0.methodCode || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Prorate Date">{fmtDate(b0.prorateDate)}</Descriptions.Item>
                  <Descriptions.Item label="Life in Years" span={2}>
                    {totalMonths
                      ? <Space size={16}>
                          <span><Text type="secondary" style={{ fontSize: 11 }}>Years</Text>{' '}<Text strong>{Math.floor(totalMonths / 12)}</Text></span>
                          <span><Text type="secondary" style={{ fontSize: 11 }}>Months</Text>{' '}<Text strong>{totalMonths % 12}</Text></span>
                        </Space>
                      : '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Group Asset Number">{'—'}</Descriptions.Item>
                  <Descriptions.Item label="Remaining Life From" span={2}>
                    <Space direction="vertical" size={4}>
                      {remSvc && (
                        <Space size={16}>
                          <Text type="secondary" style={{ fontSize: 11, width: 100 }}>In Service Date</Text>
                          <span><Text type="secondary" style={{ fontSize: 11 }}>Years</Text>{' '}<Text strong>{remSvc.years}</Text></span>
                          <span><Text type="secondary" style={{ fontSize: 11 }}>Months</Text>{' '}<Text strong>{remSvc.months}</Text></span>
                        </Space>
                      )}
                      {remProrate && (
                        <Space size={16}>
                          <Text type="secondary" style={{ fontSize: 11, width: 100 }}>Prorate Date</Text>
                          <span><Text type="secondary" style={{ fontSize: 11 }}>Years</Text>{' '}<Text strong>{remProrate.years}</Text></span>
                          <span><Text type="secondary" style={{ fontSize: 11 }}>Months</Text>{' '}<Text strong>{remProrate.months}</Text></span>
                        </Space>
                      )}
                    </Space>
                  </Descriptions.Item>
                </>
              );
            })()}
          </Descriptions>
        ),
    },
    {
      key: 'descriptive',
      label: <span><BarcodeOutlined style={{ marginRight: 4 }} />Descriptive</span>,
      children: loading
        ? <Spin style={{ display: 'block', margin: '40px auto' }} />
        : (
          <Descriptions column={2} size="small" bordered
            styles={{ label: { fontWeight: 500, width: 160, background: REDWOOD.neutral100 } }}
            style={{ marginTop: 4 }}
          >
            <Descriptions.Item label="Tag Number">{detail?.tagNumber || asset.tagNumber || '—'}</Descriptions.Item>
            <Descriptions.Item label="Serial Number">{detail?.serialNumber || asset.serialNumber || '—'}</Descriptions.Item>
            <Descriptions.Item label="Manufacturer">{detail?.manufacturerName || detail?.manufacturer || '—'}</Descriptions.Item>
            <Descriptions.Item label="Model Number">{detail?.modelNumber || '—'}</Descriptions.Item>
            <Descriptions.Item label="New / Used">{detail?.newUsed || '—'}</Descriptions.Item>
            <Descriptions.Item label="In Use">{detail?.inUseFlag || asset.inUseFlag || '—'}</Descriptions.Item>
            <Descriptions.Item label="Owned / Leased">{detail?.ownedLeased || asset.ownedLeased || '—'}</Descriptions.Item>
            <Descriptions.Item label="Units">{detail?.units || asset.units || '—'}</Descriptions.Item>
            <Descriptions.Item label="Property Type">{detail?.propertyTypeCode || '—'}</Descriptions.Item>
            <Descriptions.Item label="Feeder System">{detail?.feederSystemName || '—'}</Descriptions.Item>
            <Descriptions.Item label="Created By">{detail?.createdBy || asset.createdBy || '—'}</Descriptions.Item>
            <Descriptions.Item label="Creation Date">{fmtDate(detail?.creationDate || asset.creationDate)}</Descriptions.Item>
            <Descriptions.Item label="Last Updated By">{detail?.lastUpdatedBy || asset.lastUpdatedBy || '—'}</Descriptions.Item>
            <Descriptions.Item label="Last Update Date">{fmtDate(detail?.lastUpdateDate || asset.lastUpdateDate)}</Descriptions.Item>
          </Descriptions>
        ),
    },
    {
      key: 'books',
      label: <span><BookOutlined style={{ marginRight: 4 }} />Books</span>,
      children: loading
        ? <Spin style={{ display: 'block', margin: '40px auto' }} />
        : books.length === 0
          ? <Empty description="No book records" style={{ marginTop: 32 }} />
          : (
            <div style={{ marginTop: 4 }}>
              {books.map((b, i) => (
                <Card key={i} size="small"
                  style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
                  title={
                    <Space>
                      <BookOutlined style={{ color: FA_COLOR }} />
                      <Text strong>{b.bookTypeCode}</Text>
                      {b.companyCode && (
                        <Tag color="blue" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                          Company: {b.companyCode}
                        </Tag>
                      )}
                    </Space>
                  }
                >
                  <Descriptions column={2} size="small">
                    <Descriptions.Item label="Company Code">{b.companyCode || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Date in Service">{fmtDate(b.datePlacedInService)}</Descriptions.Item>
                    <Descriptions.Item label="Deprn Start">{fmtDate(b.deprnStartDate)}</Descriptions.Item>
                    <Descriptions.Item label="Cost">{formatCurrency(b.cost)}</Descriptions.Item>
                    <Descriptions.Item label="Original Cost">{formatCurrency(b.originalCost)}</Descriptions.Item>
                    <Descriptions.Item label="Salvage Value">{formatCurrency(b.salvageValue)}</Descriptions.Item>
                    <Descriptions.Item label="Recoverable Cost">{formatCurrency(b.recoverableCost)}</Descriptions.Item>
                    <Descriptions.Item label="Deprn Reserve">{formatCurrency(b.deprnReserve)}</Descriptions.Item>
                    <Descriptions.Item label="YTD Deprn">{formatCurrency(b.ytdDeprn)}</Descriptions.Item>
                    <Descriptions.Item label="NBV">{formatCurrency(b.nbv)}</Descriptions.Item>
                    <Descriptions.Item label="Method">{b.methodCode || b.methodName || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Depreciation Method">{b.methodName || b.methodCode || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Life in Years" span={2}>
                      {b.lifeInMonths
                        ? <Space size={16}>
                            <span><Text type="secondary" style={{ fontSize: 11 }}>Years</Text>{' '}<Text strong>{Math.floor(Number(b.lifeInMonths) / 12)}</Text></span>
                            <span><Text type="secondary" style={{ fontSize: 11 }}>Months</Text>{' '}<Text strong>{Number(b.lifeInMonths) % 12}</Text></span>
                          </Space>
                        : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Group Asset Number">{'—'}</Descriptions.Item>
                    <Descriptions.Item label="Prorate Date">{fmtDate(b.prorateDate)}</Descriptions.Item>
                    {(() => {
                      const totalMonths = Number(b.lifeInMonths) || 0;
                      const calcRemaining = (fromDate: string) => {
                        if (!fromDate || !totalMonths) return null;
                        const start = new Date(fromDate);
                        const now = new Date();
                        const elapsedMonths = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
                        const rem = Math.max(0, totalMonths - elapsedMonths);
                        return { years: Math.floor(rem / 12), months: rem % 12 };
                      };
                      const remFromService = calcRemaining(b.datePlacedInService);
                      const remFromProrate = calcRemaining(b.prorateDate);
                      return (
                        <>
                          <Descriptions.Item label="Remaining Life From" span={2}>
                            <Space direction="vertical" size={4}>
                              {remFromService && (
                                <Space size={16}>
                                  <Text type="secondary" style={{ fontSize: 11 }}>In Service Date</Text>
                                  <span><Text type="secondary" style={{ fontSize: 11 }}>Years</Text>{' '}<Text strong>{remFromService.years}</Text></span>
                                  <span><Text type="secondary" style={{ fontSize: 11 }}>Months</Text>{' '}<Text strong>{remFromService.months}</Text></span>
                                </Space>
                              )}
                              {remFromProrate && (
                                <Space size={16}>
                                  <Text type="secondary" style={{ fontSize: 11 }}>Prorate Date</Text>
                                  <span><Text type="secondary" style={{ fontSize: 11 }}>Years</Text>{' '}<Text strong>{remFromProrate.years}</Text></span>
                                  <span><Text type="secondary" style={{ fontSize: 11 }}>Months</Text>{' '}<Text strong>{remFromProrate.months}</Text></span>
                                </Space>
                              )}
                            </Space>
                          </Descriptions.Item>
                        </>
                      );
                    })()}
                    <Descriptions.Item label="Depreciate">{b.depreciateFlag}</Descriptions.Item>
                    <Descriptions.Item label="Capitalize">{b.capitalizeFlag}</Descriptions.Item>
                    <Descriptions.Item label="Date Ineffective">{fmtDate(b.dateIneffective)}</Descriptions.Item>
                  </Descriptions>
                </Card>
              ))}
            </div>
          ),
    },
    {
      key: 'depreciation',
      label: <span><LineChartOutlined style={{ marginRight: 4 }} />Depreciation</span>,
      children: loading
        ? <Spin style={{ display: 'block', margin: '40px auto' }} />
        : (
          <>
            {/* Filter row */}
            <div style={{
              display: 'flex', gap: 10, alignItems: 'center',
              padding: '8px 0 10px', flexWrap: 'wrap',
            }}>
              <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>Filter:</Text>
              <Select
                allowClear placeholder="Fiscal Year" size="small"
                style={{ width: 120 }} value={deprnFY || undefined}
                onChange={(v) => { setDeprnFY(v || ''); setDeprnPeriod(''); }}
              >
                {fyOptions.map(fy => <Option key={fy} value={fy}>{fy}</Option>)}
              </Select>
              <Select
                allowClear placeholder="Period" size="small"
                style={{ width: 140 }} value={deprnPeriod || undefined}
                onChange={(v) => setDeprnPeriod(v || '')}
              >
                {(deprnFY
                  ? Array.from(new Set(deprn.filter(r => r.fiscalYear === deprnFY).map(r => r.periodName).filter(Boolean))).sort((a,b) => b.localeCompare(a))
                  : periodOptions
                ).map(p => <Option key={p} value={p}>{p}</Option>)}
              </Select>
              {(deprnFY || deprnPeriod) && (
                <Button size="small" onClick={() => { setDeprnFY(''); setDeprnPeriod(''); }}>
                  Clear
                </Button>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {filteredDeprn.length} of {deprn.length} records
                </Text>
                {filteredDeprn.length > 0 && (
                  <Tooltip title="Export to Excel">
                    <Button size="small" icon={<DownloadOutlined />} onClick={exportDeprnToExcel}>
                      Excel
                    </Button>
                  </Tooltip>
                )}
                <Tooltip title="Show Depreciation APIs">
                  <Button
                    size="small"
                    icon={<ApiOutlined />}
                    style={{ color: FA_COLOR, borderColor: FA_COLOR }}
                    onClick={() => Modal.info({
                      title: 'Depreciation API Endpoints',
                      width: 780,
                      content: (
                        <div style={{ marginTop: 8 }}>
                          <Text strong style={{ fontSize: 12 }}>GET — Depreciation records for this asset</Text>
                          <div style={{ margin: '6px 0 14px' }}>
                            <Text copyable style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
                              {`${APEX_DB_CONFIG.baseUrl}/fa/assets/${asset.assetId}/deprn`}
                            </Text>
                          </div>
                          <Text strong style={{ fontSize: 12 }}>POST — Post depreciation for this asset (check-then-post)</Text>
                          <div style={{ margin: '6px 0 14px' }}>
                            <Text copyable style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
                              {`${APEX_DB_CONFIG.baseUrl}/fa/deprn-post-single`}
                            </Text>
                          </div>
                          <Text type="secondary" style={{ fontSize: 11 }}>Request body: {'{'} "assetId", "bookTypeCode", "periodName", "deprnAmount" {'}'}</Text>
                          <div style={{ marginTop: 14 }}>
                            <Text strong style={{ fontSize: 12 }}>POST — Create depreciation (errors on duplicate)</Text>
                            <div style={{ marginTop: 6 }}>
                              <Text copyable style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
                                {`${APEX_DB_CONFIG.baseUrl}/fa/deprn-post-asset`}
                              </Text>
                            </div>
                          </div>
                          <div style={{ marginTop: 14 }}>
                            <Text strong style={{ fontSize: 12 }}>DELETE — Delete depreciation (blocked if period closed)</Text>
                            <div style={{ marginTop: 6 }}>
                              <Text copyable style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
                                {`${APEX_DB_CONFIG.baseUrl}/fa/deprn-post-asset`}
                              </Text>
                            </div>
                          </div>
                        </div>
                      ),
                    })}
                  />
                </Tooltip>
                <Button
                  size="small"
                  icon={<DollarOutlined />}
                  style={{ borderColor: FA_COLOR, color: FA_COLOR }}
                  onClick={openDeprnPreview}
                  disabled={!books[0]?.lifeInMonths}
                >
                  Preview Depreciation
                </Button>
              </div>
            </div>
            <Table
              dataSource={filteredDeprn} columns={deprnColumns}
              rowKey={(r) => `${r.periodCounter}-${r.distributionId}`}
              size="small"
              scroll={{ x: 1000 }}
              pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: ['15','25','50'] }}
              locale={{ emptyText: 'No depreciation records' }}
              summary={(rows) => {
                const total = rows.reduce((s, r) => s + (parseFloat(r.deprnAmount) || 0), 0);
                return (
                  <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 600 }}>
                    <Table.Summary.Cell index={0} colSpan={4}>
                      <Text strong style={{ fontSize: 12 }}>Total ({rows.length} periods)</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">
                      <Text strong style={{ color: FA_COLOR }}>{formatCurrency(String(total))}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} colSpan={4} />
                  </Table.Summary.Row>
                );
              }}
            />

            {/* ── Preview Depreciation Modal ── */}
            <Modal
              open={deprnModal}
              onCancel={() => { setDeprnModal(false); setPostResults([]); }}
              width={900}
              title={<Space><DollarOutlined style={{ color: FA_COLOR }} /><span>Depreciation Preview — {asset.asset_number || asset.assetNumber}</span></Space>}
              footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {selectedPeriods.size > 0 ? `${selectedPeriods.size} period(s) selected` : 'Select rows to post depreciation'}
                  </Text>
                  <Space>
                    <Button onClick={() => { setDeprnModal(false); setPostResults([]); }}>Close</Button>
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      loading={posting}
                      disabled={selectedPeriods.size === 0}
                      style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
                      onClick={handleCreateDeprn}
                    >
                      Create Depreciation ({selectedPeriods.size})
                    </Button>
                  </Space>
                </div>
              }
            >
              {/* Info strip */}
              {books[0] && (
                <div style={{ background: REDWOOD.neutral100, borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12 }}>
                  <Space size={20} wrap>
                    <span><Text type="secondary">Method: </Text><Text strong>{books[0].methodName || books[0].methodCode || '—'}</Text></span>
                    <span><Text type="secondary">Life: </Text><Text strong>{books[0].lifeInMonths} months</Text></span>
                    <span><Text type="secondary">Cost: </Text><Text strong>{formatCurrency(asset.cost)}</Text></span>
                    <span><Text type="secondary">Salvage: </Text><Text strong>{formatCurrency(books[0].salvageValue ?? asset.salvageValue)}</Text></span>
                    <span><Text type="secondary">Book: </Text><Text strong>{books[0].bookTypeCode}</Text></span>
                  </Space>
                </div>
              )}

              <Row gutter={[12, 0]} style={{ marginBottom: 12 }}>
                <Col xs={24} sm={8}>
                  <div style={{ marginBottom: 4 }}><Text type="secondary" style={{ fontSize: 11 }}>From Date (Date in Service)</Text></div>
                  <DatePicker style={{ width: '100%' }} value={deprnFromDate} format="DD-MMM-YYYY" onChange={v => { setDeprnFromDate(v); setDeprnRows([]); setSelectedPeriods(new Set()); }} />
                </Col>
                <Col xs={24} sm={8}>
                  <div style={{ marginBottom: 4 }}><Text type="secondary" style={{ fontSize: 11 }}>To Date</Text></div>
                  <DatePicker style={{ width: '100%' }} value={deprnToDate} format="DD-MMM-YYYY" onChange={v => { setDeprnToDate(v || dayjs()); setDeprnRows([]); setSelectedPeriods(new Set()); }} />
                </Col>
                <Col xs={24} sm={8} style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <Button type="primary" style={{ background: FA_COLOR, borderColor: FA_COLOR, width: '100%' }} onClick={calcDeprn} disabled={!deprnFromDate}>
                    Calculate
                  </Button>
                </Col>
              </Row>

              {/* Post results banner */}
              {postResults.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {postResults.map(r => (
                    <div key={r.period} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 10px', marginBottom: 4, borderRadius: 4, fontSize: 12,
                      background: r.status === 'POSTED' ? '#f6ffed' : r.status === 'ALREADY_EXISTS' ? '#fffbe6' : '#fff2f0',
                      border: `1px solid ${r.status === 'POSTED' ? '#b7eb8f' : r.status === 'ALREADY_EXISTS' ? '#ffe58f' : '#ffccc7'}`,
                    }}>
                      <Tag color={r.status === 'POSTED' ? 'success' : r.status === 'ALREADY_EXISTS' ? 'warning' : 'error'} style={{ fontSize: 11 }}>
                        {r.status === 'POSTED' ? 'Posted' : r.status === 'ALREADY_EXISTS' ? 'Already Posted' : 'Error'}
                      </Tag>
                      <Text strong style={{ fontSize: 12 }}>{r.period}</Text>
                      {r.message && <Text type="secondary" style={{ fontSize: 11 }}>— {r.message}</Text>}
                    </div>
                  ))}
                </div>
              )}

              {deprnRows.length > 0 && (() => {
                const totalDeprn = deprnRows.reduce((s, r) => s + r.depreciation, 0);
                const finalNbv   = deprnRows[deprnRows.length - 1].closingNbv;
                const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const selectableCount = deprnRows.filter(r => !isPosted(r.period)).length;
                const allSelected = selectableCount > 0 && deprnRows.filter(r => !isPosted(r.period)).every(r => selectedPeriods.has(r.period));

                const toggleAll = () => {
                  if (allSelected) {
                    setSelectedPeriods(new Set());
                  } else {
                    setSelectedPeriods(new Set(deprnRows.filter(r => !isPosted(r.period)).map(r => r.period)));
                  }
                };
                const toggle = (period: string) => {
                  setSelectedPeriods(prev => {
                    const next = new Set(prev);
                    next.has(period) ? next.delete(period) : next.add(period);
                    return next;
                  });
                };

                return (
                  <>
                    {/* Table header */}
                    <div style={{ border: `1px solid ${REDWOOD.neutral200}`, borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '36px 110px 1fr 1fr 1fr 90px', background: REDWOOD.neutral100, padding: '6px 12px', fontSize: 12, fontWeight: 600, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
                        <span>
                          <input type="checkbox" checked={allSelected} onChange={toggleAll}
                            title="Select all unposted" style={{ cursor: 'pointer' }} />
                        </span>
                        <span>Period</span>
                        <span style={{ textAlign: 'right' }}>Opening NBV</span>
                        <span style={{ textAlign: 'right' }}>Depreciation</span>
                        <span style={{ textAlign: 'right' }}>Closing NBV</span>
                        <span style={{ textAlign: 'center' }}>Status</span>
                      </div>
                      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                        {deprnRows.map((r, i) => {
                          const posted     = isPosted(r.period);
                          const selected   = selectedPeriods.has(r.period);
                          const postResult = postResults.find(p => p.period === r.period);
                          return (
                            <div key={r.period} style={{
                              display: 'grid', gridTemplateColumns: '36px 110px 1fr 1fr 1fr 90px',
                              padding: '5px 12px', fontSize: 12,
                              background: posted ? '#f6ffed' : selected ? '#e6f4ff' : i % 2 === 0 ? '#fff' : REDWOOD.neutral100,
                              borderBottom: `1px solid ${REDWOOD.neutral200}`,
                              opacity: posted ? 0.75 : 1,
                            }}>
                              <span>
                                {!posted && (
                                  <input type="checkbox" checked={selected} onChange={() => toggle(r.period)}
                                    style={{ cursor: 'pointer' }} />
                                )}
                              </span>
                              <span style={{ fontFamily: 'monospace', fontWeight: selected ? 600 : 400 }}>{r.period}</span>
                              <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(r.openingNbv)}</span>
                              <span style={{ textAlign: 'right', fontFamily: 'monospace', color: REDWOOD.primary }}>{fmt(r.depreciation)}</span>
                              <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(r.closingNbv)}</span>
                              <span style={{ textAlign: 'center' }}>
                                {postResult?.status === 'POSTED'
                                  ? <Tag color="success" style={{ fontSize: 10 }}>Posted</Tag>
                                  : postResult?.status === 'ALREADY_EXISTS'
                                    ? <Tag color="warning" style={{ fontSize: 10 }}>Duplicate</Tag>
                                    : postResult?.status === 'ERROR'
                                      ? <Tag color="error" style={{ fontSize: 10 }}>Error</Tag>
                                      : posted
                                        ? <Tag color="green" style={{ fontSize: 10 }}>✓ Posted</Tag>
                                        : null
                                }
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      {/* Totals */}
                      <div style={{ display: 'grid', gridTemplateColumns: '36px 110px 1fr 1fr 1fr 90px', padding: '6px 12px', fontSize: 12, fontWeight: 700, background: '#fff3cd', borderTop: `2px solid ${REDWOOD.warning}` }}>
                        <span /><span>Total ({deprnRows.length} months)</span>
                        <span />
                        <span style={{ textAlign: 'right', fontFamily: 'monospace', color: REDWOOD.primary }}>{fmt(totalDeprn)}</span>
                        <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(finalNbv)}</span>
                        <span />
                      </div>
                    </div>
                    <Space>
                      <Tag color="orange">Total Depreciation: {fmt(totalDeprn)}</Tag>
                      <Tag color="blue">Final NBV: {fmt(finalNbv)}</Tag>
                      <Tag color="green">{deprnRows.length} months</Tag>
                      {postedPeriods.size > 0 && <Tag color="success">{deprnRows.filter(r => isPosted(r.period)).length} already posted</Tag>}
                    </Space>
                  </>
                );
              })()}
              {deprnRows.length === 0 && deprnFromDate && (
                <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '20px 0' }}>Click "Calculate" to generate the depreciation schedule.</Text>
              )}
            </Modal>
          </>
        ),
    },
    {
      key: 'distributions',
      label: <span><EnvironmentOutlined style={{ marginRight: 4 }} />Assignments</span>,
      children: loading
        ? <Spin style={{ display: 'block', margin: '40px auto' }} />
        : (
          <Table
            dataSource={distributions} columns={distColumns} rowKey="distributionId"
            size="small" pagination={false}
            locale={{ emptyText: 'No distribution records' }}
            style={{ marginTop: 4 }}
          />
        ),
    },
    {
      key: 'invoices',
      label: <span><FileTextOutlined style={{ marginRight: 4 }} />Source Lines</span>,
      children: loading
        ? <Spin style={{ display: 'block', margin: '40px auto' }} />
        : (
          <Table
            dataSource={invoices} columns={invoiceColumns} rowKey="assetInvoiceId"
            size="small" pagination={false}
            locale={{ emptyText: 'No invoice records' }}
            style={{ marginTop: 4 }}
          />
        ),
    },
    {
      key: 'transactions',
      label: <span><HistoryOutlined style={{ marginRight: 4 }} />Transactions</span>,
      children: loading
        ? <Spin style={{ display: 'block', margin: '40px auto' }} />
        : (
          <Table
            dataSource={transactions} columns={txnColumns} rowKey="transactionHeaderId"
            size="small" pagination={{ pageSize: 15, showSizeChanger: false }}
            locale={{ emptyText: 'No transaction records' }}
            style={{ marginTop: 4 }}
          />
        ),
    },
    {
      key: 'categoryAccounts',
      label: <span><BookOutlined style={{ marginRight: 4 }} />Category Accounts</span>,
      children: loading
        ? <Spin style={{ display: 'block', margin: '40px auto' }} />
        : (
          <>
            {/* API info strip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0 10px', flexWrap: 'wrap' }}>
              <Text type="secondary" style={{ fontSize: 11 }}>Category ID:</Text>
              {categoryId
                ? <Tag color="blue" style={{ fontFamily: 'monospace', fontSize: 11 }}>{categoryId}</Tag>
                : <Tag color="error" style={{ fontSize: 11 }}>Not resolved — re-run 09_rr_fa_pkg_body.sql in Oracle</Tag>
              }
              {books[0]?.companyCode && (
                <>
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>Company Code (from Book):</Text>
                  <Tag color="geekblue" style={{ fontFamily: 'monospace', fontSize: 11 }}>{books[0].companyCode}</Tag>
                  <Text type="secondary" style={{ fontSize: 11 }}>— defaulted as first segment in accounts below</Text>
                </>
              )}
              <div style={{ marginLeft: 'auto' }}>
                <Tooltip title={categoryApiUrl}>
                  <Button
                    size="small" icon={<ApiOutlined />}
                    style={{ color: FA_COLOR, borderColor: FA_COLOR, fontSize: 11 }}
                    onClick={() => Modal.info({
                      title: 'Category Accounts API',
                      width: 760,
                      content: (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 11, color: '#888', marginBottom: 4, fontWeight: 600 }}>ENDPOINT (GET)</div>
                          <Text copyable style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
                            {categoryApiUrl}
                          </Text>
                          {!categoryId && (
                            <div style={{ marginTop: 12, padding: '8px 12px', background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 6 }}>
                              <Text style={{ fontSize: 12, color: '#cf1322' }}>
                                <strong>Category ID is empty.</strong> The asset detail API ({APEX_DB_CONFIG.baseUrl}/fa/assets/{asset.assetId})
                                must return <code>assetCategoryId</code>. Please re-run <code>09_rr_fa_pkg_body.sql</code> in Oracle to deploy the updated package.
                              </Text>
                            </div>
                          )}
                        </div>
                      ),
                    })}
                  >
                    API
                  </Button>
                </Tooltip>
              </div>
            </div>

            {categoryBooks.length === 0
              ? <Empty description={categoryId ? 'No category account records found for this category' : 'Category ID not available — cannot load accounts'} style={{ marginTop: 24 }} />
              : (
            <div style={{ marginTop: 8 }}>
              {categoryBooks.map((cb, i) => {
                const accounts = [
                  { label: 'Asset Cost',                val: cb.assetCostAccount },
                  { label: 'Asset Clearing',            val: cb.assetClearingAccount },
                  { label: 'Depreciation Expense',      val: cb.deprnExpenseAccount },
                  { label: 'Depreciation Reserve',      val: cb.reserveAccount },
                  { label: 'Bonus Deprn Expense',       val: cb.bonusExpenseAccount },
                  { label: 'Bonus Deprn Reserve',       val: cb.bonusReserveAccount },
                  { label: 'CIP Cost',                  val: cb.cipCostAccount },
                  { label: 'CIP Clearing',              val: cb.cipClearingAccount },
                  { label: 'Unplanned Deprn Expense',   val: cb.unplannedDeprnExpAccount },
                  { label: 'Impairment Expense',        val: cb.impairmentExpenseAccount },
                  { label: 'Impairment Reserve',        val: cb.impairmentReserveAccount },
                  { label: 'Revaluation Reserve',       val: cb.revalReserveAccount },
                  { label: 'Reval Amortization',        val: cb.revalAmortAccount },
                  { label: 'Reval Loss Expense',        val: cb.revalLossExpAccount },
                ];
                return (
                  <Card key={i} size="small"
                    style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
                    title={
                      <Space>
                        <BookOutlined style={{ color: FA_COLOR }} />
                        <Text strong>{cb.bookTypeCode}</Text>
                        {cb.bookTypeName && <Text type="secondary" style={{ fontSize: 12 }}>— {cb.bookTypeName}</Text>}
                      </Space>
                    }
                  >
                    {/* Column header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '0 16px', padding: '4px 0 6px', borderBottom: `2px solid ${REDWOOD.neutral200}` }}>
                      <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>Account Type</Text>
                      <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>Account Combination</Text>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: '0 16px' }}>
                      {accounts.map(a => {
                        const companyCode = books[0]?.companyCode || '';
                        let displayVal = a.val || '';
                        if (a.val && companyCode) {
                          const segments = a.val.split('-');
                          segments[0] = companyCode;
                          displayVal = segments.join('-');
                        }
                        const rest = displayVal ? displayVal.split('-').slice(1).join('-') : '';
                        return (
                          <div key={a.label} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '7px 0', borderBottom: `1px solid ${REDWOOD.neutral200}`,
                            minHeight: 36,
                          }}>
                            <Text style={{ fontSize: 12, color: REDWOOD.neutral600, minWidth: 200 }}>{a.label}</Text>
                            {a.val ? (
                              <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>
                                <Tag color="geekblue" style={{ fontFamily: 'monospace', fontSize: 11, marginRight: 0 }}>
                                  {companyCode || displayVal.split('-')[0]}
                                </Tag>
                                <span style={{ color: REDWOOD.neutral900 }}>{rest ? `-${rest}` : ''}</span>
                              </span>
                            ) : (
                              <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>
              )
            }
          </>
        ),
    },
  ];

  return (
    <div style={{ padding: '16px 20px' }}>
      {/* Header summary strip */}
      <Card
        size="small"
        style={{
          borderRadius: 10, marginBottom: 16,
          border: `1px solid ${REDWOOD.neutral200}`,
          background: REDWOOD.surface,
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        }}
        styles={{ body: { padding: '14px 20px' } }}
      >
        {/* Top row: identity + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>Asset</Text>
            {' '}
            <Text strong style={{ fontSize: 15, color: FA_COLOR }}>{asset.asset_number || asset.assetNumber || asset.assetId}</Text>
          </div>
          <span style={{ color: REDWOOD.neutral300 }}>|</span>
          <Text style={{ fontSize: 13, color: REDWOOD.neutral900 }}>{asset.description}</Text>
          {categoryName && (
            <Tag style={{ borderRadius: 4, fontSize: 11, color: REDWOOD.neutral600, background: REDWOOD.neutral100, border: `1px solid ${REDWOOD.neutral200}` }}>
              {categoryName}
            </Tag>
          )}
          <div style={{ marginLeft: 'auto' }}>{statusTag(asset.retiredFlag)}</div>
        </div>
        {/* Bottom row: key metrics */}
        <Row gutter={[12, 0]} align="middle">
          <Col xs={12} sm={8} md={4}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Book</Text>
            <Text strong style={{ fontSize: 12 }}>{asset.bookTypeCode || '—'}</Text>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Date in Service</Text>
            <Text strong style={{ fontSize: 12 }}>{fmtDate(asset.datePlacedInService)}</Text>
          </Col>
          {books[0]?.companyCode && (
            <Col xs={12} sm={8} md={3}>
              <div style={{
                padding: '6px 12px', borderRadius: 6,
                background: '#f0f7ff', border: '1px solid #bdd7f5',
              }}>
                <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>Company</Text>
                <Text strong style={{ fontSize: 13, color: REDWOOD.info }}>{books[0].companyCode}</Text>
              </div>
            </Col>
          )}
          <Col xs={8} sm={8} md={5}>
            <div style={{
              padding: '6px 12px', borderRadius: 6,
              background: `${FA_COLOR}10`, border: `1px solid ${FA_COLOR}25`,
            }}>
              <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>Cost</Text>
              <Text strong style={{ color: FA_COLOR, fontSize: 13 }}>{formatCurrency(asset.cost)}</Text>
            </div>
          </Col>
          <Col xs={8} sm={8} md={5}>
            <div style={{
              padding: '6px 12px', borderRadius: 6,
              background: `${REDWOOD.info}10`, border: `1px solid ${REDWOOD.info}25`,
            }}>
              <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>NBV</Text>
              <Text strong style={{ color: REDWOOD.info, fontSize: 13 }}>{formatCurrency(asset.nbv)}</Text>
            </div>
          </Col>
          <Col xs={8} sm={8} md={5}>
            <div style={{
              padding: '6px 12px', borderRadius: 6,
              background: `${REDWOOD.warning}10`, border: `1px solid ${REDWOOD.warning}25`,
            }}>
              <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>Deprn Reserve</Text>
              <Text strong style={{ color: REDWOOD.warning, fontSize: 13 }}>{formatCurrency(asset.deprnReserve)}</Text>
            </div>
          </Col>
        </Row>
      </Card>

      {/* Sub-tabs */}
      <Tabs
        activeKey={activeSubTab}
        onChange={(k) => onSubTabChange(tab.key, k)}
        size="small"
        tabBarStyle={{
          borderBottom: `2px solid ${FA_COLOR}40`,
          marginBottom: 0,
        }}
        items={subTabs}
      />
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
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
  const [bookList,   setBookList]   = useState<BookControlRecord[]>([]);

  useEffect(() => {
    getBookControls().then(setBookList);
  }, []);

  // API modal
  const [lastApiUrl,      setLastApiUrl]      = useState<string | null>(null);
  const [apiResponse,     setApiResponse]     = useState<string>('');
  const [apiModalVisible, setApiModalVisible] = useState(false);
  const [apiUrlCopied,    setApiUrlCopied]    = useState(false);

  // Tab management
  const [activeTabKey,  setActiveTabKey]  = useState('search');
  const [openAssetTabs, setOpenAssetTabs] = useState<OpenAssetTab[]>([]);

  // Run search
  const runSearch = useCallback(async (pg = 1, ps = pageSize) => {
    const vals = form.getFieldsValue();
    setLoading(true);

    const q = new URLSearchParams();
    if (vals.assetNumber)  q.append('assetNumber',  vals.assetNumber);
    if (vals.description)  q.append('description',  vals.description);
    if (vals.category)     q.append('category',     vals.category);
    if (vals.bookTypeCode) q.append('bookTypeCode', vals.bookTypeCode);
    if (vals.assetType)    q.append('assetType',    vals.assetType);
    if (vals.status)       q.append('assetStatus',  vals.status);
    q.append('offset', String((pg - 1) * ps));
    q.append('limit',  String(ps));
    setLastApiUrl(`${APEX_DB_CONFIG.baseUrl}/fa/assets?${q.toString()}`);

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
      setApiResponse(JSON.stringify(res, null, 2));
      if (res.error) {
        message.error(res.error);
      } else {
        setRows(res.items || []);
        setTotalCount(res.totalCount || 0);
        setPage(pg);
      }
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, [form, pageSize]);

  useEffect(() => { runSearch(1, pageSize); }, []);

  // Open asset in new tab
  const openAssetTab = async (asset: AssetRecord) => {
    const tabKey = `asset-${asset.assetId}`;

    // Already open — just switch
    if (openAssetTabs.find(t => t.key === tabKey)) {
      setActiveTabKey(tabKey);
      return;
    }

    // Add a loading placeholder tab immediately
    setOpenAssetTabs(prev => [...prev, {
      key: tabKey, asset, loading: true,
      detail: null, books: [], deprn: [], distributions: [], invoices: [], transactions: [],
      categoryBooks: [], categoryName: '', categoryId: '', categoryApiUrl: '',
      activeSubTab: 'general',
    }]);
    setActiveTabKey(tabKey);

    try {
      const [det, bks, dep, dist, inv, txn] = await Promise.all([
        getAssetDetail(asset.assetId),
        getAssetBooks(asset.assetId),
        getAssetDeprn(asset.assetId),
        getAssetDistributions(asset.assetId),
        getAssetInvoices(asset.assetId),
        getAssetTransactions(asset.assetId),
      ]);

      // Load category info using the assetCategoryId from the detail response
      const catId = (det as any).assetCategoryId || (asset as any).assetCategoryId || '';
      const catApiUrl = catId
        ? `${APEX_DB_CONFIG.baseUrl}/fa/categories/${catId}/books`
        : `${APEX_DB_CONFIG.baseUrl}/fa/categories/(no-category-id)/books`;
      let catName = '';
      let catBooks: CategoryBookRecord[] = [];
      if (catId) {
        const [catDet, catBks] = await Promise.all([
          getCategoryDetail(catId),
          getCategoryBooks(catId),
        ]);
        catName  = catDet.description || '';
        catBooks = catBks.items || [];
      }

      setOpenAssetTabs(prev => prev.map(t => t.key === tabKey ? {
        ...t, loading: false,
        detail:        det.success !== false ? det : null,
        books:         bks.items || [],
        deprn:         dep.items || [],
        distributions: dist.items || [],
        invoices:      inv.items || [],
        transactions:  txn.items || [],
        categoryBooks: catBooks,
        categoryName:  catName,
        categoryId:    catId,
        categoryApiUrl: catApiUrl,
      } : t));
    } catch {
      message.error('Failed to load asset details');
      setOpenAssetTabs(prev => prev.map(t => t.key === tabKey ? { ...t, loading: false } : t));
    }
  };

  const closeAssetTab = (tabKey: string) => {
    setOpenAssetTabs(prev => prev.filter(t => t.key !== tabKey));
    if (activeTabKey === tabKey) setActiveTabKey('search');
  };

  const onTabEdit = (targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => {
    if (action === 'remove' && typeof targetKey === 'string') closeAssetTab(targetKey);
  };

  const onSubTabChange = (tabKey: string, subTab: string) => {
    setOpenAssetTabs(prev => prev.map(t => t.key === tabKey ? { ...t, activeSubTab: subTab } : t));
  };

  const handleReset = () => {
    form.resetFields();
    setRows([]);
    setTotalCount(0);
    setSearched(false);
    setGridSearch('');
  };

  // Grid quick-search + cost filter (client-side)
  const [gridSearch,  setGridSearch]  = useState('');
  const [costFilter,  setCostFilter]  = useState(true);

  const displayedRows = rows.filter(r => {
    if (costFilter && (parseFloat(r.cost) || 0) <= 0) return false;
    if (gridSearch) {
      const q = gridSearch.toLowerCase();
      return (
        (r.description  || '').toLowerCase().includes(q) ||
        (r.asset_number || r.assetNumber || '').toLowerCase().includes(q) ||
        (r.assetId      || '').toLowerCase().includes(q) ||
        (r.bookTypeCode || '').toLowerCase().includes(q) ||
        (r.assetType    || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalCost = displayedRows.reduce((s, r) => s + (parseFloat(r.cost) || 0), 0);
  const totalNbv  = displayedRows.reduce((s, r) => s + (parseFloat(r.nbv)  || 0), 0);

  // Export assets grid to Excel
  const exportAssetsToExcel = () => {
    const data = displayedRows.map(r => ({
      'Asset Number':      r.asset_number || r.assetNumber || r.assetId,
      'Description':       r.description,
      'Asset Type':        assetTypeLabel(r.assetType || ''),
      'Book':              r.bookTypeCode,
      'Date in Service':   fmtDate(r.datePlacedInService),
      'Cost':              parseFloat(r.cost) || 0,
      'Original Cost':     parseFloat(r.originalCost) || 0,
      'Adjusted Cost':     parseFloat(r.adjustedCost) || 0,
      'Salvage Value':     parseFloat(r.salvageValue) || 0,
      'Deprn Reserve':     parseFloat(r.deprnReserve) || 0,
      'NBV':               parseFloat(r.nbv) || 0,
      'Depreciate':        r.depreciateFlag,
      'Capitalize':        r.capitalizeFlag,
      'Status':            assetStatusLabel(r.retiredFlag),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Assets');
    XLSX.writeFile(wb, `assets_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // ── Table columns ─────────────────────────────────────────────────────────────
  const columns: ColumnsType<AssetRecord> = [
    {
      title: 'Asset Number', key: 'assetNumber', width: 130,
      sorter: (a, b) => (a.asset_number || a.assetNumber || a.assetId).localeCompare(b.asset_number || b.assetNumber || b.assetId),
      render: (_v, record) => (
        <Button type="link" style={{ padding: 0, fontWeight: 600 }} onClick={(e) => { e.stopPropagation(); openAssetTab(record); }}>
          {record.asset_number || record.assetNumber || record.assetId}
        </Button>
      ),
    },
    {
      title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true,
      sorter: (a, b) => (a.description || '').localeCompare(b.description || ''),
    },
    {
      title: 'Type', dataIndex: 'assetType', key: 'assetType', width: 110,
      sorter: (a, b) => (a.assetType || '').localeCompare(b.assetType || ''),
      render: (v) => <Tag style={{ borderRadius: 4, fontSize: 11 }}>{assetTypeLabel(v)}</Tag>,
    },
    {
      title: 'Book', dataIndex: 'bookTypeCode', key: 'bookTypeCode', width: 150, ellipsis: true,
      sorter: (a, b) => (a.bookTypeCode || '').localeCompare(b.bookTypeCode || ''),
    },
    {
      title: 'Date in Service', dataIndex: 'datePlacedInService', key: 'datePlacedInService', width: 130,
      sorter: (a, b) => (a.datePlacedInService || '').localeCompare(b.datePlacedInService || ''),
      render: (v: string) => fmtDate(v),
    },
    {
      title: 'Cost', dataIndex: 'cost', key: 'cost', width: 130, align: 'right' as const,
      sorter: (a, b) => (parseFloat(a.cost) || 0) - (parseFloat(b.cost) || 0),
      render: (v) => formatCurrency(v),
    },
    {
      title: 'NBV', dataIndex: 'nbv', key: 'nbv', width: 130, align: 'right' as const,
      sorter: (a, b) => (parseFloat(a.nbv) || 0) - (parseFloat(b.nbv) || 0),
      render: (v) => formatCurrency(v),
    },
    {
      title: 'Status', dataIndex: 'retiredFlag', key: 'status', width: 90,
      sorter: (a, b) => (a.retiredFlag || '').localeCompare(b.retiredFlag || ''),
      render: (v) => statusTag(v),
    },
    {
      title: '', key: 'actions', width: 60, align: 'center' as const,
      render: (_: any, record: AssetRecord) => (
        <Tooltip title="Open asset">
          <Button size="small" type="text" icon={<InfoCircleOutlined />} onClick={(e) => { e.stopPropagation(); openAssetTab(record); }} />
        </Tooltip>
      ),
    },
  ];

  // ── Search tab content ────────────────────────────────────────────────────────
  const searchTabContent = (
    <div style={{ padding: 16 }}>
      {/* Search card */}
      <Card
        style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}
        styles={{ body: { padding: '16px 20px' } }}
        title={<Space><FilterOutlined style={{ color: FA_COLOR }} /><Text strong style={{ fontSize: 13 }}>Search Parameters</Text></Space>}
      >
        <Form form={form} layout="vertical" onFinish={() => runSearch(1, pageSize)}>
          <Row gutter={[16, 0]}>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="bookTypeCode" label="Book" style={{ marginBottom: 8 }}>
                <Select allowClear placeholder="All books" showSearch optionFilterProp="children">
                  {bookList.map(b => (
                    <Option key={b.bookTypeCode} value={b.bookTypeCode}>
                      {b.bookTypeCode}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
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
            <Col xs={24} sm={12} md={6}>
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
                  {lastApiUrl && (
                    <Tooltip title="Show API URL">
                      <Button
                        size="small" icon={<ApiOutlined />}
                        style={{ color: FA_COLOR, borderColor: FA_COLOR }}
                        onClick={() => Modal.info({
                          title: 'API Request — fa/assets',
                          width: 860,
                          content: (
                            <div style={{ marginTop: 8 }}>
                              <Text copyable style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
                                {lastApiUrl}
                              </Text>
                            </div>
                          ),
                        })}
                      />
                    </Tooltip>
                  )}
                </Space>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      {/* Results table */}
      <Card
        style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        styles={{ body: { padding: 0 } }}
        title={
          searched
            ? <Text strong>Results <Badge count={totalCount} style={{ backgroundColor: FA_COLOR }} /></Text>
            : <Text strong>Assets</Text>
        }
        extra={
          <Space size="small">
            <Space size={4}>
              <Switch
                size="small"
                checked={costFilter}
                onChange={setCostFilter}
                style={costFilter ? { backgroundColor: FA_COLOR } : {}}
              />
              <Typography.Text style={{ fontSize: 12 }}>Cost &gt; 0</Typography.Text>
            </Space>
            <Input
              size="small" allowClear placeholder="Search in grid…"
              prefix={<SearchOutlined style={{ color: REDWOOD.neutral300 }} />}
              style={{ width: 180 }}
              value={gridSearch}
              onChange={(e) => setGridSearch(e.target.value)}
            />
            {rows.length > 0 && (
              <Tooltip title="Export to Excel">
                <Button size="small" icon={<DownloadOutlined />} onClick={exportAssetsToExcel}>
                  Excel
                </Button>
              </Tooltip>
            )}
            {lastApiUrl && (
              <Button
                size="small" icon={<ApiOutlined />}
                style={{ color: FA_COLOR, borderColor: FA_COLOR, fontSize: 11 }}
                onClick={() => setApiModalVisible(true)}
              >
                API
              </Button>
            )}
          </Space>
        }
      >
        <Table<AssetRecord>
          dataSource={displayedRows}
          columns={columns}
          rowKey="assetId"
          loading={loading}
          size="small"
          scroll={{ x: 1100 }}
          locale={{ emptyText: searched ? 'No assets found' : 'Enter search criteria above' }}
          onRow={(record) => ({ onClick: () => openAssetTab(record), style: { cursor: 'pointer' } })}
          pagination={{
            current: page, pageSize, total: totalCount,
            showSizeChanger: true,
            showTotal: (t) => `${t} total${gridSearch ? ` (${displayedRows.length} shown)` : ''}`,
            pageSizeOptions: ['25', '50', '100'],
            onChange: (p, ps) => { setPageSize(ps); runSearch(p, ps); },
          }}
        />
        {displayedRows.length > 0 && (
          <div style={{
            display: 'flex', gap: 32, padding: '12px 20px',
            borderTop: `1px solid ${REDWOOD.neutral200}`,
            background: REDWOOD.neutral100,
            borderRadius: '0 0 12px 12px',
          }}>
            <Statistic
              title={<span style={{ fontSize: 12, color: REDWOOD.neutral500 }}>Total Cost ({displayedRows.length} assets)</span>}
              value={totalCost}
              precision={2}
              valueStyle={{ fontSize: 15, fontWeight: 600, color: FA_COLOR }}
              prefix={<span style={{ fontSize: 13 }}></span>}
            />
            <Statistic
              title={<span style={{ fontSize: 12, color: REDWOOD.neutral500 }}>Total NBV</span>}
              value={totalNbv}
              precision={2}
              valueStyle={{ fontSize: 15, fontWeight: 600, color: '#1677ff' }}
            />
          </div>
        )}
      </Card>
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb + header */}
        <div style={{
          padding: '12px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
        }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/fa">Fixed Assets</Link> },
            { title: 'Manage Assets' },
          ]} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <Space align="center">
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: `linear-gradient(135deg, ${FA_COLOR} 0%, #9E5C00 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <DatabaseOutlined style={{ fontSize: 18, color: '#fff' }} />
              </div>
              <div>
                <Title level={5} style={{ margin: 0, lineHeight: 1.2 }}>Asset Workbench</Title>
                <Text type="secondary" style={{ fontSize: 11 }}>Search and manage fixed asset records</Text>
              </div>
            </Space>
            <Button
              type="primary" icon={<PlusOutlined />}
              style={{ background: FA_COLOR, borderColor: FA_COLOR }}
              onClick={() => navigate('/fa/create-asset')}
            >
              New Asset
            </Button>
          </div>
        </div>

        {/* Editable-card tabs */}
        <Tabs
          type="editable-card"
          activeKey={activeTabKey}
          onChange={setActiveTabKey}
          onEdit={onTabEdit}
          hideAdd
          destroyOnHidden
          style={{ background: REDWOOD.surface }}
          tabBarStyle={{
            margin: 0,
            padding: '4px 16px 0',
            background: REDWOOD.neutral200,
            borderBottom: `2px solid ${FA_COLOR}`,
          }}
          items={[
            {
              key: 'search',
              closable: false,
              label: (
                <span style={{
                  fontSize: 12,
                  fontWeight: activeTabKey === 'search' ? 600 : 400,
                  color: activeTabKey === 'search' ? FA_COLOR : REDWOOD.neutral600,
                  padding: '4px 4px',
                }}>
                  <SearchOutlined style={{ marginRight: 6 }} />
                  Search
                  {totalCount > 0 && (
                    <Tag color={FA_COLOR} style={{ fontSize: 10, marginLeft: 8 }}>{totalCount}</Tag>
                  )}
                </span>
              ),
              children: searchTabContent,
            },
            ...openAssetTabs.map(tab => ({
              key: tab.key,
              label: (
                <span style={{
                  fontSize: 12,
                  fontWeight: activeTabKey === tab.key ? 600 : 400,
                  color: activeTabKey === tab.key ? FA_COLOR : REDWOOD.neutral600,
                  maxWidth: 180,
                  display: 'inline-block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  verticalAlign: 'middle',
                }}>
                  {tab.loading && <Spin size="small" style={{ marginRight: 6 }} />}
                  {tab.asset.description.length > 22
                    ? tab.asset.description.substring(0, 22) + '…'
                    : tab.asset.description}
                </span>
              ),
              children: (
                <AssetTabContent
                  key={tab.key}
                  tab={tab}
                  onSubTabChange={onSubTabChange}
                />
              ),
            })),
          ]}
        />

        {/* API Response Modal */}
        <Modal
          open={apiModalVisible}
          onCancel={() => setApiModalVisible(false)}
          footer={[
            <Button
              key="copy" size="small"
              icon={apiUrlCopied ? <CheckOutlined /> : <ApiOutlined />}
              onClick={() => {
                navigator.clipboard.writeText(lastApiUrl || '');
                setApiUrlCopied(true);
                setTimeout(() => setApiUrlCopied(false), 2000);
              }}
            >
              {apiUrlCopied ? 'Copied' : 'Copy URL'}
            </Button>,
            <Button key="close" size="small" type="primary" onClick={() => setApiModalVisible(false)}>
              Close
            </Button>,
          ]}
          width={720}
          title={<Space><ApiOutlined style={{ color: FA_COLOR }} /><span>Last API Call — fa/assets</span></Space>}
          styles={{ body: { padding: '12px 16px' } }}
        >
          <div style={{ marginBottom: 10 }}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Endpoint (GET)</Text>
            <div style={{
              fontFamily: 'monospace', fontSize: 11,
              background: '#f5f5f5', border: '1px solid #e0e0e0',
              borderRadius: 4, padding: '6px 10px', wordBreak: 'break-all',
            }}>
              {lastApiUrl}
            </div>
          </div>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Response</Text>
          <pre style={{
            background: '#1a1a1a', color: '#e8e8e8',
            padding: '10px 14px', borderRadius: 6,
            fontSize: 11, fontFamily: 'monospace',
            maxHeight: 460, overflow: 'auto',
            margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {apiResponse}
          </pre>
        </Modal>
      </Content>

      
    </Layout>
  );
};

export default ManageAssets;
