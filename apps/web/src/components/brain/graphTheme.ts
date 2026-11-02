/**
 * The look of the vault brain.
 *
 * Colour means **what a node is**, not where it lives: every file category has
 * its own vivid hue (notes, images, PDFs, office files, canvases, everything
 * else) and folders walk a hue ramp by depth, so structure and content never
 * look the same. Folders are also drawn bigger and ringed, which is what makes
 * them read as hubs at a glance.
 *
 * @module brain/graphTheme
 */

import type { VaultGraphNode } from "@t3tools/contracts";

export const BRAIN_BACKGROUND = "#05070d";

export type FileCategory = "note" | "image" | "pdf" | "office" | "canvas" | "other";

interface CategoryStyle {
  readonly label: string;
  /** Saturated on purpose: this is meant to glow, not to be subtle. */
  readonly color: string;
  /** Dimmed variant, for a node the current filter turned off. */
  readonly dimColor: string;
}

/**
 * One hue per category, far apart on the wheel so a glance is enough.
 * `note` is the most common kind, so it gets the brightest blue.
 */
export const FILE_CATEGORY_STYLES: Record<FileCategory, CategoryStyle> = {
  note: { label: "notas", color: "hsl(205 100% 64%)", dimColor: "hsl(205 60% 26%)" },
  image: { label: "imágenes", color: "hsl(330 100% 68%)", dimColor: "hsl(330 55% 28%)" },
  pdf: { label: "pdf", color: "hsl(22 100% 60%)", dimColor: "hsl(22 65% 26%)" },
  office: { label: "office", color: "hsl(145 85% 56%)", dimColor: "hsl(145 55% 24%)" },
  canvas: { label: "canvas", color: "hsl(272 95% 72%)", dimColor: "hsl(272 55% 30%)" },
  other: { label: "otros", color: "hsl(210 22% 66%)", dimColor: "hsl(210 18% 26%)" },
};

const CATEGORY_BY_EXTENSION: Record<string, FileCategory> = {
  md: "note",
  markdown: "note",
  mdx: "note",
  txt: "note",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  avif: "image",
  bmp: "image",
  svg: "image",
  heic: "image",
  pdf: "pdf",
  doc: "office",
  docx: "office",
  xls: "office",
  xlsx: "office",
  ppt: "office",
  pptx: "office",
  csv: "office",
  canvas: "canvas",
  excalidraw: "canvas",
};

/** Which family a file belongs to. Unknown extensions are `other`, never a guess. */
export function fileCategory(extension: string | undefined): FileCategory {
  if (extension === undefined) return "other";
  return CATEGORY_BY_EXTENSION[extension.toLowerCase()] ?? "other";
}

export function categoryColor(category: FileCategory, seen = true): string {
  const style = FILE_CATEGORY_STYLES[category];
  return seen ? style.color : style.dimColor;
}

/**
 * Folders walk a hue ramp by depth: the top level is warm and bright, each
 * level turns, so the hierarchy is readable without reading a single name.
 */
export function folderColor(depth: number, seen: boolean): string {
  if (!seen) return "hsl(210 25% 24%)";
  const hue = (48 + (depth - 1) * 66) % 360;
  const lightness = Math.max(46, 70 - depth * 4);
  return `hsl(${hue} 100% ${lightness}%)`;
}

/** The only entry point the scene and the legend share. */
export function nodeColorCss(node: VaultGraphNode, seen: boolean): string {
  if (node.kind === "folder") return folderColor(node.depth, seen);
  return categoryColor(fileCategory(node.extension), seen);
}

/**
 * Folders are the map, so they are much bigger; files stay small even when
 * something links them, or the hubs would drown.
 */
export function nodeRadius(node: VaultGraphNode): number {
  if (node.kind === "folder") {
    return 7 + Math.min(7, Math.sqrt(Math.max(0, node.degree)) * 1.1);
  }
  return 1.9 + Math.min(3.2, Math.sqrt(Math.max(0, node.degree)) * 0.8);
}

/**
 * Folders are always labelled — they are the map. Files only in a detailed
 * graph, and only when a relation joins them, or the text turns into fog.
 */
export function wantsLabel(node: VaultGraphNode, detailed: boolean): boolean {
  if (node.kind === "folder") return true;
  return detailed && node.degree >= 2;
}

/**
 * A soft round sprite drawn once into a canvas: the halo behind every node.
 * Additive and unfocused, which is far cheaper than a real light.
 */
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
  gradient.addColorStop(0.28, "rgba(255,255,255,0.7)");
  gradient.addColorStop(0.62, "rgba(255,255,255,0.12)");
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
  context.fillStyle = "rgba(5,7,13,0.65)";
  context.fillRect(0, 0, width, height);
  context.fillStyle = color;
  context.fillText(text, width / 2, height / 2);
  return canvas;
}
