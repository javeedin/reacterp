-- ============================================================
-- Create RR_GL_JOURNAL_VALIDATION_LOG table
--
-- Captures cross-company and other structural anomalies detected
-- during journal creation (GL and SLA) without blocking the post.
-- ============================================================

-- ── Table ────────────────────────────────────────────────────
DECLARE
    l_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO l_count FROM user_tables
    WHERE table_name = 'RR_GL_JOURNAL_VALIDATION_LOG';
    IF l_count = 0 THEN
        EXECUTE IMMEDIATE q'[
            CREATE TABLE RR_GL_JOURNAL_VALIDATION_LOG (
                LOG_ID            NUMBER        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                SOURCE            VARCHAR2(30)  NOT NULL,   -- 'GL_JOURNAL' | 'SLA'
                BATCH_ID          NUMBER,                   -- GL je_batch_id
                HEADER_ID         NUMBER,                   -- GL je_header_id or SLA header_id
                SOURCE_NUMBER     VARCHAR2(500),            -- invoice/payment/REVAL number
                SOURCE_ID         VARCHAR2(200),
                VALIDATION_TYPE   VARCHAR2(100) NOT NULL,   -- e.g. COMPANY_SEGMENT_MISMATCH
                MESSAGE           VARCHAR2(4000),
                LINE_DETAILS      CLOB,                     -- JSON with mismatched combinations
                CREATED_DATE      TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
                CREATED_BY        VARCHAR2(200)
            )
        ]';
        DBMS_OUTPUT.PUT_LINE('Created RR_GL_JOURNAL_VALIDATION_LOG');
    ELSE
        DBMS_OUTPUT.PUT_LINE('RR_GL_JOURNAL_VALIDATION_LOG already exists');
    END IF;
END;
/

-- ── Sequence for LOG_ID if IDENTITY is not supported ─────────
-- (Oracle 12c+ supports IDENTITY — remove if on older version)

-- ── Index for fast lookup by source ──────────────────────────
DECLARE
    l_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO l_count FROM user_indexes
    WHERE index_name = 'IDX_GL_VAL_LOG_SOURCE';
    IF l_count = 0 THEN
        EXECUTE IMMEDIATE 'CREATE INDEX IDX_GL_VAL_LOG_SOURCE ON RR_GL_JOURNAL_VALIDATION_LOG (SOURCE, HEADER_ID, CREATED_DATE)';
        DBMS_OUTPUT.PUT_LINE('Created index IDX_GL_VAL_LOG_SOURCE');
    END IF;
END;
/

DBMS_OUTPUT.PUT_LINE('RR_GL_JOURNAL_VALIDATION_LOG setup complete');
