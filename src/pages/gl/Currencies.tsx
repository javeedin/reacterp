import React, { useState, useCallback, useEffect } from 'react';
import {
  Layout,
  Card,
  Table,
  Button,
  Space,
  Typography,
  Breadcrumb,
  Tabs,
  Input,
  Select,
  DatePicker,
  Checkbox,
  Form,
  Row,
  Col,
  Spin,
  Alert,
  Tooltip,
  Popconfirm,
  message,
  Tag,
  Divider,
} from 'antd';
import {
  HomeOutlined,
  DollarOutlined,
  PlusOutlined,
  DeleteOutlined,
  SaveOutlined,
  SearchOutlined,
  ReloadOutlined,
  CheckCircleFilled,
  CloudDownloadOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { APEX_DB_CONFIG, ORACLE_FUSION_CONFIG } from '../../config/api.config';

// ─── Fusion fetch helper (Electron = direct, Browser = proxy) ─
const isElectron = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron');
const FUSION_AUTH = () =>
  `Basic ${btoa(`${ORACLE_FUSION_CONFIG.username}:${ORACLE_FUSION_CONFIG.password}`)}`;
const PROXY_BASE = 'http://localhost:3001/api';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

const ORDS_BASE = APEX_DB_CONFIG.baseUrl;

// ─── Oracle Redwood palette ───────────────────────────────────
const REDWOOD = {
  primary:       '#C74634',
  primaryDark:   '#A33B2C',
  success:       '#1D7B4D',
  warning:       '#D4A800',
  info:          '#0572CE',
  neutral:       '#383838',
  surface:       '#FFFFFF',
  surfaceAlt:    '#F7F7F7',
  border:        '#E5E5E5',
  textPrimary:   '#1A1A1A',
  textSecondary: '#6B6B6B',
};

// ─── Types ────────────────────────────────────────────────────
interface Currency {
  code: string;
  name: string;
  description: string;
  enabled: string;
  symbol: string;
  precision: number;
  extPrecision: number;
  territory: string;
  currencyFlag: string;
  lastSyncDate: string | null;
}

interface RateType {
  key: string;               // local react key
  rate_type_id: number | null;
  name: string;
  description: string;
  default_rate_type: boolean;
  enforce_inverse_relationship: boolean;
  enable_cross_rates: boolean;
  allow_cross_rates_override: boolean;
  cross_rate_pivot_currency: string;
  isNew?: boolean;
  isDirty?: boolean;
}

interface DailyRate {
  rate_id: number;
  from_currency: string;
  to_currency: string;
  rate_date: string;
  rate_type: string;
  rate: number;
  inverse_rate: number;
  source: string;
}

// ─── Utility ─────────────────────────────────────────────────
const fmtDate = (d: string | null) =>
  d ? dayjs(d).format('DD-MMM-YYYY') : '';

// ═══════════════════════════════════════════════════════════════
// TAB 1: Currencies
// ═══════════════════════════════════════════════════════════════
const CurrenciesTab: React.FC = () => {
  const [searchCode, setSearchCode]   = useState('');
  const [searchName, setSearchName]   = useState('');
  const [data, setData]               = useState<Currency[]>([]);
  const [loading, setLoading]         = useState(false);
  const [searched, setSearched]       = useState(false);
  const [error, setError]             = useState('');
  const [syncing, setSyncing]         = useState(false);
  const [syncStatus, setSyncStatus]   = useState<{ type: 'success'|'error'; msg: string } | null>(null);

  const handleSearch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (searchCode.trim()) params.set('search', searchCode.trim());
      const url = `${ORDS_BASE}/currencies?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      let rows: Currency[] = json.items ?? json.data ?? (Array.isArray(json) ? json : []);
      // client-side name filter
      if (searchName.trim()) {
        const lc = searchName.toLowerCase();
        rows = rows.filter(r => r.name?.toLowerCase().includes(lc));
      }
      setData(rows);
      setSearched(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [searchCode, searchName]);

  const handleReset = () => {
    setSearchCode('');
    setSearchName('');
    setData([]);
    setSearched(false);
    setError('');
  };

  const handleToggle = async (code: string, current: string) => {
    const newVal = current === 'Y' ? 'N' : 'Y';
    try {
      const res = await fetch(`${ORDS_BASE}/currencies/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, enabled: newVal }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(prev =>
        prev.map(r => r.code === code ? { ...r, enabled: newVal } : r)
      );
      message.success(`Currency ${code} ${newVal === 'Y' ? 'enabled' : 'disabled'}`);
    } catch (e: any) {
      message.error(`Failed to toggle: ${e.message}`);
    }
  };

  const handleFetchFromFusion = async () => {
    setSyncing(true);
    setSyncStatus(null);
    try {
      // ── Step 1: fetch from Oracle Fusion ──────────────────────
      const fusionUrl = 'currenciesLOV?limit=500&onlyData=true';
      let fusionItems: any[] = [];
      let nextUrl: string | null = null;

      const fetchPage = async (url: string) => {
        let res: Response;
        if (isElectron) {
          res = await fetch(`${ORACLE_FUSION_CONFIG.baseUrl}/${url}`, {
            headers: { 'Authorization': FUSION_AUTH(), 'Accept': 'application/json' },
          });
        } else {
          res = await fetch(`${PROXY_BASE}/oracle/${url}`);
        }
        if (!res.ok) throw new Error(`Fusion HTTP ${res.status}`);
        return res.json();
      };

      let page = await fetchPage(fusionUrl);
      fusionItems = fusionItems.concat(page.items ?? []);

      // paginate if needed
      nextUrl = page.links?.find((l: any) => l.rel === 'next')?.href ?? null;
      while (nextUrl) {
        const rel = nextUrl.replace(`${ORACLE_FUSION_CONFIG.baseUrl}/`, '');
        page = await fetchPage(rel);
        fusionItems = fusionItems.concat(page.items ?? []);
        nextUrl = page.links?.find((l: any) => l.rel === 'next')?.href ?? null;
      }

      if (!fusionItems.length) throw new Error('No currencies returned from Fusion');

      // ── Step 2: POST to ORDS sync endpoint ────────────────────
      const payload = {
        items: fusionItems.map(r => ({
          CurrencyCode:             r.CurrencyCode             ?? r.currencyCode,
          Name:                     r.Name                     ?? r.name,
          Description:              r.Description              ?? r.description,
          EnabledFlag:              r.EnabledFlag              ?? r.enabledFlag ?? 'Y',
          Symbol:                   r.Symbol                   ?? r.symbol,
          Precision:                r.Precision                ?? r.precision,
          ExtendedPrecision:        r.ExtendedPrecision        ?? r.extendedPrecision,
          CurrencyFormat:           r.CurrencyFormat           ?? r.currencyFormat,
          CurrencyFormatWithSymbol: r.CurrencyFormatWithSymbol ?? r.currencyFormatWithSymbol,
          CurrencyFormatWithCode:   r.CurrencyFormatWithCode   ?? r.currencyFormatWithCode,
          IssuingTerritoryCode:     r.IssuingTerritoryCode     ?? r.issuingTerritoryCode,
          CurrencyFlag:             r.CurrencyFlag             ?? r.currencyFlag ?? 'Y',
        })),
      };

      const syncRes = await fetch(`${ORDS_BASE}/currencies/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!syncRes.ok) throw new Error(`Sync HTTP ${syncRes.status}`);
      const syncJson = await syncRes.json();

      setSyncStatus({
        type: 'success',
        msg: `Synced ${fusionItems.length} currencies from Oracle Fusion. ${syncJson.message ?? ''}`,
      });
      // refresh the table if a search was already done
      if (searched) await handleSearch();
    } catch (e: any) {
      setSyncStatus({ type: 'error', msg: e.message });
    } finally {
      setSyncing(false);
    }
  };

  const columns = [
    {
      title: 'Currency Code',
      dataIndex: 'code',
      width: 130,
      render: (v: string) => <Text strong style={{ color: REDWOOD.info }}>{v}</Text>,
    },
    {
      title: 'Currency Name',
      dataIndex: 'name',
      width: 220,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      ellipsis: true,
    },
    {
      title: 'Enabled',
      dataIndex: 'enabled',
      width: 90,
      align: 'center' as const,
      render: (v: string, record: Currency) => (
        <Checkbox
          checked={v === 'Y'}
          onChange={() => handleToggle(record.code, v)}
        />
      ),
    },
    {
      title: 'Symbol',
      dataIndex: 'symbol',
      width: 80,
      align: 'center' as const,
    },
    {
      title: 'Precision',
      dataIndex: 'precision',
      width: 90,
      align: 'center' as const,
    },
    {
      title: 'Territory',
      dataIndex: 'territory',
      width: 100,
    },
    {
      title: 'Last Sync',
      dataIndex: 'lastSyncDate',
      width: 120,
      render: fmtDate,
    },
  ];

  return (
    <div>
      {/* Search Section */}
      <Card
        size="small"
        style={{ marginBottom: 16, border: `1px solid ${REDWOOD.border}` }}
        title={
          <Space>
            <SearchOutlined style={{ color: REDWOOD.info }} />
            <Text strong>Search</Text>
          </Space>
        }
      >
        <Row gutter={[16, 12]}>
          <Col xs={24} sm={12} md={8}>
            <Row align="middle" gutter={8}>
              <Col flex="120px"><Text>Currency Code</Text></Col>
              <Col flex="auto">
                <Input
                  value={searchCode}
                  onChange={e => setSearchCode(e.target.value)}
                  onPressEnter={handleSearch}
                  placeholder="e.g. USD"
                  style={{ width: '100%' }}
                />
              </Col>
            </Row>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Row align="middle" gutter={8}>
              <Col flex="120px"><Text>Currency Name</Text></Col>
              <Col flex="auto">
                <Input
                  value={searchName}
                  onChange={e => setSearchName(e.target.value)}
                  onPressEnter={handleSearch}
                  placeholder="e.g. Dollar"
                  style={{ width: '100%' }}
                />
              </Col>
            </Row>
          </Col>
          <Col xs={24} md={8} style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={handleReset} icon={<ReloadOutlined />}>Reset</Button>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleSearch}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
              >
                Search
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Results */}
      <Card
        size="small"
        title={
          <Space>
            <Text strong>Search Results</Text>
            {searched && <Tag color="blue">{data.length} record{data.length !== 1 ? 's' : ''}</Tag>}
          </Space>
        }
        extra={
          <Tooltip title="Fetch all currencies from Oracle Fusion and sync to local DB">
            <Button
              icon={<CloudDownloadOutlined />}
              loading={syncing}
              onClick={handleFetchFromFusion}
              style={{ borderColor: REDWOOD.info, color: REDWOOD.info }}
              size="small"
            >
              Fetch from Fusion
            </Button>
          </Tooltip>
        }
        style={{ border: `1px solid ${REDWOOD.border}` }}
      >
        {syncStatus && (
          <Alert
            type={syncStatus.type}
            message={syncStatus.msg}
            closable
            onClose={() => setSyncStatus(null)}
            style={{ marginBottom: 12 }}
          />
        )}
        {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} />}
        <Spin spinning={loading}>
          <Table
            dataSource={data}
            columns={columns}
            rowKey="code"
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Total ${t}` }}
            locale={{
              emptyText: searched
                ? 'No currencies found.'
                : 'Enter search criteria and click Search.',
            }}
            rowClassName={(_, idx) =>
              idx % 2 === 0 ? '' : 'alt-row'
            }
          />
        </Spin>
      </Card>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// TAB 2: Rate Types
// ═══════════════════════════════════════════════════════════════
const RateTypesTab: React.FC = () => {
  const [rows, setRows]       = useState<RateType[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [currencies, setCurrencies] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${ORDS_BASE}/currencies/ratetypes`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const items: any[] = json.items ?? json.data ?? (Array.isArray(json) ? json : []);
      setRows(items.map(r => ({
        key: String(r.rate_type_id ?? r.RATE_TYPE_ID),
        rate_type_id: r.rate_type_id ?? r.RATE_TYPE_ID,
        name: r.name ?? r.NAME ?? '',
        description: r.description ?? r.DESCRIPTION ?? '',
        default_rate_type: (r.default_rate_type ?? r.DEFAULT_RATE_TYPE) === 'Y',
        enforce_inverse_relationship: (r.enforce_inverse_relationship ?? r.ENFORCE_INVERSE_RELATIONSHIP) === 'Y',
        enable_cross_rates: (r.enable_cross_rates ?? r.ENABLE_CROSS_RATES) === 'Y',
        allow_cross_rates_override: (r.allow_cross_rates_override ?? r.ALLOW_CROSS_RATES_OVERRIDE) === 'Y',
        cross_rate_pivot_currency: r.cross_rate_pivot_currency ?? r.CROSS_RATE_PIVOT_CURRENCY ?? '',
      })));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCurrencies = useCallback(async () => {
    try {
      const res = await fetch(`${ORDS_BASE}/currencies?enabled=Y`);
      if (!res.ok) return;
      const json = await res.json();
      const items: any[] = json.items ?? json.data ?? (Array.isArray(json) ? json : []);
      setCurrencies(items.map(r => r.currency_code ?? r.CURRENCY_CODE));
    } catch (_) {}
  }, []);

  useEffect(() => { load(); loadCurrencies(); }, [load, loadCurrencies]);

  const addRow = () => {
    const newKey = `new_${Date.now()}`;
    setRows(prev => [...prev, {
      key: newKey,
      rate_type_id: null,
      name: '',
      description: '',
      default_rate_type: false,
      enforce_inverse_relationship: false,
      enable_cross_rates: false,
      allow_cross_rates_override: false,
      cross_rate_pivot_currency: '',
      isNew: true,
      isDirty: true,
    }]);
  };

  const updateRow = (key: string, field: keyof RateType, value: any) => {
    setRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value, isDirty: true } : r));
  };

  const deleteRow = async (row: RateType) => {
    if (!row.isNew && row.rate_type_id) {
      try {
        const res = await fetch(`${ORDS_BASE}/currencies/ratetypes/${row.rate_type_id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        message.success('Rate type deleted');
      } catch (e: any) {
        message.error(`Delete failed: ${e.message}`);
        return;
      }
    }
    setRows(prev => prev.filter(r => r.key !== row.key));
  };

  const handleSave = async () => {
    const dirty = rows.filter(r => r.isDirty);
    if (!dirty.length) { message.info('No changes to save'); return; }
    for (const r of dirty) {
      if (!r.name.trim()) {
        message.error('Rate type Name is required for all rows');
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        items: dirty.map(r => ({
          id: r.rate_type_id,
          name: r.name,
          description: r.description,
          defaultRateType: r.default_rate_type ? 'Y' : 'N',
          enforceInverseRelationship: r.enforce_inverse_relationship ? 'Y' : 'N',
          enableCrossRates: r.enable_cross_rates ? 'Y' : 'N',
          allowCrossRatesOverride: r.allow_cross_rates_override ? 'Y' : 'N',
          crossRatePivotCurrency: r.cross_rate_pivot_currency || null,
        })),
      };
      const res = await fetch(`${ORDS_BASE}/currencies/ratetypes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      message.success('Rate types saved');
      await load();
    } catch (e: any) {
      message.error(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      width: 180,
      render: (v: string, row: RateType) => (
        <Input
          value={v}
          onChange={e => updateRow(row.key, 'name', e.target.value)}
          size="small"
          style={{ borderColor: !v.trim() ? REDWOOD.primary : undefined }}
        />
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      render: (v: string, row: RateType) => (
        <Input
          value={v}
          onChange={e => updateRow(row.key, 'description', e.target.value)}
          size="small"
        />
      ),
    },
    {
      title: (
        <Tooltip title="Mark as the default rate type">
          <span>Default<br/>Rate Type</span>
        </Tooltip>
      ),
      dataIndex: 'default_rate_type',
      width: 90,
      align: 'center' as const,
      render: (v: boolean, row: RateType) =>
        v ? (
          <CheckCircleFilled style={{ color: REDWOOD.success, fontSize: 18 }} />
        ) : (
          <Checkbox
            checked={false}
            onChange={() => {
              // only one default at a time
              setRows(prev => prev.map(r => ({
                ...r,
                default_rate_type: r.key === row.key,
                isDirty: r.key === row.key || r.default_rate_type ? true : r.isDirty,
              })));
            }}
          />
        ),
    },
    {
      title: (
        <Tooltip title="Enforce Inverse Relationship">
          <span>Enforce<br/>Inverse</span>
        </Tooltip>
      ),
      dataIndex: 'enforce_inverse_relationship',
      width: 80,
      align: 'center' as const,
      render: (v: boolean, row: RateType) => (
        <Checkbox checked={v} onChange={e => updateRow(row.key, 'enforce_inverse_relationship', e.target.checked)} />
      ),
    },
    {
      title: (
        <Tooltip title="Enable Cross Rates">
          <span>Enable<br/>Cross Rates</span>
        </Tooltip>
      ),
      dataIndex: 'enable_cross_rates',
      width: 80,
      align: 'center' as const,
      render: (v: boolean, row: RateType) => (
        <Checkbox checked={v} onChange={e => updateRow(row.key, 'enable_cross_rates', e.target.checked)} />
      ),
    },
    {
      title: (
        <Tooltip title="Allow Cross Rates Override">
          <span>Allow Cross<br/>Override</span>
        </Tooltip>
      ),
      dataIndex: 'allow_cross_rates_override',
      width: 80,
      align: 'center' as const,
      render: (v: boolean, row: RateType) => (
        <Checkbox checked={v} onChange={e => updateRow(row.key, 'allow_cross_rates_override', e.target.checked)} />
      ),
    },
    {
      title: (
        <Tooltip title="Cross Rate Pivot Currency">
          <span>Pivot<br/>Currency</span>
        </Tooltip>
      ),
      dataIndex: 'cross_rate_pivot_currency',
      width: 110,
      render: (v: string, row: RateType) => (
        <Select
          value={v || undefined}
          onChange={val => updateRow(row.key, 'cross_rate_pivot_currency', val ?? '')}
          size="small"
          style={{ width: '100%' }}
          allowClear
          showSearch
          placeholder="—"
          disabled={!row.enable_cross_rates}
        >
          {currencies.map(c => <Option key={c} value={c}>{c}</Option>)}
        </Select>
      ),
    },
    {
      title: '',
      width: 50,
      align: 'center' as const,
      render: (_: any, row: RateType) => (
        <Popconfirm
          title="Delete this rate type?"
          onConfirm={() => deleteRow(row)}
          okText="Yes"
          cancelText="No"
        >
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            size="small"
          />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Title level={5} style={{ margin: 0 }}>Rate Types</Title>
        <Space>
          <Button icon={<PlusOutlined />} onClick={addRow} size="small">Add Row</Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
            size="small"
            style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
          >
            Save
          </Button>
        </Space>
      </div>

      {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} closable />}

      <Spin spinning={loading}>
        <Table
          dataSource={rows}
          columns={columns}
          rowKey="key"
          size="small"
          pagination={false}
          rowClassName={row => row.isDirty ? 'dirty-row' : ''}
          locale={{ emptyText: 'No rate types defined.' }}
          style={{ border: `1px solid ${REDWOOD.border}`, borderRadius: 4 }}
        />
      </Spin>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// TAB 3: Daily Rates
// ═══════════════════════════════════════════════════════════════
const DailyRatesTab: React.FC = () => {
  const [fromCurrency, setFromCurrency] = useState('');
  const [toCurrency, setToCurrency]     = useState('');
  const [rateType, setRateType]         = useState('');
  const [dateFrom, setDateFrom]         = useState<dayjs.Dayjs | null>(null);
  const [dateTo, setDateTo]             = useState<dayjs.Dayjs | null>(null);
  const [data, setData]                 = useState<DailyRate[]>([]);
  const [loading, setLoading]           = useState(false);
  const [searched, setSearched]         = useState(false);
  const [error, setError]               = useState('');
  const [currencies, setCurrencies]     = useState<string[]>([]);
  const [rateTypes, setRateTypes]       = useState<string[]>([]);

  // Add-rate modal state
  const [addForm] = Form.useForm();
  const [adding, setAdding]     = useState(false);
  const [showAdd, setShowAdd]   = useState(false);

  const loadDropdowns = useCallback(async () => {
    try {
      const [cRes, rtRes] = await Promise.all([
        fetch(`${ORDS_BASE}/currencies?enabled=Y`),
        fetch(`${ORDS_BASE}/currencies/ratetypes`),
      ]);
      if (cRes.ok) {
        const cj = await cRes.json();
        const items: any[] = cj.items ?? cj.data ?? (Array.isArray(cj) ? cj : []);
        setCurrencies(items.map(r => r.currency_code ?? r.CURRENCY_CODE));
      }
      if (rtRes.ok) {
        const rj = await rtRes.json();
        const items: any[] = rj.items ?? rj.data ?? (Array.isArray(rj) ? rj : []);
        setRateTypes(items.map(r => r.name ?? r.NAME));
      }
    } catch (_) {}
  }, []);

  useEffect(() => { loadDropdowns(); }, [loadDropdowns]);

  const handleSearch = useCallback(async () => {
    if (!fromCurrency && !toCurrency) {
      message.warning('At least one of From Currency or To Currency is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (fromCurrency)  params.set('from_currency', fromCurrency);
      if (toCurrency)    params.set('to_currency', toCurrency);
      if (rateType)      params.set('rate_type', rateType);
      if (dateFrom)      params.set('date_from', dateFrom.format('YYYY-MM-DD'));
      if (dateTo)        params.set('date_to', dateTo.format('YYYY-MM-DD'));
      params.set('row_limit', '500');

      const res = await fetch(`${ORDS_BASE}/currencies/dailyrates?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const items: any[] = json.items ?? json.data ?? (Array.isArray(json) ? json : []);
      setData(items.map(r => ({
        rate_id:       r.rate_id       ?? r.RATE_ID,
        from_currency: r.from_currency ?? r.FROM_CURRENCY,
        to_currency:   r.to_currency   ?? r.TO_CURRENCY,
        rate_date:     r.rate_date     ?? r.RATE_DATE,
        rate_type:     r.rate_type     ?? r.RATE_TYPE,
        rate:          r.rate          ?? r.RATE,
        inverse_rate:  r.inverse_rate  ?? r.INVERSE_RATE,
        source:        r.source        ?? r.SOURCE ?? 'MANUAL',
      })));
      setSearched(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fromCurrency, toCurrency, rateType, dateFrom, dateTo]);

  const handleReset = () => {
    setFromCurrency('');
    setToCurrency('');
    setRateType('');
    setDateFrom(null);
    setDateTo(null);
    setData([]);
    setSearched(false);
    setError('');
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`${ORDS_BASE}/currencies/dailyrates/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(prev => prev.filter(r => r.rate_id !== id));
      message.success('Rate deleted');
    } catch (e: any) {
      message.error(`Delete failed: ${e.message}`);
    }
  };

  const handleAddSave = async () => {
    try {
      const vals = await addForm.validateFields();
      setAdding(true);
      const payload = {
        fromCurrency: vals.fromCurrency,
        toCurrency:   vals.toCurrency,
        rateDate:     vals.rateDate.format('YYYY-MM-DD'),
        rateType:     vals.rateType,
        rate:         parseFloat(vals.rate),
        source:       'MANUAL',
      };
      const res = await fetch(`${ORDS_BASE}/currencies/dailyrates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      message.success('Daily rate saved');
      setShowAdd(false);
      addForm.resetFields();
      if (searched) await handleSearch();
    } catch (e: any) {
      if (e.errorFields) return; // validation only
      message.error(`Save failed: ${e.message}`);
    } finally {
      setAdding(false);
    }
  };

  const columns = [
    {
      title: 'From Currency',
      dataIndex: 'from_currency',
      width: 130,
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: 'To Currency',
      dataIndex: 'to_currency',
      width: 130,
      render: (v: string) => <Tag color="geekblue">{v}</Tag>,
    },
    {
      title: 'Rate Date',
      dataIndex: 'rate_date',
      width: 130,
      render: (v: string) => fmtDate(v),
    },
    {
      title: 'Rate Type',
      dataIndex: 'rate_type',
      width: 140,
    },
    {
      title: 'Rate',
      dataIndex: 'rate',
      width: 140,
      align: 'right' as const,
      render: (v: number) => v?.toFixed(6),
    },
    {
      title: 'Inverse Rate',
      dataIndex: 'inverse_rate',
      width: 140,
      align: 'right' as const,
      render: (v: number) => v?.toFixed(6),
    },
    {
      title: 'Source',
      dataIndex: 'source',
      width: 100,
    },
    {
      title: '',
      width: 50,
      align: 'center' as const,
      render: (_: any, row: DailyRate) => (
        <Popconfirm
          title="Delete this rate?"
          onConfirm={() => handleDelete(row.rate_id)}
          okText="Yes"
          cancelText="No"
        >
          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      {/* Search Section */}
      <Card
        size="small"
        style={{ marginBottom: 16, border: `1px solid ${REDWOOD.border}` }}
        title={
          <Space>
            <SearchOutlined style={{ color: REDWOOD.info }} />
            <Text strong>Search</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>** At least one currency is required</Text>
          </Space>
        }
      >
        <Row gutter={[16, 12]}>
          <Col xs={24} sm={12} md={8}>
            <Row align="middle" gutter={8}>
              <Col flex="110px">
                <Text>
                  <Text style={{ color: REDWOOD.primary }}>**</Text> From Currency
                </Text>
              </Col>
              <Col flex="auto">
                <Select
                  value={fromCurrency || undefined}
                  onChange={v => setFromCurrency(v ?? '')}
                  style={{ width: '100%' }}
                  showSearch
                  allowClear
                  placeholder="Select"
                >
                  {currencies.map(c => <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </Col>
            </Row>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Row align="middle" gutter={8}>
              <Col flex="110px">
                <Text>
                  <Text style={{ color: REDWOOD.primary }}>*</Text> Rate Date
                </Text>
              </Col>
              <Col flex="auto">
                <Space.Compact style={{ width: '100%' }}>
                  <DatePicker
                    value={dateFrom}
                    onChange={d => setDateFrom(d)}
                    format="DD-MMM-YYYY"
                    style={{ width: '50%' }}
                    placeholder="From"
                  />
                  <DatePicker
                    value={dateTo}
                    onChange={d => setDateTo(d)}
                    format="DD-MMM-YYYY"
                    style={{ width: '50%' }}
                    placeholder="To"
                  />
                </Space.Compact>
              </Col>
            </Row>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Row align="middle" gutter={8}>
              <Col flex="110px">
                <Text>
                  <Text style={{ color: REDWOOD.primary }}>**</Text> To Currency
                </Text>
              </Col>
              <Col flex="auto">
                <Select
                  value={toCurrency || undefined}
                  onChange={v => setToCurrency(v ?? '')}
                  style={{ width: '100%' }}
                  showSearch
                  allowClear
                  placeholder="Select"
                >
                  {currencies.map(c => <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </Col>
            </Row>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Row align="middle" gutter={8}>
              <Col flex="110px"><Text>Rate Type</Text></Col>
              <Col flex="auto">
                <Select
                  value={rateType || undefined}
                  onChange={v => setRateType(v ?? '')}
                  style={{ width: '100%' }}
                  allowClear
                  placeholder="All"
                >
                  {rateTypes.map(rt => <Option key={rt} value={rt}>{rt}</Option>)}
                </Select>
              </Col>
            </Row>
          </Col>
          <Col xs={24} style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={handleReset} icon={<ReloadOutlined />}>Reset</Button>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleSearch}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
              >
                Search
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Results */}
      <Card
        size="small"
        title={
          <Space>
            <Text strong>Search Results</Text>
            {searched && <Tag color="blue">{data.length} record{data.length !== 1 ? 's' : ''}</Tag>}
          </Space>
        }
        extra={
          <Button
            icon={<PlusOutlined />}
            size="small"
            onClick={() => setShowAdd(v => !v)}
            type={showAdd ? 'primary' : 'default'}
            style={showAdd ? { background: REDWOOD.info, borderColor: REDWOOD.info } : {}}
          >
            Add Rate
          </Button>
        }
        style={{ border: `1px solid ${REDWOOD.border}` }}
      >
        {/* Inline Add Form */}
        {showAdd && (
          <Card
            size="small"
            style={{
              marginBottom: 16,
              background: REDWOOD.surfaceAlt,
              border: `1px dashed ${REDWOOD.info}`,
            }}
          >
            <Form form={addForm} layout="inline" size="small">
              <Form.Item name="fromCurrency" label="From" rules={[{ required: true }]}>
                <Select showSearch style={{ width: 100 }} placeholder="From">
                  {currencies.map(c => <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </Form.Item>
              <Form.Item name="toCurrency" label="To" rules={[{ required: true }]}>
                <Select showSearch style={{ width: 100 }} placeholder="To">
                  {currencies.map(c => <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </Form.Item>
              <Form.Item name="rateDate" label="Date" rules={[{ required: true }]}>
                <DatePicker format="DD-MMM-YYYY" style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="rateType" label="Type" rules={[{ required: true }]}>
                <Select style={{ width: 120 }} placeholder="Type">
                  {rateTypes.map(rt => <Option key={rt} value={rt}>{rt}</Option>)}
                </Select>
              </Form.Item>
              <Form.Item name="rate" label="Rate" rules={[{ required: true, pattern: /^\d+(\.\d+)?$/, message: 'Numeric' }]}>
                <Input style={{ width: 120 }} placeholder="e.g. 3.67250" />
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button
                    type="primary"
                    size="small"
                    loading={adding}
                    onClick={handleAddSave}
                    style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
                    icon={<SaveOutlined />}
                  >
                    Save
                  </Button>
                  <Button size="small" onClick={() => { setShowAdd(false); addForm.resetFields(); }}>
                    Cancel
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>
        )}

        {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} closable />}
        <Spin spinning={loading}>
          <Table
            dataSource={data}
            columns={columns}
            rowKey="rate_id"
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `Total ${t}` }}
            locale={{
              emptyText: searched
                ? 'No rates found for the given criteria.'
                : 'No search conducted.',
            }}
          />
        </Spin>
      </Card>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE — Currencies
// ═══════════════════════════════════════════════════════════════
const Currencies: React.FC = () => {
  const [activeTab, setActiveTab] = useState('currencies');

  const tabItems = [
    {
      key: 'currencies',
      label: 'Currencies',
      children: <CurrenciesTab />,
    },
    {
      key: 'ratetypes',
      label: 'Rate Types',
      children: <RateTypesTab />,
    },
    {
      key: 'dailyrates',
      label: 'Daily Rates',
      children: <DailyRatesTab />,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: REDWOOD.surfaceAlt }}>
      <Content style={{ padding: '16px 24px' }}>
        {/* Breadcrumb */}
        <Breadcrumb
          style={{ marginBottom: 12 }}
          items={[
            { title: <Link to="/"><HomeOutlined /></Link> },
            { title: <Link to="/gl">General Ledger</Link> },
            { title: 'Currencies' },
          ]}
        />

        {/* Page Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 16,
            padding: '12px 16px',
            background: REDWOOD.surface,
            border: `1px solid ${REDWOOD.border}`,
            borderRadius: 6,
            borderLeft: `4px solid ${REDWOOD.warning}`,
          }}
        >
          <DollarOutlined style={{ fontSize: 24, color: REDWOOD.warning }} />
          <div>
            <Title level={4} style={{ margin: 0, color: REDWOOD.textPrimary }}>
              Currencies
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Manage currencies, rate types, and daily exchange rates
            </Text>
          </div>
        </div>

        {/* Tabs */}
        <Card
          style={{ border: `1px solid ${REDWOOD.border}`, borderRadius: 6 }}
          bodyStyle={{ padding: '0 16px 16px' }}
        >
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={tabItems}
            style={{ marginTop: 0 }}
            tabBarStyle={{ borderBottom: `2px solid ${REDWOOD.border}`, marginBottom: 16 }}
          />
        </Card>
      </Content>

      {/* Inline styles */}
      <style>{`
        .alt-row td { background: ${REDWOOD.surfaceAlt} !important; }
        .dirty-row td { background: #fffbe6 !important; }
        .ant-tabs-tab.ant-tabs-tab-active .ant-tabs-tab-btn {
          color: ${REDWOOD.info} !important;
          font-weight: 600;
        }
        .ant-tabs-ink-bar { background: ${REDWOOD.info} !important; }
      `}</style>
    </Layout>
  );
};

export default Currencies;
