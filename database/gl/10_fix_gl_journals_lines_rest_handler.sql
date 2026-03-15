-- ============================================================
-- FIX: APEX REST Handler for GET /gl/journals/:id/lines
-- The previous handler was returning header data instead of
-- individual journal lines. This redefines it correctly.
-- ============================================================
-- Route: journals/:id/lines
-- Bind:  :id = JE_HEADER_ID (from URL path)
-- Table: RR_GL_LINES_ALL
-- ============================================================

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'gl',
        p_pattern        => 'journals/:id/lines',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 0,
        p_mimes_allowed  => NULL,
        p_comments       => 'Get individual journal lines for a specific GL header ID',
        p_source         => '
            SELECT
                l.LINE_ID               AS "lineId",
                l.JE_LINE_NUMBER        AS "lineNum",
                l.JE_HEADER_ID          AS "jeHeaderId",
                l.ACCOUNT_COMBINATION   AS "account",
                l.CHART_OF_ACCOUNTS_NAME AS "chartOfAccountsName",
                l.DESCRIPTION           AS "description",
                l.ENTERED_DR            AS "enteredDr",
                l.ENTERED_CR            AS "enteredCr",
                l.ACCOUNTED_DR          AS "accountedDr",
                l.ACCOUNTED_CR          AS "accountedCr",
                l.CURRENCY_CODE         AS "currency",
                l.STAT_AMOUNT           AS "statAmount",
                l.RECONCILIATION_REFERENCE AS "reconciliationReference"
            FROM RR_GL_LINES_ALL l
            WHERE l.JE_HEADER_ID = :id
            ORDER BY l.JE_LINE_NUMBER
        '
    );
    COMMIT;
END;
/

COMMIT;
