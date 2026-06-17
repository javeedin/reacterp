-- =====================================================
-- AR Lookups (Payment Terms, Txn Sources, Txn Types,
--             Memo Lines, Revenue Scheduling Rules)
-- Tables  : RR_AR_PAYMENT_TERMS, RR_AR_TXN_SOURCES,
--           RR_AR_TXN_TYPES, RR_AR_MEMO_LINES,
--           RR_AR_REVENUE_SCHED_RULES
-- Module  : ar
-- =====================================================

-- =====================================================
-- 1. Tables
-- =====================================================

CREATE TABLE RR_AR_PAYMENT_TERMS (
    PAYMENT_TERMS_ID  NUMBER PRIMARY KEY,
    NAME              VARCHAR2(240),
    DESCRIPTION       VARCHAR2(500),
    SET_NAME          VARCHAR2(100),
    SYNC_DATE         TIMESTAMP DEFAULT SYSTIMESTAMP
);
COMMENT ON TABLE RR_AR_PAYMENT_TERMS IS 'AR Payment Terms synced from Fusion paymentTermsLOV';

CREATE TABLE RR_AR_TXN_SOURCES (
    TRANSACTION_SOURCE_ID  NUMBER PRIMARY KEY,
    NAME                   VARCHAR2(240),
    DESCRIPTION            VARCHAR2(500),
    SET_NAME               VARCHAR2(100),
    SYNC_DATE              TIMESTAMP DEFAULT SYSTIMESTAMP
);
COMMENT ON TABLE RR_AR_TXN_SOURCES IS 'AR Transaction Sources synced from Fusion transactionSourcesLOV';

CREATE TABLE RR_AR_TXN_TYPES (
    TRANSACTION_TYPE_ID  NUMBER PRIMARY KEY,
    NAME                 VARCHAR2(240),
    DESCRIPTION          VARCHAR2(500),
    SET_NAME             VARCHAR2(100),
    SYNC_DATE            TIMESTAMP DEFAULT SYSTIMESTAMP
);
COMMENT ON TABLE RR_AR_TXN_TYPES IS 'AR Transaction Types synced from Fusion transactionTypesLOV';

CREATE TABLE RR_AR_MEMO_LINES (
    MEMO_LINE_ID           NUMBER PRIMARY KEY,
    NAME                   VARCHAR2(240),
    DESCRIPTION            VARCHAR2(500),
    TAX_CODE               VARCHAR2(100),
    TAX_PRODUCT_CATEGORY   VARCHAR2(100),
    UOM_CODE               VARCHAR2(30),
    SET_NAME               VARCHAR2(100),
    SYNC_DATE              TIMESTAMP DEFAULT SYSTIMESTAMP
);
COMMENT ON TABLE RR_AR_MEMO_LINES IS 'AR Memo Lines synced from Fusion memoLinesLOV';

CREATE TABLE RR_AR_REVENUE_SCHED_RULES (
    RULE_ID      NUMBER PRIMARY KEY,
    NAME         VARCHAR2(240),
    DESCRIPTION  VARCHAR2(500),
    SET_NAME     VARCHAR2(100),
    TYPE         VARCHAR2(50),
    OCCURRENCES  NUMBER,
    STATUS       VARCHAR2(10),
    SYNC_DATE    TIMESTAMP DEFAULT SYSTIMESTAMP
);
COMMENT ON TABLE RR_AR_REVENUE_SCHED_RULES IS 'AR Revenue Scheduling Rules synced from Fusion revenueSchedulingRulesLOV';

-- =====================================================
-- 2. ORDS: ar/payment-terms/bulk
-- =====================================================
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ar', p_pattern => 'payment-terms/bulk');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ar',
        p_pattern     => 'payment-terms/bulk',
        p_comments    => 'Bulk upsert AR Payment Terms'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'payment-terms/bulk',
        p_method         => 'POST',
        p_source_type    => 'plsql/block',
        p_mimes_allowed  => 'application/json',
        p_comments       => 'Bulk upsert AR Payment Terms from Fusion paymentTermsLOV',
        p_source         => q'[
DECLARE
    l_body       CLOB;
    l_items      JSON_ARRAY_T;
    l_item       JSON_OBJECT_T;
    l_inserted   NUMBER := 0;
    l_updated    NUMBER := 0;
    l_errors     NUMBER := 0;
    l_error_msgs VARCHAR2(4000) := '';
    v_dest_off   INTEGER := 1;
    v_src_off    INTEGER := 1;
    v_lang_ctx   INTEGER := DBMS_LOB.DEFAULT_LANG_CTX;
    v_warning    INTEGER;
    v_exists     NUMBER;

    v_id          NUMBER;
    v_name        VARCHAR2(240);
    v_description VARCHAR2(500);
    v_set_name    VARCHAR2(100);

    FUNCTION safe_str(p_obj JSON_OBJECT_T, p_key VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        IF p_obj.has(p_key) AND NOT p_obj.get(p_key).is_null THEN
            RETURN p_obj.get_string(p_key);
        END IF;
        RETURN NULL;
    END;

    FUNCTION safe_num(p_obj JSON_OBJECT_T, p_key VARCHAR2) RETURN NUMBER IS
    BEGIN
        IF p_obj.has(p_key) AND NOT p_obj.get(p_key).is_null THEN
            RETURN p_obj.get_number(p_key);
        END IF;
        RETURN NULL;
    END;

BEGIN
    DBMS_LOB.CREATETEMPORARY(l_body, TRUE);
    DBMS_LOB.CONVERTTOCLOB(
        l_body, :body, DBMS_LOB.LOBMAXSIZE,
        v_dest_off, v_src_off,
        NLS_CHARSET_ID('AL32UTF8'), v_lang_ctx, v_warning
    );

    l_items := JSON_ARRAY_T(JSON_OBJECT_T.PARSE(l_body).get_array('items'));

    FOR i IN 0 .. l_items.get_size() - 1 LOOP
        BEGIN
            l_item        := JSON_OBJECT_T(l_items.get(i));
            v_id          := safe_num(l_item, 'PaymentTermsId');
            v_name        := safe_str(l_item, 'Name');
            v_description := safe_str(l_item, 'Description');
            v_set_name    := safe_str(l_item, 'SetName');

            SELECT COUNT(*) INTO v_exists FROM RR_AR_PAYMENT_TERMS WHERE PAYMENT_TERMS_ID = v_id;

            MERGE INTO RR_AR_PAYMENT_TERMS d
            USING (SELECT v_id AS id FROM DUAL) s ON (d.PAYMENT_TERMS_ID = s.id)
            WHEN MATCHED THEN UPDATE SET
                NAME        = v_name,
                DESCRIPTION = v_description,
                SET_NAME    = v_set_name,
                SYNC_DATE   = SYSTIMESTAMP
            WHEN NOT MATCHED THEN INSERT (
                PAYMENT_TERMS_ID, NAME, DESCRIPTION, SET_NAME, SYNC_DATE
            ) VALUES (
                v_id, v_name, v_description, v_set_name, SYSTIMESTAMP
            );

            IF v_exists > 0 THEN l_updated  := l_updated  + 1;
            ELSE                  l_inserted := l_inserted + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            l_errors := l_errors + 1;
            IF LENGTH(l_error_msgs) < 3500 THEN
                l_error_msgs := l_error_msgs || 'Row ' || i || ': ' || SUBSTR(SQLERRM,1,200) || '; ';
            END IF;
        END;
    END LOOP;

    COMMIT;
    :status_code := CASE WHEN l_errors = 0 THEN 201 ELSE 207 END;
    HTP.P('{"status":"' || CASE WHEN l_errors = 0 THEN 'SUCCESS' ELSE 'PARTIAL' END || '"' ||
          ',"inserted":' || l_inserted ||
          ',"updated":'  || l_updated  ||
          ',"errors":'   || l_errors   ||
          CASE WHEN l_error_msgs IS NOT NULL
               THEN ',"errorDetail":"' || REPLACE(l_error_msgs, '"', '\"') || '"'
               ELSE '' END || '}');
EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    :status_code := 500;
    HTP.P('{"status":"ERROR","message":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;]'
    );
    COMMIT;
END;
/

-- =====================================================
-- 3. ORDS: GET ar/payment-terms
-- =====================================================
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ar', p_pattern => 'payment-terms');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ar',
        p_pattern     => 'payment-terms',
        p_comments    => 'List AR Payment Terms'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'payment-terms',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 500,
        p_comments       => 'Fetch all AR Payment Terms',
        p_source         => '
SELECT PAYMENT_TERMS_ID, NAME, DESCRIPTION, SET_NAME, SYNC_DATE
FROM RR_AR_PAYMENT_TERMS
ORDER BY NAME'
    );
    COMMIT;
END;
/

-- =====================================================
-- 4. ORDS: ar/txn-sources/bulk
-- =====================================================
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ar', p_pattern => 'txn-sources/bulk');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ar',
        p_pattern     => 'txn-sources/bulk',
        p_comments    => 'Bulk upsert AR Transaction Sources'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'txn-sources/bulk',
        p_method         => 'POST',
        p_source_type    => 'plsql/block',
        p_mimes_allowed  => 'application/json',
        p_comments       => 'Bulk upsert AR Transaction Sources from Fusion transactionSourcesLOV',
        p_source         => q'[
DECLARE
    l_body       CLOB;
    l_items      JSON_ARRAY_T;
    l_item       JSON_OBJECT_T;
    l_inserted   NUMBER := 0;
    l_updated    NUMBER := 0;
    l_errors     NUMBER := 0;
    l_error_msgs VARCHAR2(4000) := '';
    v_dest_off   INTEGER := 1;
    v_src_off    INTEGER := 1;
    v_lang_ctx   INTEGER := DBMS_LOB.DEFAULT_LANG_CTX;
    v_warning    INTEGER;
    v_exists     NUMBER;

    v_id          NUMBER;
    v_name        VARCHAR2(240);
    v_description VARCHAR2(500);
    v_set_name    VARCHAR2(100);

    FUNCTION safe_str(p_obj JSON_OBJECT_T, p_key VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        IF p_obj.has(p_key) AND NOT p_obj.get(p_key).is_null THEN
            RETURN p_obj.get_string(p_key);
        END IF;
        RETURN NULL;
    END;

    FUNCTION safe_num(p_obj JSON_OBJECT_T, p_key VARCHAR2) RETURN NUMBER IS
    BEGIN
        IF p_obj.has(p_key) AND NOT p_obj.get(p_key).is_null THEN
            RETURN p_obj.get_number(p_key);
        END IF;
        RETURN NULL;
    END;

BEGIN
    DBMS_LOB.CREATETEMPORARY(l_body, TRUE);
    DBMS_LOB.CONVERTTOCLOB(
        l_body, :body, DBMS_LOB.LOBMAXSIZE,
        v_dest_off, v_src_off,
        NLS_CHARSET_ID('AL32UTF8'), v_lang_ctx, v_warning
    );

    l_items := JSON_ARRAY_T(JSON_OBJECT_T.PARSE(l_body).get_array('items'));

    FOR i IN 0 .. l_items.get_size() - 1 LOOP
        BEGIN
            l_item        := JSON_OBJECT_T(l_items.get(i));
            v_id          := safe_num(l_item, 'TransactionSourceId');
            v_name        := safe_str(l_item, 'Name');
            v_description := safe_str(l_item, 'Description');
            v_set_name    := safe_str(l_item, 'SetName');

            SELECT COUNT(*) INTO v_exists FROM RR_AR_TXN_SOURCES WHERE TRANSACTION_SOURCE_ID = v_id;

            MERGE INTO RR_AR_TXN_SOURCES d
            USING (SELECT v_id AS id FROM DUAL) s ON (d.TRANSACTION_SOURCE_ID = s.id)
            WHEN MATCHED THEN UPDATE SET
                NAME        = v_name,
                DESCRIPTION = v_description,
                SET_NAME    = v_set_name,
                SYNC_DATE   = SYSTIMESTAMP
            WHEN NOT MATCHED THEN INSERT (
                TRANSACTION_SOURCE_ID, NAME, DESCRIPTION, SET_NAME, SYNC_DATE
            ) VALUES (
                v_id, v_name, v_description, v_set_name, SYSTIMESTAMP
            );

            IF v_exists > 0 THEN l_updated  := l_updated  + 1;
            ELSE                  l_inserted := l_inserted + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            l_errors := l_errors + 1;
            IF LENGTH(l_error_msgs) < 3500 THEN
                l_error_msgs := l_error_msgs || 'Row ' || i || ': ' || SUBSTR(SQLERRM,1,200) || '; ';
            END IF;
        END;
    END LOOP;

    COMMIT;
    :status_code := CASE WHEN l_errors = 0 THEN 201 ELSE 207 END;
    HTP.P('{"status":"' || CASE WHEN l_errors = 0 THEN 'SUCCESS' ELSE 'PARTIAL' END || '"' ||
          ',"inserted":' || l_inserted ||
          ',"updated":'  || l_updated  ||
          ',"errors":'   || l_errors   ||
          CASE WHEN l_error_msgs IS NOT NULL
               THEN ',"errorDetail":"' || REPLACE(l_error_msgs, '"', '\"') || '"'
               ELSE '' END || '}');
EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    :status_code := 500;
    HTP.P('{"status":"ERROR","message":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;]'
    );
    COMMIT;
END;
/

-- =====================================================
-- 5. ORDS: GET ar/txn-sources
-- =====================================================
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ar', p_pattern => 'txn-sources');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ar',
        p_pattern     => 'txn-sources',
        p_comments    => 'List AR Transaction Sources'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'txn-sources',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 500,
        p_comments       => 'Fetch all AR Transaction Sources',
        p_source         => '
SELECT TRANSACTION_SOURCE_ID, NAME, DESCRIPTION, SET_NAME, SYNC_DATE
FROM RR_AR_TXN_SOURCES
ORDER BY NAME'
    );
    COMMIT;
END;
/

-- =====================================================
-- 6. ORDS: ar/txn-types/bulk
-- =====================================================
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ar', p_pattern => 'txn-types/bulk');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ar',
        p_pattern     => 'txn-types/bulk',
        p_comments    => 'Bulk upsert AR Transaction Types'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'txn-types/bulk',
        p_method         => 'POST',
        p_source_type    => 'plsql/block',
        p_mimes_allowed  => 'application/json',
        p_comments       => 'Bulk upsert AR Transaction Types from Fusion transactionTypesLOV',
        p_source         => q'[
DECLARE
    l_body       CLOB;
    l_items      JSON_ARRAY_T;
    l_item       JSON_OBJECT_T;
    l_inserted   NUMBER := 0;
    l_updated    NUMBER := 0;
    l_errors     NUMBER := 0;
    l_error_msgs VARCHAR2(4000) := '';
    v_dest_off   INTEGER := 1;
    v_src_off    INTEGER := 1;
    v_lang_ctx   INTEGER := DBMS_LOB.DEFAULT_LANG_CTX;
    v_warning    INTEGER;
    v_exists     NUMBER;

    v_id          NUMBER;
    v_name        VARCHAR2(240);
    v_description VARCHAR2(500);
    v_set_name    VARCHAR2(100);

    FUNCTION safe_str(p_obj JSON_OBJECT_T, p_key VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        IF p_obj.has(p_key) AND NOT p_obj.get(p_key).is_null THEN
            RETURN p_obj.get_string(p_key);
        END IF;
        RETURN NULL;
    END;

    FUNCTION safe_num(p_obj JSON_OBJECT_T, p_key VARCHAR2) RETURN NUMBER IS
    BEGIN
        IF p_obj.has(p_key) AND NOT p_obj.get(p_key).is_null THEN
            RETURN p_obj.get_number(p_key);
        END IF;
        RETURN NULL;
    END;

BEGIN
    DBMS_LOB.CREATETEMPORARY(l_body, TRUE);
    DBMS_LOB.CONVERTTOCLOB(
        l_body, :body, DBMS_LOB.LOBMAXSIZE,
        v_dest_off, v_src_off,
        NLS_CHARSET_ID('AL32UTF8'), v_lang_ctx, v_warning
    );

    l_items := JSON_ARRAY_T(JSON_OBJECT_T.PARSE(l_body).get_array('items'));

    FOR i IN 0 .. l_items.get_size() - 1 LOOP
        BEGIN
            l_item        := JSON_OBJECT_T(l_items.get(i));
            v_id          := safe_num(l_item, 'TransactionTypeId');
            v_name        := safe_str(l_item, 'Name');
            v_description := safe_str(l_item, 'Description');
            v_set_name    := safe_str(l_item, 'SetName');

            SELECT COUNT(*) INTO v_exists FROM RR_AR_TXN_TYPES WHERE TRANSACTION_TYPE_ID = v_id;

            MERGE INTO RR_AR_TXN_TYPES d
            USING (SELECT v_id AS id FROM DUAL) s ON (d.TRANSACTION_TYPE_ID = s.id)
            WHEN MATCHED THEN UPDATE SET
                NAME        = v_name,
                DESCRIPTION = v_description,
                SET_NAME    = v_set_name,
                SYNC_DATE   = SYSTIMESTAMP
            WHEN NOT MATCHED THEN INSERT (
                TRANSACTION_TYPE_ID, NAME, DESCRIPTION, SET_NAME, SYNC_DATE
            ) VALUES (
                v_id, v_name, v_description, v_set_name, SYSTIMESTAMP
            );

            IF v_exists > 0 THEN l_updated  := l_updated  + 1;
            ELSE                  l_inserted := l_inserted + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            l_errors := l_errors + 1;
            IF LENGTH(l_error_msgs) < 3500 THEN
                l_error_msgs := l_error_msgs || 'Row ' || i || ': ' || SUBSTR(SQLERRM,1,200) || '; ';
            END IF;
        END;
    END LOOP;

    COMMIT;
    :status_code := CASE WHEN l_errors = 0 THEN 201 ELSE 207 END;
    HTP.P('{"status":"' || CASE WHEN l_errors = 0 THEN 'SUCCESS' ELSE 'PARTIAL' END || '"' ||
          ',"inserted":' || l_inserted ||
          ',"updated":'  || l_updated  ||
          ',"errors":'   || l_errors   ||
          CASE WHEN l_error_msgs IS NOT NULL
               THEN ',"errorDetail":"' || REPLACE(l_error_msgs, '"', '\"') || '"'
               ELSE '' END || '}');
EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    :status_code := 500;
    HTP.P('{"status":"ERROR","message":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;]'
    );
    COMMIT;
END;
/

-- =====================================================
-- 7. ORDS: GET ar/txn-types
-- =====================================================
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ar', p_pattern => 'txn-types');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ar',
        p_pattern     => 'txn-types',
        p_comments    => 'List AR Transaction Types'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'txn-types',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 500,
        p_comments       => 'Fetch all AR Transaction Types',
        p_source         => '
SELECT TRANSACTION_TYPE_ID, NAME, DESCRIPTION, SET_NAME, SYNC_DATE
FROM RR_AR_TXN_TYPES
ORDER BY NAME'
    );
    COMMIT;
END;
/

-- =====================================================
-- 8. ORDS: ar/memo-lines/bulk
-- =====================================================
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ar', p_pattern => 'memo-lines/bulk');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ar',
        p_pattern     => 'memo-lines/bulk',
        p_comments    => 'Bulk upsert AR Memo Lines'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'memo-lines/bulk',
        p_method         => 'POST',
        p_source_type    => 'plsql/block',
        p_mimes_allowed  => 'application/json',
        p_comments       => 'Bulk upsert AR Memo Lines from Fusion memoLinesLOV',
        p_source         => q'[
DECLARE
    l_body       CLOB;
    l_items      JSON_ARRAY_T;
    l_item       JSON_OBJECT_T;
    l_inserted   NUMBER := 0;
    l_updated    NUMBER := 0;
    l_errors     NUMBER := 0;
    l_error_msgs VARCHAR2(4000) := '';
    v_dest_off   INTEGER := 1;
    v_src_off    INTEGER := 1;
    v_lang_ctx   INTEGER := DBMS_LOB.DEFAULT_LANG_CTX;
    v_warning    INTEGER;
    v_exists     NUMBER;

    v_id                   NUMBER;
    v_name                 VARCHAR2(240);
    v_description          VARCHAR2(500);
    v_tax_code             VARCHAR2(100);
    v_tax_product_category VARCHAR2(100);
    v_uom_code             VARCHAR2(30);
    v_set_name             VARCHAR2(100);

    FUNCTION safe_str(p_obj JSON_OBJECT_T, p_key VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        IF p_obj.has(p_key) AND NOT p_obj.get(p_key).is_null THEN
            RETURN p_obj.get_string(p_key);
        END IF;
        RETURN NULL;
    END;

    FUNCTION safe_num(p_obj JSON_OBJECT_T, p_key VARCHAR2) RETURN NUMBER IS
    BEGIN
        IF p_obj.has(p_key) AND NOT p_obj.get(p_key).is_null THEN
            RETURN p_obj.get_number(p_key);
        END IF;
        RETURN NULL;
    END;

BEGIN
    DBMS_LOB.CREATETEMPORARY(l_body, TRUE);
    DBMS_LOB.CONVERTTOCLOB(
        l_body, :body, DBMS_LOB.LOBMAXSIZE,
        v_dest_off, v_src_off,
        NLS_CHARSET_ID('AL32UTF8'), v_lang_ctx, v_warning
    );

    l_items := JSON_ARRAY_T(JSON_OBJECT_T.PARSE(l_body).get_array('items'));

    FOR i IN 0 .. l_items.get_size() - 1 LOOP
        BEGIN
            l_item                   := JSON_OBJECT_T(l_items.get(i));
            v_id                     := safe_num(l_item, 'MemoLineId');
            v_name                   := safe_str(l_item, 'Name');
            v_description            := safe_str(l_item, 'Description');
            v_tax_code               := safe_str(l_item, 'TaxCode');
            v_tax_product_category   := safe_str(l_item, 'TaxProductCategory');
            v_uom_code               := safe_str(l_item, 'UOMCode');
            v_set_name               := safe_str(l_item, 'SetName');

            SELECT COUNT(*) INTO v_exists FROM RR_AR_MEMO_LINES WHERE MEMO_LINE_ID = v_id;

            MERGE INTO RR_AR_MEMO_LINES d
            USING (SELECT v_id AS id FROM DUAL) s ON (d.MEMO_LINE_ID = s.id)
            WHEN MATCHED THEN UPDATE SET
                NAME                 = v_name,
                DESCRIPTION          = v_description,
                TAX_CODE             = v_tax_code,
                TAX_PRODUCT_CATEGORY = v_tax_product_category,
                UOM_CODE             = v_uom_code,
                SET_NAME             = v_set_name,
                SYNC_DATE            = SYSTIMESTAMP
            WHEN NOT MATCHED THEN INSERT (
                MEMO_LINE_ID, NAME, DESCRIPTION,
                TAX_CODE, TAX_PRODUCT_CATEGORY, UOM_CODE, SET_NAME, SYNC_DATE
            ) VALUES (
                v_id, v_name, v_description,
                v_tax_code, v_tax_product_category, v_uom_code, v_set_name, SYSTIMESTAMP
            );

            IF v_exists > 0 THEN l_updated  := l_updated  + 1;
            ELSE                  l_inserted := l_inserted + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            l_errors := l_errors + 1;
            IF LENGTH(l_error_msgs) < 3500 THEN
                l_error_msgs := l_error_msgs || 'Row ' || i || ': ' || SUBSTR(SQLERRM,1,200) || '; ';
            END IF;
        END;
    END LOOP;

    COMMIT;
    :status_code := CASE WHEN l_errors = 0 THEN 201 ELSE 207 END;
    HTP.P('{"status":"' || CASE WHEN l_errors = 0 THEN 'SUCCESS' ELSE 'PARTIAL' END || '"' ||
          ',"inserted":' || l_inserted ||
          ',"updated":'  || l_updated  ||
          ',"errors":'   || l_errors   ||
          CASE WHEN l_error_msgs IS NOT NULL
               THEN ',"errorDetail":"' || REPLACE(l_error_msgs, '"', '\"') || '"'
               ELSE '' END || '}');
EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    :status_code := 500;
    HTP.P('{"status":"ERROR","message":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;]'
    );
    COMMIT;
END;
/

-- =====================================================
-- 9. ORDS: GET ar/memo-lines
-- =====================================================
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ar', p_pattern => 'memo-lines');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ar',
        p_pattern     => 'memo-lines',
        p_comments    => 'List AR Memo Lines'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'memo-lines',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 500,
        p_comments       => 'Fetch all AR Memo Lines',
        p_source         => '
SELECT MEMO_LINE_ID, NAME, DESCRIPTION, TAX_CODE, TAX_PRODUCT_CATEGORY, UOM_CODE, SET_NAME, SYNC_DATE
FROM RR_AR_MEMO_LINES
ORDER BY NAME'
    );
    COMMIT;
END;
/

-- =====================================================
-- 10. ORDS: ar/revenue-sched-rules/bulk
-- =====================================================
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ar', p_pattern => 'revenue-sched-rules/bulk');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ar',
        p_pattern     => 'revenue-sched-rules/bulk',
        p_comments    => 'Bulk upsert AR Revenue Scheduling Rules'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'revenue-sched-rules/bulk',
        p_method         => 'POST',
        p_source_type    => 'plsql/block',
        p_mimes_allowed  => 'application/json',
        p_comments       => 'Bulk upsert AR Revenue Scheduling Rules from Fusion revenueSchedulingRulesLOV',
        p_source         => q'[
DECLARE
    l_body       CLOB;
    l_items      JSON_ARRAY_T;
    l_item       JSON_OBJECT_T;
    l_inserted   NUMBER := 0;
    l_updated    NUMBER := 0;
    l_errors     NUMBER := 0;
    l_error_msgs VARCHAR2(4000) := '';
    v_dest_off   INTEGER := 1;
    v_src_off    INTEGER := 1;
    v_lang_ctx   INTEGER := DBMS_LOB.DEFAULT_LANG_CTX;
    v_warning    INTEGER;
    v_exists     NUMBER;

    v_id          NUMBER;
    v_name        VARCHAR2(240);
    v_description VARCHAR2(500);
    v_set_name    VARCHAR2(100);
    v_type        VARCHAR2(50);
    v_occurrences NUMBER;
    v_status      VARCHAR2(10);

    FUNCTION safe_str(p_obj JSON_OBJECT_T, p_key VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        IF p_obj.has(p_key) AND NOT p_obj.get(p_key).is_null THEN
            RETURN p_obj.get_string(p_key);
        END IF;
        RETURN NULL;
    END;

    FUNCTION safe_num(p_obj JSON_OBJECT_T, p_key VARCHAR2) RETURN NUMBER IS
    BEGIN
        IF p_obj.has(p_key) AND NOT p_obj.get(p_key).is_null THEN
            RETURN p_obj.get_number(p_key);
        END IF;
        RETURN NULL;
    END;

BEGIN
    DBMS_LOB.CREATETEMPORARY(l_body, TRUE);
    DBMS_LOB.CONVERTTOCLOB(
        l_body, :body, DBMS_LOB.LOBMAXSIZE,
        v_dest_off, v_src_off,
        NLS_CHARSET_ID('AL32UTF8'), v_lang_ctx, v_warning
    );

    l_items := JSON_ARRAY_T(JSON_OBJECT_T.PARSE(l_body).get_array('items'));

    FOR i IN 0 .. l_items.get_size() - 1 LOOP
        BEGIN
            l_item        := JSON_OBJECT_T(l_items.get(i));
            v_id          := safe_num(l_item, 'RuleId');
            v_name        := safe_str(l_item, 'Name');
            v_description := safe_str(l_item, 'Description');
            v_set_name    := safe_str(l_item, 'SetName');
            v_type        := safe_str(l_item, 'Type');
            v_occurrences := safe_num(l_item, 'Occurrences');
            v_status      := safe_str(l_item, 'Status');

            SELECT COUNT(*) INTO v_exists FROM RR_AR_REVENUE_SCHED_RULES WHERE RULE_ID = v_id;

            MERGE INTO RR_AR_REVENUE_SCHED_RULES d
            USING (SELECT v_id AS id FROM DUAL) s ON (d.RULE_ID = s.id)
            WHEN MATCHED THEN UPDATE SET
                NAME        = v_name,
                DESCRIPTION = v_description,
                SET_NAME    = v_set_name,
                TYPE        = v_type,
                OCCURRENCES = v_occurrences,
                STATUS      = v_status,
                SYNC_DATE   = SYSTIMESTAMP
            WHEN NOT MATCHED THEN INSERT (
                RULE_ID, NAME, DESCRIPTION, SET_NAME, TYPE, OCCURRENCES, STATUS, SYNC_DATE
            ) VALUES (
                v_id, v_name, v_description, v_set_name, v_type, v_occurrences, v_status, SYSTIMESTAMP
            );

            IF v_exists > 0 THEN l_updated  := l_updated  + 1;
            ELSE                  l_inserted := l_inserted + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            l_errors := l_errors + 1;
            IF LENGTH(l_error_msgs) < 3500 THEN
                l_error_msgs := l_error_msgs || 'Row ' || i || ': ' || SUBSTR(SQLERRM,1,200) || '; ';
            END IF;
        END;
    END LOOP;

    COMMIT;
    :status_code := CASE WHEN l_errors = 0 THEN 201 ELSE 207 END;
    HTP.P('{"status":"' || CASE WHEN l_errors = 0 THEN 'SUCCESS' ELSE 'PARTIAL' END || '"' ||
          ',"inserted":' || l_inserted ||
          ',"updated":'  || l_updated  ||
          ',"errors":'   || l_errors   ||
          CASE WHEN l_error_msgs IS NOT NULL
               THEN ',"errorDetail":"' || REPLACE(l_error_msgs, '"', '\"') || '"'
               ELSE '' END || '}');
EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    :status_code := 500;
    HTP.P('{"status":"ERROR","message":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;]'
    );
    COMMIT;
END;
/

-- =====================================================
-- 11. ORDS: GET ar/revenue-sched-rules
-- =====================================================
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ar', p_pattern => 'revenue-sched-rules');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ar',
        p_pattern     => 'revenue-sched-rules',
        p_comments    => 'List AR Revenue Scheduling Rules'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'revenue-sched-rules',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 500,
        p_comments       => 'Fetch all AR Revenue Scheduling Rules',
        p_source         => '
SELECT RULE_ID, NAME, DESCRIPTION, SET_NAME, TYPE, OCCURRENCES, STATUS, SYNC_DATE
FROM RR_AR_REVENUE_SCHED_RULES
ORDER BY NAME'
    );
    COMMIT;
END;
/

-- =====================================================
-- ENDPOINTS SUMMARY
-- =====================================================
-- POST {base}/ar/payment-terms/bulk         Bulk upsert AR Payment Terms
-- GET  {base}/ar/payment-terms              List all AR Payment Terms
-- POST {base}/ar/txn-sources/bulk           Bulk upsert AR Transaction Sources
-- GET  {base}/ar/txn-sources                List all AR Transaction Sources
-- POST {base}/ar/txn-types/bulk             Bulk upsert AR Transaction Types
-- GET  {base}/ar/txn-types                  List all AR Transaction Types
-- POST {base}/ar/memo-lines/bulk            Bulk upsert AR Memo Lines
-- GET  {base}/ar/memo-lines                 List all AR Memo Lines
-- POST {base}/ar/revenue-sched-rules/bulk   Bulk upsert AR Revenue Scheduling Rules
-- GET  {base}/ar/revenue-sched-rules        List all AR Revenue Scheduling Rules
-- =====================================================
