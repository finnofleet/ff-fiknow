#!/usr/bin/env bash
# ==============================================================================
# migrate-finknow.sh — Ring 3 Infra-Slug-Rename (fiknow -> finknow)
# ==============================================================================
#
# WAS DIESES SCRIPT TUT:
#   1. Postgres:  benennt die Datenbank IN-PLACE um
#                 (ALTER DATABASE fiknow RENAME TO finknow).
#   2. Keycloak:  benennt Realm, Realm-Rollen (<slug>-curator/-admin,
#                 default-roles-<slug>) und die Top-Level-Gruppe IN-PLACE um
#                 (kcadm.sh update ...). Rollen-/Gruppen-Zuordnungen zu
#                 bestehenden Usern bleiben erhalten (Keycloak referenziert
#                 intern per ID, nicht per Name).
#   3. Medien/Bundle-Storage: kopiert einen Docker-Volume-Stand
#                 <old>-data -> <new>-data und verifiziert per Checksumme.
#                 Das ECHTE K8s-PVC-Aequivalent (PVC-Namen sind IMMUTABLE,
#                 also zwingend Recreate+Copy-Job) wird NICHT automatisch
#                 gegen einen Cluster ausgefuehrt, sondern als klar markierter
#                 Kommentarblock in migrate_media_volume() ausgegeben -
#                 siehe RUNBOOK.md fuer die produktive K8s-Prozedur.
#
# WAS DIESES SCRIPT AUSDRUECKLICH NICHT TUT (siehe RUNBOOK.md):
#   - DNS-Umstellung / Redirect-URI-Pflege am Keycloak-Client "edu-platform"
#     (Client-ID bleibt unveraendert, nur Redirect-Domain kann sich aendern)
#   - Helm-Release-Rename, Chart-Name-Wechsel (fiknow -> finknow),
#     image.repository-Update
#   - App-Config-Rollout: OIDC_ISSUER, OIDC_ROLE_MAP,
#     FIKNOW_RETENTION_YEARS -> FINKNOW_RETENTION_YEARS (Helm values / Secret)
#   - Tatsaechliches Anlegen/Kopieren eines echten K8s-PVC (nur dokumentiert)
#
# REIHENFOLGE / DOWNTIME (getestet auf Wegwerf-Stack, s. RUNBOOK.md):
#   - Postgres-Rename: kurze Downtime noetig. Aktive Verbindungen zur
#     Alt-DB werden zwangsgetrennt; der ausfuehrende Client selbst darf NIE
#     mit der Alt- oder Ziel-DB verbunden sein (sonst Fehler "current
#     database cannot be renamed" bzw. "is being accessed by other users") -
#     dieses Script verbindet sich dafuer immer ueber PGADMINDB (Default
#     "postgres").
#   - Keycloak-Realm-Rename ist ATOMAR und SOFORT wirksam: der alte
#     Issuer-Pfad (.../realms/<OLD_SLUG>) liefert augenblicklich 404. App-
#     Config (OIDC_ISSUER, OIDC_ROLE_MAP) MUSS im selben Wartungsfenster
#     mitgezogen werden, sonst bricht Login sofort komplett.
#   - Medien-Volume-Kopie kann VORAB laufen (kein harter Cutover), solange
#     die Quelle waehrend der Kopie nicht mehr beschrieben wird.
#
# Usage:
#   ./migrate-finknow.sh --dry-run              # zeigt alle Aktionen, nichts wird ausgefuehrt
#   ./migrate-finknow.sh                         # fuehrt aus, fragt vor jedem Schritt nach Bestaetigung
#   ./migrate-finknow.sh --yes                   # fuehrt aus ohne interaktive Rueckfrage (CI/Batch)
#   ./migrate-finknow.sh --skip-media            # z. B. wenn PVC-Migration separat per K8s-Job laeuft
#
# Env (mit Defaults, alle ueberschreibbar):
#   OLD_SLUG=fiknow                  NEW_SLUG=finknow
#
#   # Postgres
#   PGHOST=localhost   PGPORT=55440   PGUSER=postgres   PGPASSWORD=postgres
#   PGADMINDB=postgres                # Verbindungs-DB fuer den Rename - NIE
#                                     # die Alt-/Ziel-DB selbst!
#   PG_CONTAINER=""                   # falls gesetzt: psql via `docker exec`
#                                     # in diesen Container statt lokalem psql
#
#   # Keycloak
#   KC_URL=http://localhost:8085      # extern erreichbare Basis-URL (fuer Verifikation)
#   KC_INTERNAL_URL=""                # Basis-URL, mit der sich kcadm.sh einloggt;
#                                     # faellt auf KC_URL zurueck, oder auf
#                                     # http://localhost:8080 wenn KC_CONTAINER gesetzt ist
#   KC_ADMIN_REALM=master   KC_ADMIN_USER=admin   KC_ADMIN_PASSWORD=admin
#   KC_CONTAINER=""                   # falls gesetzt: kcadm.sh via `docker exec`
#                                     # in diesen Container statt lokalem kcadm.sh
#
#   # Medien/Bundle-Volume
#   MEDIA_BACKEND=docker-volume       # docker-volume | k8s-pvc | skip
#   MEDIA_OLD_VOLUME=ring3-fiknow-data
#   MEDIA_NEW_VOLUME=ring3-finknow-data
#
# Voraussetzungen: bash, docker, jq, curl. Wenn PG_CONTAINER/KC_CONTAINER
# NICHT gesetzt sind, werden zusaetzlich lokale Binaries `psql` bzw.
# `kcadm.sh` auf dem PATH benoetigt.
# ==============================================================================

set -euo pipefail

# ---- Defaults ----------------------------------------------------------------
OLD_SLUG="${OLD_SLUG:-fiknow}"
NEW_SLUG="${NEW_SLUG:-finknow}"

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-55440}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"
PGADMINDB="${PGADMINDB:-postgres}"
PG_CONTAINER="${PG_CONTAINER:-}"

KC_URL="${KC_URL:-http://localhost:8085}"
KC_INTERNAL_URL="${KC_INTERNAL_URL:-}"
KC_ADMIN_REALM="${KC_ADMIN_REALM:-master}"
KC_ADMIN_USER="${KC_ADMIN_USER:-admin}"
KC_ADMIN_PASSWORD="${KC_ADMIN_PASSWORD:-admin}"
KC_CONTAINER="${KC_CONTAINER:-}"

MEDIA_BACKEND="${MEDIA_BACKEND:-docker-volume}"
MEDIA_OLD_VOLUME="${MEDIA_OLD_VOLUME:-ring3-fiknow-data}"
MEDIA_NEW_VOLUME="${MEDIA_NEW_VOLUME:-ring3-finknow-data}"

DRY_RUN=false
ASSUME_YES=false
SKIP_POSTGRES=false
SKIP_KEYCLOAK=false
SKIP_MEDIA=false

# ---- Logging / Guards ---------------------------------------------------------
log()  { printf '[migrate-finknow] %s\n' "$*" >&2; }
warn() { printf '[migrate-finknow][WARN] %s\n' "$*" >&2; }
die()  { printf '[migrate-finknow][FEHLER] %s\n' "$*" >&2; exit 1; }

confirm() {
  local prompt="$1"
  if $DRY_RUN; then
    log "(dry-run) wuerde fragen: ${prompt}"
    return 0
  fi
  if $ASSUME_YES; then
    log "(--yes) ueberspringe Rueckfrage: ${prompt}"
    return 0
  fi
  local ans
  read -r -p "[migrate-finknow] ${prompt} [y/N] " ans
  case "$ans" in
    y|Y|yes|YES) return 0 ;;
    *) die "Abgebrochen vom Benutzer." ;;
  esac
}

require_bin() {
  command -v "$1" >/dev/null 2>&1 || die "Benoetigtes Programm '$1' nicht gefunden auf PATH."
}

usage() {
  sed -n '2,70p' "$0" | sed 's/^# \{0,1\}//'
}

# ---- Arg-Parsing ---------------------------------------------------------------
parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run) DRY_RUN=true ;;
      --yes|-y) ASSUME_YES=true ;;
      --skip-postgres) SKIP_POSTGRES=true ;;
      --skip-keycloak) SKIP_KEYCLOAK=true ;;
      --skip-media) SKIP_MEDIA=true ;;
      -h|--help) usage; exit 0 ;;
      *) die "Unbekannte Option: $1 (siehe --help)" ;;
    esac
    shift
  done
}

# ---- Postgres ------------------------------------------------------------------
pg_psql() {
  # Verbindet IMMER gegen PGADMINDB, niemals gegen OLD_SLUG/NEW_SLUG selbst -
  # siehe Kopf-Kommentar ("current database cannot be renamed").
  if [[ -n "$PG_CONTAINER" ]]; then
    docker exec -e PGPASSWORD="${PGPASSWORD}" "${PG_CONTAINER}" \
      psql -U "${PGUSER}" -d "${PGADMINDB}" "$@"
  else
    PGPASSWORD="${PGPASSWORD}" psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGADMINDB}" "$@"
  fi
}

pg_db_exists() {
  local db="$1" val
  val=$(pg_psql -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'" 2>/dev/null | tr -d '[:space:]')
  [[ "$val" == "1" ]]
}

run_psql_admin() {
  local sql="$1"
  log "+ psql (-d ${PGADMINDB}) -c \"${sql}\""
  if ! $DRY_RUN; then
    pg_psql -c "${sql}"
  fi
}

rename_postgres_db() {
  log "== Postgres: Datenbank '${OLD_SLUG}' -> '${NEW_SLUG}' (Host ${PGHOST}:${PGPORT}) =="

  if pg_db_exists "${NEW_SLUG}"; then
    log "Datenbank '${NEW_SLUG}' existiert bereits - Postgres-Rename wird uebersprungen (idempotent)."
    return 0
  fi

  if ! pg_db_exists "${OLD_SLUG}"; then
    die "Weder Datenbank '${OLD_SLUG}' noch '${NEW_SLUG}' gefunden. Abbruch."
  fi

  confirm "Postgres-DB '${OLD_SLUG}' -> '${NEW_SLUG}' umbenennen? Aktive Verbindungen zu '${OLD_SLUG}' werden dafuer zwangsgetrennt (App muss kurz stillstehen)."

  log "Trenne aktive Verbindungen zu '${OLD_SLUG}' (ausser dieser Session)..."
  run_psql_admin "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${OLD_SLUG}' AND pid <> pg_backend_pid();"

  log "Benenne Datenbank um..."
  run_psql_admin "ALTER DATABASE ${OLD_SLUG} RENAME TO ${NEW_SLUG};"

  if ! $DRY_RUN; then
    pg_db_exists "${NEW_SLUG}" || die "Verifikation fehlgeschlagen: '${NEW_SLUG}' nach Rename nicht gefunden."
    log "Verifiziert: Datenbank '${NEW_SLUG}' existiert."
  fi

  log "Postgres-Rename abgeschlossen."
}

# ---- Keycloak ------------------------------------------------------------------
kcadm_() {
  if [[ -n "$KC_CONTAINER" ]]; then
    docker exec "${KC_CONTAINER}" /opt/keycloak/bin/kcadm.sh "$@"
  else
    kcadm.sh "$@"
  fi
}

kc_login() {
  local server="${KC_INTERNAL_URL}"
  if [[ -z "$server" ]]; then
    if [[ -n "$KC_CONTAINER" ]]; then
      server="http://localhost:8080"
    else
      server="$KC_URL"
    fi
  fi
  kcadm_ config credentials --server "$server" --realm "${KC_ADMIN_REALM}" \
    --user "${KC_ADMIN_USER}" --password "${KC_ADMIN_PASSWORD}" >/dev/null
}

kc_realm_exists() {
  kcadm_ get "realms/$1" --fields realm >/dev/null 2>&1
}

kc_role_exists() {
  local role="$1" realm="$2"
  kcadm_ get "roles/${role}" -r "${realm}" --fields name >/dev/null 2>&1
}

kc_group_id_by_name() {
  local name="$1" realm="$2"
  kcadm_ get groups -r "${realm}" 2>/dev/null | jq -r --arg n "$name" '.[] | select(.name==$n) | .id' | head -1
}

run_kcadm() {
  log "+ kcadm $*"
  if ! $DRY_RUN; then
    kcadm_ "$@" >/dev/null
  fi
}

rename_kc_role() {
  local old="$1" new="$2" realm="$3"
  if kc_role_exists "${new}" "${realm}"; then
    log "Rolle '${new}' existiert bereits in Realm '${realm}' - ueberspringe (idempotent)."
    return 0
  fi
  if ! kc_role_exists "${old}" "${realm}"; then
    warn "Weder Rolle '${old}' noch '${new}' in Realm '${realm}' gefunden - ueberspringe."
    return 0
  fi
  confirm "Keycloak-Rolle '${old}' -> '${new}' umbenennen (in Realm '${realm}')?"
  run_kcadm update "roles/${old}" -r "${realm}" -s "name=${new}"
}

rename_kc_group() {
  local old="$1" new="$2" realm="$3" existing_new existing_old
  existing_new=$(kc_group_id_by_name "${new}" "${realm}")
  if [[ -n "$existing_new" ]]; then
    log "Gruppe '${new}' existiert bereits in Realm '${realm}' - ueberspringe (idempotent)."
    return 0
  fi
  existing_old=$(kc_group_id_by_name "${old}" "${realm}")
  if [[ -z "$existing_old" ]]; then
    warn "Weder Gruppe '${old}' noch '${new}' in Realm '${realm}' gefunden - ueberspringe."
    return 0
  fi
  confirm "Keycloak-Gruppe '${old}' -> '${new}' umbenennen (Subgruppen-Pfade folgen automatisch, in Realm '${realm}')?"
  run_kcadm update "groups/${existing_old}" -r "${realm}" -s "name=${new}"
}

to_upper() { printf '%s' "$1" | tr '[:lower:]' '[:upper:]'; }

rename_keycloak() {
  log "== Keycloak: Realm/Rollen/Gruppen '${OLD_SLUG}' -> '${NEW_SLUG}' =="
  kc_login

  if kc_realm_exists "${NEW_SLUG}"; then
    log "Realm '${NEW_SLUG}' existiert bereits - Realm-Rename wird uebersprungen (idempotent)."
  else
    if ! kc_realm_exists "${OLD_SLUG}"; then
      die "Weder Realm '${OLD_SLUG}' noch '${NEW_SLUG}' gefunden. Abbruch."
    fi
    confirm "Keycloak-Realm '${OLD_SLUG}' -> '${NEW_SLUG}' umbenennen? Issuer-Pfad wechselt SOFORT (alter Pfad ab diesem Moment 404) - App-Config muss im selben Fenster nachziehen."
    log "Benenne Realm um..."
    run_kcadm update "realms/${OLD_SLUG}" -s "realm=${NEW_SLUG}"
  fi

  # Nach einem ECHTEN Rename existiert NEW_SLUG bereits (s.o.); im --dry-run
  # wurde nichts ausgefuehrt, dann arbeiten wir zur akkuraten Vorschau
  # weiterhin gegen den (noch existierenden) alten Realm-Namen.
  local realm
  if kc_realm_exists "${NEW_SLUG}"; then
    realm="${NEW_SLUG}"
  else
    realm="${OLD_SLUG}"
  fi

  rename_kc_role "${OLD_SLUG}-curator" "${NEW_SLUG}-curator" "${realm}"
  rename_kc_role "${OLD_SLUG}-admin" "${NEW_SLUG}-admin" "${realm}"
  # Gotcha (verifiziert gegen Keycloak 26): die beim Realm-Anlegen
  # autogenerierte Composite-Rolle "default-roles-<realm>" wird vom
  # Realm-Rename NICHT automatisch mit umbenannt (Keycloak referenziert sie
  # intern per ID -> funktional unkritisch, aber fuer Konsistenz/Hygiene
  # sollte sie manuell nachgezogen werden).
  rename_kc_role "default-roles-${OLD_SLUG}" "default-roles-${NEW_SLUG}" "${realm}"

  rename_kc_group "$(to_upper "${OLD_SLUG}")" "$(to_upper "${NEW_SLUG}")" "${realm}"

  if ! $DRY_RUN; then
    local discovery_url="${KC_URL}/realms/${NEW_SLUG}/.well-known/openid-configuration"
    log "Verifiziere Issuer via Discovery-Dokument (${discovery_url})..."
    local discovery_json issuer
    if ! discovery_json=$(curl -sf "${discovery_url}"); then
      die "Discovery-Dokument unter '${discovery_url}' nicht erreichbar (KC_URL falsch/nicht vom Host aus erreichbar?). Realm/Rollen/Gruppen wurden bereits umbenannt - nur die Verifikation ist fehlgeschlagen, bitte manuell mit 'curl ${discovery_url}' pruefen."
    fi
    issuer=$(printf '%s' "${discovery_json}" | jq -r '.issuer // empty')
    [[ "$issuer" == *"/realms/${NEW_SLUG}" ]] || die "Issuer '${issuer:-<leer>}' zeigt nicht auf '/realms/${NEW_SLUG}' - pruefen."
    log "Discovery-Issuer OK: ${issuer}"
  fi

  log "Keycloak-Rename abgeschlossen."
}

# ---- Medien/Bundle-Volume --------------------------------------------------------
migrate_media_volume() {
  log "== Medien/Bundle-Volume: '${MEDIA_OLD_VOLUME}' -> '${MEDIA_NEW_VOLUME}' (Backend: ${MEDIA_BACKEND}) =="

  case "${MEDIA_BACKEND}" in
    skip)
      log "MEDIA_BACKEND=skip - ueberspringe Medien-Migration bewusst (z. B. weil separat per K8s-Job erledigt)."
      return 0
      ;;
    k8s-pvc)
      # ---------------------------------------------------------------------
      # K8s-PVC-AEQUIVALENT (bewusst NICHT automatisch ausgefuehrt):
      #
      # PVC-Namen sind immutable -> kein In-Place-Rename moeglich. Reihenfolge:
      #
      #   1. Neuen PVC anlegen (gleiche StorageClass, ausreichend Groesse):
      #        kubectl apply -f - <<'YAML'
      #        apiVersion: v1
      #        kind: PersistentVolumeClaim
      #        metadata:
      #          name: finknow-data
      #        spec:
      #          accessModes: ["ReadWriteMany"]
      #          storageClassName: ibmc-vpc-file-fiknow-1001
      #          resources:
      #            requests:
      #              storage: <gleiche Groesse wie fiknow-data>
      #        YAML
      #
      #   2. Copy-Job (App gestoppt oder Quelle read-only waehrend der Kopie):
      #        kubectl apply -f - <<'YAML'
      #        apiVersion: batch/v1
      #        kind: Job
      #        metadata:
      #          name: finknow-data-copy
      #        spec:
      #          template:
      #            spec:
      #              restartPolicy: Never
      #              containers:
      #                - name: copy
      #                  image: alpine:3
      #                  command: ["sh", "-c", "cp -a /from/. /to/ && echo done"]
      #                  volumeMounts:
      #                    - {name: from, mountPath: /from}
      #                    - {name: to, mountPath: /to}
      #              volumes:
      #                - name: from
      #                  persistentVolumeClaim: {claimName: fiknow-data}
      #                - name: to
      #                  persistentVolumeClaim: {claimName: finknow-data}
      #        YAML
      #
      #   3. Verifikation: Job-Logs pruefen + Dateiliste/Checksummen auf
      #      beiden PVCs vergleichen (Debug-Pod mit beiden Mounts,
      #      `find . -type f | sort | xargs sha256sum` -- exakt das hier
      #      lokal getestete Docker-Volume-Vorgehen, nur mit PVC statt Volume).
      #
      #   4. Helm-Values (persistence.existingClaim o.ae.) auf 'finknow-data'
      #      umstellen, Deployment neu ausrollen.
      #
      #   5. Alten PVC 'fiknow-data' erst nach Bewaehrungsphase loeschen
      #      (siehe RUNBOOK.md, Abschnitt Rollback/Nachlauf).
      # ---------------------------------------------------------------------
      log "MEDIA_BACKEND=k8s-pvc: siehe Kommentarblock in dieser Funktion bzw. RUNBOOK.md fuer die manuelle K8s-Prozedur. Dieses Script fuehrt dafuer nichts automatisch aus."
      return 0
      ;;
    docker-volume) ;;
    *)
      die "Unbekannter MEDIA_BACKEND='${MEDIA_BACKEND}' (erwartet: docker-volume|k8s-pvc|skip)"
      ;;
  esac

  if docker volume inspect "${MEDIA_NEW_VOLUME}" >/dev/null 2>&1; then
    local file_count
    file_count=$(docker run --rm -v "${MEDIA_NEW_VOLUME}:/data" alpine sh -c "find /data -type f | wc -l" | tr -d '[:space:]')
    if [[ "${file_count:-0}" -gt 0 ]]; then
      log "Ziel-Volume '${MEDIA_NEW_VOLUME}' existiert bereits und enthaelt ${file_count} Datei(en) - ueberspringe (idempotent)."
      return 0
    fi
  fi

  if ! docker volume inspect "${MEDIA_OLD_VOLUME}" >/dev/null 2>&1; then
    die "Quell-Volume '${MEDIA_OLD_VOLUME}' nicht gefunden - Abbruch."
  fi

  confirm "Medien-Volume '${MEDIA_OLD_VOLUME}' -> '${MEDIA_NEW_VOLUME}' kopieren? Quelle sollte waehrend der Kopie nicht mehr beschrieben werden."

  log "Lege Ziel-Volume an (falls noch nicht vorhanden)..."
  if ! $DRY_RUN; then
    docker volume create "${MEDIA_NEW_VOLUME}" >/dev/null
  else
    log "(dry-run) docker volume create ${MEDIA_NEW_VOLUME}"
  fi

  log "Kopiere Inhalt (cp -a, erhaelt Rechte/Zeitstempel)..."
  if ! $DRY_RUN; then
    docker run --rm -v "${MEDIA_OLD_VOLUME}:/from" -v "${MEDIA_NEW_VOLUME}:/to" alpine sh -c 'cp -a /from/. /to/'
  else
    log "(dry-run) docker run --rm -v ${MEDIA_OLD_VOLUME}:/from -v ${MEDIA_NEW_VOLUME}:/to alpine sh -c 'cp -a /from/. /to/'"
  fi

  if ! $DRY_RUN; then
    log "Verifiziere per Checksumme..."
    local sum_old sum_new
    sum_old=$(docker run --rm -v "${MEDIA_OLD_VOLUME}:/data" alpine sh -c "cd /data && find . -type f | sort | xargs sha256sum" 2>/dev/null)
    sum_new=$(docker run --rm -v "${MEDIA_NEW_VOLUME}:/data" alpine sh -c "cd /data && find . -type f | sort | xargs sha256sum" 2>/dev/null)
    if [[ "$sum_old" == "$sum_new" ]]; then
      log "Checksummen identisch - Kopie verifiziert."
    else
      die "Checksummen weichen ab! Kopie NICHT verifiziert - manuell pruefen, Ziel-Volume nicht in Produktion nehmen."
    fi
  fi

  log "Medien-Volume-Migration abgeschlossen."
}

# ---- Main ------------------------------------------------------------------------
main() {
  parse_args "$@"

  # docker nur noetig fuer Container-Exec-Pfade (PG_CONTAINER/KC_CONTAINER)
  # oder das docker-volume-Media-Backend. Reiner Prod-Lauf (lokales psql/kcadm,
  # MEDIA_BACKEND=k8s-pvc|skip) braucht kein docker.
  if [[ -n "$PG_CONTAINER" || -n "$KC_CONTAINER" ]] \
     || { ! $SKIP_MEDIA && [[ "$MEDIA_BACKEND" == "docker-volume" ]]; }; then
    require_bin docker
  fi
  if ! $SKIP_POSTGRES; then
    [[ -n "$PG_CONTAINER" ]] || require_bin psql
  fi
  if ! $SKIP_KEYCLOAK; then
    require_bin jq    # Gruppen-Lookup + Discovery-Verifikation
    require_bin curl  # Discovery-Verifikation
    [[ -n "$KC_CONTAINER" ]] || require_bin kcadm.sh
  fi

  log "Ring3-Rename '${OLD_SLUG}' -> '${NEW_SLUG}' (dry-run=${DRY_RUN}, yes=${ASSUME_YES})"

  if ! $SKIP_POSTGRES; then rename_postgres_db; else log "SKIP: Postgres (--skip-postgres)"; fi
  if ! $SKIP_KEYCLOAK; then rename_keycloak; else log "SKIP: Keycloak (--skip-keycloak)"; fi
  if ! $SKIP_MEDIA; then migrate_media_volume; else log "SKIP: Medien-Volume (--skip-media)"; fi

  log "Ring3-Rename durchgelaufen."
}

main "$@"
