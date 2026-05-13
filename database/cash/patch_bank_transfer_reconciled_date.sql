-- ============================================================
-- Patch: Add RECONCILED_DATE to RR_BANK_ACCOUNT_TRANSFERS
-- Run in Oracle APEX SQL Workshop (reerp module must exist)
-- ============================================================

-- Step 1: Add RECONCILED_DATE column
BEGIN
  EXECUTE IMMEDIATE '
    ALTER TABLE RR_BANK_ACCOUNT_TRANSFERS
    ADD RECONCILED_DATE DATE
  ';
  DBMS_OUTPUT.PUT_LINE('RECONCILED_DATE column added');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -1430 THEN   -- ORA-01430: column already exists
      DBMS_OUTPUT.PUT_LINE('RECONCILED_DATE already exists — skipped');
    ELSE
      RAISE;
    END IF;
END;
/

-- Step 2: Update GET handler to return reconciledDate
-- Add to the cursor SELECT in the GET handler:
--   NVL(TO_CHAR(RECONCILED_DATE, 'YYYY-MM-DD'), '') AS RECONCILED_DATE
-- And add to the APEX_JSON.WRITE section:
--   APEX_JSON.WRITE('reconciledDate', r.RECONCILED_DATE);

-- Rebuild GET handler
BEGIN
  BEGIN
    ORDS.DELETE_HANDLER(
      p_module_name => 'reerp',
      p_pattern     => 'cash/banktransfers',
      p_method      => 'GET'
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  ORDS.DEFINE_HANDLER(
    p_module_name    => 'reerp',
    p_pattern        => 'cash/banktransfers',
    p_method         => 'GET',
    p_source_type    => ORDS.source_type_plsql,
    p_items_per_page => 0,
    p_mimes_allowed  => '',
    p_comments       => 'List bank account transfers with reconciled date',
    p_source         => q'[
DECLARE
  l_row_limit     NUMBER  := NVL(TO_NUMBER(:row_limit), 200);
  l_business_unit VARCHAR2(240) := :business_unit;
  l_from_account  VARCHAR2(240) := :from_account;
  l_to_account    VARCHAR2(240) := :to_account;
  l_date_from     DATE := TO_DATE(:date_from, 'YYYY-MM-DD');
  l_date_to       DATE := TO_DATE(:date_to,   'YYYY-MM-DD');

  CURSOR c IS
    SELECT t.*,
           NVL(ACCOUNTING_FLAG, 'N')                       AS ACCOUNTING_FLAG,
           NVL(TO_CHAR(RECONCILED_DATE, 'YYYY-MM-DD'), '') AS RECONCILED_DATE
    FROM   RR_BANK_ACCOUNT_TRANSFERS t
    WHERE  (l_business_unit IS NULL OR UPPER(BUSINESS_UNIT) LIKE '%' || UPPER(l_business_unit) || '%')
    AND    (l_from_account  IS NULL OR UPPER(FROM_BANK_ACCOUNT_NAME) LIKE '%' || UPPER(l_from_account) || '%')
    AND    (l_to_account    IS NULL OR UPPER(TO_BANK_ACCOUNT_NAME)   LIKE '%' || UPPER(l_to_account)   || '%')
    AND    (l_date_from     IS NULL OR TRUNC(TRANSACTION_DATE) >= l_date_from)
    AND    (l_date_to       IS NULL OR TRUNC(TRANSACTION_DATE) <= l_date_to)
    ORDER BY TRANSACTION_DATE DESC, BANK_ACCOUNT_TRANSFER_ID DESC
    FETCH FIRST l_row_limit ROWS ONLY;
BEGIN
  APEX_JSON.OPEN_OBJECT;
  APEX_JSON.WRITE('status', 'success');
  APEX_JSON.OPEN_ARRAY('items');
  FOR r IN c LOOP
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('bankAccountTransferId',     r.BANK_ACCOUNT_TRANSFER_ID);
    APEX_JSON.WRITE('bankAccountTransferNumber', r.BANK_ACCOUNT_TRANSFER_NUMBER);
    APEX_JSON.WRITE('transactionDate',           NVL(TO_CHAR(r.TRANSACTION_DATE, 'YYYY-MM-DD'), ''));
    APEX_JSON.WRITE('memo',                      r.MEMO);
    APEX_JSON.WRITE('paymentAmount',             r.PAYMENT_AMOUNT);
    APEX_JSON.WRITE('fromAmount',                r.FROM_AMOUNT);
    APEX_JSON.WRITE('conversionRate',            r.CONVERSION_RATE);
    APEX_JSON.WRITE('fromBankAccountName',       r.FROM_BANK_ACCOUNT_NAME);
    APEX_JSON.WRITE('toBankAccountName',         r.TO_BANK_ACCOUNT_NAME);
    APEX_JSON.WRITE('fromCurrencyCode',          r.FROM_CURRENCY_CODE);
    APEX_JSON.WRITE('toCurrencyCode',            r.TO_CURRENCY_CODE);
    APEX_JSON.WRITE('paymentCurrencyCode',       r.PAYMENT_CURRENCY_CODE);
    APEX_JSON.WRITE('conversionRateType',        r.CONVERSION_RATE_TYPE);
    APEX_JSON.WRITE('status',                    r.STATUS);
    APEX_JSON.WRITE('paymentStatus',             r.PAYMENT_STATUS);
    APEX_JSON.WRITE('paymentMethod',             r.PAYMENT_METHOD);
    APEX_JSON.WRITE('paymentProfileName',        r.PAYMENT_PROFILE_NAME);
    APEX_JSON.WRITE('businessUnit',              r.BUSINESS_UNIT);
    APEX_JSON.WRITE('paymentFile',               r.PAYMENT_FILE);
    APEX_JSON.WRITE('fromExternalTrxId',         r.FROM_EXTERNAL_TRX_ID);
    APEX_JSON.WRITE('toExternalTrxId',           r.TO_EXTERNAL_TRX_ID);
    APEX_JSON.WRITE('isSettledWithIbyFlag',      r.IS_SETTLED_WITH_IBY_FLAG);
    APEX_JSON.WRITE('createdBy',                 r.CREATED_BY);
    APEX_JSON.WRITE('creationDate',              NVL(TO_CHAR(r.CREATION_DATE, 'YYYY-MM-DD'), ''));
    APEX_JSON.WRITE('lastUpdateDate',            NVL(TO_CHAR(r.LAST_UPDATE_DATE, 'YYYY-MM-DD'), ''));
    APEX_JSON.WRITE('syncDate',                  NVL(TO_CHAR(r.SYNC_DATE, 'YYYY-MM-DD'), ''));
    APEX_JSON.WRITE('accountingFlag',            r.ACCOUNTING_FLAG);
    APEX_JSON.WRITE('reconciledDate',            r.RECONCILED_DATE);
    APEX_JSON.CLOSE_OBJECT;
  END LOOP;
  APEX_JSON.CLOSE_ARRAY;
  APEX_JSON.CLOSE_OBJECT;
EXCEPTION WHEN OTHERS THEN
  APEX_JSON.OPEN_OBJECT;
  APEX_JSON.WRITE('status',  'error');
  APEX_JSON.WRITE('message', SQLERRM);
  APEX_JSON.CLOSE_OBJECT;
END;
]'
  );

  COMMIT;
END;
/

-- Step 3: Update POST/PUT handler to accept ReconciledDate
-- In the MERGE INTO statement inside RR_SYNC_BANK_ACCOUNT_TRANSFERS,
-- add the following to the JSON_TABLE columns:
--   reconciled_date    DATE PATH '$.ReconciledDate'
-- And in the MERGE UPDATE SET:
--   RECONCILED_DATE = NVL(src.reconciled_date, tgt.RECONCILED_DATE)
-- And in the MERGE INSERT VALUES:
--   NVL(src.reconciled_date, SYSDATE)   -- or NULL if not provided

-- Minimal inline patch for the POST handler to handle ReconciledDate:
-- (If your POST handler calls RR_SYNC_BANK_ACCOUNT_TRANSFERS, update that procedure.
--  Otherwise add RECONCILED_DATE handling directly in the POST source.)
