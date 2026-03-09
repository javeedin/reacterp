import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Home from './pages/Home';
import GLModule from './pages/gl/GLModule';
import ManageJournals from './pages/gl/ManageJournals';
import EditJournal from './pages/gl/EditJournal';
import CreateJournal from './pages/gl/CreateJournal';
import AccountAnalysis from './pages/gl/AccountAnalysis';
import ChartOfAccounts from './pages/gl/ChartOfAccounts';
import ChartOfAccountsEdit from './pages/gl/ChartOfAccountsEdit';
import ManageStructures from './pages/gl/ManageStructures';
import EditStructure from './pages/gl/EditStructure';
import ManageValues from './pages/gl/ManageValues';
import COASegments from './pages/gl/COASegments';
import AccountCombinations from './pages/gl/AccountCombinations';
import AccountingPeriods from './pages/gl/AccountingPeriods';
import TrialBalance from './pages/gl/TrialBalance';
import IncomeStatementTemplates from './pages/gl/IncomeStatementTemplates';
import { APModule } from './pages/ap';
import ManageInvoices from './pages/ap/ManageInvoices';
import ManagePayments from './pages/ap/ManagePayments';
import Banks from './pages/ap/Banks';
import InvoiceHolds from './pages/ap/InvoiceHolds';
import ManageSLAJournals from './pages/ap/ManageSLAJournals';
import ManageSuppliers from './pages/suppliers/ManageSuppliers';
import SupplierBalance from './pages/suppliers/SupplierBalance';
import SyncData from './pages/sync/SyncData';
import {
  PMSModule, FundManagement, OrderManagement, TransactionsPage,
  ClientManagement, RiskAnalytics, CompliancePage, ReportsPage,
  ModelPortfolioPage, FeeManagementPage, BenchmarkComparison,
} from './pages/pms';
import PMSWatchlist from './pages/pms/Watchlist';
import PMSPortfolio from './pages/pms/Portfolio';
import { RMModule, ManageAgreements, ManageProperties, ManageCustomers, ManageExpenses } from './pages/rm';

// Placeholder component for modules under development
const ComingSoon = ({ moduleName }: { moduleName: string }) => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: 'calc(100vh - 64px)',
    background: '#f5f5f5'
  }}>
    <h2 style={{ color: '#1a1a2e' }}>{moduleName}</h2>
    <p style={{ color: '#666' }}>This module is under development</p>
  </div>
);

function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 6,
        },
      }}
    >
      <AuthProvider>
        <HashRouter>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />

            {/* Protected Routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/home" replace />} />
              <Route path="home" element={<Home />} />
              <Route path="gl" element={<GLModule />} />
              <Route path="gl/manage-journals" element={<ManageJournals />} />
              <Route path="gl/account-analysis" element={<AccountAnalysis />} />
              <Route path="gl/chart-of-accounts" element={<ChartOfAccounts />} />
              <Route path="gl/chart-of-accounts/:id/edit" element={<ChartOfAccountsEdit />} />
              <Route path="gl/manage-structures" element={<ManageStructures />} />
              <Route path="gl/structures/:id/edit" element={<EditStructure />} />
              <Route path="gl/values/:segmentCode" element={<ManageValues />} />
              <Route path="gl/coa-segments" element={<COASegments />} />
              <Route path="gl/journals/:id/edit" element={<EditJournal />} />
              <Route path="gl/batch/:batchId/edit" element={<EditJournal />} />
              <Route path="gl/create-journal" element={<CreateJournal />} />
              <Route path="gl/account-combinations" element={<AccountCombinations />} />
              <Route path="gl/accounting-periods" element={<AccountingPeriods />} />
              <Route path="gl/trial-balance" element={<TrialBalance />} />
              <Route path="gl/income-statement-templates" element={<IncomeStatementTemplates />} />
              <Route path="ap" element={<APModule />} />
              <Route path="ap/manage-invoices" element={<ManageInvoices />} />
              <Route path="ap/manage-payments" element={<ManagePayments />} />
              <Route path="ap/banks" element={<Banks />} />
              <Route path="ap/invoice-holds" element={<InvoiceHolds />} />
              <Route path="ap/sla-journals" element={<ManageSLAJournals />} />
              <Route path="ap/*" element={<APModule />} />
              <Route path="ar/*" element={<ComingSoon moduleName="Accounts Receivable" />} />
              <Route path="inventory/*" element={<ComingSoon moduleName="Inventory" />} />
              <Route path="procurement/suppliers" element={<ManageSuppliers />} />
              <Route path="ap/suppliers" element={<ManageSuppliers />} />
              <Route path="suppliers/manage" element={<ManageSuppliers />} />
              <Route path="suppliers/balance/:supplierNumber" element={<SupplierBalance />} />
              <Route path="procurement/*" element={<ComingSoon moduleName="Procurement" />} />
              <Route path="hr/*" element={<ComingSoon moduleName="Human Resources" />} />
              <Route path="pms" element={<PMSModule />} />
              <Route path="pms/watchlist" element={<PMSWatchlist />} />
              <Route path="pms/portfolio" element={<PMSPortfolio />} />
              <Route path="pms/funds" element={<FundManagement />} />
              <Route path="pms/orders" element={<OrderManagement />} />
              <Route path="pms/transactions" element={<TransactionsPage />} />
              <Route path="pms/investors" element={<ClientManagement />} />
              <Route path="pms/risk" element={<RiskAnalytics />} />
              <Route path="pms/compliance" element={<CompliancePage />} />
              <Route path="pms/reports" element={<ReportsPage />} />
              <Route path="pms/model-portfolio" element={<ModelPortfolioPage />} />
              <Route path="pms/fees" element={<FeeManagementPage />} />
              <Route path="pms/benchmark" element={<BenchmarkComparison />} />
              <Route path="pms/*" element={<PMSModule />} />
              {/* Rental Management */}
              <Route path="rm"                  element={<RMModule />} />
              <Route path="rm/agreements"       element={<ManageAgreements />} />
              <Route path="rm/agreements/new"   element={<ManageAgreements />} />
              <Route path="rm/properties"       element={<ManageProperties />} />
              <Route path="rm/customers"        element={<ManageCustomers />} />
              <Route path="rm/expenses"         element={<ManageExpenses />} />
              <Route path="rm/*"                element={<RMModule />} />
              <Route path="projects/*" element={<ComingSoon moduleName="Projects" />} />
              <Route path="manufacturing/*" element={<ComingSoon moduleName="Manufacturing" />} />
              <Route path="reports/*" element={<ComingSoon moduleName="Reports & Analytics" />} />
              <Route path="admin/*" element={<ComingSoon moduleName="Administration" />} />
              <Route path="sync/*" element={<SyncData />} />
            </Route>

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </HashRouter>
      </AuthProvider>
    </ConfigProvider>
  );
}

export default App;
