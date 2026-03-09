-- =============================================================================
-- RR ERP – SLA ORDS REST API Handlers
-- Run in Oracle APEX SQL Workshop / REST Data Services
-- Base path: /reerp/sla/
-- =============================================================================

-- =============================================================================
-- 1. POST /reerp/sla/accounting/create
--    Body: { header: {...}, lines: [{...}] }
--    Creates or replaces a DRAFT SLA header + lines for a source transaction.
--    If a DRAFT header already exists for the same SOURCE_TABLE + SOURCE_ID
--    + EVENT_TYPE_CODE it is replaced (delete + re-insert).
--    Returns: { headerId, status, message }
-- =============================================================================
DECLARE
  v_header_id   NUMBER;
  v_existing_id NUMBER;
  v_module      VARCHAR2(60);
  v_src_table   VARCHAR2(60);
  v_src_id      NUMBER;
  v_src_number  VARCHAR2(100);
  v_src_type    VARCHAR2(60);
  v_event_type  VARCHAR2(60);
  v_event_date  DATE;
  v_acct_date   DATE;
  v_period      VARCHAR2(15);
  v_ledger_id   NUMBER;
  v_ledger_name VARCHAR2(100);
  v_currency    VARCHAR2(15);
  v_ledger_ccy  VARCHAR2(15);
  v_exch_rate   NUMBER;
  v_exch_type   VARCHAR2(30);
  v_bu          VARCHAR2(100);
  v_le          VARCHAR2(100);
  v_desc        VARCHAR2(500);
  v_created_by  VARCHAR2(100);
  j_header      CLOB;
  j_lines       CLOB;
  j_line        CLOB;
  v_line_count  NUMBER := 0;
  v_line_id     NUMBER;
BEGIN
  -- Parse header object
  j_header := :body_json.header;

  v_module      := JSON_VALUE(j_header, '$.moduleName');
  v_src_table   := JSON_VALUE(j_header, '$.sourceTable');
  v_src_id      := TO_NUMBER(JSON_VALUE(j_header, '$.sourceId'));
  v_src_number  := JSON_VALUE(j_header, '$.sourceNumber');
  v_src_type    := JSON_VALUE(j_header, '$.sourceType');
  v_event_type  := JSON_VALUE(j_header, '$.eventTypeCode');
  v_event_date  := TO_DATE(JSON_VALUE(j_header, '$.eventDate'),         'YYYY-MM-DD');
  v_acct_date   := TO_DATE(JSON_VALUE(j_header, '$.accountingDate'),    'YYYY-MM-DD');
  v_period      := JSON_VALUE(j_header, '$.periodName');
  v_ledger_id   := TO_NUMBER(JSON_VALUE(j_header, '$.ledgerId'));
  v_ledger_name := JSON_VALUE(j_header, '$.ledgerName');
  v_currency    := JSON_VALUE(j_header, '$.currencyCode');
  v_ledger_ccy  := NVL(JSON_VALUE(j_header, '$.ledgerCurrency'), 'AED');
  v_exch_rate   := NVL(TO_NUMBER(JSON_VALUE(j_header, '$.exchangeRate')), 1);
  v_exch_type   := NVL(JSON_VALUE(j_header, '$.exchangeRateType'), 'Corporate');
  v_bu          := JSON_VALUE(j_header, '$.businessUnit');
  v_le          := JSON_VALUE(j_header, '$.legalEntity');
  v_desc        := JSON_VALUE(j_header, '$.description');
  v_created_by  := NVL(JSON_VALUE(j_header, '$.createdBy'), 'SYSTEM');

  -- Check for existing DRAFT header (same source + event type)
  BEGIN
    SELECT HEADER_ID INTO v_existing_id
    FROM   RR_SLA_ACCOUNTING_HEADERS
    WHERE  SOURCE_TABLE    = v_src_table
    AND    SOURCE_ID       = v_src_id
    AND    EVENT_TYPE_CODE = v_event_type
    AND    ACCOUNTING_STATUS = 'DRAFT'
    AND    ROWNUM = 1;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN v_existing_id := NULL;
  END;

  -- If existing DRAFT → delete lines then header (re-create)
  IF v_existing_id IS NOT NULL THEN
    DELETE FROM RR_SLA_ACCOUNTING_LINES  WHERE HEADER_ID = v_existing_id;
    DELETE FROM RR_SLA_ACCOUNTING_HEADERS WHERE HEADER_ID = v_existing_id;
  END IF;

  -- Insert new header
  INSERT INTO RR_SLA_ACCOUNTING_HEADERS (
    MODULE_NAME, SOURCE_TABLE, SOURCE_ID, SOURCE_NUMBER, SOURCE_TYPE,
    EVENT_TYPE_CODE, EVENT_DATE, ACCOUNTING_DATE, PERIOD_NAME,
    LEDGER_ID, LEDGER_NAME, CURRENCY_CODE, LEDGER_CURRENCY,
    EXCHANGE_RATE, EXCHANGE_RATE_TYPE,
    BUSINESS_UNIT, LEGAL_ENTITY, DESCRIPTION,
    ACCOUNTING_STATUS, POSTING_STATUS,
    CREATED_BY, CREATION_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
  ) VALUES (
    v_module, v_src_table, v_src_id, v_src_number, v_src_type,
    v_event_type, v_event_date, v_acct_date, v_period,
    v_ledger_id, v_ledger_name, v_currency, v_ledger_ccy,
    v_exch_rate, v_exch_type,
    v_bu, v_le, v_desc,
    'DRAFT', 'UNPOSTED',
    v_created_by, SYSDATE, v_created_by, SYSDATE
  ) RETURNING HEADER_ID INTO v_header_id;

  -- Parse and insert lines array
  j_lines := :body_json.lines;
  FOR i IN 0 .. JSON_ARRAY_LENGTH(j_lines) - 1 LOOP
    j_line := JSON_QUERY(j_lines, '$[' || i || ']');
    v_line_count := v_line_count + 1;

    INSERT INTO RR_SLA_ACCOUNTING_LINES (
      HEADER_ID, LINE_NUMBER, LINE_TYPE, ACCOUNTING_CLASS,
      ACCOUNT_COMBINATION,
      ENTERED_DR, ENTERED_CR, ACCOUNTED_DR, ACCOUNTED_CR,
      CURRENCY_CODE, EXCHANGE_RATE, DESCRIPTION,
      SOURCE_LINE_ID, SOURCE_LINE_NUMBER,
      PARTY_ID, PARTY_TYPE,
      CREATED_BY, CREATION_DATE
    ) VALUES (
      v_header_id,
      TO_NUMBER(JSON_VALUE(j_line, '$.lineNumber')),
      JSON_VALUE(j_line, '$.lineType'),
      JSON_VALUE(j_line, '$.accountingClass'),
      JSON_VALUE(j_line, '$.accountCombination'),
      NVL(TO_NUMBER(JSON_VALUE(j_line, '$.enteredDr')), 0),
      NVL(TO_NUMBER(JSON_VALUE(j_line, '$.enteredCr')), 0),
      NVL(TO_NUMBER(JSON_VALUE(j_line, '$.accountedDr')), 0),
      NVL(TO_NUMBER(JSON_VALUE(j_line, '$.accountedCr')), 0),
      NVL(JSON_VALUE(j_line, '$.currencyCode'), v_currency),
      NVL(TO_NUMBER(JSON_VALUE(j_line, '$.exchangeRate')), v_exch_rate),
      JSON_VALUE(j_line, '$.description'),
      TO_NUMBER(JSON_VALUE(j_line, '$.sourceLineId')),
      TO_NUMBER(JSON_VALUE(j_line, '$.sourceLineNumber')),
      TO_NUMBER(JSON_VALUE(j_line, '$.partyId')),
      JSON_VALUE(j_line, '$.partyType'),
      v_created_by, SYSDATE
    );
    -- Trigger auto-parses ACCOUNT_COMBINATION into SEGMENTs
  END LOOP;

  COMMIT;

  -- Return success
  :status      := 200;
  :body        := JSON_OBJECT(
    'headerId'   VALUE v_header_id,
    'lineCount'  VALUE v_line_count,
    'status'     VALUE 'DRAFT',
    'message'    VALUE 'Accounting created successfully'
  );
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    :status := 500;
    :body   := JSON_OBJECT(
      'error'   VALUE TRUE,
      'message' VALUE SQLERRM
    );
END;
/

-- =============================================================================
-- 2. POST /reerp/sla/accounting/post
--    Body: { headerId, postedBy, glBatchName, journalPayload: {...} }
--    - Calls the existing GL journals/create API
--    - Updates header: ACCOUNTING_STATUS=POSTED, POSTING_STATUS=POSTED
--      stamps GL_BATCH_ID, GL_HEADER_ID, GL_TRANSFER_DATE, POSTED_BY, POSTED_DATE
--    - Returns: { headerId, glBatchId, glHeaderId, status, message }
--
--    NOTE: The actual HTTP call to /reerp/journals/create is done from the
--    frontend (React). This endpoint only updates the SLA header with the
--    GL IDs returned by that call and locks the record.
--    Use POST /reerp/sla/accounting/post AFTER the GL journals/create call
--    succeeds on the frontend.
-- =============================================================================
DECLARE
  v_header_id     NUMBER;
  v_posted_by     VARCHAR2(100);
  v_gl_batch_id   NUMBER;
  v_gl_batch_name VARCHAR2(240);
  v_gl_header_id  NUMBER;
  v_current_status VARCHAR2(20);
BEGIN
  v_header_id     := TO_NUMBER(:body_json.headerId);
  v_posted_by     := NVL(:body_json.postedBy, 'SYSTEM');
  v_gl_batch_id   := TO_NUMBER(:body_json.glBatchId);
  v_gl_batch_name := :body_json.glBatchName;
  v_gl_header_id  := TO_NUMBER(:body_json.glHeaderId);

  -- Validate header exists and is not already posted
  BEGIN
    SELECT ACCOUNTING_STATUS INTO v_current_status
    FROM   RR_SLA_ACCOUNTING_HEADERS
    WHERE  HEADER_ID = v_header_id
    FOR UPDATE;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      :status := 404;
      :body   := JSON_OBJECT('error' VALUE TRUE, 'message' VALUE 'SLA Header not found: ' || v_header_id);
      RETURN;
  END;

  IF v_current_status = 'POSTED' THEN
    :status := 400;
    :body   := JSON_OBJECT('error' VALUE TRUE, 'message' VALUE 'Header ' || v_header_id || ' is already POSTED and locked.');
    RETURN;
  END IF;

  -- Update header to POSTED and lock
  UPDATE RR_SLA_ACCOUNTING_HEADERS
  SET    ACCOUNTING_STATUS  = 'POSTED',
         POSTING_STATUS     = 'POSTED',
         GL_BATCH_ID        = v_gl_batch_id,
         GL_BATCH_NAME      = v_gl_batch_name,
         GL_HEADER_ID       = v_gl_header_id,
         GL_TRANSFER_DATE   = SYSDATE,
         POSTED_BY          = v_posted_by,
         POSTED_DATE        = SYSDATE,
         LAST_UPDATE_DATE   = SYSDATE,
         LAST_UPDATED_BY    = v_posted_by
  WHERE  HEADER_ID = v_header_id;

  COMMIT;

  :status := 200;
  :body   := JSON_OBJECT(
    'headerId'    VALUE v_header_id,
    'glBatchId'   VALUE v_gl_batch_id,
    'glHeaderId'  VALUE v_gl_header_id,
    'status'      VALUE 'POSTED',
    'message'     VALUE 'Posted to GL successfully. Record is now locked.'
  );
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    :status := 500;
    :body   := JSON_OBJECT('error' VALUE TRUE, 'message' VALUE SQLERRM);
END;
/

-- =============================================================================
-- 3. POST /reerp/sla/accounting/error
--    Body: { headerId, errorMessage, postedBy }
--    Marks a header as ERROR when the GL journals/create call fails.
-- =============================================================================
DECLARE
  v_header_id  NUMBER;
  v_error_msg  VARCHAR2(500);
  v_posted_by  VARCHAR2(100);
BEGIN
  v_header_id := TO_NUMBER(:body_json.headerId);
  v_error_msg := :body_json.errorMessage;
  v_posted_by := NVL(:body_json.postedBy, 'SYSTEM');

  UPDATE RR_SLA_ACCOUNTING_HEADERS
  SET    ACCOUNTING_STATUS = 'ERROR',
         POSTING_STATUS    = 'REJECTED',
         DESCRIPTION       = DESCRIPTION || ' | POST ERROR: ' || SUBSTR(v_error_msg, 1, 200),
         LAST_UPDATE_DATE  = SYSDATE,
         LAST_UPDATED_BY   = v_posted_by
  WHERE  HEADER_ID = v_header_id;

  COMMIT;

  :status := 200;
  :body   := JSON_OBJECT('headerId' VALUE v_header_id, 'status' VALUE 'ERROR', 'message' VALUE 'Header marked as ERROR');
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    :status := 500;
    :body   := JSON_OBJECT('error' VALUE TRUE, 'message' VALUE SQLERRM);
END;
/

-- =============================================================================
-- 4. GET /reerp/sla/accounting
--    Query params: sourceTable, sourceId
--    Returns header + lines for a source transaction
-- =============================================================================
DECLARE
  v_src_table  VARCHAR2(60);
  v_src_id     NUMBER;
  v_result     CLOB;
  v_lines_arr  CLOB;
  v_header_id  NUMBER;
  v_status     VARCHAR2(20);
  v_post_stat  VARCHAR2(20);
  v_acct_date  DATE;
  v_period     VARCHAR2(15);
  v_created    DATE;
  v_posted     DATE;
  v_posted_by  VARCHAR2(100);
  v_gl_batch   NUMBER;
  v_gl_hdr     NUMBER;
  v_gl_bname   VARCHAR2(240);
  v_module     VARCHAR2(60);
  v_event      VARCHAR2(60);
  v_desc       VARCHAR2(500);
BEGIN
  v_src_table := :sourceTable;
  v_src_id    := TO_NUMBER(:sourceId);

  -- Get latest header for this source transaction
  BEGIN
    SELECT HEADER_ID, ACCOUNTING_STATUS, POSTING_STATUS,
           ACCOUNTING_DATE, PERIOD_NAME, CREATION_DATE,
           POSTED_DATE, POSTED_BY,
           GL_BATCH_ID, GL_HEADER_ID, GL_BATCH_NAME,
           MODULE_NAME, EVENT_TYPE_CODE, DESCRIPTION
    INTO   v_header_id, v_status, v_post_stat,
           v_acct_date, v_period, v_created,
           v_posted, v_posted_by,
           v_gl_batch, v_gl_hdr, v_gl_bname,
           v_module, v_event, v_desc
    FROM   RR_SLA_ACCOUNTING_HEADERS
    WHERE  SOURCE_TABLE = v_src_table
    AND    SOURCE_ID    = v_src_id
    ORDER BY HEADER_ID DESC
    FETCH FIRST 1 ROWS ONLY;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      :status := 200;
      :body   := JSON_OBJECT('found' VALUE FALSE, 'headerId' VALUE NULL, 'accountingStatus' VALUE NULL, 'lines' VALUE JSON_ARRAY());
      RETURN;
  END;

  -- Build lines JSON array
  SELECT JSON_ARRAYAGG(
    JSON_OBJECT(
      'lineId'           VALUE LINE_ID,
      'lineNumber'       VALUE LINE_NUMBER,
      'lineType'         VALUE LINE_TYPE,
      'accountingClass'  VALUE ACCOUNTING_CLASS,
      'accountCombination' VALUE ACCOUNT_COMBINATION,
      'segment1'         VALUE SEGMENT1,
      'segment2'         VALUE SEGMENT2,
      'segment3'         VALUE SEGMENT3,
      'segment4'         VALUE SEGMENT4,
      'segment5'         VALUE SEGMENT5,
      'segment6'         VALUE SEGMENT6,
      'segment7'         VALUE SEGMENT7,
      'segment8'         VALUE SEGMENT8,
      'segment9'         VALUE SEGMENT9,
      'enteredDr'        VALUE ENTERED_DR,
      'enteredCr'        VALUE ENTERED_CR,
      'accountedDr'      VALUE ACCOUNTED_DR,
      'accountedCr'      VALUE ACCOUNTED_CR,
      'currencyCode'     VALUE CURRENCY_CODE,
      'description'      VALUE DESCRIPTION,
      'sourceLineNumber' VALUE SOURCE_LINE_NUMBER
      ABSENT ON NULL
    )
    ORDER BY LINE_NUMBER
  )
  INTO v_lines_arr
  FROM RR_SLA_ACCOUNTING_LINES
  WHERE HEADER_ID = v_header_id;

  :status := 200;
  :body   := JSON_OBJECT(
    'found'            VALUE TRUE,
    'headerId'         VALUE v_header_id,
    'moduleName'       VALUE v_module,
    'eventTypeCode'    VALUE v_event,
    'accountingStatus' VALUE v_status,
    'postingStatus'    VALUE v_post_stat,
    'accountingDate'   VALUE TO_CHAR(v_acct_date, 'YYYY-MM-DD'),
    'periodName'       VALUE v_period,
    'description'      VALUE v_desc,
    'creationDate'     VALUE TO_CHAR(v_created, 'YYYY-MM-DD HH24:MI:SS'),
    'postedDate'       VALUE TO_CHAR(v_posted, 'YYYY-MM-DD HH24:MI:SS'),
    'postedBy'         VALUE v_posted_by,
    'glBatchId'        VALUE v_gl_batch,
    'glBatchName'      VALUE v_gl_bname,
    'glHeaderId'       VALUE v_gl_hdr,
    'lines'            VALUE NVL(v_lines_arr, '[]') FORMAT JSON
    ABSENT ON NULL
  );
EXCEPTION
  WHEN OTHERS THEN
    :status := 500;
    :body   := JSON_OBJECT('error' VALUE TRUE, 'message' VALUE SQLERRM);
END;
/

-- =============================================================================
-- ORDS Module Registration (run once to register the REST module)
-- =============================================================================
/*
BEGIN
  ORDS.DEFINE_MODULE(
    p_module_name    => 'reerp.sla',
    p_base_path      => '/reerp/sla/',
    p_items_per_page => 25
  );

  -- POST /reerp/sla/accounting/create
  ORDS.DEFINE_TEMPLATE(p_module_name => 'reerp.sla', p_pattern => 'accounting/create');
  ORDS.DEFINE_HANDLER(
    p_module_name    => 'reerp.sla',
    p_pattern        => 'accounting/create',
    p_method         => 'POST',
    p_source_type    => ORDS.source_type_plsql,
    p_source         => '-- paste handler 1 body here'
  );

  -- POST /reerp/sla/accounting/post
  ORDS.DEFINE_TEMPLATE(p_module_name => 'reerp.sla', p_pattern => 'accounting/post');
  ORDS.DEFINE_HANDLER(
    p_module_name    => 'reerp.sla',
    p_pattern        => 'accounting/post',
    p_method         => 'POST',
    p_source_type    => ORDS.source_type_plsql,
    p_source         => '-- paste handler 2 body here'
  );

  -- POST /reerp/sla/accounting/error
  ORDS.DEFINE_TEMPLATE(p_module_name => 'reerp.sla', p_pattern => 'accounting/error');
  ORDS.DEFINE_HANDLER(
    p_module_name    => 'reerp.sla',
    p_pattern        => 'accounting/error',
    p_method         => 'POST',
    p_source_type    => ORDS.source_type_plsql,
    p_source         => '-- paste handler 3 body here'
  );

  -- GET /reerp/sla/accounting
  ORDS.DEFINE_TEMPLATE(p_module_name => 'reerp.sla', p_pattern => 'accounting');
  ORDS.DEFINE_HANDLER(
    p_module_name    => 'reerp.sla',
    p_pattern        => 'accounting',
    p_method         => 'GET',
    p_source_type    => ORDS.source_type_plsql,
    p_source         => '-- paste handler 4 body here'
  );

  COMMIT;
END;
/
*/

-- =============================================================================
-- END OF ORDS API SCRIPTS
-- =============================================================================
