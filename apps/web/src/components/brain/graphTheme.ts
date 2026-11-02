/**
 * The look of the vault brain.
 *
 * The graph is structure only — folders and files — so the palette carries the
 * meaning: one hue per top-level folder so clusters read at a glance, folders
 * dimmer than the files they hold, and a separate colour for the files that
 * share a name across folders.
 *
 * @module brain/graphTheme
 */

import type { VaultGraphNode } from "@t3tools/contracts";

export const BRAIN_BACKGROUND = "#05070d";

/** Hues chosen to stay distinguishable on a near-black background. */
const FOLDER_HUES = [188, 210, 268, 322, 12, 42, 96, 148, 172, 240];

function hashText(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
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
  const hue = FOLDER_HUES[hashText(cluster) % FOLDER_HUES.length] ?? 210;
  clusterHueCache.set(cluster, hue);
  return hue;
}

/**
 * A folder wears the hue of the cluster it belongs to, dimmer than its files;
 * a file wears the hue of its own folder. Both are drawn from the path alone,
 * so a vault this code has never seen still gets a coherent palette.
 */
export function nodeColorCss(node: VaultGraphNode, seen: boolean): string {
  const cluster = folderClusterKey(node.kind === "folder" ? node.id : node.folder);
  const hue = clusterHue(cluster);
  if (node.kind === "folder") return `hsl(${hue} ${seen ? 42 : 14}% ${seen ? 50 : 20}%)`;
  return `hsl(${hue} ${seen ? 80 : 16}% ${seen ? 64 : 22}%)`;
}

/** Folders read as structure, files as content, and degree decides how big. */
export function nodeRadius(node: VaultGraphNode): number {
  const base = node.kind === "folder" ? 3.4 : 1.7;
  return base + Math.min(6, Math.sqrt(Math.max(0, node.degree)) * 0.9);
}

/**
 * Folders are always labelled: they are the map. Files get a label only when
 * something joins them (`sameName`), and only while the graph is small enough
 * for text to be readable — a thousand sprites turn the brain into fog.
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
