-- =============================================================================
-- AP Multiperiod Fusion Data Handler
-- Handler:
--   GET  reerp/ap/multiperiod/fusion-data
--        Returns AP invoice lines that have multiperiod dates populated,
--        joined to invoice headers, with a flag indicating whether a
--        multiperiod schedule has already been generated.
--
-- Filters (URL query params):
--   invoice_number   – partial match (LIKE)
--   supplier         – partial match (LIKE)
--   business_unit    – exact match
--   line_description – partial match (LIKE)
--
-- Run in SQL Workshop > SQL Commands (as schema owner)
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1.  Drop existing ORDS template (idempotent)
-- ---------------------------------------------------------------------------
BEGIN
  ORDS.DELETE_TEMPLATE(p_module_name => 'reerp', p_pattern => 'ap/multiperiod/fusion-data');
  COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/


-- ---------------------------------------------------------------------------
-- 2.  GET ap/multiperiod/fusion-data
-- ---------------------------------------------------------------------------
BEGIN
  ORDS.DEFINE_HANDLER(
    p_module_name   => 'reerp',
    p_pattern       => 'ap/multiperiod/fusion-data',
    p_method        => 'GET',
    p_source_type   => 'plsql/block',
    p_mimes_allowed => '',
    p_comments      => 'Return AP invoice lines with multiperiod dates populated, including schedule-generated flag',
    p_source        => q'[
DECLARE
  -- Filter bind variables
  v_invoice_number  VARCHAR2(200) := NULLIF(TRIM(:invoice_number),   '');
  v_supplier        VARCHAR2(500) := NULLIF(TRIM(:supplier),         '');
  v_business_unit   VARCHAR2(200) := NULLIF(TRIM(:business_unit),    '');
  v_line_desc       VARCHAR2(500) := NULLIF(TRIM(:line_description), '');

  -- JSON helpers
  FUNCTION esc(p IN VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN REPLACE(REPLACE(p, CHR(92), CHR(92)||CHR(92)), '"', CHR(92)||'"');
  END;

  FUNCTION jstr(p IN VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN CASE WHEN p IS NULL THEN 'null' ELSE '"'||esc(p)||'"' END;
  END;

  FUNCTION jnum(p IN NUMBER) RETURN VARCHAR2 IS
  BEGIN
    RETURN CASE WHEN p IS NULL THEN 'null' ELSE TO_CHAR(p) END;
  END;

  FUNCTION jdate(p IN DATE) RETURN VARCHAR2 IS
  BEGIN
    RETURN CASE WHEN p IS NULL THEN 'null'
           ELSE '"'||TO_CHAR(p, 'YYYY-MM-DD')||'"' END;
  END;

  -- Output buffer
  v_buf   CLOB    := '{"items":[';
  v_first BOOLEAN := TRUE;
  v_count NUMBER  := 0;

BEGIN
  FOR r IN (
    SELECT
      -- Invoice header columns
      inv.INVOICE_ID,
      inv.INVOICE_NUMBER,
      inv.INVOICE_DATE,
      inv.INVOICE_AMOUNT,
      inv.INVOICE_CURRENCY,
      inv.BUSINESS_UNIT,
      inv.SUPPLIER,
      inv.SUPPLIER_NUMBER,
      -- Invoice line columns
      ln.LINE_NUMBER,
      ln.LINE_AMOUNT,
      ln.DESCRIPTION                AS LINE_DESCRIPTION,
      ln.DISTRIBUTION_COMBINATION   AS CHARGE_ACCOUNT,
      ln.MULTIPERIOD_ACCRUAL_ACCOUNT,
      ln.MULTIPERIOD_START_DATE,
      ln.MULTIPERIOD_END_DATE,
      -- Schedule-generated flag: 1 if any schedule row exists for this invoice
      CASE
        WHEN EXISTS (
          SELECT 1
            FROM RR_AP_INVOICE_MULTIPERIOD_SCHEDULE sch
           WHERE sch.INVOICE_ID = inv.INVOICE_ID
        ) THEN 1
        ELSE 0
      END AS SCHEDULE_GENERATED
    FROM RR_AP_INVOICE_LINES_ALL ln
    JOIN RR_AP_INVOICES_ALL      inv ON inv.INVOICE_ID = ln.INVOICE_ID
    WHERE ln.MULTIPERIOD_START_DATE IS NOT NULL
      AND ln.MULTIPERIOD_END_DATE   IS NOT NULL
      AND (v_invoice_number IS NULL
           OR UPPER(inv.INVOICE_NUMBER) LIKE '%'||UPPER(v_invoice_number)||'%')
      AND (v_supplier       IS NULL
           OR UPPER(inv.SUPPLIER)       LIKE '%'||UPPER(v_supplier)||'%')
      AND (v_business_unit  IS NULL
           OR inv.BUSINESS_UNIT = v_business_unit)
      AND (v_line_desc      IS NULL
           OR UPPER(ln.DESCRIPTION)     LIKE '%'||UPPER(v_line_desc)||'%')
    ORDER BY inv.INVOICE_DATE DESC, inv.INVOICE_NUMBER, ln.LINE_NUMBER
  ) LOOP
    IF NOT v_first THEN v_buf := v_buf || ','; END IF;
    v_first := FALSE;
    v_count := v_count + 1;

    v_buf := v_buf || '{'
      || '"invoiceId":'               || jnum(r.INVOICE_ID)               || ','
      || '"invoiceNumber":'           || jstr(r.INVOICE_NUMBER)           || ','
      || '"invoiceDate":'             || jdate(r.INVOICE_DATE)            || ','
      || '"invoiceAmount":'           || jnum(r.INVOICE_AMOUNT)           || ','
      || '"invoiceCurrency":'         || jstr(r.INVOICE_CURRENCY)         || ','
      || '"businessUnit":'            || jstr(r.BUSINESS_UNIT)            || ','
      || '"supplier":'                || jstr(r.SUPPLIER)                 || ','
      || '"supplierNumber":'          || jstr(r.SUPPLIER_NUMBER)          || ','
      || '"lineNumber":'              || jnum(r.LINE_NUMBER)              || ','
      || '"lineAmount":'              || jnum(r.LINE_AMOUNT)              || ','
      || '"lineDescription":'         || jstr(r.LINE_DESCRIPTION)         || ','
      || '"chargeAccount":'           || jstr(r.CHARGE_ACCOUNT)           || ','
      || '"multiperiodAccrualAccount":' || jstr(r.MULTIPERIOD_ACCRUAL_ACCOUNT) || ','
      || '"multiperiodStartDate":'    || jdate(r.MULTIPERIOD_START_DATE)  || ','
      || '"multiperiodEndDate":'      || jdate(r.MULTIPERIOD_END_DATE)    || ','
      || '"scheduleGenerated":'       || jnum(r.SCHEDULE_GENERATED)
    || '}';
  END LOOP;

  v_buf := v_buf || '],"count":' || TO_CHAR(v_count) || '}';

  :status_code := 200;
  OWA_UTIL.MIME_HEADER('application/json', TRUE);
  HTP.PRN(v_buf);
EXCEPTION
  WHEN OTHERS THEN
    :status_code := 500;
    OWA_UTIL.MIME_HEADER('application/json', TRUE);
    HTP.PRN('{"error":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;]'
  );
  COMMIT;
END;
/
