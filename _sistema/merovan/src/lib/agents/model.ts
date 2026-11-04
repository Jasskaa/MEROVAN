// Model access. AnthropicModel calls Claude through the official SDK; ScriptedModel replays
// fixed responses so the whole agent system can be tested and evaluated without an API key.
import Anthropic from "@anthropic-ai/sdk";

export type Msg = Anthropic.Beta.Messages.BetaMessageParam;
export type Tool = Anthropic.Beta.Messages.BetaTool;
export type Reply = Anthropic.Beta.Messages.BetaMessage;
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ModelRequest {
  model: string;
  system: string;
  messages: Msg[];
  tools: Tool[];
  effort: Effort;
  maxTokens: number;
}

export interface ModelClient {
  readonly name: string;
  create(req: ModelRequest): Promise<Reply>;
}

// Price per million tokens in USD == micro-USD per token (input, output, cache read).
export const PRICES: Record<string, { in: number; out: number; cacheRead: number }> = {
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheRead: 0.01 },
};

export function costMicroUsd(model: string, u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }) {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  return Math.round(u.input_tokens * p.in + cacheWrite * p.in * 1.25 + cacheRead * p.cacheRead + u.output_tokens * p.out);
}

export class AnthropicModel implements ModelClient {
  readonly name = "anthropic";
  // Only the key explicitly set for MEROVAN: never a key inherited from the machine environment.
  private client = new Anthropic({ apiKey: process.env.MEROVAN_ANTHROPIC_API_KEY });

  async create(req: ModelRequest): Promise<Reply> {
    return this.client.beta.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      // Stable system prompt first and cached: every run of the same agent reuses it.
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: req.messages,
      tools: req.tools,
      thinking: { type: "adaptive" },
      output_config: { effort: req.effort },
      // If a safety classifier declines, the API retries on a suitable model instead of failing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  }
}

type Script = (req: ModelRequest, turn: number) => Partial<Reply> & { content: Reply["content"] };

/** Deterministic model for tests/evaluations: each call returns the next scripted reply. */
export class ScriptedModel implements ModelClient {
  readonly name = "simulado";
  calls: ModelRequest[] = [];
  constructor(private script: Script[]) {}

  async create(req: ModelRequest): Promise<Reply> {
    this.calls.push(structuredClone(req));
    const step = this.script[this.calls.length - 1];
    const body = step ? step(req, this.calls.length - 1) : { content: [{ type: "text", text: "Fin." }] as Reply["content"] };
    const hasTool = body.content.some((b) => b.type === "tool_use");
    return {
      id: `msg_sim_${this.calls.length}`, type: "message", role: "assistant", model: req.model, container: null,
      stop_reason: hasTool ? "tool_use" : "end_turn", stop_sequence: null, stop_details: null, context_management: null,
      usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } as Reply["usage"],
      ...body,
    } as Reply;
  }
}

/** Helpers to write scripts: a tool call and a final text. */
export const callTool = (name: string, input: Record<string, unknown>, id = `tu_${name}_${Math.random().toString(36).slice(2, 8)}`) =>
  ({ type: "tool_use", id, name, input }) as Reply["content"][number];
export const say = (text: string) => ({ type: "text", text, citations: null }) as Reply["content"][number];

export const hasApiKey = () => Boolean(process.env.MEROVAN_ANTHROPIC_API_KEY);
