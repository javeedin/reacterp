-- ============================================================
-- PATCH: Fix FILE_CONTENT not saving for all file types/sizes
--
-- Request format (unchanged from original):
--   POST /cash/externaltransactions/:id/attachments
--   Content-Type: application/json
--   Body: {"fileName":"...","fileType":"...","fileSize":N,
--          "content":"<base64>","createdBy":"..."}
--
-- Problem: :body_text is VARCHAR2 (32767-byte limit) so large
-- base64 strings are silently truncated. JSON_TABLE/JSON_VALUE
-- CLOB parsing also has internal limits.
--
-- Fix: read :body (BLOB) in 8000-byte raw chunks → CLOB, then
-- use DBMS_LOB.INSTR to locate "content":" and DBMS_LOB.COPY
-- to extract it. No Oracle JSON API involved — no size limits.
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
    v_blob       BLOB    := :body;
    v_blob_len   INTEGER;
    v_body_clob  CLOB;
    v_buf        RAW(8000);
    v_read_amt   INTEGER;
    v_offset     INTEGER := 1;
    v_file_name  VARCHAR2(500);
    v_file_type  VARCHAR2(100);
    v_file_size  NUMBER;
    v_created_by VARCHAR2(150);
    v_content    CLOB;
    v_key        VARCHAR2(20) := '"content":"';
    v_key_pos    INTEGER;
    v_end_pos    INTEGER;
    v_new_id     NUMBER;
BEGIN
    -- Step 1: read :body BLOB in 8000-byte chunks → full JSON CLOB
    v_blob_len := CASE WHEN v_blob IS NULL THEN 0 ELSE DBMS_LOB.GETLENGTH(v_blob) END;
    IF v_blob_len = 0 THEN
        OWA_UTIL.MIME_HEADER('application/json', FALSE);
        HTP.P('{"status":"error","message":"Request body is empty"}');
        RETURN;
    END IF;
    DBMS_LOB.CREATETEMPORARY(v_body_clob, TRUE);
    WHILE v_offset <= v_blob_len LOOP
        v_read_amt := LEAST(8000, v_blob_len - v_offset + 1);
        DBMS_LOB.READ(v_blob, v_read_amt, v_offset, v_buf);
        DBMS_LOB.WRITEAPPEND(v_body_clob,
            UTL_RAW.LENGTH(v_buf),
            UTL_RAW.CAST_TO_VARCHAR2(v_buf));
        v_offset := v_offset + v_read_amt;
    END LOOP;

    -- Step 2: extract scalar fields via JSON_TABLE (safe for VARCHAR2)
    SELECT jt.file_name, jt.file_type, jt.file_size, jt.created_by
    INTO   v_file_name, v_file_type, v_file_size, v_created_by
    FROM   JSON_TABLE(v_body_clob, '$' COLUMNS (
               file_name  VARCHAR2(500)  PATH '$.fileName',
               file_type  VARCHAR2(100)  PATH '$.fileType',
               file_size  NUMBER         PATH '$.fileSize',
               created_by VARCHAR2(150)  PATH '$.createdBy'
           )) jt;

    -- Step 3: extract content CLOB via direct string search
    -- Base64 uses only A-Za-z0-9+/= — never contains "
    -- so the next " after "content":" is always the closing quote
    v_key_pos := DBMS_LOB.INSTR(v_body_clob, v_key);
    IF v_key_pos > 0 THEN
        v_key_pos := v_key_pos + LENGTH(v_key);
        v_end_pos := DBMS_LOB.INSTR(v_body_clob, '"', v_key_pos);
        IF v_end_pos > v_key_pos THEN
            DBMS_LOB.CREATETEMPORARY(v_content, TRUE);
            DBMS_LOB.COPY(v_content, v_body_clob, v_end_pos - v_key_pos, 1, v_key_pos);
        END IF;
    END IF;

    -- Step 4: insert
    INSERT INTO RR_EXTERNAL_TRX_ATTACHMENTS
        (EXTERNAL_TRANSACTION_ID, FILE_NAME, FILE_TYPE, FILE_SIZE, FILE_CONTENT, CREATED_BY)
    VALUES
        (:externalTransactionId, v_file_name, v_file_type, v_file_size, v_content,
         NVL(v_created_by, 'SYSTEM'))
    RETURNING ID INTO v_new_id;

    COMMIT;
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('{"status":"success","id":' || v_new_id
        || ',"fileName":'       || APEX_JSON.STRINGIFY(v_file_name)
        || ',"bodyLen":'        || v_blob_len
        || ',"contentLength":'  || NVL(DBMS_LOB.GETLENGTH(v_content), 0)
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
