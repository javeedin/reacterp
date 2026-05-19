// ─────────────────────────────────────────────────────────────────────────────
// Approval Management Engine — Main UI Page
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import {
  Layout,
  Typography,
  Tabs,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Tag,
  Space,
  Card,
  Row,
  Col,
  Tooltip,
  Alert,
  Timeline,
  Drawer,
  Divider,
  Popconfirm,
  Avatar,
  notification,
  message,
  Breadcrumb,
  Badge,
  Radio,
  Empty,
} from 'antd';
import {
  HomeOutlined,
  TeamOutlined,
  SafetyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SendOutlined,
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  UserOutlined,
  MailOutlined,
  BellOutlined,
  HistoryOutlined,
  ApartmentOutlined,
  ThunderboltOutlined,
  EyeOutlined,
  ForwardOutlined,
  RollbackOutlined,
  PhoneOutlined,
  SettingOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type {
  ApprovalUser,
  ApprovalRule,
  ApprovalRequest,
  ApprovalHistoryEntry,
  RuleApprover,
} from '../../services/approvals.service';
import {
  APPROVAL_MODULES,
  TRANSACTION_TYPES,
  getApprovalUsers,
  createApprovalUser,
  updateApprovalUser,
  deleteApprovalUser,
  getApprovalRules,
  createApprovalRule,
  updateApprovalRule,
  deleteApprovalRule,
  getApprovalRequests,
  getApprovalHistory,
  sendTestNotification,
} from '../../services/approvals.service';

const { Content } = Layout;
const { Title, Text, Paragraph } = Typography;

// ─── Oracle Redwood Color Palette ─────────────────────────────────────────────

const REDWOOD = {
  primary: '#C74634',
  primaryLight: '#E85D4A',
  primaryDark: '#A33B2C',
  success: '#1D7B4D',
  warning: '#D4A800',
  info: '#0572CE',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral300: '#C7C7C7',
  neutral600: '#6B6B6B',
  neutral900: '#1A1A1A',
  surface: '#FFFFFF',
  surfaceSecondary: '#F5F5F5',
  textPrimary: '#1A1A1A',
  textSecondary: '#6B6B6B',
};

// ─── Helper Utilities ─────────────────────────────────────────────────────────

const fmtAmount = (n?: number | null, ccy = 'AED') =>
  n == null
    ? 'Unlimited'
    : new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n) +
      ' ' +
      ccy;

const statusColor = (s: string): string =>
  (({
    PENDING: 'orange',
    APPROVED: 'success',
    REJECTED: 'error',
    CANCELLED: 'default',
    RECALLED: 'purple',
  } as Record<string, string>)[s] ?? 'default');

const actionColor = (a: string): string =>
  (({
    SUBMITTED: '#0572CE',
    APPROVED: '#1D7B4D',
    REJECTED: '#C74634',
    FORWARDED: '#0572CE',
    RECALLED: '#D4A800',
    NOTIFIED: '#722ed1',
    CANCELLED: '#6B6B6B',
  } as Record<string, string>)[a] ?? '#6B6B6B');

const actionIcon = (a: string): React.ReactNode => {
  const iconMap: Record<string, React.ReactNode> = {
    SUBMITTED: <SendOutlined />,
    APPROVED: <CheckCircleOutlined />,
    REJECTED: <CloseCircleOutlined />,
    FORWARDED: <ForwardOutlined />,
    RECALLED: <RollbackOutlined />,
    NOTIFIED: <BellOutlined />,
    CANCELLED: <CloseCircleOutlined />,
  };
  return iconMap[a] ?? <HistoryOutlined />;
};

const moduleColor = (m: string): string =>
  (({
    AP: '#C74634',
    AR: '#0572CE',
    CASH: '#1D7B4D',
    GL: '#D4A800',
    FA: '#722ed1',
    PROCUREMENT: '#08979c',
  } as Record<string, string>)[m] ?? '#6B6B6B');

const approvalTypeLabel: Record<string, string> = {
  SEQUENTIAL: 'Sequential',
  PARALLEL: 'Parallel',
  ANY_ONE: 'Any One',
};

const approvalTypeColor: Record<string, string> = {
  SEQUENTIAL: 'blue',
  PARALLEL: 'green',
  ANY_ONE: 'orange',
};

// ─── Error Boundary ───────────────────────────────────────────────────────────

class ApprovalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32 }}>
          <Alert
            type="error"
            showIcon
            message="Approval Engine failed to render"
            description={
              <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {this.state.error.message}
                {'\n\n'}
                {this.state.error.stack}
              </pre>
            }
          />
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

const ApprovalEngine: React.FC = () => {
  // ── Tab state ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('approvers');

  // ── Approvers state ──────────────────────────────────────────────────────────
  const [approvers, setApprovers] = useState<ApprovalUser[]>([]);
  const [approversLoading, setApproversLoading] = useState(false);
  const [approverModalOpen, setApproverModalOpen] = useState(false);
  const [editingApprover, setEditingApprover] = useState<ApprovalUser | null>(null);
  const [approverForm] = Form.useForm();
  const [approverSearch, setApproverSearch] = useState('');

  // ── Rules state ───────────────────────────────────────────────────────────────
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ApprovalRule | null>(null);
  const [ruleForm] = Form.useForm();
  const [ruleModule, setRuleModule] = useState<string | undefined>();
  const [selectedRuleApprovers, setSelectedRuleApprovers] = useState<RuleApprover[]>([]);
  const [ruleModuleFilter, setRuleModuleFilter] = useState<string | undefined>();

  // ── Requests state ────────────────────────────────────────────────────────────
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [reqModuleFilter, setReqModuleFilter] = useState<string | undefined>();
  const [reqStatusFilter, setReqStatusFilter] = useState<string | undefined>();
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [historyEntries, setHistoryEntries] = useState<ApprovalHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Notifications state ───────────────────────────────────────────────────────
  const [testUser, setTestUser] = useState<number | undefined>();
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // ── Saving state ─────────────────────────────────────────────────────────────
  const [approverSaving, setApproverSaving] = useState(false);
  const [ruleSaving, setRuleSaving] = useState(false);

  // ─── Data Loading ─────────────────────────────────────────────────────────────

  useEffect(() => {
    loadApprovers();
    loadRules();
    loadRequests();
  }, []);

  const loadApprovers = async () => {
    setApproversLoading(true);
    try {
      setApprovers(await getApprovalUsers());
    } catch {
      message.error('Failed to load approvers');
    } finally {
      setApproversLoading(false);
    }
  };

  const loadRules = async () => {
    setRulesLoading(true);
    try {
      setRules(await getApprovalRules());
    } catch {
      message.error('Failed to load approval rules');
    } finally {
      setRulesLoading(false);
    }
  };

  const loadRequests = async () => {
    setRequestsLoading(true);
    try {
      setRequests(await getApprovalRequests());
    } catch {
      // silently ignore — requests may not exist yet
    } finally {
      setRequestsLoading(false);
    }
  };

  // ─── Approver Handlers ────────────────────────────────────────────────────────

  const openApproverModal = (record?: ApprovalUser) => {
    setEditingApprover(record ?? null);
    approverForm.resetFields();
    if (record) {
      approverForm.setFieldsValue({
        fullName: record.fullName,
        email: record.email,
        phoneNumber: record.phoneNumber,
        department: record.department,
        jobTitle: record.jobTitle,
        maxApprovalAmount: record.maxApprovalAmount,
        currency: record.currency,
        modules: record.modules,
        active: record.active === 'Y',
      });
    } else {
      approverForm.setFieldsValue({ currency: 'AED', active: true });
    }
    setApproverModalOpen(true);
  };

  const handleApproverSave = async () => {
    try {
      const values = await approverForm.validateFields();
      setApproverSaving(true);
      const payload = {
        fullName: values.fullName,
        email: values.email,
        phoneNumber: values.phoneNumber,
        department: values.department,
        jobTitle: values.jobTitle,
        maxApprovalAmount: values.maxApprovalAmount ?? null,
        currency: values.currency,
        modules: values.modules ?? [],
        active: (values.active ? 'Y' : 'N') as 'Y' | 'N',
      };
      if (editingApprover) {
        await updateApprovalUser(editingApprover.userId, payload);
        notification.success({ message: 'Approver updated successfully' });
      } else {
        await createApprovalUser(payload);
        notification.success({ message: 'Approver created successfully' });
      }
      setApproverModalOpen(false);
      loadApprovers();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return; // validation error
      message.error('Failed to save approver');
    } finally {
      setApproverSaving(false);
    }
  };

  const handleApproverDelete = async (userId: number) => {
    try {
      await deleteApprovalUser(userId);
      notification.success({ message: 'Approver deleted' });
      loadApprovers();
    } catch {
      message.error('Failed to delete approver');
    }
  };

  const handleTestNotify = async (userId: number) => {
    setTestUser(userId);
    setActiveTab('notifications');
  };

  // ─── Rule Handlers ────────────────────────────────────────────────────────────

  const openRuleModal = (record?: ApprovalRule) => {
    setEditingRule(record ?? null);
    ruleForm.resetFields();
    setSelectedRuleApprovers([]);
    if (record) {
      setRuleModule(record.module);
      ruleForm.setFieldsValue({
        ruleName: record.ruleName,
        description: record.description,
        module: record.module,
        transactionType: record.transactionType,
        minAmount: record.minAmount,
        maxAmount: record.maxAmount,
        currency: record.currency,
        approvalType: record.approvalType,
        priority: record.priority,
        active: record.active === 'Y',
      });
      setSelectedRuleApprovers(record.approvers ?? []);
    } else {
      ruleForm.setFieldsValue({
        currency: 'AED',
        approvalType: 'SEQUENTIAL',
        priority: 10,
        minAmount: 0,
        active: true,
      });
    }
    setRuleModalOpen(true);
  };

  const handleRuleSave = async () => {
    try {
      const values = await ruleForm.validateFields();
      setRuleSaving(true);
      const payload = {
        ruleName: values.ruleName,
        description: values.description,
        module: values.module,
        transactionType: values.transactionType,
        minAmount: values.minAmount ?? 0,
        maxAmount: values.maxAmount ?? null,
        currency: values.currency,
        approvalType: values.approvalType as 'SEQUENTIAL' | 'PARALLEL' | 'ANY_ONE',
        priority: values.priority ?? 10,
        active: (values.active ? 'Y' : 'N') as 'Y' | 'N',
        approvers: selectedRuleApprovers,
      };
      if (editingRule) {
        await updateApprovalRule(editingRule.ruleId, payload);
        notification.success({ message: 'Rule updated successfully' });
      } else {
        await createApprovalRule(payload);
        notification.success({ message: 'Rule created successfully' });
      }
      setRuleModalOpen(false);
      loadRules();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error('Failed to save approval rule');
    } finally {
      setRuleSaving(false);
    }
  };

  const handleRuleDelete = async (ruleId: number) => {
    try {
      await deleteApprovalRule(ruleId);
      notification.success({ message: 'Rule deleted' });
      loadRules();
    } catch {
      message.error('Failed to delete approval rule');
    }
  };

  // ─── Rule Approver Management ─────────────────────────────────────────────────

  const addRuleApprover = (userId: number) => {
    const user = approvers.find((a) => a.userId === userId);
    if (!user) return;
    if (selectedRuleApprovers.find((a) => a.userId === userId)) {
      message.warning('This approver is already in the list');
      return;
    }
    const nextSeq = selectedRuleApprovers.length + 1;
    setSelectedRuleApprovers([
      ...selectedRuleApprovers,
      {
        sequence: nextSeq,
        userId: user.userId,
        fullName: user.fullName,
        email: user.email,
        department: user.department,
      },
    ]);
  };

  const removeRuleApprover = (userId: number) => {
    const updated = selectedRuleApprovers
      .filter((a) => a.userId !== userId)
      .map((a, i) => ({ ...a, sequence: i + 1 }));
    setSelectedRuleApprovers(updated);
  };

  const moveRuleApprover = (index: number, direction: 'up' | 'down') => {
    const arr = [...selectedRuleApprovers];
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= arr.length) return;
    [arr[index], arr[swapIdx]] = [arr[swapIdx], arr[index]];
    setSelectedRuleApprovers(arr.map((a, i) => ({ ...a, sequence: i + 1 })));
  };

  // ─── History / Requests Handlers ──────────────────────────────────────────────

  const openHistoryDrawer = async (request: ApprovalRequest) => {
    setSelectedRequest(request);
    setHistoryDrawerOpen(true);
    setHistoryLoading(true);
    try {
      const entries = await getApprovalHistory(request.requestId);
      setHistoryEntries(entries);
    } catch {
      message.error('Failed to load approval history');
    } finally {
      setHistoryLoading(false);
    }
  };

  // ─── Notification Handlers ────────────────────────────────────────────────────

  const handleSendTest = async () => {
    if (!testUser) {
      message.warning('Please select an approver first');
      return;
    }
    setTestSending(true);
    setTestResult(null);
    try {
      const result = await sendTestNotification(testUser);
      setTestResult(result);
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to send test notification',
      });
    } finally {
      setTestSending(false);
    }
  };

  // ─── Filtered data ────────────────────────────────────────────────────────────

  const filteredApprovers = approvers.filter((a) => {
    if (!approverSearch) return true;
    const q = approverSearch.toLowerCase();
    return (
      a.fullName.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      (a.department ?? '').toLowerCase().includes(q)
    );
  });

  const filteredRules = ruleModuleFilter
    ? rules.filter((r) => r.module === ruleModuleFilter)
    : rules;

  const filteredRequests = requests.filter((r) => {
    if (reqModuleFilter && r.module !== reqModuleFilter) return false;
    if (reqStatusFilter && r.status !== reqStatusFilter) return false;
    return true;
  });

  // ─── Module-filtered approvers for rule modal ─────────────────────────────────
  const eligibleApprovers = ruleModule
    ? approvers.filter((a) => a.modules.includes(ruleModule) && a.active === 'Y')
    : approvers.filter((a) => a.active === 'Y');

  const selectedApproverIds = selectedRuleApprovers.map((a) => a.userId);

  // ─── Preview email approver ───────────────────────────────────────────────────
  const previewApprover = testUser ? approvers.find((a) => a.userId === testUser) : null;

  // ─── Tab 1 — Approvers ────────────────────────────────────────────────────────

  const renderApproversTab = () => {
    const columns = [
      {
        title: 'Name',
        key: 'name',
        render: (_: unknown, record: ApprovalUser) => (
          <Space>
            <Avatar
              style={{
                background: `${moduleColor(record.modules[0] ?? 'AP')}20`,
                color: moduleColor(record.modules[0] ?? 'AP'),
                fontWeight: 600,
              }}
              icon={<UserOutlined />}
            />
            <div>
              <div style={{ fontWeight: 500, color: REDWOOD.textPrimary }}>{record.fullName}</div>
              {record.jobTitle && (
                <div style={{ fontSize: 12, color: REDWOOD.textSecondary }}>{record.jobTitle}</div>
              )}
            </div>
          </Space>
        ),
      },
      {
        title: 'Email',
        dataIndex: 'email',
        key: 'email',
        render: (email: string) => (
          <Space size={4}>
            <MailOutlined style={{ color: REDWOOD.textSecondary }} />
            <Text style={{ fontSize: 13 }}>{email}</Text>
          </Space>
        ),
      },
      {
        title: 'Department',
        dataIndex: 'department',
        key: 'department',
        render: (d?: string) => d ?? <Text type="secondary">—</Text>,
      },
      {
        title: 'Max Amount',
        key: 'maxAmount',
        render: (_: unknown, record: ApprovalUser) => (
          <Text style={{ fontWeight: 500 }}>
            {fmtAmount(record.maxApprovalAmount, record.currency)}
          </Text>
        ),
      },
      {
        title: 'Modules',
        key: 'modules',
        render: (_: unknown, record: ApprovalUser) => (
          <Space wrap size={4}>
            {(record.modules ?? []).map((m) => (
              <Tag
                key={m}
                style={{
                  background: `${moduleColor(m)}15`,
                  borderColor: `${moduleColor(m)}40`,
                  color: moduleColor(m),
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {m}
              </Tag>
            ))}
          </Space>
        ),
      },
      {
        title: 'Status',
        key: 'active',
        render: (_: unknown, record: ApprovalUser) =>
          record.active === 'Y' ? (
            <Badge status="success" text="Active" />
          ) : (
            <Badge status="default" text="Inactive" />
          ),
      },
      {
        title: 'Actions',
        key: 'actions',
        render: (_: unknown, record: ApprovalUser) => (
          <Space>
            <Tooltip title="Edit">
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openApproverModal(record)}
              />
            </Tooltip>
            <Tooltip title="Send Test Notification">
              <Button
                size="small"
                icon={<BellOutlined />}
                style={{ color: REDWOOD.info, borderColor: REDWOOD.info }}
                onClick={() => handleTestNotify(record.userId)}
              />
            </Tooltip>
            <Popconfirm
              title="Delete this approver?"
              description="This action cannot be undone."
              onConfirm={() => handleApproverDelete(record.userId)}
              okText="Delete"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="Delete">
                <Button size="small" icon={<DeleteOutlined />} danger />
              </Tooltip>
            </Popconfirm>
          </Space>
        ),
      },
    ];

    return (
      <div style={{ padding: '16px 24px 24px' }}>
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Input.Search
              placeholder="Search by name, email or department…"
              value={approverSearch}
              onChange={(e) => setApproverSearch(e.target.value)}
              style={{ width: 320 }}
              allowClear
            />
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
              onClick={() => openApproverModal()}
            >
              Add Approver
            </Button>
          </Col>
        </Row>

        <Table
          dataSource={filteredApprovers}
          columns={columns}
          rowKey="userId"
          size="small"
          bordered
          loading={approversLoading}
          locale={{
            emptyText: (
              <Empty
                description="No approvers configured yet. Click 'Add Approver' to get started."
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ),
          }}
          pagination={{ pageSize: 10, showSizeChanger: true }}
        />
      </div>
    );
  };

  // ─── Tab 2 — Approval Rules ───────────────────────────────────────────────────

  const renderRulesTab = () => {
    const columns = [
      {
        title: 'Priority',
        dataIndex: 'priority',
        key: 'priority',
        sorter: (a: ApprovalRule, b: ApprovalRule) => a.priority - b.priority,
        render: (p: number) => (
          <Tag style={{ fontWeight: 700, minWidth: 32, textAlign: 'center' }}>{p}</Tag>
        ),
      },
      {
        title: 'Rule Name',
        dataIndex: 'ruleName',
        key: 'ruleName',
        render: (name: string, record: ApprovalRule) => (
          <div>
            <div style={{ fontWeight: 500 }}>{name}</div>
            {record.description && (
              <div style={{ fontSize: 12, color: REDWOOD.textSecondary }}>{record.description}</div>
            )}
          </div>
        ),
      },
      {
        title: 'Module',
        dataIndex: 'module',
        key: 'module',
        render: (m: string) => (
          <Tag
            style={{
              background: `${moduleColor(m)}15`,
              borderColor: `${moduleColor(m)}40`,
              color: moduleColor(m),
              fontWeight: 600,
            }}
          >
            {m}
          </Tag>
        ),
      },
      {
        title: 'Transaction Type',
        dataIndex: 'transactionType',
        key: 'transactionType',
        render: (t: string) => <Text style={{ fontSize: 12 }}>{t}</Text>,
      },
      {
        title: 'Amount Range',
        key: 'amountRange',
        render: (_: unknown, record: ApprovalRule) => (
          <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>
            {fmtAmount(record.minAmount, record.currency)} –{' '}
            {fmtAmount(record.maxAmount, record.currency)}
          </Text>
        ),
      },
      {
        title: 'Approval Type',
        dataIndex: 'approvalType',
        key: 'approvalType',
        render: (t: string) => (
          <Tag color={approvalTypeColor[t] ?? 'default'}>{approvalTypeLabel[t] ?? t}</Tag>
        ),
      },
      {
        title: 'Approvers',
        key: 'approvers',
        render: (_: unknown, record: ApprovalRule) => (
          <Avatar.Group max={{ count: 3 }}>
            {(record.approvers ?? []).map((a) => (
              <Tooltip key={a.userId} title={`${a.fullName} (seq: ${a.sequence})`}>
                <Avatar
                  size="small"
                  style={{ background: REDWOOD.info, cursor: 'default' }}
                >
                  {a.fullName.charAt(0)}
                </Avatar>
              </Tooltip>
            ))}
          </Avatar.Group>
        ),
      },
      {
        title: 'Status',
        key: 'active',
        render: (_: unknown, record: ApprovalRule) =>
          record.active === 'Y' ? (
            <Badge status="success" text="Active" />
          ) : (
            <Badge status="default" text="Inactive" />
          ),
      },
      {
        title: 'Actions',
        key: 'actions',
        render: (_: unknown, record: ApprovalRule) => (
          <Space>
            <Tooltip title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => openRuleModal(record)} />
            </Tooltip>
            <Popconfirm
              title="Delete this rule?"
              description="This will also remove all approver assignments for this rule."
              onConfirm={() => handleRuleDelete(record.ruleId)}
              okText="Delete"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="Delete">
                <Button size="small" icon={<DeleteOutlined />} danger />
              </Tooltip>
            </Popconfirm>
          </Space>
        ),
      },
    ];

    return (
      <div style={{ padding: '16px 24px 24px' }}>
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Select
              placeholder="Filter by Module"
              allowClear
              value={ruleModuleFilter}
              onChange={setRuleModuleFilter}
              style={{ width: 200 }}
              options={APPROVAL_MODULES.map((m) => ({ label: m, value: m }))}
            />
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
              onClick={() => openRuleModal()}
            >
              Add Rule
            </Button>
          </Col>
        </Row>

        <Table
          dataSource={filteredRules}
          columns={columns}
          rowKey="ruleId"
          size="small"
          bordered
          loading={rulesLoading}
          locale={{
            emptyText: (
              <Empty
                description="No approval rules configured yet. Click 'Add Rule' to create one."
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ),
          }}
          pagination={{ pageSize: 10, showSizeChanger: true }}
        />
      </div>
    );
  };

  // ─── Tab 3 — Requests & History ───────────────────────────────────────────────

  const renderRequestsTab = () => {
    const columns = [
      {
        title: 'ID',
        dataIndex: 'requestId',
        key: 'requestId',
        width: 70,
        render: (id: number) => <Text style={{ fontSize: 12, color: REDWOOD.textSecondary }}>#{id}</Text>,
      },
      {
        title: 'Reference',
        dataIndex: 'transactionRef',
        key: 'transactionRef',
        render: (ref: string) => <Text strong>{ref}</Text>,
      },
      {
        title: 'Module',
        dataIndex: 'module',
        key: 'module',
        render: (m: string) => (
          <Tag
            style={{
              background: `${moduleColor(m)}15`,
              borderColor: `${moduleColor(m)}40`,
              color: moduleColor(m),
              fontWeight: 600,
            }}
          >
            {m}
          </Tag>
        ),
      },
      {
        title: 'Type',
        dataIndex: 'transactionType',
        key: 'transactionType',
        render: (t: string) => <Text style={{ fontSize: 12 }}>{t}</Text>,
      },
      {
        title: 'Amount',
        key: 'amount',
        render: (_: unknown, record: ApprovalRequest) => (
          <Text style={{ fontWeight: 500 }}>{fmtAmount(record.amount, record.currency)}</Text>
        ),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (s: string) => <Tag color={statusColor(s)}>{s}</Tag>,
      },
      {
        title: 'Requested By',
        dataIndex: 'requestedByName',
        key: 'requestedByName',
      },
      {
        title: 'Date',
        dataIndex: 'requestedDate',
        key: 'requestedDate',
        render: (d: string) => (
          <Text style={{ fontSize: 12 }}>{d ? new Date(d).toLocaleDateString() : '—'}</Text>
        ),
      },
      {
        title: 'Current Approver',
        dataIndex: 'currentApproverName',
        key: 'currentApproverName',
        render: (n?: string) => n ?? <Text type="secondary">—</Text>,
      },
      {
        title: 'Actions',
        key: 'actions',
        render: (_: unknown, record: ApprovalRequest) => (
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => openHistoryDrawer(record)}
          >
            History
          </Button>
        ),
      },
    ];

    return (
      <div style={{ padding: '16px 24px 24px' }}>
        <Row gutter={12} style={{ marginBottom: 16 }}>
          <Col>
            <Select
              placeholder="Filter by Module"
              allowClear
              value={reqModuleFilter}
              onChange={setReqModuleFilter}
              style={{ width: 180 }}
              options={APPROVAL_MODULES.map((m) => ({ label: m, value: m }))}
            />
          </Col>
          <Col>
            <Select
              placeholder="Filter by Status"
              allowClear
              value={reqStatusFilter}
              onChange={setReqStatusFilter}
              style={{ width: 180 }}
              options={['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'RECALLED'].map((s) => ({
                label: s,
                value: s,
              }))}
            />
          </Col>
          <Col>
            <Button icon={<ThunderboltOutlined />} onClick={loadRequests}>
              Refresh
            </Button>
          </Col>
        </Row>

        <Table
          dataSource={filteredRequests}
          columns={columns}
          rowKey="requestId"
          size="small"
          bordered
          loading={requestsLoading}
          locale={{
            emptyText: (
              <Empty
                description="No approval requests yet. Requests will appear here when transactions are submitted for approval."
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ),
          }}
          pagination={{ pageSize: 15, showSizeChanger: true }}
        />
      </div>
    );
  };

  // ─── Tab 4 — Notifications ────────────────────────────────────────────────────

  const renderNotificationsTab = () => {
    const sqlSnippet = `-- ORDS handler for notify/test
BEGIN
  ORDS.DEFINE_HANDLER(
    p_module_name    => 'reerp',
    p_pattern        => 'approvals/notify/test',
    p_method         => 'POST',
    p_source_type    => 'plsql/block',
    p_source         => q'[
      DECLARE
        v_user_id NUMBER := :user_id;
        v_email   VARCHAR2(300);
        v_name    VARCHAR2(200);
      BEGIN
        SELECT EMAIL, FULL_NAME INTO v_email, v_name
        FROM RR_APPROVAL_USERS WHERE USER_ID = v_user_id;
        APEX_MAIL.SEND(
          p_to        => v_email,
          p_from      => 'noreply@bumeric.ae',
          p_subj      => '[TEST] ERP Approval Notification',
          p_body      => 'Dear '||v_name||', test notification.',
          p_body_html => '<p>Dear '||v_name||', test notification.</p>'
        );
        APEX_MAIL.PUSH_QUEUE;
        :status := 200;
        :body   := ''{"success":true}'';
      END;
    ]'
  );
  COMMIT;
END;`;

    return (
      <div style={{ padding: '16px 24px 24px' }}>
        <Row gutter={24}>
          {/* Section 1 — Test Notification */}
          <Col xs={24} lg={14}>
            <Card
              title={
                <Space>
                  <BellOutlined style={{ color: REDWOOD.info }} />
                  <span>Send Test Notification</span>
                </Space>
              }
              bordered
              style={{ marginBottom: 24 }}
            >
              <Paragraph type="secondary">
                Send a test email notification to verify your email configuration is working
                correctly. Select an approver below and click the send button.
              </Paragraph>

              <Row gutter={12} align="middle" style={{ marginTop: 16 }}>
                <Col flex="1">
                  <Select
                    placeholder="Select approver to test…"
                    value={testUser}
                    onChange={setTestUser}
                    style={{ width: '100%' }}
                    showSearch
                    filterOption={(input, option) =>
                      (option?.label?.toString() ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    options={approvers
                      .filter((a) => a.active === 'Y')
                      .map((a) => ({
                        label: `${a.fullName} — ${a.email}`,
                        value: a.userId,
                      }))}
                  />
                </Col>
                <Col>
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    loading={testSending}
                    onClick={handleSendTest}
                    style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
                  >
                    Send Test
                  </Button>
                </Col>
                <Col>
                  <Button icon={<EyeOutlined />} onClick={() => setPreviewOpen(true)}>
                    Preview Email
                  </Button>
                </Col>
              </Row>

              {testResult && (
                <Alert
                  style={{ marginTop: 16 }}
                  type={testResult.success ? 'success' : 'error'}
                  message={testResult.success ? 'Test email sent!' : 'Failed to send'}
                  description={testResult.message}
                  showIcon
                  closable
                  onClose={() => setTestResult(null)}
                />
              )}
            </Card>

            {/* Section 2 — Email Config Note */}
            <Card
              title={
                <Space>
                  <SettingOutlined style={{ color: REDWOOD.warning }} />
                  <span>Email Configuration</span>
                </Space>
              }
              bordered
            >
              <Alert
                type="info"
                showIcon
                message="ORDS Configuration Required"
                description={
                  <span>
                    Email notifications require the ORDS <code>approvals/notify</code> endpoint to
                    be configured with <strong>APEX_MAIL</strong> or SMTP settings. The test
                    endpoint at <code>approvals/notify/test</code> must be deployed to your APEX
                    workspace.
                  </span>
                }
                style={{ marginBottom: 16 }}
              />
              <Divider orientation="left" style={{ fontSize: 13 }}>
                ORDS Handler SQL (deploy to Oracle APEX)
              </Divider>
              <pre
                style={{
                  background: REDWOOD.neutral100,
                  border: `1px solid ${REDWOOD.neutral200}`,
                  borderRadius: 6,
                  padding: 16,
                  fontSize: 11,
                  overflowX: 'auto',
                  color: REDWOOD.textPrimary,
                  lineHeight: 1.6,
                }}
              >
                {sqlSnippet}
              </pre>
            </Card>
          </Col>

          {/* Quick stats panel */}
          <Col xs={24} lg={10}>
            <Card title="Approver Summary" bordered>
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Card
                    size="small"
                    style={{ background: `${REDWOOD.success}10`, borderColor: `${REDWOOD.success}30` }}
                  >
                    <div style={{ fontSize: 28, fontWeight: 700, color: REDWOOD.success }}>
                      {approvers.filter((a) => a.active === 'Y').length}
                    </div>
                    <div style={{ fontSize: 12, color: REDWOOD.textSecondary }}>Active Approvers</div>
                  </Card>
                </Col>
                <Col span={12}>
                  <Card
                    size="small"
                    style={{ background: `${REDWOOD.info}10`, borderColor: `${REDWOOD.info}30` }}
                  >
                    <div style={{ fontSize: 28, fontWeight: 700, color: REDWOOD.info }}>
                      {rules.filter((r) => r.active === 'Y').length}
                    </div>
                    <div style={{ fontSize: 12, color: REDWOOD.textSecondary }}>Active Rules</div>
                  </Card>
                </Col>
                <Col span={12}>
                  <Card
                    size="small"
                    style={{ background: `${REDWOOD.warning}10`, borderColor: `${REDWOOD.warning}30` }}
                  >
                    <div style={{ fontSize: 28, fontWeight: 700, color: REDWOOD.warning }}>
                      {requests.filter((r) => r.status === 'PENDING').length}
                    </div>
                    <div style={{ fontSize: 12, color: REDWOOD.textSecondary }}>Pending Requests</div>
                  </Card>
                </Col>
                <Col span={12}>
                  <Card
                    size="small"
                    style={{
                      background: `${REDWOOD.primary}10`,
                      borderColor: `${REDWOOD.primary}30`,
                    }}
                  >
                    <div style={{ fontSize: 28, fontWeight: 700, color: REDWOOD.primary }}>
                      {requests.filter((r) => r.status === 'APPROVED').length}
                    </div>
                    <div style={{ fontSize: 12, color: REDWOOD.textSecondary }}>Approved Total</div>
                  </Card>
                </Col>
              </Row>

              <Divider style={{ margin: '16px 0 12px' }} />
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                Coverage by Module
              </div>
              {APPROVAL_MODULES.map((m) => {
                const count = approvers.filter((a) => a.modules.includes(m) && a.active === 'Y').length;
                return (
                  <Row key={m} justify="space-between" align="middle" style={{ marginBottom: 6 }}>
                    <Col>
                      <Tag
                        style={{
                          background: `${moduleColor(m)}15`,
                          borderColor: `${moduleColor(m)}40`,
                          color: moduleColor(m),
                          fontWeight: 600,
                        }}
                      >
                        {m}
                      </Tag>
                    </Col>
                    <Col>
                      <Text style={{ fontSize: 13 }}>
                        {count} approver{count !== 1 ? 's' : ''}
                      </Text>
                    </Col>
                    <Col>
                      <Badge
                        status={count > 0 ? 'success' : 'error'}
                        text={count > 0 ? 'Covered' : 'Not covered'}
                      />
                    </Col>
                  </Row>
                );
              })}
            </Card>
          </Col>
        </Row>
      </div>
    );
  };

  // ─── Approver Modal ───────────────────────────────────────────────────────────

  const renderApproverModal = () => (
    <Modal
      title={
        <Space>
          <UserOutlined style={{ color: REDWOOD.info }} />
          {editingApprover ? 'Edit Approver' : 'Add New Approver'}
        </Space>
      }
      open={approverModalOpen}
      onCancel={() => setApproverModalOpen(false)}
      onOk={handleApproverSave}
      okText={editingApprover ? 'Save Changes' : 'Create Approver'}
      okButtonProps={{
        loading: approverSaving,
        style: { background: REDWOOD.primary, borderColor: REDWOOD.primary },
      }}
      destroyOnClose
      width={600}
    >
      <Form form={approverForm} layout="vertical" style={{ marginTop: 8 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="fullName"
              label="Full Name"
              rules={[{ required: true, message: 'Full name is required' }]}
            >
              <Input prefix={<UserOutlined />} placeholder="e.g. Ahmed Al Rashid" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="email"
              label="Email Address"
              rules={[
                { required: true, message: 'Email is required' },
                { type: 'email', message: 'Enter a valid email address' },
              ]}
            >
              <Input prefix={<MailOutlined />} placeholder="user@company.com" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="phoneNumber" label="Phone Number">
              <Input prefix={<PhoneOutlined />} placeholder="+971 50 000 0000" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="department" label="Department">
              <Input placeholder="e.g. Finance" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="jobTitle" label="Job Title">
              <Input placeholder="e.g. Finance Manager" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="currency" label="Currency">
              <Select
                options={['AED', 'USD', 'EUR', 'GBP'].map((c) => ({ label: c, value: c }))}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="maxApprovalAmount" label="Max Approval Amount">
              <InputNumber
                style={{ width: '100%' }}
                placeholder="Leave blank for Unlimited"
                min={0}
                formatter={(v) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '')}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="active" label="Status" valuePropName="checked">
              <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          name="modules"
          label="Modules Authorized to Approve"
          rules={[{ required: true, message: 'Select at least one module' }]}
        >
          <Select
            mode="multiple"
            placeholder="Select modules…"
            options={APPROVAL_MODULES.map((m) => ({ label: m, value: m }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );

  // ─── Rule Modal ───────────────────────────────────────────────────────────────

  const renderRuleModal = () => (
    <Modal
      title={
        <Space>
          <ApartmentOutlined style={{ color: REDWOOD.info }} />
          {editingRule ? 'Edit Approval Rule' : 'Add New Approval Rule'}
        </Space>
      }
      open={ruleModalOpen}
      onCancel={() => setRuleModalOpen(false)}
      onOk={handleRuleSave}
      okText={editingRule ? 'Save Changes' : 'Create Rule'}
      okButtonProps={{
        loading: ruleSaving,
        style: { background: REDWOOD.primary, borderColor: REDWOOD.primary },
      }}
      destroyOnClose
      width={720}
    >
      <Form form={ruleForm} layout="vertical" style={{ marginTop: 8 }}>
        <Row gutter={16}>
          <Col span={16}>
            <Form.Item
              name="ruleName"
              label="Rule Name"
              rules={[{ required: true, message: 'Rule name is required' }]}
            >
              <Input placeholder="e.g. AP Invoices Over 50K" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="priority" label="Priority (1=highest)">
              <InputNumber style={{ width: '100%' }} min={1} max={99} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="description" label="Description">
          <Input.TextArea rows={2} placeholder="Optional description…" />
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="module"
              label="Module"
              rules={[{ required: true, message: 'Module is required' }]}
            >
              <Select
                placeholder="Select module…"
                options={APPROVAL_MODULES.map((m) => ({ label: m, value: m }))}
                onChange={(v) => {
                  setRuleModule(v);
                  ruleForm.setFieldValue('transactionType', undefined);
                }}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="transactionType"
              label="Transaction Type"
              rules={[{ required: true, message: 'Transaction type is required' }]}
            >
              <Select
                placeholder="Select type…"
                disabled={!ruleModule}
                options={(TRANSACTION_TYPES[ruleModule ?? ''] ?? []).map((t) => ({
                  label: t,
                  value: t,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="minAmount" label="Min Amount">
              <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="maxAmount" label="Max Amount">
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                placeholder="Leave blank for Unlimited"
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="currency" label="Currency">
              <Select
                options={['AED', 'USD', 'EUR', 'GBP'].map((c) => ({ label: c, value: c }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="approvalType"
          label={
            <Space>
              Approval Type
              <Tooltip
                title={
                  <div>
                    <div>
                      <strong>Sequential:</strong> Approvers are notified one-by-one in order.
                    </div>
                    <div>
                      <strong>Parallel:</strong> All approvers are notified simultaneously; all must
                      approve.
                    </div>
                    <div>
                      <strong>Any One:</strong> Any one of the approvers can approve the request.
                    </div>
                  </div>
                }
              >
                <ThunderboltOutlined style={{ color: REDWOOD.info, cursor: 'help' }} />
              </Tooltip>
            </Space>
          }
        >
          <Radio.Group>
            <Radio value="SEQUENTIAL">Sequential</Radio>
            <Radio value="PARALLEL">Parallel</Radio>
            <Radio value="ANY_ONE">Any One</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item name="active" label="Status" valuePropName="checked">
          <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
        </Form.Item>

        {/* ── Approvers Section ── */}
        <Divider orientation="left" style={{ fontSize: 13, margin: '8px 0 12px' }}>
          Approvers ({selectedRuleApprovers.length})
        </Divider>

        <Row gutter={8} style={{ marginBottom: 12 }}>
          <Col flex="1">
            <Select
              showSearch
              placeholder={
                ruleModule
                  ? `Add approver (showing ${eligibleApprovers.length} eligible for ${ruleModule})…`
                  : 'Select a module first…'
              }
              disabled={!ruleModule}
              filterOption={(input, option) =>
                (option?.label?.toString() ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={eligibleApprovers
                .filter((a) => !selectedApproverIds.includes(a.userId))
                .map((a) => ({
                  label: `${a.fullName} — ${a.email}${a.department ? ' (' + a.department + ')' : ''}`,
                  value: a.userId,
                }))}
              onChange={(v) => {
                if (v) addRuleApprover(v as number);
              }}
              value={undefined}
              style={{ width: '100%' }}
            />
          </Col>
        </Row>

        {selectedRuleApprovers.length === 0 ? (
          <Alert
            type="warning"
            showIcon
            message="No approvers added yet. Select approvers from the dropdown above."
          />
        ) : (
          <div
            style={{
              border: `1px solid ${REDWOOD.neutral200}`,
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            {selectedRuleApprovers.map((approver, index) => (
              <div
                key={approver.userId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderBottom:
                    index < selectedRuleApprovers.length - 1
                      ? `1px solid ${REDWOOD.neutral200}`
                      : 'none',
                  background: index % 2 === 0 ? REDWOOD.surface : REDWOOD.neutral100,
                }}
              >
                <Tag
                  style={{
                    minWidth: 28,
                    textAlign: 'center',
                    fontWeight: 700,
                    marginRight: 8,
                    background: `${REDWOOD.info}15`,
                    borderColor: `${REDWOOD.info}40`,
                    color: REDWOOD.info,
                  }}
                >
                  {approver.sequence}
                </Tag>
                <Avatar size="small" style={{ background: REDWOOD.info, marginRight: 8 }}>
                  {approver.fullName.charAt(0)}
                </Avatar>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{approver.fullName}</div>
                  <div style={{ fontSize: 11, color: REDWOOD.textSecondary }}>{approver.email}</div>
                </div>
                <Space size={4}>
                  <Button
                    size="small"
                    icon={<ArrowUpOutlined />}
                    disabled={index === 0}
                    onClick={() => moveRuleApprover(index, 'up')}
                  />
                  <Button
                    size="small"
                    icon={<ArrowDownOutlined />}
                    disabled={index === selectedRuleApprovers.length - 1}
                    onClick={() => moveRuleApprover(index, 'down')}
                  />
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => removeRuleApprover(approver.userId)}
                  />
                </Space>
              </div>
            ))}
          </div>
        )}
      </Form>
    </Modal>
  );

  // ─── History Drawer ───────────────────────────────────────────────────────────

  const renderHistoryDrawer = () => (
    <Drawer
      title={
        <Space>
          <HistoryOutlined style={{ color: REDWOOD.info }} />
          <span>Approval History</span>
          {selectedRequest && (
            <Tag color={statusColor(selectedRequest.status)}>{selectedRequest.status}</Tag>
          )}
        </Space>
      }
      open={historyDrawerOpen}
      onClose={() => setHistoryDrawerOpen(false)}
      width={520}
      destroyOnClose
    >
      {selectedRequest && (
        <>
          <Card
            size="small"
            style={{
              marginBottom: 20,
              background: REDWOOD.surfaceSecondary,
              border: `1px solid ${REDWOOD.neutral200}`,
            }}
          >
            <Row gutter={8}>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Reference
                </Text>
                <div style={{ fontWeight: 600 }}>{selectedRequest.transactionRef}</div>
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Amount
                </Text>
                <div style={{ fontWeight: 600 }}>
                  {fmtAmount(selectedRequest.amount, selectedRequest.currency)}
                </div>
              </Col>
              <Col span={12} style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Module / Type
                </Text>
                <div>
                  {selectedRequest.module} / {selectedRequest.transactionType}
                </div>
              </Col>
              <Col span={12} style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Requested By
                </Text>
                <div>{selectedRequest.requestedByName}</div>
              </Col>
            </Row>
          </Card>

          <Divider orientation="left" style={{ fontSize: 13 }}>
            Timeline
          </Divider>

          {historyLoading ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <Text type="secondary">Loading history…</Text>
            </div>
          ) : historyEntries.length === 0 ? (
            <Empty
              description="No history entries found for this request."
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <Timeline
              items={historyEntries.map((entry) => ({
                color: actionColor(entry.action),
                dot: (
                  <span style={{ color: actionColor(entry.action), fontSize: 14 }}>
                    {actionIcon(entry.action)}
                  </span>
                ),
                children: (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Space size={4}>
                        <Tag
                          style={{
                            background: `${actionColor(entry.action)}15`,
                            borderColor: `${actionColor(entry.action)}40`,
                            color: actionColor(entry.action),
                            fontWeight: 600,
                            fontSize: 11,
                          }}
                        >
                          {entry.action}
                        </Tag>
                        {entry.notificationSent === 'Y' && (
                          <Tooltip title="Notification sent">
                            <BellOutlined style={{ color: '#722ed1', fontSize: 12 }} />
                          </Tooltip>
                        )}
                      </Space>
                      <Text style={{ fontSize: 11, color: REDWOOD.textSecondary }}>
                        {entry.actionDate ? new Date(entry.actionDate).toLocaleString() : '—'}
                      </Text>
                    </div>
                    <div style={{ fontWeight: 500, marginTop: 2 }}>{entry.actorName}</div>
                    {entry.comments && (
                      <div
                        style={{
                          fontSize: 12,
                          color: REDWOOD.textSecondary,
                          marginTop: 2,
                          fontStyle: 'italic',
                        }}
                      >
                        "{entry.comments}"
                      </div>
                    )}
                  </div>
                ),
              }))}
            />
          )}
        </>
      )}
    </Drawer>
  );

  // ─── Email Preview Modal ──────────────────────────────────────────────────────

  const renderEmailPreviewModal = () => {
    const today = new Date().toLocaleDateString('en-AE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const recipientName = previewApprover?.fullName ?? 'Approver';
    const recipientEmail = previewApprover?.email ?? 'approver@company.com';

    return (
      <Modal
        title={
          <Space>
            <MailOutlined style={{ color: REDWOOD.info }} />
            Email Notification Preview
          </Space>
        }
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={[
          <Button key="close" onClick={() => setPreviewOpen(false)}>
            Close
          </Button>,
        ]}
        width={640}
        destroyOnClose
      >
        {/* Email header meta */}
        <div
          style={{
            background: REDWOOD.neutral100,
            border: `1px solid ${REDWOOD.neutral200}`,
            borderRadius: 6,
            padding: '10px 14px',
            marginBottom: 16,
            fontSize: 12,
            fontFamily: 'monospace',
          }}
        >
          <div>
            <strong>Subject:</strong> [APPROVAL REQUIRED] Invoice #INV-2024-001 — AED 125,000.00
          </div>
          <div>
            <strong>From:</strong> ERP System &lt;noreply@bumeric.ae&gt;
          </div>
          <div>
            <strong>To:</strong> {recipientEmail}
          </div>
        </div>

        {/* Email body preview */}
        <div
          style={{
            border: `1px solid ${REDWOOD.neutral200}`,
            borderRadius: 8,
            overflow: 'hidden',
            fontFamily: 'Arial, sans-serif',
          }}
        >
          {/* Banner */}
          <div
            style={{
              background: `linear-gradient(135deg, ${REDWOOD.primary} 0%, ${REDWOOD.primaryDark} 100%)`,
              padding: '20px 24px',
              textAlign: 'center',
              color: '#fff',
            }}
          >
            <div style={{ fontSize: 11, letterSpacing: 2, opacity: 0.8, marginBottom: 4 }}>
              BUMERIC BUSINESS SOLUTIONS
            </div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Approval Required</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
              ERP Approval Management System
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '20px 24px', background: '#fff' }}>
            <p style={{ margin: '0 0 16px', fontSize: 14 }}>Dear {recipientName},</p>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#444' }}>
              A transaction has been submitted for your approval. Please review the details below
              and take the appropriate action.
            </p>

            {/* Transaction details card */}
            <div
              style={{
                border: `1px solid ${REDWOOD.neutral200}`,
                borderRadius: 6,
                overflow: 'hidden',
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  background: REDWOOD.neutral100,
                  padding: '8px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: REDWOOD.textSecondary,
                  letterSpacing: 0.5,
                }}
              >
                TRANSACTION DETAILS
              </div>
              {[
                ['Module', 'Accounts Payable (AP)'],
                ['Type', 'Invoice'],
                ['Reference', 'INV-2024-001'],
                ['Amount', 'AED 125,000.00'],
                ['Submitted by', 'John Smith'],
                ['Date', today],
                ['Description', 'Vendor invoice for Q4 services'],
              ].map(([label, value], i) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    padding: '8px 14px',
                    background: i % 2 === 0 ? '#fff' : REDWOOD.neutral100,
                    borderTop: `1px solid ${REDWOOD.neutral200}`,
                    fontSize: 13,
                  }}
                >
                  <div style={{ width: 130, color: REDWOOD.textSecondary, flexShrink: 0 }}>
                    {label}:
                  </div>
                  <div style={{ fontWeight: i < 4 ? 600 : 400 }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <span
                style={{
                  display: 'inline-block',
                  background: REDWOOD.success,
                  color: '#fff',
                  padding: '8px 20px',
                  borderRadius: 4,
                  fontWeight: 600,
                  fontSize: 13,
                  marginRight: 8,
                  cursor: 'pointer',
                }}
              >
                ✓ APPROVE
              </span>
              <span
                style={{
                  display: 'inline-block',
                  background: REDWOOD.primary,
                  color: '#fff',
                  padding: '8px 20px',
                  borderRadius: 4,
                  fontWeight: 600,
                  fontSize: 13,
                  marginRight: 8,
                  cursor: 'pointer',
                }}
              >
                ✗ REJECT
              </span>
              <span
                style={{
                  display: 'inline-block',
                  background: REDWOOD.info,
                  color: '#fff',
                  padding: '8px 20px',
                  borderRadius: 4,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                View Details
              </span>
            </div>

            {/* Footer */}
            <div
              style={{
                borderTop: `1px solid ${REDWOOD.neutral200}`,
                paddingTop: 12,
                fontSize: 11,
                color: REDWOOD.textSecondary,
                textAlign: 'center',
              }}
            >
              This is an automated notification from the ERP Approval System. Please do not reply
              to this email.
              <br />
              © {new Date().getFullYear()} Bumeric Business Solutions LLC — noreply@bumeric.ae
            </div>
          </div>
        </div>
      </Modal>
    );
  };

  // ─── Main Render ──────────────────────────────────────────────────────────────

  return (
    <Layout style={{ minHeight: '100vh', background: REDWOOD.surfaceSecondary }}>
      <Content style={{ padding: '24px 48px' }}>
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/admin">Admin</Link> },
            { title: 'Approval Engine' },
          ]}
          style={{ marginBottom: 16 }}
        />

        {/* Page Header */}
        <div style={{ marginBottom: 24 }}>
          <Title level={2} style={{ color: REDWOOD.textPrimary, margin: 0 }}>
            <SafetyOutlined style={{ marginRight: 12, color: REDWOOD.info }} />
            Approval Management Engine
          </Title>
          <Text type="secondary">
            Configure approvers, rules, and track approval requests across all modules.
          </Text>
        </div>

        {/* Main Tabs Card */}
        <Card style={{ marginTop: 0 }} styles={{ body: { padding: 0 } }}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            style={{ padding: '0 24px' }}
            items={[
              {
                key: 'approvers',
                label: (
                  <span>
                    <TeamOutlined style={{ marginRight: 6 }} />
                    Approvers
                    {approvers.length > 0 && (
                      <Badge
                        count={approvers.length}
                        style={{
                          marginLeft: 8,
                          background: REDWOOD.info,
                          fontSize: 10,
                        }}
                      />
                    )}
                  </span>
                ),
                children: renderApproversTab(),
              },
              {
                key: 'rules',
                label: (
                  <span>
                    <ApartmentOutlined style={{ marginRight: 6 }} />
                    Approval Rules
                    {rules.length > 0 && (
                      <Badge
                        count={rules.length}
                        style={{ marginLeft: 8, background: REDWOOD.success, fontSize: 10 }}
                      />
                    )}
                  </span>
                ),
                children: renderRulesTab(),
              },
              {
                key: 'requests',
                label: (
                  <span>
                    <HistoryOutlined style={{ marginRight: 6 }} />
                    Requests & History
                    {requests.filter((r) => r.status === 'PENDING').length > 0 && (
                      <Badge
                        count={requests.filter((r) => r.status === 'PENDING').length}
                        style={{ marginLeft: 8, background: REDWOOD.warning, fontSize: 10 }}
                      />
                    )}
                  </span>
                ),
                children: renderRequestsTab(),
              },
              {
                key: 'notifications',
                label: (
                  <span>
                    <BellOutlined style={{ marginRight: 6 }} />
                    Notifications
                  </span>
                ),
                children: renderNotificationsTab(),
              },
            ]}
          />
        </Card>
      </Content>

      {/* Modals & Drawers */}
      {renderApproverModal()}
      {renderRuleModal()}
      {renderHistoryDrawer()}
      {renderEmailPreviewModal()}
    </Layout>
  );
};

const ApprovalEngineWithBoundary: React.FC = () => (
  <ApprovalErrorBoundary>
    <ApprovalEngine />
  </ApprovalErrorBoundary>
);

export default ApprovalEngineWithBoundary;
