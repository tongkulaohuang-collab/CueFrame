import asyncio
import json
from bridge import call, ROOT

async def main():
    result = await call("manim", "execute_manim_code", {
        "manim_code": 'from manim import *\nclass FormulaCheck(Scene):\n    def construct(self):\n        formula = MathTex(r"\\frac{d^2x}{dt^2}+\\omega^2 x=0")\n        self.play(Write(formula),run_time=1)\n        self.wait(1)\n',
        "scene_name": "FormulaCheck", "quality": "low",
    })
    (ROOT / "formula-verification.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Formula rendering via MCP passed")

asyncio.run(main())
