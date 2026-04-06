-- =====================================================
-- ORDS REST Handler — GL Journal Lines Summary
-- GET /reerp/gl/lines-summary
--
-- Aggregates RR_GL_JE_LINES_ALL by ACCOUNT_COMBINATION
-- joined to RR_GL_JE_HEADERS for the PERIOD_NAME.
-- Segments parsed from ACCOUNT_COMBINATION using '-' separator:
--   01-00-01-4111101-1118-000-00-000-000
--   ^  ^  ^  ^       ^    ^   ^  ^   ^
--   1  2  3  4       5    6   7  8   9
-- =====================================================

-- ─────────────────────────────────────────────────────
-- 1. TEMPLATE: gl/lines-summary
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

-- ─────────────────────────────────────────────────────
-- 2. GET /reerp/gl/lines-summary
--    Params: period_name (required), company (optional)
-- ─────────────────────────────────────────────────────
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/lines-summary',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_mimes_allowed  => NULL,
        p_comments       => 'GL Lines summary by account combination for a period',
        p_source         => q'[
SELECT
    lin.ACCOUNT_COMBINATION                                             AS account_combination,
    REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 1)               AS seg1_company,
    REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 2)               AS seg2_lob,
    REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 3)               AS seg3_department,
    REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 4)               AS seg4_account,
    REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 5)               AS seg5_sub_account,
    REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 6)               AS seg6_analysis,
    REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 7)               AS seg7_intercompany,
    REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 8)               AS seg8_future1,
    REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 9)               AS seg9_future2,
    hdr.LEDGER_NAME                                                     AS ledger_name,
    hdr.PERIOD_NAME                                                     AS period_name,
    SUM(NVL(lin.ACCOUNTED_DR, 0))                                       AS total_dr,
    SUM(NVL(lin.ACCOUNTED_CR, 0))                                       AS total_cr,
    SUM(NVL(lin.ACCOUNTED_DR, 0)) - SUM(NVL(lin.ACCOUNTED_CR, 0))      AS net_amount,
    COUNT(*)                                                            AS line_count
FROM RR_GL_JE_LINES_ALL  lin
JOIN RR_GL_JE_HEADERS     hdr ON hdr.JE_HEADER_ID = lin.JE_HEADER_ID
WHERE lin.ACCOUNT_COMBINATION IS NOT NULL
  AND (:period_name IS NULL OR hdr.PERIOD_NAME   = :period_name)
  AND (:company     IS NULL OR
       REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 1) = :company)
GROUP BY
    lin.ACCOUNT_COMBINATION,
    hdr.LEDGER_NAME,
    hdr.PERIOD_NAME
ORDER BY
    REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 1),   -- company
    REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION, '[^-]+', 1, 4),   -- account
    lin.ACCOUNT_COMBINATION
]'
    );
    COMMIT;
END;
/
