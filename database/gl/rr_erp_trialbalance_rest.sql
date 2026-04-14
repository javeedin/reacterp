-- =====================================================
-- ORDS REST Handlers for RR_ERP_TRIALBALANCE
-- Generated Trial Balance from RR_GL_JE_LINES_ALL
--
-- Endpoints:
--   POST /reerp/gl/rr-trialbalance/generate  → call RR_ERP_TB_PKG.GENERATE_TB
--   GET  /reerp/gl/rr-trialbalance           → query RR_ERP_TRIALBALANCE
--   GET  /reerp/gl/rr-trialbalance/ledgers   → distinct ledger names
--   GET  /reerp/gl/rr-trialbalance/periods   → distinct periods for ledger/year
-- =====================================================

-- ─────────────────────────────────────────────────────────────
-- 1. TEMPLATE: gl/rr-trialbalance
-- ─────────────────────────────────────────────────────────────
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/rr-trialbalance',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_comments       => 'RR Trial Balance — derived from journal lines'
    );
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -20001 THEN NULL; ELSE RAISE; END IF;
END;
/

-- ─────────────────────────────────────────────────────────────
-- 2. GET /reerp/gl/rr-trialbalance
--    Query RR_ERP_TRIALBALANCE with optional filters
--    Params: ledger_name, period_year, period_name, account_type, company
-- ─────────────────────────────────────────────────────────────
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/rr-trialbalance',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_mimes_allowed  => NULL,
        p_comments       => 'Retrieve RR Trial Balance rows with optional filters',
        p_source         => q'[
SELECT
    tb_id,
    ledger_name,
    period_name,
    period_year,
    period_num,
    currency_code,
    account_combination,
    company,
    lob,
    department,
    account,
    account_desc,
    sub_account,
    analysis,
    intercompany,
    future1,
    future2,
    account_type,
    NVL(opening_dr, 0)  AS opening_dr,
    NVL(opening_cr, 0)  AS opening_cr,
    NVL(ptd_dr, 0)      AS ptd_dr,
    NVL(ptd_cr, 0)      AS ptd_cr,
    NVL(ytd_dr, 0)      AS ytd_dr,
    NVL(ytd_cr, 0)      AS ytd_cr,
    NVL(closing_dr, 0)  AS closing_dr,
    NVL(closing_cr, 0)  AS closing_cr,
    TO_CHAR(run_date, 'YYYY-MM-DD HH24:MI:SS') AS run_date
FROM rr_erp_trialbalance
WHERE (:ledger_name IS NULL OR ledger_name = :ledger_name)
  AND (:period_year IS NULL OR period_year = TO_NUMBER(:period_year))
  AND (:period_name IS NULL OR period_name = :period_name)
  AND (:account_type IS NULL OR account_type = :account_type)
  AND (:company IS NULL OR company = :company)
ORDER BY
    period_year,
    period_num,
    CASE account_type
        WHEN 'A' THEN 1   -- Asset
        WHEN 'L' THEN 2   -- Liability
        WHEN 'O' THEN 3   -- Equity
        WHEN 'R' THEN 4   -- Revenue
        WHEN 'E' THEN 5   -- Expense
        ELSE 6
    END,
    account,
    company,
    department
]'
    );
    COMMIT;
END;
/

-- ─────────────────────────────────────────────────────────────
-- 3. TEMPLATE: gl/rr-trialbalance/generate
-- ─────────────────────────────────────────────────────────────
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/rr-trialbalance/generate',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_comments       => 'RR Trial Balance — generate from journal lines'
    );
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -20001 THEN NULL; ELSE RAISE; END IF;
END;
/

-- ─────────────────────────────────────────────────────────────
-- 4. POST /reerp/gl/rr-trialbalance/generate
--    Body: { "p_ledger_name": "...", "p_period_year": 2025, "p_period_name": "Mar-25" }
--    Calls RR_ERP_TB_PKG.GENERATE_TB and returns result summary
-- ─────────────────────────────────────────────────────────────
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/rr-trialbalance/generate',
        p_method         => 'POST',
        p_source_type    => 'plsql/block',
        p_mimes_allowed  => 'application/json',
        p_comments       => 'Generate RR Trial Balance from journal lines',
        p_source         => q'[
DECLARE
    v_body          CLOB := :body_text;
    v_ledger_name   VARCHAR2(240);
    v_period_year   NUMBER;
    v_period_name   VARCHAR2(30);
    v_company       VARCHAR2(30);
    v_inserted      NUMBER := 0;
    v_updated       NUMBER := 0;
    v_errors        NUMBER := 0;
    v_error_msg     VARCHAR2(4000);
    v_msg           VARCHAR2(500);
    v_start         TIMESTAMP := SYSTIMESTAMP;
    v_elapsed_sec   NUMBER;
BEGIN
    -- Parse JSON body
    v_ledger_name := JSON_VALUE(v_body, '$.p_ledger_name');
    v_period_year := TO_NUMBER(JSON_VALUE(v_body, '$.p_period_year'));
    v_period_name := JSON_VALUE(v_body, '$.p_period_name');
    v_company     := JSON_VALUE(v_body, '$.p_company');

    -- Run the generation procedure
    RR_ERP_TB_PKG.GENERATE_TB(
        p_ledger_name => v_ledger_name,
        p_period_year => v_period_year,
        p_period_name => v_period_name,
        p_company     => v_company,
        p_inserted    => v_inserted,
        p_updated     => v_updated,
        p_errors      => v_errors,
        p_error_msg   => v_error_msg
    );

    v_elapsed_sec := ROUND(
        (CAST(SYSTIMESTAMP AS DATE) - CAST(v_start AS DATE)) * 86400, 1
    );

    v_msg := 'Generated ' || (v_inserted + v_updated) || ' rows'
          || ' (' || v_inserted || ' new, ' || v_updated || ' replaced)'
          || ' in ' || v_elapsed_sec || 's';

    :status_code := CASE WHEN v_errors > 0 THEN 207 ELSE 200 END;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success',      v_errors = 0);
    APEX_JSON.WRITE('inserted',     v_inserted);
    APEX_JSON.WRITE('updated',      v_updated);
    APEX_JSON.WRITE('errors',       v_errors);
    APEX_JSON.WRITE('error_msg',    v_error_msg);
    APEX_JSON.WRITE('message',      v_msg);
    APEX_JSON.WRITE('elapsed_sec',  v_elapsed_sec);
    APEX_JSON.WRITE('ledger_name',  v_ledger_name);
    APEX_JSON.WRITE('period_year',  v_period_year);
    APEX_JSON.WRITE('period_name',  v_period_name);
    APEX_JSON.WRITE('company',      v_company);
    APEX_JSON.CLOSE_OBJECT;

EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        :status_code := 500;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success',   FALSE);
        APEX_JSON.WRITE('inserted',  0);
        APEX_JSON.WRITE('updated',   0);
        APEX_JSON.WRITE('errors',    1);
        APEX_JSON.WRITE('error_msg', SQLERRM);
        APEX_JSON.WRITE('message',   'Fatal error during TB generation: ' || SQLERRM);
        APEX_JSON.CLOSE_OBJECT;
END;
]'
    );
    COMMIT;
END;
/

-- ─────────────────────────────────────────────────────────────
-- 5. TEMPLATE: gl/rr-trialbalance/ledgers
-- ─────────────────────────────────────────────────────────────
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/rr-trialbalance/ledgers',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_comments       => 'Distinct ledger names from RR_GL_JE_HEADERS'
    );
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -20001 THEN NULL; ELSE RAISE; END IF;
END;
/

-- ─────────────────────────────────────────────────────────────
-- 6. GET /reerp/gl/rr-trialbalance/ledgers
--    Returns distinct ledger names (for UI dropdown)
-- ─────────────────────────────────────────────────────────────
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/rr-trialbalance/ledgers',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_mimes_allowed  => NULL,
        p_comments       => 'Distinct ledger names available in journal headers',
        p_source         => q'[
SELECT DISTINCT
    LEDGER_NAME  AS ledger_name
FROM RR_GL_JE_HEADERS
WHERE LEDGER_NAME IS NOT NULL
ORDER BY LEDGER_NAME
]'
    );
    COMMIT;
END;
/

-- ─────────────────────────────────────────────────────────────
-- 7. TEMPLATE: gl/rr-trialbalance/periods
-- ─────────────────────────────────────────────────────────────
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/rr-trialbalance/periods',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_comments       => 'Distinct period names for ledger/year'
    );
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -20001 THEN NULL; ELSE RAISE; END IF;
END;
/

-- ─────────────────────────────────────────────────────────────
-- 8. GET /reerp/gl/rr-trialbalance/periods
--    Params: ledger_name, period_year (optional)
--    Returns distinct period names sorted chronologically
-- ─────────────────────────────────────────────────────────────

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/rr-trialbalance/periods',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_mimes_allowed  => NULL,
        p_comments       => 'Distinct period names from journal headers for a given ledger/year',
        p_source         => q'[
SELECT DISTINCT
    hdr.PERIOD_NAME   AS period_name,
    EXTRACT(YEAR  FROM TO_DATE('01-' || hdr.PERIOD_NAME, 'DD-Mon-RR'))  AS period_year,
    EXTRACT(MONTH FROM TO_DATE('01-' || hdr.PERIOD_NAME, 'DD-Mon-RR'))  AS period_num
FROM RR_GL_JE_HEADERS hdr
WHERE hdr.PERIOD_NAME IS NOT NULL
  AND (:ledger_name IS NULL OR hdr.LEDGER_NAME = :ledger_name)
  AND (:period_year IS NULL OR
       EXTRACT(YEAR FROM TO_DATE('01-' || hdr.PERIOD_NAME, 'DD-Mon-RR')) = TO_NUMBER(:period_year))
ORDER BY period_year DESC, period_num DESC
]'
    );
    COMMIT;
END;
/

-- ─────────────────────────────────────────────────────────────
-- 9. TEMPLATE: gl/rr-trialbalance/companies
-- ─────────────────────────────────────────────────────────────
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/rr-trialbalance/companies',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_comments       => 'Distinct company (segment 1) values from journal lines'
    );
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -20001 THEN NULL; ELSE RAISE; END IF;
END;
/

-- ─────────────────────────────────────────────────────────────
-- 10. GET /reerp/gl/rr-trialbalance/companies
--     Param: ledger_name (optional)
--     Returns distinct Segment 1 (Company) values from journal lines
-- ─────────────────────────────────────────────────────────────
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/rr-trialbalance/companies',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_mimes_allowed  => NULL,
        p_comments       => 'Distinct company values (segment 1 of account combination)',
        p_source         => q'[
SELECT DISTINCT
    NULLIF(TRIM(REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 1)), '') AS company
FROM RR_GL_JE_LINES_ALL  lin
JOIN RR_GL_JE_HEADERS    hdr ON hdr.JE_HEADER_ID = lin.JE_HEADER_ID
WHERE lin.ACCOUNT_COMBINATION IS NOT NULL
  AND (:ledger_name IS NULL OR hdr.LEDGER_NAME = :ledger_name)
  AND NULLIF(TRIM(REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 1)), '') IS NOT NULL
ORDER BY company
]'
    );
    COMMIT;
END;
/
