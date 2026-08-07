import React, { useState, useMemo } from 'react';
import { Modal, Input, Button, Spin, Empty, Tag, Drawer, Typography, Divider, Card, Row, Col } from 'antd';
import { SearchOutlined, ApiOutlined, CopyOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { searchCustomersByBIP, CustomerSearchResult, type CustomerSearchResponse } from '../services/customerSearchBip.service';
import { ORACLE_SOAP_CONFIG } from '../config/api.config';

const { Text, Paragraph } = Typography;

interface CustomerSearchBipModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (customer: CustomerSearchResult) => void;
  businessUnitId?: string;
  businessUnitName?: string;
  soapBaseUrl?: string;
  username?: string;
  password?: string;
}

const CustomerSearchBipModal: React.FC<CustomerSearchBipModalProps> = ({
  open,
  onClose,
  onSelect,
  businessUnitId = '',
  businessUnitName = '',
  soapBaseUrl = ORACLE_SOAP_CONFIG.prod.baseUrl,
  username = ORACLE_SOAP_CONFIG.prod.username,
  password = ORACLE_SOAP_CONFIG.prod.password,
}) => {
  const [searchText, setSearchText] = useState('');
  const [customers, setCustomers] = useState<CustomerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiDrawerOpen, setApiDrawerOpen] = useState(false);
  const [lastResponse, setLastResponse] = useState<CustomerSearchResponse | null>(null);

  // Generate preview SOAP envelope as user types
  const previewEnvelope = useMemo(() => {
    if (!searchText.trim() || !businessUnitId) return null;
    // Preview envelope generation disabled - function not available
    return null;
  }, [searchText, businessUnitId, username]);

  const handleSearch = async () => {
    if (!searchText.trim() || !businessUnitId) {
      console.warn('Search blocked - searchText or businessUnitId missing', { searchText, businessUnitId });
      return;
    }

    setLoading(true);
    console.log('Starting customer search...', { businessUnitId, searchText, soapBaseUrl });
    try {
      const response = await searchCustomersByBIP(
        businessUnitId,
        searchText.trim(),
        soapBaseUrl,
        username,
        password
      );

      console.log('Search response:', response);
      setLastResponse(response);

      if (response.success && response.customers) {
        console.log(`Found ${response.customers.length} customers`);
        setCustomers(response.customers);
      } else {
        console.error('Search failed:', response.error);
        setCustomers([]);
      }
    } catch (error) {
      console.error('Customer search error:', error);
      setLastResponse({ success: false, error: String(error) });
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

  return (
    <>
      <Modal
        title={<div style={{ fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: 10 }}>
          <SearchOutlined style={{ color: '#1890ff' }} />
          Find Customer {businessUnitName && <span style={{ fontSize: '14px', fontWeight: '500', color: '#666' }}>({businessUnitName})</span>}
        </div>}
        open={open}
        onCancel={onClose}
        width={900}
        footer={null}
        bodyStyle={{ padding: '24px' }}
      >
        {/* Search Bar */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Input
              placeholder="Search by customer name or account number..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleSearch}
              disabled={!businessUnitId || loading}
              size="large"
              prefix={<SearchOutlined style={{ color: '#1890ff' }} />}
              style={{ borderRadius: '6px' }}
            />
            <Button
              type="primary"
              size="large"
              onClick={handleSearch}
              loading={loading}
              disabled={!businessUnitId || !searchText.trim()}
              style={{ borderRadius: '6px', minWidth: '100px' }}
            >
              {loading ? 'Searching...' : 'Search'}
            </Button>
            <Button
              icon={<ApiOutlined />}
              onClick={() => setApiDrawerOpen(true)}
              title="View API details"
              size="large"
              style={{ borderRadius: '6px' }}
            />
          </div>
        </div>

        {!businessUnitId && (
          <Empty description="Select a business unit first to search customers" />
        )}

        {businessUnitId && loading && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <Spin size="large" tip="Searching customers..." />
          </div>
        )}

        {businessUnitId && !loading && customers.length === 0 && searchText && (
          <Empty description="No customers found" />
        )}

        {businessUnitId && !loading && customers.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {customers.map((customer, idx) => (
              <Card
                key={idx}
                hoverable
                onClick={() => handleSelectCustomer(customer)}
                style={{
                  cursor: 'pointer',
                  borderRadius: '8px',
                  border: '1px solid #e8e8e8',
                  transition: 'all 0.3s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                  e.currentTarget.style.borderColor = '#1890ff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = '#e8e8e8';
                }}
              >
                <Row gutter={16} align="middle">
                  <Col flex="auto">
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: '700', marginBottom: '6px', color: '#262626' }}>
                        {customer.accountName}
                      </div>
                      <div style={{ display: 'flex', gap: '20px', fontSize: '12px', color: '#666', marginBottom: '6px' }}>
                        <span><Text strong>Acct:</Text> {customer.accountNumber}</span>
                        <span><Text strong>Party:</Text> {customer.partyNumber}</span>
                        {customer.city && <span><Text strong>City:</Text> {customer.city}</span>}
                        {customer.country && <span><Text strong>Country:</Text> {customer.country}</span>}
                        {customer.status && (
                          <span>
                            <Tag color={customer.status === 'A' ? 'green' : 'red'}>
                              {customer.status === 'A' ? 'Active' : 'Inactive'}
                            </Tag>
                          </span>
                        )}
                      </div>
                      {customer.buName && (
                        <div style={{ fontSize: '11px', color: '#999', fontStyle: 'italic' }}>
                          BU: {customer.buName}
                        </div>
                      )}
                    </div>
                  </Col>
                  <Col>
                    <Button
                      type="primary"
                      icon={<CheckCircleOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectCustomer(customer);
                      }}
                    >
                      Select
                    </Button>
                  </Col>
                </Row>
              </Card>
            ))}
          </div>
        )}
      </Modal>

      <Drawer
        title="API Inspector - Customer Search BIP"
        placement="right"
        onClose={() => setApiDrawerOpen(false)}
        open={apiDrawerOpen}
        width={600}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <Paragraph>
              <Text strong>SOAP Endpoint:</Text>
            </Paragraph>
            <div style={{ background: '#f5f5f5', padding: '8px', borderRadius: '4px', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '12px' }}>
              {soapBaseUrl || 'Loading...'}
            </div>
          </div>

          <Divider />

          <div>
            <Paragraph>
              <Text strong>Request Payload (will be sent on Search):</Text>
            </Paragraph>
            {previewEnvelope ? (
              <pre
                style={{
                  background: '#f5f5f5',
                  padding: '12px',
                  borderRadius: '4px',
                  maxHeight: '400px',
                  overflow: 'auto',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  lineHeight: '1.4',
                }}
              >
                {previewEnvelope}
              </pre>
            ) : (
              <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: '4px', color: '#999' }}>
                Enter customer name to preview SOAP payload
              </div>
            )}
            {previewEnvelope && (
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => {
                  navigator.clipboard.writeText(previewEnvelope);
                }}
                style={{ marginTop: '8px' }}
              >
                Copy Payload
              </Button>
            )}
          </div>

          {lastResponse && (
            <>
              <Divider />
              <div>
                <Paragraph>
                  <Text strong>Last Response:</Text>
                </Paragraph>
                {lastResponse.success ? (
                  <div>
                    <Tag color="green">Success</Tag>
                    <Paragraph style={{ marginTop: '8px' }}>
                      Found <Text strong>{lastResponse.customers?.length}</Text> customers in{' '}
                      <Text strong>{lastResponse.duration}ms</Text>
                    </Paragraph>
                  </div>
                ) : (
                  <div>
                    <Tag color="red">Error: {lastResponse.error}</Tag>
                    {lastResponse.details && (
                      <pre
                        style={{
                          background: '#fff1f0',
                          padding: '8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          maxHeight: '200px',
                          overflow: 'auto',
                          marginTop: '8px',
                        }}
                      >
                        {lastResponse.details}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </Drawer>
    </>
  );
};

export default CustomerSearchBipModal;
