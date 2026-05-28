"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { PptTemplate } from "@/lib/types";

export default function ControlCentrePage() {
  const [templates, setTemplates] = useState<PptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrimary, setNewPrimary] = useState("7CC042");
  const [newAccent, setNewAccent] = useState("32373C");
  const [newFont, setNewFont] = useState("Arial");
  const [saving, setSaving] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/templates");
      const data = await res.json();
      if (Array.isArray(data)) setTemplates(data);
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          primaryColor: newPrimary,
          accentColor: newAccent,
          fontFamily: newFont,
        }),
      });
      if (res.ok) {
        setNewName("");
        setShowNew(false);
        await loadTemplates();
      }
    } catch {
      // ignore
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    await loadTemplates();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Control Centre</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage PPT templates — colours, logos, fonts.
          </p>
        </div>
        <button
          onClick={() => setShowNew(!showNew)}
          className="px-4 py-2 bg-[#7CC042] text-white text-sm font-semibold rounded-md hover:bg-[#5a9a2e] transition-colors"
        >
          {showNew ? "Cancel" : "+ New Template"}
        </button>
      </div>

      {/* New template form */}
      {showNew && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">
            New Template
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Template Name
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Clover Leaf"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7CC042]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Primary Colour (hex)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={`#${newPrimary}`}
                  onChange={(e) => setNewPrimary(e.target.value.replace("#", ""))}
                  className="w-8 h-8 rounded cursor-pointer border border-gray-300"
                />
                <input
                  value={newPrimary}
                  onChange={(e) => setNewPrimary(e.target.value.replace("#", ""))}
                  className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm font-mono"
                  maxLength={6}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Accent Colour (hex)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={`#${newAccent}`}
                  onChange={(e) => setNewAccent(e.target.value.replace("#", ""))}
                  className="w-8 h-8 rounded cursor-pointer border border-gray-300"
                />
                <input
                  value={newAccent}
                  onChange={(e) => setNewAccent(e.target.value.replace("#", ""))}
                  className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm font-mono"
                  maxLength={6}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Font Family
              </label>
              <select
                value={newFont}
                onChange={(e) => setNewFont(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              >
                <option value="Arial">Arial</option>
                <option value="Calibri">Calibri</option>
                <option value="Segoe UI">Segoe UI</option>
                <option value="Helvetica">Helvetica</option>
                <option value="Verdana">Verdana</option>
              </select>
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={saving || !newName.trim()}
            className="px-4 py-2 bg-[#7CC042] text-white text-sm font-semibold rounded-md hover:bg-[#5a9a2e] disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Template"}
          </button>
        </div>
      )}

      {/* Template list */}
      {loading ? (
        <div className="text-sm text-gray-400">Loading templates...</div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div
              key={t.id}
              className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                {/* Colour swatch */}
                <div className="flex gap-1">
                  <div
                    className="w-6 h-6 rounded"
                    style={{ backgroundColor: `#${t.primaryColor}` }}
                    title={`Primary: #${t.primaryColor}`}
                  />
                  <div
                    className="w-6 h-6 rounded"
                    style={{ backgroundColor: `#${t.accentColor}` }}
                    title={`Accent: #${t.accentColor}`}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {t.name}
                    {t.id === "default" && (
                      <span className="ml-2 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                        DEFAULT
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400">
                    {t.fontFamily} &middot;{" "}
                    {t.logoUrl ? "Logo uploaded" : "No logo"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/control-centre/${t.id}`}
                  className="text-xs text-[#5a9a2e] hover:underline"
                >
                  Edit
                </Link>
                {t.id !== "default" && (
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
