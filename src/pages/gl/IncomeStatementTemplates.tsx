import React, { useState, useEffect } from 'react';
import {
  Layout,
  Typography,
  Card,
  Breadcrumb,
  Space,
  Button,
  Table,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  message,
  Spin,
  Tag,
  Tooltip,
  Collapse,
  Divider,
  Empty,
  Popconfirm,
  Row,
  Col,
  Tabs,
} from 'antd';
import {
  HomeOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  EyeOutlined,
  ArrowLeftOutlined,
  SaveOutlined,
  FileTextOutlined,
  FolderOutlined,
  AppstoreOutlined,
  CalculatorOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import Autopilot from '../../components/Autopilot';
import * as plService from '../../services/pl-templates.service';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Panel } = Collapse;
const { TabPane } = Tabs;
const { TextArea } = Input;

// Oracle Redwood Color Palette
const REDWOOD = {
  primary: '#C74634',
  primaryLight: '#E85D4A',
  success: '#1D7B4D',
  warning: '#D4A800',
  info: '#0572CE',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral300: '#C7C7C7',
  neutral600: '#6B6B6B',
  neutral900: '#1A1A1A',
  surface: '#FFFFFF',
};

// Group type colors
const GROUP_TYPE_COLORS: Record<string, string> = {
  REVENUE: REDWOOD.success,
  EXPENSE: REDWOOD.primary,
  OTHER_INCOME: REDWOOD.info,
  OTHER_EXPENSE: REDWOOD.warning,
  TAX: '#722ed1',
  COMPREHENSIVE: '#13c2c2',
  CALCULATED: REDWOOD.neutral600,
};

const IncomeStatementTemplates: React.FC = () => {
  // State
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<plService.PLTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<plService.PLTemplateStructure | null>(null);
  const [view, setView] = useState<'list' | 'editor' | 'preview'>('list');

  // Modal states
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [sectionModalVisible, setSectionModalVisible] = useState(false);
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [totalModalVisible, setTotalModalVisible] = useState(false);
  const [cloneModalVisible, setCloneModalVisible] = useState(false);

  // Edit context
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);

  // Forms
  const [templateForm] = Form.useForm();
  const [groupForm] = Form.useForm();
  const [sectionForm] = Form.useForm();
  const [accountForm] = Form.useForm();
  const [totalForm] = Form.useForm();
  const [cloneForm] = Form.useForm();

  // Load templates on mount
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const response = await plService.getTemplates();
      if (response.success && response.data) {
        setTemplates(response.data);
      } else {
        message.error(response.error || 'Failed to load templates');
      }
    } catch (error) {
      message.error('Failed to load templates');
    }
    setLoading(false);
  };

  const loadTemplateStructure = async (templateId: number) => {
    setLoading(true);
    try {
      const response = await plService.getTemplateStructure(templateId);
      if (response.success && response.data) {
        setSelectedTemplate(response.data);
        setEditingTemplateId(templateId);
        setView('editor');
      } else {
        message.error(response.error || 'Failed to load template structure');
      }
    } catch (error) {
      message.error('Failed to load template structure');
    }
    setLoading(false);
  };

  // Template CRUD
  const handleCreateTemplate = async (values: any) => {
    try {
      const response = await plService.createTemplate(
        values.template_code,
        values.template_name,
        values.description,
        values.template_type
      );
      if (response.success && response.data) {
        message.success('Template created successfully');
        setTemplateModalVisible(false);
        templateForm.resetFields();
        loadTemplates();
        // Load the new template in editor
        loadTemplateStructure(response.data.template_id);
      } else {
        message.error(response.error || 'Failed to create template');
      }
    } catch (error) {
      message.error('Failed to create template');
    }
  };

  const handleDeleteTemplate = async (templateId: number) => {
    try {
      const response = await plService.deleteTemplate(templateId);
      if (response.success) {
        message.success('Template deleted successfully');
        loadTemplates();
      } else {
        message.error(response.error || 'Failed to delete template');
      }
    } catch (error) {
      message.error('Failed to delete template');
    }
  };

  const handleCloneTemplate = async (values: any) => {
    if (!editingTemplateId) return;
    try {
      const response = await plService.cloneTemplate(
        editingTemplateId,
        values.new_template_code,
        values.new_template_name
      );
      if (response.success && response.data) {
        message.success('Template cloned successfully');
        setCloneModalVisible(false);
        cloneForm.resetFields();
        loadTemplates();
        loadTemplateStructure(response.data.template_id);
      } else {
        message.error(response.error || 'Failed to clone template');
      }
    } catch (error) {
      message.error('Failed to clone template');
    }
  };

  // Group CRUD
  const handleAddGroup = async (values: any) => {
    if (!editingTemplateId) return;
    try {
      const response = await plService.addGroup(
        editingTemplateId,
        values.group_code,
        values.group_name,
        values.group_label || values.group_name,
        values.group_type,
        values.display_order,
        values.sign_convention
      );
      if (response.success) {
        message.success('Group added successfully');
        setGroupModalVisible(false);
        groupForm.resetFields();
        loadTemplateStructure(editingTemplateId);
      } else {
        message.error(response.error || 'Failed to add group');
      }
    } catch (error) {
      message.error('Failed to add group');
    }
  };

  const handleDeleteGroup = async (groupId: number) => {
    if (!editingTemplateId) return;
    try {
      const response = await plService.deleteGroup(groupId);
      if (response.success) {
        message.success('Group deleted successfully');
        loadTemplateStructure(editingTemplateId);
      } else {
        message.error(response.error || 'Failed to delete group');
      }
    } catch (error) {
      message.error('Failed to delete group');
    }
  };

  // Section CRUD
  const handleAddSection = async (values: any) => {
    if (!selectedGroupId || !editingTemplateId) return;
    try {
      const response = await plService.addSection(
        selectedGroupId,
        values.section_code,
        values.section_name,
        values.section_label || values.section_name,
        values.display_order
      );
      if (response.success) {
        message.success('Section added successfully');
        setSectionModalVisible(false);
        sectionForm.resetFields();
        setSelectedGroupId(null);
        loadTemplateStructure(editingTemplateId);
      } else {
        message.error(response.error || 'Failed to add section');
      }
    } catch (error) {
      message.error('Failed to add section');
    }
  };

  const handleDeleteSection = async (sectionId: number) => {
    if (!editingTemplateId) return;
    try {
      const response = await plService.deleteSection(sectionId);
      if (response.success) {
        message.success('Section deleted successfully');
        loadTemplateStructure(editingTemplateId);
      } else {
        message.error(response.error || 'Failed to delete section');
      }
    } catch (error) {
      message.error('Failed to delete section');
    }
  };

  // Account CRUD
  const handleAssignAccount = async (values: any) => {
    if (!selectedSectionId || !editingTemplateId) return;
    try {
      const response = await plService.assignAccount(
        selectedSectionId,
        values.account_code,
        values.account_from,
        values.account_to
      );
      if (response.success) {
        message.success('Account assigned successfully');
        setAccountModalVisible(false);
        accountForm.resetFields();
        setSelectedSectionId(null);
        loadTemplateStructure(editingTemplateId);
      } else {
        message.error(response.error || 'Failed to assign account');
      }
    } catch (error) {
      message.error('Failed to assign account');
    }
  };

  // Total CRUD
  const handleAddTotal = async (values: any) => {
    if (!editingTemplateId) return;
    try {
      const response = await plService.addTotal(
        editingTemplateId,
        values.total_code,
        values.total_name,
        values.calculation_formula,
        values.display_order,
        values.after_group_code
      );
      if (response.success) {
        message.success('Total added successfully');
        setTotalModalVisible(false);
        totalForm.resetFields();
        loadTemplateStructure(editingTemplateId);
      } else {
        message.error(response.error || 'Failed to add total');
      }
    } catch (error) {
      message.error('Failed to add total');
    }
  };

  const handleDeleteTotal = async (totalId: number) => {
    if (!editingTemplateId) return;
    try {
      const response = await plService.deleteTotal(totalId);
      if (response.success) {
        message.success('Total deleted successfully');
        loadTemplateStructure(editingTemplateId);
      } else {
        message.error(response.error || 'Failed to delete total');
      }
    } catch (error) {
      message.error('Failed to delete total');
    }
  };

  // Template List View
  const renderTemplateList = () => {
    const columns = [
      {
        title: 'Template Code',
        dataIndex: 'template_code',
        key: 'template_code',
        width: 150,
        render: (text: string) => <Text strong>{text}</Text>,
      },
      {
        title: 'Template Name',
        dataIndex: 'template_name',
        key: 'template_name',
        render: (text: string) => text,
      },
      {
        title: 'Type',
        dataIndex: 'template_type',
        key: 'template_type',
        width: 120,
        render: (type: string) => (
          <Tag color={type === 'STANDARD' ? 'blue' : type === 'CUSTOM' ? 'green' : 'default'}>
            {type}
          </Tag>
        ),
      },
      {
        title: 'Default',
        dataIndex: 'is_default',
        key: 'is_default',
        width: 80,
        align: 'center' as const,
        render: (val: string) => val === 'Y' ?
          <CheckCircleOutlined style={{ color: REDWOOD.success }} /> :
          <CloseCircleOutlined style={{ color: REDWOOD.neutral300 }} />,
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 200,
        render: (_: any, record: plService.PLTemplate) => (
          <Space size="small">
            <Tooltip title="Edit">
              <Button
                type="text"
                icon={<EditOutlined />}
                onClick={() => loadTemplateStructure(record.template_id)}
              />
            </Tooltip>
            <Tooltip title="Preview">
              <Button
                type="text"
                icon={<EyeOutlined />}
                onClick={() => {
                  loadTemplateStructure(record.template_id);
                  setTimeout(() => setView('preview'), 500);
                }}
              />
            </Tooltip>
            <Tooltip title="Clone">
              <Button
                type="text"
                icon={<CopyOutlined />}
                onClick={() => {
                  setEditingTemplateId(record.template_id);
                  setCloneModalVisible(true);
                }}
              />
            </Tooltip>
            <Popconfirm
              title="Delete this template?"
              description="This action cannot be undone."
              onConfirm={() => handleDeleteTemplate(record.template_id)}
              okText="Delete"
              okButtonProps={{ danger: true }}
            >
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ];

    return (
      <Card
        title={
          <Space>
            <FileTextOutlined style={{ color: REDWOOD.primary }} />
            <span>Income Statement Templates</span>
          </Space>
        }
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadTemplates}>
              Refresh
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setTemplateModalVisible(true)}
              style={{ background: REDWOOD.primary }}
            >
              New Template
            </Button>
          </Space>
        }
        style={{ borderRadius: 8 }}
      >
        <Table
          columns={columns}
          dataSource={templates}
          rowKey="template_id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No templates found"
              >
                <Button type="primary" onClick={() => setTemplateModalVisible(true)}>
                  Create Template
                </Button>
              </Empty>
            ),
          }}
        />
      </Card>
    );
  };

  // Template Editor View
  const renderTemplateEditor = () => {
    if (!selectedTemplate) return null;

    const { template } = selectedTemplate;

    return (
      <div>
        {/* Header */}
        <Card style={{ marginBottom: 16, borderRadius: 8 }}>
          <Row justify="space-between" align="middle">
            <Col>
              <Space direction="vertical" size={0}>
                <Space>
                  <Button
                    icon={<ArrowLeftOutlined />}
                    onClick={() => {
                      setView('list');
                      setSelectedTemplate(null);
                      setEditingTemplateId(null);
                    }}
                  >
                    Back
                  </Button>
                  <Divider type="vertical" />
                  <Title level={4} style={{ margin: 0 }}>
                    {template.template_name}
                  </Title>
                  <Tag color="blue">{template.template_code}</Tag>
                  <Tag>{template.template_type}</Tag>
                </Space>
                <Text type="secondary" style={{ marginLeft: 80 }}>
                  {template.description || 'No description'}
                </Text>
              </Space>
            </Col>
            <Col>
              <Space>
                <Button
                  icon={<EyeOutlined />}
                  onClick={() => setView('preview')}
                >
                  Preview
                </Button>
                <Button
                  icon={<CopyOutlined />}
                  onClick={() => setCloneModalVisible(true)}
                >
                  Clone
                </Button>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => editingTemplateId && loadTemplateStructure(editingTemplateId)}
                >
                  Refresh
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>

        {/* Editor Tabs */}
        <Card style={{ borderRadius: 8 }}>
          <Tabs defaultActiveKey="structure">
            <TabPane
              tab={<span><FolderOutlined /> Structure</span>}
              key="structure"
            >
              {/* Groups and Sections */}
              <div style={{ marginBottom: 16 }}>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    groupForm.setFieldsValue({
                      display_order: (template.groups.length + 1) * 10,
                      sign_convention: 1,
                    });
                    setGroupModalVisible(true);
                  }}
                  style={{ background: REDWOOD.primary }}
                >
                  Add Group
                </Button>
              </div>

              {template.groups.length === 0 ? (
                <Empty description="No groups defined. Add a group to get started." />
              ) : (
                <Collapse defaultActiveKey={template.groups.map(g => g.group_id.toString())}>
                  {template.groups.map((group) => (
                    <Panel
                      key={group.group_id.toString()}
                      header={
                        <Row justify="space-between" align="middle" style={{ width: '100%' }}>
                          <Col>
                            <Space>
                              <Tag color={GROUP_TYPE_COLORS[group.group_type] || 'default'}>
                                {group.group_type}
                              </Tag>
                              <Text strong>{group.group_name}</Text>
                              <Text type="secondary">({group.group_code})</Text>
                              <Text type="secondary">Order: {group.display_order}</Text>
                              <Text type="secondary">
                                Sign: {group.sign_convention === 1 ? '+' : '-'}
                              </Text>
                            </Space>
                          </Col>
                          <Col onClick={e => e.stopPropagation()}>
                            <Space>
                              <Button
                                type="primary"
                                size="small"
                                icon={<PlusOutlined />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedGroupId(group.group_id);
                                  sectionForm.setFieldsValue({
                                    display_order: (group.sections.length + 1) * 10,
                                  });
                                  setSectionModalVisible(true);
                                }}
                              >
                                Add Section
                              </Button>
                              <Popconfirm
                                title="Delete this group?"
                                description="All sections and accounts will also be deleted."
                                onConfirm={() => handleDeleteGroup(group.group_id)}
                                okText="Delete"
                                okButtonProps={{ danger: true }}
                              >
                                <Button size="small" danger icon={<DeleteOutlined />} />
                              </Popconfirm>
                            </Space>
                          </Col>
                        </Row>
                      }
                    >
                      {/* Sections */}
                      {group.sections.length === 0 ? (
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description="No sections in this group"
                        />
                      ) : (
                        group.sections.map((section) => (
                          <Card
                            key={section.section_id}
                            size="small"
                            style={{ marginBottom: 8 }}
                            title={
                              <Space>
                                <AppstoreOutlined style={{ color: REDWOOD.info }} />
                                <Text strong>{section.section_name}</Text>
                                <Text type="secondary">({section.section_code})</Text>
                              </Space>
                            }
                            extra={
                              <Space>
                                <Button
                                  size="small"
                                  icon={<PlusOutlined />}
                                  onClick={() => {
                                    setSelectedSectionId(section.section_id);
                                    setAccountModalVisible(true);
                                  }}
                                >
                                  Add Account
                                </Button>
                                <Popconfirm
                                  title="Delete this section?"
                                  onConfirm={() => handleDeleteSection(section.section_id)}
                                  okText="Delete"
                                  okButtonProps={{ danger: true }}
                                >
                                  <Button size="small" danger icon={<DeleteOutlined />} />
                                </Popconfirm>
                              </Space>
                            }
                          >
                            {/* Accounts */}
                            {section.accounts.length === 0 ? (
                              <Text type="secondary">No accounts assigned</Text>
                            ) : (
                              <Space wrap>
                                {section.accounts.map((account, idx) => (
                                  <Tag key={idx} closable={false}>
                                    {account.account_from && account.account_to ? (
                                      `${account.account_from} - ${account.account_to}`
                                    ) : (
                                      account.account_code
                                    )}
                                  </Tag>
                                ))}
                              </Space>
                            )}
                          </Card>
                        ))
                      )}
                    </Panel>
                  ))}
                </Collapse>
              )}
            </TabPane>

            <TabPane
              tab={<span><CalculatorOutlined /> Calculated Totals</span>}
              key="totals"
            >
              <div style={{ marginBottom: 16 }}>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    totalForm.setFieldsValue({
                      display_order: (template.totals.length + 1) * 10,
                    });
                    setTotalModalVisible(true);
                  }}
                  style={{ background: REDWOOD.primary }}
                >
                  Add Calculated Total
                </Button>
              </div>

              {template.totals.length === 0 ? (
                <Empty description="No calculated totals defined." />
              ) : (
                <Table
                  dataSource={template.totals}
                  rowKey="total_id"
                  pagination={false}
                  columns={[
                    {
                      title: 'Code',
                      dataIndex: 'total_code',
                      key: 'total_code',
                      width: 100,
                      render: (text) => <Tag color="purple">{text}</Tag>,
                    },
                    {
                      title: 'Name',
                      dataIndex: 'total_name',
                      key: 'total_name',
                    },
                    {
                      title: 'Formula',
                      dataIndex: 'calculation_formula',
                      key: 'calculation_formula',
                      render: (text) => <Text code>{text}</Text>,
                    },
                    {
                      title: 'After Group',
                      dataIndex: 'after_group_code',
                      key: 'after_group_code',
                      render: (text) => text ? <Tag>{text}</Tag> : '-',
                    },
                    {
                      title: 'Order',
                      dataIndex: 'display_order',
                      key: 'display_order',
                      width: 80,
                    },
                    {
                      title: 'Style',
                      dataIndex: 'font_style',
                      key: 'font_style',
                      width: 100,
                      render: (text) => <Tag>{text}</Tag>,
                    },
                    {
                      title: 'Actions',
                      key: 'actions',
                      width: 80,
                      render: (_, record: plService.PLTotal) => (
                        <Popconfirm
                          title="Delete this total?"
                          onConfirm={() => handleDeleteTotal(record.total_id)}
                          okText="Delete"
                          okButtonProps={{ danger: true }}
                        >
                          <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      ),
                    },
                  ]}
                />
              )}
            </TabPane>
          </Tabs>
        </Card>
      </div>
    );
  };

  // Preview View
  const renderPreview = () => {
    if (!selectedTemplate) return null;

    const { template } = selectedTemplate;

    // Build preview rows
    const previewRows: Array<{
      key: string;
      type: 'group' | 'section' | 'total';
      label: string;
      code: string;
      indent: number;
      style: string;
      isTotal?: boolean;
      formula?: string;
    }> = [];

    // Sort groups and totals by display_order
    const items: Array<{type: 'group' | 'total', order: number, data: any}> = [
      ...template.groups.map(g => ({ type: 'group' as const, order: g.display_order, data: g })),
      ...template.totals.map(t => ({ type: 'total' as const, order: t.display_order, data: t })),
    ].sort((a, b) => a.order - b.order);

    items.forEach(item => {
      if (item.type === 'group') {
        const group = item.data as plService.PLGroup;
        // Add group header
        previewRows.push({
          key: `group-${group.group_id}`,
          type: 'group',
          label: group.group_label || group.group_name,
          code: group.group_code,
          indent: 0,
          style: 'BOLD',
        });
        // Add sections
        group.sections.forEach(section => {
          previewRows.push({
            key: `section-${section.section_id}`,
            type: 'section',
            label: section.section_label || section.section_name,
            code: section.section_code,
            indent: 1,
            style: 'NORMAL',
          });
        });
        // Add group subtotal if enabled
        if (group.show_subtotal === 'Y' && group.subtotal_label) {
          previewRows.push({
            key: `subtotal-${group.group_id}`,
            type: 'group',
            label: group.subtotal_label,
            code: '',
            indent: 0,
            style: 'BOLD',
            isTotal: true,
          });
        }
      } else {
        const total = item.data as plService.PLTotal;
        previewRows.push({
          key: `total-${total.total_id}`,
          type: 'total',
          label: total.total_label || total.total_name,
          code: total.total_code,
          indent: 0,
          style: total.font_style,
          isTotal: true,
          formula: total.calculation_formula,
        });
      }
    });

    return (
      <div>
        <Card style={{ marginBottom: 16, borderRadius: 8 }}>
          <Row justify="space-between" align="middle">
            <Col>
              <Space>
                <Button
                  icon={<ArrowLeftOutlined />}
                  onClick={() => setView('editor')}
                >
                  Back to Editor
                </Button>
                <Divider type="vertical" />
                <Title level={4} style={{ margin: 0 }}>
                  Preview: {template.template_name}
                </Title>
              </Space>
            </Col>
          </Row>
        </Card>

        <Card
          title="Income Statement Preview"
          style={{ borderRadius: 8 }}
        >
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <Title level={3}>Profit and Loss Statement</Title>
              <Text type="secondary">For the Period Ending December 31, 2024</Text>
            </div>

            <Table
              dataSource={previewRows}
              pagination={false}
              showHeader={false}
              rowKey="key"
              columns={[
                {
                  dataIndex: 'label',
                  key: 'label',
                  render: (text, record) => (
                    <div style={{
                      paddingLeft: record.indent * 24,
                      fontWeight: record.style === 'BOLD' ? 600 : 400,
                      borderTop: record.isTotal ? '1px solid #e5e5e5' : 'none',
                      paddingTop: record.isTotal ? 8 : 0,
                      marginTop: record.isTotal ? 8 : 0,
                    }}>
                      {text}
                      {record.formula && (
                        <Text type="secondary" style={{ marginLeft: 8 }}>
                          [{record.formula}]
                        </Text>
                      )}
                    </div>
                  ),
                },
                {
                  dataIndex: 'amount',
                  key: 'amount',
                  width: 150,
                  align: 'right' as const,
                  render: (_, record) => (
                    <div style={{
                      fontWeight: record.style === 'BOLD' ? 600 : 400,
                      borderTop: record.isTotal ? '1px solid #e5e5e5' : 'none',
                      paddingTop: record.isTotal ? 8 : 0,
                      marginTop: record.isTotal ? 8 : 0,
                    }}>
                      {record.type === 'section' ? '0.00' : record.isTotal ? '0.00' : ''}
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </Card>
      </div>
    );
  };

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb */}
        <div style={{
          padding: '16px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
        }}>
          <Breadcrumb
            items={[
              { title: <Link to="/home"><HomeOutlined /> Home</Link> },
              { title: <Link to="/gl">General Ledger</Link> },
              { title: 'Income Statement Templates' },
            ]}
          />
        </div>

        {/* Main Content */}
        <div style={{ padding: 24 }}>
          <Spin spinning={loading}>
            {view === 'list' && renderTemplateList()}
            {view === 'editor' && renderTemplateEditor()}
            {view === 'preview' && renderPreview()}
          </Spin>
        </div>

        {/* Create Template Modal */}
        <Modal
          title="Create New Template"
          open={templateModalVisible}
          onCancel={() => {
            setTemplateModalVisible(false);
            templateForm.resetFields();
          }}
          onOk={() => templateForm.submit()}
          okText="Create"
          okButtonProps={{ style: { background: REDWOOD.primary } }}
        >
          <Form form={templateForm} layout="vertical" onFinish={handleCreateTemplate}>
            <Form.Item
              name="template_code"
              label="Template Code"
              rules={[{ required: true, message: 'Enter template code' }]}
            >
              <Input placeholder="e.g., PL_CUSTOM_01" />
            </Form.Item>
            <Form.Item
              name="template_name"
              label="Template Name"
              rules={[{ required: true, message: 'Enter template name' }]}
            >
              <Input placeholder="e.g., Custom Profit & Loss" />
            </Form.Item>
            <Form.Item name="description" label="Description">
              <TextArea rows={3} placeholder="Optional description" />
            </Form.Item>
            <Form.Item name="template_type" label="Type" initialValue="CUSTOM">
              <Select options={plService.TEMPLATE_TYPES} />
            </Form.Item>
          </Form>
        </Modal>

        {/* Clone Template Modal */}
        <Modal
          title="Clone Template"
          open={cloneModalVisible}
          onCancel={() => {
            setCloneModalVisible(false);
            cloneForm.resetFields();
          }}
          onOk={() => cloneForm.submit()}
          okText="Clone"
        >
          <Form form={cloneForm} layout="vertical" onFinish={handleCloneTemplate}>
            <Form.Item
              name="new_template_code"
              label="New Template Code"
              rules={[{ required: true, message: 'Enter new template code' }]}
            >
              <Input placeholder="e.g., PL_COPY_01" />
            </Form.Item>
            <Form.Item
              name="new_template_name"
              label="New Template Name"
              rules={[{ required: true, message: 'Enter new template name' }]}
            >
              <Input placeholder="e.g., Custom P&L Copy" />
            </Form.Item>
          </Form>
        </Modal>

        {/* Add Group Modal */}
        <Modal
          title="Add Group"
          open={groupModalVisible}
          onCancel={() => {
            setGroupModalVisible(false);
            groupForm.resetFields();
          }}
          onOk={() => groupForm.submit()}
          okText="Add"
          okButtonProps={{ style: { background: REDWOOD.primary } }}
        >
          <Form form={groupForm} layout="vertical" onFinish={handleAddGroup}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="group_code"
                  label="Group Code"
                  rules={[{ required: true, message: 'Enter group code' }]}
                >
                  <Input placeholder="e.g., G5" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="group_type"
                  label="Group Type"
                  rules={[{ required: true, message: 'Select group type' }]}
                >
                  <Select options={plService.GROUP_TYPES} placeholder="Select type" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item
              name="group_name"
              label="Group Name"
              rules={[{ required: true, message: 'Enter group name' }]}
            >
              <Input placeholder="e.g., Operating Revenue" />
            </Form.Item>
            <Form.Item name="group_label" label="Display Label">
              <Input placeholder="Leave empty to use group name" />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="display_order"
                  label="Display Order"
                  rules={[{ required: true, message: 'Enter display order' }]}
                >
                  <InputNumber style={{ width: '100%' }} min={1} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="sign_convention"
                  label="Sign Convention"
                  initialValue={1}
                  tooltip="1 for income items (add), -1 for expense items (subtract)"
                >
                  <Select
                    options={[
                      { value: 1, label: '+ (Income/Add)' },
                      { value: -1, label: '- (Expense/Subtract)' },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Modal>

        {/* Add Section Modal */}
        <Modal
          title="Add Section"
          open={sectionModalVisible}
          onCancel={() => {
            setSectionModalVisible(false);
            sectionForm.resetFields();
            setSelectedGroupId(null);
          }}
          onOk={() => sectionForm.submit()}
          okText="Add"
          okButtonProps={{ style: { background: REDWOOD.primary } }}
        >
          <Form form={sectionForm} layout="vertical" onFinish={handleAddSection}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="section_code"
                  label="Section Code"
                  rules={[{ required: true, message: 'Enter section code' }]}
                >
                  <Input placeholder="e.g., G1S4" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="display_order"
                  label="Display Order"
                  rules={[{ required: true, message: 'Enter display order' }]}
                >
                  <InputNumber style={{ width: '100%' }} min={1} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item
              name="section_name"
              label="Section Name"
              rules={[{ required: true, message: 'Enter section name' }]}
            >
              <Input placeholder="e.g., Interest Income" />
            </Form.Item>
            <Form.Item name="section_label" label="Display Label">
              <Input placeholder="Leave empty to use section name" />
            </Form.Item>
          </Form>
        </Modal>

        {/* Add Account Modal */}
        <Modal
          title="Assign Account"
          open={accountModalVisible}
          onCancel={() => {
            setAccountModalVisible(false);
            accountForm.resetFields();
            setSelectedSectionId(null);
          }}
          onOk={() => accountForm.submit()}
          okText="Assign"
          okButtonProps={{ style: { background: REDWOOD.primary } }}
        >
          <Form form={accountForm} layout="vertical" onFinish={handleAssignAccount}>
            <Form.Item
              name="account_code"
              label="Account Code"
              rules={[{ required: true, message: 'Enter account code' }]}
              tooltip="Enter a single account code"
            >
              <Input placeholder="e.g., 4100000" />
            </Form.Item>
            <Divider>Or specify an account range</Divider>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="account_from" label="From Account">
                  <Input placeholder="e.g., 4100000" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="account_to" label="To Account">
                  <Input placeholder="e.g., 4199999" />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Modal>

        {/* Add Total Modal */}
        <Modal
          title="Add Calculated Total"
          open={totalModalVisible}
          onCancel={() => {
            setTotalModalVisible(false);
            totalForm.resetFields();
          }}
          onOk={() => totalForm.submit()}
          okText="Add"
          okButtonProps={{ style: { background: REDWOOD.primary } }}
          width={600}
        >
          <Form form={totalForm} layout="vertical" onFinish={handleAddTotal}>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item
                  name="total_code"
                  label="Total Code"
                  rules={[{ required: true, message: 'Enter total code' }]}
                >
                  <Input placeholder="e.g., T6" />
                </Form.Item>
              </Col>
              <Col span={16}>
                <Form.Item
                  name="total_name"
                  label="Total Name"
                  rules={[{ required: true, message: 'Enter total name' }]}
                >
                  <Input placeholder="e.g., Net Profit" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item
              name="calculation_formula"
              label="Calculation Formula"
              rules={[{ required: true, message: 'Enter formula' }]}
              tooltip="Use group codes (G1, G2) or total codes (T1, T2) with +/- operators"
            >
              <Input placeholder="e.g., G1+G2-G3 or T2+T3" />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="display_order"
                  label="Display Order"
                  rules={[{ required: true, message: 'Enter display order' }]}
                >
                  <InputNumber style={{ width: '100%' }} min={1} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="after_group_code" label="Show After Group">
                  <Select
                    allowClear
                    placeholder="Select group"
                    options={
                      selectedTemplate?.template.groups.map(g => ({
                        value: g.group_code,
                        label: `${g.group_code} - ${g.group_name}`,
                      })) || []
                    }
                  />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Modal>
      </Content>

      {/* Autopilot */}
      <Autopilot />
    </Layout>
  );
};

export default IncomeStatementTemplates;
