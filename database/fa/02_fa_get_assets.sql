-- =============================================================================
-- 02_FA_GET_ASSETS.SQL
-- GET reerp/fa/assets          — search / list assets
-- GET reerp/fa/assets/:assetId — single asset detail
-- =============================================================================


-- ============================================================
-- TEMPLATE: fa/assets
-- ============================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'fa/assets',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'FA: search / list assets'
    );
    COMMIT;
END;
/


-- ============================================================
-- GET fa/assets
-- Query params: assetNumber, description, category,
--               bookTypeCode, assetType, status,
--               offset (default 0), limit (default 25)
-- ============================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'fa/assets',
        p_method         => 'GET',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_source         => q'[
DECLARE
    v_offset      NUMBER  := NVL(:offset, 0);
    v_limit       NUMBER  := NVL(:limit,  25);
    v_total       NUMBER  := 0;

    -- Dynamic WHERE fragments
    v_where       VARCHAR2(2000) := ' WHERE 1=1 ';

    v_sql_count   VARCHAR2(4000);
    v_sql_main    VARCHAR2(4000);

    TYPE t_cur IS REF CURSOR;
    v_cur         t_cur;

    -- Row variables
    v_asset_id              VARCHAR2(100);
    v_asset_number          VARCHAR2(200);
    v_description           VARCHAR2(4000);
    v_asset_type            VARCHAR2(100);
    v_category_id           VARCHAR2(100);
    v_tag_number            VARCHAR2(200);
    v_serial_number         VARCHAR2(200);
    v_manufacturer          VARCHAR2(200);
    v_in_use_flag           VARCHAR2(10);
    v_owned_leased          VARCHAR2(30);
    v_units                 VARCHAR2(50);
    v_current_units         VARCHAR2(50);
    v_capitalized_flag      VARCHAR2(10);
    v_retired_flag          VARCHAR2(10);
    v_book_type_code        VARCHAR2(100);
    v_date_placed           VARCHAR2(100);
    v_cost                  VARCHAR2(100);
    v_adjusted_cost         VARCHAR2(100);
    v_salvage_value         VARCHAR2(100);
    v_deprn_reserve         VARCHAR2(100);
    v_nbv                   VARCHAR2(100);
    v_creation_date         VARCHAR2(100);
    v_last_update_date      VARCHAR2(100);
    v_first                 BOOLEAN := TRUE;
BEGIN
    -- Build WHERE
    IF :assetNumber IS NOT NULL THEN
        v_where := v_where || ' AND UPPER(a.ASSET_NUMBER) LIKE UPPER(''%' || :assetNumber || '%'')';
    END IF;
    IF :description IS NOT NULL THEN
        v_where := v_where || ' AND UPPER(a.DESCRIPTION) LIKE UPPER(''%' || :description || '%'')';
    END IF;
    IF :category IS NOT NULL THEN
        v_where := v_where || ' AND a.ASSET_CATEGORY_ID = ''' || :category || '''';
    END IF;
    IF :bookTypeCode IS NOT NULL THEN
        v_where := v_where || ' AND b.BOOK_TYPE_CODE = ''' || :bookTypeCode || '''';
    END IF;
    IF :assetType IS NOT NULL THEN
        v_where := v_where || ' AND a.ASSET_TYPE = ''' || :assetType || '''';
    END IF;
    IF :status = 'RETIRED' THEN
        v_where := v_where || ' AND a.RETIRED_FLAG = ''YES''';
    ELSIF :status = 'ACTIVE' THEN
        v_where := v_where || ' AND NVL(a.RETIRED_FLAG,''NO'') <> ''YES''';
    END IF;

    -- Count
    v_sql_count :=
        'SELECT COUNT(*) FROM RR_FA_ADDITIONS a '
     || 'LEFT JOIN (SELECT * FROM RR_FA_BOOKS WHERE DATE_INEFFECTIVE IS NULL) b ON a.ASSET_ID = b.ASSET_ID '
     || v_where;

    EXECUTE IMMEDIATE v_sql_count INTO v_total;

    -- Main query
    v_sql_main :=
        'SELECT a.ASSET_ID, a.ASSET_NUMBER, a.DESCRIPTION, a.ASSET_TYPE, '
     || '       a.ASSET_CATEGORY_ID, a.TAG_NUMBER, a.SERIAL_NUMBER, a.MANUFACTURER_NAME, '
     || '       a.IN_USE_FLAG, a.OWNED_LEASED, a.UNITS, a.CURRENT_UNITS, '
     || '       a.CAPITALIZED_FLAG, a.RETIRED_FLAG, '
     || '       b.BOOK_TYPE_CODE, b.DATE_PLACED_IN_SERVICE, b.COST, b.ADJUSTED_COST, '
     || '       b.SALVAGE_VALUE, '
     || '       NVL(ds.DEPRN_RESERVE, 0) AS DEPRN_RESERVE, '
     || '       NVL(b.COST,0) - NVL(ds.DEPRN_RESERVE,0) AS NBV, '
     || '       a.CREATION_DATE, a.LAST_UPDATE_DATE '
     || 'FROM RR_FA_ADDITIONS a '
     || 'LEFT JOIN (SELECT * FROM RR_FA_BOOKS WHERE DATE_INEFFECTIVE IS NULL) b ON a.ASSET_ID = b.ASSET_ID '
     || 'LEFT JOIN ( '
     || '    SELECT ds1.ASSET_ID, ds1.BOOK_TYPE_CODE, ds1.DEPRN_RESERVE '
     || '    FROM RR_FA_DEPRN_SUMMARY ds1 '
     || '    WHERE ds1.PERIOD_COUNTER = ( '
     || '        SELECT MAX(ds2.PERIOD_COUNTER) FROM RR_FA_DEPRN_SUMMARY ds2 '
     || '        WHERE ds2.ASSET_ID = ds1.ASSET_ID AND ds2.BOOK_TYPE_CODE = ds1.BOOK_TYPE_CODE) '
     || ') ds ON a.ASSET_ID = ds.ASSET_ID AND b.BOOK_TYPE_CODE = ds.BOOK_TYPE_CODE '
     || v_where
     || ' ORDER BY a.ASSET_NUMBER '
     || ' OFFSET ' || v_offset || ' ROWS FETCH NEXT ' || v_limit || ' ROWS ONLY';

    -- Build JSON
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
        APEX_JSON.WRITE('assetId',         v_asset_id);
        APEX_JSON.WRITE('assetNumber',     v_asset_number);
        APEX_JSON.WRITE('description',     v_description);
        APEX_JSON.WRITE('assetType',       v_asset_type);
        APEX_JSON.WRITE('categoryId',      v_category_id);
        APEX_JSON.WRITE('tagNumber',       v_tag_number);
        APEX_JSON.WRITE('serialNumber',    v_serial_number);
        APEX_JSON.WRITE('manufacturer',    v_manufacturer);
        APEX_JSON.WRITE('inUseFlag',       v_in_use_flag);
        APEX_JSON.WRITE('ownedLeased',     v_owned_leased);
        APEX_JSON.WRITE('units',           v_units);
        APEX_JSON.WRITE('currentUnits',    v_current_units);
        APEX_JSON.WRITE('capitalizedFlag', v_capitalized_flag);
        APEX_JSON.WRITE('retiredFlag',     v_retired_flag);
        APEX_JSON.WRITE('bookTypeCode',    v_book_type_code);
        APEX_JSON.WRITE('datePlacedInService', v_date_placed);
        APEX_JSON.WRITE('cost',            v_cost);
        APEX_JSON.WRITE('adjustedCost',    v_adjusted_cost);
        APEX_JSON.WRITE('salvageValue',    v_salvage_value);
        APEX_JSON.WRITE('deprnReserve',    v_deprn_reserve);
        APEX_JSON.WRITE('nbv',             v_nbv);
        APEX_JSON.WRITE('creationDate',    v_creation_date);
        APEX_JSON.WRITE('lastUpdateDate',  v_last_update_date);
        APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    CLOSE v_cur;

    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
    :status := 200;
    HTP.P(APEX_JSON.GET_CLOB_OUTPUT);
    APEX_JSON.FREE_OUTPUT;

EXCEPTION
    WHEN OTHERS THEN
        :status := 500;
        HTP.P('{"success":false,"error":"' || REPLACE(SQLERRM,'"','\"') || '"}');
END;
        ]'
    );
    COMMIT;
END;
/


-- ============================================================
-- TEMPLATE: fa/assets/:assetId
-- ============================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'fa/assets/:assetId',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'FA: single asset detail'
    );
    COMMIT;
END;
/


-- ============================================================
-- GET fa/assets/:assetId
-- ============================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'fa/assets/:assetId',
        p_method         => 'GET',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_source         => q'[
DECLARE
    v_asset_id              RR_FA_ADDITIONS.ASSET_ID%TYPE;
    v_asset_number          RR_FA_ADDITIONS.ASSET_NUMBER%TYPE;
    v_asset_type            RR_FA_ADDITIONS.ASSET_TYPE%TYPE;
    v_tag_number            RR_FA_ADDITIONS.TAG_NUMBER%TYPE;
    v_description           RR_FA_ADDITIONS.DESCRIPTION%TYPE;
    v_category_id           RR_FA_ADDITIONS.ASSET_CATEGORY_ID%TYPE;
    v_parent_asset_id       RR_FA_ADDITIONS.PARENT_ASSET_ID%TYPE;
    v_manufacturer          RR_FA_ADDITIONS.MANUFACTURER_NAME%TYPE;
    v_serial_number         RR_FA_ADDITIONS.SERIAL_NUMBER%TYPE;
    v_model_number          RR_FA_ADDITIONS.MODEL_NUMBER%TYPE;
    v_in_use_flag           RR_FA_ADDITIONS.IN_USE_FLAG%TYPE;
    v_owned_leased          RR_FA_ADDITIONS.OWNED_LEASED%TYPE;
    v_new_used              RR_FA_ADDITIONS.NEW_USED%TYPE;
    v_units                 RR_FA_ADDITIONS.UNITS%TYPE;
    v_current_units         RR_FA_ADDITIONS.CURRENT_UNITS%TYPE;
    v_inventorial           RR_FA_ADDITIONS.INVENTORIAL%TYPE;
    v_capitalized_flag      RR_FA_ADDITIONS.CAPITALIZED_FLAG%TYPE;
    v_retired_flag          RR_FA_ADDITIONS.RETIRED_FLAG%TYPE;
    v_pending_flag          RR_FA_ADDITIONS.PENDING_FLAG%TYPE;
    v_property_type         RR_FA_ADDITIONS.PROPERTY_TYPE_CODE%TYPE;
    v_feeder_system         RR_FA_ADDITIONS.FEEDER_SYSTEM_NAME%TYPE;
    v_creation_date         VARCHAR2(100);
    v_created_by            RR_FA_ADDITIONS.CREATED_BY%TYPE;
    v_last_update_date      VARCHAR2(100);
    v_last_updated_by       RR_FA_ADDITIONS.LAST_UPDATED_BY%TYPE;
    v_tl_description        RR_FA_ADDITIONS_TL.DESCRIPTION%TYPE;
BEGIN
    SELECT a.ASSET_ID, a.ASSET_NUMBER, a.ASSET_TYPE, a.TAG_NUMBER, a.DESCRIPTION,
           a.ASSET_CATEGORY_ID, a.PARENT_ASSET_ID, a.MANUFACTURER_NAME, a.SERIAL_NUMBER,
           a.MODEL_NUMBER, a.IN_USE_FLAG, a.OWNED_LEASED, a.NEW_USED,
           a.UNITS, a.CURRENT_UNITS, a.INVENTORIAL, a.CAPITALIZED_FLAG,
           a.RETIRED_FLAG, a.PENDING_FLAG, a.PROPERTY_TYPE_CODE, a.FEEDER_SYSTEM_NAME,
           TO_CHAR(a.CREATION_DATE,'YYYY-MM-DD'), a.CREATED_BY,
           TO_CHAR(a.LAST_UPDATE_DATE,'YYYY-MM-DD'), a.LAST_UPDATED_BY,
           NVL(tl.DESCRIPTION, a.DESCRIPTION)
    INTO   v_asset_id, v_asset_number, v_asset_type, v_tag_number, v_description,
           v_category_id, v_parent_asset_id, v_manufacturer, v_serial_number,
           v_model_number, v_in_use_flag, v_owned_leased, v_new_used,
           v_units, v_current_units, v_inventorial, v_capitalized_flag,
           v_retired_flag, v_pending_flag, v_property_type, v_feeder_system,
           v_creation_date, v_created_by, v_last_update_date, v_last_updated_by,
           v_tl_description
    FROM   RR_FA_ADDITIONS a
    LEFT JOIN RR_FA_ADDITIONS_TL tl
           ON tl.ASSET_ID = a.ASSET_ID AND tl.LANGUAGE = 'US'
    WHERE  a.ASSET_ID = :assetId
    AND    ROWNUM = 1;

    APEX_JSON.INITIALIZE_CLOB_OUTPUT;
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success',          TRUE);
    APEX_JSON.WRITE('assetId',          v_asset_id);
    APEX_JSON.WRITE('assetNumber',      v_asset_number);
    APEX_JSON.WRITE('assetType',        v_asset_type);
    APEX_JSON.WRITE('tagNumber',        v_tag_number);
    APEX_JSON.WRITE('description',      v_description);
    APEX_JSON.WRITE('tlDescription',    v_tl_description);
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
    :status := 200;
    HTP.P(APEX_JSON.GET_CLOB_OUTPUT);
    APEX_JSON.FREE_OUTPUT;

EXCEPTION
    WHEN NO_DATA_FOUND THEN
        :status := 404;
        HTP.P('{"success":false,"error":"Asset ' || :assetId || ' not found"}');
    WHEN OTHERS THEN
        :status := 500;
        HTP.P('{"success":false,"error":"' || REPLACE(SQLERRM,'"','\"') || '"}');
END;
        ]'
    );
    COMMIT;
END;
/
