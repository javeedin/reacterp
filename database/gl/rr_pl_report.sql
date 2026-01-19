-- ============================================================================
-- P&L Report Generation Function
-- ============================================================================
-- Generates a P&L statement by mapping GL balances to template structure
-- ============================================================================

-- Add the get_pl_report function to the existing package
CREATE OR REPLACE PACKAGE rr_pl_template_pkg AS

    -- Existing functions
    FUNCTION get_template_structure(p_template_id NUMBER) RETURN CLOB;
    FUNCTION get_templates RETURN CLOB;

    PROCEDURE create_template(
        p_template_code VARCHAR2,
        p_template_name VARCHAR2,
        p_description VARCHAR2 DEFAULT NULL,
        p_template_type VARCHAR2 DEFAULT 'CUSTOM',
        p_template_id OUT NUMBER
    );

    PROCEDURE add_group(
        p_template_id NUMBER,
        p_group_code VARCHAR2,
        p_group_name VARCHAR2,
        p_group_label VARCHAR2,
        p_group_type VARCHAR2,
        p_display_order NUMBER,
        p_sign_convention NUMBER DEFAULT 1,
        p_group_id OUT NUMBER
    );

    PROCEDURE add_section(
        p_group_id NUMBER,
        p_section_code VARCHAR2,
        p_section_name VARCHAR2,
        p_section_label VARCHAR2,
        p_display_order NUMBER,
        p_section_id OUT NUMBER
    );

    PROCEDURE assign_account(
        p_section_id NUMBER,
        p_account_code VARCHAR2,
        p_account_from VARCHAR2 DEFAULT NULL,
        p_account_to VARCHAR2 DEFAULT NULL
    );

    PROCEDURE add_total(
        p_template_id NUMBER,
        p_total_code VARCHAR2,
        p_total_name VARCHAR2,
        p_calculation_formula VARCHAR2,
        p_display_order NUMBER,
        p_after_group_code VARCHAR2 DEFAULT NULL
    );

    PROCEDURE clone_template(
        p_source_template_id NUMBER,
        p_new_template_code VARCHAR2,
        p_new_template_name VARCHAR2,
        p_new_template_id OUT NUMBER
    );

    -- NEW: Generate P&L Report
    FUNCTION get_pl_report(
        p_template_id   IN NUMBER,
        p_period_year   IN NUMBER,
        p_period_num    IN NUMBER,
        p_ledger_id     IN NUMBER DEFAULT 1
    ) RETURN CLOB;

    -- NEW: Get Section Accounts with Period Balances
    FUNCTION get_section_accounts(
        p_template_id   IN NUMBER,
        p_section_code  IN VARCHAR2,
        p_period_name   IN VARCHAR2,
        p_ledger_id     IN NUMBER DEFAULT NULL
    ) RETURN CLOB;

END rr_pl_template_pkg;
/

CREATE OR REPLACE PACKAGE BODY rr_pl_template_pkg AS

    -- Helper function to escape JSON string values
    FUNCTION escape_json(p_str IN VARCHAR2) RETURN VARCHAR2
    IS
        v_result VARCHAR2(4000);
    BEGIN
        IF p_str IS NULL THEN
            RETURN 'null';
        END IF;
        v_result := p_str;
        v_result := REPLACE(v_result, CHR(92), CHR(92) || CHR(92));
        v_result := REPLACE(v_result, CHR(34), CHR(92) || CHR(34));
        v_result := REPLACE(v_result, CHR(10), CHR(92) || 'n');
        v_result := REPLACE(v_result, CHR(13), CHR(92) || 'r');
        v_result := REPLACE(v_result, CHR(9), CHR(92) || 't');
        RETURN CHR(34) || v_result || CHR(34);
    END escape_json;

    -- Get template structure as JSON (existing function)
    FUNCTION get_template_structure(p_template_id IN NUMBER) RETURN CLOB
    IS
        v_result CLOB;
        v_groups CLOB;
        v_sections CLOB;
        v_accounts CLOB;
        v_totals CLOB;
        v_first_group BOOLEAN := TRUE;
        v_first_section BOOLEAN;
        v_first_account BOOLEAN;
        v_first_total BOOLEAN;
        v_template_code VARCHAR2(50);
        v_template_name VARCHAR2(200);
        v_description VARCHAR2(1000);
        v_template_type VARCHAR2(50);
        v_is_default VARCHAR2(1);
        v_count NUMBER;
    BEGIN
        SELECT COUNT(*) INTO v_count
        FROM rr_pl_templates
        WHERE template_id = p_template_id AND is_active = 'Y';

        IF v_count = 0 THEN
            RETURN '{"error":"Template not found","template_id":' || p_template_id || '}';
        END IF;

        SELECT template_code, template_name, description, template_type, is_default
        INTO v_template_code, v_template_name, v_description, v_template_type, v_is_default
        FROM rr_pl_templates
        WHERE template_id = p_template_id;

        v_groups := '[';
        FOR grp IN (
            SELECT group_id, group_code, group_name, group_label, group_type,
                   display_order, sign_convention, show_subtotal, subtotal_label
            FROM rr_pl_groups
            WHERE template_id = p_template_id AND is_active = 'Y'
            ORDER BY display_order
        ) LOOP
            IF NOT v_first_group THEN
                v_groups := v_groups || ',';
            END IF;
            v_first_group := FALSE;

            v_sections := '[';
            v_first_section := TRUE;
            FOR sec IN (
                SELECT section_id, section_code, section_name, section_label, display_order
                FROM rr_pl_sections
                WHERE group_id = grp.group_id AND is_active = 'Y'
                ORDER BY display_order
            ) LOOP
                IF NOT v_first_section THEN
                    v_sections := v_sections || ',';
                END IF;
                v_first_section := FALSE;

                v_accounts := '[';
                v_first_account := TRUE;
                FOR acct IN (
                    SELECT section_account_id, account_code, account_from, account_to,
                           (SELECT g.description FROM gl_code_combinations g WHERE g.account = a.account_code AND ROWNUM = 1) as account_description
                    FROM rr_pl_section_accounts a
                    WHERE section_id = sec.section_id AND is_active = 'Y'
                    ORDER BY display_order
                ) LOOP
                    IF NOT v_first_account THEN
                        v_accounts := v_accounts || ',';
                    END IF;
                    v_first_account := FALSE;

                    v_accounts := v_accounts || '{' ||
                        '"section_account_id":' || acct.section_account_id || ',' ||
                        '"account_code":' || escape_json(acct.account_code) || ',' ||
                        '"account_description":' || escape_json(acct.account_description) || ',' ||
                        '"account_from":' || escape_json(acct.account_from) || ',' ||
                        '"account_to":' || escape_json(acct.account_to) ||
                    '}';
                END LOOP;
                v_accounts := v_accounts || ']';

                v_sections := v_sections || '{' ||
                    '"section_id":' || sec.section_id || ',' ||
                    '"section_code":' || escape_json(sec.section_code) || ',' ||
                    '"section_name":' || escape_json(sec.section_name) || ',' ||
                    '"section_label":' || escape_json(sec.section_label) || ',' ||
                    '"display_order":' || sec.display_order || ',' ||
                    '"accounts":' || v_accounts ||
                '}';
            END LOOP;
            v_sections := v_sections || ']';

            v_groups := v_groups || '{' ||
                '"group_id":' || grp.group_id || ',' ||
                '"group_code":' || escape_json(grp.group_code) || ',' ||
                '"group_name":' || escape_json(grp.group_name) || ',' ||
                '"group_label":' || escape_json(grp.group_label) || ',' ||
                '"group_type":' || escape_json(grp.group_type) || ',' ||
                '"display_order":' || grp.display_order || ',' ||
                '"sign_convention":' || grp.sign_convention || ',' ||
                '"show_subtotal":' || escape_json(grp.show_subtotal) || ',' ||
                '"subtotal_label":' || escape_json(grp.subtotal_label) || ',' ||
                '"sections":' || v_sections ||
            '}';
        END LOOP;
        v_groups := v_groups || ']';

        v_totals := '[';
        v_first_total := TRUE;
        FOR tot IN (
            SELECT total_id, total_code, total_name, total_label, calculation_formula,
                   display_order, after_group_code, font_style, row_style
            FROM rr_pl_totals
            WHERE template_id = p_template_id AND is_active = 'Y'
            ORDER BY display_order
        ) LOOP
            IF NOT v_first_total THEN
                v_totals := v_totals || ',';
            END IF;
            v_first_total := FALSE;

            v_totals := v_totals || '{' ||
                '"total_id":' || tot.total_id || ',' ||
                '"total_code":' || escape_json(tot.total_code) || ',' ||
                '"total_name":' || escape_json(tot.total_name) || ',' ||
                '"total_label":' || escape_json(tot.total_label) || ',' ||
                '"calculation_formula":' || escape_json(tot.calculation_formula) || ',' ||
                '"display_order":' || tot.display_order || ',' ||
                '"after_group_code":' || escape_json(tot.after_group_code) || ',' ||
                '"font_style":' || escape_json(tot.font_style) || ',' ||
                '"row_style":' || escape_json(tot.row_style) ||
            '}';
        END LOOP;
        v_totals := v_totals || ']';

        v_result := '{"template":{' ||
            '"template_id":' || p_template_id || ',' ||
            '"template_code":' || escape_json(v_template_code) || ',' ||
            '"template_name":' || escape_json(v_template_name) || ',' ||
            '"description":' || escape_json(v_description) || ',' ||
            '"template_type":' || escape_json(v_template_type) || ',' ||
            '"is_default":' || escape_json(v_is_default) || ',' ||
            '"groups":' || v_groups || ',' ||
            '"totals":' || v_totals ||
        '}}';

        RETURN v_result;
    END get_template_structure;

    -- Get template list (existing function)
    FUNCTION get_templates RETURN CLOB
    IS
        v_result CLOB;
        v_first BOOLEAN := TRUE;
    BEGIN
        v_result := '{"templates":[';

        FOR t IN (
            SELECT template_id, template_code, template_name, description,
                   template_type, is_active, is_default, created_date
            FROM rr_pl_templates
            WHERE is_active = 'Y'
            ORDER BY template_name
        ) LOOP
            IF NOT v_first THEN
                v_result := v_result || ',';
            END IF;
            v_first := FALSE;

            v_result := v_result || '{' ||
                '"template_id":' || t.template_id || ',' ||
                '"template_code":' || escape_json(t.template_code) || ',' ||
                '"template_name":' || escape_json(t.template_name) || ',' ||
                '"description":' || escape_json(t.description) || ',' ||
                '"template_type":' || escape_json(t.template_type) || ',' ||
                '"is_active":' || escape_json(t.is_active) || ',' ||
                '"is_default":' || escape_json(t.is_default) || ',' ||
                '"created_date":' || escape_json(TO_CHAR(t.created_date, 'YYYY-MM-DD HH24:MI:SS')) ||
            '}';
        END LOOP;

        v_result := v_result || ']}';
        RETURN v_result;
    END get_templates;

    -- Create new template (existing procedure)
    PROCEDURE create_template(
        p_template_code VARCHAR2,
        p_template_name VARCHAR2,
        p_description VARCHAR2 DEFAULT NULL,
        p_template_type VARCHAR2 DEFAULT 'CUSTOM',
        p_template_id OUT NUMBER
    ) IS
    BEGIN
        INSERT INTO rr_pl_templates (template_code, template_name, description, template_type)
        VALUES (p_template_code, p_template_name, p_description, p_template_type)
        RETURNING template_id INTO p_template_id;
        COMMIT;
    END create_template;

    -- Add group (existing procedure)
    PROCEDURE add_group(
        p_template_id NUMBER,
        p_group_code VARCHAR2,
        p_group_name VARCHAR2,
        p_group_label VARCHAR2,
        p_group_type VARCHAR2,
        p_display_order NUMBER,
        p_sign_convention NUMBER DEFAULT 1,
        p_group_id OUT NUMBER
    ) IS
    BEGIN
        INSERT INTO rr_pl_groups (template_id, group_code, group_name, group_label, group_type, display_order, sign_convention)
        VALUES (p_template_id, p_group_code, p_group_name, p_group_label, p_group_type, p_display_order, p_sign_convention)
        RETURNING group_id INTO p_group_id;
        COMMIT;
    END add_group;

    -- Add section (existing procedure)
    PROCEDURE add_section(
        p_group_id NUMBER,
        p_section_code VARCHAR2,
        p_section_name VARCHAR2,
        p_section_label VARCHAR2,
        p_display_order NUMBER,
        p_section_id OUT NUMBER
    ) IS
    BEGIN
        INSERT INTO rr_pl_sections (group_id, section_code, section_name, section_label, display_order)
        VALUES (p_group_id, p_section_code, p_section_name, p_section_label, p_display_order)
        RETURNING section_id INTO p_section_id;
        COMMIT;
    END add_section;

    -- Assign account (existing procedure)
    PROCEDURE assign_account(
        p_section_id NUMBER,
        p_account_code VARCHAR2,
        p_account_from VARCHAR2 DEFAULT NULL,
        p_account_to VARCHAR2 DEFAULT NULL
    ) IS
        v_max_order NUMBER;
    BEGIN
        SELECT NVL(MAX(display_order), 0) + 10 INTO v_max_order
        FROM rr_pl_section_accounts
        WHERE section_id = p_section_id;

        INSERT INTO rr_pl_section_accounts (section_id, account_code, account_from, account_to, display_order)
        VALUES (p_section_id, p_account_code, p_account_from, p_account_to, v_max_order);
        COMMIT;
    END assign_account;

    -- Add total (existing procedure)
    PROCEDURE add_total(
        p_template_id NUMBER,
        p_total_code VARCHAR2,
        p_total_name VARCHAR2,
        p_calculation_formula VARCHAR2,
        p_display_order NUMBER,
        p_after_group_code VARCHAR2 DEFAULT NULL
    ) IS
    BEGIN
        INSERT INTO rr_pl_totals (template_id, total_code, total_name, total_label, calculation_formula, display_order, after_group_code)
        VALUES (p_template_id, p_total_code, p_total_name, p_total_name, p_calculation_formula, p_display_order, p_after_group_code);
        COMMIT;
    END add_total;

    -- Clone template (existing procedure)
    PROCEDURE clone_template(
        p_source_template_id NUMBER,
        p_new_template_code VARCHAR2,
        p_new_template_name VARCHAR2,
        p_new_template_id OUT NUMBER
    ) IS
        v_new_group_id NUMBER;
        v_new_section_id NUMBER;
        v_description VARCHAR2(1000);
        v_ledger_id NUMBER;
        v_currency_code VARCHAR2(10);
    BEGIN
        SELECT description, ledger_id, currency_code
        INTO v_description, v_ledger_id, v_currency_code
        FROM rr_pl_templates
        WHERE template_id = p_source_template_id;

        INSERT INTO rr_pl_templates (template_code, template_name, description, template_type, ledger_id, currency_code)
        VALUES (p_new_template_code, p_new_template_name, v_description, 'CUSTOM', v_ledger_id, v_currency_code)
        RETURNING template_id INTO p_new_template_id;

        FOR grp IN (SELECT * FROM rr_pl_groups WHERE template_id = p_source_template_id AND is_active = 'Y') LOOP
            INSERT INTO rr_pl_groups (template_id, group_code, group_name, group_label, group_type, display_order,
                sign_convention, show_subtotal, subtotal_label, is_calculated, calculation_formula, indent_level, font_style)
            VALUES (p_new_template_id, grp.group_code, grp.group_name, grp.group_label, grp.group_type, grp.display_order,
                grp.sign_convention, grp.show_subtotal, grp.subtotal_label, grp.is_calculated, grp.calculation_formula, grp.indent_level, grp.font_style)
            RETURNING group_id INTO v_new_group_id;

            FOR sec IN (SELECT * FROM rr_pl_sections WHERE group_id = grp.group_id AND is_active = 'Y') LOOP
                INSERT INTO rr_pl_sections (group_id, section_code, section_name, section_label, display_order,
                    show_subtotal, subtotal_label, indent_level, font_style)
                VALUES (v_new_group_id, sec.section_code, sec.section_name, sec.section_label, sec.display_order,
                    sec.show_subtotal, sec.subtotal_label, sec.indent_level, sec.font_style)
                RETURNING section_id INTO v_new_section_id;

                INSERT INTO rr_pl_section_accounts (section_id, account_code, account_from, account_to, include_children, display_order)
                SELECT v_new_section_id, account_code, account_from, account_to, include_children, display_order
                FROM rr_pl_section_accounts
                WHERE section_id = sec.section_id AND is_active = 'Y';
            END LOOP;
        END LOOP;

        INSERT INTO rr_pl_totals (template_id, total_code, total_name, total_label, calculation_formula,
            display_order, after_group_code, indent_level, font_style, row_style)
        SELECT p_new_template_id, total_code, total_name, total_label, calculation_formula,
            display_order, after_group_code, indent_level, font_style, row_style
        FROM rr_pl_totals
        WHERE template_id = p_source_template_id AND is_active = 'Y';

        COMMIT;
    END clone_template;

    -- ========================================================================
    -- NEW: Generate P&L Report
    -- ========================================================================
    FUNCTION get_pl_report(
        p_template_id   IN NUMBER,
        p_period_year   IN NUMBER,
        p_period_num    IN NUMBER,
        p_ledger_id     IN NUMBER DEFAULT 1
    ) RETURN CLOB
    IS
        v_result CLOB;
        v_rows CLOB;
        v_first_row BOOLEAN := TRUE;
        v_template_name VARCHAR2(200);
        v_template_code VARCHAR2(50);
        v_period_name VARCHAR2(30);
        v_count NUMBER;

        -- Variables for calculations
        v_section_amount NUMBER;
        v_group_amount NUMBER;
        v_row_order NUMBER := 0;

        -- Associative array to store group and total values for formula evaluation
        TYPE t_values IS TABLE OF NUMBER INDEX BY VARCHAR2(50);
        v_group_values t_values;
        v_total_values t_values;

        -- Function to evaluate formula like "G1+G2" or "T1-G3"
        FUNCTION evaluate_formula(p_formula VARCHAR2) RETURN NUMBER
        IS
            v_formula VARCHAR2(500);
            v_value NUMBER := 0;
            v_term VARCHAR2(50);
            v_sign NUMBER := 1;
            v_i NUMBER := 1;
            v_char CHAR(1);
            v_code VARCHAR2(50);
        BEGIN
            IF p_formula IS NULL THEN
                RETURN 0;
            END IF;

            v_formula := UPPER(REPLACE(REPLACE(p_formula, ' ', ''), CHR(9), ''));
            v_term := '';

            FOR v_i IN 1..LENGTH(v_formula) + 1 LOOP
                IF v_i <= LENGTH(v_formula) THEN
                    v_char := SUBSTR(v_formula, v_i, 1);
                ELSE
                    v_char := '+'; -- Force processing of last term
                END IF;

                IF v_char IN ('+', '-') THEN
                    IF v_term IS NOT NULL THEN
                        v_code := TRIM(v_term);
                        IF v_code LIKE 'G%' THEN
                            IF v_group_values.EXISTS(v_code) THEN
                                v_value := v_value + (v_sign * v_group_values(v_code));
                            END IF;
                        ELSIF v_code LIKE 'T%' THEN
                            IF v_total_values.EXISTS(v_code) THEN
                                v_value := v_value + (v_sign * v_total_values(v_code));
                            END IF;
                        END IF;
                    END IF;
                    v_term := '';
                    v_sign := CASE WHEN v_char = '-' THEN -1 ELSE 1 END;
                ELSE
                    v_term := v_term || v_char;
                END IF;
            END LOOP;

            RETURN v_value;
        END evaluate_formula;

    BEGIN
        -- Check if template exists
        SELECT COUNT(*) INTO v_count
        FROM rr_pl_templates
        WHERE template_id = p_template_id AND is_active = 'Y';

        IF v_count = 0 THEN
            RETURN '{"error":"Template not found","template_id":' || p_template_id || '}';
        END IF;

        -- Get template info
        SELECT template_code, template_name
        INTO v_template_code, v_template_name
        FROM rr_pl_templates
        WHERE template_id = p_template_id;

        -- Get period name
        BEGIN
            SELECT period_name INTO v_period_name
            FROM rr_gl_balances
            WHERE period_year = p_period_year
              AND period_num = p_period_num
              AND ROWNUM = 1;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                v_period_name := TO_CHAR(p_period_year) || '-' || LPAD(p_period_num, 2, '0');
        END;

        v_rows := '[';

        -- Process each group
        FOR grp IN (
            SELECT group_id, group_code, group_name, group_label, group_type,
                   display_order, sign_convention, show_subtotal, subtotal_label
            FROM rr_pl_groups
            WHERE template_id = p_template_id AND is_active = 'Y'
            ORDER BY display_order
        ) LOOP
            v_group_amount := 0;

            -- Add group header row
            v_row_order := v_row_order + 1;
            IF NOT v_first_row THEN
                v_rows := v_rows || ',';
            END IF;
            v_first_row := FALSE;

            v_rows := v_rows || '{' ||
                '"row_order":' || v_row_order || ',' ||
                '"row_type":"group_header",' ||
                '"code":' || escape_json(grp.group_code) || ',' ||
                '"label":' || escape_json(NVL(grp.group_label, grp.group_name)) || ',' ||
                '"group_type":' || escape_json(grp.group_type) || ',' ||
                '"indent":0,' ||
                '"amount":null,' ||
                '"style":"bold"' ||
            '}';

            -- Process sections within group
            FOR sec IN (
                SELECT section_id, section_code, section_name, section_label, display_order
                FROM rr_pl_sections
                WHERE group_id = grp.group_id AND is_active = 'Y'
                ORDER BY display_order
            ) LOOP
                v_section_amount := 0;

                DECLARE
                    v_accounts CLOB := '[';
                    v_first_acct BOOLEAN := TRUE;
                BEGIN
                    -- Calculate section amount from GL balances and collect account details
                    FOR acct IN (
                        SELECT account_code, account_from, account_to
                        FROM rr_pl_section_accounts
                        WHERE section_id = sec.section_id AND is_active = 'Y'
                    ) LOOP
                        IF acct.account_from IS NOT NULL AND acct.account_to IS NOT NULL THEN
                            -- Account range - get individual accounts
                            FOR bal IN (
                                SELECT b.account,
                                       NVL((SELECT g.description FROM gl_code_combinations g WHERE g.account = b.account AND ROWNUM = 1), b.account) as description,
                                       NVL(b.closing_balance, 0) as closing_balance
                                FROM rr_gl_balances b
                                WHERE b.period_year = p_period_year
                                  AND b.period_num = p_period_num
                                  AND b.ledger_id = p_ledger_id
                                  AND b.account >= acct.account_from
                                  AND b.account <= acct.account_to
                                ORDER BY b.account
                            ) LOOP
                                IF NOT v_first_acct THEN
                                    v_accounts := v_accounts || ',';
                                END IF;
                                v_first_acct := FALSE;

                                v_accounts := v_accounts || '{' ||
                                    '"account":' || escape_json(bal.account) || ',' ||
                                    '"description":' || escape_json(bal.description) || ',' ||
                                    '"tb_balance":' || bal.closing_balance || ',' ||
                                    '"amount":' || (bal.closing_balance * grp.sign_convention) ||
                                '}';

                                v_section_amount := v_section_amount + bal.closing_balance;
                            END LOOP;
                        ELSE
                            -- Single account
                            FOR bal IN (
                                SELECT b.account,
                                       NVL((SELECT g.description FROM gl_code_combinations g WHERE g.account = b.account AND ROWNUM = 1), acct.account_code) as description,
                                       NVL(b.closing_balance, 0) as closing_balance
                                FROM rr_gl_balances b
                                WHERE b.period_year = p_period_year
                                  AND b.period_num = p_period_num
                                  AND b.ledger_id = p_ledger_id
                                  AND b.account = acct.account_code
                            ) LOOP
                                IF NOT v_first_acct THEN
                                    v_accounts := v_accounts || ',';
                                END IF;
                                v_first_acct := FALSE;

                                v_accounts := v_accounts || '{' ||
                                    '"account":' || escape_json(bal.account) || ',' ||
                                    '"description":' || escape_json(bal.description) || ',' ||
                                    '"tb_balance":' || bal.closing_balance || ',' ||
                                    '"amount":' || (bal.closing_balance * grp.sign_convention) ||
                                '}';

                                v_section_amount := v_section_amount + bal.closing_balance;
                            END LOOP;
                        END IF;
                    END LOOP;

                    v_accounts := v_accounts || ']';

                    -- Apply sign convention
                    v_section_amount := v_section_amount * grp.sign_convention;
                    v_group_amount := v_group_amount + v_section_amount;

                    -- Add section row with accounts array
                    v_row_order := v_row_order + 1;
                    v_rows := v_rows || ',{' ||
                        '"row_order":' || v_row_order || ',' ||
                        '"row_type":"section",' ||
                        '"code":' || escape_json(sec.section_code) || ',' ||
                        '"label":' || escape_json(NVL(sec.section_label, sec.section_name)) || ',' ||
                        '"group_type":' || escape_json(grp.group_type) || ',' ||
                        '"indent":1,' ||
                        '"amount":' || v_section_amount || ',' ||
                        '"style":"normal",' ||
                        '"accounts":' || v_accounts ||
                    '}';
                END;
            END LOOP;

            -- Store group total for formula evaluation
            v_group_values(grp.group_code) := v_group_amount;

            -- Add group total row if show_subtotal = 'Y'
            IF grp.show_subtotal = 'Y' THEN
                v_row_order := v_row_order + 1;
                v_rows := v_rows || ',{' ||
                    '"row_order":' || v_row_order || ',' ||
                    '"row_type":"group_total",' ||
                    '"code":' || escape_json(grp.group_code) || ',' ||
                    '"label":' || escape_json(NVL(grp.subtotal_label, 'Total ' || grp.group_name)) || ',' ||
                    '"group_type":' || escape_json(grp.group_type) || ',' ||
                    '"indent":0,' ||
                    '"amount":' || v_group_amount || ',' ||
                    '"style":"bold"' ||
                '}';
            END IF;

            -- Check for totals that should appear after this group
            FOR tot IN (
                SELECT total_id, total_code, total_name, total_label, calculation_formula,
                       font_style, row_style
                FROM rr_pl_totals
                WHERE template_id = p_template_id
                  AND is_active = 'Y'
                  AND after_group_code = grp.group_code
                ORDER BY display_order
            ) LOOP
                DECLARE
                    v_total_amount NUMBER;
                BEGIN
                    v_total_amount := evaluate_formula(tot.calculation_formula);
                    v_total_values(tot.total_code) := v_total_amount;

                    v_row_order := v_row_order + 1;
                    v_rows := v_rows || ',{' ||
                        '"row_order":' || v_row_order || ',' ||
                        '"row_type":"calculated_total",' ||
                        '"code":' || escape_json(tot.total_code) || ',' ||
                        '"label":' || escape_json(NVL(tot.total_label, tot.total_name)) || ',' ||
                        '"group_type":"TOTAL",' ||
                        '"indent":0,' ||
                        '"amount":' || v_total_amount || ',' ||
                        '"style":' || escape_json(LOWER(NVL(tot.font_style, 'bold'))) || ',' ||
                        '"row_style":' || escape_json(LOWER(NVL(tot.row_style, 'highlight'))) ||
                    '}';
                END;
            END LOOP;
        END LOOP;

        -- Add any remaining totals without after_group_code
        FOR tot IN (
            SELECT total_id, total_code, total_name, total_label, calculation_formula,
                   font_style, row_style
            FROM rr_pl_totals
            WHERE template_id = p_template_id
              AND is_active = 'Y'
              AND after_group_code IS NULL
            ORDER BY display_order
        ) LOOP
            DECLARE
                v_total_amount NUMBER;
            BEGIN
                v_total_amount := evaluate_formula(tot.calculation_formula);
                v_total_values(tot.total_code) := v_total_amount;

                v_row_order := v_row_order + 1;
                v_rows := v_rows || ',{' ||
                    '"row_order":' || v_row_order || ',' ||
                    '"row_type":"calculated_total",' ||
                    '"code":' || escape_json(tot.total_code) || ',' ||
                    '"label":' || escape_json(NVL(tot.total_label, tot.total_name)) || ',' ||
                    '"group_type":"TOTAL",' ||
                    '"indent":0,' ||
                    '"amount":' || v_total_amount || ',' ||
                    '"style":' || escape_json(LOWER(NVL(tot.font_style, 'bold'))) || ',' ||
                    '"row_style":' || escape_json(LOWER(NVL(tot.row_style, 'highlight'))) ||
                '}';
            END;
        END LOOP;

        v_rows := v_rows || ']';

        -- Build final result
        v_result := '{' ||
            '"report":{' ||
                '"template_id":' || p_template_id || ',' ||
                '"template_code":' || escape_json(v_template_code) || ',' ||
                '"template_name":' || escape_json(v_template_name) || ',' ||
                '"period_year":' || p_period_year || ',' ||
                '"period_num":' || p_period_num || ',' ||
                '"period_name":' || escape_json(v_period_name) || ',' ||
                '"ledger_id":' || p_ledger_id || ',' ||
                '"generated_at":' || escape_json(TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')) || ',' ||
                '"rows":' || v_rows ||
            '}' ||
        '}';

        RETURN v_result;
    END get_pl_report;

    -- ============================================================================
    -- Get Section Accounts with Period Balances
    -- ============================================================================
    FUNCTION get_section_accounts(
        p_template_id   IN NUMBER,
        p_section_code  IN VARCHAR2,
        p_period_name   IN VARCHAR2,
        p_ledger_id     IN NUMBER DEFAULT NULL
    ) RETURN CLOB
    IS
        v_result CLOB;
        v_accounts CLOB := '[';
        v_first_acct BOOLEAN := TRUE;
        v_section_id NUMBER;
        v_section_name VARCHAR2(200);
        v_group_id NUMBER;
        v_sign_convention NUMBER := 1;
        v_total_amount NUMBER := 0;
        v_period_year NUMBER;
        v_period_num NUMBER;
        v_ledger_id NUMBER;
    BEGIN
        -- Get section info by template_id and section_code
        SELECT s.section_id, s.section_name, s.group_id
        INTO v_section_id, v_section_name, v_group_id
        FROM rr_pl_sections s
        JOIN rr_pl_groups g ON g.group_id = s.group_id
        WHERE g.template_id = p_template_id
          AND s.section_code = p_section_code
          AND s.is_active = 'Y'
          AND ROWNUM = 1;

        -- Get sign convention from group
        SELECT NVL(sign_convention, 1)
        INTO v_sign_convention
        FROM rr_pl_groups
        WHERE group_id = v_group_id;

        -- Parse period_name to get year and period number
        -- Expected format: "May-24" or "Jan-2024" or similar
        BEGIN
            SELECT period_year, period_num, ledger_id
            INTO v_period_year, v_period_num, v_ledger_id
            FROM gl_period_statuses
            WHERE period_name = p_period_name
              AND application_id = 101  -- General Ledger
              AND (p_ledger_id IS NULL OR ledger_id = p_ledger_id)
              AND ROWNUM = 1;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                -- Try to parse from period name format
                v_period_year := 2000 + TO_NUMBER(SUBSTR(p_period_name, -2));
                v_period_num := CASE SUBSTR(UPPER(p_period_name), 1, 3)
                    WHEN 'JAN' THEN 1 WHEN 'FEB' THEN 2 WHEN 'MAR' THEN 3
                    WHEN 'APR' THEN 4 WHEN 'MAY' THEN 5 WHEN 'JUN' THEN 6
                    WHEN 'JUL' THEN 7 WHEN 'AUG' THEN 8 WHEN 'SEP' THEN 9
                    WHEN 'OCT' THEN 10 WHEN 'NOV' THEN 11 WHEN 'DEC' THEN 12
                    ELSE 1
                END;
                v_ledger_id := p_ledger_id;
        END;

        -- Get accounts and their balances
        FOR acct IN (
            SELECT account_code, account_from, account_to
            FROM rr_pl_section_accounts
            WHERE section_id = v_section_id AND is_active = 'Y'
            ORDER BY display_order
        ) LOOP
            IF acct.account_from IS NOT NULL AND acct.account_to IS NOT NULL THEN
                -- Account range
                FOR bal IN (
                    SELECT b.account,
                           NVL((SELECT g.description FROM gl_code_combinations g
                                WHERE g.account = b.account AND ROWNUM = 1), b.account) as description,
                           NVL(b.closing_balance, 0) as closing_balance
                    FROM rr_gl_balances b
                    WHERE b.period_year = v_period_year
                      AND b.period_num = v_period_num
                      AND (v_ledger_id IS NULL OR b.ledger_id = v_ledger_id)
                      AND b.account >= acct.account_from
                      AND b.account <= acct.account_to
                    ORDER BY b.account
                ) LOOP
                    IF NOT v_first_acct THEN
                        v_accounts := v_accounts || ',';
                    END IF;
                    v_first_acct := FALSE;

                    v_accounts := v_accounts || '{' ||
                        '"account":' || escape_json(bal.account) || ',' ||
                        '"description":' || escape_json(bal.description) || ',' ||
                        '"tb_balance":' || bal.closing_balance || ',' ||
                        '"amount":' || (bal.closing_balance * v_sign_convention) ||
                    '}';

                    v_total_amount := v_total_amount + (bal.closing_balance * v_sign_convention);
                END LOOP;
            ELSIF acct.account_code IS NOT NULL THEN
                -- Single account
                FOR bal IN (
                    SELECT b.account,
                           NVL((SELECT g.description FROM gl_code_combinations g
                                WHERE g.account = b.account AND ROWNUM = 1), acct.account_code) as description,
                           NVL(b.closing_balance, 0) as closing_balance
                    FROM rr_gl_balances b
                    WHERE b.period_year = v_period_year
                      AND b.period_num = v_period_num
                      AND (v_ledger_id IS NULL OR b.ledger_id = v_ledger_id)
                      AND b.account = acct.account_code
                ) LOOP
                    IF NOT v_first_acct THEN
                        v_accounts := v_accounts || ',';
                    END IF;
                    v_first_acct := FALSE;

                    v_accounts := v_accounts || '{' ||
                        '"account":' || escape_json(bal.account) || ',' ||
                        '"description":' || escape_json(bal.description) || ',' ||
                        '"tb_balance":' || bal.closing_balance || ',' ||
                        '"amount":' || (bal.closing_balance * v_sign_convention) ||
                    '}';

                    v_total_amount := v_total_amount + (bal.closing_balance * v_sign_convention);
                END LOOP;
            END IF;
        END LOOP;

        v_accounts := v_accounts || ']';

        -- Build result JSON
        v_result := '{' ||
            '"template_id":' || p_template_id || ',' ||
            '"section_id":' || v_section_id || ',' ||
            '"section_code":' || escape_json(p_section_code) || ',' ||
            '"section_name":' || escape_json(v_section_name) || ',' ||
            '"period_name":' || escape_json(p_period_name) || ',' ||
            '"period_year":' || v_period_year || ',' ||
            '"period_num":' || v_period_num || ',' ||
            '"sign_convention":' || v_sign_convention || ',' ||
            '"total_amount":' || v_total_amount || ',' ||
            '"accounts":' || v_accounts ||
        '}';

        RETURN v_result;
    EXCEPTION
        WHEN OTHERS THEN
            RETURN '{"error":' || escape_json(SQLERRM) || '}';
    END get_section_accounts;

END rr_pl_template_pkg;
/

-- ============================================================================
-- APEX REST Handler for P&L Report
-- ============================================================================
-- GET /pl/report/:template_id?period_year=2024&period_num=12&ledger_id=1
-- ============================================================================

/*
-- Add this handler in APEX REST Services:

Source Type: PL/SQL
Source:

DECLARE
    v_template_id NUMBER := :template_id;
    v_period_year NUMBER := NVL(:period_year, EXTRACT(YEAR FROM SYSDATE));
    v_period_num NUMBER := NVL(:period_num, EXTRACT(MONTH FROM SYSDATE));
    v_ledger_id NUMBER := NVL(:ledger_id, 1);
    v_result CLOB;
BEGIN
    owa_util.mime_header('application/json', FALSE);
    owa_util.http_header_close;

    v_result := rr_pl_template_pkg.get_pl_report(
        p_template_id => v_template_id,
        p_period_year => v_period_year,
        p_period_num => v_period_num,
        p_ledger_id => v_ledger_id
    );

    htp.p(v_result);
EXCEPTION
    WHEN OTHERS THEN
        htp.p('{"error":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;

*/

-- ============================================================================
-- APEX REST Handler for Section Accounts
-- ============================================================================
-- GET /pl/section-accounts?template_id=1&section_code=REV001&period_name=May-24&ledger_id=123
-- ============================================================================

/*
-- Add this handler in APEX REST Services:
-- Module: reerp
-- Template: pl/section-accounts
-- Handler: GET

Source Type: PL/SQL
Source:

DECLARE
    v_template_id NUMBER := :template_id;
    v_section_code VARCHAR2(100) := :section_code;
    v_period_name VARCHAR2(100) := :period_name;
    v_ledger_id NUMBER := :ledger_id;
    v_result CLOB;
BEGIN
    owa_util.mime_header('application/json', FALSE);
    owa_util.http_header_close;

    v_result := rr_pl_template_pkg.get_section_accounts(
        p_template_id => v_template_id,
        p_section_code => v_section_code,
        p_period_name => v_period_name,
        p_ledger_id => v_ledger_id
    );

    htp.p(v_result);
EXCEPTION
    WHEN OTHERS THEN
        htp.p('{"error":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;

*/
