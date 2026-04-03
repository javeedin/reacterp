-- =====================================================
-- GET /ap/invoices/stats
-- Payables Dashboard KPI statistics from RR_AP_INVOICES_ALL
-- Uses plsql/block (same pattern as other handlers in this project)
-- so the response is always a proper JSON object.
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
        p_source_type => 'plsql/block',
        p_comments    => 'Payables dashboard KPIs from RR_AP_INVOICES_ALL',
        p_source      => q'[
DECLARE
    v_pending_invoices  NUMBER := 0;
    v_approved_invoices NUMBER := 0;
    v_pending_payments  NUMBER := 0;
    v_overdue_payments  NUMBER := 0;
    v_total_outstanding NUMBER := 0;
    v_total_invoices    NUMBER := 0;
    v_last_sync_date    VARCHAR2(30) := 'N/A';
BEGIN
    SELECT
        NVL(SUM(CASE WHEN NVL(validation_status, 'Never Validated') NOT IN ('Validated')
                     THEN 1 ELSE 0 END), 0),
        NVL(SUM(CASE WHEN validation_status = 'Validated'
                       OR approval_status   = 'Approved'
                     THEN 1 ELSE 0 END), 0),
        NVL(SUM(CASE WHEN NVL(paid_status, 'Unpaid') != 'Paid'
                     THEN 1 ELSE 0 END), 0),
        NVL(SUM(CASE WHEN NVL(paid_status, 'Unpaid') != 'Paid'
                      AND terms_date IS NOT NULL
                      AND terms_date < TRUNC(SYSDATE)
                     THEN 1 ELSE 0 END), 0),
        NVL(SUM(CASE WHEN NVL(paid_status, 'Unpaid') != 'Paid'
                     THEN invoice_amount - NVL(amount_paid, 0)
                     ELSE 0 END), 0),
        COUNT(*),
        NVL(TO_CHAR(MAX(creation_date), 'YYYY-MM-DD HH24:MI:SS'), 'N/A')
    INTO
        v_pending_invoices,
        v_approved_invoices,
        v_pending_payments,
        v_overdue_payments,
        v_total_outstanding,
        v_total_invoices,
        v_last_sync_date
    FROM RR_AP_INVOICES_ALL
    WHERE (:P_BUSINESS_UNIT IS NULL OR business_unit = :P_BUSINESS_UNIT);

    OWA_UTIL.MIME_HEADER('application/json', TRUE);
    HTP.PRN(
        JSON_OBJECT(
            'pending_invoices'  VALUE v_pending_invoices,
            'approved_invoices' VALUE v_approved_invoices,
            'pending_payments'  VALUE v_pending_payments,
            'overdue_payments'  VALUE v_overdue_payments,
            'total_outstanding' VALUE v_total_outstanding,
            'total_invoices'    VALUE v_total_invoices,
            'last_sync_date'    VALUE v_last_sync_date
        )
    );
EXCEPTION WHEN OTHERS THEN
    OWA_UTIL.MIME_HEADER('application/json', TRUE);
    HTP.PRN('{"error":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;
]'
    );
    COMMIT;
END;
/
