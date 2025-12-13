// Oracle Fusion API Configuration
export const ORACLE_FUSION_CONFIG = {
  baseUrl: 'https://iaaobn.fa.ocs.oraclecloud.com/fscmRestApi/resources/11.13.18.05',
  username: 'ratheesh@buimerccorp.com',
  password: 'BCL#261285',
  defaultLimit: 500,
};

// APEX Database Configuration
export const APEX_DB_CONFIG = {
  baseUrl: 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp',
};

// Sync Objects Configuration
export interface SyncObjectConfig {
  id: string;
  name: string;
  description: string;
  oracleEndpoint: string;
  apexEndpoint: string;
  parameters: ParameterConfig[];
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
    name: 'GL Journal Batches',
    description: 'Sync General Ledger Journal Batches from Oracle Fusion',
    oracleEndpoint: '/journalBatches',
    apexEndpoint: '/gl/journalbatches',
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
    oracleEndpoint: '/accounts',
    apexEndpoint: '/gl/accounts',
    parameters: [],
  },
  {
    id: 'suppliers',
    name: 'Suppliers',
    description: 'Sync Suppliers/Vendors from Oracle Fusion',
    oracleEndpoint: '/suppliers',
    apexEndpoint: '/ap/suppliers',
    parameters: [],
  },
  {
    id: 'customers',
    name: 'Customers',
    description: 'Sync Customers from Oracle Fusion',
    oracleEndpoint: '/customers',
    apexEndpoint: '/ar/customers',
    parameters: [],
  },
];

export type ApiType = 'REST' | 'SOAP';
