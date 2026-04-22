-- ============================================================
-- GET cash/externaltransactions/batchstatus
-- Returns STATUS + ACCOUNTING_FLAG for a comma-separated list
-- of external transaction IDs supplied in the :ids bind var.
-- Usage: GET .../batchstatus?ids=101,102,103
-- Run this in Oracle APEX SQL Workshop (reerp module must exist)
-- ============================================================

BEGIN
    BEGIN
        ORDS.DELETE_HANDLER(
            p_module_name => 'reerp',
            p_pattern     => 'cash/externaltransactions/batchstatus',
            p_method      => 'GET'
        );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        ORDS.DELETE_TEMPLATE(
            p_module_name => 'reerp',
            p_pattern     => 'cash/externaltransactions/batchstatus'
        );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'reerp',
        p_pattern     => 'cash/externaltransactions/batchstatus',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_etag_query  => NULL,
        p_comments    => 'Batch-fetch STATUS + ACCOUNTING_FLAG for multiple bank transaction IDs'
    );

    ORDS.DEFINE_HANDLER(
        p_module_name    => 'reerp',
        p_pattern        => 'cash/externaltransactions/batchstatus',
        p_method         => 'GET',
        p_source_type    => ORDS.source_type_collection_query,
        p_items_per_page => 1000,
        p_mimes_allowed  => '',
        p_comments       => 'ids = comma-separated EXTERNAL_TRANSACTION_ID values',
        p_source         => q'[
SELECT t.EXTERNAL_TRANSACTION_ID AS "externalTransactionId",
       t.STATUS                   AS "status",
       NVL(t.ACCOUNTING_FLAG,'N') AS "accountingFlag"
FROM   RR_EXTERNAL_CASH_TRANSACTIONS t
WHERE  INSTR(',' || :ids || ',',
             ',' || TO_CHAR(t.EXTERNAL_TRANSACTION_ID) || ',') > 0
ORDER  BY t.EXTERNAL_TRANSACTION_ID
]'
    );

    COMMIT;
END;
/
