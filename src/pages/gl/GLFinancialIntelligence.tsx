import React, { useState, useRef, useEffect } from 'react';
import {
  Layout, Typography, Card, Row, Col, Select, Button, Spin,
  Divider, Input, Tag, Space, Alert, Breadcrumb, Statistic,
} from 'antd';
import {
  HomeOutlined, RobotOutlined, SendOutlined, LineChartOutlined,
  ThunderboltOutlined, WarningOutlined, BulbOutlined, SyncOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { APEX_DB_CONFIG } from '../../config/api.config';

const { Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const BASE = APEX_DB_CONFIG.baseUrl;
const MODEL = 'claude-haiku-4-5';

async function fetchActiveKey(): Promise<string> {
  const res = await fetch(`${BASE}/settings/claudekey`);
  const data = await res.json();
  if (data.status === 'success' && data.apiKey) return data.apiKey as string;
  throw new Error(data.message || 'No active Claude API key found. Go to Administration → Claude AI Key Settings to add one.');
}

interface Period { periodName: string; startDate: string; endDate: string; }
interface GlBalance {
  account: string;
  company: string;
  openingBalance: number;
  periodActivity: number;
  closingBalance: number;
}
interface ChatMessage { role: 'user' | 'assistant'; content: string; }

// ── Claude streaming helper ────────────────────────────────────────────────────
async function streamClaude(
  apiKey: string,
  messages: { role: string; content: string }[],
  systemPrompt: string,
  onChunk: (text: string) => void,
  onDone: () => void,
) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      stream: true,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    onChunk(`⚠️ API error ${res.status}: ${err}`);
    onDone();
    return;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const evt = JSON.parse(data);
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          onChunk(evt.delta.text);
        }
      } catch { /* ignore parse errors */ }
    }
  }
  onDone();
}

// ── Format helpers ─────────────────────────────────────────────────────────────
function fmt(v: number) {
  if (v == null) return '0.00';
  const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `(${abs})` : abs;
}

const SYSTEM_FINANCE = `You are a senior financial controller specialising in Oracle Fusion GL.
You analyse period balances, identify anomalies, and provide concise, actionable commentary.
Always structure your output clearly with headers and bullet points.
Currency is AED. Use professional finance language.`;

// ── Main Component ─────────────────────────────────────────────────────────────
const GLFinancialIntelligence: React.FC = () => {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [balances, setBalances] = useState<GlBalance[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisText, setAnalysisText] = useState('');
  const [keyError, setKeyError] = useState('');

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load periods on mount
  useEffect(() => {
    setLoadingPeriods(true);
    fetch(`${BASE}/gl/fiscalperiods`)
      .then(r => r.json())
      .then(d => {
        const items: Period[] = (d.items ?? d ?? []).map((p: Record<string, unknown>) => ({
          periodName: (p.PERIOD_NAME ?? p.periodName ?? '') as string,
          startDate: (p.START_DATE ?? p.startDate ?? '') as string,
          endDate: (p.END_DATE ?? p.endDate ?? '') as string,
        }));
        setPeriods(items);
        if (items.length > 0) setSelectedPeriod(items[0].periodName);
      })
      .catch(() => {/* silent */})
      .finally(() => setLoadingPeriods(false));
  }, []);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // ── Fetch GL balances for selected period ────────────────────────────────────
  async function fetchBalances(period: string): Promise<GlBalance[]> {
    const url = `${BASE}/gl/balances?P_PERIOD=${encodeURIComponent(period)}&limit=200`;
    const res = await fetch(url);
    const data = await res.json();
    const rows = data.items ?? data ?? [];
    return rows.map((r: Record<string, unknown>) => ({
      account: (r.ACCOUNT ?? r.account ?? '') as string,
      company: (r.COMPANY ?? r.company ?? '') as string,
      openingBalance: Number(r.OPENING_BALANCE ?? r.openingBalance ?? 0),
      periodActivity: Number(r.PERIOD_ACTIVITY ?? r.periodActivity ?? 0),
      closingBalance: Number(r.CLOSING_BALANCE ?? r.closingBalance ?? 0),
    }));
  }

  // ── Analyse period ────────────────────────────────────────────────────────────
  async function handleAnalyse() {
    if (!selectedPeriod) return;
    setAnalyzing(true);
    setAnalysisText('');
    setKeyError('');

    let apiKey = '';
    try {
      apiKey = await fetchActiveKey();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setKeyError(msg);
      setAnalyzing(false);
      return;
    }

    let data: GlBalance[] = [];
    try {
      data = await fetchBalances(selectedPeriod);
      setBalances(data);
    } catch {
      setAnalysisText('⚠️ Could not load GL balances. Check ORDS connectivity.');
      setAnalyzing(false);
      return;
    }

    const totalDebit = data.filter(b => b.periodActivity > 0).reduce((s, b) => s + b.periodActivity, 0);
    const totalCredit = data.filter(b => b.periodActivity < 0).reduce((s, b) => s + Math.abs(b.periodActivity), 0);
    const topMovers = [...data]
      .sort((a, b) => Math.abs(b.periodActivity) - Math.abs(a.periodActivity))
      .slice(0, 10);

    const prompt = `Analyse the following Oracle Fusion GL period data for period "${selectedPeriod}" (currency AED).

## Summary
- Total accounts with activity: ${data.length}
- Period debits total: AED ${fmt(totalDebit)}
- Period credits total: AED ${fmt(totalCredit)}
- Net period activity: AED ${fmt(totalDebit - totalCredit)}

## Top 10 accounts by activity magnitude
${topMovers.map(b =>
  `Account ${b.account} | Opening: ${fmt(b.openingBalance)} | Activity: ${fmt(b.periodActivity)} | Closing: ${fmt(b.closingBalance)}`
).join('\n')}

Please provide:
1. **Period Overview** – a brief narrative of the period's financial activity
2. **Key Movements** – highlight the most significant account movements and their likely business reasons
3. **Anomalies & Risks** – flag any unusual patterns (e.g., accounts with very large swings, credits in expense accounts, or debits in liability accounts)
4. **Recommendations** – 3–5 specific actions the finance team should consider`;

    let result = '';
    await streamClaude(
      apiKey,
      [{ role: 'user', content: prompt }],
      SYSTEM_FINANCE,
      chunk => {
        result += chunk;
        setAnalysisText(result);
      },
      () => setAnalyzing(false),
    );
  }

  // ── Chat send ─────────────────────────────────────────────────────────────────
  async function handleChatSend() {
    const q = chatInput.trim();
    if (!q || chatLoading) return;
    setChatInput('');
    setKeyError('');

    let apiKey = '';
    try {
      apiKey = await fetchActiveKey();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setKeyError(msg);
      return;
    }

    const userMsg: ChatMessage = { role: 'user', content: q };
    setChatMessages(prev => [...prev, userMsg]);
    setChatLoading(true);

    const contextNote = balances.length > 0
      ? `The user has already loaded GL data for period "${selectedPeriod}" (${balances.length} account rows).`
      : 'No GL data has been loaded yet for this session.';

    const history = [...chatMessages, userMsg].map(m => ({ role: m.role, content: m.content }));

    let reply = '';
    const replyMsg: ChatMessage = { role: 'assistant', content: '' };
    setChatMessages(prev => [...prev, replyMsg]);

    await streamClaude(
      apiKey,
      history,
      `${SYSTEM_FINANCE}\n\nContext: ${contextNote}`,
      chunk => {
        reply += chunk;
        setChatMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: reply };
          return updated;
        });
      },
      () => setChatLoading(false),
    );
  }

  // ── KPI cards derived from balances ──────────────────────────────────────────
  const totalActivity = balances.reduce((s, b) => s + b.periodActivity, 0);
  const anomalyCount = balances.filter(b => {
    const swing = Math.abs(b.periodActivity);
    const base = Math.abs(b.openingBalance) || 1;
    return swing / base > 2 && swing > 100000;
  }).length;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Content style={{ padding: '24px' }}>
        <Breadcrumb style={{ marginBottom: 16 }} items={[
          { title: <Link to="/home"><HomeOutlined /> Home</Link> },
          { title: <Link to="/gl">General Ledger</Link> },
          { title: 'Financial Intelligence' },
        ]} />

        {/* ── Header ── */}
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <RobotOutlined style={{ fontSize: 24, color: '#fff' }} />
          </div>
          <div>
            <Title level={3} style={{ margin: 0 }}>Financial Intelligence</Title>
            <Text type="secondary">AI-powered GL analysis · Powered by Claude {MODEL}</Text>
          </div>
          <Tag color="purple" style={{ marginLeft: 'auto' }}>Beta</Tag>
        </div>

        {keyError && (
          <Alert
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            message="Claude API key not available"
            description={
              <span>
                {keyError}&nbsp;
                <Link to="/admin/claude-key">Go to Claude AI Key Settings →</Link>
              </span>
            }
            closable
            onClose={() => setKeyError('')}
            style={{ marginBottom: 24 }}
          />
        )}

        {/* ── Period selector + Analyse ── */}
        <Card style={{ marginBottom: 24, borderRadius: 12 }}>
          <Row gutter={16} align="middle">
            <Col>
              <Text strong>Accounting Period</Text>
            </Col>
            <Col flex="200px">
              <Select
                style={{ width: '100%' }}
                placeholder="Select period"
                loading={loadingPeriods}
                value={selectedPeriod || undefined}
                onChange={setSelectedPeriod}
                options={periods.map(p => ({ value: p.periodName, label: p.periodName }))}
              />
            </Col>
            <Col>
              <Button
                type="primary"
                icon={analyzing ? <SyncOutlined spin /> : <ThunderboltOutlined />}
                loading={analyzing}
                disabled={!selectedPeriod}
                onClick={handleAnalyse}
                style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none' }}
              >
                Analyse Period
              </Button>
            </Col>
          </Row>
        </Card>

        {/* ── KPI row (shown after analysis) ── */}
        {balances.length > 0 && (
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={8}>
              <Card style={{ borderRadius: 12, textAlign: 'center' }}>
                <Statistic
                  title="Accounts with Activity"
                  value={balances.length}
                  prefix={<LineChartOutlined />}
                  valueStyle={{ color: '#667eea' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card style={{ borderRadius: 12, textAlign: 'center' }}>
                <Statistic
                  title="Net Period Activity (AED)"
                  value={Math.abs(totalActivity)}
                  precision={2}
                  prefix={totalActivity < 0 ? '(' : ''}
                  suffix={totalActivity < 0 ? ')' : ''}
                  valueStyle={{ color: totalActivity < 0 ? '#cf1322' : '#3f8600' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card style={{ borderRadius: 12, textAlign: 'center' }}>
                <Statistic
                  title="Potential Anomalies"
                  value={anomalyCount}
                  prefix={<WarningOutlined />}
                  valueStyle={{ color: anomalyCount > 0 ? '#fa8c16' : '#3f8600' }}
                />
              </Card>
            </Col>
          </Row>
        )}

        <Row gutter={24}>
          {/* ── AI Analysis Panel ── */}
          <Col xs={24} lg={14}>
            <Card
              title={<Space><BulbOutlined style={{ color: '#667eea' }} /><span>Period Analysis</span></Space>}
              style={{ borderRadius: 12, minHeight: 400 }}
            >
              {analyzing && !analysisText && (
                <div style={{ textAlign: 'center', padding: 48 }}>
                  <Spin size="large" />
                  <div style={{ marginTop: 16, color: '#888' }}>Loading GL data and generating analysis…</div>
                </div>
              )}
              {!analyzing && !analysisText && (
                <div style={{ textAlign: 'center', padding: 48, color: '#bbb' }}>
                  <RobotOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                  <div>Select a period and click <strong>Analyse Period</strong> to generate AI insights</div>
                </div>
              )}
              {analysisText && (
                <div style={{
                  fontFamily: 'inherit', whiteSpace: 'pre-wrap', lineHeight: 1.8,
                  fontSize: 14, color: '#1a1a1a',
                }}>
                  {analysisText}
                  {analyzing && <span style={{ display: 'inline-block', width: 2, height: 14, background: '#667eea', animation: 'blink 1s step-end infinite', marginLeft: 2 }} />}
                </div>
              )}
            </Card>
          </Col>

          {/* ── AI Chat Panel ── */}
          <Col xs={24} lg={10}>
            <Card
              title={<Space><RobotOutlined style={{ color: '#764ba2' }} /><span>Ask the AI</span></Space>}
              style={{ borderRadius: 12, minHeight: 400 }}
              bodyStyle={{ display: 'flex', flexDirection: 'column', height: 520 }}
            >
              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0', marginBottom: 12 }}>
                {chatMessages.length === 0 && (
                  <div style={{ color: '#bbb', textAlign: 'center', paddingTop: 40 }}>
                    <RobotOutlined style={{ fontSize: 32, marginBottom: 8 }} />
                    <div>Ask anything about your GL data</div>
                    <div style={{ fontSize: 12, marginTop: 8 }}>
                      e.g. "Why is account 21100 showing a large credit?" or "Summarise the period activity"
                    </div>
                  </div>
                )}
                {chatMessages.map((m, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                    marginBottom: 12,
                  }}>
                    <div style={{
                      maxWidth: '85%',
                      padding: '10px 14px',
                      borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: m.role === 'user'
                        ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                        : '#f5f5f5',
                      color: m.role === 'user' ? '#fff' : '#1a1a1a',
                      fontSize: 13,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                    }}>
                      {m.content || <Spin size="small" />}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <Divider style={{ margin: '0 0 12px' }} />

              {/* Input */}
              <div style={{ display: 'flex', gap: 8 }}>
                <TextArea
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                  placeholder="Ask a financial question… (Enter to send, Shift+Enter for newline)"
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  style={{ flex: 1, borderRadius: 8 }}
                  disabled={chatLoading}
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={handleChatSend}
                  loading={chatLoading}
                  disabled={!chatInput.trim()}
                  style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    border: 'none', borderRadius: 8,
                  }}
                />
              </div>
            </Card>
          </Col>
        </Row>

        <style>{`
          @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        `}</style>
      </Content>
    </Layout>
  );
};

export default GLFinancialIntelligence;
