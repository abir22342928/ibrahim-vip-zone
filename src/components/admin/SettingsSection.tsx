"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { SETTINGS_GROUPS, type SettingField } from "./settings-groups";

export default function SettingsSection({ groupId }: { groupId: string }) {
  const group = SETTINGS_GROUPS.find((g) => g.id === groupId);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void api<{ settings: Record<string, string> }>("/api/admin/settings").then((res) => {
      if (res.ok) setValues(res.settings ?? {});
      else setMessage(res.error ?? "সেটিংস লোড করা যায়নি।");
    });
  }, []);

  if (!group) return null;

  const save = async (fields: SettingField[]) => {
    setBusy(true);
    setMessage(null);
    const payload: Record<string, string> = {};
    for (const f of fields) payload[f.key] = values[f.key] ?? "";
    const res = await api<{ settings: Record<string, string> }>("/api/admin/settings", {
      method: "PUT",
      body: { values: payload },
    });
    setBusy(false);
    if (!res.ok) {
      setMessage(res.error);
      return;
    }
    setValues(res.settings);
    setMessage("✅ সেটিংস সেভ হয়েছে — AI ও ওয়েবসাইটে সাথে সাথে কার্যকর।");
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h1 className="text-lg font-black">
          {group.icon} {group.title}
        </h1>
        <p className="tiny muted">{group.description}</p>
      </div>

      <div className="card p-4">
        {group.fields.map((f) => (
          <div key={f.key} className="mb-3">
            <label className="label">{f.label}</label>
            {f.type === "textarea" ? (
              <textarea
                className="textarea"
                rows={4}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            ) : f.type === "toggle" ? (
              <select
                className="select"
                value={values[f.key] ?? "false"}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              >
                <option value="true">true (চালু)</option>
                <option value="false">false (বন্ধ)</option>
              </select>
            ) : (
              <input
                className="input"
                type={f.type === "number" ? "number" : f.type === "time" ? "time" : "text"}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            )}
            {f.hint && <p className="tiny muted mt-1">{f.hint}</p>}
          </div>
        ))}

        {message && <p className="mb-3 rounded-xl bg-white/10 px-3 py-2 text-sm">{message}</p>}
        <button className="btn btn-primary w-full" onClick={() => save(group.fields)} disabled={busy}>
          {busy ? "সেভ হচ্ছে..." : "💾 সেভ করুন"}
        </button>
      </div>
    </div>
  );
}
