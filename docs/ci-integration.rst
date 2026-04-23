CI Integration — Wireframe Review Action
=========================================

A reusable GitHub Action that automatically reviews pull requests for changes
that may require wireframe demo updates. It auto-discovers wireframe demos in
your documentation, analyzes the PR diff, and posts a comment with suggested
wireframe changes using an LLM.


Quick Setup
-----------

Add a single workflow file to your repository:

.. code-block:: yaml
   :caption: ``.github/workflows/wireframe-review.yml``

   name: Wireframe Review
   on:
     pull_request:
       types: [opened, synchronize]
   jobs:
     review:
       runs-on: ubuntu-latest
       permissions:
         pull-requests: write
         contents: read
         models: read
       steps:
         - uses: actions/checkout@v4
         - uses: spacetelescope/docs-wireframe-demo/.github/actions/wireframe-review@main
           env:
             GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
           with:
             docs-root: docs/
             source-root: .

That's it. The action will:

1. **Auto-discover** all wireframe demos in your ``docs/`` directory by scanning for
   ``.. wireframe-demo::`` directives in RST files and ``data-wireframe-demo``
   attributes in HTML/Jinja templates.

2. **Resolve** the wireframe HTML, CSS, and custom actions JS files by following
   references and searching common locations (``_static/``, package static dirs, etc.).

3. **Analyze** the PR diff against each discovered wireframe using an LLM.

4. **Post a PR comment** summarizing whether each wireframe needs updating, with
   specific suggested diffs.


How It Works
------------

Auto-Discovery
^^^^^^^^^^^^^^

The action scans your ``docs-root`` directory recursively for wireframe demos:

**RST files** — Finds ``.. wireframe-demo::`` directives and extracts:

- The wireframe HTML path (the directive argument)
- Step definitions from ``:steps:`` or ``:steps-json:`` options
- Custom CSS/JS from ``:css:`` and ``:js:`` options

**HTML/Jinja files** — Finds ``data-wireframe-demo`` attributes and extracts:

- The ``htmlSrc`` from the ``data-wireframe-config`` JSON
- Step definitions from the ``steps`` array in the config
- Handles Jinja ``{{ pathto(...) }}`` expressions

For each discovered wireframe HTML file, the action also looks for **sibling
assets** — matching CSS and JS files in the same directory (e.g.,
``my-wireframe.html`` → ``my-wireframe.css`` + ``my-wireframe-actions.js``).


LLM Analysis
^^^^^^^^^^^^^

The action sends the wireframe artifacts (HTML, CSS, custom actions JS, step
definitions) along with the PR diff to an LLM, which determines:

- Whether the source code changes affect the wireframe's layout, components,
  styling, features, or workflows
- Specific file changes to propose (wireframe HTML updates, new/modified steps,
  CSS adjustments, custom action changes)

The LLM understands the wireframe demo format, including built-in actions
(``click``, ``toggle-class``, ``set-value``, etc.) and custom registered actions.


Inputs
------

.. list-table::
   :header-rows: 1
   :widths: 20 15 65

   * - Input
     - Default
     - Description
   * - ``docs-root``
     - ``docs/``
     - Path to the documentation root directory to scan for wireframe demos.
   * - ``source-root``
     - ``.``
     - Path to the source code root. Only diffs under this path are analyzed.
   * - ``config-path``
     - *(empty)*
     - Path to an explicit config file (see `Explicit Configuration`_ below).
   * - ``provider``
     - ``github-models``
     - LLM provider: ``github-models``, ``openai``, or ``anthropic``.
   * - ``model``
     - *(provider default)*
     - LLM model name.
   * - ``api-key``
     - *(empty)*
     - API key for OpenAI/Anthropic providers. Not needed for ``github-models``.
   * - ``max-diff-size``
     - ``50000``
     - Maximum diff size (characters) sent to the LLM. Larger diffs are summarized.


LLM Provider Setup
-------------------

GitHub Models (recommended)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

The default provider uses `GitHub Models <https://github.com/marketplace/models>`_
via the built-in ``GITHUB_TOKEN``. This requires **no additional secrets** — it
works out of the box for public repositories.

.. code-block:: yaml

   - uses: spacetelescope/docs-wireframe-demo/.github/actions/wireframe-review@main
     env:
       GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

Add ``permissions: models: read`` to the job for GitHub Models access.


OpenAI
^^^^^^

.. code-block:: yaml

   - uses: spacetelescope/docs-wireframe-demo/.github/actions/wireframe-review@main
     env:
       GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
     with:
       provider: openai
       api-key: ${{ secrets.OPENAI_API_KEY }}
       model: gpt-4o


Anthropic
^^^^^^^^^

.. code-block:: yaml

   - uses: spacetelescope/docs-wireframe-demo/.github/actions/wireframe-review@main
     env:
       GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
     with:
       provider: anthropic
       api-key: ${{ secrets.ANTHROPIC_API_KEY }}
       model: claude-sonnet-4-20250514


API Keys for Organization Repos
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

For organizations, the recommended approaches:

1. **GitHub Models** (zero setup) — Uses the existing ``GITHUB_TOKEN``. No
   secrets to manage. Works for public repos automatically.

2. **Organization secret** — An org admin creates a secret (e.g.,
   ``LLM_API_KEY``) at the org level (Settings → Secrets → Actions), scoped
   to specific repos or all repos. All repos in the org can then reference
   ``${{ secrets.LLM_API_KEY }}``.

3. **Repository secret** — Each repo sets its own secret in
   Settings → Secrets → Actions.


Explicit Configuration
-----------------------

For advanced control, create a ``.github/wireframe-review.yml`` config file
instead of relying on auto-discovery:

.. code-block:: yaml
   :caption: ``.github/wireframe-review.yml``

   wireframes:
     - html: path/to/wireframe.html
       css: path/to/wireframe.css
       actions-js: path/to/wireframe-actions.js
       steps-source: docs/_templates/index.html
       context: "Main landing page demo showing data loading workflow"
       watch:
         - "mypackage/configs/**"
         - "mypackage/components/**"

Then reference it in your workflow:

.. code-block:: yaml

   - uses: spacetelescope/docs-wireframe-demo/.github/actions/wireframe-review@main
     env:
       GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
     with:
       config-path: .github/wireframe-review.yml

The ``watch`` patterns limit which source files are considered relevant,
reducing token usage for large PRs.


Example: jdaviz
----------------

For `jdaviz <https://github.com/spacetelescope/jdaviz>`_, which uses
``data-wireframe-demo`` in a Jinja template with custom actions:

.. code-block:: yaml
   :caption: ``.github/workflows/wireframe-review.yml``

   name: Wireframe Review
   on:
     pull_request:
       types: [opened, synchronize]
   jobs:
     review:
       runs-on: ubuntu-latest
       permissions:
         pull-requests: write
         contents: read
         models: read
       steps:
         - uses: actions/checkout@v4
         - uses: spacetelescope/docs-wireframe-demo/.github/actions/wireframe-review@main
           env:
             GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
           with:
             docs-root: docs/
             source-root: jdaviz/

The action auto-discovers the wireframe demo in ``docs/_templates/index.html``,
resolves ``jdaviz-wireframe.html`` (found via filename search in the repo),
picks up the sibling ``jdaviz-wireframe.css`` and
``jdaviz-wireframe-actions.js``, and analyzes diffs under ``jdaviz/``.


PR Comment Format
------------------

The action posts a single PR comment (updated on subsequent pushes) that includes:

- A summary of whether each wireframe needs updating
- Collapsible sections with suggested diffs for each file
- A list of wireframes that need no changes
- Warnings for any analysis errors

The comment uses a hidden HTML marker to find and update itself on subsequent
pushes, avoiding duplicate comments.
