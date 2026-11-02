/**
 * The look of the vault brain.
 *
 * Colour says **what a file is**: every extension gets its own hue (and an
 * unknown one still gets one, derived from the name, so nothing is grey by
 * accident). Folders are structure, not content, so they stay small and muted —
 * the map, not the map's legend.
 *
 * @module brain/graphTheme
 */

import type { VaultGraphNode } from "@t3tools/contracts";

/** Pure black: the nodes are the light, not the backdrop. */
export const BRAIN_BACKGROUND = "#000000";

/**
 * Hues picked to be told apart from each other on black. Keys are lowercase
 * extensions without the dot; anything else falls back to a hash colour.
 */
const EXTENSION_COLORS: Record<string, string> = {
  md: "hsl(205 95% 62%)",
  pdf: "hsl(4 90% 62%)",
  png: "hsl(330 90% 66%)",
  jpg: "hsl(345 88% 64%)",
  jpeg: "hsl(350 88% 64%)",
  gif: "hsl(310 85% 66%)",
  webp: "hsl(320 85% 64%)",
  svg: "hsl(180 80% 58%)",
  canvas: "hsl(272 85% 70%)",
  json: "hsl(48 95% 60%)",
  yaml: "hsl(38 90% 58%)",
  yml: "hsl(42 90% 58%)",
  csv: "hsl(160 75% 56%)",
  xlsx: "hsl(140 80% 55%)",
  xls: "hsl(145 80% 55%)",
  docx: "hsl(220 85% 66%)",
  doc: "hsl(225 85% 66%)",
  pptx: "hsl(20 90% 60%)",
  ppt: "hsl(15 90% 60%)",
  txt: "hsl(210 30% 70%)",
  zip: "hsl(30 45% 58%)",
  exe: "hsl(0 20% 60%)",
};

/** Distinct hues for unknown extensions, spread around the wheel. */
function hashHue(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 360;
}

/**
 * A file's colour. Unknown extensions still get a stable hue of their own, so
 * a vault full of formats never collapses into one grey mass.
 */
export function fileExtensionColor(extension: string | undefined): string {
  const key = (extension ?? "").toLowerCase();
  const known = EXTENSION_COLORS[key];
  if (known !== undefined) return known;
  return `hsl(${hashHue(key || "sin-extension")} 78% 64%)`;
}

/** Structure stays quiet: one hue, low saturation, dimmed by depth. */
export function folderColor(depth: number, seen: boolean): string {
  if (!seen) return "hsl(215 18% 22%)";
  const lightness = Math.max(34, 52 - depth * 3);
  return `hsl(214 22% ${lightness}%)`;
}

/** The only entry point the scene and the legend share. */
export function nodeColorCss(node: VaultGraphNode, seen: boolean): string {
  if (node.kind === "folder") return folderColor(node.depth, seen);
  if (!seen) return "hsl(210 20% 24%)";
  return fileExtensionColor(node.extension);
}

/**
 * Files are the dots; folders are only a skeleton, so they grow slowly with
 * their contents instead of towering over them.
 */
export function nodeRadius(node: VaultGraphNode): number {
  if (node.kind === "folder") {
    return 2 + Math.min(1.8, Math.sqrt(Math.max(0, node.degree)) * 0.35);
  }
  return 1.15 + Math.min(1.1, Math.sqrt(Math.max(0, node.degree)) * 0.3);
}

/**
 * Folders are labelled because they are the map. Files only in a detailed
 * graph, and only when a relation joins them, or the text turns into fog.
 */
export function wantsLabel(node: VaultGraphNode, detailed: boolean): boolean {
  if (node.kind === "folder") return true;
  return detailed && node.degree >= 2;
}

/** A soft round sprite drawn once into a canvas: a low, wide glow behind a node. */
export function createGlowTexture(size = 64): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context === null) return null;
  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.55)");
  gradient.addColorStop(0.7, "rgba(255,255,255,0.08)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return canvas;
}

/**
 * A label drawn straight into a canvas texture: no font loading, no extra
 * dependency, and it stays crisp because the sprite scales with the camera.
 */
export function createLabelTexture(text: string, color: string): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const dpr = 2;
  const fontSize = 26;
  const padding = 10;
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d");
  if (measure === null) return null;
  const font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  measure.font = font;
  const width = Math.ceil(measure.measureText(text).width) + padding * 2;
  const height = fontSize + padding * 2;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const context = canvas.getContext("2d");
  if (context === null) return null;
  context.scale(dpr, dpr);
  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "middle";
  // A dark plate behind the text keeps it readable over the bright nodes.
  context.fillStyle = "rgba(0,0,0,0.7)";
  context.fillRect(0, 0, width, height);
  context.fillStyle = color;
  context.fillText(text, width / 2, height / 2);
  return canvas;
}
