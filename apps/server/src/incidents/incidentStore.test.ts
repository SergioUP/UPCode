import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerConfig from "../config.ts";
import * as IncidentStore from "./incidentStore.ts";

it.effect("persists incidents, evidence and summary on the state dir", () =>
  Effect.gen(function* () {
    const store = yield* IncidentStore.make;
    const created = yield* store.create({
      title: "Odoo sync",
      description: "Order #1001 is missing in the ERP",
    });
    assert.strictEqual(created.status, "open");
    assert.strictEqual(created.evidence.length, 0);

    const withEvidence = yield* store.addEvidence({
      incidentId: created.id,
      title: "Order #1001",
      source: "Shopify",
      contentType: "json",
      content: '{"id":1001}',
    });
    assert.strictEqual(withEvidence.evidence.length, 1);
    assert.strictEqual(withEvidence.evidence[0]?.source, "Shopify");

    const linked = yield* store.update({
      id: created.id,
      threadId: "thread-1",
      summary: "Facts: order not found.",
    });
    assert.strictEqual(linked.threadId, "thread-1");
    assert.strictEqual(linked.summary, "Facts: order not found.");

    const byThread = yield* store.findByThread("thread-1");
    assert.strictEqual(byThread?.id, created.id);
    assert.strictEqual(yield* store.findByThread("nope"), null);

    const resolved = yield* store.update({ id: created.id, status: "resolved" });
    assert.strictEqual(resolved.status, "resolved");
    assert.notStrictEqual(resolved.resolvedAt, null);

    const listed = yield* store.list();
    assert.strictEqual(listed.length, 1);

    yield* store.remove(created.id);
    assert.strictEqual((yield* store.list()).length, 0);
  }).pipe(
    Effect.provide(
      ServerConfig.layerTest(process.cwd(), { prefix: "t3-incidents-test-" }).pipe(
        Layer.provideMerge(NodeServices.layer),
      ),
    ),
  ),
);
