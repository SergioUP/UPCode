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

/** A black backdrop preserves saturated halos through the additive bloom pass. */
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
  const hash = hashText(cluster);
  const hue =
    ((CLUSTER_HUES[hash % CLUSTER_HUES.length] ?? 205) + ((hash >>> 8) % 13) - 6 + 360) % 360;
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

/** Notes keep a folder family, with a stable individual tint rather than identical dots. */
export function fileColor(
  folder: string,
  extension: string | undefined,
  seen = true,
  identity = "",
): string {
  const variation = identity ? hashText(identity) : 0;
  const hue =
    (clusterHue(folderClusterKey(folder)) + (identity ? (variation % 85) - 42 : 0) + 360) % 360;
  if (!seen) return hslToHex(hue, 26, 19);
  const tone = extensionTone(extension);
  return hslToHex(
    hue,
    tone.saturation,
    tone.lightness + (identity ? ((variation >>> 8) % 9) - 4 : 0),
  );
}

/** Folder hubs share their notes' palette; their rings distinguish structure from content. */
export function folderColor(depth: number, seen: boolean, folder = ""): string {
  const hue = clusterHue(folderClusterKey(folder));
  if (!seen) return hslToHex(hue, 26, 20);
  return hslToHex(hue, 94, Math.max(58, 73 - depth * 2));
}

/** The only entry point the scene and the legend share. */
export function nodeColorCss(node: VaultGraphNode, seen: boolean): string {
  if (node.kind === "folder") return folderColor(node.depth, seen, node.id);
  return fileColor(node.folder, node.extension, seen, node.id);
}

/**
 * Slightly larger dots make notes readable; hubs still grow slowly with degree.
 */
export function nodeRadius(node: VaultGraphNode): number {
  if (node.kind === "folder") {
    return 2.65 + Math.min(2.2, Math.sqrt(Math.max(0, node.degree)) * 0.43);
  }
  return 1.5 + Math.min(1.4, Math.sqrt(Math.max(0, node.degree)) * 0.38);
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
  // A coloured outline preserves the cluster identity when labels cross bright links.
  context.beginPath();
  context.roundRect(1, 1, width - 2, height - 2, 10);
  context.fillStyle = "rgba(6,9,18,0.88)";
  context.fill();
  context.strokeStyle = color;
  context.lineWidth = 1.5;
  context.stroke();
  context.fillStyle = color;
  context.fillText(text, width / 2, height / 2);
  return canvas;
}
