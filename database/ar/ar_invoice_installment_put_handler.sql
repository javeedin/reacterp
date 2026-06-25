-- ============================================================
-- PUT /ar/invoices/:id/installments/:installmentId
-- Updates AMOUNT_PAID and INSTALLMENT_AMOUNT_ADJUSTED on
-- RR_AR_INVOICE_INSTALLMENTS for a specific installment.
--
-- JSON Body:
-- {
--   "AmountPaid":                <number>,
--   "InstallmentAmountAdjusted": <number>,   -- can be negative
--   "LastUpdatedBy":             <string>
-- }
-- ============================================================

-- Step 1: Register child template under the existing invoices/:id/installments template
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'ar',
        p_pattern        => 'invoices/:id/installments/:installmentId',
        p_comments       => 'Single AR invoice installment — update paid/adjusted amounts'
    );
    COMMIT;
END;
/

-- Step 2: PUT handler
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'invoices/:id/installments/:installmentId',
        p_method         => 'PUT',
        p_source_type    => 'plsql/block',
        p_mimes_allowed  => 'application/json',
        p_comments       => 'Update AMOUNT_PAID and INSTALLMENT_AMOUNT_ADJUSTED for a specific installment',
        p_source         => '
DECLARE
    l_body          CLOB          := :body_text;
    l_txn_id        NUMBER        := :id;
    l_inst_id       NUMBER        := :installmentId;
    l_amount_paid   NUMBER;
    l_amount_adj    NUMBER;
    l_updated_by    VARCHAR2(240);
    l_rows_updated  NUMBER;
BEGIN
    -- Parse JSON body
    l_amount_paid  := APEX_JSON.get_number(p_path => ''AmountPaid'');
    l_amount_adj   := NVL(APEX_JSON.get_number(p_path => ''InstallmentAmountAdjusted''), 0);
    l_updated_by   := NVL(APEX_JSON.get_varchar2(p_path => ''LastUpdatedBy''), ''REERP'');

    APEX_JSON.parse(l_body);

    l_amount_paid  := APEX_JSON.get_number(p_path => ''AmountPaid'');
    l_amount_adj   := NVL(APEX_JSON.get_number(p_path => ''InstallmentAmountAdjusted''), 0);
    l_updated_by   := NVL(APEX_JSON.get_varchar2(p_path => ''LastUpdatedBy''), ''REERP'');

    UPDATE RR_AR_INVOICE_INSTALLMENTS
    SET    AMOUNT_PAID                  = l_amount_paid,
           INSTALLMENT_AMOUNT_ADJUSTED  = l_amount_adj,
           LAST_UPDATED_BY             = l_updated_by,
           LAST_UPDATE_DATE            = SYSDATE
    WHERE  INSTALLMENT_ID              = l_inst_id
      AND  CUSTOMER_TRX_ID             = l_txn_id;

    l_rows_updated := SQL%ROWCOUNT;

    IF l_rows_updated = 0 THEN
        :status := 404;
        APEX_JSON.open_object;
        APEX_JSON.write(''status'',  ''error'');
        APEX_JSON.write(''message'', ''Installment not found: id='' || l_inst_id || '' txn_id='' || l_txn_id);
        APEX_JSON.close_object;
    ELSE
        COMMIT;
        :status := 200;
        APEX_JSON.open_object;
        APEX_JSON.write(''status'',       ''success'');
        APEX_JSON.write(''installmentId'', l_inst_id);
        APEX_JSON.write(''txnId'',         l_txn_id);
        APEX_JSON.write(''amountPaid'',    l_amount_paid);
        APEX_JSON.write(''amountAdjusted'', l_amount_adj);
        APEX_JSON.write(''rowsUpdated'',   l_rows_updated);
        APEX_JSON.close_object;
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        :status := 500;
        APEX_JSON.open_object;
        APEX_JSON.write(''status'',  ''error'');
        APEX_JSON.write(''message'', SQLERRM);
        APEX_JSON.close_object;
END;
'
    );
    COMMIT;
END;
/
