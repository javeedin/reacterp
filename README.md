# ReactERP

A comprehensive Enterprise Resource Planning (ERP) solution built with React, TypeScript, and Ant Design.

## Features

- **Modern UI**: Built with Ant Design Pro components
- **Type-Safe**: Full TypeScript support
- **Authentication**: Protected routes with session management
- **Modular Architecture**: Separate modules for different business functions

## ERP Modules

| Module | Description | Status |
|--------|-------------|--------|
| General Ledger (GL) | Chart of Accounts, Journal Entries, Reports | In Progress |
| Accounts Payable (AP) | Vendor Management, Invoices, Payments | Planned |
| Accounts Receivable (AR) | Customer Management, Billing, Collections | Planned |
| Inventory | Items, Stock Management, Warehouses | Planned |
| Procurement | Purchase Orders, Requisitions, Suppliers | Planned |
| Human Resources | Employees, Payroll, Leave Management | Planned |
| Projects | Project Planning, Tasks, Time & Expense | Planned |
| Manufacturing | BOM, Work Orders, Production | Planned |
| Reports & Analytics | Dashboards, KPIs, Business Intelligence | Planned |
| Administration | Users, Roles, System Settings | Planned |

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite
- **UI Library**: Ant Design
- **Routing**: React Router v6
- **State**: React Context API

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Demo Credentials

- **Admin**: admin / admin123
- **User**: user / user123

## Project Structure

```
src/
├── components/     # Reusable components
├── context/        # React Context providers
├── layouts/        # Layout components
├── pages/          # Page components
│   └── gl/         # General Ledger module
├── types/          # TypeScript type definitions
└── styles/         # Global styles
```

## License

MIT
