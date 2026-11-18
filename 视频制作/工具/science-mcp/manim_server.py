"""Frameboard adapter for abhiemj/manim-mcp-server (MIT; original in upstream/).

Keeps the original execute_manim_code interface, with isolated UTF-8 jobs,
explicit scene selection, a timeout, and no player launch or cleanup tool.
This executes trusted Python animation code; it is not a Python sandbox.
"""
import ast
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid
from mcp.server.fastmcp import FastMCP

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "outputs" / "manim"
mcp = FastMCP("Frameboard Manim", instructions="Render mathematical and physical animations. Use execute_manim_code with one Scene, UTF-8 code and explicit scene_name. Output files are returned for import into Frameboard. Validate scientific claims separately. Code runs locally; only execute code authored for the user's animation task.")

mcp._mcp_server.instructions += '\n' + (ROOT.parents[1] / '镜头与文字约束.md').read_text(encoding='utf8')

@mcp.tool()
def execute_manim_code(manim_code: str, scene_name: str = "", quality: str = "low") -> dict:
    """Render a Manim Scene; return absolute MP4 paths, source path and job ID."""
    qualities = {"low": "l", "medium": "m", "high": "h"}
    if quality not in qualities or len(manim_code) > 200_000:
        raise ValueError("Invalid quality or script too large")
    tree = ast.parse(manim_code)
    classes = [n.name for n in tree.body if isinstance(n, ast.ClassDef)]
    if not scene_name and len(classes) == 1:
        scene_name = classes[0]
    if not scene_name.isidentifier() or scene_name not in classes:
        raise ValueError("Provide a scene_name matching a Scene class in the script")
    job_id = str(uuid.uuid4())
    folder = OUTPUT / job_id
    folder.mkdir(parents=True)
    script = folder / "scene.py"
    script.write_text(manim_code, encoding="utf-8")
    env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
    tex = ROOT / "tex-runtime.json"
    if tex.exists():
        tex_bin = Path(json.loads(tex.read_text(encoding="utf-8"))["bin"])
        alias = Path("C:/Users/Public/CodexScienceMCP")
        if os.name == "nt" and alias.exists() and alias.resolve() == ROOT:
            tex_bin = alias / tex_bin.relative_to(ROOT)
            tex_cache = alias / folder.relative_to(ROOT) / "tex-cache"
            (folder / "manim.cfg").write_text("[CLI]\ntex_dir = " + tex_cache.as_posix() + "\n", encoding="utf-8")
        env["PATH"] = str(tex_bin) + os.pathsep + env.get("PATH", "")
    startup = None
    if os.name == "nt":
        startup = subprocess.STARTUPINFO()
        startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startup.wShowWindow = 0
    with (folder / "render.log").open("w", encoding="utf-8") as log:
        result = subprocess.run(
            [sys.executable, "-m", "manim", "render", "--silent", "-q" + qualities[quality],
             "--disable_caching", "--media_dir", str(folder / "media"), str(script), scene_name],
            cwd=folder, env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
            timeout=600, startupinfo=startup,
        )
    if result.returncode:
        raise RuntimeError("Manim render failed: " + (folder / "render.log").read_text(encoding="utf-8", errors="replace")[-3500:])
    videos = [str(p.resolve()) for p in folder.rglob("*.mp4") if "partial_movie_files" not in p.parts]
    if not videos:
        raise RuntimeError("Render finished but no final MP4 was produced")
    answer = {"job_id": job_id, "videos": videos, "source": str(script), "engine": "manim"}
    (folder / "result.json").write_text(json.dumps(answer, ensure_ascii=False, indent=2), encoding="utf-8")
    return answer

if __name__ == "__main__":
    mcp.run(transport="stdio")
