-- =====================================================
-- GET /ap/invoices/stats
-- Payables Dashboard KPI statistics from RR_AP_INVOICES_ALL
-- Returns a single JSON object with counts and totals
-- All SUM expressions wrapped in NVL(,0) so ORDS json/item
-- never omits a field due to NULL (empty table or no BU match).
-- =====================================================

BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ap', p_pattern => 'invoices/stats');
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ap',
        p_pattern     => 'invoices/stats',
        p_comments    => 'Payables Dashboard KPI statistics'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name => 'ap',
        p_pattern     => 'invoices/stats',
        p_method      => 'GET',
        p_source_type => 'json/item',
        p_comments    => 'Payables dashboard KPIs from RR_AP_INVOICES_ALL',
        p_source      => q'[
SELECT
    NVL(SUM(CASE WHEN NVL(validation_status, 'Never Validated') NOT IN ('Validated')
                 THEN 1 ELSE 0 END), 0)                                 AS pending_invoices,

    NVL(SUM(CASE WHEN validation_status = 'Validated'
                   OR approval_status   = 'Approved'
                 THEN 1 ELSE 0 END), 0)                                 AS approved_invoices,

    NVL(SUM(CASE WHEN NVL(paid_status, 'Unpaid') != 'Paid'
                 THEN 1 ELSE 0 END), 0)                                 AS pending_payments,

    NVL(SUM(CASE WHEN NVL(paid_status, 'Unpaid') != 'Paid'
                  AND terms_date IS NOT NULL
                  AND terms_date < TRUNC(SYSDATE)
                 THEN 1 ELSE 0 END), 0)                                 AS overdue_payments,

    NVL(SUM(CASE WHEN NVL(paid_status, 'Unpaid') != 'Paid'
                 THEN invoice_amount - NVL(amount_paid, 0)
                 ELSE 0 END), 0)                                        AS total_outstanding,

    COUNT(*)                                                            AS total_invoices,

    NVL(TO_CHAR(MAX(creation_date), 'YYYY-MM-DD HH24:MI:SS'), 'N/A')   AS last_sync_date

FROM RR_AP_INVOICES_ALL
WHERE (:P_BUSINESS_UNIT IS NULL OR business_unit = :P_BUSINESS_UNIT)
]'
    );
    COMMIT;
END;
/
