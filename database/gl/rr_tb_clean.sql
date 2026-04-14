-- ============================================================
-- TRIAL BALANCE — Clean Standalone SQL
-- ============================================================
-- Calculates: Opening | Debit | Credit | Closing
-- for any ledger + period directly from journal lines.
--
-- Parameters (set before running):
--   :ledger_name   REQUIRED  e.g.  'BUIMERC LEDGER'
--   :period_name   optional  e.g.  'Sep-23'  (Mon-YY) — NULL = all periods
--   :period_year   optional  e.g.  '2024'    (fiscal year as text) — NULL = all years
--   :company       optional  e.g.  '100'     (segment 1)   — NULL = all companies
--   :currency_code optional  e.g.  'AED'                  — NULL = all currencies
--
-- Account list is driven from RR_VALUE_SET_VALUES (the account master).
-- An account only appears in a period if it has ACTUAL journal activity
-- (PTD_DR > 0 or PTD_CR > 0) in that period.  Zero-amount GL lines
-- and account combinations not in the master are excluded.
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
-- Step 1 — Account master from the Chart of Accounts value set
--
-- This is the authoritative source for:
--   ACCOUNT      = the natural account code (segment 4)
--   ACCOUNT_TYPE = A/L/O/R/E
--   ACCOUNT_DESC = description
--
-- Only accounts present here will appear in the trial balance.
-- ────────────────────────────────────────────────────────────
accounts AS (
    SELECT
        VALUE           AS ACCOUNT,
        ACCOUNT_TYPE,
        DESCRIPTION     AS ACCOUNT_DESC
    FROM RR_VALUE_SET_VALUES
    WHERE VALUE_SET_CODE = 'BUIMERC_FIN_GLB_COA_ACCOUNT'
),

-- ────────────────────────────────────────────────────────────
-- Step 2 — PTD (Period-to-Date) amounts per account per period
--
-- Aggregate ALL history from journal lines (no period filter)
-- so opening balances for any period are correctly computed.
--
-- INNER JOIN to the account master ensures:
--   • Only valid master accounts appear (no spurious GL combos)
-- HAVING clause ensures:
--   • Zero-amount GL lines are excluded — an account only
--     appears in a period when real activity exists
-- ────────────────────────────────────────────────────────────
ptd AS (
    SELECT
        hdr.LEDGER_NAME,
        hdr.PERIOD_NAME,
        NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE)           AS CURRENCY_CODE,
        lin.ACCOUNT_COMBINATION,
        TRIM(REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION,'[^-]+',1,1))   AS COMPANY,
        TRIM(REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION,'[^-]+',1,4))   AS ACCOUNT,
        SUM(NVL(lin.ACCOUNTED_DR, 0))                              AS PTD_DR,
        SUM(NVL(lin.ACCOUNTED_CR, 0))                              AS PTD_CR
    FROM RR_GL_JE_LINES_ALL  lin
    JOIN RR_GL_JE_HEADERS    hdr  ON hdr.JE_HEADER_ID = lin.JE_HEADER_ID
    -- INNER JOIN: only account combos whose segment-4 exists in the master
    JOIN accounts            acc
      ON acc.ACCOUNT = TRIM(REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION,'[^-]+',1,4))
    WHERE hdr.LEDGER_NAME         = :ledger_name
      AND hdr.PERIOD_NAME         IS NOT NULL
      AND lin.ACCOUNT_COMBINATION IS NOT NULL
      AND (:company IS NULL OR
           TRIM(REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION,'[^-]+',1,1)) = :company)
      AND (:currency_code IS NULL OR
           NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE) = :currency_code)
    GROUP BY
        hdr.LEDGER_NAME,
        hdr.PERIOD_NAME,
        NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE),
        lin.ACCOUNT_COMBINATION,
        TRIM(REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION,'[^-]+',1,1)),
        TRIM(REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION,'[^-]+',1,4))
    -- Exclude zero-amount rows: an account only appears in a period
    -- when it has actual debit or credit activity
    HAVING SUM(NVL(lin.ACCOUNTED_DR, 0)) > 0
        OR SUM(NVL(lin.ACCOUNTED_CR, 0)) > 0
),

-- ────────────────────────────────────────────────────────────
-- Step 3 — Enrich with fiscal calendar and account details
--
-- Fiscal year/period come from RR_V_GL_FISCAL_PERIODS.
-- Account type and description come from the accounts CTE
-- (already joined in Step 2 via the INNER JOIN to accounts).
--
-- The view is collapsed to ONE row per PERIOD_NAME with GROUP BY
-- to prevent fan-out when multiple ledger configs exist in the
-- underlying RR_ACCOUNTING_PERIODS_STATUS table.
-- ────────────────────────────────────────────────────────────
enriched AS (
    SELECT
        p.LEDGER_NAME,
        p.PERIOD_NAME,
        p.CURRENCY_CODE,
        p.ACCOUNT_COMBINATION,
        p.COMPANY,
        p.ACCOUNT,
        acc.ACCOUNT_TYPE,
        acc.ACCOUNT_DESC,

        -- Fiscal year: from view, else calendar year fallback
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

        p.PTD_DR,
        p.PTD_CR,
        p.PTD_DR - p.PTD_CR   AS PTD_NET

    FROM ptd p

    -- Account master: type and description (already validated by INNER JOIN in ptd)
    JOIN accounts acc ON acc.ACCOUNT = p.ACCOUNT

    -- Fiscal calendar collapsed to one row per PERIOD_NAME
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
),

-- ────────────────────────────────────────────────────────────
-- Step 4 — Calculate opening balance using window functions
--
-- BS_OPENING (Balance Sheet: A / L / O):
--   Cumulative net of ALL history before this period.
--   Carries across fiscal year boundaries.
--
-- PL_OPENING (P&L: R / E):
--   Cumulative net of prior periods in the SAME fiscal year.
--   Resets to zero at the start of each fiscal year.
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
-- Final — Filter to requested period and output results
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
