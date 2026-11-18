"""Small JSON bridge used by Frameboard; MCP calls go through the Python SDK."""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
os.environ.update(PYTHONUTF8="1", PYTHONIOENCODING="utf-8", DISABLE_TELEMETRY="true")

def environment():
    modules = {name: importlib.util.find_spec(name) is not None for name in ("manim", "mcp", "blender_mcp")}
    return {"modules": modules, "python": sys.executable}

async def call(engine, tool=None, arguments=None):
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    if engine not in ("manim", "blender"):
        raise ValueError("Unknown engine")
    args = [str(ROOT / ("manim_server.py" if engine == "manim" else "blender_server.py"))]
    env = {**os.environ, "BLENDER_HOST": "127.0.0.1", "BLENDER_PORT": "9876", "BLENDER_MCP_SAFE_MODE": "1"}
    env["BLENDERMCP_ADDONS_DIR"] = str(ROOT / "runtime/blender-profile/scripts/addons")
    params = StdioServerParameters(command=sys.executable, args=args, env=env, cwd=str(ROOT))
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            if tool is None:
                names = [t.name for t in (await session.list_tools()).tools]
                if engine == "blender":
                    scene = await session.call_tool("get_scene_info", {})
                    message = " ".join(c.text for c in scene.content if hasattr(c, "text"))
                    if scene.isError or any(word in message.lower() for word in ("error", "could not", "failed", "not connect")):
                        raise RuntimeError(message)
                    return {"connected": True, "tools": names, "message": "MCP 握手与 Blender 场景读取通过"}
                return {"connected": True, "tools": names}
            result = await session.call_tool(tool, arguments or {})
            if result.isError:
                raise RuntimeError(" ".join(c.text for c in result.content if hasattr(c, "text")))
            return result.model_dump(mode="json")

async def main():
    request = json.loads(sys.stdin.read())
    if request["action"] == "environment":
        return environment()
    if request["action"] == "check":
        return await asyncio.wait_for(call(request["engine"]), 30)
    if request["action"] == "demo":
        return await asyncio.wait_for(call("manim", "execute_manim_code", {
            "manim_code": (ROOT / "examples" / "harmonic.py").read_text(encoding="utf-8"),
            "scene_name": "HarmonicMotion", "quality": "low",
        }), 650)
    raise ValueError("Unknown action")

if __name__ == "__main__":
    try:
        print(json.dumps({"ok": True, "result": asyncio.run(main())}, ensure_ascii=False))
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error) or type(error).__name__}, ensure_ascii=False))
        sys.exit(1)
