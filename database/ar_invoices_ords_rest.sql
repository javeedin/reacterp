-- =====================================================
-- ORDS REST Handlers for AR Invoices
-- Module  : ar
-- Base    : /ar/
-- Tables  : RR_AR_INVOICE_HEADERS, RR_AR_INVOICE_LINES
-- Package : RR_AR_INVOICES_PKG
-- =====================================================

-- =====================================================
-- 1. Define REST Module
-- =====================================================
BEGIN
    ORDS.DEFINE_MODULE(
        p_module_name    => 'ar',
        p_base_path      => '/ar/',
        p_items_per_page => 100,
        p_status         => 'PUBLISHED',
        p_comments       => 'AR Invoices REST API'
    );
    COMMIT;
END;
/

-- =====================================================
-- 2. Template: ar/invoices
-- =====================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'ar',
        p_pattern        => 'invoices',
        p_comments       => 'AR Invoice headers'
    );
    COMMIT;
END;
/

-- =====================================================
-- 3. POST /ar/invoices  — save single invoice header
-- =====================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'invoices',
        p_method         => 'POST',
        p_source_type    => 'plsql/block',
        p_mimes_allowed  => 'application/json',
        p_comments       => 'Upsert single AR invoice from JSON',
        p_source         => '
DECLARE
    l_status  VARCHAR2(20);
    l_message VARCHAR2(4000);
BEGIN
    RR_AR_INVOICES_PKG.save_invoice(
        p_invoice_json => :body_text,
        p_status       => l_status,
        p_message      => l_message
    );
    :status_code := CASE WHEN l_status = ''SUCCESS'' THEN 201 ELSE 400 END;
    HTP.P(''{"status":"'' || l_status || ''","message":"'' ||
          REPLACE(l_message, ''"'', ''\\"'') || ''"}'' );
END;'
    );
    COMMIT;
END;
/

-- =====================================================
-- 4. GET /ar/invoices  — list headers (paginated)
-- =====================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'invoices',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 100,
        p_comments       => 'List AR invoice headers',
        p_source         => '
SELECT
    h.CUSTOMER_TRANSACTION_ID,
    h.TRANSACTION_NUMBER,
    h.DOCUMENT_NUMBER,
    h.TRANSACTION_DATE,
    h.ACCOUNTING_DATE,
    h.DUE_DATE,
    h.TRANSACTION_TYPE,
    h.TRANSACTION_SOURCE,
    h.INVOICE_STATUS,
    h.INVOICE_CURRENCY_CODE,
    h.ENTERED_AMOUNT,
    h.INVOICE_BALANCE_AMOUNT,
    h.BILL_TO_CUSTOMER_NUMBER,
    h.BILL_TO_CUSTOMER_NAME,
    h.BUSINESS_UNIT,
    h.PAYMENT_TERMS,
    h.PURCHASE_ORDER,
    h.SYNC_STATUS,
    h.SYNC_DATE
FROM RR_AR_INVOICE_HEADERS h
ORDER BY h.TRANSACTION_DATE DESC, h.TRANSACTION_NUMBER DESC'
    );
    COMMIT;
END;
/

-- =====================================================
-- 5. Template: ar/invoices/bulk
-- =====================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'ar',
        p_pattern        => 'invoices/bulk',
        p_comments       => 'Bulk upsert AR invoice headers'
    );
    COMMIT;
END;
/

-- =====================================================
-- 6. POST /ar/invoices/bulk  — bulk upsert headers
-- =====================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'invoices/bulk',
        p_method         => 'POST',
        p_source_type    => 'plsql/block',
        p_mimes_allowed  => 'application/json',
        p_comments       => 'Bulk upsert AR invoices {"items":[...]}',
        p_source         => '
DECLARE
    l_status   VARCHAR2(20);
    l_message  VARCHAR2(4000);
    l_inserted NUMBER;
    l_updated  NUMBER;
    l_errors   NUMBER;
BEGIN
    RR_AR_INVOICES_PKG.save_invoices_bulk(
        p_invoices_json => :body_text,
        p_status        => l_status,
        p_message       => l_message,
        p_inserted      => l_inserted,
        p_updated       => l_updated,
        p_errors        => l_errors
    );
    :status_code := CASE WHEN l_status = ''SUCCESS'' THEN 201 ELSE 400 END;
    HTP.P(''{"status":"''   || l_status   ||
          ''","message":"'' || REPLACE(l_message, ''"'', ''\\"'') ||
          ''","inserted":'' || l_inserted ||
          '',"updated":''   || l_updated  ||
          '',"errors":''    || l_errors   || ''}'');
END;'
    );
    COMMIT;
END;
/

-- =====================================================
-- 7. Template: ar/invoices/:id
-- =====================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'ar',
        p_pattern        => 'invoices/:id',
        p_comments       => 'Single AR invoice header by CustomerTransactionId'
    );
    COMMIT;
END;
/

-- =====================================================
-- 8. GET /ar/invoices/:id
-- =====================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'invoices/:id',
        p_method         => 'GET',
        p_source_type    => 'json/item',
        p_comments       => 'Get single AR invoice header',
        p_source         => '
SELECT h.*
FROM   RR_AR_INVOICE_HEADERS h
WHERE  h.CUSTOMER_TRANSACTION_ID = :id'
    );
    COMMIT;
END;
/

-- =====================================================
-- 9. Template: ar/invoices/:id/lines
-- =====================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'ar',
        p_pattern        => 'invoices/:id/lines',
        p_comments       => 'AR invoice lines for a header'
    );
    COMMIT;
END;
/

-- =====================================================
-- 10. POST /ar/invoices/:id/lines  — save lines
-- =====================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'invoices/:id/lines',
        p_method         => 'POST',
        p_source_type    => 'plsql/block',
        p_mimes_allowed  => 'application/json',
        p_comments       => 'Upsert lines for a specific AR invoice',
        p_source         => '
DECLARE
    l_status  VARCHAR2(20);
    l_message VARCHAR2(4000);
BEGIN
    RR_AR_INVOICES_PKG.save_invoice_lines(
        p_transaction_id => :id,
        p_lines_json     => :body_text,
        p_status         => l_status,
        p_message        => l_message
    );
    :status_code := CASE WHEN l_status = ''SUCCESS'' THEN 201 ELSE 400 END;
    HTP.P(''{"status":"'' || l_status || ''","message":"'' ||
          REPLACE(l_message, ''"'', ''\\"'') || ''"}'' );
END;'
    );
    COMMIT;
END;
/

-- =====================================================
-- 11. GET /ar/invoices/:id/lines
-- =====================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'invoices/:id/lines',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 500,
        p_comments       => 'Get lines for an AR invoice',
        p_source         => '
SELECT ln.*
FROM   RR_AR_INVOICE_LINES ln
WHERE  ln.CUSTOMER_TRANSACTION_ID = :id
ORDER  BY ln.LINE_NUMBER'
    );
    COMMIT;
END;
/

-- =====================================================
-- 12. Template: ar/invoices/stats
-- =====================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'ar',
        p_pattern        => 'invoices/stats',
        p_comments       => 'AR invoice summary statistics'
    );
    COMMIT;
END;
/

-- =====================================================
-- 13. GET /ar/invoices/stats
-- =====================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'invoices/stats',
        p_method         => 'GET',
        p_source_type    => 'json/item',
        p_comments       => 'AR invoice dashboard stats',
        p_source         => '
SELECT
    COUNT(*)                                                           AS total_invoices,
    SUM(ENTERED_AMOUNT)                                                AS total_entered_amount,
    SUM(INVOICE_BALANCE_AMOUNT)                                        AS total_outstanding,
    COUNT(CASE WHEN INVOICE_STATUS = ''Complete'' THEN 1 END)          AS complete_count,
    COUNT(CASE WHEN INVOICE_STATUS = ''Incomplete'' THEN 1 END)        AS incomplete_count,
    COUNT(CASE WHEN DUE_DATE < SYSDATE
                AND INVOICE_BALANCE_AMOUNT > 0 THEN 1 END)             AS overdue_count,
    MAX(SYNC_DATE)                                                     AS last_sync_date
FROM RR_AR_INVOICE_HEADERS
WHERE (:P_BUSINESS_UNIT IS NULL OR BUSINESS_UNIT = :P_BUSINESS_UNIT)'
    );
    COMMIT;
END;
/

-- =====================================================
-- ENDPOINTS SUMMARY
-- =====================================================
-- POST   {base}/ar/invoices              Upsert single header
-- POST   {base}/ar/invoices/bulk         Bulk upsert headers {"items":[...]}
-- POST   {base}/ar/invoices/:id/lines    Upsert lines for a header {"items":[...]}
-- GET    {base}/ar/invoices              List all headers (paginated)
-- GET    {base}/ar/invoices/:id          Get single header
-- GET    {base}/ar/invoices/:id/lines    Get lines for a header
-- GET    {base}/ar/invoices/stats        Dashboard summary stats
-- =====================================================
