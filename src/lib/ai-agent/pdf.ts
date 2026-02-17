type PDFDocumentCtor = new (options?: PDFKit.PDFDocumentOptions) => PDFKit.PDFDocument

let cachedPdfDocumentCtor: PDFDocumentCtor | null = null

async function getPdfDocumentCtor(): Promise<PDFDocumentCtor> {
  if (cachedPdfDocumentCtor) return cachedPdfDocumentCtor
  try {
    const standalone = await import('pdfkit/js/pdfkit.standalone.js')
    const ctor = (standalone.default ?? standalone) as unknown as PDFDocumentCtor
    cachedPdfDocumentCtor = ctor
    return ctor
  } catch {
    const nodeBuild = await import('pdfkit')
    const ctor = (nodeBuild.default ?? nodeBuild) as PDFDocumentCtor
    cachedPdfDocumentCtor = ctor
    return ctor
  }
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  bg: '#0B1A16',
  headerBg: '#0E2620',
  cardBg: '#112E26',
  accent: '#4DB89E',
  accentDark: '#2B6E60',
  gold: '#C9A84C',
  goldSoft: '#A8883A',
  white: '#F0F7F4',
  text: '#D5E8E2',
  muted: '#7FA89E',
  divider: '#1E3F36',
  tableBg: '#0D231D',
  tableRow: '#112E26',
  tableRowAlt: '#0F2822',
  tableHeader: '#1A3D34',
}

type BuildReportPdfInput = {
  title: string
  subtitle: string
  requestText: string
  markdown: string
  generatedAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function drawBg(doc: PDFKit.PDFDocument): void {
  doc.rect(0, 0, doc.page.width, doc.page.height).fillColor(C.bg).fill()
  doc.fillColor(C.text)
}

function pw(doc: PDFKit.PDFDocument): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right
}

function ml(doc: PDFKit.PDFDocument): number {
  return doc.page.margins.left
}

function ensureSpace(doc: PDFKit.PDFDocument, h: number): void {
  if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage()
}

/** Strip inline markdown bold/italic/code */
function cleanInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
}

/** Check if line is bold (wrapped in **) */
function isBold(text: string): boolean {
  const t = text.trim()
  return t.startsWith('**') && t.endsWith('**')
}

/** Parse a markdown table into headers + rows */
function parseTable(lines: string[]): { headers: string[]; rows: string[][] } | null {
  if (lines.length < 2) return null
  const headerLine = lines[0]
  const sepLine = lines[1]
  if (!headerLine.includes('|') || !sepLine.match(/^\|?[\s-:|]+\|?$/)) return null

  const parse = (line: string) =>
    line.split('|').map((c) => cleanInline(c.trim())).filter((c) => c.length > 0 || line.trim().startsWith('|'))
      .map(c => c.trim()).filter(Boolean)

  const headers = parse(headerLine)
  const rows = lines.slice(2).map(parse).filter((r) => r.length > 0)
  return { headers, rows }
}

// ─── PDF Sections ─────────────────────────────────────────────────────────────

function writeHeader(doc: PDFKit.PDFDocument, input: BuildReportPdfInput): void {
  const w = pw(doc)
  const x = ml(doc)

  // Top accent line
  doc.rect(0, 0, doc.page.width, 4).fillColor(C.accent).fill()

  // Header card
  const cardY = 30
  const cardH = 100
  doc.save()
  doc.roundedRect(x, cardY, w, cardH, 6).fillColor(C.headerBg).fill()
  doc.restore()

  // Label
  doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(9)
    .text('CSUB AI REPORT', x + 20, cardY + 16)

  // Title
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(18)
    .text(input.title, x + 20, cardY + 34, { width: w - 40, lineGap: 2 })

  // Subtitle + date
  doc.fillColor(C.muted).font('Helvetica').fontSize(9)
    .text(`${input.subtitle}  ·  ${input.generatedAt}`, x + 20, cardY + cardH - 22, { width: w - 40 })

  // Request box
  const reqY = cardY + cardH + 12
  doc.save()
  doc.roundedRect(x, reqY, w, 36, 4).fillColor(C.tableBg).fill()
  // Gold left stripe
  doc.rect(x, reqY, 3, 36).fillColor(C.gold).fill()
  doc.restore()

  doc.fillColor(C.gold).font('Helvetica-Bold').fontSize(8)
    .text('FORESPØRSEL', x + 14, reqY + 8)
  doc.fillColor(C.text).font('Helvetica').fontSize(9)
    .text(input.requestText, x + 14, reqY + 20, { width: w - 28, lineGap: 1 })

  doc.y = reqY + 48
}

function writeH1(doc: PDFKit.PDFDocument, text: string): void {
  ensureSpace(doc, 36)
  doc.moveDown(1.2)

  // Gold underline
  const x = ml(doc)
  doc.fillColor(C.gold).font('Helvetica-Bold').fontSize(16)
    .text(cleanInline(text), { lineGap: 2 })
  const lineY = doc.y + 2
  doc.moveTo(x, lineY).lineTo(x + 80, lineY).strokeColor(C.gold).lineWidth(2).stroke()
  doc.moveDown(0.4)
}

function writeH2(doc: PDFKit.PDFDocument, text: string): void {
  ensureSpace(doc, 30)
  doc.moveDown(0.9)
  doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(13)
    .text(cleanInline(text), { lineGap: 2 })
  doc.moveDown(0.2)
}

function writeH3(doc: PDFKit.PDFDocument, text: string): void {
  ensureSpace(doc, 24)
  doc.moveDown(0.6)
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(11)
    .text(cleanInline(text), { lineGap: 1 })
  doc.moveDown(0.15)
}

function writeParagraph(doc: PDFKit.PDFDocument, text: string): void {
  ensureSpace(doc, 20)
  const cleaned = cleanInline(text)
  if (!cleaned) return
  const bold = isBold(text.trim())
  doc.fillColor(bold ? C.white : C.text)
    .font(bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(10).text(cleaned, { lineGap: 3, width: pw(doc) })
}

function writeBullet(doc: PDFKit.PDFDocument, text: string): void {
  ensureSpace(doc, 18)
  const x = ml(doc)
  const cleaned = cleanInline(text)

  doc.fillColor(C.accent).font('Helvetica').fontSize(10)
    .text('›', x + 4, doc.y, { continued: false })

  doc.fillColor(C.text).font('Helvetica').fontSize(10)
    .text(cleaned, x + 18, doc.y - 14, { width: pw(doc) - 18, lineGap: 2 })
}

function writeDivider(doc: PDFKit.PDFDocument): void {
  ensureSpace(doc, 12)
  doc.moveDown(0.4)
  const x = ml(doc)
  doc.moveTo(x, doc.y).lineTo(x + pw(doc), doc.y)
    .strokeColor(C.divider).lineWidth(0.5).stroke()
  doc.moveDown(0.4)
}

function writeTable(doc: PDFKit.PDFDocument, table: { headers: string[]; rows: string[][] }): void {
  const x = ml(doc)
  const totalW = pw(doc)
  const cols = table.headers.length
  const colW = totalW / cols
  const rowH = 22
  const headerH = 24

  // Check if table fits, otherwise new page
  const neededH = headerH + table.rows.length * rowH + 10
  ensureSpace(doc, Math.min(neededH, 200))

  doc.moveDown(0.3)
  const startY = doc.y

  // Header row
  doc.save()
  doc.roundedRect(x, startY, totalW, headerH, 3).fillColor(C.tableHeader).fill()
  doc.restore()

  for (let i = 0; i < cols; i++) {
    doc.fillColor(C.gold).font('Helvetica-Bold').fontSize(8)
      .text(table.headers[i].toUpperCase(), x + i * colW + 6, startY + 7, {
        width: colW - 12,
        lineGap: 0,
      })
  }

  // Data rows
  let y = startY + headerH
  for (let r = 0; r < table.rows.length; r++) {
    if (y + rowH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
      y = doc.y
    }

    const bgColor = r % 2 === 0 ? C.tableRowAlt : C.tableRow
    doc.save()
    doc.rect(x, y, totalW, rowH).fillColor(bgColor).fill()
    doc.restore()

    for (let c = 0; c < cols; c++) {
      const val = table.rows[r]?.[c] ?? ''
      doc.fillColor(C.text).font('Helvetica').fontSize(8.5)
        .text(val, x + c * colW + 6, y + 6, { width: colW - 12, lineGap: 0 })
    }
    y += rowH
  }

  doc.y = y + 6
}

// ─── Markdown Renderer ────────────────────────────────────────────────────────

function writeMarkdown(doc: PDFKit.PDFDocument, markdown: string): void {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  let inCodeBlock = false
  let tableBuffer: string[] = []

  const flushTable = () => {
    if (tableBuffer.length >= 2) {
      const parsed = parseTable(tableBuffer)
      if (parsed) writeTable(doc, parsed)
    }
    tableBuffer = []
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const trimmed = raw.trim()

    // Code blocks — skip entirely (usually data noise)
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue

    // Table accumulation
    if (trimmed.includes('|') && (trimmed.startsWith('|') || trimmed.includes(' | '))) {
      // Skip separator-only lines in table detection
      if (trimmed.match(/^\|?[\s-:|]+\|?$/) && tableBuffer.length > 0) {
        tableBuffer.push(trimmed)
        continue
      }
      tableBuffer.push(trimmed)
      continue
    } else if (tableBuffer.length > 0) {
      flushTable()
    }

    // Horizontal rule
    if (trimmed.match(/^-{3,}$/) || trimmed.match(/^\*{3,}$/)) {
      writeDivider(doc)
      continue
    }

    // Empty line
    if (!trimmed) {
      doc.moveDown(0.35)
      continue
    }

    // Headings
    if (trimmed.startsWith('### ')) { writeH3(doc, trimmed.slice(4)); continue }
    if (trimmed.startsWith('## ')) { writeH2(doc, trimmed.slice(3)); continue }
    if (trimmed.startsWith('# ')) { writeH1(doc, trimmed.slice(2)); continue }

    // Numbered headings like "1) Oversikt" or "3. Title"
    if (trimmed.match(/^\d+[.)]\s+[A-ZÆØÅ]/)) {
      writeH2(doc, trimmed)
      continue
    }

    // Bullets
    if (/^[-*•›]\s+/.test(trimmed)) {
      writeBullet(doc, trimmed.replace(/^[-*•›]\s+/, ''))
      continue
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      writeBullet(doc, trimmed.replace(/^\d+\.\s+/, ''))
      continue
    }

    // Regular paragraph
    writeParagraph(doc, trimmed)
  }

  // Flush remaining table
  if (tableBuffer.length > 0) flushTable()
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function writeFooter(doc: PDFKit.PDFDocument): void {
  const pageCount = doc.bufferedPageRange().count
  for (let page = 0; page < pageCount; page++) {
    doc.switchToPage(page)
    const y = doc.page.height - 28

    // Bottom accent line
    doc.rect(0, doc.page.height - 3, doc.page.width, 3).fillColor(C.accent).fill()

    // Footer text
    doc.fillColor(C.muted).font('Helvetica').fontSize(7.5)
      .text(
        `CSUB Sales Intelligence  ·  AI-Generated Report  ·  Page ${page + 1} / ${pageCount}`,
        ml(doc), y,
        { align: 'center', width: pw(doc) }
      )
  }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function buildReportPdfBuffer(input: BuildReportPdfInput): Promise<Buffer> {
  const PDFDocument = await getPdfDocumentCtor()

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 36, right: 40, bottom: 40, left: 40 },
    info: {
      Title: input.title,
      Author: 'CSUB AI Agent',
      Subject: 'Subsea market intelligence report',
    },
    bufferPages: true,
  })

  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('error', (error) => reject(error))
    doc.on('pageAdded', () => drawBg(doc))
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    drawBg(doc)
    writeHeader(doc, input)
    writeMarkdown(doc, input.markdown)
    writeFooter(doc)
    doc.end()
  })
}
