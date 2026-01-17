-- ============================================
-- ORDS REST API for AP Payment Related Invoices
-- Endpoint: /reerp/ap/payments/related-invoices
-- ============================================

-- Clean up existing templates
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ap', p_pattern => 'payments/related-invoices');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ap', p_pattern => 'payments/:check_id/related-invoices');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

-- ============================================
-- Template: /ap/payments/related-invoices
-- POST - Save related invoices
-- ============================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ap',
        p_pattern => 'payments/related-invoices',
        p_priority => 0,
        p_etag_type => 'HASH',
        p_comments => 'AP Payment Related Invoices - POST endpoint'
    );
    COMMIT;
END;
/

-- POST Handler
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name => 'ap',
        p_pattern => 'payments/related-invoices',
        p_method => 'POST',
        p_source_type => 'plsql/block',
        p_mimes_allowed => 'application/json',
        p_source => q'[
DECLARE
    v_body CLOB := :body_text;
    v_result VARCHAR2(4000);
    v_has_items NUMBER := 0;
    v_is_array NUMBER := 0;
BEGIN
    BEGIN
        SELECT 1 INTO v_has_items FROM DUAL WHERE JSON_EXISTS(v_body, '$.items');
    EXCEPTION WHEN NO_DATA_FOUND THEN v_has_items := 0;
    END;

    BEGIN
        SELECT 1 INTO v_is_array FROM DUAL WHERE JSON_EXISTS(v_body, '$[0]');
    EXCEPTION WHEN NO_DATA_FOUND THEN v_is_array := 0;
    END;

    IF v_has_items = 1 THEN
        XXAP_PAYMENT_REL_INVOICES_PKG.save_from_items(v_body, v_result);
    ELSIF v_is_array = 1 THEN
        XXAP_PAYMENT_REL_INVOICES_PKG.save_related_invoices_bulk(v_body, v_result);
    ELSE
        XXAP_PAYMENT_REL_INVOICES_PKG.save_related_invoice(v_body, v_result);
    END IF;

    :status := 200;
    HTP.P(v_result);
EXCEPTION
    WHEN OTHERS THEN
        :status := 500;
        HTP.P('{"status":"error","message":"' || REPLACE(SQLERRM,'"','\"') || '"}');
END;
]',
        p_items_per_page => 0,
        p_comments => 'Save AP Payment Related Invoices'
    );
    COMMIT;
END;
/

-- ============================================
-- Template: /ap/payments/:check_id/related-invoices
-- GET - Get related invoices by Check ID
-- ============================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ap',
        p_pattern => 'payments/:check_id/related-invoices',
        p_priority => 0,
        p_etag_type => 'HASH',
        p_comments => 'AP Payment Related Invoices by Check ID'
    );
    COMMIT;
END;
/

-- GET Handler
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name => 'ap',
        p_pattern => 'payments/:check_id/related-invoices',
        p_method => 'GET',
        p_source_type => 'plsql/block',
        p_source => q'[
DECLARE
    v_result CLOB;
    v_check_id NUMBER;
BEGIN
    v_check_id := TO_NUMBER(:check_id);
    v_result := XXAP_PAYMENT_REL_INVOICES_PKG.get_by_check_id(v_check_id);
    :status := 200;
    HTP.P(v_result);
EXCEPTION
    WHEN OTHERS THEN
        :status := 500;
        HTP.P('{"status":"error","message":"' || REPLACE(SQLERRM,'"','\"') || '"}');
END;
]',
        p_items_per_page => 0,
        p_comments => 'Get related invoices by Check ID'
    );
    COMMIT;
END;
/

-- Verify setup
SELECT 'Template: ' || uri_template AS info
FROM user_ords_templates
WHERE module_name = 'ap' AND uri_template LIKE '%related%'
UNION ALL
SELECT 'Handler: ' || method || ' ' || t.uri_template
FROM user_ords_handlers h
JOIN user_ords_templates t ON h.template_id = t.id
WHERE t.module_name = 'ap' AND t.uri_template LIKE '%related%';
