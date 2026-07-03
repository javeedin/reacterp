-- =============================================================================
-- 28_FA_ASSET_ATTRIBUTES.SQL
--
-- 1. Add ATTRIBUTE1–10 columns to RR_FA_ADDITIONS (safe re-run)
-- 2. Update GET_ASSET_DETAIL in RR_FA_PKG to return all attributes
-- 3. New ORDS handler: PUT fa/assets/:assetId/attributes
-- =============================================================================

-- ── 1. Add attribute columns ──────────────────────────────────────────────────
DECLARE
    PROCEDURE add_col (p_col VARCHAR2) IS
        v_exists NUMBER;
    BEGIN
        SELECT COUNT(*) INTO v_exists FROM USER_TAB_COLUMNS
        WHERE  TABLE_NAME = 'RR_FA_ADDITIONS' AND COLUMN_NAME = UPPER(p_col);
        IF v_exists = 0 THEN
            EXECUTE IMMEDIATE 'ALTER TABLE RR_FA_ADDITIONS ADD (' || p_col || ' VARCHAR2(150))';
        END IF;
    END;
BEGIN
    add_col('ATTRIBUTE1');
    add_col('ATTRIBUTE2');
    add_col('ATTRIBUTE3');
    add_col('ATTRIBUTE4');
    add_col('ATTRIBUTE5');
    add_col('ATTRIBUTE6');
    add_col('ATTRIBUTE7');
    add_col('ATTRIBUTE8');
    add_col('ATTRIBUTE9');
    add_col('ATTRIBUTE10');
END;
/

-- ── 2. Rebuild RR_FA_PKG body — adds attributes to GET_ASSET_DETAIL ──────────
-- Only rebuilding the sections that changed; the rest is unchanged from 09.
CREATE OR REPLACE PACKAGE BODY RR_FA_PKG AS

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

    FUNCTION jstr(p_val IN VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        IF p_val IS NULL THEN RETURN 'null'; END IF;
        RETURN '"' || REPLACE(REPLACE(p_val, '\', '\\'), '"', '\"') || '"';
    END jstr;

    -- ── GET_ASSETS ────────────────────────────────────────────────────────────
    PROCEDURE GET_ASSETS (
        p_description  IN  VARCHAR2,
        p_book_type    IN  VARCHAR2,
        p_asset_number IN  VARCHAR2,
        p_http_status  OUT NUMBER,
        p_result       OUT CLOB
    ) IS
        TYPE t_asset_rec IS RECORD (
            ASSET_ID              VARCHAR2(400),
            ASSET_NUMBER          VARCHAR2(400),
            DESCRIPTION           VARCHAR2(400),
            ASSET_CATEGORY_ID     VARCHAR2(400),
            ASSET_TYPE            VARCHAR2(400),
            IN_USE_FLAG           VARCHAR2(400),
            OWNED_LEASED          VARCHAR2(400),
            UNITS                 VARCHAR2(400),
            CAPITALIZED_FLAG      VARCHAR2(400),
            RETIRED_FLAG          VARCHAR2(400),
            TAG_NUMBER            VARCHAR2(400),
            SERIAL_NUMBER         VARCHAR2(400),
            BOOK_TYPE_CODE        VARCHAR2(400),
            DATE_PLACED_IN_SERVICE VARCHAR2(400),
            COST                  VARCHAR2(400),
            ORIGINAL_COST         VARCHAR2(400),
            ADJUSTED_COST         VARCHAR2(400),
            SALVAGE_VALUE         VARCHAR2(400),
            RECOVERABLE_COST      VARCHAR2(400),
            DEPRECIATE_FLAG       VARCHAR2(400),
            CAPITALIZE_FLAG       VARCHAR2(400),
            DATE_INEFFECTIVE      VARCHAR2(400),
            RETIREMENT_ID         VARCHAR2(400),
            DEPRN_RESERVE         VARCHAR2(400),
            NBV                   VARCHAR2(400),
            ACCOUNTED_STATUS      VARCHAR2(400),
            ACCOUNTED_DATE        VARCHAR2(400),
            CREATION_DATE         VARCHAR2(400),
            CREATED_BY            VARCHAR2(400),
            LAST_UPDATE_DATE      VARCHAR2(400),
            LAST_UPDATED_BY       VARCHAR2(400)
        );
        TYPE t_asset_tab IS TABLE OF t_asset_rec;
        v_assets t_asset_tab;
    BEGIN
        SELECT a.ASSET_ID, a.ASSET_NUMBER, tl.DESCRIPTION, a.ASSET_CATEGORY_ID,
               a.ASSET_TYPE, a.IN_USE_FLAG, a.OWNED_LEASED, a.UNITS,
               a.CAPITALIZED_FLAG, a.RETIRED_FLAG, a.TAG_NUMBER, a.SERIAL_NUMBER,
               b.BOOK_TYPE_CODE, b.DATE_PLACED_IN_SERVICE, b.COST, b.ORIGINAL_COST,
               b.ADJUSTED_COST, b.SALVAGE_VALUE, b.RECOVERABLE_COST,
               b.DEPRECIATE_FLAG, b.CAPITALIZE_FLAG,
               b.DATE_INEFFECTIVE, b.RETIREMENT_ID,
               ds.DEPRN_RESERVE,
               b.ADJUSTED_COST - NVL(ds.DEPRN_RESERVE, 0),
               a.ACCOUNTED_STATUS, TO_CHAR(a.ACCOUNTED_DATE, 'YYYY-MM-DD'),
               a.CREATION_DATE, a.CREATED_BY, a.LAST_UPDATE_DATE, a.LAST_UPDATED_BY
        BULK COLLECT INTO v_assets
        FROM   RR_FA_ADDITIONS a
        LEFT JOIN RR_FA_ADDITIONS_TL tl ON tl.ASSET_ID = a.ASSET_ID AND tl.LANGUAGE = 'US'
        LEFT JOIN RR_FA_BOOKS b
               ON b.ASSET_ID = a.ASSET_ID
               AND b.DATE_INEFFECTIVE IS NULL
               AND (p_book_type IS NULL OR UPPER(b.BOOK_TYPE_CODE) = UPPER(p_book_type))
        LEFT JOIN (
            SELECT ASSET_ID, BOOK_TYPE_CODE, MAX(DEPRN_RESERVE) AS DEPRN_RESERVE
            FROM   RR_FA_DEPRN_SUMMARY
            GROUP BY ASSET_ID, BOOK_TYPE_CODE
        ) ds ON ds.ASSET_ID = a.ASSET_ID AND ds.BOOK_TYPE_CODE = b.BOOK_TYPE_CODE
        WHERE  (p_description  IS NULL OR UPPER(tl.DESCRIPTION)  LIKE '%' || UPPER(p_description)  || '%')
        AND    (p_asset_number IS NULL OR a.ASSET_NUMBER         LIKE '%' || p_asset_number || '%');

        p_http_status := 200;
        p_result := '[';
        FOR i IN 1..v_assets.COUNT LOOP
            IF i > 1 THEN p_result := p_result || ','; END IF;
            DECLARE r t_asset_rec := v_assets(i);
            BEGIN
                p_result := p_result || '{'
                    || '"assetId":'             || jstr(r.ASSET_ID)
                    || ',"asset_number":'       || jstr(r.ASSET_NUMBER)
                    || ',"description":'        || jstr(r.DESCRIPTION)
                    || ',"assetCategoryId":'    || jstr(r.ASSET_CATEGORY_ID)
                    || ',"assetType":'          || jstr(r.ASSET_TYPE)
                    || ',"inUseFlag":'          || jstr(r.IN_USE_FLAG)
                    || ',"ownedLeased":'        || jstr(r.OWNED_LEASED)
                    || ',"units":'              || jstr(r.UNITS)
                    || ',"capitalizedFlag":'    || jstr(r.CAPITALIZED_FLAG)
                    || ',"retiredFlag":'        || jstr(r.RETIRED_FLAG)
                    || ',"tagNumber":'          || jstr(r.TAG_NUMBER)
                    || ',"serialNumber":'       || jstr(r.SERIAL_NUMBER)
                    || ',"bookTypeCode":'       || jstr(r.BOOK_TYPE_CODE)
                    || ',"datePlacedInService":'|| jstr(r.DATE_PLACED_IN_SERVICE)
                    || ',"cost":'              || jstr(r.COST)
                    || ',"originalCost":'       || jstr(r.ORIGINAL_COST)
                    || ',"adjustedCost":'       || jstr(r.ADJUSTED_COST)
                    || ',"salvageValue":'       || jstr(r.SALVAGE_VALUE)
                    || ',"recoverableCost":'    || jstr(r.RECOVERABLE_COST)
                    || ',"depreciateFlag":'     || jstr(r.DEPRECIATE_FLAG)
                    || ',"capitalizeFlag":'     || jstr(r.CAPITALIZE_FLAG)
                    || ',"dateIneffective":'    || jstr(r.DATE_INEFFECTIVE)
                    || ',"retirementId":'       || jstr(r.RETIREMENT_ID)
                    || ',"deprnReserve":'       || jstr(r.DEPRN_RESERVE)
                    || ',"nbv":'               || jstr(r.NBV)
                    || ',"accountedStatus":'    || jstr(r.ACCOUNTED_STATUS)
                    || ',"accountedDate":'      || jstr(r.ACCOUNTED_DATE)
                    || ',"creationDate":'       || jstr(r.CREATION_DATE)
                    || ',"createdBy":'          || jstr(r.CREATED_BY)
                    || ',"lastUpdateDate":'     || jstr(r.LAST_UPDATE_DATE)
                    || ',"lastUpdatedBy":'      || jstr(r.LAST_UPDATED_BY)
                    || '}';
            END;
        END LOOP;
        p_result := p_result || ']';
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
        v_asset_id           VARCHAR2(400);
        v_asset_number       VARCHAR2(400);
        v_description        VARCHAR2(400);
        v_asset_type         VARCHAR2(400);
        v_tag_number         VARCHAR2(400);
        v_serial_number      VARCHAR2(400);
        v_manufacturer       VARCHAR2(400);
        v_model_number       VARCHAR2(400);
        v_in_use_flag        VARCHAR2(400);
        v_owned_leased       VARCHAR2(400);
        v_new_used           VARCHAR2(400);
        v_units              VARCHAR2(400);
        v_capitalized_flag   VARCHAR2(400);
        v_property_type      VARCHAR2(400);
        v_feeder_system      VARCHAR2(400);
        v_asset_category_id  VARCHAR2(400);
        v_creation_date      VARCHAR2(400);
        v_created_by         VARCHAR2(400);
        v_last_update_date   VARCHAR2(400);
        v_last_updated_by    VARCHAR2(400);
        v_book_type_code     VARCHAR2(400);
        v_date_placed        VARCHAR2(400);
        v_date_effective     VARCHAR2(400);
        v_deprn_start_date   VARCHAR2(400);
        v_cost               VARCHAR2(400);
        v_original_cost      VARCHAR2(400);
        v_adjusted_cost      VARCHAR2(400);
        v_salvage_value      VARCHAR2(400);
        v_recoverable_cost   VARCHAR2(400);
        v_unrevalued_cost    VARCHAR2(400);
        v_capitalize_flag    VARCHAR2(400);
        v_depreciate_flag    VARCHAR2(400);
        v_date_ineffective   VARCHAR2(400);
        v_prorate_date       VARCHAR2(400);
        v_rate_adj_factor    VARCHAR2(400);
        v_salvage_type       VARCHAR2(400);
        v_deprn_limit_type   VARCHAR2(400);
        v_cip_cost           VARCHAR2(400);
        v_method_id          VARCHAR2(400);
        v_convention_type_id VARCHAR2(400);
        v_retirement_id      VARCHAR2(400);
        v_accounted_status   VARCHAR2(400);
        v_accounted_date     VARCHAR2(400);
        -- Flexfield attributes
        v_attribute1   VARCHAR2(400);
        v_attribute2   VARCHAR2(400);
        v_attribute3   VARCHAR2(400);
        v_attribute4   VARCHAR2(400);
        v_attribute5   VARCHAR2(400);
        v_attribute6   VARCHAR2(400);
        v_attribute7   VARCHAR2(400);
        v_attribute8   VARCHAR2(400);
        v_attribute9   VARCHAR2(400);
        v_attribute10  VARCHAR2(400);
    BEGIN
        SELECT a.ASSET_ID, a.ASSET_NUMBER, a.DESCRIPTION, a.ASSET_TYPE,
               a.TAG_NUMBER, a.SERIAL_NUMBER, a.MANUFACTURER_NAME, a.MODEL_NUMBER,
               a.IN_USE_FLAG, a.OWNED_LEASED, a.NEW_USED, a.UNITS,
               a.CAPITALIZED_FLAG, a.PROPERTY_TYPE_CODE, a.FEEDER_SYSTEM_NAME,
               a.ASSET_CATEGORY_ID,
               a.CREATION_DATE, a.CREATED_BY, a.LAST_UPDATE_DATE, a.LAST_UPDATED_BY,
               NVL(a.ACCOUNTED_STATUS, 'UNACCOUNTED'),
               TO_CHAR(a.ACCOUNTED_DATE, 'YYYY-MM-DD'),
               -- attributes
               a.ATTRIBUTE1, a.ATTRIBUTE2, a.ATTRIBUTE3, a.ATTRIBUTE4, a.ATTRIBUTE5,
               a.ATTRIBUTE6, a.ATTRIBUTE7, a.ATTRIBUTE8, a.ATTRIBUTE9, a.ATTRIBUTE10,
               -- book
               b.BOOK_TYPE_CODE, b.DATE_PLACED_IN_SERVICE, b.DATE_EFFECTIVE,
               b.DEPRN_START_DATE, b.COST, b.ORIGINAL_COST, b.ADJUSTED_COST,
               b.SALVAGE_VALUE, b.RECOVERABLE_COST, b.UNREVALUED_COST,
               b.CAPITALIZE_FLAG, b.DEPRECIATE_FLAG, b.DATE_INEFFECTIVE,
               b.PRORATE_DATE, b.RATE_ADJUSTMENT_FACTOR,
               b.SALVAGE_TYPE, b.DEPRN_LIMIT_TYPE, b.CIP_COST,
               b.METHOD_ID, b.CONVENTION_TYPE_ID, b.RETIREMENT_ID
        INTO   v_asset_id, v_asset_number, v_description, v_asset_type,
               v_tag_number, v_serial_number, v_manufacturer, v_model_number,
               v_in_use_flag, v_owned_leased, v_new_used, v_units,
               v_capitalized_flag, v_property_type, v_feeder_system,
               v_asset_category_id,
               v_creation_date, v_created_by, v_last_update_date, v_last_updated_by,
               v_accounted_status, v_accounted_date,
               v_attribute1, v_attribute2, v_attribute3, v_attribute4, v_attribute5,
               v_attribute6, v_attribute7, v_attribute8, v_attribute9, v_attribute10,
               v_book_type_code, v_date_placed, v_date_effective,
               v_deprn_start_date, v_cost, v_original_cost, v_adjusted_cost,
               v_salvage_value, v_recoverable_cost, v_unrevalued_cost,
               v_capitalize_flag, v_depreciate_flag, v_date_ineffective,
               v_prorate_date, v_rate_adj_factor,
               v_salvage_type, v_deprn_limit_type, v_cip_cost,
               v_method_id, v_convention_type_id, v_retirement_id
        FROM   RR_FA_ADDITIONS a
        LEFT JOIN RR_FA_BOOKS b
               ON b.ASSET_ID = a.ASSET_ID AND b.DATE_INEFFECTIVE IS NULL
        WHERE  a.ASSET_ID = p_asset_id
        AND    ROWNUM = 1;

        p_result := '{"success":true'
            || ',"assetId":'              || jstr(v_asset_id)
            || ',"asset_number":'         || jstr(v_asset_number)
            || ',"description":'          || jstr(v_description)
            || ',"assetType":'            || jstr(v_asset_type)
            || ',"tagNumber":'            || jstr(v_tag_number)
            || ',"serialNumber":'         || jstr(v_serial_number)
            || ',"manufacturerName":'     || jstr(v_manufacturer)
            || ',"modelNumber":'          || jstr(v_model_number)
            || ',"inUseFlag":'            || jstr(v_in_use_flag)
            || ',"ownedLeased":'          || jstr(v_owned_leased)
            || ',"newUsed":'              || jstr(v_new_used)
            || ',"units":'                || jstr(v_units)
            || ',"capitalizedFlag":'      || jstr(v_capitalized_flag)
            || ',"propertyTypeCode":'     || jstr(v_property_type)
            || ',"feederSystemName":'     || jstr(v_feeder_system)
            || ',"assetCategoryId":'      || jstr(v_asset_category_id)
            || ',"creationDate":'         || jstr(v_creation_date)
            || ',"createdBy":'            || jstr(v_created_by)
            || ',"lastUpdateDate":'       || jstr(v_last_update_date)
            || ',"lastUpdatedBy":'        || jstr(v_last_updated_by)
            || ',"accountedStatus":'      || jstr(v_accounted_status)
            || ',"accountedDate":'        || jstr(v_accounted_date)
            -- flexfield attributes
            || ',"attribute1":'  || jstr(v_attribute1)
            || ',"attribute2":'  || jstr(v_attribute2)
            || ',"attribute3":'  || jstr(v_attribute3)
            || ',"attribute4":'  || jstr(v_attribute4)
            || ',"attribute5":'  || jstr(v_attribute5)
            || ',"attribute6":'  || jstr(v_attribute6)
            || ',"attribute7":'  || jstr(v_attribute7)
            || ',"attribute8":'  || jstr(v_attribute8)
            || ',"attribute9":'  || jstr(v_attribute9)
            || ',"attribute10":' || jstr(v_attribute10)
            -- book fields
            || ',"bookTypeCode":'         || jstr(v_book_type_code)
            || ',"datePlacedInService":'  || jstr(v_date_placed)
            || ',"dateEffective":'        || jstr(v_date_effective)
            || ',"deprnStartDate":'       || jstr(v_deprn_start_date)
            || ',"cost":'                 || jstr(v_cost)
            || ',"originalCost":'         || jstr(v_original_cost)
            || ',"adjustedCost":'         || jstr(v_adjusted_cost)
            || ',"salvageValue":'         || jstr(v_salvage_value)
            || ',"recoverableCost":'      || jstr(v_recoverable_cost)
            || ',"unrevaluedCost":'       || jstr(v_unrevalued_cost)
            || ',"capitalizeFlag":'       || jstr(v_capitalize_flag)
            || ',"depreciateFlag":'       || jstr(v_depreciate_flag)
            || ',"dateIneffective":'      || jstr(v_date_ineffective)
            || ',"prorateDate":'          || jstr(v_prorate_date)
            || ',"rateAdjustmentFactor":' || jstr(v_rate_adj_factor)
            || ',"salvageType":'          || jstr(v_salvage_type)
            || ',"deprnLimitType":'       || jstr(v_deprn_limit_type)
            || ',"cipCost":'              || jstr(v_cip_cost)
            || ',"methodId":'             || jstr(v_method_id)
            || ',"conventionTypeId":'     || jstr(v_convention_type_id)
            || ',"retirementId":'         || jstr(v_retirement_id)
            || '}';
        p_http_status := 200;
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
    ) IS BEGIN
        APEX_JSON.INITIALIZE_CLOB_OUTPUT;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        APEX_JSON.WRITE('assetId', p_asset_id);
        APEX_JSON.OPEN_ARRAY('items');
        FOR r IN (
            SELECT b.ASSET_ID, b.BOOK_TYPE_CODE, bc.BOOK_TYPE_NAME,
                   bc.COMPANY_CODE, b.DATE_PLACED_IN_SERVICE, b.DATE_EFFECTIVE,
                   b.DEPRN_START_DATE, b.COST, b.ORIGINAL_COST, b.ADJUSTED_COST,
                   b.SALVAGE_VALUE, b.RECOVERABLE_COST, b.DEPRECIATE_FLAG,
                   b.CAPITALIZE_FLAG, b.DATE_INEFFECTIVE, b.RETIREMENT_ID,
                   b.METHOD_ID, b.CONVENTION_TYPE_ID, b.RATE_ADJUSTMENT_FACTOR,
                   b.PRORATE_DATE,
                   m.METHOD_CODE, m.METHOD_NAME, m.LIFE_IN_MONTHS,
                   NVL(ds.DEPRN_RESERVE, 0) AS DEPRN_RESERVE,
                   NVL(ds.YTD_DEPRN,     0) AS YTD_DEPRN,
                   NVL(b.ADJUSTED_COST, 0) - NVL(ds.DEPRN_RESERVE, 0) AS NBV
            FROM   RR_FA_BOOKS b
            LEFT JOIN RR_FA_BOOK_CONTROLS  bc ON bc.BOOK_TYPE_CODE = b.BOOK_TYPE_CODE
            LEFT JOIN RR_FA_METHODS        m  ON m.METHOD_ID       = b.METHOD_ID
            LEFT JOIN (
                SELECT ASSET_ID, BOOK_TYPE_CODE,
                       MAX(DEPRN_RESERVE) AS DEPRN_RESERVE,
                       MAX(YTD_DEPRN)     AS YTD_DEPRN
                FROM   RR_FA_DEPRN_SUMMARY
                GROUP BY ASSET_ID, BOOK_TYPE_CODE
            ) ds ON ds.ASSET_ID = b.ASSET_ID AND ds.BOOK_TYPE_CODE = b.BOOK_TYPE_CODE
            WHERE  b.ASSET_ID = p_asset_id
        ) LOOP
            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('assetId',              r.ASSET_ID);
            APEX_JSON.WRITE('bookTypeCode',         r.BOOK_TYPE_CODE);
            APEX_JSON.WRITE('bookTypeName',         r.BOOK_TYPE_NAME);
            APEX_JSON.WRITE('companyCode',          r.COMPANY_CODE);
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
            APEX_JSON.WRITE('methodId',             r.METHOD_ID);
            APEX_JSON.WRITE('methodCode',           r.METHOD_CODE);
            APEX_JSON.WRITE('methodName',           r.METHOD_NAME);
            APEX_JSON.WRITE('lifeInMonths',         r.LIFE_IN_MONTHS);
            APEX_JSON.WRITE('conventionTypeId',     r.CONVENTION_TYPE_ID);
            APEX_JSON.WRITE('rateAdjustmentFactor', r.RATE_ADJUSTMENT_FACTOR);
            APEX_JSON.WRITE('prorateDate',          r.PRORATE_DATE);
            APEX_JSON.WRITE('deprnReserve',         r.DEPRN_RESERVE);
            APEX_JSON.WRITE('ytdDeprn',             r.YTD_DEPRN);
            APEX_JSON.WRITE('nbv',                  r.NBV);
            APEX_JSON.CLOSE_OBJECT;
        END LOOP;
        APEX_JSON.CLOSE_ARRAY;
        APEX_JSON.CLOSE_OBJECT;
        p_result      := APEX_JSON.GET_CLOB_OUTPUT;
        p_http_status := 200;
        APEX_JSON.FREE_OUTPUT;
    EXCEPTION WHEN OTHERS THEN
        write_error(p_http_status, p_result, 500, SQLERRM);
    END GET_ASSET_BOOKS;

    -- ── GET_ASSET_DEPRN ───────────────────────────────────────────────────────
    PROCEDURE GET_ASSET_DEPRN (
        p_asset_id    IN  VARCHAR2,
        p_http_status OUT NUMBER,
        p_result      OUT CLOB
    ) IS BEGIN
        APEX_JSON.INITIALIZE_CLOB_OUTPUT;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        APEX_JSON.WRITE('assetId', p_asset_id);
        APEX_JSON.OPEN_ARRAY('items');
        FOR r IN (
            SELECT dd.ASSET_ID, dd.BOOK_TYPE_CODE, dd.PERIOD_COUNTER,
                   dd.DISTRIBUTION_ID, dd.DEPRN_SOURCE_CODE,
                   dd.DEPRN_AMOUNT, dd.YTD_DEPRN, dd.DEPRN_RESERVE,
                   dd.DEPRN_ADJUSTMENT_AMOUNT, dd.COST,
                   dd.ACCOUNTED_STATUS, dd.ACCOUNTED_DATE,
                   dd.CREATION_DATE, dd.LAST_UPDATE_DATE,
                   NVL(dp.PERIOD_NAME, dd.PERIOD_NAME) AS PERIOD_NAME,
                   dp.FISCAL_YEAR, dp.PERIOD_NUM, dp.PERIOD_CLOSE_DATE
            FROM   RR_FA_DEPRN_DETAIL dd
            LEFT JOIN RR_FA_DEPRN_PERIODS dp
                   ON dp.BOOK_TYPE_CODE = dd.BOOK_TYPE_CODE
                   AND dp.PERIOD_COUNTER = dd.PERIOD_COUNTER
            WHERE  dd.ASSET_ID = p_asset_id
            ORDER BY dd.PERIOD_COUNTER DESC, dd.DISTRIBUTION_ID DESC
        ) LOOP
            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('assetId',                 r.ASSET_ID);
            APEX_JSON.WRITE('bookTypeCode',            r.BOOK_TYPE_CODE);
            APEX_JSON.WRITE('periodCounter',           r.PERIOD_COUNTER);
            APEX_JSON.WRITE('periodName',              r.PERIOD_NAME);
            APEX_JSON.WRITE('fiscalYear',              r.FISCAL_YEAR);
            APEX_JSON.WRITE('periodNum',               r.PERIOD_NUM);
            APEX_JSON.WRITE('distributionId',          r.DISTRIBUTION_ID);
            APEX_JSON.WRITE('deprnSourceCode',         r.DEPRN_SOURCE_CODE);
            APEX_JSON.WRITE('deprnAmount',             r.DEPRN_AMOUNT);
            APEX_JSON.WRITE('ytdDeprn',                r.YTD_DEPRN);
            APEX_JSON.WRITE('deprnReserve',            r.DEPRN_RESERVE);
            APEX_JSON.WRITE('deprnAdjustmentAmount',   r.DEPRN_ADJUSTMENT_AMOUNT);
            APEX_JSON.WRITE('deprnRunDate',            r.LAST_UPDATE_DATE);
            APEX_JSON.WRITE('cost',                    r.COST);
            APEX_JSON.WRITE('accountedStatus',         r.ACCOUNTED_STATUS);
            APEX_JSON.WRITE('accountedDate',           r.ACCOUNTED_DATE);
            APEX_JSON.WRITE('creationDate',            r.CREATION_DATE);
            APEX_JSON.WRITE('lastUpdateDate',          r.LAST_UPDATE_DATE);
            APEX_JSON.WRITE('periodCloseDate',         r.PERIOD_CLOSE_DATE);
            APEX_JSON.CLOSE_OBJECT;
        END LOOP;
        APEX_JSON.CLOSE_ARRAY;
        APEX_JSON.CLOSE_OBJECT;
        p_result      := APEX_JSON.GET_CLOB_OUTPUT;
        p_http_status := 200;
        APEX_JSON.FREE_OUTPUT;
    EXCEPTION WHEN OTHERS THEN
        write_error(p_http_status, p_result, 500, SQLERRM);
    END GET_ASSET_DEPRN;

    -- ── GET_ASSET_DISTRIBUTIONS ───────────────────────────────────────────────
    PROCEDURE GET_ASSET_DISTRIBUTIONS (
        p_asset_id    IN  VARCHAR2,
        p_http_status OUT NUMBER,
        p_result      OUT CLOB
    ) IS BEGIN
        APEX_JSON.INITIALIZE_CLOB_OUTPUT;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        APEX_JSON.WRITE('assetId', p_asset_id);
        APEX_JSON.OPEN_ARRAY('items');
        FOR r IN (
            SELECT dh.DISTRIBUTION_ID, dh.BOOK_TYPE_CODE, dh.ASSET_ID,
                   dh.UNITS_ASSIGNED, dh.TRANSACTION_UNITS,
                   dh.CODE_COMBINATION_ID, dh.LOCATION_ID,
                   dh.TRANSACTION_HEADER_ID_IN, dh.DATE_EFFECTIVE,
                   dh.CREATED_BY, dh.CREATION_DATE
            FROM   RR_FA_DISTRIBUTION_HISTORY dh
            WHERE  dh.ASSET_ID = p_asset_id
            ORDER BY dh.DATE_EFFECTIVE DESC
        ) LOOP
            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('distributionId',         r.DISTRIBUTION_ID);
            APEX_JSON.WRITE('bookTypeCode',           r.BOOK_TYPE_CODE);
            APEX_JSON.WRITE('assetId',                r.ASSET_ID);
            APEX_JSON.WRITE('unitsAssigned',          r.UNITS_ASSIGNED);
            APEX_JSON.WRITE('transactionUnits',       r.TRANSACTION_UNITS);
            APEX_JSON.WRITE('codeCombinationId',      r.CODE_COMBINATION_ID);
            APEX_JSON.WRITE('locationId',             r.LOCATION_ID);
            APEX_JSON.WRITE('transactionHeaderIdIn',  r.TRANSACTION_HEADER_ID_IN);
            APEX_JSON.WRITE('dateEffective',          r.DATE_EFFECTIVE);
            APEX_JSON.WRITE('createdBy',              r.CREATED_BY);
            APEX_JSON.WRITE('creationDate',           r.CREATION_DATE);
            APEX_JSON.CLOSE_OBJECT;
        END LOOP;
        APEX_JSON.CLOSE_ARRAY;
        APEX_JSON.CLOSE_OBJECT;
        p_result      := APEX_JSON.GET_CLOB_OUTPUT;
        p_http_status := 200;
        APEX_JSON.FREE_OUTPUT;
    EXCEPTION WHEN OTHERS THEN
        write_error(p_http_status, p_result, 500, SQLERRM);
    END GET_ASSET_DISTRIBUTIONS;

    -- ── GET_ASSET_INVOICES ────────────────────────────────────────────────────
    PROCEDURE GET_ASSET_INVOICES (
        p_asset_id    IN  VARCHAR2,
        p_http_status OUT NUMBER,
        p_result      OUT CLOB
    ) IS BEGIN
        APEX_JSON.INITIALIZE_CLOB_OUTPUT;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        APEX_JSON.WRITE('assetId', p_asset_id);
        APEX_JSON.OPEN_ARRAY('items');
        FOR r IN (
            SELECT il.INVOICE_LINE_ID, il.ASSET_ID, il.BOOK_TYPE_CODE,
                   il.INVOICE_ID, il.INVOICE_NUMBER, il.INVOICE_DATE,
                   il.VENDOR_ID, il.VENDOR_NAME,
                   il.DESCRIPTION, il.AMOUNT, il.FIXED_ASSETS_COST
            FROM   RR_FA_INVOICE_LINES il
            WHERE  il.ASSET_ID = p_asset_id
            ORDER BY il.INVOICE_DATE DESC
        ) LOOP
            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('invoiceLineId',  r.INVOICE_LINE_ID);
            APEX_JSON.WRITE('assetId',        r.ASSET_ID);
            APEX_JSON.WRITE('bookTypeCode',   r.BOOK_TYPE_CODE);
            APEX_JSON.WRITE('invoiceId',      r.INVOICE_ID);
            APEX_JSON.WRITE('invoiceNumber',  r.INVOICE_NUMBER);
            APEX_JSON.WRITE('invoiceDate',    r.INVOICE_DATE);
            APEX_JSON.WRITE('vendorId',       r.VENDOR_ID);
            APEX_JSON.WRITE('vendorName',     r.VENDOR_NAME);
            APEX_JSON.WRITE('description',    r.DESCRIPTION);
            APEX_JSON.WRITE('amount',         r.AMOUNT);
            APEX_JSON.WRITE('fixedAssetsCost',r.FIXED_ASSETS_COST);
            APEX_JSON.CLOSE_OBJECT;
        END LOOP;
        APEX_JSON.CLOSE_ARRAY;
        APEX_JSON.CLOSE_OBJECT;
        p_result      := APEX_JSON.GET_CLOB_OUTPUT;
        p_http_status := 200;
        APEX_JSON.FREE_OUTPUT;
    EXCEPTION WHEN OTHERS THEN
        write_error(p_http_status, p_result, 500, SQLERRM);
    END GET_ASSET_INVOICES;

    -- ── GET_ASSET_TRANSACTIONS ────────────────────────────────────────────────
    PROCEDURE GET_ASSET_TRANSACTIONS (
        p_asset_id    IN  VARCHAR2,
        p_http_status OUT NUMBER,
        p_result      OUT CLOB
    ) IS BEGIN
        APEX_JSON.INITIALIZE_CLOB_OUTPUT;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        APEX_JSON.WRITE('assetId', p_asset_id);
        APEX_JSON.OPEN_ARRAY('items');
        FOR r IN (
            SELECT th.TRANSACTION_HEADER_ID, th.BOOK_TYPE_CODE, th.ASSET_ID,
                   th.TRANSACTION_TYPE_CODE, th.TRANSACTION_DATE_ENTERED,
                   th.DATE_EFFECTIVE, th.CALLING_INTERFACE,
                   th.CREATED_BY, th.CREATION_DATE
            FROM   RR_FA_TRANSACTION_HEADERS th
            WHERE  th.ASSET_ID = p_asset_id
            ORDER BY th.DATE_EFFECTIVE DESC
        ) LOOP
            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('transactionHeaderId',  r.TRANSACTION_HEADER_ID);
            APEX_JSON.WRITE('bookTypeCode',         r.BOOK_TYPE_CODE);
            APEX_JSON.WRITE('assetId',              r.ASSET_ID);
            APEX_JSON.WRITE('transactionTypeCode',  r.TRANSACTION_TYPE_CODE);
            APEX_JSON.WRITE('transactionDate',      r.TRANSACTION_DATE_ENTERED);
            APEX_JSON.WRITE('dateEffective',        r.DATE_EFFECTIVE);
            APEX_JSON.WRITE('callingInterface',     r.CALLING_INTERFACE);
            APEX_JSON.WRITE('createdBy',            r.CREATED_BY);
            APEX_JSON.WRITE('creationDate',         r.CREATION_DATE);
            APEX_JSON.CLOSE_OBJECT;
        END LOOP;
        APEX_JSON.CLOSE_ARRAY;
        APEX_JSON.CLOSE_OBJECT;
        p_result      := APEX_JSON.GET_CLOB_OUTPUT;
        p_http_status := 200;
        APEX_JSON.FREE_OUTPUT;
    EXCEPTION WHEN OTHERS THEN
        write_error(p_http_status, p_result, 500, SQLERRM);
    END GET_ASSET_TRANSACTIONS;

END RR_FA_PKG;
/


-- ── 3. ORDS: PUT fa/assets/:assetId/attributes ───────────────────────────────
BEGIN ORDS.DELETE_HANDLER(p_module_name=>'reerp',p_pattern=>'fa/assets/:assetId/attributes',p_method=>'PUT');  COMMIT; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN ORDS.DELETE_TEMPLATE(p_module_name=>'reerp',p_pattern=>'fa/assets/:assetId/attributes'); COMMIT; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'fa/assets/:assetId/attributes',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'FA: update flexfield attributes for an asset'
    );
    COMMIT;
END;
/
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'fa/assets/:assetId/attributes',
        p_method         => 'PUT',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_source         => q'[
DECLARE
    v_body       CLOB := :body_text;
    v_asset_id   VARCHAR2(400) := :assetId;
    v_rows       NUMBER;
    v_updated_by VARCHAR2(400);
BEGIN
    APEX_JSON.PARSE(v_body);
    v_updated_by := NVL(APEX_JSON.GET_VARCHAR2(p_path=>'updatedBy'), 'REACTERP');

    UPDATE RR_FA_ADDITIONS SET
        ATTRIBUTE1       = APEX_JSON.GET_VARCHAR2(p_path=>'attribute1'),
        ATTRIBUTE2       = APEX_JSON.GET_VARCHAR2(p_path=>'attribute2'),
        ATTRIBUTE3       = APEX_JSON.GET_VARCHAR2(p_path=>'attribute3'),
        ATTRIBUTE4       = APEX_JSON.GET_VARCHAR2(p_path=>'attribute4'),
        ATTRIBUTE5       = APEX_JSON.GET_VARCHAR2(p_path=>'attribute5'),
        ATTRIBUTE6       = APEX_JSON.GET_VARCHAR2(p_path=>'attribute6'),
        ATTRIBUTE7       = APEX_JSON.GET_VARCHAR2(p_path=>'attribute7'),
        ATTRIBUTE8       = APEX_JSON.GET_VARCHAR2(p_path=>'attribute8'),
        ATTRIBUTE9       = APEX_JSON.GET_VARCHAR2(p_path=>'attribute9'),
        ATTRIBUTE10      = APEX_JSON.GET_VARCHAR2(p_path=>'attribute10'),
        LAST_UPDATED_BY  = v_updated_by,
        LAST_UPDATE_DATE = SYSTIMESTAMP
    WHERE ASSET_ID = v_asset_id;

    v_rows := SQL%ROWCOUNT;

    IF v_rows = 0 THEN
        :status := 404;
        HTP.PRN('{"success":false,"error":"Asset not found: ' || v_asset_id || '"}');
        RETURN;
    END IF;

    COMMIT;
    :status := 200;
    HTP.PRN('{"success":true,"assetId":"' || v_asset_id || '","rowsUpdated":' || v_rows || ',"message":"Attributes saved"}');
EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    :status := 500;
    HTP.PRN('{"success":false,"error":"' || REPLACE(SQLERRM,'"','\"') || '"}');
END;
        ]'
    );
    COMMIT;
END;
/
