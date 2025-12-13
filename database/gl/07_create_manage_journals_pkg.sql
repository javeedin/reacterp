-- ============================================================
-- RR_MANAGE_JOURNALS_PKG - Package for Manage Journals API
-- Created for ReactERP - Oracle Fusion Data Sync
-- ============================================================

CREATE OR REPLACE PACKAGE RR_MANAGE_JOURNALS_PKG AS

    -- Type for journal search results
    TYPE t_journal_rec IS RECORD (
        header_sync_id          NUMBER,
        je_header_id            NUMBER,
        je_batch_id             NUMBER,
        journal_name            VARCHAR2(240),
        journal_batch           VARCHAR2(4000),  -- BATCH_DESCRIPTION from batches
        batch_name              VARCHAR2(240),
        accounting_period       VARCHAR2(15),
        source                  VARCHAR2(80),
        category                VARCHAR2(80),
        entered_debit           NUMBER,
        entered_credit          NUMBER,
        accounted_debit         NUMBER,
        accounted_credit        NUMBER,
        currency_code           VARCHAR2(15),
        batch_status            VARCHAR2(80),
        status_code             VARCHAR2(30),
        reference               VARCHAR2(240),
        approval_status         VARCHAR2(80),
        ledger_name             VARCHAR2(240),
        effective_date          DATE,
        posted_date             DATE,
        creation_date           TIMESTAMP
    );

    TYPE t_journal_tab IS TABLE OF t_journal_rec;

    -- Type for journal lines
    TYPE t_line_rec IS RECORD (
        line_sync_id            NUMBER,
        je_line_num             NUMBER,
        je_header_id            NUMBER,
        account                 VARCHAR2(750),
        description             VARCHAR2(4000),
        entered_dr              NUMBER,
        entered_cr              NUMBER,
        accounted_dr            NUMBER,
        accounted_cr            NUMBER,
        currency_code           VARCHAR2(15),
        status                  VARCHAR2(80)
    );

    TYPE t_line_tab IS TABLE OF t_line_rec;

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
        v_sql := '
            SELECT
                h.HEADER_SYNC_ID,
                h.JE_HEADER_ID,
                h.JE_BATCH_ID,
                h.JE_HEADER_NAME AS JOURNAL_NAME,
                NVL(b.BATCH_DESCRIPTION, b.BATCH_NAME) AS JOURNAL_BATCH,
                b.BATCH_NAME,
                h.PERIOD_NAME AS ACCOUNTING_PERIOD,
                h.USER_JE_SOURCE_NAME AS SOURCE,
                h.USER_JE_CATEGORY_NAME AS CATEGORY,
                h.RUNNING_TOTAL_DR AS ENTERED_DEBIT,
                h.RUNNING_TOTAL_CR AS ENTERED_CREDIT,
                h.RUNNING_TOTAL_ACCOUNTED_DR AS ACCOUNTED_DEBIT,
                h.RUNNING_TOTAL_ACCOUNTED_CR AS ACCOUNTED_CREDIT,
                h.CURRENCY_CODE,
                b.STATUS_MEANING AS BATCH_STATUS,
                h.STATUS AS STATUS_CODE,
                h.EXTERNAL_REFERENCE AS REFERENCE,
                h.APPROVAL_STATUS_MEANING,
                h.LEDGER_NAME,
                h.DEFAULT_EFFECTIVE_DATE,
                h.POSTED_DATE,
                h.CREATION_DATE
            FROM RR_GL_JE_HEADERS h
            LEFT JOIN RR_GL_JOURNAL_BATCHES b ON h.JE_BATCH_ID = b.JE_BATCH_ID
        ';

        -- Build WHERE conditions
        v_cond := build_condition('UPPER(h.JE_HEADER_NAME)', UPPER(p_journal), p_journal_operator);
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

        IF p_source IS NOT NULL THEN
            v_where := v_where || ' AND h.USER_JE_SOURCE_NAME = ''' || p_source || '''';
        END IF;

        IF p_category IS NOT NULL THEN
            v_where := v_where || ' AND h.USER_JE_CATEGORY_NAME = ''' || p_category || '''';
        END IF;

        IF p_ledger IS NOT NULL THEN
            v_where := v_where || ' AND h.LEDGER_NAME = ''' || p_ledger || '''';
        END IF;

        IF p_batch_status IS NOT NULL AND p_batch_status != 'All' THEN
            v_where := v_where || ' AND b.STATUS_MEANING = ''' || p_batch_status || '''';
        END IF;

        -- Add ORDER BY and pagination
        v_sql := v_sql || v_where || '
            ORDER BY h.CREATION_DATE DESC
            OFFSET ' || p_offset || ' ROWS FETCH NEXT ' || p_limit || ' ROWS ONLY';

        OPEN v_cursor FOR v_sql;
        RETURN v_cursor;
    END search_journals;

    -- Get journal lines by header ID
    FUNCTION get_journal_lines(
        p_je_header_id      IN NUMBER
    ) RETURN SYS_REFCURSOR IS
        v_cursor SYS_REFCURSOR;
    BEGIN
        OPEN v_cursor FOR
            SELECT
                LINE_SYNC_ID,
                JE_LINE_NUM,
                JE_HEADER_ID,
                CONCATENATED_SEGMENTS AS ACCOUNT,
                DESCRIPTION,
                ENTERED_DR,
                ENTERED_CR,
                ACCOUNTED_DR,
                ACCOUNTED_CR,
                CURRENCY_CODE,
                STATUS_MEANING AS STATUS
            FROM RR_GL_JE_LINES_ALL
            WHERE JE_HEADER_ID = p_je_header_id
            ORDER BY JE_LINE_NUM;

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
            FROM RR_GL_JE_HEADERS h
            LEFT JOIN RR_GL_JOURNAL_BATCHES b ON h.JE_BATCH_ID = b.JE_BATCH_ID
        ';

        -- Build same WHERE conditions as search
        v_cond := build_condition('UPPER(h.JE_HEADER_NAME)', UPPER(p_journal), p_journal_operator);
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

        IF p_source IS NOT NULL THEN
            v_where := v_where || ' AND h.USER_JE_SOURCE_NAME = ''' || p_source || '''';
        END IF;

        IF p_category IS NOT NULL THEN
            v_where := v_where || ' AND h.USER_JE_CATEGORY_NAME = ''' || p_category || '''';
        END IF;

        IF p_ledger IS NOT NULL THEN
            v_where := v_where || ' AND h.LEDGER_NAME = ''' || p_ledger || '''';
        END IF;

        IF p_batch_status IS NOT NULL AND p_batch_status != 'All' THEN
            v_where := v_where || ' AND b.STATUS_MEANING = ''' || p_batch_status || '''';
        END IF;

        v_sql := v_sql || v_where;

        EXECUTE IMMEDIATE v_sql INTO v_count;
        RETURN v_count;
    END get_journal_count;

    -- Get distinct periods
    FUNCTION get_periods RETURN SYS_REFCURSOR IS
        v_cursor SYS_REFCURSOR;
    BEGIN
        OPEN v_cursor FOR
            SELECT DISTINCT PERIOD_NAME
            FROM RR_GL_JE_HEADERS
            WHERE PERIOD_NAME IS NOT NULL
            ORDER BY PERIOD_NAME DESC;
        RETURN v_cursor;
    END get_periods;

    -- Get distinct sources
    FUNCTION get_sources RETURN SYS_REFCURSOR IS
        v_cursor SYS_REFCURSOR;
    BEGIN
        OPEN v_cursor FOR
            SELECT DISTINCT USER_JE_SOURCE_NAME
            FROM RR_GL_JE_HEADERS
            WHERE USER_JE_SOURCE_NAME IS NOT NULL
            ORDER BY USER_JE_SOURCE_NAME;
        RETURN v_cursor;
    END get_sources;

    -- Get distinct categories
    FUNCTION get_categories RETURN SYS_REFCURSOR IS
        v_cursor SYS_REFCURSOR;
    BEGIN
        OPEN v_cursor FOR
            SELECT DISTINCT USER_JE_CATEGORY_NAME
            FROM RR_GL_JE_HEADERS
            WHERE USER_JE_CATEGORY_NAME IS NOT NULL
            ORDER BY USER_JE_CATEGORY_NAME;
        RETURN v_cursor;
    END get_categories;

    -- Get distinct ledgers
    FUNCTION get_ledgers RETURN SYS_REFCURSOR IS
        v_cursor SYS_REFCURSOR;
    BEGIN
        OPEN v_cursor FOR
            SELECT DISTINCT LEDGER_NAME
            FROM RR_GL_JE_HEADERS
            WHERE LEDGER_NAME IS NOT NULL
            ORDER BY LEDGER_NAME;
        RETURN v_cursor;
    END get_ledgers;

    -- Get distinct batch statuses
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
