-- ============================================================
-- APEX ORDS REST Handler — Currency Rate Lookup
-- Module   : reerp
-- Template : currencies/bmsrate
-- Method   : GET
--
-- Query params:
--   source_cur  VARCHAR2  e.g. USD
--   target_cur  VARCHAR2  e.g. AED
--   rate_type   VARCHAR2  optional, e.g. Corporate (default: any)
--
-- Source table: RR_CURRENCY_DAILY_RATES
--   FROM_CURRENCY, TO_CURRENCY, RATE_DATE, RATE_TYPE,
--   RATE, INVERSE_RATE
--
-- Response shape is identical to the old BMSEXERATE_DAILY handler
-- so no frontend changes are required.
--
-- Response (200):
--   { status, sourceCur, targetCur, rate, inverseRate,
--     buy, open, close, rateType, refreshDate }
-- Response (404):
--   { status:"not_found", sourceCur, targetCur, message }
-- ============================================================

DECLARE
    v_source_cur  VARCHAR2(10);
    v_target_cur  VARCHAR2(10);
    v_rate_type   VARCHAR2(50);
    v_rate        NUMBER;
    v_inverse     NUMBER;
    v_date        VARCHAR2(20);
    v_type_found  VARCHAR2(50);
    v_found       NUMBER := 0;
BEGIN
    :content_type := 'application/json; charset=utf-8';

    v_source_cur := UPPER(TRIM(:source_cur));
    v_target_cur := UPPER(TRIM(:target_cur));
    v_rate_type  := UPPER(TRIM(:rate_type));   -- optional; NULL = any type

    IF v_source_cur IS NULL OR v_target_cur IS NULL THEN
        :status_code := 400;
        HTP.P('{"status":"error","code":400,"message":"Parameters source_cur and target_cur are required"}');
        RETURN;
    END IF;

    -- Same currency → always 1
    IF v_source_cur = v_target_cur THEN
        :status_code := 200;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('status',      'ok');
        APEX_JSON.WRITE('sourceCur',   v_source_cur);
        APEX_JSON.WRITE('targetCur',   v_target_cur);
        APEX_JSON.WRITE('rate',        1);
        APEX_JSON.WRITE('inverseRate', 1);
        APEX_JSON.WRITE('buy',         1);
        APEX_JSON.WRITE('open',        1);
        APEX_JSON.WRITE('close',       1);
        APEX_JSON.WRITE('rateType',    'Corporate');
        APEX_JSON.WRITE('refreshDate', TO_CHAR(SYSDATE, 'YYYY-MM-DD'));
        APEX_JSON.CLOSE_OBJECT;
        RETURN;
    END IF;

    BEGIN
        SELECT RATE, INVERSE_RATE,
               TO_CHAR(RATE_DATE, 'YYYY-MM-DD'),
               RATE_TYPE,
               1
        INTO   v_rate, v_inverse, v_date, v_type_found, v_found
        FROM (
            SELECT RATE, INVERSE_RATE, RATE_DATE, RATE_TYPE
            FROM   RR_CURRENCY_DAILY_RATES
            WHERE  FROM_CURRENCY = v_source_cur
              AND  TO_CURRENCY   = v_target_cur
              AND  (v_rate_type IS NULL OR UPPER(RATE_TYPE) = v_rate_type)
            ORDER BY RATE_DATE DESC
            FETCH FIRST 1 ROW ONLY
        );
    EXCEPTION
        WHEN NO_DATA_FOUND THEN v_found := 0;
    END;

    -- Fallback: try inverse direction and invert the rate
    IF v_found = 0 THEN
        BEGIN
            SELECT 1 / RATE,
                   RATE,
                   TO_CHAR(RATE_DATE, 'YYYY-MM-DD'),
                   RATE_TYPE,
                   1
            INTO   v_rate, v_inverse, v_date, v_type_found, v_found
            FROM (
                SELECT RATE, RATE_DATE, RATE_TYPE
                FROM   RR_CURRENCY_DAILY_RATES
                WHERE  FROM_CURRENCY = v_target_cur
                  AND  TO_CURRENCY   = v_source_cur
                  AND  (v_rate_type IS NULL OR UPPER(RATE_TYPE) = v_rate_type)
                ORDER BY RATE_DATE DESC
                FETCH FIRST 1 ROW ONLY
            );
        EXCEPTION
            WHEN NO_DATA_FOUND THEN v_found := 0;
        END;
    END IF;

    IF v_found = 0 THEN
        :status_code := 404;
        HTP.P('{"status":"not_found","code":404,"sourceCur":"' || v_source_cur
              || '","targetCur":"' || v_target_cur
              || '","message":"No rate found in RR_CURRENCY_DAILY_RATES"}');
        RETURN;
    END IF;

    -- buy / open / close don't exist in RR_CURRENCY_DAILY_RATES;
    -- return RATE for all three so the response shape stays identical.
    :status_code := 200;
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('status',      'ok');
    APEX_JSON.WRITE('sourceCur',   v_source_cur);
    APEX_JSON.WRITE('targetCur',   v_target_cur);
    APEX_JSON.WRITE('rate',        v_rate);
    APEX_JSON.WRITE('inverseRate', v_inverse);
    APEX_JSON.WRITE('buy',         v_rate);   -- no BUY column; mirrors rate
    APEX_JSON.WRITE('open',        v_rate);   -- no OPEN column; mirrors rate
    APEX_JSON.WRITE('close',       v_rate);   -- no CLOSE column; mirrors rate
    APEX_JSON.WRITE('rateType',    v_type_found);
    APEX_JSON.WRITE('refreshDate', v_date);
    APEX_JSON.CLOSE_OBJECT;
EXCEPTION
    WHEN OTHERS THEN
        :status_code := 500;
        HTP.P('{"status":"error","code":500,"message":"' || REPLACE(SQLERRM,'"','\"') || '"}');
END;
