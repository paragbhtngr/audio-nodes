import { THEMES, useTheme, type ThemeId } from '../state/theme';

export function ThemePicker() {
  const [theme, setTheme] = useTheme();
  return (
    <label className="theme-picker">
      <span>Skin</span>
      <select
        className="insp__select"
        value={theme}
        onChange={(e) => setTheme(e.target.value as ThemeId)}
      >
        {THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
    </label>
  );
}
