-- =============================================================================
-- 24_FA_ACCOUNTING.SQL
-- FA Create Accounting — Additions (Dr Asset Cost / Cr Asset Clearing)
--
-- 1. ALTER TABLE: add ACCOUNTED_STATUS, ACCOUNTED_DATE to FA tables
-- 2. RR_FA_ACCOUNTING_PKG: preview + create accounting
-- 3. ORDS handlers:
--      GET  reerp/fa/accounting/additions-preview?assetId=&bookTypeCode=
--      POST reerp/fa/accounting/create-addition
-- =============================================================================

-- ── 1. Add accounting columns to FA tables ────────────────────────────────────
BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE RR_FA_ADDITIONS   ADD (ACCOUNTED_STATUS VARCHAR2(30), ACCOUNTED_DATE DATE)';
EXCEPTION WHEN OTHERS THEN
    IF SQLCODE != -1430 THEN RAISE; END IF;  -- ORA-01430 = column already exists
END;
/
BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE RR_FA_DEPRN_DETAIL  ADD (ACCOUNTED_STATUS VARCHAR2(30), ACCOUNTED_DATE DATE)';
EXCEPTION WHEN OTHERS THEN
    IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/
BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE RR_FA_DEPRN_SUMMARY ADD (ACCOUNTED_STATUS VARCHAR2(30), ACCOUNTED_DATE DATE)';
EXCEPTION WHEN OTHERS THEN
    IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/

-- ── 2. Package spec ───────────────────────────────────────────────────────────
CREATE OR REPLACE PACKAGE RR_FA_ACCOUNTING_PKG AS

    -- Build preview JSON (header + lines) for FA Additions accounting
    PROCEDURE GET_ADDITIONS_PREVIEW(
        p_asset_id    IN  VARCHAR2,
        p_book        IN  VARCHAR2,
        p_status      OUT NUMBER,
        p_response    OUT CLOB
    );

    -- Create SLA + GL accounting for an FA Addition and mark as ACCOUNTED
    PROCEDURE CREATE_ADDITIONS_ACCOUNTING(
        p_asset_id    IN  VARCHAR2,
        p_book        IN  VARCHAR2,
        p_created_by  IN  VARCHAR2,
        p_status      OUT NUMBER,
        p_response    OUT CLOB
    );

END RR_FA_ACCOUNTING_PKG;
/

-- ── 3. Package body ───────────────────────────────────────────────────────────
CREATE OR REPLACE PACKAGE BODY RR_FA_ACCOUNTING_PKG AS

    -- ── Private: JSON string helper ───────────────────────────────────────────
    FUNCTION jstr(p IN VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        RETURN '"' || REPLACE(REPLACE(p, '\', '\\'), '"', '\"') || '"';
    END;

    -- ── Private: build account combination string from CCID ───────────────────
    FUNCTION get_account_combo(p_ccid IN NUMBER) RETURN VARCHAR2 IS
        v_combo VARCHAR2(750);
    BEGIN
        IF p_ccid IS NULL OR p_ccid = 0 THEN RETURN NULL; END IF;
        SELECT
            NVL("buimercFinGlbCoaCo", '')         || '-' ||
            NVL("buimercFinGlbCoaLob", '')        || '-' ||
            NVL("buimercFinGlbCoaDepartment", '') || '-' ||
            NVL("buimercFinGlbCoaAccount", '')    || '-' ||
            NVL("buimercFinGlbCoaSubAcc", '')     || '-' ||
            NVL("buimercFinGlbCoaAlys", '')       || '-' ||
            NVL("buimercFinGlbCoaIc", '')         || '-' ||
            NVL("buimercFinGlbCoaFut1", '')       || '-' ||
            NVL("buimercFinGlbCoaFut2", '')
        INTO v_combo
        FROM REERP_GL_CODE_COMBINATIONS
        WHERE "_CODE_COMBINATION_ID" = p_ccid;
        RETURN v_combo;
    EXCEPTION WHEN NO_DATA_FOUND THEN
        RETURN TO_CHAR(p_ccid);
    END;

    -- ── Private: derive period name from date (MMM-YYYY) ─────────────────────
    FUNCTION derive_period(p_date IN DATE) RETURN VARCHAR2 IS
        v_period VARCHAR2(15);
    BEGIN
        v_period := TO_CHAR(p_date, 'Mon-YYYY');
        -- Normalize to Title case
        RETURN UPPER(SUBSTR(v_period, 1, 1)) || LOWER(SUBSTR(v_period, 2, 2)) ||
               SUBSTR(v_period, 4);
    END;

    -- =========================================================================
    -- GET_ADDITIONS_PREVIEW
    -- =========================================================================
    PROCEDURE GET_ADDITIONS_PREVIEW(
        p_asset_id IN  VARCHAR2,
        p_book     IN  VARCHAR2,
        p_status   OUT NUMBER,
        p_response OUT CLOB
    ) IS
        v_asset_number    VARCHAR2(100);
        v_description     VARCHAR2(500);
        v_cost            NUMBER;
        v_category_id     NUMBER;
        v_date_svc        DATE;
        v_cost_ccid       NUMBER;
        v_clearing_ccid   NUMBER;
        v_cost_combo      VARCHAR2(750);
        v_clearing_combo  VARCHAR2(750);
        v_acct_date       DATE := SYSDATE;
        v_period_name     VARCHAR2(15);
        v_sla_header_id   NUMBER;
        v_sla_status      VARCHAR2(30);
        v_gl_header_id    NUMBER;
        v_already_acctd   VARCHAR2(5) := 'false';
        v_accounted_date  VARCHAR2(30);
        v_add_acct_status VARCHAR2(30);
    BEGIN
        -- Get asset data from RR_FA_ADDITIONS
        BEGIN
            SELECT
                a.ASSET_NUMBER,
                a.DESCRIPTION,
                NVL(b.COST, a.COST),
                a.ASSET_CATEGORY_ID,
                a.DATE_PLACED_IN_SERVICE,
                NVL(a.ACCOUNTED_STATUS, 'UNACCOUNTED'),
                TO_CHAR(a.ACCOUNTED_DATE, 'YYYY-MM-DD')
            INTO v_asset_number, v_description, v_cost, v_category_id,
                 v_date_svc, v_add_acct_status, v_accounted_date
            FROM RR_FA_ADDITIONS a
            LEFT JOIN RR_FA_BOOKS b ON b.ASSET_ID = a.ASSET_ID AND b.BOOK_TYPE_CODE = p_book
            WHERE a.ASSET_ID = p_asset_id
            FETCH FIRST 1 ROWS ONLY;
        EXCEPTION WHEN NO_DATA_FOUND THEN
            p_status   := 404;
            p_response := '{"success":false,"error":"Asset not found: ' || p_asset_id || '"}';
            RETURN;
        END;

        -- Get category accounts
        BEGIN
            SELECT cb.ASSET_COST_ACCOUNT_CCID, cb.ASSET_CLEARING_ACCOUNT_CCID
            INTO   v_cost_ccid, v_clearing_ccid
            FROM   RR_FA_CATEGORY_BOOKS cb
            WHERE  cb.CATEGORY_ID    = v_category_id
            AND    cb.BOOK_TYPE_CODE = p_book
            FETCH FIRST 1 ROWS ONLY;
        EXCEPTION WHEN NO_DATA_FOUND THEN
            v_cost_ccid     := NULL;
            v_clearing_ccid := NULL;
        END;

        v_cost_combo     := get_account_combo(v_cost_ccid);
        v_clearing_combo := get_account_combo(v_clearing_ccid);

        -- Period
        v_period_name := derive_period(NVL(v_date_svc, SYSDATE));

        -- Check existing SLA accounting
        BEGIN
            SELECT h.HEADER_ID, h.ACCOUNTING_STATUS, h.GL_HEADER_ID
            INTO   v_sla_header_id, v_sla_status, v_gl_header_id
            FROM   RR_SLA_ACCOUNTING_HEADERS h
            WHERE  h.SOURCE_TABLE     = 'RR_FA_ADDITIONS'
            AND    TO_CHAR(h.SOURCE_ID) = p_asset_id
            FETCH FIRST 1 ROWS ONLY;
            v_already_acctd := 'true';
        EXCEPTION WHEN NO_DATA_FOUND THEN
            v_sla_header_id := NULL;
            v_sla_status    := NULL;
            v_gl_header_id  := NULL;
        END;

        -- Build response JSON
        p_status := 200;
        p_response :=
            '{"success":true'
         || ',"alreadyAccounted":' || v_already_acctd
         || ',"accountedStatus":' || jstr(NVL(v_add_acct_status, 'UNACCOUNTED'))
         || ',"accountedDate":' || NVL(jstr(v_accounted_date), 'null')
         || ',"slaHeaderId":' || NVL(TO_CHAR(v_sla_header_id), 'null')
         || ',"slaStatus":' || NVL(jstr(v_sla_status), 'null')
         || ',"glHeaderId":' || NVL(TO_CHAR(v_gl_header_id), 'null')
         || ',"header":{'
         ||   '"assetId":' || jstr(p_asset_id)
         ||   ',"assetNumber":' || jstr(v_asset_number)
         ||   ',"description":' || jstr(v_description)
         ||   ',"bookTypeCode":' || jstr(p_book)
         ||   ',"periodName":' || jstr(v_period_name)
         ||   ',"accountingDate":' || jstr(TO_CHAR(v_acct_date, 'YYYY-MM-DD'))
         ||   ',"eventType":"FA_ADDITION"'
         ||   ',"sourceTable":"RR_FA_ADDITIONS"'
         ||   ',"moduleName":"FA"'
         ||   ',"cost":' || NVL(TO_CHAR(v_cost), '0')
         || '}'
         || ',"lines":['
         ||   '{"lineNumber":1,"lineType":"DR","accountingClass":"ASSET"'
         ||    ',"description":"Asset Cost — ' || REPLACE(v_description, '"', '\"') || '"'
         ||    ',"accountedDr":' || NVL(TO_CHAR(v_cost), '0')
         ||    ',"accountedCr":0'
         ||    ',"ccid":' || NVL(TO_CHAR(v_cost_ccid), 'null')
         ||    ',"accountCombination":' || NVL(jstr(v_cost_combo), 'null')
         ||   '},'
         ||   '{"lineNumber":2,"lineType":"CR","accountingClass":"CLEARING"'
         ||    ',"description":"Asset Clearing — ' || REPLACE(v_description, '"', '\"') || '"'
         ||    ',"accountedDr":0'
         ||    ',"accountedCr":' || NVL(TO_CHAR(v_cost), '0')
         ||    ',"ccid":' || NVL(TO_CHAR(v_clearing_ccid), 'null')
         ||    ',"accountCombination":' || NVL(jstr(v_clearing_combo), 'null')
         ||   '}'
         || ']'
         || '}';

    EXCEPTION WHEN OTHERS THEN
        p_status   := 500;
        p_response := '{"success":false,"error":"' || REPLACE(SQLERRM, '"', '\"') || '"}';
    END GET_ADDITIONS_PREVIEW;

    -- =========================================================================
    -- CREATE_ADDITIONS_ACCOUNTING
    -- =========================================================================
    PROCEDURE CREATE_ADDITIONS_ACCOUNTING(
        p_asset_id    IN  VARCHAR2,
        p_book        IN  VARCHAR2,
        p_created_by  IN  VARCHAR2,
        p_status      OUT NUMBER,
        p_response    OUT CLOB
    ) IS
        v_asset_number   VARCHAR2(100);
        v_description    VARCHAR2(500);
        v_cost           NUMBER;
        v_category_id    NUMBER;
        v_date_svc       DATE;
        v_cost_ccid      NUMBER;
        v_clearing_ccid  NUMBER;
        v_cost_combo     VARCHAR2(750);
        v_clearing_combo VARCHAR2(750);
        v_acct_date      DATE := SYSDATE;
        v_period_name    VARCHAR2(15);
        v_currency       VARCHAR2(15) := 'AED';
        -- SLA
        v_sla_header_id  NUMBER;
        v_existing_id    NUMBER;
        -- GL
        v_gl_batch_id    NUMBER;
        v_gl_header_id   NUMBER;
        v_batch_name     VARCHAR2(240);
        v_batch_sync_id  NUMBER;
        v_created_by     VARCHAR2(100);
        v_now            DATE := SYSDATE;
    BEGIN
        v_created_by := NVL(p_created_by, 'SYSTEM');

        -- Get asset data
        BEGIN
            SELECT
                a.ASSET_NUMBER, a.DESCRIPTION,
                NVL(b.COST, a.COST),
                a.ASSET_CATEGORY_ID, a.DATE_PLACED_IN_SERVICE
            INTO v_asset_number, v_description, v_cost, v_category_id, v_date_svc
            FROM RR_FA_ADDITIONS a
            LEFT JOIN RR_FA_BOOKS b ON b.ASSET_ID = a.ASSET_ID AND b.BOOK_TYPE_CODE = p_book
            WHERE a.ASSET_ID = p_asset_id
            FETCH FIRST 1 ROWS ONLY;
        EXCEPTION WHEN NO_DATA_FOUND THEN
            p_status   := 404;
            p_response := '{"success":false,"error":"Asset not found: ' || p_asset_id || '"}';
            RETURN;
        END;

        -- Check duplicate
        BEGIN
            SELECT HEADER_ID INTO v_existing_id
            FROM   RR_SLA_ACCOUNTING_HEADERS
            WHERE  SOURCE_TABLE       = 'RR_FA_ADDITIONS'
            AND    TO_CHAR(SOURCE_ID) = p_asset_id
            FETCH FIRST 1 ROWS ONLY;

            p_status   := 200;
            p_response := '{"success":true,"status":"ALREADY_EXISTS"'
                       || ',"slaHeaderId":' || v_existing_id
                       || ',"message":"Accounting already created for this asset"}';
            RETURN;
        EXCEPTION WHEN NO_DATA_FOUND THEN NULL;
        END;

        -- Validate cost
        IF NVL(v_cost, 0) = 0 THEN
            p_status   := 400;
            p_response := '{"success":false,"error":"Asset cost is zero — cannot create accounting"}';
            RETURN;
        END IF;

        -- Get category accounts
        BEGIN
            SELECT cb.ASSET_COST_ACCOUNT_CCID, cb.ASSET_CLEARING_ACCOUNT_CCID
            INTO   v_cost_ccid, v_clearing_ccid
            FROM   RR_FA_CATEGORY_BOOKS cb
            WHERE  cb.CATEGORY_ID    = v_category_id
            AND    cb.BOOK_TYPE_CODE = p_book
            FETCH FIRST 1 ROWS ONLY;
        EXCEPTION WHEN NO_DATA_FOUND THEN
            p_status   := 400;
            p_response := '{"success":false,"error":"No category accounts found for this asset/book combination"}';
            RETURN;
        END;

        v_cost_combo     := get_account_combo(v_cost_ccid);
        v_clearing_combo := get_account_combo(v_clearing_ccid);
        v_period_name    := derive_period(NVL(v_date_svc, SYSDATE));
        v_batch_name     := 'FA-ADDITION-' || v_asset_number || '-' || TO_CHAR(SYSDATE, 'YYYYMMDD');

        -- ── Insert SLA Accounting Header ─────────────────────────────────────
        INSERT INTO RR_SLA_ACCOUNTING_HEADERS (
            MODULE_NAME, SOURCE_TABLE, SOURCE_ID, SOURCE_NUMBER, SOURCE_TYPE,
            EVENT_TYPE_CODE, EVENT_DATE, ACCOUNTING_DATE, PERIOD_NAME,
            LEDGER_ID, LEDGER_NAME, CURRENCY_CODE, LEDGER_CURRENCY,
            EXCHANGE_RATE, EXCHANGE_RATE_TYPE,
            BUSINESS_UNIT, LEGAL_ENTITY, DESCRIPTION,
            ACCOUNTING_STATUS, POSTING_STATUS,
            CREATED_BY, CREATION_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
        ) VALUES (
            'FA', 'RR_FA_ADDITIONS', TO_NUMBER(p_asset_id), v_asset_number, 'ADDITION',
            'FA_ADDITION', v_date_svc, v_acct_date, v_period_name,
            1, 'Primary Ledger', v_currency, v_currency,
            1, 'Corporate',
            NULL, NULL,
            'FA Addition — ' || v_asset_number || ' — ' || v_description,
            'DRAFT', 'UNPOSTED',
            v_created_by, v_now, v_created_by, v_now
        ) RETURNING HEADER_ID INTO v_sla_header_id;

        -- ── Insert SLA Lines ─────────────────────────────────────────────────
        -- Line 1: Dr Asset Cost
        INSERT INTO RR_SLA_ACCOUNTING_LINES (
            HEADER_ID, LINE_NUMBER, LINE_TYPE, ACCOUNTING_CLASS,
            ACCOUNT_COMBINATION,
            ENTERED_DR, ENTERED_CR, ACCOUNTED_DR, ACCOUNTED_CR,
            CURRENCY_CODE, EXCHANGE_RATE, DESCRIPTION,
            SOURCE_LINE_ID, SOURCE_LINE_NUMBER,
            CREATED_BY, CREATION_DATE
        ) VALUES (
            v_sla_header_id, 1, 'DR', 'ASSET',
            v_cost_combo,
            v_cost, 0, v_cost, 0,
            v_currency, 1,
            'Asset Cost — ' || v_asset_number,
            TO_NUMBER(p_asset_id), 1,
            v_created_by, v_now
        );
        -- Line 2: Cr Asset Clearing
        INSERT INTO RR_SLA_ACCOUNTING_LINES (
            HEADER_ID, LINE_NUMBER, LINE_TYPE, ACCOUNTING_CLASS,
            ACCOUNT_COMBINATION,
            ENTERED_DR, ENTERED_CR, ACCOUNTED_DR, ACCOUNTED_CR,
            CURRENCY_CODE, EXCHANGE_RATE, DESCRIPTION,
            SOURCE_LINE_ID, SOURCE_LINE_NUMBER,
            CREATED_BY, CREATION_DATE
        ) VALUES (
            v_sla_header_id, 2, 'CR', 'CLEARING',
            v_clearing_combo,
            0, v_cost, 0, v_cost,
            v_currency, 1,
            'Asset Clearing — ' || v_asset_number,
            TO_NUMBER(p_asset_id), 2,
            v_created_by, v_now
        );

        -- ── Insert GL Journal Batch ──────────────────────────────────────────
        INSERT INTO RR_GL_JOURNAL_BATCHES (
            JE_BATCH_ID, BATCH_NAME, STATUS, DEFAULT_PERIOD_NAME,
            RUNNING_TOTAL_ACCT_DR, RUNNING_TOTAL_ACCT_CR,
            RUNNING_TOTAL_DR, RUNNING_TOTAL_CR,
            ORACLE_CREATED_BY, ORACLE_CREATION_DATE
        ) VALUES (
            v_sla_header_id,
            v_batch_name,
            'POSTED',
            v_period_name,
            v_cost, v_cost, v_cost, v_cost,
            v_created_by, v_now
        ) RETURNING BATCH_SYNC_ID INTO v_batch_sync_id;

        -- ── Insert GL Journal Header ─────────────────────────────────────────
        INSERT INTO RR_GL_HEADERS (
            JE_HEADER_ID, BATCH_ID, JOURNAL_NAME, JOURNAL_DESCRIPTION,
            PERIOD_NAME, DEFAULT_EFFECTIVE_DATE,
            CURRENCY_CODE, LEDGER_CURRENCY_CODE,
            RUNNING_TOTAL_DR, RUNNING_TOTAL_CR,
            RUNNING_TOTAL_ACCOUNTED_DR, RUNNING_TOTAL_ACCOUNTED_CR,
            USER_JE_CATEGORY_NAME,
            FUSION_CREATED_BY, FUSION_CREATION_DATE,
            CREATED_BY, CREATION_DATE
        ) VALUES (
            v_sla_header_id, v_batch_sync_id,
            'FA Addition — ' || v_asset_number,
            'FA Addition accounting for asset ' || v_asset_number || ' (' || v_description || ')',
            v_period_name, v_acct_date,
            v_currency, v_currency,
            v_cost, v_cost, v_cost, v_cost,
            'Assets',
            v_created_by, v_now,
            v_created_by, v_now
        ) RETURNING HEADER_ID INTO v_gl_header_id;

        -- ── Insert GL Journal Lines ──────────────────────────────────────────
        -- Line 1: Dr Asset Cost
        INSERT INTO RR_GL_LINES_ALL (
            JE_HEADER_ID, BATCH_ID, JE_LINE_NUMBER,
            ENTERED_DR, ENTERED_CR, ACCOUNTED_DR, ACCOUNTED_CR,
            DESCRIPTION, CURRENCY_CODE,
            ACCOUNT_COMBINATION,
            REFERENCE1, REFERENCE2, REFERENCE5,
            CREATED_BY, CREATION_DATE
        ) VALUES (
            v_gl_header_id, v_batch_sync_id, 1,
            v_cost, 0, v_cost, 0,
            'Asset Cost — ' || v_asset_number,
            v_currency,
            v_cost_combo,
            v_asset_number, p_asset_id, 'FA_ADDITIONS',
            v_created_by, v_now
        );
        -- Line 2: Cr Asset Clearing
        INSERT INTO RR_GL_LINES_ALL (
            JE_HEADER_ID, BATCH_ID, JE_LINE_NUMBER,
            ENTERED_DR, ENTERED_CR, ACCOUNTED_DR, ACCOUNTED_CR,
            DESCRIPTION, CURRENCY_CODE,
            ACCOUNT_COMBINATION,
            REFERENCE1, REFERENCE2, REFERENCE5,
            CREATED_BY, CREATION_DATE
        ) VALUES (
            v_gl_header_id, v_batch_sync_id, 2,
            0, v_cost, 0, v_cost,
            'Asset Clearing — ' || v_asset_number,
            v_currency,
            v_clearing_combo,
            v_asset_number, p_asset_id, 'FA_ADDITIONS',
            v_created_by, v_now
        );

        -- ── Update SLA to POSTED ─────────────────────────────────────────────
        UPDATE RR_SLA_ACCOUNTING_HEADERS
        SET    ACCOUNTING_STATUS = 'POSTED',
               POSTING_STATUS    = 'POSTED',
               GL_BATCH_ID       = v_batch_sync_id,
               GL_BATCH_NAME     = v_batch_name,
               GL_HEADER_ID      = v_gl_header_id,
               GL_TRANSFER_DATE  = v_now,
               POSTED_BY         = v_created_by,
               POSTED_DATE       = v_now,
               LAST_UPDATE_DATE  = v_now,
               LAST_UPDATED_BY   = v_created_by
        WHERE  HEADER_ID = v_sla_header_id;

        -- ── Update RR_FA_ADDITIONS status ────────────────────────────────────
        UPDATE RR_FA_ADDITIONS
        SET    ACCOUNTED_STATUS = 'ACCOUNTED',
               ACCOUNTED_DATE   = v_now
        WHERE  ASSET_ID = p_asset_id;

        COMMIT;

        p_status   := 200;
        p_response :=
            '{"success":true,"status":"ACCOUNTED"'
         || ',"slaHeaderId":' || v_sla_header_id
         || ',"glBatchId":' || v_batch_sync_id
         || ',"glHeaderId":' || v_gl_header_id
         || ',"message":"Accounting created and posted successfully"}';

    EXCEPTION WHEN OTHERS THEN
        ROLLBACK;
        p_status   := 500;
        p_response := '{"success":false,"error":"' || REPLACE(SQLERRM, '"', '\"') || '"}';
    END CREATE_ADDITIONS_ACCOUNTING;

END RR_FA_ACCOUNTING_PKG;
/

-- ── 4. ORDS: clean up ─────────────────────────────────────────────────────────
BEGIN ORDS.DELETE_HANDLER(p_module_name=>'reerp',p_pattern=>'fa/accounting/additions-preview',p_method=>'GET');   COMMIT; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN ORDS.DELETE_HANDLER(p_module_name=>'reerp',p_pattern=>'fa/accounting/create-addition',p_method=>'POST');    COMMIT; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN ORDS.DELETE_TEMPLATE(p_module_name=>'reerp',p_pattern=>'fa/accounting/additions-preview'); COMMIT; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN ORDS.DELETE_TEMPLATE(p_module_name=>'reerp',p_pattern=>'fa/accounting/create-addition');  COMMIT; EXCEPTION WHEN OTHERS THEN NULL; END;
/

-- ── 5. ORDS: GET fa/accounting/additions-preview ─────────────────────────────
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'fa/accounting/additions-preview',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'FA: preview accounting journal for an addition'
    );
    COMMIT;
END;
/
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'fa/accounting/additions-preview',
        p_method         => 'GET',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_source         => q'[
DECLARE
    v_status   NUMBER;
    v_response CLOB;
BEGIN
    RR_FA_ACCOUNTING_PKG.GET_ADDITIONS_PREVIEW(
        p_asset_id => :assetId,
        p_book     => :bookTypeCode,
        p_status   => v_status,
        p_response => v_response
    );
    :status := v_status;
    HTP.P(v_response);
END;
        ]'
    );
    COMMIT;
END;
/

-- ── 6. ORDS: POST fa/accounting/create-addition ───────────────────────────────
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'fa/accounting/create-addition',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'FA: create accounting (SLA + GL) for an addition'
    );
    COMMIT;
END;
/
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'fa/accounting/create-addition',
        p_method         => 'POST',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_source         => q'[
DECLARE
    v_body     CLOB := :body_text;
    v_status   NUMBER;
    v_response CLOB;
BEGIN
    RR_FA_ACCOUNTING_PKG.CREATE_ADDITIONS_ACCOUNTING(
        p_asset_id   => JSON_VALUE(v_body, '$.assetId'),
        p_book       => JSON_VALUE(v_body, '$.bookTypeCode'),
        p_created_by => NVL(JSON_VALUE(v_body, '$.createdBy'), 'REACTERP'),
        p_status     => v_status,
        p_response   => v_response
    );
    :status := v_status;
    HTP.P(v_response);
EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    :status := 500;
    HTP.P('{"success":false,"error":"' || REPLACE(SQLERRM,'"','\"') || '"}');
END;
        ]'
    );
    COMMIT;
END;
/
