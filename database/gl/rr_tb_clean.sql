-- ============================================================
-- TRIAL BALANCE — Clean Standalone SQL
-- ============================================================
-- Calculates: Opening | Debit | Credit | Closing
-- for any ledger + period directly from journal lines.
--
-- Parameters (set before running):
--   :ledger_name  REQUIRED  e.g.  'BUIMERC LEDGER'
--   :period_name  optional  e.g.  'Sep-23'  (Mon-YY) — NULL = all periods
--   :period_year  optional  e.g.  '2024'    (fiscal year as text) — NULL = all years
--   :company      optional  e.g.  '100'     (segment 1)   — NULL = all companies
--   :currency_code optional  e.g.  'AED'                  — NULL = all currencies
--
-- How opening balance works:
--   Balance Sheet (Asset / Liability / Equity):
--     Opening = sum of ALL prior periods across ALL years
--               (balance carries forward year to year)
--   P&L (Revenue / Expense):
--     Opening = sum of prior periods in the SAME fiscal year only
--               (resets to zero at the start of each fiscal year)
-- ============================================================

WITH

-- ────────────────────────────────────────────────────────────
-- Step 1 — PTD (Period-to-Date) amounts per account per period
--
-- Aggregate debit and credit totals from every journal line.
-- IMPORTANT: No period filter here — we need the full history
-- so opening balances for early periods are computed correctly.
-- ────────────────────────────────────────────────────────────
ptd AS (
    SELECT
        hdr.LEDGER_NAME,
        hdr.PERIOD_NAME,
        NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE)  AS CURRENCY_CODE,
        lin.ACCOUNT_COMBINATION,
        SUM(NVL(lin.ACCOUNTED_DR, 0))                     AS PTD_DR,
        SUM(NVL(lin.ACCOUNTED_CR, 0))                     AS PTD_CR
    FROM RR_GL_JE_LINES_ALL  lin
    JOIN RR_GL_JE_HEADERS    hdr  ON hdr.JE_HEADER_ID = lin.JE_HEADER_ID
    WHERE hdr.LEDGER_NAME         = :ledger_name
      AND hdr.PERIOD_NAME         IS NOT NULL
      AND lin.ACCOUNT_COMBINATION IS NOT NULL
      -- Optional filters applied early for efficiency
      AND (:company IS NULL OR
           TRIM(REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION,'[^-]+',1,1)) = :company)
      AND (:currency_code IS NULL OR
           NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE) = :currency_code)
    GROUP BY
        hdr.LEDGER_NAME,
        hdr.PERIOD_NAME,
        NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE),
        lin.ACCOUNT_COMBINATION
),

-- ────────────────────────────────────────────────────────────
-- Step 2 — Enrich each row with fiscal calendar + account info
--
-- IMPORTANT: RR_V_GL_FISCAL_PERIODS may have multiple rows for
-- the same PERIOD_NAME (one per ledger config in the underlying
-- RR_ACCOUNTING_PERIODS_STATUS table).  Without collapsing to
-- one row per PERIOD_NAME the join fans out — each account row
-- in ptd is duplicated N times — and the window functions in
-- Step 3 then see those duplicates as separate periods, making
-- opening balance non-zero even for the very first period.
-- Fix: GROUP BY PERIOD_NAME in the subquery guarantees exactly
-- one fiscal-calendar row per period before the join.
-- ────────────────────────────────────────────────────────────
enriched AS (
    SELECT
        p.LEDGER_NAME,
        p.PERIOD_NAME,
        p.CURRENCY_CODE,
        p.ACCOUNT_COMBINATION,

        -- Fiscal year: from view (one row guaranteed), else calendar year fallback
        CASE
            WHEN fp.FISCAL_YEAR IS NOT NULL
            THEN TO_NUMBER(fp.FISCAL_YEAR)
            ELSE EXTRACT(YEAR  FROM TO_DATE('01-' || p.PERIOD_NAME, 'DD-Mon-RR'))
        END  AS FISCAL_YEAR,

        -- Fiscal period (1 = first month of fiscal year): from view, else calendar month
        CASE
            WHEN fp.FISCAL_PERIOD IS NOT NULL
            THEN TO_NUMBER(fp.FISCAL_PERIOD)
            ELSE EXTRACT(MONTH FROM TO_DATE('01-' || p.PERIOD_NAME, 'DD-Mon-RR'))
        END  AS FISCAL_PERIOD,

        -- Segment 1 = company
        TRIM(REGEXP_SUBSTR(p.ACCOUNT_COMBINATION, '[^-]+', 1, 1))   AS COMPANY,

        -- Segment 4 = natural account code
        TRIM(REGEXP_SUBSTR(p.ACCOUNT_COMBINATION, '[^-]+', 1, 4))   AS ACCOUNT,

        -- A=Asset  L=Liability  O=Equity  R=Revenue  E=Expense
        NVL(vsv.ACCOUNT_TYPE, 'E')                                  AS ACCOUNT_TYPE,
        vsv.DESCRIPTION                                             AS ACCOUNT_DESC,

        -- Period activity
        p.PTD_DR,
        p.PTD_CR,
        p.PTD_DR - p.PTD_CR                                         AS PTD_NET

    FROM ptd p

    -- Collapse view to ONE row per PERIOD_NAME before joining.
    -- MAX() picks any consistent row — all rows for the same period
    -- have the same FISCAL_YEAR / FISCAL_PERIOD values anyway.
    LEFT JOIN (
        SELECT
            PERIOD_NAME,
            MAX(TO_NUMBER(FISCAL_YEAR))   AS FISCAL_YEAR,
            MAX(TO_NUMBER(FISCAL_PERIOD)) AS FISCAL_PERIOD
        FROM RR_V_GL_FISCAL_PERIODS
        WHERE TO_CHAR(APPLICATION) = 'GL'
          AND TO_CHAR(ADJ_FLAG)    = 'N'
        GROUP BY PERIOD_NAME
    ) fp ON fp.PERIOD_NAME = p.PERIOD_NAME

    -- Account type and description from Chart of Accounts value set
    LEFT JOIN RR_VALUE_SET_VALUES vsv
           ON vsv.VALUE_SET_CODE = 'BUIMERC_FIN_GLB_COA_ACCOUNT'
          AND vsv.VALUE = TRIM(REGEXP_SUBSTR(p.ACCOUNT_COMBINATION, '[^-]+', 1, 4))
),

-- ────────────────────────────────────────────────────────────
-- Step 3 — Calculate opening balance using window functions
--
-- BS_OPENING (Balance Sheet: A / L / O):
--   Sum all prior periods across ALL fiscal years.
--   Order by (FISCAL_YEAR * 100 + FISCAL_PERIOD) — both are
--   guaranteed NUMBER from Step 2, so no ORA-01722 here.
--
-- PL_OPENING (P&L: R / E):
--   Sum prior periods within the SAME fiscal year only.
--   Resets to zero at fiscal year start.
-- ────────────────────────────────────────────────────────────
calc AS (
    SELECT
        e.*,

        -- Balance Sheet opening: all history BEFORE this period (all years)
        NVL(
            SUM(e.PTD_NET) OVER (
                PARTITION BY e.LEDGER_NAME, e.ACCOUNT_COMBINATION, e.CURRENCY_CODE
                ORDER BY (e.FISCAL_YEAR * 100 + e.FISCAL_PERIOD)
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ),
        0)  AS BS_OPENING,

        -- P&L opening: prior periods in the SAME fiscal year only
        NVL(
            SUM(e.PTD_NET) OVER (
                PARTITION BY e.LEDGER_NAME, e.ACCOUNT_COMBINATION, e.CURRENCY_CODE,
                             e.FISCAL_YEAR
                ORDER BY e.FISCAL_PERIOD
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ),
        0)  AS PL_OPENING

    FROM enriched e
)

-- ────────────────────────────────────────────────────────────
-- Final — Filter to the requested period and output results
--
-- :period_year compared as string (TO_CHAR) to avoid
-- TO_NUMBER(:period_year) which can raise ORA-01722 when
-- Oracle evaluates the expression before the IS NULL check.
-- ────────────────────────────────────────────────────────────
SELECT
    c.LEDGER_NAME,
    c.PERIOD_NAME,
    c.FISCAL_YEAR,
    c.FISCAL_PERIOD,
    c.CURRENCY_CODE,
    c.ACCOUNT_COMBINATION,
    c.COMPANY,
    c.ACCOUNT,
    c.ACCOUNT_TYPE,
    c.ACCOUNT_DESC,

    -- Opening balance (net: positive = Dr, negative = Cr)
    CASE WHEN c.ACCOUNT_TYPE IN ('A', 'L', 'O')
         THEN c.BS_OPENING
         ELSE c.PL_OPENING
    END                  AS OPENING,

    -- Period activity
    c.PTD_DR             AS DEBIT,
    c.PTD_CR             AS CREDIT,

    -- Closing = Opening + Debit - Credit
    CASE WHEN c.ACCOUNT_TYPE IN ('A', 'L', 'O')
         THEN c.BS_OPENING + c.PTD_NET
         ELSE c.PL_OPENING + c.PTD_NET
    END                  AS CLOSING

FROM calc c
WHERE (:period_name    IS NULL OR c.PERIOD_NAME          = :period_name)
  AND (:period_year    IS NULL OR TO_CHAR(c.FISCAL_YEAR) = :period_year)
  AND (:company        IS NULL OR c.COMPANY              = :company)
  AND (:currency_code  IS NULL OR c.CURRENCY_CODE        = :currency_code)
ORDER BY
    c.FISCAL_YEAR,
    c.FISCAL_PERIOD,
    CASE c.ACCOUNT_TYPE
        WHEN 'A' THEN 1   -- Asset
        WHEN 'L' THEN 2   -- Liability
        WHEN 'O' THEN 3   -- Equity
        WHEN 'R' THEN 4   -- Revenue
        WHEN 'E' THEN 5   -- Expense
        ELSE 6
    END,
    c.ACCOUNT,
    c.ACCOUNT_COMBINATION,
    c.CURRENCY_CODE
;
