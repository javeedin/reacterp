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
    v_segment1          VARCHAR2(25) := :segment1;
    v_segment2          VARCHAR2(25) := :segment2;
    v_segment3          VARCHAR2(25) := :segment3;
    v_segment4          VARCHAR2(25) := :segment4;
    v_segment5          VARCHAR2(25) := :segment5;
    v_account           VARCHAR2(25) := :account;  -- Account segment filter
    v_je_source         VARCHAR2(240) := :je_source;
    v_je_category       VARCHAR2(240) := :je_category;
    v_page_size         NUMBER := NVL(:page_size, 500);
    v_page_number       NUMBER := NVL(:page_number, 1);
    v_offset            NUMBER;

    v_cursor            SYS_REFCURSOR;
    v_json              CLOB;
    v_total_count       NUMBER := 0;

    TYPE t_record IS RECORD (
        JE_LINE_NUM                 NUMBER,
        JE_HEADER_ID                NUMBER,
        JE_BATCH_ID                 NUMBER,
        DEFAULT_PERIOD_NAME         VARCHAR2(15),
        BATCH_NAME                  VARCHAR2(100),
        JOURNAL_NAME                VARCHAR2(100),
        JOURNAL_DESCRIPTION         VARCHAR2(240),
        ACTUAL_FLAG_MEANING         VARCHAR2(80),
        APPROVAL_STATUS_MEANING     VARCHAR2(80),
        USER_PERIOD_SET_NAME        VARCHAR2(80),
        USER_JE_SOURCE_NAME         VARCHAR2(240),
        LEDGER_NAME                 VARCHAR2(30),
        LEGAL_ENTITY_NAME           VARCHAR2(240),
        USER_JE_CATEGORY_NAME       VARCHAR2(240),
        CURRENCY_CODE               VARCHAR2(15),
        ACCOUNTED_DR                NUMBER,
        ACCOUNTED_CR                NUMBER,
        ENTERED_DR                  NUMBER,
        ENTERED_CR                  NUMBER,
        SEGMENT1                    VARCHAR2(25),
        SEGMENT2                    VARCHAR2(25),
        SEGMENT3                    VARCHAR2(25),
        SEGMENT4                    VARCHAR2(25),
        SEGMENT5                    VARCHAR2(25),
        SEGMENT6                    VARCHAR2(25),
        SEGMENT7                    VARCHAR2(25),
        SEGMENT8                    VARCHAR2(25),
        SEGMENT9                    VARCHAR2(25),
        SEGMENT10                   VARCHAR2(25),
        CODE_COMBINATION_ID         NUMBER,
        CONCATENATED_SEGMENTS       VARCHAR2(500),
        DESCRIPTION                 VARCHAR2(240),
        LINE_DESCRIPTION            VARCHAR2(240),
        EFFECTIVE_DATE              DATE,
        CREATION_DATE               DATE
    );

    v_rec t_record;
    v_first BOOLEAN := TRUE;

BEGIN
    v_offset := (v_page_number - 1) * v_page_size;

    -- Start JSON response
    APEX_JSON.OPEN_OBJECT;

    -- Get total count first
    EXECUTE IMMEDIATE q'[
        SELECT COUNT(*)
        FROM V_GL_JOURNAL_LINES_SEGMENTS jls
        WHERE (:ledger_name IS NULL OR jls.LEDGER_NAME = :ledger_name)
          AND (:period_names IS NULL OR jls.DEFAULT_PERIOD_NAME IN (
               SELECT TRIM(REGEXP_SUBSTR(:period_names, '[^,]+', 1, LEVEL))
               FROM DUAL
               CONNECT BY REGEXP_SUBSTR(:period_names, '[^,]+', 1, LEVEL) IS NOT NULL
          ))
          AND (:segment1 IS NULL OR jls.SEGMENT1 = :segment1)
          AND (:segment2 IS NULL OR jls.SEGMENT2 = :segment2)
          AND (:segment3 IS NULL OR jls.SEGMENT3 = :segment3)
          AND (:segment4 IS NULL OR jls.SEGMENT4 = :segment4)
          AND (:segment5 IS NULL OR jls.SEGMENT5 = :segment5)
          AND (:account IS NULL OR jls.SEGMENT3 = :account)  -- Assuming SEGMENT3 is account
          AND (:je_source IS NULL OR jls.USER_JE_SOURCE_NAME = :je_source)
          AND (:je_category IS NULL OR jls.USER_JE_CATEGORY_NAME = :je_category)
    ]' INTO v_total_count
    USING v_ledger_name, v_ledger_name,
          v_period_names, v_period_names, v_period_names,
          v_segment1, v_segment1,
          v_segment2, v_segment2,
          v_segment3, v_segment3,
          v_segment4, v_segment4,
          v_segment5, v_segment5,
          v_account, v_account,
          v_je_source, v_je_source,
          v_je_category, v_je_category;

    APEX_JSON.WRITE('totalCount', v_total_count);
    APEX_JSON.WRITE('pageSize', v_page_size);
    APEX_JSON.WRITE('pageNumber', v_page_number);
    APEX_JSON.WRITE('totalPages', CEIL(v_total_count / v_page_size));

    -- Open items array
    APEX_JSON.OPEN_ARRAY('items');

    -- Open cursor with dynamic filtering
    OPEN v_cursor FOR
        SELECT
            JE_LINE_NUM,
            JE_HEADER_ID,
            JE_BATCH_ID,
            DEFAULT_PERIOD_NAME,
            BATCH_NAME,
            JOURNAL_NAME,
            JOURNAL_DESCRIPTION,
            ACTUAL_FLAG_MEANING,
            APPROVAL_STATUS_MEANING,
            USER_PERIOD_SET_NAME,
            USER_JE_SOURCE_NAME,
            LEDGER_NAME,
            LEGAL_ENTITY_NAME,
            USER_JE_CATEGORY_NAME,
            CURRENCY_CODE,
            ACCOUNTED_DR,
            ACCOUNTED_CR,
            ENTERED_DR,
            ENTERED_CR,
            SEGMENT1,
            SEGMENT2,
            SEGMENT3,
            SEGMENT4,
            SEGMENT5,
            SEGMENT6,
            SEGMENT7,
            SEGMENT8,
            SEGMENT9,
            SEGMENT10,
            CODE_COMBINATION_ID,
            CONCATENATED_SEGMENTS,
            DESCRIPTION,
            LINE_DESCRIPTION,
            EFFECTIVE_DATE,
            CREATION_DATE
        FROM V_GL_JOURNAL_LINES_SEGMENTS jls
        WHERE (v_ledger_name IS NULL OR jls.LEDGER_NAME = v_ledger_name)
          AND (v_period_names IS NULL OR jls.DEFAULT_PERIOD_NAME IN (
               SELECT TRIM(REGEXP_SUBSTR(v_period_names, '[^,]+', 1, LEVEL))
               FROM DUAL
               CONNECT BY REGEXP_SUBSTR(v_period_names, '[^,]+', 1, LEVEL) IS NOT NULL
          ))
          AND (v_segment1 IS NULL OR jls.SEGMENT1 = v_segment1)
          AND (v_segment2 IS NULL OR jls.SEGMENT2 = v_segment2)
          AND (v_segment3 IS NULL OR jls.SEGMENT3 = v_segment3)
          AND (v_segment4 IS NULL OR jls.SEGMENT4 = v_segment4)
          AND (v_segment5 IS NULL OR jls.SEGMENT5 = v_segment5)
          AND (v_account IS NULL OR jls.SEGMENT3 = v_account)
          AND (v_je_source IS NULL OR jls.USER_JE_SOURCE_NAME = v_je_source)
          AND (v_je_category IS NULL OR jls.USER_JE_CATEGORY_NAME = v_je_category)
        ORDER BY jls.DEFAULT_PERIOD_NAME, jls.BATCH_NAME, jls.JE_LINE_NUM
        OFFSET v_offset ROWS FETCH NEXT v_page_size ROWS ONLY;

    LOOP
        FETCH v_cursor INTO v_rec;
        EXIT WHEN v_cursor%NOTFOUND;

        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('jeLineNum', v_rec.JE_LINE_NUM);
        APEX_JSON.WRITE('jeHeaderId', v_rec.JE_HEADER_ID);
        APEX_JSON.WRITE('jeBatchId', v_rec.JE_BATCH_ID);
        APEX_JSON.WRITE('defaultPeriodName', v_rec.DEFAULT_PERIOD_NAME);
        APEX_JSON.WRITE('batchName', v_rec.BATCH_NAME);
        APEX_JSON.WRITE('journalName', v_rec.JOURNAL_NAME);
        APEX_JSON.WRITE('journalDescription', v_rec.JOURNAL_DESCRIPTION);
        APEX_JSON.WRITE('actualFlagMeaning', v_rec.ACTUAL_FLAG_MEANING);
        APEX_JSON.WRITE('approvalStatusMeaning', v_rec.APPROVAL_STATUS_MEANING);
        APEX_JSON.WRITE('userPeriodSetName', v_rec.USER_PERIOD_SET_NAME);
        APEX_JSON.WRITE('userJeSourceName', v_rec.USER_JE_SOURCE_NAME);
        APEX_JSON.WRITE('ledgerName', v_rec.LEDGER_NAME);
        APEX_JSON.WRITE('legalEntityName', v_rec.LEGAL_ENTITY_NAME);
        APEX_JSON.WRITE('userJeCategoryName', v_rec.USER_JE_CATEGORY_NAME);
        APEX_JSON.WRITE('currencyCode', v_rec.CURRENCY_CODE);
        APEX_JSON.WRITE('accountedDr', v_rec.ACCOUNTED_DR);
        APEX_JSON.WRITE('accountedCr', v_rec.ACCOUNTED_CR);
        APEX_JSON.WRITE('enteredDr', v_rec.ENTERED_DR);
        APEX_JSON.WRITE('enteredCr', v_rec.ENTERED_CR);
        APEX_JSON.WRITE('segment1', v_rec.SEGMENT1);
        APEX_JSON.WRITE('segment2', v_rec.SEGMENT2);
        APEX_JSON.WRITE('segment3', v_rec.SEGMENT3);
        APEX_JSON.WRITE('segment4', v_rec.SEGMENT4);
        APEX_JSON.WRITE('segment5', v_rec.SEGMENT5);
        APEX_JSON.WRITE('segment6', v_rec.SEGMENT6);
        APEX_JSON.WRITE('segment7', v_rec.SEGMENT7);
        APEX_JSON.WRITE('segment8', v_rec.SEGMENT8);
        APEX_JSON.WRITE('segment9', v_rec.SEGMENT9);
        APEX_JSON.WRITE('segment10', v_rec.SEGMENT10);
        APEX_JSON.WRITE('codeCombinationId', v_rec.CODE_COMBINATION_ID);
        APEX_JSON.WRITE('concatenatedSegments', v_rec.CONCATENATED_SEGMENTS);
        APEX_JSON.WRITE('description', v_rec.DESCRIPTION);
        APEX_JSON.WRITE('lineDescription', v_rec.LINE_DESCRIPTION);
        APEX_JSON.WRITE('effectiveDate', TO_CHAR(v_rec.EFFECTIVE_DATE, 'YYYY-MM-DD'));
        APEX_JSON.WRITE('creationDate', TO_CHAR(v_rec.CREATION_DATE, 'YYYY-MM-DD'));
        APEX_JSON.CLOSE_OBJECT;
    END LOOP;

    CLOSE v_cursor;

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

    -- Segment 1 values
    APEX_JSON.OPEN_ARRAY('segment1');
    FOR rec IN (SELECT DISTINCT SEGMENT1 FROM V_GL_JOURNAL_LINES_SEGMENTS WHERE SEGMENT1 IS NOT NULL ORDER BY SEGMENT1) LOOP
        APEX_JSON.WRITE(rec.SEGMENT1);
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;

    -- Segment 2 values
    APEX_JSON.OPEN_ARRAY('segment2');
    FOR rec IN (SELECT DISTINCT SEGMENT2 FROM V_GL_JOURNAL_LINES_SEGMENTS WHERE SEGMENT2 IS NOT NULL ORDER BY SEGMENT2) LOOP
        APEX_JSON.WRITE(rec.SEGMENT2);
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;

    -- Segment 3 values (typically Account)
    APEX_JSON.OPEN_ARRAY('segment3');
    FOR rec IN (SELECT DISTINCT SEGMENT3 FROM V_GL_JOURNAL_LINES_SEGMENTS WHERE SEGMENT3 IS NOT NULL ORDER BY SEGMENT3) LOOP
        APEX_JSON.WRITE(rec.SEGMENT3);
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;

    -- Segment 4 values
    APEX_JSON.OPEN_ARRAY('segment4');
    FOR rec IN (SELECT DISTINCT SEGMENT4 FROM V_GL_JOURNAL_LINES_SEGMENTS WHERE SEGMENT4 IS NOT NULL ORDER BY SEGMENT4) LOOP
        APEX_JSON.WRITE(rec.SEGMENT4);
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;

    -- Segment 5 values
    APEX_JSON.OPEN_ARRAY('segment5');
    FOR rec IN (SELECT DISTINCT SEGMENT5 FROM V_GL_JOURNAL_LINES_SEGMENTS WHERE SEGMENT5 IS NOT NULL ORDER BY SEGMENT5) LOOP
        APEX_JSON.WRITE(rec.SEGMENT5);
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
    v_segment1          VARCHAR2(25) := :segment1;
    v_segment2          VARCHAR2(25) := :segment2;
    v_segment3          VARCHAR2(25) := :segment3;
    v_segment4          VARCHAR2(25) := :segment4;
    v_segment5          VARCHAR2(25) := :segment5;
    v_group_by          VARCHAR2(100) := NVL(:group_by, 'SEGMENT3'); -- Default group by account

    TYPE t_period_list IS TABLE OF VARCHAR2(15);
    v_periods t_period_list := t_period_list();
    v_sql CLOB;
    v_pivot_cols CLOB := '';
    v_select_cols CLOB := '';
    v_cursor SYS_REFCURSOR;

BEGIN
    -- Parse period names into collection
    IF v_period_names IS NOT NULL THEN
        SELECT TRIM(REGEXP_SUBSTR(v_period_names, '[^,]+', 1, LEVEL))
        BULK COLLECT INTO v_periods
        FROM DUAL
        CONNECT BY REGEXP_SUBSTR(v_period_names, '[^,]+', 1, LEVEL) IS NOT NULL;
    END IF;

    APEX_JSON.OPEN_OBJECT;

    -- Return periods array
    APEX_JSON.OPEN_ARRAY('periods');
    FOR i IN 1..v_periods.COUNT LOOP
        APEX_JSON.WRITE(v_periods(i));
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;

    -- Build and execute pivot query
    APEX_JSON.OPEN_ARRAY('data');

    FOR rec IN (
        SELECT
            SEGMENT1,
            SEGMENT2,
            SEGMENT3,
            SEGMENT4,
            SEGMENT5,
            CONCATENATED_SEGMENTS,
            DESCRIPTION,
            DEFAULT_PERIOD_NAME,
            SUM(NVL(ACCOUNTED_DR, 0) - NVL(ACCOUNTED_CR, 0)) as NET_AMOUNT
        FROM V_GL_JOURNAL_LINES_SEGMENTS
        WHERE (v_ledger_name IS NULL OR LEDGER_NAME = v_ledger_name)
          AND (v_period_names IS NULL OR DEFAULT_PERIOD_NAME IN (
               SELECT TRIM(REGEXP_SUBSTR(v_period_names, '[^,]+', 1, LEVEL))
               FROM DUAL
               CONNECT BY REGEXP_SUBSTR(v_period_names, '[^,]+', 1, LEVEL) IS NOT NULL
          ))
          AND (v_segment1 IS NULL OR SEGMENT1 = v_segment1)
          AND (v_segment2 IS NULL OR SEGMENT2 = v_segment2)
          AND (v_segment3 IS NULL OR SEGMENT3 = v_segment3)
          AND (v_segment4 IS NULL OR SEGMENT4 = v_segment4)
          AND (v_segment5 IS NULL OR SEGMENT5 = v_segment5)
        GROUP BY
            SEGMENT1, SEGMENT2, SEGMENT3, SEGMENT4, SEGMENT5,
            CONCATENATED_SEGMENTS, DESCRIPTION, DEFAULT_PERIOD_NAME
        ORDER BY SEGMENT1, SEGMENT2, SEGMENT3, SEGMENT4, SEGMENT5, DEFAULT_PERIOD_NAME
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('segment1', rec.SEGMENT1);
        APEX_JSON.WRITE('segment2', rec.SEGMENT2);
        APEX_JSON.WRITE('segment3', rec.SEGMENT3);
        APEX_JSON.WRITE('segment4', rec.SEGMENT4);
        APEX_JSON.WRITE('segment5', rec.SEGMENT5);
        APEX_JSON.WRITE('concatenatedSegments', rec.CONCATENATED_SEGMENTS);
        APEX_JSON.WRITE('description', rec.DESCRIPTION);
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
