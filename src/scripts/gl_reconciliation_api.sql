-- =============================================================================
-- GL Journal Reconciliation – PL/SQL Package + ORDS Handler
-- Compares: Batch totals ↔ Header totals ↔ Line totals
--
-- Tables (verified against actual DDL):
--   RR_GL_JOURNAL_BATCHES  – JE_BATCH_ID, BATCH_NAME, DEFAULT_PERIOD_NAME,
--                            LEDGER_NAME, STATUS,
--                            RUNNING_TOTAL_DR, RUNNING_TOTAL_CR
--
--   RR_GL_JE_HEADERS       – JE_HEADER_ID, BATCH_ID, JOURNAL_NAME,
--                            JOURNAL_DESCRIPTION, PERIOD_NAME, LEDGER_ID,
--                            LEDGER_NAME, POSTING_STATUS,
--                            RUNNING_TOTAL_DR, RUNNING_TOTAL_CR
--
--   RR_GL_JE_LINES_ALL     – JE_HEADER_ID, BATCH_ID,
--                            ENTERED_DR, ENTERED_CR
-- =============================================================================

CREATE OR REPLACE PACKAGE RR_GL_RECON_PKG AS

  -- Returns distinct ledgers with nested periods (all from RR_GL_JOURNAL_BATCHES)
  PROCEDURE get_ledgers (
    p_status   OUT NUMBER,
    p_response OUT CLOB
  );

  -- Main reconciliation: batch ↔ headers ↔ lines
  PROCEDURE get_reconciliation (
    p_ledger_id   IN  VARCHAR2,   -- pass LEDGER_NAME value
    p_period_name IN  VARCHAR2 DEFAULT NULL,
    p_status      OUT NUMBER,
    p_response    OUT CLOB
  );

END RR_GL_RECON_PKG;
/

CREATE OR REPLACE PACKAGE BODY RR_GL_RECON_PKG AS

  c_tol CONSTANT NUMBER := 0.01;

  -- ─────────────────────────────────────────────────────────────────────────
  -- PROCEDURE: get_ledgers
  -- GET /reerp/gl/reconciliation/ledgers  (no parameters)
  -- Uses APEX_JSON to avoid ORA-40478 size limits
  -- ─────────────────────────────────────────────────────────────────────────
  PROCEDURE get_ledgers (
    p_status   OUT NUMBER,
    p_response OUT CLOB
  ) AS
    CURSOR c_ledgers IS
      SELECT LEDGER_NAME,
             COUNT(*) AS batch_count
      FROM   RR_GL_JOURNAL_BATCHES
      WHERE  LEDGER_NAME IS NOT NULL
      GROUP  BY LEDGER_NAME
      ORDER  BY LEDGER_NAME;

    CURSOR c_periods (p_ledger VARCHAR2) IS
      SELECT DEFAULT_PERIOD_NAME,
             COUNT(*) AS batch_count
      FROM   RR_GL_JOURNAL_BATCHES
      WHERE  LEDGER_NAME          = p_ledger
      AND    DEFAULT_PERIOD_NAME IS NOT NULL
      GROUP  BY DEFAULT_PERIOD_NAME
      ORDER  BY DEFAULT_PERIOD_NAME DESC;

  BEGIN
    -- Backfill LEDGER_NAME in batches from headers where missing
    UPDATE RR_GL_JOURNAL_BATCHES b
    SET   (LEDGER_ID, LEDGER_NAME) = (
            SELECT h.LEDGER_ID, h.LEDGER_NAME
            FROM   RR_GL_JE_HEADERS h
            WHERE  h.BATCH_ID = b.JE_BATCH_ID
            AND    ROWNUM = 1
          )
    WHERE  b.LEDGER_NAME IS NULL
    AND    EXISTS (
             SELECT 1 FROM RR_GL_JE_HEADERS h
             WHERE h.BATCH_ID = b.JE_BATCH_ID
           );
    COMMIT;

    APEX_JSON.initialize_clob_output;
    APEX_JSON.open_object;
    APEX_JSON.open_array('items');

    FOR l IN c_ledgers LOOP
      APEX_JSON.open_object;
      APEX_JSON.write('ledger_name', l.LEDGER_NAME);
      APEX_JSON.write('batch_count', l.batch_count);
      APEX_JSON.open_array('periods');

      FOR p IN c_periods(l.LEDGER_NAME) LOOP
        APEX_JSON.open_object;
        APEX_JSON.write('period_name', p.DEFAULT_PERIOD_NAME);
        APEX_JSON.write('batch_count', p.batch_count);
        APEX_JSON.close_object;
      END LOOP;

      APEX_JSON.close_array;   -- periods
      APEX_JSON.close_object;  -- ledger item
    END LOOP;

    APEX_JSON.close_array;   -- items
    APEX_JSON.close_object;  -- root

    p_response := APEX_JSON.get_clob_output;
    APEX_JSON.free_output;
    p_status := 200;

  EXCEPTION WHEN OTHERS THEN
    APEX_JSON.free_output;
    p_status   := 500;
    p_response := '{"error":"' || REPLACE(SQLERRM, '"', '''') || '"}';
  END get_ledgers;

  -- ─────────────────────────────────────────────────────────────────────────
  -- PROCEDURE: get_reconciliation
  -- GET /reerp/gl/reconciliation?ledger_id=LEDGER_NAME&period_name=Apr-26
  -- Uses APEX_JSON to avoid ORA-40478 size limits
  -- ─────────────────────────────────────────────────────────────────────────
  PROCEDURE get_reconciliation (
    p_ledger_id   IN  VARCHAR2,
    p_period_name IN  VARCHAR2 DEFAULT NULL,
    p_status      OUT NUMBER,
    p_response    OUT CLOB
  ) AS
    CURSOR c_batches IS
      SELECT b.JE_BATCH_ID,
             b.BATCH_NAME,
             b.DEFAULT_PERIOD_NAME,
             b.LEDGER_NAME,
             b.STATUS,
             NVL(b.RUNNING_TOTAL_DR, 0) AS batch_dr,
             NVL(b.RUNNING_TOTAL_CR, 0) AS batch_cr,
             NVL((SELECT SUM(NVL(h.RUNNING_TOTAL_DR,0)) FROM RR_GL_JE_HEADERS h WHERE h.BATCH_ID = b.JE_BATCH_ID), 0) AS headers_dr,
             NVL((SELECT SUM(NVL(h.RUNNING_TOTAL_CR,0)) FROM RR_GL_JE_HEADERS h WHERE h.BATCH_ID = b.JE_BATCH_ID), 0) AS headers_cr,
             (SELECT COUNT(*) FROM RR_GL_JE_HEADERS h WHERE h.BATCH_ID = b.JE_BATCH_ID) AS header_count,
             NVL((SELECT SUM(NVL(l.ENTERED_DR,0)) FROM RR_GL_JE_LINES_ALL l WHERE l.BATCH_ID = b.JE_BATCH_ID), 0) AS lines_dr,
             NVL((SELECT SUM(NVL(l.ENTERED_CR,0)) FROM RR_GL_JE_LINES_ALL l WHERE l.BATCH_ID = b.JE_BATCH_ID), 0) AS lines_cr,
             (SELECT COUNT(*) FROM RR_GL_JE_LINES_ALL l WHERE l.BATCH_ID = b.JE_BATCH_ID) AS line_count
      FROM   RR_GL_JOURNAL_BATCHES b
      WHERE  b.LEDGER_NAME = p_ledger_id
      AND   (p_period_name IS NULL OR b.DEFAULT_PERIOD_NAME = p_period_name)
      ORDER  BY b.JE_BATCH_ID;

    CURSOR c_headers (p_batch_id NUMBER) IS
      SELECT h.JE_HEADER_ID,
             h.JOURNAL_NAME,
             h.JOURNAL_DESCRIPTION,
             h.PERIOD_NAME,
             h.POSTING_STATUS,
             NVL(h.RUNNING_TOTAL_DR, 0) AS header_dr,
             NVL(h.RUNNING_TOTAL_CR, 0) AS header_cr,
             NVL((SELECT SUM(NVL(l.ENTERED_DR,0)) FROM RR_GL_JE_LINES_ALL l WHERE l.JE_HEADER_ID = h.JE_HEADER_ID), 0) AS lines_dr,
             NVL((SELECT SUM(NVL(l.ENTERED_CR,0)) FROM RR_GL_JE_LINES_ALL l WHERE l.JE_HEADER_ID = h.JE_HEADER_ID), 0) AS lines_cr,
             (SELECT COUNT(*) FROM RR_GL_JE_LINES_ALL l WHERE l.JE_HEADER_ID = h.JE_HEADER_ID) AS line_count
      FROM   RR_GL_JE_HEADERS h
      WHERE  h.BATCH_ID = p_batch_id
      ORDER  BY h.JE_HEADER_ID;

    v_batch_hdr_dr_ok  VARCHAR2(1);
    v_batch_hdr_cr_ok  VARCHAR2(1);
    v_hdr_lines_dr_ok  VARCHAR2(1);
    v_hdr_lines_cr_ok  VARCHAR2(1);
    v_dr_ok            VARCHAR2(1);
    v_cr_ok            VARCHAR2(1);

  BEGIN
    APEX_JSON.initialize_clob_output;
    APEX_JSON.open_object;
    APEX_JSON.open_array('items');

    FOR b IN c_batches LOOP
      -- Batch ↔ Header match flags
      v_batch_hdr_dr_ok := CASE WHEN ABS(b.batch_dr - b.headers_dr) <= c_tol THEN 'Y' ELSE 'N' END;
      v_batch_hdr_cr_ok := CASE WHEN ABS(b.batch_cr - b.headers_cr) <= c_tol THEN 'Y' ELSE 'N' END;
      -- Header ↔ Lines match flags
      v_hdr_lines_dr_ok := CASE WHEN ABS(b.headers_dr - b.lines_dr) <= c_tol THEN 'Y' ELSE 'N' END;
      v_hdr_lines_cr_ok := CASE WHEN ABS(b.headers_cr - b.lines_cr) <= c_tol THEN 'Y' ELSE 'N' END;

      APEX_JSON.open_object;
      APEX_JSON.write('je_batch_id',      b.JE_BATCH_ID);
      APEX_JSON.write('batch_name',        b.BATCH_NAME);
      APEX_JSON.write('period_name',       b.DEFAULT_PERIOD_NAME);
      APEX_JSON.write('ledger_name',       b.LEDGER_NAME);
      APEX_JSON.write('batch_status',      b.STATUS);
      APEX_JSON.write('batch_dr',          b.batch_dr);
      APEX_JSON.write('batch_cr',          b.batch_cr);
      APEX_JSON.write('headers_dr',        b.headers_dr);
      APEX_JSON.write('headers_cr',        b.headers_cr);
      APEX_JSON.write('header_count',      b.header_count);
      APEX_JSON.write('lines_dr',          b.lines_dr);
      APEX_JSON.write('lines_cr',          b.lines_cr);
      APEX_JSON.write('line_count',        b.line_count);
      APEX_JSON.write('batch_hdr_dr_ok',   v_batch_hdr_dr_ok);
      APEX_JSON.write('batch_hdr_cr_ok',   v_batch_hdr_cr_ok);
      APEX_JSON.write('hdr_lines_dr_ok',   v_hdr_lines_dr_ok);
      APEX_JSON.write('hdr_lines_cr_ok',   v_hdr_lines_cr_ok);

      -- Per-header breakdown
      APEX_JSON.open_array('headers');
      FOR h IN c_headers(b.JE_BATCH_ID) LOOP
        v_dr_ok := CASE WHEN ABS(h.header_dr - h.lines_dr) <= c_tol THEN 'Y' ELSE 'N' END;
        v_cr_ok := CASE WHEN ABS(h.header_cr - h.lines_cr) <= c_tol THEN 'Y' ELSE 'N' END;

        APEX_JSON.open_object;
        APEX_JSON.write('je_header_id',  h.JE_HEADER_ID);
        APEX_JSON.write('journal_name',  h.JOURNAL_NAME);
        APEX_JSON.write('description',   h.JOURNAL_DESCRIPTION);
        APEX_JSON.write('period_name',   h.PERIOD_NAME);
        APEX_JSON.write('status',        h.POSTING_STATUS);
        APEX_JSON.write('header_dr',     h.header_dr);
        APEX_JSON.write('header_cr',     h.header_cr);
        APEX_JSON.write('lines_dr',      h.lines_dr);
        APEX_JSON.write('lines_cr',      h.lines_cr);
        APEX_JSON.write('line_count',    h.line_count);
        APEX_JSON.write('dr_ok',         v_dr_ok);
        APEX_JSON.write('cr_ok',         v_cr_ok);
        APEX_JSON.close_object;
      END LOOP;
      APEX_JSON.close_array;   -- headers

      APEX_JSON.close_object;  -- batch item
    END LOOP;

    APEX_JSON.close_array;   -- items
    APEX_JSON.close_object;  -- root

    p_response := APEX_JSON.get_clob_output;
    APEX_JSON.free_output;
    p_status := 200;

  EXCEPTION WHEN OTHERS THEN
    APEX_JSON.free_output;
    p_status   := 500;
    p_response := '{"error":"' || REPLACE(SQLERRM, '"', '''') || '"}';
  END get_reconciliation;

END RR_GL_RECON_PKG;
/


-- =============================================================================
-- ORDS HANDLER 1 – GET /reerp/gl/reconciliation/ledgers  (no parameters)
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
