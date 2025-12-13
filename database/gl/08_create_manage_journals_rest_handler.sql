-- ============================================================
-- APEX REST Handlers for Manage Journals API
-- Created for ReactERP
-- ============================================================

-- First, create the REST module (if not exists)
BEGIN
    ORDS.DEFINE_MODULE(
        p_module_name    => 'gl',
        p_base_path      => '/gl/',
        p_items_per_page => 25,
        p_status         => 'PUBLISHED',
        p_comments       => 'General Ledger REST APIs'
    );
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        NULL; -- Module may already exist
END;
/

-- ============================================================
-- GET /gl/journals - Search journals with parameters
-- ============================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'gl',
        p_pattern        => 'journals',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_etag_query     => NULL,
        p_comments       => 'Manage Journals - Search and List'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'gl',
        p_pattern        => 'journals',
        p_method         => 'GET',
        p_source_type    => 'plsql/block',
        p_items_per_page => 0,
        p_mimes_allowed  => NULL,
        p_comments       => 'Search journals with parameters',
        p_source         => '
DECLARE
    v_cursor        SYS_REFCURSOR;
    v_count         NUMBER;
    v_json          CLOB;
    v_row_json      CLOB;
    v_first         BOOLEAN := TRUE;

    -- Variables for cursor columns
    v_header_sync_id    NUMBER;
    v_je_header_id      NUMBER;
    v_je_batch_id       NUMBER;
    v_journal_name      VARCHAR2(240);
    v_journal_batch     VARCHAR2(4000);
    v_batch_name        VARCHAR2(240);
    v_period            VARCHAR2(15);
    v_source            VARCHAR2(80);
    v_category          VARCHAR2(80);
    v_entered_dr        NUMBER;
    v_entered_cr        NUMBER;
    v_accounted_dr      NUMBER;
    v_accounted_cr      NUMBER;
    v_currency          VARCHAR2(15);
    v_batch_status      VARCHAR2(80);
    v_status_code       VARCHAR2(30);
    v_reference         VARCHAR2(240);
    v_approval_status   VARCHAR2(80);
    v_ledger_name       VARCHAR2(240);
    v_effective_date    DATE;
    v_posted_date       DATE;
    v_creation_date     TIMESTAMP;

    -- Parameters
    v_journal           VARCHAR2(240) := :journal;
    v_journal_op        VARCHAR2(30) := NVL(:journalOperator, ''Starts with'');
    v_batch             VARCHAR2(240) := :batch;
    v_batch_op          VARCHAR2(30) := NVL(:batchOperator, ''Starts with'');
    v_period_param      VARCHAR2(15) := :accountingPeriod;
    v_source_param      VARCHAR2(80) := :source;
    v_category_param    VARCHAR2(80) := :category;
    v_ledger_param      VARCHAR2(240) := :ledger;
    v_status_param      VARCHAR2(80) := :batchStatus;
    v_offset            NUMBER := NVL(:offset, 0);
    v_limit             NUMBER := NVL(:limit, 25);
BEGIN
    -- Get total count
    v_count := RR_MANAGE_JOURNALS_PKG.get_journal_count(
        p_journal           => v_journal,
        p_journal_operator  => v_journal_op,
        p_batch             => v_batch,
        p_batch_operator    => v_batch_op,
        p_period            => v_period_param,
        p_source            => v_source_param,
        p_category          => v_category_param,
        p_ledger            => v_ledger_param,
        p_batch_status      => v_status_param
    );

    -- Get journals
    v_cursor := RR_MANAGE_JOURNALS_PKG.search_journals(
        p_journal           => v_journal,
        p_journal_operator  => v_journal_op,
        p_batch             => v_batch,
        p_batch_operator    => v_batch_op,
        p_period            => v_period_param,
        p_source            => v_source_param,
        p_category          => v_category_param,
        p_ledger            => v_ledger_param,
        p_batch_status      => v_status_param,
        p_offset            => v_offset,
        p_limit             => v_limit
    );

    -- Build JSON response
    v_json := ''{
    "success": true,
    "totalCount": '' || v_count || '',
    "offset": '' || v_offset || '',
    "limit": '' || v_limit || '',
    "items": ['';

    LOOP
        FETCH v_cursor INTO
            v_header_sync_id, v_je_header_id, v_je_batch_id,
            v_journal_name, v_journal_batch, v_batch_name,
            v_period, v_source, v_category,
            v_entered_dr, v_entered_cr, v_accounted_dr, v_accounted_cr,
            v_currency, v_batch_status, v_status_code,
            v_reference, v_approval_status, v_ledger_name,
            v_effective_date, v_posted_date, v_creation_date;
        EXIT WHEN v_cursor%NOTFOUND;

        IF NOT v_first THEN
            v_json := v_json || '','';
        END IF;
        v_first := FALSE;

        v_row_json := ''
        {
            "key": "'' || v_header_sync_id || ''",
            "headerSyncId": '' || v_header_sync_id || '',
            "jeHeaderId": '' || v_je_header_id || '',
            "jeBatchId": '' || NVL(v_je_batch_id, 0) || '',
            "journal": "'' || REPLACE(NVL(v_journal_name, ''''), ''"'', ''\"'') || ''",
            "journalBatch": "'' || REPLACE(NVL(v_journal_batch, ''''), ''"'', ''\"'') || ''",
            "batchName": "'' || REPLACE(NVL(v_batch_name, ''''), ''"'', ''\"'') || ''",
            "accountingPeriod": "'' || NVL(v_period, '''') || ''",
            "source": "'' || NVL(v_source, '''') || ''",
            "category": "'' || NVL(v_category, '''') || ''",
            "journalEnteredDebit": '' || NVL(v_entered_dr, 0) || '',
            "journalEnteredCredit": '' || NVL(v_entered_cr, 0) || '',
            "journalAccountedDebit": '' || NVL(v_accounted_dr, 0) || '',
            "journalAccountedCredit": '' || NVL(v_accounted_cr, 0) || '',
            "currency": "'' || NVL(v_currency, ''USD'') || ''",
            "batchStatus": "'' || NVL(v_batch_status, ''Unknown'') || ''",
            "statusCode": "'' || NVL(v_status_code, '''') || ''",
            "reference": "'' || REPLACE(NVL(v_reference, ''''), ''"'', ''\"'') || ''",
            "approvalStatus": "'' || NVL(v_approval_status, ''Not required'') || ''",
            "ledgerName": "'' || NVL(v_ledger_name, '''') || ''",
            "effectiveDate": "'' || TO_CHAR(v_effective_date, ''YYYY-MM-DD'') || ''",
            "postedDate": "'' || TO_CHAR(v_posted_date, ''YYYY-MM-DD'') || ''",
            "creationDate": "'' || TO_CHAR(v_creation_date, ''YYYY-MM-DD"T"HH24:MI:SS'') || ''"
        }'';

        v_json := v_json || v_row_json;
    END LOOP;

    CLOSE v_cursor;

    v_json := v_json || ''
    ]
}'';

    :status := 200;
    HTP.P(v_json);

EXCEPTION
    WHEN OTHERS THEN
        :status := 500;
        HTP.P(''{"success": false, "error": "'' || REPLACE(SQLERRM, ''"'', ''\"'') || ''"}'');
END;
'
    );
    COMMIT;
END;
/

-- ============================================================
-- GET /gl/journals/:id/lines - Get journal lines by header ID
-- ============================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'gl',
        p_pattern        => 'journals/:id/lines',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_etag_query     => NULL,
        p_comments       => 'Get journal lines by header ID'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'gl',
        p_pattern        => 'journals/:id/lines',
        p_method         => 'GET',
        p_source_type    => 'plsql/block',
        p_items_per_page => 0,
        p_mimes_allowed  => NULL,
        p_comments       => 'Get journal lines for a specific header',
        p_source         => '
DECLARE
    v_cursor        SYS_REFCURSOR;
    v_json          CLOB;
    v_first         BOOLEAN := TRUE;

    v_line_sync_id  NUMBER;
    v_line_num      NUMBER;
    v_header_id     NUMBER;
    v_account       VARCHAR2(750);
    v_description   VARCHAR2(4000);
    v_entered_dr    NUMBER;
    v_entered_cr    NUMBER;
    v_accounted_dr  NUMBER;
    v_accounted_cr  NUMBER;
    v_currency      VARCHAR2(15);
    v_status        VARCHAR2(80);
BEGIN
    v_cursor := RR_MANAGE_JOURNALS_PKG.get_journal_lines(
        p_je_header_id => :id
    );

    v_json := ''{
    "success": true,
    "jeHeaderId": '' || :id || '',
    "lines": ['';

    LOOP
        FETCH v_cursor INTO
            v_line_sync_id, v_line_num, v_header_id,
            v_account, v_description,
            v_entered_dr, v_entered_cr, v_accounted_dr, v_accounted_cr,
            v_currency, v_status;
        EXIT WHEN v_cursor%NOTFOUND;

        IF NOT v_first THEN
            v_json := v_json || '','';
        END IF;
        v_first := FALSE;

        v_json := v_json || ''
        {
            "key": "'' || v_line_sync_id || ''",
            "lineSyncId": '' || v_line_sync_id || '',
            "lineNum": '' || v_line_num || '',
            "jeHeaderId": '' || v_header_id || '',
            "account": "'' || NVL(v_account, '''') || ''",
            "description": "'' || REPLACE(NVL(v_description, ''''), ''"'', ''\"'') || ''",
            "enteredDr": '' || NVL(v_entered_dr, 0) || '',
            "enteredCr": '' || NVL(v_entered_cr, 0) || '',
            "accountedDr": '' || NVL(v_accounted_dr, 0) || '',
            "accountedCr": '' || NVL(v_accounted_cr, 0) || '',
            "currency": "'' || NVL(v_currency, ''USD'') || ''",
            "status": "'' || NVL(v_status, '''') || ''"
        }'';
    END LOOP;

    CLOSE v_cursor;

    v_json := v_json || ''
    ]
}'';

    :status := 200;
    HTP.P(v_json);

EXCEPTION
    WHEN OTHERS THEN
        :status := 500;
        HTP.P(''{"success": false, "error": "'' || REPLACE(SQLERRM, ''"'', ''\"'') || ''"}'');
END;
'
    );
    COMMIT;
END;
/

-- ============================================================
-- GET /gl/lookups/periods - Get distinct periods
-- ============================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'gl',
        p_pattern        => 'lookups/periods',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_comments       => 'Get distinct accounting periods'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'gl',
        p_pattern        => 'lookups/periods',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 0,
        p_mimes_allowed  => NULL,
        p_comments       => 'Get distinct accounting periods for dropdown',
        p_source         => '
            SELECT DISTINCT PERIOD_NAME as "value", PERIOD_NAME as "label"
            FROM RR_GL_JE_HEADERS
            WHERE PERIOD_NAME IS NOT NULL
            ORDER BY PERIOD_NAME DESC
        '
    );
    COMMIT;
END;
/

-- ============================================================
-- GET /gl/lookups/sources - Get distinct sources
-- ============================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'gl',
        p_pattern        => 'lookups/sources',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_comments       => 'Get distinct journal sources'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'gl',
        p_pattern        => 'lookups/sources',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 0,
        p_mimes_allowed  => NULL,
        p_comments       => 'Get distinct journal sources for dropdown',
        p_source         => '
            SELECT DISTINCT USER_JE_SOURCE_NAME as "value", USER_JE_SOURCE_NAME as "label"
            FROM RR_GL_JE_HEADERS
            WHERE USER_JE_SOURCE_NAME IS NOT NULL
            ORDER BY USER_JE_SOURCE_NAME
        '
    );
    COMMIT;
END;
/

-- ============================================================
-- GET /gl/lookups/categories - Get distinct categories
-- ============================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'gl',
        p_pattern        => 'lookups/categories',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_comments       => 'Get distinct journal categories'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'gl',
        p_pattern        => 'lookups/categories',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 0,
        p_mimes_allowed  => NULL,
        p_comments       => 'Get distinct journal categories for dropdown',
        p_source         => '
            SELECT DISTINCT USER_JE_CATEGORY_NAME as "value", USER_JE_CATEGORY_NAME as "label"
            FROM RR_GL_JE_HEADERS
            WHERE USER_JE_CATEGORY_NAME IS NOT NULL
            ORDER BY USER_JE_CATEGORY_NAME
        '
    );
    COMMIT;
END;
/

-- ============================================================
-- GET /gl/lookups/ledgers - Get distinct ledgers
-- ============================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'gl',
        p_pattern        => 'lookups/ledgers',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_comments       => 'Get distinct ledgers'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'gl',
        p_pattern        => 'lookups/ledgers',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 0,
        p_mimes_allowed  => NULL,
        p_comments       => 'Get distinct ledgers for dropdown',
        p_source         => '
            SELECT DISTINCT LEDGER_NAME as "value", LEDGER_NAME as "label"
            FROM RR_GL_JE_HEADERS
            WHERE LEDGER_NAME IS NOT NULL
            ORDER BY LEDGER_NAME
        '
    );
    COMMIT;
END;
/

-- ============================================================
-- GET /gl/lookups/batch-statuses - Get distinct batch statuses
-- ============================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'gl',
        p_pattern        => 'lookups/batch-statuses',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_comments       => 'Get distinct batch statuses'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'gl',
        p_pattern        => 'lookups/batch-statuses',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 0,
        p_mimes_allowed  => NULL,
        p_comments       => 'Get distinct batch statuses for dropdown',
        p_source         => '
            SELECT DISTINCT STATUS_MEANING as "value", STATUS_MEANING as "label"
            FROM RR_GL_JOURNAL_BATCHES
            WHERE STATUS_MEANING IS NOT NULL
            ORDER BY STATUS_MEANING
        '
    );
    COMMIT;
END;
/

COMMIT;
