import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as VaultGraphScanner from "./VaultGraphScanner.ts";

const TestLayer = VaultGraphScanner.layer.pipe(Layer.provideMerge(NodeServices.layer));

/** Writes a vault into a temp directory that the test scope removes. */
const writeVault = (files: Record<string, string>) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-vault-graph-" });
    for (const [relativePath, content] of Object.entries(files)) {
      const filePath = path.join(root, relativePath);
      yield* fileSystem.makeDirectory(path.dirname(filePath), { recursive: true });
      yield* fileSystem.writeFileString(filePath, content);
    }
    return root;
  });

const scan = (vaultPath: string, maxEntries?: number) =>
  Effect.gen(function* () {
    const scanner = yield* VaultGraphScanner.VaultGraphScanner;
    return yield* scanner.scan({
      vaultPath,
      ...(maxEntries === undefined ? {} : { maxEntries }),
    });
  });

describe("VaultGraphScanner", () => {
  it.effect("describes folders and files, and nothing else", () =>
    Effect.gen(function* () {
      const root = yield* writeVault({
        "INDICE.md": "# portada",
        "PROYECTOS/ELSA/INDEX.md": "nota",
        "PROYECTOS/ELSA/diagrama.png": "png",
        "PROYECTOS/HUB/INDEX.md": "nota",
        // Hidden folders and non-file entries are not part of the picture.
        ".obsidian/workspace.json": "{}",
      });

      const snapshot = yield* scan(root);

      expect(snapshot.fileCount).toBe(4);
      expect(snapshot.folderCount).toBe(3);
      expect(snapshot.truncated).toBe(false);

      const ids = snapshot.nodes.map((node) => node.id).sort();
      expect(ids).toEqual([
        "INDICE.md",
        "PROYECTOS",
        "PROYECTOS/ELSA",
        "PROYECTOS/ELSA/INDEX.md",
        "PROYECTOS/ELSA/diagrama.png",
        "PROYECTOS/HUB",
        "PROYECTOS/HUB/INDEX.md",
      ]);

      const png = snapshot.nodes.find((node) => node.id.endsWith("diagrama.png"));
      expect(png?.kind).toBe("file");
      expect(png?.extension).toBe("png");
      expect(png?.folder).toBe("PROYECTOS/ELSA");
      expect(png?.depth).toBe(3);
      expect(png?.bytes).toBeGreaterThan(0);

      const elsa = snapshot.nodes.find((node) => node.id === "PROYECTOS/ELSA");
      expect(elsa?.kind).toBe("folder");
      expect(elsa?.extension).toBeUndefined();
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("hangs every entry from the folder that contains it", () =>
    Effect.gen(function* () {
      const root = yield* writeVault({
        "a.md": "x",
        "carpeta/b.md": "y",
        "carpeta/sub/c.md": "z",
      });

      const snapshot = yield* scan(root);
      const contains = new Set(
        snapshot.links
          .filter((link) => link.kind === "contains")
          .map((link) => `${link.source}→${link.target}`),
      );

      expect(contains).toEqual(
        new Set(["carpeta/b.md→carpeta", "carpeta/sub→carpeta", "carpeta/sub/c.md→carpeta/sub"]),
      );

      // A file at the root has no folder node to hang from, and that is fine.
      const rootFile = snapshot.nodes.find((node) => node.id === "a.md");
      expect(rootFile?.degree).toBe(0);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("joins files that share a name across folders, and ignores noisy names", () =>
    Effect.gen(function* () {
      const files: Record<string, string> = {};
      for (const project of ["uno", "dos", "tres"]) {
        files[`${project}/INDEX.md`] = "x";
      }
      // A name shared by too many files is a convention, not a relation.
      for (let index = 0; index < 45; index += 1) files[`bulk-${index}/nota.md`] = "y";

      const root = yield* writeVault(files);
      const snapshot = yield* scan(root);

      // Three INDEX.md, joined in a chain of two edges.
      expect(snapshot.sameNameLinkCount).toBe(2);
      expect(snapshot.ambiguousNameCount).toBe(1);
      const sameName = snapshot.links.filter((link) => link.kind === "sameName");
      expect(sameName).toHaveLength(2);
      expect(new Set(sameName.flatMap((link) => [link.source, link.target])).size).toBe(3);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("never reads a file it describes", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* writeVault({ "nota.md": "contenido secreto" });

      // Making the note unreadable does not cost the scan anything: it is only
      // stat'ed. A scanner that opened it would come back empty.
      yield* fileSystem.chmod(path.join(root, "nota.md"), 0o000);
      const snapshot = yield* scan(root);

      expect(snapshot.fileCount).toBe(1);
      expect(snapshot.nodes.map((node) => node.id)).toContain("nota.md");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("stops at maxEntries and says the graph is truncated", () =>
    Effect.gen(function* () {
      const root = yield* writeVault({
        "a.md": "x",
        "b.md": "y",
        "c.md": "z",
      });

      const snapshot = yield* scan(root, 2);

      expect(snapshot.truncated).toBe(true);
      expect(snapshot.fileCount).toBe(2);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("answers a probe with a fingerprint and no nodes", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* writeVault({ "a.md": "x", "carpeta/b.md": "y" });
      const scanner = yield* VaultGraphScanner.VaultGraphScanner;

      const first = yield* scanner.scan({ vaultPath: root, probe: true });
      const second = yield* scanner.scan({ vaultPath: root, probe: true });
      const full = yield* scanner.scan({ vaultPath: root });

      expect(first.nodes).toEqual([]);
      expect(first.fileCount).toBe(2);
      expect(first.folderCount).toBe(1);
      expect(second.fingerprint).toBe(first.fingerprint);
      expect(full.fingerprint).toBe(first.fingerprint);

      // A new file is a change, even though nothing was read.
      yield* fileSystem.writeFileString(path.join(root, "carpeta", "c.md"), "z");
      const after = yield* scanner.scan({ vaultPath: root, probe: true });

      expect(after.fingerprint).not.toBe(first.fingerprint);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("fails with a typed error for a missing vault", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const root = yield* writeVault({ "a.md": "solo" });
      const error = yield* scan(path.join(root, "no-existe")).pipe(Effect.flip);

      expect(error._tag).toBe("VaultGraphError");
      expect(error.failure).toBe("vault_not_found");
    }).pipe(Effect.provide(TestLayer)),
  );
});
