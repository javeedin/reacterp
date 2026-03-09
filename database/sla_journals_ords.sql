-- =============================================================================
-- NEW ORDS ENDPOINTS: Manage Subledger Journals
-- =============================================================================
-- Two new GET endpoints to support the "Manage Subledger Journals" page:
--
--   GET /reerp/sla/journals        → query SLA headers with filters
--   GET /reerp/sla/journals/lines  → query SLA lines (joined to headers)
--
-- Filter parameters (all optional, passed as query string):
--   accountingStatus  VARCHAR2   DRAFT | POSTED | ERROR
--   moduleName        VARCHAR2   AP | AR | GL
--   sourceTable       VARCHAR2   AP_INVOICES | AP_PAYMENTS
--   eventTypeCode     VARCHAR2
--   periodName        VARCHAR2   e.g. Mar-26
--   sourceNumber      VARCHAR2   partial match supported
--   dateFrom          VARCHAR2   YYYY-MM-DD
--   dateTo            VARCHAR2   YYYY-MM-DD
--   lineType          VARCHAR2   DR | CR  (lines endpoint only)
--   accountingClass   VARCHAR2   EXPENSE | LIABILITY | TAX | PREPAYMENT
--   accountCombination VARCHAR2  partial match (lines endpoint only)
--   limit             NUMBER     default 500
--
-- Tables used: RR_SLA_ACCOUNTING_HEADERS, RR_SLA_ACCOUNTING_LINES
-- Module: reerp
-- Run in: SQL Workshop > SQL Commands (as schema owner)
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 0.  Create templates (safe – ignore if already exist)
-- ---------------------------------------------------------------------------
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'reerp', p_pattern => 'sla/journals');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'reerp', p_pattern => 'sla/journals/lines');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'sla/journals',
        p_comments    => 'SLA Journal Entries (headers) query endpoint'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'sla/journals/lines',
        p_comments    => 'SLA Journal Entry Lines query endpoint'
    );
    COMMIT;
END;
/


-- ---------------------------------------------------------------------------
-- 1.  GET sla/journals  — headers list
-- ---------------------------------------------------------------------------
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'sla/journals',
        p_method         => 'GET',
        p_source_type    => 'plsql/block',
        p_comments       => 'Query SLA accounting headers with optional filters',
        p_source         =>
'DECLARE
  v_sql    CLOB;
  v_cur    SYS_REFCURSOR;
  v_result CLOB := ''{"items":['';
  v_sep    VARCHAR2(1) := '''';

  -- row variables
  v_header_id       NUMBER;
  v_module          VARCHAR2(60);
  v_src_table       VARCHAR2(60);
  v_src_id          NUMBER;
  v_src_number      VARCHAR2(100);
  v_src_type        VARCHAR2(60);
  v_event_type      VARCHAR2(60);
  v_acct_date       VARCHAR2(20);
  v_period          VARCHAR2(15);
  v_ledger_id       NUMBER;
  v_ledger_name     VARCHAR2(100);
  v_currency        VARCHAR2(15);
  v_bu              VARCHAR2(100);
  v_le              VARCHAR2(100);
  v_desc            VARCHAR2(500);
  v_acct_status     VARCHAR2(20);
  v_post_status     VARCHAR2(20);
  v_gl_batch_id     NUMBER;
  v_gl_batch_name   VARCHAR2(200);
  v_gl_header_id    NUMBER;
  v_created_by      VARCHAR2(100);
  v_creation_date   VARCHAR2(30);
  v_posted_by       VARCHAR2(100);
  v_posted_date     VARCHAR2(30);
  v_line_count      NUMBER;

  FUNCTION esc(p IN VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN REPLACE(REPLACE(p, CHR(92), CHR(92)||CHR(92)), ''"'', CHR(92)||''"'');
  END;

  FUNCTION jstr(p IN VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN CASE WHEN p IS NULL THEN ''null'' ELSE ''"'' || esc(p) || ''"'' END;
  END;

  FUNCTION jnum(p IN NUMBER) RETURN VARCHAR2 IS
  BEGIN
    RETURN CASE WHEN p IS NULL THEN ''null'' ELSE TO_CHAR(p) END;
  END;

BEGIN
  v_sql :=
    ''SELECT h.header_id, h.module_name, h.source_table, h.source_id,'' ||
    ''       h.source_number, h.source_type, h.event_type_code,'' ||
    ''       TO_CHAR(h.accounting_date, ''''YYYY-MM-DD'''') accounting_date,'' ||
    ''       h.period_name, h.ledger_id, h.ledger_name, h.currency_code,'' ||
    ''       h.business_unit, h.legal_entity, h.description,'' ||
    ''       h.accounting_status, h.posting_status,'' ||
    ''       h.gl_batch_id, h.gl_batch_name, h.gl_header_id,'' ||
    ''       h.created_by,'' ||
    ''       TO_CHAR(h.creation_date, ''''YYYY-MM-DD HH24:MI:SS'''') creation_date,'' ||
    ''       h.posted_by,'' ||
    ''       TO_CHAR(h.posted_date, ''''YYYY-MM-DD HH24:MI:SS'''') posted_date,'' ||
    ''       (SELECT COUNT(*) FROM RR_SLA_ACCOUNTING_LINES l WHERE l.header_id = h.header_id) line_count'' ||
    ''  FROM RR_SLA_ACCOUNTING_HEADERS h'' ||
    '' WHERE 1=1'';

  IF :accountingStatus IS NOT NULL AND :accountingStatus != '''' THEN
    v_sql := v_sql || '' AND h.accounting_status = '''''' || :accountingStatus || '''''''''';
  END IF;
  IF :moduleName IS NOT NULL AND :moduleName != '''' THEN
    v_sql := v_sql || '' AND h.module_name = '''''' || :moduleName || '''''''''';
  END IF;
  IF :sourceTable IS NOT NULL AND :sourceTable != '''' THEN
    v_sql := v_sql || '' AND h.source_table = '''''' || :sourceTable || '''''''''';
  END IF;
  IF :eventTypeCode IS NOT NULL AND :eventTypeCode != '''' THEN
    v_sql := v_sql || '' AND h.event_type_code = '''''' || :eventTypeCode || '''''''''';
  END IF;
  IF :periodName IS NOT NULL AND :periodName != '''' THEN
    v_sql := v_sql || '' AND h.period_name = '''''' || :periodName || '''''''''';
  END IF;
  IF :sourceNumber IS NOT NULL AND :sourceNumber != '''' THEN
    v_sql := v_sql || '' AND UPPER(h.source_number) LIKE ''''%'' || UPPER(:sourceNumber) || ''%'''''';
  END IF;
  IF :dateFrom IS NOT NULL AND :dateFrom != '''' THEN
    v_sql := v_sql || '' AND h.accounting_date >= TO_DATE('''''' || :dateFrom || '''''', ''''YYYY-MM-DD'''')'';
  END IF;
  IF :dateTo IS NOT NULL AND :dateTo != '''' THEN
    v_sql := v_sql || '' AND h.accounting_date <= TO_DATE('''''' || :dateTo || '''''', ''''YYYY-MM-DD'''')'';
  END IF;

  v_sql := v_sql || '' ORDER BY h.accounting_date DESC, h.header_id DESC'';
  v_sql := v_sql || '' FETCH FIRST '' || NVL(TO_NUMBER(:limit), 500) || '' ROWS ONLY'';

  OPEN v_cur FOR v_sql;
  LOOP
    FETCH v_cur INTO
      v_header_id, v_module, v_src_table, v_src_id, v_src_number, v_src_type, v_event_type,
      v_acct_date, v_period, v_ledger_id, v_ledger_name, v_currency,
      v_bu, v_le, v_desc, v_acct_status, v_post_status,
      v_gl_batch_id, v_gl_batch_name, v_gl_header_id,
      v_created_by, v_creation_date, v_posted_by, v_posted_date, v_line_count;
    EXIT WHEN v_cur%NOTFOUND;

    v_result := v_result || v_sep ||
      ''{"headerId":'' || jnum(v_header_id) ||
      '',"moduleName":'' || jstr(v_module) ||
      '',"sourceTable":'' || jstr(v_src_table) ||
      '',"sourceId":'' || jnum(v_src_id) ||
      '',"sourceNumber":'' || jstr(v_src_number) ||
      '',"sourceType":'' || jstr(v_src_type) ||
      '',"eventTypeCode":'' || jstr(v_event_type) ||
      '',"accountingDate":'' || jstr(v_acct_date) ||
      '',"periodName":'' || jstr(v_period) ||
      '',"ledgerId":'' || jnum(v_ledger_id) ||
      '',"ledgerName":'' || jstr(v_ledger_name) ||
      '',"currencyCode":'' || jstr(v_currency) ||
      '',"businessUnit":'' || jstr(v_bu) ||
      '',"legalEntity":'' || jstr(v_le) ||
      '',"description":'' || jstr(v_desc) ||
      '',"accountingStatus":'' || jstr(v_acct_status) ||
      '',"postingStatus":'' || jstr(v_post_status) ||
      '',"glBatchId":'' || jnum(v_gl_batch_id) ||
      '',"glBatchName":'' || jstr(v_gl_batch_name) ||
      '',"glHeaderId":'' || jnum(v_gl_header_id) ||
      '',"createdBy":'' || jstr(v_created_by) ||
      '',"creationDate":'' || jstr(v_creation_date) ||
      '',"postedBy":'' || jstr(v_posted_by) ||
      '',"postedDate":'' || jstr(v_posted_date) ||
      '',"lineCount":'' || jnum(v_line_count) ||
      ''}'';
    v_sep := '','';
  END LOOP;
  CLOSE v_cur;

  v_result := v_result || '']}'';
  :status_code := 200;
  OWA_UTIL.MIME_HEADER(''application/json'', TRUE);
  HTP.PRN(v_result);
EXCEPTION
  WHEN OTHERS THEN
    :status_code := 500;
    OWA_UTIL.MIME_HEADER(''application/json'', TRUE);
    HTP.PRN(''{"error":true,"message":"'' || REPLACE(SQLERRM,''"'',''\\"'') || ''"}'' );
END;'
    );
    COMMIT;
END;
/


-- ---------------------------------------------------------------------------
-- 2.  GET sla/journals/lines  — lines list (joined to headers)
-- ---------------------------------------------------------------------------
BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'sla/journals/lines',
        p_method         => 'GET',
        p_source_type    => 'plsql/block',
        p_comments       => 'Query SLA accounting lines with optional filters (joined to headers)',
        p_source         =>
'DECLARE
  v_sql    CLOB;
  v_cur    SYS_REFCURSOR;
  v_result CLOB := ''{"items":['';
  v_sep    VARCHAR2(1) := '''';

  -- row variables
  v_line_id     NUMBER;
  v_header_id   NUMBER;
  v_line_num    NUMBER;
  v_line_type   VARCHAR2(2);
  v_acct_class  VARCHAR2(60);
  v_account     VARCHAR2(200);
  v_ent_dr      NUMBER;
  v_ent_cr      NUMBER;
  v_acc_dr      NUMBER;
  v_acc_cr      NUMBER;
  v_currency    VARCHAR2(15);
  v_desc        VARCHAR2(500);
  v_src_number  VARCHAR2(100);
  v_src_table   VARCHAR2(60);
  v_acct_date   VARCHAR2(20);
  v_acct_status VARCHAR2(20);
  v_bu          VARCHAR2(100);
  v_le          VARCHAR2(100);
  v_module      VARCHAR2(60);
  v_party_type  VARCHAR2(30);

  FUNCTION esc(p IN VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN REPLACE(REPLACE(p, CHR(92), CHR(92)||CHR(92)), ''"'', CHR(92)||''"'');
  END;

  FUNCTION jstr(p IN VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN CASE WHEN p IS NULL THEN ''null'' ELSE ''"'' || esc(p) || ''"'' END;
  END;

  FUNCTION jnum(p IN NUMBER) RETURN VARCHAR2 IS
  BEGIN
    RETURN CASE WHEN p IS NULL THEN ''null'' ELSE TO_CHAR(p) END;
  END;

BEGIN
  v_sql :=
    ''SELECT l.line_id, l.header_id, l.line_number, l.line_type, l.accounting_class,'' ||
    ''       l.account_combination, l.entered_dr, l.entered_cr, l.accounted_dr, l.accounted_cr,'' ||
    ''       NVL(l.currency_code, h.currency_code) currency_code, l.description,'' ||
    ''       h.source_number, h.source_table,'' ||
    ''       TO_CHAR(h.accounting_date, ''''YYYY-MM-DD'''') accounting_date,'' ||
    ''       h.accounting_status, h.business_unit, h.legal_entity,'' ||
    ''       h.module_name, l.party_type'' ||
    ''  FROM RR_SLA_ACCOUNTING_LINES l'' ||
    ''  JOIN RR_SLA_ACCOUNTING_HEADERS h ON l.header_id = h.header_id'' ||
    '' WHERE 1=1'';

  IF :accountingStatus IS NOT NULL AND :accountingStatus != '''' THEN
    v_sql := v_sql || '' AND h.accounting_status = '''''' || :accountingStatus || '''''''''';
  END IF;
  IF :moduleName IS NOT NULL AND :moduleName != '''' THEN
    v_sql := v_sql || '' AND h.module_name = '''''' || :moduleName || '''''''''';
  END IF;
  IF :lineType IS NOT NULL AND :lineType != '''' THEN
    v_sql := v_sql || '' AND l.line_type = '''''' || :lineType || '''''''''';
  END IF;
  IF :accountingClass IS NOT NULL AND :accountingClass != '''' THEN
    v_sql := v_sql || '' AND l.accounting_class = '''''' || :accountingClass || '''''''''';
  END IF;
  IF :accountCombination IS NOT NULL AND :accountCombination != '''' THEN
    v_sql := v_sql || '' AND UPPER(l.account_combination) LIKE ''''%'' || UPPER(:accountCombination) || ''%'''''';
  END IF;
  IF :sourceNumber IS NOT NULL AND :sourceNumber != '''' THEN
    v_sql := v_sql || '' AND UPPER(h.source_number) LIKE ''''%'' || UPPER(:sourceNumber) || ''%'''''';
  END IF;
  IF :dateFrom IS NOT NULL AND :dateFrom != '''' THEN
    v_sql := v_sql || '' AND h.accounting_date >= TO_DATE('''''' || :dateFrom || '''''', ''''YYYY-MM-DD'''')'';
  END IF;
  IF :dateTo IS NOT NULL AND :dateTo != '''' THEN
    v_sql := v_sql || '' AND h.accounting_date <= TO_DATE('''''' || :dateTo || '''''', ''''YYYY-MM-DD'''')'';
  END IF;

  v_sql := v_sql || '' ORDER BY h.accounting_date DESC, l.header_id DESC, l.line_number ASC'';
  v_sql := v_sql || '' FETCH FIRST '' || NVL(TO_NUMBER(:limit), 500) || '' ROWS ONLY'';

  OPEN v_cur FOR v_sql;
  LOOP
    FETCH v_cur INTO
      v_line_id, v_header_id, v_line_num, v_line_type, v_acct_class,
      v_account, v_ent_dr, v_ent_cr, v_acc_dr, v_acc_cr,
      v_currency, v_desc, v_src_number, v_src_table,
      v_acct_date, v_acct_status, v_bu, v_le, v_module, v_party_type;
    EXIT WHEN v_cur%NOTFOUND;

    v_result := v_result || v_sep ||
      ''{"lineId":'' || jnum(v_line_id) ||
      '',"headerId":'' || jnum(v_header_id) ||
      '',"lineNumber":'' || jnum(v_line_num) ||
      '',"lineType":'' || jstr(v_line_type) ||
      '',"accountingClass":'' || jstr(v_acct_class) ||
      '',"accountCombination":'' || jstr(v_account) ||
      '',"enteredDr":'' || jnum(v_ent_dr) ||
      '',"enteredCr":'' || jnum(v_ent_cr) ||
      '',"accountedDr":'' || jnum(v_acc_dr) ||
      '',"accountedCr":'' || jnum(v_acc_cr) ||
      '',"currencyCode":'' || jstr(v_currency) ||
      '',"description":'' || jstr(v_desc) ||
      '',"sourceNumber":'' || jstr(v_src_number) ||
      '',"sourceTable":'' || jstr(v_src_table) ||
      '',"accountingDate":'' || jstr(v_acct_date) ||
      '',"accountingStatus":'' || jstr(v_acct_status) ||
      '',"businessUnit":'' || jstr(v_bu) ||
      '',"legalEntity":'' || jstr(v_le) ||
      '',"moduleName":'' || jstr(v_module) ||
      '',"partyType":'' || jstr(v_party_type) ||
      ''}'';
    v_sep := '','';
  END LOOP;
  CLOSE v_cur;

  v_result := v_result || '']}'';
  :status_code := 200;
  OWA_UTIL.MIME_HEADER(''application/json'', TRUE);
  HTP.PRN(v_result);
EXCEPTION
  WHEN OTHERS THEN
    :status_code := 500;
    OWA_UTIL.MIME_HEADER(''application/json'', TRUE);
    HTP.PRN(''{"error":true,"message":"'' || REPLACE(SQLERRM,''"'',''\\"'') || ''"}'' );
END;'
    );
    COMMIT;
END;
/


-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
SELECT t.uri_template, h.method, SUBSTR(h.source, 1, 60) source_preview
FROM   user_ords_modules m
JOIN   user_ords_templates t ON m.id = t.module_id
JOIN   user_ords_handlers  h ON t.id = h.template_id
WHERE  m.name = 'reerp'
AND    t.uri_template LIKE 'sla/journals%'
ORDER BY t.uri_template, h.method;
