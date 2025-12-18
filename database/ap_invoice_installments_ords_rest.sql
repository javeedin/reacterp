-- =====================================================
-- ORDS REST API for AP Invoice Installments
-- =====================================================
-- Created: 2024
-- Description: REST endpoints for AP Invoice Installments
-- Endpoint: /ap/invoices/installments
-- =====================================================

-- Note: The 'ap' module should already be defined in ap_invoices_ords_rest.sql
-- If not, uncomment the following block:
/*
BEGIN
    ORDS.DEFINE_MODULE(
        p_module_name    => 'ap',
        p_base_path      => '/ap/',
        p_items_per_page => 25,
        p_status         => 'PUBLISHED',
        p_comments       => 'AP REST API'
    );
    COMMIT;
END;
/
*/

-- =====================================================
-- Template: /ap/invoices/installments
-- =====================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'ap',
        p_pattern        => 'invoices/installments',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_etag_query     => NULL,
        p_comments       => 'AP Invoice Installments endpoint'
    );
    COMMIT;
END;
/

-- =====================================================
-- POST /ap/invoices/installments - Create/Update Installments (Bulk)
-- =====================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ap',
        p_pattern        => 'invoices/installments',
        p_method         => 'POST',
        p_source_type    => 'plsql/block',
        p_mimes_allowed  => 'application/json',
        p_comments       => 'Create or update AP Invoice Installments in bulk',
        p_source         => q'[
DECLARE
    l_success_count NUMBER;
    l_error_count   NUMBER;
    l_status        VARCHAR2(20);
    l_message       VARCHAR2(4000);
BEGIN
    -- Call the package to save installments from items array
    XXAP_INVOICE_INSTALLMENTS_PKG.save_installments_from_items(
        p_json          => :body_text,
        p_success_count => l_success_count,
        p_error_count   => l_error_count,
        p_status        => l_status,
        p_message       => l_message
    );

    -- Set HTTP status code
    :status_code := CASE
        WHEN l_status = 'SUCCESS' THEN 201
        WHEN l_status = 'PARTIAL' THEN 207
        ELSE 400
    END;

    -- Return JSON response
    HTP.P('{');
    HTP.P('"success": ' || CASE WHEN l_status = 'SUCCESS' THEN 'true' ELSE 'false' END || ',');
    HTP.P('"status": "' || l_status || '",');
    HTP.P('"message": "' || l_message || '",');
    HTP.P('"successCount": ' || l_success_count || ',');
    HTP.P('"errorCount": ' || l_error_count);
    HTP.P('}');
END;
]'
    );
    COMMIT;
END;
/

-- =====================================================
-- GET /ap/invoices/installments - Get All Installments
-- =====================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ap',
        p_pattern        => 'invoices/installments',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_mimes_allowed  => NULL,
        p_comments       => 'Get all invoice installments with pagination',
        p_source         => q'[
SELECT
    INSTALLMENT_ID,
    INVOICE_ID,
    INSTALLMENT_NUMBER,
    TO_CHAR(DUE_DATE, 'YYYY-MM-DD') AS DUE_DATE,
    GROSS_AMOUNT,
    UNPAID_AMOUNT,
    FIRST_DISCOUNT_AMOUNT,
    TO_CHAR(FIRST_DISCOUNT_DATE, 'YYYY-MM-DD') AS FIRST_DISCOUNT_DATE,
    SECOND_DISCOUNT_AMOUNT,
    TO_CHAR(SECOND_DISCOUNT_DATE, 'YYYY-MM-DD') AS SECOND_DISCOUNT_DATE,
    THIRD_DISCOUNT_AMOUNT,
    TO_CHAR(THIRD_DISCOUNT_DATE, 'YYYY-MM-DD') AS THIRD_DISCOUNT_DATE,
    NET_AMOUNT_ONE,
    NET_AMOUNT_TWO,
    NET_AMOUNT_THREE,
    PAYMENT_PRIORITY,
    PAYMENT_METHOD,
    PAYMENT_METHOD_CODE,
    HOLD_FLAG,
    HOLD_REASON,
    HOLD_TYPE,
    TO_CHAR(HOLD_DATE, 'YYYY-MM-DD') AS HOLD_DATE,
    HELD_BY,
    BANK_ACCOUNT,
    EXTERNAL_BANK_ACCOUNT_ID,
    DIGITAL_PAYMENT_ACCOUNT,
    REMIT_TO_ADDRESS_NAME,
    REMIT_TO_SUPPLIER,
    REMITTANCE_MESSAGE_ONE,
    REMITTANCE_MESSAGE_TWO,
    REMITTANCE_MESSAGE_THREE,
    PROCESS_STATUS,
    TO_CHAR(CREATION_DATE, 'YYYY-MM-DD"T"HH24:MI:SS') AS CREATION_DATE,
    TO_CHAR(LAST_UPDATE_DATE, 'YYYY-MM-DD"T"HH24:MI:SS') AS LAST_UPDATE_DATE
FROM RR_AR_INVOICE_INSTALLMENTS
ORDER BY INVOICE_ID, INSTALLMENT_NUMBER
]'
    );
    COMMIT;
END;
/

-- =====================================================
-- Template: /ap/invoices/installments/:invoice_id
-- =====================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'ap',
        p_pattern        => 'invoices/installments/:invoice_id',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_etag_query     => NULL,
        p_comments       => 'AP Invoice Installments for specific invoice'
    );
    COMMIT;
END;
/

-- =====================================================
-- POST /ap/invoices/installments/:invoice_id - Create Installments for specific Invoice
-- =====================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ap',
        p_pattern        => 'invoices/installments/:invoice_id',
        p_method         => 'POST',
        p_source_type    => 'plsql/block',
        p_mimes_allowed  => 'application/json',
        p_comments       => 'Create or update AP Invoice Installments for a specific invoice',
        p_source         => q'[
DECLARE
    l_success_count NUMBER;
    l_error_count   NUMBER;
    l_status        VARCHAR2(20);
    l_message       VARCHAR2(4000);
    l_inst_json     CLOB;
BEGIN
    -- Extract installments array from items
    SELECT JSON_QUERY(:body_text, '$.items') INTO l_inst_json FROM DUAL;

    -- If no items array, try direct array
    IF l_inst_json IS NULL THEN
        l_inst_json := :body_text;
    END IF;

    -- Call the package to save installments
    XXAP_INVOICE_INSTALLMENTS_PKG.save_installments_bulk(
        p_invoice_id    => :invoice_id,
        p_inst_json     => l_inst_json,
        p_success_count => l_success_count,
        p_error_count   => l_error_count,
        p_status        => l_status,
        p_message       => l_message
    );

    -- Set HTTP status code
    :status_code := CASE
        WHEN l_status = 'SUCCESS' THEN 201
        WHEN l_status = 'PARTIAL' THEN 207
        ELSE 400
    END;

    -- Return JSON response
    HTP.P('{');
    HTP.P('"success": ' || CASE WHEN l_status = 'SUCCESS' THEN 'true' ELSE 'false' END || ',');
    HTP.P('"status": "' || l_status || '",');
    HTP.P('"message": "' || l_message || '",');
    HTP.P('"invoiceId": ' || :invoice_id || ',');
    HTP.P('"successCount": ' || l_success_count || ',');
    HTP.P('"errorCount": ' || l_error_count);
    HTP.P('}');
END;
]'
    );
    COMMIT;
END;
/

-- =====================================================
-- GET /ap/invoices/installments/:invoice_id - Get Installments for Invoice
-- =====================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ap',
        p_pattern        => 'invoices/installments/:invoice_id',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_mimes_allowed  => NULL,
        p_comments       => 'Get all installments for an invoice',
        p_source         => q'[
SELECT
    INSTALLMENT_ID,
    INVOICE_ID,
    INSTALLMENT_NUMBER AS "InstallmentNumber",
    TO_CHAR(DUE_DATE, 'YYYY-MM-DD') AS "DueDate",
    GROSS_AMOUNT AS "GrossAmount",
    UNPAID_AMOUNT AS "UnpaidAmount",
    FIRST_DISCOUNT_AMOUNT AS "FirstDiscountAmount",
    TO_CHAR(FIRST_DISCOUNT_DATE, 'YYYY-MM-DD') AS "FirstDiscountDate",
    SECOND_DISCOUNT_AMOUNT AS "SecondDiscountAmount",
    TO_CHAR(SECOND_DISCOUNT_DATE, 'YYYY-MM-DD') AS "SecondDiscountDate",
    THIRD_DISCOUNT_AMOUNT AS "ThirdDiscountAmount",
    TO_CHAR(THIRD_DISCOUNT_DATE, 'YYYY-MM-DD') AS "ThirdDiscountDate",
    NET_AMOUNT_ONE AS "NetAmountOne",
    NET_AMOUNT_TWO AS "NetAmountTwo",
    NET_AMOUNT_THREE AS "NetAmountThree",
    PAYMENT_PRIORITY AS "PaymentPriority",
    PAYMENT_METHOD AS "PaymentMethod",
    PAYMENT_METHOD_CODE AS "PaymentMethodCode",
    CASE WHEN HOLD_FLAG = 'Y' THEN 'true' ELSE 'false' END AS "HoldFlag",
    HOLD_REASON AS "HoldReason",
    HOLD_TYPE AS "HoldType",
    TO_CHAR(HOLD_DATE, 'YYYY-MM-DD') AS "HoldDate",
    HELD_BY AS "HeldBy",
    BANK_ACCOUNT AS "BankAccount",
    EXTERNAL_BANK_ACCOUNT_ID AS "ExternalBankAccountId",
    DIGITAL_PAYMENT_ACCOUNT AS "DigitalPaymentAccount",
    REMIT_TO_ADDRESS_NAME AS "RemitToAddressName",
    REMIT_TO_SUPPLIER AS "RemitToSupplier",
    REMITTANCE_MESSAGE_ONE AS "RemittanceMessageOne",
    REMITTANCE_MESSAGE_TWO AS "RemittanceMessageTwo",
    REMITTANCE_MESSAGE_THREE AS "RemittanceMessageThree",
    FUSION_CREATED_BY AS "CreatedBy",
    TO_CHAR(FUSION_CREATION_DATE, 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"') AS "CreationDate",
    TO_CHAR(FUSION_LAST_UPDATE_DATE, 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"') AS "LastUpdateDate",
    FUSION_LAST_UPDATED_BY AS "LastUpdatedBy",
    FUSION_LAST_UPDATE_LOGIN AS "LastUpdateLogin"
FROM RR_AR_INVOICE_INSTALLMENTS
WHERE INVOICE_ID = :invoice_id
ORDER BY INSTALLMENT_NUMBER
]'
    );
    COMMIT;
END;
/

-- =====================================================
-- DELETE /ap/invoices/installments/:invoice_id - Delete Installments for Invoice
-- =====================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ap',
        p_pattern        => 'invoices/installments/:invoice_id',
        p_method         => 'DELETE',
        p_source_type    => 'plsql/block',
        p_mimes_allowed  => NULL,
        p_comments       => 'Delete all installments for an invoice',
        p_source         => q'[
DECLARE
    l_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO l_count
    FROM RR_AR_INVOICE_INSTALLMENTS
    WHERE INVOICE_ID = :invoice_id;

    DELETE FROM RR_AR_INVOICE_INSTALLMENTS
    WHERE INVOICE_ID = :invoice_id;

    COMMIT;

    :status_code := 200;

    HTP.P('{');
    HTP.P('"success": true,');
    HTP.P('"message": "Deleted ' || l_count || ' installments for invoice ' || :invoice_id || '",');
    HTP.P('"deletedCount": ' || l_count);
    HTP.P('}');
END;
]'
    );
    COMMIT;
END;
/

-- =====================================================
-- Template: /ap/invoices/installments/:invoice_id/:installment_number
-- =====================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'ap',
        p_pattern        => 'invoices/installments/:invoice_id/:installment_number',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_etag_query     => NULL,
        p_comments       => 'Single AP Invoice Installment'
    );
    COMMIT;
END;
/

-- =====================================================
-- GET /ap/invoices/installments/:invoice_id/:installment_number - Get Single Installment
-- =====================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ap',
        p_pattern        => 'invoices/installments/:invoice_id/:installment_number',
        p_method         => 'GET',
        p_source_type    => 'json/item',
        p_mimes_allowed  => NULL,
        p_comments       => 'Get a single installment',
        p_source         => q'[
SELECT
    INSTALLMENT_ID,
    INVOICE_ID,
    INSTALLMENT_NUMBER AS "InstallmentNumber",
    TO_CHAR(DUE_DATE, 'YYYY-MM-DD') AS "DueDate",
    GROSS_AMOUNT AS "GrossAmount",
    UNPAID_AMOUNT AS "UnpaidAmount",
    FIRST_DISCOUNT_AMOUNT AS "FirstDiscountAmount",
    TO_CHAR(FIRST_DISCOUNT_DATE, 'YYYY-MM-DD') AS "FirstDiscountDate",
    SECOND_DISCOUNT_AMOUNT AS "SecondDiscountAmount",
    TO_CHAR(SECOND_DISCOUNT_DATE, 'YYYY-MM-DD') AS "SecondDiscountDate",
    THIRD_DISCOUNT_AMOUNT AS "ThirdDiscountAmount",
    TO_CHAR(THIRD_DISCOUNT_DATE, 'YYYY-MM-DD') AS "ThirdDiscountDate",
    NET_AMOUNT_ONE AS "NetAmountOne",
    NET_AMOUNT_TWO AS "NetAmountTwo",
    NET_AMOUNT_THREE AS "NetAmountThree",
    PAYMENT_PRIORITY AS "PaymentPriority",
    PAYMENT_METHOD AS "PaymentMethod",
    PAYMENT_METHOD_CODE AS "PaymentMethodCode",
    CASE WHEN HOLD_FLAG = 'Y' THEN 'true' ELSE 'false' END AS "HoldFlag",
    HOLD_REASON AS "HoldReason",
    HOLD_TYPE AS "HoldType",
    TO_CHAR(HOLD_DATE, 'YYYY-MM-DD') AS "HoldDate",
    HELD_BY AS "HeldBy",
    BANK_ACCOUNT AS "BankAccount",
    EXTERNAL_BANK_ACCOUNT_ID AS "ExternalBankAccountId",
    DIGITAL_PAYMENT_ACCOUNT AS "DigitalPaymentAccount",
    REMIT_TO_ADDRESS_NAME AS "RemitToAddressName",
    REMIT_TO_SUPPLIER AS "RemitToSupplier",
    REMITTANCE_MESSAGE_ONE AS "RemittanceMessageOne",
    REMITTANCE_MESSAGE_TWO AS "RemittanceMessageTwo",
    REMITTANCE_MESSAGE_THREE AS "RemittanceMessageThree",
    FUSION_CREATED_BY AS "CreatedBy",
    TO_CHAR(FUSION_CREATION_DATE, 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"') AS "CreationDate",
    TO_CHAR(FUSION_LAST_UPDATE_DATE, 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"') AS "LastUpdateDate",
    FUSION_LAST_UPDATED_BY AS "LastUpdatedBy",
    FUSION_LAST_UPDATE_LOGIN AS "LastUpdateLogin"
FROM RR_AR_INVOICE_INSTALLMENTS
WHERE INVOICE_ID = :invoice_id
  AND INSTALLMENT_NUMBER = :installment_number
]'
    );
    COMMIT;
END;
/

-- =====================================================
-- DELETE /ap/invoices/installments/:invoice_id/:installment_number - Delete Single Installment
-- =====================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ap',
        p_pattern        => 'invoices/installments/:invoice_id/:installment_number',
        p_method         => 'DELETE',
        p_source_type    => 'plsql/block',
        p_mimes_allowed  => NULL,
        p_comments       => 'Delete a single installment',
        p_source         => q'[
DECLARE
    l_count NUMBER;
BEGIN
    DELETE FROM RR_AR_INVOICE_INSTALLMENTS
    WHERE INVOICE_ID = :invoice_id
      AND INSTALLMENT_NUMBER = :installment_number;

    l_count := SQL%ROWCOUNT;
    COMMIT;

    IF l_count > 0 THEN
        :status_code := 200;
        HTP.P('{');
        HTP.P('"success": true,');
        HTP.P('"message": "Installment ' || :installment_number || ' deleted successfully"');
        HTP.P('}');
    ELSE
        :status_code := 404;
        HTP.P('{');
        HTP.P('"success": false,');
        HTP.P('"message": "Installment not found"');
        HTP.P('}');
    END IF;
END;
]'
    );
    COMMIT;
END;
/

-- =====================================================
-- Verify the endpoints
-- =====================================================
SELECT
    module_name,
    uri_template,
    method,
    source_type
FROM user_ords_handlers
WHERE module_name = 'ap'
  AND uri_template LIKE '%installments%'
ORDER BY uri_template, method;

-- =====================================================
-- REST API Endpoints Summary:
-- =====================================================
/*
Base URL: https://your-server/ords/schema/ap/

ENDPOINTS:

1. POST /invoices/installments
   - Save multiple installments (bulk)
   - Body: { "items": [ { "InvoiceId": 1021, "InstallmentNumber": 1, ... } ] }

2. GET /invoices/installments
   - Get all installments (paginated)

3. POST /invoices/installments/:invoice_id
   - Save installments for a specific invoice
   - Body: { "items": [ { "InstallmentNumber": 1, ... } ] } or [ { "InstallmentNumber": 1, ... } ]

4. GET /invoices/installments/:invoice_id
   - Get all installments for a specific invoice

5. DELETE /invoices/installments/:invoice_id
   - Delete all installments for a specific invoice

6. GET /invoices/installments/:invoice_id/:installment_number
   - Get a single installment

7. DELETE /invoices/installments/:invoice_id/:installment_number
   - Delete a single installment

*/

-- =====================================================
-- Sample curl commands for testing:
-- =====================================================
/*

-- POST Installments (bulk with invoice_id in each item)
curl -X POST "https://your-server/ords/schema/ap/invoices/installments" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "InvoiceId": 1021,
        "InstallmentNumber": 1,
        "UnpaidAmount": 0,
        "DueDate": "2023-08-12",
        "GrossAmount": 3590,
        "PaymentPriority": 99,
        "HoldFlag": false,
        "PaymentMethod": "Check",
        "PaymentMethodCode": "CHECK",
        "CreatedBy": "user@example.com",
        "CreationDate": "2023-09-10T08:52:08+00:00"
      }
    ]
  }'

-- POST Installments for specific invoice
curl -X POST "https://your-server/ords/schema/ap/invoices/installments/1021" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "InstallmentNumber": 1,
        "UnpaidAmount": 0,
        "DueDate": "2023-08-12",
        "GrossAmount": 3590,
        "PaymentPriority": 99,
        "HoldFlag": false,
        "PaymentMethod": "Check",
        "PaymentMethodCode": "CHECK"
      }
    ]
  }'

-- GET All Installments
curl "https://your-server/ords/schema/ap/invoices/installments"

-- GET Installments for Invoice
curl "https://your-server/ords/schema/ap/invoices/installments/1021"

-- GET Single Installment
curl "https://your-server/ords/schema/ap/invoices/installments/1021/1"

-- DELETE Installments for Invoice
curl -X DELETE "https://your-server/ords/schema/ap/invoices/installments/1021"

-- DELETE Single Installment
curl -X DELETE "https://your-server/ords/schema/ap/invoices/installments/1021/1"

*/
