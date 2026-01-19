import React, { useState, useEffect } from 'react';
import {
  Layout,
  Typography,
  Card,
  Breadcrumb,
  Space,
  Button,
  Table,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  message,
  Spin,
  Tag,
  Tooltip,
  Divider,
  Empty,
  Popconfirm,
  Row,
  Col,
  Tabs,
  Collapse,
} from 'antd';
import {
  HomeOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  EyeOutlined,
  SaveOutlined,
  FileTextOutlined,
  FileExcelOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  AppstoreOutlined,
  CalculatorOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  BankOutlined,
  FilePdfOutlined,
  PrinterOutlined,
  DownOutlined,
  RightOutlined,
  CaretDownOutlined,
  CaretRightOutlined,
  BugOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import Autopilot from '../../components/Autopilot';
import * as plService from '../../services/pl-templates.service';
import { APEX_DB_CONFIG } from '../../config/api.config';

const { Content } = Layout;
const { Title, Text } = Typography;
const { TextArea } = Input;

// Oracle Redwood Color Palette
const REDWOOD = {
  primary: '#C74634',
  primaryLight: '#E85D4A',
  success: '#1D7B4D',
  warning: '#D4A800',
  info: '#0572CE',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral300: '#C7C7C7',
  neutral600: '#6B6B6B',
  neutral900: '#1A1A1A',
  surface: '#FFFFFF',
};

// Group type colors
const GROUP_TYPE_COLORS: Record<string, string> = {
  REVENUE: '#52c41a',
  EXPENSE: '#f5222d',
  OTHER_INCOME: '#1890ff',
  OTHER_EXPENSE: '#fa8c16',
  TAX: '#722ed1',
  COMPREHENSIVE: '#13c2c2',
  CALCULATED: '#8c8c8c',
};

interface TemplateTab {
  key: string;
  label: string;
  templateId: number;
  template: plService.PLTemplateStructure | null;
  loading: boolean;
}

interface ReportPeriod {
  year: number;
  num: number;
  name?: string;
}

interface ReportTab {
  key: string;
  label: string;
  templateId: number;
  periodYear: number;
  periodNum: number;
  ledgerId: number;  // Ledger ID
  periods: ReportPeriod[];  // For multi-period comparison
  report: plService.PLReport | null;
  reports: plService.PLReport[];  // For multi-period comparison
  loading: boolean;
}

const IncomeStatementTemplates: React.FC = () => {
  // State
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<plService.PLTemplate[]>([]);
  const [activeTabKey, setActiveTabKey] = useState('list');
  const [templateTabs, setTemplateTabs] = useState<TemplateTab[]>([]);

  // Modal states
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [sectionModalVisible, setSectionModalVisible] = useState(false);
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [totalModalVisible, setTotalModalVisible] = useState(false);
  const [cloneModalVisible, setCloneModalVisible] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [excelModalVisible, setExcelModalVisible] = useState(false);
  const [excelTemplate, setExcelTemplate] = useState<plService.PLTemplateStructure | null>(null);

  // Report states
  const [reportTabs, setReportTabs] = useState<ReportTab[]>([]);
  const [reportPeriodModalVisible, setReportPeriodModalVisible] = useState(false);
  const [reportTemplateId, setReportTemplateId] = useState<number | null>(null);
  const [reportTemplateName, setReportTemplateName] = useState<string>('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [selectedPeriods, setSelectedPeriods] = useState<ReportPeriod[]>([]);

  // Debug states
  const [debugModalVisible, setDebugModalVisible] = useState(false);
  const [debugData, setDebugData] = useState<any>(null);
  const [debugLoading, setDebugLoading] = useState(false);

  // PDF Preview states
  const [pdfPreviewVisible, setPdfPreviewVisible] = useState(false);
  const [pdfPreviewContent, setPdfPreviewContent] = useState<string>('');

  // Ledger states
  const [ledgers, setLedgers] = useState<{ ledger_id: number; ledger_name: string }[]>([]);
  const [selectedLedgerId, setSelectedLedgerId] = useState<number | null>(null);
  const [loadingLedgers, setLoadingLedgers] = useState(false);

  // Edit context
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [cloneTemplateId, setCloneTemplateId] = useState<number | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<plService.PLTemplateStructure | null>(null);

  // Forms
  const [templateForm] = Form.useForm();
  const [groupForm] = Form.useForm();
  const [sectionForm] = Form.useForm();
  const [accountForm] = Form.useForm();
  const [totalForm] = Form.useForm();
  const [cloneForm] = Form.useForm();
  const [reportPeriodForm] = Form.useForm();

  // GL Accounts state
  const [glAccounts, setGlAccounts] = useState<plService.GLAccount[]>([]);
  const [glAccountsLoading, setGlAccountsLoading] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [accountSearchText, setAccountSearchText] = useState('');

  // Load GL accounts
  const loadGLAccounts = async () => {
    setGlAccountsLoading(true);
    try {
      const response = await plService.getGLAccounts();
      if (response.success && response.data) {
        setGlAccounts(response.data);
      } else {
        message.error(response.error || 'Failed to load GL accounts');
      }
    } catch (error) {
      message.error('Failed to load GL accounts');
    }
    setGlAccountsLoading(false);
  };

  // Load templates and ledgers on mount
  useEffect(() => {
    loadTemplates();
    loadLedgers();
  }, []);

  const loadLedgers = async () => {
    setLoadingLedgers(true);
    try {
      const response = await fetch(`${APEX_DB_CONFIG.baseUrl.replace('/reerp', '/reerp')}/ledgers`);
      const data = await response.json();
      if (data.items && data.items.length > 0) {
        setLedgers(data.items);
        // Auto-select first ledger
        setSelectedLedgerId(data.items[0].ledger_id);
      }
    } catch (error) {
      console.error('Error fetching ledgers:', error);
    }
    setLoadingLedgers(false);
  };

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const response = await plService.getTemplates();
      if (response.success && response.data) {
        setTemplates(response.data);
      } else {
        message.error(response.error || 'Failed to load templates');
      }
    } catch (error) {
      message.error('Failed to load templates');
    }
    setLoading(false);
  };

  const loadTemplateStructure = async (templateId: number, tabKey: string) => {
    // Update tab loading state
    setTemplateTabs(prev => prev.map(t =>
      t.key === tabKey ? { ...t, loading: true } : t
    ));

    try {
      const response = await plService.getTemplateStructure(templateId);
      if (response.success && response.data) {
        setTemplateTabs(prev => prev.map(t =>
          t.key === tabKey ? { ...t, template: response.data!, loading: false } : t
        ));
      } else {
        message.error(response.error || 'Failed to load template structure');
        setTemplateTabs(prev => prev.map(t =>
          t.key === tabKey ? { ...t, loading: false } : t
        ));
      }
    } catch (error) {
      message.error('Failed to load template structure');
      setTemplateTabs(prev => prev.map(t =>
        t.key === tabKey ? { ...t, loading: false } : t
      ));
    }
  };

  const openTemplateTab = (template: plService.PLTemplate) => {
    const tabKey = `template-${template.template_id}`;

    // Check if tab already exists
    const existingTab = templateTabs.find(t => t.key === tabKey);
    if (existingTab) {
      setActiveTabKey(tabKey);
      return;
    }

    // Create new tab
    const newTab: TemplateTab = {
      key: tabKey,
      label: template.template_name,
      templateId: template.template_id,
      template: null,
      loading: true,
    };

    setTemplateTabs(prev => [...prev, newTab]);
    setActiveTabKey(tabKey);
    loadTemplateStructure(template.template_id, tabKey);
  };

  const closeTemplateTab = (tabKey: string) => {
    // Check if it's a template tab
    if (tabKey.startsWith('template-')) {
      const newTabs = templateTabs.filter(t => t.key !== tabKey);
      setTemplateTabs(newTabs);

      if (activeTabKey === tabKey) {
        const allTabs = [...newTabs, ...reportTabs];
        setActiveTabKey(allTabs.length > 0 ? allTabs[allTabs.length - 1].key : 'list');
      }
    }
    // Check if it's a report tab
    else if (tabKey.startsWith('report-')) {
      const newReportTabs = reportTabs.filter(t => t.key !== tabKey);
      setReportTabs(newReportTabs);

      if (activeTabKey === tabKey) {
        const allTabs = [...templateTabs, ...newReportTabs];
        setActiveTabKey(allTabs.length > 0 ? allTabs[allTabs.length - 1].key : 'list');
      }
    }
  };

  const getCurrentTemplateTab = (): TemplateTab | undefined => {
    return templateTabs.find(t => t.key === activeTabKey);
  };

  const refreshCurrentTab = () => {
    const tab = getCurrentTemplateTab();
    if (tab) {
      loadTemplateStructure(tab.templateId, tab.key);
    }
  };

  // Template CRUD
  const handleCreateTemplate = async (values: any) => {
    try {
      const response = await plService.createTemplate(
        values.template_code,
        values.template_name,
        values.description,
        values.template_type
      );
      if (response.success && response.data) {
        message.success('Template created successfully');
        setTemplateModalVisible(false);
        templateForm.resetFields();
        loadTemplates();
        // Open the new template in a tab
        const newTemplate: plService.PLTemplate = {
          template_id: response.data.template_id,
          template_code: values.template_code,
          template_name: values.template_name,
          description: values.description,
          template_type: values.template_type,
          is_active: 'Y',
          is_default: 'N',
          created_date: new Date().toISOString(),
        };
        openTemplateTab(newTemplate);
      } else {
        message.error(response.error || 'Failed to create template');
      }
    } catch (error) {
      message.error('Failed to create template');
    }
  };

  const handleDeleteTemplate = async (templateId: number) => {
    try {
      const response = await plService.deleteTemplate(templateId);
      if (response.success) {
        message.success('Template deleted successfully');
        loadTemplates();
        // Close tab if open
        const tabKey = `template-${templateId}`;
        closeTemplateTab(tabKey);
      } else {
        message.error(response.error || 'Failed to delete template');
      }
    } catch (error) {
      message.error('Failed to delete template');
    }
  };

  const handleCloneTemplate = async (values: any) => {
    if (!cloneTemplateId) return;
    try {
      const response = await plService.cloneTemplate(
        cloneTemplateId,
        values.new_template_code,
        values.new_template_name
      );
      if (response.success && response.data) {
        message.success('Template cloned successfully');
        setCloneModalVisible(false);
        cloneForm.resetFields();
        setCloneTemplateId(null);
        loadTemplates();
      } else {
        message.error(response.error || 'Failed to clone template');
      }
    } catch (error) {
      message.error('Failed to clone template');
    }
  };

  // Group CRUD
  const handleAddGroup = async (values: any) => {
    const tab = getCurrentTemplateTab();
    if (!tab) return;

    try {
      const response = await plService.addGroup(
        tab.templateId,
        values.group_code,
        values.group_name,
        values.group_label || values.group_name,
        values.group_type,
        values.display_order,
        values.sign_convention
      );
      if (response.success) {
        message.success('Group added successfully');
        setGroupModalVisible(false);
        groupForm.resetFields();
        refreshCurrentTab();
      } else {
        message.error(response.error || 'Failed to add group');
      }
    } catch (error) {
      message.error('Failed to add group');
    }
  };

  const handleDeleteGroup = async (groupId: number) => {
    try {
      const response = await plService.deleteGroup(groupId);
      if (response.success) {
        message.success('Group deleted successfully');
        refreshCurrentTab();
      } else {
        message.error(response.error || 'Failed to delete group');
      }
    } catch (error) {
      message.error('Failed to delete group');
    }
  };

  // Section CRUD
  const handleAddSection = async (values: any) => {
    if (!selectedGroupId) return;
    try {
      const response = await plService.addSection(
        selectedGroupId,
        values.section_code,
        values.section_name,
        values.section_label || values.section_name,
        values.display_order
      );
      if (response.success) {
        message.success('Section added successfully');
        setSectionModalVisible(false);
        sectionForm.resetFields();
        setSelectedGroupId(null);
        refreshCurrentTab();
      } else {
        message.error(response.error || 'Failed to add section');
      }
    } catch (error) {
      message.error('Failed to add section');
    }
  };

  const handleDeleteSection = async (sectionId: number) => {
    try {
      const response = await plService.deleteSection(sectionId);
      if (response.success) {
        message.success('Section deleted successfully');
        refreshCurrentTab();
      } else {
        message.error(response.error || 'Failed to delete section');
      }
    } catch (error) {
      message.error('Failed to delete section');
    }
  };

  // Account CRUD
  const handleAssignAccount = async (values: any) => {
    if (!selectedSectionId) return;
    try {
      const response = await plService.assignAccount(
        selectedSectionId,
        values.account_code,
        values.account_from,
        values.account_to
      );
      if (response.success) {
        message.success('Account assigned successfully');
        setAccountModalVisible(false);
        accountForm.resetFields();
        setSelectedSectionId(null);
        refreshCurrentTab();
      } else {
        message.error(response.error || 'Failed to assign account');
      }
    } catch (error) {
      message.error('Failed to assign account');
    }
  };

  // Handle assigning multiple selected accounts
  const handleAssignSelectedAccounts = async () => {
    console.log('=== handleAssignSelectedAccounts START ===');
    console.log('selectedSectionId:', selectedSectionId);
    console.log('selectedAccounts:', selectedAccounts);

    if (!selectedSectionId || selectedAccounts.length === 0) {
      console.log('Validation failed - sectionId or accounts missing');
      message.warning('Please select at least one account');
      return;
    }

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const accountCode of selectedAccounts) {
      // Find account description from glAccounts
      const accountInfo = glAccounts.find(acc => acc.account === accountCode);
      const accountDescription = accountInfo?.description || '';

      console.log(`Assigning account ${accountCode} (${accountDescription}) to section ${selectedSectionId}...`);
      try {
        const response = await plService.assignAccount(
          selectedSectionId,
          accountCode,
          accountDescription,
          undefined,
          undefined
        );
        console.log(`Response for ${accountCode}:`, response);
        if (response.success) {
          successCount++;
          console.log(`SUCCESS: Account ${accountCode} assigned`);
        } else {
          failCount++;
          errors.push(`${accountCode}: ${response.error}`);
          console.log(`FAILED: Account ${accountCode} - ${response.error}`);
        }
      } catch (err) {
        failCount++;
        errors.push(`${accountCode}: ${String(err)}`);
        console.error(`EXCEPTION for ${accountCode}:`, err);
      }
    }

    console.log('=== handleAssignSelectedAccounts COMPLETE ===');
    console.log(`Success: ${successCount}, Failed: ${failCount}`);
    if (errors.length > 0) {
      console.log('Errors:', errors);
    }

    if (successCount > 0) {
      message.success(`${successCount} account(s) assigned successfully`);
    }
    if (failCount > 0) {
      message.error(`${failCount} account(s) failed to assign. Check console for details.`);
    }

    setAccountModalVisible(false);
    setSelectedAccounts([]);
    setAccountSearchText('');
    setSelectedSectionId(null);
    refreshCurrentTab();
  };

  // Delete account from section
  const handleDeleteAccount = async (sectionAccountId: number, accountCode: string) => {
    try {
      console.log(`Deleting account ${accountCode} (sectionAccountId: ${sectionAccountId})...`);
      const response = await plService.deleteAccount(sectionAccountId);
      if (response.success) {
        message.success(`Account ${accountCode} removed successfully`);
        refreshCurrentTab();
      } else {
        message.error(response.error || 'Failed to remove account');
      }
    } catch (error) {
      message.error('Failed to remove account');
    }
  };

  // Total CRUD
  const handleAddTotal = async (values: any) => {
    const tab = getCurrentTemplateTab();
    if (!tab) return;

    try {
      const response = await plService.addTotal(
        tab.templateId,
        values.total_code,
        values.total_name,
        values.calculation_formula,
        values.display_order,
        values.after_group_code
      );
      if (response.success) {
        message.success('Total added successfully');
        setTotalModalVisible(false);
        totalForm.resetFields();
        refreshCurrentTab();
      } else {
        message.error(response.error || 'Failed to add total');
      }
    } catch (error) {
      message.error('Failed to add total');
    }
  };

  const handleDeleteTotal = async (totalId: number) => {
    try {
      const response = await plService.deleteTotal(totalId);
      if (response.success) {
        message.success('Total deleted successfully');
        refreshCurrentTab();
      } else {
        message.error(response.error || 'Failed to delete total');
      }
    } catch (error) {
      message.error('Failed to delete total');
    }
  };

  // Open report period selection modal
  const openReportPeriodModal = (templateId: number, templateName: string) => {
    setReportTemplateId(templateId);
    setReportTemplateName(templateName);
    // Set default period to current month
    const now = new Date();
    setSelectedPeriods([{ year: now.getFullYear(), num: now.getMonth() + 1 }]);
    reportPeriodForm.setFieldsValue({
      period_year: now.getFullYear(),
      period_num: now.getMonth() + 1,
    });
    setReportPeriodModalVisible(true);
  };

  // Add period to selected periods
  const addPeriodToSelection = () => {
    const year = reportPeriodForm.getFieldValue('period_year');
    const num = reportPeriodForm.getFieldValue('period_num');
    if (!year || !num) {
      message.warning('Please select year and period');
      return;
    }
    // Check if already added
    if (selectedPeriods.some(p => p.year === year && p.num === num)) {
      message.warning('Period already added');
      return;
    }
    setSelectedPeriods(prev => [...prev, { year, num }].sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.num - b.num
    ));
  };

  // Remove period from selection
  const removePeriodFromSelection = (year: number, num: number) => {
    setSelectedPeriods(prev => prev.filter(p => !(p.year === year && p.num === num)));
  };

  // Generate P&L Report (supports multiple periods)
  const handleGenerateReport = async () => {
    if (!reportTemplateId || selectedPeriods.length === 0) {
      message.warning('Please select at least one period');
      return;
    }

    if (!selectedLedgerId) {
      message.warning('Please select a ledger');
      return;
    }

    const periodsKey = selectedPeriods.map(p => `${p.year}-${p.num}`).join('_');
    const tabKey = `report-${reportTemplateId}-${selectedLedgerId}-${periodsKey}`;

    // Check if report tab already exists
    const existingTab = reportTabs.find(t => t.key === tabKey);
    if (existingTab) {
      setActiveTabKey(tabKey);
      setReportPeriodModalVisible(false);
      return;
    }

    // Get ledger name for label
    const ledger = ledgers.find(l => l.ledger_id === selectedLedgerId);
    const ledgerName = ledger?.ledger_name || 'Unknown Ledger';

    // Create label
    let tabLabel = reportTemplateName;
    if (selectedPeriods.length === 1) {
      const p = selectedPeriods[0];
      tabLabel += ` (${p.year}-${String(p.num).padStart(2, '0')})`;
    } else {
      tabLabel += ` (${selectedPeriods.length} periods)`;
    }

    // Create new report tab
    const newTab: ReportTab = {
      key: tabKey,
      label: tabLabel,
      templateId: reportTemplateId,
      periodYear: selectedPeriods[0].year,
      periodNum: selectedPeriods[0].num,
      ledgerId: selectedLedgerId,
      periods: [...selectedPeriods],
      report: null,
      reports: [],
      loading: true,
    };

    setReportTabs(prev => [...prev, newTab]);
    setActiveTabKey(tabKey);
    setReportPeriodModalVisible(false);

    // Fetch reports for all periods with the selected ledger
    try {
      const reportPromises = selectedPeriods.map(p =>
        plService.getPLReport(reportTemplateId, p.year, p.num, selectedLedgerId)
      );
      const responses = await Promise.all(reportPromises);

      const successfulReports: plService.PLReport[] = [];
      let hasError = false;

      responses.forEach((response, idx) => {
        if (response.success && response.data) {
          successfulReports.push(response.data);
        } else {
          hasError = true;
          console.error(`Failed to fetch period ${selectedPeriods[idx].year}-${selectedPeriods[idx].num}:`, response.error);
        }
      });

      if (successfulReports.length > 0) {
        setReportTabs(prev => prev.map(t =>
          t.key === tabKey ? {
            ...t,
            report: successfulReports[0],
            reports: successfulReports,
            loading: false
          } : t
        ));
        if (hasError) {
          message.warning('Some periods failed to load');
        }
      } else {
        message.error('Failed to generate report');
        setReportTabs(prev => prev.map(t =>
          t.key === tabKey ? { ...t, loading: false } : t
        ));
      }
    } catch (error) {
      message.error('Failed to generate report');
      setReportTabs(prev => prev.map(t =>
        t.key === tabKey ? { ...t, loading: false } : t
      ));
    }
  };

  // Toggle section expansion for drill-down
  const toggleSectionExpansion = (tabKey: string, sectionCode: string) => {
    const key = `${tabKey}-${sectionCode}`;
    setExpandedSections(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Generate PDF HTML content
  const generatePdfHtml = (tab: ReportTab): string => {
    const reports = tab.reports.length > 0 ? tab.reports : (tab.report ? [tab.report] : []);
    if (reports.length === 0) return '';

    const formatAmount = (amount: number | null) => {
      if (amount === null) return '';
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    };

    // Build HTML content
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>P&L Report - ${tab.label}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; background: #fff; }
          h1 { text-align: center; color: #333; margin-bottom: 5px; font-size: 24px; }
          .subtitle { text-align: center; color: #666; margin-bottom: 20px; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { padding: 10px 12px; border-bottom: 1px solid #ddd; }
          th { background: #f5f5f5; text-align: left; font-weight: 600; font-size: 13px; }
          th.amount { text-align: right; }
          td { font-size: 13px; }
          td.amount { text-align: right; font-family: 'Courier New', monospace; }
          .group-header { background: #e6f3ff; font-weight: bold; }
          .group-total { font-weight: bold; border-top: 2px solid #333; background: #f9f9f9; }
          .calculated-total { font-weight: bold; background: #e6f7ff; border-top: 2px solid #1890ff; }
          .section td:first-child { padding-left: 30px; }
          .negative { color: #cf1322; }
          @media print {
            body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <h1>${reports[0].template_name}</h1>
        <div class="subtitle">
          ${reports.length === 1
            ? `Period: ${reports[0].period_name} | Generated: ${reports[0].generated_at}`
            : `Comparative Report - ${reports.length} Periods | Generated: ${new Date().toLocaleString()}`
          }
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 50%">Description</th>
              ${reports.map(r => `<th class="amount">${r.period_name}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
    `;

    // Use first report's rows as structure, merge amounts from all reports
    const firstReport = reports[0];
    firstReport.rows.forEach(row => {
      const isGroupHeader = row.row_type === 'group_header';
      const isGroupTotal = row.row_type === 'group_total';
      const isCalculatedTotal = row.row_type === 'calculated_total';
      const isSection = row.row_type === 'section';

      let rowClass = '';
      if (isGroupHeader) rowClass = 'group-header';
      else if (isGroupTotal) rowClass = 'group-total';
      else if (isCalculatedTotal) rowClass = 'calculated-total';
      else if (isSection) rowClass = 'section';

      html += `<tr class="${rowClass}">`;
      html += `<td>${row.label}</td>`;

      // Add amount columns for each period
      reports.forEach(r => {
        const matchingRow = r.rows.find(rr => rr.code === row.code && rr.row_type === row.row_type);
        const amount = matchingRow?.amount;
        const amountClass = amount !== null && amount < 0 ? 'amount negative' : 'amount';
        html += `<td class="${amountClass}">${amount !== null ? formatAmount(amount) : ''}</td>`;
      });

      html += '</tr>';
    });

    html += `
          </tbody>
        </table>
      </body>
      </html>
    `;

    return html;
  };

  // Show PDF Preview in modal
  const handlePrintReport = (tab: ReportTab) => {
    const html = generatePdfHtml(tab);
    if (!html) {
      message.error('No report data to print');
      return;
    }
    setPdfPreviewContent(html);
    setPdfPreviewVisible(true);
  };

  // Print from modal
  const handlePrintFromModal = () => {
    const iframe = document.getElementById('pdf-preview-iframe') as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.print();
    }
  };

  // Debug: Show raw report data
  const handleDebugReport = async (templateId: number, periodYear: number, periodNum: number, ledgerId: number) => {
    setDebugLoading(true);
    setDebugModalVisible(true);

    try {
      const baseUrl = APEX_DB_CONFIG.baseUrl;
      const url = `${baseUrl}/pl/report/${templateId}?period_year=${periodYear}&period_num=${periodNum}&ledger_id=${ledgerId}`;

      console.log('Debug - Fetching:', url);

      const response = await fetch(url);
      const responseText = await response.text();

      console.log('Debug - Raw Response:', responseText);

      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch (e) {
        parsed = { parseError: String(e), rawText: responseText };
      }

      setDebugData({
        url,
        status: response.status,
        statusText: response.statusText,
        rawResponse: responseText.substring(0, 5000), // Limit size
        parsedResponse: parsed,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      setDebugData({
        error: String(error),
        timestamp: new Date().toISOString(),
      });
    }

    setDebugLoading(false);
  };

  // Render clean template structure with collapsible groups
  const renderTemplateStructure = (templateData: plService.PLTemplateStructure) => {
    const groups = templateData?.template?.groups || [];
    const totals = templateData?.template?.totals || [];

    // Build collapse items for groups
    const groupItems = groups.map(group => ({
      key: `group-${group.group_id}`,
      label: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingRight: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: GROUP_TYPE_COLORS[group.group_type],
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FolderOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text strong style={{ fontSize: 14 }}>{group.group_name}</Text>
                <Tag
                  style={{
                    margin: 0,
                    fontSize: 10,
                    background: GROUP_TYPE_COLORS[group.group_type],
                    border: 'none',
                    color: '#fff',
                    fontWeight: 600,
                  }}
                >
                  {group.group_type.replace('_', ' ')}
                </Tag>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {(group.sections || []).length} sections
                </Text>
              </div>
              <Text type="secondary" style={{ fontSize: 10 }}>
                {group.group_code} • Order {group.display_order} • {group.sign_convention === 1 ? '+' : '−'}
              </Text>
            </div>
          </div>
          <Space onClick={e => e.stopPropagation()}>
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedGroupId(group.group_id);
                sectionForm.setFieldsValue({
                  display_order: ((group.sections || []).length + 1) * 10,
                });
                setSectionModalVisible(true);
              }}
            >
              Section
            </Button>
            <Popconfirm
              title="Delete this group?"
              description="All sections and accounts will also be deleted."
              onConfirm={() => handleDeleteGroup(group.group_id)}
              okText="Delete"
              okButtonProps={{ danger: true }}
            >
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={e => e.stopPropagation()} />
            </Popconfirm>
          </Space>
        </div>
      ),
      children: (
        <div style={{ padding: '4px 0' }}>
          {(group.sections || []).length === 0 ? (
            <Text type="secondary" style={{ fontStyle: 'italic', padding: '8px 0', display: 'block' }}>
              No sections yet. Click "+ Section" to add one.
            </Text>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(group.sections || []).map(section => (
                <div
                  key={section.section_id}
                  style={{
                    background: '#fff',
                    borderRadius: 8,
                    border: '1px solid #e9ecef',
                    overflow: 'hidden',
                  }}
                >
                  {/* Section Header */}
                  <div
                    style={{
                      padding: '8px 12px',
                      borderBottom: (section.accounts || []).length > 0 ? '1px solid #f0f0f0' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#fafafa',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AppstoreOutlined style={{ color: REDWOOD.info, fontSize: 14 }} />
                      <Text strong style={{ fontSize: 13 }}>{section.section_name}</Text>
                      <Text type="secondary" style={{ fontSize: 10 }}>
                        {section.section_code}
                      </Text>
                    </div>
                    <Space size={4}>
                      <Button
                        type="text"
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => {
                          setSelectedSectionId(section.section_id);
                          setAccountModalVisible(true);
                          if (glAccounts.length === 0) {
                            loadGLAccounts();
                          }
                        }}
                        style={{ color: REDWOOD.info, fontSize: 12 }}
                      >
                        Account
                      </Button>
                      <Popconfirm
                        title="Delete this section?"
                        onConfirm={() => handleDeleteSection(section.section_id)}
                        okText="Delete"
                        okButtonProps={{ danger: true }}
                      >
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  </div>

                  {/* Accounts List - Compact */}
                  {(section.accounts || []).length > 0 && (
                    <div style={{ padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(section.accounts || []).map((account, idx) => (
                        <Tag
                          key={idx}
                          closable={!!account.section_account_id}
                          onClose={(e) => {
                            e.preventDefault();
                            if (account.section_account_id) {
                              handleDeleteAccount(account.section_account_id, account.account_code);
                            }
                          }}
                          style={{
                            margin: 0,
                            padding: '3px 8px',
                            borderRadius: 4,
                            background: '#f6f8fa',
                            border: '1px solid #e1e4e8',
                            fontSize: 12,
                          }}
                        >
                          <Text strong style={{ fontFamily: 'monospace', fontSize: 11 }}>
                            {account.account_from && account.account_to
                              ? `${account.account_from}→${account.account_to}`
                              : account.account_code}
                          </Text>
                          {account.account_description && (
                            <Text type="secondary" style={{ fontSize: 10, marginLeft: 4 }}>
                              {account.account_description}
                            </Text>
                          )}
                        </Tag>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ),
      style: {
        marginBottom: 12,
        background: '#fff',
        borderRadius: 10,
        border: `2px solid ${GROUP_TYPE_COLORS[group.group_type]}30`,
        overflow: 'hidden',
      },
    }));

    // Add totals as a collapse item
    if (totals.length > 0) {
      groupItems.push({
        key: 'totals',
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: '#722ed1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CalculatorOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <div>
              <Text strong style={{ fontSize: 14 }}>Calculated Totals</Text>
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                {totals.length} formulas
              </Text>
            </div>
          </div>
        ),
        children: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {totals.map(total => (
              <div
                key={total.total_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: '#faf5ff',
                  borderRadius: 6,
                  border: '1px solid #e8d4f8',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Tag color="purple" style={{ margin: 0, fontWeight: 600, fontSize: 11 }}>{total.total_code}</Tag>
                  <Text strong style={{ fontSize: 12 }}>{total.total_name}</Text>
                  <Text code style={{ fontSize: 11, background: '#fff' }}>{total.calculation_formula}</Text>
                  {total.after_group_code && (
                    <Text type="secondary" style={{ fontSize: 10 }}>after {total.after_group_code}</Text>
                  )}
                </div>
                <Popconfirm
                  title="Delete this total?"
                  onConfirm={() => handleDeleteTotal(total.total_id)}
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                >
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </div>
            ))}
          </div>
        ),
        style: {
          marginBottom: 12,
          background: '#fff',
          borderRadius: 10,
          border: '2px solid #722ed130',
          overflow: 'hidden',
        },
      });
    }

    return (
      <div style={{ padding: '16px 20px' }}>
        {groups.length === 0 && totals.length === 0 ? (
          <Empty description="No structure defined. Add a group to get started." />
        ) : (
          <Collapse
            defaultActiveKey={groups.map(g => `group-${g.group_id}`).concat(totals.length > 0 ? ['totals'] : [])}
            ghost
            items={groupItems}
            style={{ background: 'transparent' }}
          />
        )}
      </div>
    );
  };

  // Template List View
  const renderTemplateList = () => {
    const columns = [
      {
        title: 'ID',
        dataIndex: 'template_id',
        key: 'template_id',
        width: 60,
        render: (id: number) => <Text type="secondary">{id}</Text>,
      },
      {
        title: 'Template Code',
        dataIndex: 'template_code',
        key: 'template_code',
        width: 150,
        render: (text: string) => <Text strong>{text}</Text>,
      },
      {
        title: 'Template Name',
        dataIndex: 'template_name',
        key: 'template_name',
      },
      {
        title: 'Type',
        dataIndex: 'template_type',
        key: 'template_type',
        width: 120,
        render: (type: string) => (
          <Tag color={type === 'STANDARD' ? 'blue' : type === 'CUSTOM' ? 'green' : 'default'}>
            {type}
          </Tag>
        ),
      },
      {
        title: 'Default',
        dataIndex: 'is_default',
        key: 'is_default',
        width: 80,
        align: 'center' as const,
        render: (val: string) => val === 'Y' ?
          <CheckCircleOutlined style={{ color: REDWOOD.success }} /> :
          <CloseCircleOutlined style={{ color: REDWOOD.neutral300 }} />,
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 200,
        render: (_: any, record: plService.PLTemplate) => (
          <Space size="small">
            <Tooltip title="Edit">
              <Button
                type="primary"
                size="small"
                icon={<EditOutlined />}
                onClick={() => openTemplateTab(record)}
              >
                Edit
              </Button>
            </Tooltip>
            <Tooltip title="Preview">
              <Button
                type="text"
                icon={<EyeOutlined />}
                onClick={async () => {
                  const response = await plService.getTemplateStructure(record.template_id);
                  if (response.success && response.data) {
                    setPreviewTemplate(response.data);
                    setPreviewModalVisible(true);
                  }
                }}
              />
            </Tooltip>
            <Tooltip title="Clone">
              <Button
                type="text"
                icon={<CopyOutlined />}
                onClick={() => {
                  setCloneTemplateId(record.template_id);
                  setCloneModalVisible(true);
                }}
              />
            </Tooltip>
            <Popconfirm
              title="Delete this template?"
              description="This action cannot be undone."
              onConfirm={() => handleDeleteTemplate(record.template_id)}
              okText="Delete"
              okButtonProps={{ danger: true }}
            >
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ];

    return (
      <div style={{ padding: 16 }}>
        <Card
          title={
            <Space>
              <FileTextOutlined style={{ color: REDWOOD.primary }} />
              <span>P&L Statement Templates</span>
            </Space>
          }
          extra={
            <Space>
              <Button icon={<ReloadOutlined />} onClick={loadTemplates}>
                Refresh
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setTemplateModalVisible(true)}
                style={{ background: REDWOOD.primary }}
              >
                New Template
              </Button>
            </Space>
          }
          style={{ borderRadius: 8 }}
        >
          <Table
            columns={columns}
            dataSource={templates}
            rowKey="template_id"
            loading={loading}
            pagination={{ pageSize: 10 }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No templates found"
                >
                  <Button type="primary" onClick={() => setTemplateModalVisible(true)}>
                    Create Template
                  </Button>
                </Empty>
              ),
            }}
          />
        </Card>
      </div>
    );
  };

  // Template Editor View (Tab Content)
  const renderTemplateEditor = (tab: TemplateTab) => {
    if (tab.loading) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
          <Spin size="large" />
        </div>
      );
    }

    if (!tab.template || !tab.template.template) {
      return (
        <div style={{ padding: 16 }}>
          <Empty description="Failed to load template. Click refresh to try again.">
            <Button onClick={refreshCurrentTab}>Refresh</Button>
          </Empty>
        </div>
      );
    }

    const template = tab.template.template;

    return (
      <div style={{ padding: 16 }}>
        {/* Template Header */}
        <Card size="small" style={{ marginBottom: 16, borderRadius: 8 }}>
          <Row justify="space-between" align="middle">
            <Col>
              <Space>
                <Tag color="blue" style={{ fontSize: 14, padding: '4px 12px' }}>{template.template_code}</Tag>
                <Title level={4} style={{ margin: 0 }}>{template.template_name}</Title>
                <Tag>{template.template_type}</Tag>
                {template.is_default === 'Y' && <Tag color="green">Default</Tag>}
              </Space>
              {template.description && (
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary">{template.description}</Text>
                </div>
              )}
            </Col>
            <Col>
              <Space>
                <Button
                  icon={<FileExcelOutlined />}
                  onClick={() => {
                    setExcelTemplate(tab.template);
                    setExcelModalVisible(true);
                  }}
                  style={{ background: '#217346', borderColor: '#217346', color: '#fff' }}
                >
                  Edit in Excel
                </Button>
                <Button
                  type="primary"
                  icon={<EyeOutlined />}
                  onClick={() => openReportPeriodModal(tab.templateId, template.template_name)}
                  style={{ background: REDWOOD.primary }}
                >
                  Run Report
                </Button>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={refreshCurrentTab}
                >
                  Refresh
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>

        {/* Action Buttons */}
        <Card size="small" style={{ marginBottom: 16, borderRadius: 8 }}>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                groupForm.setFieldsValue({
                  display_order: ((template.groups || []).length + 1) * 10,
                  sign_convention: 1,
                });
                setGroupModalVisible(true);
              }}
              style={{ background: REDWOOD.success }}
            >
              Add Group
            </Button>
            <Button
              icon={<CalculatorOutlined />}
              onClick={() => {
                totalForm.setFieldsValue({
                  display_order: ((template.totals || []).length + 1) * 10,
                });
                setTotalModalVisible(true);
              }}
            >
              Add Calculated Total
            </Button>
          </Space>
        </Card>

        {/* Template Structure - Clean Card Layout */}
        <Card
          title={
            <Space>
              <FolderOpenOutlined style={{ color: REDWOOD.primary }} />
              <span>Template Structure</span>
              <Text type="secondary" style={{ fontWeight: 'normal', fontSize: 12 }}>
                ({(template.groups || []).length} groups, {(template.totals || []).length} totals)
              </Text>
            </Space>
          }
          style={{ borderRadius: 8 }}
          bodyStyle={{ padding: 0, background: '#f5f5f5' }}
        >
          {renderTemplateStructure(tab.template)}
        </Card>
      </div>
    );
  };

  // Render P&L Report View
  const renderReportView = (tab: ReportTab) => {
    if (tab.loading) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
          <Spin size="large" tip="Generating P&L Report..." />
        </div>
      );
    }

    const reports = tab.reports.length > 0 ? tab.reports : (tab.report ? [tab.report] : []);
    if (reports.length === 0) {
      return (
        <div style={{ padding: 16 }}>
          <Empty description="Failed to generate report." />
        </div>
      );
    }

    const firstReport = reports[0];
    const isMultiPeriod = reports.length > 1;

    // Format number as currency
    const formatAmount = (amount: number | null) => {
      if (amount === null) return '';
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    };

    return (
      <div style={{ padding: 16 }}>
        {/* Report Header */}
        <Card size="small" style={{ marginBottom: 16, borderRadius: 8 }}>
          <Row justify="space-between" align="middle">
            <Col>
              <Space direction="vertical" size={0}>
                <Title level={4} style={{ margin: 0 }}>{firstReport.template_name}</Title>
                <Space>
                  <Text type="secondary">
                    {isMultiPeriod
                      ? `Comparative Report: ${reports.map(r => r.period_name).join(' | ')}`
                      : `Period: ${firstReport.period_name}`
                    } | Generated: {firstReport.generated_at}
                  </Text>
                  <Tooltip title="Debug: View raw API response">
                    <Button
                      type="text"
                      size="small"
                      icon={<BugOutlined />}
                      onClick={() => handleDebugReport(tab.templateId, tab.periodYear, tab.periodNum, tab.ledgerId)}
                      style={{ color: '#faad14' }}
                    />
                  </Tooltip>
                </Space>
              </Space>
            </Col>
            <Col>
              <Space>
                <Button
                  icon={<BugOutlined />}
                  onClick={() => handleDebugReport(tab.templateId, tab.periodYear, tab.periodNum, tab.ledgerId)}
                  style={{ background: '#faad14', borderColor: '#faad14', color: '#fff' }}
                >
                  Debug Data
                </Button>
                <Button
                  icon={<FilePdfOutlined />}
                  onClick={() => handlePrintReport(tab)}
                  style={{ background: '#ff4d4f', borderColor: '#ff4d4f', color: '#fff' }}
                >
                  Print / PDF
                </Button>
                <Button icon={<ReloadOutlined />} onClick={() => {
                  // Close and regenerate
                  closeTemplateTab(tab.key);
                  openReportPeriodModal(tab.templateId, firstReport.template_name);
                }}>
                  New Report
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>

        {/* P&L Report Table */}
        <Card
          title={
            <Space>
              <CalculatorOutlined style={{ color: REDWOOD.primary }} />
              <span>Profit & Loss Statement</span>
              <Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
                (Click on sections to drill-down into accounts)
              </Text>
            </Space>
          }
          style={{ borderRadius: 8 }}
          bodyStyle={{ padding: 0 }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafafa', borderBottom: '2px solid #e8e8e8' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, width: isMultiPeriod ? '40%' : '70%' }}>
                  Description
                </th>
                {reports.map((r, idx) => (
                  <th key={idx} style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>
                    {isMultiPeriod ? r.period_name : 'Amount'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {firstReport.rows.map((row, rowIndex) => {
                const isGroupHeader = row.row_type === 'group_header';
                const isSection = row.row_type === 'section';
                const isGroupTotal = row.row_type === 'group_total';
                const isCalculatedTotal = row.row_type === 'calculated_total';
                const isTotal = isGroupTotal || isCalculatedTotal;
                const isHighlight = row.row_style === 'highlight';
                const isDoubleLine = row.row_style === 'double_line';

                // Check if section is expanded
                const expansionKey = `${tab.key}-${row.code}`;
                const isExpanded = expandedSections[expansionKey];
                const hasAccounts = isSection && row.accounts && row.accounts.length > 0;

                let bgColor = '#fff';
                let fontWeight: 'normal' | 'bold' = 'normal';
                let borderTop = 'none';
                let borderBottom = '1px solid #f0f0f0';

                if (isGroupHeader) {
                  bgColor = GROUP_TYPE_COLORS[row.group_type] ? `${GROUP_TYPE_COLORS[row.group_type]}10` : '#f9f9f9';
                  fontWeight = 'bold';
                }
                if (isTotal) {
                  fontWeight = 'bold';
                  borderTop = '1px solid #d9d9d9';
                }
                if (isHighlight) {
                  bgColor = '#fffbe6';
                }
                if (isCalculatedTotal) {
                  bgColor = '#f0f5ff';
                  borderTop = '2px solid #1890ff';
                }
                if (isDoubleLine) {
                  bgColor = '#e6fffb';
                  borderTop = '3px double #13c2c2';
                  borderBottom = '3px double #13c2c2';
                }

                const rowElements = [];

                // Main row
                rowElements.push(
                  <tr
                    key={`row-${rowIndex}`}
                    style={{
                      background: bgColor,
                      borderTop,
                      borderBottom,
                      cursor: hasAccounts ? 'pointer' : 'default',
                    }}
                    onClick={hasAccounts ? () => toggleSectionExpansion(tab.key, row.code) : undefined}
                  >
                    <td
                      style={{
                        padding: '10px 16px',
                        paddingLeft: 16 + (row.indent * 24),
                        fontWeight,
                        color: isGroupHeader ? GROUP_TYPE_COLORS[row.group_type] || '#333' : '#333',
                      }}
                    >
                      {/* Expand/Collapse icon for sections with accounts */}
                      {hasAccounts && (
                        <span style={{ marginRight: 8, color: '#1890ff' }}>
                          {isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                        </span>
                      )}
                      {isGroupHeader && (
                        <span style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          background: GROUP_TYPE_COLORS[row.group_type] || '#ccc',
                          marginRight: 8,
                        }} />
                      )}
                      {row.label}
                      {row.code && !isGroupHeader && (
                        <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                          ({row.code})
                        </Text>
                      )}
                      {hasAccounts && (
                        <Tag color="blue" style={{ marginLeft: 8, fontSize: 10 }}>
                          {row.accounts?.length} accounts
                        </Tag>
                      )}
                    </td>
                    {reports.map((r, rptIdx) => {
                      const matchingRow = r.rows.find(rr => rr.code === row.code && rr.row_type === row.row_type);
                      const amount = matchingRow?.amount ?? null;
                      return (
                        <td
                          key={rptIdx}
                          style={{
                            padding: '10px 16px',
                            textAlign: 'right',
                            fontWeight,
                            fontFamily: 'monospace',
                            fontSize: 14,
                            color: amount !== null && amount < 0 ? '#cf1322' : '#333',
                          }}
                        >
                          {amount !== null && formatAmount(amount)}
                        </td>
                      );
                    })}
                  </tr>
                );

                // Account detail rows (drill-down)
                if (hasAccounts && isExpanded) {
                  row.accounts?.forEach((acct, acctIdx) => {
                    rowElements.push(
                      <tr
                        key={`row-${rowIndex}-acct-${acctIdx}`}
                        style={{
                          background: '#f9f9f9',
                          borderBottom: '1px dashed #e8e8e8',
                        }}
                      >
                        <td
                          style={{
                            padding: '6px 16px',
                            paddingLeft: 16 + ((row.indent + 1) * 24) + 24,
                            fontSize: 12,
                            color: '#666',
                          }}
                        >
                          <Text code style={{ fontSize: 11, marginRight: 8 }}>{acct.account}</Text>
                          <Text type="secondary">{acct.description}</Text>
                        </td>
                        {reports.map((r, rptIdx) => {
                          // Find matching account in this report's section
                          const matchingRow = r.rows.find(rr => rr.code === row.code && rr.row_type === 'section');
                          const matchingAcct = matchingRow?.accounts?.find(a => a.account === acct.account);
                          const amount = matchingAcct?.amount ?? null;
                          const tbBalance = matchingAcct?.tb_balance ?? null;
                          return (
                            <td
                              key={rptIdx}
                              style={{
                                padding: '6px 16px',
                                textAlign: 'right',
                                fontFamily: 'monospace',
                                fontSize: 12,
                                color: amount !== null && amount < 0 ? '#cf1322' : '#666',
                              }}
                            >
                              <Tooltip title={`TB Balance: ${tbBalance !== null ? formatAmount(tbBalance) : 'N/A'}`}>
                                <span>{amount !== null ? formatAmount(amount) : '-'}</span>
                              </Tooltip>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  });
                }

                return rowElements;
              })}
            </tbody>
          </table>
        </Card>

        {/* Legend */}
        <Card size="small" style={{ marginTop: 16, borderRadius: 8 }}>
          <Space wrap>
            <Text type="secondary" style={{ fontSize: 12 }}>Legend:</Text>
            {Object.entries(GROUP_TYPE_COLORS).map(([type, color]) => (
              <Tag key={type} style={{ background: `${color}20`, borderColor: color, color }}>
                {type.replace('_', ' ')}
              </Tag>
            ))}
          </Space>
        </Card>
      </div>
    );
  };

  // Preview Modal
  const renderPreviewModal = () => {
    if (!previewTemplate) return null;

    const template = previewTemplate?.template;
    if (!template) return null;

    // Build preview rows
    const previewRows: Array<{
      key: string;
      label: string;
      indent: number;
      isBold: boolean;
      isTotal?: boolean;
      formula?: string;
    }> = [];

    // Sort groups and totals by display_order
    const groups = template.groups || [];
    const totals = template.totals || [];
    const items: Array<{type: 'group' | 'total', order: number, data: any}> = [
      ...groups.map(g => ({ type: 'group' as const, order: g.display_order, data: g })),
      ...totals.map(t => ({ type: 'total' as const, order: t.display_order, data: t })),
    ].sort((a, b) => a.order - b.order);

    items.forEach(item => {
      if (item.type === 'group') {
        const group = item.data as plService.PLGroup;
        previewRows.push({
          key: `group-${group.group_id}`,
          label: group.group_label || group.group_name,
          indent: 0,
          isBold: true,
        });
        (group.sections || []).forEach(section => {
          previewRows.push({
            key: `section-${section.section_id}`,
            label: section.section_label || section.section_name,
            indent: 1,
            isBold: false,
          });
        });
        if (group.show_subtotal === 'Y' && group.subtotal_label) {
          previewRows.push({
            key: `subtotal-${group.group_id}`,
            label: group.subtotal_label,
            indent: 0,
            isBold: true,
            isTotal: true,
          });
        }
      } else {
        const total = item.data as plService.PLTotal;
        previewRows.push({
          key: `total-${total.total_id}`,
          label: total.total_label || total.total_name,
          indent: 0,
          isBold: true,
          isTotal: true,
          formula: total.calculation_formula,
        });
      }
    });

    return (
      <Modal
        title={`Preview: ${template.template_name}`}
        open={previewModalVisible}
        onCancel={() => {
          setPreviewModalVisible(false);
          setPreviewTemplate(null);
        }}
        footer={null}
        width={700}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={4}>Profit and Loss Statement</Title>
          <Text type="secondary">For the Period Ending December 31, 2024</Text>
        </div>

        <Table
          dataSource={previewRows}
          pagination={false}
          showHeader={false}
          rowKey="key"
          size="small"
          columns={[
            {
              dataIndex: 'label',
              key: 'label',
              render: (text, record) => (
                <div style={{
                  paddingLeft: record.indent * 24,
                  fontWeight: record.isBold ? 600 : 400,
                  borderTop: record.isTotal ? `1px solid ${REDWOOD.neutral200}` : 'none',
                  paddingTop: record.isTotal ? 8 : 4,
                  paddingBottom: 4,
                }}>
                  {text}
                  {record.formula && (
                    <Text type="secondary" style={{ marginLeft: 8, fontSize: 11 }}>
                      [{record.formula}]
                    </Text>
                  )}
                </div>
              ),
            },
            {
              key: 'amount',
              width: 120,
              align: 'right' as const,
              render: (_, record) => (
                <div style={{
                  fontWeight: record.isBold ? 600 : 400,
                  borderTop: record.isTotal ? `1px solid ${REDWOOD.neutral200}` : 'none',
                  paddingTop: record.isTotal ? 8 : 4,
                  paddingBottom: 4,
                }}>
                  {record.indent === 1 || record.isTotal ? '0.00' : ''}
                </div>
              ),
            },
          ]}
        />
      </Modal>
    );
  };

  // Excel View Modal
  const renderExcelModal = () => {
    if (!excelTemplate) return null;

    const template = excelTemplate?.template;
    if (!template) return null;

    // Build Excel-like data rows
    const excelData: Array<{
      key: string;
      rowNum: number;
      type: string;
      code: string;
      name: string;
      label: string;
      displayOrder: number;
      formula: string;
      parentCode: string;
    }> = [];

    let rowNum = 1;

    // Add groups and their sections
    (template.groups || []).forEach(group => {
      excelData.push({
        key: `group-${group.group_id}`,
        rowNum: rowNum++,
        type: 'GROUP',
        code: group.group_code,
        name: group.group_name,
        label: group.group_label || '',
        displayOrder: group.display_order,
        formula: '',
        parentCode: '',
      });

      (group.sections || []).forEach(section => {
        excelData.push({
          key: `section-${section.section_id}`,
          rowNum: rowNum++,
          type: 'SECTION',
          code: section.section_code,
          name: section.section_name,
          label: section.section_label || '',
          displayOrder: section.display_order,
          formula: '',
          parentCode: group.group_code,
        });

        (section.accounts || []).forEach((account, idx) => {
          excelData.push({
            key: `account-${section.section_id}-${idx}`,
            rowNum: rowNum++,
            type: 'ACCOUNT',
            code: account.account_code,
            name: account.account_from && account.account_to
              ? `${account.account_from} - ${account.account_to}`
              : account.account_code,
            label: '',
            displayOrder: idx + 1,
            formula: '',
            parentCode: section.section_code,
          });
        });
      });
    });

    // Add totals
    (template.totals || []).forEach(total => {
      excelData.push({
        key: `total-${total.total_id}`,
        rowNum: rowNum++,
        type: 'TOTAL',
        code: total.total_code,
        name: total.total_name,
        label: total.total_label || '',
        displayOrder: total.display_order,
        formula: total.calculation_formula,
        parentCode: total.after_group_code || '',
      });
    });

    const excelColumns = [
      {
        title: '',
        dataIndex: 'rowNum',
        key: 'rowNum',
        width: 40,
        fixed: 'left' as const,
        render: (num: number) => (
          <div style={{
            background: '#f0f0f0',
            textAlign: 'center',
            fontWeight: 500,
            color: '#666',
            padding: '4px 0',
          }}>
            {num}
          </div>
        ),
      },
      {
        title: 'A',
        dataIndex: 'type',
        key: 'type',
        width: 100,
        render: (type: string) => (
          <Tag
            color={
              type === 'GROUP' ? 'blue' :
              type === 'SECTION' ? 'green' :
              type === 'ACCOUNT' ? 'default' :
              'purple'
            }
            style={{ margin: 0 }}
          >
            {type}
          </Tag>
        ),
      },
      {
        title: 'B',
        dataIndex: 'code',
        key: 'code',
        width: 100,
        render: (code: string) => (
          <Input
            size="small"
            defaultValue={code}
            style={{ border: 'none', background: 'transparent' }}
          />
        ),
      },
      {
        title: 'C',
        dataIndex: 'name',
        key: 'name',
        width: 200,
        render: (name: string) => (
          <Input
            size="small"
            defaultValue={name}
            style={{ border: 'none', background: 'transparent' }}
          />
        ),
      },
      {
        title: 'D',
        dataIndex: 'label',
        key: 'label',
        width: 200,
        render: (label: string) => (
          <Input
            size="small"
            defaultValue={label}
            placeholder="Display Label"
            style={{ border: 'none', background: 'transparent' }}
          />
        ),
      },
      {
        title: 'E',
        dataIndex: 'displayOrder',
        key: 'displayOrder',
        width: 80,
        render: (order: number) => (
          <InputNumber
            size="small"
            defaultValue={order}
            style={{ width: '100%', border: 'none', background: 'transparent' }}
          />
        ),
      },
      {
        title: 'F',
        dataIndex: 'formula',
        key: 'formula',
        width: 120,
        render: (formula: string) => (
          <Input
            size="small"
            defaultValue={formula}
            placeholder="Formula"
            style={{ border: 'none', background: 'transparent', fontFamily: 'monospace' }}
          />
        ),
      },
      {
        title: 'G',
        dataIndex: 'parentCode',
        key: 'parentCode',
        width: 100,
        render: (parent: string) => (
          <Input
            size="small"
            defaultValue={parent}
            placeholder="Parent"
            style={{ border: 'none', background: 'transparent' }}
          />
        ),
      },
    ];

    return (
      <Modal
        title={
          <Space>
            <FileExcelOutlined style={{ color: '#217346' }} />
            <span>Edit in Excel - {template.template_name}</span>
          </Space>
        }
        open={excelModalVisible}
        onCancel={() => {
          setExcelModalVisible(false);
          setExcelTemplate(null);
        }}
        width={1200}
        footer={
          <Space>
            <Button onClick={() => {
              setExcelModalVisible(false);
              setExcelTemplate(null);
            }}>
              Cancel
            </Button>
            <Button type="primary" icon={<SaveOutlined />} style={{ background: '#217346' }}>
              Save Changes
            </Button>
          </Space>
        }
        bodyStyle={{ padding: 0 }}
      >
        {/* Excel-like toolbar */}
        <div style={{
          background: '#217346',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          <Text style={{ color: '#fff', fontWeight: 600 }}>
            {template.template_code}
          </Text>
          <div style={{ flex: 1 }} />
          <Space>
            <Button size="small" icon={<PlusOutlined />} style={{ background: '#fff' }}>
              Add Row
            </Button>
            <Button size="small" icon={<DeleteOutlined />} style={{ background: '#fff' }}>
              Delete Row
            </Button>
          </Space>
        </div>

        {/* Column headers row */}
        <div style={{
          background: '#e8e8e8',
          borderBottom: '2px solid #217346',
          padding: '4px 0',
          display: 'flex',
        }}>
          <div style={{ width: 40, textAlign: 'center', fontWeight: 600, color: '#333' }}></div>
          <div style={{ width: 100, textAlign: 'center', fontWeight: 600, color: '#333', borderLeft: '1px solid #ccc' }}>Type</div>
          <div style={{ width: 100, textAlign: 'center', fontWeight: 600, color: '#333', borderLeft: '1px solid #ccc' }}>Code</div>
          <div style={{ width: 200, textAlign: 'center', fontWeight: 600, color: '#333', borderLeft: '1px solid #ccc' }}>Name</div>
          <div style={{ width: 200, textAlign: 'center', fontWeight: 600, color: '#333', borderLeft: '1px solid #ccc' }}>Label</div>
          <div style={{ width: 80, textAlign: 'center', fontWeight: 600, color: '#333', borderLeft: '1px solid #ccc' }}>Order</div>
          <div style={{ width: 120, textAlign: 'center', fontWeight: 600, color: '#333', borderLeft: '1px solid #ccc' }}>Formula</div>
          <div style={{ width: 100, textAlign: 'center', fontWeight: 600, color: '#333', borderLeft: '1px solid #ccc' }}>Parent</div>
        </div>

        {/* Excel-like table */}
        <div style={{ maxHeight: 500, overflow: 'auto' }}>
          <Table
            columns={excelColumns}
            dataSource={excelData}
            pagination={false}
            size="small"
            showHeader={false}
            rowClassName={(record) =>
              record.type === 'GROUP' ? 'excel-row-group' :
              record.type === 'SECTION' ? 'excel-row-section' :
              record.type === 'TOTAL' ? 'excel-row-total' : ''
            }
            style={{
              border: '1px solid #d9d9d9',
            }}
            onRow={(record) => ({
              style: {
                background: record.type === 'GROUP' ? '#e6f7ff' :
                            record.type === 'TOTAL' ? '#f6ffed' :
                            '#fff',
              },
            })}
          />
        </div>

        {/* Status bar */}
        <div style={{
          background: '#217346',
          padding: '4px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          <Text style={{ color: '#fff', fontSize: 12 }}>
            {excelData.length} rows | {(template.groups || []).length} groups | {(template.totals || []).length} totals
          </Text>
          <div style={{ flex: 1 }} />
          <Text style={{ color: '#fff', fontSize: 12 }}>
            Ready
          </Text>
        </div>
      </Modal>
    );
  };

  // Tab items
  const tabItems = [
    {
      key: 'list',
      label: (
        <span>
          <FileTextOutlined />
          Templates
        </span>
      ),
      children: renderTemplateList(),
      closable: false,
    },
    ...templateTabs.map(tab => ({
      key: tab.key,
      label: (
        <span>
          <EditOutlined />
          {tab.label}
        </span>
      ),
      children: renderTemplateEditor(tab),
      closable: true,
    })),
    ...reportTabs.map(tab => ({
      key: tab.key,
      label: (
        <span>
          <CalculatorOutlined style={{ color: REDWOOD.primary }} />
          {tab.label}
        </span>
      ),
      children: renderReportView(tab),
      closable: true,
    })),
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb */}
        <div style={{
          padding: '16px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
        }}>
          <Breadcrumb
            items={[
              { title: <Link to="/home"><HomeOutlined /> Home</Link> },
              { title: <Link to="/gl">General Ledger</Link> },
              { title: 'Income Statement Templates' },
            ]}
          />
        </div>

        {/* Tabs */}
        <Tabs
          type="editable-card"
          activeKey={activeTabKey}
          onChange={setActiveTabKey}
          onEdit={(targetKey, action) => {
            if (action === 'remove' && typeof targetKey === 'string') {
              closeTemplateTab(targetKey);
            }
          }}
          hideAdd
          items={tabItems}
          style={{ background: REDWOOD.surface }}
          tabBarStyle={{
            margin: 0,
            padding: '8px 16px 0 16px',
            background: REDWOOD.surface,
          }}
        />

        {/* Create Template Modal */}
        <Modal
          title="Create New Template"
          open={templateModalVisible}
          onCancel={() => {
            setTemplateModalVisible(false);
            templateForm.resetFields();
          }}
          onOk={() => templateForm.submit()}
          okText="Create"
          okButtonProps={{ style: { background: REDWOOD.primary } }}
        >
          <Form form={templateForm} layout="vertical" onFinish={handleCreateTemplate}>
            <Form.Item
              name="template_code"
              label="Template Code"
              rules={[{ required: true, message: 'Enter template code' }]}
            >
              <Input placeholder="e.g., PL_CUSTOM_01" />
            </Form.Item>
            <Form.Item
              name="template_name"
              label="Template Name"
              rules={[{ required: true, message: 'Enter template name' }]}
            >
              <Input placeholder="e.g., Custom Profit & Loss" />
            </Form.Item>
            <Form.Item name="description" label="Description">
              <TextArea rows={3} placeholder="Optional description" />
            </Form.Item>
            <Form.Item name="template_type" label="Type" initialValue="CUSTOM">
              <Select options={plService.TEMPLATE_TYPES} />
            </Form.Item>
          </Form>
        </Modal>

        {/* Clone Template Modal */}
        <Modal
          title="Clone Template"
          open={cloneModalVisible}
          onCancel={() => {
            setCloneModalVisible(false);
            cloneForm.resetFields();
            setCloneTemplateId(null);
          }}
          onOk={() => cloneForm.submit()}
          okText="Clone"
        >
          <Form form={cloneForm} layout="vertical" onFinish={handleCloneTemplate}>
            <Form.Item
              name="new_template_code"
              label="New Template Code"
              rules={[{ required: true, message: 'Enter new template code' }]}
            >
              <Input placeholder="e.g., PL_COPY_01" />
            </Form.Item>
            <Form.Item
              name="new_template_name"
              label="New Template Name"
              rules={[{ required: true, message: 'Enter new template name' }]}
            >
              <Input placeholder="e.g., Custom P&L Copy" />
            </Form.Item>
          </Form>
        </Modal>

        {/* Add Group Modal */}
        <Modal
          title="Add Group"
          open={groupModalVisible}
          onCancel={() => {
            setGroupModalVisible(false);
            groupForm.resetFields();
          }}
          onOk={() => groupForm.submit()}
          okText="Add"
          okButtonProps={{ style: { background: REDWOOD.primary } }}
        >
          <Form form={groupForm} layout="vertical" onFinish={handleAddGroup}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="group_code"
                  label="Group Code"
                  rules={[{ required: true, message: 'Enter group code' }]}
                >
                  <Input placeholder="e.g., G5" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="group_type"
                  label="Group Type"
                  rules={[{ required: true, message: 'Select group type' }]}
                >
                  <Select options={plService.GROUP_TYPES} placeholder="Select type" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item
              name="group_name"
              label="Group Name"
              rules={[{ required: true, message: 'Enter group name' }]}
            >
              <Input placeholder="e.g., Operating Revenue" />
            </Form.Item>
            <Form.Item name="group_label" label="Display Label">
              <Input placeholder="Leave empty to use group name" />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="display_order"
                  label="Display Order"
                  rules={[{ required: true, message: 'Enter display order' }]}
                >
                  <InputNumber style={{ width: '100%' }} min={1} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="sign_convention"
                  label="Sign Convention"
                  initialValue={1}
                  tooltip="1 for income items (add), -1 for expense items (subtract)"
                >
                  <Select
                    options={[
                      { value: 1, label: '+ (Income/Add)' },
                      { value: -1, label: '- (Expense/Subtract)' },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Modal>

        {/* Add Section Modal */}
        <Modal
          title="Add Section"
          open={sectionModalVisible}
          onCancel={() => {
            setSectionModalVisible(false);
            sectionForm.resetFields();
            setSelectedGroupId(null);
          }}
          onOk={() => sectionForm.submit()}
          okText="Add"
          okButtonProps={{ style: { background: REDWOOD.primary } }}
        >
          <Form form={sectionForm} layout="vertical" onFinish={handleAddSection}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="section_code"
                  label="Section Code"
                  rules={[{ required: true, message: 'Enter section code' }]}
                >
                  <Input placeholder="e.g., G1S4" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="display_order"
                  label="Display Order"
                  rules={[{ required: true, message: 'Enter display order' }]}
                >
                  <InputNumber style={{ width: '100%' }} min={1} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item
              name="section_name"
              label="Section Name"
              rules={[{ required: true, message: 'Enter section name' }]}
            >
              <Input placeholder="e.g., Interest Income" />
            </Form.Item>
            <Form.Item name="section_label" label="Display Label">
              <Input placeholder="Leave empty to use section name" />
            </Form.Item>
          </Form>
        </Modal>

        {/* Add Account Modal */}
        <Modal
          title={
            <Space>
              <BankOutlined style={{ color: REDWOOD.primary }} />
              <span>Assign Accounts to Section</span>
              {selectedSectionId && (
                <Tag color="blue" style={{ marginLeft: 8 }}>ID: {selectedSectionId}</Tag>
              )}
            </Space>
          }
          open={accountModalVisible}
          onCancel={() => {
            setAccountModalVisible(false);
            accountForm.resetFields();
            setSelectedSectionId(null);
            setSelectedAccounts([]);
            setAccountSearchText('');
          }}
          footer={
            <Space>
              <Button onClick={() => {
                setAccountModalVisible(false);
                setSelectedAccounts([]);
                setAccountSearchText('');
                setSelectedSectionId(null);
              }}>
                Cancel
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAssignSelectedAccounts}
                disabled={selectedAccounts.length === 0}
                style={{ background: REDWOOD.primary }}
              >
                Assign Selected ({selectedAccounts.length})
              </Button>
            </Space>
          }
          width={700}
          styles={{ body: { padding: 0 } }}
        >
          {/* Search Bar - Compact */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: 8, alignItems: 'center' }}>
            <Input.Search
              placeholder="Search accounts..."
              value={accountSearchText}
              onChange={(e) => setAccountSearchText(e.target.value)}
              allowClear
              style={{ flex: 1 }}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={loadGLAccounts}
              loading={glAccountsLoading}
              size="small"
            />
            {selectedAccounts.length > 0 && (
              <Tag color="blue">{selectedAccounts.length} selected</Tag>
            )}
          </div>

          {/* Accounts Table - Compact */}
          <div style={{ maxHeight: 280, overflow: 'auto' }}>
            <Table
              loading={glAccountsLoading}
              dataSource={glAccounts.filter(acc =>
                accountSearchText === '' ||
                acc.account.toLowerCase().includes(accountSearchText.toLowerCase()) ||
                acc.description.toLowerCase().includes(accountSearchText.toLowerCase())
              )}
              rowKey="account"
              size="small"
              pagination={{ pageSize: 8, size: 'small', showTotal: (total) => `${total} accounts` }}
              rowSelection={{
                type: 'checkbox',
                selectedRowKeys: selectedAccounts,
                onChange: (selectedRowKeys) => {
                  setSelectedAccounts(selectedRowKeys as string[]);
                },
              }}
              columns={[
                {
                  title: 'Code',
                  dataIndex: 'account',
                  key: 'account',
                  width: 100,
                  render: (code: string) => (
                    <Text strong style={{ fontFamily: 'monospace', fontSize: 12 }}>{code}</Text>
                  ),
                },
                {
                  title: 'Description',
                  dataIndex: 'description',
                  key: 'description',
                  ellipsis: true,
                },
                {
                  title: 'Type',
                  dataIndex: 'account_type',
                  key: 'account_type',
                  width: 70,
                  render: (type: string) => {
                    const typeMap: Record<string, { label: string; color: string }> = {
                      A: { label: 'Asset', color: 'blue' },
                      L: { label: 'Liab', color: 'orange' },
                      O: { label: 'Eqty', color: 'purple' },
                      R: { label: 'Rev', color: 'green' },
                      E: { label: 'Exp', color: 'red' },
                    };
                    const info = typeMap[type] || { label: type, color: 'default' };
                    return <Tag color={info.color} style={{ fontSize: 10 }}>{info.label}</Tag>;
                  },
                },
              ]}
            />
          </div>

          {/* Manual Entry - Compact */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid #f0f0f0', background: '#fafafa' }}>
            <Form form={accountForm} layout="inline" onFinish={handleAssignAccount} style={{ flexWrap: 'wrap', gap: 4 }}>
              <Form.Item name="account_code" style={{ marginBottom: 0 }}>
                <Input placeholder="Account code" style={{ width: 120 }} size="small" />
              </Form.Item>
              <Text type="secondary" style={{ lineHeight: '24px', fontSize: 12 }}>or range:</Text>
              <Form.Item name="account_from" style={{ marginBottom: 0 }}>
                <Input placeholder="From" style={{ width: 80 }} size="small" />
              </Form.Item>
              <Text type="secondary" style={{ lineHeight: '24px' }}>→</Text>
              <Form.Item name="account_to" style={{ marginBottom: 0 }}>
                <Input placeholder="To" style={{ width: 80 }} size="small" />
              </Form.Item>
              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" ghost size="small">
                  Add
                </Button>
              </Form.Item>
            </Form>
          </div>
        </Modal>

        {/* Add Total Modal */}
        <Modal
          title="Add Calculated Total"
          open={totalModalVisible}
          onCancel={() => {
            setTotalModalVisible(false);
            totalForm.resetFields();
          }}
          onOk={() => totalForm.submit()}
          okText="Add"
          okButtonProps={{ style: { background: REDWOOD.primary } }}
          width={700}
        >
          <Form form={totalForm} layout="vertical" onFinish={handleAddTotal}>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item
                  name="total_code"
                  label="Total Code"
                  rules={[{ required: true, message: 'Enter total code' }]}
                >
                  <Input placeholder="e.g., T6" />
                </Form.Item>
              </Col>
              <Col span={16}>
                <Form.Item
                  name="total_name"
                  label="Total Name"
                  rules={[{ required: true, message: 'Enter total name' }]}
                >
                  <Input placeholder="e.g., Net Profit" />
                </Form.Item>
              </Col>
            </Row>

            {/* Formula Builder */}
            <Form.Item
              name="calculation_formula"
              label="Calculation Formula"
              rules={[{ required: true, message: 'Build formula using buttons below' }]}
            >
              <Input
                placeholder="Click groups/totals below to build formula"
                style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 600 }}
                readOnly
              />
            </Form.Item>

            {/* Formula Builder Buttons */}
            <Card size="small" style={{ marginBottom: 16, background: REDWOOD.neutral100 }}>
              <div style={{ marginBottom: 12 }}>
                <Text strong style={{ marginRight: 8 }}>Groups:</Text>
                <Space wrap>
                  {(getCurrentTemplateTab()?.template?.template.groups || []).map(g => (
                    <Button
                      key={g.group_code}
                      size="small"
                      style={{
                        background: GROUP_TYPE_COLORS[g.group_type] || '#1890ff',
                        borderColor: GROUP_TYPE_COLORS[g.group_type] || '#1890ff',
                        color: '#fff'
                      }}
                      onClick={() => {
                        const currentFormula = totalForm.getFieldValue('calculation_formula') || '';
                        totalForm.setFieldsValue({
                          calculation_formula: currentFormula + g.group_code
                        });
                      }}
                    >
                      {g.group_code} ({g.group_name})
                    </Button>
                  ))}
                </Space>
              </div>

              <div style={{ marginBottom: 12 }}>
                <Text strong style={{ marginRight: 8 }}>Existing Totals:</Text>
                <Space wrap>
                  {(getCurrentTemplateTab()?.template?.template.totals || []).map(t => (
                    <Button
                      key={t.total_code}
                      size="small"
                      style={{ background: '#722ed1', borderColor: '#722ed1', color: '#fff' }}
                      onClick={() => {
                        const currentFormula = totalForm.getFieldValue('calculation_formula') || '';
                        totalForm.setFieldsValue({
                          calculation_formula: currentFormula + t.total_code
                        });
                      }}
                    >
                      {t.total_code} ({t.total_name})
                    </Button>
                  ))}
                  {(getCurrentTemplateTab()?.template?.template.totals || []).length === 0 && (
                    <Text type="secondary">No totals defined yet</Text>
                  )}
                </Space>
              </div>

              <div>
                <Text strong style={{ marginRight: 8 }}>Operators:</Text>
                <Space>
                  <Button
                    size="small"
                    type="primary"
                    style={{ background: REDWOOD.success, borderColor: REDWOOD.success, fontWeight: 600, fontSize: 16 }}
                    onClick={() => {
                      const currentFormula = totalForm.getFieldValue('calculation_formula') || '';
                      totalForm.setFieldsValue({
                        calculation_formula: currentFormula + '+'
                      });
                    }}
                  >
                    +
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    danger
                    style={{ fontWeight: 600, fontSize: 16 }}
                    onClick={() => {
                      const currentFormula = totalForm.getFieldValue('calculation_formula') || '';
                      totalForm.setFieldsValue({
                        calculation_formula: currentFormula + '-'
                      });
                    }}
                  >
                    −
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      const currentFormula = totalForm.getFieldValue('calculation_formula') || '';
                      totalForm.setFieldsValue({
                        calculation_formula: currentFormula + '('
                      });
                    }}
                  >
                    (
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      const currentFormula = totalForm.getFieldValue('calculation_formula') || '';
                      totalForm.setFieldsValue({
                        calculation_formula: currentFormula + ')'
                      });
                    }}
                  >
                    )
                  </Button>
                  <Divider type="vertical" />
                  <Button
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => {
                      const currentFormula = totalForm.getFieldValue('calculation_formula') || '';
                      totalForm.setFieldsValue({
                        calculation_formula: currentFormula.slice(0, -1)
                      });
                    }}
                  >
                    Backspace
                  </Button>
                  <Button
                    size="small"
                    danger
                    onClick={() => {
                      totalForm.setFieldsValue({ calculation_formula: '' });
                    }}
                  >
                    Clear
                  </Button>
                </Space>
              </div>
            </Card>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="display_order"
                  label="Display Order"
                  rules={[{ required: true, message: 'Enter display order' }]}
                >
                  <InputNumber style={{ width: '100%' }} min={1} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="after_group_code" label="Show After Group">
                  <Select
                    allowClear
                    placeholder="Select group"
                    options={
                      (getCurrentTemplateTab()?.template?.template.groups || []).map(g => ({
                        value: g.group_code,
                        label: `${g.group_code} - ${g.group_name}`,
                      }))
                    }
                  />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Modal>

        {/* Report Period Selection Modal */}
        <Modal
          title={
            <Space>
              <CalculatorOutlined style={{ color: REDWOOD.primary }} />
              <span>Generate P&L Report</span>
            </Space>
          }
          open={reportPeriodModalVisible}
          onCancel={() => {
            setReportPeriodModalVisible(false);
            reportPeriodForm.resetFields();
            setSelectedPeriods([]);
          }}
          footer={
            <Space>
              <Button onClick={() => {
                setReportPeriodModalVisible(false);
                setSelectedPeriods([]);
              }}>
                Cancel
              </Button>
              <Button
                type="primary"
                onClick={handleGenerateReport}
                disabled={selectedPeriods.length === 0 || !selectedLedgerId}
                style={{ background: REDWOOD.primary }}
              >
                Generate Report ({selectedPeriods.length} period{selectedPeriods.length !== 1 ? 's' : ''})
              </Button>
            </Space>
          }
          width={500}
        >
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            Select accounting periods for <strong>{reportTemplateName}</strong>.
            Add multiple periods for a comparative P&L report.
          </Text>

          {/* Ledger Selection */}
          <Card size="small" title="Select Ledger" style={{ marginBottom: 16, background: '#f9f9f9' }}>
            <Select
              placeholder="Select Ledger"
              style={{ width: '100%' }}
              value={selectedLedgerId}
              onChange={(value) => setSelectedLedgerId(value)}
              loading={loadingLedgers}
              showSearch
              optionFilterProp="children"
            >
              {ledgers.map(l => (
                <Select.Option key={l.ledger_id} value={l.ledger_id}>
                  {l.ledger_name} (ID: {l.ledger_id})
                </Select.Option>
              ))}
            </Select>
          </Card>

          {/* Period Selection */}
          <Form form={reportPeriodForm} layout="inline" style={{ marginBottom: 16 }}>
            <Form.Item name="period_year" style={{ marginBottom: 8 }}>
              <Select
                placeholder="Year"
                style={{ width: 100 }}
                options={Array.from({ length: 10 }, (_, i) => ({
                  value: new Date().getFullYear() - i,
                  label: String(new Date().getFullYear() - i),
                }))}
              />
            </Form.Item>
            <Form.Item name="period_num" style={{ marginBottom: 8 }}>
              <Select
                placeholder="Period"
                style={{ width: 150 }}
                options={[
                  { value: 1, label: 'Jan (01)' },
                  { value: 2, label: 'Feb (02)' },
                  { value: 3, label: 'Mar (03)' },
                  { value: 4, label: 'Apr (04)' },
                  { value: 5, label: 'May (05)' },
                  { value: 6, label: 'Jun (06)' },
                  { value: 7, label: 'Jul (07)' },
                  { value: 8, label: 'Aug (08)' },
                  { value: 9, label: 'Sep (09)' },
                  { value: 10, label: 'Oct (10)' },
                  { value: 11, label: 'Nov (11)' },
                  { value: 12, label: 'Dec (12)' },
                  { value: 13, label: 'Adj (13)' },
                ]}
              />
            </Form.Item>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={addPeriodToSelection}
              style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
            >
              Add Period
            </Button>
          </Form>

          {/* Selected Periods Display */}
          <Card
            size="small"
            title={
              <Space>
                <Text strong>Selected Periods</Text>
                {selectedPeriods.length > 1 && (
                  <Tag color="blue">Comparative Report</Tag>
                )}
              </Space>
            }
            style={{ background: '#f9f9f9' }}
          >
            {selectedPeriods.length === 0 ? (
              <Text type="secondary">No periods selected. Add at least one period.</Text>
            ) : (
              <Space wrap>
                {selectedPeriods.map((p, idx) => {
                  const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Adj'];
                  return (
                    <Tag
                      key={`${p.year}-${p.num}`}
                      closable
                      onClose={() => removePeriodFromSelection(p.year, p.num)}
                      color="blue"
                      style={{ padding: '4px 8px', fontSize: 13 }}
                    >
                      {monthNames[p.num]} {p.year}
                    </Tag>
                  );
                })}
              </Space>
            )}
          </Card>

          {/* Quick Select Options */}
          <div style={{ marginTop: 16 }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
              Quick Select:
            </Text>
            <Space wrap>
              <Button
                size="small"
                onClick={() => {
                  const year = new Date().getFullYear();
                  setSelectedPeriods([
                    { year, num: 1 }, { year, num: 2 }, { year, num: 3 },
                    { year, num: 4 }, { year, num: 5 }, { year, num: 6 },
                    { year, num: 7 }, { year, num: 8 }, { year, num: 9 },
                    { year, num: 10 }, { year, num: 11 }, { year, num: 12 },
                  ]);
                }}
              >
                Full Year {new Date().getFullYear()}
              </Button>
              <Button
                size="small"
                onClick={() => {
                  const year = new Date().getFullYear();
                  setSelectedPeriods([
                    { year, num: 1 }, { year, num: 2 }, { year, num: 3 },
                  ]);
                }}
              >
                Q1 {new Date().getFullYear()}
              </Button>
              <Button
                size="small"
                onClick={() => {
                  const year = new Date().getFullYear();
                  setSelectedPeriods([
                    { year, num: 4 }, { year, num: 5 }, { year, num: 6 },
                  ]);
                }}
              >
                Q2 {new Date().getFullYear()}
              </Button>
              <Button
                size="small"
                onClick={() => {
                  // Last 3 months
                  const now = new Date();
                  const periods: ReportPeriod[] = [];
                  for (let i = 2; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    periods.push({ year: d.getFullYear(), num: d.getMonth() + 1 });
                  }
                  setSelectedPeriods(periods);
                }}
              >
                Last 3 Months
              </Button>
              <Button
                size="small"
                danger
                onClick={() => setSelectedPeriods([])}
              >
                Clear All
              </Button>
            </Space>
          </div>
        </Modal>

        {/* Preview Modal */}
        {renderPreviewModal()}

        {/* Excel View Modal */}
        {renderExcelModal()}

        {/* Debug Modal */}
        <Modal
          title={
            <Space>
              <BugOutlined style={{ color: '#faad14' }} />
              <span>Debug: Raw API Response</span>
            </Space>
          }
          open={debugModalVisible}
          onCancel={() => {
            setDebugModalVisible(false);
            setDebugData(null);
          }}
          footer={
            <Button onClick={() => {
              setDebugModalVisible(false);
              setDebugData(null);
            }}>
              Close
            </Button>
          }
          width={900}
        >
          {debugLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin size="large" tip="Fetching data..." />
            </div>
          ) : debugData ? (
            <div>
              {/* Request Info */}
              <Card size="small" title="Request Info" style={{ marginBottom: 16 }}>
                <p><strong>URL:</strong> <Text code copyable>{debugData.url}</Text></p>
                <p><strong>Status:</strong> {debugData.status} {debugData.statusText}</p>
                <p><strong>Timestamp:</strong> {debugData.timestamp}</p>
              </Card>

              {/* Error if any */}
              {debugData.error && (
                <Card size="small" title="Error" style={{ marginBottom: 16, borderColor: '#ff4d4f' }}>
                  <Text type="danger">{debugData.error}</Text>
                </Card>
              )}

              {/* Parsed Response */}
              {debugData.parsedResponse && (
                <Card size="small" title="Parsed Response" style={{ marginBottom: 16 }}>
                  <div style={{ maxHeight: 400, overflow: 'auto' }}>
                    <pre style={{ fontSize: 11, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {JSON.stringify(debugData.parsedResponse, null, 2)}
                    </pre>
                  </div>
                </Card>
              )}

              {/* Raw Response */}
              <Card size="small" title="Raw Response (first 5000 chars)">
                <div style={{ maxHeight: 200, overflow: 'auto' }}>
                  <pre style={{ fontSize: 10, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#666' }}>
                    {debugData.rawResponse}
                  </pre>
                </div>
              </Card>
            </div>
          ) : (
            <Empty description="No debug data" />
          )}
        </Modal>

        {/* PDF Preview Modal */}
        <Modal
          title={
            <Space>
              <FilePdfOutlined style={{ color: '#ff4d4f' }} />
              <span>Print Preview</span>
            </Space>
          }
          open={pdfPreviewVisible}
          onCancel={() => {
            setPdfPreviewVisible(false);
            setPdfPreviewContent('');
          }}
          footer={
            <Space>
              <Button onClick={() => {
                setPdfPreviewVisible(false);
                setPdfPreviewContent('');
              }}>
                Close
              </Button>
              <Button
                type="primary"
                icon={<PrinterOutlined />}
                onClick={handlePrintFromModal}
                style={{ background: '#ff4d4f', borderColor: '#ff4d4f' }}
              >
                Print / Save as PDF
              </Button>
            </Space>
          }
          width={900}
          bodyStyle={{ padding: 0, height: '70vh' }}
          centered
        >
          <iframe
            id="pdf-preview-iframe"
            srcDoc={pdfPreviewContent}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              background: '#fff',
            }}
            title="PDF Preview"
          />
        </Modal>
      </Content>

      {/* Autopilot */}
      <Autopilot />
    </Layout>
  );
};

export default IncomeStatementTemplates;
