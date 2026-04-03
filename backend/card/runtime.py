from __future__ import annotations

from copy import deepcopy
from typing import Any


def _template_value(template: Any, key: str, default: Any = None) -> Any:
    if isinstance(template, dict):
        return deepcopy(template.get(key, default))
    return deepcopy(getattr(template, key, default))


def _resolve_path(source: Any, expr: str) -> Any:
    text = str(expr or '').strip()
    if not text:
        return None
    if text == '$':
        return deepcopy(source)
    if not text.startswith('$.'):
        return deepcopy(text)

    current = source
    cursor = text[2:]
    while cursor:
        if cursor.startswith('['):
            end = cursor.find(']')
            if end < 0:
                return None
            token = cursor[1:end].strip()
            cursor = cursor[end + 1:]
            if cursor.startswith('.'):
                cursor = cursor[1:]
            if not isinstance(current, list):
                return None
            try:
                index = int(token)
            except ValueError:
                return None
            if index < 0 or index >= len(current):
                return None
            current = current[index]
            continue

        next_dot = cursor.find('.')
        next_bracket = cursor.find('[')
        next_stop = len(cursor)
        if next_dot >= 0:
            next_stop = min(next_stop, next_dot)
        if next_bracket >= 0:
            next_stop = min(next_stop, next_bracket)
        segment = cursor[:next_stop]
        cursor = cursor[next_stop:]
        if cursor.startswith('.'):
            cursor = cursor[1:]

        if isinstance(current, dict):
            current = current.get(segment)
        elif isinstance(current, list):
            try:
                current = current[int(segment)]
            except (ValueError, IndexError):
                return None
        else:
            return None
    return deepcopy(current)


def _resolve_expr(source: Any, value: Any) -> Any:
    if isinstance(value, str):
        text = value.strip()
        if text.startswith('$'):
            return _resolve_path(source, text)
        return value
    if isinstance(value, list):
        return [_resolve_expr(source, item) for item in value]
    if isinstance(value, dict):
        return {key: _resolve_expr(source, child) for key, child in value.items()}
    return deepcopy(value)


def _text_value(*values: Any) -> str:
    for value in values:
        if isinstance(value, (dict, list)):
            continue
        text = str(value or '').strip()
        if text:
            return text
    return ''


def _normalize_actions(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    result: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, dict):
            result.append(dict(item))
    return result


def build_template_card(template: Any, source_payload: dict[str, Any] | None = None, binding: dict[str, Any] | None = None) -> dict[str, Any]:
    template_id = _text_value(_template_value(template, 'template_id', ''), 'template-card')
    display_name = _text_value(_template_value(template, 'display_name', ''), template_id)
    template_type = _text_value(_template_value(template, 'template_type', ''), 'info_detail')
    renderer_key = _text_value(_template_value(template, 'renderer_key', ''), f'template::{template_type}')
    ui_schema = _template_value(template, 'ui_schema', {}) or {}
    action_schema = _template_value(template, 'action_schema', {}) or {}
    metadata = _template_value(template, 'metadata', {}) or {}
    source = dict(source_payload or {})
    binding_map = dict(binding or {})
    mode = _text_value(binding_map.get('mode'), 'template_payload').lower()

    title = _text_value(binding_map.get('title_literal'))
    summary = _text_value(binding_map.get('summary_literal'))
    resolved_payload: Any = deepcopy(source)
    actions = _normalize_actions(action_schema.get('actions'))
    debug: dict[str, Any] = {'mode': mode}

    if mode == 'field_map':
        payload_map = binding_map.get('payload_map')
        payload_path = binding_map.get('payload_path') or binding_map.get('payload')
        actions_path = binding_map.get('actions_path')
        metadata_map = binding_map.get('metadata')
        title = _text_value(_resolve_expr(source, binding_map.get('title')), source.get('title'), title, display_name)
        summary = _text_value(_resolve_expr(source, binding_map.get('summary')), source.get('summary'), summary)
        if isinstance(payload_map, dict) and payload_map:
            resolved_payload = _resolve_expr(source, payload_map)
            debug['payload_source'] = 'payload_map'
        elif payload_path:
            resolved_payload = _resolve_expr(source, payload_path)
            debug['payload_source'] = str(payload_path)
        else:
            resolved_payload = deepcopy(source)
            debug['payload_source'] = '$'
        if actions_path:
            actions = _normalize_actions(_resolve_expr(source, actions_path)) or actions
            debug['actions_source'] = str(actions_path)
        elif isinstance(binding_map.get('actions'), list):
            actions = _normalize_actions(binding_map.get('actions'))
            debug['actions_source'] = 'binding.actions'
        if isinstance(metadata_map, dict):
            metadata = _resolve_expr(source, metadata_map)
    elif mode == 'direct_card':
        direct_card = _resolve_expr(source, binding_map.get('card_path') or '$')
        if isinstance(direct_card, dict):
            card = dict(direct_card)
            card.setdefault('type', template_type)
            card.setdefault('template_id', template_id)
            card.setdefault('renderer_key', renderer_key)
            card.setdefault('ui_schema', ui_schema)
            card.setdefault('actions', actions)
            return {
                'card': card,
                'debug': {'mode': mode, 'payload_source': binding_map.get('card_path') or '$'},
            }
        resolved_payload = {'value': direct_card}
        title = _text_value(title, display_name)
    else:
        title = _text_value(source.get('title'), title, display_name)
        summary = _text_value(source.get('summary'), summary)

    card = {
        'type': template_type,
        'template_id': template_id,
        'renderer_key': renderer_key,
        'title': title or display_name,
        'summary': summary,
        'payload': resolved_payload if isinstance(resolved_payload, dict) else {'value': resolved_payload},
        'ui_schema': ui_schema,
        'actions': actions,
        'meta': metadata,
    }
    return {
        'card': card,
        'debug': debug,
    }
