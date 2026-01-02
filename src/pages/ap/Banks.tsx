import React, { useState, useCallback, useEffect } from 'react';
import {
  Layout,
  Card,
  Table,
  Button,
  Space,
  Typography,
  Breadcrumb,
  Tag,
  Row,
  Col,
  Switch,
  Spin,
  Alert,
  Tabs,
  List,
  Empty,
  Tooltip,
} from 'antd';
import {
  HomeOutlined,
  BankOutlined,
  BranchesOutlined,
  CreditCardOutlined,
  ReloadOutlined,
  DatabaseOutlined,
  CloudOutlined,
  CloseOutlined,
  GlobalOutlined,
  CheckCircleOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { PROXY_CONFIG } from '../../config/api.config';
import Autopilot from '../../components/Autopilot';

const { Content } = Layout;
const { Title, Text } = Typography;

// Oracle Redwood Color Palette
const REDWOOD = {
  primary: '#C74634',
  primaryDark: '#A33B2C',
  success: '#1D7B4D',
  warning: '#D4A800',
  error: '#C74634',
  info: '#0572CE',
  neutral: '#383838',
  surface: '#FFFFFF',
  surfaceSecondary: '#F7F7F7',
  border: '#E5E5E5',
  textPrimary: '#1A1A1A',
  textSecondary: '#6B6B6B',
};

// Types
interface Bank {
  BankPartyId: number;
  BankName: string;
  BankNameAlt: string | null;
  BankNumber: string;
  Description: string | null;
  CountryName: string;
  BankPartyNumber: string;
  CreatedBy: string;
  CreationDate: string;
  LastUpdateDate: string;
  LastUpdatedBy: string;
}

interface BankBranch {
  BranchPartyId: number;
  BankName: string;
  BankBranchName: string;
  BankBranchNameAlt: string | null;
  BranchNumber: string;
  BankNumber: string;
  Description: string | null;
  EFTSWIFTCode: string | null;
  CountryName: string;
  BranchPartyNumber: string;
  BankPartyNumber: string;
  CreatedBy: string;
  CreationDate: string;
  LastUpdateDate: string;
}

interface BankAccount {
  BankAccountId: number;
  BankAccountName: string;
  BankAccountNumber: string;
  BankAccountNumberElectronic: string;
  MaskedAccountNumber: string;
  CurrencyCode: string;
  BankName: string;
  BankBranchName: string;
  BranchNumber: string;
  LegalEntityName: string;
  Description: string | null;
  AccountType: string;
  ApUseAllowedFlag: boolean;
  ArUseAllowedFlag: boolean;
  CashAccountCombination: string;
  ReconStartDate: string;
  CreatedBy: string;
  CreationDate: string;
  LastUpdateDate: string;
}

interface BankTab {
  key: string;
  bank: Bank;
  branches: BankBranch[];
  branchLoading: boolean;
  selectedBranch: BankBranch | null;
  accountTabs: AccountTab[];
}

interface AccountTab {
  key: string;
  branch: BankBranch;
  accounts: BankAccount[];
  loading: boolean;
}

const Banks: React.FC = () => {
  const [dataSource, setDataSource] = useState<'fusion' | 'apex'>('fusion');
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [activeMainTab, setActiveMainTab] = useState('all-banks');
  const [bankTabs, setBankTabs] = useState<BankTab[]>([]);

  // Fetch banks from selected source
  const fetchBanks = useCallback(async () => {
    setLoading(true);
    setError('');
    setBanks([]);

    try {
      const url = `${PROXY_CONFIG.baseUrl}/oracle/cashBanks?limit=500`;
      const response = await fetch(url);
      const result = await response.json();

      if (result.success && result.items) {
        setBanks(result.items);
      } else {
        throw new Error(result.error || 'Failed to fetch banks');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch branches for a bank
  const fetchBranches = async (bankName: string): Promise<BankBranch[]> => {
    try {
      const encodedBankName = encodeURIComponent(bankName);
      const url = `${PROXY_CONFIG.baseUrl}/oracle/cashBankBranches?q=BankName=${encodedBankName}`;
      const response = await fetch(url);
      const result = await response.json();

      if (result.success && result.items) {
        return result.items;
      }
      return [];
    } catch (err) {
      console.error('Error fetching branches:', err);
      return [];
    }
  };

  // Fetch accounts for a branch
  const fetchAccounts = async (branchName: string): Promise<BankAccount[]> => {
    try {
      const encodedBranchName = encodeURIComponent(branchName);
      const url = `${PROXY_CONFIG.baseUrl}/oracle/cashBankAccounts?q=BankBranchName=${encodedBranchName}`;
      const response = await fetch(url);
      const result = await response.json();

      if (result.success && result.items) {
        return result.items;
      }
      return [];
    } catch (err) {
      console.error('Error fetching accounts:', err);
      return [];
    }
  };

  // Fetch on mount
  useEffect(() => {
    fetchBanks();
  }, [fetchBanks]);

  // Toggle data source
  const handleSourceToggle = (checked: boolean) => {
    setDataSource(checked ? 'fusion' : 'apex');
  };

  // Open bank tab
  const handleBankClick = async (bank: Bank) => {
    const tabKey = `bank-${bank.BankPartyId}`;

    // Check if tab already exists
    const existingTab = bankTabs.find(t => t.key === tabKey);
    if (existingTab) {
      setActiveMainTab(tabKey);
      return;
    }

    // Create new tab with loading state
    const newTab: BankTab = {
      key: tabKey,
      bank,
      branches: [],
      branchLoading: true,
      selectedBranch: null,
      accountTabs: [],
    };

    setBankTabs(prev => [...prev, newTab]);
    setActiveMainTab(tabKey);

    // Fetch branches
    const branches = await fetchBranches(bank.BankName);

    setBankTabs(prev => prev.map(t =>
      t.key === tabKey
        ? { ...t, branches, branchLoading: false }
        : t
    ));
  };

  // Select branch and open accounts tab
  const handleBranchClick = async (bankTabKey: string, branch: BankBranch) => {
    const accountTabKey = `account-${branch.BranchPartyId}`;

    setBankTabs(prev => prev.map(t => {
      if (t.key !== bankTabKey) return t;

      // Check if account tab already exists
      const existingAccountTab = t.accountTabs.find(at => at.key === accountTabKey);
      if (existingAccountTab) {
        return { ...t, selectedBranch: branch };
      }

      // Create new account tab
      const newAccountTab: AccountTab = {
        key: accountTabKey,
        branch,
        accounts: [],
        loading: true,
      };

      return {
        ...t,
        selectedBranch: branch,
        accountTabs: [...t.accountTabs, newAccountTab],
      };
    }));

    // Fetch accounts
    const accounts = await fetchAccounts(branch.BankBranchName);

    setBankTabs(prev => prev.map(t => {
      if (t.key !== bankTabKey) return t;

      return {
        ...t,
        accountTabs: t.accountTabs.map(at =>
          at.key === accountTabKey
            ? { ...at, accounts, loading: false }
            : at
        ),
      };
    }));
  };

  // Close bank tab
  const handleCloseBankTab = (tabKey: string) => {
    setBankTabs(prev => prev.filter(t => t.key !== tabKey));
    setActiveMainTab('all-banks');
  };

  // Close account tab
  const handleCloseAccountTab = (bankTabKey: string, accountTabKey: string) => {
    setBankTabs(prev => prev.map(t => {
      if (t.key !== bankTabKey) return t;

      const newAccountTabs = t.accountTabs.filter(at => at.key !== accountTabKey);
      return {
        ...t,
        accountTabs: newAccountTabs,
        selectedBranch: newAccountTabs.length > 0 ? t.selectedBranch : null,
      };
    }));
  };

  // Banks table columns
  const bankColumns = [
    {
      title: 'Bank Name',
      dataIndex: 'BankName',
      key: 'BankName',
      render: (name: string, record: Bank) => (
        <Button type="link" onClick={() => handleBankClick(record)} style={{ padding: 0 }}>
          <Space>
            <BankOutlined style={{ color: REDWOOD.info }} />
            <Text strong>{name}</Text>
          </Space>
        </Button>
      ),
    },
    {
      title: 'Bank Number',
      dataIndex: 'BankNumber',
      key: 'BankNumber',
      width: 120,
    },
    {
      title: 'Country',
      dataIndex: 'CountryName',
      key: 'CountryName',
      width: 150,
      render: (country: string) => (
        <Space>
          <GlobalOutlined style={{ color: REDWOOD.textSecondary }} />
          {country}
        </Space>
      ),
    },
    {
      title: 'Party Number',
      dataIndex: 'BankPartyNumber',
      key: 'BankPartyNumber',
      width: 120,
    },
    {
      title: 'Last Updated',
      dataIndex: 'LastUpdateDate',
      key: 'LastUpdateDate',
      width: 180,
      render: (date: string) => date ? new Date(date).toLocaleString() : '-',
    },
  ];

  // Accounts table columns
  const accountColumns = [
    {
      title: 'Account Name',
      dataIndex: 'BankAccountName',
      key: 'BankAccountName',
      ellipsis: true,
      render: (name: string) => (
        <Tooltip title={name}>
          <Text strong style={{ fontSize: 12 }}>{name}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Account Number',
      dataIndex: 'MaskedAccountNumber',
      key: 'MaskedAccountNumber',
      width: 150,
      render: (num: string) => <Text code style={{ fontSize: 11 }}>{num}</Text>,
    },
    {
      title: 'Currency',
      dataIndex: 'CurrencyCode',
      key: 'CurrencyCode',
      width: 80,
      render: (code: string) => <Tag color="blue">{code}</Tag>,
    },
    {
      title: 'Legal Entity',
      dataIndex: 'LegalEntityName',
      key: 'LegalEntityName',
      width: 200,
      ellipsis: true,
    },
    {
      title: 'AP',
      dataIndex: 'ApUseAllowedFlag',
      key: 'ApUseAllowedFlag',
      width: 50,
      render: (flag: boolean) => flag ? <CheckCircleOutlined style={{ color: REDWOOD.success }} /> : '-',
    },
    {
      title: 'AR',
      dataIndex: 'ArUseAllowedFlag',
      key: 'ArUseAllowedFlag',
      width: 50,
      render: (flag: boolean) => flag ? <CheckCircleOutlined style={{ color: REDWOOD.success }} /> : '-',
    },
    {
      title: 'Cash Account',
      dataIndex: 'CashAccountCombination',
      key: 'CashAccountCombination',
      width: 220,
      ellipsis: true,
      render: (combo: string) => (
        <Tooltip title={combo}>
          <Text code style={{ fontSize: 10 }}>{combo}</Text>
        </Tooltip>
      ),
    },
  ];

  // Render bank detail tab content
  const renderBankTabContent = (bankTab: BankTab) => {
    const activeAccountTabKey = bankTab.accountTabs.length > 0
      ? bankTab.accountTabs[bankTab.accountTabs.length - 1].key
      : undefined;

    return (
      <div style={{ display: 'flex', height: 'calc(100vh - 280px)', gap: 16 }}>
        {/* Left Panel - Branches */}
        <Card
          style={{
            width: 320,
            flexShrink: 0,
            borderRadius: 12,
            border: `1px solid ${REDWOOD.border}`,
            display: 'flex',
            flexDirection: 'column',
          }}
          bodyStyle={{ padding: 0, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
          {/* Bank Header */}
          <div style={{
            padding: '12px 16px',
            background: REDWOOD.info,
            color: '#fff',
          }}>
            <Space>
              <BankOutlined />
              <Text strong style={{ color: '#fff' }}>{bankTab.bank.BankName}</Text>
            </Space>
          </div>

          {/* Branches Header */}
          <div style={{
            padding: '8px 16px',
            background: REDWOOD.surfaceSecondary,
            borderBottom: `1px solid ${REDWOOD.border}`,
          }}>
            <Space>
              <BranchesOutlined style={{ color: REDWOOD.primary }} />
              <Text strong>Branches ({bankTab.branches.length})</Text>
            </Space>
          </div>

          {/* Branches List */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {bankTab.branchLoading ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <Spin tip="Loading branches..." />
              </div>
            ) : bankTab.branches.length === 0 ? (
              <Empty description="No branches found" style={{ padding: 40 }} />
            ) : (
              <List
                dataSource={bankTab.branches}
                renderItem={(branch) => {
                  const isSelected = bankTab.selectedBranch?.BranchPartyId === branch.BranchPartyId;
                  return (
                    <List.Item
                      onClick={() => handleBranchClick(bankTab.key, branch)}
                      style={{
                        padding: '10px 16px',
                        cursor: 'pointer',
                        background: isSelected ? `${REDWOOD.info}15` : 'transparent',
                        borderLeft: isSelected ? `3px solid ${REDWOOD.info}` : '3px solid transparent',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = REDWOOD.surfaceSecondary;
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{ width: '100%' }}>
                        <Text strong style={{ display: 'block', fontSize: 13, color: isSelected ? REDWOOD.info : REDWOOD.textPrimary }}>
                          {branch.BankBranchName}
                        </Text>
                        <Space size="small" style={{ marginTop: 4 }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>{branch.BranchNumber}</Text>
                          {branch.EFTSWIFTCode && (
                            <Tag style={{ fontSize: 10, margin: 0 }}>{branch.EFTSWIFTCode}</Tag>
                          )}
                        </Space>
                      </div>
                    </List.Item>
                  );
                }}
              />
            )}
          </div>
        </Card>

        {/* Right Panel - Accounts */}
        <Card
          style={{
            flex: 1,
            borderRadius: 12,
            border: `1px solid ${REDWOOD.border}`,
            display: 'flex',
            flexDirection: 'column',
          }}
          bodyStyle={{ padding: 0, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
          {bankTab.accountTabs.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Empty
                image={<CreditCardOutlined style={{ fontSize: 48, color: REDWOOD.textSecondary }} />}
                description={
                  <Text type="secondary">Select a branch to view bank accounts</Text>
                }
              />
            </div>
          ) : (
            <Tabs
              type="editable-card"
              hideAdd
              activeKey={activeAccountTabKey}
              onChange={(key) => {
                const accountTab = bankTab.accountTabs.find(at => at.key === key);
                if (accountTab) {
                  setBankTabs(prev => prev.map(t =>
                    t.key === bankTab.key ? { ...t, selectedBranch: accountTab.branch } : t
                  ));
                }
              }}
              onEdit={(targetKey, action) => {
                if (action === 'remove') {
                  handleCloseAccountTab(bankTab.key, targetKey as string);
                }
              }}
              style={{ height: '100%' }}
              tabBarStyle={{ margin: 0, padding: '0 16px', background: REDWOOD.surfaceSecondary }}
              items={bankTab.accountTabs.map(accountTab => ({
                key: accountTab.key,
                label: (
                  <Space size="small">
                    <CreditCardOutlined />
                    <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                      {accountTab.branch.BankBranchName}
                    </span>
                  </Space>
                ),
                children: (
                  <div style={{ padding: 16, height: 'calc(100% - 46px)', overflow: 'auto' }}>
                    {accountTab.loading ? (
                      <div style={{ padding: 40, textAlign: 'center' }}>
                        <Spin tip="Loading accounts..." />
                      </div>
                    ) : accountTab.accounts.length === 0 ? (
                      <Empty description="No bank accounts found for this branch" />
                    ) : (
                      <>
                        <div style={{ marginBottom: 12 }}>
                          <Space>
                            <DollarOutlined style={{ color: REDWOOD.success }} />
                            <Text strong>Bank Accounts ({accountTab.accounts.length})</Text>
                          </Space>
                        </div>
                        <Table
                          dataSource={accountTab.accounts}
                          columns={accountColumns}
                          rowKey="BankAccountId"
                          size="small"
                          pagination={{ pageSize: 10, showSizeChanger: false }}
                          scroll={{ x: 900 }}
                        />
                      </>
                    )}
                  </div>
                ),
              }))}
            />
          )}
        </Card>
      </div>
    );
  };

  // Build main tabs
  const mainTabItems = [
    {
      key: 'all-banks',
      label: (
        <Space>
          <BankOutlined />
          All Banks
        </Space>
      ),
      closable: false,
      children: (
        <Card
          style={{
            borderRadius: 12,
            border: `1px solid ${REDWOOD.border}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}
          bodyStyle={{ padding: 0 }}
        >
          {error && (
            <Alert
              message="Error Loading Banks"
              description={error}
              type="error"
              showIcon
              closable
              onClose={() => setError('')}
              style={{ margin: 16, borderRadius: 8 }}
            />
          )}
          <Spin spinning={loading} tip="Loading banks...">
            <Table
              dataSource={banks}
              columns={bankColumns}
              rowKey="BankPartyId"
              size="middle"
              pagination={{
                pageSize: 25,
                showSizeChanger: true,
                pageSizeOptions: ['10', '25', '50', '100'],
                showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} banks`,
              }}
              onRow={(record) => ({
                style: { cursor: 'pointer' },
                onDoubleClick: () => handleBankClick(record),
              })}
            />
          </Spin>
        </Card>
      ),
    },
    ...bankTabs.map(bankTab => ({
      key: bankTab.key,
      label: (
        <Space>
          <BankOutlined style={{ color: REDWOOD.info }} />
          <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
            {bankTab.bank.BankName}
          </span>
        </Space>
      ),
      closable: true,
      children: renderBankTabContent(bankTab),
    })),
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.surfaceSecondary }}>
      <Content>
        {/* Header */}
        <div style={{
          padding: '16px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.border}`
        }}>
          <Breadcrumb
            items={[
              { title: <Link to="/home"><HomeOutlined /> Home</Link> },
              { title: <Link to="/ap">Payables</Link> },
              { title: 'Banks' },
            ]}
          />
        </div>

        <div style={{ padding: 24 }}>
          {/* Title and Controls */}
          <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
            <Col>
              <Space align="center">
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 8,
                  background: REDWOOD.info,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <BankOutlined style={{ fontSize: 24, color: '#fff' }} />
                </div>
                <div>
                  <Title level={3} style={{ margin: 0, color: REDWOOD.textPrimary }}>
                    Banks
                  </Title>
                  <Text type="secondary">Manage banks, branches, and bank accounts</Text>
                </div>
              </Space>
            </Col>
            <Col>
              <Space size="large">
                {/* Data Source Toggle */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 16px',
                  background: REDWOOD.surface,
                  borderRadius: 8,
                  border: `1px solid ${REDWOOD.border}`,
                }}>
                  <Space>
                    <DatabaseOutlined style={{ color: dataSource === 'apex' ? REDWOOD.primary : REDWOOD.textSecondary }} />
                    <Text strong={dataSource === 'apex'} style={{ color: dataSource === 'apex' ? REDWOOD.textPrimary : REDWOOD.textSecondary }}>
                      APEX DB
                    </Text>
                  </Space>
                  <Switch
                    checked={dataSource === 'fusion'}
                    onChange={handleSourceToggle}
                    style={{ background: dataSource === 'fusion' ? REDWOOD.info : REDWOOD.primary }}
                  />
                  <Space>
                    <CloudOutlined style={{ color: dataSource === 'fusion' ? REDWOOD.info : REDWOOD.textSecondary }} />
                    <Text strong={dataSource === 'fusion'} style={{ color: dataSource === 'fusion' ? REDWOOD.textPrimary : REDWOOD.textSecondary }}>
                      Fusion
                    </Text>
                  </Space>
                </div>

                <Button
                  icon={<ReloadOutlined />}
                  onClick={fetchBanks}
                  loading={loading}
                >
                  Refresh
                </Button>
              </Space>
            </Col>
          </Row>

          {/* Main Tabs */}
          <Tabs
            type="editable-card"
            hideAdd
            activeKey={activeMainTab}
            onChange={setActiveMainTab}
            onEdit={(targetKey, action) => {
              if (action === 'remove') {
                handleCloseBankTab(targetKey as string);
              }
            }}
            items={mainTabItems}
            tabBarStyle={{
              marginBottom: 16,
              background: REDWOOD.surface,
              padding: '8px 16px 0',
              borderRadius: '12px 12px 0 0',
              border: `1px solid ${REDWOOD.border}`,
              borderBottom: 'none',
            }}
          />
        </div>
      </Content>

      {/* Autopilot Assistant */}
      <Autopilot />
    </Layout>
  );
};

export default Banks;
