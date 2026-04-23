import React, { useState, useEffect } from 'react';
import {
  Layout, Card, Form, Input, Select, Button, Space, Typography, Row, Col,
  Steps, InputNumber, DatePicker, Descriptions, message, Breadcrumb, Divider,
} from 'antd';
import {
  HomeOutlined, SaveOutlined, LeftOutlined, RightOutlined,
  CheckCircleOutlined, DatabaseOutlined, BookOutlined, EnvironmentOutlined,
  BarcodeOutlined, DollarOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import Autopilot from '../../components/Autopilot';
import {
  createAsset, getCategories, getMethods, getLocations, getBookControls,
  assetTypeLabel, formatCurrency,
} from '../../services/fa.service';
import type { CategoryRecord, MethodRecord, LocationRecord, BookControlRecord } from '../../services/fa.service';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

const REDWOOD = {
  primary:    '#C74634',
  success:    '#1D7B4D',
  warning:    '#D4A800',
  info:       '#0572CE',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral600: '#6B6B6B',
  neutral900: '#1A1A1A',
  surface:    '#FFFFFF',
};
const FA_COLOR = '#CA7700';

const STEPS = ['Asset Details', 'Book & Financials', 'Assignment', 'Review & Submit'];

const CreateAsset: React.FC = () => {
  const navigate = useNavigate();
  const [form]    = Form.useForm();
  const [current, setCurrent] = useState(0);
  const [saving,  setSaving]  = useState(false);

  // Lookup data
  const [categories,   setCategories]   = useState<CategoryRecord[]>([]);
  const [methods,      setMethods]      = useState<MethodRecord[]>([]);
  const [locations,    setLocations]    = useState<LocationRecord[]>([]);
  const [bookControls, setBookControls] = useState<BookControlRecord[]>([]);

  // Collected values across steps (merged on submit)
  const [stepData, setStepData] = useState<Record<string, any>>({});

  useEffect(() => {
    getCategories().then(setCategories);
    getMethods().then(setMethods);
    getLocations().then(setLocations);
    getBookControls().then(setBookControls);
  }, []);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const goNext = async () => {
    try {
      const vals = await form.validateFields();
      setStepData(prev => ({ ...prev, ...vals }));
      setCurrent(c => c + 1);
    } catch {
      // validation errors shown inline
    }
  };

  const goBack = () => {
    const vals = form.getFieldsValue();
    setStepData(prev => ({ ...prev, ...vals }));
    setCurrent(c => c - 1);
  };

  const handleSubmit = async () => {
    const vals = form.getFieldsValue();
    const payload = { ...stepData, ...vals };

    // Convert dayjs → string
    if (payload.datePlacedInService && dayjs.isDayjs(payload.datePlacedInService)) {
      payload.datePlacedInService = payload.datePlacedInService.format('YYYY-MM-DD');
    }

    setSaving(true);
    try {
      const res = await createAsset(payload);
      if (res.success) {
        message.success(`Asset ${res.assetNumber} created (ID: ${res.assetId})`);
        navigate('/fa/assets');
      } else {
        message.error(res.error || 'Failed to create asset');
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Step 0 — Asset Details ──────────────────────────────────────────────────
  const StepDetails = () => (
    <Row gutter={[24, 0]}>
      <Col xs={24} sm={12}>
        <Form.Item name="assetNumber" label="Asset Number" rules={[{ required: true, message: 'Required' }]}>
          <Input placeholder="e.g. FA-0001" prefix={<BarcodeOutlined />} />
        </Form.Item>
      </Col>
      <Col xs={24} sm={12}>
        <Form.Item name="assetType" label="Asset Type" rules={[{ required: true, message: 'Required' }]}>
          <Select placeholder="Select type">
            <Option value="CAPITALIZED">Capitalized</Option>
            <Option value="CIP">CIP (Construction In Progress)</Option>
            <Option value="EXPENSED">Expensed</Option>
          </Select>
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Form.Item name="description" label="Description" rules={[{ required: true, message: 'Required' }]}>
          <Input.TextArea rows={2} placeholder="Asset description" />
        </Form.Item>
      </Col>
      <Col xs={24} sm={12}>
        <Form.Item name="categoryId" label="Category" rules={[{ required: true, message: 'Required' }]}>
          <Select showSearch optionFilterProp="children" placeholder="Select category">
            {categories.map(c => (
              <Option key={c.categoryId} value={c.categoryId}>
                {[c.segment1, c.segment2].filter(Boolean).join(' / ')} — {c.description}
              </Option>
            ))}
          </Select>
        </Form.Item>
      </Col>
      <Col xs={24} sm={12}>
        <Form.Item name="tagNumber" label="Tag Number">
          <Input placeholder="Physical tag / barcode" />
        </Form.Item>
      </Col>
      <Col xs={24} sm={12}>
        <Form.Item name="serialNumber" label="Serial Number">
          <Input placeholder="Manufacturer serial" />
        </Form.Item>
      </Col>
      <Col xs={24} sm={12}>
        <Form.Item name="manufacturerName" label="Manufacturer">
          <Input placeholder="e.g. Dell, Cisco" />
        </Form.Item>
      </Col>
      <Col xs={24} sm={12}>
        <Form.Item name="modelNumber" label="Model Number">
          <Input placeholder="Model / part number" />
        </Form.Item>
      </Col>
      <Col xs={24} sm={4}>
        <Form.Item name="units" label="Units" initialValue={1}>
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
      </Col>
      <Col xs={24} sm={6}>
        <Form.Item name="inUseFlag" label="In Use" initialValue="YES">
          <Select>
            <Option value="YES">Yes</Option>
            <Option value="NO">No</Option>
          </Select>
        </Form.Item>
      </Col>
      <Col xs={24} sm={7}>
        <Form.Item name="ownedLeased" label="Owned / Leased" initialValue="OWNED">
          <Select>
            <Option value="OWNED">Owned</Option>
            <Option value="LEASED">Leased</Option>
          </Select>
        </Form.Item>
      </Col>
      <Col xs={24} sm={7}>
        <Form.Item name="newUsed" label="New / Used" initialValue="NEW">
          <Select>
            <Option value="NEW">New</Option>
            <Option value="USED">Used</Option>
          </Select>
        </Form.Item>
      </Col>
    </Row>
  );

  // ── Step 1 — Book & Financials ──────────────────────────────────────────────
  const StepBook = () => (
    <Row gutter={[24, 0]}>
      <Col xs={24} sm={12}>
        <Form.Item name="bookTypeCode" label="Book Type" rules={[{ required: true, message: 'Required' }]}>
          <Select showSearch optionFilterProp="children" placeholder="Select book">
            {bookControls.map(b => (
              <Option key={b.bookTypeCode} value={b.bookTypeCode}>
                {b.bookTypeCode} — {b.bookTypeName}
              </Option>
            ))}
          </Select>
        </Form.Item>
      </Col>
      <Col xs={24} sm={12}>
        <Form.Item name="datePlacedInService" label="Date Placed in Service" rules={[{ required: true, message: 'Required' }]}>
          <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="DD-MMM-YYYY" />
        </Form.Item>
      </Col>
      <Col xs={24} sm={8}>
        <Form.Item name="cost" label="Cost" rules={[{ required: true, message: 'Required' }]}>
          <InputNumber
            style={{ width: '100%' }} min={0} step={0.01}
            formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={v => (v ? parseFloat(v.replace(/,/g, '')) : 0) as unknown as 0}
            prefix={<DollarOutlined />}
            placeholder="0.00"
          />
        </Form.Item>
      </Col>
      <Col xs={24} sm={8}>
        <Form.Item name="salvageValue" label="Salvage Value" initialValue={0}>
          <InputNumber
            style={{ width: '100%' }} min={0} step={0.01}
            formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={v => (v ? parseFloat(v.replace(/,/g, '')) : 0) as unknown as 0}
            placeholder="0.00"
          />
        </Form.Item>
      </Col>
      <Col xs={24} sm={8}>
        <Form.Item name="depreciateFlag" label="Depreciate?" initialValue="YES">
          <Select>
            <Option value="YES">Yes</Option>
            <Option value="NO">No</Option>
          </Select>
        </Form.Item>
      </Col>
      <Col xs={24} sm={12}>
        <Form.Item name="methodId" label="Depreciation Method">
          <Select showSearch optionFilterProp="children" allowClear placeholder="Select method">
            {methods.map(m => (
              <Option key={m.methodId} value={m.methodId}>
                {m.methodCode} — {m.name} ({m.lifeInMonths}m)
              </Option>
            ))}
          </Select>
        </Form.Item>
      </Col>
      <Col xs={24} sm={12}>
        <Form.Item name="capitalizedFlag" label="Capitalize?" initialValue="YES">
          <Select>
            <Option value="YES">Yes</Option>
            <Option value="NO">No</Option>
          </Select>
        </Form.Item>
      </Col>
      <Col xs={24} sm={12}>
        <Form.Item name="propertyTypeCode" label="Property Type">
          <Select allowClear placeholder="Select">
            <Option value="REAL">Real</Option>
            <Option value="PERSONAL">Personal</Option>
          </Select>
        </Form.Item>
      </Col>
    </Row>
  );

  // ── Step 2 — Assignment ─────────────────────────────────────────────────────
  const StepAssignment = () => (
    <Row gutter={[24, 0]}>
      <Col xs={24} sm={12}>
        <Form.Item name="locationId" label="Location">
          <Select showSearch optionFilterProp="children" allowClear placeholder="Select location">
            {locations.map(l => (
              <Option key={l.locationId} value={l.locationId}>{l.fullLocation}</Option>
            ))}
          </Select>
        </Form.Item>
      </Col>
      <Col xs={24} sm={12}>
        <Form.Item name="codeCombinationId" label="Account (CCID)">
          <Input placeholder="GL Code Combination ID" />
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Card size="small" style={{ background: REDWOOD.neutral100, borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            The location and account combination will create the initial distribution record for this asset.
            Both fields are optional — you can assign them later via asset adjustments.
          </Text>
        </Card>
      </Col>
    </Row>
  );

  // ── Step 3 — Review ─────────────────────────────────────────────────────────
  const StepReview = () => {
    const all = { ...stepData, ...form.getFieldsValue() };
    const dateStr = all.datePlacedInService && dayjs.isDayjs(all.datePlacedInService)
      ? all.datePlacedInService.format('DD-MMM-YYYY')
      : all.datePlacedInService || '—';

    const cat = categories.find(c => c.categoryId === all.categoryId);
    const method = methods.find(m => m.methodId === all.methodId);
    const loc = locations.find(l => l.locationId === all.locationId);
    const book = bookControls.find(b => b.bookTypeCode === all.bookTypeCode);

    return (
      <div>
        <Divider orientation={"left" as "left" | "right" | "center"}><BookOutlined /> Asset Details</Divider>
        <Descriptions column={2} size="small" bordered labelStyle={{ fontWeight: 500 }}>
          <Descriptions.Item label="Asset Number">{all.assetNumber || '—'}</Descriptions.Item>
          <Descriptions.Item label="Type">{assetTypeLabel(all.assetType)}</Descriptions.Item>
          <Descriptions.Item label="Description" span={2}>{all.description || '—'}</Descriptions.Item>
          <Descriptions.Item label="Category">{cat ? `${cat.segment1}/${cat.segment2} — ${cat.description}` : all.categoryId || '—'}</Descriptions.Item>
          <Descriptions.Item label="Units">{all.units ?? 1}</Descriptions.Item>
          <Descriptions.Item label="Tag Number">{all.tagNumber || '—'}</Descriptions.Item>
          <Descriptions.Item label="Serial Number">{all.serialNumber || '—'}</Descriptions.Item>
          <Descriptions.Item label="Manufacturer">{all.manufacturerName || '—'}</Descriptions.Item>
          <Descriptions.Item label="Model">{all.modelNumber || '—'}</Descriptions.Item>
          <Descriptions.Item label="In Use">{all.inUseFlag || '—'}</Descriptions.Item>
          <Descriptions.Item label="Owned/Leased">{all.ownedLeased || '—'}</Descriptions.Item>
        </Descriptions>

        <Divider orientation={"left" as "left" | "right" | "center"}><DollarOutlined /> Book & Financials</Divider>
        <Descriptions column={2} size="small" bordered labelStyle={{ fontWeight: 500 }}>
          <Descriptions.Item label="Book">{book ? `${book.bookTypeCode} — ${book.bookTypeName}` : all.bookTypeCode || '—'}</Descriptions.Item>
          <Descriptions.Item label="Date in Service">{dateStr}</Descriptions.Item>
          <Descriptions.Item label="Cost">{formatCurrency(all.cost ?? 0)}</Descriptions.Item>
          <Descriptions.Item label="Salvage Value">{formatCurrency(all.salvageValue ?? 0)}</Descriptions.Item>
          <Descriptions.Item label="Depreciate">{all.depreciateFlag || '—'}</Descriptions.Item>
          <Descriptions.Item label="Method">{method ? `${method.methodCode} (${method.lifeInMonths}m)` : all.methodId || '—'}</Descriptions.Item>
          <Descriptions.Item label="Property Type">{all.propertyTypeCode || '—'}</Descriptions.Item>
          <Descriptions.Item label="Capitalize">{all.capitalizedFlag || '—'}</Descriptions.Item>
        </Descriptions>

        <Divider orientation={"left" as "left" | "right" | "center"}><EnvironmentOutlined /> Assignment</Divider>
        <Descriptions column={2} size="small" bordered labelStyle={{ fontWeight: 500 }}>
          <Descriptions.Item label="Location">{loc ? loc.fullLocation : all.locationId || '—'}</Descriptions.Item>
          <Descriptions.Item label="CCID">{all.codeCombinationId || '—'}</Descriptions.Item>
        </Descriptions>
      </div>
    );
  };

  const stepContent = [<StepDetails />, <StepBook />, <StepAssignment />, <StepReview />];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb */}
        <div style={{ padding: '16px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/fa">Fixed Assets</Link> },
            { title: <Link to="/fa/assets">Manage Assets</Link> },
            { title: 'Create Asset' },
          ]} />
        </div>

        <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: `linear-gradient(135deg, ${FA_COLOR} 0%, #9E5C00 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <DatabaseOutlined style={{ fontSize: 22, color: '#fff' }} />
            </div>
            <div>
              <Title level={4} style={{ margin: 0 }}>Create Fixed Asset</Title>
              <Text type="secondary" style={{ fontSize: 12 }}>Add a new asset to the register</Text>
            </div>
          </div>

          {/* Steps indicator */}
          <Steps
            current={current}
            items={STEPS.map((s, i) => ({
              title: s,
              icon: current > i ? <CheckCircleOutlined /> : undefined,
            }))}
            style={{ marginBottom: 28 }}
            size="small"
          />

          {/* Step card */}
          <Card
            style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}
            bodyStyle={{ padding: 28 }}
            title={
              <Space>
                {current === 0 && <BarcodeOutlined style={{ color: FA_COLOR }} />}
                {current === 1 && <BookOutlined    style={{ color: FA_COLOR }} />}
                {current === 2 && <EnvironmentOutlined style={{ color: FA_COLOR }} />}
                {current === 3 && <CheckCircleOutlined style={{ color: REDWOOD.success }} />}
                <Text strong style={{ fontSize: 15 }}>{STEPS[current]}</Text>
              </Space>
            }
          >
            <Form
              form={form}
              layout="vertical"
              initialValues={{ units: 1, inUseFlag: 'YES', ownedLeased: 'OWNED', newUsed: 'NEW',
                               depreciateFlag: 'YES', capitalizedFlag: 'YES', salvageValue: 0 }}
            >
              {stepContent[current]}
            </Form>
          </Card>

          {/* Navigation buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
            <Button
              icon={<LeftOutlined />}
              onClick={current === 0 ? () => navigate('/fa/assets') : goBack}
            >
              {current === 0 ? 'Cancel' : 'Back'}
            </Button>
            <Space>
              {current < STEPS.length - 1 && (
                <Button
                  type="primary" icon={<RightOutlined />} iconPosition="end"
                  style={{ background: FA_COLOR, borderColor: FA_COLOR }}
                  onClick={goNext}
                >
                  Next
                </Button>
              )}
              {current === STEPS.length - 1 && (
                <Button
                  type="primary" icon={<SaveOutlined />} loading={saving}
                  style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
                  onClick={handleSubmit}
                >
                  Create Asset
                </Button>
              )}
            </Space>
          </div>
        </div>
      </Content>

      <Autopilot />
    </Layout>
  );
};

export default CreateAsset;
