-- =====================================================
-- ORDS REST Handlers for AR Receipts
-- Module  : ar  (already defined)
-- Base    : /ar/
-- Table   : RR_AR_RECEIPTS
-- Package : RR_AR_RECEIPTS_PKG
-- =====================================================

-- =====================================================
-- 1. Template: ar/receipts
-- =====================================================
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ar', p_pattern => 'receipts');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ar',
        p_pattern     => 'receipts',
        p_comments    => 'AR Standard Receipts'
    );
    COMMIT;
END;
/

-- =====================================================
-- 2. POST /ar/receipts  — single receipt upsert
-- =====================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'receipts',
        p_method         => 'POST',
        p_source_type    => 'plsql/block',
        p_mimes_allowed  => 'application/json',
        p_comments       => 'Upsert single AR receipt — wraps body in {"items":[...]}',
        p_source         => '
DECLARE
    l_status   VARCHAR2(20);
    l_message  VARCHAR2(4000);
    l_inserted NUMBER;
    l_updated  NUMBER;
    l_errors   NUMBER;
    l_last_id  NUMBER;
    l_wrapped  CLOB;
BEGIN
    l_wrapped := ''{"items":['' || :body_text || '']}'';
    RR_AR_RECEIPTS_PKG.save_receipts_bulk(
        p_receipts_json => l_wrapped,
        p_status        => l_status,
        p_message       => l_message,
        p_inserted      => l_inserted,
        p_updated       => l_updated,
        p_errors        => l_errors,
        p_last_id       => l_last_id
    );
    :status_code := CASE WHEN l_status = ''SUCCESS'' THEN 201 ELSE 400 END;
    HTP.P(''{"status":"''    || l_status                            ||
          ''","message":"''  || REPLACE(l_message, ''"'', ''\\"'') ||
          ''","inserted":''  || l_inserted                         ||
          '',"updated":''    || l_updated                          ||
          '',"errors":''     || l_errors                           ||
          '',"receiptId":''  || NVL(TO_CHAR(l_last_id), ''null'') || ''}'');
END;'
    );
    COMMIT;
END;
/

-- =====================================================
-- 3. POST /ar/receipts/bulk  — bulk upsert receipts
-- =====================================================
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ar', p_pattern => 'receipts/bulk');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ar',
        p_pattern     => 'receipts/bulk',
        p_comments    => 'Bulk upsert AR receipts'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'receipts/bulk',
        p_method         => 'POST',
        p_source_type    => 'plsql/block',
        p_mimes_allowed  => 'application/json',
        p_comments       => 'Bulk upsert AR receipts {"items":[...]}',
        p_source         => '
DECLARE
    l_status   VARCHAR2(20);
    l_message  VARCHAR2(4000);
    l_inserted NUMBER;
    l_updated  NUMBER;
    l_errors   NUMBER;
    l_last_id  NUMBER;
BEGIN
    RR_AR_RECEIPTS_PKG.save_receipts_bulk(
        p_receipts_json => :body_text,
        p_status        => l_status,
        p_message       => l_message,
        p_inserted      => l_inserted,
        p_updated       => l_updated,
        p_errors        => l_errors,
        p_last_id       => l_last_id
    );
    :status_code := CASE WHEN l_status = ''SUCCESS'' THEN 201 ELSE 400 END;
    HTP.P(''{"status":"''    || l_status                              ||
          ''","message":"''  || REPLACE(l_message, ''"'', ''\\"'')   ||
          ''","inserted":''  || l_inserted                           ||
          '',"updated":''    || l_updated                            ||
          '',"errors":''     || l_errors                             ||
          '',"receiptId":''  || NVL(TO_CHAR(l_last_id), ''null'') || ''}'');
END;'
    );
    COMMIT;
END;
/

-- =====================================================
-- 3. GET /ar/receipts  — list with optional filters
-- Each bind variable referenced EXACTLY ONCE via CTE
-- =====================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'receipts',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 200,
        p_comments       => 'List AR receipts with optional filters',
        p_source         => '
WITH fp AS (
    SELECT :business_unit    AS bu,
           :customer         AS cust,
           :receipt_number   AS rnum,
           :receipt_type     AS rtype,
           :state            AS st,
           :status           AS sts,
           :date_from        AS dfrom,
           :date_to          AS dto
    FROM DUAL
)
SELECT
    r.STANDARD_RECEIPT_ID,
    r.RECEIPT_NUMBER,
    r.DOCUMENT_NUMBER,
    r.RECEIPT_TYPE,
    r.RECEIVABLES_TRX_ID,
    r.MISC_PAYMENT_SOURCE,
    r.BUSINESS_UNIT,
    r.RECEIPT_METHOD,
    r.RECEIPT_DATE,
    r.ACCOUNTING_DATE,
    r.AMOUNT,
    r.UNAPPLIED_AMOUNT,
    r.ACCOUNTED_AMOUNT,
    r.CURRENCY,
    r.STATE,
    r.STATUS,
    r.REMITTANCE_BANK_NAME,
    r.CUSTOMER_NAME,
    r.CUSTOMER_ACCOUNT_NUMBER,
    r.COMMENTS,
    r.DR_ACCOUNT,
    r.CR_ACCOUNT,
    r.SYNC_STATUS,
    r.SYNC_DATE
FROM RR_AR_RECEIPTS r
CROSS JOIN fp
WHERE (fp.bu    IS NULL OR fp.bu    = '''' OR UPPER(r.BUSINESS_UNIT)           LIKE ''%''||UPPER(fp.bu)||''%'')
  AND (fp.cust  IS NULL OR fp.cust  = '''' OR UPPER(r.CUSTOMER_NAME)           LIKE ''%''||UPPER(fp.cust)||''%''
                                           OR UPPER(r.CUSTOMER_ACCOUNT_NUMBER)  LIKE ''%''||UPPER(fp.cust)||''%'')
  AND (fp.rnum  IS NULL OR fp.rnum  = '''' OR UPPER(r.RECEIPT_NUMBER)          LIKE UPPER(fp.rnum)||''%'')
  AND (fp.rtype IS NULL OR fp.rtype = '''' OR UPPER(r.RECEIPT_TYPE)            = UPPER(fp.rtype))
  AND (fp.st    IS NULL OR fp.st    = '''' OR UPPER(r.STATE)                   = UPPER(fp.st))
  AND (fp.sts   IS NULL OR fp.sts   = '''' OR UPPER(r.STATUS)                  = UPPER(fp.sts))
  AND (fp.dfrom IS NULL OR fp.dfrom = '''' OR r.RECEIPT_DATE >= TO_DATE(SUBSTR(fp.dfrom,1,10),''YYYY-MM-DD''))
  AND (fp.dto   IS NULL OR fp.dto   = '''' OR r.RECEIPT_DATE <= TO_DATE(SUBSTR(fp.dto,1,10),''YYYY-MM-DD''))
ORDER BY r.RECEIPT_DATE DESC, r.RECEIPT_NUMBER DESC'
    );
    COMMIT;
END;
/

-- =====================================================
-- 5. Template: ar/receipts/:id  — single receipt by ID
-- =====================================================
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ar', p_pattern => 'receipts/:id');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ar',
        p_pattern     => 'receipts/:id',
        p_comments    => 'Single AR Receipt by StandardReceiptId'
    );
    COMMIT;
END;
/

-- =====================================================
-- 6. PUT /ar/receipts/:id  — update a receipt row
-- =====================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'receipts/:id',
        p_method         => 'PUT',
        p_source_type    => 'plsql/block',
        p_mimes_allowed  => 'application/json',
        p_comments       => 'Update AR receipt by StandardReceiptId',
        p_source         => '
DECLARE
    l_status   VARCHAR2(20);
    l_message  VARCHAR2(4000);
    l_inserted NUMBER;
    l_updated  NUMBER;
    l_errors   NUMBER;
    l_last_id  NUMBER;
    l_body     CLOB;
    l_wrapped  CLOB;
BEGIN
    l_body    := :body_text;
    -- Inject the StandardReceiptId from the URL if not already in body
    IF INSTR(l_body, ''StandardReceiptId'') = 0 THEN
        l_body := REGEXP_REPLACE(l_body, ''^\s*\{'', ''{"StandardReceiptId":'' || :id || '','');
    END IF;
    l_wrapped := ''{"items":['' || l_body || '']}'';
    RR_AR_RECEIPTS_PKG.save_receipts_bulk(
        p_receipts_json => l_wrapped,
        p_status        => l_status,
        p_message       => l_message,
        p_inserted      => l_inserted,
        p_updated       => l_updated,
        p_errors        => l_errors,
        p_last_id       => l_last_id
    );
    :status_code := CASE WHEN l_status = ''SUCCESS'' THEN 200 ELSE 400 END;
    HTP.P(''{"status":"''    || l_status                            ||
          ''","message":"''  || REPLACE(l_message, ''"'', ''\\"'') ||
          ''","updated":''   || l_updated                          ||
          '',"errors":''     || l_errors                           ||
          '',"receiptId":''  || NVL(TO_CHAR(:id), ''null'') || ''}'');
END;'
    );
    COMMIT;
END;
/

-- =====================================================
-- 7. DELETE /ar/receipts/:id  — delete a receipt row
-- =====================================================
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'receipts/:id',
        p_method         => 'DELETE',
        p_source_type    => 'plsql/block',
        p_comments       => 'Delete AR receipt row by StandardReceiptId',
        p_source         => '
DECLARE
    l_rows   NUMBER;
BEGIN
    DELETE FROM RR_AR_RECEIPTS
    WHERE  STANDARD_RECEIPT_ID = :id;

    l_rows := SQL%ROWCOUNT;
    COMMIT;

    :status_code := CASE WHEN l_rows > 0 THEN 200 ELSE 404 END;
    HTP.P(''{"status":"'' || CASE WHEN l_rows > 0 THEN ''SUCCESS'' ELSE ''NOT_FOUND'' END ||
          ''","deleted":'' || l_rows || ''}'');
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        :status_code := 500;
        HTP.P(''{"status":"ERROR","message":"'' || REPLACE(SQLERRM, ''"'', ''\\"'') || ''"}'' );
END;'
    );
    COMMIT;
END;
/

-- =====================================================
-- ENDPOINTS SUMMARY
-- =====================================================
-- POST   {base}/ar/receipts             Upsert single receipt (INSERT)
-- POST   {base}/ar/receipts/bulk        Bulk upsert {"items":[...]}
-- GET    {base}/ar/receipts             List with optional filters
--   ?business_unit=  ?customer=  ?receipt_number=  ?receipt_type=CASH|MISC
--   ?state=  ?status=  ?date_from=YYYY-MM-DD  ?date_to=YYYY-MM-DD
-- PUT    {base}/ar/receipts/:id         Update receipt by StandardReceiptId
-- DELETE {base}/ar/receipts/:id         Delete receipt by StandardReceiptId
-- =====================================================
