/**
 * The look of the vault brain.
 *
 * Colour means **which part of the vault a node belongs to**: every top-level
 * folder gets its own hue, so a vault of markdown (almost every vault) still
 * reads as a dozen colours instead of one. The file type modulates brightness
 * and saturation inside that hue, so a PDF and a note from the same folder are
 * still distinguishable.
 *
 * Colours are emitted as hex, not `hsl()`: three.js parses hex everywhere, and a
 * colour it cannot parse silently falls back to white.
 *
 * @module brain/graphTheme
 */

import type { VaultGraphNode } from "@t3tools/contracts";

/** Pure black: the nodes are the light, not the backdrop. */
export const BRAIN_BACKGROUND = "#000000";

/** Hues far enough apart that neighbouring clusters never look alike. */
const CLUSTER_HUES = [205, 330, 152, 272, 22, 190, 48, 300, 96, 250, 350, 170];

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** The top-level folder is the cluster; deeper paths only refine the label. */
export function folderClusterKey(folder: string): string {
  const [first] = folder.split("/");
  return first !== undefined && first.length > 0 ? first : "(raíz)";
}

const clusterHueCache = new Map<string, number>();

export function clusterHue(cluster: string): number {
  const cached = clusterHueCache.get(cluster);
  if (cached !== undefined) return cached;
  const hue = CLUSTER_HUES[hashText(cluster) % CLUSTER_HUES.length] ?? 205;
  clusterHueCache.set(cluster, hue);
  return hue;
}

/** hsl → `#rrggbb`. Everything that reaches three goes through here. */
function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor((((hue % 360) + 360) % 360) / 60);
  const [r, g, b] =
    sector === 0
      ? [c, x, 0]
      : sector === 1
        ? [x, c, 0]
        : sector === 2
          ? [0, c, x]
          : sector === 3
            ? [0, x, c]
            : sector === 4
              ? [x, 0, c]
              : [c, 0, x];
  const hex = (value: number) =>
    Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * How a file type refracts its folder's hue: notes keep it clean, images burn
 * brighter, documents go deeper. Unknown extensions stay in between.
 */
function extensionTone(extension: string | undefined): { saturation: number; lightness: number } {
  switch ((extension ?? "").toLowerCase()) {
    case "md":
    case "txt":
      return { saturation: 92, lightness: 64 };
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "svg":
    case "avif":
    case "heic":
      return { saturation: 100, lightness: 74 };
    case "pdf":
      return { saturation: 80, lightness: 54 };
    case "doc":
    case "docx":
    case "xls":
    case "xlsx":
    case "csv":
    case "pptx":
    case "ppt":
      return { saturation: 72, lightness: 58 };
    case "canvas":
    case "excalidraw":
      return { saturation: 96, lightness: 72 };
    default:
      return { saturation: 70, lightness: 60 };
  }
}

/** A file wears its folder's hue, tinted by its type. */
export function fileColor(folder: string, extension: string | undefined, seen = true): string {
  if (!seen) return hslToHex(clusterHue(folderClusterKey(folder)), 18, 22);
  const tone = extensionTone(extension);
  return hslToHex(clusterHue(folderClusterKey(folder)), tone.saturation, tone.lightness);
}

/** Structure stays quiet: one cool hue, dimmed by depth. */
export function folderColor(depth: number, seen: boolean): string {
  if (!seen) return hslToHex(215, 16, 20);
  return hslToHex(214, 24, Math.max(36, 54 - depth * 3));
}

/** The only entry point the scene and the legend share. */
export function nodeColorCss(node: VaultGraphNode, seen: boolean): string {
  if (node.kind === "folder") return folderColor(node.depth, seen);
  return fileColor(node.folder, node.extension, seen);
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
  gradient.addColorStop(0.35, "rgba(255,255,255,0.45)");
  gradient.addColorStop(0.7, "rgba(255,255,255,0.06)");
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
