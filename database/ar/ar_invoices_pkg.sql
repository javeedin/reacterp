-- =====================================================
-- AR Invoices PL/SQL Package
-- Handles saving headers and lines from Fusion sync
-- =====================================================

CREATE OR REPLACE PACKAGE RR_AR_INVOICES_PKG AS

    -- Save / upsert a single AR invoice header + lines from JSON
    PROCEDURE save_invoice (
        p_invoice_json  IN  CLOB,
        p_status        OUT VARCHAR2,
        p_message       OUT VARCHAR2
    );

    -- Bulk upsert - accepts {"items":[...]} array
    PROCEDURE save_invoices_bulk (
        p_invoices_json IN  CLOB,
        p_status        OUT VARCHAR2,
        p_message       OUT VARCHAR2,
        p_inserted      OUT NUMBER,
        p_updated       OUT NUMBER,
        p_errors        OUT NUMBER
    );

    -- Save / upsert lines for a specific header
    PROCEDURE save_invoice_lines (
        p_transaction_id  IN  NUMBER,
        p_lines_json      IN  CLOB,
        p_status          OUT VARCHAR2,
        p_message         OUT VARCHAR2
    );

END RR_AR_INVOICES_PKG;
/

CREATE OR REPLACE PACKAGE BODY RR_AR_INVOICES_PKG AS

    -- -------------------------------------------------------
    -- Internal: upsert one header row
    -- -------------------------------------------------------
    PROCEDURE upsert_header (p_j IN JSON_OBJECT_T) IS
        l_id NUMBER := p_j.get_number('CustomerTransactionId');
    BEGIN
        MERGE INTO RR_AR_INVOICE_HEADERS h
        USING (SELECT l_id AS customer_transaction_id FROM DUAL) src
        ON (h.CUSTOMER_TRANSACTION_ID = src.customer_transaction_id)
        WHEN MATCHED THEN UPDATE SET
            TRANSACTION_NUMBER          = p_j.get_string('TransactionNumber'),
            DOCUMENT_NUMBER             = p_j.get_number('DocumentNumber'),
            CROSS_REFERENCE             = p_j.get_string('CrossReference'),
            TRANSACTION_DATE            = TO_DATE(p_j.get_string('TransactionDate'),         'YYYY-MM-DD'),
            ACCOUNTING_DATE             = TO_DATE(p_j.get_string('AccountingDate'),          'YYYY-MM-DD'),
            DUE_DATE                    = TO_DATE(p_j.get_string('DueDate'),                 'YYYY-MM-DD'),
            BILLING_DATE                = TO_DATE(p_j.get_string('BillingDate'),             'YYYY-MM-DD'),
            SHIP_DATE                   = TO_DATE(p_j.get_string('ShipDate'),                'YYYY-MM-DD'),
            TRANSACTION_TYPE            = p_j.get_string('TransactionType'),
            TRANSACTION_SOURCE          = p_j.get_string('TransactionSource'),
            INVOICE_STATUS              = p_j.get_string('InvoiceStatus'),
            INVOICE_CURRENCY_CODE       = p_j.get_string('InvoiceCurrencyCode'),
            CONVERSION_RATE_TYPE        = p_j.get_string('ConversionRateType'),
            CONVERSION_DATE             = TO_DATE(p_j.get_string('ConversionDate'),          'YYYY-MM-DD'),
            CONVERSION_RATE             = p_j.get_number('ConversionRate'),
            ENTERED_AMOUNT              = p_j.get_number('EnteredAmount'),
            INVOICE_BALANCE_AMOUNT      = p_j.get_number('InvoiceBalanceAmount'),
            FREIGHT_AMOUNT              = p_j.get_number('FreightAmount'),
            BILL_TO_CUSTOMER_NUMBER     = p_j.get_string('BillToCustomerNumber'),
            BILL_TO_CUSTOMER_NAME       = p_j.get_string('BillToCustomerName'),
            BILL_TO_SITE                = p_j.get_string('BillToSite'),
            BILL_TO_CONTACT             = p_j.get_string('BillToContact'),
            BILL_TO_PARTY_ID            = p_j.get_number('BillToPartyId'),
            SHIP_TO_CUSTOMER_NUMBER     = p_j.get_string('ShipToCustomerNumber'),
            SHIP_TO_CUSTOMER_NAME       = p_j.get_string('ShipToCustomerName'),
            SHIP_TO_SITE                = p_j.get_string('ShipToSite'),
            SHIP_TO_CONTACT             = p_j.get_string('ShipToContact'),
            PAYING_CUSTOMER_NAME        = p_j.get_string('PayingCustomerName'),
            PAYING_CUSTOMER_SITE        = p_j.get_string('PayingCustomerSite'),
            PAYING_CUSTOMER_ACCOUNT     = p_j.get_string('PayingCustomerAccount'),
            BUSINESS_UNIT               = p_j.get_string('BusinessUnit'),
            LEGAL_ENTITY_IDENTIFIER     = p_j.get_string('LegalEntityIdentifier'),
            PAYMENT_TERMS               = p_j.get_string('PaymentTerms'),
            RECEIPT_METHOD              = p_j.get_string('ReceiptMethod'),
            PURCHASE_ORDER              = p_j.get_string('PurchaseOrder'),
            PURCHASE_ORDER_DATE         = TO_DATE(p_j.get_string('PurchaseOrderDate'),       'YYYY-MM-DD'),
            PURCHASE_ORDER_REVISION     = p_j.get_string('PurchaseOrderRevision'),
            CARRIER                     = p_j.get_string('Carrier'),
            SHIPPING_REFERENCE          = p_j.get_string('ShippingReference'),
            DEFAULT_TAXATION_COUNTRY    = p_j.get_string('DefaultTaxationCountry'),
            FIRST_PARTY_REG_NUMBER      = p_j.get_string('FirstPartyRegistrationNumber'),
            THIRD_PARTY_REG_NUMBER      = p_j.get_string('ThirdPartyRegistrationNumber'),
            PREPAYMENT                  = p_j.get_string('Prepayment'),
            INTERCOMPANY                = p_j.get_string('Intercompany'),
            PRINT_OPTION                = p_j.get_string('PrintOption'),
            SOLD_TO_PARTY_NUMBER        = p_j.get_string('SoldToPartyNumber'),
            REMIT_TO_ADDRESS            = p_j.get_string('RemitToAddress'),
            SALESPERSON_NUMBER          = p_j.get_string('SalesPersonNumber'),
            DELIVERY_METHOD             = p_j.get_string('DeliveryMethod'),
            EMAIL                       = p_j.get_string('Email'),
            SPECIAL_INSTRUCTIONS        = p_j.get_string('SpecialInstructions'),
            COMMENTS                    = p_j.get_string('Comments'),
            INTERNAL_NOTES              = p_j.get_string('InternalNotes'),
            INVOICING_RULE              = p_j.get_string('InvoicingRule'),
            FUSION_CREATED_BY           = p_j.get_string('CreatedBy'),
            FUSION_CREATION_DATE        = TO_TIMESTAMP(REGEXP_REPLACE(p_j.get_string('CreationDate'),    'T', ' '), 'YYYY-MM-DD HH24:MI:SS'),
            FUSION_LAST_UPDATED_BY      = p_j.get_string('LastUpdatedBy'),
            FUSION_LAST_UPDATE_DATE     = TO_TIMESTAMP(REGEXP_REPLACE(p_j.get_string('LastUpdateDate'),  'T', ' '), 'YYYY-MM-DD HH24:MI:SS'),
            LAST_UPDATED_BY             = USER,
            LAST_UPDATE_DATE            = SYSTIMESTAMP,
            SYNC_DATE                   = SYSTIMESTAMP,
            SYNC_STATUS                 = 'UPDATED'
        WHEN NOT MATCHED THEN INSERT (
            CUSTOMER_TRANSACTION_ID,    TRANSACTION_NUMBER,         DOCUMENT_NUMBER,
            CROSS_REFERENCE,            TRANSACTION_DATE,           ACCOUNTING_DATE,
            DUE_DATE,                   BILLING_DATE,               SHIP_DATE,
            TRANSACTION_TYPE,           TRANSACTION_SOURCE,         INVOICE_STATUS,
            INVOICE_CURRENCY_CODE,      CONVERSION_RATE_TYPE,       CONVERSION_DATE,
            CONVERSION_RATE,            ENTERED_AMOUNT,             INVOICE_BALANCE_AMOUNT,
            FREIGHT_AMOUNT,             BILL_TO_CUSTOMER_NUMBER,    BILL_TO_CUSTOMER_NAME,
            BILL_TO_SITE,               BILL_TO_CONTACT,            BILL_TO_PARTY_ID,
            SHIP_TO_CUSTOMER_NUMBER,    SHIP_TO_CUSTOMER_NAME,      SHIP_TO_SITE,
            SHIP_TO_CONTACT,            PAYING_CUSTOMER_NAME,       PAYING_CUSTOMER_SITE,
            PAYING_CUSTOMER_ACCOUNT,    BUSINESS_UNIT,              LEGAL_ENTITY_IDENTIFIER,
            PAYMENT_TERMS,              RECEIPT_METHOD,             PURCHASE_ORDER,
            PURCHASE_ORDER_DATE,        PURCHASE_ORDER_REVISION,    CARRIER,
            SHIPPING_REFERENCE,         DEFAULT_TAXATION_COUNTRY,   FIRST_PARTY_REG_NUMBER,
            THIRD_PARTY_REG_NUMBER,     PREPAYMENT,                 INTERCOMPANY,
            PRINT_OPTION,               SOLD_TO_PARTY_NUMBER,       REMIT_TO_ADDRESS,
            SALESPERSON_NUMBER,         DELIVERY_METHOD,            EMAIL,
            SPECIAL_INSTRUCTIONS,       COMMENTS,                   INTERNAL_NOTES,
            INVOICING_RULE,             FUSION_CREATED_BY,          FUSION_CREATION_DATE,
            FUSION_LAST_UPDATED_BY,     FUSION_LAST_UPDATE_DATE,    SYNC_STATUS
        ) VALUES (
            l_id,
            p_j.get_string('TransactionNumber'),
            p_j.get_number('DocumentNumber'),
            p_j.get_string('CrossReference'),
            TO_DATE(p_j.get_string('TransactionDate'),        'YYYY-MM-DD'),
            TO_DATE(p_j.get_string('AccountingDate'),         'YYYY-MM-DD'),
            TO_DATE(p_j.get_string('DueDate'),                'YYYY-MM-DD'),
            TO_DATE(p_j.get_string('BillingDate'),            'YYYY-MM-DD'),
            TO_DATE(p_j.get_string('ShipDate'),               'YYYY-MM-DD'),
            p_j.get_string('TransactionType'),
            p_j.get_string('TransactionSource'),
            p_j.get_string('InvoiceStatus'),
            p_j.get_string('InvoiceCurrencyCode'),
            p_j.get_string('ConversionRateType'),
            TO_DATE(p_j.get_string('ConversionDate'),         'YYYY-MM-DD'),
            p_j.get_number('ConversionRate'),
            p_j.get_number('EnteredAmount'),
            p_j.get_number('InvoiceBalanceAmount'),
            p_j.get_number('FreightAmount'),
            p_j.get_string('BillToCustomerNumber'),
            p_j.get_string('BillToCustomerName'),
            p_j.get_string('BillToSite'),
            p_j.get_string('BillToContact'),
            p_j.get_number('BillToPartyId'),
            p_j.get_string('ShipToCustomerNumber'),
            p_j.get_string('ShipToCustomerName'),
            p_j.get_string('ShipToSite'),
            p_j.get_string('ShipToContact'),
            p_j.get_string('PayingCustomerName'),
            p_j.get_string('PayingCustomerSite'),
            p_j.get_string('PayingCustomerAccount'),
            p_j.get_string('BusinessUnit'),
            p_j.get_string('LegalEntityIdentifier'),
            p_j.get_string('PaymentTerms'),
            p_j.get_string('ReceiptMethod'),
            p_j.get_string('PurchaseOrder'),
            TO_DATE(p_j.get_string('PurchaseOrderDate'),      'YYYY-MM-DD'),
            p_j.get_string('PurchaseOrderRevision'),
            p_j.get_string('Carrier'),
            p_j.get_string('ShippingReference'),
            p_j.get_string('DefaultTaxationCountry'),
            p_j.get_string('FirstPartyRegistrationNumber'),
            p_j.get_string('ThirdPartyRegistrationNumber'),
            p_j.get_string('Prepayment'),
            p_j.get_string('Intercompany'),
            p_j.get_string('PrintOption'),
            p_j.get_string('SoldToPartyNumber'),
            p_j.get_string('RemitToAddress'),
            p_j.get_string('SalesPersonNumber'),
            p_j.get_string('DeliveryMethod'),
            p_j.get_string('Email'),
            p_j.get_string('SpecialInstructions'),
            p_j.get_string('Comments'),
            p_j.get_string('InternalNotes'),
            p_j.get_string('InvoicingRule'),
            p_j.get_string('CreatedBy'),
            TO_TIMESTAMP(REGEXP_REPLACE(p_j.get_string('CreationDate'),   'T', ' '), 'YYYY-MM-DD HH24:MI:SS'),
            p_j.get_string('LastUpdatedBy'),
            TO_TIMESTAMP(REGEXP_REPLACE(p_j.get_string('LastUpdateDate'), 'T', ' '), 'YYYY-MM-DD HH24:MI:SS'),
            'NEW'
        );
    END upsert_header;

    -- -------------------------------------------------------
    -- Internal: upsert lines for a header
    -- -------------------------------------------------------
    PROCEDURE upsert_lines (p_transaction_id IN NUMBER, p_lines IN JSON_ARRAY_T) IS
        l_line JSON_OBJECT_T;
        l_line_id NUMBER;
    BEGIN
        FOR i IN 0 .. p_lines.get_size - 1 LOOP
            l_line    := TREAT(p_lines.get(i) AS JSON_OBJECT_T);
            l_line_id := l_line.get_number('CustomerTransactionLineId');

            MERGE INTO RR_AR_INVOICE_LINES ln
            USING (SELECT l_line_id AS id FROM DUAL) src
            ON (ln.CUSTOMER_TRANSACTION_LINE_ID = src.id)
            WHEN MATCHED THEN UPDATE SET
                LINE_NUMBER                     = l_line.get_number('LineNumber'),
                DESCRIPTION                     = l_line.get_string('Description'),
                ITEM_NUMBER                     = l_line.get_string('ItemNumber'),
                UNIT_OF_MEASURE                 = l_line.get_string('UnitOfMeasure'),
                WAREHOUSE                       = l_line.get_string('Warehouse'),
                MEMO_LINE                       = l_line.get_string('MemoLine'),
                QUANTITY                        = l_line.get_number('Quantity'),
                UNIT_SELLING_PRICE              = l_line.get_number('UnitSellingPrice'),
                LINE_AMOUNT                     = l_line.get_number('LineAmount'),
                ASSESSABLE_VALUE                = l_line.get_number('AssessableValue'),
                ALLOCATED_FREIGHT_AMOUNT        = l_line.get_number('AllocatedFreightAmount'),
                SALES_ORDER                     = l_line.get_string('SalesOrder'),
                SALES_ORDER_DATE                = TO_DATE(l_line.get_string('SalesOrderDate'), 'YYYY-MM-DD'),
                TAX_CLASSIFICATION_CODE         = l_line.get_string('TaxClassificationCode'),
                TAX_EXEMPTION_HANDLING          = l_line.get_string('TaxExemptionHandling'),
                ACCOUNTING_RULE                 = l_line.get_string('AccountingRule'),
                ACCOUNTING_RULE_DURATION        = l_line.get_number('AccountingRuleDuration'),
                RULE_START_DATE                 = TO_DATE(l_line.get_string('RuleStartDate'), 'YYYY-MM-DD'),
                RULE_END_DATE                   = TO_DATE(l_line.get_string('RuleEndDate'),   'YYYY-MM-DD'),
                TRANSACTION_BUSINESS_CATEGORY   = l_line.get_string('TransacationBusinessCategory'),
                PRODUCT_FISCAL_CLASSIFICATION   = l_line.get_string('ProductFiscalClassification'),
                PRODUCT_CATEGORY                = l_line.get_string('ProductCategory'),
                PRODUCT_TYPE                    = l_line.get_string('ProductType'),
                LINE_INTENDED_USE               = l_line.get_string('LineIntendedUse'),
                FUSION_CREATED_BY               = l_line.get_string('CreatedBy'),
                FUSION_CREATION_DATE            = TO_TIMESTAMP(REGEXP_REPLACE(l_line.get_string('CreationDate'),   'T', ' '), 'YYYY-MM-DD HH24:MI:SS'),
                FUSION_LAST_UPDATED_BY          = l_line.get_string('LastUpdatedBy'),
                FUSION_LAST_UPDATE_DATE         = TO_TIMESTAMP(REGEXP_REPLACE(l_line.get_string('LastUpdateDate'), 'T', ' '), 'YYYY-MM-DD HH24:MI:SS'),
                LAST_UPDATED_BY                 = USER,
                LAST_UPDATE_DATE                = SYSTIMESTAMP,
                SYNC_DATE                       = SYSTIMESTAMP,
                SYNC_STATUS                     = 'UPDATED'
            WHEN NOT MATCHED THEN INSERT (
                CUSTOMER_TRANSACTION_LINE_ID,   CUSTOMER_TRANSACTION_ID,    LINE_NUMBER,
                DESCRIPTION,                    ITEM_NUMBER,                UNIT_OF_MEASURE,
                WAREHOUSE,                      MEMO_LINE,                  QUANTITY,
                UNIT_SELLING_PRICE,             LINE_AMOUNT,                ASSESSABLE_VALUE,
                ALLOCATED_FREIGHT_AMOUNT,       SALES_ORDER,                SALES_ORDER_DATE,
                TAX_CLASSIFICATION_CODE,        TAX_EXEMPTION_HANDLING,     ACCOUNTING_RULE,
                ACCOUNTING_RULE_DURATION,       RULE_START_DATE,            RULE_END_DATE,
                TRANSACTION_BUSINESS_CATEGORY,  PRODUCT_FISCAL_CLASSIFICATION, PRODUCT_CATEGORY,
                PRODUCT_TYPE,                   LINE_INTENDED_USE,          FUSION_CREATED_BY,
                FUSION_CREATION_DATE,           FUSION_LAST_UPDATED_BY,     FUSION_LAST_UPDATE_DATE,
                SYNC_STATUS
            ) VALUES (
                l_line_id,                      p_transaction_id,           l_line.get_number('LineNumber'),
                l_line.get_string('Description'), l_line.get_string('ItemNumber'), l_line.get_string('UnitOfMeasure'),
                l_line.get_string('Warehouse'),  l_line.get_string('MemoLine'), l_line.get_number('Quantity'),
                l_line.get_number('UnitSellingPrice'), l_line.get_number('LineAmount'), l_line.get_number('AssessableValue'),
                l_line.get_number('AllocatedFreightAmount'), l_line.get_string('SalesOrder'),
                TO_DATE(l_line.get_string('SalesOrderDate'), 'YYYY-MM-DD'),
                l_line.get_string('TaxClassificationCode'), l_line.get_string('TaxExemptionHandling'),
                l_line.get_string('AccountingRule'), l_line.get_number('AccountingRuleDuration'),
                TO_DATE(l_line.get_string('RuleStartDate'), 'YYYY-MM-DD'),
                TO_DATE(l_line.get_string('RuleEndDate'),   'YYYY-MM-DD'),
                l_line.get_string('TransacationBusinessCategory'),
                l_line.get_string('ProductFiscalClassification'),
                l_line.get_string('ProductCategory'),
                l_line.get_string('ProductType'),
                l_line.get_string('LineIntendedUse'),
                l_line.get_string('CreatedBy'),
                TO_TIMESTAMP(REGEXP_REPLACE(l_line.get_string('CreationDate'),   'T', ' '), 'YYYY-MM-DD HH24:MI:SS'),
                l_line.get_string('LastUpdatedBy'),
                TO_TIMESTAMP(REGEXP_REPLACE(l_line.get_string('LastUpdateDate'), 'T', ' '), 'YYYY-MM-DD HH24:MI:SS'),
                'NEW'
            );
        END LOOP;
    END upsert_lines;

    -- -------------------------------------------------------
    -- save_invoice: single header (+ embedded lines if present)
    -- -------------------------------------------------------
    PROCEDURE save_invoice (
        p_invoice_json  IN  CLOB,
        p_status        OUT VARCHAR2,
        p_message       OUT VARCHAR2
    ) IS
        l_j     JSON_OBJECT_T;
        l_lines JSON_ARRAY_T;
    BEGIN
        l_j := JSON_OBJECT_T.parse(p_invoice_json);
        upsert_header(l_j);

        -- If lines are embedded in the payload
        IF l_j.has('lines') THEN
            l_lines := l_j.get_array('lines');
            upsert_lines(l_j.get_number('CustomerTransactionId'), l_lines);
        END IF;

        COMMIT;
        p_status  := 'SUCCESS';
        p_message := 'Invoice saved: ' || l_j.get_string('TransactionNumber');
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            p_status  := 'ERROR';
            p_message := SQLERRM;
    END save_invoice;

    -- -------------------------------------------------------
    -- save_invoices_bulk: {"items":[...]} array of headers
    -- -------------------------------------------------------
    PROCEDURE save_invoices_bulk (
        p_invoices_json IN  CLOB,
        p_status        OUT VARCHAR2,
        p_message       OUT VARCHAR2,
        p_inserted      OUT NUMBER,
        p_updated       OUT NUMBER,
        p_errors        OUT NUMBER
    ) IS
        l_root  JSON_OBJECT_T;
        l_items JSON_ARRAY_T;
        l_item  JSON_OBJECT_T;
        l_lines JSON_ARRAY_T;
    BEGIN
        p_inserted := 0;
        p_updated  := 0;
        p_errors   := 0;

        l_root  := JSON_OBJECT_T.parse(p_invoices_json);
        l_items := l_root.get_array('items');

        FOR i IN 0 .. l_items.get_size - 1 LOOP
            BEGIN
                l_item := TREAT(l_items.get(i) AS JSON_OBJECT_T);
                upsert_header(l_item);

                IF l_item.has('lines') THEN
                    l_lines := l_item.get_array('lines');
                    upsert_lines(l_item.get_number('CustomerTransactionId'), l_lines);
                END IF;

                p_inserted := p_inserted + 1;
            EXCEPTION
                WHEN OTHERS THEN
                    p_errors := p_errors + 1;
                    -- log but continue
                    UPDATE RR_AR_INVOICE_HEADERS
                       SET SYNC_STATUS   = 'ERROR',
                           ERROR_MESSAGE = SQLERRM
                     WHERE CUSTOMER_TRANSACTION_ID = l_item.get_number('CustomerTransactionId');
            END;
        END LOOP;

        COMMIT;
        p_status  := 'SUCCESS';
        p_message := 'Bulk complete. Saved: ' || p_inserted || ', Errors: ' || p_errors;
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            p_status  := 'ERROR';
            p_message := SQLERRM;
    END save_invoices_bulk;

    -- -------------------------------------------------------
    -- save_invoice_lines: lines for a specific header
    -- payload: {"items":[...]}
    -- -------------------------------------------------------
    PROCEDURE save_invoice_lines (
        p_transaction_id  IN  NUMBER,
        p_lines_json      IN  CLOB,
        p_status          OUT VARCHAR2,
        p_message         OUT VARCHAR2
    ) IS
        l_root  JSON_OBJECT_T;
        l_lines JSON_ARRAY_T;
    BEGIN
        l_root  := JSON_OBJECT_T.parse(p_lines_json);
        l_lines := l_root.get_array('items');
        upsert_lines(p_transaction_id, l_lines);
        COMMIT;
        p_status  := 'SUCCESS';
        p_message := 'Saved ' || l_lines.get_size || ' lines for transaction ' || p_transaction_id;
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            p_status  := 'ERROR';
            p_message := SQLERRM;
    END save_invoice_lines;

END RR_AR_INVOICES_PKG;
/
