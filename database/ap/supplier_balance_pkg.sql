-- ============================================================================
-- SUPPLIER BALANCE PACKAGE
-- Purpose: Provides APIs for Supplier Balance Dashboard
-- Author: REERP Team
-- Version: 1.1
-- ============================================================================

-- ============================================================================
-- PACKAGE SPECIFICATION
-- ============================================================================
CREATE OR REPLACE PACKAGE PKG_SUPPLIER_BALANCE AS

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
            'address_id'         VALUE SUPPLIER_ADDRESS_ID,
            'address_name'       VALUE ADDRESS_NAME,
            'address_line_1'     VALUE ADDRESS_LINE1,
            'address_line_2'     VALUE ADDRESS_LINE2,
            'address_line_3'     VALUE ADDRESS_LINE3,
            'city'               VALUE CITY,
            'state'              VALUE STATE,
            'country'            VALUE COUNTRY,
            'postal_code'        VALUE POSTAL_CODE,
            'formatted_address'  VALUE FORMATTED_ADDRESS,
            'phone'              VALUE PHONE_NUMBER,
            'email'              VALUE EMAIL
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
            RETURN NULL;
        WHEN OTHERS THEN
            RETURN NULL;
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
                'supplier_id'              VALUE sm.SUPPLIER_ID,
                'supplier_party_id'        VALUE sm.SUPPLIER_PARTY_ID,
                'supplier_name'            VALUE sm.SUPPLIER,
                'supplier_number'          VALUE sm.SUPPLIER_NUMBER,
                'alternate_name'           VALUE sm.ALTERNATE_NAME,
                'supplier_type'            VALUE sm.SUPPLIER_TYPE,
                'status'                   VALUE sm.STATUS,
                'business_relationship'    VALUE sm.BUSINESS_RELATIONSHIP,
                'tax_registration_number'  VALUE sm.TAX_REGISTRATION_NUMBER,
                'taxpayer_id'              VALUE sm.TAXPAYER_ID,
                'customer_number'          VALUE sm.CUSTOMER_NUMBER,
                'corporate_website'        VALUE sm.CORPORATE_WEBSITE,
                'creation_date'            VALUE TO_CHAR(sm.CREATION_DATE, 'YYYY-MM-DD'),
                'address'                  VALUE TREAT(l_address AS JSON)
                ABSENT ON NULL
            )
        )
        INTO l_result
        FROM RR_SUPPLIER_MASTER sm
        WHERE sm.SUPPLIER_NUMBER = p_supplier_number;

        RETURN l_result;

    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RETURN '{"success": "false", "error": "Supplier not found", "supplier_number": "' || p_supplier_number || '"}';
        WHEN OTHERS THEN
            RETURN '{"success": "false", "error": "' || REPLACE(SQLERRM, '"', '\"') || '"}';
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
            'supplier_number'   VALUE p_supplier_number,
            'balance_summary'   VALUE JSON_OBJECT(
                'total_invoice_amount'    VALUE l_total_invoices,
                'total_payment_amount'    VALUE l_total_paid,
                'balance'                 VALUE l_balance,
                'total_invoices'          VALUE l_invoice_count,
                'total_payments'          VALUE l_payment_count,
                'unpaid_invoices'         VALUE l_unpaid_count,
                'currency'                VALUE 'AED'
            )
        );

        RETURN l_result;

    EXCEPTION
        WHEN OTHERS THEN
            RETURN '{"success": "false", "error": "' || REPLACE(SQLERRM, '"', '\"') || '"}';
    END get_balance_summary;

    -- ========================================================================
    -- FUNCTION: Get Aging Report
    -- ========================================================================
    FUNCTION get_aging_report(
        p_supplier_number IN VARCHAR2
    ) RETURN CLOB IS
        l_result            CLOB;
        l_current           NUMBER := 0;
        l_current_cnt       NUMBER := 0;
        l_days_1_30         NUMBER := 0;
        l_days_1_30_cnt     NUMBER := 0;
        l_days_31_60        NUMBER := 0;
        l_days_31_60_cnt    NUMBER := 0;
        l_days_61_90        NUMBER := 0;
        l_days_61_90_cnt    NUMBER := 0;
        l_days_91_120       NUMBER := 0;
        l_days_91_120_cnt   NUMBER := 0;
        l_days_over_120     NUMBER := 0;
        l_days_over_120_cnt NUMBER := 0;
        l_total_outstanding NUMBER := 0;
        l_pct_current       NUMBER := 0;
        l_pct_1_30          NUMBER := 0;
        l_pct_31_60         NUMBER := 0;
        l_pct_61_90         NUMBER := 0;
        l_pct_91_120        NUMBER := 0;
        l_pct_over_120      NUMBER := 0;
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
                        l_current_cnt := l_current_cnt + 1;
                    ELSIF l_days_old BETWEEN 1 AND 30 THEN
                        l_days_1_30 := l_days_1_30 + l_unpaid_amt;
                        l_days_1_30_cnt := l_days_1_30_cnt + 1;
                    ELSIF l_days_old BETWEEN 31 AND 60 THEN
                        l_days_31_60 := l_days_31_60 + l_unpaid_amt;
                        l_days_31_60_cnt := l_days_31_60_cnt + 1;
                    ELSIF l_days_old BETWEEN 61 AND 90 THEN
                        l_days_61_90 := l_days_61_90 + l_unpaid_amt;
                        l_days_61_90_cnt := l_days_61_90_cnt + 1;
                    ELSIF l_days_old BETWEEN 91 AND 120 THEN
                        l_days_91_120 := l_days_91_120 + l_unpaid_amt;
                        l_days_91_120_cnt := l_days_91_120_cnt + 1;
                    ELSE
                        l_days_over_120 := l_days_over_120 + l_unpaid_amt;
                        l_days_over_120_cnt := l_days_over_120_cnt + 1;
                    END IF;
                END IF;
            END;
        END LOOP;

        l_total_outstanding := l_current + l_days_1_30 + l_days_31_60 +
                               l_days_61_90 + l_days_91_120 + l_days_over_120;

        -- Calculate percentages
        IF l_total_outstanding > 0 THEN
            l_pct_current := ROUND(l_current / l_total_outstanding * 100, 2);
            l_pct_1_30 := ROUND(l_days_1_30 / l_total_outstanding * 100, 2);
            l_pct_31_60 := ROUND(l_days_31_60 / l_total_outstanding * 100, 2);
            l_pct_61_90 := ROUND(l_days_61_90 / l_total_outstanding * 100, 2);
            l_pct_91_120 := ROUND(l_days_91_120 / l_total_outstanding * 100, 2);
            l_pct_over_120 := ROUND(l_days_over_120 / l_total_outstanding * 100, 2);
        END IF;

        -- Build JSON response using string concatenation for aging_report array
        l_result := '{"success": "true", "supplier_number": "' || p_supplier_number || '", "aging_report": [' ||
            '{"bucket": "Current", "amount": ' || l_current || ', "invoice_count": ' || l_current_cnt || ', "percentage": ' || l_pct_current || '},' ||
            '{"bucket": "1-30 Days", "amount": ' || l_days_1_30 || ', "invoice_count": ' || l_days_1_30_cnt || ', "percentage": ' || l_pct_1_30 || '},' ||
            '{"bucket": "31-60 Days", "amount": ' || l_days_31_60 || ', "invoice_count": ' || l_days_31_60_cnt || ', "percentage": ' || l_pct_31_60 || '},' ||
            '{"bucket": "61-90 Days", "amount": ' || l_days_61_90 || ', "invoice_count": ' || l_days_61_90_cnt || ', "percentage": ' || l_pct_61_90 || '},' ||
            '{"bucket": "91-120 Days", "amount": ' || l_days_91_120 || ', "invoice_count": ' || l_days_91_120_cnt || ', "percentage": ' || l_pct_91_120 || '},' ||
            '{"bucket": "120+ Days", "amount": ' || l_days_over_120 || ', "invoice_count": ' || l_days_over_120_cnt || ', "percentage": ' || l_pct_over_120 || '}' ||
            '], "total_outstanding": ' || l_total_outstanding || ', "currency": "AED"}';

        RETURN l_result;

    EXCEPTION
        WHEN OTHERS THEN
            RETURN '{"success": "false", "error": "' || REPLACE(SQLERRM, '"', '\"') || '"}';
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
        l_invoices      CLOB := '[';
        l_total_count   NUMBER;
        l_row_count     NUMBER := 0;
        l_first         BOOLEAN := TRUE;
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

        -- Build invoices array using cursor and string concatenation
        FOR rec IN (
            SELECT * FROM (
                SELECT
                    INVOICE_ID,
                    INVOICE_NUMBER,
                    INVOICE_DATE,
                    INVOICE_AMOUNT,
                    NVL(AMOUNT_PAID, 0) AS AMOUNT_PAID,
                    (INVOICE_AMOUNT - NVL(AMOUNT_PAID, 0)) AS BALANCE_DUE,
                    INVOICE_CURRENCY,
                    INVOICE_TYPE,
                    DESCRIPTION,
                    VALIDATION_STATUS,
                    APPROVAL_STATUS,
                    PAID_STATUS,
                    ACCOUNTING_STATUS,
                    PAYMENT_TERMS,
                    ACCOUNTING_DATE,
                    BUSINESS_UNIT,
                    ROWNUM AS RN
                FROM RR_AP_INVOICES_ALL
                WHERE SUPPLIER_NUMBER = p_supplier_number
                AND NVL(CANCELED_FLAG, 'N') != 'Y'
                AND (p_status = 'All'
                     OR (p_status = 'Paid' AND PAID_STATUS = 'Paid')
                     OR (p_status = 'Unpaid' AND NVL(PAID_STATUS, 'Unpaid') != 'Paid'))
                ORDER BY INVOICE_ID DESC
            )
            WHERE RN > p_offset AND RN <= (p_offset + p_limit)
        ) LOOP
            IF NOT l_first THEN
                l_invoices := l_invoices || ',';
            END IF;
            l_first := FALSE;

            l_invoices := l_invoices || JSON_OBJECT(
                'invoice_id'         VALUE rec.INVOICE_ID,
                'invoice_number'     VALUE rec.INVOICE_NUMBER,
                'invoice_date'       VALUE rec.INVOICE_DATE,
                'invoice_amount'     VALUE rec.INVOICE_AMOUNT,
                'amount_paid'        VALUE rec.AMOUNT_PAID,
                'amount_remaining'   VALUE rec.BALANCE_DUE,
                'currency'           VALUE rec.INVOICE_CURRENCY,
                'invoice_type'       VALUE rec.INVOICE_TYPE,
                'description'        VALUE rec.DESCRIPTION,
                'validation_status'  VALUE rec.VALIDATION_STATUS,
                'approval_status'    VALUE rec.APPROVAL_STATUS,
                'invoice_status'     VALUE rec.PAID_STATUS,
                'accounting_status'  VALUE rec.ACCOUNTING_STATUS,
                'payment_terms'      VALUE rec.PAYMENT_TERMS,
                'accounting_date'    VALUE rec.ACCOUNTING_DATE,
                'business_unit'      VALUE rec.BUSINESS_UNIT
                ABSENT ON NULL
            );

            l_row_count := l_row_count + 1;
        END LOOP;

        l_invoices := l_invoices || ']';

        -- Build response
        l_result := '{"success": "true", "supplier_number": "' || p_supplier_number ||
                    '", "total_count": ' || l_total_count ||
                    ', "limit": ' || p_limit ||
                    ', "offset": ' || p_offset ||
                    ', "has_more": ' || CASE WHEN (p_offset + p_limit) < l_total_count THEN 'true' ELSE 'false' END ||
                    ', "invoices": ' || l_invoices || '}';

        RETURN l_result;

    EXCEPTION
        WHEN OTHERS THEN
            RETURN '{"success": "false", "error": "' || REPLACE(SQLERRM, '"', '\"') || '"}';
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
        l_payments      CLOB := '[';
        l_total_count   NUMBER;
        l_first         BOOLEAN := TRUE;
    BEGIN
        -- Get total count
        SELECT COUNT(*)
        INTO l_total_count
        FROM RR_AP_PAYMENTS_ALL
        WHERE SUPPLIER_NUMBER = p_supplier_number
        AND (p_status = 'All' OR PAYMENT_STATUS = p_status);

        -- Build payments array
        FOR rec IN (
            SELECT * FROM (
                SELECT
                    CHECK_ID,
                    PAYMENT_ID,
                    PAYMENT_NUMBER,
                    PAYMENT_DATE,
                    PAYMENT_AMOUNT,
                    PAYMENT_CURRENCY,
                    PAYMENT_STATUS,
                    PAYMENT_TYPE,
                    PAYMENT_METHOD,
                    PAYMENT_DESCRIPTION,
                    CLEARING_DATE,
                    CLEARING_AMOUNT,
                    VOID_DATE,
                    BUSINESS_UNIT,
                    DISBURSEMENT_BANK_ACCOUNT_NAME,
                    ACCOUNTING_STATUS,
                    RECONCILED_FLAG,
                    ROWNUM AS RN
                FROM RR_AP_PAYMENTS_ALL
                WHERE SUPPLIER_NUMBER = p_supplier_number
                AND (p_status = 'All' OR PAYMENT_STATUS = p_status)
                ORDER BY CHECK_ID DESC
            )
            WHERE RN > p_offset AND RN <= (p_offset + p_limit)
        ) LOOP
            IF NOT l_first THEN
                l_payments := l_payments || ',';
            END IF;
            l_first := FALSE;

            l_payments := l_payments || JSON_OBJECT(
                'payment_id'         VALUE rec.PAYMENT_ID,
                'check_id'           VALUE rec.CHECK_ID,
                'payment_number'     VALUE rec.PAYMENT_NUMBER,
                'payment_date'       VALUE rec.PAYMENT_DATE,
                'payment_amount'     VALUE rec.PAYMENT_AMOUNT,
                'currency'           VALUE rec.PAYMENT_CURRENCY,
                'payment_status'     VALUE rec.PAYMENT_STATUS,
                'payment_type'       VALUE rec.PAYMENT_TYPE,
                'payment_method'     VALUE rec.PAYMENT_METHOD,
                'description'        VALUE rec.PAYMENT_DESCRIPTION,
                'clearing_date'      VALUE rec.CLEARING_DATE,
                'clearing_amount'    VALUE rec.CLEARING_AMOUNT,
                'void_date'          VALUE rec.VOID_DATE,
                'business_unit'      VALUE rec.BUSINESS_UNIT,
                'bank_account_name'  VALUE rec.DISBURSEMENT_BANK_ACCOUNT_NAME,
                'accounting_status'  VALUE rec.ACCOUNTING_STATUS,
                'reconciled_flag'    VALUE rec.RECONCILED_FLAG
                ABSENT ON NULL
            );
        END LOOP;

        l_payments := l_payments || ']';

        -- Build response
        l_result := '{"success": "true", "supplier_number": "' || p_supplier_number ||
                    '", "total_count": ' || l_total_count ||
                    ', "limit": ' || p_limit ||
                    ', "offset": ' || p_offset ||
                    ', "has_more": ' || CASE WHEN (p_offset + p_limit) < l_total_count THEN 'true' ELSE 'false' END ||
                    ', "payments": ' || l_payments || '}';

        RETURN l_result;

    EXCEPTION
        WHEN OTHERS THEN
            RETURN '{"success": "false", "error": "' || REPLACE(SQLERRM, '"', '\"') || '"}';
    END get_supplier_payments;

    -- ========================================================================
    -- FUNCTION: Get Payment Related Invoices (Drilldown)
    -- ========================================================================
    FUNCTION get_payment_invoices(
        p_check_id IN NUMBER
    ) RETURN CLOB IS
        l_result    CLOB;
        l_invoices  CLOB := '[';
        l_payment   CLOB;
        l_count     NUMBER := 0;
        l_first     BOOLEAN := TRUE;
    BEGIN
        -- Get payment header
        SELECT JSON_OBJECT(
            'check_id'           VALUE CHECK_ID,
            'payment_number'     VALUE PAYMENT_NUMBER,
            'payment_amount'     VALUE PAYMENT_AMOUNT,
            'payment_date'       VALUE PAYMENT_DATE,
            'payee'              VALUE PAYEE,
            'supplier_number'    VALUE SUPPLIER_NUMBER,
            'payment_status'     VALUE PAYMENT_STATUS
        )
        INTO l_payment
        FROM RR_AP_PAYMENTS_ALL
        WHERE CHECK_ID = p_check_id;

        -- Get related invoices
        FOR rec IN (
            SELECT
                INVOICE_PAYMENT_ID,
                CHECK_ID,
                INVOICE_ID,
                INVOICE_NUMBER,
                INVOICE_BUSINESS_UNIT,
                INSTALLMENT_NUMBER,
                AMOUNT_PAID_PAYMENT_CURRENCY,
                AMOUNT_PAID_INVOICE_CURRENCY,
                INVOICE_AMOUNT,
                INVOICE_CURRENCY,
                DISCOUNT_TAKEN,
                DISCOUNT_LOST,
                INVOICE_PAYMENT_STATUS
            FROM RR_AP_PAYMENTS_RELATED_INVOICES
            WHERE CHECK_ID = p_check_id
        ) LOOP
            IF NOT l_first THEN
                l_invoices := l_invoices || ',';
            END IF;
            l_first := FALSE;

            l_invoices := l_invoices || JSON_OBJECT(
                'invoice_payment_id'          VALUE rec.INVOICE_PAYMENT_ID,
                'check_id'                    VALUE rec.CHECK_ID,
                'invoice_id'                  VALUE rec.INVOICE_ID,
                'invoice_number'              VALUE rec.INVOICE_NUMBER,
                'invoice_business_unit'       VALUE rec.INVOICE_BUSINESS_UNIT,
                'installment_number'          VALUE rec.INSTALLMENT_NUMBER,
                'amount_applied'              VALUE rec.AMOUNT_PAID_PAYMENT_CURRENCY,
                'amount_paid_invoice_currency' VALUE rec.AMOUNT_PAID_INVOICE_CURRENCY,
                'invoice_amount'              VALUE rec.INVOICE_AMOUNT,
                'invoice_currency'            VALUE rec.INVOICE_CURRENCY,
                'discount_taken'              VALUE rec.DISCOUNT_TAKEN,
                'discount_lost'               VALUE rec.DISCOUNT_LOST,
                'invoice_payment_status'      VALUE rec.INVOICE_PAYMENT_STATUS
                ABSENT ON NULL
            );

            l_count := l_count + 1;
        END LOOP;

        l_invoices := l_invoices || ']';

        -- Build response
        l_result := '{"success": "true", "payment": ' || l_payment ||
                    ', "invoices": ' || l_invoices ||
                    ', "invoice_count": ' || l_count || '}';

        RETURN l_result;

    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RETURN '{"success": "false", "error": "Payment not found", "check_id": ' || p_check_id || '}';
        WHEN OTHERS THEN
            RETURN '{"success": "false", "error": "' || REPLACE(SQLERRM, '"', '\"') || '"}';
    END get_payment_invoices;

    -- ========================================================================
    -- FUNCTION: Get Complete Dashboard
    -- ========================================================================
    FUNCTION get_dashboard(
        p_supplier_number IN VARCHAR2
    ) RETURN CLOB IS
        l_result            CLOB;
        l_address           CLOB;

        -- Supplier info
        l_supplier_id       NUMBER;
        l_supplier_name     VARCHAR2(500);
        l_supplier_type     VARCHAR2(100);
        l_supplier_status   VARCHAR2(50);
        l_tax_reg_number    VARCHAR2(100);
        l_creation_date     VARCHAR2(20);

        -- Summary
        l_total_invoices    NUMBER := 0;
        l_total_paid        NUMBER := 0;
        l_invoice_count     NUMBER := 0;
        l_payment_count     NUMBER := 0;
        l_unpaid_count      NUMBER := 0;
        l_balance           NUMBER := 0;

        -- Aging
        l_current           NUMBER := 0;
        l_current_cnt       NUMBER := 0;
        l_days_1_30         NUMBER := 0;
        l_days_1_30_cnt     NUMBER := 0;
        l_days_31_60        NUMBER := 0;
        l_days_31_60_cnt    NUMBER := 0;
        l_days_61_90        NUMBER := 0;
        l_days_61_90_cnt    NUMBER := 0;
        l_days_91_120       NUMBER := 0;
        l_days_91_120_cnt   NUMBER := 0;
        l_days_over_120     NUMBER := 0;
        l_days_over_120_cnt NUMBER := 0;
        l_total_outstanding NUMBER := 0;

        l_pct_current       NUMBER := 0;
        l_pct_1_30          NUMBER := 0;
        l_pct_31_60         NUMBER := 0;
        l_pct_61_90         NUMBER := 0;
        l_pct_91_120        NUMBER := 0;
        l_pct_over_120      NUMBER := 0;
    BEGIN
        -- Get supplier info
        SELECT
            SUPPLIER_ID,
            SUPPLIER,
            SUPPLIER_TYPE,
            STATUS,
            TAX_REGISTRATION_NUMBER,
            TO_CHAR(CREATION_DATE, 'YYYY-MM-DD')
        INTO
            l_supplier_id,
            l_supplier_name,
            l_supplier_type,
            l_supplier_status,
            l_tax_reg_number,
            l_creation_date
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
                        l_current_cnt := l_current_cnt + 1;
                    ELSIF l_days_old BETWEEN 1 AND 30 THEN
                        l_days_1_30 := l_days_1_30 + l_unpaid_amt;
                        l_days_1_30_cnt := l_days_1_30_cnt + 1;
                    ELSIF l_days_old BETWEEN 31 AND 60 THEN
                        l_days_31_60 := l_days_31_60 + l_unpaid_amt;
                        l_days_31_60_cnt := l_days_31_60_cnt + 1;
                    ELSIF l_days_old BETWEEN 61 AND 90 THEN
                        l_days_61_90 := l_days_61_90 + l_unpaid_amt;
                        l_days_61_90_cnt := l_days_61_90_cnt + 1;
                    ELSIF l_days_old BETWEEN 91 AND 120 THEN
                        l_days_91_120 := l_days_91_120 + l_unpaid_amt;
                        l_days_91_120_cnt := l_days_91_120_cnt + 1;
                    ELSE
                        l_days_over_120 := l_days_over_120 + l_unpaid_amt;
                        l_days_over_120_cnt := l_days_over_120_cnt + 1;
                    END IF;
                END IF;
            END;
        END LOOP;

        l_total_outstanding := l_current + l_days_1_30 + l_days_31_60 +
                               l_days_61_90 + l_days_91_120 + l_days_over_120;

        -- Calculate percentages
        IF l_total_outstanding > 0 THEN
            l_pct_current := ROUND(l_current / l_total_outstanding * 100, 2);
            l_pct_1_30 := ROUND(l_days_1_30 / l_total_outstanding * 100, 2);
            l_pct_31_60 := ROUND(l_days_31_60 / l_total_outstanding * 100, 2);
            l_pct_61_90 := ROUND(l_days_61_90 / l_total_outstanding * 100, 2);
            l_pct_91_120 := ROUND(l_days_91_120 / l_total_outstanding * 100, 2);
            l_pct_over_120 := ROUND(l_days_over_120 / l_total_outstanding * 100, 2);
        END IF;

        -- Build complete dashboard response using string concatenation
        l_result := '{' ||
            '"success": "true",' ||
            '"supplier": {' ||
                '"supplier_id": ' || l_supplier_id || ',' ||
                '"supplier_number": "' || p_supplier_number || '",' ||
                '"supplier_name": "' || REPLACE(l_supplier_name, '"', '\"') || '",' ||
                '"supplier_type": ' || CASE WHEN l_supplier_type IS NULL THEN 'null' ELSE '"' || l_supplier_type || '"' END || ',' ||
                '"status": "' || l_supplier_status || '",' ||
                '"tax_registration_number": ' || CASE WHEN l_tax_reg_number IS NULL THEN 'null' ELSE '"' || l_tax_reg_number || '"' END || ',' ||
                '"creation_date": ' || CASE WHEN l_creation_date IS NULL THEN 'null' ELSE '"' || l_creation_date || '"' END || ',' ||
                '"address": ' || NVL(l_address, 'null') ||
            '},' ||
            '"balance_summary": {' ||
                '"total_invoices": ' || l_invoice_count || ',' ||
                '"total_invoice_amount": ' || l_total_invoices || ',' ||
                '"total_payments": ' || l_payment_count || ',' ||
                '"total_payment_amount": ' || l_total_paid || ',' ||
                '"balance": ' || l_balance || ',' ||
                '"currency": "AED"' ||
            '},' ||
            '"aging_report": [' ||
                '{"bucket": "Current", "amount": ' || l_current || ', "invoice_count": ' || l_current_cnt || ', "percentage": ' || l_pct_current || '},' ||
                '{"bucket": "1-30 Days", "amount": ' || l_days_1_30 || ', "invoice_count": ' || l_days_1_30_cnt || ', "percentage": ' || l_pct_1_30 || '},' ||
                '{"bucket": "31-60 Days", "amount": ' || l_days_31_60 || ', "invoice_count": ' || l_days_31_60_cnt || ', "percentage": ' || l_pct_31_60 || '},' ||
                '{"bucket": "61-90 Days", "amount": ' || l_days_61_90 || ', "invoice_count": ' || l_days_61_90_cnt || ', "percentage": ' || l_pct_61_90 || '},' ||
                '{"bucket": "91-120 Days", "amount": ' || l_days_91_120 || ', "invoice_count": ' || l_days_91_120_cnt || ', "percentage": ' || l_pct_91_120 || '},' ||
                '{"bucket": "120+ Days", "amount": ' || l_days_over_120 || ', "invoice_count": ' || l_days_over_120_cnt || ', "percentage": ' || l_pct_over_120 || '}' ||
            ']' ||
        '}';

        RETURN l_result;

    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RETURN '{"success": "false", "error": "Supplier not found", "supplier_number": "' || p_supplier_number || '"}';
        WHEN OTHERS THEN
            RETURN '{"success": "false", "error": "' || REPLACE(SQLERRM, '"', '\"') || '"}';
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

DECLARE
    l_json CLOB;
BEGIN
    l_json := PKG_SUPPLIER_BALANCE.get_supplier_details(:supplier_number);
    PKG_SUPPLIER_BALANCE.output_response(l_json, :status_code);
END;


2. Balance Summary Handler
   Pattern: suppliers/balance/summary/:supplier_number
   Method: GET

DECLARE
    l_json CLOB;
BEGIN
    l_json := PKG_SUPPLIER_BALANCE.get_balance_summary(:supplier_number);
    PKG_SUPPLIER_BALANCE.output_response(l_json, :status_code);
END;


3. Aging Report Handler
   Pattern: suppliers/balance/aging/:supplier_number
   Method: GET

DECLARE
    l_json CLOB;
BEGIN
    l_json := PKG_SUPPLIER_BALANCE.get_aging_report(:supplier_number);
    PKG_SUPPLIER_BALANCE.output_response(l_json, :status_code);
END;


4. Invoices List Handler
   Pattern: suppliers/balance/invoices/:supplier_number
   Method: GET
   Query Params: status, limit, offset

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


5. Payments List Handler
   Pattern: suppliers/balance/payments/:supplier_number
   Method: GET
   Query Params: status, limit, offset

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


6. Payment Drilldown Handler
   Pattern: suppliers/balance/payment-invoices/:check_id
   Method: GET

DECLARE
    l_json CLOB;
BEGIN
    l_json := PKG_SUPPLIER_BALANCE.get_payment_invoices(:check_id);
    PKG_SUPPLIER_BALANCE.output_response(l_json, :status_code);
END;


7. Dashboard Handler (All-in-One)
   Pattern: suppliers/balance/dashboard/:supplier_number
   Method: GET

DECLARE
    l_json CLOB;
BEGIN
    l_json := PKG_SUPPLIER_BALANCE.get_dashboard(:supplier_number);
    PKG_SUPPLIER_BALANCE.output_response(l_json, :status_code);
END;

*/


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
