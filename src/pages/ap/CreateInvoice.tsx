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
} from 'antd';
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
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { APEX_DB_CONFIG } from '../../config/api.config';

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

// Distribution line
interface DistributionLine {
  key: string;
  lineNumber: number;
  type: string;
  amount: number;
  quantity: number;
  unitPrice: number;
  description: string;
  poNumber: string;
  poLineNumber: string;
  distributionCombination: string;
  project: string;
  task: string;
}

// Purchase order line
interface PurchaseOrderLine {
  key: string;
  lineNumber: number;
  poNumber: string;
  poLine: number;
  poSchedule: number;
  itemDescription: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  receiptNumber: string;
  receiptLine: number;
  uom: string;
  matchType: string;
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

interface CreateInvoiceProps {
  onClose: () => void;
  onSave?: (values: any) => void;
}

const CreateInvoice: React.FC<CreateInvoiceProps> = ({ onClose, onSave }) => {
  const [form] = Form.useForm();

  // Distribution lines
  const [distributionLines, setDistributionLines] = useState<DistributionLine[]>([
    {
      key: '1',
      lineNumber: 1,
      type: 'Item',
      amount: 0,
      quantity: 1,
      unitPrice: 0,
      description: '',
      poNumber: '',
      poLineNumber: '',
      distributionCombination: '',
      project: '',
      task: '',
    },
  ]);

  // Purchase order lines
  const [poLines, setPOLines] = useState<PurchaseOrderLine[]>([]);

  // Supplier modal
  const [supplierModalVisible, setSupplierModalVisible] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [supplierSearchText, setSupplierSearchText] = useState('');

  // Line editing
  const [editingDistKey, setEditingDistKey] = useState<string | null>(null);
  const [selectedDistKeys, setSelectedDistKeys] = useState<React.Key[]>([]);
  const [selectedPOKeys, setSelectedPOKeys] = useState<React.Key[]>([]);

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

  // Distribution line management
  const addDistributionLine = () => {
    const nextLine = distributionLines.length + 1;
    setDistributionLines([
      ...distributionLines,
      {
        key: Date.now().toString(),
        lineNumber: nextLine,
        type: 'Item',
        amount: 0,
        quantity: 1,
        unitPrice: 0,
        description: '',
        poNumber: '',
        poLineNumber: '',
        distributionCombination: '',
        project: '',
        task: '',
      },
    ]);
  };

  const removeDistributionLines = () => {
    if (selectedDistKeys.length === 0) {
      message.warning('Select lines to delete');
      return;
    }
    const filtered = distributionLines.filter((l) => !selectedDistKeys.includes(l.key));
    // Re-number lines
    const renumbered = filtered.map((l, idx) => ({ ...l, lineNumber: idx + 1 }));
    setDistributionLines(renumbered);
    setSelectedDistKeys([]);
  };

  const updateDistributionLine = useCallback((key: string, field: string, value: any) => {
    setDistributionLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const updated = { ...line, [field]: value };
        // Auto-compute amount
        if (field === 'quantity' || field === 'unitPrice') {
          updated.amount = (field === 'quantity' ? value : updated.quantity) * (field === 'unitPrice' ? value : updated.unitPrice);
        }
        return updated;
      })
    );
  }, []);

  // Totals
  const distributionTotal = useMemo(() => {
    return distributionLines.reduce((sum, l) => sum + (l.amount || 0), 0);
  }, [distributionLines]);

  const poTotal = useMemo(() => {
    return poLines.reduce((sum, l) => sum + (l.amount || 0), 0);
  }, [poLines]);

  // Save handler
  const handleSave = () => {
    form.validateFields().then((values) => {
      const invoiceData = {
        ...values,
        invoiceDate: values.invoiceDate?.format('YYYY-MM-DD'),
        distributionLines,
        purchaseOrderLines: poLines,
        totalAmount: distributionTotal + poTotal,
      };
      console.log('Invoice data:', invoiceData);
      if (onSave) onSave(invoiceData);
      message.success('Invoice saved successfully');
    }).catch((err) => {
      console.log('Validation failed:', err);
      message.error('Please fill in required fields');
    });
  };

  // Distribution columns
  const distributionColumns: ColumnsType<DistributionLine> = [
    {
      title: 'Line',
      dataIndex: 'lineNumber',
      key: 'lineNumber',
      width: 55,
      align: 'center',
      render: (val: number) => <Text type="secondary" style={{ fontSize: 12 }}>{val}</Text>,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 110,
      render: (val: string, record: DistributionLine) => (
        <Select
          size="small"
          value={val}
          onChange={(v) => updateDistributionLine(record.key, 'type', v)}
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
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 220,
      render: (val: string, record: DistributionLine) => (
        <Input
          size="small"
          value={val}
          onChange={(e) => updateDistributionLine(record.key, 'description', e.target.value)}
          placeholder="Enter description"
          variant="borderless"
        />
      ),
    },
    {
      title: 'PO Number',
      dataIndex: 'poNumber',
      key: 'poNumber',
      width: 120,
      render: (val: string, record: DistributionLine) => (
        <Input
          size="small"
          value={val}
          onChange={(e) => updateDistributionLine(record.key, 'poNumber', e.target.value)}
          placeholder=""
          variant="borderless"
        />
      ),
    },
    {
      title: 'PO Line',
      dataIndex: 'poLineNumber',
      key: 'poLineNumber',
      width: 80,
      render: (val: string, record: DistributionLine) => (
        <Input
          size="small"
          value={val}
          onChange={(e) => updateDistributionLine(record.key, 'poLineNumber', e.target.value)}
          variant="borderless"
        />
      ),
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 90,
      align: 'right',
      render: (val: number, record: DistributionLine) => (
        <InputNumber
          size="small"
          value={val}
          onChange={(v) => updateDistributionLine(record.key, 'quantity', v || 0)}
          min={0}
          style={{ width: '100%' }}
          variant="borderless"
        />
      ),
    },
    {
      title: 'Unit Price',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 120,
      align: 'right',
      render: (val: number, record: DistributionLine) => (
        <InputNumber
          size="small"
          value={val}
          onChange={(v) => updateDistributionLine(record.key, 'unitPrice', v || 0)}
          min={0}
          precision={2}
          style={{ width: '100%' }}
          variant="borderless"
        />
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 130,
      align: 'right',
      render: (val: number, record: DistributionLine) => (
        <InputNumber
          size="small"
          value={val}
          onChange={(v) => updateDistributionLine(record.key, 'amount', v || 0)}
          min={0}
          precision={2}
          style={{ width: '100%', fontWeight: 600 }}
          variant="borderless"
        />
      ),
    },
    {
      title: 'Distribution Combination',
      dataIndex: 'distributionCombination',
      key: 'distributionCombination',
      width: 200,
      render: (val: string, record: DistributionLine) => (
        <Input
          size="small"
          value={val}
          onChange={(e) => updateDistributionLine(record.key, 'distributionCombination', e.target.value)}
          placeholder="e.g. 01-000-2100-0000-000"
          variant="borderless"
          suffix={<SearchOutlined style={{ color: REDWOOD.neutral300, fontSize: 11 }} />}
        />
      ),
    },
    {
      title: 'Project',
      dataIndex: 'project',
      key: 'project',
      width: 130,
      render: (val: string, record: DistributionLine) => (
        <Input
          size="small"
          value={val}
          onChange={(e) => updateDistributionLine(record.key, 'project', e.target.value)}
          variant="borderless"
        />
      ),
    },
    {
      title: 'Task',
      dataIndex: 'task',
      key: 'task',
      width: 120,
      render: (val: string, record: DistributionLine) => (
        <Input
          size="small"
          value={val}
          onChange={(e) => updateDistributionLine(record.key, 'task', e.target.value)}
          variant="borderless"
        />
      ),
    },
  ];

  // Purchase order columns
  const poColumns: ColumnsType<PurchaseOrderLine> = [
    {
      title: 'Line',
      dataIndex: 'lineNumber',
      key: 'lineNumber',
      width: 55,
      align: 'center',
      render: (val: number) => <Text type="secondary" style={{ fontSize: 12 }}>{val}</Text>,
    },
    {
      title: 'PO Number',
      dataIndex: 'poNumber',
      key: 'poNumber',
      width: 130,
      render: (val: string) => <Text style={{ color: REDWOOD.info }}>{val}</Text>,
    },
    { title: 'PO Line', dataIndex: 'poLine', key: 'poLine', width: 80, align: 'center' },
    { title: 'PO Schedule', dataIndex: 'poSchedule', key: 'poSchedule', width: 100, align: 'center' },
    { title: 'Item Description', dataIndex: 'itemDescription', key: 'itemDescription', width: 250, ellipsis: true },
    { title: 'UOM', dataIndex: 'uom', key: 'uom', width: 70, align: 'center' },
    { title: 'Quantity', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'right' },
    {
      title: 'Unit Price',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 120,
      align: 'right',
      render: (val: number) => formatAmount(val),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 130,
      align: 'right',
      render: (val: number) => <Text strong>{formatAmount(val)}</Text>,
    },
    { title: 'Receipt Number', dataIndex: 'receiptNumber', key: 'receiptNumber', width: 130 },
    { title: 'Receipt Line', dataIndex: 'receiptLine', key: 'receiptLine', width: 100, align: 'center' },
    {
      title: 'Match Type',
      dataIndex: 'matchType',
      key: 'matchType',
      width: 110,
      render: (val: string) => <Tag color={val === '2-Way' ? 'blue' : val === '3-Way' ? 'green' : 'default'}>{val || '-'}</Tag>,
    },
  ];

  return (
    <div style={{ background: REDWOOD.neutral100, minHeight: 'calc(100vh - 200px)' }}>
      {/* Action Bar */}
      <div
        style={{
          padding: '10px 24px',
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
        <Space>
          <Title level={5} style={{ margin: 0 }}>
            <FileTextOutlined style={{ marginRight: 8, color: REDWOOD.primary }} />
            Create Invoice
          </Title>
          <Tag color="blue">New</Tag>
        </Space>
        <Space>
          <Tooltip title="Save Invoice">
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
            >
              Save
            </Button>
          </Tooltip>
          <Tooltip title="Save and Close">
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => {
                handleSave();
                onClose();
              }}
              style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
            >
              Save and Close
            </Button>
          </Tooltip>
          <Button icon={<UndoOutlined />} onClick={() => form.resetFields()}>
            Reset
          </Button>
          <Button icon={<CloseOutlined />} onClick={onClose}>
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
            border: `1px solid ${REDWOOD.neutral200}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ fontSize: 14, color: REDWOOD.neutral900 }}>Invoice Lines</Text>
          </div>

          <Tabs
            defaultActiveKey="distribution"
            size="small"
            tabBarExtraContent={
              <Space>
                <Button
                  size="small"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={addDistributionLine}
                  style={{ background: REDWOOD.info, borderColor: REDWOOD.info, fontSize: 12 }}
                >
                  Add Line
                </Button>
                <Button
                  size="small"
                  icon={<DeleteOutlined />}
                  danger
                  onClick={removeDistributionLines}
                  disabled={selectedDistKeys.length === 0}
                  style={{ fontSize: 12 }}
                >
                  Delete
                </Button>
              </Space>
            }
            items={[
              {
                key: 'distribution',
                label: (
                  <Space size={4}>
                    <FileTextOutlined />
                    <span>Distribution</span>
                    <Tag style={{ marginLeft: 4, fontSize: 10, padding: '0 4px', lineHeight: '16px' }} color="blue">
                      {distributionLines.length}
                    </Tag>
                  </Space>
                ),
                children: (
                  <Table
                    columns={distributionColumns}
                    dataSource={distributionLines}
                    size="small"
                    pagination={false}
                    scroll={{ x: 1400 }}
                    rowSelection={{
                      selectedRowKeys: selectedDistKeys,
                      onChange: (keys) => setSelectedDistKeys(keys),
                    }}
                    summary={() => (
                      <Table.Summary fixed>
                        <Table.Summary.Row>
                          <Table.Summary.Cell index={0} colSpan={2} />
                          <Table.Summary.Cell index={2} colSpan={5}>
                            <Text strong style={{ fontSize: 12 }}>Total</Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={7} align="right" colSpan={1}>
                            <Text strong style={{ fontSize: 13, color: REDWOOD.primary }}>
                              {formatAmount(distributionTotal)}
                            </Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={8} colSpan={3} />
                        </Table.Summary.Row>
                      </Table.Summary>
                    )}
                    style={{ marginTop: 4 }}
                  />
                ),
              },
              {
                key: 'purchaseOrders',
                label: (
                  <Space size={4}>
                    <ShoppingCartOutlined />
                    <span>Purchase Orders</span>
                    <Tag style={{ marginLeft: 4, fontSize: 10, padding: '0 4px', lineHeight: '16px' }} color="orange">
                      {poLines.length}
                    </Tag>
                  </Space>
                ),
                children: (
                  <div>
                    {poLines.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <ShoppingCartOutlined style={{ fontSize: 40, color: REDWOOD.neutral300, marginBottom: 12 }} />
                        <div>
                          <Text type="secondary">No purchase order lines matched.</Text>
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            Enter a PO number in the distribution lines to match, or use the Match Purchase Orders action.
                          </Text>
                        </div>
                      </div>
                    ) : (
                      <Table
                        columns={poColumns}
                        dataSource={poLines}
                        size="small"
                        pagination={false}
                        scroll={{ x: 1350 }}
                        rowSelection={{
                          selectedRowKeys: selectedPOKeys,
                          onChange: (keys) => setSelectedPOKeys(keys),
                        }}
                        summary={() => (
                          <Table.Summary fixed>
                            <Table.Summary.Row>
                              <Table.Summary.Cell index={0} colSpan={2} />
                              <Table.Summary.Cell index={2} colSpan={6}>
                                <Text strong style={{ fontSize: 12 }}>Total</Text>
                              </Table.Summary.Cell>
                              <Table.Summary.Cell index={8} align="right">
                                <Text strong style={{ fontSize: 13, color: REDWOOD.primary }}>
                                  {formatAmount(poTotal)}
                                </Text>
                              </Table.Summary.Cell>
                              <Table.Summary.Cell index={9} colSpan={3} />
                            </Table.Summary.Row>
                          </Table.Summary>
                        )}
                      />
                    )}
                  </div>
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
                  <InputNumber size="small" style={{ width: 100 }} defaultValue={5} min={0} max={100} precision={2} addonAfter="%" />
                </Descriptions.Item>
                <Descriptions.Item label="Tax Amount">
                  <Text style={{ fontSize: 13 }}>{formatAmount(distributionTotal * 0.05)}</Text>
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
                <Row justify="space-between" align="middle">
                  <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Lines Total</Text>
                  <Text style={{ fontSize: 14, fontWeight: 500 }}>
                    {formatAmount(distributionTotal + poTotal)}
                  </Text>
                </Row>
                <Row justify="space-between" align="middle">
                  <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Tax Total</Text>
                  <Text style={{ fontSize: 14, fontWeight: 500 }}>
                    {formatAmount(distributionTotal * 0.05)}
                  </Text>
                </Row>
                <Divider style={{ margin: '4px 0' }} />
                <Row justify="space-between" align="middle">
                  <Text strong style={{ fontSize: 13 }}>Invoice Amount</Text>
                  <Text strong style={{ fontSize: 18, color: REDWOOD.primary }}>
                    {formatAmount(distributionTotal + poTotal + distributionTotal * 0.05)}
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
                    background: REDWOOD.neutral100,
                    borderRadius: 6,
                    border: `1px solid ${REDWOOD.neutral200}`,
                  }}
                >
                  <Text strong style={{ fontSize: 14 }}>Amount Due</Text>
                  <Text strong style={{ fontSize: 20, color: REDWOOD.success }}>
                    {formatAmount(distributionTotal + poTotal + distributionTotal * 0.05)}
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
