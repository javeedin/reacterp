"""
Configuration for Oracle Fusion to APEX sync
"""
import os

# Oracle Fusion API Configuration
ORACLE_FUSION = {
    'base_url': 'https://iaaobn.fa.ocs.oraclecloud.com/fscmRestApi/resources/11.13.18.05',
    'username': os.environ.get('ORACLE_USERNAME', 'ratheesh@buimerccorp.com'),
    'password': os.environ.get('ORACLE_PASSWORD', 'BCL#261285'),
    'default_limit': 500,
    'test_limit': 25,
    'single_limit': 1,
}

# APEX Database Configuration
APEX_DB = {
    'base_url': 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp',
    'endpoints': {
        'journal_batches': 'gl/journalbatches',
        'journal_headers': 'gl/journals/headers',
        'journal_lines': 'gl/journals/lines',
    },
}

# Job Configuration
JOBS_DIR = os.path.join(os.path.dirname(__file__), 'jobs')

# Ensure jobs directory exists
os.makedirs(JOBS_DIR, exist_ok=True)
