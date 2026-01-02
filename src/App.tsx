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
import { APModule } from './pages/ap';
import ManageInvoices from './pages/ap/ManageInvoices';
import ManagePayments from './pages/ap/ManagePayments';
import SyncData from './pages/sync/SyncData';

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
              <Route path="ap" element={<APModule />} />
              <Route path="ap/manage-invoices" element={<ManageInvoices />} />
              <Route path="ap/manage-payments" element={<ManagePayments />} />
              <Route path="ap/*" element={<APModule />} />
              <Route path="ar/*" element={<ComingSoon moduleName="Accounts Receivable" />} />
              <Route path="inventory/*" element={<ComingSoon moduleName="Inventory" />} />
              <Route path="procurement/*" element={<ComingSoon moduleName="Procurement" />} />
              <Route path="hr/*" element={<ComingSoon moduleName="Human Resources" />} />
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
