import React, { useState, useEffect, useRef } from 'react';
import {
  Layout, Typography, Card, Breadcrumb, Space, Tabs,
  Form, Select, Input, Button, Table, Tag, Spin, Divider,
  Tooltip, message, Empty,
} from 'antd';
import {
  HomeOutlined, FileTextOutlined, BarChartOutlined, DollarOutlined,
  ClockCircleOutlined, PlayCircleOutlined, FileExcelOutlined,
  FilePdfOutlined, TeamOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { APEX_DB_CONFIG } from '../../config/api.config';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

const REDWOOD = {
  primary: '#C74634', success: '#1D7B4D', warning: '#D4A800',
  info: '#0572CE', neutral100: '#F7F7F7', neutral200: '#E5E5E5',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
  reportGreen: '#1D7B4D',
};

// ─── Report definitions ───────────────────────────────────────────────────────
interface ReportDef {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  hasSupplierFilter: boolean;
  hasDateFilter: boolean;
}

const REPORTS: ReportDef[] = [
  {
    key: 'suppliers-listing',
    label: 'Suppliers Listing',
    description: 'List of registered suppliers with status and tax info',
    icon: <TeamOutlined />,
    color: REDWOOD.info,
    hasSupplierFilter: true,
    hasDateFilter: false,
  },
  {
    key: 'supplier-balance',
    label: 'Supplier Balance Report',
    description: 'Outstanding invoice balances summarised by supplier',
    icon: <BarChartOutlined />,
    color: REDWOOD.success,
    hasSupplierFilter: true,
    hasDateFilter: false,
  },
  {
    key: 'payment-register',
    label: 'Payment Register',
    description: 'All payments made within the selected period',
    icon: <DollarOutlined />,
    color: REDWOOD.primary,
    hasSupplierFilter: true,
    hasDateFilter: true,
  },
  {
    key: 'aging-report',
    label: 'Supplier Balance Aging Report',
    description: 'Outstanding payables aged by due date buckets',
    icon: <ClockCircleOutlined />,
    color: REDWOOD.warning,
    hasSupplierFilter: true,
    hasDateFilter: false,
  },
];

// ─── Column definitions per report ───────────────────────────────────────────
const COLUMNS: Record<string, any[]> = {
  'suppliers-listing': [
    { title: 'Supplier Number', dataIndex: 'supplierNumber', key: 'supplierNumber', width: 140 },
    { title: 'Supplier Name',   dataIndex: 'supplier',       key: 'supplier',       width: 220 },
    { title: 'Type',            dataIndex: 'supplierType',   key: 'supplierType',   width: 120 },
    { title: 'Status',          dataIndex: 'status',         key: 'status',         width: 90,
      render: (s: string) => <Tag color={s === 'Active' ? 'green' : 'default'}>{s || 'Active'}</Tag> },
    { title: 'Taxpayer ID',     dataIndex: 'taxpayerId',     key: 'taxpayerId',     width: 130 },
    { title: 'Tax Reg #',       dataIndex: 'taxRegistrationNumber', key: 'taxReg',  width: 140 },
    { title: 'Creation Date',   dataIndex: 'creationDate',   key: 'creationDate',   width: 120 },
  ],
  'supplier-balance': [
    { title: 'Supplier #',      dataIndex: 'supplierNumber', key: 'supplierNumber', width: 120 },
    { title: 'Supplier Name',   dataIndex: 'supplier',       key: 'supplier',       width: 220 },
    { title: 'Invoices',        dataIndex: 'invoiceCount',   key: 'invoiceCount',   width: 80,  align: 'right' as const },
    { title: 'Invoice Amount',  dataIndex: 'invoiceAmount',  key: 'invoiceAmount',  width: 140, align: 'right' as const,
      render: (v: number) => <Text strong>{fmt(v)}</Text> },
    { title: 'Amount Paid',     dataIndex: 'amountPaid',     key: 'amountPaid',     width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ color: REDWOOD.success }}>{fmt(v)}</Text> },
    { title: 'Outstanding',     dataIndex: 'outstanding',    key: 'outstanding',    width: 130, align: 'right' as const,
      render: (v: number) => <Text strong style={{ color: v > 0 ? REDWOOD.primary : REDWOOD.success }}>{fmt(v)}</Text> },
    { title: 'Currency',        dataIndex: 'currency',       key: 'currency',       width: 80 },
  ],
  'payment-register': [
    { title: 'Payment #',       dataIndex: 'paymentNumber',  key: 'paymentNumber',  width: 140 },
    { title: 'Date',            dataIndex: 'paymentDate',    key: 'paymentDate',    width: 110 },
    { title: 'Supplier',        dataIndex: 'payee',          key: 'payee',          width: 200 },
    { title: 'Amount',          dataIndex: 'paymentAmount',  key: 'paymentAmount',  width: 130, align: 'right' as const,
      render: (v: number) => <Text strong>{fmt(v)}</Text> },
    { title: 'Currency',        dataIndex: 'currency',       key: 'currency',       width: 80 },
    { title: 'Status',          dataIndex: 'paymentStatus',  key: 'paymentStatus',  width: 110,
      render: (s: string) => <Tag color={s === 'NEGOTIABLE' ? 'green' : s === 'VOIDED' ? 'red' : 'blue'}>{s}</Tag> },
    { title: 'Method',          dataIndex: 'paymentMethod',  key: 'paymentMethod',  width: 110 },
    { title: 'Bank Account',    dataIndex: 'bankAccountName', key: 'bankAccountName', ellipsis: true },
  ],
  'aging-report': [
    { title: 'Supplier #',      dataIndex: 'supplierNumber', key: 'supplierNumber', width: 120 },
    { title: 'Supplier Name',   dataIndex: 'supplier',       key: 'supplier',       width: 200 },
    { title: 'Current',         dataIndex: 'current',        key: 'current',        width: 120, align: 'right' as const,
      render: (v: number) => <Text style={{ color: REDWOOD.success }}>{fmt(v)}</Text> },
    { title: '1–30 Days',       dataIndex: 'days30',         key: 'days30',         width: 110, align: 'right' as const,
      render: (v: number) => <Text style={{ color: v > 0 ? REDWOOD.warning : undefined }}>{fmt(v)}</Text> },
    { title: '31–60 Days',      dataIndex: 'days60',         key: 'days60',         width: 110, align: 'right' as const,
      render: (v: number) => <Text style={{ color: v > 0 ? '#D46B08' : undefined }}>{fmt(v)}</Text> },
    { title: '61–90 Days',      dataIndex: 'days90',         key: 'days90',         width: 110, align: 'right' as const,
      render: (v: number) => <Text style={{ color: v > 0 ? REDWOOD.primary : undefined }}>{fmt(v)}</Text> },
    { title: '90+ Days',        dataIndex: 'days90plus',     key: 'days90plus',     width: 110, align: 'right' as const,
      render: (v: number) => <Text strong style={{ color: v > 0 ? '#8B0000' : undefined }}>{fmt(v)}</Text> },
    { title: 'Total',           dataIndex: 'total',          key: 'total',          width: 130, align: 'right' as const,
      render: (v: number) => <Text strong>{fmt(v)}</Text> },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: number) =>
  Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const daysDiff = (dateStr: string) => {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  return Math.floor((new Date().getTime() - d.getTime()) / 86400000);
};

// ─── Per-tab report panel (isolated state) ────────────────────────────────────
interface ReportPanelProps {
  report: ReportDef;
  businessUnits: string[];
}

const ReportPanel: React.FC<ReportPanelProps> = ({ report, businessUnits }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const reportTitle = useRef('');

  // ── Fetch helpers ────────────────────────────────────────────────────────
  const fetchSuppliersListing = async (bu: string, supplierNum: string, supplierName: string) => {
    const params = new URLSearchParams();
    if (bu)           params.set('P_BUSINESS_UNIT', bu);
    if (supplierNum)  params.set('supplier_number', supplierNum);
    if (supplierName) params.set('supplier', supplierName);
    const url = `${APEX_DB_CONFIG.baseUrl}/suppliers${params.toString() ? '?' + params : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = JSON.parse(await res.text() || '{}');
    const items: any[] = Array.isArray(data) ? data : (data.items || []);
    return items.map((it: any, i: number) => ({
      key: it.supplier_id?.toString() || i.toString(),
      supplierNumber: it.supplier_number || '',
      supplier: it.supplier || '',
      supplierType: it.supplier_type || '',
      status: it.status || 'Active',
      taxpayerId: it.taxpayer_id || '',
      taxRegistrationNumber: it.tax_registration_number || '',
      creationDate: it.creation_date ? it.creation_date.slice(0, 10) : '',
    }));
  };

  const fetchSupplierBalance = async (bu: string, supplierNum: string) => {
    const params = new URLSearchParams();
    if (bu)          params.set('business_unit', bu);
    if (supplierNum) params.set('supplier_number', supplierNum);
    const url = `${APEX_DB_CONFIG.baseUrl}/ap/createinvoice${params.toString() ? '?' + params : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = JSON.parse(await res.text() || '{}');
    const items: any[] = Array.isArray(data) ? data : (data.items || []);
    const map = new Map<string, any>();
    for (const it of items) {
      const sKey = it.supplier_number || it.supplier || 'Unknown';
      const amt = Number(it.invoice_amount || 0);
      const paid = Number(it.amount_paid || 0);
      const existing = map.get(sKey);
      if (existing) {
        existing.invoiceCount += 1;
        existing.invoiceAmount += amt;
        existing.amountPaid += paid;
        existing.outstanding += (amt - paid);
      } else {
        map.set(sKey, {
          key: sKey,
          supplierNumber: it.supplier_number || '',
          supplier: it.supplier || '',
          invoiceCount: 1,
          invoiceAmount: amt,
          amountPaid: paid,
          outstanding: amt - paid,
          currency: it.invoice_currency || 'AED',
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding);
  };

  const fetchPaymentRegister = async (bu: string, supplierNum: string, dateFrom: string, dateTo: string) => {
    const params = new URLSearchParams();
    if (bu)          params.set('business_unit', bu);
    if (supplierNum) params.set('supplier_number', supplierNum);
    if (dateFrom)    params.set('date_from', dateFrom);
    if (dateTo)      params.set('date_to', dateTo);
    params.set('limit', '500');
    const res = await fetch(`${APEX_DB_CONFIG.baseUrl}/ap/payments?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = JSON.parse(await res.text() || '{}');
    const items: any[] = Array.isArray(data) ? data : (data.items || data.payments || []);
    return items.map((it: any, i: number) => ({
      key: it.payment_id?.toString() || it.check_id?.toString() || i.toString(),
      paymentNumber: it.payment_number || it.check_number || '',
      paymentDate: (it.payment_date || it.check_date || '').slice(0, 10),
      payee: it.payee || it.supplier || it.Payee || '',
      paymentAmount: Number(it.payment_amount || it.amount || 0),
      currency: it.currency || it.payment_currency || 'AED',
      paymentStatus: it.payment_status || it.status || '',
      paymentMethod: it.payment_method || '',
      bankAccountName: it.bank_account_name || '',
    }));
  };

  const fetchAgingReport = async (bu: string, supplierNum: string) => {
    const params = new URLSearchParams();
    if (bu)          params.set('business_unit', bu);
    if (supplierNum) params.set('supplier_number', supplierNum);
    params.set('limit', '500');
    const res = await fetch(`${APEX_DB_CONFIG.baseUrl}/ap/createinvoice?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = JSON.parse(await res.text() || '{}');
    const items: any[] = (Array.isArray(data) ? data : (data.items || [])).filter(
      (it: any) => (it.paid_status || '').toUpperCase() !== 'PAID'
    );
    const map = new Map<string, any>();
    for (const it of items) {
      const sKey = it.supplier_number || it.supplier || 'Unknown';
      const balance = Number(it.invoice_amount || 0) - Number(it.amount_paid || 0);
      if (balance <= 0) continue;
      const age = daysDiff(it.terms_date || it.invoice_date || '');
      const existing = map.get(sKey) || {
        key: sKey,
        supplierNumber: it.supplier_number || '',
        supplier: it.supplier || '',
        current: 0, days30: 0, days60: 0, days90: 0, days90plus: 0, total: 0,
      };
      if (age <= 0)        existing.current    += balance;
      else if (age <= 30)  existing.days30     += balance;
      else if (age <= 60)  existing.days60     += balance;
      else if (age <= 90)  existing.days90     += balance;
      else                 existing.days90plus += balance;
      existing.total += balance;
      map.set(sKey, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  };

  // ── Run ──────────────────────────────────────────────────────────────────
  const handleRun = async () => {
    const vals = form.getFieldsValue();
    const bu           = vals.businessUnit  || '';
    const supplierNum  = vals.supplierNumber || '';
    const supplierName = vals.supplierName   || '';
    const dateFrom     = vals.dateFrom       || '';
    const dateTo       = vals.dateTo         || '';

    setLoading(true);
    setRows([]);
    reportTitle.current = `${report.label}${bu ? ' — ' + bu : ''}`;
    try {
      let result: any[] = [];
      if (report.key === 'suppliers-listing')
        result = await fetchSuppliersListing(bu, supplierNum, supplierName);
      else if (report.key === 'supplier-balance')
        result = await fetchSupplierBalance(bu, supplierNum);
      else if (report.key === 'payment-register')
        result = await fetchPaymentRegister(bu, supplierNum, dateFrom, dateTo);
      else if (report.key === 'aging-report')
        result = await fetchAgingReport(bu, supplierNum);

      setRows(result);
      setHasRun(true);
      if (result.length === 0) message.info('No data found for the selected parameters.');
      else message.success(`${result.length} records loaded.`);
    } catch (e: any) {
      message.error(`Report failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Export ───────────────────────────────────────────────────────────────
  const exportExcel = () => {
    const cols = COLUMNS[report.key];
    const exportRows = rows.map(r => {
      const obj: any = {};
      for (const c of cols) {
        const val = r[c.dataIndex as string];
        obj[c.title] = typeof val === 'number' ? val : (val ?? '');
      }
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, report.label.slice(0, 31));
    saveAs(
      new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/octet-stream' }),
      `${report.key}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  const exportPdf = () => {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const cols = COLUMNS[report.key];
    doc.setFontSize(14);
    doc.setTextColor(30, 30, 30);
    doc.text(reportTitle.current, 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}   Records: ${rows.length}`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [cols.map(c => c.title)],
      body: rows.map(r => cols.map(c => {
        const v = r[c.dataIndex as string];
        return typeof v === 'number' ? fmt(v) : (v ?? '');
      })),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [199, 70, 52], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [247, 247, 247] },
    });
    doc.save(`${report.key}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const columns = COLUMNS[report.key];

  return (
    <div style={{ padding: '16px 0' }}>
      {/* Description */}
      <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>
        {report.description}
      </Text>

      {/* Parameters form */}
      <Card
        size="small"
        style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, marginBottom: 16 }}
        styles={{ body: { padding: '14px 16px' } }}
      >
        <Form form={form} layout="inline" size="small">
          <Form.Item label="Business Unit" name="businessUnit">
            <Select placeholder="All Business Units" allowClear showSearch style={{ width: 220 }}
              filterOption={(i, o) => String(o?.value ?? '').toLowerCase().includes(i.toLowerCase())}>
              {businessUnits.map(bu => <Option key={bu} value={bu}>{bu}</Option>)}
            </Select>
          </Form.Item>

          {report.hasSupplierFilter && (
            <>
              <Form.Item label="Supplier #" name="supplierNumber">
                <Input placeholder="Optional" style={{ width: 130 }} allowClear />
              </Form.Item>
              <Form.Item label="Supplier Name" name="supplierName">
                <Input placeholder="Optional" style={{ width: 160 }} allowClear />
              </Form.Item>
            </>
          )}

          {report.hasDateFilter && (
            <>
              <Form.Item label="Date From" name="dateFrom">
                <Input type="date" style={{ width: 140 }} />
              </Form.Item>
              <Form.Item label="Date To" name="dateTo">
                <Input type="date" style={{ width: 140 }} />
              </Form.Item>
            </>
          )}
        </Form>
      </Card>

      {/* Action buttons */}
      <Space style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={handleRun}
          loading={loading}
          style={{ background: report.color, borderColor: report.color }}
        >
          Run Report
        </Button>
        <Tooltip title="Export to Excel">
          <Button icon={<FileExcelOutlined />} onClick={exportExcel} disabled={rows.length === 0}>
            Excel
          </Button>
        </Tooltip>
        <Tooltip title="Export to PDF">
          <Button icon={<FilePdfOutlined />} onClick={exportPdf} disabled={rows.length === 0} danger>
            PDF
          </Button>
        </Tooltip>
        {rows.length > 0 && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {rows.length} record{rows.length !== 1 ? 's' : ''}
          </Text>
        )}
      </Space>

      {/* Results */}
      <Spin spinning={loading}>
        {!hasRun ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<Text type="secondary">Set parameters and click Run Report</Text>}
            style={{ padding: '40px 0' }}
          />
        ) : (
          <Table
            dataSource={rows}
            columns={columns}
            rowKey="key"
            size="small"
            scroll={{ x: 'max-content', y: 460 }}
            pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `${t} records` }}
            summary={
              report.key === 'supplier-balance' ? () => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={2}><Text strong>Total</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    <Text strong>{rows.reduce((s, r) => s + (r.invoiceCount || 0), 0)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <Text strong>{fmt(rows.reduce((s, r) => s + (r.invoiceAmount || 0), 0))}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <Text style={{ color: REDWOOD.success }}>{fmt(rows.reduce((s, r) => s + (r.amountPaid || 0), 0))}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">
                    <Text strong style={{ color: REDWOOD.primary }}>{fmt(rows.reduce((s, r) => s + (r.outstanding || 0), 0))}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} />
                </Table.Summary.Row>
              ) : report.key === 'aging-report' ? () => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={2}><Text strong>Total</Text></Table.Summary.Cell>
                  {(['current', 'days30', 'days60', 'days90', 'days90plus', 'total'] as const).map((f, i) => (
                    <Table.Summary.Cell key={f} index={i + 2} align="right">
                      <Text strong>{fmt(rows.reduce((s, r) => s + (r[f] || 0), 0))}</Text>
                    </Table.Summary.Cell>
                  ))}
                </Table.Summary.Row>
              ) : report.key === 'payment-register' ? () => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={3}><Text strong>Total</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <Text strong>{fmt(rows.reduce((s, r) => s + (r.paymentAmount || 0), 0))}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} colSpan={4} />
                </Table.Summary.Row>
              ) : undefined
            }
          />
        )}
      </Spin>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const APReports: React.FC = () => {
  const [businessUnits, setBusinessUnits] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${APEX_DB_CONFIG.baseUrl}/gl/businessunits`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const items: any[] = Array.isArray(data) ? data : (data.items || []);
        setBusinessUnits(items.map((i: any) => i.business_unit_name || '').filter(Boolean));
      }).catch(() => {});
  }, []);

  const tabItems = REPORTS.map(report => ({
    key: report.key,
    label: (
      <Space size={6}>
        <span style={{ color: report.color, fontSize: 14 }}>{report.icon}</span>
        <span>{report.label}</span>
      </Space>
    ),
    children: <ReportPanel report={report} businessUnits={businessUnits} />,
  }));

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb */}
        <div style={{ padding: '16px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/ap">Payables</Link> },
            { title: 'Reports' },
          ]} />
        </div>

        <div style={{ padding: 24, paddingRight: 96 }}>
          {/* Page title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 10,
              background: `linear-gradient(135deg, ${REDWOOD.reportGreen} 0%, #0D5C36 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 12px ${REDWOOD.reportGreen}40`,
            }}>
              <BarChartOutlined style={{ fontSize: 24, color: '#fff' }} />
            </div>
            <div>
              <Title level={3} style={{ margin: 0 }}>Reports — Payables</Title>
              <Text type="secondary">Each tab is independent — run multiple reports at the same time</Text>
            </div>
          </div>

          {/* Tabs */}
          <Card
            style={{ borderRadius: 10, border: `1px solid ${REDWOOD.neutral200}` }}
            styles={{ body: { padding: '0 24px 24px' } }}
          >
            <Tabs
              type="card"
              size="small"
              items={tabItems}
              style={{ marginTop: 0 }}
              tabBarStyle={{ marginBottom: 0, borderBottom: `1px solid ${REDWOOD.neutral200}` }}
            />
          </Card>
        </div>
      </Content>
    </Layout>
  );
};

export default APReports;
