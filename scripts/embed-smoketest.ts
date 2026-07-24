/**
 * Smoke-Test für den konfigurierten Embedding-Provider (ADR 0003).
 *
 * Prüft OHNE DB/Payload, ob der aktuell per Env gewählte Provider erreichbar
 * ist und Vektoren in der erwarteten Dimension liefert — bevor man einen
 * vollständigen Backfill (`POST /api/authoring/reindex`) fährt. Nützlich v. a.
 * nach dem Umstieg auf watsonx/granite (Provider + Key + Projekt + Region +
 * Modell-Freischaltung in einem Rutsch verifizieren).
 *
 * Nutzt genau denselben Code-Pfad wie Indexing/Retrieval (`getEmbeddingProvider`),
 * es wird also der reale Provider getestet, nicht ein Nachbau.
 *
 * Usage (Env je nach Provider setzen, siehe deploy/RUNBOOK.md §5a):
 *   # Voyage:
 *   VOYAGE_API_KEY=… npx tsx scripts/embed-smoketest.ts
 *   # watsonx / granite:
 *   EMBEDDING_PROVIDER=watsonx WATSONX_API_KEY=… WATSONX_PROJECT_ID=… \
 *     WATSONX_URL=https://eu-de.ml.cloud.ibm.com npx tsx scripts/embed-smoketest.ts
 *
 * Exit-Code: 0 = Provider erreichbar + Dimension stimmt, 1 = Fehler.
 */
import {
  EmbeddingError,
  getEmbeddingConfig,
  getEmbeddingProvider,
  isEmbeddingConfigured,
} from "@/lib/embeddings";

// Zwei kurze, bewusst DEUTSCHE Texte — deckt den Hauptnutzungsfall (deutsch-
// sprachige Kursinhalte, multilinguales Modell) mit ab.
const QUERY = "Was muss laut EU AI Act zur KI-Kompetenz nachgewiesen werden?";
const DOCUMENT =
  "Der EU AI Act verlangt einen rollenproportionalen Nachweis der KI-Kompetenz je Person.";

function norm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

async function main(): Promise<void> {
  if (!isEmbeddingConfigured()) {
    console.error(
      "✗ Kein Embedding-Provider konfiguriert. Env prüfen (VOYAGE_API_KEY bzw. WATSONX_API_KEY/WATSONX_PROJECT_ID/WATSONX_URL).",
    );
    process.exit(1);
  }

  const cfg = getEmbeddingConfig();
  console.log("▶ Embedding-Smoke-Test");
  console.log(`  Provider:   ${cfg.provider}`);
  console.log(`  Modell:     ${cfg.model}`);
  console.log(`  Endpoint:   ${cfg.baseUrl}`);
  if (cfg.projectId) console.log(`  Projekt:    ${cfg.projectId}`);
  console.log(`  Erwartete Dimension: ${cfg.dimensions}`);
  console.log("  (API-Key wird NICHT ausgegeben)\n");

  const provider = getEmbeddingProvider();

  const [queryVec] = await provider.embed([QUERY], "query");
  const [docVec] = await provider.embed([DOCUMENT], "document");

  const problems: string[] = [];
  if (queryVec?.length !== cfg.dimensions) {
    problems.push(
      `Query-Vektor Dimension ${queryVec?.length ?? 0}, erwartet ${cfg.dimensions}`,
    );
  }
  if (docVec?.length !== cfg.dimensions) {
    problems.push(
      `Dokument-Vektor Dimension ${docVec?.length ?? 0}, erwartet ${cfg.dimensions}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        provider: cfg.provider,
        model: cfg.model,
        dimensions: cfg.dimensions,
        queryVectorLength: queryVec?.length ?? 0,
        documentVectorLength: docVec?.length ?? 0,
        queryNorm: queryVec ? Number(norm(queryVec).toFixed(4)) : null,
        preview: queryVec?.slice(0, 4).map((x) => Number(x.toFixed(4))),
      },
      null,
      2,
    ),
  );

  if (problems.length > 0) {
    console.error(`\n✗ Dimension passt nicht:\n  - ${problems.join("\n  - ")}`);
    process.exit(1);
  }

  console.log(
    `\n✓ Provider "${cfg.provider}" erreichbar, Vektoren mit ${cfg.dimensions} Dimensionen — bereit für Backfill (POST /api/authoring/reindex).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    if (err instanceof EmbeddingError) {
      console.error(`\n✗ Embedding-Fehler [${err.code}]: ${err.message}`);
    } else {
      console.error("\n✗ Smoke-Test fehlgeschlagen:", err);
    }
    process.exit(1);
  });
