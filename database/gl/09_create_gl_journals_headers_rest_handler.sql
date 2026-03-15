-- ============================================================
-- APEX REST Handler: GET /gl/journals/headers
-- Returns journal header data for a given JE_HEADER_ID
-- ============================================================
-- Route: journals/headers
-- Param: jeHeaderId (mandatory)
-- ============================================================

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'gl',
        p_pattern        => 'journals/headers',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_etag_query     => NULL,
        p_comments       => 'Get GL journal header(s) by JE_HEADER_ID'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'gl',
        p_pattern        => 'journals/headers',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 0,
        p_mimes_allowed  => NULL,
        p_comments       => 'Fetch GL journal header(s) filtered by JE_HEADER_ID',
        p_source         => '
            SELECT
                h.JE_HEADER_ID            AS "jeHeaderId",
                h.JE_BATCH_ID             AS "batchId",
                b.NAME                    AS "batchName",
                h.NAME                    AS "journalName",
                h.PERIOD_NAME             AS "periodName",
                h.EFFECTIVE_DATE          AS "effectiveDate",
                h.LEDGER_NAME             AS "ledgerName",
                h.CURRENCY_CODE           AS "currencyCode",
                h.STATUS                  AS "postingStatus",
                h.STATUS_MEANING          AS "statusMeaning",
                b.USER_JE_SOURCE_NAME     AS "source",
                h.USER_JE_CATEGORY_NAME   AS "category",
                h.ENTERED_DR              AS "enteredDebit",
                h.ENTERED_CR              AS "enteredCredit",
                h.ACCOUNTED_DR            AS "accountedDebit",
                h.ACCOUNTED_CR            AS "accountedCredit"
            FROM RR_GL_HEADERS h
            JOIN RR_GL_JOURNAL_BATCHES b ON b.JE_BATCH_ID = h.JE_BATCH_ID
            WHERE (:jeHeaderId IS NULL OR h.JE_HEADER_ID = :jeHeaderId)
            ORDER BY h.JE_HEADER_ID
        '
    );
    COMMIT;
END;
/

COMMIT;
