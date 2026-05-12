-- ============================================================
-- PATCH v5: Upload attachment — raw binary body, base64 encoded server-side
--
-- HOW TO RUN IN SQL WORKSHOP:
--   1. Copy EVERYTHING below (entire file)
--   2. Oracle APEX → SQL Workshop → SQL Commands
--   3. Paste and click RUN — one block at a time if needed
--   4. Each block must say "PL/SQL procedure successfully completed."
--
-- WHAT CHANGED FROM JSON APPROACH:
--   • Body is now raw binary (application/octet-stream), NOT JSON
--   • File metadata (fileName, fileType, fileSize, createdBy) come as
--     URL query parameters, NOT in the JSON body
--   • Server encodes the binary body to base64 in 15 KB chunks
--     using UTL_ENCODE.BASE64_ENCODE — no size limits, no JSON parsing
-- ============================================================

-- Step 1: Remove old POST handler (ignore error if not found)
BEGIN
    ORDS.DELETE_HANDLER(
        p_module_name => 'reerp',
        p_pattern     => 'cash/externaltransactions/:externalTransactionId/attachments',
        p_method      => 'POST'
    );
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

-- Step 2: Register new POST handler
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'cash/externaltransactions/:externalTransactionId/attachments',
        p_method         => 'POST',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_mimes_allowed  => '',
        p_comments       => 'Upload attachment v5 - raw binary body encoded server-side',
        p_source         => q'[
DECLARE
    v_blob     BLOB    := :body;
    v_blob_len INTEGER;
    v_content  CLOB;
    v_chunk    RAW(15000);
    v_b64_raw  RAW(21000);
    v_b64_str  VARCHAR2(32767);
    v_offset   INTEGER := 1;
    v_read_amt INTEGER;
    v_new_id   NUMBER;
BEGIN
    v_blob_len := CASE WHEN v_blob IS NULL THEN 0 ELSE DBMS_LOB.GETLENGTH(v_blob) END;
    IF v_blob_len = 0 THEN
        OWA_UTIL.MIME_HEADER('application/json', FALSE);
        HTP.P('{"status":"error","message":"empty body"}');
        RETURN;
    END IF;

    -- Encode raw binary body to base64 in 15 KB chunks
    -- UTL_ENCODE.BASE64_ENCODE adds CRLF every 64 chars; we strip them
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

    INSERT INTO RR_EXTERNAL_TRX_ATTACHMENTS
        (EXTERNAL_TRANSACTION_ID, FILE_NAME, FILE_TYPE, FILE_SIZE, FILE_CONTENT, CREATED_BY)
    VALUES
        (:externalTransactionId, :fileName, :fileType, TO_NUMBER(:fileSize), v_content,
         NVL(:createdBy, 'SYSTEM'))
    RETURNING ID INTO v_new_id;

    COMMIT;
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('{"status":"success","id":' || v_new_id
        || ',"bodyLen":'       || v_blob_len
        || ',"contentLength":' || NVL(DBMS_LOB.GETLENGTH(v_content), 0)
        || '}');
EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('{"status":"error","message":' || APEX_JSON.STRINGIFY(SQLERRM)
        || ',"bodyLen":' || NVL(v_blob_len, -1) || '}');
END;
]'
    );
    COMMIT;
END;
/
