import type { AccountField } from "../src/shared";

export function validateAccountValues(
  fields: AccountField[],
  input: unknown,
  kind: "api" | "credentials" = "credentials",
): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Enter the account details for this domain.");
  const values: Record<string, string> = Object.create(null);
  const raw = input as Record<string, unknown>;
  if (
    Object.keys(raw).some((key) => !fields.some((field) => field.key === key))
  )
    throw new Error("Unexpected account fields. Select the domain again.");
  for (const field of fields) {
    const rawValue = raw[field.key];
    const value =
      kind === "api" && typeof rawValue === "string"
        ? rawValue.trim()
        : rawValue;
    if (
      value !== undefined &&
      (typeof value !== "string" ||
        value.length > 4096 ||
        /[\r\n\0]/.test(value))
    )
      throw new Error("An account field is invalid.");
    // Passwords can intentionally contain surrounding whitespace.
    const text = typeof value === "string" ? value : "";
    if (field.required && !text.trim())
      throw new Error("Fill in all required account fields.");
    values[field.key] = text;
  }
  return values;
}
