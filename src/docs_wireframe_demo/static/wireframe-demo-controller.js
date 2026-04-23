/**
 * WireframeDemo — Generic interactive demo engine.
 *
 * Fetches arbitrary HTML, injects it into a container, overlays play/pause/restart
 * controls (inside a Shadow DOM for style isolation), and steps through a
 * configurable sequence of actions that target elements by CSS selector.
 *
 * Supports multiple independent instances on the same page.
 *
 * Usage (declarative):
 *   <div data-wireframe-demo
 *        data-wireframe-config='{"htmlSrc":"app.html","steps":[...]}'>
 *   </div>
 *
 * Usage (programmatic):
 *   const demo = new WireframeDemo(element, { htmlSrc: 'app.html', steps: [...] });
 */
(function (root) {
    'use strict';

    // Guard: if already loaded, do not re-initialise.
    if (root.WireframeDemo) { return; }

    // ── Custom action registry (shared across all instances) ────────────
    // Stored on window so scripts that load before this one (or a second
    // load of this file) share the same registry.
    var _customActions = root.__wireframeDemoActions || {};
    root.__wireframeDemoActions = _customActions;

    // ── Step parser ─────────────────────────────────────────────────────

    /**
     * Parse a single shorthand string into a step object.
     *
     * Format:  target@delay:action=value|caption text
     *   - target  : CSS selector (e.g. "#btn", ".panel")
     *   - @delay  : optional integer milliseconds (default 2000)
     *               append "!" to suppress highlight (e.g. @1500!)
     *   - :action : action name
     *   - =value  : optional value for the action
     *   - |text   : optional caption text (append ^ or v prefix to
     *               force top or bottom positioning)
     *
     * Special: if target is "pause", no selector is needed.
     */
    function parseStepString(str) {
        var delay = 2000;
        var noHighlight = false;
        var caption = undefined;
        var captionOptions = undefined;
        var working = str;

        // Extract |caption (must be done first, before @/: parsing)
        var pipeIdx = working.indexOf('|');
        if (pipeIdx !== -1) {
            var captionPart = working.substring(pipeIdx + 1);
            working = working.substring(0, pipeIdx);
            if (captionPart.length > 0) {
                var firstChar = captionPart.charAt(0);
                if (firstChar === '^') {
                    caption = captionPart.substring(1);
                    captionOptions = { position: 'top' };
                } else if (firstChar === 'v') {
                    caption = captionPart.substring(1);
                    captionOptions = { position: 'bottom' };
                } else {
                    caption = captionPart;
                }
            }
        }

        // Extract @delay
        if (working.indexOf('@') !== -1) {
            var atIdx = working.indexOf('@');
            var before = working.substring(0, atIdx);
            var after = working.substring(atIdx + 1);
            var colonIdx = after.indexOf(':');
            var delayPart, rest;
            if (colonIdx !== -1) {
                delayPart = after.substring(0, colonIdx);
                rest = after.substring(colonIdx); // includes leading ":"
            } else {
                delayPart = after;
                rest = '';
            }
            if (delayPart.endsWith('!')) {
                noHighlight = true;
                delayPart = delayPart.slice(0, -1);
            }
            delay = parseInt(delayPart, 10) || 2000;
            working = before + rest;
        }

        // Extract :action=value
        var target = null;
        var action = 'highlight';
        var value = undefined;

        if (working.indexOf(':') !== -1) {
            var ci = working.indexOf(':');
            target = working.substring(0, ci) || null;
            var actionPart = working.substring(ci + 1);
            if (actionPart.indexOf('=') !== -1) {
                var ei = actionPart.indexOf('=');
                action = actionPart.substring(0, ei);
                value = actionPart.substring(ei + 1);
            } else {
                action = actionPart;
            }
        } else {
            target = working || null;
        }

        if (target === 'pause') {
            var pauseStep = { target: null, action: 'pause', delay: delay, noHighlight: noHighlight };
            if (caption !== undefined) pauseStep.caption = caption;
            if (captionOptions) pauseStep.captionOptions = captionOptions;
            return pauseStep;
        }

        var step = { target: target, action: action, delay: delay, noHighlight: noHighlight };
        if (value !== undefined) step.value = value;
        if (caption !== undefined) step.caption = caption;
        if (captionOptions) step.captionOptions = captionOptions;
        return step;
    }

    /**
     * Normalise a mixed array of step objects and shorthand strings into
     * a uniform array of step objects.
     */
    function parseSteps(raw) {
        if (!raw || !raw.length) return [];
        var out = [];
        for (var i = 0; i < raw.length; i++) {
            var item = raw[i];
            if (typeof item === 'string') {
                out.push(parseStepString(item));
            } else {
                // Already an object — apply defaults
                var obj = {
                    target: item.target || null,
                    action: item.action || 'highlight',
                    value: item.value,
                    delay: typeof item.delay === 'number' ? item.delay : 2000,
                    noHighlight: !!item.noHighlight
                };
                if (item.caption !== undefined) obj.caption = item.caption;
                if (item.captionOptions) obj.captionOptions = item.captionOptions;
                out.push(obj);
            }
        }
        return out;
    }

    // ── Controls template (injected into Shadow DOM) ────────────────────

    // CSS custom properties (pierce Shadow DOM) for downstream theming:
    //   --wfd-control-size          Button width & height (default: 44px)
    //   --wfd-control-radius        Border-radius (default: 8px)
    //   --wfd-control-bg            Background color (default: rgba(0,0,0,0.55))
    //   --wfd-control-bg-hover      Background on hover (default: rgba(0,0,0,0.75))
    //   --wfd-control-border        Border shorthand (default: none)
    //   --wfd-control-color         Icon fill color (default: #fff)
    //   --wfd-control-icon-size     SVG icon size (default: 22px)
    //   --wfd-control-bottom        Bottom offset (default: 12px)
    //   --wfd-control-right         Right offset (default: 12px)
    //   --wfd-control-tooltip-bg    Tooltip background (default: rgba(0,0,0,0.8))
    //   --wfd-control-tooltip-color Tooltip text color (default: #fff)

    var CONTROLS_CSS = [
        ':host {',
        '  display: flex; flex-direction: column; gap: 6px;',
        '  position: absolute;',
        '  bottom: var(--wfd-control-bottom, 12px);',
        '  right: var(--wfd-control-right, 12px);',
        '  z-index: 10000;',
        '  align-items: center;',
        '}',
        '.wfd-control-btn {',
        '  width: var(--wfd-control-size, 44px);',
        '  height: var(--wfd-control-size, 44px);',
        '  border-radius: var(--wfd-control-radius, 8px);',
        '  border: var(--wfd-control-border, none);',
        '  padding: 0;',
        '  background: var(--wfd-control-bg, rgba(0,0,0,0.55));',
        '  color: var(--wfd-control-color, #fff);',
        '  display: flex; align-items: center; justify-content: center;',
        '  transition: background 0.2s, transform 0.2s;',
        '  position: relative;',
        '}',
        '.wfd-control-btn:hover {',
        '  background: var(--wfd-control-bg-hover, rgba(0,0,0,0.75));',
        '  transform: scale(1.05);',
        '}',
        '.wfd-control-btn svg {',
        '  width: var(--wfd-control-icon-size, 22px);',
        '  height: var(--wfd-control-icon-size, 22px);',
        '  fill: currentColor;',
        '}',
        '.wfd-control-btn[hidden] { display: none; }',
        '.wfd-control-btn::after {',
        '  content: attr(data-tooltip);',
        '  position: absolute; right: 100%; top: 50%;',
        '  transform: translateY(-50%);',
        '  margin-right: 8px;',
        '  background: var(--wfd-control-tooltip-bg, rgba(0,0,0,0.8));',
        '  color: var(--wfd-control-tooltip-color, #fff);',
        '  padding: 4px 10px; border-radius: 4px; font-size: 12px;',
        '  font-weight: 600; white-space: nowrap; pointer-events: none;',
        '  opacity: 0; transition: opacity 0.2s;',
        '}',
        '.wfd-control-btn:hover::after { opacity: 1; }'
    ].join('\n');

    // SVG icons (Material Design style, white fill via currentColor)
    var ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M14,19H18V5H14M6,19H10V5H6V19Z"/></svg>';
    var ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8,5.14V19.14L19,12.14L8,5.14Z"/></svg>';
    var ICON_RESTART = '<svg viewBox="0 0 24 24"><path d="M12,4C14.1,4 16.1,4.8 17.6,6.3C20.7,9.4 20.7,14.5 17.6,17.6C15.8,19.5 13.3,20.2 10.9,19.9L11.4,17.9C13.1,18.1 14.9,17.5 16.2,16.2C18.5,13.9 18.5,10.1 16.2,7.7C15.1,6.6 13.5,6 12,6V10.6L7,5.6L12,0.6V4M6.3,17.6C3.7,15 3.3,11 5.1,7.9L6.6,9.4C5.5,11.6 5.9,14.4 7.8,16.2C8.3,16.7 8.9,17.1 9.6,17.4L9,19.4C8,19 7.1,18.4 6.3,17.6Z"/></svg>';
    var ICON_STEP_BACK = '<svg viewBox="0 0 24 24"><path d="M6,18V6H8V18H6M9.5,12L18,6V18L9.5,12Z"/></svg>';
    var ICON_STEP_FORWARD = '<svg viewBox="0 0 24 24"><path d="M16,18H18V6H16M6,18L14.5,12L6,6V18Z"/></svg>';

    function createControlsHost(instance) {
        var host = document.createElement('div');
        host.className = 'wfd-controls-host';
        var shadow = host.attachShadow({ mode: 'open' });

        var style = document.createElement('style');
        style.textContent = CONTROLS_CSS;
        shadow.appendChild(style);

        // Restart button (hidden while playing, shown above play when paused)
        var restartBtn = document.createElement('button');
        restartBtn.className = 'wfd-control-btn';
        restartBtn.setAttribute('aria-label', 'Restart demo');
        restartBtn.setAttribute('data-tooltip', 'Restart');
        restartBtn.innerHTML = ICON_RESTART;
        restartBtn.hidden = true;
        shadow.appendChild(restartBtn);

        // Primary button (pause while playing, play while paused)
        var primaryBtn = document.createElement('button');
        primaryBtn.className = 'wfd-control-btn';
        primaryBtn.setAttribute('aria-label', 'Pause demo');
        primaryBtn.setAttribute('data-tooltip', 'Pause');
        primaryBtn.innerHTML = ICON_PAUSE;
        shadow.appendChild(primaryBtn);

        primaryBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (instance._playing) {
                instance.pause();
            } else {
                // Resume from current position
                instance.play();
            }
        });

        restartBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            instance.restart();
        });

        instance._controlBtn = primaryBtn;
        instance._restartBtn = restartBtn;
        return host;
    }

    // ── Highlight helper (outside Shadow DOM) ───────────────────────────

    // Inject highlight keyframe animation once into the document
    var _highlightInjected = false;
    function ensureHighlightStyle() {
        if (_highlightInjected) return;
        _highlightInjected = true;
        var s = document.createElement('style');
        s.textContent = [
            '@keyframes wfd-highlight-pulse {',
            '  0%   { box-shadow: 0 0 0 0 rgba(255, 152, 0, 0.6); }',
            '  70%  { box-shadow: 0 0 0 8px rgba(255, 152, 0, 0); }',
            '  100% { box-shadow: 0 0 0 0 rgba(255, 152, 0, 0); }',
            '}',
            '.wfd-highlight {',
            '  animation: wfd-highlight-pulse 0.8s ease-out;',
            '  outline: 2px solid rgba(255, 152, 0, 0.7);',
            '  outline-offset: 2px;',
            '  border-radius: 2px;',
            '}'
        ].join('\n');
        document.head.appendChild(s);
    }

    // ── WireframeDemo class ─────────────────────────────────────────────

    function WireframeDemo(container, config) {
        if (!(this instanceof WireframeDemo)) {
            return new WireframeDemo(container, config);
        }

        this.container = container;
        this.config = Object.assign({
            htmlSrc: null,
            steps: [],
            repeat: true,
            autoStart: true,
            pauseOnInteraction: true,
            cursor: true,
            cursorSpeed: 300,
            timeline: true,
            onStepStart: null,
            onStepEnd: null,
            onComplete: null
        }, config || {});

        this._steps = [];
        this._stepIndex = 0;
        this._playing = false;
        this._started = false;
        this._timer = null;
        this._controlBtn = null;
        this._restartBtn = null;
        this._observer = null;
        this._highlightedEls = [];
        this._contentRoot = null; // the element holding fetched HTML
        this._cursorEl = null;
        this._cursorX = 0;
        this._cursorY = 0;
        this._captionEl = null;
        this._captionClass = null; // tracks custom className for removal
        this._timelineEl = null;
        this._timelineDots = [];
        this._tooltipEl = null;
        this._tooltipBackBtn = null;
        this._tooltipPlayBtn = null;
        this._tooltipFwdBtn = null;
        this._tooltipDotIndex = -1;
        this._tooltipDotEl = null;
        this._tooltipActivated = false;
        this._tooltipHideTimer = null;
        this._htmlSnapshots = [];
        this._timelineHovering = false;
        this._timelineLeaveTimer = null;

        this._init();
    }

    WireframeDemo.prototype._init = function () {
        var self = this;
        var container = this.container;

        // Mark initialised to prevent double-init
        container.setAttribute('data-wireframe-initialized', 'true');

        // Ensure container is positioned so the controls overlay works
        var pos = window.getComputedStyle(container).position;
        if (pos === 'static') {
            container.style.position = 'relative';
        }

        // Parse steps
        this._steps = parseSteps(this.config.steps);

        // Inject highlight style
        ensureHighlightStyle();

        // Create content root (where fetched HTML goes)
        this._contentRoot = document.createElement('div');
        this._contentRoot.className = 'wfd-content';
        container.appendChild(this._contentRoot);

        // Create controls overlay (Shadow DOM)
        var controlsHost = createControlsHost(this);
        container.appendChild(controlsHost);

        // Create animated cursor if enabled
        if (this.config.cursor) {
            this._createCursor();
        }

        // Create caption overlay
        this._createCaption();

        // Create timeline overlay (after caption, before pauseOnInteraction)
        this._createTimeline();

        // Pause on user interaction
        if (this.config.pauseOnInteraction) {
            container.addEventListener('click', function (e) {
                if (!e.isTrusted) return;
                // Ignore clicks on the controls host, timeline, or tooltip
                if (e.target.closest && e.target.closest('.wfd-controls-host')) return;
                if (e.target.closest && e.target.closest('.wfd-timeline')) return;
                if (e.target.closest && e.target.closest('.wfd-timeline-tooltip')) return;
                if (self._playing) {
                    self.pause();
                }
            }, true); // capture phase
        }

        // Load HTML then start
        if (this.config.htmlSrc) {
            this._loadHTML(this.config.htmlSrc, function () {
                self._onReady();
            });
        } else {
            // No htmlSrc — use existing container children as inline content.
            // Move any children that were in the container before _init into
            // _contentRoot so selectors, restart-reset, and controls all work.
            var existingNodes = [];
            while (container.firstChild && container.firstChild !== this._contentRoot) {
                existingNodes.push(container.removeChild(container.firstChild));
            }
            for (var i = 0; i < existingNodes.length; i++) {
                this._contentRoot.appendChild(existingNodes[i]);
            }
            // Save initial HTML for restart/repeat reset
            this._initialHTML = this._contentRoot.innerHTML;
            self._onReady();
        }
    };

    WireframeDemo.prototype._loadHTML = function (src, callback) {
        var self = this;
        fetch(src)
            .then(function (resp) {
                if (!resp.ok) throw new Error('Failed to load ' + src + ': ' + resp.status);
                return resp.text();
            })
            .then(function (html) {
                self._contentRoot.innerHTML = html;
                // Save the initial HTML for restart resets
                self._initialHTML = html;
                // Dispatch event so external code can react
                document.dispatchEvent(new CustomEvent('wireframe-demo-loaded', {
                    detail: { container: self.container, instance: self }
                }));
                if (callback) callback();
            })
            .catch(function (err) {
                console.error('[WireframeDemo] ' + err.message);
                self._contentRoot.innerHTML =
                    '<p style="color:red;padding:16px;">Error loading demo HTML: ' + err.message + '</p>';
            });
    };

    WireframeDemo.prototype._onReady = function () {
        if (!this.config.autoStart || !this._steps.length) return;
        this._waitForVisible();
    };

    // ── Viewport gating via IntersectionObserver ────────────────────────

    WireframeDemo.prototype._waitForVisible = function () {
        var self = this;
        if (typeof IntersectionObserver === 'undefined') {
            // Fallback: start immediately
            this.play();
            return;
        }
        this._observer = new IntersectionObserver(function (entries) {
            for (var i = 0; i < entries.length; i++) {
                if (entries[i].isIntersecting && entries[i].intersectionRatio >= 0.5) {
                    self._observer.disconnect();
                    self._observer = null;
                    self.play();
                    break;
                }
            }
        }, { threshold: [0.5] });
        this._observer.observe(this.container);
    };

    // ── Playback controls ───────────────────────────────────────────────

    WireframeDemo.prototype.play = function () {
        if (this._playing) return;
        this._playing = true;
        this._started = true;
        this._updateControlBtn();
        this._updateTooltip();
        this._runStep();
    };

    WireframeDemo.prototype.pause = function () {
        if (!this._playing) return;
        this._playing = false;
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
        this._updateControlBtn();
        this._updateTooltip();
    };

    WireframeDemo.prototype.restart = function () {
        this.pause();
        this._clearHighlights();
        this._hideCaption();
        this._resetCursor();
        this._stepIndex = 0;
        this._htmlSnapshots = [];

        // Restore the content DOM to its initial state so the demo
        // starts fresh (removes dynamically added viewers, sidebars, etc.)
        if (this._initialHTML !== undefined) {
            this._contentRoot.innerHTML = this._initialHTML;
            // Re-dispatch so external code (e.g. jdaviz-wireframe-actions)
            // can re-wire toolbar clicks, icons, etc.
            document.dispatchEvent(new CustomEvent('wireframe-demo-loaded', {
                detail: { container: this.container, instance: this }
            }));
        }

        this._updateTimelineDots();
        this.play();
    };

    WireframeDemo.prototype._updateControlBtn = function () {
        var btn = this._controlBtn;
        var restartBtn = this._restartBtn;
        if (!btn) return;
        if (this._playing) {
            btn.innerHTML = ICON_PAUSE;
            btn.setAttribute('aria-label', 'Pause demo');
            btn.setAttribute('data-tooltip', 'Pause');
            if (restartBtn) restartBtn.hidden = true;
        } else {
            btn.innerHTML = ICON_PLAY;
            btn.setAttribute('aria-label', 'Play demo');
            btn.setAttribute('data-tooltip', 'Play');
            if (restartBtn) restartBtn.hidden = false;
        }
    };

    // ── Animated cursor ─────────────────────────────────────────────────

    var CURSOR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none">'
        + '<path d="M5 3l14 8-7 2-3 7z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>'
        + '</svg>';

    WireframeDemo.prototype._createCursor = function () {
        var el = document.createElement('div');
        el.className = 'wfd-cursor';
        el.innerHTML = CURSOR_SVG;
        el.style.cssText = 'position:absolute;z-index:9999;pointer-events:none;'
            + 'top:0;left:0;width:20px;height:20px;opacity:0;'
            + 'transition:opacity 150ms ease;';
        this.container.appendChild(el);
        this._cursorEl = el;
        this._cursorAnim = null; // rAF id for in-flight animation
        var rect = this.container.getBoundingClientRect();
        this._cursorX = rect.width / 2;
        this._cursorY = rect.height / 2;
        el.style.transform = 'translate(' + this._cursorX + 'px,' + this._cursorY + 'px)';
    };

    // Ease-out cubic: fast departure, gentle arrival (like a real hand)
    function _easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    WireframeDemo.prototype._moveCursorTo = function (el, callback) {
        if (!this._cursorEl || !el) {
            if (callback) callback();
            return;
        }
        // Cancel any in-flight animation
        if (this._cursorAnim) {
            cancelAnimationFrame(this._cursorAnim);
            this._cursorAnim = null;
        }

        var containerRect = this.container.getBoundingClientRect();
        var elRect = el.getBoundingClientRect();
        var endX = (elRect.left - containerRect.left) + elRect.width / 2;
        var endY = (elRect.top - containerRect.top) + elRect.height / 2;
        var startX = this._cursorX;
        var startY = this._cursorY;

        // Quadratic bezier control point: offset perpendicular to the
        // direct line, creating a slight arc like a natural hand movement.
        var dx = endX - startX;
        var dy = endY - startY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        // Arc intensity scales with distance (capped), direction alternates
        var arcAmount = Math.min(dist * 0.15, 40);
        // Perpendicular direction (rotate 90°); alternate sign each step
        // so consecutive moves curve in different directions.
        this._cursorArcSign = -(this._cursorArcSign || 1);
        var perpX = -dy / (dist || 1) * arcAmount * this._cursorArcSign;
        var perpY =  dx / (dist || 1) * arcAmount * this._cursorArcSign;
        var cpX = (startX + endX) / 2 + perpX;
        var cpY = (startY + endY) / 2 + perpY;

        this._cursorEl.style.opacity = '1';

        var cursorEl = this._cursorEl;
        var self = this;
        var duration = this.config.cursorSpeed;
        var startTime = null;

        function tick(now) {
            if (!startTime) startTime = now;
            var elapsed = now - startTime;
            var t = Math.min(elapsed / duration, 1);
            var e = _easeOutCubic(t);

            // Quadratic bezier: B(t) = (1-t)²·P0 + 2(1-t)t·CP + t²·P1
            var inv = 1 - e;
            var x = inv * inv * startX + 2 * inv * e * cpX + e * e * endX;
            var y = inv * inv * startY + 2 * inv * e * cpY + e * e * endY;

            cursorEl.style.transform = 'translate(' + x + 'px,' + y + 'px)';

            if (t < 1) {
                self._cursorAnim = requestAnimationFrame(tick);
            } else {
                self._cursorAnim = null;
                self._cursorX = endX;
                self._cursorY = endY;
                if (callback) callback();
            }
        }

        this._cursorAnim = requestAnimationFrame(tick);
    };

    WireframeDemo.prototype._hideCursor = function () {
        if (this._cursorEl) {
            this._cursorEl.style.opacity = '0';
        }
    };

    WireframeDemo.prototype._resetCursor = function () {
        if (!this._cursorEl) return;
        if (this._cursorAnim) {
            cancelAnimationFrame(this._cursorAnim);
            this._cursorAnim = null;
        }
        var rect = this.container.getBoundingClientRect();
        this._cursorX = rect.width / 2;
        this._cursorY = rect.height / 2;
        this._cursorEl.style.transform = 'translate(' + this._cursorX + 'px,' + this._cursorY + 'px)';
        this._cursorEl.style.opacity = '0';
    };

    // ── Caption overlay ───────────────────────────────────────────────────────

    WireframeDemo.prototype._createCaption = function () {
        var el = document.createElement('div');
        el.className = 'wfd-caption';
        this.container.appendChild(el);
        this._captionEl = el;
    };

    WireframeDemo.prototype._showCaption = function (step, el) {
        var captionEl = this._captionEl;
        if (!captionEl) return;

        // Don't override caption while user is hovering a timeline dot
        if (this._timelineHovering) return;

        // Remove previous custom class
        if (this._captionClass) {
            captionEl.classList.remove(this._captionClass);
            this._captionClass = null;
        }

        // If no caption on this step, hide and return
        if (!step.caption) {
            this._hideCaption();
            return;
        }

        // Determine position: explicit override or auto
        var opts = step.captionOptions || {};
        var position = opts.position || 'auto';

        if (position === 'auto') {
            if (el) {
                var containerRect = this.container.getBoundingClientRect();
                var elRect = el.getBoundingClientRect();
                var elMidY = (elRect.top + elRect.height / 2) - containerRect.top;
                var containerH = containerRect.height;
                // Target in top half → caption at bottom; target in bottom half → caption at top
                position = (elMidY < containerH / 2) ? 'bottom' : 'top';
            } else {
                position = 'bottom';
            }
        }

        // Apply position class
        captionEl.classList.remove('wfd-caption--top', 'wfd-caption--bottom');
        captionEl.classList.add(position === 'top' ? 'wfd-caption--top' : 'wfd-caption--bottom');

        // Apply optional custom class
        if (opts.className) {
            captionEl.classList.add(opts.className);
            this._captionClass = opts.className;
        }

        // Set text (textContent for XSS safety)
        captionEl.textContent = step.caption;

        // Show
        captionEl.classList.add('wfd-caption--visible');
    };

    WireframeDemo.prototype._hideCaption = function () {
        if (!this._captionEl) return;
        this._captionEl.classList.remove('wfd-caption--visible');
    };

    // ── Timeline overlay ────────────────────────────────────────────────

    WireframeDemo.prototype._createTimeline = function () {
        if (this.config.timeline === false) return;
        if (this._steps.length <= 1) return;

        var self = this;
        var el = document.createElement('div');
        el.className = 'wfd-timeline';
        this._timelineDots = [];

        for (var i = 0; i < this._steps.length; i++) {
            var dot = document.createElement('button');
            dot.className = 'wfd-timeline__dot';
            dot.setAttribute('data-step-index', String(i));
            if (this._steps[i].caption) {
                dot.setAttribute('data-caption', this._steps[i].caption);
            }
            dot.setAttribute('aria-label', this._steps[i].caption || ('Step ' + (i + 1)));
            this._timelineDots.push(dot);
            el.appendChild(dot);
        }

        // ── Dot hover tooltip with mini playback controls ───────────
        var tooltip = document.createElement('div');
        tooltip.className = 'wfd-timeline-tooltip';

        var ttBack = document.createElement('button');
        ttBack.className = 'wfd-timeline-tooltip__btn';
        ttBack.setAttribute('aria-label', 'Step back');
        ttBack.innerHTML = ICON_STEP_BACK;

        var ttPlay = document.createElement('button');
        ttPlay.className = 'wfd-timeline-tooltip__btn wfd-timeline-tooltip__btn--play';
        ttPlay.setAttribute('aria-label', 'Play from here');
        ttPlay.innerHTML = ICON_PLAY;

        var ttForward = document.createElement('button');
        ttForward.className = 'wfd-timeline-tooltip__btn';
        ttForward.setAttribute('aria-label', 'Step forward');
        ttForward.innerHTML = ICON_STEP_FORWARD;

        tooltip.appendChild(ttBack);
        tooltip.appendChild(ttPlay);
        tooltip.appendChild(ttForward);
        this.container.appendChild(tooltip);
        this._tooltipEl = tooltip;
        this._tooltipBackBtn = ttBack;
        this._tooltipPlayBtn = ttPlay;
        this._tooltipFwdBtn = ttForward;

        // ── Tooltip button handlers ─────────────────────────────────
        // After any click, the tooltip becomes "activated" and all
        // subsequent actions track _stepIndex (the real playback
        // position) instead of the originally-hovered dot.

        ttBack.addEventListener('click', function (e) {
            e.stopPropagation();
            self._tooltipActivated = true;
            if (self._stepIndex > 0) {
                self.jumpToStep(self._stepIndex - 1);
            }
            // Update buttons in place — do NOT reposition
            self._updateTooltipButtons();
            self._repositionTooltip(); // re-measure in case button visibility changed width
        });

        ttPlay.addEventListener('click', function (e) {
            e.stopPropagation();
            var wasActivated = self._tooltipActivated;
            self._tooltipActivated = true;
            if (self._playing) {
                // Pause at wherever the demo currently is
                self.pause();
            } else {
                // First play click from a hovered dot: jump there first
                if (!wasActivated && self._tooltipDotIndex >= 0 &&
                    self._tooltipDotIndex !== self._stepIndex) {
                    self.jumpToStep(self._tooltipDotIndex);
                }
                self.play();
            }
            // Update buttons in place — do NOT reposition
            self._updateTooltipButtons();
            self._repositionTooltip();
        });

        ttForward.addEventListener('click', function (e) {
            e.stopPropagation();
            self._tooltipActivated = true;
            if (self._stepIndex < self._steps.length - 1) {
                self.jumpToStep(self._stepIndex + 1);
            }
            // Update buttons in place — do NOT reposition
            self._updateTooltipButtons();
            self._repositionTooltip();
        });

        // Prevent tooltip clicks from bubbling to pauseOnInteraction
        tooltip.addEventListener('click', function (e) {
            e.stopPropagation();
        });

        // Click-to-jump (event delegation on dots)
        el.addEventListener('click', function (e) {
            e.stopPropagation(); // prevent pauseOnInteraction
            var dotEl = e.target.closest ? e.target.closest('.wfd-timeline__dot') : null;
            if (!dotEl) return;
            var idx = parseInt(dotEl.getAttribute('data-step-index'), 10);
            if (isNaN(idx)) return;
            self.jumpToStep(idx);
        });

        // Dot hover → show tooltip + caption preview
        el.addEventListener('mouseenter', function (e) {
            var dotEl = e.target.closest ? e.target.closest('.wfd-timeline__dot') : null;
            if (!dotEl) return;
            self._cancelTooltipHide();
            self._timelineHovering = true;
            var idx = parseInt(dotEl.getAttribute('data-step-index'), 10);
            if (!isNaN(idx)) {
                // Fresh hover: reset activated state
                self._tooltipActivated = false;
                self._showTooltipAtDot(dotEl, idx);
            }
            var captionText = dotEl.getAttribute('data-caption');
            if (captionText && self._captionEl) {
                self._captionEl.classList.remove('wfd-caption--top', 'wfd-caption--bottom');
                self._captionEl.classList.add('wfd-caption--bottom');
                self._captionEl.textContent = captionText;
                self._captionEl.classList.add('wfd-caption--visible');
            } else {
                self._hideCaption();
            }
        }, true);

        el.addEventListener('mouseleave', function (e) {
            var dotEl = e.target.closest ? e.target.closest('.wfd-timeline__dot') : null;
            if (!dotEl) return;
            self._scheduleTooltipHide();
        }, true);

        // Keep tooltip open while mouse is over it
        tooltip.addEventListener('mouseenter', function () {
            self._cancelTooltipHide();
        });

        // Hide tooltip when mouse leaves it
        tooltip.addEventListener('mouseleave', function (e) {
            var related = e.relatedTarget;
            if (related && related.closest && related.closest('.wfd-timeline__dot')) {
                return;
            }
            self._scheduleTooltipHide();
        });

        // Container hover → show/hide timeline
        this.container.addEventListener('mouseenter', function () {
            if (self._timelineLeaveTimer) {
                clearTimeout(self._timelineLeaveTimer);
                self._timelineLeaveTimer = null;
            }
            if (self._timelineEl) {
                self._timelineEl.classList.add('wfd-timeline--visible');
            }
            if (self._captionEl) {
                self._captionEl.classList.add('wfd-caption--timeline-visible');
            }
        });

        this.container.addEventListener('mouseleave', function () {
            self._timelineLeaveTimer = setTimeout(function () {
                self._timelineLeaveTimer = null;
                if (self._timelineEl) {
                    self._timelineEl.classList.remove('wfd-timeline--visible');
                }
                if (self._captionEl) {
                    self._captionEl.classList.remove('wfd-caption--timeline-visible');
                }
                self._timelineHovering = false;
                self._hideTooltip();
            }, 150);
        });

        this.container.appendChild(el);
        this._timelineEl = el;
        this._updateTimelineDots();
    };

    // ── Tooltip helpers ────────────────────────────────────────────────

    /**
     * Show the tooltip centered above a specific dot.
     * Called on fresh dot hover (before any button click).
     */
    WireframeDemo.prototype._showTooltipAtDot = function (dotEl, stepIndex) {
        var tooltip = this._tooltipEl;
        if (!tooltip) return;
        this._tooltipDotIndex = stepIndex;
        this._tooltipDotEl = dotEl;

        this._updateTooltipButtons();
        tooltip.classList.add('wfd-timeline-tooltip--visible');
        this._repositionTooltip();
    };

    /**
     * After a button click, re-anchor the tooltip to the current step.
     */
    WireframeDemo.prototype._anchorTooltipToCurrentStep = function () {
        var idx = this._stepIndex;
        var dotEl = this._timelineDots[idx];
        if (dotEl) {
            this._tooltipDotIndex = idx;
            this._tooltipDotEl = dotEl;
        }
        this._updateTooltipButtons();
        this._repositionTooltip();
    };

    WireframeDemo.prototype._updateTooltipButtons = function () {
        if (!this._tooltipPlayBtn) return;

        // Play/pause icon
        if (this._playing) {
            this._tooltipPlayBtn.innerHTML = ICON_PAUSE;
            this._tooltipPlayBtn.setAttribute('aria-label', 'Pause');
        } else {
            this._tooltipPlayBtn.innerHTML = ICON_PLAY;
            this._tooltipPlayBtn.setAttribute('aria-label', 'Play');
        }

        // Step buttons: visible only when paused
        var showStepBtns = !this._playing;
        // When activated (user has clicked), use _stepIndex for bounds;
        // otherwise use the hovered dot index
        var refIdx = this._tooltipActivated ? this._stepIndex : this._tooltipDotIndex;

        if (this._tooltipBackBtn) {
            this._tooltipBackBtn.hidden = !showStepBtns;
            if (showStepBtns && refIdx <= 0) {
                this._tooltipBackBtn.hidden = true;
            }
        }
        if (this._tooltipFwdBtn) {
            this._tooltipFwdBtn.hidden = !showStepBtns;
            if (showStepBtns && refIdx >= this._steps.length - 1) {
                this._tooltipFwdBtn.hidden = true;
            }
        }
    };

    WireframeDemo.prototype._repositionTooltip = function () {
        var tooltip = this._tooltipEl;
        var dotEl = this._tooltipDotEl;
        if (!tooltip || !dotEl) return;

        var containerRect = this.container.getBoundingClientRect();
        var dotRect = dotEl.getBoundingClientRect();
        var tooltipWidth = tooltip.offsetWidth;
        var left = (dotRect.left - containerRect.left) + (dotRect.width / 2) - (tooltipWidth / 2);
        var bottom = containerRect.bottom - dotRect.top + 2;

        left = Math.max(4, Math.min(left, containerRect.width - tooltipWidth - 4));

        tooltip.style.left = left + 'px';
        tooltip.style.bottom = bottom + 'px';
    };

    /**
     * Called from play()/pause() to keep tooltip in sync with playback state.
     * Updates button icons/visibility in place without moving the tooltip.
     */
    WireframeDemo.prototype._updateTooltip = function () {
        if (!this._tooltipEl || this._tooltipDotIndex < 0) return;
        this._updateTooltipButtons();
        this._repositionTooltip(); // re-measure in case button count changed tooltip width
    };

    WireframeDemo.prototype._hideTooltip = function () {
        if (!this._tooltipEl) return;
        this._tooltipEl.classList.remove('wfd-timeline-tooltip--visible');
        this._tooltipDotIndex = -1;
        this._tooltipDotEl = null;
        this._tooltipActivated = false;
    };

    WireframeDemo.prototype._scheduleTooltipHide = function () {
        var self = this;
        this._cancelTooltipHide();
        this._tooltipHideTimer = setTimeout(function () {
            self._tooltipHideTimer = null;
            self._timelineHovering = false;
            self._hideTooltip();
            // Restore the current step's caption
            if (self._playing && self._stepIndex < self._steps.length) {
                var currentStep = self._steps[self._stepIndex];
                if (currentStep.caption) {
                    self._showCaption(currentStep, null);
                } else {
                    self._hideCaption();
                }
            } else {
                self._hideCaption();
            }
        }, 120);
    };

    WireframeDemo.prototype._cancelTooltipHide = function () {
        if (this._tooltipHideTimer) {
            clearTimeout(this._tooltipHideTimer);
            this._tooltipHideTimer = null;
        }
    };

    WireframeDemo.prototype._updateTimelineDots = function () {
        if (!this._timelineDots.length) return;
        for (var i = 0; i < this._timelineDots.length; i++) {
            var dot = this._timelineDots[i];
            if (i <= this._stepIndex) {
                dot.classList.add('wfd-timeline__dot--filled');
            } else {
                dot.classList.remove('wfd-timeline__dot--filled');
            }
            if (i === this._stepIndex) {
                dot.classList.add('wfd-timeline__dot--current');
            } else {
                dot.classList.remove('wfd-timeline__dot--current');
            }
        }
    };

    // ── Jump to step (for timeline click navigation) ────────────────────

    WireframeDemo.prototype.jumpToStep = function (targetIndex) {
        if (targetIndex < 0 || targetIndex >= this._steps.length) return;
        if (targetIndex === this._stepIndex) return;

        var wasPlaying = this._playing;

        // Stop current timer/animation
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
        this._playing = false;

        this._clearHighlights();
        this._hideCaption();
        if (this._cursorEl) this._hideCursor();

        if (targetIndex > this._stepIndex) {
            // ── Forward jump: replay intermediate steps synchronously ──
            for (var i = this._stepIndex; i < targetIndex; i++) {
                var step = this._steps[i];
                // Cache snapshot before executing
                if (this.config.timeline !== false && !this._htmlSnapshots[i]) {
                    this._htmlSnapshots[i] = this._contentRoot.innerHTML;
                }
                var el = null;
                if (step.target) {
                    el = this._contentRoot.querySelector(step.target) ||
                         this.container.querySelector(step.target);
                }
                this._executeAction(step, el);
            }
            this._stepIndex = targetIndex;
        } else {
            // ── Backward jump: restore cached snapshot ──────────────────
            if (this._htmlSnapshots[targetIndex]) {
                this._contentRoot.innerHTML = this._htmlSnapshots[targetIndex];
                document.dispatchEvent(new CustomEvent('wireframe-demo-loaded', {
                    detail: { container: this.container, instance: this }
                }));
            } else {
                // Safety fallback: restore initial HTML and replay 0..target-1
                if (this._initialHTML !== undefined) {
                    this._contentRoot.innerHTML = this._initialHTML;
                    document.dispatchEvent(new CustomEvent('wireframe-demo-loaded', {
                        detail: { container: this.container, instance: this }
                    }));
                }
                for (var j = 0; j < targetIndex; j++) {
                    var s = this._steps[j];
                    if (this.config.timeline !== false && !this._htmlSnapshots[j]) {
                        this._htmlSnapshots[j] = this._contentRoot.innerHTML;
                    }
                    var e = null;
                    if (s.target) {
                        e = this._contentRoot.querySelector(s.target) ||
                            this.container.querySelector(s.target);
                    }
                    this._executeAction(s, e);
                }
            }
            this._stepIndex = targetIndex;
        }

        this._updateTimelineDots();
        this._updateControlBtn();
    };

    // ── Step execution engine ───────────────────────────────────────────

    WireframeDemo.prototype._runStep = function () {
        if (!this._playing) return;
        if (this._stepIndex >= this._steps.length) {
            this._onSequenceEnd();
            return;
        }

        var self = this;
        var step = this._steps[this._stepIndex];
        var delay = typeof step.delay === 'number' ? step.delay : 2000;

        // Snapshot HTML state before this step executes (for backward jumps)
        if (this.config.timeline !== false && !this._htmlSnapshots[this._stepIndex]) {
            this._htmlSnapshots[this._stepIndex] = this._contentRoot.innerHTML;
        }

        // Update timeline dots
        this._updateTimelineDots();

        // If tooltip is activated and visible, keep it anchored to current step
        if (this._tooltipActivated && this._tooltipDotIndex >= 0) {
            this._anchorTooltipToCurrentStep();
        }
        if (this.config.onStepStart) {
            this.config.onStepStart(this._stepIndex, step);
        }

        // Clear previous highlights
        this._clearHighlights();

        // Resolve target element
        var el = null;
        if (step.target) {
            el = this._contentRoot.querySelector(step.target);
            if (!el) {
                // Also try the container itself (for elements outside _contentRoot)
                el = this.container.querySelector(step.target);
            }
        }

        // Show caption at the start of the step (while cursor moves)
        this._showCaption(step, el);

        // Animate cursor to target, then execute action
        if (this.config.cursor && el) {
            var cursorSpeed = this.config.cursorSpeed;
            this._moveCursorTo(el, function () {
                if (!self._playing) return;
                self._executeAction(step, el);
                if (self.config.onStepEnd) {
                    self.config.onStepEnd(self._stepIndex, step);
                }
                self._stepIndex++;
                var remaining = Math.max(delay - cursorSpeed, 100);
                self._timer = setTimeout(function () {
                    self._timer = null;
                    self._runStep();
                }, remaining);
            });
        } else {
            if (this.config.cursor && step.action === 'pause') {
                this._hideCursor();
            }
            this._executeAction(step, el);
            if (this.config.onStepEnd) {
                this.config.onStepEnd(this._stepIndex, step);
            }
            this._stepIndex++;
            this._timer = setTimeout(function () {
                self._timer = null;
                self._runStep();
            }, delay);
        }
    };

    WireframeDemo.prototype._onSequenceEnd = function () {
        this._clearHighlights();
        this._hideCaption();
        if (this.config.onComplete) {
            this.config.onComplete();
        }
        if (this.config.repeat) {
            var self = this;
            this._stepIndex = 0;
            this._htmlSnapshots = [];

            // Restore the content DOM to its initial state before replaying
            if (this._initialHTML !== undefined) {
                this._contentRoot.innerHTML = this._initialHTML;
                document.dispatchEvent(new CustomEvent('wireframe-demo-loaded', {
                    detail: { container: this.container, instance: this }
                }));
            }

            this._resetCursor();
            this._updateTimelineDots();

            this._timer = setTimeout(function () {
                self._timer = null;
                self._runStep();
            }, 1000);
        } else {
            this._playing = false;
            this._updateControlBtn();
        }
    };

    WireframeDemo.prototype._executeAction = function (step, el) {
        var action = step.action;
        var value = step.value;

        // Check custom actions first
        if (_customActions[action]) {
            _customActions[action].call(this, step, el, this._contentRoot);
            return;
        }

        switch (action) {
            case 'pause':
                // Do nothing — the delay handles the wait
                break;

            case 'click':
                if (el) {
                    el.click();
                    if (!step.noHighlight) this._highlight(el, step.delay);
                }
                break;

            case 'add-class':
                if (el && value) {
                    value.split(/\s+/).forEach(function (c) { el.classList.add(c); });
                    if (!step.noHighlight) this._highlight(el, step.delay);
                }
                break;

            case 'remove-class':
                if (el && value) {
                    value.split(/\s+/).forEach(function (c) { el.classList.remove(c); });
                }
                break;

            case 'toggle-class':
                if (el && value) {
                    value.split(/\s+/).forEach(function (c) { el.classList.toggle(c); });
                    if (!step.noHighlight) this._highlight(el, step.delay);
                }
                break;

            case 'set-attribute':
                if (el && value) {
                    var sep = value.indexOf(':');
                    if (sep !== -1) {
                        el.setAttribute(value.substring(0, sep), value.substring(sep + 1));
                    }
                    if (!step.noHighlight) this._highlight(el, step.delay);
                }
                break;

            case 'remove-attribute':
                if (el && value) {
                    el.removeAttribute(value);
                }
                break;

            case 'set-value':
                if (el && value !== undefined) {
                    el.value = value;
                    // Dispatch input event so frameworks pick up the change
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    if (!step.noHighlight) this._highlight(el, step.delay);
                }
                break;

            case 'set-text':
                if (el && value !== undefined) {
                    el.textContent = value;
                    if (!step.noHighlight) this._highlight(el, step.delay);
                }
                break;

            case 'set-html':
                if (el && value !== undefined) {
                    el.innerHTML = value;
                    if (!step.noHighlight) this._highlight(el, step.delay);
                }
                break;

            case 'scroll-into-view':
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    if (!step.noHighlight) this._highlight(el, step.delay);
                }
                break;

            case 'dispatch-event':
                if (el && value) {
                    var evtSep = value.indexOf(':');
                    var evtName, evtDetail;
                    if (evtSep !== -1) {
                        evtName = value.substring(0, evtSep);
                        try { evtDetail = JSON.parse(value.substring(evtSep + 1)); }
                        catch (_e) { evtDetail = value.substring(evtSep + 1); }
                    } else {
                        evtName = value;
                        evtDetail = null;
                    }
                    el.dispatchEvent(new CustomEvent(evtName, {
                        bubbles: true, detail: evtDetail
                    }));
                    if (!step.noHighlight) this._highlight(el, step.delay);
                }
                break;

            case 'highlight':
                if (el) {
                    this._highlight(el, step.delay);
                }
                break;

            default:
                console.warn('[WireframeDemo] Unknown action: ' + action);
        }
    };

    // ── Highlight helpers ───────────────────────────────────────────────

    WireframeDemo.prototype._highlight = function (el, duration) {
        var self = this;
        el.classList.add('wfd-highlight');
        this._highlightedEls.push(el);
        var dur = Math.max(duration - 200, 400);
        setTimeout(function () {
            el.classList.remove('wfd-highlight');
            var idx = self._highlightedEls.indexOf(el);
            if (idx !== -1) self._highlightedEls.splice(idx, 1);
        }, dur);
    };

    WireframeDemo.prototype._clearHighlights = function () {
        for (var i = 0; i < this._highlightedEls.length; i++) {
            this._highlightedEls[i].classList.remove('wfd-highlight');
        }
        this._highlightedEls = [];
    };

    // ── Cleanup ─────────────────────────────────────────────────────────

    WireframeDemo.prototype.destroy = function () {
        this.pause();
        this._clearHighlights();
        this._hideCaption();
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }
        if (this._timelineEl && this._timelineEl.parentNode) {
            this._timelineEl.parentNode.removeChild(this._timelineEl);
            this._timelineEl = null;
            this._timelineDots = [];
        }
        if (this._tooltipEl && this._tooltipEl.parentNode) {
            this._tooltipEl.parentNode.removeChild(this._tooltipEl);
            this._tooltipEl = null;
        }
        this._cancelTooltipHide();
        if (this._timelineLeaveTimer) {
            clearTimeout(this._timelineLeaveTimer);
            this._timelineLeaveTimer = null;
        }
        this._htmlSnapshots = [];
        this.container.removeAttribute('data-wireframe-initialized');
    };

    // ── Static: register custom action ──────────────────────────────────

    /**
     * Register a custom action handler.
     *
     * @param {string}   name    Action name (e.g. "select-tab")
     * @param {Function} handler Called as handler.call(instance, step, el, contentRoot)
     */
    WireframeDemo.registerAction = function (name, handler) {
        _customActions[name] = handler;
    };

    // ── Export ───────────────────────────────────────────────────────────

    root.WireframeDemo = WireframeDemo;

    // Signal that WireframeDemo is available for action registration.
    // Scripts loaded before the controller (e.g. directive :js: files) can
    // listen for this event to register custom actions before auto-discover.
    document.dispatchEvent(new CustomEvent('wireframe-demo-ready'));

    // ── Auto-discovery ──────────────────────────────────────────────────

    function autoDiscover() {
        var containers = document.querySelectorAll(
            '[data-wireframe-demo]:not([data-wireframe-initialized])'
        );
        for (var i = 0; i < containers.length; i++) {
            var el = containers[i];
            var configAttr = el.getAttribute('data-wireframe-config');
            var config = {};
            if (configAttr) {
                try { config = JSON.parse(configAttr); }
                catch (e) { console.error('[WireframeDemo] Bad config JSON:', e); }
            }
            new WireframeDemo(el, config);
        }
    }

    // Run auto-discovery on DOMContentLoaded and on the custom event
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoDiscover);
    } else {
        autoDiscover();
    }
    document.addEventListener('wireframe-demo-loaded', autoDiscover);

})(typeof window !== 'undefined' ? window : this);
