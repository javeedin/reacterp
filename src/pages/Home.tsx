import React from 'react';
import { Card, Row, Col, Typography } from 'antd';
import {
  AccountBookOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  ProjectOutlined,
  BarChartOutlined,
  SettingOutlined,
  DollarOutlined,
  InboxOutlined,
  TruckOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { Module } from '../types';

const { Title, Text } = Typography;

const modules: Module[] = [
  {
    id: 'gl',
    name: 'General Ledger',
    description: 'Chart of Accounts, Journal Entries, Financial Reports',
    icon: <AccountBookOutlined style={{ fontSize: 40 }} />,
    path: '/gl',
    color: '#1890ff',
  },
  {
    id: 'ap',
    name: 'Accounts Payable',
    description: 'Vendor Management, Invoices, Payments',
    icon: <DollarOutlined style={{ fontSize: 40 }} />,
    path: '/ap',
    color: '#52c41a',
  },
  {
    id: 'ar',
    name: 'Accounts Receivable',
    description: 'Customer Management, Billing, Collections',
    icon: <ShoppingCartOutlined style={{ fontSize: 40 }} />,
    path: '/ar',
    color: '#fa8c16',
  },
  {
    id: 'inventory',
    name: 'Inventory',
    description: 'Items, Stock Management, Warehouses',
    icon: <InboxOutlined style={{ fontSize: 40 }} />,
    path: '/inventory',
    color: '#722ed1',
  },
  {
    id: 'procurement',
    name: 'Procurement',
    description: 'Purchase Orders, Requisitions, Suppliers',
    icon: <TruckOutlined style={{ fontSize: 40 }} />,
    path: '/procurement',
    color: '#13c2c2',
  },
  {
    id: 'hr',
    name: 'Human Resources',
    description: 'Employees, Payroll, Leave Management',
    icon: <TeamOutlined style={{ fontSize: 40 }} />,
    path: '/hr',
    color: '#eb2f96',
  },
  {
    id: 'projects',
    name: 'Projects',
    description: 'Project Planning, Tasks, Time & Expense',
    icon: <ProjectOutlined style={{ fontSize: 40 }} />,
    path: '/projects',
    color: '#faad14',
  },
  {
    id: 'manufacturing',
    name: 'Manufacturing',
    description: 'BOM, Work Orders, Production',
    icon: <ToolOutlined style={{ fontSize: 40 }} />,
    path: '/manufacturing',
    color: '#f5222d',
  },
  {
    id: 'reports',
    name: 'Reports & Analytics',
    description: 'Dashboards, KPIs, Business Intelligence',
    icon: <BarChartOutlined style={{ fontSize: 40 }} />,
    path: '/reports',
    color: '#2f54eb',
  },
  {
    id: 'admin',
    name: 'Administration',
    description: 'Users, Roles, System Settings',
    icon: <SettingOutlined style={{ fontSize: 40 }} />,
    path: '/admin',
    color: '#595959',
  },
];

const Home: React.FC = () => {
  const navigate = useNavigate();

  const handleModuleClick = (module: Module) => {
    navigate(module.path);
  };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <Title level={2} style={{ marginBottom: 8 }}>
          Welcome to ReactERP
        </Title>
        <Text type="secondary" style={{ fontSize: 16 }}>
          Select a module to get started
        </Text>
      </div>

      <Row gutter={[24, 24]} justify="center">
        {modules.map((module) => (
          <Col xs={24} sm={12} md={8} lg={6} key={module.id}>
            <Card
              hoverable
              onClick={() => handleModuleClick(module)}
              style={{
                borderRadius: 12,
                textAlign: 'center',
                height: '100%',
                transition: 'all 0.3s ease',
                border: `2px solid transparent`,
              }}
              styles={{ body: { padding: '32px 24px' } }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = module.color;
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = `0 8px 24px ${module.color}20`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'transparent';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  background: `${module.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  color: module.color,
                }}
              >
                {module.icon}
              </div>
              <Title level={4} style={{ marginBottom: 8 }}>
                {module.name}
              </Title>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {module.description}
              </Text>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
};

export default Home;
