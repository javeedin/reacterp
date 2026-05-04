-- ============================================================
-- RR_V_STANDARD_TB — Oracle view wrapper for the trial balance
-- ============================================================
-- Returns Opening | Debit | Credit | Closing for every
-- (ledger, period, account_combination, currency).
--
-- No bind variables — filter on the view:
--   SELECT * FROM RR_V_STANDARD_TB
--   WHERE LEDGER_NAME    = 'BUIMERC LEDGER'
--     AND PERIOD_NAME    = 'Sep-23'       -- optional
--     AND FISCAL_YEAR    = 2024           -- optional
--     AND COMPANY        = '100'          -- optional
--     AND CURRENCY_CODE  = 'AED'          -- optional
--   ORDER BY FISCAL_YEAR, FISCAL_PERIOD, ACCOUNT;
--
-- KEY DIFFERENCES vs parameterized SQL:
--   1. Bind variables removed — filtering is the caller's job.
--   2. all_periods now SELECT DISTINCT LEDGER_NAME, PERIOD_NAME
--      (previously filtered to one ledger).
--   3. The CROSS JOIN becomes JOIN ON LEDGER_NAME so that each
--      ledger's combos are only paired with that same ledger's
--      periods — not with periods from every other ledger.
--   4. ORDER BY removed (invalid in a plain Oracle view;
--      callers can add their own ORDER BY).
-- ============================================================

CREATE OR REPLACE VIEW RR_V_STANDARD_TB AS

WITH

-- ────────────────────────────────────────────────────────────
-- Step 1 — Account master (ACCOUNT_TYPE + ACCOUNT_DESC)
-- Only accounts listed here will appear in the trial balance.
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
-- Step 2 — All distinct account combinations ever used
--          (the "account spine", per ledger)
--
-- INNER JOIN to accounts master: only valid combinations
-- (segment-4 exists in RR_VALUE_SET_VALUES) are included.
-- ────────────────────────────────────────────────────────────
all_combos AS (
    SELECT DISTINCT
        hdr.LEDGER_NAME,
        lin.ACCOUNT_COMBINATION,
        NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE)  AS CURRENCY_CODE
    FROM RR_GL_JE_LINES_ALL  lin
    JOIN RR_GL_JE_HEADERS    hdr
      ON hdr.JE_HEADER_ID = lin.JE_HEADER_ID
    JOIN accounts            acc
      ON acc.ACCOUNT = TRIM(REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION,'[^-]+',1,4))
    WHERE lin.ACCOUNT_COMBINATION IS NOT NULL
),

-- ────────────────────────────────────────────────────────────
-- Step 3 — All distinct periods per ledger
--
-- Pulled from the fiscal calendar (RR_V_GL_FISCAL_PERIODS) so
-- that periods with NO journal activity (e.g. May-26) are still
-- included in the dense grid. Each ledger is paired with every
-- calendar period via a CROSS JOIN on the distinct ledger list.
-- ────────────────────────────────────────────────────────────
all_periods AS (
    SELECT DISTINCT
        l.LEDGER_NAME,
        fp.PERIOD_NAME
    FROM (
        SELECT DISTINCT LEDGER_NAME
        FROM RR_GL_JE_HEADERS
        WHERE LEDGER_NAME IS NOT NULL
    ) l
    CROSS JOIN (
        SELECT DISTINCT PERIOD_NAME
        FROM RR_V_GL_FISCAL_PERIODS
        WHERE TO_CHAR(APPLICATION) = 'GL'
          AND TO_CHAR(ADJ_FLAG)    = 'N'
          AND PERIOD_NAME          IS NOT NULL
    ) fp
),

-- ────────────────────────────────────────────────────────────
-- Step 4 — Actual PTD activity per (ledger, combination, period)
-- ────────────────────────────────────────────────────────────
ptd_actual AS (
    SELECT
        hdr.LEDGER_NAME,
        hdr.PERIOD_NAME,
        NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE)  AS CURRENCY_CODE,
        lin.ACCOUNT_COMBINATION,
        SUM(NVL(lin.ACCOUNTED_DR, 0))                     AS PTD_DR,
        SUM(NVL(lin.ACCOUNTED_CR, 0))                     AS PTD_CR
    FROM RR_GL_JE_LINES_ALL  lin
    JOIN RR_GL_JE_HEADERS    hdr
      ON hdr.JE_HEADER_ID = lin.JE_HEADER_ID
    WHERE hdr.PERIOD_NAME         IS NOT NULL
      AND lin.ACCOUNT_COMBINATION IS NOT NULL
    GROUP BY
        hdr.LEDGER_NAME,
        hdr.PERIOD_NAME,
        NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE),
        lin.ACCOUNT_COMBINATION
),

-- ────────────────────────────────────────────────────────────
-- Step 5 — Dense PTD: every combination × every period
--          (within the same ledger)
--
-- JOIN on LEDGER_NAME (not CROSS JOIN) ensures combos from
-- ledger A are only paired with ledger A's periods, not with
-- periods from ledger B or C.
-- LEFT JOIN fills in actual PTD where activity exists; NVL
-- gives 0 for periods with no activity — so an account with
-- Jul-23 closing=100 and no Aug-23 lines still appears in
-- Aug-23 as opening=100, debit=0, credit=0, closing=100.
-- ────────────────────────────────────────────────────────────
ptd AS (
    SELECT
        ac.LEDGER_NAME,
        ap.PERIOD_NAME,
        ac.CURRENCY_CODE,
        ac.ACCOUNT_COMBINATION,
        NVL(pa.PTD_DR, 0)  AS PTD_DR,
        NVL(pa.PTD_CR, 0)  AS PTD_CR
    FROM       all_combos  ac
    JOIN       all_periods ap  ON ap.LEDGER_NAME = ac.LEDGER_NAME
    LEFT JOIN  ptd_actual  pa
           ON pa.LEDGER_NAME         = ac.LEDGER_NAME
          AND pa.ACCOUNT_COMBINATION = ac.ACCOUNT_COMBINATION
          AND pa.CURRENCY_CODE       = ac.CURRENCY_CODE
          AND pa.PERIOD_NAME         = ap.PERIOD_NAME
),

-- ────────────────────────────────────────────────────────────
-- Step 6 — Enrich with fiscal calendar and account details
-- ────────────────────────────────────────────────────────────
enriched AS (
    SELECT
        p.LEDGER_NAME,
        p.PERIOD_NAME,
        p.CURRENCY_CODE,
        p.ACCOUNT_COMBINATION,
        TRIM(REGEXP_SUBSTR(p.ACCOUNT_COMBINATION,'[^-]+',1,1))  AS COMPANY,
        acc.ACCOUNT,
        acc.ACCOUNT_TYPE,
        acc.ACCOUNT_DESC,

        -- Fiscal year: from fiscal calendar view (collapsed to 1 row per period), else fallback
        CASE
            WHEN fp.FISCAL_YEAR IS NOT NULL
            THEN TO_NUMBER(fp.FISCAL_YEAR)
            ELSE EXTRACT(YEAR  FROM TO_DATE('01-'||p.PERIOD_NAME,'DD-Mon-RR'))
        END  AS FISCAL_YEAR,

        -- Fiscal period (1 = first month of fiscal year)
        CASE
            WHEN fp.FISCAL_PERIOD IS NOT NULL
            THEN TO_NUMBER(fp.FISCAL_PERIOD)
            ELSE EXTRACT(MONTH FROM TO_DATE('01-'||p.PERIOD_NAME,'DD-Mon-RR'))
        END  AS FISCAL_PERIOD,

        p.PTD_DR,
        p.PTD_CR,
        p.PTD_DR - p.PTD_CR  AS PTD_NET

    FROM ptd p
    JOIN accounts acc
      ON acc.ACCOUNT = TRIM(REGEXP_SUBSTR(p.ACCOUNT_COMBINATION,'[^-]+',1,4))
    -- Collapse fiscal calendar to one row per PERIOD_NAME to prevent fan-out
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
-- Step 7 — Opening balance via window functions
-- ────────────────────────────────────────────────────────────
calc AS (
    SELECT
        e.*,
        -- B/S (A/L/O): cumulative net of ALL history before this period
        -- Carries forward across fiscal years — no FISCAL_YEAR in PARTITION
        NVL(SUM(e.PTD_NET) OVER (
            PARTITION BY e.LEDGER_NAME, e.ACCOUNT_COMBINATION, e.CURRENCY_CODE
            ORDER BY (e.FISCAL_YEAR * 100 + e.FISCAL_PERIOD)
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0)  AS BS_OPENING,
        -- P&L (R/E): cumulative net within the SAME fiscal year before this period
        -- Resets to zero at the start of each fiscal year
        NVL(SUM(e.PTD_NET) OVER (
            PARTITION BY e.LEDGER_NAME, e.ACCOUNT_COMBINATION, e.CURRENCY_CODE,
                         e.FISCAL_YEAR
            ORDER BY e.FISCAL_PERIOD
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0)  AS PL_OPENING
    FROM enriched e
)

-- ────────────────────────────────────────────────────────────
-- Final — Output all non-zero rows
--
-- Zero suppression: exclude rows where opening AND closing AND
-- PTD are all zero (periods before the account's first entry).
--
-- Callers filter by LEDGER_NAME, PERIOD_NAME, FISCAL_YEAR,
-- COMPANY, CURRENCY_CODE with a WHERE clause on this view.
-- ORDER BY is left to the caller.
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

    CASE WHEN c.ACCOUNT_TYPE IN ('A','L','O')
         THEN c.BS_OPENING ELSE c.PL_OPENING END        AS OPENING,

    c.PTD_DR                                            AS DEBIT,
    c.PTD_CR                                            AS CREDIT,

    CASE WHEN c.ACCOUNT_TYPE IN ('A','L','O')
         THEN c.BS_OPENING + c.PTD_NET
         ELSE c.PL_OPENING + c.PTD_NET END              AS CLOSING

FROM calc c
WHERE (
    CASE WHEN c.ACCOUNT_TYPE IN ('A','L','O') THEN c.BS_OPENING ELSE c.PL_OPENING END <> 0
    OR c.PTD_DR <> 0
    OR c.PTD_CR <> 0
)
;
