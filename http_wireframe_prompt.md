# Generate an Interactive Wireframe Demo for A Live Website

## Objective

You are tasked with creating an **HTML wireframe mockup** that represents a website's user interface. This wireframe will be embedded in the website's Sphinx documentation using the `docs-wireframe-demo` infrastructure. The wireframe must:

1. **Faithfully represent the website's layout and visual design** while using simplified, stylized HTML/CSS
2. **Follow the `docs-wireframe-demo` interface contract** so that it integrates seamlessly with the orchestration engine
3. **Support custom actions** that enable common user workflows
4. **Enable interactive demonstrations** of key features in documentation
5. **Support light/dark theme switching** using CSS custom properties

---

## Phase 1: Analysis & Information Gathering

Before generating any code, you must thoroughly analyze the provided website materials. This phase determines everything about the wireframe.

### What You Will Receive

Prompt the user for the http link and then:

1. Fetch the html and using playwright if necessary (ie. if the html is a javascript SPA) to render.

2. Sanitize the app of any external API calls (ie. using beautiful soup) but retaining javascript necessary for page functionality.

3. Write this as a wireframe usable by `docs-wireframe-demo` (adding any missing element ids so that they can be referenced by demo steps).  Place the wireframe in examples/wireframes

4. Write an example demo in examples/demos which populates some of the search fields, changes dropdown selections, toggles checkmarks, highlights elements and adds commentary for a basic workflow to search the MAST archive.  Include the demo in a page in the documentation.

### Your Analysis Tasks

**Step 1: Analyze the UI Structure**
From the HTML, identify:
- **Main Content Area**: viewers, forms, data displays, charts, etc.
- **Navigation Patterns**: how does the user move between features?
- **Color Scheme**: primary colors, secondary colors, accents
- **Typography**: font sizes, weights, styles
- **Interactive Elements**: buttons, dropdowns, inputs, checkboxes, toggles

### Output of Analysis Phase

Before proceeding to generation, you must produce a **UI Analysis Report** with:

1. **website Summary** (2-3 sentences)
   ```
   Example: "PhotoViewer is an image processing application that allows users to 
   load, edit, and export photos. It features a toolbar with editing tools, 
   a properties panel for adjustments, and a main canvas area for viewing."
   ```

2. **Main UI Regions** (with dimensions/proportions)
   ```
   Example:
   - Toolbar (top, ~60px height): File, Edit, View menus + tool icons
   - Sidebar (left, ~300px width): Layers panel with tabs
   - Main Canvas (center): Image display area
   - Status Bar (bottom, ~25px): Info display
   ```

3. **Key Interactive Elements**
   ```
   Example:
   - File Browser dropdown (in toolbar)
   - Format selector dropdown (in sidebar)
   - Color picker (in properties panel)
   - Layer list (with checkboxes for visibility)
   - Export button (primary action)
   ```

4. **Identified Workflows** (3-5 scenarios)
   ```
   Example Workflow 1: "Import and Crop"
   - Step 1: Click File menu
   - Step 2: Select "Open Image"
   - Step 3: Use crop tool from toolbar
   - Step 4: Click "Apply"
   
   Example Workflow 2: "Adjust Colors"
   - Step 1: Select layer in sidebar
   - Step 2: Adjust sliders in properties panel
   - Step 3: Preview updates in real-time
   - Step 4: Click "Accept Changes"
   ```

5. **Color Palette**
   ```
   Example:
   - Primary: #0066cc (blue, used for buttons and active states)
   - Secondary: #333333 (dark, used for toolbar background)
   - Accent: #ff6600 (orange, used for hover states)
   - Background Light: #ffffff
   - Background Dark: #1a1a1a
   - Text on Light: #333333
   - Text on Dark: #f5f5f5
   ```

6. **Component Architecture Summary**
   ```
   Example:
   - 1 Main Viewer: Canvas with image
   - 3 Sidebar Tabs: Layers, Properties, History
   - 8 Toolbar Buttons: New, Open, Save, Crop, Rotate, Flip, Undo, Redo
   - 12 Interactive Components: Sliders, dropdowns, checkboxes
   ```

---

## Phase 2: Requirements Generation

Based on your analysis, you must now generate the specific requirements for this website. These are NOT predetermined—they come from your understanding of the website.

### Generate HTML Requirements

Based on the UI analysis, determine:
- What regions need to exist? (toolbar, sidebar, main area, etc.)
- What elements go in the toolbar? (icons, buttons, search, etc.)
- What tabs/panels need to be in the sidebar?
- What form elements are needed? (selects, inputs, sliders, etc.)
- What interactive elements exist? (buttons, toggles, etc.)

**Document your HTML requirements as:**
```
GENERATED REQUIREMENT FOR {WEBSITE_NAME}:

HTML Structure:
- Root container: `.{website}-wireframe-container`
- Toolbar region: `.{website}-toolbar` with {N} icon buttons
- Sidebar region: `.{website}-sidebar` with {N} tabs
- Main area: `.{website}-main` with {viewer_type} display
- Components needed:
  * Toolbar: {specific buttons/icons}
  * Sidebar Tab 1: {specific form elements}
  * Sidebar Tab 2: {specific form elements}
  * Main area: {specific viewer/display}

Use data attributes for targeting:
- data-sidebar="{name}"
- data-tab="{name}"
- data-action="{action_name}"
```

### Generate CSS Requirements

Based on visual analysis, determine:
- What CSS custom properties are needed? (colors, sizes, timings)
- What responsive breakpoints are important?
- What animations are needed?
- What component styles must be defined?

**Document your CSS requirements as:**
```
GENERATED REQUIREMENT FOR {WEBSITE_NAME}:

CSS Custom Properties (all must support light/dark modes):
- --{website}-primary: {primary_color}
- --{website}-secondary: {secondary_color}
- --{website}-accent: {accent_color}
- --{website}-bg-light: {light_background}
- --{website}-bg-dark: {dark_background}
- --{website}-text-light: {light_text}
- --{website}-text-dark: {dark_text}
- --{website}-toolbar-height: {height}px
- --{website}-sidebar-width: {width}px
- --{website}-animation-duration: {duration}ms

Key Styles Needed:
- Toolbar: {specific styling requirements}
- Sidebar: {specific styling requirements}
- Main area: {specific styling requirements}
- Forms: {specific styling requirements}
- Responsive: {specific breakpoints and behaviors}
```

### Generate JavaScript Requirements

Based on the workflows, determine:
- What actions must be supported? (custom actions beyond built-in)
- What state needs to be managed?
- What event listeners are needed?
- What sidebar content maps are needed?

**Document your JavaScript requirements as:**
```
GENERATED REQUIREMENT FOR {WEBSITE_NAME}:

Custom Actions to Implement:
1. {action_name}: {description} (Value: {example_value})
2. {action_name}: {description} (Value: {example_value})
... (list all custom actions identified from workflows)

Sidebar Content Maps Needed:
- Sidebar "{name}":
  * Tab 1: {brief_content_description}
  * Tab 2: {brief_content_description}
  
State Management:
- Track: {what_state_needs_tracking}
- Persist across: {reset_on_what_event}

Dynamic Elements:
- {element_type}: {how_created_dynamically}
```

### Generate Workflow Requirements

Based on identified workflows, specify:
- How many demo sequences should there be?
- What should each sequence demonstrate?
- How long should each sequence run?
- What actions are needed for each sequence?

**Document your workflow requirements as:**
```
GENERATED WORKFLOWS FOR {WEBSITE_NAME}:

Workflow 1: "{workflow_name}"
Duration: ~{minutes} minutes
Steps:
1. {action}: {description}
2. {action}: {description}
... (list all steps)

Workflow 2: "{workflow_name}"
... (repeat for each workflow)
```

---

## Phase 3: Generation Guidelines

Now that you have analyzed the website and generated requirements, use these guidelines to create the three files. The guidelines are GENERIC; apply them using YOUR requirements from Phase 2.

### What is `docs-wireframe-demo`?

`docs-wireframe-demo` is a Sphinx extension that:
- Fetches arbitrary HTML into a documentation page container
- Overlays play/pause/restart controls (inside a Shadow DOM for style isolation)
- Steps through a configurable sequence of **actions** that target DOM elements by CSS selector
- Supports both **built-in actions** (click, toggle-class, set-value, etc.) and **custom actions** (registered via JavaScript)
- Automatically initializes when a page with the `.. wireframe-demo::` directive scrolls into view

### File 1: `{website}-wireframe.html`

**Purpose**: Semantic HTML structure for the {WEBSITE_NAME} interface

**Generic Requirements (apply to your website)**:
- Use a root container with unique class: `.{website}-wireframe`
- Organize into logical regions identified in Phase 1
- Use **data attributes** for all targeting: `data-sidebar="{name}"`, `data-action="{name}"`, etc.
- Use **semantic HTML** exclusively: `<button>`, `<select>`, `<input>`, `<label>`, not `<div>` for interactive elements
- Prefix all classes with `{website}-` to avoid CSS conflicts
- Include **no inline styles** (all styling in external CSS)
- Include **no JavaScript** (all behavior in external JS)
- Use **placeholder content** for dynamic areas (e.g., "Visualization goes here")

**Specific sections to include** (based on Phase 1 analysis):
- {REGION_1}: {description and purpose}
- {REGION_2}: {description and purpose}
- {REGION_3}: {description and purpose}

**Important**: Reference the provided static HTML for DOM structure patterns, but simplify and extract only essential elements needed for the demo.

### File 2: `{website}-wireframe.css`

**Purpose**: Complete styling with themes, animations, and responsive design

**Generic Requirements (apply to your website)**:

1. **CSS Custom Properties** (set in `:root` for light mode, override in `html[data-theme="dark"]` for dark mode):
   ```css
   :root {
     --{website}-primary: {primary_color};
     --{website}-secondary: {secondary_color};
     --{website}-accent: {accent_color};
     /* ... more properties ... */
   }
   
   html[data-theme="dark"] {
     --{website}-primary: {dark_primary_color};
     /* ... dark mode overrides ... */
   }
   ```

2. **Component Styles**: Define styles for each region and component identified in Phase 1
   - Use custom properties for colors, not hardcoded hex values
   - Use consistent padding, margins, border-radius
   - Define hover, active, focus states
   - Implement smooth transitions (300-500ms for major changes)

3. **Responsive Design**:
   - Mobile-first approach (styles for small screens, then `@media` for larger)
   - Use flexible units (%, rem, flex, grid)
   - Ensure toolbar and sidebar scale appropriately

4. **Accessibility**:
   - WCAG AA color contrast
   - Focus states clearly visible
   - Semantic structure preserved in styles

5. **Animations**:
   - Sidebar toggle: smooth slide (300ms)
   - Component appearance: fade-in (200-300ms)
   - Interactive feedback: hover color shift (150ms)
   - Use CSS transitions, not JavaScript animations

**Specific sections to style** (based on Phase 2 requirements):
- {COMPONENT_1}: {specific styling needs}
- {COMPONENT_2}: {specific styling needs}

### File 3: `{website}-wireframe-actions.js`

**Purpose**: JavaScript for all interactive behaviors

**Generic Requirements (apply to your website)**:

1. **Initialization**:
   - Wait for DOM to be ready
   - Check for `WireframeDemo` global object
   - Apply toolbar icons from Material Design Icons (as SVG data URIs)
   - Set up event listeners for interactive elements

2. **Custom Actions** (register via `WireframeDemo.registerAction()`):
   - For each action identified in Phase 2, implement a handler
   - Action signature: `function(step, el, contentRoot) { ... }`
   - Action should modify DOM based on `step.value` and `step.delay`
   - Highlight affected elements (class: `data-highlighted`) for visual feedback

3. **State Management**:
   - Create an instance state object: `instance._wfd_{website}`
   - Track: current sidebar, active tabs, created viewers, etc.
   - Persist across demo cycles (reset on `wireframe-demo-loaded` event)

4. **Sidebar Content Map** (if applicable):
   - For each sidebar, define HTML content for each tab
   - Store in `SIDEBAR_CONTENT_MAP` object
   - Reference from `show-sidebar` action

5. **Helper Functions**:
   - `getState(instance)`: Get/initialize state
   - `renderSidebarContent(sidebarName, tabIndex)`: Generate HTML
   - `highlightElement(element, duration)`: Apply highlight animation
   - Any other utilities needed for your custom actions

**Specific custom actions to implement** (based on Phase 2 requirements):
- `{action_name}`: {implementation description}
- `{action_name}`: {implementation description}

---

## Generic Guidelines (Apply to Your website)

### Visual Design Principles
- **Consistency**: Use the color palette across all components
- **Clarity**: Make interactive elements obviously clickable
- **Feedback**: Always provide visual feedback for user actions
- **Hierarchy**: Use size, color, and position to show importance

### Component Sizing (scale to your website)
- **Toolbar Height**: {height}px (from Phase 1 analysis)
- **Sidebar Width**: {width}px (from Phase 1 analysis)
- **Icon Size**: 24px (inside 48px padded containers)
- **Button Height**: 36-40px
- **Input/Select Height**: 36px
- **Expansion Panel Header**: 40-48px

### Interaction States
- **Hover**: Slight background color shift, cursor change
- **Active**: Primary color background, text emphasis
- **Disabled**: Reduced opacity (50-60%), no pointer events
- **Focus**: 2px outline in primary color

### Accessibility Requirements
- All buttons and icons: `title` attribute or `aria-label`
- All form inputs: associated `<label>` element
- Keyboard navigation: logical tab order
- Color contrast: WCAG AA minimum
- Semantic HTML: proper element types

### Animation Guidelines
- Sidebar toggle: 300ms ease-out
- Component fade-in: 200-300ms ease-out
- Hover effects: 150ms ease
- Keep all animations smooth (60fps)

### Performance Requirements
- Keep HTML under 10 KB
- Keep CSS under 30 KB
- Keep JavaScript under 25 KB
- Minimize DOM elements (target: <200)
- No external dependencies (except docs-wireframe-demo)

---

## Built-in Actions Reference

These actions are provided by `docs-wireframe-demo`. You can use them in your workflow steps:

- `highlight`: Pulse animation on element (orange highlight)
- `click`: Trigger click event on element
- `add-class`: Add CSS class to element
- `remove-class`: Remove CSS class from element
- `toggle-class`: Toggle CSS class on element
- `set-value`: Set value of input/select element
- `set-text`: Set text content of element
- `set-html`: Set HTML content of element
- `scroll-into-view`: Scroll element into view
- `dispatch-event`: Trigger custom event
- `pause`: Wait (no action, just delay)

---

## Testing & Validation Checklist

Before finalizing, verify:
- [ ] HTML is valid and renders without console errors
- [ ] All custom actions registered successfully
- [ ] Toolbar icons render (Material Design Icons)
- [ ] Sidebar opens/closes smoothly
- [ ] Form elements respond to actions
- [ ] {website_SPECIFIC_ELEMENT}: {specific_test}
- [ ] Light/dark theme switching works
- [ ] Animations are smooth (60fps)
- [ ] Responsive design works on mobile (480px)
- [ ] No console warnings or errors
- [ ] Demo plays through full workflow without issues
- [ ] All text is readable and properly sized
- [ ] Color contrast meets WCAG AA standards

---

## Workflow Example Template

For the demo sequence in documentation, use this format:

```rst
.. wireframe-demo:: _static/{website}-wireframe.html
   :js: {website}-wireframe-actions.js
   :css: {website}-wireframe.css
   :repeat: true
   :auto-start: true
   :steps-json: [
       {"action": "{action_1}", "value": "{value_1}", "delay": 1500},
       {"action": "{action_2}", "value": "{value_2}", "delay": 1000},
       ...
   ]
```

---

## Deliverables Checklist

You must produce:

1. **UI Analysis Report**
   - Summary of website purpose
   - UI regions identified
   - Key interactive elements
   - Workflows identified
   - Color palette
   - Component architecture

2. **Generated Requirements Document**
   - HTML requirements
   - CSS requirements
   - JavaScript requirements
   - Workflow specifications

3. **{website}-wireframe.html** (~3-10 KB)
   - Semantic structure
   - All interactive elements
   - Data attributes for targeting
   - No styles, no scripts

4. **{website}-wireframe.css** (~10-30 KB)
   - CSS custom properties
   - All component styles
   - Dark/light theme support
   - Responsive design
   - Animations

5. **{website}-wireframe-actions.js** (~15-30 KB)
   - Custom action implementations
   - Sidebar content maps
   - State management
   - Event listeners
   - Helper functions

---

## Advanced Considerations

### Customization for Future Updates
- Document the structure clearly so updates are easy
- Keep sidebar content organized
- Use consistent naming conventions
- Add comments explaining complex logic

### Handling Complex websites
- If many features exist, show representative subset
- Use consistent patterns for similar components
- Group related actions together
- Document what was excluded and why

### Real-time Updates
- If website supports live data, use placeholder values
- Show realistic data ranges and types
- Keep placeholders consistent across demo

### Extensibility
- Design custom actions to be reusable
- Use helper functions for common patterns
- Comment code for maintainability
- Plan for future workflows

---

## Success Criteria

The wireframe demo is successful if:
1. ✅ It accurately represents the website's UI layout
2. ✅ It demonstrates 3-5 key user workflows
3. ✅ It works seamlessly with docs-wireframe-demo
4. ✅ It's responsive and accessible
5. ✅ It loads quickly and performs smoothly
6. ✅ It's maintainable and easy to update
7. ✅ It enhances documentation and helps users understand the website
8. ✅ All code is production-quality and well-documented

---

## Questions to Answer Before Finalizing

1. Does the wireframe accurately capture the website's interface?
2. Are the key workflows clear and representative?
3. Is the color scheme faithful to the brand?
4. Do all actions work as expected?
5. Is the demo engaging and informative?
6. Are there any missing features that should be included?
7. Is the code maintainable for future updates?
8. Does it work across all target browsers?
