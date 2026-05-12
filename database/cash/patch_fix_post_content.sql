-- ============================================================
-- PATCH: Fix FILE_CONTENT not saved on attachment POST
--
-- Root cause: :body_text in ORDS is VARCHAR2 (max 32767 bytes).
-- Any base64 file > ~24 KB is silently truncated, breaking JSON
-- parsing so FILE_CONTENT always ends up NULL.
--
-- Fix: use :body (BLOB — full request body, no size limit),
-- convert to CLOB, then parse with JSON_OBJECT_T which has a
-- GET_CLOB method that works for large string values.
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
    v_body_raw   BLOB          := :body;
    v_body_clob  CLOB;
    v_dest_off   INTEGER       := 1;
    v_src_off    INTEGER       := 1;
    v_lang_ctx   INTEGER       := DBMS_LOB.DEFAULT_LANG_CTX;
    v_warning    INTEGER;
    l_json       JSON_OBJECT_T;
    v_file_name  VARCHAR2(500);
    v_file_type  VARCHAR2(100);
    v_file_size  NUMBER;
    v_content    CLOB;
    v_created_by VARCHAR2(150);
    v_new_id     NUMBER;
BEGIN
    -- Convert BLOB body to CLOB (UTF-8) — avoids 32767-byte VARCHAR2 limit of :body_text
    DBMS_LOB.CREATETEMPORARY(v_body_clob, TRUE);
    DBMS_LOB.CONVERTTOCLOB(
        v_body_clob, v_body_raw, DBMS_LOB.LOBMAXSIZE,
        v_dest_off, v_src_off,
        NLS_CHARSET_ID('AL32UTF8'), v_lang_ctx, v_warning
    );

    -- Parse JSON and extract all fields including large CLOB content
    l_json       := JSON_OBJECT_T.PARSE(v_body_clob);
    v_file_name  := l_json.GET_STRING('fileName');
    v_file_type  := l_json.GET_STRING('fileType');
    v_file_size  := l_json.GET_NUMBER('fileSize');
    v_created_by := NVL(l_json.GET_STRING('createdBy'), 'SYSTEM');
    v_content    := l_json.GET_CLOB('content');

    INSERT INTO RR_EXTERNAL_TRX_ATTACHMENTS
        (EXTERNAL_TRANSACTION_ID, FILE_NAME, FILE_TYPE, FILE_SIZE, FILE_CONTENT, CREATED_BY)
    VALUES
        (:externalTransactionId, v_file_name, v_file_type, v_file_size, v_content, v_created_by)
    RETURNING ID INTO v_new_id;

    COMMIT;
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('{"status":"success","id":' || v_new_id
        || ',"fileName":'     || APEX_JSON.STRINGIFY(v_file_name)
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
