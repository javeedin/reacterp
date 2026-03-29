import React, { useState, useCallback, useEffect, useRef } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
  Layout, Breadcrumb, Typography, Card, Table, Button, Form, Input, Select,
  DatePicker, InputNumber, Row, Col, Space, Tag, Tooltip, Tabs, Collapse,
  message, Empty, Divider, Badge, Modal, Upload, Alert,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, BankOutlined, PlusOutlined, SearchOutlined, ReloadOutlined,
  EditOutlined, CloseOutlined, DeleteOutlined, UploadOutlined, DownloadOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

const REDWOOD = {
  primary: '#C74634', primaryLight: '#E85D4A',
  success: '#1D7B4D', warning: '#D4A800', info: '#0572CE', error: '#D93025',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral300: '#C7C7C7',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
};

const APEX_BASE = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp';

// ── Types ─────────────────────────────────────────────────────────────────────
interface StatementHeader {
  statementId:        number;
  statementNumber:    string;
  bankAccountNumber:  string;
  bankAccountName:    string;
  statementDate:      string;
  currencyCode:       string;
  openingBalance:     number;
  closingBalance:     number;
  totalCredits:       number;
  totalDebits:        number;
  status:             string;
  businessUnitName:   string;
  description:        string;
  creationDate:       string;
  lastUpdateDate:     string;
}

interface StatementLine {
  _key:               string;   // local-only row key
  lineId?:            number;
  lineNumber?:        number;
  transactionDate:    string;
  valueDate?:         string;
  amount:             number | null;
  transactionCode:    string;
  description?:       string;
  reference?:         string;
  bankTxnReference?:  string;
  counterpartyName?:  string;
  counterpartyAccount?: string;
  reconStatus?:       string;
  reconAmount?:       number;
  reconTxnType?:      string;
  reconTxnNumber?:    string;
  reconNotes?:        string;
  reconDate?:         string;
  reconBy?:           string;
}

interface BankAcctOption { label: string; value: string; currencyCode?: string; legalEntityName?: string; cashAccountCombination?: string; }
interface BUOption       { label: string; value: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────
const parseApexJson = async (res: Response) => {
  const text = await res.text();
  const fixed = text
    .replace(/:(-?)\.(\d)/g, ':$10.$2')
    .replace(/(\d)\.([,}\]])/g, '$1$2');
  return JSON.parse(fixed);
};

const fmtAmount = (v?: number | null, ccy?: string) => {
  if (v == null) return '—';
  const s = new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  return ccy ? `${s} ${ccy}` : s;
};

const fmtDate = (d?: string) => {
  if (!d) return '—';
  try { return dayjs(d).format('D-MMM-YYYY'); } catch { return d; }
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default', SUBMITTED: 'processing', RECONCILING: 'warning',
  RECONCILED: 'success', CLOSED: 'default',
};

const RECON_COLOR: Record<string, string> = {
  UNRECONCILED: 'default', RECONCILED: 'success',
  PARTIALLY_RECONCILED: 'warning', EXCLUDED: 'error',
};

let _keyCounter = 0;
const newKey = () => `row_${++_keyCounter}`;
let _tabCounter = 0;
const newTabKey = () => `tab_${++_tabCounter}`;

// ── CSV Parser ────────────────────────────────────────────────────────────────
function parseCsv(text: string): { rows: Record<string, string>[]; errors: string[] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return { rows: [], errors: ['CSV must have a header row and at least one data row.'] };

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
  const rows: Record<string, string>[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (parts[idx] ?? '').trim(); });
    if (!row.amount && !row.transaction_amount) { errors.push(`Row ${i}: amount is required`); continue; }
    if (!row.transaction_date && !row.date) { errors.push(`Row ${i}: transaction_date is required`); continue; }
    rows.push(row);
  }
  return { rows, errors };
}

function csvRowToLine(row: Record<string, string>): StatementLine {
  const dateStr = row.transaction_date || row.date || '';
  const amount  = parseFloat(row.amount || row.transaction_amount || '0');
  return {
    _key:              newKey(),
    transactionDate:   dateStr,
    valueDate:         row.value_date || row.valuedate || '',
    amount:            isNaN(amount) ? null : amount,
    transactionCode:   (row.transaction_code || row.type || 'CR').toUpperCase(),
    description:       row.description || row.narration || '',
    reference:         row.reference || row.ref || '',
    bankTxnReference:  row.bank_txn_reference || row.bank_ref || '',
    counterpartyName:  row.counterparty_name || row.counterparty || '',
    counterpartyAccount: row.counterparty_account || '',
    reconStatus:       'UNRECONCILED',
  };
}

// ── StatementForm ─────────────────────────────────────────────────────────────
const StatementForm: React.FC<{
  initialHeader?: Partial<StatementHeader>;
  initialLines?:  StatementLine[];
  bankAccounts:   BankAcctOption[];
  businessUnits:  BUOption[];
  onSave:         () => void;
  onCancel:       () => void;
}> = ({ initialHeader, initialLines, bankAccounts, businessUnits, onSave, onCancel }) => {
  const [form]    = Form.useForm();
  const [lines, setLines]       = useState<StatementLine[]>(initialLines ?? []);
  const [saving, setSaving]     = useState(false);
  const [csvModal, setCsvModal] = useState(false);
  const [csvText, setCsvText]   = useState('');
  const [csvPreview, setCsvPreview] = useState<StatementLine[]>([]);
  const [csvErrors, setCsvErrors]   = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const isEdit  = !!initialHeader?.statementId;

  useEffect(() => {
    if (initialHeader) {
      form.setFieldsValue({
        statementNumber:   initialHeader.statementNumber,
        bankAccountName:   initialHeader.bankAccountName,
        bankAccountNumber: initialHeader.bankAccountNumber,
        statementDate:     initialHeader.statementDate ? dayjs(initialHeader.statementDate) : dayjs(),
        currencyCode:      initialHeader.currencyCode,
        openingBalance:    initialHeader.openingBalance,
        closingBalance:    initialHeader.closingBalance,
        businessUnitName:  initialHeader.businessUnitName,
        description:       initialHeader.description,
        status:            initialHeader.status ?? 'DRAFT',
      });
    } else {
      form.setFieldsValue({ statementDate: dayjs(), status: 'DRAFT' });
    }
  }, [initialHeader, form]);

  useEffect(() => {
    if (initialLines) setLines(initialLines);
  }, [initialLines]);

  const addLine = () => setLines(prev => [...prev, {
    _key: newKey(), transactionDate: dayjs().format('YYYY-MM-DD'),
    amount: null, transactionCode: 'CR', reconStatus: 'UNRECONCILED',
  }]);

  const updateLine = (key: string, field: keyof StatementLine, value: any) =>
    setLines(prev => prev.map(l => l._key === key ? { ...l, [field]: value } : l));

  const deleteLine = async (line: StatementLine) => {
    if (line.lineId) {
      try {
        await fetch(`${APEX_BASE}/cash/bankstatements/${initialHeader?.statementId}/deleteline`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lineId: line.lineId }),
        });
      } catch { /* ignore */ }
    }
    setLines(prev => prev.filter(l => l._key !== line._key));
  };

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      setCsvText(text);
      const { rows, errors } = parseCsv(text);
      setCsvErrors(errors);
      setCsvPreview(rows.map(csvRowToLine));
    };
    reader.readAsText(file);
  };

  const confirmCsvImport = () => {
    setLines(prev => [...prev, ...csvPreview]);
    setCsvModal(false);
    setCsvPreview([]);
    setCsvText('');
    setCsvErrors([]);
    message.success(`${csvPreview.length} lines imported from CSV.`);
  };

  const handleSave = async () => {
    let hdrValues: any;
    try { hdrValues = await form.validateFields(); } catch { return; }

    setSaving(true);
    try {
      const payload = {
        header: {
          statementId:     initialHeader?.statementId,
          statementNumber: hdrValues.statementNumber,
          bankAccountName: hdrValues.bankAccountName,
          bankAccountNumber: hdrValues.bankAccountNumber ?? '',
          statementDate:   (hdrValues.statementDate as Dayjs).format('YYYY-MM-DD'),
          currencyCode:    hdrValues.currencyCode ?? '',
          openingBalance:  hdrValues.openingBalance ?? 0,
          closingBalance:  hdrValues.closingBalance ?? 0,
          businessUnitName: hdrValues.businessUnitName ?? '',
          description:     hdrValues.description ?? '',
          status:          hdrValues.status ?? 'DRAFT',
          createdBy:       'ERP_USER',
          lastUpdatedBy:   'ERP_USER',
        },
        lines: lines.map(l => ({
          lineId:             l.lineId,
          transactionDate:    l.transactionDate,
          valueDate:          l.valueDate || null,
          amount:             l.amount,
          transactionCode:    l.transactionCode,
          description:        l.description ?? '',
          reference:          l.reference ?? '',
          bankTxnReference:   l.bankTxnReference ?? '',
          counterpartyName:   l.counterpartyName ?? '',
          counterpartyAccount: l.counterpartyAccount ?? '',
          createdBy:          'ERP_USER',
          lastUpdatedBy:      'ERP_USER',
        })),
      };

      const res  = await fetch(`${APEX_BASE}/cash/bankstatements`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.status === 'success') {
        message.success(isEdit ? 'Statement updated.' : 'Statement created.');
        onSave();
      } else {
        message.error(data.message || 'Save failed.');
      }
    } catch (e: any) {
      message.error('Network error: ' + e.message);
    } finally { setSaving(false); }
  };

  // Line columns — inline editing
  const lineColumns: ColumnsType<StatementLine> = [
    {
      title: '#', width: 50,
      render: (_, __, idx) => <Text style={{ fontSize: 12 }}>{idx + 1}</Text>,
    },
    {
      title: 'Txn Date', width: 130,
      render: (_, r) => (
        <DatePicker size="small" format="D-MMM-YYYY" style={{ width: '100%' }}
          value={r.transactionDate ? dayjs(r.transactionDate) : undefined}
          onChange={d => updateLine(r._key, 'transactionDate', d?.format('YYYY-MM-DD') ?? '')} />
      ),
    },
    {
      title: 'Value Date', width: 130,
      render: (_, r) => (
        <DatePicker size="small" format="D-MMM-YYYY" style={{ width: '100%' }}
          value={r.valueDate ? dayjs(r.valueDate) : undefined}
          onChange={d => updateLine(r._key, 'valueDate', d?.format('YYYY-MM-DD') ?? '')} />
      ),
    },
    {
      title: 'Amount', width: 130,
      render: (_, r) => (
        <InputNumber size="small" style={{ width: '100%' }} precision={2}
          value={r.amount ?? undefined}
          onChange={v => updateLine(r._key, 'amount', v)} />
      ),
    },
    {
      title: 'Type', width: 80,
      render: (_, r) => (
        <Select size="small" style={{ width: '100%' }} value={r.transactionCode}
          onChange={v => updateLine(r._key, 'transactionCode', v)}>
          <Option value="CR">CR</Option>
          <Option value="DR">DR</Option>
        </Select>
      ),
    },
    {
      title: 'Description',
      render: (_, r) => (
        <Input size="small" value={r.description}
          onChange={e => updateLine(r._key, 'description', e.target.value)} />
      ),
    },
    {
      title: 'Reference', width: 140,
      render: (_, r) => (
        <Input size="small" value={r.reference}
          onChange={e => updateLine(r._key, 'reference', e.target.value)} />
      ),
    },
    {
      title: 'Counterparty', width: 160,
      render: (_, r) => (
        <Input size="small" value={r.counterpartyName}
          onChange={e => updateLine(r._key, 'counterpartyName', e.target.value)} />
      ),
    },
    ...(isEdit ? [{
      title: 'Recon',
      width: 130,
      render: (_: any, r: StatementLine) => (
        <Tag color={RECON_COLOR[r.reconStatus ?? 'UNRECONCILED'] as any} style={{ fontSize: 11 }}>
          {r.reconStatus ?? 'UNRECONCILED'}
        </Tag>
      ),
    }] : []),
    {
      title: '', width: 40, align: 'center' as const,
      render: (_, r) => (
        <Button type="text" size="small" danger icon={<DeleteOutlined />}
          onClick={() => deleteLine(r)} />
      ),
    },
  ];

  const lc = { span: 8 };
  const wc = { span: 16 };
  const fs = { marginBottom: 12 };

  // Summary row
  const totalCr = lines.filter(l => l.transactionCode === 'CR').reduce((s, l) => s + (l.amount ?? 0), 0);
  const totalDr = lines.filter(l => l.transactionCode === 'DR').reduce((s, l) => s + (l.amount ?? 0), 0);

  return (
    <div style={{ padding: '12px 24px' }}>
      <Text style={{ fontSize: 12, color: REDWOOD.neutral600, display: 'block', marginBottom: 14 }}>
        {isEdit ? `Edit Statement — ${initialHeader?.statementNumber}` : 'Create Bank Statement'}
      </Text>

      {/* ── Header ── */}
      <Text strong style={{ fontSize: 13, color: REDWOOD.neutral900, display: 'block', marginBottom: 12 }}>
        Statement Details
      </Text>

      <Form form={form} layout="horizontal" labelCol={lc} wrapperCol={wc}>
        <Row gutter={40}>
          <Col xs={24} lg={12}>
            <Form.Item label="Statement Number" name="statementNumber"
              rules={[{ required: true, message: 'Required' }]} style={fs}>
              <Input placeholder="e.g. STMT-2026-001" />
            </Form.Item>
            <Form.Item label="Bank Account" name="bankAccountName"
              rules={[{ required: true, message: 'Required' }]} style={fs}>
              <Select showSearch placeholder="Select bank account" optionFilterProp="label"
                options={bankAccounts} style={{ width: '100%' }} allowClear />
            </Form.Item>
            <Form.Item label="Statement Date" name="statementDate"
              rules={[{ required: true, message: 'Required' }]} style={fs}>
              <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" />
            </Form.Item>
            <Form.Item label="Currency" name="currencyCode" style={fs}>
              <Select placeholder="Select currency" allowClear>
                {['AED','USD','EUR','GBP','SAR','QAR','KWD','BHD','OMR','INR'].map(c => (
                  <Option key={c} value={c}>{c}</Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="Status" name="status" style={fs}>
              <Select>
                {['DRAFT','SUBMITTED','RECONCILING','RECONCILED','CLOSED'].map(s => (
                  <Option key={s} value={s}>{s}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} lg={12}>
            <Form.Item label="Opening Balance" name="openingBalance" style={fs}>
              <InputNumber style={{ width: '100%' }} precision={2} placeholder="0.00" />
            </Form.Item>
            <Form.Item label="Closing Balance" name="closingBalance" style={fs}>
              <InputNumber style={{ width: '100%' }} precision={2} placeholder="0.00" />
            </Form.Item>
            <Form.Item label="Business Unit" name="businessUnitName" style={fs}>
              <Select showSearch placeholder="Select BU" optionFilterProp="label"
                options={businessUnits} allowClear style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Description" name="description" style={fs}>
              <Input.TextArea rows={3} placeholder="Optional description" />
            </Form.Item>
          </Col>
        </Row>
      </Form>

      {/* ── Lines ── */}
      <Divider style={{ margin: '8px 0 12px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text strong style={{ fontSize: 13 }}>
          Statement Lines
          {lines.length > 0 && <Tag color="blue" style={{ marginLeft: 8 }}>{lines.length}</Tag>}
        </Text>
        <Space>
          <Button size="small" icon={<UploadOutlined />} onClick={() => setCsvModal(true)}>
            Import CSV
          </Button>
          <Button size="small" icon={<PlusOutlined />} type="primary"
            style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
            onClick={addLine}>
            Add Line
          </Button>
        </Space>
      </div>

      <Table
        dataSource={lines} columns={lineColumns} rowKey="_key"
        size="small" pagination={false}
        scroll={{ x: 1100 }}
        locale={{ emptyText: <Empty description="No lines — add manually or import CSV" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        summary={() => lines.length > 0 ? (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={3}>
              <Text strong style={{ fontSize: 12 }}>Totals</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={3}>
              <Text strong style={{ fontSize: 12, color: REDWOOD.success }}>
                CR: {fmtAmount(totalCr)}
              </Text>
              <br />
              <Text strong style={{ fontSize: 12, color: REDWOOD.error }}>
                DR: {fmtAmount(totalDr)}
              </Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={4} colSpan={isEdit ? 6 : 5} />
          </Table.Summary.Row>
        ) : null}
      />

      <Divider />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="primary" loading={saving} onClick={handleSave}
          style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>
          {isEdit ? 'Save Changes' : 'Create Statement'}
        </Button>
      </div>

      {/* ── CSV Import Modal ── */}
      <Modal
        title={<Space><UploadOutlined /><span>Import Lines from CSV</span></Space>}
        open={csvModal} onCancel={() => { setCsvModal(false); setCsvPreview([]); setCsvErrors([]); }}
        width={900}
        footer={[
          <Button key="cancel" onClick={() => { setCsvModal(false); setCsvPreview([]); setCsvErrors([]); }}>
            Cancel
          </Button>,
          <Button key="import" type="primary" disabled={csvPreview.length === 0}
            style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
            onClick={confirmCsvImport}>
            Import {csvPreview.length} Lines
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="info" showIcon
            message="Expected CSV columns (header row required)"
            description="transaction_date, amount, transaction_code (CR/DR), description, reference, value_date, counterparty_name, counterparty_account, bank_txn_reference"
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button icon={<DownloadOutlined />} size="small"
              onClick={() => {
                const csv = 'transaction_date,amount,transaction_code,description,reference,value_date,counterparty_name\n2026-03-28,1500.00,CR,Customer Payment,REF-001,2026-03-28,ABC Company';
                const a = document.createElement('a');
                a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
                a.download = 'bank_statement_template.csv';
                a.click();
              }}>
              Download Template
            </Button>
            <Button icon={<UploadOutlined />} size="small"
              onClick={() => fileRef.current?.click()}>
              Choose CSV File
            </Button>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
              onChange={handleCsvFile} />
            {csvText && <Text type="secondary" style={{ fontSize: 12 }}>File loaded</Text>}
          </div>

          {csvErrors.length > 0 && (
            <Alert type="warning" showIcon message={`${csvErrors.length} parse errors`}
              description={csvErrors.slice(0, 5).join(' | ')} />
          )}

          {csvPreview.length > 0 && (
            <Table
              dataSource={csvPreview} rowKey="_key" size="small"
              pagination={false} scroll={{ y: 280 }}
              columns={[
                { title: 'Date', dataIndex: 'transactionDate', width: 110, render: fmtDate },
                { title: 'Amount', dataIndex: 'amount', width: 110, align: 'right', render: v => fmtAmount(v) },
                { title: 'Type', dataIndex: 'transactionCode', width: 60,
                  render: v => <Tag color={v === 'CR' ? 'green' : 'red'}>{v}</Tag> },
                { title: 'Description', dataIndex: 'description', ellipsis: true },
                { title: 'Reference', dataIndex: 'reference', width: 120, ellipsis: true },
                { title: 'Counterparty', dataIndex: 'counterpartyName', ellipsis: true },
              ]}
            />
          )}
        </Space>
      </Modal>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const ManageBankStatements: React.FC<{ module?: 'ap' | 'cash' }> = ({ module = 'cash' }) => {
  const [statements, setStatements] = useState<StatementHeader[]>([]);
  const [loading, setLoading]       = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAcctOption[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BUOption[]>([]);
  const [searchOpen, setSearchOpen] = useState(true);
  const [activeTabKey, setActiveTabKey] = useState('search');
  const [tabs, setTabs] = useState<{
    key: string; label: string;
    header?: StatementHeader; lines?: StatementLine[];
  }[]>([]);
  const [searchForm] = Form.useForm();
  const modulePrefix = module === 'ap' ? '/ap' : '/cash';

  // Load LOVs
  const loadLovs = useCallback(async () => {
    try {
      // Bank accounts from dedicated endpoint
      const baRes  = await fetch(`${APEX_BASE}/banks/bankaccounts`);
      const baData = await parseApexJson(baRes);
      if (baData.status === 'success' && baData.items) {
        const accts: BankAcctOption[] = baData.items.map((i: any) => ({
          label: i.bankAccountName,
          value: i.bankAccountName,
          currencyCode: i.currencyCode,
          legalEntityName: i.legalEntityName,
          cashAccountCombination: i.cashAccountCombination,
        }));
        setBankAccounts(accts);

        // Derive BUs from legal entity names on bank accounts
        const buSet = new Set<string>();
        baData.items.forEach((i: any) => { if (i.legalEntityName) buSet.add(i.legalEntityName); });
        setBusinessUnits([...buSet].sort().map(n => ({ label: n, value: n })));
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadLovs(); }, [loadLovs]);

  // Search
  const handleSearch = useCallback(async () => {
    const v = searchForm.getFieldsValue();
    const p = new URLSearchParams();
    if (v.businessUnit)    p.set('business_unit',    v.businessUnit);
    if (v.bankAccount)     p.set('bank_account',     v.bankAccount);
    if (v.statementNumber) p.set('statement_number', v.statementNumber);
    if (v.status)          p.set('status',           v.status);
    if (v.dateFrom)        p.set('date_from', (v.dateFrom as Dayjs).format('YYYY-MM-DD'));
    if (v.dateTo)          p.set('date_to',   (v.dateTo   as Dayjs).format('YYYY-MM-DD'));
    p.set('row_limit', '500');

    setLoading(true); setHasSearched(true);
    try {
      const res  = await fetch(`${APEX_BASE}/cash/bankstatements?${p.toString()}`);
      const data = await parseApexJson(res);
      if (data.status === 'success') {
        setStatements(data.items ?? []);
        if (!(data.items ?? []).length) message.info('No statements found.');
      } else { message.error(data.message || 'Search failed.'); }
    } catch (e: any) { message.error('Network error: ' + e.message); }
    finally { setLoading(false); }
  }, [searchForm]);

  const handleReset = () => { searchForm.resetFields(); setStatements([]); setHasSearched(false); };

  // Open edit tab — load full statement with lines
  const openEditTab = async (record: StatementHeader) => {
    const existing = tabs.find(t => t.header?.statementId === record.statementId);
    if (existing) { setActiveTabKey(existing.key); return; }
    try {
      const res  = await fetch(`${APEX_BASE}/cash/bankstatements/${record.statementId}`);
      const data = await parseApexJson(res);
      const lines: StatementLine[] = (data.lines ?? []).map((l: any) => ({ ...l, _key: newKey() }));
      const key = newTabKey();
      setTabs(prev => [...prev, { key, label: record.statementNumber, header: record, lines }]);
      setActiveTabKey(key);
    } catch (e: any) { message.error('Failed to load statement: ' + e.message); }
  };

  const openCreateTab = () => {
    const key = newTabKey();
    setTabs(prev => [...prev, { key, label: 'New Statement' }]);
    setActiveTabKey(key);
  };

  const closeTab = (key: string) => {
    setTabs(prev => prev.filter(t => t.key !== key));
    if (activeTabKey === key) setActiveTabKey('search');
  };

  // Table columns
  const columns: ColumnsType<StatementHeader> = [
    { title: 'Business Unit', dataIndex: 'businessUnitName', width: 180, ellipsis: true,
      render: v => <Tooltip title={v}><Text style={{ fontSize: 12 }}>{v || '—'}</Text></Tooltip> },
    { title: 'Bank Account', dataIndex: 'bankAccountName', ellipsis: true,
      render: v => <Tooltip title={v}><Text style={{ fontSize: 12 }}>{v || '—'}</Text></Tooltip> },
    {
      title: 'Statement #', dataIndex: 'statementNumber', width: 150,
      render: (v, r) => (
        <Button type="link" size="small" style={{ padding: 0, color: REDWOOD.info }}
          onClick={() => openEditTab(r)}>{v}</Button>
      ),
    },
    { title: 'Date', dataIndex: 'statementDate', width: 110, render: fmtDate },
    { title: 'CCY', dataIndex: 'currencyCode', width: 60,
      render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Opening Bal', dataIndex: 'openingBalance', width: 130, align: 'right',
      render: (v, r) => <Text style={{ fontSize: 12 }}>{fmtAmount(v, r.currencyCode)}</Text> },
    { title: 'Closing Bal', dataIndex: 'closingBalance', width: 130, align: 'right',
      render: (v, r) => <Text style={{ fontSize: 12 }}>{fmtAmount(v, r.currencyCode)}</Text> },
    { title: 'Credits', dataIndex: 'totalCredits', width: 120, align: 'right',
      render: (v, r) => <Text style={{ fontSize: 12, color: REDWOOD.success }}>{fmtAmount(v, r.currencyCode)}</Text> },
    { title: 'Debits', dataIndex: 'totalDebits', width: 120, align: 'right',
      render: (v, r) => <Text style={{ fontSize: 12, color: REDWOOD.error }}>{fmtAmount(v, r.currencyCode)}</Text> },
    {
      title: 'Status', dataIndex: 'status', width: 120,
      render: v => <Tag color={STATUS_COLOR[v] ?? 'default'} style={{ fontSize: 11 }}>{v}</Tag>,
    },
    {
      title: '', key: 'actions', width: 60, align: 'center',
      render: (_, r) => <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditTab(r)} />,
    },
  ];

  const searchPane = (
    <div style={{ padding: '16px 0' }}>
      <Collapse
        activeKey={searchOpen ? ['s'] : []}
        onChange={(k: string | string[]) => setSearchOpen((Array.isArray(k) ? k : [k]).includes('s'))}
        style={{ marginBottom: 16, borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, background: REDWOOD.surface }}
        items={[{
          key: 's',
          label: <Text strong style={{ fontSize: 13 }}>Search</Text>,
          extra: (
            <Space size={8} onClick={e => e.stopPropagation()}>
              <Button size="small" icon={<ReloadOutlined />}
                onClick={e => { e.stopPropagation(); handleReset(); }}>Reset</Button>
              <Button size="small" type="primary" icon={<SearchOutlined />} loading={loading}
                onClick={e => { e.stopPropagation(); handleSearch(); }}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>
                Search
              </Button>
            </Space>
          ),
          children: (
            <Form form={searchForm} layout="horizontal" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }}>
              <Row gutter={[24, 4]}>
                <Col xs={24} md={12}>
                  <Form.Item label="Business Unit" name="businessUnit" style={{ marginBottom: 10 }}>
                    <Select showSearch placeholder="Select BU" optionFilterProp="label"
                      options={businessUnits} allowClear style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label="Date From" name="dateFrom" style={{ marginBottom: 10 }}>
                    <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label="Bank Account" name="bankAccount" style={{ marginBottom: 10 }}>
                    <Select showSearch placeholder="Select account" optionFilterProp="label"
                      options={bankAccounts} allowClear style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label="Date To" name="dateTo" style={{ marginBottom: 10 }}>
                    <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label="Statement #" name="statementNumber" style={{ marginBottom: 10 }}>
                    <Input placeholder="Statement number" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label="Status" name="status" style={{ marginBottom: 10 }}>
                    <Select placeholder="Any status" allowClear>
                      {['DRAFT','SUBMITTED','RECONCILING','RECONCILED','CLOSED'].map(s => (
                        <Option key={s} value={s}>{s}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          ),
        }]}
      />

      {hasSearched && (
        <Card style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
          styles={{ body: { padding: 0 } }}
          title={
            <Text strong>
              Results {statements.length > 0 && <Tag color="blue">{statements.length}</Tag>}
            </Text>
          }
        >
          <Table
            dataSource={statements} columns={columns} rowKey="statementId"
            loading={loading} size="small"
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} statements` }}
            locale={{ emptyText: <Empty description="No statements found" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            scroll={{ x: 1200 }}
          />
        </Card>
      )}
    </div>
  );

  const tabItems = [
    { key: 'search', label: <span><SearchOutlined /> Search</span>, children: searchPane, closable: false },
    ...tabs.map(t => ({
      key: t.key,
      closable: false,
      label: (
        <span>
          {t.header ? <EditOutlined style={{ marginRight: 4 }} /> : <PlusOutlined style={{ marginRight: 4 }} />}
          {t.label}
          <CloseOutlined style={{ marginLeft: 8, fontSize: 10 }}
            onClick={e => { e.stopPropagation(); closeTab(t.key); }} />
        </span>
      ),
      children: (
        <StatementForm
          initialHeader={t.header}
          initialLines={t.lines}
          bankAccounts={bankAccounts}
          businessUnits={businessUnits}
          onSave={() => { closeTab(t.key); handleSearch(); loadLovs(); }}
          onCancel={() => closeTab(t.key)}
        />
      ),
    })),
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        <div style={{ padding: '14px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to={modulePrefix}>{module === 'ap' ? 'Payables' : 'Cash Management'}</Link> },
            { title: 'Manage Bank Statements' },
          ]} />
        </div>

        <div style={{ padding: '0 24px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <BankOutlined style={{ fontSize: 22, color: REDWOOD.info }} />
              <Title level={4} style={{ margin: 0, color: REDWOOD.neutral900 }}>Manage Bank Statements</Title>
            </div>
            <Button icon={<PlusOutlined />} type="primary"
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
              onClick={openCreateTab}>
              Create Statement
            </Button>
          </div>

          <Tabs type="card" activeKey={activeTabKey} onChange={setActiveTabKey}
            items={tabItems} style={{ marginTop: 8 }} />
        </div>
      </Content>
    </Layout>
  );
};

export default ManageBankStatements;
