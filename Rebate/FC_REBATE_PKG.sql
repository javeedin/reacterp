-- ============================================================================
-- Package: FC_REBATE_PKG
-- Purpose: Rebate Management - CRUD operations for header and detail records
-- Created: 2026-08-08
-- ============================================================================

CREATE OR REPLACE PACKAGE FC_REBATE_PKG IS

  -- Type definitions for return values
  TYPE rebate_header_type IS RECORD (
    prhm_sys_id NUMBER,
    prhm_comp_code VARCHAR2(12),
    prhm_vendor VARCHAR2(30),
    prhm_group VARCHAR2(30),
    prhm_sm_code VARCHAR2(30),
    prhm_period VARCHAR2(30),
    prhm_dr_main_acnt_code VARCHAR2(12),
    prhm_dr_sub_acnt_code VARCHAR2(12),
    prhm_cr_main_acnt_code VARCHAR2(12),
    prhm_cr_sub_acnt_code VARCHAR2(12),
    prhm_currency VARCHAR2(12),
    prhm_annotation VARCHAR2(2400),
    prhm_appr_status NUMBER,
    prhm_appr_uid VARCHAR2(12),
    prhm_appr_dt DATE,
    prhm_submit_status NUMBER,
    prhm_amd_no NUMBER,
    prhm_amd_dt DATE,
    prhm_amd_user_id VARCHAR2(12),
    prhm_cr_dt DATE,
    prhm_cr_uid VARCHAR2(12),
    prhm_upd_dt DATE,
    prhm_upd_uid VARCHAR2(12)
  );

  -- Procedures

  -- Fetch single rebate with lines as JSON
  PROCEDURE get_rebate_json(
    p_prhm_sys_id IN NUMBER,
    p_json_response OUT CLOB
  );

  -- Fetch all rebates with optional filtering
  PROCEDURE get_all_rebates_json(
    p_comp_code IN VARCHAR2 DEFAULT NULL,
    p_vendor IN VARCHAR2 DEFAULT NULL,
    p_period IN VARCHAR2 DEFAULT NULL,
    p_json_response OUT CLOB
  );

  -- Fetch rebate header only
  PROCEDURE get_rebate_header(
    p_prhm_sys_id IN NUMBER,
    p_header OUT rebate_header_type
  );

  -- Fetch rebate lines for a header
  PROCEDURE get_rebate_lines(
    p_prhm_sys_id IN NUMBER,
    p_lines_json OUT CLOB
  );

  -- Create new rebate header
  PROCEDURE create_rebate_header(
    p_comp_code IN VARCHAR2,
    p_vendor IN VARCHAR2,
    p_group IN VARCHAR2,
    p_sm_code IN VARCHAR2 DEFAULT NULL,
    p_period IN VARCHAR2,
    p_dr_main_acnt_code IN VARCHAR2,
    p_dr_sub_acnt_code IN VARCHAR2,
    p_cr_main_acnt_code IN VARCHAR2,
    p_cr_sub_acnt_code IN VARCHAR2,
    p_currency IN VARCHAR2,
    p_annotation IN VARCHAR2 DEFAULT NULL,
    p_cr_uid IN VARCHAR2,
    p_prhm_sys_id OUT NUMBER
  );

  -- Add new line to rebate
  PROCEDURE add_rebate_line(
    p_prhm_sys_id IN NUMBER,
    p_sm_code IN VARCHAR2,
    p_dt IN DATE,
    p_rebt_type IN VARCHAR2,
    p_choice_list IN VARCHAR2 DEFAULT NULL,
    p_pm_amt IN NUMBER DEFAULT NULL,
    p_pm_conf_yn IN VARCHAR2 DEFAULT 'N',
    p_pm_remarks IN VARCHAR2 DEFAULT NULL,
    p_ba_amt IN NUMBER DEFAULT NULL,
    p_ba_remarks IN VARCHAR2 DEFAULT NULL,
    p_ba_conf_yn IN VARCHAR2 DEFAULT 'N',
    p_cr_rcvd_yn IN VARCHAR2 DEFAULT 'N',
    p_comp_code IN VARCHAR2 DEFAULT NULL,
    p_ref IN VARCHAR2 DEFAULT NULL,
    p_rebt_used IN NUMBER DEFAULT NULL,
    p_ba_rcvd_dt IN DATE DEFAULT NULL,
    p_profit_yn IN VARCHAR2 DEFAULT 'N',
    p_ven_recv_yn IN VARCHAR2 DEFAULT 'N',
    p_region IN VARCHAR2 DEFAULT NULL,
    p_jv_yn IN VARCHAR2 DEFAULT NULL,
    p_ref_doc IN VARCHAR2 DEFAULT NULL,
    p_total_amt IN NUMBER DEFAULT NULL,
    p_customer IN VARCHAR2 DEFAULT NULL,
    p_bsns_type IN VARCHAR2 DEFAULT NULL,
    p_cr_uid IN VARCHAR2,
    p_prdm_sys_id OUT NUMBER
  );

  -- Update rebate line
  PROCEDURE update_rebate_line(
    p_prdm_sys_id IN NUMBER,
    p_sm_code IN VARCHAR2 DEFAULT NULL,
    p_dt IN DATE DEFAULT NULL,
    p_rebt_type IN VARCHAR2 DEFAULT NULL,
    p_choice_list IN VARCHAR2 DEFAULT NULL,
    p_pm_amt IN NUMBER DEFAULT NULL,
    p_pm_conf_yn IN VARCHAR2 DEFAULT NULL,
    p_pm_remarks IN VARCHAR2 DEFAULT NULL,
    p_ba_amt IN NUMBER DEFAULT NULL,
    p_ba_remarks IN VARCHAR2 DEFAULT NULL,
    p_ba_conf_yn IN VARCHAR2 DEFAULT NULL,
    p_cr_rcvd_yn IN VARCHAR2 DEFAULT NULL,
    p_comp_code IN VARCHAR2 DEFAULT NULL,
    p_ref IN VARCHAR2 DEFAULT NULL,
    p_rebt_used IN NUMBER DEFAULT NULL,
    p_ba_rcvd_dt IN DATE DEFAULT NULL,
    p_profit_yn IN VARCHAR2 DEFAULT NULL,
    p_ven_recv_yn IN VARCHAR2 DEFAULT NULL,
    p_region IN VARCHAR2 DEFAULT NULL,
    p_jv_yn IN VARCHAR2 DEFAULT NULL,
    p_ref_doc IN VARCHAR2 DEFAULT NULL,
    p_total_amt IN NUMBER DEFAULT NULL,
    p_customer IN VARCHAR2 DEFAULT NULL,
    p_bsns_type IN VARCHAR2 DEFAULT NULL,
    p_upd_uid IN VARCHAR2
  );

  -- Delete rebate line
  PROCEDURE delete_rebate_line(
    p_prdm_sys_id IN NUMBER
  );

  -- Update rebate header
  PROCEDURE update_rebate_header(
    p_prhm_sys_id IN NUMBER,
    p_sm_code IN VARCHAR2 DEFAULT NULL,
    p_annotation IN VARCHAR2 DEFAULT NULL,
    p_appr_status IN NUMBER DEFAULT NULL,
    p_appr_uid IN VARCHAR2 DEFAULT NULL,
    p_submit_status IN NUMBER DEFAULT NULL,
    p_amd_no IN NUMBER DEFAULT NULL,
    p_amd_user_id IN VARCHAR2 DEFAULT NULL,
    p_upd_uid IN VARCHAR2
  );

  -- Delete rebate header and all associated lines
  PROCEDURE delete_rebate(
    p_prhm_sys_id IN NUMBER
  );

  -- Create rebate with header and lines in single transaction
  PROCEDURE create_rebate_with_lines(
    p_json_input IN CLOB,
    p_prhm_sys_id OUT NUMBER,
    p_status OUT VARCHAR2,
    p_message OUT VARCHAR2
  );

END FC_REBATE_PKG;
/

CREATE OR REPLACE PACKAGE BODY FC_REBATE_PKG IS

  -- Helper: Get next sequence value for header
  FUNCTION get_next_header_id RETURN NUMBER IS
    v_id NUMBER;
  BEGIN
    SELECT NVL(MAX(prhm_sys_id), 0) + 1 INTO v_id FROM OT_PM_REBATE_HEAD_MIT;
    RETURN v_id;
  END;

  -- Helper: Get next sequence value for detail
  FUNCTION get_next_detail_id RETURN NUMBER IS
    v_id NUMBER;
  BEGIN
    SELECT NVL(MAX(prdm_sys_id), 0) + 1 INTO v_id FROM OT_PM_REBATE_DETAIL_MIT;
    RETURN v_id;
  END;

  -- ========================================================================
  -- PROCEDURE: get_rebate_json
  -- Purpose: Fetch single rebate with header and lines as JSON
  -- ========================================================================
  PROCEDURE get_rebate_json(
    p_prhm_sys_id IN NUMBER,
    p_json_response OUT CLOB
  ) IS
    v_header_json JSON_OBJECT_T;
    v_lines_json JSON_ARRAY_T;
    v_line_json JSON_OBJECT_T;
  BEGIN
    -- Fetch header
    BEGIN
      SELECT JSON_OBJECT(
        'prhm_sys_id' VALUE prhm_sys_id,
        'prhm_comp_code' VALUE prhm_comp_code,
        'prhm_vendor' VALUE prhm_vendor,
        'prhm_group' VALUE prhm_group,
        'prhm_sm_code' VALUE prhm_sm_code,
        'prhm_period' VALUE prhm_period,
        'prhm_dr_main_acnt_code' VALUE prhm_dr_main_acnt_code,
        'prhm_dr_sub_acnt_code' VALUE prhm_dr_sub_acnt_code,
        'prhm_cr_main_acnt_code' VALUE prhm_cr_main_acnt_code,
        'prhm_cr_sub_acnt_code' VALUE prhm_cr_sub_acnt_code,
        'prhm_currency' VALUE prhm_currency,
        'prhm_annotation' VALUE prhm_annotation,
        'prhm_appr_status' VALUE prhm_appr_status,
        'prhm_appr_uid' VALUE prhm_appr_uid,
        'prhm_appr_dt' VALUE TO_CHAR(prhm_appr_dt, 'YYYY-MM-DD HH24:MI:SS'),
        'prhm_submit_status' VALUE prhm_submit_status,
        'prhm_amd_no' VALUE prhm_amd_no,
        'prhm_amd_dt' VALUE TO_CHAR(prhm_amd_dt, 'YYYY-MM-DD'),
        'prhm_amd_user_id' VALUE prhm_amd_user_id,
        'prhm_cr_dt' VALUE TO_CHAR(prhm_cr_dt, 'YYYY-MM-DD HH24:MI:SS'),
        'prhm_cr_uid' VALUE prhm_cr_uid,
        'prhm_upd_dt' VALUE TO_CHAR(prhm_upd_dt, 'YYYY-MM-DD HH24:MI:SS'),
        'prhm_upd_uid' VALUE prhm_upd_uid
      )
      INTO p_json_response
      FROM OT_PM_REBATE_HEAD_MIT
      WHERE prhm_sys_id = p_prhm_sys_id;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        p_json_response := '{"error":"Rebate not found"}';
        RETURN;
    END;

    -- Fetch lines
    BEGIN
      SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
          'prdm_sys_id' VALUE prdm_sys_id,
          'prdm_prhm_sys_id' VALUE prdm_prhm_sys_id,
          'prdm_sm_code' VALUE prdm_sm_code,
          'prdm_dt' VALUE TO_CHAR(prdm_dt, 'YYYY-MM-DD'),
          'prdm_rebt_type' VALUE prdm_rebt_type,
          'prdm_choice_list' VALUE prdm_choice_list,
          'prdm_pm_amt' VALUE prdm_pm_amt,
          'prdm_pm_conf_yn' VALUE prdm_pm_conf_yn,
          'prdm_pm_remarks' VALUE prdm_pm_remarks,
          'prdm_ba_amt' VALUE prdm_ba_amt,
          'prdm_ba_remarks' VALUE prdm_ba_remarks,
          'prdm_ba_conf_yn' VALUE prdm_ba_conf_yn,
          'prdm_cr_rcvd_yn' VALUE prdm_cr_rcvd_yn,
          'prdm_comp_code' VALUE prdm_comp_code,
          'prdm_ref' VALUE prdm_ref,
          'prdm_rebt_used' VALUE prdm_rebt_used,
          'prdm_ba_rcvd_dt' VALUE TO_CHAR(prdm_ba_rcvd_dt, 'YYYY-MM-DD'),
          'prdm_profit_yn' VALUE prdm_profit_yn,
          'prdm_ven_recv_yn' VALUE prdm_ven_recv_yn,
          'prdm_region' VALUE prdm_region,
          'prdm_jv_yn' VALUE prdm_jv_yn,
          'prdm_ref_doc' VALUE prdm_ref_doc,
          'prdm_total_amt' VALUE prdm_total_amt,
          'prdm_customer' VALUE prdm_customer,
          'prdm_bsns_type' VALUE prdm_bsns_type,
          'prdm_cr_dt' VALUE TO_CHAR(prdm_cr_dt, 'YYYY-MM-DD HH24:MI:SS'),
          'prdm_cr_uid' VALUE prdm_cr_uid,
          'prdm_upd_dt' VALUE TO_CHAR(prdm_upd_dt, 'YYYY-MM-DD HH24:MI:SS'),
          'prdm_upd_uid' VALUE prdm_upd_uid
        )
        ORDER BY prdm_sys_id
      )
      INTO v_lines_json
      FROM OT_PM_REBATE_DETAIL_MIT
      WHERE prdm_prhm_sys_id = p_prhm_sys_id;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        v_lines_json := JSON_ARRAY_T();
    END;

    -- Combine header and lines
    v_header_json := JSON_OBJECT_T(p_json_response);
    v_header_json.PUT('lines', NVL(v_lines_json, JSON_ARRAY_T()));
    p_json_response := v_header_json.TO_CLOB();

  EXCEPTION
    WHEN OTHERS THEN
      p_json_response := '{"error":"' || SQLERRM || '"}';
  END get_rebate_json;

  -- ========================================================================
  -- PROCEDURE: get_all_rebates_json
  -- Purpose: Fetch all rebates with optional filtering
  -- ========================================================================
  PROCEDURE get_all_rebates_json(
    p_comp_code IN VARCHAR2 DEFAULT NULL,
    p_vendor IN VARCHAR2 DEFAULT NULL,
    p_period IN VARCHAR2 DEFAULT NULL,
    p_json_response OUT CLOB
  ) IS
  BEGIN
    SELECT JSON_ARRAYAGG(
      JSON_OBJECT(
        'prhm_sys_id' VALUE prhm_sys_id,
        'prhm_comp_code' VALUE prhm_comp_code,
        'prhm_vendor' VALUE prhm_vendor,
        'prhm_group' VALUE prhm_group,
        'prhm_period' VALUE prhm_period,
        'prhm_currency' VALUE prhm_currency,
        'prhm_appr_status' VALUE prhm_appr_status,
        'prhm_submit_status' VALUE prhm_submit_status,
        'prhm_cr_dt' VALUE TO_CHAR(prhm_cr_dt, 'YYYY-MM-DD HH24:MI:SS'),
        'prhm_cr_uid' VALUE prhm_cr_uid
      )
      ORDER BY prhm_sys_id DESC
    )
    INTO p_json_response
    FROM OT_PM_REBATE_HEAD_MIT
    WHERE (p_comp_code IS NULL OR prhm_comp_code = p_comp_code)
      AND (p_vendor IS NULL OR prhm_vendor = p_vendor)
      AND (p_period IS NULL OR prhm_period = p_period);

    IF p_json_response IS NULL THEN
      p_json_response := '[]';
    END IF;

  EXCEPTION
    WHEN OTHERS THEN
      p_json_response := '{"error":"' || SQLERRM || '"}';
  END get_all_rebates_json;

  -- ========================================================================
  -- PROCEDURE: get_rebate_header
  -- Purpose: Fetch single rebate header record
  -- ========================================================================
  PROCEDURE get_rebate_header(
    p_prhm_sys_id IN NUMBER,
    p_header OUT rebate_header_type
  ) IS
  BEGIN
    SELECT prhm_sys_id, prhm_comp_code, prhm_vendor, prhm_group, prhm_sm_code,
           prhm_period, prhm_dr_main_acnt_code, prhm_dr_sub_acnt_code,
           prhm_cr_main_acnt_code, prhm_cr_sub_acnt_code, prhm_currency,
           prhm_annotation, prhm_appr_status, prhm_appr_uid, prhm_appr_dt,
           prhm_submit_status, prhm_amd_no, prhm_amd_dt, prhm_amd_user_id,
           prhm_cr_dt, prhm_cr_uid, prhm_upd_dt, prhm_upd_uid
    INTO p_header
    FROM OT_PM_REBATE_HEAD_MIT
    WHERE prhm_sys_id = p_prhm_sys_id;
  END get_rebate_header;

  -- ========================================================================
  -- PROCEDURE: get_rebate_lines
  -- Purpose: Fetch rebate lines for a header as JSON array
  -- ========================================================================
  PROCEDURE get_rebate_lines(
    p_prhm_sys_id IN NUMBER,
    p_lines_json OUT CLOB
  ) IS
  BEGIN
    SELECT JSON_ARRAYAGG(
      JSON_OBJECT(
        'prdm_sys_id' VALUE prdm_sys_id,
        'prdm_prhm_sys_id' VALUE prdm_prhm_sys_id,
        'prdm_sm_code' VALUE prdm_sm_code,
        'prdm_dt' VALUE TO_CHAR(prdm_dt, 'YYYY-MM-DD'),
        'prdm_rebt_type' VALUE prdm_rebt_type,
        'prdm_choice_list' VALUE prdm_choice_list,
        'prdm_pm_amt' VALUE prdm_pm_amt,
        'prdm_pm_conf_yn' VALUE prdm_pm_conf_yn,
        'prdm_pm_remarks' VALUE prdm_pm_remarks,
        'prdm_ba_amt' VALUE prdm_ba_amt,
        'prdm_ba_remarks' VALUE prdm_ba_remarks,
        'prdm_ba_conf_yn' VALUE prdm_ba_conf_yn,
        'prdm_cr_rcvd_yn' VALUE prdm_cr_rcvd_yn,
        'prdm_comp_code' VALUE prdm_comp_code,
        'prdm_ref' VALUE prdm_ref,
        'prdm_total_amt' VALUE prdm_total_amt,
        'prdm_customer' VALUE prdm_customer,
        'prdm_bsns_type' VALUE prdm_bsns_type
      )
      ORDER BY prdm_sys_id
    )
    INTO p_lines_json
    FROM OT_PM_REBATE_DETAIL_MIT
    WHERE prdm_prhm_sys_id = p_prhm_sys_id;

    IF p_lines_json IS NULL THEN
      p_lines_json := '[]';
    END IF;

  EXCEPTION
    WHEN OTHERS THEN
      p_lines_json := '{"error":"' || SQLERRM || '"}';
  END get_rebate_lines;

  -- ========================================================================
  -- PROCEDURE: create_rebate_header
  -- Purpose: Create new rebate header
  -- ========================================================================
  PROCEDURE create_rebate_header(
    p_comp_code IN VARCHAR2,
    p_vendor IN VARCHAR2,
    p_group IN VARCHAR2,
    p_sm_code IN VARCHAR2 DEFAULT NULL,
    p_period IN VARCHAR2,
    p_dr_main_acnt_code IN VARCHAR2,
    p_dr_sub_acnt_code IN VARCHAR2,
    p_cr_main_acnt_code IN VARCHAR2,
    p_cr_sub_acnt_code IN VARCHAR2,
    p_currency IN VARCHAR2,
    p_annotation IN VARCHAR2 DEFAULT NULL,
    p_cr_uid IN VARCHAR2,
    p_prhm_sys_id OUT NUMBER
  ) IS
  BEGIN
    p_prhm_sys_id := get_next_header_id();

    INSERT INTO OT_PM_REBATE_HEAD_MIT (
      prhm_sys_id, prhm_comp_code, prhm_vendor, prhm_group, prhm_sm_code,
      prhm_period, prhm_dr_main_acnt_code, prhm_dr_sub_acnt_code,
      prhm_cr_main_acnt_code, prhm_cr_sub_acnt_code, prhm_currency,
      prhm_annotation, prhm_appr_status, prhm_submit_status, prhm_amd_no,
      prhm_cr_dt, prhm_cr_uid
    ) VALUES (
      p_prhm_sys_id, p_comp_code, p_vendor, p_group, p_sm_code,
      p_period, p_dr_main_acnt_code, p_dr_sub_acnt_code,
      p_cr_main_acnt_code, p_cr_sub_acnt_code, p_currency,
      p_annotation, 0, 0, 0,
      SYSDATE, p_cr_uid
    );

    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      RAISE;
  END create_rebate_header;

  -- ========================================================================
  -- PROCEDURE: add_rebate_line
  -- Purpose: Add new line to rebate
  -- ========================================================================
  PROCEDURE add_rebate_line(
    p_prhm_sys_id IN NUMBER,
    p_sm_code IN VARCHAR2,
    p_dt IN DATE,
    p_rebt_type IN VARCHAR2,
    p_choice_list IN VARCHAR2 DEFAULT NULL,
    p_pm_amt IN NUMBER DEFAULT NULL,
    p_pm_conf_yn IN VARCHAR2 DEFAULT 'N',
    p_pm_remarks IN VARCHAR2 DEFAULT NULL,
    p_ba_amt IN NUMBER DEFAULT NULL,
    p_ba_remarks IN VARCHAR2 DEFAULT NULL,
    p_ba_conf_yn IN VARCHAR2 DEFAULT 'N',
    p_cr_rcvd_yn IN VARCHAR2 DEFAULT 'N',
    p_comp_code IN VARCHAR2 DEFAULT NULL,
    p_ref IN VARCHAR2 DEFAULT NULL,
    p_rebt_used IN NUMBER DEFAULT NULL,
    p_ba_rcvd_dt IN DATE DEFAULT NULL,
    p_profit_yn IN VARCHAR2 DEFAULT 'N',
    p_ven_recv_yn IN VARCHAR2 DEFAULT 'N',
    p_region IN VARCHAR2 DEFAULT NULL,
    p_jv_yn IN VARCHAR2 DEFAULT NULL,
    p_ref_doc IN VARCHAR2 DEFAULT NULL,
    p_total_amt IN NUMBER DEFAULT NULL,
    p_customer IN VARCHAR2 DEFAULT NULL,
    p_bsns_type IN VARCHAR2 DEFAULT NULL,
    p_cr_uid IN VARCHAR2,
    p_prdm_sys_id OUT NUMBER
  ) IS
  BEGIN
    p_prdm_sys_id := get_next_detail_id();

    INSERT INTO OT_PM_REBATE_DETAIL_MIT (
      prdm_sys_id, prdm_prhm_sys_id, prdm_sm_code, prdm_dt, prdm_rebt_type,
      prdm_choice_list, prdm_pm_amt, prdm_pm_conf_yn, prdm_pm_remarks,
      prdm_ba_amt, prdm_ba_remarks, prdm_ba_conf_yn, prdm_cr_rcvd_yn,
      prdm_comp_code, prdm_ref, prdm_rebt_used, prdm_ba_rcvd_dt,
      prdm_profit_yn, prdm_ven_recv_yn, prdm_region, prdm_jv_yn,
      prdm_ref_doc, prdm_total_amt, prdm_customer, prdm_bsns_type,
      prdm_cr_uid, prdm_cr_dt
    ) VALUES (
      p_prdm_sys_id, p_prhm_sys_id, p_sm_code, p_dt, p_rebt_type,
      p_choice_list, p_pm_amt, p_pm_conf_yn, p_pm_remarks,
      p_ba_amt, p_ba_remarks, p_ba_conf_yn, p_cr_rcvd_yn,
      p_comp_code, p_ref, p_rebt_used, p_ba_rcvd_dt,
      p_profit_yn, p_ven_recv_yn, p_region, p_jv_yn,
      p_ref_doc, p_total_amt, p_customer, p_bsns_type,
      p_cr_uid, SYSDATE
    );

    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      RAISE;
  END add_rebate_line;

  -- ========================================================================
  -- PROCEDURE: update_rebate_line
  -- Purpose: Update existing rebate line
  -- ========================================================================
  PROCEDURE update_rebate_line(
    p_prdm_sys_id IN NUMBER,
    p_sm_code IN VARCHAR2 DEFAULT NULL,
    p_dt IN DATE DEFAULT NULL,
    p_rebt_type IN VARCHAR2 DEFAULT NULL,
    p_choice_list IN VARCHAR2 DEFAULT NULL,
    p_pm_amt IN NUMBER DEFAULT NULL,
    p_pm_conf_yn IN VARCHAR2 DEFAULT NULL,
    p_pm_remarks IN VARCHAR2 DEFAULT NULL,
    p_ba_amt IN NUMBER DEFAULT NULL,
    p_ba_remarks IN VARCHAR2 DEFAULT NULL,
    p_ba_conf_yn IN VARCHAR2 DEFAULT NULL,
    p_cr_rcvd_yn IN VARCHAR2 DEFAULT NULL,
    p_comp_code IN VARCHAR2 DEFAULT NULL,
    p_ref IN VARCHAR2 DEFAULT NULL,
    p_rebt_used IN NUMBER DEFAULT NULL,
    p_ba_rcvd_dt IN DATE DEFAULT NULL,
    p_profit_yn IN VARCHAR2 DEFAULT NULL,
    p_ven_recv_yn IN VARCHAR2 DEFAULT NULL,
    p_region IN VARCHAR2 DEFAULT NULL,
    p_jv_yn IN VARCHAR2 DEFAULT NULL,
    p_ref_doc IN VARCHAR2 DEFAULT NULL,
    p_total_amt IN NUMBER DEFAULT NULL,
    p_customer IN VARCHAR2 DEFAULT NULL,
    p_bsns_type IN VARCHAR2 DEFAULT NULL,
    p_upd_uid IN VARCHAR2
  ) IS
  BEGIN
    UPDATE OT_PM_REBATE_DETAIL_MIT
    SET prdm_sm_code = NVL(p_sm_code, prdm_sm_code),
        prdm_dt = NVL(p_dt, prdm_dt),
        prdm_rebt_type = NVL(p_rebt_type, prdm_rebt_type),
        prdm_choice_list = NVL(p_choice_list, prdm_choice_list),
        prdm_pm_amt = NVL(p_pm_amt, prdm_pm_amt),
        prdm_pm_conf_yn = NVL(p_pm_conf_yn, prdm_pm_conf_yn),
        prdm_pm_remarks = NVL(p_pm_remarks, prdm_pm_remarks),
        prdm_ba_amt = NVL(p_ba_amt, prdm_ba_amt),
        prdm_ba_remarks = NVL(p_ba_remarks, prdm_ba_remarks),
        prdm_ba_conf_yn = NVL(p_ba_conf_yn, prdm_ba_conf_yn),
        prdm_cr_rcvd_yn = NVL(p_cr_rcvd_yn, prdm_cr_rcvd_yn),
        prdm_comp_code = NVL(p_comp_code, prdm_comp_code),
        prdm_ref = NVL(p_ref, prdm_ref),
        prdm_rebt_used = NVL(p_rebt_used, prdm_rebt_used),
        prdm_ba_rcvd_dt = NVL(p_ba_rcvd_dt, prdm_ba_rcvd_dt),
        prdm_profit_yn = NVL(p_profit_yn, prdm_profit_yn),
        prdm_ven_recv_yn = NVL(p_ven_recv_yn, prdm_ven_recv_yn),
        prdm_region = NVL(p_region, prdm_region),
        prdm_jv_yn = NVL(p_jv_yn, prdm_jv_yn),
        prdm_ref_doc = NVL(p_ref_doc, prdm_ref_doc),
        prdm_total_amt = NVL(p_total_amt, prdm_total_amt),
        prdm_customer = NVL(p_customer, prdm_customer),
        prdm_bsns_type = NVL(p_bsns_type, prdm_bsns_type),
        prdm_upd_dt = SYSDATE,
        prdm_upd_uid = p_upd_uid
    WHERE prdm_sys_id = p_prdm_sys_id;

    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      RAISE;
  END update_rebate_line;

  -- ========================================================================
  -- PROCEDURE: delete_rebate_line
  -- Purpose: Delete rebate line
  -- ========================================================================
  PROCEDURE delete_rebate_line(
    p_prdm_sys_id IN NUMBER
  ) IS
  BEGIN
    DELETE FROM OT_PM_REBATE_DETAIL_MIT
    WHERE prdm_sys_id = p_prdm_sys_id;

    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      RAISE;
  END delete_rebate_line;

  -- ========================================================================
  -- PROCEDURE: update_rebate_header
  -- Purpose: Update rebate header
  -- ========================================================================
  PROCEDURE update_rebate_header(
    p_prhm_sys_id IN NUMBER,
    p_sm_code IN VARCHAR2 DEFAULT NULL,
    p_annotation IN VARCHAR2 DEFAULT NULL,
    p_appr_status IN NUMBER DEFAULT NULL,
    p_appr_uid IN VARCHAR2 DEFAULT NULL,
    p_submit_status IN NUMBER DEFAULT NULL,
    p_amd_no IN NUMBER DEFAULT NULL,
    p_amd_user_id IN VARCHAR2 DEFAULT NULL,
    p_upd_uid IN VARCHAR2
  ) IS
  BEGIN
    UPDATE OT_PM_REBATE_HEAD_MIT
    SET prhm_sm_code = NVL(p_sm_code, prhm_sm_code),
        prhm_annotation = NVL(p_annotation, prhm_annotation),
        prhm_appr_status = NVL(p_appr_status, prhm_appr_status),
        prhm_appr_uid = NVL(p_appr_uid, prhm_appr_uid),
        prhm_appr_dt = CASE WHEN p_appr_status IS NOT NULL THEN SYSDATE ELSE prhm_appr_dt END,
        prhm_submit_status = NVL(p_submit_status, prhm_submit_status),
        prhm_amd_no = NVL(p_amd_no, prhm_amd_no),
        prhm_amd_dt = CASE WHEN p_amd_no IS NOT NULL THEN SYSDATE ELSE prhm_amd_dt END,
        prhm_amd_user_id = NVL(p_amd_user_id, prhm_amd_user_id),
        prhm_upd_dt = SYSDATE,
        prhm_upd_uid = p_upd_uid
    WHERE prhm_sys_id = p_prhm_sys_id;

    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      RAISE;
  END update_rebate_header;

  -- ========================================================================
  -- PROCEDURE: delete_rebate
  -- Purpose: Delete rebate header and all associated lines
  -- ========================================================================
  PROCEDURE delete_rebate(
    p_prhm_sys_id IN NUMBER
  ) IS
  BEGIN
    -- Delete all lines first
    DELETE FROM OT_PM_REBATE_DETAIL_MIT
    WHERE prdm_prhm_sys_id = p_prhm_sys_id;

    -- Delete header
    DELETE FROM OT_PM_REBATE_HEAD_MIT
    WHERE prhm_sys_id = p_prhm_sys_id;

    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      RAISE;
  END delete_rebate;

  -- ========================================================================
  -- PROCEDURE: create_rebate_with_lines
  -- Purpose: Create rebate with header and lines in single transaction
  -- ========================================================================
  PROCEDURE create_rebate_with_lines(
    p_json_input IN CLOB,
    p_prhm_sys_id OUT NUMBER,
    p_status OUT VARCHAR2,
    p_message OUT VARCHAR2
  ) IS
    v_json_obj JSON_OBJECT_T;
    v_lines_arr JSON_ARRAY_T;
    v_line_obj JSON_OBJECT_T;
    v_prdm_sys_id NUMBER;
    i INTEGER;
  BEGIN
    p_status := 'ERROR';
    p_message := '';

    -- Parse JSON input
    v_json_obj := JSON_OBJECT_T(p_json_input);

    -- Create header
    create_rebate_header(
      p_comp_code => v_json_obj.get_string('prhm_comp_code'),
      p_vendor => v_json_obj.get_string('prhm_vendor'),
      p_group => v_json_obj.get_string('prhm_group'),
      p_sm_code => v_json_obj.get_string('prhm_sm_code'),
      p_period => v_json_obj.get_string('prhm_period'),
      p_dr_main_acnt_code => v_json_obj.get_string('prhm_dr_main_acnt_code'),
      p_dr_sub_acnt_code => v_json_obj.get_string('prhm_dr_sub_acnt_code'),
      p_cr_main_acnt_code => v_json_obj.get_string('prhm_cr_main_acnt_code'),
      p_cr_sub_acnt_code => v_json_obj.get_string('prhm_cr_sub_acnt_code'),
      p_currency => v_json_obj.get_string('prhm_currency'),
      p_annotation => v_json_obj.get_string('prhm_annotation'),
      p_cr_uid => v_json_obj.get_string('prhm_cr_uid'),
      p_prhm_sys_id => p_prhm_sys_id
    );

    -- Add lines
    IF v_json_obj.has('lines') THEN
      v_lines_arr := JSON_ARRAY_T(v_json_obj.get('lines'));
      IF v_lines_arr IS NOT NULL AND v_lines_arr.get_size > 0 THEN
        FOR i IN 0 .. v_lines_arr.get_size - 1 LOOP
          v_line_obj := JSON_OBJECT_T(v_lines_arr.get(i));

          add_rebate_line(
            p_prhm_sys_id => p_prhm_sys_id,
            p_sm_code => v_line_obj.get_string('prdm_sm_code'),
            p_dt => TO_DATE(v_line_obj.get_string('prdm_dt'), 'YYYY-MM-DD'),
            p_rebt_type => v_line_obj.get_string('prdm_rebt_type'),
            p_choice_list => v_line_obj.get_string('prdm_choice_list'),
            p_pm_amt => v_line_obj.get_number('prdm_pm_amt'),
            p_pm_conf_yn => NVL(v_line_obj.get_string('prdm_pm_conf_yn'), 'N'),
            p_pm_remarks => v_line_obj.get_string('prdm_pm_remarks'),
            p_ba_amt => v_line_obj.get_number('prdm_ba_amt'),
            p_ba_remarks => v_line_obj.get_string('prdm_ba_remarks'),
            p_ba_conf_yn => NVL(v_line_obj.get_string('prdm_ba_conf_yn'), 'N'),
            p_cr_rcvd_yn => NVL(v_line_obj.get_string('prdm_cr_rcvd_yn'), 'N'),
            p_comp_code => v_line_obj.get_string('prdm_comp_code'),
            p_ref => v_line_obj.get_string('prdm_ref'),
            p_rebt_used => v_line_obj.get_number('prdm_rebt_used'),
            p_ba_rcvd_dt => CASE WHEN v_line_obj.get_string('prdm_ba_rcvd_dt') IS NOT NULL
                                 THEN TO_DATE(v_line_obj.get_string('prdm_ba_rcvd_dt'), 'YYYY-MM-DD')
                                 ELSE NULL END,
            p_profit_yn => NVL(v_line_obj.get_string('prdm_profit_yn'), 'N'),
            p_ven_recv_yn => NVL(v_line_obj.get_string('prdm_ven_recv_yn'), 'N'),
            p_region => v_line_obj.get_string('prdm_region'),
            p_jv_yn => v_line_obj.get_string('prdm_jv_yn'),
            p_ref_doc => v_line_obj.get_string('prdm_ref_doc'),
            p_total_amt => v_line_obj.get_number('prdm_total_amt'),
            p_customer => v_line_obj.get_string('prdm_customer'),
            p_bsns_type => v_line_obj.get_string('prdm_bsns_type'),
            p_cr_uid => v_line_obj.get_string('prdm_cr_uid'),
            p_prdm_sys_id => v_prdm_sys_id
          );
        END LOOP;
      END IF;
    END IF;

    p_status := 'SUCCESS';
    p_message := 'Rebate created successfully with ID: ' || p_prhm_sys_id;

  EXCEPTION
    WHEN OTHERS THEN
      p_status := 'ERROR';
      p_message := SQLERRM;
      ROLLBACK;
  END create_rebate_with_lines;

END FC_REBATE_PKG;
/

-- Show compilation status
SHOW ERRORS;
