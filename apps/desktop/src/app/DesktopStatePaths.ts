import * as Option from "effect/Option";

export type JoinPath = (first: string, ...segments: string[]) => string;

function normalizeConfiguredBaseDir(upcodeHome: Option.Option<string>): Option.Option<string> {
  if (Option.isNone(upcodeHome)) {
    return Option.none();
  }
  const trimmed = upcodeHome.value.trim();
  return trimmed.length > 0 ? Option.some(trimmed) : Option.none();
}

export function resolveDesktopBaseDir(input: {
  readonly homeDirectory: string;
  readonly joinPath: JoinPath;
  readonly upcodeHome: Option.Option<string>;
}): string {
  return Option.getOrElse(normalizeConfiguredBaseDir(input.upcodeHome), () =>
    input.joinPath(input.homeDirectory, ".upcode"),
  );
}

export function resolveDesktopStateDir(input: {
  readonly baseDir: string;
  readonly isDevelopment: boolean;
  readonly joinPath: JoinPath;
  readonly upcodeHome: Option.Option<string>;
}): string {
  const useDevSubdir =
    input.isDevelopment && Option.isNone(normalizeConfiguredBaseDir(input.upcodeHome));
  return input.joinPath(input.baseDir, useDevSubdir ? "dev" : "userdata");
}
