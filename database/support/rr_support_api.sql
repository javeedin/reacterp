-- ============================================================
-- RR SUPPORT API — APEX ORDS REST HANDLERS
-- Register these as plsql/block handlers under module: reerp
--   GET  /support/tickets         → list tickets
--   POST /support/tickets         → create ticket
--   GET  /support/tickets/:id     → get ticket detail
--   POST /support/update          → update / close ticket
--   GET  /support/dashboard       → stats for dashboard
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- GET /support/tickets
-- Bind params: :status, :module, :priority, :date_from,
--              :date_to, :search, :row_limit, :status_code
-- ────────────────────────────────────────────────────────────
DECLARE
    v_status    VARCHAR2(30) := :status;
    v_module    VARCHAR2(100):= :module;
    v_priority  VARCHAR2(20) := :priority;
    v_from      VARCHAR2(30) := :date_from;
    v_to        VARCHAR2(30) := :date_to;
    v_search    VARCHAR2(200):= :search;
    v_limit     NUMBER       := NVL(TO_NUMBER(:row_limit), 200);
    v_offset    NUMBER       := NVL(TO_NUMBER(:offset), 0);

    v_clob  CLOB;
    v_first BOOLEAN := TRUE;
    v_total NUMBER  := 0;
    l_pos   INTEGER;
    l_len   INTEGER;
    l_chunk VARCHAR2(32767);

    CURSOR c_tickets IS
        SELECT t.TICKET_ID, t.TICKET_NUMBER, t.TITLE, t.MODULE,
               t.PAGE_NAME, t.PAGE_URL, t.FEATURE,
               t.PRIORITY, t.STATUS, t.ASSIGNED_TO,
               t.CREATED_BY, t.CREATION_DATE,
               t.LAST_UPDATED_BY, t.LAST_UPDATE_DATE,
               t.RESOLVED_BY, t.RESOLUTION_DATE,
               (SELECT COUNT(*) FROM RR_SUPPORT_TICKET_LINES l WHERE l.TICKET_ID = t.TICKET_ID) AS LINE_COUNT,
               (SELECT COUNT(*) FROM RR_SUPPORT_TICKET_ATTACHMENTS a WHERE a.TICKET_ID = t.TICKET_ID) AS ATTACH_COUNT
        FROM   RR_SUPPORT_TICKETS t
        WHERE  (v_status   IS NULL OR t.STATUS   = v_status)
        AND    (v_module    IS NULL OR t.MODULE   = v_module)
        AND    (v_priority  IS NULL OR t.PRIORITY = v_priority)
        AND    (v_from      IS NULL OR t.CREATION_DATE >= v_from)
        AND    (v_to        IS NULL OR t.CREATION_DATE <= v_to || ' 23:59:59')
        AND    (v_search    IS NULL OR UPPER(t.TITLE) LIKE '%' || UPPER(v_search) || '%'
                                   OR UPPER(t.TICKET_NUMBER) LIKE '%' || UPPER(v_search) || '%')
        ORDER  BY t.TICKET_ID DESC
        OFFSET v_offset ROWS FETCH NEXT v_limit ROWS ONLY;

    r c_tickets%ROWTYPE;

    FUNCTION js(p IN VARCHAR2) RETURN VARCHAR2 IS
        v VARCHAR2(32767) := p;
    BEGIN
        IF v IS NULL THEN RETURN '""'; END IF;
        v := REPLACE(v, '\',  '\\');
        v := REPLACE(v, '"',  '\"');
        v := REPLACE(v, CHR(9),  '\t');
        v := REPLACE(v, CHR(10), '\n');
        v := REPLACE(v, CHR(13), '\r');
        v := REGEXP_REPLACE(v, '[[:cntrl:]]', '');
        RETURN '"' || v || '"';
    END js;
BEGIN
    SELECT COUNT(*)
    INTO   v_total
    FROM   RR_SUPPORT_TICKETS t
    WHERE  (v_status   IS NULL OR t.STATUS   = v_status)
    AND    (v_module    IS NULL OR t.MODULE   = v_module)
    AND    (v_priority  IS NULL OR t.PRIORITY = v_priority)
    AND    (v_from      IS NULL OR t.CREATION_DATE >= v_from)
    AND    (v_to        IS NULL OR t.CREATION_DATE <= v_to || ' 23:59:59')
    AND    (v_search    IS NULL OR UPPER(t.TITLE) LIKE '%' || UPPER(v_search) || '%'
                                OR UPPER(t.TICKET_NUMBER) LIKE '%' || UPPER(v_search) || '%');

    DBMS_LOB.CREATETEMPORARY(v_clob, TRUE);
    DBMS_LOB.APPEND(v_clob, TO_CLOB('{"status":"success","total":' || v_total || ',"items":['));
    OPEN c_tickets;
    LOOP
        FETCH c_tickets INTO r; EXIT WHEN c_tickets%NOTFOUND;
        IF NOT v_first THEN DBMS_LOB.APPEND(v_clob, TO_CLOB(',')); END IF;
        v_first := FALSE;
        DBMS_LOB.APPEND(v_clob, TO_CLOB(
            '{"ticketId":'       || r.TICKET_ID    || ','
         || '"ticketNumber":'    || js(r.TICKET_NUMBER)  || ','
         || '"title":'           || js(r.TITLE)          || ','
         || '"module":'          || js(r.MODULE)         || ','
         || '"pageName":'        || js(r.PAGE_NAME)      || ','
         || '"pageUrl":'         || js(r.PAGE_URL)       || ','
         || '"feature":'         || js(r.FEATURE)        || ','
         || '"priority":'        || js(r.PRIORITY)       || ','
         || '"status":'          || js(r.STATUS)         || ','
         || '"assignedTo":'      || js(r.ASSIGNED_TO)    || ','
         || '"createdBy":'       || js(r.CREATED_BY)     || ','
         || '"creationDate":'    || js(r.CREATION_DATE)  || ','
         || '"lastUpdatedBy":'   || js(r.LAST_UPDATED_BY)|| ','
         || '"lastUpdateDate":'  || js(r.LAST_UPDATE_DATE)||','
         || '"resolvedBy":'      || js(r.RESOLVED_BY)    || ','
         || '"resolutionDate":'  || js(r.RESOLUTION_DATE)|| ','
         || '"lineCount":'       || NVL(r.LINE_COUNT, 0) || ','
         || '"attachCount":'     || NVL(r.ATTACH_COUNT,0)|| '}'
        ));
    END LOOP;
    CLOSE c_tickets;
    DBMS_LOB.APPEND(v_clob, TO_CLOB(']}'));
    :status_code := 200;
    l_len := DBMS_LOB.GETLENGTH(v_clob);
    l_pos := 1;
    WHILE l_pos <= l_len LOOP
        l_chunk := DBMS_LOB.SUBSTR(v_clob, 32767, l_pos);
        HTP.PRN(l_chunk);
        l_pos := l_pos + 32767;
    END LOOP;
    DBMS_LOB.FREETEMPORARY(v_clob);
EXCEPTION
    WHEN OTHERS THEN
        :status_code := 500;
        HTP.P('{"status":"error","message":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;

-- ────────────────────────────────────────────────────────────
-- POST /support/tickets
-- Body JSON: { title, description, module, pageName, pageUrl,
--   feature, priority, createdBy,
--   lines: [{lineType, description}],
--   attachments: [{fileName, fileType, fileSize, data}] }
-- ────────────────────────────────────────────────────────────
DECLARE
    j           CLOB := :body_text;
    v_ticket_id NUMBER;
    v_line_id   NUMBER;
    v_title     VARCHAR2(500);
    v_desc      CLOB;
    v_module    VARCHAR2(100);
    v_page      VARCHAR2(200);
    v_url       VARCHAR2(500);
    v_feature   VARCHAR2(200);
    v_priority  VARCHAR2(20) := 'MEDIUM';
    v_created   VARCHAR2(100) := 'ERP_USER';

    -- simple key extractor for VARCHAR2 values
    FUNCTION get_str(p_json CLOB, p_key VARCHAR2) RETURN VARCHAR2 IS
        v_start PLS_INTEGER;
        v_end   PLS_INTEGER;
        v_pat   VARCHAR2(100) := '"' || p_key || '"\s*:\s*"';
    BEGIN
        v_start := REGEXP_INSTR(p_json, v_pat, 1, 1, 1);
        IF v_start = 0 THEN RETURN NULL; END IF;
        v_end := INSTR(p_json, '"', v_start);
        IF v_end = 0 THEN RETURN NULL; END IF;
        RETURN SUBSTR(p_json, v_start, v_end - v_start);
    EXCEPTION WHEN OTHERS THEN RETURN NULL;
    END get_str;

    -- count array elements (naive: count top-level { inside array value)
    FUNCTION arr_count(p_json CLOB, p_key VARCHAR2) RETURN NUMBER IS
        v_arr_start PLS_INTEGER;
        v_arr_end   PLS_INTEGER;
        v_arr       CLOB;
        v_cnt       NUMBER := 0;
        v_pos       PLS_INTEGER := 1;
        v_depth     NUMBER := 0;
        v_ch        VARCHAR2(1);
    BEGIN
        v_arr_start := INSTR(p_json, '"' || p_key || '"');
        IF v_arr_start = 0 THEN RETURN 0; END IF;
        v_arr_start := INSTR(p_json, '[', v_arr_start);
        IF v_arr_start = 0 THEN RETURN 0; END IF;
        -- find matching ]
        v_pos := v_arr_start;
        LOOP
            v_ch := DBMS_LOB.SUBSTR(p_json, 1, v_pos);
            IF v_ch = '[' OR v_ch = '{' THEN v_depth := v_depth + 1;
            ELSIF v_ch = ']' OR v_ch = '}' THEN
                v_depth := v_depth - 1;
                IF v_depth = 0 AND v_ch = ']' THEN v_arr_end := v_pos; EXIT; END IF;
            END IF;
            v_pos := v_pos + 1;
            IF v_pos > DBMS_LOB.GETLENGTH(p_json) THEN EXIT; END IF;
        END LOOP;
        -- count top-level { in slice
        v_arr := DBMS_LOB.SUBSTR(p_json, v_arr_end - v_arr_start - 1, v_arr_start + 1);
        v_depth := 0; v_pos := 1;
        FOR i IN 1..NVL(LENGTH(v_arr), 0) LOOP
            v_ch := SUBSTR(v_arr, i, 1);
            IF v_ch = '{' THEN
                IF v_depth = 0 THEN v_cnt := v_cnt + 1; END IF;
                v_depth := v_depth + 1;
            ELSIF v_ch = '}' THEN v_depth := v_depth - 1;
            END IF;
        END LOOP;
        RETURN v_cnt;
    EXCEPTION WHEN OTHERS THEN RETURN 0;
    END arr_count;

    -- Get n-th object string from a JSON array (1-based)
    FUNCTION get_arr_obj(p_json CLOB, p_key VARCHAR2, p_n NUMBER) RETURN VARCHAR2 IS
        v_arr_start PLS_INTEGER;
        v_pos       PLS_INTEGER;
        v_depth     NUMBER := 0;
        v_cnt       NUMBER := 0;
        v_obj_start PLS_INTEGER;
        v_ch        VARCHAR2(1);
    BEGIN
        v_arr_start := INSTR(p_json, '"' || p_key || '"');
        IF v_arr_start = 0 THEN RETURN '{}'; END IF;
        v_arr_start := INSTR(p_json, '[', v_arr_start);
        IF v_arr_start = 0 THEN RETURN '{}'; END IF;
        v_pos := v_arr_start + 1;
        LOOP
            EXIT WHEN v_pos > DBMS_LOB.GETLENGTH(p_json);
            v_ch := DBMS_LOB.SUBSTR(p_json, 1, v_pos);
            IF v_ch = '{' THEN
                IF v_depth = 0 THEN
                    v_cnt := v_cnt + 1;
                    IF v_cnt = p_n THEN v_obj_start := v_pos; END IF;
                END IF;
                v_depth := v_depth + 1;
            ELSIF v_ch = '}' THEN
                v_depth := v_depth - 1;
                IF v_depth = 0 AND v_cnt = p_n THEN
                    RETURN SUBSTR(DBMS_LOB.SUBSTR(p_json, v_pos - v_obj_start + 1, v_obj_start), 1, 32767);
                END IF;
            END IF;
            v_pos := v_pos + 1;
        END LOOP;
        RETURN '{}';
    EXCEPTION WHEN OTHERS THEN RETURN '{}';
    END get_arr_obj;

BEGIN
    -- Parse header fields
    v_title    := get_str(j, 'title');
    v_module   := get_str(j, 'module');
    v_page     := get_str(j, 'pageName');
    v_url      := get_str(j, 'pageUrl');
    v_feature  := get_str(j, 'feature');
    v_priority := NVL(get_str(j, 'priority'), 'MEDIUM');
    v_created  := NVL(get_str(j, 'createdBy'), 'ERP_USER');
    -- description may be multiline — pull via APEX_JSON or raw search
    DECLARE
        v_d_start PLS_INTEGER;
        v_d_end   PLS_INTEGER;
    BEGIN
        v_d_start := REGEXP_INSTR(j, '"description"\s*:\s*"', 1, 1, 1);
        IF v_d_start > 0 THEN
            v_d_end := v_d_start;
            LOOP
                v_d_end := INSTR(j, '"', v_d_end + 1);
                EXIT WHEN v_d_end = 0;
                -- check if preceded by even number of backslashes (not escaped)
                DECLARE cnt NUMBER := 0; p PLS_INTEGER := v_d_end - 1;
                BEGIN
                    WHILE p >= 1 AND DBMS_LOB.SUBSTR(j, 1, p) = '\' LOOP cnt := cnt + 1; p := p - 1; END LOOP;
                    EXIT WHEN MOD(cnt, 2) = 0;
                END;
            END LOOP;
            IF v_d_end > 0 THEN
                DBMS_LOB.CREATETEMPORARY(v_desc, TRUE);
                DBMS_LOB.COPY(v_desc, j, v_d_end - v_d_start, 1, v_d_start);
            END IF;
        END IF;
    END;

    INSERT INTO RR_SUPPORT_TICKETS (
        TITLE, DESCRIPTION, MODULE, PAGE_NAME, PAGE_URL, FEATURE,
        PRIORITY, STATUS, CREATED_BY, LAST_UPDATED_BY
    ) VALUES (
        v_title, v_desc, v_module, v_page, v_url, v_feature,
        v_priority, 'OPEN', v_created, v_created
    ) RETURNING TICKET_ID INTO v_ticket_id;

    -- Insert lines
    DECLARE
        v_ln_count NUMBER := arr_count(j, 'lines');
        v_obj      VARCHAR2(32767);
        v_lt       VARCHAR2(20);
        v_ld       VARCHAR2(4000);
    BEGIN
        FOR i IN 1..v_ln_count LOOP
            v_obj := get_arr_obj(j, 'lines', i);
            v_lt  := NVL(get_str(TO_CLOB(v_obj), 'lineType'), 'ISSUE');
            v_ld  := get_str(TO_CLOB(v_obj), 'description');
            IF v_ld IS NOT NULL THEN
                INSERT INTO RR_SUPPORT_TICKET_LINES (TICKET_ID, LINE_TYPE, DESCRIPTION, CREATED_BY)
                VALUES (v_ticket_id, v_lt, v_ld, v_created)
                RETURNING LINE_ID INTO v_line_id;
            END IF;
        END LOOP;
    END;

    -- Insert attachments
    DECLARE
        v_at_count NUMBER := arr_count(j, 'attachments');
        v_obj      VARCHAR2(32767);
        v_fname    VARCHAR2(500);
        v_ftype    VARCHAR2(100);
        v_fsize    NUMBER;
        v_data_start PLS_INTEGER;
        v_data_end   PLS_INTEGER;
        v_data       CLOB;
    BEGIN
        FOR i IN 1..v_at_count LOOP
            v_obj   := get_arr_obj(j, 'attachments', i);
            v_fname := get_str(TO_CLOB(v_obj), 'fileName');
            v_ftype := get_str(TO_CLOB(v_obj), 'fileType');
            v_fsize := TO_NUMBER(get_str(TO_CLOB(v_obj), 'fileSize'));
            -- pull data field from main json at position of this attachment
            -- simple: search for the data value starting after "fileSize":NNN
            INSERT INTO RR_SUPPORT_TICKET_ATTACHMENTS (
                TICKET_ID, FILE_NAME, FILE_TYPE, FILE_SIZE,
                ATTACHMENT_DATA, CREATED_BY
            ) VALUES (
                v_ticket_id, v_fname, v_ftype, v_fsize,
                get_str(TO_CLOB(v_obj), 'data'), v_created
            );
        END LOOP;
    END;

    COMMIT;
    :status_code := 200;
    HTP.P('{"status":"success","ticketId":' || v_ticket_id
       || ',"ticketNumber":"TKT-' || TO_CHAR(SYSDATE, 'YYYY') || '-'
       || LPAD(RR_SUPPORT_TICKET_SEQ.CURRVAL, 6, '0') || '"}');
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        :status_code := 500;
        HTP.P('{"status":"error","message":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;

-- ────────────────────────────────────────────────────────────
-- GET /support/tickets/:id
-- Returns full ticket with lines and attachments (no binary data, just metadata)
-- ────────────────────────────────────────────────────────────
DECLARE
    v_id  NUMBER := TO_NUMBER(:id);
    v_clob CLOB;
    l_pos INTEGER; l_len INTEGER; l_chunk VARCHAR2(32767);

    FUNCTION js(p IN VARCHAR2) RETURN VARCHAR2 IS
        v VARCHAR2(32767) := p;
    BEGIN
        IF v IS NULL THEN RETURN '""'; END IF;
        v := REPLACE(v, '\',  '\\'); v := REPLACE(v, '"',  '\"');
        v := REPLACE(v, CHR(9), '\t'); v := REPLACE(v, CHR(10), '\n'); v := REPLACE(v, CHR(13), '\r');
        v := REGEXP_REPLACE(v, '[[:cntrl:]]', '');
        RETURN '"' || v || '"';
    END js;
BEGIN
    DBMS_LOB.CREATETEMPORARY(v_clob, TRUE);

    -- Header
    FOR r IN (SELECT * FROM RR_SUPPORT_TICKETS WHERE TICKET_ID = v_id) LOOP
        DBMS_LOB.APPEND(v_clob, TO_CLOB(
            '{"status":"success","ticket":{'
         || '"ticketId":'       || r.TICKET_ID    || ','
         || '"ticketNumber":'   || js(r.TICKET_NUMBER) || ','
         || '"title":'          || js(r.TITLE)         || ','
         || '"module":'         || js(r.MODULE)        || ','
         || '"pageName":'       || js(r.PAGE_NAME)     || ','
         || '"pageUrl":'        || js(r.PAGE_URL)      || ','
         || '"feature":'        || js(r.FEATURE)       || ','
         || '"priority":'       || js(r.PRIORITY)      || ','
         || '"status":'         || js(r.STATUS)        || ','
         || '"assignedTo":'     || js(r.ASSIGNED_TO)   || ','
         || '"resolvedBy":'     || js(r.RESOLVED_BY)   || ','
         || '"resolutionDate":' || js(r.RESOLUTION_DATE)||','
         || '"createdBy":'      || js(r.CREATED_BY)    || ','
         || '"creationDate":'   || js(r.CREATION_DATE) || ','
         || '"lastUpdatedBy":'  || js(r.LAST_UPDATED_BY)||','
         || '"lastUpdateDate":' || js(r.LAST_UPDATE_DATE)||','
         || '"description":'    || js(DBMS_LOB.SUBSTR(r.DESCRIPTION, 4000, 1)) || ','
         || '"resolutionNotes":'|| js(DBMS_LOB.SUBSTR(r.RESOLUTION_NOTES, 4000, 1))
        ));
    END LOOP;

    -- Lines
    DBMS_LOB.APPEND(v_clob, TO_CLOB(',"lines":['));
    DECLARE v_first BOOLEAN := TRUE;
    BEGIN
        FOR r IN (SELECT * FROM RR_SUPPORT_TICKET_LINES WHERE TICKET_ID = v_id ORDER BY LINE_NUMBER) LOOP
            IF NOT v_first THEN DBMS_LOB.APPEND(v_clob, TO_CLOB(',')); END IF;
            v_first := FALSE;
            DBMS_LOB.APPEND(v_clob, TO_CLOB(
                '{"lineId":'     || r.LINE_ID     || ','
             || '"lineNumber":'  || r.LINE_NUMBER  || ','
             || '"lineType":'    || js(r.LINE_TYPE) || ','
             || '"description":' || js(DBMS_LOB.SUBSTR(r.DESCRIPTION, 4000, 1)) || ','
             || '"createdBy":'   || js(r.CREATED_BY)   || ','
             || '"creationDate":'|| js(r.CREATION_DATE) || '}'
            ));
        END LOOP;
    END;
    DBMS_LOB.APPEND(v_clob, TO_CLOB(']'));

    -- Attachments (metadata + data for inline preview)
    DBMS_LOB.APPEND(v_clob, TO_CLOB(',"attachments":['));
    DECLARE v_first BOOLEAN := TRUE;
    BEGIN
        FOR r IN (SELECT ATTACHMENT_ID, TICKET_ID, LINE_ID, FILE_NAME, FILE_TYPE,
                         FILE_SIZE, CREATED_BY, CREATION_DATE,
                         DBMS_LOB.SUBSTR(ATTACHMENT_DATA, 4000, 1) AS DATA_PREVIEW
                  FROM RR_SUPPORT_TICKET_ATTACHMENTS WHERE TICKET_ID = v_id ORDER BY ATTACHMENT_ID) LOOP
            IF NOT v_first THEN DBMS_LOB.APPEND(v_clob, TO_CLOB(',')); END IF;
            v_first := FALSE;
            DBMS_LOB.APPEND(v_clob, TO_CLOB(
                '{"attachmentId":' || r.ATTACHMENT_ID || ','
             || '"fileName":'  || js(r.FILE_NAME)   || ','
             || '"fileType":'  || js(r.FILE_TYPE)   || ','
             || '"fileSize":'  || NVL(r.FILE_SIZE, 0) || ','
             || '"createdBy":' || js(r.CREATED_BY)  || ','
             || '"creationDate":'|| js(r.CREATION_DATE) || ','
             || '"data":'      || js(r.DATA_PREVIEW) || '}'
            ));
        END LOOP;
    END;
    DBMS_LOB.APPEND(v_clob, TO_CLOB(']}}'));

    :status_code := 200;
    l_len := DBMS_LOB.GETLENGTH(v_clob);
    l_pos := 1;
    WHILE l_pos <= l_len LOOP
        l_chunk := DBMS_LOB.SUBSTR(v_clob, 32767, l_pos);
        HTP.PRN(l_chunk);
        l_pos := l_pos + 32767;
    END LOOP;
    DBMS_LOB.FREETEMPORARY(v_clob);
EXCEPTION
    WHEN OTHERS THEN
        :status_code := 500;
        HTP.P('{"status":"error","message":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;

-- ────────────────────────────────────────────────────────────
-- POST /support/update
-- Body: { ticketId, action, updatedBy, comment?,
--         resolutionNotes?, assignedTo?, status? }
-- action: 'comment' | 'resolve' | 'close' | 'reopen' | 'assign'
-- ────────────────────────────────────────────────────────────
DECLARE
    j          CLOB := :body_text;
    v_id       NUMBER;
    v_action   VARCHAR2(20);
    v_user     VARCHAR2(100);
    v_comment  VARCHAR2(4000);
    v_notes    VARCHAR2(4000);
    v_assign   VARCHAR2(100);
    v_status   VARCHAR2(20);

    FUNCTION gs(p_json CLOB, p_key VARCHAR2) RETURN VARCHAR2 IS
        v_start PLS_INTEGER;
        v_end   PLS_INTEGER;
    BEGIN
        v_start := REGEXP_INSTR(p_json, '"' || p_key || '"\s*:\s*"', 1, 1, 1);
        IF v_start = 0 THEN RETURN NULL; END IF;
        v_end := INSTR(p_json, '"', v_start);
        RETURN SUBSTR(p_json, v_start, v_end - v_start);
    EXCEPTION WHEN OTHERS THEN RETURN NULL;
    END gs;

    FUNCTION gn(p_json CLOB, p_key VARCHAR2) RETURN NUMBER IS
        v_start PLS_INTEGER;
        v_end   PLS_INTEGER;
    BEGIN
        v_start := REGEXP_INSTR(p_json, '"' || p_key || '"\s*:\s*', 1, 1, 1);
        IF v_start = 0 THEN RETURN NULL; END IF;
        v_end   := REGEXP_INSTR(p_json, '[,}\]]', v_start);
        RETURN TO_NUMBER(TRIM(SUBSTR(p_json, v_start, v_end - v_start)));
    EXCEPTION WHEN OTHERS THEN RETURN NULL;
    END gn;
BEGIN
    v_id     := gn(j, 'ticketId');
    v_action := gs(j, 'action');
    v_user   := NVL(gs(j, 'updatedBy'), 'ERP_USER');
    v_comment:= gs(j, 'comment');
    v_notes  := gs(j, 'resolutionNotes');
    v_assign := gs(j, 'assignedTo');
    v_status := gs(j, 'status');

    IF v_action = 'comment' THEN
        INSERT INTO RR_SUPPORT_TICKET_LINES (TICKET_ID, LINE_TYPE, DESCRIPTION, CREATED_BY)
        VALUES (v_id, 'COMMENT', v_comment, v_user);
        UPDATE RR_SUPPORT_TICKETS
        SET    LAST_UPDATED_BY = v_user, LAST_UPDATE_DATE = TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS')
        WHERE  TICKET_ID = v_id;

    ELSIF v_action = 'resolve' THEN
        INSERT INTO RR_SUPPORT_TICKET_LINES (TICKET_ID, LINE_TYPE, DESCRIPTION, CREATED_BY)
        VALUES (v_id, 'RESOLUTION', NVL(v_notes, 'Issue resolved.'), v_user);
        UPDATE RR_SUPPORT_TICKETS
        SET    STATUS = 'RESOLVED', RESOLVED_BY = v_user,
               RESOLUTION_DATE = TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS'),
               RESOLUTION_NOTES = v_notes,
               LAST_UPDATED_BY = v_user, LAST_UPDATE_DATE = TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS')
        WHERE  TICKET_ID = v_id;

    ELSIF v_action = 'close' THEN
        UPDATE RR_SUPPORT_TICKETS
        SET    STATUS = 'CLOSED', LAST_UPDATED_BY = v_user,
               LAST_UPDATE_DATE = TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS')
        WHERE  TICKET_ID = v_id;

    ELSIF v_action = 'reopen' THEN
        UPDATE RR_SUPPORT_TICKETS
        SET    STATUS = 'OPEN', LAST_UPDATED_BY = v_user,
               LAST_UPDATE_DATE = TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS')
        WHERE  TICKET_ID = v_id;

    ELSIF v_action = 'assign' THEN
        UPDATE RR_SUPPORT_TICKETS
        SET    ASSIGNED_TO = v_assign, STATUS = 'IN_PROGRESS',
               LAST_UPDATED_BY = v_user, LAST_UPDATE_DATE = TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS')
        WHERE  TICKET_ID = v_id;

    ELSIF v_action = 'status' THEN
        UPDATE RR_SUPPORT_TICKETS
        SET    STATUS = v_status, LAST_UPDATED_BY = v_user,
               LAST_UPDATE_DATE = TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS')
        WHERE  TICKET_ID = v_id;
    END IF;

    COMMIT;
    :status_code := 200;
    HTP.P('{"status":"success","ticketId":' || v_id || '}');
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        :status_code := 500;
        HTP.P('{"status":"error","message":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;

-- ────────────────────────────────────────────────────────────
-- GET /support/dashboard
-- Returns counts by status, by module, by priority, recent 10
-- ────────────────────────────────────────────────────────────
DECLARE
    v_clob CLOB;
    l_pos INTEGER; l_len INTEGER; l_chunk VARCHAR2(32767);
    v_open  NUMBER := 0; v_inprog NUMBER := 0; v_res NUMBER := 0; v_closed NUMBER := 0;
    v_first BOOLEAN;

    FUNCTION js(p IN VARCHAR2) RETURN VARCHAR2 IS
        v VARCHAR2(32767) := p;
    BEGIN
        IF v IS NULL THEN RETURN '""'; END IF;
        v := REPLACE(v, '\', '\\'); v := REPLACE(v, '"', '\"');
        v := REGEXP_REPLACE(v, '[[:cntrl:]]', '');
        RETURN '"' || v || '"';
    END js;
BEGIN
    SELECT SUM(CASE WHEN STATUS = 'OPEN'        THEN 1 ELSE 0 END),
           SUM(CASE WHEN STATUS = 'IN_PROGRESS' THEN 1 ELSE 0 END),
           SUM(CASE WHEN STATUS = 'RESOLVED'    THEN 1 ELSE 0 END),
           SUM(CASE WHEN STATUS = 'CLOSED'      THEN 1 ELSE 0 END)
    INTO   v_open, v_inprog, v_res, v_closed
    FROM   RR_SUPPORT_TICKETS;

    DBMS_LOB.CREATETEMPORARY(v_clob, TRUE);
    DBMS_LOB.APPEND(v_clob, TO_CLOB(
        '{"status":"success",'
     || '"summary":{"open":' || v_open || ',"inProgress":' || v_inprog
     || ',"resolved":' || v_res || ',"closed":' || v_closed || '}'
    ));

    -- By module
    DBMS_LOB.APPEND(v_clob, TO_CLOB(',"byModule":['));
    v_first := TRUE;
    FOR r IN (SELECT MODULE, COUNT(*) AS CNT FROM RR_SUPPORT_TICKETS
              WHERE MODULE IS NOT NULL GROUP BY MODULE ORDER BY CNT DESC) LOOP
        IF NOT v_first THEN DBMS_LOB.APPEND(v_clob, TO_CLOB(',')); END IF;
        v_first := FALSE;
        DBMS_LOB.APPEND(v_clob, TO_CLOB('{"module":' || js(r.MODULE) || ',"count":' || r.CNT || '}'));
    END LOOP;
    DBMS_LOB.APPEND(v_clob, TO_CLOB(']'));

    -- By priority
    DBMS_LOB.APPEND(v_clob, TO_CLOB(',"byPriority":['));
    v_first := TRUE;
    FOR r IN (SELECT PRIORITY, COUNT(*) AS CNT FROM RR_SUPPORT_TICKETS
              GROUP BY PRIORITY ORDER BY CNT DESC) LOOP
        IF NOT v_first THEN DBMS_LOB.APPEND(v_clob, TO_CLOB(',')); END IF;
        v_first := FALSE;
        DBMS_LOB.APPEND(v_clob, TO_CLOB('{"priority":' || js(r.PRIORITY) || ',"count":' || r.CNT || '}'));
    END LOOP;
    DBMS_LOB.APPEND(v_clob, TO_CLOB(']'));

    -- Recent 10 open/in-progress tickets
    DBMS_LOB.APPEND(v_clob, TO_CLOB(',"recentOpen":['));
    v_first := TRUE;
    FOR r IN (SELECT TICKET_ID, TICKET_NUMBER, TITLE, MODULE, PRIORITY, STATUS,
                     CREATED_BY, CREATION_DATE
              FROM   RR_SUPPORT_TICKETS
              WHERE  STATUS IN ('OPEN','IN_PROGRESS')
              ORDER  BY TICKET_ID DESC FETCH FIRST 10 ROWS ONLY) LOOP
        IF NOT v_first THEN DBMS_LOB.APPEND(v_clob, TO_CLOB(',')); END IF;
        v_first := FALSE;
        DBMS_LOB.APPEND(v_clob, TO_CLOB(
            '{"ticketId":'    || r.TICKET_ID   || ','
         || '"ticketNumber":' || js(r.TICKET_NUMBER) || ','
         || '"title":'        || js(r.TITLE)         || ','
         || '"module":'       || js(r.MODULE)        || ','
         || '"priority":'     || js(r.PRIORITY)      || ','
         || '"status":'       || js(r.STATUS)        || ','
         || '"createdBy":'    || js(r.CREATED_BY)    || ','
         || '"creationDate":' || js(r.CREATION_DATE) || '}'
        ));
    END LOOP;
    DBMS_LOB.APPEND(v_clob, TO_CLOB(']}'));

    :status_code := 200;
    l_len := DBMS_LOB.GETLENGTH(v_clob);
    l_pos := 1;
    WHILE l_pos <= l_len LOOP
        l_chunk := DBMS_LOB.SUBSTR(v_clob, 32767, l_pos);
        HTP.PRN(l_chunk);
        l_pos := l_pos + 32767;
    END LOOP;
    DBMS_LOB.FREETEMPORARY(v_clob);
EXCEPTION
    WHEN OTHERS THEN
        :status_code := 500;
        HTP.P('{"status":"error","message":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;
