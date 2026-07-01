-- =============================================================================
-- 20_FA_ASSET_NUMBER_SEQ.SQL
-- Sequence for FA Asset Numbers (last used = 100078)
-- GET reerp/fa/next-asset-number  → returns next number
-- =============================================================================

-- ── Sequence ─────────────────────────────────────────────────────────────────
-- Drop first if re-running
-- DROP SEQUENCE RR_FA_ASSET_NUMBER_SEQ;

CREATE SEQUENCE RR_FA_ASSET_NUMBER_SEQ
    START WITH  100079
    INCREMENT BY 1
    NOCACHE
    NOCYCLE;

-- ── ORDS Template ─────────────────────────────────────────────────────────────
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'fa/next-asset-number',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'FA: get next asset number from sequence'
    );
    COMMIT;
END;
/

-- ── ORDS Handler ──────────────────────────────────────────────────────────────
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'fa/next-asset-number',
        p_method         => 'GET',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_source         => q'[
DECLARE
    v_next NUMBER;
BEGIN
    SELECT RR_FA_ASSET_NUMBER_SEQ.NEXTVAL INTO v_next FROM DUAL;
    APEX_JSON.INITIALIZE_CLOB_OUTPUT;
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success',     TRUE);
    APEX_JSON.WRITE('assetNumber', TO_CHAR(v_next));
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
END;
/
