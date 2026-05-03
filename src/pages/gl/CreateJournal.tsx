import React, { useState, useEffect, useCallback } from 'react';
import { Resizable } from 'react-resizable';
import 'react-resizable/css/styles.css';
import {
  Layout,
  Card,
  Form,
  Input,
  Select,
  Button,
  Space,
  Typography,
  Table,
  Row,
  Col,
  Tooltip,
  Dropdown,
  Tabs,
  DatePicker,
  InputNumber,
  message,
  Popover,
  Modal,
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
  QuestionCircleOutlined,
  TableOutlined,
  ColumnWidthOutlined,
  SplitCellsOutlined,
  SearchOutlined,
  InfoCircleOutlined,
  FilePdfOutlined,
  ApiOutlined,
  CheckSquareOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
dayjs.extend(customParseFormat);
import type { Dayjs } from 'dayjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import AccountSelector, { validateAccountCode } from '../../components/AccountSelector';
import { APEX_DB_CONFIG } from '../../config/api.config';

const { Content } = Layout;
const { Title, Text } = Typography;
const { TextArea } = Input;
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
};

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

// Segment detail for account
interface SegmentDetail {
  value: string;
  description: string;
  name: string; // User-friendly name like "Company", "Cost Center"
}

// Journal Line interface
interface JournalLine {
  key: string;
  lineNum: number;
  account: string;
  accountDescription: string;
  segmentDetails: Record<string, SegmentDetail>;
  currency: string;
  enteredDr: number | null;
  enteredCr: number | null;
  conversionDate: string;
  accountedDr: number | null;
  accountedCr: number | null;
  description: string;
}

// Batch data interface
interface BatchData {
  batchName: string;
  description: string;
  balanceType: string;
  accountingPeriod: string;
}

// Journal data interface
interface JournalData {
  journalName: string;
  description: string;
  ledger: string;
  legalEntity: string;
  accountingDate: string;
  category: string;
  currency: string;
  conversionDate: string;
  conversionRateType: string;
  conversionRate: number;
  inverseRate: number;
  reference: string;
  referenceDate: string;
  company: string;
  regionalInfo: string;
  // Control Total
  controlTotal: number | null;
  // Sequencing
  accountingSeqName: string;
  accountingSeqNumber: string;
  reportingSeqName: string;
  reportingSeqNumber: string;
  // Reversal
  reversalPeriod: string;
  reversalMethod: string;
}

// Journal Entry - combines journal data with its lines
interface JournalEntry {
  id: string;
  data: JournalData;
  lines: JournalLine[];
}

// Format number
const formatNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '';
  return value.toLocaleString('en-US', { minimumFractionDigits: 2 });
};

// Generate batch name with timestamp
const generateBatchName = (): string => {
  const now = dayjs();
  return `JB-${now.format('YYYYMMDD-HHmmss')}`;
};

// Period to last date mapping
const periodEndDates: Record<string, string> = {
  'Jan-26': '31-Jan-2026',
  'Feb-26': '28-Feb-2026',
  'Mar-26': '31-Mar-2026',
  'Apr-26': '30-Apr-2026',
  'May-26': '31-May-2026',
  'Jun-26': '30-Jun-2026',
  'Jul-26': '31-Jul-2026',
  'Aug-26': '31-Aug-2026',
  'Sep-26': '30-Sep-2026',
  'Oct-26': '31-Oct-2026',
  'Nov-26': '30-Nov-2026',
  'Dec-26': '31-Dec-2026',
};

// Get last date of period
const getPeriodEndDate = (period: string): string => {
  return periodEndDates[period] || dayjs().endOf('month').format('D-MMM-YYYY');
};

// Safely parse a date string in multiple formats — returns null if invalid
const parseDateSafe = (str: string | null | undefined): Dayjs | null => {
  if (!str) return null;
  for (const fmt of ['YYYY-MM-DD', 'D-MMM-YYYY', 'DD-MMM-YYYY', 'DD-MMM-YY', 'YYYY-MM-DDTHH:mm:ss']) {
    const d = dayjs(str, fmt, true);
    if (d.isValid()) return d;
  }
  // Last resort — let dayjs try on its own
  const d = dayjs(str);
  return d.isValid() ? d : null;
};

// Parse Oracle API end_date which may be ISO or Oracle DD-MON-YY format
const parseOracleDate = (str: string | null | undefined): Dayjs | null => parseDateSafe(str);

// Conversion rates (mock data - in real app, fetch from API)
const conversionRates: Record<string, Record<string, number>> = {
  'User': { 'AED': 1, 'USD': 3.67, 'INR': 0.044 },
  'Spot': { 'AED': 1, 'USD': 3.68, 'INR': 0.0438 },
  'Corporate': { 'AED': 1, 'USD': 3.65, 'INR': 0.045 },
};

// Create default journal data
const createDefaultJournalData = (): JournalData => ({
  journalName: '',
  description: '',
  ledger: 'BUIMERC LEDGER',
  legalEntity: '',
  accountingDate: dayjs().format('D-MMM-YYYY'),
  category: '',
  currency: 'AED',
  conversionDate: dayjs().format('D-MMM-YYYY'),
  conversionRateType: 'User',
  conversionRate: 1,
  inverseRate: 1,
  reference: '',
  referenceDate: '',
  company: '',
  regionalInfo: '',
  controlTotal: null,
  accountingSeqName: '',
  accountingSeqNumber: '',
  reportingSeqName: '',
  reportingSeqNumber: '',
  reversalPeriod: '',
  reversalMethod: 'Switch DR or CR',
});

// Create default journal lines
const createDefaultLines = (currency: string = 'AED'): JournalLine[] => [
  {
    key: '1',
    lineNum: 1,
    account: '',
    accountDescription: '',
    segmentDetails: {},
    currency: `${currency} UAE Dirham`,
    enteredDr: null,
    enteredCr: null,
    conversionDate: dayjs().format('D-MMM-YYYY'),
    accountedDr: null,
    accountedCr: null,
    description: '',
  },
  {
    key: '2',
    lineNum: 2,
    account: '',
    accountDescription: '',
    segmentDetails: {},
    currency: `${currency} UAE Dirham`,
    enteredDr: null,
    enteredCr: null,
    conversionDate: dayjs().format('D-MMM-YYYY'),
    accountedDr: null,
    accountedCr: null,
    description: '',
  },
];

// Create a new journal entry
const createNewJournal = (id: string): JournalEntry => ({
  id,
  data: createDefaultJournalData(),
  lines: createDefaultLines(),
});

interface CreateJournalProps {
  embeddedMode?: boolean;   // true = rendered inside ManageJournals tab
  onSaved?: () => void;     // called after save/post/cancel so parent can close the tab
}

// Resizable column header
const ResizableTitle = (props: any) => {
  const { onResize, width, ...restProps } = props;
  if (!width) return <th {...restProps} />;
  return (
    <Resizable
      width={width}
      height={0}
      handle={<span className="react-resizable-handle" onClick={e => e.stopPropagation()} />}
      onResize={onResize}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th {...restProps} />
    </Resizable>
  );
};

const CreateJournal: React.FC<CreateJournalProps> = ({ embeddedMode = false, onSaved }) => {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  // Ledger and Period state
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [selectedLedger, setSelectedLedger] = useState<Ledger | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loadingLedgers, setLoadingLedgers] = useState(false);
  const [loadingPeriods, setLoadingPeriods] = useState(false);

  // Collapsible states
  const [batchExpanded, setBatchExpanded] = useState(true);
  const [journalExpanded, setJournalExpanded] = useState(true);

  // Active tabs
  const [activeBatchTab, setActiveBatchTab] = useState('batch');
  const [activeJournalTab, setActiveJournalTab] = useState('journal');

  // Selected line keys
  const [selectedLineKeys, setSelectedLineKeys] = useState<React.Key[]>([]);

  // Account selector state
  const [accountSelectorVisible, setAccountSelectorVisible] = useState(false);
  const [editingLineKey, setEditingLineKey] = useState<string | null>(null);
  const [accountSelectorInitialValue, setAccountSelectorInitialValue] = useState<string | undefined>(undefined);
  const [validatingAccount, setValidatingAccount] = useState<string | null>(null); // Line key being validated

  // Detached mode for journal lines (full page)
  const [isDetached, setIsDetached] = useState(false);

  // PDF Preview state
  const [pdfPreviewVisible, setPdfPreviewVisible] = useState(false);
  const [pdfDataUrl, setPdfDataUrl] = useState<string>('');
  const [pdfFileName, setPdfFileName] = useState<string>('');

  // Search filter for journal lines
  const [lineSearchText, setLineSearchText] = useState('');

  // JSON Preview modal state
  const [jsonPreviewVisible, setJsonPreviewVisible] = useState(false);
  const [jsonPayload, setJsonPayload] = useState<any>(null);
  const [postingJournal, setPostingJournal] = useState(false);
  const [saveResponse, setSaveResponse] = useState<any>(null);

  // Initialize batch name with timestamp
  const [batchData, setBatchData] = useState<BatchData>(() => {
    const batchName = generateBatchName();
    return {
      batchName,
      description: '',
      balanceType: 'Actual',
      accountingPeriod: 'Mar-26',
    };
  });

  // Multiple journals state
  const [journals, setJournals] = useState<JournalEntry[]>([createNewJournal('1')]);
  const [currentJournalIndex, setCurrentJournalIndex] = useState(0);

  // Current journal data (derived from journals array)
  const currentJournal = journals[currentJournalIndex];
  const journalData = currentJournal.data;
  const lines = currentJournal.lines;

  // Update journal data for current journal
  const setJournalData = (newData: JournalData | ((prev: JournalData) => JournalData)) => {
    setJournals(prevJournals => {
      const updated = [...prevJournals];
      const data = typeof newData === 'function' ? newData(updated[currentJournalIndex].data) : newData;
      updated[currentJournalIndex] = { ...updated[currentJournalIndex], data };
      return updated;
    });
  };

  // Update lines for current journal
  const setLines = (newLines: JournalLine[] | ((prev: JournalLine[]) => JournalLine[])) => {
    setJournals(prevJournals => {
      const updated = [...prevJournals];
      const lines = typeof newLines === 'function' ? newLines(updated[currentJournalIndex].lines) : newLines;
      updated[currentJournalIndex] = { ...updated[currentJournalIndex], lines };
      return updated;
    });
  };

  // Set journal name from batch name on initial load
  useEffect(() => {
    if (batchData.batchName && !journalData.journalName) {
      setJournalData(prev => ({ ...prev, journalName: batchData.batchName }));
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
          // Auto-select first ledger and store it
          const firstLedger = data.items[0];
          setSelectedLedger(firstLedger);
          // Update journal data with selected ledger
          setJournalData(prev => ({ ...prev, ledger: firstLedger.ledger_name }));
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
        const params = new URLSearchParams();
        params.append('P_APPLICATION_NAME', 'General Ledger');
        params.append('P_LEDGER_NAME', selectedLedger.ledger_name);
        const response = await fetch(
          `${APEX_DB_CONFIG.baseUrl}/periodsstatus/create?${params.toString()}`
        );
        const data = await response.json();
        if (data.items && data.items.length > 0) {
          // Sort periods by year desc, then period_number desc to show most recent first
          const sortedPeriods = data.items.sort((a: Period, b: Period) => {
            if (b.period_year !== a.period_year) return b.period_year - a.period_year;
            return b.period_number - a.period_number;
          });
          setPeriods(sortedPeriods);
          // Auto-select current open period or first available
          // Only allow Open or Future Entry periods; auto-select the current Open one
          const currentPeriod = sortedPeriods.find((p: Period) => p.status === 'Open') || sortedPeriods.find((p: Period) => p.status === 'Future Entry') || sortedPeriods[0];
          if (currentPeriod) {
            setBatchData(prev => ({ ...prev, accountingPeriod: currentPeriod.period_name_id }));
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

  // Handle ledger selection
  const handleLedgerChange = (ledgerId: number) => {
    const ledger = ledgers.find(l => l.ledger_id === ledgerId);
    if (ledger) {
      setSelectedLedger(ledger);
      // Update journal data with selected ledger
      setJournalData(prev => ({ ...prev, ledger: ledger.ledger_name }));
    }
  };

  // Update accounting date when period changes
  useEffect(() => {
    // Try to get end date from fetched periods, fallback to hardcoded values
    const selectedPeriod = periods.find(p => p.period_name_id === batchData.accountingPeriod);
    let periodEndDate: string;
    if (selectedPeriod?.end_date) {
      const parsed = parseOracleDate(selectedPeriod.end_date);
      periodEndDate = parsed ? parsed.format('D-MMM-YYYY') : getPeriodEndDate(batchData.accountingPeriod);
    } else {
      periodEndDate = getPeriodEndDate(batchData.accountingPeriod);
    }
    setJournalData(prev => ({
      ...prev,
      accountingDate: periodEndDate,
      conversionDate: periodEndDate,
    }));
  }, [batchData.accountingPeriod, periods]);

  // Calculate accounted amounts based on conversion rate
  const calculateAccountedAmounts = (enteredAmount: number | null, rateType: string, currency: string): number | null => {
    if (enteredAmount === null) return null;
    const rate = conversionRates[rateType]?.[currency] || 1;
    return Math.round(enteredAmount * rate * 100) / 100;
  };

  // Filter lines based on search
  const filteredLines = lineSearchText
    ? lines.filter(line =>
        line.account.toLowerCase().includes(lineSearchText.toLowerCase()) ||
        line.accountDescription.toLowerCase().includes(lineSearchText.toLowerCase()) ||
        line.description.toLowerCase().includes(lineSearchText.toLowerCase())
      )
    : lines;

  // Add new journal
  const handleAddJournal = () => {
    const newId = String(journals.length + 1);
    const newJournal = createNewJournal(newId);
    setJournals([...journals, newJournal]);
    setCurrentJournalIndex(journals.length); // Navigate to the new journal
    message.success(`Journal ${journals.length + 1} created`);
  };

  // Delete current journal
  const handleDeleteJournal = () => {
    if (journals.length === 1) {
      message.warning('Cannot delete the only journal in the batch');
      return;
    }
    const newJournals = journals.filter((_, idx) => idx !== currentJournalIndex);
    setJournals(newJournals);
    // Adjust current index if needed
    if (currentJournalIndex >= newJournals.length) {
      setCurrentJournalIndex(newJournals.length - 1);
    }
    message.success('Journal deleted');
  };

  // Navigate to previous journal
  const handlePrevJournal = () => {
    if (currentJournalIndex > 0) {
      setCurrentJournalIndex(currentJournalIndex - 1);
      setSelectedLineKeys([]); // Reset selected lines
    }
  };

  // Navigate to next journal
  const handleNextJournal = () => {
    if (currentJournalIndex < journals.length - 1) {
      setCurrentJournalIndex(currentJournalIndex + 1);
      setSelectedLineKeys([]); // Reset selected lines
    }
  };

  // Reset to a fresh blank journal (after save/post) — stays on same page
  const handleResetForNewJournal = () => {
    const freshJournal = createNewJournal('1');
    setJournals([freshJournal]);
    setCurrentJournalIndex(0);
    setBatchData({
      batchName: generateBatchName(),
      description: '',
      balanceType: 'Actual',
      accountingPeriod: batchData.accountingPeriod,
    });
  };

  // Open account selector for a line
  const openAccountSelector = (lineKey: string, initialValue?: string) => {
    setEditingLineKey(lineKey);
    setAccountSelectorInitialValue(initialValue);
    setAccountSelectorVisible(true);
  };

  // Validate account code on blur
  const handleAccountBlur = async (lineKey: string, accountCode: string) => {
    // Skip validation if empty or already validating
    if (!accountCode || accountCode.trim() === '' || validatingAccount) {
      return;
    }

    // Skip if no dashes (not a combination code)
    if (!accountCode.includes('-')) {
      return;
    }

    setValidatingAccount(lineKey);
    console.log('Validating account code:', accountCode);

    try {
      const result = await validateAccountCode(accountCode);
      console.log('Validation result:', result);

      if (!result.segmentsLoaded) {
        message.info('Could not load segment data for validation. Please verify the account code.');
        return;
      }

      if (!result.isValid) {
        // Show message about invalid segments
        message.warning(`Invalid segment value(s): ${result.invalidSegments.join(', ')}. Please correct using the account selector.`);

        // Update line with validated code (valid parts kept, invalid parts blanked)
        setLines(prevLines => prevLines.map(line =>
          line.key === lineKey
            ? { ...line, account: result.validatedCode, accountDescription: '', segmentDetails: {} }
            : line
        ));

        // Open account selector with the validated code as initial value
        openAccountSelector(lineKey, result.validatedCode);
      } else {
        // All segments are valid - populate the line with segment details
        // Find the Account segment (contains "ACCOUNT" in the key or name)
        const accountSegment = Object.entries(result.segmentDetails).find(([key, detail]) =>
          key.toUpperCase().includes('ACCOUNT') ||
          (detail.name && detail.name.toUpperCase().includes('ACCOUNT'))
        );

        // Build account description from Account segment only (e.g., "1000000 - Assets")
        const accountDescription = accountSegment
          ? `${accountSegment[1].value} - ${accountSegment[1].description}`
          : '';

        // Update the line with segment details and description
        setLines(prevLines => prevLines.map(line =>
          line.key === lineKey
            ? { ...line, accountDescription, segmentDetails: result.segmentDetails }
            : line
        ));

        message.success('Account code validated successfully');
      }
    } catch (error) {
      console.error('Error validating account code:', error);
      message.error('Failed to validate account code');
    } finally {
      setValidatingAccount(null);
    }
  };

  // Handle account selection
  const handleAccountSelect = (accountCode: string, segments: Record<string, { value: string; description: string; name?: string }>) => {
    if (editingLineKey) {
      // Find the Account segment (contains "ACCOUNT" in the key or name)
      const accountSegment = Object.entries(segments).find(([key, detail]) =>
        key.toUpperCase().includes('ACCOUNT') ||
        (detail.name && detail.name.toUpperCase().includes('ACCOUNT'))
      );

      // Build account description from Account segment only (e.g., "1000000 - Assets")
      const accountDescription = accountSegment
        ? `${accountSegment[1].value} - ${accountSegment[1].description}`
        : '';

      // Update the line with account code, description, and segment details
      setLines(prevLines => prevLines.map(line =>
        line.key === editingLineKey
          ? { ...line, account: accountCode, accountDescription, segmentDetails: segments as Record<string, SegmentDetail> }
          : line
      ));
    }
    setAccountSelectorVisible(false);
    setEditingLineKey(null);
  };

  // Calculate totals
  const lineTotals = lines.reduce(
    (acc, line) => ({
      enteredDr: acc.enteredDr + (line.enteredDr || 0),
      enteredCr: acc.enteredCr + (line.enteredCr || 0),
      accountedDr: acc.accountedDr + (line.accountedDr || 0),
      accountedCr: acc.accountedCr + (line.accountedCr || 0),
    }),
    { enteredDr: 0, enteredCr: 0, accountedDr: 0, accountedCr: 0 }
  );

  // Add new line
  const handleAddLine = () => {
    const newLineNum = lines.length + 1;
    setLines([
      ...lines,
      {
        key: String(newLineNum),
        lineNum: newLineNum,
        account: '',
        accountDescription: '',
        segmentDetails: {},
        currency: `${journalData.currency} UAE Dirham`,
        enteredDr: null,
        enteredCr: null,
        conversionDate: journalData.conversionDate,
        accountedDr: null,
        accountedCr: null,
        description: '',
      },
    ]);
  };

  // Delete selected lines
  const handleDeleteLines = () => {
    const newLines = lines.filter(line => !selectedLineKeys.includes(line.key));
    // Renumber lines
    const renumberedLines = newLines.map((line, idx) => ({
      ...line,
      lineNum: idx + 1,
      key: String(idx + 1),
    }));
    setLines(renumberedLines);
    setSelectedLineKeys([]);
  };

  // Update line with auto-calculation of accounted amounts
  const updateLine = (key: string, field: keyof JournalLine, value: any) => {
    setLines(prevLines => prevLines.map(line => {
      if (line.key !== key) return line;

      const updatedLine = { ...line, [field]: value };

      // Auto-calculate accounted amounts when entered amounts change
      if (field === 'enteredDr' || field === 'enteredCr') {
        const rate = journalData.conversionRate || 1;
        if (field === 'enteredDr') {
          updatedLine.accountedDr = value !== null ? Math.round(value * rate * 100) / 100 : null;
        } else {
          updatedLine.accountedCr = value !== null ? Math.round(value * rate * 100) / 100 : null;
        }
      }

      return updatedLine;
    }));
  };

  // Recalculate all accounted amounts when conversion rate changes
  useEffect(() => {
    const rate = journalData.conversionRate || 1;
    setLines(prevLines => prevLines.map(line => ({
      ...line,
      accountedDr: line.enteredDr !== null ? Math.round(line.enteredDr * rate * 100) / 100 : null,
      accountedCr: line.enteredCr !== null ? Math.round(line.enteredCr * rate * 100) / 100 : null,
      conversionDate: journalData.conversionDate, // Sync conversion date from journal
    })));
  }, [journalData.conversionRate, journalData.conversionDate]);

  // Save handler
  // Check if debit and credit are balanced
  const isBalanced = lineTotals.enteredDr === lineTotals.enteredCr;

  // Generate PDF Report
  const handlePrintPDF = () => {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Colors matching Redwood palette
    const primaryColor: [number, number, number] = [199, 70, 52]; // REDWOOD.primary
    const headerBg: [number, number, number] = [247, 247, 247]; // REDWOOD.neutral100
    const textColor: [number, number, number] = [26, 26, 26]; // REDWOOD.neutral900

    let yPos = 15;

    // Title
    doc.setFontSize(18);
    doc.setTextColor(...primaryColor);
    doc.text('Journal Report', pageWidth / 2, yPos, { align: 'center' });
    yPos += 8;

    // Subtitle with date
    doc.setFontSize(10);
    doc.setTextColor(107, 107, 107); // neutral600
    doc.text(`Generated on: ${dayjs().format('DD-MMM-YYYY HH:mm:ss')}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 10;

    // Horizontal line
    doc.setDrawColor(...primaryColor);
    doc.setLineWidth(0.5);
    doc.line(15, yPos, pageWidth - 15, yPos);
    yPos += 8;

    // Journal Batch Section
    doc.setFontSize(12);
    doc.setTextColor(...textColor);
    doc.setFont('helvetica', 'bold');
    doc.text('Journal Batch Information', 15, yPos);
    yPos += 6;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const batchInfo = [
      ['Batch Name:', batchData.batchName, 'Balance Type:', batchData.balanceType],
      ['Accounting Period:', batchData.accountingPeriod, 'Status:', 'Unposted'],
      ['Description:', batchData.description || '-', '', ''],
    ];

    batchInfo.forEach(row => {
      doc.setFont('helvetica', 'bold');
      doc.text(row[0], 15, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(row[1], 50, yPos);
      if (row[2]) {
        doc.setFont('helvetica', 'bold');
        doc.text(row[2], 140, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(row[3], 175, yPos);
      }
      yPos += 5;
    });
    yPos += 5;

    // Journal Section
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Journal: ${journalData.journalName || 'Untitled'}`, 15, yPos);
    yPos += 6;

    doc.setFontSize(9);
    const journalInfo = [
      ['Ledger:', journalData.ledger, 'Legal Entity:', journalData.legalEntity || '-'],
      ['Accounting Date:', journalData.accountingDate, 'Category:', journalData.category || '-'],
      ['Currency:', journalData.currency, 'Conversion Rate:', String(journalData.conversionRate)],
      ['Conversion Type:', journalData.conversionRateType, 'Conversion Date:', journalData.conversionDate],
    ];

    journalInfo.forEach(row => {
      doc.setFont('helvetica', 'bold');
      doc.text(row[0], 15, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(row[1], 50, yPos);
      doc.setFont('helvetica', 'bold');
      doc.text(row[2], 140, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(row[3], 175, yPos);
      yPos += 5;
    });
    yPos += 8;

    // Journal Lines Table
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Journal Lines', 15, yPos);
    yPos += 4;

    // Prepare table data
    const tableData = lines.map(line => [
      String(line.lineNum),
      line.account || '-',
      line.accountDescription || '-',
      line.currency.split(' ')[0], // Just currency code
      line.enteredDr !== null ? formatNumber(line.enteredDr) : '-',
      line.enteredCr !== null ? formatNumber(line.enteredCr) : '-',
      line.accountedDr !== null ? formatNumber(line.accountedDr) : '-',
      line.accountedCr !== null ? formatNumber(line.accountedCr) : '-',
      line.description || '-',
    ]);

    // Add totals row
    tableData.push([
      '',
      'TOTAL',
      '',
      '',
      formatNumber(lineTotals.enteredDr),
      formatNumber(lineTotals.enteredCr),
      formatNumber(lineTotals.accountedDr),
      formatNumber(lineTotals.accountedCr),
      isBalanced ? 'Balanced' : 'UNBALANCED',
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [[
        'Line',
        'Account Code',
        'Account Description',
        'Cur',
        'Entered Dr',
        'Entered Cr',
        'Accounted Dr',
        'Accounted Cr',
        'Description',
      ]],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: primaryColor,
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center',
      },
      bodyStyles: {
        fontSize: 8,
        textColor: textColor,
      },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 45 },
        2: { cellWidth: 40 },
        3: { cellWidth: 12, halign: 'center' },
        4: { cellWidth: 25, halign: 'right' },
        5: { cellWidth: 25, halign: 'right' },
        6: { cellWidth: 25, halign: 'right' },
        7: { cellWidth: 25, halign: 'right' },
        8: { cellWidth: 45 },
      },
      alternateRowStyles: {
        fillColor: headerBg,
      },
      // Style the last row (totals) differently
      didParseCell: (data) => {
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [230, 230, 230];
          if (data.column.index === 8 && !isBalanced) {
            data.cell.styles.textColor = primaryColor;
          }
        }
      },
      margin: { left: 15, right: 15 },
    });

    // Footer
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(8);
    doc.setTextColor(107, 107, 107);
    doc.text(`Page 1 of 1`, pageWidth / 2, finalY, { align: 'center' });
    doc.text(`Data Access Set: BUIMERC LEDGER`, 15, finalY);
    doc.text(`Journal Count: ${journals.length}`, pageWidth - 15, finalY, { align: 'right' });

    // Generate PDF as blob URL for preview
    const fileName = `Journal_${batchData.batchName}_${dayjs().format('YYYYMMDD_HHmmss')}.pdf`;
    const pdfBlob = doc.output('blob');
    const blobUrl = URL.createObjectURL(pdfBlob);

    // Set state to show preview modal
    setPdfDataUrl(blobUrl);
    setPdfFileName(fileName);
    setPdfPreviewVisible(true);
  };

  // Download PDF from preview
  const handleDownloadPDF = () => {
    if (pdfDataUrl) {
      const link = document.createElement('a');
      link.href = pdfDataUrl;
      link.download = pdfFileName;
      link.click();
      message.success(`PDF downloaded: ${pdfFileName}`);
    }
  };

  // Close PDF preview and cleanup
  const handleClosePdfPreview = () => {
    if (pdfDataUrl) {
      URL.revokeObjectURL(pdfDataUrl); // Clean up blob URL
    }
    setPdfPreviewVisible(false);
    setPdfDataUrl('');
    setPdfFileName('');
  };

  // Validate mandatory fields
  const validateMandatoryFields = (): { valid: boolean; message: string } => {
    if (!batchData.batchName) {
      return { valid: false, message: 'Please enter a Journal Batch name' };
    }
    if (!journalData.ledger) {
      return { valid: false, message: 'Please select a Ledger' };
    }
    if (!journalData.legalEntity) {
      return { valid: false, message: 'Please select a Legal Entity' };
    }
    if (!journalData.accountingDate) {
      return { valid: false, message: 'Please enter an Accounting Date' };
    }
    if (!journalData.category) {
      return { valid: false, message: 'Please select a Category' };
    }
    if (lines.length === 0) {
      return { valid: false, message: 'Journal must have at least one line. Please add journal lines before saving.' };
    }
    return { valid: true, message: '' };
  };

  // Build JSON payload for API
  const buildJsonPayload = () => {
    // Format date from D-MMM-YYYY to YYYY-MM-DD
    const formatDateForApi = (dateStr: string): string => {
      if (!dateStr) return '';
      const parsed = dayjs(dateStr, 'D-MMM-YYYY');
      return parsed.isValid() ? parsed.format('YYYY-MM-DD') : dateStr;
    };

    const payload = {
      batch: {
        batchName: batchData.batchName,
        batchDescription: batchData.description || '',
        ledgerName: selectedLedger?.ledger_name || journalData.ledger,
        ledgerId: selectedLedger?.ledger_id || 0,
        status: 'NEW',
        accountingPeriod: batchData.accountingPeriod,
        controlTotal: journalData.controlTotal || lineTotals.enteredDr,
        runningTotalDr: lineTotals.enteredDr,
        runningTotalCr: lineTotals.enteredCr,
        batchSource: 'Manual',
        createdBy: 'user@example.com', // TODO: Get from auth context
      },
      header: {
        ledgerId: selectedLedger?.ledger_id || 0,
        ledgerName: selectedLedger?.ledger_name || journalData.ledger,
        jeCategory: journalData.category || 'Adjustment',
        jeSource: 'Manual',
        periodName: batchData.accountingPeriod,
        journalName: journalData.journalName,
        description: journalData.description || '',
        currencyCode: journalData.currency,
        currencyConversionType: journalData.conversionRateType,
        currencyConversionDate: formatDateForApi(journalData.conversionDate),
        currencyConversionRate: journalData.conversionRate,
        defaultEffectiveDate: formatDateForApi(journalData.accountingDate),
        status: 'NEW',
        runningTotalDr: lineTotals.enteredDr,
        runningTotalCr: lineTotals.enteredCr,
        createdBy: 'user@example.com', // TODO: Get from auth context
      },
      lines: lines.map(line => ({
        enteredDr: line.enteredDr,
        enteredCr: line.enteredCr,
        accountedDr: line.accountedDr,
        accountedCr: line.accountedCr,
        statAmount: null,
        description: line.description || '',
        currencyCode: journalData.currency,
        currencyConversionDate: formatDateForApi(line.conversionDate),
        currencyConversionRate: journalData.conversionRate,
        userCurrencyConversionType: journalData.conversionRateType,
        accountCombination: line.account,
        chartOfAccountsName: selectedLedger?.description || 'Chart of Accounts',
        reference1: null,
        reference2: null,
        reference3: null,
        reference4: null,
        reference5: null,
        createdBy: 'user@example.com', // TODO: Get from auth context
      })),
    };

    return payload;
  };

  // Handle Save - show JSON preview
  const handleSave = async () => {
    const validation = validateMandatoryFields();
    if (!validation.valid) {
      message.error(validation.message);
      return;
    }

    // Block save if debits and credits don't balance
    if (!isBalanced) {
      message.error(`Cannot save: Total Debit (${formatNumber(lineTotals.enteredDr)}) must equal Total Credit (${formatNumber(lineTotals.enteredCr)}). Difference: ${formatNumber(Math.abs(lineTotals.enteredDr - lineTotals.enteredCr))}`);
      return;
    }

    // Build payload and show preview
    const payload = buildJsonPayload();
    setJsonPayload(payload);
    setJsonPreviewVisible(true);
  };

  // Handle confirm save - POST to API
  const handleConfirmSave = async () => {
    if (!jsonPayload) return;

    setPostingJournal(true);
    setSaveResponse(null);
    try {
      const response = await fetch(
        'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/journals/create',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(jsonPayload),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      setSaveResponse(result);
      message.success('Journal saved successfully!');
      // Don't close modal - show the response
    } catch (error: any) {
      console.error('Error saving journal:', error);
      setSaveResponse({ error: true, message: error.message || 'Failed to save journal' });
      message.error('Failed to save journal. Please try again.');
    } finally {
      setPostingJournal(false);
    }
  };

  // Close JSON modal — on success reset to blank journal (stay on page); in embedded mode also notify parent
  const handleCloseJsonModal = () => {
    const wasSuccessful = saveResponse && !saveResponse.error;
    setJsonPreviewVisible(false);
    setJsonPayload(null);
    setSaveResponse(null);
    if (wasSuccessful) {
      handleResetForNewJournal();
      if (embeddedMode && onSaved) { onSaved(); }
    }
  };

  // Handle Post - requires balanced journal with lines
  // Calls POST reerp/journals/create with status='P' (creates journal as Posted)
  const handlePost = async () => {
    const validation = validateMandatoryFields();
    if (!validation.valid) {
      message.error(validation.message);
      return;
    }

    if (!isBalanced) {
      message.error(`Cannot post: Total Debit (${formatNumber(lineTotals.enteredDr)}) must equal Total Credit (${formatNumber(lineTotals.enteredCr)}). Difference: ${formatNumber(Math.abs(lineTotals.enteredDr - lineTotals.enteredCr))}`);
      return;
    }

    setSaving(true);
    try {
      const payload = buildJsonPayload();
      // Override status to 'P' so the journal is created directly as Posted
      payload.batch.status = 'P';

      const response = await fetch(
        'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/journals/create',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      message.success('Journal posted successfully');
      handleResetForNewJournal();
      if (embeddedMode && onSaved) { onSaved(); }
    } catch (error: any) {
      message.error(`Failed to post journal: ${error.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  // Cancel handler
  const handleCancel = () => {
    if (embeddedMode && onSaved) { onSaved(); } else { navigate(-1); }
  };

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

  // Complete dropdown menu
  const completeMenu: MenuProps['items'] = [
    { key: 'complete', label: 'Complete' },
    { key: 'completeClose', label: 'Complete and Close' },
  ];

  // Post dropdown menu
  const postMenu: MenuProps['items'] = [
    { key: 'post', label: 'Post' },
    { key: 'postClose', label: 'Post and Close' },
  ];

  // Lines Actions menu
  const linesActionsMenu: MenuProps['items'] = [
    { key: 'add', label: 'Add Row', onClick: handleAddLine },
    { key: 'delete', label: 'Delete Selected', disabled: selectedLineKeys.length === 0 },
    { key: 'duplicate', label: 'Duplicate' },
  ];

  // Lines View menu
  const linesViewMenu: MenuProps['items'] = [
    { key: 'columns', label: 'Columns' },
    { key: 'sort', label: 'Sort' },
    { key: 'filter', label: 'Filter' },
  ];

  // Lines Format menu
  const linesFormatMenu: MenuProps['items'] = [
    { key: 'resize', label: 'Resize Columns' },
    { key: 'wrap', label: 'Wrap Text' },
  ];

  // Resizable column widths
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    lineNum: 60, account: 350, currency: 140,
    enteredDr: 100, enteredCr: 100,
    conversionDate: 110,
    accountedDr: 100, accountedCr: 100,
    description: 200,
  });
  const handleColResize = useCallback((key: string) => (_: React.SyntheticEvent, { size }: { size: { width: number } }) => {
    setColWidths(prev => ({ ...prev, [key]: size.width }));
  }, []);

  // Line columns
  const lineColumns: ColumnsType<JournalLine> = [
    {
      title: 'Line',
      dataIndex: 'lineNum',
      key: 'lineNum',
      width: colWidths.lineNum,
      fixed: 'left',
      onHeaderCell: () => ({ width: colWidths.lineNum, onResize: handleColResize('lineNum') } as any),
      render: (num) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ cursor: 'pointer', color: REDWOOD.neutral600 }}>&#9654;</span>
          {num}
        </div>
      ),
    },
    {
      title: <span><span style={{ color: REDWOOD.primary }}>*</span> Account</span>,
      dataIndex: 'account',
      key: 'account',
      width: colWidths.account,
      onHeaderCell: () => ({ width: colWidths.account, onResize: handleColResize('account') } as any),
      render: (value, record) => (
        <div>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={value}
              onChange={(e) => updateLine(record.key, 'account', e.target.value)}
              onBlur={(e) => handleAccountBlur(record.key, e.target.value)}
              placeholder="Select or type account"
              size="small"
              style={{ width: 'calc(100% - 64px)' }}
              suffix={validatingAccount === record.key ? <span style={{ color: REDWOOD.info }}>...</span> : null}
            />
            <Tooltip title="Search Account">
              <Button
                size="small"
                icon={<SearchOutlined />}
                onClick={() => openAccountSelector(record.key)}
                style={{ borderColor: REDWOOD.neutral300 }}
                loading={validatingAccount === record.key}
              />
            </Tooltip>
            {record.account && Object.keys(record.segmentDetails || {}).length > 0 && (
              <Popover
                title="Account Segments"
                trigger="click"
                content={
                  <div style={{ minWidth: 280 }}>
                    {Object.entries(record.segmentDetails || {}).map(([segmentCode, detail]) => (
                      <div key={segmentCode} style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
                        <Text strong style={{ minWidth: 100, fontSize: 12 }}>{detail.name || segmentCode}:</Text>
                        <Text style={{ fontSize: 12 }}>{detail.value} - {detail.description}</Text>
                      </div>
                    ))}
                  </div>
                }
              >
                <Button
                  size="small"
                  icon={<InfoCircleOutlined />}
                  style={{ borderColor: REDWOOD.neutral300, color: REDWOOD.info }}
                />
              </Popover>
            )}
          </Space.Compact>
          {record.accountDescription && (
            <div style={{
              fontSize: 11,
              color: REDWOOD.neutral600,
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 320,
            }}>
              {record.accountDescription}
            </div>
          )}
          {!record.account && (
            <div style={{ fontSize: 10, color: REDWOOD.neutral300, marginTop: 2 }}>
              {journalData.company ? `${journalData.company} – … – [Account] – …` : '– select account combination –'}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Currency',
      dataIndex: 'currency',
      key: 'currency',
      width: colWidths.currency,
      onHeaderCell: () => ({ width: colWidths.currency, onResize: handleColResize('currency') } as any),
    },
    {
      title: `Entered (${journalData.currency})`,
      children: [
        {
          title: 'Debit',
          dataIndex: 'enteredDr',
          key: 'enteredDr',
          width: colWidths.enteredDr,
          align: 'right',
          onHeaderCell: () => ({ width: colWidths.enteredDr, onResize: handleColResize('enteredDr') } as any),
          render: (value, record) => (
            <InputNumber
              value={value}
              onChange={(val) => updateLine(record.key, 'enteredDr', val)}
              size="small"
              style={{ width: '100%' }}
              min={0}
              precision={2}
            />
          ),
        },
        {
          title: 'Credit',
          dataIndex: 'enteredCr',
          key: 'enteredCr',
          width: colWidths.enteredCr,
          align: 'right',
          onHeaderCell: () => ({ width: colWidths.enteredCr, onResize: handleColResize('enteredCr') } as any),
          render: (value, record) => (
            <InputNumber
              value={value}
              onChange={(val) => updateLine(record.key, 'enteredCr', val)}
              size="small"
              style={{ width: '100%' }}
              min={0}
              precision={2}
            />
          ),
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
          width: colWidths.conversionDate,
          onHeaderCell: () => ({ width: colWidths.conversionDate, onResize: handleColResize('conversionDate') } as any),
        },
      ],
    },
    {
      title: `Accounted (${journalData.currency})`,
      children: [
        {
          title: 'Debit',
          dataIndex: 'accountedDr',
          key: 'accountedDr',
          width: colWidths.accountedDr,
          align: 'right',
          onHeaderCell: () => ({ width: colWidths.accountedDr, onResize: handleColResize('accountedDr') } as any),
          render: (value: number) => (
            <span style={{ fontSize: 12, color: value ? REDWOOD.neutral900 : REDWOOD.neutral300 }}>
              {value ? formatNumber(value) : '—'}
            </span>
          ),
        },
        {
          title: 'Credit',
          dataIndex: 'accountedCr',
          key: 'accountedCr',
          width: colWidths.accountedCr,
          align: 'right',
          onHeaderCell: () => ({ width: colWidths.accountedCr, onResize: handleColResize('accountedCr') } as any),
          render: (value: number) => (
            <span style={{ fontSize: 12, color: value ? REDWOOD.neutral900 : REDWOOD.neutral300 }}>
              {value ? formatNumber(value) : '—'}
            </span>
          ),
        },
      ],
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: colWidths.description,
      onHeaderCell: () => ({ width: colWidths.description, onResize: handleColResize('description') } as any),
      render: (value, record) => (
        <Input
          value={value}
          onChange={(e) => updateLine(record.key, 'description', e.target.value)}
          size="small"
          style={{ width: '100%' }}
        />
      ),
    },
  ];

  // Render Batch tabs content
  const renderBatchTabs = () => (
    <Tabs
      activeKey={activeBatchTab}
      onChange={setActiveBatchTab}
      size="small"
      style={{ padding: '0 12px' }}
      items={[
        {
          key: 'batch',
          label: 'Batch',
          children: (
            <div style={{ padding: '12px 0' }}>
              <Row gutter={[32, 12]}>
                <Col span={12}>
                  <Row gutter={[8, 12]} align="middle">
                    <Col span={8}><Text style={{ fontSize: 13 }}>Journal Batch</Text></Col>
                    <Col span={16}>
                      <Input
                        value={batchData.batchName}
                        onChange={(e) => setBatchData({ ...batchData, batchName: e.target.value })}
                        size="small"
                        style={{ width: 200 }}
                      />
                    </Col>

                    <Col span={8}><Text style={{ fontSize: 13 }}>Description</Text></Col>
                    <Col span={16}>
                      <Input.TextArea
                        value={batchData.description}
                        onChange={(e) => setBatchData({ ...batchData, description: e.target.value })}
                        size="small"
                        rows={2}
                        style={{ width: 200 }}
                      />
                    </Col>

                    <Col span={8}><Text style={{ fontSize: 13 }}>Balance Type</Text></Col>
                    <Col span={16}><Text style={{ fontSize: 13 }}>{batchData.balanceType}</Text></Col>

                    <Col span={8}>
                      <Text style={{ fontSize: 13 }}><span style={{ color: REDWOOD.primary }}>*</span> Accounting Period</Text>
                    </Col>
                    <Col span={16}>
                      <Select
                        value={batchData.accountingPeriod}
                        onChange={(val) => setBatchData({ ...batchData, accountingPeriod: val })}
                        size="small"
                        style={{ width: 180 }}
                        loading={loadingPeriods}
                        placeholder="Select period"
                      >
                        {periods
                          .filter(p => p.status === 'Open' || p.status === 'Future Entry')
                          .map(period => (
                            <Option key={period.period_name_id} value={period.period_name_id}>
                              {period.period_name_id} ({period.status})
                            </Option>
                          ))}
                      </Select>
                    </Col>

                    <Col span={8}><Text style={{ fontSize: 13 }}>Attachments</Text></Col>
                    <Col span={16}>
                      <Space>
                        <Text style={{ fontSize: 13 }}>None</Text>
                        <PaperClipOutlined style={{ color: REDWOOD.info, cursor: 'pointer' }} />
                      </Space>
                    </Col>
                  </Row>
                </Col>
                <Col span={12}>
                  <Row gutter={[8, 12]} align="middle">
                    <Col span={10}><Text style={{ fontSize: 13 }}>Source</Text></Col>
                    <Col span={14}><Text style={{ fontSize: 13 }}>Manual</Text></Col>

                    <Col span={10}><Text style={{ fontSize: 13 }}>Approval Status</Text></Col>
                    <Col span={14}><Text style={{ fontSize: 13 }}>Required</Text></Col>

                    <Col span={10}><Text style={{ fontSize: 13 }}>Batch Status</Text></Col>
                    <Col span={14}><Text style={{ fontSize: 13 }}>Unposted</Text></Col>

                    <Col span={10}><Text style={{ fontSize: 13 }}>Completion Status</Text></Col>
                    <Col span={14}><Text style={{ fontSize: 13 }}>Incomplete</Text></Col>
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
            <div style={{ padding: '12px 0' }}>
              <Row gutter={[32, 12]}>
                <Col span={12}>
                  <Row gutter={[8, 12]} align="middle">
                    <Col span={14}><Text style={{ fontSize: 13 }}>Total Entered Debit</Text></Col>
                    <Col span={10}><Text strong style={{ fontSize: 13 }}>{formatNumber(lineTotals.enteredDr) || '0.00'}</Text></Col>

                    <Col span={14}><Text style={{ fontSize: 13 }}>Total Entered Credit</Text></Col>
                    <Col span={10}><Text strong style={{ fontSize: 13 }}>{formatNumber(lineTotals.enteredCr) || '0.00'}</Text></Col>

                    <Col span={14}><Text style={{ fontSize: 13 }}>Difference</Text></Col>
                    <Col span={10}>
                      <Text strong style={{ fontSize: 13, color: isBalanced ? REDWOOD.success : REDWOOD.primary }}>
                        {formatNumber(Math.abs(lineTotals.enteredDr - lineTotals.enteredCr)) || '0.00'}
                        {!isBalanced && lineTotals.enteredDr !== lineTotals.enteredCr && ' (Unbalanced)'}
                      </Text>
                    </Col>
                  </Row>
                </Col>
                <Col span={12}>
                  <Row gutter={[8, 12]} align="middle">
                    <Col span={14}><Text style={{ fontSize: 13 }}>Total Accounted Debit</Text></Col>
                    <Col span={10}><Text strong style={{ fontSize: 13 }}>{formatNumber(lineTotals.accountedDr) || '0.00'}</Text></Col>

                    <Col span={14}><Text style={{ fontSize: 13 }}>Total Accounted Credit</Text></Col>
                    <Col span={10}><Text strong style={{ fontSize: 13 }}>{formatNumber(lineTotals.accountedCr) || '0.00'}</Text></Col>

                    <Col span={14}><Text style={{ fontSize: 13 }}>Journal Count</Text></Col>
                    <Col span={10}><Text strong style={{ fontSize: 13 }}>{journals.length}</Text></Col>
                  </Row>
                </Col>
              </Row>
            </div>
          ),
        },
        {
          key: 'actionLog',
          label: 'Action Log',
          children: (
            <div style={{ padding: '12px 0' }}>
              <Text type="secondary" style={{ fontSize: 13 }}>No actions logged yet.</Text>
            </div>
          ),
        },
      ]}
    />
  );

  // Render Journal tabs content
  const renderJournalTabs = () => (
    <Tabs
      activeKey={activeJournalTab}
      onChange={setActiveJournalTab}
      size="small"
      style={{ padding: '0 12px' }}
      items={[
        {
          key: 'journal',
          label: 'Journal',
          children: (
            <div style={{ padding: '12px 0' }}>
              <Row gutter={[32, 12]}>
                <Col span={8}>
                  <Row gutter={[8, 12]} align="middle">
                    <Col span={10}><Text style={{ fontSize: 13 }}>Journal</Text></Col>
                    <Col span={14}>
                      <Input
                        value={journalData.journalName}
                        onChange={(e) => setJournalData({ ...journalData, journalName: e.target.value })}
                        size="small"
                        style={{ width: '100%' }}
                      />
                    </Col>

                    <Col span={10}><Text style={{ fontSize: 13 }}>Description</Text></Col>
                    <Col span={14}>
                      <Input.TextArea
                        value={journalData.description}
                        onChange={(e) => setJournalData({ ...journalData, description: e.target.value })}
                        size="small"
                        rows={2}
                        style={{ width: '100%' }}
                      />
                    </Col>

                    <Col span={10}>
                      <Text style={{ fontSize: 13 }}><span style={{ color: REDWOOD.primary }}>*</span> Ledger</Text>
                    </Col>
                    <Col span={14}>
                      <Select
                        value={journalData.ledger}
                        onChange={(val) => {
                          setJournalData({ ...journalData, ledger: val });
                          // Also update the selected ledger in the header
                          const ledger = ledgers.find(l => l.ledger_name === val);
                          if (ledger) setSelectedLedger(ledger);
                        }}
                        size="small"
                        style={{ width: '100%' }}
                        loading={loadingLedgers}
                      >
                        {ledgers.map(ledger => (
                          <Option key={ledger.ledger_id} value={ledger.ledger_name}>
                            {ledger.ledger_name}
                          </Option>
                        ))}
                      </Select>
                    </Col>

                    <Col span={10}>
                      <Text style={{ fontSize: 13 }}><span style={{ color: REDWOOD.primary }}>*</span> Legal Entity Name</Text>
                    </Col>
                    <Col span={14}>
                      <Select
                        value={journalData.legalEntity}
                        onChange={(val) => setJournalData({ ...journalData, legalEntity: val })}
                        size="small"
                        style={{ width: '100%' }}
                        placeholder="Select"
                      >
                        <Option value="Buimerc Corporation Limited">Buimerc Corporation Limited</Option>
                        <Option value="Buimerc Corporation FZE">Buimerc Corporation FZE</Option>
                      </Select>
                    </Col>

                    <Col span={10}>
                      <Text style={{ fontSize: 13 }}><span style={{ color: REDWOOD.primary }}>*</span> Accounting Date</Text>
                    </Col>
                    <Col span={14}>
                      {(() => {
                        const selPeriod = periods.find(p => p.period_name_id === batchData.accountingPeriod);
                        const pStart = selPeriod?.start_date ? parseOracleDate(selPeriod.start_date) : null;
                        const pEnd   = selPeriod?.end_date   ? parseOracleDate(selPeriod.end_date)   : null;
                        return (
                          <DatePicker
                            value={parseDateSafe(journalData.accountingDate)}
                            onChange={(date) => setJournalData({ ...journalData, accountingDate: date?.format('D-MMM-YYYY') || '' })}
                            size="small"
                            style={{ width: '100%' }}
                            format="D-MMM-YYYY"
                            disabledDate={(current) => {
                              if (!pStart || !pEnd) return false;
                              return current.isBefore(pStart, 'day') || current.isAfter(pEnd, 'day');
                            }}
                          />
                        );
                      })()}
                    </Col>

                    <Col span={10}>
                      <Text style={{ fontSize: 13 }}><span style={{ color: REDWOOD.primary }}>*</span> Category</Text>
                    </Col>
                    <Col span={14}>
                      <Select
                        value={journalData.category}
                        onChange={(val) => setJournalData({ ...journalData, category: val })}
                        size="small"
                        style={{ width: '100%' }}
                        placeholder="Select"
                      >
                        <Option value="Adjustment">Adjustment</Option>
                        <Option value="Accrual">Accrual</Option>
                        <Option value="Other">Other</Option>
                      </Select>
                    </Col>

                    <Col span={10}><Text style={{ fontSize: 13 }}>Attachments</Text></Col>
                    <Col span={14}>
                      <Space>
                        <Text style={{ fontSize: 13 }}>None</Text>
                        <PaperClipOutlined style={{ color: REDWOOD.info, cursor: 'pointer' }} />
                      </Space>
                    </Col>
                  </Row>
                </Col>
                <Col span={8}>
                  <Row gutter={[8, 12]} align="middle">
                    <Col span={12}><Text style={{ fontSize: 13 }}>Currency</Text></Col>
                    <Col span={12}>
                      <Select
                        value={journalData.currency}
                        onChange={(val) => setJournalData({ ...journalData, currency: val })}
                        size="small"
                        style={{ width: '100%' }}
                      >
                        <Option value="AED">AED UAE Dirham</Option>
                        <Option value="USD">USD US Dollar</Option>
                        <Option value="INR">INR Indian Rupee</Option>
                      </Select>
                    </Col>

                    <Col span={12}>
                      <Text style={{ fontSize: 13 }}><span style={{ color: REDWOOD.primary }}>*</span> Conversion Date</Text>
                    </Col>
                    <Col span={12}>
                      <DatePicker
                        value={parseDateSafe(journalData.conversionDate)}
                        onChange={(date) => setJournalData({ ...journalData, conversionDate: date?.format('D-MMM-YYYY') || '' })}
                        size="small"
                        style={{ width: '100%' }}
                        format="D-MMM-YYYY"
                      />
                    </Col>

                    <Col span={12}><Text style={{ fontSize: 13 }}>Conversion Rate Type</Text></Col>
                    <Col span={12}>
                      <Select
                        value={journalData.conversionRateType}
                        onChange={(val) => {
                          const rate = conversionRates[val]?.[journalData.currency] || 1;
                          setJournalData({ ...journalData, conversionRateType: val, conversionRate: rate, inverseRate: Math.round((1 / rate) * 10000) / 10000 });
                        }}
                        size="small"
                        style={{ width: '100%' }}
                      >
                        <Option value="User">User</Option>
                        <Option value="Spot">Spot</Option>
                        <Option value="Corporate">Corporate</Option>
                      </Select>
                    </Col>

                    <Col span={12}><Text style={{ fontSize: 13 }}>Conversion Rate</Text></Col>
                    <Col span={12}>
                      <InputNumber
                        value={journalData.conversionRate}
                        onChange={(val) => setJournalData({ ...journalData, conversionRate: val || 1, inverseRate: val ? Math.round((1 / val) * 10000) / 10000 : 1 })}
                        size="small"
                        style={{ width: '100%' }}
                        precision={4}
                        min={0.0001}
                        disabled={journalData.conversionRateType !== 'User'}
                      />
                    </Col>
                  </Row>
                </Col>
                <Col span={8}>
                  <Row gutter={[8, 12]} align="middle">
                    <Col span={12}><Text style={{ fontSize: 13 }}>Inverse Conversion Rate</Text></Col>
                    <Col span={12}><Text style={{ fontSize: 13 }}>{journalData.inverseRate}</Text></Col>

                    <Col span={12}><Text style={{ fontSize: 13 }}>Reference</Text></Col>
                    <Col span={12}>
                      <Input
                        value={journalData.reference}
                        onChange={(e) => setJournalData({ ...journalData, reference: e.target.value })}
                        size="small"
                        style={{ width: '100%' }}
                      />
                    </Col>

                    <Col span={12}><Text style={{ fontSize: 13 }}>Reference Date</Text></Col>
                    <Col span={12}>
                      <DatePicker
                        value={journalData.referenceDate ? dayjs(journalData.referenceDate, 'D-MMM-YYYY') : null}
                        onChange={(date) => setJournalData({ ...journalData, referenceDate: date?.format('D-MMM-YYYY') || '' })}
                        size="small"
                        style={{ width: '100%' }}
                        format="D-MMM-YYYY"
                        placeholder="D-MMM-YYYY"
                      />
                    </Col>

                    <Col span={12}><Text style={{ fontSize: 13 }}>Company</Text></Col>
                    <Col span={12}>
                      <Select
                        value={journalData.company}
                        onChange={(val) => setJournalData({ ...journalData, company: val })}
                        size="small"
                        style={{ width: '100%' }}
                        placeholder=""
                        allowClear
                      >
                        <Option value="01">01</Option>
                        <Option value="02">02</Option>
                      </Select>
                    </Col>

                    <Col span={12}><Text style={{ fontSize: 13 }}>Regional Information</Text></Col>
                    <Col span={12}>
                      <Select
                        value={journalData.regionalInfo}
                        onChange={(val) => setJournalData({ ...journalData, regionalInfo: val })}
                        size="small"
                        style={{ width: '100%' }}
                        placeholder=""
                        allowClear
                      />
                    </Col>
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
            <div style={{ padding: '12px 0' }}>
              <Row gutter={[32, 12]}>
                <Col span={12}>
                  <Row gutter={[8, 12]} align="middle">
                    <Col span={12}><Text style={{ fontSize: 13 }}>Control Total</Text></Col>
                    <Col span={12}>
                      <InputNumber
                        value={journalData.controlTotal}
                        onChange={(val) => setJournalData({ ...journalData, controlTotal: val })}
                        size="small"
                        style={{ width: 150 }}
                        precision={2}
                      />
                    </Col>

                    <Col span={12}><Text style={{ fontSize: 13 }}>Total Entered Debit</Text></Col>
                    <Col span={12}><Text style={{ fontSize: 13 }}>{formatNumber(lineTotals.enteredDr) || '-'}</Text></Col>

                    <Col span={12}><Text style={{ fontSize: 13 }}>Total Entered Credit</Text></Col>
                    <Col span={12}><Text style={{ fontSize: 13 }}>{formatNumber(lineTotals.enteredCr) || '-'}</Text></Col>
                  </Row>
                </Col>
                <Col span={12}>
                  <Row gutter={[8, 12]} align="middle">
                    <Col span={12}><a style={{ color: REDWOOD.info, fontSize: 13, textDecoration: 'underline' }}>Total Accounted Debit</a></Col>
                    <Col span={12}><Text style={{ fontSize: 13 }}>{formatNumber(lineTotals.accountedDr) || '-'}</Text></Col>

                    <Col span={12}><a style={{ color: REDWOOD.info, fontSize: 13, textDecoration: 'underline' }}>Total Accounted Credit</a></Col>
                    <Col span={12}><Text style={{ fontSize: 13 }}>{formatNumber(lineTotals.accountedCr) || '-'}</Text></Col>
                  </Row>
                </Col>
              </Row>
            </div>
          ),
        },
        {
          key: 'sequencing',
          label: 'Sequencing',
          children: (
            <div style={{ padding: '12px 0' }}>
              <Row gutter={[48, 12]}>
                <Col span={12}>
                  <a style={{ color: REDWOOD.info, fontSize: 13, textDecoration: 'underline', display: 'block', marginBottom: 12 }}>Accounting Sequence</a>
                  <Row gutter={[8, 8]} align="middle">
                    <Col span={8}><Text style={{ fontSize: 13 }}>Name</Text></Col>
                    <Col span={16}><Text style={{ fontSize: 13 }}>{journalData.accountingSeqName || '-'}</Text></Col>

                    <Col span={8}><Text style={{ fontSize: 13 }}>Number</Text></Col>
                    <Col span={16}><Text style={{ fontSize: 13 }}>{journalData.accountingSeqNumber || '-'}</Text></Col>
                  </Row>
                </Col>
                <Col span={12}>
                  <a style={{ color: REDWOOD.info, fontSize: 13, textDecoration: 'underline', display: 'block', marginBottom: 12 }}>Reporting Sequence</a>
                  <Row gutter={[8, 8]} align="middle">
                    <Col span={8}><Text style={{ fontSize: 13 }}>Name</Text></Col>
                    <Col span={16}><Text style={{ fontSize: 13 }}>{journalData.reportingSeqName || '-'}</Text></Col>

                    <Col span={8}><Text style={{ fontSize: 13 }}>Number</Text></Col>
                    <Col span={16}><Text style={{ fontSize: 13 }}>{journalData.reportingSeqNumber || '-'}</Text></Col>
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
            <div style={{ padding: '12px 0' }}>
              <Row gutter={[32, 12]}>
                <Col span={12}>
                  <Row gutter={[8, 12]} align="middle">
                    <Col span={10}><Text style={{ fontSize: 13 }}>Reversal Period</Text></Col>
                    <Col span={14}>
                      <Select
                        value={journalData.reversalPeriod}
                        onChange={(val) => setJournalData({ ...journalData, reversalPeriod: val })}
                        size="small"
                        style={{ width: 180 }}
                        placeholder="Select"
                        allowClear
                        loading={loadingPeriods}
                      >
                        {periods.map(period => (
                          <Option key={period.period_name_id} value={period.period_name_id}>
                            {period.period_year} - {period.period_name_id}
                          </Option>
                        ))}
                      </Select>
                    </Col>

                    <Col span={10}><Text style={{ fontSize: 13 }}>Reversal Method</Text></Col>
                    <Col span={14}>
                      <Select
                        value={journalData.reversalMethod}
                        onChange={(val) => setJournalData({ ...journalData, reversalMethod: val })}
                        size="small"
                        style={{ width: 150 }}
                      >
                        <Option value="Switch DR or CR">Switch DR or CR</Option>
                        <Option value="Change Sign">Change Sign</Option>
                      </Select>
                    </Col>
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
    <Layout style={{ minHeight: embeddedMode ? 'auto' : '100vh', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Select Ledger Header */}
        <div style={{ padding: '6px 24px', background: REDWOOD.neutral100, fontSize: 12, color: REDWOOD.neutral600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 12 }}>Select Ledger:</Text>
          <Select
            value={selectedLedger?.ledger_id}
            onChange={handleLedgerChange}
            loading={loadingLedgers}
            size="small"
            style={{ minWidth: 250 }}
            placeholder="Select a ledger"
          >
            {ledgers.map(ledger => (
              <Option key={ledger.ledger_id} value={ledger.ledger_id}>
                {ledger.ledger_name}
              </Option>
            ))}
          </Select>
          {selectedLedger && (
            <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
              Currency: {selectedLedger.currency_code}
            </Text>
          )}
        </div>

        {/* Action Header with Title */}
        <div style={{
          padding: '8px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Space>
            <Title level={5} style={{ margin: 0, fontSize: 16 }}>
              Create Journal
            </Title>
            <QuestionCircleOutlined style={{ color: REDWOOD.neutral600, cursor: 'pointer' }} />
          </Space>
          <Space size="small">
            <Button
              type="primary"
              size="small"
              loading={saving}
              onClick={handleSave}
              icon={<SaveOutlined />}
            >
              Save
            </Button>
            <Button
              type="primary"
              size="small"
              loading={saving}
              onClick={handlePost}
              icon={<CheckSquareOutlined />}
              style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
            >
              Post
            </Button>
            <Button
              size="small"
              onClick={handleCancel}
            >
              Cancel
            </Button>
          </Space>
        </div>

        <div style={{ padding: 16 }}>
          {/* Journal Batch Section */}
          <Card
            style={{ marginBottom: 12, borderRadius: 6 }}
            bodyStyle={{ padding: 0 }}
          >
            <div
              onClick={() => setBatchExpanded(v => !v)}
              style={{
                padding: '8px 12px',
                background: REDWOOD.neutral100,
                borderBottom: `1px solid ${REDWOOD.neutral200}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <Space>
                <Text strong style={{ fontSize: 13 }}>
                  <span style={{ marginRight: 4, display: 'inline-block', transition: 'transform 0.2s', transform: batchExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                  Journal Batch
                </Text>
                <QuestionCircleOutlined style={{ color: REDWOOD.neutral600 }} onClick={e => e.stopPropagation()} />
                <Text style={{ color: REDWOOD.info, fontSize: 12 }}>
                  {batchExpanded ? 'Show Less' : 'Show More'}
                </Text>
              </Space>
            </div>

            <div style={{ display: batchExpanded ? 'block' : 'none' }}>
              {renderBatchTabs()}
            </div>
          </Card>

          {/* Journal Section */}
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
              <Space
                onClick={() => setJournalExpanded(v => !v)}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                <Text strong style={{ fontSize: 13 }}>
                  <span style={{ marginRight: 4, display: 'inline-block', transition: 'transform 0.2s', transform: journalExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                  Journal
                </Text>
                <QuestionCircleOutlined style={{ color: REDWOOD.neutral600 }} onClick={e => e.stopPropagation()} />
                <Text style={{ color: REDWOOD.info, fontSize: 12 }}>
                  {journalExpanded ? 'Show Less' : 'Show More'}
                </Text>
              </Space>
              <Space size="small">
                <Tooltip title="Previous Journal">
                  <Button
                    size="small"
                    icon={<LeftOutlined />}
                    disabled={currentJournalIndex === 0}
                    onClick={handlePrevJournal}
                  />
                </Tooltip>
                <Select
                  value={currentJournal.id}
                  style={{ width: 150, fontSize: 11 }}
                  size="small"
                  onChange={(value) => {
                    const idx = journals.findIndex(j => j.id === value);
                    if (idx !== -1) setCurrentJournalIndex(idx);
                  }}
                >
                  {journals.map((journal, idx) => (
                    <Option key={journal.id} value={journal.id}>
                      Journal {idx + 1}{journal.data.journalName ? `: ${journal.data.journalName}` : ''}
                    </Option>
                  ))}
                </Select>
                <Tooltip title="Next Journal">
                  <Button
                    size="small"
                    icon={<RightOutlined />}
                    disabled={currentJournalIndex === journals.length - 1}
                    onClick={handleNextJournal}
                  />
                </Tooltip>
                <Tooltip title="Add Journal">
                  <Button size="small" icon={<PlusOutlined />} onClick={handleAddJournal} />
                </Tooltip>
                <Tooltip title="Delete Journal">
                  <Button size="small" icon={<DeleteOutlined />} onClick={handleDeleteJournal} />
                </Tooltip>
                <Tooltip title="Export Journal to PDF">
                  <Button
                    size="small"
                    icon={<FilePdfOutlined />}
                    onClick={handlePrintPDF}
                    style={{ background: REDWOOD.primary, color: '#fff', borderColor: REDWOOD.primary }}
                  >
                    Print PDF
                  </Button>
                </Tooltip>
              </Space>
            </div>

            <div style={{ display: journalExpanded ? 'block' : 'none' }}>
              {renderJournalTabs()}
            </div>
          </Card>

          {/* Journal Lines Section */}
          <Card
            style={{ borderRadius: 6 }}
            bodyStyle={{ padding: 0 }}
          >
            <div
              style={{
                padding: '8px 12px',
                background: REDWOOD.neutral100,
                borderBottom: `1px solid ${REDWOOD.neutral200}`,
              }}
            >
              <Space>
                <Text strong style={{ fontSize: 13 }}>
                  <span style={{ marginRight: 4 }}>&#9660;</span> Journal Lines
                </Text>
                <QuestionCircleOutlined style={{ color: REDWOOD.neutral600, cursor: 'pointer' }} />
              </Space>
            </div>

            {/* Lines Toolbar */}
            <div style={{
              padding: '6px 12px',
              borderBottom: `1px solid ${REDWOOD.neutral200}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: REDWOOD.surface,
            }}>
              <Space size="small">
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={handleAddLine}
                  type="primary"
                  style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
                >
                  Add Row
                </Button>
                <Button
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={handleDeleteLines}
                  disabled={selectedLineKeys.length === 0}
                  danger
                >
                  Delete Row{selectedLineKeys.length > 1 ? `s (${selectedLineKeys.length})` : ''}
                </Button>
                <Tooltip title={isDetached ? 'Close Detached View' : 'Detach to Full Page'}>
                  <Button
                    size="small"
                    icon={<SplitCellsOutlined />}
                    onClick={() => setIsDetached(true)}
                    type={isDetached ? 'primary' : 'default'}
                  >
                    Detach
                  </Button>
                </Tooltip>
              </Space>
            </div>

            {/* Search Row */}
            <div style={{
              padding: '8px 12px',
              borderBottom: `1px solid ${REDWOOD.neutral200}`,
              background: '#fafafa',
            }}>
              <Input
                size="small"
                placeholder="Search by account, description..."
                prefix={<SearchOutlined style={{ color: REDWOOD.neutral600 }} />}
                value={lineSearchText}
                onChange={(e) => setLineSearchText(e.target.value)}
                allowClear
                style={{ width: 300 }}
              />
              {lineSearchText && (
                <Text style={{ marginLeft: 12, fontSize: 12, color: REDWOOD.neutral600 }}>
                  Showing {filteredLines.length} of {lines.length} lines
                </Text>
              )}
            </div>

            {/* Lines Table */}
            <Table
              columns={lineColumns}
              dataSource={filteredLines}
              components={{ header: { cell: ResizableTitle } }}
              rowSelection={{
                selectedRowKeys: selectedLineKeys,
                onChange: setSelectedLineKeys,
              }}
              pagination={false}
              scroll={{ x: 1400 }}
              size="small"
              bordered
              className="compact-table"
              rowClassName={(record) => selectedLineKeys.includes(record.key) ? 'selected-row' : ''}
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row style={{ background: REDWOOD.neutral100, fontWeight: 'bold' }}>
                    <Table.Summary.Cell index={0} colSpan={2}>
                      <Text strong>Total ({lines.length} lines)</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2} />
                    <Table.Summary.Cell index={3} />
                    <Table.Summary.Cell index={4} align="right">
                      <Text strong style={{ color: REDWOOD.info }}>{formatNumber(lineTotals.enteredDr)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">
                      <Text strong style={{ color: REDWOOD.info }}>{formatNumber(lineTotals.enteredCr)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} />
                    <Table.Summary.Cell index={7} align="right">
                      <Text strong style={{ color: REDWOOD.info }}>{formatNumber(lineTotals.accountedDr)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={8} align="right">
                      <Text strong style={{ color: REDWOOD.info }}>{formatNumber(lineTotals.accountedCr)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={9}>
                      {!isBalanced && <Text type="danger" style={{ fontSize: 11 }}>Unbalanced</Text>}
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
          </Card>
        </div>

        <style>{`
          .compact-table .ant-table-cell { padding: 4px 8px !important; font-size: 12px; }
          .compact-table .ant-table-thead > tr > th { padding: 6px 8px !important; font-size: 11px; background: ${REDWOOD.neutral100}; }
          .compact-table .ant-input-number { font-size: 12px; }
          .compact-table .ant-input { font-size: 12px; }
          .selected-row { background-color: #e6f7ff !important; }
          .ant-dropdown-button { display: inline-flex; }
          .ant-dropdown-button > .ant-btn:first-child { background: ${REDWOOD.warning}; border-color: ${REDWOOD.warning}; }
          .ant-dropdown-button > .ant-btn:last-child { background: ${REDWOOD.warning}; border-color: ${REDWOOD.warning}; border-left-color: rgba(255,255,255,0.3); }
        `}</style>

        {/* Account Selector Modal */}
        <AccountSelector
          visible={accountSelectorVisible}
          onCancel={() => {
            setAccountSelectorVisible(false);
            setEditingLineKey(null);
            setAccountSelectorInitialValue(undefined);
          }}
          onSelect={(accountCode, segments) => {
            handleAccountSelect(accountCode, segments);
            setAccountSelectorInitialValue(undefined);
          }}
          initialValue={accountSelectorInitialValue ?? (editingLineKey ? lines.find(l => l.key === editingLineKey)?.account : undefined)}
        />

        {/* Detached Journal Lines Modal */}
        <Modal
          title={
            <Space>
              <span>Journal Lines - {batchData.batchName}</span>
              <Text type="secondary" style={{ fontSize: 12 }}>
                ({lines.length} lines | Dr: {formatNumber(lineTotals.enteredDr)} | Cr: {formatNumber(lineTotals.enteredCr)})
              </Text>
            </Space>
          }
          open={isDetached}
          zIndex={1500}
          onCancel={() => setIsDetached(false)}
          width="95vw"
          style={{ top: 20 }}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <Button icon={<PlusOutlined />} onClick={handleAddLine}>Add Line</Button>
                <Button
                  icon={<DeleteOutlined />}
                  onClick={handleDeleteLines}
                  disabled={selectedLineKeys.length === 0}
                  danger
                >
                  Delete Selected
                </Button>
              </Space>
              <Space>
                <Text style={{ marginRight: 16 }}>
                  Total: Dr <Text strong>{formatNumber(lineTotals.enteredDr)}</Text> | Cr <Text strong>{formatNumber(lineTotals.enteredCr)}</Text>
                  {!isBalanced && <Text type="danger" style={{ marginLeft: 8 }}>(Unbalanced)</Text>}
                </Text>
                <Button onClick={() => setIsDetached(false)}>Close</Button>
              </Space>
            </div>
          }
          styles={{
            body: { padding: 0, maxHeight: 'calc(100vh - 200px)', overflow: 'auto' }
          }}
        >
          {/* Search in detached view */}
          <div style={{
            padding: '8px 16px',
            borderBottom: `1px solid ${REDWOOD.neutral200}`,
            background: '#fafafa',
          }}>
            <Input
              size="small"
              placeholder="Search by account, description..."
              prefix={<SearchOutlined style={{ color: REDWOOD.neutral600 }} />}
              value={lineSearchText}
              onChange={(e) => setLineSearchText(e.target.value)}
              allowClear
              style={{ width: 300 }}
            />
            {lineSearchText && (
              <Text style={{ marginLeft: 12, fontSize: 12, color: REDWOOD.neutral600 }}>
                Showing {filteredLines.length} of {lines.length} lines
              </Text>
            )}
          </div>

          {/* Table in detached view */}
          <Table
            columns={lineColumns}
            dataSource={filteredLines}
            rowSelection={{
              selectedRowKeys: selectedLineKeys,
              onChange: setSelectedLineKeys,
            }}
            pagination={false}
            scroll={{ x: 1400, y: 'calc(100vh - 350px)' }}
            size="small"
            bordered
            className="compact-table"
            rowClassName={(record) => selectedLineKeys.includes(record.key) ? 'selected-row' : ''}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ background: REDWOOD.neutral100, fontWeight: 'bold' }}>
                  <Table.Summary.Cell index={0} colSpan={2}>
                    <Text strong>Total ({lines.length} lines)</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} />
                  <Table.Summary.Cell index={3} />
                  <Table.Summary.Cell index={4} align="right">
                    <Text strong style={{ color: REDWOOD.info }}>{formatNumber(lineTotals.enteredDr)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">
                    <Text strong style={{ color: REDWOOD.info }}>{formatNumber(lineTotals.enteredCr)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} />
                  <Table.Summary.Cell index={7} align="right">
                    <Text strong style={{ color: REDWOOD.info }}>{formatNumber(lineTotals.accountedDr)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={8} align="right">
                    <Text strong style={{ color: REDWOOD.info }}>{formatNumber(lineTotals.accountedCr)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={9}>
                    {!isBalanced && <Text type="danger" style={{ fontSize: 11 }}>Unbalanced</Text>}
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </Modal>

        {/* PDF Preview Modal */}
        <Modal
          title={
            <Space>
              <FilePdfOutlined style={{ color: REDWOOD.primary }} />
              <span>Journal Report Preview</span>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {pdfFileName}
              </Text>
            </Space>
          }
          open={pdfPreviewVisible}
          onCancel={handleClosePdfPreview}
          width="90vw"
          style={{ top: 20 }}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Preview generated on {dayjs().format('DD-MMM-YYYY HH:mm:ss')}
              </Text>
              <Space>
                <Button onClick={handleClosePdfPreview}>
                  Close
                </Button>
                <Button
                  type="primary"
                  icon={<FilePdfOutlined />}
                  onClick={handleDownloadPDF}
                  style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                >
                  Download PDF
                </Button>
              </Space>
            </div>
          }
          styles={{
            body: { padding: 0, height: 'calc(100vh - 200px)', overflow: 'hidden' }
          }}
        >
          {pdfDataUrl && (
            <iframe
              src={pdfDataUrl}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
              }}
              title="PDF Preview"
            />
          )}
        </Modal>

        {/* JSON Preview Modal - Save Confirmation */}
        <Modal
          title={
            <Space>
              {saveResponse ? (
                saveResponse.error ? (
                  <CloseOutlined style={{ color: REDWOOD.primary }} />
                ) : (
                  <SaveOutlined style={{ color: REDWOOD.success }} />
                )
              ) : (
                <FileTextOutlined style={{ color: REDWOOD.info }} />
              )}
              <span>
                {saveResponse
                  ? saveResponse.error
                    ? 'Save Failed'
                    : 'Journal Saved Successfully'
                  : 'Review Journal Data Before Saving'}
              </span>
            </Space>
          }
          open={jsonPreviewVisible}
          onCancel={handleCloseJsonModal}
          width="80vw"
          style={{ top: 20 }}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Batch: {jsonPayload?.batch?.batchName} | Lines: {jsonPayload?.lines?.length || 0}
                </Text>
                {!isBalanced && !saveResponse && (
                  <Text type="danger" style={{ fontSize: 12 }}>
                    (Unbalanced)
                  </Text>
                )}
              </Space>
              <Space>
                {saveResponse ? (
                  <Button type="primary" onClick={handleCloseJsonModal}>
                    {saveResponse.error ? 'Close' : 'New Journal'}
                  </Button>
                ) : (
                  <>
                    <Button onClick={handleCloseJsonModal}>
                      Cancel
                    </Button>
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      onClick={handleConfirmSave}
                      loading={postingJournal}
                      style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
                    >
                      Confirm & Save
                    </Button>
                  </>
                )}
              </Space>
            </div>
          }
          styles={{
            body: { padding: 16, maxHeight: 'calc(100vh - 250px)', overflow: 'auto' }
          }}
        >
          {jsonPayload && (
            <div>
              {/* API Response Section - Show after save */}
              {saveResponse && (
                <div style={{
                  marginBottom: 16,
                  padding: 16,
                  background: saveResponse.error ? '#fff2f0' : '#f6ffed',
                  border: `1px solid ${saveResponse.error ? REDWOOD.primary : REDWOOD.success}`,
                  borderRadius: 6
                }}>
                  <Text strong style={{ fontSize: 14, color: saveResponse.error ? REDWOOD.primary : REDWOOD.success }}>
                    {saveResponse.error ? 'Error Response:' : 'API Response (Success):'}
                  </Text>
                  <pre
                    style={{
                      marginTop: 8,
                      background: saveResponse.error ? '#fff' : '#fff',
                      padding: 12,
                      borderRadius: 4,
                      fontSize: 12,
                      lineHeight: 1.5,
                      overflow: 'auto',
                      maxHeight: 300,
                      fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                      color: REDWOOD.neutral900,
                    }}
                  >
                    {JSON.stringify(saveResponse, null, 2)}
                  </pre>
                </div>
              )}

              {/* Summary Section */}
              <div style={{ marginBottom: 16, padding: 12, background: REDWOOD.neutral100, borderRadius: 6 }}>
                <Row gutter={[16, 8]}>
                  <Col span={8}>
                    <Text strong>Batch Name:</Text> {jsonPayload.batch.batchName}
                  </Col>
                  <Col span={8}>
                    <Text strong>Ledger:</Text> {jsonPayload.batch.ledgerName}
                  </Col>
                  <Col span={8}>
                    <Text strong>Period:</Text> {jsonPayload.batch.accountingPeriod}
                  </Col>
                  <Col span={8}>
                    <Text strong>Journal:</Text> {jsonPayload.header.journalName}
                  </Col>
                  <Col span={8}>
                    <Text strong>Category:</Text> {jsonPayload.header.jeCategory}
                  </Col>
                  <Col span={8}>
                    <Text strong>Currency:</Text> {jsonPayload.header.currencyCode}
                  </Col>
                  <Col span={8}>
                    <Text strong>Total Debit:</Text> <Text style={{ color: REDWOOD.success }}>{formatNumber(jsonPayload.header.runningTotalDr)}</Text>
                  </Col>
                  <Col span={8}>
                    <Text strong>Total Credit:</Text> <Text style={{ color: REDWOOD.info }}>{formatNumber(jsonPayload.header.runningTotalCr)}</Text>
                  </Col>
                  <Col span={8}>
                    <Text strong>Status:</Text> {isBalanced ? <Text style={{ color: REDWOOD.success }}>Balanced</Text> : <Text type="danger">Unbalanced</Text>}
                  </Col>
                </Row>
              </div>

              {/* JSON Code Section */}
              <div style={{ marginBottom: 8 }}>
                <Text strong style={{ fontSize: 13 }}>JSON Payload {saveResponse ? '(Sent to API):' : '(to be sent to API):'}</Text>
              </div>
              <pre
                style={{
                  background: '#1e1e1e',
                  color: '#d4d4d4',
                  padding: 16,
                  borderRadius: 6,
                  fontSize: 11,
                  lineHeight: 1.5,
                  overflow: 'auto',
                  maxHeight: saveResponse ? 200 : 'calc(100vh - 450px)',
                  fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                }}
              >
                {JSON.stringify(jsonPayload, null, 2)}
              </pre>
            </div>
          )}
        </Modal>
      </Content>
    </Layout>
  );
};

export default CreateJournal;
