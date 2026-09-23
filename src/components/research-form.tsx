"use client";

import { useActionState } from "react";

import { createResearchAction, type CreateResearchState } from "@/app/actions";
import { FOCUS_MAX_LENGTH, QUERY_MAX_LENGTH } from "@/lib/research-input";

const INPUT_CLASS =
  "mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20 aria-invalid:border-red-500";

const initialState: CreateResearchState = {};

export function ResearchForm() {
  const [state, formAction, pending] = useActionState(createResearchAction, initialState);

  return (
    <form
      action={formAction}
      className="mt-10 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6"
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="query" className="block text-sm font-medium">
            Research question
          </label>
          <textarea
            id="query"
            name="query"
            rows={3}
            required
            maxLength={QUERY_MAX_LENGTH}
            defaultValue={state.values?.query}
            placeholder="Cybersecurity startups in Europe"
            aria-invalid={Boolean(state.errors?.query)}
            aria-describedby={state.errors?.query ? "query-error" : undefined}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
            }}
            className={`${INPUT_CLASS} resize-none border-border`}
          />
          {state.errors?.query && (
            <p id="query-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
              {state.errors.query}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="focus" className="block text-sm font-medium">
            Focus <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="focus"
            name="focus"
            maxLength={FOCUS_MAX_LENGTH}
            defaultValue={state.values?.focus}
            placeholder="Companies, recent developments and emerging trends"
            aria-invalid={Boolean(state.errors?.focus)}
            aria-describedby={state.errors?.focus ? "focus-error" : undefined}
            className={`${INPUT_CLASS} border-border`}
          />
          {state.errors?.focus && (
            <p id="focus-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
              {state.errors.focus}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-col-reverse items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className="text-xs text-muted">
          {state.message ? (
            <span className="text-red-600 dark:text-red-400">{state.message}</span>
          ) : (
            <>
              <kbd className="font-sans">Ctrl</kbd>/<kbd className="font-sans">⌘</kbd> + Enter to start
            </>
          )}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Starting…" : "Start research"}
        </button>
      </div>
    </form>
  );
}
