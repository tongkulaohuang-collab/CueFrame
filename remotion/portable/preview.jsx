import React from "react";
import { createRoot } from "react-dom/client";
import { Player } from "@remotion/player";
import { Film } from "./video/Film";
import { filmProps } from "./shared/film.mjs";
import project from "./project.json";
const props = filmProps(project, project.exportVariant);
document.title = project.title;
createRoot(document.getElementById("root")).render(
  <Player
    component={Film}
    inputProps={props}
    compositionWidth={project.width}
    compositionHeight={project.height}
    fps={project.fps}
    durationInFrames={props.canvas.frames}
    controls
    style={{ width: "min(100%, 1200px)", margin: "auto" }}
  />,
);
