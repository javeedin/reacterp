import React, { useState } from 'react';
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
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import AccountSelector from '../../components/AccountSelector';

const { Content } = Layout;
const { Title, Text, TextArea } = Typography;
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

const CreateJournal: React.FC = () => {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

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

  // Batch data
  const [batchData, setBatchData] = useState<BatchData>({
    batchName: '',
    description: '',
    balanceType: 'Actual',
    accountingPeriod: 'Mar-26',
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

  // Open account selector for a line
  const openAccountSelector = (lineKey: string) => {
    setEditingLineKey(lineKey);
    setAccountSelectorVisible(true);
  };

  // Handle account selection
  const handleAccountSelect = (accountCode: string, segments: Record<string, { value: string; description: string }>) => {
    if (editingLineKey) {
      // Build account description from segment descriptions
      const descriptions = Object.values(segments).map(s => s.description).filter(d => d);
      const accountDescription = descriptions.join(' - ');

      // Update the line with account code, description, and segment details
      setLines(prevLines => prevLines.map(line =>
        line.key === editingLineKey
          ? { ...line, account: accountCode, accountDescription, segmentDetails: segments }
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

  // Update line
  const updateLine = (key: string, field: keyof JournalLine, value: any) => {
    setLines(lines.map(line =>
      line.key === key ? { ...line, [field]: value } : line
    ));
  };

  // Save handler
  const handleSave = async () => {
    if (!batchData.batchName) {
      message.warning('Please enter a Journal Batch name');
      return;
    }
    if (!journalData.category) {
      message.warning('Please select a Category');
      return;
    }

    setSaving(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      message.success('Journal created successfully');
      navigate('/gl/manage-journals');
    } catch (error) {
      message.error('Failed to create journal');
    } finally {
      setSaving(false);
    }
  };

  // Cancel handler
  const handleCancel = () => {
    navigate(-1);  // Go back to previous page
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

  // Line columns
  const lineColumns: ColumnsType<JournalLine> = [
    {
      title: 'Line',
      dataIndex: 'lineNum',
      key: 'lineNum',
      width: 60,
      fixed: 'left',
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
      width: 350,
      render: (value, record) => (
        <div>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={value}
              onChange={(e) => updateLine(record.key, 'account', e.target.value)}
              placeholder="Select account"
              size="small"
              style={{ width: 'calc(100% - 64px)' }}
            />
            <Tooltip title="Search Account">
              <Button
                size="small"
                icon={<SearchOutlined />}
                onClick={() => openAccountSelector(record.key)}
                style={{ borderColor: REDWOOD.neutral300 }}
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
        </div>
      ),
    },
    {
      title: 'Currency',
      dataIndex: 'currency',
      key: 'currency',
      width: 140,
    },
    {
      title: `Entered (${journalData.currency})`,
      children: [
        {
          title: 'Debit',
          dataIndex: 'enteredDr',
          key: 'enteredDr',
          width: 100,
          align: 'right',
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
          width: 100,
          align: 'right',
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
          width: 110,
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
          width: 100,
          align: 'right',
          render: (value, record) => (
            <InputNumber
              value={value}
              onChange={(val) => updateLine(record.key, 'accountedDr', val)}
              size="small"
              style={{ width: '100%' }}
              min={0}
              precision={2}
            />
          ),
        },
        {
          title: 'Credit',
          dataIndex: 'accountedCr',
          key: 'accountedCr',
          width: 100,
          align: 'right',
          render: (value, record) => (
            <InputNumber
              value={value}
              onChange={(val) => updateLine(record.key, 'accountedCr', val)}
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
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 200,
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
                        style={{ width: 150 }}
                      >
                        <Option value="Jan-26">Jan-26</Option>
                        <Option value="Feb-26">Feb-26</Option>
                        <Option value="Mar-26">Mar-26</Option>
                        <Option value="Apr-26">Apr-26</Option>
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
              <Text type="secondary" style={{ fontSize: 13 }}>Batch control totals will be calculated after lines are entered.</Text>
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
                        onChange={(val) => setJournalData({ ...journalData, ledger: val })}
                        size="small"
                        style={{ width: '100%' }}
                      >
                        <Option value="BUIMERC LEDGER">BUIMERC LEDGER</Option>
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
                      <DatePicker
                        value={dayjs(journalData.accountingDate, 'D-MMM-YYYY')}
                        onChange={(date) => setJournalData({ ...journalData, accountingDate: date?.format('D-MMM-YYYY') || '' })}
                        size="small"
                        style={{ width: '100%' }}
                        format="D-MMM-YYYY"
                      />
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
                        value={dayjs(journalData.conversionDate, 'D-MMM-YYYY')}
                        onChange={(date) => setJournalData({ ...journalData, conversionDate: date?.format('D-MMM-YYYY') || '' })}
                        size="small"
                        style={{ width: '100%' }}
                        format="D-MMM-YYYY"
                      />
                    </Col>

                    <Col span={12}><Text style={{ fontSize: 13 }}>Conversion Rate Type</Text></Col>
                    <Col span={12}><Text style={{ fontSize: 13 }}>{journalData.conversionRateType}</Text></Col>

                    <Col span={12}><Text style={{ fontSize: 13 }}>Conversion Rate</Text></Col>
                    <Col span={12}><Text style={{ fontSize: 13 }}>{journalData.conversionRate}</Text></Col>
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
                        format="dd-mmm-yyyy"
                        placeholder="dd-mmm-yyyy"
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
                        style={{ width: 150 }}
                        placeholder="Select"
                        allowClear
                      >
                        <Option value="Apr-26">Apr-26</Option>
                        <Option value="May-26">May-26</Option>
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
    <Layout style={{ minHeight: '100vh', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Data Access Set Header */}
        <div style={{ padding: '4px 24px', background: REDWOOD.neutral100, fontSize: 11, color: REDWOOD.neutral600 }}>
          Data Access Set: BUIMERC LEDGER
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
            <Dropdown.Button
              size="small"
              menu={{ items: saveMenu }}
              onClick={handleSave}
              loading={saving}
              style={{ background: REDWOOD.warning }}
              type="primary"
            >
              <SaveOutlined /> Save
            </Dropdown.Button>
            <Dropdown.Button
              size="small"
              menu={{ items: completeMenu }}
              type="primary"
              style={{ background: REDWOOD.success }}
            >
              Complete
            </Dropdown.Button>
            <Dropdown.Button
              size="small"
              menu={{ items: postMenu }}
              type="primary"
              style={{ background: REDWOOD.warning }}
            >
              Post
            </Dropdown.Button>
            <Button
              size="small"
              onClick={handleCancel}
              style={{ background: REDWOOD.warning, color: '#fff', borderColor: REDWOOD.warning }}
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
              style={{
                padding: '8px 12px',
                background: REDWOOD.neutral100,
                borderBottom: `1px solid ${REDWOOD.neutral200}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Space>
                <Text strong style={{ fontSize: 13 }}>
                  <span style={{ marginRight: 4 }}>&#9660;</span> Journal Batch
                </Text>
                <QuestionCircleOutlined style={{ color: REDWOOD.neutral600, cursor: 'pointer' }} />
                <a
                  onClick={() => setBatchExpanded(!batchExpanded)}
                  style={{ color: REDWOOD.info, fontSize: 12 }}
                >
                  {batchExpanded ? 'Show Less' : 'Show More'}
                </a>
              </Space>
              <Dropdown menu={{ items: batchActionsMenu }}>
                <Button size="small" style={{ fontSize: 11 }}>
                  Batch Actions <DownOutlined />
                </Button>
              </Dropdown>
            </div>

            {batchExpanded && renderBatchTabs()}
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
              <Space>
                <Text strong style={{ fontSize: 13 }}>
                  <span style={{ marginRight: 4 }}>&#9660;</span> Journal
                </Text>
                <QuestionCircleOutlined style={{ color: REDWOOD.neutral600, cursor: 'pointer' }} />
                <a
                  onClick={() => setJournalExpanded(!journalExpanded)}
                  style={{ color: REDWOOD.info, fontSize: 12 }}
                >
                  {journalExpanded ? 'Show Less' : 'Show More'}
                </a>
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
                <Dropdown menu={{ items: journalActionsMenu }}>
                  <Button size="small" style={{ fontSize: 11 }}>
                    Journal Actions <DownOutlined />
                  </Button>
                </Dropdown>
              </Space>
            </div>

            {journalExpanded && renderJournalTabs()}
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
                <Dropdown menu={{ items: linesActionsMenu }}>
                  <Button size="small" style={{ fontSize: 11 }}>Actions <DownOutlined /></Button>
                </Dropdown>
                <Dropdown menu={{ items: linesViewMenu }}>
                  <Button size="small" style={{ fontSize: 11 }}>View <DownOutlined /></Button>
                </Dropdown>
                <Dropdown menu={{ items: linesFormatMenu }}>
                  <Button size="small" style={{ fontSize: 11 }}>Format <DownOutlined /></Button>
                </Dropdown>
                <Tooltip title="Add Row">
                  <Button size="small" icon={<PlusOutlined />} onClick={handleAddLine} />
                </Tooltip>
                <Tooltip title="Show as Table">
                  <Button size="small" icon={<TableOutlined />} />
                </Tooltip>
                <Tooltip title="Freeze Columns">
                  <Button size="small" icon={<ColumnWidthOutlined />} type="primary" style={{ background: REDWOOD.info }} />
                </Tooltip>
                <Tooltip title="Detach">
                  <Button size="small" icon={<SplitCellsOutlined />}>Detach</Button>
                </Tooltip>
                <Button size="small" style={{ fontSize: 11 }}>Wrap</Button>
              </Space>
            </div>

            {/* Filter Row */}
            <div style={{
              padding: '4px 12px',
              borderBottom: `1px solid ${REDWOOD.neutral200}`,
              display: 'flex',
              gap: 8,
              background: '#fafafa',
            }}>
              <div style={{ width: 60 }} />
              <Input size="small" style={{ width: 280 }} placeholder="" />
              <Input size="small" style={{ width: 100 }} placeholder="" />
              <Input size="small" style={{ width: 100 }} placeholder="" />
              <Input size="small" style={{ width: 100 }} placeholder="" />
              <DatePicker size="small" style={{ width: 110 }} placeholder="dd-mmm" format="DD-MMM" />
              <Input size="small" style={{ width: 100 }} placeholder="" />
              <Input size="small" style={{ width: 100 }} placeholder="" />
              <Input size="small" style={{ width: 200 }} placeholder="" />
            </div>

            {/* Lines Table */}
            <Table
              columns={lineColumns}
              dataSource={lines}
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
          }}
          onSelect={handleAccountSelect}
          initialValue={editingLineKey ? lines.find(l => l.key === editingLineKey)?.account : undefined}
        />
      </Content>
    </Layout>
  );
};

export default CreateJournal;
