import { SUBAGENT_AVATAR_MAX_LENGTH } from "@upcode/contracts";

/** The avatar is stored in the settings JSON, so it stays small on purpose. */
export const SUBAGENT_AVATAR_PIXELS = 128;

/**
 * Reads a picked image into a square, downscaled data URL.
 *
 * The file never leaves the client: the crop and the resize happen in a canvas
 * so the settings file only ever carries 128×128 — a role is a name and a few
 * rules, not an asset library. Throws when the result would still be too big
 * (an animated or unusually detailed image), so the editor can say so instead of
 * saving something the server would reject.
 */
export async function readSubagentAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("El avatar tiene que ser una imagen.");
  }

  const source = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = SUBAGENT_AVATAR_PIXELS;
  canvas.height = SUBAGENT_AVATAR_PIXELS;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("No se pudo preparar la imagen.");

  // Cover, not contain: a square avatar with the subject centred.
  const scale = Math.max(
    SUBAGENT_AVATAR_PIXELS / source.width,
    SUBAGENT_AVATAR_PIXELS / source.height,
  );
  const width = source.width * scale;
  const height = source.height * scale;
  context.drawImage(
    source,
    (SUBAGENT_AVATAR_PIXELS - width) / 2,
    (SUBAGENT_AVATAR_PIXELS - height) / 2,
    width,
    height,
  );

  for (const type of ["image/webp", "image/png"] as const) {
    const dataUrl = canvas.toDataURL(type, 0.85);
    if (dataUrl.startsWith(`data:${type}`) && dataUrl.length <= SUBAGENT_AVATAR_MAX_LENGTH) {
      return dataUrl;
    }
  }
  throw new Error("La imagen es demasiado grande incluso después de reducirla.");
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.addEventListener("load", () => {
      URL.revokeObjectURL(url);
      resolve(image);
    });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    });
    image.src = url;
  });
}
