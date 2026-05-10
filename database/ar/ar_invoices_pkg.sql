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
    -- All JSON values extracted into local vars first to avoid
    -- ORA-40573 (PL/SQL JSON types invalid in SQL context)
    -- -------------------------------------------------------
    PROCEDURE upsert_header (p_j IN JSON_OBJECT_T) IS
        l_id                        NUMBER          := p_j.get_number('CustomerTransactionId');
        l_transaction_number        VARCHAR2(150)   := p_j.get_string('TransactionNumber');
        l_document_number           NUMBER          := p_j.get_number('DocumentNumber');
        l_cross_reference           VARCHAR2(150)   := p_j.get_string('CrossReference');
        l_transaction_date          DATE            := TO_DATE(NULLIF(p_j.get_string('TransactionDate'),  ''), 'YYYY-MM-DD');
        l_accounting_date           DATE            := TO_DATE(NULLIF(p_j.get_string('AccountingDate'),   ''), 'YYYY-MM-DD');
        l_due_date                  DATE            := TO_DATE(NULLIF(p_j.get_string('DueDate'),          ''), 'YYYY-MM-DD');
        l_billing_date              DATE            := TO_DATE(NULLIF(p_j.get_string('BillingDate'),      ''), 'YYYY-MM-DD');
        l_ship_date                 DATE            := TO_DATE(NULLIF(p_j.get_string('ShipDate'),         ''), 'YYYY-MM-DD');
        l_transaction_type          VARCHAR2(150)   := p_j.get_string('TransactionType');
        l_transaction_source        VARCHAR2(150)   := p_j.get_string('TransactionSource');
        l_invoice_status            VARCHAR2(150)   := p_j.get_string('InvoiceStatus');
        l_invoice_currency_code     VARCHAR2(15)    := p_j.get_string('InvoiceCurrencyCode');
        l_conversion_rate_type      VARCHAR2(150)   := p_j.get_string('ConversionRateType');
        l_conversion_date           DATE            := TO_DATE(NULLIF(p_j.get_string('ConversionDate'),   ''), 'YYYY-MM-DD');
        l_conversion_rate           NUMBER          := p_j.get_number('ConversionRate');
        l_entered_amount            NUMBER          := p_j.get_number('EnteredAmount');
        l_invoice_balance_amount    NUMBER          := p_j.get_number('InvoiceBalanceAmount');
        l_freight_amount            NUMBER          := p_j.get_number('FreightAmount');
        l_bill_to_customer_number   VARCHAR2(150)   := p_j.get_string('BillToCustomerNumber');
        l_bill_to_customer_name     VARCHAR2(360)   := p_j.get_string('BillToCustomerName');
        l_bill_to_site              VARCHAR2(150)   := p_j.get_string('BillToSite');
        l_bill_to_contact           VARCHAR2(360)   := p_j.get_string('BillToContact');
        l_bill_to_party_id          NUMBER          := p_j.get_number('BillToPartyId');
        l_ship_to_customer_number   VARCHAR2(150)   := p_j.get_string('ShipToCustomerNumber');
        l_ship_to_customer_name     VARCHAR2(360)   := p_j.get_string('ShipToCustomerName');
        l_ship_to_site              VARCHAR2(150)   := p_j.get_string('ShipToSite');
        l_ship_to_contact           VARCHAR2(360)   := p_j.get_string('ShipToContact');
        l_paying_customer_name      VARCHAR2(360)   := p_j.get_string('PayingCustomerName');
        l_paying_customer_site      VARCHAR2(150)   := p_j.get_string('PayingCustomerSite');
        l_paying_customer_account   VARCHAR2(150)   := p_j.get_string('PayingCustomerAccount');
        l_business_unit             VARCHAR2(240)   := p_j.get_string('BusinessUnit');
        l_legal_entity_identifier   VARCHAR2(150)   := p_j.get_string('LegalEntityIdentifier');
        l_payment_terms             VARCHAR2(150)   := p_j.get_string('PaymentTerms');
        l_receipt_method            VARCHAR2(150)   := p_j.get_string('ReceiptMethod');
        l_purchase_order            VARCHAR2(150)   := p_j.get_string('PurchaseOrder');
        l_purchase_order_date       DATE            := TO_DATE(NULLIF(p_j.get_string('PurchaseOrderDate'), ''), 'YYYY-MM-DD');
        l_purchase_order_revision   VARCHAR2(150)   := p_j.get_string('PurchaseOrderRevision');
        l_carrier                   VARCHAR2(150)   := p_j.get_string('Carrier');
        l_shipping_reference        VARCHAR2(150)   := p_j.get_string('ShippingReference');
        l_default_taxation_country  VARCHAR2(150)   := p_j.get_string('DefaultTaxationCountry');
        l_first_party_reg_number    VARCHAR2(150)   := p_j.get_string('FirstPartyRegistrationNumber');
        l_third_party_reg_number    VARCHAR2(150)   := p_j.get_string('ThirdPartyRegistrationNumber');
        l_prepayment                VARCHAR2(30)    := p_j.get_string('Prepayment');
        l_intercompany              VARCHAR2(30)    := p_j.get_string('Intercompany');
        l_print_option              VARCHAR2(30)    := p_j.get_string('PrintOption');
        l_sold_to_party_number      VARCHAR2(150)   := p_j.get_string('SoldToPartyNumber');
        l_remit_to_address          VARCHAR2(360)   := p_j.get_string('RemitToAddress');
        l_salesperson_number        VARCHAR2(150)   := p_j.get_string('SalesPersonNumber');
        l_delivery_method           VARCHAR2(150)   := p_j.get_string('DeliveryMethod');
        l_email                     VARCHAR2(360)   := p_j.get_string('Email');
        l_special_instructions      VARCHAR2(1000)  := p_j.get_string('SpecialInstructions');
        l_comments                  VARCHAR2(1000)  := p_j.get_string('Comments');
        l_internal_notes            VARCHAR2(1000)  := p_j.get_string('InternalNotes');
        l_invoicing_rule            VARCHAR2(150)   := p_j.get_string('InvoicingRule');
        l_fusion_created_by         VARCHAR2(150)   := p_j.get_string('CreatedBy');
        l_fusion_creation_date      TIMESTAMP       := TO_TIMESTAMP(REGEXP_REPLACE(NULLIF(p_j.get_string('CreationDate'),   ''), 'T', ' '), 'YYYY-MM-DD HH24:MI:SS');
        l_fusion_last_updated_by    VARCHAR2(150)   := p_j.get_string('LastUpdatedBy');
        l_fusion_last_update_date   TIMESTAMP       := TO_TIMESTAMP(REGEXP_REPLACE(NULLIF(p_j.get_string('LastUpdateDate'), ''), 'T', ' '), 'YYYY-MM-DD HH24:MI:SS');
    BEGIN
        MERGE INTO RR_AR_INVOICE_HEADERS h
        USING (SELECT l_id AS customer_transaction_id FROM DUAL) src
        ON (h.CUSTOMER_TRANSACTION_ID = src.customer_transaction_id)
        WHEN MATCHED THEN UPDATE SET
            TRANSACTION_NUMBER          = l_transaction_number,
            DOCUMENT_NUMBER             = l_document_number,
            CROSS_REFERENCE             = l_cross_reference,
            TRANSACTION_DATE            = l_transaction_date,
            ACCOUNTING_DATE             = l_accounting_date,
            DUE_DATE                    = l_due_date,
            BILLING_DATE                = l_billing_date,
            SHIP_DATE                   = l_ship_date,
            TRANSACTION_TYPE            = l_transaction_type,
            TRANSACTION_SOURCE          = l_transaction_source,
            INVOICE_STATUS              = l_invoice_status,
            INVOICE_CURRENCY_CODE       = l_invoice_currency_code,
            CONVERSION_RATE_TYPE        = l_conversion_rate_type,
            CONVERSION_DATE             = l_conversion_date,
            CONVERSION_RATE             = l_conversion_rate,
            ENTERED_AMOUNT              = l_entered_amount,
            INVOICE_BALANCE_AMOUNT      = l_invoice_balance_amount,
            FREIGHT_AMOUNT              = l_freight_amount,
            BILL_TO_CUSTOMER_NUMBER     = l_bill_to_customer_number,
            BILL_TO_CUSTOMER_NAME       = l_bill_to_customer_name,
            BILL_TO_SITE                = l_bill_to_site,
            BILL_TO_CONTACT             = l_bill_to_contact,
            BILL_TO_PARTY_ID            = l_bill_to_party_id,
            SHIP_TO_CUSTOMER_NUMBER     = l_ship_to_customer_number,
            SHIP_TO_CUSTOMER_NAME       = l_ship_to_customer_name,
            SHIP_TO_SITE                = l_ship_to_site,
            SHIP_TO_CONTACT             = l_ship_to_contact,
            PAYING_CUSTOMER_NAME        = l_paying_customer_name,
            PAYING_CUSTOMER_SITE        = l_paying_customer_site,
            PAYING_CUSTOMER_ACCOUNT     = l_paying_customer_account,
            BUSINESS_UNIT               = l_business_unit,
            LEGAL_ENTITY_IDENTIFIER     = l_legal_entity_identifier,
            PAYMENT_TERMS               = l_payment_terms,
            RECEIPT_METHOD              = l_receipt_method,
            PURCHASE_ORDER              = l_purchase_order,
            PURCHASE_ORDER_DATE         = l_purchase_order_date,
            PURCHASE_ORDER_REVISION     = l_purchase_order_revision,
            CARRIER                     = l_carrier,
            SHIPPING_REFERENCE          = l_shipping_reference,
            DEFAULT_TAXATION_COUNTRY    = l_default_taxation_country,
            FIRST_PARTY_REG_NUMBER      = l_first_party_reg_number,
            THIRD_PARTY_REG_NUMBER      = l_third_party_reg_number,
            PREPAYMENT                  = l_prepayment,
            INTERCOMPANY                = l_intercompany,
            PRINT_OPTION                = l_print_option,
            SOLD_TO_PARTY_NUMBER        = l_sold_to_party_number,
            REMIT_TO_ADDRESS            = l_remit_to_address,
            SALESPERSON_NUMBER          = l_salesperson_number,
            DELIVERY_METHOD             = l_delivery_method,
            EMAIL                       = l_email,
            SPECIAL_INSTRUCTIONS        = l_special_instructions,
            COMMENTS                    = l_comments,
            INTERNAL_NOTES              = l_internal_notes,
            INVOICING_RULE              = l_invoicing_rule,
            FUSION_CREATED_BY           = l_fusion_created_by,
            FUSION_CREATION_DATE        = l_fusion_creation_date,
            FUSION_LAST_UPDATED_BY      = l_fusion_last_updated_by,
            FUSION_LAST_UPDATE_DATE     = l_fusion_last_update_date,
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
            l_id,                       l_transaction_number,       l_document_number,
            l_cross_reference,          l_transaction_date,         l_accounting_date,
            l_due_date,                 l_billing_date,             l_ship_date,
            l_transaction_type,         l_transaction_source,       l_invoice_status,
            l_invoice_currency_code,    l_conversion_rate_type,     l_conversion_date,
            l_conversion_rate,          l_entered_amount,           l_invoice_balance_amount,
            l_freight_amount,           l_bill_to_customer_number,  l_bill_to_customer_name,
            l_bill_to_site,             l_bill_to_contact,          l_bill_to_party_id,
            l_ship_to_customer_number,  l_ship_to_customer_name,    l_ship_to_site,
            l_ship_to_contact,          l_paying_customer_name,     l_paying_customer_site,
            l_paying_customer_account,  l_business_unit,            l_legal_entity_identifier,
            l_payment_terms,            l_receipt_method,           l_purchase_order,
            l_purchase_order_date,      l_purchase_order_revision,  l_carrier,
            l_shipping_reference,       l_default_taxation_country, l_first_party_reg_number,
            l_third_party_reg_number,   l_prepayment,               l_intercompany,
            l_print_option,             l_sold_to_party_number,     l_remit_to_address,
            l_salesperson_number,       l_delivery_method,          l_email,
            l_special_instructions,     l_comments,                 l_internal_notes,
            l_invoicing_rule,           l_fusion_created_by,        l_fusion_creation_date,
            l_fusion_last_updated_by,   l_fusion_last_update_date,  'NEW'
        );
    END upsert_header;

    -- -------------------------------------------------------
    -- Internal: upsert lines for a header
    -- All JSON values extracted into local vars first to avoid
    -- ORA-40573 (PL/SQL JSON types invalid in SQL context)
    -- -------------------------------------------------------
    PROCEDURE upsert_lines (p_transaction_id IN NUMBER, p_lines IN JSON_ARRAY_T) IS
        l_line                          JSON_OBJECT_T;
        l_line_id                       NUMBER;
        l_line_number                   NUMBER;
        l_description                   VARCHAR2(2000);
        l_item_number                   VARCHAR2(150);
        l_unit_of_measure               VARCHAR2(30);
        l_warehouse                     VARCHAR2(150);
        l_memo_line                     VARCHAR2(150);
        l_quantity                      NUMBER;
        l_unit_selling_price            NUMBER;
        l_line_amount                   NUMBER;
        l_assessable_value              NUMBER;
        l_allocated_freight_amount      NUMBER;
        l_sales_order                   VARCHAR2(150);
        l_sales_order_date              DATE;
        l_tax_classification_code       VARCHAR2(150);
        l_tax_exemption_handling        VARCHAR2(30);
        l_accounting_rule               VARCHAR2(150);
        l_accounting_rule_duration      NUMBER;
        l_rule_start_date               DATE;
        l_rule_end_date                 DATE;
        l_transaction_business_category VARCHAR2(150);
        l_product_fiscal_classification VARCHAR2(150);
        l_product_category              VARCHAR2(150);
        l_product_type                  VARCHAR2(150);
        l_line_intended_use             VARCHAR2(150);
        l_fusion_created_by             VARCHAR2(150);
        l_fusion_creation_date          TIMESTAMP;
        l_fusion_last_updated_by        VARCHAR2(150);
        l_fusion_last_update_date       TIMESTAMP;
    BEGIN
        FOR i IN 0 .. p_lines.get_size - 1 LOOP
            l_line := TREAT(p_lines.get(i) AS JSON_OBJECT_T);

            -- Extract all values into local variables before the MERGE
            l_line_id                       := l_line.get_number('CustomerTransactionLineId');
            l_line_number                   := l_line.get_number('LineNumber');
            l_description                   := l_line.get_string('Description');
            l_item_number                   := l_line.get_string('ItemNumber');
            l_unit_of_measure               := l_line.get_string('UnitOfMeasure');
            l_warehouse                     := l_line.get_string('Warehouse');
            l_memo_line                     := l_line.get_string('MemoLine');
            l_quantity                      := l_line.get_number('Quantity');
            l_unit_selling_price            := l_line.get_number('UnitSellingPrice');
            l_line_amount                   := l_line.get_number('LineAmount');
            l_assessable_value              := l_line.get_number('AssessableValue');
            l_allocated_freight_amount      := l_line.get_number('AllocatedFreightAmount');
            l_sales_order                   := l_line.get_string('SalesOrder');
            l_sales_order_date              := TO_DATE(NULLIF(l_line.get_string('SalesOrderDate'), ''), 'YYYY-MM-DD');
            l_tax_classification_code       := l_line.get_string('TaxClassificationCode');
            l_tax_exemption_handling        := l_line.get_string('TaxExemptionHandling');
            l_accounting_rule               := l_line.get_string('AccountingRule');
            l_accounting_rule_duration      := l_line.get_number('AccountingRuleDuration');
            l_rule_start_date               := TO_DATE(NULLIF(l_line.get_string('RuleStartDate'), ''), 'YYYY-MM-DD');
            l_rule_end_date                 := TO_DATE(NULLIF(l_line.get_string('RuleEndDate'),   ''), 'YYYY-MM-DD');
            l_transaction_business_category := l_line.get_string('TransacationBusinessCategory');
            l_product_fiscal_classification := l_line.get_string('ProductFiscalClassification');
            l_product_category              := l_line.get_string('ProductCategory');
            l_product_type                  := l_line.get_string('ProductType');
            l_line_intended_use             := l_line.get_string('LineIntendedUse');
            l_fusion_created_by             := l_line.get_string('CreatedBy');
            l_fusion_creation_date          := TO_TIMESTAMP(REGEXP_REPLACE(NULLIF(l_line.get_string('CreationDate'),   ''), 'T', ' '), 'YYYY-MM-DD HH24:MI:SS');
            l_fusion_last_updated_by        := l_line.get_string('LastUpdatedBy');
            l_fusion_last_update_date       := TO_TIMESTAMP(REGEXP_REPLACE(NULLIF(l_line.get_string('LastUpdateDate'), ''), 'T', ' '), 'YYYY-MM-DD HH24:MI:SS');

            MERGE INTO RR_AR_INVOICE_LINES ln
            USING (SELECT l_line_id AS id FROM DUAL) src
            ON (ln.CUSTOMER_TRANSACTION_LINE_ID = src.id)
            WHEN MATCHED THEN UPDATE SET
                LINE_NUMBER                     = l_line_number,
                DESCRIPTION                     = l_description,
                ITEM_NUMBER                     = l_item_number,
                UNIT_OF_MEASURE                 = l_unit_of_measure,
                WAREHOUSE                       = l_warehouse,
                MEMO_LINE                       = l_memo_line,
                QUANTITY                        = l_quantity,
                UNIT_SELLING_PRICE              = l_unit_selling_price,
                LINE_AMOUNT                     = l_line_amount,
                ASSESSABLE_VALUE                = l_assessable_value,
                ALLOCATED_FREIGHT_AMOUNT        = l_allocated_freight_amount,
                SALES_ORDER                     = l_sales_order,
                SALES_ORDER_DATE                = l_sales_order_date,
                TAX_CLASSIFICATION_CODE         = l_tax_classification_code,
                TAX_EXEMPTION_HANDLING          = l_tax_exemption_handling,
                ACCOUNTING_RULE                 = l_accounting_rule,
                ACCOUNTING_RULE_DURATION        = l_accounting_rule_duration,
                RULE_START_DATE                 = l_rule_start_date,
                RULE_END_DATE                   = l_rule_end_date,
                TRANSACTION_BUSINESS_CATEGORY   = l_transaction_business_category,
                PRODUCT_FISCAL_CLASSIFICATION   = l_product_fiscal_classification,
                PRODUCT_CATEGORY                = l_product_category,
                PRODUCT_TYPE                    = l_product_type,
                LINE_INTENDED_USE               = l_line_intended_use,
                FUSION_CREATED_BY               = l_fusion_created_by,
                FUSION_CREATION_DATE            = l_fusion_creation_date,
                FUSION_LAST_UPDATED_BY          = l_fusion_last_updated_by,
                FUSION_LAST_UPDATE_DATE         = l_fusion_last_update_date,
                LAST_UPDATED_BY                 = USER,
                LAST_UPDATE_DATE                = SYSTIMESTAMP,
                SYNC_DATE                       = SYSTIMESTAMP,
                SYNC_STATUS                     = 'UPDATED'
            WHEN NOT MATCHED THEN INSERT (
                CUSTOMER_TRANSACTION_LINE_ID,   CUSTOMER_TRANSACTION_ID,        LINE_NUMBER,
                DESCRIPTION,                    ITEM_NUMBER,                    UNIT_OF_MEASURE,
                WAREHOUSE,                      MEMO_LINE,                      QUANTITY,
                UNIT_SELLING_PRICE,             LINE_AMOUNT,                    ASSESSABLE_VALUE,
                ALLOCATED_FREIGHT_AMOUNT,       SALES_ORDER,                    SALES_ORDER_DATE,
                TAX_CLASSIFICATION_CODE,        TAX_EXEMPTION_HANDLING,         ACCOUNTING_RULE,
                ACCOUNTING_RULE_DURATION,       RULE_START_DATE,                RULE_END_DATE,
                TRANSACTION_BUSINESS_CATEGORY,  PRODUCT_FISCAL_CLASSIFICATION,  PRODUCT_CATEGORY,
                PRODUCT_TYPE,                   LINE_INTENDED_USE,              FUSION_CREATED_BY,
                FUSION_CREATION_DATE,           FUSION_LAST_UPDATED_BY,         FUSION_LAST_UPDATE_DATE,
                SYNC_STATUS
            ) VALUES (
                l_line_id,                      p_transaction_id,               l_line_number,
                l_description,                  l_item_number,                  l_unit_of_measure,
                l_warehouse,                    l_memo_line,                    l_quantity,
                l_unit_selling_price,           l_line_amount,                  l_assessable_value,
                l_allocated_freight_amount,     l_sales_order,                  l_sales_order_date,
                l_tax_classification_code,      l_tax_exemption_handling,       l_accounting_rule,
                l_accounting_rule_duration,     l_rule_start_date,              l_rule_end_date,
                l_transaction_business_category, l_product_fiscal_classification, l_product_category,
                l_product_type,                 l_line_intended_use,            l_fusion_created_by,
                l_fusion_creation_date,         l_fusion_last_updated_by,       l_fusion_last_update_date,
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
        l_root        JSON_OBJECT_T;
        l_items       JSON_ARRAY_T;
        l_item        JSON_OBJECT_T;
        l_lines       JSON_ARRAY_T;
        l_err_msg     VARCHAR2(4000);
        l_last_err    VARCHAR2(4000);
        l_txn_id      NUMBER;
        l_error_log   VARCHAR2(32767) := '';
    BEGIN
        p_inserted := 0;
        p_updated  := 0;
        p_errors   := 0;

        l_root  := JSON_OBJECT_T.parse(p_invoices_json);
        l_items := l_root.get_array('items');

        FOR i IN 0 .. l_items.get_size - 1 LOOP
            BEGIN
                l_item   := TREAT(l_items.get(i) AS JSON_OBJECT_T);
                l_txn_id := l_item.get_number('CustomerTransactionId');
                upsert_header(l_item);

                IF l_item.has('lines') THEN
                    l_lines := l_item.get_array('lines');
                    upsert_lines(l_txn_id, l_lines);
                END IF;

                p_inserted := p_inserted + 1;
            EXCEPTION
                WHEN OTHERS THEN
                    l_err_msg  := SQLERRM;
                    l_last_err := 'TxnId=' || NVL(TO_CHAR(l_txn_id), '?') || ': ' || l_err_msg;
                    p_errors   := p_errors + 1;
                    -- Append to error log (first 3 errors)
                    IF p_errors <= 3 THEN
                        l_error_log := l_error_log || ' | [' || p_errors || '] ' || l_last_err;
                    END IF;
                    BEGIN
                        UPDATE RR_AR_INVOICE_HEADERS
                           SET SYNC_STATUS   = 'ERROR',
                               ERROR_MESSAGE = l_err_msg
                         WHERE CUSTOMER_TRANSACTION_ID = l_txn_id;
                    EXCEPTION WHEN OTHERS THEN NULL;
                    END;
            END;
        END LOOP;

        COMMIT;
        p_status  := 'SUCCESS';
        p_message := 'Bulk complete. Saved: ' || p_inserted || ', Errors: ' || p_errors
                     || CASE WHEN l_error_log IS NOT NULL THEN ' -- ERRORS:' || l_error_log ELSE '' END;
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
