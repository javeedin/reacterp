-- ============================================================
-- PATCH: Fix FILE_CONTENT not saved for large files (PDF etc.)
--
-- JSON_OBJECT_T.GET_CLOB and JSON_VALUE RETURNING CLOB both have
-- internal Oracle size limits that silently truncate or return NULL
-- for large base64 strings (e.g. PDFs).
--
-- Fix: extract content CLOB directly from the raw body using
-- DBMS_LOB.INSTR + DBMS_LOB.COPY — finds "content":"..." in the
-- JSON text and copies it as a CLOB with NO size limit.
-- Base64 never contains " so the closing-quote search is exact.
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
    v_body_raw    BLOB    := :body;
    v_body_clob   CLOB;
    v_dest_off    INTEGER := 1;
    v_src_off     INTEGER := 1;
    v_lang_ctx    INTEGER := DBMS_LOB.DEFAULT_LANG_CTX;
    v_warning     INTEGER;
    v_file_name   VARCHAR2(500);
    v_file_type   VARCHAR2(100);
    v_file_size   NUMBER;
    v_created_by  VARCHAR2(150);
    v_content     CLOB;
    v_key         VARCHAR2(20)  := '"content":"';
    v_key_pos     INTEGER;
    v_end_pos     INTEGER;
    v_new_id      NUMBER;
BEGIN
    -- 1. Convert BLOB body → CLOB (no VARCHAR2 32767-byte limit)
    DBMS_LOB.CREATETEMPORARY(v_body_clob, TRUE);
    DBMS_LOB.CONVERTTOCLOB(
        v_body_clob, v_body_raw, DBMS_LOB.LOBMAXSIZE,
        v_dest_off, v_src_off,
        NLS_CHARSET_ID('AL32UTF8'), v_lang_ctx, v_warning
    );

    -- 2. Extract scalar fields (VARCHAR2) via JSON_TABLE — safe for short strings
    SELECT jt.file_name, jt.file_type, jt.file_size, jt.created_by
    INTO   v_file_name, v_file_type, v_file_size, v_created_by
    FROM   JSON_TABLE(v_body_clob, '$' COLUMNS (
               file_name  VARCHAR2(500)  PATH '$.fileName',
               file_type  VARCHAR2(100)  PATH '$.fileType',
               file_size  NUMBER         PATH '$.fileSize',
               created_by VARCHAR2(150)  PATH '$.createdBy'
           )) jt;

    -- 3. Extract content CLOB via direct string search (works for any size)
    --    Base64 alphabet = A-Z a-z 0-9 + / = — never contains "
    --    so the next " after "content":" is always the closing quote
    v_key_pos := DBMS_LOB.INSTR(v_body_clob, v_key);
    IF v_key_pos > 0 THEN
        v_key_pos := v_key_pos + LENGTH(v_key);
        v_end_pos := DBMS_LOB.INSTR(v_body_clob, '"', v_key_pos);
        IF v_end_pos > v_key_pos THEN
            DBMS_LOB.CREATETEMPORARY(v_content, TRUE);
            DBMS_LOB.COPY(v_content, v_body_clob, v_end_pos - v_key_pos, 1, v_key_pos);
        END IF;
    END IF;

    -- 4. Insert
    INSERT INTO RR_EXTERNAL_TRX_ATTACHMENTS
        (EXTERNAL_TRANSACTION_ID, FILE_NAME, FILE_TYPE, FILE_SIZE, FILE_CONTENT, CREATED_BY)
    VALUES
        (:externalTransactionId, v_file_name, v_file_type, v_file_size, v_content,
         NVL(v_created_by, 'SYSTEM'))
    RETURNING ID INTO v_new_id;

    COMMIT;
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('{"status":"success","id":' || v_new_id
        || ',"fileName":'      || APEX_JSON.STRINGIFY(v_file_name)
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
