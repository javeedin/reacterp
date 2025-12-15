import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Layout,
  Typography,
  Card,
  Breadcrumb,
  Button,
  Select,
  Table,
  Space,
  Tooltip,
  Row,
  Col,
  Tag,
  Tabs,
  Spin,
  Empty,
  Divider,
  Dropdown,
} from 'antd';
import {
  HomeOutlined,
  SearchOutlined,
  FundOutlined,
  FilterOutlined,
  CloseOutlined,
  CheckSquareOutlined,
  BarChartOutlined,
  ReloadOutlined,
  DownloadOutlined,
  TableOutlined,
  ExpandOutlined,
  CompressOutlined,
  DragOutlined,
  CloseCircleOutlined,
  PlusOutlined,
  DownOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

// Oracle Redwood Color Palette
const REDWOOD = {
  primary: '#C74634',
  primaryLight: '#E85D4A',
  primaryDark: '#A33B2C',
  success: '#1D7B4D',
  warning: '#D4A800',
  info: '#0572CE',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral300: '#C7C7C7',
  neutral600: '#6B6B6B',
  neutral900: '#1A1A1A',
  surface: '#FFFFFF',
  taskBlue: '#0572CE',
  reportGreen: '#1D7B4D',
};

// Types
interface JournalLineSegment {
  key: string;
  jeLineNum: number;
  jeHeaderId: number;
  jeBatchId: number;
  defaultPeriodName: string;
  batchName: string;
  journalName: string;
  journalDescription: string;
  actualFlagMeaning: string;
  approvalStatusMeaning: string;
  userPeriodSetName: string;
  userJeSourceName: string;
  ledgerName: string;
  legalEntityName: string;
  userJeCategoryName: string;
  currencyCode: string;
  accountedDr: number;
  accountedCr: number;
  enteredDr: number;
  enteredCr: number;
  segment1: string;
  segment2: string;
  segment3: string;
  segment4: string;
  segment5: string;
  segment6: string;
  segment7: string;
  segment8: string;
  segment9: string;
  segment10: string;
  codeCombinationId: number;
  concatenatedSegments: string;
  description: string;
  lineDescription: string;
  effectiveDate: string;
  creationDate: string;
}

interface PivotDataRow {
  key: string;
  accountNumber: string;
  description: string;
  segment1: string;
  segment2: string;
  segment3: string;
  segment4: string;
  segment5: string;
  concatenatedSegments: string;
  [key: string]: string | number; // Period amounts
}

interface AccountTab {
  key: string;
  accountNumber: string;
  description: string;
  concatenatedSegments: string;
}

interface SegmentFilter {
  segment: string;
  label: string;
  values: string[];
  selected: string | null;
  isDropped: boolean;
}

// Menu item type
interface MenuItemType {
  key: string;
  icon: React.ReactNode;
  label: string;
  description?: string;
  color?: string;
  path?: string;
}

// Task menu items
const taskMenuItems: MenuItemType[] = [
  { key: 'manage-journals', icon: <FundOutlined />, label: 'Manage Journals', description: 'Search and manage journal entries', color: REDWOOD.primary, path: '/gl/manage-journals' },
  { key: 'account-analysis', icon: <FundOutlined />, label: 'Account Analysis', description: 'Analyze account balances', color: REDWOOD.taskBlue, path: '/gl/account-analysis' },
];

// Report menu items
const reportMenuItems: MenuItemType[] = [
  { key: 'trial-balance', icon: <BarChartOutlined />, label: 'Trial Balance', description: 'View trial balance report', color: REDWOOD.reportGreen },
  { key: 'account-analysis', icon: <FundOutlined />, label: 'Account Analysis', description: 'Account detail analysis', color: REDWOOD.warning, path: '/gl/account-analysis' },
];

// Mock data for periods
const mockPeriods = [
  'Jan-24', 'Feb-24', 'Mar-24', 'Apr-24', 'May-24', 'Jun-24',
  'Jul-24', 'Aug-24', 'Sep-24', 'Oct-24', 'Nov-24', 'Dec-24',
];

// Mock data for ledgers
const mockLedgers = ['US Primary Ledger', 'UK Secondary Ledger', 'EU Reporting Ledger'];

// Mock segment values
const mockSegments = {
  segment1: ['01', '02', '03', '04', '05'],
  segment2: ['100', '200', '300', '400', '500'],
  segment3: ['1001', '1002', '1003', '2001', '2002', '3001', '4001', '5001'],
  segment4: ['0000', '1000', '2000', '3000'],
  segment5: ['00', '01', '02', '03'],
};

// Generate mock journal line data
const generateMockData = (periods: string[]): JournalLineSegment[] => {
  const data: JournalLineSegment[] = [];
  const accounts = [
    { seg3: '1001', desc: 'Cash - Operating' },
    { seg3: '1002', desc: 'Cash - Payroll' },
    { seg3: '1003', desc: 'Petty Cash' },
    { seg3: '2001', desc: 'Accounts Receivable' },
    { seg3: '2002', desc: 'Allowance for Doubtful Accounts' },
    { seg3: '3001', desc: 'Accounts Payable' },
    { seg3: '4001', desc: 'Revenue - Product Sales' },
    { seg3: '5001', desc: 'Cost of Goods Sold' },
  ];

  let key = 0;
  periods.forEach(period => {
    accounts.forEach(acc => {
      const amt = Math.floor(Math.random() * 10000) + 100;
      data.push({
        key: `${key++}`,
        jeLineNum: key,
        jeHeaderId: 1000 + key,
        jeBatchId: 500 + Math.floor(key / 10),
        defaultPeriodName: period,
        batchName: `Batch-${period}`,
        journalName: `JE-${period}-${acc.seg3}`,
        journalDescription: `Journal entry for ${period}`,
        actualFlagMeaning: 'Actual',
        approvalStatusMeaning: 'Approved',
        userPeriodSetName: 'Fiscal Year 2024',
        userJeSourceName: 'Manual',
        ledgerName: 'US Primary Ledger',
        legalEntityName: 'ABC Corporation',
        userJeCategoryName: 'Adjustment',
        currencyCode: 'USD',
        accountedDr: key % 2 === 0 ? amt : 0,
        accountedCr: key % 2 !== 0 ? amt : 0,
        enteredDr: key % 2 === 0 ? amt : 0,
        enteredCr: key % 2 !== 0 ? amt : 0,
        segment1: '01',
        segment2: '100',
        segment3: acc.seg3,
        segment4: '0000',
        segment5: '00',
        segment6: '',
        segment7: '',
        segment8: '',
        segment9: '',
        segment10: '',
        codeCombinationId: 100000 + key,
        concatenatedSegments: `01-100-${acc.seg3}-0000-00`,
        description: acc.desc,
        lineDescription: `Line for ${acc.desc}`,
        effectiveDate: '2024-01-15',
        creationDate: '2024-01-10',
      });
    });
  });

  return data;
};

const AccountAnalysis: React.FC = () => {
  // State
  const [activeTabKey, setActiveTabKey] = useState('search');
  const [accountTabs, setAccountTabs] = useState<AccountTab[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchData, setSearchData] = useState<JournalLineSegment[]>([]);

  // Search filters
  const [selectedLedger, setSelectedLedger] = useState<string>('US Primary Ledger');
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>(['May-24', 'Jun-24']);

  // Segment filters
  const [segmentFilters, setSegmentFilters] = useState<SegmentFilter[]>([
    { segment: 'segment1', label: 'Company', values: mockSegments.segment1, selected: null, isDropped: false },
    { segment: 'segment2', label: 'Cost Center', values: mockSegments.segment2, selected: null, isDropped: false },
    { segment: 'segment3', label: 'Account', values: mockSegments.segment3, selected: null, isDropped: false },
    { segment: 'segment4', label: 'Sub-Account', values: mockSegments.segment4, selected: null, isDropped: false },
    { segment: 'segment5', label: 'Intercompany', values: mockSegments.segment5, selected: null, isDropped: false },
  ]);

  // Floating panel state
  const [activePanel, setActivePanel] = useState<'none' | 'tasks' | 'reports'>('none');
  const [isClosing, setIsClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const floatingIconsRef = useRef<HTMLDivElement>(null);

  // Pivot view state
  const [pivotGroupBy, setPivotGroupBy] = useState<string>('segment3');
  const [droppedSegments, setDroppedSegments] = useState<string[]>([]);

  // Click outside handler for floating panel
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isOutsidePanel = panelRef.current && !panelRef.current.contains(target);
      const isOutsideFloatingIcons = floatingIconsRef.current && !floatingIconsRef.current.contains(target);

      if (isOutsidePanel && isOutsideFloatingIcons) {
        closePanel();
      }
    };

    if (activePanel !== 'none') {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activePanel]);

  const closePanel = () => {
    setIsClosing(true);
    setTimeout(() => {
      setActivePanel('none');
      setIsClosing(false);
    }, 250);
  };

  const togglePanel = (panel: 'tasks' | 'reports') => {
    if (activePanel === panel) {
      closePanel();
    } else {
      setIsClosing(false);
      setActivePanel(panel);
    }
  };

  // Search function
  const handleSearch = () => {
    setLoading(true);
    setTimeout(() => {
      const data = generateMockData(selectedPeriods);
      setSearchData(data);
      setLoading(false);
    }, 500);
  };

  // Open account in new tab
  const openAccountTab = (record: JournalLineSegment) => {
    const existingTab = accountTabs.find(
      (tab) => tab.concatenatedSegments === record.concatenatedSegments
    );

    if (existingTab) {
      setActiveTabKey(existingTab.key);
    } else {
      const newTab: AccountTab = {
        key: `account-${record.codeCombinationId}`,
        accountNumber: record.segment3,
        description: record.description,
        concatenatedSegments: record.concatenatedSegments,
      };
      setAccountTabs([...accountTabs, newTab]);
      setActiveTabKey(newTab.key);
    }
  };

  // Close account tab
  const closeAccountTab = (targetKey: string) => {
    const newTabs = accountTabs.filter((tab) => tab.key !== targetKey);
    setAccountTabs(newTabs);

    if (activeTabKey === targetKey) {
      setActiveTabKey(newTabs.length > 0 ? newTabs[newTabs.length - 1].key : 'search');
    }
  };

  // Tab change handler
  const onTabChange = (key: string) => {
    setActiveTabKey(key);
  };

  // Tab edit handler
  const onTabEdit = (targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => {
    if (action === 'remove' && typeof targetKey === 'string') {
      closeAccountTab(targetKey);
    }
  };

  // Handle segment filter change
  const handleSegmentFilterChange = (segment: string, value: string | null) => {
    setSegmentFilters(
      segmentFilters.map((f) =>
        f.segment === segment ? { ...f, selected: value } : f
      )
    );
  };

  // Handle segment drop (for pivot refresh)
  const handleSegmentDrop = (segment: string) => {
    if (!droppedSegments.includes(segment)) {
      setDroppedSegments([...droppedSegments, segment]);
    }
    setSegmentFilters(
      segmentFilters.map((f) =>
        f.segment === segment ? { ...f, isDropped: true } : f
      )
    );
  };

  // Remove dropped segment
  const removeDroppedSegment = (segment: string) => {
    setDroppedSegments(droppedSegments.filter((s) => s !== segment));
    setSegmentFilters(
      segmentFilters.map((f) =>
        f.segment === segment ? { ...f, isDropped: false } : f
      )
    );
  };

  // Format number
  const formatNumber = (value: number | undefined | null): string => {
    if (value === undefined || value === null || value === 0) return '';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Generate pivot data for account tab
  const generatePivotData = (accountSegments: string): PivotDataRow[] => {
    const accountData = searchData.filter(
      (d) => d.concatenatedSegments === accountSegments
    );

    const pivotMap = new Map<string, PivotDataRow>();

    accountData.forEach((row) => {
      const key = row.concatenatedSegments;
      if (!pivotMap.has(key)) {
        pivotMap.set(key, {
          key,
          accountNumber: row.segment3,
          description: row.description,
          segment1: row.segment1,
          segment2: row.segment2,
          segment3: row.segment3,
          segment4: row.segment4,
          segment5: row.segment5,
          concatenatedSegments: row.concatenatedSegments,
        });
      }

      const pivotRow = pivotMap.get(key)!;
      const periodKey = row.defaultPeriodName;
      const netAmount = (row.accountedDr || 0) - (row.accountedCr || 0);
      pivotRow[periodKey] = ((pivotRow[periodKey] as number) || 0) + netAmount;
    });

    return Array.from(pivotMap.values());
  };

  // Get all unique accounts from search data for pivot
  const getAllPivotData = useMemo((): PivotDataRow[] => {
    const pivotMap = new Map<string, PivotDataRow>();

    searchData.forEach((row) => {
      // Apply segment filters
      const matchesFilters = segmentFilters.every((filter) => {
        if (!filter.selected) return true;
        return (row as any)[filter.segment] === filter.selected;
      });

      if (!matchesFilters) return;

      const key = row.concatenatedSegments;
      if (!pivotMap.has(key)) {
        pivotMap.set(key, {
          key,
          accountNumber: row.segment3,
          description: row.description,
          segment1: row.segment1,
          segment2: row.segment2,
          segment3: row.segment3,
          segment4: row.segment4,
          segment5: row.segment5,
          concatenatedSegments: row.concatenatedSegments,
        });
      }

      const pivotRow = pivotMap.get(key)!;
      const periodKey = row.defaultPeriodName;
      const netAmount = (row.accountedDr || 0) - (row.accountedCr || 0);
      pivotRow[periodKey] = ((pivotRow[periodKey] as number) || 0) + netAmount;
    });

    return Array.from(pivotMap.values());
  }, [searchData, segmentFilters]);

  // Search tab columns
  const searchColumns: ColumnsType<JournalLineSegment> = [
    {
      title: 'Account',
      dataIndex: 'concatenatedSegments',
      key: 'concatenatedSegments',
      width: 200,
      fixed: 'left',
      render: (text: string, record: JournalLineSegment) => (
        <a
          onClick={() => openAccountTab(record)}
          style={{ color: REDWOOD.info, cursor: 'pointer' }}
        >
          {text}
        </a>
      ),
    },
    { title: 'Description', dataIndex: 'description', key: 'description', width: 180, ellipsis: true },
    { title: 'Period', dataIndex: 'defaultPeriodName', key: 'defaultPeriodName', width: 80 },
    { title: 'Journal', dataIndex: 'journalName', key: 'journalName', width: 150 },
    { title: 'Batch', dataIndex: 'batchName', key: 'batchName', width: 120 },
    { title: 'Source', dataIndex: 'userJeSourceName', key: 'userJeSourceName', width: 80 },
    { title: 'Category', dataIndex: 'userJeCategoryName', key: 'userJeCategoryName', width: 100 },
    {
      title: 'Entered Dr',
      dataIndex: 'enteredDr',
      key: 'enteredDr',
      width: 100,
      align: 'right',
      render: (v: number) => <span style={{ color: REDWOOD.success }}>{formatNumber(v)}</span>,
    },
    {
      title: 'Entered Cr',
      dataIndex: 'enteredCr',
      key: 'enteredCr',
      width: 100,
      align: 'right',
      render: (v: number) => <span style={{ color: REDWOOD.primary }}>{formatNumber(v)}</span>,
    },
    {
      title: 'Accounted Dr',
      dataIndex: 'accountedDr',
      key: 'accountedDr',
      width: 110,
      align: 'right',
      render: (v: number) => <span style={{ color: REDWOOD.success }}>{formatNumber(v)}</span>,
    },
    {
      title: 'Accounted Cr',
      dataIndex: 'accountedCr',
      key: 'accountedCr',
      width: 110,
      align: 'right',
      render: (v: number) => <span style={{ color: REDWOOD.primary }}>{formatNumber(v)}</span>,
    },
  ];

  // Pivot columns (dynamic based on selected periods)
  const pivotColumns: ColumnsType<PivotDataRow> = [
    {
      title: 'Account',
      dataIndex: 'accountNumber',
      key: 'accountNumber',
      width: 100,
      fixed: 'left',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 180,
      fixed: 'left',
      ellipsis: true,
    },
    // Dynamic period columns
    ...selectedPeriods.map((period) => ({
      title: period,
      dataIndex: period,
      key: period,
      width: 100,
      align: 'right' as const,
      render: (v: number) => {
        const formatted = formatNumber(v);
        if (!formatted) return '';
        return (
          <span style={{ color: v >= 0 ? REDWOOD.success : REDWOOD.primary }}>
            {formatted}
          </span>
        );
      },
    })),
    {
      title: 'Total',
      key: 'total',
      width: 120,
      align: 'right' as const,
      fixed: 'right',
      render: (_: any, record: PivotDataRow) => {
        const total = selectedPeriods.reduce(
          (sum, period) => sum + ((record[period] as number) || 0),
          0
        );
        return (
          <Text strong style={{ color: total >= 0 ? REDWOOD.success : REDWOOD.primary }}>
            {formatNumber(total)}
          </Text>
        );
      },
    },
  ];

  // Floating Action Button component
  const FloatingIcon = ({
    icon,
    label,
    color,
    isActive,
    onClick,
    position,
  }: {
    icon: React.ReactNode;
    label: string;
    color: string;
    isActive: boolean;
    onClick: () => void;
    position: 'top' | 'bottom';
  }) => (
    <Tooltip title={!isActive ? label : ''} placement="left">
      <div
        onClick={onClick}
        style={{
          width: 48,
          height: 48,
          borderRadius: position === 'top' ? '10px 10px 0 0' : '0 0 10px 10px',
          background: isActive ? color : REDWOOD.surface,
          border: `2px solid ${color}`,
          borderBottom: position === 'top' ? 'none' : `2px solid ${color}`,
          borderTop: position === 'bottom' ? 'none' : `2px solid ${color}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          boxShadow: isActive ? `0 4px 12px ${color}40` : '0 2px 8px rgba(0,0,0,0.1)',
          color: isActive ? '#fff' : color,
          fontSize: 20,
        }}
      >
        {icon}
      </div>
    </Tooltip>
  );

  // Slide-out Panel component
  const SlidePanel = ({
    title,
    items,
    color,
  }: {
    title: string;
    items: MenuItemType[];
    color: string;
  }) => (
    <div
      style={{
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        width: 360,
        background: REDWOOD.surface,
        boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
        overflow: 'hidden',
        animation: isClosing
          ? 'slideOut 0.25s ease-in forwards'
          : 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        zIndex: 1001,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '16px 20px',
          background: color,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <Text strong style={{ color: '#fff', fontSize: 16 }}>
          {title}
        </Text>
        <CloseOutlined
          style={{ color: '#fff', cursor: 'pointer', fontSize: 14, padding: 6 }}
          onClick={closePanel}
        />
      </div>

      <div style={{ padding: 12, flex: 1, overflowY: 'auto' }}>
        {items.map((item, index) => (
          <div
            key={item.key}
            onClick={() => {
              closePanel();
              if (item.path) {
                window.location.href = item.path;
              }
            }}
            style={{
              padding: '12px 16px',
              borderRadius: 10,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              transition: 'all 0.2s ease',
              marginBottom: 6,
              border: `1px solid ${REDWOOD.neutral200}`,
              background: REDWOOD.surface,
              opacity: 0,
              animation: `fadeInItem 0.3s ease-out ${index * 0.05}s forwards`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = REDWOOD.neutral100;
              e.currentTarget.style.borderColor = color;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = REDWOOD.surface;
              e.currentTarget.style.borderColor = REDWOOD.neutral200;
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: `${color}15`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: color,
                fontSize: 18,
                flexShrink: 0,
              }}
            >
              {item.icon}
            </div>
            <div style={{ flex: 1 }}>
              <Text strong style={{ display: 'block', color: REDWOOD.neutral900, fontSize: 13 }}>
                {item.label}
              </Text>
              {item.description && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {item.description}
                </Text>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Render Search tab content
  const renderSearchTab = () => (
    <div style={{ padding: 16 }}>
      {/* Search Filters */}
      <Card
        style={{ marginBottom: 16, borderRadius: 8 }}
        bodyStyle={{ padding: 16 }}
      >
        <Row gutter={[16, 12]} align="middle">
          <Col xs={24} sm={12} md={6}>
            <Text style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Ledger</Text>
            <Select
              value={selectedLedger}
              onChange={setSelectedLedger}
              style={{ width: '100%' }}
              size="small"
            >
              {mockLedgers.map((ledger) => (
                <Option key={ledger} value={ledger}>
                  {ledger}
                </Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Text style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Periods (Multiple)</Text>
            <Select
              mode="multiple"
              value={selectedPeriods}
              onChange={setSelectedPeriods}
              style={{ width: '100%' }}
              size="small"
              maxTagCount={3}
              placeholder="Select periods"
            >
              {mockPeriods.map((period) => (
                <Option key={period} value={period}>
                  {period}
                </Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Text style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Account</Text>
            <Select
              allowClear
              value={segmentFilters.find((f) => f.segment === 'segment3')?.selected}
              onChange={(v) => handleSegmentFilterChange('segment3', v)}
              style={{ width: '100%' }}
              size="small"
              placeholder="All"
            >
              {mockSegments.segment3.map((val) => (
                <Option key={val} value={val}>
                  {val}
                </Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Text style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>&nbsp;</Text>
            <Space>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleSearch}
                size="small"
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
              >
                Search
              </Button>
              <Button icon={<ReloadOutlined />} size="small">
                Reset
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Results Table */}
      <Card style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
        <div
          style={{
            padding: '10px 16px',
            background: REDWOOD.neutral100,
            borderBottom: `1px solid ${REDWOOD.neutral200}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text strong style={{ fontSize: 12 }}>
            Journal Lines ({searchData.length} records)
          </Text>
          <Space size="small">
            <Button size="small" icon={<DownloadOutlined />}>
              Export
            </Button>
          </Space>
        </div>

        <Spin spinning={loading}>
          <Table
            columns={searchColumns}
            dataSource={searchData}
            pagination={{ pageSize: 20, size: 'small', showSizeChanger: true }}
            scroll={{ x: 1400 }}
            size="small"
            className="compact-table"
            locale={{ emptyText: <Empty description="Click Search to load data" /> }}
          />
        </Spin>
      </Card>
    </div>
  );

  // Render Account Detail tab with pivot view
  const renderAccountTab = (tab: AccountTab) => {
    const pivotData = generatePivotData(tab.concatenatedSegments);

    return (
      <div style={{ padding: 16 }}>
        {/* Account Header with Segment Filters */}
        <Card
          style={{ marginBottom: 16, borderRadius: 8 }}
          bodyStyle={{ padding: 12 }}
        >
          <Row gutter={[16, 8]} align="middle">
            <Col flex="auto">
              <Space split={<Divider type="vertical" />}>
                <div>
                  <Text type="secondary" style={{ fontSize: 10 }}>Account</Text>
                  <Text strong style={{ fontSize: 12, display: 'block' }}>{tab.concatenatedSegments}</Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 10 }}>Description</Text>
                  <Text style={{ fontSize: 12, display: 'block' }}>{tab.description}</Text>
                </div>
              </Space>
            </Col>
            <Col>
              <Space size="small">
                <Button size="small" icon={<DownloadOutlined />}>
                  Export
                </Button>
              </Space>
            </Col>
          </Row>

          {/* Draggable Segment Filters */}
          <Divider style={{ margin: '12px 0' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>
              <FilterOutlined /> Segments (drag to pivot):
            </Text>
            {segmentFilters.map((filter) => (
              <Tag
                key={filter.segment}
                style={{
                  cursor: 'grab',
                  padding: '4px 8px',
                  fontSize: 11,
                  background: filter.isDropped ? `${REDWOOD.info}15` : REDWOOD.neutral100,
                  borderColor: filter.isDropped ? REDWOOD.info : REDWOOD.neutral300,
                }}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('segment', filter.segment);
                }}
              >
                <DragOutlined style={{ marginRight: 4 }} />
                {filter.label}
                {filter.selected && `: ${filter.selected}`}
              </Tag>
            ))}
          </div>

          {/* Dropped segments for pivot grouping */}
          {droppedSegments.length > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: 8,
                background: `${REDWOOD.info}08`,
                borderRadius: 6,
                border: `1px dashed ${REDWOOD.info}`,
              }}
            >
              <Text style={{ fontSize: 11, marginRight: 8 }}>Pivot by:</Text>
              {droppedSegments.map((segment) => {
                const filter = segmentFilters.find((f) => f.segment === segment);
                return (
                  <Tag
                    key={segment}
                    closable
                    onClose={() => removeDroppedSegment(segment)}
                    style={{ fontSize: 11 }}
                    color="blue"
                  >
                    {filter?.label}
                  </Tag>
                );
              })}
            </div>
          )}
        </Card>

        {/* Pivot Table */}
        <Card
          style={{ borderRadius: 8 }}
          bodyStyle={{ padding: 0 }}
          onDrop={(e) => {
            e.preventDefault();
            const segment = e.dataTransfer.getData('segment');
            if (segment) {
              handleSegmentDrop(segment);
            }
          }}
          onDragOver={(e) => e.preventDefault()}
        >
          <div
            style={{
              padding: '10px 16px',
              background: REDWOOD.neutral100,
              borderBottom: `1px solid ${REDWOOD.neutral200}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Space>
              <TableOutlined style={{ color: REDWOOD.info }} />
              <Text strong style={{ fontSize: 12 }}>Pivot View - Period Analysis</Text>
            </Space>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Periods: {selectedPeriods.join(', ')}
            </Text>
          </div>

          <Table
            columns={pivotColumns}
            dataSource={pivotData}
            pagination={false}
            scroll={{ x: 800 }}
            size="small"
            className="compact-table"
            summary={() => {
              const totals: { [key: string]: number } = {};
              selectedPeriods.forEach((period) => {
                totals[period] = pivotData.reduce(
                  (sum, row) => sum + ((row[period] as number) || 0),
                  0
                );
              });
              const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);

              return (
                <Table.Summary fixed>
                  <Table.Summary.Row style={{ background: REDWOOD.neutral100 }}>
                    <Table.Summary.Cell index={0}>
                      <Text strong style={{ fontSize: 11 }}>Total</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} />
                    {selectedPeriods.map((period, idx) => (
                      <Table.Summary.Cell key={period} index={idx + 2} align="right">
                        <Text strong style={{ fontSize: 11, color: totals[period] >= 0 ? REDWOOD.success : REDWOOD.primary }}>
                          {formatNumber(totals[period])}
                        </Text>
                      </Table.Summary.Cell>
                    ))}
                    <Table.Summary.Cell index={selectedPeriods.length + 2} align="right">
                      <Text strong style={{ fontSize: 11, color: grandTotal >= 0 ? REDWOOD.success : REDWOOD.primary }}>
                        {formatNumber(grandTotal)}
                      </Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              );
            }}
          />
        </Card>
      </div>
    );
  };

  // Build tabs
  const tabItems = [
    {
      key: 'search',
      label: (
        <span style={{ fontSize: 12 }}>
          <SearchOutlined style={{ marginRight: 6 }} />
          Search
        </span>
      ),
      children: renderSearchTab(),
      closable: false,
    },
    ...accountTabs.map((tab) => ({
      key: tab.key,
      label: (
        <span style={{ fontSize: 12 }}>
          <FundOutlined style={{ marginRight: 6 }} />
          {tab.accountNumber}
        </span>
      ),
      children: renderAccountTab(tab),
      closable: true,
    })),
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb Header */}
        <div
          style={{
            padding: '12px 24px',
            background: REDWOOD.surface,
            borderBottom: `1px solid ${REDWOOD.neutral200}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Breadcrumb
            items={[
              { title: <Link to="/home"><HomeOutlined /> Home</Link> },
              { title: <Link to="/gl">General Ledger</Link> },
              { title: 'Account Analysis' },
            ]}
          />
        </div>

        {/* Tabbed Content */}
        <div style={{ padding: '0 16px 16px 16px', paddingRight: 80 }}>
          <Tabs
            type="editable-card"
            activeKey={activeTabKey}
            onChange={onTabChange}
            onEdit={onTabEdit}
            hideAdd
            items={tabItems}
            style={{ marginTop: 8 }}
          />
        </div>

        {/* Floating Connected Icons */}
        <div
          ref={floatingIconsRef}
          style={{
            position: 'fixed',
            right: 20,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <FloatingIcon
            icon={<CheckSquareOutlined />}
            label="Tasks"
            color={REDWOOD.taskBlue}
            isActive={activePanel === 'tasks'}
            onClick={() => togglePanel('tasks')}
            position="top"
          />
          <div style={{ width: 48, height: 2, background: REDWOOD.neutral200 }} />
          <FloatingIcon
            icon={<BarChartOutlined />}
            label="Reports"
            color={REDWOOD.reportGreen}
            isActive={activePanel === 'reports'}
            onClick={() => togglePanel('reports')}
            position="bottom"
          />
        </div>

        {/* Backdrop Overlay */}
        {activePanel !== 'none' && (
          <div
            onClick={closePanel}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.3)',
              zIndex: 1000,
              animation: isClosing ? 'fadeOut 0.25s ease forwards' : 'fadeIn 0.3s ease forwards',
            }}
          />
        )}

        {/* Slide-out Panels */}
        <div ref={panelRef}>
          {activePanel === 'tasks' && (
            <SlidePanel title="Tasks" items={taskMenuItems} color={REDWOOD.taskBlue} />
          )}
          {activePanel === 'reports' && (
            <SlidePanel title="Reports" items={reportMenuItems} color={REDWOOD.reportGreen} />
          )}
        </div>
      </Content>

      {/* CSS Animations */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes slideOut {
          from { transform: translateX(0); }
          to { transform: translateX(100%); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes fadeInItem {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </Layout>
  );
};

export default AccountAnalysis;
