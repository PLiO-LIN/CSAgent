from app.plugins.manifest import discover_plugins, discover_skills


def test_seed_plugins_are_discovered():
    plugins = discover_plugins()
    ids = {item.plugin_id for item in plugins}
    assert "global.base" in ids
    assert "global.knowledge" in ids
    assert "telecom.query" in ids
    assert "telecom.recommend" in ids
    assert "telecom.order" in ids
    assert "telecom.recharge" in ids


def test_seed_skills_are_discovered():
    skills = discover_skills()
    names = {item.name for item in skills}
    assert "query" in names
    assert "recommend" in names
    assert "order" in names
    assert "recharge" in names
