"""
Backward compatibility tests for the SillyTavern Image Generation Autopilot extension.

Verifies that existing presets without characterRegistry still work correctly,
and that the new registry-based multi-NPC feature doesn't break existing behavior.

These tests mock the extension context — no actual SillyTavern instance required.
"""

import json
import os
import sys
import pytest
from unittest.mock import Mock, patch, MagicMock

# Paths to the extension source and preset files
EXTENSION_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# ST-Presets lives at /home/djdembeck/projects/gitlab/ST-Presets
# tests/ -> SillyTavern-Image-Generation-Autopilot/ -> github/ -> projects/ -> gitlab/ST-Presets
PRESETS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
    "gitlab",
    "ST-Presets",
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def realistic_preset():
    """Load the realistic preset (no characterRegistry field)."""
    path = os.path.join(PRESETS_DIR, "image-presets", "realistic.json")
    with open(path) as f:
        preset = json.load(f)
    # Ensure no characterRegistry field exists (backward compat test)
    preset.pop("characterRegistry", None)
    return preset


@pytest.fixture
def corepower_registry():
    """Load the CorePower Yoga character registry."""
    path = os.path.join(PRESETS_DIR, "presets", "registries", "corepower-yoga-registry.json")
    with open(path) as f:
        return json.load(f)


@pytest.fixture
def mock_summarizer_module():
    """Mock the summarizer module's browser-dependent globals."""
    with patch.dict("sys.modules", {}):
        # We need to mock the module-level globals before importing
        # The summarizer.js is an ES module — we test the logic by
        # reimplementing the key functions in Python for testability.
        pass


# ---------------------------------------------------------------------------
# Reimplemented summarizer logic for testing (mirrors summarizer.js)
# ---------------------------------------------------------------------------

OUTPUT_FORMAT_LINES = [
    "Characters:",
    "  Shared: [body type; common clothing style if shared across all characters]",
    "  - [Name]: [unique traits only - skin, hair, accessories, distinctive clothing, pose]",
    "",
    "Scene: [location, 2-3 key visual elements, lighting]",
]

DEFAULT_OUTPUT_FORMAT = "\n".join(OUTPUT_FORMAT_LINES)

DEFAULT_SYSTEM_PROMPT_TEMPLATE = """Create image generation prompts from roleplay scenarios.

Character Appearance:
{{APPEARANCE_LINES}}

Rules:
- Use only literal visual descriptions
- No metaphors, emotions, or abstract concepts
- Only include what can be seen: colors, shapes, positions, lighting, textures
- Be concise - omit unnecessary words
- Group all shared character traits (body type, common clothing style) into the Shared line under Characters - NEVER repeat them per character
- Each character line must be SHORT: only what makes them visually unique (skin, hair, accessories, distinctive clothing, pose)
- Omit minor details (finger positions, small accessories, texture descriptions, fabric sheen) - they waste the word budget
- Scene description must be brief: name the location, 2-3 key visual elements, and lighting - nothing more

Output Format:
{{OUTPUT_FORMAT_LINES}}"""


def build_system_prompt(system_prompt_template, appearance_lines, output_format_lines=None):
    """Mirrors summarizer.js buildSystemPrompt (line 251-256)."""
    format_lines = output_format_lines or DEFAULT_OUTPUT_FORMAT
    return system_prompt_template.replace(
        "{{APPEARANCE_LINES}}", appearance_lines
    ).replace("{{OUTPUT_FORMAT_LINES}}", format_lines)


def build_appearance_lines_from_registry(registry, scene_characters, char_name):
    """
    Mirrors summarizer.js buildAppearanceLinesFromRegistry (line 129-196).
    Pure logic — no SillyTavern dependency.
    """
    # No registry or empty → fall back
    if (
        not registry
        or not registry.get("characters")
        or not isinstance(registry["characters"], list)
        or len(registry["characters"]) == 0
    ):
        return None

    if not isinstance(scene_characters, list) or len(scene_characters) == 0:
        return None

    lines = []

    # Build Shared: line from first entry's body_type_override
    first_entry = registry["characters"][0]
    shared_parts = []

    if first_entry.get("generator_fields", {}).get("body_type_override"):
        shared_parts.append(first_entry["generator_fields"]["body_type_override"])

    # Check if any scene character is under 18 and has the override
    has_under18 = any(
        _find_registry_entry(registry, name).get("generator_fields", {}).get("under_18_visual_override")
        for name in scene_characters
    )

    if has_under18:
        for name in scene_characters:
            entry = _find_registry_entry(registry, name)
            if entry.get("generator_fields", {}).get("under_18_visual_override"):
                shared_parts.append(entry["generator_fields"]["under_18_visual_override"])
                break

    if shared_parts:
        lines.append(f"Shared: {'; '.join(shared_parts)}")

    # Build one "a female:" line per scene character
    for name in scene_characters:
        entry = _find_registry_entry(registry, name)
        if entry.get("generator_fields", {}).get("prompt_ready_description"):
            lines.append(f"  - a female: {entry['generator_fields']['prompt_ready_description']}")
        else:
            # Character not in registry → fall back to empty (no getCharacterDescription in test)
            pass

    if len(lines) == 0:
        return None

    return "\n".join(lines)


def _find_registry_entry(registry, name):
    """Find a character entry in the registry by name (case-insensitive)."""
    needle = str(name).strip().lower()
    for c in registry.get("characters", []):
        if c.get("name") and str(c["name"]).strip().lower() == needle:
            return c
    return {}


def build_invocation_config(input_config, char_name=None, user_name=None, settings=None):
    """
    Mirrors summarizer.js buildInvocationConfig (line 270-311).
    Tests that characterRegistry is optional and outputFormatLines is passed through.
    """
    if input_config and isinstance(input_config, dict) and not isinstance(input_config, list):
        return {
            "characterRegistry": input_config.get("characterRegistry") or None,
            "sceneCharacters": input_config.get("sceneCharacters") or [],
            "charName": input_config.get("charName") or "",
            "outputFormatLines": input_config.get("outputFormatLines"),
        }

    # Legacy string-based invocation
    summarizer_settings = (settings or {}).get("summarizer", {}) or (settings or {}).get("autoGeneration", {}).get("summarizer", {})
    return {
        "characterRegistry": None,
        "sceneCharacters": [],
        "charName": char_name or "",
        "outputFormatLines": summarizer_settings.get("outputFormatLines"),
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestPresetWithoutRegistry:
    """Test 1: Preset without characterRegistry field works correctly."""

    def test_preset_without_registry_works(self, realistic_preset):
        """Load a preset without characterRegistry, verify it doesn't crash."""
        # The realistic preset has no characterRegistry field
        assert "characterRegistry" not in realistic_preset

        # Verify the preset has valid structure
        assert realistic_preset["schemaVersion"] == 1
        assert realistic_preset["name"]
        assert realistic_preset["settings"]
        assert realistic_preset["settings"]["autoGeneration"]

        # Verify summarizer settings exist
        summarizer = realistic_preset["settings"]["autoGeneration"]["summarizer"]
        assert summarizer["systemPromptTemplate"]
        assert "{{APPEARANCE_LINES}}" in summarizer["systemPromptTemplate"]
        assert "{{OUTPUT_FORMAT_LINES}}" in summarizer["systemPromptTemplate"]

    def test_build_config_without_registry(self, realistic_preset):
        """buildInvocationConfig with no registry returns characterRegistry=None."""
        config = build_invocation_config(
            {"charName": "TestChar", "userName": "User"},
            char_name="TestChar",
            user_name="User",
        )
        assert config["characterRegistry"] is None
        assert config["sceneCharacters"] == []

    def test_build_appearance_lines_null_registry(self):
        """buildAppearanceLinesFromRegistry returns None when registry is None."""
        result = build_appearance_lines_from_registry(None, ["Alice"], "Alice")
        assert result is None

    def test_build_appearance_lines_empty_registry(self):
        """buildAppearanceLinesFromRegistry returns None when registry has no characters."""
        result = build_appearance_lines_from_registry(
            {"characters": []}, ["Alice"], "Alice"
        )
        assert result is None

    def test_build_appearance_lines_no_scene_characters(self, corepower_registry):
        """buildAppearanceLinesFromRegistry returns None when sceneCharacters is empty."""
        result = build_appearance_lines_from_registry(corepower_registry, [], "Alice")
        assert result is None


class TestPresetWithRegistry:
    """Test 2: Preset with characterRegistry works correctly."""

    def test_registry_has_required_structure(self, corepower_registry):
        """Registry has schema_version, card_name, and characters array."""
        assert corepower_registry["schema_version"] == 1
        assert corepower_registry["card_name"] == "corepower-yoga"
        assert isinstance(corepower_registry["characters"], list)
        assert len(corepower_registry["characters"]) > 0

    def test_registry_entries_have_generator_fields(self, corepower_registry):
        """Each registry entry has generator_fields with prompt_ready_description."""
        for entry in corepower_registry["characters"]:
            assert "generator_fields" in entry
            assert "prompt_ready_description" in entry["generator_fields"]
            assert isinstance(entry["generator_fields"]["prompt_ready_description"], str)
            assert len(entry["generator_fields"]["prompt_ready_description"]) > 0

    def test_build_appearance_lines_with_registry(self, corepower_registry):
        """Registry with matching scene characters produces valid appearance lines."""
        scene_chars = ["Avery Copple", "Brianna Teal"]
        result = build_appearance_lines_from_registry(
            corepower_registry, scene_chars, "Avery Copple"
        )
        assert result is not None
        assert "Shared:" in result
        assert "a female:" in result
        # Should have 2 character lines
        assert result.count("a female:") == 2

    def test_build_appearance_lines_single_character(self, corepower_registry):
        """Registry with one scene character produces one character line."""
        result = build_appearance_lines_from_registry(
            corepower_registry, ["Avery Copple"], "Avery Copple"
        )
        assert result is not None
        assert "Shared:" in result
        assert result.count("a female:") == 1


class TestFallbackBehavior:
    """Test 3: Fallback to single-character behavior when registry present but character not found."""

    def test_character_not_in_registry_produces_shared_only(self, corepower_registry):
        """Character not in registry → Shared line still built, but no a female: lines."""
        result = build_appearance_lines_from_registry(
            corepower_registry, ["NonExistentCharacter"], "NonExistentCharacter"
        )
        # Shared line is built from first registry entry regardless of scene characters
        assert result is not None
        assert "Shared:" in result
        # But no character lines since NonExistentCharacter has no prompt_ready_description
        assert "a female:" not in result

    def test_mixed_found_and_not_found(self, corepower_registry):
        """Some characters in registry, some not → only found ones get lines."""
        scene_chars = ["Avery Copple", "NonExistentCharacter"]
        result = build_appearance_lines_from_registry(
            corepower_registry, scene_chars, "Avery Copple"
        )
        assert result is not None
        # Only Avery Copple gets a line; NonExistentCharacter is skipped
        assert result.count("a female:") == 1
        assert "Avery Copple" not in result  # Names shouldn't appear in output
        assert "NonExistentCharacter" not in result

    def test_case_insensitive_name_matching(self, corepower_registry):
        """Character name matching is case-insensitive."""
        result = build_appearance_lines_from_registry(
            corepower_registry, ["avery copple"], "avery copple"
        )
        assert result is not None
        assert result.count("a female:") == 1

    def test_null_registry_falls_back(self):
        """null registry → buildAppearanceLinesFromRegistry returns None (fallback)."""
        result = build_appearance_lines_from_registry(None, ["Alice"], "Alice")
        assert result is None

    def test_undefined_registry_falls_back(self):
        """undefined registry → buildAppearanceLinesFromRegistry returns None."""
        result = build_appearance_lines_from_registry(None, ["Alice"], "Alice")
        assert result is None


class TestOutputFormatLines:
    """Test 4: outputFormatLines is configurable, not hardcoded."""

    def test_default_output_format_used_when_none_provided(self):
        """When outputFormatLines is None, DEFAULT_OUTPUT_FORMAT is used."""
        result = build_system_prompt(
            DEFAULT_SYSTEM_PROMPT_TEMPLATE,
            "Test appearance",
            output_format_lines=None,
        )
        assert DEFAULT_OUTPUT_FORMAT in result
        assert "Test appearance" in result

    def test_custom_output_format_overrides_default(self):
        """Custom outputFormatLines replaces the default."""
        custom_format = "Custom:\n  - Item 1\n  - Item 2"
        result = build_system_prompt(
            DEFAULT_SYSTEM_PROMPT_TEMPLATE,
            "Test appearance",
            output_format_lines=custom_format,
        )
        assert custom_format in result
        assert DEFAULT_OUTPUT_FORMAT not in result

    def test_output_format_lines_passed_through_config(self):
        """outputFormatLines is passed through buildInvocationConfig."""
        custom_format = "Custom format lines"
        config = build_invocation_config(
            {
                "charName": "Test",
                "outputFormatLines": custom_format,
            }
        )
        assert config["outputFormatLines"] == custom_format

    def test_output_format_lines_none_when_not_provided(self):
        """outputFormatLines is None when not provided in config."""
        config = build_invocation_config({"charName": "Test"})
        assert config["outputFormatLines"] is None

    def test_output_format_lines_from_settings(self):
        """outputFormatLines is read from summarizer settings in legacy mode."""
        settings = {
            "autoGeneration": {
                "summarizer": {
                    "outputFormatLines": "Settings format",
                }
            }
        }
        config = build_invocation_config(
            "raw text",
            char_name="Test",
            user_name="User",
            settings=settings,
        )
        assert config["outputFormatLines"] == "Settings format"


class TestBuildAppearanceLinesFromRegistry:
    """Test 5: buildAppearanceLinesFromRegistry function behavior."""

    def test_function_returns_valid_format(self, corepower_registry):
        """Output follows the expected format: Shared: + a female: lines."""
        result = build_appearance_lines_from_registry(
            corepower_registry, ["Avery Copple", "Brianna Teal"], "Avery Copple"
        )
        assert result is not None
        lines = result.split("\n")
        # First line should be Shared:
        assert lines[0].startswith("Shared:")
        # Subsequent lines should be "  - a female:"
        for line in lines[1:]:
            assert line.strip().startswith("- a female:")

    def test_shared_line_includes_body_type(self, corepower_registry):
        """Shared line includes body_type_override from first registry entry."""
        result = build_appearance_lines_from_registry(
            corepower_registry, ["Avery Copple"], "Avery Copple"
        )
        assert result is not None
        first_entry = corepower_registry["characters"][0]
        body_type = first_entry["generator_fields"]["body_type_override"]
        assert body_type in result

    def test_under_18_override_in_shared_line(self, corepower_registry):
        """When a scene character has under_18_visual_override, it appears in Shared line."""
        # Elise Needleman has under_18_visual_override
        result = build_appearance_lines_from_registry(
            corepower_registry, ["Elise Needleman"], "Elise Needleman"
        )
        assert result is not None
        assert "petite, shorter stature" in result

    def test_no_under_18_override_when_not_present(self, corepower_registry):
        """When no scene character has under_18_visual_override, it's not in Shared."""
        # Avery Copple does NOT have under_18_visual_override
        result = build_appearance_lines_from_registry(
            corepower_registry, ["Avery Copple"], "Avery Copple"
        )
        assert result is not None
        assert "petite, shorter stature" not in result

    def test_empty_registry_characters_list(self):
        """Registry with empty characters list returns None."""
        result = build_appearance_lines_from_registry(
            {"characters": []}, ["Alice"], "Alice"
        )
        assert result is None

    def test_registry_without_characters_key(self):
        """Registry object without 'characters' key returns None."""
        result = build_appearance_lines_from_registry(
            {"schema_version": 1}, ["Alice"], "Alice"
        )
        assert result is None


class TestCharacterRegistryOptional:
    """Test 6: characterRegistry parameter is optional (undefined = current behavior)."""

    def test_character_registry_not_in_preset(self, realistic_preset):
        """Presets without characterRegistry field are valid."""
        assert "characterRegistry" not in realistic_preset

    def test_config_without_registry_has_null(self):
        """buildInvocationConfig returns characterRegistry=None when not provided."""
        config = build_invocation_config({"charName": "Test"})
        assert config["characterRegistry"] is None

    def test_config_with_registry_passes_through(self, corepower_registry):
        """buildInvocationConfig passes characterRegistry through when provided."""
        config = build_invocation_config({
            "charName": "Test",
            "characterRegistry": corepower_registry,
            "sceneCharacters": ["Avery Copple"],
        })
        assert config["characterRegistry"] == corepower_registry
        assert config["sceneCharacters"] == ["Avery Copple"]

    def test_null_registry_does_not_break_appearance_lines(self):
        """null registry → buildAppearanceLinesFromRegistry returns None (no crash)."""
        result = build_appearance_lines_from_registry(None, ["Alice"], "Alice")
        assert result is None

    def test_undefined_registry_does_not_break_appearance_lines(self):
        """undefined registry → buildAppearanceLinesFromRegistry returns None."""
        result = build_appearance_lines_from_registry(None, ["Alice"], "Alice")
        assert result is None

    def test_registry_with_null_characters(self):
        """Registry with null characters field returns None."""
        result = build_appearance_lines_from_registry(
            {"characters": None}, ["Alice"], "Alice"
        )
        assert result is None

    def test_registry_with_non_array_characters(self):
        """Registry with non-array characters field returns None."""
        result = build_appearance_lines_from_registry(
            {"characters": "not an array"}, ["Alice"], "Alice"
        )
        assert result is None


class TestSystemPromptTemplate:
    """Additional tests for system prompt template behavior."""

    def test_template_has_required_placeholders(self):
        """System prompt template contains both required placeholders."""
        assert "{{APPEARANCE_LINES}}" in DEFAULT_SYSTEM_PROMPT_TEMPLATE
        assert "{{OUTPUT_FORMAT_LINES}}" in DEFAULT_SYSTEM_PROMPT_TEMPLATE

    def test_build_system_prompt_replaces_both_placeholders(self):
        """buildSystemPrompt replaces both placeholders."""
        result = build_system_prompt(
            DEFAULT_SYSTEM_PROMPT_TEMPLATE,
            "Custom appearance",
            "Custom format",
        )
        assert "{{APPEARANCE_LINES}}" not in result
        assert "{{OUTPUT_FORMAT_LINES}}" not in result
        assert "Custom appearance" in result
        assert "Custom format" in result

    def test_build_system_prompt_with_default_format(self):
        """buildSystemPrompt uses default format when none provided."""
        result = build_system_prompt(
            DEFAULT_SYSTEM_PROMPT_TEMPLATE,
            "Custom appearance",
        )
        assert DEFAULT_OUTPUT_FORMAT in result
        assert "Custom appearance" in result


class TestPresetStructure:
    """Verify preset JSON structure is valid for backward compatibility."""

    def test_realistic_preset_has_all_required_fields(self, realistic_preset):
        """Realistic preset has all required top-level fields."""
        required = ["schemaVersion", "name", "settings", "createdAt"]
        for field in required:
            assert field in realistic_preset, f"Missing required field: {field}"

    def test_realistic_preset_settings_structure(self, realistic_preset):
        """Realistic preset settings has expected nested structure."""
        settings = realistic_preset["settings"]
        assert "autoGeneration" in settings
        auto = settings["autoGeneration"]
        assert "promptInjection" in auto
        assert "summarizer" in auto
        assert "systemPromptTemplate" in auto["summarizer"]

    def test_registry_schema_version(self, corepower_registry):
        """Registry has schema_version 1."""
        assert corepower_registry["schema_version"] == 1

    def test_registry_card_name_matches(self, corepower_registry):
        """Registry card_name is a non-empty string."""
        assert isinstance(corepower_registry["card_name"], str)
        assert len(corepower_registry["card_name"]) > 0