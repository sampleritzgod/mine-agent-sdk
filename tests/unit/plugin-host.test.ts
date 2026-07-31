import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { EventBus, PluginHost, createTool, type AgentPlugin } from "../../src";

test("PluginHost runs setup then init, and init sees the full merged registry", async () => {
  const calls: string[] = [];

  const toolA = createTool({
    name: "a",
    description: "a",
    schema: z.object({}),
    timeout: 1000,
    retry: { attempts: 1 },
    metadata: {},
    execute: () => "a",
  });
  const toolB = createTool({
    name: "b",
    description: "b",
    schema: z.object({}),
    timeout: 1000,
    retry: { attempts: 1 },
    metadata: {},
    execute: () => "b",
  });

  const pluginA: AgentPlugin = {
    name: "plugin-a",
    setup(ctx) {
      calls.push("a.setup");
      ctx.registerTool(toolA);
    },
    init(ctx) {
      calls.push("a.init");
      assert.equal(ctx.tools.length, 2);
    },
  };

  const pluginB: AgentPlugin = {
    name: "plugin-b",
    setup(ctx) {
      calls.push("b.setup");
      ctx.registerTool(toolB);
    },
    init(ctx) {
      calls.push("b.init");
      assert.equal(ctx.tools.length, 2);
    },
  };

  const host = new PluginHost([pluginA, pluginB], new EventBus(), {});
  const result = await host.setup();
  assert.equal(result.tools.length, 2);

  await host.init();

  assert.deepEqual(calls, ["a.setup", "b.setup", "a.init", "b.init"]);
});

test("PluginHost runs teardown in reverse registration order", async () => {
  const calls: string[] = [];

  const pluginA: AgentPlugin = {
    name: "plugin-a",
    setup() {},
    teardown() {
      calls.push("a.teardown");
    },
  };

  const pluginB: AgentPlugin = {
    name: "plugin-b",
    setup() {},
    teardown() {
      calls.push("b.teardown");
    },
  };

  const host = new PluginHost([pluginA, pluginB], new EventBus(), {});
  await host.setup();
  await host.teardown();

  assert.deepEqual(calls, ["b.teardown", "a.teardown"]);
});

test("PluginHost.teardown is a no-op for plugins that don't define it", async () => {
  const host = new PluginHost([{ name: "bare", setup() {} }], new EventBus(), {});
  await host.setup();
  await assert.doesNotReject(() => host.teardown());
});
