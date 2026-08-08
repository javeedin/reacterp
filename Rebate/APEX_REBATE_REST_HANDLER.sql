-- ============================================================================
-- APEX REST Handler for Rebate Management
-- Purpose: RESTful API endpoints for rebate operations
-- Created: 2026-08-08
-- ============================================================================

-- ============================================================================
-- Create APEX REST Module
-- ============================================================================
DECLARE
  v_module_id NUMBER;
BEGIN
  -- Create module if it doesn't exist
  SELECT module_id INTO v_module_id FROM apex_rest_modules
  WHERE name = 'rebate'
  AND workspace = USER;

  -- If we get here, module exists, so nothing to do
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    -- Create the REST module
    APEX_REST_API.CREATE_MODULE(
      p_module_name => 'rebate',
      p_uri_prefix => '/rebate/',
      p_comments => 'Rebate Management API'
    );
END;
/

-- ============================================================================
-- Handler 1: GET /rebate/ - Fetch all rebates
-- ============================================================================
CREATE OR REPLACE FUNCTION apex_rebate_list(
  p_comp_code VARCHAR2 DEFAULT NULL,
  p_vendor VARCHAR2 DEFAULT NULL,
  p_period VARCHAR2 DEFAULT NULL
) RETURN CLOB
AS
  v_json_response CLOB;
BEGIN
  FC_REBATE_PKG.get_all_rebates_json(
    p_comp_code => p_comp_code,
    p_vendor => p_vendor,
    p_period => p_period,
    p_json_response => v_json_response
  );

  RETURN v_json_response;
EXCEPTION
  WHEN OTHERS THEN
    RETURN '{"error":"' || SQLERRM || '"}';
END apex_rebate_list;
/

-- ============================================================================
-- Handler 2: GET /rebate/:id - Fetch single rebate with lines
-- ============================================================================
CREATE OR REPLACE FUNCTION apex_rebate_get(
  p_prhm_sys_id NUMBER
) RETURN CLOB
AS
  v_json_response CLOB;
BEGIN
  FC_REBATE_PKG.get_rebate_json(
    p_prhm_sys_id => p_prhm_sys_id,
    p_json_response => v_json_response
  );

  RETURN v_json_response;
EXCEPTION
  WHEN OTHERS THEN
    RETURN '{"error":"' || SQLERRM || '"}';
END apex_rebate_get;
/

-- ============================================================================
-- Handler 3: POST /rebate/ - Create new rebate with header and lines
-- ============================================================================
-- This should be called from APEX REST endpoint with JSON body containing:
-- {
--   "prhm_comp_code": "...",
--   "prhm_vendor": "...",
--   "prhm_group": "...",
--   "prhm_sm_code": "...",
--   "prhm_period": "...",
--   "prhm_dr_main_acnt_code": "...",
--   "prhm_dr_sub_acnt_code": "...",
--   "prhm_cr_main_acnt_code": "...",
--   "prhm_cr_sub_acnt_code": "...",
--   "prhm_currency": "...",
--   "prhm_annotation": "...",
--   "prhm_cr_uid": "...",
--   "lines": [
--     {
--       "prdm_sm_code": "...",
--       "prdm_dt": "2026-08-08",
--       "prdm_rebt_type": "...",
--       "prdm_pm_amt": 1000,
--       "prdm_ba_amt": 500,
--       "prdm_total_amt": 1500,
--       "prdm_customer": "...",
--       "prdm_bsns_type": "...",
--       "prdm_cr_uid": "..."
--     }
--   ]
-- }

CREATE OR REPLACE FUNCTION apex_rebate_create_json(
  p_json_input CLOB
) RETURN CLOB
AS
  v_prhm_sys_id NUMBER;
  v_status VARCHAR2(100);
  v_message VARCHAR2(2000);
  v_response JSON_OBJECT_T;
BEGIN
  FC_REBATE_PKG.create_rebate_with_lines(
    p_json_input => p_json_input,
    p_prhm_sys_id => v_prhm_sys_id,
    p_status => v_status,
    p_message => v_message
  );

  v_response := JSON_OBJECT_T();
  v_response.PUT('status', v_status);
  v_response.PUT('message', v_message);
  v_response.PUT('prhm_sys_id', v_prhm_sys_id);

  RETURN v_response.TO_CLOB();
EXCEPTION
  WHEN OTHERS THEN
    RETURN '{"status":"ERROR","message":"' || SQLERRM || '"}';
END apex_rebate_create_json;
/

-- ============================================================================
-- Handler 4: PUT /rebate/:id - Update rebate header
-- ============================================================================
-- JSON body format:
-- {
--   "prhm_sm_code": "...",
--   "prhm_annotation": "...",
--   "prhm_appr_status": 1,
--   "prhm_appr_uid": "...",
--   "prhm_submit_status": 1,
--   "prhm_upd_uid": "..."
-- }

CREATE OR REPLACE FUNCTION apex_rebate_update(
  p_prhm_sys_id NUMBER,
  p_json_input CLOB
) RETURN CLOB
AS
  v_json_obj JSON_OBJECT_T;
  v_response JSON_OBJECT_T;
BEGIN
  v_json_obj := JSON_OBJECT_T(p_json_input);

  FC_REBATE_PKG.update_rebate_header(
    p_prhm_sys_id => p_prhm_sys_id,
    p_sm_code => v_json_obj.get_string('prhm_sm_code'),
    p_annotation => v_json_obj.get_string('prhm_annotation'),
    p_appr_status => v_json_obj.get_number('prhm_appr_status'),
    p_appr_uid => v_json_obj.get_string('prhm_appr_uid'),
    p_submit_status => v_json_obj.get_number('prhm_submit_status'),
    p_amd_no => v_json_obj.get_number('prhm_amd_no'),
    p_amd_user_id => v_json_obj.get_string('prhm_amd_user_id'),
    p_upd_uid => v_json_obj.get_string('prhm_upd_uid')
  );

  v_response := JSON_OBJECT_T();
  v_response.PUT('status', 'SUCCESS');
  v_response.PUT('message', 'Rebate header updated successfully');
  v_response.PUT('prhm_sys_id', p_prhm_sys_id);

  RETURN v_response.TO_CLOB();
EXCEPTION
  WHEN OTHERS THEN
    RETURN '{"status":"ERROR","message":"' || SQLERRM || '"}';
END apex_rebate_update;
/

-- ============================================================================
-- Handler 5: POST /rebate/:id/lines - Add line to rebate
-- ============================================================================
-- JSON body format:
-- {
--   "prdm_sm_code": "...",
--   "prdm_dt": "2026-08-08",
--   "prdm_rebt_type": "...",
--   "prdm_pm_amt": 1000,
--   "prdm_ba_amt": 500,
--   "prdm_total_amt": 1500,
--   "prdm_customer": "...",
--   "prdm_bsns_type": "...",
--   "prdm_cr_uid": "..."
-- }

CREATE OR REPLACE FUNCTION apex_rebate_add_line(
  p_prhm_sys_id NUMBER,
  p_json_input CLOB
) RETURN CLOB
AS
  v_json_obj JSON_OBJECT_T;
  v_prdm_sys_id NUMBER;
  v_response JSON_OBJECT_T;
BEGIN
  v_json_obj := JSON_OBJECT_T(p_json_input);

  FC_REBATE_PKG.add_rebate_line(
    p_prhm_sys_id => p_prhm_sys_id,
    p_sm_code => v_json_obj.get_string('prdm_sm_code'),
    p_dt => TO_DATE(v_json_obj.get_string('prdm_dt'), 'YYYY-MM-DD'),
    p_rebt_type => v_json_obj.get_string('prdm_rebt_type'),
    p_choice_list => v_json_obj.get_string('prdm_choice_list'),
    p_pm_amt => v_json_obj.get_number('prdm_pm_amt'),
    p_pm_conf_yn => NVL(v_json_obj.get_string('prdm_pm_conf_yn'), 'N'),
    p_pm_remarks => v_json_obj.get_string('prdm_pm_remarks'),
    p_ba_amt => v_json_obj.get_number('prdm_ba_amt'),
    p_ba_remarks => v_json_obj.get_string('prdm_ba_remarks'),
    p_ba_conf_yn => NVL(v_json_obj.get_string('prdm_ba_conf_yn'), 'N'),
    p_cr_rcvd_yn => NVL(v_json_obj.get_string('prdm_cr_rcvd_yn'), 'N'),
    p_comp_code => v_json_obj.get_string('prdm_comp_code'),
    p_ref => v_json_obj.get_string('prdm_ref'),
    p_rebt_used => v_json_obj.get_number('prdm_rebt_used'),
    p_ba_rcvd_dt => CASE WHEN v_json_obj.get_string('prdm_ba_rcvd_dt') IS NOT NULL
                         THEN TO_DATE(v_json_obj.get_string('prdm_ba_rcvd_dt'), 'YYYY-MM-DD')
                         ELSE NULL END,
    p_profit_yn => NVL(v_json_obj.get_string('prdm_profit_yn'), 'N'),
    p_ven_recv_yn => NVL(v_json_obj.get_string('prdm_ven_recv_yn'), 'N'),
    p_region => v_json_obj.get_string('prdm_region'),
    p_jv_yn => v_json_obj.get_string('prdm_jv_yn'),
    p_ref_doc => v_json_obj.get_string('prdm_ref_doc'),
    p_total_amt => v_json_obj.get_number('prdm_total_amt'),
    p_customer => v_json_obj.get_string('prdm_customer'),
    p_bsns_type => v_json_obj.get_string('prdm_bsns_type'),
    p_cr_uid => v_json_obj.get_string('prdm_cr_uid'),
    p_prdm_sys_id => v_prdm_sys_id
  );

  v_response := JSON_OBJECT_T();
  v_response.PUT('status', 'SUCCESS');
  v_response.PUT('message', 'Rebate line added successfully');
  v_response.PUT('prdm_sys_id', v_prdm_sys_id);
  v_response.PUT('prhm_sys_id', p_prhm_sys_id);

  RETURN v_response.TO_CLOB();
EXCEPTION
  WHEN OTHERS THEN
    RETURN '{"status":"ERROR","message":"' || SQLERRM || '"}';
END apex_rebate_add_line;
/

-- ============================================================================
-- Handler 6: PUT /rebate/line/:id - Update rebate line
-- ============================================================================
-- JSON body format: same as add_line but with optional fields

CREATE OR REPLACE FUNCTION apex_rebate_update_line(
  p_prdm_sys_id NUMBER,
  p_json_input CLOB
) RETURN CLOB
AS
  v_json_obj JSON_OBJECT_T;
  v_response JSON_OBJECT_T;
BEGIN
  v_json_obj := JSON_OBJECT_T(p_json_input);

  FC_REBATE_PKG.update_rebate_line(
    p_prdm_sys_id => p_prdm_sys_id,
    p_sm_code => v_json_obj.get_string('prdm_sm_code'),
    p_dt => CASE WHEN v_json_obj.get_string('prdm_dt') IS NOT NULL
                 THEN TO_DATE(v_json_obj.get_string('prdm_dt'), 'YYYY-MM-DD')
                 ELSE NULL END,
    p_rebt_type => v_json_obj.get_string('prdm_rebt_type'),
    p_choice_list => v_json_obj.get_string('prdm_choice_list'),
    p_pm_amt => v_json_obj.get_number('prdm_pm_amt'),
    p_pm_conf_yn => v_json_obj.get_string('prdm_pm_conf_yn'),
    p_pm_remarks => v_json_obj.get_string('prdm_pm_remarks'),
    p_ba_amt => v_json_obj.get_number('prdm_ba_amt'),
    p_ba_remarks => v_json_obj.get_string('prdm_ba_remarks'),
    p_ba_conf_yn => v_json_obj.get_string('prdm_ba_conf_yn'),
    p_cr_rcvd_yn => v_json_obj.get_string('prdm_cr_rcvd_yn'),
    p_comp_code => v_json_obj.get_string('prdm_comp_code'),
    p_ref => v_json_obj.get_string('prdm_ref'),
    p_rebt_used => v_json_obj.get_number('prdm_rebt_used'),
    p_ba_rcvd_dt => CASE WHEN v_json_obj.get_string('prdm_ba_rcvd_dt') IS NOT NULL
                         THEN TO_DATE(v_json_obj.get_string('prdm_ba_rcvd_dt'), 'YYYY-MM-DD')
                         ELSE NULL END,
    p_profit_yn => v_json_obj.get_string('prdm_profit_yn'),
    p_ven_recv_yn => v_json_obj.get_string('prdm_ven_recv_yn'),
    p_region => v_json_obj.get_string('prdm_region'),
    p_jv_yn => v_json_obj.get_string('prdm_jv_yn'),
    p_ref_doc => v_json_obj.get_string('prdm_ref_doc'),
    p_total_amt => v_json_obj.get_number('prdm_total_amt'),
    p_customer => v_json_obj.get_string('prdm_customer'),
    p_bsns_type => v_json_obj.get_string('prdm_bsns_type'),
    p_upd_uid => v_json_obj.get_string('prdm_upd_uid')
  );

  v_response := JSON_OBJECT_T();
  v_response.PUT('status', 'SUCCESS');
  v_response.PUT('message', 'Rebate line updated successfully');
  v_response.PUT('prdm_sys_id', p_prdm_sys_id);

  RETURN v_response.TO_CLOB();
EXCEPTION
  WHEN OTHERS THEN
    RETURN '{"status":"ERROR","message":"' || SQLERRM || '"}';
END apex_rebate_update_line;
/

-- ============================================================================
-- Handler 7: DELETE /rebate/:id - Delete rebate and all lines
-- ============================================================================

CREATE OR REPLACE FUNCTION apex_rebate_delete(
  p_prhm_sys_id NUMBER
) RETURN CLOB
AS
  v_response JSON_OBJECT_T;
BEGIN
  FC_REBATE_PKG.delete_rebate(p_prhm_sys_id => p_prhm_sys_id);

  v_response := JSON_OBJECT_T();
  v_response.PUT('status', 'SUCCESS');
  v_response.PUT('message', 'Rebate deleted successfully');
  v_response.PUT('prhm_sys_id', p_prhm_sys_id);

  RETURN v_response.TO_CLOB();
EXCEPTION
  WHEN OTHERS THEN
    RETURN '{"status":"ERROR","message":"' || SQLERRM || '"}';
END apex_rebate_delete;
/

-- ============================================================================
-- Handler 8: DELETE /rebate/line/:id - Delete rebate line
-- ============================================================================

CREATE OR REPLACE FUNCTION apex_rebate_delete_line(
  p_prdm_sys_id NUMBER
) RETURN CLOB
AS
  v_response JSON_OBJECT_T;
BEGIN
  FC_REBATE_PKG.delete_rebate_line(p_prdm_sys_id => p_prdm_sys_id);

  v_response := JSON_OBJECT_T();
  v_response.PUT('status', 'SUCCESS');
  v_response.PUT('message', 'Rebate line deleted successfully');
  v_response.PUT('prdm_sys_id', p_prdm_sys_id);

  RETURN v_response.TO_CLOB();
EXCEPTION
  WHEN OTHERS THEN
    RETURN '{"status":"ERROR","message":"' || SQLERRM || '"}';
END apex_rebate_delete_line;
/

-- Show compilation status
SHOW ERRORS;

-- ============================================================================
-- PL/SQL Usage Examples
-- ============================================================================
/*

-- 1. Get all rebates
SELECT apex_rebate_list(p_comp_code => 'COMP001') FROM DUAL;

-- 2. Get single rebate with lines
SELECT apex_rebate_get(p_prhm_sys_id => 1) FROM DUAL;

-- 3. Create new rebate with lines
BEGIN
  DBMS_OUTPUT.PUT_LINE(apex_rebate_create_json(
    p_json_input => q'[{
      "prhm_comp_code": "COMP001",
      "prhm_vendor": "VENDOR001",
      "prhm_group": "GROUP001",
      "prhm_period": "2026-08",
      "prhm_dr_main_acnt_code": "1000",
      "prhm_dr_sub_acnt_code": "1001",
      "prhm_cr_main_acnt_code": "2000",
      "prhm_cr_sub_acnt_code": "2001",
      "prhm_currency": "USD",
      "prhm_cr_uid": "USER001",
      "lines": [
        {
          "prdm_sm_code": "SM001",
          "prdm_dt": "2026-08-08",
          "prdm_rebt_type": "CASH",
          "prdm_pm_amt": 1000,
          "prdm_ba_amt": 500,
          "prdm_total_amt": 1500,
          "prdm_customer": "CUST001",
          "prdm_cr_uid": "USER001"
        }
      ]
    }]'
  ));
END;
/

-- 4. Add line to rebate
SELECT apex_rebate_add_line(
  p_prhm_sys_id => 1,
  p_json_input => q'[{
    "prdm_sm_code": "SM002",
    "prdm_dt": "2026-08-09",
    "prdm_rebt_type": "BONUS",
    "prdm_pm_amt": 2000,
    "prdm_total_amt": 2000,
    "prdm_customer": "CUST002",
    "prdm_cr_uid": "USER001"
  }]'
) FROM DUAL;

-- 5. Update rebate header
SELECT apex_rebate_update(
  p_prhm_sys_id => 1,
  p_json_input => q'[{
    "prhm_annotation": "Updated annotation",
    "prhm_upd_uid": "USER001"
  }]'
) FROM DUAL;

-- 6. Update rebate line
SELECT apex_rebate_update_line(
  p_prdm_sys_id => 1,
  p_json_input => q'[{
    "prdm_pm_amt": 1500,
    "prdm_upd_uid": "USER001"
  }]'
) FROM DUAL;

-- 7. Delete rebate line
SELECT apex_rebate_delete_line(p_prdm_sys_id => 1) FROM DUAL;

-- 8. Delete rebate and all lines
SELECT apex_rebate_delete(p_prhm_sys_id => 1) FROM DUAL;

*/
