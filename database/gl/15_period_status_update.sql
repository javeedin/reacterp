-- ============================================================
-- Period Status Update — Open / Close a period
-- Adds PUT /reerp/gl/periodstatus handler
--
-- Updates:
--   1. RR_GL_FISCAL_PERIODS (used by the drill-down UI)
--   2. RR_ACCOUNTING_PERIODS_STATUS (used by PC module validation)
--
-- Body: { "periodName": "Apr-26", "ledgerName": "...", "app": "AP", "action": "OPEN"|"CLOSE" }
-- ============================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/periodstatus',
        p_method         => 'PUT',
        p_source_type    => 'plsql/block',
        p_items_per_page => 0,
        p_mimes_allowed  => 'application/json',
        p_comments       => 'Open or Close an accounting period for a module/ledger',
        p_source         => q'[
DECLARE
    l_body        CLOB := :body_text;
    l_period_name VARCHAR2(100);
    l_ledger_name VARCHAR2(240);
    l_app         VARCHAR2(20);
    l_action      VARCHAR2(20);
    l_new_fp_status  VARCHAR2(30);   -- RR_GL_FISCAL_PERIODS: 'Open' / 'Closed'
    l_new_ap_status  VARCHAR2(1);    -- RR_ACCOUNTING_PERIODS_STATUS: 'O' / 'C'
    l_app_id      NUMBER;
    l_rows_fp     NUMBER := 0;
    l_rows_aps    NUMBER := 0;
BEGIN
    SELECT
        JSON_VALUE(l_body, '$.periodName'),
        JSON_VALUE(l_body, '$.ledgerName'),
        UPPER(JSON_VALUE(l_body, '$.app')),
        UPPER(JSON_VALUE(l_body, '$.action'))
    INTO l_period_name, l_ledger_name, l_app, l_action
    FROM dual;

    IF l_action NOT IN ('OPEN', 'CLOSE') THEN
        :status_code := 400;
        HTP.PRN('{"success":false,"message":"action must be OPEN or CLOSE"}');
        RETURN;
    END IF;

    l_new_fp_status := CASE l_action WHEN 'OPEN' THEN 'Open' ELSE 'Closed' END;
    l_new_ap_status := CASE l_action WHEN 'OPEN' THEN 'O'    ELSE 'C'      END;

    -- Map app short name → numeric application_id
    l_app_id := CASE l_app
        WHEN 'GL'  THEN 101
        WHEN 'AP'  THEN 200
        WHEN 'AR'  THEN 222
        WHEN 'INV' THEN 401
        ELSE NULL
    END;

    -- ── 1. Update RR_GL_FISCAL_PERIODS ──────────────────────────────
    UPDATE rr_gl_fiscal_periods
    SET    status    = l_new_fp_status,
           sync_date = SYSTIMESTAMP
    WHERE  period_name = l_period_name
      AND  ledger_name = l_ledger_name
      AND  application = l_app;
    l_rows_fp := SQL%ROWCOUNT;

    -- ── 2. Update RR_ACCOUNTING_PERIODS_STATUS ───────────────────────
    -- period_name_id format is '<number>_<PeriodName>' e.g. '16_Apr-26'
    -- ESCAPE '\' so the literal underscore in the pattern is not treated as wildcard.
    IF l_app_id IS NOT NULL THEN
        UPDATE rr_accounting_periods_status
        SET    closing_status    = l_new_ap_status,
               last_update_date  = SYSTIMESTAMP
        WHERE  application_id   = l_app_id
          AND  (period_name_id  = l_period_name
             OR period_name_id LIKE '%\_' || l_period_name ESCAPE '\');
        l_rows_aps := SQL%ROWCOUNT;
    END IF;

    COMMIT;
    :status_code := 200;
    HTP.PRN('{"success":true,"message":"Period ' || l_period_name || ' ' || l_action || 'ED"'
         || ',"rowsFiscal":' || l_rows_fp
         || ',"rowsStatus":' || l_rows_aps || '}');
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        :status_code := 500;
        HTP.PRN('{"success":false,"message":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;
]'
    );
    COMMIT;
END;
/
