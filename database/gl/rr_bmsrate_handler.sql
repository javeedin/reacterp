-- ============================================================
-- APEX ORDS REST Handler — BMS Exchange Rate Lookup
-- Module   : reerp
-- Template : currencies/bmsrate
-- Method   : GET
--
-- Query params:
--   source_cur  VARCHAR2  e.g. USD
--   target_cur  VARCHAR2  e.g. AED
--
-- Returns the most recent row from BMSEXERATE_DAILY for the
-- given currency pair.  If today has no rate the latest
-- available date is returned automatically.
--
-- Response (200):
--   { status, sourceCur, targetCur, rate, buy, open, close, refreshDate }
-- Response (404):
--   { status:"not_found", sourceCur, targetCur, message }
-- ============================================================

DECLARE
    v_source_cur  VARCHAR2(10);
    v_target_cur  VARCHAR2(10);
    v_rate        NUMBER;
    v_buy         NUMBER;
    v_open        NUMBER;
    v_close       NUMBER;
    v_date        VARCHAR2(20);
    v_found       NUMBER := 0;
BEGIN
    :content_type := 'application/json; charset=utf-8';

    v_source_cur := UPPER(TRIM(:source_cur));
    v_target_cur := UPPER(TRIM(:target_cur));

    IF v_source_cur IS NULL OR v_target_cur IS NULL THEN
        :status_code := 400;
        HTP.P('{"status":"error","code":400,"message":"Parameters source_cur and target_cur are required"}');
        RETURN;
    END IF;

    BEGIN
        SELECT RATE, BUY, OPEN, CLOSE,
               TO_CHAR(REFRESH_DATE, 'YYYY-MM-DD'),
               1
        INTO   v_rate, v_buy, v_open, v_close, v_date, v_found
        FROM (
            SELECT RATE, BUY, OPEN, CLOSE, REFRESH_DATE
            FROM   BMSEXERATE_DAILY
            WHERE  SOURCE_CUR = v_source_cur
              AND  TARGET_CUR = v_target_cur
            ORDER BY REFRESH_DATE DESC
            FETCH FIRST 1 ROW ONLY
        );
    EXCEPTION
        WHEN NO_DATA_FOUND THEN v_found := 0;
    END;

    IF v_found = 0 THEN
        :status_code := 404;
        HTP.P('{"status":"not_found","code":404,"sourceCur":"' || v_source_cur
              || '","targetCur":"' || v_target_cur
              || '","message":"No rate found"}');
        RETURN;
    END IF;

    :status_code := 200;
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('status',      'ok');
    APEX_JSON.WRITE('sourceCur',   v_source_cur);
    APEX_JSON.WRITE('targetCur',   v_target_cur);
    APEX_JSON.WRITE('rate',        v_rate);
    APEX_JSON.WRITE('buy',         v_buy);
    APEX_JSON.WRITE('open',        v_open);
    APEX_JSON.WRITE('close',       v_close);
    APEX_JSON.WRITE('refreshDate', v_date);
    APEX_JSON.CLOSE_OBJECT;
EXCEPTION
    WHEN OTHERS THEN
        :status_code := 500;
        HTP.P('{"status":"error","code":500,"message":"' || REPLACE(SQLERRM,'"','\"') || '"}');
END;
