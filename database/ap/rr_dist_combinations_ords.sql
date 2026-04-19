-- ============================================================
-- Distribution Combinations — ORDS REST Handlers
-- File: database/ap/rr_dist_combinations_ords.sql
-- Run order: 3rd
-- Base path: /distributions/
-- ============================================================

-- Clean up any existing module to avoid handler conflicts
BEGIN
    ORDS.DELETE_MODULE(
        p_module_name => 'distributions'
    );
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_MODULE(
        p_module_name    => 'distributions',
        p_base_path      => '/distributions/',
        p_items_per_page => 100,
        p_status         => 'PUBLISHED',
        p_comments       => 'Distribution Combinations master data'
    );

    -- ──────────────────────────────────────────────────────────
    -- Template: combinations
    -- ──────────────────────────────────────────────────────────
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'distributions',
        p_pattern        => 'combinations'
    );

    -- GET /distributions/combinations?q=&module=&status=&bu=
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'distributions',
        p_pattern        => 'combinations',
        p_method         => 'GET',
        p_source_type    => ORDS.source_type_collection_feed,
        p_items_per_page => 200,
        p_source         => q'[
            SELECT
                c.COMBINATION_ID      AS "combinationId",
                c.COMBINATION_NAME    AS "combinationName",
                c.BUSINESS_UNIT       AS "businessUnit",
                c.GL_ACCOUNT_CCID     AS "glAccountCcid",
                c.GL_ACCOUNT_DESC     AS "glAccountDesc",
                c.MODULE              AS "module",
                c.DESCRIPTION         AS "description",
                c.STATUS              AS "status",
                c.CREATED_BY          AS "createdBy",
                TO_CHAR(c.CREATION_DATE, 'YYYY-MM-DD"T"HH24:MI:SS')  AS "creationDate",
                c.LAST_UPDATED_BY     AS "lastUpdatedBy",
                TO_CHAR(c.LAST_UPDATE_DATE, 'YYYY-MM-DD"T"HH24:MI:SS') AS "lastUpdateDate"
            FROM RR_DIST_COMBINATIONS c
            WHERE 1=1
              AND ((:q      IS NULL OR :q      = '') OR UPPER(c.COMBINATION_NAME) LIKE '%' || UPPER(:q) || '%')
              AND ((:module IS NULL OR :module = '') OR c.MODULE = :module)
              AND ((:status IS NULL OR :status = '') OR c.STATUS = :status)
              AND ((:bu     IS NULL OR :bu     = '') OR c.BUSINESS_UNIT = :bu)
            ORDER BY c.MODULE, c.COMBINATION_NAME
        ]'
    );

    -- POST /distributions/combinations
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'distributions',
        p_pattern        => 'combinations',
        p_method         => 'POST',
        p_source_type    => ORDS.source_type_plsql,
        p_source         => q'[
            DECLARE
                l_body CLOB := :body_text;
            BEGIN
                RR_DIST_PKG.create_combination(l_body);
            END;
        ]'
    );

    -- ──────────────────────────────────────────────────────────
    -- Template: combinations/:combinationId
    -- ──────────────────────────────────────────────────────────
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'distributions',
        p_pattern        => 'combinations/:combinationId'
    );

    -- PUT /distributions/combinations/:combinationId
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'distributions',
        p_pattern        => 'combinations/:combinationId',
        p_method         => 'PUT',
        p_source_type    => ORDS.source_type_plsql,
        p_source         => q'[
            DECLARE
                l_body CLOB := :body_text;
                l_id   NUMBER := :combinationId;
            BEGIN
                RR_DIST_PKG.update_combination(l_id, l_body);
            END;
        ]'
    );

    -- DELETE /distributions/combinations/:combinationId
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'distributions',
        p_pattern        => 'combinations/:combinationId',
        p_method         => 'DELETE',
        p_source_type    => ORDS.source_type_plsql,
        p_source         => q'[
            DECLARE
                l_id NUMBER := :combinationId;
            BEGIN
                RR_DIST_PKG.delete_combination(l_id);
            END;
        ]'
    );

    COMMIT;
END;
/
