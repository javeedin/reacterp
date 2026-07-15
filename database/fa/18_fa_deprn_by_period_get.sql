-- ============================================================
-- 18_FA_DEPRN_BY_PERIOD_GET.SQL
--
-- New webservice: GET reerp/fa/deprn-by-period
--
--   Same source as GET /fa/assets/:assetId/deprn (RR_FA_DEPRN_DETAIL) but
--   for ALL assets of a book in ONE period — pass the period, get each
--   asset's depreciation amount.
--
--   All ACTIVE assets are returned (LEFT JOIN to the deprn detail), so an
--   asset with no depreciation for the period shows status 'Not Posted' with
--   a null amount; one that has it shows 'Posted' with the amount.
--
--   Params (query string):
--     bookTypeCode   (required) — FA book
--     periodName     (one of)   — e.g. 'May-26'  (resolved to period counter)
--     periodCounter  (one of)   — the period counter directly
--     assetNumber    (optional) — LIKE filter
--     limit/offset   (optional) — paging (default 2000 / 0)
--
--   Response: { success, periodCounter, periodName, totalCount, postedCount,
--               notPostedCount, summary:{ totalCost, totalDeprnAmount, totalNbv },
--               items:[ { assetId, assetNumber, description, cost, deprnAmount,
--                         ytdDeprn, deprnReserve, nbv, deprnRunDate,
--                         accountedStatus, status } ] }
--
-- HOW TO RUN: APEX SQL Workshop -> SQL Commands -> run the whole block.
-- ============================================================

BEGIN
    ORDS.DELETE_HANDLER(p_module_name => 'reerp', p_pattern => 'fa/deprn-by-period', p_method => 'GET');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'reerp', p_pattern => 'fa/deprn-by-period');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'fa/deprn-by-period',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'FA: per-asset depreciation for a period (from RR_FA_DEPRN_DETAIL)'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'fa/deprn-by-period',
        p_method         => 'GET',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_mimes_allowed  => NULL,
        p_source         => q'[
DECLARE
    v_book      VARCHAR2(100) := :bookTypeCode;
    v_pname_in  VARCHAR2(100) := :periodName;
    v_an        VARCHAR2(200) := :assetNumber;
    v_limit     NUMBER        := NVL(:limit, 2000);
    v_offset    NUMBER        := NVL(:offset, 0);
    v_pc        NUMBER;
    v_pname     VARCHAR2(100);
    v_total     NUMBER := 0;
    v_posted    NUMBER := 0;
    v_tot_cost  NUMBER := 0;
    v_tot_deprn NUMBER := 0;
    v_tot_nbv   NUMBER := 0;
BEGIN
    IF v_book IS NULL THEN
        :status := 400;
        HTP.P('{"success":false,"error":"bookTypeCode is required"}');
        RETURN;
    END IF;

    -- Resolve the period counter from either periodCounter or periodName.
    IF :periodCounter IS NOT NULL THEN
        v_pc := TO_NUMBER(:periodCounter);
    ELSIF v_pname_in IS NOT NULL THEN
        SELECT MAX(PERIOD_COUNTER) INTO v_pc
          FROM RR_FA_DEPRN_PERIODS
         WHERE BOOK_TYPE_CODE = v_book AND UPPER(PERIOD_NAME) = UPPER(v_pname_in);
    END IF;

    IF v_pc IS NULL THEN
        :status := 400;
        HTP.P('{"success":false,"error":"provide periodCounter or a valid periodName for the book"}');
        RETURN;
    END IF;

    SELECT MAX(PERIOD_NAME) INTO v_pname
      FROM RR_FA_DEPRN_PERIODS WHERE BOOK_TYPE_CODE = v_book AND PERIOD_COUNTER = v_pc;

    -- Counts across all active assets in the book
    SELECT COUNT(*),
           SUM(CASE WHEN dsum.ASSET_ID IS NOT NULL THEN 1 ELSE 0 END)
      INTO v_total, v_posted
      FROM RR_FA_BOOKS b
      JOIN RR_FA_ADDITIONS a ON a.ASSET_ID = b.ASSET_ID
      LEFT JOIN (
            SELECT dd.ASSET_ID, dd.BOOK_TYPE_CODE
              FROM RR_FA_DEPRN_DETAIL dd
             WHERE dd.PERIOD_COUNTER = v_pc
             GROUP BY dd.ASSET_ID, dd.BOOK_TYPE_CODE
      ) dsum ON dsum.ASSET_ID = b.ASSET_ID AND dsum.BOOK_TYPE_CODE = b.BOOK_TYPE_CODE
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
               NVL(dsum.COST, b.COST)                              AS COST,
               dsum.DEPRN_AMOUNT                                    AS DEPRN_AMOUNT,
               dsum.YTD_DEPRN                                       AS YTD_DEPRN,
               dsum.DEPRN_RESERVE                                   AS DEPRN_RESERVE,
               NVL(dsum.COST, b.COST) - NVL(dsum.DEPRN_RESERVE, 0)  AS NBV,
               dsum.DEPRN_RUN_DATE                                  AS DEPRN_RUN_DATE,
               dsum.ACCOUNTED_STATUS                                AS ACCOUNTED_STATUS,
               CASE WHEN dsum.ASSET_ID IS NOT NULL THEN 'Posted' ELSE 'Not Posted' END AS STATUS
          FROM RR_FA_BOOKS b
          JOIN RR_FA_ADDITIONS a ON a.ASSET_ID = b.ASSET_ID
          LEFT JOIN (
                SELECT dd.ASSET_ID, dd.BOOK_TYPE_CODE,
                       SUM(NVL(dd.DEPRN_AMOUNT, 0))  AS DEPRN_AMOUNT,
                       SUM(NVL(dd.YTD_DEPRN, 0))     AS YTD_DEPRN,
                       SUM(NVL(dd.DEPRN_RESERVE, 0)) AS DEPRN_RESERVE,
                       SUM(NVL(dd.COST, 0))          AS COST,
                       MAX(dd.DEPRN_RUN_DATE)        AS DEPRN_RUN_DATE,
                       MAX(NVL(dd.ACCOUNTED_STATUS, 'UNACCOUNTED')) AS ACCOUNTED_STATUS
                  FROM RR_FA_DEPRN_DETAIL dd
                 WHERE dd.PERIOD_COUNTER = v_pc
                 GROUP BY dd.ASSET_ID, dd.BOOK_TYPE_CODE
          ) dsum ON dsum.ASSET_ID = b.ASSET_ID AND dsum.BOOK_TYPE_CODE = b.BOOK_TYPE_CODE
         WHERE b.BOOK_TYPE_CODE = v_book
           AND b.DATE_INEFFECTIVE IS NULL
           AND (v_an IS NULL OR UPPER(a.ASSET_NUMBER) LIKE UPPER('%' || v_an || '%'))
         ORDER BY a.ASSET_NUMBER
         OFFSET v_offset ROWS FETCH NEXT v_limit ROWS ONLY
    ) LOOP
        v_tot_cost  := v_tot_cost  + NVL(r.COST, 0);
        v_tot_deprn := v_tot_deprn + NVL(r.DEPRN_AMOUNT, 0);
        v_tot_nbv   := v_tot_nbv   + NVL(r.NBV, 0);

        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('assetId',         r.ASSET_ID);
        APEX_JSON.WRITE('assetNumber',     r.ASSET_NUMBER);
        APEX_JSON.WRITE('description',     r.DESCRIPTION);
        APEX_JSON.WRITE('cost',            r.COST);
        APEX_JSON.WRITE('deprnAmount',     r.DEPRN_AMOUNT);
        APEX_JSON.WRITE('ytdDeprn',        r.YTD_DEPRN);
        APEX_JSON.WRITE('deprnReserve',    r.DEPRN_RESERVE);
        APEX_JSON.WRITE('nbv',             r.NBV);
        APEX_JSON.WRITE('deprnRunDate',    r.DEPRN_RUN_DATE);
        APEX_JSON.WRITE('accountedStatus', r.ACCOUNTED_STATUS);
        APEX_JSON.WRITE('status',          r.STATUS);
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
    DBMS_OUTPUT.PUT_LINE('GET fa/deprn-by-period registered OK');
END;
/
