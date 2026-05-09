-- ============================================================
-- Add company-segment cross-company validation to:
--   1. RR_INSERT_GL_JOURNALS_POST  (journals/create)
--   2. RR_SLA_PKG.create_accounting (sla/accounting/create)
--
-- Rule: segment 1 (company) of every account combination in a
-- journal batch must be identical. A mismatch is logged to
-- RR_GL_JOURNAL_VALIDATION_LOG — the journal is NOT rejected,
-- but the anomaly is captured for review.
--
-- Account combination format: SS-00-00-NNNNNN-CCCC-000-00-000-000
--   Segment 1 = REGEXP_SUBSTR(combination, '[^-]+', 1, 1)
-- ============================================================

-- ── 1. RR_INSERT_GL_JOURNALS_POST ────────────────────────────
CREATE OR REPLACE PROCEDURE RR_INSERT_GL_JOURNALS_POST (
    p_json_input   IN  CLOB,
    p_json_output  OUT CLOB
)
AS
    l_batch_id       NUMBER;
    l_header_id      NUMBER;
    l_line_id        NUMBER;
    l_line_count     NUMBER := 0;
    l_result_obj     JSON_OBJECT_T := JSON_OBJECT_T();
    l_input_obj      JSON_OBJECT_T;
    l_batch_obj      JSON_OBJECT_T;
    l_header_obj     JSON_OBJECT_T;
    l_lines_arr      JSON_ARRAY_T;
    l_line_obj       JSON_OBJECT_T;
    l_step           VARCHAR2(200);

    -- Batch variables
    v_batch_name            VARCHAR2(500);
    v_batch_description     VARCHAR2(2000);
    v_batch_ledger_name     VARCHAR2(500);
    v_batch_ledger_id       NUMBER;
    v_batch_status          VARCHAR2(100);
    v_batch_period          VARCHAR2(100);
    v_batch_control_total   NUMBER;
    v_batch_total_dr        NUMBER;
    v_batch_total_cr        NUMBER;
    v_batch_source          VARCHAR2(500);
    v_batch_created_by      VARCHAR2(500);

    -- Header variables
    v_header_ledger_id          NUMBER;
    v_header_ledger_name        VARCHAR2(500);
    v_header_je_category        VARCHAR2(500);
    v_header_je_source          VARCHAR2(500);
    v_header_period_name        VARCHAR2(100);
    v_header_journal_name       VARCHAR2(500);
    v_header_description        VARCHAR2(2000);
    v_header_currency           VARCHAR2(50);
    v_header_conv_type          VARCHAR2(100);
    v_header_conv_date          DATE;
    v_header_conv_rate          NUMBER;
    v_header_status             VARCHAR2(100);
    v_header_total_dr           NUMBER;
    v_header_total_cr           NUMBER;
    v_header_created_by         VARCHAR2(500);
    v_header_effective_date     DATE;

    -- Line variables
    v_line_entered_dr       NUMBER;
    v_line_entered_cr       NUMBER;
    v_line_accounted_dr     NUMBER;
    v_line_accounted_cr     NUMBER;
    v_line_stat_amount      NUMBER;
    v_line_description      VARCHAR2(2000);
    v_line_currency         VARCHAR2(50);
    v_line_conv_date        DATE;
    v_line_conv_rate        NUMBER;
    v_line_conv_type        VARCHAR2(100);
    v_line_account_comb     VARCHAR2(500);
    v_line_coa_name         VARCHAR2(500);
    v_line_ref1             VARCHAR2(500);
    v_line_ref2             VARCHAR2(500);
    v_line_ref3             VARCHAR2(500);
    v_line_ref4             VARCHAR2(500);
    v_line_ref5             VARCHAR2(500);
    v_line_created_by       VARCHAR2(500);

    v_eff_rate              NUMBER;

    -- Company-segment validation
    v_first_company         VARCHAR2(100);
    v_line_company          VARCHAR2(100);
    v_mismatch_found        BOOLEAN := FALSE;
    v_mismatch_detail       CLOB    := '[]';
    v_detail_arr            VARCHAR2(32767) := '';

    FUNCTION safe_get_string(p_obj JSON_OBJECT_T, p_key VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        IF p_obj.has(p_key) AND NOT p_obj.get(p_key).is_null() THEN
            RETURN p_obj.get_string(p_key);
        END IF;
        RETURN NULL;
    EXCEPTION
        WHEN OTHERS THEN RETURN NULL;
    END;

    FUNCTION safe_get_number(p_obj JSON_OBJECT_T, p_key VARCHAR2) RETURN NUMBER IS
    BEGIN
        IF p_obj.has(p_key) AND NOT p_obj.get(p_key).is_null() THEN
            RETURN p_obj.get_number(p_key);
        END IF;
        RETURN NULL;
    EXCEPTION
        WHEN OTHERS THEN RETURN NULL;
    END;

    FUNCTION safe_get_date(p_obj JSON_OBJECT_T, p_key VARCHAR2) RETURN DATE IS
        l_date_str VARCHAR2(100);
    BEGIN
        IF p_obj.has(p_key) AND NOT p_obj.get(p_key).is_null() THEN
            l_date_str := p_obj.get_string(p_key);
            IF l_date_str IS NOT NULL THEN
                BEGIN
                    RETURN TO_DATE(SUBSTR(l_date_str, 1, 10), 'YYYY-MM-DD');
                EXCEPTION WHEN OTHERS THEN RETURN NULL;
                END;
            END IF;
        END IF;
        RETURN NULL;
    EXCEPTION
        WHEN OTHERS THEN RETURN NULL;
    END;

BEGIN
    l_step := 'Parsing JSON input';
    l_input_obj  := JSON_OBJECT_T.parse(p_json_input);
    l_batch_obj  := l_input_obj.get_Object('batch');
    l_header_obj := l_input_obj.get_Object('header');
    l_lines_arr  := l_input_obj.get_Array('lines');

    l_step := 'Getting sequence values';
    l_batch_id  := RR_GL_BATCH_SEQ.NEXTVAL;
    l_header_id := RR_GL_HEADER_SEQ.NEXTVAL;

    -- ── Batch ────────────────────────────────────────────────────────────────
    l_step := 'Extracting batch values';
    v_batch_name          := safe_get_string(l_batch_obj, 'batchName');
    v_batch_description   := safe_get_string(l_batch_obj, 'batchDescription');
    v_batch_ledger_name   := safe_get_string(l_batch_obj, 'ledgerName');
    v_batch_ledger_id     := safe_get_number(l_batch_obj, 'ledgerId');
    v_batch_status        := NVL(safe_get_string(l_batch_obj, 'status'), 'NEW');
    v_batch_period        := safe_get_string(l_batch_obj, 'accountingPeriod');
    v_batch_control_total := safe_get_number(l_batch_obj, 'controlTotal');
    v_batch_total_dr      := safe_get_number(l_batch_obj, 'runningTotalDr');
    v_batch_total_cr      := safe_get_number(l_batch_obj, 'runningTotalCr');
    v_batch_source        := safe_get_string(l_batch_obj, 'batchSource');
    v_batch_created_by    := safe_get_string(l_batch_obj, 'createdBy');

    l_step := 'Inserting batch';
    INSERT INTO RR_GL_JOURNAL_BATCHES (
        BATCH_SYNC_ID, JE_BATCH_ID, BATCH_NAME, BATCH_DESCRIPTION,
        LEDGER_NAME, LEDGER_ID, STATUS_MEANING, DEFAULT_PERIOD_NAME,
        CONTROL_TOTAL, RUNNING_TOTAL_DR, RUNNING_TOTAL_CR,
        USER_JE_SOURCE_NAME,
        CREATED_BY, CREATION_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
    ) VALUES (
        l_batch_id, l_batch_id, v_batch_name, v_batch_description,
        v_batch_ledger_name, v_batch_ledger_id, v_batch_status, v_batch_period,
        v_batch_control_total, v_batch_total_dr, v_batch_total_cr,
        v_batch_source,
        v_batch_created_by, SYSDATE, v_batch_created_by, SYSDATE
    );

    -- ── Header ───────────────────────────────────────────────────────────────
    l_step := 'Extracting header values';
    v_header_ledger_id      := safe_get_number(l_header_obj, 'ledgerId');
    v_header_ledger_name    := safe_get_string(l_header_obj, 'ledgerName');
    v_header_je_category    := safe_get_string(l_header_obj, 'jeCategory');
    v_header_je_source      := safe_get_string(l_header_obj, 'jeSource');
    v_header_period_name    := safe_get_string(l_header_obj, 'periodName');
    v_header_journal_name   := safe_get_string(l_header_obj, 'journalName');
    v_header_description    := safe_get_string(l_header_obj, 'description');
    v_header_currency       := safe_get_string(l_header_obj, 'currencyCode');
    v_header_conv_type      := safe_get_string(l_header_obj, 'currencyConversionType');
    v_header_conv_date      := safe_get_date(l_header_obj,   'currencyConversionDate');
    v_header_conv_rate      := safe_get_number(l_header_obj, 'currencyConversionRate');
    v_header_status         := safe_get_string(l_header_obj, 'status');
    v_header_total_dr       := safe_get_number(l_header_obj, 'runningTotalDr');
    v_header_total_cr       := safe_get_number(l_header_obj, 'runningTotalCr');
    v_header_created_by     := safe_get_string(l_header_obj, 'createdBy');
    v_header_effective_date := safe_get_date(l_header_obj,   'defaultEffectiveDate');

    l_step := 'Inserting header';
    INSERT INTO RR_GL_JE_HEADERS (
        JE_HEADER_ID, BATCH_ID,
        LEDGER_ID, LEDGER_NAME,
        USER_JE_CATEGORY_NAME, USER_JE_SOURCE_NAME,
        PERIOD_NAME, JOURNAL_NAME, JOURNAL_DESCRIPTION,
        CURRENCY_CODE, USER_CURRENCY_CONVERSION_TYPE,
        CURRENCY_CONVERSION_DATE, CURRENCY_CONVERSION_RATE,
        DEFAULT_EFFECTIVE_DATE, POSTING_STATUS,
        RUNNING_TOTAL_DR, RUNNING_TOTAL_CR,
        CREATED_BY, CREATION_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
    ) VALUES (
        l_header_id, l_batch_id,
        v_header_ledger_id, v_header_ledger_name,
        v_header_je_category, v_header_je_source,
        v_header_period_name, v_header_journal_name, v_header_description,
        v_header_currency, v_header_conv_type,
        v_header_conv_date, v_header_conv_rate,
        NVL(v_header_effective_date, SYSDATE), NVL(v_header_status, 'NEW'),
        NVL(v_header_total_dr, 0), NVL(v_header_total_cr, 0),
        v_header_created_by, SYSDATE, v_header_created_by, SYSDATE
    );

    -- ── Lines ────────────────────────────────────────────────────────────────
    l_step := 'Processing lines';
    FOR i IN 0 .. l_lines_arr.get_size() - 1 LOOP
        l_line_obj   := JSON_OBJECT_T(l_lines_arr.get(i));
        l_line_id    := RR_GL_LINE_SEQ.NEXTVAL;
        l_line_count := l_line_count + 1;

        l_step := 'Extracting line ' || l_line_count || ' values';
        v_line_entered_dr   := safe_get_number(l_line_obj, 'enteredDr');
        v_line_entered_cr   := safe_get_number(l_line_obj, 'enteredCr');
        v_line_stat_amount  := safe_get_number(l_line_obj, 'statAmount');
        v_line_description  := safe_get_string(l_line_obj, 'description');
        v_line_currency     := safe_get_string(l_line_obj, 'currencyCode');
        v_line_conv_date    := safe_get_date(l_line_obj,   'currencyConversionDate');
        v_line_conv_rate    := safe_get_number(l_line_obj, 'currencyConversionRate');
        v_line_conv_type    := safe_get_string(l_line_obj, 'userCurrencyConversionType');
        v_line_account_comb := safe_get_string(l_line_obj, 'accountCombination');
        v_line_coa_name     := safe_get_string(l_line_obj, 'chartOfAccountsName');
        v_line_ref1         := safe_get_string(l_line_obj, 'reference1');
        v_line_ref2         := safe_get_string(l_line_obj, 'reference2');
        v_line_ref3         := safe_get_string(l_line_obj, 'reference3');
        v_line_ref4         := safe_get_string(l_line_obj, 'reference4');
        v_line_ref5         := safe_get_string(l_line_obj, 'reference5');
        v_line_created_by   := safe_get_string(l_line_obj, 'createdBy');

        -- ── Company segment validation ───────────────────────────────────────
        -- Segment 1 = first token before '-' in the account combination.
        v_line_company := REGEXP_SUBSTR(v_line_account_comb, '[^-]+', 1, 1);
        IF l_line_count = 1 THEN
            v_first_company := v_line_company;
        ELSIF v_line_company IS NOT NULL
              AND v_first_company IS NOT NULL
              AND v_line_company != v_first_company
        THEN
            v_mismatch_found := TRUE;
            -- Accumulate JSON array of mismatching combinations
            IF v_detail_arr IS NOT NULL THEN v_detail_arr := v_detail_arr || ','; END IF;
            v_detail_arr := v_detail_arr
                || '{"line":' || l_line_count
                || ',"combination":"' || REPLACE(v_line_account_comb, '"', '\"')
                || '","company":"' || v_line_company || '"}';
        END IF;

        -- ── Accounted DR/CR ──────────────────────────────────────────────────
        v_eff_rate := NVL(v_line_conv_rate, NVL(v_header_conv_rate, 1));
        IF v_eff_rate IS NULL OR v_eff_rate <= 0 THEN
            v_eff_rate := 1;
        END IF;

        IF UPPER(NVL(v_header_je_category, '')) = 'REVALUATION' THEN
            v_line_accounted_dr := safe_get_number(l_line_obj, 'accountedDr');
            v_line_accounted_cr := safe_get_number(l_line_obj, 'accountedCr');
            IF v_line_accounted_dr IS NULL THEN
                v_line_accounted_dr := ROUND(NVL(v_line_entered_dr, 0) * v_eff_rate, 2);
            END IF;
            IF v_line_accounted_cr IS NULL THEN
                v_line_accounted_cr := ROUND(NVL(v_line_entered_cr, 0) * v_eff_rate, 2);
            END IF;
        ELSE
            v_line_accounted_dr := ROUND(NVL(v_line_entered_dr, 0) * v_eff_rate, 2);
            v_line_accounted_cr := ROUND(NVL(v_line_entered_cr, 0) * v_eff_rate, 2);
        END IF;

        l_step := 'Inserting line ' || l_line_count;
        INSERT INTO RR_GL_JE_LINES_ALL (
            BATCH_ID, JE_HEADER_ID, JE_LINE_NUMBER,
            ENTERED_DR, ENTERED_CR, ACCOUNTED_DR, ACCOUNTED_CR,
            STAT_AMOUNT, DESCRIPTION,
            CURRENCY_CODE, CURRENCY_CONVERSION_DATE,
            CURRENCY_CONVERSION_RATE, USER_CURRENCY_CONVERSION_TYPE,
            ACCOUNT_COMBINATION, CHART_OF_ACCOUNTS_NAME,
            REFERENCE1, REFERENCE2, REFERENCE3, REFERENCE4, REFERENCE5,
            CREATED_BY, CREATION_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
        ) VALUES (
            l_batch_id, l_header_id, l_line_count,
            v_line_entered_dr, v_line_entered_cr,
            v_line_accounted_dr, v_line_accounted_cr,
            v_line_stat_amount, v_line_description,
            v_line_currency, v_line_conv_date,
            v_line_conv_rate, v_line_conv_type,
            v_line_account_comb, v_line_coa_name,
            v_line_ref1, v_line_ref2, v_line_ref3, v_line_ref4, v_line_ref5,
            v_line_created_by, SYSDATE, v_line_created_by, SYSDATE
        );
    END LOOP;

    -- ── Company segment mismatch: log warning (non-blocking) ─────────────────
    IF v_mismatch_found THEN
        BEGIN
            v_mismatch_detail := TO_CLOB(
                '[{"line":1,"combination":"' ||
                REPLACE(safe_get_string(JSON_OBJECT_T(l_lines_arr.get(0)), 'accountCombination'), '"', '\"') ||
                '","company":"' || v_first_company || '"},' || v_detail_arr || ']'
            );
            INSERT INTO RR_GL_JOURNAL_VALIDATION_LOG (
                SOURCE, BATCH_ID, HEADER_ID,
                SOURCE_NUMBER, SOURCE_ID,
                VALIDATION_TYPE, MESSAGE, LINE_DETAILS,
                CREATED_BY
            ) VALUES (
                'GL_JOURNAL', l_batch_id, l_header_id,
                v_line_ref1, v_line_ref2,
                'COMPANY_SEGMENT_MISMATCH',
                'Journal lines contain multiple company segments. '
                    || 'First line company: ' || v_first_company || '. '
                    || 'Batch: ' || v_batch_name,
                v_mismatch_detail,
                v_batch_created_by
            );
        EXCEPTION WHEN OTHERS THEN NULL;  -- log failure must not abort the journal
        END;
    END IF;

    COMMIT;

    l_result_obj.put('status',    'SUCCESS');
    l_result_obj.put('jeBatchId', l_batch_id);
    l_result_obj.put('jeHeaderId', l_header_id);
    l_result_obj.put('lineCount', l_line_count);
    IF v_mismatch_found THEN
        l_result_obj.put('warning', 'Company segment mismatch detected across journal lines — logged to RR_GL_JOURNAL_VALIDATION_LOG');
    END IF;
    p_json_output := l_result_obj.to_clob();

EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        l_result_obj := JSON_OBJECT_T();
        l_result_obj.put('status',  'ERROR');
        l_result_obj.put('step',    l_step);
        l_result_obj.put('message', SQLERRM);
        l_result_obj.put('sqlcode', SQLCODE);
        p_json_output := l_result_obj.to_clob();
END RR_INSERT_GL_JOURNALS_POST;
/

DBMS_OUTPUT.PUT_LINE('RR_INSERT_GL_JOURNALS_POST updated — company segment cross-company validation added');


-- ============================================================
-- 2. RR_SLA_PKG.create_accounting — company segment validation
--
-- Add the block below inside RR_SLA_PKG body, at the END of the
-- create_accounting procedure, BEFORE the final COMMIT, after
-- all lines have been inserted into RR_SLA_ACCOUNTING_LINES.
--
-- Replace  <p_header_id>  with the local variable holding the
-- newly created SLA header_id, and <p_source_number> /
-- <p_source_id> with whatever variables hold those values.
-- ============================================================

/*
── PASTE THIS BLOCK into RR_SLA_PKG.create_accounting ──────────

    -- Company segment validation (non-blocking — logs to RR_GL_JOURNAL_VALIDATION_LOG)
    DECLARE
        v_sla_first_company  VARCHAR2(100);
        v_sla_mismatch       BOOLEAN := FALSE;
        v_sla_detail         VARCHAR2(32767) := '';
        v_sla_line_num       NUMBER  := 0;
    BEGIN
        FOR rec IN (
            SELECT account_combination,
                   REGEXP_SUBSTR(account_combination, '[^-]+', 1, 1) AS company
            FROM   RR_SLA_ACCOUNTING_LINES
            WHERE  header_id = <p_header_id>
            ORDER  BY line_id
        ) LOOP
            v_sla_line_num := v_sla_line_num + 1;
            IF v_sla_line_num = 1 THEN
                v_sla_first_company := rec.company;
            ELSIF rec.company IS NOT NULL
                  AND v_sla_first_company IS NOT NULL
                  AND rec.company != v_sla_first_company
            THEN
                v_sla_mismatch := TRUE;
                IF v_sla_detail IS NOT NULL THEN v_sla_detail := v_sla_detail || ','; END IF;
                v_sla_detail := v_sla_detail
                    || '{"line":' || v_sla_line_num
                    || ',"combination":"' || REPLACE(rec.account_combination, '"', '\"')
                    || '","company":"' || rec.company || '"}';
            END IF;
        END LOOP;

        IF v_sla_mismatch THEN
            INSERT INTO RR_GL_JOURNAL_VALIDATION_LOG (
                SOURCE, HEADER_ID, SOURCE_NUMBER, SOURCE_ID,
                VALIDATION_TYPE, MESSAGE, LINE_DETAILS, CREATED_BY
            ) VALUES (
                'SLA', <p_header_id>, <p_source_number>, TO_CHAR(<p_source_id>),
                'COMPANY_SEGMENT_MISMATCH',
                'SLA lines contain multiple company segments. First company: ' || v_sla_first_company,
                TO_CLOB('[' || v_sla_detail || ']'),
                <p_created_by>
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

*/
