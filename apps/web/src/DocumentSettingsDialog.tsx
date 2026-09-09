import { useState } from "react";

export interface DocumentFormatSettings {
  compression: "gzip" | "none";
  encrypted: boolean;
  password?: string;
  maxVersions: number;
  maxLogicalMiB: number;
}

export function DocumentSettingsDialog({
  current,
  onApply,
  onClose,
}: {
  current: Omit<DocumentFormatSettings, "password">;
  onApply(settings: DocumentFormatSettings): Promise<void>;
  onClose(): void;
}) {
  const [compression, setCompression] = useState(current.compression);
  const [encrypted, setEncrypted] = useState(current.encrypted);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [maxVersions, setMaxVersions] = useState(current.maxVersions);
  const [maxLogicalMiB, setMaxLogicalMiB] = useState(current.maxLogicalMiB);
  const [busy, setBusy] = useState(false);
  const needsPassword = encrypted && (!current.encrypted || Boolean(password));
  const passwordError = needsPassword && (password.length < 12 || password !== confirmation);
  return (
    <div className="modal-backdrop" role="presentation">
      <form className="small-dialog" role="dialog" aria-modal="true" aria-label="Document settings" onSubmit={(event) => {
        event.preventDefault();
        if (passwordError) return;
        setBusy(true);
        void onApply({ compression, encrypted, ...(password ? { password } : {}), maxVersions, maxLogicalMiB })
          .then(onClose).finally(() => setBusy(false));
      }}>
        <header><h2>Portable document settings</h2></header>
        <label>Compression<select value={compression} onChange={(event) => setCompression(event.target.value as "gzip" | "none")}>
          <option value="gzip">Gzip (recommended)</option><option value="none">None</option>
        </select></label>
        <label><input type="checkbox" checked={encrypted} onChange={(event) => setEncrypted(event.target.checked)} /> Password protection</label>
        {encrypted && <>
          <p>There is no password recovery. Encrypted unsaved changes are kept only in this session. Collaboration and plaintext exports are not end-to-end encrypted.</p>
          <label>{current.encrypted ? "New password (leave blank to keep current)" : "Password"}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {password && <label>Confirm password<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>}
          {passwordError && <p role="alert">Use at least 12 characters and enter the same password twice.</p>}
        </>}
        <label>Maximum versions<input type="number" min="10" max="500" value={maxVersions} onChange={(event) => setMaxVersions(Number(event.target.value))} /></label>
        <label>History budget (MiB)<input type="number" min="1" max="64" value={maxLogicalMiB} onChange={(event) => setMaxLogicalMiB(Number(event.target.value))} /></label>
        <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={busy || Boolean(passwordError)}>{busy ? "Applying…" : "Apply"}</button></footer>
      </form>
    </div>
  );
}
