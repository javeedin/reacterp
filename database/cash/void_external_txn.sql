-- ============================================================
-- PUT cash/externaltransactions/:externalTransactionId/void
-- Sets STATUS = 'VOID' on a single external cash transaction.
-- Usage: PUT .../void?updated_by=user@email.com
-- Run this in Oracle APEX SQL Workshop (reerp module must exist)
-- ============================================================

BEGIN
    BEGIN
        ORDS.DELETE_HANDLER(
            p_module_name => 'reerp',
            p_pattern     => 'cash/externaltransactions/:externalTransactionId/void',
            p_method      => 'PUT'
        );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        ORDS.DELETE_TEMPLATE(
            p_module_name => 'reerp',
            p_pattern     => 'cash/externaltransactions/:externalTransactionId/void'
        );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'cash/externaltransactions/:externalTransactionId/void',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_etag_query  => NULL,
        p_comments    => 'Void an external cash transaction'
    );

    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'cash/externaltransactions/:externalTransactionId/void',
        p_method         => 'PUT',
        p_source_type    => ORDS.source_type_plsql,
        p_items_per_page => 0,
        p_mimes_allowed  => '',
        p_comments       => 'Set STATUS = VOID on external transaction; no body needed',
        p_source         => q'[
DECLARE
    l_rows NUMBER;
BEGIN
    UPDATE RR_EXTERNAL_CASH_TRANSACTIONS
    SET    STATUS           = 'VOID',
           LAST_UPDATED_BY  = NVL(:updated_by, 'SYSTEM'),
           LAST_UPDATE_DATE = SYSTIMESTAMP
    WHERE  EXTERNAL_TRANSACTION_ID = :externalTransactionId;

    l_rows := SQL%ROWCOUNT;
    COMMIT;

    IF l_rows = 0 THEN
        :status_code := 404;
        HTP.PRN('{"success":false,"message":"Transaction not found"}');
    ELSE
        :status_code := 200;
        HTP.PRN('{"success":true,"rows":' || l_rows || '}');
    END IF;
EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    :status_code := 500;
    HTP.PRN('{"success":false,"message":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;
]'
    );

    COMMIT;
END;
/
