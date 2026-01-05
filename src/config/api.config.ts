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
    // AP Endpoints
    apInvoices: 'ap/invoices',
    apInvoicesBulk: 'ap/invoices/bulk',
    apInvoicesStats: 'ap/invoices/stats',
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
    id: 'suppliers',
    name: 'Suppliers',
    description: 'Sync Suppliers/Vendors from Oracle Fusion',
    oracleEndpoint: 'suppliers',
    apexEndpoint: 'ap/suppliers',
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
    oracleEndpoint: 'legalEntities',
    apexEndpoint: 'legal/legalentities',
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
        key: 'PayeeNumber',
        label: 'Payee Number',
        type: 'text',
        required: false,
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
];

export type ApiType = 'REST' | 'SOAP';
