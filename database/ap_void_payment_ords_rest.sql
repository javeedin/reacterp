-- ============================================
-- ORDS REST Handler: PUT /ap/payments/void
-- Voids a payment and restores invoice balance
--
-- Request body:
-- {
--   "CheckId":   -42,
--   "VoidDate":  "2026-03-01",   -- optional, defaults to today
--   "VoidedBy":  "jsmith"        -- optional
-- }
--
-- Response (success):
-- {
--   "status":        "success",
--   "message":       "Payment voided successfully",
--   "checkId":       -42,
--   "paymentNumber": "PAY-20260301-000042",
--   "invoiceId":     300000084552581,
--   "newBalance":    50000
-- }
-- ============================================

-- Clean up existing template (safe to re-run)
BEGIN
    ORDS.DELETE_TEMPLATE(
        p_module_name => 'ap',
        p_pattern     => 'payments/void'
    );
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ap',
        p_pattern     => 'payments/void',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'Void an AP payment'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ap',
        p_pattern        => 'payments/void',
        p_method         => 'PUT',
        p_source_type    => 'plsql/block',
        p_items_per_page => 0,
        p_comments       => 'Void payment by CheckId — validates, marks voided, restores installment',
        p_source         => '
DECLARE
    v_body   CLOB := :body_text;
    v_result VARCHAR2(4000);
BEGIN
    XXAP_VOID_PAYMENT_PKG.void_payment(
        p_json_data => v_body,
        p_result    => v_result
    );
    OWA_UTIL.MIME_HEADER(''application/json'', FALSE);
    HTP.PRN(v_result);
EXCEPTION
    WHEN OTHERS THEN
        OWA_UTIL.MIME_HEADER(''application/json'', FALSE);
        HTP.PRN(''{"status":"error","message":"'' || REPLACE(SQLERRM, ''"'', ''\"'') || ''"}'' );
END;
'
    );
    COMMIT;
END;
/

-- Verify
SELECT uri_template, method
FROM   user_ords_handlers h
JOIN   user_ords_templates t ON h.template_id = t.id
WHERE  t.module_name = 'ap'
AND    t.uri_template = 'payments/void';
