import React, { useState, useCallback, useEffect } from 'react';
import {
  Layout, Card, Row, Col, Typography, Space, Button, Spin, Divider, Tag,
  Breadcrumb, Tabs, Empty, message, Drawer, Tooltip,
} from 'antd';
import {
  HomeOutlined, ArrowLeftOutlined, ReloadOutlined, SettingOutlined,
  RiseOutlined, FallOutlined, BulbOutlined, ShoppingCartOutlined,
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
      msgApi.error('Please set your Claude API key first');
      setSettingsOpen(true);
      return;
    }

    setLoading(true);
    try {
      const prompt = `Analyze the stock ${stock.symbol} (${stock.symbolName}) listed on ${stock.exchange}.
      Current Price: ₹${stock.cmp}
      Quantity Held: ${stock.qty}

      Please provide:
      1. Latest news and updates about this stock
      2. Current market trends and technical indicators
      3. Current market price and price movement analysis
      4. Recent financial results and performance metrics
      5. Buy/Sell/Hold recommendation with:
         - Action (BUY/SELL/HOLD)
         - Target price
         - Confidence level (0-100)
         - Detailed reasoning

      Format your response as JSON with keys: news, trends, marketPrice, financials, recommendations (with action, targetPrice, confidence, reasoning)`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-1',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'API request failed');
      }

      const data = await response.json();
      const content = data.content[0]?.text;

      if (!content) {
        throw new Error('No response from Claude API');
      }

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to parse API response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      setAnalysis(parsed);
      msgApi.success('Analysis completed');
    } catch (error) {
      msgApi.error(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [stock, apiKey, msgApi]);

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
