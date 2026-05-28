"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import type { PptTemplate } from "@/lib/types";

export default function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [template, setTemplate] = useState<PptTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [message, setMessage] = useState("");

  // Editable fields
  const [name, setName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [fontFamily, setFontFamily] = useState("Arial");

  const loadTemplate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/templates/${id}`);
      if (!res.ok) {
        setMessage("Template not found");
        setLoading(false);
        return;
      }
      const data: PptTemplate = await res.json();
      setTemplate(data);
      setName(data.name);
      setPrimaryColor(data.primaryColor);
      setAccentColor(data.accentColor);
      setFontFamily(data.fontFamily);
    } catch {
      setMessage("Failed to load template");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadTemplate();
  }, [loadTemplate]);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, primaryColor, accentColor, fontFamily }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTemplate(updated);
        setMessage("Saved");
      } else {
        setMessage("Save failed");
      }
    } catch {
      setMessage("Save failed");
    }
    setSaving(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("logo", file);
      const res = await fetch(`/api/templates/${id}/logo`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const updated = await res.json();
        setTemplate(updated);
        setMessage("Logo uploaded");
      } else {
        setMessage("Logo upload failed");
      }
    } catch {
      setMessage("Logo upload failed");
    }
    setUploadingLogo(false);
    e.target.value = "";
  };

  if (loading) {
    return <div className="text-sm text-gray-400 p-6">Loading...</div>;
  }

  if (!template) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <p className="text-sm text-red-500">Template not found</p>
        <button
          onClick={() => router.push("/control-centre")}
          className="text-sm text-[#5a9a2e] hover:underline"
        >
          Back to Control Centre
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push("/control-centre")}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back
        </button>
        <h2 className="text-xl font-bold text-gray-800">
          Edit Template: {template.name}
        </h2>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Template Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7CC042]"
          />
        </div>

        {/* Colours */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Primary Colour
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={`#${primaryColor}`}
                onChange={(e) =>
                  setPrimaryColor(e.target.value.replace("#", ""))
                }
                className="w-8 h-8 rounded cursor-pointer border border-gray-300"
              />
              <input
                value={primaryColor}
                onChange={(e) =>
                  setPrimaryColor(e.target.value.replace("#", ""))
                }
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm font-mono"
                maxLength={6}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Accent Colour
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={`#${accentColor}`}
                onChange={(e) =>
                  setAccentColor(e.target.value.replace("#", ""))
                }
                className="w-8 h-8 rounded cursor-pointer border border-gray-300"
              />
              <input
                value={accentColor}
                onChange={(e) =>
                  setAccentColor(e.target.value.replace("#", ""))
                }
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm font-mono"
                maxLength={6}
              />
            </div>
          </div>
        </div>

        {/* Font */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Font Family
          </label>
          <select
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="Arial">Arial</option>
            <option value="Calibri">Calibri</option>
            <option value="Segoe UI">Segoe UI</option>
            <option value="Helvetica">Helvetica</option>
            <option value="Verdana">Verdana</option>
          </select>
        </div>

        {/* Logo */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Logo
          </label>
          {template.logoUrl ? (
            <div className="flex items-center gap-3 mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={template.logoUrl}
                alt="Logo"
                className="h-12 object-contain border border-gray-200 rounded"
              />
              <span className="text-xs text-green-600">Uploaded</span>
            </div>
          ) : (
            <p className="text-xs text-gray-400 mb-2">No logo uploaded</p>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleLogoUpload}
            disabled={uploadingLogo}
            className="text-xs text-gray-500"
          />
          {uploadingLogo && (
            <span className="text-xs text-gray-400 ml-2">Uploading...</span>
          )}
        </div>

        {/* Preview swatch */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Preview
          </label>
          <div
            className="h-14 rounded-md flex items-center px-4"
            style={{ backgroundColor: `#${primaryColor}` }}
          >
            <span
              className="text-sm font-bold"
              style={{ color: `#${accentColor}` }}
            >
              {name || "Template Preview"}
            </span>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-[#7CC042] text-white text-sm font-semibold rounded-md hover:bg-[#5a9a2e] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
          {message && (
            <span
              className={`text-xs ${
                message.includes("fail") ? "text-red-500" : "text-green-600"
              }`}
            >
              {message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
