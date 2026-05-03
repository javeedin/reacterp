import React, { useState } from 'react';
import {
  Button, Drawer, Table, Tag, Space, Alert, Tooltip, Typography, Divider, Badge,
} from 'antd';
import {
  RobotOutlined, CheckOutlined, CloseOutlined, ThunderboltOutlined, SyncOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

// ── Types mirrored from BankReconciliation ────────────────────────────────────
interface StmtLine {
  lineId: number;
  statementId: number;
  amount: number;
  transactionDate?: string;
  referenceNumber?: string;
  transactionRef?: string;
  reference?: string;
  description?: string;
  reconStatus?: string;
}

interface SysTxn {
  txnId: number;
  txnNumber: string;
  source: string;
  amount: number;
  txnDate?: string;
  reference?: string;
  referenceText?: string;
  payee?: string;
  reconciledFlag?: string;
}

interface AgentMatch {
  stmtLineId: number;
  stmtAmount: number;
  stmtDate: string;
  stmtRef: string;
  txnId: number;
  txnSource: string;
  txnNumber: string;
  txnAmount: number;
  txnDate: string;
  txnRef: string;
  confidence: number;
  reason: string;
}

interface ReconAgentProps {
  stmtLines: StmtLine[];
  sysTxns: SysTxn[];
  bankAccount?: string;
  disabled?: boolean;
  onApplyMatches: (pairs: { stmtLineId: number; txnId: number }[]) => Promise<void>;
}

const SOURCE_LABEL: Record<string, string> = {
  AP_PAYMENT: 'AP Payment',
  AR_RECEIPT: 'AR Receipt',
  GL_JOURNAL: 'GL Journal',
  ORA_MAN:    'Ext Txn',
};

const confidenceColor = (c: number) =>
  c >= 95 ? 'green' : c >= 80 ? 'blue' : c >= 65 ? 'orange' : 'red';

const fmtAmt = (v: number) =>
  new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

// ── Component ────────────────────────────────────────────────────────────────
const ReconAgent: React.FC<ReconAgentProps> = ({
  stmtLines,
  sysTxns,
  bankAccount,
  disabled,
  onApplyMatches,
}) => {
  const [open,     setOpen]     = useState(false);
  const [running,  setRunning]  = useState(false);
  const [applying, setApplying] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [matches,  setMatches]  = useState<AgentMatch[]>([]);
  const [summary,  setSummary]  = useState('');
  const [unmatchedStmt, setUnmatchedStmt] = useState<number[]>([]);
  const [unmatchedTxn,  setUnmatchedTxn]  = useState<number[]>([]);

  // Which matches the user has accepted / rejected (by index)
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [rejected, setRejected] = useState<Set<number>>(new Set());

  const unreconciledStmt = stmtLines.filter(l => l.reconStatus !== 'RECONCILED');
  const unreconciledSys  = sysTxns.filter(t => !t.reconciledFlag || t.reconciledFlag === 'N');

  const handleOpen = () => {
    setOpen(true);
    setError(null);
    setMatches([]);
    setSummary('');
    setAccepted(new Set());
    setRejected(new Set());
  };

  const handleRun = async () => {
    const api = (window as any).electronAPI;
    if (!api?.claudeReconAgent) {
      setError('AI Agent requires the Electron desktop app. Not available in browser mode.');
      return;
    }
    if (unreconciledStmt.length === 0) {
      setError('No unreconciled statement lines to match.');
      return;
    }

    setRunning(true);
    setError(null);
    setMatches([]);
    setSummary('');
    setAccepted(new Set());
    setRejected(new Set());

    try {
      const result = await api.claudeReconAgent({
        stmtLines: unreconciledStmt,
        sysTxns:   unreconciledSys,
        bankAccount: bankAccount ?? '',
      });

      if (!result.success) {
        setError(result.error || 'Agent returned an error.');
        return;
      }

      const m: AgentMatch[] = result.matches ?? [];
      setMatches(m);
      setSummary(result.summary ?? '');
      setUnmatchedStmt(result.unmatchedStmt ?? []);
      setUnmatchedTxn(result.unmatchedTxn ?? []);

      // Auto-accept high-confidence (≥ 95) matches
      const autoAccept = new Set<number>(
        m.map((_, i) => i).filter(i => m[i].confidence >= 95)
      );
      setAccepted(autoAccept);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  const toggle = (idx: number) => {
    setAccepted(prev => {
      const next = new Set(prev);
      if (next.has(idx)) { next.delete(idx); } else { next.add(idx); }
      return next;
    });
    setRejected(prev => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
  };

  const reject = (idx: number) => {
    setRejected(prev => new Set([...prev, idx]));
    setAccepted(prev => { const next = new Set(prev); next.delete(idx); return next; });
  };

  const handleApply = async () => {
    const pairs = matches
      .map((m, i) => ({ m, i }))
      .filter(({ i }) => accepted.has(i) && !rejected.has(i))
      .map(({ m }) => ({ stmtLineId: m.stmtLineId, txnId: m.txnId }));
    if (pairs.length === 0) return;
    setApplying(true);
    try {
      await onApplyMatches(pairs);
      setOpen(false);
    } finally {
      setApplying(false);
    }
  };

  const acceptedCount = [...accepted].filter(i => !rejected.has(i)).length;
  const hasRun = matches.length > 0 || unmatchedStmt.length > 0 || !!summary;

  const columns = [
    {
      title: 'Stmt Line',
      width: 110,
      render: (_: any, m: AgentMatch) => (
        <div>
          <Text strong style={{ fontSize: 12 }}>#{m.stmtLineId}</Text>
          <div style={{ fontSize: 11, color: '#666' }}>{m.stmtDate}</div>
          <Text style={{ fontSize: 12, color: '#1D7B4D', fontWeight: 600 }}>{fmtAmt(m.stmtAmount)}</Text>
          {m.stmtRef && <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>{m.stmtRef}</div>}
        </div>
      ),
    },
    {
      title: '',
      width: 24,
      render: () => <span style={{ fontSize: 16, color: '#aaa' }}>⇄</span>,
    },
    {
      title: 'System Txn',
      render: (_: any, m: AgentMatch) => (
        <div>
          <Space size={4}>
            <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>{SOURCE_LABEL[m.txnSource] ?? m.txnSource}</Tag>
            <Text style={{ fontSize: 12, fontWeight: 600 }}>#{m.txnNumber}</Text>
          </Space>
          <div style={{ fontSize: 11, color: '#666' }}>{m.txnDate}</div>
          <Text style={{ fontSize: 12, color: '#1D7B4D', fontWeight: 600 }}>{fmtAmt(m.txnAmount)}</Text>
          {m.txnRef && <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>{m.txnRef}</div>}
        </div>
      ),
    },
    {
      title: 'Confidence',
      width: 90,
      align: 'center' as const,
      render: (_: any, m: AgentMatch) => (
        <div style={{ textAlign: 'center' }}>
          <Tag color={confidenceColor(m.confidence)} style={{ fontSize: 12, fontWeight: 700, margin: 0 }}>
            {m.confidence}%
          </Tag>
          <Tooltip title={m.reason}>
            <div style={{ fontSize: 10, color: '#888', marginTop: 2, cursor: 'help' }}>why?</div>
          </Tooltip>
        </div>
      ),
    },
    {
      title: 'Action',
      width: 90,
      align: 'center' as const,
      render: (_: any, m: AgentMatch, idx: number) => {
        const isAcc = accepted.has(idx) && !rejected.has(idx);
        const isRej = rejected.has(idx);
        return (
          <Space size={4}>
            <Tooltip title={isAcc ? 'Accepted' : 'Accept'}>
              <Button
                size="small"
                type={isAcc ? 'primary' : 'default'}
                icon={<CheckOutlined />}
                onClick={() => toggle(idx)}
                style={isAcc ? { background: '#1D7B4D', borderColor: '#1D7B4D' } : {}}
              />
            </Tooltip>
            <Tooltip title="Reject">
              <Button
                size="small"
                danger={isRej}
                icon={<CloseOutlined />}
                onClick={() => reject(idx)}
              />
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  return (
    <>
      <Tooltip title={unreconciledStmt.length === 0 ? 'No unreconciled lines' : 'AI match suggestions'}>
        <Button
          icon={<RobotOutlined />}
          size="large"
          disabled={disabled || unreconciledStmt.length === 0}
          onClick={handleOpen}
          style={{ borderColor: '#722ed1', color: '#722ed1' }}
        >
          AI Suggest
        </Button>
      </Tooltip>

      <Drawer
        title={
          <Space>
            <RobotOutlined style={{ color: '#722ed1', fontSize: 16 }} />
            <span>AI Reconciliation Agent</span>
            {running && <SyncOutlined spin style={{ color: '#722ed1' }} />}
          </Space>
        }
        open={open}
        onClose={() => { if (!running && !applying) setOpen(false); }}
        width={680}
        styles={{ body: { padding: '16px 20px' } }}
        footer={
          matches.length > 0 ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: '#666' }}>
                {acceptedCount} of {matches.length} matches selected
              </Text>
              <Space>
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  loading={applying}
                  disabled={acceptedCount === 0}
                  onClick={handleApply}
                  style={{ background: '#1D7B4D', borderColor: '#1D7B4D' }}
                >
                  Reconcile {acceptedCount} Match{acceptedCount !== 1 ? 'es' : ''}
                </Button>
                <Button onClick={() => setOpen(false)} disabled={applying}>Close</Button>
              </Space>
            </div>
          ) : (
            <Button onClick={() => setOpen(false)}>Close</Button>
          )
        }
      >
        {/* Intro / Run section */}
        <div style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 13, color: '#444', display: 'block', marginBottom: 12 }}>
            Claude AI will analyse <strong>{unreconciledStmt.length}</strong> unreconciled statement line{unreconciledStmt.length !== 1 ? 's' : ''} against{' '}
            <strong>{unreconciledSys.length}</strong> system transaction{unreconciledSys.length !== 1 ? 's' : ''} and suggest matches.
          </Text>
          <Button
            type="primary"
            icon={running ? <SyncOutlined spin /> : <ThunderboltOutlined />}
            loading={running}
            onClick={handleRun}
            disabled={running || unreconciledStmt.length === 0}
            style={{ background: '#722ed1', borderColor: '#722ed1' }}
          >
            {running ? 'Analysing…' : hasRun ? 'Re-run Analysis' : 'Run AI Analysis'}
          </Button>
        </div>

        {error && (
          <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} closable onClose={() => setError(null)} />
        )}

        {/* Summary */}
        {summary && (
          <Alert
            type="info"
            message={summary}
            showIcon
            style={{ marginBottom: 16 }}
            icon={<RobotOutlined />}
          />
        )}

        {/* Match table */}
        {matches.length > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong style={{ fontSize: 13 }}>
                Suggested Matches
                <Badge count={matches.length} style={{ marginLeft: 8, background: '#722ed1' }} />
              </Text>
              <Space size={4}>
                <Button size="small" onClick={() => setAccepted(new Set(matches.map((_, i) => i)))}>
                  Accept All
                </Button>
                <Button size="small" onClick={() => setAccepted(new Set())}>
                  Clear All
                </Button>
              </Space>
            </div>

            <Table
              size="small"
              dataSource={matches}
              rowKey={(_, i) => String(i)}
              columns={columns}
              pagination={false}
              rowClassName={(_, i) => accepted.has(i) && !rejected.has(i) ? 'agent-row-accepted' : rejected.has(i) ? 'agent-row-rejected' : ''}
              style={{ marginBottom: 16 }}
            />

            <style>{`
              .agent-row-accepted td { background: #f6ffed !important; }
              .agent-row-rejected td { background: #fff2f0 !important; opacity: 0.5; }
            `}</style>
          </>
        )}

        {/* Unmatched summary */}
        {hasRun && !running && (
          <>
            {unmatchedStmt.length > 0 && (
              <Alert
                type="warning"
                showIcon
                message={`${unmatchedStmt.length} statement line${unmatchedStmt.length !== 1 ? 's' : ''} could not be matched — needs manual review`}
                style={{ marginBottom: 8 }}
              />
            )}
            {unmatchedTxn.length > 0 && (
              <Alert
                type="warning"
                showIcon
                message={`${unmatchedTxn.length} system transaction${unmatchedTxn.length !== 1 ? 's' : ''} have no matching statement line`}
              />
            )}
            {matches.length === 0 && !error && (
              <Alert type="info" showIcon message="No confident matches found. All lines may need manual reconciliation." />
            )}
          </>
        )}

        <Divider style={{ margin: '16px 0 8px' }} />
        <Text style={{ fontSize: 11, color: '#aaa' }}>
          Matches ≥ 95% confidence are auto-selected. Review and adjust before reconciling.
          Claude AI key is loaded from your Oracle APEX RR_CLAUDE_KEY table.
        </Text>
      </Drawer>
    </>
  );
};

export default ReconAgent;
