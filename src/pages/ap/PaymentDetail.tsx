import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import {
  Card,
  Typography,
  Tabs,
  Table,
  Row,
  Col,
  Space,
  Button,
  Dropdown,
  Tag,
  Descriptions,
  Input,
  Select,
  DatePicker,
  Form,
  Modal,
  Spin,
  Alert,
  Divider,
  Tooltip,
  message,
} from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DownOutlined,
  EditOutlined,
  StopOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  ScissorOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

// Oracle Redwood Color Palette
const REDWOOD = {
  primary: '#C74634',
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

// Payment record interface
interface PaymentRecord {
  key: string;
  checkId: number;
  paymentId: number;
  paymentNumber: number;
  paymentDocument: string;
  paymentStatus: string;
  reconciled: boolean;
  payee: string;
  paymentDate: string;
  paymentAmount: number;
  paymentCurrency: string;
  remitToAddress: string;
  remitToAccountNumber: string;
  businessUnit: string;
  legalEntity: string;
  paymentMethod: string;
  accountingStatus: string;
  paymentType: string;
  supplierNumber: string;
  payeeSite: string;
  disbursementBankAccount: string;
  paymentProcessProfile: string;
  voucherNumber: number;
  documentCategory: string;
  documentSequence: string;
  withheldAmount: number | null;
  paymentReference: number;
  paymentFileReference: number;
  paymentProcessRequest: string;
  clearingDate: string | null;
  clearingAmount: number | null;
  clearingLedgerAmount: number | null;
  clearingValueDate: string | null;
  clearingConversionRate: number | null;
  clearingConversionDate: string | null;
  clearingConversionRateType: string | null;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  city: string;
  country: string;
  relatedInvoicesHref: string;
}

// Related invoice interface
interface RelatedInvoice {
  key: string;
  invoicePaymentId: number;
  checkId: number;
  invoiceId: number;
  invoiceBusinessUnit: string;
  invoiceNumber: string;
  installmentNumber: number;
  amountPaidPaymentCurrency: number;
  amountPaidInvoiceCurrency: number;
  invoicePaymentAmount: number;
  invoiceAmount: number;
  discountLost: number;
  discountTaken: number;
  invoiceCurrency: string;
  invoicePaymentStatus: string;
}

interface PaymentDetailProps {
  payment: PaymentRecord;
  onClose: () => void;
}

// Helper to format date
const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

import { ORACLE_FUSION_CONFIG, APEX_DB_CONFIG } from '../../config/api.config';

// Fusion API config - direct URL
const FUSION_CONFIG = {
  baseUrl: ORACLE_FUSION_CONFIG.baseUrl,
  auth: btoa(`${ORACLE_FUSION_CONFIG.username}:${ORACLE_FUSION_CONFIG.password}`),
};

// APEX endpoint for related invoices
const APEX_RELATED_INVOICES_URL = `${APEX_DB_CONFIG.baseUrl}/ap/payments`;

const PaymentDetail: React.FC<PaymentDetailProps> = ({ payment, onClose }) => {
  const [activeTab, setActiveTab] = useState('paymentDetails');
  const [relatedInvoices, setRelatedInvoices] = useState<RelatedInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // ── Void Payment state ────────────────────────────────────────────────────
  const [voidForm] = Form.useForm();
  const [voidModalOpen, setVoidModalOpen]       = useState(false);
  const [voidEligibility, setVoidEligibility]   = useState<{ eligible: boolean; errors: string[] } | null>(null);
  const [voidEligLoading, setVoidEligLoading]   = useState(false);
  const [voidSubmitting, setVoidSubmitting]     = useState(false);
  const [voidStepStatus, setVoidStepStatus]     = useState<
    { step: number; label: string; status: 'idle' | 'running' | 'success' | 'error'; detail?: string }[]
  >([]);
  // ─────────────────────────────────────────────────────────────────────────

  // Actions menu
  const isVoided  = payment.paymentStatus === 'Voided';
  const isCleared = !!(payment.clearingDate || payment.clearingAmount || payment.reconciled);
  const actionsMenuItems: MenuProps['items'] = [
    { key: 'edit', label: 'Edit', icon: <EditOutlined /> },
    { type: 'divider' },
    {
      key: 'void', label: 'Void Payment', icon: <CloseCircleOutlined />, danger: true,
      disabled: isVoided || isCleared,
    },
    { key: 'stop', label: 'Stop Payment', icon: <StopOutlined />, danger: true },
  ];

  const handleActionsClick = ({ key }: { key: string }) => {
    if (key === 'void') openVoidModal();
  };

  // Fetch related invoices from APEX
  const fetchRelatedInvoices = async () => {
    setLoadingInvoices(true);
    try {
      const relatedInvoicesUrl = `${APEX_RELATED_INVOICES_URL}/${payment.checkId}/related-invoices`;
      console.log('Fetching related invoices from:', relatedInvoicesUrl);

      const response = await fetch(relatedInvoicesUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      console.log('Related invoices response:', data);
      const items = data.items || [];

      setRelatedInvoices(items.map((item: any, index: number) => ({
        key: item.InvoicePaymentId?.toString() || index.toString(),
        invoicePaymentId: item.InvoicePaymentId || 0,
        checkId: item.CheckId || 0,
        invoiceId: item.InvoiceId || 0,
        invoiceBusinessUnit: item.InvoiceBusinessUnit || '',
        invoiceNumber: item.InvoiceNumber || '',
        installmentNumber: item.InstallmentNumber || 0,
        amountPaidPaymentCurrency: item.AmountPaidPaymentCurrency || 0,
        amountPaidInvoiceCurrency: item.AmountPaidInvoiceCurrency || 0,
        invoicePaymentAmount: item.InvoicePaymentAmount || 0,
        invoiceAmount: item.InvoiceAmount || 0,
        discountLost: item.DiscountLost || 0,
        discountTaken: item.DiscountTaken || 0,
        invoiceCurrency: item.InvoiceCurrency || '',
        invoicePaymentStatus: item.InvoicePaymentStatus || '',
      })));
    } catch (error) {
      console.error('Error fetching related invoices:', error);
      setRelatedInvoices([]);
    } finally {
      setLoadingInvoices(false);
    }
  };

  // Open void modal — auto-runs eligibility check
  const openVoidModal = async () => {
    setVoidEligibility(null);
    setVoidStepStatus([]);
    voidForm.setFieldsValue({ voidDate: dayjs(), voidReason: '' });
    setVoidModalOpen(true);
    setVoidEligLoading(true);
    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/ap/payments/${payment.checkId}/void-eligibility`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        setVoidEligibility({ eligible: false, errors: [`API returned HTTP ${res.status}`] });
      } else {
        const data = await res.json();
        setVoidEligibility({ ...data, errors: Array.isArray(data.errors) ? data.errors : [] });
      }
    } catch (e: any) {
      setVoidEligibility({ eligible: false, errors: [e?.message ?? 'Network error'] });
    } finally {
      setVoidEligLoading(false);
    }
  };

  const handleVoidSubmit = async (values: any) => {
    const steps = [
      { step: 0, label: 'Re-check eligibility', status: 'idle' as const },
      { step: 1, label: 'Void payment',          status: 'idle' as const },
    ];
    setVoidStepStatus(steps);
    setVoidSubmitting(true);
    const setStep = (step: number, status: 'running' | 'success' | 'error', detail?: string) =>
      setVoidStepStatus(prev => prev.map(s => s.step === step ? { ...s, status, detail } : s));
    try {
      setStep(0, 'running');
      const eligRes = await fetch(
        `${APEX_DB_CONFIG.baseUrl}/ap/payments/${payment.checkId}/void-eligibility`,
        { headers: { Accept: 'application/json' } }
      );
      const eligData = eligRes.ok ? await eligRes.json() : { eligible: false, errors: [`HTTP ${eligRes.status}`] };
      if (!eligData.eligible) {
        setStep(0, 'error', (eligData.errors ?? [])[0] ?? 'Not eligible');
        message.error('Payment is not eligible for void');
        return;
      }
      setStep(0, 'success', 'Eligible for void');

      setStep(1, 'running');
      const voidBody = {
        CheckId:       payment.checkId,
        VoidDate:      values.voidDate ? values.voidDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        VoidedBy:      null,
        StopReason:    values.voidReason || 'Payment Voided',
        StopReference: payment.paymentNumber?.toString() ?? null,
      };
      const voidRes = await fetch(`${APEX_DB_CONFIG.baseUrl}/ap/payments/void`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(voidBody),
      });
      const voidData = await voidRes.json();
      if (voidData.status === 'error' || !voidRes.ok) {
        setStep(1, 'error', voidData.message ?? `HTTP ${voidRes.status}`);
        message.error('Void failed: ' + (voidData.message ?? 'Unknown error'));
        return;
      }
      setStep(1, 'success',
        `Voided — New balance: ${voidData.newBalance != null ? Number(voidData.newBalance).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}`
      );
      message.success('Payment voided successfully');
      setTimeout(() => {
        setVoidModalOpen(false);
        voidForm.resetFields();
        setVoidStepStatus([]);
        onClose(); // close the detail view so user sees refreshed list
      }, 1800);
    } finally {
      setVoidSubmitting(false);
    }
  };

  useEffect(() => {
    fetchRelatedInvoices();
  }, [payment.checkId]);

  // Get status tag color
  const getStatusTag = (status: string) => {
    const colors: Record<string, string> = {
      'Cleared': REDWOOD.success,
      'Accounted': REDWOOD.success,
      'Negotiable': REDWOOD.info,
      'Voided': REDWOOD.error,
    };
    return <Tag color={colors[status] || 'default'}>{status}</Tag>;
  };

  // Helper to format amount in UAE format
  const formatAmount = (value: number): string => {
    return new Intl.NumberFormat('en-AE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Invoice columns for Paid Invoices tab
  const invoiceColumns: ColumnsType<RelatedInvoice> = [
    {
      title: 'Invoice Number',
      dataIndex: 'invoiceNumber',
      key: 'invoiceNumber',
      width: 200,
      ellipsis: true,
      render: (text: string) => (
        <a style={{ color: REDWOOD.info }}>{text}</a>
      ),
    },
    {
      title: 'Business Unit',
      dataIndex: 'invoiceBusinessUnit',
      key: 'invoiceBusinessUnit',
      width: 220,
      ellipsis: true,
    },
    {
      title: 'Installment',
      dataIndex: 'installmentNumber',
      key: 'installmentNumber',
      width: 90,
      align: 'center',
    },
    {
      title: 'Invoice Amount',
      dataIndex: 'invoiceAmount',
      key: 'invoiceAmount',
      width: 140,
      align: 'right',
      render: (value: number) => formatAmount(value),
    },
    {
      title: `Paid (${payment.paymentCurrency || 'AED'})`,
      dataIndex: 'amountPaidPaymentCurrency',
      key: 'amountPaidPaymentCurrency',
      width: 140,
      align: 'right',
      render: (value: number) => formatAmount(value),
    },
    {
      title: 'Paid (Inv Currency)',
      dataIndex: 'amountPaidInvoiceCurrency',
      key: 'amountPaidInvoiceCurrency',
      width: 140,
      align: 'right',
      render: (value: number) => formatAmount(value),
    },
    {
      title: 'Discount Taken',
      dataIndex: 'discountTaken',
      key: 'discountTaken',
      width: 120,
      align: 'right',
      render: (value: number) => formatAmount(value),
    },
    {
      title: 'Currency',
      dataIndex: 'invoiceCurrency',
      key: 'invoiceCurrency',
      width: 80,
      align: 'center',
    },
    {
      title: 'Status',
      dataIndex: 'invoicePaymentStatus',
      key: 'invoicePaymentStatus',
      width: 130,
      render: (status: string) => {
        const color = status === 'Fully paid' ? REDWOOD.success
          : status === 'Partially paid' ? REDWOOD.warning
          : 'default';
        return <Tag color={color}>{status}</Tag>;
      },
    },
  ];

  // Calculate totals for invoices
  const invoiceTotals = relatedInvoices.reduce(
    (acc, inv) => ({
      invoiceAmount: acc.invoiceAmount + inv.invoiceAmount,
      amountPaid: acc.amountPaid + inv.amountPaidPaymentCurrency,
      amountPaidInv: acc.amountPaidInv + inv.amountPaidInvoiceCurrency,
      discountTaken: acc.discountTaken + inv.discountTaken,
    }),
    { invoiceAmount: 0, amountPaid: 0, amountPaidInv: 0, discountTaken: 0 }
  );

  // Payment Details Tab Content
  const PaymentDetailsTab = () => (
    <div style={{ padding: 16 }}>
      {/* Payee Section */}
      <Card
        title={<Text strong>Payee</Text>}
        size="small"
        style={{ marginBottom: 16, borderRadius: 8 }}
        styles={{ body: { padding: 16 } }}
      >
        <Row gutter={[48, 12]}>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 140, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Current Name">{payment.payee}</Descriptions.Item>
              <Descriptions.Item label="Payee Site">{payment.payeeSite}</Descriptions.Item>
              <Descriptions.Item label="Remit-to Address">{payment.remitToAddress}</Descriptions.Item>
              <Descriptions.Item label="Payment Function">Payables disbursements</Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 140, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Remit-to Account">{payment.remitToAccountNumber}</Descriptions.Item>
              <Descriptions.Item label="IBAN"></Descriptions.Item>
              <Descriptions.Item label="BIC"></Descriptions.Item>
              <Descriptions.Item label="Remit-to Bank Name"></Descriptions.Item>
              <Descriptions.Item label="Remit-to Branch Name"></Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>

      {/* Processing Details Section */}
      <Card
        title={<Text strong>Processing Details</Text>}
        size="small"
        style={{ marginBottom: 16, borderRadius: 8 }}
        styles={{ body: { padding: 16 } }}
      >
        <Row gutter={[48, 12]}>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 180, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Disbursement Bank Account">{payment.disbursementBankAccount}</Descriptions.Item>
              <Descriptions.Item label="Payment Method">{payment.paymentMethod}</Descriptions.Item>
              <Descriptions.Item label="Bill Payable">No</Descriptions.Item>
              <Descriptions.Item label="Payment Process Profile">{payment.paymentProcessProfile}</Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 200, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Payment Process Request">{payment.paymentProcessRequest}</Descriptions.Item>
              <Descriptions.Item label="Payment Document">{payment.paymentDocument}</Descriptions.Item>
              <Descriptions.Item label="Payment File Reference">{payment.paymentFileReference}</Descriptions.Item>
              <Descriptions.Item label="Reference Assigned by Administrator">{payment.paymentProcessRequest}</Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>

      {/* General Information Section */}
      <Card
        title={<Text strong>General Information</Text>}
        size="small"
        style={{ borderRadius: 8 }}
        styles={{ body: { padding: 16 } }}
      >
        <Row gutter={[48, 12]}>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 160, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Payment Description"></Descriptions.Item>
              <Descriptions.Item label="Reference Number">{payment.paymentReference}</Descriptions.Item>
              <Descriptions.Item label="Trust Receipt Number">
                <Input size="small" style={{ width: 150 }} />
              </Descriptions.Item>
              <Descriptions.Item label="Trust Receipt Start Date">
                <DatePicker size="small" format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" />
              </Descriptions.Item>
              <Descriptions.Item label="Trust Receipt End Date">
                <DatePicker size="small" format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" />
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 160, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="TR Amount">
                <Input size="small" style={{ width: 150 }} />
              </Descriptions.Item>
              <Descriptions.Item label="TT Ref #">
                <Input size="small" style={{ width: 150 }} />
              </Descriptions.Item>
              <Descriptions.Item label="Context">
                <Select size="small" style={{ width: 150 }} placeholder="Select..." />
              </Descriptions.Item>
              <Descriptions.Item label="Regional Information">
                <Select size="small" style={{ width: 150 }} placeholder="Select..." />
              </Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>
    </div>
  );

  // Paid Invoices Tab Content
  const PaidInvoicesTab = () => (
    <div style={{ padding: 16 }}>
      <Card
        size="small"
        style={{ borderRadius: 8 }}
        styles={{ body: { padding: 0 } }}
      >
        {/* Toolbar */}
        <div style={{
          padding: '8px 16px',
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: REDWOOD.neutral100,
        }}>
          <Dropdown menu={{ items: [{ key: 'view', label: 'View' }] }} trigger={['click']}>
            <Button size="small">View <DownOutlined /></Button>
          </Dropdown>
          <Button size="small" icon={<FileTextOutlined />}>Reverse</Button>
          <Button size="small">Select and Add</Button>
          <Button size="small" icon={<ScissorOutlined />}>Detach</Button>
        </div>

        <Table
          columns={invoiceColumns}
          dataSource={relatedInvoices}
          loading={loadingInvoices}
          pagination={false}
          size="small"
          bordered
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row style={{ background: REDWOOD.neutral100, fontWeight: 600 }}>
                <Table.Summary.Cell index={0} colSpan={3}>
                  <Text strong>Totals ({relatedInvoices.length} invoice{relatedInvoices.length !== 1 ? 's' : ''})</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  {formatAmount(invoiceTotals.invoiceAmount)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  {formatAmount(invoiceTotals.amountPaid)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  {formatAmount(invoiceTotals.amountPaidInv)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  {formatAmount(invoiceTotals.discountTaken)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} colSpan={2}></Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Card>
    </div>
  );

  // History Tab Content
  const HistoryTab = () => (
    <div style={{ padding: 16 }}>
      {/* Validations Section */}
      <Card
        title={<Text strong>Validations</Text>}
        size="small"
        style={{ marginBottom: 16, borderRadius: 8 }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          columns={[
            { title: 'Error Message', dataIndex: 'errorMessage', key: 'errorMessage' },
            { title: 'Validation', dataIndex: 'validation', key: 'validation' },
            { title: 'Error Status', dataIndex: 'errorStatus', key: 'errorStatus' },
            { title: 'Fail Date', dataIndex: 'failDate', key: 'failDate' },
            { title: 'Pass Date', dataIndex: 'passDate', key: 'passDate' },
          ]}
          dataSource={[]}
          pagination={false}
          size="small"
          locale={{ emptyText: 'No data to display.' }}
        />
      </Card>

      {/* Clearing Section */}
      <Card
        title={<Text strong>Clearing</Text>}
        size="small"
        style={{ borderRadius: 8 }}
        styles={{ body: { padding: 16 } }}
      >
        <Row gutter={[48, 12]}>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 120, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Amount">
                {payment.clearingAmount?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || ''}
              </Descriptions.Item>
              <Descriptions.Item label="Date">
                {formatDate(payment.clearingDate)}
              </Descriptions.Item>
              <Descriptions.Item label="Ledger Amount">
                {payment.clearingLedgerAmount?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || ''}
              </Descriptions.Item>
              <Descriptions.Item label="Value Date">
                {formatDate(payment.clearingValueDate)}
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 160, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Conversion Rate">
                {payment.clearingConversionRate || ''}
              </Descriptions.Item>
              <Descriptions.Item label="Conversion Date">
                {formatDate(payment.clearingConversionDate)}
              </Descriptions.Item>
              <Descriptions.Item label="Conversion Rate Type">
                {payment.clearingConversionRateType || ''}
              </Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>
    </div>
  );

  // Other Tab Content
  const OtherTab = () => (
    <div style={{ padding: 16 }}>
      {/* Bank Instructions Section */}
      <Card
        title={<Text strong>Bank Instructions</Text>}
        size="small"
        style={{ marginBottom: 16, borderRadius: 8 }}
        styles={{ body: { padding: 16 } }}
      >
        <Row gutter={[48, 12]}>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 160, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Bank Instruction 1"></Descriptions.Item>
              <Descriptions.Item label="Bank Instruction 2"></Descriptions.Item>
              <Descriptions.Item label="Bank Instruction Details"></Descriptions.Item>
              <Descriptions.Item label="Delivery Channel"></Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 180, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Payment Text Message 1"></Descriptions.Item>
              <Descriptions.Item label="Payment Text Message 2"></Descriptions.Item>
              <Descriptions.Item label="Payment Text Message 3"></Descriptions.Item>
              <Descriptions.Item label="Settlement Priority Override"></Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>

      {/* Remittance Section */}
      <Card
        title={<Text strong>Remittance</Text>}
        size="small"
        style={{ marginBottom: 16, borderRadius: 8 }}
        styles={{ body: { padding: 16 } }}
      >
        <Row gutter={[48, 12]}>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 160, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Remittance Message 1"></Descriptions.Item>
              <Descriptions.Item label="Remittance Message 2"></Descriptions.Item>
              <Descriptions.Item label="Remittance Message 3"></Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 220, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Unique Remittance Identifier"></Descriptions.Item>
              <Descriptions.Item label="Unique Remittance Identifier Check Digit"></Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>

      {/* Regulatory Reporting Section */}
      <Card
        title={<Text strong>Regulatory Reporting</Text>}
        size="small"
        style={{ marginBottom: 16, borderRadius: 8 }}
        styles={{ body: { padding: 16 } }}
      >
        <Row gutter={[48, 12]}>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 140, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Payment Reported"></Descriptions.Item>
              <Descriptions.Item label="Reported Amount"></Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 100, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Format"></Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>

      {/* Sequencing Section */}
      <Card
        title={<Text strong>Sequencing</Text>}
        size="small"
        style={{ borderRadius: 8 }}
        styles={{ body: { padding: 16 } }}
      >
        <Row gutter={[48, 12]}>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 140, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Document Category">{payment.documentCategory}</Descriptions.Item>
              <Descriptions.Item label="Document Sequence">{payment.documentSequence}</Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 120, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Voucher Number">{payment.voucherNumber}</Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>
    </div>
  );

  // Tab items
  const tabItems = [
    { key: 'paymentDetails', label: 'Payment Details', children: <PaymentDetailsTab /> },
    { key: 'paidInvoices', label: 'Paid Invoices', children: <PaidInvoicesTab /> },
    { key: 'history', label: 'History', children: <HistoryTab /> },
    { key: 'other', label: 'Other', children: <OtherTab /> },
  ];

  return (
    <div style={{ background: REDWOOD.neutral100, minHeight: '100%' }}>
      {/* Payment Header */}
      <Card
        style={{
          margin: 16,
          borderRadius: 8,
          border: `1px solid ${REDWOOD.neutral200}`,
        }}
        styles={{ body: { padding: 16 } }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 16,
        }}>
          <Title level={4} style={{ margin: 0 }}>
            Payment: {payment.paymentNumber}
          </Title>
          <Space>
            <Dropdown menu={{ items: actionsMenuItems, onClick: handleActionsClick }} trigger={['click']}>
              <Button>Actions <DownOutlined /></Button>
            </Dropdown>
            <Button type="primary" style={{ background: REDWOOD.primary }} onClick={onClose}>
              Done
            </Button>
          </Space>
        </div>

        {/* Header Info Grid */}
        <Row gutter={[48, 8]}>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 140, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Payee">{payment.payee}</Descriptions.Item>
              <Descriptions.Item label="Payment Date">{payment.paymentDate}</Descriptions.Item>
              <Descriptions.Item label="Status">{getStatusTag(payment.paymentStatus)}</Descriptions.Item>
              <Descriptions.Item label="Accounting Status">{getStatusTag(payment.accountingStatus)}</Descriptions.Item>
              <Descriptions.Item label="Reconciled">
                <span style={{ color: payment.reconciled ? REDWOOD.success : REDWOOD.neutral600 }}>
                  {payment.reconciled ? 'Yes' : 'No'}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Type">{payment.paymentType}</Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Descriptions column={1} size="small" labelStyle={{ width: 140, color: REDWOOD.neutral600 }}>
              <Descriptions.Item label="Payment Amount">
                <Text strong style={{ color: REDWOOD.info }}>
                  {payment.paymentAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Text>
                <br />
                <Text type="secondary">{payment.paymentCurrency}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Withheld Amount">
                {payment.withheldAmount?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
                <br />
                <Text type="secondary">{payment.paymentCurrency}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Business Unit">{payment.businessUnit}</Descriptions.Item>
              <Descriptions.Item label="Legal Entity">{payment.legalEntity}</Descriptions.Item>
              <Descriptions.Item label="Stop Date"></Descriptions.Item>
              <Descriptions.Item label="Void Date"></Descriptions.Item>
              <Descriptions.Item label="Attachments">
                <a style={{ color: REDWOOD.info }}>None +</a>
              </Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>

      {/* Detail Tabs */}
      <Card
        style={{
          margin: '0 16px 16px 16px',
          borderRadius: 8,
          border: `1px solid ${REDWOOD.neutral200}`,
        }}
        styles={{ body: { padding: 0 } }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          tabBarStyle={{
            padding: '0 16px',
            background: REDWOOD.surface,
            borderBottom: `1px solid ${REDWOOD.neutral200}`,
            marginBottom: 0,
          }}
        />
      </Card>

      {/* ── Void Payment Modal ──────────────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <StopOutlined style={{ color: REDWOOD.error }} />
            <span>Void Payment</span>
            <Tag color="red" style={{ marginLeft: 4 }}>{payment.paymentNumber}</Tag>
          </Space>
        }
        open={voidModalOpen}
        onCancel={() => { setVoidModalOpen(false); voidForm.resetFields(); setVoidStepStatus([]); }}
        footer={null}
        width={700}
        destroyOnClose
      >
        <Spin spinning={voidEligLoading} tip="Checking eligibility...">
          {/* Eligibility Banner */}
          {voidEligibility && !voidEligLoading && (
            <Alert
              type={voidEligibility.eligible ? 'success' : 'error'}
              showIcon
              message={voidEligibility.eligible ? 'Payment is eligible for void' : 'Payment cannot be voided'}
              description={
                !voidEligibility.eligible && (voidEligibility.errors?.length ?? 0) > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {voidEligibility.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                ) : null
              }
              style={{ marginBottom: 16 }}
            />
          )}

          <Form form={voidForm} layout="vertical" onFinish={handleVoidSubmit} size="small">
            {/* Row 1: Payment Number | Void Date */}
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Payment Number">
                  <Input value={payment.paymentNumber?.toString() ?? ''} readOnly style={{ background: '#f5f5f5', color: '#555' }} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label={<><span style={{ color: REDWOOD.primary }}>*</span> Void Date</>}
                  name="voidDate"
                  rules={[{ required: true, message: 'Required' }]}
                >
                  <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" />
                </Form.Item>
              </Col>
            </Row>

            {/* Row 2: Payment Date | Accounting Date */}
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Payment Date">
                  <Input value={payment.paymentDate ?? ''} readOnly style={{ background: '#f5f5f5', color: '#555' }} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Accounting Date">
                  <Input value={payment.accountingDate ?? ''} readOnly style={{ background: '#f5f5f5', color: '#555' }} />
                </Form.Item>
              </Col>
            </Row>

            {/* Row 3: Payment Amount | Void Reason */}
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Payment Amount">
                  <Input
                    value={`${payment.paymentAmount.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${payment.paymentCurrency}`}
                    readOnly
                    style={{ background: '#f5f5f5', color: '#555', fontWeight: 500 }}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Void Reason" name="voidReason">
                  <Input placeholder="Enter void reason (optional)" />
                </Form.Item>
              </Col>
            </Row>

            {/* Related Invoices */}
            <Divider orientation="left" style={{ fontSize: 12, margin: '4px 0 10px' }}>
              Related Invoices
            </Divider>
            <Table
              size="small"
              loading={loadingInvoices}
              dataSource={relatedInvoices}
              rowKey="key"
              pagination={false}
              scroll={{ y: 140 }}
              style={{ marginBottom: 16 }}
              locale={{ emptyText: loadingInvoices ? 'Loading...' : 'No related invoices found' }}
              columns={[
                { title: 'Invoice #', dataIndex: 'invoiceNumber', key: 'invoiceNumber', width: 140, ellipsis: true },
                {
                  title: 'Invoice Amount', dataIndex: 'invoiceAmount', key: 'invoiceAmount', width: 130, align: 'right' as const,
                  render: (v: number) => v != null ? v.toLocaleString('en-AE', { minimumFractionDigits: 2 }) : '—',
                },
                {
                  title: 'Amt Paid', dataIndex: 'amountPaidInvoiceCurrency', key: 'amountPaidInvoiceCurrency', width: 120, align: 'right' as const,
                  render: (v: number) => v != null ? v.toLocaleString('en-AE', { minimumFractionDigits: 2 }) : '—',
                },
                { title: 'Currency', dataIndex: 'invoiceCurrency', key: 'invoiceCurrency', width: 80 },
                {
                  title: 'Status', dataIndex: 'invoicePaymentStatus', key: 'invoicePaymentStatus', width: 100,
                  render: (s: string) => s ? <Tag color={s === 'Voided' ? 'red' : 'blue'}>{s}</Tag> : null,
                },
              ]}
            />

            {/* Step Status Panel */}
            {voidStepStatus.length > 0 && (
              <div style={{ marginBottom: 16, background: '#fafafa', border: '1px solid #e8e8e8', borderRadius: 6, padding: '10px 14px' }}>
                {voidStepStatus.map(s => {
                  const icon =
                    s.status === 'running' ? <LoadingOutlined style={{ color: REDWOOD.info }} spin /> :
                    s.status === 'success' ? <CheckCircleOutlined style={{ color: REDWOOD.success }} /> :
                    s.status === 'error'   ? <CloseCircleOutlined style={{ color: REDWOOD.error }} /> :
                    <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', background: '#d9d9d9', verticalAlign: 'middle' }} />;
                  const textColor =
                    s.status === 'success' ? REDWOOD.success :
                    s.status === 'error'   ? REDWOOD.error   :
                    s.status === 'running' ? REDWOOD.info    : '#6B6B6B';
                  return (
                    <div key={s.step} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                      <span style={{ marginTop: 2 }}>{icon}</span>
                      <div>
                        <Text style={{ fontSize: 12, color: textColor }}>
                          <strong>Step {s.step}:</strong> {s.label}
                        </Text>
                        {s.detail && <div><Text type="secondary" style={{ fontSize: 11 }}>{s.detail}</Text></div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <Button onClick={() => { setVoidModalOpen(false); voidForm.resetFields(); setVoidStepStatus([]); }}>
                Cancel
              </Button>
              <Tooltip title={isVoided ? 'Already voided' : isCleared ? 'Cleared — cannot void' : ''}>
                <Button
                  type="primary"
                  danger
                  htmlType="submit"
                  loading={voidSubmitting}
                  disabled={!voidEligibility?.eligible || voidEligLoading}
                  icon={<StopOutlined />}
                >
                  Void Payment
                </Button>
              </Tooltip>
            </div>
          </Form>
        </Spin>
      </Modal>
      {/* ─────────────────────────────────────────────────────────────────── */}

      {/* Custom styles */}
      <style>{`
        .ant-descriptions-item-label {
          font-size: 12px !important;
        }
        .ant-descriptions-item-content {
          font-size: 12px !important;
        }
        .ant-table-thead > tr > th {
          background: ${REDWOOD.neutral100} !important;
          font-weight: 600;
          font-size: 12px;
          padding: 8px 12px !important;
        }
        .ant-table-tbody > tr > td {
          font-size: 12px;
          padding: 8px 12px !important;
        }
        .ant-tabs-tab {
          font-size: 13px;
        }
      `}</style>
    </div>
  );
};

export default PaymentDetail;
