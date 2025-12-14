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
  Breadcrumb,
  Tooltip,
  Dropdown,
  Tabs,
  Divider,
  message,
  Spin,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  HomeOutlined,
  SaveOutlined,
  CloseOutlined,
  DownOutlined,
  UpOutlined,
  PlusOutlined,
  DeleteOutlined,
  FileTextOutlined,
  PaperClipOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';

const { Content } = Layout;
const { Title, Text } = Typography;
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

const EditJournal: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [journalData, setJournalData] = useState<JournalData | null>(null);
  const [selectedLineKeys, setSelectedLineKeys] = useState<React.Key[]>([]);

  // Get journal data passed from ManageJournals
  const passedJournal = (location.state as { journal?: any })?.journal;

  // Collapsible states
  const [batchExpanded, setBatchExpanded] = useState(false);
  const [journalExpanded, setJournalExpanded] = useState(false);

  // Active journal tab
  const [activeJournalTab, setActiveJournalTab] = useState('journal');

  // Load journal data
  useEffect(() => {
    loadJournalData();
  }, [passedJournal]);

  const loadJournalData = async () => {
    setLoading(true);
    try {
      if (passedJournal) {
        // Use journal data passed from ManageJournals
        const journalFromState: JournalData = {
          // Batch info
          batchId: passedJournal.batchId,
          jeBatchId: passedJournal.jeBatchId,
          batchName: passedJournal.batchName || '',
          batchDescription: passedJournal.batchDescription || '',
          balanceType: 'Actual',
          periodName: passedJournal.periodName || '',
          source: passedJournal.source || '',
          approvalStatusMeaning: passedJournal.approvalStatusMeaning || 'Not required',
          statusMeaning: passedJournal.statusMeaning || '',
          completionStatus: passedJournal.statusMeaning === 'Posted' ? 'Complete' : 'Incomplete',
          // Header info
          headerId: passedJournal.headerId,
          jeHeaderId: passedJournal.jeHeaderId,
          journalName: passedJournal.journalName || '',
          journalDescription: passedJournal.journalDescription || '',
          ledgerName: passedJournal.ledgerName || '',
          legalEntityName: passedJournal.legalEntityName || '',
          accountingDate: passedJournal.effectiveDate || '',
          category: passedJournal.category || '',
          currencyCode: passedJournal.currencyCode || '',
          conversionDate: passedJournal.effectiveDate || '',
          conversionRateType: 'User',
          conversionRate: 1,
          inverseConversionRate: 1,
          externalReference: passedJournal.externalReference || '',
          referenceDate: '',
          // Totals
          enteredDebit: passedJournal.enteredDebit || 0,
          enteredCredit: passedJournal.enteredCredit || 0,
          accountedDebit: passedJournal.accountedDebit || 0,
          accountedCredit: passedJournal.accountedCredit || 0,
          controlTotal: 0,
          // Sequencing (not in API response yet)
          accountingSequenceName: '',
          accountingSequenceNumber: '',
          reportingSequenceName: '',
          reportingSequenceNumber: '',
          // Reversal
          reversalPeriod: '',
          reversalMethod: 'Switch DR or CR',
          reversalStatus: 'Not reversed',
          // Lines - map from API response
          lines: (passedJournal.lines || []).map((line: any, index: number) => ({
            key: String(index + 1),
            lineId: line.lineId,
            lineNum: line.lineNum,
            account: line.account || '',
            currency: `${passedJournal.currencyCode || ''} ${getCurrencyName(passedJournal.currencyCode)}`,
            enteredDr: line.enteredDr || 0,
            enteredCr: line.enteredCr || 0,
            conversionDate: passedJournal.effectiveDate || '',
            accountedDr: line.accountedDr || 0,
            accountedCr: line.accountedCr || 0,
            description: line.description || '',
            accountDescription: passedJournal.legalEntityName || '',
          })),
        };

        setJournalData(journalFromState);
        form.setFieldsValue(journalFromState);
      } else {
        // No data passed - redirect back to manage journals
        message.warning('No journal data found. Please select a journal from the list.');
        navigate('/gl/manage-journals');
      }
    } catch (error) {
      message.error('Failed to load journal data');
    } finally {
      setLoading(false);
    }
  };

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
      title: 'Entered (INR)',
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

  // Calculate totals
  const lineTotals = journalData?.lines.reduce(
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
        {/* Header */}
        <div style={{
          padding: '12px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Space>
            <Text type="secondary">Data Access Set: {journalData?.ledgerName}</Text>
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

        {/* Page Title */}
        <div style={{
          padding: '16px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Space>
            <FileTextOutlined style={{ fontSize: 20 }} />
            <Title level={4} style={{ margin: 0 }}>Edit Journal</Title>
          </Space>
          <Space>
            <Card size="small" style={{ background: REDWOOD.neutral100 }}>
              <Space direction="vertical" size={0}>
                <Text strong>Balances</Text>
                <Space>
                  <Button size="small" type="text">PTD</Button>
                  <Button size="small" type="text">Total</Button>
                </Space>
                <Divider style={{ margin: '8px 0' }} />
                <Text type="secondary" style={{ fontSize: 12 }}>No lines selected.</Text>
              </Space>
            </Card>
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
                  Journal Batch: {journalData?.batchName}
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
                    <Col span={16}><Text>{journalData?.batchName}</Text></Col>

                    <Col span={8}><Text type="secondary">Description</Text></Col>
                    <Col span={16}><Text>{journalData?.batchDescription}</Text></Col>

                    <Col span={8}><Text type="secondary">Balance Type</Text></Col>
                    <Col span={16}><Text>{journalData?.balanceType}</Text></Col>

                    <Col span={8}><Text type="secondary"><span style={{ color: REDWOOD.primary }}>*</span> Accounting Period</Text></Col>
                    <Col span={16}><Text>{journalData?.periodName}</Text></Col>

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
                    <Col span={16}><Text>{journalData?.source}</Text></Col>

                    <Col span={8}><Text type="secondary">Approval Status</Text></Col>
                    <Col span={16}><Text>{journalData?.approvalStatusMeaning}</Text></Col>

                    <Col span={8}><Text type="secondary">Batch Status</Text></Col>
                    <Col span={16}>
                      <Tag color={journalData?.statusMeaning === 'Posted' ? REDWOOD.success : REDWOOD.warning}>
                        {journalData?.statusMeaning}
                      </Tag>
                    </Col>

                    {batchExpanded && (
                      <>
                        <Col span={8}><Text type="secondary">Completion Status</Text></Col>
                        <Col span={16}><Text>{journalData?.completionStatus}</Text></Col>
                      </>
                    )}
                  </Row>
                </Col>
              </Row>
            </div>
          </Card>

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
                <Button size="small" icon={<LeftOutlined />} />
                <Select
                  value={journalData?.journalName}
                  style={{ width: 250 }}
                  size="small"
                >
                  <Option value={journalData?.journalName}>{journalData?.journalName}</Option>
                </Select>
                <Button size="small" icon={<RightOutlined />} />
                <Button size="small" icon={<PlusOutlined />} />
                <Button size="small" icon={<DeleteOutlined />} />
                <Dropdown menu={{ items: journalActionsMenu }}>
                  <Button size="small">
                    Journal Actions <DownOutlined />
                  </Button>
                </Dropdown>
              </Space>
            </div>

            {journalExpanded && (
              <Tabs
                activeKey={activeJournalTab}
                onChange={setActiveJournalTab}
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
                              <Col span={14}><Text strong>{journalData?.journalName}</Text></Col>

                              <Col span={10}><Text type="secondary">Description</Text></Col>
                              <Col span={14}><Text>{journalData?.journalDescription}</Text></Col>

                              <Col span={10}><Text type="secondary"><span style={{ color: REDWOOD.primary }}>*</span> Ledger</Text></Col>
                              <Col span={14}><Text>{journalData?.ledgerName}</Text></Col>

                              <Col span={10}><Text type="secondary"><span style={{ color: REDWOOD.primary }}>*</span> Legal Entity Name</Text></Col>
                              <Col span={14}><Text>{journalData?.legalEntityName}</Text></Col>

                              <Col span={10}><Text type="secondary">Accounting Date</Text></Col>
                              <Col span={14}><Text>{journalData?.accountingDate}</Text></Col>

                              <Col span={10}><Text type="secondary"><span style={{ color: REDWOOD.primary }}>*</span> Category</Text></Col>
                              <Col span={14}><Text>{journalData?.category}</Text></Col>

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
                              <Col span={14}><Text>{journalData?.currencyCode} Indian Rupee</Text></Col>

                              <Col span={10}><Text type="secondary">Conversion Date</Text></Col>
                              <Col span={14}><Text>{journalData?.conversionDate}</Text></Col>

                              <Col span={10}><Text type="secondary">Conversion Rate Type</Text></Col>
                              <Col span={14}><Text>{journalData?.conversionRateType}</Text></Col>

                              <Col span={10}><Text type="secondary">Conversion Rate</Text></Col>
                              <Col span={14}><Text>{journalData?.conversionRate}</Text></Col>

                              <Col span={10}><Text type="secondary">Inverse Conversion Rate</Text></Col>
                              <Col span={14}><Text>{journalData?.inverseConversionRate}</Text></Col>

                              <Col span={10}><Text type="secondary">Reference</Text></Col>
                              <Col span={14}><Text>{journalData?.externalReference}</Text></Col>

                              <Col span={10}><Text type="secondary">Reference Date</Text></Col>
                              <Col span={14}><Text>{journalData?.referenceDate || '-'}</Text></Col>

                              <Col span={10}><Text type="secondary">Regional Information</Text></Col>
                              <Col span={14}><Text>-</Text></Col>
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
                              <Col span={12}><Text>{formatNumber(journalData?.enteredDebit)}</Text></Col>

                              <Col span={12}><Text type="secondary">Total Entered Credit</Text></Col>
                              <Col span={12}><Text>{formatNumber(journalData?.enteredCredit)}</Text></Col>
                            </Row>
                          </Col>
                          <Col span={12}>
                            <div style={{ marginTop: 32 }}>
                              <Row gutter={[8, 12]}>
                                <Col span={12}><a style={{ color: REDWOOD.info }}>Total Accounted Debit</a></Col>
                                <Col span={12}><Text>{formatNumber(journalData?.accountedDebit)}</Text></Col>

                                <Col span={12}><a style={{ color: REDWOOD.info }}>Total Accounted Credit</a></Col>
                                <Col span={12}><Text>{formatNumber(journalData?.accountedCredit)}</Text></Col>
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
                              <Col span={16}><Text>{journalData?.accountingSequenceName}</Text></Col>

                              <Col span={8}><Text type="secondary">Number</Text></Col>
                              <Col span={16}><Text>{journalData?.accountingSequenceNumber}</Text></Col>
                            </Row>
                          </Col>
                          <Col span={12}>
                            <Title level={5}><a style={{ color: REDWOOD.info }}>Reporting Sequence</a></Title>
                            <Row gutter={[8, 12]}>
                              <Col span={8}><Text type="secondary">Name</Text></Col>
                              <Col span={16}><Text>{journalData?.reportingSequenceName || '-'}</Text></Col>

                              <Col span={8}><Text type="secondary">Number</Text></Col>
                              <Col span={16}><Text>{journalData?.reportingSequenceNumber || '-'}</Text></Col>
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
                              <Col span={16}><Text>{journalData?.reversalStatus}</Text></Col>
                            </Row>
                          </Col>
                        </Row>
                      </div>
                    ),
                  },
                ]}
              />
            )}

            {!journalExpanded && (
              <div style={{ padding: 16 }}>
                <Row gutter={[24, 12]}>
                  <Col span={12}>
                    <Row gutter={[8, 8]}>
                      <Col span={8}><Text type="secondary">Journal</Text></Col>
                      <Col span={16}><Text strong>{journalData?.journalName}</Text></Col>

                      <Col span={8}><Text type="secondary">Description</Text></Col>
                      <Col span={16}><Text>{journalData?.journalDescription}</Text></Col>

                      <Col span={8}><Text type="secondary"><span style={{ color: REDWOOD.primary }}>*</span> Ledger</Text></Col>
                      <Col span={16}><Text>{journalData?.ledgerName}</Text></Col>

                      <Col span={8}><Text type="secondary"><span style={{ color: REDWOOD.primary }}>*</span> Legal Entity Name</Text></Col>
                      <Col span={16}><Text>{journalData?.legalEntityName}</Text></Col>

                      <Col span={8}><Text type="secondary">Accounting Date</Text></Col>
                      <Col span={16}><Text>{journalData?.accountingDate}</Text></Col>

                      <Col span={8}><Text type="secondary"><span style={{ color: REDWOOD.primary }}>*</span> Category</Text></Col>
                      <Col span={16}><Text>{journalData?.category}</Text></Col>
                    </Row>
                  </Col>
                  <Col span={12}>
                    <Row gutter={[8, 8]}>
                      <Col span={10}><Text type="secondary">Currency</Text></Col>
                      <Col span={14}><Text>{journalData?.currencyCode} Indian Rupee</Text></Col>

                      <Col span={10}><Text type="secondary">Conversion Date</Text></Col>
                      <Col span={14}><Text>{journalData?.conversionDate}</Text></Col>

                      <Col span={10}><Text type="secondary">Conversion Rate Type</Text></Col>
                      <Col span={14}><Text>{journalData?.conversionRateType}</Text></Col>

                      <Col span={10}><Text type="secondary">Conversion Rate</Text></Col>
                      <Col span={14}><Text>{journalData?.conversionRate}</Text></Col>

                      <Col span={10}><Text type="secondary">Inverse Conversion Rate</Text></Col>
                      <Col span={14}><Text>{journalData?.inverseConversionRate}</Text></Col>
                    </Row>
                  </Col>
                </Row>
              </div>
            )}
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
              dataSource={journalData?.lines || []}
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
      </Content>
    </Layout>
  );
};

export default EditJournal;
