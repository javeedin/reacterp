import React, { useState } from 'react';
import { Modal, Input, Table, Button, Spin, Empty, Space, Tag, Drawer, Typography, Divider, Button as AntButton } from 'antd';
import { SearchOutlined, ApiOutlined, CopyOutlined } from '@ant-design/icons';
import { searchCustomersByBIP, CustomerSearchResult, type CustomerSearchResponse } from '../services/customerSearchBip.service';
import { ORACLE_SOAP_CONFIG } from '../config/api.config';

const { Text, Paragraph, Code } = Typography;

interface CustomerSearchBipModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (customer: CustomerSearchResult) => void;
  businessUnitId?: string;
  soapBaseUrl?: string;
  username?: string;
  password?: string;
}

const CustomerSearchBipModal: React.FC<CustomerSearchBipModalProps> = ({
  open,
  onClose,
  onSelect,
  businessUnitId = '',
  soapBaseUrl = ORACLE_SOAP_CONFIG.prod.baseUrl,
  username = ORACLE_SOAP_CONFIG.prod.username,
  password = ORACLE_SOAP_CONFIG.prod.password,
}) => {
  const [searchText, setSearchText] = useState('');
  const [customers, setCustomers] = useState<CustomerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiDrawerOpen, setApiDrawerOpen] = useState(false);
  const [lastResponse, setLastResponse] = useState<CustomerSearchResponse | null>(null);

  const handleSearch = async () => {
    if (!searchText.trim() || !businessUnitId) {
      return;
    }

    setLoading(true);
    try {
      const response = await searchCustomersByBIP(
        businessUnitId,
        searchText.trim(),
        soapBaseUrl,
        username,
        password
      );

      setLastResponse(response);

      if (response.success && response.customers) {
        setCustomers(response.customers);
      } else {
        setCustomers([]);
      }
    } catch (error) {
      console.error('Customer search error:', error);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCustomer = (customer: CustomerSearchResult) => {
    onSelect(customer);
    setSearchText('');
    setCustomers([]);
    onClose();
  };

  const columns = [
    {
      title: 'Account Name',
      dataIndex: 'accountName',
      key: 'accountName',
      width: 200,
      render: (text: string) => <span>{text}</span>,
    },
    {
      title: 'Account Number',
      dataIndex: 'accountNumber',
      key: 'accountNumber',
      width: 120,
    },
    {
      title: 'Party Number',
      dataIndex: 'partyNumber',
      key: 'partyNumber',
      width: 100,
    },
    {
      title: 'City',
      dataIndex: 'city',
      key: 'city',
      width: 100,
    },
    {
      title: 'Country',
      dataIndex: 'country',
      key: 'country',
      width: 80,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (text: string) => (
        <Tag color={text === 'A' ? 'green' : 'red'}>{text}</Tag>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      width: 100,
      render: (_: any, record: CustomerSearchResult) => (
        <Button type="primary" size="small" onClick={() => handleSelectCustomer(record)}>
          Select
        </Button>
      ),
    },
  ];

  return (
    <>
      <Modal
        title="Search Customer (BIP Report)"
        open={open}
        onCancel={onClose}
        width={1200}
        footer={null}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Input
              placeholder="Enter customer name..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleSearch}
              disabled={!businessUnitId || loading}
              style={{ flex: 1 }}
            />
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={handleSearch}
              loading={loading}
              disabled={!businessUnitId || !searchText.trim()}
            >
              Search
            </Button>
            <Button
              icon={<ApiOutlined />}
              onClick={() => setApiDrawerOpen(true)}
              title="View API Request/Response"
            />
          </div>

          {!businessUnitId && (
            <Empty description="Please select a business unit first" />
          )}

          {businessUnitId && loading && (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Spin />
            </div>
          )}

          {businessUnitId && !loading && customers.length === 0 && searchText && (
            <Empty description="No customers found" />
          )}

          {businessUnitId && !loading && customers.length > 0 && (
            <Table
              columns={columns}
              dataSource={customers.map((c, i) => ({ ...c, key: i }))}
              pagination={false}
              rowKey="key"
              size="small"
            />
          )}
        </Space>
      </Modal>

      <Drawer
        title="API Inspector - Customer Search BIP"
        placement="right"
        onClose={() => setApiDrawerOpen(false)}
        open={apiDrawerOpen}
        width={600}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <Paragraph>
              <Text strong>SOAP Endpoint:</Text>
            </Paragraph>
            <Code copyable style={{ wordBreak: 'break-all' }}>
              {lastResponse?.soapUrl || 'N/A'}
            </Code>
          </div>

          <Divider />

          <div>
            <Paragraph>
              <Text strong>SOAP Request Envelope:</Text>
            </Paragraph>
            <pre
              style={{
                background: '#f5f5f5',
                padding: '12px',
                borderRadius: '4px',
                maxHeight: '300px',
                overflow: 'auto',
                fontSize: '11px',
                fontFamily: 'monospace',
              }}
            >
              {lastResponse?.soapEnvelope || 'No request yet'}
            </pre>
            {lastResponse?.soapEnvelope && (
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => {
                  navigator.clipboard.writeText(lastResponse.soapEnvelope || '');
                }}
                style={{ marginTop: '8px' }}
              >
                Copy Envelope
              </Button>
            )}
          </div>

          <Divider />

          <div>
            <Paragraph>
              <Text strong>Response:</Text>
            </Paragraph>
            {lastResponse?.success ? (
              <div>
                <Tag color="green">Success</Tag>
                <Paragraph style={{ marginTop: '8px' }}>
                  Found <Text strong>{lastResponse.customers?.length}</Text> customers in{' '}
                  <Text strong>{lastResponse.duration}ms</Text>
                </Paragraph>
              </div>
            ) : (
              <div>
                <Tag color="red">Error</Tag>
                <Paragraph style={{ marginTop: '8px' }}>
                  <Text>{lastResponse?.error}</Text>
                </Paragraph>
                {lastResponse?.details && (
                  <pre
                    style={{
                      background: '#fff1f0',
                      padding: '8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      maxHeight: '150px',
                      overflow: 'auto',
                    }}
                  >
                    {lastResponse.details}
                  </pre>
                )}
              </div>
            )}
          </div>
        </Space>
      </Drawer>
    </>
  );
};

export default CustomerSearchBipModal;
