Embedding in Confluence
=======================

You can embed wireframe demos in Confluence pages using the HTML macro.
The demo assets are served from GitHub Pages; only the HTML snippet
lives in Confluence.

.. note::

   Confluence Cloud's **built-in** HTML macro strips ``<script>`` tags.
   You will need a third-party HTML app that supports full JavaScript,
   such as `HTML for Confluence by Appfire <https://marketplace.atlassian.com/apps/12684/html-for-confluence>`_
   or similar.  Confluence Data Center / Server's HTML macro works
   natively.


Prerequisites
-------------

Your project must publish its wireframe HTML files and the
docs-wireframe-demo assets to a publicly accessible URL.  The
recommended approach is **GitHub Pages** — the examples in this project
are deployed automatically via the ``pages.yml`` workflow.

Assets you need (served from your GH Pages site):

* ``wireframe-demo-controller.js``
* ``wireframe-demo-controls.css``
* Your wireframe HTML file (e.g. ``wireframe.html``)


Minimal Confluence snippet
--------------------------

Paste this into a Confluence HTML macro, replacing the placeholder URLs
with your project's GitHub Pages URLs:

.. code-block:: html

   <link rel="stylesheet"
         href="https://<org>.github.io/<repo>/assets/wireframe-demo-controls.css">

   <div data-wireframe-demo
        data-wireframe-config='{
     "htmlSrc": "https://<org>.github.io/<repo>/kitchen-sink/wireframe.html",
     "steps": [
       "#btn-sidebar@1800:click",
       "#sidebar@800:toggle-class=open",
       "#input-search@1500:set-value=pipeline",
       "#btn-action@1500:click",
       "#toast@800:add-class=visible",
       "pause@2000",
       "#toast@600:remove-class=visible",
       "#sidebar@1200:toggle-class=open"
     ],
     "repeat": true
   }' style="height: 420px;">
   </div>

   <script src="https://<org>.github.io/<repo>/assets/wireframe-demo-controller.js"></script>


Full example with this project's GitHub Pages
----------------------------------------------

Using the **kitchen-sink** example hosted by this repository:

.. code-block:: html

   <link rel="stylesheet"
         href="https://your-org.github.io/docs-wireframe-demo/assets/wireframe-demo-controls.css">

   <div data-wireframe-demo
        data-wireframe-config='{
     "htmlSrc": "https://your-org.github.io/docs-wireframe-demo/kitchen-sink/wireframe.html",
     "steps": [
       "#btn-sidebar@1800:click",
       "#sidebar@800:toggle-class=open",
       "#input-search@1500:set-value=pipeline",
       "#select-mode@1200:set-value=batch",
       "#input-count@1200:set-value=50",
       "#info-1@1500:set-attribute=data-tooltip:Real-time ETL pipeline",
       "#card-1@1200:highlight",
       "#card-1@1000:toggle-class=highlighted",
       "#card-1-tag@1000:set-text=running",
       "#status-text@800:set-text=Processing…",
       "#status-badge@800:add-class=success",
       "#status-badge@600:set-text=running",
       "#log-last@1200:scroll-into-view",
       "#btn-action@1500:click",
       "#toast@800:add-class=visible",
       "#toast@1000:set-text=Pipeline started successfully!",
       "pause@2000",
       "#toast@600:remove-class=visible",
       "#card-2-desc@1200:set-text=Batch mode activated — processing 50 items.",
       "#card-2-tag@800:set-text=active",
       "#card-1@1000:toggle-class=highlighted",
       "#status-text@1000:set-text=Complete",
       "#status-badge@600:set-text=done",
       "#info-1@1000:remove-attribute=data-tooltip",
       "#sidebar@1200:toggle-class=open",
       "pause@2000"
     ],
     "repeat": true
   }' style="height: 420px;">
   </div>

   <script src="https://your-org.github.io/docs-wireframe-demo/assets/wireframe-demo-controller.js"></script>

Replace ``your-org`` with your GitHub organisation name.


Customising the demo
--------------------

The ``steps`` array in ``data-wireframe-config`` is plain JSON — you can
edit it directly in Confluence without touching the repository.  The
wireframe HTML itself is fetched at runtime from GitHub Pages, so it
stays in sync with whatever is committed to the repo.

See :doc:`configuration` for the full list of config options and
:doc:`sphinx-directive` for the step shorthand syntax reference.


Controlling height and width
----------------------------

Set the ``style`` attribute on the container ``<div>`` to control sizing:

.. code-block:: html

   <div data-wireframe-demo
        data-wireframe-config='...'
        style="height: 500px; max-width: 800px;">
   </div>


Theming
-------

Override CSS custom properties on the container to match your
Confluence space's look:

.. code-block:: html

   <style>
     [data-wireframe-demo] {
       --wfd-control-bg: rgba(0, 59, 77, 0.9);
       --wfd-control-bg-hover: rgba(0, 125, 164, 0.9);
     }
   </style>

See :doc:`styling` for the full list of custom properties.


Troubleshooting
---------------

**Demo does not appear / blank container**
   Check the browser console for CORS errors.  The wireframe HTML must
   be served with ``Access-Control-Allow-Origin`` headers.  GitHub Pages
   sends ``Access-Control-Allow-Origin: *`` by default, so hosting there
   is the simplest option.

**Scripts are stripped (Confluence Cloud)**
   The built-in HTML macro in Confluence Cloud removes ``<script>``
   tags.  Install a third-party HTML app that supports full JavaScript
   execution (see note at the top of this page).

**Demo controls are hidden behind Confluence UI**
   Ensure the container has ``position: relative`` and a defined height.
   The play/pause/restart button is absolutely positioned inside the
   container.

**Wireframe looks different from docs**
   Confluence injects its own CSS.  The wireframe content is loaded via
   ``fetch()`` and injected into the container, so Confluence styles may
   leak in.  If this is a problem, you can add a CSS reset inside your
   wireframe HTML file, or open an issue to discuss Shadow DOM isolation
   for the content area.
