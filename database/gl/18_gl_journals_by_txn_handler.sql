-- =============================================================================
-- GL Journal lookup by PC Transaction ID
-- =============================================================================
-- Purpose:
--   GET reerp/gl/journals/by-txn?txnId=:txn_id
--
--   Returns the GL journal header + all lines for a given PC transaction.
--   Dr lines are stored with REFERENCE1 = txnId, REFERENCE3 = 'EXPENSE'.
--   Queries both RR_GL_LINES_ALL and RR_GL_JE_LINES_ALL (whichever has data).
--   Response shape is compatible with SlaGetResult so the existing view modal
--   works without changes.
--
-- Run in: SQL Workshop > SQL Commands (as schema owner)
-- =============================================================================

BEGIN
  ORDS.DELETE_HANDLER(
    p_module_name => 'reerp',
    p_pattern     => 'gl/journals/by-txn',
    p_method      => 'GET'
  );
  COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
  ORDS.DEFINE_HANDLER(
    p_module_name   => 'reerp',
    p_pattern       => 'gl/journals/by-txn',
    p_method        => 'GET',
    p_source_type   => 'plsql/block',
    p_mimes_allowed => '',
    p_comments      => 'Get GL journal for a PC transaction (by txnId via REFERENCE1)',
    p_source        => q'[
DECLARE
  v_txn_id       VARCHAR2(200) := :txn_id;
  v_je_header_id NUMBER        := NULL;
  v_batch_id     NUMBER        := NULL;

  -- Header fields
  v_journal_name    VARCHAR2(240);
  v_period_name     VARCHAR2(15);
  v_acct_date       VARCHAR2(20);
  v_batch_name      VARCHAR2(500);
  v_batch_status    VARCHAR2(30);
  v_created_by      VARCHAR2(200);
  v_creation_date   VARCHAR2(30);
  v_currency        VARCHAR2(15);

  -- JSON output
  v_result CLOB;

  -- Helper functions (inline)
  FUNCTION esc(p IN VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN REPLACE(REPLACE(p, CHR(92), CHR(92)||CHR(92)), '"', CHR(92)||'"');
  END;
  FUNCTION jstr(p IN VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN CASE WHEN p IS NULL THEN 'null' ELSE '"' || esc(p) || '"' END;
  END;
  FUNCTION jnum(p IN NUMBER) RETURN VARCHAR2 IS
  BEGIN
    RETURN CASE WHEN p IS NULL THEN 'null' ELSE TO_CHAR(p) END;
  END;

BEGIN
  -- ── Step 1: Locate the JE_HEADER_ID via Dr line reference ─────────────────
  -- Try RR_GL_LINES_ALL first
  BEGIN
    SELECT JE_HEADER_ID, BATCH_ID
      INTO v_je_header_id, v_batch_id
      FROM RR_GL_LINES_ALL
     WHERE REFERENCE1 = v_txn_id
       AND REFERENCE3 = 'EXPENSE'
       AND ROWNUM     = 1;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN NULL;
    WHEN OTHERS        THEN NULL;
  END;

  -- Fallback: RR_GL_JE_LINES_ALL (alternate table used by some handlers)
  IF v_je_header_id IS NULL THEN
    BEGIN
      SELECT JE_HEADER_ID, BATCH_ID
        INTO v_je_header_id, v_batch_id
        FROM RR_GL_JE_LINES_ALL
       WHERE REFERENCE1 = v_txn_id
         AND REFERENCE3 = 'EXPENSE'
         AND ROWNUM     = 1;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN NULL;
      WHEN OTHERS        THEN NULL;
    END;
  END IF;

  -- ── Step 2: Not found — return empty result ────────────────────────────────
  IF v_je_header_id IS NULL THEN
    :status_code := 200;
    OWA_UTIL.MIME_HEADER('application/json', TRUE);
    HTP.PRN('{"found":false,"headerId":null,"accountingStatus":null,"postingStatus":null,'
         || '"accountingDate":null,"periodName":null,"description":null,"glBatchName":null,'
         || '"glHeaderId":null,"postedBy":null,"postedDate":null,"lines":[]}');
    RETURN;
  END IF;

  -- ── Step 3: Load header ────────────────────────────────────────────────────
  BEGIN
    SELECT h.JOURNAL_NAME,
           h.PERIOD_NAME,
           TO_CHAR(h.DEFAULT_EFFECTIVE_DATE, 'YYYY-MM-DD'),
           h.CURRENCY_CODE,
           h.CREATED_BY,
           TO_CHAR(CAST(h.CREATION_DATE AS DATE), 'YYYY-MM-DD"T"HH24:MI:SS')
      INTO v_journal_name, v_period_name, v_acct_date,
           v_currency, v_created_by, v_creation_date
      FROM RR_GL_HEADERS h
     WHERE h.JE_HEADER_ID = v_je_header_id;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── Step 4: Load batch name + status ──────────────────────────────────────
  BEGIN
    SELECT b.BATCH_NAME, b.STATUS
      INTO v_batch_name, v_batch_status
      FROM RR_GL_JOURNAL_BATCHES b
     WHERE b.BATCH_SYNC_ID = v_batch_id
        OR b.JE_BATCH_ID   = v_batch_id
     FETCH FIRST 1 ROWS ONLY;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── Step 5: Build JSON header ──────────────────────────────────────────────
  v_result := '{'
    || '"found":true,'
    || '"headerId":'           || jnum(v_je_header_id)  || ','
    || '"glHeaderId":'         || jnum(v_je_header_id)  || ','
    || '"accountingStatus":'   || jstr(NVL(v_batch_status, 'POSTED'))  || ','
    || '"postingStatus":'      || jstr(NVL(v_batch_status, 'POSTED'))  || ','
    || '"accountingDate":'     || jstr(v_acct_date)     || ','
    || '"periodName":'         || jstr(v_period_name)   || ','
    || '"description":'        || jstr(v_journal_name)  || ','
    || '"glBatchName":'        || jstr(v_batch_name)    || ','
    || '"postedBy":'           || jstr(v_created_by)    || ','
    || '"postedDate":'         || jstr(v_creation_date) || ','
    || '"lines":[';

  -- ── Step 6: Build lines array (try both tables) ────────────────────────────
  DECLARE
    v_first  BOOLEAN := TRUE;
    v_src    VARCHAR2(30) := 'RR_GL_LINES_ALL';
    v_count  NUMBER := 0;

    CURSOR c_lines_main IS
      SELECT LINE_ID, JE_LINE_NUMBER,
             NVL(ENTERED_DR, 0) AS ENTERED_DR,
             NVL(ENTERED_CR, 0) AS ENTERED_CR,
             NVL(ACCOUNTED_DR, 0) AS ACCOUNTED_DR,
             NVL(ACCOUNTED_CR, 0) AS ACCOUNTED_CR,
             ACCOUNT_COMBINATION, DESCRIPTION, CURRENCY_CODE,
             REFERENCE3
        FROM RR_GL_LINES_ALL
       WHERE JE_HEADER_ID = v_je_header_id
       ORDER BY JE_LINE_NUMBER;

    CURSOR c_lines_alt IS
      SELECT LINE_ID, JE_LINE_NUMBER,
             NVL(ENTERED_DR, 0) AS ENTERED_DR,
             NVL(ENTERED_CR, 0) AS ENTERED_CR,
             NVL(ACCOUNTED_DR, 0) AS ACCOUNTED_DR,
             NVL(ACCOUNTED_CR, 0) AS ACCOUNTED_CR,
             ACCOUNT_COMBINATION, DESCRIPTION, CURRENCY_CODE,
             REFERENCE3
        FROM RR_GL_JE_LINES_ALL
       WHERE JE_HEADER_ID = v_je_header_id
       ORDER BY JE_LINE_NUMBER;

    PROCEDURE append_line(
      p_line_id    NUMBER,
      p_line_num   NUMBER,
      p_dr         NUMBER,
      p_cr         NUMBER,
      p_acc_dr     NUMBER,
      p_acc_cr     NUMBER,
      p_account    VARCHAR2,
      p_desc       VARCHAR2,
      p_curr       VARCHAR2,
      p_ref3       VARCHAR2
    ) IS
    BEGIN
      IF NOT v_first THEN v_result := v_result || ','; END IF;
      v_first := FALSE;
      v_result := v_result || '{'
        || '"lineId":'            || jnum(p_line_id)                          || ','
        || '"lineNumber":'        || jnum(p_line_num)                         || ','
        || '"lineType":'          || jstr(CASE WHEN p_dr > 0 THEN 'DR' ELSE 'CR' END) || ','
        || '"accountingClass":'   || jstr(NVL(p_ref3,'—'))                    || ','
        || '"accountCombination":'|| jstr(p_account)                          || ','
        || '"enteredDr":'         || jnum(p_dr)                               || ','
        || '"enteredCr":'         || jnum(p_cr)                               || ','
        || '"accountedDr":'       || jnum(p_acc_dr)                           || ','
        || '"accountedCr":'       || jnum(p_acc_cr)                           || ','
        || '"currencyCode":'      || jstr(p_curr)                             || ','
        || '"description":'       || jstr(p_desc)
      || '}';
      v_count := v_count + 1;
    END;

  BEGIN
    -- Try main table
    FOR r IN c_lines_main LOOP
      append_line(r.LINE_ID, r.JE_LINE_NUMBER,
                  r.ENTERED_DR, r.ENTERED_CR, r.ACCOUNTED_DR, r.ACCOUNTED_CR,
                  r.ACCOUNT_COMBINATION, r.DESCRIPTION, r.CURRENCY_CODE, r.REFERENCE3);
    END LOOP;

    -- If nothing found, try alternate table
    IF v_count = 0 THEN
      v_first := TRUE;
      BEGIN
        FOR r IN c_lines_alt LOOP
          append_line(r.LINE_ID, r.JE_LINE_NUMBER,
                      r.ENTERED_DR, r.ENTERED_CR, r.ACCOUNTED_DR, r.ACCOUNTED_CR,
                      r.ACCOUNT_COMBINATION, r.DESCRIPTION, r.CURRENCY_CODE, r.REFERENCE3);
        END LOOP;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END;

  v_result := v_result || ']}';

  :status_code := 200;
  OWA_UTIL.MIME_HEADER('application/json', TRUE);
  HTP.PRN(v_result);

EXCEPTION
  WHEN OTHERS THEN
    :status_code := 500;
    OWA_UTIL.MIME_HEADER('application/json', TRUE);
    HTP.PRN('{"found":false,"error":"' || REPLACE(SQLERRM,'"','\"') || '"}');
END;]'
  );
  COMMIT;
END;
/
