"""Load the bundled upstream addon in this Blender session only."""
import importlib.util
import os
from pathlib import Path
import sys
import bpy

ROOT = Path(__file__).resolve().parent
os.environ["DISABLE_TELEMETRY"] = "true"
spec = importlib.util.spec_from_file_location("blender_mcp", ROOT / "runtime/blender-profile/scripts/addons/blender_mcp.py")
addon = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = addon
spec.loader.exec_module(addon)
addon.register()
bpy.context.scene.blendermcp_auto_start_server = False
# The addon uses Blender's GUI event loop. Do not start with --background.
server = addon.BlenderMCPServer(host="127.0.0.1", port=9876)
bpy.types.blendermcp_server = server
server.start()
