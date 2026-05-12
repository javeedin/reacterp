-- ============================================================
-- PATCH v7: Upload attachment — JSON_OBJECT_T approach
--           (same proven pattern as RR_AP_INVOICE_ATTACHMENTS)
--
-- HOW TO RUN IN SQL WORKSHOP → SQL Commands:
--   Copy the entire BEGIN...END; block below, paste, click Run.
--   Expected: "PL/SQL procedure successfully completed."
--
-- REQUEST FORMAT (same as before):
--   POST  .../attachments
--   Content-Type: application/json
--   Body: { "fileName":"...", "fileType":"...", "fileSize":N,
--           "content":"<base64>", "createdBy":"..." }
-- ============================================================

BEGIN
    BEGIN
        ORDS.DELETE_HANDLER(
            p_module_name => 'reerp',
            p_pattern     => 'cash/externaltransactions/:externalTransactionId/attachments',
            p_method      => 'POST'
        );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'cash/externaltransactions/:externalTransactionId/attachments',
        p_method         => 'POST',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_mimes_allowed  => '',
        p_comments       => 'Upload attachment v7 - JSON_OBJECT_T',
        p_source         => q'[
DECLARE
    v_blob       BLOB := :body;
    v_blob_len   INTEGER;
    v_body_clob  CLOB;
    v_dest_off   INTEGER := 1;
    v_src_off    INTEGER := 1;
    v_lang_ctx   INTEGER := DBMS_LOB.DEFAULT_LANG_CTX;
    v_warning    INTEGER;
    v_json       JSON_OBJECT_T;
    v_file_name  VARCHAR2(500);
    v_file_type  VARCHAR2(100);
    v_file_size  NUMBER;
    v_created_by VARCHAR2(150);
    v_content    CLOB;
    v_new_id     NUMBER;
BEGIN
    v_blob_len := CASE WHEN v_blob IS NULL THEN 0 ELSE DBMS_LOB.GETLENGTH(v_blob) END;
    IF v_blob_len = 0 THEN
        HTP.P('{"status":"error","message":"empty body"}');
        RETURN;
    END IF;

    -- Convert BLOB body to CLOB then parse as JSON
    DBMS_LOB.CREATETEMPORARY(v_body_clob, TRUE);
    DBMS_LOB.CONVERTTOCLOB(
        v_body_clob, v_blob, DBMS_LOB.LOBMAXSIZE,
        v_dest_off, v_src_off,
        NLS_CHARSET_ID('AL32UTF8'), v_lang_ctx, v_warning
    );

    v_json       := JSON_OBJECT_T.PARSE(v_body_clob);
    v_file_name  := v_json.GET_STRING('fileName');
    v_file_type  := v_json.GET_STRING('fileType');
    v_file_size  := v_json.GET_NUMBER('fileSize');
    v_created_by := v_json.GET_STRING('createdBy');
    v_content    := v_json.GET_CLOB('content');

    INSERT INTO RR_EXTERNAL_TRX_ATTACHMENTS
        (EXTERNAL_TRANSACTION_ID, FILE_NAME, FILE_TYPE, FILE_SIZE, FILE_CONTENT, CREATED_BY)
    VALUES
        (:externalTransactionId, v_file_name, v_file_type, v_file_size, v_content,
         NVL(v_created_by, 'SYSTEM'))
    RETURNING ID INTO v_new_id;

    COMMIT;
    HTP.P('{"status":"success","id":' || v_new_id
        || ',"bodyLen":'       || v_blob_len
        || ',"contentLength":' || NVL(DBMS_LOB.GETLENGTH(v_content), 0)
        || '}');
EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    HTP.P('{"status":"error","message":' || APEX_JSON.STRINGIFY(SQLERRM)
        || ',"bodyLen":' || NVL(v_blob_len, -1) || '}');
END;
]'
    );
    COMMIT;
END;
/
