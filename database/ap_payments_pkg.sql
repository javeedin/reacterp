-- ============================================
-- XXAP_PAYMENTS_PKG Package
-- Handles AP Payment data operations
-- ============================================

CREATE OR REPLACE PACKAGE XXAP_PAYMENTS_PKG AS

    -- Save single payment from JSON
    PROCEDURE save_payment(
        p_json_data IN CLOB,
        p_result OUT VARCHAR2
    );

    -- Save multiple payments from JSON array
    PROCEDURE save_payments_bulk(
        p_json_data IN CLOB,
        p_result OUT VARCHAR2
    );

    -- Save payments from items array format { "items": [...] }
    PROCEDURE save_payments_from_items(
        p_json_data IN CLOB,
        p_result OUT VARCHAR2
    );

    -- Get payment by Check ID
    FUNCTION get_payment_by_check_id(
        p_check_id IN NUMBER
    ) RETURN CLOB;

    -- Get payments with filters
    FUNCTION get_payments(
        p_payment_number    IN NUMBER DEFAULT NULL,
        p_payment_status    IN VARCHAR2 DEFAULT NULL,
        p_payee             IN VARCHAR2 DEFAULT NULL,
        p_supplier_number   IN VARCHAR2 DEFAULT NULL,
        p_business_unit     IN VARCHAR2 DEFAULT NULL,
        p_date_from         IN DATE DEFAULT NULL,
        p_date_to           IN DATE DEFAULT NULL,
        p_limit             IN NUMBER DEFAULT 100,
        p_offset            IN NUMBER DEFAULT 0
    ) RETURN CLOB;

END XXAP_PAYMENTS_PKG;
/

CREATE OR REPLACE PACKAGE BODY XXAP_PAYMENTS_PKG AS

    -- Helper function to parse date from ISO format
    FUNCTION parse_date(p_date_str IN VARCHAR2) RETURN DATE IS
        v_date DATE;
    BEGIN
        IF p_date_str IS NULL THEN
            RETURN NULL;
        END IF;

        -- Try ISO format first (YYYY-MM-DD)
        BEGIN
            v_date := TO_DATE(SUBSTR(p_date_str, 1, 10), 'YYYY-MM-DD');
            RETURN v_date;
        EXCEPTION
            WHEN OTHERS THEN
                RETURN NULL;
        END;
    END parse_date;

    -- Helper function to parse timestamp from ISO format
    FUNCTION parse_timestamp(p_ts_str IN VARCHAR2) RETURN TIMESTAMP WITH TIME ZONE IS
        v_ts TIMESTAMP WITH TIME ZONE;
    BEGIN
        IF p_ts_str IS NULL THEN
            RETURN NULL;
        END IF;

        BEGIN
            v_ts := TO_TIMESTAMP_TZ(p_ts_str, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM');
            RETURN v_ts;
        EXCEPTION
            WHEN OTHERS THEN
                BEGIN
                    v_ts := TO_TIMESTAMP_TZ(p_ts_str, 'YYYY-MM-DD"T"HH24:MI:SSTZH:TZM');
                    RETURN v_ts;
                EXCEPTION
                    WHEN OTHERS THEN
                        RETURN NULL;
                END;
        END;
    END parse_timestamp;

    -- Save single payment
    PROCEDURE save_payment(
        p_json_data IN CLOB,
        p_result OUT VARCHAR2
    ) IS
        v_check_id NUMBER;
    BEGIN
        -- Extract Check ID
        SELECT JSON_VALUE(p_json_data, '$.CheckId' RETURNING NUMBER)
        INTO v_check_id
        FROM DUAL;

        -- Merge (upsert) payment data
        MERGE INTO RR_AP_PAYMENTS_ALL tgt
        USING (
            SELECT
                JSON_VALUE(p_json_data, '$.CheckId' RETURNING NUMBER) AS CHECK_ID,
                JSON_VALUE(p_json_data, '$.PaymentId' RETURNING NUMBER) AS PAYMENT_ID,
                JSON_VALUE(p_json_data, '$.PaymentReference' RETURNING NUMBER) AS PAYMENT_REFERENCE,
                JSON_VALUE(p_json_data, '$.PaperDocumentNumber' RETURNING NUMBER) AS PAPER_DOCUMENT_NUMBER,
                JSON_VALUE(p_json_data, '$.PaymentNumber' RETURNING NUMBER) AS PAYMENT_NUMBER,
                JSON_VALUE(p_json_data, '$.PaymentFileReference' RETURNING NUMBER) AS PAYMENT_FILE_REFERENCE,
                JSON_VALUE(p_json_data, '$.PaymentProcessRequest') AS PAYMENT_PROCESS_REQUEST,
                JSON_VALUE(p_json_data, '$.VoucherNumber' RETURNING NUMBER) AS VOUCHER_NUMBER,
                JSON_VALUE(p_json_data, '$.PaymentAmount' RETURNING NUMBER) AS PAYMENT_AMOUNT,
                JSON_VALUE(p_json_data, '$.PaymentBaseAmount' RETURNING NUMBER) AS PAYMENT_BASE_AMOUNT,
                JSON_VALUE(p_json_data, '$.WithheldAmount' RETURNING NUMBER) AS WITHHELD_AMOUNT,
                JSON_VALUE(p_json_data, '$.BankChargeAmount' RETURNING NUMBER) AS BANK_CHARGE_AMOUNT,
                JSON_VALUE(p_json_data, '$.PaymentDate') AS PAYMENT_DATE_STR,
                JSON_VALUE(p_json_data, '$.AccountingDate') AS ACCOUNTING_DATE_STR,
                JSON_VALUE(p_json_data, '$.MaturityDate') AS MATURITY_DATE_STR,
                JSON_VALUE(p_json_data, '$.AnticipatedValueDate') AS ANTICIPATED_VALUE_DATE_STR,
                JSON_VALUE(p_json_data, '$.StopDate') AS STOP_DATE_STR,
                JSON_VALUE(p_json_data, '$.VoidDate') AS VOID_DATE_STR,
                JSON_VALUE(p_json_data, '$.VoidAccountingDate') AS VOID_ACCOUNTING_DATE_STR,
                JSON_VALUE(p_json_data, '$.PaymentDescription') AS PAYMENT_DESCRIPTION,
                JSON_VALUE(p_json_data, '$.PaymentStatus') AS PAYMENT_STATUS,
                JSON_VALUE(p_json_data, '$.PaymentType') AS PAYMENT_TYPE,
                JSON_VALUE(p_json_data, '$.PaymentMode') AS PAYMENT_MODE,
                JSON_VALUE(p_json_data, '$.PaymentFunction') AS PAYMENT_FUNCTION,
                JSON_VALUE(p_json_data, '$.PaymentCurrency') AS PAYMENT_CURRENCY,
                JSON_VALUE(p_json_data, '$.PaymentBaseCurrency') AS PAYMENT_BASE_CURRENCY,
                JSON_VALUE(p_json_data, '$.ConversionRate' RETURNING NUMBER) AS CONVERSION_RATE,
                JSON_VALUE(p_json_data, '$.ConversionDate') AS CONVERSION_DATE_STR,
                JSON_VALUE(p_json_data, '$.ConversionRateType') AS CONVERSION_RATE_TYPE,
                JSON_VALUE(p_json_data, '$.CrossCurrencyRateType') AS CROSS_CURRENCY_RATE_TYPE,
                JSON_VALUE(p_json_data, '$.ClearingDate') AS CLEARING_DATE_STR,
                JSON_VALUE(p_json_data, '$.ClearingAmount' RETURNING NUMBER) AS CLEARING_AMOUNT,
                JSON_VALUE(p_json_data, '$.ClearingLedgerAmount' RETURNING NUMBER) AS CLEARING_LEDGER_AMOUNT,
                JSON_VALUE(p_json_data, '$.ClearingConversionRate' RETURNING NUMBER) AS CLEARING_CONVERSION_RATE,
                JSON_VALUE(p_json_data, '$.ClearingConversionDate') AS CLEARING_CONVERSION_DATE_STR,
                JSON_VALUE(p_json_data, '$.ClearingConversionRateType') AS CLEARING_CONVERSION_RATE_TYPE,
                JSON_VALUE(p_json_data, '$.ClearingValueDate') AS CLEARING_VALUE_DATE_STR,
                JSON_VALUE(p_json_data, '$.MaturityConversionRateType') AS MATURITY_CONVERSION_RATE_TYPE,
                JSON_VALUE(p_json_data, '$.MaturityConversionDate') AS MATURITY_CONVERSION_DATE_STR,
                JSON_VALUE(p_json_data, '$.MaturityConversionRate' RETURNING NUMBER) AS MATURITY_CONVERSION_RATE,
                JSON_VALUE(p_json_data, '$.AccountingStatus') AS ACCOUNTING_STATUS,
                JSON_VALUE(p_json_data, '$.ReconciledFlag') AS RECONCILED_FLAG_RAW,
                JSON_VALUE(p_json_data, '$.SeparateRemittanceAdviceCreated') AS SEPARATE_REMITTANCE_ADVICE_CREATED,
                JSON_VALUE(p_json_data, '$.IbyPaymentStatus') AS IBY_PAYMENT_STATUS,
                JSON_VALUE(p_json_data, '$.LegalEntity') AS LEGAL_ENTITY,
                JSON_VALUE(p_json_data, '$.BusinessUnit') AS BUSINESS_UNIT,
                JSON_VALUE(p_json_data, '$.ProcurementBU') AS PROCUREMENT_BU,
                JSON_VALUE(p_json_data, '$.Payee') AS PAYEE,
                JSON_VALUE(p_json_data, '$.PartyId' RETURNING NUMBER) AS PARTY_ID,
                JSON_VALUE(p_json_data, '$.PayeeSite') AS PAYEE_SITE,
                JSON_VALUE(p_json_data, '$.SupplierNumber') AS SUPPLIER_NUMBER,
                JSON_VALUE(p_json_data, '$.EmployeeAddress') AS EMPLOYEE_ADDRESS,
                JSON_VALUE(p_json_data, '$.ThirdPartySupplier') AS THIRD_PARTY_SUPPLIER,
                JSON_VALUE(p_json_data, '$.ThirdPartyAddressName') AS THIRD_PARTY_ADDRESS_NAME,
                JSON_VALUE(p_json_data, '$.ExternalBankAccountId' RETURNING NUMBER) AS EXTERNAL_BANK_ACCOUNT_ID,
                JSON_VALUE(p_json_data, '$.RemitToAccountNumber') AS REMIT_TO_ACCOUNT_NUMBER,
                JSON_VALUE(p_json_data, '$.DisbursementBankAccountNumber') AS DISBURSEMENT_BANK_ACCOUNT_NUMBER,
                JSON_VALUE(p_json_data, '$.DisbursementBankAccountName') AS DISBURSEMENT_BANK_ACCOUNT_NAME,
                JSON_VALUE(p_json_data, '$.FundingCardAccount') AS FUNDING_CARD_ACCOUNT,
                JSON_VALUE(p_json_data, '$.DigitalPaymentAccount') AS DIGITAL_PAYMENT_ACCOUNT,
                JSON_VALUE(p_json_data, '$.PaymentMethodCode') AS PAYMENT_METHOD_CODE,
                JSON_VALUE(p_json_data, '$.PaymentMethod') AS PAYMENT_METHOD,
                JSON_VALUE(p_json_data, '$.PaymentDocument') AS PAYMENT_DOCUMENT,
                JSON_VALUE(p_json_data, '$.PaymentProcessProfileCode') AS PAYMENT_PROCESS_PROFILE_CODE,
                JSON_VALUE(p_json_data, '$.PaymentProcessProfile') AS PAYMENT_PROCESS_PROFILE,
                JSON_VALUE(p_json_data, '$.DocumentCategory') AS DOCUMENT_CATEGORY,
                JSON_VALUE(p_json_data, '$.DocumentSequence') AS DOCUMENT_SEQUENCE,
                JSON_VALUE(p_json_data, '$.AddressLine1') AS ADDRESS_LINE1,
                JSON_VALUE(p_json_data, '$.AddressLine2') AS ADDRESS_LINE2,
                JSON_VALUE(p_json_data, '$.AddressLine3') AS ADDRESS_LINE3,
                JSON_VALUE(p_json_data, '$.AddressLine4') AS ADDRESS_LINE4,
                JSON_VALUE(p_json_data, '$.City') AS CITY,
                JSON_VALUE(p_json_data, '$.County') AS COUNTY,
                JSON_VALUE(p_json_data, '$.Province') AS PROVINCE,
                JSON_VALUE(p_json_data, '$.State') AS STATE,
                JSON_VALUE(p_json_data, '$.Country') AS COUNTRY,
                JSON_VALUE(p_json_data, '$.Zip') AS ZIP,
                JSON_VALUE(p_json_data, '$.StopReason') AS STOP_REASON,
                JSON_VALUE(p_json_data, '$.StopReference') AS STOP_REFERENCE,
                JSON_VALUE(p_json_data, '$.CreatedBy') AS CREATED_BY,
                JSON_VALUE(p_json_data, '$.CreationDate') AS CREATION_DATE_STR,
                JSON_VALUE(p_json_data, '$.LastUpdatedBy') AS LAST_UPDATED_BY,
                JSON_VALUE(p_json_data, '$.LastUpdateDate') AS LAST_UPDATE_DATE_STR,
                JSON_VALUE(p_json_data, '$.LastUpdateLogin') AS LAST_UPDATE_LOGIN
            FROM DUAL
        ) src
        ON (tgt.CHECK_ID = src.CHECK_ID)
        WHEN MATCHED THEN
            UPDATE SET
                tgt.PAYMENT_ID = src.PAYMENT_ID,
                tgt.PAYMENT_REFERENCE = src.PAYMENT_REFERENCE,
                tgt.PAPER_DOCUMENT_NUMBER = src.PAPER_DOCUMENT_NUMBER,
                tgt.PAYMENT_NUMBER = src.PAYMENT_NUMBER,
                tgt.PAYMENT_FILE_REFERENCE = src.PAYMENT_FILE_REFERENCE,
                tgt.PAYMENT_PROCESS_REQUEST = src.PAYMENT_PROCESS_REQUEST,
                tgt.VOUCHER_NUMBER = src.VOUCHER_NUMBER,
                tgt.PAYMENT_AMOUNT = src.PAYMENT_AMOUNT,
                tgt.PAYMENT_BASE_AMOUNT = src.PAYMENT_BASE_AMOUNT,
                tgt.WITHHELD_AMOUNT = src.WITHHELD_AMOUNT,
                tgt.BANK_CHARGE_AMOUNT = src.BANK_CHARGE_AMOUNT,
                tgt.PAYMENT_DATE = parse_date(src.PAYMENT_DATE_STR),
                tgt.ACCOUNTING_DATE = parse_date(src.ACCOUNTING_DATE_STR),
                tgt.MATURITY_DATE = parse_date(src.MATURITY_DATE_STR),
                tgt.ANTICIPATED_VALUE_DATE = parse_date(src.ANTICIPATED_VALUE_DATE_STR),
                tgt.STOP_DATE = parse_date(src.STOP_DATE_STR),
                tgt.VOID_DATE = parse_date(src.VOID_DATE_STR),
                tgt.VOID_ACCOUNTING_DATE = parse_date(src.VOID_ACCOUNTING_DATE_STR),
                tgt.PAYMENT_DESCRIPTION = src.PAYMENT_DESCRIPTION,
                tgt.PAYMENT_STATUS = src.PAYMENT_STATUS,
                tgt.PAYMENT_TYPE = src.PAYMENT_TYPE,
                tgt.PAYMENT_MODE = src.PAYMENT_MODE,
                tgt.PAYMENT_FUNCTION = src.PAYMENT_FUNCTION,
                tgt.PAYMENT_CURRENCY = src.PAYMENT_CURRENCY,
                tgt.PAYMENT_BASE_CURRENCY = src.PAYMENT_BASE_CURRENCY,
                tgt.CONVERSION_RATE = src.CONVERSION_RATE,
                tgt.CONVERSION_DATE = parse_date(src.CONVERSION_DATE_STR),
                tgt.CONVERSION_RATE_TYPE = src.CONVERSION_RATE_TYPE,
                tgt.CROSS_CURRENCY_RATE_TYPE = src.CROSS_CURRENCY_RATE_TYPE,
                tgt.CLEARING_DATE = parse_date(src.CLEARING_DATE_STR),
                tgt.CLEARING_AMOUNT = src.CLEARING_AMOUNT,
                tgt.CLEARING_LEDGER_AMOUNT = src.CLEARING_LEDGER_AMOUNT,
                tgt.CLEARING_CONVERSION_RATE = src.CLEARING_CONVERSION_RATE,
                tgt.CLEARING_CONVERSION_DATE = parse_date(src.CLEARING_CONVERSION_DATE_STR),
                tgt.CLEARING_CONVERSION_RATE_TYPE = src.CLEARING_CONVERSION_RATE_TYPE,
                tgt.CLEARING_VALUE_DATE = parse_date(src.CLEARING_VALUE_DATE_STR),
                tgt.MATURITY_CONVERSION_RATE_TYPE = src.MATURITY_CONVERSION_RATE_TYPE,
                tgt.MATURITY_CONVERSION_DATE = parse_date(src.MATURITY_CONVERSION_DATE_STR),
                tgt.MATURITY_CONVERSION_RATE = src.MATURITY_CONVERSION_RATE,
                tgt.ACCOUNTING_STATUS = src.ACCOUNTING_STATUS,
                tgt.RECONCILED_FLAG = CASE WHEN UPPER(src.RECONCILED_FLAG_RAW) IN ('TRUE', 'Y', '1') THEN 'Y' ELSE 'N' END,
                tgt.SEPARATE_REMITTANCE_ADVICE_CREATED = src.SEPARATE_REMITTANCE_ADVICE_CREATED,
                tgt.IBY_PAYMENT_STATUS = src.IBY_PAYMENT_STATUS,
                tgt.LEGAL_ENTITY = src.LEGAL_ENTITY,
                tgt.BUSINESS_UNIT = src.BUSINESS_UNIT,
                tgt.PROCUREMENT_BU = src.PROCUREMENT_BU,
                tgt.PAYEE = src.PAYEE,
                tgt.PARTY_ID = src.PARTY_ID,
                tgt.PAYEE_SITE = src.PAYEE_SITE,
                tgt.SUPPLIER_NUMBER = src.SUPPLIER_NUMBER,
                tgt.EMPLOYEE_ADDRESS = src.EMPLOYEE_ADDRESS,
                tgt.THIRD_PARTY_SUPPLIER = src.THIRD_PARTY_SUPPLIER,
                tgt.THIRD_PARTY_ADDRESS_NAME = src.THIRD_PARTY_ADDRESS_NAME,
                tgt.EXTERNAL_BANK_ACCOUNT_ID = src.EXTERNAL_BANK_ACCOUNT_ID,
                tgt.REMIT_TO_ACCOUNT_NUMBER = src.REMIT_TO_ACCOUNT_NUMBER,
                tgt.DISBURSEMENT_BANK_ACCOUNT_NUMBER = src.DISBURSEMENT_BANK_ACCOUNT_NUMBER,
                tgt.DISBURSEMENT_BANK_ACCOUNT_NAME = src.DISBURSEMENT_BANK_ACCOUNT_NAME,
                tgt.FUNDING_CARD_ACCOUNT = src.FUNDING_CARD_ACCOUNT,
                tgt.DIGITAL_PAYMENT_ACCOUNT = src.DIGITAL_PAYMENT_ACCOUNT,
                tgt.PAYMENT_METHOD_CODE = src.PAYMENT_METHOD_CODE,
                tgt.PAYMENT_METHOD = src.PAYMENT_METHOD,
                tgt.PAYMENT_DOCUMENT = src.PAYMENT_DOCUMENT,
                tgt.PAYMENT_PROCESS_PROFILE_CODE = src.PAYMENT_PROCESS_PROFILE_CODE,
                tgt.PAYMENT_PROCESS_PROFILE = src.PAYMENT_PROCESS_PROFILE,
                tgt.DOCUMENT_CATEGORY = src.DOCUMENT_CATEGORY,
                tgt.DOCUMENT_SEQUENCE = src.DOCUMENT_SEQUENCE,
                tgt.ADDRESS_LINE1 = src.ADDRESS_LINE1,
                tgt.ADDRESS_LINE2 = src.ADDRESS_LINE2,
                tgt.ADDRESS_LINE3 = src.ADDRESS_LINE3,
                tgt.ADDRESS_LINE4 = src.ADDRESS_LINE4,
                tgt.CITY = src.CITY,
                tgt.COUNTY = src.COUNTY,
                tgt.PROVINCE = src.PROVINCE,
                tgt.STATE = src.STATE,
                tgt.COUNTRY = src.COUNTRY,
                tgt.ZIP = src.ZIP,
                tgt.STOP_REASON = src.STOP_REASON,
                tgt.STOP_REFERENCE = src.STOP_REFERENCE,
                tgt.CREATED_BY = src.CREATED_BY,
                tgt.CREATION_DATE = parse_timestamp(src.CREATION_DATE_STR),
                tgt.LAST_UPDATED_BY = src.LAST_UPDATED_BY,
                tgt.LAST_UPDATE_DATE = parse_timestamp(src.LAST_UPDATE_DATE_STR),
                tgt.LAST_UPDATE_LOGIN = src.LAST_UPDATE_LOGIN,
                tgt.LOCAL_UPDATED_DATE = SYSTIMESTAMP,
                tgt.SYNC_STATUS = 'SYNCED'
        WHEN NOT MATCHED THEN
            INSERT (
                CHECK_ID, PAYMENT_ID, PAYMENT_REFERENCE, PAPER_DOCUMENT_NUMBER,
                PAYMENT_NUMBER, PAYMENT_FILE_REFERENCE, PAYMENT_PROCESS_REQUEST, VOUCHER_NUMBER,
                PAYMENT_AMOUNT, PAYMENT_BASE_AMOUNT, WITHHELD_AMOUNT, BANK_CHARGE_AMOUNT,
                PAYMENT_DATE, ACCOUNTING_DATE, MATURITY_DATE, ANTICIPATED_VALUE_DATE,
                STOP_DATE, VOID_DATE, VOID_ACCOUNTING_DATE,
                PAYMENT_DESCRIPTION, PAYMENT_STATUS, PAYMENT_TYPE, PAYMENT_MODE, PAYMENT_FUNCTION,
                PAYMENT_CURRENCY, PAYMENT_BASE_CURRENCY, CONVERSION_RATE, CONVERSION_DATE, CONVERSION_RATE_TYPE,
                CROSS_CURRENCY_RATE_TYPE,
                CLEARING_DATE, CLEARING_AMOUNT, CLEARING_LEDGER_AMOUNT, CLEARING_CONVERSION_RATE,
                CLEARING_CONVERSION_DATE, CLEARING_CONVERSION_RATE_TYPE, CLEARING_VALUE_DATE,
                MATURITY_CONVERSION_RATE_TYPE, MATURITY_CONVERSION_DATE, MATURITY_CONVERSION_RATE,
                ACCOUNTING_STATUS, RECONCILED_FLAG, SEPARATE_REMITTANCE_ADVICE_CREATED, IBY_PAYMENT_STATUS,
                LEGAL_ENTITY, BUSINESS_UNIT, PROCUREMENT_BU,
                PAYEE, PARTY_ID, PAYEE_SITE, SUPPLIER_NUMBER, EMPLOYEE_ADDRESS,
                THIRD_PARTY_SUPPLIER, THIRD_PARTY_ADDRESS_NAME,
                EXTERNAL_BANK_ACCOUNT_ID, REMIT_TO_ACCOUNT_NUMBER, DISBURSEMENT_BANK_ACCOUNT_NUMBER,
                DISBURSEMENT_BANK_ACCOUNT_NAME, FUNDING_CARD_ACCOUNT, DIGITAL_PAYMENT_ACCOUNT,
                PAYMENT_METHOD_CODE, PAYMENT_METHOD, PAYMENT_DOCUMENT,
                PAYMENT_PROCESS_PROFILE_CODE, PAYMENT_PROCESS_PROFILE,
                DOCUMENT_CATEGORY, DOCUMENT_SEQUENCE,
                ADDRESS_LINE1, ADDRESS_LINE2, ADDRESS_LINE3, ADDRESS_LINE4,
                CITY, COUNTY, PROVINCE, STATE, COUNTRY, ZIP,
                STOP_REASON, STOP_REFERENCE,
                CREATED_BY, CREATION_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE, LAST_UPDATE_LOGIN,
                LOCAL_CREATED_DATE, LOCAL_UPDATED_DATE, SYNC_STATUS
            )
            VALUES (
                src.CHECK_ID, src.PAYMENT_ID, src.PAYMENT_REFERENCE, src.PAPER_DOCUMENT_NUMBER,
                src.PAYMENT_NUMBER, src.PAYMENT_FILE_REFERENCE, src.PAYMENT_PROCESS_REQUEST, src.VOUCHER_NUMBER,
                src.PAYMENT_AMOUNT, src.PAYMENT_BASE_AMOUNT, src.WITHHELD_AMOUNT, src.BANK_CHARGE_AMOUNT,
                parse_date(src.PAYMENT_DATE_STR), parse_date(src.ACCOUNTING_DATE_STR),
                parse_date(src.MATURITY_DATE_STR), parse_date(src.ANTICIPATED_VALUE_DATE_STR),
                parse_date(src.STOP_DATE_STR), parse_date(src.VOID_DATE_STR), parse_date(src.VOID_ACCOUNTING_DATE_STR),
                src.PAYMENT_DESCRIPTION, src.PAYMENT_STATUS, src.PAYMENT_TYPE, src.PAYMENT_MODE, src.PAYMENT_FUNCTION,
                src.PAYMENT_CURRENCY, src.PAYMENT_BASE_CURRENCY, src.CONVERSION_RATE,
                parse_date(src.CONVERSION_DATE_STR), src.CONVERSION_RATE_TYPE, src.CROSS_CURRENCY_RATE_TYPE,
                parse_date(src.CLEARING_DATE_STR), src.CLEARING_AMOUNT, src.CLEARING_LEDGER_AMOUNT,
                src.CLEARING_CONVERSION_RATE, parse_date(src.CLEARING_CONVERSION_DATE_STR),
                src.CLEARING_CONVERSION_RATE_TYPE, parse_date(src.CLEARING_VALUE_DATE_STR),
                src.MATURITY_CONVERSION_RATE_TYPE, parse_date(src.MATURITY_CONVERSION_DATE_STR),
                src.MATURITY_CONVERSION_RATE,
                src.ACCOUNTING_STATUS,
                CASE WHEN UPPER(src.RECONCILED_FLAG_RAW) IN ('TRUE', 'Y', '1') THEN 'Y' ELSE 'N' END,
                src.SEPARATE_REMITTANCE_ADVICE_CREATED, src.IBY_PAYMENT_STATUS,
                src.LEGAL_ENTITY, src.BUSINESS_UNIT, src.PROCUREMENT_BU,
                src.PAYEE, src.PARTY_ID, src.PAYEE_SITE, src.SUPPLIER_NUMBER, src.EMPLOYEE_ADDRESS,
                src.THIRD_PARTY_SUPPLIER, src.THIRD_PARTY_ADDRESS_NAME,
                src.EXTERNAL_BANK_ACCOUNT_ID, src.REMIT_TO_ACCOUNT_NUMBER, src.DISBURSEMENT_BANK_ACCOUNT_NUMBER,
                src.DISBURSEMENT_BANK_ACCOUNT_NAME, src.FUNDING_CARD_ACCOUNT, src.DIGITAL_PAYMENT_ACCOUNT,
                src.PAYMENT_METHOD_CODE, src.PAYMENT_METHOD, src.PAYMENT_DOCUMENT,
                src.PAYMENT_PROCESS_PROFILE_CODE, src.PAYMENT_PROCESS_PROFILE,
                src.DOCUMENT_CATEGORY, src.DOCUMENT_SEQUENCE,
                src.ADDRESS_LINE1, src.ADDRESS_LINE2, src.ADDRESS_LINE3, src.ADDRESS_LINE4,
                src.CITY, src.COUNTY, src.PROVINCE, src.STATE, src.COUNTRY, src.ZIP,
                src.STOP_REASON, src.STOP_REFERENCE,
                src.CREATED_BY, parse_timestamp(src.CREATION_DATE_STR),
                src.LAST_UPDATED_BY, parse_timestamp(src.LAST_UPDATE_DATE_STR), src.LAST_UPDATE_LOGIN,
                SYSTIMESTAMP, SYSTIMESTAMP, 'SYNCED'
            );

        COMMIT;
        p_result := '{"status": "success", "message": "Payment saved successfully", "checkId": ' || v_check_id || '}';

    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            p_result := '{"status": "error", "message": "' || REPLACE(SQLERRM, '"', '\"') || '"}';
    END save_payment;

    -- Save multiple payments from JSON array
    PROCEDURE save_payments_bulk(
        p_json_data IN CLOB,
        p_result OUT VARCHAR2
    ) IS
        v_count NUMBER := 0;
        v_errors NUMBER := 0;
        v_payment_json CLOB;
        v_result VARCHAR2(4000);
    BEGIN
        -- Loop through JSON array
        FOR rec IN (
            SELECT jt.payment_data
            FROM JSON_TABLE(p_json_data, '$[*]'
                COLUMNS (
                    payment_data CLOB FORMAT JSON PATH '$'
                )
            ) jt
        ) LOOP
            BEGIN
                save_payment(rec.payment_data, v_result);
                IF INSTR(v_result, '"status": "success"') > 0 THEN
                    v_count := v_count + 1;
                ELSE
                    v_errors := v_errors + 1;
                END IF;
            EXCEPTION
                WHEN OTHERS THEN
                    v_errors := v_errors + 1;
            END;
        END LOOP;

        p_result := '{"status": "success", "saved": ' || v_count || ', "errors": ' || v_errors || '}';

    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{"status": "error", "message": "' || REPLACE(SQLERRM, '"', '\"') || '"}';
    END save_payments_bulk;

    -- Save payments from items format
    PROCEDURE save_payments_from_items(
        p_json_data IN CLOB,
        p_result OUT VARCHAR2
    ) IS
        v_count NUMBER := 0;
        v_errors NUMBER := 0;
        v_result VARCHAR2(4000);
    BEGIN
        -- Loop through items array
        FOR rec IN (
            SELECT jt.payment_data
            FROM JSON_TABLE(p_json_data, '$.items[*]'
                COLUMNS (
                    payment_data CLOB FORMAT JSON PATH '$'
                )
            ) jt
        ) LOOP
            BEGIN
                save_payment(rec.payment_data, v_result);
                IF INSTR(v_result, '"status": "success"') > 0 THEN
                    v_count := v_count + 1;
                ELSE
                    v_errors := v_errors + 1;
                END IF;
            EXCEPTION
                WHEN OTHERS THEN
                    v_errors := v_errors + 1;
            END;
        END LOOP;

        p_result := '{"status": "success", "saved": ' || v_count || ', "errors": ' || v_errors || '}';

    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{"status": "error", "message": "' || REPLACE(SQLERRM, '"', '\"') || '"}';
    END save_payments_from_items;

    -- Get payment by Check ID
    FUNCTION get_payment_by_check_id(
        p_check_id IN NUMBER
    ) RETURN CLOB IS
        v_result CLOB;
    BEGIN
        SELECT JSON_OBJECT(
            'CheckId' VALUE CHECK_ID,
            'PaymentId' VALUE PAYMENT_ID,
            'PaymentReference' VALUE PAYMENT_REFERENCE,
            'PaymentNumber' VALUE PAYMENT_NUMBER,
            'PaymentAmount' VALUE PAYMENT_AMOUNT,
            'PaymentDate' VALUE TO_CHAR(PAYMENT_DATE, 'YYYY-MM-DD'),
            'PaymentStatus' VALUE PAYMENT_STATUS,
            'PaymentType' VALUE PAYMENT_TYPE,
            'PaymentCurrency' VALUE PAYMENT_CURRENCY,
            'Payee' VALUE PAYEE,
            'SupplierNumber' VALUE SUPPLIER_NUMBER,
            'BusinessUnit' VALUE BUSINESS_UNIT,
            'LegalEntity' VALUE LEGAL_ENTITY,
            'PaymentMethod' VALUE PAYMENT_METHOD,
            'ClearingDate' VALUE TO_CHAR(CLEARING_DATE, 'YYYY-MM-DD'),
            'ClearingAmount' VALUE CLEARING_AMOUNT,
            'AccountingStatus' VALUE ACCOUNTING_STATUS,
            'DisbursementBankAccountName' VALUE DISBURSEMENT_BANK_ACCOUNT_NAME,
            'SyncStatus' VALUE SYNC_STATUS
            RETURNING CLOB
        )
        INTO v_result
        FROM RR_AP_PAYMENTS_ALL
        WHERE CHECK_ID = p_check_id;

        RETURN v_result;

    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RETURN '{"status": "error", "message": "Payment not found"}';
        WHEN OTHERS THEN
            RETURN '{"status": "error", "message": "' || REPLACE(SQLERRM, '"', '\"') || '"}';
    END get_payment_by_check_id;

    -- Get payments with filters
    FUNCTION get_payments(
        p_payment_number    IN NUMBER DEFAULT NULL,
        p_payment_status    IN VARCHAR2 DEFAULT NULL,
        p_payee             IN VARCHAR2 DEFAULT NULL,
        p_supplier_number   IN VARCHAR2 DEFAULT NULL,
        p_business_unit     IN VARCHAR2 DEFAULT NULL,
        p_date_from         IN DATE DEFAULT NULL,
        p_date_to           IN DATE DEFAULT NULL,
        p_limit             IN NUMBER DEFAULT 100,
        p_offset            IN NUMBER DEFAULT 0
    ) RETURN CLOB IS
        v_result CLOB;
        v_count NUMBER;
    BEGIN
        -- Get total count
        SELECT COUNT(*)
        INTO v_count
        FROM RR_AP_PAYMENTS_ALL
        WHERE (p_payment_number IS NULL OR PAYMENT_NUMBER = p_payment_number)
          AND (p_payment_status IS NULL OR PAYMENT_STATUS = p_payment_status)
          AND (p_payee IS NULL OR UPPER(PAYEE) LIKE '%' || UPPER(p_payee) || '%')
          AND (p_supplier_number IS NULL OR SUPPLIER_NUMBER = p_supplier_number)
          AND (p_business_unit IS NULL OR BUSINESS_UNIT = p_business_unit)
          AND (p_date_from IS NULL OR PAYMENT_DATE >= p_date_from)
          AND (p_date_to IS NULL OR PAYMENT_DATE <= p_date_to);

        -- Get paginated results
        SELECT JSON_OBJECT(
            'count' VALUE v_count,
            'limit' VALUE p_limit,
            'offset' VALUE p_offset,
            'items' VALUE (
                SELECT JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'CheckId' VALUE CHECK_ID,
                        'PaymentId' VALUE PAYMENT_ID,
                        'PaymentNumber' VALUE PAYMENT_NUMBER,
                        'PaymentAmount' VALUE PAYMENT_AMOUNT,
                        'PaymentDate' VALUE TO_CHAR(PAYMENT_DATE, 'YYYY-MM-DD'),
                        'PaymentStatus' VALUE PAYMENT_STATUS,
                        'PaymentType' VALUE PAYMENT_TYPE,
                        'PaymentCurrency' VALUE PAYMENT_CURRENCY,
                        'Payee' VALUE PAYEE,
                        'SupplierNumber' VALUE SUPPLIER_NUMBER,
                        'BusinessUnit' VALUE BUSINESS_UNIT,
                        'PaymentMethod' VALUE PAYMENT_METHOD,
                        'AccountingStatus' VALUE ACCOUNTING_STATUS
                    ) ORDER BY PAYMENT_DATE DESC
                    RETURNING CLOB
                )
                FROM (
                    SELECT *
                    FROM RR_AP_PAYMENTS_ALL
                    WHERE (p_payment_number IS NULL OR PAYMENT_NUMBER = p_payment_number)
                      AND (p_payment_status IS NULL OR PAYMENT_STATUS = p_payment_status)
                      AND (p_payee IS NULL OR UPPER(PAYEE) LIKE '%' || UPPER(p_payee) || '%')
                      AND (p_supplier_number IS NULL OR SUPPLIER_NUMBER = p_supplier_number)
                      AND (p_business_unit IS NULL OR BUSINESS_UNIT = p_business_unit)
                      AND (p_date_from IS NULL OR PAYMENT_DATE >= p_date_from)
                      AND (p_date_to IS NULL OR PAYMENT_DATE <= p_date_to)
                    ORDER BY PAYMENT_DATE DESC
                    OFFSET p_offset ROWS FETCH NEXT p_limit ROWS ONLY
                )
            )
            RETURNING CLOB
        )
        INTO v_result
        FROM DUAL;

        RETURN v_result;

    EXCEPTION
        WHEN OTHERS THEN
            RETURN '{"status": "error", "message": "' || REPLACE(SQLERRM, '"', '\"') || '"}';
    END get_payments;

END XXAP_PAYMENTS_PKG;
/
