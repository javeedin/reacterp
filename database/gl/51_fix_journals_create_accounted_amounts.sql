-- ============================================================
-- Fix: journals/create — reliably store ACCOUNTED_DR/CR
--
-- Problem: for Revaluation journals, enteredDr/Cr = 0 and
-- accountedDr/Cr carry the actual AED amounts. The previous
-- NVL(accountedDr, enteredDr) fallback correctly reads the
-- explicit accountedDr from the JSON. However the handler also
-- needs to store CURRENCY_CONVERSION_RATE per line so that the
-- line-level display can show the correct converted amounts.
-- Additionally the header RUNNING_TOTAL_ACCOUNTED_DR/CR was
-- always set equal to the entered totals — now it reads the
-- explicit runningTotalAccountedDr/Cr from the payload so that
-- Revaluation journal header totals reflect AED amounts.
-- ============================================================

BEGIN
  ORDS.DEFINE_HANDLER(
    p_module_name    => 'reerp',
    p_pattern        => 'journals/create',
    p_method         => 'POST',
    p_source_type    => 'plsql/block',
    p_items_per_page => 0,
    p_mimes_allowed  => 'application/json',
    p_comments       => 'Create GL journal batch + header + lines (sequence-based JE_HEADER_ID)',
    p_source         => q'[
DECLARE
  v_body            CLOB;
  v_batch           JSON_OBJECT_T;
  v_header          JSON_OBJECT_T;
  v_lines           JSON_ARRAY_T;
  v_line            JSON_OBJECT_T;

  v_je_batch_id     NUMBER;
  v_je_header_id    NUMBER;
  v_batch_name      VARCHAR2(240);
  v_header_name     VARCHAR2(240);
  v_period          VARCHAR2(15);
  v_ledger          VARCHAR2(240);
  v_ledger_id       NUMBER;
  v_currency        VARCHAR2(15);
  v_category        VARCHAR2(80);
  v_source          VARCHAR2(80);
  v_eff_date        DATE;
  v_conv_rate       NUMBER := 1;
  v_total_dr        NUMBER := 0;
  v_total_cr        NUMBER := 0;
  v_acct_total_dr   NUMBER := 0;
  v_acct_total_cr   NUMBER := 0;
  v_ctrl_total      NUMBER;
  v_line_num        NUMBER := 0;
  v_created_by      VARCHAR2(100);
  v_description     VARCHAR2(4000);
  v_acct_period     VARCHAR2(15);
  v_status          VARCHAR2(30);
  v_batch_desc      VARCHAR2(4000);
  v_batch_source    VARCHAR2(240);
  v_ent_dr          NUMBER;
  v_ent_cr          NUMBER;
  v_acc_dr          NUMBER;
  v_acc_cr          NUMBER;
BEGIN
  v_body := :body_text;

  DECLARE v_root JSON_OBJECT_T; BEGIN
    v_root   := JSON_OBJECT_T.parse(v_body);
    v_batch  := v_root.get_object('batch');
    v_header := v_root.get_object('header');
    v_lines  := v_root.get_array('lines');
  END;

  -- ── Batch fields ──────────────────────────────────────────────────────────
  v_batch_name   := v_batch.get_string('batchName');
  v_batch_desc   := v_batch.get_string('batchDescription');
  v_ledger       := v_batch.get_string('ledgerName');
  v_ledger_id    := v_batch.get_number('ledgerId');
  v_acct_period  := v_batch.get_string('accountingPeriod');
  v_ctrl_total   := NVL(v_batch.get_number('controlTotal'), 0);
  v_status       := NVL(v_batch.get_string('status'), 'NEW');
  v_batch_source := v_batch.get_string('batchSource');
  v_created_by   := NVL(v_batch.get_string('createdBy'), USER);

  INSERT INTO RR_GL_JOURNAL_BATCHES (
    BATCH_NAME, BATCH_DESCRIPTION, LEDGER_NAME, LEDGER_ID,
    ACCOUNTING_PERIOD, CONTROL_TOTAL, STATUS, STATUS_MEANING,
    RUNNING_TOTAL_DR, RUNNING_TOTAL_CR, USER_JE_SOURCE_NAME, CREATED_BY
  ) VALUES (
    v_batch_name, v_batch_desc, v_ledger, v_ledger_id,
    v_acct_period, v_ctrl_total, v_status,
    CASE v_status WHEN 'P' THEN 'Posted' WHEN 'NEW' THEN 'Unposted' ELSE v_status END,
    NVL(v_batch.get_number('runningTotalDr'), 0),
    NVL(v_batch.get_number('runningTotalCr'), 0),
    NVL(v_batch_source, 'Manual'),
    v_created_by
  )
  RETURNING JE_BATCH_ID INTO v_je_batch_id;

  -- ── Header fields ─────────────────────────────────────────────────────────
  v_header_name   := v_header.get_string('journalName');
  v_description   := v_header.get_string('description');
  v_period        := v_header.get_string('periodName');
  v_currency      := v_header.get_string('currencyCode');
  v_category      := v_header.get_string('jeCategory');
  v_source        := v_header.get_string('jeSource');
  v_eff_date      := TO_DATE(SUBSTR(NVL(v_header.get_string('currencyConversionDate'), v_acct_period), 1, 10), 'YYYY-MM-DD');
  v_total_dr      := NVL(v_header.get_number('runningTotalDr'), 0);
  v_total_cr      := NVL(v_header.get_number('runningTotalCr'), 0);
  v_conv_rate     := NVL(v_header.get_number('currencyConversionRate'), 1);
  -- Prefer explicit accounted totals from payload (Revaluation journals pass these separately).
  -- Fall back to entered totals when not supplied.
  v_acct_total_dr := NVL(v_header.get_number('runningTotalAccountedDr'), v_total_dr);
  v_acct_total_cr := NVL(v_header.get_number('runningTotalAccountedCr'), v_total_cr);

  v_je_header_id  := SEQ_RR_GL_JE_HEADER_ID.NEXTVAL;

  INSERT INTO RR_GL_HEADERS (
    JE_HEADER_ID, BATCH_ID, JOURNAL_NAME, JOURNAL_DESCRIPTION,
    PERIOD_NAME, DEFAULT_EFFECTIVE_DATE, CURRENCY_CODE,
    USER_JE_CATEGORY_NAME, RUNNING_TOTAL_DR, RUNNING_TOTAL_CR,
    RUNNING_TOTAL_ACCOUNTED_DR, RUNNING_TOTAL_ACCOUNTED_CR,
    LEDGER_NAME, LEGAL_ENTITY_NAME, CREATED_BY
  ) VALUES (
    v_je_header_id, v_je_batch_id, v_header_name, v_description,
    v_period, v_eff_date, v_currency,
    v_category, v_total_dr, v_total_cr,
    v_acct_total_dr, v_acct_total_cr,
    v_ledger,
    NVL(v_header.get_string('legalEntityName'), NULL),
    v_created_by
  );

  -- ── Lines ─────────────────────────────────────────────────────────────────
  FOR i IN 0 .. v_lines.get_size - 1 LOOP
    v_line    := TREAT(v_lines.get(i) AS JSON_OBJECT_T);
    v_line_num := v_line_num + 1;

    v_ent_dr := v_line.get_number('enteredDr');
    v_ent_cr := v_line.get_number('enteredCr');

    -- Prefer explicit accountedDr/Cr from the payload.
    -- Revaluation journals send entered=0 and explicit accounted=AED amounts.
    -- Fall back to entered * header conversion rate only when accountedDr/Cr is absent.
    v_acc_dr := v_line.get_number('accountedDr');
    IF v_acc_dr IS NULL THEN
        v_acc_dr := ROUND(NVL(v_ent_dr, 0) * v_conv_rate, 2);
    END IF;

    v_acc_cr := v_line.get_number('accountedCr');
    IF v_acc_cr IS NULL THEN
        v_acc_cr := ROUND(NVL(v_ent_cr, 0) * v_conv_rate, 2);
    END IF;

    INSERT INTO RR_GL_LINES_ALL (
      JE_HEADER_ID, JE_LINE_NUMBER, BATCH_ID,
      ENTERED_DR, ENTERED_CR, ACCOUNTED_DR, ACCOUNTED_CR,
      DESCRIPTION, CURRENCY_CODE,
      CURRENCY_CONVERSION_DATE, CURRENCY_CONVERSION_RATE,
      USER_CURRENCY_CONVERSION_TYPE,
      ACCOUNT_COMBINATION, CHART_OF_ACCOUNTS_NAME,
      REFERENCE1, REFERENCE2, REFERENCE3, REFERENCE4, REFERENCE5,
      CREATED_BY
    ) VALUES (
      v_je_header_id, v_line_num, v_je_batch_id,
      v_ent_dr,
      v_ent_cr,
      v_acc_dr,
      v_acc_cr,
      v_line.get_string('description'),
      NVL(v_line.get_string('currencyCode'), v_currency),
      v_eff_date,
      v_conv_rate,
      'User',
      v_line.get_string('accountCombination'),
      NVL(v_line.get_string('chartOfAccountsName'), 'Chart of Accounts'),
      v_line.get_string('reference1'),
      NVL(v_line.get_string('reference2'), v_batch_name),
      v_line.get_string('reference3'),
      v_line.get_string('reference4'),
      v_line.get_string('reference5'),
      NVL(v_line.get_string('createdBy'), v_created_by)
    );
  END LOOP;

  COMMIT;

  :status_code := 201;
  APEX_JSON.OPEN_OBJECT;
  APEX_JSON.WRITE('success',       TRUE);
  APEX_JSON.WRITE('jeBatchId',     v_je_batch_id);
  APEX_JSON.WRITE('jeHeaderId',    v_je_header_id);
  APEX_JSON.WRITE('linesInserted', v_line_num);
  APEX_JSON.WRITE('batchName',     v_batch_name);
  APEX_JSON.CLOSE_OBJECT;

EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    :status_code := 500;
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', FALSE);
    APEX_JSON.WRITE('error',   SQLERRM);
    APEX_JSON.WRITE('detail',  DBMS_UTILITY.FORMAT_ERROR_BACKTRACE);
    APEX_JSON.CLOSE_OBJECT;
END;
]'
  );
  COMMIT;
  DBMS_OUTPUT.PUT_LINE('journals/create handler updated — accountedDr/Cr now stored reliably via explicit IF-NULL logic + conversion rate stored per line');
END;
/
