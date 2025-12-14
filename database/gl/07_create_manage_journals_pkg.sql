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
        v_result VARCHAR2(32767);
    BEGIN
        IF p_str IS NULL THEN
            RETURN '';
        END IF;
        v_result := REPLACE(p_str, '\', '\\');
        v_result := REPLACE(v_result, '"', '\"');
        v_result := REPLACE(v_result, CHR(10), '\n');
        v_result := REPLACE(v_result, CHR(13), '\r');
        v_result := REPLACE(v_result, CHR(9), '\t');
        RETURN v_result;
    END escape_json;

    -- Helper procedure to append to CLOB
    PROCEDURE append_clob(p_clob IN OUT NOCOPY CLOB, p_text IN VARCHAR2) IS
    BEGIN
        IF p_text IS NOT NULL AND LENGTH(p_text) > 0 THEN
            DBMS_LOB.WRITEAPPEND(p_clob, LENGTH(p_text), p_text);
        END IF;
    END append_clob;

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

        -- Initialize JSON CLOB
        DBMS_LOB.CREATETEMPORARY(v_json, TRUE);

        -- Build JSON header
        append_clob(v_json, '{"success": true, "totalCount": ');
        append_clob(v_json, TO_CHAR(v_count));
        append_clob(v_json, ', "offset": ');
        append_clob(v_json, TO_CHAR(p_offset));
        append_clob(v_json, ', "limit": ');
        append_clob(v_json, TO_CHAR(p_limit));
        append_clob(v_json, ', "items": [');

        -- Loop through headers
        FOR r_header IN c_headers LOOP
            IF NOT v_first_header THEN
                append_clob(v_json, ',');
            END IF;
            v_first_header := FALSE;

            -- Start header object - batch fields first
            append_clob(v_json, '{"batchId": ');
            append_clob(v_json, NVL(TO_CHAR(r_header.BATCH_ID), 'null'));

            append_clob(v_json, ', "jeBatchId": ');
            append_clob(v_json, NVL(TO_CHAR(r_header.JE_BATCH_ID), 'null'));

            append_clob(v_json, ', "batchName": "');
            append_clob(v_json, escape_json(r_header.BATCH_NAME));
            append_clob(v_json, '"');

            append_clob(v_json, ', "batchDescription": "');
            append_clob(v_json, escape_json(r_header.BATCH_DESCRIPTION));
            append_clob(v_json, '"');

            append_clob(v_json, ', "source": "');
            append_clob(v_json, escape_json(r_header.SOURCE));
            append_clob(v_json, '"');

            append_clob(v_json, ', "status": "');
            append_clob(v_json, escape_json(r_header.STATUS));
            append_clob(v_json, '"');

            append_clob(v_json, ', "statusMeaning": "');
            append_clob(v_json, escape_json(r_header.STATUS_MEANING));
            append_clob(v_json, '"');

            append_clob(v_json, ', "approvalStatusMeaning": "');
            append_clob(v_json, escape_json(r_header.APPROVAL_STATUS_MEANING));
            append_clob(v_json, '"');

            append_clob(v_json, ', "postedDate": ');
            IF r_header.POSTED_DATE IS NULL THEN
                append_clob(v_json, 'null');
            ELSE
                append_clob(v_json, '"' || TO_CHAR(r_header.POSTED_DATE, 'YYYY-MM-DD') || '"');
            END IF;

            -- Header fields
            append_clob(v_json, ', "headerId": ');
            append_clob(v_json, TO_CHAR(r_header.HEADER_ID));

            append_clob(v_json, ', "jeHeaderId": ');
            append_clob(v_json, TO_CHAR(r_header.JE_HEADER_ID));

            append_clob(v_json, ', "journalName": "');
            append_clob(v_json, escape_json(r_header.JOURNAL_NAME));
            append_clob(v_json, '"');

            append_clob(v_json, ', "journalDescription": "');
            append_clob(v_json, escape_json(r_header.JOURNAL_DESCRIPTION));
            append_clob(v_json, '"');

            append_clob(v_json, ', "periodName": "');
            append_clob(v_json, escape_json(r_header.PERIOD_NAME));
            append_clob(v_json, '"');

            append_clob(v_json, ', "category": "');
            append_clob(v_json, escape_json(r_header.CATEGORY));
            append_clob(v_json, '"');

            append_clob(v_json, ', "ledgerName": "');
            append_clob(v_json, escape_json(r_header.LEDGER_NAME));
            append_clob(v_json, '"');

            append_clob(v_json, ', "legalEntityName": "');
            append_clob(v_json, escape_json(r_header.LEGAL_ENTITY_NAME));
            append_clob(v_json, '"');

            append_clob(v_json, ', "currencyCode": "');
            append_clob(v_json, escape_json(r_header.CURRENCY_CODE));
            append_clob(v_json, '"');

            append_clob(v_json, ', "enteredDebit": ');
            append_clob(v_json, NVL(TO_CHAR(r_header.ENTERED_DEBIT), '0'));

            append_clob(v_json, ', "enteredCredit": ');
            append_clob(v_json, NVL(TO_CHAR(r_header.ENTERED_CREDIT), '0'));

            append_clob(v_json, ', "accountedDebit": ');
            append_clob(v_json, NVL(TO_CHAR(r_header.ACCOUNTED_DEBIT), '0'));

            append_clob(v_json, ', "accountedCredit": ');
            append_clob(v_json, NVL(TO_CHAR(r_header.ACCOUNTED_CREDIT), '0'));

            append_clob(v_json, ', "effectiveDate": ');
            IF r_header.EFFECTIVE_DATE IS NULL THEN
                append_clob(v_json, 'null');
            ELSE
                append_clob(v_json, '"' || TO_CHAR(r_header.EFFECTIVE_DATE, 'YYYY-MM-DD') || '"');
            END IF;

            append_clob(v_json, ', "externalReference": "');
            append_clob(v_json, escape_json(r_header.EXTERNAL_REFERENCE));
            append_clob(v_json, '"');

            append_clob(v_json, ', "creationDate": "');
            append_clob(v_json, TO_CHAR(r_header.CREATION_DATE, 'YYYY-MM-DD"T"HH24:MI:SS'));
            append_clob(v_json, '"');

            -- Start lines array
            append_clob(v_json, ', "lines": [');

            -- Loop through lines for this header
            v_first_line := TRUE;
            FOR r_line IN c_lines(r_header.JE_HEADER_ID) LOOP
                IF NOT v_first_line THEN
                    append_clob(v_json, ',');
                END IF;
                v_first_line := FALSE;

                append_clob(v_json, '{"lineId": ');
                append_clob(v_json, TO_CHAR(r_line.LINE_ID));

                append_clob(v_json, ', "lineNum": ');
                append_clob(v_json, TO_CHAR(r_line.LINE_NUM));

                append_clob(v_json, ', "account": "');
                append_clob(v_json, escape_json(r_line.ACCOUNT));
                append_clob(v_json, '"');

                append_clob(v_json, ', "description": "');
                append_clob(v_json, escape_json(r_line.DESCRIPTION));
                append_clob(v_json, '"');

                append_clob(v_json, ', "enteredDr": ');
                append_clob(v_json, NVL(TO_CHAR(r_line.ENTERED_DR), '0'));

                append_clob(v_json, ', "enteredCr": ');
                append_clob(v_json, NVL(TO_CHAR(r_line.ENTERED_CR), '0'));

                append_clob(v_json, ', "accountedDr": ');
                append_clob(v_json, NVL(TO_CHAR(r_line.ACCOUNTED_DR), '0'));

                append_clob(v_json, ', "accountedCr": ');
                append_clob(v_json, NVL(TO_CHAR(r_line.ACCOUNTED_CR), '0'));

                append_clob(v_json, ', "currency": "');
                append_clob(v_json, escape_json(r_line.CURRENCY));
                append_clob(v_json, '"}');
            END LOOP;

            -- Close lines array and header object
            append_clob(v_json, ']}');
        END LOOP;

        -- Close items array and root object
        append_clob(v_json, ']}');

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
