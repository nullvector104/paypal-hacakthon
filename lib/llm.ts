/**
 * lib/llm.ts - Single Authoritative LLM Wrapper
 *
 * Rules:
 * 1. ONLY file in the project that calls the LLM provider.
 * 2. Reads LLM_PROVIDER, LLM_API_KEY, LLM_MODEL.
 * 3. Supports (1) structured JSON output and (2) tool-calling loop (max 4 iterations).
 * 4. Catches all rate-limits, provider errors, and schema failures; returns typed errors; NEVER crashes.
 * 5. Tools are read-only or draft-only (no tool moves money).
 * 6. Logs every tool call.
 */

export interface ToolParameterSchema {
  type: "OBJECT" | "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN" | "ARRAY";
  description?: string;
  properties?: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
  }>;
  required?: string[];
}

export interface ToolDefinition<TArgs = any, TResult = any> {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  execute: (args: TArgs) => Promise<TResult> | TResult;
}

export interface ToolCallLog {
  timestamp: string;
  tool: string;
  args: any;
  result: any;
  durationMs: number;
}

export interface LLMOptions {
  systemPrompt?: string;
  temperature?: number;
  responseSchema?: Record<string, any>; // Enables structured JSON output
  tools?: ToolDefinition[];
  maxIterations?: number; // Defaults to 4
}

export type LLMErrorCode =
  | "MISSING_KEY"
  | "RATE_LIMITED"
  | "INVALID_KEY"
  | "PROVIDER_ERROR"
  | "TOOL_ERROR"
  | "MAX_ITERATIONS"
  | "PARSE_ERROR";

export interface LLMError {
  code: LLMErrorCode;
  message: string;
  statusCode?: number;
  details?: unknown;
}

export type LLMResult<TData = any> =
  | {
      success: true;
      text: string;
      data?: TData;
      toolCallsLogged: ToolCallLog[];
    }
  | {
      success: false;
      error: LLMError;
      text?: string;
      toolCallsLogged: ToolCallLog[];
    };

/**
 * Validates tool arguments against the basic schema (e.g. required properties)
 */
function validateToolArgs(args: any, schema: ToolParameterSchema): { valid: boolean; error?: string } {
  if (!args || typeof args !== "object") {
    return { valid: false, error: "Tool arguments must be a JSON object" };
  }
  if (schema.required && Array.isArray(schema.required)) {
    for (const reqField of schema.required) {
      if (args[reqField] === undefined || args[reqField] === null) {
        return { valid: false, error: `Missing required argument: ${reqField}` };
      }
    }
  }
  return { valid: true };
}

/**
 * Main LLM invocation function
 */
export async function callLLM<TData = any>(
  prompt: string,
  options: LLMOptions = {}
): Promise<LLMResult<TData>> {
  const provider = (process.env.LLM_PROVIDER || "gemini").toLowerCase();
  const apiKey = (process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || "").trim();
  const candidateModels = Array.from(
    new Set([
      (process.env.LLM_MODEL || "").trim(),
      "gemini-3.5-flash-lite",
      "gemini-3-flash-preview",
      "gemini-3.5-flash",
    ].filter(Boolean))
  );
  const maxIterations = Math.min(options.maxIterations || 4, 4);

  const toolCallsLogged: ToolCallLog[] = [];

  if (!apiKey) {
    return {
      success: false,
      error: {
        code: "MISSING_KEY",
        message: "LLM_API_KEY is not configured in server environment variables.",
      },
      toolCallsLogged,
    };
  }

  if (provider !== "gemini") {
    return {
      success: false,
      error: {
        code: "PROVIDER_ERROR",
        message: `Unsupported LLM_PROVIDER "${provider}". Currently only "gemini" is supported.`,
      },
      toolCallsLogged,
    };
  }

  // Format tools for Gemini API
  const geminiTools =
    options.tools && options.tools.length > 0
      ? [
          {
            functionDeclarations: options.tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            })),
          },
        ]
      : undefined;

  // Format generationConfig
  const generationConfig: Record<string, any> = {
    temperature: options.temperature !== undefined ? options.temperature : 0.2,
  };

  if (options.responseSchema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = options.responseSchema;
  }

  // Initialize conversation contents
  const contents: Array<any> = [
    {
      role: "user",
      parts: [{ text: prompt }],
    },
  ];

  let currentIteration = 0;

  while (currentIteration < maxIterations) {
    currentIteration++;

    const payload: Record<string, any> = {
      contents,
      generationConfig,
    };

    if (options.systemPrompt) {
      payload.systemInstruction = {
        parts: [{ text: options.systemPrompt }],
      };
    }

    if (geminiTools) {
      payload.tools = geminiTools;
    }

    let response: Response | undefined;
    let last429Msg = "";

    // Multi-model fallback cascade on 429, 503, 500, or network timeouts
    for (const modelToTry of candidateModels) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6-second safety timeout per model

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          modelToTry
        )}:generateContent?key=${apiKey}`;

        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          cache: "no-store",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          break;
        }

        // Retryable server or quota errors
        if (
          response.status === 429 ||
          response.status === 503 ||
          response.status === 500 ||
          response.status === 502 ||
          response.status === 504 ||
          response.status === 404
        ) {
          const errText = await response.text().catch(() => "");
          try {
            const parsed = JSON.parse(errText);
            last429Msg = parsed.error?.message || errText;
          } catch {
            last429Msg = errText;
          }
          console.warn(
            `[GEMINI FALLBACK] Model "${modelToTry}" returned ${response.status} (${last429Msg.slice(0, 80)}). Trying next candidate model...`
          );
          response = undefined;
          continue;
        }

        // Fatal client error (e.g. 400 bad schema, 403 invalid key)
        break;
      } catch (networkErr: any) {
        clearTimeout(timeoutId);
        console.warn(
          `[GEMINI NETWORK ERROR] Model "${modelToTry}" failed (${networkErr?.message || networkErr}). Trying next candidate...`
        );
        response = undefined;
        continue;
      }
    }

    if (!response) {
      return {
        success: false,
        error: {
          code: "PROVIDER_ERROR",
          message: "No response received from Gemini API.",
        },
        toolCallsLogged,
      };
    }

    // Handle HTTP status errors gracefully without throwing
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      let parsedMsg = errText || last429Msg;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) parsedMsg = parsed.error.message;
      } catch {
        // use raw errText
      }

      if (response.status === 429) {
        return {
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: `Gemini API rate limit exceeded (429): ${parsedMsg}`,
            statusCode: 429,
            details: parsedMsg,
          },
          toolCallsLogged,
        };
      }

      if (response.status === 400 || response.status === 403) {
        return {
          success: false,
          error: {
            code: "INVALID_KEY",
            message: `Gemini API authentication/request failure (${response.status}): ${parsedMsg}`,
            statusCode: response.status,
            details: parsedMsg,
          },
          toolCallsLogged,
        };
      }

      return {
        success: false,
        error: {
          code: "PROVIDER_ERROR",
          message: `Gemini provider error (${response.status}): ${parsedMsg}`,
          statusCode: response.status,
          details: parsedMsg,
        },
        toolCallsLogged,
      };
    }

    // Parse Response
    let data: any;
    try {
      data = await response.json();
    } catch (parseErr: any) {
      return {
        success: false,
        error: {
          code: "PROVIDER_ERROR",
          message: `Failed to parse Gemini response JSON: ${parseErr?.message}`,
        },
        toolCallsLogged,
      };
    }

    const candidate = data.candidates?.[0];
    if (!candidate || !candidate.content) {
      return {
        success: false,
        error: {
          code: "PROVIDER_ERROR",
          message: "Gemini returned empty or blocked candidates.",
          details: data,
        },
        toolCallsLogged,
      };
    }

    const parts = candidate.content.parts || [];
    const functionCallPart = parts.find((p: any) => p.functionCall);

    // If model requested a tool / function call
    if (functionCallPart && functionCallPart.functionCall) {
      const { name, args } = functionCallPart.functionCall;
      const tool = options.tools?.find((t) => t.name === name);

      if (!tool) {
        const errorResult = { error: `Tool "${name}" not recognized.` };
        toolCallsLogged.push({
          timestamp: new Date().toISOString(),
          tool: name,
          args,
          result: errorResult,
          durationMs: 0,
        });

        // Feed error back to model
        contents.push(candidate.content);
        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name,
                response: { output: errorResult },
              },
            },
          ],
        });
        continue;
      }

      // Validate tool arguments against schema
      const validation = validateToolArgs(args, tool.parameters);
      if (!validation.valid) {
        const validationErr = { error: validation.error };
        toolCallsLogged.push({
          timestamp: new Date().toISOString(),
          tool: name,
          args,
          result: validationErr,
          durationMs: 0,
        });

        contents.push(candidate.content);
        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name,
                response: { output: validationErr },
              },
            },
          ],
        });
        continue;
      }

      // Execute tool safely
      const startMs = Date.now();
      let toolResult: any;
      try {
        toolResult = await tool.execute(args);
      } catch (toolExecErr: any) {
        toolResult = { error: `Execution failed: ${toolExecErr?.message || toolExecErr}` };
      }
      const durationMs = Date.now() - startMs;

      // Log tool call
      const logEntry: ToolCallLog = {
        timestamp: new Date().toISOString(),
        tool: name,
        args,
        result: toolResult,
        durationMs,
      };
      toolCallsLogged.push(logEntry);
      console.log(`[LLM TOOL CALL] ${name} (${durationMs}ms) - Args:`, JSON.stringify(args));

      // Append model output and function response turns
      contents.push(candidate.content);
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name,
              response: { output: toolResult },
            },
          },
        ],
      });

      // Continue loop to next iteration
      continue;
    }

    // Model generated a final answer text or structured JSON
    const textPart = parts.find((p: any) => p.text);
    const finalRawText = textPart?.text || "";

    // If structured output was requested, parse the JSON
    if (options.responseSchema) {
      try {
        // Strip markdown code fences if model wrapped them
        let cleanText = finalRawText.trim();
        if (cleanText.startsWith("```json")) {
          cleanText = cleanText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
        } else if (cleanText.startsWith("```")) {
          cleanText = cleanText.replace(/^```\s*/, "").replace(/\s*```$/, "");
        }

        const parsedData = JSON.parse(cleanText) as TData;
        return {
          success: true,
          text: finalRawText,
          data: parsedData,
          toolCallsLogged,
        };
      } catch (jsonErr: any) {
        return {
          success: false,
          error: {
            code: "PARSE_ERROR",
            message: `Model output did not conform to JSON responseSchema: ${jsonErr?.message}`,
            details: finalRawText,
          },
          text: finalRawText,
          toolCallsLogged,
        };
      }
    }

    return {
      success: true,
      text: finalRawText,
      toolCallsLogged,
    };
  }

  // If loop exited after max iterations
  return {
    success: false,
    error: {
      code: "MAX_ITERATIONS",
      message: `Tool calling exceeded the maximum allowed iterations (${maxIterations}).`,
    },
    toolCallsLogged,
  };
}
