-- ============================================================
-- PATCH v5: Upload attachment — raw binary body
--
-- HOW TO RUN:
--   Option A (SQL Commands — paste and run as ONE block):
--     Copy everything from BEGIN to END; below and click Run.
--
--   Option B (SQL Scripts — paste entire file and run):
--     Works as-is with the / delimiter.
--
-- EXPECTED RESULT: "PL/SQL procedure successfully completed."
--
-- After registering, test with Postman:
--   POST  <url>/attachments?fileName=file.pdf&fileType=application/pdf&fileSize=12660&createdBy=ERP_USER
--   Body  → Binary → select the PDF file
--   Header: Content-Type: application/octet-stream
-- ============================================================

BEGIN
    -- Remove old handler first (safe even if it does not exist)
    BEGIN
        ORDS.DELETE_HANDLER(
            p_module_name => 'reerp',
            p_pattern     => 'cash/externaltransactions/:externalTransactionId/attachments',
            p_method      => 'POST'
        );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Register new POST handler
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
        HTP.P('{"status":"error","message":"empty body"}');
        RETURN;
    END IF;

    -- Encode raw binary body to base64 in 15 KB chunks
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
