"use server";

import { redirect } from "next/navigation";

import { MissingEnvError } from "@/lib/env";
import { createResearch } from "@/lib/research";
import { parseResearchInput, type ResearchInputErrors } from "@/lib/research-input";

export type CreateResearchState = {
  errors?: ResearchInputErrors;
  message?: string;
  // Echoed back so the form keeps what the user typed after a failed submit.
  values?: { query: string; focus: string };
};

export async function createResearchAction(
  _prev: CreateResearchState,
  formData: FormData,
): Promise<CreateResearchState> {
  const raw = { query: formData.get("query"), focus: formData.get("focus") };
  const values = {
    query: typeof raw.query === "string" ? raw.query : "",
    focus: typeof raw.focus === "string" ? raw.focus : "",
  };

  const parsed = parseResearchInput(raw);
  if (!parsed.ok) return { errors: parsed.errors, values };

  let id: string;
  try {
    const result = await createResearch(parsed.value);
    if (!result.ok) {
      return {
        message: "The demo has hit its hourly research limit. Please try again later.",
        values,
      };
    }
    id = result.id;
  } catch (error) {
    console.error("createResearchAction failed", error);
    const message =
      error instanceof MissingEnvError
        ? "The database is not configured on this deployment."
        : "Could not start the research. Please try again.";
    return { message, values };
  }

  // Outside the try: redirect() works by throwing, and must not be caught.
  redirect(`/research/${id}`);
}
