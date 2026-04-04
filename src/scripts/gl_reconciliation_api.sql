-- =============================================================================
-- GL Journal Reconciliation – PL/SQL Package + ORDS Handler
-- Compares: Batch totals ↔ Header totals ↔ Line totals
--
-- Tables (verified against actual DDL):
--   RR_GL_JOURNAL_BATCHES  – JE_BATCH_ID, BATCH_NAME, DEFAULT_PERIOD_NAME,
--                            LEDGER_ID, LEDGER_NAME, STATUS,
--                            RUNNING_TOTAL_DR, RUNNING_TOTAL_CR,
--                            RUNNING_TOTAL_ACCT_DR, RUNNING_TOTAL_ACCT_CR
--
--   RR_GL_JE_HEADERS       – JE_HEADER_ID, BATCH_ID, JOURNAL_NAME,
--                            JOURNAL_DESCRIPTION, PERIOD_NAME, LEDGER_ID,
--                            POSTING_STATUS, RUNNING_TOTAL_DR, RUNNING_TOTAL_CR,
--                            RUNNING_TOTAL_ACCOUNTED_DR, RUNNING_TOTAL_ACCOUNTED_CR
--
--   RR_GL_JE_LINES_ALL     – JE_HEADER_ID, BATCH_ID,
--                            ENTERED_DR, ENTERED_CR, ACCOUNTED_DR, ACCOUNTED_CR
-- =============================================================================

CREATE OR REPLACE PACKAGE RR_GL_RECON_PKG AS

  -- Returns distinct ledgers with their periods (both from RR_GL_JOURNAL_BATCHES)
  PROCEDURE get_ledgers (
    p_status   OUT NUMBER,
    p_response OUT CLOB
  );

  -- Main reconciliation: batch ↔ headers ↔ lines
  PROCEDURE get_reconciliation (
    p_ledger_id   IN  VARCHAR2,
    p_period_name IN  VARCHAR2 DEFAULT NULL,
    p_status      OUT NUMBER,
    p_response    OUT CLOB
  );

END RR_GL_RECON_PKG;
/

CREATE OR REPLACE PACKAGE BODY RR_GL_RECON_PKG AS

  c_tol CONSTANT NUMBER := 0.01;   -- tolerance for float comparison

  -- ─────────────────────────────────────────────────────────────────────────
  -- PROCEDURE: get_ledgers
  -- GET /reerp/gl/reconciliation/ledgers
  -- Returns each ledger with its distinct periods nested – no params needed
  -- ─────────────────────────────────────────────────────────────────────────
  PROCEDURE get_ledgers (
    p_status   OUT NUMBER,
    p_response OUT CLOB
  ) AS
  BEGIN
    -- Backfill LEDGER_ID / LEDGER_NAME in batches from headers where missing
    UPDATE RR_GL_JOURNAL_BATCHES b
    SET   (LEDGER_ID, LEDGER_NAME) = (
            SELECT h.LEDGER_ID, h.LEDGER_NAME
            FROM   RR_GL_JE_HEADERS h
            WHERE  h.BATCH_ID = b.JE_BATCH_ID
            AND    ROWNUM = 1
          )
    WHERE  b.LEDGER_ID IS NULL
    AND    EXISTS (
             SELECT 1 FROM RR_GL_JE_HEADERS h
             WHERE h.BATCH_ID = b.JE_BATCH_ID
           );
    COMMIT;

    -- Pre-aggregate periods per ledger into a JSON array first,
    -- then join to ledgers — avoids scalar subquery inside JSON_ARRAYAGG
    WITH periods_agg AS (
      SELECT   LEDGER_NAME,
               DEFAULT_PERIOD_NAME AS period_name,
               COUNT(*)            AS period_batch_count
      FROM     RR_GL_JOURNAL_BATCHES
      WHERE    LEDGER_NAME IS NOT NULL
      AND      DEFAULT_PERIOD_NAME IS NOT NULL
      GROUP BY LEDGER_NAME, DEFAULT_PERIOD_NAME
    ),
    periods_json AS (
      SELECT   LEDGER_NAME,
               JSON_ARRAYAGG(
                 JSON_OBJECT(
                   'period_name' VALUE period_name,
                   'batch_count' VALUE period_batch_count
                 ) ORDER BY period_name DESC
               ) AS periods_arr
      FROM     periods_agg
      GROUP BY LEDGER_NAME
    ),
    ledgers AS (
      SELECT   LEDGER_NAME        AS ledger_name,
               COUNT(*)           AS batch_count
      FROM     RR_GL_JOURNAL_BATCHES
      WHERE    LEDGER_NAME IS NOT NULL
      GROUP BY LEDGER_NAME
    )
    SELECT JSON_OBJECT(
      'items' VALUE JSON_ARRAYAGG(
        JSON_OBJECT(
          'ledger_name' VALUE l.ledger_name,
          'batch_count' VALUE l.batch_count,
          'periods'     VALUE pj.periods_arr
        ) ORDER BY l.ledger_name
      )
    )
    INTO p_response
    FROM ledgers l
    JOIN periods_json pj ON pj.LEDGER_NAME = l.ledger_name;

    p_status := 200;
  EXCEPTION WHEN OTHERS THEN
    p_status   := 500;
    p_response := JSON_OBJECT('error' VALUE SQLERRM);
  END get_ledgers;

  -- ─────────────────────────────────────────────────────────────────────────
  -- PROCEDURE: get_reconciliation
  -- GET /reerp/gl/reconciliation?ledger_name=XXX&period_name=Sep-23
  -- ─────────────────────────────────────────────────────────────────────────
  PROCEDURE get_reconciliation (
    p_ledger_id   IN  VARCHAR2,
    p_period_name IN  VARCHAR2 DEFAULT NULL,
    p_status      OUT NUMBER,
    p_response    OUT CLOB
  ) AS
  BEGIN

    SELECT JSON_OBJECT(
      'items' VALUE JSON_ARRAYAGG(
        JSON_OBJECT(
          -- ── Batch Identity ──────────────────────────────────────────────
          'je_batch_id'  VALUE b.JE_BATCH_ID,
          'batch_name'   VALUE b.BATCH_NAME,
          'period_name'  VALUE b.DEFAULT_PERIOD_NAME,
          'ledger_id'    VALUE b.LEDGER_ID,
          'ledger_name'  VALUE b.LEDGER_NAME,
          'batch_status' VALUE b.STATUS,

          -- ── Batch-level totals ──────────────────────────────────────────
          'batch_dr'     VALUE NVL(b.RUNNING_TOTAL_DR, 0),
          'batch_cr'     VALUE NVL(b.RUNNING_TOTAL_CR, 0),

          -- ── Header-level totals (SUM of synced headers for this batch) ──
          'headers_dr'   VALUE NVL((SELECT SUM(NVL(h.RUNNING_TOTAL_DR, 0))
                                    FROM   RR_GL_JE_HEADERS h
                                    WHERE  h.BATCH_ID = b.JE_BATCH_ID), 0),
          'headers_cr'   VALUE NVL((SELECT SUM(NVL(h.RUNNING_TOTAL_CR, 0))
                                    FROM   RR_GL_JE_HEADERS h
                                    WHERE  h.BATCH_ID = b.JE_BATCH_ID), 0),
          'header_count' VALUE (SELECT COUNT(*)
                                FROM   RR_GL_JE_HEADERS h
                                WHERE  h.BATCH_ID = b.JE_BATCH_ID),

          -- ── Line-level totals (SUM of synced lines for this batch) ──────
          'lines_dr'     VALUE NVL((SELECT SUM(NVL(l.ENTERED_DR, 0))
                                    FROM   RR_GL_JE_LINES_ALL l
                                    WHERE  l.BATCH_ID = b.JE_BATCH_ID), 0),
          'lines_cr'     VALUE NVL((SELECT SUM(NVL(l.ENTERED_CR, 0))
                                    FROM   RR_GL_JE_LINES_ALL l
                                    WHERE  l.BATCH_ID = b.JE_BATCH_ID), 0),
          'line_count'   VALUE (SELECT COUNT(*)
                                FROM   RR_GL_JE_LINES_ALL l
                                WHERE  l.BATCH_ID = b.JE_BATCH_ID),

          -- ── Match flags: Batch ↔ Headers ────────────────────────────────
          'batch_hdr_dr_ok' VALUE CASE
            WHEN ABS(NVL(b.RUNNING_TOTAL_DR, 0) -
                     NVL((SELECT SUM(NVL(h.RUNNING_TOTAL_DR, 0))
                          FROM RR_GL_JE_HEADERS h
                          WHERE h.BATCH_ID = b.JE_BATCH_ID), 0)) <= c_tol
            THEN 'Y' ELSE 'N' END,

          'batch_hdr_cr_ok' VALUE CASE
            WHEN ABS(NVL(b.RUNNING_TOTAL_CR, 0) -
                     NVL((SELECT SUM(NVL(h.RUNNING_TOTAL_CR, 0))
                          FROM RR_GL_JE_HEADERS h
                          WHERE h.BATCH_ID = b.JE_BATCH_ID), 0)) <= c_tol
            THEN 'Y' ELSE 'N' END,

          -- ── Match flags: Headers ↔ Lines ────────────────────────────────
          'hdr_lines_dr_ok' VALUE CASE
            WHEN ABS(NVL((SELECT SUM(NVL(h.RUNNING_TOTAL_DR, 0))
                          FROM RR_GL_JE_HEADERS h
                          WHERE h.BATCH_ID = b.JE_BATCH_ID), 0) -
                     NVL((SELECT SUM(NVL(l.ENTERED_DR, 0))
                          FROM RR_GL_JE_LINES_ALL l
                          WHERE l.BATCH_ID = b.JE_BATCH_ID), 0)) <= c_tol
            THEN 'Y' ELSE 'N' END,

          'hdr_lines_cr_ok' VALUE CASE
            WHEN ABS(NVL((SELECT SUM(NVL(h.RUNNING_TOTAL_CR, 0))
                          FROM RR_GL_JE_HEADERS h
                          WHERE h.BATCH_ID = b.JE_BATCH_ID), 0) -
                     NVL((SELECT SUM(NVL(l.ENTERED_CR, 0))
                          FROM RR_GL_JE_LINES_ALL l
                          WHERE l.BATCH_ID = b.JE_BATCH_ID), 0)) <= c_tol
            THEN 'Y' ELSE 'N' END,

          -- ── Per-Header breakdown (for expandable rows in React) ──────────
          'headers' VALUE (
            SELECT JSON_ARRAYAGG(
              JSON_OBJECT(
                'je_header_id' VALUE h.JE_HEADER_ID,
                'journal_name' VALUE h.JOURNAL_NAME,
                'description'  VALUE h.JOURNAL_DESCRIPTION,
                'period_name'  VALUE h.PERIOD_NAME,
                'status'       VALUE h.POSTING_STATUS,

                -- Header totals
                'header_dr'    VALUE NVL(h.RUNNING_TOTAL_DR, 0),
                'header_cr'    VALUE NVL(h.RUNNING_TOTAL_CR, 0),

                -- Lines for this header
                'lines_dr'     VALUE NVL((SELECT SUM(NVL(l.ENTERED_DR, 0))
                                          FROM   RR_GL_JE_LINES_ALL l
                                          WHERE  l.JE_HEADER_ID = h.JE_HEADER_ID), 0),
                'lines_cr'     VALUE NVL((SELECT SUM(NVL(l.ENTERED_CR, 0))
                                          FROM   RR_GL_JE_LINES_ALL l
                                          WHERE  l.JE_HEADER_ID = h.JE_HEADER_ID), 0),
                'line_count'   VALUE (SELECT COUNT(*)
                                      FROM   RR_GL_JE_LINES_ALL l
                                      WHERE  l.JE_HEADER_ID = h.JE_HEADER_ID),

                -- Match flags for this header
                'dr_ok' VALUE CASE
                  WHEN ABS(NVL(h.RUNNING_TOTAL_DR, 0) -
                           NVL((SELECT SUM(NVL(l.ENTERED_DR, 0))
                                FROM RR_GL_JE_LINES_ALL l
                                WHERE l.JE_HEADER_ID = h.JE_HEADER_ID), 0)) <= c_tol
                  THEN 'Y' ELSE 'N' END,

                'cr_ok' VALUE CASE
                  WHEN ABS(NVL(h.RUNNING_TOTAL_CR, 0) -
                           NVL((SELECT SUM(NVL(l.ENTERED_CR, 0))
                                FROM RR_GL_JE_LINES_ALL l
                                WHERE l.JE_HEADER_ID = h.JE_HEADER_ID), 0)) <= c_tol
                  THEN 'Y' ELSE 'N' END
              ) ORDER BY h.JE_HEADER_ID
            )
            FROM RR_GL_JE_HEADERS h
            WHERE h.BATCH_ID = b.JE_BATCH_ID
          )

        ) ORDER BY b.JE_BATCH_ID
      )
    )
    INTO p_response
    FROM  RR_GL_JOURNAL_BATCHES b
    WHERE b.LEDGER_NAME = p_ledger_id
    AND  (p_period_name IS NULL OR b.DEFAULT_PERIOD_NAME = p_period_name);

    p_status := 200;

  EXCEPTION WHEN OTHERS THEN
    p_status   := 500;
    p_response := JSON_OBJECT('error' VALUE SQLERRM);
  END get_reconciliation;

END RR_GL_RECON_PKG;
/


-- =============================================================================
-- ORDS HANDLER 1 – GET /reerp/gl/reconciliation/ledgers
-- Paste this block as the PL/SQL source in the APEX ORDS GET handler
-- =============================================================================
/*
DECLARE
  v_status   NUMBER;
  v_response CLOB;
  v_offset   PLS_INTEGER := 1;
  v_chunk    VARCHAR2(32767);
BEGIN
  RR_GL_RECON_PKG.get_ledgers(v_status, v_response);
  OWA_UTIL.mime_header('application/json', TRUE);
  IF v_response IS NULL THEN
    HTP.PRN('{"items":[]}');
  ELSE
    WHILE v_offset <= DBMS_LOB.GETLENGTH(v_response) LOOP
      v_chunk  := DBMS_LOB.SUBSTR(v_response, 32767, v_offset);
      HTP.PRN(v_chunk);
      v_offset := v_offset + 32767;
    END LOOP;
  END IF;
END;
*/


-- =============================================================================
-- ORDS HANDLER 2 – GET /reerp/gl/reconciliation
-- Bind variables:  :ledger_id   (query string — pass ledger_name value)
--                  :period_name (query string, optional)
-- Paste this block as the PL/SQL source in the APEX ORDS GET handler
-- =============================================================================
/*
DECLARE
  v_status   NUMBER;
  v_response CLOB;
  v_offset   PLS_INTEGER := 1;
  v_chunk    VARCHAR2(32767);
BEGIN
  RR_GL_RECON_PKG.get_reconciliation(
    p_ledger_id   => :ledger_id,
    p_period_name => :period_name,
    p_status      => v_status,
    p_response    => v_response
  );
  OWA_UTIL.mime_header('application/json', TRUE);
  IF v_response IS NULL THEN
    HTP.PRN('{"items":[]}');
  ELSE
    WHILE v_offset <= DBMS_LOB.GETLENGTH(v_response) LOOP
      v_chunk  := DBMS_LOB.SUBSTR(v_response, 32767, v_offset);
      HTP.PRN(v_chunk);
      v_offset := v_offset + 32767;
    END LOOP;
  END IF;
END;
*/
