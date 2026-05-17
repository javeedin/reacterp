-- =============================================================================
-- Drill-down ORDS handlers for Payables-to-Ledger Reconciliation
--
-- Module  : reerp
-- Base    : ap/reports/payables-ledger-recon/
--
-- Endpoints:
--   ap-invoices   – AP invoices (P_DATE_FILTER: 'before'=begin, 'in'=period, 'end'=end)
--   ap-payments   – AP payments in period
--   gl-lines      – GL journal lines (P_CAT_TYPE: 'ap-inv', 'ap-pay', 'non-ap')
--   gl-balances   – GL balance breakdown by account/company
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ap-invoices
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'reerp',
                         p_pattern     => 'ap/reports/payables-ledger-recon/ap-invoices');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'ap/reports/payables-ledger-recon/ap-invoices',
        p_comments    => 'Drill-down: AP invoices for begin / period / end'
    );
    COMMIT;
END;
/
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'ap/reports/payables-ledger-recon/ap-invoices',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 500,
        p_comments       => 'AP invoices filtered by date relative to period',
        p_source         => q'[
SELECT
    i.INVOICE_NUMBER,
    TO_CHAR(i.INVOICE_DATE, 'YYYY-MM-DD')        AS invoice_date,
    i.SUPPLIER,
    i.INVOICE_TYPE,
    i.INVOICE_AMOUNT                              AS invoice_amount,
    NVL(pay.total_paid, 0)                        AS amount_paid,
    i.INVOICE_AMOUNT - NVL(pay.total_paid, 0)     AS outstanding,
    i.VALIDATION_STATUS                           AS validation_status,
    i.BUSINESS_UNIT                               AS business_unit
FROM RR_AP_INVOICES_ALL i
LEFT JOIN (
    SELECT INVOICE_ID,
           SUM(NVL(AMOUNT_PAID_INVOICE_CURRENCY, 0) + NVL(DISCOUNT_TAKEN, 0)) AS total_paid
    FROM   RR_AP_PAYMENTS_RELATED_INVOICES
    GROUP BY INVOICE_ID
) pay ON pay.INVOICE_ID = i.INVOICE_ID
WHERE (
    -- 'before'  → invoices before period start (begin balance)
    (NVL(:P_DATE_FILTER, 'in') = 'before'
        AND i.INVOICE_DATE < TRUNC(TO_DATE('01-' || :P_PERIOD, 'DD-Mon-RR'), 'MM'))
    OR
    -- 'in' (default) → invoices in the period
    (NVL(:P_DATE_FILTER, 'in') = 'in'
        AND i.INVOICE_DATE >= TRUNC(TO_DATE('01-' || :P_PERIOD, 'DD-Mon-RR'), 'MM')
        AND i.INVOICE_DATE <= LAST_DAY(TRUNC(TO_DATE('01-' || :P_PERIOD, 'DD-Mon-RR'), 'MM')))
    OR
    -- 'end' → invoices up to end of period (end balance)
    (NVL(:P_DATE_FILTER, 'in') = 'end'
        AND i.INVOICE_DATE <= LAST_DAY(TRUNC(TO_DATE('01-' || :P_PERIOD, 'DD-Mon-RR'), 'MM')))
)
AND NVL(i.CANCELED_FLAG,  'N')        != 'Y'
AND NVL(i.INVOICE_TYPE,   'Standard') != 'Prepayment'
AND (:P_BUSINESS_UNIT IS NULL OR i.BUSINESS_UNIT = :P_BUSINESS_UNIT)
ORDER BY i.INVOICE_DATE DESC
]'
    );
    COMMIT;
END;
/

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ap-payments
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'reerp',
                         p_pattern     => 'ap/reports/payables-ledger-recon/ap-payments');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'ap/reports/payables-ledger-recon/ap-payments',
        p_comments    => 'Drill-down: AP payments in period'
    );
    COMMIT;
END;
/
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'ap/reports/payables-ledger-recon/ap-payments',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 500,
        p_comments       => 'AP payments in the reconciliation period',
        p_source         => q'[
SELECT
    p.CHECK_ID                                              AS check_id,
    TO_CHAR(p.PAYMENT_DATE, 'YYYY-MM-DD')                  AS payment_date,
    p.THIRD_PARTY_SUPPLIER                                  AS supplier,
    p.PAYMENT_AMOUNT                                        AS payment_amount,
    p.PAYMENT_CURRENCY                                      AS currency,
    p.PAYMENT_STATUS                                        AS payment_status,
    p.BUSINESS_UNIT                                         AS business_unit,
    ri.INVOICE_NUMBER                                       AS invoice_number,
    ri.AMOUNT_PAID_INVOICE_CURRENCY                         AS amount_paid_inv_ccy,
    NVL(ri.DISCOUNT_TAKEN, 0)                               AS discount_taken
FROM RR_AP_PAYMENTS_ALL p
JOIN RR_AP_PAYMENTS_RELATED_INVOICES ri ON ri.CHECK_ID = p.CHECK_ID
WHERE p.PAYMENT_DATE >= TRUNC(TO_DATE('01-' || :P_PERIOD, 'DD-Mon-RR'), 'MM')
  AND p.PAYMENT_DATE <= LAST_DAY(TRUNC(TO_DATE('01-' || :P_PERIOD, 'DD-Mon-RR'), 'MM'))
  AND NVL(p.PAYMENT_STATUS,          'X') != 'Voided'
  AND NVL(ri.INVOICE_PAYMENT_STATUS, 'X') != 'Voided'
  AND (:P_BUSINESS_UNIT IS NULL OR p.BUSINESS_UNIT = :P_BUSINESS_UNIT)
ORDER BY p.PAYMENT_DATE DESC, p.CHECK_ID
]'
    );
    COMMIT;
END;
/

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. gl-lines  (P_CAT_TYPE: 'ap-inv' | 'ap-pay' | 'non-ap')
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'reerp',
                         p_pattern     => 'ap/reports/payables-ledger-recon/gl-lines');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'ap/reports/payables-ledger-recon/gl-lines',
        p_comments    => 'Drill-down: GL journal lines for the period'
    );
    COMMIT;
END;
/
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'ap/reports/payables-ledger-recon/gl-lines',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 500,
        p_comments       => 'GL journal lines filtered by category type and account/company',
        p_source         => q'[
SELECT
    h.JE_HEADER_ID                                          AS je_header_id,
    h.JOURNAL_NAME                                          AS journal_name,
    h.USER_JE_CATEGORY_NAME                                 AS category,
    h.LEDGER_NAME                                           AS ledger,
    l.ACCOUNT_COMBINATION                                   AS account_combination,
    NVL(l.ACCOUNTED_DR, 0)                                  AS accounted_dr,
    NVL(l.ACCOUNTED_CR, 0)                                  AS accounted_cr,
    NVL(l.ACCOUNTED_DR, 0) - NVL(l.ACCOUNTED_CR, 0)        AS net_amount,
    l.DESCRIPTION                                           AS description
FROM RR_GL_JE_LINES_ALL l
JOIN RR_GL_JE_HEADERS   h ON h.JE_HEADER_ID = l.JE_HEADER_ID
WHERE UPPER(h.PERIOD_NAME) = UPPER(:P_PERIOD)
  AND (
      -- AP invoice categories
      (:P_CAT_TYPE = 'ap-inv'
          AND UPPER(h.USER_JE_CATEGORY_NAME)
              IN ('PURCHASE INVOICES','PAYABLES INVOICES','PAYABLES','INVOICES'))
      OR
      -- AP payment categories
      (:P_CAT_TYPE = 'ap-pay'
          AND UPPER(h.USER_JE_CATEGORY_NAME)
              IN ('PAYMENTS','AP PAYMENTS','CASH PAYMENTS','SUPPLIER PAYMENTS'))
      OR
      -- Non-AP (everything else)
      (:P_CAT_TYPE = 'non-ap'
          AND UPPER(h.USER_JE_CATEGORY_NAME)
              NOT IN ('PURCHASE INVOICES','PAYABLES INVOICES','PAYABLES','INVOICES',
                      'PAYMENTS','AP PAYMENTS','CASH PAYMENTS','SUPPLIER PAYMENTS'))
      OR
      -- All if no filter given
      (:P_CAT_TYPE IS NULL)
  )
  AND (:P_ACCOUNT IS NULL OR
       REGEXP_LIKE(l.ACCOUNT_COMBINATION, '(^|[-.])'||:P_ACCOUNT||'([-.]|$)'))
  AND (:P_COMPANY IS NULL OR
       REGEXP_LIKE(l.ACCOUNT_COMBINATION, '(^|[-.])'||:P_COMPANY||'([-.]|$)'))
ORDER BY h.JE_HEADER_ID, l.JE_LINE_NUMBER
]'
    );
    COMMIT;
END;
/

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. gl-balances
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'reerp',
                         p_pattern     => 'ap/reports/payables-ledger-recon/gl-balances');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'ap/reports/payables-ledger-recon/gl-balances',
        p_comments    => 'Drill-down: GL balance breakdown by account'
    );
    COMMIT;
END;
/
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'ap/reports/payables-ledger-recon/gl-balances',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 200,
        p_comments       => 'GL balance rows for the period filtered by account/company',
        p_source         => q'[
SELECT
    b.COMPANY                                               AS company,
    b.ACCOUNT                                               AS account,
    b.ACCOUNT_DESC                                          AS account_desc,
    b.DEPARTMENT                                            AS department,
    b.PERIOD_NAME                                           AS period_name,
    b.CURRENCY                                              AS currency,
    b.OPENING_BALANCE                                       AS opening_balance,
    b.PERIOD_ACTIVITY                                       AS period_activity,
    b.CLOSING_BALANCE                                       AS closing_balance,
    b.DEBIT                                                 AS debit,
    b.CREDIT                                                AS credit,
    b.ACCOUNT_TYPE                                          AS account_type
FROM RR_GL_BALANCES b
WHERE UPPER(b.PERIOD_NAME) = UPPER(:P_PERIOD)
  AND b.ACTUAL_FLAG = 'A'
  AND (:P_ACCOUNT IS NULL OR b.ACCOUNT  = :P_ACCOUNT)
  AND (:P_COMPANY IS NULL OR b.COMPANY  = :P_COMPANY)
ORDER BY b.COMPANY, b.ACCOUNT
]'
    );
    COMMIT;
END;
/

-- ─────────────────────────────────────────────────────────────────────────────
-- Verify all 4 drill-down templates
-- ─────────────────────────────────────────────────────────────────────────────
SELECT t.uri_template, h.method
FROM   user_ords_modules   m
JOIN   user_ords_templates t ON m.id = t.module_id
JOIN   user_ords_handlers  h ON t.id = h.template_id
WHERE  m.name = 'reerp'
AND    t.uri_template LIKE 'ap/reports/payables-ledger-recon/%'
ORDER  BY t.uri_template;
