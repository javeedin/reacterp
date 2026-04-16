-- =============================================================================
-- 03_FA_GET_ASSET_DETAIL.SQL
-- GET reerp/fa/assets/:assetId/books
-- GET reerp/fa/assets/:assetId/deprn
-- GET reerp/fa/assets/:assetId/distributions
-- GET reerp/fa/assets/:assetId/invoices
-- GET reerp/fa/assets/:assetId/transactions
-- =============================================================================


-- ============================================================
-- 1. GET fa/assets/:assetId/books
-- ============================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'fa/assets/:assetId/books',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'FA: book details for an asset'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'fa/assets/:assetId/books',
        p_method         => 'GET',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_source         => q'[
DECLARE
    CURSOR c_books IS
        SELECT b.BOOK_TYPE_CODE,
               bc.BOOK_TYPE_NAME,
               b.DATE_PLACED_IN_SERVICE,
               b.DATE_EFFECTIVE,
               b.DEPRN_START_DATE,
               b.COST,
               b.ORIGINAL_COST,
               b.ADJUSTED_COST,
               b.SALVAGE_VALUE,
               b.RECOVERABLE_COST,
               b.DEPRECIATE_FLAG,
               b.CAPITALIZE_FLAG,
               b.DATE_INEFFECTIVE,
               b.RETIREMENT_ID,
               b.PRORATE_DATE,
               b.METHOD_ID,
               m.METHOD_CODE,
               m.NAME          AS METHOD_NAME,
               m.LIFE_IN_MONTHS,
               b.CONVENTION_TYPE_ID,
               b.RATE_ADJUSTMENT_FACTOR,
               b.SALVAGE_TYPE,
               b.DEPRN_LIMIT_TYPE,
               b.CIP_COST,
               b.UNREVALUED_COST,
               NVL(ds.DEPRN_RESERVE,0)                      AS DEPRN_RESERVE,
               NVL(ds.YTD_DEPRN,0)                          AS YTD_DEPRN,
               NVL(b.COST,0) - NVL(ds.DEPRN_RESERVE,0)     AS NBV
        FROM   RR_FA_BOOKS b
        LEFT JOIN RR_FA_BOOK_CONTROLS bc ON bc.BOOK_TYPE_CODE = b.BOOK_TYPE_CODE
        LEFT JOIN RR_FA_METHODS m        ON m.METHOD_ID       = b.METHOD_ID
        LEFT JOIN (
            SELECT ds1.ASSET_ID, ds1.BOOK_TYPE_CODE,
                   ds1.DEPRN_RESERVE, ds1.YTD_DEPRN
            FROM   RR_FA_DEPRN_SUMMARY ds1
            WHERE  ds1.PERIOD_COUNTER = (
                SELECT MAX(ds2.PERIOD_COUNTER)
                FROM   RR_FA_DEPRN_SUMMARY ds2
                WHERE  ds2.ASSET_ID      = ds1.ASSET_ID
                AND    ds2.BOOK_TYPE_CODE = ds1.BOOK_TYPE_CODE)
        ) ds ON ds.ASSET_ID = b.ASSET_ID AND ds.BOOK_TYPE_CODE = b.BOOK_TYPE_CODE
        WHERE  b.ASSET_ID = :assetId
        ORDER BY b.DATE_EFFECTIVE DESC;
BEGIN
    APEX_JSON.INITIALIZE_CLOB_OUTPUT;
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success',  TRUE);
    APEX_JSON.WRITE('assetId',  :assetId);
    APEX_JSON.OPEN_ARRAY('items');

    FOR r IN c_books LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('bookTypeCode',        r.BOOK_TYPE_CODE);
        APEX_JSON.WRITE('bookTypeName',        r.BOOK_TYPE_NAME);
        APEX_JSON.WRITE('datePlacedInService', r.DATE_PLACED_IN_SERVICE);
        APEX_JSON.WRITE('dateEffective',       r.DATE_EFFECTIVE);
        APEX_JSON.WRITE('deprnStartDate',      r.DEPRN_START_DATE);
        APEX_JSON.WRITE('cost',                r.COST);
        APEX_JSON.WRITE('originalCost',        r.ORIGINAL_COST);
        APEX_JSON.WRITE('adjustedCost',        r.ADJUSTED_COST);
        APEX_JSON.WRITE('salvageValue',        r.SALVAGE_VALUE);
        APEX_JSON.WRITE('recoverableCost',     r.RECOVERABLE_COST);
        APEX_JSON.WRITE('depreciateFlag',      r.DEPRECIATE_FLAG);
        APEX_JSON.WRITE('capitalizeFlag',      r.CAPITALIZE_FLAG);
        APEX_JSON.WRITE('dateIneffective',     r.DATE_INEFFECTIVE);
        APEX_JSON.WRITE('retirementId',        r.RETIREMENT_ID);
        APEX_JSON.WRITE('prorateDate',         r.PRORATE_DATE);
        APEX_JSON.WRITE('methodId',            r.METHOD_ID);
        APEX_JSON.WRITE('methodCode',          r.METHOD_CODE);
        APEX_JSON.WRITE('methodName',          r.METHOD_NAME);
        APEX_JSON.WRITE('lifeInMonths',        r.LIFE_IN_MONTHS);
        APEX_JSON.WRITE('conventionTypeId',    r.CONVENTION_TYPE_ID);
        APEX_JSON.WRITE('rateAdjustmentFactor',r.RATE_ADJUSTMENT_FACTOR);
        APEX_JSON.WRITE('salvageType',         r.SALVAGE_TYPE);
        APEX_JSON.WRITE('deprnLimitType',      r.DEPRN_LIMIT_TYPE);
        APEX_JSON.WRITE('cipCost',             r.CIP_COST);
        APEX_JSON.WRITE('unrevaluedCost',      r.UNREVALUED_COST);
        APEX_JSON.WRITE('deprnReserve',        r.DEPRN_RESERVE);
        APEX_JSON.WRITE('ytdDeprn',            r.YTD_DEPRN);
        APEX_JSON.WRITE('nbv',                 r.NBV);
        APEX_JSON.CLOSE_OBJECT;
    END LOOP;

    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
    :status := 200;
    HTP.P(APEX_JSON.GET_CLOB_OUTPUT);
    APEX_JSON.FREE_OUTPUT;
EXCEPTION
    WHEN OTHERS THEN
        :status := 500;
        HTP.P('{"success":false,"error":"'||REPLACE(SQLERRM,'"','\"')||'"}');
END;
        ]'
    );
    COMMIT;
END;
/


-- ============================================================
-- 2. GET fa/assets/:assetId/deprn
-- ============================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'fa/assets/:assetId/deprn',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'FA: depreciation history for an asset'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'fa/assets/:assetId/deprn',
        p_method         => 'GET',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_source         => q'[
DECLARE
    CURSOR c_deprn IS
        SELECT ds.ASSET_ID,
               ds.BOOK_TYPE_CODE,
               ds.PERIOD_COUNTER,
               dp.PERIOD_NAME,
               dp.FISCAL_YEAR,
               dp.PERIOD_NUM,
               ds.DEPRN_RUN_DATE,
               ds.DEPRN_AMOUNT,
               ds.YTD_DEPRN,
               ds.DEPRN_RESERVE,
               ds.ADJUSTED_COST,
               ds.BONUS_DEPRN_AMOUNT,
               ds.BONUS_YTD_DEPRN,
               ds.BONUS_DEPRN_RESERVE,
               ds.REVAL_RESERVE,
               ds.IMPAIRMENT_AMOUNT,
               ds.PRIOR_FY_EXPENSE,
               ds.DEPRN_SOURCE_CODE,
               NVL(ds.ADJUSTED_COST,0) - NVL(ds.DEPRN_RESERVE,0) AS NBV
        FROM   RR_FA_DEPRN_SUMMARY ds
        LEFT JOIN RR_FA_DEPRN_PERIODS dp
               ON dp.BOOK_TYPE_CODE  = ds.BOOK_TYPE_CODE
               AND dp.PERIOD_COUNTER = ds.PERIOD_COUNTER
        WHERE  ds.ASSET_ID = :assetId
        ORDER BY ds.PERIOD_COUNTER DESC;
BEGIN
    APEX_JSON.INITIALIZE_CLOB_OUTPUT;
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success',  TRUE);
    APEX_JSON.WRITE('assetId',  :assetId);
    APEX_JSON.OPEN_ARRAY('items');

    FOR r IN c_deprn LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('assetId',          r.ASSET_ID);
        APEX_JSON.WRITE('bookTypeCode',     r.BOOK_TYPE_CODE);
        APEX_JSON.WRITE('periodCounter',    r.PERIOD_COUNTER);
        APEX_JSON.WRITE('periodName',       r.PERIOD_NAME);
        APEX_JSON.WRITE('fiscalYear',       r.FISCAL_YEAR);
        APEX_JSON.WRITE('periodNum',        r.PERIOD_NUM);
        APEX_JSON.WRITE('deprnRunDate',     r.DEPRN_RUN_DATE);
        APEX_JSON.WRITE('deprnAmount',      r.DEPRN_AMOUNT);
        APEX_JSON.WRITE('ytdDeprn',         r.YTD_DEPRN);
        APEX_JSON.WRITE('deprnReserve',     r.DEPRN_RESERVE);
        APEX_JSON.WRITE('adjustedCost',     r.ADJUSTED_COST);
        APEX_JSON.WRITE('bonusDeprnAmount', r.BONUS_DEPRN_AMOUNT);
        APEX_JSON.WRITE('bonusYtdDeprn',    r.BONUS_YTD_DEPRN);
        APEX_JSON.WRITE('bonusDeprnReserve',r.BONUS_DEPRN_RESERVE);
        APEX_JSON.WRITE('revalReserve',     r.REVAL_RESERVE);
        APEX_JSON.WRITE('impairmentAmount', r.IMPAIRMENT_AMOUNT);
        APEX_JSON.WRITE('priorFyExpense',   r.PRIOR_FY_EXPENSE);
        APEX_JSON.WRITE('deprnSourceCode',  r.DEPRN_SOURCE_CODE);
        APEX_JSON.WRITE('nbv',              r.NBV);
        APEX_JSON.CLOSE_OBJECT;
    END LOOP;

    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
    :status := 200;
    HTP.P(APEX_JSON.GET_CLOB_OUTPUT);
    APEX_JSON.FREE_OUTPUT;
EXCEPTION
    WHEN OTHERS THEN
        :status := 500;
        HTP.P('{"success":false,"error":"'||REPLACE(SQLERRM,'"','\"')||'"}');
END;
        ]'
    );
    COMMIT;
END;
/


-- ============================================================
-- 3. GET fa/assets/:assetId/distributions
-- ============================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'fa/assets/:assetId/distributions',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'FA: distribution history for an asset'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'fa/assets/:assetId/distributions',
        p_method         => 'GET',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_source         => q'[
DECLARE
    CURSOR c_dist IS
        SELECT d.DISTRIBUTION_ID,
               d.BOOK_TYPE_CODE,
               d.UNITS_ASSIGNED,
               d.TRANSACTION_UNITS,
               d.CODE_COMBINATION_ID,
               d.LOCATION_ID,
               l.SEGMENT1 AS LOC_SEG1,
               l.SEGMENT2 AS LOC_SEG2,
               l.SEGMENT3 AS LOC_SEG3,
               d.TRANSACTION_HEADER_ID_IN,
               d.TRANSACTION_HEADER_ID_OUT,
               d.DATE_EFFECTIVE,
               d.DATE_INEFFECTIVE
        FROM   RR_FA_DISTRIBUTION_HISTORY d
        LEFT JOIN RR_FA_LOCATIONS l ON l.LOCATION_ID = d.LOCATION_ID
        WHERE  d.ASSET_ID = :assetId
        ORDER BY d.DATE_EFFECTIVE DESC;
BEGIN
    APEX_JSON.INITIALIZE_CLOB_OUTPUT;
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success',  TRUE);
    APEX_JSON.WRITE('assetId',  :assetId);
    APEX_JSON.OPEN_ARRAY('items');

    FOR r IN c_dist LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('distributionId',         r.DISTRIBUTION_ID);
        APEX_JSON.WRITE('bookTypeCode',            r.BOOK_TYPE_CODE);
        APEX_JSON.WRITE('unitsAssigned',           r.UNITS_ASSIGNED);
        APEX_JSON.WRITE('transactionUnits',        r.TRANSACTION_UNITS);
        APEX_JSON.WRITE('codeCombinationId',       r.CODE_COMBINATION_ID);
        APEX_JSON.WRITE('locationId',              r.LOCATION_ID);
        APEX_JSON.WRITE('locationSeg1',            r.LOC_SEG1);
        APEX_JSON.WRITE('locationSeg2',            r.LOC_SEG2);
        APEX_JSON.WRITE('locationSeg3',            r.LOC_SEG3);
        APEX_JSON.WRITE('transactionHeaderIdIn',   r.TRANSACTION_HEADER_ID_IN);
        APEX_JSON.WRITE('transactionHeaderIdOut',  r.TRANSACTION_HEADER_ID_OUT);
        APEX_JSON.WRITE('dateEffective',           r.DATE_EFFECTIVE);
        APEX_JSON.WRITE('dateIneffective',         r.DATE_INEFFECTIVE);
        APEX_JSON.CLOSE_OBJECT;
    END LOOP;

    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
    :status := 200;
    HTP.P(APEX_JSON.GET_CLOB_OUTPUT);
    APEX_JSON.FREE_OUTPUT;
EXCEPTION
    WHEN OTHERS THEN
        :status := 500;
        HTP.P('{"success":false,"error":"'||REPLACE(SQLERRM,'"','\"')||'"}');
END;
        ]'
    );
    COMMIT;
END;
/


-- ============================================================
-- 4. GET fa/assets/:assetId/invoices
-- ============================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'fa/assets/:assetId/invoices',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'FA: source invoice lines for an asset'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'fa/assets/:assetId/invoices',
        p_method         => 'GET',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_source         => q'[
DECLARE
    CURSOR c_inv IS
        SELECT ASSET_INVOICE_ID, BOOK_TYPE_CODE, FIXED_ASSETS_COST,
               DATE_EFFECTIVE, INVOICE_TRANSACTION_ID_IN, DELETED_FLAG,
               PAYABLES_CODE_COMBINATION_ID, FEEDER_SYSTEM_NAME,
               DESCRIPTION, SOURCE_LINE_ID, POST_BATCH_ID
        FROM   RR_FA_ASSET_INVOICES
        WHERE  ASSET_ID = :assetId
        AND    NVL(DELETED_FLAG,'N') = 'N'
        ORDER BY DATE_EFFECTIVE DESC;
BEGIN
    APEX_JSON.INITIALIZE_CLOB_OUTPUT;
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success',  TRUE);
    APEX_JSON.WRITE('assetId',  :assetId);
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
    :status := 200;
    HTP.P(APEX_JSON.GET_CLOB_OUTPUT);
    APEX_JSON.FREE_OUTPUT;
EXCEPTION
    WHEN OTHERS THEN
        :status := 500;
        HTP.P('{"success":false,"error":"'||REPLACE(SQLERRM,'"','\"')||'"}');
END;
        ]'
    );
    COMMIT;
END;
/


-- ============================================================
-- 5. GET fa/assets/:assetId/transactions
-- ============================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'fa/assets/:assetId/transactions',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'FA: transaction history for an asset'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'fa/assets/:assetId/transactions',
        p_method         => 'GET',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_source         => q'[
DECLARE
    CURSOR c_txn IS
        SELECT TRANSACTION_HEADER_ID, BOOK_TYPE_CODE,
               TRANSACTION_TYPE_CODE, TRANSACTION_DATE_ENTERED,
               DATE_EFFECTIVE, INVOICE_TRANSACTION_ID,
               CALLING_INTERFACE, EVENT_ID, MASS_REFERENCE_ID,
               CREATION_DATE, CREATED_BY
        FROM   RR_FA_TRANSACTION_HEADERS
        WHERE  ASSET_ID = :assetId
        ORDER BY DATE_EFFECTIVE DESC;
BEGIN
    APEX_JSON.INITIALIZE_CLOB_OUTPUT;
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success',  TRUE);
    APEX_JSON.WRITE('assetId',  :assetId);
    APEX_JSON.OPEN_ARRAY('items');

    FOR r IN c_txn LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('transactionHeaderId',   r.TRANSACTION_HEADER_ID);
        APEX_JSON.WRITE('bookTypeCode',          r.BOOK_TYPE_CODE);
        APEX_JSON.WRITE('transactionTypeCode',   r.TRANSACTION_TYPE_CODE);
        APEX_JSON.WRITE('transactionDate',       r.TRANSACTION_DATE_ENTERED);
        APEX_JSON.WRITE('dateEffective',         r.DATE_EFFECTIVE);
        APEX_JSON.WRITE('invoiceTransactionId',  r.INVOICE_TRANSACTION_ID);
        APEX_JSON.WRITE('callingInterface',      r.CALLING_INTERFACE);
        APEX_JSON.WRITE('eventId',               r.EVENT_ID);
        APEX_JSON.WRITE('massReferenceId',       r.MASS_REFERENCE_ID);
        APEX_JSON.WRITE('creationDate',          r.CREATION_DATE);
        APEX_JSON.WRITE('createdBy',             r.CREATED_BY);
        APEX_JSON.CLOSE_OBJECT;
    END LOOP;

    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
    :status := 200;
    HTP.P(APEX_JSON.GET_CLOB_OUTPUT);
    APEX_JSON.FREE_OUTPUT;
EXCEPTION
    WHEN OTHERS THEN
        :status := 500;
        HTP.P('{"success":false,"error":"'||REPLACE(SQLERRM,'"','\"')||'"}');
END;
        ]'
    );
    COMMIT;
END;
/
