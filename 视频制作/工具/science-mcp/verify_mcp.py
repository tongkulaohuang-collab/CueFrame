"""Exercise actual MCP transports and render two short local proof clips."""
import asyncio
import json
from pathlib import Path
from bridge import call, ROOT

async def main():
    result = {"manim": await call("manim"), "blender": await call("blender")}
    result["manim_render"] = await call("manim", "execute_manim_code", {
        "manim_code": (ROOT / "examples/harmonic.py").read_text(encoding="utf-8"),
        "scene_name": "HarmonicMotion", "quality": "low",
    })
    target = ROOT / "outputs/blender/connection-test"
    target.mkdir(parents=True, exist_ok=True)
    movie, blend = (target / "orbit-test.mp4").as_posix(), (target / "orbit-test.blend").as_posix()
    code = '''import bpy
import math
from mathutils import Vector
scene = bpy.data.scenes.new("Frameboard MCP verification")
bpy.context.window.scene = scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.render.resolution_x = 640
scene.render.resolution_y = 360
scene.render.resolution_percentage = 100
scene.render.fps = 24
scene.frame_start = 1
scene.frame_end = 48
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "OBJECT"
scene.display.shading.background_type = "WORLD"
scene.world = bpy.data.worlds.new("Verification World")
scene.world.color = (0.025, 0.025, 0.04)
bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.65)
sun = bpy.context.object
sun.name = "Central body"
sun.color = (1.0, 0.55, 0.05, 1.0)
bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.24)
planet = bpy.context.object
planet.name = "Orbiting body"
planet.color = (0.12, 0.5, 1.0, 1.0)
for frame in range(1, 49):
    angle = 2 * math.pi * (frame - 1) / 48
    planet.location = (2.2 * math.cos(angle), 2.2 * math.sin(angle), 0)
    planet.keyframe_insert(data_path="location", frame=frame)
bpy.ops.mesh.primitive_torus_add(major_radius=2.2, minor_radius=0.012)
bpy.context.object.color = (0.4, 0.5, 0.65, 1.0)
bpy.ops.object.camera_add(location=(5, -7, 6))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, 0)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 7.8
scene.camera = camera
scene.render.image_settings.file_format = "FFMPEG"
scene.render.ffmpeg.format = "MPEG4"
scene.render.ffmpeg.codec = "H264"
scene.render.filepath = MOVIE_PATH
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
bpy.ops.render.render(animation=True)
print("FRAMEBOARD_BLENDER_RENDER_OK")
'''.replace("MOVIE_PATH", repr(movie)).replace("BLEND_PATH", repr(blend))
    (target / "scene.py").write_text(code, encoding="utf-8")
    result["blender_render"] = await call("blender", "execute_blender_code", {"code": code})
    text = json.dumps(result["blender_render"], ensure_ascii=False)
    if "FRAMEBOARD_BLENDER_RENDER_OK" not in text or not Path(movie).exists():
        raise RuntimeError("Blender render failed: " + text[-2000:])
    (ROOT / "verification.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print("MCP handshakes and both video renders passed")

if __name__ == "__main__":
    asyncio.run(main())
