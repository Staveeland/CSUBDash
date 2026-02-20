import 'server-only'

type PDFDocumentCtor = new (options?: PDFKit.PDFDocumentOptions) => PDFKit.PDFDocument
let cachedCtor: PDFDocumentCtor | null = null

async function getCtor(): Promise<PDFDocumentCtor> {
  if (cachedCtor) return cachedCtor
  try {
    const s = await import('pdfkit/js/pdfkit.standalone.js')
    cachedCtor = (s.default ?? s) as unknown as PDFDocumentCtor
  } catch {
    const n = await import('pdfkit')
    cachedCtor = (n.default ?? n) as PDFDocumentCtor
  }
  return cachedCtor
}

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#0B1A16', header: '#0E2620', card: '#112E26',
  accent: '#4DB89E', gold: '#E4A010', white: '#F0F7F4',
  text: '#D5E8E2', muted: '#7FA89E', line: '#1E3F36',
  tblHead: '#1A3D34', tblOdd: '#112E26', tblEven: '#0F2822',
}

type PdfInput = {
  title: string; subtitle: string; requestText: string
  markdown: string; generatedAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pw(d: PDFKit.PDFDocument) { return d.page.width - d.page.margins.left - d.page.margins.right }
function ml(d: PDFKit.PDFDocument) { return d.page.margins.left }
function bot(d: PDFKit.PDFDocument) { return d.page.height - d.page.margins.bottom }
function ensure(d: PDFKit.PDFDocument, h: number) { if (d.y + h > bot(d)) d.addPage() }
function drawBg(d: PDFKit.PDFDocument) {
  d.rect(0, 0, d.page.width, d.page.height).fillColor(C.bg).fill()
  // Top accent bar
  d.rect(0, 0, d.page.width, 3).fillColor(C.accent).fill()
  // Bottom accent bar
  d.rect(0, d.page.height - 3, d.page.width, 3).fillColor(C.accent).fill()
  d.fillColor(C.text)
}

function strip(t: string): string {
  return t
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
}

/** Remove follow-up questions from report markdown */
function stripFollowUps(md: string): string {
  const lines = md.split('\n')
  const cleaned: string[] = []
  let hitFollowUps = false
  
  for (const line of lines) {
    const t = line.trim()
    // Detect follow-up section
    if (/^(#{1,3}\s*)?(Forslag|Oppfølging|Follow-up|Anbefalt neste|Neste steg)/i.test(t)) {
      hitFollowUps = true
      continue
    }
    // Skip lines starting with "Vil du", "Ønsker du", "Want me", "Would you"
    if (/^[-*•]?\s*(Vil du|Ønsker du|Trenger du|Want me|Would you|Skal jeg)/i.test(t)) {
      continue
    }
    // If we hit follow-ups section, skip remaining content
    if (hitFollowUps && t.length > 0 && !t.startsWith('#')) continue
    if (hitFollowUps && t.startsWith('#')) hitFollowUps = false
    
    cleaned.push(line)
  }
  
  return cleaned.join('\n').replace(/\n{4,}/g, '\n\n\n').trimEnd()
}

// ─── Parse table ──────────────────────────────────────────────────────────────
type Table = { headers: string[]; rows: string[][] }

function parseTable(lines: string[]): Table | null {
  if (lines.length < 2) return null
  const h = lines[0]
  if (!h.includes('|')) return null
  const sep = lines[1]
  if (!/^[\s|:-]+$/.test(sep)) return null

  const parse = (l: string) => l.split('|').map(c => strip(c)).filter((_, i, a) => {
    // Remove empty first/last from leading/trailing pipes
    if (i === 0 && !a[0]) return false
    if (i === a.length - 1 && !a[a.length - 1]) return false
    return true
  })

  return {
    headers: parse(h),
    rows: lines.slice(2).filter(l => l.includes('|')).map(parse),
  }
}

// ─── Header ───────────────────────────────────────────────────────────────────
function writeHeader(d: PDFKit.PDFDocument, inp: PdfInput) {
  const x = ml(d), w = pw(d)

  // Header card
  d.save().roundedRect(x, 24, w, 88, 6).fillColor(C.header).fill().restore()

  d.fillColor(C.accent).font('Helvetica-Bold').fontSize(8)
    .text('CSUB AI REPORT', x + 18, 36, { characterSpacing: 1.5 })

  d.fillColor(C.white).font('Helvetica-Bold').fontSize(17)
    .text(inp.title, x + 18, 52, { width: w - 36, lineGap: 1 })

  d.fillColor(C.muted).font('Helvetica').fontSize(8.5)
    .text(`${inp.subtitle}  ·  ${inp.generatedAt}`, x + 18, 96)

  // Request box
  d.save().roundedRect(x, 122, w, 32, 4).fillColor('#0D231D').fill().restore()
  d.rect(x, 122, 3, 32).fillColor(C.gold).fill()

  d.fillColor(C.gold).font('Helvetica-Bold').fontSize(7)
    .text('FORESPØRSEL', x + 14, 128, { characterSpacing: 1 })
  d.fillColor(C.text).font('Helvetica').fontSize(9)
    .text(inp.requestText, x + 14, 138, { width: w - 28 })

  d.y = 168
}

// ─── Table rendering ──────────────────────────────────────────────────────────
function writeTable(d: PDFKit.PDFDocument, tbl: Table) {
  const x = ml(d), totalW = pw(d)
  const cols = tbl.headers.length
  if (cols === 0) return

  // Calculate column widths based on content
  const colWidths: number[] = []
  const allRows = [tbl.headers, ...tbl.rows]
  for (let c = 0; c < cols; c++) {
    let maxLen = 0
    for (const row of allRows) {
      const len = (row[c] ?? '').length
      if (len > maxLen) maxLen = len
    }
    colWidths.push(Math.max(maxLen, 4))
  }
  const totalLen = colWidths.reduce((a, b) => a + b, 0)
  const widths = colWidths.map(w => (w / totalLen) * totalW)

  const headerH = 20
  const rowH = 18

  ensure(d, headerH + Math.min(tbl.rows.length, 5) * rowH + 8)
  d.moveDown(0.3)

  // Header
  let y = d.y
  d.save().roundedRect(x, y, totalW, headerH, 2).fillColor(C.tblHead).fill().restore()

  let cx = x
  for (let c = 0; c < cols; c++) {
    d.fillColor(C.gold).font('Helvetica-Bold').fontSize(7)
      .text(tbl.headers[c].toUpperCase(), cx + 5, y + 5, { width: widths[c] - 10, lineGap: 0 })
    cx += widths[c]
  }

  y += headerH

  // Rows
  for (let r = 0; r < tbl.rows.length; r++) {
    if (y + rowH > bot(d)) {
      d.addPage()
      y = d.y
    }

    const bg = r % 2 === 0 ? C.tblEven : C.tblOdd
    d.save().rect(x, y, totalW, rowH).fillColor(bg).fill().restore()

    cx = x
    for (let c = 0; c < cols; c++) {
      const val = tbl.rows[r]?.[c] ?? ''
      d.fillColor(C.text).font('Helvetica').fontSize(8)
        .text(val, cx + 5, y + 5, { width: widths[c] - 10, lineGap: 0 })
      cx += widths[c]
    }
    y += rowH
  }

  d.y = y + 6
}

// ─── Content rendering ────────────────────────────────────────────────────────
function writeMarkdown(d: PDFKit.PDFDocument, markdown: string) {
  const cleaned = stripFollowUps(markdown)
  const lines = cleaned.split('\n')
  let inCode = false
  let tableBuf: string[] = []

  const flushTable = () => {
    if (tableBuf.length >= 2) {
      const tbl = parseTable(tableBuf)
      if (tbl && tbl.rows.length > 0) writeTable(d, tbl)
    }
    tableBuf = []
  }

  for (const raw of lines) {
    const t = raw.trim()

    // Code blocks — skip
    if (t.startsWith('```')) { inCode = !inCode; continue }
    if (inCode) continue

    // Table lines
    if (t.includes('|') && (t.startsWith('|') || /\w\s*\|/.test(t))) {
      tableBuf.push(t)
      continue
    }
    if (tableBuf.length > 0) flushTable()

    // HR
    if (/^[-*]{3,}$/.test(t)) {
      ensure(d, 12)
      d.moveDown(0.3)
      d.moveTo(ml(d), d.y).lineTo(ml(d) + pw(d), d.y).strokeColor(C.line).lineWidth(0.5).stroke()
      d.moveDown(0.3)
      continue
    }

    // Empty line
    if (!t) { d.moveDown(0.25); continue }

    // H1
    if (t.startsWith('# ')) {
      ensure(d, 32)
      d.moveDown(0.8)
      d.fillColor(C.gold).font('Helvetica-Bold').fontSize(15).text(strip(t.slice(2)), { lineGap: 2 })
      // Underline
      const ly = d.y + 1
      d.moveTo(ml(d), ly).lineTo(ml(d) + 70, ly).strokeColor(C.gold).lineWidth(1.5).stroke()
      d.moveDown(0.3)
      continue
    }

    // H2
    if (t.startsWith('## ')) {
      ensure(d, 26)
      d.moveDown(0.6)
      d.fillColor(C.accent).font('Helvetica-Bold').fontSize(12.5).text(strip(t.slice(3)), { lineGap: 2 })
      d.moveDown(0.15)
      continue
    }

    // H3
    if (t.startsWith('### ')) {
      ensure(d, 22)
      d.moveDown(0.4)
      d.fillColor(C.white).font('Helvetica-Bold').fontSize(11).text(strip(t.slice(4)), { lineGap: 1 })
      d.moveDown(0.1)
      continue
    }

    // Numbered heading like "1) Title" or "2. Title"  
    if (/^\d+[.)]\s+[A-ZÆØÅ]/.test(t)) {
      ensure(d, 26)
      d.moveDown(0.6)
      d.fillColor(C.accent).font('Helvetica-Bold').fontSize(12.5).text(strip(t), { lineGap: 2 })
      d.moveDown(0.15)
      continue
    }

    // Block quote
    if (t.startsWith('> ') || t.startsWith('&gt; ')) {
      ensure(d, 18)
      const qx = ml(d) + 8
      d.rect(ml(d), d.y, 2, 14).fillColor(C.accent).fill()
      d.fillColor(C.muted).font('Helvetica').fontSize(9.5)
        .text(strip(t.replace(/^>\s*/, '').replace(/^&gt;\s*/, '')), qx + 6, d.y - 14, { width: pw(d) - 20, lineGap: 2 })
      d.moveDown(0.1)
      continue
    }

    // Bullet
    if (/^[-*•]\s+/.test(t)) {
      ensure(d, 16)
      const text = strip(t.replace(/^[-*•]\s+/, ''))
      const bx = ml(d)
      d.fillColor(C.accent).font('Helvetica-Bold').fontSize(10).text('›', bx + 4, d.y)
      const savedY = d.y
      d.fillColor(C.text).font('Helvetica').fontSize(9.5)
        .text(text, bx + 16, savedY - 12.5, { width: pw(d) - 20, lineGap: 2 })
      continue
    }

    // Numbered list
    if (/^\d+[.)]\s+[a-zæøå]/.test(t)) {
      ensure(d, 16)
      const text = strip(t.replace(/^\d+[.)]\s+/, ''))
      const num = t.match(/^(\d+)/)?.[1] ?? '·'
      const bx = ml(d)
      d.fillColor(C.gold).font('Helvetica-Bold').fontSize(9).text(`${num}.`, bx + 2, d.y)
      const savedY = d.y
      d.fillColor(C.text).font('Helvetica').fontSize(9.5)
        .text(text, bx + 16, savedY - 12.5, { width: pw(d) - 20, lineGap: 2 })
      continue
    }

    // Paragraph
    ensure(d, 14)
    d.fillColor(C.text).font('Helvetica').fontSize(9.5)
      .text(strip(t), { width: pw(d), lineGap: 2.5 })
  }

  if (tableBuf.length > 0) flushTable()
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function writeFooter(d: PDFKit.PDFDocument) {
  const n = d.bufferedPageRange().count
  for (let p = 0; p < n; p++) {
    d.switchToPage(p)
    d.fillColor(C.muted).font('Helvetica').fontSize(7)
      .text(`CSUB Sales Intelligence  ·  AI-Generated Report  ·  Side ${p + 1} / ${n}`,
        ml(d), d.page.height - 24, { align: 'center', width: pw(d) })
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────
export async function buildReportPdfBuffer(input: PdfInput): Promise<Buffer> {
  const PDFDocument = await getCtor()
  const d = new PDFDocument({
    size: 'A4',
    margins: { top: 36, right: 40, bottom: 36, left: 40 },
    info: { Title: input.title, Author: 'CSUB AI Agent' },
    bufferPages: true,
  })

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    d.on('data', (c: Buffer) => chunks.push(c))
    d.on('error', reject)
    d.on('pageAdded', () => drawBg(d))
    d.on('end', () => resolve(Buffer.concat(chunks)))

    drawBg(d)
    writeHeader(d, input)
    writeMarkdown(d, input.markdown)
    writeFooter(d)
    d.end()
  })
}
