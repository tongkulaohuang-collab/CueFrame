from manim import *
import numpy as np

class HarmonicMotion(Scene):
    def construct(self):
        self.camera.background_color = "#111115"
        phase = ValueTracker(0)
        center = LEFT * 3
        circle = Circle(radius=1.5, color=BLUE_C).move_to(center)
        axes = Axes(x_range=[0, 2 * PI, PI], y_range=[-1.5, 1.5, 0.5],
                    x_length=5.6, y_length=3, tips=False,
                    axis_config={"include_ticks": False}).move_to(RIGHT * 2)
        dot = always_redraw(lambda: Dot(center + 1.5 * np.array([np.cos(phase.get_value()), np.sin(phase.get_value()), 0]), color=YELLOW))
        projection = always_redraw(lambda: Dot(axes.c2p(phase.get_value(), 1.5 * np.sin(phase.get_value())), color=YELLOW))
        radius = always_redraw(lambda: Line(center, dot.get_center(), color=BLUE_C))
        guide = always_redraw(lambda: DashedLine(dot.get_center(), projection.get_center(), color=GREY_B))
        trace = TracedPath(projection.get_center, stroke_color=YELLOW, stroke_width=4)
        label = Text("圆周运动与简谐运动", font="Microsoft YaHei", font_size=28).to_edge(UP)
        self.add(circle, axes, label, radius, guide, trace, dot, projection)
        self.play(phase.animate.set_value(2 * PI), run_time=6, rate_func=linear)
        self.wait(0.5)
