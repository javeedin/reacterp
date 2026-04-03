import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, Spin } from 'antd';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';

// These two load immediately (login + home are always needed)
import Login from './pages/Login';
import Home from './pages/Home';

// All other pages lazy-loaded — only fetched when the user navigates to them
const GLModule                = lazy(() => import('./pages/gl/GLModule'));
const ManageJournals          = lazy(() => import('./pages/gl/ManageJournals'));
const EditJournal             = lazy(() => import('./pages/gl/EditJournal'));
const CreateJournal           = lazy(() => import('./pages/gl/CreateJournal'));
const AccountAnalysis         = lazy(() => import('./pages/gl/AccountAnalysis'));
const ChartOfAccounts         = lazy(() => import('./pages/gl/ChartOfAccounts'));
const ChartOfAccountsEdit     = lazy(() => import('./pages/gl/ChartOfAccountsEdit'));
const ManageStructures        = lazy(() => import('./pages/gl/ManageStructures'));
const EditStructure           = lazy(() => import('./pages/gl/EditStructure'));
const ManageValues            = lazy(() => import('./pages/gl/ManageValues'));
const COASegments             = lazy(() => import('./pages/gl/COASegments'));
const AccountCombinations     = lazy(() => import('./pages/gl/AccountCombinations'));
const AccountingPeriods       = lazy(() => import('./pages/gl/AccountingPeriods'));
const TrialBalance            = lazy(() => import('./pages/gl/TrialBalance'));
const IncomeStatementTemplates= lazy(() => import('./pages/gl/IncomeStatementTemplates'));
const Currencies              = lazy(() => import('./pages/gl/Currencies'));
const ManageInvoices          = lazy(() => import('./pages/ap/ManageInvoices'));
const APReports               = lazy(() => import('./pages/ap/APReports'));
const ManagePayments          = lazy(() => import('./pages/ap/ManagePayments'));
const Banks                   = lazy(() => import('./pages/ap/Banks'));
const InvoiceHolds            = lazy(() => import('./pages/ap/InvoiceHolds'));
const ManageSLAJournals       = lazy(() => import('./pages/ap/ManageSLAJournals'));
const CreateAccounting        = lazy(() => import('./pages/ap/CreateAccounting'));
const PrepaymentApplications  = lazy(() => import('./pages/ap/PrepaymentApplications'));
const ManageSuppliers         = lazy(() => import('./pages/suppliers/ManageSuppliers'));
const SupplierBalance         = lazy(() => import('./pages/suppliers/SupplierBalance'));
const SyncData                = lazy(() => import('./pages/sync/SyncData'));
const APModule                = lazy(() => import('./pages/ap').then(m => ({ default: m.APModule })));
const PMSModule               = lazy(() => import('./pages/pms').then(m => ({ default: m.PMSModule })));
const FundManagement          = lazy(() => import('./pages/pms').then(m => ({ default: m.FundManagement })));
const OrderManagement         = lazy(() => import('./pages/pms').then(m => ({ default: m.OrderManagement })));
const TransactionsPage        = lazy(() => import('./pages/pms').then(m => ({ default: m.TransactionsPage })));
const ClientManagement        = lazy(() => import('./pages/pms').then(m => ({ default: m.ClientManagement })));
const RiskAnalytics           = lazy(() => import('./pages/pms').then(m => ({ default: m.RiskAnalytics })));
const CompliancePage          = lazy(() => import('./pages/pms').then(m => ({ default: m.CompliancePage })));
const ReportsPage             = lazy(() => import('./pages/pms').then(m => ({ default: m.ReportsPage })));
const ModelPortfolioPage      = lazy(() => import('./pages/pms').then(m => ({ default: m.ModelPortfolioPage })));
const FeeManagementPage       = lazy(() => import('./pages/pms').then(m => ({ default: m.FeeManagementPage })));
const BenchmarkComparison     = lazy(() => import('./pages/pms').then(m => ({ default: m.BenchmarkComparison })));
const PMSWatchlist            = lazy(() => import('./pages/pms/Watchlist'));
const PMSPortfolio            = lazy(() => import('./pages/pms/Portfolio'));
const RMModule                = lazy(() => import('./pages/rm').then(m => ({ default: m.RMModule })));
const ManageAgreements        = lazy(() => import('./pages/rm').then(m => ({ default: m.ManageAgreements })));
const ManageProperties        = lazy(() => import('./pages/rm').then(m => ({ default: m.ManageProperties })));
const ManageCustomers         = lazy(() => import('./pages/rm').then(m => ({ default: m.ManageCustomers })));
const ManageExpenses          = lazy(() => import('./pages/rm').then(m => ({ default: m.ManageExpenses })));
const AdminModule             = lazy(() => import('./pages/admin/index'));
const UserManagement          = lazy(() => import('./pages/admin/UserManagement'));
const CashModule              = lazy(() => import('./pages/cash/CashModule'));
const ManageBankTransfers     = lazy(() => import('./pages/cash/ManageBankTransfers'));
const ManageExternalTransactions = lazy(() => import('./pages/cash/ManageExternalTransactions'));
const ManageBankStatements    = lazy(() => import('./pages/cash/ManageBankStatements'));
const BankReconciliation      = lazy(() => import('./pages/cash/BankReconciliation'));
const SupportModule           = lazy(() => import('./pages/support/SupportModule'));
const ManageTickets           = lazy(() => import('./pages/support/ManageTickets'));
const MyTickets               = lazy(() => import('./pages/support/MyTickets'));
const TrainingModule          = lazy(() => import('./pages/training/TrainingModule'));
const OracleFusion            = lazy(() => import('./pages/oracle/OracleFusion'));

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
          <Suspense fallback={
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
              <Spin size="large" />
            </div>
          }>
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
              <Route path="gl/currencies" element={<Currencies />} />
              <Route path="ap" element={<APModule />} />
              <Route path="ap/manage-invoices" element={<ManageInvoices />} />
              <Route path="ap/manage-payments" element={<ManagePayments />} />
              <Route path="ap/banks" element={<Banks />} />
              <Route path="ap/invoice-holds" element={<InvoiceHolds />} />
              <Route path="ap/sla-journals" element={<ManageSLAJournals />} />
              <Route path="ap/create-accounting" element={<CreateAccounting />} />
              <Route path="ap/prepayment-applications" element={<PrepaymentApplications />} />
              <Route path="ap/reports" element={<APReports />} />
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
              <Route path="admin" element={<AdminModule />} />
              <Route path="admin/users" element={<UserManagement />} />
              {/* Cash Management */}
              <Route path="cash" element={<CashModule />} />
              <Route path="cash/bank-transfers" element={<ManageBankTransfers module="cash" />} />
              {/* AP Bank Transfers (same page, AP context) */}
              <Route path="ap/bank-transfers" element={<ManageBankTransfers module="ap" />} />
              {/* External Cash Transactions */}
              <Route path="cash/external-transactions" element={<ManageExternalTransactions module="cash" />} />
              {/* Bank Statements */}
              <Route path="cash/bank-statements" element={<ManageBankStatements module="cash" />} />
              {/* Bank Reconciliation */}
              <Route path="cash/bank-reconciliation" element={<BankReconciliation />} />
              <Route path="ap/external-transactions"   element={<ManageExternalTransactions module="ap" />} />
              <Route path="sync/*" element={<SyncData />} />
              {/* Support / Ticketing */}
              <Route path="support"            element={<SupportModule />} />
              <Route path="support/tickets"   element={<ManageTickets />} />
              <Route path="support/my-tickets" element={<MyTickets />} />
              {/* Training Library */}
              <Route path="training" element={<TrainingModule />} />
              {/* Oracle Fusion WebView */}
              <Route path="oracle-fusion" element={<OracleFusion />} />
            </Route>

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
          </Suspense>
        </HashRouter>
      </AuthProvider>
    </ConfigProvider>
  );
}

export default App;
