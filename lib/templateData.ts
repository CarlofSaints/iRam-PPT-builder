import { readJson, writeJson, deleteJson } from "./blob";
import type { PptTemplate } from "./types";

const BLOB_KEY = "templates.json";

/** Default template — always available */
const DEFAULT_TEMPLATE: PptTemplate = {
  id: "default",
  name: "iRAM Standard",
  primaryColor: "003B75",
  accentColor: "E04E2A",
  logoUrl: null,
  fontFamily: "Arial",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/** Load all templates. Ensures the default template always exists. */
export async function loadTemplates(): Promise<PptTemplate[]> {
  const templates = await readJson<PptTemplate[]>(BLOB_KEY, []);
  if (!templates.find((t) => t.id === "default")) {
    templates.unshift(DEFAULT_TEMPLATE);
  }
  return templates;
}

/** Save the full templates array. */
export async function saveTemplates(templates: PptTemplate[]): Promise<void> {
  await writeJson(BLOB_KEY, templates);
}

/** Get a single template by ID. */
export async function getTemplate(
  id: string
): Promise<PptTemplate | undefined> {
  const all = await loadTemplates();
  return all.find((t) => t.id === id);
}

/** Create a new template. Returns the created template. */
export async function createTemplate(
  data: Pick<PptTemplate, "name" | "primaryColor" | "accentColor" | "fontFamily">
): Promise<PptTemplate> {
  const all = await loadTemplates();
  const template: PptTemplate = {
    id: crypto.randomUUID(),
    name: data.name,
    primaryColor: data.primaryColor || "003B75",
    accentColor: data.accentColor || "E04E2A",
    logoUrl: null,
    fontFamily: data.fontFamily || "Arial",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  all.push(template);
  await saveTemplates(all);
  return template;
}

/** Update an existing template. Returns the updated template or null. */
export async function updateTemplate(
  id: string,
  data: Partial<Pick<PptTemplate, "name" | "primaryColor" | "accentColor" | "fontFamily" | "logoUrl">>
): Promise<PptTemplate | null> {
  const all = await loadTemplates();
  const idx = all.findIndex((t) => t.id === id);
  if (idx === -1) return null;

  all[idx] = {
    ...all[idx],
    ...data,
    updatedAt: new Date().toISOString(),
  };
  await saveTemplates(all);
  return all[idx];
}

/** Delete a template by ID. Cannot delete the default template. */
export async function deleteTemplate(id: string): Promise<boolean> {
  if (id === "default") return false;
  const all = await loadTemplates();
  const filtered = all.filter((t) => t.id !== id);
  if (filtered.length === all.length) return false;

  // Delete associated logo blob if any
  const tmpl = all.find((t) => t.id === id);
  if (tmpl?.logoUrl) {
    await deleteJson(`logos/${id}`).catch(() => {});
  }

  await saveTemplates(filtered);
  return true;
}
