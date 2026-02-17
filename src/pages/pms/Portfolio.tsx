import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Layout,
  Card,
  Row,
  Col,
  Typography,
  Space,
  Button,
  Table,
  Tag,
  Input,
  Modal,
  Form,
  Select,
  Breadcrumb,
  message,
  Tooltip,
  Statistic,
  Empty,
  Spin,
  Popconfirm,
  InputNumber,
  DatePicker,
  Progress,
  Divider,
} from 'antd';
import {
  HomeOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  PieChartOutlined,
  SearchOutlined,
  ReloadOutlined,
  StockOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  LoadingOutlined,
  FundOutlined,
  DollarOutlined,
  RiseOutlined,
  FallOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';

const { Text, Title } = Typography;
const { Content } = Layout;
const { Option } = Select;

const REDWOOD = {
  primary: '#C74634',
  primaryLight: '#E85D4A',
  success: '#1D7B4D',
  warning: '#D4A800',
  info: '#0572CE',
  error: '#D93025',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral300: '#C7C7C7',
  neutral600: '#6B6B6B',
  neutral900: '#1A1A1A',
  surface: '#FFFFFF',
  portfolioPurple: '#6B4C9A',
};

// ============ TYPES ============

interface PortfolioHolding {
  key: string;
  symbol: string;
  name: string;
  quantity: number;
  avgCostPrice: number;
  currentPrice: number;
  previousClose: number;
  purchaseDate: string;
  investedValue: number;
  currentValue: number;
  profitLoss: number;
  profitLossPercent: number;
  dayChange: number;
  dayChangePercent: number;
  dayPnL: number;
  weightPercent: number;
  exchange: string;
  currency: string;
  sector: string;
}

interface StockSearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
  currency: string;
}

// ============ LOCAL STORAGE ============

const STORAGE_KEY = 'pms_portfolio';

const loadPortfolio = (): PortfolioHolding[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const savePortfolio = (holdings: PortfolioHolding[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
};

// ============ API ============

const AV_API_KEY = 'demo';

const searchStocks = async (query: string): Promise<StockSearchResult[]> => {
  if (!query || query.length < 1) return [];
  try {
    const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${AV_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    const matches = data.bestMatches || [];
    return matches.map((m: any) => ({
      symbol: m['1. symbol'],
      name: m['2. name'],
      type: m['3. type'],
      exchange: m['4. region'],
      currency: m['8. currency'],
    }));
  } catch (error) {
    console.error('Stock search error:', error);
    return [];
  }
};

const fetchQuote = async (symbol: string): Promise<{
  price: number; previousClose: number; change: number; changePercent: number; volume: number;
} | null> => {
  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${AV_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    const q = data['Global Quote'];
    if (!q || !q['05. price']) return null;
    return {
      price: parseFloat(q['05. price']) || 0,
      previousClose: parseFloat(q['08. previous close']) || 0,
      change: parseFloat(q['09. change']) || 0,
      changePercent: parseFloat((q['10. change percent'] || '0').replace('%', '')) || 0,
      volume: parseInt(q['06. volume']) || 0,
    };
  } catch (error) {
    console.error('Quote fetch error:', error);
    return null;
  }
};

// ============ FORMAT HELPERS ============

const formatCurrency = (val: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(val);
};

const formatNumber = (val: number): string => {
  return new Intl.NumberFormat('en-US').format(val);
};

const formatPercent = (val: number): string => {
  return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
};

// ============ COMPONENT ============

const Portfolio: React.FC = () => {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>(loadPortfolio);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingHolding, setEditingHolding] = useState<PortfolioHolding | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedHoldings, setSelectedHoldings] = useState<React.Key[]>([]);
  const [selectedStock, setSelectedStock] = useState<StockSearchResult | null>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  // Persist
  useEffect(() => {
    savePortfolio(holdings);
  }, [holdings]);

  // ---- Portfolio Summary ----
  const summary = useMemo(() => {
    const totalInvested = holdings.reduce((sum, h) => sum + h.investedValue, 0);
    const totalCurrent = holdings.reduce((sum, h) => sum + h.currentValue, 0);
    const totalPnL = totalCurrent - totalInvested;
    const totalPnLPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;
    const totalDayPnL = holdings.reduce((sum, h) => sum + h.dayPnL, 0);
    const gainers = holdings.filter((h) => h.profitLossPercent > 0).length;
    const losers = holdings.filter((h) => h.profitLossPercent < 0).length;

    // Top gainer and loser
    const sortedByPnL = [...holdings].sort((a, b) => b.profitLossPercent - a.profitLossPercent);
    const topGainer = sortedByPnL.length > 0 ? sortedByPnL[0] : null;
    const topLoser = sortedByPnL.length > 0 ? sortedByPnL[sortedByPnL.length - 1] : null;

    return { totalInvested, totalCurrent, totalPnL, totalPnLPercent, totalDayPnL, gainers, losers, topGainer, topLoser };
  }, [holdings]);

  // Recompute weights
  const holdingsWithWeights = useMemo(() => {
    const totalValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
    return holdings.map((h) => ({
      ...h,
      weightPercent: totalValue > 0 ? (h.currentValue / totalValue) * 100 : 0,
    }));
  }, [holdings]);

  // ---- Search Stocks ----
  const handleSearch = useCallback(async (value: string) => {
    setSearchQuery(value);
    if (!value || value.length < 1) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const results = await searchStocks(value);
      setSearchResults(results);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // ---- Select Stock from Search ----
  const handleSelectStock = (stock: StockSearchResult) => {
    setSelectedStock(stock);
    form.setFieldsValue({ symbol: stock.symbol, name: stock.name, exchange: stock.exchange, currency: stock.currency });
  };

  // ---- Add Holding ----
  const handleAddHolding = async () => {
    try {
      const values = await form.validateFields();
      if (!selectedStock) {
        message.error('Please search and select a stock first');
        return;
      }

      message.loading({ content: `Fetching current price for ${selectedStock.symbol}...`, key: 'addHolding' });

      const quote = await fetchQuote(selectedStock.symbol);
      const currentPrice = quote?.price || values.avgCostPrice;
      const investedValue = values.quantity * values.avgCostPrice;
      const currentValue = values.quantity * currentPrice;
      const profitLoss = currentValue - investedValue;
      const profitLossPercent = investedValue > 0 ? (profitLoss / investedValue) * 100 : 0;
      const dayPnL = (quote?.change || 0) * values.quantity;

      const newHolding: PortfolioHolding = {
        key: `${selectedStock.symbol}-${Date.now()}`,
        symbol: selectedStock.symbol,
        name: selectedStock.name,
        quantity: values.quantity,
        avgCostPrice: values.avgCostPrice,
        currentPrice,
        previousClose: quote?.previousClose || currentPrice,
        purchaseDate: values.purchaseDate?.format('DD MMM YYYY') || dayjs().format('DD MMM YYYY'),
        investedValue,
        currentValue,
        profitLoss,
        profitLossPercent,
        dayChange: quote?.change || 0,
        dayChangePercent: quote?.changePercent || 0,
        dayPnL,
        weightPercent: 0,
        exchange: selectedStock.exchange,
        currency: selectedStock.currency || 'USD',
        sector: values.sector || '',
      };

      setHoldings((prev) => [...prev, newHolding]);
      setAddModalVisible(false);
      setSelectedStock(null);
      setSearchQuery('');
      setSearchResults([]);
      form.resetFields();
      message.success({ content: `${selectedStock.symbol} added to portfolio`, key: 'addHolding' });
    } catch (err) {
      console.error('Validation failed:', err);
    }
  };

  // ---- Edit Holding ----
  const openEditModal = (holding: PortfolioHolding) => {
    setEditingHolding(holding);
    editForm.setFieldsValue({
      quantity: holding.quantity,
      avgCostPrice: holding.avgCostPrice,
      sector: holding.sector,
    });
    setEditModalVisible(true);
  };

  const handleEditHolding = async () => {
    try {
      const values = await editForm.validateFields();
      if (!editingHolding) return;

      setHoldings((prev) =>
        prev.map((h) => {
          if (h.key !== editingHolding.key) return h;
          const investedValue = values.quantity * values.avgCostPrice;
          const currentValue = values.quantity * h.currentPrice;
          const profitLoss = currentValue - investedValue;
          const profitLossPercent = investedValue > 0 ? (profitLoss / investedValue) * 100 : 0;
          const dayPnL = h.dayChange * values.quantity;
          return {
            ...h,
            quantity: values.quantity,
            avgCostPrice: values.avgCostPrice,
            investedValue,
            currentValue,
            profitLoss,
            profitLossPercent,
            dayPnL,
            sector: values.sector || '',
          };
        })
      );
      setEditModalVisible(false);
      setEditingHolding(null);
      message.success('Holding updated');
    } catch (err) {
      console.error('Validation failed:', err);
    }
  };

  // ---- Remove Holdings ----
  const handleRemoveHoldings = () => {
    if (selectedHoldings.length === 0) return;
    setHoldings((prev) => prev.filter((h) => !selectedHoldings.includes(h.key)));
    setSelectedHoldings([]);
    message.success(`${selectedHoldings.length} holding(s) removed`);
  };

  // ---- Refresh Prices ----
  const handleRefreshPrices = async () => {
    if (holdings.length === 0) return;
    setRefreshing(true);
    message.loading({ content: 'Refreshing portfolio prices...', key: 'refresh' });

    try {
      const updatedHoldings = await Promise.all(
        holdings.map(async (holding) => {
          const quote = await fetchQuote(holding.symbol);
          if (quote) {
            const currentValue = holding.quantity * quote.price;
            const profitLoss = currentValue - holding.investedValue;
            const profitLossPercent = holding.investedValue > 0
              ? (profitLoss / holding.investedValue) * 100
              : 0;
            const dayPnL = quote.change * holding.quantity;
            return {
              ...holding,
              currentPrice: quote.price,
              previousClose: quote.previousClose,
              currentValue,
              profitLoss,
              profitLossPercent,
              dayChange: quote.change,
              dayChangePercent: quote.changePercent,
              dayPnL,
            };
          }
          return holding;
        })
      );

      setHoldings(updatedHoldings);
      message.success({ content: 'Portfolio prices refreshed', key: 'refresh' });
    } catch (error) {
      message.error({ content: 'Failed to refresh some prices', key: 'refresh' });
    } finally {
      setRefreshing(false);
    }
  };

  // ---- Table Columns ----
  const columns: ColumnsType<PortfolioHolding> = [
    {
      title: 'Symbol',
      dataIndex: 'symbol',
      key: 'symbol',
      width: 90,
      fixed: 'left',
      sorter: (a, b) => a.symbol.localeCompare(b.symbol),
      render: (symbol: string) => (
        <Text strong style={{ fontSize: 13, color: REDWOOD.info }}>{symbol}</Text>
      ),
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      width: 180,
      render: (name: string) => <Text style={{ fontSize: 12 }}>{name}</Text>,
    },
    {
      title: 'Qty',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 70,
      align: 'right',
      render: (qty: number) => <Text style={{ fontSize: 12, fontWeight: 600 }}>{formatNumber(qty)}</Text>,
    },
    {
      title: 'Avg Cost',
      dataIndex: 'avgCostPrice',
      key: 'avgCostPrice',
      width: 110,
      align: 'right',
      render: (price: number, record) => <Text style={{ fontSize: 12 }}>{formatCurrency(price, record.currency)}</Text>,
    },
    {
      title: 'Current Price',
      dataIndex: 'currentPrice',
      key: 'currentPrice',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.currentPrice - b.currentPrice,
      render: (price: number, record) => (
        <Text strong style={{ fontSize: 13 }}>{formatCurrency(price, record.currency)}</Text>
      ),
    },
    {
      title: 'Day Change',
      key: 'dayChange',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.dayChangePercent - b.dayChangePercent,
      render: (_: any, record) => (
        <Text style={{
          fontSize: 12,
          color: record.dayChangePercent >= 0 ? REDWOOD.success : REDWOOD.error,
          fontWeight: 600,
        }}>
          {formatPercent(record.dayChangePercent)}
        </Text>
      ),
    },
    {
      title: 'Invested',
      dataIndex: 'investedValue',
      key: 'investedValue',
      width: 120,
      align: 'right',
      render: (val: number, record) => <Text style={{ fontSize: 12 }}>{formatCurrency(val, record.currency)}</Text>,
    },
    {
      title: 'Current Value',
      dataIndex: 'currentValue',
      key: 'currentValue',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.currentValue - b.currentValue,
      render: (val: number, record) => <Text strong style={{ fontSize: 12 }}>{formatCurrency(val, record.currency)}</Text>,
    },
    {
      title: 'P&L',
      dataIndex: 'profitLoss',
      key: 'profitLoss',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.profitLoss - b.profitLoss,
      render: (val: number, record) => (
        <Text strong style={{
          fontSize: 12,
          color: val >= 0 ? REDWOOD.success : REDWOOD.error,
        }}>
          {formatCurrency(val, record.currency)}
        </Text>
      ),
    },
    {
      title: 'P&L %',
      dataIndex: 'profitLossPercent',
      key: 'profitLossPercent',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.profitLossPercent - b.profitLossPercent,
      render: (pct: number) => (
        <Tag
          color={pct >= 0 ? 'green' : 'red'}
          style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px' }}
        >
          {pct >= 0 ? <ArrowUpOutlined style={{ fontSize: 10, marginRight: 4 }} /> : <ArrowDownOutlined style={{ fontSize: 10, marginRight: 4 }} />}
          {formatPercent(pct)}
        </Tag>
      ),
    },
    {
      title: 'Weight',
      dataIndex: 'weightPercent',
      key: 'weightPercent',
      width: 90,
      align: 'right',
      sorter: (a, b) => a.weightPercent - b.weightPercent,
      render: (pct: number) => <Text style={{ fontSize: 12 }}>{pct.toFixed(1)}%</Text>,
    },
    {
      title: 'Date',
      dataIndex: 'purchaseDate',
      key: 'purchaseDate',
      width: 100,
      render: (date: string) => <Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{date}</Text>,
    },
    {
      title: '',
      key: 'actions',
      width: 40,
      fixed: 'right',
      render: (_: any, record) => (
        <Tooltip title="Edit holding">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined style={{ fontSize: 13, color: REDWOOD.info }} />}
            onClick={() => openEditModal(record)}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb */}
        <div style={{
          padding: '12px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
        }}>
          <Breadcrumb
            items={[
              { title: <Link to="/home"><HomeOutlined /> Home</Link> },
              { title: <Link to="/pms">Portfolio Management</Link> },
              { title: 'My Portfolio' },
            ]}
          />
        </div>

        <div style={{ padding: '24px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Space align="center" size={12}>
              <div style={{
                background: `${REDWOOD.portfolioPurple}15`,
                borderRadius: 12,
                padding: 10,
              }}>
                <PieChartOutlined style={{ fontSize: 24, color: REDWOOD.portfolioPurple }} />
              </div>
              <div>
                <Title level={4} style={{ margin: 0 }}>My Portfolio</Title>
                <Text type="secondary">Track your holdings and monitor performance</Text>
              </div>
            </Space>
            <Space>
              <Button
                icon={<ReloadOutlined spin={refreshing} />}
                onClick={handleRefreshPrices}
                loading={refreshing}
              >
                Refresh Prices
              </Button>
              <Button
                icon={<PlusOutlined />}
                type="primary"
                onClick={() => { setSelectedStock(null); setSearchQuery(''); setSearchResults([]); form.resetFields(); setAddModalVisible(true); }}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
              >
                Add Holding
              </Button>
            </Space>
          </div>

          {/* Portfolio Summary Cards */}
          {holdings.length > 0 && (
            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
              <Col xs={24} sm={12} lg={6}>
                <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }} bodyStyle={{ padding: '16px 20px' }}>
                  <Statistic
                    title={<Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Total Invested</Text>}
                    value={summary.totalInvested}
                    precision={2}
                    prefix="$"
                    valueStyle={{ fontSize: 22, fontWeight: 700, color: REDWOOD.neutral900 }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }} bodyStyle={{ padding: '16px 20px' }}>
                  <Statistic
                    title={<Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Current Value</Text>}
                    value={summary.totalCurrent}
                    precision={2}
                    prefix="$"
                    valueStyle={{ fontSize: 22, fontWeight: 700, color: REDWOOD.neutral900 }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }} bodyStyle={{ padding: '16px 20px' }}>
                  <Statistic
                    title={<Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Total P&L</Text>}
                    value={summary.totalPnL}
                    precision={2}
                    prefix={summary.totalPnL >= 0 ? '+$' : '-$'}
                    suffix={<Text style={{ fontSize: 12, color: summary.totalPnLPercent >= 0 ? REDWOOD.success : REDWOOD.error }}> ({formatPercent(summary.totalPnLPercent)})</Text>}
                    valueStyle={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: summary.totalPnL >= 0 ? REDWOOD.success : REDWOOD.error,
                    }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }} bodyStyle={{ padding: '16px 20px' }}>
                  <Statistic
                    title={<Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Today's P&L</Text>}
                    value={summary.totalDayPnL}
                    precision={2}
                    prefix={summary.totalDayPnL >= 0 ? '+$' : '-$'}
                    valueStyle={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: summary.totalDayPnL >= 0 ? REDWOOD.success : REDWOOD.error,
                    }}
                  />
                  <Space style={{ marginTop: 4 }}>
                    <Tag color="green" style={{ fontSize: 10 }}>{summary.gainers} Gainers</Tag>
                    <Tag color="red" style={{ fontSize: 10 }}>{summary.losers} Losers</Tag>
                  </Space>
                </Card>
              </Col>
            </Row>
          )}

          {/* Top Gainer / Loser Bar */}
          {holdings.length > 0 && summary.topGainer && summary.topLoser && (
            <Row gutter={16} style={{ marginBottom: 20 }}>
              <Col span={12}>
                <Card size="small" style={{ borderRadius: 10, borderLeft: `4px solid ${REDWOOD.success}` }} bodyStyle={{ padding: '10px 16px' }}>
                  <Space>
                    <RiseOutlined style={{ color: REDWOOD.success, fontSize: 18 }} />
                    <div>
                      <Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Top Gainer</Text>
                      <div>
                        <Text strong style={{ fontSize: 14, color: REDWOOD.success }}>{summary.topGainer.symbol}</Text>
                        <Tag color="green" style={{ marginLeft: 8, fontSize: 11, fontWeight: 700 }}>
                          {formatPercent(summary.topGainer.profitLossPercent)}
                        </Tag>
                      </div>
                    </div>
                  </Space>
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" style={{ borderRadius: 10, borderLeft: `4px solid ${REDWOOD.error}` }} bodyStyle={{ padding: '10px 16px' }}>
                  <Space>
                    <FallOutlined style={{ color: REDWOOD.error, fontSize: 18 }} />
                    <div>
                      <Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Top Loser</Text>
                      <div>
                        <Text strong style={{ fontSize: 14, color: REDWOOD.error }}>{summary.topLoser.symbol}</Text>
                        <Tag color="red" style={{ marginLeft: 8, fontSize: 11, fontWeight: 700 }}>
                          {formatPercent(summary.topLoser.profitLossPercent)}
                        </Tag>
                      </div>
                    </div>
                  </Space>
                </Card>
              </Col>
            </Row>
          )}

          {/* Holdings Table */}
          <Card
            style={{ borderRadius: 12, border: `1px solid ${REDWOOD.neutral200}` }}
            bodyStyle={{ padding: 0 }}
          >
            <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
              <Space>
                <Text strong style={{ fontSize: 14 }}>Holdings</Text>
                <Tag style={{ fontSize: 10 }}>{holdings.length} stocks</Tag>
              </Space>
              <Space>
                {selectedHoldings.length > 0 && (
                  <Popconfirm
                    title={`Remove ${selectedHoldings.length} holding(s)?`}
                    onConfirm={handleRemoveHoldings}
                    okText="Remove"
                    okButtonProps={{ danger: true }}
                  >
                    <Button size="small" icon={<DeleteOutlined />} danger style={{ fontSize: 12 }}>
                      Remove ({selectedHoldings.length})
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            </div>

            {holdings.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center' }}>
                <Empty
                  image={<PieChartOutlined style={{ fontSize: 64, color: REDWOOD.neutral300 }} />}
                  description={
                    <div>
                      <Text style={{ fontSize: 16, display: 'block', marginBottom: 8 }}>No Holdings Yet</Text>
                      <Text type="secondary">Add your first stock holding to start tracking your portfolio</Text>
                    </div>
                  }
                >
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => { setSelectedStock(null); form.resetFields(); setAddModalVisible(true); }}
                    style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary, marginTop: 16 }}
                  >
                    Add Holding
                  </Button>
                </Empty>
              </div>
            ) : (
              <Table
                columns={columns}
                dataSource={holdingsWithWeights}
                size="small"
                pagination={false}
                scroll={{ x: 1500 }}
                rowSelection={{
                  selectedRowKeys: selectedHoldings,
                  onChange: setSelectedHoldings,
                }}
                summary={() => (
                  <Table.Summary fixed>
                    <Table.Summary.Row style={{ background: REDWOOD.neutral100 }}>
                      <Table.Summary.Cell index={0} colSpan={2} />
                      <Table.Summary.Cell index={2}>
                        <Text strong style={{ fontSize: 12, paddingLeft: 8 }}>Total</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={3} colSpan={2} />
                      <Table.Summary.Cell index={5} />
                      <Table.Summary.Cell index={6} />
                      <Table.Summary.Cell index={7} align="right">
                        <Text strong style={{ fontSize: 12 }}>{formatCurrency(summary.totalInvested)}</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={8} align="right">
                        <Text strong style={{ fontSize: 12 }}>{formatCurrency(summary.totalCurrent)}</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={9} align="right">
                        <Text strong style={{ fontSize: 12, color: summary.totalPnL >= 0 ? REDWOOD.success : REDWOOD.error }}>
                          {formatCurrency(summary.totalPnL)}
                        </Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={10} align="right">
                        <Tag color={summary.totalPnLPercent >= 0 ? 'green' : 'red'} style={{ fontSize: 11, fontWeight: 700 }}>
                          {formatPercent(summary.totalPnLPercent)}
                        </Tag>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={11} align="right">
                        <Text strong style={{ fontSize: 12 }}>100%</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={12} colSpan={2} />
                    </Table.Summary.Row>
                  </Table.Summary>
                )}
              />
            )}

            {/* Allocation breakdown */}
            {holdings.length > 0 && (
              <div style={{ padding: '16px 20px', borderTop: `1px solid ${REDWOOD.neutral200}` }}>
                <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>Portfolio Allocation</Text>
                <Row gutter={[8, 8]}>
                  {holdingsWithWeights
                    .sort((a, b) => b.weightPercent - a.weightPercent)
                    .map((h) => (
                      <Col key={h.key} xs={24} sm={12} md={8} lg={6}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Text strong style={{ fontSize: 12, width: 50, color: REDWOOD.info }}>{h.symbol}</Text>
                          <Progress
                            percent={h.weightPercent}
                            size="small"
                            showInfo={false}
                            strokeColor={REDWOOD.portfolioPurple}
                            style={{ flex: 1 }}
                          />
                          <Text style={{ fontSize: 11, width: 45, textAlign: 'right' }}>{h.weightPercent.toFixed(1)}%</Text>
                        </div>
                      </Col>
                    ))}
                </Row>
              </div>
            )}
          </Card>
        </div>

        {/* ============ ADD HOLDING MODAL ============ */}
        <Modal
          title="Add Stock Holding"
          open={addModalVisible}
          onCancel={() => { setAddModalVisible(false); setSelectedStock(null); setSearchQuery(''); setSearchResults([]); form.resetFields(); }}
          onOk={handleAddHolding}
          okText="Add to Portfolio"
          okButtonProps={{ style: { background: REDWOOD.primary, borderColor: REDWOOD.primary }, disabled: !selectedStock }}
          width={560}
        >
          {/* Stock Search */}
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Search Stock</Text>
            <Input.Search
              placeholder="Search by symbol or company name"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onSearch={handleSearch}
              enterButton
              loading={searchLoading}
            />
          </div>

          {searchLoading && (
            <div style={{ textAlign: 'center', padding: 12 }}>
              <Spin indicator={<LoadingOutlined style={{ fontSize: 20 }} spin />} />
            </div>
          )}

          {!searchLoading && searchResults.length > 0 && !selectedStock && (
            <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 16 }}>
              {searchResults.map((result) => (
                <Card
                  key={result.symbol}
                  hoverable
                  size="small"
                  style={{ marginBottom: 6, borderRadius: 6, cursor: 'pointer', border: `1px solid ${REDWOOD.neutral200}` }}
                  bodyStyle={{ padding: '8px 12px' }}
                  onClick={() => handleSelectStock(result)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <Text strong style={{ color: REDWOOD.info }}>{result.symbol}</Text>
                      <Text style={{ fontSize: 12, marginLeft: 8 }}>{result.name}</Text>
                    </div>
                    <Tag style={{ fontSize: 10 }}>{result.exchange}</Tag>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Selected Stock */}
          {selectedStock && (
            <Card
              size="small"
              style={{ marginBottom: 16, borderRadius: 8, background: `${REDWOOD.info}08`, borderColor: REDWOOD.info }}
              bodyStyle={{ padding: '10px 14px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <StockOutlined style={{ color: REDWOOD.info }} />
                  <Text strong style={{ color: REDWOOD.info }}>{selectedStock.symbol}</Text>
                  <Text style={{ fontSize: 12 }}>{selectedStock.name}</Text>
                  <Tag style={{ fontSize: 10 }}>{selectedStock.exchange}</Tag>
                </Space>
                <Button
                  type="text"
                  size="small"
                  onClick={() => { setSelectedStock(null); setSearchResults([]); }}
                  style={{ color: REDWOOD.neutral600 }}
                >
                  Change
                </Button>
              </div>
            </Card>
          )}

          <Divider style={{ margin: '12px 0' }} />

          {/* Holding Details Form */}
          <Form form={form} layout="vertical" size="small">
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="quantity" label="Quantity" rules={[{ required: true, message: 'Enter quantity' }]}>
                  <InputNumber
                    style={{ width: '100%' }}
                    min={0.001}
                    precision={3}
                    placeholder="e.g. 100"
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="avgCostPrice" label="Average Cost Price" rules={[{ required: true, message: 'Enter avg cost' }]}>
                  <InputNumber
                    style={{ width: '100%' }}
                    min={0}
                    precision={4}
                    placeholder="e.g. 150.50"
                  />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="purchaseDate" label="Purchase Date">
                  <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="sector" label="Sector">
                  <Select placeholder="Select sector" allowClear>
                    <Option value="Technology">Technology</Option>
                    <Option value="Healthcare">Healthcare</Option>
                    <Option value="Finance">Finance</Option>
                    <Option value="Energy">Energy</Option>
                    <Option value="Consumer">Consumer</Option>
                    <Option value="Industrial">Industrial</Option>
                    <Option value="Real Estate">Real Estate</Option>
                    <Option value="Utilities">Utilities</Option>
                    <Option value="Materials">Materials</Option>
                    <Option value="Telecom">Telecom</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Modal>

        {/* ============ EDIT HOLDING MODAL ============ */}
        <Modal
          title={editingHolding ? `Edit ${editingHolding.symbol}` : 'Edit Holding'}
          open={editModalVisible}
          onCancel={() => { setEditModalVisible(false); setEditingHolding(null); }}
          onOk={handleEditHolding}
          okText="Save"
          okButtonProps={{ style: { background: REDWOOD.primary, borderColor: REDWOOD.primary } }}
          width={480}
        >
          <Form form={editForm} layout="vertical" size="small">
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="quantity" label="Quantity" rules={[{ required: true, message: 'Enter quantity' }]}>
                  <InputNumber style={{ width: '100%' }} min={0.001} precision={3} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="avgCostPrice" label="Average Cost Price" rules={[{ required: true, message: 'Enter avg cost' }]}>
                  <InputNumber style={{ width: '100%' }} min={0} precision={4} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="sector" label="Sector">
              <Select placeholder="Select sector" allowClear>
                <Option value="Technology">Technology</Option>
                <Option value="Healthcare">Healthcare</Option>
                <Option value="Finance">Finance</Option>
                <Option value="Energy">Energy</Option>
                <Option value="Consumer">Consumer</Option>
                <Option value="Industrial">Industrial</Option>
                <Option value="Real Estate">Real Estate</Option>
                <Option value="Utilities">Utilities</Option>
                <Option value="Materials">Materials</Option>
                <Option value="Telecom">Telecom</Option>
              </Select>
            </Form.Item>
          </Form>
        </Modal>

        <style>{`
          .ant-table-thead > tr > th {
            background: ${REDWOOD.neutral100} !important;
            font-weight: 600;
            font-size: 11px;
            padding: 8px 12px !important;
            color: ${REDWOOD.neutral600};
          }
          .ant-table-tbody > tr > td {
            font-size: 12px;
            padding: 8px 12px !important;
          }
          .ant-table-tbody > tr:hover > td {
            background: #fef7f6 !important;
          }
        `}</style>
      </Content>
    </Layout>
  );
};

export default Portfolio;
