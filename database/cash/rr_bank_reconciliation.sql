-- =============================================================================
-- RR_BANK_RECONCILIATION.SQL
-- Bank Reconciliation: ORDS REST Handlers
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. GET cash/reconciliation/stmtlines
--    Returns bank statement lines (unreconciled or reconciled) for a bank account
-- ---------------------------------------------------------------------------
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'cash/reconciliation/stmtlines',
        p_method         => 'GET',
        p_source_type    => ORDS.source_type_plsql,
        p_source         => q'[
DECLARE
    v_clob  CLOB;
    v_buf   VARCHAR2(32767);
    v_first BOOLEAN := TRUE;
    v_limit NUMBER  := NVL(:row_limit, 500);

    CURSOR c_data IS
        SELECT
            l.LINE_ID,
            l.STATEMENT_ID,
            h.STATEMENT_NUMBER,
            l.LINE_NUMBER,
            TO_CHAR(l.TRANSACTION_DATE,           'YYYY-MM-DD')  AS TRANSACTION_DATE,
            TO_CHAR(l.VALUE_DATE,                 'YYYY-MM-DD')  AS VALUE_DATE,
            REGEXP_REPLACE(TO_CHAR(NVL(l.AMOUNT,0),'FM99999999999999990.9999999999'),'\.$','')  AS AMOUNT,
            l.TRANSACTION_CODE,
            l.DESCRIPTION,
            l.REFERENCE,
            l.BANK_TXN_REFERENCE,
            l.COUNTERPARTY_NAME,
            l.COUNTERPARTY_ACCOUNT,
            l.RECON_STATUS,
            REGEXP_REPLACE(TO_CHAR(NVL(l.RECON_AMOUNT,0),'FM99999999999999990.9999999999'),'\.$','')  AS RECON_AMOUNT,
            l.RECON_TXN_TYPE,
            l.RECON_TXN_NUMBER,
            l.RECON_NOTES,
            TO_CHAR(l.RECON_DATE,                 'YYYY-MM-DD')  AS RECON_DATE,
            h.BANK_ACCOUNT_NAME,
            h.BANK_ACCOUNT_NUMBER,
            h.CURRENCY_CODE
        FROM   RR_BANK_STATEMENT_LINES   l
        JOIN   RR_BANK_STATEMENT_HEADER  h ON l.STATEMENT_ID = h.STATEMENT_ID
        WHERE  (:bank_account  IS NULL OR UPPER(h.BANK_ACCOUNT_NAME)   LIKE '%' || UPPER(:bank_account) || '%'
                                      OR UPPER(h.BANK_ACCOUNT_NUMBER)  LIKE '%' || UPPER(:bank_account) || '%')
        AND    l.RECON_STATUS  = NVL(:recon_status, 'UNRECONCILED')
        AND    (:date_from     IS NULL OR l.TRANSACTION_DATE >= TO_DATE(:date_from, 'YYYY-MM-DD'))
        AND    (:date_to       IS NULL OR l.TRANSACTION_DATE <= TO_DATE(:date_to,   'YYYY-MM-DD'))
        AND    (:amount_min    IS NULL OR l.AMOUNT >= TO_NUMBER(:amount_min))
        AND    (:amount_max    IS NULL OR l.AMOUNT <= TO_NUMBER(:amount_max))
        AND    (:statement_id  IS NULL OR l.STATEMENT_ID = TO_NUMBER(:statement_id))
        AND    (:reference     IS NULL OR UPPER(l.REFERENCE)   LIKE '%' || UPPER(:reference) || '%'
                                      OR UPPER(l.DESCRIPTION)  LIKE '%' || UPPER(:reference) || '%')
        ORDER  BY l.TRANSACTION_DATE DESC, l.LINE_ID DESC
        FETCH  FIRST v_limit ROWS ONLY;
BEGIN
    DBMS_LOB.CREATETEMPORARY(v_clob, TRUE);
    DBMS_LOB.APPEND(v_clob, '{"status":"success","items":[');

    FOR r IN c_data LOOP
        IF NOT v_first THEN
            DBMS_LOB.APPEND(v_clob, ',');
        END IF;
        v_first := FALSE;

        v_buf :=
            '{"lineId":'                || r.LINE_ID                                              ||
            ',"statementId":'           || r.STATEMENT_ID                                         ||
            ',"statementNumber":'       || APEX_JSON.STRINGIFY(NVL(r.STATEMENT_NUMBER,''))        ||
            ',"lineNumber":'            || NVL(TO_CHAR(r.LINE_NUMBER),'null')                     ||
            ',"transactionDate":'       || APEX_JSON.STRINGIFY(NVL(r.TRANSACTION_DATE,''))        ||
            ',"valueDate":'             || APEX_JSON.STRINGIFY(NVL(r.VALUE_DATE,''))              ||
            ',"amount":'                || r.AMOUNT                                               ||
            ',"transactionCode":'       || APEX_JSON.STRINGIFY(NVL(r.TRANSACTION_CODE,''))        ||
            ',"description":'           || APEX_JSON.STRINGIFY(NVL(r.DESCRIPTION,''))            ||
            ',"reference":'             || APEX_JSON.STRINGIFY(NVL(r.REFERENCE,''))              ||
            ',"bankTxnReference":'      || APEX_JSON.STRINGIFY(NVL(r.BANK_TXN_REFERENCE,''))     ||
            ',"counterpartyName":'      || APEX_JSON.STRINGIFY(NVL(r.COUNTERPARTY_NAME,''))      ||
            ',"counterpartyAccount":'   || APEX_JSON.STRINGIFY(NVL(r.COUNTERPARTY_ACCOUNT,''))   ||
            ',"reconStatus":'           || APEX_JSON.STRINGIFY(NVL(r.RECON_STATUS,''))           ||
            ',"reconAmount":'           || r.RECON_AMOUNT                                         ||
            ',"reconTxnType":'          || APEX_JSON.STRINGIFY(NVL(r.RECON_TXN_TYPE,''))         ||
            ',"reconTxnNumber":'        || APEX_JSON.STRINGIFY(NVL(r.RECON_TXN_NUMBER,''))       ||
            ',"reconNotes":'            || APEX_JSON.STRINGIFY(NVL(r.RECON_NOTES,''))            ||
            ',"reconDate":'             || APEX_JSON.STRINGIFY(NVL(r.RECON_DATE,''))             ||
            ',"bankAccountName":'       || APEX_JSON.STRINGIFY(NVL(r.BANK_ACCOUNT_NAME,''))      ||
            ',"bankAccountNumber":'     || APEX_JSON.STRINGIFY(NVL(r.BANK_ACCOUNT_NUMBER,''))    ||
            ',"currencyCode":'          || APEX_JSON.STRINGIFY(NVL(r.CURRENCY_CODE,''))          ||
            '}';
        DBMS_LOB.APPEND(v_clob, v_buf);
    END LOOP;

    DBMS_LOB.APPEND(v_clob, ']}');
    HTP.P(v_clob);
    DBMS_LOB.FREETEMPORARY(v_clob);
EXCEPTION
    WHEN OTHERS THEN
        HTP.P('{"status":"error","message":' || APEX_JSON.STRINGIFY(SQLERRM) || '}');
END;
]',
        p_items_per_page => 0
    );
    COMMIT;
END;
/

-- ---------------------------------------------------------------------------
-- 2. GET cash/reconciliation/systxns
--    Returns AP payment transactions for a bank account (system-side for recon)
-- ---------------------------------------------------------------------------
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'cash/reconciliation/systxns',
        p_method         => 'GET',
        p_source_type    => ORDS.source_type_plsql,
        p_source         => q'[
DECLARE
    v_clob  CLOB;
    v_buf   VARCHAR2(32767);
    v_first BOOLEAN := TRUE;
    v_limit NUMBER  := NVL(:row_limit, 500);

    CURSOR c_data IS
        SELECT
            p.CHECK_ID,
            p.PAYMENT_NUMBER,
            p.PAYMENT_REFERENCE,
            TO_CHAR(p.PAYMENT_DATE,       'YYYY-MM-DD')  AS PAYMENT_DATE,
            REGEXP_REPLACE(TO_CHAR(NVL(p.PAYMENT_AMOUNT,0),'FM99999999999999990.9999999999'),'\.$','')  AS PAYMENT_AMOUNT,
            p.PAYMENT_CURRENCY,
            p.PAYMENT_STATUS,
            p.PAYMENT_TYPE,
            p.PAYMENT_MODE,
            p.DISBURSEMENT_BANK_ACCOUNT_NAME,
            p.DISBURSEMENT_BANK_ACCOUNT_NUMBER,
            p.PAYEE,
            p.SUPPLIER_NUMBER,
            p.BUSINESS_UNIT,
            p.LEGAL_ENTITY,
            TO_CHAR(p.CLEARING_DATE,      'YYYY-MM-DD')  AS CLEARING_DATE,
            REGEXP_REPLACE(TO_CHAR(NVL(p.CLEARING_AMOUNT,0),'FM99999999999999990.9999999999'),'\.$','')  AS CLEARING_AMOUNT,
            TO_CHAR(p.ACCOUNTING_DATE,    'YYYY-MM-DD')  AS ACCOUNTING_DATE,
            p.RECONCILED_FLAG
        FROM   RR_AP_PAYMENTS_ALL p
        WHERE  (:bank_account     IS NULL OR UPPER(p.DISBURSEMENT_BANK_ACCOUNT_NAME) LIKE '%' || UPPER(:bank_account) || '%')
        AND    (:date_from        IS NULL OR p.PAYMENT_DATE    >= TO_DATE(:date_from, 'YYYY-MM-DD'))
        AND    (:date_to          IS NULL OR p.PAYMENT_DATE    <= TO_DATE(:date_to,   'YYYY-MM-DD'))
        AND    (:amount_min       IS NULL OR p.PAYMENT_AMOUNT  >= TO_NUMBER(:amount_min))
        AND    (:amount_max       IS NULL OR p.PAYMENT_AMOUNT  <= TO_NUMBER(:amount_max))
        AND    (:reference        IS NULL OR UPPER(p.PAYMENT_NUMBER)    LIKE '%' || UPPER(:reference) || '%'
                                         OR UPPER(p.PAYMENT_REFERENCE)  LIKE '%' || UPPER(:reference) || '%')
        AND    (:payment_status   IS NULL OR p.PAYMENT_STATUS  = :payment_status)
        AND    NVL(p.RECONCILED_FLAG,'N') = NVL(:reconciled, 'N')
        ORDER  BY p.PAYMENT_DATE DESC, p.CHECK_ID DESC
        FETCH  FIRST v_limit ROWS ONLY;
BEGIN
    DBMS_LOB.CREATETEMPORARY(v_clob, TRUE);
    DBMS_LOB.APPEND(v_clob, '{"status":"success","items":[');

    FOR r IN c_data LOOP
        IF NOT v_first THEN
            DBMS_LOB.APPEND(v_clob, ',');
        END IF;
        v_first := FALSE;

        v_buf :=
            '{"txnId":'                 || r.CHECK_ID                                                     ||
            ',"txnNumber":'             || APEX_JSON.STRINGIFY(NVL(r.PAYMENT_NUMBER,''))                  ||
            ',"reference":'             || APEX_JSON.STRINGIFY(NVL(r.PAYMENT_REFERENCE,''))               ||
            ',"txnDate":'               || APEX_JSON.STRINGIFY(NVL(r.PAYMENT_DATE,''))                    ||
            ',"amount":'                || r.PAYMENT_AMOUNT                                               ||
            ',"currencyCode":'          || APEX_JSON.STRINGIFY(NVL(r.PAYMENT_CURRENCY,''))                ||
            ',"payee":'                 || APEX_JSON.STRINGIFY(NVL(r.PAYEE,''))                           ||
            ',"supplierNumber":'        || APEX_JSON.STRINGIFY(NVL(r.SUPPLIER_NUMBER,''))                 ||
            ',"businessUnit":'          || APEX_JSON.STRINGIFY(NVL(r.BUSINESS_UNIT,''))                   ||
            ',"paymentStatus":'         || APEX_JSON.STRINGIFY(NVL(r.PAYMENT_STATUS,''))                  ||
            ',"paymentType":'           || APEX_JSON.STRINGIFY(NVL(r.PAYMENT_TYPE,''))                    ||
            ',"bankAccountName":'       || APEX_JSON.STRINGIFY(NVL(r.DISBURSEMENT_BANK_ACCOUNT_NAME,''))  ||
            ',"reconciledFlag":'        || APEX_JSON.STRINGIFY(NVL(r.RECONCILED_FLAG,'N'))                ||
            ',"source":"AP_PAYMENT"'                                                                      ||
            '}';
        DBMS_LOB.APPEND(v_clob, v_buf);
    END LOOP;

    DBMS_LOB.APPEND(v_clob, ']}');
    HTP.P(v_clob);
    DBMS_LOB.FREETEMPORARY(v_clob);
EXCEPTION
    WHEN OTHERS THEN
        HTP.P('{"status":"error","message":' || APEX_JSON.STRINGIFY(SQLERRM) || '}');
END;
]',
        p_items_per_page => 0
    );
    COMMIT;
END;
/
