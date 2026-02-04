-- ============================================================================
-- SUPPLIER BALANCE PACKAGE
-- Purpose: Provides APIs for Supplier Balance Dashboard
-- Tables Used: RR_SUPPLIER_MASTER, RR_SUPPLIER_ADDRESS, RR_AP_INVOICES_ALL,
--              RR_AP_PAYMENTS_ALL, RR_AP_PAYMENTS_RELATED_INVOICES
-- ============================================================================

-- ============================================================================
-- 1. GET SUPPLIER DETAILS
-- Endpoint: GET /suppliers/balance/details/:supplier_number
-- Returns: Supplier master data with address
-- ============================================================================

-- ORDS Handler Definition:
-- Module: reerp
-- Pattern: suppliers/balance/details/:supplier_number
-- Method: GET

DECLARE
    l_supplier_number VARCHAR2(100) := :supplier_number;
    l_result CLOB;
BEGIN
    SELECT JSON_OBJECT(
        'success' VALUE 'true',
        'supplier' VALUE JSON_OBJECT(
            'supplierId' VALUE sm.SUPPLIER_ID,
            'supplierPartyId' VALUE sm.SUPPLIER_PARTY_ID,
            'supplierName' VALUE sm.SUPPLIER,
            'supplierNumber' VALUE sm.SUPPLIER_NUMBER,
            'alternateName' VALUE sm.ALTERNATE_NAME,
            'supplierType' VALUE sm.SUPPLIER_TYPE,
            'status' VALUE sm.STATUS,
            'businessRelationship' VALUE sm.BUSINESS_RELATIONSHIP,
            'taxRegistrationNumber' VALUE sm.TAX_REGISTRATION_NUMBER,
            'taxpayerId' VALUE sm.TAXPAYER_ID,
            'customerNumber' VALUE sm.CUSTOMER_NUMBER,
            'corporateWebsite' VALUE sm.CORPORATE_WEBSITE,
            'creationDate' VALUE TO_CHAR(sm.CREATION_DATE, 'YYYY-MM-DD'),
            'address' VALUE (
                SELECT JSON_OBJECT(
                    'addressId' VALUE sa.SUPPLIER_ADDRESS_ID,
                    'addressName' VALUE sa.ADDRESS_NAME,
                    'addressLine1' VALUE sa.ADDRESS_LINE1,
                    'addressLine2' VALUE sa.ADDRESS_LINE2,
                    'addressLine3' VALUE sa.ADDRESS_LINE3,
                    'city' VALUE sa.CITY,
                    'state' VALUE sa.STATE,
                    'country' VALUE sa.COUNTRY,
                    'postalCode' VALUE sa.POSTAL_CODE,
                    'formattedAddress' VALUE sa.FORMATTED_ADDRESS,
                    'phone' VALUE sa.PHONE_NUMBER,
                    'email' VALUE sa.EMAIL
                )
                FROM RR_SUPPLIER_ADDRESS sa
                WHERE sa.SUPPLIER_ID = sm.SUPPLIER_ID
                AND sa.STATUS = 'ACTIVE'
                AND ROWNUM = 1
            )
        )
    )
    INTO l_result
    FROM RR_SUPPLIER_MASTER sm
    WHERE sm.SUPPLIER_NUMBER = l_supplier_number;

    :status_code := 200;
    HTP.p(l_result);
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        :status_code := 404;
        HTP.p('{"success": false, "error": "Supplier not found"}');
    WHEN OTHERS THEN
        :status_code := 500;
        HTP.p('{"success": false, "error": "' || SQLERRM || '"}');
END;
/


-- ============================================================================
-- 2. GET SUPPLIER BALANCE SUMMARY
-- Endpoint: GET /suppliers/balance/summary/:supplier_number
-- Returns: Total invoices, total payments, balance, invoice count, payment count
-- ============================================================================

-- ORDS Handler Definition:
-- Module: reerp
-- Pattern: suppliers/balance/summary/:supplier_number
-- Method: GET

DECLARE
    l_supplier_number VARCHAR2(100) := :supplier_number;
    l_result CLOB;

    l_total_invoices NUMBER := 0;
    l_total_paid NUMBER := 0;
    l_invoice_count NUMBER := 0;
    l_payment_count NUMBER := 0;
    l_unpaid_count NUMBER := 0;
    l_balance NUMBER := 0;
BEGIN
    -- Get invoice totals
    SELECT
        NVL(SUM(INVOICE_AMOUNT), 0),
        COUNT(*),
        NVL(SUM(AMOUNT_PAID), 0),
        COUNT(CASE WHEN PAID_STATUS != 'Paid' THEN 1 END)
    INTO l_total_invoices, l_invoice_count, l_total_paid, l_unpaid_count
    FROM RR_AP_INVOICES_ALL
    WHERE SUPPLIER_NUMBER = l_supplier_number
    AND NVL(CANCELED_FLAG, 'N') != 'Y';

    -- Get payment count from payments table
    SELECT COUNT(DISTINCT p.CHECK_ID)
    INTO l_payment_count
    FROM RR_AP_PAYMENTS_ALL p
    WHERE p.SUPPLIER_NUMBER = l_supplier_number;

    -- Calculate balance
    l_balance := l_total_invoices - l_total_paid;

    -- Build JSON response
    l_result := JSON_OBJECT(
        'success' VALUE 'true',
        'supplierNumber' VALUE l_supplier_number,
        'summary' VALUE JSON_OBJECT(
            'totalInvoiceAmount' VALUE l_total_invoices,
            'totalPaidAmount' VALUE l_total_paid,
            'outstandingBalance' VALUE l_balance,
            'invoiceCount' VALUE l_invoice_count,
            'paymentCount' VALUE l_payment_count,
            'unpaidInvoiceCount' VALUE l_unpaid_count,
            'currency' VALUE 'AED'
        )
    );

    :status_code := 200;
    HTP.p(l_result);
EXCEPTION
    WHEN OTHERS THEN
        :status_code := 500;
        HTP.p('{"success": false, "error": "' || SQLERRM || '"}');
END;
/


-- ============================================================================
-- 3. GET SUPPLIER AGING REPORT
-- Endpoint: GET /suppliers/balance/aging/:supplier_number
-- Returns: Aging buckets (Current, 1-30, 31-60, 61-90, 90+ days)
-- ============================================================================

-- ORDS Handler Definition:
-- Module: reerp
-- Pattern: suppliers/balance/aging/:supplier_number
-- Method: GET

DECLARE
    l_supplier_number VARCHAR2(100) := :supplier_number;
    l_result CLOB;

    l_current NUMBER := 0;      -- Not yet due
    l_days_1_30 NUMBER := 0;    -- 1-30 days overdue
    l_days_31_60 NUMBER := 0;   -- 31-60 days overdue
    l_days_61_90 NUMBER := 0;   -- 61-90 days overdue
    l_days_91_120 NUMBER := 0;  -- 91-120 days overdue
    l_days_over_120 NUMBER := 0; -- Over 120 days overdue
    l_total_outstanding NUMBER := 0;
BEGIN
    -- Calculate aging based on invoice date and unpaid amount
    SELECT
        NVL(SUM(CASE
            WHEN TRUNC(SYSDATE) - TRUNC(TO_DATE(INVOICE_DATE, 'MM/DD/YYYY')) <= 0
            THEN (INVOICE_AMOUNT - NVL(AMOUNT_PAID, 0))
            ELSE 0
        END), 0) AS current_amt,
        NVL(SUM(CASE
            WHEN TRUNC(SYSDATE) - TRUNC(TO_DATE(INVOICE_DATE, 'MM/DD/YYYY')) BETWEEN 1 AND 30
            THEN (INVOICE_AMOUNT - NVL(AMOUNT_PAID, 0))
            ELSE 0
        END), 0) AS days_1_30,
        NVL(SUM(CASE
            WHEN TRUNC(SYSDATE) - TRUNC(TO_DATE(INVOICE_DATE, 'MM/DD/YYYY')) BETWEEN 31 AND 60
            THEN (INVOICE_AMOUNT - NVL(AMOUNT_PAID, 0))
            ELSE 0
        END), 0) AS days_31_60,
        NVL(SUM(CASE
            WHEN TRUNC(SYSDATE) - TRUNC(TO_DATE(INVOICE_DATE, 'MM/DD/YYYY')) BETWEEN 61 AND 90
            THEN (INVOICE_AMOUNT - NVL(AMOUNT_PAID, 0))
            ELSE 0
        END), 0) AS days_61_90,
        NVL(SUM(CASE
            WHEN TRUNC(SYSDATE) - TRUNC(TO_DATE(INVOICE_DATE, 'MM/DD/YYYY')) BETWEEN 91 AND 120
            THEN (INVOICE_AMOUNT - NVL(AMOUNT_PAID, 0))
            ELSE 0
        END), 0) AS days_91_120,
        NVL(SUM(CASE
            WHEN TRUNC(SYSDATE) - TRUNC(TO_DATE(INVOICE_DATE, 'MM/DD/YYYY')) > 120
            THEN (INVOICE_AMOUNT - NVL(AMOUNT_PAID, 0))
            ELSE 0
        END), 0) AS days_over_120
    INTO l_current, l_days_1_30, l_days_31_60, l_days_61_90, l_days_91_120, l_days_over_120
    FROM RR_AP_INVOICES_ALL
    WHERE SUPPLIER_NUMBER = l_supplier_number
    AND NVL(CANCELED_FLAG, 'N') != 'Y'
    AND PAID_STATUS != 'Paid';

    l_total_outstanding := l_current + l_days_1_30 + l_days_31_60 + l_days_61_90 + l_days_91_120 + l_days_over_120;

    -- Build JSON response
    l_result := JSON_OBJECT(
        'success' VALUE 'true',
        'supplierNumber' VALUE l_supplier_number,
        'aging' VALUE JSON_OBJECT(
            'current' VALUE l_current,
            'days1to30' VALUE l_days_1_30,
            'days31to60' VALUE l_days_31_60,
            'days61to90' VALUE l_days_61_90,
            'days91to120' VALUE l_days_91_120,
            'daysOver120' VALUE l_days_over_120,
            'totalOutstanding' VALUE l_total_outstanding,
            'currency' VALUE 'AED'
        ),
        'agingBuckets' VALUE JSON_ARRAY(
            JSON_OBJECT('bucket' VALUE 'Current', 'amount' VALUE l_current, 'percentage' VALUE ROUND(l_current / NULLIF(l_total_outstanding, 0) * 100, 2)),
            JSON_OBJECT('bucket' VALUE '1-30 Days', 'amount' VALUE l_days_1_30, 'percentage' VALUE ROUND(l_days_1_30 / NULLIF(l_total_outstanding, 0) * 100, 2)),
            JSON_OBJECT('bucket' VALUE '31-60 Days', 'amount' VALUE l_days_31_60, 'percentage' VALUE ROUND(l_days_31_60 / NULLIF(l_total_outstanding, 0) * 100, 2)),
            JSON_OBJECT('bucket' VALUE '61-90 Days', 'amount' VALUE l_days_61_90, 'percentage' VALUE ROUND(l_days_61_90 / NULLIF(l_total_outstanding, 0) * 100, 2)),
            JSON_OBJECT('bucket' VALUE '91-120 Days', 'amount' VALUE l_days_91_120, 'percentage' VALUE ROUND(l_days_91_120 / NULLIF(l_total_outstanding, 0) * 100, 2)),
            JSON_OBJECT('bucket' VALUE 'Over 120 Days', 'amount' VALUE l_days_over_120, 'percentage' VALUE ROUND(l_days_over_120 / NULLIF(l_total_outstanding, 0) * 100, 2))
        )
    );

    :status_code := 200;
    HTP.p(l_result);
EXCEPTION
    WHEN OTHERS THEN
        :status_code := 500;
        HTP.p('{"success": false, "error": "' || SQLERRM || '"}');
END;
/


-- ============================================================================
-- 4. GET SUPPLIER INVOICES
-- Endpoint: GET /suppliers/balance/invoices/:supplier_number
-- Returns: List of all invoices for the supplier
-- Optional Query Params: status (Paid/Unpaid/All), limit, offset
-- ============================================================================

-- ORDS Handler Definition:
-- Module: reerp
-- Pattern: suppliers/balance/invoices/:supplier_number
-- Method: GET

DECLARE
    l_supplier_number VARCHAR2(100) := :supplier_number;
    l_status VARCHAR2(50) := NVL(:status, 'All');
    l_limit NUMBER := NVL(:limit, 100);
    l_offset NUMBER := NVL(:offset, 0);
    l_result CLOB;
    l_invoices CLOB;
    l_total_count NUMBER;
BEGIN
    -- Get total count
    SELECT COUNT(*)
    INTO l_total_count
    FROM RR_AP_INVOICES_ALL
    WHERE SUPPLIER_NUMBER = l_supplier_number
    AND NVL(CANCELED_FLAG, 'N') != 'Y'
    AND (l_status = 'All'
         OR (l_status = 'Paid' AND PAID_STATUS = 'Paid')
         OR (l_status = 'Unpaid' AND PAID_STATUS != 'Paid'));

    -- Get invoices
    SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
            'invoiceId' VALUE INVOICE_ID,
            'invoiceNumber' VALUE INVOICE_NUMBER,
            'invoiceDate' VALUE INVOICE_DATE,
            'invoiceAmount' VALUE INVOICE_AMOUNT,
            'amountPaid' VALUE NVL(AMOUNT_PAID, 0),
            'balanceDue' VALUE (INVOICE_AMOUNT - NVL(AMOUNT_PAID, 0)),
            'invoiceCurrency' VALUE INVOICE_CURRENCY,
            'invoiceType' VALUE INVOICE_TYPE,
            'description' VALUE DESCRIPTION,
            'validationStatus' VALUE VALIDATION_STATUS,
            'approvalStatus' VALUE APPROVAL_STATUS,
            'paidStatus' VALUE PAID_STATUS,
            'accountingStatus' VALUE ACCOUNTING_STATUS,
            'paymentTerms' VALUE PAYMENT_TERMS,
            'accountingDate' VALUE ACCOUNTING_DATE,
            'daysOutstanding' VALUE TRUNC(SYSDATE) - TRUNC(TO_DATE(INVOICE_DATE, 'MM/DD/YYYY')),
            'businessUnit' VALUE BUSINESS_UNIT
        ) ORDER BY TO_DATE(INVOICE_DATE, 'MM/DD/YYYY') DESC
        RETURNING CLOB
    )
    INTO l_invoices
    FROM (
        SELECT *
        FROM RR_AP_INVOICES_ALL
        WHERE SUPPLIER_NUMBER = l_supplier_number
        AND NVL(CANCELED_FLAG, 'N') != 'Y'
        AND (l_status = 'All'
             OR (l_status = 'Paid' AND PAID_STATUS = 'Paid')
             OR (l_status = 'Unpaid' AND PAID_STATUS != 'Paid'))
        ORDER BY TO_DATE(INVOICE_DATE, 'MM/DD/YYYY') DESC
        OFFSET l_offset ROWS FETCH NEXT l_limit ROWS ONLY
    );

    -- Build response
    l_result := JSON_OBJECT(
        'success' VALUE 'true',
        'supplierNumber' VALUE l_supplier_number,
        'totalCount' VALUE l_total_count,
        'limit' VALUE l_limit,
        'offset' VALUE l_offset,
        'hasMore' VALUE CASE WHEN (l_offset + l_limit) < l_total_count THEN 'true' ELSE 'false' END,
        'invoices' VALUE JSON_QUERY(NVL(l_invoices, '[]') RETURNING CLOB)
    );

    :status_code := 200;
    HTP.p(l_result);
EXCEPTION
    WHEN OTHERS THEN
        :status_code := 500;
        HTP.p('{"success": false, "error": "' || SQLERRM || '"}');
END;
/


-- ============================================================================
-- 5. GET SUPPLIER PAYMENTS
-- Endpoint: GET /suppliers/balance/payments/:supplier_number
-- Returns: List of all payments for the supplier
-- Optional Query Params: status (Cleared/Voided/All), limit, offset
-- ============================================================================

-- ORDS Handler Definition:
-- Module: reerp
-- Pattern: suppliers/balance/payments/:supplier_number
-- Method: GET

DECLARE
    l_supplier_number VARCHAR2(100) := :supplier_number;
    l_status VARCHAR2(50) := NVL(:status, 'All');
    l_limit NUMBER := NVL(:limit, 100);
    l_offset NUMBER := NVL(:offset, 0);
    l_result CLOB;
    l_payments CLOB;
    l_total_count NUMBER;
BEGIN
    -- Get total count
    SELECT COUNT(*)
    INTO l_total_count
    FROM RR_AP_PAYMENTS_ALL
    WHERE SUPPLIER_NUMBER = l_supplier_number
    AND (l_status = 'All'
         OR PAYMENT_STATUS = l_status);

    -- Get payments
    SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
            'checkId' VALUE CHECK_ID,
            'paymentId' VALUE PAYMENT_ID,
            'paymentNumber' VALUE PAYMENT_NUMBER,
            'paymentDate' VALUE PAYMENT_DATE,
            'paymentAmount' VALUE PAYMENT_AMOUNT,
            'paymentCurrency' VALUE PAYMENT_CURRENCY,
            'paymentStatus' VALUE PAYMENT_STATUS,
            'paymentType' VALUE PAYMENT_TYPE,
            'paymentMethod' VALUE PAYMENT_METHOD,
            'paymentDescription' VALUE PAYMENT_DESCRIPTION,
            'clearingDate' VALUE CLEARING_DATE,
            'clearingAmount' VALUE CLEARING_AMOUNT,
            'voidDate' VALUE VOID_DATE,
            'businessUnit' VALUE BUSINESS_UNIT,
            'bankAccountName' VALUE DISBURSEMENT_BANK_ACCOUNT_NAME,
            'accountingStatus' VALUE ACCOUNTING_STATUS,
            'reconciledFlag' VALUE RECONCILED_FLAG
        ) ORDER BY TO_DATE(PAYMENT_DATE, 'MM/DD/YYYY') DESC
        RETURNING CLOB
    )
    INTO l_payments
    FROM (
        SELECT *
        FROM RR_AP_PAYMENTS_ALL
        WHERE SUPPLIER_NUMBER = l_supplier_number
        AND (l_status = 'All'
             OR PAYMENT_STATUS = l_status)
        ORDER BY TO_DATE(PAYMENT_DATE, 'MM/DD/YYYY') DESC
        OFFSET l_offset ROWS FETCH NEXT l_limit ROWS ONLY
    );

    -- Build response
    l_result := JSON_OBJECT(
        'success' VALUE 'true',
        'supplierNumber' VALUE l_supplier_number,
        'totalCount' VALUE l_total_count,
        'limit' VALUE l_limit,
        'offset' VALUE l_offset,
        'hasMore' VALUE CASE WHEN (l_offset + l_limit) < l_total_count THEN 'true' ELSE 'false' END,
        'payments' VALUE JSON_QUERY(NVL(l_payments, '[]') RETURNING CLOB)
    );

    :status_code := 200;
    HTP.p(l_result);
EXCEPTION
    WHEN OTHERS THEN
        :status_code := 500;
        HTP.p('{"success": false, "error": "' || SQLERRM || '"}');
END;
/


-- ============================================================================
-- 6. GET PAYMENT RELATED INVOICES (Drilldown)
-- Endpoint: GET /suppliers/balance/payment-invoices/:check_id
-- Returns: Invoices paid by a specific payment
-- ============================================================================

-- ORDS Handler Definition:
-- Module: reerp
-- Pattern: suppliers/balance/payment-invoices/:check_id
-- Method: GET

DECLARE
    l_check_id NUMBER := :check_id;
    l_result CLOB;
    l_invoices CLOB;
BEGIN
    -- Get related invoices for this payment
    SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
            'invoicePaymentId' VALUE ri.INVOICE_PAYMENT_ID,
            'checkId' VALUE ri.CHECK_ID,
            'invoiceId' VALUE ri.INVOICE_ID,
            'invoiceNumber' VALUE ri.INVOICE_NUMBER,
            'invoiceBusinessUnit' VALUE ri.INVOICE_BUSINESS_UNIT,
            'installmentNumber' VALUE ri.INSTALLMENT_NUMBER,
            'amountPaidPaymentCurrency' VALUE ri.AMOUNT_PAID_PAYMENT_CURRENCY,
            'amountPaidInvoiceCurrency' VALUE ri.AMOUNT_PAID_INVOICE_CURRENCY,
            'invoiceAmount' VALUE ri.INVOICE_AMOUNT,
            'invoiceCurrency' VALUE ri.INVOICE_CURRENCY,
            'discountTaken' VALUE ri.DISCOUNT_TAKEN,
            'discountLost' VALUE ri.DISCOUNT_LOST,
            'invoicePaymentStatus' VALUE ri.INVOICE_PAYMENT_STATUS
        )
        RETURNING CLOB
    )
    INTO l_invoices
    FROM RR_AP_PAYMENTS_RELATED_INVOICES ri
    WHERE ri.CHECK_ID = l_check_id;

    -- Get payment header info
    SELECT JSON_OBJECT(
        'success' VALUE 'true',
        'payment' VALUE JSON_OBJECT(
            'checkId' VALUE p.CHECK_ID,
            'paymentNumber' VALUE p.PAYMENT_NUMBER,
            'paymentAmount' VALUE p.PAYMENT_AMOUNT,
            'paymentDate' VALUE p.PAYMENT_DATE,
            'payee' VALUE p.PAYEE,
            'supplierNumber' VALUE p.SUPPLIER_NUMBER,
            'paymentStatus' VALUE p.PAYMENT_STATUS
        ),
        'relatedInvoices' VALUE JSON_QUERY(NVL(l_invoices, '[]') RETURNING CLOB),
        'invoiceCount' VALUE (SELECT COUNT(*) FROM RR_AP_PAYMENTS_RELATED_INVOICES WHERE CHECK_ID = l_check_id)
    )
    INTO l_result
    FROM RR_AP_PAYMENTS_ALL p
    WHERE p.CHECK_ID = l_check_id;

    :status_code := 200;
    HTP.p(l_result);
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        :status_code := 404;
        HTP.p('{"success": false, "error": "Payment not found"}');
    WHEN OTHERS THEN
        :status_code := 500;
        HTP.p('{"success": false, "error": "' || SQLERRM || '"}');
END;
/


-- ============================================================================
-- 7. GET SUPPLIER BALANCE DASHBOARD (All-in-One)
-- Endpoint: GET /suppliers/balance/dashboard/:supplier_number
-- Returns: Complete dashboard data - supplier info, summary, aging, recent invoices/payments
-- ============================================================================

-- ORDS Handler Definition:
-- Module: reerp
-- Pattern: suppliers/balance/dashboard/:supplier_number
-- Method: GET

DECLARE
    l_supplier_number VARCHAR2(100) := :supplier_number;
    l_result CLOB;

    -- Supplier info
    l_supplier_id NUMBER;
    l_supplier_name VARCHAR2(500);
    l_supplier_status VARCHAR2(50);
    l_address CLOB;

    -- Summary
    l_total_invoices NUMBER := 0;
    l_total_paid NUMBER := 0;
    l_invoice_count NUMBER := 0;
    l_payment_count NUMBER := 0;
    l_unpaid_count NUMBER := 0;
    l_balance NUMBER := 0;

    -- Aging
    l_current NUMBER := 0;
    l_days_1_30 NUMBER := 0;
    l_days_31_60 NUMBER := 0;
    l_days_61_90 NUMBER := 0;
    l_days_over_90 NUMBER := 0;

    -- Recent items
    l_recent_invoices CLOB;
    l_recent_payments CLOB;
BEGIN
    -- Get supplier info
    SELECT
        sm.SUPPLIER_ID,
        sm.SUPPLIER,
        sm.STATUS,
        (SELECT JSON_OBJECT(
            'addressName' VALUE sa.ADDRESS_NAME,
            'formattedAddress' VALUE sa.FORMATTED_ADDRESS,
            'city' VALUE sa.CITY,
            'country' VALUE sa.COUNTRY,
            'phone' VALUE sa.PHONE_NUMBER,
            'email' VALUE sa.EMAIL
        )
        FROM RR_SUPPLIER_ADDRESS sa
        WHERE sa.SUPPLIER_ID = sm.SUPPLIER_ID AND sa.STATUS = 'ACTIVE' AND ROWNUM = 1)
    INTO l_supplier_id, l_supplier_name, l_supplier_status, l_address
    FROM RR_SUPPLIER_MASTER sm
    WHERE sm.SUPPLIER_NUMBER = l_supplier_number;

    -- Get invoice summary
    SELECT
        NVL(SUM(INVOICE_AMOUNT), 0),
        COUNT(*),
        NVL(SUM(AMOUNT_PAID), 0),
        COUNT(CASE WHEN PAID_STATUS != 'Paid' THEN 1 END)
    INTO l_total_invoices, l_invoice_count, l_total_paid, l_unpaid_count
    FROM RR_AP_INVOICES_ALL
    WHERE SUPPLIER_NUMBER = l_supplier_number
    AND NVL(CANCELED_FLAG, 'N') != 'Y';

    l_balance := l_total_invoices - l_total_paid;

    -- Get payment count
    SELECT COUNT(DISTINCT CHECK_ID)
    INTO l_payment_count
    FROM RR_AP_PAYMENTS_ALL
    WHERE SUPPLIER_NUMBER = l_supplier_number;

    -- Get aging
    SELECT
        NVL(SUM(CASE WHEN TRUNC(SYSDATE) - TRUNC(TO_DATE(INVOICE_DATE, 'MM/DD/YYYY')) <= 0
            THEN (INVOICE_AMOUNT - NVL(AMOUNT_PAID, 0)) ELSE 0 END), 0),
        NVL(SUM(CASE WHEN TRUNC(SYSDATE) - TRUNC(TO_DATE(INVOICE_DATE, 'MM/DD/YYYY')) BETWEEN 1 AND 30
            THEN (INVOICE_AMOUNT - NVL(AMOUNT_PAID, 0)) ELSE 0 END), 0),
        NVL(SUM(CASE WHEN TRUNC(SYSDATE) - TRUNC(TO_DATE(INVOICE_DATE, 'MM/DD/YYYY')) BETWEEN 31 AND 60
            THEN (INVOICE_AMOUNT - NVL(AMOUNT_PAID, 0)) ELSE 0 END), 0),
        NVL(SUM(CASE WHEN TRUNC(SYSDATE) - TRUNC(TO_DATE(INVOICE_DATE, 'MM/DD/YYYY')) BETWEEN 61 AND 90
            THEN (INVOICE_AMOUNT - NVL(AMOUNT_PAID, 0)) ELSE 0 END), 0),
        NVL(SUM(CASE WHEN TRUNC(SYSDATE) - TRUNC(TO_DATE(INVOICE_DATE, 'MM/DD/YYYY')) > 90
            THEN (INVOICE_AMOUNT - NVL(AMOUNT_PAID, 0)) ELSE 0 END), 0)
    INTO l_current, l_days_1_30, l_days_31_60, l_days_61_90, l_days_over_90
    FROM RR_AP_INVOICES_ALL
    WHERE SUPPLIER_NUMBER = l_supplier_number
    AND NVL(CANCELED_FLAG, 'N') != 'Y'
    AND PAID_STATUS != 'Paid';

    -- Get recent 5 invoices
    SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
            'invoiceNumber' VALUE INVOICE_NUMBER,
            'invoiceDate' VALUE INVOICE_DATE,
            'invoiceAmount' VALUE INVOICE_AMOUNT,
            'balanceDue' VALUE (INVOICE_AMOUNT - NVL(AMOUNT_PAID, 0)),
            'paidStatus' VALUE PAID_STATUS
        ) ORDER BY TO_DATE(INVOICE_DATE, 'MM/DD/YYYY') DESC
        RETURNING CLOB
    )
    INTO l_recent_invoices
    FROM (
        SELECT * FROM RR_AP_INVOICES_ALL
        WHERE SUPPLIER_NUMBER = l_supplier_number
        AND NVL(CANCELED_FLAG, 'N') != 'Y'
        ORDER BY TO_DATE(INVOICE_DATE, 'MM/DD/YYYY') DESC
        FETCH FIRST 5 ROWS ONLY
    );

    -- Get recent 5 payments
    SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
            'paymentNumber' VALUE PAYMENT_NUMBER,
            'paymentDate' VALUE PAYMENT_DATE,
            'paymentAmount' VALUE PAYMENT_AMOUNT,
            'paymentStatus' VALUE PAYMENT_STATUS
        ) ORDER BY TO_DATE(PAYMENT_DATE, 'MM/DD/YYYY') DESC
        RETURNING CLOB
    )
    INTO l_recent_payments
    FROM (
        SELECT * FROM RR_AP_PAYMENTS_ALL
        WHERE SUPPLIER_NUMBER = l_supplier_number
        ORDER BY TO_DATE(PAYMENT_DATE, 'MM/DD/YYYY') DESC
        FETCH FIRST 5 ROWS ONLY
    );

    -- Build complete dashboard response
    l_result := JSON_OBJECT(
        'success' VALUE 'true',
        'supplier' VALUE JSON_OBJECT(
            'supplierId' VALUE l_supplier_id,
            'supplierNumber' VALUE l_supplier_number,
            'supplierName' VALUE l_supplier_name,
            'status' VALUE l_supplier_status,
            'address' VALUE JSON_QUERY(NVL(l_address, '{}') RETURNING CLOB)
        ),
        'summary' VALUE JSON_OBJECT(
            'totalInvoiceAmount' VALUE l_total_invoices,
            'totalPaidAmount' VALUE l_total_paid,
            'outstandingBalance' VALUE l_balance,
            'invoiceCount' VALUE l_invoice_count,
            'paymentCount' VALUE l_payment_count,
            'unpaidInvoiceCount' VALUE l_unpaid_count,
            'currency' VALUE 'AED'
        ),
        'aging' VALUE JSON_OBJECT(
            'current' VALUE l_current,
            'days1to30' VALUE l_days_1_30,
            'days31to60' VALUE l_days_31_60,
            'days61to90' VALUE l_days_61_90,
            'daysOver90' VALUE l_days_over_90,
            'totalOutstanding' VALUE l_balance
        ),
        'recentInvoices' VALUE JSON_QUERY(NVL(l_recent_invoices, '[]') RETURNING CLOB),
        'recentPayments' VALUE JSON_QUERY(NVL(l_recent_payments, '[]') RETURNING CLOB)
    );

    :status_code := 200;
    HTP.p(l_result);
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        :status_code := 404;
        HTP.p('{"success": false, "error": "Supplier not found"}');
    WHEN OTHERS THEN
        :status_code := 500;
        HTP.p('{"success": false, "error": "' || SQLERRM || '"}');
END;
/


-- ============================================================================
-- ORDS MODULE REGISTRATION (Run in APEX SQL Workshop)
-- ============================================================================
/*
-- Create the handlers in ORDS:

BEGIN
    ORDS.DEFINE_MODULE(
        p_module_name    => 'reerp',
        p_base_path      => '/reerp/',
        p_items_per_page => 25,
        p_status         => 'PUBLISHED',
        p_comments       => 'REERP API Module'
    );
END;
/

-- Template: suppliers/balance/dashboard/:supplier_number
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'reerp',
        p_pattern        => 'suppliers/balance/dashboard/:supplier_number',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_etag_query     => NULL,
        p_comments       => 'Supplier Balance Dashboard'
    );
END;
/

-- Similar DEFINE_TEMPLATE for other endpoints...

*/


-- ============================================================================
-- SUMMARY OF ENDPOINTS
-- ============================================================================
/*
| # | Endpoint                                      | Method | Description                    |
|---|-----------------------------------------------|--------|--------------------------------|
| 1 | /suppliers/balance/details/:supplier_number  | GET    | Supplier master + address      |
| 2 | /suppliers/balance/summary/:supplier_number  | GET    | Balance summary                |
| 3 | /suppliers/balance/aging/:supplier_number    | GET    | Aging report with buckets      |
| 4 | /suppliers/balance/invoices/:supplier_number | GET    | Invoice list with pagination   |
| 5 | /suppliers/balance/payments/:supplier_number | GET    | Payment list with pagination   |
| 6 | /suppliers/balance/payment-invoices/:check_id| GET    | Payment drilldown to invoices  |
| 7 | /suppliers/balance/dashboard/:supplier_number| GET    | All-in-one dashboard           |
*/
