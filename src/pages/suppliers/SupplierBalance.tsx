import React, { useState, useEffect } from 'react';
import {
  Layout,
  Card,
  Typography,
  Table,
  Row,
  Col,
  Breadcrumb,
  Tabs,
  Spin,
  Statistic,
  Space,
  Button,
  Tag,
  Descriptions,
  Progress,
  Divider,
  message,
  Modal,
} from 'antd';
import {
  HomeOutlined,
  ArrowLeftOutlined,
  DollarOutlined,
  FileTextOutlined,
  CreditCardOutlined,
  UserOutlined,
  EnvironmentOutlined,
  PhoneOutlined,
  MailOutlined,
  CalendarOutlined,
  BankOutlined,
  ReloadOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { Link, useParams, useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';

const { Content } = Layout;
const { Title, Text } = Typography;

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
  taskBlue: '#0572CE',
};

import { APEX_DB_CONFIG } from '../../config/api.config';

// Interfaces
interface SupplierDetails {
  supplierNumber: string;
  supplierName: string;
  alternateName: string;
  supplierType: string;
  taxRegistrationNumber: string;
  status: string;
  creationDate: string;
  address: {
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  } | null;
}

interface BalanceSummary {
  totalInvoices: number;
  totalInvoiceAmount: number;
  totalPayments: number;
  totalPaymentAmount: number;
  balance: number;
  currency: string;
}

interface AgingBucket {
  bucket: string;
  amount: number;
  invoiceCount: number;
  percentage: number;
}

interface InvoiceRecord {
  key: string;
  invoiceId: number;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  invoiceAmount: number;
  amountPaid: number;
  amountRemaining: number;
  invoiceStatus: string;
  currency: string;
  description: string;
}

interface PaymentRecord {
  key: string;
  paymentId: number;
  paymentNumber: string;
  paymentDate: string;
  paymentAmount: number;
  paymentStatus: string;
  paymentMethod: string;
  currency: string;
  bankAccountName: string;
}

interface RelatedInvoice {
  key: string;
  invoiceId: number;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceAmount: number;
  amountApplied: number;
  amountRemaining: number;
}

// Format currency
const formatCurrency = (amount: number, currency: string = 'AED'): string => {
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

// Format date
const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

// Get aging color
const getAgingColor = (bucket: string): string => {
  switch (bucket) {
    case 'Current':
      return REDWOOD.success;
    case '1-30 Days':
      return REDWOOD.info;
    case '31-60 Days':
      return REDWOOD.warning;
    case '61-90 Days':
      return '#FF8C00';
    case '91-120 Days':
      return REDWOOD.primary;
    case '120+ Days':
      return REDWOOD.error;
    default:
      return REDWOOD.neutral600;
  }
};

const SupplierBalance: React.FC = () => {
  const { supplierNumber } = useParams<{ supplierNumber: string }>();
  const navigate = useNavigate();

  // State
  const [loading, setLoading] = useState(true);
  const [supplierDetails, setSupplierDetails] = useState<SupplierDetails | null>(null);
  const [balanceSummary, setBalanceSummary] = useState<BalanceSummary | null>(null);
  const [agingReport, setAgingReport] = useState<AgingBucket[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // Payment drilldown modal
  const [drilldownVisible, setDrilldownVisible] = useState(false);
  const [drilldownPayment, setDrilldownPayment] = useState<PaymentRecord | null>(null);
  const [relatedInvoices, setRelatedInvoices] = useState<RelatedInvoice[]>([]);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  // Fetch supplier dashboard data
  const fetchDashboardData = async () => {
    if (!supplierNumber) return;

    setLoading(true);
    try {
      // Fetch full dashboard in one call
      const dashboardUrl = `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/dashboard/${supplierNumber}`;
      console.log('Fetching supplier dashboard:', dashboardUrl);

      const response = await fetch(dashboardUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Dashboard response:', data);

      // Map supplier details
      if (data.supplier) {
        setSupplierDetails({
          supplierNumber: data.supplier.supplier_number || supplierNumber,
          supplierName: data.supplier.supplier_name || '',
          alternateName: data.supplier.alternate_name || '',
          supplierType: data.supplier.supplier_type || '',
          taxRegistrationNumber: data.supplier.tax_registration_number || '',
          status: data.supplier.status || 'Active',
          creationDate: data.supplier.creation_date || '',
          address: data.supplier.address ? {
            addressLine1: data.supplier.address.address_line_1 || '',
            addressLine2: data.supplier.address.address_line_2 || '',
            city: data.supplier.address.city || '',
            state: data.supplier.address.state || '',
            postalCode: data.supplier.address.postal_code || '',
            country: data.supplier.address.country || '',
          } : null,
        });
      }

      // Map balance summary
      if (data.balance_summary) {
        setBalanceSummary({
          totalInvoices: data.balance_summary.total_invoices || 0,
          totalInvoiceAmount: data.balance_summary.total_invoice_amount || 0,
          totalPayments: data.balance_summary.total_payments || 0,
          totalPaymentAmount: data.balance_summary.total_payment_amount || 0,
          balance: data.balance_summary.balance || 0,
          currency: data.balance_summary.currency || 'AED',
        });
      }

      // Map aging report
      if (data.aging_report && Array.isArray(data.aging_report)) {
        setAgingReport(data.aging_report.map((item: any) => ({
          bucket: item.bucket || '',
          amount: item.amount || 0,
          invoiceCount: item.invoice_count || 0,
          percentage: item.percentage || 0,
        })));
      }

      message.success('Dashboard loaded successfully');
    } catch (error) {
      console.error('Error fetching dashboard:', error);
      message.error(`Failed to load dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch invoices
  const fetchInvoices = async () => {
    if (!supplierNumber) return;

    setInvoicesLoading(true);
    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/invoices/${supplierNumber}`;
      console.log('Fetching invoices:', url);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Invoices response:', data);

      const items = data.invoices || data.items || [];
      setInvoices(items.map((item: any, index: number) => ({
        key: item.invoice_id?.toString() || index.toString(),
        invoiceId: item.invoice_id,
        invoiceNumber: item.invoice_number || '',
        invoiceDate: item.invoice_date || '',
        dueDate: item.due_date || '',
        invoiceAmount: item.invoice_amount || 0,
        amountPaid: item.amount_paid || 0,
        amountRemaining: item.amount_remaining || 0,
        invoiceStatus: item.invoice_status || '',
        currency: item.currency || 'AED',
        description: item.description || '',
      })));
    } catch (error) {
      console.error('Error fetching invoices:', error);
      message.error('Failed to load invoices');
    } finally {
      setInvoicesLoading(false);
    }
  };

  // Fetch payments
  const fetchPayments = async () => {
    if (!supplierNumber) return;

    setPaymentsLoading(true);
    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/payments/${supplierNumber}`;
      console.log('Fetching payments:', url);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Payments response:', data);

      const items = data.payments || data.items || [];
      setPayments(items.map((item: any, index: number) => ({
        key: item.payment_id?.toString() || index.toString(),
        paymentId: item.payment_id,
        paymentNumber: item.payment_number || '',
        paymentDate: item.payment_date || '',
        paymentAmount: item.payment_amount || 0,
        paymentStatus: item.payment_status || '',
        paymentMethod: item.payment_method || '',
        currency: item.currency || 'AED',
        bankAccountName: item.bank_account_name || '',
      })));
    } catch (error) {
      console.error('Error fetching payments:', error);
      message.error('Failed to load payments');
    } finally {
      setPaymentsLoading(false);
    }
  };

  // Fetch payment drilldown (related invoices)
  const fetchPaymentDrilldown = async (payment: PaymentRecord) => {
    setDrilldownPayment(payment);
    setDrilldownVisible(true);
    setDrilldownLoading(true);

    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/payment-invoices/${payment.paymentNumber}`;
      console.log('Fetching payment drilldown:', url);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Drilldown response:', data);

      const items = data.invoices || data.items || [];
      setRelatedInvoices(items.map((item: any, index: number) => ({
        key: item.invoice_id?.toString() || index.toString(),
        invoiceId: item.invoice_id,
        invoiceNumber: item.invoice_number || '',
        invoiceDate: item.invoice_date || '',
        invoiceAmount: item.invoice_amount || 0,
        amountApplied: item.amount_applied || 0,
        amountRemaining: item.amount_remaining || 0,
      })));
    } catch (error) {
      console.error('Error fetching drilldown:', error);
      message.error('Failed to load related invoices');
    } finally {
      setDrilldownLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchDashboardData();
  }, [supplierNumber]);

  // Invoice columns
  const invoiceColumns: ColumnsType<InvoiceRecord> = [
    {
      title: 'Invoice Number',
      dataIndex: 'invoiceNumber',
      key: 'invoiceNumber',
      width: 150,
      render: (text: string) => (
        <Text strong style={{ color: REDWOOD.info }}>{text}</Text>
      ),
    },
    {
      title: 'Invoice Date',
      dataIndex: 'invoiceDate',
      key: 'invoiceDate',
      width: 120,
      render: (text: string) => formatDate(text),
    },
    {
      title: 'Due Date',
      dataIndex: 'dueDate',
      key: 'dueDate',
      width: 120,
      render: (text: string) => formatDate(text),
    },
    {
      title: 'Invoice Amount',
      dataIndex: 'invoiceAmount',
      key: 'invoiceAmount',
      width: 150,
      align: 'right',
      render: (amount: number, record: InvoiceRecord) => (
        <Text strong>{formatCurrency(amount, record.currency)}</Text>
      ),
    },
    {
      title: 'Amount Paid',
      dataIndex: 'amountPaid',
      key: 'amountPaid',
      width: 150,
      align: 'right',
      render: (amount: number, record: InvoiceRecord) => (
        <Text style={{ color: REDWOOD.success }}>{formatCurrency(amount, record.currency)}</Text>
      ),
    },
    {
      title: 'Balance',
      dataIndex: 'amountRemaining',
      key: 'amountRemaining',
      width: 150,
      align: 'right',
      render: (amount: number, record: InvoiceRecord) => (
        <Text style={{ color: amount > 0 ? REDWOOD.error : REDWOOD.success }}>
          {formatCurrency(amount, record.currency)}
        </Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'invoiceStatus',
      key: 'invoiceStatus',
      width: 120,
      render: (status: string) => {
        let color = REDWOOD.neutral600;
        if (status === 'VALIDATED' || status === 'APPROVED') color = REDWOOD.success;
        else if (status === 'CANCELLED') color = REDWOOD.error;
        else if (status === 'PARTIALLY_PAID') color = REDWOOD.warning;
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
  ];

  // Payment columns
  const paymentColumns: ColumnsType<PaymentRecord> = [
    {
      title: 'Payment Number',
      dataIndex: 'paymentNumber',
      key: 'paymentNumber',
      width: 150,
      render: (text: string, record: PaymentRecord) => (
        <a
          onClick={() => fetchPaymentDrilldown(record)}
          style={{ color: REDWOOD.info, fontWeight: 500 }}
        >
          {text}
        </a>
      ),
    },
    {
      title: 'Payment Date',
      dataIndex: 'paymentDate',
      key: 'paymentDate',
      width: 120,
      render: (text: string) => formatDate(text),
    },
    {
      title: 'Amount',
      dataIndex: 'paymentAmount',
      key: 'paymentAmount',
      width: 150,
      align: 'right',
      render: (amount: number, record: PaymentRecord) => (
        <Text strong style={{ color: REDWOOD.success }}>
          {formatCurrency(amount, record.currency)}
        </Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'paymentStatus',
      key: 'paymentStatus',
      width: 120,
      render: (status: string) => {
        let color = REDWOOD.neutral600;
        if (status === 'NEGOTIABLE' || status === 'CLEARED') color = REDWOOD.success;
        else if (status === 'VOIDED') color = REDWOOD.error;
        else if (status === 'RECONCILED') color = REDWOOD.info;
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Method',
      dataIndex: 'paymentMethod',
      key: 'paymentMethod',
      width: 120,
    },
    {
      title: 'Bank Account',
      dataIndex: 'bankAccountName',
      key: 'bankAccountName',
      ellipsis: true,
    },
  ];

  // Related invoices columns (drilldown)
  const relatedInvoiceColumns: ColumnsType<RelatedInvoice> = [
    {
      title: 'Invoice Number',
      dataIndex: 'invoiceNumber',
      key: 'invoiceNumber',
      width: 150,
    },
    {
      title: 'Invoice Date',
      dataIndex: 'invoiceDate',
      key: 'invoiceDate',
      width: 120,
      render: (text: string) => formatDate(text),
    },
    {
      title: 'Invoice Amount',
      dataIndex: 'invoiceAmount',
      key: 'invoiceAmount',
      width: 150,
      align: 'right',
      render: (amount: number) => formatCurrency(amount),
    },
    {
      title: 'Amount Applied',
      dataIndex: 'amountApplied',
      key: 'amountApplied',
      width: 150,
      align: 'right',
      render: (amount: number) => (
        <Text style={{ color: REDWOOD.success }}>{formatCurrency(amount)}</Text>
      ),
    },
    {
      title: 'Remaining',
      dataIndex: 'amountRemaining',
      key: 'amountRemaining',
      width: 150,
      align: 'right',
      render: (amount: number) => (
        <Text style={{ color: amount > 0 ? REDWOOD.warning : REDWOOD.success }}>
          {formatCurrency(amount)}
        </Text>
      ),
    },
  ];

  // Render supplier header
  const renderSupplierHeader = () => (
    <Card
      style={{
        marginBottom: 16,
        borderRadius: 8,
        border: `1px solid ${REDWOOD.neutral200}`,
      }}
    >
      <Row gutter={24} align="middle">
        <Col span={16}>
          <Row align="middle" gutter={16}>
            <Col>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: REDWOOD.primary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <UserOutlined style={{ fontSize: 28, color: '#fff' }} />
              </div>
            </Col>
            <Col>
              <Title level={4} style={{ margin: 0 }}>
                {supplierDetails?.supplierName || 'Loading...'}
              </Title>
              <Space>
                <Tag color={REDWOOD.info}>{supplierDetails?.supplierNumber}</Tag>
                <Tag color={supplierDetails?.status === 'Active' ? REDWOOD.success : REDWOOD.error}>
                  {supplierDetails?.status}
                </Tag>
                {supplierDetails?.supplierType && (
                  <Tag>{supplierDetails.supplierType}</Tag>
                )}
              </Space>
            </Col>
          </Row>
          <Divider style={{ margin: '16px 0' }} />
          <Row gutter={24}>
            {supplierDetails?.address && (
              <Col span={12}>
                <Space direction="vertical" size={4}>
                  <Text type="secondary">
                    <EnvironmentOutlined style={{ marginRight: 8 }} />
                    Address
                  </Text>
                  <Text>
                    {supplierDetails.address.addressLine1}
                    {supplierDetails.address.addressLine2 && `, ${supplierDetails.address.addressLine2}`}
                  </Text>
                  <Text>
                    {[
                      supplierDetails.address.city,
                      supplierDetails.address.state,
                      supplierDetails.address.postalCode,
                    ].filter(Boolean).join(', ')}
                  </Text>
                  <Text>{supplierDetails.address.country}</Text>
                </Space>
              </Col>
            )}
            <Col span={12}>
              <Space direction="vertical" size={4}>
                {supplierDetails?.taxRegistrationNumber && (
                  <div>
                    <Text type="secondary">
                      <BankOutlined style={{ marginRight: 8 }} />
                      Tax Registration:
                    </Text>
                    <Text style={{ marginLeft: 8 }}>{supplierDetails.taxRegistrationNumber}</Text>
                  </div>
                )}
                {supplierDetails?.creationDate && (
                  <div>
                    <Text type="secondary">
                      <CalendarOutlined style={{ marginRight: 8 }} />
                      Created:
                    </Text>
                    <Text style={{ marginLeft: 8 }}>{formatDate(supplierDetails.creationDate)}</Text>
                  </div>
                )}
              </Space>
            </Col>
          </Row>
        </Col>
        <Col span={8}>
          <Card
            style={{
              background: balanceSummary && balanceSummary.balance > 0 ? '#fff2f0' : '#f6ffed',
              borderColor: balanceSummary && balanceSummary.balance > 0 ? REDWOOD.error : REDWOOD.success,
            }}
          >
            <Statistic
              title={<Text strong>Outstanding Balance</Text>}
              value={balanceSummary?.balance || 0}
              precision={2}
              prefix={balanceSummary?.currency || 'AED'}
              valueStyle={{
                color: balanceSummary && balanceSummary.balance > 0 ? REDWOOD.error : REDWOOD.success,
                fontSize: 28,
              }}
            />
          </Card>
        </Col>
      </Row>
    </Card>
  );

  // Render balance summary tab
  const renderBalanceSummaryTab = () => (
    <div>
      {/* Summary Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Invoices"
              value={balanceSummary?.totalInvoices || 0}
              prefix={<FileTextOutlined style={{ color: REDWOOD.info }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Invoice Amount"
              value={balanceSummary?.totalInvoiceAmount || 0}
              precision={2}
              prefix={<DollarOutlined style={{ color: REDWOOD.warning }} />}
              suffix={balanceSummary?.currency || 'AED'}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Payments"
              value={balanceSummary?.totalPayments || 0}
              prefix={<CreditCardOutlined style={{ color: REDWOOD.success }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Paid Amount"
              value={balanceSummary?.totalPaymentAmount || 0}
              precision={2}
              prefix={<DollarOutlined style={{ color: REDWOOD.success }} />}
              suffix={balanceSummary?.currency || 'AED'}
            />
          </Card>
        </Col>
      </Row>

      {/* Aging Report */}
      <Card
        title={
          <Space>
            <ExclamationCircleOutlined style={{ color: REDWOOD.warning }} />
            <Text strong>Aging Report</Text>
          </Space>
        }
        style={{ marginBottom: 24 }}
      >
        <Row gutter={16}>
          {agingReport.map((bucket, index) => (
            <Col span={4} key={index}>
              <Card
                size="small"
                style={{
                  borderTop: `3px solid ${getAgingColor(bucket.bucket)}`,
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{bucket.bucket}</Text>
                  <div style={{ marginTop: 8 }}>
                    <Text strong style={{ fontSize: 18, color: getAgingColor(bucket.bucket) }}>
                      {formatCurrency(bucket.amount)}
                    </Text>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Tag>{bucket.invoiceCount} invoice(s)</Tag>
                  </div>
                  <Progress
                    percent={bucket.percentage}
                    size="small"
                    strokeColor={getAgingColor(bucket.bucket)}
                    showInfo={false}
                    style={{ marginTop: 8 }}
                  />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {bucket.percentage.toFixed(1)}% of total
                  </Text>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      {/* Balance Calculation */}
      <Card title="Balance Calculation">
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="Total Invoice Amount">
            <Text strong>{formatCurrency(balanceSummary?.totalInvoiceAmount || 0)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Total Payment Amount">
            <Text style={{ color: REDWOOD.success }}>
              - {formatCurrency(balanceSummary?.totalPaymentAmount || 0)}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="Outstanding Balance">
            <Text
              strong
              style={{
                fontSize: 16,
                color: (balanceSummary?.balance || 0) > 0 ? REDWOOD.error : REDWOOD.success,
              }}
            >
              = {formatCurrency(balanceSummary?.balance || 0)}
            </Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );

  // Render invoices tab
  const renderInvoicesTab = () => (
    <div>
      <Card
        title={
          <Space>
            <FileTextOutlined style={{ color: REDWOOD.info }} />
            <Text strong>Invoice Details</Text>
            <Text type="secondary">({invoices.length} records)</Text>
          </Space>
        }
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchInvoices}
            loading={invoicesLoading}
          >
            Refresh
          </Button>
        }
      >
        <Table
          columns={invoiceColumns}
          dataSource={invoices}
          loading={invoicesLoading}
          scroll={{ x: 1200 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `${total} invoices`,
          }}
          size="small"
          summary={(pageData) => {
            const totalAmount = pageData.reduce((sum, r) => sum + r.invoiceAmount, 0);
            const totalPaid = pageData.reduce((sum, r) => sum + r.amountPaid, 0);
            const totalBalance = pageData.reduce((sum, r) => sum + r.amountRemaining, 0);
            return (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ background: REDWOOD.neutral100 }}>
                  <Table.Summary.Cell index={0} colSpan={3}>
                    <Text strong>Page Total</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <Text strong>{formatCurrency(totalAmount)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    <Text strong style={{ color: REDWOOD.success }}>{formatCurrency(totalPaid)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <Text strong style={{ color: REDWOOD.error }}>{formatCurrency(totalBalance)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} colSpan={2} />
                </Table.Summary.Row>
              </Table.Summary>
            );
          }}
        />
      </Card>
    </div>
  );

  // Render payments tab
  const renderPaymentsTab = () => (
    <div>
      <Card
        title={
          <Space>
            <CreditCardOutlined style={{ color: REDWOOD.success }} />
            <Text strong>Payment Details</Text>
            <Text type="secondary">({payments.length} records)</Text>
          </Space>
        }
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchPayments}
            loading={paymentsLoading}
          >
            Refresh
          </Button>
        }
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Click on a payment number to view related invoices
        </Text>
        <Table
          columns={paymentColumns}
          dataSource={payments}
          loading={paymentsLoading}
          scroll={{ x: 900 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `${total} payments`,
          }}
          size="small"
          summary={(pageData) => {
            const totalAmount = pageData.reduce((sum, r) => sum + r.paymentAmount, 0);
            return (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ background: REDWOOD.neutral100 }}>
                  <Table.Summary.Cell index={0} colSpan={2}>
                    <Text strong>Page Total</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <Text strong style={{ color: REDWOOD.success }}>{formatCurrency(totalAmount)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} colSpan={3} />
                </Table.Summary.Row>
              </Table.Summary>
            );
          }}
        />
      </Card>
    </div>
  );

  // Tab change handler to load data
  const handleTabChange = (key: string) => {
    if (key === 'invoices' && invoices.length === 0) {
      fetchInvoices();
    } else if (key === 'payments' && payments.length === 0) {
      fetchPayments();
    }
  };

  if (loading) {
    return (
      <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
        <Content style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Spin size="large" tip="Loading supplier balance..." />
        </Content>
      </Layout>
    );
  }

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb */}
        <div style={{ padding: '16px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb>
            <Breadcrumb.Item>
              <Link to="/home">
                <HomeOutlined /> Home
              </Link>
            </Breadcrumb.Item>
            <Breadcrumb.Item>
              <Link to="/procurement">Procurement</Link>
            </Breadcrumb.Item>
            <Breadcrumb.Item>
              <Link to="/suppliers/manage">Suppliers</Link>
            </Breadcrumb.Item>
            <Breadcrumb.Item>Balance - {supplierNumber}</Breadcrumb.Item>
          </Breadcrumb>
        </div>

        {/* Page Title */}
        <div style={{ padding: '16px 24px', background: REDWOOD.surface }}>
          <Row justify="space-between" align="middle">
            <Col>
              <Space>
                <Button
                  type="text"
                  icon={<ArrowLeftOutlined />}
                  onClick={() => navigate('/suppliers/manage')}
                >
                  Back to Suppliers
                </Button>
                <Divider type="vertical" />
                <Title level={3} style={{ margin: 0 }}>
                  Supplier Balance
                </Title>
              </Space>
            </Col>
            <Col>
              <Button
                icon={<ReloadOutlined />}
                onClick={fetchDashboardData}
                loading={loading}
              >
                Refresh
              </Button>
            </Col>
          </Row>
        </div>

        {/* Main Content */}
        <div style={{ padding: '16px 24px' }}>
          {/* Supplier Header */}
          {renderSupplierHeader()}

          {/* Tabs */}
          <Card
            style={{
              borderRadius: 8,
              border: `1px solid ${REDWOOD.neutral200}`,
            }}
          >
            <Tabs
              defaultActiveKey="summary"
              onChange={handleTabChange}
              items={[
                {
                  key: 'summary',
                  label: (
                    <Space>
                      <DollarOutlined />
                      Balance Summary
                    </Space>
                  ),
                  children: renderBalanceSummaryTab(),
                },
                {
                  key: 'invoices',
                  label: (
                    <Space>
                      <FileTextOutlined />
                      Invoice Details
                    </Space>
                  ),
                  children: renderInvoicesTab(),
                },
                {
                  key: 'payments',
                  label: (
                    <Space>
                      <CreditCardOutlined />
                      Payment Details
                    </Space>
                  ),
                  children: renderPaymentsTab(),
                },
              ]}
            />
          </Card>
        </div>

        {/* Payment Drilldown Modal */}
        <Modal
          title={
            <Space>
              <CreditCardOutlined style={{ color: REDWOOD.success }} />
              <span>Payment: {drilldownPayment?.paymentNumber}</span>
            </Space>
          }
          open={drilldownVisible}
          onCancel={() => {
            setDrilldownVisible(false);
            setDrilldownPayment(null);
            setRelatedInvoices([]);
          }}
          footer={[
            <Button key="close" onClick={() => setDrilldownVisible(false)}>
              Close
            </Button>,
          ]}
          width={900}
        >
          {drilldownPayment && (
            <div style={{ marginBottom: 16 }}>
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="Payment Number">
                  {drilldownPayment.paymentNumber}
                </Descriptions.Item>
                <Descriptions.Item label="Payment Date">
                  {formatDate(drilldownPayment.paymentDate)}
                </Descriptions.Item>
                <Descriptions.Item label="Amount">
                  <Text strong style={{ color: REDWOOD.success }}>
                    {formatCurrency(drilldownPayment.paymentAmount, drilldownPayment.currency)}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="Status">
                  <Tag>{drilldownPayment.paymentStatus}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Method">
                  {drilldownPayment.paymentMethod}
                </Descriptions.Item>
                <Descriptions.Item label="Bank Account">
                  {drilldownPayment.bankAccountName}
                </Descriptions.Item>
              </Descriptions>
            </div>
          )}

          <Card
            title="Related Invoices"
            size="small"
            style={{ marginTop: 16 }}
          >
            <Table
              columns={relatedInvoiceColumns}
              dataSource={relatedInvoices}
              loading={drilldownLoading}
              pagination={false}
              size="small"
              locale={{ emptyText: 'No related invoices found' }}
            />
          </Card>
        </Modal>
      </Content>
    </Layout>
  );
};

export default SupplierBalance;
