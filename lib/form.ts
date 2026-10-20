/** A text field from a submitted form, trimmed. Files and missing fields read as "". */
export function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}
