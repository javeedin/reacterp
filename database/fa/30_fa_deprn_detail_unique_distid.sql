-- ============================================================
-- 30_FA_DEPRN_DETAIL_UNIQUE_DISTID.SQL
--
-- ONE-TIME migration: give every RR_FA_DEPRN_DETAIL line a UNIQUE
-- DISTRIBUTION_ID from RR_FA_DISTRIBUTION_ID_SEQ.
--
-- WHY: bulk-loaded history reused the SAME DISTRIBUTION_ID across all of an
-- asset's periods (e.g. asset 2 -> distribution 2 on every period), so a
-- distribution id could not identify a single depreciation line. This assigns
-- a fresh sequence value to every row that currently shares its DISTRIBUTION_ID
-- with another row (already-unique rows are left untouched), and seeds a
-- matching RR_FA_DISTRIBUTION_HISTORY row for each new id so any FK stays valid.
--
-- SAFE TO RE-RUN: after it completes, no DISTRIBUTION_ID is duplicated, so the
-- WHERE ... HAVING COUNT(*) > 1 filter selects nothing on a second run.
--
-- HOW TO RUN: APEX SQL Workshop -> SQL Commands -> run the whole block.
-- ============================================================

SET SERVEROUTPUT ON

-- 1) Make sure the sequence's next value is ABOVE the highest existing id so a
--    freshly generated id can never collide with an untouched (unique) row.
DECLARE
    v_exists NUMBER;
    v_max    NUMBER;
    v_next   NUMBER;
    v_gap    NUMBER;
BEGIN
    SELECT NVL(MAX(DISTRIBUTION_ID), 0) INTO v_max FROM RR_FA_DEPRN_DETAIL;

    SELECT COUNT(*) INTO v_exists FROM USER_SEQUENCES WHERE SEQUENCE_NAME = 'RR_FA_DISTRIBUTION_ID_SEQ';
    IF v_exists = 0 THEN
        EXECUTE IMMEDIATE 'CREATE SEQUENCE RR_FA_DISTRIBUTION_ID_SEQ START WITH ' || (v_max + 1) || ' INCREMENT BY 1 NOCACHE';
        DBMS_OUTPUT.PUT_LINE('Created RR_FA_DISTRIBUTION_ID_SEQ starting at ' || (v_max + 1));
    ELSE
        EXECUTE IMMEDIATE 'SELECT RR_FA_DISTRIBUTION_ID_SEQ.NEXTVAL FROM DUAL' INTO v_next;
        IF v_next <= v_max THEN
            v_gap := v_max - v_next + 1;
            EXECUTE IMMEDIATE 'ALTER SEQUENCE RR_FA_DISTRIBUTION_ID_SEQ INCREMENT BY ' || v_gap;
            EXECUTE IMMEDIATE 'SELECT RR_FA_DISTRIBUTION_ID_SEQ.NEXTVAL FROM DUAL' INTO v_next;
            EXECUTE IMMEDIATE 'ALTER SEQUENCE RR_FA_DISTRIBUTION_ID_SEQ INCREMENT BY 1';
        END IF;
        DBMS_OUTPUT.PUT_LINE('Sequence next value is now above ' || v_max);
    END IF;
END;
/

-- 2) Reassign every detail row that shares its DISTRIBUTION_ID with another row,
--    seeding a matching distribution-history row for each new id.
DECLARE
    v_new NUMBER;
    v_cnt NUMBER := 0;
BEGIN
    FOR r IN (
        SELECT d.ROWID AS rid, d.ASSET_ID, d.BOOK_TYPE_CODE
        FROM   RR_FA_DEPRN_DETAIL d
        WHERE  d.DISTRIBUTION_ID IN (
                   SELECT DISTRIBUTION_ID
                   FROM   RR_FA_DEPRN_DETAIL
                   GROUP  BY DISTRIBUTION_ID
                   HAVING COUNT(*) > 1)
    ) LOOP
        v_new := RR_FA_DISTRIBUTION_ID_SEQ.NEXTVAL;

        -- keep any FK to RR_FA_DISTRIBUTION_HISTORY valid (mirrors the app's own
        -- insert in RR_FA_DEPRN_PKG.post_deprn_rows).
        INSERT INTO RR_FA_DISTRIBUTION_HISTORY (
            DISTRIBUTION_ID, BOOK_TYPE_CODE, ASSET_ID,
            UNITS_ASSIGNED, TRANSACTION_UNITS, DATE_EFFECTIVE,
            OBJECT_VERSION_NUMBER,
            CREATION_DATE, CREATED_BY, LAST_UPDATE_DATE, LAST_UPDATED_BY
        ) VALUES (
            v_new, r.BOOK_TYPE_CODE, r.ASSET_ID,
            1, 1, SYSTIMESTAMP,
            1,
            SYSTIMESTAMP, 'MIGRATION', SYSTIMESTAMP, 'MIGRATION'
        );

        UPDATE RR_FA_DEPRN_DETAIL
        SET    DISTRIBUTION_ID = v_new
        WHERE  ROWID = r.rid;

        v_cnt := v_cnt + 1;
    END LOOP;

    COMMIT;
    DBMS_OUTPUT.PUT_LINE('Reassigned ' || v_cnt || ' depreciation detail rows to unique distribution ids');
END;
/

-- 3) Verify — distinct_ids must equal total_rows (i.e. every line is unique).
SELECT COUNT(*)                    AS total_rows,
       COUNT(DISTINCT DISTRIBUTION_ID) AS distinct_ids,
       COUNT(*) - COUNT(DISTINCT DISTRIBUTION_ID) AS still_duplicated
FROM   RR_FA_DEPRN_DETAIL;
