import React, { useState, useEffect } from 'react';
import {
  Layout,
  Card,
  Form,
  Select,
  Input,
  Button,
  Space,
  Typography,
  Table,
  Tag,
  Row,
  Col,
  Tooltip,
  Dropdown,
  Tabs,
  Modal,
  message,
  Spin,
  Alert,
  Divider,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  SaveOutlined,
  CloseOutlined,
  DownOutlined,
  PlusOutlined,
  DeleteOutlined,
  FileTextOutlined,
  PaperClipOutlined,
  LeftOutlined,
  RightOutlined,
  CloudSyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  PrinterOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { PROXY_CONFIG, ORACLE_FUSION_CONFIG } from '../../config/api.config';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

// Fusion data interfaces (matching actual Oracle Fusion API response)
interface FusionJournalLine {
  JeLineNumber: number;
  AccountCombination?: string;
  EnteredDr: number | null;
  EnteredCr: number | null;
  AccountedDr: number | null;
  AccountedCr: number | null;
  Description?: string;
  CurrencyCode?: string;
}

interface FusionJournalHeader {
  JournalName: string;
  JournalDescription?: string;
  LedgerName?: string;
  PeriodName?: string;
  CurrencyCode?: string;
  UserJeCategoryName?: string;
  RunningTotalDr?: number;
  RunningTotalCr?: number;
  RunningTotalAccountedDr?: number;
  RunningTotalAccountedCr?: number;
  lines?: FusionJournalLine[];
  links?: any[];
}

interface FusionData {
  headers: FusionJournalHeader[];
  batchName?: string;
  batchStatus?: string;
}

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
};

// Journal Line interface
interface JournalLine {
  key: string;
  lineId: number;
  lineNum: number;
  account: string;
  currency: string;
  enteredDr: number;
  enteredCr: number;
  conversionDate: string;
  accountedDr: number;
  accountedCr: number;
  description: string;
  accountDescription: string;
}

// Journal data interface
interface JournalData {
  // Batch info
  batchId: number;
  jeBatchId: number;
  batchName: string;
  batchDescription: string;
  balanceType: string;
  periodName: string;
  source: string;
  approvalStatusMeaning: string;
  statusMeaning: string;
  completionStatus: string;
  // Header info
  headerId: number;
  jeHeaderId: number;
  journalName: string;
  journalDescription: string;
  ledgerName: string;
  legalEntityName: string;
  accountingDate: string;
  category: string;
  currencyCode: string;
  conversionDate: string;
  conversionRateType: string;
  conversionRate: number;
  inverseConversionRate: number;
  externalReference: string;
  referenceDate: string;
  // Totals
  enteredDebit: number;
  enteredCredit: number;
  accountedDebit: number;
  accountedCredit: number;
  controlTotal: number;
  // Sequencing
  accountingSequenceName: string;
  accountingSequenceNumber: string;
  reportingSequenceName: string;
  reportingSequenceNumber: string;
  // Reversal
  reversalPeriod: string;
  reversalMethod: string;
  reversalStatus: string;
  // Lines
  lines: JournalLine[];
}

// Helper to get currency name
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

// Map API journal to JournalData
const mapToJournalData = (journal: any): JournalData => ({
  batchId: journal.batchId,
  jeBatchId: journal.jeBatchId,
  batchName: journal.batchName || '',
  batchDescription: journal.batchDescription || '',
  balanceType: 'Actual',
  periodName: journal.periodName || '',
  source: journal.source || '',
  approvalStatusMeaning: journal.approvalStatusMeaning || 'Not required',
  statusMeaning: journal.statusMeaning || '',
  completionStatus: journal.statusMeaning === 'Posted' ? 'Complete' : 'Incomplete',
  headerId: journal.headerId,
  jeHeaderId: journal.jeHeaderId,
  journalName: journal.journalName || '',
  journalDescription: journal.journalDescription || '',
  ledgerName: journal.ledgerName || '',
  legalEntityName: journal.legalEntityName || '',
  accountingDate: journal.effectiveDate || '',
  category: journal.category || '',
  currencyCode: journal.currencyCode || '',
  conversionDate: journal.effectiveDate || '',
  conversionRateType: 'User',
  conversionRate: 1,
  inverseConversionRate: 1,
  externalReference: journal.externalReference || '',
  referenceDate: '',
  enteredDebit: journal.enteredDebit || 0,
  enteredCredit: journal.enteredCredit || 0,
  accountedDebit: journal.accountedDebit || 0,
  accountedCredit: journal.accountedCredit || 0,
  controlTotal: 0,
  accountingSequenceName: '',
  accountingSequenceNumber: '',
  reportingSequenceName: '',
  reportingSequenceNumber: '',
  reversalPeriod: '',
  reversalMethod: 'Switch DR or CR',
  reversalStatus: 'Not reversed',
  lines: (journal.lines || []).map((line: any, index: number) => ({
    key: String(index + 1),
    lineId: line.lineId,
    lineNum: line.lineNum,
    account: line.account || '',
    currency: `${journal.currencyCode || ''} ${getCurrencyName(journal.currencyCode)}`,
    enteredDr: line.enteredDr || 0,
    enteredCr: line.enteredCr || 0,
    conversionDate: journal.effectiveDate || '',
    accountedDr: line.accountedDr || 0,
    accountedCr: line.accountedCr || 0,
    description: line.description || '',
    accountDescription: journal.legalEntityName || '',
  })),
});

const EditJournal: React.FC = () => {
  const { id, batchId } = useParams<{ id?: string; batchId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedLineKeys, setSelectedLineKeys] = useState<React.Key[]>([]);

  // Get data passed from ManageJournals
  const passedJournal = (location.state as { journal?: any })?.journal;
  const passedBatch = (location.state as { batch?: any })?.batch;
  const passedBatchJournals = (location.state as { batchJournals?: any[] })?.batchJournals;

  // Determine if this is batch mode (multiple journals)
  const isBatchMode = !!batchId && passedBatchJournals && passedBatchJournals.length > 0;

  // All journals in the batch (or single journal)
  const [allJournals, setAllJournals] = useState<JournalData[]>([]);
  const [activeJournalKey, setActiveJournalKey] = useState<string>('0');

  // Current journal being viewed
  const currentJournal = allJournals[parseInt(activeJournalKey)] || null;

  // Collapsible states
  const [batchExpanded, setBatchExpanded] = useState(false);
  const [journalExpanded, setJournalExpanded] = useState(false);

  // Active detail tab (Journal, Control Total, Sequencing, Reversal)
  const [activeDetailTab, setActiveDetailTab] = useState('journal');

  // Fusion comparison modal state
  const [fusionModalVisible, setFusionModalVisible] = useState(false);
  const [fusionLoading, setFusionLoading] = useState(false);
  const [fusionData, setFusionData] = useState<FusionData | null>(null);
  const [fusionError, setFusionError] = useState<string | null>(null);
  const [activeFusionHeaderKey, setActiveFusionHeaderKey] = useState<string>('0');
  const [activeFusionTab, setActiveFusionTab] = useState<string>('comparison');
  const [fusionApiLogs, setFusionApiLogs] = useState<Array<{ url: string; proxyUrl: string; status: string; timestamp: string; response?: any }>>([]);

  // Load journal data
  useEffect(() => {
    loadJournalData();
  }, [passedJournal, passedBatchJournals]);

  const loadJournalData = async () => {
    setLoading(true);
    try {
      if (isBatchMode && passedBatchJournals) {
        // Batch mode - load all journals in batch
        const mappedJournals = passedBatchJournals.map(mapToJournalData);
        setAllJournals(mappedJournals);
        setActiveJournalKey('0');
      } else if (passedJournal) {
        // Single journal mode
        const mappedJournal = mapToJournalData(passedJournal);
        setAllJournals([mappedJournal]);
        setActiveJournalKey('0');
      } else {
        // No data passed - redirect back
        message.warning('No journal data found. Please select a journal from the list.');
        navigate('/gl/manage-journals');
      }
    } catch (error) {
      message.error('Failed to load journal data');
    } finally {
      setLoading(false);
    }
  };

  // Fetch from Oracle via proxy with logging
  const fetchFromOracleUrl = async (url: string, addLog: (log: any) => void): Promise<any> => {
    const proxyUrl = `${PROXY_CONFIG.baseUrl}/oracle-url?url=${encodeURIComponent(url)}`;
    const timestamp = new Date().toLocaleTimeString();

    try {
      const response = await fetch(proxyUrl);
      const data = await response.json();

      addLog({
        url,
        proxyUrl,
        status: data.success ? 'SUCCESS' : 'FAILED',
        timestamp,
        response: data.success ? { items: data.items?.length || 0 } : { error: data.error },
      });

      if (!data.success) {
        throw new Error(data.error || 'Fetch failed');
      }

      return data;
    } catch (error: any) {
      addLog({
        url,
        proxyUrl,
        status: 'ERROR',
        timestamp,
        response: { error: error.message },
      });
      throw error;
    }
  };

  // Check in Fusion handler
  const handleCheckInFusion = async () => {
    if (!currentJournal?.jeBatchId) {
      message.error('No batch ID available to check in Fusion');
      return;
    }

    setFusionModalVisible(true);
    setFusionLoading(true);
    setFusionError(null);
    setFusionData(null);
    setActiveFusionTab('comparison');

    // Clear and build logs
    const logs: Array<{ url: string; proxyUrl: string; status: string; timestamp: string; response?: any }> = [];
    const addLog = (log: any) => {
      logs.push(log);
      setFusionApiLogs([...logs]);
    };

    try {
      // Fetch headers for this batch via proxy
      const headersUrl = `${ORACLE_FUSION_CONFIG.baseUrl}/journalBatches/${currentJournal.jeBatchId}/child/journalHeaders`;

      const headersResult = await fetchFromOracleUrl(headersUrl, addLog);
      const headers: FusionJournalHeader[] = headersResult.items || [];

      // Fetch lines for each header
      for (const header of headers) {
        // Find the journalLines link
        const linesLink = (header as any).links?.find((l: any) => l.name === 'journalLines')?.href;

        if (linesLink) {
          try {
            const linesResult = await fetchFromOracleUrl(linesLink, addLog);
            header.lines = linesResult.items || [];
          } catch (lineErr) {
            console.error('Error fetching lines:', lineErr);
            header.lines = [];
          }
        }
      }

      setFusionData({
        headers,
        batchName: headersResult.Name || currentJournal.batchName,
        batchStatus: headersResult.Status,
      });

      if (headers.length === 0) {
        setFusionError('No journal headers found in Fusion for this batch');
      }
    } catch (error: any) {
      console.error('Error fetching from Fusion:', error);
      if (error.message?.includes('Failed to fetch')) {
        setFusionError('Proxy server is not running. Start it with: npm run server');
      } else {
        setFusionError(error.message || 'Failed to connect to Oracle Fusion');
      }
    } finally {
      setFusionLoading(false);
    }
  };

  // Get current fusion header
  const currentFusionHeader = fusionData?.headers?.[parseInt(activeFusionHeaderKey)] || null;

  // Fusion line columns (using actual Oracle Fusion API field names)
  const fusionLineColumns: ColumnsType<FusionJournalLine> = [
    {
      title: 'Line',
      dataIndex: 'JeLineNumber',
      key: 'JeLineNumber',
      width: 60,
    },
    {
      title: 'Account',
      dataIndex: 'AccountCombination',
      key: 'AccountCombination',
      width: 280,
    },
    {
      title: 'Entered Dr',
      dataIndex: 'EnteredDr',
      key: 'EnteredDr',
      width: 120,
      align: 'right',
      render: (val) => val ? formatNumber(val) : '',
    },
    {
      title: 'Entered Cr',
      dataIndex: 'EnteredCr',
      key: 'EnteredCr',
      width: 120,
      align: 'right',
      render: (val) => val ? formatNumber(val) : '',
    },
    {
      title: 'Accounted Dr',
      dataIndex: 'AccountedDr',
      key: 'AccountedDr',
      width: 120,
      align: 'right',
      render: (val) => val ? formatNumber(val) : '',
    },
    {
      title: 'Accounted Cr',
      dataIndex: 'AccountedCr',
      key: 'AccountedCr',
      width: 120,
      align: 'right',
      render: (val) => val ? formatNumber(val) : '',
    },
    {
      title: 'Description',
      dataIndex: 'Description',
      key: 'Description',
      width: 200,
      ellipsis: true,
    },
  ];

  // Compare values helper
  const compareValue = (local: any, fusion: any, label: string) => {
    const localVal = local ?? '-';
    const fusionVal = fusion ?? '-';
    const match = String(localVal) === String(fusionVal) ||
                  (typeof localVal === 'number' && typeof fusionVal === 'number' &&
                   Math.abs(localVal - fusionVal) < 0.01);

    return (
      <Row gutter={8} style={{ marginBottom: 8 }}>
        <Col span={8}><Text type="secondary">{label}</Text></Col>
        <Col span={7}><Text>{typeof localVal === 'number' ? formatNumber(localVal) : localVal}</Text></Col>
        <Col span={7}><Text>{typeof fusionVal === 'number' ? formatNumber(fusionVal) : fusionVal}</Text></Col>
        <Col span={2}>
          {match ?
            <CheckCircleOutlined style={{ color: REDWOOD.success }} /> :
            <CloseCircleOutlined style={{ color: REDWOOD.primary }} />
          }
        </Col>
      </Row>
    );
  };

  // Save handler
  const handleSave = async () => {
    setSaving(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      message.success('Journal saved successfully');
    } catch (error) {
      message.error('Failed to save journal');
    } finally {
      setSaving(false);
    }
  };

  // Cancel handler
  const handleCancel = () => {
    navigate('/gl/manage-journals');
  };

  // Format currency
  const formatNumber = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '-';
    return value.toLocaleString('en-US', { minimumFractionDigits: 2 });
  };

  // Print Journal - Generate PDF
  const handlePrintJournal = () => {
    if (!currentJournal) {
      message.error('No journal data to print');
      return;
    }

    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Colors
    const primaryColor: [number, number, number] = [199, 70, 52]; // #C74634
    const headerBg: [number, number, number] = [245, 245, 245];
    const textColor: [number, number, number] = [26, 26, 26];

    let yPos = 15;

    // Header Banner
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 25, 'F');

    // Company Name
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('ReactERP', 14, 12);

    // Report Title
    doc.setFontSize(14);
    doc.text('Journal Report', 14, 20);

    // Print Date
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Printed: ${new Date().toLocaleString()}`, pageWidth - 60, 12);

    yPos = 35;

    // Batch Information Section
    doc.setTextColor(...textColor);
    doc.setFillColor(...primaryColor);
    doc.rect(14, yPos, pageWidth - 28, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Journal Batch Information', 17, yPos + 5);

    yPos += 10;
    doc.setTextColor(...textColor);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    // Batch details in two columns
    const batchDetails = [
      ['Batch Name:', currentJournal.batchName],
      ['Description:', currentJournal.batchDescription || '-'],
      ['Accounting Period:', currentJournal.periodName],
      ['Source:', currentJournal.source],
      ['Status:', currentJournal.statusMeaning],
      ['Approval Status:', currentJournal.approvalStatusMeaning],
    ];

    const colWidth = (pageWidth - 28) / 2;
    batchDetails.forEach((item, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = 14 + (col * colWidth);
      const y = yPos + (row * 6);

      doc.setFont('helvetica', 'bold');
      doc.text(item[0], x + 3, y + 4);
      doc.setFont('helvetica', 'normal');
      doc.text(item[1], x + 40, y + 4);
    });

    yPos += 22;

    // Journal Header Section
    doc.setFillColor(...primaryColor);
    doc.rect(14, yPos, pageWidth - 28, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Journal Header', 17, yPos + 5);

    yPos += 10;
    doc.setTextColor(...textColor);
    doc.setFontSize(9);

    const journalDetails = [
      ['Journal Name:', currentJournal.journalName],
      ['Description:', currentJournal.journalDescription || '-'],
      ['Ledger:', currentJournal.ledgerName],
      ['Legal Entity:', currentJournal.legalEntityName || '-'],
      ['Accounting Date:', currentJournal.accountingDate],
      ['Category:', currentJournal.category],
      ['Currency:', `${currentJournal.currencyCode} - ${getCurrencyName(currentJournal.currencyCode)}`],
      ['Conversion Rate:', String(currentJournal.conversionRate)],
    ];

    journalDetails.forEach((item, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = 14 + (col * colWidth);
      const y = yPos + (row * 6);

      doc.setFont('helvetica', 'bold');
      doc.text(item[0], x + 3, y + 4);
      doc.setFont('helvetica', 'normal');
      doc.text(item[1], x + 40, y + 4);
    });

    yPos += 28;

    // Journal Lines Section
    doc.setFillColor(...primaryColor);
    doc.rect(14, yPos, pageWidth - 28, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Journal Lines (${currentJournal.lines.length} lines)`, 17, yPos + 5);

    yPos += 10;

    // Lines Table
    const tableData = currentJournal.lines.map(line => [
      String(line.lineNum),
      line.account,
      line.enteredDr > 0 ? formatNumber(line.enteredDr) : '',
      line.enteredCr > 0 ? formatNumber(line.enteredCr) : '',
      line.accountedDr > 0 ? formatNumber(line.accountedDr) : '',
      line.accountedCr > 0 ? formatNumber(line.accountedCr) : '',
      line.description || '',
    ]);

    // Calculate totals
    const totals = currentJournal.lines.reduce(
      (acc, line) => ({
        enteredDr: acc.enteredDr + (line.enteredDr || 0),
        enteredCr: acc.enteredCr + (line.enteredCr || 0),
        accountedDr: acc.accountedDr + (line.accountedDr || 0),
        accountedCr: acc.accountedCr + (line.accountedCr || 0),
      }),
      { enteredDr: 0, enteredCr: 0, accountedDr: 0, accountedCr: 0 }
    );

    // Add totals row
    tableData.push([
      '',
      'TOTAL',
      formatNumber(totals.enteredDr),
      formatNumber(totals.enteredCr),
      formatNumber(totals.accountedDr),
      formatNumber(totals.accountedCr),
      '',
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [[
        'Line',
        'Account',
        `Entered Dr (${currentJournal.currencyCode})`,
        `Entered Cr (${currentJournal.currencyCode})`,
        'Accounted Dr',
        'Accounted Cr',
        'Description',
      ]],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: primaryColor,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
      },
      bodyStyles: {
        fontSize: 8,
        textColor: textColor,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        1: { cellWidth: 70 },
        2: { halign: 'right', cellWidth: 35 },
        3: { halign: 'right', cellWidth: 35 },
        4: { halign: 'right', cellWidth: 35 },
        5: { halign: 'right', cellWidth: 35 },
        6: { cellWidth: 50 },
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250],
      },
      // Style the totals row
      didParseCell: (data) => {
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [230, 230, 230];
        }
      },
      margin: { left: 14, right: 14 },
    });

    // Footer
    const finalY = (doc as any).lastAutoTable.finalY + 10;

    // Balance check
    const isBalanced = Math.abs(totals.enteredDr - totals.enteredCr) < 0.01;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(isBalanced ? [29, 123, 77] : primaryColor)); // Green if balanced, Red if not
    doc.text(
      isBalanced ? '✓ Journal is Balanced' : '✗ Journal is NOT Balanced',
      14,
      finalY
    );

    // Page numbers
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Page ${i} of ${pageCount}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );
    }

    // Open PDF in new window
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    window.open(pdfUrl, '_blank');

    message.success('PDF generated successfully');
  };

  // Line columns
  const lineColumns: ColumnsType<JournalLine> = [
    {
      title: 'Line',
      dataIndex: 'lineNum',
      key: 'lineNum',
      width: 60,
      fixed: 'left',
    },
    {
      title: <span><span style={{ color: REDWOOD.primary }}>*</span> Account</span>,
      dataIndex: 'account',
      key: 'account',
      width: 280,
    },
    {
      title: 'Currency',
      dataIndex: 'currency',
      key: 'currency',
      width: 120,
    },
    {
      title: `Entered (${currentJournal?.currencyCode || 'INR'})`,
      children: [
        {
          title: 'Debit',
          dataIndex: 'enteredDr',
          key: 'enteredDr',
          width: 100,
          align: 'right',
          render: (val) => val > 0 ? formatNumber(val) : '',
        },
        {
          title: 'Credit',
          dataIndex: 'enteredCr',
          key: 'enteredCr',
          width: 100,
          align: 'right',
          render: (val) => val > 0 ? formatNumber(val) : '',
        },
      ],
    },
    {
      title: 'Conversion',
      children: [
        {
          title: 'Date',
          dataIndex: 'conversionDate',
          key: 'conversionDate',
          width: 100,
        },
      ],
    },
    {
      title: 'Accounted (AED)',
      children: [
        {
          title: 'Debit',
          dataIndex: 'accountedDr',
          key: 'accountedDr',
          width: 100,
          align: 'right',
          render: (val) => val > 0 ? formatNumber(val) : '',
        },
        {
          title: 'Credit',
          dataIndex: 'accountedCr',
          key: 'accountedCr',
          width: 100,
          align: 'right',
          render: (val) => val > 0 ? formatNumber(val) : '',
        },
      ],
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 250,
      ellipsis: true,
    },
    {
      title: 'Account Description',
      dataIndex: 'accountDescription',
      key: 'accountDescription',
      width: 180,
      ellipsis: true,
    },
  ];

  // Calculate totals for current journal
  const lineTotals = currentJournal?.lines.reduce(
    (acc, line) => ({
      enteredDr: acc.enteredDr + (line.enteredDr || 0),
      enteredCr: acc.enteredCr + (line.enteredCr || 0),
      accountedDr: acc.accountedDr + (line.accountedDr || 0),
      accountedCr: acc.accountedCr + (line.accountedCr || 0),
    }),
    { enteredDr: 0, enteredCr: 0, accountedDr: 0, accountedCr: 0 }
  ) || { enteredDr: 0, enteredCr: 0, accountedDr: 0, accountedCr: 0 };

  // Batch Actions menu
  const batchActionsMenu: MenuProps['items'] = [
    { key: 'post', label: 'Post' },
    { key: 'reverse', label: 'Reverse' },
    { key: 'delete', label: 'Delete' },
  ];

  // Journal Actions menu
  const journalActionsMenu: MenuProps['items'] = [
    { key: 'copy', label: 'Copy' },
    { key: 'reverse', label: 'Reverse' },
    { key: 'delete', label: 'Delete' },
  ];

  // Save dropdown menu
  const saveMenu: MenuProps['items'] = [
    { key: 'save', label: 'Save' },
    { key: 'saveClose', label: 'Save and Close' },
  ];

  // Post dropdown menu
  const postMenu: MenuProps['items'] = [
    { key: 'post', label: 'Post' },
    { key: 'postClose', label: 'Post and Close' },
  ];

  // Journal tabs for batch mode
  const journalTabs = allJournals.map((journal, index) => ({
    key: String(index),
    label: journal.journalName || `Journal ${index + 1}`,
  }));

  // Render journal detail tabs content
  const renderDetailTabs = () => {
    if (!currentJournal) return null;

    return (
      <Tabs
        activeKey={activeDetailTab}
        onChange={setActiveDetailTab}
        style={{ padding: '0 16px' }}
        items={[
          {
            key: 'journal',
            label: 'Journal',
            children: (
              <div style={{ padding: '16px 0' }}>
                <Row gutter={[48, 12]}>
                  <Col span={12}>
                    <Row gutter={[8, 12]}>
                      <Col span={10}><Text type="secondary">Journal</Text></Col>
                      <Col span={14}><Text strong>{currentJournal.journalName}</Text></Col>

                      <Col span={10}><Text type="secondary">Description</Text></Col>
                      <Col span={14}><Text>{currentJournal.journalDescription}</Text></Col>

                      <Col span={10}><Text type="secondary"><span style={{ color: REDWOOD.primary }}>*</span> Ledger</Text></Col>
                      <Col span={14}><Text>{currentJournal.ledgerName}</Text></Col>

                      <Col span={10}><Text type="secondary"><span style={{ color: REDWOOD.primary }}>*</span> Legal Entity</Text></Col>
                      <Col span={14}><Text>{currentJournal.legalEntityName}</Text></Col>

                      <Col span={10}><Text type="secondary">Accounting Date</Text></Col>
                      <Col span={14}><Text>{currentJournal.accountingDate}</Text></Col>

                      <Col span={10}><Text type="secondary"><span style={{ color: REDWOOD.primary }}>*</span> Category</Text></Col>
                      <Col span={14}><Text>{currentJournal.category}</Text></Col>

                      <Col span={10}><Text type="secondary">Attachments</Text></Col>
                      <Col span={14}>
                        <Space>
                          <Text>None</Text>
                          <PaperClipOutlined style={{ color: REDWOOD.info }} />
                        </Space>
                      </Col>
                    </Row>
                  </Col>
                  <Col span={12}>
                    <Row gutter={[8, 12]}>
                      <Col span={10}><Text type="secondary">Currency</Text></Col>
                      <Col span={14}><Text>{currentJournal.currencyCode} {getCurrencyName(currentJournal.currencyCode)}</Text></Col>

                      <Col span={10}><Text type="secondary">Conversion Date</Text></Col>
                      <Col span={14}><Text>{currentJournal.conversionDate}</Text></Col>

                      <Col span={10}><Text type="secondary">Conversion Rate Type</Text></Col>
                      <Col span={14}><Text>{currentJournal.conversionRateType}</Text></Col>

                      <Col span={10}><Text type="secondary">Conversion Rate</Text></Col>
                      <Col span={14}><Text>{currentJournal.conversionRate}</Text></Col>

                      <Col span={10}><Text type="secondary">Inverse Rate</Text></Col>
                      <Col span={14}><Text>{currentJournal.inverseConversionRate}</Text></Col>

                      <Col span={10}><Text type="secondary">Reference</Text></Col>
                      <Col span={14}><Text>{currentJournal.externalReference}</Text></Col>

                      <Col span={10}><Text type="secondary">Reference Date</Text></Col>
                      <Col span={14}><Text>{currentJournal.referenceDate || '-'}</Text></Col>
                    </Row>
                  </Col>
                </Row>
              </div>
            ),
          },
          {
            key: 'controlTotal',
            label: 'Control Total',
            children: (
              <div style={{ padding: '16px 0' }}>
                <Row gutter={[48, 16]}>
                  <Col span={12}>
                    <Title level={5}>Control Total</Title>
                    <Row gutter={[8, 12]}>
                      <Col span={12}><Text type="secondary">Total Entered Debit</Text></Col>
                      <Col span={12}><Text>{formatNumber(currentJournal.enteredDebit)}</Text></Col>

                      <Col span={12}><Text type="secondary">Total Entered Credit</Text></Col>
                      <Col span={12}><Text>{formatNumber(currentJournal.enteredCredit)}</Text></Col>
                    </Row>
                  </Col>
                  <Col span={12}>
                    <div style={{ marginTop: 32 }}>
                      <Row gutter={[8, 12]}>
                        <Col span={12}><a style={{ color: REDWOOD.info }}>Total Accounted Debit</a></Col>
                        <Col span={12}><Text>{formatNumber(currentJournal.accountedDebit)}</Text></Col>

                        <Col span={12}><a style={{ color: REDWOOD.info }}>Total Accounted Credit</a></Col>
                        <Col span={12}><Text>{formatNumber(currentJournal.accountedCredit)}</Text></Col>
                      </Row>
                    </div>
                  </Col>
                </Row>
              </div>
            ),
          },
          {
            key: 'sequencing',
            label: 'Sequencing',
            children: (
              <div style={{ padding: '16px 0' }}>
                <Row gutter={[48, 16]}>
                  <Col span={12}>
                    <Title level={5}><a style={{ color: REDWOOD.info }}>Accounting Sequence</a></Title>
                    <Row gutter={[8, 12]}>
                      <Col span={8}><Text type="secondary">Name</Text></Col>
                      <Col span={16}><Text>{currentJournal.accountingSequenceName || '-'}</Text></Col>

                      <Col span={8}><Text type="secondary">Number</Text></Col>
                      <Col span={16}><Text>{currentJournal.accountingSequenceNumber || '-'}</Text></Col>
                    </Row>
                  </Col>
                  <Col span={12}>
                    <Title level={5}><a style={{ color: REDWOOD.info }}>Reporting Sequence</a></Title>
                    <Row gutter={[8, 12]}>
                      <Col span={8}><Text type="secondary">Name</Text></Col>
                      <Col span={16}><Text>{currentJournal.reportingSequenceName || '-'}</Text></Col>

                      <Col span={8}><Text type="secondary">Number</Text></Col>
                      <Col span={16}><Text>{currentJournal.reportingSequenceNumber || '-'}</Text></Col>
                    </Row>
                  </Col>
                </Row>
              </div>
            ),
          },
          {
            key: 'reversal',
            label: 'Reversal',
            children: (
              <div style={{ padding: '16px 0' }}>
                <Row gutter={[48, 16]}>
                  <Col span={12}>
                    <Row gutter={[8, 12]}>
                      <Col span={8}><Text type="secondary">Reversal Period</Text></Col>
                      <Col span={16}>
                        <Select placeholder="Select period" style={{ width: 200 }} allowClear>
                          <Option value="Feb-25">Feb-25</Option>
                          <Option value="Mar-25">Mar-25</Option>
                        </Select>
                      </Col>

                      <Col span={8}><Text type="secondary">Reversal Method</Text></Col>
                      <Col span={16}>
                        <Select defaultValue="switchDrCr" style={{ width: 200 }}>
                          <Option value="switchDrCr">Switch DR or CR</Option>
                          <Option value="changeSign">Change Sign</Option>
                        </Select>
                      </Col>
                    </Row>
                  </Col>
                  <Col span={12}>
                    <Row gutter={[8, 12]}>
                      <Col span={8}><Text type="secondary">Reversal Status</Text></Col>
                      <Col span={16}><Text>{currentJournal.reversalStatus}</Text></Col>
                    </Row>
                  </Col>
                </Row>
              </div>
            ),
          },
        ]}
      />
    );
  };

  // Render collapsed journal summary
  const renderCollapsedJournal = () => {
    if (!currentJournal) return null;

    return (
      <div style={{ padding: 16 }}>
        <Row gutter={[24, 12]}>
          <Col span={12}>
            <Row gutter={[8, 8]}>
              <Col span={8}><Text type="secondary">Journal</Text></Col>
              <Col span={16}><Text strong>{currentJournal.journalName}</Text></Col>

              <Col span={8}><Text type="secondary">Description</Text></Col>
              <Col span={16}><Text>{currentJournal.journalDescription}</Text></Col>

              <Col span={8}><Text type="secondary"><span style={{ color: REDWOOD.primary }}>*</span> Ledger</Text></Col>
              <Col span={16}><Text>{currentJournal.ledgerName}</Text></Col>

              <Col span={8}><Text type="secondary"><span style={{ color: REDWOOD.primary }}>*</span> Legal Entity</Text></Col>
              <Col span={16}><Text>{currentJournal.legalEntityName}</Text></Col>

              <Col span={8}><Text type="secondary">Accounting Date</Text></Col>
              <Col span={16}><Text>{currentJournal.accountingDate}</Text></Col>

              <Col span={8}><Text type="secondary"><span style={{ color: REDWOOD.primary }}>*</span> Category</Text></Col>
              <Col span={16}><Text>{currentJournal.category}</Text></Col>
            </Row>
          </Col>
          <Col span={12}>
            <Row gutter={[8, 8]}>
              <Col span={10}><Text type="secondary">Currency</Text></Col>
              <Col span={14}><Text>{currentJournal.currencyCode} {getCurrencyName(currentJournal.currencyCode)}</Text></Col>

              <Col span={10}><Text type="secondary">Conversion Date</Text></Col>
              <Col span={14}><Text>{currentJournal.conversionDate}</Text></Col>

              <Col span={10}><Text type="secondary">Conversion Rate Type</Text></Col>
              <Col span={14}><Text>{currentJournal.conversionRateType}</Text></Col>

              <Col span={10}><Text type="secondary">Conversion Rate</Text></Col>
              <Col span={14}><Text>{currentJournal.conversionRate}</Text></Col>

              <Col span={10}><Text type="secondary">Inverse Rate</Text></Col>
              <Col span={14}><Text>{currentJournal.inverseConversionRate}</Text></Col>
            </Row>
          </Col>
        </Row>
      </div>
    );
  };

  if (loading) {
    return (
      <Layout style={{ minHeight: '100vh', background: REDWOOD.neutral100 }}>
        <Content style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Spin size="large" />
        </Content>
      </Layout>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Action Header */}
        <div style={{
          padding: '12px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Space>
            <Text type="secondary">Data Access Set: {currentJournal?.ledgerName}</Text>
          </Space>
          <Space>
            <Dropdown.Button
              type="primary"
              menu={{ items: saveMenu }}
              onClick={handleSave}
              loading={saving}
              style={{ background: REDWOOD.success }}
            >
              <SaveOutlined /> Save
            </Dropdown.Button>
            <Dropdown.Button
              menu={{ items: postMenu }}
              style={{ background: REDWOOD.info, color: '#fff' }}
            >
              Post
            </Dropdown.Button>
            <Button
              danger
              icon={<CloseOutlined />}
              onClick={handleCancel}
            >
              Cancel
            </Button>
          </Space>
        </div>

        {/* Page Title - Balances box hidden */}
        <div style={{
          padding: '16px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
        }}>
          <Space>
            <FileTextOutlined style={{ fontSize: 20 }} />
            <Title level={4} style={{ margin: 0 }}>
              {isBatchMode ? 'Edit Journal Batch' : 'Edit Journal'}
            </Title>
            {isBatchMode && (
              <Tag color={REDWOOD.info}>{allJournals.length} Journals</Tag>
            )}
          </Space>
        </div>

        <div style={{ padding: 24 }}>
          {/* Journal Batch Section */}
          <Card
            style={{ marginBottom: 16, borderRadius: 8 }}
            bodyStyle={{ padding: 0 }}
          >
            <div
              style={{
                padding: '12px 16px',
                background: REDWOOD.neutral100,
                borderBottom: `1px solid ${REDWOOD.neutral200}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
              }}
            >
              <Space>
                <Text strong style={{ fontSize: 14 }}>
                  Journal Batch: {currentJournal?.batchName}
                </Text>
                <a
                  onClick={() => setBatchExpanded(!batchExpanded)}
                  style={{ color: REDWOOD.info, fontSize: 12 }}
                >
                  {batchExpanded ? 'Show Less' : 'Show More'}
                </a>
              </Space>
              <Dropdown menu={{ items: batchActionsMenu }}>
                <Button size="small">
                  Batch Actions <DownOutlined />
                </Button>
              </Dropdown>
            </div>

            <div style={{ padding: 16 }}>
              <Row gutter={[24, 12]}>
                <Col span={12}>
                  <Row gutter={[8, 8]}>
                    <Col span={8}><Text type="secondary">Journal Batch</Text></Col>
                    <Col span={16}><Text>{currentJournal?.batchName}</Text></Col>

                    <Col span={8}><Text type="secondary">Description</Text></Col>
                    <Col span={16}><Text>{currentJournal?.batchDescription}</Text></Col>

                    <Col span={8}><Text type="secondary">Balance Type</Text></Col>
                    <Col span={16}><Text>{currentJournal?.balanceType}</Text></Col>

                    <Col span={8}><Text type="secondary"><span style={{ color: REDWOOD.primary }}>*</span> Accounting Period</Text></Col>
                    <Col span={16}><Text>{currentJournal?.periodName}</Text></Col>

                    <Col span={8}><Text type="secondary">Attachments</Text></Col>
                    <Col span={16}>
                      <Space>
                        <Text>None</Text>
                        <PaperClipOutlined style={{ color: REDWOOD.info }} />
                      </Space>
                    </Col>
                  </Row>
                </Col>
                <Col span={12}>
                  <Row gutter={[8, 8]}>
                    <Col span={8}><Text type="secondary">Source</Text></Col>
                    <Col span={16}><Text>{currentJournal?.source}</Text></Col>

                    <Col span={8}><Text type="secondary">Approval Status</Text></Col>
                    <Col span={16}><Text>{currentJournal?.approvalStatusMeaning}</Text></Col>

                    <Col span={8}><Text type="secondary">Batch Status</Text></Col>
                    <Col span={16}>
                      <Tag color={currentJournal?.statusMeaning === 'Posted' ? REDWOOD.success : REDWOOD.warning}>
                        {currentJournal?.statusMeaning}
                      </Tag>
                    </Col>

                    {batchExpanded && (
                      <>
                        <Col span={8}><Text type="secondary">Completion Status</Text></Col>
                        <Col span={16}><Text>{currentJournal?.completionStatus}</Text></Col>
                      </>
                    )}
                  </Row>
                </Col>
              </Row>
            </div>
          </Card>

          {/* Journal Tabs (for batch mode) */}
          {isBatchMode && allJournals.length > 1 && (
            <Card
              style={{ marginBottom: 16, borderRadius: 8 }}
              bodyStyle={{ padding: 0 }}
            >
              <Tabs
                activeKey={activeJournalKey}
                onChange={setActiveJournalKey}
                type="card"
                style={{ marginBottom: 0 }}
                items={journalTabs}
                tabBarStyle={{
                  margin: 0,
                  padding: '8px 16px 0',
                  background: REDWOOD.neutral100,
                  borderBottom: `1px solid ${REDWOOD.neutral200}`,
                }}
              />
            </Card>
          )}

          {/* Journal Section */}
          <Card
            style={{ marginBottom: 16, borderRadius: 8 }}
            bodyStyle={{ padding: 0 }}
          >
            <div
              style={{
                padding: '12px 16px',
                background: REDWOOD.neutral100,
                borderBottom: `1px solid ${REDWOOD.neutral200}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Space>
                <Text strong style={{ fontSize: 14 }}>Journal</Text>
                <a
                  onClick={() => setJournalExpanded(!journalExpanded)}
                  style={{ color: REDWOOD.info, fontSize: 12 }}
                >
                  {journalExpanded ? 'Show Less' : 'Show More'}
                </a>
              </Space>
              <Space>
                <Button
                  size="small"
                  icon={<PrinterOutlined />}
                  onClick={handlePrintJournal}
                >
                  Print
                </Button>
                {!isBatchMode && (
                  <>
                    <Button size="small" icon={<LeftOutlined />} disabled />
                    <Select
                      value={currentJournal?.journalName}
                      style={{ width: 250 }}
                      size="small"
                    >
                      <Option value={currentJournal?.journalName}>{currentJournal?.journalName}</Option>
                    </Select>
                    <Button size="small" icon={<RightOutlined />} disabled />
                  </>
                )}
                <Button size="small" icon={<PlusOutlined />} />
                <Button size="small" icon={<DeleteOutlined />} />
                <Dropdown menu={{ items: journalActionsMenu }}>
                  <Button size="small">
                    Journal Actions <DownOutlined />
                  </Button>
                </Dropdown>
              </Space>
            </div>

            {journalExpanded ? renderDetailTabs() : renderCollapsedJournal()}
          </Card>

          {/* Journal Lines Section */}
          <Card
            style={{ borderRadius: 8 }}
            bodyStyle={{ padding: 0 }}
          >
            <div
              style={{
                padding: '12px 16px',
                background: REDWOOD.neutral100,
                borderBottom: `1px solid ${REDWOOD.neutral200}`,
              }}
            >
              <Text strong style={{ fontSize: 14 }}>Journal Lines</Text>
            </div>

            {/* Lines Toolbar */}
            <div style={{
              padding: '8px 16px',
              borderBottom: `1px solid ${REDWOOD.neutral200}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <Space>
                <Dropdown menu={{ items: [{ key: 'add', label: 'Add Row' }] }}>
                  <Button size="small">Actions <DownOutlined /></Button>
                </Dropdown>
                <Dropdown menu={{ items: [{ key: 'columns', label: 'Columns' }] }}>
                  <Button size="small">View <DownOutlined /></Button>
                </Dropdown>
                <Dropdown menu={{ items: [{ key: 'wrap', label: 'Wrap' }] }}>
                  <Button size="small">Format <DownOutlined /></Button>
                </Dropdown>
                <Tooltip title="Check in Fusion">
                  <Button
                    size="small"
                    icon={<CloudSyncOutlined />}
                    onClick={handleCheckInFusion}
                    style={{ color: REDWOOD.info }}
                  >
                    Check in Fusion
                  </Button>
                </Tooltip>
                <Tooltip title="Add Row">
                  <Button size="small" icon={<PlusOutlined />} />
                </Tooltip>
                <Tooltip title="Delete Row">
                  <Button size="small" icon={<DeleteOutlined />} disabled={selectedLineKeys.length === 0} />
                </Tooltip>
                <Button size="small">Detach</Button>
                <Button size="small">Wrap</Button>
              </Space>
            </div>

            {/* Lines Table */}
            <Table
              columns={lineColumns}
              dataSource={currentJournal?.lines || []}
              rowSelection={{
                selectedRowKeys: selectedLineKeys,
                onChange: setSelectedLineKeys,
              }}
              pagination={false}
              scroll={{ x: 1400 }}
              size="small"
              bordered
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row style={{ background: REDWOOD.neutral100 }}>
                    <Table.Summary.Cell index={0} />
                    <Table.Summary.Cell index={1}><Text strong>Total</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={2} />
                    <Table.Summary.Cell index={3} />
                    <Table.Summary.Cell index={4} align="right">
                      <Text strong>{formatNumber(lineTotals.enteredDr)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">
                      <Text strong>{formatNumber(lineTotals.enteredCr)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} />
                    <Table.Summary.Cell index={7} align="right">
                      <Text strong>{formatNumber(lineTotals.accountedDr)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={8} align="right">
                      <Text strong>{formatNumber(lineTotals.accountedCr)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={9} />
                    <Table.Summary.Cell index={10} />
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
          </Card>
        </div>

        {/* Fusion Comparison Modal */}
        <Modal
          title={
            <Space>
              <CloudSyncOutlined style={{ color: REDWOOD.info }} />
              <span>Check in Oracle Fusion</span>
              <Tag color={REDWOOD.info}>Batch ID: {currentJournal?.jeBatchId}</Tag>
            </Space>
          }
          open={fusionModalVisible}
          onCancel={() => setFusionModalVisible(false)}
          width={1200}
          footer={[
            <Button key="close" onClick={() => setFusionModalVisible(false)}>
              Close
            </Button>
          ]}
        >
          <Tabs
            activeKey={activeFusionTab}
            onChange={setActiveFusionTab}
            items={[
              {
                key: 'comparison',
                label: 'Comparison',
                children: fusionLoading ? (
                  <div style={{ textAlign: 'center', padding: 48 }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 16 }}>
                      <Text type="secondary">Fetching data from Oracle Fusion...</Text>
                    </div>
                  </div>
                ) : fusionError ? (
                  <Alert
                    type="error"
                    message="Error Connecting to Fusion"
                    description={fusionError}
                    showIcon
                  />
                ) : fusionData ? (
                  <div>
                    {/* Header tabs if multiple */}
                    {fusionData.headers.length > 1 && (
                      <Tabs
                        activeKey={activeFusionHeaderKey}
                        onChange={setActiveFusionHeaderKey}
                        type="card"
                        style={{ marginBottom: 16 }}
                        items={fusionData.headers.map((h, i) => ({
                          key: String(i),
                          label: h.JournalName || `Header ${i + 1}`,
                        }))}
                      />
                    )}

                    {/* Comparison View */}
                    {currentFusionHeader && (
                      <>
                        {/* Header Comparison */}
                        <Card
                          size="small"
                          title="Header Comparison"
                          style={{ marginBottom: 16, background: REDWOOD.neutral100 }}
                        >
                          <Row gutter={8} style={{ marginBottom: 8, fontWeight: 'bold' }}>
                            <Col span={8}><Text strong>Field</Text></Col>
                            <Col span={7}><Text strong>Local (Synced)</Text></Col>
                            <Col span={7}><Text strong>Fusion (Source)</Text></Col>
                            <Col span={2}><Text strong>Match</Text></Col>
                          </Row>
                          <Divider style={{ margin: '8px 0' }} />
                          {compareValue(currentJournal?.journalName, currentFusionHeader.JournalName, 'Journal Name')}
                          {compareValue(currentJournal?.journalDescription, currentFusionHeader.JournalDescription, 'Description')}
                          {compareValue(currentJournal?.ledgerName, currentFusionHeader.LedgerName, 'Ledger')}
                          {compareValue(currentJournal?.periodName, currentFusionHeader.PeriodName, 'Period')}
                          {compareValue(currentJournal?.currencyCode, currentFusionHeader.CurrencyCode, 'Currency')}
                          {compareValue(currentJournal?.category, currentFusionHeader.UserJeCategoryName, 'Category')}
                          {compareValue(lineTotals.enteredDr, currentFusionHeader.RunningTotalDr, 'Entered Debit')}
                          {compareValue(lineTotals.enteredCr, currentFusionHeader.RunningTotalCr, 'Entered Credit')}
                          {compareValue(lineTotals.accountedDr, currentFusionHeader.RunningTotalAccountedDr, 'Accounted Debit')}
                          {compareValue(lineTotals.accountedCr, currentFusionHeader.RunningTotalAccountedCr, 'Accounted Credit')}
                        </Card>

                        {/* Lines from Fusion */}
                        <Card
                          size="small"
                          title={
                            <Space>
                              <span>Journal Lines from Fusion</span>
                              <Tag color={REDWOOD.info}>{currentFusionHeader.lines?.length || 0} lines</Tag>
                            </Space>
                          }
                          style={{ background: REDWOOD.neutral100 }}
                        >
                          <Table
                            columns={fusionLineColumns}
                            dataSource={(currentFusionHeader.lines || []).map((line, idx) => ({
                              ...line,
                              key: String(idx),
                            }))}
                            size="small"
                            pagination={false}
                            scroll={{ x: 1000 }}
                            bordered
                            summary={(pageData) => {
                              const totals = pageData.reduce(
                                (acc, line) => ({
                                  enteredDr: acc.enteredDr + (line.EnteredDr || 0),
                                  enteredCr: acc.enteredCr + (line.EnteredCr || 0),
                                  accountedDr: acc.accountedDr + (line.AccountedDr || 0),
                                  accountedCr: acc.accountedCr + (line.AccountedCr || 0),
                                }),
                                { enteredDr: 0, enteredCr: 0, accountedDr: 0, accountedCr: 0 }
                              );
                              return (
                                <Table.Summary fixed>
                                  <Table.Summary.Row style={{ background: REDWOOD.neutral200 }}>
                                    <Table.Summary.Cell index={0}><Text strong>Total</Text></Table.Summary.Cell>
                                    <Table.Summary.Cell index={1} />
                                    <Table.Summary.Cell index={2} align="right">
                                      <Text strong>{formatNumber(totals.enteredDr)}</Text>
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={3} align="right">
                                      <Text strong>{formatNumber(totals.enteredCr)}</Text>
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={4} align="right">
                                      <Text strong>{formatNumber(totals.accountedDr)}</Text>
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={5} align="right">
                                      <Text strong>{formatNumber(totals.accountedCr)}</Text>
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={6} />
                                  </Table.Summary.Row>
                                </Table.Summary>
                              );
                            }}
                          />
                        </Card>
                      </>
                    )}
                  </div>
                ) : null,
              },
              {
                key: 'log',
                label: `Log (${fusionApiLogs.length})`,
                children: (
                  <div style={{ maxHeight: 500, overflow: 'auto' }}>
                    {fusionApiLogs.length === 0 ? (
                      <Alert
                        type="info"
                        message="No API calls logged yet"
                        description="Click 'Check in Fusion' to see the API URLs being called"
                      />
                    ) : (
                      fusionApiLogs.map((log, idx) => (
                        <Card
                          key={idx}
                          size="small"
                          style={{
                            marginBottom: 12,
                            background: log.status === 'SUCCESS' ? '#f6ffed' : log.status === 'ERROR' ? '#fff2f0' : REDWOOD.neutral100,
                            borderColor: log.status === 'SUCCESS' ? REDWOOD.success : log.status === 'ERROR' ? REDWOOD.primary : REDWOOD.neutral200,
                          }}
                        >
                          <Row gutter={[8, 8]}>
                            <Col span={24}>
                              <Space>
                                <Tag color={log.status === 'SUCCESS' ? 'success' : log.status === 'ERROR' ? 'error' : 'warning'}>
                                  {log.status}
                                </Tag>
                                <Text type="secondary">{log.timestamp}</Text>
                              </Space>
                            </Col>
                            <Col span={24}>
                              <Text strong>Oracle Fusion URL:</Text>
                              <div style={{
                                background: '#f5f5f5',
                                padding: 8,
                                borderRadius: 4,
                                marginTop: 4,
                                wordBreak: 'break-all',
                                fontFamily: 'monospace',
                                fontSize: 12,
                              }}>
                                {log.url}
                              </div>
                            </Col>
                            <Col span={24}>
                              <Text strong>Proxy URL:</Text>
                              <div style={{
                                background: '#e6f7ff',
                                padding: 8,
                                borderRadius: 4,
                                marginTop: 4,
                                wordBreak: 'break-all',
                                fontFamily: 'monospace',
                                fontSize: 12,
                              }}>
                                {log.proxyUrl}
                              </div>
                            </Col>
                            {log.response && (
                              <Col span={24}>
                                <Text strong>Response:</Text>
                                <div style={{
                                  background: '#fafafa',
                                  padding: 8,
                                  borderRadius: 4,
                                  marginTop: 4,
                                  fontFamily: 'monospace',
                                  fontSize: 12,
                                }}>
                                  {JSON.stringify(log.response, null, 2)}
                                </div>
                              </Col>
                            )}
                          </Row>
                        </Card>
                      ))
                    )}
                  </div>
                ),
              },
            ]}
          />
        </Modal>
      </Content>
    </Layout>
  );
};

export default EditJournal;
