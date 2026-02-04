-- ============================================================================
-- SUPPLIER BALANCE PACKAGE
-- Purpose: Provides APIs for Supplier Balance Dashboard
-- Author: REERP Team
-- Version: 1.0
-- ============================================================================

-- ============================================================================
-- PACKAGE SPECIFICATION
-- ============================================================================
CREATE OR REPLACE PACKAGE PKG_SUPPLIER_BALANCE AS

    -- Types for return data
    TYPE t_supplier_rec IS RECORD (
        supplier_id         NUMBER,
        supplier_party_id   NUMBER,
        supplier_name       VARCHAR2(500),
        supplier_number     VARCHAR2(100),
        alternate_name      VARCHAR2(500),
        supplier_type       VARCHAR2(100),
        status              VARCHAR2(50),
        business_rel        VARCHAR2(100),
        tax_reg_number      VARCHAR2(100),
        taxpayer_id         VARCHAR2(100),
        customer_number     VARCHAR2(100),
        website             VARCHAR2(500),
        creation_date       DATE
    );

    TYPE t_address_rec IS RECORD (
        address_id          NUMBER,
        address_name        VARCHAR2(500),
        address_line1       VARCHAR2(500),
        address_line2       VARCHAR2(500),
        address_line3       VARCHAR2(500),
        city                VARCHAR2(200),
        state               VARCHAR2(200),
        country             VARCHAR2(200),
        postal_code         VARCHAR2(50),
        formatted_address   VARCHAR2(2000),
        phone               VARCHAR2(100),
        email               VARCHAR2(200)
    );

    TYPE t_balance_summary_rec IS RECORD (
        total_invoice_amount    NUMBER,
        total_paid_amount       NUMBER,
        outstanding_balance     NUMBER,
        invoice_count           NUMBER,
        payment_count           NUMBER,
        unpaid_invoice_count    NUMBER,
        currency                VARCHAR2(10)
    );

    TYPE t_aging_rec IS RECORD (
        current_amt         NUMBER,
        days_1_30           NUMBER,
        days_31_60          NUMBER,
        days_61_90          NUMBER,
        days_91_120         NUMBER,
        days_over_120       NUMBER,
        total_outstanding   NUMBER
    );

    -- ========================================================================
    -- FUNCTION: Get Supplier Details
    -- Returns JSON with supplier master and address info
    -- ========================================================================
    FUNCTION get_supplier_details(
        p_supplier_number IN VARCHAR2
    ) RETURN CLOB;

    -- ========================================================================
    -- FUNCTION: Get Balance Summary
    -- Returns JSON with total invoices, payments, balance
    -- ========================================================================
    FUNCTION get_balance_summary(
        p_supplier_number IN VARCHAR2
    ) RETURN CLOB;

    -- ========================================================================
    -- FUNCTION: Get Aging Report
    -- Returns JSON with aging buckets
    -- ========================================================================
    FUNCTION get_aging_report(
        p_supplier_number IN VARCHAR2
    ) RETURN CLOB;

    -- ========================================================================
    -- FUNCTION: Get Supplier Invoices
    -- Returns JSON with invoice list (paginated)
    -- ========================================================================
    FUNCTION get_supplier_invoices(
        p_supplier_number IN VARCHAR2,
        p_status          IN VARCHAR2 DEFAULT 'All',
        p_limit           IN NUMBER DEFAULT 100,
        p_offset          IN NUMBER DEFAULT 0
    ) RETURN CLOB;

    -- ========================================================================
    -- FUNCTION: Get Supplier Payments
    -- Returns JSON with payment list (paginated)
    -- ========================================================================
    FUNCTION get_supplier_payments(
        p_supplier_number IN VARCHAR2,
        p_status          IN VARCHAR2 DEFAULT 'All',
        p_limit           IN NUMBER DEFAULT 100,
        p_offset          IN NUMBER DEFAULT 0
    ) RETURN CLOB;

    -- ========================================================================
    -- FUNCTION: Get Payment Related Invoices (Drilldown)
    -- Returns JSON with invoices paid by a specific payment
    -- ========================================================================
    FUNCTION get_payment_invoices(
        p_check_id IN NUMBER
    ) RETURN CLOB;

    -- ========================================================================
    -- FUNCTION: Get Complete Dashboard
    -- Returns JSON with all dashboard data in one call
    -- ========================================================================
    FUNCTION get_dashboard(
        p_supplier_number IN VARCHAR2
    ) RETURN CLOB;

    -- ========================================================================
    -- PROCEDURE: Output JSON Response (for ORDS handlers)
    -- ========================================================================
    PROCEDURE output_response(
        p_json        IN CLOB,
        p_status_code OUT NUMBER
    );

END PKG_SUPPLIER_BALANCE;
/


-- ============================================================================
-- PACKAGE BODY
-- ============================================================================
CREATE OR REPLACE PACKAGE BODY PKG_SUPPLIER_BALANCE AS

    -- ========================================================================
    -- PRIVATE: Helper function to safely parse date
    -- ========================================================================
    FUNCTION safe_to_date(p_date_str IN VARCHAR2) RETURN DATE IS
        l_date DATE;
    BEGIN
        IF p_date_str IS NULL THEN
            RETURN NULL;
        END IF;

        -- Try MM/DD/YYYY format first
        BEGIN
            l_date := TO_DATE(p_date_str, 'MM/DD/YYYY');
            RETURN l_date;
        EXCEPTION
            WHEN OTHERS THEN NULL;
        END;

        -- Try YYYY-MM-DD format
        BEGIN
            l_date := TO_DATE(p_date_str, 'YYYY-MM-DD');
            RETURN l_date;
        EXCEPTION
            WHEN OTHERS THEN NULL;
        END;

        -- Try DD-MON-YY format
        BEGIN
            l_date := TO_DATE(p_date_str, 'DD-MON-YY');
            RETURN l_date;
        EXCEPTION
            WHEN OTHERS THEN NULL;
        END;

        RETURN NULL;
    END safe_to_date;

    -- ========================================================================
    -- PRIVATE: Get supplier address as JSON
    -- ========================================================================
    FUNCTION get_address_json(p_supplier_id IN NUMBER) RETURN CLOB IS
        l_result CLOB;
    BEGIN
        SELECT JSON_OBJECT(
            'addressId'         VALUE SUPPLIER_ADDRESS_ID,
            'addressName'       VALUE ADDRESS_NAME,
            'addressLine1'      VALUE ADDRESS_LINE1,
            'addressLine2'      VALUE ADDRESS_LINE2,
            'addressLine3'      VALUE ADDRESS_LINE3,
            'city'              VALUE CITY,
            'state'             VALUE STATE,
            'country'           VALUE COUNTRY,
            'postalCode'        VALUE POSTAL_CODE,
            'formattedAddress'  VALUE FORMATTED_ADDRESS,
            'phone'             VALUE PHONE_NUMBER,
            'email'             VALUE EMAIL
            ABSENT ON NULL
        )
        INTO l_result
        FROM RR_SUPPLIER_ADDRESS
        WHERE SUPPLIER_ID = p_supplier_id
        AND STATUS = 'ACTIVE'
        AND ROWNUM = 1;

        RETURN l_result;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RETURN '{}';
        WHEN OTHERS THEN
            RETURN '{}';
    END get_address_json;

    -- ========================================================================
    -- FUNCTION: Get Supplier Details
    -- ========================================================================
    FUNCTION get_supplier_details(
        p_supplier_number IN VARCHAR2
    ) RETURN CLOB IS
        l_result        CLOB;
        l_supplier_id   NUMBER;
        l_address       CLOB;
    BEGIN
        -- Get supplier ID first
        SELECT SUPPLIER_ID INTO l_supplier_id
        FROM RR_SUPPLIER_MASTER
        WHERE SUPPLIER_NUMBER = p_supplier_number;

        -- Get address
        l_address := get_address_json(l_supplier_id);

        -- Build full response
        SELECT JSON_OBJECT(
            'success' VALUE 'true',
            'supplier' VALUE JSON_OBJECT(
                'supplierId'            VALUE sm.SUPPLIER_ID,
                'supplierPartyId'       VALUE sm.SUPPLIER_PARTY_ID,
                'supplierName'          VALUE sm.SUPPLIER,
                'supplierNumber'        VALUE sm.SUPPLIER_NUMBER,
                'alternateName'         VALUE sm.ALTERNATE_NAME,
                'supplierType'          VALUE sm.SUPPLIER_TYPE,
                'status'                VALUE sm.STATUS,
                'businessRelationship'  VALUE sm.BUSINESS_RELATIONSHIP,
                'taxRegistrationNumber' VALUE sm.TAX_REGISTRATION_NUMBER,
                'taxpayerId'            VALUE sm.TAXPAYER_ID,
                'customerNumber'        VALUE sm.CUSTOMER_NUMBER,
                'corporateWebsite'      VALUE sm.CORPORATE_WEBSITE,
                'creationDate'          VALUE TO_CHAR(sm.CREATION_DATE, 'YYYY-MM-DD'),
                'address'               VALUE JSON_QUERY(l_address RETURNING CLOB)
                ABSENT ON NULL
            )
        )
        INTO l_result
        FROM RR_SUPPLIER_MASTER sm
        WHERE sm.SUPPLIER_NUMBER = p_supplier_number;

        RETURN l_result;

    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RETURN '{"success": false, "error": "Supplier not found", "supplierNumber": "' || p_supplier_number || '"}';
        WHEN OTHERS THEN
            RETURN '{"success": false, "error": "' || SQLERRM || '"}';
    END get_supplier_details;

    -- ========================================================================
    -- FUNCTION: Get Balance Summary
    -- ========================================================================
    FUNCTION get_balance_summary(
        p_supplier_number IN VARCHAR2
    ) RETURN CLOB IS
        l_result            CLOB;
        l_total_invoices    NUMBER := 0;
        l_total_paid        NUMBER := 0;
        l_invoice_count     NUMBER := 0;
        l_payment_count     NUMBER := 0;
        l_unpaid_count      NUMBER := 0;
        l_balance           NUMBER := 0;
    BEGIN
        -- Get invoice totals
        SELECT
            NVL(SUM(INVOICE_AMOUNT), 0),
            COUNT(*),
            NVL(SUM(AMOUNT_PAID), 0),
            COUNT(CASE WHEN NVL(PAID_STATUS, 'Unpaid') != 'Paid' THEN 1 END)
        INTO l_total_invoices, l_invoice_count, l_total_paid, l_unpaid_count
        FROM RR_AP_INVOICES_ALL
        WHERE SUPPLIER_NUMBER = p_supplier_number
        AND NVL(CANCELED_FLAG, 'N') != 'Y';

        -- Get payment count
        SELECT COUNT(DISTINCT CHECK_ID)
        INTO l_payment_count
        FROM RR_AP_PAYMENTS_ALL
        WHERE SUPPLIER_NUMBER = p_supplier_number;

        -- Calculate balance
        l_balance := l_total_invoices - l_total_paid;

        -- Build JSON response
        l_result := JSON_OBJECT(
            'success'           VALUE 'true',
            'supplierNumber'    VALUE p_supplier_number,
            'summary'           VALUE JSON_OBJECT(
                'totalInvoiceAmount'    VALUE l_total_invoices,
                'totalPaidAmount'       VALUE l_total_paid,
                'outstandingBalance'    VALUE l_balance,
                'invoiceCount'          VALUE l_invoice_count,
                'paymentCount'          VALUE l_payment_count,
                'unpaidInvoiceCount'    VALUE l_unpaid_count,
                'currency'              VALUE 'AED'
            )
        );

        RETURN l_result;

    EXCEPTION
        WHEN OTHERS THEN
            RETURN '{"success": false, "error": "' || SQLERRM || '"}';
    END get_balance_summary;

    -- ========================================================================
    -- FUNCTION: Get Aging Report
    -- ========================================================================
    FUNCTION get_aging_report(
        p_supplier_number IN VARCHAR2
    ) RETURN CLOB IS
        l_result            CLOB;
        l_current           NUMBER := 0;
        l_days_1_30         NUMBER := 0;
        l_days_31_60        NUMBER := 0;
        l_days_61_90        NUMBER := 0;
        l_days_91_120       NUMBER := 0;
        l_days_over_120     NUMBER := 0;
        l_total_outstanding NUMBER := 0;
    BEGIN
        -- Calculate aging based on invoice date and unpaid amount
        FOR rec IN (
            SELECT
                INVOICE_AMOUNT,
                NVL(AMOUNT_PAID, 0) AS AMOUNT_PAID,
                INVOICE_DATE
            FROM RR_AP_INVOICES_ALL
            WHERE SUPPLIER_NUMBER = p_supplier_number
            AND NVL(CANCELED_FLAG, 'N') != 'Y'
            AND NVL(PAID_STATUS, 'Unpaid') != 'Paid'
        ) LOOP
            DECLARE
                l_invoice_date DATE;
                l_days_old NUMBER;
                l_unpaid_amt NUMBER;
            BEGIN
                l_invoice_date := safe_to_date(rec.INVOICE_DATE);
                l_unpaid_amt := rec.INVOICE_AMOUNT - rec.AMOUNT_PAID;

                IF l_invoice_date IS NOT NULL AND l_unpaid_amt > 0 THEN
                    l_days_old := TRUNC(SYSDATE) - TRUNC(l_invoice_date);

                    IF l_days_old <= 0 THEN
                        l_current := l_current + l_unpaid_amt;
                    ELSIF l_days_old BETWEEN 1 AND 30 THEN
                        l_days_1_30 := l_days_1_30 + l_unpaid_amt;
                    ELSIF l_days_old BETWEEN 31 AND 60 THEN
                        l_days_31_60 := l_days_31_60 + l_unpaid_amt;
                    ELSIF l_days_old BETWEEN 61 AND 90 THEN
                        l_days_61_90 := l_days_61_90 + l_unpaid_amt;
                    ELSIF l_days_old BETWEEN 91 AND 120 THEN
                        l_days_91_120 := l_days_91_120 + l_unpaid_amt;
                    ELSE
                        l_days_over_120 := l_days_over_120 + l_unpaid_amt;
                    END IF;
                END IF;
            END;
        END LOOP;

        l_total_outstanding := l_current + l_days_1_30 + l_days_31_60 +
                               l_days_61_90 + l_days_91_120 + l_days_over_120;

        -- Build JSON response
        l_result := JSON_OBJECT(
            'success'           VALUE 'true',
            'supplierNumber'    VALUE p_supplier_number,
            'aging'             VALUE JSON_OBJECT(
                'current'           VALUE l_current,
                'days1to30'         VALUE l_days_1_30,
                'days31to60'        VALUE l_days_31_60,
                'days61to90'        VALUE l_days_61_90,
                'days91to120'       VALUE l_days_91_120,
                'daysOver120'       VALUE l_days_over_120,
                'totalOutstanding'  VALUE l_total_outstanding,
                'currency'          VALUE 'AED'
            ),
            'agingBuckets'      VALUE JSON_ARRAY(
                JSON_OBJECT(
                    'bucket'        VALUE 'Current',
                    'amount'        VALUE l_current,
                    'percentage'    VALUE CASE WHEN l_total_outstanding > 0
                                          THEN ROUND(l_current / l_total_outstanding * 100, 2)
                                          ELSE 0 END
                ),
                JSON_OBJECT(
                    'bucket'        VALUE '1-30 Days',
                    'amount'        VALUE l_days_1_30,
                    'percentage'    VALUE CASE WHEN l_total_outstanding > 0
                                          THEN ROUND(l_days_1_30 / l_total_outstanding * 100, 2)
                                          ELSE 0 END
                ),
                JSON_OBJECT(
                    'bucket'        VALUE '31-60 Days',
                    'amount'        VALUE l_days_31_60,
                    'percentage'    VALUE CASE WHEN l_total_outstanding > 0
                                          THEN ROUND(l_days_31_60 / l_total_outstanding * 100, 2)
                                          ELSE 0 END
                ),
                JSON_OBJECT(
                    'bucket'        VALUE '61-90 Days',
                    'amount'        VALUE l_days_61_90,
                    'percentage'    VALUE CASE WHEN l_total_outstanding > 0
                                          THEN ROUND(l_days_61_90 / l_total_outstanding * 100, 2)
                                          ELSE 0 END
                ),
                JSON_OBJECT(
                    'bucket'        VALUE '91-120 Days',
                    'amount'        VALUE l_days_91_120,
                    'percentage'    VALUE CASE WHEN l_total_outstanding > 0
                                          THEN ROUND(l_days_91_120 / l_total_outstanding * 100, 2)
                                          ELSE 0 END
                ),
                JSON_OBJECT(
                    'bucket'        VALUE 'Over 120 Days',
                    'amount'        VALUE l_days_over_120,
                    'percentage'    VALUE CASE WHEN l_total_outstanding > 0
                                          THEN ROUND(l_days_over_120 / l_total_outstanding * 100, 2)
                                          ELSE 0 END
                )
            )
        );

        RETURN l_result;

    EXCEPTION
        WHEN OTHERS THEN
            RETURN '{"success": false, "error": "' || SQLERRM || '"}';
    END get_aging_report;

    -- ========================================================================
    -- FUNCTION: Get Supplier Invoices
    -- ========================================================================
    FUNCTION get_supplier_invoices(
        p_supplier_number IN VARCHAR2,
        p_status          IN VARCHAR2 DEFAULT 'All',
        p_limit           IN NUMBER DEFAULT 100,
        p_offset          IN NUMBER DEFAULT 0
    ) RETURN CLOB IS
        l_result        CLOB;
        l_invoices      CLOB;
        l_total_count   NUMBER;
    BEGIN
        -- Get total count
        SELECT COUNT(*)
        INTO l_total_count
        FROM RR_AP_INVOICES_ALL
        WHERE SUPPLIER_NUMBER = p_supplier_number
        AND NVL(CANCELED_FLAG, 'N') != 'Y'
        AND (p_status = 'All'
             OR (p_status = 'Paid' AND PAID_STATUS = 'Paid')
             OR (p_status = 'Unpaid' AND NVL(PAID_STATUS, 'Unpaid') != 'Paid'));

        -- Get invoices with pagination
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'invoiceId'         VALUE INVOICE_ID,
                'invoiceNumber'     VALUE INVOICE_NUMBER,
                'invoiceDate'       VALUE INVOICE_DATE,
                'invoiceAmount'     VALUE INVOICE_AMOUNT,
                'amountPaid'        VALUE NVL(AMOUNT_PAID, 0),
                'balanceDue'        VALUE (INVOICE_AMOUNT - NVL(AMOUNT_PAID, 0)),
                'invoiceCurrency'   VALUE INVOICE_CURRENCY,
                'invoiceType'       VALUE INVOICE_TYPE,
                'description'       VALUE DESCRIPTION,
                'validationStatus'  VALUE VALIDATION_STATUS,
                'approvalStatus'    VALUE APPROVAL_STATUS,
                'paidStatus'        VALUE PAID_STATUS,
                'accountingStatus'  VALUE ACCOUNTING_STATUS,
                'paymentTerms'      VALUE PAYMENT_TERMS,
                'accountingDate'    VALUE ACCOUNTING_DATE,
                'businessUnit'      VALUE BUSINESS_UNIT
                ABSENT ON NULL
            )
            RETURNING CLOB
        )
        INTO l_invoices
        FROM (
            SELECT *
            FROM RR_AP_INVOICES_ALL
            WHERE SUPPLIER_NUMBER = p_supplier_number
            AND NVL(CANCELED_FLAG, 'N') != 'Y'
            AND (p_status = 'All'
                 OR (p_status = 'Paid' AND PAID_STATUS = 'Paid')
                 OR (p_status = 'Unpaid' AND NVL(PAID_STATUS, 'Unpaid') != 'Paid'))
            ORDER BY INVOICE_ID DESC
            OFFSET p_offset ROWS FETCH NEXT p_limit ROWS ONLY
        );

        -- Build response
        l_result := JSON_OBJECT(
            'success'           VALUE 'true',
            'supplierNumber'    VALUE p_supplier_number,
            'totalCount'        VALUE l_total_count,
            'limit'             VALUE p_limit,
            'offset'            VALUE p_offset,
            'hasMore'           VALUE CASE WHEN (p_offset + p_limit) < l_total_count
                                      THEN 'true' ELSE 'false' END,
            'invoices'          VALUE JSON_QUERY(NVL(l_invoices, '[]') RETURNING CLOB)
        );

        RETURN l_result;

    EXCEPTION
        WHEN OTHERS THEN
            RETURN '{"success": false, "error": "' || SQLERRM || '"}';
    END get_supplier_invoices;

    -- ========================================================================
    -- FUNCTION: Get Supplier Payments
    -- ========================================================================
    FUNCTION get_supplier_payments(
        p_supplier_number IN VARCHAR2,
        p_status          IN VARCHAR2 DEFAULT 'All',
        p_limit           IN NUMBER DEFAULT 100,
        p_offset          IN NUMBER DEFAULT 0
    ) RETURN CLOB IS
        l_result        CLOB;
        l_payments      CLOB;
        l_total_count   NUMBER;
    BEGIN
        -- Get total count
        SELECT COUNT(*)
        INTO l_total_count
        FROM RR_AP_PAYMENTS_ALL
        WHERE SUPPLIER_NUMBER = p_supplier_number
        AND (p_status = 'All' OR PAYMENT_STATUS = p_status);

        -- Get payments with pagination
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'checkId'               VALUE CHECK_ID,
                'paymentId'             VALUE PAYMENT_ID,
                'paymentNumber'         VALUE PAYMENT_NUMBER,
                'paymentDate'           VALUE PAYMENT_DATE,
                'paymentAmount'         VALUE PAYMENT_AMOUNT,
                'paymentCurrency'       VALUE PAYMENT_CURRENCY,
                'paymentStatus'         VALUE PAYMENT_STATUS,
                'paymentType'           VALUE PAYMENT_TYPE,
                'paymentMethod'         VALUE PAYMENT_METHOD,
                'paymentDescription'    VALUE PAYMENT_DESCRIPTION,
                'clearingDate'          VALUE CLEARING_DATE,
                'clearingAmount'        VALUE CLEARING_AMOUNT,
                'voidDate'              VALUE VOID_DATE,
                'businessUnit'          VALUE BUSINESS_UNIT,
                'bankAccountName'       VALUE DISBURSEMENT_BANK_ACCOUNT_NAME,
                'accountingStatus'      VALUE ACCOUNTING_STATUS,
                'reconciledFlag'        VALUE RECONCILED_FLAG
                ABSENT ON NULL
            )
            RETURNING CLOB
        )
        INTO l_payments
        FROM (
            SELECT *
            FROM RR_AP_PAYMENTS_ALL
            WHERE SUPPLIER_NUMBER = p_supplier_number
            AND (p_status = 'All' OR PAYMENT_STATUS = p_status)
            ORDER BY CHECK_ID DESC
            OFFSET p_offset ROWS FETCH NEXT p_limit ROWS ONLY
        );

        -- Build response
        l_result := JSON_OBJECT(
            'success'           VALUE 'true',
            'supplierNumber'    VALUE p_supplier_number,
            'totalCount'        VALUE l_total_count,
            'limit'             VALUE p_limit,
            'offset'            VALUE p_offset,
            'hasMore'           VALUE CASE WHEN (p_offset + p_limit) < l_total_count
                                      THEN 'true' ELSE 'false' END,
            'payments'          VALUE JSON_QUERY(NVL(l_payments, '[]') RETURNING CLOB)
        );

        RETURN l_result;

    EXCEPTION
        WHEN OTHERS THEN
            RETURN '{"success": false, "error": "' || SQLERRM || '"}';
    END get_supplier_payments;

    -- ========================================================================
    -- FUNCTION: Get Payment Related Invoices (Drilldown)
    -- ========================================================================
    FUNCTION get_payment_invoices(
        p_check_id IN NUMBER
    ) RETURN CLOB IS
        l_result    CLOB;
        l_invoices  CLOB;
        l_payment   CLOB;
        l_count     NUMBER;
    BEGIN
        -- Get payment header
        SELECT JSON_OBJECT(
            'checkId'           VALUE CHECK_ID,
            'paymentNumber'     VALUE PAYMENT_NUMBER,
            'paymentAmount'     VALUE PAYMENT_AMOUNT,
            'paymentDate'       VALUE PAYMENT_DATE,
            'payee'             VALUE PAYEE,
            'supplierNumber'    VALUE SUPPLIER_NUMBER,
            'paymentStatus'     VALUE PAYMENT_STATUS
        )
        INTO l_payment
        FROM RR_AP_PAYMENTS_ALL
        WHERE CHECK_ID = p_check_id;

        -- Get related invoices
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'invoicePaymentId'          VALUE INVOICE_PAYMENT_ID,
                'checkId'                   VALUE CHECK_ID,
                'invoiceId'                 VALUE INVOICE_ID,
                'invoiceNumber'             VALUE INVOICE_NUMBER,
                'invoiceBusinessUnit'       VALUE INVOICE_BUSINESS_UNIT,
                'installmentNumber'         VALUE INSTALLMENT_NUMBER,
                'amountPaidPaymentCurrency' VALUE AMOUNT_PAID_PAYMENT_CURRENCY,
                'amountPaidInvoiceCurrency' VALUE AMOUNT_PAID_INVOICE_CURRENCY,
                'invoiceAmount'             VALUE INVOICE_AMOUNT,
                'invoiceCurrency'           VALUE INVOICE_CURRENCY,
                'discountTaken'             VALUE DISCOUNT_TAKEN,
                'discountLost'              VALUE DISCOUNT_LOST,
                'invoicePaymentStatus'      VALUE INVOICE_PAYMENT_STATUS
                ABSENT ON NULL
            )
            RETURNING CLOB
        ),
        COUNT(*)
        INTO l_invoices, l_count
        FROM RR_AP_PAYMENTS_RELATED_INVOICES
        WHERE CHECK_ID = p_check_id;

        -- Build response
        l_result := JSON_OBJECT(
            'success'           VALUE 'true',
            'payment'           VALUE JSON_QUERY(l_payment RETURNING CLOB),
            'relatedInvoices'   VALUE JSON_QUERY(NVL(l_invoices, '[]') RETURNING CLOB),
            'invoiceCount'      VALUE l_count
        );

        RETURN l_result;

    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RETURN '{"success": false, "error": "Payment not found", "checkId": ' || p_check_id || '}';
        WHEN OTHERS THEN
            RETURN '{"success": false, "error": "' || SQLERRM || '"}';
    END get_payment_invoices;

    -- ========================================================================
    -- FUNCTION: Get Complete Dashboard
    -- ========================================================================
    FUNCTION get_dashboard(
        p_supplier_number IN VARCHAR2
    ) RETURN CLOB IS
        l_result            CLOB;

        -- Supplier info
        l_supplier_id       NUMBER;
        l_supplier_name     VARCHAR2(500);
        l_supplier_status   VARCHAR2(50);
        l_address           CLOB;

        -- Summary
        l_total_invoices    NUMBER := 0;
        l_total_paid        NUMBER := 0;
        l_invoice_count     NUMBER := 0;
        l_payment_count     NUMBER := 0;
        l_unpaid_count      NUMBER := 0;
        l_balance           NUMBER := 0;

        -- Aging
        l_current           NUMBER := 0;
        l_days_1_30         NUMBER := 0;
        l_days_31_60        NUMBER := 0;
        l_days_61_90        NUMBER := 0;
        l_days_over_90      NUMBER := 0;

        -- Recent items
        l_recent_invoices   CLOB;
        l_recent_payments   CLOB;
    BEGIN
        -- Get supplier info
        SELECT SUPPLIER_ID, SUPPLIER, STATUS
        INTO l_supplier_id, l_supplier_name, l_supplier_status
        FROM RR_SUPPLIER_MASTER
        WHERE SUPPLIER_NUMBER = p_supplier_number;

        -- Get address
        l_address := get_address_json(l_supplier_id);

        -- Get invoice summary
        SELECT
            NVL(SUM(INVOICE_AMOUNT), 0),
            COUNT(*),
            NVL(SUM(AMOUNT_PAID), 0),
            COUNT(CASE WHEN NVL(PAID_STATUS, 'Unpaid') != 'Paid' THEN 1 END)
        INTO l_total_invoices, l_invoice_count, l_total_paid, l_unpaid_count
        FROM RR_AP_INVOICES_ALL
        WHERE SUPPLIER_NUMBER = p_supplier_number
        AND NVL(CANCELED_FLAG, 'N') != 'Y';

        l_balance := l_total_invoices - l_total_paid;

        -- Get payment count
        SELECT COUNT(DISTINCT CHECK_ID)
        INTO l_payment_count
        FROM RR_AP_PAYMENTS_ALL
        WHERE SUPPLIER_NUMBER = p_supplier_number;

        -- Calculate aging
        FOR rec IN (
            SELECT INVOICE_AMOUNT, NVL(AMOUNT_PAID, 0) AS AMOUNT_PAID, INVOICE_DATE
            FROM RR_AP_INVOICES_ALL
            WHERE SUPPLIER_NUMBER = p_supplier_number
            AND NVL(CANCELED_FLAG, 'N') != 'Y'
            AND NVL(PAID_STATUS, 'Unpaid') != 'Paid'
        ) LOOP
            DECLARE
                l_invoice_date DATE;
                l_days_old NUMBER;
                l_unpaid_amt NUMBER;
            BEGIN
                l_invoice_date := safe_to_date(rec.INVOICE_DATE);
                l_unpaid_amt := rec.INVOICE_AMOUNT - rec.AMOUNT_PAID;

                IF l_invoice_date IS NOT NULL AND l_unpaid_amt > 0 THEN
                    l_days_old := TRUNC(SYSDATE) - TRUNC(l_invoice_date);

                    IF l_days_old <= 0 THEN
                        l_current := l_current + l_unpaid_amt;
                    ELSIF l_days_old BETWEEN 1 AND 30 THEN
                        l_days_1_30 := l_days_1_30 + l_unpaid_amt;
                    ELSIF l_days_old BETWEEN 31 AND 60 THEN
                        l_days_31_60 := l_days_31_60 + l_unpaid_amt;
                    ELSIF l_days_old BETWEEN 61 AND 90 THEN
                        l_days_61_90 := l_days_61_90 + l_unpaid_amt;
                    ELSE
                        l_days_over_90 := l_days_over_90 + l_unpaid_amt;
                    END IF;
                END IF;
            END;
        END LOOP;

        -- Get recent 5 invoices
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'invoiceNumber' VALUE INVOICE_NUMBER,
                'invoiceDate'   VALUE INVOICE_DATE,
                'invoiceAmount' VALUE INVOICE_AMOUNT,
                'balanceDue'    VALUE (INVOICE_AMOUNT - NVL(AMOUNT_PAID, 0)),
                'paidStatus'    VALUE PAID_STATUS
                ABSENT ON NULL
            )
            RETURNING CLOB
        )
        INTO l_recent_invoices
        FROM (
            SELECT * FROM RR_AP_INVOICES_ALL
            WHERE SUPPLIER_NUMBER = p_supplier_number
            AND NVL(CANCELED_FLAG, 'N') != 'Y'
            ORDER BY INVOICE_ID DESC
            FETCH FIRST 5 ROWS ONLY
        );

        -- Get recent 5 payments
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'paymentNumber' VALUE PAYMENT_NUMBER,
                'paymentDate'   VALUE PAYMENT_DATE,
                'paymentAmount' VALUE PAYMENT_AMOUNT,
                'paymentStatus' VALUE PAYMENT_STATUS
                ABSENT ON NULL
            )
            RETURNING CLOB
        )
        INTO l_recent_payments
        FROM (
            SELECT * FROM RR_AP_PAYMENTS_ALL
            WHERE SUPPLIER_NUMBER = p_supplier_number
            ORDER BY CHECK_ID DESC
            FETCH FIRST 5 ROWS ONLY
        );

        -- Build complete dashboard response
        l_result := JSON_OBJECT(
            'success' VALUE 'true',
            'supplier' VALUE JSON_OBJECT(
                'supplierId'        VALUE l_supplier_id,
                'supplierNumber'    VALUE p_supplier_number,
                'supplierName'      VALUE l_supplier_name,
                'status'            VALUE l_supplier_status,
                'address'           VALUE JSON_QUERY(NVL(l_address, '{}') RETURNING CLOB)
            ),
            'summary' VALUE JSON_OBJECT(
                'totalInvoiceAmount'    VALUE l_total_invoices,
                'totalPaidAmount'       VALUE l_total_paid,
                'outstandingBalance'    VALUE l_balance,
                'invoiceCount'          VALUE l_invoice_count,
                'paymentCount'          VALUE l_payment_count,
                'unpaidInvoiceCount'    VALUE l_unpaid_count,
                'currency'              VALUE 'AED'
            ),
            'aging' VALUE JSON_OBJECT(
                'current'           VALUE l_current,
                'days1to30'         VALUE l_days_1_30,
                'days31to60'        VALUE l_days_31_60,
                'days61to90'        VALUE l_days_61_90,
                'daysOver90'        VALUE l_days_over_90,
                'totalOutstanding'  VALUE l_balance
            ),
            'recentInvoices' VALUE JSON_QUERY(NVL(l_recent_invoices, '[]') RETURNING CLOB),
            'recentPayments' VALUE JSON_QUERY(NVL(l_recent_payments, '[]') RETURNING CLOB)
        );

        RETURN l_result;

    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RETURN '{"success": false, "error": "Supplier not found", "supplierNumber": "' || p_supplier_number || '"}';
        WHEN OTHERS THEN
            RETURN '{"success": false, "error": "' || SQLERRM || '"}';
    END get_dashboard;

    -- ========================================================================
    -- PROCEDURE: Output JSON Response (for ORDS handlers)
    -- ========================================================================
    PROCEDURE output_response(
        p_json        IN CLOB,
        p_status_code OUT NUMBER
    ) IS
        l_success VARCHAR2(10);
    BEGIN
        -- Determine status code based on response
        BEGIN
            SELECT JSON_VALUE(p_json, '$.success') INTO l_success FROM DUAL;
            IF l_success = 'true' THEN
                p_status_code := 200;
            ELSE
                -- Check if it's a not found error
                IF INSTR(p_json, 'not found') > 0 THEN
                    p_status_code := 404;
                ELSE
                    p_status_code := 500;
                END IF;
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                p_status_code := 500;
        END;

        -- Output the JSON
        HTP.p(p_json);
    END output_response;

END PKG_SUPPLIER_BALANCE;
/


-- ============================================================================
-- ORDS HANDLER DEFINITIONS (Simple calls to package)
-- ============================================================================

/*
================================================================================
ORDS Handler Setup Instructions:
================================================================================

1. Supplier Details Handler
   Module: reerp
   Pattern: suppliers/balance/details/:supplier_number
   Method: GET
   Source:
*/
-- Handler 1: Supplier Details
DECLARE
    l_json CLOB;
BEGIN
    l_json := PKG_SUPPLIER_BALANCE.get_supplier_details(:supplier_number);
    PKG_SUPPLIER_BALANCE.output_response(l_json, :status_code);
END;
/

/*
2. Balance Summary Handler
   Pattern: suppliers/balance/summary/:supplier_number
   Method: GET
*/
DECLARE
    l_json CLOB;
BEGIN
    l_json := PKG_SUPPLIER_BALANCE.get_balance_summary(:supplier_number);
    PKG_SUPPLIER_BALANCE.output_response(l_json, :status_code);
END;
/

/*
3. Aging Report Handler
   Pattern: suppliers/balance/aging/:supplier_number
   Method: GET
*/
DECLARE
    l_json CLOB;
BEGIN
    l_json := PKG_SUPPLIER_BALANCE.get_aging_report(:supplier_number);
    PKG_SUPPLIER_BALANCE.output_response(l_json, :status_code);
END;
/

/*
4. Invoices List Handler
   Pattern: suppliers/balance/invoices/:supplier_number
   Method: GET
   Query Params: status, limit, offset
*/
DECLARE
    l_json CLOB;
BEGIN
    l_json := PKG_SUPPLIER_BALANCE.get_supplier_invoices(
        p_supplier_number => :supplier_number,
        p_status          => NVL(:status, 'All'),
        p_limit           => NVL(:limit, 100),
        p_offset          => NVL(:offset, 0)
    );
    PKG_SUPPLIER_BALANCE.output_response(l_json, :status_code);
END;
/

/*
5. Payments List Handler
   Pattern: suppliers/balance/payments/:supplier_number
   Method: GET
   Query Params: status, limit, offset
*/
DECLARE
    l_json CLOB;
BEGIN
    l_json := PKG_SUPPLIER_BALANCE.get_supplier_payments(
        p_supplier_number => :supplier_number,
        p_status          => NVL(:status, 'All'),
        p_limit           => NVL(:limit, 100),
        p_offset          => NVL(:offset, 0)
    );
    PKG_SUPPLIER_BALANCE.output_response(l_json, :status_code);
END;
/

/*
6. Payment Drilldown Handler
   Pattern: suppliers/balance/payment-invoices/:check_id
   Method: GET
*/
DECLARE
    l_json CLOB;
BEGIN
    l_json := PKG_SUPPLIER_BALANCE.get_payment_invoices(:check_id);
    PKG_SUPPLIER_BALANCE.output_response(l_json, :status_code);
END;
/

/*
7. Dashboard Handler (All-in-One)
   Pattern: suppliers/balance/dashboard/:supplier_number
   Method: GET
*/
DECLARE
    l_json CLOB;
BEGIN
    l_json := PKG_SUPPLIER_BALANCE.get_dashboard(:supplier_number);
    PKG_SUPPLIER_BALANCE.output_response(l_json, :status_code);
END;
/


-- ============================================================================
-- SUMMARY OF API ENDPOINTS
-- ============================================================================
/*
| # | Endpoint                                       | Method | Package Function           |
|---|------------------------------------------------|--------|----------------------------|
| 1 | /suppliers/balance/details/:supplier_number   | GET    | get_supplier_details()     |
| 2 | /suppliers/balance/summary/:supplier_number   | GET    | get_balance_summary()      |
| 3 | /suppliers/balance/aging/:supplier_number     | GET    | get_aging_report()         |
| 4 | /suppliers/balance/invoices/:supplier_number  | GET    | get_supplier_invoices()    |
| 5 | /suppliers/balance/payments/:supplier_number  | GET    | get_supplier_payments()    |
| 6 | /suppliers/balance/payment-invoices/:check_id | GET    | get_payment_invoices()     |
| 7 | /suppliers/balance/dashboard/:supplier_number | GET    | get_dashboard()            |

Query Parameters for endpoints 4 & 5:
- status: 'All', 'Paid', 'Unpaid' (invoices) or 'All', 'Cleared', 'Voided' (payments)
- limit: Number of records (default 100)
- offset: Starting position (default 0)
*/
