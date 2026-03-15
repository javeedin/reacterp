import React, { useState, useCallback } from 'react';
import dayjs from 'dayjs';
import {
  Card, Table, Tabs, Form, Select, DatePicker, Input, Button,
  Space, Tag, Typography, Row, Col, Tooltip, Badge, Divider,
  Statistic, message, Modal, Spin, Descriptions,
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, ArrowLeftOutlined,
  AccountBookOutlined, UnorderedListOutlined, FileSearchOutlined,
  CheckCircleOutlined, ClockCircleOutlined, WarningOutlined,
  DollarOutlined, CalendarOutlined, EyeOutlined, FileTextOutlined,
  SendOutlined, CopyOutlined, ApiOutlined, CheckOutlined, CloudOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { APEX_DB_CONFIG } from '../../config/api.config';
import { fetchLedgerByBusinessUnit } from '../../services/sla.service';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

// ── Oracle Redwood colour palette ────────────────────────────────────────────
const REDWOOD = {
  primary:     '#C74634',
  info:        '#0572CE',
  success:     '#1D7B4D',
  warning:     '#D4A800',
  error:       '#D93025',
  neutral100:  '#F7F7F7',
  neutral200:  '#E5E5E5',
  neutral600:  '#6B6B6B',
  surface:     '#FFFFFF',
};

// ── Interfaces ───────────────────────────────────────────────────────────────

interface SlaHeader {
  key: string;
  headerId: number;
  moduleName: string;
  sourceTable: string;
  sourceId: number;
  sourceNumber: string;
  sourceType: string;
  eventTypeCode: string;
  accountingDate: string;
  periodName: string;
  ledgerName: string;
  currencyCode: string;
  businessUnit: string;
  description: string;
  accountingStatus: string;
  postingStatus: string;
  glBatchId: number | null;
  glBatchName: string | null;
  glHeaderId: number | null;
  createdBy: string;
  creationDate: string;
  postedBy: string | null;
  postedDate: string | null;
  lineCount: number;
}

interface SlaLine {
  key: string;
  lineId: number;
  headerId: number;
  lineNumber: number;
  lineType: string;
  accountingClass: string;
  accountCombination: string;
  enteredDr: number;
  enteredCr: number;
  accountedDr: number;
  accountedCr: number;
  currencyCode: string;
  description: string;
  sourceNumber: string;
  sourceTable: string;
  accountingDate: string;
  accountingStatus: string;
  businessUnit: string;
  legalEntity: string;
  moduleName: string;
  partyType: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const formatAmount = (v: number | null | undefined) => {
  if (v === null || v === undefined || v === 0) return '—';
  return new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
};

const statusColor = (s: string) => {
  switch (s?.toUpperCase()) {
    case 'POSTED':  return 'success';
    case 'DRAFT':   return 'warning';
    case 'ERROR':   return 'error';
    default:        return 'default';
  }
};

const statusIcon = (s: string) => {
  switch (s?.toUpperCase()) {
    case 'POSTED':  return <CheckCircleOutlined />;
    case 'DRAFT':   return <ClockCircleOutlined />;
    case 'ERROR':   return <WarningOutlined />;
    default:        return null;
  }
};

// ── Component ────────────────────────────────────────────────────────────────

const ManageSLAJournals: React.FC = () => {
  const navigate = useNavigate();
  const [headerForm] = Form.useForm();
  const [lineForm]   = Form.useForm();

  // ── Headers tab state ────────────────────────────────────────────────────
  const [headers, setHeaders]           = useState<SlaHeader[]>([]);
  const [headerLoading, setHeaderLoading] = useState(false);
  const [headerTotal, setHeaderTotal]   = useState(0);

  // ── Lines tab state ──────────────────────────────────────────────────────
  const [lines, setLines]           = useState<SlaLine[]>([]);
  const [lineLoading, setLineLoading] = useState(false);
  const [lineTotal, setLineTotal]   = useState(0);

  // ── Summary stats ────────────────────────────────────────────────────────
  const [stats, setStats] = useState({ draft: 0, posted: 0, error: 0, totalDr: 0, totalCr: 0 });

  // ── Active tab ───────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('headers');

  // ── GL Journal Entry modal ────────────────────────────────────────────────
  const [glJournalModalVisible, setGlJournalModalVisible]   = useState(false);
  const [glJournalLoading, setGlJournalLoading]             = useState(false);
  const [glJournalData, setGlJournalData]                   = useState<any>(null);
  const [glJournalLines, setGlJournalLines]                 = useState<any[]>([]);

  // ── GL Journal API info modal ─────────────────────────────────────────────
  const [glApiModalVisible, setGlApiModalVisible]           = useState(false);
  const [glLastHeaderUrl, setGlLastHeaderUrl]               = useState<string | null>(null);
  const [glLastLinesUrl, setGlLastLinesUrl]                 = useState<string | null>(null);
  const [glLastError, setGlLastError]                       = useState<string | null>(null);
  const [glCopiedUrl, setGlCopiedUrl]                       = useState<string | null>(null);
  const [glRawLinesData, setGlRawLinesData]                 = useState<any>(null);

  // ── AP Transaction drill-down modal ──────────────────────────────────────
  const [apTxnModalVisible, setApTxnModalVisible]   = useState(false);
  const [apTxnLoading, setApTxnLoading]             = useState(false);
  const [apTxnData, setApTxnData]                   = useState<any>(null);
  const [apTxnType, setApTxnType]                   = useState<'invoice' | 'payment'>('invoice');
  const [apTxnLines, setApTxnLines]                 = useState<any[]>([]);

  // ── Post to GL modal ──────────────────────────────────────────────────────
  const [postGLModalVisible, setPostGLModalVisible]     = useState(false);
  const [postGLRecord, setPostGLRecord]                 = useState<SlaHeader | null>(null);
  const [postGLLines, setPostGLLines]                   = useState<SlaLine[]>([]);
  const [postGLFetchingLines, setPostGLFetchingLines]   = useState(false);
  const [postGLLoading, setPostGLLoading]               = useState(false);
  const [postGLResult, setPostGLResult]                 = useState<any>(null);
  const [postGLLedger, setPostGLLedger]                 = useState<{ ledgerName: string; ledgerId: number } | null>(null);

  // ── Fetch headers ────────────────────────────────────────────────────────
  const fetchHeaders = useCallback(async (values: any) => {
    setHeaderLoading(true);
    try {
      const params = new URLSearchParams();
      if (values.status)      params.append('accountingStatus', values.status);
      if (values.moduleName)  params.append('moduleName', values.moduleName);
      if (values.sourceTable) params.append('sourceTable', values.sourceTable);
      if (values.eventType)   params.append('eventTypeCode', values.eventType);
      if (values.period)      params.append('periodName', values.period);
      if (values.sourceNumber) params.append('sourceNumber', values.sourceNumber);
      if (values.dateRange?.[0]) params.append('dateFrom', values.dateRange[0].format('YYYY-MM-DD'));
      if (values.dateRange?.[1]) params.append('dateTo',   values.dateRange[1].format('YYYY-MM-DD'));
      params.append('limit', '500');

      const url = `${APEX_DB_CONFIG.baseUrl}/sla/journals?${params.toString()}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items: SlaHeader[] = (data.items || data || []).map((r: any) => ({
        ...r,
        key: String(r.headerId),
      }));
      setHeaders(items);
      setHeaderTotal(items.length);

      // compute quick stats
      setStats({
        draft:   items.filter(h => h.accountingStatus === 'DRAFT').length,
        posted:  items.filter(h => h.accountingStatus === 'POSTED').length,
        error:   items.filter(h => h.accountingStatus === 'ERROR').length,
        totalDr: 0,
        totalCr: 0,
      });
    } catch (err: any) {
      message.error(`Failed to load journal entries: ${err.message}`);
    } finally {
      setHeaderLoading(false);
    }
  }, []);

  // ── Fetch lines ──────────────────────────────────────────────────────────
  const fetchLines = useCallback(async (values: any) => {
    setLineLoading(true);
    try {
      const params = new URLSearchParams();
      if (values.status)      params.append('accountingStatus', values.status);
      if (values.moduleName)  params.append('moduleName', values.moduleName);
      if (values.lineType)    params.append('lineType', values.lineType);
      if (values.acctClass)   params.append('accountingClass', values.acctClass);
      if (values.account)     params.append('accountCombination', values.account);
      if (values.sourceNumber) params.append('sourceNumber', values.sourceNumber);
      if (values.dateRange?.[0]) params.append('dateFrom', values.dateRange[0].format('YYYY-MM-DD'));
      if (values.dateRange?.[1]) params.append('dateTo',   values.dateRange[1].format('YYYY-MM-DD'));
      params.append('limit', '500');

      const url = `${APEX_DB_CONFIG.baseUrl}/sla/journals/lines?${params.toString()}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items: SlaLine[] = (data.items || data || []).map((r: any, i: number) => ({
        ...r,
        key: r.lineId ? String(r.lineId) : `${r.headerId}-${r.lineNumber}-${i}`,
      }));
      setLines(items);
      setLineTotal(items.length);

      const totalDr = items.reduce((s, l) => s + (l.accountedDr || 0), 0);
      const totalCr = items.reduce((s, l) => s + (l.accountedCr || 0), 0);
      setStats(prev => ({ ...prev, totalDr, totalCr }));
    } catch (err: any) {
      message.error(`Failed to load journal lines: ${err.message}`);
    } finally {
      setLineLoading(false);
    }
  }, []);

  // ── View GL Journal Entry ─────────────────────────────────────────────────
  const handleViewJournalEntry = async (record: SlaHeader) => {
    if (!record.glHeaderId && !record.glBatchId) {
      message.warning('No GL journal has been posted for this entry yet');
      return;
    }
    setGlJournalData(null);
    setGlJournalLines([]);
    setGlLastHeaderUrl(null);
    setGlLastLinesUrl(null);
    setGlLastError(null);
    setGlRawLinesData(null);
    setGlJournalLoading(true);
    setGlJournalModalVisible(true);
    try {
      // Use SLA record data we already have for the header
      setGlJournalData({
        journalName: record.glBatchName || `GL Batch ${record.glBatchId}`,
        batchName:   record.glBatchName,
        glBatchId:   record.glBatchId,
        glHeaderId:  record.glHeaderId,
        periodName:  record.periodName,
        ledgerName:  record.ledgerName,
        effectiveDate: record.accountingDate,
        currencyCode:  record.currencyCode,
        statusMeaning: record.postingStatus,
        source:   'Payables',
        category: record.eventTypeCode,
        jeHeaderId: record.glHeaderId,
      });

      // Fetch journal lines using the correct ORDS path: journals/:id/lines
      if (record.glHeaderId) {
        const linesUrl = `${APEX_DB_CONFIG.baseUrl}/gl/journals/${record.glHeaderId}/lines`;
        setGlLastLinesUrl(linesUrl);
        const linesRes = await fetch(linesUrl, { headers: { Accept: 'application/json' } });
        if (!linesRes.ok) throw new Error(`Lines request failed: ${linesRes.status} ${linesRes.statusText}`);
        const linesData = await linesRes.json();
        console.log('[GL Lines] Raw API response:', JSON.stringify(linesData, null, 2));
        setGlRawLinesData(linesData);
        const rawItems = linesData.items || linesData || [];
        console.log('[GL Lines] Items array:', rawItems);
        if (rawItems.length > 0) {
          console.log('[GL Lines] First item keys:', Object.keys(rawItems[0]));
          console.log('[GL Lines] First item values:', rawItems[0]);
        }
        setGlJournalLines(rawItems.map((l: any, i: number) => ({
          key: i,
          lineNum:     l.lineNum     ?? l.linenum     ?? l.je_line_number  ?? l.JE_LINE_NUMBER,
          account:     l.account     ?? l.accountcombination ?? l.account_combination ?? l.ACCOUNT_COMBINATION,
          description: l.description ?? l.DESCRIPTION,
          currency:    l.currency    ?? l.currencyCode ?? l.currencycode ?? l.currency_code ?? l.CURRENCY_CODE,
          enteredDr:   l.enteredDr   ?? l.entereddr   ?? l.entered_dr   ?? l.ENTERED_DR,
          enteredCr:   l.enteredCr   ?? l.enteredcr   ?? l.entered_cr   ?? l.ENTERED_CR,
          accountedDr: l.accountedDr ?? l.accounteddr ?? l.accounted_dr ?? l.ACCOUNTED_DR,
          accountedCr: l.accountedCr ?? l.accountedcr ?? l.accounted_cr ?? l.ACCOUNTED_CR,
        })));
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to load GL journal lines';
      setGlLastError(errMsg);
      message.error('Failed to load GL journal lines');
    } finally {
      setGlJournalLoading(false);
    }
  };

  // ── AP Transaction drill-down ─────────────────────────────────────────────
  const handleTransactionDrilldown = async (record: SlaHeader) => {
    const isPayment = (record.sourceTable || '').toUpperCase().includes('PAYMENT');
    setApTxnType(isPayment ? 'payment' : 'invoice');
    setApTxnData(null);
    setApTxnLines([]);
    setApTxnLoading(true);
    setApTxnModalVisible(true);
    try {
      let url: string;
      if (isPayment) {
        url = `${APEX_DB_CONFIG.baseUrl}/ap/payments?payment_number=${encodeURIComponent(record.sourceNumber)}`;
      } else {
        url = `${APEX_DB_CONFIG.baseUrl}/ap/createinvoice?invoice_number=${encodeURIComponent(record.sourceNumber)}`;
      }
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      const items = data.items || (Array.isArray(data) ? data : [data]);
      if (items.length > 0 && items[0]) {
        setApTxnData(items[0]);
        if (!isPayment) {
          // Fetch invoice lines using the source ID from the SLA record
          const invoiceId = record.sourceId || items[0].invoice_id || items[0].invoiceId;
          if (invoiceId) {
            try {
              const linesRes = await fetch(
                `${APEX_DB_CONFIG.baseUrl}/ap/createinvoiceslines?P_INVOICE_ID=${invoiceId}`,
                { headers: { Accept: 'application/json' } }
              );
              const linesData = await linesRes.json();
              const lineItems = linesData.items || (Array.isArray(linesData) ? linesData : []);
              setApTxnLines(lineItems);
            } catch {
              // Lines fetch failure is non-critical; header is still shown
            }
          }
        }
      } else {
        message.warning('Transaction not found');
        setApTxnModalVisible(false);
      }
    } catch {
      message.error('Failed to load transaction details');
      setApTxnModalVisible(false);
    } finally {
      setApTxnLoading(false);
    }
  };

  // ── Post to GL helpers ────────────────────────────────────────────────────
  const GL_CREATE_URL = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/journals/create';
  const SLA_POST_URL  = `${APEX_DB_CONFIG.baseUrl}/${APEX_DB_CONFIG.endpoints.slaAccountingPost}`;

  /** Build the journals/create payload from SLA header + its fetched lines */
  const buildGLPayload = (hdr: SlaHeader, slaLines: SlaLine[], resolvedLedgerName?: string, resolvedLedgerId?: number) => {
    const totalDr = slaLines.reduce((s, l) => s + (l.enteredDr || 0), 0);
    const totalCr = slaLines.reduce((s, l) => s + (l.enteredCr || 0), 0);
    const batchName = `SLA-${hdr.moduleName}-${hdr.periodName}-${hdr.headerId}`;
    const ledgerName = resolvedLedgerName ?? hdr.ledgerName;
    const ledgerId   = resolvedLedgerId   ?? 0;

    return {
      batch: {
        batchName,
        batchDescription:  hdr.description || '',
        ledgerName,
        ledgerId,
        status:            'NEW',
        accountingPeriod:  hdr.periodName,
        controlTotal:      totalDr,
        runningTotalDr:    totalDr,
        runningTotalCr:    totalCr,
        batchSource:       'Payables',
        createdBy:         hdr.createdBy || 'SYSTEM',
      },
      header: {
        ledgerId,
        ledgerName,
        jeCategory:               hdr.eventTypeCode || 'Payables',
        jeSource:                 'Payables',
        periodName:               hdr.periodName,
        journalName:              `SLA-${hdr.sourceNumber}-${hdr.eventTypeCode}`,
        description:              hdr.description || '',
        currencyCode:             hdr.currencyCode,
        currencyConversionType:   'User',
        currencyConversionDate:   hdr.accountingDate,
        currencyConversionRate:   1,
        status:                   'NEW',
        runningTotalDr:           totalDr,
        runningTotalCr:           totalCr,
        createdBy:                hdr.createdBy || 'SYSTEM',
      },
      lines: slaLines.map(l => ({
        enteredDr:                l.lineType === 'DR' ? (l.enteredDr || null) : null,
        enteredCr:                l.lineType === 'CR' ? (l.enteredCr || null) : null,
        accountedDr:              l.accountedDr || null,
        accountedCr:              l.accountedCr || null,
        statAmount:               null,
        description:              l.description || hdr.description || '',
        currencyCode:             l.currencyCode || hdr.currencyCode,
        currencyConversionDate:   l.accountingDate || hdr.accountingDate,
        currencyConversionRate:   1,
        userCurrencyConversionType: 'User',
        accountCombination:       l.accountCombination || '',
        chartOfAccountsName:      'Chart of Accounts',
        reference1:               hdr.sourceNumber || l.sourceNumber || null,
        reference2:               String(hdr.sourceId || ''),
        reference3:               l.accountingClass || null,
        reference4:               l.legalEntity   || null,
        reference5:               null,
        createdBy:                hdr.createdBy || 'SYSTEM',
      })),
    };
  };

  const handleOpenPostGL = async (record: SlaHeader) => {
    setPostGLRecord(record);
    setPostGLLines([]);
    setPostGLResult(null);
    setPostGLLedger(null);
    setPostGLModalVisible(true);
    // Fetch SLA lines and resolve ledger in parallel
    setPostGLFetchingLines(true);
    try {
      const [linesRes, ledgerInfo] = await Promise.all([
        fetch(`${APEX_DB_CONFIG.baseUrl}/sla/journals/lines?headerId=${record.headerId}&limit=500`, { headers: { Accept: 'application/json' } }),
        fetchLedgerByBusinessUnit(record.businessUnit),
      ]);
      if (!linesRes.ok) throw new Error(`HTTP ${linesRes.status}`);
      const data = await linesRes.json();
      const items: SlaLine[] = (data.items || data || []).map((r: any, i: number) => ({
        ...r,
        key: r.lineId ? String(r.lineId) : `${r.headerId}-${r.lineNumber}-${i}`,
      }));
      setPostGLLines(items);
      if (ledgerInfo) setPostGLLedger(ledgerInfo);
    } catch (err: any) {
      message.warning(`Could not load SLA lines: ${err.message}`);
    } finally {
      setPostGLFetchingLines(false);
    }
  };

  const handlePostToGL = async () => {
    if (!postGLRecord) return;
    setPostGLLoading(true);
    try {
      // Step 1 — POST to journals/create (use ledger resolved when modal opened)
      const payload = buildGLPayload(postGLRecord, postGLLines, postGLLedger?.ledgerName, postGLLedger?.ledgerId);
      const res     = await fetch(GL_CREATE_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);

      // Step 2 — stamp GL IDs back on the SLA header
      const glBatchId   = data.batchId   || data.batch_id   || null;
      const glHeaderId  = data.headerId  || data.header_id  || null;
      const glBatchName = data.batchName || payload.batch.batchName;
      if (glBatchId || glHeaderId) {
        await fetch(SLA_POST_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            headerId:    postGLRecord.headerId,
            glBatchId,
            glBatchName,
            glHeaderId,
            postedBy:   'SYSTEM',
          }),
        });
      }

      setPostGLResult({ success: true, journalsCreate: data });
      message.success('SLA journal posted to GL successfully');
      headerForm.submit();
    } catch (err: any) {
      setPostGLResult({ success: false, error: err.message });
      message.error(`Post to GL failed: ${err.message}`);
    } finally {
      setPostGLLoading(false);
    }
  };

  // ── Header table columns ─────────────────────────────────────────────────
  const headerColumns = [
    {
      title: 'Accounting Date',
      dataIndex: 'accountingDate',
      width: 130,
      sorter: (a: SlaHeader, b: SlaHeader) => a.accountingDate.localeCompare(b.accountingDate),
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v ? dayjs(v).format('DD-MMM-YYYY') : '—'}</Text>,
    },
    {
      title: 'Transaction #',
      dataIndex: 'sourceNumber',
      width: 150,
      render: (v: string, r: SlaHeader) => (
        <Tooltip title={`Click to view ${r.sourceTable?.includes('PAYMENT') ? 'Payment' : 'Invoice'} | Header ID: ${r.headerId}`}>
          <a
            style={{ fontSize: 12, fontWeight: 600, color: REDWOOD.info }}
            onClick={() => handleTransactionDrilldown(r)}
          >
            {v}
          </a>
        </Tooltip>
      ),
    },
    {
      title: 'Module',
      dataIndex: 'moduleName',
      width: 70,
      render: (v: string) => <Tag color="blue" style={{ fontSize: 11 }}>{v}</Tag>,
    },
    {
      title: 'Event Type',
      dataIndex: 'eventTypeCode',
      width: 170,
      ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'accountingStatus',
      width: 90,
      render: (v: string) => (
        <Tag icon={statusIcon(v)} color={statusColor(v)} style={{ fontSize: 11, fontWeight: 600 }}>
          {v}
        </Tag>
      ),
    },
    {
      title: 'Period',
      dataIndex: 'periodName',
      width: 80,
      render: (v: string) => <Text style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: 'Lines',
      dataIndex: 'lineCount',
      width: 55,
      align: 'right' as const,
      render: (v: number) => <Badge count={v} color={REDWOOD.info} style={{ fontSize: 10 }} />,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 11 }} ellipsis>{v}</Text>,
    },
    {
      title: 'Business Unit',
      dataIndex: 'businessUnit',
      width: 180,
      ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: 'Ledger',
      dataIndex: 'ledgerName',
      width: 100,
      ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: 'GL Batch',
      dataIndex: 'glBatchId',
      width: 90,
      render: (v: number | null, r: SlaHeader) => v ? (
        <Tooltip title={r.glBatchName || ''}>
          <Text code style={{ fontSize: 10 }}>{v}</Text>
        </Tooltip>
      ) : <Text style={{ color: REDWOOD.neutral600, fontSize: 11 }}>—</Text>,
    },
    {
      title: 'Created By',
      dataIndex: 'createdBy',
      width: 90,
      render: (v: string) => <Text style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      fixed: 'right' as const,
      render: (_: any, r: SlaHeader) => (
        <Space orientation="vertical" size={4}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            style={{
              fontSize: 11,
              color: r.glHeaderId ? REDWOOD.info : REDWOOD.neutral600,
              borderColor: r.glHeaderId ? REDWOOD.info : REDWOOD.neutral600,
              width: '100%',
            }}
            disabled={!r.glHeaderId && !r.glBatchId}
            onClick={() => handleViewJournalEntry(r)}
          >
            View GL Journal
          </Button>
          <Button
            size="small"
            icon={<SendOutlined />}
            style={{
              fontSize: 11,
              width: '100%',
              background: r.accountingStatus === 'DRAFT' ? REDWOOD.primary : undefined,
              borderColor: r.accountingStatus === 'DRAFT' ? REDWOOD.primary : undefined,
              color: r.accountingStatus === 'DRAFT' ? '#fff' : REDWOOD.neutral600,
            }}
            onClick={() => handleOpenPostGL(r)}
          >
            Post to GL
          </Button>
        </Space>
      ),
    },
  ];

  // ── Lines table columns ──────────────────────────────────────────────────
  const lineColumns = [
    {
      title: 'Accounting Date',
      dataIndex: 'accountingDate',
      width: 130,
      sorter: (a: SlaLine, b: SlaLine) => a.accountingDate.localeCompare(b.accountingDate),
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v ? dayjs(v).format('DD-MMM-YYYY') : '—'}</Text>,
    },
    {
      title: 'Transaction #',
      dataIndex: 'sourceNumber',
      width: 150,
      render: (v: string, r: SlaLine) => (
        <Tooltip title={`Header ID: ${r.headerId} | Line: ${r.lineNumber}`}>
          <Text style={{ fontSize: 12, color: REDWOOD.info }}>{v}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'lineType',
      width: 55,
      render: (v: string) => (
        <Tag color={v === 'DR' ? 'blue' : 'red'} style={{ fontSize: 11, fontWeight: 700 }}>{v}</Tag>
      ),
    },
    {
      title: 'Accounting Class',
      dataIndex: 'accountingClass',
      width: 130,
      render: (v: string) => <Text style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: 'Account Combination',
      dataIndex: 'accountCombination',
      ellipsis: true,
      render: (v: string) => <Text code style={{ fontSize: 11 }}>{v || '—'}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'accountingStatus',
      width: 90,
      render: (v: string) => (
        <Tag icon={statusIcon(v)} color={statusColor(v)} style={{ fontSize: 11, fontWeight: 600 }}>{v}</Tag>
      ),
    },
    {
      title: 'Debit',
      dataIndex: 'enteredDr',
      width: 120,
      align: 'right' as const,
      render: (v: number, r: SlaLine) => r.lineType === 'DR'
        ? <Text strong style={{ fontSize: 12, color: REDWOOD.info }}>{formatAmount(v)}</Text>
        : <Text style={{ color: REDWOOD.neutral600, fontSize: 11 }}>—</Text>,
    },
    {
      title: 'Credit',
      dataIndex: 'enteredCr',
      width: 120,
      align: 'right' as const,
      render: (v: number, r: SlaLine) => r.lineType === 'CR'
        ? <Text strong style={{ fontSize: 12, color: REDWOOD.error }}>{formatAmount(v)}</Text>
        : <Text style={{ color: REDWOOD.neutral600, fontSize: 11 }}>—</Text>,
    },
    {
      title: 'Currency',
      dataIndex: 'currencyCode',
      width: 70,
      render: (v: string) => <Text style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: 'Business Unit',
      dataIndex: 'businessUnit',
      width: 180,
      ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 11 }} ellipsis>{v}</Text>,
    },
    {
      title: 'Module',
      dataIndex: 'moduleName',
      width: 65,
      render: (v: string) => <Tag color="blue" style={{ fontSize: 10 }}>{v}</Tag>,
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '20px 24px', background: REDWOOD.neutral100, minHeight: '100vh' }}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/ap')} size="small" />
          <div>
            <Title level={4} style={{ margin: 0, color: REDWOOD.primary }}>
              <AccountBookOutlined style={{ marginRight: 8 }} />
              Manage Subledger Journals
            </Title>
            <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>
              Review and query subledger accounting entries from SLA tables
            </Text>
          </div>
        </Space>
      </div>

      {/* ── Summary KPI strip ─────────────────────────────────────────────── */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        {[
          { label: 'Draft',    value: stats.draft,  color: REDWOOD.warning, icon: <ClockCircleOutlined /> },
          { label: 'Posted',   value: stats.posted, color: REDWOOD.success, icon: <CheckCircleOutlined /> },
          { label: 'Error',    value: stats.error,  color: REDWOOD.error,   icon: <WarningOutlined /> },
        ].map(s => (
          <Col key={s.label} xs={8} md={4}>
            <Card size="small" styles={{ body: { padding: '10px 14px' } }}>
              <Statistic
                title={<Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{s.label}</Text>}
                value={s.value}
                styles={{ content: { fontSize: 20, fontWeight: 700, color: s.color } }}
                prefix={s.icon}
              />
            </Card>
          </Col>
        ))}
        {activeTab === 'lines' && stats.totalDr > 0 && (
          <>
            <Col xs={12} md={5}>
              <Card size="small" styles={{ body: { padding: '10px 14px' } }}>
                <Statistic
                  title={<Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Total Debit</Text>}
                  value={stats.totalDr}
                  precision={2}
                  valueStyle={{ fontSize: 16, fontWeight: 700, color: REDWOOD.info }}
                  prefix={<DollarOutlined />}
                />
              </Card>
            </Col>
            <Col xs={12} md={5}>
              <Card size="small" styles={{ body: { padding: '10px 14px' } }}>
                <Statistic
                  title={<Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Total Credit</Text>}
                  value={stats.totalCr}
                  precision={2}
                  valueStyle={{ fontSize: 16, fontWeight: 700, color: REDWOOD.error }}
                  prefix={<DollarOutlined />}
                />
              </Card>
            </Col>
          </>
        )}
      </Row>

      {/* ── Main tabs ────────────────────────────────────────────────────── */}
      <Card styles={{ body: { padding: 0 } }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          style={{ padding: '0 16px' }}
          items={[
            // ═══════════════════════════════════════════════════════════════
            // TAB 1 — Journal Entries (headers)
            // ═══════════════════════════════════════════════════════════════
            {
              key: 'headers',
              label: (
                <Space>
                  <FileSearchOutlined />
                  Journal Entries
                  {headerTotal > 0 && <Badge count={headerTotal} color={REDWOOD.info} />}
                </Space>
              ),
              children: (
                <div style={{ padding: '0 0 16px' }}>

                  {/* Search panel */}
                  <div style={{ background: REDWOOD.neutral100, padding: '14px 16px', borderBottom: `1px solid ${REDWOOD.neutral200}`, marginBottom: 0 }}>
                    <Form
                      form={headerForm}
                      layout="vertical"
                      size="small"
                      onFinish={fetchHeaders}
                      initialValues={{ status: '', moduleName: 'AP' }}
                    >
                      <Row gutter={[12, 0]} align="bottom">
                        <Col xs={24} sm={12} md={6}>
                          <Form.Item label="Accounting Date" name="dateRange" style={{ marginBottom: 8 }}>
                            <RangePicker
                              format="DD-MMM-YYYY"
                              style={{ width: '100%' }}
                              placeholder={['From', 'To']}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={3}>
                          <Form.Item label="Status" name="status" style={{ marginBottom: 8 }}>
                            <Select allowClear placeholder="All">
                              <Option value="">All</Option>
                              <Option value="DRAFT">Draft</Option>
                              <Option value="POSTED">Posted</Option>
                              <Option value="ERROR">Error</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={3}>
                          <Form.Item label="Module" name="moduleName" style={{ marginBottom: 8 }}>
                            <Select allowClear placeholder="All">
                              <Option value="">All</Option>
                              <Option value="AP">AP</Option>
                              <Option value="AR">AR</Option>
                              <Option value="GL">GL</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={4}>
                          <Form.Item label="Source Table" name="sourceTable" style={{ marginBottom: 8 }}>
                            <Select allowClear placeholder="All">
                              <Option value="">All</Option>
                              <Option value="AP_INVOICES">AP_INVOICES</Option>
                              <Option value="AP_PAYMENTS">AP_PAYMENTS</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={4}>
                          <Form.Item label="Event Type" name="eventType" style={{ marginBottom: 8 }}>
                            <Select allowClear placeholder="All">
                              <Option value="">All</Option>
                              <Option value="AP_INVOICE_CREATION">AP Invoice Creation</Option>
                              <Option value="AP_INVOICE_PAYMENT">AP Invoice Payment</Option>
                              <Option value="INVOICE_VALIDATED">Invoice Validated</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={3}>
                          <Form.Item label="Period" name="period" style={{ marginBottom: 8 }}>
                            <Input placeholder="e.g. Mar-26" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={4}>
                          <Form.Item label="Transaction #" name="sourceNumber" style={{ marginBottom: 8 }}>
                            <Input placeholder="Invoice / Payment #" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={3} style={{ marginBottom: 8 }}>
                          <Space>
                            <Button
                              type="primary"
                              htmlType="submit"
                              icon={<SearchOutlined />}
                              loading={headerLoading}
                              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                            >
                              Search
                            </Button>
                            <Button
                              icon={<ReloadOutlined />}
                              onClick={() => { headerForm.resetFields(); setHeaders([]); setHeaderTotal(0); }}
                            >
                              Reset
                            </Button>
                          </Space>
                        </Col>
                      </Row>
                    </Form>
                  </div>

                  <Divider style={{ margin: 0 }} />

                  {/* Results info */}
                  {headerTotal > 0 && (
                    <div style={{ padding: '8px 16px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
                      <Space>
                        <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>
                          {headerTotal} journal entr{headerTotal === 1 ? 'y' : 'ies'} found
                        </Text>
                        <Tag color="warning">{stats.draft} Draft</Tag>
                        <Tag color="success">{stats.posted} Posted</Tag>
                        {stats.error > 0 && <Tag color="error">{stats.error} Error</Tag>}
                      </Space>
                    </div>
                  )}

                  {/* Headers table */}
                  <Table
                    dataSource={headers}
                    columns={headerColumns}
                    loading={headerLoading}
                    size="small"
                    bordered
                    scroll={{ x: 1400 }}
                    pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `${t} entries` }}
                    style={{ fontSize: 12 }}
                    locale={{ emptyText: 'Search to load subledger journal entries' }}
                    rowClassName={(r) => r.accountingStatus === 'ERROR' ? 'ant-table-row-error' : ''}
                    expandable={{
                      expandedRowRender: (r: SlaHeader) => (
                        <div style={{ padding: '8px 16px', background: REDWOOD.neutral100 }}>
                          <Row gutter={24}>
                            <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Header ID:</Text> <Text code>{r.headerId}</Text></Col>
                            <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Source ID:</Text> <Text code>{r.sourceId}</Text></Col>
                            <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Source Type:</Text> <Text style={{ fontSize: 11 }}>{r.sourceType}</Text></Col>
                            <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Ledger:</Text> <Text style={{ fontSize: 11 }}>{r.ledgerName}</Text></Col>
                            {r.glBatchId && <><Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>GL Batch ID:</Text> <Text code>{r.glBatchId}</Text></Col><Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>GL Header ID:</Text> <Text code>{r.glHeaderId}</Text></Col><Col span={12}><Text type="secondary" style={{ fontSize: 11 }}>GL Batch Name:</Text> <Text style={{ fontSize: 11 }}>{r.glBatchName}</Text></Col></>}
                            {r.postedDate && <Col span={12}><Text type="secondary" style={{ fontSize: 11 }}>Posted:</Text> <Text style={{ fontSize: 11 }}>{r.postedDate} by {r.postedBy}</Text></Col>}
                            <Col span={12}><Text type="secondary" style={{ fontSize: 11 }}>Created:</Text> <Text style={{ fontSize: 11 }}>{r.creationDate} by {r.createdBy}</Text></Col>
                          </Row>
                        </div>
                      ),
                    }}
                    summary={(data) => {
                      if (data.length === 0) return null;
                      return (
                        <Table.Summary.Row style={{ background: REDWOOD.neutral100, fontWeight: 700 }}>
                          <Table.Summary.Cell index={0} colSpan={6}>
                            <Text strong>Total: {data.length} entries</Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={6} align="center">
                            <Badge count={data.reduce((s, r) => s + (r.lineCount || 0), 0)} color={REDWOOD.info} />
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={7} colSpan={5} />
                        </Table.Summary.Row>
                      );
                    }}
                  />
                </div>
              ),
            },

            // ═══════════════════════════════════════════════════════════════
            // TAB 2 — Journal Entry Lines
            // ═══════════════════════════════════════════════════════════════
            {
              key: 'lines',
              label: (
                <Space>
                  <UnorderedListOutlined />
                  Journal Entry Lines
                  {lineTotal > 0 && <Badge count={lineTotal} color={REDWOOD.info} />}
                </Space>
              ),
              children: (
                <div style={{ padding: '0 0 16px' }}>

                  {/* Search panel */}
                  <div style={{ background: REDWOOD.neutral100, padding: '14px 16px', borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
                    <Form
                      form={lineForm}
                      layout="vertical"
                      size="small"
                      onFinish={fetchLines}
                      initialValues={{ status: '', moduleName: 'AP' }}
                    >
                      <Row gutter={[12, 0]} align="bottom">
                        <Col xs={24} sm={12} md={6}>
                          <Form.Item label="Accounting Date" name="dateRange" style={{ marginBottom: 8 }}>
                            <RangePicker
                              format="DD-MMM-YYYY"
                              style={{ width: '100%' }}
                              placeholder={['From', 'To']}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={3}>
                          <Form.Item label="Status" name="status" style={{ marginBottom: 8 }}>
                            <Select allowClear placeholder="All">
                              <Option value="">All</Option>
                              <Option value="DRAFT">Draft</Option>
                              <Option value="POSTED">Posted</Option>
                              <Option value="ERROR">Error</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={3}>
                          <Form.Item label="Module" name="moduleName" style={{ marginBottom: 8 }}>
                            <Select allowClear placeholder="All">
                              <Option value="">All</Option>
                              <Option value="AP">AP</Option>
                              <Option value="AR">AR</Option>
                              <Option value="GL">GL</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={3}>
                          <Form.Item label="Line Type" name="lineType" style={{ marginBottom: 8 }}>
                            <Select allowClear placeholder="All">
                              <Option value="">All</Option>
                              <Option value="DR">Debit (DR)</Option>
                              <Option value="CR">Credit (CR)</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={4}>
                          <Form.Item label="Accounting Class" name="acctClass" style={{ marginBottom: 8 }}>
                            <Select allowClear placeholder="All">
                              <Option value="">All</Option>
                              <Option value="EXPENSE">Expense</Option>
                              <Option value="LIABILITY">Liability</Option>
                              <Option value="TAX">Tax</Option>
                              <Option value="PREPAYMENT">Prepayment</Option>
                              <Option value="ASSET">Asset</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={4}>
                          <Form.Item label="Account Combination" name="account" style={{ marginBottom: 8 }}>
                            <Input placeholder="e.g. 01-100-7010-..." />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={4}>
                          <Form.Item label="Transaction #" name="sourceNumber" style={{ marginBottom: 8 }}>
                            <Input placeholder="Invoice / Payment #" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={3} style={{ marginBottom: 8 }}>
                          <Space>
                            <Button
                              type="primary"
                              htmlType="submit"
                              icon={<SearchOutlined />}
                              loading={lineLoading}
                              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                            >
                              Search
                            </Button>
                            <Button
                              icon={<ReloadOutlined />}
                              onClick={() => { lineForm.resetFields(); setLines([]); setLineTotal(0); }}
                            >
                              Reset
                            </Button>
                          </Space>
                        </Col>
                      </Row>
                    </Form>
                  </div>

                  <Divider style={{ margin: 0 }} />

                  {/* Results info + totals */}
                  {lineTotal > 0 && (
                    <div style={{ padding: '8px 16px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
                      <Space wrap>
                        <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>
                          {lineTotal} line{lineTotal === 1 ? '' : 's'} found
                        </Text>
                        <Divider type="vertical" />
                        <Text style={{ fontSize: 12 }}>
                          Total DR: <Text strong style={{ color: REDWOOD.info }}>{formatAmount(stats.totalDr)}</Text>
                        </Text>
                        <Text style={{ fontSize: 12 }}>
                          Total CR: <Text strong style={{ color: REDWOOD.error }}>{formatAmount(stats.totalCr)}</Text>
                        </Text>
                        {Math.abs(stats.totalDr - stats.totalCr) < 0.01 && stats.totalDr > 0 && (
                          <Tag color="success" icon={<CheckCircleOutlined />}>Balanced</Tag>
                        )}
                      </Space>
                    </div>
                  )}

                  {/* Lines table */}
                  <Table
                    dataSource={lines}
                    columns={lineColumns}
                    loading={lineLoading}
                    size="small"
                    bordered
                    scroll={{ x: 1500 }}
                    pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `${t} lines` }}
                    locale={{ emptyText: 'Search to load subledger accounting lines' }}
                    summary={(data) => {
                      if (data.length === 0) return null;
                      const totalDr = data.reduce((s, r) => s + (r.enteredDr || 0), 0);
                      const totalCr = data.reduce((s, r) => s + (r.enteredCr || 0), 0);
                      return (
                        <Table.Summary.Row style={{ background: REDWOOD.neutral100, fontWeight: 700 }}>
                          <Table.Summary.Cell index={0} colSpan={3}>
                            <Text strong>Total: {data.length} lines</Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={3} colSpan={3} />
                          <Table.Summary.Cell index={6} align="right">
                            <Text strong style={{ color: REDWOOD.info }}>{formatAmount(totalDr)}</Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={7} align="right">
                            <Text strong style={{ color: REDWOOD.error }}>{formatAmount(totalCr)}</Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={8} colSpan={4} />
                        </Table.Summary.Row>
                      );
                    }}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* ── GL Journal Entry Modal ─────────────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <AccountBookOutlined style={{ color: '#C74634' }} />
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              GL Journal Entry — {glJournalData?.journalName || glJournalData?.batchName || 'Loading…'}
            </span>
            {glJournalData?.statusMeaning && (
              <Tag color={glJournalData.statusMeaning === 'Posted' ? 'success' : 'warning'}>
                {glJournalData.statusMeaning}
              </Tag>
            )}
          </Space>
        }
        open={glJournalModalVisible}
        onCancel={() => { setGlJournalModalVisible(false); setGlJournalData(null); setGlJournalLines([]); }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Tooltip title="View API details for this request">
              <Button
                icon={<ApiOutlined />}
                onClick={() => setGlApiModalVisible(true)}
                style={{ color: REDWOOD.info, borderColor: REDWOOD.info }}
              >
                API Info
              </Button>
            </Tooltip>
            <Button onClick={() => setGlJournalModalVisible(false)}>Close</Button>
          </Space>
        }
        width={1200}
        style={{ top: 16 }}
        styles={{ body: { padding: 0, maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' } }}
        destroyOnHidden
      >
        {glJournalLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16, color: REDWOOD.neutral600 }}>Loading GL journal entry…</div>
          </div>
        ) : glJournalData ? (
          <div style={{ padding: 16 }}>
            {/* Header info */}
            <Card
              size="small"
              style={{ marginBottom: 12, borderRadius: 6 }}
              styles={{ header: { background: REDWOOD.neutral100, fontSize: 13, fontWeight: 600 } }}
              title="Journal Header"
            >
              <Descriptions size="small" column={3} bordered styles={{ label: { fontWeight: 500, width: 130, fontSize: 12 }, content: { fontSize: 12 } }}>
                <Descriptions.Item label="Journal Name">{glJournalData.journalName || glJournalData.batchName || '—'}</Descriptions.Item>
                <Descriptions.Item label="Batch Name">{glJournalData.batchName || '—'}</Descriptions.Item>
                <Descriptions.Item label="Period">{glJournalData.periodName || '—'}</Descriptions.Item>
                <Descriptions.Item label="Accounting Date">{glJournalData.effectiveDate || '—'}</Descriptions.Item>
                <Descriptions.Item label="Ledger">{glJournalData.ledgerName || '—'}</Descriptions.Item>
                <Descriptions.Item label="Currency">{glJournalData.currencyCode || '—'}</Descriptions.Item>
                <Descriptions.Item label="Source">{glJournalData.source || 'Payables'}</Descriptions.Item>
                <Descriptions.Item label="Category">{glJournalData.category || glJournalData.eventTypeCode || '—'}</Descriptions.Item>
                <Descriptions.Item label="Status">
                  <Tag color={glJournalData.statusMeaning === 'Posted' ? 'success' : 'warning'}>
                    {glJournalData.statusMeaning || glJournalData.postingStatus || '—'}
                  </Tag>
                </Descriptions.Item>
                {glJournalData.enteredDebit !== undefined && (
                  <Descriptions.Item label="Total Entered Dr">
                    <span style={{ color: REDWOOD.info, fontWeight: 600 }}>
                      {new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2 }).format(glJournalData.enteredDebit || 0)}
                    </span>
                  </Descriptions.Item>
                )}
                {glJournalData.enteredCredit !== undefined && (
                  <Descriptions.Item label="Total Entered Cr">
                    <span style={{ color: REDWOOD.error, fontWeight: 600 }}>
                      {new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2 }).format(glJournalData.enteredCredit || 0)}
                    </span>
                  </Descriptions.Item>
                )}
                {glJournalData.jeHeaderId && (
                  <Descriptions.Item label="GL Header ID">
                    <span style={{ fontFamily: 'monospace' }}>{glJournalData.jeHeaderId}</span>
                  </Descriptions.Item>
                )}
              </Descriptions>
            </Card>

            {/* Journal Lines */}
            <Card
              size="small"
              style={{ borderRadius: 6 }}
              styles={{ header: { background: REDWOOD.neutral100, fontSize: 13, fontWeight: 600 } }}
              title={`Journal Lines ${glJournalLines.length > 0 ? `(${glJournalLines.length})` : ''}`}
            >
              {glJournalLines.length > 0 ? (
                <Table
                  dataSource={glJournalLines}
                  size="small"
                  bordered
                  scroll={{ x: 900 }}
                  pagination={false}
                  columns={[
                    { title: 'Line', dataIndex: 'lineNum', key: 'lineNum', width: 55 },
                    { title: 'Account', dataIndex: 'account', key: 'account', width: 180, render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{v || '—'}</span> },
                    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true, render: (v: string) => <span style={{ fontSize: 11 }}>{v || '—'}</span> },
                    { title: 'Currency', dataIndex: 'currency', key: 'currency', width: 70 },
                    { title: 'Entered Dr', dataIndex: 'enteredDr', key: 'enteredDr', width: 120, align: 'right' as const, render: (v: number) => v > 0 ? <span style={{ color: REDWOOD.info, fontWeight: 600 }}>{formatAmount(v)}</span> : '—' },
                    { title: 'Entered Cr', dataIndex: 'enteredCr', key: 'enteredCr', width: 120, align: 'right' as const, render: (v: number) => v > 0 ? <span style={{ color: REDWOOD.error, fontWeight: 600 }}>{formatAmount(v)}</span> : '—' },
                    { title: 'Accounted Dr', dataIndex: 'accountedDr', key: 'accountedDr', width: 120, align: 'right' as const, render: (v: number) => v > 0 ? formatAmount(v) : '—' },
                    { title: 'Accounted Cr', dataIndex: 'accountedCr', key: 'accountedCr', width: 120, align: 'right' as const, render: (v: number) => v > 0 ? formatAmount(v) : '—' },
                  ]}
                  summary={(data) => {
                    const totDr = data.reduce((s, r) => s + (r.enteredDr || 0), 0);
                    const totCr = data.reduce((s, r) => s + (r.enteredCr || 0), 0);
                    const balanced = Math.abs(totDr - totCr) < 0.01;
                    return (
                      <Table.Summary.Row style={{ background: balanced ? '#f6ffed' : '#fff2f0' }}>
                        <Table.Summary.Cell index={0} colSpan={4}>
                          <span style={{ fontWeight: 700 }}>{balanced ? '✓ Balanced' : '⚠ Out of Balance'}</span>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={4} align="right">
                          <span style={{ fontWeight: 700, color: REDWOOD.info }}>{formatAmount(totDr)}</span>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={5} align="right">
                          <span style={{ fontWeight: 700, color: REDWOOD.error }}>{formatAmount(totCr)}</span>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={6} colSpan={2} />
                      </Table.Summary.Row>
                    );
                  }}
                />
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 0', color: REDWOOD.neutral600 }}>
                  No journal lines available
                </div>
              )}
            </Card>
          </div>
        ) : null}
      </Modal>

      {/* ── GL Journal API Info Modal ─────────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <ApiOutlined style={{ color: REDWOOD.info }} />
            <span style={{ fontWeight: 600 }}>GL Journal — API Details</span>
          </Space>
        }
        open={glApiModalVisible}
        onCancel={() => setGlApiModalVisible(false)}
        footer={<Button onClick={() => setGlApiModalVisible(false)}>Close</Button>}
        width={760}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Last error banner */}
          {glLastError && (
            <div style={{ background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 6, padding: '10px 14px' }}>
              <Space>
                <WarningOutlined style={{ color: REDWOOD.error }} />
                <Text style={{ color: REDWOOD.error, fontWeight: 500 }}>Error: {glLastError}</Text>
              </Space>
            </div>
          )}

          {/* Header endpoint (info only — header data comes from SLA record) */}
          <div style={{ padding: 12, background: REDWOOD.neutral100, borderRadius: 6 }}>
            <Row align="middle" style={{ marginBottom: 8 }}>
              <Space>
                <Tag color="default">SLA</Tag>
                <Text strong>Journal Header</Text>
                <Tag color="blue">Loaded from SLA record — no separate API call</Tag>
              </Space>
            </Row>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Header fields (batch name, period, ledger, currency, status) are sourced directly from the SLA journal record already fetched on this page.
              To query GL headers independently, run:
            </Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <code style={{ background: '#f5f5f5', padding: '4px 8px', borderRadius: 4, fontSize: 11, flex: 1, wordBreak: 'break-all' }}>
                {`${APEX_DB_CONFIG.baseUrl}/gl/journals/headers?jeHeaderId={glHeaderId}`}
              </code>
              <Button size="small" icon={glCopiedUrl === `${APEX_DB_CONFIG.baseUrl}/gl/journals/headers?jeHeaderId={glHeaderId}` ? <CheckOutlined /> : <CopyOutlined />}
                onClick={() => { const u = `${APEX_DB_CONFIG.baseUrl}/gl/journals/headers?jeHeaderId={glHeaderId}`; navigator.clipboard.writeText(u); setGlCopiedUrl(u); setTimeout(() => setGlCopiedUrl(null), 2000); }} />
            </div>
          </div>

          {/* Lines endpoint */}
          {[
            { label: 'Journal Lines', url: glLastLinesUrl, template: `${APEX_DB_CONFIG.baseUrl}/gl/journals/{glHeaderId}/lines` },
          ].map((api, idx) => (
            <div key={idx} style={{ padding: 12, background: REDWOOD.neutral100, borderRadius: 6 }}>
              <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
                <Col>
                  <Space>
                    <Tag color="blue">GET</Tag>
                    <Text strong>{api.label}</Text>
                  </Space>
                </Col>
                {api.url && (
                  <Col>
                    <Tag color={glLastError ? 'red' : 'green'} icon={<CloudOutlined />}>
                      {glLastError ? 'Failed' : 'Success'}
                    </Tag>
                  </Col>
                )}
              </Row>

              <div style={{ marginBottom: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Template:</Text>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <code style={{ background: '#f5f5f5', padding: '4px 8px', borderRadius: 4, fontSize: 11, flex: 1, wordBreak: 'break-all' }}>
                    {api.template}
                  </code>
                  <Button size="small" icon={glCopiedUrl === api.template ? <CheckOutlined /> : <CopyOutlined />}
                    onClick={() => { navigator.clipboard.writeText(api.template); setGlCopiedUrl(api.template); setTimeout(() => setGlCopiedUrl(null), 2000); }} />
                </div>
              </div>

              {api.url && (
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>Last Called URL:</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <code style={{ background: '#e8f5e9', padding: '4px 8px', borderRadius: 4, fontSize: 11, flex: 1, wordBreak: 'break-all' }}>
                      {api.url}
                    </code>
                    <Button size="small" icon={glCopiedUrl === api.url ? <CheckOutlined /> : <CopyOutlined />}
                      onClick={() => { navigator.clipboard.writeText(api.url!); setGlCopiedUrl(api.url!); setTimeout(() => setGlCopiedUrl(null), 2000); }} />
                  </div>
                </div>
              )}

              {!api.url && (
                <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
                  No request made yet — open a GL Journal entry to populate.
                </Text>
              )}
            </div>
          ))}

          {/* Raw lines response for debugging */}
          {glRawLinesData && (
            <div style={{ padding: 12, background: '#1e1e1e', borderRadius: 6 }}>
              <Text strong style={{ color: '#fff', fontSize: 12, display: 'block', marginBottom: 6 }}>
                Raw Lines API Response (for debugging field names):
              </Text>
              <pre style={{ color: '#d4d4d4', fontSize: 11, margin: 0, overflow: 'auto', maxHeight: 300 }}>
                {JSON.stringify(glRawLinesData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Post to GL Modal ──────────────────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <SendOutlined style={{ color: REDWOOD.primary }} />
            <span style={{ fontWeight: 600 }}>Post to GL — SLA Header #{postGLRecord?.headerId}</span>
            {postGLRecord && (
              <Tag color={postGLRecord.accountingStatus === 'DRAFT' ? 'warning' : 'success'}>
                {postGLRecord.accountingStatus}
              </Tag>
            )}
          </Space>
        }
        open={postGLModalVisible}
        onCancel={() => { setPostGLModalVisible(false); setPostGLRecord(null); setPostGLResult(null); }}
        footer={
          <Space>
            <Button onClick={() => { setPostGLModalVisible(false); setPostGLRecord(null); setPostGLResult(null); }}>
              Close
            </Button>
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={postGLLoading}
              disabled={postGLResult?.success === true || postGLFetchingLines || postGLLines.length === 0}
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
              onClick={handlePostToGL}
            >
              {postGLFetchingLines ? 'Loading Lines…' : `Post to GL (${postGLLines.length} lines)`}
            </Button>
          </Space>
        }
        width={780}
        destroyOnClose
      >
        {postGLRecord && (
          <div>
            {/* Endpoint */}
            <div style={{ marginBottom: 12 }}>
              <Text strong style={{ fontSize: 11, color: REDWOOD.neutral600, display: 'block', marginBottom: 4, letterSpacing: 1 }}>
                ENDPOINT
              </Text>
              <div style={{
                background: '#1e1e2e', borderRadius: 6, padding: '10px 14px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}>
                <code style={{ color: '#89d85d', fontSize: 12, wordBreak: 'break-all' }}>
                  <span style={{ color: '#f59e0b', marginRight: 8, fontWeight: 700 }}>POST</span>
                  {GL_CREATE_URL}
                </code>
                <Button
                  size="small" icon={<CopyOutlined />}
                  style={{ flexShrink: 0, background: 'transparent', border: '1px solid #555', color: '#aaa' }}
                  onClick={() => { navigator.clipboard.writeText(GL_CREATE_URL); message.success('Endpoint copied'); }}
                />
              </div>
              <Text style={{ fontSize: 11, color: REDWOOD.neutral600, marginTop: 4, display: 'block' }}>
                After success, also stamps GL IDs back via: <code style={{ fontSize: 10 }}>POST {SLA_POST_URL}</code>
              </Text>
            </div>

            {/* Request Body */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text strong style={{ fontSize: 11, color: REDWOOD.neutral600, letterSpacing: 1 }}>
                  REQUEST BODY (JSON) — journals/create
                </Text>
                {postGLFetchingLines && <Spin size="small" />}
                {!postGLFetchingLines && (
                  <Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>
                    {postGLLines.length} SLA lines mapped → GL lines
                  </Text>
                )}
              </div>
              {postGLFetchingLines ? (
                <div style={{ background: '#1e1e2e', borderRadius: 6, padding: 24, textAlign: 'center' }}>
                  <Spin />
                  <div style={{ color: '#aaa', marginTop: 8, fontSize: 12 }}>Fetching SLA lines…</div>
                </div>
              ) : (
                <div style={{ background: '#1e1e2e', borderRadius: 6, padding: '12px 14px', position: 'relative' }}>
                  <Button
                    size="small" icon={<CopyOutlined />}
                    style={{ position: 'absolute', top: 8, right: 8, background: 'transparent', border: '1px solid #555', color: '#aaa' }}
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(buildGLPayload(postGLRecord, postGLLines, postGLLedger?.ledgerName, postGLLedger?.ledgerId), null, 2));
                      message.success('JSON body copied');
                    }}
                  />
                  <pre style={{ margin: 0, color: '#cdd6f4', fontSize: 11, lineHeight: 1.6, maxHeight: 340, overflowY: 'auto' }}>
                    {JSON.stringify(buildGLPayload(postGLRecord, postGLLines, postGLLedger?.ledgerName, postGLLedger?.ledgerId), null, 2)
                      .split('\n')
                      .map((line, i) => {
                        const colored = line
                          .replace(/"([^"]+)"(:\s)/g, (_, k, rest) =>
                            `<span style="color:#89b4fa">"${k}"</span>${rest}`)
                          .replace(/:\s*"([^"]*)"(,?)$/,
                            (_, v, c) => `: <span style="color:#a6e3a1">"${v}"</span>${c}`)
                          .replace(/:\s*(\d+(?:\.\d+)?)(,?)$/,
                            (_, v, c) => `: <span style="color:#fab387">${v}</span>${c}`)
                          .replace(/:\s*(null|true|false)(,?)$/,
                            (_, v, c) => `: <span style="color:#f38ba8">${v}</span>${c}`);
                        return <span key={i} dangerouslySetInnerHTML={{ __html: colored + '\n' }} />;
                      })}
                  </pre>
                </div>
              )}
            </div>

            {/* SLA Header info */}
            <Descriptions size="small" column={3} bordered
              labelStyle={{ fontWeight: 500, fontSize: 11, width: 120 }}
              contentStyle={{ fontSize: 11 }}
              style={{ marginBottom: 16 }}
            >
              <Descriptions.Item label="Transaction #">{postGLRecord.sourceNumber}</Descriptions.Item>
              <Descriptions.Item label="Period">{postGLRecord.periodName}</Descriptions.Item>
              <Descriptions.Item label="Accounting Date">{postGLRecord.accountingDate}</Descriptions.Item>
              <Descriptions.Item label="Module"><Tag color="blue" style={{ fontSize: 10 }}>{postGLRecord.moduleName}</Tag></Descriptions.Item>
              <Descriptions.Item label="Event Type">{postGLRecord.eventTypeCode}</Descriptions.Item>
              <Descriptions.Item label="Current Status">
                <Tag color={statusColor(postGLRecord.accountingStatus)} icon={statusIcon(postGLRecord.accountingStatus)} style={{ fontSize: 10 }}>
                  {postGLRecord.accountingStatus}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Ledger">{postGLRecord.ledgerName}</Descriptions.Item>
              <Descriptions.Item label="Lines">{postGLRecord.lineCount}</Descriptions.Item>
              <Descriptions.Item label="Description" span={1}>{postGLRecord.description}</Descriptions.Item>
            </Descriptions>

            {/* Result */}
            {postGLResult && (
              <div style={{
                background: postGLResult.success ? '#f6ffed' : '#fff2f0',
                border: `1px solid ${postGLResult.success ? '#b7eb8f' : '#ffa39e'}`,
                borderRadius: 6,
                padding: '12px 16px',
              }}>
                <Text strong style={{ color: postGLResult.success ? REDWOOD.success : REDWOOD.error }}>
                  {postGLResult.success ? '✓ Posted to GL successfully' : '✗ Post failed'}
                </Text>
                <pre style={{ margin: '8px 0 0', fontSize: 12, color: '#333', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(postGLResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── AP Transaction Drill-Down Modal ───────────────────────────────── */}
      <Modal
        title={
          <Space>
            <FileTextOutlined style={{ color: REDWOOD.info }} />
            <span style={{ fontWeight: 600 }}>
              {apTxnType === 'payment' ? 'AP Payment' : 'AP Invoice'} — Transaction Detail
            </span>
          </Space>
        }
        open={apTxnModalVisible}
        onCancel={() => { setApTxnModalVisible(false); setApTxnData(null); setApTxnLines([]); }}
        footer={<Button onClick={() => { setApTxnModalVisible(false); setApTxnData(null); setApTxnLines([]); }}>Close</Button>}
        width={1000}
        destroyOnClose
      >
        {apTxnLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16, color: REDWOOD.neutral600 }}>
              Loading {apTxnType === 'payment' ? 'payment' : 'invoice'} details…
            </div>
          </div>
        ) : apTxnData ? (
          apTxnType === 'payment' ? (
            <Descriptions size="small" column={2} bordered labelStyle={{ fontWeight: 500, width: 150 }}>
              <Descriptions.Item label="Payment Number">{apTxnData.paymentNumber || apTxnData.payment_number || '—'}</Descriptions.Item>
              <Descriptions.Item label="Payment Date">{apTxnData.paymentDate || apTxnData.payment_date || '—'}</Descriptions.Item>
              <Descriptions.Item label="Payee">{apTxnData.payee || apTxnData.payee_name || '—'}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color="success">{apTxnData.paymentStatus || apTxnData.payment_status || '—'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Payment Amount">{apTxnData.paymentAmount || apTxnData.payment_amount || '—'}</Descriptions.Item>
              <Descriptions.Item label="Currency">{apTxnData.paymentCurrency || apTxnData.currency_code || '—'}</Descriptions.Item>
              <Descriptions.Item label="Payment Method">{apTxnData.paymentMethod || apTxnData.payment_method || '—'}</Descriptions.Item>
              <Descriptions.Item label="Payment Document">{apTxnData.paymentDocument || apTxnData.payment_document || '—'}</Descriptions.Item>
              <Descriptions.Item label="Business Unit" span={2}>{apTxnData.businessUnit || apTxnData.business_unit || '—'}</Descriptions.Item>
              <Descriptions.Item label="Bank Account">{apTxnData.remitToAccountNumber || apTxnData.remit_to_account_number || '—'}</Descriptions.Item>
              <Descriptions.Item label="Legal Entity">{apTxnData.legalEntity || apTxnData.legal_entity || '—'}</Descriptions.Item>
            </Descriptions>
          ) : (
            <Tabs
              size="small"
              items={[
                {
                  key: 'header',
                  label: 'Header',
                  children: (
                    <Descriptions size="small" column={2} bordered labelStyle={{ fontWeight: 500, width: 150 }}>
                      <Descriptions.Item label="Invoice Number">{apTxnData.invoiceNumber || apTxnData.invoice_number || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Invoice Date">{apTxnData.invoiceDate || apTxnData.invoice_date || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Supplier">{apTxnData.supplierOrParty || apTxnData.supplier_name || apTxnData.party_name || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Supplier Site">{apTxnData.supplierSite || apTxnData.supplier_site || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Invoice Amount">{apTxnData.invoiceAmount || apTxnData.invoice_amount || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Currency">{apTxnData.invoiceCurrency || apTxnData.currency_code || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Validation Status">
                        <Tag color="blue">{apTxnData.validationStatus || apTxnData.validation_status || '—'}</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Approval Status">
                        <Tag color="green">{apTxnData.approvalStatus || apTxnData.approval_status || 'N/A'}</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Business Unit" span={2}>{apTxnData.businessUnit || apTxnData.business_unit || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Unpaid Amount">{apTxnData.unpaidAmount || apTxnData.unpaid_amount || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Invoice Type">{apTxnData.invoiceType || apTxnData.invoice_type || '—'}</Descriptions.Item>
                    </Descriptions>
                  ),
                },
                {
                  key: 'lines',
                  label: `Lines (${apTxnLines.length})`,
                  children: (
                    <Table
                      size="small"
                      dataSource={apTxnLines.map((l: any, i: number) => ({ ...l, key: l.line_id?.toString() || String(i) }))}
                      pagination={false}
                      scroll={{ x: 800 }}
                      locale={{ emptyText: 'No lines found' }}
                      columns={[
                        { title: '#', dataIndex: 'line_number', key: 'line_number', width: 50 },
                        { title: 'Type', dataIndex: 'line_type', key: 'line_type', width: 70 },
                        { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
                        {
                          title: 'Amount',
                          dataIndex: 'line_amount',
                          key: 'line_amount',
                          width: 120,
                          align: 'right' as const,
                          render: (v: number) => formatAmount(v),
                        },
                        { title: 'Quantity', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'right' as const },
                        { title: 'Unit Price', dataIndex: 'unit_price', key: 'unit_price', width: 100, align: 'right' as const, render: (v: number) => formatAmount(v) },
                        { title: 'PO Number', dataIndex: 'purchase_order_number', key: 'po_number', width: 110, ellipsis: true },
                        { title: 'Tax Rate', dataIndex: 'tax_rate_code', key: 'tax_rate_code', width: 100 },
                      ]}
                    />
                  ),
                },
              ]}
            />
          )
        ) : null}
      </Modal>
    </div>
  );
};

export default ManageSLAJournals;
