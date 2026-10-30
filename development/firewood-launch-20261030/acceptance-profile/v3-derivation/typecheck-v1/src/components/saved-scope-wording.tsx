"use client";

import { useEffect, useState } from "react";
import { DRAFT_PRIVACY_EVENT, draftSession } from "@/lib/drafts/browser-privacy";
import { parseScopePresets, PRESET_PREFIX, type ScopePreset } from "@/lib/drafts/scope-presets";

const blank = (): ScopePreset => ({ id: "", label: "", kind: "scope", name: "", description: "", debrisHandling: "" });
export function SavedScopeWording({ userId, lines, getDebris, insert }: {
  userId: string; lines: { name: string; description: string }[];
  getDebris: () => { description: string; debrisHandling: string };
  insert: (preset: ScopePreset) => void;
}) {
  const [presets, setPresets] = useState<ScopePreset[]>([]);
  const [editor, setEditor] = useState<ScopePreset>(blank);
  const [source, setSource] = useState("0");
  const [message, setMessage] = useState("");
  const key = `${PRESET_PREFIX}${encodeURIComponent(userId)}`;
  useEffect(() => {
    const load = () => {
      try {
        setPresets(draftSession(userId) ? parseScopePresets(localStorage.getItem(key)) : []);
        if (!draftSession(userId)) setEditor(blank());
      } catch { setMessage("Saved wording is unavailable in this browser."); }
    };
    load(); window.addEventListener(DRAFT_PRIVACY_EVENT, load); window.addEventListener("storage", load);
    return () => { window.removeEventListener(DRAFT_PRIVACY_EVENT, load); window.removeEventListener("storage", load); };
  }, [key, userId]);

  function persist(next: ScopePreset[]) {
    try {
      if (!draftSession(userId)) throw new Error("Sign in changed");
      if (next.length > 40) { setMessage("You can save up to 40 wording presets. Remove one before adding another."); return false; }
      const value = JSON.stringify(next);
      if (parseScopePresets(value).length !== next.length) throw new Error("Invalid wording");
      const safe = parseScopePresets(value);
      localStorage.setItem(key, JSON.stringify(safe)); setPresets(safe); return true;
    } catch { setMessage("Could not save wording on this browser. Your quote has not changed."); return false; }
  }
  function save() {
    if (!editor.label.trim() || (editor.kind === "scope" && !editor.name.trim()) || (editor.kind === "debris" && !editor.debrisHandling)) {
      setMessage("Add a preset name and a line title or wood and chips plan."); return;
    }
    const item = { ...editor, id: editor.id || crypto.randomUUID(), label: editor.label.trim() };
    // Read the latest library before editing so another tab's additions survive.
    try {
      const latest = parseScopePresets(localStorage.getItem(key));
      if (persist([...latest.filter(preset => preset.id !== item.id), item])) { setEditor(item); setMessage("Wording saved on this browser. Prices are never included."); }
    } catch { setMessage("Could not save wording on this browser. Your quote has not changed."); }
  }
  return <details className="saved-scope-wording" onKeyDown={event => {
    // Enter while naming wording must not submit the surrounding quote form.
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault();
  }}>
    <summary>Saved scopes and wood / chips wording</summary>
    <p className="form-help">Save your own reusable wording here. It stays personal to your account on this browser. Leave customer details out; prices are never saved.</p>
    <div className="form-grid-two">
      <label>Saved wording<select value={editor.id} onChange={event => { setEditor(presets.find(item => item.id === event.target.value) ?? blank()); setMessage(""); }}><option value="">New wording</option>{presets.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>Copy from this quote<select value={source} onChange={event => setSource(event.target.value)}>{lines.map((line, index) => <option key={index} value={String(index)}>Line {index + 1}: {line.name || "Untitled"}</option>)}<option value="debris">Wood and chips plan</option></select></label>
    </div>
    <button className="secondary-action" type="button" onClick={() => {
      if (source === "debris") setEditor({ ...blank(), kind: "debris", ...getDebris() });
      else { const line = lines[Number(source)]; if (line) setEditor({ ...blank(), name: line.name, description: line.description }); }
      setMessage("");
    }}>Use this wording as a starting point</button>
    <div className="form-grid-two">
      <label>Preset name<input maxLength={80} value={editor.label} onChange={event => setEditor({ ...editor, label: event.target.value })} /></label>
      {editor.kind === "scope" ? <label>Line title<input maxLength={300} value={editor.name} onChange={event => setEditor({ ...editor, name: event.target.value })} /></label> : <label>Wood and chips plan<select value={editor.debrisHandling} onChange={event => setEditor({ ...editor, debrisHandling: event.target.value })}><option value="">Not decided</option><option value="haul_all">Haul all wood and chips</option><option value="leave_wood">Leave wood onsite</option><option value="leave_chips">Leave chips onsite</option><option value="leave_wood_and_chips">Leave wood and chips onsite</option><option value="partial_haul">Partial haul</option><option value="other">Other arrangement</option></select></label>}
    </div>
    <label>{editor.kind === "scope" ? "Saved scope wording" : "Saved wood / chips instructions"}<textarea maxLength={editor.kind === "scope" ? 6000 : 1200} rows={4} value={editor.description} onChange={event => setEditor({ ...editor, description: event.target.value })} /></label>
    <div className="workflow-button-row">
      <button className="secondary-action" type="button" onClick={save}>{editor.id ? "Update saved wording" : "Save wording"}</button>
      <button className="secondary-action" type="button" disabled={editor.kind === "scope" ? !editor.name.trim() : !editor.debrisHandling} onClick={() => { insert(editor); setMessage(editor.kind === "scope" ? "Scope added as a new, editable line. Enter its price before saving." : "Wood and chips wording applied. Review it before saving the quote."); }}>Insert into quote</button>
      {editor.id ? <button className="secondary-action" type="button" onClick={() => {
        if (!window.confirm("Remove this saved wording? Existing quotes will keep their wording.")) return;
        try { if (persist(parseScopePresets(localStorage.getItem(key)).filter(item => item.id !== editor.id))) { setEditor(blank()); setMessage("Saved wording removed."); } } catch { setMessage("Could not remove saved wording."); }
      }}>Remove saved wording</button> : null}
    </div>
    {message ? <p className="form-help" role="status">{message}</p> : null}
  </details>;
}
