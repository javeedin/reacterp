// P&L Template Service
// API calls for P&L Statement Template Management

import { APEX_DB_CONFIG } from '../config/api.config';

// Direct API calls to APEX
const BASE_URL = APEX_DB_CONFIG.baseUrl;

// Types
export interface PLTemplate {
  template_id: number;
  template_code: string;
  template_name: string;
  description: string | null;
  template_type: string;
  is_active: string;
  is_default: string;
  created_date: string;
}

export interface PLGroup {
  group_id: number;
  group_code: string;
  group_name: string;
  group_label: string | null;
  group_type: string;
  display_order: number;
  sign_convention: number;
  show_subtotal: string;
  subtotal_label: string | null;
  sections: PLSection[];
}

export interface PLSection {
  section_id: number;
  section_code: string;
  section_name: string;
  section_label: string | null;
  display_order: number;
  accounts: PLSectionAccount[];
}

export interface PLSectionAccount {
  section_account_id?: number;
  account_code: string;
  account_description?: string | null;
  account_from: string | null;
  account_to: string | null;
}

export interface PLTotal {
  total_id: number;
  total_code: string;
  total_name: string;
  total_label: string | null;
  calculation_formula: string;
  display_order: number;
  after_group_code: string | null;
  font_style: string;
  row_style: string;
}

export interface PLTemplateStructure {
  template: {
    template_id: number;
    template_code: string;
    template_name: string;
    description: string | null;
    template_type: string;
    is_default: string;
    groups: PLGroup[];
    totals: PLTotal[];
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// GL Account interface
export interface GLAccount {
  account: string;
  description: string;
  account_type: string;
}

// P&L Report Types
export interface PLReportAccountDetail {
  account: string;
  description: string;
  tb_balance: number;  // Original TB balance
  amount: number;      // After sign convention applied
}

export interface PLReportRow {
  row_order: number;
  row_type: 'group_header' | 'section' | 'group_total' | 'calculated_total';
  code: string;
  label: string;
  group_type: string;
  indent: number;
  amount: number | null;
  style: string;
  row_style?: string;
  accounts?: PLReportAccountDetail[];  // Account details for sections (drill-down)
}

export interface PLReport {
  template_id: number;
  template_code: string;
  template_name: string;
  period_year: number;
  period_num: number;
  period_name: string;
  ledger_id: number;
  generated_at: string;
  rows: PLReportRow[];
}

export interface PLReportResponse {
  report: PLReport;
  error?: string;
}

// Get GL Accounts list
export const getGLAccounts = async (): Promise<ApiResponse<GLAccount[]>> => {
  try {
    const baseUrl = BASE_URL;
    const response = await fetch(`${baseUrl}/glaccountslist`);
    const result = await response.json();

    if (result.items) {
      return { success: true, data: result.items };
    }
    return { success: true, data: [] };
  } catch (error) {
    console.error('Error fetching GL accounts:', error);
    return { success: false, error: String(error) };
  }
};

// Get all templates
export const getTemplates = async (): Promise<ApiResponse<PLTemplate[]>> => {
  try {
    const baseUrl = BASE_URL;
    const response = await fetch(`${baseUrl}/pl/templates`);
    const result = await response.json();

    if (result.templates) {
      return { success: true, data: result.templates };
    }
    return { success: true, data: [] };
  } catch (error) {
    console.error('Error fetching templates:', error);
    return { success: false, error: String(error) };
  }
};

// Get template structure by ID
export const getTemplateStructure = async (templateId: number): Promise<ApiResponse<PLTemplateStructure>> => {
  try {
    const baseUrl = BASE_URL;
    console.log('Fetching template structure:', `${baseUrl}/pl/templates/${templateId}`);
    const response = await fetch(`${baseUrl}/pl/templates/${templateId}`);
    const result = await response.json();
    console.log('Template structure response:', result);

    // Handle different response structures
    if (result.template) {
      // Response has template wrapper - use as-is
      return { success: true, data: result };
    } else if (result.template_id) {
      // Response is the template directly without wrapper
      return {
        success: true,
        data: {
          template: {
            template_id: result.template_id,
            template_code: result.template_code || '',
            template_name: result.template_name || '',
            description: result.description || null,
            template_type: result.template_type || 'CUSTOM',
            is_default: result.is_default || 'N',
            groups: result.groups || [],
            totals: result.totals || [],
          }
        }
      };
    } else {
      console.error('Unexpected response structure:', result);
      return { success: false, error: 'Invalid response structure from API' };
    }
  } catch (error) {
    console.error('Error fetching template structure:', error);
    return { success: false, error: String(error) };
  }
};

// Create new template
export const createTemplate = async (
  templateCode: string,
  templateName: string,
  description?: string,
  templateType: string = 'CUSTOM'
): Promise<ApiResponse<{ template_id: number }>> => {
  try {
    const baseUrl = BASE_URL;
    const response = await fetch(`${baseUrl}/pl/template/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_code: templateCode,
        template_name: templateName,
        description: description || null,
        template_type: templateType,
      }),
    });
    const result = await response.json();

    if (result.success) {
      return { success: true, data: { template_id: result.template_id } };
    }
    return { success: false, error: result.error };
  } catch (error) {
    console.error('Error creating template:', error);
    return { success: false, error: String(error) };
  }
};

// Add group to template
export const addGroup = async (
  templateId: number,
  groupCode: string,
  groupName: string,
  groupLabel: string,
  groupType: string,
  displayOrder: number,
  signConvention: number = 1
): Promise<ApiResponse<{ group_id: number }>> => {
  try {
    const baseUrl = BASE_URL;
    const url = `${baseUrl}/pl/group/create`;
    const payload = {
      template_id: templateId,
      group_code: groupCode,
      group_name: groupName,
      group_label: groupLabel,
      group_type: groupType,
      display_order: displayOrder,
      sign_convention: signConvention,
    };

    console.log('=== ADD GROUP REQUEST ===');
    console.log('URL:', url);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    console.log('Response Status:', response.status);
    console.log('Response OK:', response.ok);

    const responseText = await response.text();
    console.log('Response Text:', responseText);

    // Try to parse JSON
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      return { success: false, error: `Invalid JSON response: ${responseText}` };
    }

    console.log('Parsed Result:', result);

    if (result.success) {
      return { success: true, data: { group_id: result.group_id } };
    }
    return { success: false, error: result.error || 'Unknown error' };
  } catch (error) {
    console.error('Error adding group:', error);
    return { success: false, error: String(error) };
  }
};

// Add section to group
export const addSection = async (
  groupId: number,
  sectionCode: string,
  sectionName: string,
  sectionLabel: string,
  displayOrder: number
): Promise<ApiResponse<{ section_id: number }>> => {
  try {
    const baseUrl = BASE_URL;
    const response = await fetch(`${baseUrl}/pl/section/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        group_id: groupId,
        section_code: sectionCode,
        section_name: sectionName,
        section_label: sectionLabel,
        display_order: displayOrder,
      }),
    });
    const result = await response.json();

    if (result.success) {
      return { success: true, data: { section_id: result.section_id } };
    }
    return { success: false, error: result.error };
  } catch (error) {
    console.error('Error adding section:', error);
    return { success: false, error: String(error) };
  }
};

// Assign account to section
export const assignAccount = async (
  sectionId: number,
  accountCode: string,
  accountDescription?: string,
  accountFrom?: string,
  accountTo?: string
): Promise<ApiResponse<void>> => {
  try {
    const baseUrl = BASE_URL;
    const url = `${baseUrl}/pl/account/assign`;
    const payload = {
      section_id: sectionId,
      account_code: accountCode,
      account_description: accountDescription || null,
      account_from: accountFrom || null,
      account_to: accountTo || null,
    };

    // ========== DEBUG LOGGING ==========
    const debugInfo = `
========================================
ASSIGN ACCOUNT - POST REQUEST
========================================
URL: ${url}

JSON PAYLOAD:
${JSON.stringify(payload, null, 2)}
========================================`;

    console.log(debugInfo);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const responseDebug = `
Response Status: ${response.status}
Response OK: ${response.ok}`;
    console.log(responseDebug);

    const responseText = await response.text();
    console.log('Response Body:', responseText);

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      const errorMsg = `JSON Parse Error - Raw Response: ${responseText}`;
      console.error(errorMsg);
      return { success: false, error: errorMsg };
    }

    console.log('Parsed Result:', result);

    if (result.success) {
      console.log('=== SUCCESS ===');
      return { success: true };
    }

    const failMsg = `FAILED: ${result.error || 'Unknown error'}`;
    console.error(failMsg);
    return { success: false, error: result.error || 'Unknown error' };
  } catch (error) {
    const exceptionMsg = `EXCEPTION: ${String(error)}`;
    console.error(exceptionMsg);
    return { success: false, error: String(error) };
  }
};

// Delete account from section
export const deleteAccount = async (
  sectionAccountId: number
): Promise<ApiResponse<void>> => {
  try {
    const baseUrl = BASE_URL;
    const url = `${baseUrl}/pl/account/${sectionAccountId}`;

    console.log('========================================');
    console.log('DELETE ACCOUNT REQUEST');
    console.log('========================================');
    console.log('Full URL:', url);
    console.log('Method: DELETE');
    console.log('section_account_id:', sectionAccountId);
    console.log('========================================');

    const response = await fetch(url, {
      method: 'DELETE',
    });

    console.log('Response Status:', response.status);
    console.log('Response OK:', response.ok);

    const responseText = await response.text();
    console.log('Response Body:', responseText);

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      const errorMsg = `JSON Parse Error - Raw Response: ${responseText}`;
      console.error(errorMsg);
      return { success: false, error: errorMsg };
    }

    console.log('Parsed Result:', result);

    if (result.success) {
      console.log('=== DELETE SUCCESS ===');
      return { success: true };
    }
    console.log('=== DELETE FAILED ===', result.error);
    return { success: false, error: result.error || 'Unknown error' };
  } catch (error) {
    console.error('=== DELETE EXCEPTION ===', error);
    return { success: false, error: String(error) };
  }
};

// Add total/calculated row
export const addTotal = async (
  templateId: number,
  totalCode: string,
  totalName: string,
  calculationFormula: string,
  displayOrder: number,
  afterGroupCode?: string
): Promise<ApiResponse<void>> => {
  try {
    const baseUrl = BASE_URL;
    const response = await fetch(`${baseUrl}/pl/total/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: templateId,
        total_code: totalCode,
        total_name: totalName,
        calculation_formula: calculationFormula,
        display_order: displayOrder,
        after_group_code: afterGroupCode || null,
      }),
    });
    const result = await response.json();

    if (result.success) {
      return { success: true };
    }
    return { success: false, error: result.error };
  } catch (error) {
    console.error('Error adding total:', error);
    return { success: false, error: String(error) };
  }
};

// Clone template
export const cloneTemplate = async (
  sourceTemplateId: number,
  newTemplateCode: string,
  newTemplateName: string
): Promise<ApiResponse<{ template_id: number }>> => {
  try {
    const baseUrl = BASE_URL;
    const response = await fetch(`${baseUrl}/pl/template/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_template_id: sourceTemplateId,
        new_template_code: newTemplateCode,
        new_template_name: newTemplateName,
      }),
    });
    const result = await response.json();

    if (result.success) {
      return { success: true, data: { template_id: result.template_id } };
    }
    return { success: false, error: result.error };
  } catch (error) {
    console.error('Error cloning template:', error);
    return { success: false, error: String(error) };
  }
};

// Delete template (soft delete)
export const deleteTemplate = async (templateId: number): Promise<ApiResponse<void>> => {
  try {
    const baseUrl = BASE_URL;
    const response = await fetch(`${baseUrl}/pl/template/${templateId}`, {
      method: 'DELETE',
    });
    const result = await response.json();

    if (result.success) {
      return { success: true };
    }
    return { success: false, error: result.error };
  } catch (error) {
    console.error('Error deleting template:', error);
    return { success: false, error: String(error) };
  }
};

// Delete group (soft delete)
export const deleteGroup = async (groupId: number): Promise<ApiResponse<void>> => {
  try {
    const baseUrl = BASE_URL;
    const response = await fetch(`${baseUrl}/pl/group/${groupId}`, {
      method: 'DELETE',
    });
    const result = await response.json();

    if (result.success) {
      return { success: true };
    }
    return { success: false, error: result.error };
  } catch (error) {
    console.error('Error deleting group:', error);
    return { success: false, error: String(error) };
  }
};

// Delete section (soft delete)
export const deleteSection = async (sectionId: number): Promise<ApiResponse<void>> => {
  try {
    const baseUrl = BASE_URL;
    const response = await fetch(`${baseUrl}/pl/section/${sectionId}`, {
      method: 'DELETE',
    });
    const result = await response.json();

    if (result.success) {
      return { success: true };
    }
    return { success: false, error: result.error };
  } catch (error) {
    console.error('Error deleting section:', error);
    return { success: false, error: String(error) };
  }
};

// Delete account assignment
export const deleteAccountAssignment = async (sectionAccountId: number): Promise<ApiResponse<void>> => {
  try {
    const baseUrl = BASE_URL;
    const response = await fetch(`${baseUrl}/pl/account/${sectionAccountId}`, {
      method: 'DELETE',
    });
    const result = await response.json();

    if (result.success) {
      return { success: true };
    }
    return { success: false, error: result.error };
  } catch (error) {
    console.error('Error deleting account assignment:', error);
    return { success: false, error: String(error) };
  }
};

// Delete total
export const deleteTotal = async (totalId: number): Promise<ApiResponse<void>> => {
  try {
    const baseUrl = BASE_URL;
    const response = await fetch(`${baseUrl}/pl/total/${totalId}`, {
      method: 'DELETE',
    });
    const result = await response.json();

    if (result.success) {
      return { success: true };
    }
    return { success: false, error: result.error };
  } catch (error) {
    console.error('Error deleting total:', error);
    return { success: false, error: String(error) };
  }
};

// Get P&L Report
export const getPLReport = async (
  templateId: number,
  periodYear: number,
  periodNum: number,
  ledgerId: number = 1,
  company: string | null = null
): Promise<ApiResponse<PLReport>> => {
  try {
    const baseUrl = BASE_URL;
    let url = `${baseUrl}/pl/report/${templateId}?period_year=${periodYear}&period_num=${periodNum}&ledger_id=${ledgerId}`;
    if (company) {
      url += `&company=${encodeURIComponent(company)}`;
    }

    console.log('Fetching P&L Report:', url);

    const response = await fetch(url);
    const responseText = await response.text();
    console.log('P&L Report Raw Response:', responseText);

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      return { success: false, error: `Invalid JSON response: ${responseText.substring(0, 200)}` };
    }

    // Handle APEX Query wrapper format: {"items": [{"pl_report": "{...}"}]}
    if (result.items && Array.isArray(result.items) && result.items.length > 0) {
      const item = result.items[0];
      if (item.pl_report) {
        // The pl_report field contains a JSON string that needs to be parsed
        let reportData;
        if (typeof item.pl_report === 'string') {
          try {
            reportData = JSON.parse(item.pl_report);
          } catch (e) {
            console.error('Error parsing pl_report string:', e);
            return { success: false, error: 'Invalid report data format' };
          }
        } else {
          reportData = item.pl_report;
        }

        if (reportData.report) {
          return { success: true, data: reportData.report };
        } else if (reportData.error) {
          return { success: false, error: reportData.error };
        }
      }
    }

    // Handle direct PL/SQL response format: {"report": {...}}
    if (result.error) {
      return { success: false, error: result.error };
    }

    if (result.report) {
      return { success: true, data: result.report };
    }

    console.error('Unexpected response structure:', result);
    return { success: false, error: 'Invalid response format' };
  } catch (error) {
    console.error('Error fetching P&L report:', error);
    return { success: false, error: String(error) };
  }
};

// Group types for dropdown
export const GROUP_TYPES = [
  { value: 'REVENUE', label: 'Revenue' },
  { value: 'EXPENSE', label: 'Expense' },
  { value: 'OTHER_INCOME', label: 'Other Income' },
  { value: 'OTHER_EXPENSE', label: 'Other Expense' },
  { value: 'TAX', label: 'Tax' },
  { value: 'COMPREHENSIVE', label: 'Comprehensive Income' },
  { value: 'CALCULATED', label: 'Calculated' },
];

// Template types for dropdown
export const TEMPLATE_TYPES = [
  { value: 'STANDARD', label: 'Standard' },
  { value: 'MANAGEMENT', label: 'Management' },
  { value: 'REGULATORY', label: 'Regulatory' },
  { value: 'CUSTOM', label: 'Custom' },
];
