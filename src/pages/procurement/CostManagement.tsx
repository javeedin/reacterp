import React, { useState } from 'react';
import {
  Layout, Breadcrumb, Typography, Card, Table, Tabs, Tag, Button, Input, Space,
  Tooltip, Alert, Modal, message, Steps,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, DollarOutlined, ApiOutlined, PlayCircleOutlined, ReloadOutlined,
  ThunderboltOutlined, SearchOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';

const { Content } = Layout;
const { Title, Text } = Typography;

// Direct in Electron (no CORS); Vite proxy in the browser. preload exposes electronAPI.
const _isElectron = !!(window as unknown as { electron?: unknown; electronAPI?: unknown }).electron
  || !!(window as unknown as { electronAPI?: unknown }).electronAPI;
const FUSION_BASE = _isElectron
  ? 'https://iacney-test.fa.ocs.oraclecloud.com/fscmRestApi/resources/11.13.18.05'
  : '/fusion-api';
const AUTH_HEADER = 'Basic ' + btoa('emparun:Fusion@1234');
const HDRS = { Authorization: AUTH_HEADER, Accept: 'application/json' };
const ERP_URL = `${FUSION_BASE}/erpintegrations`;

const REDWOOD = {
  primary: '#C74634', info: '#0572CE', success: '#1D7B4D', warning: '#D4A800', error: '#D93025',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral500: '#8C8C8C', neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
};

interface CostStep {
  key: string;
  seq: number;
  name: string;
  subledger: string;
  description: string;
  jobPackage: string;   // ESS job package path — fill in per your pod
  jobDef: string;       // ESS job definition name
  params: string;       // comma-separated ESS parameters
}

// Default costing flow after a PO receipt. Job package/def are left blank —
// fill them from Scheduled Processes → Process Details for your instance.
const DEFAULT_STEPS: CostStep[] = [
  { key: '1', seq: 1, name: 'Transfer Transactions from Receiving to Costing', subledger: 'Receipt Accounting',
    description: 'Pulls receiving transactions into costing.', jobPackage: '', jobDef: '', params: '' },
  { key: '2', seq: 2, name: 'Transfer Transactions from Inventory to Costing', subledger: 'Cost Accounting',
    description: 'Pulls the inventory delivery transactions into costing.', jobPackage: '', jobDef: '', params: '' },
  { key: '3', seq: 3, name: 'Create Receipt Accounting Distributions', subledger: 'Receipt Accounting',
    description: 'Costs & creates distributions for the receipt / accrual side.', jobPackage: '', jobDef: '', params: '' },
  { key: '4', seq: 4, name: 'Create Cost Accounting Distributions', subledger: 'Cost Accounting',
    description: 'The cost processor — values transactions and creates cost distributions.', jobPackage: '', jobDef: '', params: '' },
  { key: '5', seq: 5, name: 'Create Accounting (Cost & Receipt Accounting)', subledger: 'Subledger Accounting',
    description: 'Creates subledger journal entries and (optionally) posts to GL.', jobPackage: '', jobDef: '', params: '' },
];

const STEPS_KEY = 'cost_mgmt_steps';
const loadSteps = (): CostStep[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(STEPS_KEY) || 'null');
    if (Array.isArray(saved) && saved.length) return saved;
  } catch { /* ignore */ }
  return DEFAULT_STEPS;
};

interface EssJob {
  key: string;
  step: string;
  requestId: string;
  status: string;      // SUCCEEDED / RUNNING / ERROR / WARNING / …
  submittedAt: string;
  response: string;
}

const statusColor = (s: string): string => {
  const u = (s || '').toUpperCase();
  if (u.includes('SUCCEED') || u === 'COMPLETED') return 'success';
  if (u.includes('ERROR') || u.includes('FAIL')) return 'error';
  if (u.includes('WARN')) return 'warning';
  if (u.includes('RUN') || u.includes('READY') || u.includes('WAIT') || u.includes('SCHEDUL')) return 'processing';
  return 'default';
};

const CostManagement: React.FC = () => {
  const [steps, setSteps] = useState<CostStep[]>(loadSteps());
  const [jobs, setJobs]   = useState<EssJob[]>([]);
  const [seq, setSeq]     = useState(0);
  const [checkId, setCheckId] = useState('');

  const persist = (next: CostStep[]) => { setSteps(next); localStorage.setItem(STEPS_KEY, JSON.stringify(next)); };
  const updateStep = (key: string, field: keyof CostStep, value: string) =>
    persist(steps.map(s => s.key === key ? { ...s, [field]: value } : s));

  // ── Submit an ESS job via erpintegrations / submitESSJobRequest ─────────────
  const submitBody = (s: CostStep) => ({
    OperationName: 'submitESSJobRequest',
    JobPackageName: s.jobPackage.trim(),
    JobDefName:     s.jobDef.trim(),
    ESSParameters:  s.params.trim(),
  });

  const confirmRun = (s: CostStep) => {
    if (!s.jobPackage.trim() || !s.jobDef.trim()) {
      message.error('Set the Job Package and Job Definition for this step first (Cost Flow tab).');
      return;
    }
    const body = submitBody(s);
    Modal.confirm({
      title: `Run: ${s.name}?`,
      width: 640,
      icon: null,
      okText: 'Submit ESS job',
      content: (
        <div style={{ fontSize: 12 }}>
          <p style={{ margin: '0 0 8px' }}>Submits the scheduled process to Oracle Fusion.</p>
          <pre style={{ fontSize: 11, background: '#f5f5f5', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
{`POST ${ERP_URL}
Content-Type: application/json

${JSON.stringify(body, null, 2)}`}
          </pre>
        </div>
      ),
      onOk: () => runJob(s),
    });
  };

  const runJob = async (s: CostStep) => {
    try {
      const res = await fetch(ERP_URL, {
        method: 'POST', headers: { ...HDRS, 'Content-Type': 'application/json' }, body: JSON.stringify(submitBody(s)),
      });
      const text = await res.text();
      let data: any = null; try { data = JSON.parse(text); } catch { /* non-json */ }
      const reqId = data?.ReqstId ?? data?.reqstId ?? data?.RequestId ?? data?.DocumentId ?? '';
      if (!res.ok || !reqId) {
        Modal.error({ title: 'Submit failed', width: 620, content: <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 260, overflow: 'auto' }}>{text}</pre> });
        return;
      }
      const job: EssJob = {
        key: `${reqId}-${jobs.length}`, step: s.name, requestId: String(reqId),
        status: 'RUNNING', submittedAt: new Date().toLocaleString(), response: text,
      };
      setJobs(prev => [job, ...prev]);
      message.success(`Submitted — request ${reqId}`);
      refreshJob(job.requestId);
    } catch (e: any) {
      Modal.error({ title: 'Submit — network error', content: e?.message });
    }
  };

  // ── Monitor: getESSJobStatus ────────────────────────────────────────────────
  const fetchStatus = async (requestId: string): Promise<{ status: string; raw: string }> => {
    const res = await fetch(ERP_URL, {
      method: 'POST', headers: { ...HDRS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ OperationName: 'getESSJobStatus', requestId }),
    });
    const text = await res.text();
    let data: any = null; try { data = JSON.parse(text); } catch { /* non-json */ }
    const status = data?.RequestStatus ?? data?.requestStatus ?? data?.Status ?? (res.ok ? 'UNKNOWN' : `HTTP ${res.status}`);
    return { status: String(status), raw: text };
  };

  const refreshJob = async (requestId: string) => {
    try {
      const { status, raw } = await fetchStatus(requestId);
      setJobs(prev => prev.map(j => j.requestId === requestId ? { ...j, status, response: raw } : j));
    } catch { /* ignore */ }
  };

  const refreshAll = () => jobs.forEach(j => refreshJob(j.requestId));

  const checkById = async () => {
    const id = checkId.trim();
    if (!id) return;
    const { status, raw } = await fetchStatus(id);
    setJobs(prev => {
      if (prev.some(j => j.requestId === id)) return prev.map(j => j.requestId === id ? { ...j, status, response: raw } : j);
      return [{ key: `${id}-manual`, step: '(manual lookup)', requestId: id, status, submittedAt: new Date().toLocaleString(), response: raw }, ...prev];
    });
  };

  // ── Cost Flow tab ───────────────────────────────────────────────────────────
  const flowColumns: ColumnsType<CostStep> = [
    { title: '#', dataIndex: 'seq', width: 44, align: 'center', render: (v) => <Tag color="blue">{v}</Tag> },
    { title: 'Process (ESS job)', dataIndex: 'name', width: 300, render: (v) => <Text strong style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Subledger', dataIndex: 'subledger', width: 150, render: (v) => <Tag>{v}</Tag> },
    { title: 'What it does', dataIndex: 'description', ellipsis: true, render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Job Package', dataIndex: 'jobPackage', width: 220,
      render: (v, r) => <Input size="small" value={v} placeholder="/oracle/apps/ess/scm/…" onChange={e => updateStep(r.key, 'jobPackage', e.target.value)} style={{ fontFamily: 'monospace', fontSize: 11 }} /> },
    { title: 'Job Definition', dataIndex: 'jobDef', width: 200,
      render: (v, r) => <Input size="small" value={v} placeholder="JobDefName" onChange={e => updateStep(r.key, 'jobDef', e.target.value)} style={{ fontFamily: 'monospace', fontSize: 11 }} /> },
    { title: 'Params', dataIndex: 'params', width: 150,
      render: (v, r) => <Input size="small" value={v} placeholder="p1,p2,…" onChange={e => updateStep(r.key, 'params', e.target.value)} style={{ fontSize: 11 }} /> },
  ];

  // ── ESS tab: per-step run + jobs monitor ────────────────────────────────────
  const jobColumns: ColumnsType<EssJob> = [
    { title: 'Request', dataIndex: 'requestId', width: 130, render: (v) => <Text code>{v}</Text> },
    { title: 'Step', dataIndex: 'step', ellipsis: true, render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Status', dataIndex: 'status', width: 130, render: (v) => <Tag color={statusColor(v) as any}>{v}</Tag> },
    { title: 'Submitted', dataIndex: 'submittedAt', width: 170, render: (v) => <Text style={{ fontSize: 11 }}>{v}</Text> },
    { title: '', key: 'act', width: 90, render: (_, r) => <Button size="small" icon={<ReloadOutlined />} onClick={() => refreshJob(r.requestId)}>Status</Button> },
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        <div style={{ padding: '14px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/procurement">Fusion Client</Link> },
            { title: 'Cost Management' },
          ]} />
        </div>

        <div style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <div style={{ width: 48, height: 48, borderRadius: 10, background: `linear-gradient(135deg, ${REDWOOD.primary} 0%, #A33B2C 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarOutlined style={{ fontSize: 24, color: '#fff' }} />
            </div>
            <div>
              <Title level={3} style={{ margin: 0 }}>Cost Management</Title>
              <Text type="secondary">Cost the received items — Receipt & Cost Accounting ESS jobs</Text>
            </div>
          </div>

          <Card size="small" style={{ borderRadius: 8 }}>
            <Tabs
              items={[
                {
                  key: 'flow',
                  label: <Space size={4}><DollarOutlined />Cost Flow</Space>,
                  children: (
                    <>
                      <Alert type="info" showIcon style={{ marginBottom: 12, fontSize: 12 }}
                        message="Costing flow after a PO receipt"
                        description="Run these in order (steps 1–4 are often on a schedule). Fill the Job Package + Job Definition for each from Scheduled Processes → Process Details on your pod; they are saved locally and used by the ESS tab." />
                      <Steps
                        direction="horizontal" size="small" responsive
                        current={-1}
                        style={{ marginBottom: 16 }}
                        items={steps.map(s => ({ title: `${s.seq}`, description: s.name.length > 28 ? s.name.slice(0, 28) + '…' : s.name }))}
                      />
                      <Table rowKey="key" size="small" bordered dataSource={steps} columns={flowColumns} pagination={false} scroll={{ x: 1200 }} />
                    </>
                  ),
                },
                {
                  key: 'ess',
                  label: <Space size={4}><ThunderboltOutlined />ESS Jobs & Monitor</Space>,
                  children: (
                    <>
                      <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Run a step</Text>
                      <Space wrap style={{ marginBottom: 16 }}>
                        {steps.map(s => (
                          <Button key={s.key} icon={<PlayCircleOutlined />} onClick={() => confirmRun(s)}
                            style={{ borderColor: REDWOOD.primary, color: REDWOOD.primary }}>
                            {s.seq}. {s.name.length > 34 ? s.name.slice(0, 34) + '…' : s.name}
                          </Button>
                        ))}
                      </Space>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                        <Text strong style={{ fontSize: 12 }}>Submitted jobs</Text>
                        <Button size="small" icon={<ReloadOutlined />} onClick={refreshAll} disabled={jobs.length === 0}>Refresh all</Button>
                        <span style={{ marginLeft: 'auto' }} />
                        <Input size="small" style={{ width: 180 }} placeholder="Check by Request ID" value={checkId}
                          onChange={e => setCheckId(e.target.value)} onPressEnter={checkById} />
                        <Button size="small" icon={<SearchOutlined />} onClick={checkById}>Check</Button>
                        <Tooltip title="Uses erpintegrations getESSJobStatus"><ApiOutlined style={{ color: REDWOOD.info }} /></Tooltip>
                      </div>
                      <Table rowKey="key" size="small" bordered dataSource={jobs} columns={jobColumns}
                        pagination={{ pageSize: 15 }}
                        expandable={{ expandedRowRender: (r) => (
                          <pre style={{ fontSize: 10.5, background: '#0d0d0d', color: '#79c0ff', borderRadius: 4, padding: 8, margin: 0, maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{r.response || '(no response)'}</pre>
                        ) }}
                        locale={{ emptyText: 'No jobs submitted yet — run a step above' }} />

                      <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginTop: 10 }}>
                        Submit: <Text code style={{ fontSize: 11 }}>POST {ERP_URL}</Text> · OperationName <Text code>submitESSJobRequest</Text>.
                        Monitor: same endpoint · OperationName <Text code>getESSJobStatus</Text>.
                      </div>
                    </>
                  ),
                },
              ]}
            />
          </Card>
        </div>
      </Content>
    </Layout>
  );
};

export default CostManagement;
