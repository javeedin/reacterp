-- ============================================================
-- TRIAL BALANCE — Clean Standalone SQL
-- ============================================================
-- Calculates: Opening | Debit | Credit | Closing
-- for any ledger + period directly from journal lines.
--
-- Parameters (set before running):
--   :ledger_name  REQUIRED  e.g.  'BUIMERC LEDGER'
--   :period_name  optional  e.g.  'Sep-23'  (Mon-YY) — NULL = all periods
--   :period_year  optional  e.g.  2024      (fiscal year) — NULL = all years
--   :company       optional  e.g.  '100'     (segment 1)   — NULL = all companies
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
-- Fiscal year and fiscal period come from RR_V_GL_FISCAL_PERIODS.
-- e.g. Jul-23 → FISCAL_YEAR=2024, FISCAL_PERIOD=1
--
-- TO_NUMBER() wraps are required because the view may return
-- FISCAL_YEAR / FISCAL_PERIOD as VARCHAR2.  Without them Oracle
-- propagates VARCHAR2 through NVL and the arithmetic in the
-- window ORDER BY (FISCAL_YEAR * 100 + FISCAL_PERIOD) throws
-- ORA-01722: invalid number.
--
-- Account type and description come from the COA value set.
-- ────────────────────────────────────────────────────────────
enriched AS (
    SELECT
        p.LEDGER_NAME,
        p.PERIOD_NAME,
        p.CURRENCY_CODE,
        p.ACCOUNT_COMBINATION,

        -- Fiscal year — explicit TO_NUMBER prevents ORA-01722 when
        -- the view column is VARCHAR2
        TO_NUMBER(NVL(fp.FISCAL_YEAR,
            EXTRACT(YEAR  FROM TO_DATE('01-' || p.PERIOD_NAME, 'DD-Mon-RR'))))  AS FISCAL_YEAR,

        -- Fiscal period sequence (1 = first month of the fiscal year)
        TO_NUMBER(NVL(fp.FISCAL_PERIOD,
            EXTRACT(MONTH FROM TO_DATE('01-' || p.PERIOD_NAME, 'DD-Mon-RR'))))  AS FISCAL_PERIOD,

        -- Segment 1 = company
        TRIM(REGEXP_SUBSTR(p.ACCOUNT_COMBINATION, '[^-]+', 1, 1))               AS COMPANY,

        -- Segment 4 = natural account code
        TRIM(REGEXP_SUBSTR(p.ACCOUNT_COMBINATION, '[^-]+', 1, 4))               AS ACCOUNT,

        -- A=Asset  L=Liability  O=Equity  R=Revenue  E=Expense
        NVL(vsv.ACCOUNT_TYPE, 'E')                                              AS ACCOUNT_TYPE,
        vsv.DESCRIPTION                                                         AS ACCOUNT_DESC,

        -- Period activity
        p.PTD_DR,
        p.PTD_CR,
        p.PTD_DR - p.PTD_CR                                                     AS PTD_NET

    FROM ptd p

    -- Fiscal calendar: PERIOD_NAME 'Mon-YY' matches directly (e.g. 'Jul-23')
    LEFT JOIN RR_V_GL_FISCAL_PERIODS fp
           ON fp.PERIOD_NAME = p.PERIOD_NAME
          --AND fp.LEDGER_NAME = p.LEDGER_NAME
          AND fp.APPLICATION = 'GL'
          AND fp.ADJ_FLAG    = 'N'

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
--   The account balance carries forward from year to year.
--   Order by (fiscal_year * 100 + fiscal_period) ensures
--   chronological order even across year boundaries.
--
-- PL_OPENING (P&L: R / E):
--   Sum prior periods within the SAME fiscal year only.
--   At the start of a new fiscal year, this resets to zero.
--   Partitioning by FISCAL_YEAR achieves the reset.
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
-- Opening:  BS_OPENING for Balance Sheet accounts
--           PL_OPENING for P&L accounts
-- Closing:  Opening + Debit - Credit
--           (positive = Dr balance, negative = Cr balance)
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
WHERE (:period_name    IS NULL OR c.PERIOD_NAME   = :period_name)
  AND (:period_year    IS NULL OR c.FISCAL_YEAR   = TO_NUMBER(:period_year))
  AND (:company        IS NULL OR c.COMPANY       = :company)
  AND (:currency_code  IS NULL OR c.CURRENCY_CODE = :currency_code)
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
