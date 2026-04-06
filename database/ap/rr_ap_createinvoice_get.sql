-- =====================================================
-- GET Handler for /ap/createinvoice
-- =====================================================
-- Purpose: Search AP Invoices from RR_AP_INVOICES_ALL
--          Returns accounting_status (live from RR_SLA_ACCOUNTING_HEADERS)
--          and applied_prepayments
-- Filters:  supplier_number, business_unit, invoice_number, supplier, invoice_date, invoice_amount, supplier_site, invoice_group
-- =====================================================

-- =====================================================
-- 1. Ensure template exists
-- =====================================================
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ap', p_pattern => 'createinvoice');
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ap',
        p_pattern     => 'createinvoice',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'AP Invoice search — GET list, POST creates via createinvoicefull'
    );
    COMMIT;
END;
/

-- =====================================================
-- 2. GET Handler
-- =====================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ap',
        p_pattern        => 'createinvoice',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_comments       => 'Search AP Invoices with accounting status and applied prepayments',
        p_source         => q'[
SELECT
    i.invoice_id,
    i.invoice_number,
    i.invoice_currency,
    i.payment_currency,
    i.invoice_amount,
    TO_CHAR(i.invoice_date, 'YYYY-MM-DD')        AS invoice_date,
    TO_CHAR(i.creation_date, 'YYYY-MM-DD')       AS creation_date,
    i.business_unit,
    i.legal_entity,
    i.supplier,
    i.supplier_number,
    i.supplier_site,
    i.invoice_group,
    i.invoice_source,
    i.invoice_type,
    i.description,
    TO_CHAR(i.accounting_date, 'YYYY-MM-DD')     AS accounting_date,
    TO_CHAR(i.terms_date, 'YYYY-MM-DD')          AS terms_date,
    TO_CHAR(i.goods_received_date, 'YYYY-MM-DD') AS goods_received_date,
    i.pay_group,
    i.payment_terms,
    i.payment_method,
    -- Amount paid: derive from installments (GROSS - UNPAID), fall back to stored value
    NVL(
        (SELECT SUM(NVL(inst.GROSS_AMOUNT, 0)) - SUM(NVL(inst.UNPAID_AMOUNT, 0))
         FROM   RR_AP_INVOICE_INSTALLMENTS inst
         WHERE  inst.INVOICE_ID = i.invoice_id),
        NVL(i.amount_paid, 0)
    ) AS amount_paid,
    -- Unpaid amount: derive from installments when they exist,
    -- otherwise fall back to invoice_amount - amount_paid (never trust stale paid_status)
    NVL(
        (SELECT SUM(NVL(inst.UNPAID_AMOUNT, 0))
         FROM   RR_AP_INVOICE_INSTALLMENTS inst
         WHERE  inst.INVOICE_ID = i.invoice_id),
        GREATEST(0, NVL(i.invoice_amount, 0) - NVL(i.amount_paid, 0))
    ) AS unpaid_amount,
    -- Paid status: derived live from installments when they exist;
    -- when no installments, derive from amount_paid vs invoice_amount so local
    -- payments are reflected even without installment rows.
    CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM RR_AP_INVOICE_INSTALLMENTS inst
            WHERE inst.INVOICE_ID = i.invoice_id
        ) THEN
            CASE
                WHEN NVL(i.amount_paid, 0) >= NVL(i.invoice_amount, 1)
                     AND NVL(i.invoice_amount, 0) > 0
                    THEN 'Fully Paid'
                WHEN NVL(i.amount_paid, 0) > 0
                    THEN 'Partially Paid'
                ELSE NVL(i.paid_status, 'Unpaid')
            END
        WHEN NVL(
            (SELECT SUM(NVL(inst.UNPAID_AMOUNT, 0))
             FROM   RR_AP_INVOICE_INSTALLMENTS inst
             WHERE  inst.INVOICE_ID = i.invoice_id), 0) <= 0
        THEN 'Fully Paid'
        WHEN NVL(
            (SELECT SUM(NVL(inst.UNPAID_AMOUNT, 0))
             FROM   RR_AP_INVOICE_INSTALLMENTS inst
             WHERE  inst.INVOICE_ID = i.invoice_id), 0)
           < NVL(i.invoice_amount, 0)
        THEN 'Partially Paid'
        ELSE 'Unpaid'
    END AS paid_status,
    i.validation_status,
    i.approval_status,
    (SELECT h.accounting_status
     FROM   RR_SLA_ACCOUNTING_HEADERS h
     WHERE  h.source_table = 'AP_INVOICES'
       AND  h.source_id    = i.invoice_id
     ORDER BY h.header_id DESC
     FETCH FIRST 1 ROWS ONLY)                      AS accounting_status,
    TO_CHAR(i.apply_after_date, 'YYYY-MM-DD')    AS apply_after_date,
    NVL(
        (SELECT SUM(ap.applied_amount)
         FROM   RR_AP_APPLIED_PREPAYMENTS ap
         WHERE  ap.invoice_id = i.invoice_id
         AND    ap.status     = 'Applied'),
        0
    ) AS applied_prepayments
FROM  RR_AP_INVOICES_ALL i
WHERE (i.supplier_number  = :supplier_number  OR :supplier_number  IS NULL)
  AND (i.business_unit    = :business_unit    OR :business_unit    IS NULL)
  AND (UPPER(i.invoice_number) LIKE '%' || UPPER(:invoice_number) || '%'
       OR :invoice_number IS NULL)
  AND (UPPER(i.supplier)  LIKE '%' || UPPER(:supplier) || '%'
       OR :supplier IS NULL)
  AND (TRUNC(i.invoice_date) = TO_DATE(:invoice_date, 'YYYY-MM-DD')
       OR :invoice_date IS NULL)
  AND (i.invoice_amount   = :invoice_amount   OR :invoice_amount   IS NULL)
  AND (i.supplier_site    = :supplier_site    OR :supplier_site    IS NULL)
  AND (UPPER(i.invoice_group) LIKE '%' || UPPER(:invoice_group) || '%'
       OR :invoice_group IS NULL)
ORDER BY i.invoice_date DESC, i.invoice_id DESC
]'
    );
    COMMIT;
END;
/

-- =====================================================
-- 3. Verify
-- =====================================================
SELECT module_name, uri_template, method, source_type
FROM   user_ords_handlers
WHERE  module_name   = 'ap'
  AND  uri_template  = 'createinvoice'
ORDER BY method;
