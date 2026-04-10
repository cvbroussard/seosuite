/**
 * PDF processing — extract page thumbnails as JPEG media assets.
 *
 * Flow:
 * 1. Upload PDF to R2
 * 2. Extract page count with pdf-lib
 * 3. Render each page as JPEG with pdf-to-img
 * 4. Upload each page thumbnail to R2
 * 5. Create a media_asset per page with source_pdf_url in metadata
 */
import { PDFDocument } from "pdf-lib";
import { sql } from "@/lib/db";
import { uploadBufferToR2 } from "@/lib/r2";
import { seoFilename } from "@/lib/seo-filename";

/**
 * Process a PDF: extract page thumbnails and create media assets.
 * The PDF itself stays on R2 as the source reference.
 * Returns the IDs of created thumbnail assets.
 */
export async function processPdf(
  pdfUrl: string,
  siteId: string,
  projectId: string | null,
  contextNote: string | null
): Promise<string[]> {
  // Fetch PDF
  const res = await fetch(pdfUrl, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status}`);
  const pdfBuffer = Buffer.from(await res.arrayBuffer());

  // Get page count
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();
  console.log(`PDF processing: ${pageCount} pages from ${pdfUrl}`);

  const assetIds: string[] = [];
  const date = new Date().toISOString().slice(0, 10);

  // Render each page as JPEG
  // pdf-to-img is ESM-only, dynamic import
  const { pdf } = await import("pdf-to-img");

  let pageNum = 0;
  for await (const image of await pdf(pdfBuffer, { scale: 2 })) {
    pageNum++;
    const imgBuffer = Buffer.from(image);

    // Upload thumbnail to R2
    const fname = seoFilename(
      contextNote ? `${contextNote} page ${pageNum}` : `document page ${pageNum}`,
      "png"
    );
    const key = `sites/${siteId}/${date}/${fname}`;
    const thumbnailUrl = await uploadBufferToR2(key, imgBuffer, "image/png");

    // Create media asset for this page
    const pageNote = contextNote
      ? `${contextNote} — page ${pageNum} of ${pageCount}`
      : `Document page ${pageNum} of ${pageCount}`;

    const metadata: Record<string, unknown> = {
      source_pdf_url: pdfUrl,
      pdf_page: pageNum,
      pdf_total_pages: pageCount,
    };

    if (projectId) {
      metadata.pending_project_id = projectId;
    }

    const [asset] = await sql`
      INSERT INTO media_assets (
        site_id, storage_url, media_type, context_note,
        source, triage_status, metadata
      )
      VALUES (
        ${siteId}, ${thumbnailUrl}, 'image',
        ${pageNote}, 'pdf', 'received',
        ${JSON.stringify(metadata)}
      )
      RETURNING id
    `;

    assetIds.push(asset.id as string);
  }

  console.log(`PDF processed: ${assetIds.length} page thumbnails created`);
  return assetIds;
}
