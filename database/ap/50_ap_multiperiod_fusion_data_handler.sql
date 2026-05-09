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
  v_invoice_number  VARCHAR2(200);
  v_supplier        VARCHAR2(500);
  v_business_unit   VARCHAR2(200);
  v_line_desc       VARCHAR2(500);
  v_open_as_of      DATE;
  v_count           NUMBER := 0;
BEGIN
  v_invoice_number := NULLIF(TRIM(:invoice_number),   '');
  v_supplier       := NULLIF(TRIM(:supplier),         '');
  v_business_unit  := NULLIF(TRIM(:business_unit),    '');
  v_line_desc      := NULLIF(TRIM(:line_description), '');
  -- open_as_of: filter to lines whose MPA end date >= this date
  -- e.g. open_as_of=2026-05-01 returns lines still open on 1 May 2026
  IF NULLIF(TRIM(:open_as_of), '') IS NOT NULL THEN
    v_open_as_of := TO_DATE(TRIM(:open_as_of), 'YYYY-MM-DD');
  END IF;

  :status_code := 200;
  OWA_UTIL.MIME_HEADER('application/json', TRUE);

  APEX_JSON.INITIALIZE_OUTPUT(p_http_header => FALSE);
  APEX_JSON.OPEN_OBJECT;
  APEX_JSON.OPEN_ARRAY('items');

  FOR r IN (
    SELECT
      inv.INVOICE_ID,
      inv.INVOICE_NUMBER,
      TO_CHAR(inv.INVOICE_DATE,        'YYYY-MM-DD') AS INVOICE_DATE_STR,
      inv.INVOICE_AMOUNT,
      inv.INVOICE_CURRENCY,
      inv.BUSINESS_UNIT,
      inv.SUPPLIER,
      inv.SUPPLIER_NUMBER,
      ln.LINE_NUMBER,
      ln.LINE_AMOUNT,
      ln.DESCRIPTION                                 AS LINE_DESCRIPTION,
      ln.DISTRIBUTION_COMBINATION                    AS CHARGE_ACCOUNT,
      ln.MULTIPERIOD_ACCRUAL_ACCOUNT,
      TO_CHAR(ln.MULTIPERIOD_START_DATE, 'YYYY-MM-DD') AS MPA_START,
      TO_CHAR(ln.MULTIPERIOD_END_DATE,   'YYYY-MM-DD') AS MPA_END,
      CASE WHEN EXISTS (
        SELECT 1 FROM RR_AP_INVOICE_MULTIPERIOD_SCHEDULE s
         WHERE s.INVOICE_ID = inv.INVOICE_ID
      ) THEN 1 ELSE 0 END AS SCHEDULE_GENERATED
    FROM RR_AP_INVOICE_LINES_ALL ln
    JOIN RR_AP_INVOICES_ALL      inv ON inv.INVOICE_ID = ln.INVOICE_ID
    WHERE ln.MULTIPERIOD_START_DATE IS NOT NULL
      AND ln.MULTIPERIOD_END_DATE   IS NOT NULL
      AND (v_invoice_number IS NULL OR UPPER(inv.INVOICE_NUMBER) LIKE '%'||UPPER(v_invoice_number)||'%')
      AND (v_supplier       IS NULL OR UPPER(inv.SUPPLIER)       LIKE '%'||UPPER(v_supplier)||'%')
      AND (v_business_unit  IS NULL OR inv.BUSINESS_UNIT = v_business_unit)
      AND (v_line_desc      IS NULL OR UPPER(ln.DESCRIPTION)     LIKE '%'||UPPER(v_line_desc)||'%')
      AND (v_open_as_of     IS NULL OR ln.MULTIPERIOD_END_DATE  >= v_open_as_of)
    ORDER BY inv.INVOICE_DATE DESC, inv.INVOICE_NUMBER, ln.LINE_NUMBER
  ) LOOP
    v_count := v_count + 1;
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('invoiceId',                 r.INVOICE_ID);
    APEX_JSON.WRITE('invoiceNumber',             r.INVOICE_NUMBER);
    APEX_JSON.WRITE('invoiceDate',               r.INVOICE_DATE_STR);
    APEX_JSON.WRITE('invoiceAmount',             r.INVOICE_AMOUNT);
    APEX_JSON.WRITE('invoiceCurrency',           r.INVOICE_CURRENCY);
    APEX_JSON.WRITE('businessUnit',              r.BUSINESS_UNIT);
    APEX_JSON.WRITE('supplier',                  r.SUPPLIER);
    APEX_JSON.WRITE('supplierNumber',            r.SUPPLIER_NUMBER);
    APEX_JSON.WRITE('lineNumber',                r.LINE_NUMBER);
    APEX_JSON.WRITE('lineAmount',                r.LINE_AMOUNT);
    APEX_JSON.WRITE('lineDescription',           r.LINE_DESCRIPTION);
    APEX_JSON.WRITE('chargeAccount',             r.CHARGE_ACCOUNT);
    APEX_JSON.WRITE('multiperiodAccrualAccount', r.MULTIPERIOD_ACCRUAL_ACCOUNT);
    APEX_JSON.WRITE('multiperiodStartDate',      r.MPA_START);
    APEX_JSON.WRITE('multiperiodEndDate',        r.MPA_END);
    APEX_JSON.WRITE('scheduleGenerated',         r.SCHEDULE_GENERATED);
    APEX_JSON.CLOSE_OBJECT;
  END LOOP;

  APEX_JSON.CLOSE_ARRAY;
  APEX_JSON.WRITE('count', v_count);
  APEX_JSON.CLOSE_OBJECT;

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
