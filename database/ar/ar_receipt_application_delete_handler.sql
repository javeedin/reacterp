-- =====================================================
-- ORDS REST Handler: DELETE /ar/receipt-applications/:appId
--
-- Delete a single receipt application AND reverse the installment it paid, so the
-- open balance reflects that the allocated amount is no longer applied:
--   • RR_AR_INVOICE_INSTALLMENTS (the app's REFERENCE_INSTALLMENT_ID):
--       INSTALLMENT_BALANCE_DUE     += APPLICATION_AMOUNT + ABS(ADJUSTMENT_AMOUNT)  (restore amount due)
--       AMOUNT_PAID                 -= APPLICATION_AMOUNT   (floor 0)
--       INSTALLMENT_AMOUNT_ADJUSTED  = 0
--       INSTALLMENT_STATUS           = 'Open'
--       INSTALLMENT_CLOSED_DATE      = NULL
--   • RR_AR_ADJUSTMENTS: delete rows for this APPLICATION_ID
--   • RR_AR_RECEIPT_APPLICATIONS: delete the application row
--
-- This is the exact reverse of the PUT /ar/receipt-applications/:appId apply.
-- Call: DELETE {base}/ar/receipt-applications/{applicationId}   (no body)
--
-- Run in APEX SQL Workshop -> SQL Commands.
-- =====================================================

BEGIN
    ORDS.DELETE_HANDLER(p_module_name => 'ar', p_pattern => 'receipt-applications/:appId', p_method => 'DELETE');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'ar', p_pattern => 'receipt-applications/:appId');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'receipt-applications/:appId',
        p_method         => 'DELETE',
        p_source_type    => 'plsql/block',
        p_mimes_allowed  => 'application/json',
        p_comments       => 'Delete a receipt application and restore its installment balance',
        p_source         => q'[
DECLARE
  v_app_id     NUMBER := TO_NUMBER(:appId);
  v_app_amt    NUMBER;
  v_adj_amt    NUMBER;
  v_inst_id    NUMBER;
  v_adjs       NUMBER := 0;
BEGIN
  -- 1. Load the application (404 if missing)
  BEGIN
    SELECT NVL(APPLICATION_AMOUNT, 0), NVL(ADJUSTMENT_AMOUNT, 0), REFERENCE_INSTALLMENT_ID
      INTO v_app_amt, v_adj_amt, v_inst_id
      FROM RR_AR_RECEIPT_APPLICATIONS
     WHERE APPLICATION_ID = v_app_id;
  EXCEPTION WHEN NO_DATA_FOUND THEN
    :status_code := 404;
    OWA_UTIL.MIME_HEADER('application/json', TRUE);
    HTP.PRN('{"success":false,"error":"Receipt application not found for ID ' || v_app_id || '"}');
    RETURN;
  END;

  -- 2. Reverse the installment — allocated amount goes back to the open balance
  IF v_inst_id IS NOT NULL THEN
    UPDATE RR_AR_INVOICE_INSTALLMENTS
       SET INSTALLMENT_BALANCE_DUE     = NVL(INSTALLMENT_BALANCE_DUE, 0) + v_app_amt + ABS(v_adj_amt),
           AMOUNT_PAID                 = GREATEST(NVL(AMOUNT_PAID, 0) - v_app_amt, 0),
           INSTALLMENT_AMOUNT_ADJUSTED = 0,
           INSTALLMENT_STATUS          = 'Open',
           INSTALLMENT_CLOSED_DATE     = NULL,
           LAST_UPDATED_BY             = USER,
           LAST_UPDATE_DATE            = SYSTIMESTAMP
     WHERE INSTALLMENT_ID = v_inst_id;
  END IF;

  -- 3. Delete this application's adjustments
  DELETE FROM RR_AR_ADJUSTMENTS WHERE APPLICATION_ID = v_app_id;
  v_adjs := SQL%ROWCOUNT;

  -- 4. Delete the application row
  DELETE FROM RR_AR_RECEIPT_APPLICATIONS WHERE APPLICATION_ID = v_app_id;

  COMMIT;
  :status_code := 200;
  OWA_UTIL.MIME_HEADER('application/json', TRUE);
  HTP.PRN('{"success":true,"applicationId":' || v_app_id ||
          ',"installmentId":' || NVL(TO_CHAR(v_inst_id), 'null') ||
          ',"amountRestored":' || (v_app_amt + ABS(v_adj_amt)) ||
          ',"adjustmentsDeleted":' || v_adjs || '}');
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    :status_code := 500;
    OWA_UTIL.MIME_HEADER('application/json', TRUE);
    HTP.PRN('{"success":false,"error":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;]'
    );
    COMMIT;
END;
/

-- =====================================================
-- ENDPOINT SUMMARY
-- DELETE {base}/ar/receipt-applications/{applicationId}   (no request body)
--   Deletes the application, restores its installment (balance/paid/status),
--   resets INSTALLMENT_AMOUNT_ADJUSTED, and deletes its adjustments.
-- =====================================================
