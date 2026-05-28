"use client";

import { useCallback, useState, useRef } from "react";

interface Props {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export default function UploadZone({ onFile, disabled }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile, disabled]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFile(file);
      // Reset input so same file can be re-selected
      e.target.value = "";
    },
    [onFile]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
        disabled
          ? "border-gray-200 bg-gray-50 cursor-not-allowed opacity-60"
          : dragging
            ? "border-[#7CC042] bg-green-50"
            : "border-gray-300 hover:border-[#7CC042] hover:bg-gray-50"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleChange}
        className="hidden"
        disabled={disabled}
      />
      <div className="text-4xl mb-3 text-gray-400">
        {dragging ? "\u2B07" : "\u{1F4C4}"}
      </div>
      <p className="text-sm font-medium text-gray-700">
        {dragging
          ? "Drop your Excel file here"
          : "Drag & drop your Perigee Excel export here"}
      </p>
      <p className="text-xs text-gray-400 mt-1">
        or click to browse (.xlsx, .xls)
      </p>
    </div>
  );
}
