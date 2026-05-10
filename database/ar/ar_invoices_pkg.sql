-- =====================================================
-- AR Invoices PL/SQL Package
-- Uses JSON_VALUE (SQL function) for all field extraction
-- Avoids PL/SQL JSON_OBJECT_T.get_string() which can
-- silently return NULL in Autonomous DB APEX environments
-- =====================================================

CREATE OR REPLACE PACKAGE RR_AR_INVOICES_PKG AS

    PROCEDURE save_invoice (
        p_invoice_json  IN  CLOB,
        p_status        OUT VARCHAR2,
        p_message       OUT VARCHAR2
    );

    PROCEDURE save_invoices_bulk (
        p_invoices_json IN  CLOB,
        p_status        OUT VARCHAR2,
        p_message       OUT VARCHAR2,
        p_inserted      OUT NUMBER,
        p_updated       OUT NUMBER,
        p_errors        OUT NUMBER
    );

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
    -- Safe date: handles YYYY-MM-DD or ISO 8601
    -- -------------------------------------------------------
    FUNCTION to_safe_date (p_str IN VARCHAR2) RETURN DATE IS
    BEGIN
        IF p_str IS NULL OR TRIM(p_str) IS NULL THEN RETURN NULL; END IF;
        RETURN TO_DATE(SUBSTR(TRIM(p_str), 1, 10), 'YYYY-MM-DD');
    EXCEPTION WHEN OTHERS THEN RETURN NULL;
    END to_safe_date;

    -- -------------------------------------------------------
    -- Safe timestamp: handles 2024-01-15T10:30:00.123+00:00
    -- -------------------------------------------------------
    FUNCTION to_safe_ts (p_str IN VARCHAR2) RETURN TIMESTAMP IS
    BEGIN
        IF p_str IS NULL OR TRIM(p_str) IS NULL THEN RETURN NULL; END IF;
        RETURN TO_TIMESTAMP(
            SUBSTR(REPLACE(TRIM(p_str), 'T', ' '), 1, 19),
            'YYYY-MM-DD HH24:MI:SS'
        );
    EXCEPTION WHEN OTHERS THEN RETURN NULL;
    END to_safe_ts;

    -- -------------------------------------------------------
    -- Upsert one invoice header
    -- p_json  : single invoice object as CLOB
    -- Uses JSON_VALUE (SQL built-in) — no ORA-40573 risk
    -- Date/timestamp conversions done in PL/SQL DECLARE
    -- -------------------------------------------------------
    PROCEDURE upsert_header (p_json IN CLOB) IS
        -- PK
        l_id          NUMBER    := JSON_VALUE(p_json, '$.CustomerTransactionId' RETURNING NUMBER);
        -- Date fields — extracted in PL/SQL context to use to_safe_date/to_safe_ts
        l_txn_date    DATE      := to_safe_date(JSON_VALUE(p_json, '$.TransactionDate'));
        l_acct_date   DATE      := to_safe_date(JSON_VALUE(p_json, '$.AccountingDate'));
        l_due_date    DATE      := to_safe_date(JSON_VALUE(p_json, '$.DueDate'));
        l_bill_date   DATE      := to_safe_date(JSON_VALUE(p_json, '$.BillingDate'));
        l_ship_date   DATE      := to_safe_date(JSON_VALUE(p_json, '$.ShipDate'));
        l_conv_date   DATE      := to_safe_date(JSON_VALUE(p_json, '$.ConversionDate'));
        l_po_date     DATE      := to_safe_date(JSON_VALUE(p_json, '$.PurchaseOrderDate'));
        l_cr_ts       TIMESTAMP := to_safe_ts(JSON_VALUE(p_json, '$.CreationDate'));
        l_upd_ts      TIMESTAMP := to_safe_ts(JSON_VALUE(p_json, '$.LastUpdateDate'));
    BEGIN
        MERGE INTO RR_AR_INVOICE_HEADERS h
        USING DUAL
        ON (h.CUSTOMER_TRANSACTION_ID = l_id)
        WHEN MATCHED THEN UPDATE SET
            TRANSACTION_NUMBER       = JSON_VALUE(p_json, '$.TransactionNumber'),
            DOCUMENT_NUMBER          = JSON_VALUE(p_json, '$.DocumentNumber'             RETURNING NUMBER),
            CROSS_REFERENCE          = JSON_VALUE(p_json, '$.CrossReference'),
            TRANSACTION_DATE         = l_txn_date,
            ACCOUNTING_DATE          = l_acct_date,
            DUE_DATE                 = l_due_date,
            BILLING_DATE             = l_bill_date,
            SHIP_DATE                = l_ship_date,
            TRANSACTION_CLASS        = JSON_VALUE(p_json, '$.TransactionClass'),
            TRANSACTION_TYPE         = JSON_VALUE(p_json, '$.TransactionType'),
            TRANSACTION_SOURCE       = JSON_VALUE(p_json, '$.TransactionSource'),
            INVOICE_STATUS           = JSON_VALUE(p_json, '$.InvoiceStatus'),
            INVOICE_CURRENCY_CODE    = JSON_VALUE(p_json, '$.InvoiceCurrencyCode'),
            CONVERSION_RATE_TYPE     = JSON_VALUE(p_json, '$.ConversionRateType'),
            CONVERSION_DATE          = l_conv_date,
            CONVERSION_RATE          = JSON_VALUE(p_json, '$.ConversionRate'             RETURNING NUMBER),
            ENTERED_AMOUNT           = JSON_VALUE(p_json, '$.EnteredAmount'              RETURNING NUMBER),
            INVOICE_BALANCE_AMOUNT   = JSON_VALUE(p_json, '$.InvoiceBalanceAmount'       RETURNING NUMBER),
            FREIGHT_AMOUNT           = JSON_VALUE(p_json, '$.FreightAmount'              RETURNING NUMBER),
            BILL_TO_CUSTOMER_NUMBER  = JSON_VALUE(p_json, '$.BillToCustomerNumber'),
            BILL_TO_CUSTOMER_NAME    = JSON_VALUE(p_json, '$.BillToCustomerName'),
            BILL_TO_SITE             = JSON_VALUE(p_json, '$.BillToSite'),
            BILL_TO_CONTACT          = JSON_VALUE(p_json, '$.BillToContact'),
            BILL_TO_PARTY_ID         = JSON_VALUE(p_json, '$.BillToPartyId'              RETURNING NUMBER),
            SHIP_TO_CUSTOMER_NUMBER  = JSON_VALUE(p_json, '$.ShipToCustomerNumber'),
            SHIP_TO_CUSTOMER_NAME    = JSON_VALUE(p_json, '$.ShipToCustomerName'),
            SHIP_TO_SITE             = JSON_VALUE(p_json, '$.ShipToSite'),
            SHIP_TO_CONTACT          = JSON_VALUE(p_json, '$.ShipToContact'),
            PAYING_CUSTOMER_NAME     = JSON_VALUE(p_json, '$.PayingCustomerName'),
            PAYING_CUSTOMER_SITE     = JSON_VALUE(p_json, '$.PayingCustomerSite'),
            PAYING_CUSTOMER_ACCOUNT  = JSON_VALUE(p_json, '$.PayingCustomerAccount'),
            BUSINESS_UNIT            = JSON_VALUE(p_json, '$.BusinessUnit'),
            LEGAL_ENTITY_IDENTIFIER  = JSON_VALUE(p_json, '$.LegalEntityIdentifier'),
            PAYMENT_TERMS            = JSON_VALUE(p_json, '$.PaymentTerms'),
            RECEIPT_METHOD           = JSON_VALUE(p_json, '$.ReceiptMethod'),
            PURCHASE_ORDER           = JSON_VALUE(p_json, '$.PurchaseOrder'),
            PURCHASE_ORDER_DATE      = l_po_date,
            PURCHASE_ORDER_REVISION  = JSON_VALUE(p_json, '$.PurchaseOrderRevision'),
            CARRIER                  = JSON_VALUE(p_json, '$.Carrier'),
            SHIPPING_REFERENCE       = JSON_VALUE(p_json, '$.ShippingReference'),
            DEFAULT_TAXATION_COUNTRY = JSON_VALUE(p_json, '$.DefaultTaxationCountry'),
            FIRST_PARTY_REG_NUMBER   = JSON_VALUE(p_json, '$.FirstPartyRegistrationNumber'),
            THIRD_PARTY_REG_NUMBER   = JSON_VALUE(p_json, '$.ThirdPartyRegistrationNumber'),
            PREPAYMENT               = JSON_VALUE(p_json, '$.Prepayment'),
            INTERCOMPANY             = JSON_VALUE(p_json, '$.Intercompany'),
            PRINT_OPTION             = JSON_VALUE(p_json, '$.PrintOption'),
            SOLD_TO_PARTY_NUMBER     = JSON_VALUE(p_json, '$.SoldToPartyNumber'),
            REMIT_TO_ADDRESS         = JSON_VALUE(p_json, '$.RemitToAddress'),
            SALESPERSON_NUMBER       = JSON_VALUE(p_json, '$.SalesPersonNumber'),
            DELIVERY_METHOD          = JSON_VALUE(p_json, '$.DeliveryMethod'),
            EMAIL                    = JSON_VALUE(p_json, '$.Email'),
            SPECIAL_INSTRUCTIONS     = JSON_VALUE(p_json, '$.SpecialInstructions'),
            COMMENTS                 = JSON_VALUE(p_json, '$.Comments'),
            INTERNAL_NOTES           = JSON_VALUE(p_json, '$.InternalNotes'),
            INVOICING_RULE           = JSON_VALUE(p_json, '$.InvoicingRule'),
            FUSION_CREATED_BY        = JSON_VALUE(p_json, '$.CreatedBy'),
            FUSION_CREATION_DATE     = l_cr_ts,
            FUSION_LAST_UPDATED_BY   = JSON_VALUE(p_json, '$.LastUpdatedBy'),
            FUSION_LAST_UPDATE_DATE  = l_upd_ts,
            LAST_UPDATED_BY          = USER,
            LAST_UPDATE_DATE         = SYSTIMESTAMP,
            SYNC_DATE                = SYSTIMESTAMP,
            SYNC_STATUS              = 'UPDATED'
        WHEN NOT MATCHED THEN INSERT (
            CUSTOMER_TRANSACTION_ID,  TRANSACTION_NUMBER,       DOCUMENT_NUMBER,
            CROSS_REFERENCE,          TRANSACTION_DATE,          ACCOUNTING_DATE,
            DUE_DATE,                 BILLING_DATE,              SHIP_DATE,
            TRANSACTION_CLASS,        TRANSACTION_TYPE,          TRANSACTION_SOURCE,
            INVOICE_STATUS,           INVOICE_CURRENCY_CODE,     CONVERSION_RATE_TYPE,
            CONVERSION_DATE,          CONVERSION_RATE,           ENTERED_AMOUNT,
            INVOICE_BALANCE_AMOUNT,   FREIGHT_AMOUNT,            BILL_TO_CUSTOMER_NUMBER,
            BILL_TO_CUSTOMER_NAME,    BILL_TO_SITE,              BILL_TO_CONTACT,
            BILL_TO_PARTY_ID,         SHIP_TO_CUSTOMER_NUMBER,   SHIP_TO_CUSTOMER_NAME,
            SHIP_TO_SITE,             SHIP_TO_CONTACT,           PAYING_CUSTOMER_NAME,
            PAYING_CUSTOMER_SITE,     PAYING_CUSTOMER_ACCOUNT,   BUSINESS_UNIT,
            LEGAL_ENTITY_IDENTIFIER,  PAYMENT_TERMS,             RECEIPT_METHOD,
            PURCHASE_ORDER,           PURCHASE_ORDER_DATE,       PURCHASE_ORDER_REVISION,
            CARRIER,                  SHIPPING_REFERENCE,        DEFAULT_TAXATION_COUNTRY,
            FIRST_PARTY_REG_NUMBER,   THIRD_PARTY_REG_NUMBER,    PREPAYMENT,
            INTERCOMPANY,             PRINT_OPTION,              SOLD_TO_PARTY_NUMBER,
            REMIT_TO_ADDRESS,         SALESPERSON_NUMBER,        DELIVERY_METHOD,
            EMAIL,                    SPECIAL_INSTRUCTIONS,      COMMENTS,
            INTERNAL_NOTES,           INVOICING_RULE,            FUSION_CREATED_BY,
            FUSION_CREATION_DATE,     FUSION_LAST_UPDATED_BY,    FUSION_LAST_UPDATE_DATE,
            SYNC_STATUS
        ) VALUES (
            l_id,
            JSON_VALUE(p_json, '$.TransactionNumber'),
            JSON_VALUE(p_json, '$.DocumentNumber'             RETURNING NUMBER),
            JSON_VALUE(p_json, '$.CrossReference'),
            l_txn_date,   l_acct_date,  l_due_date,  l_bill_date,  l_ship_date,
            JSON_VALUE(p_json, '$.TransactionClass'),
            JSON_VALUE(p_json, '$.TransactionType'),
            JSON_VALUE(p_json, '$.TransactionSource'),
            JSON_VALUE(p_json, '$.InvoiceStatus'),
            JSON_VALUE(p_json, '$.InvoiceCurrencyCode'),
            JSON_VALUE(p_json, '$.ConversionRateType'),
            l_conv_date,
            JSON_VALUE(p_json, '$.ConversionRate'             RETURNING NUMBER),
            JSON_VALUE(p_json, '$.EnteredAmount'              RETURNING NUMBER),
            JSON_VALUE(p_json, '$.InvoiceBalanceAmount'       RETURNING NUMBER),
            JSON_VALUE(p_json, '$.FreightAmount'              RETURNING NUMBER),
            JSON_VALUE(p_json, '$.BillToCustomerNumber'),
            JSON_VALUE(p_json, '$.BillToCustomerName'),
            JSON_VALUE(p_json, '$.BillToSite'),
            JSON_VALUE(p_json, '$.BillToContact'),
            JSON_VALUE(p_json, '$.BillToPartyId'              RETURNING NUMBER),
            JSON_VALUE(p_json, '$.ShipToCustomerNumber'),
            JSON_VALUE(p_json, '$.ShipToCustomerName'),
            JSON_VALUE(p_json, '$.ShipToSite'),
            JSON_VALUE(p_json, '$.ShipToContact'),
            JSON_VALUE(p_json, '$.PayingCustomerName'),
            JSON_VALUE(p_json, '$.PayingCustomerSite'),
            JSON_VALUE(p_json, '$.PayingCustomerAccount'),
            JSON_VALUE(p_json, '$.BusinessUnit'),
            JSON_VALUE(p_json, '$.LegalEntityIdentifier'),
            JSON_VALUE(p_json, '$.PaymentTerms'),
            JSON_VALUE(p_json, '$.ReceiptMethod'),
            JSON_VALUE(p_json, '$.PurchaseOrder'),
            l_po_date,
            JSON_VALUE(p_json, '$.PurchaseOrderRevision'),
            JSON_VALUE(p_json, '$.Carrier'),
            JSON_VALUE(p_json, '$.ShippingReference'),
            JSON_VALUE(p_json, '$.DefaultTaxationCountry'),
            JSON_VALUE(p_json, '$.FirstPartyRegistrationNumber'),
            JSON_VALUE(p_json, '$.ThirdPartyRegistrationNumber'),
            JSON_VALUE(p_json, '$.Prepayment'),
            JSON_VALUE(p_json, '$.Intercompany'),
            JSON_VALUE(p_json, '$.PrintOption'),
            JSON_VALUE(p_json, '$.SoldToPartyNumber'),
            JSON_VALUE(p_json, '$.RemitToAddress'),
            JSON_VALUE(p_json, '$.SalesPersonNumber'),
            JSON_VALUE(p_json, '$.DeliveryMethod'),
            JSON_VALUE(p_json, '$.Email'),
            JSON_VALUE(p_json, '$.SpecialInstructions'),
            JSON_VALUE(p_json, '$.Comments'),
            JSON_VALUE(p_json, '$.InternalNotes'),
            JSON_VALUE(p_json, '$.InvoicingRule'),
            JSON_VALUE(p_json, '$.CreatedBy'),
            l_cr_ts,
            JSON_VALUE(p_json, '$.LastUpdatedBy'),
            l_upd_ts,
            'NEW'
        );
    END upsert_header;

    -- -------------------------------------------------------
    -- Upsert lines for a header
    -- Each line item comes in as a separate CLOB
    -- -------------------------------------------------------
    PROCEDURE upsert_one_line (p_transaction_id IN NUMBER, p_json IN CLOB) IS
        l_line_id  NUMBER := JSON_VALUE(p_json, '$.CustomerTransactionLineId' RETURNING NUMBER);
        l_so_date  DATE   := to_safe_date(JSON_VALUE(p_json, '$.SalesOrderDate'));
        l_rs_date  DATE   := to_safe_date(JSON_VALUE(p_json, '$.RuleStartDate'));
        l_re_date  DATE   := to_safe_date(JSON_VALUE(p_json, '$.RuleEndDate'));
        l_cr_ts    TIMESTAMP := to_safe_ts(JSON_VALUE(p_json, '$.CreationDate'));
        l_upd_ts   TIMESTAMP := to_safe_ts(JSON_VALUE(p_json, '$.LastUpdateDate'));
    BEGIN
        MERGE INTO RR_AR_INVOICE_LINES ln
        USING DUAL
        ON (ln.CUSTOMER_TRANSACTION_LINE_ID = l_line_id)
        WHEN MATCHED THEN UPDATE SET
            LINE_NUMBER                     = JSON_VALUE(p_json, '$.LineNumber'                    RETURNING NUMBER),
            DESCRIPTION                     = JSON_VALUE(p_json, '$.Description'),
            ITEM_NUMBER                     = JSON_VALUE(p_json, '$.ItemNumber'),
            UNIT_OF_MEASURE                 = JSON_VALUE(p_json, '$.UnitOfMeasure'),
            WAREHOUSE                       = JSON_VALUE(p_json, '$.Warehouse'),
            MEMO_LINE                       = JSON_VALUE(p_json, '$.MemoLine'),
            QUANTITY                        = JSON_VALUE(p_json, '$.Quantity'                      RETURNING NUMBER),
            UNIT_SELLING_PRICE              = JSON_VALUE(p_json, '$.UnitSellingPrice'              RETURNING NUMBER),
            LINE_AMOUNT                     = JSON_VALUE(p_json, '$.LineAmount'                    RETURNING NUMBER),
            ASSESSABLE_VALUE                = JSON_VALUE(p_json, '$.AssessableValue'               RETURNING NUMBER),
            ALLOCATED_FREIGHT_AMOUNT        = JSON_VALUE(p_json, '$.AllocatedFreightAmount'        RETURNING NUMBER),
            SALES_ORDER                     = JSON_VALUE(p_json, '$.SalesOrder'),
            SALES_ORDER_DATE                = l_so_date,
            TAX_CLASSIFICATION_CODE         = JSON_VALUE(p_json, '$.TaxClassificationCode'),
            TAX_EXEMPTION_HANDLING          = JSON_VALUE(p_json, '$.TaxExemptionHandling'),
            ACCOUNTING_RULE                 = JSON_VALUE(p_json, '$.AccountingRule'),
            ACCOUNTING_RULE_DURATION        = JSON_VALUE(p_json, '$.AccountingRuleDuration'        RETURNING NUMBER),
            RULE_START_DATE                 = l_rs_date,
            RULE_END_DATE                   = l_re_date,
            TRANSACTION_BUSINESS_CATEGORY   = JSON_VALUE(p_json, '$.TransactionBusinessCategory'),
            PRODUCT_FISCAL_CLASSIFICATION   = JSON_VALUE(p_json, '$.ProductFiscalClassification'),
            PRODUCT_CATEGORY                = JSON_VALUE(p_json, '$.ProductCategory'),
            PRODUCT_TYPE                    = JSON_VALUE(p_json, '$.ProductType'),
            LINE_INTENDED_USE               = JSON_VALUE(p_json, '$.LineIntendedUse'),
            FUSION_CREATED_BY               = JSON_VALUE(p_json, '$.CreatedBy'),
            FUSION_CREATION_DATE            = l_cr_ts,
            FUSION_LAST_UPDATED_BY          = JSON_VALUE(p_json, '$.LastUpdatedBy'),
            FUSION_LAST_UPDATE_DATE         = l_upd_ts,
            LAST_UPDATED_BY                 = USER,
            LAST_UPDATE_DATE                = SYSTIMESTAMP,
            SYNC_DATE                       = SYSTIMESTAMP,
            SYNC_STATUS                     = 'UPDATED'
        WHEN NOT MATCHED THEN INSERT (
            CUSTOMER_TRANSACTION_LINE_ID,  CUSTOMER_TRANSACTION_ID,       LINE_NUMBER,
            DESCRIPTION,                   ITEM_NUMBER,                   UNIT_OF_MEASURE,
            WAREHOUSE,                     MEMO_LINE,                     QUANTITY,
            UNIT_SELLING_PRICE,            LINE_AMOUNT,                   ASSESSABLE_VALUE,
            ALLOCATED_FREIGHT_AMOUNT,      SALES_ORDER,                   SALES_ORDER_DATE,
            TAX_CLASSIFICATION_CODE,       TAX_EXEMPTION_HANDLING,        ACCOUNTING_RULE,
            ACCOUNTING_RULE_DURATION,      RULE_START_DATE,               RULE_END_DATE,
            TRANSACTION_BUSINESS_CATEGORY, PRODUCT_FISCAL_CLASSIFICATION, PRODUCT_CATEGORY,
            PRODUCT_TYPE,                  LINE_INTENDED_USE,             FUSION_CREATED_BY,
            FUSION_CREATION_DATE,          FUSION_LAST_UPDATED_BY,        FUSION_LAST_UPDATE_DATE,
            SYNC_STATUS
        ) VALUES (
            l_line_id,                     p_transaction_id,
            JSON_VALUE(p_json, '$.LineNumber'                    RETURNING NUMBER),
            JSON_VALUE(p_json, '$.Description'),
            JSON_VALUE(p_json, '$.ItemNumber'),
            JSON_VALUE(p_json, '$.UnitOfMeasure'),
            JSON_VALUE(p_json, '$.Warehouse'),
            JSON_VALUE(p_json, '$.MemoLine'),
            JSON_VALUE(p_json, '$.Quantity'                      RETURNING NUMBER),
            JSON_VALUE(p_json, '$.UnitSellingPrice'              RETURNING NUMBER),
            JSON_VALUE(p_json, '$.LineAmount'                    RETURNING NUMBER),
            JSON_VALUE(p_json, '$.AssessableValue'               RETURNING NUMBER),
            JSON_VALUE(p_json, '$.AllocatedFreightAmount'        RETURNING NUMBER),
            JSON_VALUE(p_json, '$.SalesOrder'),                  l_so_date,
            JSON_VALUE(p_json, '$.TaxClassificationCode'),
            JSON_VALUE(p_json, '$.TaxExemptionHandling'),
            JSON_VALUE(p_json, '$.AccountingRule'),
            JSON_VALUE(p_json, '$.AccountingRuleDuration'        RETURNING NUMBER),
            l_rs_date,                     l_re_date,
            JSON_VALUE(p_json, '$.TransactionBusinessCategory'),
            JSON_VALUE(p_json, '$.ProductFiscalClassification'),
            JSON_VALUE(p_json, '$.ProductCategory'),
            JSON_VALUE(p_json, '$.ProductType'),
            JSON_VALUE(p_json, '$.LineIntendedUse'),
            JSON_VALUE(p_json, '$.CreatedBy'),
            l_cr_ts,
            JSON_VALUE(p_json, '$.LastUpdatedBy'),
            l_upd_ts,
            'NEW'
        );
    END upsert_one_line;

    -- -------------------------------------------------------
    -- save_invoice: single header JSON CLOB
    -- -------------------------------------------------------
    PROCEDURE save_invoice (
        p_invoice_json  IN  CLOB,
        p_status        OUT VARCHAR2,
        p_message       OUT VARCHAR2
    ) IS
        l_txn_id   NUMBER        := JSON_VALUE(p_invoice_json, '$.CustomerTransactionId' RETURNING NUMBER);
        l_txn_num  VARCHAR2(150) := JSON_VALUE(p_invoice_json, '$.TransactionNumber');
    BEGIN
        upsert_header(p_invoice_json);

        FOR rec IN (
            SELECT j.item_clob
            FROM JSON_TABLE(p_invoice_json, '$.lines[*]'
                COLUMNS (item_clob CLOB FORMAT JSON PATH '$')
            ) j
        ) LOOP
            upsert_one_line(l_txn_id, rec.item_clob);
        END LOOP;

        COMMIT;
        p_status  := 'SUCCESS';
        p_message := 'Invoice saved: ' || l_txn_num;
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            p_status  := 'ERROR';
            p_message := SQLERRM;
    END save_invoice;

    -- -------------------------------------------------------
    -- save_invoices_bulk: {"items":[...]} array of headers
    -- Uses JSON_TABLE (SQL function) to iterate items so that
    -- JSON key casing is preserved — JSON_OBJECT_T.to_clob()
    -- can normalize keys to lowercase in some Oracle versions.
    -- -------------------------------------------------------
    PROCEDURE save_invoices_bulk (
        p_invoices_json IN  CLOB,
        p_status        OUT VARCHAR2,
        p_message       OUT VARCHAR2,
        p_inserted      OUT NUMBER,
        p_updated       OUT NUMBER,
        p_errors        OUT NUMBER
    ) IS
        l_txn_id    NUMBER;
        l_err_msg   VARCHAR2(4000);
        l_error_log VARCHAR2(32767) := '';
    BEGIN
        p_inserted := 0;
        p_updated  := 0;
        p_errors   := 0;

        FOR rec IN (
            SELECT j.item_clob
            FROM JSON_TABLE(p_invoices_json, '$.items[*]'
                COLUMNS (item_clob CLOB FORMAT JSON PATH '$')
            ) j
        ) LOOP
            BEGIN
                l_txn_id := JSON_VALUE(rec.item_clob, '$.CustomerTransactionId' RETURNING NUMBER);
                upsert_header(rec.item_clob);
                p_inserted := p_inserted + 1;

            EXCEPTION
                WHEN OTHERS THEN
                    p_errors  := p_errors + 1;
                    l_err_msg := SUBSTR(SQLERRM, 1, 500);
                    IF p_errors <= 3 THEN
                        l_error_log := l_error_log ||
                            ' | [' || p_errors || '] TxnId=' ||
                            NVL(TO_CHAR(l_txn_id), '?') || ': ' || l_err_msg;
                    END IF;
            END;
        END LOOP;

        COMMIT;
        p_status  := 'SUCCESS';
        p_message := 'Bulk complete. Saved: ' || p_inserted ||
                     ', Errors: ' || p_errors ||
                     CASE WHEN l_error_log IS NOT NULL
                          THEN ' -- ERRORS:' || l_error_log ELSE '' END;
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            p_status  := 'ERROR';
            p_message := SQLERRM;
    END save_invoices_bulk;

    -- -------------------------------------------------------
    -- save_invoice_lines: {"items":[...]} array of lines
    -- Uses JSON_TABLE to preserve key casing (same reason as bulk)
    -- -------------------------------------------------------
    PROCEDURE save_invoice_lines (
        p_transaction_id  IN  NUMBER,
        p_lines_json      IN  CLOB,
        p_status          OUT VARCHAR2,
        p_message         OUT VARCHAR2
    ) IS
        l_inserted  NUMBER := 0;
        l_errors    NUMBER := 0;
        l_err_log   VARCHAR2(4000) := '';
    BEGIN
        FOR rec IN (
            SELECT j.item_clob
            FROM JSON_TABLE(p_lines_json, '$.items[*]'
                COLUMNS (item_clob CLOB FORMAT JSON PATH '$')
            ) j
        ) LOOP
            BEGIN
                upsert_one_line(p_transaction_id, rec.item_clob);
                l_inserted := l_inserted + 1;
            EXCEPTION
                WHEN OTHERS THEN
                    l_errors  := l_errors + 1;
                    IF l_errors <= 3 THEN
                        l_err_log := l_err_log || ' | [' || l_errors || '] ' || SUBSTR(SQLERRM, 1, 200);
                    END IF;
            END;
        END LOOP;

        COMMIT;
        p_status  := 'SUCCESS';
        p_message := 'Lines saved: ' || l_inserted || ', Errors: ' || l_errors ||
                     CASE WHEN l_err_log IS NOT NULL THEN ' -- ' || l_err_log ELSE '' END;
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            p_status  := 'ERROR';
            p_message := SQLERRM;
    END save_invoice_lines;

END RR_AR_INVOICES_PKG;
/
