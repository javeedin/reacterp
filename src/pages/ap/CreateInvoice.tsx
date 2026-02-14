import React, { useState, useMemo, useCallback } from 'react';
import {
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
  Tabs,
  message,
  DatePicker,
  InputNumber,
  Modal,
  Divider,
  Descriptions,
  Dropdown,
  Alert,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  SaveOutlined,
  CloseOutlined,
  PlusOutlined,
  DeleteOutlined,
  SearchOutlined,
  ReloadOutlined,
  FileTextOutlined,
  ShoppingCartOutlined,
  CheckCircleOutlined,
  UndoOutlined,
  DownOutlined,
  CheckSquareOutlined,
  StopOutlined,
  CalculatorOutlined,
  DollarOutlined,
  LockOutlined,
  UnlockOutlined,
  SendOutlined,
  RollbackOutlined,
  CopyOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { APEX_DB_CONFIG } from '../../config/api.config';
import AccountSelector, { validateAccountCode } from '../../components/AccountSelector';

const { Text, Title } = Typography;
const { Option } = Select;
const { TextArea } = Input;

// Oracle Redwood Color Palette
const REDWOOD = {
  primary: '#C74634',
  primaryLight: '#E85D4A',
  primaryDark: '#A33B2C',
  success: '#1D7B4D',
  warning: '#D4A800',
  info: '#0572CE',
  error: '#D93025',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral300: '#C7C7C7',
  neutral600: '#6B6B6B',
  neutral900: '#1A1A1A',
  surface: '#FFFFFF',
};

const APEX_SUPPLIERS_URL = `${APEX_DB_CONFIG.baseUrl}/suppliers`;

// Supplier record
interface SupplierRecord {
  key: string;
  supplierId: number;
  supplier: string;
  supplierNumber: string;
  alternativeName: string;
  status: string;
  supplierType: string;
  creationDate: string;
  taxpayerId: string;
}

// Unified Invoice Line - same data, different column views per tab
interface InvoiceLine {
  key: string;
  lineNumber: number;
  // Distribution columns (matching Fusion Payables)
  type: string;
  amount: number;
  distributionSet: string;
  distributionCombination: string;
  accountingDate: string;
  prorateAcrossAllItemLines: string;
  description: string;
  taxClassification: string;
  shipToLocation: string;
  // Additional distribution fields
  quantity: number;
  unitPrice: number;
  uomName: string;
  project: string;
  task: string;
  // Purchase Order columns
  poNumber: string;
  poLine: string;
  poSchedule: string;
  receiptNumber: string;
  receiptLine: string;
  consumptionAdviceNumber: string;
  consumptionAdviceLine: string;
  shipToLocation: string;
  startDate: string;
  endDate: string;
  accrualAccount: string;
}

// Currency list
const CURRENCIES = [
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'QAR', name: 'Qatari Riyal' },
  { code: 'BHD', name: 'Bahraini Dinar' },
  { code: 'KWD', name: 'Kuwaiti Dinar' },
  { code: 'OMR', name: 'Omani Rial' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'PKR', name: 'Pakistani Rupee' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'EGP', name: 'Egyptian Pound' },
  { code: 'JOD', name: 'Jordanian Dinar' },
  { code: 'LBP', name: 'Lebanese Pound' },
  { code: 'TRY', name: 'Turkish Lira' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'DKK', name: 'Danish Krone' },
  { code: 'PLN', name: 'Polish Zloty' },
  { code: 'CZK', name: 'Czech Koruna' },
  { code: 'THB', name: 'Thai Baht' },
  { code: 'PHP', name: 'Philippine Peso' },
  { code: 'IDR', name: 'Indonesian Rupiah' },
  { code: 'BRL', name: 'Brazilian Real' },
  { code: 'MXN', name: 'Mexican Peso' },
  { code: 'KRW', name: 'South Korean Won' },
  { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'RUB', name: 'Russian Ruble' },
];

// Helper function to format date
const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

// Format amount
const formatAmount = (value: number): string => {
  return new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

// Create a blank line
const createBlankLine = (lineNumber: number): InvoiceLine => ({
  key: Date.now().toString() + '-' + lineNumber,
  lineNumber,
  type: 'Item',
  amount: 0,
  distributionSet: '',
  distributionCombination: '',
  accountingDate: '',
  prorateAcrossAllItemLines: 'No',
  description: '',
  taxClassification: '',
  shipToLocation: '',
  quantity: 1,
  unitPrice: 0,
  uomName: '',
  project: '',
  task: '',
  poNumber: '',
  poLine: '',
  poSchedule: '',
  receiptNumber: '',
  receiptLine: '',
  consumptionAdviceNumber: '',
  consumptionAdviceLine: '',
  shipToLocation: '',
  startDate: '',
  endDate: '',
  accrualAccount: '',
});

interface CreateInvoiceProps {
  onClose: () => void;
  onSave?: (values: any) => void;
}

const CreateInvoice: React.FC<CreateInvoiceProps> = ({ onClose, onSave }) => {
  const [form] = Form.useForm();

  // Unified invoice lines - shared across both tabs
  const [lines, setLines] = useState<InvoiceLine[]>([createBlankLine(1)]);

  // Supplier modal
  const [supplierModalVisible, setSupplierModalVisible] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [supplierSearchText, setSupplierSearchText] = useState('');

  // Header completion tracking
  const [headerValues, setHeaderValues] = useState<Record<string, any>>({
    invoiceType: 'Standard',
    invoiceCurrency: 'AED',
  });
  const [taxRate, setTaxRate] = useState<number>(5);

  // Check if all required header fields are filled
  const isHeaderComplete = useMemo(() => {
    const requiredFields = ['businessUnit', 'invoiceNumber', 'invoiceCurrency', 'invoiceAmount', 'invoiceDate', 'supplier', 'invoiceType'];
    return requiredFields.every((field) => {
      const val = headerValues[field];
      return val !== undefined && val !== null && val !== '';
    });
  }, [headerValues]);

  // Line selection
  const [selectedLineKeys, setSelectedLineKeys] = useState<React.Key[]>([]);

  // Account Selector (Distribution Combination popup)
  const [accountSelectorVisible, setAccountSelectorVisible] = useState(false);
  const [editingLineKey, setEditingLineKey] = useState<string | null>(null);
  const [accountSelectorInitialValue, setAccountSelectorInitialValue] = useState<string | undefined>(undefined);

  // Fetch suppliers
  const fetchSuppliers = async () => {
    setSupplierLoading(true);
    try {
      const response = await fetch(APEX_SUPPLIERS_URL, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const items = data.items || data || [];
      if (Array.isArray(items)) {
        const mapped: SupplierRecord[] = items.map((item: any, index: number) => ({
          key: item.supplier_id?.toString() || index.toString(),
          supplierId: item.supplier_id,
          supplier: item.supplier || '',
          supplierNumber: item.supplier_number || '',
          alternativeName: item.alternate_name || '',
          status: item.status || '',
          supplierType: item.supplier_type || '',
          creationDate: formatDate(item.creation_date),
          taxpayerId: item.taxpayer_id || '',
        }));
        setSuppliers(mapped);
      }
    } catch (error) {
      console.error('Supplier fetch error:', error);
      message.error('Failed to fetch suppliers');
    } finally {
      setSupplierLoading(false);
    }
  };

  const openSupplierModal = () => {
    setSupplierModalVisible(true);
    setSupplierSearchText('');
    if (suppliers.length === 0) fetchSuppliers();
  };

  const handleSupplierSelect = (record: SupplierRecord) => {
    form.setFieldsValue({
      supplier: record.supplier,
      supplierNumber: record.supplierNumber,
      supplierSite: '',
    });
    setSupplierModalVisible(false);
    message.success(`Selected: ${record.supplier}`);
  };

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearchText) return suppliers;
    const search = supplierSearchText.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.supplier.toLowerCase().includes(search) ||
        s.supplierNumber.toLowerCase().includes(search) ||
        (s.alternativeName && s.alternativeName.toLowerCase().includes(search))
    );
  }, [suppliers, supplierSearchText]);

  const supplierColumns: ColumnsType<SupplierRecord> = [
    { title: 'Supplier Number', dataIndex: 'supplierNumber', key: 'supplierNumber', width: 130, sorter: (a, b) => a.supplierNumber.localeCompare(b.supplierNumber) },
    { title: 'Supplier Name', dataIndex: 'supplier', key: 'supplier', width: 280, ellipsis: true, sorter: (a, b) => a.supplier.localeCompare(b.supplier) },
    { title: 'Alternative Name', dataIndex: 'alternativeName', key: 'alternativeName', width: 200, ellipsis: true },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100, render: (status: string) => <Tag color={status === 'ACTIVE' ? 'green' : 'red'}>{status}</Tag> },
    { title: 'Taxpayer ID', dataIndex: 'taxpayerId', key: 'taxpayerId', width: 120 },
    {
      title: 'Action', key: 'action', width: 80,
      render: (_: any, record: SupplierRecord) => (
        <Button type="link" size="small" onClick={() => handleSupplierSelect(record)} style={{ color: REDWOOD.info }}>Select</Button>
      ),
    },
  ];

  // Line management
  const addLine = () => {
    const nextLine = lines.length + 1;
    setLines([...lines, createBlankLine(nextLine)]);
  };

  const removeLines = () => {
    if (selectedLineKeys.length === 0) {
      message.warning('Select lines to delete');
      return;
    }
    const filtered = lines.filter((l) => !selectedLineKeys.includes(l.key));
    const renumbered = filtered.map((l, idx) => ({ ...l, lineNumber: idx + 1 }));
    setLines(renumbered);
    setSelectedLineKeys([]);
  };

  const updateLine = useCallback((key: string, field: string, value: any) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const updated = { ...line, [field]: value };
        if (field === 'quantity' || field === 'unitPrice') {
          updated.amount = (field === 'quantity' ? value : updated.quantity) * (field === 'unitPrice' ? value : updated.unitPrice);
        }
        return updated;
      })
    );
  }, []);

  // Open account selector for a line
  const openAccountSelector = (lineKey: string, initialValue?: string) => {
    setEditingLineKey(lineKey);
    setAccountSelectorInitialValue(initialValue);
    setAccountSelectorVisible(true);
  };

  // Handle account code validation on blur
  const handleAccountBlur = async (lineKey: string, accountCode: string) => {
    if (!accountCode || accountCode.trim() === '' || !accountCode.includes('-')) return;

    try {
      const result = await validateAccountCode(accountCode);
      if (!result.segmentsLoaded) {
        message.info('Could not load segment data for validation.');
        return;
      }
      if (!result.isValid) {
        message.warning(`Invalid segment value(s): ${result.invalidSegments.join(', ')}. Please correct using the account selector.`);
        setLines((prev) =>
          prev.map((line) =>
            line.key === lineKey ? { ...line, distributionCombination: result.validatedCode } : line
          )
        );
        openAccountSelector(lineKey, result.validatedCode);
      } else {
        message.success('Account code validated successfully');
      }
    } catch (error) {
      console.error('Error validating account code:', error);
    }
  };

  // Handle account selection from popup
  const handleAccountSelect = (accountCode: string, segments: Record<string, { value: string; description: string }>) => {
    if (editingLineKey) {
      setLines((prev) =>
        prev.map((line) =>
          line.key === editingLineKey ? { ...line, distributionCombination: accountCode } : line
        )
      );
    }
    setAccountSelectorVisible(false);
    setEditingLineKey(null);
  };

  // Totals
  const linesTotal = useMemo(() => {
    return lines.reduce((sum, l) => sum + (l.amount || 0), 0);
  }, [lines]);

  // Tax total based on dynamic tax rate
  const taxTotal = useMemo(() => linesTotal * (taxRate / 100), [linesTotal, taxRate]);

  // Tally validation: header amount must equal lines total + tax
  const headerInvoiceAmount = headerValues.invoiceAmount || 0;
  const computedTotal = linesTotal + taxTotal;
  const isTallyMismatch = useMemo(() => {
    if (!isHeaderComplete) return false;
    if (linesTotal === 0) return false;
    return Math.abs(headerInvoiceAmount - computedTotal) > 0.01;
  }, [isHeaderComplete, headerInvoiceAmount, computedTotal, linesTotal]);

  // Invoice Actions dropdown menu items
  const invoiceActionItems: MenuProps['items'] = [
    {
      key: 'validate',
      icon: <CheckSquareOutlined />,
      label: 'Validate',
    },
    {
      key: 'calculateTax',
      icon: <CalculatorOutlined />,
      label: 'Calculate Tax',
    },
    { type: 'divider' },
    {
      key: 'applyPrepayment',
      icon: <DollarOutlined />,
      label: 'Apply Prepayment',
    },
    {
      key: 'placeHold',
      icon: <LockOutlined />,
      label: 'Place Hold',
    },
    {
      key: 'releaseHold',
      icon: <UnlockOutlined />,
      label: 'Release Hold',
    },
    { type: 'divider' },
    {
      key: 'initiateApproval',
      icon: <SendOutlined />,
      label: 'Initiate Approval',
    },
    {
      key: 'cancelInvoice',
      icon: <StopOutlined />,
      label: 'Cancel Invoice',
    },
    {
      key: 'reverseInvoice',
      icon: <RollbackOutlined />,
      label: 'Reverse Invoice',
    },
    { type: 'divider' },
    {
      key: 'duplicate',
      icon: <CopyOutlined />,
      label: 'Duplicate Invoice',
    },
  ];

  // Handle invoice action menu clicks
  const handleInvoiceAction = ({ key }: { key: string }) => {
    switch (key) {
      case 'validate':
        message.info('Validating invoice...');
        break;
      case 'calculateTax':
        message.info('Calculating tax...');
        break;
      case 'applyPrepayment':
        message.info('Apply prepayment...');
        break;
      case 'placeHold':
        message.info('Placing hold on invoice...');
        break;
      case 'releaseHold':
        message.info('Releasing hold...');
        break;
      case 'initiateApproval':
        message.info('Initiating approval...');
        break;
      case 'cancelInvoice':
        message.warning('Cancel invoice...');
        break;
      case 'reverseInvoice':
        message.warning('Reverse invoice...');
        break;
      case 'duplicate':
        message.info('Duplicating invoice...');
        break;
      default:
        break;
    }
  };

  // Tally check before save
  const validateTally = (): boolean => {
    if (linesTotal > 0 && Math.abs(headerInvoiceAmount - computedTotal) > 0.01) {
      message.error(
        `Invoice amount (${formatAmount(headerInvoiceAmount)}) does not match Lines + Tax total (${formatAmount(computedTotal)}). Please correct before saving.`
      );
      return false;
    }
    return true;
  };

  // Save and create next handler
  const handleSaveAndCreateNext = () => {
    form.validateFields().then((values) => {
      if (!validateTally()) return;
      const invoiceData = {
        ...values,
        invoiceDate: values.invoiceDate?.format('YYYY-MM-DD'),
        lines,
        linesTotal,
        taxTotal,
        totalAmount: computedTotal,
      };
      console.log('Invoice saved:', invoiceData);
      if (onSave) onSave(invoiceData);
      message.success('Invoice saved. Creating next...');
      // Reset form and lines for next invoice
      form.resetFields();
      setLines([createBlankLine(1)]);
      setSelectedLineKeys([]);
      setHeaderValues({ invoiceType: 'Standard', invoiceCurrency: 'AED' });
      setTaxRate(5);
    }).catch(() => {
      message.error('Please fill in required fields');
    });
  };

  // Save handler
  const handleSave = () => {
    form.validateFields().then((values) => {
      if (!validateTally()) return;
      const invoiceData = {
        ...values,
        invoiceDate: values.invoiceDate?.format('YYYY-MM-DD'),
        lines,
        linesTotal,
        taxTotal,
        totalAmount: computedTotal,
      };
      console.log('Invoice data:', invoiceData);
      if (onSave) onSave(invoiceData);
      message.success('Invoice saved successfully');
    }).catch((err) => {
      console.log('Validation failed:', err);
      message.error('Please fill in required fields');
    });
  };

  // ========== Distribution Tab Columns (matching Fusion Payables) ==========
  const distributionColumns: ColumnsType<InvoiceLine> = [
    {
      title: 'Number',
      dataIndex: 'lineNumber',
      key: 'lineNumber',
      width: 65,
      align: 'center',
      render: (val: number) => <Text style={{ fontSize: 12 }}>{val}</Text>,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (val: string, record: InvoiceLine) => (
        <Select
          size="small"
          value={val}
          onChange={(v) => updateLine(record.key, 'type', v)}
          style={{ width: '100%' }}
          variant="borderless"
        >
          <Option value="Item">Item</Option>
          <Option value="Freight">Freight</Option>
          <Option value="Miscellaneous">Miscellaneous</Option>
          <Option value="Tax">Tax</Option>
          <Option value="Prepay">Prepay</Option>
        </Select>
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 130,
      align: 'right',
      render: (val: number, record: InvoiceLine) => (
        <InputNumber
          size="small"
          value={val}
          onChange={(v) => updateLine(record.key, 'amount', v || 0)}
          min={0}
          precision={2}
          style={{ width: '100%', fontWeight: 600 }}
          variant="borderless"
        />
      ),
    },
    {
      title: 'Distribution Set',
      dataIndex: 'distributionSet',
      key: 'distributionSet',
      width: 160,
      render: (val: string, record: InvoiceLine) => (
        <Input
          size="small"
          value={val}
          onChange={(e) => updateLine(record.key, 'distributionSet', e.target.value)}
          variant="borderless"
          placeholder=""
          suffix={<SearchOutlined style={{ color: REDWOOD.neutral300, fontSize: 11 }} />}
        />
      ),
    },
    {
      title: 'Distribution Combination',
      dataIndex: 'distributionCombination',
      key: 'distributionCombination',
      width: 250,
      render: (val: string, record: InvoiceLine) => (
        <Input
          size="small"
          value={val}
          onChange={(e) => updateLine(record.key, 'distributionCombination', e.target.value)}
          onBlur={(e) => handleAccountBlur(record.key, e.target.value)}
          placeholder="e.g. 01-000-2100-0000-000"
          variant="borderless"
          suffix={
            <SearchOutlined
              style={{ color: REDWOOD.info, fontSize: 12, cursor: 'pointer' }}
              onClick={() => openAccountSelector(record.key, val)}
            />
          }
        />
      ),
    },
    {
      title: 'Accounting Date',
      dataIndex: 'accountingDate',
      key: 'accountingDate',
      width: 140,
      render: (val: string, record: InvoiceLine) => (
        <Input
          size="small"
          value={val}
          onChange={(e) => updateLine(record.key, 'accountingDate', e.target.value)}
          variant="borderless"
          placeholder="dd-mmm-yyyy"
        />
      ),
    },
    {
      title: 'Prorate Across All Item Lines',
      dataIndex: 'prorateAcrossAllItemLines',
      key: 'prorateAcrossAllItemLines',
      width: 200,
      render: (val: string, record: InvoiceLine) => (
        <Select
          size="small"
          value={val || 'No'}
          onChange={(v) => updateLine(record.key, 'prorateAcrossAllItemLines', v)}
          style={{ width: '100%' }}
          variant="borderless"
        >
          <Option value="Yes">Yes</Option>
          <Option value="No">No</Option>
        </Select>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 220,
      render: (val: string, record: InvoiceLine) => (
        <Input
          size="small"
          value={val}
          onChange={(e) => updateLine(record.key, 'description', e.target.value)}
          placeholder=""
          variant="borderless"
        />
      ),
    },
    {
      title: 'Tax Classification',
      dataIndex: 'taxClassification',
      key: 'taxClassification',
      width: 160,
      render: (val: string, record: InvoiceLine) => (
        <Select
          size="small"
          value={val || undefined}
          onChange={(v) => updateLine(record.key, 'taxClassification', v)}
          style={{ width: '100%' }}
          variant="borderless"
          placeholder=""
          allowClear
        >
          <Option value="VAT 5%">VAT 5%</Option>
          <Option value="Zero Rated">Zero Rated</Option>
          <Option value="Exempt">Exempt</Option>
          <Option value="Reverse Charge">Reverse Charge</Option>
          <Option value="Out of Scope">Out of Scope</Option>
        </Select>
      ),
    },
    {
      title: 'Ship-to Location',
      dataIndex: 'shipToLocation',
      key: 'shipToLocation',
      width: 160,
      render: (val: string, record: InvoiceLine) => (
        <Input
          size="small"
          value={val}
          onChange={(e) => updateLine(record.key, 'shipToLocation', e.target.value)}
          variant="borderless"
          placeholder=""
          suffix={<SearchOutlined style={{ color: REDWOOD.neutral300, fontSize: 11 }} />}
        />
      ),
    },
  ];

  // ========== Purchase Orders Tab Columns ==========
  const poColumns: ColumnsType<InvoiceLine> = [
    {
      title: 'Line',
      dataIndex: 'lineNumber',
      key: 'lineNumber',
      width: 50,
      align: 'center',
      render: (val: number) => <Text type="secondary" style={{ fontSize: 12 }}>{val}</Text>,
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 130,
      align: 'right',
      render: (val: number) => <Text strong style={{ fontSize: 12 }}>{formatAmount(val)}</Text>,
    },
    {
      title: 'PO Number',
      dataIndex: 'poNumber',
      key: 'poNumber',
      width: 130,
      render: (val: string, record: InvoiceLine) => (
        <Input size="small" value={val} onChange={(e) => updateLine(record.key, 'poNumber', e.target.value)} variant="borderless" placeholder="" suffix={<SearchOutlined style={{ color: REDWOOD.neutral300, fontSize: 11 }} />} />
      ),
    },
    {
      title: 'PO Line',
      dataIndex: 'poLine',
      key: 'poLine',
      width: 80,
      render: (val: string, record: InvoiceLine) => (
        <Input size="small" value={val} onChange={(e) => updateLine(record.key, 'poLine', e.target.value)} variant="borderless" />
      ),
    },
    {
      title: 'PO Schedule',
      dataIndex: 'poSchedule',
      key: 'poSchedule',
      width: 100,
      render: (val: string, record: InvoiceLine) => (
        <Input size="small" value={val} onChange={(e) => updateLine(record.key, 'poSchedule', e.target.value)} variant="borderless" />
      ),
    },
    {
      title: 'Receipt Number',
      dataIndex: 'receiptNumber',
      key: 'receiptNumber',
      width: 130,
      render: (val: string, record: InvoiceLine) => (
        <Input size="small" value={val} onChange={(e) => updateLine(record.key, 'receiptNumber', e.target.value)} variant="borderless" />
      ),
    },
    {
      title: 'Receipt Line',
      dataIndex: 'receiptLine',
      key: 'receiptLine',
      width: 100,
      render: (val: string, record: InvoiceLine) => (
        <Input size="small" value={val} onChange={(e) => updateLine(record.key, 'receiptLine', e.target.value)} variant="borderless" />
      ),
    },
    {
      title: 'Consumption Advice Number',
      dataIndex: 'consumptionAdviceNumber',
      key: 'consumptionAdviceNumber',
      width: 190,
      render: (val: string, record: InvoiceLine) => (
        <Input size="small" value={val} onChange={(e) => updateLine(record.key, 'consumptionAdviceNumber', e.target.value)} variant="borderless" />
      ),
    },
    {
      title: 'Consumption Advice Line',
      dataIndex: 'consumptionAdviceLine',
      key: 'consumptionAdviceLine',
      width: 170,
      render: (val: string, record: InvoiceLine) => (
        <Input size="small" value={val} onChange={(e) => updateLine(record.key, 'consumptionAdviceLine', e.target.value)} variant="borderless" />
      ),
    },
    {
      title: 'Ship-to Location',
      dataIndex: 'shipToLocation',
      key: 'shipToLocation',
      width: 150,
      render: (val: string, record: InvoiceLine) => (
        <Input size="small" value={val} onChange={(e) => updateLine(record.key, 'shipToLocation', e.target.value)} variant="borderless" suffix={<SearchOutlined style={{ color: REDWOOD.neutral300, fontSize: 11 }} />} />
      ),
    },
    {
      title: 'Start Date',
      dataIndex: 'startDate',
      key: 'startDate',
      width: 120,
      render: (val: string, record: InvoiceLine) => (
        <Input size="small" value={val} onChange={(e) => updateLine(record.key, 'startDate', e.target.value)} variant="borderless" placeholder="dd-mmm-yyyy" />
      ),
    },
    {
      title: 'End Date',
      dataIndex: 'endDate',
      key: 'endDate',
      width: 120,
      render: (val: string, record: InvoiceLine) => (
        <Input size="small" value={val} onChange={(e) => updateLine(record.key, 'endDate', e.target.value)} variant="borderless" placeholder="dd-mmm-yyyy" />
      ),
    },
  ];

  // Row selection config (shared)
  const rowSelection = {
    selectedRowKeys: selectedLineKeys,
    onChange: (keys: React.Key[]) => setSelectedLineKeys(keys),
  };

  return (
    <div style={{ background: REDWOOD.neutral100, minHeight: 'calc(100vh - 200px)' }}>
      {/* Action Bar - matching Fusion Payables layout */}
      <div
        style={{
          padding: '8px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <Space size={12}>
          <Title level={5} style={{ margin: 0 }}>
            <FileTextOutlined style={{ marginRight: 8, color: REDWOOD.primary }} />
            Create Invoice
          </Title>
        </Space>

        <Space size={8}>
          {/* Invoice Actions Dropdown */}
          <Dropdown
            menu={{
              items: invoiceActionItems,
              onClick: handleInvoiceAction,
            }}
            trigger={['click']}
          >
            <Button style={{ fontWeight: 500 }}>
              Invoice Actions <DownOutlined style={{ fontSize: 10 }} />
            </Button>
          </Dropdown>
          <Button onClick={handleSaveAndCreateNext}>
            Save and Create Next
          </Button>
          <Button
            type="primary"
            onClick={handleSave}
            style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
          >
            Save
          </Button>
          <Button
            type="primary"
            onClick={() => { handleSave(); onClose(); }}
            style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
          >
            Save and Close
          </Button>
          <Button onClick={onClose}>
            Cancel
          </Button>
        </Space>
      </div>

      <div style={{ padding: '16px 24px' }}>
        {/* ========== INVOICE HEADER ========== */}
        <Card
          style={{
            marginBottom: 16,
            borderRadius: 8,
            border: `1px solid ${REDWOOD.neutral200}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ fontSize: 14, color: REDWOOD.neutral900 }}>Invoice Header</Text>
          </div>
          <Form
            form={form}
            layout="horizontal"
            labelCol={{ span: 9 }}
            wrapperCol={{ span: 15 }}
            size="small"
            initialValues={{
              invoiceType: 'Standard',
              invoiceCurrency: 'AED',
              paymentCurrency: 'AED',
              legalEntity: '',
              payGroup: '',
              payAlone: 'No',
              calculateTax: 'Yes',
            }}
            onValuesChange={(_, allValues) => setHeaderValues(allValues)}
          >
            <Row gutter={32}>
              {/* Column 1 */}
              <Col span={8}>
                <Form.Item
                  label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Business Unit</Text>}
                  name="businessUnit"
                  rules={[{ required: true, message: 'Required' }]}
                  style={{ marginBottom: 10 }}
                >
                  <Select placeholder="Select Business Unit" showSearch allowClear>
                    <Option value="BUIMERC CORP FZE_JAFZA">BUIMERC CORP FZE_JAFZA</Option>
                    <Option value="BUIMERC CORP_DIFC_INVST">BUIMERC CORP_DIFC_INVST</Option>
                  </Select>
                </Form.Item>
                <Form.Item
                  label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Invoice Number</Text>}
                  name="invoiceNumber"
                  rules={[{ required: true, message: 'Required' }]}
                  style={{ marginBottom: 10 }}
                >
                  <Input placeholder="Enter invoice number" />
                </Form.Item>
                <Form.Item
                  label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Invoice Currency</Text>}
                  name="invoiceCurrency"
                  rules={[{ required: true, message: 'Required' }]}
                  style={{ marginBottom: 10 }}
                >
                  <Select showSearch optionFilterProp="children" placeholder="Select currency">
                    {CURRENCIES.map((c) => (
                      <Option key={c.code} value={c.code}>{c.code} - {c.name}</Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item
                  label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Amount</Text>}
                  name="invoiceAmount"
                  rules={[{ required: true, message: 'Required' }]}
                  style={{ marginBottom: 10 }}
                >
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder="0.00"
                    precision={2}
                    formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(value) => value!.replace(/,/g, '') as any}
                  />
                </Form.Item>
                <Form.Item
                  label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Invoice Date</Text>}
                  name="invoiceDate"
                  rules={[{ required: true, message: 'Required' }]}
                  style={{ marginBottom: 10 }}
                >
                  <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" />
                </Form.Item>
                <Form.Item
                  label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Legal Entity</Text>}
                  name="legalEntity"
                  style={{ marginBottom: 10 }}
                >
                  <Select placeholder="Select entity" allowClear showSearch>
                    <Option value="BUIMERC CORP FZE">BUIMERC CORP FZE</Option>
                    <Option value="BUIMERC CORP DIFC">BUIMERC CORP DIFC</Option>
                  </Select>
                </Form.Item>
              </Col>

              {/* Column 2 */}
              <Col span={8}>
                <Form.Item
                  label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Supplier</Text>}
                  name="supplier"
                  rules={[{ required: true, message: 'Required' }]}
                  style={{ marginBottom: 10 }}
                >
                  <Input
                    placeholder="Search supplier..."
                    readOnly
                    suffix={
                      <SearchOutlined
                        style={{ color: REDWOOD.info, cursor: 'pointer', fontSize: 14 }}
                        onClick={openSupplierModal}
                      />
                    }
                    onClick={openSupplierModal}
                    style={{ cursor: 'pointer' }}
                  />
                </Form.Item>
                <Form.Item name="supplierNumber" hidden>
                  <Input />
                </Form.Item>
                <Form.Item
                  label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Supplier Site</Text>}
                  name="supplierSite"
                  style={{ marginBottom: 10 }}
                >
                  <Select placeholder="Select site" allowClear>
                    <Option value="SHARJAH">SHARJAH</Option>
                    <Option value="DUBAI">DUBAI</Option>
                    <Option value="ABU DHABI">ABU DHABI</Option>
                  </Select>
                </Form.Item>
                <Form.Item
                  label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Type</Text>}
                  name="invoiceType"
                  rules={[{ required: true, message: 'Required' }]}
                  style={{ marginBottom: 10 }}
                >
                  <Select>
                    <Option value="Standard">Standard</Option>
                    <Option value="Prepayment">Prepayment</Option>
                    <Option value="Debit Memo">Debit Memo</Option>
                    <Option value="Credit Memo">Credit Memo</Option>
                  </Select>
                </Form.Item>
                <Form.Item
                  label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Payment Currency</Text>}
                  name="paymentCurrency"
                  style={{ marginBottom: 10 }}
                >
                  <Select showSearch optionFilterProp="children">
                    {CURRENCIES.map((c) => (
                      <Option key={c.code} value={c.code}>{c.code} - {c.name}</Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item
                  label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Pay Group</Text>}
                  name="payGroup"
                  style={{ marginBottom: 10 }}
                >
                  <Select placeholder="Select pay group" allowClear>
                    <Option value="Standard">Standard</Option>
                    <Option value="Urgent">Urgent</Option>
                    <Option value="Manual">Manual</Option>
                  </Select>
                </Form.Item>
                <Form.Item
                  label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Pay Alone</Text>}
                  name="payAlone"
                  style={{ marginBottom: 10 }}
                >
                  <Select>
                    <Option value="No">No</Option>
                    <Option value="Yes">Yes</Option>
                  </Select>
                </Form.Item>
              </Col>

              {/* Column 3 */}
              <Col span={8}>
                <Form.Item
                  label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Description</Text>}
                  name="description"
                  style={{ marginBottom: 10 }}
                >
                  <TextArea rows={2} placeholder="Enter description" />
                </Form.Item>
                <Form.Item
                  label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Invoice Group</Text>}
                  name="invoiceGroup"
                  style={{ marginBottom: 10 }}
                >
                  <Input placeholder="Enter group" />
                </Form.Item>
                <Form.Item
                  label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Payment Terms</Text>}
                  name="paymentTerms"
                  style={{ marginBottom: 10 }}
                >
                  <Select placeholder="Select terms" allowClear showSearch>
                    <Option value="Immediate">Immediate</Option>
                    <Option value="Net 15">Net 15</Option>
                    <Option value="Net 30">Net 30</Option>
                    <Option value="Net 45">Net 45</Option>
                    <Option value="Net 60">Net 60</Option>
                    <Option value="Net 90">Net 90</Option>
                  </Select>
                </Form.Item>
                <Form.Item
                  label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Terms Date</Text>}
                  name="termsDate"
                  style={{ marginBottom: 10 }}
                >
                  <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" />
                </Form.Item>
                <Form.Item
                  label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Goods Received Date</Text>}
                  name="goodsReceivedDate"
                  style={{ marginBottom: 10 }}
                >
                  <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" />
                </Form.Item>
                <Form.Item
                  label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Calculate Tax</Text>}
                  name="calculateTax"
                  style={{ marginBottom: 10 }}
                >
                  <Select>
                    <Option value="Yes">Yes</Option>
                    <Option value="No">No</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Card>

        {/* ========== INVOICE LINES ========== */}
        <Card
          style={{
            marginBottom: 16,
            borderRadius: 8,
            border: `1px solid ${!isHeaderComplete ? REDWOOD.neutral300 : REDWOOD.neutral200}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            position: 'relative',
          }}
        >
          {/* Lock overlay when header is incomplete */}
          {!isHeaderComplete && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(255, 255, 255, 0.85)',
                zIndex: 5,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                cursor: 'not-allowed',
              }}
            >
              <LockOutlined style={{ fontSize: 32, color: REDWOOD.neutral300, marginBottom: 12 }} />
              <Text style={{ fontSize: 14, color: REDWOOD.neutral600, fontWeight: 500 }}>
                Complete the Invoice Header to enter lines
              </Text>
              <Text type="secondary" style={{ fontSize: 12, marginTop: 4 }}>
                Fill in Business Unit, Invoice Number, Currency, Amount, Date, Supplier, and Type
              </Text>
            </div>
          )}

          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong style={{ fontSize: 14, color: REDWOOD.neutral900 }}>
              Invoice Lines
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>({lines.length} line{lines.length !== 1 ? 's' : ''})</Text>
              {isHeaderComplete && (
                <Tag color="green" style={{ marginLeft: 8, fontSize: 10 }}>
                  <CheckCircleOutlined /> Header Complete
                </Tag>
              )}
            </Text>
            <Space>
              <Button
                size="small"
                type="primary"
                icon={<PlusOutlined />}
                onClick={addLine}
                disabled={!isHeaderComplete}
                style={{ background: isHeaderComplete ? REDWOOD.info : undefined, borderColor: isHeaderComplete ? REDWOOD.info : undefined, fontSize: 12 }}
              >
                Add Line
              </Button>
              <Button
                size="small"
                icon={<DeleteOutlined />}
                danger
                onClick={removeLines}
                disabled={!isHeaderComplete || selectedLineKeys.length === 0}
                style={{ fontSize: 12 }}
              >
                Delete {selectedLineKeys.length > 0 ? `(${selectedLineKeys.length})` : ''}
              </Button>
            </Space>
          </div>

          <Tabs
            defaultActiveKey="distribution"
            size="small"
            items={[
              {
                key: 'distribution',
                label: (
                  <Space size={4}>
                    <FileTextOutlined />
                    <span>Distribution</span>
                  </Space>
                ),
                children: (
                  <Table
                    columns={distributionColumns}
                    dataSource={lines}
                    size="small"
                    pagination={false}
                    scroll={{ x: 1600 }}
                    rowSelection={rowSelection}
                    summary={() => (
                      <Table.Summary fixed>
                        <Table.Summary.Row>
                          <Table.Summary.Cell index={0} colSpan={2}>
                            <Text strong style={{ fontSize: 12, paddingLeft: 8 }}>Total</Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={2} align="right">
                            <Text strong style={{ fontSize: 13, color: REDWOOD.primary }}>
                              {formatAmount(linesTotal)}
                            </Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={3} colSpan={8} />
                        </Table.Summary.Row>
                      </Table.Summary>
                    )}
                  />
                ),
              },
              {
                key: 'purchaseOrders',
                label: (
                  <Space size={4}>
                    <ShoppingCartOutlined />
                    <span>Purchase Orders</span>
                  </Space>
                ),
                children: (
                  <Table
                    columns={poColumns}
                    dataSource={lines}
                    size="small"
                    pagination={false}
                    scroll={{ x: 1500 }}
                    rowSelection={rowSelection}
                    summary={() => (
                      <Table.Summary fixed>
                        <Table.Summary.Row>
                          <Table.Summary.Cell index={0}>
                            <Text strong style={{ fontSize: 12, paddingLeft: 8 }}>Total</Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={1} align="right">
                            <Text strong style={{ fontSize: 13, color: REDWOOD.primary }}>
                              {formatAmount(linesTotal)}
                            </Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={2} colSpan={10} />
                        </Table.Summary.Row>
                      </Table.Summary>
                    )}
                  />
                ),
              },
            ]}
          />
        </Card>

        {/* ========== TAXES & TOTALS ========== */}
        <Row gutter={16}>
          {/* Taxes */}
          <Col span={12}>
            <Card
              style={{
                borderRadius: 8,
                border: `1px solid ${REDWOOD.neutral200}`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                height: '100%',
              }}
            >
              <div style={{ marginBottom: 12 }}>
                <Text strong style={{ fontSize: 14, color: REDWOOD.neutral900 }}>Taxes</Text>
              </div>
              <Descriptions
                column={1}
                size="small"
                labelStyle={{ fontSize: 12, color: REDWOOD.neutral600, width: 180 }}
                contentStyle={{ fontSize: 12 }}
              >
                <Descriptions.Item label="Tax Classification">
                  <Select size="small" style={{ width: 200 }} placeholder="Select" defaultValue="">
                    <Option value="">None</Option>
                    <Option value="standard_vat">Standard VAT (5%)</Option>
                    <Option value="zero_rated">Zero Rated</Option>
                    <Option value="exempt">Exempt</Option>
                    <Option value="reverse_charge">Reverse Charge</Option>
                    <Option value="out_of_scope">Out of Scope</Option>
                  </Select>
                </Descriptions.Item>
                <Descriptions.Item label="Tax Rate">
                  <InputNumber size="small" style={{ width: 100 }} value={taxRate} onChange={(v) => setTaxRate(v || 0)} min={0} max={100} precision={2} addonAfter="%" />
                </Descriptions.Item>
                <Descriptions.Item label="Tax Amount">
                  <Text style={{ fontSize: 13 }}>{formatAmount(taxTotal)}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Withholding Tax Group">
                  <Select size="small" style={{ width: 200 }} placeholder="Select" allowClear>
                    <Option value="standard">Standard</Option>
                    <Option value="none">None</Option>
                  </Select>
                </Descriptions.Item>
                <Descriptions.Item label="Self-Assessed Tax">
                  <Select size="small" style={{ width: 100 }} defaultValue="No">
                    <Option value="Yes">Yes</Option>
                    <Option value="No">No</Option>
                  </Select>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>

          {/* Totals */}
          <Col span={12}>
            <Card
              style={{
                borderRadius: 8,
                border: `1px solid ${REDWOOD.neutral200}`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                height: '100%',
              }}
            >
              <div style={{ marginBottom: 12 }}>
                <Text strong style={{ fontSize: 14, color: REDWOOD.neutral900 }}>Totals</Text>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Tally mismatch warning */}
                {isTallyMismatch && (
                  <Alert
                    type="warning"
                    showIcon
                    icon={<WarningOutlined />}
                    message={
                      <span style={{ fontSize: 12 }}>
                        Header amount (<strong>{formatAmount(headerInvoiceAmount)}</strong>) does not match
                        Lines + Tax total (<strong>{formatAmount(computedTotal)}</strong>).
                        Difference: <strong style={{ color: REDWOOD.error }}>{formatAmount(Math.abs(headerInvoiceAmount - computedTotal))}</strong>
                      </span>
                    }
                    style={{ marginBottom: 4, borderRadius: 6 }}
                  />
                )}
                <Row justify="space-between" align="middle">
                  <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Header Invoice Amount</Text>
                  <Text style={{ fontSize: 14, fontWeight: 500, color: isTallyMismatch ? REDWOOD.error : undefined }}>
                    {formatAmount(headerInvoiceAmount)}
                  </Text>
                </Row>
                <Divider style={{ margin: '4px 0' }} />
                <Row justify="space-between" align="middle">
                  <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Lines Total</Text>
                  <Text style={{ fontSize: 14, fontWeight: 500 }}>{formatAmount(linesTotal)}</Text>
                </Row>
                <Row justify="space-between" align="middle">
                  <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Tax Total ({taxRate}%)</Text>
                  <Text style={{ fontSize: 14, fontWeight: 500 }}>{formatAmount(taxTotal)}</Text>
                </Row>
                <Divider style={{ margin: '4px 0' }} />
                <Row justify="space-between" align="middle">
                  <Text strong style={{ fontSize: 13 }}>Computed Total (Lines + Tax)</Text>
                  <Text strong style={{ fontSize: 18, color: isTallyMismatch ? REDWOOD.error : REDWOOD.primary }}>
                    {formatAmount(computedTotal)}
                    {isTallyMismatch && <ExclamationCircleOutlined style={{ marginLeft: 6, fontSize: 14 }} />}
                  </Text>
                </Row>
                <Divider style={{ margin: '4px 0' }} />
                <Row justify="space-between" align="middle">
                  <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Amount Applicable to Discount</Text>
                  <Text style={{ fontSize: 13 }}>0.00</Text>
                </Row>
                <Row justify="space-between" align="middle">
                  <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Prepayment Applied</Text>
                  <Text style={{ fontSize: 13 }}>0.00</Text>
                </Row>
                <Row justify="space-between" align="middle">
                  <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Amount Withheld</Text>
                  <Text style={{ fontSize: 13 }}>0.00</Text>
                </Row>
                <Divider style={{ margin: '4px 0' }} />
                <Row
                  justify="space-between"
                  align="middle"
                  style={{
                    padding: '8px 12px',
                    background: isTallyMismatch ? '#fff7e6' : REDWOOD.neutral100,
                    borderRadius: 6,
                    border: `1px solid ${isTallyMismatch ? '#ffd591' : REDWOOD.neutral200}`,
                  }}
                >
                  <Text strong style={{ fontSize: 14 }}>Amount Due</Text>
                  <Text strong style={{ fontSize: 20, color: isTallyMismatch ? REDWOOD.warning : REDWOOD.success }}>
                    {formatAmount(computedTotal)}
                  </Text>
                </Row>
              </div>
            </Card>
          </Col>
        </Row>
      </div>

      {/* ========== SUPPLIER SEARCH MODAL ========== */}
      <Modal
        title={
          <Space>
            <SearchOutlined style={{ color: REDWOOD.info }} />
            <span>Search Suppliers</span>
          </Space>
        }
        open={supplierModalVisible}
        onCancel={() => setSupplierModalVisible(false)}
        footer={null}
        width={900}
        styles={{ body: { padding: '12px 24px' } }}
      >
        <div style={{ marginBottom: 12 }}>
          <Input
            placeholder="Search by supplier name, number, or alternate name..."
            prefix={<SearchOutlined style={{ color: REDWOOD.neutral300 }} />}
            value={supplierSearchText}
            onChange={(e) => setSupplierSearchText(e.target.value)}
            allowClear
            size="middle"
            style={{ marginBottom: 8 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {filteredSuppliers.length} supplier{filteredSuppliers.length !== 1 ? 's' : ''} found
            </Text>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={fetchSuppliers}
              loading={supplierLoading}
            >
              Refresh
            </Button>
          </div>
        </div>
        <Table
          columns={supplierColumns}
          dataSource={filteredSuppliers}
          loading={supplierLoading}
          size="small"
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}` }}
          scroll={{ y: 400 }}
          onRow={(record) => ({
            onDoubleClick: () => handleSupplierSelect(record),
            style: { cursor: 'pointer' },
          })}
        />
      </Modal>

      {/* ========== ACCOUNT SELECTOR MODAL (Distribution Combination) ========== */}
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
        initialValue={accountSelectorInitialValue ?? (editingLineKey ? lines.find((l) => l.key === editingLineKey)?.distributionCombination : undefined)}
      />

      <style>{`
        .ant-table-thead > tr > th {
          background: ${REDWOOD.neutral100} !important;
          font-weight: 600;
          font-size: 11px;
          padding: 6px 8px !important;
          color: ${REDWOOD.neutral600};
        }
        .ant-table-tbody > tr > td {
          font-size: 12px;
          padding: 4px 8px !important;
        }
        .ant-input-number-borderless,
        .ant-input-borderless,
        .ant-select-borderless .ant-select-selector {
          background: transparent !important;
        }
        .ant-table-tbody > tr:hover > td {
          background: #fef7f6 !important;
        }
      `}</style>
    </div>
  );
};

export default CreateInvoice;
