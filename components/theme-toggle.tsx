"use client";

import { useEffect, useState } from "react";
import styles from "./theme-toggle.module.css";

type Theme = "dark" | "light";

// Storage-Key wird vom Server-Component als Prop reingegeben, damit verschiedene
// Brand-Forks unter derselben Origin nicht die localStorage-Keys teilen.
// (Brand-Vars sind server-only ohne NEXT_PUBLIC_-Prefix — siehe lib/brand.ts.)
//
// Theme wird in BEIDEM gespeichert:
//   - localStorage (Legacy/Backup falls Cookie verloren geht)
//   - Cookie       (Server-readable für SSR-gesetztes data-theme → kein
//                   Theme-Flash und kein <script>-Tag mehr nötig)

const COOKIE_NAME = "theme";
const COOKIE_MAX_AGE_DAYS = 365;

function writeThemeCookie(theme: Theme) {
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  // SameSite=Lax reicht — wir setzen den Cookie nie cross-origin, und ein
  // GET vom anderen Origin braucht ihn auch nicht.
  // Secure nur wenn HTTPS — in localhost-Dev funktioniert es ohne.
  const secure = typeof location !== "undefined" && location.protocol === "https:";
  document.cookie =
    `${COOKIE_NAME}=${theme}; Max-Age=${maxAge}; Path=/; SameSite=Lax` +
    (secure ? "; Secure" : "");
}

export function ThemeToggle({ storageKey = "verstande-theme" }: { storageKey?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const current = (document.documentElement.getAttribute("data-theme") as Theme) || "dark";
    setTheme(current);
    setMounted(true);

    // Migration: Bestands-User die noch im localStorage-Only-Modell sind und
    // noch keinen Cookie haben, beim ersten Visit nach diesem Update Cookie
    // nachziehen. Damit klappt SSR-Rendering ab dem 2. Page-Load.
    try {
      const fromStorage = localStorage.getItem(storageKey);
      const hasCookie = document.cookie
        .split(";")
        .some((c) => c.trim().startsWith(`${COOKIE_NAME}=`));
      if (fromStorage && !hasCookie) {
        writeThemeCookie(fromStorage as Theme);
      }
    } catch {}
  }, [storageKey]);

  function apply(next: Theme) {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {}
    writeThemeCookie(next);
  }

  if (!mounted) return null;

  return (
    <div className={styles.wrap} role="group" aria-label="Farbschema">
      <button
        type="button"
        className={theme === "dark" ? styles.on : undefined}
        onClick={() => apply("dark")}
      >
        Dark
      </button>
      <button
        type="button"
        className={theme === "light" ? styles.on : undefined}
        onClick={() => apply("light")}
      >
        Light
      </button>
    </div>
  );
}
