import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Layout, Typography, Card, Breadcrumb, Space, Tabs,
  Form, Select, Input, Button, Table, Tag, Spin,
  Tooltip, message, Empty, Modal,
} from 'antd';
import {
  HomeOutlined, BarChartOutlined, DollarOutlined,
  ClockCircleOutlined, PlayCircleOutlined, FileExcelOutlined,
  FilePdfOutlined, TeamOutlined, SearchOutlined,
  ApiOutlined, CopyOutlined, FileTextOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined,
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
  neutral300: '#C7C7C7', neutral600: '#6B6B6B', neutral900: '#1A1A1A',
  surface: '#FFFFFF', reportGreen: '#1D7B4D',
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
  hasAgingDate?: boolean;
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
    description: 'Outstanding payables aged by overdue period per supplier — click a row to drill down to invoices',
    icon: <ClockCircleOutlined />,
    color: REDWOOD.warning,
    hasSupplierFilter: true,
    hasDateFilter: false,
    hasAgingDate: true,
  },
  {
    key: 'aging-by-invoice',
    label: 'Supplier Aging by Invoice',
    description: 'Outstanding payables aged by overdue period, one row per invoice',
    icon: <FileTextOutlined />,
    color: '#7B5EA7',
    hasSupplierFilter: true,
    hasDateFilter: false,
    hasAgingDate: true,
  },
];

// ─── Drill-down invoice columns (shown when expanding an aging-report row) ────
const AGING_DRILL_COLUMNS = [
  { title: 'Invoice #',      dataIndex: 'invoiceNumber', key: 'invoiceNumber', width: 150 },
  { title: 'Invoice Date',   dataIndex: 'invoiceDate',   key: 'invoiceDate',   width: 110 },
  { title: 'Due Date',       dataIndex: 'dueDate',       key: 'dueDate',       width: 110 },
  { title: 'Invoice Amount', dataIndex: 'invoiceAmount', key: 'invoiceAmount', width: 140, align: 'right' as const,
    render: (v: number) => <Text>{fmt(v)}</Text> },
  { title: 'Amount Paid',    dataIndex: 'amountPaid',    key: 'amountPaid',    width: 120, align: 'right' as const,
    render: (v: number) => <Text style={{ color: REDWOOD.success }}>{fmt(v)}</Text> },
  { title: 'Unpaid Amount',  dataIndex: 'unpaidAmount',  key: 'unpaidAmount',  width: 130, align: 'right' as const,
    render: (v: number) => <Text strong style={{ color: v > 0 ? REDWOOD.primary : undefined }}>{fmt(v)}</Text> },
  { title: '1 Month Overdue',    dataIndex: 'months1',    key: 'months1',    width: 120, align: 'right' as const,
    render: (v: number) => <Text style={{ color: v > 0 ? REDWOOD.warning : undefined }}>{fmt(v)}</Text> },
  { title: '2 Months Overdue',   dataIndex: 'months2',    key: 'months2',    width: 130, align: 'right' as const,
    render: (v: number) => <Text style={{ color: v > 0 ? '#D46B08' : undefined }}>{fmt(v)}</Text> },
  { title: '3 Months Overdue',   dataIndex: 'months3',    key: 'months3',    width: 130, align: 'right' as const,
    render: (v: number) => <Text style={{ color: v > 0 ? REDWOOD.primary : undefined }}>{fmt(v)}</Text> },
  { title: 'Over 3 Months',      dataIndex: 'over3months', key: 'over3months', width: 130, align: 'right' as const,
    render: (v: number) => <Text strong style={{ color: v > 0 ? '#8B0000' : undefined }}>{fmt(v)}</Text> },
  { title: 'Unallocated',        dataIndex: 'unallocated', key: 'unallocated', width: 120, align: 'right' as const,
    render: (v: number) => <Text style={{ color: v > 0 ? REDWOOD.neutral600 : undefined }}>{fmt(v)}</Text> },
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
    { title: 'Payment #',        dataIndex: 'paymentNumber',   key: 'paymentNumber',  width: 140 },
    { title: 'Date',             dataIndex: 'paymentDate',     key: 'paymentDate',    width: 110 },
    { title: 'Supplier',         dataIndex: 'payee',           key: 'payee',          width: 200 },
    { title: 'Amount',           dataIndex: 'paymentAmount',   key: 'paymentAmount',  width: 130, align: 'right' as const,
      render: (v: number) => <Text strong>{fmt(v)}</Text> },
    { title: 'Currency',         dataIndex: 'currency',        key: 'currency',       width: 80 },
    { title: 'Status',           dataIndex: 'paymentStatus',   key: 'paymentStatus',  width: 110,
      render: (s: string) => <Tag color={s === 'NEGOTIABLE' ? 'green' : s === 'VOIDED' ? 'red' : 'blue'}>{s}</Tag> },
    { title: 'Method',           dataIndex: 'paymentMethod',   key: 'paymentMethod',  width: 110 },
    { title: 'Bank Account',     dataIndex: 'bankAccountName', key: 'bankAccountName', ellipsis: true },
  ],
  'aging-report': [
    { title: 'Supplier',          dataIndex: 'supplier',       key: 'supplier',       width: 220 },
    { title: 'Invoice Amount',    dataIndex: 'invoiceAmount',  key: 'invoiceAmount',  width: 140, align: 'right' as const,
      render: (v: number) => <Text>{fmt(v)}</Text> },
    { title: 'Unpaid Amount',     dataIndex: 'unpaidAmount',   key: 'unpaidAmount',   width: 140, align: 'right' as const,
      render: (v: number) => <Text strong>{fmt(v)}</Text> },
    { title: '1 Month Overdue',   dataIndex: 'months1',        key: 'months1',        width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ color: v > 0 ? REDWOOD.warning : undefined }}>{fmt(v)}</Text> },
    { title: '2 Months Overdue',  dataIndex: 'months2',        key: 'months2',        width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ color: v > 0 ? '#D46B08' : undefined }}>{fmt(v)}</Text> },
    { title: '3 Months Overdue',  dataIndex: 'months3',        key: 'months3',        width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ color: v > 0 ? REDWOOD.primary : undefined }}>{fmt(v)}</Text> },
    { title: 'Over 3 Months Overdue', dataIndex: 'over3months', key: 'over3months',   width: 150, align: 'right' as const,
      render: (v: number) => <Text strong style={{ color: v > 0 ? '#8B0000' : undefined }}>{fmt(v)}</Text> },
    { title: 'Unallocated Amount', dataIndex: 'unallocated',   key: 'unallocated',    width: 140, align: 'right' as const,
      render: (v: number) => <Text style={{ color: v > 0 ? REDWOOD.neutral600 : undefined }}>{fmt(v)}</Text> },
  ],
  'aging-by-invoice': [
    { title: 'Supplier',          dataIndex: 'supplier',       key: 'supplier',       width: 200 },
    { title: 'Invoice #',         dataIndex: 'invoiceNumber',  key: 'invoiceNumber',  width: 150 },
    { title: 'Invoice Date',      dataIndex: 'invoiceDate',    key: 'invoiceDate',    width: 110 },
    { title: 'Due Date',          dataIndex: 'dueDate',        key: 'dueDate',        width: 110 },
    { title: 'Invoice Amount',    dataIndex: 'invoiceAmount',  key: 'invoiceAmount',  width: 140, align: 'right' as const,
      render: (v: number) => <Text>{fmt(v)}</Text> },
    { title: 'Unpaid Amount',     dataIndex: 'unpaidAmount',   key: 'unpaidAmount',   width: 130, align: 'right' as const,
      render: (v: number) => <Text strong>{fmt(v)}</Text> },
    { title: '1 Month Overdue',   dataIndex: 'months1',        key: 'months1',        width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ color: v > 0 ? REDWOOD.warning : undefined }}>{fmt(v)}</Text> },
    { title: '2 Months Overdue',  dataIndex: 'months2',        key: 'months2',        width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ color: v > 0 ? '#D46B08' : undefined }}>{fmt(v)}</Text> },
    { title: '3 Months Overdue',  dataIndex: 'months3',        key: 'months3',        width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ color: v > 0 ? REDWOOD.primary : undefined }}>{fmt(v)}</Text> },
    { title: 'Over 3 Months Overdue', dataIndex: 'over3months', key: 'over3months',   width: 150, align: 'right' as const,
      render: (v: number) => <Text strong style={{ color: v > 0 ? '#8B0000' : undefined }}>{fmt(v)}</Text> },
    { title: 'Unallocated Amount', dataIndex: 'unallocated',   key: 'unallocated',    width: 140, align: 'right' as const,
      render: (v: number) => <Text style={{ color: v > 0 ? REDWOOD.neutral600 : undefined }}>{fmt(v)}</Text> },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: number) =>
  Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Categorise an outstanding balance into aging buckets based on days overdue
const agingBuckets = (age: number, bal: number) => ({
  months1:    age >= 1  && age <= 30  ? bal : 0,
  months2:    age >= 31 && age <= 60  ? bal : 0,
  months3:    age >= 61 && age <= 90  ? bal : 0,
  over3months: age > 90               ? bal : 0,
  unallocated: age <= 0               ? bal : 0,
});

// ─── Per-tab report panel (fully isolated state) ──────────────────────────────
const ReportPanel: React.FC<{ report: ReportDef; businessUnits: string[] }> = ({ report, businessUnits }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const [gridSearch, setGridSearch] = useState('');
  const reportTitle = useRef('');
  const [apiUrls, setApiUrls] = useState<string[]>([]);
  const [apiModalOpen, setApiModalOpen] = useState(false);

  const filteredRows = useMemo(() => {
    if (!gridSearch.trim()) return rows;
    const q = gridSearch.toLowerCase();
    return rows.filter(r =>
      Object.values(r).some(v => typeof v !== 'object' && String(v ?? '').toLowerCase().includes(q))
    );
  }, [rows, gridSearch]);

  const fetchSuppliersListing = async (bu: string, supplierNum: string, supplierName: string) => {
    const p = new URLSearchParams();
    if (bu)           p.set('P_BUSINESS_UNIT', bu);
    if (supplierNum)  p.set('supplier_number', supplierNum);
    if (supplierName) p.set('supplier', supplierName);
    const url = `${APEX_DB_CONFIG.baseUrl}/suppliers${p.toString() ? '?' + p : ''}`;
    setApiUrls([url]);
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
    const p = new URLSearchParams();
    if (bu)          p.set('P_BUSINESS_UNIT', bu);
    if (supplierNum) p.set('supplier_number', supplierNum);
    const listUrl = `${APEX_DB_CONFIG.baseUrl}/suppliers${p.toString() ? '?' + p : ''}`;
    const summaryPattern = `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/summary/{supplierNumber}`;
    setApiUrls([listUrl, summaryPattern]);
    const listRes = await fetch(listUrl);
    if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`);
    const listData = JSON.parse(await listRes.text() || '{}');
    const suppliers: any[] = Array.isArray(listData) ? listData : (listData.items || []);

    const results = await Promise.allSettled(
      suppliers.map(async (s: any) => {
        const sn = s.supplier_number || '';
        if (!sn) return null;
        const r = await fetch(`${APEX_DB_CONFIG.baseUrl}/suppliers/balance/summary/${encodeURIComponent(sn)}`);
        if (!r.ok) return null;
        const d = JSON.parse(await r.text() || '{}');
        const bs = d.balance_summary || d;
        const outstanding = Number(bs.balance ?? bs.outstanding_balance ?? 0);
        if (outstanding <= 0) return null;
        return {
          key:          sn,
          supplierNumber: sn,
          supplier:     s.supplier || s.supplier_name || sn,
          invoiceCount: Number(bs.total_invoices ?? 0),
          invoiceAmount: Number(bs.total_invoice_amount ?? 0),
          amountPaid:   Number(bs.total_payment_amount ?? bs.total_paid ?? 0),
          outstanding,
          currency:     bs.currency || 'AED',
        };
      })
    );

    return results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value)
      .sort((a, b) => b.outstanding - a.outstanding);
  };

  const fetchPaymentRegister = async (bu: string, supplierNum: string, dateFrom: string, dateTo: string) => {
    const p = new URLSearchParams();
    if (bu)          p.set('business_unit', bu);
    if (supplierNum) p.set('supplier_number', supplierNum);
    if (dateFrom)    p.set('date_from', dateFrom);
    if (dateTo)      p.set('date_to', dateTo);
    p.set('limit', '500');
    const url = `${APEX_DB_CONFIG.baseUrl}/ap/payments?${p}`;
    setApiUrls([url]);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = JSON.parse(await res.text() || '{}');
    const items: any[] = Array.isArray(data) ? data : (data.items || data.payments || []);
    return items.map((it: any, i: number) => ({
      key: it.payment_id?.toString() || i.toString(),
      paymentNumber: it.payment_number || it.check_number || '',
      paymentDate: (it.payment_date || it.check_date || '').slice(0, 10),
      payee: it.payee || it.supplier || '',
      paymentAmount: Number(it.payment_amount || it.amount || 0),
      currency: it.currency || it.payment_currency || 'AED',
      paymentStatus: it.payment_status || it.status || '',
      paymentMethod: it.payment_method || '',
      bankAccountName: it.bank_account_name || '',
    }));
  };

  // Build per-invoice aging row (shared by both aging reports)
  const buildInvoiceAgingRow = (inv: any, supplierName: string, asAt: Date, idx: number) => {
    const invDate = new Date(inv.invoice_date || inv.terms_date || '');
    if (isNaN(invDate.getTime())) return null;
    const invAmt   = Number(inv.invoice_amount || 0);
    const paid     = Number(inv.amount_paid || 0);
    const bal      = Number(inv.amount_remaining ?? (invAmt - paid));
    if (bal <= 0) return null;
    const age  = Math.floor((asAt.getTime() - invDate.getTime()) / 86400000);
    const bkts = agingBuckets(age, bal);
    return {
      key:           `${inv.invoice_number || idx}-${idx}`,
      supplier:      supplierName,
      invoiceNumber: inv.invoice_number || inv.invoice_num || '',
      invoiceDate:   (inv.invoice_date || '').slice(0, 10),
      dueDate:       (inv.due_date || inv.terms_date || '').slice(0, 10),
      invoiceAmount: invAmt,
      amountPaid:    paid,
      unpaidAmount:  bal,
      ...bkts,
    };
  };

  const fetchAgingReport = async (bu: string, supplierNum: string, asAtDate: string) => {
    const asAt = asAtDate ? new Date(asAtDate) : new Date();
    asAt.setHours(0, 0, 0, 0);

    const p = new URLSearchParams();
    if (bu)          p.set('P_BUSINESS_UNIT', bu);
    if (supplierNum) p.set('supplier_number', supplierNum);
    const listUrl = `${APEX_DB_CONFIG.baseUrl}/suppliers${p.toString() ? '?' + p : ''}`;
    const invoicePattern = `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/invoices/{supplierNumber}?status=Unpaid`;
    setApiUrls([listUrl, invoicePattern]);

    const listRes = await fetch(listUrl);
    if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`);
    const listData = JSON.parse(await listRes.text() || '{}');
    const suppliers: any[] = Array.isArray(listData) ? listData : (listData.items || []);

    const results = await Promise.allSettled(
      suppliers.map(async (s: any) => {
        const sn    = s.supplier_number || '';
        const sName = s.supplier || sn;
        if (!sn) return null;
        const r = await fetch(`${APEX_DB_CONFIG.baseUrl}/suppliers/balance/invoices/${encodeURIComponent(sn)}?status=Unpaid&limit=1000`);
        if (!r.ok) return null;
        const d = JSON.parse(await r.text() || '{}');
        const invoices: any[] = Array.isArray(d) ? d : (d.items || d.invoices || []);

        const row: any = {
          key: sn, supplierNumber: sn, supplier: sName,
          invoiceAmount: 0, unpaidAmount: 0,
          months1: 0, months2: 0, months3: 0, over3months: 0, unallocated: 0,
          _invoices: [] as any[],
        };

        for (let i = 0; i < invoices.length; i++) {
          const inv     = invoices[i];
          const invDate = new Date(inv.invoice_date || inv.terms_date || '');
          if (isNaN(invDate.getTime())) continue;
          const invAmt = Number(inv.invoice_amount || 0);
          const paid   = Number(inv.amount_paid || 0);
          const bal    = Number(inv.amount_remaining ?? (invAmt - paid));
          if (bal <= 0) continue;
          const age  = Math.floor((asAt.getTime() - invDate.getTime()) / 86400000);
          const bkts = agingBuckets(age, bal);

          row.invoiceAmount += invAmt;
          row.unpaidAmount  += bal;
          row.months1       += bkts.months1;
          row.months2       += bkts.months2;
          row.months3       += bkts.months3;
          row.over3months   += bkts.over3months;
          row.unallocated   += bkts.unallocated;

          row._invoices.push({
            key:           `${sn}-${i}`,
            supplier:      sName,
            invoiceNumber: inv.invoice_number || inv.invoice_num || '',
            invoiceDate:   (inv.invoice_date || '').slice(0, 10),
            dueDate:       (inv.due_date || inv.terms_date || '').slice(0, 10),
            invoiceAmount: invAmt,
            amountPaid:    paid,
            unpaidAmount:  bal,
            ...bkts,
          });
        }
        return row.unpaidAmount > 0 ? row : null;
      })
    );

    return results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value)
      .sort((a, b) => b.unpaidAmount - a.unpaidAmount);
  };

  const fetchAgingByInvoice = async (bu: string, supplierNum: string, asAtDate: string) => {
    const asAt = asAtDate ? new Date(asAtDate) : new Date();
    asAt.setHours(0, 0, 0, 0);

    const p = new URLSearchParams();
    if (bu)          p.set('P_BUSINESS_UNIT', bu);
    if (supplierNum) p.set('supplier_number', supplierNum);
    const listUrl = `${APEX_DB_CONFIG.baseUrl}/suppliers${p.toString() ? '?' + p : ''}`;
    const invoicePattern = `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/invoices/{supplierNumber}?status=Unpaid`;
    setApiUrls([listUrl, invoicePattern]);

    const listRes = await fetch(listUrl);
    if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`);
    const listData = JSON.parse(await listRes.text() || '{}');
    const suppliers: any[] = Array.isArray(listData) ? listData : (listData.items || []);

    const results = await Promise.allSettled(
      suppliers.map(async (s: any) => {
        const sn = s.supplier_number || '';
        if (!sn) return [];
        const r = await fetch(`${APEX_DB_CONFIG.baseUrl}/suppliers/balance/invoices/${encodeURIComponent(sn)}?status=Unpaid&limit=1000`);
        if (!r.ok) return [];
        const d = JSON.parse(await r.text() || '{}');
        const invoices: any[] = Array.isArray(d) ? d : (d.items || d.invoices || []);
        return invoices
          .map((inv, i) => buildInvoiceAgingRow(inv, s.supplier || sn, asAt, i))
          .filter(Boolean);
      })
    );

    return results
      .flatMap((r): any[] => r.status === 'fulfilled' ? r.value : [])
      .sort((a, b) => b.unpaidAmount - a.unpaidAmount);
  };

  const handleRun = async () => {
    const { businessUnit: bu = '', supplierNumber: sn = '', supplierName: snm = '', dateFrom = '', dateTo = '', asAtDate = '' } = form.getFieldsValue();
    setLoading(true); setRows([]); setGridSearch('');
    reportTitle.current = `${report.label}${bu ? ' — ' + bu : ''}${asAtDate ? ' @ ' + asAtDate : ''}`;
    try {
      let result: any[] = [];
      if (report.key === 'suppliers-listing')  result = await fetchSuppliersListing(bu, sn, snm);
      if (report.key === 'supplier-balance')   result = await fetchSupplierBalance(bu, sn);
      if (report.key === 'payment-register')   result = await fetchPaymentRegister(bu, sn, dateFrom, dateTo);
      if (report.key === 'aging-report')       result = await fetchAgingReport(bu, sn, asAtDate);
      if (report.key === 'aging-by-invoice')   result = await fetchAgingByInvoice(bu, sn, asAtDate);
      setRows(result); setHasRun(true);
      result.length === 0 ? message.info('No data found.') : message.success(`${result.length} records loaded.`);
    } catch (e: any) {
      message.error(`Report failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const exportExcel = () => {
    const cols = COLUMNS[report.key];
    const exportRows = report.key === 'aging-report'
      ? rows.flatMap(r => r._invoices?.length
          ? r._invoices.map((inv: any) => ({ ...r, ...inv }))
          : [r])
      : rows;
    const ws = XLSX.utils.json_to_sheet(exportRows.map(r => {
      const obj: any = {};
      cols.forEach(c => { obj[c.title] = r[c.dataIndex as string] ?? ''; });
      return obj;
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, report.label.slice(0, 31));
    saveAs(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/octet-stream' }),
      `${report.key}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const cols = COLUMNS[report.key];
    doc.setFontSize(14); doc.setTextColor(30, 30, 30); doc.text(reportTitle.current, 14, 16);
    doc.setFontSize(9);  doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}   Records: ${rows.length}`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [cols.map(c => c.title)],
      body: rows.map(r => cols.map(c => { const v = r[c.dataIndex as string]; return typeof v === 'number' ? fmt(v) : (v ?? ''); })),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [199, 70, 52], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [247, 247, 247] },
    });
    doc.save(`${report.key}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const columns = COLUMNS[report.key];

  // Aging summary fields for both aging reports
  const AGING_FIELDS = ['invoiceAmount', 'unpaidAmount', 'months1', 'months2', 'months3', 'over3months', 'unallocated'] as const;

  // For aging-report: label spans Supplier+InvoiceAmount cols (indices 0-1), numbers start at index 2
  // For aging-by-invoice: label spans Supplier+Invoice#+InvoiceDate+DueDate cols (indices 0-3), numbers at 4
  const agingLabelSpan  = report.key === 'aging-by-invoice' ? 4 : 2;
  const agingStartIndex = agingLabelSpan;
  // AGING_FIELDS minus invoiceAmount when label spans it for aging-report (we still show it)
  // Fields rendered as number cells:
  // aging-report:      [invoiceAmount skipped in label span] → start from unpaidAmount onward
  // Actually we skip invoiceAmount from the number cells when the label already spans 2 cols
  // Simpler: for aging-report colSpan=2 means we drop the invoiceAmount cell and show it merged
  // → just keep all 7 fields but for aging-report merge Supplier+InvoiceAmount into the label cell
  //   and only render 6 number cells (unpaidAmount..unallocated)
  const agingNumberFields = report.key === 'aging-by-invoice'
    ? AGING_FIELDS
    : (['unpaidAmount', 'months1', 'months2', 'months3', 'over3months', 'unallocated'] as const);

  const agingSummary = () => {
    const totals = AGING_FIELDS.reduce((acc, f) => {
      acc[f] = filteredRows.reduce((s, r) => s + (r[f] || 0), 0);
      return acc;
    }, {} as Record<string, number>);
    const unpaid = totals.unpaidAmount || 1;
    const pct = (v: number) => unpaid > 0 ? ((v / unpaid) * 100).toFixed(2) + '%' : '0.00%';

    return (
      <Table.Summary>
        <Table.Summary.Row style={{ background: '#f0f5ff' }}>
          <Table.Summary.Cell index={0} colSpan={agingLabelSpan}>
            <Text strong style={{ whiteSpace: 'nowrap' }}>
              {report.key === 'aging-report'
                ? `Total for Report   ${fmt(totals.invoiceAmount)}`
                : 'Total for Report'}
            </Text>
          </Table.Summary.Cell>
          {agingNumberFields.map((f, i) => (
            <Table.Summary.Cell key={f} index={agingStartIndex + i} align="right">
              <Text strong style={{ color: f === 'unpaidAmount' ? REDWOOD.primary : undefined, whiteSpace: 'nowrap' }}>
                {fmt(totals[f])}
              </Text>
            </Table.Summary.Cell>
          ))}
        </Table.Summary.Row>
        <Table.Summary.Row style={{ background: '#fafafa' }}>
          <Table.Summary.Cell index={0} colSpan={agingLabelSpan}>
            <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>% of Unpaid</Text>
          </Table.Summary.Cell>
          {agingNumberFields.map((f, i) => (
            <Table.Summary.Cell key={f} index={agingStartIndex + i} align="right">
              <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                {f === 'invoiceAmount' ? '' : pct(totals[f])}
              </Text>
            </Table.Summary.Cell>
          ))}
        </Table.Summary.Row>
      </Table.Summary>
    );
  };

  return (
    <div style={{ padding: '16px 0' }}>
      <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 14 }}>{report.description}</Text>

      {/* Parameters */}
      <Card size="small" style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, marginBottom: 14 }}
        styles={{ body: { padding: '12px 16px' } }}>
        <Form form={form} layout="inline" size="small">
          <Form.Item label="Business Unit" name="businessUnit">
            <Select placeholder="All Business Units" allowClear showSearch style={{ width: 200 }}
              filterOption={(i, o) => String(o?.value ?? '').toLowerCase().includes(i.toLowerCase())}>
              {businessUnits.map(bu => <Option key={bu} value={bu}>{bu}</Option>)}
            </Select>
          </Form.Item>
          {report.hasSupplierFilter && (<>
            <Form.Item label="Supplier #" name="supplierNumber">
              <Input placeholder="Optional" style={{ width: 120 }} allowClear />
            </Form.Item>
            <Form.Item label="Supplier Name" name="supplierName">
              <Input placeholder="Optional" style={{ width: 150 }} allowClear />
            </Form.Item>
          </>)}
          {report.hasDateFilter && (<>
            <Form.Item label="Date From" name="dateFrom"><Input type="date" style={{ width: 140 }} /></Form.Item>
            <Form.Item label="Date To" name="dateTo"><Input type="date" style={{ width: 140 }} /></Form.Item>
          </>)}
          {report.hasAgingDate && (
            <Form.Item label={<span style={{ fontWeight: 600 }}>As at Date</span>} name="asAtDate"
              tooltip="Aging is calculated relative to this date. Defaults to today if left blank.">
              <Input type="date" style={{ width: 150 }} />
            </Form.Item>
          )}
        </Form>
      </Card>

      {/* Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <Space>
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleRun} loading={loading}
            style={{ background: report.color, borderColor: report.color }}>Run Report</Button>
          <Tooltip title="Export to Excel">
            <Button icon={<FileExcelOutlined />} onClick={exportExcel} disabled={rows.length === 0}>Excel</Button>
          </Tooltip>
          <Tooltip title="Export to PDF">
            <Button icon={<FilePdfOutlined />} onClick={exportPdf} disabled={rows.length === 0} danger>PDF</Button>
          </Tooltip>
          {apiUrls.length > 0 && (
            <Tooltip title="View API">
              <Button icon={<ApiOutlined />} size="small"
                style={{ color: REDWOOD.info, borderColor: REDWOOD.info }}
                onClick={() => setApiModalOpen(true)} />
            </Tooltip>
          )}
        </Space>
        {hasRun && (
          <Space>
            <Input
              prefix={<SearchOutlined style={{ color: REDWOOD.neutral600 }} />}
              placeholder="Search in results..."
              size="small"
              allowClear
              value={gridSearch}
              onChange={e => setGridSearch(e.target.value)}
              style={{ width: 220, borderRadius: 6 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {filteredRows.length}{filteredRows.length !== rows.length ? ` / ${rows.length}` : ''} record{rows.length !== 1 ? 's' : ''}
            </Text>
          </Space>
        )}
      </div>

      {/* Results */}
      <Spin spinning={loading}>
        {!hasRun ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<Text type="secondary">Set parameters and click Run Report</Text>}
            style={{ padding: '40px 0' }} />
        ) : report.key === 'aging-report' ? (
          <Table
            dataSource={filteredRows}
            columns={columns}
            rowKey="key"
            size="small"
            scroll={{ x: 'max-content', y: 400 }}
            pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `${t} suppliers` }}
            expandable={{
              expandedRowRender: (record: any) => (
                <div style={{ margin: '0 0 8px 32px' }}>
                  <Text strong style={{ fontSize: 12, color: REDWOOD.neutral600, display: 'block', marginBottom: 6 }}>
                    Invoices — {record.supplier}
                  </Text>
                  <Table
                    dataSource={record._invoices || []}
                    columns={AGING_DRILL_COLUMNS}
                    rowKey="key"
                    size="small"
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                    summary={() => {
                      const invs: any[] = record._invoices || [];
                      if (invs.length === 0) return null;
                      return (
                        <Table.Summary.Row style={{ background: '#f6ffed' }}>
                          <Table.Summary.Cell index={0} colSpan={3}><Text strong style={{ fontSize: 11 }}>Subtotal</Text></Table.Summary.Cell>
                          {(['invoiceAmount', 'amountPaid', 'unpaidAmount', 'months1', 'months2', 'months3', 'over3months', 'unallocated'] as const).map((f, i) => (
                            <Table.Summary.Cell key={f} index={3 + i} align="right">
                              <Text strong style={{ fontSize: 11 }}>{fmt(invs.reduce((s, r) => s + (r[f] || 0), 0))}</Text>
                            </Table.Summary.Cell>
                          ))}
                        </Table.Summary.Row>
                      );
                    }}
                  />
                </div>
              ),
              rowExpandable: (record: any) => (record._invoices || []).length > 0,
            }}
            summary={agingSummary}
          />
        ) : (
          <Table dataSource={filteredRows} columns={columns} rowKey="key" size="small"
            scroll={{ x: 'max-content', y: 440 }}
            pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `${t} records` }}
            summary={
              report.key === 'supplier-balance' ? () => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={2}><Text strong>Total</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right"><Text strong>{filteredRows.reduce((s, r) => s + (r.invoiceCount || 0), 0)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right"><Text strong>{fmt(filteredRows.reduce((s, r) => s + (r.invoiceAmount || 0), 0))}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right"><Text style={{ color: REDWOOD.success }}>{fmt(filteredRows.reduce((s, r) => s + (r.amountPaid || 0), 0))}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right"><Text strong style={{ color: REDWOOD.primary }}>{fmt(filteredRows.reduce((s, r) => s + (r.outstanding || 0), 0))}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={6} />
                </Table.Summary.Row>
              ) : report.key === 'aging-by-invoice' ? agingSummary
              : report.key === 'payment-register' ? () => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={3}><Text strong>Total</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right"><Text strong>{fmt(filteredRows.reduce((s, r) => s + (r.paymentAmount || 0), 0))}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={4} colSpan={4} />
                </Table.Summary.Row>
              ) : undefined
            }
          />
        )}
      </Spin>

      {/* API URL modal */}
      <Modal
        open={apiModalOpen}
        onCancel={() => setApiModalOpen(false)}
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} />API Endpoints — {report.label}</Space>}
        footer={<Button onClick={() => setApiModalOpen(false)}>Close</Button>}
        width={720}
      >
        {apiUrls.map((url, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            {apiUrls.length > 1 && (
              <Text style={{ fontSize: 11, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {i === 0 ? 'Step 1 — Supplier List' : `Step 2 — Invoices (per supplier)`}
              </Text>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <div style={{ flex: 1, background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 6, padding: '8px 12px', fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all', color: REDWOOD.neutral900 }}>
                {url}
              </div>
              <Tooltip title="Copy">
                <Button size="small" icon={<CopyOutlined />}
                  onClick={() => { navigator.clipboard.writeText(url); message.success('Copied'); }} />
              </Tooltip>
            </div>
            {url.includes('?') && (
              <div style={{ marginTop: 6, paddingLeft: 12 }}>
                {url.split('?')[1].split('&').map((p, j) => {
                  const [k, v] = p.split('=');
                  return (
                    <div key={j} style={{ fontSize: 11, color: REDWOOD.neutral600 }}>
                      <Text code style={{ fontSize: 11 }}>{decodeURIComponent(k)}</Text>
                      {' = '}
                      <Text style={{ fontSize: 11, color: REDWOOD.info }}>{decodeURIComponent(v || '')}</Text>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </Modal>
    </div>
  );
};

// ─── Tab entry ────────────────────────────────────────────────────────────────
interface TabEntry {
  tabKey: string;
  report: ReportDef;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const APReports: React.FC = () => {
  const [businessUnits, setBusinessUnits] = useState<string[]>([]);
  const [reportSearch, setReportSearch] = useState('');
  const [tabs, setTabs] = useState<TabEntry[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    fetch(`${APEX_DB_CONFIG.baseUrl}/gl/businessunits`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const items: any[] = Array.isArray(data) ? data : (data.items || []);
        setBusinessUnits(items.map((i: any) => i.business_unit_name || '').filter(Boolean));
      }).catch(() => {});
  }, []);

  const filteredReports = useMemo(() =>
    REPORTS.filter(r =>
      r.label.toLowerCase().includes(reportSearch.toLowerCase()) ||
      r.description.toLowerCase().includes(reportSearch.toLowerCase())
    ),
    [reportSearch]
  );

  const openReport = (report: ReportDef) => {
    const tabKey = `${report.key}-${Date.now()}`;
    const newTab: TabEntry = { tabKey, report };
    setTabs(prev => [...prev, newTab]);
    setActiveTab(tabKey);
  };

  const closeTab = (targetKey: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.tabKey !== targetKey);
      if (activeTab === targetKey && next.length > 0) {
        setActiveTab(next[next.length - 1].tabKey);
      } else if (next.length === 0) {
        setActiveTab('');
      }
      return next;
    });
  };

  const onTabEdit = (targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => {
    if (action === 'remove') closeTab(targetKey as string);
  };

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

        <div style={{ display: 'flex', height: 'calc(100vh - 113px)' }}>

          {/* ── Left panel: report list ── */}
          <div style={{
            width: sidebarCollapsed ? 44 : 260,
            flexShrink: 0, background: REDWOOD.surface,
            borderRight: `1px solid ${REDWOOD.neutral200}`,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            transition: 'width 0.2s ease',
          }}>
            {/* Header */}
            <div style={{
              padding: sidebarCollapsed ? '12px 6px' : '12px 14px 10px',
              borderBottom: `1px solid ${REDWOOD.neutral200}`,
              display: 'flex', alignItems: 'center',
              justifyContent: sidebarCollapsed ? 'center' : 'space-between',
              gap: 8, minHeight: 52,
            }}>
              {!sidebarCollapsed && (
                <Space align="center" size={8} style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                    background: `linear-gradient(135deg, ${REDWOOD.reportGreen} 0%, #0D5C36 100%)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <BarChartOutlined style={{ fontSize: 14, color: '#fff' }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <Text strong style={{ fontSize: 13, display: 'block', lineHeight: 1.2 }}>Reports</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>Payables Module</Text>
                  </div>
                </Space>
              )}
              <Tooltip title={sidebarCollapsed ? 'Expand panel' : 'Collapse panel'} placement="right">
                <Button
                  type="text" size="small"
                  icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                  onClick={() => setSidebarCollapsed(v => !v)}
                  style={{ color: REDWOOD.neutral600, flexShrink: 0 }}
                />
              </Tooltip>
            </div>

            {!sidebarCollapsed && (
              <>
                {/* Search */}
                <div style={{ padding: '8px 10px 4px' }}>
                  <Input
                    prefix={<SearchOutlined style={{ color: REDWOOD.neutral600 }} />}
                    placeholder="Search reports..."
                    size="small"
                    allowClear
                    value={reportSearch}
                    onChange={e => setReportSearch(e.target.value)}
                    style={{ borderRadius: 6 }}
                  />
                </div>

                {/* Report list */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
                  {filteredReports.length === 0 ? (
                    <Text type="secondary" style={{ fontSize: 12, padding: '12px 6px', display: 'block' }}>
                      No reports match your search.
                    </Text>
                  ) : filteredReports.map(r => (
                    <div
                      key={r.key}
                      onClick={() => openReport(r)}
                      style={{
                        padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                        marginBottom: 4, transition: 'all 0.15s',
                        border: `1px solid transparent`,
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLDivElement).style.background = `${r.color}10`;
                        (e.currentTarget as HTMLDivElement).style.borderColor = `${r.color}30`;
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                        (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent';
                      }}
                    >
                      <Space align="start" size={10}>
                        <div style={{
                          width: 30, height: 30, borderRadius: 6, flexShrink: 0,
                          background: `${r.color}18`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: r.color, fontSize: 14,
                        }}>
                          {r.icon}
                        </div>
                        <div>
                          <Text strong style={{ fontSize: 12, color: REDWOOD.neutral900, display: 'block', lineHeight: 1.3 }}>
                            {r.label}
                          </Text>
                          <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.3 }}>{r.description}</Text>
                        </div>
                      </Space>
                    </div>
                  ))}
                </div>

                <div style={{ padding: '10px 14px', borderTop: `1px solid ${REDWOOD.neutral200}` }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Click a report to open it in a new tab
                  </Text>
                </div>
              </>
            )}

            {/* Collapsed: icon-only list */}
            {sidebarCollapsed && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                {REPORTS.map(r => (
                  <Tooltip key={r.key} title={r.label} placement="right">
                    <div
                      onClick={() => openReport(r)}
                      style={{
                        width: 32, height: 32, borderRadius: 7, cursor: 'pointer',
                        background: `${r.color}18`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: r.color, fontSize: 15, transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = `${r.color}35`; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = `${r.color}18`; }}
                    >
                      {r.icon}
                    </div>
                  </Tooltip>
                ))}
              </div>
            )}
          </div>

          {/* ── Right panel: tabs ── */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {tabs.length === 0 ? (
              /* Empty state */
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 16,
                  background: `${REDWOOD.reportGreen}12`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <BarChartOutlined style={{ fontSize: 32, color: REDWOOD.reportGreen }} />
                </div>
                <Title level={4} style={{ margin: 0, color: REDWOOD.neutral600 }}>No reports open</Title>
                <Text type="secondary">Select a report from the left panel to open it here</Text>
              </div>
            ) : (
              <Tabs
                type="editable-card"
                hideAdd
                activeKey={activeTab}
                onChange={setActiveTab}
                onEdit={onTabEdit}
                style={{ height: '100%' }}
                tabBarStyle={{ padding: '0 16px', margin: 0, background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}
                items={tabs.map(({ tabKey, report }) => ({
                  key: tabKey,
                  closable: true,
                  label: (
                    <Space size={6}>
                      <span style={{ color: report.color, fontSize: 13 }}>{report.icon}</span>
                      <span style={{ fontSize: 13 }}>{report.label}</span>
                    </Space>
                  ),
                  children: (
                    <div style={{ padding: '0 24px 24px', overflowY: 'auto', height: 'calc(100vh - 165px)' }}>
                      <ReportPanel report={report} businessUnits={businessUnits} />
                    </div>
                  ),
                }))}
              />
            )}
          </div>
        </div>
      </Content>
    </Layout>
  );
};

export default APReports;
