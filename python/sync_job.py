#!/usr/bin/env python3
"""
GL Journal Sync Job Script
Runs as a background process, updates status to JSON file
"""
import os
import sys
import json
import argparse
import requests
from datetime import datetime
from requests.auth import HTTPBasicAuth
from config import ORACLE_FUSION, APEX_DB, JOBS_DIR


def get_job_file(job_id: str) -> str:
    """Get the path to a job's status file"""
    return os.path.join(JOBS_DIR, f'{job_id}.json')


def update_job_status(job_id: str, updates: dict):
    """Update job status file"""
    job_file = get_job_file(job_id)

    # Read current status
    if os.path.exists(job_file):
        with open(job_file, 'r') as f:
            status = json.load(f)
    else:
        status = {}

    # Update
    status.update(updates)

    # Write back
    with open(job_file, 'w') as f:
        json.dump(status, f, indent=2)

    return status


def log_message(job_id: str, message: str, level: str = 'info'):
    """Log a message to the job status"""
    print(f"[{level.upper()}] {message}")
    update_job_status(job_id, {'message': message})


def fetch_from_oracle(url: str, auth) -> dict:
    """Fetch data from Oracle Fusion"""
    response = requests.get(url, auth=auth, timeout=60)
    response.raise_for_status()
    return response.json()


def post_to_apex(endpoint: str, payload: dict) -> dict:
    """Post data to APEX"""
    url = f"{APEX_DB['base_url']}/{endpoint}"
    response = requests.post(url, json=payload, timeout=60)
    response.raise_for_status()
    return response.json()


def find_child_link(links: list, link_name: str) -> str:
    """Find child link by name"""
    if not links:
        return None
    for link in links:
        if link.get('name') == link_name and link.get('rel') == 'child':
            return link.get('href')
    return None


def extract_id_from_href(href: str) -> int:
    """Extract ID from Oracle Fusion href"""
    import re
    matches = re.findall(r'/(\d+)(?:/child/|$)', href)
    if matches:
        return int(matches[-1])
    return None


def sync_gl_journals(job_id: str, mode: str, parameters: dict):
    """Main sync function for GL Journals"""

    # Setup auth
    auth = HTTPBasicAuth(ORACLE_FUSION['username'], ORACLE_FUSION['password'])

    # Determine limit based on mode
    if mode == 'single':
        limit = 1
    elif mode == 'test':
        limit = 25
    else:  # full
        limit = ORACLE_FUSION['default_limit']

    log_message(job_id, f'Starting GL Journal sync in {mode} mode (limit: {limit})')

    try:
        # ========================================
        # STEP 1: Fetch Journal Batches
        # ========================================
        update_job_status(job_id, {
            'status': 'running',
            'message': 'Fetching journal batches from Oracle Fusion...',
            'progress': 5,
        })

        # Build query URL
        base_url = ORACLE_FUSION['base_url']
        batch_url = f"{base_url}/journalBatches"

        # Build query params
        params = {'limit': str(limit)}

        # Add filters from parameters
        filters = []
        for key, value in parameters.items():
            if value:
                filters.append(f'{key}={value}')

        if filters:
            params['q'] = ';'.join(filters)

        # Add expand for child resources
        params['expand'] = 'journalHeaders,journalHeaders.journalLines'

        # Construct URL with params
        param_str = '&'.join([f'{k}={v}' for k, v in params.items()])
        full_url = f"{batch_url}?{param_str}"

        log_message(job_id, f'Fetching from: {batch_url}')

        # Fetch batches
        response = fetch_from_oracle(full_url, auth)
        batches = response.get('items', [])

        total_batches = len(batches)
        log_message(job_id, f'Found {total_batches} journal batches')

        update_job_status(job_id, {
            'total_batches': total_batches,
            'progress': 10,
        })

        if total_batches == 0:
            update_job_status(job_id, {
                'status': 'completed',
                'message': 'No batches found',
                'progress': 100,
                'end_time': datetime.now().isoformat(),
            })
            return

        # ========================================
        # STEP 2: Process Each Batch
        # ========================================
        total_headers = 0
        total_lines = 0
        total_headers_inserted = 0
        total_lines_inserted = 0
        total_batches_inserted = 0
        errors = 0

        for batch_index, batch in enumerate(batches):
            batch_id = extract_id_from_href(batch.get('links', [{}])[0].get('href', ''))
            batch_name = batch.get('JournalBatchName') or batch.get('JournalName') or f'Batch {batch_index + 1}'

            progress = 10 + int((batch_index / total_batches) * 85)

            update_job_status(job_id, {
                'processed_batches': batch_index,
                'current_batch': batch_name,
                'progress': progress,
                'message': f'Processing batch {batch_index + 1}/{total_batches}: {batch_name}',
            })

            log_message(job_id, f'Processing batch {batch_index + 1}/{total_batches}: {batch_name}')

            # Find headers link
            headers_href = find_child_link(batch.get('links', []), 'journalHeaders')

            if headers_href:
                try:
                    # Fetch headers
                    headers_response = fetch_from_oracle(headers_href, auth)
                    headers = headers_response.get('items', [])
                    total_headers += len(headers)

                    # Process each header
                    for header in headers:
                        header_id = extract_id_from_href(header.get('links', [{}])[0].get('href', ''))

                        # Insert header to APEX
                        header_payload = {
                            'batchId': batch_id,
                            'items': [{
                                'JeHeaderId': header_id,
                                **header,
                            }]
                        }

                        try:
                            post_to_apex(APEX_DB['endpoints']['journal_headers'], header_payload)
                            total_headers_inserted += 1
                        except Exception as e:
                            log_message(job_id, f'Header insert error: {e}', 'error')
                            errors += 1

                        # Fetch and insert lines
                        lines_href = find_child_link(header.get('links', []), 'journalLines')
                        if lines_href:
                            try:
                                lines_response = fetch_from_oracle(lines_href, auth)
                                lines = lines_response.get('items', [])
                                total_lines += len(lines)

                                if lines:
                                    lines_payload = {
                                        'batchId': batch_id,
                                        'jeHeaderId': header_id,
                                        'items': lines,
                                    }

                                    try:
                                        post_to_apex(APEX_DB['endpoints']['journal_lines'], lines_payload)
                                        total_lines_inserted += len(lines)
                                    except Exception as e:
                                        log_message(job_id, f'Lines insert error: {e}', 'error')
                                        errors += 1
                            except Exception as e:
                                log_message(job_id, f'Fetch lines error: {e}', 'error')
                                errors += 1

                except Exception as e:
                    log_message(job_id, f'Fetch headers error: {e}', 'error')
                    errors += 1

            # Insert batch to APEX
            batch_payload = {
                'items': [{
                    'JeBatchId': batch_id,
                    'AccountedPeriodType': batch.get('AccountedPeriodType'),
                    'DefaultPeriodName': batch.get('DefaultPeriodName'),
                    'BatchName': batch.get('JournalBatchName') or batch.get('JournalName'),
                    'Status': batch.get('Status'),
                    'ControlTotal': batch.get('ControlTotal'),
                    'BatchDescription': batch.get('Description') or batch.get('BatchDescription'),
                    'ErrorMessage': batch.get('ErrorMessage'),
                    'PostedDate': batch.get('PostedDate'),
                    'PostingRunId': batch.get('PostingRunId'),
                    'RequestId': batch.get('RequestId'),
                    'RunningTotalAccountedCr': batch.get('RunningTotalAccountedCr'),
                    'RunningTotalAccountedDr': batch.get('RunningTotalAccountedDr'),
                    'RunningTotalCr': batch.get('RunningTotalCr'),
                    'RunningTotalDr': batch.get('RunningTotalDr'),
                    'CreatedBy': batch.get('CreatedBy'),
                    'CreationDate': batch.get('CreationDate'),
                    'LastUpdateDate': batch.get('LastUpdateDate'),
                    'LastUpdatedBy': batch.get('LastUpdatedBy'),
                    'LedgerId': batch.get('LedgerId'),
                    'LedgerName': batch.get('LedgerName'),
                    'JournalName': batch.get('JournalName'),
                }]
            }

            try:
                post_to_apex(APEX_DB['endpoints']['journal_batches'], batch_payload)
                total_batches_inserted += 1
                log_message(job_id, f'Batch {batch_index + 1} inserted successfully')
            except Exception as e:
                log_message(job_id, f'Batch insert error: {e}', 'error')
                errors += 1

            # Update progress with totals
            update_job_status(job_id, {
                'total_headers': total_headers,
                'total_lines': total_lines,
                'total_headers_inserted': total_headers_inserted,
                'total_lines_inserted': total_lines_inserted,
                'total_batches_inserted': total_batches_inserted,
                'errors': errors,
            })

        # ========================================
        # COMPLETE
        # ========================================
        final_message = f'Sync completed: {total_batches_inserted} batches, {total_headers_inserted} headers, {total_lines_inserted} lines inserted'
        if errors > 0:
            final_message += f' ({errors} errors)'

        update_job_status(job_id, {
            'status': 'completed',
            'processed_batches': total_batches,
            'progress': 100,
            'message': final_message,
            'end_time': datetime.now().isoformat(),
        })

        log_message(job_id, final_message, 'success')

    except Exception as e:
        error_msg = f'Sync failed: {str(e)}'
        log_message(job_id, error_msg, 'error')
        update_job_status(job_id, {
            'status': 'error',
            'message': error_msg,
            'end_time': datetime.now().isoformat(),
        })
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description='GL Journal Sync Job')
    parser.add_argument('--job-id', required=True, help='Job ID')
    parser.add_argument('--mode', default='test', choices=['single', 'test', 'full'], help='Sync mode')
    parser.add_argument('--sync-type', default='gl_journals', help='Sync type')
    parser.add_argument('--param', action='append', help='Parameters in key=value format')

    args = parser.parse_args()

    # Parse parameters
    parameters = {}
    if args.param:
        for p in args.param:
            if '=' in p:
                key, value = p.split('=', 1)
                parameters[key] = value

    print(f"Starting sync job: {args.job_id}")
    print(f"Mode: {args.mode}")
    print(f"Type: {args.sync_type}")
    print(f"Parameters: {parameters}")

    if args.sync_type == 'gl_journals':
        sync_gl_journals(args.job_id, args.mode, parameters)
    else:
        print(f"Unknown sync type: {args.sync_type}")
        sys.exit(1)


if __name__ == '__main__':
    main()
