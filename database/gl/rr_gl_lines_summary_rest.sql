-- =====================================================
-- ORDS REST Handlers — GL Journal Lines Summary
--
-- Endpoints:
--   GET /reerp/gl/lines-summary        → aggregated data
--   GET /reerp/gl/lines-summary/diag   → diagnostic (table counts, sample periods)
--
-- Run this script in full each time to replace handlers.
-- =====================================================

-- ─────────────────────────────────────────────────────
-- Drop existing handlers (ignore errors if not found)
-- ─────────────────────────────────────────────────────
BEGIN
    ORDS.DELETE_HANDLER(
        p_module_name => 'reerp',
        p_pattern     => 'gl/lines-summary',
        p_method      => 'GET'
    );
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DELETE_HANDLER(
        p_module_name => 'reerp',
        p_pattern     => 'gl/lines-summary/diag',
        p_method      => 'GET'
    );
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

-- ─────────────────────────────────────────────────────
-- Templates
-- ─────────────────────────────────────────────────────
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/lines-summary',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_comments       => 'GL Journal Lines summary grouped by account combination'
    );
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -20001 THEN NULL; ELSE RAISE; END IF;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/lines-summary/diag',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_comments       => 'Diagnostic for GL lines summary'
    );
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -20001 THEN NULL; ELSE RAISE; END IF;
END;
/

-- ─────────────────────────────────────────────────────
-- GET gl/lines-summary
--
-- Params:
--   period_name  — e.g. Sep-23  (optional)
--   company      — first segment value, e.g. 01  (optional)
--
-- Notes:
--   • p_items_per_page => 0  disables ORDS row limit
--   • NULLIF(:param,'') handles empty-string bind from ORDS
--     when parameter is omitted from the URL
--   • Flat SELECT (no subquery) avoids ORDS pagination
--     wrapper conflicts with nested ORDER BY
-- ─────────────────────────────────────────────────────
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/lines-summary',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 0,
        p_mimes_allowed  => NULL,
        p_comments       => 'GL Lines summary by account combination',
        p_source         => q'[
SELECT *
FROM (
    SELECT
        lin.ACCOUNT_COMBINATION                                             AS account_combination,
        REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 1)              AS seg1_company,
        REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 2)              AS seg2_lob,
        REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 3)              AS seg3_department,
        REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 4)              AS seg4_account,
        REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 5)              AS seg5_sub_account,
        REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 6)              AS seg6_analysis,
        REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 7)              AS seg7_intercompany,
        REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 8)              AS seg8_future1,
        REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 9)              AS seg9_future2,
        hdr.LEDGER_NAME                                                     AS ledger_name,
        hdr.PERIOD_NAME                                                     AS period_name,
        SUM(NVL(lin.ACCOUNTED_DR, 0))                                       AS total_dr,
        SUM(NVL(lin.ACCOUNTED_CR, 0))                                       AS total_cr,
        SUM(NVL(lin.ACCOUNTED_DR, 0)) - SUM(NVL(lin.ACCOUNTED_CR, 0))      AS net_amount,
        COUNT(*)                                                            AS line_count
    FROM RR_GL_JE_LINES_ALL  lin
    JOIN RR_GL_JE_HEADERS     hdr ON hdr.JE_HEADER_ID = lin.JE_HEADER_ID
    WHERE lin.ACCOUNT_COMBINATION IS NOT NULL
      AND (
            NULLIF(:period_name, '') IS NULL
            OR UPPER(hdr.PERIOD_NAME) = UPPER(:period_name)
          )
      AND (
            NULLIF(:company, '') IS NULL
            OR UPPER(REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 1)) = UPPER(:company)
          )
    GROUP BY
        lin.ACCOUNT_COMBINATION,
        hdr.LEDGER_NAME,
        hdr.PERIOD_NAME
)
ORDER BY seg1_company, seg4_account, account_combination
]'
    );
    COMMIT;
END;
/

-- ─────────────────────────────────────────────────────
-- GET gl/lines-summary/diag
-- Diagnostic endpoint — no params needed
-- ─────────────────────────────────────────────────────
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/lines-summary/diag',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 0,
        p_mimes_allowed  => NULL,
        p_comments       => 'Diagnostic rows for GL lines summary',
        p_source         => q'[
SELECT 'TABLE_COUNT' AS check_type, 'RR_GL_JE_LINES_ALL' AS detail, TO_CHAR(COUNT(*)) AS value
FROM RR_GL_JE_LINES_ALL
UNION ALL
SELECT 'TABLE_COUNT', 'RR_GL_JE_HEADERS', TO_CHAR(COUNT(*))
FROM RR_GL_JE_HEADERS
UNION ALL
SELECT 'JOIN_COUNT', 'lines JOIN headers on JE_HEADER_ID', TO_CHAR(COUNT(*))
FROM RR_GL_JE_LINES_ALL lin JOIN RR_GL_JE_HEADERS hdr ON hdr.JE_HEADER_ID = lin.JE_HEADER_ID
UNION ALL
SELECT 'PERIOD_SAMPLE', PERIOD_NAME, TO_CHAR(ROWNUM)
FROM (SELECT DISTINCT PERIOD_NAME FROM RR_GL_JE_HEADERS WHERE PERIOD_NAME IS NOT NULL ORDER BY PERIOD_NAME DESC)
WHERE ROWNUM <= 10
UNION ALL
SELECT 'ACCT_COMBO_SAMPLE', ACCOUNT_COMBINATION, TO_CHAR(ROWNUM)
FROM (SELECT DISTINCT ACCOUNT_COMBINATION FROM RR_GL_JE_LINES_ALL WHERE ACCOUNT_COMBINATION IS NOT NULL ORDER BY ACCOUNT_COMBINATION)
WHERE ROWNUM <= 5
]'
    );
    COMMIT;
END;
/
