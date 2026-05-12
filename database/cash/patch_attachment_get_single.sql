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
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'cash/externaltransactions/:externalTransactionId/attachments/:attachmentId',
        p_method         => 'GET',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_comments       => 'Get single attachment with content for preview/download',
        p_source         => q'[
DECLARE
    r RR_EXTERNAL_TRX_ATTACHMENTS%ROWTYPE;
BEGIN
    SELECT * INTO r
      FROM RR_EXTERNAL_TRX_ATTACHMENTS
     WHERE ID = :attachmentId
       AND EXTERNAL_TRANSACTION_ID = :externalTransactionId;

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
