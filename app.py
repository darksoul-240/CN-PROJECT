#!/usr/bin/env python3
from flask import Flask, render_template, request, jsonify, send_file
from pathlib import Path
import json

app = Flask(__name__, static_folder='static', template_folder='templates')
BASE_DIR = Path(__file__).parent
CONFIG_PATH = BASE_DIR / 'smart_campus_assumptions.json'
SEGMENT_OUTPUT = BASE_DIR / 'segment_estimates.csv'
LINK_OUTPUT = BASE_DIR / 'bandwidth_results.csv'

@app.route('/')
@app.route('/analyzer')
def index():
    return render_template('index.html')

@app.route('/api/config', methods=['GET'])
def get_config():
    try:
        with CONFIG_PATH.open('r', encoding='utf-8') as f:
            return jsonify({'ok': True, 'config': json.load(f)})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@app.route('/api/config', methods=['POST'])
def save_config():
    try:
        data = request.get_json(force=True)
        with CONFIG_PATH.open('w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 400

@app.route('/api/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json(force=True)
        from bandwidth_analyzer import validate_and_calculate, write_csv
        segment_rows, link_rows = validate_and_calculate(data)
        write_csv(LINK_OUTPUT, link_rows)
        write_csv(SEGMENT_OUTPUT, segment_rows)
        def conv(o):
            if isinstance(o, float): return round(o, 3)
            if isinstance(o, dict): return {k:conv(v) for k,v in o.items()}
            if isinstance(o, list): return [conv(i) for i in o]
            return o
        return jsonify({'ok': True, 'segments': conv(segment_rows), 'links': conv(link_rows)})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 400

@app.route('/api/export/csv/links')
def export_links():
    if LINK_OUTPUT.exists(): return send_file(LINK_OUTPUT, as_attachment=True)
    return 'No results', 404

@app.route('/api/export/csv/segments')
def export_segments():
    if SEGMENT_OUTPUT.exists(): return send_file(SEGMENT_OUTPUT, as_attachment=True)
    return 'No results', 404

@app.route('/download/<path:filename>')
def download(filename):
    p = BASE_DIR / filename
    if p.exists(): return send_file(p)
    return 'Not found', 404

if __name__ == '__main__':
    app.run(debug=False, host='127.0.0.1', port=5000)
