import React, { useState } from 'react';
import { Layout, Menu, Typography, Card, Table, Button, Space, Breadcrumb } from 'antd';
import {
  SettingOutlined,
  SwapOutlined,
  FileTextOutlined,
  BankOutlined,
  BookOutlined,
  AuditOutlined,
  PlusOutlined,
  HomeOutlined,
  AccountBookOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { MenuProps } from 'antd';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;

type MenuItem = Required<MenuProps>['items'][number];

const menuItems: MenuItem[] = [
  {
    key: 'setup',
    icon: <SettingOutlined />,
    label: 'Setup',
    children: [
      { key: 'chart-of-accounts', icon: <BookOutlined />, label: 'Chart of Accounts' },
      { key: 'fiscal-calendar', icon: <BankOutlined />, label: 'Fiscal Calendar' },
      { key: 'currencies', icon: <BankOutlined />, label: 'Currencies' },
      { key: 'ledgers', icon: <BookOutlined />, label: 'Ledgers' },
      { key: 'account-combinations', icon: <SettingOutlined />, label: 'Account Combinations' },
    ],
  },
  {
    key: 'transactions',
    icon: <SwapOutlined />,
    label: 'Transactions',
    children: [
      { key: 'journal-entry', icon: <FileTextOutlined />, label: 'Journal Entry' },
      { key: 'recurring-journals', icon: <FileTextOutlined />, label: 'Recurring Journals' },
      { key: 'import-journals', icon: <FileTextOutlined />, label: 'Import Journals' },
      { key: 'reversals', icon: <SwapOutlined />, label: 'Reversals' },
    ],
  },
  {
    key: 'period-close',
    icon: <AuditOutlined />,
    label: 'Period Close',
    children: [
      { key: 'open-close-periods', icon: <AuditOutlined />, label: 'Open/Close Periods' },
      { key: 'revaluation', icon: <BankOutlined />, label: 'Revaluation' },
      { key: 'translation', icon: <SwapOutlined />, label: 'Translation' },
      { key: 'consolidation', icon: <AuditOutlined />, label: 'Consolidation' },
    ],
  },
  {
    key: 'reports',
    icon: <FileTextOutlined />,
    label: 'Reports',
    children: [
      { key: 'trial-balance', icon: <FileTextOutlined />, label: 'Trial Balance' },
      { key: 'balance-sheet', icon: <FileTextOutlined />, label: 'Balance Sheet' },
      { key: 'income-statement', icon: <FileTextOutlined />, label: 'Income Statement' },
      { key: 'journal-report', icon: <FileTextOutlined />, label: 'Journal Report' },
      { key: 'account-analysis', icon: <FileTextOutlined />, label: 'Account Analysis' },
    ],
  },
];

// Sample data for Chart of Accounts
const chartOfAccountsData = [
  { key: '1', accountCode: '1000', accountName: 'Cash', type: 'Asset', balance: 150000 },
  { key: '2', accountCode: '1100', accountName: 'Accounts Receivable', type: 'Asset', balance: 85000 },
  { key: '3', accountCode: '1200', accountName: 'Inventory', type: 'Asset', balance: 120000 },
  { key: '4', accountCode: '1500', accountName: 'Fixed Assets', type: 'Asset', balance: 500000 },
  { key: '5', accountCode: '2000', accountName: 'Accounts Payable', type: 'Liability', balance: 45000 },
  { key: '6', accountCode: '2100', accountName: 'Accrued Expenses', type: 'Liability', balance: 25000 },
  { key: '7', accountCode: '3000', accountName: 'Retained Earnings', type: 'Equity', balance: 350000 },
  { key: '8', accountCode: '4000', accountName: 'Sales Revenue', type: 'Revenue', balance: 980000 },
  { key: '9', accountCode: '5000', accountName: 'Cost of Goods Sold', type: 'Expense', balance: 420000 },
  { key: '10', accountCode: '6000', accountName: 'Operating Expenses', type: 'Expense', balance: 180000 },
];

const journalEntriesData = [
  { key: '1', journalId: 'JE-2024-001', date: '2024-01-15', description: 'Monthly Rent Payment', debit: 5000, credit: 5000, status: 'Posted' },
  { key: '2', journalId: 'JE-2024-002', date: '2024-01-16', description: 'Sales Revenue Recognition', debit: 25000, credit: 25000, status: 'Posted' },
  { key: '3', journalId: 'JE-2024-003', date: '2024-01-17', description: 'Inventory Purchase', debit: 15000, credit: 15000, status: 'Pending' },
  { key: '4', journalId: 'JE-2024-004', date: '2024-01-18', description: 'Payroll Accrual', debit: 45000, credit: 45000, status: 'Draft' },
];

const GLModule: React.FC = () => {
  const [selectedKey, setSelectedKey] = useState('chart-of-accounts');
  const [openKeys, setOpenKeys] = useState(['setup']);

  const handleMenuClick: MenuProps['onClick'] = (e) => {
    setSelectedKey(e.key);
  };

  const handleOpenChange = (keys: string[]) => {
    setOpenKeys(keys);
  };

  const renderContent = () => {
    switch (selectedKey) {
      case 'chart-of-accounts':
        return (
          <Card>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Title level={4} style={{ margin: 0 }}>Chart of Accounts</Title>
              <Button type="primary" icon={<PlusOutlined />}>
                New Account
              </Button>
            </div>
            <Table
              dataSource={chartOfAccountsData}
              columns={[
                { title: 'Account Code', dataIndex: 'accountCode', key: 'accountCode', sorter: true },
                { title: 'Account Name', dataIndex: 'accountName', key: 'accountName', sorter: true },
                { title: 'Type', dataIndex: 'type', key: 'type', filters: [
                  { text: 'Asset', value: 'Asset' },
                  { text: 'Liability', value: 'Liability' },
                  { text: 'Equity', value: 'Equity' },
                  { text: 'Revenue', value: 'Revenue' },
                  { text: 'Expense', value: 'Expense' },
                ]},
                { title: 'Balance', dataIndex: 'balance', key: 'balance', align: 'right' as const,
                  render: (value: number) => `$${value.toLocaleString()}` },
                { title: 'Actions', key: 'actions', render: () => (
                  <Space>
                    <Button type="link" size="small">Edit</Button>
                    <Button type="link" size="small">View</Button>
                  </Space>
                )},
              ]}
              pagination={{ pageSize: 10 }}
              size="middle"
            />
          </Card>
        );

      case 'journal-entry':
        return (
          <Card>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Title level={4} style={{ margin: 0 }}>Journal Entries</Title>
              <Button type="primary" icon={<PlusOutlined />}>
                New Journal Entry
              </Button>
            </div>
            <Table
              dataSource={journalEntriesData}
              columns={[
                { title: 'Journal ID', dataIndex: 'journalId', key: 'journalId' },
                { title: 'Date', dataIndex: 'date', key: 'date', sorter: true },
                { title: 'Description', dataIndex: 'description', key: 'description' },
                { title: 'Debit', dataIndex: 'debit', key: 'debit', align: 'right' as const,
                  render: (value: number) => `$${value.toLocaleString()}` },
                { title: 'Credit', dataIndex: 'credit', key: 'credit', align: 'right' as const,
                  render: (value: number) => `$${value.toLocaleString()}` },
                { title: 'Status', dataIndex: 'status', key: 'status',
                  render: (status: string) => {
                    const colors: Record<string, string> = { Posted: '#52c41a', Pending: '#faad14', Draft: '#d9d9d9' };
                    return <span style={{ color: colors[status] || '#000' }}>{status}</span>;
                  }
                },
                { title: 'Actions', key: 'actions', render: () => (
                  <Space>
                    <Button type="link" size="small">Edit</Button>
                    <Button type="link" size="small">Post</Button>
                  </Space>
                )},
              ]}
              pagination={{ pageSize: 10 }}
              size="middle"
            />
          </Card>
        );

      default:
        return (
          <Card>
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <AccountBookOutlined style={{ fontSize: 64, color: '#d9d9d9', marginBottom: 16 }} />
              <Title level={4} type="secondary">
                {selectedKey.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
              </Title>
              <Text type="secondary">
                This feature is under development. Select Chart of Accounts or Journal Entry to see sample data.
              </Text>
            </div>
          </Card>
        );
    }
  };

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)' }}>
      <Sider
        width={260}
        style={{
          background: '#fff',
          borderRight: '1px solid #f0f0f0',
        }}
      >
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}>
          <Space>
            <AccountBookOutlined style={{ fontSize: 24, color: '#1890ff' }} />
            <Title level={4} style={{ margin: 0 }}>General Ledger</Title>
          </Space>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          openKeys={openKeys}
          onOpenChange={handleOpenChange}
          onClick={handleMenuClick}
          style={{ borderRight: 0, padding: '8px 0' }}
          items={menuItems}
        />
      </Sider>
      <Content style={{ background: '#f5f5f5' }}>
        <div style={{ padding: '16px 24px', background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
          <Breadcrumb
            items={[
              { title: <Link to="/home"><HomeOutlined /> Home</Link> },
              { title: 'General Ledger' },
              { title: selectedKey.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') },
            ]}
          />
        </div>
        <div style={{ padding: 24 }}>
          {renderContent()}
        </div>
      </Content>
    </Layout>
  );
};

export default GLModule;
