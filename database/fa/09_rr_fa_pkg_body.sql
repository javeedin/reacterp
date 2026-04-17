-- =============================================================================
-- 09_RR_FA_PKG_BODY.SQL
-- Package body for RR_FA_PKG.
-- Run 08_rr_fa_pkg_spec.sql first.
-- =============================================================================

CREATE OR REPLACE PACKAGE BODY RR_FA_PKG AS

    -- ── Private helper ────────────────────────────────────────────────────────
    PROCEDURE write_error (
        p_http_status OUT NUMBER,
        p_result      OUT CLOB,
        p_code        IN  NUMBER,
        p_msg         IN  VARCHAR2
    ) IS
    BEGIN
        p_http_status := p_code;
        p_result      := '{"success":false,"error":"' || REPLACE(p_msg, '"', '\"') || '"}';
    END write_error;

    -- ── GET_ASSETS ────────────────────────────────────────────────────────────
    -- Available columns: RR_FA_ADDITIONS_TL (ASSET_ID, DESCRIPTION, CREATION_DATE,
    --   CREATED_BY, LAST_UPDATE_DATE, LAST_UPDATED_BY) + RR_FA_BOOKS (financial).
    -- Filters p_asset_number / p_category / p_asset_type / p_status are silently
    -- ignored — those columns do not exist in the two source tables.
    PROCEDURE GET_ASSETS (
        p_asset_number  IN  VARCHAR2,
        p_description   IN  VARCHAR2,
        p_category      IN  VARCHAR2,
        p_book_type     IN  VARCHAR2,
        p_asset_type    IN  VARCHAR2,
        p_status        IN  VARCHAR2,
        p_offset        IN  NUMBER,
        p_limit         IN  NUMBER,
        p_http_status   OUT NUMBER,
        p_result        OUT CLOB
    ) IS
        v_offset    NUMBER         := NVL(p_offset, 0);
        v_limit     NUMBER         := NVL(p_limit, 25);
        v_total     NUMBER         := 0;
        v_where     VARCHAR2(2000) := ' WHERE a.LANGUAGE = ''US'' ';
        v_sql_count VARCHAR2(4000);
        v_sql_main  VARCHAR2(4000);

        TYPE t_cur IS REF CURSOR;
        v_cur t_cur;

        v_asset_id         VARCHAR2(400);
        v_description      VARCHAR2(400);
        v_creation_date    VARCHAR2(400);
        v_created_by       VARCHAR2(400);
        v_last_update_date VARCHAR2(400);
        v_last_updated_by  VARCHAR2(400);
        v_book_type_code   VARCHAR2(400);
        v_date_placed      VARCHAR2(400);
        v_cost             VARCHAR2(400);
        v_original_cost    VARCHAR2(400);
        v_adjusted_cost    VARCHAR2(400);
        v_salvage_value    VARCHAR2(400);
        v_capitalize_flag  VARCHAR2(400);
        v_depreciate_flag  VARCHAR2(400);
        v_date_ineffective VARCHAR2(400);
        v_deprn_reserve    VARCHAR2(400);
        v_nbv              VARCHAR2(400);
    BEGIN
        -- Only description and book_type_code filters are supported
        IF p_description IS NOT NULL THEN
            v_where := v_where || ' AND UPPER(a.DESCRIPTION) LIKE UPPER(''%' || p_description || '%'')';
        END IF;
        IF p_book_type IS NOT NULL THEN
            v_where := v_where || ' AND b.BOOK_TYPE_CODE = ''' || p_book_type || '''';
        END IF;

        v_sql_count :=
            'SELECT COUNT(*) FROM RR_FA_ADDITIONS_TL a '
         || 'LEFT JOIN (SELECT * FROM RR_FA_BOOKS WHERE DATE_INEFFECTIVE IS NULL) b'
         || '  ON a.ASSET_ID = b.ASSET_ID '
         || v_where;

        EXECUTE IMMEDIATE v_sql_count INTO v_total;

        v_sql_main :=
            'SELECT a.ASSET_ID, a.DESCRIPTION,'
         || '       a.CREATION_DATE, a.CREATED_BY, a.LAST_UPDATE_DATE, a.LAST_UPDATED_BY,'
         || '       b.BOOK_TYPE_CODE, b.DATE_PLACED_IN_SERVICE,'
         || '       b.COST, b.ORIGINAL_COST, b.ADJUSTED_COST, b.SALVAGE_VALUE,'
         || '       b.CAPITALIZE_FLAG, b.DEPRECIATE_FLAG, b.DATE_INEFFECTIVE,'
         || '       NVL(ds.DEPRN_RESERVE, 0) AS DEPRN_RESERVE,'
         || '       NVL(b.COST, 0) - NVL(ds.DEPRN_RESERVE, 0) AS NBV'
         || '  FROM RR_FA_ADDITIONS_TL a'
         || '  LEFT JOIN (SELECT * FROM RR_FA_BOOKS WHERE DATE_INEFFECTIVE IS NULL) b'
         || '         ON a.ASSET_ID = b.ASSET_ID'
         || '  LEFT JOIN ('
         || '      SELECT ds1.ASSET_ID, ds1.BOOK_TYPE_CODE, ds1.DEPRN_RESERVE'
         || '        FROM RR_FA_DEPRN_SUMMARY ds1'
         || '       WHERE ds1.PERIOD_COUNTER = ('
         || '           SELECT MAX(ds2.PERIOD_COUNTER) FROM RR_FA_DEPRN_SUMMARY ds2'
         || '            WHERE ds2.ASSET_ID      = ds1.ASSET_ID'
         || '              AND ds2.BOOK_TYPE_CODE = ds1.BOOK_TYPE_CODE)'
         || '  ) ds ON a.ASSET_ID = ds.ASSET_ID AND b.BOOK_TYPE_CODE = ds.BOOK_TYPE_CODE'
         || v_where
         || ' ORDER BY a.ASSET_ID'
         || ' OFFSET ' || v_offset || ' ROWS FETCH NEXT ' || v_limit || ' ROWS ONLY';

        APEX_JSON.INITIALIZE_CLOB_OUTPUT;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success',    TRUE);
        APEX_JSON.WRITE('totalCount', v_total);
        APEX_JSON.WRITE('offset',     v_offset);
        APEX_JSON.WRITE('limit',      v_limit);
        APEX_JSON.OPEN_ARRAY('items');

        OPEN v_cur FOR v_sql_main;
        LOOP
            FETCH v_cur INTO
                v_asset_id, v_description,
                v_creation_date, v_created_by, v_last_update_date, v_last_updated_by,
                v_book_type_code, v_date_placed,
                v_cost, v_original_cost, v_adjusted_cost, v_salvage_value,
                v_capitalize_flag, v_depreciate_flag, v_date_ineffective,
                v_deprn_reserve, v_nbv;
            EXIT WHEN v_cur%NOTFOUND;

            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('assetId',            v_asset_id);
            APEX_JSON.WRITE('description',        v_description);
            APEX_JSON.WRITE('creationDate',       v_creation_date);
            APEX_JSON.WRITE('createdBy',          v_created_by);
            APEX_JSON.WRITE('lastUpdateDate',     v_last_update_date);
            APEX_JSON.WRITE('lastUpdatedBy',      v_last_updated_by);
            APEX_JSON.WRITE('bookTypeCode',       v_book_type_code);
            APEX_JSON.WRITE('datePlacedInService',v_date_placed);
            APEX_JSON.WRITE('cost',               v_cost);
            APEX_JSON.WRITE('originalCost',       v_original_cost);
            APEX_JSON.WRITE('adjustedCost',       v_adjusted_cost);
            APEX_JSON.WRITE('salvageValue',       v_salvage_value);
            APEX_JSON.WRITE('capitalizeFlag',     v_capitalize_flag);
            APEX_JSON.WRITE('depreciateFlag',     v_depreciate_flag);
            APEX_JSON.WRITE('dateIneffective',    v_date_ineffective);
            APEX_JSON.WRITE('deprnReserve',       v_deprn_reserve);
            APEX_JSON.WRITE('nbv',                v_nbv);
            APEX_JSON.CLOSE_OBJECT;
        END LOOP;
        CLOSE v_cur;

        APEX_JSON.CLOSE_ARRAY;
        APEX_JSON.CLOSE_OBJECT;
        p_http_status := 200;
        p_result      := APEX_JSON.GET_CLOB_OUTPUT;
        APEX_JSON.FREE_OUTPUT;
    EXCEPTION
        WHEN OTHERS THEN
            write_error(p_http_status, p_result, 500, SQLERRM);
    END GET_ASSETS;

    -- ── GET_ASSET_DETAIL ──────────────────────────────────────────────────────
    PROCEDURE GET_ASSET_DETAIL (
        p_asset_id    IN  VARCHAR2,
        p_http_status OUT NUMBER,
        p_result      OUT CLOB
    ) IS
        -- TL columns
        v_asset_id             RR_FA_ADDITIONS_TL.ASSET_ID%TYPE;
        v_description          RR_FA_ADDITIONS_TL.DESCRIPTION%TYPE;
        v_language             RR_FA_ADDITIONS_TL.LANGUAGE%TYPE;
        v_source_lang          RR_FA_ADDITIONS_TL.SOURCE_LANG%TYPE;
        v_tl_creation_date     RR_FA_ADDITIONS_TL.CREATION_DATE%TYPE;
        v_tl_created_by        RR_FA_ADDITIONS_TL.CREATED_BY%TYPE;
        v_tl_last_update_date  RR_FA_ADDITIONS_TL.LAST_UPDATE_DATE%TYPE;
        v_tl_last_updated_by   RR_FA_ADDITIONS_TL.LAST_UPDATED_BY%TYPE;
        -- BOOKS columns
        v_book_type_code       RR_FA_BOOKS.BOOK_TYPE_CODE%TYPE;
        v_date_placed          RR_FA_BOOKS.DATE_PLACED_IN_SERVICE%TYPE;
        v_date_effective       RR_FA_BOOKS.DATE_EFFECTIVE%TYPE;
        v_deprn_start_date     RR_FA_BOOKS.DEPRN_START_DATE%TYPE;
        v_cost                 RR_FA_BOOKS.COST%TYPE;
        v_original_cost        RR_FA_BOOKS.ORIGINAL_COST%TYPE;
        v_adjusted_cost        RR_FA_BOOKS.ADJUSTED_COST%TYPE;
        v_salvage_value        RR_FA_BOOKS.SALVAGE_VALUE%TYPE;
        v_recoverable_cost     RR_FA_BOOKS.RECOVERABLE_COST%TYPE;
        v_unrevalued_cost      RR_FA_BOOKS.UNREVALUED_COST%TYPE;
        v_capitalize_flag      RR_FA_BOOKS.CAPITALIZE_FLAG%TYPE;
        v_depreciate_flag      RR_FA_BOOKS.DEPRECIATE_FLAG%TYPE;
        v_date_ineffective     RR_FA_BOOKS.DATE_INEFFECTIVE%TYPE;
        v_prorate_date         RR_FA_BOOKS.PRORATE_DATE%TYPE;
        v_rate_adj_factor      RR_FA_BOOKS.RATE_ADJUSTMENT_FACTOR%TYPE;
        v_salvage_type         RR_FA_BOOKS.SALVAGE_TYPE%TYPE;
        v_deprn_limit_type     RR_FA_BOOKS.DEPRN_LIMIT_TYPE%TYPE;
        v_cip_cost             RR_FA_BOOKS.CIP_COST%TYPE;
        v_method_id            RR_FA_BOOKS.METHOD_ID%TYPE;
        v_convention_type_id   RR_FA_BOOKS.CONVENTION_TYPE_ID%TYPE;
        v_retirement_id        RR_FA_BOOKS.RETIREMENT_ID%TYPE;
    BEGIN
        SELECT tl.ASSET_ID, tl.DESCRIPTION, tl.LANGUAGE, tl.SOURCE_LANG,
               tl.CREATION_DATE, tl.CREATED_BY, tl.LAST_UPDATE_DATE, tl.LAST_UPDATED_BY,
               b.BOOK_TYPE_CODE, b.DATE_PLACED_IN_SERVICE, b.DATE_EFFECTIVE,
               b.DEPRN_START_DATE, b.COST, b.ORIGINAL_COST, b.ADJUSTED_COST,
               b.SALVAGE_VALUE, b.RECOVERABLE_COST, b.UNREVALUED_COST,
               b.CAPITALIZE_FLAG, b.DEPRECIATE_FLAG, b.DATE_INEFFECTIVE,
               b.PRORATE_DATE, b.RATE_ADJUSTMENT_FACTOR,
               b.SALVAGE_TYPE, b.DEPRN_LIMIT_TYPE, b.CIP_COST,
               b.METHOD_ID, b.CONVENTION_TYPE_ID, b.RETIREMENT_ID
        INTO   v_asset_id, v_description, v_language, v_source_lang,
               v_tl_creation_date, v_tl_created_by, v_tl_last_update_date, v_tl_last_updated_by,
               v_book_type_code, v_date_placed, v_date_effective,
               v_deprn_start_date, v_cost, v_original_cost, v_adjusted_cost,
               v_salvage_value, v_recoverable_cost, v_unrevalued_cost,
               v_capitalize_flag, v_depreciate_flag, v_date_ineffective,
               v_prorate_date, v_rate_adj_factor,
               v_salvage_type, v_deprn_limit_type, v_cip_cost,
               v_method_id, v_convention_type_id, v_retirement_id
        FROM   RR_FA_ADDITIONS_TL tl
        LEFT JOIN RR_FA_BOOKS b
               ON b.ASSET_ID = tl.ASSET_ID AND b.DATE_INEFFECTIVE IS NULL
        WHERE  tl.ASSET_ID = p_asset_id
        AND    tl.LANGUAGE = 'US'
        AND    ROWNUM = 1;

        APEX_JSON.INITIALIZE_CLOB_OUTPUT;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success',             TRUE);
        APEX_JSON.WRITE('assetId',             v_asset_id);
        APEX_JSON.WRITE('description',         v_description);
        APEX_JSON.WRITE('language',            v_language);
        APEX_JSON.WRITE('sourceLang',          v_source_lang);
        APEX_JSON.WRITE('creationDate',        v_tl_creation_date);
        APEX_JSON.WRITE('createdBy',           v_tl_created_by);
        APEX_JSON.WRITE('lastUpdateDate',      v_tl_last_update_date);
        APEX_JSON.WRITE('lastUpdatedBy',       v_tl_last_updated_by);
        APEX_JSON.WRITE('bookTypeCode',        v_book_type_code);
        APEX_JSON.WRITE('datePlacedInService', v_date_placed);
        APEX_JSON.WRITE('dateEffective',       v_date_effective);
        APEX_JSON.WRITE('deprnStartDate',      v_deprn_start_date);
        APEX_JSON.WRITE('cost',                v_cost);
        APEX_JSON.WRITE('originalCost',        v_original_cost);
        APEX_JSON.WRITE('adjustedCost',        v_adjusted_cost);
        APEX_JSON.WRITE('salvageValue',        v_salvage_value);
        APEX_JSON.WRITE('recoverableCost',     v_recoverable_cost);
        APEX_JSON.WRITE('unrevaluedCost',      v_unrevalued_cost);
        APEX_JSON.WRITE('capitalizeFlag',      v_capitalize_flag);
        APEX_JSON.WRITE('depreciateFlag',      v_depreciate_flag);
        APEX_JSON.WRITE('dateIneffective',     v_date_ineffective);
        APEX_JSON.WRITE('prorateDate',         v_prorate_date);
        APEX_JSON.WRITE('rateAdjustmentFactor',v_rate_adj_factor);
        APEX_JSON.WRITE('salvageType',         v_salvage_type);
        APEX_JSON.WRITE('deprnLimitType',      v_deprn_limit_type);
        APEX_JSON.WRITE('cipCost',             v_cip_cost);
        APEX_JSON.WRITE('methodId',            v_method_id);
        APEX_JSON.WRITE('conventionTypeId',    v_convention_type_id);
        APEX_JSON.WRITE('retirementId',        v_retirement_id);
        APEX_JSON.CLOSE_OBJECT;
        p_http_status := 200;
        p_result      := APEX_JSON.GET_CLOB_OUTPUT;
        APEX_JSON.FREE_OUTPUT;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            write_error(p_http_status, p_result, 404, 'Asset ' || p_asset_id || ' not found');
        WHEN OTHERS THEN
            write_error(p_http_status, p_result, 500, SQLERRM);
    END GET_ASSET_DETAIL;

    -- ── GET_ASSET_BOOKS ───────────────────────────────────────────────────────
    PROCEDURE GET_ASSET_BOOKS (
        p_asset_id    IN  VARCHAR2,
        p_http_status OUT NUMBER,
        p_result      OUT CLOB
    ) IS
        CURSOR c_books IS
            SELECT b.BOOK_TYPE_CODE, bc.BOOK_TYPE_NAME,
                   b.DATE_PLACED_IN_SERVICE, b.DATE_EFFECTIVE, b.DEPRN_START_DATE,
                   b.COST, b.ORIGINAL_COST, b.ADJUSTED_COST, b.SALVAGE_VALUE,
                   b.RECOVERABLE_COST, b.DEPRECIATE_FLAG, b.CAPITALIZE_FLAG,
                   b.DATE_INEFFECTIVE, b.RETIREMENT_ID, b.PRORATE_DATE,
                   b.METHOD_ID, m.METHOD_CODE, m.NAME AS METHOD_NAME, m.LIFE_IN_MONTHS,
                   b.CONVENTION_TYPE_ID, b.RATE_ADJUSTMENT_FACTOR,
                   b.SALVAGE_TYPE, b.DEPRN_LIMIT_TYPE, b.CIP_COST, b.UNREVALUED_COST,
                   NVL(ds.DEPRN_RESERVE, 0)                  AS DEPRN_RESERVE,
                   NVL(ds.YTD_DEPRN, 0)                      AS YTD_DEPRN,
                   NVL(b.COST, 0) - NVL(ds.DEPRN_RESERVE, 0) AS NBV
            FROM   RR_FA_BOOKS b
            LEFT JOIN RR_FA_BOOK_CONTROLS bc ON bc.BOOK_TYPE_CODE = b.BOOK_TYPE_CODE
            LEFT JOIN RR_FA_METHODS m        ON m.METHOD_ID       = b.METHOD_ID
            LEFT JOIN (
                SELECT ds1.ASSET_ID, ds1.BOOK_TYPE_CODE, ds1.DEPRN_RESERVE, ds1.YTD_DEPRN
                FROM   RR_FA_DEPRN_SUMMARY ds1
                WHERE  ds1.PERIOD_COUNTER = (
                    SELECT MAX(ds2.PERIOD_COUNTER) FROM RR_FA_DEPRN_SUMMARY ds2
                    WHERE  ds2.ASSET_ID      = ds1.ASSET_ID
                    AND    ds2.BOOK_TYPE_CODE = ds1.BOOK_TYPE_CODE)
            ) ds ON ds.ASSET_ID = b.ASSET_ID AND ds.BOOK_TYPE_CODE = b.BOOK_TYPE_CODE
            WHERE  b.ASSET_ID = p_asset_id
            ORDER BY b.DATE_EFFECTIVE DESC;
    BEGIN
        APEX_JSON.INITIALIZE_CLOB_OUTPUT;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        APEX_JSON.WRITE('assetId', p_asset_id);
        APEX_JSON.OPEN_ARRAY('items');

        FOR r IN c_books LOOP
            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('bookTypeCode',         r.BOOK_TYPE_CODE);
            APEX_JSON.WRITE('bookTypeName',         r.BOOK_TYPE_NAME);
            APEX_JSON.WRITE('datePlacedInService',  r.DATE_PLACED_IN_SERVICE);
            APEX_JSON.WRITE('dateEffective',        r.DATE_EFFECTIVE);
            APEX_JSON.WRITE('deprnStartDate',       r.DEPRN_START_DATE);
            APEX_JSON.WRITE('cost',                 r.COST);
            APEX_JSON.WRITE('originalCost',         r.ORIGINAL_COST);
            APEX_JSON.WRITE('adjustedCost',         r.ADJUSTED_COST);
            APEX_JSON.WRITE('salvageValue',         r.SALVAGE_VALUE);
            APEX_JSON.WRITE('recoverableCost',      r.RECOVERABLE_COST);
            APEX_JSON.WRITE('depreciateFlag',       r.DEPRECIATE_FLAG);
            APEX_JSON.WRITE('capitalizeFlag',       r.CAPITALIZE_FLAG);
            APEX_JSON.WRITE('dateIneffective',      r.DATE_INEFFECTIVE);
            APEX_JSON.WRITE('retirementId',         r.RETIREMENT_ID);
            APEX_JSON.WRITE('prorateDate',          r.PRORATE_DATE);
            APEX_JSON.WRITE('methodId',             r.METHOD_ID);
            APEX_JSON.WRITE('methodCode',           r.METHOD_CODE);
            APEX_JSON.WRITE('methodName',           r.METHOD_NAME);
            APEX_JSON.WRITE('lifeInMonths',         r.LIFE_IN_MONTHS);
            APEX_JSON.WRITE('conventionTypeId',     r.CONVENTION_TYPE_ID);
            APEX_JSON.WRITE('rateAdjustmentFactor', r.RATE_ADJUSTMENT_FACTOR);
            APEX_JSON.WRITE('salvageType',          r.SALVAGE_TYPE);
            APEX_JSON.WRITE('deprnLimitType',       r.DEPRN_LIMIT_TYPE);
            APEX_JSON.WRITE('cipCost',              r.CIP_COST);
            APEX_JSON.WRITE('unrevaluedCost',       r.UNREVALUED_COST);
            APEX_JSON.WRITE('deprnReserve',         r.DEPRN_RESERVE);
            APEX_JSON.WRITE('ytdDeprn',             r.YTD_DEPRN);
            APEX_JSON.WRITE('nbv',                  r.NBV);
            APEX_JSON.CLOSE_OBJECT;
        END LOOP;

        APEX_JSON.CLOSE_ARRAY;
        APEX_JSON.CLOSE_OBJECT;
        p_http_status := 200;
        p_result      := APEX_JSON.GET_CLOB_OUTPUT;
        APEX_JSON.FREE_OUTPUT;
    EXCEPTION
        WHEN OTHERS THEN
            write_error(p_http_status, p_result, 500, SQLERRM);
    END GET_ASSET_BOOKS;

    -- ── GET_ASSET_DEPRN ───────────────────────────────────────────────────────
    PROCEDURE GET_ASSET_DEPRN (
        p_asset_id    IN  VARCHAR2,
        p_http_status OUT NUMBER,
        p_result      OUT CLOB
    ) IS
        CURSOR c_deprn IS
            SELECT ds.ASSET_ID, ds.BOOK_TYPE_CODE, ds.PERIOD_COUNTER,
                   dp.PERIOD_NAME, dp.FISCAL_YEAR, dp.PERIOD_NUM,
                   ds.DEPRN_RUN_DATE, ds.DEPRN_AMOUNT, ds.YTD_DEPRN,
                   ds.DEPRN_RESERVE, ds.ADJUSTED_COST,
                   ds.BONUS_DEPRN_AMOUNT, ds.BONUS_YTD_DEPRN, ds.BONUS_DEPRN_RESERVE,
                   ds.REVAL_RESERVE, ds.IMPAIRMENT_AMOUNT, ds.PRIOR_FY_EXPENSE,
                   ds.DEPRN_SOURCE_CODE,
                   NVL(ds.ADJUSTED_COST, 0) - NVL(ds.DEPRN_RESERVE, 0) AS NBV
            FROM   RR_FA_DEPRN_SUMMARY ds
            LEFT JOIN RR_FA_DEPRN_PERIODS dp
                   ON dp.BOOK_TYPE_CODE  = ds.BOOK_TYPE_CODE
                  AND dp.PERIOD_COUNTER  = ds.PERIOD_COUNTER
            WHERE  ds.ASSET_ID = p_asset_id
            ORDER BY ds.PERIOD_COUNTER DESC;
    BEGIN
        APEX_JSON.INITIALIZE_CLOB_OUTPUT;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        APEX_JSON.WRITE('assetId', p_asset_id);
        APEX_JSON.OPEN_ARRAY('items');

        FOR r IN c_deprn LOOP
            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('assetId',           r.ASSET_ID);
            APEX_JSON.WRITE('bookTypeCode',      r.BOOK_TYPE_CODE);
            APEX_JSON.WRITE('periodCounter',     r.PERIOD_COUNTER);
            APEX_JSON.WRITE('periodName',        r.PERIOD_NAME);
            APEX_JSON.WRITE('fiscalYear',        r.FISCAL_YEAR);
            APEX_JSON.WRITE('periodNum',         r.PERIOD_NUM);
            APEX_JSON.WRITE('deprnRunDate',      r.DEPRN_RUN_DATE);
            APEX_JSON.WRITE('deprnAmount',       r.DEPRN_AMOUNT);
            APEX_JSON.WRITE('ytdDeprn',          r.YTD_DEPRN);
            APEX_JSON.WRITE('deprnReserve',      r.DEPRN_RESERVE);
            APEX_JSON.WRITE('adjustedCost',      r.ADJUSTED_COST);
            APEX_JSON.WRITE('bonusDeprnAmount',  r.BONUS_DEPRN_AMOUNT);
            APEX_JSON.WRITE('bonusYtdDeprn',     r.BONUS_YTD_DEPRN);
            APEX_JSON.WRITE('bonusDeprnReserve', r.BONUS_DEPRN_RESERVE);
            APEX_JSON.WRITE('revalReserve',      r.REVAL_RESERVE);
            APEX_JSON.WRITE('impairmentAmount',  r.IMPAIRMENT_AMOUNT);
            APEX_JSON.WRITE('priorFyExpense',    r.PRIOR_FY_EXPENSE);
            APEX_JSON.WRITE('deprnSourceCode',   r.DEPRN_SOURCE_CODE);
            APEX_JSON.WRITE('nbv',               r.NBV);
            APEX_JSON.CLOSE_OBJECT;
        END LOOP;

        APEX_JSON.CLOSE_ARRAY;
        APEX_JSON.CLOSE_OBJECT;
        p_http_status := 200;
        p_result      := APEX_JSON.GET_CLOB_OUTPUT;
        APEX_JSON.FREE_OUTPUT;
    EXCEPTION
        WHEN OTHERS THEN
            write_error(p_http_status, p_result, 500, SQLERRM);
    END GET_ASSET_DEPRN;

    -- ── GET_ASSET_DISTRIBUTIONS ───────────────────────────────────────────────
    PROCEDURE GET_ASSET_DISTRIBUTIONS (
        p_asset_id    IN  VARCHAR2,
        p_http_status OUT NUMBER,
        p_result      OUT CLOB
    ) IS
        CURSOR c_dist IS
            SELECT d.DISTRIBUTION_ID, d.BOOK_TYPE_CODE,
                   d.UNITS_ASSIGNED, d.TRANSACTION_UNITS,
                   d.CODE_COMBINATION_ID, d.LOCATION_ID,
                   l.SEGMENT1 AS LOC_SEG1, l.SEGMENT2 AS LOC_SEG2, l.SEGMENT3 AS LOC_SEG3,
                   d.TRANSACTION_HEADER_ID_IN, d.TRANSACTION_HEADER_ID_OUT,
                   d.DATE_EFFECTIVE, d.DATE_INEFFECTIVE
            FROM   RR_FA_DISTRIBUTION_HISTORY d
            LEFT JOIN RR_FA_LOCATIONS l ON l.LOCATION_ID = d.LOCATION_ID
            WHERE  d.ASSET_ID = p_asset_id
            ORDER BY d.DATE_EFFECTIVE DESC;
    BEGIN
        APEX_JSON.INITIALIZE_CLOB_OUTPUT;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        APEX_JSON.WRITE('assetId', p_asset_id);
        APEX_JSON.OPEN_ARRAY('items');

        FOR r IN c_dist LOOP
            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('distributionId',        r.DISTRIBUTION_ID);
            APEX_JSON.WRITE('bookTypeCode',          r.BOOK_TYPE_CODE);
            APEX_JSON.WRITE('unitsAssigned',         r.UNITS_ASSIGNED);
            APEX_JSON.WRITE('transactionUnits',      r.TRANSACTION_UNITS);
            APEX_JSON.WRITE('codeCombinationId',     r.CODE_COMBINATION_ID);
            APEX_JSON.WRITE('locationId',            r.LOCATION_ID);
            APEX_JSON.WRITE('locationSeg1',          r.LOC_SEG1);
            APEX_JSON.WRITE('locationSeg2',          r.LOC_SEG2);
            APEX_JSON.WRITE('locationSeg3',          r.LOC_SEG3);
            APEX_JSON.WRITE('transactionHeaderIdIn', r.TRANSACTION_HEADER_ID_IN);
            APEX_JSON.WRITE('transactionHeaderIdOut',r.TRANSACTION_HEADER_ID_OUT);
            APEX_JSON.WRITE('dateEffective',         r.DATE_EFFECTIVE);
            APEX_JSON.WRITE('dateIneffective',       r.DATE_INEFFECTIVE);
            APEX_JSON.CLOSE_OBJECT;
        END LOOP;

        APEX_JSON.CLOSE_ARRAY;
        APEX_JSON.CLOSE_OBJECT;
        p_http_status := 200;
        p_result      := APEX_JSON.GET_CLOB_OUTPUT;
        APEX_JSON.FREE_OUTPUT;
    EXCEPTION
        WHEN OTHERS THEN
            write_error(p_http_status, p_result, 500, SQLERRM);
    END GET_ASSET_DISTRIBUTIONS;

    -- ── GET_ASSET_INVOICES ────────────────────────────────────────────────────
    PROCEDURE GET_ASSET_INVOICES (
        p_asset_id    IN  VARCHAR2,
        p_http_status OUT NUMBER,
        p_result      OUT CLOB
    ) IS
        CURSOR c_inv IS
            SELECT ASSET_INVOICE_ID, BOOK_TYPE_CODE, FIXED_ASSETS_COST,
                   DATE_EFFECTIVE, INVOICE_TRANSACTION_ID_IN, DELETED_FLAG,
                   PAYABLES_CODE_COMBINATION_ID, FEEDER_SYSTEM_NAME,
                   DESCRIPTION, SOURCE_LINE_ID, POST_BATCH_ID
            FROM   RR_FA_ASSET_INVOICES
            WHERE  ASSET_ID = p_asset_id
            AND    NVL(DELETED_FLAG, 'N') = 'N'
            ORDER BY DATE_EFFECTIVE DESC;
    BEGIN
        APEX_JSON.INITIALIZE_CLOB_OUTPUT;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        APEX_JSON.WRITE('assetId', p_asset_id);
        APEX_JSON.OPEN_ARRAY('items');

        FOR r IN c_inv LOOP
            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('assetInvoiceId',           r.ASSET_INVOICE_ID);
            APEX_JSON.WRITE('bookTypeCode',              r.BOOK_TYPE_CODE);
            APEX_JSON.WRITE('fixedAssetsCost',           r.FIXED_ASSETS_COST);
            APEX_JSON.WRITE('dateEffective',             r.DATE_EFFECTIVE);
            APEX_JSON.WRITE('invoiceTransactionIdIn',    r.INVOICE_TRANSACTION_ID_IN);
            APEX_JSON.WRITE('payablesCodeCombinationId', r.PAYABLES_CODE_COMBINATION_ID);
            APEX_JSON.WRITE('feederSystemName',          r.FEEDER_SYSTEM_NAME);
            APEX_JSON.WRITE('description',               r.DESCRIPTION);
            APEX_JSON.WRITE('sourceLineId',              r.SOURCE_LINE_ID);
            APEX_JSON.WRITE('postBatchId',               r.POST_BATCH_ID);
            APEX_JSON.CLOSE_OBJECT;
        END LOOP;

        APEX_JSON.CLOSE_ARRAY;
        APEX_JSON.CLOSE_OBJECT;
        p_http_status := 200;
        p_result      := APEX_JSON.GET_CLOB_OUTPUT;
        APEX_JSON.FREE_OUTPUT;
    EXCEPTION
        WHEN OTHERS THEN
            write_error(p_http_status, p_result, 500, SQLERRM);
    END GET_ASSET_INVOICES;

    -- ── GET_ASSET_TRANSACTIONS ────────────────────────────────────────────────
    PROCEDURE GET_ASSET_TRANSACTIONS (
        p_asset_id    IN  VARCHAR2,
        p_http_status OUT NUMBER,
        p_result      OUT CLOB
    ) IS
        CURSOR c_txn IS
            SELECT TRANSACTION_HEADER_ID, BOOK_TYPE_CODE,
                   TRANSACTION_TYPE_CODE, TRANSACTION_DATE_ENTERED,
                   DATE_EFFECTIVE, INVOICE_TRANSACTION_ID,
                   CALLING_INTERFACE, EVENT_ID, MASS_REFERENCE_ID,
                   CREATION_DATE, CREATED_BY
            FROM   RR_FA_TRANSACTION_HEADERS
            WHERE  ASSET_ID = p_asset_id
            ORDER BY DATE_EFFECTIVE DESC;
    BEGIN
        APEX_JSON.INITIALIZE_CLOB_OUTPUT;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        APEX_JSON.WRITE('assetId', p_asset_id);
        APEX_JSON.OPEN_ARRAY('items');

        FOR r IN c_txn LOOP
            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('transactionHeaderId',  r.TRANSACTION_HEADER_ID);
            APEX_JSON.WRITE('bookTypeCode',         r.BOOK_TYPE_CODE);
            APEX_JSON.WRITE('transactionTypeCode',  r.TRANSACTION_TYPE_CODE);
            APEX_JSON.WRITE('transactionDate',      r.TRANSACTION_DATE_ENTERED);
            APEX_JSON.WRITE('dateEffective',        r.DATE_EFFECTIVE);
            APEX_JSON.WRITE('invoiceTransactionId', r.INVOICE_TRANSACTION_ID);
            APEX_JSON.WRITE('callingInterface',     r.CALLING_INTERFACE);
            APEX_JSON.WRITE('eventId',              r.EVENT_ID);
            APEX_JSON.WRITE('massReferenceId',      r.MASS_REFERENCE_ID);
            APEX_JSON.WRITE('creationDate',         r.CREATION_DATE);
            APEX_JSON.WRITE('createdBy',            r.CREATED_BY);
            APEX_JSON.CLOSE_OBJECT;
        END LOOP;

        APEX_JSON.CLOSE_ARRAY;
        APEX_JSON.CLOSE_OBJECT;
        p_http_status := 200;
        p_result      := APEX_JSON.GET_CLOB_OUTPUT;
        APEX_JSON.FREE_OUTPUT;
    EXCEPTION
        WHEN OTHERS THEN
            write_error(p_http_status, p_result, 500, SQLERRM);
    END GET_ASSET_TRANSACTIONS;

    -- ── Stubs: implemented in 04_fa_get_setup.sql / future body files ─────────

    PROCEDURE GET_CATEGORIES (
        p_http_status OUT NUMBER,
        p_result      OUT CLOB
    ) IS BEGIN write_error(p_http_status, p_result, 501, 'Not implemented in this body'); END;

    PROCEDURE GET_METHODS (
        p_http_status OUT NUMBER,
        p_result      OUT CLOB
    ) IS BEGIN write_error(p_http_status, p_result, 501, 'Not implemented in this body'); END;

    PROCEDURE GET_LOCATIONS (
        p_http_status OUT NUMBER,
        p_result      OUT CLOB
    ) IS BEGIN write_error(p_http_status, p_result, 501, 'Not implemented in this body'); END;

    PROCEDURE GET_BOOK_CONTROLS (
        p_http_status OUT NUMBER,
        p_result      OUT CLOB
    ) IS BEGIN write_error(p_http_status, p_result, 501, 'Not implemented in this body'); END;

    PROCEDURE GET_DEPRN_PERIODS (
        p_book_type   IN  VARCHAR2,
        p_http_status OUT NUMBER,
        p_result      OUT CLOB
    ) IS BEGIN write_error(p_http_status, p_result, 501, 'Not implemented in this body'); END;

    PROCEDURE GET_RETIREMENTS (
        p_book_type   IN  VARCHAR2,
        p_ret_status  IN  VARCHAR2,
        p_http_status OUT NUMBER,
        p_result      OUT CLOB
    ) IS BEGIN write_error(p_http_status, p_result, 501, 'Not implemented in this body'); END;

    PROCEDURE GET_DEPRN_WORKBENCH (
        p_book_type      IN  VARCHAR2,
        p_period_counter IN  VARCHAR2,
        p_asset_number   IN  VARCHAR2,
        p_offset         IN  NUMBER,
        p_limit          IN  NUMBER,
        p_http_status    OUT NUMBER,
        p_result         OUT CLOB
    ) IS BEGIN write_error(p_http_status, p_result, 501, 'Not implemented in this body'); END;

    PROCEDURE CREATE_ASSET (
        p_body        IN  CLOB,
        p_http_status OUT NUMBER,
        p_result      OUT CLOB
    ) IS BEGIN write_error(p_http_status, p_result, 501, 'Not implemented in this body'); END;

    PROCEDURE RETIRE_ASSET (
        p_asset_id    IN  NUMBER,
        p_body        IN  CLOB,
        p_http_status OUT NUMBER,
        p_result      OUT CLOB
    ) IS BEGIN write_error(p_http_status, p_result, 501, 'Not implemented in this body'); END;

    PROCEDURE ADJUST_ASSET (
        p_asset_id    IN  NUMBER,
        p_body        IN  CLOB,
        p_http_status OUT NUMBER,
        p_result      OUT CLOB
    ) IS BEGIN write_error(p_http_status, p_result, 501, 'Not implemented in this body'); END;

END RR_FA_PKG;
/
