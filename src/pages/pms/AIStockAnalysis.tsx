import React, { useState, useCallback, useEffect } from 'react';
import {
  Layout, Card, Row, Col, Typography, Space, Button, Spin, Divider, Tag,
  Breadcrumb, Tabs, Empty, message, Drawer, Tooltip, Badge,
} from 'antd';
import {
  HomeOutlined, ArrowLeftOutlined, ReloadOutlined, SettingOutlined,
  RiseOutlined, FallOutlined, BulbOutlined, ShoppingCartOutlined,
  DeleteOutlined, CopyOutlined,
} from '@ant-design/icons';
import type { TabsProps } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ApiKeySettingsModal, getSavedApiKey } from '../../components/ApiKeySettingsModal';

const { Content } = Layout;
const { Title, Text, Paragraph } = Typography;

const COLORS = {
  primary: '#C74634',
  green: '#1D7B4D',
  red: '#D32F2F',
  blue: '#1565C0',
  orange: '#E65100',
};

interface StockData {
  symbol: string;
  symbolName: string;
  exchange: string;
  cmp: number;
  qty: number;
  shareType: string;
}

interface AnalysisResult {
  news: string;
  trends: string;
  marketPrice: string;
  financials: string;
  recommendations: {
    action: 'BUY' | 'SELL' | 'HOLD';
    targetPrice: number;
    confidence: number;
    reasoning: string;
  };
}

export default function AIStockAnalysis() {
  const navigate = useNavigate();
  const [stock, setStock] = useState<StockData | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState<string>(getSavedApiKey() || '');
  const [msgApi, ctxHolder] = message.useMessage();
  const [logs, setLogs] = useState<Array<{ time: string; level: 'info' | 'error' | 'success' | 'warn'; message: string; details?: string }>>([]);

  const addLog = useCallback((level: 'info' | 'error' | 'success' | 'warn', message: string, details?: string) => {
    const now = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { time: now, level, message, details }]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  useEffect(() => {
    const stockData = localStorage.getItem('selectedStock');
    if (stockData) {
      try {
        setStock(JSON.parse(stockData));
      } catch {
        msgApi.error('Failed to load stock data');
        navigate('/pms/holdings');
      }
    } else {
      navigate('/pms/holdings');
    }
  }, [navigate, msgApi]);

  const analyzeStock = useCallback(async () => {
    if (!stock) return;
    if (!apiKey) {
      addLog('error', 'API key not configured', 'Please set your Claude API key in settings');
      msgApi.error('Please set your Claude API key first');
      setSettingsOpen(true);
      return;
    }

    setLoading(true);
    clearLogs();

    try {
      addLog('info', 'Starting stock analysis', `Analyzing ${stock.symbol}`);

      const prompt = `You are a stock analysis AI. Analyze the stock ${stock.symbol} (${stock.symbolName}) listed on ${stock.exchange}.
      Current Price: ₹${stock.cmp}
      Quantity Held: ${stock.qty}

      IMPORTANT: Return ONLY valid JSON with NO markdown, NO disclaimers, NO extra text.

      Provide analysis for these EXACT keys:
      - news: String with latest news and updates
      - trends: String with market trends and technical indicators
      - marketPrice: String with price analysis and movements
      - financials: String with recent financial results
      - recommendations: Object with:
        * action: "BUY" or "SELL" or "HOLD"
        * targetPrice: Number
        * confidence: Number (0-100)
        * reasoning: String

      Return ONLY the JSON object, nothing else.`;

      addLog('info', 'Sending request to Claude API', `Model: claude-opus-5, Max Tokens: 2000`);

      const requestBody = {
        model: 'claude-opus-5',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      };

      addLog('info', 'Request body prepared', JSON.stringify(requestBody, null, 2));

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      addLog('info', 'Response received', `Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: 'Failed to parse error response' } }));
        addLog('error', `API error: ${response.status}`, JSON.stringify(errorData, null, 2));
        throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      addLog('success', 'Response parsed successfully', `Status: ${data.stop_reason}, Tokens: ${data.usage?.output_tokens}`);

      const textBlock = data.content?.find((c: any) => c.type === 'text');
      const content = textBlock?.text;

      if (!content) {
        addLog('error', 'No text content in response', `Response structure: ${JSON.stringify(data.content, null, 2)}`);
        throw new Error('No text content in Claude API response');
      }

      addLog('info', 'Content extracted', content.substring(0, 300) + (content.length > 300 ? '...' : ''));

      let jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
      if (!jsonMatch) {
        jsonMatch = content.match(/\{[\s\S]*?\n\}/);
      }
      if (!jsonMatch) {
        jsonMatch = content.match(/\{[\s\S]*\}/);
      }

      if (!jsonMatch) {
        addLog('error', 'Failed to extract JSON from response', `First 500 chars: ${content.substring(0, 500)}`);
        throw new Error('Failed to extract JSON from API response');
      }

      let jsonText = jsonMatch[1] || jsonMatch[0];
      addLog('info', 'JSON extracted', `Length: ${jsonText.length}, First 200 chars: ${jsonText.substring(0, 200)}...`);

      try {
        let parsed = JSON.parse(jsonText);
        setAnalysis(parsed);
        addLog('success', 'Analysis completed successfully', `Parsed analysis with keys: ${Object.keys(parsed).join(', ')}`);
        msgApi.success('Analysis completed');
      } catch (parseError) {
        addLog('warn', 'JSON parse error, attempting cleanup', `Error: ${parseError instanceof Error ? parseError.message : 'Unknown'}`);

        try {
          const cleanedJson = jsonText
            .replace(/,\s*}/g, '}')
            .replace(/,\s*]/g, ']')
            .replace(/'/g, '"');

          addLog('info', 'Attempting to parse cleaned JSON', `Cleaned length: ${cleanedJson.length}`);
          const parsed = JSON.parse(cleanedJson);
          setAnalysis(parsed);
          addLog('success', 'Analysis completed (after cleanup)', `Parsed analysis with keys: ${Object.keys(parsed).join(', ')}`);
          msgApi.success('Analysis completed');
        } catch (retryError) {
          addLog('error', 'Final JSON parse failed', `Cleanup also failed. Error: ${retryError instanceof Error ? retryError.message : 'Unknown'}\n\nJSON preview:\n${jsonText.substring(0, 500)}`);
          throw new Error(`Failed to parse JSON response: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      addLog('error', 'Analysis failed', errorMsg);
      msgApi.error(`Analysis failed: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  }, [stock, apiKey, msgApi, addLog, clearLogs]);

  const handlePlaceOrder = useCallback(() => {
    if (!stock || !analysis?.recommendations) return;
    const url = `https://www.icicidirect.com/trading?symbol=${stock.symbol}&action=${analysis.recommendations.action === 'BUY' ? 'BUY' : 'SELL'}`;
    window.open(url, '_blank');
  }, [stock, analysis]);

  if (!stock) {
    return <Spin />;
  }

  const recommendation = analysis?.recommendations;
  const isPositive = recommendation?.action === 'BUY';

  const getLogColor = (level: string) => {
    switch (level) {
      case 'error': return '#d32f2f';
      case 'success': return '#1d7b4d';
      case 'warn': return '#e65100';
      default: return '#1565c0';
    }
  };

  const tabItems: TabsProps['items'] = [
    {
      key: '1',
      label: 'Analysis',
      children: (
        <Spin spinning={loading}>
          {analysis ? (
            <Space direction="vertical" style={{ width: '100%', gap: 16 }}>
              <Card size="small" title="News & Updates" style={{ borderRadius: 8 }}>
                <Paragraph>{analysis.news}</Paragraph>
              </Card>

              <Card size="small" title="Market Trends" style={{ borderRadius: 8 }}>
                <Paragraph>{analysis.trends}</Paragraph>
              </Card>

              <Card size="small" title="Market Price Analysis" style={{ borderRadius: 8 }}>
                <Paragraph>{analysis.marketPrice}</Paragraph>
              </Card>

              <Card size="small" title="Financial Results" style={{ borderRadius: 8 }}>
                <Paragraph>{analysis.financials}</Paragraph>
              </Card>
            </Space>
          ) : (
            <Empty description="Click 'Analyze' to generate AI analysis" />
          )}
        </Spin>
      ),
    },
    {
      key: '2',
      label: 'Recommendation',
      children: recommendation ? (
        <Space direction="vertical" style={{ width: '100%', gap: 16 }}>
          <Card size="small" style={{ borderRadius: 8, borderLeft: `4px solid ${isPositive ? COLORS.green : COLORS.red}` }}>
            <Row gutter={16} align="middle">
              <Col>
                <div style={{ fontSize: 32, color: isPositive ? COLORS.green : COLORS.red }}>
                  {isPositive ? <RiseOutlined /> : <FallOutlined />}
                </div>
              </Col>
              <Col flex="auto">
                <div>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Recommendation</div>
                  <Text
                    strong
                    style={{
                      fontSize: 24,
                      color: isPositive ? COLORS.green : COLORS.red,
                    }}
                  >
                    {recommendation.action}
                  </Text>
                </div>
              </Col>
              <Col>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Confidence</div>
                  <Text
                    strong
                    style={{
                      fontSize: 18,
                      color: COLORS.blue,
                    }}
                  >
                    {recommendation.confidence}%
                  </Text>
                </div>
              </Col>
            </Row>
          </Card>

          <Card size="small" style={{ borderRadius: 8 }}>
            <Row gutter={16}>
              <Col xs={12}>
                <div style={{ marginBottom: 8 }}>
                  <Text style={{ fontSize: 11, color: '#8c8c8c' }}>Current Price</Text>
                </div>
                <Text strong style={{ fontSize: 18, color: COLORS.blue }}>
                  ₹{stock.cmp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Text>
              </Col>
              <Col xs={12}>
                <div style={{ marginBottom: 8 }}>
                  <Text style={{ fontSize: 11, color: '#8c8c8c' }}>Target Price</Text>
                </div>
                <Text
                  strong
                  style={{
                    fontSize: 18,
                    color: isPositive ? COLORS.green : COLORS.red,
                  }}
                >
                  ₹{recommendation.targetPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Text>
              </Col>
            </Row>
          </Card>

          <Card size="small" title="Reasoning" style={{ borderRadius: 8 }}>
            <Paragraph>{recommendation.reasoning}</Paragraph>
          </Card>

          <Button
            type="primary"
            size="large"
            icon={<ShoppingCartOutlined />}
            block
            onClick={handlePlaceOrder}
          >
            Place Order on ICICI Direct
          </Button>
        </Space>
      ) : (
        <Empty description="Run analysis first to see recommendations" />
      ),
    },
    {
      key: '3',
      label: (
        <Space size={4}>
          Logs
          {logs.length > 0 && <Badge count={logs.length} style={{ backgroundColor: COLORS.orange }} />}
        </Space>
      ),
      children: (
        <Space direction="vertical" style={{ width: '100%' }}>
          {logs.length > 0 && (
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={clearLogs}
            >
              Clear Logs
            </Button>
          )}
          {logs.length === 0 ? (
            <Empty description="No logs yet. Run analysis to see logs." />
          ) : (
            <div style={{
              background: '#f5f5f5',
              border: '1px solid #d9d9d9',
              borderRadius: 4,
              padding: 12,
              maxHeight: '600px',
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: 12,
            }}>
              {logs.map((log, idx) => (
                <div
                  key={idx}
                  style={{
                    marginBottom: 12,
                    paddingBottom: 12,
                    borderBottom: idx < logs.length - 1 ? '1px solid #e8e8e8' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'center' }}>
                    <span style={{ color: '#8c8c8c', minWidth: '90px' }}>{log.time}</span>
                    <Tag
                      color={
                        log.level === 'error' ? 'red' :
                        log.level === 'success' ? 'green' :
                        log.level === 'warn' ? 'orange' : 'blue'
                      }
                      style={{ margin: 0 }}
                    >
                      {log.level.toUpperCase()}
                    </Tag>
                    <span style={{ color: getLogColor(log.level), fontWeight: 500 }}>
                      {log.message}
                    </span>
                  </div>
                  {log.details && (
                    <div style={{
                      background: '#fff',
                      border: '1px solid #e8e8e8',
                      borderRadius: 2,
                      padding: 8,
                      marginTop: 4,
                      overflow: 'auto',
                      maxHeight: '200px',
                      color: '#595959',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}>
                      {log.details}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: '#F0F2F5' }}>
      {ctxHolder}
      <Content style={{ padding: '16px 24px' }}>
        <Breadcrumb style={{ marginBottom: 12 }} items={[
          { title: <a onClick={() => navigate('/home')}><HomeOutlined /></a> },
          { title: <a onClick={() => navigate('/pms')}>Portfolio Management</a> },
          { title: <a onClick={() => navigate('/pms/holdings')}>Investment Holdings</a> },
          { title: 'AI Analysis' },
        ]} />

        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Space align="center">
              <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate('/pms/holdings')}
              />
              <div>
                <Title level={4} style={{ margin: 0, color: COLORS.primary }}>
                  <BulbOutlined /> AI Stock Analysis
                </Title>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Powered by Claude AI
                </Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button
                icon={<SettingOutlined />}
                onClick={() => setSettingsOpen(true)}
              >
                API Settings
              </Button>
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                loading={loading}
                onClick={analyzeStock}
              >
                Analyze
              </Button>
            </Space>
          </Col>
        </Row>

        <Card style={{ marginBottom: 16, borderRadius: 8 }}>
          <Row gutter={16} align="middle">
            <Col>
              <div>
                <Title level={5} style={{ margin: 0, color: COLORS.primary }}>
                  {stock.symbol}
                </Title>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {stock.symbolName}
                </Text>
              </div>
            </Col>
            <Col flex="auto">
              <Space>
                <Tag color="blue">{stock.exchange}</Tag>
                <Tag color={stock.shareType === 'NRE' ? 'purple' : 'cyan'}>
                  {stock.shareType}
                </Tag>
              </Space>
            </Col>
            <Col>
              <div style={{ textAlign: 'right' }}>
                <Text style={{ fontSize: 11, color: '#8c8c8c' }}>Current Price</Text>
                <div>
                  <Text strong style={{ fontSize: 18, fontFamily: 'monospace', color: COLORS.blue }}>
                    ₹{stock.cmp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </Text>
                </div>
              </div>
            </Col>
            <Col>
              <Divider type="vertical" style={{ height: 40 }} />
            </Col>
            <Col>
              <div style={{ textAlign: 'right' }}>
                <Text style={{ fontSize: 11, color: '#8c8c8c' }}>Quantity Held</Text>
                <div>
                  <Text strong style={{ fontSize: 18, fontFamily: 'monospace' }}>
                    {stock.qty.toLocaleString()}
                  </Text>
                </div>
              </div>
            </Col>
          </Row>
        </Card>

        <Card style={{ borderRadius: 8 }}>
          <Tabs items={tabItems} />
        </Card>
      </Content>

      <ApiKeySettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        apiKey={apiKey}
        onSave={setApiKey}
      />
    </Layout>
  );
}
