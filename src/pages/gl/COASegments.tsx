import React, { useState, useRef, useEffect } from 'react';
import {
  Layout,
  Typography,
  Card,
  Button,
  Table,
  Space,
  message,
  Spin,
  Input,
  Empty,
  Breadcrumb,
  Row,
  Col,
  Badge,
  Tabs,
  Progress,
  Radio,
  Tooltip,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  DatabaseOutlined,
  HomeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  AppstoreOutlined,
  SyncOutlined,
  CloudUploadOutlined,
  CheckSquareOutlined,
  BarChartOutlined,
  CloseOutlined,
  CloudOutlined,
  HddOutlined,
  CodeOutlined,
  ClearOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { ORACLE_FUSION_CONFIG, PROXY_CONFIG } from '../../config/api.config';
import Autopilot from '../../components/Autopilot';

// Detect if running in Electron
const isElectron = () => {
  return !!(window as any).electron || navigator.userAgent.toLowerCase().includes('electron');
};

const { Content } = Layout;
const { Text } = Typography;

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

// Interface for Segment
interface Segment {
  key_flex_filed_name_code: string;
  structure_code: string;
  sequence_no: number;
  segment_name: string;
  segment_code: string;
  column_name: string;
  prompt: string;
  enabled: string;
}

// Interface for Value (supports both Fusion and APEX formats)
interface ValueSetValue {
  ValueId: number;
  Value: string;
  Description: string;
  EnabledFlag: string;
  StartDateActive: string;
  EndDateActive: string;
  SortOrder: number;
  SummaryFlag: string | null;
  DetailPostingAllowed: string | null;
  DetailBudgetingAllowed: string | null;
  AccountType: string | null;
  ControlAccount: string | null;
  ReconciliationFlag: string | null;
  FinancialCategory: string | null;
  ExternalDataSource: string | null;
  CreationDate: string | null;
  CreatedBy: string | null;
  LastUpdateDate: string | null;
  LastUpdatedBy: string | null;
}

// Interface for Tab
interface TabItem {
  key: string;
  label: string;
  segment: Segment;
  values: ValueSetValue[];
  loading: boolean;
  syncing: boolean;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  syncMessage: string;
  syncLogs: string[];
  showLogs: boolean;
  showApiInfo: boolean;
  valueSearch: string;
}

// Menu item interface for flyout
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
  { key: 'coa-segments', icon: <AppstoreOutlined />, label: 'COA Segments', description: 'Browse segment values', color: REDWOOD.info, path: '/gl/coa-segments' },
  { key: 'manage-journals', icon: <DatabaseOutlined />, label: 'Manage Journals', description: 'Search and manage journals', color: REDWOOD.primary, path: '/gl/manage-journals' },
  { key: 'chart-of-accounts', icon: <AppstoreOutlined />, label: 'Chart of Accounts', description: 'Manage COA structure', color: REDWOOD.warning, path: '/gl/chart-of-accounts' },
];

// Report menu items
const reportMenuItems: MenuItemType[] = [
  { key: 'trial-balance', icon: <BarChartOutlined />, label: 'Trial Balance', description: 'View trial balance report', color: REDWOOD.reportGreen },
  { key: 'account-analysis', icon: <BarChartOutlined />, label: 'Account Analysis', description: 'Account detail analysis', color: REDWOOD.warning, path: '/gl/account-analysis' },
];

// APEX endpoints
const APEX_SYNC_URL = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/valuesets/addvalues';
const APEX_GET_VALUES_URL = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/valuesets/getvalues';

type DataSource = 'fusion' | 'apex';

const COASegments: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [searchText, setSearchText] = useState('');
  const [tabs, setTabs] = useState<TabItem[]>([]);
  const [activeTabKey, setActiveTabKey] = useState<string>('');
  const [dataSource, setDataSource] = useState<DataSource>('apex');
  const [activePanel, setActivePanel] = useState<'none' | 'tasks' | 'reports'>('none');
  const [isClosing, setIsClosing] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const floatingIconsRef = useRef<HTMLDivElement>(null);
  const segmentsCache = useRef<Segment[]>([]);
  const valuesCache = useRef<Map<string, ValueSetValue[]>>(new Map());

  // Click outside handler for flyout
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

  const handleMenuItemClick = (_key: string, path?: string) => {
    closePanel();
    if (path) {
      navigate(path);
    }
  };

  // Fetch segments from API
  const fetchSegments = async () => {
    if (segmentsCache.current.length > 0) {
      setSegments(segmentsCache.current);
      return;
    }

    setLoading(true);
    try {
      const apiUrl = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/chartofaccounts/structuresegments';
      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      const segmentData = result.items || [];
      setSegments(segmentData);
      segmentsCache.current = segmentData;
      message.success(`Loaded ${segmentData.length} segments`);
    } catch (error) {
      console.error('Error fetching segments:', error);
      message.error('Failed to fetch segments');
    } finally {
      setLoading(false);
    }
  };

  // Fetch values from Fusion API (with pagination - 500 per page until all fetched)
  const fetchValuesFromFusion = async (segmentCode: string): Promise<ValueSetValue[]> => {
    const runningInElectron = isElectron();
    const limit = 500;
    let offset = 0;
    let allItems: ValueSetValue[] = [];
    let hasMore = true;

    const headers: HeadersInit = runningInElectron
      ? {
          'Authorization': `Basic ${btoa(`${ORACLE_FUSION_CONFIG.username}:${ORACLE_FUSION_CONFIG.password}`)}`,
          'Content-Type': 'application/json'
        }
      : { 'Content-Type': 'application/json' };

    while (hasMore) {
      const baseUrl = runningInElectron
        ? `https://iaaobn.fa.ocs.oraclecloud.com:443/fscmRestApi/resources/11.13.18.05/valueSets/${segmentCode}/child/values`
        : `${PROXY_CONFIG.baseUrl}/fusion/fscmRestApi/resources/11.13.18.05/valueSets/${segmentCode}/child/values`;

      const apiUrl = `${baseUrl}?limit=${limit}&offset=${offset}`;
      console.log(`[COASegments] Fetching page: offset=${offset}, limit=${limit}`);

      const response = await fetch(apiUrl, { method: 'GET', headers });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

      const items = result.items || [];
      console.log(`[COASegments] Got ${items.length} items at offset ${offset}`);

      // Map Fusion response to our format (include all fields for APEX sync)
      const mappedItems = items.map((item: any) => ({
        ValueId: item.ValueId,
        Value: item.Value,
        Description: item.Description,
        EnabledFlag: item.EnabledFlag,
        StartDateActive: item.StartDateActive,
        EndDateActive: item.EndDateActive,
        SortOrder: item.SortOrder,
        SummaryFlag: item.SummaryFlag || null,
        DetailPostingAllowed: item.DetailPostingAllowed || null,
        DetailBudgetingAllowed: item.DetailBudgetingAllowed || null,
        AccountType: item.AccountType || null,
        ControlAccount: item.ControlAccount || null,
        ReconciliationFlag: item.ReconciliationFlag || null,
        FinancialCategory: item.FinancialCategory || null,
        ExternalDataSource: item.ExternalDataSource || null,
        CreationDate: item.CreationDate || null,
        CreatedBy: item.CreatedBy || null,
        LastUpdateDate: item.LastUpdateDate || null,
        LastUpdatedBy: item.LastUpdatedBy || null,
      }));

      allItems = [...allItems, ...mappedItems];

      // Check if there are more pages
      if (items.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    console.log(`[COASegments] Total fetched: ${allItems.length} values for ${segmentCode}`);
    return allItems;
  };

  // Fetch values from APEX API
  const fetchValuesFromApex = async (segmentCode: string): Promise<ValueSetValue[]> => {
    const apiUrl = `${APEX_GET_VALUES_URL}/${segmentCode}`;
    const response = await fetch(apiUrl, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();

    // Map APEX response (lowercase) to our format
    return (result.items || []).map((item: any) => ({
      ValueId: item.value_id,
      Value: item.value,
      Description: item.description,
      EnabledFlag: item.enabled_flag,
      StartDateActive: item.start_date_active ? item.start_date_active.substring(0, 10) : '',
      EndDateActive: item.end_date_active ? item.end_date_active.substring(0, 10) : '',
      SortOrder: item.sort_order,
      SummaryFlag: item.summary_flag || null,
      DetailPostingAllowed: item.detail_posting_allowed || null,
      DetailBudgetingAllowed: item.detail_budgeting_allowed || null,
      AccountType: item.account_type || null,
      ControlAccount: item.control_account || null,
      ReconciliationFlag: item.reconciliation_flag || null,
      FinancialCategory: item.financial_category || null,
      ExternalDataSource: item.external_data_source || null,
      CreationDate: item.fusion_creation_date || null,
      CreatedBy: item.fusion_created_by || null,
      LastUpdateDate: item.fusion_last_update_date || null,
      LastUpdatedBy: item.fusion_last_updated_by || null,
    }));
  };

  // Fetch values for a segment (based on data source)
  const fetchValues = async (segmentCode: string): Promise<ValueSetValue[]> => {
    const cacheKey = `${dataSource}_${segmentCode}`;
    if (valuesCache.current.has(cacheKey)) {
      return valuesCache.current.get(cacheKey)!;
    }

    try {
      const values = dataSource === 'fusion'
        ? await fetchValuesFromFusion(segmentCode)
        : await fetchValuesFromApex(segmentCode);

      valuesCache.current.set(cacheKey, values);
      return values;
    } catch (error: any) {
      console.error('[COASegments] Error:', error.message);
      if (dataSource === 'fusion' && !isElectron()) {
        message.error('Failed to fetch from Fusion. Start proxy: node server/proxy.cjs');
      } else {
        message.error(`Failed: ${error.message}`);
      }
      return [];
    }
  };

  // Handle segment click - open new tab
  const handleSegmentClick = async (segment: Segment) => {
    const existingTab = tabs.find(t => t.key === segment.segment_code);
    if (existingTab) {
      setActiveTabKey(segment.segment_code);
      return;
    }

    const newTab: TabItem = {
      key: segment.segment_code,
      label: segment.segment_name,
      segment,
      values: [],
      loading: true,
      syncing: false,
      syncStatus: 'idle',
      syncMessage: '',
      syncLogs: [],
      showLogs: false,
      showApiInfo: false,
      valueSearch: '',
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTabKey(segment.segment_code);

    const values = await fetchValues(segment.segment_code);
    setTabs(prev => prev.map(t =>
      t.key === segment.segment_code ? { ...t, values, loading: false } : t
    ));

    if (values.length > 0) {
      message.success(`Loaded ${values.length} values from ${dataSource === 'fusion' ? 'Fusion' : 'APEX DB'}`);
    }
  };

  // Handle tab close
  const handleTabClose = (targetKey: string) => {
    const newTabs = tabs.filter(t => t.key !== targetKey);
    setTabs(newTabs);
    if (activeTabKey === targetKey && newTabs.length > 0) {
      setActiveTabKey(newTabs[newTabs.length - 1].key);
    } else if (newTabs.length === 0) {
      setActiveTabKey('');
    }
  };

  // Add log to tab
  const addSyncLog = (tabKey: string, log: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setTabs(prev => prev.map(t =>
      t.key === tabKey ? { ...t, syncLogs: [...t.syncLogs, `[${timestamp}] ${log}`] } : t
    ));
  };

  // Toggle log panel
  const toggleLogPanel = (tabKey: string) => {
    setTabs(prev => prev.map(t =>
      t.key === tabKey ? { ...t, showLogs: !t.showLogs } : t
    ));
  };

  // Clear logs
  const clearLogs = (tabKey: string) => {
    setTabs(prev => prev.map(t =>
      t.key === tabKey ? { ...t, syncLogs: [] } : t
    ));
  };

  // Toggle API info panel
  const toggleApiInfo = (tabKey: string) => {
    setTabs(prev => prev.map(t =>
      t.key === tabKey ? { ...t, showApiInfo: !t.showApiInfo } : t
    ));
  };

  // Build the GET values URL for a given tab (for display only)
  const getValuesUrl = (tabKey: string): string => {
    if (dataSource === 'apex') {
      return `${APEX_GET_VALUES_URL}/${tabKey}`;
    }
    const runningInElectron = isElectron();
    const base = runningInElectron
      ? 'https://iaaobn.fa.ocs.oraclecloud.com:443/fscmRestApi/resources/11.13.18.05'
      : `${PROXY_CONFIG.baseUrl}/fusion/fscmRestApi/resources/11.13.18.05`;
    return `${base}/valueSets/${tabKey}/child/values?limit=500&offset=0`;
  };

  // Set value search for a tab
  const setValueSearch = (tabKey: string, search: string) => {
    setTabs(prev => prev.map(t =>
      t.key === tabKey ? { ...t, valueSearch: search } : t
    ));
  };

  // Filter values based on search
  const getFilteredValues = (tab: TabItem) => {
    if (!tab.valueSearch) return tab.values;
    const search = tab.valueSearch.toLowerCase();
    return tab.values.filter(v =>
      v.Value?.toLowerCase().includes(search) ||
      v.Description?.toLowerCase().includes(search) ||
      v.AccountType?.toLowerCase().includes(search)
    );
  };

  // Batch size for sync (APEX has CLOB length limits)
  const BATCH_SIZE = 5;

  // Sync values to APEX database with batching
  // testLimit: 0 = all, 1 = first 1, 5 = first 5, etc.
  const handleSyncToDb = async (tab: TabItem, testLimit: number = 0) => {
    if (tab.values.length === 0) {
      message.warning('No values to sync');
      return;
    }

    // Clear previous logs and start fresh
    setTabs(prev => prev.map(t =>
      t.key === tab.key ? { ...t, syncing: true, syncStatus: 'syncing', syncMessage: 'Preparing data...', syncLogs: [], showLogs: true } : t
    ));

    // Use limited items if testLimit > 0, otherwise all
    const itemsToSync = testLimit > 0 ? tab.values.slice(0, testLimit) : tab.values;
    const testMode = testLimit > 0;

    // Calculate batches
    const totalBatches = Math.ceil(itemsToSync.length / BATCH_SIZE);
    let totalInserted = 0;
    let hasError = false;

    addSyncLog(tab.key, '========== BATCH SYNC REQUEST ==========');
    addSyncLog(tab.key, `POST URL: ${APEX_SYNC_URL}`);
    addSyncLog(tab.key, testMode ? `🧪 TEST MODE: First ${testLimit} items` : '📦 FULL SYNC');
    addSyncLog(tab.key, `Value Set Code: ${tab.key}`);
    addSyncLog(tab.key, `Total Items: ${itemsToSync.length}`);
    addSyncLog(tab.key, `Batch Size: ${BATCH_SIZE}`);
    addSyncLog(tab.key, `Total Batches: ${totalBatches}`);

    try {
      for (let batchNum = 0; batchNum < totalBatches && !hasError; batchNum++) {
        const startIdx = batchNum * BATCH_SIZE;
        const endIdx = Math.min(startIdx + BATCH_SIZE, itemsToSync.length);
        const batchItems = itemsToSync.slice(startIdx, endIdx);

        addSyncLog(tab.key, `---------- BATCH ${batchNum + 1}/${totalBatches} ----------`);
        addSyncLog(tab.key, `Items ${startIdx + 1} to ${endIdx} (${batchItems.length} items)`);

        setTabs(prev => prev.map(t =>
          t.key === tab.key ? { ...t, syncMessage: `Batch ${batchNum + 1}/${totalBatches}: Syncing ${batchItems.length} items...` } : t
        ));

        const postBody = { valueSetCode: tab.key, items: batchItems };
        const bodyJson = JSON.stringify(postBody);

        const response = await fetch(APEX_SYNC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bodyJson,
        });

        const responseText = await response.text();
        addSyncLog(tab.key, `Response: ${responseText}`);

        let result;
        try {
          result = JSON.parse(responseText);
        } catch {
          result = { success: false, error: responseText };
        }

        if (result.success) {
          const inserted = result.insertedCount || batchItems.length;
          totalInserted += inserted;
          addSyncLog(tab.key, `✅ Batch ${batchNum + 1}: Inserted ${inserted} records`);
        } else {
          hasError = true;
          addSyncLog(tab.key, `❌ Batch ${batchNum + 1} FAILED: ${result.error || 'Unknown error'}`);
          throw new Error(result.error || `Batch ${batchNum + 1} failed`);
        }

        // Small delay between batches to avoid overwhelming the server
        if (batchNum < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      addSyncLog(tab.key, '========== SYNC COMPLETE ==========');
      addSyncLog(tab.key, `✅ Total Inserted: ${totalInserted}/${itemsToSync.length}`);

      setTabs(prev => prev.map(t =>
        t.key === tab.key ? { ...t, syncing: false, syncStatus: 'success', syncMessage: `✓ Synced ${totalInserted}/${itemsToSync.length} values` } : t
      ));
      message.success(`Successfully synced ${totalInserted} values in ${totalBatches} batches`);

    } catch (error: any) {
      addSyncLog(tab.key, `❌ EXCEPTION: ${error.message}`);
      addSyncLog(tab.key, `Partial sync: ${totalInserted} records synced before error`);
      setTabs(prev => prev.map(t =>
        t.key === tab.key ? { ...t, syncing: false, syncStatus: 'error', syncMessage: `✗ Error: ${error.message} (${totalInserted} synced)` } : t
      ));
      message.error(`Sync failed: ${error.message}`);
    }
  };

  // Handle data source change
  const handleDataSourceChange = (source: DataSource) => {
    setDataSource(source);
    valuesCache.current.clear();
    setTabs([]);
    setActiveTabKey('');
    message.info(`Data source changed to ${source === 'fusion' ? 'Oracle Fusion' : 'APEX Database'}`);
  };

  // Handle refresh
  const handleRefresh = () => {
    segmentsCache.current = [];
    valuesCache.current.clear();
    setSegments([]);
    setTabs([]);
    setActiveTabKey('');
    fetchSegments();
  };

  // Filter segments
  const filteredSegments = segments.filter(seg =>
    seg.segment_name?.toLowerCase().includes(searchText.toLowerCase()) ||
    seg.column_name?.toLowerCase().includes(searchText.toLowerCase())
  );

  const isSegmentOpen = (segmentCode: string) => tabs.some(t => t.key === segmentCode);

  // Segment item component
  const SegmentItem = ({ segment }: { segment: Segment }) => {
    const isOpen = isSegmentOpen(segment.segment_code);
    const isActive = activeTabKey === segment.segment_code;

    return (
      <div
        onClick={() => handleSegmentClick(segment)}
        style={{
          padding: '8px 12px',
          borderRadius: 6,
          border: isActive ? `2px solid ${REDWOOD.info}` : isOpen ? `1px solid ${REDWOOD.info}` : `1px solid ${REDWOOD.neutral200}`,
          background: isActive ? `${REDWOOD.info}10` : isOpen ? `${REDWOOD.info}05` : REDWOOD.surface,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
        onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = `${REDWOOD.info}08`; e.currentTarget.style.borderColor = REDWOOD.info; }}}
        onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = isOpen ? `${REDWOOD.info}05` : REDWOOD.surface; e.currentTarget.style.borderColor = isOpen ? REDWOOD.info : REDWOOD.neutral200; }}}
      >
        <div style={{ width: 24, height: 24, borderRadius: 4, background: isActive ? REDWOOD.info : REDWOOD.neutral200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isActive ? '#fff' : REDWOOD.neutral600, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
          {segment.sequence_no}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text strong style={{ color: REDWOOD.neutral900, fontSize: 12 }}>{segment.segment_name}</Text>
          <Text type="secondary" style={{ fontSize: 10, marginLeft: 4 }}>({segment.column_name})</Text>
        </div>
        {isOpen && <div style={{ width: 6, height: 6, borderRadius: '50%', background: REDWOOD.info }} />}
      </div>
    );
  };

  // Floating Icon component
  const FloatingIcon = ({ icon, label, color, isActive, onClick, position }: { icon: React.ReactNode; label: string; color: string; isActive: boolean; onClick: () => void; position: 'top' | 'bottom' }) => (
    <Tooltip title={!isActive ? label : ''} placement="left">
      <div onClick={onClick} style={{ width: 40, height: 40, borderRadius: position === 'top' ? '8px 8px 0 0' : '0 0 8px 8px', background: isActive ? color : REDWOOD.surface, border: `2px solid ${color}`, borderBottom: position === 'top' ? 'none' : `2px solid ${color}`, borderTop: position === 'bottom' ? 'none' : `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.3s ease', boxShadow: isActive ? `0 4px 12px ${color}40` : '0 2px 8px rgba(0,0,0,0.1)', color: isActive ? '#fff' : color, fontSize: 18 }}>
        {icon}
      </div>
    </Tooltip>
  );

  // Slide Panel component
  const SlidePanel = ({ title, items, color }: { title: string; items: MenuItemType[]; color: string }) => (
    <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 280, background: REDWOOD.surface, boxShadow: '-4px 0 24px rgba(0,0,0,0.15)', overflow: 'hidden', animation: isClosing ? 'slideOut 0.25s ease-in forwards' : 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards', zIndex: 1001, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 14px', background: color, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <Text strong style={{ color: '#fff', fontSize: 14 }}>{title}</Text>
        <CloseOutlined style={{ color: '#fff', cursor: 'pointer', fontSize: 14, padding: 4 }} onClick={closePanel} />
      </div>
      <div style={{ padding: 10, flex: 1, overflowY: 'auto' }}>
        {items.map((item, index) => (
          <div key={item.key} onClick={() => handleMenuItemClick(item.key, item.path)} style={{ padding: '8px 10px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.2s ease', marginBottom: 6, border: `1px solid ${REDWOOD.neutral200}`, background: REDWOOD.surface, opacity: 0, animation: `fadeInItem 0.3s ease-out ${index * 0.05}s forwards` }}
            onMouseEnter={(e) => { e.currentTarget.style.background = REDWOOD.neutral100; e.currentTarget.style.borderColor = color; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = REDWOOD.surface; e.currentTarget.style.borderColor = REDWOOD.neutral200; }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color, fontSize: 16, flexShrink: 0 }}>{item.icon}</div>
            <div style={{ flex: 1 }}>
              <Text strong style={{ display: 'block', color: REDWOOD.neutral900, fontSize: 12 }}>{item.label}</Text>
              {item.description && <Text type="secondary" style={{ fontSize: 10, lineHeight: 1.3 }}>{item.description}</Text>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Values table columns with AccountType
  const valueColumns = [
    { title: 'Value', dataIndex: 'Value', key: 'Value', width: 80, render: (text: string) => <Text strong style={{ fontSize: 12 }}>{text}</Text> },
    { title: 'Description', dataIndex: 'Description', key: 'Description', ellipsis: true, render: (text: string) => <Text style={{ fontSize: 12 }}>{text}</Text> },
    { title: 'Account Type', dataIndex: 'AccountType', key: 'AccountType', width: 100, render: (text: string) => <Text style={{ fontSize: 11 }}>{text || '-'}</Text> },
    { title: 'Enabled', dataIndex: 'EnabledFlag', key: 'EnabledFlag', width: 60, align: 'center' as const, render: (flag: string) => (flag === 'Y' || flag === 'true' ? <CheckCircleOutlined style={{ color: REDWOOD.success, fontSize: 14 }} /> : <CloseCircleOutlined style={{ color: REDWOOD.neutral300, fontSize: 14 }} />) },
    { title: 'Start Date', dataIndex: 'StartDateActive', key: 'StartDateActive', width: 90, render: (date: string) => <Text style={{ fontSize: 11 }}>{date ? date.substring(0, 10) : '-'}</Text> },
    { title: 'End Date', dataIndex: 'EndDateActive', key: 'EndDateActive', width: 90, render: (date: string) => <Text style={{ fontSize: 11 }}>{date ? date.substring(0, 10) : '-'}</Text> },
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Header */}
        <div style={{ padding: '8px 20px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: REDWOOD.info, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AppstoreOutlined style={{ fontSize: 14, color: '#fff' }} />
            </div>
            <Text strong style={{ fontSize: 14, color: REDWOOD.neutral900 }}>COA Segments</Text>
            <Breadcrumb style={{ marginLeft: 8 }} items={[{ title: <Link to="/home"><HomeOutlined /></Link> }, { title: <Link to="/gl">GL</Link> }]} />
          </div>
          <Space size="middle">
            {/* Data Source Toggle */}
            <Radio.Group value={dataSource} onChange={(e) => handleDataSourceChange(e.target.value)} size="small" buttonStyle="solid">
              <Radio.Button value="fusion"><CloudOutlined /> Fusion</Radio.Button>
              <Radio.Button value="apex"><HddOutlined /> APEX DB</Radio.Button>
            </Radio.Group>
            <Button size="small" icon={<ReloadOutlined />} onClick={handleRefresh}>Refresh</Button>
            <Button size="small" type="primary" icon={<PlusOutlined />} style={{ background: REDWOOD.info }}>Add Value Set</Button>
          </Space>
        </div>

        {/* Main Content */}
        <div style={{ padding: 16, paddingRight: 80, height: 'calc(100vh - 120px)' }}>
          <Row gutter={16} style={{ height: '100%' }}>
            {/* Left Panel */}
            <Col xs={24} lg={7} xl={5} style={{ height: '100%' }}>
              <Card size="small" style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, height: '100%', display: 'flex', flexDirection: 'column' }} bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ padding: 12, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text strong style={{ fontSize: 12, color: REDWOOD.neutral900 }}>Segments</Text>
                    <Badge count={segments.length} style={{ backgroundColor: REDWOOD.info }} />
                  </div>
                  <Input size="small" placeholder="Search..." prefix={<SearchOutlined style={{ color: REDWOOD.neutral300, fontSize: 12 }} />} value={searchText} onChange={(e) => setSearchText(e.target.value)} style={{ borderRadius: 6 }} allowClear />
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
                  {segments.length === 0 && !loading ? (
                    <div style={{ textAlign: 'center', padding: '30px 16px' }}>
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} imageStyle={{ height: 40 }} description={<Text type="secondary" style={{ fontSize: 11 }}>Click to load segments</Text>}>
                        <Button size="small" type="primary" icon={<DatabaseOutlined />} onClick={fetchSegments} style={{ background: REDWOOD.info }}>Fetch Segments</Button>
                      </Empty>
                    </div>
                  ) : (
                    <Spin spinning={loading}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {filteredSegments.sort((a, b) => a.sequence_no - b.sequence_no).map((segment) => (
                          <SegmentItem key={segment.segment_code} segment={segment} />
                        ))}
                      </div>
                    </Spin>
                  )}
                </div>
              </Card>
            </Col>

            {/* Right Panel */}
            <Col xs={24} lg={17} xl={19} style={{ height: '100%' }}>
              <Card size="small" style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, height: '100%' }} bodyStyle={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
                {tabs.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: REDWOOD.neutral100 }}>
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} imageStyle={{ height: 60 }} description={
                      <div style={{ textAlign: 'center' }}>
                        <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Click on a segment to open its values</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>Source: <Text strong>{dataSource === 'fusion' ? 'Oracle Fusion' : 'APEX Database'}</Text></Text>
                      </div>
                    } />
                  </div>
                ) : (
                  <Tabs type="editable-card" activeKey={activeTabKey} onChange={setActiveTabKey} onEdit={(targetKey, action) => { if (action === 'remove') handleTabClose(targetKey as string); }} hideAdd style={{ height: '100%' }} tabBarStyle={{ margin: 0, padding: '0 8px', background: REDWOOD.neutral100 }}
                    items={tabs.map(tab => ({
                      key: tab.key,
                      label: (<span style={{ fontSize: 12 }}><Badge count={tab.segment.sequence_no} style={{ backgroundColor: activeTabKey === tab.key ? REDWOOD.info : REDWOOD.neutral300, fontSize: 10, marginRight: 6 }} />{tab.label}</span>),
                      closable: true,
                      children: (
                        <div style={{ height: 'calc(100vh - 220px)', overflow: 'auto' }}>
                          {tab.loading ? (
                            <div style={{ padding: 40, textAlign: 'center' }}><Spin tip="Loading values..." /></div>
                          ) : (
                            <>
                              {/* Toolbar with segment code */}
                              <div style={{ padding: '8px 12px', borderBottom: `1px solid ${REDWOOD.neutral200}`, background: REDWOOD.neutral100, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Space>
                                  <Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{getFilteredValues(tab).length}/{tab.values.length} values</Text>
                                  <Text code style={{ fontSize: 10 }}>{tab.key}</Text>
                                  <Input
                                    size="small"
                                    placeholder="Search values..."
                                    prefix={<SearchOutlined style={{ color: REDWOOD.neutral300, fontSize: 11 }} />}
                                    value={tab.valueSearch}
                                    onChange={(e) => setValueSearch(tab.key, e.target.value)}
                                    style={{ width: 180, fontSize: 11 }}
                                    allowClear
                                  />
                                  {tab.syncStatus === 'success' && <Text style={{ fontSize: 11, color: REDWOOD.success }}>{tab.syncMessage}</Text>}
                                  {tab.syncStatus === 'error' && <Text style={{ fontSize: 11, color: REDWOOD.primary }}>{tab.syncMessage}</Text>}
                                </Space>
                                <Space>
                                  <Tooltip title={tab.showApiInfo ? 'Hide API Info' : 'Show API Endpoints'}>
                                    <Button size="small" icon={<ApiOutlined />} onClick={() => toggleApiInfo(tab.key)} type={tab.showApiInfo ? 'primary' : 'default'} style={tab.showApiInfo ? { background: REDWOOD.info } : { borderColor: REDWOOD.info, color: REDWOOD.info }}>
                                      API
                                    </Button>
                                  </Tooltip>
                                  <Tooltip title={tab.showLogs ? 'Hide Logs' : 'Show Logs'}>
                                    <Button size="small" icon={<CodeOutlined />} onClick={() => toggleLogPanel(tab.key)} type={tab.showLogs ? 'primary' : 'default'} style={tab.showLogs ? { background: REDWOOD.warning } : {}}>
                                      {tab.syncLogs.length > 0 ? `Logs (${tab.syncLogs.length})` : 'Logs'}
                                    </Button>
                                  </Tooltip>
                                  <Tooltip title={tab.values.length === 0 ? 'No values loaded' : 'Test sync with 1 item only'}>
                                    <Button size="small" onClick={() => handleSyncToDb(tab, 1)} disabled={tab.syncing || tab.values.length === 0} style={{ borderColor: REDWOOD.success, color: REDWOOD.success }}>
                                      Test (1)
                                    </Button>
                                  </Tooltip>
                                  <Tooltip title={tab.values.length === 0 ? 'No values loaded' : 'Test sync with first 5 items'}>
                                    <Button size="small" onClick={() => handleSyncToDb(tab, 5)} disabled={tab.syncing || tab.values.length === 0} style={{ borderColor: REDWOOD.warning, color: REDWOOD.warning }}>
                                      Test (5)
                                    </Button>
                                  </Tooltip>
                                  <Tooltip title={tab.values.length === 0 ? 'No values loaded' : 'Sync all values to APEX DB'}>
                                    <Button type="primary" size="small" icon={tab.syncing ? <SyncOutlined spin /> : <CloudUploadOutlined />} onClick={() => handleSyncToDb(tab, 0)} disabled={tab.syncing || tab.values.length === 0} style={{ background: tab.syncStatus === 'success' ? REDWOOD.success : REDWOOD.info }}>
                                      {tab.syncing ? 'Syncing...' : 'Sync to DB'}
                                    </Button>
                                  </Tooltip>
                                </Space>
                              </div>
                              {/* API Info Panel */}
                              {tab.showApiInfo && (
                                <div style={{ borderBottom: `1px solid ${REDWOOD.neutral200}`, background: '#f0f5ff', padding: '8px 12px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <Text strong style={{ fontSize: 11, color: REDWOOD.info }}>API Endpoints</Text>
                                    <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => toggleApiInfo(tab.key)} style={{ color: REDWOOD.neutral600 }} />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                      <Text type="secondary" style={{ fontSize: 10, minWidth: 70 }}>GET Values:</Text>
                                      <Text code style={{ fontSize: 10, wordBreak: 'break-all' }}>{getValuesUrl(tab.key)}</Text>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                      <Text type="secondary" style={{ fontSize: 10, minWidth: 70 }}>POST Sync:</Text>
                                      <Text code style={{ fontSize: 10, wordBreak: 'break-all' }}>{APEX_SYNC_URL}</Text>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <Text type="secondary" style={{ fontSize: 10, minWidth: 70 }}>Source:</Text>
                                      <Text style={{ fontSize: 10 }}>{dataSource === 'fusion' ? (isElectron() ? 'Oracle Fusion (Electron — direct)' : 'Oracle Fusion (proxy)') : 'APEX Database (direct)'}</Text>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {/* Sync Progress */}
                              {tab.syncing && (
                                <div style={{ padding: '8px 12px', background: '#E6F7FF', borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <Progress percent={100} status="active" showInfo={false} size="small" style={{ flex: 1 }} />
                                    <Text style={{ fontSize: 11, color: REDWOOD.info }}>{tab.syncMessage}</Text>
                                  </div>
                                </div>
                              )}
                              {/* Log Panel */}
                              {tab.showLogs && (
                                <div style={{ borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
                                  <div style={{ padding: '6px 12px', background: '#1A1A1A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text style={{ color: '#00FF00', fontSize: 11 }}>Sync Log</Text>
                                    <Space size="small">
                                      <Button size="small" type="text" icon={<ClearOutlined />} onClick={() => clearLogs(tab.key)} style={{ color: '#888', fontSize: 10 }}>Clear</Button>
                                      <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => toggleLogPanel(tab.key)} style={{ color: '#888' }} />
                                    </Space>
                                  </div>
                                  <div style={{ background: '#1A1A1A', color: '#00FF00', padding: 12, fontFamily: 'monospace', fontSize: 11, maxHeight: 200, overflowY: 'auto' }}>
                                    {tab.syncLogs.length === 0 ? (
                                      <div style={{ color: '#888' }}>Click "Sync to DB" to see request logs...</div>
                                    ) : (
                                      tab.syncLogs.map((log, i) => (
                                        <div key={i} style={{ marginBottom: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{log}</div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              )}
                              <Table columns={valueColumns} dataSource={getFilteredValues(tab)} rowKey="Value" size="small" pagination={{ size: 'small', pageSize: 20, showSizeChanger: false, showTotal: (total) => <Text style={{ fontSize: 11 }}>{total} values</Text> }} className="compact-table" />
                            </>
                          )}
                        </div>
                      ),
                    }))}
                  />
                )}
              </Card>
            </Col>
          </Row>
        </div>

        {/* Floating Icons */}
        <div ref={floatingIconsRef} style={{ position: 'fixed', right: 24, top: '50%', transform: 'translateY(-50%)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
          <FloatingIcon icon={<CheckSquareOutlined />} label="Tasks" color={REDWOOD.taskBlue} isActive={activePanel === 'tasks'} onClick={() => togglePanel('tasks')} position="top" />
          <div style={{ width: 40, height: 2, background: REDWOOD.neutral200 }} />
          <FloatingIcon icon={<BarChartOutlined />} label="Reports" color={REDWOOD.reportGreen} isActive={activePanel === 'reports'} onClick={() => togglePanel('reports')} position="bottom" />
        </div>

        {/* Backdrop */}
        {activePanel !== 'none' && (
          <div onClick={closePanel} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1000, animation: isClosing ? 'fadeOut 0.25s ease forwards' : 'fadeIn 0.3s ease forwards' }} />
        )}

        {/* Slide Panels */}
        <div ref={panelRef}>
          {activePanel === 'tasks' && <SlidePanel title="Tasks" items={taskMenuItems} color={REDWOOD.taskBlue} />}
          {activePanel === 'reports' && <SlidePanel title="Reports" items={reportMenuItems} color={REDWOOD.reportGreen} />}
        </div>
      </Content>

      <Autopilot />

      <style>{`
        .compact-table .ant-table-tbody > tr > td { padding: 6px 8px !important; }
        .compact-table .ant-table-thead > tr > th { padding: 8px !important; background: ${REDWOOD.neutral100} !important; font-size: 11px !important; }
        .ant-tabs-content { height: 100%; }
        .ant-tabs-tabpane { height: 100%; }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes slideOut { from { transform: translateX(0); } to { transform: translateX(100%); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes fadeInItem { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </Layout>
  );
};

export default COASegments;
