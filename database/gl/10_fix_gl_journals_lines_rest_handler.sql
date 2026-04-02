-- ============================================================
-- FIX: APEX REST Handler for GET /gl/journals/:id/lines
-- Correct table: RR_GL_JE_LINES_ALL
-- ============================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'gl',
        p_pattern     => 'journals/:id/lines',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'Get journal lines by header ID'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'gl',
        p_pattern        => 'journals/:id/lines',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 0,
        p_mimes_allowed  => NULL,
        p_comments       => 'Get journal lines for a specific GL header',
        p_source         => '
            SELECT
                LINE_ID                    AS "lineId",
                JE_LINE_NUMBER             AS "lineNum",
                JE_HEADER_ID               AS "jeHeaderId",
                BATCH_ID                   AS "batchId",
                ACCOUNT_COMBINATION        AS "account",
                CHART_OF_ACCOUNTS_NAME     AS "chartOfAccountsName",
                DESCRIPTION                AS "description",
                ENTERED_DR                 AS "enteredDr",
                ENTERED_CR                 AS "enteredCr",
                ACCOUNTED_DR               AS "accountedDr",
                ACCOUNTED_CR               AS "accountedCr",
                CURRENCY_CODE              AS "currency",
                STAT_AMOUNT                AS "statAmount",
                RECONCILIATION_REFERENCE   AS "reconciliationReference"
            FROM RR_GL_JE_LINES_ALL
            WHERE JE_HEADER_ID = :id
            ORDER BY JE_LINE_NUMBER
        '
    );
    COMMIT;
END;
/
