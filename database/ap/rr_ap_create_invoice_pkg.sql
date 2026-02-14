-- =====================================================
-- RR_AP_CREATE_INVOICE_PKG
-- =====================================================
-- Purpose: Create new AP Invoice (Header + Lines) from UI
-- Target Tables: RR_AP_INVOICES_ALL (header), invoice lines table (lines)
-- Single JSON POST with header + lines array
-- InvoiceId generated from sequence
-- =====================================================

-- =====================================================
-- 1. Create Sequence (if not exists)
-- =====================================================
DECLARE
    l_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO l_count
    FROM user_sequences
    WHERE sequence_name = 'RR_AP_INVOICES_ALL_SEQ';

    IF l_count = 0 THEN
        EXECUTE IMMEDIATE '
            CREATE SEQUENCE RR_AP_INVOICES_ALL_SEQ
                START WITH 900001
                INCREMENT BY 1
                NOCACHE
                NOCYCLE
        ';
    END IF;
END;
/

-- =====================================================
-- 2. Package Specification
-- =====================================================
CREATE OR REPLACE PACKAGE RR_AP_CREATE_INVOICE_PKG AS

    -- Create invoice with header + lines in one transaction
    -- JSON format:
    -- {
    --   "InvoiceNumber": "INV-001",
    --   "InvoiceCurrency": "AED",
    --   "InvoiceAmount": 1050,
    --   "InvoiceDate": "2026-02-14",
    --   "BusinessUnit": "BU_NAME",
    --   "Supplier": "Supplier Name",
    --   "SupplierNumber": "S0001",
    --   "SupplierSite": "DUBAI",
    --   "InvoiceType": "Standard",
    --   "Description": "Test invoice",
    --   ...
    --   "lines": [
    --     {
    --       "LineNumber": 1,
    --       "LineType": "Item",
    --       "LineAmount": 1000,
    --       "Description": "Line 1",
    --       "DistributionCombination": "01-000-1234-0000-000",
    --       ...
    --     }
    --   ]
    -- }
    PROCEDURE create_invoice(
        p_json          IN  CLOB,
        p_invoice_id    OUT NUMBER,
        p_status        OUT VARCHAR2,
        p_message       OUT VARCHAR2
    );

END RR_AP_CREATE_INVOICE_PKG;
/

-- =====================================================
-- 3. Package Body
-- =====================================================
CREATE OR REPLACE PACKAGE BODY RR_AP_CREATE_INVOICE_PKG AS

    PROCEDURE create_invoice(
        p_json          IN  CLOB,
        p_invoice_id    OUT NUMBER,
        p_status        OUT VARCHAR2,
        p_message       OUT VARCHAR2
    ) AS
        -- Header fields
        l_invoice_id                NUMBER;
        l_invoice_number            VARCHAR2(50);
        l_invoice_currency          VARCHAR2(15);
        l_payment_currency          VARCHAR2(15);
        l_invoice_amount            NUMBER;
        l_invoice_date              DATE;
        l_business_unit             VARCHAR2(240);
        l_legal_entity              VARCHAR2(240);
        l_supplier                  VARCHAR2(360);
        l_supplier_number           VARCHAR2(30);
        l_supplier_site             VARCHAR2(240);
        l_invoice_type              VARCHAR2(30);
        l_description               VARCHAR2(4000);
        l_invoice_group             VARCHAR2(80);
        l_invoice_source            VARCHAR2(80);
        l_accounting_date           DATE;
        l_terms_date                DATE;
        l_goods_received_date       DATE;
        l_pay_group                 VARCHAR2(80);
        l_payment_terms             VARCHAR2(50);
        l_payment_method            VARCHAR2(80);
        l_pay_alone_flag            VARCHAR2(1);
        -- Lines
        l_line_count                NUMBER := 0;
        l_line_success              NUMBER := 0;
        l_line_error                NUMBER := 0;
    BEGIN
        -- Generate InvoiceId from sequence
        SELECT RR_AP_INVOICES_ALL_SEQ.NEXTVAL INTO l_invoice_id FROM DUAL;

        -- Parse header fields from JSON
        l_invoice_number    := JSON_VALUE(p_json, '$.InvoiceNumber');
        l_invoice_currency  := NVL(JSON_VALUE(p_json, '$.InvoiceCurrency'), 'AED');
        l_payment_currency  := NVL(JSON_VALUE(p_json, '$.PaymentCurrency'), l_invoice_currency);
        l_invoice_amount    := JSON_VALUE(p_json, '$.InvoiceAmount' RETURNING NUMBER);
        l_business_unit     := JSON_VALUE(p_json, '$.BusinessUnit');
        l_legal_entity      := JSON_VALUE(p_json, '$.LegalEntity');
        l_supplier          := JSON_VALUE(p_json, '$.Supplier');
        l_supplier_number   := JSON_VALUE(p_json, '$.SupplierNumber');
        l_supplier_site     := JSON_VALUE(p_json, '$.SupplierSite');
        l_invoice_type      := NVL(JSON_VALUE(p_json, '$.InvoiceType'), 'Standard');
        l_description       := JSON_VALUE(p_json, '$.Description' RETURNING VARCHAR2(4000));
        l_invoice_group     := JSON_VALUE(p_json, '$.InvoiceGroup');
        l_invoice_source    := NVL(JSON_VALUE(p_json, '$.InvoiceSource'), 'MANUAL');
        l_pay_group         := JSON_VALUE(p_json, '$.PayGroup');
        l_payment_terms     := JSON_VALUE(p_json, '$.PaymentTerms');
        l_payment_method    := JSON_VALUE(p_json, '$.PaymentMethod');
        l_pay_alone_flag    := NVL(JSON_VALUE(p_json, '$.PayAlone'), 'N');

        -- Parse dates
        BEGIN
            l_invoice_date := TO_DATE(JSON_VALUE(p_json, '$.InvoiceDate'), 'YYYY-MM-DD');
        EXCEPTION WHEN OTHERS THEN l_invoice_date := SYSDATE;
        END;

        BEGIN
            l_accounting_date := TO_DATE(JSON_VALUE(p_json, '$.AccountingDate'), 'YYYY-MM-DD');
        EXCEPTION WHEN OTHERS THEN l_accounting_date := l_invoice_date;
        END;

        BEGIN
            l_terms_date := TO_DATE(JSON_VALUE(p_json, '$.TermsDate'), 'YYYY-MM-DD');
        EXCEPTION WHEN OTHERS THEN l_terms_date := NULL;
        END;

        BEGIN
            l_goods_received_date := TO_DATE(JSON_VALUE(p_json, '$.GoodsReceivedDate'), 'YYYY-MM-DD');
        EXCEPTION WHEN OTHERS THEN l_goods_received_date := NULL;
        END;

        -- ========== INSERT HEADER ==========
        INSERT INTO RR_AP_INVOICES_ALL (
            INVOICE_ID,
            INVOICE_NUMBER,
            INVOICE_CURRENCY,
            PAYMENT_CURRENCY,
            INVOICE_AMOUNT,
            INVOICE_DATE,
            BUSINESS_UNIT,
            LEGAL_ENTITY,
            SUPPLIER,
            SUPPLIER_NUMBER,
            SUPPLIER_SITE,
            INVOICE_TYPE,
            DESCRIPTION,
            INVOICE_GROUP,
            INVOICE_SOURCE,
            ACCOUNTING_DATE,
            TERMS_DATE,
            GOODS_RECEIVED_DATE,
            PAY_GROUP,
            PAYMENT_TERMS,
            PAYMENT_METHOD,
            PAY_ALONE_FLAG,
            VALIDATION_STATUS,
            APPROVAL_STATUS,
            PAID_STATUS,
            ACCOUNTING_STATUS,
            SYNC_STATUS,
            CREATED_BY,
            CREATION_DATE
        ) VALUES (
            l_invoice_id,
            l_invoice_number,
            l_invoice_currency,
            l_payment_currency,
            l_invoice_amount,
            l_invoice_date,
            l_business_unit,
            l_legal_entity,
            l_supplier,
            l_supplier_number,
            l_supplier_site,
            l_invoice_type,
            l_description,
            l_invoice_group,
            l_invoice_source,
            l_accounting_date,
            l_terms_date,
            l_goods_received_date,
            l_pay_group,
            l_payment_terms,
            l_payment_method,
            l_pay_alone_flag,
            'Needs Revalidation',
            'Required',
            'Unpaid',
            'Not Accounted',
            'NEW',
            USER,
            SYSTIMESTAMP
        );

        -- ========== INSERT LINES ==========
        FOR rec IN (
            SELECT jt.*
            FROM JSON_TABLE(p_json, '$.lines[*]'
                COLUMNS (
                    line_number             NUMBER          PATH '$.LineNumber',
                    line_type               VARCHAR2(50)    PATH '$.LineType',
                    line_amount             NUMBER          PATH '$.LineAmount',
                    description             VARCHAR2(4000)  PATH '$.Description',
                    accounting_date         VARCHAR2(10)    PATH '$.AccountingDate',
                    distribution_combination VARCHAR2(500)  PATH '$.DistributionCombination',
                    distribution_set        VARCHAR2(240)   PATH '$.DistributionSet',
                    tax_classification      VARCHAR2(240)   PATH '$.TaxClassification',
                    quantity                NUMBER          PATH '$.Quantity',
                    unit_price              NUMBER          PATH '$.UnitPrice',
                    uom                     VARCHAR2(25)    PATH '$.UOM',
                    purchase_order_number   VARCHAR2(50)    PATH '$.PONumber',
                    purchase_order_line_number NUMBER       PATH '$.POLineNumber',
                    receipt_number          VARCHAR2(50)    PATH '$.ReceiptNumber',
                    receipt_line_number     NUMBER          PATH '$.ReceiptLineNumber',
                    ship_to_location        VARCHAR2(240)   PATH '$.ShipToLocation'
                )
            ) jt
        ) LOOP
            l_line_count := l_line_count + 1;

            BEGIN
                INSERT INTO XXAP_INVOICE_LINES_STG (
                    INVOICE_ID,
                    INVOICE_NUMBER,
                    LINE_NUMBER,
                    LINE_TYPE,
                    LINE_AMOUNT,
                    DESCRIPTION,
                    ACCOUNTING_DATE,
                    DISTRIBUTION_COMBINATION,
                    DISTRIBUTION_SET,
                    TAX_CLASSIFICATION,
                    QUANTITY,
                    UNIT_PRICE,
                    UOM,
                    PURCHASE_ORDER_NUMBER,
                    PURCHASE_ORDER_LINE_NUMBER,
                    RECEIPT_NUMBER,
                    RECEIPT_LINE_NUMBER,
                    SHIP_TO_LOCATION,
                    PROCESS_STATUS,
                    CREATED_BY,
                    CREATION_DATE
                ) VALUES (
                    l_invoice_id,
                    l_invoice_number,
                    rec.line_number,
                    NVL(rec.line_type, 'Item'),
                    rec.line_amount,
                    rec.description,
                    NVL(TO_DATE(rec.accounting_date, 'YYYY-MM-DD'), l_invoice_date),
                    rec.distribution_combination,
                    rec.distribution_set,
                    rec.tax_classification,
                    rec.quantity,
                    rec.unit_price,
                    rec.uom,
                    rec.purchase_order_number,
                    rec.purchase_order_line_number,
                    rec.receipt_number,
                    rec.receipt_line_number,
                    rec.ship_to_location,
                    'NEW',
                    USER,
                    SYSTIMESTAMP
                );
                l_line_success := l_line_success + 1;
            EXCEPTION
                WHEN OTHERS THEN
                    l_line_error := l_line_error + 1;
            END;
        END LOOP;

        -- Only commit if no line errors
        IF l_line_error = 0 THEN
            COMMIT;
            p_invoice_id := l_invoice_id;
            p_status := 'SUCCESS';
            p_message := 'Invoice ' || l_invoice_number || ' created (ID: ' || l_invoice_id || ') with ' || l_line_success || ' lines';
        ELSE
            ROLLBACK;
            p_invoice_id := NULL;
            p_status := 'ERROR';
            p_message := 'Invoice creation rolled back. ' || l_line_error || ' of ' || l_line_count || ' lines failed';
        END IF;

    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            p_invoice_id := NULL;
            p_status := 'ERROR';
            p_message := 'Error creating invoice: ' || SQLERRM;
    END create_invoice;

END RR_AP_CREATE_INVOICE_PKG;
/

-- =====================================================
-- 4. ORDS REST Handler
-- =====================================================

-- Template for combined create
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'ap',
        p_pattern        => 'createinvoicefull',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_comments       => 'Create invoice with header + lines in one POST'
    );
    COMMIT;
END;
/

-- POST handler
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ap',
        p_pattern        => 'createinvoicefull',
        p_method         => 'POST',
        p_source_type    => 'plsql/block',
        p_mimes_allowed  => 'application/json',
        p_comments       => 'Create AP Invoice (header + lines) from single JSON',
        p_source         => q'[
DECLARE
    l_invoice_id    NUMBER;
    l_status        VARCHAR2(20);
    l_message       VARCHAR2(4000);
BEGIN
    RR_AP_CREATE_INVOICE_PKG.create_invoice(
        p_json       => :body_text,
        p_invoice_id => l_invoice_id,
        p_status     => l_status,
        p_message    => l_message
    );

    :status_code := CASE WHEN l_status = 'SUCCESS' THEN 201 ELSE 400 END;

    HTP.P('{');
    HTP.P('"status": "' || l_status || '",');
    HTP.P('"message": "' || l_message || '",');
    HTP.P('"invoiceId": ' || NVL(TO_CHAR(l_invoice_id), 'null') || ',');
    HTP.P('"success": ' || CASE WHEN l_status = 'SUCCESS' THEN 'true' ELSE 'false' END);
    HTP.P('}');
END;
]'
    );
    COMMIT;
END;
/

-- =====================================================
-- 5. Verify
-- =====================================================
SELECT
    module_name,
    uri_template,
    method,
    source_type
FROM user_ords_handlers
WHERE module_name = 'ap'
  AND uri_template LIKE '%createinvoicefull%'
ORDER BY uri_template, method;

-- =====================================================
-- Sample JSON for Postman Testing:
-- =====================================================
/*
POST URL: https://<your-apex-host>/ords/<schema>/reerp/ap/createinvoicefull
Content-Type: application/json

{
    "InvoiceNumber": "TEST-INV-001",
    "InvoiceCurrency": "AED",
    "PaymentCurrency": "AED",
    "InvoiceAmount": 1050.00,
    "InvoiceDate": "2026-02-14",
    "BusinessUnit": "BUIMERC CORP_DIFC_INVST",
    "Supplier": "TEST SUPPLIER LLC",
    "SupplierNumber": "T0001",
    "SupplierSite": "DUBAI",
    "InvoiceType": "Standard",
    "Description": "Test invoice from UI",
    "PaymentTerms": "Immediate",
    "PayGroup": "Standard",
    "PayAlone": "N",
    "lines": [
        {
            "LineNumber": 1,
            "LineType": "Item",
            "LineAmount": 1000.00,
            "Description": "Office Supplies",
            "AccountingDate": "2026-02-14",
            "DistributionCombination": "01-000-6310-0000-000",
            "TaxClassification": "VAT 5%",
            "Quantity": 10,
            "UnitPrice": 100
        },
        {
            "LineNumber": 2,
            "LineType": "Tax",
            "LineAmount": 50.00,
            "Description": "VAT 5%",
            "AccountingDate": "2026-02-14"
        }
    ]
}

Expected Response:
{
    "status": "SUCCESS",
    "message": "Invoice TEST-INV-001 created (ID: 900001) with 2 lines",
    "invoiceId": 900001,
    "success": true
}
*/
