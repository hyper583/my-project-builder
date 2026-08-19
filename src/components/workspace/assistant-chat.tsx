"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowUp, Square } from "lucide-react";

export interface ChatMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
}

/**
 * Streaming assistant chat.
 *
 * Reads a Server-Sent Event stream from a POST, which `EventSource` cannot do
 * (it is GET-only), so the response body is consumed directly and framed here.
 *
 * The transcript is persisted server-side, not held in the browser — a reload
 * or a move between devices keeps the conversation.
 */
export function AssistantChat({
  projectId,
  sectionId,
  aiConfigured,
  initialMessages,
  initialConversationId,
}: {
  projectId: string;
  sectionId: string | null;
  aiConfigured: boolean;
  initialMessages: ChatMessage[];
  initialConversationId: string | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, streaming]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }, []);

  useEffect(() => stop, [stop]);

  const send = useCallback(async () => {
    const question = draft.trim();
    if (!question || busy) return;

    setDraft("");
    setError(null);
    setStreaming("");
    setBusy(true);
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "USER", content: question },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`/api/projects/${projectId}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, sectionId, conversationId }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        setError(payload?.message ?? "The assistant couldn't answer. Please try again.");
        setBusy(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";

      // SSE frames are separated by a blank line; a chunk can split one, so the
      // remainder is carried over rather than parsed half-formed.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const eventLine = frame.split("\n").find((l) => l.startsWith("event: "));
          const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!eventLine || !dataLine) continue;

          const event = eventLine.slice(7).trim();
          const data = JSON.parse(dataLine.slice(6));

          if (event === "start") {
            setConversationId(data.conversationId);
          } else if (event === "delta") {
            answer += data.text;
            setStreaming(answer);
          } else if (event === "error") {
            setError(data.message);
          }
        }
      }

      if (answer.trim()) {
        setMessages((prev) => [
          ...prev,
          { id: `local-a-${Date.now()}`, role: "ASSISTANT", content: answer },
        ]);
      }
    } catch (caught) {
      // An abort is the student pressing Stop, not a failure to report.
      if ((caught as Error)?.name !== "AbortError") {
        setError("The connection dropped. Anything already written above is saved.");
      }
    } finally {
      setStreaming("");
      setBusy(false);
      abortRef.current = null;
    }
  }, [draft, busy, projectId, sectionId, conversationId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && !streaming ? (
          <p className="leading-relaxed text-muted-foreground">
            Ask anything about your project — what a section still needs, how to phrase
            something, whether your objectives and research questions line up.
          </p>
        ) : null}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={
              msg.role === "USER"
                ? "ml-6 rounded-lg rounded-br-sm border border-border bg-muted p-3 text-sm leading-relaxed"
                : "mr-6 rounded-lg rounded-bl-sm border border-border bg-card p-3 text-sm leading-relaxed whitespace-pre-wrap elevated-1"
            }
          >
            {msg.content}
          </div>
        ))}

        {streaming ? (
          <div className="mr-6 rounded-lg rounded-bl-sm border border-border bg-card p-3 text-sm leading-relaxed whitespace-pre-wrap elevated-1">
            {streaming}
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary align-text-bottom" aria-hidden="true" />
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/35 bg-destructive-subtle p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        <div ref={bottomRef} />
      </div>

      <form
        className="border-t border-border bg-surface p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label htmlFor="assistant-input" className="sr-only">
          Ask the assistant about your project
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="assistant-input"
            rows={2}
            value={draft}
            disabled={!aiConfigured}
            placeholder={
              aiConfigured ? "What would you like to change?" : "AI isn't configured"
            }
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends; Shift+Enter is a newline, as in every chat app.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            className="max-h-40 min-h-[3rem] flex-1 resize-y rounded-md border border-input bg-card px-3 py-2 text-sm transition-[border-color] duration-150 outline-none placeholder:text-subtle-foreground hover:border-border-strong focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
          />
          {busy ? (
            <button
              type="button"
              onClick={stop}
              aria-label="Stop generating"
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
            >
              <Square className="size-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!aiConfigured || draft.trim().length === 0}
              aria-label="Send message"
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md bg-primary text-on-primary transition-colors duration-200 hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40"
            >
              <ArrowUp className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
