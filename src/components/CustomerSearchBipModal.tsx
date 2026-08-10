import React, { useState, useMemo, useEffect } from 'react';
import { Modal, Input, Button, Spin, Empty, Tag, Card, Row, Col, Typography } from 'antd';
import { SearchOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { searchCustomersByBIP, CustomerSearchResult } from '../services/customerSearchBip.service';
import { ORACLE_SOAP_CONFIG } from '../config/api.config';

const { Text } = Typography;

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
  const [filterText, setFilterText] = useState('');
  const [allCustomers, setAllCustomers] = useState<CustomerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setSearchText('');
      setFilterText('');
      setAllCustomers([]);
      setSearched(false);
    }
  }, [open]);

  // Search customers when user clicks search button
  const handleSearch = async () => {
    if (!searchText.trim()) {
      alert('Please enter a customer name, account number, or party number to search');
      return;
    }

    setLoading(true);
    setSearched(true);
    try {
      const response = await searchCustomersByBIP(
        businessUnitId,
        searchText,
        soapBaseUrl,
        username,
        password
      );

      if (response.success && response.customers) {
        setAllCustomers(response.customers);
      } else {
        setAllCustomers([]);
      }
    } catch (error) {
      console.error('Customer search error:', error);
      setAllCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  // Filter customers based on search text
  const filteredCustomers = useMemo(() => {
    if (!filterText.trim()) return allCustomers;

    const searchLower = filterText.toLowerCase();
    return allCustomers.filter(c =>
      c.accountName?.toLowerCase().includes(searchLower) ||
      c.accountNumber?.toLowerCase().includes(searchLower) ||
      c.partyNumber?.toLowerCase().includes(searchLower) ||
      c.buName?.toLowerCase().includes(searchLower)
    );
  }, [allCustomers, filterText]);

  const handleSelectCustomer = (customer: CustomerSearchResult) => {
    onSelect(customer);
    setFilterText('');
    setAllCustomers([]);
    onClose();
  };

  return (
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
      {!businessUnitId && (
        <Empty description="Select a business unit first to search customers" />
      )}

      {businessUnitId && (
        <>
          {/* Search Input with Button */}
          <div style={{ marginBottom: '24px', display: 'flex', gap: '12px' }}>
            <Input
              placeholder="Enter customer name, account number, or party number..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleSearch}
              prefix={<SearchOutlined style={{ color: '#1890ff' }} />}
              size="large"
              allowClear
              style={{ borderRadius: '6px', flex: 1 }}
              disabled={loading}
            />
            <Button
              type="primary"
              size="large"
              icon={<SearchOutlined />}
              onClick={handleSearch}
              loading={loading}
              style={{ borderRadius: '6px' }}
            >
              Search
            </Button>
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <Spin size="large" tip="Searching customers..." />
            </div>
          )}

          {!loading && searched && allCustomers.length === 0 && (
            <Empty description="No customers found" />
          )}

          {!loading && !searched && (
            <Empty description="Enter a search term and click Search to find customers" />
          )}

          {!loading && searched && allCustomers.length > 0 && (
            <>
              {/* Filter Input */}
              <div style={{ marginBottom: '24px' }}>
                <Input
                  placeholder="Filter results by name, account, party number or BU..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  prefix={<SearchOutlined style={{ color: '#1890ff' }} />}
                  size="large"
                  allowClear
                  style={{ borderRadius: '6px' }}
                />
                <div style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>
                  Showing {filteredCustomers.length} of {allCustomers.length} customers
                </div>
              </div>

              {filteredCustomers.length === 0 ? (
                <Empty description="No customers match your filter" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {filteredCustomers.map((customer, idx) => (
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
                            <div style={{ display: 'flex', gap: '20px', fontSize: '12px', color: '#666', marginBottom: '6px', flexWrap: 'wrap' }}>
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
            </>
          )}
        </>
      )}
    </Modal>
  );
};

export default CustomerSearchBipModal;
