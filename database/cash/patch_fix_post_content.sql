-- ============================================================
-- PATCH: Debug + fix FILE_CONTENT not saving
-- Run BLOCK 1 first to diagnose, then BLOCK 2 to fix.
-- Run in SQL Workshop → SQL Commands (one block at a time)
-- ============================================================

-- ============================================================
-- BLOCK 1: Diagnostic handler — echoes back what ORDS receives
-- After running this, try saving an attachment and check the
-- API Inspector log. It will show bodyLen, bodyTextLen, params.
-- ============================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'cash/externaltransactions/:externalTransactionId/attachments',
        p_method         => 'POST',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_mimes_allowed  => '',
        p_comments       => 'DIAGNOSTIC: echo back what ORDS receives',
        p_source         => q'[
DECLARE
    v_body_len      INTEGER;
    v_body_text_len INTEGER;
BEGIN
    -- Check :body (BLOB)
    v_body_len      := CASE WHEN :body IS NULL THEN -1 ELSE DBMS_LOB.GETLENGTH(:body) END;
    -- Check :body_text (VARCHAR2)
    v_body_text_len := CASE WHEN :body_text IS NULL THEN -1 ELSE LENGTH(:body_text) END;

    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('{'
        || '"bodyLen":'      || v_body_len
        || ',"bodyTextLen":' || v_body_text_len
        || ',"fileName":'    || APEX_JSON.STRINGIFY(NVL(:fileName,'NULL'))
        || ',"fileType":'    || APEX_JSON.STRINGIFY(NVL(:fileType,'NULL'))
        || ',"fileSize":'    || APEX_JSON.STRINGIFY(NVL(:fileSize,'NULL'))
        || ',"extTxnId":'    || TO_CHAR(:externalTransactionId)
        || '}');
END;
]'
    );
    COMMIT;
END;
/


-- ============================================================
-- BLOCK 2: Real fix — run this AFTER diagnosing with Block 1
-- Uses whichever body variable is non-null (:body or :body_text)
-- and reads BLOB in raw chunks (most compatible approach)
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
    v_blob       BLOB    := :body;
    v_blob_len   INTEGER;
    v_content    CLOB;
    v_buf        RAW(8000);
    v_read_amt   INTEGER;
    v_offset     INTEGER := 1;
    v_new_id     NUMBER;
BEGIN
    -- ── Try :body (BLOB) first ──────────────────────────────
    v_blob_len := CASE WHEN v_blob IS NULL THEN 0 ELSE DBMS_LOB.GETLENGTH(v_blob) END;

    IF v_blob_len > 0 THEN
        -- Read BLOB in 8000-byte chunks → VARCHAR2 → append to CLOB
        -- Base64 is pure ASCII so cast_to_varchar2 is safe
        DBMS_LOB.CREATETEMPORARY(v_content, TRUE);
        WHILE v_offset <= v_blob_len LOOP
            v_read_amt := LEAST(8000, v_blob_len - v_offset + 1);
            DBMS_LOB.READ(v_blob, v_read_amt, v_offset, v_buf);
            DBMS_LOB.WRITEAPPEND(v_content,
                UTL_RAW.LENGTH(v_buf),
                UTL_RAW.CAST_TO_VARCHAR2(v_buf));
            v_offset := v_offset + v_read_amt;
        END LOOP;

    ELSIF :body_text IS NOT NULL AND LENGTH(:body_text) > 0 THEN
        -- Fallback: :body_text VARCHAR2 (works for small files < 32 KB)
        DBMS_LOB.CREATETEMPORARY(v_content, TRUE);
        DBMS_LOB.WRITEAPPEND(v_content, LENGTH(:body_text), :body_text);

    ELSE
        OWA_UTIL.MIME_HEADER('application/json', FALSE);
        HTP.P('{"status":"error","message":"Request body is empty — no file content received"}');
        RETURN;
    END IF;

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
        || ',"bodyLen":'       || v_blob_len
        || ',"contentLength":' || NVL(DBMS_LOB.GETLENGTH(v_content), 0)
        || '}');
EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('{"status":"error","message":' || APEX_JSON.STRINGIFY(SQLERRM)
        || ',"bodyLen":' || NVL(v_blob_len, -1)
        || '}');
END;
]'
    );
    COMMIT;
END;
/
