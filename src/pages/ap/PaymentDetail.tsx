import React, { useState, useEffect } from 'react';
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
  invoiceNumber: string;
  invoiceType: string;
  dueDate: string;
  discount: number;
  amount: number;
  paymentReason: string;
  paymentReasonComments: string;
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

import { ORACLE_FUSION_CONFIG } from '../../config/api.config';

// Fusion API config - direct URL
const FUSION_CONFIG = {
  baseUrl: ORACLE_FUSION_CONFIG.baseUrl,
  auth: btoa(`${ORACLE_FUSION_CONFIG.username}:${ORACLE_FUSION_CONFIG.password}`),
};

const PaymentDetail: React.FC<PaymentDetailProps> = ({ payment, onClose }) => {
  const [activeTab, setActiveTab] = useState('paymentDetails');
  const [relatedInvoices, setRelatedInvoices] = useState<RelatedInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // Actions menu
  const actionsMenuItems: MenuProps['items'] = [
    { key: 'edit', label: 'Edit', icon: <EditOutlined /> },
    { type: 'divider' },
    { key: 'void', label: 'Void Payment', icon: <CloseCircleOutlined />, danger: true },
    { key: 'stop', label: 'Stop Payment', icon: <StopOutlined />, danger: true },
  ];

  // Fetch related invoices
  const fetchRelatedInvoices = async () => {
    setLoadingInvoices(true);
    try {
      // Construct the URL for related invoices using CheckId
      // Format: /fscmRestApi/resources/11.13.18.05/payablesPayments/{CheckId}/child/relatedInvoices
      const relatedInvoicesUrl = `${FUSION_CONFIG.baseUrl}/payablesPayments/${payment.checkId}/child/relatedInvoices`;

      console.log('Fetching related invoices from:', relatedInvoicesUrl);

      const response = await fetch(relatedInvoicesUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${FUSION_CONFIG.auth}`,
        },
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      console.log('Related invoices response:', data);
      const items = data.items || [];

      setRelatedInvoices(items.map((item: any, index: number) => ({
        key: index.toString(),
        invoiceNumber: item.InvoiceNumber || '',
        invoiceType: 'Standard', // Not provided in API, default to Standard
        dueDate: formatDate(item.DueDate) || '',
        discount: item.DiscountTaken || 0,
        amount: item.AmountPaidPaymentCurrency || item.InvoicePaymentAmount || 0,
        paymentReason: item.PaymentReason || '',
        paymentReasonComments: item.PaymentReasonComments || '',
      })));
    } catch (error) {
      console.error('Error fetching related invoices:', error);
      // Use sample data on error
      setRelatedInvoices([
        { key: '1', invoiceNumber: '47331', invoiceType: 'Standard', dueDate: '3-Dec-2023', discount: 0, amount: 693.00, paymentReason: '', paymentReasonComments: '' },
        { key: '2', invoiceNumber: '47677', invoiceType: 'Standard', dueDate: '6-Sep-2023', discount: 0, amount: 147.00, paymentReason: '', paymentReasonComments: '' },
        { key: '3', invoiceNumber: '47756', invoiceType: 'Standard', dueDate: '16-Sep-2023', discount: 0, amount: 47.25, paymentReason: '', paymentReasonComments: '' },
        { key: '4', invoiceNumber: '47785', invoiceType: 'Standard', dueDate: '22-Sep-2023', discount: 0, amount: 433.65, paymentReason: '', paymentReasonComments: '' },
        { key: '5', invoiceNumber: '48362', invoiceType: 'Standard', dueDate: '16-Nov-2023', discount: 0, amount: 1002.75, paymentReason: '', paymentReasonComments: '' },
      ]);
    } finally {
      setLoadingInvoices(false);
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

  // Invoice columns for Paid Invoices tab
  const invoiceColumns: ColumnsType<RelatedInvoice> = [
    {
      title: 'Invoice',
      children: [
        {
          title: 'Number',
          dataIndex: 'invoiceNumber',
          key: 'invoiceNumber',
          width: 100,
          render: (text: string) => (
            <a style={{ color: REDWOOD.info }}>{text}</a>
          ),
        },
        {
          title: 'Type',
          dataIndex: 'invoiceType',
          key: 'invoiceType',
          width: 100,
        },
        {
          title: 'Due Date',
          dataIndex: 'dueDate',
          key: 'dueDate',
          width: 120,
        },
      ],
    },
    {
      title: `Payment (${payment.paymentCurrency})`,
      children: [
        {
          title: 'Discount',
          dataIndex: 'discount',
          key: 'discount',
          width: 100,
          align: 'right',
          render: (value: number) => value.toFixed(2),
        },
        {
          title: 'Amount',
          dataIndex: 'amount',
          key: 'amount',
          width: 120,
          align: 'right',
          render: (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2 }),
        },
      ],
    },
    {
      title: 'Payment Reason',
      dataIndex: 'paymentReason',
      key: 'paymentReason',
      width: 150,
    },
    {
      title: 'Payment Reason Comments',
      dataIndex: 'paymentReasonComments',
      key: 'paymentReasonComments',
      width: 200,
    },
  ];

  // Calculate totals for invoices
  const invoiceTotals = relatedInvoices.reduce(
    (acc, inv) => ({
      discount: acc.discount + inv.discount,
      amount: acc.amount + inv.amount,
    }),
    { discount: 0, amount: 0 }
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
                <Table.Summary.Cell index={0} colSpan={3}></Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  {invoiceTotals.discount.toFixed(2)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  {invoiceTotals.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} colSpan={2}></Table.Summary.Cell>
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
            <Dropdown menu={{ items: actionsMenuItems }} trigger={['click']}>
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
