-- ============================================================
-- RR_ERP_TRIALBALANCE — Opening Balance Diagnostic Queries
--
-- PURPOSE:
--   Step-by-step SQL to test the opening balance calculation
--   in GENERATE_TB, specifically around the fiscal year bug
--   (calendar year vs fiscal year from RR_ACCOUNTING_PERIODS_STATUS).
--
-- HOW TO USE:
--   Replace the :p_* bind variables at the top of each query
--   with real values from your environment, then run each query
--   in SQL Developer or APEX SQL Workshop.
--
-- BIND VARIABLES (set once for all queries):
--   :p_ledger_name   e.g. 'BUI Merc GL'
--   :p_account_seg4  e.g. '10101' (natural account, segment 4)
--   :p_currency      e.g. 'AED'
-- ============================================================


-- ============================================================
-- QUERY 1 — Verify period table data
-- Shows what RR_ACCOUNTING_PERIODS_STATUS contains.
-- Confirm that period_year / period_number reflect your FISCAL
-- calendar (e.g., Jul-23 should show fiscal_year=2024, period=1
-- for a July fiscal year start).
-- ============================================================
SELECT
    TO_CHAR(ps.start_date, 'Mon-RR')  AS period_name,
    ps.period_year                     AS fiscal_year,
    ps.period_number                   AS fiscal_period_num,
    ps.effective_period_number,
    ps.closing_status,
    ps.ledger_id
FROM rr_accounting_periods_status ps
WHERE ps.application_id        = 101   -- GL
  AND ps.adjustment_period_flag = 'N'
ORDER BY ps.effective_period_number;


-- ============================================================
-- QUERY 2 — Calendar vs Fiscal period comparison
-- Shows how each PERIOD_NAME in the journal headers maps under
-- the current (calendar) logic vs the correct (fiscal) logic.
-- Look for periods where CURRENT_YEAR != FISCAL_YEAR — those
-- are the ones where the P&L opening balance was wrong.
-- ============================================================
SELECT DISTINCT
    hdr.PERIOD_NAME,
    -- ── current package logic (calendar year) ──────────────
    EXTRACT(YEAR  FROM TO_DATE('01-'||hdr.PERIOD_NAME,'DD-Mon-RR'))  AS current_year,
    EXTRACT(MONTH FROM TO_DATE('01-'||hdr.PERIOD_NAME,'DD-Mon-RR'))  AS current_period_num,
    -- ── correct fiscal values from accounting periods ───────
    ps.period_year                                                     AS fiscal_year,
    ps.period_number                                                   AS fiscal_period_num,
    -- ── flag mismatches ─────────────────────────────────────
    CASE
        WHEN EXTRACT(YEAR FROM TO_DATE('01-'||hdr.PERIOD_NAME,'DD-Mon-RR')) != ps.period_year
          OR EXTRACT(MONTH FROM TO_DATE('01-'||hdr.PERIOD_NAME,'DD-Mon-RR')) != ps.period_number
        THEN '*** MISMATCH ***'
        ELSE 'OK'
    END                                                                AS status
FROM RR_GL_JE_HEADERS hdr
LEFT JOIN (
    SELECT DISTINCT
        TRUNC(start_date, 'MM')  AS period_month,
        period_year,
        period_number,
        effective_period_number
    FROM rr_accounting_periods_status
    WHERE application_id        = 101
      AND adjustment_period_flag = 'N'
) ps
  ON ps.period_month = TO_DATE('01-'||hdr.PERIOD_NAME,'DD-Mon-RR')
WHERE hdr.LEDGER_NAME = :p_ledger_name
ORDER BY ps.effective_period_number;


-- ============================================================
-- QUERY 3 — Raw PTD amounts for a test account (all periods)
-- Shows aggregate journal debits/credits per period for one
-- account combination.  Use this to verify source data before
-- checking computed opening/closing balances.
-- ============================================================
SELECT
    hdr.LEDGER_NAME,
    hdr.PERIOD_NAME,
    -- current (calendar) identifiers
    EXTRACT(YEAR  FROM TO_DATE('01-'||hdr.PERIOD_NAME,'DD-Mon-RR'))  AS cal_year,
    EXTRACT(MONTH FROM TO_DATE('01-'||hdr.PERIOD_NAME,'DD-Mon-RR'))  AS cal_month,
    -- correct fiscal identifiers
    ps.period_year                                                     AS fiscal_year,
    ps.period_number                                                   AS fiscal_period_num,
    lin.ACCOUNT_COMBINATION,
    NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE)                 AS CURRENCY_CODE,
    SUM(NVL(lin.ACCOUNTED_DR,0))                                     AS PTD_DR,
    SUM(NVL(lin.ACCOUNTED_CR,0))                                     AS PTD_CR,
    SUM(NVL(lin.ACCOUNTED_DR,0)) - SUM(NVL(lin.ACCOUNTED_CR,0))     AS PTD_NET,
    -- running total using fiscal sort (preview of what BS_OPENING should be)
    SUM(SUM(NVL(lin.ACCOUNTED_DR,0)) - SUM(NVL(lin.ACCOUNTED_CR,0)))
        OVER (
            PARTITION BY lin.ACCOUNT_COMBINATION,
                         NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE)
            ORDER BY ps.effective_period_number
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )                                                              AS running_balance
FROM RR_GL_JE_LINES_ALL   lin
JOIN  RR_GL_JE_HEADERS    hdr
  ON  hdr.JE_HEADER_ID    = lin.JE_HEADER_ID
LEFT JOIN (
    SELECT DISTINCT
        TRUNC(start_date, 'MM')  AS period_month,
        period_year,
        period_number,
        effective_period_number
    FROM rr_accounting_periods_status
    WHERE application_id        = 101
      AND adjustment_period_flag = 'N'
) ps
  ON ps.period_month = TO_DATE('01-'||hdr.PERIOD_NAME,'DD-Mon-RR')
WHERE hdr.LEDGER_NAME                                            = :p_ledger_name
  AND REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION,'[^-]+',1,4)        = :p_account_seg4
  AND NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE)          = :p_currency
GROUP BY
    hdr.LEDGER_NAME,
    hdr.PERIOD_NAME,
    EXTRACT(YEAR  FROM TO_DATE('01-'||hdr.PERIOD_NAME,'DD-Mon-RR')),
    EXTRACT(MONTH FROM TO_DATE('01-'||hdr.PERIOD_NAME,'DD-Mon-RR')),
    ps.period_year, ps.period_number, ps.effective_period_number,
    lin.ACCOUNT_COMBINATION,
    NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE)
ORDER BY ps.effective_period_number;


-- ============================================================
-- QUERY 4 — Full opening balance trace: CURRENT logic (broken)
-- Reproduces exactly what the package CURRENTLY computes.
-- Shows where P&L opening INCORRECTLY resets at calendar year.
-- ============================================================
WITH raw_agg AS (
    SELECT
        hdr.LEDGER_NAME,
        hdr.PERIOD_NAME,
        NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE)   AS CURRENCY_CODE,
        lin.ACCOUNT_COMBINATION,
        SUM(NVL(lin.ACCOUNTED_DR,0))                        AS PTD_DR,
        SUM(NVL(lin.ACCOUNTED_CR,0))                        AS PTD_CR
    FROM RR_GL_JE_LINES_ALL  lin
    JOIN RR_GL_JE_HEADERS    hdr ON hdr.JE_HEADER_ID = lin.JE_HEADER_ID
    WHERE hdr.LEDGER_NAME         = :p_ledger_name
      AND REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION,'[^-]+',1,4) = :p_account_seg4
      AND NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE)   = :p_currency
    GROUP BY
        hdr.LEDGER_NAME, hdr.PERIOD_NAME,
        NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE),
        lin.ACCOUNT_COMBINATION
),
enriched_current AS (
    SELECT
        ra.*,
        -- CURRENT logic: calendar year (WRONG for fiscal calendars)
        EXTRACT(YEAR  FROM TO_DATE('01-'||ra.PERIOD_NAME,'DD-Mon-RR'))  AS PERIOD_YEAR,
        EXTRACT(MONTH FROM TO_DATE('01-'||ra.PERIOD_NAME,'DD-Mon-RR'))  AS PERIOD_NUM,
        NVL(vsv.ACCOUNT_TYPE,'E')                                        AS ACCOUNT_TYPE,
        (ra.PTD_DR - ra.PTD_CR)                                          AS PTD_NET
    FROM raw_agg ra
    LEFT JOIN RR_VALUE_SET_VALUES vsv
           ON vsv.VALUE_SET_CODE = 'BUIMERC_FIN_GLB_COA_ACCOUNT'
          AND vsv.VALUE = NULLIF(TRIM(REGEXP_SUBSTR(ra.ACCOUNT_COMBINATION,'[^-]+',1,4)),'')
),
analytics_current AS (
    SELECT
        e.*,
        NVL(SUM(e.PTD_NET) OVER (
            PARTITION BY e.LEDGER_NAME, e.ACCOUNT_COMBINATION, e.CURRENCY_CODE
            ORDER BY (e.PERIOD_YEAR * 100 + e.PERIOD_NUM)
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0)                                                              AS BS_OPENING_NET,
        -- P&L reset uses CALENDAR PERIOD_YEAR — WRONG for fiscal year
        NVL(SUM(e.PTD_NET) OVER (
            PARTITION BY e.LEDGER_NAME, e.ACCOUNT_COMBINATION,
                         e.CURRENCY_CODE, e.PERIOD_YEAR   -- <-- calendar year partition
            ORDER BY e.PERIOD_NUM
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0)                                                              AS PL_OPENING_NET
    FROM enriched_current e
)
SELECT
    a.PERIOD_NAME,
    a.PERIOD_YEAR       AS cal_year_used_for_partition,
    a.PERIOD_NUM        AS cal_month_used_for_order,
    a.ACCOUNT_TYPE,
    a.PTD_DR,
    a.PTD_CR,
    a.PTD_NET,
    a.BS_OPENING_NET,
    a.PL_OPENING_NET,
    CASE WHEN a.ACCOUNT_TYPE IN ('A','L','O')
         THEN a.BS_OPENING_NET
         ELSE a.PL_OPENING_NET
    END                                                                    AS OPENING_NET,
    CASE WHEN a.ACCOUNT_TYPE IN ('A','L','O')
         THEN a.BS_OPENING_NET + a.PTD_NET
         ELSE a.PL_OPENING_NET + a.PTD_NET
    END                                                                    AS CLOSING_NET
FROM analytics_current a
ORDER BY a.PERIOD_YEAR * 100 + a.PERIOD_NUM;


-- ============================================================
-- QUERY 5 — Full opening balance trace: FIXED logic (fiscal)
-- Uses RR_ACCOUNTING_PERIODS_STATUS for fiscal year/period.
-- P&L opening now resets correctly at the fiscal year boundary.
-- ============================================================
WITH raw_agg AS (
    SELECT
        hdr.LEDGER_NAME,
        hdr.PERIOD_NAME,
        NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE)   AS CURRENCY_CODE,
        lin.ACCOUNT_COMBINATION,
        SUM(NVL(lin.ACCOUNTED_DR,0))                        AS PTD_DR,
        SUM(NVL(lin.ACCOUNTED_CR,0))                        AS PTD_CR
    FROM RR_GL_JE_LINES_ALL  lin
    JOIN RR_GL_JE_HEADERS    hdr ON hdr.JE_HEADER_ID = lin.JE_HEADER_ID
    WHERE hdr.LEDGER_NAME         = :p_ledger_name
      AND REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION,'[^-]+',1,4) = :p_account_seg4
      AND NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE)   = :p_currency
    GROUP BY
        hdr.LEDGER_NAME, hdr.PERIOD_NAME,
        NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE),
        lin.ACCOUNT_COMBINATION
),
enriched_fixed AS (
    SELECT
        ra.*,
        -- FIXED: fiscal year/period from RR_ACCOUNTING_PERIODS_STATUS
        NVL(ps.period_year,
            EXTRACT(YEAR  FROM TO_DATE('01-'||ra.PERIOD_NAME,'DD-Mon-RR'))) AS PERIOD_YEAR,
        NVL(ps.period_number,
            EXTRACT(MONTH FROM TO_DATE('01-'||ra.PERIOD_NAME,'DD-Mon-RR'))) AS PERIOD_NUM,
        NVL(ps.effective_period_number,
            EXTRACT(YEAR  FROM TO_DATE('01-'||ra.PERIOD_NAME,'DD-Mon-RR')) * 100
          + EXTRACT(MONTH FROM TO_DATE('01-'||ra.PERIOD_NAME,'DD-Mon-RR')))  AS SORT_KEY,
        NVL(vsv.ACCOUNT_TYPE,'E')                                             AS ACCOUNT_TYPE,
        (ra.PTD_DR - ra.PTD_CR)                                               AS PTD_NET
    FROM raw_agg ra
    LEFT JOIN (
        SELECT DISTINCT
            TRUNC(start_date,'MM')   AS period_month,
            period_year,
            period_number,
            effective_period_number
        FROM rr_accounting_periods_status
        WHERE application_id        = 101
          AND adjustment_period_flag = 'N'
    ) ps
      ON ps.period_month = TO_DATE('01-'||ra.PERIOD_NAME,'DD-Mon-RR')
    LEFT JOIN RR_VALUE_SET_VALUES vsv
           ON vsv.VALUE_SET_CODE = 'BUIMERC_FIN_GLB_COA_ACCOUNT'
          AND vsv.VALUE = NULLIF(TRIM(REGEXP_SUBSTR(ra.ACCOUNT_COMBINATION,'[^-]+',1,4)),'')
),
analytics_fixed AS (
    SELECT
        e.*,
        NVL(SUM(e.PTD_NET) OVER (
            PARTITION BY e.LEDGER_NAME, e.ACCOUNT_COMBINATION, e.CURRENCY_CODE
            ORDER BY e.SORT_KEY
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0)                                                              AS BS_OPENING_NET,
        -- P&L reset uses FISCAL PERIOD_YEAR — CORRECT
        NVL(SUM(e.PTD_NET) OVER (
            PARTITION BY e.LEDGER_NAME, e.ACCOUNT_COMBINATION,
                         e.CURRENCY_CODE, e.PERIOD_YEAR   -- <-- fiscal year partition
            ORDER BY e.PERIOD_NUM
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0)                                                              AS PL_OPENING_NET
    FROM enriched_fixed e
)
SELECT
    a.PERIOD_NAME,
    a.PERIOD_YEAR       AS fiscal_year_for_partition,
    a.PERIOD_NUM        AS fiscal_period_for_order,
    a.SORT_KEY,
    a.ACCOUNT_TYPE,
    a.PTD_DR,
    a.PTD_CR,
    a.PTD_NET,
    a.BS_OPENING_NET,
    a.PL_OPENING_NET,
    CASE WHEN a.ACCOUNT_TYPE IN ('A','L','O')
         THEN a.BS_OPENING_NET
         ELSE a.PL_OPENING_NET
    END                                                                    AS OPENING_NET,
    CASE WHEN a.ACCOUNT_TYPE IN ('A','L','O')
         THEN a.BS_OPENING_NET + a.PTD_NET
         ELSE a.PL_OPENING_NET + a.PTD_NET
    END                                                                    AS CLOSING_NET
FROM analytics_fixed a
ORDER BY a.SORT_KEY;


-- ============================================================
-- QUERY 6 — Side-by-side comparison: current vs fixed vs stored
-- Compare the current broken logic, the fixed logic, and what
-- is already stored in RR_ERP_TRIALBALANCE.
-- Run QUERY 4 and QUERY 5 together via UNION or subqueries.
-- ============================================================
WITH raw_agg AS (
    SELECT
        hdr.LEDGER_NAME,
        hdr.PERIOD_NAME,
        NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE)   AS CURRENCY_CODE,
        lin.ACCOUNT_COMBINATION,
        SUM(NVL(lin.ACCOUNTED_DR,0))                        AS PTD_DR,
        SUM(NVL(lin.ACCOUNTED_CR,0))                        AS PTD_CR,
        SUM(NVL(lin.ACCOUNTED_DR,0))-SUM(NVL(lin.ACCOUNTED_CR,0)) AS PTD_NET
    FROM RR_GL_JE_LINES_ALL  lin
    JOIN RR_GL_JE_HEADERS    hdr ON hdr.JE_HEADER_ID = lin.JE_HEADER_ID
    WHERE hdr.LEDGER_NAME         = :p_ledger_name
      AND REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION,'[^-]+',1,4) = :p_account_seg4
      AND NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE)   = :p_currency
    GROUP BY
        hdr.LEDGER_NAME, hdr.PERIOD_NAME,
        NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE),
        lin.ACCOUNT_COMBINATION
),
periods AS (
    SELECT DISTINCT
        TRUNC(start_date,'MM')  AS period_month,
        period_year,
        period_number,
        NVL(effective_period_number,
            EXTRACT(YEAR FROM start_date)*100+EXTRACT(MONTH FROM start_date)) AS sort_key
    FROM rr_accounting_periods_status
    WHERE application_id = 101 AND adjustment_period_flag = 'N'
),
enriched AS (
    SELECT
        ra.*,
        -- calendar
        EXTRACT(YEAR  FROM TO_DATE('01-'||ra.PERIOD_NAME,'DD-Mon-RR')) AS cal_year,
        EXTRACT(MONTH FROM TO_DATE('01-'||ra.PERIOD_NAME,'DD-Mon-RR')) AS cal_month,
        -- fiscal
        NVL(ps.period_year,  EXTRACT(YEAR  FROM TO_DATE('01-'||ra.PERIOD_NAME,'DD-Mon-RR'))) AS fiscal_year,
        NVL(ps.period_number,EXTRACT(MONTH FROM TO_DATE('01-'||ra.PERIOD_NAME,'DD-Mon-RR'))) AS fiscal_period,
        NVL(ps.sort_key,
            EXTRACT(YEAR FROM TO_DATE('01-'||ra.PERIOD_NAME,'DD-Mon-RR'))*100
          + EXTRACT(MONTH FROM TO_DATE('01-'||ra.PERIOD_NAME,'DD-Mon-RR')))                  AS sort_key,
        NVL(vsv.ACCOUNT_TYPE,'E') AS account_type
    FROM raw_agg ra
    LEFT JOIN periods ps ON ps.period_month = TO_DATE('01-'||ra.PERIOD_NAME,'DD-Mon-RR')
    LEFT JOIN RR_VALUE_SET_VALUES vsv
           ON vsv.VALUE_SET_CODE='BUIMERC_FIN_GLB_COA_ACCOUNT'
          AND vsv.VALUE=NULLIF(TRIM(REGEXP_SUBSTR(ra.ACCOUNT_COMBINATION,'[^-]+',1,4)),'')
),
analytics AS (
    SELECT e.*,
        -- BS: chronological, all history
        NVL(SUM(e.PTD_NET) OVER (
            PARTITION BY e.LEDGER_NAME,e.ACCOUNT_COMBINATION,e.CURRENCY_CODE
            ORDER BY e.sort_key ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ),0) AS bs_opening,
        -- P&L: current (calendar partition)
        NVL(SUM(e.PTD_NET) OVER (
            PARTITION BY e.LEDGER_NAME,e.ACCOUNT_COMBINATION,e.CURRENCY_CODE,e.cal_year
            ORDER BY e.cal_month ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ),0) AS pl_opening_current,
        -- P&L: fixed (fiscal partition)
        NVL(SUM(e.PTD_NET) OVER (
            PARTITION BY e.LEDGER_NAME,e.ACCOUNT_COMBINATION,e.CURRENCY_CODE,e.fiscal_year
            ORDER BY e.fiscal_period ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ),0) AS pl_opening_fixed
    FROM enriched e
)
SELECT
    a.PERIOD_NAME,
    a.cal_year, a.cal_month,
    a.fiscal_year, a.fiscal_period,
    a.account_type,
    a.PTD_DR,
    a.PTD_CR,
    -- current opening (may be wrong)
    CASE WHEN a.account_type IN ('A','L','O') THEN a.bs_opening ELSE a.pl_opening_current END AS opening_current,
    -- fixed opening (should be correct)
    CASE WHEN a.account_type IN ('A','L','O') THEN a.bs_opening ELSE a.pl_opening_fixed  END AS opening_fixed,
    -- stored in RR_ERP_TRIALBALANCE
    (NVL(tb.OPENING_DR,0) - NVL(tb.OPENING_CR,0))                                            AS opening_stored,
    -- difference flag
    CASE
        WHEN ABS(
            CASE WHEN a.account_type IN ('A','L','O') THEN a.bs_opening ELSE a.pl_opening_fixed END
            - (NVL(tb.OPENING_DR,0) - NVL(tb.OPENING_CR,0))
        ) > 0.01 THEN '*** DIFF ***'
        ELSE 'OK'
    END                                                                                        AS diff_flag
FROM analytics a
LEFT JOIN RR_ERP_TRIALBALANCE tb
       ON tb.LEDGER_NAME         = a.LEDGER_NAME
      AND tb.PERIOD_NAME         = a.PERIOD_NAME
      AND tb.CURRENCY_CODE       = a.CURRENCY_CODE
      AND tb.ACCOUNT_COMBINATION = a.ACCOUNT_COMBINATION
ORDER BY a.sort_key;
