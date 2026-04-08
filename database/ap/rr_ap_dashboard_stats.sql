-- =====================================================
-- GET /invoices/stats   (module 'ap' has no URI prefix in this env)
-- Payables Dashboard KPI statistics from RR_AP_INVOICES_ALL
-- Outstanding balance computed from actual payment and prepayment
-- application tables (not the denormalized AMOUNT_PAID column).
-- Prepayment-type invoices are excluded: they are advances already
-- paid to the supplier and must not appear as outstanding payables.
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
        p_comments    => 'Payables dashboard KPIs — actual balance from payment and prepayment tables',
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
    -- outstanding = invoice_amount
    --               - SUM(cash payments, excluding voided)
    --               - SUM(prepayment applications, excluding cancelled)
    SELECT
        NVL(SUM(CASE WHEN NVL(i.validation_status, 'Never Validated') NOT IN ('Validated')
                     THEN 1 ELSE 0 END), 0),
        NVL(SUM(CASE WHEN i.validation_status = 'Validated'
                       OR i.approval_status   = 'Approved'
                     THEN 1 ELSE 0 END), 0),
        NVL(SUM(CASE WHEN NVL(i.paid_status, 'Unpaid') NOT IN ('Paid', 'Cancelled')
                     THEN 1 ELSE 0 END), 0),
        NVL(SUM(CASE WHEN NVL(i.paid_status, 'Unpaid') NOT IN ('Paid', 'Cancelled')
                      AND i.terms_date IS NOT NULL
                      AND i.terms_date < TRUNC(SYSDATE)
                     THEN 1 ELSE 0 END), 0),
        NVL(SUM(CASE WHEN NVL(i.paid_status, 'Unpaid') NOT IN ('Paid', 'Cancelled')
                     THEN GREATEST(0,
                              NVL(i.invoice_amount, 0)
                            - NVL(pay_sum.total_paid, 0)
                            - NVL(prep_sum.total_applied, 0))
                     ELSE 0 END), 0),
        COUNT(i.invoice_id),
        NVL(TO_CHAR(MAX(i.creation_date), 'YYYY-MM-DD HH24:MI:SS'), 'N/A')
    INTO
        v_pending_invoices, v_approved_invoices, v_pending_payments,
        v_overdue_payments, v_total_outstanding, v_total_invoices, v_last_sync_date
    FROM RR_AP_INVOICES_ALL i
    -- actual cash payments per invoice (exclude voided)
    LEFT JOIN (
        SELECT ri.INVOICE_ID,
               SUM(ri.AMOUNT_PAID_INVOICE_CURRENCY) AS total_paid
        FROM   RR_AP_PAYMENTS_RELATED_INVOICES ri
        JOIN   RR_AP_PAYMENTS_ALL              p  ON p.CHECK_ID = ri.CHECK_ID
        WHERE  NVL(p.PAYMENT_STATUS, 'Active') != 'Voided'
        GROUP BY ri.INVOICE_ID
    ) pay_sum  ON pay_sum.INVOICE_ID  = i.INVOICE_ID
    -- prepayment applications per invoice (exclude cancelled)
    LEFT JOIN (
        SELECT ap.INVOICE_ID,
               SUM(ap.APPLIED_AMOUNT) AS total_applied
        FROM   RR_AP_APPLIED_PREPAYMENTS ap
        WHERE  NVL(ap.STATUS, 'Applied') != 'Cancelled'
        GROUP BY ap.INVOICE_ID
    ) prep_sum ON prep_sum.INVOICE_ID = i.INVOICE_ID
    WHERE NVL(i.CANCELED_FLAG,  'N')         != 'Y'
    -- exclude prepayment-type invoices: they are advances already paid
    AND   NVL(i.INVOICE_TYPE, 'Standard')    != 'Prepayment'
    AND (:P_BUSINESS_UNIT IS NULL OR i.business_unit = :P_BUSINESS_UNIT);

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
