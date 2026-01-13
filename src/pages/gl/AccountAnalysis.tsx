import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Layout,
  Typography,
  Card,
  Breadcrumb,
  Button,
  Select,
  Input,
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
  message,
  Modal,
  Checkbox,
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
  DragOutlined,
  UnorderedListOutlined,
  PieChartOutlined,
  LoadingOutlined,
  BugOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { PROXY_CONFIG } from '../../config/api.config';

const { Content } = Layout;
const { Text } = Typography;
const { Option } = Select;

// API Base URL
const API_BASE_URL = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/gl';

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

// Types matching API response
interface JournalLineSegment {
  key: string;
  batchId: number;
  jeHeaderId: number;
  jeLineNumber: number;
  currencyCode: string;
  company: string;
  lob: string;
  department: string;
  account: string;
  subAccount: string;
  analysis: string;
  intercompany: string;
  future1: string;
  future2: string;
  enteredDr: number;
  enteredCr: number;
  accountedDr: number;
  accountedCr: number;
  chartOfAccountsName: string;
  defaultPeriodName: string;
  batchName: string;
  actualFlagMeaning: string;
  approvalStatusMeaning: string;
  userPeriodSetName: string;
  userJeSourceName: string;
  ledgerName: string;
  legalEntityName: string;
  userJeCategoryName: string;
  concatenatedSegments?: string;
  accountDescription?: string;
}

interface PivotDataRow {
  key: string;
  account: string;
  company: string;
  lob: string;
  department: string;
  subAccount: string;
  analysis: string;
  intercompany: string;
  concatenatedSegments: string;
  [key: string]: string | number;
}

interface AccountTab {
  key: string;
  account: string;
  company: string;
  concatenatedSegments: string;
  data: JournalLineSegment[];
  loading: boolean;
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

// Available ledgers
const availableLedgers = ['BUIMERC LEDGER'];

// Available companies
const availableCompanies = ['01', '02', '03'];

// Period status response interface (from periodsstatus/create endpoint)
interface PeriodStatusItem {
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

// Account item interface (from glaccountslist endpoint)
interface AccountItem {
  account: string;
  description: string;
  account_type: string;
}

// Helper to parse period string to sortable date
const parsePeriodToDate = (period: string): Date => {
  const monthMap: Record<string, number> = {
    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
    'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
  };
  const parts = period.split('-');
  if (parts.length === 2) {
    const month = monthMap[parts[0]] ?? 0;
    const year = 2000 + parseInt(parts[1], 10);
    return new Date(year, month, 1);
  }
  return new Date();
};

const AccountAnalysis: React.FC = () => {
  // State
  const [activeTabKey, setActiveTabKey] = useState('search');
  const [accountTabs, setAccountTabs] = useState<AccountTab[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchData, setSearchData] = useState<JournalLineSegment[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  // Periods state - loaded from API
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(false);

  // Search filters - default ledger is BUIMERC LEDGER
  const [selectedLedger, setSelectedLedger] = useState<string>('BUIMERC LEDGER');
  const [selectedCompany, setSelectedCompany] = useState<string>('01');
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]);
  const [accountFilter, setAccountFilter] = useState<string>('');

  // Account lookup modal state
  const [accountLookupVisible, setAccountLookupVisible] = useState(false);
  const [accountsList, setAccountsList] = useState<AccountItem[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountSearchText, setAccountSearchText] = useState('');

  // Pivot view options
  const [showDrCrColumns, setShowDrCrColumns] = useState(false);

  // Segment filters for pivot
  const [segmentFilters, setSegmentFilters] = useState<SegmentFilter[]>([
    { segment: 'company', label: 'Company', values: [], selected: null, isDropped: false },
    { segment: 'lob', label: 'LOB', values: [], selected: null, isDropped: false },
    { segment: 'department', label: 'Department', values: [], selected: null, isDropped: false },
    { segment: 'account', label: 'Account', values: [], selected: null, isDropped: false },
    { segment: 'subAccount', label: 'Sub Account', values: [], selected: null, isDropped: false },
    { segment: 'analysis', label: 'Analysis', values: [], selected: null, isDropped: false },
    { segment: 'intercompany', label: 'Intercompany', values: [], selected: null, isDropped: false },
  ]);

  // Floating panel state
  const [activePanel, setActivePanel] = useState<'none' | 'tasks' | 'reports'>('none');
  const [isClosing, setIsClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const floatingIconsRef = useRef<HTMLDivElement>(null);

  // Pivot view state - segments before and after Account column
  const [segmentsBeforeAccount, setSegmentsBeforeAccount] = useState<string[]>([]);
  const [segmentsAfterAccount, setSegmentsAfterAccount] = useState<string[]>([]);

  // Journal detail modal state
  const [journalModalVisible, setJournalModalVisible] = useState(false);
  const [journalModalData, setJournalModalData] = useState<JournalLineSegment[]>([]);
  const [journalModalTitle, setJournalModalTitle] = useState('');
  const [journalModalFilters, setJournalModalFilters] = useState<Record<string, string>>({});

  // All accounts pivot tab state
  const [allAccountsPivotOpen, setAllAccountsPivotOpen] = useState(false);
  const [allAccountsPivotSegmentsBefore, setAllAccountsPivotSegmentsBefore] = useState<string[]>([]);
  const [allAccountsPivotSegmentsAfter, setAllAccountsPivotSegmentsAfter] = useState<string[]>([]);

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

  // Helper to extract period name from PeriodNameId (format: "PERIODSET_Jan-24_101_300000000774004")
  const extractPeriodName = (periodNameId: string): string | null => {
    if (!periodNameId) return null;
    const parts = periodNameId.split('_');
    // Format is typically: PERIODSET_Jan-24_101_300000000774004
    if (parts.length >= 2) {
      return parts[1];
    }
    return null;
  };

  // Fetch all periods from APEX periodsstatus/create endpoint
  const fetchPeriods = useCallback(async () => {
    setPeriodsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('P_APPLICATION_NAME', 'General Ledger');
      params.append('P_LEDGER_NAME', selectedLedger);

      const url = `${PROXY_CONFIG.baseUrl}/apex/periodsstatus/create?${params.toString()}`;
      console.log('Fetching all periods from:', url);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      const items = result.items || result || [];

      console.log('Period status response:', result);
      console.log('Period status items count:', items.length);
      if (items.length > 0) {
        console.log('First item structure:', JSON.stringify(items[0], null, 2));
      }

      // Extract unique period names from period_name_id field
      const periodSet = new Set<string>();
      items.forEach((item: any) => {
        // Handle both lowercase and uppercase field names
        const periodNameId = item.period_name_id || item.PERIOD_NAME_ID || item.periodNameId;
        if (periodNameId) {
          // Check if it contains underscore (compound format)
          if (periodNameId.includes('_')) {
            const periodName = extractPeriodName(periodNameId);
            if (periodName) {
              periodSet.add(periodName);
            }
          } else {
            // Direct period name format (e.g., "Jan-24")
            periodSet.add(periodNameId);
          }
        }
      });

      // Convert to array and sort chronologically
      const sortedPeriods = Array.from(periodSet).sort((a, b) => {
        return parsePeriodToDate(a).getTime() - parsePeriodToDate(b).getTime();
      });

      console.log('Fetched periods:', sortedPeriods.length, sortedPeriods);
      setAvailablePeriods(sortedPeriods);
    } catch (error) {
      console.error('Error fetching periods:', error);
      message.error('Failed to load periods. Please refresh the page.');
    } finally {
      setPeriodsLoading(false);
    }
  }, [selectedLedger]);

  // Load periods on mount
  useEffect(() => {
    fetchPeriods();
  }, [fetchPeriods]);

  // Fetch accounts list from APEX glaccountslist endpoint
  const fetchAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const url = `${PROXY_CONFIG.baseUrl}/apex/glaccountslist`;
      console.log('Fetching accounts from:', url);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      const items: AccountItem[] = result.items || result || [];
      console.log('Fetched accounts:', items.length);
      setAccountsList(items);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      message.error('Failed to load accounts list.');
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  // Open account lookup modal
  const openAccountLookup = () => {
    setAccountLookupVisible(true);
    setAccountSearchText('');
    if (accountsList.length === 0) {
      fetchAccounts();
    }
  };

  // Select account from lookup
  const handleAccountSelect = (account: string) => {
    setAccountFilter(account);
    setAccountLookupVisible(false);
  };

  // Filter accounts based on search text
  const filteredAccounts = accountsList.filter((item) => {
    const searchLower = accountSearchText.toLowerCase();
    return (
      item.account.toLowerCase().includes(searchLower) ||
      item.description.toLowerCase().includes(searchLower)
    );
  });

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

  // Search function - calls real API
  const handleSearch = async () => {
    if (selectedPeriods.length === 0) {
      message.warning('Please select at least one period');
      return;
    }

    setLoading(true);
    try {
      // Build query parameters
      const params = new URLSearchParams();
      params.append('ledger_name', selectedLedger);
      params.append('period_names', selectedPeriods.join(','));
      params.append('company', selectedCompany);

      // Add account filter if provided
      if (accountFilter) {
        params.append('account', accountFilter);
      }

      const response = await fetch(`${API_BASE_URL}/accountanalysis?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Map API response to component format
      const items = (data.items || []).map((item: any, index: number) => ({
        ...item,
        key: `${index}`,
        concatenatedSegments: `${item.company}-${item.lob}-${item.department}-${item.account}-${item.subAccount}-${item.analysis}-${item.intercompany}`,
        accountDescription: item.ACCOUNT_DESCRIPTION || item.account_description || item.accountDescription || '',
      }));

      setSearchData(items);
      setTotalCount(data.totalCount || items.length);
      message.success(`Found ${items.length} records`);
    } catch (error) {
      console.error('Error fetching data:', error);
      message.error('Failed to fetch data. Please try again.');
      setSearchData([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  // Show search API URL in modal
  const showSearchApiUrl = () => {
    const params = new URLSearchParams();
    params.append('ledger_name', selectedLedger);
    params.append('period_names', selectedPeriods.join(','));
    params.append('company', selectedCompany);
    if (accountFilter) {
      params.append('account', accountFilter);
    }
    const url = `${API_BASE_URL}/accountanalysis?${params.toString()}`;
    Modal.info({
      title: 'Search API Endpoint',
      width: 700,
      content: (
        <div style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 12, padding: '8px 0' }}>
          {url}
        </div>
      ),
    });
  };

  // Fetch account data for drill-down
  const fetchAccountData = async (account: string, company: string): Promise<JournalLineSegment[]> => {
    try {
      // Fetch data for each period using the byaccount endpoint
      const allItems: JournalLineSegment[] = [];

      for (const period of selectedPeriods) {
        const params = new URLSearchParams();
        params.append('P_ACCOUNT', account);
        params.append('P_PERIOD_NAME', period);
        params.append('P_CURRENCY_CODE', 'AED'); // Default currency, could be made configurable

        const url = `${API_BASE_URL}/accountanalysis/byaccount?${params.toString()}`;
        console.log('Fetching account data from:', url);

        const response = await fetch(url);

        if (!response.ok) {
          console.error(`HTTP error for period ${period}: ${response.status}`);
          continue; // Skip this period if there's an error
        }

        const data = await response.json();
        const items = (data.items || []).map((item: any, index: number) => ({
          key: `${period}-${index}`,
          batchId: item.batch_id,
          jeHeaderId: item.je_header_id,
          jeLineNumber: item.je_line_number,
          currencyCode: item.currency_code,
          company: item.company,
          lob: item.lob,
          department: item.department,
          account: item.account,
          subAccount: item.sub_account,
          analysis: item.analysis,
          intercompany: item.intercompany,
          future1: item.future1,
          future2: item.future2,
          enteredDr: item.entered_dr || 0,
          enteredCr: item.entered_cr || 0,
          accountedDr: item.accounted_dr || 0,
          accountedCr: item.accounted_cr || 0,
          chartOfAccountsName: item.chart_of_accounts_name,
          defaultPeriodName: item.default_period_name,
          batchName: item.batch_name,
          actualFlagMeaning: item.actual_flag_meaning,
          approvalStatusMeaning: item.approval_status_meaning,
          userPeriodSetName: item.user_period_set_name,
          userJeSourceName: item.user_je_source_name,
          ledgerName: item.ledger_name,
          legalEntityName: item.legal_entity_name,
          userJeCategoryName: item.user_je_category_name,
          concatenatedSegments: item.account_combination || `${item.company}-${item.lob}-${item.department}-${item.account}-${item.sub_account}-${item.analysis}-${item.intercompany}`,
          accountDescription: item.account_description || '',
        }));

        allItems.push(...items);
      }

      console.log('Fetched total items:', allItems.length);
      return allItems;
    } catch (error) {
      console.error('Error fetching account data:', error);
      message.error('Failed to fetch account data');
      return [];
    }
  };

  // Reset filters
  const handleReset = () => {
    setSelectedLedger('BUIMERC LEDGER');
    setSelectedCompany('01');
    setSelectedPeriods([]);
    setAccountFilter('');
    setSearchData([]);
    setTotalCount(0);
  };

  // Open account in new tab - re-query API
  const openAccountTab = async (record: JournalLineSegment) => {
    const concatenatedSegments = record.concatenatedSegments ||
      `${record.company}-${record.lob}-${record.department}-${record.account}-${record.subAccount}-${record.analysis}-${record.intercompany}`;

    const existingTab = accountTabs.find(
      (tab) => tab.account === record.account && tab.company === record.company
    );

    if (existingTab) {
      setActiveTabKey(existingTab.key);
    } else {
      const tabKey = `account-${Date.now()}`;
      const newTab: AccountTab = {
        key: tabKey,
        account: record.account,
        company: record.company,
        concatenatedSegments,
        data: [],
        loading: true,
      };
      setAccountTabs([...accountTabs, newTab]);
      setActiveTabKey(tabKey);

      // Fetch fresh data for this account
      const freshData = await fetchAccountData(record.account, record.company);
      setAccountTabs((prev) =>
        prev.map((tab) =>
          tab.key === tabKey ? { ...tab, data: freshData, loading: false } : tab
        )
      );
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
      if (targetKey === 'all-accounts-pivot') {
        closeAllAccountsPivot();
      } else {
        closeAccountTab(targetKey);
      }
    }
  };

  // Handle segment drop (for pivot refresh)
  const handleSegmentDrop = (segment: string, position: 'before' | 'after') => {
    // Remove from both arrays first if it exists
    const newBefore = segmentsBeforeAccount.filter((s) => s !== segment);
    const newAfter = segmentsAfterAccount.filter((s) => s !== segment);

    if (position === 'before') {
      setSegmentsBeforeAccount([...newBefore, segment]);
      setSegmentsAfterAccount(newAfter);
    } else {
      setSegmentsBeforeAccount(newBefore);
      setSegmentsAfterAccount([...newAfter, segment]);
    }

    setSegmentFilters(
      segmentFilters.map((f) =>
        f.segment === segment ? { ...f, isDropped: true } : f
      )
    );
  };

  // Remove dropped segment
  const removeDroppedSegment = (segment: string) => {
    setSegmentsBeforeAccount(segmentsBeforeAccount.filter((s) => s !== segment));
    setSegmentsAfterAccount(segmentsAfterAccount.filter((s) => s !== segment));
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

  // Calculate totals
  const calculateTotals = (data: JournalLineSegment[]) => {
    return data.reduce(
      (acc, row) => ({
        enteredDr: acc.enteredDr + (row.enteredDr || 0),
        enteredCr: acc.enteredCr + (row.enteredCr || 0),
        accountedDr: acc.accountedDr + (row.accountedDr || 0),
        accountedCr: acc.accountedCr + (row.accountedCr || 0),
      }),
      { enteredDr: 0, enteredCr: 0, accountedDr: 0, accountedCr: 0 }
    );
  };

  // Show all journals modal
  const showAllJournals = (tab: AccountTab) => {
    setJournalModalData(tab.data);
    setJournalModalTitle(`All Journals - Account: ${tab.account}`);
    setJournalModalFilters({}); // Reset filters
    setJournalModalVisible(true);
  };

  // Handle modal filter change
  const handleModalFilterChange = (column: string, value: string) => {
    setJournalModalFilters((prev) => ({
      ...prev,
      [column]: value,
    }));
  };

  // Clear all modal filters
  const clearModalFilters = () => {
    setJournalModalFilters({});
  };

  // Filter modal data based on filters
  const getFilteredModalData = () => {
    return journalModalData.filter((row) => {
      return Object.entries(journalModalFilters).every(([column, filterValue]) => {
        if (!filterValue) return true;
        const cellValue = (row as any)[column];
        if (cellValue === null || cellValue === undefined) return false;
        return String(cellValue).toLowerCase().includes(filterValue.toLowerCase());
      });
    });
  };

  // Generate pivot data for account tab - groups by dropped segments + account
  const generatePivotData = (data: JournalLineSegment[]): PivotDataRow[] => {
    const pivotMap = new Map<string, PivotDataRow>();

    // Segments to group by: before segments + account + after segments
    const groupBySegments = [...segmentsBeforeAccount, 'account', ...segmentsAfterAccount];

    data.forEach((row) => {
      // Build key from selected segments only
      const keyParts = groupBySegments.map((seg) => (row as any)[seg] || '');
      const key = keyParts.join('-');

      if (!pivotMap.has(key)) {
        const pivotRow: PivotDataRow = {
          key,
          account: row.account,
          company: row.company,
          lob: row.lob,
          department: row.department,
          subAccount: row.subAccount,
          analysis: row.analysis,
          intercompany: row.intercompany,
          concatenatedSegments: key,
        };
        pivotMap.set(key, pivotRow);
      }

      const pivotRow = pivotMap.get(key)!;
      const periodKey = row.defaultPeriodName;
      // Store Debit and Credit separately for each period
      const drKey = `${periodKey}_Dr`;
      const crKey = `${periodKey}_Cr`;
      pivotRow[drKey] = ((pivotRow[drKey] as number) || 0) + (row.accountedDr || 0);
      pivotRow[crKey] = ((pivotRow[crKey] as number) || 0) + (row.accountedCr || 0);
    });

    return Array.from(pivotMap.values());
  };

  // Open all accounts pivot tab
  const openAllAccountsPivot = () => {
    if (searchData.length === 0) {
      message.warning('Please search for data first');
      return;
    }
    setAllAccountsPivotOpen(true);
    setActiveTabKey('all-accounts-pivot');
  };

  // Close all accounts pivot tab
  const closeAllAccountsPivot = () => {
    setAllAccountsPivotOpen(false);
    setAllAccountsPivotSegmentsBefore([]);
    setAllAccountsPivotSegmentsAfter([]);
    setActiveTabKey('search');
  };

  // Handle segment drop for all accounts pivot
  const handleAllAccountsSegmentDrop = (segment: string, position: 'before' | 'after') => {
    const newBefore = allAccountsPivotSegmentsBefore.filter((s) => s !== segment);
    const newAfter = allAccountsPivotSegmentsAfter.filter((s) => s !== segment);

    if (position === 'before') {
      setAllAccountsPivotSegmentsBefore([...newBefore, segment]);
      setAllAccountsPivotSegmentsAfter(newAfter);
    } else {
      setAllAccountsPivotSegmentsBefore(newBefore);
      setAllAccountsPivotSegmentsAfter([...newAfter, segment]);
    }
  };

  // Remove dropped segment from all accounts pivot
  const removeAllAccountsDroppedSegment = (segment: string) => {
    setAllAccountsPivotSegmentsBefore(allAccountsPivotSegmentsBefore.filter((s) => s !== segment));
    setAllAccountsPivotSegmentsAfter(allAccountsPivotSegmentsAfter.filter((s) => s !== segment));
  };

  // Generate pivot data for all accounts
  const generateAllAccountsPivotData = (): PivotDataRow[] => {
    const pivotMap = new Map<string, PivotDataRow>();
    const groupBySegments = [...allAccountsPivotSegmentsBefore, 'account', ...allAccountsPivotSegmentsAfter];

    searchData.forEach((row) => {
      const keyParts = groupBySegments.map((seg) => (row as any)[seg] || '');
      const key = keyParts.join('-');

      if (!pivotMap.has(key)) {
        const pivotRow: PivotDataRow = {
          key,
          account: row.account,
          accountDescription: row.accountDescription || '',
          company: row.company,
          lob: row.lob,
          department: row.department,
          subAccount: row.subAccount,
          analysis: row.analysis,
          intercompany: row.intercompany,
          concatenatedSegments: key,
        };
        pivotMap.set(key, pivotRow);
      }

      const pivotRow = pivotMap.get(key)!;
      const periodKey = row.defaultPeriodName;
      // Store Debit and Credit separately for each period
      const drKey = `${periodKey}_Dr`;
      const crKey = `${periodKey}_Cr`;
      pivotRow[drKey] = ((pivotRow[drKey] as number) || 0) + (row.accountedDr || 0);
      pivotRow[crKey] = ((pivotRow[crKey] as number) || 0) + (row.accountedCr || 0);
    });

    return Array.from(pivotMap.values());
  };

  // Search tab columns
  const searchColumns: ColumnsType<JournalLineSegment> = [
    {
      title: 'Account',
      dataIndex: 'concatenatedSegments',
      key: 'concatenatedSegments',
      width: 240,
      fixed: 'left',
      render: (text: string, record: JournalLineSegment) => (
        <a
          onClick={() => openAccountTab(record)}
          style={{ color: REDWOOD.info, cursor: 'pointer', fontSize: 11 }}
        >
          {text || `${record.company}-${record.lob}-${record.department}-${record.account}-${record.subAccount}-${record.analysis}-${record.intercompany}`}
        </a>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'accountDescription',
      key: 'accountDescription',
      width: 180,
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text}>
          <span style={{ fontSize: 11 }}>{text || '-'}</span>
        </Tooltip>
      ),
    },
    { title: 'Period', dataIndex: 'defaultPeriodName', key: 'defaultPeriodName', width: 80 },
    { title: 'Batch', dataIndex: 'batchName', key: 'batchName', width: 150, ellipsis: true },
    { title: 'Source', dataIndex: 'userJeSourceName', key: 'userJeSourceName', width: 100 },
    { title: 'Category', dataIndex: 'userJeCategoryName', key: 'userJeCategoryName', width: 120 },
    { title: 'Currency', dataIndex: 'currencyCode', key: 'currencyCode', width: 70 },
    {
      title: 'Entered Dr',
      dataIndex: 'enteredDr',
      key: 'enteredDr',
      width: 110,
      align: 'right',
      render: (v: number) => <span style={{ color: REDWOOD.success }}>{formatNumber(v)}</span>,
    },
    {
      title: 'Entered Cr',
      dataIndex: 'enteredCr',
      key: 'enteredCr',
      width: 110,
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

  // Get segment label by key
  const getSegmentLabel = (segment: string): string => {
    const filter = segmentFilters.find((f) => f.segment === segment);
    return filter?.label || segment;
  };

  // Pivot columns (dynamic based on dropped segments and selected periods)
  const pivotColumns: ColumnsType<PivotDataRow> = [
    // Segments before Account
    ...segmentsBeforeAccount.map((segment) => ({
      title: getSegmentLabel(segment),
      dataIndex: segment,
      key: segment,
      width: 100,
      fixed: 'left' as const,
    })),
    // Account column (always present)
    {
      title: 'Account',
      dataIndex: 'account',
      key: 'account',
      width: 100,
      fixed: 'left' as const,
    },
    // Segments after Account
    ...segmentsAfterAccount.map((segment) => ({
      title: getSegmentLabel(segment),
      dataIndex: segment,
      key: segment,
      width: 100,
      fixed: 'left' as const,
    })),
    // Dynamic period columns - Balance or Dr/Cr based on toggle
    ...(showDrCrColumns
      ? // Show Dr and Cr columns
        selectedPeriods.flatMap((period) => [
          {
            title: `${period} Dr`,
            dataIndex: `${period}_Dr`,
            key: `${period}_Dr`,
            width: 100,
            align: 'right' as const,
            render: (v: number) => (
              <span style={{ color: REDWOOD.success }}>
                {formatNumber(v || 0)}
              </span>
            ),
          },
          {
            title: `${period} Cr`,
            dataIndex: `${period}_Cr`,
            key: `${period}_Cr`,
            width: 100,
            align: 'right' as const,
            render: (v: number) => (
              <span style={{ color: REDWOOD.primary }}>
                {formatNumber(v || 0)}
              </span>
            ),
          },
        ])
      : // Show Balance columns (Dr - Cr)
        selectedPeriods.map((period) => ({
          title: period,
          key: `${period}_Balance`,
          width: 110,
          align: 'right' as const,
          render: (_: any, record: PivotDataRow) => {
            const dr = (record[`${period}_Dr`] as number) || 0;
            const cr = (record[`${period}_Cr`] as number) || 0;
            const balance = dr - cr;
            return (
              <span style={{ color: balance >= 0 ? REDWOOD.success : REDWOOD.primary }}>
                {formatNumber(balance)}
              </span>
            );
          },
        }))),
    // Total columns
    ...(showDrCrColumns
      ? [
          {
            title: 'Total Dr',
            key: 'totalDr',
            width: 110,
            align: 'right' as const,
            fixed: 'right' as const,
            render: (_: any, record: PivotDataRow) => {
              const totalDr = selectedPeriods.reduce(
                (sum, period) => sum + ((record[`${period}_Dr`] as number) || 0),
                0
              );
              return (
                <Text strong style={{ color: REDWOOD.success }}>
                  {formatNumber(totalDr)}
                </Text>
              );
            },
          },
          {
            title: 'Total Cr',
            key: 'totalCr',
            width: 110,
            align: 'right' as const,
            fixed: 'right' as const,
            render: (_: any, record: PivotDataRow) => {
              const totalCr = selectedPeriods.reduce(
                (sum, period) => sum + ((record[`${period}_Cr`] as number) || 0),
                0
              );
              return (
                <Text strong style={{ color: REDWOOD.primary }}>
                  {formatNumber(totalCr)}
                </Text>
              );
            },
          },
        ]
      : [
          {
            title: 'Total Balance',
            key: 'totalBalance',
            width: 120,
            align: 'right' as const,
            fixed: 'right' as const,
            render: (_: any, record: PivotDataRow) => {
              const totalBalance = selectedPeriods.reduce((sum, period) => {
                const dr = (record[`${period}_Dr`] as number) || 0;
                const cr = (record[`${period}_Cr`] as number) || 0;
                return sum + (dr - cr);
              }, 0);
              return (
                <Text strong style={{ color: totalBalance >= 0 ? REDWOOD.success : REDWOOD.primary }}>
                  {formatNumber(totalBalance)}
                </Text>
              );
            },
          },
        ]),
  ];

  // Create column title with filter input
  const createFilterableColumn = (
    title: string,
    dataIndex: string,
    width: number,
    options?: {
      align?: 'left' | 'right' | 'center';
      ellipsis?: boolean;
      render?: (v: any) => React.ReactNode;
    }
  ) => ({
    title: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>{title}</span>
        <Input
          size="small"
          placeholder="Filter..."
          value={journalModalFilters[dataIndex] || ''}
          onChange={(e) => handleModalFilterChange(dataIndex, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          style={{ fontSize: 10, padding: '2px 6px' }}
          allowClear
        />
      </div>
    ),
    dataIndex,
    key: dataIndex,
    width,
    align: options?.align,
    ellipsis: options?.ellipsis,
    render: options?.render,
  });

  // Journal detail modal columns with filters
  const journalDetailColumns: ColumnsType<JournalLineSegment> = [
    createFilterableColumn('Line', 'jeLineNumber', 70),
    createFilterableColumn('Period', 'defaultPeriodName', 90),
    createFilterableColumn('Batch Name', 'batchName', 180, { ellipsis: true }),
    createFilterableColumn('Source', 'userJeSourceName', 100),
    createFilterableColumn('Category', 'userJeCategoryName', 120),
    createFilterableColumn('Status', 'approvalStatusMeaning', 100),
    createFilterableColumn('Actual', 'actualFlagMeaning', 80),
    createFilterableColumn('Currency', 'currencyCode', 80),
    createFilterableColumn('Entered Dr', 'enteredDr', 110, {
      align: 'right',
      render: (v: number) => <span style={{ color: REDWOOD.success }}>{formatNumber(v)}</span>,
    }),
    createFilterableColumn('Entered Cr', 'enteredCr', 110, {
      align: 'right',
      render: (v: number) => <span style={{ color: REDWOOD.primary }}>{formatNumber(v)}</span>,
    }),
    createFilterableColumn('Accounted Dr', 'accountedDr', 110, {
      align: 'right',
      render: (v: number) => <span style={{ color: REDWOOD.success }}>{formatNumber(v)}</span>,
    }),
    createFilterableColumn('Accounted Cr', 'accountedCr', 110, {
      align: 'right',
      render: (v: number) => <span style={{ color: REDWOOD.primary }}>{formatNumber(v)}</span>,
    }),
    createFilterableColumn('Ledger', 'ledgerName', 140),
    createFilterableColumn('Legal Entity', 'legalEntityName', 140),
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
  const renderSearchTab = () => {
    const totals = calculateTotals(searchData);

    return (
      <div style={{ padding: 16 }}>
        {/* Search Filters */}
        <Card
          style={{ marginBottom: 16, borderRadius: 8 }}
          bodyStyle={{ padding: 16 }}
        >
          <Row gutter={[16, 12]} align="middle">
            <Col xs={24} sm={12} md={4}>
              <Text style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Ledger</Text>
              <Select
                value={selectedLedger}
                onChange={setSelectedLedger}
                style={{ width: '100%' }}
                size="small"
              >
                {availableLedgers.map((ledger) => (
                  <Option key={ledger} value={ledger}>
                    {ledger}
                  </Option>
                ))}
              </Select>
            </Col>
            <Col xs={24} sm={12} md={3}>
              <Text style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Company</Text>
              <Select
                value={selectedCompany}
                onChange={setSelectedCompany}
                style={{ width: '100%' }}
                size="small"
              >
                {availableCompanies.map((company) => (
                  <Option key={company} value={company}>
                    {company}
                  </Option>
                ))}
              </Select>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Text style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Periods (Multiple)</Text>
              <Select
                mode="multiple"
                value={selectedPeriods}
                onChange={setSelectedPeriods}
                style={{ width: '100%' }}
                size="small"
                maxTagCount={3}
                placeholder={periodsLoading ? 'Loading periods...' : 'Select periods'}
                loading={periodsLoading}
                notFoundContent={periodsLoading ? <Spin size="small" indicator={<LoadingOutlined />} /> : 'No periods found'}
                disabled={periodsLoading}
              >
                {availablePeriods.map((period) => (
                  <Option key={period} value={period}>
                    {period}
                  </Option>
                ))}
              </Select>
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Text style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Account</Text>
              <Input.Search
                allowClear
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                style={{ width: '100%' }}
                size="small"
                placeholder="e.g. 1116100"
                enterButton={<SearchOutlined />}
                onSearch={openAccountLookup}
              />
            </Col>
            <Col xs={24} sm={12} md={7}>
              <Text style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>&nbsp;</Text>
              <Space>
                <Button
                  icon={<SearchOutlined />}
                  onClick={handleSearch}
                  loading={loading}
                  size="small"
                >
                  Search
                </Button>
                <Button icon={<ReloadOutlined />} size="small" onClick={handleReset}>
                  Reset
                </Button>
                <Button
                  icon={<BugOutlined />}
                  size="small"
                  onClick={showSearchApiUrl}
                  style={{
                    background: '#f0f5ff',
                    borderColor: '#adc6ff',
                    color: '#1d39c4',
                  }}
                >
                  Log
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
              Journal Lines ({totalCount} records)
            </Text>
            <Space size="small">
              <Button
                size="small"
                icon={<PieChartOutlined />}
                onClick={openAllAccountsPivot}
                disabled={searchData.length === 0}
              >
                View Pivot for All Accounts
              </Button>
              <Button size="small" icon={<DownloadOutlined />}>
                Export
              </Button>
            </Space>
          </div>

          <Spin spinning={loading}>
            <Table
              columns={searchColumns}
              dataSource={searchData}
              pagination={{ pageSize: 20, size: 'small', showSizeChanger: true, showTotal: (total) => `Total ${total} records` }}
              scroll={{ x: 1400 }}
              size="small"
              className="compact-table"
              locale={{ emptyText: <Empty description="Click Search to load data" /> }}
              summary={() =>
                searchData.length > 0 ? (
                  <Table.Summary fixed>
                    <Table.Summary.Row style={{ background: REDWOOD.neutral100 }}>
                      <Table.Summary.Cell index={0} colSpan={6}>
                        <Text strong style={{ fontSize: 11 }}>Total</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={6} align="right">
                        <Text strong style={{ fontSize: 11, color: REDWOOD.success }}>
                          {formatNumber(totals.enteredDr)}
                        </Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={7} align="right">
                        <Text strong style={{ fontSize: 11, color: REDWOOD.primary }}>
                          {formatNumber(totals.enteredCr)}
                        </Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={8} align="right">
                        <Text strong style={{ fontSize: 11, color: REDWOOD.success }}>
                          {formatNumber(totals.accountedDr)}
                        </Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={9} align="right">
                        <Text strong style={{ fontSize: 11, color: REDWOOD.primary }}>
                          {formatNumber(totals.accountedCr)}
                        </Text>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  </Table.Summary>
                ) : null
              }
            />
          </Spin>
        </Card>
      </div>
    );
  };

  // Render Account Detail tab with pivot view
  const renderAccountTab = (tab: AccountTab) => {
    const pivotData = generatePivotData(tab.data);
    const totals = calculateTotals(tab.data);

    return (
      <div style={{ padding: 16 }}>
        {/* Account Header */}
        <Card
          style={{ marginBottom: 16, borderRadius: 8 }}
          bodyStyle={{ padding: 12 }}
        >
          <Row gutter={[16, 8]} align="middle">
            <Col flex="auto">
              <Space split={<Divider type="vertical" />}>
                <div>
                  <Text type="secondary" style={{ fontSize: 10 }}>Account</Text>
                  <Text strong style={{ fontSize: 12, display: 'block' }}>{tab.account}</Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 10 }}>Company</Text>
                  <Text style={{ fontSize: 12, display: 'block' }}>{tab.company}</Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 10 }}>Records</Text>
                  <Text style={{ fontSize: 12, display: 'block' }}>{tab.data.length}</Text>
                </div>
              </Space>
            </Col>
            <Col>
              <Space size="small">
                <Button
                  size="small"
                  icon={<UnorderedListOutlined />}
                  onClick={() => showAllJournals(tab)}
                >
                  Show All Journals
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    const endpoints = selectedPeriods.map((period) => {
                      const params = new URLSearchParams();
                      params.append('P_ACCOUNT', tab.account);
                      params.append('P_PERIOD_NAME', period);
                      params.append('P_CURRENCY_CODE', 'AED');
                      return `${API_BASE_URL}/accountanalysis/byaccount?${params.toString()}`;
                    });
                    console.log('API Endpoints:', endpoints);
                    message.info(
                      <div style={{ maxWidth: 600, wordBreak: 'break-all' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: 8 }}>API Endpoints:</div>
                        {endpoints.map((url, i) => (
                          <div key={i} style={{ fontSize: 11, marginBottom: 4 }}>{url}</div>
                        ))}
                      </div>,
                      10
                    );
                  }}
                >
                  Log
                </Button>
                <Button size="small" icon={<DownloadOutlined />}>
                  Export
                </Button>
                <Checkbox
                  checked={showDrCrColumns}
                  onChange={(e) => setShowDrCrColumns(e.target.checked)}
                  style={{ fontSize: 11 }}
                >
                  Show Dr/Cr
                </Checkbox>
              </Space>
            </Col>
          </Row>

          {/* Totals Summary */}
          <Divider style={{ margin: '12px 0' }} />
          <Row gutter={[24, 8]}>
            <Col>
              <Text type="secondary" style={{ fontSize: 10 }}>Entered Dr</Text>
              <Text strong style={{ fontSize: 12, display: 'block', color: REDWOOD.success }}>
                {formatNumber(totals.enteredDr)}
              </Text>
            </Col>
            <Col>
              <Text type="secondary" style={{ fontSize: 10 }}>Entered Cr</Text>
              <Text strong style={{ fontSize: 12, display: 'block', color: REDWOOD.primary }}>
                {formatNumber(totals.enteredCr)}
              </Text>
            </Col>
            <Col>
              <Text type="secondary" style={{ fontSize: 10 }}>Accounted Dr</Text>
              <Text strong style={{ fontSize: 12, display: 'block', color: REDWOOD.success }}>
                {formatNumber(totals.accountedDr)}
              </Text>
            </Col>
            <Col>
              <Text type="secondary" style={{ fontSize: 10 }}>Accounted Cr</Text>
              <Text strong style={{ fontSize: 12, display: 'block', color: REDWOOD.primary }}>
                {formatNumber(totals.accountedCr)}
              </Text>
            </Col>
            <Col>
              <Text type="secondary" style={{ fontSize: 10 }}>Net Balance</Text>
              <Text strong style={{ fontSize: 12, display: 'block', color: (totals.accountedDr - totals.accountedCr) >= 0 ? REDWOOD.success : REDWOOD.primary }}>
                {formatNumber(totals.accountedDr - totals.accountedCr)}
              </Text>
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
              </Tag>
            ))}
          </div>

          {/* Dropped segments with drop zones */}
          <div
            style={{
              marginTop: 12,
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
            <Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Pivot columns:</Text>

            {/* Drop zone BEFORE Account */}
            <div
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const segment = e.dataTransfer.getData('segment');
                if (segment) handleSegmentDrop(segment, 'before');
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
              {segmentsBeforeAccount.length === 0 && (
                <Text type="secondary" style={{ fontSize: 10 }}>Drop here (before)</Text>
              )}
              {segmentsBeforeAccount.map((segment) => (
                <Tag
                  key={segment}
                  closable
                  onClose={() => removeDroppedSegment(segment)}
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

            {/* Drop zone AFTER Account */}
            <div
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const segment = e.dataTransfer.getData('segment');
                if (segment) handleSegmentDrop(segment, 'after');
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
              {segmentsAfterAccount.length === 0 && (
                <Text type="secondary" style={{ fontSize: 10 }}>Drop here (after)</Text>
              )}
              {segmentsAfterAccount.map((segment) => (
                <Tag
                  key={segment}
                  closable
                  onClose={() => removeDroppedSegment(segment)}
                  style={{ fontSize: 11, margin: 0 }}
                  color="cyan"
                >
                  {getSegmentLabel(segment)}
                </Tag>
              ))}
            </div>

            {/* Period columns indicator */}
            <Tag style={{ fontSize: 11, margin: 0 }} color="green">
              Periods ({selectedPeriods.length})
            </Tag>
            <Tag style={{ fontSize: 11, margin: 0 }} color="orange">
              Total
            </Tag>
          </div>
        </Card>

        {/* Pivot Table */}
        <Card
          style={{ borderRadius: 8 }}
          bodyStyle={{ padding: 0 }}
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

          <Spin spinning={tab.loading}>
            <Table
              columns={pivotColumns}
              dataSource={pivotData}
              pagination={false}
              scroll={{ x: 800 }}
              size="small"
              className="compact-table"
              summary={() => {
                const periodTotals: { [key: string]: number } = {};
                selectedPeriods.forEach((period) => {
                  periodTotals[period] = pivotData.reduce(
                    (sum, row) => sum + ((row[period] as number) || 0),
                    0
                  );
                });
                const grandTotal = Object.values(periodTotals).reduce((a, b) => a + b, 0);

                // Calculate number of segment columns (before + account + after)
                const segmentColCount = segmentsBeforeAccount.length + 1 + segmentsAfterAccount.length;

                return (
                  <Table.Summary fixed>
                    <Table.Summary.Row style={{ background: REDWOOD.neutral100 }}>
                      <Table.Summary.Cell index={0} colSpan={segmentColCount}>
                        <Text strong style={{ fontSize: 11 }}>Total</Text>
                      </Table.Summary.Cell>
                      {selectedPeriods.map((period, idx) => (
                        <Table.Summary.Cell key={period} index={segmentColCount + idx} align="right">
                          <Text strong style={{ fontSize: 11, color: periodTotals[period] >= 0 ? REDWOOD.success : REDWOOD.primary }}>
                            {formatNumber(periodTotals[period])}
                          </Text>
                        </Table.Summary.Cell>
                      ))}
                      <Table.Summary.Cell index={segmentColCount + selectedPeriods.length} align="right">
                        <Text strong style={{ fontSize: 11, color: grandTotal >= 0 ? REDWOOD.success : REDWOOD.primary }}>
                          {formatNumber(grandTotal)}
                        </Text>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  </Table.Summary>
                );
              }}
            />
          </Spin>
        </Card>
      </div>
    );
  };

  // Render All Accounts Pivot tab
  const renderAllAccountsPivotTab = () => {
    const allPivotData = generateAllAccountsPivotData();
    const totals = calculateTotals(searchData);

    // Dynamic columns for all accounts pivot
    const allAccountsPivotColumns: ColumnsType<PivotDataRow> = [
      ...allAccountsPivotSegmentsBefore.map((segment) => ({
        title: getSegmentLabel(segment),
        dataIndex: segment,
        key: segment,
        width: 100,
        fixed: 'left' as const,
      })),
      {
        title: 'Account',
        dataIndex: 'account',
        key: 'account',
        width: 100,
        fixed: 'left' as const,
      },
      {
        title: 'Description',
        dataIndex: 'accountDescription',
        key: 'accountDescription',
        width: 180,
        fixed: 'left' as const,
        ellipsis: true,
      },
      ...allAccountsPivotSegmentsAfter.map((segment) => ({
        title: getSegmentLabel(segment),
        dataIndex: segment,
        key: segment,
        width: 100,
        fixed: 'left' as const,
      })),
      // Dynamic period columns - grouped by month with Debit, Credit, Balance
      ...selectedPeriods.map((period) => ({
        title: period,
        key: period,
        children: [
          {
            title: 'Debit',
            dataIndex: `${period}_Dr`,
            key: `${period}_Dr`,
            width: 100,
            align: 'right' as const,
            render: (v: number) => (
              <span style={{ color: REDWOOD.success }}>
                {formatNumber(v || 0)}
              </span>
            ),
          },
          {
            title: 'Credit',
            dataIndex: `${period}_Cr`,
            key: `${period}_Cr`,
            width: 100,
            align: 'right' as const,
            render: (v: number) => (
              <span style={{ color: REDWOOD.primary }}>
                {formatNumber(v || 0)}
              </span>
            ),
          },
          {
            title: 'Balance',
            key: `${period}_Balance`,
            width: 100,
            align: 'right' as const,
            render: (_: any, record: PivotDataRow) => {
              const dr = (record[`${period}_Dr`] as number) || 0;
              const cr = (record[`${period}_Cr`] as number) || 0;
              const balance = dr - cr;
              return (
                <span style={{ color: balance >= 0 ? REDWOOD.success : REDWOOD.primary }}>
                  {formatNumber(balance)}
                </span>
              );
            },
          },
        ],
      })),
      // Total columns grouped
      {
        title: 'Total',
        key: 'totals',
        fixed: 'right' as const,
        children: [
          {
            title: 'Debit',
            key: 'totalDr',
            width: 110,
            align: 'right' as const,
            render: (_: any, record: PivotDataRow) => {
              const totalDr = selectedPeriods.reduce(
                (sum, period) => sum + ((record[`${period}_Dr`] as number) || 0),
                0
              );
              return (
                <Text strong style={{ color: REDWOOD.success }}>
                  {formatNumber(totalDr)}
                </Text>
              );
            },
          },
          {
            title: 'Credit',
            key: 'totalCr',
            width: 110,
            align: 'right' as const,
            render: (_: any, record: PivotDataRow) => {
              const totalCr = selectedPeriods.reduce(
                (sum, period) => sum + ((record[`${period}_Cr`] as number) || 0),
                0
              );
              return (
                <Text strong style={{ color: REDWOOD.primary }}>
                  {formatNumber(totalCr)}
                </Text>
              );
            },
          },
          {
            title: 'Balance',
            key: 'totalBalance',
            width: 110,
            align: 'right' as const,
            render: (_: any, record: PivotDataRow) => {
              const totalBalance = selectedPeriods.reduce((sum, period) => {
                const dr = (record[`${period}_Dr`] as number) || 0;
                const cr = (record[`${period}_Cr`] as number) || 0;
                return sum + (dr - cr);
              }, 0);
              return (
                <Text strong style={{ color: totalBalance >= 0 ? REDWOOD.success : REDWOOD.primary }}>
                  {formatNumber(totalBalance)}
                </Text>
              );
            },
          },
        ],
      },
    ];

    return (
      <div style={{ padding: 16 }}>
        {/* Header */}
        <Card
          style={{ marginBottom: 16, borderRadius: 8 }}
          bodyStyle={{ padding: 12 }}
        >
          <Row gutter={[16, 8]} align="middle">
            <Col flex="auto">
              <Space split={<Divider type="vertical" />}>
                <div>
                  <Text type="secondary" style={{ fontSize: 10 }}>Ledger</Text>
                  <Text strong style={{ fontSize: 12, display: 'block' }}>{selectedLedger}</Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 10 }}>Company</Text>
                  <Text style={{ fontSize: 12, display: 'block' }}>{selectedCompany}</Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 10 }}>Periods</Text>
                  <Text style={{ fontSize: 12, display: 'block' }}>{selectedPeriods.join(', ')}</Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 10 }}>Total Records</Text>
                  <Text style={{ fontSize: 12, display: 'block' }}>{searchData.length}</Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 10 }}>Unique Accounts</Text>
                  <Text style={{ fontSize: 12, display: 'block' }}>{allPivotData.length}</Text>
                </div>
              </Space>
            </Col>
            <Col>
              <Button size="small" icon={<DownloadOutlined />}>
                Export
              </Button>
            </Col>
          </Row>

          {/* Totals Summary */}
          <Divider style={{ margin: '12px 0' }} />
          <Row gutter={[24, 8]}>
            <Col>
              <Text type="secondary" style={{ fontSize: 10 }}>Entered Dr</Text>
              <Text strong style={{ fontSize: 12, display: 'block', color: REDWOOD.success }}>
                {formatNumber(totals.enteredDr)}
              </Text>
            </Col>
            <Col>
              <Text type="secondary" style={{ fontSize: 10 }}>Entered Cr</Text>
              <Text strong style={{ fontSize: 12, display: 'block', color: REDWOOD.primary }}>
                {formatNumber(totals.enteredCr)}
              </Text>
            </Col>
            <Col>
              <Text type="secondary" style={{ fontSize: 10 }}>Accounted Dr</Text>
              <Text strong style={{ fontSize: 12, display: 'block', color: REDWOOD.success }}>
                {formatNumber(totals.accountedDr)}
              </Text>
            </Col>
            <Col>
              <Text type="secondary" style={{ fontSize: 10 }}>Accounted Cr</Text>
              <Text strong style={{ fontSize: 12, display: 'block', color: REDWOOD.primary }}>
                {formatNumber(totals.accountedCr)}
              </Text>
            </Col>
            <Col>
              <Text type="secondary" style={{ fontSize: 10 }}>Net Balance</Text>
              <Text strong style={{ fontSize: 12, display: 'block', color: (totals.accountedDr - totals.accountedCr) >= 0 ? REDWOOD.success : REDWOOD.primary }}>
                {formatNumber(totals.accountedDr - totals.accountedCr)}
              </Text>
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
                  background: (allAccountsPivotSegmentsBefore.includes(filter.segment) || allAccountsPivotSegmentsAfter.includes(filter.segment))
                    ? `${REDWOOD.info}15`
                    : REDWOOD.neutral100,
                  borderColor: (allAccountsPivotSegmentsBefore.includes(filter.segment) || allAccountsPivotSegmentsAfter.includes(filter.segment))
                    ? REDWOOD.info
                    : REDWOOD.neutral300,
                }}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('segment', filter.segment);
                }}
              >
                <DragOutlined style={{ marginRight: 4 }} />
                {filter.label}
              </Tag>
            ))}
          </div>

          {/* Dropped segments with drop zones */}
          <div
            style={{
              marginTop: 12,
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
            <Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Pivot columns:</Text>

            {/* Drop zone BEFORE Account */}
            <div
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const segment = e.dataTransfer.getData('segment');
                if (segment) handleAllAccountsSegmentDrop(segment, 'before');
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
              {allAccountsPivotSegmentsBefore.length === 0 && (
                <Text type="secondary" style={{ fontSize: 10 }}>Drop here (before)</Text>
              )}
              {allAccountsPivotSegmentsBefore.map((segment) => (
                <Tag
                  key={segment}
                  closable
                  onClose={() => removeAllAccountsDroppedSegment(segment)}
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

            {/* Drop zone AFTER Account */}
            <div
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const segment = e.dataTransfer.getData('segment');
                if (segment) handleAllAccountsSegmentDrop(segment, 'after');
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
              {allAccountsPivotSegmentsAfter.length === 0 && (
                <Text type="secondary" style={{ fontSize: 10 }}>Drop here (after)</Text>
              )}
              {allAccountsPivotSegmentsAfter.map((segment) => (
                <Tag
                  key={segment}
                  closable
                  onClose={() => removeAllAccountsDroppedSegment(segment)}
                  style={{ fontSize: 11, margin: 0 }}
                  color="cyan"
                >
                  {getSegmentLabel(segment)}
                </Tag>
              ))}
            </div>

            {/* Period columns indicator */}
            <Tag style={{ fontSize: 11, margin: 0 }} color="green">
              Periods ({selectedPeriods.length})
            </Tag>
            <Tag style={{ fontSize: 11, margin: 0 }} color="orange">
              Total
            </Tag>
          </div>
        </Card>

        {/* Pivot Table */}
        <Card
          style={{ borderRadius: 8 }}
          bodyStyle={{ padding: 0 }}
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
              <PieChartOutlined style={{ color: REDWOOD.info }} />
              <Text strong style={{ fontSize: 12 }}>All Accounts Pivot - Period Analysis</Text>
            </Space>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {allPivotData.length} accounts | Periods: {selectedPeriods.join(', ')}
            </Text>
          </div>

          <Table
            columns={allAccountsPivotColumns}
            dataSource={allPivotData}
            pagination={{ pageSize: 50, size: 'small', showSizeChanger: true, showTotal: (total) => `${total} accounts` }}
            scroll={{ x: 800 }}
            size="small"
            className="compact-table"
            summary={() => {
              // Calculate totals for Dr and Cr for each period
              const periodDrTotals: { [key: string]: number } = {};
              const periodCrTotals: { [key: string]: number } = {};
              selectedPeriods.forEach((period) => {
                periodDrTotals[period] = allPivotData.reduce(
                  (sum, row) => sum + ((row[`${period}_Dr`] as number) || 0),
                  0
                );
                periodCrTotals[period] = allPivotData.reduce(
                  (sum, row) => sum + ((row[`${period}_Cr`] as number) || 0),
                  0
                );
              });

              // Grand totals
              const grandTotalDr = Object.values(periodDrTotals).reduce((a, b) => a + b, 0);
              const grandTotalCr = Object.values(periodCrTotals).reduce((a, b) => a + b, 0);
              const grandBalance = grandTotalDr - grandTotalCr;

              const segmentColCount = allAccountsPivotSegmentsBefore.length + 2 + allAccountsPivotSegmentsAfter.length; // +2 for Account + Description

              return (
                <Table.Summary fixed>
                  <Table.Summary.Row style={{ background: REDWOOD.neutral100 }}>
                    <Table.Summary.Cell index={0} colSpan={segmentColCount}>
                      <Text strong style={{ fontSize: 11 }}>Total</Text>
                    </Table.Summary.Cell>
                    {/* Period columns: Debit, Credit, Balance for each period */}
                    {selectedPeriods.flatMap((period, idx) => {
                      const periodBalance = periodDrTotals[period] - periodCrTotals[period];
                      return [
                        <Table.Summary.Cell key={`${period}_Dr`} index={segmentColCount + idx * 3} align="right">
                          <Text strong style={{ fontSize: 11, color: REDWOOD.success }}>
                            {formatNumber(periodDrTotals[period])}
                          </Text>
                        </Table.Summary.Cell>,
                        <Table.Summary.Cell key={`${period}_Cr`} index={segmentColCount + idx * 3 + 1} align="right">
                          <Text strong style={{ fontSize: 11, color: REDWOOD.primary }}>
                            {formatNumber(periodCrTotals[period])}
                          </Text>
                        </Table.Summary.Cell>,
                        <Table.Summary.Cell key={`${period}_Bal`} index={segmentColCount + idx * 3 + 2} align="right">
                          <Text strong style={{ fontSize: 11, color: periodBalance === 0 ? REDWOOD.success : (periodBalance > 0 ? REDWOOD.success : REDWOOD.primary) }}>
                            {formatNumber(periodBalance)} {periodBalance === 0 ? '✓' : ''}
                          </Text>
                        </Table.Summary.Cell>,
                      ];
                    })}
                    {/* Total columns: Debit, Credit, Balance */}
                    <Table.Summary.Cell key="totalDr" index={segmentColCount + selectedPeriods.length * 3} align="right">
                      <Text strong style={{ fontSize: 11, color: REDWOOD.success }}>
                        {formatNumber(grandTotalDr)}
                      </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell key="totalCr" index={segmentColCount + selectedPeriods.length * 3 + 1} align="right">
                      <Text strong style={{ fontSize: 11, color: REDWOOD.primary }}>
                        {formatNumber(grandTotalCr)}
                      </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell key="totalBal" index={segmentColCount + selectedPeriods.length * 3 + 2} align="right">
                      <Text strong style={{ fontSize: 11, color: grandBalance === 0 ? REDWOOD.success : (grandBalance > 0 ? REDWOOD.success : REDWOOD.primary) }}>
                        {formatNumber(grandBalance)} {grandBalance === 0 ? '✓' : ''}
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
    // All accounts pivot tab (conditionally shown)
    ...(allAccountsPivotOpen
      ? [
          {
            key: 'all-accounts-pivot',
            label: (
              <span style={{ fontSize: 12 }}>
                <PieChartOutlined style={{ marginRight: 6 }} />
                All Accounts Pivot
              </span>
            ),
            children: renderAllAccountsPivotTab(),
            closable: true,
          },
        ]
      : []),
    ...accountTabs.map((tab) => ({
      key: tab.key,
      label: (
        <span style={{ fontSize: 12 }}>
          <FundOutlined style={{ marginRight: 6 }} />
          {tab.account}
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

        {/* Journal Detail Modal */}
        <Modal
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 24 }}>
              <span>{journalModalTitle}</span>
              <Space size="small">
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Showing {getFilteredModalData().length} of {journalModalData.length} records
                </Text>
                {Object.keys(journalModalFilters).some(k => journalModalFilters[k]) && (
                  <Button size="small" onClick={clearModalFilters}>
                    Clear Filters
                  </Button>
                )}
              </Space>
            </div>
          }
          open={journalModalVisible}
          onCancel={() => setJournalModalVisible(false)}
          footer={null}
          width={1400}
          style={{ top: 20 }}
        >
          <Table
            columns={journalDetailColumns}
            dataSource={getFilteredModalData()}
            pagination={{ pageSize: 15, size: 'small', showTotal: (total) => `${total} records` }}
            scroll={{ x: 1700 }}
            size="small"
            className="compact-table"
            summary={() => {
              const filteredData = getFilteredModalData();
              const totals = calculateTotals(filteredData);
              return (
                <Table.Summary fixed>
                  <Table.Summary.Row style={{ background: REDWOOD.neutral100 }}>
                    <Table.Summary.Cell index={0} colSpan={8}>
                      <Text strong style={{ fontSize: 11 }}>Total (filtered)</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={8} align="right">
                      <Text strong style={{ fontSize: 11, color: REDWOOD.success }}>
                        {formatNumber(totals.enteredDr)}
                      </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={9} align="right">
                      <Text strong style={{ fontSize: 11, color: REDWOOD.primary }}>
                        {formatNumber(totals.enteredCr)}
                      </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={10} align="right">
                      <Text strong style={{ fontSize: 11, color: REDWOOD.success }}>
                        {formatNumber(totals.accountedDr)}
                      </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={11} align="right">
                      <Text strong style={{ fontSize: 11, color: REDWOOD.primary }}>
                        {formatNumber(totals.accountedCr)}
                      </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={12} colSpan={2} />
                  </Table.Summary.Row>
                </Table.Summary>
              );
            }}
          />
        </Modal>

        {/* Account Lookup Modal */}
        <Modal
          title="Select Account"
          open={accountLookupVisible}
          onCancel={() => setAccountLookupVisible(false)}
          footer={null}
          width={700}
          style={{ top: 50 }}
        >
          <div style={{ marginBottom: 16 }}>
            <Input.Search
              placeholder="Search by account number or description..."
              value={accountSearchText}
              onChange={(e) => setAccountSearchText(e.target.value)}
              allowClear
              size="middle"
            />
          </div>
          <Table
            dataSource={filteredAccounts}
            loading={accountsLoading}
            size="small"
            pagination={{ pageSize: 10, size: 'small', showTotal: (total) => `${total} accounts` }}
            rowKey="account"
            onRow={(record) => ({
              onClick: () => handleAccountSelect(record.account),
              style: { cursor: 'pointer' },
            })}
            columns={[
              {
                title: 'Account',
                dataIndex: 'account',
                key: 'account',
                width: 120,
                render: (text: string) => <Text code style={{ fontSize: 12 }}>{text}</Text>,
              },
              {
                title: 'Description',
                dataIndex: 'description',
                key: 'description',
                render: (text: string) => <Text style={{ fontSize: 12 }}>{text}</Text>,
              },
              {
                title: 'Type',
                dataIndex: 'account_type',
                key: 'account_type',
                width: 80,
                render: (type: string) => {
                  const typeMap: Record<string, { label: string; color: string }> = {
                    'A': { label: 'Asset', color: 'blue' },
                    'L': { label: 'Liability', color: 'orange' },
                    'E': { label: 'Equity', color: 'purple' },
                    'R': { label: 'Revenue', color: 'green' },
                    'X': { label: 'Expense', color: 'red' },
                  };
                  const info = typeMap[type] || { label: type, color: 'default' };
                  return <Tag color={info.color} style={{ fontSize: 10 }}>{info.label}</Tag>;
                },
              },
            ]}
          />
        </Modal>
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
