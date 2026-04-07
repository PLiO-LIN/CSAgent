from __future__ import annotations

from typing import Any

CSAGENT_CARD_META_KEY = "io.github.pliolin.csagent/card"
CSAGENT_CARD_RESULT_META_KEY = "io.github.pliolin.csagent/card-result"
CSAGENT_ICONS_META_KEY = "io.github.pliolin.csagent/icons"


def _text(*values: Any) -> str:
    for value in values:
        if isinstance(value, (dict, list, tuple, set)):
            continue
        text = str(value or "").strip()
        if text:
            return text
    return ""


def _first(mapping: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in mapping:
            return mapping.get(key)
    return None


def normalize_icon_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    result: list[dict[str, Any]] = []
    for item in value:
        if hasattr(item, "model_dump"):
            try:
                item = item.model_dump(mode="json")
            except Exception:
                item = None
        if not isinstance(item, dict):
            continue
        src = _text(item.get("src"))
        if not src:
            continue
        icon: dict[str, Any] = {"src": src}
        mime_type = _text(item.get("mimeType"), item.get("mime_type"))
        if mime_type:
            icon["mimeType"] = mime_type
        sizes = item.get("sizes")
        if isinstance(sizes, list):
            normalized_sizes = [_text(size) for size in sizes if _text(size)]
            if normalized_sizes:
                icon["sizes"] = normalized_sizes
        theme = _text(item.get("theme"))
        if theme:
            icon["theme"] = theme
        result.append(icon)
    return result


def extract_tool_icons(protocol_meta: dict[str, Any] | None, declared_icons: Any = None) -> list[dict[str, Any]]:
    icons = normalize_icon_list(declared_icons)
    if icons:
        return icons
    meta = dict(protocol_meta or {})
    fallback = meta.get(CSAGENT_ICONS_META_KEY)
    if isinstance(fallback, list):
        icons = normalize_icon_list(fallback)
        if icons:
            return icons
    ui_payload = meta.get("ui")
    if isinstance(ui_payload, dict):
        return normalize_icon_list(ui_payload.get("icons"))
    return []


def normalize_card_binding(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    source = dict(value)
    binding: dict[str, Any] = {}
    nested_field_map = _first(source, "field_map", "fieldMap")
    mode = _text(source.get("mode")).lower()
    if not mode:
        mode = "field_map" if isinstance(nested_field_map, dict) else "template_payload"
    if mode == "template_id" and isinstance(nested_field_map, dict):
        mode = "field_map"
    if mode:
        binding["mode"] = mode

    template_id = _text(_first(source, "template_id", "templateId"))
    if template_id:
        binding["template_id"] = template_id

    for target_key, source_keys in {
        "title": ("title",),
        "summary": ("summary",),
        "title_literal": ("title_literal", "titleLiteral"),
        "summary_literal": ("summary_literal", "summaryLiteral"),
        "payload_path": ("payload_path", "payloadPath", "payload"),
        "actions_path": ("actions_path", "actionsPath"),
        "card_path": ("card_path", "cardPath"),
        "source": ("source",),
    }.items():
        raw = _first(source, *source_keys)
        text = _text(raw)
        if text:
            binding[target_key] = text

    for target_key, source_keys in {
        "payload_map": ("payload_map", "payloadMap"),
        "metadata": ("metadata",),
    }.items():
        raw = _first(source, *source_keys)
        if isinstance(raw, dict) and raw:
            binding[target_key] = dict(raw)

    raw_actions = _first(source, "actions")
    if isinstance(raw_actions, list):
        binding["actions"] = [dict(item) for item in raw_actions if isinstance(item, dict)]

    if isinstance(nested_field_map, dict) and nested_field_map:
        binding.setdefault("payload_map", dict(nested_field_map))

    return binding


def extract_tool_card_binding(protocol_meta: dict[str, Any] | None) -> dict[str, Any]:
    meta = dict(protocol_meta or {})
    contract = meta.get(CSAGENT_CARD_META_KEY)
    if not isinstance(contract, dict):
        return {}
    return normalize_card_binding(contract)


def extract_tool_card_type(protocol_meta: dict[str, Any] | None) -> str:
    meta = dict(protocol_meta or {})
    contract = meta.get(CSAGENT_CARD_META_KEY)
    if not isinstance(contract, dict):
        return ""
    return _text(contract.get("card_type"), contract.get("cardType"), contract.get("template_id"), contract.get("templateId"))


def extract_result_card_contract(protocol_meta: dict[str, Any] | None) -> dict[str, Any]:
    meta = dict(protocol_meta or {})
    contract = meta.get(CSAGENT_CARD_RESULT_META_KEY)
    if not isinstance(contract, dict):
        return {}
    result: dict[str, Any] = {}

    direct_card = contract.get("card")
    if isinstance(direct_card, dict):
        result["card"] = dict(direct_card)

    direct_cards = contract.get("cards")
    if isinstance(direct_cards, list):
        result["cards"] = [dict(item) for item in direct_cards if isinstance(item, dict)]

    card_source = _first(contract, "card_source", "cardSource", "source_payload", "sourcePayload")
    if isinstance(card_source, dict):
        result["card_source"] = dict(card_source)

    card_sources = _first(contract, "card_sources", "cardSources", "source_payloads", "sourcePayloads")
    if isinstance(card_sources, list):
        normalized_sources: list[dict[str, Any]] = []
        for item in card_sources:
            if not isinstance(item, dict):
                continue
            payload = _first(item, "source_payload", "sourcePayload", "card_source", "cardSource")
            normalized_item = dict(item)
            if isinstance(payload, dict):
                normalized_item["source_payload"] = dict(payload)
            normalized_sources.append(normalized_item)
        result["card_sources"] = normalized_sources

    binding_source = contract.get("binding") if isinstance(contract.get("binding"), dict) else contract
    binding = normalize_card_binding(binding_source)
    if binding:
        result["binding"] = binding

    return result
