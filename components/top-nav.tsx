import Link from "next/link";
import { canManageCourses, canSeeAdmin } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { brand } from "@/lib/brand";
import { countPaths } from "@/lib/paths";
import { BrandSignature } from "./brand-signature";
import styles from "./top-nav.module.css";

type Props = {
  active?: "lernen" | "katalog" | "pfade" | "manage";
};

export async function TopNav({ active }: Props) {
  const user = await getCurrentUser();
  const initial = user
    ? (user.displayName ?? user.email ?? "?").trim().charAt(0).toLowerCase()
    : null;
  const showAdminLink = user ? canSeeAdmin(user.role) : false;
  // „Pfade" erst zeigen, wenn mindestens ein sichtbarer Lernpfad existiert —
  // kein Menüpunkt ins Leere. Editoren (canManageCourses) sehen den Link schon
  // bei einem Draft, damit sie ihn testen können; Lerner erst bei published.
  const canDrafts = user ? canManageCourses(user.role) : false;
  const showPathsLink = (await countPaths({ includeDrafts: canDrafts })) > 0;

  return (
    <nav className={styles.nav}>
      <div className={styles.brandWrap}>
        <Link href={user ? "/dashboard" : "/"} className={styles.brand}>
          <BrandSignature
            markClassName={styles.mark}
            nameClassName={styles.name}
            tldClassName={styles.tld}
          />
        </Link>
        {brand.tagline && <span className={styles.tag}>{brand.tagline}</span>}
      </div>
      <div className={styles.links}>
        {user && (
          <Link
            href="/dashboard"
            className={active === "lernen" ? styles.active : undefined}
          >
            Mein Lernen
          </Link>
        )}
        <Link
          href="/courses"
          className={active === "katalog" ? styles.active : undefined}
        >
          Katalog
        </Link>
        {showPathsLink && (
          <Link
            href="/paths"
            className={active === "pfade" ? styles.active : undefined}
          >
            Pfade
          </Link>
        )}
        {showAdminLink && (
          <Link
            href="/manage"
            className={active === "manage" ? styles.active : undefined}
          >
            Verwaltung
          </Link>
        )}
      </div>
      <div className={styles.right}>
        {user ? (
          <>
            <Link href="/profile" className={styles.avatar} aria-label="Profil">
              {initial ?? "?"}
            </Link>
            <form action="/auth/oidc/logout" method="post">
              <button type="submit" className="btn btn-ghost">
                Abmelden
              </button>
            </form>
          </>
        ) : (
          <Link href="/auth/oidc/login" className="btn btn-primary">
            Anmelden
          </Link>
        )}
      </div>
    </nav>
  );
}
