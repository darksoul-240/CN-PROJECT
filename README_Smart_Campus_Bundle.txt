SMART CAMPUS NETWORK ARCHITECTURE - PROJECT BUNDLE

Files:
- Smart_Campus_Network_Architecture_Technical_Guide.docx: detailed editable guide for topology, device/IP configuration, routes, Guest ACL, validation, and Python integration.
- bandwidth_analyzer.py: standard-library Python bandwidth and utilization estimator.
- smart_campus_assumptions.json: editable model inputs. Segment counts and traffic values beyond the 1,350 endpoint planning assumption are illustrative examples.
- bandwidth_results_example.csv: example link-utilization output from illustrative inputs.
- segment_estimates_example.csv: example per-segment demand output from illustrative inputs.

To run on Windows:
1. Put bandwidth_analyzer.py and smart_campus_assumptions.json in the same folder.
2. Edit the JSON assumptions to match your team's chosen endpoint counts and traffic model. Endpoint counts must add to design_endpoint_assumption.
3. Open Command Prompt in that folder and run:
   python bandwidth_analyzer.py --config smart_campus_assumptions.json --output bandwidth_results.csv --segment-output segment_estimates.csv
   If 'python' is not recognized, try 'py' instead.
4. Use the generated CSV files as estimated analysis outputs. They are not live Packet Tracer throughput measurements.

Current validated simulated external subnet: 203.0.133.0/24 (ISP interface 203.0.133.1, Server-PT 203.0.133.10). This range is not a reserved documentation range. Keep the topology isolated; before connecting it to a real network, renumber the external segment consistently to a reserved documentation block or private-use address space and retest.
