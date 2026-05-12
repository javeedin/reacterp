-- ============================================================
-- PATCH: Add GET single-attachment endpoints for preview/download
-- Run this in Oracle SQL Workshop (SQL Commands)
--
-- This adds:
--   GET /cash/externaltransactions/:id/attachments/:attachmentId
--   GET /cash/banktransfers/:id/attachments/:attachmentId
--
-- The list (GET /attachments) omits FILE_CONTENT for performance.
-- These single-item endpoints return the full base64 content
-- so the React app can preview and download files.
-- ============================================================

-- 1) Ensure the /:attachmentId template exists for external transactions
BEGIN
    ORDS.DELETE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'cash/externaltransactions/:externalTransactionId/attachments/:attachmentId'
    );
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'cash/externaltransactions/:externalTransactionId/attachments/:attachmentId',
        p_priority    => 0,
        p_etag_type   => 'HASH'
    );
    COMMIT;
END;
/

-- 2) GET handler — returns content field for external transaction attachment
--    FILE_CONTENT is BLOB (new); FILE_CONTENT_CLB is CLOB (old, pre-migration)
--    Falls back to CLOB if BLOB is empty (rows uploaded before v8 migration)
BEGIN
    BEGIN
        ORDS.DELETE_HANDLER(
            p_module_name => 'reerp',
            p_pattern     => 'cash/externaltransactions/:externalTransactionId/attachments/:attachmentId',
            p_method      => 'GET'
        );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'cash/externaltransactions/:externalTransactionId/attachments/:attachmentId',
        p_method         => 'GET',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_comments       => 'Get single attachment - BLOB or legacy CLOB fallback',
        p_source         => q'[
DECLARE
    v_id         NUMBER;
    v_file_name  VARCHAR2(500);
    v_file_type  VARCHAR2(100);
    v_file_size  NUMBER;
    v_content    BLOB;
    v_legacy     CLOB;
    v_blob_len   INTEGER;
    v_clob_len   INTEGER;
    v_chunk      RAW(15000);
    v_b64_raw    RAW(21000);
    v_b64_str    VARCHAR2(32767);
    v_read_amt   BINARY_INTEGER;
    v_offset     INTEGER := 1;
    v_clob_chunk VARCHAR2(32767);
BEGIN
    SELECT ID, FILE_NAME, FILE_TYPE, FILE_SIZE, FILE_CONTENT, FILE_CONTENT_CLB
      INTO v_id, v_file_name, v_file_type, v_file_size, v_content, v_legacy
      FROM RR_EXTERNAL_TRX_ATTACHMENTS
     WHERE ID = :attachmentId
       AND EXTERNAL_TRANSACTION_ID = :externalTransactionId;

    v_blob_len := CASE WHEN v_content IS NULL THEN 0 ELSE DBMS_LOB.GETLENGTH(v_content) END;
    v_clob_len := CASE WHEN v_legacy  IS NULL THEN 0 ELSE DBMS_LOB.GETLENGTH(v_legacy)  END;

    HTP.PRN('{"id":' || v_id
        || ',"fileName":' || APEX_JSON.STRINGIFY(v_file_name)
        || ',"fileType":' || APEX_JSON.STRINGIFY(NVL(v_file_type,''))
        || ',"fileSize":' || NVL(TO_CHAR(v_file_size),'null')
        || ',"content":"');

    IF v_blob_len > 0 THEN
        -- New rows: encode BLOB to base64 in 15KB chunks
        WHILE v_offset <= v_blob_len LOOP
            v_read_amt := LEAST(15000, v_blob_len - v_offset + 1);
            DBMS_LOB.READ(v_content, v_read_amt, v_offset, v_chunk);
            v_b64_raw := UTL_ENCODE.BASE64_ENCODE(v_chunk);
            v_b64_str := UTL_RAW.CAST_TO_VARCHAR2(v_b64_raw);
            v_b64_str := REPLACE(REPLACE(v_b64_str, CHR(13), ''), CHR(10), '');
            HTP.PRN(v_b64_str);
            v_offset := v_offset + v_read_amt;
        END LOOP;
    ELSIF v_clob_len > 0 THEN
        -- Legacy rows: already base64, output CLOB in 32KB chunks
        WHILE v_offset <= v_clob_len LOOP
            v_clob_chunk := DBMS_LOB.SUBSTR(v_legacy, 32767, v_offset);
            EXIT WHEN v_clob_chunk IS NULL;
            HTP.PRN(v_clob_chunk);
            v_offset := v_offset + LENGTH(v_clob_chunk);
        END LOOP;
    END IF;

    HTP.PRN('"}');
EXCEPTION WHEN NO_DATA_FOUND THEN
    HTP.P('{"error":"Not found"}');
WHEN OTHERS THEN
    HTP.P('{"error":' || APEX_JSON.STRINGIFY(SQLERRM) || '}');
END;
]'
    );
    COMMIT;
END;
/

-- 3) DELETE handler for external transaction attachment
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'cash/externaltransactions/:externalTransactionId/attachments/:attachmentId',
        p_method         => 'DELETE',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_comments       => 'Delete an attachment',
        p_source         => q'[
BEGIN
    DELETE FROM RR_EXTERNAL_TRX_ATTACHMENTS
     WHERE ID = :attachmentId
       AND EXTERNAL_TRANSACTION_ID = :externalTransactionId;
    IF SQL%ROWCOUNT = 0 THEN
        OWA_UTIL.MIME_HEADER('application/json', FALSE);
        HTP.P('{"status":"error","message":"Attachment not found"}');
    ELSE
        COMMIT;
        OWA_UTIL.MIME_HEADER('application/json', FALSE);
        HTP.P('{"status":"success"}');
    END IF;
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

-- ============================================================
-- 4) Bank transfer: /:attachmentId template + GET + DELETE
-- ============================================================
BEGIN
    ORDS.DELETE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'cash/banktransfers/:transferId/attachments/:attachmentId'
    );
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'cash/banktransfers/:transferId/attachments/:attachmentId',
        p_priority    => 0,
        p_etag_type   => 'HASH'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'cash/banktransfers/:transferId/attachments/:attachmentId',
        p_method         => 'GET',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_comments       => 'Get single bank transfer attachment with content',
        p_source         => q'[
DECLARE
    r RR_BANK_TRANSFER_ATTACHMENTS%ROWTYPE;
BEGIN
    SELECT * INTO r
      FROM RR_BANK_TRANSFER_ATTACHMENTS
     WHERE ID = :attachmentId
       AND BANK_ACCOUNT_TRANSFER_ID = :transferId;

    HTP.P('{"id":' || r.ID
        || ',"fileName":' || APEX_JSON.STRINGIFY(r.FILE_NAME)
        || ',"fileType":' || APEX_JSON.STRINGIFY(NVL(r.FILE_TYPE,''))
        || ',"fileSize":' || NVL(TO_CHAR(r.FILE_SIZE),'null')
        || ',"content":' || APEX_JSON.STRINGIFY(NVL(r.FILE_CONTENT,''))
        || '}');
EXCEPTION WHEN NO_DATA_FOUND THEN
    HTP.P('{"error":"Not found"}');
WHEN OTHERS THEN
    HTP.P('{"error":' || APEX_JSON.STRINGIFY(SQLERRM) || '}');
END;
]'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'cash/banktransfers/:transferId/attachments/:attachmentId',
        p_method         => 'DELETE',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_comments       => 'Delete a bank transfer attachment',
        p_source         => q'[
BEGIN
    DELETE FROM RR_BANK_TRANSFER_ATTACHMENTS
     WHERE ID = :attachmentId
       AND BANK_ACCOUNT_TRANSFER_ID = :transferId;
    IF SQL%ROWCOUNT = 0 THEN
        OWA_UTIL.MIME_HEADER('application/json', FALSE);
        HTP.P('{"status":"error","message":"Attachment not found"}');
    ELSE
        COMMIT;
        OWA_UTIL.MIME_HEADER('application/json', FALSE);
        HTP.P('{"status":"success"}');
    END IF;
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
