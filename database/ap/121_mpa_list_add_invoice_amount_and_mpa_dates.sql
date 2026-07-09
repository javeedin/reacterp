-- ============================================================
-- PATCH 121: list ap/multiperiod — add invoice amount + MPA start/end dates
--
-- Problem:
--   GET /ap/multiperiod returned only "totalAmount" = SUM(schedule PERIOD_AMOUNT)
--   (the MPA-scheduled total). The Manage Multiperiod grid needs the real invoice
--   header amount as well as the invoice's MPA accrual window.
--
-- Fix:
--   Redefine the GET handler with inline SQL (self-contained — does not depend on
--   RR_AP_MPA_PKG) that additionally returns:
--     • invoiceAmount  — RR_AP_INVOICES_ALL.INVOICE_AMOUNT (the full invoice total)
--     • mpaStartDate   — MIN(RR_AP_INVOICE_LINES_ALL.MULTIPERIOD_START_DATE)
--     • mpaEndDate     — MAX(RR_AP_INVOICE_LINES_ALL.MULTIPERIOD_END_DATE)
--   totalAmount keeps its meaning (MPA-scheduled total). posted/notPosted unchanged.
--
-- HOW TO RUN: APEX SQL Workshop -> SQL Commands -> run the whole block.
-- ============================================================

BEGIN
    BEGIN
        ORDS.DELETE_HANDLER(p_module_name => 'reerp', p_pattern => 'ap/multiperiod', p_method => 'GET');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        ORDS.DEFINE_TEMPLATE(p_module_name => 'reerp', p_pattern => 'ap/multiperiod');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    ORDS.DEFINE_HANDLER(
        p_module_name   => 'reerp',
        p_pattern       => 'ap/multiperiod',
        p_method        => 'GET',
        p_source_type   => 'plsql/block',
        p_mimes_allowed => '',
        p_comments      => 'List multiperiod schedules — with invoice amount + MPA start/end dates (patch 121)',
        p_source        => q'[
DECLARE
  v_result      CLOB;
  v_offset      INTEGER;
  v_len         INTEGER;
  v_inv_number  VARCHAR2(200) := NULLIF(TRIM(:invoice_number), '');
  v_supplier    VARCHAR2(500) := NULLIF(TRIM(:supplier),       '');
  v_bus_unit    VARCHAR2(200) := NULLIF(TRIM(:business_unit),  '');
  v_post_status VARCHAR2(50)  := NULLIF(TRIM(:posting_status), '');
BEGIN
  SELECT JSON_OBJECT(
           'schedules' VALUE JSON_ARRAYAGG(
             JSON_OBJECT(
               'invoiceId'       VALUE t.invoice_id,
               'invoiceNumber'   VALUE t.invoice_number,
               'supplier'        VALUE t.supplier,
               'supplierNumber'  VALUE t.supplier_number,
               'businessUnit'    VALUE t.business_unit,
               'invoiceDate'     VALUE TO_CHAR(t.invoice_date, 'YYYY-MM-DD'),
               'currencyCode'    VALUE t.currency_code,
               'totalLines'      VALUE t.total_lines,
               'totalAmount'     VALUE t.total_amount,
               'invoiceAmount'   VALUE t.invoice_amount,
               'postedAmount'    VALUE t.posted_amount,
               'notPostedAmount' VALUE t.not_posted_amount,
               'minPeriodDate'   VALUE TO_CHAR(t.min_period_date, 'YYYY-MM-DD'),
               'maxPeriodDate'   VALUE TO_CHAR(t.max_period_date, 'YYYY-MM-DD'),
               'mpaStartDate'    VALUE TO_CHAR(t.mpa_start_date,  'YYYY-MM-DD'),
               'mpaEndDate'      VALUE TO_CHAR(t.mpa_end_date,    'YYYY-MM-DD')
               NULL ON NULL RETURNING CLOB
             ) ORDER BY t.invoice_number RETURNING CLOB
           ) RETURNING CLOB
         )
    INTO v_result
    FROM (
      SELECT
        s.INVOICE_ID                                    AS invoice_id,
        s.INVOICE_NUMBER                                AS invoice_number,
        s.SUPPLIER                                      AS supplier,
        s.SUPPLIER_NUMBER                               AS supplier_number,
        s.BUSINESS_UNIT                                 AS business_unit,
        s.INVOICE_DATE                                  AS invoice_date,
        s.CURRENCY_CODE                                 AS currency_code,
        COUNT(*)                                        AS total_lines,
        SUM(s.PERIOD_AMOUNT)                            AS total_amount,
        MAX((SELECT i.INVOICE_AMOUNT FROM RR_AP_INVOICES_ALL i
              WHERE i.INVOICE_ID = s.INVOICE_ID))       AS invoice_amount,
        SUM(CASE WHEN s.POSTING_STATUS = 'Posted'     THEN s.PERIOD_AMOUNT ELSE 0 END) AS posted_amount,
        SUM(CASE WHEN s.POSTING_STATUS = 'Not Posted' THEN s.PERIOD_AMOUNT ELSE 0 END) AS not_posted_amount,
        MIN(s.PERIOD_DATE)                              AS min_period_date,
        MAX(s.PERIOD_DATE)                              AS max_period_date,
        MAX((SELECT MIN(l.MULTIPERIOD_START_DATE) FROM RR_AP_INVOICE_LINES_ALL l
              WHERE l.INVOICE_ID = s.INVOICE_ID AND l.MULTIPERIOD_START_DATE IS NOT NULL)) AS mpa_start_date,
        MAX((SELECT MAX(l.MULTIPERIOD_END_DATE)   FROM RR_AP_INVOICE_LINES_ALL l
              WHERE l.INVOICE_ID = s.INVOICE_ID AND l.MULTIPERIOD_END_DATE   IS NOT NULL)) AS mpa_end_date
      FROM RR_AP_INVOICE_MULTIPERIOD_SCHEDULE s
     WHERE (v_inv_number  IS NULL OR UPPER(s.INVOICE_NUMBER) LIKE '%'||UPPER(v_inv_number)||'%')
       AND (v_supplier    IS NULL OR UPPER(s.SUPPLIER)       LIKE '%'||UPPER(v_supplier)||'%')
       AND (v_bus_unit    IS NULL OR s.BUSINESS_UNIT = v_bus_unit)
       AND (v_post_status IS NULL OR s.POSTING_STATUS = v_post_status)
       AND s.TRANSACTION_STATUS = 'Active'
     GROUP BY
        s.INVOICE_ID, s.INVOICE_NUMBER, s.SUPPLIER, s.SUPPLIER_NUMBER,
        s.BUSINESS_UNIT, s.INVOICE_DATE, s.CURRENCY_CODE
    ) t;

  IF v_result IS NULL THEN v_result := '{"schedules":[]}'; END IF;

  :status_code := 200;
  OWA_UTIL.MIME_HEADER('application/json', TRUE);
  v_len    := DBMS_LOB.GETLENGTH(v_result);
  v_offset := 1;
  WHILE v_offset <= v_len LOOP
    HTP.PRN(DBMS_LOB.SUBSTR(v_result, 4000, v_offset));
    v_offset := v_offset + 4000;
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN
    :status_code := 500;
    OWA_UTIL.MIME_HEADER('application/json', TRUE);
    HTP.PRN('{"error":"' || REPLACE(SQLERRM,'"','\"') || '"}');
END;]'
    );

    COMMIT;
    DBMS_OUTPUT.PUT_LINE('GET /ap/multiperiod redeployed with invoiceAmount + MPA dates (patch 121).');
END;
/
