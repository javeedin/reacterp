// Proxy Server Configuration (for bypassing CORS)
export const PROXY_CONFIG = {
  baseUrl: 'http://localhost:3001/api',
  enabled: true,
};

// Oracle Fusion API Configuration
export const ORACLE_FUSION_CONFIG = {
  baseUrl: 'https://iaaobn.fa.ocs.oraclecloud.com/fscmRestApi/resources/11.13.18.05',
  username: 'ratheesh@buimerccorp.com',
  password: 'BCL#261285',
  defaultLimit: 500,
  testLimit: 25, // Limit for testing
  singleRecordLimit: 1, // Limit for single record debugging
};

// APEX Database Configuration
export const APEX_DB_CONFIG = {
  baseUrl: 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp',
  endpoints: {
    // GL Endpoints
    journalBatches: 'gl/journalbatches',
    journalHeaders: 'gl/journals/headers',
    journalLines: 'gl/journals/lines',
    glBalances: 'gl/trialbalance',
    periodsStatus: 'periodsstatus/create',
    // AP Endpoints
    apInvoices: 'ap/invoices',
    apInvoicesBulk: 'ap/invoices/bulk',
    apInvoicesStats: 'ap/invoices/stats',
  },
};

// Oracle BI Publisher SOAP Configuration
export const ORACLE_SOAP_CONFIG = {
  prod: {
    baseUrl: 'https://iaaobn.fa.ocs.oraclecloud.com/xmlpserver/services/v2/ReportService',
    username: 'ratheesh@buimerccorp.com',
    password: 'BCL#261285',
  },
  test: {
    baseUrl: 'https://iaaobn-test.fa.ocs.oraclecloud.com/xmlpserver/services/v2/ReportService',
    username: 'javeedindia@gmail.com',
    password: 'Bumeric2026',
  },
  reports: {
    glBalances: '/Custom/FA_REPORTS/GL_REPORTS/GL_BALANCES_BIP.xdo',
  },
};

// Sync Objects Configuration
export interface SyncObjectConfig {
  id: string;
  name: string;
  description: string;
  oracleEndpoint: string;
  apexEndpoint: string;
  parameters: ParameterConfig[];
  apiType?: 'REST' | 'SOAP';  // Default is REST
  soapConfig?: {
    reportPath: string;
    environment?: 'prod' | 'test';
  };
  hasChildren?: boolean;
  childConfig?: {
    headers?: {
      linkName: string;
      apexEndpoint: string;
    };
    lines?: {
      linkName: string;
      apexEndpoint: string;
    };
  };
}

export interface ParameterConfig {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date';
  required: boolean;
  options?: { label: string; value: string }[];
  defaultValue?: string;
  placeholder?: string;
}

export const SYNC_OBJECTS: SyncObjectConfig[] = [
  {
    id: 'gl-journal-batches',
    name: 'GL Journals (Full Sync)',
    description: 'Sync Journal Batches → Headers → Lines from Oracle Fusion',
    oracleEndpoint: 'journalBatches',
    apexEndpoint: 'gl/journalbatches',
    hasChildren: true,
    childConfig: {
      headers: {
        linkName: 'journalHeaders',
        apexEndpoint: 'gl/journals/headers',
      },
      lines: {
        linkName: 'journalLines',
        apexEndpoint: 'gl/journals/lines',
      },
    },
    parameters: [
      {
        key: 'DefaultPeriodName',
        label: 'Period',
        type: 'text',
        required: true,
        defaultValue: 'May-24',
      },
    ],
  },
  {
    id: 'gl-batches-only',
    name: 'GL Batches',
    description: 'Sync only Journal Batches from Oracle Fusion (no headers/lines)',
    oracleEndpoint: 'journalBatches',
    apexEndpoint: 'gl/journalbatches',
    hasChildren: false,
    parameters: [
      {
        key: 'DefaultPeriodName',
        label: 'Period',
        type: 'text',
        required: false,
        defaultValue: '',
      },
      {
        key: 'LedgerId',
        label: 'Ledger ID',
        type: 'text',
        required: false,
        defaultValue: '',
      },
    ],
  },
  {
    id: 'gl-headers-only',
    name: 'GL Headers',
    description: 'Sync Journal Headers for synced batches (requires GL Batches first)',
    oracleEndpoint: 'journalBatches',
    apexEndpoint: 'gl/journals/headers',
    hasChildren: false,
    parameters: [
      {
        key: 'DefaultPeriodName',
        label: 'Period',
        type: 'text',
        required: false,
        defaultValue: '',
      },
    ],
  },
  {
    id: 'gl-lines-only',
    name: 'GL Lines',
    description: 'Sync Journal Lines for synced headers (requires GL Headers first)',
    oracleEndpoint: 'journalBatches',
    apexEndpoint: 'gl/journals/lines',
    hasChildren: false,
    parameters: [
      {
        key: 'DefaultPeriodName',
        label: 'Period',
        type: 'text',
        required: false,
        defaultValue: '',
      },
    ],
  },
  {
    id: 'gl-code-combinations',
    name: 'GL Code Combinations',
    description: 'Sync GL Account Code Combinations (Chart of Accounts) from Oracle Fusion',
    oracleEndpoint: 'accountCombinationsLOV',
    apexEndpoint: 'glcodecombinations/create',
    parameters: [
      {
        key: 'ChartOfAccountsId',
        label: 'Chart of Accounts ID',
        type: 'text',
        required: false,
        defaultValue: '',
      },
      {
        key: 'EnabledFlag',
        label: 'Enabled Only',
        type: 'select',
        required: false,
        options: [
          { label: 'All', value: '' },
          { label: 'Enabled Only', value: 'Y' },
          { label: 'Disabled Only', value: 'N' },
        ],
      },
    ],
  },
  {
    id: 'ap-invoices',
    name: 'AP Invoices',
    description: 'Sync AP Invoices from Oracle Fusion',
    oracleEndpoint: 'invoices',
    apexEndpoint: 'ap/invoices',
    parameters: [
      {
        key: 'BusinessUnit',
        label: 'Business Unit',
        type: 'text',
        required: false,
      },
      {
        key: 'SupplierNumber',
        label: 'Supplier Number',
        type: 'text',
        required: false,
      },
      {
        key: 'InvoiceDateFrom',
        label: 'Invoice Date From',
        type: 'date',
        required: false,
      },
      {
        key: 'InvoiceDateTo',
        label: 'Invoice Date To',
        type: 'date',
        required: false,
      },
    ],
  },
  {
    id: 'gl-accounts',
    name: 'GL Accounts',
    description: 'Sync Chart of Accounts from Oracle Fusion',
    oracleEndpoint: 'accounts',
    apexEndpoint: 'gl/accounts',
    parameters: [],
  },
  {
    id: 'customers',
    name: 'Customers',
    description: 'Sync Customers from Oracle Fusion',
    oracleEndpoint: 'customers',
    apexEndpoint: 'ar/customers',
    parameters: [],
  },
  {
    id: 'gl-period-status',
    name: 'GL Period Status',
    description: 'Sync GL Accounting Period Status from Oracle Fusion',
    oracleEndpoint: 'accountingPeriodStatusLOV',
    apexEndpoint: 'moduleperiodsstatus/create',
    parameters: [
      {
        key: 'LedgerId',
        label: 'Ledger ID',
        type: 'text',
        required: false,
        defaultValue: '',
      },
      {
        key: 'ApplicationId',
        label: 'Application ID',
        type: 'select',
        required: false,
        options: [
          { label: 'All', value: '' },
          { label: 'GL (101)', value: '101' },
          { label: 'AP (200)', value: '200' },
          { label: 'AR (222)', value: '222' },
          { label: 'INV (401)', value: '401' },
        ],
      },
    ],
  },
  {
    id: 'banks',
    name: 'Banks',
    description: 'Sync Banks from Oracle Fusion',
    oracleEndpoint: 'cashBanks',
    apexEndpoint: 'banks/createnewbank',
    parameters: [],
  },
  {
    id: 'bank-branches',
    name: 'Bank Branches',
    description: 'Sync Bank Branches from Oracle Fusion',
    oracleEndpoint: 'cashBankBranches',
    apexEndpoint: 'banks/brankbranches',
    parameters: [],
  },
  {
    id: 'bank-accounts',
    name: 'Bank Accounts',
    description: 'Sync Bank Accounts from Oracle Fusion',
    oracleEndpoint: 'cashBankAccounts',
    apexEndpoint: 'banks/bankaccounts',
    parameters: [],
  },
  {
    id: 'legal-entities',
    name: 'Legal Entities',
    description: 'Sync Legal Entities from Oracle Fusion',
    oracleEndpoint: 'legalEntitiesLOV',
    apexEndpoint: 'legalentities',
    parameters: [],
  },
  {
    id: 'user-accounts',
    name: 'User Accounts',
    description: 'Sync User Accounts from Oracle Fusion',
    oracleEndpoint: 'userAccounts',
    apexEndpoint: 'useraccounts',
    parameters: [],
  },
  {
    id: 'user-account-roles',
    name: 'User Account Roles',
    description: 'Sync User Account Roles from Oracle HCM (fetches roles for each user)',
    oracleEndpoint: 'userAccounts',
    apexEndpoint: 'useraccounts/userroles',
    hasChildren: true,
    parameters: [],
  },
  {
    id: 'roles',
    name: 'Roles',
    description: 'Sync Roles from Oracle HCM',
    oracleEndpoint: 'rolesLOV',
    apexEndpoint: 'roles',
    parameters: [],
  },
  {
    id: 'suppliers',
    name: 'Suppliers',
    description: 'Sync Suppliers from Oracle Fusion',
    oracleEndpoint: 'suppliers',
    apexEndpoint: 'suppliers',
    parameters: [],
  },
  {
    id: 'supplier-addresses',
    name: 'Supplier Addresses',
    description: 'Sync Supplier Addresses from Oracle Fusion (fetches addresses for each supplier)',
    oracleEndpoint: 'suppliers/{id}/child/addresses',
    apexEndpoint: 'suppliers/address',
    parameters: [],
  },
  {
    id: 'supplier-sites',
    name: 'Supplier Sites',
    description: 'Sync Supplier Sites from Oracle Fusion (fetches sites for each supplier)',
    oracleEndpoint: 'suppliers/{id}/child/sites',
    apexEndpoint: 'suppliers/sites',
    parameters: [],
  },
  {
    id: 'supplier-site-assignments',
    name: 'Supplier Site Assignments',
    description: 'Sync Site Assignments from Fusion (requires Sites to be synced first)',
    oracleEndpoint: 'suppliers/{supplierId}/child/sites/{siteId}/child/assignments',
    apexEndpoint: 'suppliers/sites/assignments',
    parameters: [],
  },
  {
    id: 'ap-payments',
    name: 'AP Payments',
    description: 'Sync AP Payments with Related Invoices from Oracle Fusion',
    oracleEndpoint: 'payablesPayments',
    apexEndpoint: 'ap/payments',
    hasChildren: true,
    childConfig: {
      lines: {
        linkName: 'relatedInvoices',
        apexEndpoint: 'ap/payments/related-invoices',
      },
    },
    parameters: [
      {
        key: 'BusinessUnit',
        label: 'Business Unit',
        type: 'text',
        required: false,
      },
      {
        key: 'SupplierNumber',
        label: 'Supplier Number',
        type: 'text',
        required: false,
        placeholder: 'e.g. A0055',
      },
      {
        key: 'PaymentStatus',
        label: 'Payment Status',
        type: 'select',
        required: false,
        options: [
          { label: 'All', value: '' },
          { label: 'Negotiable', value: 'NEGOTIABLE' },
          { label: 'Voided', value: 'VOIDED' },
          { label: 'Cleared', value: 'CLEARED' },
          { label: 'Reconciled', value: 'RECONCILED' },
        ],
      },
      {
        key: 'PaymentDateFrom',
        label: 'Payment Date From',
        type: 'date',
        required: false,
      },
      {
        key: 'PaymentDateTo',
        label: 'Payment Date To',
        type: 'date',
        required: false,
      },
    ],
  },
  // ===== SOAP Sync Objects =====
  {
    id: 'gl-balances-soap',
    name: 'GL Balances (Trial Balance)',
    description: 'Sync GL Balances from Oracle Fusion BI Publisher (SOAP)',
    oracleEndpoint: 'soap/glBalances',
    apexEndpoint: 'gl/balances',
    apiType: 'SOAP',
    soapConfig: {
      reportPath: '/Custom/FA_REPORTS/GL_REPORTS/GL_BALANCES_BIP.xdo',
      environment: 'prod',
    },
    parameters: [
      {
        key: 'P_PERIOD_NAME',
        label: 'Period Name',
        type: 'text',
        required: true,
        placeholder: 'e.g. Dec-25, Jan-26',
      },
      {
        key: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        defaultValue: 'prod',
        options: [
          { label: 'Production', value: 'prod' },
          { label: 'Test', value: 'test' },
        ],
      },
    ],
  },
];

export type ApiType = 'REST' | 'SOAP';
