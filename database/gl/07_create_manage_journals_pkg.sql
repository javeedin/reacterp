-- ============================================================
-- RR_MANAGE_JOURNALS_PKG - Package for Manage Journals API
-- Created for ReactERP - Oracle Fusion Data Sync
-- Tables: RR_GL_JOURNAL_BATCHES, RR_GL_HEADERS, RR_GL_LINES_ALL
-- ============================================================

CREATE OR REPLACE PACKAGE RR_MANAGE_JOURNALS_PKG AS

    -- Search journals with parameters
    FUNCTION search_journals(
        p_journal           IN VARCHAR2 DEFAULT NULL,
        p_journal_operator  IN VARCHAR2 DEFAULT 'Starts with',
        p_batch             IN VARCHAR2 DEFAULT NULL,
        p_batch_operator    IN VARCHAR2 DEFAULT 'Starts with',
        p_period            IN VARCHAR2 DEFAULT NULL,
        p_source            IN VARCHAR2 DEFAULT NULL,
        p_category          IN VARCHAR2 DEFAULT NULL,
        p_ledger            IN VARCHAR2 DEFAULT NULL,
        p_batch_status      IN VARCHAR2 DEFAULT NULL,
        p_offset            IN NUMBER DEFAULT 0,
        p_limit             IN NUMBER DEFAULT 25
    ) RETURN SYS_REFCURSOR;

    -- Get journal lines by header ID
    FUNCTION get_journal_lines(
        p_je_header_id      IN NUMBER
    ) RETURN SYS_REFCURSOR;

    -- Get journal count for pagination
    FUNCTION get_journal_count(
        p_journal           IN VARCHAR2 DEFAULT NULL,
        p_journal_operator  IN VARCHAR2 DEFAULT 'Starts with',
        p_batch             IN VARCHAR2 DEFAULT NULL,
        p_batch_operator    IN VARCHAR2 DEFAULT 'Starts with',
        p_period            IN VARCHAR2 DEFAULT NULL,
        p_source            IN VARCHAR2 DEFAULT NULL,
        p_category          IN VARCHAR2 DEFAULT NULL,
        p_ledger            IN VARCHAR2 DEFAULT NULL,
        p_batch_status      IN VARCHAR2 DEFAULT NULL
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

    -- Helper function to build WHERE clause condition
    FUNCTION build_condition(
        p_column    IN VARCHAR2,
        p_value     IN VARCHAR2,
        p_operator  IN VARCHAR2
    ) RETURN VARCHAR2 IS
        v_condition VARCHAR2(1000);
    BEGIN
        IF p_value IS NULL THEN
            RETURN NULL;
        END IF;

        CASE p_operator
            WHEN 'Starts with' THEN
                v_condition := p_column || ' LIKE ''' || p_value || '%''';
            WHEN 'Ends with' THEN
                v_condition := p_column || ' LIKE ''%' || p_value || '''';
            WHEN 'Contains' THEN
                v_condition := p_column || ' LIKE ''%' || p_value || '%''';
            WHEN 'Equals' THEN
                v_condition := p_column || ' = ''' || p_value || '''';
            ELSE
                v_condition := p_column || ' LIKE ''' || p_value || '%''';
        END CASE;

        RETURN v_condition;
    END build_condition;

    -- Search journals with parameters
    -- Joins RR_GL_HEADERS with RR_GL_JOURNAL_BATCHES
    -- Returns: Journal info from headers + BATCH_DESCRIPTION from batches
    FUNCTION search_journals(
        p_journal           IN VARCHAR2 DEFAULT NULL,
        p_journal_operator  IN VARCHAR2 DEFAULT 'Starts with',
        p_batch             IN VARCHAR2 DEFAULT NULL,
        p_batch_operator    IN VARCHAR2 DEFAULT 'Starts with',
        p_period            IN VARCHAR2 DEFAULT NULL,
        p_source            IN VARCHAR2 DEFAULT NULL,
        p_category          IN VARCHAR2 DEFAULT NULL,
        p_ledger            IN VARCHAR2 DEFAULT NULL,
        p_batch_status      IN VARCHAR2 DEFAULT NULL,
        p_offset            IN NUMBER DEFAULT 0,
        p_limit             IN NUMBER DEFAULT 25
    ) RETURN SYS_REFCURSOR IS
        v_cursor SYS_REFCURSOR;
        v_sql    VARCHAR2(4000);
        v_where  VARCHAR2(2000) := ' WHERE 1=1';
        v_cond   VARCHAR2(500);
    BEGIN
        -- Build base query
        -- h = RR_GL_HEADERS, b = RR_GL_JOURNAL_BATCHES
        v_sql := '
            SELECT
                h.HEADER_ID,
                h.JE_HEADER_ID,
                h.BATCH_ID,
                h.JOURNAL_NAME,
                NVL(b.BATCH_DESCRIPTION, b.BATCH_NAME) AS JOURNAL_BATCH,
                b.BATCH_NAME,
                h.PERIOD_NAME AS ACCOUNTING_PERIOD,
                NULL AS SOURCE,
                h.USER_JE_CATEGORY_NAME AS CATEGORY,
                h.RUNNING_TOTAL_DR AS ENTERED_DEBIT,
                h.RUNNING_TOTAL_CR AS ENTERED_CREDIT,
                h.RUNNING_TOTAL_ACCOUNTED_DR AS ACCOUNTED_DEBIT,
                h.RUNNING_TOTAL_ACCOUNTED_CR AS ACCOUNTED_CREDIT,
                h.CURRENCY_CODE,
                b.STATUS AS BATCH_STATUS,
                b.STATUS AS STATUS_CODE,
                h.EXTERNAL_REFERENCE AS REFERENCE,
                NULL AS APPROVAL_STATUS_MEANING,
                h.LEDGER_NAME,
                h.DEFAULT_EFFECTIVE_DATE,
                b.POSTED_DATE,
                h.CREATION_DATE
            FROM RR_GL_HEADERS h
            LEFT JOIN RR_GL_JOURNAL_BATCHES b ON h.BATCH_ID = b.JE_BATCH_ID
        ';

        -- Build WHERE conditions
        -- Journal name filter
        v_cond := build_condition('UPPER(h.JOURNAL_NAME)', UPPER(p_journal), p_journal_operator);
        IF v_cond IS NOT NULL THEN
            v_where := v_where || ' AND ' || v_cond;
        END IF;

        -- Journal batch filter (from BATCH_DESCRIPTION or BATCH_NAME)
        v_cond := build_condition('UPPER(NVL(b.BATCH_DESCRIPTION, b.BATCH_NAME))', UPPER(p_batch), p_batch_operator);
        IF v_cond IS NOT NULL THEN
            v_where := v_where || ' AND ' || v_cond;
        END IF;

        -- Period filter
        IF p_period IS NOT NULL THEN
            v_where := v_where || ' AND h.PERIOD_NAME = ''' || p_period || '''';
        END IF;

        -- Source filter - commented out as column may not exist
        -- IF p_source IS NOT NULL THEN
        --     v_where := v_where || ' AND b.USER_JE_SOURCE_NAME = ''' || p_source || '''';
        -- END IF;

        -- Category filter (from headers table)
        IF p_category IS NOT NULL THEN
            v_where := v_where || ' AND h.USER_JE_CATEGORY_NAME = ''' || p_category || '''';
        END IF;

        -- Ledger filter
        IF p_ledger IS NOT NULL THEN
            v_where := v_where || ' AND h.LEDGER_NAME = ''' || p_ledger || '''';
        END IF;

        -- Batch status filter (using STATUS instead of STATUS_MEANING)
        IF p_batch_status IS NOT NULL AND p_batch_status != 'All' THEN
            v_where := v_where || ' AND b.STATUS = ''' || p_batch_status || '''';
        END IF;

        -- Add ORDER BY and pagination
        v_sql := v_sql || v_where || '
            ORDER BY h.CREATION_DATE DESC
            OFFSET ' || p_offset || ' ROWS FETCH NEXT ' || p_limit || ' ROWS ONLY';

        OPEN v_cursor FOR v_sql;
        RETURN v_cursor;
    END search_journals;

    -- Get journal lines by header ID
    -- From RR_GL_LINES_ALL table
    FUNCTION get_journal_lines(
        p_je_header_id      IN NUMBER
    ) RETURN SYS_REFCURSOR IS
        v_cursor SYS_REFCURSOR;
    BEGIN
        OPEN v_cursor FOR
            SELECT
                LINE_ID,
                JE_LINE_NUMBER,
                JE_HEADER_ID,
                BATCH_ID,
                ACCOUNT_COMBINATION,
                CHART_OF_ACCOUNTS_NAME,
                DESCRIPTION,
                ENTERED_DR,
                ENTERED_CR,
                ACCOUNTED_DR,
                ACCOUNTED_CR,
                CURRENCY_CODE,
                STAT_AMOUNT,
                REFERENCE1,
                REFERENCE2,
                REFERENCE3,
                REFERENCE4,
                REFERENCE5,
                RECONCILIATION_REFERENCE
            FROM RR_GL_LINES_ALL
            WHERE JE_HEADER_ID = p_je_header_id
            ORDER BY JE_LINE_NUMBER;

        RETURN v_cursor;
    END get_journal_lines;

    -- Get journal count for pagination
    FUNCTION get_journal_count(
        p_journal           IN VARCHAR2 DEFAULT NULL,
        p_journal_operator  IN VARCHAR2 DEFAULT 'Starts with',
        p_batch             IN VARCHAR2 DEFAULT NULL,
        p_batch_operator    IN VARCHAR2 DEFAULT 'Starts with',
        p_period            IN VARCHAR2 DEFAULT NULL,
        p_source            IN VARCHAR2 DEFAULT NULL,
        p_category          IN VARCHAR2 DEFAULT NULL,
        p_ledger            IN VARCHAR2 DEFAULT NULL,
        p_batch_status      IN VARCHAR2 DEFAULT NULL
    ) RETURN NUMBER IS
        v_count  NUMBER;
        v_sql    VARCHAR2(4000);
        v_where  VARCHAR2(2000) := ' WHERE 1=1';
        v_cond   VARCHAR2(500);
    BEGIN
        v_sql := '
            SELECT COUNT(*)
            FROM RR_GL_HEADERS h
            LEFT JOIN RR_GL_JOURNAL_BATCHES b ON h.BATCH_ID = b.JE_BATCH_ID
        ';

        -- Build same WHERE conditions as search
        v_cond := build_condition('UPPER(h.JOURNAL_NAME)', UPPER(p_journal), p_journal_operator);
        IF v_cond IS NOT NULL THEN
            v_where := v_where || ' AND ' || v_cond;
        END IF;

        v_cond := build_condition('UPPER(NVL(b.BATCH_DESCRIPTION, b.BATCH_NAME))', UPPER(p_batch), p_batch_operator);
        IF v_cond IS NOT NULL THEN
            v_where := v_where || ' AND ' || v_cond;
        END IF;

        IF p_period IS NOT NULL THEN
            v_where := v_where || ' AND h.PERIOD_NAME = ''' || p_period || '''';
        END IF;

        -- Source filter - commented out as column may not exist
        -- IF p_source IS NOT NULL THEN
        --     v_where := v_where || ' AND b.USER_JE_SOURCE_NAME = ''' || p_source || '''';
        -- END IF;

        IF p_category IS NOT NULL THEN
            v_where := v_where || ' AND h.USER_JE_CATEGORY_NAME = ''' || p_category || '''';
        END IF;

        IF p_ledger IS NOT NULL THEN
            v_where := v_where || ' AND h.LEDGER_NAME = ''' || p_ledger || '''';
        END IF;

        -- Batch status filter (using STATUS instead of STATUS_MEANING)
        IF p_batch_status IS NOT NULL AND p_batch_status != 'All' THEN
            v_where := v_where || ' AND b.STATUS = ''' || p_batch_status || '''';
        END IF;

        v_sql := v_sql || v_where;

        EXECUTE IMMEDIATE v_sql INTO v_count;
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

    -- Get distinct sources - returns empty as column may not exist
    FUNCTION get_sources RETURN SYS_REFCURSOR IS
        v_cursor SYS_REFCURSOR;
    BEGIN
        OPEN v_cursor FOR
            SELECT 'Manual' AS SOURCE_NAME FROM DUAL
            UNION ALL
            SELECT 'Spreadsheet' AS SOURCE_NAME FROM DUAL
            UNION ALL
            SELECT 'AutoPost' AS SOURCE_NAME FROM DUAL;
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

    -- Get distinct batch statuses from batches (using STATUS instead of STATUS_MEANING)
    FUNCTION get_batch_statuses RETURN SYS_REFCURSOR IS
        v_cursor SYS_REFCURSOR;
    BEGIN
        OPEN v_cursor FOR
            SELECT DISTINCT STATUS
            FROM RR_GL_JOURNAL_BATCHES
            WHERE STATUS IS NOT NULL
            ORDER BY STATUS;
        RETURN v_cursor;
    END get_batch_statuses;

END RR_MANAGE_JOURNALS_PKG;
/
