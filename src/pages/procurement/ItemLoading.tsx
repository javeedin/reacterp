import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Layout, Breadcrumb, Card, Table, Button, Tag, Typography, Space, Tooltip, Spin,
  Row, Col, message, Modal, Empty, Select, Input, Tabs, Upload, Checkbox, Steps, Alert, Progress,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, UploadOutlined, InboxOutlined, CheckCircleTwoTone, CloseCircleTwoTone,
  InfoCircleOutlined, CopyOutlined, SearchOutlined, PlusOutlined, ReloadOutlined, ApiOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';

const { Content } = Layout;
const { Title, Text } = Typography;

const _isElectron = !!(window as unknown as { electron?: unknown; electronAPI?: unknown }).electron
  || !!(window as unknown as { electronAPI?: unknown }).electronAPI;
const FUSION_BASE = _isElectron
  ? 'https://iacney-test.fa.ocs.oraclecloud.com/fscmRestApi/resources/11.13.18.05'
  : '/fusion-api';
const AUTH_HEADER = 'Basic ' + btoa('emparun:Fusion@1234');
const FUSION_HDRS = { Authorization: AUTH_HEADER, Accept: 'application/json' };
const JSON_HDRS = { ...FUSION_HDRS, 'Content-Type': 'application/json' };
const ITEMS_URL = `${FUSION_BASE}/itemsV2`;

// Master item organization — items are created here first, then assigned to child orgs.
const MASTER_ORG = 'MIM';

const REDWOOD = {
  primary: '#C74634', success: '#1D7B4D', warning: '#B07700', info: '#0572CE',
  error: '#D93025', teal: '#00918A', purple: '#7245A6',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral300: '#C7C7C7',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
};

// Fields copied from the chosen reference item when creating a new one (only those
// present on the reference are sent). Item Number + Description are set per row.
const COPY_FIELDS = [
  'ItemClass', 'PrimaryUOMValue', 'PrimaryUnitOfMeasure', 'ItemStatusValue', 'LifecyclePhaseValue',
  'UserItemType', 'SalesProductType', 'InventoryItemFlag', 'StockEnabledFlag', 'InventoryAssetFlag',
  'PurchasingItemFlag', 'PurchasableFlag', 'CustomerOrderEnabledFlag', 'CustomerOrderFlag',
  'ShippableItemFlag', 'InternalOrderEnabledFlag', 'InternalOrderFlag', 'TransactionEnabledFlag',
  'BuildInWipFlag', 'ReturnableFlag', 'ServiceableProductFlag',
];

const mapLimit = async <T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> => {
  const out: R[] = new Array(items.length); let idx = 0;
  const worker = async () => { while (idx < items.length) { const c = idx++; out[c] = await fn(items[c], c); } };
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, worker));
  return out;
};
const fetchJson = async (url: string): Promise<any> => { const r = await fetch(url, { headers: FUSION_HDRS }); return r.ok ? r.json() : null; };
// Exact-match GET of one item in an org.
const getItem = async (itemNumber: string, org: string) =>
  (await fetchJson(`${ITEMS_URL}?q=OrganizationCode=${org};ItemNumber=${encodeURIComponent(itemNumber)}&limit=1&onlyData=true`))?.items?.[0] ?? null;
// Prefix search of items in the master org (reference picker).
const searchMaster = async (term: string) =>
  (await fetchJson(`${ITEMS_URL}?q=OrganizationCode=${MASTER_ORG}${term ? `;ItemNumber LIKE ${encodeURIComponent(term)}%` : ''}&limit=25&onlyData=true`))?.items ?? [];

const buildPayload = (itemNumber: string, description: string, org: string, ref: any) => {
  const body: Record<string, any> = { OrganizationCode: org, ItemNumber: itemNumber, ItemDescription: description };
  if (ref) for (const f of COPY_FIELDS) if (ref[f] != null && ref[f] !== '') body[f] = ref[f];
  return body;
};
const postItem = async (payload: any): Promise<{ ok: boolean; status: number; data: any; text: string }> => {
  const r = await fetch(ITEMS_URL, { method: 'POST', headers: JSON_HDRS, body: JSON.stringify(payload) });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* raw */ }
  return { ok: r.ok, status: r.status, data, text };
};
const errOf = (res: { data: any; text: string }) =>
  res.data?.['o:errorDetails']?.[0]?.detail ?? res.data?.detail ?? res.data?.message ?? (res.text || '').slice(0, 240);

interface PasteRow { key: string; itemNumber: string; description: string; exists?: boolean; checking?: boolean; }
interface OrgOpt { code: string; name: string; }

// ─────────────────────────────────────────────────────────────────────────────
// Search tab — query itemsV2 by org + item / description
// ─────────────────────────────────────────────────────────────────────────────
const SearchTab: React.FC<{ orgs: OrgOpt[] }> = ({ orgs }) => {
  const [org, setOrg] = useState<string>(MASTER_ORG);
  const [itemNumber, setItemNumber] = useState('');
  const [description, setDescription] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [lastUrl, setLastUrl] = useState('');

  const run = useCallback(async () => {
    const q: string[] = [`OrganizationCode=${org}`];
    if (itemNumber) q.push(`ItemNumber LIKE ${itemNumber}%`);
    if (description) q.push(`ItemDescription LIKE ${description}%`);
    const url = `${ITEMS_URL}?q=${q.join(';')}&limit=200&onlyData=true`;
    setLastUrl(url); setLoading(true); setErr('');
    try {
      const r = await fetch(url, { headers: FUSION_HDRS });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setRows(d.items ?? []);
    } catch (e: any) { setErr(e?.message ?? String(e)); setRows([]); }
    finally { setLoading(false); }
  }, [org, itemNumber, description]);

  const cols: ColumnsType<any> = [
    { title: 'Item Number', dataIndex: 'ItemNumber', width: 160, render: v => <Text strong>{v}</Text> },
    { title: 'Description', dataIndex: 'ItemDescription', ellipsis: true },
    { title: 'Org', dataIndex: 'OrganizationCode', width: 120, render: v => <Tag>{v}</Tag> },
    { title: 'UOM', dataIndex: 'PrimaryUOMValue', width: 90, render: (v, r) => v ?? r.PrimaryUnitOfMeasure ?? '—' },
    { title: 'Item Class', dataIndex: 'ItemClass', width: 160, ellipsis: true, render: v => v ?? '—' },
    { title: 'Status', dataIndex: 'ItemStatusValue', width: 110, render: v => v ? <Tag color="blue">{v}</Tag> : '—' },
  ];

  return (
    <div>
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col xs={24} md={6}><div style={{ fontSize: 12, color: REDWOOD.neutral600, marginBottom: 4 }}>Organization</div>
          <Select showSearch style={{ width: '100%' }} value={org} onChange={setOrg} optionFilterProp="label"
            options={orgs.map(o => ({ value: o.code, label: `${o.code}${o.name ? ' — ' + o.name : ''}` }))} /></Col>
        <Col xs={24} md={6}><div style={{ fontSize: 12, color: REDWOOD.neutral600, marginBottom: 4 }}>Item Number (prefix)</div>
          <Input value={itemNumber} onChange={e => setItemNumber(e.target.value)} onPressEnter={run} allowClear /></Col>
        <Col xs={24} md={6}><div style={{ fontSize: 12, color: REDWOOD.neutral600, marginBottom: 4 }}>Description (prefix)</div>
          <Input value={description} onChange={e => setDescription(e.target.value)} onPressEnter={run} allowClear /></Col>
        <Col xs={24} md={6} style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={run}
            style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>Search</Button>
          {lastUrl && <Tooltip title={<span style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>{lastUrl}</span>}>
            <Button icon={<ApiOutlined />} style={{ color: REDWOOD.info }} /></Tooltip>}
        </Col>
      </Row>
      {err && <Alert type="error" showIcon message={err} style={{ marginBottom: 12 }} />}
      <Table size="small" rowKey={(_, i) => String(i)} columns={cols} dataSource={rows} loading={loading}
        pagination={{ pageSize: 25, showSizeChanger: true }} scroll={{ x: 900 }}
        locale={{ emptyText: 'No items — run a search' }} />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Load tab — paste / excel → validate in MIM → create (reference copy) → assign orgs
// ─────────────────────────────────────────────────────────────────────────────
const LoadTab: React.FC<{ orgs: OrgOpt[] }> = ({ orgs }) => {
  const [mode, setMode] = useState<'paste' | 'excel'>('paste');
  const [pasteText, setPasteText] = useState('');
  const [rows, setRows] = useState<PasteRow[]>([]);
  const [validating, setValidating] = useState(false);

  // Parse pasted "item<tab/comma>description" lines into rows.
  const parsePaste = () => {
    const lines = pasteText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const out: PasteRow[] = lines.map((ln, i) => {
      const parts = ln.split(/\t|,|\s{2,}/).map(p => p.trim()).filter(p => p !== '');
      const itemNumber = parts[0] ?? '';
      const description = parts.slice(1).join(' ');
      return { key: `p-${i}-${itemNumber}`, itemNumber, description };
    }).filter(r => r.itemNumber && !/^item\s*(number|no|code)$/i.test(r.itemNumber));
    setRows(out);
  };

  const parseSheet = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
        // Skip a header row if the first cell looks like a header.
        const start = grid.length && /item|code|number/i.test(String(grid[0]?.[0] ?? '')) ? 1 : 0;
        const out: PasteRow[] = grid.slice(start).map((r, i) => ({
          key: `x-${i}`, itemNumber: String(r[0] ?? '').trim(), description: String(r[1] ?? '').trim(),
        })).filter(r => r.itemNumber);
        setRows(out);
        message.success(`Loaded ${out.length} row(s) from ${file.name}`);
      } catch (er: any) { message.error(`Failed to read file: ${er?.message ?? er}`); }
    };
    reader.readAsArrayBuffer(file);
    return false;
  };

  // Validate each item's existence in the master org (MIM).
  const validate = async () => {
    if (!rows.length) return;
    setValidating(true);
    setRows(prev => prev.map(r => ({ ...r, checking: true, exists: undefined })));
    try {
      await mapLimit(rows, 6, async (r) => {
        const found = await getItem(r.itemNumber, MASTER_ORG);
        setRows(prev => prev.map(x => x.key === r.key ? { ...x, exists: !!found, checking: false,
          description: x.description || (found?.ItemDescription ?? '') } : x));
      });
    } finally { setValidating(false); }
  };

  const newItems = rows.filter(r => r.exists === false && r.itemNumber);
  const validated = rows.every(r => r.exists != null);

  const [wizardOpen, setWizardOpen] = useState(false);

  const cols: ColumnsType<PasteRow> = [
    { title: '#', width: 44, render: (_, __, i) => i + 1 },
    { title: 'Item Number', dataIndex: 'itemNumber', width: 200, render: v => <Text strong>{v}</Text> },
    { title: 'Description', dataIndex: 'description', render: (v, r) => (
        <Input size="small" value={v} placeholder="Description"
          onChange={e => setRows(prev => prev.map(x => x.key === r.key ? { ...x, description: e.target.value } : x))} />
      ) },
    { title: 'In MIM?', width: 130, align: 'center', render: (_, r) => {
        if (r.checking) return <Spin size="small" />;
        if (r.exists == null) return <Text type="secondary">—</Text>;
        return r.exists
          ? <Tag icon={<CheckCircleTwoTone twoToneColor={REDWOOD.warning} />} color="warning">Exists</Tag>
          : <Tag icon={<PlusOutlined />} color="green">New</Tag>;
      } },
    { title: '', width: 40, render: (_, r) => <Button size="small" type="text" danger icon={<CloseCircleTwoTone twoToneColor={REDWOOD.error} />}
        onClick={() => setRows(prev => prev.filter(x => x.key !== r.key))} /> },
  ];

  return (
    <div>
      <Tabs size="small" activeKey={mode} onChange={k => setMode(k as any)} items={[
        {
          key: 'paste', label: <span><CopyOutlined /> Copy / Paste</span>,
          children: (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Paste one item per line — <b>Item Number</b> then <b>Description</b>, separated by a tab, comma, or 2+ spaces (e.g. copied from Excel).</Text>
              <Input.TextArea rows={7} value={pasteText} onChange={e => setPasteText(e.target.value)} style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12 }}
                placeholder={'460-BDXV\tHDMI Cable 2m\n461-ABCV,Network Switch 24-port'} />
              <Button type="primary" style={{ marginTop: 8, background: REDWOOD.primary, borderColor: REDWOOD.primary }} onClick={parsePaste} disabled={!pasteText.trim()}>Parse {pasteText.trim() ? '' : ''}</Button>
            </div>
          ),
        },
        {
          key: 'excel', label: <span><UploadOutlined /> Load from CSV / Excel</span>,
          children: (
            <Upload.Dragger accept=".xlsx,.xls,.csv" multiple={false} showUploadList={false} beforeUpload={parseSheet}>
              <p className="ant-upload-drag-icon"><InboxOutlined style={{ color: REDWOOD.primary }} /></p>
              <p className="ant-upload-text">Click or drag a CSV/Excel file here</p>
              <p className="ant-upload-hint" style={{ fontSize: 12 }}>Column A = Item Number, Column B = Description (a header row is skipped automatically).</p>
            </Upload.Dragger>
          ),
        },
      ]} />

      {rows.length > 0 && (
        <Card size="small" style={{ marginTop: 12, borderRadius: 8 }}
          title={<Space><Text strong>{rows.length} item(s)</Text>
            {validated && <Tag color="green">{newItems.length} new</Tag>}
            {validated && <Tag color="warning">{rows.length - newItems.length} existing</Tag>}</Space>}
          extra={<Space>
            <Button icon={<ReloadOutlined />} loading={validating} onClick={validate}>Validate in MIM</Button>
            <Button type="primary" icon={<PlusOutlined />} disabled={!newItems.length}
              onClick={() => setWizardOpen(true)} style={newItems.length ? { background: REDWOOD.success, borderColor: REDWOOD.success } : undefined}>
              Create {newItems.length ? `(${newItems.length})` : ''}
            </Button>
          </Space>}>
          <Table size="small" rowKey="key" columns={cols} dataSource={rows} pagination={false} scroll={{ y: 340 }} />
        </Card>
      )}

      <CreateWizard open={wizardOpen} onClose={() => setWizardOpen(false)} items={newItems} orgs={orgs}
        onDone={() => validate()} />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Create wizard — reference pick → org select → run (create in MIM + assign orgs)
// ─────────────────────────────────────────────────────────────────────────────
interface RunRow { key: string; itemNumber: string; description: string; master?: string; masterOk?: boolean; orgDone: number; orgTotal: number; errors: string[]; running?: boolean; }
const CreateWizard: React.FC<{ open: boolean; onClose: () => void; items: PasteRow[]; orgs: OrgOpt[]; onDone: () => void }> = ({ open, onClose, items, orgs, onDone }) => {
  const [step, setStep] = useState(0);
  const [refTerm, setRefTerm] = useState('');
  const [refOpts, setRefOpts] = useState<any[]>([]);
  const [refLoading, setRefLoading] = useState(false);
  const [refItem, setRefItem] = useState<any | null>(null);
  const [selOrgs, setSelOrgs] = useState<string[]>([]);
  const [runRows, setRunRows] = useState<RunRow[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { if (open) { setStep(0); setRefItem(null); setRefTerm(''); setRefOpts([]); setSelOrgs([]); setRunRows([]); setRunning(false); setDone(false); } }, [open]);

  const doRefSearch = useCallback(async (term: string) => {
    setRefLoading(true);
    try { setRefOpts(await searchMaster(term)); } catch { setRefOpts([]); } finally { setRefLoading(false); }
  }, []);
  useEffect(() => { if (open && step === 0) { const t = setTimeout(() => doRefSearch(refTerm), 350); return () => clearTimeout(t); } }, [refTerm, open, step, doRefSearch]);

  // Assignable child orgs (exclude the master org — the item is created there first).
  const childOrgs = orgs.filter(o => o.code !== MASTER_ORG);
  const allChildSelected = childOrgs.length > 0 && selOrgs.length === childOrgs.length;

  const run = async () => {
    setRunning(true); setDone(false);
    const initial: RunRow[] = items.map(it => ({ key: it.key, itemNumber: it.itemNumber, description: it.description, orgDone: 0, orgTotal: selOrgs.length, errors: [] }));
    setRunRows(initial);
    const patch = (key: string, p: Partial<RunRow>) => setRunRows(prev => prev.map(r => r.key === key ? { ...r, ...p } : r));
    for (const it of items) {
      patch(it.key, { running: true });
      // 1) Create in the master org from the reference item.
      const mres = await postItem(buildPayload(it.itemNumber, it.description, MASTER_ORG, refItem));
      if (!mres.ok) { patch(it.key, { master: `Failed (${mres.status})`, masterOk: false, running: false, errors: [errOf(mres)] }); continue; }
      patch(it.key, { master: 'Created', masterOk: true });
      // 2) Assign to each selected child org.
      let done = 0; const errs: string[] = [];
      for (const org of selOrgs) {
        const ores = await postItem(buildPayload(it.itemNumber, it.description, org, refItem));
        if (ores.ok) done++; else errs.push(`${org}: ${errOf(ores)}`);
        patch(it.key, { orgDone: done, errors: errs });
      }
      patch(it.key, { running: false });
    }
    setRunning(false); setDone(true); onDone();
  };

  const runCols: ColumnsType<RunRow> = [
    { title: 'Item', dataIndex: 'itemNumber', width: 170, render: v => <Text strong>{v}</Text> },
    { title: `Master (${MASTER_ORG})`, width: 120, render: (_, r) => r.running && !r.master ? <Spin size="small" />
        : r.master ? <Tag color={r.masterOk ? 'green' : 'red'}>{r.master}</Tag> : <Text type="secondary">—</Text> },
    { title: 'Orgs assigned', width: 160, render: (_, r) => r.orgTotal ? <Progress percent={Math.round((r.orgDone / r.orgTotal) * 100)} size="small" format={() => `${r.orgDone}/${r.orgTotal}`} status={r.errors.length ? 'exception' : undefined} /> : '—' },
    { title: 'Errors', render: (_, r) => r.errors.length ? <Tooltip title={r.errors.join('\n')}><Text type="danger" style={{ fontSize: 11 }}>{r.errors[0]}{r.errors.length > 1 ? ` (+${r.errors.length - 1})` : ''}</Text></Tooltip> : <Text type="secondary">—</Text> },
  ];

  return (
    <Modal open={open} onCancel={() => { if (!running) onClose(); }} width={860} maskClosable={false}
      title={<Space><PlusOutlined style={{ color: REDWOOD.success }} />Create {items.length} New Item(s)</Space>}
      footer={
        step === 0 ? <Space><Button onClick={onClose}>Cancel</Button>
          <Button type="primary" disabled={!refItem} onClick={() => setStep(1)} style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>Next: Organizations</Button></Space>
        : step === 1 ? <Space><Button onClick={() => setStep(0)}>Back</Button>
          <Button type="primary" onClick={() => setStep(2)} style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>Next: Review &amp; Run</Button></Space>
        : done ? <Button onClick={onClose}>Close</Button>
        : <Space><Button onClick={() => setStep(1)} disabled={running}>Back</Button>
          <Button type="primary" loading={running} onClick={run} style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}>Run — create {items.length} item(s)</Button></Space>
      }>
      <Steps size="small" current={step} style={{ marginBottom: 16 }}
        items={[{ title: 'Reference Item' }, { title: 'Organizations' }, { title: 'Review & Run' }]} />

      {step === 0 && (
        <div>
          <Alert type="info" showIcon style={{ marginBottom: 12 }}
            message="Pick an existing item to copy" description={`The new items are created in the master org (${MASTER_ORG}) by cloning this reference item's item class and attributes — only the Item Number and Description change.`} />
          <Select showSearch style={{ width: '100%' }} placeholder="Search an item in MIM to use as reference…"
            filterOption={false} onSearch={setRefTerm} loading={refLoading} notFoundContent={refLoading ? <Spin size="small" /> : 'Type to search'}
            value={refItem?.ItemNumber} onChange={(_, opt: any) => setRefItem(opt?.item ?? null)}
            options={refOpts.map(it => ({ value: it.ItemNumber, label: `${it.ItemNumber} — ${it.ItemDescription ?? ''}`, item: it }))} />
          {refItem && (
            <Card size="small" style={{ marginTop: 12, background: REDWOOD.neutral100 }}>
              <Row gutter={[12, 6]}>
                <Col span={12}><Text type="secondary" style={{ fontSize: 12 }}>Item Class</Text><div><Text strong>{refItem.ItemClass ?? '—'}</Text></div></Col>
                <Col span={6}><Text type="secondary" style={{ fontSize: 12 }}>UOM</Text><div>{refItem.PrimaryUOMValue ?? refItem.PrimaryUnitOfMeasure ?? '—'}</div></Col>
                <Col span={6}><Text type="secondary" style={{ fontSize: 12 }}>Status</Text><div>{refItem.ItemStatusValue ?? '—'}</div></Col>
              </Row>
              <div style={{ marginTop: 6, fontSize: 11, color: REDWOOD.neutral600 }}>Copied fields: {COPY_FIELDS.filter(f => refItem[f] != null && refItem[f] !== '').join(', ') || '(none found on reference)'}</div>
            </Card>
          )}
        </div>
      )}

      {step === 1 && (
        <div>
          <Alert type="info" showIcon style={{ marginBottom: 12 }}
            message="Assign to organizations" description={`After creation in ${MASTER_ORG}, the item is assigned to each selected organization.`} />
          <Space style={{ marginBottom: 8 }}>
            <Checkbox checked={allChildSelected} indeterminate={selOrgs.length > 0 && !allChildSelected}
              onChange={e => setSelOrgs(e.target.checked ? childOrgs.map(o => o.code) : [])}>Select all ({childOrgs.length})</Checkbox>
            <Text type="secondary" style={{ fontSize: 12 }}>{selOrgs.length} selected</Text>
          </Space>
          <div style={{ maxHeight: 300, overflow: 'auto', border: `1px solid ${REDWOOD.neutral200}`, borderRadius: 6, padding: 8 }}>
            <Checkbox.Group value={selOrgs} onChange={v => setSelOrgs(v as string[])} style={{ width: '100%' }}>
              <Row>{childOrgs.map(o => <Col xs={24} sm={12} md={8} key={o.code} style={{ padding: '2px 0' }}>
                <Checkbox value={o.code}><Text style={{ fontSize: 12 }}>{o.code}{o.name ? ` — ${o.name}` : ''}</Text></Checkbox></Col>)}</Row>
            </Checkbox.Group>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <Alert type={done ? (runRows.some(r => !r.masterOk || r.errors.length) ? 'warning' : 'success') : 'info'} showIcon style={{ marginBottom: 12 }}
            message={done ? 'Completed' : `Ready to create ${items.length} item(s) in ${MASTER_ORG} and assign to ${selOrgs.length} org(s)`}
            description={done ? undefined : `Reference: ${refItem?.ItemNumber ?? '—'} (${refItem?.ItemClass ?? 'no class'})`} />
          <Table size="small" rowKey="key" columns={runCols}
            dataSource={runRows.length ? runRows : items.map(it => ({ key: it.key, itemNumber: it.itemNumber, description: it.description, orgDone: 0, orgTotal: selOrgs.length, errors: [] }))}
            pagination={false} scroll={{ y: 320 }} />
        </div>
      )}
    </Modal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
const ItemLoading: React.FC = () => {
  const [orgs, setOrgs] = useState<OrgOpt[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [tab, setTab] = useState('load');

  useEffect(() => {
    (async () => {
      setOrgsLoading(true);
      try {
        const all: OrgOpt[] = []; let offset = 0;
        while (true) {
          const d = await fetchJson(`${FUSION_BASE}/inventoryOrganizations?onlyData=true&limit=500&offset=${offset}&fields=OrganizationCode,OrganizationName`);
          const items = d?.items ?? [];
          items.forEach((o: any) => { if (o.OrganizationCode) all.push({ code: o.OrganizationCode, name: o.OrganizationName ?? '' }); });
          if (!d?.hasMore) break; offset += 500;
        }
        all.sort((a, b) => a.code.localeCompare(b.code));
        setOrgs(all);
      } catch { setOrgs([]); } finally { setOrgsLoading(false); }
    })();
  }, []);

  return (
    <Layout style={{ background: 'transparent' }}>
      <Content style={{ padding: '8px 4px' }}>
        <Breadcrumb style={{ marginBottom: 10 }} items={[
          { title: <Link to="/"><HomeOutlined /></Link> },
          { title: <Link to="/procurement">Procurement</Link> },
          { title: 'Item Loading' },
        ]} />
        <div style={{ marginBottom: 12 }}>
          <Title level={4} style={{ margin: 0 }}><UploadOutlined style={{ color: REDWOOD.primary, marginRight: 8 }} />Item Loading</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>Search items, or bulk-load new items into the master org ({MASTER_ORG}) from a reference item and assign them to organizations.</Text>
          {orgsLoading && <Spin size="small" style={{ marginLeft: 10 }} />}
          {!orgsLoading && <Tag style={{ marginLeft: 10 }}>{orgs.length} orgs</Tag>}
        </div>
        <Card style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
          <Tabs activeKey={tab} onChange={setTab} items={[
            { key: 'search', label: <span><SearchOutlined /> Search</span>, children: <SearchTab orgs={orgs} /> },
            { key: 'load', label: <span><UploadOutlined /> Load</span>, children: <LoadTab orgs={orgs} /> },
          ]} />
        </Card>
      </Content>
    </Layout>
  );
};

export default ItemLoading;
