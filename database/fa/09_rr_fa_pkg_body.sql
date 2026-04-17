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

        v_asset_id         VARCHAR2(100);
        v_asset_number     VARCHAR2(200);
        v_description      VARCHAR2(4000);
        v_asset_type       VARCHAR2(100);
        v_category_id      VARCHAR2(100);
        v_tag_number       VARCHAR2(200);
        v_serial_number    VARCHAR2(200);
        v_manufacturer     VARCHAR2(200);
        v_in_use_flag      VARCHAR2(10);
        v_owned_leased     VARCHAR2(30);
        v_units            VARCHAR2(50);
        v_current_units    VARCHAR2(50);
        v_capitalized_flag VARCHAR2(10);
        v_retired_flag     VARCHAR2(10);
        v_book_type_code   VARCHAR2(100);
        v_date_placed      VARCHAR2(100);
        v_cost             VARCHAR2(100);
        v_adjusted_cost    VARCHAR2(100);
        v_salvage_value    VARCHAR2(100);
        v_deprn_reserve    VARCHAR2(100);
        v_nbv              VARCHAR2(100);
        v_creation_date    VARCHAR2(100);
        v_last_update_date VARCHAR2(100);
    BEGIN
        IF p_asset_number IS NOT NULL THEN
            v_where := v_where || ' AND UPPER(a.ASSET_NUMBER) LIKE UPPER(''%' || p_asset_number || '%'')';
        END IF;
        IF p_description IS NOT NULL THEN
            v_where := v_where || ' AND UPPER(a.DESCRIPTION) LIKE UPPER(''%' || p_description || '%'')';
        END IF;
        IF p_category IS NOT NULL THEN
            v_where := v_where || ' AND a.ASSET_CATEGORY_ID = ''' || p_category || '''';
        END IF;
        IF p_book_type IS NOT NULL THEN
            v_where := v_where || ' AND b.BOOK_TYPE_CODE = ''' || p_book_type || '''';
        END IF;
        IF p_asset_type IS NOT NULL THEN
            v_where := v_where || ' AND a.ASSET_TYPE = ''' || p_asset_type || '''';
        END IF;
        IF p_status = 'RETIRED' THEN
            v_where := v_where || ' AND a.RETIRED_FLAG = ''YES''';
        ELSIF p_status = 'ACTIVE' THEN
            v_where := v_where || ' AND NVL(a.RETIRED_FLAG,''NO'') <> ''YES''';
        END IF;

        v_sql_count :=
            'SELECT COUNT(*) FROM RR_FA_ADDITIONS_TL a '
         || 'LEFT JOIN (SELECT * FROM RR_FA_BOOKS WHERE DATE_INEFFECTIVE IS NULL) b'
         || '  ON a.ASSET_ID = b.ASSET_ID '
         || v_where;

        EXECUTE IMMEDIATE v_sql_count INTO v_total;

        v_sql_main :=
            'SELECT a.ASSET_ID, a.ASSET_NUMBER, a.DESCRIPTION, a.ASSET_TYPE,'
         || '       a.ASSET_CATEGORY_ID, a.TAG_NUMBER, a.SERIAL_NUMBER, a.MANUFACTURER_NAME,'
         || '       a.IN_USE_FLAG, a.OWNED_LEASED, a.UNITS, a.CURRENT_UNITS,'
         || '       a.CAPITALIZED_FLAG, a.RETIRED_FLAG,'
         || '       b.BOOK_TYPE_CODE, b.DATE_PLACED_IN_SERVICE, b.COST, b.ADJUSTED_COST,'
         || '       b.SALVAGE_VALUE,'
         || '       NVL(ds.DEPRN_RESERVE, 0) AS DEPRN_RESERVE,'
         || '       NVL(b.COST,0) - NVL(ds.DEPRN_RESERVE,0) AS NBV,'
         || '       a.CREATION_DATE, a.LAST_UPDATE_DATE'
         || '  FROM RR_FA_ADDITIONS_TL a'
         || '  LEFT JOIN (SELECT * FROM RR_FA_BOOKS WHERE DATE_INEFFECTIVE IS NULL) b'
         || '         ON a.ASSET_ID = b.ASSET_ID'
         || '  LEFT JOIN ('
         || '      SELECT ds1.ASSET_ID, ds1.BOOK_TYPE_CODE, ds1.DEPRN_RESERVE'
         || '        FROM RR_FA_DEPRN_SUMMARY ds1'
         || '       WHERE ds1.PERIOD_COUNTER = ('
         || '           SELECT MAX(ds2.PERIOD_COUNTER) FROM RR_FA_DEPRN_SUMMARY ds2'
         || '            WHERE ds2.ASSET_ID = ds1.ASSET_ID'
         || '              AND ds2.BOOK_TYPE_CODE = ds1.BOOK_TYPE_CODE)'
         || '  ) ds ON a.ASSET_ID = ds.ASSET_ID AND b.BOOK_TYPE_CODE = ds.BOOK_TYPE_CODE'
         || v_where
         || ' ORDER BY a.ASSET_NUMBER'
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
                v_asset_id, v_asset_number, v_description, v_asset_type,
                v_category_id, v_tag_number, v_serial_number, v_manufacturer,
                v_in_use_flag, v_owned_leased, v_units, v_current_units,
                v_capitalized_flag, v_retired_flag,
                v_book_type_code, v_date_placed, v_cost, v_adjusted_cost,
                v_salvage_value, v_deprn_reserve, v_nbv,
                v_creation_date, v_last_update_date;
            EXIT WHEN v_cur%NOTFOUND;

            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('assetId',            v_asset_id);
            APEX_JSON.WRITE('assetNumber',        v_asset_number);
            APEX_JSON.WRITE('description',        v_description);
            APEX_JSON.WRITE('assetType',          v_asset_type);
            APEX_JSON.WRITE('categoryId',         v_category_id);
            APEX_JSON.WRITE('tagNumber',          v_tag_number);
            APEX_JSON.WRITE('serialNumber',       v_serial_number);
            APEX_JSON.WRITE('manufacturer',       v_manufacturer);
            APEX_JSON.WRITE('inUseFlag',          v_in_use_flag);
            APEX_JSON.WRITE('ownedLeased',        v_owned_leased);
            APEX_JSON.WRITE('units',              v_units);
            APEX_JSON.WRITE('currentUnits',       v_current_units);
            APEX_JSON.WRITE('capitalizedFlag',    v_capitalized_flag);
            APEX_JSON.WRITE('retiredFlag',        v_retired_flag);
            APEX_JSON.WRITE('bookTypeCode',       v_book_type_code);
            APEX_JSON.WRITE('datePlacedInService',v_date_placed);
            APEX_JSON.WRITE('cost',               v_cost);
            APEX_JSON.WRITE('adjustedCost',       v_adjusted_cost);
            APEX_JSON.WRITE('salvageValue',       v_salvage_value);
            APEX_JSON.WRITE('deprnReserve',       v_deprn_reserve);
            APEX_JSON.WRITE('nbv',                v_nbv);
            APEX_JSON.WRITE('creationDate',       v_creation_date);
            APEX_JSON.WRITE('lastUpdateDate',     v_last_update_date);
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
        v_asset_id         RR_FA_ADDITIONS_TL.ASSET_ID%TYPE;
        v_asset_number     RR_FA_ADDITIONS_TL.ASSET_NUMBER%TYPE;
        v_asset_type       RR_FA_ADDITIONS_TL.ASSET_TYPE%TYPE;
        v_tag_number       RR_FA_ADDITIONS_TL.TAG_NUMBER%TYPE;
        v_description      RR_FA_ADDITIONS_TL.DESCRIPTION%TYPE;
        v_category_id      RR_FA_ADDITIONS_TL.ASSET_CATEGORY_ID%TYPE;
        v_parent_asset_id  RR_FA_ADDITIONS_TL.PARENT_ASSET_ID%TYPE;
        v_manufacturer     RR_FA_ADDITIONS_TL.MANUFACTURER_NAME%TYPE;
        v_serial_number    RR_FA_ADDITIONS_TL.SERIAL_NUMBER%TYPE;
        v_model_number     RR_FA_ADDITIONS_TL.MODEL_NUMBER%TYPE;
        v_in_use_flag      RR_FA_ADDITIONS_TL.IN_USE_FLAG%TYPE;
        v_owned_leased     RR_FA_ADDITIONS_TL.OWNED_LEASED%TYPE;
        v_new_used         RR_FA_ADDITIONS_TL.NEW_USED%TYPE;
        v_units            RR_FA_ADDITIONS_TL.UNITS%TYPE;
        v_current_units    RR_FA_ADDITIONS_TL.CURRENT_UNITS%TYPE;
        v_inventorial      RR_FA_ADDITIONS_TL.INVENTORIAL%TYPE;
        v_capitalized_flag RR_FA_ADDITIONS_TL.CAPITALIZED_FLAG%TYPE;
        v_retired_flag     RR_FA_ADDITIONS_TL.RETIRED_FLAG%TYPE;
        v_pending_flag     RR_FA_ADDITIONS_TL.PENDING_FLAG%TYPE;
        v_property_type    RR_FA_ADDITIONS_TL.PROPERTY_TYPE_CODE%TYPE;
        v_feeder_system    RR_FA_ADDITIONS_TL.FEEDER_SYSTEM_NAME%TYPE;
        v_creation_date    VARCHAR2(100);
        v_created_by       RR_FA_ADDITIONS_TL.CREATED_BY%TYPE;
        v_last_update_date VARCHAR2(100);
        v_last_updated_by  RR_FA_ADDITIONS_TL.LAST_UPDATED_BY%TYPE;
    BEGIN
        SELECT a.ASSET_ID, a.ASSET_NUMBER, a.ASSET_TYPE, a.TAG_NUMBER, a.DESCRIPTION,
               a.ASSET_CATEGORY_ID, a.PARENT_ASSET_ID, a.MANUFACTURER_NAME, a.SERIAL_NUMBER,
               a.MODEL_NUMBER, a.IN_USE_FLAG, a.OWNED_LEASED, a.NEW_USED,
               a.UNITS, a.CURRENT_UNITS, a.INVENTORIAL, a.CAPITALIZED_FLAG,
               a.RETIRED_FLAG, a.PENDING_FLAG, a.PROPERTY_TYPE_CODE, a.FEEDER_SYSTEM_NAME,
               TO_CHAR(a.CREATION_DATE,   'YYYY-MM-DD'), a.CREATED_BY,
               TO_CHAR(a.LAST_UPDATE_DATE,'YYYY-MM-DD'), a.LAST_UPDATED_BY
        INTO   v_asset_id, v_asset_number, v_asset_type, v_tag_number, v_description,
               v_category_id, v_parent_asset_id, v_manufacturer, v_serial_number,
               v_model_number, v_in_use_flag, v_owned_leased, v_new_used,
               v_units, v_current_units, v_inventorial, v_capitalized_flag,
               v_retired_flag, v_pending_flag, v_property_type, v_feeder_system,
               v_creation_date, v_created_by, v_last_update_date, v_last_updated_by
        FROM   RR_FA_ADDITIONS_TL a
        WHERE  a.ASSET_ID = p_asset_id
        AND    a.LANGUAGE = 'US'
        AND    ROWNUM = 1;

        APEX_JSON.INITIALIZE_CLOB_OUTPUT;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success',          TRUE);
        APEX_JSON.WRITE('assetId',          v_asset_id);
        APEX_JSON.WRITE('assetNumber',      v_asset_number);
        APEX_JSON.WRITE('assetType',        v_asset_type);
        APEX_JSON.WRITE('tagNumber',        v_tag_number);
        APEX_JSON.WRITE('description',      v_description);
        APEX_JSON.WRITE('tlDescription',    v_description);
        APEX_JSON.WRITE('categoryId',       v_category_id);
        APEX_JSON.WRITE('parentAssetId',    v_parent_asset_id);
        APEX_JSON.WRITE('manufacturerName', v_manufacturer);
        APEX_JSON.WRITE('serialNumber',     v_serial_number);
        APEX_JSON.WRITE('modelNumber',      v_model_number);
        APEX_JSON.WRITE('inUseFlag',        v_in_use_flag);
        APEX_JSON.WRITE('ownedLeased',      v_owned_leased);
        APEX_JSON.WRITE('newUsed',          v_new_used);
        APEX_JSON.WRITE('units',            v_units);
        APEX_JSON.WRITE('currentUnits',     v_current_units);
        APEX_JSON.WRITE('inventorial',      v_inventorial);
        APEX_JSON.WRITE('capitalizedFlag',  v_capitalized_flag);
        APEX_JSON.WRITE('retiredFlag',      v_retired_flag);
        APEX_JSON.WRITE('pendingFlag',      v_pending_flag);
        APEX_JSON.WRITE('propertyTypeCode', v_property_type);
        APEX_JSON.WRITE('feederSystemName', v_feeder_system);
        APEX_JSON.WRITE('creationDate',     v_creation_date);
        APEX_JSON.WRITE('createdBy',        v_created_by);
        APEX_JSON.WRITE('lastUpdateDate',   v_last_update_date);
        APEX_JSON.WRITE('lastUpdatedBy',    v_last_updated_by);
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
