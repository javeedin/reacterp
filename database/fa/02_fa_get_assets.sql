-- =============================================================================
-- 02_FA_GET_ASSETS.SQL
-- GET reerp/fa/assets          — search / list assets
-- GET reerp/fa/assets/:assetId — single asset detail
-- Business logic lives in RR_FA_PKG (09_rr_fa_pkg_body.sql).
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
--               bookTypeCode, assetType, assetStatus,
--               offset (default 0), limit (default 25)
-- NOTE: use ?assetStatus=ACTIVE|RETIRED  (:status is reserved
--       by ORDS for the HTTP response code)
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
    v_status NUMBER;
    v_result CLOB;
BEGIN
    RR_FA_PKG.GET_ASSETS(
        p_asset_number => :assetNumber,
        p_description  => :description,
        p_category     => :category,
        p_book_type    => :bookTypeCode,
        p_asset_type   => :assetType,
        p_status       => :assetStatus,
        p_offset       => NVL(:offset, 0),
        p_limit        => NVL(:limit,  25),
        p_http_status  => v_status,
        p_result       => v_result
    );
    :status := v_status;
    HTP.P(v_result);
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
    v_status NUMBER;
    v_result CLOB;
BEGIN
    RR_FA_PKG.GET_ASSET_DETAIL(
        p_asset_id    => :assetId,
        p_http_status => v_status,
        p_result      => v_result
    );
    :status := v_status;
    HTP.P(v_result);
END;
        ]'
    );
    COMMIT;
END;
/
