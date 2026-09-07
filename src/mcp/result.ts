/**
 * Tool results. The conventions are DoHardThings' (`lib/mcp-tools.ts:52-74`),
 * carried over deliberately rather than reinvented.
 *
 * HANDLERS NEVER THROW. A thrown error becomes a transport failure the model
 * cannot recover from and cannot explain; `isError: true` with readable text
 * lets it correct itself and try again on the same connection. That is the
 * whole reason this file exists.
 *
 * Responses are prose first, structured data second
 * (docs/specs/04-mcp-surface.md): the consumer is a language model mid-
 * conversation, so a summary it can read aloud beats a payload it has to
 * narrate.
 */

import { z } from 'zod';

export type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

/** Roughly 8 KB. A tool result larger than this crowds out the conversation it
 *  is supposed to inform, so the payload is dropped and the summary survives. */
const MAX_RESULT_BYTES = 8 * 1024;

export function ok(summary: string, data?: unknown): ToolResult {
  const text =
    data === undefined
      ? summary
      : `${summary}\n\n${JSON.stringify(data, null, 2)}`;
  return {
    content: [
      {
        type: 'text',
        text:
          Buffer.byteLength(text, 'utf8') <= MAX_RESULT_BYTES
            ? text
            : `${summary}\n\n[payload omitted: over ${MAX_RESULT_BYTES} bytes]`,
      },
    ],
  };
}

export function fail(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

/**
 * A thrown value as a readable, non-leaky message. A ZodError becomes
 * field-level guidance (`rpe_yesterday: Too big`) rather than a stack trace,
 * which is the difference between a model fixing its own call and giving up.
 */
export function reason(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.issues
      .map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`)
      .join('; ');
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
