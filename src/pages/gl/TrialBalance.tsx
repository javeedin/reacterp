import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Layout,
  Card,
  Table,
  Button,
  Space,
  Typography,
  Breadcrumb,
  Tag,
  Row,
  Col,
  Spin,
  Alert,
  Tabs,
  Select,
  Tooltip,
  Statistic,
  Empty,
} from 'antd';
import {
  HomeOutlined,
  TableOutlined,
  ReloadOutlined,
  PlusOutlined,
  CloseOutlined,
  FilterOutlined,
  FileTextOutlined,
  DollarOutlined,
  BankOutlined,
  CalendarOutlined,
  DragOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { APEX_DB_CONFIG } from '../../config/api.config';
import { Divider } from 'antd';

const { Content } = Layout;
const { Title, Text } = Typography;

// Oracle Redwood Color Palette
const REDWOOD = {
  primary: '#C74634',
  primaryDark: '#A33B2C',
  success: '#1D7B4D',
  warning: '#D4A800',
  error: '#C74634',
  info: '#0572CE',
  neutral: '#383838',
  surface: '#FFFFFF',
  surfaceSecondary: '#F7F7F7',
  border: '#E5E5E5',
  textPrimary: '#1A1A1A',
  textSecondary: '#6B6B6B',
};

// Types
interface GLBalanceRecord {
  period_type: string | null;
  period_name: string;
  actual_flag: string;
  period_year: string;
  period_num: string;
  ledger_id: string;
  company: string;
  lob: string;
  department: string;
  account: string;
  account_desc: string;
  sub_account: string;
  analysis: string;
  intercompany: string;
  future1: string | null;
  future2: string | null;
  account_type: string;
  currency: string;
  opening_balance: number;
  period_activity: number | null;
  closing_balance: number;
  debit: number;
  credit: number;
  currency_code: string | null;
}

interface PeriodInfo {
  period_name_id: string;
  ledger_name: string;
  app: string;
  application_name: string;
  status: string;
  start_date: string;
  end_date: string;
  period_year: number;
  period_number: number;
  adj_flag: string;
}

interface SegmentConfig {
  key: string;
  label: string;
}

// Available segments for pivot
const AVAILABLE_SEGMENTS: SegmentConfig[] = [
  { key: 'company', label: 'Company' },
  { key: 'lob', label: 'LOB' },
  { key: 'department', label: 'Department' },
  { key: 'sub_account', label: 'Sub Account' },
  { key: 'analysis', label: 'Analysis' },
  { key: 'intercompany', label: 'Intercompany' },
];

interface TabData {
  key: string;
  periodName: string;
  data: GLBalanceRecord[];
  loading: boolean;
  error: string | null;
  companies: string[];
  currencies: string[];
  selectedCompany: string | null;
  selectedCurrency: string | null;
  segmentsBefore: string[];
  segmentsAfter: string[];
}

interface PivotRow {
  key: string;
  account: string;
  account_desc: string;
  opening_balance: number;
  debit: number;
  credit: number;
  closing_balance: number;
  [key: string]: string | number;
}

const TrialBalance: React.FC = () => {
  // Periods list state
  const [periods, setPeriods] = useState<PeriodInfo[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [periodsError, setPeriodsError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  // Tabs state
  const [activeTab, setActiveTab] = useState('periods');
  const [tabs, setTabs] = useState<TabData[]>([]);

  // Get unique years from periods
  const availableYears = useMemo(() => {
    const years = [...new Set(periods.map(p => p.period_year))].sort((a, b) => b - a);
    return years;
  }, [periods]);

  // Filter periods by year
  const filteredPeriods = useMemo(() => {
    if (!selectedYear) return periods;
    return periods.filter(p => p.period_year === selectedYear);
  }, [periods, selectedYear]);

  // Fetch periods list from APEX periods status endpoint
  const fetchPeriods = useCallback(async () => {
    setLoadingPeriods(true);
    setPeriodsError(null);

    try {
      const params = new URLSearchParams({
        'P_APPLICATION_NAME': 'General Ledger',
        'P_LEDGER_NAME': 'BUIMERC LEDGER',
      });
      const url = `${APEX_DB_CONFIG.baseUrl}/${APEX_DB_CONFIG.endpoints.periodsStatus}?${params}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const items: PeriodInfo[] = data.items || [];

      // Sort by year desc, then by period_number desc
      const sortedPeriods = items.sort((a, b) => {
        if (a.period_year !== b.period_year) {
          return b.period_year - a.period_year;
        }
        return b.period_number - a.period_number;
      });

      setPeriods(sortedPeriods);

      // Auto-select most recent year
      if (sortedPeriods.length > 0 && !selectedYear) {
        setSelectedYear(sortedPeriods[0].period_year);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to fetch periods';
      setPeriodsError(errorMsg);
    } finally {
      setLoadingPeriods(false);
    }
  }, [selectedYear]);

  // Fetch trial balance data for a specific period
  const fetchTrialBalance = useCallback(async (periodName: string) => {
    const tabKey = `tb-${periodName}`;

    // Check if tab already exists
    const existingTab = tabs.find(t => t.key === tabKey);
    if (existingTab) {
      setActiveTab(tabKey);
      return;
    }

    // Create new tab in loading state
    const newTab: TabData = {
      key: tabKey,
      periodName,
      data: [],
      loading: true,
      error: null,
      companies: [],
      currencies: [],
      selectedCompany: null,
      selectedCurrency: null,
      segmentsBefore: [],
      segmentsAfter: [],
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTab(tabKey);

    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/${APEX_DB_CONFIG.endpoints.glBalances}?p_period_name=${encodeURIComponent(periodName)}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const items: GLBalanceRecord[] = data.items || [];

      // Extract unique companies and currencies
      const companies = [...new Set(items.map(i => i.company))].sort();
      const currencies = [...new Set(items.map(i => i.currency))].sort();

      setTabs(prev => prev.map(t =>
        t.key === tabKey
          ? { ...t, data: items, loading: false, companies, currencies }
          : t
      ));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to fetch trial balance';
      setTabs(prev => prev.map(t =>
        t.key === tabKey
          ? { ...t, loading: false, error: errorMsg }
          : t
      ));
    }
  }, [tabs]);

  // Close a tab
  const closeTab = useCallback((tabKey: string) => {
    setTabs(prev => prev.filter(t => t.key !== tabKey));
    if (activeTab === tabKey) {
      setActiveTab('periods');
    }
  }, [activeTab]);

  // Update tab filter
  const updateTabFilter = useCallback((tabKey: string, field: 'selectedCompany' | 'selectedCurrency', value: string | null) => {
    setTabs(prev => prev.map(t =>
      t.key === tabKey
        ? { ...t, [field]: value }
        : t
    ));
  }, []);

  // Handle segment drop
  const handleSegmentDrop = useCallback((tabKey: string, segment: string, position: 'before' | 'after') => {
    setTabs(prev => prev.map(t => {
      if (t.key !== tabKey) return t;

      // Remove from both arrays first
      const newBefore = t.segmentsBefore.filter(s => s !== segment);
      const newAfter = t.segmentsAfter.filter(s => s !== segment);

      if (position === 'before') {
        return { ...t, segmentsBefore: [...newBefore, segment], segmentsAfter: newAfter };
      } else {
        return { ...t, segmentsBefore: newBefore, segmentsAfter: [...newAfter, segment] };
      }
    }));
  }, []);

  // Remove dropped segment
  const removeDroppedSegment = useCallback((tabKey: string, segment: string) => {
    setTabs(prev => prev.map(t => {
      if (t.key !== tabKey) return t;
      return {
        ...t,
        segmentsBefore: t.segmentsBefore.filter(s => s !== segment),
        segmentsAfter: t.segmentsAfter.filter(s => s !== segment),
      };
    }));
  }, []);

  // Get segment label
  const getSegmentLabel = (segmentKey: string): string => {
    const segment = AVAILABLE_SEGMENTS.find(s => s.key === segmentKey);
    return segment?.label || segmentKey;
  };

  // Generate pivot data - group by segments + account
  const generatePivotData = (data: GLBalanceRecord[], segmentsBefore: string[], segmentsAfter: string[]): PivotRow[] => {
    const pivotMap = new Map<string, PivotRow>();
    const groupByKeys = [...segmentsBefore, 'account', ...segmentsAfter];

    data.forEach(row => {
      // Build key from selected segments
      const keyParts = groupByKeys.map(key => (row as any)[key] || '');
      const pivotKey = keyParts.join('|');

      if (!pivotMap.has(pivotKey)) {
        const pivotRow: PivotRow = {
          key: pivotKey,
          account: row.account,
          account_desc: row.account_desc,
          opening_balance: 0,
          debit: 0,
          credit: 0,
          closing_balance: 0,
        };

        // Add segment values
        segmentsBefore.forEach(seg => {
          pivotRow[seg] = (row as any)[seg] || '';
        });
        segmentsAfter.forEach(seg => {
          pivotRow[seg] = (row as any)[seg] || '';
        });

        pivotMap.set(pivotKey, pivotRow);
      }

      const pivotRow = pivotMap.get(pivotKey)!;
      pivotRow.opening_balance += row.opening_balance || 0;
      pivotRow.debit += row.debit || 0;
      pivotRow.credit += row.credit || 0;
      pivotRow.closing_balance += row.closing_balance || 0;
    });

    return Array.from(pivotMap.values());
  };

  // Initial load
  useEffect(() => {
    fetchPeriods();
  }, []);

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Get status tag color
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'open': return 'green';
      case 'closed': return 'red';
      case 'future': return 'blue';
      case 'never opened': return 'default';
      default: return 'default';
    }
  };

  // Periods table columns
  const periodColumns = [
    {
      title: '#',
      dataIndex: 'period_number',
      key: 'period_number',
      width: 60,
      align: 'center' as const,
      render: (num: number) => (
        <Text style={{ fontFamily: 'monospace' }}>{num}</Text>
      ),
    },
    {
      title: 'Period',
      dataIndex: 'period_name_id',
      key: 'period_name_id',
      width: 120,
      render: (text: string) => (
        <Text strong style={{ color: REDWOOD.primary }}>{text}</Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>{status}</Tag>
      ),
    },
    {
      title: 'Year',
      dataIndex: 'period_year',
      key: 'period_year',
      width: 80,
      render: (year: number) => <Tag color="blue">{year}</Tag>,
    },
    {
      title: 'Start Date',
      dataIndex: 'start_date',
      key: 'start_date',
      width: 120,
      render: (date: string) => (
        <Text type="secondary">{date ? new Date(date).toLocaleDateString() : '-'}</Text>
      ),
    },
    {
      title: 'End Date',
      dataIndex: 'end_date',
      key: 'end_date',
      width: 120,
      render: (date: string) => (
        <Text type="secondary">{date ? new Date(date).toLocaleDateString() : '-'}</Text>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      width: 100,
      render: (_: unknown, record: PeriodInfo) => (
        <Button
          type="primary"
          icon={<TableOutlined />}
          size="small"
          onClick={() => fetchTrialBalance(record.period_name_id)}
          style={{
            background: REDWOOD.primary,
            borderColor: REDWOOD.primary,
            borderRadius: 6,
          }}
        >
          TB
        </Button>
      ),
    },
  ];

  // Render periods tab content
  const renderPeriodsTab = () => (
    <Card
      style={{
        borderRadius: 12,
        border: `1px solid ${REDWOOD.border}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Select
            placeholder="Filter by Year"
            value={selectedYear}
            onChange={setSelectedYear}
            allowClear
            style={{ width: '100%' }}
            size="large"
          >
            {availableYears.map(year => (
              <Select.Option key={year} value={year}>
                <CalendarOutlined style={{ marginRight: 8 }} />
                {year}
              </Select.Option>
            ))}
          </Select>
        </Col>
        <Col span={16} style={{ textAlign: 'right' }}>
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchPeriods}
            loading={loadingPeriods}
            style={{ borderRadius: 6 }}
          >
            Refresh
          </Button>
        </Col>
      </Row>

      {periodsError && (
        <Alert
          message="Error loading periods"
          description={periodsError}
          type="error"
          showIcon
          style={{ marginBottom: 16, borderRadius: 8 }}
        />
      )}

      <Table
        columns={periodColumns}
        dataSource={filteredPeriods}
        rowKey="period_name_id"
        loading={loadingPeriods}
        pagination={{
          pageSize: 12,
          showSizeChanger: true,
          pageSizeOptions: ['12', '24', '48'],
          showTotal: (total) => `${total} periods`,
        }}
        size="middle"
        style={{ borderRadius: 8 }}
      />
    </Card>
  );

  // Render trial balance tab content
  const renderTBTab = (tab: TabData) => {
    // Filter data based on selected filters
    const filteredData = tab.data.filter(item => {
      if (tab.selectedCompany && item.company !== tab.selectedCompany) return false;
      if (tab.selectedCurrency && item.currency !== tab.selectedCurrency) return false;
      return true;
    });

    // Generate pivot data
    const pivotData = generatePivotData(filteredData, tab.segmentsBefore, tab.segmentsAfter);

    // Calculate totals from pivot data
    const totals = pivotData.reduce(
      (acc, item) => ({
        opening: acc.opening + item.opening_balance,
        debit: acc.debit + item.debit,
        credit: acc.credit + item.credit,
        closing: acc.closing + item.closing_balance,
      }),
      { opening: 0, debit: 0, credit: 0, closing: 0 }
    );

    // Build dynamic columns based on dropped segments
    const dynamicColumns = [
      // Segments before Account
      ...tab.segmentsBefore.map(seg => ({
        title: getSegmentLabel(seg),
        dataIndex: seg,
        key: seg,
        width: 100,
        render: (text: string) => <Text style={{ fontFamily: 'monospace' }}>{text}</Text>,
      })),
      // Account column (fixed)
      {
        title: 'Account',
        dataIndex: 'account',
        key: 'account',
        width: 120,
        render: (text: string) => <Text strong style={{ fontFamily: 'monospace' }}>{text}</Text>,
      },
      // Account Description
      {
        title: 'Description',
        dataIndex: 'account_desc',
        key: 'account_desc',
        width: 250,
        ellipsis: true,
        render: (text: string) => <Tooltip title={text}><Text>{text}</Text></Tooltip>,
      },
      // Segments after Account
      ...tab.segmentsAfter.map(seg => ({
        title: getSegmentLabel(seg),
        dataIndex: seg,
        key: seg,
        width: 100,
        render: (text: string) => <Text style={{ fontFamily: 'monospace' }}>{text}</Text>,
      })),
      // Amount columns
      {
        title: 'Opening',
        dataIndex: 'opening_balance',
        key: 'opening_balance',
        width: 130,
        align: 'right' as const,
        render: (value: number) => (
          <Text style={{ fontFamily: 'monospace', color: value < 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
            {formatCurrency(value)}
          </Text>
        ),
      },
      {
        title: 'Debit',
        dataIndex: 'debit',
        key: 'debit',
        width: 130,
        align: 'right' as const,
        render: (value: number) => (
          <Text style={{ fontFamily: 'monospace', color: value > 0 ? REDWOOD.info : REDWOOD.textSecondary }}>
            {formatCurrency(value)}
          </Text>
        ),
      },
      {
        title: 'Credit',
        dataIndex: 'credit',
        key: 'credit',
        width: 130,
        align: 'right' as const,
        render: (value: number) => (
          <Text style={{ fontFamily: 'monospace', color: value > 0 ? REDWOOD.success : REDWOOD.textSecondary }}>
            {formatCurrency(value)}
          </Text>
        ),
      },
      {
        title: 'Closing',
        dataIndex: 'closing_balance',
        key: 'closing_balance',
        width: 130,
        align: 'right' as const,
        render: (value: number) => (
          <Text strong style={{ fontFamily: 'monospace', color: value < 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
            {formatCurrency(value)}
          </Text>
        ),
      },
    ];

    // Calculate segment column count for summary row
    const segmentColCount = tab.segmentsBefore.length + 2 + tab.segmentsAfter.length; // +2 for Account + Description

    if (tab.loading) {
      return (
        <Card style={{ borderRadius: 12, textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">Loading Trial Balance for {tab.periodName}...</Text>
          </div>
        </Card>
      );
    }

    if (tab.error) {
      return (
        <Alert
          message="Error loading Trial Balance"
          description={tab.error}
          type="error"
          showIcon
          style={{ borderRadius: 8 }}
        />
      );
    }

    return (
      <Card
        style={{
          borderRadius: 12,
          border: `1px solid ${REDWOOD.border}`,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        {/* Filters */}
        <Row gutter={16} style={{ marginBottom: 12 }}>
          <Col span={6}>
            <Select
              placeholder="Filter by Company"
              value={tab.selectedCompany}
              onChange={(value) => updateTabFilter(tab.key, 'selectedCompany', value)}
              allowClear
              style={{ width: '100%' }}
            >
              {tab.companies.map(company => (
                <Select.Option key={company} value={company}>
                  <BankOutlined style={{ marginRight: 8 }} />
                  Company {company}
                </Select.Option>
              ))}
            </Select>
          </Col>
          <Col span={6}>
            <Select
              placeholder="Filter by Currency"
              value={tab.selectedCurrency}
              onChange={(value) => updateTabFilter(tab.key, 'selectedCurrency', value)}
              allowClear
              style={{ width: '100%' }}
            >
              {tab.currencies.map(currency => (
                <Select.Option key={currency} value={currency}>
                  <DollarOutlined style={{ marginRight: 8 }} />
                  {currency}
                </Select.Option>
              ))}
            </Select>
          </Col>
          <Col span={12} style={{ textAlign: 'right' }}>
            <Text type="secondary">{pivotData.length} rows</Text>
          </Col>
        </Row>

        {/* Draggable Segment Filters */}
        <Divider style={{ margin: '12px 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <Text style={{ fontSize: 12, color: REDWOOD.textSecondary }}>
            <FilterOutlined /> Segments (drag to pivot):
          </Text>
          {AVAILABLE_SEGMENTS.map((segment) => {
            const isDropped = tab.segmentsBefore.includes(segment.key) || tab.segmentsAfter.includes(segment.key);
            return (
              <Tag
                key={segment.key}
                style={{
                  cursor: 'grab',
                  padding: '4px 8px',
                  fontSize: 11,
                  background: isDropped ? `${REDWOOD.info}15` : REDWOOD.surfaceSecondary,
                  borderColor: isDropped ? REDWOOD.info : REDWOOD.border,
                }}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('segment', segment.key);
                }}
              >
                <DragOutlined style={{ marginRight: 4 }} />
                {segment.label}
              </Tag>
            );
          })}
        </div>

        {/* Pivot columns drop zones */}
        <div
          style={{
            marginBottom: 16,
            padding: 8,
            background: `${REDWOOD.info}08`,
            borderRadius: 6,
            border: `1px dashed ${REDWOOD.info}`,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <Text style={{ fontSize: 11, color: REDWOOD.textSecondary }}>Pivot columns:</Text>

          {/* Drop zone BEFORE Account */}
          <div
            onDrop={(e) => {
              e.preventDefault();
              const segment = e.dataTransfer.getData('segment');
              if (segment) handleSegmentDrop(tab.key, segment, 'before');
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.style.background = `${REDWOOD.info}30`;
            }}
            onDragLeave={(e) => {
              e.currentTarget.style.background = `${REDWOOD.info}10`;
            }}
            style={{
              minWidth: 80,
              minHeight: 28,
              padding: '4px 8px',
              background: `${REDWOOD.info}10`,
              border: `1px dashed ${REDWOOD.info}`,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              flexWrap: 'wrap',
            }}
          >
            {tab.segmentsBefore.length === 0 && (
              <Text type="secondary" style={{ fontSize: 10 }}>Drop here (before)</Text>
            )}
            {tab.segmentsBefore.map((segment) => (
              <Tag
                key={segment}
                closable
                onClose={() => removeDroppedSegment(tab.key, segment)}
                style={{ fontSize: 11, margin: 0 }}
                color="blue"
              >
                {getSegmentLabel(segment)}
              </Tag>
            ))}
          </div>

          {/* Account (fixed) */}
          <Tag style={{ fontSize: 11, margin: 0, fontWeight: 'bold' }} color="gold">
            Account
          </Tag>
          <Tag style={{ fontSize: 11, margin: 0 }} color="default">
            Description
          </Tag>

          {/* Drop zone AFTER Account */}
          <div
            onDrop={(e) => {
              e.preventDefault();
              const segment = e.dataTransfer.getData('segment');
              if (segment) handleSegmentDrop(tab.key, segment, 'after');
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.style.background = `${REDWOOD.info}30`;
            }}
            onDragLeave={(e) => {
              e.currentTarget.style.background = `${REDWOOD.info}10`;
            }}
            style={{
              minWidth: 80,
              minHeight: 28,
              padding: '4px 8px',
              background: `${REDWOOD.info}10`,
              border: `1px dashed ${REDWOOD.info}`,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              flexWrap: 'wrap',
            }}
          >
            {tab.segmentsAfter.length === 0 && (
              <Text type="secondary" style={{ fontSize: 10 }}>Drop here (after)</Text>
            )}
            {tab.segmentsAfter.map((segment) => (
              <Tag
                key={segment}
                closable
                onClose={() => removeDroppedSegment(tab.key, segment)}
                style={{ fontSize: 11, margin: 0 }}
                color="blue"
              >
                {getSegmentLabel(segment)}
              </Tag>
            ))}
          </div>

          {/* Amount columns (fixed) */}
          <Tag style={{ fontSize: 11, margin: 0 }} color="default">Opening</Tag>
          <Tag style={{ fontSize: 11, margin: 0 }} color="default">Debit</Tag>
          <Tag style={{ fontSize: 11, margin: 0 }} color="default">Credit</Tag>
          <Tag style={{ fontSize: 11, margin: 0 }} color="default">Closing</Tag>
        </div>

        {/* Table */}
        <Table
          columns={dynamicColumns}
          dataSource={pivotData}
          rowKey="key"
          pagination={{
            pageSize: 50,
            showSizeChanger: true,
            pageSizeOptions: ['25', '50', '100', '200'],
            showTotal: (total) => `${total} rows`,
          }}
          scroll={{ x: 1000 }}
          size="small"
          style={{ borderRadius: 8 }}
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row style={{ background: REDWOOD.surfaceSecondary, fontWeight: 'bold' }}>
                <Table.Summary.Cell index={0} colSpan={segmentColCount}>
                  <Text strong>TOTAL</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={segmentColCount} align="right">
                  <Text strong style={{ fontFamily: 'monospace' }}>
                    {formatCurrency(totals.opening)}
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={segmentColCount + 1} align="right">
                  <Text strong style={{ fontFamily: 'monospace', color: REDWOOD.info }}>
                    {formatCurrency(totals.debit)}
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={segmentColCount + 2} align="right">
                  <Text strong style={{ fontFamily: 'monospace', color: REDWOOD.success }}>
                    {formatCurrency(totals.credit)}
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={segmentColCount + 3} align="right">
                  <Text strong style={{ fontFamily: 'monospace' }}>
                    {formatCurrency(totals.closing)}
                  </Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Card>
    );
  };

  // Build tab items
  const tabItems = [
    {
      key: 'periods',
      label: (
        <span>
          <CalendarOutlined style={{ marginRight: 8 }} />
          Periods
        </span>
      ),
      children: renderPeriodsTab(),
      closable: false,
    },
    ...tabs.map(tab => ({
      key: tab.key,
      label: (
        <span>
          <TableOutlined style={{ marginRight: 8 }} />
          {tab.periodName}
        </span>
      ),
      children: renderTBTab(tab),
      closable: true,
    })),
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: REDWOOD.surfaceSecondary }}>
      <Content style={{ padding: '24px 48px' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <Breadcrumb
            items={[
              { title: <Link to="/"><HomeOutlined /> Home</Link> },
              { title: <Link to="/gl">General Ledger</Link> },
              { title: 'Trial Balance' },
            ]}
            style={{ marginBottom: 16 }}
          />

          <Row justify="space-between" align="middle">
            <Col>
              <Title level={2} style={{ margin: 0, color: REDWOOD.textPrimary }}>
                <TableOutlined style={{ marginRight: 12, color: REDWOOD.primary }} />
                Trial Balance
              </Title>
              <Text type="secondary">
                View and analyze trial balance by period with company and currency filters
              </Text>
            </Col>
          </Row>
        </div>

        {/* Main Content - Tabs */}
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          type="editable-card"
          hideAdd
          onEdit={(targetKey, action) => {
            if (action === 'remove' && typeof targetKey === 'string') {
              closeTab(targetKey);
            }
          }}
          items={tabItems}
          style={{
            background: REDWOOD.surface,
            padding: 16,
            borderRadius: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
        />
      </Content>
    </Layout>
  );
};

export default TrialBalance;
