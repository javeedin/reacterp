import React, { useState, useEffect, useCallback } from 'react';
import {
  Layout, Breadcrumb, Typography, Card, Table, Button, Form, Input, Select,
  Space, Tag, Modal, Popconfirm, message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, BankOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  SearchOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';

const { Content } = Layout;
const { Title } = Typography;
const { Option } = Select;

const REDWOOD = {
  primary: '#C74634', primaryLight: '#E85D4A',
  success: '#1D7B4D', warning: '#D4A800', info: '#0572CE', error: '#D93025',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral300: '#C7C7C7',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
};

const APEX_BASE = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp';

// ── Types ─────────────────────────────────────────────────────────────────────
interface TransactionCode {
  tcId: number;
  businessUnitName: string;
  transactionCode: string;
  description?: string;
  defaultAccountCombination?: string;
  endTransaction?: string;
}

interface BUOption { label: string; value: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────
const parseApexJson = async (res: Response) => {
  const text = await res.text();
  const fixed = text
    .replace(/:(-?)\.(\d)/g, ':$10.$2')
    .replace(/(\d)\.([,}\]])/g, '$1$2');
  return JSON.parse(fixed);
};

const END_TXN_OPTIONS = [
  'External Transaction',
  'Manual Journal',
  'Bank Transfer',
  'Other',
];

const endTxnColor: Record<string, string> = {
  'External Transaction': REDWOOD.info,
  'Manual Journal':       REDWOOD.warning,
  'Bank Transfer':        REDWOOD.success,
  'Other':                REDWOOD.neutral600,
};

// ── Component ─────────────────────────────────────────────────────────────────
const TransactionCodes: React.FC = () => {
  const [records, setRecords]         = useState<TransactionCode[]>([]);
  const [buOptions, setBuOptions]     = useState<BUOption[]>([]);
  const [filterBu, setFilterBu]       = useState<string | undefined>();
  const [loading, setLoading]         = useState(false);
  const [modalOpen, setModalOpen]     = useState(false);
  const [editRecord, setEditRecord]   = useState<TransactionCode | null>(null);
  const [saving, setSaving]           = useState(false);
  const [form] = Form.useForm();

  // Load Business Units
  useEffect(() => {
    fetch(`${APEX_BASE}/gl/businessunits`)
      .then(res => res.json())
      .then((data) => {
        const items: any[] = data.items ?? [];
        setBuOptions(
          items
            .map((b) => {
              const name = b.business_unit_name || '';
              return { label: name, value: name };
            })
            .filter(o => o.value)
            .sort((a, b) => a.label.localeCompare(b.label))
        );
      })
      .catch(() => {});
  }, []);

  // Load transaction codes
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterBu) params.set('business_unit', filterBu);
      const res = await fetch(`${APEX_BASE}/cash/transaction-codes?${params}`);
      const data = await parseApexJson(res);
      const items: TransactionCode[] = (data.items ?? []).map((r: any) => ({
        tcId:                      r.tc_id,
        businessUnitName:          r.business_unit_name        ?? '',
        transactionCode:           r.transaction_code          ?? '',
        description:               r.description,
        defaultAccountCombination: r.default_account_combination,
        endTransaction:            r.end_transaction,
      }));
      setRecords(items);
    } catch (err) {
      message.error('Failed to load transaction codes');
    } finally {
      setLoading(false);
    }
  }, [filterBu]);

  useEffect(() => { loadData(); }, [loadData]);

  // Open add/edit modal
  const openModal = (record?: TransactionCode) => {
    setEditRecord(record ?? null);
    form.setFieldsValue(
      record
        ? {
            businessUnitName:        record.businessUnitName,
            transactionCode:         record.transactionCode,
            description:             record.description,
            defaultAccountCombination: record.defaultAccountCombination,
            endTransaction:          record.endTransaction,
          }
        : { businessUnitName: undefined, transactionCode: '', description: '', defaultAccountCombination: '', endTransaction: undefined }
    );
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); form.resetFields(); setEditRecord(null); };

  // Save (upsert)
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload: Record<string, unknown> = {
        business_unit_name:          values.businessUnitName,
        transaction_code:            (values.transactionCode as string).toUpperCase(),
        description:                 values.description ?? null,
        default_account_combination: values.defaultAccountCombination ?? null,
        end_transaction:             values.endTransaction ?? null,
        last_updated_by:             'APP_USER',
      };
      if (editRecord) {
        payload['tc_id']      = editRecord.tcId;
      } else {
        payload['created_by'] = 'APP_USER';
      }

      const res = await fetch(`${APEX_BASE}/cash/transaction-codes`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await parseApexJson(res);
      if (data.status === 'success') {
        message.success(editRecord ? 'Transaction code updated' : 'Transaction code created');
        closeModal();
        loadData();
      } else {
        message.error(data.message ?? 'Save failed');
      }
    } catch {
      // form validation error — antd shows inline messages
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDelete = async (tcId: number) => {
    try {
      const res = await fetch(`${APEX_BASE}/cash/transaction-codes/${tcId}`, { method: 'DELETE' });
      const data = await parseApexJson(res);
      if (data.status === 'success') {
        message.success('Transaction code deleted');
        loadData();
      } else {
        message.error(data.message ?? 'Delete failed');
      }
    } catch {
      message.error('Delete request failed');
    }
  };

  // Table columns
  const columns: ColumnsType<TransactionCode> = [
    {
      title: 'Transaction Code',
      dataIndex: 'transactionCode',
      key: 'transactionCode',
      width: 160,
      render: (v: string) => <strong style={{ color: REDWOOD.neutral900 }}>{v}</strong>,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Business Unit',
      dataIndex: 'businessUnitName',
      key: 'businessUnitName',
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Default Account',
      dataIndex: 'defaultAccountCombination',
      key: 'defaultAccountCombination',
      width: 200,
      ellipsis: true,
      render: (v?: string) => v ? <code style={{ fontSize: 11 }}>{v}</code> : '—',
    },
    {
      title: 'End Transaction',
      dataIndex: 'endTransaction',
      key: 'endTransaction',
      width: 170,
      render: (v?: string) =>
        v ? (
          <Tag style={{ borderRadius: 4, background: endTxnColor[v] ?? REDWOOD.neutral600, color: '#fff', border: 'none' }}>
            {v}
          </Tag>
        ) : '—',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: TransactionCode) => (
        <Space size={4}>
          <Button
            type="text" size="small" icon={<EditOutlined />}
            style={{ color: REDWOOD.info }}
            onClick={() => openModal(record)}
          />
          <Popconfirm
            title="Delete this transaction code?"
            description="This action cannot be undone."
            onConfirm={() => handleDelete(record.tcId)}
            okText="Delete" okButtonProps={{ danger: true }}
            cancelText="Cancel"
          >
            <Button type="text" size="small" icon={<DeleteOutlined />} style={{ color: REDWOOD.error }} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: REDWOOD.neutral100 }}>
      <Content style={{ padding: '16px 24px' }}>
        {/* Breadcrumb */}
        <Breadcrumb style={{ marginBottom: 12 }}>
          <Breadcrumb.Item><Link to="/"><HomeOutlined /> Home</Link></Breadcrumb.Item>
          <Breadcrumb.Item><Link to="/cash"><BankOutlined /> Cash Management</Link></Breadcrumb.Item>
          <Breadcrumb.Item>Transaction Codes</Breadcrumb.Item>
        </Breadcrumb>

        <Card
          bordered={false}
          style={{ borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}
          bodyStyle={{ padding: 16 }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Title level={4} style={{ margin: 0, color: REDWOOD.neutral900 }}>Transaction Codes</Title>
            <Button
              type="primary" icon={<PlusOutlined />}
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
              onClick={() => openModal()}
            >
              New Transaction Code
            </Button>
          </div>

          {/* Filter bar */}
          <Space style={{ marginBottom: 12 }} wrap>
            <Select
              allowClear
              showSearch
              placeholder="Business Unit"
              style={{ width: 260 }}
              value={filterBu}
              onChange={setFilterBu}
              options={buOptions}
              filterOption={(input, opt) =>
                (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
            <Button
              type="primary" icon={<SearchOutlined />}
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
              onClick={loadData}
            >
              Search
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => { setFilterBu(undefined); }}>
              Reset
            </Button>
          </Space>

          {/* Table */}
          <Table<TransactionCode>
            dataSource={records}
            columns={columns}
            rowKey="tcId"
            loading={loading}
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} records` }}
            style={{ background: REDWOOD.surface }}
          />
        </Card>

        {/* Add / Edit Modal */}
        <Modal
          title={editRecord ? 'Edit Transaction Code' : 'New Transaction Code'}
          open={modalOpen}
          onCancel={closeModal}
          onOk={handleSave}
          confirmLoading={saving}
          okText={editRecord ? 'Update' : 'Create'}
          okButtonProps={{ style: { background: REDWOOD.primary, borderColor: REDWOOD.primary } }}
          destroyOnClose
          width={540}
        >
          <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
            <Form.Item
              name="businessUnitName"
              label="Business Unit"
              rules={[{ required: true, message: 'Business unit is required' }]}
            >
              <Select
                showSearch
                placeholder="Select business unit"
                options={buOptions}
                filterOption={(input, opt) =>
                  (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>

            <Form.Item
              name="transactionCode"
              label="Transaction Code"
              rules={[{ required: true, message: 'Transaction code is required' }]}
              normalize={(v: string) => v?.toUpperCase()}
            >
              <Input placeholder="e.g. MISC_RCPT" maxLength={50} />
            </Form.Item>

            <Form.Item name="description" label="Description">
              <Input.TextArea rows={2} placeholder="Description" maxLength={500} />
            </Form.Item>

            <Form.Item name="defaultAccountCombination" label="Default Account Combination">
              <Input placeholder="e.g. 01-1100-000-0000" maxLength={360} />
            </Form.Item>

            <Form.Item name="endTransaction" label="End Transaction">
              <Select allowClear placeholder="Select end transaction type">
                {END_TXN_OPTIONS.map((opt) => (
                  <Option key={opt} value={opt}>{opt}</Option>
                ))}
              </Select>
            </Form.Item>
          </Form>
        </Modal>
      </Content>
    </Layout>
  );
};

export default TransactionCodes;
