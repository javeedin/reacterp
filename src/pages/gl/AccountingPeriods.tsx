import React, { useState, useCallback, useEffect } from 'react';
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
  Progress,
  Statistic,
  Tabs,
  Select,
  DatePicker,
  Tooltip,
  Modal,
} from 'antd';
import {
  HomeOutlined,
  CalendarOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  BookOutlined,
  EditOutlined,
  LockOutlined,
  UnlockOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { PROXY_CONFIG } from '../../config/api.config';
import Autopilot from '../../components/Autopilot';

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

// Types - support both uppercase (Oracle APEX) and lowercase field names
interface Application {
  application_id: number;
  application_name: string;
  application_short_name?: string;
}

interface Ledger {
  ledger_id: number;
  ledger_name: string;
  ledger_short_name?: string;
  ledger_category_code?: string; // PRIMARY, SECONDARY, ALC, etc.
  currency_code?: string;
}

// Normalize API response to handle both UPPERCASE and lowercase field names
const normalizeApplication = (item: Record<string, unknown>): Application => ({
  application_id: (item.application_id ?? item.APPLICATION_ID ?? 0) as number,
  application_name: (item.application_name ?? item.APPLICATION_NAME ?? '') as string,
  application_short_name: (item.application_short_name ?? item.APPLICATION_SHORT_NAME ?? '') as string,
});

const normalizeLedger = (item: Record<string, unknown>): Ledger => ({
  ledger_id: (item.ledger_id ?? item.LEDGER_ID ?? 0) as number,
  ledger_name: (item.ledger_name ?? item.LEDGER_NAME ?? '') as string,
  ledger_short_name: (item.ledger_short_name ?? item.LEDGER_SHORT_NAME ?? '') as string,
  ledger_category_code: (item.ledger_category_code ?? item.LEDGER_CATEGORY_CODE ?? '') as string,
  currency_code: (item.currency_code ?? item.CURRENCY_CODE ?? '') as string,
});

interface AccountingPeriod {
  PeriodNameId: string;
  PeriodSetNameId: string;
  PeriodType: string;
  AdjustmentPeriodFlag: boolean;
  StartDate: string;
  EndDate: string;
  EnteredPeriodName: string;
  PeriodYear: number;
  PeriodNumber: number;
}

interface PeriodStatus {
  PeriodNameId: string;
  PeriodName?: string;
  ApplicationId: number;
  LedgerId: number;
  LedgerName?: string;
  ClosingStatus: string; // O=Open, C=Closed, F=Future, N=Never Opened, P=Permanently Closed
  EndDate: string;
  StartDate: string;
  EffectivePeriodNumber: number;
  PeriodYear: number;
  PeriodNumber: number;
  AdjustmentPeriodFlag: boolean;
}

// Helper to extract period name from PeriodNameId (format: "PERIODSET_PeriodName_AppId_LedgerId")
const extractPeriodName = (periodNameId: string, periodName?: string): string => {
  if (periodName) return periodName;
  if (!periodNameId) return '-';
  const parts = periodNameId.split('_');
  // Format is typically: PERIODSET_Jan-26_101_300000000774004
  if (parts.length >= 2) {
    return parts[1];
  }
  return periodNameId;
};

interface LedgerPeriodSummary {
  LedgerId: number;
  LedgerName: string;
  currentPeriod: PeriodStatus | null;
  priorPeriod: PeriodStatus | null;
  nextPeriod: PeriodStatus | null;
  allPeriods: PeriodStatus[];
}

const AccountingPeriods: React.FC = () => {
  const [activeTab, setActiveTab] = useState('status');

  // Applications and Ledgers mapping state
  const [applications, setApplications] = useState<Application[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [mappingLoading, setMappingLoading] = useState(false);

  // Period Status tab state
  const [periodStatuses, setPeriodStatuses] = useState<PeriodStatus[]>([]);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string>('');
  const [selectedApplication, setSelectedApplication] = useState<number | null>(null);
  const [effectiveDate, setEffectiveDate] = useState<dayjs.Dayjs>(dayjs());
  const [selectedLedger, setSelectedLedger] = useState<LedgerPeriodSummary | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodStatus | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // All Periods tab state
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [fetchProgress, setFetchProgress] = useState<{ current: number; total: number; fetching: boolean }>({
    current: 0,
    total: 0,
    fetching: false,
  });

  // Helper function to get application name by ID
  const getApplicationName = useCallback((appId: number): string => {
    const app = applications.find(a => a.application_id === appId);
    return app?.application_name || `Application ${appId}`;
  }, [applications]);

  // Helper function to get ledger name by ID
  const getLedgerName = useCallback((ledgerId: number): string => {
    const ledger = ledgers.find(l => l.ledger_id === ledgerId);
    return ledger?.ledger_name || `Ledger ${ledgerId}`;
  }, [ledgers]);

  // Helper function to check if ledger is a reporting ledger (to be filtered out)
  const isReportingLedger = useCallback((ledgerId: number): boolean => {
    const ledger = ledgers.find(l => l.ledger_id === ledgerId);
    // Filter out SECONDARY and ALC (Average Ledger Currency) ledgers - these are reporting ledgers
    return ledger?.ledger_category_code === 'SECONDARY' || ledger?.ledger_category_code === 'ALC';
  }, [ledgers]);

  // Fetch applications from APEX REST
  const fetchApplications = useCallback(async () => {
    try {
      const url = `${PROXY_CONFIG.baseUrl}/apex/applications/getall`;
      console.log('=== FETCHING APPLICATIONS ===');
      console.log('URL:', url);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      const rawItems = result.items || result || [];
      console.log('Applications fetched (raw):', rawItems.length, rawItems[0]);

      // Normalize field names (handle both UPPERCASE and lowercase)
      const normalizedItems = rawItems.map((item: Record<string, unknown>) => normalizeApplication(item));
      console.log('Applications normalized:', normalizedItems.length, normalizedItems[0]);
      setApplications(normalizedItems);

      // Set default application - default to "All" (null means all)
      if (selectedApplication === null) {
        setSelectedApplication(null); // Start with "All" selected
      }
    } catch (err) {
      console.error('Error fetching applications:', err);
    }
  }, [selectedApplication]);

  // Fetch ledgers from APEX REST
  const fetchLedgers = useCallback(async () => {
    try {
      const url = `${PROXY_CONFIG.baseUrl}/apex/ledgers`;
      console.log('=== FETCHING LEDGERS ===');
      console.log('URL:', url);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      const rawItems = result.items || result || [];
      console.log('Ledgers fetched (raw):', rawItems.length, rawItems[0]);

      // Normalize field names (handle both UPPERCASE and lowercase)
      const normalizedItems = rawItems.map((item: Record<string, unknown>) => normalizeLedger(item));
      console.log('Ledgers normalized:', normalizedItems.length, normalizedItems[0]);
      setLedgers(normalizedItems);
    } catch (err) {
      console.error('Error fetching ledgers:', err);
    }
  }, []);

  // Fetch applications and ledgers on mount
  useEffect(() => {
    const fetchMappingData = async () => {
      setMappingLoading(true);
      await Promise.all([fetchApplications(), fetchLedgers()]);
      setMappingLoading(false);
    };
    fetchMappingData();
  }, [fetchApplications, fetchLedgers]);

  // Fetch period statuses with pagination
  const fetchPeriodStatuses = useCallback(async () => {
    setStatusLoading(true);
    setStatusError('');
    setPeriodStatuses([]);

    const allStatuses: PeriodStatus[] = [];
    let offset = 0;
    const limit = 500;
    let hasMore = true;
    let pageCount = 0;

    try {
      while (hasMore) {
        const fusionPath = `fscmRestApi/resources/11.13.18.05/accountingPeriodStatusLOV?limit=${limit}&offset=${offset}`;
        const url = `${PROXY_CONFIG.baseUrl}/fusion/${fusionPath}`;

        console.log(`=== FETCHING PERIOD STATUS PAGE ${pageCount + 1} ===`);
        console.log('URL:', url);

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        const items = result.items || [];

        console.log('Items fetched:', items.length);
        allStatuses.push(...items);
        pageCount++;

        hasMore = result.hasMore === true && items.length > 0;
        offset += limit;

        if (pageCount > 50) {
          console.warn('Safety limit reached: 50 pages');
          break;
        }
      }

      console.log('=== FETCH COMPLETE ===');
      console.log('Total statuses fetched:', allStatuses.length);

      setPeriodStatuses(allStatuses);
    } catch (err) {
      console.error('Error fetching period statuses:', err);
      setStatusError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setStatusLoading(false);
    }
  }, []);

  // Fetch all accounting periods with pagination
  const fetchAllPeriods = useCallback(async () => {
    setLoading(true);
    setError('');
    setPeriods([]);
    setFetchProgress({ current: 0, total: 0, fetching: true });

    const allPeriods: AccountingPeriod[] = [];
    let offset = 0;
    const limit = 500;
    let hasMore = true;
    let pageCount = 0;

    try {
      while (hasMore) {
        const fusionPath = `fscmRestApi/resources/11.13.18.05/accountingPeriodsLOV?limit=${limit}&offset=${offset}`;
        const url = `${PROXY_CONFIG.baseUrl}/fusion/${fusionPath}`;

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        const items = result.items || [];

        allPeriods.push(...items);
        pageCount++;

        setFetchProgress({
          current: allPeriods.length,
          total: result.totalResults || allPeriods.length,
          fetching: true,
        });

        hasMore = result.hasMore === true && items.length > 0;
        offset += limit;

        if (pageCount > 50) break;
      }

      setPeriods(allPeriods);
      setFetchProgress({ current: allPeriods.length, total: allPeriods.length, fetching: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setFetchProgress({ current: 0, total: 0, fetching: false });
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchPeriodStatuses();
    fetchAllPeriods();
  }, [fetchPeriodStatuses, fetchAllPeriods]);

  // Get unique applications from period status data (for dropdown options based on data availability)
  const availableApplicationIds = [...new Set(periodStatuses.map(p => p.ApplicationId))].sort();

  // Filter and group period statuses by ledger
  const getLedgerSummaries = useCallback((): LedgerPeriodSummary[] => {
    // If "All" is selected (null), show all applications; otherwise filter by selected application
    const filtered = selectedApplication === null
      ? periodStatuses
      : periodStatuses.filter(p => p.ApplicationId === selectedApplication);
    const effectiveDateStr = effectiveDate.format('YYYY-MM-DD');

    // Group by LedgerId
    const ledgerMap = new Map<number, PeriodStatus[]>();
    filtered.forEach(p => {
      // Filter out reporting ledgers
      if (isReportingLedger(p.LedgerId)) {
        return;
      }
      const existing = ledgerMap.get(p.LedgerId) || [];
      existing.push(p);
      ledgerMap.set(p.LedgerId, existing);
    });

    const summaries: LedgerPeriodSummary[] = [];

    ledgerMap.forEach((periods, ledgerId) => {
      // Sort by EffectivePeriodNumber
      const sorted = [...periods].sort((a, b) => a.EffectivePeriodNumber - b.EffectivePeriodNumber);

      // Find current period (period that contains the effective date)
      let currentIdx = sorted.findIndex(p => {
        const start = p.StartDate;
        const end = p.EndDate;
        return effectiveDateStr >= start && effectiveDateStr <= end;
      });

      // If no exact match, find the most recent open period
      if (currentIdx === -1) {
        currentIdx = sorted.findIndex(p => p.ClosingStatus === 'O');
      }

      // If still no match, use the first period
      if (currentIdx === -1) currentIdx = 0;

      const currentPeriod = sorted[currentIdx] || null;
      const priorPeriod = currentIdx > 0 ? sorted[currentIdx - 1] : null;
      const nextPeriod = currentIdx < sorted.length - 1 ? sorted[currentIdx + 1] : null;

      // Get ledger name from ledgers lookup
      const ledgerName = getLedgerName(ledgerId);

      summaries.push({
        LedgerId: ledgerId,
        LedgerName: ledgerName,
        currentPeriod,
        priorPeriod,
        nextPeriod,
        allPeriods: sorted,
      });
    });

    return summaries;
  }, [periodStatuses, selectedApplication, effectiveDate, isReportingLedger, getLedgerName]);

  const ledgerSummaries = getLedgerSummaries();

  // Get status icon and color
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'O': // Open
        return <Tooltip title="Open"><BookOutlined style={{ color: REDWOOD.info, fontSize: 16 }} /></Tooltip>;
      case 'C': // Closed
        return <Tooltip title="Closed"><CheckCircleOutlined style={{ color: REDWOOD.success, fontSize: 16 }} /></Tooltip>;
      case 'F': // Future Enterable
        return <Tooltip title="Future Enterable"><EditOutlined style={{ color: REDWOOD.warning, fontSize: 16 }} /></Tooltip>;
      case 'N': // Never Opened
        return <Tooltip title="Never Opened"><StopOutlined style={{ color: REDWOOD.info, fontSize: 16 }} /></Tooltip>;
      case 'P': // Permanently Closed
        return <Tooltip title="Permanently Closed"><LockOutlined style={{ color: REDWOOD.textSecondary, fontSize: 16 }} /></Tooltip>;
      default:
        return <Tooltip title={status}><ClockCircleOutlined style={{ color: REDWOOD.textSecondary, fontSize: 16 }} /></Tooltip>;
    }
  };

  // Handle ledger click to show detail
  const handleLedgerClick = (ledger: LedgerPeriodSummary) => {
    setSelectedLedger(ledger);
    setSelectedPeriod(null);
    setDetailModalVisible(true);
  };

  // Check if actions should be enabled
  const canOpenPeriod = selectedPeriod && (selectedPeriod.ClosingStatus === 'C' || selectedPeriod.ClosingStatus === 'F' || selectedPeriod.ClosingStatus === 'N');
  const canClosePeriod = selectedPeriod && selectedPeriod.ClosingStatus === 'O';

  // Period Status columns
  const statusColumns = [
    {
      title: 'Ledger',
      dataIndex: 'LedgerName',
      key: 'LedgerName',
      width: 250,
      render: (name: string, record: LedgerPeriodSummary) => (
        <Text
          strong
          style={{ fontSize: 12, color: REDWOOD.info, cursor: 'pointer' }}
          onClick={() => handleLedgerClick(record)}
        >
          {name || `Ledger ${record.LedgerId}`}
        </Text>
      ),
    },
    {
      title: 'Current Period',
      children: [
        {
          title: 'Name',
          key: 'currentName',
          width: 120,
          render: (_: unknown, record: LedgerPeriodSummary) => (
            <Text style={{ fontSize: 11 }}>
              {record.currentPeriod ? extractPeriodName(record.currentPeriod.PeriodNameId, record.currentPeriod.PeriodName) : '-'}
            </Text>
          ),
        },
        {
          title: 'Status',
          key: 'currentStatus',
          width: 60,
          align: 'center' as const,
          render: (_: unknown, record: LedgerPeriodSummary) => (
            record.currentPeriod ? getStatusIcon(record.currentPeriod.ClosingStatus) : '-'
          ),
        },
      ],
    },
    {
      title: 'Prior Period',
      children: [
        {
          title: 'Name',
          key: 'priorName',
          width: 120,
          render: (_: unknown, record: LedgerPeriodSummary) => (
            <Text style={{ fontSize: 11 }}>
              {record.priorPeriod ? extractPeriodName(record.priorPeriod.PeriodNameId, record.priorPeriod.PeriodName) : '-'}
            </Text>
          ),
        },
        {
          title: 'Status',
          key: 'priorStatus',
          width: 60,
          align: 'center' as const,
          render: (_: unknown, record: LedgerPeriodSummary) => (
            record.priorPeriod ? getStatusIcon(record.priorPeriod.ClosingStatus) : '-'
          ),
        },
      ],
    },
    {
      title: 'Next Period',
      children: [
        {
          title: 'Name',
          key: 'nextName',
          width: 120,
          render: (_: unknown, record: LedgerPeriodSummary) => (
            <Text style={{ fontSize: 11 }}>
              {record.nextPeriod ? extractPeriodName(record.nextPeriod.PeriodNameId, record.nextPeriod.PeriodName) : '-'}
            </Text>
          ),
        },
        {
          title: 'Status',
          key: 'nextStatus',
          width: 60,
          align: 'center' as const,
          render: (_: unknown, record: LedgerPeriodSummary) => (
            record.nextPeriod ? getStatusIcon(record.nextPeriod.ClosingStatus) : '-'
          ),
        },
      ],
    },
  ];

  // Detail modal period columns
  const detailColumns = [
    {
      title: 'Accounting Period',
      dataIndex: 'PeriodNameId',
      key: 'PeriodNameId',
      width: 180,
      render: (periodNameId: string, record: PeriodStatus) => (
        <Text style={{ fontSize: 11 }}>{extractPeriodName(periodNameId, record.PeriodName)}</Text>
      ),
    },
    {
      title: 'Period Number',
      dataIndex: 'PeriodNumber',
      key: 'PeriodNumber',
      width: 100,
      render: (num: number) => <Text style={{ fontSize: 11 }}>{num}</Text>,
    },
    {
      title: 'Year',
      dataIndex: 'PeriodYear',
      key: 'PeriodYear',
      width: 80,
      render: (year: number) => <Text code style={{ fontSize: 11 }}>{year}</Text>,
    },
    {
      title: 'Start Date',
      dataIndex: 'StartDate',
      key: 'StartDate',
      width: 120,
      render: (date: string) => <Text style={{ fontSize: 11 }}>{date ? dayjs(date).format('D-MMM-YYYY') : '-'}</Text>,
    },
    {
      title: 'End Date',
      dataIndex: 'EndDate',
      key: 'EndDate',
      width: 120,
      render: (date: string) => <Text style={{ fontSize: 11 }}>{date ? dayjs(date).format('D-MMM-YYYY') : '-'}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'ClosingStatus',
      key: 'ClosingStatus',
      width: 80,
      align: 'center' as const,
      render: (status: string) => getStatusIcon(status),
    },
  ];

  // All Periods table columns
  const allPeriodsColumns = [
    {
      title: 'Period Name',
      dataIndex: 'EnteredPeriodName',
      key: 'EnteredPeriodName',
      width: 150,
      sorter: (a: AccountingPeriod, b: AccountingPeriod) => a.EnteredPeriodName.localeCompare(b.EnteredPeriodName),
      render: (name: string, record: AccountingPeriod) => (
        <Space size={4}>
          <Text strong style={{ fontSize: 12 }}>{name}</Text>
          {record.AdjustmentPeriodFlag && (
            <Tag color="orange" style={{ fontSize: 9, margin: 0, padding: '0 4px' }}>ADJ</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Period Set',
      dataIndex: 'PeriodSetNameId',
      key: 'PeriodSetNameId',
      width: 180,
      ellipsis: true,
      filters: [...new Set(periods.map(p => p.PeriodSetNameId))].map(s => ({ text: s, value: s })),
      onFilter: (value: React.Key | boolean, record: AccountingPeriod) => record.PeriodSetNameId === value,
      render: (name: string) => <Text style={{ fontSize: 11 }}>{name}</Text>,
    },
    {
      title: 'Year',
      dataIndex: 'PeriodYear',
      key: 'PeriodYear',
      width: 80,
      sorter: (a: AccountingPeriod, b: AccountingPeriod) => a.PeriodYear - b.PeriodYear,
      render: (year: number) => <Text code style={{ fontSize: 11 }}>{year}</Text>,
    },
    {
      title: 'Period #',
      dataIndex: 'PeriodNumber',
      key: 'PeriodNumber',
      width: 80,
      sorter: (a: AccountingPeriod, b: AccountingPeriod) => a.PeriodNumber - b.PeriodNumber,
      render: (num: number) => <Text style={{ fontSize: 11 }}>{num}</Text>,
    },
    {
      title: 'Start Date',
      dataIndex: 'StartDate',
      key: 'StartDate',
      width: 120,
      sorter: (a: AccountingPeriod, b: AccountingPeriod) => new Date(a.StartDate).getTime() - new Date(b.StartDate).getTime(),
      render: (date: string) => <Text style={{ fontSize: 11 }}>{date ? dayjs(date).format('D-MMM-YYYY') : '-'}</Text>,
    },
    {
      title: 'End Date',
      dataIndex: 'EndDate',
      key: 'EndDate',
      width: 120,
      sorter: (a: AccountingPeriod, b: AccountingPeriod) => new Date(a.EndDate).getTime() - new Date(b.EndDate).getTime(),
      render: (date: string) => <Text style={{ fontSize: 11 }}>{date ? dayjs(date).format('D-MMM-YYYY') : '-'}</Text>,
    },
    {
      title: 'Period Type',
      dataIndex: 'PeriodType',
      key: 'PeriodType',
      width: 150,
      ellipsis: true,
      render: (type: string) => <Text style={{ fontSize: 10 }}>{type}</Text>,
    },
    {
      title: 'Adjustment',
      dataIndex: 'AdjustmentPeriodFlag',
      key: 'AdjustmentPeriodFlag',
      width: 90,
      filters: [
        { text: 'Yes', value: true },
        { text: 'No', value: false },
      ],
      onFilter: (value: React.Key | boolean, record: AccountingPeriod) => record.AdjustmentPeriodFlag === value,
      render: (flag: boolean) => (
        flag ? <Tag color="orange" style={{ fontSize: 10 }}>Yes</Tag> : <Tag color="default" style={{ fontSize: 10 }}>No</Tag>
      ),
    },
  ];

  // Get unique period years for filtering
  const periodYears = [...new Set(periods.map(p => p.PeriodYear))].sort((a, b) => b - a);
  const adjustmentPeriods = periods.filter(p => p.AdjustmentPeriodFlag).length;
  const regularPeriods = periods.length - adjustmentPeriods;
  const uniquePeriodSets = [...new Set(periods.map(p => p.PeriodSetNameId))].length;

  // Period Status Tab Content
  const PeriodStatusTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Controls */}
      <Row gutter={16} align="middle" style={{ marginBottom: 12 }}>
        <Col>
          <Space>
            <Text style={{ fontSize: 12 }}>Application:</Text>
            <Select
              value={selectedApplication}
              onChange={(value) => setSelectedApplication(value)}
              style={{ width: 200 }}
              size="small"
              loading={mappingLoading}
              placeholder="Select Application"
              allowClear
            >
              <Select.Option key="all" value={null}>
                All
              </Select.Option>
              {applications
                .filter(app => availableApplicationIds.includes(app.application_id))
                .map(app => (
                  <Select.Option key={app.application_id} value={app.application_id}>
                    {app.application_name}
                  </Select.Option>
                ))}
            </Select>
          </Space>
        </Col>
        <Col>
          <Space>
            <Button
              size="small"
              disabled={!canOpenPeriod}
              icon={<UnlockOutlined />}
            >
              Open Next Period
            </Button>
            <Button
              size="small"
              disabled={!canClosePeriod}
              icon={<LockOutlined />}
            >
              Close Current Period
            </Button>
          </Space>
        </Col>
        <Col>
          <Space>
            <Text style={{ fontSize: 12 }}>Effective As-of Date:</Text>
            <DatePicker
              value={effectiveDate}
              onChange={(date) => date && setEffectiveDate(date)}
              format="D-MMM-YYYY"
              size="small"
              allowClear={false}
            />
          </Space>
        </Col>
        <Col>
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchPeriodStatuses}
            loading={statusLoading}
            size="small"
          >
            Refresh
          </Button>
        </Col>
      </Row>

      {/* Status Error */}
      {statusError && (
        <Alert
          message="Error Loading Period Status"
          description={statusError}
          type="error"
          showIcon
          closable
          onClose={() => setStatusError('')}
          style={{ marginBottom: 12 }}
        />
      )}

      {/* Ledger Period Status Table */}
      <Card
        style={{ flex: 1, borderRadius: 6, border: `1px solid ${REDWOOD.border}` }}
        bodyStyle={{ padding: 0 }}
      >
        <Spin spinning={statusLoading}>
          <Table
            dataSource={ledgerSummaries}
            columns={statusColumns}
            rowKey="LedgerId"
            size="small"
            pagination={false}
            scroll={{ y: 'calc(100vh - 340px)' }}
            bordered
          />
        </Spin>
      </Card>

      {/* Legend */}
      <div style={{ marginTop: 8, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 11 }}>Rows Selected: {ledgerSummaries.length}</Text>
        <Space size={16}>
          <Space size={4}><BookOutlined style={{ color: REDWOOD.info }} /><Text style={{ fontSize: 10 }}>Open</Text></Space>
          <Space size={4}><CheckCircleOutlined style={{ color: REDWOOD.success }} /><Text style={{ fontSize: 10 }}>Closed</Text></Space>
          <Space size={4}><LockOutlined style={{ color: REDWOOD.textSecondary }} /><Text style={{ fontSize: 10 }}>Permanently Closed</Text></Space>
          <Space size={4}><EditOutlined style={{ color: REDWOOD.warning }} /><Text style={{ fontSize: 10 }}>Future Enterable</Text></Space>
          <Space size={4}><StopOutlined style={{ color: REDWOOD.info }} /><Text style={{ fontSize: 10 }}>Never Opened</Text></Space>
        </Space>
      </div>
    </div>
  );

  // All Periods Tab Content
  const AllPeriodsTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Statistics Cards */}
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={6}>
          <Card size="small" style={{ borderRadius: 6 }} bodyStyle={{ padding: '12px 16px' }}>
            <Statistic
              title={<Text style={{ fontSize: 11 }}>Total Periods</Text>}
              value={periods.length}
              prefix={<CalendarOutlined style={{ color: REDWOOD.info }} />}
              valueStyle={{ fontSize: 20, color: REDWOOD.info }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ borderRadius: 6 }} bodyStyle={{ padding: '12px 16px' }}>
            <Statistic
              title={<Text style={{ fontSize: 11 }}>Regular Periods</Text>}
              value={regularPeriods}
              prefix={<CheckCircleOutlined style={{ color: REDWOOD.success }} />}
              valueStyle={{ fontSize: 20, color: REDWOOD.success }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ borderRadius: 6 }} bodyStyle={{ padding: '12px 16px' }}>
            <Statistic
              title={<Text style={{ fontSize: 11 }}>Adjustment Periods</Text>}
              value={adjustmentPeriods}
              prefix={<ExclamationCircleOutlined style={{ color: REDWOOD.warning }} />}
              valueStyle={{ fontSize: 20, color: REDWOOD.warning }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ borderRadius: 6 }} bodyStyle={{ padding: '12px 16px' }}>
            <Statistic
              title={<Text style={{ fontSize: 11 }}>Period Sets</Text>}
              value={uniquePeriodSets}
              prefix={<ClockCircleOutlined style={{ color: REDWOOD.primary }} />}
              valueStyle={{ fontSize: 20, color: REDWOOD.primary }}
            />
          </Card>
        </Col>
      </Row>

      {/* Fetch Progress */}
      {fetchProgress.fetching && (
        <Card size="small" style={{ marginBottom: 12, borderRadius: 6 }} bodyStyle={{ padding: '8px 16px' }}>
          <Space>
            <Spin size="small" />
            <Text style={{ fontSize: 12 }}>Fetching periods... {fetchProgress.current} records loaded</Text>
            {fetchProgress.total > 0 && (
              <Progress percent={Math.round((fetchProgress.current / fetchProgress.total) * 100)} size="small" style={{ width: 150 }} />
            )}
          </Space>
        </Card>
      )}

      {/* Error Alert */}
      {error && (
        <Alert
          message="Error Loading Periods"
          description={error}
          type="error"
          showIcon
          closable
          onClose={() => setError('')}
          style={{ marginBottom: 12 }}
        />
      )}

      {/* Periods Table */}
      <Card
        style={{ flex: 1, borderRadius: 6, border: `1px solid ${REDWOOD.border}` }}
        bodyStyle={{ padding: 0 }}
      >
        <Spin spinning={loading && periods.length === 0}>
          <Table
            dataSource={periods}
            columns={allPeriodsColumns}
            rowKey="PeriodNameId"
            size="small"
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              pageSizeOptions: ['20', '50', '100', '200'],
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} periods`,
              size: 'small',
            }}
            scroll={{ y: 'calc(100vh - 480px)' }}
          />
        </Spin>
      </Card>
    </div>
  );

  return (
    <Layout style={{ height: 'calc(100vh - 64px)', background: REDWOOD.surfaceSecondary, overflow: 'hidden' }}>
      <Content style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div style={{
          padding: '8px 16px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.border}`,
          flexShrink: 0,
        }}>
          <Breadcrumb
            items={[
              { title: <Link to="/home"><HomeOutlined /> Home</Link> },
              { title: <Link to="/gl">General Ledger</Link> },
              { title: 'Accounting Periods' },
            ]}
          />
        </div>

        <div style={{ padding: '12px 16px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Title */}
          <Row justify="space-between" align="middle" style={{ marginBottom: 12, flexShrink: 0 }}>
            <Col>
              <Space align="center">
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 6,
                  background: REDWOOD.success,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <CalendarOutlined style={{ fontSize: 18, color: '#fff' }} />
                </div>
                <div>
                  <Title level={4} style={{ margin: 0, color: REDWOOD.textPrimary }}>
                    Manage Accounting Periods
                  </Title>
                  <Text type="secondary" style={{ fontSize: 12 }}>View and manage accounting period statuses</Text>
                </div>
              </Space>
            </Col>
          </Row>

          {/* Tabs */}
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
            items={[
              {
                key: 'status',
                label: 'Period Status',
                children: <PeriodStatusTab />,
              },
              {
                key: 'all',
                label: 'All Periods',
                children: <AllPeriodsTab />,
              },
            ]}
          />
        </div>
      </Content>

      {/* Detail Modal - Edit Accounting Period Statuses */}
      <Modal
        title={`Edit Accounting Period Statuses: ${selectedLedger?.LedgerName || ''}`}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        width={900}
        footer={[
          <Button key="done" type="primary" onClick={() => setDetailModalVisible(false)}>
            Done
          </Button>,
        ]}
      >
        {selectedLedger && (() => {
          // Get current period and the next future period only
          const sorted = [...selectedLedger.allPeriods].sort((a, b) => a.EffectivePeriodNumber - b.EffectivePeriodNumber);
          const currentPeriod = selectedLedger.currentPeriod;
          const currentIdx = currentPeriod ? sorted.findIndex(p => p.PeriodNameId === currentPeriod.PeriodNameId) : -1;

          // Show current period + 1 future period only
          const periodsToShow: PeriodStatus[] = [];
          if (currentIdx >= 0 && currentPeriod) {
            periodsToShow.push(currentPeriod);
            // Add the next period if available
            if (currentIdx + 1 < sorted.length) {
              periodsToShow.push(sorted[currentIdx + 1]);
            }
          }

          const latestOpenPeriod = selectedLedger.allPeriods.find(p => p.ClosingStatus === 'O');

          return (
            <div>
              {/* Ledger Info */}
              <Row gutter={24} style={{ marginBottom: 16 }}>
                <Col span={8}>
                  <Text style={{ fontSize: 12 }}>
                    <Text strong>Ledger: </Text>
                    <Select
                      value={selectedLedger.LedgerId}
                      style={{ width: 200 }}
                      size="small"
                    >
                      <Select.Option value={selectedLedger.LedgerId}>
                        {selectedLedger.LedgerName}
                      </Select.Option>
                    </Select>
                  </Text>
                </Col>
                <Col span={8}>
                  <Text style={{ fontSize: 12 }}>
                    <Text strong>Latest Open Period: </Text>
                    {latestOpenPeriod ? extractPeriodName(latestOpenPeriod.PeriodNameId, latestOpenPeriod.PeriodName) : '-'}
                  </Text>
                </Col>
                <Col span={8}>
                  <Text style={{ fontSize: 12 }}>
                    <Text strong>Application: </Text>
                    {selectedApplication !== null ? getApplicationName(selectedApplication) : '-'}
                  </Text>
                </Col>
              </Row>

              {/* Action Buttons */}
              <Space style={{ marginBottom: 16 }}>
                <Button
                  size="small"
                  icon={<UnlockOutlined />}
                  disabled={!canOpenPeriod}
                >
                  Open Period
                </Button>
                <Button
                  size="small"
                  icon={<LockOutlined />}
                  disabled={!canClosePeriod}
                >
                  Close Period
                </Button>
                <Select
                  placeholder="Status"
                  style={{ width: 120 }}
                  size="small"
                  allowClear
                >
                  <Select.Option value="all">All</Select.Option>
                  <Select.Option value="O">Open</Select.Option>
                  <Select.Option value="C">Closed</Select.Option>
                  <Select.Option value="F">Future</Select.Option>
                  <Select.Option value="N">Never Opened</Select.Option>
                </Select>
              </Space>

              {/* Periods Table - Shows current period + 1 future period only */}
              <Table
                dataSource={periodsToShow.sort((a, b) => a.EffectivePeriodNumber - b.EffectivePeriodNumber)}
                columns={detailColumns}
                rowKey="PeriodNameId"
                size="small"
                pagination={false}
                scroll={{ y: 400 }}
                rowSelection={{
                  type: 'radio',
                  selectedRowKeys: selectedPeriod ? [selectedPeriod.PeriodNameId] : [],
                  onChange: (_, selectedRows) => {
                    setSelectedPeriod(selectedRows[0] || null);
                  },
                }}
                onRow={(record) => ({
                  onClick: () => setSelectedPeriod(record),
                  style: { cursor: 'pointer' },
                })}
              />

              {/* Legend */}
              <div style={{ marginTop: 12, display: 'flex', gap: 16, alignItems: 'center' }}>
                <Space size={16}>
                  <Space size={4}><BookOutlined style={{ color: REDWOOD.info }} /><Text style={{ fontSize: 10 }}>Open</Text></Space>
                  <Space size={4}><CheckCircleOutlined style={{ color: REDWOOD.success }} /><Text style={{ fontSize: 10 }}>Closed</Text></Space>
                  <Space size={4}><LockOutlined style={{ color: REDWOOD.textSecondary }} /><Text style={{ fontSize: 10 }}>Permanently Closed</Text></Space>
                  <Space size={4}><EditOutlined style={{ color: REDWOOD.warning }} /><Text style={{ fontSize: 10 }}>Future Enterable</Text></Space>
                  <Space size={4}><StopOutlined style={{ color: REDWOOD.info }} /><Text style={{ fontSize: 10 }}>Never Opened</Text></Space>
                </Space>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Autopilot Assistant */}
      <Autopilot />
    </Layout>
  );
};

export default AccountingPeriods;
