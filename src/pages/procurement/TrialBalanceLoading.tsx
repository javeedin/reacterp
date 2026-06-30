import React, { useState, useRef, useCallback } from 'react';
import {
  Layout, Breadcrumb, Typography, Card, Table, Button, Input, Select,
  Space, Tag, Statistic, Row, Col, Empty, Tooltip, Alert,
} from 'antd';
import {
  HomeOutlined, UploadOutlined, ClearOutlined, DownloadOutlined,
  FilterOutlined, FileExcelOutlined, TableOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';

const { Content } = Layout;
const { Title, Text } = Typography;

const REDWOOD = {
  primary: '#C74634', primaryLight: '#E85D4A',
  success: '#1D7B4D', warning: '#D4A800', info: '#0572CE',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral600: '#6B6B6B',
  neutral900: '#1A1A1A', surface: '#FFFFFF',
};

type TBRow = Record<string, string | number | null>;

const fmt = (v: number) =>
  v.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TrialBalanceLoading: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows]           = useState<TBRow[]>([]);
  const [columns, setColumns]     = useState<string[]>([]);
  const [fileName, setFileName]   = useState<string>('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string>('');

  // Filter state — one free-text per detected column
  const [filters, setFilters]     = useState<Record<string, string>>({});
  const [globalSearch, setGlobalSearch] = useState('');

  // ── Load Excel ──────────────────────────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    setLoading(true);
    setError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data  = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb    = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json  = XLSX.utils.sheet_to_json<TBRow>(sheet, { defval: null });
        if (json.length === 0) { setError('No data found in the spreadsheet.'); setLoading(false); return; }
        const cols = Object.keys(json[0]);
        setColumns(cols);
        setRows(json);
        setFilters({});
        setGlobalSearch('');
        setFileName(file.name);
      } catch {
        setError('Failed to read the file. Make sure it is a valid Excel (.xlsx / .xls) file.');
      }
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // ── Filtered rows ────────────────────────────────────────────────────────────
  const filteredRows = rows.filter(row => {
    // Global search across all columns
    if (globalSearch) {
      const q = globalSearch.toLowerCase();
      const match = columns.some(c => String(row[c] ?? '').toLowerCase().includes(q));
      if (!match) return false;
    }
    // Per-column filters
    for (const [col, val] of Object.entries(filters)) {
      if (!val) continue;
      if (!String(row[col] ?? '').toLowerCase().includes(val.toLowerCase())) return false;
    }
    return true;
  });

  // ── Numeric summary columns ──────────────────────────────────────────────────
  const numericCols = columns.filter(c => filteredRows.some(r => typeof r[c] === 'number'));

  const totals: Record<string, number> = {};
  numericCols.forEach(c => {
    totals[c] = filteredRows.reduce((s, r) => s + (typeof r[c] === 'number' ? (r[c] as number) : 0), 0);
  });

  // ── Unique values for filter dropdowns (non-numeric cols, ≤ 100 distinct) ──
  const categoricalCols = columns.filter(c =>
    !numericCols.includes(c) &&
    new Set(rows.map(r => String(r[c] ?? ''))).size <= 100
  );

  // ── Table columns ────────────────────────────────────────────────────────────
  const tableColumns = columns.map(col => {
    const isNum = numericCols.includes(col);
    return {
      title: col,
      dataIndex: col,
      key: col,
      width: isNum ? 130 : 160,
      ellipsis: true,
      align: (isNum ? 'right' : 'left') as 'right' | 'left',
      render: (v: string | number | null) => {
        if (v === null || v === '') return <Text type="secondary">—</Text>;
        if (isNum) return (
          <Text style={{ fontFamily: 'monospace', fontSize: 11, color: (v as number) < 0 ? REDWOOD.primary : REDWOOD.neutral900 }}>
            {fmt(v as number)}
          </Text>
        );
        return <Text style={{ fontSize: 11 }}>{String(v)}</Text>;
      },
    };
  });

  // Summary row
  const summaryRow = numericCols.length > 0 ? () => (
    <Table.Summary fixed>
      <Table.Summary.Row style={{ background: '#1e293b' }}>
        {columns.map((col, i) => (
          <Table.Summary.Cell index={i} key={col} align={numericCols.includes(col) ? 'right' : 'left'}>
            {i === 0
              ? <Text strong style={{ fontSize: 11, color: '#f1f5f9' }}>Total</Text>
              : numericCols.includes(col)
                ? <Text strong style={{ fontSize: 11, fontFamily: 'monospace', color: '#f1f5f9' }}>{fmt(totals[col] ?? 0)}</Text>
                : null}
          </Table.Summary.Cell>
        ))}
      </Table.Summary.Row>
    </Table.Summary>
  ) : undefined;

  // ── Export filtered data ──────────────────────────────────────────────────────
  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(filteredRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Trial Balance');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `TB_Filtered_${fileName || 'export'}`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout style={{ minHeight: '100vh', background: REDWOOD.neutral100 }}>
      <Content style={{ padding: '16px 24px' }}>
        {/* Breadcrumb */}
        <Breadcrumb style={{ marginBottom: 12 }} items={[
          { title: <Link to="/"><HomeOutlined /></Link> },
          { title: <Link to="/procurement">Purchasing</Link> },
          { title: 'Trial Balance Loading' },
        ]} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0, color: REDWOOD.neutral900 }}>
            <TableOutlined style={{ color: REDWOOD.info, marginRight: 8 }} />
            Trial Balance Loading
          </Title>
          {rows.length > 0 && (
            <Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                <FileExcelOutlined style={{ color: REDWOOD.success, marginRight: 4 }} />
                {fileName}
              </Text>
              <Button size="small" icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>
                Load Another
              </Button>
              <Button size="small" icon={<DownloadOutlined />} onClick={handleExport}>
                Export Filtered
              </Button>
              <Button size="small" icon={<ClearOutlined />} danger onClick={() => { setRows([]); setColumns([]); setFileName(''); setFilters({}); setGlobalSearch(''); }}>
                Clear
              </Button>
            </Space>
          )}
        </div>

        {error && <Alert type="error" message={error} showIcon closable onClose={() => setError('')} style={{ marginBottom: 12 }} />}

        {/* Drop zone — shown only when no data loaded */}
        {rows.length === 0 && (
          <Card
            style={{ borderRadius: 12, borderStyle: 'dashed', borderWidth: 2, borderColor: REDWOOD.neutral300, cursor: 'pointer' }}
            bodyStyle={{ padding: 48, textAlign: 'center' }}
            onClick={() => fileInputRef.current?.click()}
            onDrop={onDrop}
            onDragOver={e => e.preventDefault()}
          >
            <FileExcelOutlined style={{ fontSize: 48, color: REDWOOD.success, display: 'block', marginBottom: 16 }} />
            <Title level={5} style={{ color: REDWOOD.neutral600 }}>
              Click or drag &amp; drop an Excel file to load Trial Balance
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Supports .xlsx and .xls — first sheet will be loaded
            </Text>
          </Card>
        )}

        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={onInputChange} />

        {/* Stats + filters — shown once data is loaded */}
        {rows.length > 0 && (
          <>
            {/* Summary stats */}
            <Row gutter={12} style={{ marginBottom: 12 }}>
              <Col>
                <Card size="small" style={{ borderRadius: 8, minWidth: 120 }}>
                  <Statistic title="Total Rows" value={rows.length} valueStyle={{ fontSize: 18, color: REDWOOD.info }} />
                </Card>
              </Col>
              <Col>
                <Card size="small" style={{ borderRadius: 8, minWidth: 120 }}>
                  <Statistic title="Filtered" value={filteredRows.length} valueStyle={{ fontSize: 18, color: REDWOOD.success }} />
                </Card>
              </Col>
              <Col>
                <Card size="small" style={{ borderRadius: 8, minWidth: 120 }}>
                  <Statistic title="Columns" value={columns.length} valueStyle={{ fontSize: 18, color: REDWOOD.neutral600 }} />
                </Card>
              </Col>
              {numericCols.slice(0, 3).map(col => (
                <Col key={col}>
                  <Card size="small" style={{ borderRadius: 8, minWidth: 140 }}>
                    <Statistic
                      title={col}
                      value={fmt(totals[col] ?? 0)}
                      valueStyle={{ fontSize: 14, fontFamily: 'monospace', color: (totals[col] ?? 0) < 0 ? REDWOOD.primary : REDWOOD.success }}
                    />
                  </Card>
                </Col>
              ))}
            </Row>

            {/* Filters */}
            <Card size="small" style={{ borderRadius: 8, marginBottom: 12 }}
              title={<Space><FilterOutlined style={{ color: REDWOOD.info }} /><Text strong style={{ fontSize: 12 }}>Filters</Text></Space>}
              extra={
                <Button size="small" icon={<ClearOutlined />} onClick={() => { setFilters({}); setGlobalSearch(''); }}>
                  Clear All
                </Button>
              }
            >
              <Row gutter={[8, 8]} align="middle">
                <Col xs={24} sm={8} md={6}>
                  <Input
                    placeholder="Global search…"
                    prefix={<FilterOutlined style={{ color: REDWOOD.neutral600 }} />}
                    size="small"
                    value={globalSearch}
                    onChange={e => setGlobalSearch(e.target.value)}
                    allowClear
                    style={{ fontSize: 12 }}
                  />
                </Col>
                {categoricalCols.map(col => {
                  const options = Array.from(new Set(rows.map(r => String(r[col] ?? '')))).sort();
                  return (
                    <Col key={col} xs={12} sm={8} md={4}>
                      <Select
                        placeholder={col}
                        size="small"
                        allowClear
                        showSearch
                        style={{ width: '100%', fontSize: 12 }}
                        value={filters[col] || undefined}
                        onChange={v => setFilters(f => ({ ...f, [col]: v ?? '' }))}
                        options={options.map(o => ({ value: o, label: o || '(blank)' }))}
                      />
                    </Col>
                  );
                })}
                {numericCols.map(col => (
                  <Col key={col} xs={12} sm={8} md={4}>
                    <Tooltip title={`Filter ${col} (contains)`}>
                      <Input
                        placeholder={col}
                        size="small"
                        allowClear
                        style={{ fontSize: 12 }}
                        value={filters[col] || ''}
                        onChange={e => setFilters(f => ({ ...f, [col]: e.target.value }))}
                      />
                    </Tooltip>
                  </Col>
                ))}
              </Row>
            </Card>

            {/* Data grid */}
            <Card size="small" style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
              <div style={{ padding: '6px 12px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>
                  Showing <strong>{filteredRows.length}</strong> of <strong>{rows.length}</strong> rows
                </Text>
                {Object.values(filters).some(Boolean) || globalSearch
                  ? <Tag color="blue" style={{ fontSize: 10 }}>Filters active</Tag>
                  : null}
              </div>
              <Table
                className="compact-table"
                size="small"
                dataSource={filteredRows.map((r, i) => ({ ...r, __key: i }))}
                rowKey="__key"
                columns={tableColumns as any}
                pagination={{ pageSize: 100, showSizeChanger: true, pageSizeOptions: ['50', '100', '200', '500'], showTotal: (t, r) => `${r[0]}–${r[1]} of ${t}` }}
                scroll={{ x: columns.length * 150, y: 'calc(100vh - 460px)' }}
                loading={loading}
                summary={summaryRow}
                locale={{ emptyText: <Empty description="No rows match the current filters" /> }}
              />
            </Card>
          </>
        )}
      </Content>
    </Layout>
  );
};

export default TrialBalanceLoading;
