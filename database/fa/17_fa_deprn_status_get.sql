-- ============================================================
-- 17_FA_DEPRN_STATUS_GET.SQL
--
-- New webservice: GET reerp/fa/deprn-status
--
--   For a book + period, list ALL active assets and whether depreciation
--   has been posted for that period:
--     status = 'Posted'      -> a RR_FA_DEPRN_SUMMARY row exists for the period
--     status = 'Not Posted'  -> no depreciation row for that period
--
--   Unlike fa/deprn-workbench (INNER JOIN, only depreciated assets), this
--   LEFT JOINs the deprn summary so not-yet-depreciated assets are included.
--
--   Params (query string):
--     bookTypeCode   (required) — FA book
--     periodCounter  (required) — the period to check
--     assetNumber    (optional) — LIKE filter
--     limit/offset   (optional) — paging (default 1000 / 0)
--
--   Response: { success, totalCount, postedCount, notPostedCount, periodName,
--               summary:{ totalCost, totalDeprnAmount, totalNbv },
--               items:[ { assetId, assetNumber, description, cost, salvageValue,
--                         deprnAmount, ytdDeprn, deprnReserve, nbv,
--                         deprnRunDate, status } ] }
--
-- HOW TO RUN: APEX SQL Workshop -> SQL Commands -> run the whole block.
-- ============================================================

BEGIN
    ORDS.DELETE_HANDLER(p_module_name => 'reerp', p_pattern => 'fa/deprn-status', p_method => 'GET');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'reerp', p_pattern => 'fa/deprn-status');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'fa/deprn-status',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'FA: depreciation status (Posted/Not Posted) for all assets in a period'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'fa/deprn-status',
        p_method         => 'GET',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_mimes_allowed  => NULL,
        p_source         => q'[
DECLARE
    v_book      VARCHAR2(100) := :bookTypeCode;
    v_pc        NUMBER        := TO_NUMBER(:periodCounter);
    v_an        VARCHAR2(200) := :assetNumber;
    v_limit     NUMBER        := NVL(:limit, 1000);
    v_offset    NUMBER        := NVL(:offset, 0);
    v_total     NUMBER := 0;
    v_posted    NUMBER := 0;
    v_pname     VARCHAR2(100);
    v_tot_cost  NUMBER := 0;
    v_tot_deprn NUMBER := 0;
    v_tot_nbv   NUMBER := 0;
BEGIN
    IF v_book IS NULL OR :periodCounter IS NULL THEN
        :status := 400;
        HTP.P('{"success":false,"error":"bookTypeCode and periodCounter are required"}');
        RETURN;
    END IF;

    SELECT MAX(PERIOD_NAME) INTO v_pname
      FROM RR_FA_DEPRN_PERIODS
     WHERE BOOK_TYPE_CODE = v_book AND PERIOD_COUNTER = v_pc;

    -- Counts across all active assets in the book
    SELECT COUNT(*),
           SUM(CASE WHEN ds.ASSET_ID IS NOT NULL THEN 1 ELSE 0 END)
      INTO v_total, v_posted
      FROM RR_FA_BOOKS b
      JOIN RR_FA_ADDITIONS a ON a.ASSET_ID = b.ASSET_ID
      LEFT JOIN RR_FA_DEPRN_SUMMARY ds
             ON ds.ASSET_ID = b.ASSET_ID
            AND ds.BOOK_TYPE_CODE = b.BOOK_TYPE_CODE
            AND ds.PERIOD_COUNTER = v_pc
     WHERE b.BOOK_TYPE_CODE = v_book
       AND b.DATE_INEFFECTIVE IS NULL
       AND (v_an IS NULL OR UPPER(a.ASSET_NUMBER) LIKE UPPER('%' || v_an || '%'));

    APEX_JSON.INITIALIZE_CLOB_OUTPUT;
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success',        TRUE);
    APEX_JSON.WRITE('periodCounter',  v_pc);
    APEX_JSON.WRITE('periodName',     v_pname);
    APEX_JSON.WRITE('totalCount',     v_total);
    APEX_JSON.WRITE('postedCount',    v_posted);
    APEX_JSON.WRITE('notPostedCount', v_total - v_posted);
    APEX_JSON.OPEN_ARRAY('items');

    FOR r IN (
        SELECT a.ASSET_ID, a.ASSET_NUMBER, a.DESCRIPTION,
               NVL(ds.ADJUSTED_COST, b.COST)                         AS COST,
               b.SALVAGE_VALUE                                       AS SALVAGE_VALUE,
               ds.DEPRN_AMOUNT                                       AS DEPRN_AMOUNT,
               ds.YTD_DEPRN                                          AS YTD_DEPRN,
               -- reserve as of this period: the posted row's reserve, else the
               -- most recent reserve on or before this period
               NVL(ds.DEPRN_RESERVE,
                   (SELECT ds3.DEPRN_RESERVE FROM RR_FA_DEPRN_SUMMARY ds3
                     WHERE ds3.ASSET_ID = b.ASSET_ID
                       AND ds3.BOOK_TYPE_CODE = b.BOOK_TYPE_CODE
                       AND ds3.PERIOD_COUNTER = (
                            SELECT MAX(ds4.PERIOD_COUNTER) FROM RR_FA_DEPRN_SUMMARY ds4
                             WHERE ds4.ASSET_ID = b.ASSET_ID
                               AND ds4.BOOK_TYPE_CODE = b.BOOK_TYPE_CODE
                               AND ds4.PERIOD_COUNTER <= v_pc))) AS DEPRN_RESERVE,
               ds.DEPRN_RUN_DATE                                     AS DEPRN_RUN_DATE,
               CASE WHEN ds.ASSET_ID IS NOT NULL THEN 'Posted' ELSE 'Not Posted' END AS STATUS
          FROM RR_FA_BOOKS b
          JOIN RR_FA_ADDITIONS a ON a.ASSET_ID = b.ASSET_ID
          LEFT JOIN RR_FA_DEPRN_SUMMARY ds
                 ON ds.ASSET_ID = b.ASSET_ID
                AND ds.BOOK_TYPE_CODE = b.BOOK_TYPE_CODE
                AND ds.PERIOD_COUNTER = v_pc
         WHERE b.BOOK_TYPE_CODE = v_book
           AND b.DATE_INEFFECTIVE IS NULL
           AND (v_an IS NULL OR UPPER(a.ASSET_NUMBER) LIKE UPPER('%' || v_an || '%'))
         ORDER BY a.ASSET_NUMBER
         OFFSET v_offset ROWS FETCH NEXT v_limit ROWS ONLY
    ) LOOP
        v_tot_cost  := v_tot_cost  + NVL(r.COST, 0);
        v_tot_deprn := v_tot_deprn + NVL(r.DEPRN_AMOUNT, 0);
        v_tot_nbv   := v_tot_nbv   + (NVL(r.COST, 0) - NVL(r.DEPRN_RESERVE, 0));

        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('assetId',      r.ASSET_ID);
        APEX_JSON.WRITE('assetNumber',  r.ASSET_NUMBER);
        APEX_JSON.WRITE('description',  r.DESCRIPTION);
        APEX_JSON.WRITE('cost',         r.COST);
        APEX_JSON.WRITE('salvageValue', r.SALVAGE_VALUE);
        APEX_JSON.WRITE('deprnAmount',  r.DEPRN_AMOUNT);
        APEX_JSON.WRITE('ytdDeprn',     r.YTD_DEPRN);
        APEX_JSON.WRITE('deprnReserve', r.DEPRN_RESERVE);
        APEX_JSON.WRITE('nbv',          NVL(r.COST, 0) - NVL(r.DEPRN_RESERVE, 0));
        APEX_JSON.WRITE('deprnRunDate', r.DEPRN_RUN_DATE);
        APEX_JSON.WRITE('status',       r.STATUS);
        APEX_JSON.CLOSE_OBJECT;
    END LOOP;

    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.OPEN_OBJECT('summary');
    APEX_JSON.WRITE('totalCost',        v_tot_cost);
    APEX_JSON.WRITE('totalDeprnAmount', v_tot_deprn);
    APEX_JSON.WRITE('totalNbv',         v_tot_nbv);
    APEX_JSON.CLOSE_OBJECT;
    APEX_JSON.CLOSE_OBJECT;

    :status := 200;
    HTP.P(APEX_JSON.GET_CLOB_OUTPUT);
    APEX_JSON.FREE_OUTPUT;
EXCEPTION
    WHEN OTHERS THEN
        :status := 500;
        HTP.P('{"success":false,"error":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;
]'
    );
    COMMIT;
    DBMS_OUTPUT.PUT_LINE('GET fa/deprn-status registered OK');
END;
/
