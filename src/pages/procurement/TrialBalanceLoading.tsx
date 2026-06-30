import React, { useState, useRef, useCallback } from 'react';
import {
  Layout, Breadcrumb, Typography, Card, Table, Button, Input, Select,
  Space, Tag, Statistic, Row, Col, Empty, Tooltip, Alert, Modal,
  Divider, Badge, Progress, Spin,
} from 'antd';
import {
  HomeOutlined, UploadOutlined, ClearOutlined, DownloadOutlined,
  FilterOutlined, FileExcelOutlined, TableOutlined, SafetyCertificateOutlined,
  CheckCircleOutlined, CloseCircleOutlined, PlusOutlined, DeleteOutlined,
  SyncOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';

const { Content } = Layout;
const { Title, Text } = Typography;

const REDWOOD = {
  primary: '#C74634', primaryLight: '#E85D4A',
  success: '#1D7B4D', warning: '#D4A800', info: '#0572CE',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral300: '#C7C7C7',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
};

// ── COA segments from UATDiagnostics ──────────────────────────────────────────
const COA_BASE = 'https://iacney-test.fa.ocs.oraclecloud.com/fscmRestApi/resources/11.13.18.05/valueSets';
const HDRS = { 'Content-Type': 'application/json', Accept: 'application/json' };

const COA_SEGMENTS = [
  { key: 'coa-company',          label: 'Company',          valueSet: 'Company_VS'          },
  { key: 'coa-main-account',     label: 'Main Account',     valueSet: 'Main Account VS'     },
  { key: 'coa-sub-account',      label: 'Sub Account',      valueSet: 'Sub Account VS'      },
  { key: 'coa-division',         label: 'Division',         valueSet: 'Division VS'         },
  { key: 'coa-department',       label: 'Department',       valueSet: 'Department VS'       },
  { key: 'coa-lob',              label: 'LOB',              valueSet: 'LOB'                 },
  { key: 'coa-activity-type',    label: 'Activity Type',    valueSet: 'Activity Type VS'    },
  { key: 'coa-analysis-details', label: 'Analysis Details', valueSet: 'Analysis Details VS' },
  { key: 'coa-analysis-type',    label: 'Analysis Type',    valueSet: 'Analysis Type VS'    },
  { key: 'coa-ic',               label: 'IC',               valueSet: 'IC VS'               },
  { key: 'coa-emp',              label: 'Emp',              valueSet: 'Emp VS'              },
  { key: 'coa-future-1',         label: 'Future 1',         valueSet: 'Future 1'            },
  { key: 'coa-future-2',         label: 'Future 2',         valueSet: 'Future 2'            },
  { key: 'coa-future-3',         label: 'Future 3',         valueSet: 'Future 3'            },
];

const coaValuesUrl = (valueSet: string) =>
  `${COA_BASE}/${encodeURIComponent(valueSet)}/child/values?limit=500&offset=0`;

type TBRow = Record<string, string | number | null>;

interface SegmentMapping {
  id: string;
  excelColumn: string;   // column name from uploaded Excel
  coaSegmentKey: string; // key from COA_SEGMENTS
}

interface ValidationResult {
  coaSegmentKey: string;
  excelColumn: string;
  coaLabel: string;
  totalValues: number;
  validCount: number;
  invalidValues: { value: string; count: number }[];
  loading: boolean;
  error: string;
}

const fmt = (v: number) =>
  v.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TrialBalanceLoading: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows]       = useState<TBRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string>('');

  // Filters
  const [filters, setFilters]         = useState<Record<string, string>>({});
  const [globalSearch, setGlobalSearch] = useState('');

  // Segment validation
  const [validateModal, setValidateModal] = useState(false);
  const [mappings, setMappings] = useState<SegmentMapping[]>([]);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [validating, setValidating] = useState(false);
  const [validated, setValidated]   = useState(false);

  // ── Load Excel ──────────────────────────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    setLoading(true); setError('');
    setValidationResults([]); setValidated(false); setMappings([]);
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

        // Auto-map: match Excel column names to COA segments by keyword
        const autoMaps: SegmentMapping[] = [];
        cols.forEach(col => {
          const cl = col.toLowerCase().replace(/[_\s-]/g, '');
          const match = COA_SEGMENTS.find(s => {
            const sl = s.label.toLowerCase().replace(/[_\s-]/g, '');
            const vl = s.valueSet.toLowerCase().replace(/[_\s-]/g, '');
            return cl.includes(sl) || sl.includes(cl) || cl.includes(vl) || vl.includes(cl);
          });
          if (match) {
            autoMaps.push({ id: `${col}-${match.key}`, excelColumn: col, coaSegmentKey: match.key });
          }
        });
        setMappings(autoMaps);
      } catch {
        setError('Failed to read the file. Make sure it is a valid Excel (.xlsx / .xls) file.');
      }
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) handleFile(file); e.target.value = '';
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file) handleFile(file);
  };

  // ── Filtered rows ────────────────────────────────────────────────────────────
  const filteredRows = rows.filter(row => {
    if (globalSearch) {
      const q = globalSearch.toLowerCase();
      if (!columns.some(c => String(row[c] ?? '').toLowerCase().includes(q))) return false;
    }
    for (const [col, val] of Object.entries(filters)) {
      if (!val) continue;
      if (!String(row[col] ?? '').toLowerCase().includes(val.toLowerCase())) return false;
    }
    // Highlight invalid rows if validation ran
    if (validated && validationInvalidRowSet.size > 0) {
      // filter toggle handled separately via tag
    }
    return true;
  });

  const numericCols = columns.filter(c => filteredRows.some(r => typeof r[c] === 'number'));
  const totals: Record<string, number> = {};
  numericCols.forEach(c => {
    totals[c] = filteredRows.reduce((s, r) => s + (typeof r[c] === 'number' ? (r[c] as number) : 0), 0);
  });
  const categoricalCols = columns.filter(c =>
    !numericCols.includes(c) && new Set(rows.map(r => String(r[c] ?? ''))).size <= 100
  );

  // ── Build invalid row set for highlighting ─────────────────────────────────
  const validationInvalidRowSet = new Set<number>();
  if (validated) {
    validationResults.forEach(vr => {
      if (vr.invalidValues.length === 0) return;
      const badVals = new Set(vr.invalidValues.map(iv => iv.value));
      rows.forEach((row, idx) => {
        if (badVals.has(String(row[vr.excelColumn] ?? '').trim())) {
          validationInvalidRowSet.add(idx);
        }
      });
    });
  }

  // ── Fetch COA values and validate ──────────────────────────────────────────
  const runValidation = async () => {
    if (mappings.length === 0) { return; }
    setValidating(true); setValidated(false);

    const results: ValidationResult[] = await Promise.all(
      mappings.map(async (m) => {
        const seg = COA_SEGMENTS.find(s => s.key === m.coaSegmentKey)!;
        const result: ValidationResult = {
          coaSegmentKey: m.coaSegmentKey,
          excelColumn: m.excelColumn,
          coaLabel: seg.label,
          totalValues: 0,
          validCount: 0,
          invalidValues: [],
          loading: false,
          error: '',
        };
        try {
          // Fetch all COA values (paginate)
          const validSet = new Set<string>();
          let next: string | null = coaValuesUrl(seg.valueSet);
          while (next) {
            const r = await fetch(next, { headers: HDRS });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = await r.json();
            (d.items || []).forEach((i: any) => {
              const v = String(i.Value ?? '').trim();
              if (v) validSet.add(v);
            });
            const nl = (d.links || []).find((l: any) => l.rel === 'next');
            next = nl?.href ?? null;
          }

          // Count unique values in Excel column
          const valueCounts: Record<string, number> = {};
          rows.forEach(row => {
            const v = String(row[m.excelColumn] ?? '').trim();
            if (v) valueCounts[v] = (valueCounts[v] ?? 0) + 1;
          });

          const uniqueVals = Object.keys(valueCounts);
          result.totalValues = uniqueVals.length;
          result.validCount  = uniqueVals.filter(v => validSet.has(v)).length;
          result.invalidValues = uniqueVals
            .filter(v => !validSet.has(v))
            .map(v => ({ value: v, count: valueCounts[v] }))
            .sort((a, b) => b.count - a.count);
        } catch (e: any) {
          result.error = e.message;
        }
        return result;
      })
    );

    setValidationResults(results);
    setValidating(false);
    setValidated(true);
  };

  // ── Mapping helpers ──────────────────────────────────────────────────────────
  const addMapping = () => {
    setMappings(m => [...m, { id: `map-${Date.now()}`, excelColumn: '', coaSegmentKey: '' }]);
  };
  const removeMapping = (id: string) => setMappings(m => m.filter(x => x.id !== id));
  const updateMapping = (id: string, patch: Partial<SegmentMapping>) =>
    setMappings(m => m.map(x => x.id === id ? { ...x, ...patch } : x));

  // ── Table columns ────────────────────────────────────────────────────────────
  const tableColumns = columns.map(col => {
    const isNum = numericCols.includes(col);
    const validationResult = validated ? validationResults.find(vr => vr.excelColumn === col) : undefined;
    const invalidValsInCol = new Set(validationResult?.invalidValues.map(iv => iv.value) ?? []);

    return {
      title: (
        <Space size={4}>
          <span>{col}</span>
          {validationResult && (
            validationResult.error
              ? <Tooltip title={validationResult.error}><CloseCircleOutlined style={{ color: REDWOOD.primary }} /></Tooltip>
              : validationResult.invalidValues.length === 0
                ? <Tooltip title="All values valid"><CheckCircleOutlined style={{ color: REDWOOD.success }} /></Tooltip>
                : <Tooltip title={`${validationResult.invalidValues.length} invalid values`}><CloseCircleOutlined style={{ color: REDWOOD.primary }} /></Tooltip>
          )}
        </Space>
      ),
      dataIndex: col,
      key: col,
      width: isNum ? 140 : 160,
      ellipsis: true,
      align: (isNum ? 'right' : 'left') as 'right' | 'left',
      render: (v: string | number | null, _: any, idx: number) => {
        if (v === null || v === '') return <Text type="secondary">—</Text>;
        if (isNum) return (
          <Text style={{ fontFamily: 'monospace', fontSize: 11, color: (v as number) < 0 ? REDWOOD.primary : REDWOOD.neutral900 }}>
            {fmt(v as number)}
          </Text>
        );
        const strV = String(v).trim();
        if (invalidValsInCol.has(strV)) {
          return (
            <Tooltip title={`"${strV}" not found in ${validationResult?.coaLabel} COA`}>
              <Tag color="red" style={{ fontSize: 10, cursor: 'default' }}>{strV}</Tag>
            </Tooltip>
          );
        }
        if (validationResult && validationResult.invalidValues.length === 0 && !validationResult.error) {
          return <Text style={{ fontSize: 11, color: REDWOOD.success }}>{strV}</Text>;
        }
        return <Text style={{ fontSize: 11 }}>{strV}</Text>;
      },
    };
  });

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

  const totalInvalid = validationResults.reduce((s, r) => s + r.invalidValues.length, 0);
  const totalValid   = validationResults.reduce((s, r) => s + r.validCount, 0);

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
                <FileExcelOutlined style={{ color: REDWOOD.success, marginRight: 4 }} />{fileName}
              </Text>
              <Button size="small" icon={<SafetyCertificateOutlined />}
                style={{ borderColor: REDWOOD.info, color: REDWOOD.info }}
                onClick={() => setValidateModal(true)}>
                Validate Segments
              </Button>
              <Button size="small" icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>
                Load Another
              </Button>
              <Button size="small" icon={<DownloadOutlined />} onClick={handleExport}>Export Filtered</Button>
              <Button size="small" icon={<ClearOutlined />} danger
                onClick={() => { setRows([]); setColumns([]); setFileName(''); setFilters({}); setGlobalSearch(''); setValidationResults([]); setValidated(false); }}>
                Clear
              </Button>
            </Space>
          )}
        </div>

        {error && <Alert type="error" message={error} showIcon closable onClose={() => setError('')} style={{ marginBottom: 12 }} />}

        {/* Validation summary banner */}
        {validated && (
          <Alert
            style={{ marginBottom: 12 }}
            type={totalInvalid === 0 ? 'success' : 'warning'}
            showIcon
            message={
              <Space>
                <Text strong style={{ fontSize: 12 }}>
                  Segment Validation: {validationResults.length} segment{validationResults.length !== 1 ? 's' : ''} checked
                </Text>
                <Tag color="green">{totalValid} valid unique values</Tag>
                {totalInvalid > 0 && <Tag color="red">{totalInvalid} invalid unique values</Tag>}
                {totalInvalid > 0 && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    — invalid cells highlighted in red in the grid
                  </Text>
                )}
              </Space>
            }
          />
        )}

        {/* Drop zone */}
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
            <Text type="secondary" style={{ fontSize: 12 }}>Supports .xlsx and .xls — first sheet will be loaded</Text>
          </Card>
        )}

        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={onInputChange} />

        {rows.length > 0 && (
          <>
            {/* Stats */}
            <Row gutter={12} style={{ marginBottom: 12 }}>
              <Col><Card size="small" style={{ borderRadius: 8, minWidth: 120 }}>
                <Statistic title="Total Rows" value={rows.length} valueStyle={{ fontSize: 18, color: REDWOOD.info }} />
              </Card></Col>
              <Col><Card size="small" style={{ borderRadius: 8, minWidth: 120 }}>
                <Statistic title="Filtered" value={filteredRows.length} valueStyle={{ fontSize: 18, color: REDWOOD.success }} />
              </Card></Col>
              <Col><Card size="small" style={{ borderRadius: 8, minWidth: 120 }}>
                <Statistic title="Columns" value={columns.length} valueStyle={{ fontSize: 18, color: REDWOOD.neutral600 }} />
              </Card></Col>
              {validated && (
                <Col><Card size="small" style={{ borderRadius: 8, minWidth: 140 }}>
                  <Statistic title="Invalid Rows" value={validationInvalidRowSet.size}
                    valueStyle={{ fontSize: 18, color: validationInvalidRowSet.size === 0 ? REDWOOD.success : REDWOOD.primary }} />
                </Card></Col>
              )}
              {numericCols.slice(0, 3).map(col => (
                <Col key={col}><Card size="small" style={{ borderRadius: 8, minWidth: 140 }}>
                  <Statistic title={col} value={fmt(totals[col] ?? 0)}
                    valueStyle={{ fontSize: 14, fontFamily: 'monospace', color: (totals[col] ?? 0) < 0 ? REDWOOD.primary : REDWOOD.success }} />
                </Card></Col>
              ))}
            </Row>

            {/* Validation results per segment */}
            {validated && validationResults.length > 0 && (
              <Card size="small" style={{ borderRadius: 8, marginBottom: 12 }}
                title={<Space><SafetyCertificateOutlined style={{ color: REDWOOD.info }} /><Text strong style={{ fontSize: 12 }}>Validation Results by Segment</Text></Space>}
              >
                <Row gutter={[8, 8]}>
                  {validationResults.map(vr => (
                    <Col key={vr.coaSegmentKey} xs={24} sm={12} md={8} lg={6}>
                      <Card size="small" style={{ borderRadius: 6, border: `1px solid ${vr.error ? REDWOOD.warning : vr.invalidValues.length > 0 ? REDWOOD.primary : REDWOOD.success}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <Text strong style={{ fontSize: 11 }}>{vr.excelColumn}</Text>
                          <Tag style={{ fontSize: 10, margin: 0 }}>{vr.coaLabel}</Tag>
                        </div>
                        {vr.error
                          ? <Alert type="warning" message={vr.error} style={{ fontSize: 10, padding: '2px 6px' }} />
                          : <>
                            <Progress
                              percent={vr.totalValues === 0 ? 100 : Math.round((vr.validCount / vr.totalValues) * 100)}
                              size="small"
                              status={vr.invalidValues.length > 0 ? 'exception' : 'success'}
                              style={{ marginBottom: 4 }}
                            />
                            <Space size={4}>
                              <Tag color="green" style={{ fontSize: 10, margin: 0 }}>{vr.validCount} valid</Tag>
                              {vr.invalidValues.length > 0 && (
                                <Tooltip title={
                                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                    {vr.invalidValues.map(iv => (
                                      <div key={iv.value} style={{ fontFamily: 'monospace', fontSize: 11 }}>
                                        <Tag color="red" style={{ fontSize: 10 }}>{iv.value}</Tag> × {iv.count} rows
                                      </div>
                                    ))}
                                  </div>
                                } placement="bottomLeft">
                                  <Tag color="red" style={{ fontSize: 10, margin: 0, cursor: 'pointer' }}>
                                    {vr.invalidValues.length} invalid <InfoCircleOutlined />
                                  </Tag>
                                </Tooltip>
                              )}
                            </Space>
                          </>
                        }
                      </Card>
                    </Col>
                  ))}
                </Row>
              </Card>
            )}

            {/* Filters */}
            <Card size="small" style={{ borderRadius: 8, marginBottom: 12 }}
              title={<Space><FilterOutlined style={{ color: REDWOOD.info }} /><Text strong style={{ fontSize: 12 }}>Filters</Text></Space>}
              extra={<Button size="small" icon={<ClearOutlined />} onClick={() => { setFilters({}); setGlobalSearch(''); }}>Clear All</Button>}
            >
              <Row gutter={[8, 8]} align="middle">
                <Col xs={24} sm={8} md={6}>
                  <Input placeholder="Global search…" prefix={<FilterOutlined style={{ color: REDWOOD.neutral600 }} />}
                    size="small" value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} allowClear style={{ fontSize: 12 }} />
                </Col>
                {categoricalCols.map(col => {
                  const options = Array.from(new Set(rows.map(r => String(r[col] ?? '')))).sort();
                  return (
                    <Col key={col} xs={12} sm={8} md={4}>
                      <Select placeholder={col} size="small" allowClear showSearch style={{ width: '100%', fontSize: 12 }}
                        value={filters[col] || undefined}
                        onChange={v => setFilters(f => ({ ...f, [col]: v ?? '' }))}
                        options={options.map(o => ({ value: o, label: o || '(blank)' }))} />
                    </Col>
                  );
                })}
                {numericCols.map(col => (
                  <Col key={col} xs={12} sm={8} md={4}>
                    <Input placeholder={col} size="small" allowClear style={{ fontSize: 12 }}
                      value={filters[col] || ''} onChange={e => setFilters(f => ({ ...f, [col]: e.target.value }))} />
                  </Col>
                ))}
              </Row>
            </Card>

            {/* Grid */}
            <Card size="small" style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
              <div style={{ padding: '6px 12px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>
                  Showing <strong>{filteredRows.length}</strong> of <strong>{rows.length}</strong> rows
                  {validated && validationInvalidRowSet.size > 0 && (
                    <Tag color="red" style={{ marginLeft: 8, fontSize: 10 }}>{validationInvalidRowSet.size} rows have invalid segment values</Tag>
                  )}
                </Text>
                {(Object.values(filters).some(Boolean) || globalSearch) && <Tag color="blue" style={{ fontSize: 10 }}>Filters active</Tag>}
              </div>
              <Table
                className="compact-table"
                size="small"
                dataSource={filteredRows.map((r, i) => ({ ...r, __key: i }))}
                rowKey="__key"
                columns={tableColumns as any}
                rowClassName={(_, idx) => validationInvalidRowSet.has(idx) ? 'tb-invalid-row' : ''}
                pagination={{ pageSize: 100, showSizeChanger: true, pageSizeOptions: ['50', '100', '200', '500'], showTotal: (t, r) => `${r[0]}–${r[1]} of ${t}` }}
                scroll={{ x: columns.length * 150, y: 'calc(100vh - 500px)' }}
                loading={loading}
                summary={summaryRow}
                locale={{ emptyText: <Empty description="No rows match the current filters" /> }}
              />
            </Card>
          </>
        )}

        {/* ── Validate Segments Modal ── */}
        <Modal
          open={validateModal}
          title={<Space><SafetyCertificateOutlined style={{ color: REDWOOD.info }} /><span>Validate Segments</span></Space>}
          width={700}
          onCancel={() => setValidateModal(false)}
          footer={
            <Space>
              <Button onClick={() => setValidateModal(false)}>Close</Button>
              <Button type="primary" icon={validating ? <SyncOutlined spin /> : <CheckCircleOutlined />}
                loading={validating}
                disabled={mappings.filter(m => m.excelColumn && m.coaSegmentKey).length === 0}
                onClick={async () => { await runValidation(); setValidateModal(false); }}
                style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}>
                {validating ? 'Validating…' : 'Run Validation'}
              </Button>
            </Space>
          }
        >
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
            Map Excel columns to COA segments, then run validation to check all values.
            {mappings.some(m => m.excelColumn && m.coaSegmentKey) && (
              <Tag color="blue" style={{ marginLeft: 8, fontSize: 10 }}>
                {mappings.filter(m => m.excelColumn && m.coaSegmentKey).length} mapping{mappings.filter(m => m.excelColumn && m.coaSegmentKey).length !== 1 ? 's' : ''} ready
              </Tag>
            )}
          </Text>

          {mappings.length === 0 && (
            <Alert type="info" showIcon style={{ marginBottom: 12 }}
              message="No auto-mappings detected. Add mappings manually below." />
          )}
          {mappings.length > 0 && mappings.some(m => m.excelColumn && m.coaSegmentKey) && (
            <Alert type="success" showIcon style={{ marginBottom: 12 }}
              message={`${mappings.filter(m => m.excelColumn && m.coaSegmentKey).length} column(s) auto-mapped from column names. Review and adjust as needed.`} />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mappings.map(m => (
              <Row key={m.id} gutter={8} align="middle">
                <Col flex="1">
                  <Select
                    placeholder="Excel column"
                    size="small" style={{ width: '100%' }}
                    showSearch value={m.excelColumn || undefined}
                    onChange={v => updateMapping(m.id, { excelColumn: v })}
                    options={columns.map(c => ({ value: c, label: c }))}
                  />
                </Col>
                <Col style={{ color: REDWOOD.neutral600, fontSize: 12, padding: '0 4px' }}>→</Col>
                <Col flex="1">
                  <Select
                    placeholder="COA Segment"
                    size="small" style={{ width: '100%' }}
                    showSearch value={m.coaSegmentKey || undefined}
                    onChange={v => updateMapping(m.id, { coaSegmentKey: v })}
                    options={COA_SEGMENTS.map(s => ({ value: s.key, label: `${s.label} (${s.valueSet})` }))}
                  />
                </Col>
                <Col>
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeMapping(m.id)} />
                </Col>
              </Row>
            ))}
          </div>

          <Divider style={{ margin: '12px 0' }} />
          <Button size="small" icon={<PlusOutlined />} onClick={addMapping}>Add Mapping</Button>
        </Modal>

        <style>{`
          .tb-invalid-row td { background: #fff2f0 !important; }
          .tb-invalid-row:hover td { background: #ffe7e0 !important; }
        `}</style>
      </Content>
    </Layout>
  );
};

export default TrialBalanceLoading;
