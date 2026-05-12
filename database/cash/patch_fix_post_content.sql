-- ============================================================
-- PATCH: Fix FILE_CONTENT not saving for PDFs / large files
--
-- HOW TO RUN IN SQL WORKSHOP:
--   1. Copy EVERYTHING below (the entire file)
--   2. Oracle APEX → SQL Workshop → SQL Commands
--   3. Paste and click RUN
--   4. You should see "PL/SQL procedure successfully completed"
--
-- If you only see the inner DECLARE block and run that alone,
-- the handler is NOT registered — you must run the outer
-- BEGIN ORDS.DEFINE_HANDLER(...) END; wrapper.
-- ============================================================

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'cash/externaltransactions/:externalTransactionId/attachments',
        p_method         => 'POST',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_mimes_allowed  => '',
        p_comments       => 'Upload attachment for a transaction v4',
        p_source         => q'[
DECLARE
    v_blob       BLOB    := :body;
    v_blob_len   INTEGER;
    v_body_clob  CLOB;
    v_dest_off   INTEGER := 1;
    v_src_off    INTEGER := 1;
    v_lang_ctx   INTEGER := DBMS_LOB.DEFAULT_LANG_CTX;
    v_warning    INTEGER;
    v_file_name  VARCHAR2(500);
    v_file_type  VARCHAR2(100);
    v_file_size  NUMBER;
    v_created_by VARCHAR2(150);
    v_content    CLOB;
    v_key        VARCHAR2(20) := '"content":"';
    v_key_pos    INTEGER;
    v_end_pos    INTEGER;
    v_clob_len   INTEGER;
    v_new_id     NUMBER;
BEGIN
    v_blob_len := CASE WHEN v_blob IS NULL THEN 0 ELSE DBMS_LOB.GETLENGTH(v_blob) END;
    IF v_blob_len = 0 THEN
        OWA_UTIL.MIME_HEADER('application/json', FALSE);
        HTP.P('{"status":"error","message":"empty body"}');
        RETURN;
    END IF;

    DBMS_LOB.CREATETEMPORARY(v_body_clob, TRUE);
    DBMS_LOB.CONVERTTOCLOB(
        v_body_clob, v_blob, DBMS_LOB.LOBMAXSIZE,
        v_dest_off, v_src_off,
        NLS_CHARSET_ID('AL32UTF8'), v_lang_ctx, v_warning
    );
    v_clob_len := DBMS_LOB.GETLENGTH(v_body_clob);

    SELECT jt.file_name, jt.file_type, jt.file_size, jt.created_by
    INTO   v_file_name, v_file_type, v_file_size, v_created_by
    FROM   JSON_TABLE(v_body_clob, '$' COLUMNS (
               file_name  VARCHAR2(500)  PATH '$.fileName',
               file_type  VARCHAR2(100)  PATH '$.fileType',
               file_size  NUMBER         PATH '$.fileSize',
               created_by VARCHAR2(150)  PATH '$.createdBy'
           )) jt;

    v_key_pos := DBMS_LOB.INSTR(v_body_clob, v_key);
    IF v_key_pos > 0 THEN
        v_key_pos := v_key_pos + LENGTH(v_key);
        v_end_pos := DBMS_LOB.INSTR(v_body_clob, '"', v_key_pos);
        IF v_end_pos > v_key_pos THEN
            DBMS_LOB.CREATETEMPORARY(v_content, TRUE);
            DBMS_LOB.COPY(v_content, v_body_clob, v_end_pos - v_key_pos, 1, v_key_pos);
        END IF;
    END IF;

    INSERT INTO RR_EXTERNAL_TRX_ATTACHMENTS
        (EXTERNAL_TRANSACTION_ID, FILE_NAME, FILE_TYPE, FILE_SIZE, FILE_CONTENT, CREATED_BY)
    VALUES
        (:externalTransactionId, v_file_name, v_file_type, v_file_size, v_content,
         NVL(v_created_by, 'SYSTEM'))
    RETURNING ID INTO v_new_id;

    COMMIT;
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('{"status":"success","version":"v4","id":' || v_new_id
        || ',"bodyLen":'       || v_blob_len
        || ',"clobLen":'       || NVL(v_clob_len, 0)
        || ',"keyPos":'        || NVL(v_key_pos, 0)
        || ',"endPos":'        || NVL(v_end_pos, 0)
        || ',"contentLength":' || NVL(DBMS_LOB.GETLENGTH(v_content), 0)
        || '}');
EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('{"status":"error","version":"v4","message":' || APEX_JSON.STRINGIFY(SQLERRM)
        || ',"bodyLen":' || NVL(v_blob_len, -1)
        || ',"clobLen":' || NVL(v_clob_len, -1) || '}');
END;
]'
    );
    COMMIT;
END;
/
