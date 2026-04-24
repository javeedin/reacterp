-- ============================================================
-- Fix: gl/journals/:id/lines ORDS handler
-- Switches source from RR_GL_JE_LINES_ALL to
-- V_GL_JOURNAL_LINES_SEGMENTS so Dr/Cr amounts are always present.
-- Description still comes from RR_GL_JE_LINES_ALL / RR_GL_JE_HEADERS.
-- Run this in APEX SQL Workshop.
-- ============================================================

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'gl',
        p_pattern        => 'journals/:id/lines',
        p_method         => 'GET',
        p_source_type    => 'plsql/block',
        p_items_per_page => 0,
        p_mimes_allowed  => NULL,
        p_comments       => 'Get all journal lines from view by JE_HEADER_ID',
        p_source         => q'[
DECLARE
    v_je_header_id NUMBER := TO_NUMBER(:id);
BEGIN
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.OPEN_ARRAY('items');

    FOR rec IN (
        SELECT
            jls.JE_LINE_NUMBER,
            jls.COMPANY || '-' || jls.LOB || '-' || jls.DEPARTMENT || '-' ||
            jls.ACCOUNT || '-' || jls.SUB_ACCOUNT || '-' ||
            jls.ANALYSIS || '-' || jls.INTERCOMPANY  AS ACCOUNT_COMBINATION,
            jls.ACCOUNT_DESCRIPTION,
            NVL(jls.ENTERED_DR,   0)   AS ENTERED_DR,
            NVL(jls.ENTERED_CR,   0)   AS ENTERED_CR,
            NVL(jls.ACCOUNTED_DR, 0)   AS ACCOUNTED_DR,
            NVL(jls.ACCOUNTED_CR, 0)   AS ACCOUNTED_CR,
            jls.CURRENCY_CODE,
            COALESCE(l.DESCRIPTION, h.JOURNAL_DESCRIPTION, h.JOURNAL_NAME) AS LINE_DESCRIPTION
        FROM V_GL_JOURNAL_LINES_SEGMENTS jls
        LEFT JOIN RR_GL_JE_LINES_ALL l
               ON l.JE_HEADER_ID  = jls.JE_HEADER_ID
              AND l.JE_LINE_NUMBER = jls.JE_LINE_NUMBER
        LEFT JOIN RR_GL_JE_HEADERS h
               ON h.JE_HEADER_ID  = jls.JE_HEADER_ID
        WHERE jls.JE_HEADER_ID = v_je_header_id
        ORDER BY jls.JE_LINE_NUMBER
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('lineNum',            rec.JE_LINE_NUMBER);
        APEX_JSON.WRITE('account',            rec.ACCOUNT_COMBINATION);
        APEX_JSON.WRITE('accountDescription', rec.ACCOUNT_DESCRIPTION);
        APEX_JSON.WRITE('description',        rec.LINE_DESCRIPTION);
        APEX_JSON.WRITE('enteredDr',          rec.ENTERED_DR);
        APEX_JSON.WRITE('enteredCr',          rec.ENTERED_CR);
        APEX_JSON.WRITE('accountedDr',        rec.ACCOUNTED_DR);
        APEX_JSON.WRITE('accountedCr',        rec.ACCOUNTED_CR);
        APEX_JSON.WRITE('currency',           rec.CURRENCY_CODE);
        APEX_JSON.CLOSE_OBJECT;
    END LOOP;

    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
    :status_code := 200;

EXCEPTION
    WHEN OTHERS THEN
        :status_code := 500;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('error', SQLERRM);
        APEX_JSON.CLOSE_OBJECT;
END;
]'
    );
    COMMIT;
END;
/
