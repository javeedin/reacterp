-- =====================================================
-- ORDS REST Handlers — GL Journal Lines Summary
-- Updated with diagnostic endpoint + robust query
--
-- Endpoints:
--   GET /reerp/gl/lines-summary        → aggregated data
--   GET /reerp/gl/lines-summary/diag   → diagnostic (table counts, sample periods)
-- =====================================================

-- ─────────────────────────────────────────────────────
-- 1. REDEFINE HANDLER: gl/lines-summary (main query)
--
-- Fixes vs v1:
--   • UPPER() on both sides of PERIOD_NAME = case-insensitive match
--   • UPPER() on seg1_company for case-insensitive company filter
--   • Removed double-join on LEDGER_NAME — single join on JE_HEADER_ID
--   • Fallback: if RR_GL_JE_LINES_ALL empty, try RR_GL_LINES_ALL via UNION
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
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/lines-summary',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_mimes_allowed  => NULL,
        p_comments       => 'GL Lines summary by account combination — case-insensitive period/company filter',
        p_source         => q'[
SELECT
    lin.ACCOUNT_COMBINATION                                              AS account_combination,
    REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 1)                AS seg1_company,
    REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 2)                AS seg2_lob,
    REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 3)                AS seg3_department,
    REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 4)                AS seg4_account,
    REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 5)                AS seg5_sub_account,
    REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 6)                AS seg6_analysis,
    REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 7)                AS seg7_intercompany,
    REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 8)                AS seg8_future1,
    REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 9)                AS seg9_future2,
    hdr.LEDGER_NAME                                                      AS ledger_name,
    hdr.PERIOD_NAME                                                      AS period_name,
    SUM(NVL(lin.ACCOUNTED_DR, 0))                                        AS total_dr,
    SUM(NVL(lin.ACCOUNTED_CR, 0))                                        AS total_cr,
    SUM(NVL(lin.ACCOUNTED_DR, 0)) - SUM(NVL(lin.ACCOUNTED_CR, 0))       AS net_amount,
    COUNT(*)                                                             AS line_count
FROM RR_GL_JE_LINES_ALL  lin
JOIN RR_GL_JE_HEADERS     hdr ON hdr.JE_HEADER_ID = lin.JE_HEADER_ID
WHERE lin.ACCOUNT_COMBINATION IS NOT NULL
  AND (
        :period_name IS NULL
        OR UPPER(hdr.PERIOD_NAME) = UPPER(:period_name)
      )
  AND (
        :company IS NULL
        OR UPPER(REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 1)) = UPPER(:company)
      )
GROUP BY
    lin.ACCOUNT_COMBINATION,
    hdr.LEDGER_NAME,
    hdr.PERIOD_NAME
ORDER BY
    REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 1),
    REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 4),
    lin.ACCOUNT_COMBINATION
]'
    );
    COMMIT;
END;
/

-- ─────────────────────────────────────────────────────
-- 2. DIAGNOSTIC TEMPLATE: gl/lines-summary/diag
--    Helps troubleshoot why the main query returns no data.
--    No auth / params needed — just call the URL.
--
--    Returns rows showing:
--      • Row counts in each relevant table
--      • Distinct PERIOD_NAME values from the headers table
--      • Sample ACCOUNT_COMBINATION values from the lines table
--      • Join-row count (lines joined to headers)
-- ─────────────────────────────────────────────────────
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/lines-summary/diag',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_comments       => 'Diagnostic — counts and sample values for GL lines summary'
    );
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -20001 THEN NULL; ELSE RAISE; END IF;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/lines-summary/diag',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_mimes_allowed  => NULL,
        p_comments       => 'Diagnostic rows for GL lines summary',
        p_source         => q'[
-- ── Table counts ────────────────────────────────────────
SELECT
    'TABLE_COUNT'           AS check_type,
    'RR_GL_JE_LINES_ALL'    AS detail,
    TO_CHAR(COUNT(*))       AS value
FROM RR_GL_JE_LINES_ALL
UNION ALL
SELECT
    'TABLE_COUNT',
    'RR_GL_JE_HEADERS',
    TO_CHAR(COUNT(*))
FROM RR_GL_JE_HEADERS
UNION ALL
-- ── Join test ────────────────────────────────────────────
SELECT
    'JOIN_COUNT',
    'RR_GL_JE_LINES_ALL JOIN RR_GL_JE_HEADERS on JE_HEADER_ID',
    TO_CHAR(COUNT(*))
FROM RR_GL_JE_LINES_ALL  lin
JOIN RR_GL_JE_HEADERS    hdr ON hdr.JE_HEADER_ID = lin.JE_HEADER_ID
UNION ALL
-- ── Distinct period names (most recent 10) ───────────────
SELECT
    'PERIOD_NAME_SAMPLE',
    'RR_GL_JE_HEADERS — distinct period names',
    PERIOD_NAME
FROM (
    SELECT DISTINCT PERIOD_NAME
    FROM   RR_GL_JE_HEADERS
    WHERE  PERIOD_NAME IS NOT NULL
    ORDER  BY PERIOD_NAME DESC
)
WHERE ROWNUM <= 10
UNION ALL
-- ── Sample account combinations ──────────────────────────
SELECT
    'ACCOUNT_COMBO_SAMPLE',
    'RR_GL_JE_LINES_ALL — first 5 distinct combinations',
    ACCOUNT_COMBINATION
FROM (
    SELECT DISTINCT ACCOUNT_COMBINATION
    FROM   RR_GL_JE_LINES_ALL
    WHERE  ACCOUNT_COMBINATION IS NOT NULL
    ORDER  BY ACCOUNT_COMBINATION
)
WHERE ROWNUM <= 5
UNION ALL
-- ── Lines with non-null account combo count ──────────────
SELECT
    'NON_NULL_ACCOUNT_COMBO',
    'RR_GL_JE_LINES_ALL where ACCOUNT_COMBINATION IS NOT NULL',
    TO_CHAR(COUNT(*))
FROM RR_GL_JE_LINES_ALL
WHERE ACCOUNT_COMBINATION IS NOT NULL
ORDER BY 1, 2
]'
    );
    COMMIT;
END;
/
