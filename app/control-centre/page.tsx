"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { PptTemplate } from "@/lib/types";

interface PerigeeStatus {
  connected: boolean;
  loggedInAt: string | null;
  loggedInBy: string | null;
  hasEnvFallback: boolean;
}

export default function ControlCentrePage() {
  const [templates, setTemplates] = useState<PptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrimary, setNewPrimary] = useState("7CC042");
  const [newAccent, setNewAccent] = useState("32373C");
  const [newFont, setNewFont] = useState("Arial");
  const [saving, setSaving] = useState(false);

  // Perigee auth state
  const [perigeeStatus, setPerigeeStatus] = useState<PerigeeStatus | null>(
    null
  );
  const [pgUser, setPgUser] = useState("");
  const [pgPass, setPgPass] = useState("");
  const [pgLoggingIn, setPgLoggingIn] = useState(false);
  const [pgError, setPgError] = useState("");
  const [pgSuccess, setPgSuccess] = useState("");

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

  const loadPerigeeStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/perigee-auth");
      if (res.ok) {
        setPerigeeStatus(await res.json());
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadTemplates();
    loadPerigeeStatus();
  }, [loadTemplates, loadPerigeeStatus]);

  const handlePerigeeLogin = async () => {
    if (!pgUser.trim() || !pgPass) return;
    setPgLoggingIn(true);
    setPgError("");
    setPgSuccess("");

    try {
      const res = await fetch("/api/perigee-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: pgUser.trim(), password: pgPass }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setPgError(data.error || "Login failed");
      } else {
        setPgSuccess("Connected to Perigee successfully");
        setPgPass("");
        await loadPerigeeStatus();
      }
    } catch {
      setPgError("Network error — could not reach server");
    }
    setPgLoggingIn(false);
  };

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

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("en-ZA", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800">Control Centre</h2>
        <p className="text-sm text-gray-500 mt-1">
          Manage PPT templates and Perigee connection.
        </p>
      </div>

      {/* ── Perigee Connection ──────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">
            Perigee Connection
          </h3>
          {perigeeStatus && (
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                perigeeStatus.connected
                  ? "bg-green-50 text-green-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  perigeeStatus.connected ? "bg-green-500" : "bg-amber-500"
                }`}
              />
              {perigeeStatus.connected ? "Connected" : "Not connected"}
            </span>
          )}
        </div>

        <p className="text-xs text-gray-500">
          Log in with your Perigee credentials to enable image downloads for PPT
          reports. The session will be shared across all users of this app.
        </p>

        {perigeeStatus?.connected && perigeeStatus.loggedInAt && (
          <div className="text-xs text-gray-500 bg-gray-50 rounded-md px-3 py-2">
            Last connected by{" "}
            <span className="font-medium text-gray-700">
              {perigeeStatus.loggedInBy}
            </span>{" "}
            on {formatDate(perigeeStatus.loggedInAt)}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Perigee Username
            </label>
            <input
              type="text"
              value={pgUser}
              onChange={(e) => setPgUser(e.target.value)}
              placeholder="e.g. carl@outerjoin.co.za"
              disabled={pgLoggingIn}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7CC042] disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Perigee Password
            </label>
            <input
              type="password"
              value={pgPass}
              onChange={(e) => setPgPass(e.target.value)}
              placeholder="Enter password"
              disabled={pgLoggingIn}
              onKeyDown={(e) => e.key === "Enter" && handlePerigeeLogin()}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7CC042] disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handlePerigeeLogin}
            disabled={pgLoggingIn || !pgUser.trim() || !pgPass}
            className="px-4 py-2 bg-[#7CC042] text-white text-sm font-semibold rounded-md hover:bg-[#5a9a2e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pgLoggingIn ? "Connecting..." : "Connect to Perigee"}
          </button>

          {pgError && (
            <p className="text-xs text-red-600">{pgError}</p>
          )}
          {pgSuccess && (
            <p className="text-xs text-green-600">{pgSuccess}</p>
          )}
        </div>
      </div>

      {/* ── Templates ──────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">PPT Templates</h3>
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
