import type { DesktopAgentBarEntry, ProjectIconColor } from "@upcode/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { deriveProjectIdentity } from "../../projectIdentity";
import { projectFaviconUrlAtom } from "../../state/assets";
import type { ProjectFaviconProject } from "../ProjectFavicon";

const darkIconColors: Record<ProjectIconColor, string> = {
  gray: "#99a1af",
  red: "#ff6467",
  orange: "#ff8904",
  amber: "#ffb900",
  yellow: "#fdc700",
  lime: "#9ae600",
  green: "#05df72",
  emerald: "#00d492",
  teal: "#00d5be",
  cyan: "#00d3f3",
  sky: "#00bcff",
  blue: "#51a2ff",
  indigo: "#818cf8",
  violet: "#a684ff",
  purple: "#c27aff",
  fuchsia: "#ed6aff",
  pink: "#fb64b6",
  rose: "#ff637e",
};

const lucideImageAtom = Atom.family((key: string) =>
  Atom.make(() =>
    Effect.promise(async () => {
      const [name, color] = key.split(":");
      const { dynamicIconImports } = await import("lucide-react/dynamic");
      if (!name || !Object.hasOwn(dynamicIconImports, name)) return null;
      const { __iconNode } = await dynamicIconImports[name as keyof typeof dynamicIconImports]();
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' +
        color +
        '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
      const nodes = __iconNode.map(([tag, attrs]) => {
        const props = Object.entries(attrs)
          .filter(([attribute]) => attribute !== "key")
          .map(([attribute, value]) => attribute + '="' + value + '"')
          .join(" ");
        return "<" + tag + " " + props + "/>";
      });
      return "data:image/svg+xml;base64," + btoa(svg + nodes.join("") + "</svg>");
    }),
  ),
);

export function agentBarProjectIcon(
  get: Atom.AtomContext,
  project: ProjectFaviconProject,
): NonNullable<DesktopAgentBarEntry["project"]> {
  const title = project.title.slice(0, 300);
  const identity = deriveProjectIdentity(project.title);
  const override = project.projectIcon;
  if (override?.kind === "emoji") return { title, text: override.emoji, color: null, image: null };
  if (override?.kind === "monogram") {
    return { title, text: override.text, color: darkIconColors[override.color], image: null };
  }
  const color = darkIconColors[override?.kind === "lucide" ? override.color : identity.color];
  const image =
    override?.kind === "lucide"
      ? Option.getOrNull(AsyncResult.value(get(lucideImageAtom(override.name + ":" + color))))
      : get(
          projectFaviconUrlAtom({
            environmentId: project.environmentId,
            cwd: project.workspaceRoot,
            faviconPath: project.faviconPath,
          }),
        );
  return { title, text: identity.monogram, color, image };
}
