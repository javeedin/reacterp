-- ============================================================
-- PATCH: Fix FILE_CONTENT not saving — use query params + plain body
--
-- All JSON-based approaches (:body_text VARCHAR2 limit, JSON_TABLE CLOB,
-- JSON_VALUE RETURNING CLOB, JSON_OBJECT_T.GET_CLOB) have Oracle internal
-- size limits that silently fail for large base64 strings like PDFs.
--
-- New approach (no JSON parsing at all):
--   POST /cash/externaltransactions/{id}/attachments
--        ?fileName=test.pdf&fileType=application/pdf&fileSize=12345&createdBy=ERP_USER
--   Content-Type: text/plain
--   Body: <raw base64 string>
--
-- Metadata comes from URL query string bound as ORDS variables.
-- File content comes from :body (BLOB) converted directly to CLOB.
-- No JSON parsing → no size limits → works for any file size.
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
        p_mimes_allowed  => '',
        p_comments       => 'Upload attachment — metadata via query params, content as plain body',
        p_source         => q'[
DECLARE
    v_dest_off   INTEGER := 1;
    v_src_off    INTEGER := 1;
    v_lang_ctx   INTEGER := DBMS_LOB.DEFAULT_LANG_CTX;
    v_warning    INTEGER;
    v_content    CLOB;
    v_new_id     NUMBER;
BEGIN
    -- Convert raw body BLOB → CLOB (the body IS the base64 content, no JSON wrapping)
    DBMS_LOB.CREATETEMPORARY(v_content, TRUE);
    DBMS_LOB.CONVERTTOCLOB(
        v_content, :body, DBMS_LOB.LOBMAXSIZE,
        v_dest_off, v_src_off,
        NLS_CHARSET_ID('AL32UTF8'), v_lang_ctx, v_warning
    );

    -- Metadata comes from URL query string parameters
    INSERT INTO RR_EXTERNAL_TRX_ATTACHMENTS
        (EXTERNAL_TRANSACTION_ID, FILE_NAME, FILE_TYPE, FILE_SIZE, FILE_CONTENT, CREATED_BY)
    VALUES
        (:externalTransactionId,
         :fileName,
         :fileType,
         TO_NUMBER(:fileSize),
         v_content,
         NVL(:createdBy, 'SYSTEM'))
    RETURNING ID INTO v_new_id;

    COMMIT;
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('{"status":"success","id":' || v_new_id
        || ',"fileName":'      || APEX_JSON.STRINGIFY(:fileName)
        || ',"contentLength":' || NVL(DBMS_LOB.GETLENGTH(v_content), 0)
        || '}');
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
