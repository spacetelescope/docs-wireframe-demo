def validate_wireframe_sequence(sequence_str, option_name, docname, lineno, logger):
    """
    Validate a wireframe demo sequence string and log warnings for issues.

    Parameters
    ----------
    sequence_str : str
        The sequence string (e.g., from :initial: or :demo: options)
    option_name : str
        Name of the option being validated (for error messages)
    docname : str
        Document name (for error location)
    lineno : int
        Line number (for error location)
    logger : sphinx.util.logging.SphinxLoggerAdapter
        Logger to use for warnings
    """
    if not sequence_str:
        return

    # Known viewer actions (generic; not app-specific)
    valid_viewer_actions = {
        'viewer-add', 'viewer-image', 'viewer-legend', 'viewer-focus',
        'viewer-remove', 'viewer-open-data-menu', 'viewer-tool-toggle'
    }

    # Known generic sidebar actions
    # Sidebar names themselves are NOT validated here — they are app-defined and
    # validated at runtime against the DOM.
    valid_actions = {
        'show', 'open-panel', 'select-tab', 'select-dropdown',
        'click-button', 'open-data-menu', 'highlight', 'toggle-class',
    }

    items = [s.strip() for s in sequence_str.split(',')]

    for item in items:
        if not item:
            continue

        working_item = item

        # Parse @duration syntax
        if '@' in item:
            at_index = item.index('@')
            before_at = item[:at_index]
            after_at = item[at_index + 1:]

            # Extract duration part
            colon_after_at = after_at.find(':')
            if colon_after_at != -1:
                duration_part = after_at[:colon_after_at]
                working_item = before_at + after_at[colon_after_at:]
            else:
                duration_part = after_at
                working_item = before_at

            # Remove ! suffix if present
            if duration_part.endswith('!'):
                duration_part = duration_part[:-1]

            # Validate duration is a number
            if duration_part:
                try:
                    int(duration_part)
                except ValueError:
                    logger.warning(
                        f"wireframe-demo: Invalid duration '{duration_part}' in '{item}' "
                        f"(:{option_name}:). Duration must be an integer.",
                        location=(docname, lineno)
                    )

        # CSS selector steps (start with # . or [) — skip all further validation;
        # the engine handles these at runtime
        first_char = working_item[0] if working_item else ''
        if first_char in ('#', '.', '['):
            continue

        # Parse sidebar:action or sidebar:action=value
        if ':' in working_item:
            colon_index = working_item.index(':')
            sidebar = working_item[:colon_index]
            action_part = working_item[colon_index + 1:]
        else:
            sidebar = working_item
            action_part = None

        # Check for viewer-* actions
        if sidebar.startswith('viewer-'):
            if sidebar not in valid_viewer_actions:
                logger.warning(
                    f"wireframe-demo: Unknown viewer action '{sidebar}' in '{item}' "
                    f"(:{option_name}:). Valid viewer actions: {sorted(valid_viewer_actions)}",
                    location=(docname, lineno)
                )
        elif sidebar == 'pause':
            # pause is valid, no action needed
            pass

        # Validate action if present (sidebar names are app-defined; only actions validated)
        if action_part:
            # Extract action name (before = if present)
            if '=' in action_part:
                action_name = action_part[:action_part.index('=')]
            else:
                action_name = action_part

            if action_name not in valid_actions and not sidebar.startswith('viewer-'):
                logger.warning(
                    f"wireframe-demo: Unknown action '{action_name}' in '{item}' "
                    f"(:{option_name}:). Valid actions: {sorted(valid_actions)}",
                    location=(docname, lineno)
                )
