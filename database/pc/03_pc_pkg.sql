-- ============================================================
-- Petty Cash Package — Spec + Body
-- File: database/pc/03_pc_pkg.sql
-- Run order: 3rd (after 01_pc_tables.sql, 02_pc_ords.sql)
-- ============================================================

-- ============================================================
-- PACKAGE SPEC
-- ============================================================
CREATE OR REPLACE PACKAGE RR_PC_PKG AS

    -- ── Registers ────────────────────────────────────────────
    PROCEDURE create_register (
        p_json     IN  CLOB,
        p_id       OUT NUMBER,
        p_error    OUT VARCHAR2
    );

    PROCEDURE update_register (
        p_register_id  IN  NUMBER,
        p_json         IN  CLOB,
        p_rows         OUT NUMBER,
        p_error        OUT VARCHAR2
    );

    PROCEDURE delete_register (
        p_register_id  IN  NUMBER,
        p_rows         OUT NUMBER,
        p_error        OUT VARCHAR2
    );

    -- ── Transactions ─────────────────────────────────────────
    PROCEDURE create_transaction (
        p_json         IN  CLOB,
        p_id           OUT NUMBER,
        p_line         OUT NUMBER,
        p_error        OUT VARCHAR2
    );

    PROCEDURE update_transaction (
        p_transaction_id  IN  NUMBER,
        p_json            IN  CLOB,
        p_rows            OUT NUMBER,
        p_error           OUT VARCHAR2
    );

    PROCEDURE delete_transaction (
        p_transaction_id  IN  NUMBER,
        p_rows            OUT NUMBER,
        p_error           OUT VARCHAR2
    );

END RR_PC_PKG;
/

-- ============================================================
-- PACKAGE BODY
-- ============================================================
CREATE OR REPLACE PACKAGE BODY RR_PC_PKG AS

    -- ──────────────────────────────────────────────────────────
    -- Internal helper: parse a date string safely
    -- Accepts YYYY-MM-DD or NULL
    -- ──────────────────────────────────────────────────────────
    FUNCTION parse_date (p_str IN VARCHAR2) RETURN DATE IS
    BEGIN
        IF p_str IS NULL OR TRIM(p_str) IS NULL THEN RETURN NULL; END IF;
        RETURN TO_DATE(p_str, 'YYYY-MM-DD');
    END parse_date;

    -- ══════════════════════════════════════════════════════════
    -- create_register
    -- ══════════════════════════════════════════════════════════
    PROCEDURE create_register (
        p_json     IN  CLOB,
        p_id       OUT NUMBER,
        p_error    OUT VARCHAR2
    ) IS
        l_name     VARCHAR2(200);
        l_start    DATE;
        l_end      DATE;
        l_comments VARCHAR2(1000);
        l_ccid     NUMBER;
        l_acc_desc VARCHAR2(400);
        l_currency VARCHAR2(10);
        l_by       VARCHAR2(150);
    BEGIN
        p_error := NULL;
        APEX_JSON.PARSE(p_json);

        l_name     := APEX_JSON.GET_VARCHAR2(p_path => 'registerName');
        l_start    := parse_date(APEX_JSON.GET_VARCHAR2(p_path => 'startDate'));
        l_end      := parse_date(APEX_JSON.GET_VARCHAR2(p_path => 'endDate'));
        l_comments := APEX_JSON.GET_VARCHAR2(p_path => 'comments');
        l_ccid     := APEX_JSON.GET_NUMBER  (p_path => 'cashAccountCcid');
        l_acc_desc := APEX_JSON.GET_VARCHAR2(p_path => 'cashAccountDesc');
        l_currency := NVL(APEX_JSON.GET_VARCHAR2(p_path => 'currency'), 'AED');
        l_by       := APEX_JSON.GET_VARCHAR2(p_path => 'createdBy');

        IF l_name IS NULL THEN
            p_error := 'registerName is required';
            RETURN;
        END IF;

        INSERT INTO RR_PC_REGISTERS (
            REGISTER_NAME, START_DATE, END_DATE, COMMENTS,
            CASH_ACCOUNT_CCID, CASH_ACCOUNT_DESC, CURRENCY,
            STATUS, CREATED_BY, CREATION_DATE,
            LAST_UPDATED_BY, LAST_UPDATE_DATE
        ) VALUES (
            l_name, l_start, l_end, l_comments,
            l_ccid, l_acc_desc, l_currency,
            'ACTIVE', l_by, SYSTIMESTAMP,
            l_by, SYSTIMESTAMP
        ) RETURNING REGISTER_ID INTO p_id;

        COMMIT;

    EXCEPTION
        WHEN DUP_VAL_ON_INDEX THEN
            p_error := 'Register name already exists';
        WHEN OTHERS THEN
            ROLLBACK;
            p_error := SQLERRM;
    END create_register;

    -- ══════════════════════════════════════════════════════════
    -- update_register
    -- ══════════════════════════════════════════════════════════
    PROCEDURE update_register (
        p_register_id  IN  NUMBER,
        p_json         IN  CLOB,
        p_rows         OUT NUMBER,
        p_error        OUT VARCHAR2
    ) IS
    BEGIN
        p_error := NULL;
        APEX_JSON.PARSE(p_json);

        UPDATE RR_PC_REGISTERS SET
            REGISTER_NAME     = NVL(APEX_JSON.GET_VARCHAR2(p_path => 'registerName'), REGISTER_NAME),
            START_DATE        = NVL(parse_date(APEX_JSON.GET_VARCHAR2(p_path => 'startDate')), START_DATE),
            END_DATE          = parse_date(APEX_JSON.GET_VARCHAR2(p_path => 'endDate')),
            COMMENTS          = APEX_JSON.GET_VARCHAR2(p_path => 'comments'),
            CASH_ACCOUNT_CCID = APEX_JSON.GET_NUMBER  (p_path => 'cashAccountCcid'),
            CASH_ACCOUNT_DESC = APEX_JSON.GET_VARCHAR2(p_path => 'cashAccountDesc'),
            CURRENCY          = NVL(APEX_JSON.GET_VARCHAR2(p_path => 'currency'),  CURRENCY),
            STATUS            = NVL(APEX_JSON.GET_VARCHAR2(p_path => 'status'),    STATUS),
            LAST_UPDATED_BY   = APEX_JSON.GET_VARCHAR2(p_path => 'updatedBy'),
            LAST_UPDATE_DATE  = SYSTIMESTAMP
        WHERE REGISTER_ID = p_register_id;

        p_rows := SQL%ROWCOUNT;
        COMMIT;

    EXCEPTION WHEN OTHERS THEN
        ROLLBACK;
        p_error := SQLERRM;
    END update_register;

    -- ══════════════════════════════════════════════════════════
    -- delete_register
    -- ══════════════════════════════════════════════════════════
    PROCEDURE delete_register (
        p_register_id  IN  NUMBER,
        p_rows         OUT NUMBER,
        p_error        OUT VARCHAR2
    ) IS
        l_txn_count NUMBER;
    BEGIN
        p_error := NULL;

        SELECT COUNT(*) INTO l_txn_count
        FROM   RR_PC_TRANSACTIONS
        WHERE  REGISTER_ID = p_register_id;

        IF l_txn_count > 0 THEN
            p_error := 'BLOCKED:Cannot delete register with existing transactions (' || l_txn_count || ')';
            p_rows  := 0;
            RETURN;
        END IF;

        DELETE FROM RR_PC_REGISTERS WHERE REGISTER_ID = p_register_id;
        p_rows := SQL%ROWCOUNT;
        IF p_rows > 0 THEN COMMIT; END IF;

    EXCEPTION WHEN OTHERS THEN
        ROLLBACK;
        p_error := SQLERRM;
    END delete_register;

    -- ══════════════════════════════════════════════════════════
    -- create_transaction
    -- ══════════════════════════════════════════════════════════
    PROCEDURE create_transaction (
        p_json   IN  CLOB,
        p_id     OUT NUMBER,
        p_line   OUT NUMBER,
        p_error  OUT VARCHAR2
    ) IS
        l_reg_id    NUMBER;
        l_reg_status VARCHAR2(50);
        l_next_line  NUMBER;
    BEGIN
        p_error := NULL;
        APEX_JSON.PARSE(p_json);

        l_reg_id := APEX_JSON.GET_NUMBER(p_path => 'registerId');

        -- Validate register exists and is open
        BEGIN
            SELECT STATUS INTO l_reg_status
            FROM   RR_PC_REGISTERS
            WHERE  REGISTER_ID = l_reg_id;
        EXCEPTION WHEN NO_DATA_FOUND THEN
            p_error := 'NOT_FOUND:Register ' || l_reg_id || ' not found';
            RETURN;
        END;

        IF l_reg_status = 'CLOSED' THEN
            p_error := 'BLOCKED:Register is closed — no transactions allowed';
            RETURN;
        END IF;

        -- Next line number within this register
        SELECT NVL(MAX(LINE_NUMBER), 0) + 1 INTO l_next_line
        FROM   RR_PC_TRANSACTIONS
        WHERE  REGISTER_ID = l_reg_id;

        INSERT INTO RR_PC_TRANSACTIONS (
            REGISTER_ID,    LINE_NUMBER,
            TRANSACTION_DATE,   TRANSACTION_TYPE,   EXPENSE_TYPE,
            CHARGE_ACCOUNT_CCID, CHARGE_ACCOUNT_DESC,
            ACCOUNTING_DATE,    POSTING_STATUS,
            CURRENCY,       DEBIT_AMOUNT,       CREDIT_AMOUNT,
            COMMENTS,       REFERENCE_NO,       ATTACHMENT,
            CREATED_BY,     CREATION_DATE,
            LAST_UPDATED_BY, LAST_UPDATE_DATE
        ) VALUES (
            l_reg_id,
            l_next_line,
            parse_date(APEX_JSON.GET_VARCHAR2(p_path => 'transactionDate')),
            APEX_JSON.GET_VARCHAR2(p_path => 'transactionType'),
            APEX_JSON.GET_VARCHAR2(p_path => 'expenseType'),
            APEX_JSON.GET_NUMBER  (p_path => 'chargeAccountCcid'),
            APEX_JSON.GET_VARCHAR2(p_path => 'chargeAccountDesc'),
            NVL(parse_date(APEX_JSON.GET_VARCHAR2(p_path => 'accountingDate')),
                parse_date(APEX_JSON.GET_VARCHAR2(p_path => 'transactionDate'))),
            NVL(APEX_JSON.GET_VARCHAR2(p_path => 'postingStatus'), 'Unposted'),
            NVL(APEX_JSON.GET_VARCHAR2(p_path => 'currency'), 'AED'),
            NVL(APEX_JSON.GET_NUMBER  (p_path => 'debitAmount'),  0),
            NVL(APEX_JSON.GET_NUMBER  (p_path => 'creditAmount'), 0),
            APEX_JSON.GET_VARCHAR2(p_path => 'comments'),
            APEX_JSON.GET_VARCHAR2(p_path => 'referenceNo'),
            APEX_JSON.GET_VARCHAR2(p_path => 'attachment'),
            APEX_JSON.GET_VARCHAR2(p_path => 'createdBy'),
            SYSTIMESTAMP,
            APEX_JSON.GET_VARCHAR2(p_path => 'createdBy'),
            SYSTIMESTAMP
        ) RETURNING TRANSACTION_ID INTO p_id;

        p_line := l_next_line;
        COMMIT;

    EXCEPTION WHEN OTHERS THEN
        ROLLBACK;
        p_error := SQLERRM;
    END create_transaction;

    -- ══════════════════════════════════════════════════════════
    -- update_transaction
    -- ══════════════════════════════════════════════════════════
    PROCEDURE update_transaction (
        p_transaction_id  IN  NUMBER,
        p_json            IN  CLOB,
        p_rows            OUT NUMBER,
        p_error           OUT VARCHAR2
    ) IS
    BEGIN
        p_error := NULL;
        APEX_JSON.PARSE(p_json);

        UPDATE RR_PC_TRANSACTIONS SET
            TRANSACTION_DATE    = NVL(parse_date(APEX_JSON.GET_VARCHAR2(p_path => 'transactionDate')),
                                      TRANSACTION_DATE),
            TRANSACTION_TYPE    = NVL(APEX_JSON.GET_VARCHAR2(p_path => 'transactionType'),
                                      TRANSACTION_TYPE),
            EXPENSE_TYPE        = APEX_JSON.GET_VARCHAR2(p_path => 'expenseType'),
            CHARGE_ACCOUNT_CCID = APEX_JSON.GET_NUMBER  (p_path => 'chargeAccountCcid'),
            CHARGE_ACCOUNT_DESC = APEX_JSON.GET_VARCHAR2(p_path => 'chargeAccountDesc'),
            ACCOUNTING_DATE     = NVL(parse_date(APEX_JSON.GET_VARCHAR2(p_path => 'accountingDate')),
                                      ACCOUNTING_DATE),
            POSTING_STATUS      = NVL(APEX_JSON.GET_VARCHAR2(p_path => 'postingStatus'),
                                      POSTING_STATUS),
            CURRENCY            = NVL(APEX_JSON.GET_VARCHAR2(p_path => 'currency'), CURRENCY),
            DEBIT_AMOUNT        = NVL(APEX_JSON.GET_NUMBER  (p_path => 'debitAmount'),  DEBIT_AMOUNT),
            CREDIT_AMOUNT       = NVL(APEX_JSON.GET_NUMBER  (p_path => 'creditAmount'), CREDIT_AMOUNT),
            COMMENTS            = APEX_JSON.GET_VARCHAR2(p_path => 'comments'),
            REFERENCE_NO        = APEX_JSON.GET_VARCHAR2(p_path => 'referenceNo'),
            ATTACHMENT          = APEX_JSON.GET_VARCHAR2(p_path => 'attachment'),
            LAST_UPDATED_BY     = APEX_JSON.GET_VARCHAR2(p_path => 'updatedBy'),
            LAST_UPDATE_DATE    = SYSTIMESTAMP
        WHERE TRANSACTION_ID = p_transaction_id;

        p_rows := SQL%ROWCOUNT;
        COMMIT;

    EXCEPTION WHEN OTHERS THEN
        ROLLBACK;
        p_error := SQLERRM;
    END update_transaction;

    -- ══════════════════════════════════════════════════════════
    -- delete_transaction
    -- ══════════════════════════════════════════════════════════
    PROCEDURE delete_transaction (
        p_transaction_id  IN  NUMBER,
        p_rows            OUT NUMBER,
        p_error           OUT VARCHAR2
    ) IS
    BEGIN
        p_error := NULL;
        DELETE FROM RR_PC_TRANSACTIONS WHERE TRANSACTION_ID = p_transaction_id;
        p_rows := SQL%ROWCOUNT;
        IF p_rows > 0 THEN COMMIT; END IF;

    EXCEPTION WHEN OTHERS THEN
        ROLLBACK;
        p_error := SQLERRM;
    END delete_transaction;

END RR_PC_PKG;
/
