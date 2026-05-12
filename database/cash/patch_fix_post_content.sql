-- ============================================================
-- PATCH v6: Upload attachment — auto-detects JSON or raw binary
--
-- HOW TO RUN IN SQL WORKSHOP → SQL Commands:
--   Copy the entire BEGIN...END; block below, paste, click Run.
--   Expected: "PL/SQL procedure successfully completed."
--
-- SUPPORTS TWO REQUEST FORMATS:
--
--   FORMAT A — JSON body (Postman ↓ Postman JSON button):
--     POST  .../attachments
--     Content-Type: application/json
--     Body: { "fileName":"...", "fileType":"...", "fileSize":N,
--             "content":"<base64>", "createdBy":"..." }
--
--   FORMAT B — Raw binary body (app + Postman binary):
--     POST  .../attachments?fileName=...&fileType=...&fileSize=N&createdBy=...
--     Content-Type: application/octet-stream
--     Body: raw file bytes
--
-- The handler detects the format by checking whether the body
-- starts with '{' (JSON) or not (binary).
-- ============================================================

BEGIN
    -- Remove old handler first (safe if it does not exist)
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
        p_comments       => 'Upload attachment v6 - auto-detects JSON or binary',
        p_source         => q'[
DECLARE
    v_blob       BLOB    := :body;
    v_blob_len   INTEGER;
    v_first_byte RAW(1);
    v_is_json    BOOLEAN := FALSE;
    -- JSON path
    v_body_clob  CLOB;
    v_dest_off   INTEGER := 1;
    v_src_off    INTEGER := 1;
    v_lang_ctx   INTEGER := DBMS_LOB.DEFAULT_LANG_CTX;
    v_warning    INTEGER;
    v_key_pos    INTEGER;
    v_end_pos    INTEGER;
    -- Binary path
    v_chunk      RAW(15000);
    v_b64_raw    RAW(21000);
    v_b64_str    VARCHAR2(32767);
    v_read_amt   INTEGER;
    v_offset     INTEGER := 1;
    -- Shared
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

    -- Detect format: '{' (0x7B) = JSON, anything else = raw binary
    DBMS_LOB.READ(v_blob, 1, 1, v_first_byte);
    v_is_json := (v_first_byte = HEXTORAW('7B'));

    IF v_is_json THEN
        -- ── JSON FORMAT ──────────────────────────────────────────
        -- Convert entire BLOB to CLOB
        DBMS_LOB.CREATETEMPORARY(v_body_clob, TRUE);
        DBMS_LOB.CONVERTTOCLOB(
            v_body_clob, v_blob, DBMS_LOB.LOBMAXSIZE,
            v_dest_off, v_src_off,
            NLS_CHARSET_ID('AL32UTF8'), v_lang_ctx, v_warning
        );
        -- Extract scalar fields
        SELECT jt.file_name, jt.file_type, jt.file_size, jt.created_by
        INTO   v_file_name, v_file_type, v_file_size, v_created_by
        FROM   JSON_TABLE(v_body_clob, '$' COLUMNS (
                   file_name  VARCHAR2(500)  PATH '$.fileName',
                   file_type  VARCHAR2(100)  PATH '$.fileType',
                   file_size  NUMBER         PATH '$.fileSize',
                   created_by VARCHAR2(150)  PATH '$.createdBy'
               )) jt;
        -- Extract content via INSTR/COPY (no Oracle JSON API size limit)
        v_key_pos := DBMS_LOB.INSTR(v_body_clob, '"content":"');
        IF v_key_pos > 0 THEN
            v_key_pos := v_key_pos + LENGTH('"content":"');
            v_end_pos := DBMS_LOB.INSTR(v_body_clob, '"', v_key_pos);
            IF v_end_pos > v_key_pos THEN
                DBMS_LOB.CREATETEMPORARY(v_content, TRUE);
                DBMS_LOB.COPY(v_content, v_body_clob, v_end_pos - v_key_pos, 1, v_key_pos);
            END IF;
        END IF;
    ELSE
        -- ── BINARY FORMAT ────────────────────────────────────────
        -- Metadata comes from URL query parameters
        v_file_name  := :fileName;
        v_file_type  := :fileType;
        v_file_size  := TO_NUMBER(:fileSize);
        v_created_by := :createdBy;
        -- Encode binary body to base64 in 15 KB chunks
        DBMS_LOB.CREATETEMPORARY(v_content, TRUE);
        WHILE v_offset <= v_blob_len LOOP
            v_read_amt := LEAST(15000, v_blob_len - v_offset + 1);
            DBMS_LOB.READ(v_blob, v_read_amt, v_offset, v_chunk);
            v_b64_raw := UTL_ENCODE.BASE64_ENCODE(v_chunk);
            v_b64_str := UTL_RAW.CAST_TO_VARCHAR2(v_b64_raw);
            v_b64_str := REPLACE(REPLACE(v_b64_str, CHR(13), ''), CHR(10), '');
            DBMS_LOB.WRITEAPPEND(v_content, LENGTH(v_b64_str), v_b64_str);
            v_offset := v_offset + v_read_amt;
        END LOOP;
    END IF;

    INSERT INTO RR_EXTERNAL_TRX_ATTACHMENTS
        (EXTERNAL_TRANSACTION_ID, FILE_NAME, FILE_TYPE, FILE_SIZE, FILE_CONTENT, CREATED_BY)
    VALUES
        (:externalTransactionId, v_file_name, v_file_type, v_file_size, v_content,
         NVL(v_created_by, 'SYSTEM'))
    RETURNING ID INTO v_new_id;

    COMMIT;
    HTP.P('{"status":"success","id":' || v_new_id
        || ',"format":"'        || CASE WHEN v_is_json THEN 'json' ELSE 'binary' END || '"'
        || ',"bodyLen":'        || v_blob_len
        || ',"contentLength":'  || NVL(DBMS_LOB.GETLENGTH(v_content), 0)
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
