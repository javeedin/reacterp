-- =============================================================================
-- 13_UPDATE_JOURNAL_HANDLER.SQL
-- Adds a PUT endpoint to update an existing journal:
--   PUT reerp/gl/journals/:jeHeaderId
--
-- Payload (JSON body):
--   {
--     "jeHeaderId":      12345,
--     "jeBatchId":       67890,
--     "batchDescription": "...",
--     "journalDescription": "...",
--     "lines": [
--       {
--         "lineNum": 1,
--         "account": "01-000-1000-00-000",
--         "description": "...",
--         "enteredDr": 1000.00,
--         "enteredCr": 0.00,
--         "accountedDr": 1000.00,
--         "accountedCr": 0.00,
--         "currency": "AED"
--       }, ...
--     ]
--   }
--
-- Actions performed:
--   1. Update JOURNAL_DESCRIPTION in RR_GL_HEADERS
--   2. Update BATCH_DESCRIPTION  in RR_GL_JOURNAL_BATCHES
--   3. Delete all existing lines from RR_GL_LINES_ALL for this header
--   4. Re-insert lines from the JSON array
--   5. Recalculate RUNNING_TOTAL_DR/CR on RR_GL_HEADERS
-- =============================================================================

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'gl/journals/:jeHeaderId',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'Update GL journal header, batch description, and lines'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/journals/:jeHeaderId',
        p_method         => 'PUT',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_source         => q'[
            DECLARE
                v_je_header_id     NUMBER  := TO_NUMBER(:jeHeaderId);
                v_je_batch_id      NUMBER;
                v_batch_desc       VARCHAR2(4000);
                v_journal_desc     VARCHAR2(4000);
                v_line_count       PLS_INTEGER := 0;
                v_total_dr         NUMBER := 0;
                v_total_cr         NUMBER := 0;
                -- per-line variables
                v_line_num         NUMBER;
                v_line_account     VARCHAR2(750);
                v_line_desc        VARCHAR2(4000);
                v_line_dr          NUMBER;
                v_line_cr          NUMBER;
                v_line_currency    VARCHAR2(15);
            BEGIN
                -- Parse the JSON request body
                APEX_JSON.PARSE(:body_text);

                v_je_batch_id  := APEX_JSON.GET_NUMBER(p_path  => 'jeBatchId');
                v_batch_desc   := APEX_JSON.GET_VARCHAR2(p_path => 'batchDescription');
                v_journal_desc := APEX_JSON.GET_VARCHAR2(p_path => 'journalDescription');

                -- 1. Update journal header description
                UPDATE RR_GL_HEADERS
                SET    JOURNAL_DESCRIPTION = v_journal_desc,
                       LAST_UPDATED_BY     = 'REACTERP',
                       LAST_UPDATE_DATE    = SYSTIMESTAMP
                WHERE  JE_HEADER_ID        = v_je_header_id;

                -- 2. Update batch description
                UPDATE RR_GL_JOURNAL_BATCHES
                SET    BATCH_DESCRIPTION   = v_batch_desc,
                       LAST_UPDATED_BY     = 'REACTERP',
                       LAST_UPDATE_DATE    = SYSTIMESTAMP
                WHERE  JE_BATCH_ID         = v_je_batch_id;

                -- 3. Delete all existing lines for this header
                DELETE FROM RR_GL_LINES_ALL
                WHERE  JE_HEADER_ID = v_je_header_id;

                -- 4. Re-insert lines from payload
                v_line_count := NVL(APEX_JSON.GET_COUNT(p_path => 'lines'), 0);

                FOR i IN 1..v_line_count LOOP
                    v_line_num      := NVL(APEX_JSON.GET_NUMBER(p_path   => 'lines[%d].lineNum',     p0 => i), i);
                    v_line_account  := APEX_JSON.GET_VARCHAR2(p_path     => 'lines[%d].account',     p0 => i);
                    v_line_desc     := APEX_JSON.GET_VARCHAR2(p_path     => 'lines[%d].description', p0 => i);
                    v_line_dr       := NVL(APEX_JSON.GET_NUMBER(p_path   => 'lines[%d].enteredDr',   p0 => i), 0);
                    v_line_cr       := NVL(APEX_JSON.GET_NUMBER(p_path   => 'lines[%d].enteredCr',   p0 => i), 0);
                    v_line_currency := APEX_JSON.GET_VARCHAR2(p_path     => 'lines[%d].currency',    p0 => i);

                    INSERT INTO RR_GL_LINES_ALL (
                        JE_HEADER_ID,
                        BATCH_ID,
                        JE_LINE_NUMBER,
                        ACCOUNT_COMBINATION,
                        DESCRIPTION,
                        ENTERED_DR,
                        ENTERED_CR,
                        ACCOUNTED_DR,
                        ACCOUNTED_CR,
                        CURRENCY_CODE,
                        CREATED_BY,
                        CREATION_DATE,
                        LAST_UPDATED_BY,
                        LAST_UPDATE_DATE
                    ) VALUES (
                        v_je_header_id,
                        v_je_batch_id,
                        v_line_num,
                        v_line_account,
                        v_line_desc,
                        v_line_dr,
                        v_line_cr,
                        v_line_dr,           -- accounted DR = entered DR (1:1 rate assumption)
                        v_line_cr,           -- accounted CR = entered CR
                        v_line_currency,
                        'REACTERP',
                        SYSTIMESTAMP,
                        'REACTERP',
                        SYSTIMESTAMP
                    );

                    v_total_dr := v_total_dr + v_line_dr;
                    v_total_cr := v_total_cr + v_line_cr;
                END LOOP;

                -- 5. Recalculate running totals on the header
                UPDATE RR_GL_HEADERS
                SET    RUNNING_TOTAL_DR           = v_total_dr,
                       RUNNING_TOTAL_CR           = v_total_cr,
                       RUNNING_TOTAL_ACCOUNTED_DR = v_total_dr,
                       RUNNING_TOTAL_ACCOUNTED_CR = v_total_cr,
                       LAST_UPDATE_DATE           = SYSTIMESTAMP
                WHERE  JE_HEADER_ID = v_je_header_id;

                COMMIT;

                :status := 200;
                APEX_JSON.OPEN_OBJECT;
                APEX_JSON.WRITE('success',      TRUE);
                APEX_JSON.WRITE('message',      'Journal updated successfully');
                APEX_JSON.WRITE('jeHeaderId',   v_je_header_id);
                APEX_JSON.WRITE('jeBatchId',    v_je_batch_id);
                APEX_JSON.WRITE('linesUpdated', v_line_count);
                APEX_JSON.WRITE('totalDr',      v_total_dr);
                APEX_JSON.WRITE('totalCr',      v_total_cr);
                APEX_JSON.CLOSE_OBJECT;

            EXCEPTION
                WHEN OTHERS THEN
                    ROLLBACK;
                    :status := 500;
                    APEX_JSON.OPEN_OBJECT;
                    APEX_JSON.WRITE('success', FALSE);
                    APEX_JSON.WRITE('error',   SQLERRM);
                    APEX_JSON.WRITE('errorCode', SQLCODE);
                    APEX_JSON.CLOSE_OBJECT;
            END;
        ]'
    );
    COMMIT;
END;
/
