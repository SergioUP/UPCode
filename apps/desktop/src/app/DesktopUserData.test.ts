import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { resolveUserDataPath } from "./DesktopUserData.ts";

it.effect("keeps UPCode's Windows profile separate from existing UPCode credentials", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "upcode-profile-" });
    const legacyProfile = path.join(directory, "legacy-v2");
    yield* fs.makeDirectory(legacyProfile, { recursive: true });
    yield* fs.writeFileString(path.join(legacyProfile, "Local State"), "private-legacy-key");

    const upcodeProfile = yield* resolveUserDataPath({
      appDataDirectory: directory,
      isDevelopment: false,
      platform: "win32",
    });
    assert.equal(upcodeProfile, path.join(directory, "upcode"));
    assert.isFalse(yield* fs.exists(upcodeProfile));
    assert.equal(yield* fs.readFileString(path.join(legacyProfile, "Local State")), "private-legacy-key");
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("uses a distinct development profile", () =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    assert.equal(
      yield* resolveUserDataPath({
        appDataDirectory: "C:/AppData",
        isDevelopment: true,
        platform: "win32",
      }),
      path.join("C:/AppData", "upcode-dev"),
    );
  }).pipe(Effect.provide(NodeServices.layer)),
);
