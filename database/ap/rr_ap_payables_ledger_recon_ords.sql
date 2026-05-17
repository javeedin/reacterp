-- =============================================================================
-- ORDS Handler — GET /reerp/ap/reports/payables-ledger-recon
-- Payables to Ledger Reconciliation Summary
--
-- Module  : reerp   (base path /reerp/)
-- Pattern : ap/reports/payables-ledger-recon
-- Full URL: .../ords/bcldifc/reerp/ap/reports/payables-ledger-recon
--
-- Parameters (all optional):
--   P_BUSINESS_UNIT  – AP business unit  (e.g. 'BUIMERC CORP_DIFC_INVST')
--   P_COMPANY        – GL company segment (e.g. '01')
--   P_ACCOUNT        – GL account segment (e.g. '21100')
--   P_PERIOD         – GL period name    (e.g. 'Mar-26')
--
-- Response JSON (single object):
-- {
--   "period":             "Mar-26",
--   "period_start":       "2026-03-01",
--   "period_end":         "2026-03-31",
--   "currency":           "AED",
--   "payables_begin":     -999999.99,
--   "payables_invoices":  999999.99,
--   "payables_payments":  -999999.99,
--   "payables_prepay":    0,
--   "payables_end":       -999999.99,
--   "gl_opening":         -999999.99,
--   "gl_closing":         -999999.99,
--   "gl_ap_invoices":     -999999.99,
--   "gl_ap_payments":     999999.99,
--   "gl_non_ap_journals": 0,
--   "gl_not_transferred": 0,
--   "gl_not_posted":      0,
--   "payables_variance":  0,
--   "accounting_variance":0
-- }
--
-- Tables used:
--   RR_GL_FISCAL_PERIODS          – period start/end dates
--   RR_AP_INVOICES_ALL            – AP invoice headers
--   RR_AP_PAYMENTS_ALL            – AP payments
--   RR_AP_PAYMENTS_RELATED_INVOICES – payment ↔ invoice link
--   RR_AP_APPLIED_PREPAYMENTS     – prepayment applications
--   RR_GL_BALANCES                – GL opening/closing balances
--   RR_GL_LINES_ALL               – GL journal lines (for AP vs non-AP split)
--   RR_GL_HEADERS                 – GL journal headers (for category filter)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Drop existing template if present (idempotent re-run)
-- ---------------------------------------------------------------------------
BEGIN
    ORDS.DELETE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'ap/reports/payables-ledger-recon'
    );
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

-- ---------------------------------------------------------------------------
-- 2. Define template
-- ---------------------------------------------------------------------------
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'ap/reports/payables-ledger-recon',
        p_comments    => 'Payables to Ledger Reconciliation — period summary'
    );
    COMMIT;
END;
/

-- ---------------------------------------------------------------------------
-- 3. GET handler
-- ---------------------------------------------------------------------------
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'ap/reports/payables-ledger-recon',
        p_method         => 'GET',
        p_source_type    => 'plsql/block',
        p_items_per_page => 0,
        p_comments       => 'Returns one JSON object: payables + GL amounts for the reconciliation report',
        p_source         => q'[
DECLARE
  l_period_start DATE;
  l_period_end   DATE;

  -- ── Payables (AP subledger) amounts ───────────────────────────────────────
  l_p_begin    NUMBER := 0;   -- net AP liability before period start
  l_p_invoices NUMBER := 0;   -- new invoices in period  (positive)
  l_p_payments NUMBER := 0;   -- payments in period      (negative)
  l_p_prepay   NUMBER := 0;   -- prepayments applied     (0 – no period date on table)
  l_p_end      NUMBER := 0;   -- = begin + invoices + payments + prepayments

  -- ── GL (accounting) amounts ───────────────────────────────────────────────
  l_gl_opening      NUMBER := 0;
  l_gl_closing      NUMBER := 0;
  l_gl_activity     NUMBER := 0;   -- PERIOD_ACTIVITY (net debit/credit)
  l_gl_ap_inv       NUMBER := 0;   -- AP invoice category net
  l_gl_ap_pay       NUMBER := 0;   -- AP payment category net
  l_gl_non_ap       NUMBER := 0;   -- non-AP GL journals in period
  l_gl_not_trans    NUMBER := 0;   -- AP amounts not yet transferred to GL
  l_gl_not_posted   NUMBER := 0;   -- always 0 (no STATUS column in our model)
  l_gl_acc_variance NUMBER := 0;   -- opening + activity - closing (should be 0)

  -- ── Inline number→JSON helper ─────────────────────────────────────────────
  FUNCTION jn(p IN NUMBER) RETURN VARCHAR2 IS
    v VARCHAR2(100);
  BEGIN
    IF p IS NULL THEN RETURN '0'; END IF;
    v := TO_CHAR(p, 'TM9');
    IF v LIKE  '.%' THEN v := '0'  || v;  END IF;
    IF v LIKE '-.%' THEN v := '-0.' || SUBSTR(v, 3); END IF;
    RETURN v;
  END;

BEGIN
  -- ── 1. Resolve period dates ────────────────────────────────────────────────
  BEGIN
    SELECT NVL(START_DATE, TRUNC(SYSDATE,'MM')),
           NVL(END_DATE,   LAST_DAY(SYSDATE))
    INTO   l_period_start, l_period_end
    FROM   RR_GL_FISCAL_PERIODS
    WHERE  UPPER(PERIOD_NAME) = UPPER(:P_PERIOD)
    AND    ROWNUM = 1;
  EXCEPTION WHEN NO_DATA_FOUND THEN
    l_period_start := TRUNC(SYSDATE, 'MM');
    l_period_end   := LAST_DAY(SYSDATE);
  END;

  -- ── 2. Payables Begin Balance ──────────────────────────────────────────────
  -- Net AP liability as of (period_start − 1 day):
  --   Σ invoice_amount (non-cancelled, non-prepayment invoices before period)
  --   MINUS cash payments before period
  --   MINUS prepayment applications (no date column → approximation: exclude from begin)
  SELECT NVL(SUM(
      NVL(i.INVOICE_AMOUNT, 0)
    - NVL(pay_sub.total_paid,     0)
    - NVL(prep_sub.total_applied, 0)
  ), 0)
  INTO l_p_begin
  FROM RR_AP_INVOICES_ALL i
  LEFT JOIN (
    SELECT ri.INVOICE_ID,
           SUM(NVL(ri.AMOUNT_PAID_INVOICE_CURRENCY, 0)
             + NVL(ri.DISCOUNT_TAKEN, 0)) AS total_paid
    FROM   RR_AP_PAYMENTS_RELATED_INVOICES ri
    JOIN   RR_AP_PAYMENTS_ALL p ON p.CHECK_ID = ri.CHECK_ID
    WHERE  p.PAYMENT_DATE < l_period_start
    AND    NVL(p.PAYMENT_STATUS,          'Active') != 'Voided'
    AND    NVL(ri.INVOICE_PAYMENT_STATUS, 'Active') != 'Voided'
    AND    (:P_BUSINESS_UNIT IS NULL OR p.BUSINESS_UNIT = :P_BUSINESS_UNIT)
    GROUP BY ri.INVOICE_ID
  ) pay_sub  ON pay_sub.INVOICE_ID  = i.INVOICE_ID
  LEFT JOIN (
    SELECT ap.INVOICE_ID,
           SUM(NVL(ap.APPLIED_AMOUNT, 0)) AS total_applied
    FROM   RR_AP_APPLIED_PREPAYMENTS ap
    WHERE  NVL(ap.STATUS, 'Applied') != 'Cancelled'
    GROUP BY ap.INVOICE_ID
  ) prep_sub ON prep_sub.INVOICE_ID = i.INVOICE_ID
  WHERE i.INVOICE_DATE < l_period_start
  AND   NVL(i.CANCELED_FLAG,       'N')        != 'Y'
  AND   NVL(i.INVOICE_TYPE,        'Standard') != 'Prepayment'
  AND   (:P_BUSINESS_UNIT IS NULL OR i.BUSINESS_UNIT = :P_BUSINESS_UNIT);

  -- ── 3. Period Invoices ─────────────────────────────────────────────────────
  SELECT NVL(SUM(NVL(INVOICE_AMOUNT, 0)), 0)
  INTO   l_p_invoices
  FROM   RR_AP_INVOICES_ALL
  WHERE  INVOICE_DATE >= l_period_start
  AND    INVOICE_DATE <= l_period_end
  AND    NVL(CANCELED_FLAG,  'N')        != 'Y'
  AND    NVL(INVOICE_TYPE,   'Standard') != 'Prepayment'
  AND    (:P_BUSINESS_UNIT IS NULL OR BUSINESS_UNIT = :P_BUSINESS_UNIT);

  -- ── 4. Period Payments (negated – payments reduce AP liability) ────────────
  SELECT NVL(SUM(NVL(ri.AMOUNT_PAID_INVOICE_CURRENCY, 0)
                   + NVL(ri.DISCOUNT_TAKEN, 0)), 0)
  INTO   l_p_payments
  FROM   RR_AP_PAYMENTS_RELATED_INVOICES ri
  JOIN   RR_AP_PAYMENTS_ALL p ON p.CHECK_ID = ri.CHECK_ID
  WHERE  p.PAYMENT_DATE >= l_period_start
  AND    p.PAYMENT_DATE <= l_period_end
  AND    NVL(p.PAYMENT_STATUS,          'Active') != 'Voided'
  AND    NVL(ri.INVOICE_PAYMENT_STATUS, 'Active') != 'Voided'
  AND    (:P_BUSINESS_UNIT IS NULL OR p.BUSINESS_UNIT = :P_BUSINESS_UNIT);
  l_p_payments := -l_p_payments;   -- payments reduce AP liability → negative

  -- ── 5. Period Prepayments ──────────────────────────────────────────────────
  -- RR_AP_APPLIED_PREPAYMENTS has no date column; already deducted in begin balance.
  l_p_prepay := 0;

  -- ── 6. Payables End Balance ────────────────────────────────────────────────
  l_p_end := l_p_begin + l_p_invoices + l_p_payments + l_p_prepay;

  -- ── 7. GL Opening / Closing / Activity ────────────────────────────────────
  -- RR_GL_BALANCES stores liability accounts credit-normal (negative opening).
  -- Filter by ACCOUNT segment and COMPANY segment.
  BEGIN
    SELECT NVL(SUM(b.OPENING_BALANCE), 0),
           NVL(SUM(b.CLOSING_BALANCE), 0),
           NVL(SUM(b.PERIOD_ACTIVITY), 0)
    INTO   l_gl_opening, l_gl_closing, l_gl_activity
    FROM   RR_GL_BALANCES b
    WHERE  UPPER(b.PERIOD_NAME) = UPPER(:P_PERIOD)
    AND    b.ACTUAL_FLAG = 'A'
    AND    (:P_ACCOUNT IS NULL OR b.ACCOUNT  = :P_ACCOUNT)
    AND    (:P_COMPANY IS NULL OR b.COMPANY  = :P_COMPANY);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── 8. AP-sourced GL activity (split invoices vs payments) ────────────────
  -- Joins RR_GL_LINES_ALL + RR_GL_HEADERS, filters by AP journal categories,
  -- and optionally by account/company segment in ACCOUNT_COMBINATION.
  --
  -- AP invoice categories : 'Purchase Invoices', 'Payables Invoices', 'Payables', 'Invoices'
  -- AP payment categories : 'Payments', 'AP Payments', 'Cash Payments', 'Supplier Payments'
  BEGIN
    SELECT
      NVL(SUM(CASE
        WHEN UPPER(h.USER_JE_CATEGORY_NAME)
               IN ('PURCHASE INVOICES','PAYABLES INVOICES','PAYABLES','INVOICES')
        THEN NVL(l.ACCOUNTED_DR, 0) - NVL(l.ACCOUNTED_CR, 0)
        ELSE 0
      END), 0),
      NVL(SUM(CASE
        WHEN UPPER(h.USER_JE_CATEGORY_NAME)
               IN ('PAYMENTS','AP PAYMENTS','CASH PAYMENTS','SUPPLIER PAYMENTS')
        THEN NVL(l.ACCOUNTED_DR, 0) - NVL(l.ACCOUNTED_CR, 0)
        ELSE 0
      END), 0)
    INTO l_gl_ap_inv, l_gl_ap_pay
    FROM RR_GL_LINES_ALL l
    JOIN RR_GL_HEADERS   h ON h.JE_HEADER_ID = l.JE_HEADER_ID
    WHERE UPPER(h.PERIOD_NAME) = UPPER(:P_PERIOD)
    AND   UPPER(h.USER_JE_CATEGORY_NAME)
            IN ('PURCHASE INVOICES','PAYABLES INVOICES','PAYABLES','INVOICES',
                'PAYMENTS','AP PAYMENTS','CASH PAYMENTS','SUPPLIER PAYMENTS')
    -- Match account segment anywhere in the COA combination (e.g. '01-000-21100-...')
    AND   (:P_ACCOUNT IS NULL OR
           REGEXP_LIKE(l.ACCOUNT_COMBINATION,
                       '(^|[-.])'  || REGEXP_REPLACE(:P_ACCOUNT,'\.','\.') || '([-.]|$)'))
    -- Match company segment
    AND   (:P_COMPANY IS NULL OR
           REGEXP_LIKE(l.ACCOUNT_COMBINATION,
                       '(^|[-.])'  || REGEXP_REPLACE(:P_COMPANY,'\.','\.') || '([-.]|$)'));
  EXCEPTION WHEN OTHERS THEN
    l_gl_ap_inv := 0;
    l_gl_ap_pay := 0;
  END;

  -- ── 9. Non-AP GL journals ──────────────────────────────────────────────────
  l_gl_non_ap := l_gl_activity - l_gl_ap_inv - l_gl_ap_pay;

  -- ── 10. Not transferred to GL ─────────────────────────────────────────────
  -- Expected GL net from AP = -(invoices + payments)
  -- (invoices increase liability = credit = negative net; payments decrease = debit = positive)
  -- Difference between expected and actual AP-sourced GL = not yet transferred.
  l_gl_not_trans := -(l_p_invoices + l_p_payments) - (l_gl_ap_inv + l_gl_ap_pay);

  -- ── 11. Accounting variance ────────────────────────────────────────────────
  -- Should be 0 if GL data is consistent: opening + activity = closing
  l_gl_acc_variance := l_gl_closing - (l_gl_opening + l_gl_activity);

  -- ── 12. Output JSON ────────────────────────────────────────────────────────
  OWA_UTIL.MIME_HEADER('application/json', TRUE);
  HTP.PRN(
    '{'                                                                           ||
    '"period":'             || '"' || NVL(:P_PERIOD, '')                || '",'  ||
    '"period_start":'       || '"' || TO_CHAR(l_period_start, 'YYYY-MM-DD') || '",' ||
    '"period_end":'         || '"' || TO_CHAR(l_period_end,   'YYYY-MM-DD') || '",' ||
    '"currency":"AED",'                                                            ||
    '"payables_begin":'     || jn(l_p_begin)          || ','                      ||
    '"payables_invoices":'  || jn(l_p_invoices)       || ','                      ||
    '"payables_payments":'  || jn(l_p_payments)       || ','                      ||
    '"payables_prepay":'    || jn(l_p_prepay)         || ','                      ||
    '"payables_end":'       || jn(l_p_end)            || ','                      ||
    '"gl_opening":'         || jn(l_gl_opening)       || ','                      ||
    '"gl_closing":'         || jn(l_gl_closing)       || ','                      ||
    '"gl_ap_invoices":'     || jn(l_gl_ap_inv)        || ','                      ||
    '"gl_ap_payments":'     || jn(l_gl_ap_pay)        || ','                      ||
    '"gl_non_ap_journals":' || jn(l_gl_non_ap)        || ','                      ||
    '"gl_not_transferred":' || jn(l_gl_not_trans)     || ','                      ||
    '"gl_not_posted":'      || jn(l_gl_not_posted)    || ','                      ||
    '"payables_variance":'  || jn(0)                  || ','                      ||
    '"accounting_variance":'|| jn(l_gl_acc_variance)  ||
    '}'
  );

EXCEPTION WHEN OTHERS THEN
  OWA_UTIL.MIME_HEADER('application/json', TRUE);
  :status_code := 500;
  HTP.PRN('{"error":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;
]'
    );
    COMMIT;
END;
/

-- ---------------------------------------------------------------------------
-- 4. Verify registration
-- ---------------------------------------------------------------------------
SELECT t.uri_template, h.method,
       SUBSTR(h.source, 1, 80) AS source_preview
FROM   user_ords_modules   m
JOIN   user_ords_templates t ON m.id  = t.module_id
JOIN   user_ords_handlers  h ON t.id  = h.template_id
WHERE  m.name          = 'reerp'
AND    t.uri_template  = 'ap/reports/payables-ledger-recon'
ORDER  BY h.method;
