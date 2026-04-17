import React, { useState, useEffect, useRef } from 'react';
import {
  Layout,
  Card,
  Form,
  Select,
  Input,
  InputNumber,
  Button,
  Space,
  Typography,
  Table,
  Tag,
  Row,
  Col,
  Breadcrumb,
  Tooltip,
  Dropdown,
  Collapse,
  message,
  Tabs,
  Modal,
  Spin,
  Descriptions,
  Alert,
  Progress,
} from 'antd';
import { APEX_DB_CONFIG } from '../../config/api.config';
import { postJournal, updateJournal, getLookupValues } from '../../services/manage-journals.service';
import type { MenuProps } from 'antd';
import {
  HomeOutlined,
  AccountBookOutlined,
  SearchOutlined,
  ReloadOutlined,
  SaveOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  DownOutlined,
  ExportOutlined,
  PrinterOutlined,
  EyeOutlined,
  RollbackOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  FilterOutlined,
  CheckSquareOutlined,
  BarChartOutlined,
  FileTextOutlined,
  SwapOutlined,
  ReconciliationOutlined,
  CalendarOutlined,
  AuditOutlined,
  DollarOutlined,
  ProfileOutlined,
  PieChartOutlined,
  LineChartOutlined,
  FundOutlined,
  CloseOutlined,
  BugOutlined,
  CopyOutlined,
  ApiOutlined,
  CheckOutlined,
  CloudOutlined,
  WarningOutlined,
  LoadingOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import Autopilot from '../../components/Autopilot';
import { validateAccountCode } from '../../components/AccountSelector';
import CreateJournal from './CreateJournal';

const { Content } = Layout;
const { Text } = Typography;
const { Option } = Select;
const { Panel } = Collapse;

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
  error: '#D93025',
  neutral600: '#6B6B6B',
  neutral900: '#1A1A1A',
  surface: '#FFFFFF',
  taskBlue: '#0572CE',
  reportGreen: '#1D7B4D',
};

// Menu item type for floating panels
interface FloatingMenuItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  description?: string;
  color?: string;
  path?: string;
}

// Task menu items
const taskMenuItems: FloatingMenuItem[] = [
  { key: 'account-analysis', icon: <FundOutlined />, label: 'Account Analysis', description: 'Account detail analysis', color: REDWOOD.warning, path: '/gl/account-analysis' },
  { key: 'manage-journals', icon: <AccountBookOutlined />, label: 'Manage Journals', description: 'Search and manage journal entries', color: REDWOOD.primary, path: '/gl/manage-journals' },
  { key: 'journal-entry', icon: <FileTextOutlined />, label: 'Create Journal', description: 'Create manual journal entry', color: REDWOOD.taskBlue, path: '/gl/create-journal' },
  { key: 'import-journals', icon: <SwapOutlined />, label: 'Import Journals', description: 'Import from spreadsheet', color: REDWOOD.info },
  { key: 'reverse-journal', icon: <ReconciliationOutlined />, label: 'Reverse Journal', description: 'Reverse posted journals', color: REDWOOD.warning },
  { key: 'open-period', icon: <CalendarOutlined />, label: 'Open Period', description: 'Open accounting period', color: REDWOOD.success },
  { key: 'close-period', icon: <AuditOutlined />, label: 'Close Period', description: 'Close accounting period', color: REDWOOD.primaryDark },
  { key: 'revaluation', icon: <DollarOutlined />, label: 'Run Revaluation', description: 'Foreign currency revaluation', color: REDWOOD.primary },
];

// Report menu items
const reportMenuItems: FloatingMenuItem[] = [
  { key: 'trial-balance', icon: <ProfileOutlined />, label: 'Trial Balance', description: 'View trial balance report', color: REDWOOD.reportGreen },
  { key: 'balance-sheet', icon: <PieChartOutlined />, label: 'Balance Sheet', description: 'Financial position report', color: REDWOOD.info },
  { key: 'income-statement', icon: <LineChartOutlined />, label: 'Income Statement', description: 'Profit and loss report', color: REDWOOD.success },
  { key: 'journal-report', icon: <FileTextOutlined />, label: 'Journal Report', description: 'Posted journals listing', color: REDWOOD.taskBlue },
  { key: 'account-analysis', icon: <FundOutlined />, label: 'Account Analysis', description: 'Account detail analysis', color: REDWOOD.warning },
  { key: 'gl-balances', icon: <BarChartOutlined />, label: 'GL Balances', description: 'General ledger balances', color: REDWOOD.primary },
];

// API Base URL
const API_BASE_URL = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/gl/journals';

// Ledger interface from API
interface Ledger {
  ledger_id: number;
  ledger_name: string;
  description: string;
  ledger_category_code: string;
  currency_code: string;
  chart_of_accounts_id: string;
}

// Period interface from API
interface Period {
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

// Journal data interface matching API response
interface JournalLine {
  lineId: number;
  lineNum: number;
  account: string;
  description: string;
  enteredDr: number;
  enteredCr: number;
  accountedDr: number;
  accountedCr: number;
  currency: string;
  accountDescription?: string;
}

interface JournalRecord {
  key: string;
  // Batch fields
  batchId: number;
  jeBatchId: number;
  batchName: string;
  batchDescription: string;
  source: string;
  status: string;
  statusMeaning: string;
  approvalStatusMeaning: string;
  postedDate: string | null;
  // Header fields
  headerId: number;
  jeHeaderId: number;
  journalName: string;
  journalDescription: string;
  periodName: string;
  category: string;
  ledgerName: string;
  legalEntityName: string;
  currencyCode: string;
  enteredDebit: number;
  enteredCredit: number;
  accountedDebit: number;
  accountedCredit: number;
  effectiveDate: string;
  externalReference: string;
  creationDate: string;
  // Lines
  lines: JournalLine[];
}

interface ApiResponse {
  success: boolean;
  totalCount: number;
  offset: number;
  limit: number;
  items: JournalRecord[];
  error?: string;
}

// Note: Ledgers and Periods are now fetched from API dynamically

// Batch statuses
const batchStatuses = ['Posted', 'Unposted', 'Error', 'Pending', 'All'];

// Operators
const operators = ['Starts with', 'Equals', 'Contains', 'Ends with'];

// Session storage key for preserving search data
const STORAGE_KEY = 'manageJournals_searchData';

// Interface for open journal tabs
interface OpenJournalTab {
  key: string;
  journal: JournalRecord;
}

// Debug log entry
interface DebugLogEntry {
  timestamp: string;
  type: 'request' | 'response' | 'info' | 'error';
  message: string;
  data?: any;
}

// Bulk post item
type BulkPostStatus = 'pending' | 'posting' | 'posted' | 'validation_failed' | 'failed' | 'skipped';
interface BulkPostItem {
  key: string;
  journal: JournalRecord;
  status: BulkPostStatus;
  validationErrors: string[];
  serverError?: string;
}

const ManageJournals: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [journals, setJournals] = useState<JournalRecord[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchExpanded, setSearchExpanded] = useState<string[]>(['search']);

  // Ledger and Period state
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [selectedLedger, setSelectedLedger] = useState<Ledger | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loadingLedgers, setLoadingLedgers] = useState(false);
  const [loadingPeriods, setLoadingPeriods] = useState(false);

  // Debug log state
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const [debugModalVisible, setDebugModalVisible] = useState(false);

  // Bulk post state
  const [bulkPostVisible, setBulkPostVisible] = useState(false);
  const [bulkPostItems, setBulkPostItems] = useState<BulkPostItem[]>([]);
  const [bulkPostRunning, setBulkPostRunning] = useState(false);
  const [bulkPostDone, setBulkPostDone] = useState(false);

  // Tab management state
  const [activeTabKey, setActiveTabKey] = useState('search');
  const [openJournalTabs, setOpenJournalTabs] = useState<OpenJournalTab[]>([]);
  const [createJournalTabOpen, setCreateJournalTabOpen] = useState(false);

  // API indicator — tracks the last URL called during search
  const [lastSearchUrl, setLastSearchUrl] = useState<string | null>(null);
  const [lastSearchStatus, setLastSearchStatus] = useState<number | null>(null);
  const [apiUrlCopied, setApiUrlCopied] = useState(false);

  // Journal panel expanded/collapsed state per tab (for Show More/Show Less)
  const [journalExpandedState, setJournalExpandedState] = useState<Record<string, boolean>>({});
  const [activeDetailTabState, setActiveDetailTabState] = useState<Record<string, string>>({});

  // Per-tab editable state for unposted journals
  const [editableLines, setEditableLines] = useState<Record<string, JournalLine[]>>({});
  const [editableJournalFields, setEditableJournalFields] = useState<Record<string, {
    batchDescription: string;
    journalDescription: string;
    category: string;
    currencyCode: string;
    conversionRate: number;
    conversionRateType: string;
  }>>({});
  const [tabSaving, setTabSaving] = useState<Record<string, boolean>>({});
  const [tabPosting, setTabPosting] = useState<Record<string, boolean>>({});
  const [selectedLinesByTab, setSelectedLinesByTab] = useState<Record<string, number[]>>({});

  // Lookup data for journal edit dropdowns
  const [journalCategories, setJournalCategories] = useState<string[]>([]);

  // Journal Entry view modal state
  const [journalViewModalVisible, setJournalViewModalVisible] = useState(false);
  const [selectedJournalForView, setSelectedJournalForView] = useState<JournalRecord | null>(null);
  // account combo → natural account description (loaded when view modal opens)
  const [accountDescMap, setAccountDescMap] = useState<Record<string, string>>({});

  // AP transaction drill-down modal state
  const [apTransactionModalVisible, setApTransactionModalVisible] = useState(false);
  const [apTransactionLoading, setApTransactionLoading] = useState(false);
  const [apTransactionData, setApTransactionData] = useState<any>(null);
  const [apTransactionType, setApTransactionType] = useState<'invoice' | 'payment' | null>(null);
  const [apTransactionLastUrl, setApTransactionLastUrl] = useState<string | null>(null);
  const [apTransactionCopied, setApTransactionCopied] = useState(false);
  const [apTransactionError, setApTransactionError] = useState<string | null>(null);
  const [apTransactionLines, setApTransactionLines] = useState<any[]>([]);
  const [apTransactionLinesLoading, setApTransactionLinesLoading] = useState(false);
  const [apLineDescMap, setApLineDescMap] = useState<Record<string, string>>({});

  // Floating panel state
  const [activePanel, setActivePanel] = useState<'none' | 'tasks' | 'reports'>('none');
  const [isClosing, setIsClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const floatingIconsRef = useRef<HTMLDivElement>(null);

  // Restore search data from sessionStorage on mount
  useEffect(() => {
    const savedData = sessionStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const { journals: savedJournals, totalCount: savedTotal, formValues } = JSON.parse(savedData);
        if (savedJournals && savedJournals.length > 0) {
          setJournals(savedJournals);
          setTotalCount(savedTotal);
          setSearchExpanded([]); // Collapse search when data exists
          if (formValues) {
            form.setFieldsValue(formValues);
          }
        }
      } catch (e) {
        console.error('Error restoring search data:', e);
      }
    }
  }, []);

  // Fetch ledgers on component mount
  useEffect(() => {
    const fetchLedgers = async () => {
      setLoadingLedgers(true);
      try {
        const response = await fetch('https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/ledgers');
        const data = await response.json();
        if (data.items && data.items.length > 0) {
          setLedgers(data.items);
          // Auto-select first ledger
          const firstLedger = data.items[0];
          setSelectedLedger(firstLedger);
          // Set form field value
          form.setFieldsValue({ ledger: firstLedger.ledger_name });
        }
      } catch (error) {
        console.error('Error fetching ledgers:', error);
        message.error('Failed to fetch ledgers');
      } finally {
        setLoadingLedgers(false);
      }
    };
    fetchLedgers();
  }, []);

  // Fetch periods when ledger changes
  useEffect(() => {
    if (!selectedLedger) return;

    const fetchPeriods = async () => {
      setLoadingPeriods(true);
      try {
        const encodedLedgerName = encodeURIComponent(selectedLedger.ledger_name);
        const response = await fetch(
          `https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/periodsstatus/create?P_LEDGER_NAME=${encodedLedgerName}&P_APPLICATION_NAME=General Ledger`
        );
        const data = await response.json();
        if (data.items && data.items.length > 0) {
          // Sort periods by year desc, then period_number desc
          const sortedPeriods = data.items.sort((a: Period, b: Period) => {
            if (b.period_year !== a.period_year) return b.period_year - a.period_year;
            return b.period_number - a.period_number;
          });
          setPeriods(sortedPeriods);
          // Auto-select first open period
          const currentPeriod = sortedPeriods.find((p: Period) => p.status === 'Open') || sortedPeriods[0];
          if (currentPeriod) {
            form.setFieldsValue({ accountingPeriod: currentPeriod.period_name_id });
          }
        }
      } catch (error) {
        console.error('Error fetching periods:', error);
        message.error('Failed to fetch periods');
      } finally {
        setLoadingPeriods(false);
      }
    };
    fetchPeriods();
  }, [selectedLedger]);

  // Fetch journal categories for the edit dropdown
  useEffect(() => {
    getLookupValues('categories').then(items => {
      setJournalCategories(items.map(i => i.label));
    }).catch(() => {});
  }, []);

  // Handle ledger selection change
  const handleLedgerChange = (ledgerName: string) => {
    const ledger = ledgers.find(l => l.ledger_name === ledgerName);
    if (ledger) {
      setSelectedLedger(ledger);
      // Clear period selection when ledger changes
      form.setFieldsValue({ accountingPeriod: undefined });
      setPeriods([]);
    }
  };

  // Click outside handler for floating panels
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

  // Load natural account descriptions for AP drill-down invoice lines
  useEffect(() => {
    if (apTransactionLines.length === 0) return;
    const uniqueCombos = [...new Set(
      apTransactionLines.map(l => l.distribution_combination).filter(Boolean)
    )];
    if (uniqueCombos.length === 0) return;

    const newMap: Record<string, string> = {};
    Promise.all(
      uniqueCombos.map(async (combo: string) => {
        try {
          const result = await validateAccountCode(combo);
          const naturalValue = combo.split('-')[3] || '';
          const found = Object.values(result.segmentDetails).find(
            s => s.value === naturalValue && s.name.toLowerCase().includes('account')
          ) || Object.values(result.segmentDetails).find(s => s.value === naturalValue);
          if (found?.description) newMap[combo] = found.description;
        } catch (_) { /* silent */ }
      })
    ).then(() => setApLineDescMap(prev => ({ ...prev, ...newMap })));
  }, [apTransactionLines]);

  // Load natural account descriptions when view modal opens
  useEffect(() => {
    if (!journalViewModalVisible || !selectedJournalForView) return;
    const lines = selectedJournalForView.lines || [];
    const uniqueAccounts = [...new Set(lines.map(l => l.account).filter(Boolean))];
    if (uniqueAccounts.length === 0) return;

    const newMap: Record<string, string> = {};
    Promise.all(
      uniqueAccounts.map(async (account) => {
        try {
          const result = await validateAccountCode(account);
          // Natural account is segment index 3 — find by matching its value to parts[3]
          const naturalValue = account.split('-')[3] || '';
          const found = Object.values(result.segmentDetails).find(
            s => s.value === naturalValue && s.name.toLowerCase().includes('account')
          ) || Object.values(result.segmentDetails).find(s => s.value === naturalValue);
          if (found?.description) newMap[account] = found.description;
        } catch (_) { /* silent */ }
      })
    ).then(() => setAccountDescMap(prev => ({ ...prev, ...newMap })));
  }, [journalViewModalVisible, selectedJournalForView]);

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

  const handleMenuItemClick = (_key: string, path?: string) => {
    closePanel();
    if (path) {
      navigate(path);
    }
  };

  // Open journal in a new tab
  const openJournalTab = (journal: JournalRecord) => {
    const tabKey = `journal-${journal.jeHeaderId}`;

    // Check if tab is already open
    const existingTab = openJournalTabs.find(tab => tab.key === tabKey);
    if (existingTab) {
      // Just switch to existing tab
      setActiveTabKey(tabKey);
      return;
    }

    // Initialize editable state for unposted journals
    if (journal.statusMeaning !== 'Posted') {
      setEditableLines(prev => ({
        ...prev,
        [tabKey]: JSON.parse(JSON.stringify(journal.lines || [])),
      }));
      setEditableJournalFields(prev => ({
        ...prev,
        [tabKey]: {
          batchDescription: journal.batchDescription || '',
          journalDescription: journal.journalDescription || '',
          category: journal.category || '',
          currencyCode: journal.currencyCode || '',
          conversionRate: 1,
          conversionRateType: 'User',
        },
      }));
    }

    // Add new tab
    setOpenJournalTabs(prev => [...prev, { key: tabKey, journal }]);
    setActiveTabKey(tabKey);
  };

  // Close journal tab
  const closeJournalTab = (tabKey: string) => {
    const newTabs = openJournalTabs.filter(tab => tab.key !== tabKey);
    setOpenJournalTabs(newTabs);

    // Clean up editable state for this tab
    setEditableLines(prev => { const n = { ...prev }; delete n[tabKey]; return n; });
    setEditableJournalFields(prev => { const n = { ...prev }; delete n[tabKey]; return n; });
    setTabSaving(prev => { const n = { ...prev }; delete n[tabKey]; return n; });
    setTabPosting(prev => { const n = { ...prev }; delete n[tabKey]; return n; });
    setSelectedLinesByTab(prev => { const n = { ...prev }; delete n[tabKey]; return n; });

    // If closing active tab, switch to search or last tab
    if (activeTabKey === tabKey) {
      if (newTabs.length > 0) {
        setActiveTabKey(newTabs[newTabs.length - 1].key);
      } else {
        setActiveTabKey('search');
      }
    }
  };

  // Handle tab change
  const onTabChange = (key: string) => {
    setActiveTabKey(key);
  };

  // Handle tab edit (close)
  const onTabEdit = (targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => {
    if (action === 'remove' && typeof targetKey === 'string') {
      if (targetKey === 'create-journal') {
        setCreateJournalTabOpen(false);
        setActiveTabKey('search');
      } else {
        closeJournalTab(targetKey);
      }
    }
  };

  // Open the Create Journal in-app tab
  const openCreateJournalTab = () => {
    setCreateJournalTabOpen(true);
    setActiveTabKey('create-journal');
  };

  // Add debug log helper
  const addDebugLog = (type: DebugLogEntry['type'], message: string, data?: any) => {
    const entry: DebugLogEntry = {
      timestamp: new Date().toISOString(),
      type,
      message,
      data,
    };
    setDebugLogs(prev => [...prev, entry]);
    console.log(`[DEBUG ${type.toUpperCase()}] ${message}`, data || '');
  };

  // Search handler - calls the API with pagination to get ALL records
  const handleSearch = async () => {
    const values = form.getFieldsValue();

    // Clear previous debug logs
    setDebugLogs([]);

    // Validate required fields
    if (!values.ledger) {
      message.error('Ledger is required');
      return;
    }
    if (!values.accountingPeriod) {
      message.error('Accounting Period is required');
      return;
    }

    setLoading(true);
    setJournals([]); // Clear existing data

    addDebugLog('info', 'Starting search...', values);

    try {
      // Build base query parameters
      const baseParams = new URLSearchParams();
      baseParams.append('ledger', values.ledger);
      baseParams.append('period', values.accountingPeriod);

      if (values.journalBatch) {
        baseParams.append('batchName', values.journalBatch);
      }
      if (values.journalDescription) {
        baseParams.append('journalDesc', values.journalDescription);
      }
      if (values.source) {
        baseParams.append('source', values.source);
      }
      if (values.batchStatus && values.batchStatus !== 'All') {
        baseParams.append('statusMeaning', values.batchStatus);
      }

      // Fetch with pagination - get ALL records
      const PAGE_SIZE = 500; // ORDS default max
      let offset = 0;
      let allItems: JournalRecord[] = [];
      let hasMore = true;
      let pageCount = 0;

      addDebugLog('info', `Starting paginated fetch with PAGE_SIZE=${PAGE_SIZE}`);

      while (hasMore) {
        pageCount++;
        // Add pagination params
        const params = new URLSearchParams(baseParams);
        params.append('offset', offset.toString());
        params.append('limit', PAGE_SIZE.toString());

        const url = `${API_BASE_URL}/headers?${params.toString()}`;

        // Always expose the first-page URL in the API indicator
        if (pageCount === 1) {
          setLastSearchUrl(url);
          setLastSearchStatus(null);
        }

        addDebugLog('request', `Page ${pageCount} - GET Request`, { url, offset, limit: PAGE_SIZE });

        const response = await fetch(url);
        const responseText = await response.text();

        setLastSearchStatus(response.status);

        addDebugLog('response', `Page ${pageCount} - Raw response`, {
          responseLength: responseText.length,
          first500Chars: responseText.substring(0, 500),
          last200Chars: responseText.substring(responseText.length - 200),
        });

        // Guard: ORDS returns an HTML error page when the endpoint doesn't exist
        if (!response.ok || responseText.trimStart().startsWith('<')) {
          addDebugLog('error', `Page ${pageCount} - Non-JSON response (HTTP ${response.status})`, {
            url,
            first300: responseText.substring(0, 300),
          });
          message.error(`API error (HTTP ${response.status}): endpoint returned HTML instead of JSON. Check the ORDS route exists.`);
          hasMore = false;
          break;
        }

        const data: ApiResponse = JSON.parse(responseText);

        // Log first 3 items to see the data structure
        const sampleItems = (data.items || []).slice(0, 3).map((item: any) => ({
          batchId: item.batchId,
          jeBatchId: item.jeBatchId,
          headerId: item.headerId,
          jeHeaderId: item.jeHeaderId,
          batchName: item.batchName,
          journalName: item.journalName,
        }));

        addDebugLog('response', `Page ${pageCount} - Response received`, {
          success: data.success,
          itemsReturnedFromApi: data.items?.length || 0,
          apiTotalCount: data.totalCount,
          apiOffset: data.offset,
          apiLimit: data.limit,
          sampleItems: sampleItems,
          note: 'API totalCount may be wrong - we count actual items instead',
        });

        if (data.success) {
          const items = data.items || [];

          // Count actual items returned (not trusting API totalCount)
          const actualItemCount = items.length;

          // Group items by source to see distribution
          const sourceGroups: Record<string, number> = {};
          items.forEach((item: any) => {
            const source = item.source || 'UNKNOWN';
            sourceGroups[source] = (sourceGroups[source] || 0) + 1;
          });

          addDebugLog('info', `Page ${pageCount} - Items by Source`, {
            totalItems: actualItemCount,
            bySource: sourceGroups,
          });

          // Generate unique keys - use combination of fields to ensure uniqueness
          const mappedItems = items.map((item: any, index: number) => {
            // Try multiple ID fields for uniqueness
            const uniqueKey = item.headerId || item.jeHeaderId || item.batchId || item.jeBatchId || `page${pageCount}_idx${index}`;
            return {
              ...item,
              key: `${uniqueKey}_${offset + index}`, // Always append index to guarantee uniqueness
            };
          });

          allItems = [...allItems, ...mappedItems];

          // Check for duplicate keys
          const keys = allItems.map(item => item.key);
          const uniqueKeys = new Set(keys);
          const hasDuplicates = keys.length !== uniqueKeys.size;

          addDebugLog('info', `Page ${pageCount} processed`, {
            actualItemsThisPage: actualItemCount,
            totalItemsSoFar: allItems.length,
            uniqueKeysCount: uniqueKeys.size,
            hasDuplicateKeys: hasDuplicates,
            apiReportedTotal: data.totalCount,
            note: hasDuplicates ? 'WARNING: Duplicate keys detected!' : 'Keys are unique',
          });

          // Check if there are more pages
          // ONLY stop if we got LESS than PAGE_SIZE items (meaning no more data)
          if (actualItemCount < PAGE_SIZE) {
            hasMore = false;
            addDebugLog('info', `Pagination complete - no more pages`, {
              reason: `Got ${actualItemCount} items (less than PAGE_SIZE=${PAGE_SIZE})`,
              finalCount: allItems.length,
            });
          } else {
            // Got full page, there might be more
            offset += PAGE_SIZE;
            addDebugLog('info', `Got full page (${actualItemCount} items), fetching more at offset: ${offset}`);
          }
        } else {
          addDebugLog('error', 'API returned error', { error: data.error });
          message.error(data.error || 'Failed to fetch journals');
          hasMore = false;
        }
      }

      // Final check for unique keys before setting state
      const finalKeys = allItems.map(item => item.key);
      const finalUniqueKeys = new Set(finalKeys);

      // Final summary by source
      const finalSourceGroups: Record<string, number> = {};
      allItems.forEach((item: any) => {
        const source = item.source || 'UNKNOWN';
        finalSourceGroups[source] = (finalSourceGroups[source] || 0) + 1;
      });

      addDebugLog('info', `FINAL SUMMARY - All items by Source`, {
        totalItems: allItems.length,
        bySource: finalSourceGroups,
      });

      addDebugLog('info', `Setting state with data`, {
        totalItemsToSet: allItems.length,
        uniqueKeys: finalUniqueKeys.size,
        hasDuplicates: finalKeys.length !== finalUniqueKeys.size,
        firstFewKeys: finalKeys.slice(0, 5),
        lastFewKeys: finalKeys.slice(-3),
      });

      // Set all fetched data
      setJournals(allItems);
      setTotalCount(allItems.length);

      addDebugLog('info', `Search complete`, {
        totalPages: pageCount,
        actualTotalRecords: allItems.length,
        note: 'Data set to state - check React DevTools if UI shows fewer rows',
      });

      // Save to sessionStorage for persistence
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        journals: allItems,
        totalCount: allItems.length,
        formValues: values,
      }));

      message.success(`Found ${allItems.length} journals`);

    } catch (error) {
      addDebugLog('error', 'Fetch error', { error: String(error) });
      console.error('Error fetching journals:', error);
      message.error('Failed to connect to server');
      setJournals([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  // Reset handler
  const handleReset = () => {
    form.resetFields();
    setJournals([]);
    setTotalCount(0);
    setSelectedRowKeys([]);
    sessionStorage.removeItem(STORAGE_KEY);
  };

  // Open Journal Entry modal
  const handleViewJournalEntry = (journal: JournalRecord) => {
    setSelectedJournalForView(journal);
    setJournalViewModalVisible(true);
  };

  // AP transaction drill-down: fetch invoice or payment by reference
  const handleTransactionDrilldown = async (journal: JournalRecord, line: JournalLine) => {
    const category = (journal.category || '').toLowerCase();

    // Build reference: prefer externalReference, fall back to extracting from journalName, then line.description
    let reference = journal.externalReference || '';
    if (!reference) {
      // Try to extract invoice number from journalName (format: "AP Invoice {number}")
      const nameMatch = (journal.journalName || '').match(/^AP\s+(?:Invoice|Payment)\s+(.+)$/i);
      if (nameMatch) reference = nameMatch[1].trim();
    }
    if (!reference) reference = line.description || '';

    console.log('[View Transaction] Debug info:', {
      journalName: journal.journalName,
      source: journal.source,
      category: journal.category,
      externalReference: journal.externalReference,
      lineDescription: line.description,
      resolvedReference: reference,
    });

    // Always open the modal so the user can see what's happening
    setApTransactionData(null);
    setApTransactionError(null);
    setApTransactionLastUrl(null);
    setApTransactionLoading(true);
    setApTransactionModalVisible(true);

    if (!reference) {
      setApTransactionLoading(false);
      setApTransactionError(
        `No reference found. Check: externalReference="${journal.externalReference}", journalName="${journal.journalName}", lineDescription="${line.description}"`
      );
      return;
    }

    try {
      let url: string;
      let transType: 'invoice' | 'payment';

      if (category.includes('payment')) {
        transType = 'payment';
        url = `${APEX_DB_CONFIG.baseUrl}/ap/payments?payment_number=${encodeURIComponent(reference)}`;
      } else {
        transType = 'invoice';
        url = `${APEX_DB_CONFIG.baseUrl}/ap/createinvoice?invoice_number=${encodeURIComponent(reference)}`;
      }

      console.log('[View Transaction] API call:', { transType, url });

      setApTransactionType(transType);
      setApTransactionLastUrl(url);
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      const data = await response.json();
      const items = data.items || (Array.isArray(data) ? data : [data]);

      console.log('[View Transaction] API response:', { itemCount: items.length, firstItem: items[0] });

      if (items.length > 0) {
        const header = items[0];
        setApTransactionData(header);

        // Fetch invoice lines if this is an invoice (not a payment)
        if (transType === 'invoice') {
          const invoiceId = header.invoice_id || header.invoiceId;
          if (invoiceId) {
            setApTransactionLinesLoading(true);
            try {
              const linesUrl = `${APEX_DB_CONFIG.baseUrl}/ap/createinvoiceslines?P_INVOICE_ID=${invoiceId}`;
              console.log('[View Transaction] Fetching lines:', linesUrl);
              const linesRes = await fetch(linesUrl, { headers: { Accept: 'application/json' } });
              const linesData = await linesRes.json();
              const lineItems = linesData.items || (Array.isArray(linesData) ? linesData : []);
              console.log('[View Transaction] Lines response:', { count: lineItems.length, sample: lineItems[0] });
              setApTransactionLines(lineItems);
            } catch (lineErr) {
              console.error('[View Transaction] Lines fetch error:', lineErr);
            } finally {
              setApTransactionLinesLoading(false);
            }
          }
        }
      } else {
        setApTransactionError(`No AP transaction found for reference: "${reference}"`);
      }
    } catch (err) {
      console.error('[View Transaction] Fetch error:', err);
      setApTransactionError(`Failed to load transaction: ${String(err)}`);
    } finally {
      setApTransactionLoading(false);
    }
  };

  // Get status tag color
  const getBatchStatusTag = (status: string) => {
    const statusLower = status?.toLowerCase() || '';
    const config: Record<string, { color: string; icon: React.ReactNode }> = {
      posted: { color: REDWOOD.success, icon: <CheckCircleOutlined /> },
      unposted: { color: REDWOOD.warning, icon: <ClockCircleOutlined /> },
      error: { color: REDWOOD.primary, icon: <CloseCircleOutlined /> },
      pending: { color: REDWOOD.info, icon: <ClockCircleOutlined /> },
    };
    const cfg = config[statusLower] || { color: REDWOOD.neutral600, icon: null };
    return (
      <Tag color={cfg.color} icon={cfg.icon} style={{ borderRadius: 4 }}>
        {status || 'Unknown'}
      </Tag>
    );
  };

  // Get approval status tag
  const getApprovalStatusTag = (status: string) => {
    const config: Record<string, string> = {
      'Approved': REDWOOD.success,
      'Pending': REDWOOD.warning,
      'Rejected': REDWOOD.primary,
      'Not required': REDWOOD.neutral600,
    };
    return (
      <Tag color={config[status] || REDWOOD.neutral600} style={{ borderRadius: 4 }}>
        {status || 'Not required'}
      </Tag>
    );
  };

  // Format currency
  const formatCurrency = (value: number, currency: string = 'AED') => {
    if (value === null || value === undefined) return '-';
    return `${value.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${currency}`;
  };

  // Table columns
  const columns: ColumnsType<JournalRecord> = [
    {
      title: 'Journal',
      dataIndex: 'journalName',
      key: 'journalName',
      width: 200,
      fixed: 'left',
      render: (text, record) => (
        record.statusMeaning === 'Posted' ? (
          <Tooltip title="Posted — view only">
            <a
              style={{ color: REDWOOD.neutral600, fontWeight: 500 }}
              onClick={() => openJournalTab(record)}
            >
              {text || '-'}
            </a>
          </Tooltip>
        ) : (
          <a
            style={{ color: REDWOOD.info, fontWeight: 500 }}
            onClick={() => openJournalTab(record)}
          >
            {text || '-'}
          </a>
        )
      ),
      sorter: (a, b) => (a.journalName || '').localeCompare(b.journalName || ''),
    },
    {
      title: 'Journal Batch',
      dataIndex: 'batchName',
      key: 'batchName',
      width: 250,
      ellipsis: true,
      render: (text, record) => {
        const batchName = text || record.batchDescription || '-';
        return (
          <a
            style={{ color: REDWOOD.info }}
            onClick={() => openJournalTab(record)}
          >
            {batchName}
          </a>
        );
      },
    },
    {
      title: 'Accounting Period',
      dataIndex: 'periodName',
      key: 'periodName',
      width: 130,
      sorter: (a, b) => (a.periodName || '').localeCompare(b.periodName || ''),
    },
    {
      title: 'Source',
      dataIndex: 'source',
      key: 'source',
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: 'Entered Debit',
      dataIndex: 'enteredDebit',
      key: 'enteredDebit',
      width: 150,
      align: 'right',
      render: (value, record) => formatCurrency(value, record.currencyCode),
      sorter: (a, b) => (a.enteredDebit || 0) - (b.enteredDebit || 0),
    },
    {
      title: 'Entered Credit',
      dataIndex: 'enteredCredit',
      key: 'enteredCredit',
      width: 150,
      align: 'right',
      render: (value, record) => formatCurrency(value, record.currencyCode),
      sorter: (a, b) => (a.enteredCredit || 0) - (b.enteredCredit || 0),
    },
    {
      title: 'Batch Status',
      dataIndex: 'statusMeaning',
      key: 'statusMeaning',
      width: 120,
      render: (status) => getBatchStatusTag(status),
      filters: batchStatuses.filter(s => s !== 'All').map(s => ({ text: s, value: s })),
      onFilter: (value, record) => record.statusMeaning === value,
    },
    {
      title: 'Currency',
      dataIndex: 'currencyCode',
      key: 'currencyCode',
      width: 80,
      render: (text) => text || '-',
    },
    {
      title: 'Ledger',
      dataIndex: 'ledgerName',
      key: 'ledgerName',
      width: 150,
      render: (text) => text || '-',
    },
    {
      title: 'Approval Status',
      dataIndex: 'approvalStatusMeaning',
      key: 'approvalStatusMeaning',
      width: 130,
      render: (status) => getApprovalStatusTag(status),
    },
    {
      title: 'Posted Date',
      dataIndex: 'postedDate',
      key: 'postedDate',
      width: 110,
      render: (text) => text || '-',
    },
    {
      title: 'JE Batch ID',
      dataIndex: 'jeBatchId',
      key: 'jeBatchId',
      width: 120,
      render: (text) => <Text code>{text || '-'}</Text>,
    },
    {
      title: 'Batch ID',
      dataIndex: 'batchId',
      key: 'batchId',
      width: 100,
      render: (text) => <Text code>{text || '-'}</Text>,
    },
    {
      title: 'Header ID',
      dataIndex: 'headerId',
      key: 'headerId',
      width: 100,
      render: (text) => <Text code>{text || '-'}</Text>,
    },
  ];

  // Actions dropdown menu
  const actionsMenu: MenuProps['items'] = [
    { key: 'view', label: 'View', icon: <EyeOutlined /> },
    { key: 'edit', label: 'Edit', icon: <EditOutlined /> },
    { type: 'divider' },
    { key: 'post', label: 'Post Batch', icon: <CheckCircleOutlined /> },
    { key: 'reverse', label: 'Reverse Batch', icon: <RollbackOutlined /> },
    { type: 'divider' },
    { key: 'export', label: 'Export', icon: <ExportOutlined /> },
    { key: 'print', label: 'Print', icon: <PrinterOutlined /> },
  ];

  // Row selection
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  };

  // ── Bulk Post helpers ──────────────────────────────────────────────────────

  // Client-side validation for a single journal before bulk posting
  const validateForBulkPost = (journal: JournalRecord): string[] => {
    const errors: string[] = [];
    const lines = journal.lines || [];
    const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (lines.length === 0) {
      errors.push('No journal lines found.');
    } else {
      const dr = lines.reduce((s, l) => s + (l.enteredDr || 0), 0);
      const cr = lines.reduce((s, l) => s + (l.enteredCr || 0), 0);
      if (Math.abs(dr - cr) > 0.01) {
        errors.push(`Out of balance — Debit ${fmt(dr)} ≠ Credit ${fmt(cr)} (diff ${fmt(Math.abs(dr - cr))}).`);
      }
      const blank = lines.filter(l => !l.account?.trim()).length;
      if (blank > 0) errors.push(`${blank} line(s) have no account code.`);
      const zero = lines.filter(l => (l.enteredDr || 0) === 0 && (l.enteredCr || 0) === 0).length;
      if (zero > 0) errors.push(`${zero} line(s) have zero Debit and Credit.`);
    }

    const periodRecord = periods.find(p => p.period_name_id === journal.periodName);
    if (periodRecord && periodRecord.status !== 'Open') {
      errors.push(`Period "${journal.periodName}" is ${periodRecord.status} — must be Open.`);
    }
    return errors;
  };

  // Open the bulk post modal for the selected journals
  const handleOpenBulkPost = () => {
    const selectedJournals = journals.filter(j => selectedRowKeys.includes(j.key));
    const items: BulkPostItem[] = selectedJournals.map(j => ({
      key: j.key,
      journal: j,
      status: j.statusMeaning === 'Posted' ? 'skipped' : 'pending',
      validationErrors: j.statusMeaning === 'Posted' ? ['Already posted — will be skipped.'] : [],
    }));
    setBulkPostItems(items);
    setBulkPostRunning(false);
    setBulkPostDone(false);
    setBulkPostVisible(true);
  };

  // Run the bulk post sequentially
  const handleBulkPost = async () => {
    setBulkPostRunning(true);
    setBulkPostDone(false);

    // Step 1: validate all pending items
    let results: BulkPostItem[] = bulkPostItems.map(item => {
      if (item.status === 'skipped') return item;
      const errors = validateForBulkPost(item.journal);
      return {
        ...item,
        validationErrors: errors,
        status: errors.length > 0 ? 'validation_failed' : 'pending',
      } as BulkPostItem;
    });
    setBulkPostItems([...results]);

    // Small pause so UI updates before API calls start
    await new Promise(r => setTimeout(r, 80));

    // Step 2: post eligible items one by one
    for (let i = 0; i < results.length; i++) {
      if (results[i].status !== 'pending') continue;

      results[i] = { ...results[i], status: 'posting' };
      setBulkPostItems([...results]);

      try {
        const resp = await postJournal(results[i].journal.jeBatchId);
        if (resp.success) {
          results[i] = { ...results[i], status: 'posted' };
        } else {
          const serverErrors = resp.errors || [];
          results[i] = {
            ...results[i],
            status: 'failed',
            validationErrors: [...results[i].validationErrors, ...serverErrors],
            serverError: resp.error,
          };
        }
      } catch (err) {
        results[i] = {
          ...results[i],
          status: 'failed',
          serverError: err instanceof Error ? err.message : 'Network error',
        };
      }
      setBulkPostItems([...results]);
    }

    // Step 3: update the main journals table for successfully posted batches
    const postedBatchIds = new Set(
      results.filter(r => r.status === 'posted').map(r => r.journal.jeBatchId)
    );
    if (postedBatchIds.size > 0) {
      setJournals(prev =>
        prev.map(j =>
          postedBatchIds.has(j.jeBatchId)
            ? { ...j, statusMeaning: 'Posted', status: 'P' }
            : j
        )
      );
    }

    setBulkPostRunning(false);
    setBulkPostDone(true);
  };

  // Helper function to get currency name
  const getCurrencyName = (code: string) => {
    const currencies: Record<string, string> = {
      'INR': 'Indian Rupee',
      'USD': 'US Dollar',
      'AED': 'UAE Dirham',
      'EUR': 'Euro',
      'GBP': 'British Pound',
    };
    return currencies[code] || code;
  };

  // Render Journal Edit Panel (for tab content)
  const renderJournalEditPanel = (journal: JournalRecord, tabKey: string) => {
    const formatNumber = (num: number | null | undefined) => {
      if (num === null || num === undefined) return '';
      return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Editable mode flag
    const isEditable = journal.statusMeaning !== 'Posted';

    // Per-tab editable state helpers
    const lines = isEditable ? (editableLines[tabKey] || []) : (journal.lines || []);
    const headerFields = editableJournalFields[tabKey] || {
      batchDescription: journal.batchDescription || '',
      journalDescription: journal.journalDescription || '',
      category: journal.category || '',
      currencyCode: journal.currencyCode || '',
      conversionRate: 1,
      conversionRateType: 'User',
    };
    const isSaving = tabSaving[tabKey] || false;
    const isPosting = tabPosting[tabKey] || false;
    const selectedLineIndices = selectedLinesByTab[tabKey] || [];

    // Get expanded state for this tab
    const isJournalExpanded = journalExpandedState[tabKey] || false;
    const activeDetailTab = activeDetailTabState[tabKey] || 'journal';

    // Toggle expanded state for this tab
    const toggleJournalExpanded = () => {
      setJournalExpandedState(prev => ({ ...prev, [tabKey]: !prev[tabKey] }));
    };

    // Set active detail tab for this tab
    const setActiveDetailTab = (tab: string) => {
      setActiveDetailTabState(prev => ({ ...prev, [tabKey]: tab }));
    };

    // Update any header / batch field
    const handleHeaderFieldChange = (field: string, value: any) => {
      setEditableJournalFields(prev => ({
        ...prev,
        [tabKey]: { ...prev[tabKey], [field]: value },
      }));
    };

    // Update a line field
    const handleLineChange = (lineIdx: number, field: string, value: any) => {
      setEditableLines(prev => {
        const currentLines = [...(prev[tabKey] || [])];
        currentLines[lineIdx] = { ...currentLines[lineIdx], [field]: value };
        return { ...prev, [tabKey]: currentLines };
      });
    };

    // Add a new blank line
    const handleAddLine = () => {
      const currentLines = editableLines[tabKey] || [];
      const newLine: JournalLine = {
        lineId: 0,
        lineNum: currentLines.length + 1,
        account: '',
        description: '',
        enteredDr: 0,
        enteredCr: 0,
        accountedDr: 0,
        accountedCr: 0,
        currency: journal.currencyCode,
      };
      setEditableLines(prev => ({
        ...prev,
        [tabKey]: [...(prev[tabKey] || []), newLine],
      }));
    };

    // Delete a specific line by index
    const handleDeleteLine = (lineIdx: number) => {
      setEditableLines(prev => {
        const newLines = (prev[tabKey] || []).filter((_, i) => i !== lineIdx);
        return { ...prev, [tabKey]: newLines.map((l, i) => ({ ...l, lineNum: i + 1 })) };
      });
      // Remove from selection if present
      setSelectedLinesByTab(prev => ({
        ...prev,
        [tabKey]: (prev[tabKey] || []).filter(i => i !== lineIdx).map(i => i > lineIdx ? i - 1 : i),
      }));
    };

    // Delete selected lines
    const handleDeleteSelectedLines = () => {
      if (selectedLineIndices.length === 0) return;
      setEditableLines(prev => {
        const newLines = (prev[tabKey] || []).filter((_, i) => !selectedLineIndices.includes(i));
        return { ...prev, [tabKey]: newLines.map((l, i) => ({ ...l, lineNum: i + 1 })) };
      });
      setSelectedLinesByTab(prev => ({ ...prev, [tabKey]: [] }));
    };

    // Save handler — calls PUT gl/journals/:jeHeaderId
    const handleSave = async () => {
      const totalDr = lines.reduce((s, l) => s + (l.enteredDr || 0), 0);
      const totalCr = lines.reduce((s, l) => s + (l.enteredCr || 0), 0);
      if (Math.abs(totalDr - totalCr) > 0.01) {
        message.error('Journal is out of balance. Debit must equal Credit before saving.');
        return;
      }
      if (lines.length === 0) {
        message.error('Journal must have at least one line before saving.');
        return;
      }

      setTabSaving(prev => ({ ...prev, [tabKey]: true }));
      try {
        const convRate = headerFields.conversionRate || 1;
        const payload = {
          jeHeaderId: journal.jeHeaderId,
          jeBatchId: journal.jeBatchId,
          batchDescription: headerFields.batchDescription,
          journalDescription: headerFields.journalDescription,
          category: headerFields.category,
          currencyCode: headerFields.currencyCode,
          conversionRate: convRate,
          conversionRateType: headerFields.conversionRateType,
          lines: lines.map(l => ({
            lineId: l.lineId,
            lineNum: l.lineNum,
            account: l.account,
            description: l.description,
            enteredDr: l.enteredDr || 0,
            enteredCr: l.enteredCr || 0,
            // accountedDr/Cr = entered × conversionRate
            accountedDr: (l.enteredDr || 0) * convRate,
            accountedCr: (l.enteredCr || 0) * convRate,
            currency: l.currency || headerFields.currencyCode || journal.currencyCode,
          })),
        };
        const result = await updateJournal(journal.jeHeaderId, payload);
        if (result.success) {
          message.success('Journal saved successfully');
        } else {
          message.error(`Save failed: ${result.error || 'Unknown error'}`);
        }
      } catch (err) {
        message.error('Failed to save journal');
      } finally {
        setTabSaving(prev => ({ ...prev, [tabKey]: false }));
      }
    };

    // Post handler — validates, confirms, posts, then stays on page in read-only mode
    const handlePostJournal = () => {
      const totalDr = lines.reduce((s, l) => s + (l.enteredDr || 0), 0);
      const totalCr = lines.reduce((s, l) => s + (l.enteredCr || 0), 0);

      // ── Collect all validation errors ─────────────────────────────────────
      const errors: string[] = [];

      if (lines.length === 0) {
        errors.push('Journal must have at least one line.');
      }

      if (Math.abs(totalDr - totalCr) > 0.01) {
        errors.push(
          `Journal is out of balance — Debit ${formatNumber(totalDr)} ≠ Credit ${formatNumber(totalCr)} ` +
          `(difference: ${formatNumber(Math.abs(totalDr - totalCr))}).`
        );
      }

      const blankAccounts = lines.filter(l => !l.account?.trim());
      if (blankAccounts.length > 0) {
        errors.push(`${blankAccounts.length} line(s) have no account code.`);
      }

      const zeroLines = lines.filter(l => (l.enteredDr || 0) === 0 && (l.enteredCr || 0) === 0);
      if (zeroLines.length > 0) {
        errors.push(`${zeroLines.length} line(s) have both Debit and Credit as zero.`);
      }

      const bothSides = lines.filter(l => (l.enteredDr || 0) > 0 && (l.enteredCr || 0) > 0);
      if (bothSides.length > 0) {
        errors.push(`${bothSides.length} line(s) have both Debit and Credit filled — each line should use only one side.`);
      }

      // Period open check — use periods already fetched for the search form
      const journalPeriod = journal.periodName;
      const periodRecord = periods.find(p => p.period_name_id === journalPeriod);
      if (periodRecord && periodRecord.status !== 'Open') {
        errors.push(`Accounting period "${journalPeriod}" is "${periodRecord.status}". Only Open periods can be posted.`);
      }

      if (!journal.jeBatchId) {
        errors.push('No Batch ID found — cannot post.');
      }

      // ── Show errors and stop ───────────────────────────────────────────────
      if (errors.length > 0) {
        Modal.error({
          title: 'Cannot Post Journal',
          width: 540,
          content: (
            <ul style={{ paddingLeft: 20, margin: '8px 0 0', lineHeight: 1.8 }}>
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          ),
        });
        return;
      }

      // ── Confirmation dialog ────────────────────────────────────────────────
      Modal.confirm({
        title: 'Post Journal Batch',
        width: 480,
        okText: 'Post',
        cancelText: 'Cancel',
        okButtonProps: { style: { background: REDWOOD.warning, borderColor: REDWOOD.warning } },
        content: (
          <div style={{ fontSize: 13 }}>
            <p style={{ margin: '8px 0' }}>Are you sure you want to post this journal batch?</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
              <tbody>
                {[
                  ['Batch', journal.batchName],
                  ['Journal', journal.journalName],
                  ['Period', journal.periodName],
                  ['Currency', headerFields.currencyCode || journal.currencyCode],
                  ['Total Debit', formatNumber(totalDr)],
                  ['Total Credit', formatNumber(totalCr)],
                  ['Lines', String(lines.length)],
                ].map(([label, val]) => (
                  <tr key={label}>
                    <td style={{ color: '#888', paddingBottom: 4, width: '40%' }}>{label}</td>
                    <td style={{ fontWeight: 500, paddingBottom: 4 }}>{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ marginTop: 12, color: REDWOOD.warning, fontSize: 12 }}>
              ⚠ Posted journals cannot be modified.
            </p>
          </div>
        ),
        onOk: async () => {
          setTabPosting(prev => ({ ...prev, [tabKey]: true }));
          try {
            const result = await postJournal(journal.jeBatchId);
            if (result.success) {
              message.success('Journal posted successfully');
              // Stay on page — flip tab journal to read-only Posted state
              setOpenJournalTabs(prev =>
                prev.map(tab =>
                  tab.key === tabKey
                    ? { ...tab, journal: { ...tab.journal, statusMeaning: 'Posted', status: 'P' } }
                    : tab
                )
              );
              // Clear editable state — panel becomes read-only
              setEditableLines(prev => { const n = { ...prev }; delete n[tabKey]; return n; });
              setEditableJournalFields(prev => { const n = { ...prev }; delete n[tabKey]; return n; });
              setSelectedLinesByTab(prev => { const n = { ...prev }; delete n[tabKey]; return n; });
            } else {
              // Server returned validation errors or system error
              const serverErrors: string[] = result.errors || [];
              Modal.error({
                title: 'Post Failed',
                width: 540,
                content: serverErrors.length > 0 ? (
                  <div>
                    <p style={{ marginBottom: 8 }}>{result.error}</p>
                    <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 1.8 }}>
                      {serverErrors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                ) : (result.error || 'An unexpected error occurred.'),
              });
            }
          } catch {
            Modal.error({ title: 'Post Failed', content: 'Could not connect to server.' });
          } finally {
            setTabPosting(prev => ({ ...prev, [tabKey]: false }));
          }
        },
      });
    };

    // Render expanded tabs (full details)
    const renderDetailTabs = () => (
      <Tabs
        activeKey={activeDetailTab}
        onChange={setActiveDetailTab}
        style={{ padding: '0 12px' }}
        size="small"
        items={[
          {
            key: 'journal',
            label: <span style={{ fontSize: 14 }}>Journal</span>,
            children: (
              <div style={{ padding: '12px 0' }}>
                <Row gutter={[32, 8]}>
                  <Col span={12}>
                    <Row gutter={[6, 8]}>
                      <Col span={10}><Text type="secondary" style={{ fontSize: 13 }}>Journal</Text></Col>
                      <Col span={14}><Text strong style={{ fontSize: 13 }}>{journal.journalName}</Text></Col>

                      <Col span={10}><Text type="secondary" style={{ fontSize: 13 }}>Description</Text></Col>
                      <Col span={14}>
                        {isEditable ? (
                          <Input
                            size="small"
                            style={{ fontSize: 13 }}
                            value={headerFields.journalDescription}
                            onChange={e => handleHeaderFieldChange('journalDescription', e.target.value)}
                            placeholder="Journal description"
                          />
                        ) : (
                          <Text style={{ fontSize: 13 }}>{journal.journalDescription || '-'}</Text>
                        )}
                      </Col>

                      <Col span={10}><Text type="secondary" style={{ fontSize: 13 }}><span style={{ color: REDWOOD.primary }}>*</span> Ledger</Text></Col>
                      <Col span={14}><Text style={{ fontSize: 13 }}>{journal.ledgerName}</Text></Col>

                      <Col span={10}><Text type="secondary" style={{ fontSize: 13 }}><span style={{ color: REDWOOD.primary }}>*</span> Legal Entity</Text></Col>
                      <Col span={14}><Text style={{ fontSize: 13 }}>{journal.legalEntityName || '-'}</Text></Col>

                      <Col span={10}><Text type="secondary" style={{ fontSize: 13 }}>Accounting Date</Text></Col>
                      <Col span={14}><Text style={{ fontSize: 13 }}>{journal.effectiveDate}</Text></Col>

                      <Col span={10}><Text type="secondary" style={{ fontSize: 13 }}><span style={{ color: REDWOOD.primary }}>*</span> Category</Text></Col>
                      <Col span={14}>
                        {isEditable ? (
                          <Select
                            size="small"
                            style={{ width: '100%', fontSize: 13 }}
                            value={headerFields.category}
                            onChange={v => handleHeaderFieldChange('category', v)}
                            showSearch
                            allowClear
                            placeholder="Select category"
                          >
                            {journalCategories.map(c => <Option key={c} value={c}>{c}</Option>)}
                          </Select>
                        ) : (
                          <Text style={{ fontSize: 13 }}>{journal.category}</Text>
                        )}
                      </Col>
                    </Row>
                  </Col>
                  <Col span={12}>
                    <Row gutter={[6, 8]}>
                      <Col span={10}><Text type="secondary" style={{ fontSize: 13 }}>Currency</Text></Col>
                      <Col span={14}>
                        {isEditable ? (
                          <Input
                            size="small"
                            style={{ fontSize: 13, textTransform: 'uppercase' }}
                            value={headerFields.currencyCode}
                            onChange={e => handleHeaderFieldChange('currencyCode', e.target.value.toUpperCase())}
                            placeholder="e.g. AED"
                            maxLength={15}
                          />
                        ) : (
                          <Text style={{ fontSize: 13 }}>{journal.currencyCode} {getCurrencyName(journal.currencyCode)}</Text>
                        )}
                      </Col>

                      <Col span={10}><Text type="secondary" style={{ fontSize: 13 }}>Conversion Date</Text></Col>
                      <Col span={14}><Text style={{ fontSize: 13 }}>{journal.effectiveDate}</Text></Col>

                      <Col span={10}><Text type="secondary" style={{ fontSize: 13 }}>Conversion Rate Type</Text></Col>
                      <Col span={14}>
                        {isEditable ? (
                          <Select
                            size="small"
                            style={{ width: '100%', fontSize: 13 }}
                            value={headerFields.conversionRateType}
                            onChange={v => handleHeaderFieldChange('conversionRateType', v)}
                          >
                            {['User', 'Spot', 'Corporate', 'Fixed', 'Period Average'].map(t => (
                              <Option key={t} value={t}>{t}</Option>
                            ))}
                          </Select>
                        ) : (
                          <Text style={{ fontSize: 13 }}>User</Text>
                        )}
                      </Col>

                      <Col span={10}><Text type="secondary" style={{ fontSize: 13 }}>Conversion Rate</Text></Col>
                      <Col span={14}>
                        {isEditable ? (
                          <InputNumber
                            size="small"
                            style={{ width: '100%', fontSize: 13 }}
                            value={headerFields.conversionRate}
                            min={0}
                            precision={6}
                            onChange={v => handleHeaderFieldChange('conversionRate', v || 1)}
                          />
                        ) : (
                          <Text style={{ fontSize: 13 }}>1</Text>
                        )}
                      </Col>

                      <Col span={10}><Text type="secondary" style={{ fontSize: 13 }}>Inverse Rate</Text></Col>
                      <Col span={14}>
                        <Text style={{ fontSize: 13 }}>
                          {isEditable && headerFields.conversionRate > 0
                            ? (1 / headerFields.conversionRate).toFixed(6)
                            : '1'}
                        </Text>
                      </Col>

                      <Col span={10}><Text type="secondary" style={{ fontSize: 13 }}>Reference</Text></Col>
                      <Col span={14}><Text style={{ fontSize: 13 }}>{journal.externalReference || '-'}</Text></Col>
                    </Row>
                  </Col>
                </Row>
              </div>
            ),
          },
          {
            key: 'controlTotal',
            label: <span style={{ fontSize: 14 }}>Control Total</span>,
            children: (
              <div style={{ padding: '12px 0' }}>
                <Row gutter={[32, 12]}>
                  <Col span={12}>
                    <Text strong style={{ fontSize: 14, marginBottom: 8, display: 'block' }}>Control Total</Text>
                    <Row gutter={[6, 8]}>
                      <Col span={12}><Text type="secondary" style={{ fontSize: 13 }}>Total Entered Debit</Text></Col>
                      <Col span={12}><Text style={{ fontSize: 13 }}>{formatNumber(journal.enteredDebit)}</Text></Col>

                      <Col span={12}><Text type="secondary" style={{ fontSize: 13 }}>Total Entered Credit</Text></Col>
                      <Col span={12}><Text style={{ fontSize: 13 }}>{formatNumber(journal.enteredCredit)}</Text></Col>
                    </Row>
                  </Col>
                  <Col span={12}>
                    <div style={{ marginTop: 20 }}>
                      <Row gutter={[6, 8]}>
                        <Col span={12}><a style={{ color: REDWOOD.info, fontSize: 13 }}>Total Accounted Debit</a></Col>
                        <Col span={12}><Text style={{ fontSize: 13 }}>{formatNumber(journal.accountedDebit)}</Text></Col>

                        <Col span={12}><a style={{ color: REDWOOD.info, fontSize: 13 }}>Total Accounted Credit</a></Col>
                        <Col span={12}><Text style={{ fontSize: 13 }}>{formatNumber(journal.accountedCredit)}</Text></Col>
                      </Row>
                    </div>
                  </Col>
                </Row>
              </div>
            ),
          },
          {
            key: 'sequencing',
            label: <span style={{ fontSize: 14 }}>Sequencing</span>,
            children: (
              <div style={{ padding: '12px 0' }}>
                <Row gutter={[32, 12]}>
                  <Col span={12}>
                    <a style={{ color: REDWOOD.info, fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 8 }}>Accounting Sequence</a>
                    <Row gutter={[6, 8]}>
                      <Col span={8}><Text type="secondary" style={{ fontSize: 13 }}>Name</Text></Col>
                      <Col span={16}><Text style={{ fontSize: 13 }}>-</Text></Col>

                      <Col span={8}><Text type="secondary" style={{ fontSize: 13 }}>Number</Text></Col>
                      <Col span={16}><Text style={{ fontSize: 13 }}>-</Text></Col>
                    </Row>
                  </Col>
                  <Col span={12}>
                    <a style={{ color: REDWOOD.info, fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 8 }}>Reporting Sequence</a>
                    <Row gutter={[6, 8]}>
                      <Col span={8}><Text type="secondary" style={{ fontSize: 13 }}>Name</Text></Col>
                      <Col span={16}><Text style={{ fontSize: 13 }}>-</Text></Col>

                      <Col span={8}><Text type="secondary" style={{ fontSize: 13 }}>Number</Text></Col>
                      <Col span={16}><Text style={{ fontSize: 13 }}>-</Text></Col>
                    </Row>
                  </Col>
                </Row>
              </div>
            ),
          },
          {
            key: 'reversal',
            label: <span style={{ fontSize: 14 }}>Reversal</span>,
            children: (
              <div style={{ padding: '12px 0' }}>
                <Row gutter={[32, 12]}>
                  <Col span={12}>
                    <Row gutter={[6, 8]}>
                      <Col span={8}><Text type="secondary" style={{ fontSize: 13 }}>Reversal Period</Text></Col>
                      <Col span={16}>
                        <Select placeholder="Select period" style={{ width: 160, fontSize: 13 }} size="small" allowClear>
                          <Option value="Feb-25">Feb-25</Option>
                          <Option value="Mar-25">Mar-25</Option>
                        </Select>
                      </Col>

                      <Col span={8}><Text type="secondary" style={{ fontSize: 13 }}>Reversal Method</Text></Col>
                      <Col span={16}>
                        <Select defaultValue="switchDrCr" style={{ width: 160, fontSize: 13 }} size="small">
                          <Option value="switchDrCr">Switch DR or CR</Option>
                          <Option value="changeSign">Change Sign</Option>
                        </Select>
                      </Col>
                    </Row>
                  </Col>
                  <Col span={12}>
                    <Row gutter={[6, 8]}>
                      <Col span={8}><Text type="secondary" style={{ fontSize: 13 }}>Reversal Status</Text></Col>
                      <Col span={16}><Text style={{ fontSize: 13 }}>Not reversed</Text></Col>
                    </Row>
                  </Col>
                </Row>
              </div>
            ),
          },
        ]}
      />
    );

    // Render collapsed tabs (compact view)
    const renderCollapsedJournal = () => (
      <Tabs
        activeKey={activeDetailTab}
        onChange={setActiveDetailTab}
        size="small"
        style={{ padding: '0 10px' }}
        items={[
          {
            key: 'journal',
            label: <span style={{ fontSize: 13 }}>Journal</span>,
            children: (
              <div style={{ padding: '6px 0' }}>
                <Row gutter={[16, 5]}>
                  <Col span={12}>
                    <Row gutter={[6, 5]}>
                      <Col span={8}><Text type="secondary" style={{ fontSize: 13 }}>Journal</Text></Col>
                      <Col span={16}><Text strong style={{ fontSize: 13 }}>{journal.journalName}</Text></Col>

                      <Col span={8}><Text type="secondary" style={{ fontSize: 13 }}>Description</Text></Col>
                      <Col span={16}>
                        {isEditable ? (
                          <Input
                            size="small"
                            style={{ fontSize: 13 }}
                            value={headerFields.journalDescription}
                            onChange={e => handleHeaderFieldChange('journalDescription', e.target.value)}
                            placeholder="Journal description"
                          />
                        ) : (
                          <Text style={{ fontSize: 13 }}>{journal.journalDescription || '-'}</Text>
                        )}
                      </Col>

                      <Col span={8}><Text type="secondary" style={{ fontSize: 13 }}><span style={{ color: REDWOOD.primary }}>*</span> Ledger</Text></Col>
                      <Col span={16}><Text style={{ fontSize: 13 }}>{journal.ledgerName}</Text></Col>

                      <Col span={8}><Text type="secondary" style={{ fontSize: 13 }}><span style={{ color: REDWOOD.primary }}>*</span> Legal Entity</Text></Col>
                      <Col span={16}><Text style={{ fontSize: 13 }}>{journal.legalEntityName || '-'}</Text></Col>

                      <Col span={8}><Text type="secondary" style={{ fontSize: 13 }}>Accounting Date</Text></Col>
                      <Col span={16}><Text style={{ fontSize: 13 }}>{journal.effectiveDate}</Text></Col>

                      <Col span={8}><Text type="secondary" style={{ fontSize: 13 }}><span style={{ color: REDWOOD.primary }}>*</span> Category</Text></Col>
                      <Col span={16}>
                        {isEditable ? (
                          <Select
                            size="small"
                            style={{ width: '100%', fontSize: 13 }}
                            value={headerFields.category}
                            onChange={v => handleHeaderFieldChange('category', v)}
                            showSearch
                            allowClear
                            placeholder="Select category"
                          >
                            {journalCategories.map(c => <Option key={c} value={c}>{c}</Option>)}
                          </Select>
                        ) : (
                          <Text style={{ fontSize: 13 }}>{journal.category}</Text>
                        )}
                      </Col>
                    </Row>
                  </Col>
                  <Col span={12}>
                    <Row gutter={[6, 5]}>
                      <Col span={10}><Text type="secondary" style={{ fontSize: 13 }}>Currency</Text></Col>
                      <Col span={14}>
                        {isEditable ? (
                          <Input
                            size="small"
                            style={{ fontSize: 13, textTransform: 'uppercase' }}
                            value={headerFields.currencyCode}
                            onChange={e => handleHeaderFieldChange('currencyCode', e.target.value.toUpperCase())}
                            placeholder="e.g. AED"
                            maxLength={15}
                          />
                        ) : (
                          <Text style={{ fontSize: 13 }}>{journal.currencyCode} {getCurrencyName(journal.currencyCode)}</Text>
                        )}
                      </Col>

                      <Col span={10}><Text type="secondary" style={{ fontSize: 13 }}>Conversion Date</Text></Col>
                      <Col span={14}><Text style={{ fontSize: 13 }}>{journal.effectiveDate}</Text></Col>

                      <Col span={10}><Text type="secondary" style={{ fontSize: 13 }}>Conversion Rate Type</Text></Col>
                      <Col span={14}>
                        {isEditable ? (
                          <Select
                            size="small"
                            style={{ width: '100%', fontSize: 13 }}
                            value={headerFields.conversionRateType}
                            onChange={v => handleHeaderFieldChange('conversionRateType', v)}
                          >
                            {['User', 'Spot', 'Corporate', 'Fixed', 'Period Average'].map(t => (
                              <Option key={t} value={t}>{t}</Option>
                            ))}
                          </Select>
                        ) : (
                          <Text style={{ fontSize: 13 }}>User</Text>
                        )}
                      </Col>

                      <Col span={10}><Text type="secondary" style={{ fontSize: 13 }}>Conversion Rate</Text></Col>
                      <Col span={14}>
                        {isEditable ? (
                          <InputNumber
                            size="small"
                            style={{ width: '100%', fontSize: 13 }}
                            value={headerFields.conversionRate}
                            min={0}
                            precision={6}
                            onChange={v => handleHeaderFieldChange('conversionRate', v || 1)}
                          />
                        ) : (
                          <Text style={{ fontSize: 13 }}>1</Text>
                        )}
                      </Col>

                      <Col span={10}><Text type="secondary" style={{ fontSize: 13 }}>Inverse Rate</Text></Col>
                      <Col span={14}>
                        <Text style={{ fontSize: 13 }}>
                          {isEditable && headerFields.conversionRate > 0
                            ? (1 / headerFields.conversionRate).toFixed(6)
                            : '1'}
                        </Text>
                      </Col>
                    </Row>
                  </Col>
                </Row>
              </div>
            ),
          },
          {
            key: 'controlTotal',
            label: <span style={{ fontSize: 13 }}>Control Total</span>,
            children: (
              <div style={{ padding: '6px 0' }}>
                <Row gutter={[24, 5]}>
                  <Col span={12}>
                    <Row gutter={[6, 5]}>
                      <Col span={12}><Text type="secondary" style={{ fontSize: 13 }}>Total Entered Debit</Text></Col>
                      <Col span={12}><Text style={{ fontSize: 13 }}>{formatNumber(journal.enteredDebit)}</Text></Col>

                      <Col span={12}><Text type="secondary" style={{ fontSize: 13 }}>Total Entered Credit</Text></Col>
                      <Col span={12}><Text style={{ fontSize: 13 }}>{formatNumber(journal.enteredCredit)}</Text></Col>
                    </Row>
                  </Col>
                  <Col span={12}>
                    <Row gutter={[6, 5]}>
                      <Col span={12}><a style={{ color: REDWOOD.info, fontSize: 13 }}>Total Accounted Debit</a></Col>
                      <Col span={12}><Text style={{ fontSize: 13 }}>{formatNumber(journal.accountedDebit)}</Text></Col>

                      <Col span={12}><a style={{ color: REDWOOD.info, fontSize: 13 }}>Total Accounted Credit</a></Col>
                      <Col span={12}><Text style={{ fontSize: 13 }}>{formatNumber(journal.accountedCredit)}</Text></Col>
                    </Row>
                  </Col>
                </Row>
              </div>
            ),
          },
          {
            key: 'sequencing',
            label: <span style={{ fontSize: 13 }}>Sequencing</span>,
            children: (
              <div style={{ padding: '6px 0' }}>
                <Row gutter={[24, 5]}>
                  <Col span={12}>
                    <Text strong style={{ fontSize: 13, color: REDWOOD.info }}>Accounting Sequence</Text>
                    <Row gutter={[6, 5]} style={{ marginTop: 4 }}>
                      <Col span={8}><Text type="secondary" style={{ fontSize: 13 }}>Name</Text></Col>
                      <Col span={16}><Text style={{ fontSize: 13 }}>-</Text></Col>

                      <Col span={8}><Text type="secondary" style={{ fontSize: 13 }}>Number</Text></Col>
                      <Col span={16}><Text style={{ fontSize: 13 }}>-</Text></Col>
                    </Row>
                  </Col>
                  <Col span={12}>
                    <Text strong style={{ fontSize: 13, color: REDWOOD.info }}>Reporting Sequence</Text>
                    <Row gutter={[6, 5]} style={{ marginTop: 4 }}>
                      <Col span={8}><Text type="secondary" style={{ fontSize: 13 }}>Name</Text></Col>
                      <Col span={16}><Text style={{ fontSize: 13 }}>-</Text></Col>

                      <Col span={8}><Text type="secondary" style={{ fontSize: 13 }}>Number</Text></Col>
                      <Col span={16}><Text style={{ fontSize: 13 }}>-</Text></Col>
                    </Row>
                  </Col>
                </Row>
              </div>
            ),
          },
          {
            key: 'reversal',
            label: <span style={{ fontSize: 13 }}>Reversal</span>,
            children: (
              <div style={{ padding: '6px 0' }}>
                <Row gutter={[24, 5]}>
                  <Col span={12}>
                    <Row gutter={[6, 5]}>
                      <Col span={10}><Text type="secondary" style={{ fontSize: 13 }}>Reversal Period</Text></Col>
                      <Col span={14}>
                        <Select placeholder="Select" size="small" style={{ width: 130, fontSize: 13 }} allowClear>
                          <Option value="Feb-25">Feb-25</Option>
                          <Option value="Mar-25">Mar-25</Option>
                        </Select>
                      </Col>

                      <Col span={10}><Text type="secondary" style={{ fontSize: 13 }}>Reversal Method</Text></Col>
                      <Col span={14}>
                        <Select defaultValue="switchDrCr" size="small" style={{ width: 130, fontSize: 13 }}>
                          <Option value="switchDrCr">Switch DR or CR</Option>
                          <Option value="changeSign">Change Sign</Option>
                        </Select>
                      </Col>
                    </Row>
                  </Col>
                  <Col span={12}>
                    <Row gutter={[6, 5]}>
                      <Col span={10}><Text type="secondary" style={{ fontSize: 13 }}>Reversal Status</Text></Col>
                      <Col span={14}><Text style={{ fontSize: 13 }}>Not reversed</Text></Col>
                    </Row>
                  </Col>
                </Row>
              </div>
            ),
          },
        ]}
      />
    );

    return (
      <div style={{ padding: 16 }}>
        {journal.statusMeaning === 'Posted' && (
          <Alert
            message="This journal is Posted and cannot be modified."
            type="info"
            showIcon
            style={{ marginBottom: 12, fontSize: 12 }}
            banner
          />
        )}
        {/* Journal Batch Card */}
        <Card
          style={{ marginBottom: 12, borderRadius: 6 }}
          bodyStyle={{ padding: 0 }}
        >
          <div
            style={{
              padding: '8px 12px',
              background: REDWOOD.neutral100,
              borderBottom: `1px solid ${REDWOOD.neutral200}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Space>
              <Text strong style={{ fontSize: 11 }}>
                Journal Batch: {journal.batchName}
              </Text>
              <Tag
                style={{ fontSize: 10 }}
                color={journal.statusMeaning === 'Posted' ? REDWOOD.success : REDWOOD.warning}
              >
                {journal.statusMeaning}
              </Tag>
            </Space>
            <Space size="small">
              {journal.statusMeaning !== 'Posted' ? (
                <>
                  <Space.Compact size="small">
                    <Button size="small" icon={<SaveOutlined />} loading={isSaving} onClick={handleSave}>Save</Button>
                    <Dropdown
                      menu={{
                        items: [
                          { key: 'save', label: 'Save', onClick: handleSave },
                          {
                            key: 'saveClose', label: 'Save and Close', onClick: async () => {
                              await handleSave();
                              closeJournalTab(tabKey);
                            }
                          },
                        ]
                      }}
                      placement="bottomRight"
                    >
                      <Button size="small" icon={<DownOutlined />} disabled={isSaving} />
                    </Dropdown>
                  </Space.Compact>
                  <Button
                    size="small"
                    style={{ fontSize: 10, background: REDWOOD.warning, color: '#fff', borderColor: REDWOOD.warning }}
                    onClick={handlePostJournal}
                    loading={isPosting}
                    icon={<CheckOutlined />}
                  >
                    Post
                  </Button>
                  <Tooltip title={`PUT ${APEX_DB_CONFIG.baseUrl}/gl/journals/${journal.jeBatchId}/post`} placement="bottom">
                    <ApiOutlined style={{ color: REDWOOD.info, fontSize: 13, cursor: 'pointer' }} />
                  </Tooltip>
                  <Tooltip title={`PUT ${APEX_DB_CONFIG.baseUrl}/gl/journals/${journal.jeHeaderId}`} placement="bottom">
                    <ApiOutlined style={{ color: REDWOOD.success, fontSize: 13, cursor: 'pointer' }} />
                  </Tooltip>
                </>
              ) : (
                <Tooltip title="Posted journals are read-only">
                  <Tag color={REDWOOD.success} style={{ fontSize: 10 }}>
                    <CheckCircleOutlined style={{ marginRight: 4 }} />Read Only
                  </Tag>
                </Tooltip>
              )}
              <Button
                size="small"
                icon={<CloseOutlined />}
                onClick={() => closeJournalTab(tabKey)}
              >
                Close
              </Button>
            </Space>
          </div>

          <div style={{ padding: 10 }}>
            <Row gutter={[16, 6]}>
              <Col span={12}>
                <Row gutter={[6, 5]}>
                  <Col span={8}><Text type="secondary" style={{ fontSize: 11 }}>Journal Batch</Text></Col>
                  <Col span={16}><Text style={{ fontSize: 11 }}>{journal.batchName}</Text></Col>

                  <Col span={8}><Text type="secondary" style={{ fontSize: 11 }}>Description</Text></Col>
                  <Col span={16}>
                    {isEditable ? (
                      <Input
                        size="small"
                        style={{ fontSize: 11 }}
                        value={headerFields.batchDescription}
                        onChange={e => handleHeaderFieldChange('batchDescription', e.target.value)}
                        placeholder="Batch description"
                      />
                    ) : (
                      <Text style={{ fontSize: 11 }}>{journal.batchDescription}</Text>
                    )}
                  </Col>

                  <Col span={8}><Text type="secondary" style={{ fontSize: 11 }}>Period</Text></Col>
                  <Col span={16}><Text style={{ fontSize: 11 }}>{journal.periodName}</Text></Col>

                  <Col span={8}><Text type="secondary" style={{ fontSize: 11 }}>Source</Text></Col>
                  <Col span={16}><Text style={{ fontSize: 11 }}>{journal.source}</Text></Col>
                </Row>
              </Col>
              <Col span={12}>
                <Row gutter={[6, 5]}>
                  <Col span={8}><Text type="secondary" style={{ fontSize: 11 }}>Ledger</Text></Col>
                  <Col span={16}><Text style={{ fontSize: 11 }}>{journal.ledgerName}</Text></Col>

                  <Col span={8}><Text type="secondary" style={{ fontSize: 11 }}>Currency</Text></Col>
                  <Col span={16}><Text style={{ fontSize: 11 }}>{journal.currencyCode}</Text></Col>

                  <Col span={8}><Text type="secondary" style={{ fontSize: 11 }}>Status</Text></Col>
                  <Col span={16}>
                    <Tag style={{ fontSize: 10 }} color={journal.statusMeaning === 'Posted' ? REDWOOD.success : REDWOOD.warning}>
                      {journal.statusMeaning}
                    </Tag>
                  </Col>

                  <Col span={8}><Text type="secondary" style={{ fontSize: 11 }}>Approval</Text></Col>
                  <Col span={16}><Text style={{ fontSize: 11 }}>{journal.approvalStatusMeaning}</Text></Col>
                </Row>
              </Col>
            </Row>
          </div>
        </Card>

        {/* Journal Section with Show More/Show Less */}
        <Card
          style={{ marginBottom: 12, borderRadius: 6 }}
          bodyStyle={{ padding: 0 }}
        >
          <div
            style={{
              padding: '8px 12px',
              background: REDWOOD.neutral100,
              borderBottom: `1px solid ${REDWOOD.neutral200}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Space>
              <Text strong style={{ fontSize: 11 }}>Journal</Text>
              <a
                onClick={toggleJournalExpanded}
                style={{ color: REDWOOD.info, fontSize: 10 }}
              >
                {isJournalExpanded ? 'Show Less' : 'Show More'}
              </a>
            </Space>
            <Space size="small">
              <Button size="small" icon={<PlusOutlined />} />
              <Button size="small" icon={<DeleteOutlined />} />
              <Dropdown menu={{ items: [{ key: 'copy', label: 'Copy' }, { key: 'reverse', label: 'Reverse' }, { key: 'delete', label: 'Delete' }] }}>
                <Button size="small" style={{ fontSize: 10 }}>
                  Journal Actions <DownOutlined />
                </Button>
              </Dropdown>
            </Space>
          </div>

          {isJournalExpanded ? renderDetailTabs() : renderCollapsedJournal()}
        </Card>

        {/* Journal Lines Card */}
        <Card
          style={{ borderRadius: 6 }}
          bodyStyle={{ padding: 0 }}
        >
          <div
            style={{
              padding: '8px 12px',
              background: REDWOOD.neutral100,
              borderBottom: `1px solid ${REDWOOD.neutral200}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Space>
              <Text strong style={{ fontSize: 12 }}>Journal Lines</Text>
              {isEditable && lines.length > 0 && (
                <Text type="secondary" style={{ fontSize: 11 }}>{lines.length} line{lines.length !== 1 ? 's' : ''}</Text>
              )}
            </Space>
            {isEditable && (
              <Space size="small">
                <Dropdown menu={{
                  items: [
                    { key: 'add', label: 'Add Row', icon: <PlusOutlined />, onClick: handleAddLine },
                    { key: 'deleteSelected', label: `Delete Selected (${selectedLineIndices.length})`, icon: <DeleteOutlined />, disabled: selectedLineIndices.length === 0, onClick: handleDeleteSelectedLines },
                  ]
                }}>
                  <Button size="small" style={{ fontSize: 11 }}>Actions <DownOutlined /></Button>
                </Dropdown>
                <Tooltip title="Add line">
                  <Button size="small" icon={<PlusOutlined />} onClick={handleAddLine} />
                </Tooltip>
                <Tooltip title={selectedLineIndices.length > 0 ? `Delete ${selectedLineIndices.length} selected` : 'Select lines to delete'}>
                  <Button
                    size="small"
                    icon={<DeleteOutlined />}
                    disabled={selectedLineIndices.length === 0}
                    onClick={handleDeleteSelectedLines}
                    danger={selectedLineIndices.length > 0}
                  />
                </Tooltip>
              </Space>
            )}
          </div>

          <Table
            rowSelection={isEditable ? {
              selectedRowKeys: selectedLineIndices,
              onChange: (keys) => setSelectedLinesByTab(prev => ({ ...prev, [tabKey]: keys as number[] })),
              columnWidth: 32,
            } : undefined}
            columns={[
              { title: '#', dataIndex: 'lineNum', key: 'lineNum', width: 45 },
              {
                title: 'Account',
                dataIndex: 'account',
                key: 'account',
                width: isEditable ? 200 : 220,
                render: (account: string, line: JournalLine, rowIdx: number) => {
                  if (isEditable) {
                    return (
                      <Input
                        size="small"
                        style={{ fontSize: 11, fontFamily: 'monospace' }}
                        value={account}
                        onChange={e => handleLineChange(rowIdx, 'account', e.target.value)}
                        placeholder="e.g. 01-000-1000-00-000"
                      />
                    );
                  }
                  const desc = accountDescMap[account] || line.accountDescription || (line as any).account_description || '';
                  return (
                    <div>
                      <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{account || '-'}</span>
                      {desc && <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginTop: 2 }}>{desc}</div>}
                    </div>
                  );
                },
              },
              {
                title: 'Description',
                dataIndex: 'description',
                key: 'description',
                width: 200,
                ellipsis: !isEditable,
                render: (text: string, line: JournalLine, rowIdx: number) => {
                  if (isEditable) {
                    return (
                      <Input
                        size="small"
                        style={{ fontSize: 11 }}
                        value={text}
                        onChange={e => handleLineChange(rowIdx, 'description', e.target.value)}
                        placeholder="Line description"
                      />
                    );
                  }
                  const isAP = (journal.source || '').toLowerCase() === 'payables';
                  if (isAP && text) {
                    return (
                      <Tooltip title="Click to view AP transaction">
                        <a style={{ color: REDWOOD.info }} onClick={() => handleTransactionDrilldown(journal, line)}>{text}</a>
                      </Tooltip>
                    );
                  }
                  return text || '-';
                },
              },
              { title: 'Currency', dataIndex: 'currency', key: 'currency', width: 70 },
              {
                title: 'Entered Dr',
                dataIndex: 'enteredDr',
                key: 'enteredDr',
                width: isEditable ? 120 : 100,
                align: 'right' as const,
                render: (v: number, _line: JournalLine, rowIdx: number) => {
                  if (isEditable) {
                    return (
                      <InputNumber
                        size="small"
                        style={{ fontSize: 11, width: '100%' }}
                        value={v || 0}
                        min={0}
                        precision={2}
                        onChange={val => handleLineChange(rowIdx, 'enteredDr', val || 0)}
                      />
                    );
                  }
                  return v > 0 ? formatNumber(v) : '';
                },
              },
              {
                title: 'Entered Cr',
                dataIndex: 'enteredCr',
                key: 'enteredCr',
                width: isEditable ? 120 : 100,
                align: 'right' as const,
                render: (v: number, _line: JournalLine, rowIdx: number) => {
                  if (isEditable) {
                    return (
                      <InputNumber
                        size="small"
                        style={{ fontSize: 11, width: '100%' }}
                        value={v || 0}
                        min={0}
                        precision={2}
                        onChange={val => handleLineChange(rowIdx, 'enteredCr', val || 0)}
                      />
                    );
                  }
                  return v > 0 ? formatNumber(v) : '';
                },
              },
              { title: 'Acc Dr', dataIndex: 'accountedDr', key: 'accountedDr', width: 90, align: 'right' as const, render: (v: number) => v > 0 ? formatNumber(v) : '' },
              { title: 'Acc Cr', dataIndex: 'accountedCr', key: 'accountedCr', width: 90, align: 'right' as const, render: (v: number) => v > 0 ? formatNumber(v) : '' },
              ...(!isEditable && (journal.source || '').toLowerCase() === 'payables' ? [{
                title: 'Transaction',
                key: 'viewTransaction',
                width: 130,
                render: (_: any, line: JournalLine) => (
                  <Button size="small" type="link" style={{ fontSize: 11, padding: '0 4px' }} onClick={() => handleTransactionDrilldown(journal, line)}>
                    View Transaction
                  </Button>
                ),
              }] : []),
              ...(isEditable ? [{
                title: '',
                key: 'deleteLine',
                width: 36,
                render: (_: any, _line: JournalLine, rowIdx: number) => (
                  <Tooltip title="Delete line">
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleDeleteLine(rowIdx)}
                    />
                  </Tooltip>
                ),
              }] : []),
            ]}
            dataSource={lines.map((line, idx) => ({ ...line, key: idx }))}
            pagination={false}
            scroll={{ x: isEditable ? 1200 : 1000 }}
            size="small"
            bordered
            className="compact-table"
            locale={{ emptyText: isEditable ? 'No lines — click + to add a line' : 'No journal lines' }}
            summary={() => {
              const totals = lines.reduce(
                (acc, line) => ({
                  enteredDr: acc.enteredDr + (line.enteredDr || 0),
                  enteredCr: acc.enteredCr + (line.enteredCr || 0),
                  accountedDr: acc.accountedDr + (line.accountedDr || 0),
                  accountedCr: acc.accountedCr + (line.accountedCr || 0),
                }),
                { enteredDr: 0, enteredCr: 0, accountedDr: 0, accountedCr: 0 }
              );
              const isBalanced = Math.abs(totals.enteredDr - totals.enteredCr) < 0.01;
              // column offset: +1 for row-selection checkbox when editable
              const offset = isEditable ? 1 : 0;

              return (
                <Table.Summary fixed>
                  <Table.Summary.Row style={{ background: REDWOOD.neutral100 }}>
                    <Table.Summary.Cell index={0 + offset} />
                    <Table.Summary.Cell index={1 + offset}>
                      <Text strong style={{ fontSize: 11 }}>Total</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2 + offset} />
                    <Table.Summary.Cell index={3 + offset} />
                    <Table.Summary.Cell index={4 + offset} align="right">
                      <Text strong style={{ fontSize: 11, color: REDWOOD.success }}>{formatNumber(totals.enteredDr)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5 + offset} align="right">
                      <Text strong style={{ fontSize: 11, color: REDWOOD.primary }}>{formatNumber(totals.enteredCr)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6 + offset} align="right">
                      <Text strong style={{ fontSize: 11, color: REDWOOD.success }}>{formatNumber(totals.accountedDr)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={7 + offset} align="right">
                      <Text strong style={{ fontSize: 11, color: REDWOOD.primary }}>{formatNumber(totals.accountedCr)}</Text>
                    </Table.Summary.Cell>
                    {isEditable && <Table.Summary.Cell index={8 + offset} />}
                  </Table.Summary.Row>
                  <Table.Summary.Row style={{ background: isBalanced ? '#e6f7e6' : '#fff2f0' }}>
                    <Table.Summary.Cell index={0 + offset} colSpan={4}>
                      <Text strong style={{ fontSize: 11 }}>
                        {isBalanced ? '✓ Balanced' : '⚠ Out of Balance'}
                      </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4 + offset} colSpan={2} align="right">
                      <Text style={{ fontSize: 11 }}>
                        Difference: {formatNumber(Math.abs(totals.enteredDr - totals.enteredCr))}
                      </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6 + offset} colSpan={isEditable ? 3 : 2} align="right">
                      <Text style={{ fontSize: 11 }}>
                        Difference: {formatNumber(Math.abs(totals.accountedDr - totals.accountedCr))}
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

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb Header */}
        <div style={{
          padding: '12px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`
        }}>
          <Breadcrumb
            items={[
              { title: <Link to="/home"><HomeOutlined /> Home</Link> },
              { title: <Link to="/gl">General Ledger</Link> },
              { title: 'Manage Journals' },
            ]}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <Text strong style={{ fontSize: 16 }}>Manage Journals</Text>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
              onClick={openCreateJournalTab}
            >
              Create Journal
            </Button>
          </div>
        </div>

        {/* Tabbed Content */}
        <Tabs
          type="editable-card"
          activeKey={activeTabKey}
          onChange={onTabChange}
          onEdit={onTabEdit}
          hideAdd
          style={{ background: REDWOOD.surface }}
          tabBarStyle={{
            margin: 0,
            padding: '4px 16px 0',
            background: REDWOOD.neutral200,
            borderBottom: `2px solid ${REDWOOD.info}`,
          }}
          items={[
            {
              key: 'search',
              label: (
                <span style={{
                  fontSize: 12,
                  fontWeight: activeTabKey === 'search' ? 600 : 400,
                  color: activeTabKey === 'search' ? REDWOOD.info : REDWOOD.neutral600,
                  padding: '4px 8px',
                }}>
                  <SearchOutlined style={{ marginRight: 6 }} />
                  Search
                  {totalCount > 0 && (
                    <Tag color={REDWOOD.info} style={{ fontSize: 10, marginLeft: 8 }}>{totalCount}</Tag>
                  )}
                </span>
              ),
              closable: false,
              children: (
                <div style={{ padding: 16 }}>
          {/* Collapsible Search Card */}
          <Collapse
            activeKey={searchExpanded}
            onChange={(keys) => setSearchExpanded(keys as string[])}
            style={{
              marginBottom: 16,
              borderRadius: 8,
              border: `1px solid ${REDWOOD.neutral200}`,
              background: REDWOOD.surface,
            }}
            expandIconPosition="end"
          >
            <Panel
              header={
                <Space>
                  <FilterOutlined style={{ color: REDWOOD.info, fontSize: 14 }} />
                  <Text strong style={{ fontSize: 13 }}>Search Parameters</Text>
                  {!searchExpanded.includes('search') && journals.length > 0 && (
                    <Tag color={REDWOOD.info} style={{ fontSize: 11 }}>{totalCount} results</Tag>
                  )}
                </Space>
              }
              key="search"
              style={{ borderRadius: 8 }}
            >
              <Form
                form={form}
                layout="horizontal"
                labelCol={{ span: 8 }}
                wrapperCol={{ span: 16 }}
                initialValues={{
                  journalOperator: 'Starts with',
                  batchOperator: 'Starts with',
                }}
              >
                <Row gutter={24}>
                  <Col span={12}>
                    {/* Ledger - Required */}
                    <Form.Item
                      label={<span><span style={{ color: REDWOOD.primary }}>*</span> Ledger</span>}
                      name="ledger"
                      rules={[{ required: true, message: 'Ledger is required' }]}
                    >
                      <Select
                        placeholder="Select ledger"
                        loading={loadingLedgers}
                        onChange={handleLedgerChange}
                      >
                        {ledgers.map(l => (
                          <Option key={l.ledger_id} value={l.ledger_name}>{l.ledger_name}</Option>
                        ))}
                      </Select>
                    </Form.Item>

                    {/* Accounting Period - Required */}
                    <Form.Item
                      label={<span><span style={{ color: REDWOOD.primary }}>*</span> Period</span>}
                      name="accountingPeriod"
                      rules={[{ required: true, message: 'Period is required' }]}
                    >
                      <Select
                        placeholder="Select period"
                        loading={loadingPeriods}
                      >
                        {periods.map(p => (
                          <Option key={p.period_name_id} value={p.period_name_id}>
                            {p.period_year} - {p.period_name_id} ({p.status})
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>

                    {/* Journal Batch */}
                    <Form.Item label="Journal Batch">
                      <Space.Compact style={{ width: '100%' }}>
                        <Form.Item name="batchOperator" noStyle>
                          <Select style={{ width: 120 }}>
                            {operators.map(op => <Option key={op} value={op}>{op}</Option>)}
                          </Select>
                        </Form.Item>
                        <Form.Item name="journalBatch" noStyle>
                          <Input style={{ flex: 1 }} placeholder="Enter batch name" />
                        </Form.Item>
                      </Space.Compact>
                    </Form.Item>
                  </Col>

                  <Col span={12}>
                    {/* Journal Description */}
                    <Form.Item label="Journal Desc">
                      <Space.Compact style={{ width: '100%' }}>
                        <Form.Item name="journalOperator" noStyle>
                          <Select style={{ width: 120 }}>
                            {operators.map(op => <Option key={op} value={op}>{op}</Option>)}
                          </Select>
                        </Form.Item>
                        <Form.Item name="journalDescription" noStyle>
                          <Input style={{ flex: 1 }} placeholder="Enter description" />
                        </Form.Item>
                      </Space.Compact>
                    </Form.Item>

                    {/* Source */}
                    <Form.Item label="Source" name="source">
                      <Input placeholder="Enter source" allowClear />
                    </Form.Item>

                    {/* Batch Status */}
                    <Form.Item label="Batch Status" name="batchStatus">
                      <Select placeholder="Select status" allowClear>
                        {batchStatuses.map(s => <Option key={s} value={s}>{s}</Option>)}
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>

                {/* Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, gap: 8 }}>
                  <Button
                    icon={<SearchOutlined />}
                    onClick={handleSearch}
                    loading={loading}
                  >
                    Search
                  </Button>
                  <Button icon={<ReloadOutlined />} onClick={handleReset}>
                    Reset
                  </Button>
                  <Button icon={<SaveOutlined />}>
                    Save...
                  </Button>
                  <Button
                    icon={<BugOutlined />}
                    onClick={() => setDebugModalVisible(true)}
                    disabled={debugLogs.length === 0}
                  >
                    Debug Log ({debugLogs.length})
                  </Button>
                </div>
              </Form>
            </Panel>
          </Collapse>

          {/* Results Table */}
          <Card
            style={{
              borderRadius: 8,
              border: `1px solid ${REDWOOD.neutral200}`,
            }}
            bodyStyle={{ padding: 0 }}
          >
            {/* Toolbar */}
            <div style={{
              padding: '8px 12px',
              borderBottom: `1px solid ${REDWOOD.neutral200}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: REDWOOD.neutral100,
            }}>
              <Space size="small">
                <Dropdown menu={{ items: actionsMenu }}>
                  <Button size="small" style={{ fontSize: 11 }}>
                    Actions <DownOutlined />
                  </Button>
                </Dropdown>
                <Dropdown menu={{ items: [
                  { key: 'columns', label: 'Columns' },
                  { key: 'detach', label: 'Detach' },
                  { key: 'sort', label: 'Sort' },
                ] }}>
                  <Button size="small" style={{ fontSize: 11 }}>
                    View <DownOutlined />
                  </Button>
                </Dropdown>
                <Dropdown menu={{ items: [
                  { key: 'wrap', label: 'Wrap' },
                  { key: 'resize', label: 'Resize Columns' },
                ] }}>
                  <Button size="small" style={{ fontSize: 11 }}>
                    Format <DownOutlined />
                  </Button>
                </Dropdown>
                <Tooltip title="Create Journal">
                  <Button size="small" icon={<PlusOutlined />} onClick={openCreateJournalTab} />
                </Tooltip>
                <Tooltip title={
                  journals.find(j => j.key === selectedRowKeys[0])?.statusMeaning === 'Posted'
                    ? 'Posted journals cannot be edited'
                    : undefined
                }>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    disabled={
                      selectedRowKeys.length !== 1 ||
                      journals.find(j => j.key === selectedRowKeys[0])?.statusMeaning === 'Posted'
                    }
                    onClick={() => {
                      const selectedJournal = journals.find(j => j.key === selectedRowKeys[0]);
                      if (selectedJournal) openJournalTab(selectedJournal);
                    }}
                  >
                    Edit
                  </Button>
                </Tooltip>
                <Tooltip title="Delete">
                  <Button size="small" icon={<DeleteOutlined />} disabled={selectedRowKeys.length === 0} />
                </Tooltip>
              </Space>
              <Space size="small">
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {totalCount > 0 ? `${totalCount} journals found` : 'No results'}
                </Text>
                <Button
                  size="small"
                  disabled={
                    selectedRowKeys.length === 0 ||
                    journals.filter(j => selectedRowKeys.includes(j.key) && j.statusMeaning !== 'Posted').length === 0
                  }
                  style={{ fontSize: 11, background: selectedRowKeys.length > 0 ? REDWOOD.warning : undefined, color: selectedRowKeys.length > 0 ? '#fff' : undefined, borderColor: selectedRowKeys.length > 0 ? REDWOOD.warning : undefined }}
                  icon={<CheckCircleOutlined />}
                  onClick={handleOpenBulkPost}
                >
                  Post Batch ({journals.filter(j => selectedRowKeys.includes(j.key) && j.statusMeaning !== 'Posted').length})
                </Button>
                <Button size="small" disabled={selectedRowKeys.length === 0} style={{ fontSize: 11 }}>
                  Reverse Batch
                </Button>
                {lastSearchUrl && (
                  <Tooltip
                    title={
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12 }}>
                          Last API Request
                          {lastSearchStatus && (
                            <span style={{
                              marginLeft: 8,
                              color: lastSearchStatus >= 200 && lastSearchStatus < 300 ? '#52c41a' : '#ff4d4f',
                              fontSize: 11,
                            }}>
                              HTTP {lastSearchStatus}
                            </span>
                          )}
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', maxWidth: 460 }}>
                          {lastSearchUrl}
                        </div>
                        <div style={{ marginTop: 6, color: '#aaa', fontSize: 10 }}>Click to copy full URL</div>
                      </div>
                    }
                    overlayStyle={{ maxWidth: 500 }}
                    placement="bottomRight"
                  >
                    <Button
                      size="small"
                      icon={<ApiOutlined />}
                      style={{
                        fontSize: 11,
                        borderColor: lastSearchStatus && lastSearchStatus >= 400 ? REDWOOD.error : REDWOOD.info,
                        color: lastSearchStatus && lastSearchStatus >= 400 ? REDWOOD.error : REDWOOD.info,
                      }}
                      onClick={() => {
                        navigator.clipboard.writeText(lastSearchUrl);
                        setApiUrlCopied(true);
                        message.success('API URL copied to clipboard');
                        setTimeout(() => setApiUrlCopied(false), 2000);
                      }}
                    >
                      {apiUrlCopied ? <><CheckOutlined /> Copied</> : 'API'}
                    </Button>
                  </Tooltip>
                )}
              </Space>
            </div>

            {/* Table */}
            <Table
              rowSelection={rowSelection}
              columns={columns}
              dataSource={journals}
              loading={loading}
              pagination={{
                total: totalCount,
                pageSize: 25,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total) => `Total ${total} journals`,
                size: 'small',
              }}
              scroll={{ x: 1800 }}
              size="small"
              style={{ borderRadius: '0 0 12px 12px', fontSize: 12 }}
              className="compact-table"
              locale={{
                emptyText: 'Click Search to load journals',
              }}
            />
          </Card>
                </div>
              ),
            },
            // Create Journal tab (inline, opens when + or Create Journal button clicked)
            ...(createJournalTabOpen ? [{
              key: 'create-journal',
              label: (
                <span style={{
                  fontSize: 12,
                  fontWeight: activeTabKey === 'create-journal' ? 600 : 400,
                  color: activeTabKey === 'create-journal' ? REDWOOD.primary : REDWOOD.neutral600,
                  padding: '4px 8px',
                }}>
                  <PlusOutlined style={{ marginRight: 6, color: REDWOOD.primary }} />
                  Create Journal
                </span>
              ),
              closable: true,
              children: (
                <CreateJournal
                  embeddedMode
                  onSaved={() => {
                    setCreateJournalTabOpen(false);
                    setActiveTabKey('search');
                  }}
                />
              ),
            }] : []),
            // Dynamic journal edit tabs
            ...openJournalTabs.map(tab => ({
              key: tab.key,
              label: (
                <span style={{
                  fontSize: 12,
                  fontWeight: activeTabKey === tab.key ? 600 : 400,
                  color: activeTabKey === tab.key ? REDWOOD.primary : REDWOOD.neutral600,
                  padding: '4px 8px',
                }}>
                  <FileTextOutlined style={{ marginRight: 6, color: REDWOOD.primary }} />
                  {tab.journal.journalName}
                </span>
              ),
              closable: true,
              children: renderJournalEditPanel(tab.journal, tab.key),
            })),
          ]}
        />
      </Content>

      {/* Floating Connected Icons */}
      <div
        ref={floatingIconsRef}
        style={{
          position: 'fixed',
          right: 24,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Tasks Icon */}
        <Tooltip title={activePanel !== 'tasks' ? 'Tasks' : ''} placement="left">
          <div
            onClick={() => togglePanel('tasks')}
            style={{
              width: 40,
              height: 40,
              borderRadius: '8px 8px 0 0',
              background: activePanel === 'tasks' ? REDWOOD.taskBlue : REDWOOD.surface,
              border: `2px solid ${REDWOOD.taskBlue}`,
              borderBottom: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: activePanel === 'tasks' ? `0 4px 12px ${REDWOOD.taskBlue}40` : '0 2px 8px rgba(0,0,0,0.1)',
              color: activePanel === 'tasks' ? '#fff' : REDWOOD.taskBlue,
              fontSize: 18,
            }}
          >
            <CheckSquareOutlined />
          </div>
        </Tooltip>

        {/* Connector Line */}
        <div style={{
          width: 40,
          height: 2,
          background: REDWOOD.neutral200,
        }} />

        {/* Reports Icon */}
        <Tooltip title={activePanel !== 'reports' ? 'Reports' : ''} placement="left">
          <div
            onClick={() => togglePanel('reports')}
            style={{
              width: 40,
              height: 40,
              borderRadius: '0 0 8px 8px',
              background: activePanel === 'reports' ? REDWOOD.reportGreen : REDWOOD.surface,
              border: `2px solid ${REDWOOD.reportGreen}`,
              borderTop: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: activePanel === 'reports' ? `0 4px 12px ${REDWOOD.reportGreen}40` : '0 2px 8px rgba(0,0,0,0.1)',
              color: activePanel === 'reports' ? '#fff' : REDWOOD.reportGreen,
              fontSize: 18,
            }}
          >
            <BarChartOutlined />
          </div>
        </Tooltip>
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
          <div
            style={{
              position: 'fixed',
              right: 0,
              top: 0,
              bottom: 0,
              width: 300,
              background: REDWOOD.surface,
              boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
              overflow: 'hidden',
              animation: isClosing ? 'slideOut 0.25s ease-in forwards' : 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              zIndex: 1001,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{
              padding: '10px 14px',
              background: REDWOOD.taskBlue,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0,
            }}>
              <Text strong style={{ color: '#fff', fontSize: 14 }}>Tasks</Text>
              <CloseOutlined
                style={{ color: '#fff', cursor: 'pointer', fontSize: 14, padding: 4 }}
                onClick={closePanel}
              />
            </div>
            <div style={{ padding: 10, flex: 1, overflowY: 'auto' }}>
              {taskMenuItems.map((item, index) => (
                <div
                  key={item.key}
                  onClick={() => handleMenuItemClick(item.key, item.path)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    transition: 'all 0.2s ease',
                    marginBottom: 6,
                    border: `1px solid ${REDWOOD.neutral200}`,
                    background: REDWOOD.surface,
                    opacity: 0,
                    animation: `fadeInItem 0.3s ease-out ${index * 0.05}s forwards`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = REDWOOD.neutral100;
                    e.currentTarget.style.borderColor = item.color || REDWOOD.taskBlue;
                    e.currentTarget.style.transform = 'translateX(-4px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = REDWOOD.surface;
                    e.currentTarget.style.borderColor = REDWOOD.neutral200;
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: `${item.color || REDWOOD.taskBlue}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: item.color || REDWOOD.taskBlue,
                    fontSize: 16,
                    flexShrink: 0,
                  }}>
                    {item.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <Text strong style={{ display: 'block', color: REDWOOD.neutral900, fontSize: 12 }}>
                      {item.label}
                    </Text>
                    {item.description && (
                      <Text type="secondary" style={{ fontSize: 10, lineHeight: 1.3 }}>
                        {item.description}
                      </Text>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {activePanel === 'reports' && (
          <div
            style={{
              position: 'fixed',
              right: 0,
              top: 0,
              bottom: 0,
              width: 300,
              background: REDWOOD.surface,
              boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
              overflow: 'hidden',
              animation: isClosing ? 'slideOut 0.25s ease-in forwards' : 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              zIndex: 1001,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{
              padding: '10px 14px',
              background: REDWOOD.reportGreen,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0,
            }}>
              <Text strong style={{ color: '#fff', fontSize: 14 }}>Reports</Text>
              <CloseOutlined
                style={{ color: '#fff', cursor: 'pointer', fontSize: 14, padding: 4 }}
                onClick={closePanel}
              />
            </div>
            <div style={{ padding: 10, flex: 1, overflowY: 'auto' }}>
              {reportMenuItems.map((item, index) => (
                <div
                  key={item.key}
                  onClick={() => handleMenuItemClick(item.key, item.path)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    transition: 'all 0.2s ease',
                    marginBottom: 6,
                    border: `1px solid ${REDWOOD.neutral200}`,
                    background: REDWOOD.surface,
                    opacity: 0,
                    animation: `fadeInItem 0.3s ease-out ${index * 0.05}s forwards`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = REDWOOD.neutral100;
                    e.currentTarget.style.borderColor = item.color || REDWOOD.reportGreen;
                    e.currentTarget.style.transform = 'translateX(-4px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = REDWOOD.surface;
                    e.currentTarget.style.borderColor = REDWOOD.neutral200;
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: `${item.color || REDWOOD.reportGreen}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: item.color || REDWOOD.reportGreen,
                    fontSize: 16,
                    flexShrink: 0,
                  }}>
                    {item.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <Text strong style={{ display: 'block', color: REDWOOD.neutral900, fontSize: 12 }}>
                      {item.label}
                    </Text>
                    {item.description && (
                      <Text type="secondary" style={{ fontSize: 10, lineHeight: 1.3 }}>
                        {item.description}
                      </Text>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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

      {/* Autopilot */}
      <Autopilot />

      {/* ── Bulk Post Modal ─────────────────────────────────────────────────── */}
      {(() => {
        const posted   = bulkPostItems.filter(i => i.status === 'posted').length;
        const failed   = bulkPostItems.filter(i => i.status === 'failed' || i.status === 'validation_failed').length;
        const skipped  = bulkPostItems.filter(i => i.status === 'skipped').length;
        const pending  = bulkPostItems.filter(i => i.status === 'pending').length;
        const posting  = bulkPostItems.filter(i => i.status === 'posting').length;
        const eligible = bulkPostItems.filter(i => i.status !== 'skipped').length;
        const done     = posted + failed;
        const pct      = eligible > 0 ? Math.round((done / eligible) * 100) : 0;

        const statusIcon = (s: BulkPostStatus) => {
          if (s === 'posted')           return <CheckCircleOutlined style={{ color: REDWOOD.success }} />;
          if (s === 'posting')          return <LoadingOutlined style={{ color: REDWOOD.info }} spin />;
          if (s === 'validation_failed') return <WarningOutlined style={{ color: REDWOOD.warning }} />;
          if (s === 'failed')           return <CloseCircleOutlined style={{ color: REDWOOD.error }} />;
          if (s === 'skipped')          return <StopOutlined style={{ color: REDWOOD.neutral600 }} />;
          return <ClockCircleOutlined style={{ color: REDWOOD.neutral300 }} />;
        };

        const statusLabel = (s: BulkPostStatus) => ({
          posted: <Tag color={REDWOOD.success}>Posted</Tag>,
          posting: <Tag color={REDWOOD.info} icon={<LoadingOutlined />}>Posting…</Tag>,
          validation_failed: <Tag color={REDWOOD.warning}>Validation Failed</Tag>,
          failed: <Tag color={REDWOOD.error}>Error</Tag>,
          skipped: <Tag color={REDWOOD.neutral600}>Skipped</Tag>,
          pending: <Tag color={REDWOOD.neutral300}>Pending</Tag>,
        }[s]);

        return (
          <Modal
            title={
              <Space>
                <CheckCircleOutlined style={{ color: REDWOOD.warning }} />
                <span>Bulk Post Journals</span>
                {bulkPostRunning && <Tag color={REDWOOD.info} icon={<LoadingOutlined />}>Running…</Tag>}
                {bulkPostDone   && <Tag color={REDWOOD.success}>Complete</Tag>}
              </Space>
            }
            open={bulkPostVisible}
            width={960}
            maskClosable={!bulkPostRunning}
            closable={!bulkPostRunning}
            onCancel={() => setBulkPostVisible(false)}
            footer={
              bulkPostDone || !bulkPostRunning ? [
                ...(bulkPostDone ? [] : [
                  <Button
                    key="post"
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    style={{ background: REDWOOD.warning, borderColor: REDWOOD.warning }}
                    disabled={eligible === 0}
                    onClick={handleBulkPost}
                  >
                    Post {eligible} Journal{eligible !== 1 ? 's' : ''}
                  </Button>,
                ]),
                <Button key="close" onClick={() => setBulkPostVisible(false)}>
                  {bulkPostDone ? 'Close' : 'Cancel'}
                </Button>,
              ] : []
            }
          >
            {/* ── Summary stat cards ── */}
            <Row gutter={12} style={{ marginBottom: 16 }}>
              {[
                { label: 'Selected',  value: bulkPostItems.length,  color: REDWOOD.neutral900 },
                { label: 'Eligible',  value: eligible,              color: REDWOOD.info },
                { label: 'Skipped',   value: skipped,               color: REDWOOD.neutral600 },
                { label: 'Posted',    value: posted,                color: REDWOOD.success },
                { label: 'Failed',    value: failed,                color: REDWOOD.error },
              ].map(({ label, value, color }) => (
                <Col key={label} span={4}>
                  <Card
                    size="small"
                    bodyStyle={{ padding: '8px 12px', textAlign: 'center' }}
                    style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
                  >
                    <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
                    <div style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{label}</div>
                  </Card>
                </Col>
              ))}
              <Col span={4}>
                <Card
                  size="small"
                  bodyStyle={{ padding: '8px 12px', textAlign: 'center' }}
                  style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
                >
                  <div style={{ fontSize: 22, fontWeight: 700, color: posting > 0 ? REDWOOD.info : REDWOOD.neutral600 }}>
                    {posting > 0 ? <LoadingOutlined /> : (bulkPostDone ? '✓' : '-')}
                  </div>
                  <div style={{ fontSize: 11, color: REDWOOD.neutral600 }}>In Progress</div>
                </Card>
              </Col>
            </Row>

            {/* ── Progress bar (only while running or after completion) ── */}
            {(bulkPostRunning || bulkPostDone) && eligible > 0 && (
              <Progress
                percent={pct}
                status={bulkPostRunning ? 'active' : failed > 0 ? 'exception' : 'success'}
                format={() => `${done} / ${eligible}`}
                style={{ marginBottom: 12 }}
              />
            )}

            {/* ── Journal list table ── */}
            <Table<BulkPostItem>
              size="small"
              pagination={false}
              scroll={{ y: 320 }}
              dataSource={bulkPostItems}
              rowKey="key"
              bordered
              className="compact-table"
              columns={[
                {
                  title: '',
                  key: 'icon',
                  width: 32,
                  align: 'center' as const,
                  render: (_: any, item: BulkPostItem) => statusIcon(item.status),
                },
                {
                  title: 'Journal',
                  dataIndex: ['journal', 'journalName'],
                  key: 'journal',
                  width: 200,
                  ellipsis: true,
                  render: (text: string) => <Text style={{ fontSize: 11 }}>{text}</Text>,
                },
                {
                  title: 'Batch',
                  dataIndex: ['journal', 'batchName'],
                  key: 'batch',
                  width: 180,
                  ellipsis: true,
                  render: (text: string) => <Text style={{ fontSize: 11 }}>{text}</Text>,
                },
                {
                  title: 'Period',
                  dataIndex: ['journal', 'periodName'],
                  key: 'period',
                  width: 90,
                  render: (text: string) => <Text style={{ fontSize: 11 }}>{text}</Text>,
                },
                {
                  title: 'Debit',
                  dataIndex: ['journal', 'enteredDebit'],
                  key: 'dr',
                  width: 110,
                  align: 'right' as const,
                  render: (v: number, item: BulkPostItem) => (
                    <Text style={{ fontSize: 11 }}>
                      {v?.toLocaleString('en-IN', { minimumFractionDigits: 2 })} {item.journal.currencyCode}
                    </Text>
                  ),
                },
                {
                  title: 'Credit',
                  dataIndex: ['journal', 'enteredCredit'],
                  key: 'cr',
                  width: 110,
                  align: 'right' as const,
                  render: (v: number, item: BulkPostItem) => (
                    <Text style={{ fontSize: 11 }}>
                      {v?.toLocaleString('en-IN', { minimumFractionDigits: 2 })} {item.journal.currencyCode}
                    </Text>
                  ),
                },
                {
                  title: 'Status',
                  key: 'status',
                  width: 130,
                  render: (_: any, item: BulkPostItem) => statusLabel(item.status),
                },
                {
                  title: 'Issues',
                  key: 'errors',
                  width: 60,
                  align: 'center' as const,
                  render: (_: any, item: BulkPostItem) => {
                    const allErrors = [
                      ...item.validationErrors,
                      ...(item.serverError ? [item.serverError] : []),
                    ];
                    if (allErrors.length === 0) return null;
                    const tooltipContent = (
                      <ul style={{ margin: 0, paddingLeft: 16, maxWidth: 320 }}>
                        {allErrors.map((e, i) => (
                          <li key={i} style={{ fontSize: 12, marginBottom: 2 }}>{e}</li>
                        ))}
                      </ul>
                    );
                    return (
                      <Tooltip title={tooltipContent} color="#fff" overlayInnerStyle={{ color: '#333' }}>
                        <CloseCircleOutlined style={{ fontSize: 16, color: item.status === 'skipped' ? REDWOOD.neutral600 : REDWOOD.error, cursor: 'pointer' }} />
                      </Tooltip>
                    );
                  },
                },
              ]}
              summary={() => {
                const totalDr = bulkPostItems.reduce((s, i) => s + (i.journal.enteredDebit || 0), 0);
                const totalCr = bulkPostItems.reduce((s, i) => s + (i.journal.enteredCredit || 0), 0);
                return (
                  <Table.Summary.Row style={{ background: REDWOOD.neutral100 }}>
                    <Table.Summary.Cell index={0} colSpan={4}>
                      <Text strong style={{ fontSize: 11 }}>Total ({bulkPostItems.length} journals)</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">
                      <Text strong style={{ fontSize: 11, color: REDWOOD.success }}>
                        {totalDr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">
                      <Text strong style={{ fontSize: 11, color: REDWOOD.primary }}>
                        {totalCr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} colSpan={2} />
                  </Table.Summary.Row>
                );
              }}
            />

            {/* ── Result message after run ── */}
            {bulkPostDone && (
              <Alert
                style={{ marginTop: 12 }}
                type={failed > 0 ? 'warning' : 'success'}
                showIcon
                message={
                  failed > 0
                    ? `Completed with issues: ${posted} posted, ${failed} failed, ${skipped} skipped.`
                    : `All ${posted} journal${posted !== 1 ? 's' : ''} posted successfully!`
                }
              />
            )}
          </Modal>
        );
      })()}

      {/* Debug Log Modal */}
      <Modal
        title={
          <Space>
            <BugOutlined style={{ color: REDWOOD.warning }} />
            <span>Debug Log - API Calls</span>
          </Space>
        }
        open={debugModalVisible}
        onCancel={() => setDebugModalVisible(false)}
        footer={[
          <Button key="clear" onClick={() => setDebugLogs([])}>
            Clear Logs
          </Button>,
          <Button key="close" type="primary" onClick={() => setDebugModalVisible(false)}>
            Close
          </Button>,
        ]}
        width={900}
      >
        <div style={{ maxHeight: 500, overflow: 'auto' }}>
          {debugLogs.length === 0 ? (
            <Text type="secondary">No logs yet. Run a search to see API calls.</Text>
          ) : (
            debugLogs.map((log, index) => (
              <div
                key={index}
                style={{
                  padding: '8px 12px',
                  marginBottom: 8,
                  borderRadius: 6,
                  background:
                    log.type === 'error' ? '#fff2f0' :
                    log.type === 'request' ? '#e6f7ff' :
                    log.type === 'response' ? '#f6ffed' :
                    '#fafafa',
                  border: `1px solid ${
                    log.type === 'error' ? '#ffccc7' :
                    log.type === 'request' ? '#91d5ff' :
                    log.type === 'response' ? '#b7eb8f' :
                    '#d9d9d9'
                  }`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Tag
                    color={
                      log.type === 'error' ? 'error' :
                      log.type === 'request' ? 'processing' :
                      log.type === 'response' ? 'success' :
                      'default'
                    }
                  >
                    {log.type.toUpperCase()}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </Text>
                </div>
                <Text strong style={{ display: 'block', marginBottom: 4 }}>{log.message}</Text>
                {log.data && (
                  <pre
                    style={{
                      margin: 0,
                      padding: 8,
                      background: '#f5f5f5',
                      borderRadius: 4,
                      fontSize: 11,
                      overflow: 'auto',
                      maxHeight: 200,
                    }}
                  >
                    {typeof log.data === 'string' ? log.data : JSON.stringify(log.data, null, 2)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* ── GL Journal Entry View Modal ──────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <AccountBookOutlined style={{ color: REDWOOD.primary }} />
            <span style={{ fontWeight: 600 }}>
              GL Journal Entry — {selectedJournalForView?.journalName}
            </span>
            {selectedJournalForView && getBatchStatusTag(selectedJournalForView.statusMeaning)}
          </Space>
        }
        open={journalViewModalVisible}
        onCancel={() => setJournalViewModalVisible(false)}
        footer={
          <Button onClick={() => setJournalViewModalVisible(false)}>Close</Button>
        }
        width={1300}
        style={{ top: 16 }}
        styles={{ body: { padding: 0, maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' } }}
        destroyOnClose
      >
        {selectedJournalForView && renderJournalEditPanel(
          selectedJournalForView,
          `modal-${selectedJournalForView.jeHeaderId}`
        )}
      </Modal>

      {/* ── AP Transaction Drill-Down Modal ──────────────────────────────── */}
      <Modal
        title={
          <Space>
            <FileTextOutlined style={{ color: REDWOOD.info }} />
            <span style={{ fontWeight: 600 }}>
              {apTransactionType === 'payment' ? 'AP Payment' : 'AP Invoice'} — Transaction Detail
            </span>
          </Space>
        }
        open={apTransactionModalVisible}
        onCancel={() => { setApTransactionModalVisible(false); setApTransactionData(null); setApTransactionError(null); setApTransactionLines([]); }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {apTransactionLastUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                <ApiOutlined style={{ color: REDWOOD.info, flexShrink: 0 }} />
                <Tag color="blue" style={{ flexShrink: 0 }}>GET</Tag>
                <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 480 }}>
                  {apTransactionLastUrl}
                </code>
                <Button
                  size="small"
                  icon={apTransactionCopied ? <CheckOutlined /> : <CopyOutlined />}
                  onClick={() => {
                    navigator.clipboard.writeText(apTransactionLastUrl);
                    setApTransactionCopied(true);
                    setTimeout(() => setApTransactionCopied(false), 2000);
                  }}
                />
              </div>
            ) : <span />}
            <Button onClick={() => { setApTransactionModalVisible(false); setApTransactionData(null); setApTransactionError(null); setApTransactionLines([]); }}>Close</Button>
          </div>
        }
        width={900}
        destroyOnClose
      >
        {apTransactionLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16, color: REDWOOD.neutral600 }}>
              Loading {apTransactionType === 'payment' ? 'payment' : 'invoice'} details…
            </div>
          </div>
        ) : apTransactionError ? (
          <div style={{ padding: '32px 16px' }}>
            <div style={{ background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 6, padding: '16px 20px', marginBottom: 16 }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space>
                  <CloseCircleOutlined style={{ color: REDWOOD.error, fontSize: 16 }} />
                  <Text strong style={{ color: REDWOOD.error }}>Transaction Not Found</Text>
                </Space>
                <Text style={{ fontSize: 12 }}>{apTransactionError}</Text>
              </Space>
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Check the browser console (F12) for detailed debug info including the exact API URL called.
              The reference used to look up this transaction is shown in the API URL in the footer below.
            </Text>
          </div>
        ) : apTransactionData ? (
          apTransactionType === 'payment' ? (
            /* ── Payment detail ── */
            <div>
              <Card
                size="small"
                style={{ marginBottom: 12, borderRadius: 6, borderColor: REDWOOD.neutral200 }}
                headStyle={{ background: REDWOOD.neutral100, fontSize: 13, fontWeight: 600 }}
                title="Payment Information"
              >
                <Descriptions size="small" column={2} bordered labelStyle={{ fontWeight: 500, width: 160 }}>
                  <Descriptions.Item label="Payment Number">{apTransactionData.paymentNumber || apTransactionData.payment_number || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Payment Date">{apTransactionData.paymentDate || apTransactionData.payment_date || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Payee">{apTransactionData.payee || apTransactionData.payee_name || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Status">
                    <Tag color={REDWOOD.success}>{apTransactionData.paymentStatus || apTransactionData.payment_status || '-'}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Payment Amount">{apTransactionData.paymentAmount || apTransactionData.payment_amount || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Currency">{apTransactionData.paymentCurrency || apTransactionData.payment_currency || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Business Unit" span={2}>{apTransactionData.businessUnit || apTransactionData.business_unit || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Payment Method">{apTransactionData.paymentMethod || apTransactionData.payment_method || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Payment Document">{apTransactionData.paymentDocument || apTransactionData.payment_document || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Remit To Address" span={2}>{apTransactionData.remitToAddress || apTransactionData.remit_to_address || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Bank Account">{apTransactionData.remitToAccountNumber || apTransactionData.remit_to_account_number || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Legal Entity">{apTransactionData.legalEntity || apTransactionData.legal_entity || '-'}</Descriptions.Item>
                </Descriptions>
              </Card>
            </div>
          ) : (
            /* ── Invoice detail ── */
            <div>
              <Card
                size="small"
                style={{ marginBottom: 12, borderRadius: 6, borderColor: REDWOOD.neutral200 }}
                headStyle={{ background: REDWOOD.neutral100, fontSize: 13, fontWeight: 600 }}
                title="Invoice Information"
              >
                <Descriptions size="small" column={2} bordered labelStyle={{ fontWeight: 500, width: 160 }}>
                  <Descriptions.Item label="Invoice Number">{apTransactionData.invoice_number || apTransactionData.invoiceNumber || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Invoice Date">{apTransactionData.invoice_date || apTransactionData.invoiceDate || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Supplier">{apTransactionData.supplier || apTransactionData.party || apTransactionData.supplierOrParty || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Supplier Site">{apTransactionData.supplier_site || apTransactionData.supplierSite || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Invoice Amount">{apTransactionData.invoice_amount || apTransactionData.invoiceAmount || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Currency">{apTransactionData.invoice_currency || apTransactionData.invoiceCurrency || apTransactionData.currency_code || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Status">
                    <Tag color={REDWOOD.info}>{apTransactionData.validation_status || apTransactionData.validationStatus || '-'}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Approval Status">
                    <Tag color={REDWOOD.success}>{apTransactionData.approval_status || apTransactionData.approvalStatus || 'N/A'}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Business Unit" span={2}>{apTransactionData.business_unit || apTransactionData.businessUnit || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Unpaid Amount">{apTransactionData.unpaid_amount != null ? apTransactionData.unpaid_amount : (apTransactionData.unpaidAmount ?? '-')}</Descriptions.Item>
                  <Descriptions.Item label="Invoice Type">{apTransactionData.invoice_type || apTransactionData.invoiceType || '-'}</Descriptions.Item>
                </Descriptions>
              </Card>

              {/* Invoice Lines */}
              <Card
                size="small"
                style={{ borderRadius: 6, borderColor: REDWOOD.neutral200 }}
                headStyle={{ background: REDWOOD.neutral100, fontSize: 13, fontWeight: 600 }}
                title={`Invoice Lines${apTransactionLines.length > 0 ? ` (${apTransactionLines.length})` : ''}`}
              >
                {apTransactionLinesLoading ? (
                  <div style={{ textAlign: 'center', padding: 24 }}>
                    <Spin size="small" />
                    <span style={{ marginLeft: 8, color: REDWOOD.neutral600, fontSize: 12 }}>Loading lines…</span>
                  </div>
                ) : (
                  <Table
                    size="small"
                    bordered
                    pagination={false}
                    scroll={{ x: 800 }}
                    locale={{ emptyText: 'No invoice lines found' }}
                    dataSource={apTransactionLines.map((l, i) => ({ ...l, key: l.line_id ?? i }))}
                    columns={[
                      { title: 'Line', dataIndex: 'line_number', key: 'line_number', width: 55 },
                      { title: 'Type', dataIndex: 'line_type', key: 'line_type', width: 80 },
                      { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
                      {
                        title: 'Account',
                        dataIndex: 'distribution_combination',
                        key: 'dist',
                        width: 220,
                        render: (v: string) => (
                          <div>
                            <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{v || '-'}</span>
                            {v && apLineDescMap[v] && (
                              <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginTop: 2 }}>{apLineDescMap[v]}</div>
                            )}
                          </div>
                        ),
                      },
                      { title: 'Amount', dataIndex: 'line_amount', key: 'line_amount', width: 110, align: 'right' as const, render: (v: number) => v != null ? <Text strong style={{ color: v >= 0 ? REDWOOD.info : REDWOOD.error }}>{Number(v).toLocaleString('en-AE', { minimumFractionDigits: 2 })}</Text> : '-' },
                      { title: 'Tax', dataIndex: 'tax_classification_code', key: 'tax', width: 100, render: (v: string) => v || '-' },
                    ]}
                  />
                )}
              </Card>
            </div>
          )
        ) : null}
      </Modal>
    </Layout>
  );
};

export default ManageJournals;
