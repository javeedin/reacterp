-- ============================================================
-- FIX: APEX REST Handler for GET /gl/journals/:id/lines
-- Uses plain column names (no quoted aliases) to avoid ORA-00907
-- ORDS will return keys as lowercase with underscores, e.g. entered_dr
-- ============================================================
BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'gl',
        p_pattern     => 'journals/:id/lines',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => 'Get journal lines by header ID'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'gl',
        p_pattern        => 'journals/:id/lines',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 0,
        p_mimes_allowed  => NULL,
        p_comments       => 'Get journal lines for a specific GL header',
        p_source         => 'SELECT LINE_ID, JE_LINE_NUMBER, JE_HEADER_ID, ACCOUNT_COMBINATION, DESCRIPTION, ENTERED_DR, ENTERED_CR, ACCOUNTED_DR, ACCOUNTED_CR, CURRENCY_CODE FROM RR_GL_LINES_ALL WHERE JE_HEADER_ID = :id'
    );
    COMMIT;
END;
/
