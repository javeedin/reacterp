-- =============================================================================
-- RR ERP – RR_SLA_PKG  (Subledger Accounting Package)
-- Run in Oracle APEX SQL Workshop / SQL*Plus BEFORE the ORDS handler script.
-- =============================================================================

-- =============================================================================
-- PACKAGE SPEC
-- =============================================================================
CREATE OR REPLACE PACKAGE RR_SLA_PKG AS

  -- ---------------------------------------------------------------------------
  -- create_accounting
  --   Parses a JSON body (CLOB) that contains { header:{...}, lines:[...] }.
  --   If a DRAFT header already exists for the same source transaction +
  --   event type it is replaced (delete & re-insert).
  --   p_body_json : raw JSON request body (CLOB)
  --   p_status    : HTTP status code to return (200 / 500)
  --   p_response  : JSON response body (CLOB)
  -- ---------------------------------------------------------------------------
  PROCEDURE create_accounting(
    p_body_json IN  CLOB,
    p_status    OUT NUMBER,
    p_response  OUT CLOB
  );

  -- ---------------------------------------------------------------------------
  -- post_to_ledger
  --   Stamps GL batch / header IDs on an SLA header and transitions it to
  --   ACCOUNTING_STATUS = POSTED (locked). Called after the frontend has
  --   successfully written the journal to GL.
  --   p_body_json : { headerId, postedBy, glBatchId, glBatchName, glHeaderId }
  -- ---------------------------------------------------------------------------
  PROCEDURE post_to_ledger(
    p_body_json IN  CLOB,
    p_status    OUT NUMBER,
    p_response  OUT CLOB
  );

  -- ---------------------------------------------------------------------------
  -- mark_error
  --   Transitions a header to ACCOUNTING_STATUS = ERROR / POSTING_STATUS =
  --   REJECTED when the GL write fails on the frontend.
  --   p_body_json : { headerId, errorMessage, postedBy }
  -- ---------------------------------------------------------------------------
  PROCEDURE mark_error(
    p_body_json IN  CLOB,
    p_status    OUT NUMBER,
    p_response  OUT CLOB
  );

  -- ---------------------------------------------------------------------------
  -- get_accounting
  --   Returns the most recent SLA header + its DR/CR lines for a given source
  --   transaction as a JSON CLOB.
  --   p_source_table : e.g. 'AP_INVOICES'
  --   p_source_id    : e.g. INVOICE_ID
  -- ---------------------------------------------------------------------------
  PROCEDURE get_accounting(
    p_source_table IN  VARCHAR2,
    p_source_id    IN  NUMBER,
    p_status       OUT NUMBER,
    p_response     OUT CLOB
  );

  -- ---------------------------------------------------------------------------
  -- Helper: build the lines JSON array for a given HEADER_ID (used internally
  -- by get_accounting; exposed so other packages can reuse it).
  -- ---------------------------------------------------------------------------
  FUNCTION get_lines_json(p_header_id IN NUMBER) RETURN CLOB;

END RR_SLA_PKG;
/

-- =============================================================================
-- PACKAGE BODY
-- =============================================================================
CREATE OR REPLACE PACKAGE BODY RR_SLA_PKG AS

  -- ── Private helper: parse a single line JSON object and INSERT it ──────────
  PROCEDURE p_insert_line(
    p_header_id   IN NUMBER,
    p_line_json   IN CLOB,
    p_currency    IN VARCHAR2,
    p_exch_rate   IN NUMBER,
    p_created_by  IN VARCHAR2,
    p_line_count  IN OUT NUMBER
  ) IS
  BEGIN
    p_line_count := p_line_count + 1;

    INSERT INTO RR_SLA_ACCOUNTING_LINES (
      HEADER_ID,    LINE_NUMBER,    LINE_TYPE,          ACCOUNTING_CLASS,
      ACCOUNT_COMBINATION,
      ENTERED_DR,   ENTERED_CR,     ACCOUNTED_DR,       ACCOUNTED_CR,
      CURRENCY_CODE, EXCHANGE_RATE, DESCRIPTION,
      SOURCE_LINE_ID, SOURCE_LINE_NUMBER,
      PARTY_ID,      PARTY_TYPE,
      CREATED_BY,    CREATION_DATE
    ) VALUES (
      p_header_id,
      TO_NUMBER(JSON_VALUE(p_line_json, '$.lineNumber')),
      JSON_VALUE(p_line_json, '$.lineType'),
      JSON_VALUE(p_line_json, '$.accountingClass'),
      JSON_VALUE(p_line_json, '$.accountCombination'),
      NVL(TO_NUMBER(JSON_VALUE(p_line_json, '$.enteredDr')),   0),
      NVL(TO_NUMBER(JSON_VALUE(p_line_json, '$.enteredCr')),   0),
      NVL(TO_NUMBER(JSON_VALUE(p_line_json, '$.accountedDr')), 0),
      NVL(TO_NUMBER(JSON_VALUE(p_line_json, '$.accountedCr')), 0),
      NVL(JSON_VALUE(p_line_json, '$.currencyCode'),  p_currency),
      NVL(TO_NUMBER(JSON_VALUE(p_line_json, '$.exchangeRate')), p_exch_rate),
      JSON_VALUE(p_line_json, '$.description'),
      TO_NUMBER(JSON_VALUE(p_line_json, '$.sourceLineId')),
      TO_NUMBER(JSON_VALUE(p_line_json, '$.sourceLineNumber')),
      TO_NUMBER(JSON_VALUE(p_line_json, '$.partyId')),
      JSON_VALUE(p_line_json, '$.partyType'),
      p_created_by, SYSDATE
    );
    -- Trigger RR_SLA_LINE_SEG_TRG auto-parses ACCOUNT_COMBINATION → SEGMENT1-15
  END p_insert_line;


  -- ── Private helper: error JSON shorthand ────────────────────────────────────
  FUNCTION p_err(p_msg IN VARCHAR2) RETURN CLOB IS
  BEGIN
    RETURN JSON_OBJECT('error' VALUE TRUE, 'message' VALUE p_msg);
  END p_err;


  -- ===========================================================================
  -- create_accounting
  -- ===========================================================================
  PROCEDURE create_accounting(
    p_body_json IN  CLOB,
    p_status    OUT NUMBER,
    p_response  OUT CLOB
  ) IS
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
  BEGIN
    -- ── Parse header object ──────────────────────────────────────────────────
    j_header := JSON_QUERY(p_body_json, '$.header');
    j_lines  := JSON_QUERY(p_body_json, '$.lines');

    v_module      := JSON_VALUE(j_header, '$.moduleName');
    v_src_table   := JSON_VALUE(j_header, '$.sourceTable');
    v_src_id      := TO_NUMBER(JSON_VALUE(j_header, '$.sourceId'));
    v_src_number  := JSON_VALUE(j_header, '$.sourceNumber');
    v_src_type    := JSON_VALUE(j_header, '$.sourceType');
    v_event_type  := JSON_VALUE(j_header, '$.eventTypeCode');
    v_event_date  := TO_DATE(JSON_VALUE(j_header, '$.eventDate'),      'YYYY-MM-DD');
    v_acct_date   := TO_DATE(JSON_VALUE(j_header, '$.accountingDate'), 'YYYY-MM-DD');
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

    -- ── Replace existing DRAFT for same source + event type ──────────────────
    BEGIN
      SELECT HEADER_ID INTO v_existing_id
      FROM   RR_SLA_ACCOUNTING_HEADERS
      WHERE  SOURCE_TABLE      = v_src_table
      AND    SOURCE_ID         = v_src_id
      AND    EVENT_TYPE_CODE   = v_event_type
      AND    ACCOUNTING_STATUS = 'DRAFT'
      AND    ROWNUM = 1;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN v_existing_id := NULL;
    END;

    IF v_existing_id IS NOT NULL THEN
      -- ON DELETE CASCADE on lines, but explicit delete is safer here
      DELETE FROM RR_SLA_ACCOUNTING_LINES  WHERE HEADER_ID = v_existing_id;
      DELETE FROM RR_SLA_ACCOUNTING_HEADERS WHERE HEADER_ID = v_existing_id;
    END IF;

    -- ── Insert new header ────────────────────────────────────────────────────
    INSERT INTO RR_SLA_ACCOUNTING_HEADERS (
      MODULE_NAME,    SOURCE_TABLE,   SOURCE_ID,      SOURCE_NUMBER,   SOURCE_TYPE,
      EVENT_TYPE_CODE, EVENT_DATE,    ACCOUNTING_DATE, PERIOD_NAME,
      LEDGER_ID,      LEDGER_NAME,    CURRENCY_CODE,   LEDGER_CURRENCY,
      EXCHANGE_RATE,  EXCHANGE_RATE_TYPE,
      BUSINESS_UNIT,  LEGAL_ENTITY,   DESCRIPTION,
      ACCOUNTING_STATUS, POSTING_STATUS,
      CREATED_BY,     CREATION_DATE,  LAST_UPDATED_BY, LAST_UPDATE_DATE
    ) VALUES (
      v_module,    v_src_table,  v_src_id,    v_src_number,  v_src_type,
      v_event_type, v_event_date, v_acct_date, v_period,
      v_ledger_id, v_ledger_name, v_currency,  v_ledger_ccy,
      v_exch_rate, v_exch_type,
      v_bu,        v_le,         v_desc,
      'DRAFT',     'UNPOSTED',
      v_created_by, SYSDATE,     v_created_by, SYSDATE
    ) RETURNING HEADER_ID INTO v_header_id;

    -- ── Insert lines ─────────────────────────────────────────────────────────
    FOR i IN 0 .. JSON_ARRAY_LENGTH(j_lines) - 1 LOOP
      j_line := JSON_QUERY(j_lines, '$[' || i || ']');
      p_insert_line(v_header_id, j_line, v_currency, v_exch_rate, v_created_by, v_line_count);
    END LOOP;

    COMMIT;

    p_status   := 200;
    p_response := JSON_OBJECT(
      'headerId'  VALUE v_header_id,
      'lineCount' VALUE v_line_count,
      'status'    VALUE 'DRAFT',
      'message'   VALUE 'Accounting created successfully'
    );

  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_status   := 500;
      p_response := p_err(SQLERRM);
  END create_accounting;


  -- ===========================================================================
  -- post_to_ledger
  -- ===========================================================================
  PROCEDURE post_to_ledger(
    p_body_json IN  CLOB,
    p_status    OUT NUMBER,
    p_response  OUT CLOB
  ) IS
    v_header_id      NUMBER;
    v_posted_by      VARCHAR2(100);
    v_gl_batch_id    NUMBER;
    v_gl_batch_name  VARCHAR2(240);
    v_gl_header_id   NUMBER;
    v_current_status VARCHAR2(20);
  BEGIN
    v_header_id     := TO_NUMBER(JSON_VALUE(p_body_json, '$.headerId'));
    v_posted_by     := NVL(JSON_VALUE(p_body_json, '$.postedBy'), 'SYSTEM');
    v_gl_batch_id   := TO_NUMBER(JSON_VALUE(p_body_json, '$.glBatchId'));
    v_gl_batch_name := JSON_VALUE(p_body_json, '$.glBatchName');
    v_gl_header_id  := TO_NUMBER(JSON_VALUE(p_body_json, '$.glHeaderId'));

    -- Guard: header must exist and not already be posted
    BEGIN
      SELECT ACCOUNTING_STATUS INTO v_current_status
      FROM   RR_SLA_ACCOUNTING_HEADERS
      WHERE  HEADER_ID = v_header_id
      FOR UPDATE NOWAIT;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        p_status   := 404;
        p_response := p_err('SLA Header not found: ' || v_header_id);
        RETURN;
    END;

    IF v_current_status = 'POSTED' THEN
      p_status   := 400;
      p_response := p_err('Header ' || v_header_id || ' is already POSTED and locked.');
      RETURN;
    END IF;

    -- Transition header to POSTED
    UPDATE RR_SLA_ACCOUNTING_HEADERS
    SET    ACCOUNTING_STATUS = 'POSTED',
           POSTING_STATUS    = 'POSTED',
           GL_BATCH_ID       = v_gl_batch_id,
           GL_BATCH_NAME     = v_gl_batch_name,
           GL_HEADER_ID      = v_gl_header_id,
           GL_TRANSFER_DATE  = SYSDATE,
           POSTED_BY         = v_posted_by,
           POSTED_DATE       = SYSDATE,
           LAST_UPDATE_DATE  = SYSDATE,
           LAST_UPDATED_BY   = v_posted_by
    WHERE  HEADER_ID = v_header_id;

    COMMIT;

    p_status   := 200;
    p_response := JSON_OBJECT(
      'headerId'   VALUE v_header_id,
      'glBatchId'  VALUE v_gl_batch_id,
      'glHeaderId' VALUE v_gl_header_id,
      'status'     VALUE 'POSTED',
      'message'    VALUE 'Posted to GL successfully. Record is now locked.'
    );

  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_status   := 500;
      p_response := p_err(SQLERRM);
  END post_to_ledger;


  -- ===========================================================================
  -- mark_error
  -- ===========================================================================
  PROCEDURE mark_error(
    p_body_json IN  CLOB,
    p_status    OUT NUMBER,
    p_response  OUT CLOB
  ) IS
    v_header_id NUMBER;
    v_error_msg VARCHAR2(500);
    v_posted_by VARCHAR2(100);
  BEGIN
    v_header_id := TO_NUMBER(JSON_VALUE(p_body_json, '$.headerId'));
    v_error_msg := JSON_VALUE(p_body_json, '$.errorMessage');
    v_posted_by := NVL(JSON_VALUE(p_body_json, '$.postedBy'), 'SYSTEM');

    UPDATE RR_SLA_ACCOUNTING_HEADERS
    SET    ACCOUNTING_STATUS = 'ERROR',
           POSTING_STATUS    = 'REJECTED',
           DESCRIPTION       = DESCRIPTION || ' | POST ERROR: ' || SUBSTR(v_error_msg, 1, 200),
           LAST_UPDATE_DATE  = SYSDATE,
           LAST_UPDATED_BY   = v_posted_by
    WHERE  HEADER_ID = v_header_id;

    COMMIT;

    p_status   := 200;
    p_response := JSON_OBJECT(
      'headerId' VALUE v_header_id,
      'status'   VALUE 'ERROR',
      'message'  VALUE 'Header marked as ERROR'
    );

  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_status   := 500;
      p_response := p_err(SQLERRM);
  END mark_error;


  -- ===========================================================================
  -- get_lines_json  (public helper, reusable)
  -- ===========================================================================
  FUNCTION get_lines_json(p_header_id IN NUMBER) RETURN CLOB IS
    v_result CLOB;
  BEGIN
    SELECT JSON_ARRAYAGG(
      JSON_OBJECT(
        'lineId'             VALUE LINE_ID,
        'lineNumber'         VALUE LINE_NUMBER,
        'lineType'           VALUE LINE_TYPE,
        'accountingClass'    VALUE ACCOUNTING_CLASS,
        'accountCombination' VALUE ACCOUNT_COMBINATION,
        'segment1'           VALUE SEGMENT1,
        'segment2'           VALUE SEGMENT2,
        'segment3'           VALUE SEGMENT3,
        'segment4'           VALUE SEGMENT4,
        'segment5'           VALUE SEGMENT5,
        'segment6'           VALUE SEGMENT6,
        'segment7'           VALUE SEGMENT7,
        'segment8'           VALUE SEGMENT8,
        'segment9'           VALUE SEGMENT9,
        'enteredDr'          VALUE ENTERED_DR,
        'enteredCr'          VALUE ENTERED_CR,
        'accountedDr'        VALUE ACCOUNTED_DR,
        'accountedCr'        VALUE ACCOUNTED_CR,
        'currencyCode'       VALUE CURRENCY_CODE,
        'description'        VALUE DESCRIPTION,
        'sourceLineNumber'   VALUE SOURCE_LINE_NUMBER
        ABSENT ON NULL
      )
      ORDER BY LINE_NUMBER
    )
    INTO v_result
    FROM RR_SLA_ACCOUNTING_LINES
    WHERE HEADER_ID = p_header_id;

    RETURN NVL(v_result, '[]');
  END get_lines_json;


  -- ===========================================================================
  -- get_accounting
  -- ===========================================================================
  PROCEDURE get_accounting(
    p_source_table IN  VARCHAR2,
    p_source_id    IN  NUMBER,
    p_status       OUT NUMBER,
    p_response     OUT CLOB
  ) IS
    -- Header columns
    v_header_id  NUMBER;
    v_acct_stat  VARCHAR2(20);
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
    -- Fetch most recent header
    BEGIN
      SELECT HEADER_ID,       ACCOUNTING_STATUS, POSTING_STATUS,
             ACCOUNTING_DATE, PERIOD_NAME,       CREATION_DATE,
             POSTED_DATE,     POSTED_BY,
             GL_BATCH_ID,     GL_HEADER_ID,      GL_BATCH_NAME,
             MODULE_NAME,     EVENT_TYPE_CODE,   DESCRIPTION
      INTO   v_header_id,  v_acct_stat,  v_post_stat,
             v_acct_date,  v_period,     v_created,
             v_posted,     v_posted_by,
             v_gl_batch,   v_gl_hdr,     v_gl_bname,
             v_module,     v_event,      v_desc
      FROM   RR_SLA_ACCOUNTING_HEADERS
      WHERE  SOURCE_TABLE = p_source_table
      AND    SOURCE_ID    = p_source_id
      ORDER BY HEADER_ID DESC
      FETCH FIRST 1 ROWS ONLY;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        p_status   := 200;
        p_response := JSON_OBJECT(
          'found'            VALUE FALSE,
          'headerId'         VALUE NULL,
          'accountingStatus' VALUE NULL,
          'lines'            VALUE '[]' FORMAT JSON
        );
        RETURN;
    END;

    p_status   := 200;
    p_response := JSON_OBJECT(
      'found'            VALUE TRUE,
      'headerId'         VALUE v_header_id,
      'moduleName'       VALUE v_module,
      'eventTypeCode'    VALUE v_event,
      'accountingStatus' VALUE v_acct_stat,
      'postingStatus'    VALUE v_post_stat,
      'accountingDate'   VALUE TO_CHAR(v_acct_date, 'YYYY-MM-DD'),
      'periodName'       VALUE v_period,
      'description'      VALUE v_desc,
      'creationDate'     VALUE TO_CHAR(v_created, 'YYYY-MM-DD HH24:MI:SS'),
      'postedDate'       VALUE TO_CHAR(v_posted,  'YYYY-MM-DD HH24:MI:SS'),
      'postedBy'         VALUE v_posted_by,
      'glBatchId'        VALUE v_gl_batch,
      'glBatchName'      VALUE v_gl_bname,
      'glHeaderId'       VALUE v_gl_hdr,
      'lines'            VALUE get_lines_json(v_header_id) FORMAT JSON
      ABSENT ON NULL
    );

  EXCEPTION
    WHEN OTHERS THEN
      p_status   := 500;
      p_response := p_err(SQLERRM);
  END get_accounting;

END RR_SLA_PKG;
/

-- =============================================================================
-- END OF PACKAGE
-- =============================================================================
