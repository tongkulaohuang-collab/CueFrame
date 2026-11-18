"""Register only this workspace's two servers, preserving all other settings."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import tomllib

ROOT = Path(__file__).resolve().parent
PYTHON = ROOT / ".venv/Scripts/python.exe"
CONFIG = Path.home() / ".codex/config.toml"
BEGIN = "# BEGIN FRAMEBOARD SCIENCE MCP"
END = "# END FRAMEBOARD SCIENCE MCP"

def main():
    probe = subprocess.run([str(PYTHON), str(ROOT / "bridge.py")], input='{"action":"environment"}',
        capture_output=True, text=True, encoding="utf-8", env={**os.environ,"PYTHONUTF8":"1"}, timeout=15)
    result = json.loads(probe.stdout)["result"]
    modules = result["modules"]
    old = CONFIG.read_text(encoding="utf-8")
    if BEGIN in old:
        before, managed = old.split(BEGIN, 1)
        _, after = managed.split(END, 1)
        old = before.rstrip() + "\n" + after.lstrip("\r\n")
    parsed = tomllib.loads(old)
    for name in ("manim", "blender"):
        if name in parsed.get("mcp_servers", {}):
            raise RuntimeError(f"An unmanaged {name} entry exists; review it before replacing")
    q = lambda value: json.dumps(value, ensure_ascii=False)
    blocks = [BEGIN]
    for name, args, ready in (
        ("manim", [str(ROOT / "manim_server.py")], modules["manim"] and modules["mcp"]),
        ("blender", [str(ROOT / "blender_server.py")], modules["blender_mcp"] and modules["mcp"]),
    ):
        blocks.extend([f"[mcp_servers.{name}]", f"command = {q(str(PYTHON))}", f"args = {q(args)}",
            f"cwd = {q(str(ROOT))}", "startup_timeout_sec = 45", "tool_timeout_sec = 660",
            f"enabled = {str(ready).lower()}"])
        if name == "blender":
            blocks.append('enabled_tools = ["get_addon_status", "get_scene_info", "execute_blender_code", "get_viewport_screenshot", "look"]')
        blocks.extend([f"[mcp_servers.{name}.env]", 'PYTHONUTF8 = "1"', 'PYTHONIOENCODING = "utf-8"'])
        if name == "blender":
            blocks.extend(['DISABLE_TELEMETRY = "true"', 'BLENDER_HOST = "127.0.0.1"', 'BLENDER_PORT = "9876"', 'BLENDER_MCP_SAFE_MODE = "1"'])
            blocks.append(f'BLENDERMCP_ADDONS_DIR = {q(str(ROOT / "runtime/blender-profile/scripts/addons"))}')
    blocks.append(END)
    new = old.rstrip() + "\n\n" + "\n".join(blocks) + "\n"
    tomllib.loads(new)
    backup = CONFIG.with_name(f"config.toml.before-science-mcp-{time.strftime('%Y%m%d-%H%M%S')}.bak")
    shutil.copy2(CONFIG, backup)
    temp = CONFIG.with_suffix(".science-mcp.tmp")
    temp.write_text(new, encoding="utf-8")
    temp.replace(CONFIG)
    (ROOT / "registration.json").write_text(json.dumps({"configured": True, "modules": modules,
        "config": str(CONFIG), "backup": str(backup), "updated": time.strftime('%Y-%m-%d %H:%M:%S')},
        ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"registered": ["manim", "blender"], "modules": modules, "backup": str(backup)}, ensure_ascii=False))

if __name__ == "__main__":
    main()
