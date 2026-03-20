import { LANGUAGES } from "../../constants.js";

export function LanguageInput({ value, onChange, includeSpecial = false }) {
  const filtered = includeSpecial ? LANGUAGES : LANGUAGES.filter((lang) => lang.code !== "technical");
  const options = includeSpecial ? filtered : [filtered.find((l) => l.code === "ja"), ...filtered.filter((l) => l.code !== "ja")];
  return (
    <select
      className="settings-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((lang) => (
        <option key={lang.code} value={lang.code}>{lang.native ? `${lang.label}(${lang.native})` : lang.label}</option>
      ))}
    </select>
  );
}
