import React, { useState, useCallback, useEffect } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
  Layout, Breadcrumb, Typography, Card, Table, Button, Form, Input, Select,
  DatePicker, InputNumber, Row, Col, Space, Tag, Tooltip, Tabs, Collapse,
  message, Empty, Divider, Badge, Segmented, Modal,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { TableRowSelection } from 'antd/es/table/interface';
import {
  HomeOutlined, BankOutlined, SearchOutlined, ReloadOutlined,
  CheckOutlined, CloseOutlined, ReconciliationOutlined, FileTextOutlined,
  ApiOutlined, CopyOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

// ── Theme ──────────────────────────────────────────────────────────────────────
const REDWOOD = {
  primary:      '#C74634',
  primaryLight: '#E85D4A',
  success:      '#1D7B4D',
  warning:      '#D4A800',
  info:         '#0572CE',
  error:        '#D93025',
  neutral100:   '#F7F7F7',
  neutral200:   '#E5E5E5',
  neutral300:   '#C7C7C7',
  neutral600:   '#6B6B6B',
  neutral900:   '#1A1A1A',
  surface:      '#FFFFFF',
};

const APEX_BASE =
  'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp';

// ── Types ─────────────────────────────────────────────────────────────────────
interface StmtLine {
  lineId: number;
  statementId: number;
  statementNumber: string;
  transactionDate: string;
  valueDate?: string;
  amount: number;
  transactionCode: string; // CR | DR
  description?: string;
  reference?: string;
  bankTxnReference?: string;
  counterpartyName?: string;
  reconStatus: string;
  reconAmount?: number;
  reconTxnType?: string;
  reconTxnNumber?: string;
  reconNotes?: string;
  reconDate?: string;
  bankAccountName: string;
  currencyCode?: string;
}

interface SysTxn {
  txnId: number;
  txnNumber: string;
  reference?: string;
  txnDate: string;
  amount: number;
  currencyCode?: string;
  businessUnit?: string;
  bankAccountName?: string;
  reconciledFlag?: string;
  txnStatus?: string;
  source: 'AP_PAYMENT' | 'AR_RECEIPT' | 'GL_JOURNAL' | string;
  // AP Payment
  payee?: string;
  supplierNumber?: string;
  paymentMethod?: string;
  paymentType?: string;
  clearingDate?: string;
  // AR Receipt
  customerName?: string;
  customerNumber?: string;
  receiptMethod?: string;
  // GL Journal
  accountCode?: string;
  accountDescription?: string;
  journalCategory?: string;
  lineDescription?: string;
}

interface BankAcctOption {
  label: string;
  value: string;
  bankAccountNumber?: string;
  currencyCode?: string;
  legalEntityName?: string;
}

interface BUOption {
  label: string;
  value: string;
  legalEntityName?: string;
}

interface BankStatement {
  statementId: number;
  statementNumber: string;
  statementDate: string;
  bankAccountName: string;
  openingBalance?: number;
  closingBalance?: number;
  status?: string;
  lineCount?: number;
  currencyCode?: string;
}

interface SearchParams {
  bankAccount?: string;
  dateFrom?: Dayjs | null;
  dateTo?: Dayjs | null;
  amountMin?: number;
  amountMax?: number;
  statementId?: string;
  reference?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const parseApexJson = async (res: Response): Promise<{ status: string; items?: unknown[]; message?: string }> => {
  const text = await res.text();
  const fixed = text
    .replace(/:(-?)\.(\d)/g, ':$10.$2')
    .replace(/(\d)\.([,}\]])/g, '$1$2');
  return JSON.parse(fixed);
};

const fmtAmount = (v?: number | null, ccy?: string): string => {
  if (v == null) return '—';
  const s = new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
  return ccy ? `${s} ${ccy}` : s;
};

const fmtDate = (d?: string): string => {
  if (!d) return '—';
  try {
    return dayjs(d).format('D-MMM-YYYY');
  } catch {
    return d;
  }
};

const sumSelected = (items: StmtLine[] | SysTxn[], keys: React.Key[]): number => {
  const keySet = new Set(keys.map(String));
  return (items as Array<{ amount: number } & (StmtLine | SysTxn)>)
    .filter((r) => {
      const k = 'lineId' in r ? String(r.lineId) : String((r as SysTxn).txnId);
      return keySet.has(k);
    })
    .reduce((acc, r) => acc + (r.amount ?? 0), 0);
};

// ── Search Panel ──────────────────────────────────────────────────────────────
interface SearchPanelProps {
  bankAccounts: BankAcctOption[];
  businessUnits: BUOption[];
  loadingAccounts: boolean;
  onSearch: (params: SearchParams) => void;
  onReset: () => void;
}

const SearchPanel: React.FC<SearchPanelProps> = ({
  bankAccounts,
  businessUnits,
  loadingAccounts,
  onSearch,
  onReset,
}) => {
  const [form] = Form.useForm<SearchParams>();
  const [selectedBu, setSelectedBu] = useState<string | undefined>();

  const filteredAccounts = selectedBu
    ? (() => {
        const le = businessUnits.find(b => b.value === selectedBu)?.legalEntityName ?? '';
        return le ? bankAccounts.filter(a => a.legalEntityName === le) : bankAccounts;
      })()
    : bankAccounts;

  const handleSearch = () => {
    const vals = form.getFieldsValue();
    onSearch(vals);
  };

  const handleReset = () => {
    form.resetFields();
    onReset();
  };

  return (
    <Collapse
      defaultActiveKey={['search']}
      style={{ marginBottom: 16 }}
      items={[
        {
          key: 'search',
          label: (
            <Space>
              <SearchOutlined />
              <span>Search Filters</span>
            </Space>
          ),
          children: (
            <Form form={form} layout="vertical" size="small">
              <Row gutter={[12, 0]}>
                <Col xs={24} sm={12} lg={5}>
                  <Form.Item name="businessUnit" label={<Text style={{ fontWeight: 600 }}>Business Unit</Text>}>
                    <Select
                      showSearch allowClear
                      placeholder="Select BU"
                      options={businessUnits}
                      filterOption={(input, option) =>
                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                      onChange={(v: string | undefined) => {
                        setSelectedBu(v ?? undefined);
                        form.setFieldValue('bankAccount', undefined);
                      }}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} lg={7}>
                  <Form.Item
                    name="bankAccount"
                    label={<Text style={{ fontWeight: 600 }}>Bank Account</Text>}
                    rules={[{ required: true, message: 'Bank account is required' }]}
                  >
                    <Select
                      showSearch
                      allowClear
                      loading={loadingAccounts}
                      placeholder={selectedBu ? 'Select bank account' : 'Select BU first or pick account'}
                      filterOption={(input, option) =>
                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                      options={filteredAccounts}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} lg={4}>
                  <Form.Item name="dateFrom" label="Date From">
                    <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} lg={4}>
                  <Form.Item name="dateTo" label="Date To">
                    <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} lg={3}>
                  <Form.Item name="amountMin" label="Amount From">
                    <InputNumber style={{ width: '100%' }} min={0} placeholder="0.00" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} lg={3}>
                  <Form.Item name="amountMax" label="Amount To">
                    <InputNumber style={{ width: '100%' }} min={0} placeholder="0.00" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} lg={3}>
                  <Form.Item name="reference" label="Reference">
                    <Input placeholder="Reference" />
                  </Form.Item>
                </Col>
              </Row>
              <Row justify="end">
                <Space>
                  <Button
                    type="primary"
                    icon={<SearchOutlined />}
                    onClick={handleSearch}
                    style={{ backgroundColor: REDWOOD.primary, borderColor: REDWOOD.primary }}
                  >
                    Search
                  </Button>
                  <Button icon={<ReloadOutlined />} onClick={handleReset}>
                    Reset
                  </Button>
                </Space>
              </Row>
            </Form>
          ),
        },
      ]}
    />
  );
};

// ── Statement Selector ────────────────────────────────────────────────────────
interface StatementSelectorProps {
  statements: BankStatement[];
  loading: boolean;
  selectedId: number | null;
  onSelect: (stmt: BankStatement) => void;
}

const StatementSelector: React.FC<StatementSelectorProps> = ({
  statements, loading, selectedId, onSelect,
}) => {
  const columns: ColumnsType<BankStatement> = [
    {
      title: 'Statement #',
      dataIndex: 'statementNumber',
      key: 'statementNumber',
      width: 140,
      ellipsis: true,
    },
    {
      title: 'Date',
      dataIndex: 'statementDate',
      key: 'statementDate',
      width: 110,
      render: (v: string) => fmtDate(v),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (v: string) => {
        const color = v === 'RECONCILED' ? 'green' : v === 'PARTIALLY_RECONCILED' ? 'orange' : 'blue';
        return v ? <Tag color={color} style={{ margin: 0 }}>{v.replace(/_/g, ' ')}</Tag> : '—';
      },
    },
    {
      title: 'Opening Bal',
      dataIndex: 'openingBalance',
      key: 'openingBalance',
      width: 120,
      align: 'right',
      render: (v: number) => fmtAmount(v),
    },
    {
      title: 'Closing Bal',
      dataIndex: 'closingBalance',
      key: 'closingBalance',
      width: 120,
      align: 'right',
      render: (v: number) => fmtAmount(v),
    },
    {
      title: 'Lines',
      dataIndex: 'lineCount',
      key: 'lineCount',
      width: 70,
      align: 'center',
      render: (v: number) => v ?? '—',
    },
  ];

  return (
    <Card
      size="small"
      title={
        <Space>
          <FileTextOutlined style={{ color: REDWOOD.info }} />
          <span style={{ fontWeight: 600 }}>Select a Bank Statement</span>
          <Badge count={statements.length} style={{ backgroundColor: REDWOOD.info }} showZero />
        </Space>
      }
      style={{ marginBottom: 16, border: `1px solid ${REDWOOD.neutral200}` }}
      styles={{ body: { padding: 0 } }}
    >
      <Table<BankStatement>
        rowKey="statementId"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={statements}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedId != null ? [selectedId] : [],
          onChange: (_, rows) => rows[0] && onSelect(rows[0]),
        }}
        onRow={(record) => ({
          onClick:  () => onSelect(record),
          style:    {
            cursor:          'pointer',
            backgroundColor: record.statementId === selectedId ? REDWOOD.info + '12' : undefined,
          },
        })}
        pagination={false}
        scroll={{ x: 700, y: 200 }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No statements found — select a bank account and search"
            />
          ),
        }}
      />
    </Card>
  );
};

// ── Unreconciled Tab ──────────────────────────────────────────────────────────
interface UnreconciledTabProps {
  bankAccounts: BankAcctOption[];
  businessUnits: BUOption[];
  loadingAccounts: boolean;
}

const UnreconciledTab: React.FC<UnreconciledTabProps> = ({ bankAccounts, businessUnits, loadingAccounts }) => {
  const [statements, setStatements]             = useState<BankStatement[]>([]);
  const [loadingStmts, setLoadingStmts]         = useState(false);
  const [selectedStatement, setSelectedStatement] = useState<BankStatement | null>(null);
  const [stmtLines, setStmtLines]             = useState<StmtLine[]>([]);
  const [sysTxns, setSysTxns]                 = useState<SysTxn[]>([]);
  const [loadingStmt, setLoadingStmt]         = useState(false);
  const [loadingSys, setLoadingSys]           = useState(false);
  const [reconciling, setReconciling]         = useState(false);
  const [txnSourceFilter, setTxnSourceFilter] = useState<string>('ALL');
  const [selectedStmtKeys, setSelectedStmtKeys] = useState<React.Key[]>([]);
  const [selectedSysKeys, setSelectedSysKeys]   = useState<React.Key[]>([]);
  const [lastParams, setLastParams]           = useState<SearchParams | null>(null);
  const [msgApi, contextHolder]               = message.useMessage();
  const [lastStatementsUrl, setLastStatementsUrl] = useState<string | null>(null);
  const [lastStmtLinesUrl, setLastStmtLinesUrl] = useState<string | null>(null);
  const [apiModalUrl, setApiModalUrl] = useState<string | null>(null);
  const [apiModalTitle, setApiModalTitle] = useState('');
  const [apiModalVisible, setApiModalVisible] = useState(false);
  const [apiExecResult, setApiExecResult] = useState<{ loading: boolean; response: string | null }>({ loading: false, response: null });

  const fetchStatements = useCallback(async (params: SearchParams) => {
    const q = new URLSearchParams();
    if (params.bankAccount) q.set('bank_account', params.bankAccount);
    if (params.dateFrom)    q.set('date_from',    params.dateFrom.format('YYYY-MM-DD'));
    if (params.dateTo)      q.set('date_to',      params.dateTo.format('YYYY-MM-DD'));
    q.set('row_limit', '200');

    const statementsUrl = `${APEX_BASE}/cash/bankstatements?${q.toString()}`;
    setLastStatementsUrl(statementsUrl);
    setLoadingStmts(true);
    try {
      const res  = await fetch(statementsUrl);
      const data = await parseApexJson(res);
      if (data.status === 'success') {
        setStatements((data.items ?? []) as BankStatement[]);
      } else {
        msgApi.error(data.message ?? 'Failed to load statements');
      }
    } catch (err) {
      msgApi.error('Network error loading statements');
      console.error(err);
    } finally {
      setLoadingStmts(false);
    }
  }, [msgApi]);

  const fetchStmtLines = useCallback(async (params: SearchParams) => {
    const q = new URLSearchParams();
    if (params.bankAccount) q.set('bank_account', params.bankAccount);
    q.set('recon_status', 'UNRECONCILED');
    if (params.dateFrom)   q.set('date_from',    params.dateFrom.format('YYYY-MM-DD'));
    if (params.dateTo)     q.set('date_to',      params.dateTo.format('YYYY-MM-DD'));
    if (params.amountMin != null) q.set('amount_min', String(params.amountMin));
    if (params.amountMax != null) q.set('amount_max', String(params.amountMax));
    if (params.statementId)  q.set('statement_id', params.statementId);
    if (params.reference)    q.set('reference',    params.reference);
    q.set('row_limit', '500');

    const stmtLinesUrl = `${APEX_BASE}/cash/reconciliation/stmtlines?${q.toString()}`;
    setLastStmtLinesUrl(stmtLinesUrl);
    setLoadingStmt(true);
    try {
      const res  = await fetch(stmtLinesUrl);
      const data = await parseApexJson(res);
      if (data.status === 'success') {
        setStmtLines((data.items ?? []) as StmtLine[]);
      } else {
        msgApi.error(data.message ?? 'Failed to load statement lines');
      }
    } catch (err) {
      msgApi.error('Network error loading statement lines');
      console.error(err);
    } finally {
      setLoadingStmt(false);
    }
  }, [msgApi]);

  const fetchSysTxns = useCallback(async (params: SearchParams, txnType?: string) => {
    const q = new URLSearchParams();
    if (params.bankAccount) q.set('bank_account', params.bankAccount);
    if (params.dateFrom)   q.set('date_from',    params.dateFrom.format('YYYY-MM-DD'));
    if (params.dateTo)     q.set('date_to',      params.dateTo.format('YYYY-MM-DD'));
    if (params.amountMin != null) q.set('amount_min', String(params.amountMin));
    if (params.amountMax != null) q.set('amount_max', String(params.amountMax));
    if (params.reference) q.set('reference', params.reference);
    if (txnType && txnType !== 'ALL') q.set('txn_type', txnType);
    q.set('reconciled', 'N');
    q.set('row_limit', '500');

    setLoadingSys(true);
    try {
      const res  = await fetch(`${APEX_BASE}/cash/reconciliation/systxns?${q.toString()}`);
      const data = await parseApexJson(res);
      if (data.status === 'success') {
        setSysTxns((data.items ?? []) as SysTxn[]);
      } else {
        msgApi.error(data.message ?? 'Failed to load system transactions');
      }
    } catch (err) {
      msgApi.error('Network error loading system transactions');
      console.error(err);
    } finally {
      setLoadingSys(false);
    }
  }, [msgApi]);

  // ── API Inspector ─────────────────────────────────────────────────────────
  const [apiModal, setApiModal]   = useState(false);
  const [apiCopied, setApiCopied] = useState(false);

  const buildSysTxnsUrl = useCallback((txnType: string) => {
    const q = new URLSearchParams();
    if (lastParams?.bankAccount) q.set('bank_account', lastParams.bankAccount);
    if (lastParams?.dateFrom)    q.set('date_from',    lastParams.dateFrom.format('YYYY-MM-DD'));
    if (lastParams?.dateTo)      q.set('date_to',      lastParams.dateTo.format('YYYY-MM-DD'));
    if (lastParams?.amountMin != null) q.set('amount_min', String(lastParams.amountMin));
    if (lastParams?.amountMax != null) q.set('amount_max', String(lastParams.amountMax));
    if (lastParams?.reference)   q.set('reference',    lastParams.reference);
    if (txnType && txnType !== 'ALL') q.set('txn_type', txnType);
    q.set('reconciled', 'N');
    q.set('row_limit', '500');
    return `${APEX_BASE}/cash/reconciliation/systxns?${q.toString()}`;
  }, [lastParams]);

  const handleCopyUrl = useCallback((url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setApiCopied(true);
      setTimeout(() => setApiCopied(false), 2000);
    });
  }, []);

  const handleSearch = useCallback((params: SearchParams) => {
    if (!params.bankAccount) {
      msgApi.warning('Please select a bank account');
      return;
    }
    setLastParams(params);
    setSelectedStatement(null);
    setSelectedStmtKeys([]);
    setSelectedSysKeys([]);
    setStmtLines([]);
    setSysTxns([]);
    fetchStatements(params);
  }, [fetchStatements, msgApi]);

  const handleSelectStatement = useCallback((stmt: BankStatement) => {
    setSelectedStatement(stmt);
    setSelectedStmtKeys([]);
    setSelectedSysKeys([]);
    const lineParams: SearchParams = {
      ...(lastParams ?? {}),
      statementId: String(stmt.statementId),
    };
    // For sys txns: only apply dates if the user explicitly set them in the search panel.
    // Do NOT fall back to stmtDate — that would restrict to a single day and hide most transactions.
    const txnParams: SearchParams = {
      ...(lastParams ?? {}),
      dateFrom: lastParams?.dateFrom ?? null,
      dateTo:   lastParams?.dateTo   ?? null,
    };
    fetchStmtLines(lineParams);
    fetchSysTxns(txnParams, txnSourceFilter);
  }, [lastParams, fetchStmtLines, fetchSysTxns, txnSourceFilter]);

  const handleReset = useCallback(() => {
    setStatements([]);
    setSelectedStatement(null);
    setStmtLines([]);
    setSysTxns([]);
    setSelectedStmtKeys([]);
    setSelectedSysKeys([]);
    setLastParams(null);
  }, []);

  const handleReconcile = useCallback(async () => {
    if (selectedStmtKeys.length === 0 || selectedSysKeys.length === 0) return;

    const visibleSysTxns = txnSourceFilter === 'ALL'
      ? sysTxns
      : sysTxns.filter((t) => t.source === txnSourceFilter);

    const selectedLines = stmtLines.filter((l) =>
      selectedStmtKeys.includes(l.lineId)
    );
    const selectedTxns = visibleSysTxns.filter((t) =>
      selectedSysKeys.includes(t.txnId)
    );

    setReconciling(true);
    let successCount = 0;
    let errorCount   = 0;

    for (let i = 0; i < selectedLines.length; i++) {
      const line   = selectedLines[i];
      // Use matching txn by index if multiple, otherwise always use first
      const sysTxn = selectedTxns[i] ?? selectedTxns[0];

      const body = {
        lineId:      line.lineId,
        txnType:     sysTxn.source,
        txnId:       sysTxn.txnId,
        txnNumber:   sysTxn.txnNumber,
        reconAmount: line.amount,
        notes:       '',
      };

      try {
        const res = await fetch(
          `${APEX_BASE}/cash/bankstatements/${line.statementId}/reconcile`,
          {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
          }
        );
        const data = await parseApexJson(res);
        if (data.status === 'success') {
          successCount++;
        } else {
          errorCount++;
          console.error('Reconcile error for line', line.lineId, data.message);
        }
      } catch (err) {
        errorCount++;
        console.error('Network error reconciling line', line.lineId, err);
      }
    }

    setReconciling(false);

    if (successCount > 0) {
      msgApi.success(`Reconciled ${successCount} line(s) successfully`);
    }
    if (errorCount > 0) {
      msgApi.error(`${errorCount} line(s) failed to reconcile`);
    }

    setSelectedStmtKeys([]);
    setSelectedSysKeys([]);
    if (selectedStatement) {
      handleSelectStatement(selectedStatement);
    } else if (lastParams) {
      fetchStmtLines(lastParams);
      fetchSysTxns(lastParams);
    }
  }, [selectedStmtKeys, selectedSysKeys, stmtLines, sysTxns, txnSourceFilter, lastParams, selectedStatement, handleSelectStatement, fetchStmtLines, fetchSysTxns, msgApi]);

  // ── Column definitions ────────────────────────────────────────────────────
  const stmtColumns: ColumnsType<StmtLine> = [
    {
      title: 'Reference',
      dataIndex: 'reference',
      key: 'reference',
      width: 130,
      ellipsis: true,
      render: (v: string, r) => (
        <Tooltip title={r.bankTxnReference || v}>
          <span>{v || r.bankTxnReference || '—'}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'transactionDate',
      key: 'transactionDate',
      width: 100,
      render: (v: string) => fmtDate(v),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 110,
      align: 'right',
      render: (v: number, r) => (
        <span
          style={{
            color:      r.transactionCode === 'CR' ? REDWOOD.success : REDWOOD.error,
            fontWeight: 500,
          }}
        >
          {fmtAmount(v)}
        </span>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'transactionCode',
      key: 'transactionCode',
      width: 60,
      render: (v: string) => (
        <Tag color={v === 'CR' ? 'green' : 'red'} style={{ margin: 0 }}>
          {v}
        </Tag>
      ),
    },
    {
      title: 'Statement #',
      dataIndex: 'statementNumber',
      key: 'statementNumber',
      width: 110,
      ellipsis: true,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v: string) => (
        <Tooltip title={v}>
          <span>{v || '—'}</span>
        </Tooltip>
      ),
    },
  ];

  const SOURCE_COLORS: Record<string, string> = {
    AP_PAYMENT: 'geekblue',
    AR_RECEIPT: 'green',
    GL_JOURNAL: 'purple',
  };

  const colTxnNumber: ColumnsType<SysTxn>[number] = {
    title: 'Txn #',
    dataIndex: 'txnNumber',
    key: 'txnNumber',
    width: 130,
    ellipsis: true,
  };
  const colDate: ColumnsType<SysTxn>[number] = {
    title: 'Date',
    dataIndex: 'txnDate',
    key: 'txnDate',
    width: 100,
    render: (v: string) => fmtDate(v),
  };
  const colAmount: ColumnsType<SysTxn>[number] = {
    title: 'Amount',
    dataIndex: 'amount',
    key: 'amount',
    width: 110,
    align: 'right',
    render: (v: number) => <span style={{ fontWeight: 500 }}>{fmtAmount(v)}</span>,
  };
  const colCurrency: ColumnsType<SysTxn>[number] = {
    title: 'CCY',
    dataIndex: 'currencyCode',
    key: 'currencyCode',
    width: 55,
    render: (v: string) => v || '—',
  };
  const colBU: ColumnsType<SysTxn>[number] = {
    title: 'Business Unit',
    dataIndex: 'businessUnit',
    key: 'businessUnit',
    width: 120,
    ellipsis: true,
    render: (v: string) => v || '—',
  };
  const colStatus: ColumnsType<SysTxn>[number] = {
    title: 'Status',
    dataIndex: 'txnStatus',
    key: 'txnStatus',
    width: 100,
    render: (v: string) =>
      v ? <Tag color={v === 'Cleared' || v === 'Applied' ? 'green' : 'blue'} style={{ margin: 0 }}>{v}</Tag> : <span>—</span>,
  };

  const sysColumnsAP: ColumnsType<SysTxn> = [
    colTxnNumber,
    colDate,
    colAmount,
    colCurrency,
    {
      title: 'Supplier / Payee',
      dataIndex: 'payee',
      key: 'payee',
      ellipsis: true,
      render: (v: string, r) => (
        <Tooltip title={r.supplierNumber ? `${v} (${r.supplierNumber})` : v}>
          <span>{v || '—'}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Payment Method',
      dataIndex: 'paymentMethod',
      key: 'paymentMethod',
      width: 130,
      render: (v: string) => v || '—',
    },
    {
      title: 'Clearing Date',
      dataIndex: 'clearingDate',
      key: 'clearingDate',
      width: 110,
      render: (v: string) => fmtDate(v),
    },
    colStatus,
    colBU,
  ];

  const sysColumnsAR: ColumnsType<SysTxn> = [
    colTxnNumber,
    colDate,
    colAmount,
    colCurrency,
    {
      title: 'Customer',
      dataIndex: 'customerName',
      key: 'customerName',
      ellipsis: true,
      render: (v: string, r) => (
        <Tooltip title={r.customerNumber ? `${v} (${r.customerNumber})` : v}>
          <span>{v || '—'}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Receipt Method',
      dataIndex: 'receiptMethod',
      key: 'receiptMethod',
      width: 130,
      render: (v: string) => v || '—',
    },
    colStatus,
    colBU,
  ];

  const sysColumnsGL: ColumnsType<SysTxn> = [
    colTxnNumber,
    colDate,
    colAmount,
    colCurrency,
    {
      title: 'Account',
      dataIndex: 'accountCode',
      key: 'accountCode',
      width: 140,
      ellipsis: true,
      render: (v: string, r) => (
        <Tooltip title={r.accountDescription || v}>
          <span>{v || '—'}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'journalCategory',
      key: 'journalCategory',
      width: 110,
      render: (v: string) => v || '—',
    },
    {
      title: 'Description',
      dataIndex: 'lineDescription',
      key: 'lineDescription',
      ellipsis: true,
      render: (v: string) => (
        <Tooltip title={v}>
          <span>{v || '—'}</span>
        </Tooltip>
      ),
    },
    colBU,
  ];

  const sysColumnsAll: ColumnsType<SysTxn> = [
    {
      title: 'Source',
      dataIndex: 'source',
      key: 'source',
      width: 105,
      render: (v: string) => (
        <Tag color={SOURCE_COLORS[v] ?? 'default'} style={{ margin: 0, fontSize: 11 }}>
          {v === 'AP_PAYMENT' ? 'AP Payment' : v === 'AR_RECEIPT' ? 'AR Receipt' : v === 'GL_JOURNAL' ? 'GL Journal' : v}
        </Tag>
      ),
    },
    colTxnNumber,
    colDate,
    colAmount,
    colCurrency,
    {
      title: 'Party / Account',
      key: 'party',
      ellipsis: true,
      render: (_: unknown, r: SysTxn) => {
        const val = r.payee || r.customerName || r.accountCode || '—';
        const sub = r.supplierNumber || r.customerNumber || r.accountDescription;
        return (
          <Tooltip title={sub ? `${val} (${sub})` : val}>
            <span>{val}</span>
          </Tooltip>
        );
      },
    },
    {
      title: 'Method / Category',
      key: 'method',
      width: 130,
      ellipsis: true,
      render: (_: unknown, r: SysTxn) =>
        r.paymentMethod || r.receiptMethod || r.journalCategory || '—',
    },
    colStatus,
    colBU,
  ];

  const sysColumns =
    txnSourceFilter === 'AP_PAYMENT' ? sysColumnsAP :
    txnSourceFilter === 'AR_RECEIPT' ? sysColumnsAR :
    txnSourceFilter === 'GL_JOURNAL' ? sysColumnsGL :
    sysColumnsAll;

  const filteredSysTxns = txnSourceFilter === 'ALL'
    ? sysTxns
    : sysTxns.filter((t) => t.source === txnSourceFilter);

  const stmtRowSelection: TableRowSelection<StmtLine> = {
    type: 'checkbox',
    selectedRowKeys: selectedStmtKeys,
    onChange: (keys) => setSelectedStmtKeys(keys),
  };

  const sysRowSelection: TableRowSelection<SysTxn> = {
    type: 'checkbox',
    selectedRowKeys: selectedSysKeys,
    onChange: (keys) => setSelectedSysKeys(keys),
  };

  const stmtSelectedAmount = sumSelected(stmtLines, selectedStmtKeys);
  const sysSelectedAmount  = sumSelected(filteredSysTxns, selectedSysKeys);
  const difference         = stmtSelectedAmount - sysSelectedAmount;

  const canReconcile = selectedStmtKeys.length > 0 && selectedSysKeys.length > 0;

  return (
    <>
      {contextHolder}
      <SearchPanel
        bankAccounts={bankAccounts}
        businessUnits={businessUnits}
        loadingAccounts={loadingAccounts}
        onSearch={handleSearch}
        onReset={handleReset}
      />

      <div style={{ position: 'relative' }}>
        <StatementSelector
          statements={statements}
          loading={loadingStmts}
          selectedId={selectedStatement?.statementId ?? null}
          onSelect={handleSelectStatement}
        />
        {lastStatementsUrl && (
          <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
            <Tooltip title="View Bank Statements API">
              <Button
                size="small"
                icon={<ApiOutlined />}
                style={{ color: REDWOOD.info, borderColor: REDWOOD.info, fontSize: 11 }}
                onClick={() => { setApiExecResult({ loading: false, response: null }); setApiModalTitle('Bank Statements API'); setApiModalUrl(lastStatementsUrl); setApiModalVisible(true); }}
              />
            </Tooltip>
          </div>
        )}
      </div>

      {selectedStatement && (
        <div
          style={{
            background:   REDWOOD.info + '12',
            border:       `1px solid ${REDWOOD.info}40`,
            borderRadius: 6,
            padding:      '8px 14px',
            marginBottom: 12,
            display:      'flex',
            gap:          20,
            flexWrap:     'wrap',
            alignItems:   'center',
          }}
        >
          <Text style={{ fontSize: 12, color: REDWOOD.info, fontWeight: 600 }}>
            Selected Statement:
          </Text>
          <Text style={{ fontSize: 12 }}>
            <strong>{selectedStatement.statementNumber}</strong>
          </Text>
          <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>
            {fmtDate(selectedStatement.statementDate)}
          </Text>
          <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>
            {selectedStatement.bankAccountName}
          </Text>
          {selectedStatement.status && (
            <Tag
              color={
                selectedStatement.status === 'RECONCILED'
                  ? 'green'
                  : selectedStatement.status === 'PARTIALLY_RECONCILED'
                  ? 'orange'
                  : 'blue'
              }
              style={{ margin: 0, fontSize: 11 }}
            >
              {selectedStatement.status.replace(/_/g, ' ')}
            </Tag>
          )}
          {selectedStatement.openingBalance != null && (
            <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>
              Opening: <strong>{fmtAmount(selectedStatement.openingBalance)}</strong>
            </Text>
          )}
          {selectedStatement.closingBalance != null && (
            <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>
              Closing: <strong>{fmtAmount(selectedStatement.closingBalance)}</strong>
            </Text>
          )}
        </div>
      )}

      <Row gutter={[16, 16]}>
        {/* ── LEFT: Bank Statement Lines ─────────────────────────────── */}
        <Col xs={24} lg={12}>
          <Card
            size="small"
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <BankOutlined style={{ color: REDWOOD.primary }} />
                  <span style={{ fontWeight: 600 }}>Bank Statement Lines</span>
                  <Badge count={stmtLines.length} style={{ backgroundColor: REDWOOD.info }} showZero />
                </Space>
                {lastStmtLinesUrl && (
                  <Tooltip title="View Statement Lines API">
                    <Button
                      size="small"
                      icon={<ApiOutlined />}
                      style={{ color: REDWOOD.info, borderColor: REDWOOD.info, fontSize: 11 }}
                      onClick={() => { setApiExecResult({ loading: false, response: null }); setApiModalTitle('Statement Lines API'); setApiModalUrl(lastStmtLinesUrl); setApiModalVisible(true); }}
                    />
                  </Tooltip>
                )}
              </div>
            }
            styles={{ body: { padding: 0 } }}
          >
            <Table<StmtLine>
              rowKey="lineId"
              size="small"
              loading={loadingStmt}
              columns={stmtColumns}
              dataSource={stmtLines}
              rowSelection={stmtRowSelection}
              pagination={false}
              scroll={{ x: 560, y: 420 }}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No unreconciled statement lines"
                  />
                ),
              }}
            />
            <div
              style={{
                padding:         '8px 12px',
                backgroundColor: REDWOOD.neutral100,
                borderTop:       `1px solid ${REDWOOD.neutral200}`,
                display:         'flex',
                gap:             16,
              }}
            >
              <Text style={{ color: REDWOOD.neutral600, fontSize: 12 }}>
                Selected: <strong>{selectedStmtKeys.length}</strong>
              </Text>
              <Divider type="vertical" />
              <Text style={{ color: REDWOOD.neutral600, fontSize: 12 }}>
                Amount:{' '}
                <strong style={{ color: REDWOOD.neutral900 }}>
                  {fmtAmount(stmtSelectedAmount)}
                </strong>
              </Text>
            </div>
          </Card>
        </Col>

        {/* ── RIGHT: System Transactions ────────────────────────────── */}
        <Col xs={24} lg={12}>
          <Card
            size="small"
            title={
              <Space wrap>
                <ReconciliationOutlined style={{ color: REDWOOD.primary }} />
                <span style={{ fontWeight: 600 }}>System Transactions</span>
                <Badge count={filteredSysTxns.length} style={{ backgroundColor: REDWOOD.info }} showZero />
              </Space>
            }
            extra={
              <Space size={8}>
                <Segmented
                  size="small"
                  value={txnSourceFilter}
                  onChange={(v) => setTxnSourceFilter(v as string)}
                  options={[
                    { label: 'All', value: 'ALL' },
                    { label: 'AP', value: 'AP_PAYMENT' },
                    { label: 'AR', value: 'AR_RECEIPT' },
                    { label: 'GL', value: 'GL_JOURNAL' },
                  ]}
                />
                <Tooltip title="API Inspector — view endpoint & parameters">
                  <Button
                    size="small"
                    icon={<ApiOutlined />}
                    onClick={() => { setApiCopied(false); setApiModal(true); }}
                    style={{ color: REDWOOD.info, borderColor: REDWOOD.info }}
                  />
                </Tooltip>
              </Space>
            }
            styles={{ body: { padding: 0 } }}
          >
            <Table<SysTxn>
              rowKey="txnId"
              size="small"
              loading={loadingSys}
              columns={sysColumns}
              dataSource={filteredSysTxns}
              rowSelection={sysRowSelection}
              pagination={false}
              scroll={{ x: 560, y: 420 }}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No unreconciled system transactions"
                  />
                ),
              }}
            />
            <div
              style={{
                padding:         '8px 12px',
                backgroundColor: REDWOOD.neutral100,
                borderTop:       `1px solid ${REDWOOD.neutral200}`,
                display:         'flex',
                gap:             16,
                flexWrap:        'wrap',
              }}
            >
              <Text style={{ color: REDWOOD.neutral600, fontSize: 12 }}>
                Selected: <strong>{selectedSysKeys.length}</strong>
              </Text>
              <Divider type="vertical" />
              <Text style={{ color: REDWOOD.neutral600, fontSize: 12 }}>
                Amount:{' '}
                <strong style={{ color: REDWOOD.neutral900 }}>
                  {fmtAmount(sysSelectedAmount)}
                </strong>
              </Text>
              <Divider type="vertical" />
              <Text style={{ color: REDWOOD.neutral600, fontSize: 12 }}>
                Difference:{' '}
                <strong
                  style={{
                    color: difference === 0 ? REDWOOD.success : REDWOOD.error,
                  }}
                >
                  {fmtAmount(difference)}
                </strong>
              </Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* ── Reconcile Button ───────────────────────────────────────── */}
      <Row justify="end" style={{ marginTop: 16 }}>
        <Button
          type="primary"
          icon={<CheckOutlined />}
          size="large"
          disabled={!canReconcile}
          loading={reconciling}
          onClick={handleReconcile}
          style={{
            backgroundColor: canReconcile ? REDWOOD.primary : undefined,
            borderColor:     canReconcile ? REDWOOD.primary : undefined,
          }}
        >
          Reconcile Selected
        </Button>
      </Row>

      {/* ── API Inspector Modal ───────────────────────────────────────── */}
      <Modal
        open={apiModal}
        onCancel={() => setApiModal(false)}
        footer={null}
        width={720}
        title={
          <Space>
            <ApiOutlined style={{ color: REDWOOD.info }} />
            <span>API Inspector — System Transactions Endpoint</span>
          </Space>
        }
      >
        {/* ── Base endpoint ── */}
        <div style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 12, color: REDWOOD.neutral600, display: 'block', marginBottom: 4 }}>
            Base URL
          </Text>
          <div
            style={{
              background:   REDWOOD.neutral100,
              border:       `1px solid ${REDWOOD.neutral200}`,
              borderRadius: 6,
              padding:      '8px 12px',
              fontFamily:   'monospace',
              fontSize:     12,
              wordBreak:    'break-all',
              color:        REDWOOD.neutral900,
            }}
          >
            {APEX_BASE}/cash/reconciliation/systxns
          </div>
        </div>

        {/* ── Parameters table ── */}
        <div style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 12, color: REDWOOD.neutral600, display: 'block', marginBottom: 6 }}>
            Parameters
          </Text>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: REDWOOD.neutral200 }}>
                {['Parameter', 'Current Value', 'Description'].map((h) => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, borderBottom: `1px solid ${REDWOOD.neutral300}` }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { param: 'bank_account', val: lastParams?.bankAccount ?? '—', desc: 'Bank account name (partial match)', required: true },
                { param: 'reconciled',  val: 'N',                             desc: 'N = unreconciled only' },
                { param: 'txn_type',    val: txnSourceFilter === 'ALL' ? '(all sources)' : txnSourceFilter, desc: 'AP_PAYMENT | AR_RECEIPT | GL_JOURNAL' },
                { param: 'date_from',   val: lastParams?.dateFrom?.format('YYYY-MM-DD') ?? '—', desc: 'Payment / receipt / journal date from' },
                { param: 'date_to',     val: lastParams?.dateTo?.format('YYYY-MM-DD')   ?? '—', desc: 'Payment / receipt / journal date to' },
                { param: 'amount_min',  val: lastParams?.amountMin != null ? String(lastParams.amountMin) : '—', desc: 'Minimum transaction amount' },
                { param: 'amount_max',  val: lastParams?.amountMax != null ? String(lastParams.amountMax) : '—', desc: 'Maximum transaction amount' },
                { param: 'reference',   val: lastParams?.reference ?? '—',  desc: 'Partial match on txn number or reference' },
                { param: 'row_limit',   val: '500',                          desc: 'Maximum rows returned' },
              ].map((row, i) => (
                <tr key={row.param} style={{ background: i % 2 === 0 ? REDWOOD.surface : REDWOOD.neutral100 }}>
                  <td style={{ padding: '5px 10px', borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
                    <code style={{ color: REDWOOD.info, fontSize: 11 }}>{row.param}</code>
                    {row.required && <Tag color="red" style={{ marginLeft: 4, fontSize: 10, padding: '0 4px' }}>required</Tag>}
                  </td>
                  <td style={{ padding: '5px 10px', borderBottom: `1px solid ${REDWOOD.neutral200}`, fontFamily: 'monospace', color: row.val === '—' ? REDWOOD.neutral300 : REDWOOD.neutral900 }}>
                    {row.val}
                  </td>
                  <td style={{ padding: '5px 10px', borderBottom: `1px solid ${REDWOOD.neutral200}`, color: REDWOOD.neutral600 }}>
                    {row.desc}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Full URL ── */}
        <div>
          <Text style={{ fontSize: 12, color: REDWOOD.neutral600, display: 'block', marginBottom: 4 }}>
            Full URL (with current filters)
          </Text>
          <div
            style={{
              background:   '#0d1117',
              borderRadius: 6,
              padding:      '10px 12px',
              fontFamily:   'monospace',
              fontSize:     11,
              wordBreak:    'break-all',
              color:        '#79c0ff',
              position:     'relative',
            }}
          >
            {buildSysTxnsUrl(txnSourceFilter)}
            <Button
              size="small"
              icon={<CopyOutlined />}
              onClick={() => handleCopyUrl(buildSysTxnsUrl(txnSourceFilter))}
              style={{
                position:        'absolute',
                top:             6,
                right:           6,
                backgroundColor: apiCopied ? REDWOOD.success : '#30363d',
                borderColor:     apiCopied ? REDWOOD.success : '#484f58',
                color:           '#fff',
                fontSize:        11,
              }}
            >
              {apiCopied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </div>

        {/* ── All variant URLs ── */}
        <div style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 12, color: REDWOOD.neutral600, display: 'block', marginBottom: 6 }}>
            Source-specific URLs
          </Text>
          {(['AP_PAYMENT', 'AR_RECEIPT', 'GL_JOURNAL'] as const).map((src) => {
            const url = buildSysTxnsUrl(src);
            const colors: Record<string, string> = { AP_PAYMENT: 'geekblue', AR_RECEIPT: 'green', GL_JOURNAL: 'purple' };
            return (
              <div key={src} style={{ marginBottom: 8 }}>
                <Space style={{ marginBottom: 3 }}>
                  <Tag color={colors[src]} style={{ fontSize: 11, margin: 0 }}>
                    {src === 'AP_PAYMENT' ? 'AP Payments' : src === 'AR_RECEIPT' ? 'AR Receipts' : 'GL Journals'}
                  </Tag>
                  <Button
                    size="small"
                    type="link"
                    icon={<CopyOutlined />}
                    style={{ padding: 0, fontSize: 11, height: 18 }}
                    onClick={() => handleCopyUrl(url)}
                  >
                    Copy
                  </Button>
                </Space>
                <div
                  style={{
                    background:   REDWOOD.neutral100,
                    border:       `1px solid ${REDWOOD.neutral200}`,
                    borderRadius: 4,
                    padding:      '5px 10px',
                    fontFamily:   'monospace',
                    fontSize:     10,
                    wordBreak:    'break-all',
                    color:        REDWOOD.neutral600,
                  }}
                >
                  {url}
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      {/* Shared API Debug Modal */}
      <Modal
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /><span>{apiModalTitle}</span></Space>}
        open={apiModalVisible}
        onCancel={() => setApiModalVisible(false)}
        footer={<Button onClick={() => setApiModalVisible(false)}>Close</Button>}
        width={680}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Space style={{ marginBottom: 4 }}>
            <Tag color="blue" style={{ margin: 0 }}>GET</Tag>
            <Text strong style={{ fontSize: 12 }}>URL</Text>
          </Space>
          <div style={{ background: '#1e1e1e', borderRadius: 4, padding: '8px 12px', marginBottom: 4 }}>
            <code style={{ fontSize: 11, color: '#9cdcfe', wordBreak: 'break-all' }}>{apiModalUrl}</code>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              size="small"
              loading={apiExecResult.loading}
              onClick={async () => {
                if (!apiModalUrl) return;
                setApiExecResult({ loading: true, response: null });
                try {
                  const res = await fetch(apiModalUrl, { headers: { Accept: 'application/json' } });
                  const text = await res.text();
                  let formatted = text;
                  try { formatted = JSON.stringify(JSON.parse(text), null, 2); } catch { /* keep raw */ }
                  setApiExecResult({ loading: false, response: `HTTP ${res.status}\n\n${formatted}` });
                } catch (e: any) {
                  setApiExecResult({ loading: false, response: `Error: ${e.message}` });
                }
              }}
            >
              Test
            </Button>
          </div>
          {apiExecResult.response && (
            <div style={{ background: '#1e1e1e', borderRadius: 4, padding: '8px 12px', maxHeight: 320, overflow: 'auto' }}>
              <pre style={{
                margin: 0, fontSize: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                color: apiExecResult.response.startsWith('HTTP 2') ? '#4ec9b0' : '#f48771',
              }}>
                {apiExecResult.response}
              </pre>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};

// ── Reconciled Tab ────────────────────────────────────────────────────────────
interface ReconciledTabProps {
  bankAccounts: BankAcctOption[];
  businessUnits: BUOption[];
  loadingAccounts: boolean;
}

const ReconciledTab: React.FC<ReconciledTabProps> = ({ bankAccounts, businessUnits, loadingAccounts }) => {
  const [reconLines, setReconLines]   = useState<StmtLine[]>([]);
  const [loading, setLoading]         = useState(false);
  const [msgApi, contextHolder]       = message.useMessage();

  const fetchReconLines = useCallback(async (params: SearchParams) => {
    const q = new URLSearchParams();
    if (params.bankAccount)      q.set('bank_account',  params.bankAccount);
    q.set('recon_status', 'RECONCILED');
    if (params.dateFrom)         q.set('date_from',     params.dateFrom.format('YYYY-MM-DD'));
    if (params.dateTo)           q.set('date_to',       params.dateTo.format('YYYY-MM-DD'));
    if (params.amountMin != null) q.set('amount_min',   String(params.amountMin));
    if (params.amountMax != null) q.set('amount_max',   String(params.amountMax));
    if (params.statementId)      q.set('statement_id',  params.statementId);
    if (params.reference)        q.set('reference',     params.reference);
    q.set('row_limit', '500');

    setLoading(true);
    try {
      const res  = await fetch(`${APEX_BASE}/cash/reconciliation/stmtlines?${q.toString()}`);
      const data = await parseApexJson(res);
      if (data.status === 'success') {
        setReconLines((data.items ?? []) as StmtLine[]);
      } else {
        msgApi.error(data.message ?? 'Failed to load reconciled lines');
      }
    } catch (err) {
      msgApi.error('Network error loading reconciled lines');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [msgApi]);

  const handleSearch = useCallback((params: SearchParams) => {
    if (!params.bankAccount) {
      msgApi.warning('Please select a bank account');
      return;
    }
    fetchReconLines(params);
  }, [fetchReconLines, msgApi]);

  const handleReset = useCallback(() => {
    setReconLines([]);
  }, []);

  const handleUnreconcile = useCallback(async (line: StmtLine) => {
    // Placeholder — calls unreconcile endpoint if it exists
    try {
      const res = await fetch(
        `${APEX_BASE}/cash/bankstatements/${line.statementId}/unreconcile`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ lineId: line.lineId }),
        }
      );
      const data = await parseApexJson(res);
      if (data.status === 'success') {
        msgApi.success(`Line ${line.lineId} unreconciled`);
        setReconLines((prev) => prev.filter((l) => l.lineId !== line.lineId));
      } else {
        msgApi.error(data.message ?? 'Failed to unreconcile');
      }
    } catch (err) {
      msgApi.error('Network error during unreconcile');
      console.error(err);
    }
  }, [msgApi]);

  const columns: ColumnsType<StmtLine> = [
    {
      title: 'Statement Line Ref',
      dataIndex: 'reference',
      key: 'reference',
      width: 140,
      ellipsis: true,
      render: (v: string, r) => (
        <Tooltip title={r.bankTxnReference || v}>
          <span>{v || r.bankTxnReference || '—'}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'transactionDate',
      key: 'transactionDate',
      width: 100,
      render: (v: string) => fmtDate(v),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 110,
      align: 'right',
      render: (v: number, r) => (
        <span
          style={{
            color:      r.transactionCode === 'CR' ? REDWOOD.success : REDWOOD.error,
            fontWeight: 500,
          }}
        >
          {fmtAmount(v)}
        </span>
      ),
    },
    {
      title: 'Matched Txn #',
      dataIndex: 'reconTxnNumber',
      key: 'reconTxnNumber',
      width: 130,
      ellipsis: true,
      render: (v: string) => v || '—',
    },
    {
      title: 'Matched Amount',
      dataIndex: 'reconAmount',
      key: 'reconAmount',
      width: 120,
      align: 'right',
      render: (v: number) => fmtAmount(v),
    },
    {
      title: 'Matched Source',
      dataIndex: 'reconTxnType',
      key: 'reconTxnType',
      width: 120,
      render: (v: string) =>
        v ? (
          <Tag color="geekblue" style={{ margin: 0 }}>
            {v}
          </Tag>
        ) : (
          '—'
        ),
    },
    {
      title: 'Recon Date',
      dataIndex: 'reconDate',
      key: 'reconDate',
      width: 100,
      render: (v: string) => fmtDate(v),
    },
    {
      title: 'Notes',
      dataIndex: 'reconNotes',
      key: 'reconNotes',
      ellipsis: true,
      render: (v: string) => (
        <Tooltip title={v}>
          <span>{v || '—'}</span>
        </Tooltip>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: StmtLine) => (
        <Tooltip title="Un-reconcile this line">
          <Button
            size="small"
            danger
            icon={<CloseOutlined />}
            onClick={() => handleUnreconcile(record)}
          >
            Undo
          </Button>
        </Tooltip>
      ),
    },
  ];

  return (
    <>
      {contextHolder}
      <SearchPanel
        bankAccounts={bankAccounts}
        businessUnits={businessUnits}
        loadingAccounts={loadingAccounts}
        onSearch={handleSearch}
        onReset={handleReset}
      />
      <Card
        size="small"
        title={
          <Space>
            <ReconciliationOutlined style={{ color: REDWOOD.success }} />
            <span style={{ fontWeight: 600 }}>Reconciled Statement Lines</span>
            <Badge count={reconLines.length} style={{ backgroundColor: REDWOOD.success }} showZero />
          </Space>
        }
        styles={{ body: { padding: 0 } }}
      >
        <Table<StmtLine>
          rowKey="lineId"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={reconLines}
          pagination={{ pageSize: 50, showSizeChanger: true, showQuickJumper: true }}
          scroll={{ x: 900 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No reconciled lines found — run a search to display results"
              />
            ),
          }}
        />
      </Card>
    </>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const BankReconciliation: React.FC = () => {
  const [bankAccounts, setBankAccounts]         = useState<BankAcctOption[]>([]);
  const [businessUnits, setBusinessUnits]       = useState<BUOption[]>([]);
  const [loadingAccounts, setLoadingAccounts]   = useState(false);
  const [activeTab, setActiveTab]               = useState<string>('unreconciled');

  // Load bank accounts from banks/bankaccounts and BUs from gl/businessunits
  useEffect(() => {
    const load = async () => {
      setLoadingAccounts(true);
      try {
        const [acctRes, buRes] = await Promise.all([
          fetch(`${APEX_BASE}/banks/bankaccounts`),
          fetch(`${APEX_BASE}/gl/businessunits`),
        ]);
        const acctData = await acctRes.json();
        const buData   = await buRes.json();

        const opts: BankAcctOption[] = (acctData?.items ?? [])
          .filter((i: any) => i.bankAccountName || i.bank_account_name)
          .map((i: any) => ({
            label:             i.bankAccountName   || i.bank_account_name   || '',
            value:             i.bankAccountName   || i.bank_account_name   || '',
            bankAccountNumber: i.bankAccountNumber || i.bank_account_number || '',
            currencyCode:      i.currencyCode      || i.currency_code       || '',
            legalEntityName:   i.legalEntityName   || i.legal_entity_name   || '',
          }))
          .sort((a: BankAcctOption, b: BankAcctOption) => a.label.localeCompare(b.label));
        setBankAccounts(opts);

        const buOpts: BUOption[] = (buData?.items ?? [])
          .map((i: any) => ({
            label:           i.business_unit_name || '',
            value:           i.business_unit_name || '',
            legalEntityName: i.legal_entity_name  || '',
          }))
          .filter((o: BUOption) => o.value)
          .sort((a: BUOption, b: BUOption) => a.label.localeCompare(b.label));
        setBusinessUnits(buOpts);
      } catch (err) {
        console.error('Failed to load bank accounts / BUs', err);
      } finally {
        setLoadingAccounts(false);
      }
    };
    load();
  }, []);

  const tabItems = [
    {
      key:      'unreconciled',
      label: (
        <Space>
          <ReloadOutlined />
          Unreconciled
        </Space>
      ),
      children: (
        <UnreconciledTab
          bankAccounts={bankAccounts}
          businessUnits={businessUnits}
          loadingAccounts={loadingAccounts}
        />
      ),
    },
    {
      key:      'reconciled',
      label: (
        <Space>
          <CheckOutlined />
          Reconciled
        </Space>
      ),
      children: (
        <ReconciledTab
          bankAccounts={bankAccounts}
          businessUnits={businessUnits}
          loadingAccounts={loadingAccounts}
        />
      ),
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh', backgroundColor: REDWOOD.neutral100 }}>
      <Content style={{ padding: '16px 24px' }}>
        {/* Breadcrumb */}
        <Breadcrumb
          style={{ marginBottom: 12 }}
          items={[
            {
              title: (
                <Link to="/">
                  <HomeOutlined /> Home
                </Link>
              ),
            },
            {
              title: (
                <Link to="/cash">
                  <BankOutlined /> Cash Management
                </Link>
              ),
            },
            { title: 'Bank Reconciliation' },
          ]}
        />

        {/* Page Header */}
        <div
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            marginBottom:   16,
          }}
        >
          <Space align="center">
            <div
              style={{
                width:           36,
                height:          36,
                borderRadius:    8,
                backgroundColor: REDWOOD.primary,
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
              }}
            >
              <ReconciliationOutlined style={{ color: '#fff', fontSize: 18 }} />
            </div>
            <div>
              <Title level={4} style={{ margin: 0, color: REDWOOD.neutral900 }}>
                Bank Reconciliation
              </Title>
              <Text style={{ color: REDWOOD.neutral600, fontSize: 12 }}>
                Match bank statement lines against system transactions
              </Text>
            </div>
          </Space>
        </div>

        {/* Main Card with Tabs */}
        <Card
          style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
          styles={{ body: { padding: '0 16px 16px' } }}
        >
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={tabItems}
            tabBarStyle={{ borderBottom: `2px solid ${REDWOOD.neutral200}` }}
          />
        </Card>
      </Content>
    </Layout>
  );
};

export default BankReconciliation;
