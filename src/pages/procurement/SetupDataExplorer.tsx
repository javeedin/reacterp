import React, { useEffect, useMemo, useState } from 'react';
import {
  Card, Row, Col, Statistic, Progress, Table, Tag, Upload, Segmented, Input, Button,
  Drawer, Empty, Space, Typography, message, Tabs, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  InboxOutlined, DatabaseOutlined, CheckCircleTwoTone, MinusCircleOutlined, EyeOutlined,
  ReloadOutlined, DownloadOutlined, SearchOutlined, AppstoreOutlined,
} from '@ant-design/icons';
import * as XLSX from 'xlsx';
import {
  parseSetupExport, getSetupCache, setSetupCache, type SetupTask, type SetupModule,
} from '../../utils/fusionSetupZip';

const { Text, Title } = Typography;
const RW = {
  primary: '#C74634', info: '#0572CE', success: '#1D7B4D', warn: '#D4A800', error: '#C74634',
  purple: '#6B21A8', teal: '#00918A', n100: '#F4F4F2', n200: '#E4E1DD', n600: '#6B6862', n900: '#1B1A17',
};
const MOD_COLOR: Record<SetupModule, string> = { 'Financials': RW.info, 'Supply Chain': RW.teal, 'Common': RW.purple };
const MODULES: SetupModule[] = ['Financials', 'Supply Chain', 'Common'];

const SetupDataExplorer: React.FC<{ defaultModule?: SetupModule }> = ({ defaultModule }) => {
  const [tasks, setTasks] = useState<SetupTask[]>(() => getSetupCache()?.tasks ?? []);
  const [fileName, setFileName] = useState<string>(() => getSetupCache()?.fileName ?? '');
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [modFilter, setModFilter] = useState<'All' | SetupModule>(defaultModule ?? 'All');
  const [search, setSearch] = useState('');
  const [configuredOnly, setConfiguredOnly] = useState(false);
  const [detail, setDetail] = useState<SetupTask | null>(null);

  useEffect(() => { setModFilter(defaultModule ?? 'All'); }, [defaultModule]);

  const onFile = async (file: File) => {
    setParsing(true); setProgress({ done: 0, total: 0 });
    try {
      const parsed = await parseSetupExport(file, (done, total) => setProgress({ done, total }));
      setTasks(parsed); setFileName(file.name); setSetupCache(file.name, parsed);
      message.success(`Parsed ${parsed.length} setup tasks from ${file.name}`);
    } catch (e: any) { message.error(`Could not read the export: ${e?.message ?? e}`); }
    finally { setParsing(false); setProgress(null); }
    return false;
  };

  // Per-module rollup for the dashboard.
  const stats = useMemo(() => {
    const per = (m?: SetupModule) => {
      const t = m ? tasks.filter(x => x.module === m) : tasks;
      const configured = t.filter(x => x.hasData).length;
      const records = t.reduce((s, x) => s + x.recordCount, 0);
      return { total: t.length, configured, empty: t.length - configured, records, pct: t.length ? Math.round((configured / t.length) * 100) : 0 };
    };
    return { all: per(), byMod: Object.fromEntries(MODULES.map(m => [m, per(m)])) as Record<SetupModule, ReturnType<typeof per>> };
  }, [tasks]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return tasks.filter(t =>
      (modFilter === 'All' || t.module === modFilter) &&
      (!configuredOnly || t.hasData) &&
      (!s || t.name.toLowerCase().includes(s)));
  }, [tasks, modFilter, search, configuredOnly]);

  const exportSummary = () => {
    const rows = tasks.map(t => ({ Task: t.name, Module: t.module, Status: t.hasData ? 'Configured' : 'Not configured', Records: t.recordCount, Files: t.files.length, Batch: t.batch ? 'Yes' : '' }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Setup Tasks');
    XLSX.writeFile(wb, `setup-summary-${fileName.replace(/\.zip$/i, '') || 'export'}.xlsx`);
  };

  const cols: ColumnsType<SetupTask> = [
    { title: 'Setup Task', dataIndex: 'name', render: (v, t) => <Space size={6}><Text strong style={{ fontSize: 12.5 }}>{v}</Text>{t.batch && <Tag color="geekblue" style={{ fontSize: 10 }}>batch</Tag>}</Space>, sorter: (a, b) => a.name.localeCompare(b.name) },
    { title: 'Module', dataIndex: 'module', width: 150, filters: MODULES.map(m => ({ text: m, value: m })), onFilter: (v, t) => t.module === v, render: (m: SetupModule) => <Tag color={MOD_COLOR[m]} style={{ color: '#fff', border: 'none' }}>{m}</Tag> },
    { title: 'Status', dataIndex: 'hasData', width: 170, sorter: (a, b) => Number(a.hasData) - Number(b.hasData), render: (_, t) => t.hasData
        ? <Space size={6}><CheckCircleTwoTone twoToneColor={RW.success} /><Text style={{ fontSize: 12 }}>Configured</Text></Space>
        : <Space size={6}><MinusCircleOutlined style={{ color: RW.n600 }} /><Text type="secondary" style={{ fontSize: 12 }}>Not configured</Text></Space> },
    { title: 'Records', dataIndex: 'recordCount', width: 100, align: 'right', sorter: (a, b) => a.recordCount - b.recordCount, render: (v, t) => t.batch && !v ? <Text type="secondary" style={{ fontSize: 11 }}>batch</Text> : <Text strong style={{ fontVariantNumeric: 'tabular-nums', color: v ? RW.primary : RW.n600 }}>{v || '—'}</Text> },
    { title: 'Files', dataIndex: 'files', width: 70, align: 'right', render: (f: any[]) => f.length || '—' },
    { title: '', width: 90, align: 'center', render: (_, t) => <Button size="small" type="text" icon={<EyeOutlined />} disabled={!t.files.length} style={{ color: t.files.length ? RW.info : undefined }} onClick={() => setDetail(t)}>View</Button> },
  ];

  const hasData = tasks.length > 0;

  return (
    <div style={{ padding: '8px 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
        <DatabaseOutlined style={{ fontSize: 20, color: RW.primary }} />
        <Title level={4} style={{ margin: 0 }}>Setup Data{defaultModule ? ` — ${defaultModule}` : ''}</Title>
        {fileName && <Tag color="default" style={{ fontSize: 11 }}>{fileName}</Tag>}
        <span style={{ marginLeft: 'auto' }} />
        {hasData && <>
          <Button size="small" icon={<DownloadOutlined />} onClick={exportSummary}>Export summary</Button>
          <Upload accept=".zip" showUploadList={false} beforeUpload={onFile}><Button size="small" icon={<ReloadOutlined />} loading={parsing}>Re-upload</Button></Upload>
        </>}
      </div>

      {!hasData ? (
        <Card style={{ borderRadius: 10 }}>
          <Upload.Dragger accept=".zip" showUploadList={false} beforeUpload={onFile} disabled={parsing} style={{ padding: 20 }}>
            <p style={{ margin: 0 }}><InboxOutlined style={{ fontSize: 42, color: RW.primary }} /></p>
            <p style={{ margin: '10px 0 2px', fontSize: 15, fontWeight: 600 }}>Upload an Oracle Fusion Setup Data Export (.zip)</p>
            <p style={{ margin: 0, color: RW.n600, fontSize: 12.5 }}>Export it from Functional Setup Manager → Export Setup Data. Each inner task is parsed in your browser; nothing is uploaded to a server.</p>
            {parsing && progress && <div style={{ marginTop: 16, maxWidth: 360, marginInline: 'auto' }}><Progress percent={progress.total ? Math.round((progress.done / progress.total) * 100) : 0} size="small" /><Text type="secondary" style={{ fontSize: 11 }}>Parsing {progress.done}/{progress.total} tasks…</Text></div>}
          </Upload.Dragger>
        </Card>
      ) : (
        <>
          {/* Dashboard */}
          <Row gutter={[12, 12]} style={{ marginBottom: 14 }}>
            <Col xs={24} md={6}>
              <Card size="small" style={{ borderRadius: 10, borderTop: `3px solid ${RW.primary}`, height: '100%' }}>
                <Statistic title="Setup Tasks" value={stats.all.total} prefix={<AppstoreOutlined style={{ color: RW.primary }} />} />
                <div style={{ marginTop: 8 }}>
                  <Progress percent={stats.all.pct} strokeColor={RW.success} size="small" format={p => `${p}% done`} />
                  <Space size={12} style={{ fontSize: 12 }}>
                    <span><CheckCircleTwoTone twoToneColor={RW.success} /> {stats.all.configured} configured</span>
                    <Text type="secondary">{stats.all.empty} empty</Text>
                  </Space>
                </div>
                <div style={{ marginTop: 6, fontSize: 12 }}><Text type="secondary">Total records </Text><Text strong style={{ color: RW.primary }}>{stats.all.records.toLocaleString()}</Text></div>
              </Card>
            </Col>
            {MODULES.map(m => {
              const s = stats.byMod[m];
              return (
                <Col xs={24} md={6} key={m}>
                  <Card size="small" hoverable onClick={() => setModFilter(m)} style={{ borderRadius: 10, borderTop: `3px solid ${MOD_COLOR[m]}`, height: '100%', cursor: 'pointer', outline: modFilter === m ? `2px solid ${MOD_COLOR[m]}` : undefined }}>
                    <Statistic title={<Text strong style={{ color: MOD_COLOR[m] }}>{m}</Text>} value={s.configured} suffix={<Text type="secondary" style={{ fontSize: 13 }}>/ {s.total} tasks</Text>} />
                    <div style={{ marginTop: 8 }}><Progress percent={s.pct} strokeColor={MOD_COLOR[m]} size="small" /></div>
                    <div style={{ marginTop: 4, fontSize: 12 }}><Text type="secondary">Records </Text><Text strong>{s.records.toLocaleString()}</Text></div>
                  </Card>
                </Col>
              );
            })}
          </Row>

          {/* Filter bar */}
          <Card size="small" style={{ borderRadius: 10 }}
            styles={{ body: { padding: 10 } }}
            title={<Space wrap>
              <Segmented value={modFilter} onChange={v => setModFilter(v as any)}
                options={['All', ...MODULES].map(m => ({ value: m, label: m === 'All' ? `All (${stats.all.total})` : `${m} (${stats.byMod[m as SetupModule].total})` }))} />
              <Input allowClear size="small" prefix={<SearchOutlined />} placeholder="Search task…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 220 }} />
              <Button size="small" type={configuredOnly ? 'primary' : 'default'} onClick={() => setConfiguredOnly(v => !v)} style={configuredOnly ? { background: RW.success, borderColor: RW.success } : undefined}>Configured only</Button>
            </Space>}>
            <Table size="small" rowKey="name" columns={cols} dataSource={filtered} pagination={{ pageSize: 25, showSizeChanger: true }}
              scroll={{ x: 720 }} locale={{ emptyText: 'No tasks match' }} />
          </Card>
        </>
      )}

      {/* Task detail — the parsed setup data */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} width={920} title={detail && <Space><DatabaseOutlined style={{ color: MOD_COLOR[detail.module] }} />{detail.name}<Tag color={MOD_COLOR[detail.module]} style={{ color: '#fff', border: 'none' }}>{detail.module}</Tag>{detail.hasData ? <Tag color="success">{detail.recordCount} record(s)</Tag> : <Tag>empty</Tag>}</Space>}>
        {detail && (detail.files.length === 0
          ? <Empty description={detail.batch ? 'Batch-format task — records are in a nested import batch (not table-parsed).' : 'No setup data (task not configured).'} />
          : <Tabs size="small" items={detail.files.map((f, i) => ({
              key: String(i),
              label: <Space size={4}>{f.sdoTitle || f.name}<Tag style={{ fontSize: 10, marginInlineStart: 4 }}>{f.rows.length}</Tag></Space>,
              children: f.headers.length === 0
                ? <Empty description="No columns" />
                : <Table size="small" rowKey={(_, idx) => String(idx)} pagination={f.rows.length > 50 ? { pageSize: 50 } : false}
                    scroll={{ x: 'max-content', y: 520 }}
                    columns={f.headers.map((h, ci) => ({ title: h || `Col ${ci + 1}`, dataIndex: ci, ellipsis: true, render: (v: any) => <Tooltip title={v}><span style={{ fontSize: 11.5 }}>{v || <Text type="secondary">—</Text>}</span></Tooltip> }))}
                    dataSource={f.rows.map((r, ri) => ({ key: ri, ...Object.fromEntries(r.map((c, ci) => [ci, c])) }))} />,
            }))} />)}
      </Drawer>
    </div>
  );
};

export default SetupDataExplorer;
