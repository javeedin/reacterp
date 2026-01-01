-- ============================================
-- XXAP_PAYMENT_REL_INVOICES_PKG Package
-- Handles AP Payment Related Invoices operations
-- ============================================

CREATE OR REPLACE PACKAGE XXAP_PAYMENT_REL_INVOICES_PKG AS

    -- Save single related invoice from JSON
    PROCEDURE save_related_invoice(
        p_json_data IN CLOB,
        p_result OUT VARCHAR2
    );

    -- Save multiple related invoices from JSON array
    PROCEDURE save_related_invoices_bulk(
        p_json_data IN CLOB,
        p_result OUT VARCHAR2
    );

    -- Save from items format { "items": [...] }
    PROCEDURE save_from_items(
        p_json_data IN CLOB,
        p_result OUT VARCHAR2
    );

    -- Get related invoices by Check ID
    FUNCTION get_by_check_id(
        p_check_id IN NUMBER
    ) RETURN CLOB;

    -- Get single related invoice by Invoice Payment ID
    FUNCTION get_by_invoice_payment_id(
        p_invoice_payment_id IN NUMBER
    ) RETURN CLOB;

END XXAP_PAYMENT_REL_INVOICES_PKG;
/

CREATE OR REPLACE PACKAGE BODY XXAP_PAYMENT_REL_INVOICES_PKG AS

    -- Save single related invoice
    PROCEDURE save_related_invoice(
        p_json_data IN CLOB,
        p_result OUT VARCHAR2
    ) IS
        -- Variables for JSON values
        v_invoice_payment_id NUMBER;
        v_check_id NUMBER;
        v_invoice_id NUMBER;
        v_invoice_business_unit VARCHAR2(240);
        v_invoice_number VARCHAR2(100);
        v_installment_number NUMBER;
        v_amount_paid_payment_curr NUMBER;
        v_amount_paid_invoice_curr NUMBER;
        v_invoice_payment_amount NUMBER;
        v_invoice_amount NUMBER;
        v_invoice_base_amount NUMBER;
        v_payment_base_amount NUMBER;
        v_discount_lost NUMBER;
        v_discount_taken NUMBER;
        v_invoice_currency VARCHAR2(15);
        v_cross_currency_rate NUMBER;
        v_invoice_payment_status VARCHAR2(50);
        v_created_by VARCHAR2(100);
        v_last_updated_by VARCHAR2(100);
        v_last_update_login VARCHAR2(100);
        v_creation_date TIMESTAMP WITH TIME ZONE;
        v_last_update_date TIMESTAMP WITH TIME ZONE;
        v_temp_str VARCHAR2(100);

    BEGIN
        -- Extract values from JSON
        SELECT
            JSON_VALUE(p_json_data, '$.InvoicePaymentId' RETURNING NUMBER),
            JSON_VALUE(p_json_data, '$.CheckId' RETURNING NUMBER),
            JSON_VALUE(p_json_data, '$.InvoiceId' RETURNING NUMBER),
            JSON_VALUE(p_json_data, '$.InvoiceBusinessUnit'),
            JSON_VALUE(p_json_data, '$.InvoiceNumber'),
            JSON_VALUE(p_json_data, '$.InstallmentNumber' RETURNING NUMBER),
            JSON_VALUE(p_json_data, '$.AmountPaidPaymentCurrency' RETURNING NUMBER),
            JSON_VALUE(p_json_data, '$.AmountPaidInvoiceCurrency' RETURNING NUMBER),
            JSON_VALUE(p_json_data, '$.InvoicePaymentAmount' RETURNING NUMBER),
            JSON_VALUE(p_json_data, '$.InvoiceAmount' RETURNING NUMBER),
            JSON_VALUE(p_json_data, '$.InvoiceBaseAmount' RETURNING NUMBER),
            JSON_VALUE(p_json_data, '$.PaymentBaseAmount' RETURNING NUMBER),
            JSON_VALUE(p_json_data, '$.DiscountLost' RETURNING NUMBER),
            JSON_VALUE(p_json_data, '$.DiscountTaken' RETURNING NUMBER),
            JSON_VALUE(p_json_data, '$.InvoiceCurrency'),
            JSON_VALUE(p_json_data, '$.CrossCurrencyRate' RETURNING NUMBER),
            JSON_VALUE(p_json_data, '$.InvoicePaymentStatus'),
            JSON_VALUE(p_json_data, '$.CreatedBy'),
            JSON_VALUE(p_json_data, '$.LastUpdatedBy'),
            JSON_VALUE(p_json_data, '$.LastUpdateLogin')
        INTO
            v_invoice_payment_id,
            v_check_id,
            v_invoice_id,
            v_invoice_business_unit,
            v_invoice_number,
            v_installment_number,
            v_amount_paid_payment_curr,
            v_amount_paid_invoice_curr,
            v_invoice_payment_amount,
            v_invoice_amount,
            v_invoice_base_amount,
            v_payment_base_amount,
            v_discount_lost,
            v_discount_taken,
            v_invoice_currency,
            v_cross_currency_rate,
            v_invoice_payment_status,
            v_created_by,
            v_last_updated_by,
            v_last_update_login
        FROM DUAL;

        -- Parse timestamps
        BEGIN
            v_temp_str := JSON_VALUE(p_json_data, '$.CreationDate');
            IF v_temp_str IS NOT NULL THEN
                v_creation_date := TO_TIMESTAMP_TZ(v_temp_str, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM');
            END IF;
        EXCEPTION WHEN OTHERS THEN
            BEGIN
                v_creation_date := TO_TIMESTAMP_TZ(v_temp_str, 'YYYY-MM-DD"T"HH24:MI:SSTZH:TZM');
            EXCEPTION WHEN OTHERS THEN v_creation_date := NULL;
            END;
        END;

        BEGIN
            v_temp_str := JSON_VALUE(p_json_data, '$.LastUpdateDate');
            IF v_temp_str IS NOT NULL THEN
                v_last_update_date := TO_TIMESTAMP_TZ(v_temp_str, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM');
            END IF;
        EXCEPTION WHEN OTHERS THEN
            BEGIN
                v_last_update_date := TO_TIMESTAMP_TZ(v_temp_str, 'YYYY-MM-DD"T"HH24:MI:SSTZH:TZM');
            EXCEPTION WHEN OTHERS THEN v_last_update_date := NULL;
            END;
        END;

        -- Merge (upsert) data
        MERGE INTO RR_AP_PAYMENTS_RELATED_INVOICES tgt
        USING (SELECT v_invoice_payment_id AS INVOICE_PAYMENT_ID FROM DUAL) src
        ON (tgt.INVOICE_PAYMENT_ID = src.INVOICE_PAYMENT_ID)
        WHEN MATCHED THEN
            UPDATE SET
                CHECK_ID = v_check_id,
                INVOICE_ID = v_invoice_id,
                INVOICE_BUSINESS_UNIT = v_invoice_business_unit,
                INVOICE_NUMBER = v_invoice_number,
                INSTALLMENT_NUMBER = v_installment_number,
                AMOUNT_PAID_PAYMENT_CURRENCY = v_amount_paid_payment_curr,
                AMOUNT_PAID_INVOICE_CURRENCY = v_amount_paid_invoice_curr,
                INVOICE_PAYMENT_AMOUNT = v_invoice_payment_amount,
                INVOICE_AMOUNT = v_invoice_amount,
                INVOICE_BASE_AMOUNT = v_invoice_base_amount,
                PAYMENT_BASE_AMOUNT = v_payment_base_amount,
                DISCOUNT_LOST = v_discount_lost,
                DISCOUNT_TAKEN = v_discount_taken,
                INVOICE_CURRENCY = v_invoice_currency,
                CROSS_CURRENCY_RATE = v_cross_currency_rate,
                INVOICE_PAYMENT_STATUS = v_invoice_payment_status,
                CREATED_BY = v_created_by,
                CREATION_DATE = v_creation_date,
                LAST_UPDATED_BY = v_last_updated_by,
                LAST_UPDATE_DATE = v_last_update_date,
                LAST_UPDATE_LOGIN = v_last_update_login,
                LOCAL_UPDATED_DATE = SYSTIMESTAMP,
                SYNC_STATUS = 'SYNCED'
        WHEN NOT MATCHED THEN
            INSERT (
                INVOICE_PAYMENT_ID, CHECK_ID, INVOICE_ID,
                INVOICE_BUSINESS_UNIT, INVOICE_NUMBER, INSTALLMENT_NUMBER,
                AMOUNT_PAID_PAYMENT_CURRENCY, AMOUNT_PAID_INVOICE_CURRENCY,
                INVOICE_PAYMENT_AMOUNT, INVOICE_AMOUNT,
                INVOICE_BASE_AMOUNT, PAYMENT_BASE_AMOUNT,
                DISCOUNT_LOST, DISCOUNT_TAKEN,
                INVOICE_CURRENCY, CROSS_CURRENCY_RATE,
                INVOICE_PAYMENT_STATUS,
                CREATED_BY, CREATION_DATE,
                LAST_UPDATED_BY, LAST_UPDATE_DATE, LAST_UPDATE_LOGIN,
                LOCAL_CREATED_DATE, LOCAL_UPDATED_DATE, SYNC_STATUS
            )
            VALUES (
                v_invoice_payment_id, v_check_id, v_invoice_id,
                v_invoice_business_unit, v_invoice_number, v_installment_number,
                v_amount_paid_payment_curr, v_amount_paid_invoice_curr,
                v_invoice_payment_amount, v_invoice_amount,
                v_invoice_base_amount, v_payment_base_amount,
                v_discount_lost, v_discount_taken,
                v_invoice_currency, v_cross_currency_rate,
                v_invoice_payment_status,
                v_created_by, v_creation_date,
                v_last_updated_by, v_last_update_date, v_last_update_login,
                SYSTIMESTAMP, SYSTIMESTAMP, 'SYNCED'
            );

        COMMIT;
        p_result := '{"status":"success","message":"Related invoice saved","invoicePaymentId":' || v_invoice_payment_id || '}';

    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            p_result := '{"status":"error","message":"' || REPLACE(SQLERRM, '"', '\"') || '"}';
    END save_related_invoice;

    -- Save multiple related invoices from JSON array
    PROCEDURE save_related_invoices_bulk(
        p_json_data IN CLOB,
        p_result OUT VARCHAR2
    ) IS
        v_count NUMBER := 0;
        v_errors NUMBER := 0;
        v_result VARCHAR2(4000);
    BEGIN
        FOR rec IN (
            SELECT jt.invoice_data
            FROM JSON_TABLE(p_json_data, '$[*]'
                COLUMNS (invoice_data CLOB FORMAT JSON PATH '$')
            ) jt
        ) LOOP
            BEGIN
                save_related_invoice(rec.invoice_data, v_result);
                IF INSTR(v_result, '"status":"success"') > 0 THEN
                    v_count := v_count + 1;
                ELSE
                    v_errors := v_errors + 1;
                END IF;
            EXCEPTION
                WHEN OTHERS THEN v_errors := v_errors + 1;
            END;
        END LOOP;

        p_result := '{"status":"success","saved":' || v_count || ',"errors":' || v_errors || '}';

    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{"status":"error","message":"' || REPLACE(SQLERRM, '"', '\"') || '"}';
    END save_related_invoices_bulk;

    -- Save from items format
    PROCEDURE save_from_items(
        p_json_data IN CLOB,
        p_result OUT VARCHAR2
    ) IS
        v_count NUMBER := 0;
        v_errors NUMBER := 0;
        v_result VARCHAR2(4000);
    BEGIN
        FOR rec IN (
            SELECT jt.invoice_data
            FROM JSON_TABLE(p_json_data, '$.items[*]'
                COLUMNS (invoice_data CLOB FORMAT JSON PATH '$')
            ) jt
        ) LOOP
            BEGIN
                save_related_invoice(rec.invoice_data, v_result);
                IF INSTR(v_result, '"status":"success"') > 0 THEN
                    v_count := v_count + 1;
                ELSE
                    v_errors := v_errors + 1;
                END IF;
            EXCEPTION
                WHEN OTHERS THEN v_errors := v_errors + 1;
            END;
        END LOOP;

        p_result := '{"status":"success","saved":' || v_count || ',"errors":' || v_errors || '}';

    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{"status":"error","message":"' || REPLACE(SQLERRM, '"', '\"') || '"}';
    END save_from_items;

    -- Get related invoices by Check ID
    FUNCTION get_by_check_id(
        p_check_id IN NUMBER
    ) RETURN CLOB IS
        v_result CLOB;
    BEGIN
        SELECT JSON_OBJECT(
            'checkId' VALUE p_check_id,
            'items' VALUE (
                SELECT JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'InvoicePaymentId' VALUE INVOICE_PAYMENT_ID,
                        'CheckId' VALUE CHECK_ID,
                        'InvoiceId' VALUE INVOICE_ID,
                        'InvoiceBusinessUnit' VALUE INVOICE_BUSINESS_UNIT,
                        'InvoiceNumber' VALUE INVOICE_NUMBER,
                        'InstallmentNumber' VALUE INSTALLMENT_NUMBER,
                        'AmountPaidPaymentCurrency' VALUE AMOUNT_PAID_PAYMENT_CURRENCY,
                        'AmountPaidInvoiceCurrency' VALUE AMOUNT_PAID_INVOICE_CURRENCY,
                        'InvoicePaymentAmount' VALUE INVOICE_PAYMENT_AMOUNT,
                        'InvoiceAmount' VALUE INVOICE_AMOUNT,
                        'DiscountLost' VALUE DISCOUNT_LOST,
                        'DiscountTaken' VALUE DISCOUNT_TAKEN,
                        'InvoiceCurrency' VALUE INVOICE_CURRENCY,
                        'InvoicePaymentStatus' VALUE INVOICE_PAYMENT_STATUS
                    ) ORDER BY INVOICE_NUMBER
                    RETURNING CLOB
                )
                FROM RR_AP_PAYMENTS_RELATED_INVOICES
                WHERE CHECK_ID = p_check_id
            )
            RETURNING CLOB
        )
        INTO v_result
        FROM DUAL;

        RETURN v_result;

    EXCEPTION
        WHEN OTHERS THEN
            RETURN '{"status":"error","message":"' || REPLACE(SQLERRM, '"', '\"') || '"}';
    END get_by_check_id;

    -- Get single related invoice by Invoice Payment ID
    FUNCTION get_by_invoice_payment_id(
        p_invoice_payment_id IN NUMBER
    ) RETURN CLOB IS
        v_result CLOB;
    BEGIN
        SELECT JSON_OBJECT(
            'InvoicePaymentId' VALUE INVOICE_PAYMENT_ID,
            'CheckId' VALUE CHECK_ID,
            'InvoiceId' VALUE INVOICE_ID,
            'InvoiceBusinessUnit' VALUE INVOICE_BUSINESS_UNIT,
            'InvoiceNumber' VALUE INVOICE_NUMBER,
            'InstallmentNumber' VALUE INSTALLMENT_NUMBER,
            'AmountPaidPaymentCurrency' VALUE AMOUNT_PAID_PAYMENT_CURRENCY,
            'AmountPaidInvoiceCurrency' VALUE AMOUNT_PAID_INVOICE_CURRENCY,
            'InvoicePaymentAmount' VALUE INVOICE_PAYMENT_AMOUNT,
            'InvoiceAmount' VALUE INVOICE_AMOUNT,
            'DiscountLost' VALUE DISCOUNT_LOST,
            'DiscountTaken' VALUE DISCOUNT_TAKEN,
            'InvoiceCurrency' VALUE INVOICE_CURRENCY,
            'InvoicePaymentStatus' VALUE INVOICE_PAYMENT_STATUS,
            'SyncStatus' VALUE SYNC_STATUS
            RETURNING CLOB
        )
        INTO v_result
        FROM RR_AP_PAYMENTS_RELATED_INVOICES
        WHERE INVOICE_PAYMENT_ID = p_invoice_payment_id;

        RETURN v_result;

    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RETURN '{"status":"error","message":"Related invoice not found"}';
        WHEN OTHERS THEN
            RETURN '{"status":"error","message":"' || REPLACE(SQLERRM, '"', '\"') || '"}';
    END get_by_invoice_payment_id;

END XXAP_PAYMENT_REL_INVOICES_PKG;
/
