"use client";

import { ExternalLink, FileDown } from "lucide-react";
import { useState } from "react";
import { openTrainingFile } from "../../lib/firebase-storage";
import type { TrainingMaterial } from "../../lib/training-library-engine";

/**
 * Opens one training material.
 *
 * External links open directly. Files stored in Firebase Storage are fetched with the signed-in Firebase ID
 * token and handed to the browser as a blob URL, because Momentum keeps the object private instead of
 * publishing an unguessable download token.
 */
export function TrainingMaterialLink({ material }: { material: TrainingMaterial }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (material.url) return <small><a href={material.url} target="_blank" rel="noreferrer"><ExternalLink size={12}/> {material.title}</a> · {material.kind}</small>;
  if (!material.storagePath) return <small>{material.title} · {material.kind} · not available</small>;

  const open = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await openTrainingFile(material.storagePath!);
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    window.open(result.value.objectUrl, "_blank", "noopener,noreferrer");
    // The tab has the bytes by now; holding the blob open would leak it for the life of the session.
    window.setTimeout(() => URL.revokeObjectURL(result.value.objectUrl), 60_000);
  };

  return <small>
    <button type="button" className="training-material-open" onClick={() => void open()} disabled={busy}><FileDown size={12}/> {busy ? "Opening…" : material.title}</button>
    {" · "}{material.kind}{material.fileName ? ` · ${material.fileName}` : ""}
    {error && <em className="form-error" role="alert">{error}</em>}
  </small>;
}
