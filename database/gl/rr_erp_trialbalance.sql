-- ============================================================
-- RR_ERP_TRIALBALANCE — Derived Trial Balance
-- Source: RR_GL_JE_LINES_ALL (journal lines)
--
-- Oracle Fusion-style Trial Balance logic:
--   Opening(P)  = Closing(P-1)            [chains across periods]
--   PTD_DR/CR   = Journal activity in period P
--   Closing(P)  = Opening(P) + PTD_DR - PTD_CR
--   YTD_DR/CR   = Cumulative DR/CR from fiscal-year start to P
--
-- Balance Sheet accounts (A=Asset, L=Liability, O=Equity):
--   Opening balance CARRIES FORWARD across fiscal years
-- P&L accounts (R=Revenue, E=Expense):
--   Opening balance RESETS to 0 at start of each fiscal year
--
-- Segment separator in ACCOUNT_COMBINATION: '-' (matches
-- CONCATENATED_SEGMENTS virtual column in REERP_GL_CODE_COMBINATIONS)
-- ============================================================

-- ============================================================
-- 1. TABLE: RR_ERP_TRIALBALANCE
-- ============================================================
CREATE TABLE RR_ERP_TRIALBALANCE (
    -- Primary Key
    TB_ID               NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Period identifiers
    LEDGER_NAME         VARCHAR2(240)   NOT NULL,
    PERIOD_NAME         VARCHAR2(30)    NOT NULL,
    PERIOD_YEAR         NUMBER(4)       NOT NULL,
    PERIOD_NUM          NUMBER(2)       NOT NULL,   -- fiscal period (1=first month of fiscal year)

    -- Currency
    CURRENCY_CODE       VARCHAR2(15),

    -- Full account string (as stored in journal lines)
    ACCOUNT_COMBINATION VARCHAR2(250),

    -- Parsed account segments
    COMPANY             VARCHAR2(30),   -- Segment 1
    LOB                 VARCHAR2(30),   -- Segment 2 (Line of Business)
    DEPARTMENT          VARCHAR2(30),   -- Segment 3
    ACCOUNT             VARCHAR2(30),   -- Segment 4  (natural account)
    ACCOUNT_DESC        VARCHAR2(240),  -- Account description (from COA)
    SUB_ACCOUNT         VARCHAR2(30),   -- Segment 5
    ANALYSIS            VARCHAR2(30),   -- Segment 6
    INTERCOMPANY        VARCHAR2(30),   -- Segment 7
    FUTURE1             VARCHAR2(30),   -- Segment 8
    FUTURE2             VARCHAR2(30),   -- Segment 9

    -- Account classification
    -- A=Asset  L=Liability  O=Owner's Equity  R=Revenue  E=Expense
    ACCOUNT_TYPE        VARCHAR2(1),

    -- ── Trial Balance amounts (accounted / ledger currency) ──────────
    -- Opening balance (Dr / Cr split)
    OPENING_DR          NUMBER  DEFAULT 0,
    OPENING_CR          NUMBER  DEFAULT 0,

    -- Period-to-Date activity
    PTD_DR              NUMBER  DEFAULT 0,
    PTD_CR              NUMBER  DEFAULT 0,

    -- Year-to-Date cumulative (from first period of fiscal year)
    YTD_DR              NUMBER  DEFAULT 0,
    YTD_CR              NUMBER  DEFAULT 0,

    -- Closing balance (Dr / Cr split)
    CLOSING_DR          NUMBER  DEFAULT 0,
    CLOSING_CR          NUMBER  DEFAULT 0,

    -- Audit
    RUN_DATE            TIMESTAMP DEFAULT SYSTIMESTAMP,
    CREATED_BY          VARCHAR2(100) DEFAULT USER,
    CREATION_DATE       TIMESTAMP DEFAULT SYSTIMESTAMP,
    LAST_UPDATED_BY     VARCHAR2(100),
    LAST_UPDATE_DATE    TIMESTAMP,

    -- Natural key: one row per account per period per currency per ledger
    CONSTRAINT RR_ERP_TB_UK UNIQUE (
        LEDGER_NAME, PERIOD_NAME, PERIOD_YEAR, PERIOD_NUM,
        ACCOUNT_COMBINATION, CURRENCY_CODE
    )
);

-- Indexes
CREATE INDEX RR_ERP_TB_PERIOD_IDX  ON RR_ERP_TRIALBALANCE (LEDGER_NAME, PERIOD_YEAR, PERIOD_NUM);
CREATE INDEX RR_ERP_TB_ACCOUNT_IDX ON RR_ERP_TRIALBALANCE (ACCOUNT, ACCOUNT_TYPE);
CREATE INDEX RR_ERP_TB_COMPANY_IDX ON RR_ERP_TRIALBALANCE (COMPANY, DEPARTMENT);
CREATE INDEX RR_ERP_TB_RUNDATE_IDX ON RR_ERP_TRIALBALANCE (RUN_DATE);

COMMENT ON TABLE  RR_ERP_TRIALBALANCE                  IS 'Derived Trial Balance produced from RR_GL_JE_LINES_ALL journal lines';
COMMENT ON COLUMN RR_ERP_TRIALBALANCE.OPENING_DR        IS 'Opening debit balance (prior period closing)';
COMMENT ON COLUMN RR_ERP_TRIALBALANCE.OPENING_CR        IS 'Opening credit balance (prior period closing)';
COMMENT ON COLUMN RR_ERP_TRIALBALANCE.PTD_DR            IS 'Period-to-Date debit activity';
COMMENT ON COLUMN RR_ERP_TRIALBALANCE.PTD_CR            IS 'Period-to-Date credit activity';
COMMENT ON COLUMN RR_ERP_TRIALBALANCE.YTD_DR            IS 'Year-to-Date cumulative debits';
COMMENT ON COLUMN RR_ERP_TRIALBALANCE.YTD_CR            IS 'Year-to-Date cumulative credits';
COMMENT ON COLUMN RR_ERP_TRIALBALANCE.CLOSING_DR        IS 'Closing debit balance (opening + PTD net)';
COMMENT ON COLUMN RR_ERP_TRIALBALANCE.CLOSING_CR        IS 'Closing credit balance (opening + PTD net)';
COMMENT ON COLUMN RR_ERP_TRIALBALANCE.ACCOUNT_TYPE      IS 'A=Asset L=Liability O=Equity R=Revenue E=Expense';


-- ============================================================
-- 2. PACKAGE SPECIFICATION: RR_ERP_TB_PKG
-- ============================================================
CREATE OR REPLACE PACKAGE RR_ERP_TB_PKG AS

    -- ─────────────────────────────────────────────────────────
    -- GENERATE_TB
    --   Computes trial balance from journal lines and populates
    --   RR_ERP_TRIALBALANCE.  Always recalculates from source
    --   data so results are consistent regardless of prior runs.
    --
    --   Parameters:
    --     p_ledger_name  - Filter by ledger  (NULL = all ledgers)
    --     p_period_year  - Filter by year    (NULL = all years)
    --     p_period_name  - Filter by period  (NULL = all periods)
    --                      If supplied together with p_period_year
    --                      both conditions apply.
    --     p_inserted     - OUT: rows inserted into TB table
    --     p_updated      - OUT: rows replaced  (delete+insert)
    --     p_errors       - OUT: number of errors encountered
    --     p_error_msg    - OUT: first/concatenated error messages
    -- ─────────────────────────────────────────────────────────
    PROCEDURE GENERATE_TB (
        p_ledger_name   IN  VARCHAR2 DEFAULT NULL,
        p_period_year   IN  NUMBER   DEFAULT NULL,
        p_period_name   IN  VARCHAR2 DEFAULT NULL,
        p_company       IN  VARCHAR2 DEFAULT NULL,
        p_inserted      OUT NUMBER,
        p_updated       OUT NUMBER,
        p_errors        OUT NUMBER,
        p_error_msg     OUT VARCHAR2
    );

    -- ─────────────────────────────────────────────────────────
    -- GENERATE_FULL_YEAR
    --   Convenience wrapper — generates/refreshes all periods
    --   for the given fiscal year and ledger.
    -- ─────────────────────────────────────────────────────────
    PROCEDURE GENERATE_FULL_YEAR (
        p_ledger_name   IN  VARCHAR2,
        p_period_year   IN  NUMBER,
        p_company       IN  VARCHAR2 DEFAULT NULL,
        p_inserted      OUT NUMBER,
        p_updated       OUT NUMBER,
        p_errors        OUT NUMBER,
        p_error_msg     OUT VARCHAR2
    );

    -- ─────────────────────────────────────────────────────────
    -- PURGE_TB
    --   Removes TB rows matching the supplied filters.
    --   Pass NULL to a parameter to skip that filter.
    -- ─────────────────────────────────────────────────────────
    PROCEDURE PURGE_TB (
        p_ledger_name   IN  VARCHAR2 DEFAULT NULL,
        p_period_year   IN  NUMBER   DEFAULT NULL,
        p_period_name   IN  VARCHAR2 DEFAULT NULL,
        p_company       IN  VARCHAR2 DEFAULT NULL,
        p_deleted       OUT NUMBER
    );

END RR_ERP_TB_PKG;
/


-- ============================================================
-- 3. PACKAGE BODY: RR_ERP_TB_PKG
-- ============================================================
CREATE OR REPLACE PACKAGE BODY RR_ERP_TB_PKG AS

    -- ──────────────────────────────────────────────────────────────────
    -- Internal helper: parse the Nth segment from ACCOUNT_COMBINATION.
    -- Segments are separated by '-' (matching CONCATENATED_SEGMENTS
    -- virtual column in REERP_GL_CODE_COMBINATIONS).
    -- Returns NULL when the segment position does not exist.
    -- ──────────────────────────────────────────────────────────────────
    FUNCTION PARSE_SEGMENT (
        p_account_combination IN VARCHAR2,
        p_position            IN NUMBER
    ) RETURN VARCHAR2 IS
    BEGIN
        RETURN NULLIF(
            TRIM(REGEXP_SUBSTR(p_account_combination, '[^-]+', 1, p_position)),
            ''
        );
    END PARSE_SEGMENT;


    -- ──────────────────────────────────────────────────────────────────
    -- Internal helper: derive CALENDAR year from period name.
    -- Supports 'Mon-YY' format (e.g. 'Mar-25' → 2025).
    -- Uses RR format model so two-digit years 00-49 → 2000-2049.
    -- NOTE: GENERATE_TB uses RR_ACCOUNTING_PERIODS_STATUS for the
    -- correct FISCAL year — these helpers are calendar-only fallbacks.
    -- ──────────────────────────────────────────────────────────────────
    FUNCTION PERIOD_YEAR (p_period_name IN VARCHAR2) RETURN NUMBER IS
    BEGIN
        RETURN EXTRACT(YEAR FROM TO_DATE('01-' || p_period_name, 'DD-Mon-RR'));
    EXCEPTION
        WHEN OTHERS THEN RETURN NULL;
    END PERIOD_YEAR;


    -- ──────────────────────────────────────────────────────────────────
    -- Internal helper: derive calendar month number (1-12) from period name.
    -- NOTE: GENERATE_TB uses RR_ACCOUNTING_PERIODS_STATUS for the
    -- correct FISCAL period number — this helper is a fallback only.
    -- ──────────────────────────────────────────────────────────────────
    FUNCTION PERIOD_NUM (p_period_name IN VARCHAR2) RETURN NUMBER IS
    BEGIN
        RETURN EXTRACT(MONTH FROM TO_DATE('01-' || p_period_name, 'DD-Mon-RR'));
    EXCEPTION
        WHEN OTHERS THEN RETURN NULL;
    END PERIOD_NUM;


    -- ══════════════════════════════════════════════════════════════════
    -- GENERATE_TB — main engine
    -- ══════════════════════════════════════════════════════════════════
    PROCEDURE GENERATE_TB (
        p_ledger_name   IN  VARCHAR2 DEFAULT NULL,
        p_period_year   IN  NUMBER   DEFAULT NULL,
        p_period_name   IN  VARCHAR2 DEFAULT NULL,
        p_company       IN  VARCHAR2 DEFAULT NULL,
        p_inserted      OUT NUMBER,
        p_updated       OUT NUMBER,
        p_errors        OUT NUMBER,
        p_error_msg     OUT VARCHAR2
    ) IS

        v_deleted   NUMBER := 0;
        v_now       TIMESTAMP := SYSTIMESTAMP;

    BEGIN
        p_inserted  := 0;
        p_updated   := 0;
        p_errors    := 0;
        p_error_msg := NULL;

        -- ── Step 1: Remove existing TB rows for the requested scope ──
        -- We always recalculate from source to keep TB consistent.
        DELETE FROM RR_ERP_TRIALBALANCE
        WHERE (p_ledger_name IS NULL OR LEDGER_NAME = p_ledger_name)
          AND (p_period_year IS NULL OR PERIOD_YEAR  = p_period_year)
          AND (p_period_name IS NULL OR PERIOD_NAME  = p_period_name)
          AND (p_company     IS NULL OR COMPANY      = p_company);

        p_updated := SQL%ROWCOUNT;   -- rows that "existed" and are now replaced

        -- ── Step 2: Compute and insert trial balance ──────────────────
        --
        -- CTE structure:
        --   raw_agg       → aggregate PTD DR/CR per (ledger, period, account, currency)
        --   enriched      → add year/num derived from period name + COA segments
        --   with_analytics→ add cumulative window-function columns
        --   final_tb      → split net amounts into DR/CR columns
        --
        -- NOTE: The analytics CTEs intentionally include ALL historical
        -- journal data (not just the requested period/year) so that
        -- opening balances are computed correctly from the very first
        -- period in the database.  Filtering is applied last so only
        -- the requested rows are inserted.
        -- ─────────────────────────────────────────────────────────────
        INSERT INTO RR_ERP_TRIALBALANCE (
            LEDGER_NAME,
            PERIOD_NAME,   PERIOD_YEAR,   PERIOD_NUM,
            CURRENCY_CODE,
            ACCOUNT_COMBINATION,
            COMPANY,       LOB,           DEPARTMENT,
            ACCOUNT,       ACCOUNT_DESC,
            SUB_ACCOUNT,   ANALYSIS,      INTERCOMPANY,
            FUTURE1,       FUTURE2,
            ACCOUNT_TYPE,
            OPENING_DR,    OPENING_CR,
            PTD_DR,        PTD_CR,
            YTD_DR,        YTD_CR,
            CLOSING_DR,    CLOSING_CR,
            RUN_DATE,      CREATED_BY,    CREATION_DATE
        )
        WITH
        -- ── 1. Aggregate journal lines by period / account / currency ──
        raw_agg AS (
            SELECT
                hdr.LEDGER_NAME,
                hdr.PERIOD_NAME,
                -- Prefer entered currency; fall back to ledger currency
                NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE)  AS CURRENCY_CODE,
                lin.ACCOUNT_COMBINATION,
                SUM(NVL(lin.ACCOUNTED_DR, 0))                     AS PTD_DR,
                SUM(NVL(lin.ACCOUNTED_CR, 0))                     AS PTD_CR
            FROM RR_GL_JE_LINES_ALL  lin
            JOIN RR_GL_JE_HEADERS    hdr
              ON hdr.JE_HEADER_ID = lin.JE_HEADER_ID
            WHERE hdr.PERIOD_NAME         IS NOT NULL
              AND lin.ACCOUNT_COMBINATION IS NOT NULL
              -- Ledger and company filters applied here for efficiency;
              -- period filter is NOT applied here so opening balances are correct.
              AND (p_ledger_name IS NULL OR hdr.LEDGER_NAME = p_ledger_name)
              AND (p_company IS NULL OR
                   NULLIF(TRIM(REGEXP_SUBSTR(lin.ACCOUNT_COMBINATION,'[^-]+',1,1)),'') = p_company)
            GROUP BY
                hdr.LEDGER_NAME,
                hdr.PERIOD_NAME,
                NVL(lin.CURRENCY_CODE, hdr.LEDGER_CURRENCY_CODE),
                lin.ACCOUNT_COMBINATION
        ),

        -- ── 2. Enrich with period year/num and COA segments ───────────
        enriched AS (
            SELECT
                ra.LEDGER_NAME,
                ra.PERIOD_NAME,
                ra.CURRENCY_CODE,
                ra.ACCOUNT_COMBINATION,

                -- Derive fiscal period identifiers from RR_ACCOUNTING_PERIODS_STATUS.
                -- Oracle Fusion supplies the correct fiscal PERIOD_YEAR and PERIOD_NUM
                -- (e.g., Jul-23 → fiscal year 2024, period 1 for a July fiscal start).
                -- Calendar year/month are used only as a fallback when no match exists.
                NVL(ps.PERIOD_YEAR,
                    EXTRACT(YEAR  FROM TO_DATE('01-' || ra.PERIOD_NAME, 'DD-Mon-RR')))  AS PERIOD_YEAR,
                NVL(ps.PERIOD_NUMBER,
                    EXTRACT(MONTH FROM TO_DATE('01-' || ra.PERIOD_NAME, 'DD-Mon-RR')))  AS PERIOD_NUM,

                -- Account segments: REERP_GL_CODE_COMBINATIONS uses the v2 schema
                -- with quoted mixed-case column names ("buimercFinGlb..." prefix).
                -- Fall back to REGEXP_SUBSTR when no COA match is found.
                NVL(cc."buimercFinGlbCoaCo",
                    NULLIF(TRIM(REGEXP_SUBSTR(ra.ACCOUNT_COMBINATION,'[^-]+',1,1)),
                           ''))                                    AS COMPANY,
                NVL(cc."buimercFinGlbCoaLob",
                    NULLIF(TRIM(REGEXP_SUBSTR(ra.ACCOUNT_COMBINATION,'[^-]+',1,2)),
                           ''))                                    AS LOB,
                NVL(cc."buimercFinGlbCoaDepartment",
                    NULLIF(TRIM(REGEXP_SUBSTR(ra.ACCOUNT_COMBINATION,'[^-]+',1,3)),
                           ''))                                    AS DEPARTMENT,
                NVL(cc."buimercFinGlbCoaAccount",
                    NULLIF(TRIM(REGEXP_SUBSTR(ra.ACCOUNT_COMBINATION,'[^-]+',1,4)),
                           ''))                                    AS ACCOUNT,
                -- Description from value set (more reliable than COA combinations)
                vsv.DESCRIPTION                                    AS ACCOUNT_DESC,
                NVL(cc."buimercFinGlbCoaSubAcc",
                    NULLIF(TRIM(REGEXP_SUBSTR(ra.ACCOUNT_COMBINATION,'[^-]+',1,5)),
                           ''))                                    AS SUB_ACCOUNT,
                NVL(cc."buimercFinGlbCoaAlys",
                    NULLIF(TRIM(REGEXP_SUBSTR(ra.ACCOUNT_COMBINATION,'[^-]+',1,6)),
                           ''))                                    AS ANALYSIS,
                NVL(cc."buimercFinGlbCoaIc",
                    NULLIF(TRIM(REGEXP_SUBSTR(ra.ACCOUNT_COMBINATION,'[^-]+',1,7)),
                           ''))                                    AS INTERCOMPANY,
                NVL(cc."buimercFinGlbCoaFut1",
                    NULLIF(TRIM(REGEXP_SUBSTR(ra.ACCOUNT_COMBINATION,'[^-]+',1,8)),
                           ''))                                    AS FUTURE1,
                NVL(cc."buimercFinGlbCoaFut2",
                    NULLIF(TRIM(REGEXP_SUBSTR(ra.ACCOUNT_COMBINATION,'[^-]+',1,9)),
                           ''))                                    AS FUTURE2,

                -- Account type sourced from RR_VALUE_SET_VALUES
                -- (VALUE_SET_CODE = 'BUIMERC_FIN_GLB_COA_ACCOUNT', VALUE = segment 4)
                -- A=Asset  L=Liability  O=Owner's Equity  R=Revenue  E=Expense
                -- Defaults to 'E' when no match found.
                NVL(vsv.ACCOUNT_TYPE, 'E')                        AS ACCOUNT_TYPE,

                ra.PTD_DR,
                ra.PTD_CR,
                (ra.PTD_DR - ra.PTD_CR)                           AS PTD_NET

            FROM raw_agg ra
            LEFT JOIN REERP_GL_CODE_COMBINATIONS cc
                   ON (   cc."buimercFinGlbCoaCo"
                       || '-' || cc."buimercFinGlbCoaLob"
                       || '-' || cc."buimercFinGlbCoaDepartment"
                       || '-' || cc."buimercFinGlbCoaAccount"
                       || '-' || cc."buimercFinGlbCoaSubAcc"
                       || '-' || cc."buimercFinGlbCoaAlys"
                       || '-' || cc."buimercFinGlbCoaIc"
                       || '-' || cc."buimercFinGlbCoaFut1"
                       || '-' || cc."buimercFinGlbCoaFut2"
                       ) = ra.ACCOUNT_COMBINATION
            LEFT JOIN RR_VALUE_SET_VALUES vsv
                   ON vsv.VALUE_SET_CODE = 'BUIMERC_FIN_GLB_COA_ACCOUNT'
                  AND vsv.VALUE = NULLIF(
                          TRIM(REGEXP_SUBSTR(ra.ACCOUNT_COMBINATION,'[^-]+',1,4)), '')
            -- Fiscal calendar: Oracle Fusion supplies the true fiscal year and period
            -- number through the accounting periods sync.  application_id=101 = GL.
            -- The subquery collapses duplicate ledger rows so the join is always 1:1.
            LEFT JOIN (
                SELECT DISTINCT
                    TRUNC(start_date, 'MM')  AS period_month,
                    period_year,
                    period_number
                FROM rr_accounting_periods_status
                WHERE application_id        = 101
                  AND adjustment_period_flag = 'N'
            ) ps
               ON ps.period_month = TO_DATE('01-' || ra.PERIOD_NAME, 'DD-Mon-RR')
        ),

        -- ── 3. Compute cumulative analytics ──────────────────────────
        --
        -- PERIOD_YEAR / PERIOD_NUM in enriched are now FISCAL values from
        -- RR_ACCOUNTING_PERIODS_STATUS (e.g., Jul-23 → year=2024, period=1
        -- for a July fiscal year start).  The window functions below rely
        -- on this so that P&L resets happen at the fiscal year boundary,
        -- not the calendar year boundary.
        --
        -- YTD  : rolling sum within the fiscal year, current period inclusive
        -- Opening (B/S): cumulative net of ALL history up to (but NOT including)
        --                current period — carries across fiscal year boundaries
        -- Opening (P&L): cumulative net within the SAME fiscal year up to (but
        --                NOT including) current period — resets at fiscal year start
        -- ─────────────────────────────────────────────────────────────
        with_analytics AS (
            SELECT
                e.*,

                -- YTD Debits: year-start through current period (inclusive)
                SUM(e.PTD_DR) OVER (
                    PARTITION BY e.LEDGER_NAME, e.ACCOUNT_COMBINATION,
                                 e.CURRENCY_CODE, e.PERIOD_YEAR
                    ORDER BY e.PERIOD_NUM
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                )                                                  AS YTD_DR,

                -- YTD Credits: year-start through current period (inclusive)
                SUM(e.PTD_CR) OVER (
                    PARTITION BY e.LEDGER_NAME, e.ACCOUNT_COMBINATION,
                                 e.CURRENCY_CODE, e.PERIOD_YEAR
                    ORDER BY e.PERIOD_NUM
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                )                                                  AS YTD_CR,

                -- Balance Sheet opening: all history BEFORE this period
                --   (ROWS 1 PRECEDING keeps NULL for the very first period,
                --    NVL turns that into 0)
                NVL(
                    SUM(e.PTD_NET) OVER (
                        PARTITION BY e.LEDGER_NAME, e.ACCOUNT_COMBINATION,
                                     e.CURRENCY_CODE
                        ORDER BY (e.PERIOD_YEAR * 100 + e.PERIOD_NUM)
                        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                    ), 0
                )                                                  AS BS_OPENING_NET,

                -- P&L opening: prior periods IN THE SAME FISCAL YEAR only
                NVL(
                    SUM(e.PTD_NET) OVER (
                        PARTITION BY e.LEDGER_NAME, e.ACCOUNT_COMBINATION,
                                     e.CURRENCY_CODE, e.PERIOD_YEAR
                        ORDER BY e.PERIOD_NUM
                        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                    ), 0
                )                                                  AS PL_OPENING_NET

            FROM enriched e
        ),

        -- ── 4. Choose correct opening and compute closing ─────────────
        final_tb AS (
            SELECT
                wa.LEDGER_NAME,
                wa.PERIOD_NAME,   wa.PERIOD_YEAR,   wa.PERIOD_NUM,
                wa.CURRENCY_CODE,
                wa.ACCOUNT_COMBINATION,
                wa.COMPANY,       wa.LOB,           wa.DEPARTMENT,
                wa.ACCOUNT,       wa.ACCOUNT_DESC,
                wa.SUB_ACCOUNT,   wa.ANALYSIS,      wa.INTERCOMPANY,
                wa.FUTURE1,       wa.FUTURE2,
                wa.ACCOUNT_TYPE,
                wa.PTD_DR,        wa.PTD_CR,
                wa.YTD_DR,        wa.YTD_CR,

                -- Opening: Balance Sheet accounts carry forward across years;
                --          P&L accounts reset at start of each fiscal year.
                CASE WHEN wa.ACCOUNT_TYPE IN ('A', 'L', 'O')
                     THEN wa.BS_OPENING_NET
                     ELSE wa.PL_OPENING_NET
                END                                                AS OPENING_NET,

                -- Closing = Opening + PTD_NET
                CASE WHEN wa.ACCOUNT_TYPE IN ('A', 'L', 'O')
                     THEN wa.BS_OPENING_NET + wa.PTD_NET
                     ELSE wa.PL_OPENING_NET + wa.PTD_NET
                END                                                AS CLOSING_NET

            FROM with_analytics wa
        )

        -- ── 5. Project into Dr/Cr columns and apply output filter ─────
        SELECT
            ft.LEDGER_NAME,
            ft.PERIOD_NAME,   ft.PERIOD_YEAR,   ft.PERIOD_NUM,
            ft.CURRENCY_CODE,
            ft.ACCOUNT_COMBINATION,
            ft.COMPANY,       ft.LOB,           ft.DEPARTMENT,
            ft.ACCOUNT,       ft.ACCOUNT_DESC,
            ft.SUB_ACCOUNT,   ft.ANALYSIS,      ft.INTERCOMPANY,
            ft.FUTURE1,       ft.FUTURE2,
            ft.ACCOUNT_TYPE,

            -- Opening split: positive net → Debit side; negative → Credit side
            GREATEST(0,  ft.OPENING_NET)   AS OPENING_DR,
            GREATEST(0, -ft.OPENING_NET)   AS OPENING_CR,

            ft.PTD_DR,
            ft.PTD_CR,
            ft.YTD_DR,
            ft.YTD_CR,

            -- Closing split
            GREATEST(0,  ft.CLOSING_NET)   AS CLOSING_DR,
            GREATEST(0, -ft.CLOSING_NET)   AS CLOSING_CR,

            v_now               AS RUN_DATE,
            USER                AS CREATED_BY,
            v_now               AS CREATION_DATE

        FROM final_tb ft
        WHERE (p_period_year IS NULL OR ft.PERIOD_YEAR = p_period_year)
          AND (p_period_name IS NULL OR ft.PERIOD_NAME = p_period_name)
          AND (p_company     IS NULL OR ft.COMPANY     = p_company);

        p_inserted := SQL%ROWCOUNT;
        COMMIT;

    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            p_errors    := 1;
            p_error_msg := SQLERRM;
    END GENERATE_TB;


    -- ══════════════════════════════════════════════════════════════════
    -- GENERATE_FULL_YEAR — convenience wrapper
    -- ══════════════════════════════════════════════════════════════════
    PROCEDURE GENERATE_FULL_YEAR (
        p_ledger_name   IN  VARCHAR2,
        p_period_year   IN  NUMBER,
        p_company       IN  VARCHAR2 DEFAULT NULL,
        p_inserted      OUT NUMBER,
        p_updated       OUT NUMBER,
        p_errors        OUT NUMBER,
        p_error_msg     OUT VARCHAR2
    ) IS
    BEGIN
        GENERATE_TB(
            p_ledger_name => p_ledger_name,
            p_period_year => p_period_year,
            p_period_name => NULL,
            p_company     => p_company,
            p_inserted    => p_inserted,
            p_updated     => p_updated,
            p_errors      => p_errors,
            p_error_msg   => p_error_msg
        );
    END GENERATE_FULL_YEAR;


    -- ══════════════════════════════════════════════════════════════════
    -- PURGE_TB — remove TB rows
    -- ══════════════════════════════════════════════════════════════════
    PROCEDURE PURGE_TB (
        p_ledger_name   IN  VARCHAR2 DEFAULT NULL,
        p_period_year   IN  NUMBER   DEFAULT NULL,
        p_period_name   IN  VARCHAR2 DEFAULT NULL,
        p_company       IN  VARCHAR2 DEFAULT NULL,
        p_deleted       OUT NUMBER
    ) IS
    BEGIN
        DELETE FROM RR_ERP_TRIALBALANCE
        WHERE (p_ledger_name IS NULL OR LEDGER_NAME = p_ledger_name)
          AND (p_period_year IS NULL OR PERIOD_YEAR  = p_period_year)
          AND (p_period_name IS NULL OR PERIOD_NAME  = p_period_name)
          AND (p_company     IS NULL OR COMPANY      = p_company);

        p_deleted := SQL%ROWCOUNT;
        COMMIT;
    END PURGE_TB;

END RR_ERP_TB_PKG;
/
