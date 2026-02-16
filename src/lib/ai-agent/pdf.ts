import PDFDocument from 'pdfkit'

const COLORS = {
  background: '#0A1714',
  panel: '#0E2620',
  accent: '#4DB89E',
  accentSoft: '#2B6E60',
  gold: '#C9A84C',
  text: '#E5F1ED',
  muted: '#8CA8A0',
}

type BuildReportPdfInput = {
  title: string
  subtitle: string
  requestText: string
  markdown: string
  generatedAt: string
}

function drawPageBackground(doc: PDFKit.PDFDocument): void {
  doc
    .rect(0, 0, doc.page.width, doc.page.height)
    .fillColor(COLORS.background)
    .fill()

  doc.fillColor(COLORS.text)
}

function parseMarkdownLines(markdown: string): string[] {
  return markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
}

function ensureSpace(doc: PDFKit.PDFDocument, minimumHeight: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom
  if (doc.y + minimumHeight > bottom) {
    doc.addPage()
  }
}

function writeHeader(doc: PDFKit.PDFDocument, input: BuildReportPdfInput): void {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right

  doc
    .roundedRect(doc.page.margins.left, doc.y, pageWidth, 112, 8)
    .fillColor(COLORS.panel)
    .fill()

  doc
    .fillColor(COLORS.accent)
    .font('Helvetica-Bold')
    .fontSize(11)
    .text('CSUB AI REPORT', doc.page.margins.left + 18, 56, { characterSpacing: 1.4 })

  doc
    .fillColor(COLORS.text)
    .font('Helvetica-Bold')
    .fontSize(20)
    .text(input.title, doc.page.margins.left + 18, 76, {
      width: pageWidth - 36,
      lineGap: 3,
    })

  doc
    .fillColor(COLORS.muted)
    .font('Helvetica')
    .fontSize(10)
    .text(`${input.subtitle} | Generated ${input.generatedAt}`, doc.page.margins.left + 18, 108, {
      width: pageWidth - 36,
    })

  doc
    .roundedRect(doc.page.margins.left, 176, pageWidth, 52, 8)
    .fillColor(COLORS.background)
    .fill()

  doc
    .fillColor(COLORS.gold)
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('REQUEST', doc.page.margins.left + 14, 188)

  doc
    .fillColor(COLORS.text)
    .font('Helvetica')
    .fontSize(10)
    .text(input.requestText, doc.page.margins.left + 74, 188, {
      width: pageWidth - 88,
      lineGap: 1,
    })

  doc.y = 248
}

function writeHeading(doc: PDFKit.PDFDocument, level: 1 | 2 | 3, text: string): void {
  const sizes: Record<1 | 2 | 3, number> = { 1: 18, 2: 14, 3: 12 }
  const color = level === 1 ? COLORS.gold : COLORS.accent

  ensureSpace(doc, 28)
  doc.moveDown(level === 1 ? 1 : 0.7)
  doc
    .fillColor(color)
    .font('Helvetica-Bold')
    .fontSize(sizes[level])
    .text(text, {
      lineGap: 2,
    })
}

function writeParagraph(doc: PDFKit.PDFDocument, text: string): void {
  ensureSpace(doc, 24)
  doc
    .fillColor(COLORS.text)
    .font('Helvetica')
    .fontSize(10.5)
    .text(text, {
      lineGap: 3,
    })
}

function writeBullet(doc: PDFKit.PDFDocument, text: string): void {
  ensureSpace(doc, 20)
  const bulletX = doc.page.margins.left + 6
  const textX = doc.page.margins.left + 16
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right - 16

  doc
    .fillColor(COLORS.accent)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('•', bulletX, doc.y + 1)

  doc
    .fillColor(COLORS.text)
    .font('Helvetica')
    .fontSize(10.5)
    .text(text, textX, doc.y - 2, {
      width,
      lineGap: 2,
    })
}

function writeCodeLine(doc: PDFKit.PDFDocument, text: string): void {
  ensureSpace(doc, 18)
  doc
    .fillColor('#D9E8E3')
    .font('Courier')
    .fontSize(9)
    .text(text, {
      lineGap: 1,
    })
}

function writeMarkdown(doc: PDFKit.PDFDocument, markdown: string): void {
  const lines = parseMarkdownLines(markdown)
  let inCodeBlock = false

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      if (inCodeBlock) {
        ensureSpace(doc, 18)
        doc
          .fillColor(COLORS.muted)
          .font('Helvetica-Bold')
          .fontSize(9)
          .text('DATA BLOCK', { lineGap: 1 })
      }
      continue
    }

    if (!line) {
      doc.moveDown(0.45)
      continue
    }

    if (inCodeBlock || line.startsWith('|')) {
      writeCodeLine(doc, line)
      continue
    }

    if (line.startsWith('### ')) {
      writeHeading(doc, 3, line.replace(/^###\s+/, '').trim())
      continue
    }

    if (line.startsWith('## ')) {
      writeHeading(doc, 2, line.replace(/^##\s+/, '').trim())
      continue
    }

    if (line.startsWith('# ')) {
      writeHeading(doc, 1, line.replace(/^#\s+/, '').trim())
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      writeBullet(doc, line.replace(/^[-*]\s+/, '').trim())
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      writeBullet(doc, line.replace(/^\d+\.\s+/, '').trim())
      continue
    }

    writeParagraph(doc, line)
  }
}

function writeFooter(doc: PDFKit.PDFDocument): void {
  const pageCount = doc.bufferedPageRange().count

  for (let page = 0; page < pageCount; page += 1) {
    doc.switchToPage(page)
    const y = doc.page.height - doc.page.margins.bottom + 10
    doc
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(8)
      .text(`CSUB AI Agent | Page ${page + 1} of ${pageCount}`, doc.page.margins.left, y, {
        align: 'right',
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      })
  }
}

export async function buildReportPdfBuffer(input: BuildReportPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 40, right: 44, bottom: 44, left: 44 },
    info: {
      Title: input.title,
      Author: 'CSUB AI Agent',
      Subject: 'CSUB project intelligence report',
    },
    bufferPages: true,
  })

  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []

    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('error', (error) => reject(error))
    doc.on('pageAdded', () => {
      drawPageBackground(doc)
    })

    doc.on('end', () => {
      resolve(Buffer.concat(chunks))
    })

    drawPageBackground(doc)
    writeHeader(doc, input)
    writeMarkdown(doc, input.markdown)
    writeFooter(doc)
    doc.end()
  })
}
