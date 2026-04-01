-- ============================================================
-- RR_SUPPORT  — Alter scripts (run once after initial install)
-- ============================================================

-- Add REPLY_TYPE to ticket lines to distinguish who commented:
--   USER    = ticket raiser (customer) reply
--   SUPPORT = support staff reply
ALTER TABLE RR_SUPPORT_TICKET_LINES
    ADD (REPLY_TYPE VARCHAR2(10) DEFAULT 'SUPPORT');

ALTER TABLE RR_SUPPORT_TICKET_LINES
    ADD CONSTRAINT RR_SUPP_LINES_RT_CHK
    CHECK (REPLY_TYPE IN ('USER','SUPPORT'));

-- ISSUE lines created at ticket creation should be USER
UPDATE RR_SUPPORT_TICKET_LINES SET REPLY_TYPE = 'USER' WHERE LINE_TYPE = 'ISSUE';

-- RESOLUTION lines are always SUPPORT
UPDATE RR_SUPPORT_TICKET_LINES SET REPLY_TYPE = 'SUPPORT' WHERE LINE_TYPE = 'RESOLUTION';

COMMIT;
