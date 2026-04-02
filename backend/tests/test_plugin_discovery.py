from tool.registry import all_tools, ensure_local_tools_loaded


def test_platform_base_local_tools_are_loaded():
    ensure_local_tools_loaded()
    tools = all_tools()
    assert "load_skills" in tools
    assert "list_tools" in tools
    assert "list_skills" in tools


def test_platform_base_contains_only_core_local_tools_by_default():
    ensure_local_tools_loaded()
    tools = all_tools()
    assert set(tools.keys()) == {"load_skills", "list_tools", "list_skills"}
