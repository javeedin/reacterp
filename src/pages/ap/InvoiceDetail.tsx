import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
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
  message,
  Spin,
  Descriptions,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  SaveOutlined,
  CloseOutlined,
  EditOutlined,
  DeleteOutlined,
  DownOutlined,
  ExportOutlined,
  PrinterOutlined,
  PaperClipOutlined,
  FileTextOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

const { Text, Title } = Typography;

// Oracle Redwood Color Palette
const REDWOOD = {
  primary: '#C74634',
  primaryLight: '#E85D4A',
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

// Proxy config
const PROXY_CONFIG = {
  baseUrl: 'http://localhost:3001/api',
};

// Invoice Line interface
interface InvoiceLine {
  key: string;
  lineNumber: number;
  amount: number;
  description: string;
  quantity: number;
  price: number;
  uomName: string;
  poNumber: string;
  poLine: number;
  poSchedule: number;
  receiptNumber: string;
  receiptLine: number;
  consumptionAdviceNumber: string;
  consumptionAdviceLine: number;
  shipToLocation: string;
  startDate: string;
  endDate: string;
  accrualAccount: string;
}

// Tax Line interface
interface TaxLine {
  key: string;
  lineNumber: number;
  rateName: string;
  rate: number;
  amount: number;
  canceled: string;
  inclusive: string;
  selfAssessed: string;
  taxOnlyLine: string;
  regime: string;
  taxName: string;
  taxJurisdiction: string;
}

// Invoice Detail Props
interface InvoiceDetailProps {
  invoice: {
    invoiceId: number;
    invoiceNumber: string;
    invoiceDate: string;
    invoiceType?: string;
    supplierOrParty: string;
    supplierSite: string;
    invoiceAmount: number;
    unpaidAmount: number;
    appliedPrepayments: number;
    invoiceCurrency: string;
    businessUnit: string;
    validationStatus: string;
    notes?: string;
  };
  onClose: () => void;
  onSave?: (data: any) => void;
}

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

const InvoiceDetail: React.FC<InvoiceDetailProps> = ({ invoice, onClose, onSave }) => {
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [taxLines, setTaxLines] = useState<TaxLine[]>([]);
  const [activeTab, setActiveTab] = useState('lines');

  // Fetch invoice lines on mount
  useEffect(() => {
    fetchInvoiceLines();
  }, [invoice.invoiceId]);

  // Fetch invoice lines from API
  const fetchInvoiceLines = async () => {
    setLoading(true);
    try {
      const url = `${PROXY_CONFIG.baseUrl}/apex/ap/createinvoiceslines?P_INVOICE_ID=${invoice.invoiceId}`;
      console.log('Fetching invoice lines from:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Invoice Lines Response:', data);

      // Map API response - separate by line_type
      const items = data.items || data || [];
      if (Array.isArray(items) && items.length > 0) {
        // Filter Item lines (line_type = 'Item')
        const itemLines = items.filter((item: any) => item.line_type === 'Item');
        const mappedItemLines = itemLines.map((item: any, index: number) => ({
          key: item.line_id?.toString() || index.toString(),
          lineNumber: item.line_number || index + 1,
          amount: item.line_amount || 0,
          description: item.description || '',
          quantity: item.quantity || 0,
          price: item.unit_price || 0,
          uomName: item.uom || '',
          poNumber: item.purchase_order_number || '',
          poLine: item.purchase_order_line_number || 0,
          poSchedule: item.purchase_order_schedule_line_number || 0,
          receiptNumber: item.receipt_number || '',
          receiptLine: item.receipt_line_number || 0,
          consumptionAdviceNumber: item.consumption_advice_number || '',
          consumptionAdviceLine: item.consumption_advice_line_number || 0,
          shipToLocation: item.ship_to_location || '',
          startDate: formatDate(item.multiperiod_start_date),
          endDate: formatDate(item.multiperiod_end_date),
          accrualAccount: item.multiperiod_accrual_account || '',
        }));
        setLines(mappedItemLines);

        // Filter Tax lines (line_type = 'Tax')
        const taxItems = items.filter((item: any) => item.line_type === 'Tax');
        const mappedTaxLines = taxItems.map((item: any, index: number) => ({
          key: item.line_id?.toString() || `tax-${index}`,
          lineNumber: item.line_number || index + 1,
          rateName: item.tax_rate_code || item.tax_rate_name || '',
          rate: item.tax_rate || 0,
          amount: item.line_amount || 0,
          canceled: item.canceled_flag === 'Y' ? 'Yes' : '',
          inclusive: '', // Not in API response
          selfAssessed: '', // Not in API response
          taxOnlyLine: item.line_source === 'Tax' ? 'Yes' : '',
          regime: 'UAE VAT REGIME', // Default for UAE
          taxName: 'UAE VAT',
          taxJurisdiction: 'AE_VAT',
        }));
        setTaxLines(mappedTaxLines);

        message.success(`Loaded ${mappedItemLines.length} item lines, ${mappedTaxLines.length} tax lines`);
      } else {
        setLines([]);
        setTaxLines([]);
        message.info('No invoice lines found');
      }
    } catch (error) {
      console.error('Error fetching invoice lines:', error);
      message.error(`Failed to load invoice lines: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Get validation status tag
  const getValidationTag = (status: string) => {
    const isValidated = status === 'Validated';
    return (
      <Tag color={isValidated ? 'success' : 'default'}>
        {status}
      </Tag>
    );
  };

  // Action menu items
  const actionsMenuItems: MenuProps['items'] = [
    { key: 'validate', label: 'Validate' },
    { key: 'payInFull', label: 'Pay in Full' },
    { type: 'divider' },
    { key: 'duplicate', label: 'Duplicate' },
    { key: 'delete', label: 'Delete', danger: true },
  ];

  // Items table columns
  const linesColumns: ColumnsType<InvoiceLine> = [
    {
      title: 'Line',
      dataIndex: 'lineNumber',
      key: 'lineNumber',
      width: 60,
      fixed: 'left',
      render: (value: number) => (
        <span style={{ color: REDWOOD.info }}>{value}</span>
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      align: 'right',
      render: (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2 }),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 300,
      ellipsis: true,
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      align: 'right',
      render: (value: number) => value ? value.toLocaleString() : '',
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      width: 80,
      align: 'right',
      render: (value: number) => value ? value.toFixed(2) : '',
    },
    {
      title: 'UOM Name',
      dataIndex: 'uomName',
      key: 'uomName',
      width: 80,
    },
    {
      title: 'Purchase Order',
      children: [
        {
          title: 'Number',
          dataIndex: 'poNumber',
          key: 'poNumber',
          width: 100,
          render: (value: string) => value ? (
            <span style={{ color: REDWOOD.info }}>{value}</span>
          ) : null,
        },
        {
          title: 'Line',
          dataIndex: 'poLine',
          key: 'poLine',
          width: 60,
          align: 'center',
          render: (value: number) => value || '',
        },
        {
          title: 'Schedule',
          dataIndex: 'poSchedule',
          key: 'poSchedule',
          width: 70,
          align: 'center',
          render: (value: number) => value || '',
        },
      ],
    },
    {
      title: 'Receipt',
      children: [
        {
          title: 'Number',
          dataIndex: 'receiptNumber',
          key: 'receiptNumber',
          width: 80,
          render: (value: string) => value ? (
            <span style={{ color: REDWOOD.info }}>{value}</span>
          ) : null,
        },
        {
          title: 'Line',
          dataIndex: 'receiptLine',
          key: 'receiptLine',
          width: 60,
          align: 'center',
          render: (value: number) => value || '',
        },
      ],
    },
    {
      title: 'Consumption Advice',
      children: [
        {
          title: 'Number',
          dataIndex: 'consumptionAdviceNumber',
          key: 'consumptionAdviceNumber',
          width: 80,
        },
        {
          title: 'Line',
          dataIndex: 'consumptionAdviceLine',
          key: 'consumptionAdviceLine',
          width: 60,
          align: 'center',
          render: (value: number) => value || '',
        },
      ],
    },
    {
      title: 'Ship-to Location',
      dataIndex: 'shipToLocation',
      key: 'shipToLocation',
      width: 120,
    },
    {
      title: 'Multiperiod Accounting',
      children: [
        {
          title: 'Start Date',
          dataIndex: 'startDate',
          key: 'startDate',
          width: 100,
        },
        {
          title: 'End Date',
          dataIndex: 'endDate',
          key: 'endDate',
          width: 100,
        },
        {
          title: 'Accrual Account',
          dataIndex: 'accrualAccount',
          key: 'accrualAccount',
          width: 120,
        },
      ],
    },
  ];

  // Tax lines columns
  const taxColumns: ColumnsType<TaxLine> = [
    {
      title: 'Line',
      dataIndex: 'lineNumber',
      key: 'lineNumber',
      width: 60,
    },
    {
      title: 'Rate Name',
      dataIndex: 'rateName',
      key: 'rateName',
      width: 150,
    },
    {
      title: 'Rate',
      dataIndex: 'rate',
      key: 'rate',
      width: 60,
      align: 'right',
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 100,
      align: 'right',
      render: (value: number) => value.toFixed(2),
    },
    {
      title: 'Canceled',
      dataIndex: 'canceled',
      key: 'canceled',
      width: 80,
    },
    {
      title: 'Inclusive',
      dataIndex: 'inclusive',
      key: 'inclusive',
      width: 80,
    },
    {
      title: 'Self-Assessed',
      dataIndex: 'selfAssessed',
      key: 'selfAssessed',
      width: 100,
    },
    {
      title: 'Tax Only Line',
      dataIndex: 'taxOnlyLine',
      key: 'taxOnlyLine',
      width: 100,
    },
    {
      title: 'Regime',
      dataIndex: 'regime',
      key: 'regime',
      width: 120,
    },
    {
      title: 'Tax Name',
      dataIndex: 'taxName',
      key: 'taxName',
      width: 100,
    },
    {
      title: 'Tax Jurisdiction',
      dataIndex: 'taxJurisdiction',
      key: 'taxJurisdiction',
      width: 120,
    },
  ];

  // Calculate totals
  const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0);
  const taxTotal = taxLines.reduce((sum, line) => sum + line.amount, 0);

  return (
    <div style={{ background: REDWOOD.surface }}>
      {/* Header Actions */}
      <div style={{
        padding: '8px 16px',
        borderBottom: `1px solid ${REDWOOD.neutral200}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <Title level={5} style={{ margin: 0 }}>Invoice Details</Title>
        <Space>
          {getValidationTag(invoice.validationStatus)}
          <Dropdown menu={{ items: actionsMenuItems }} trigger={['click']}>
            <Button>
              Actions <DownOutlined />
            </Button>
          </Dropdown>
          <Button icon={<SaveOutlined />} type="primary">Save</Button>
          <Button icon={<SaveOutlined />}>Save and Close</Button>
          <Button onClick={onClose}>Cancel</Button>
        </Space>
      </div>

      {/* Invoice Header Info */}
      <div style={{ padding: 16 }}>
        <Row gutter={48}>
          {/* Left Column */}
          <Col span={8}>
            <Descriptions column={1} size="small" labelStyle={{ width: 140 }}>
              <Descriptions.Item label="Invoice Date">{invoice.invoiceDate}</Descriptions.Item>
              <Descriptions.Item label="Invoice Type">{invoice.invoiceType || 'Standard'}</Descriptions.Item>
              <Descriptions.Item label="Supplier or Party">{invoice.supplierOrParty}</Descriptions.Item>
              <Descriptions.Item label="Supplier Site">
                <span style={{ color: REDWOOD.info }}>{invoice.supplierSite}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Address">
                <span style={{ color: REDWOOD.info }}>MAKANI NO.354198...</span>
              </Descriptions.Item>
            </Descriptions>
          </Col>

          {/* Center Column */}
          <Col span={8}>
            <Descriptions column={1} size="small" labelStyle={{ width: 140 }}>
              <Descriptions.Item label="Invoice Amount">
                <Text strong style={{ color: REDWOOD.info }}>
                  {invoice.invoiceAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} {invoice.invoiceCurrency}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Applied Prepayments">
                {invoice.appliedPrepayments.toFixed(2)} {invoice.invoiceCurrency}
              </Descriptions.Item>
              <Descriptions.Item label="Unpaid Amount">
                {invoice.unpaidAmount.toFixed(2)} {invoice.invoiceCurrency}
              </Descriptions.Item>
              <Descriptions.Item label="Holds">0</Descriptions.Item>
              <Descriptions.Item label="Notes">
                <Tooltip title={invoice.notes || 'No notes'}>
                  <FileTextOutlined style={{ cursor: 'pointer' }} />
                </Tooltip>
              </Descriptions.Item>
            </Descriptions>
          </Col>

          {/* Right Column */}
          <Col span={8}>
            <Descriptions column={1} size="small" labelStyle={{ width: 160 }}>
              <Descriptions.Item label="Business Unit">{invoice.businessUnit}</Descriptions.Item>
              <Descriptions.Item label="Payment Business Unit">{invoice.businessUnit}</Descriptions.Item>
              <Descriptions.Item label="Payment Terms">Net 45</Descriptions.Item>
              <Descriptions.Item label="Payment Currency">{invoice.invoiceCurrency}</Descriptions.Item>
              <Descriptions.Item label="Attachments">
                None <PlusOutlined style={{ color: REDWOOD.info, cursor: 'pointer' }} />
              </Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </div>

      {/* Detail Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        style={{ padding: '0 16px' }}
        items={[
          {
            key: 'lines',
            label: 'Lines',
            children: (
              <Spin spinning={loading}>
                {/* Items Section */}
                <Card
                  title="Items"
                  size="small"
                  style={{ marginBottom: 16 }}
                  extra={
                    <Space size="small">
                      <Text type="secondary">View</Text>
                      <DownOutlined style={{ fontSize: 10 }} />
                      <Button size="small" icon={<PlusOutlined />} />
                      <Button size="small" icon={<EditOutlined />} />
                      <Button size="small">Detach</Button>
                    </Space>
                  }
                >
                  <Table
                    columns={linesColumns}
                    dataSource={lines}
                    pagination={false}
                    size="small"
                    scroll={{ x: 1600 }}
                    bordered
                  />
                </Card>

                {/* Shipping and Handling */}
                <Card title="Shipping and Handling" size="small" style={{ marginBottom: 16 }}>
                  <Table
                    columns={[
                      { title: 'Line', dataIndex: 'line', width: 60 },
                      { title: 'Charge Type', dataIndex: 'chargeType', width: 120 },
                      { title: 'Amount', dataIndex: 'amount', width: 100 },
                      { title: 'Description', dataIndex: 'description' },
                    ]}
                    dataSource={[]}
                    pagination={false}
                    size="small"
                    locale={{ emptyText: 'No shipping and handling.' }}
                  />
                </Card>

                {/* Summary Tax Lines */}
                <Card title="Summary Tax Lines" size="small">
                  <Tabs
                    size="small"
                    items={[
                      {
                        key: 'transaction',
                        label: 'Transaction Taxes',
                        children: (
                          <>
                            <Table
                              columns={taxColumns}
                              dataSource={taxLines}
                              pagination={false}
                              size="small"
                              bordered
                              summary={() => (
                                <Table.Summary fixed>
                                  <Table.Summary.Row>
                                    <Table.Summary.Cell index={0} colSpan={3}>
                                      <Text strong>Total</Text>
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={1} align="right">
                                      <Text strong>{taxTotal.toFixed(2)}</Text>
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={2} colSpan={2} align="right">
                                      0.00
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={3} align="right">
                                      0.00
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={4} colSpan={4} />
                                  </Table.Summary.Row>
                                </Table.Summary>
                              )}
                            />
                          </>
                        ),
                      },
                      {
                        key: 'withholding',
                        label: 'Withholding Taxes',
                        children: <Text type="secondary">No withholding taxes</Text>,
                      },
                    ]}
                  />
                </Card>
              </Spin>
            ),
          },
          {
            key: 'holds',
            label: 'Holds and Approvals',
            children: (
              <Card size="small">
                <Text type="secondary">No holds or approvals pending</Text>
              </Card>
            ),
          },
          {
            key: 'payments',
            label: 'Payments',
            children: (
              <Card size="small">
                <Text type="secondary">No payments recorded</Text>
              </Card>
            ),
          },
          {
            key: 'installments',
            label: 'Installments',
            children: (
              <Card size="small">
                <Text type="secondary">No installments</Text>
              </Card>
            ),
          },
        ]}
      />

      {/* Custom styles */}
      <style>{`
        .ant-descriptions-item-label {
          color: ${REDWOOD.neutral600} !important;
          font-size: 12px;
        }
        .ant-descriptions-item-content {
          font-size: 12px;
        }
        .ant-table-thead > tr > th {
          background: ${REDWOOD.neutral100} !important;
          font-size: 11px;
          padding: 6px 8px !important;
        }
        .ant-table-tbody > tr > td {
          font-size: 12px;
          padding: 6px 8px !important;
        }
        .ant-tabs-tab {
          color: ${REDWOOD.info} !important;
        }
        .ant-tabs-tab-active {
          border-bottom: 2px solid ${REDWOOD.primary} !important;
        }
      `}</style>
    </div>
  );
};

export default InvoiceDetail;
