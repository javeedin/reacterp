-- ============================================================
-- Petty Cash Module — ORDS REST Handlers
-- File: database/pc/02_pc_ords.sql
-- Run order: 2nd (after 01_pc_tables.sql)
-- ============================================================
-- Endpoints summary:
--   GET  /pc/registers                          — search registers
--   GET  /pc/registers/:registerId              — single register + balance
--   POST /pc/registers                          — create register
--   PUT  /pc/registers/:registerId              — update register header
--   DELETE /pc/registers/:registerId            — delete (no transactions only)
--
--   GET  /pc/registers/:registerId/transactions — lines for a register
--   POST /pc/transactions                       — create transaction (money in or expense)
--   PUT  /pc/transactions/:transactionId        — edit transaction
--   DELETE /pc/transactions/:transactionId      — delete transaction
-- ============================================================

BEGIN
    -- ── MODULE ─────────────────────────────────────────────────────────────
    ORDS.DEFINE_MODULE(
        p_module_name    => 'pc',
        p_base_path      => '/pc/',
        p_items_per_page => 1000,
        p_status         => 'PUBLISHED'
    );

    -- ══════════════════════════════════════════════════════════════════════
    -- TEMPLATE 1: /pc/registers
    -- ══════════════════════════════════════════════════════════════════════
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'pc',
        p_pattern        => 'registers'
    );

    -- ──────────────────────────────────────────────────────────────────────
    -- GET /pc/registers  — Search registers
    -- Query params: q (name contains), status, dateFrom, dateTo
    -- ──────────────────────────────────────────────────────────────────────
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'pc',
        p_pattern        => 'registers',
        p_method         => 'GET',
        p_source_type    => ORDS.source_type_plsql,
        p_source         => '
DECLARE
    v_clob  CLOB;
    v_first BOOLEAN := TRUE;
    CURSOR c IS
        SELECT r.REGISTER_ID,
               r.REGISTER_NAME,
               r.START_DATE,
               r.END_DATE,
               r.COMMENTS,
               r.CASH_ACCOUNT_CCID,
               r.CASH_ACCOUNT_DESC,
               r.CURRENCY,
               r.STATUS,
               r.CREATED_BY,
               r.CREATION_DATE,
               NVL(SUM(t.DEBIT_AMOUNT),0) - NVL(SUM(t.CREDIT_AMOUNT),0) AS BALANCE
        FROM   RR_PC_REGISTERS r
        LEFT JOIN RR_PC_TRANSACTIONS t ON t.REGISTER_ID = r.REGISTER_ID
        WHERE  (:q     IS NULL OR UPPER(r.REGISTER_NAME) LIKE ''%'' || UPPER(:q) || ''%'')
        AND    (:status IS NULL OR r.STATUS = :status)
        AND    (:dateFrom IS NULL OR r.START_DATE >= TO_DATE(:dateFrom,''YYYY-MM-DD''))
        AND    (:dateTo   IS NULL OR r.END_DATE   <= TO_DATE(:dateTo,  ''YYYY-MM-DD''))
        GROUP BY r.REGISTER_ID, r.REGISTER_NAME, r.START_DATE, r.END_DATE,
                 r.COMMENTS, r.CASH_ACCOUNT_CCID, r.CASH_ACCOUNT_DESC,
                 r.CURRENCY, r.STATUS, r.CREATED_BY, r.CREATION_DATE
        ORDER BY r.REGISTER_ID DESC;
BEGIN
    :status_code := 200;
    APEX_JSON.INITIALIZE_CLOB_OUTPUT;
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE(''success'', TRUE);
    APEX_JSON.OPEN_ARRAY(''items'');
    FOR rec IN c LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE(''registerId'',      rec.REGISTER_ID);
        APEX_JSON.WRITE(''registerName'',    rec.REGISTER_NAME);
        APEX_JSON.WRITE(''startDate'',       TO_CHAR(rec.START_DATE, ''DD-MON-YYYY''));
        APEX_JSON.WRITE(''endDate'',         TO_CHAR(rec.END_DATE,   ''DD-MON-YYYY''));
        APEX_JSON.WRITE(''comments'',        rec.COMMENTS);
        APEX_JSON.WRITE(''cashAccountCcid'', rec.CASH_ACCOUNT_CCID);
        APEX_JSON.WRITE(''cashAccountDesc'', rec.CASH_ACCOUNT_DESC);
        APEX_JSON.WRITE(''currency'',        NVL(rec.CURRENCY,''AED''));
        APEX_JSON.WRITE(''status'',          rec.STATUS);
        APEX_JSON.WRITE(''balance'',         rec.BALANCE);
        APEX_JSON.WRITE(''createdBy'',       rec.CREATED_BY);
        APEX_JSON.WRITE(''creationDate'',    TO_CHAR(rec.CREATION_DATE,''DD-MON-YYYY''));
        APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
    v_clob := APEX_JSON.GET_CLOB_OUTPUT;
    APEX_JSON.FREE_OUTPUT;
    HTP.PRN(v_clob);
END;
'
    );

    -- ──────────────────────────────────────────────────────────────────────
    -- POST /pc/registers  — Create new register
    -- Body: { registerName, startDate, endDate, comments,
    --         cashAccountCcid, cashAccountDesc, currency, createdBy }
    -- ──────────────────────────────────────────────────────────────────────
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'pc',
        p_pattern        => 'registers',
        p_method         => 'POST',
        p_source_type    => ORDS.source_type_plsql,
        p_source         => '
DECLARE
    l_json      CLOB         := :body_text;
    l_id        NUMBER;
    l_name      VARCHAR2(200);
    l_start     DATE;
    l_end       DATE;
    l_comments  VARCHAR2(1000);
    l_ccid      NUMBER;
    l_acc_desc  VARCHAR2(400);
    l_currency  VARCHAR2(10);
    l_by        VARCHAR2(150);
BEGIN
    APEX_JSON.PARSE(l_json);
    l_name     := APEX_JSON.GET_VARCHAR2(p_path => ''registerName'');
    l_start    := TO_DATE(APEX_JSON.GET_VARCHAR2(p_path => ''startDate''),   ''YYYY-MM-DD'');
    l_end      := TO_DATE(APEX_JSON.GET_VARCHAR2(p_path => ''endDate''),     ''YYYY-MM-DD'');
    l_comments := APEX_JSON.GET_VARCHAR2(p_path => ''comments'');
    l_ccid     := APEX_JSON.GET_NUMBER (p_path => ''cashAccountCcid'');
    l_acc_desc := APEX_JSON.GET_VARCHAR2(p_path => ''cashAccountDesc'');
    l_currency := NVL(APEX_JSON.GET_VARCHAR2(p_path => ''currency''), ''AED'');
    l_by       := APEX_JSON.GET_VARCHAR2(p_path => ''createdBy'');

    INSERT INTO RR_PC_REGISTERS (
        REGISTER_NAME, START_DATE, END_DATE, COMMENTS,
        CASH_ACCOUNT_CCID, CASH_ACCOUNT_DESC, CURRENCY,
        STATUS, CREATED_BY, CREATION_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
    ) VALUES (
        l_name, l_start, l_end, l_comments,
        l_ccid, l_acc_desc, l_currency,
        ''ACTIVE'', l_by, SYSTIMESTAMP, l_by, SYSTIMESTAMP
    ) RETURNING REGISTER_ID INTO l_id;

    COMMIT;
    :status_code := 201;
    HTP.PRN(''{"success":true,"registerId":'' || l_id || '','
           || ''"message":"Register created successfully"}'');
EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN
        :status_code := 400;
        HTP.PRN(''{"success":false,"message":"Register name already exists"}'');
    WHEN OTHERS THEN
        ROLLBACK;
        :status_code := 500;
        HTP.PRN(''{"success":false,"message":'' || APEX_JSON.STRINGIFY(SQLERRM) || ''}'');
END;
'
    );

    -- ══════════════════════════════════════════════════════════════════════
    -- TEMPLATE 2: /pc/registers/:registerId
    -- ══════════════════════════════════════════════════════════════════════
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'pc',
        p_pattern        => 'registers/:registerId'
    );

    -- ──────────────────────────────────────────────────────────────────────
    -- GET /pc/registers/:registerId  — Single register with live balance
    -- ──────────────────────────────────────────────────────────────────────
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'pc',
        p_pattern        => 'registers/:registerId',
        p_method         => 'GET',
        p_source_type    => ORDS.source_type_plsql,
        p_source         => '
DECLARE
    CURSOR c IS
        SELECT r.REGISTER_ID, r.REGISTER_NAME, r.START_DATE, r.END_DATE,
               r.COMMENTS, r.CASH_ACCOUNT_CCID, r.CASH_ACCOUNT_DESC,
               r.CURRENCY, r.STATUS, r.CREATED_BY, r.CREATION_DATE,
               NVL(SUM(t.DEBIT_AMOUNT),0) - NVL(SUM(t.CREDIT_AMOUNT),0) AS BALANCE,
               NVL(SUM(t.DEBIT_AMOUNT),0)  AS TOTAL_DEBIT,
               NVL(SUM(t.CREDIT_AMOUNT),0) AS TOTAL_CREDIT
        FROM   RR_PC_REGISTERS r
        LEFT JOIN RR_PC_TRANSACTIONS t ON t.REGISTER_ID = r.REGISTER_ID
        WHERE  r.REGISTER_ID = :registerId
        GROUP BY r.REGISTER_ID, r.REGISTER_NAME, r.START_DATE, r.END_DATE,
                 r.COMMENTS, r.CASH_ACCOUNT_CCID, r.CASH_ACCOUNT_DESC,
                 r.CURRENCY, r.STATUS, r.CREATED_BY, r.CREATION_DATE;
    rec c%ROWTYPE;
BEGIN
    OPEN c; FETCH c INTO rec; CLOSE c;
    IF rec.REGISTER_ID IS NULL THEN
        :status_code := 404;
        HTP.PRN(''{"success":false,"message":"Register not found"}'');
        RETURN;
    END IF;
    :status_code := 200;
    APEX_JSON.INITIALIZE_CLOB_OUTPUT;
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE(''success'',         TRUE);
    APEX_JSON.WRITE(''registerId'',      rec.REGISTER_ID);
    APEX_JSON.WRITE(''registerName'',    rec.REGISTER_NAME);
    APEX_JSON.WRITE(''startDate'',       TO_CHAR(rec.START_DATE, ''DD-MON-YYYY''));
    APEX_JSON.WRITE(''endDate'',         TO_CHAR(rec.END_DATE,   ''DD-MON-YYYY''));
    APEX_JSON.WRITE(''comments'',        rec.COMMENTS);
    APEX_JSON.WRITE(''cashAccountCcid'', rec.CASH_ACCOUNT_CCID);
    APEX_JSON.WRITE(''cashAccountDesc'', rec.CASH_ACCOUNT_DESC);
    APEX_JSON.WRITE(''currency'',        NVL(rec.CURRENCY, ''AED''));
    APEX_JSON.WRITE(''status'',          rec.STATUS);
    APEX_JSON.WRITE(''balance'',         rec.BALANCE);
    APEX_JSON.WRITE(''totalDebit'',      rec.TOTAL_DEBIT);
    APEX_JSON.WRITE(''totalCredit'',     rec.TOTAL_CREDIT);
    APEX_JSON.WRITE(''createdBy'',       rec.CREATED_BY);
    APEX_JSON.WRITE(''creationDate'',    TO_CHAR(rec.CREATION_DATE, ''DD-MON-YYYY''));
    APEX_JSON.CLOSE_OBJECT;
    HTP.PRN(APEX_JSON.GET_CLOB_OUTPUT);
    APEX_JSON.FREE_OUTPUT;
END;
'
    );

    -- ──────────────────────────────────────────────────────────────────────
    -- PUT /pc/registers/:registerId  — Update register header
    -- Body: { registerName, startDate, endDate, comments,
    --         cashAccountCcid, cashAccountDesc, currency, status, updatedBy }
    -- ──────────────────────────────────────────────────────────────────────
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'pc',
        p_pattern        => 'registers/:registerId',
        p_method         => 'PUT',
        p_source_type    => ORDS.source_type_plsql,
        p_source         => '
DECLARE
    l_json  CLOB := :body_text;
    l_rows  NUMBER;
BEGIN
    APEX_JSON.PARSE(l_json);
    UPDATE RR_PC_REGISTERS SET
        REGISTER_NAME     = NVL(APEX_JSON.GET_VARCHAR2(p_path => ''registerName''),    REGISTER_NAME),
        START_DATE        = NVL(TO_DATE(APEX_JSON.GET_VARCHAR2(p_path => ''startDate''), ''YYYY-MM-DD''), START_DATE),
        END_DATE          = TO_DATE(APEX_JSON.GET_VARCHAR2(p_path => ''endDate''),       ''YYYY-MM-DD''),
        COMMENTS          = APEX_JSON.GET_VARCHAR2(p_path => ''comments''),
        CASH_ACCOUNT_CCID = APEX_JSON.GET_NUMBER (p_path => ''cashAccountCcid''),
        CASH_ACCOUNT_DESC = APEX_JSON.GET_VARCHAR2(p_path => ''cashAccountDesc''),
        CURRENCY          = NVL(APEX_JSON.GET_VARCHAR2(p_path => ''currency''), CURRENCY),
        STATUS            = NVL(APEX_JSON.GET_VARCHAR2(p_path => ''status''),   STATUS),
        LAST_UPDATED_BY   = APEX_JSON.GET_VARCHAR2(p_path => ''updatedBy''),
        LAST_UPDATE_DATE  = SYSTIMESTAMP
    WHERE REGISTER_ID = :registerId;
    l_rows := SQL%ROWCOUNT;
    COMMIT;
    IF l_rows = 0 THEN
        :status_code := 404;
        HTP.PRN(''{"success":false,"message":"Register not found"}'');
    ELSE
        :status_code := 200;
        HTP.PRN(''{"success":true,"message":"Register updated"}'');
    END IF;
EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    :status_code := 500;
    HTP.PRN(''{"success":false,"message":'' || APEX_JSON.STRINGIFY(SQLERRM) || ''}'');
END;
'
    );

    -- ──────────────────────────────────────────────────────────────────────
    -- DELETE /pc/registers/:registerId  — Delete register (no transactions)
    -- ──────────────────────────────────────────────────────────────────────
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'pc',
        p_pattern        => 'registers/:registerId',
        p_method         => 'DELETE',
        p_source_type    => ORDS.source_type_plsql,
        p_source         => '
DECLARE
    l_txn_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO l_txn_count
    FROM   RR_PC_TRANSACTIONS
    WHERE  REGISTER_ID = :registerId;

    IF l_txn_count > 0 THEN
        :status_code := 400;
        HTP.PRN(''{"success":false,"message":"Cannot delete register with existing transactions"}'');
        RETURN;
    END IF;

    DELETE FROM RR_PC_REGISTERS WHERE REGISTER_ID = :registerId;
    IF SQL%ROWCOUNT = 0 THEN
        :status_code := 404;
        HTP.PRN(''{"success":false,"message":"Register not found"}'');
    ELSE
        COMMIT;
        :status_code := 200;
        HTP.PRN(''{"success":true,"message":"Register deleted"}'');
    END IF;
EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    :status_code := 500;
    HTP.PRN(''{"success":false,"message":'' || APEX_JSON.STRINGIFY(SQLERRM) || ''}'');
END;
'
    );

    -- ══════════════════════════════════════════════════════════════════════
    -- TEMPLATE 3: /pc/registers/:registerId/transactions
    -- ══════════════════════════════════════════════════════════════════════
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'pc',
        p_pattern        => 'registers/:registerId/transactions'
    );

    -- ──────────────────────────────────────────────────────────────────────
    -- GET /pc/registers/:registerId/transactions  — All lines for a register
    -- Returns lines in date/line_number order with running balance
    -- ──────────────────────────────────────────────────────────────────────
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'pc',
        p_pattern        => 'registers/:registerId/transactions',
        p_method         => 'GET',
        p_source_type    => ORDS.source_type_plsql,
        p_source         => '
DECLARE
    v_clob CLOB;
    CURSOR c IS
        SELECT t.TRANSACTION_ID,
               t.REGISTER_ID,
               t.LINE_NUMBER,
               t.TRANSACTION_DATE,
               t.TRANSACTION_TYPE,
               t.EXPENSE_TYPE,
               t.CURRENCY,
               t.DEBIT_AMOUNT,
               t.CREDIT_AMOUNT,
               t.COMMENTS,
               t.REFERENCE_NO,
               t.ATTACHMENT,
               t.CREATED_BY,
               t.CREATION_DATE,
               SUM(t.DEBIT_AMOUNT - t.CREDIT_AMOUNT) OVER (
                   PARTITION BY t.REGISTER_ID
                   ORDER BY t.TRANSACTION_DATE, t.LINE_NUMBER
                   ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
               ) AS RUNNING_BALANCE
        FROM   RR_PC_TRANSACTIONS t
        WHERE  t.REGISTER_ID = :registerId
        ORDER BY t.TRANSACTION_DATE, t.LINE_NUMBER;
BEGIN
    :status_code := 200;
    APEX_JSON.INITIALIZE_CLOB_OUTPUT;
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE(''success'', TRUE);
    APEX_JSON.OPEN_ARRAY(''items'');
    FOR rec IN c LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE(''transactionId'',   rec.TRANSACTION_ID);
        APEX_JSON.WRITE(''registerId'',      rec.REGISTER_ID);
        APEX_JSON.WRITE(''lineNumber'',      rec.LINE_NUMBER);
        APEX_JSON.WRITE(''transactionDate'', TO_CHAR(rec.TRANSACTION_DATE, ''DD-MON-YYYY''));
        APEX_JSON.WRITE(''transactionType'', rec.TRANSACTION_TYPE);
        APEX_JSON.WRITE(''expenseType'',     rec.EXPENSE_TYPE);
        APEX_JSON.WRITE(''currency'',        NVL(rec.CURRENCY, ''AED''));
        APEX_JSON.WRITE(''debitAmount'',     rec.DEBIT_AMOUNT);
        APEX_JSON.WRITE(''creditAmount'',    rec.CREDIT_AMOUNT);
        APEX_JSON.WRITE(''comments'',        rec.COMMENTS);
        APEX_JSON.WRITE(''referenceNo'',     rec.REFERENCE_NO);
        APEX_JSON.WRITE(''attachment'',      rec.ATTACHMENT);
        APEX_JSON.WRITE(''createdBy'',       rec.CREATED_BY);
        APEX_JSON.WRITE(''creationDate'',    TO_CHAR(rec.CREATION_DATE, ''DD-MON-YYYY''));
        APEX_JSON.WRITE(''runningBalance'',  rec.RUNNING_BALANCE);
        APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
    v_clob := APEX_JSON.GET_CLOB_OUTPUT;
    APEX_JSON.FREE_OUTPUT;
    HTP.PRN(v_clob);
END;
'
    );

    -- ══════════════════════════════════════════════════════════════════════
    -- TEMPLATE 4: /pc/transactions
    -- ══════════════════════════════════════════════════════════════════════
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'pc',
        p_pattern        => 'transactions'
    );

    -- ──────────────────────────────────────────────────────────────────────
    -- POST /pc/transactions  — Create a transaction (Add Money or Add Expense)
    -- Body: { registerId, transactionDate, transactionType, expenseType,
    --         currency, debitAmount, creditAmount, comments,
    --         referenceNo, attachment, createdBy }
    -- transactionType: 'Balance Refill' → debitAmount filled
    --                  'Expense'        → creditAmount filled
    --                  'Adjustment'     → either
    -- ──────────────────────────────────────────────────────────────────────
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'pc',
        p_pattern        => 'transactions',
        p_method         => 'POST',
        p_source_type    => ORDS.source_type_plsql,
        p_source         => '
DECLARE
    l_json      CLOB   := :body_text;
    l_id        NUMBER;
    l_reg_id    NUMBER;
    l_next_line NUMBER;
    l_status    VARCHAR2(50);
BEGIN
    APEX_JSON.PARSE(l_json);
    l_reg_id := APEX_JSON.GET_NUMBER(p_path => ''registerId'');

    -- Validate register exists and is ACTIVE
    BEGIN
        SELECT STATUS INTO l_status FROM RR_PC_REGISTERS WHERE REGISTER_ID = l_reg_id;
    EXCEPTION WHEN NO_DATA_FOUND THEN
        :status_code := 404;
        HTP.PRN(''{"success":false,"message":"Register not found"}'');
        RETURN;
    END;

    IF l_status = ''CLOSED'' THEN
        :status_code := 400;
        HTP.PRN(''{"success":false,"message":"Cannot add transactions to a closed register"}'');
        RETURN;
    END IF;

    -- Next line number
    SELECT NVL(MAX(LINE_NUMBER), 0) + 1 INTO l_next_line
    FROM   RR_PC_TRANSACTIONS WHERE REGISTER_ID = l_reg_id;

    INSERT INTO RR_PC_TRANSACTIONS (
        REGISTER_ID, LINE_NUMBER, TRANSACTION_DATE, TRANSACTION_TYPE, EXPENSE_TYPE,
        CURRENCY, DEBIT_AMOUNT, CREDIT_AMOUNT, COMMENTS,
        REFERENCE_NO, ATTACHMENT, CREATED_BY, CREATION_DATE,
        LAST_UPDATED_BY, LAST_UPDATE_DATE
    ) VALUES (
        l_reg_id,
        l_next_line,
        TO_DATE(APEX_JSON.GET_VARCHAR2(p_path => ''transactionDate''), ''YYYY-MM-DD''),
        APEX_JSON.GET_VARCHAR2(p_path => ''transactionType''),
        APEX_JSON.GET_VARCHAR2(p_path => ''expenseType''),
        NVL(APEX_JSON.GET_VARCHAR2(p_path => ''currency''), ''AED''),
        NVL(APEX_JSON.GET_NUMBER(p_path => ''debitAmount''),  0),
        NVL(APEX_JSON.GET_NUMBER(p_path => ''creditAmount''), 0),
        APEX_JSON.GET_VARCHAR2(p_path => ''comments''),
        APEX_JSON.GET_VARCHAR2(p_path => ''referenceNo''),
        APEX_JSON.GET_VARCHAR2(p_path => ''attachment''),
        APEX_JSON.GET_VARCHAR2(p_path => ''createdBy''),
        SYSTIMESTAMP,
        APEX_JSON.GET_VARCHAR2(p_path => ''createdBy''),
        SYSTIMESTAMP
    ) RETURNING TRANSACTION_ID INTO l_id;

    COMMIT;
    :status_code := 201;
    HTP.PRN(''{"success":true,"transactionId":'' || l_id ||
            '',"lineNumber":'' || l_next_line ||
            '',"message":"Transaction created"}'');
EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    :status_code := 500;
    HTP.PRN(''{"success":false,"message":'' || APEX_JSON.STRINGIFY(SQLERRM) || ''}'');
END;
'
    );

    -- ══════════════════════════════════════════════════════════════════════
    -- TEMPLATE 5: /pc/transactions/:transactionId
    -- ══════════════════════════════════════════════════════════════════════
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'pc',
        p_pattern        => 'transactions/:transactionId'
    );

    -- ──────────────────────────────────────────────────────────────────────
    -- PUT /pc/transactions/:transactionId  — Edit transaction
    -- Body: { transactionDate, transactionType, expenseType, currency,
    --         debitAmount, creditAmount, comments, referenceNo,
    --         attachment, updatedBy }
    -- ──────────────────────────────────────────────────────────────────────
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'pc',
        p_pattern        => 'transactions/:transactionId',
        p_method         => 'PUT',
        p_source_type    => ORDS.source_type_plsql,
        p_source         => '
DECLARE
    l_json CLOB := :body_text;
    l_rows NUMBER;
BEGIN
    APEX_JSON.PARSE(l_json);
    UPDATE RR_PC_TRANSACTIONS SET
        TRANSACTION_DATE  = NVL(TO_DATE(APEX_JSON.GET_VARCHAR2(p_path => ''transactionDate''), ''YYYY-MM-DD''), TRANSACTION_DATE),
        TRANSACTION_TYPE  = NVL(APEX_JSON.GET_VARCHAR2(p_path => ''transactionType''), TRANSACTION_TYPE),
        EXPENSE_TYPE      = APEX_JSON.GET_VARCHAR2(p_path => ''expenseType''),
        CURRENCY          = NVL(APEX_JSON.GET_VARCHAR2(p_path => ''currency''), CURRENCY),
        DEBIT_AMOUNT      = NVL(APEX_JSON.GET_NUMBER(p_path => ''debitAmount''),  DEBIT_AMOUNT),
        CREDIT_AMOUNT     = NVL(APEX_JSON.GET_NUMBER(p_path => ''creditAmount''), CREDIT_AMOUNT),
        COMMENTS          = APEX_JSON.GET_VARCHAR2(p_path => ''comments''),
        REFERENCE_NO      = APEX_JSON.GET_VARCHAR2(p_path => ''referenceNo''),
        ATTACHMENT        = APEX_JSON.GET_VARCHAR2(p_path => ''attachment''),
        LAST_UPDATED_BY   = APEX_JSON.GET_VARCHAR2(p_path => ''updatedBy''),
        LAST_UPDATE_DATE  = SYSTIMESTAMP
    WHERE  TRANSACTION_ID = :transactionId;
    l_rows := SQL%ROWCOUNT;
    COMMIT;
    IF l_rows = 0 THEN
        :status_code := 404;
        HTP.PRN(''{"success":false,"message":"Transaction not found"}'');
    ELSE
        :status_code := 200;
        HTP.PRN(''{"success":true,"message":"Transaction updated"}'');
    END IF;
EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    :status_code := 500;
    HTP.PRN(''{"success":false,"message":'' || APEX_JSON.STRINGIFY(SQLERRM) || ''}'');
END;
'
    );

    -- ──────────────────────────────────────────────────────────────────────
    -- DELETE /pc/transactions/:transactionId  — Delete a line
    -- ──────────────────────────────────────────────────────────────────────
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'pc',
        p_pattern        => 'transactions/:transactionId',
        p_method         => 'DELETE',
        p_source_type    => ORDS.source_type_plsql,
        p_source         => '
BEGIN
    DELETE FROM RR_PC_TRANSACTIONS WHERE TRANSACTION_ID = :transactionId;
    IF SQL%ROWCOUNT = 0 THEN
        :status_code := 404;
        HTP.PRN(''{"success":false,"message":"Transaction not found"}'');
    ELSE
        COMMIT;
        :status_code := 200;
        HTP.PRN(''{"success":true,"message":"Transaction deleted"}'');
    END IF;
EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    :status_code := 500;
    HTP.PRN(''{"success":false,"message":'' || APEX_JSON.STRINGIFY(SQLERRM) || ''}'');
END;
'
    );

    COMMIT;
END;
/
