"""
Flask API Server for Background Sync Jobs
No database required - uses file-based job tracking
"""
import os
import json
import uuid
import subprocess
import sys
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from config import JOBS_DIR

app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

# In-memory job tracking (PIDs)
running_jobs = {}


def get_job_file(job_id: str) -> str:
    """Get the path to a job's status file"""
    return os.path.join(JOBS_DIR, f'{job_id}.json')


def read_job_status(job_id: str) -> dict:
    """Read job status from file"""
    job_file = get_job_file(job_id)
    if os.path.exists(job_file):
        with open(job_file, 'r') as f:
            return json.load(f)
    return None


def list_all_jobs() -> list:
    """List all jobs from the jobs directory"""
    jobs = []
    if os.path.exists(JOBS_DIR):
        for filename in os.listdir(JOBS_DIR):
            if filename.endswith('.json'):
                job_id = filename[:-5]  # Remove .json
                job_status = read_job_status(job_id)
                if job_status:
                    jobs.append(job_status)
    # Sort by start time, newest first
    jobs.sort(key=lambda x: x.get('start_time', ''), reverse=True)
    return jobs


def is_process_running(pid: int) -> bool:
    """Check if a process is still running"""
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'service': 'sync-job-server',
        'timestamp': datetime.now().isoformat()
    })


@app.route('/api/jobs', methods=['GET'])
def get_jobs():
    """Get all jobs"""
    jobs = list_all_jobs()

    # Update status for jobs that might have finished
    for job in jobs:
        if job.get('status') == 'running':
            pid = job.get('pid')
            if pid and not is_process_running(pid):
                # Process finished but status not updated - mark as completed or error
                job['status'] = 'completed'

    return jsonify({
        'success': True,
        'jobs': jobs,
        'total': len(jobs)
    })


@app.route('/api/jobs/<job_id>', methods=['GET'])
def get_job(job_id):
    """Get specific job status"""
    job = read_job_status(job_id)
    if job:
        # Check if process is still running
        if job.get('status') == 'running':
            pid = job.get('pid')
            if pid and not is_process_running(pid):
                job['status'] = 'completed'

        return jsonify({
            'success': True,
            'job': job
        })
    return jsonify({
        'success': False,
        'error': 'Job not found'
    }), 404


@app.route('/api/jobs', methods=['POST'])
def create_job():
    """Create and start a new sync job"""
    data = request.get_json() or {}

    # Generate job ID
    job_id = str(uuid.uuid4())[:8]

    # Get parameters
    sync_type = data.get('sync_type', 'gl_journals')
    mode = data.get('mode', 'test')  # 'single', 'test', 'full'
    parameters = data.get('parameters', {})

    # Create initial job status
    job_status = {
        'job_id': job_id,
        'sync_type': sync_type,
        'mode': mode,
        'parameters': parameters,
        'status': 'starting',
        'progress': 0,
        'total_batches': 0,
        'processed_batches': 0,
        'total_headers': 0,
        'total_lines': 0,
        'errors': 0,
        'current_batch': '',
        'message': 'Starting job...',
        'start_time': datetime.now().isoformat(),
        'end_time': None,
        'pid': None,
    }

    # Write initial status
    job_file = get_job_file(job_id)
    with open(job_file, 'w') as f:
        json.dump(job_status, f, indent=2)

    # Start the sync process
    try:
        # Build command
        script_path = os.path.join(os.path.dirname(__file__), 'sync_job.py')
        cmd = [
            sys.executable,  # Current Python interpreter
            script_path,
            '--job-id', job_id,
            '--mode', mode,
            '--sync-type', sync_type,
        ]

        # Add parameters
        for key, value in parameters.items():
            cmd.extend(['--param', f'{key}={value}'])

        # Start subprocess (non-blocking)
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True  # Detach from parent
        )

        # Update job with PID
        job_status['status'] = 'running'
        job_status['pid'] = process.pid
        job_status['message'] = f'Job started with PID {process.pid}'

        with open(job_file, 'w') as f:
            json.dump(job_status, f, indent=2)

        # Track in memory
        running_jobs[job_id] = process.pid

        return jsonify({
            'success': True,
            'job_id': job_id,
            'pid': process.pid,
            'message': 'Job started successfully'
        })

    except Exception as e:
        job_status['status'] = 'error'
        job_status['message'] = str(e)
        job_status['end_time'] = datetime.now().isoformat()

        with open(job_file, 'w') as f:
            json.dump(job_status, f, indent=2)

        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/jobs/<job_id>/stop', methods=['POST'])
def stop_job(job_id):
    """Stop a running job"""
    job = read_job_status(job_id)
    if not job:
        return jsonify({
            'success': False,
            'error': 'Job not found'
        }), 404

    pid = job.get('pid')
    if not pid:
        return jsonify({
            'success': False,
            'error': 'No PID found for job'
        }), 400

    try:
        import signal
        os.kill(pid, signal.SIGTERM)

        # Update job status
        job['status'] = 'stopped'
        job['message'] = 'Job stopped by user'
        job['end_time'] = datetime.now().isoformat()

        job_file = get_job_file(job_id)
        with open(job_file, 'w') as f:
            json.dump(job, f, indent=2)

        return jsonify({
            'success': True,
            'message': 'Job stopped'
        })

    except ProcessLookupError:
        return jsonify({
            'success': False,
            'error': 'Process not found (may have already finished)'
        }), 404
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/jobs/<job_id>', methods=['DELETE'])
def delete_job(job_id):
    """Delete a job record"""
    job_file = get_job_file(job_id)
    if os.path.exists(job_file):
        os.remove(job_file)
        return jsonify({
            'success': True,
            'message': 'Job deleted'
        })
    return jsonify({
        'success': False,
        'error': 'Job not found'
    }), 404


@app.route('/api/jobs/clear', methods=['POST'])
def clear_completed_jobs():
    """Clear all completed/stopped/error jobs"""
    cleared = 0
    jobs = list_all_jobs()

    for job in jobs:
        if job.get('status') in ['completed', 'stopped', 'error']:
            job_file = get_job_file(job['job_id'])
            if os.path.exists(job_file):
                os.remove(job_file)
                cleared += 1

    return jsonify({
        'success': True,
        'cleared': cleared,
        'message': f'Cleared {cleared} jobs'
    })


if __name__ == '__main__':
    print("=" * 60)
    print("  Sync Job Server")
    print("=" * 60)
    print(f"  Jobs Directory: {JOBS_DIR}")
    print(f"  API URL: http://localhost:5000/api")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=True)
