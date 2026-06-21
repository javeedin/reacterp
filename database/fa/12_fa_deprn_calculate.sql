-- ============================================================
-- 12_FA_DEPRN_CALCULATE.SQL
-- GET  reerp/fa/deprn-periods/current  — last run + open period per book
-- POST reerp/fa/deprn-periods/calculate — stub: mark period as calculated
-- ============================================================

-- ── Template ──────────────────────────────────────────────────────────────────
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'fa/deprn-periods/current',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'FA: current depreciation period status per book'
    );
    COMMIT;
END;
/

-- ── GET fa/deprn-periods/current ──────────────────────────────────────────────
-- Returns one row per book with:
--   lastRunPeriod   — most recent period where DEPRN_RUN = 'Y'
--   openPeriod      — current open period (no close date or latest)
--   periodCloseDate, lastDeprnDate
-- Optional param: ?bookTypeCode=
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'fa/deprn-periods/current',
        p_method         => 'GET',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_source         => q'[
DECLARE
    v_first BOOLEAN := TRUE;

    CURSOR c_books IS
        SELECT DISTINCT BOOK_TYPE_CODE
        FROM   RR_FA_DEPRN_PERIODS
        WHERE  (:bookTypeCode IS NULL OR BOOK_TYPE_CODE = :bookTypeCode)
        ORDER BY BOOK_TYPE_CODE;

    -- Last run period for a book
    FUNCTION last_run_period(p_book VARCHAR2) RETURN VARCHAR2 IS
        v_name RR_FA_DEPRN_PERIODS.PERIOD_NAME%TYPE;
    BEGIN
        SELECT PERIOD_NAME INTO v_name
        FROM   RR_FA_DEPRN_PERIODS
        WHERE  BOOK_TYPE_CODE = p_book
        AND    DEPRN_RUN = 'Y'
        AND    PERIOD_COUNTER = (
            SELECT MAX(PERIOD_COUNTER) FROM RR_FA_DEPRN_PERIODS
            WHERE  BOOK_TYPE_CODE = p_book AND DEPRN_RUN = 'Y')
        AND    ROWNUM = 1;
        RETURN v_name;
    EXCEPTION WHEN NO_DATA_FOUND THEN RETURN NULL;
    END;

    -- Full last-run period row
    FUNCTION last_run(p_book VARCHAR2) RETURN RR_FA_DEPRN_PERIODS%ROWTYPE IS
        v_row RR_FA_DEPRN_PERIODS%ROWTYPE;
    BEGIN
        SELECT * INTO v_row
        FROM   RR_FA_DEPRN_PERIODS
        WHERE  BOOK_TYPE_CODE = p_book
        AND    DEPRN_RUN = 'Y'
        AND    PERIOD_COUNTER = (
            SELECT MAX(PERIOD_COUNTER) FROM RR_FA_DEPRN_PERIODS
            WHERE  BOOK_TYPE_CODE = p_book AND DEPRN_RUN = 'Y')
        AND    ROWNUM = 1;
        RETURN v_row;
    EXCEPTION WHEN NO_DATA_FOUND THEN RETURN NULL;
    END;

    -- Open (next) period — period after the last run, or if no run yet, first period
    FUNCTION open_period(p_book VARCHAR2) RETURN RR_FA_DEPRN_PERIODS%ROWTYPE IS
        v_row     RR_FA_DEPRN_PERIODS%ROWTYPE;
        v_max_run VARCHAR2(400);
    BEGIN
        SELECT MAX(PERIOD_COUNTER) INTO v_max_run
        FROM   RR_FA_DEPRN_PERIODS
        WHERE  BOOK_TYPE_CODE = p_book AND DEPRN_RUN = 'Y';

        IF v_max_run IS NULL THEN
            SELECT * INTO v_row
            FROM   RR_FA_DEPRN_PERIODS
            WHERE  BOOK_TYPE_CODE = p_book
            AND    PERIOD_COUNTER = (SELECT MIN(PERIOD_COUNTER) FROM RR_FA_DEPRN_PERIODS WHERE BOOK_TYPE_CODE = p_book)
            AND    ROWNUM = 1;
        ELSE
            SELECT * INTO v_row
            FROM   RR_FA_DEPRN_PERIODS
            WHERE  BOOK_TYPE_CODE = p_book
            AND    TO_NUMBER(PERIOD_COUNTER) = TO_NUMBER(v_max_run) + 1
            AND    ROWNUM = 1;
        END IF;
        RETURN v_row;
    EXCEPTION WHEN NO_DATA_FOUND THEN RETURN NULL;
    END;

    v_last RR_FA_DEPRN_PERIODS%ROWTYPE;
    v_open RR_FA_DEPRN_PERIODS%ROWTYPE;

    FUNCTION jstr(p VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        IF p IS NULL THEN RETURN 'null'; END IF;
        RETURN '"' || REPLACE(REPLACE(p,'\','\\'),'"','\"') || '"';
    END;

BEGIN
    APEX_JSON.INITIALIZE_CLOB_OUTPUT;
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_ARRAY('items');

    FOR b IN c_books LOOP
        v_last := last_run(b.BOOK_TYPE_CODE);
        v_open := open_period(b.BOOK_TYPE_CODE);

        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('bookTypeCode',          b.BOOK_TYPE_CODE);
        -- Last run period
        APEX_JSON.WRITE('lastRunPeriodCounter',  v_last.PERIOD_COUNTER);
        APEX_JSON.WRITE('lastRunPeriodName',     v_last.PERIOD_NAME);
        APEX_JSON.WRITE('lastRunFiscalYear',     v_last.FISCAL_YEAR);
        APEX_JSON.WRITE('lastRunPeriodNum',      v_last.PERIOD_NUM);
        APEX_JSON.WRITE('lastRunCloseDate',      v_last.PERIOD_CLOSE_DATE);
        APEX_JSON.WRITE('lastDeprnDate',         v_last.LAST_UPDATE_DATE);
        -- Open (next) period
        APEX_JSON.WRITE('openPeriodCounter',     v_open.PERIOD_COUNTER);
        APEX_JSON.WRITE('openPeriodName',        v_open.PERIOD_NAME);
        APEX_JSON.WRITE('openFiscalYear',        v_open.FISCAL_YEAR);
        APEX_JSON.WRITE('openPeriodNum',         v_open.PERIOD_NUM);
        APEX_JSON.WRITE('openPeriodOpenDate',    v_open.PERIOD_OPEN_DATE);
        APEX_JSON.WRITE('openPeriodCloseDate',   v_open.PERIOD_CLOSE_DATE);
        APEX_JSON.WRITE('deprnRun',              v_open.DEPRN_RUN);
        APEX_JSON.CLOSE_OBJECT;
    END LOOP;

    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
    :status := 200;
    :result := APEX_JSON.GET_CLOB_OUTPUT;
    APEX_JSON.FREE_OUTPUT;
EXCEPTION
    WHEN OTHERS THEN
        :status := 500;
        :result := '{"success":false,"error":"' || REPLACE(SQLERRM,'"','\"') || '"}';
END;
]',
        p_mimes_allowed => NULL
    );
    COMMIT;
    DBMS_OUTPUT.PUT_LINE('fa/deprn-periods/current — registered');
END;
/
