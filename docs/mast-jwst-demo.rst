MAST JWST Search Demo
=====================

This demo shows a basic workflow for searching the
`MAST archive <https://mast.stsci.edu/search/ui/#/jwst>`_
for JWST observations.

The wireframe below walks through entering a target, configuring
instrument and data-type filters, setting a date range, and
submitting a search.

.. wireframe-demo:: _static/mast-jwst-wireframe.html
   :height: 520px
   :repeat: true
   :auto-start: true
   :cursor: true
   :cursor-speed: 350
   :steps-json: [
       {"target": "#mast-appbar", "action": "highlight", "delay": 2000, "caption": "The MAST JWST Search form lets you query the Mikulski Archive for Space Telescopes"},
       {"target": "#object-input", "action": "highlight", "delay": 1500, "caption": "Start by entering an object name or coordinates"},
       {"target": "#object-input", "action": "set-value", "value": "M101", "delay": 1500, "caption": "Enter the target object — here we search for Messier 101 (Pinwheel Galaxy)"},
       {"target": "#resolve-btn", "action": "highlight", "delay": 1500, "caption": "Click RESOLVE to convert the object name to coordinates"},
       {"target": "#search-radius", "action": "set-value", "value": "5", "delay": 1200, "caption": "Adjust the search radius to 5 arcminutes"},
       {"target": "#section-datatypes", "action": "highlight", "delay": 1500, "caption": "Data Types filter which kinds of observations to include"},
       {"target": "#dt-timeseries", "action": "toggle-class", "value": "active inactive", "delay": 1200, "caption": "Deselect TIMESERIES to exclude time-series data"},
       {"target": "#dt-other", "action": "toggle-class", "value": "active inactive", "delay": 1200, "caption": "Deselect OTHER to focus on spectra and images"},
       {"target": "#section-instruments", "action": "highlight", "delay": 1500, "caption": "Choose which JWST instruments to include"},
       {"target": "#inst-fgs", "action": "toggle-class", "value": "active inactive", "delay": 1200, "caption": "Deselect FGS — it is a guide sensor, not a science instrument"},
       {"target": "#exp-type", "action": "set-value", "value": "NRC_IMAGE", "delay": 1500, "caption": "Filter by exposure type — select NIRCam imaging mode"},
       {"target": "#optical-element", "action": "set-value", "value": "F200W", "delay": 1500, "caption": "Optionally filter by optical element — here the F200W filter"},
       {"target": "#section-program", "action": "highlight", "delay": 1500, "caption": "You can also search by program, observation, or visit number"},
       {"target": "#section-dates", "action": "scroll-into-view", "delay": 1000, "noHighlight": true},
       {"target": "#obs-date-from", "action": "set-value", "value": "2023-01-01", "delay": 1500, "caption": "Set a date range to narrow results — observations from 2023 onward"},
       {"target": "#section-columns", "action": "scroll-into-view", "delay": 1000, "noHighlight": true},
       {"target": "#output-columns-chips", "action": "highlight", "delay": 1500, "caption": "The output columns control which fields appear in results"},
       {"target": "#mast-footer", "action": "scroll-into-view", "delay": 800, "noHighlight": true},
       {"target": "#search-btn", "action": "highlight", "delay": 1500, "caption": "Click Search to submit your query to the MAST archive"},
       {"target": "#search-btn", "action": "click", "delay": 800, "noHighlight": true},
       {"actions": [{"target": "#mast-toast", "action": "add-class", "value": "visible"}, {"target": "#result-count", "action": "set-text", "value": "47"}, {"target": "#footer-status", "action": "set-html", "value": "Filtered results: <span id=\"result-count\">47</span> of 301,678"}, {"target": "#results-section", "action": "add-class", "value": "visible"}], "delay": 2000, "caption": "Results are returned — 47 matching observations found!"},
       {"target": "#mast-form", "action": "scroll-into-view", "delay": 500, "noHighlight": true},
       {"target": "#results-section", "action": "scroll-into-view", "delay": 1500, "caption": "Scroll down to see the results table with matching datasets"},
       {"target": "#results-table", "action": "highlight", "delay": 2500, "caption": "Each row shows a dataset with target, coordinates, instrument, and program info"},
       {"target": "#mast-toast", "action": "remove-class", "value": "visible", "delay": 600},
       {"action": "pause", "delay": 2000}
       ]
