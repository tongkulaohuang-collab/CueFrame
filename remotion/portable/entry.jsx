import React from "react";
import { Composition, registerRoot, staticFile } from "remotion";
import { Film } from "./video/Film";
import { filmProps } from "./shared/film.mjs";
import project from "./project.json";
function Standalone() {
  // Keep asset identities as validated media/... paths. Resolve the bundled
  // public directory through the existing scene/audio base at render time.
  const p = project;
  const props = filmProps(p, project.exportVariant, staticFile(''));
  return (
    <Composition
      id="FullFilm"
      component={Film}
      defaultProps={props}
      width={p.width}
      height={p.height}
      fps={p.fps}
      durationInFrames={props.canvas.frames}
    />
  );
}
registerRoot(Standalone);
