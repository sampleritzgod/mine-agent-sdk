import { z } from "zod";
import { Agent, EventBus, ScriptedProvider, createTool } from "../src";

const getWeather = createTool({
  name: "get_weather",
  description: "Looks up the current temperature in Celsius for a city.",
  schema: z.object({ city: z.string() }),
  timeout: 1_000,
  retry: { attempts: 2, backoffMs: 50 },
  metadata: { category: "weather" },
  execute(input, context) {
    context.log(`looking up weather for ${input.city}`);
    const temperatures: Record<string, number> = { paris: 18, tokyo: 24, cairo: 33 };
    const celsius = temperatures[input.city.toLowerCase()];
    if (celsius === undefined) {
      throw new Error(`No weather data for "${input.city}".`);
    }
    return { celsius };
  },
});

const convertToFahrenheit = createTool({
  name: "convert_to_fahrenheit",
  description: "Converts a Celsius value to Fahrenheit.",
  schema: z.object({ celsius: z.number() }),
  timeout: 1_000,
  retry: { attempts: 1 },
  metadata: { category: "math" },
  execute(input) {
    return input.celsius * (9 / 5) + 32;
  },
});

async function main(): Promise<void> {
  const events = new EventBus();
  events.on("tool.started", ({ toolCall, attempt }) => {
    console.log(`[tool.started] ${toolCall.name} (attempt ${attempt})`);
  });
  events.on("tool.finished", ({ toolCall, result }) => {
    console.log(`[tool.finished] ${toolCall.name} ->`, result.result);
  });

  const provider = new ScriptedProvider([
    {
      id: "model_1",
      content: "",
      toolCalls: [{ id: "call_1", name: "get_weather", arguments: { city: "Tokyo" } }],
    },
    request => {
      const weatherResult = request.messages[request.messages.length - 1];
      const celsius = JSON.parse(weatherResult?.content ?? "{}").celsius as number;
      return {
        id: "model_2",
        content: "",
        toolCalls: [{ id: "call_2", name: "convert_to_fahrenheit", arguments: { celsius } }],
      };
    },
    request => {
      const fahrenheit = request.messages[request.messages.length - 1]?.content;
      return { id: "model_3", content: `Tokyo is ${fahrenheit}°F right now.` };
    },
  ]);

  const agent = new Agent({
    name: "weather-agent",
    instructions: "Use tools to answer weather questions precisely.",
    provider,
    tools: [getWeather, convertToFahrenheit],
    eventBus: events,
  });

  const result = await agent.run("What's the weather in Tokyo, in Fahrenheit?");
  console.log(result.output);
}

void main();
