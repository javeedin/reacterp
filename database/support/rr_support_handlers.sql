-- ============================================================
-- APEX ORDS REST Handler blocks
-- Module  : reerp
-- Package : RR_SUPPORT_PKG
--
-- Each handler:
--   1. Sets Content-Type to application/json
--   2. Delegates to the package procedure
--   3. Catches any unexpected errors and returns a JSON error
--
-- Bind variables provided by ORDS:
--   IN  : URL params by name, :body_text (POST body as CLOB)
--   OUT : :status_code (HTTP status), :content_type
-- ============================================================


-- ============================================================
-- GET /support/tickets
-- Query params: status, module, priority, date_from, date_to,
--               search, created_by, row_limit, offset
-- Success  → 200 { status:"success", total:N, items:[...] }
-- No data  → 200 { status:"success", total:0, items:[] }
-- Error    → 500 { status:"error", code:500, message:"..." }
-- ============================================================
DECLARE
    v_status_code NUMBER := 500;
BEGIN
    :content_type := 'application/json; charset=utf-8';

    RR_SUPPORT_PKG.GET_TICKETS(
        p_status      => :status,
        p_module      => :module,
        p_priority    => :priority,
        p_date_from   => :date_from,
        p_date_to     => :date_to,
        p_search      => :search,
        p_created_by  => :created_by,
        p_limit       => NVL(TO_NUMBER(:row_limit), 200),
        p_offset      => NVL(TO_NUMBER(:offset),    0),
        p_status_code => v_status_code
    );

    :status_code := v_status_code;
EXCEPTION
    WHEN OTHERS THEN
        :status_code := 500;
        HTP.P('{"status":"error","code":500,"message":"'
              || REPLACE(SQLERRM, '"', '\"') || '"}');
END;


-- ============================================================
-- POST /support/tickets
-- Body    : JSON object (see RR_SUPPORT_PKG.CREATE_TICKET)
-- Success → 200 { status:"success", ticketId:N, ticketNumber:"TKT-..." }
-- Validation error → 400 { status:"error", code:400, message:"..." }
-- Server error     → 500 { status:"error", code:500, message:"..." }
-- ============================================================
DECLARE
    v_status_code NUMBER := 500;
BEGIN
    :content_type := 'application/json; charset=utf-8';

    -- Basic request validation
    IF :body_text IS NULL OR DBMS_LOB.GETLENGTH(:body_text) = 0 THEN
        :status_code := 400;
        HTP.P('{"status":"error","code":400,"message":"Request body is empty"}');
        RETURN;
    END IF;

    IF JSON_VALUE(:body_text, '$.title') IS NULL THEN
        :status_code := 400;
        HTP.P('{"status":"error","code":400,"message":"Field ''title'' is required"}');
        RETURN;
    END IF;

    RR_SUPPORT_PKG.CREATE_TICKET(
        p_body        => :body_text,
        p_status_code => v_status_code
    );

    :status_code := v_status_code;
EXCEPTION
    WHEN OTHERS THEN
        :status_code := 500;
        HTP.P('{"status":"error","code":500,"message":"'
              || REPLACE(SQLERRM, '"', '\"') || '"}');
END;


-- ============================================================
-- GET /support/tickets/:id
-- URL param: id  (numeric ticket ID)
-- Success   → 200 { status:"success", ticket:{...}, lines:[...], attachments:[...] }
-- Not found → 404 { status:"error", code:404, message:"Ticket not found" }
-- Bad param → 400 { status:"error", code:400, message:"..." }
-- Server error → 500
-- ============================================================
DECLARE
    v_ticket_id   NUMBER;
    v_status_code NUMBER := 500;
BEGIN
    :content_type := 'application/json; charset=utf-8';

    -- Validate the :id parameter
    BEGIN
        v_ticket_id := TO_NUMBER(:id);
    EXCEPTION
        WHEN VALUE_ERROR THEN
            :status_code := 400;
            HTP.P('{"status":"error","code":400,"message":"Invalid ticket ID — must be a number"}');
            RETURN;
    END;

    IF v_ticket_id IS NULL OR v_ticket_id <= 0 THEN
        :status_code := 400;
        HTP.P('{"status":"error","code":400,"message":"Ticket ID is required and must be positive"}');
        RETURN;
    END IF;

    RR_SUPPORT_PKG.GET_TICKET_DETAIL(
        p_ticket_id   => v_ticket_id,
        p_status_code => v_status_code
    );

    :status_code := v_status_code;
EXCEPTION
    WHEN OTHERS THEN
        :status_code := 500;
        HTP.P('{"status":"error","code":500,"message":"'
              || REPLACE(SQLERRM, '"', '\"') || '"}');
END;


-- ============================================================
-- POST /support/update
-- Body     : { ticketId, action, updatedBy, comment?,
--              resolutionNotes?, assignedTo?, status? }
-- Actions  : comment | resolve | close | reopen | assign | status
-- Success  → 200 { status:"success", ticketId:N, action:"...", message:"..." }
-- Validation error → 400
-- Server error     → 500
-- ============================================================
DECLARE
    v_ticket_id   NUMBER;
    v_action      VARCHAR2(20);
    v_status_code NUMBER := 500;
BEGIN
    :content_type := 'application/json; charset=utf-8';

    -- Validate required fields
    IF :body_text IS NULL OR DBMS_LOB.GETLENGTH(:body_text) = 0 THEN
        :status_code := 400;
        HTP.P('{"status":"error","code":400,"message":"Request body is empty"}');
        RETURN;
    END IF;

    v_ticket_id := JSON_VALUE(:body_text, '$.ticketId' RETURNING NUMBER);
    v_action    := JSON_VALUE(:body_text, '$.action');

    IF v_ticket_id IS NULL THEN
        :status_code := 400;
        HTP.P('{"status":"error","code":400,"message":"Field ''ticketId'' is required"}');
        RETURN;
    END IF;

    IF v_action IS NULL THEN
        :status_code := 400;
        HTP.P('{"status":"error","code":400,"message":"Field ''action'' is required"}');
        RETURN;
    END IF;

    IF v_action NOT IN ('comment','resolve','close','reopen','assign','status') THEN
        :status_code := 400;
        HTP.P('{"status":"error","code":400,"message":"Invalid action: ' || v_action
              || '. Valid values: comment, resolve, close, reopen, assign, status"}');
        RETURN;
    END IF;

    -- Action-specific validation
    IF v_action = 'comment'
       AND JSON_VALUE(:body_text, '$.comment') IS NULL THEN
        :status_code := 400;
        HTP.P('{"status":"error","code":400,"message":"Field ''comment'' is required for action=comment"}');
        RETURN;
    END IF;

    IF v_action = 'resolve'
       AND JSON_VALUE(:body_text, '$.resolutionNotes') IS NULL THEN
        :status_code := 400;
        HTP.P('{"status":"error","code":400,"message":"Field ''resolutionNotes'' is required for action=resolve"}');
        RETURN;
    END IF;

    IF v_action = 'assign'
       AND JSON_VALUE(:body_text, '$.assignedTo') IS NULL THEN
        :status_code := 400;
        HTP.P('{"status":"error","code":400,"message":"Field ''assignedTo'' is required for action=assign"}');
        RETURN;
    END IF;

    RR_SUPPORT_PKG.UPDATE_TICKET(
        p_body        => :body_text,
        p_status_code => v_status_code
    );

    :status_code := v_status_code;
EXCEPTION
    WHEN OTHERS THEN
        :status_code := 500;
        HTP.P('{"status":"error","code":500,"message":"'
              || REPLACE(SQLERRM, '"', '\"') || '"}');
END;


-- ============================================================
-- GET /support/dashboard
-- No params required
-- Success → 200 { status:"success", summary:{...},
--                 byModule:[...], byPriority:[...], recentOpen:[...] }
-- Error   → 500 { status:"error", code:500, message:"..." }
-- ============================================================
DECLARE
    v_status_code NUMBER := 500;
BEGIN
    :content_type := 'application/json; charset=utf-8';

    RR_SUPPORT_PKG.GET_DASHBOARD(
        p_status_code => v_status_code
    );

    :status_code := v_status_code;
EXCEPTION
    WHEN OTHERS THEN
        :status_code := 500;
        HTP.P('{"status":"error","code":500,"message":"'
              || REPLACE(SQLERRM, '"', '\"') || '"}');
END;
