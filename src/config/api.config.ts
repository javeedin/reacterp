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
    journalBatches: 'gl/journalbatches',
    journalHeaders: 'gl/journals/headers',
    journalLines: 'gl/journals/lines',
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
];

export type ApiType = 'REST' | 'SOAP';
