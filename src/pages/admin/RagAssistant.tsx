import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Layout, Breadcrumb, Typography, Button, Input, Space, Tag, Tooltip,
  Upload, List, Popconfirm, message, Spin, Tabs, Badge, Divider, Select,
  Empty, Card,
} from 'antd';
import {
  HomeOutlined, RobotOutlined, SendOutlined, UploadOutlined, DeleteOutlined,
  FileTextOutlined, FilePdfOutlined, FileWordOutlined, ReloadOutlined,
  DatabaseOutlined, BookOutlined, ThunderboltOutlined, ClearOutlined,
  ApiOutlined, LinkOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';

const { Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const REDWOOD = {
  primary: '#C74634', success: '#1D7B4D', warning: '#D4A800', info: '#0572CE',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral600: '#6B6B6B',
  neutral900: '#1A1A1A', surface: '#FFFFFF',
};

// ── Types ──────────────────────────────────────────────────────────────────────
interface RagDoc {
  id: number;
  name: string;
  type: string;
  size_bytes: number;
  chunk_count: number;
  created_at: string;
}

type MessageRole = 'user' | 'assistant';
type QueryMode = 'auto' | 'docs' | 'erp';

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  type?: 'text' | 'docs' | 'erp_data';
  sources?: string[];
  chunks?: { docName: string; snippet: string }[];
  apiUrl?: string;
  apiDesc?: string;
  recordCount?: number;
  rawData?: any[];
  error?: boolean;
  ts: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtBytes = (b: number) => b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
const fmtDate  = (d: string)  => dayjs(d).format('D-MMM-YYYY HH:mm');
const uid      = ()           => Math.random().toString(36).slice(2);

const fileIcon = (name: string) => {
  const e = name.split('.').pop()?.toLowerCase();
  if (e === 'pdf')  return <FilePdfOutlined  style={{ color: '#e53e3e' }} />;
  if (e === 'docx' || e === 'doc') return <FileWordOutlined style={{ color: '#2b6cb0' }} />;
  return <FileTextOutlined style={{ color: REDWOOD.neutral600 }} />;
};

const MODE_OPTIONS = [
  { value: 'auto',  label: 'Auto',     icon: <ThunderboltOutlined />, tip: 'Automatically routes to docs or ERP data' },
  { value: 'docs',  label: 'Docs',     icon: <BookOutlined />,        tip: 'Search uploaded documents only' },
  { value: 'erp',   label: 'ERP Data', icon: <DatabaseOutlined />,    tip: 'Query live ERP data in natural language' },
];

// ── Message bubble ─────────────────────────────────────────────────────────────
const MsgBubble: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
  const isUser = msg.role === 'user';
  const [showData, setShowData] = useState(false);

  return (
    <div style={{
      display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 12, alignItems: 'flex-start', gap: 8,
    }}>
      {!isUser && (
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #722ed1 0%, #531dab 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <RobotOutlined style={{ color: '#fff', fontSize: 15 }} />
        </div>
      )}

      <div style={{ maxWidth: '78%' }}>
        <div style={{
          padding: '10px 14px', borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          background: isUser ? '#722ed1' : msg.error ? '#fff2f0' : REDWOOD.surface,
          color: isUser ? '#fff' : REDWOOD.neutral900,
          border: !isUser ? `1px solid ${msg.error ? '#ffccc7' : REDWOOD.neutral200}` : 'none',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {msg.content}
        </div>

        {/* ERP data badge */}
        {msg.type === 'erp_data' && msg.apiDesc && (
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Tag icon={<DatabaseOutlined />} color="blue" style={{ fontSize: 11 }}>
              {msg.recordCount} record{msg.recordCount !== 1 ? 's' : ''}
            </Tag>
            <Tooltip title={msg.apiUrl}>
              <Tag icon={<ApiOutlined />} color="geekblue" style={{ fontSize: 11, cursor: 'pointer' }}
                onClick={() => setShowData(v => !v)}>
                {msg.apiDesc}
              </Tag>
            </Tooltip>
            {msg.rawData && msg.rawData.length > 0 && (
              <Button type="link" size="small" style={{ fontSize: 11, padding: 0 }}
                onClick={() => setShowData(v => !v)}>
                {showData ? 'Hide' : 'Show'} raw data
              </Button>
            )}
          </div>
        )}

        {/* Raw data */}
        {showData && msg.rawData && (
          <pre style={{
            marginTop: 6, padding: '8px 12px', background: '#1e1e2e', color: '#cdd6f4',
            borderRadius: 6, fontSize: 11, overflowX: 'auto', maxHeight: 240,
          }}>
            {JSON.stringify(msg.rawData.slice(0, 10), null, 2)}
            {msg.rawData.length > 10 && `\n... and ${msg.rawData.length - 10} more records`}
          </pre>
        )}

        {/* Doc sources */}
        {msg.sources && msg.sources.length > 0 && (
          <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {msg.sources.map(s => (
              <Tag key={s} icon={<BookOutlined />} style={{ fontSize: 11 }}>{s}</Tag>
            ))}
          </div>
        )}

        <div style={{ fontSize: 10, color: '#bbb', marginTop: 4, textAlign: isUser ? 'right' : 'left' }}>
          {dayjs(msg.ts).format('HH:mm')}
        </div>
      </div>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const RagAssistant: React.FC = () => {
  const [docs, setDocs]             = useState<RagDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading]   = useState(false);

  const [messages, setMessages]     = useState<ChatMessage[]>([
    {
      id: uid(), role: 'assistant', content:
        "Hi! I'm your ERP AI Assistant. I can:\n\n• Answer questions from your uploaded documents (manuals, SOPs, policies)\n• Query live ERP data in natural language — e.g. \"show me all unpaid AP invoices this month\"\n\nUpload documents in the Knowledge Base tab, then ask me anything.",
      type: 'text', ts: Date.now(),
    },
  ]);
  const [input, setInput]           = useState('');
  const [thinking, setThinking]     = useState(false);
  const [mode, setMode]             = useState<QueryMode>('auto');
  const [activeTab, setActiveTab]   = useState('chat');
  const chatEndRef                  = useRef<HTMLDivElement>(null);
  const inputRef                    = useRef<any>(null);

  const isElectron = !!(window as any).electronAPI?.ragQuery;

  const loadDocs = useCallback(async () => {
    if (!isElectron) return;
    setDocsLoading(true);
    try {
      const res = await (window as any).electronAPI.ragListDocs();
      if (res.success) setDocs(res.docs ?? []);
    } finally {
      setDocsLoading(false);
    }
  }, [isElectron]);

  useEffect(() => { loadDocs(); }, [loadDocs]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Upload ───────────────────────────────────────────────────────────────
  const handleUpload = async (file: File) => {
    if (!isElectron) { message.warning('File upload requires the Electron desktop app.'); return false; }
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const res = await (window as any).electronAPI.ragIngestFile({
        buffer:   Array.from(new Uint8Array(buffer)),
        filename: file.name,
        mimeType: file.type,
      });
      if (res.success) {
        message.success(`"${file.name}" ingested — ${res.chunkCount} chunks created.`);
        loadDocs();
      } else {
        message.error(res.error || 'Ingestion failed.');
      }
    } catch (e: any) {
      message.error('Error: ' + e.message);
    } finally {
      setUploading(false);
    }
    return false;
  };

  const handleDeleteDoc = async (doc: RagDoc) => {
    const res = await (window as any).electronAPI.ragDeleteDoc({ docId: doc.id });
    if (res.success) { message.success(`"${doc.name}" removed.`); loadDocs(); }
    else message.error(res.error || 'Delete failed.');
  };

  // ── Chat ─────────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    const q = input.trim();
    if (!q || thinking) return;

    if (!isElectron) {
      message.warning('AI Assistant requires the Electron desktop app.');
      return;
    }

    const userMsg: ChatMessage = { id: uid(), role: 'user', content: q, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setThinking(true);

    // Build history for context (last 6 exchanges)
    const history = messages.slice(-12).map(m => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const res = await (window as any).electronAPI.ragQuery({ question: q, mode, history });
      if (res.success) {
        setMessages(prev => [...prev, {
          id: uid(), role: 'assistant',
          content:     res.answer,
          type:        res.type,
          sources:     res.sources,
          chunks:      res.chunks,
          apiUrl:      res.apiUrl,
          apiDesc:     res.apiDesc,
          recordCount: res.recordCount,
          rawData:     res.rawData,
          ts: Date.now(),
        }]);
      } else {
        setMessages(prev => [...prev, {
          id: uid(), role: 'assistant',
          content: res.error || 'Something went wrong.',
          error: true, ts: Date.now(),
        }]);
      }
    } catch (e: any) {
      setMessages(prev => [...prev, {
        id: uid(), role: 'assistant',
        content: 'Network error: ' + e.message,
        error: true, ts: Date.now(),
      }]);
    } finally {
      setThinking(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // ── Suggested prompts ─────────────────────────────────────────────────────
  const suggestions = mode === 'erp' ? [
    'Show all unreconciled bank statement lines',
    'List AP invoices unpaid this month',
    'Show bank transfers in the last 30 days',
    'External transactions this week',
  ] : mode === 'docs' ? [
    'How do I reconcile a bank statement?',
    'What is the AP invoice approval process?',
    'Explain the chart of accounts structure',
  ] : [
    'How do I create a bank transfer?',
    'Show all pending AP payments',
    'What is the bank reconciliation process?',
    'List external transactions this week',
  ];

  const totalChunks = docs.reduce((s, d) => s + d.chunk_count, 0);

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        <div style={{ padding: '14px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/admin">Administration</Link> },
            { title: 'AI Assistant' },
          ]} />
        </div>

        <div style={{ height: 'calc(100vh - 113px)', display: 'flex', overflow: 'hidden' }}>

          {/* ── Left sidebar — docs ── */}
          <div style={{
            width: 280, flexShrink: 0, background: REDWOOD.surface,
            borderRight: `1px solid ${REDWOOD.neutral200}`,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Sidebar header */}
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 8,
                  background: 'linear-gradient(135deg, #722ed1 0%, #531dab 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <RobotOutlined style={{ color: '#fff', fontSize: 16 }} />
                </div>
                <div>
                  <Text strong style={{ fontSize: 14 }}>AI Assistant</Text>
                  <div style={{ fontSize: 11, color: REDWOOD.neutral600 }}>
                    {docs.length} doc{docs.length !== 1 ? 's' : ''} · {totalChunks} chunks
                  </div>
                </div>
              </div>

              <Upload
                beforeUpload={handleUpload}
                showUploadList={false}
                accept=".pdf,.doc,.docx,.txt,.md,.csv"
                disabled={!isElectron || uploading}
              >
                <Button
                  block icon={uploading ? <Spin size="small" /> : <UploadOutlined />}
                  disabled={!isElectron || uploading}
                  style={{ borderStyle: 'dashed' }}
                >
                  {uploading ? 'Processing…' : 'Upload Document'}
                </Button>
              </Upload>
              <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginTop: 4, textAlign: 'center' }}>
                PDF, Word, TXT, MD, CSV
              </div>
            </div>

            {/* Doc list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {docsLoading ? (
                <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
              ) : docs.length === 0 ? (
                <Empty description={<Text style={{ fontSize: 12 }}>No documents yet</Text>}
                  image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '24px 16px' }} />
              ) : (
                <List
                  size="small"
                  dataSource={docs}
                  renderItem={(doc) => (
                    <List.Item
                      style={{ padding: '6px 12px', border: 'none' }}
                      actions={[
                        <Popconfirm
                          title="Remove this document?"
                          onConfirm={() => handleDeleteDoc(doc)}
                          okText="Remove" okButtonProps={{ danger: true }}
                        >
                          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>,
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<span style={{ fontSize: 18 }}>{fileIcon(doc.name)}</span>}
                        title={
                          <Tooltip title={doc.name}>
                            <Text style={{ fontSize: 12, fontWeight: 500 }} ellipsis>
                              {doc.name.length > 28 ? doc.name.slice(0, 28) + '…' : doc.name}
                            </Text>
                          </Tooltip>
                        }
                        description={
                          <Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>
                            {doc.chunk_count} chunks · {fmtBytes(doc.size_bytes)}
                          </Text>
                        }
                      />
                    </List.Item>
                  )}
                />
              )}
            </div>

            {docs.length > 0 && (
              <div style={{ padding: '8px 12px', borderTop: `1px solid ${REDWOOD.neutral200}` }}>
                <Button size="small" block icon={<ReloadOutlined />} onClick={loadDocs}>
                  Refresh
                </Button>
              </div>
            )}
          </div>

          {/* ── Right panel — chat ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Chat toolbar */}
            <div style={{
              padding: '10px 20px', background: REDWOOD.surface,
              borderBottom: `1px solid ${REDWOOD.neutral200}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <Space>
                <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Mode:</Text>
                {MODE_OPTIONS.map(opt => (
                  <Tooltip key={opt.value} title={opt.tip}>
                    <Button
                      size="small"
                      type={mode === opt.value ? 'primary' : 'default'}
                      icon={opt.icon}
                      onClick={() => setMode(opt.value as QueryMode)}
                      style={mode === opt.value ? { background: '#722ed1', borderColor: '#722ed1' } : {}}
                    >
                      {opt.label}
                    </Button>
                  </Tooltip>
                ))}
              </Space>
              <Tooltip title="Clear conversation">
                <Button size="small" icon={<ClearOutlined />}
                  onClick={() => setMessages([{
                    id: uid(), role: 'assistant',
                    content: 'Conversation cleared. Ask me anything!',
                    type: 'text', ts: Date.now(),
                  }])}>
                  Clear
                </Button>
              </Tooltip>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {messages.map(msg => <MsgBubble key={msg.id} msg={msg} />)}

              {thinking && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #722ed1 0%, #531dab 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <RobotOutlined style={{ color: '#fff', fontSize: 15 }} />
                  </div>
                  <div style={{
                    padding: '10px 16px', borderRadius: '18px 18px 18px 4px',
                    background: REDWOOD.surface, border: `1px solid ${REDWOOD.neutral200}`,
                    display: 'flex', gap: 4, alignItems: 'center',
                  }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{
                        width: 6, height: 6, borderRadius: '50%', background: '#722ed1',
                        animation: 'bounce 1.2s ease-in-out infinite',
                        animationDelay: `${i * 0.2}s`,
                      }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Suggestions */}
            {messages.length <= 2 && !thinking && (
              <div style={{ padding: '0 20px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {suggestions.map(s => (
                  <Button key={s} size="small" onClick={() => { setInput(s); inputRef.current?.focus(); }}
                    style={{ fontSize: 11, borderRadius: 12 }}>
                    {s}
                  </Button>
                ))}
              </div>
            )}

            {/* Input area */}
            <div style={{
              padding: '12px 20px', background: REDWOOD.surface,
              borderTop: `1px solid ${REDWOOD.neutral200}`,
            }}>
              {!isElectron && (
                <div style={{ marginBottom: 8, padding: '6px 12px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 6, fontSize: 12 }}>
                  AI Assistant requires the Electron desktop app.
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <TextArea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder={
                    mode === 'erp'  ? 'Ask about ERP data… e.g. "Show unpaid AP invoices this month"' :
                    mode === 'docs' ? 'Ask about your documents… e.g. "How do I reconcile a bank statement?"' :
                    'Ask anything… documents or live ERP data'
                  }
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  disabled={!isElectron || thinking}
                  style={{ borderRadius: 20, resize: 'none', paddingRight: 12 }}
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={sendMessage}
                  disabled={!input.trim() || !isElectron || thinking}
                  style={{ background: '#722ed1', borderColor: '#722ed1', borderRadius: 20, height: 'auto', minHeight: 32 }}
                />
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: '#bbb', textAlign: 'center' }}>
                Enter to send · Shift+Enter for new line · Mode: <strong>{MODE_OPTIONS.find(m => m.value === mode)?.label}</strong>
              </div>
            </div>
          </div>
        </div>
      </Content>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </Layout>
  );
};

export default RagAssistant;
