-- ============================================
-- XXAP_VOID_PAYMENT_PKG
-- Voids an AP payment and restores invoice balance
--
-- What it touches (in order):
--   1. Validates via XXAP_INVOICE_BALANCE_PKG.validate_void_payment
--   2. RR_AP_PAYMENTS_ALL             → PAYMENT_STATUS = 'Voided', VOID_DATE / VOID_ACCOUNTING_DATE
--   3. RR_AP_PAYMENTS_RELATED_INVOICES → INVOICE_PAYMENT_STATUS = 'Voided'
--   4. RR_AP_INVOICE_INSTALLMENTS      → UNPAID_AMOUNT restored to GROSS_AMOUNT,
--                                         PAYMENT_STATUS = 'Unpaid'
--                                         (only when INSTALLMENT_NUMBER was set on the link)
--
-- Balance restores automatically because get_invoice_balance already
-- excludes PAYMENT_STATUS = 'Voided' from the sum.
-- ============================================

CREATE OR REPLACE PACKAGE XXAP_VOID_PAYMENT_PKG AS

    -- Void a single payment by CheckId.
    -- p_json_data: { "CheckId": N, "VoidDate": "YYYY-MM-DD", "VoidedBy": "username" }
    -- Returns:     { "status": "success"|"error",
    --               "message": "...",
    --               "checkId": N,
    --               "paymentNumber": "PAY-...",
    --               "invoiceId": N,
    --               "newBalance": N }
    PROCEDURE void_payment(
        p_json_data IN  CLOB,
        p_result    OUT VARCHAR2
    );

END XXAP_VOID_PAYMENT_PKG;
/

CREATE OR REPLACE PACKAGE BODY XXAP_VOID_PAYMENT_PKG AS

    PROCEDURE void_payment(
        p_json_data IN  CLOB,
        p_result    OUT VARCHAR2
    ) IS
        -- Input
        v_check_id           NUMBER;
        v_void_date          DATE;
        v_voided_by          VARCHAR2(100);

        -- Looked up from DB
        v_invoice_payment_id NUMBER;
        v_invoice_id         NUMBER;
        v_installment_number NUMBER;
        v_payment_number     VARCHAR2(100);
        v_gross_amount       NUMBER;

        -- Validation result
        v_valid_json         CLOB;
        v_is_valid           VARCHAR2(5);
        v_errors             VARCHAR2(4000);

        -- New balance after void
        v_new_balance        NUMBER;

    BEGIN
        -- ── 1. Parse input ───────────────────────────────────────────────────
        v_check_id   := JSON_VALUE(p_json_data, '$.CheckId'   RETURNING NUMBER);
        v_voided_by  := JSON_VALUE(p_json_data, '$.VoidedBy');

        BEGIN
            v_void_date := TO_DATE(
                SUBSTR(JSON_VALUE(p_json_data, '$.VoidDate'), 1, 10),
                'YYYY-MM-DD'
            );
        EXCEPTION WHEN OTHERS THEN
            v_void_date := TRUNC(SYSDATE);
        END;

        IF v_void_date IS NULL THEN
            v_void_date := TRUNC(SYSDATE);
        END IF;

        IF v_check_id IS NULL THEN
            p_result := '{"status":"error","message":"CheckId is required"}';
            RETURN;
        END IF;

        -- ── 2. Look up the related invoice link ──────────────────────────────
        --    We need invoice_payment_id for validate_void_payment,
        --    invoice_id for balance recalc, installment_number for restore.
        BEGIN
            SELECT ri.INVOICE_PAYMENT_ID,
                   ri.INVOICE_ID,
                   ri.INSTALLMENT_NUMBER,
                   p.PAYMENT_NUMBER
            INTO   v_invoice_payment_id,
                   v_invoice_id,
                   v_installment_number,
                   v_payment_number
            FROM   RR_AP_PAYMENTS_ALL             p
            JOIN   RR_AP_PAYMENTS_RELATED_INVOICES ri
                   ON ri.CHECK_ID = p.CHECK_ID
            WHERE  p.CHECK_ID = v_check_id
            AND    ROWNUM = 1;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                p_result := '{"status":"error","message":"Payment not found for CheckId ' || v_check_id || '"}';
                RETURN;
        END;

        -- ── 3. Validate: not already voided, not reconciled ──────────────────
        v_valid_json := XXAP_INVOICE_BALANCE_PKG.validate_void_payment(v_invoice_payment_id);
        v_is_valid   := JSON_VALUE(v_valid_json, '$.valid');

        IF v_is_valid != 'true' THEN
            -- Pass the errors array from validate straight back
            v_errors := SUBSTR(v_valid_json, INSTR(v_valid_json, '"errors"'), 500);
            p_result := '{"status":"error","message":"Void validation failed",' || v_errors || '}';
            RETURN;
        END IF;

        -- ── 4. Void the payment header ───────────────────────────────────────
        UPDATE RR_AP_PAYMENTS_ALL
        SET    PAYMENT_STATUS        = 'Voided',
               VOID_DATE             = v_void_date,
               VOID_ACCOUNTING_DATE  = v_void_date,
               LAST_UPDATED_BY       = NVL(v_voided_by, LAST_UPDATED_BY),
               LAST_UPDATE_DATE      = SYSTIMESTAMP,
               LOCAL_UPDATED_DATE    = SYSTIMESTAMP
        WHERE  CHECK_ID = v_check_id;

        IF SQL%ROWCOUNT = 0 THEN
            p_result := '{"status":"error","message":"Payment header not found for CheckId ' || v_check_id || '"}';
            RETURN;
        END IF;

        -- ── 5. Void the related invoice link ─────────────────────────────────
        UPDATE RR_AP_PAYMENTS_RELATED_INVOICES
        SET    INVOICE_PAYMENT_STATUS = 'Voided',
               LAST_UPDATED_BY        = NVL(v_voided_by, LAST_UPDATED_BY),
               LAST_UPDATE_DATE       = SYSTIMESTAMP,
               LOCAL_UPDATED_DATE     = SYSTIMESTAMP
        WHERE  INVOICE_PAYMENT_ID = v_invoice_payment_id;

        -- ── 6. Restore installment if one was linked ─────────────────────────
        IF v_installment_number IS NOT NULL AND v_invoice_id IS NOT NULL THEN
            BEGIN
                SELECT GROSS_AMOUNT
                INTO   v_gross_amount
                FROM   RR_AP_INVOICE_INSTALLMENTS
                WHERE  INVOICE_ID         = v_invoice_id
                AND    INSTALLMENT_NUMBER  = v_installment_number;

                UPDATE RR_AP_INVOICE_INSTALLMENTS
                SET    UNPAID_AMOUNT      = v_gross_amount,
                       PAYMENT_STATUS     = 'Unpaid',
                       LAST_UPDATED_BY    = NVL(v_voided_by, LAST_UPDATED_BY),
                       LAST_UPDATE_DATE   = SYSTIMESTAMP
                WHERE  INVOICE_ID         = v_invoice_id
                AND    INSTALLMENT_NUMBER  = v_installment_number;
            EXCEPTION
                WHEN NO_DATA_FOUND THEN NULL; -- installment may have been deleted; non-fatal
            END;
        END IF;

        COMMIT;

        -- ── 7. Return new invoice balance ────────────────────────────────────
        BEGIN
            SELECT (i.INVOICE_AMOUNT - NVL(SUM(ri2.AMOUNT_PAID_INVOICE_CURRENCY), 0))
            INTO   v_new_balance
            FROM   RR_AP_INVOICES_ALL              i
            LEFT JOIN RR_AP_PAYMENTS_RELATED_INVOICES ri2
                   ON ri2.INVOICE_ID = i.INVOICE_ID
                  AND NVL(ri2.INVOICE_PAYMENT_STATUS, 'Active') != 'Voided'
            WHERE  i.INVOICE_ID = v_invoice_id
            GROUP BY i.INVOICE_AMOUNT;
        EXCEPTION
            WHEN OTHERS THEN v_new_balance := NULL;
        END;

        p_result :=
            '{"status":"success"' ||
            ',"message":"Payment voided successfully"' ||
            ',"checkId":'        || v_check_id ||
            ',"paymentNumber":"' || NVL(v_payment_number, '') || '"' ||
            ',"invoiceId":'      || NVL(TO_CHAR(v_invoice_id), 'null') ||
            ',"newBalance":'     || NVL(TO_CHAR(v_new_balance), 'null') ||
            '}';

    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            p_result := '{"status":"error","message":"' || REPLACE(SQLERRM, '"', '\"') || '"}';
    END void_payment;

END XXAP_VOID_PAYMENT_PKG;
/
