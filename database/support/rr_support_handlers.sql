-- ============================================================
-- APEX REST Handler blocks — register under module: reerp
-- All heavy logic lives in RR_SUPPORT_PKG.
-- ============================================================

-- ── GET /support/tickets ─────────────────────────────────────
-- Bind params: :status  :module  :priority  :date_from  :date_to
--              :search  :row_limit  :offset  :status_code
BEGIN
    RR_SUPPORT_PKG.GET_TICKETS(
        p_status      => :status,
        p_module      => :module,
        p_priority    => :priority,
        p_date_from   => :date_from,
        p_date_to     => :date_to,
        p_search      => :search,
        p_limit       => NVL(TO_NUMBER(:row_limit), 200),
        p_offset      => NVL(TO_NUMBER(:offset),    0),
        p_status_code => :status_code
    );
END;

-- ── POST /support/tickets ────────────────────────────────────
-- Bind params: :body_text  :status_code
BEGIN
    RR_SUPPORT_PKG.CREATE_TICKET(
        p_body        => :body_text,
        p_status_code => :status_code
    );
END;

-- ── GET /support/tickets/:id ─────────────────────────────────
-- Bind params: :id  :status_code
BEGIN
    RR_SUPPORT_PKG.GET_TICKET_DETAIL(
        p_ticket_id   => TO_NUMBER(:id),
        p_status_code => :status_code
    );
END;

-- ── POST /support/update ─────────────────────────────────────
-- Bind params: :body_text  :status_code
BEGIN
    RR_SUPPORT_PKG.UPDATE_TICKET(
        p_body        => :body_text,
        p_status_code => :status_code
    );
END;

-- ── GET /support/dashboard ───────────────────────────────────
-- Bind params: :status_code
BEGIN
    RR_SUPPORT_PKG.GET_DASHBOARD(
        p_status_code => :status_code
    );
END;
