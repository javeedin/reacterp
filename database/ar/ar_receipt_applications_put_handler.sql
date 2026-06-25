-- =====================================================
-- PUT /ar/receipt-applications/:appId
--
-- Updates an existing AR Receipt Application row
-- identified by APPLICATION_ID in the path.
--
-- Expected JSON body (all fields optional except those
-- used by the application logic):
-- {
--   "ApplicationDate":              "YYYY-MM-DD",
--   "AccountingDate":               "YYYY-MM-DD",
--   "ApplicationAmount":            12345.00,
--   "ApplicationStatus":            "APP",
--   "ActivityName":                 "Invoice",
--   "ProcessStatus":                "PENDING",
--   "IsLatestApplication":          "Y",
--   "ReferenceTransactionId":       9001,
--   "ReferenceTransactionNumber":   "INV-2024-001",
--   "ReferenceTransactionStatus":   "OP",
--   "ReferenceInstallmentId":       1,
--   "CustAccountId":                12345,
--   "CustomerSite":                 "SITE-001",
--   "ReceiptMethod":                "BANK TRANSFER",
--   "EnteredCurrency":              "AED"
-- }
-- =====================================================

BEGIN
    -- Remove old handler if exists
    BEGIN
        ORDS.DELETE_HANDLER(
            p_module_name => 'ar',
            p_pattern     => 'receipt-applications/:appId',
            p_method      => 'PUT'
        );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    COMMIT;
END;
/

BEGIN
    -- Create URI template if not exists
    BEGIN
        ORDS.DEFINE_TEMPLATE(
            p_module_name => 'ar',
            p_pattern     => 'receipt-applications/:appId',
            p_priority    => 0,
            p_etag_type   => 'HASH',
            p_comments    => 'Single AR receipt application by APPLICATION_ID'
        );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    COMMIT;
END;
/

BEGIN
    -- Define PUT handler
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'receipt-applications/:appId',
        p_method         => 'PUT',
        p_source_type    => 'plsql/block',
        p_items_per_page => 0,
        p_mimes_allowed  => 'application/json',
        p_comments       => 'Update an AR receipt application by APPLICATION_ID',
        p_source         => q'[
DECLARE
    l_body         CLOB;
    l_rows_updated NUMBER;
    l_app_id       NUMBER;

    -- helpers: return NULL instead of raising when a path is absent
    FUNCTION safe_varchar(p_path VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        RETURN APEX_JSON.get_varchar2(p_path => p_path);
    EXCEPTION WHEN OTHERS THEN RETURN NULL;
    END;

    FUNCTION safe_number(p_path VARCHAR2) RETURN NUMBER IS
    BEGIN
        RETURN APEX_JSON.get_number(p_path => p_path);
    EXCEPTION WHEN OTHERS THEN RETURN NULL;
    END;

    FUNCTION safe_date(p_path VARCHAR2) RETURN DATE IS
        l_val VARCHAR2(30);
    BEGIN
        l_val := APEX_JSON.get_varchar2(p_path => p_path);
        RETURN CASE WHEN l_val IS NULL THEN NULL
                    ELSE TO_DATE(SUBSTR(l_val,1,10), 'YYYY-MM-DD') END;
    EXCEPTION WHEN OTHERS THEN RETURN NULL;
    END;

BEGIN
    l_app_id := TO_NUMBER(:appId);
    l_body   := :body_text;
    APEX_JSON.parse(l_body);

    UPDATE RR_AR_RECEIPT_APPLICATIONS
    SET
        APPLICATION_DATE             = NVL(safe_date   ('ApplicationDate'),            APPLICATION_DATE),
        ACCOUNTING_DATE              = NVL(safe_date   ('AccountingDate'),             ACCOUNTING_DATE),
        APPLICATION_AMOUNT           = NVL(safe_number ('ApplicationAmount'),          APPLICATION_AMOUNT),
        APPLICATION_STATUS           = NVL(safe_varchar('ApplicationStatus'),          APPLICATION_STATUS),
        ACTIVITY_NAME                = NVL(safe_varchar('ActivityName'),               ACTIVITY_NAME),
        PROCESS_STATUS               = NVL(safe_varchar('ProcessStatus'),              PROCESS_STATUS),
        IS_LATEST_APPLICATION        = NVL(safe_varchar('IsLatestApplication'),        IS_LATEST_APPLICATION),
        REFERENCE_TRANSACTION_ID     = NVL(safe_number ('ReferenceTransactionId'),     REFERENCE_TRANSACTION_ID),
        REFERENCE_TRANSACTION_NUMBER = NVL(safe_varchar('ReferenceTransactionNumber'), REFERENCE_TRANSACTION_NUMBER),
        REFERENCE_TRANSACTION_STATUS = NVL(safe_varchar('ReferenceTransactionStatus'), REFERENCE_TRANSACTION_STATUS),
        REFERENCE_INSTALLMENT_ID     = NVL(safe_number ('ReferenceInstallmentId'),     REFERENCE_INSTALLMENT_ID),
        CUST_ACCOUNT_ID              = NVL(safe_number ('CustAccountId'),              CUST_ACCOUNT_ID),
        CUSTOMER_SITE                = NVL(safe_varchar('CustomerSite'),               CUSTOMER_SITE),
        RECEIPT_METHOD               = NVL(safe_varchar('ReceiptMethod'),              RECEIPT_METHOD),
        ENTERED_CURRENCY             = NVL(safe_varchar('EnteredCurrency'),            ENTERED_CURRENCY),
        FUSION_LAST_UPDATED_BY       = NVL(safe_varchar('LastUpdatedBy'),              FUSION_LAST_UPDATED_BY),
        FUSION_LAST_UPDATE_DATE      = SYSTIMESTAMP
    WHERE APPLICATION_ID = l_app_id;

    l_rows_updated := SQL%ROWCOUNT;

    IF l_rows_updated = 0 THEN
        :status := 404;
        HTP.p('{"status":"error","message":"Receipt application not found for ID ' || l_app_id || '"}');
    ELSE
        COMMIT;
        :status := 200;
        HTP.p('{"status":"success","message":"Receipt application updated successfully","application_id":' || l_app_id || ',"rows_updated":' || l_rows_updated || '}');
    END IF;

EXCEPTION
    WHEN VALUE_ERROR THEN
        ROLLBACK;
        :status := 400;
        HTP.p('{"status":"error","message":"Invalid application ID: ' || :appId || '"}');
    WHEN OTHERS THEN
        ROLLBACK;
        :status := 500;
        HTP.p('{"status":"error","message":"' || REPLACE(SQLERRM, '"', '''') || '"}');
END;
]'
    );
    COMMIT;
    DBMS_OUTPUT.PUT_LINE('PUT handler for ar/receipt-applications/:appId created successfully.');
END;
/

-- =====================================================
-- ENDPOINT SUMMARY
-- =====================================================
-- PUT {base}/ar/receipt-applications/:appId
--   Path param : appId  — APPLICATION_ID (NUMBER)
--   Body       : JSON object with any subset of updatable fields
--   Returns 200 on success, 404 if not found, 400 bad ID, 500 on error
-- =====================================================
