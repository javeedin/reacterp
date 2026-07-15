-- ============================================================
-- PATCH 123: allow POSTING_STATUS = 'Suspended' on MPA schedule
--
-- The check constraint RR_AP_MPA_POST_CK originally allowed only
-- ('Not Posted','Posted','Error'). The Suspend feature sets
-- POSTING_STATUS = 'Suspended', which violated the constraint:
--   ORA-02290: check constraint (BCLDIFC.RR_AP_MPA_POST_CK) violated
--
-- Fix: drop and recreate the constraint including 'Suspended'.
--
-- HOW TO RUN: APEX SQL Workshop -> SQL Commands -> run the whole block.
-- ============================================================

BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE RR_AP_INVOICE_MULTIPERIOD_SCHEDULE DROP CONSTRAINT RR_AP_MPA_POST_CK';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -2443 THEN            -- constraint does not exist
            DBMS_OUTPUT.PUT_LINE('RR_AP_MPA_POST_CK did not exist — skipping drop.');
        ELSE RAISE;
        END IF;
END;
/

ALTER TABLE RR_AP_INVOICE_MULTIPERIOD_SCHEDULE
    ADD CONSTRAINT RR_AP_MPA_POST_CK
    CHECK (POSTING_STATUS IN ('Not Posted','Posted','Error','Suspended'));
/

-- Verify
SELECT constraint_name, search_condition
FROM   user_constraints
WHERE  constraint_name = 'RR_AP_MPA_POST_CK';
