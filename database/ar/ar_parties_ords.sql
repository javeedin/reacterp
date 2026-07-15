-- =====================================================
-- ORDS REST Handlers: AR Parties + their Customer Accounts
--
-- Flow: search PARTIES -> drill into one PARTY -> its ACCOUNTS
--
--   GET {base}/ar/parties?q=<name|number>&status=<status>
--        Search RR_RAW_AR_HZ_PARTIES_DM (list for the search grid)
--   GET {base}/ar/parties/:partyId
--        One party's full detail (RR_RAW_AR_HZ_PARTIES_DM)
--   GET {base}/ar/parties/:partyId/accounts
--        Customer accounts for the party (RR_RAW_AR_HZ_CUST_ACCOUNTS_BIP)
--
-- Module 'ar' (same as ar/customers) — resolves under {base}/ar/...
-- NOTE: ORDS requires each bind variable to appear exactly ONCE in the
--       source SQL, so :q / :status are read once into a params CTE and
--       then referenced as columns (p.q / p.st).
--
-- Run in APEX SQL Workshop -> SQL Commands.
-- =====================================================

-- ─────────────────────────────────────────────────────
-- 1. GET /ar/parties  — search parties
-- ─────────────────────────────────────────────────────
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ar', p_pattern => 'parties');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ar',
        p_pattern     => 'parties',
        p_comments    => 'AR Parties search'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'parties',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 200,
        p_comments       => 'Search AR parties by name / number, optional status',
        p_source         => q'[
WITH params AS (
    SELECT TRIM(:q) AS q, TRIM(:status) AS st FROM DUAL
)
SELECT
    c.PARTY_ID,
    c.PARTY_NUMBER,
    c.PARTY_NAME,
    c.PARTY_TYPE,
    c.COUNTRY,
    c.ADDRESS1,
    c.ADDRESS2,
    c.CITY,
    c.STATUS
FROM RR_RAW_AR_HZ_PARTIES_DM c, params p
WHERE (
        p.q IS NULL OR p.q = ''
        OR UPPER(c.PARTY_NAME)   LIKE UPPER('%' || p.q || '%')
        OR UPPER(c.PARTY_NUMBER) LIKE UPPER('%' || p.q || '%')
      )
  AND (
        p.st IS NULL OR p.st = ''
        OR UPPER(c.STATUS) = UPPER(p.st)
      )
ORDER BY c.PARTY_NAME
]'
    );
    COMMIT;
END;
/

-- ─────────────────────────────────────────────────────
-- 2. GET /ar/parties/:partyId  — one party's detail
-- ─────────────────────────────────────────────────────
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ar', p_pattern => 'parties/:partyId');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ar',
        p_pattern     => 'parties/:partyId',
        p_comments    => 'AR Party detail'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'parties/:partyId',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 0,
        p_comments       => 'Full detail for a single party',
        p_source         => q'[
SELECT c.*
FROM RR_RAW_AR_HZ_PARTIES_DM c
WHERE c.PARTY_ID = :partyId
]'
    );
    COMMIT;
END;
/

-- ─────────────────────────────────────────────────────
-- 3. GET /ar/parties/:partyId/accounts  — accounts for a party
-- ─────────────────────────────────────────────────────
BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'ar', p_pattern => 'parties/:partyId/accounts');
    COMMIT;
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'ar',
        p_pattern     => 'parties/:partyId/accounts',
        p_comments    => 'Customer accounts for a party'
    );
    COMMIT;
END;
/

BEGIN
    ORDS.DEFINE_HANDLER(
        p_module_name    => 'ar',
        p_pattern        => 'parties/:partyId/accounts',
        p_method         => 'GET',
        p_source_type    => 'json/collection',
        p_items_per_page => 200,
        p_comments       => 'Customer accounts (RR_RAW_AR_HZ_CUST_ACCOUNTS_BIP) for the party',
        p_source         => q'[
SELECT c.*
FROM RR_RAW_AR_HZ_CUST_ACCOUNTS_BIP c
WHERE c.PARTY_ID = :partyId
ORDER BY c.ACCOUNT_NUMBER
]'
    );
    COMMIT;
END;
/

-- =====================================================
-- ENDPOINT SUMMARY
-- GET {base}/ar/parties?q=<name|number>&status=<status>   List/search parties
-- GET {base}/ar/parties/:partyId                          One party's detail
-- GET {base}/ar/parties/:partyId/accounts                 Accounts for the party
-- =====================================================

-- Verify
SELECT module_name, uri_template, method
FROM   user_ords_handlers
WHERE  module_name = 'ar'
  AND  uri_template LIKE 'parties%'
ORDER  BY uri_template;
