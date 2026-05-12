-- ============================================================
-- PATCH: Fix FILE_CONTENT not being saved on attachment POST
--
-- Root cause: Oracle JSON_TABLE silently returns NULL for CLOB
-- columns when the JSON body is large (e.g. a real file in base64).
-- Fix: extract scalar fields via JSON_TABLE, then extract the CLOB
-- content separately using JSON_VALUE(...  RETURNING CLOB).
--
-- Run in SQL Workshop → SQL Commands
-- ============================================================

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'cash/externaltransactions/:externalTransactionId/attachments',
        p_method         => 'POST',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_mimes_allowed  => 'application/json',
        p_comments       => 'Upload attachment for a transaction',
        p_source         => q'[
DECLARE
    v_file_name  VARCHAR2(500);
    v_file_type  VARCHAR2(100);
    v_file_size  NUMBER;
    v_content    CLOB;
    v_created_by VARCHAR2(150);
    v_new_id     NUMBER;
BEGIN
    -- Extract scalar fields via JSON_TABLE
    SELECT jt.file_name, jt.file_type, jt.file_size, jt.created_by
    INTO   v_file_name, v_file_type, v_file_size, v_created_by
    FROM   JSON_TABLE(:body_text, '$' COLUMNS (
               file_name  VARCHAR2(500)  PATH '$.fileName',
               file_type  VARCHAR2(100)  PATH '$.fileType',
               file_size  NUMBER         PATH '$.fileSize',
               created_by VARCHAR2(150)  PATH '$.createdBy'
           )) jt;

    -- Extract CLOB content separately — JSON_TABLE silently returns NULL for large CLOBs
    v_content := JSON_VALUE(:body_text, '$.content' RETURNING CLOB);

    INSERT INTO RR_EXTERNAL_TRX_ATTACHMENTS
        (EXTERNAL_TRANSACTION_ID, FILE_NAME, FILE_TYPE, FILE_SIZE, FILE_CONTENT, CREATED_BY)
    VALUES
        (:externalTransactionId, v_file_name, v_file_type, v_file_size, v_content, NVL(v_created_by,'SYSTEM'))
    RETURNING ID INTO v_new_id;

    COMMIT;
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('{"status":"success","id":' || v_new_id || ',"fileName":' || APEX_JSON.STRINGIFY(v_file_name) || ',"contentLength":' || NVL(DBMS_LOB.GETLENGTH(v_content),0) || '}');
EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('{"status":"error","message":' || APEX_JSON.STRINGIFY(SQLERRM) || '}');
END;
]'
    );
    COMMIT;
END;
/
