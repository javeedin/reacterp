-- ============================================================
-- RR_MANAGE_JOURNALS_PKG - Package for Manage Journals API
-- Created for ReactERP - Oracle Fusion Data Sync
-- Tables: RR_GL_JOURNAL_BATCHES, RR_GL_HEADERS, RR_GL_LINES_ALL
-- Returns nested JSON: Batch fields -> Header fields -> Lines array
-- ============================================================

CREATE OR REPLACE PACKAGE RR_MANAGE_JOURNALS_PKG AS

    -- Search journals and return nested JSON (batch + header + lines)
    FUNCTION search_journals_json(
        p_ledger            IN VARCHAR2,           -- MANDATORY
        p_period            IN VARCHAR2,           -- MANDATORY
        p_batch_name        IN VARCHAR2 DEFAULT NULL,
        p_journal_desc      IN VARCHAR2 DEFAULT NULL,
        p_source            IN VARCHAR2 DEFAULT NULL,
        p_status_meaning    IN VARCHAR2 DEFAULT NULL,
        p_offset            IN NUMBER DEFAULT 0,
        p_limit             IN NUMBER DEFAULT 25
    ) RETURN CLOB;

    -- Get total count for pagination
    FUNCTION get_journal_count(
        p_ledger            IN VARCHAR2,
        p_period            IN VARCHAR2,
        p_batch_name        IN VARCHAR2 DEFAULT NULL,
        p_journal_desc      IN VARCHAR2 DEFAULT NULL,
        p_source            IN VARCHAR2 DEFAULT NULL,
        p_status_meaning    IN VARCHAR2 DEFAULT NULL
    ) RETURN NUMBER;

    -- Get distinct values for dropdowns
    FUNCTION get_periods RETURN SYS_REFCURSOR;
    FUNCTION get_sources RETURN SYS_REFCURSOR;
    FUNCTION get_categories RETURN SYS_REFCURSOR;
    FUNCTION get_ledgers RETURN SYS_REFCURSOR;
    FUNCTION get_batch_statuses RETURN SYS_REFCURSOR;

END RR_MANAGE_JOURNALS_PKG;
/

CREATE OR REPLACE PACKAGE BODY RR_MANAGE_JOURNALS_PKG AS

    -- Helper function to escape JSON string
    FUNCTION escape_json(p_str IN VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        IF p_str IS NULL THEN
            RETURN '';
        END IF;
        RETURN REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(p_str,
            '\', '\\'),
            '"', '\"'),
            CHR(10), '\n'),
            CHR(13), '\r'),
            CHR(9), '\t');
    END escape_json;

    -- Search journals and return nested JSON
    FUNCTION search_journals_json(
        p_ledger            IN VARCHAR2,
        p_period            IN VARCHAR2,
        p_batch_name        IN VARCHAR2 DEFAULT NULL,
        p_journal_desc      IN VARCHAR2 DEFAULT NULL,
        p_source            IN VARCHAR2 DEFAULT NULL,
        p_status_meaning    IN VARCHAR2 DEFAULT NULL,
        p_offset            IN NUMBER DEFAULT 0,
        p_limit             IN NUMBER DEFAULT 25
    ) RETURN CLOB IS
        v_json          CLOB;
        v_count         NUMBER;
        v_first_header  BOOLEAN := TRUE;
        v_first_line    BOOLEAN;

        -- Header cursor with batch info
        CURSOR c_headers IS
            SELECT
                -- Batch fields (from RR_GL_JOURNAL_BATCHES)
                b.BATCH_SYNC_ID AS BATCH_ID,
                b.JE_BATCH_ID,
                b.BATCH_NAME,
                b.BATCH_DESCRIPTION,
                b.USER_JE_SOURCE_NAME AS SOURCE,
                b.STATUS,
                b.STATUS_MEANING,
                b.APPROVAL_STATUS_MEANING,
                b.POSTED_DATE,
                -- Header fields (from RR_GL_HEADERS)
                h.HEADER_ID,
                h.JE_HEADER_ID,
                h.JOURNAL_NAME,
                h.JOURNAL_DESCRIPTION,
                h.PERIOD_NAME,
                h.USER_JE_CATEGORY_NAME AS CATEGORY,
                h.LEDGER_NAME,
                h.LEGAL_ENTITY_NAME,
                h.CURRENCY_CODE,
                h.RUNNING_TOTAL_DR AS ENTERED_DEBIT,
                h.RUNNING_TOTAL_CR AS ENTERED_CREDIT,
                h.RUNNING_TOTAL_ACCOUNTED_DR AS ACCOUNTED_DEBIT,
                h.RUNNING_TOTAL_ACCOUNTED_CR AS ACCOUNTED_CREDIT,
                h.DEFAULT_EFFECTIVE_DATE AS EFFECTIVE_DATE,
                h.EXTERNAL_REFERENCE,
                h.CREATION_DATE
            FROM RR_GL_HEADERS h
            LEFT JOIN RR_GL_JOURNAL_BATCHES b ON h.BATCH_ID = b.JE_BATCH_ID
            WHERE h.LEDGER_NAME = p_ledger
              AND h.PERIOD_NAME = p_period
              AND (p_batch_name IS NULL OR UPPER(b.BATCH_NAME) LIKE '%' || UPPER(p_batch_name) || '%')
              AND (p_journal_desc IS NULL OR UPPER(h.JOURNAL_DESCRIPTION) LIKE '%' || UPPER(p_journal_desc) || '%')
              AND (p_source IS NULL OR b.USER_JE_SOURCE_NAME = p_source)
              AND (p_status_meaning IS NULL OR b.STATUS_MEANING = p_status_meaning)
            ORDER BY h.CREATION_DATE DESC
            OFFSET p_offset ROWS FETCH NEXT p_limit ROWS ONLY;

        -- Line cursor
        CURSOR c_lines(p_je_header_id NUMBER) IS
            SELECT
                LINE_ID,
                JE_LINE_NUMBER AS LINE_NUM,
                ACCOUNT_COMBINATION AS ACCOUNT,
                DESCRIPTION,
                ENTERED_DR,
                ENTERED_CR,
                ACCOUNTED_DR,
                ACCOUNTED_CR,
                CURRENCY_CODE AS CURRENCY
            FROM RR_GL_LINES_ALL
            WHERE JE_HEADER_ID = p_je_header_id
            ORDER BY JE_LINE_NUMBER;

    BEGIN
        -- Get total count
        v_count := get_journal_count(
            p_ledger, p_period, p_batch_name,
            p_journal_desc, p_source, p_status_meaning
        );

        -- Initialize JSON
        DBMS_LOB.CREATETEMPORARY(v_json, TRUE);
        DBMS_LOB.APPEND(v_json, '{
  "success": true,
  "totalCount": ' || v_count || ',
  "offset": ' || p_offset || ',
  "limit": ' || p_limit || ',
  "items": [');

        -- Loop through headers
        FOR r_header IN c_headers LOOP
            IF NOT v_first_header THEN
                DBMS_LOB.APPEND(v_json, ',');
            END IF;
            v_first_header := FALSE;

            -- Start header object with batch fields first
            DBMS_LOB.APPEND(v_json, '
    {
      "batchId": ' || NVL(TO_CHAR(r_header.BATCH_ID), 'null') || ',
      "jeBatchId": ' || NVL(TO_CHAR(r_header.JE_BATCH_ID), 'null') || ',
      "batchName": "' || escape_json(r_header.BATCH_NAME) || '",
      "batchDescription": "' || escape_json(r_header.BATCH_DESCRIPTION) || '",
      "source": "' || escape_json(r_header.SOURCE) || '",
      "status": "' || escape_json(r_header.STATUS) || '",
      "statusMeaning": "' || escape_json(r_header.STATUS_MEANING) || '",
      "approvalStatusMeaning": "' || escape_json(r_header.APPROVAL_STATUS_MEANING) || '",
      "postedDate": ' || CASE WHEN r_header.POSTED_DATE IS NULL THEN 'null' ELSE '"' || TO_CHAR(r_header.POSTED_DATE, 'YYYY-MM-DD') || '"' END || ',
      "headerId": ' || r_header.HEADER_ID || ',
      "jeHeaderId": ' || r_header.JE_HEADER_ID || ',
      "journalName": "' || escape_json(r_header.JOURNAL_NAME) || '",
      "journalDescription": "' || escape_json(r_header.JOURNAL_DESCRIPTION) || '",
      "periodName": "' || escape_json(r_header.PERIOD_NAME) || '",
      "category": "' || escape_json(r_header.CATEGORY) || '",
      "ledgerName": "' || escape_json(r_header.LEDGER_NAME) || '",
      "legalEntityName": "' || escape_json(r_header.LEGAL_ENTITY_NAME) || '",
      "currencyCode": "' || escape_json(r_header.CURRENCY_CODE) || '",
      "enteredDebit": ' || NVL(TO_CHAR(r_header.ENTERED_DEBIT), '0') || ',
      "enteredCredit": ' || NVL(TO_CHAR(r_header.ENTERED_CREDIT), '0') || ',
      "accountedDebit": ' || NVL(TO_CHAR(r_header.ACCOUNTED_DEBIT), '0') || ',
      "accountedCredit": ' || NVL(TO_CHAR(r_header.ACCOUNTED_CREDIT), '0') || ',
      "effectiveDate": ' || CASE WHEN r_header.EFFECTIVE_DATE IS NULL THEN 'null' ELSE '"' || TO_CHAR(r_header.EFFECTIVE_DATE, 'YYYY-MM-DD') || '"' END || ',
      "externalReference": "' || escape_json(r_header.EXTERNAL_REFERENCE) || '",
      "creationDate": "' || TO_CHAR(r_header.CREATION_DATE, 'YYYY-MM-DD"T"HH24:MI:SS') || '",
      "lines": [');

            -- Loop through lines for this header
            v_first_line := TRUE;
            FOR r_line IN c_lines(r_header.JE_HEADER_ID) LOOP
                IF NOT v_first_line THEN
                    DBMS_LOB.APPEND(v_json, ',');
                END IF;
                v_first_line := FALSE;

                DBMS_LOB.APPEND(v_json, '
        {
          "lineId": ' || r_line.LINE_ID || ',
          "lineNum": ' || r_line.LINE_NUM || ',
          "account": "' || escape_json(r_line.ACCOUNT) || '",
          "description": "' || escape_json(r_line.DESCRIPTION) || '",
          "enteredDr": ' || NVL(TO_CHAR(r_line.ENTERED_DR), '0') || ',
          "enteredCr": ' || NVL(TO_CHAR(r_line.ENTERED_CR), '0') || ',
          "accountedDr": ' || NVL(TO_CHAR(r_line.ACCOUNTED_DR), '0') || ',
          "accountedCr": ' || NVL(TO_CHAR(r_line.ACCOUNTED_CR), '0') || ',
          "currency": "' || escape_json(r_line.CURRENCY) || '"
        }');
            END LOOP;

            -- Close lines array and header object
            DBMS_LOB.APPEND(v_json, '
      ]
    }');
        END LOOP;

        -- Close items array and root object
        DBMS_LOB.APPEND(v_json, '
  ]
}');

        RETURN v_json;
    END search_journals_json;

    -- Get total count for pagination
    FUNCTION get_journal_count(
        p_ledger            IN VARCHAR2,
        p_period            IN VARCHAR2,
        p_batch_name        IN VARCHAR2 DEFAULT NULL,
        p_journal_desc      IN VARCHAR2 DEFAULT NULL,
        p_source            IN VARCHAR2 DEFAULT NULL,
        p_status_meaning    IN VARCHAR2 DEFAULT NULL
    ) RETURN NUMBER IS
        v_count NUMBER;
    BEGIN
        SELECT COUNT(*)
        INTO v_count
        FROM RR_GL_HEADERS h
        LEFT JOIN RR_GL_JOURNAL_BATCHES b ON h.BATCH_ID = b.JE_BATCH_ID
        WHERE h.LEDGER_NAME = p_ledger
          AND h.PERIOD_NAME = p_period
          AND (p_batch_name IS NULL OR UPPER(b.BATCH_NAME) LIKE '%' || UPPER(p_batch_name) || '%')
          AND (p_journal_desc IS NULL OR UPPER(h.JOURNAL_DESCRIPTION) LIKE '%' || UPPER(p_journal_desc) || '%')
          AND (p_source IS NULL OR b.USER_JE_SOURCE_NAME = p_source)
          AND (p_status_meaning IS NULL OR b.STATUS_MEANING = p_status_meaning);

        RETURN v_count;
    END get_journal_count;

    -- Get distinct periods from headers
    FUNCTION get_periods RETURN SYS_REFCURSOR IS
        v_cursor SYS_REFCURSOR;
    BEGIN
        OPEN v_cursor FOR
            SELECT DISTINCT PERIOD_NAME
            FROM RR_GL_HEADERS
            WHERE PERIOD_NAME IS NOT NULL
            ORDER BY PERIOD_NAME DESC;
        RETURN v_cursor;
    END get_periods;

    -- Get distinct sources from batches
    FUNCTION get_sources RETURN SYS_REFCURSOR IS
        v_cursor SYS_REFCURSOR;
    BEGIN
        OPEN v_cursor FOR
            SELECT DISTINCT USER_JE_SOURCE_NAME
            FROM RR_GL_JOURNAL_BATCHES
            WHERE USER_JE_SOURCE_NAME IS NOT NULL
            ORDER BY USER_JE_SOURCE_NAME;
        RETURN v_cursor;
    END get_sources;

    -- Get distinct categories from headers
    FUNCTION get_categories RETURN SYS_REFCURSOR IS
        v_cursor SYS_REFCURSOR;
    BEGIN
        OPEN v_cursor FOR
            SELECT DISTINCT USER_JE_CATEGORY_NAME
            FROM RR_GL_HEADERS
            WHERE USER_JE_CATEGORY_NAME IS NOT NULL
            ORDER BY USER_JE_CATEGORY_NAME;
        RETURN v_cursor;
    END get_categories;

    -- Get distinct ledgers from headers
    FUNCTION get_ledgers RETURN SYS_REFCURSOR IS
        v_cursor SYS_REFCURSOR;
    BEGIN
        OPEN v_cursor FOR
            SELECT DISTINCT LEDGER_NAME
            FROM RR_GL_HEADERS
            WHERE LEDGER_NAME IS NOT NULL
            ORDER BY LEDGER_NAME;
        RETURN v_cursor;
    END get_ledgers;

    -- Get distinct batch statuses from batches
    FUNCTION get_batch_statuses RETURN SYS_REFCURSOR IS
        v_cursor SYS_REFCURSOR;
    BEGIN
        OPEN v_cursor FOR
            SELECT DISTINCT STATUS_MEANING
            FROM RR_GL_JOURNAL_BATCHES
            WHERE STATUS_MEANING IS NOT NULL
            ORDER BY STATUS_MEANING;
        RETURN v_cursor;
    END get_batch_statuses;

END RR_MANAGE_JOURNALS_PKG;
/
