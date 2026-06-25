/**
 * Dumpt den Body einer Lesson (per slug) in die Konsole — für Debug
 * von MDX-Compilation-Fehlern.
 *
 * Usage:
 *   dotenv -e .env.local -- tsx scripts/dump-lesson-body.ts <lesson-slug>
 */
import postgres from "postgres";

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: tsx scripts/dump-lesson-body.ts <lesson-slug>");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const rows = await sql<
  { id: number; title: string; slug: string; type: string; body: string | null }[]
>`select id, title, slug, type, body
   from payload.lessons
   where slug = ${slug}
   limit 5;`;

if (rows.length === 0) {
  console.log(`Keine Lesson mit slug='${slug}' gefunden.`);
} else {
  for (const r of rows) {
    console.log(`\n=== Lesson #${r.id} : ${r.title} (${r.type}) ===\n`);
    console.log(r.body ?? "(body is NULL)");
    console.log(`\n--- HEX-Sicht der ersten 200 Zeichen ---`);
    const head = (r.body ?? "").slice(0, 200);
    for (let i = 0; i < head.length; i++) {
      const ch = head[i];
      const code = head.charCodeAt(i);
      // Zeige nur "verdächtige" Zeichen explizit (Unicode > 127 oder Smart Quotes)
      if (code > 127) console.log(`  pos ${i}: '${ch}' = U+${code.toString(16).padStart(4, "0")}`);
    }
  }
}

await sql.end();
