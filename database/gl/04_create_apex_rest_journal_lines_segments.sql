-- ============================================================
-- APEX REST Handler for GL Journal Lines with Segments
-- GET endpoint to query V_GL_JOURNAL_LINES_SEGMENTS
-- For Account Analysis feature
-- ============================================================

-- NOTE: Run this in APEX SQL Workshop or via ORDS REST Service setup
-- Endpoint: GET /ords/bcldifc/reerp/gl/journallinesegments

BEGIN
    -- Create Template for GL Journal Lines Segments
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/journallinesegments',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_etag_query     => NULL,
        p_comments       => 'GL Journal Lines with Segments endpoint for Account Analysis'
    );

    -- Create GET Handler with query parameters
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/journallinesegments',
        p_method         => 'GET',
        p_source_type    => 'plsql/block',
        p_items_per_page => 0,
        p_mimes_allowed  => NULL,
        p_comments       => 'Get GL Journal Lines with Segments - supports period and ledger filtering',
        p_source         => q'[
DECLARE
    v_ledger_name       VARCHAR2(240) := :ledger_name;
    v_period_names      VARCHAR2(4000) := :period_names;  -- Comma-separated list of periods
    v_company           VARCHAR2(25) := :company;
    v_lob               VARCHAR2(25) := :lob;
    v_department        VARCHAR2(25) := :department;
    v_account           VARCHAR2(25) := :account;
    v_sub_account       VARCHAR2(25) := :sub_account;
    v_analysis          VARCHAR2(25) := :analysis;
    v_intercompany      VARCHAR2(25) := :intercompany;
    v_je_source         VARCHAR2(240) := :je_source;
    v_je_category       VARCHAR2(240) := :je_category;
    v_page_size         NUMBER := NVL(:page_size, 500);
    v_page_number       NUMBER := NVL(:page_number, 1);
    v_offset            NUMBER;
    v_total_count       NUMBER := 0;

BEGIN
    v_offset := (v_page_number - 1) * v_page_size;

    -- Start JSON response
    APEX_JSON.OPEN_OBJECT;

    -- Get total count first
    SELECT COUNT(*) INTO v_total_count
    FROM V_GL_JOURNAL_LINES_SEGMENTS jls
    WHERE (v_ledger_name IS NULL OR jls.LEDGER_NAME = v_ledger_name)
      AND (v_period_names IS NULL OR jls.DEFAULT_PERIOD_NAME IN (
           SELECT TRIM(REGEXP_SUBSTR(v_period_names, '[^,]+', 1, LEVEL))
           FROM DUAL
           CONNECT BY REGEXP_SUBSTR(v_period_names, '[^,]+', 1, LEVEL) IS NOT NULL
      ))
      AND (v_company IS NULL OR jls.COMPANY = v_company)
      AND (v_lob IS NULL OR jls.LOB = v_lob)
      AND (v_department IS NULL OR jls.DEPARTMENT = v_department)
      AND (v_account IS NULL OR jls.ACCOUNT = v_account)
      AND (v_sub_account IS NULL OR jls.SUB_ACCOUNT = v_sub_account)
      AND (v_analysis IS NULL OR jls.ANALYSIS = v_analysis)
      AND (v_intercompany IS NULL OR jls.INTERCOMPANY = v_intercompany)
      AND (v_je_source IS NULL OR jls.USER_JE_SOURCE_NAME = v_je_source)
      AND (v_je_category IS NULL OR jls.USER_JE_CATEGORY_NAME = v_je_category);

    APEX_JSON.WRITE('totalCount', v_total_count);
    APEX_JSON.WRITE('pageSize', v_page_size);
    APEX_JSON.WRITE('pageNumber', v_page_number);
    APEX_JSON.WRITE('totalPages', CEIL(v_total_count / v_page_size));

    -- Open items array
    APEX_JSON.OPEN_ARRAY('items');

    -- Loop through results
    FOR rec IN (
        SELECT
            BATCH_ID,
            JE_HEADER_ID,
            JE_LINE_NUMBER,
            CURRENCY_CODE,
            COMPANY,
            LOB,
            DEPARTMENT,
            ACCOUNT,
            SUB_ACCOUNT,
            ANALYSIS,
            INTERCOMPANY,
            FUTURE1,
            FUTURE2,
            ENTERED_DR,
            ENTERED_CR,
            ACCOUNTED_DR,
            ACCOUNTED_CR,
            CHART_OF_ACCOUNTS_NAME,
            DEFAULT_PERIOD_NAME,
            BATCH_NAME,
            ACTUAL_FLAG_MEANING,
            APPROVAL_STATUS_MEANING,
            USER_PERIOD_SET_NAME,
            USER_JE_SOURCE_NAME,
            LEDGER_NAME,
            LEGAL_ENTITY_NAME,
            USER_JE_CATEGORY_NAME
        FROM V_GL_JOURNAL_LINES_SEGMENTS jls
        WHERE (v_ledger_name IS NULL OR jls.LEDGER_NAME = v_ledger_name)
          AND (v_period_names IS NULL OR jls.DEFAULT_PERIOD_NAME IN (
               SELECT TRIM(REGEXP_SUBSTR(v_period_names, '[^,]+', 1, LEVEL))
               FROM DUAL
               CONNECT BY REGEXP_SUBSTR(v_period_names, '[^,]+', 1, LEVEL) IS NOT NULL
          ))
          AND (v_company IS NULL OR jls.COMPANY = v_company)
          AND (v_lob IS NULL OR jls.LOB = v_lob)
          AND (v_department IS NULL OR jls.DEPARTMENT = v_department)
          AND (v_account IS NULL OR jls.ACCOUNT = v_account)
          AND (v_sub_account IS NULL OR jls.SUB_ACCOUNT = v_sub_account)
          AND (v_analysis IS NULL OR jls.ANALYSIS = v_analysis)
          AND (v_intercompany IS NULL OR jls.INTERCOMPANY = v_intercompany)
          AND (v_je_source IS NULL OR jls.USER_JE_SOURCE_NAME = v_je_source)
          AND (v_je_category IS NULL OR jls.USER_JE_CATEGORY_NAME = v_je_category)
        ORDER BY jls.DEFAULT_PERIOD_NAME, jls.BATCH_NAME, jls.JE_LINE_NUMBER
        OFFSET v_offset ROWS FETCH NEXT v_page_size ROWS ONLY
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('batchId', rec.BATCH_ID);
        APEX_JSON.WRITE('jeHeaderId', rec.JE_HEADER_ID);
        APEX_JSON.WRITE('jeLineNumber', rec.JE_LINE_NUMBER);
        APEX_JSON.WRITE('currencyCode', rec.CURRENCY_CODE);
        APEX_JSON.WRITE('company', rec.COMPANY);
        APEX_JSON.WRITE('lob', rec.LOB);
        APEX_JSON.WRITE('department', rec.DEPARTMENT);
        APEX_JSON.WRITE('account', rec.ACCOUNT);
        APEX_JSON.WRITE('subAccount', rec.SUB_ACCOUNT);
        APEX_JSON.WRITE('analysis', rec.ANALYSIS);
        APEX_JSON.WRITE('intercompany', rec.INTERCOMPANY);
        APEX_JSON.WRITE('future1', rec.FUTURE1);
        APEX_JSON.WRITE('future2', rec.FUTURE2);
        APEX_JSON.WRITE('enteredDr', rec.ENTERED_DR);
        APEX_JSON.WRITE('enteredCr', rec.ENTERED_CR);
        APEX_JSON.WRITE('accountedDr', rec.ACCOUNTED_DR);
        APEX_JSON.WRITE('accountedCr', rec.ACCOUNTED_CR);
        APEX_JSON.WRITE('chartOfAccountsName', rec.CHART_OF_ACCOUNTS_NAME);
        APEX_JSON.WRITE('defaultPeriodName', rec.DEFAULT_PERIOD_NAME);
        APEX_JSON.WRITE('batchName', rec.BATCH_NAME);
        APEX_JSON.WRITE('actualFlagMeaning', rec.ACTUAL_FLAG_MEANING);
        APEX_JSON.WRITE('approvalStatusMeaning', rec.APPROVAL_STATUS_MEANING);
        APEX_JSON.WRITE('userPeriodSetName', rec.USER_PERIOD_SET_NAME);
        APEX_JSON.WRITE('userJeSourceName', rec.USER_JE_SOURCE_NAME);
        APEX_JSON.WRITE('ledgerName', rec.LEDGER_NAME);
        APEX_JSON.WRITE('legalEntityName', rec.LEGAL_ENTITY_NAME);
        APEX_JSON.WRITE('userJeCategoryName', rec.USER_JE_CATEGORY_NAME);
        APEX_JSON.CLOSE_OBJECT;
    END LOOP;

    -- Close items array
    APEX_JSON.CLOSE_ARRAY;

    -- Close main object
    APEX_JSON.CLOSE_OBJECT;

    :status_code := 200;

EXCEPTION
    WHEN OTHERS THEN
        :status_code := 500;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('error', SQLERRM);
        APEX_JSON.CLOSE_OBJECT;
END;
]'
    );

    -- Create GET Handler for distinct periods (for dropdown)
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/journallinesegments/periods',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_etag_query     => NULL,
        p_comments       => 'Get distinct periods for filter dropdown'
    );

    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/journallinesegments/periods',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 100,
        p_mimes_allowed  => NULL,
        p_comments       => 'Get distinct periods',
        p_source         => q'[
SELECT DISTINCT
    DEFAULT_PERIOD_NAME as "periodName",
    USER_PERIOD_SET_NAME as "periodSetName"
FROM V_GL_JOURNAL_LINES_SEGMENTS
WHERE DEFAULT_PERIOD_NAME IS NOT NULL
ORDER BY DEFAULT_PERIOD_NAME DESC
]'
    );

    -- Create GET Handler for distinct ledgers (for dropdown)
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/journallinesegments/ledgers',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_etag_query     => NULL,
        p_comments       => 'Get distinct ledgers for filter dropdown'
    );

    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/journallinesegments/ledgers',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 100,
        p_mimes_allowed  => NULL,
        p_comments       => 'Get distinct ledgers',
        p_source         => q'[
SELECT DISTINCT
    LEDGER_NAME as "ledgerName",
    LEGAL_ENTITY_NAME as "legalEntityName"
FROM V_GL_JOURNAL_LINES_SEGMENTS
WHERE LEDGER_NAME IS NOT NULL
ORDER BY LEDGER_NAME
]'
    );

    -- Create GET Handler for distinct segment values (for filter dropdowns)
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/journallinesegments/segments',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_etag_query     => NULL,
        p_comments       => 'Get distinct segment values for filter dropdowns'
    );

    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/journallinesegments/segments',
        p_method         => 'GET',
        p_source_type    => 'plsql/block',
        p_items_per_page => 0,
        p_mimes_allowed  => NULL,
        p_comments       => 'Get distinct segment values',
        p_source         => q'[
BEGIN
    APEX_JSON.OPEN_OBJECT;

    -- Company values
    APEX_JSON.OPEN_ARRAY('company');
    FOR rec IN (SELECT DISTINCT COMPANY FROM V_GL_JOURNAL_LINES_SEGMENTS WHERE COMPANY IS NOT NULL ORDER BY COMPANY) LOOP
        APEX_JSON.WRITE(rec.COMPANY);
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;

    -- LOB values
    APEX_JSON.OPEN_ARRAY('lob');
    FOR rec IN (SELECT DISTINCT LOB FROM V_GL_JOURNAL_LINES_SEGMENTS WHERE LOB IS NOT NULL ORDER BY LOB) LOOP
        APEX_JSON.WRITE(rec.LOB);
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;

    -- Department values
    APEX_JSON.OPEN_ARRAY('department');
    FOR rec IN (SELECT DISTINCT DEPARTMENT FROM V_GL_JOURNAL_LINES_SEGMENTS WHERE DEPARTMENT IS NOT NULL ORDER BY DEPARTMENT) LOOP
        APEX_JSON.WRITE(rec.DEPARTMENT);
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;

    -- Account values
    APEX_JSON.OPEN_ARRAY('account');
    FOR rec IN (SELECT DISTINCT ACCOUNT FROM V_GL_JOURNAL_LINES_SEGMENTS WHERE ACCOUNT IS NOT NULL ORDER BY ACCOUNT) LOOP
        APEX_JSON.WRITE(rec.ACCOUNT);
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;

    -- Sub Account values
    APEX_JSON.OPEN_ARRAY('subAccount');
    FOR rec IN (SELECT DISTINCT SUB_ACCOUNT FROM V_GL_JOURNAL_LINES_SEGMENTS WHERE SUB_ACCOUNT IS NOT NULL ORDER BY SUB_ACCOUNT) LOOP
        APEX_JSON.WRITE(rec.SUB_ACCOUNT);
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;

    -- Analysis values
    APEX_JSON.OPEN_ARRAY('analysis');
    FOR rec IN (SELECT DISTINCT ANALYSIS FROM V_GL_JOURNAL_LINES_SEGMENTS WHERE ANALYSIS IS NOT NULL ORDER BY ANALYSIS) LOOP
        APEX_JSON.WRITE(rec.ANALYSIS);
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;

    -- Intercompany values
    APEX_JSON.OPEN_ARRAY('intercompany');
    FOR rec IN (SELECT DISTINCT INTERCOMPANY FROM V_GL_JOURNAL_LINES_SEGMENTS WHERE INTERCOMPANY IS NOT NULL ORDER BY INTERCOMPANY) LOOP
        APEX_JSON.WRITE(rec.INTERCOMPANY);
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;

    -- JE Sources
    APEX_JSON.OPEN_ARRAY('jeSources');
    FOR rec IN (SELECT DISTINCT USER_JE_SOURCE_NAME FROM V_GL_JOURNAL_LINES_SEGMENTS WHERE USER_JE_SOURCE_NAME IS NOT NULL ORDER BY USER_JE_SOURCE_NAME) LOOP
        APEX_JSON.WRITE(rec.USER_JE_SOURCE_NAME);
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;

    -- JE Categories
    APEX_JSON.OPEN_ARRAY('jeCategories');
    FOR rec IN (SELECT DISTINCT USER_JE_CATEGORY_NAME FROM V_GL_JOURNAL_LINES_SEGMENTS WHERE USER_JE_CATEGORY_NAME IS NOT NULL ORDER BY USER_JE_CATEGORY_NAME) LOOP
        APEX_JSON.WRITE(rec.USER_JE_CATEGORY_NAME);
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;

    APEX_JSON.CLOSE_OBJECT;

    :status_code := 200;
EXCEPTION
    WHEN OTHERS THEN
        :status_code := 500;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('error', SQLERRM);
        APEX_JSON.CLOSE_OBJECT;
END;
]'
    );

    -- Create GET Handler for Account Analysis Pivot Data
    ORDS.DEFINE_TEMPLATE(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/accountanalysis/pivot',
        p_priority       => 0,
        p_etag_type      => 'HASH',
        p_etag_query     => NULL,
        p_comments       => 'Get pivot data for account analysis'
    );

    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'gl/accountanalysis/pivot',
        p_method         => 'GET',
        p_source_type    => 'plsql/block',
        p_items_per_page => 0,
        p_mimes_allowed  => NULL,
        p_comments       => 'Get account analysis pivot data by periods',
        p_source         => q'[
DECLARE
    v_ledger_name       VARCHAR2(240) := :ledger_name;
    v_period_names      VARCHAR2(4000) := :period_names;  -- Comma-separated periods
    v_company           VARCHAR2(25) := :company;
    v_lob               VARCHAR2(25) := :lob;
    v_department        VARCHAR2(25) := :department;
    v_account           VARCHAR2(25) := :account;
    v_sub_account       VARCHAR2(25) := :sub_account;
    v_analysis          VARCHAR2(25) := :analysis;
    v_intercompany      VARCHAR2(25) := :intercompany;

BEGIN
    APEX_JSON.OPEN_OBJECT;

    -- Return periods array
    APEX_JSON.OPEN_ARRAY('periods');
    FOR rec IN (
        SELECT TRIM(REGEXP_SUBSTR(v_period_names, '[^,]+', 1, LEVEL)) AS period_name
        FROM DUAL
        WHERE v_period_names IS NOT NULL
        CONNECT BY REGEXP_SUBSTR(v_period_names, '[^,]+', 1, LEVEL) IS NOT NULL
    ) LOOP
        APEX_JSON.WRITE(rec.period_name);
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;

    -- Build pivot data
    APEX_JSON.OPEN_ARRAY('data');

    FOR rec IN (
        SELECT
            COMPANY,
            LOB,
            DEPARTMENT,
            ACCOUNT,
            SUB_ACCOUNT,
            ANALYSIS,
            INTERCOMPANY,
            COMPANY || '-' || LOB || '-' || DEPARTMENT || '-' || ACCOUNT || '-' || SUB_ACCOUNT || '-' || ANALYSIS || '-' || INTERCOMPANY AS CONCATENATED_SEGMENTS,
            DEFAULT_PERIOD_NAME,
            SUM(NVL(ACCOUNTED_DR, 0) - NVL(ACCOUNTED_CR, 0)) AS NET_AMOUNT
        FROM V_GL_JOURNAL_LINES_SEGMENTS
        WHERE (v_ledger_name IS NULL OR LEDGER_NAME = v_ledger_name)
          AND (v_period_names IS NULL OR DEFAULT_PERIOD_NAME IN (
               SELECT TRIM(REGEXP_SUBSTR(v_period_names, '[^,]+', 1, LEVEL))
               FROM DUAL
               CONNECT BY REGEXP_SUBSTR(v_period_names, '[^,]+', 1, LEVEL) IS NOT NULL
          ))
          AND (v_company IS NULL OR COMPANY = v_company)
          AND (v_lob IS NULL OR LOB = v_lob)
          AND (v_department IS NULL OR DEPARTMENT = v_department)
          AND (v_account IS NULL OR ACCOUNT = v_account)
          AND (v_sub_account IS NULL OR SUB_ACCOUNT = v_sub_account)
          AND (v_analysis IS NULL OR ANALYSIS = v_analysis)
          AND (v_intercompany IS NULL OR INTERCOMPANY = v_intercompany)
        GROUP BY
            COMPANY, LOB, DEPARTMENT, ACCOUNT, SUB_ACCOUNT, ANALYSIS, INTERCOMPANY,
            DEFAULT_PERIOD_NAME
        ORDER BY COMPANY, LOB, DEPARTMENT, ACCOUNT, SUB_ACCOUNT, ANALYSIS, INTERCOMPANY, DEFAULT_PERIOD_NAME
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('company', rec.COMPANY);
        APEX_JSON.WRITE('lob', rec.LOB);
        APEX_JSON.WRITE('department', rec.DEPARTMENT);
        APEX_JSON.WRITE('account', rec.ACCOUNT);
        APEX_JSON.WRITE('subAccount', rec.SUB_ACCOUNT);
        APEX_JSON.WRITE('analysis', rec.ANALYSIS);
        APEX_JSON.WRITE('intercompany', rec.INTERCOMPANY);
        APEX_JSON.WRITE('concatenatedSegments', rec.CONCATENATED_SEGMENTS);
        APEX_JSON.WRITE('periodName', rec.DEFAULT_PERIOD_NAME);
        APEX_JSON.WRITE('netAmount', rec.NET_AMOUNT);
        APEX_JSON.CLOSE_OBJECT;
    END LOOP;

    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;

    :status_code := 200;

EXCEPTION
    WHEN OTHERS THEN
        :status_code := 500;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('error', SQLERRM);
        APEX_JSON.CLOSE_OBJECT;
END;
]'
    );

    COMMIT;
END;
/

-- ============================================================
-- Grant privileges (run as admin if needed)
-- ============================================================
-- GRANT SELECT ON V_GL_JOURNAL_LINES_SEGMENTS TO ORDS_PUBLIC_USER;
