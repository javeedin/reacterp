-- =============================================================================
-- 21_FA_DEPRN_POST_ASSET.SQL
-- POST reerp/fa/deprn-post-asset
--
-- Posts depreciation for a SINGLE asset for one period.
-- Body: {
--   "assetId":      "100083",
--   "bookTypeCode": "SB ASSET BOOK",
--   "periodName":   "Apr-2025",    -- MMM-YYYY format
--   "deprnAmount":  23687.46       -- pre-calculated client-side (recalculated server-side as fallback)
-- }
--
-- Returns:
--   200  { success:true,  status:"POSTED",         assetId, periodName, periodCounter, deprnAmount, newReserve }
--   409  { success:false, status:"ALREADY_EXISTS",  assetId, periodName, periodCounter }
--   400  { success:false, error:"..." }
--   500  { success:false, error:"..." }
-- =============================================================================

-- ── Clean up existing handler if any ──────────────────────────────────────────
BEGIN ORDS.DELETE_HANDLER(p_module_name=>'reerp',p_pattern=>'fa/deprn-post-asset',p_method=>'POST'); COMMIT; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN ORDS.DELETE_TEMPLATE(p_module_name=>'reerp',p_pattern=>'fa/deprn-post-asset'); COMMIT; EXCEPTION WHEN OTHERS THEN NULL; END;
/

-- ── Template ──────────────────────────────────────────────────────────────────
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'fa/deprn-post-asset',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'FA: post depreciation for a single asset for one period'
    );
    COMMIT;
END;
/

-- ── POST fa/deprn-post-asset ──────────────────────────────────────────────────
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'fa/deprn-post-asset',
        p_method         => 'POST',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_source         => q'[
DECLARE
    v_body          CLOB    := :body_text;
    v_asset_id      VARCHAR2(400);
    v_book          VARCHAR2(400);
    v_period_name   VARCHAR2(100);
    v_deprn_amount  NUMBER;

    -- Resolved from DB
    v_period_ctr    NUMBER;
    v_fiscal_year   NUMBER;
    v_period_num    NUMBER;
    v_prior_reserve NUMBER := 0;
    v_prior_ytd     NUMBER := 0;
    v_new_reserve   NUMBER;
    v_new_ytd       NUMBER;
    v_calc_deprn    NUMBER := 0;
    v_adjusted_cost NUMBER := 0;
    v_salvage_val   NUMBER := 0;
    v_life_months   NUMBER := 0;
    v_exists        NUMBER := 0;
BEGIN
    -- ── Parse body ──────────────────────────────────────────────────────────
    v_asset_id     := JSON_VALUE(v_body, '$.assetId');
    v_book         := JSON_VALUE(v_body, '$.bookTypeCode');
    v_period_name  := JSON_VALUE(v_body, '$.periodName');
    v_deprn_amount := TO_NUMBER(JSON_VALUE(v_body, '$.deprnAmount'));

    IF v_asset_id IS NULL OR v_book IS NULL OR v_period_name IS NULL THEN
        :status := 400;
        HTP.P('{"success":false,"error":"assetId, bookTypeCode and periodName are required"}');
        RETURN;
    END IF;

    -- ── Resolve period_counter from RR_FA_DEPRN_PERIODS ─────────────────────
    BEGIN
        SELECT TO_NUMBER(PERIOD_COUNTER), TO_NUMBER(FISCAL_YEAR), TO_NUMBER(PERIOD_NUM)
        INTO   v_period_ctr, v_fiscal_year, v_period_num
        FROM   RR_FA_DEPRN_PERIODS
        WHERE  BOOK_TYPE_CODE = v_book
        AND    UPPER(PERIOD_NAME) = UPPER(v_period_name)
        AND    ROWNUM = 1;
    EXCEPTION WHEN NO_DATA_FOUND THEN
        -- Try RR_FA_CALENDAR_PERIODS as fallback
        BEGIN
            SELECT TO_NUMBER(PERIOD_COUNTER), TO_NUMBER(FISCAL_YEAR), TO_NUMBER(PERIOD_NUM)
            INTO   v_period_ctr, v_fiscal_year, v_period_num
            FROM   RR_FA_CALENDAR_PERIODS
            WHERE  UPPER(PERIOD_NAME) = UPPER(v_period_name)
            AND    ROWNUM = 1;
        EXCEPTION WHEN NO_DATA_FOUND THEN
            -- Auto-generate period: max existing + 1, derive FY/period_num from period_name
            SELECT NVL(MAX(TO_NUMBER(PERIOD_COUNTER)), 0) + 1
            INTO   v_period_ctr
            FROM   RR_FA_DEPRN_PERIODS
            WHERE  BOOK_TYPE_CODE = v_book;

            v_fiscal_year := TO_NUMBER(SUBSTR(v_period_name, INSTR(v_period_name,'-')+1));
            -- Map month abbreviation → number
            v_period_num  := CASE UPPER(SUBSTR(v_period_name, 1, 3))
                WHEN 'JAN' THEN 1  WHEN 'FEB' THEN 2  WHEN 'MAR' THEN 3
                WHEN 'APR' THEN 4  WHEN 'MAY' THEN 5  WHEN 'JUN' THEN 6
                WHEN 'JUL' THEN 7  WHEN 'AUG' THEN 8  WHEN 'SEP' THEN 9
                WHEN 'OCT' THEN 10 WHEN 'NOV' THEN 11 WHEN 'DEC' THEN 12
                ELSE 1
            END;
        END;
    END;

    -- ── Check if already posted for this asset + book + period ──────────────
    SELECT COUNT(*) INTO v_exists
    FROM   RR_FA_DEPRN_SUMMARY
    WHERE  ASSET_ID       = v_asset_id
    AND    BOOK_TYPE_CODE = v_book
    AND    PERIOD_COUNTER = v_period_ctr;

    IF v_exists > 0 THEN
        :status := 409;
        HTP.P('{"success":false,"status":"ALREADY_EXISTS"'
            || ',"assetId":"'      || v_asset_id    || '"'
            || ',"bookTypeCode":"' || v_book         || '"'
            || ',"periodName":"'   || v_period_name  || '"'
            || ',"periodCounter":' || v_period_ctr
            || ',"error":"Depreciation already posted for this period"}');
        RETURN;
    END IF;

    -- ── Get prior reserve / YTD from last posted period ─────────────────────
    BEGIN
        SELECT NVL(DEPRN_RESERVE, 0), NVL(YTD_DEPRN, 0)
        INTO   v_prior_reserve, v_prior_ytd
        FROM   RR_FA_DEPRN_SUMMARY
        WHERE  ASSET_ID       = v_asset_id
        AND    BOOK_TYPE_CODE = v_book
        AND    PERIOD_COUNTER = (
            SELECT MAX(TO_NUMBER(PERIOD_COUNTER))
            FROM   RR_FA_DEPRN_SUMMARY
            WHERE  ASSET_ID       = v_asset_id
            AND    BOOK_TYPE_CODE = v_book
        );
    EXCEPTION WHEN NO_DATA_FOUND THEN
        v_prior_reserve := 0;
        v_prior_ytd     := 0;
    END;

    -- ── Recalculate server-side deprn amount (use client value if passed) ───
    BEGIN
        SELECT NVL(b.ADJUSTED_COST, 0), NVL(b.SALVAGE_VALUE, 0), NVL(m.LIFE_IN_MONTHS, 0)
        INTO   v_adjusted_cost, v_salvage_val, v_life_months
        FROM   RR_FA_BOOKS b
        LEFT JOIN RR_FA_METHODS m ON m.METHOD_ID = b.METHOD_ID
        WHERE  b.ASSET_ID       = v_asset_id
        AND    b.BOOK_TYPE_CODE = v_book
        AND    b.DATE_INEFFECTIVE IS NULL
        AND    ROWNUM = 1;

        IF v_life_months > 0 THEN
            v_calc_deprn := ROUND((v_adjusted_cost - v_salvage_val) / v_life_months, 2);
        END IF;
    EXCEPTION WHEN NO_DATA_FOUND THEN NULL;
    END;

    -- Prefer client-supplied amount; fall back to server-calculated
    IF v_deprn_amount IS NULL OR v_deprn_amount = 0 THEN
        v_deprn_amount := v_calc_deprn;
    END IF;

    -- Cap at remaining depreciable amount (cannot go below salvage)
    IF v_prior_reserve + v_deprn_amount > v_adjusted_cost - v_salvage_val THEN
        v_deprn_amount := GREATEST(0, (v_adjusted_cost - v_salvage_val) - v_prior_reserve);
    END IF;

    v_new_reserve := v_prior_reserve + v_deprn_amount;
    v_new_ytd     := v_prior_ytd    + v_deprn_amount;

    -- ── Insert into RR_FA_DEPRN_SUMMARY ─────────────────────────────────────
    INSERT INTO RR_FA_DEPRN_SUMMARY (
        ASSET_ID, BOOK_TYPE_CODE, PERIOD_COUNTER,
        DEPRN_AMOUNT, YTD_DEPRN, DEPRN_RESERVE,
        ADJUSTED_COST, DEPRN_RUN_DATE
    ) VALUES (
        v_asset_id, v_book, v_period_ctr,
        v_deprn_amount, v_new_ytd, v_new_reserve,
        v_adjusted_cost, SYSDATE
    );

    -- ── Ensure period exists in RR_FA_DEPRN_PERIODS ─────────────────────────
    DECLARE v_p_exists NUMBER := 0; BEGIN
        SELECT COUNT(*) INTO v_p_exists
        FROM   RR_FA_DEPRN_PERIODS
        WHERE  BOOK_TYPE_CODE = v_book AND PERIOD_COUNTER = v_period_ctr;

        IF v_p_exists = 0 THEN
            INSERT INTO RR_FA_DEPRN_PERIODS (
                BOOK_TYPE_CODE, PERIOD_COUNTER, PERIOD_NAME,
                FISCAL_YEAR, PERIOD_NUM, PERIOD_OPEN_DATE, DEPRN_RUN
            ) VALUES (
                v_book, v_period_ctr, v_period_name,
                v_fiscal_year, v_period_num,
                TO_CHAR(SYSDATE, 'YYYY-MM-DD"T"HH24:MI:SS".000+00:00"'),
                'Y'
            );
        END IF;
    END;

    COMMIT;

    :status := 200;
    HTP.P('{"success":true,"status":"POSTED"'
        || ',"assetId":"'       || v_asset_id       || '"'
        || ',"bookTypeCode":"'  || v_book            || '"'
        || ',"periodName":"'    || v_period_name     || '"'
        || ',"periodCounter":'  || v_period_ctr
        || ',"deprnAmount":'    || v_deprn_amount
        || ',"newReserve":'     || v_new_reserve
        || ',"newNbv":'         || (v_adjusted_cost - v_new_reserve)
        || '}');

EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        :status := 500;
        HTP.P('{"success":false,"error":"' || REPLACE(SQLERRM,'"','\"') || '"}');
END;
        ]'
    );
    COMMIT;
END;
/
