-- ============================================================
-- ORDS REST API for AP Applied Prepayments
-- Endpoint: /reerp/ap/applied-prepayments
-- ============================================================

-- Clean up existing templates
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ap', p_pattern => 'applied-prepayments');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ap', p_pattern => 'applied-prepayments/by-invoice/:invoice_id');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ap', p_pattern => 'applied-prepayments/by-prepayment/:prepayment_id');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

-- ============================================================
-- Template: /ap/applied-prepayments
-- POST  - Save one or many prepayment applications
-- ============================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ap',
        p_pattern     => 'applied-prepayments',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'AP Applied Prepayments - POST endpoint'
    );
    COMMIT;
END;
/

-- POST Handler
-- Accepts three formats:
--   1. Single object:   { "InvoiceId": ..., "AppliedAmount": ..., ... }
--   2. JSON array:      [ { ... }, { ... } ]
--   3. Items wrapper:   { "items": [ { ... }, { ... } ] }
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ap',
        p_pattern        => 'applied-prepayments',
        p_method         => 'POST',
        p_source_type    => 'plsql/block',
        p_mimes_allowed  => 'application/json',
        p_source         => q'[
DECLARE
    v_body       CLOB := :body_text;
    v_result     VARCHAR2(4000);
    v_has_items  NUMBER := 0;
    v_is_array   NUMBER := 0;
BEGIN
    -- Detect payload shape
    BEGIN
        SELECT 1 INTO v_has_items FROM DUAL WHERE JSON_EXISTS(v_body, '$.items');
    EXCEPTION WHEN NO_DATA_FOUND THEN v_has_items := 0;
    END;

    BEGIN
        SELECT 1 INTO v_is_array FROM DUAL WHERE JSON_EXISTS(v_body, '$[0]');
    EXCEPTION WHEN NO_DATA_FOUND THEN v_is_array := 0;
    END;

    IF v_has_items = 1 THEN
        RR_AP_APPLIED_PREPAYMENTS_PKG.save_from_items(v_body, v_result);
    ELSIF v_is_array = 1 THEN
        RR_AP_APPLIED_PREPAYMENTS_PKG.save_bulk(v_body, v_result);
    ELSE
        RR_AP_APPLIED_PREPAYMENTS_PKG.save_application(v_body, v_result);
    END IF;

    :status_code := 200;
    HTP.P(v_result);
EXCEPTION
    WHEN OTHERS THEN
        :status_code := 500;
        HTP.P('{"status":"error","message":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;
]',
        p_items_per_page => 0,
        p_comments       => 'Save AP prepayment application(s) — single, array, or items wrapper'
    );
    COMMIT;
END;
/

-- ============================================================
-- Template: /ap/applied-prepayments/by-invoice/:invoice_id
-- GET - All prepayment applications for a target invoice
-- ============================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ap',
        p_pattern     => 'applied-prepayments/by-invoice/:invoice_id',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'Get prepayment applications by target invoice ID'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ap',
        p_pattern        => 'applied-prepayments/by-invoice/:invoice_id',
        p_method         => 'GET',
        p_source_type    => 'plsql/block',
        p_source         => q'[
DECLARE
    v_result    CLOB;
    v_offset    NUMBER := 1;
    v_chunk     NUMBER := 30000;
    v_length    NUMBER;
BEGIN
    v_result := RR_AP_APPLIED_PREPAYMENTS_PKG.get_by_invoice_id(
        p_invoice_id => TO_NUMBER(:invoice_id)
    );

    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    v_length := NVL(DBMS_LOB.GETLENGTH(v_result), 0);
    WHILE v_offset <= v_length LOOP
        HTP.PRN(DBMS_LOB.SUBSTR(v_result, v_chunk, v_offset));
        v_offset := v_offset + v_chunk;
    END LOOP;
EXCEPTION
    WHEN OTHERS THEN
        :status_code := 500;
        HTP.P('{"status":"error","message":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;
]',
        p_items_per_page => 0,
        p_comments       => 'Get all prepayment applications for a target invoice'
    );
    COMMIT;
END;
/

-- ============================================================
-- Template: /ap/applied-prepayments/by-prepayment/:prepayment_id
-- GET - All applications where a prepayment was used
-- ============================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ap',
        p_pattern     => 'applied-prepayments/by-prepayment/:prepayment_id',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'Get applications by source prepayment invoice ID'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ap',
        p_pattern        => 'applied-prepayments/by-prepayment/:prepayment_id',
        p_method         => 'GET',
        p_source_type    => 'plsql/block',
        p_source         => q'[
DECLARE
    v_result    CLOB;
    v_offset    NUMBER := 1;
    v_chunk     NUMBER := 30000;
    v_length    NUMBER;
BEGIN
    v_result := RR_AP_APPLIED_PREPAYMENTS_PKG.get_by_prepayment_id(
        p_prepayment_invoice_id => TO_NUMBER(:prepayment_id)
    );

    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    v_length := NVL(DBMS_LOB.GETLENGTH(v_result), 0);
    WHILE v_offset <= v_length LOOP
        HTP.PRN(DBMS_LOB.SUBSTR(v_result, v_chunk, v_offset));
        v_offset := v_offset + v_chunk;
    END LOOP;
EXCEPTION
    WHEN OTHERS THEN
        :status_code := 500;
        HTP.P('{"status":"error","message":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;
]',
        p_items_per_page => 0,
        p_comments       => 'Get all invoice applications that used a given prepayment'
    );
    COMMIT;
END;
/

-- ============================================================
-- Verify
-- ============================================================
SELECT 'Template: ' || uri_template AS info
FROM   user_ords_templates
WHERE  module_name = 'ap' AND uri_template LIKE '%applied-prepayment%'
UNION ALL
SELECT 'Handler: ' || h.method || ' ' || t.uri_template
FROM   user_ords_handlers h
JOIN   user_ords_templates t ON h.template_id = t.id
WHERE  t.module_name = 'ap' AND t.uri_template LIKE '%applied-prepayment%';
